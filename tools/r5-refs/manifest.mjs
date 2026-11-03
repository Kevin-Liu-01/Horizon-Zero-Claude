/**
 * reference/r5/<lane>/MANIFEST.md — read and write (gates-perf W0b; plan §10.2 item 4).
 *
 * READ — header-driven (W0b targeted fix round 1; engineering-judge finding: the parser read only gates-perf's own
 * table, so main's brand MANIFEST parsed as 0 rows). Every Markdown table of the file is read by its column NAMES, so
 * each lane's own layout parses: gates-perf's (below), brand's `| file | used by | what to compare | author |
 * source URL | licence | retrieved |`, hero-body's `| file | gates | what | source | licence | made | sha256 |`.
 *
 *   column      header names accepted (case-insensitive)      value
 *   file        file                                         the cell, backticks stripped
 *   gates       gates | used by | gate | serves              every gate id in the cell (V…, A-…)
 *   subject     subject | what to compare | what             the cell
 *   author      author | by | creator                        the cell; see authorOf below when there is no column
 *   source      source | source url | url                    the first http(s) URL in the cell, else the cell text
 *   licence     licence | license                            normalised by licence.mjs normaliseLicence()
 *   retrieved   retrieved | made | date                      the cell
 *   sha256, slot, attribution, why: optional columns
 *
 * Plan §10.2 item 4 requires source URL, author, licence and retrieved date; slot, gates, subject, sha256 and
 * attribution are optional (a row with no sha256 is hashed at verify time; a CC BY row's attribution may be a
 * `(attribution: …)` note in its licence cell). A cell that reads "same", "ditto" or "〃" takes the previous row's value.
 *
 * Row classes:
 *   stored     the file cell names an image (jpg / png / webp / gif / tiff / avif)
 *   url-only   the file cell or the licence says "URL only" / "not stored", the licence is share-alike, or the table sits
 *              under a "URL only" heading and has no file column (gates-perf's `| slot | gates | source | licence | why |`)
 *   note       any other row of a table with a file column (a spec, a pointer: no image, nothing to verify)
 * Tables with neither a file nor a slot column (hero-body's `| gate | reference |` pointers) are not rows of the set.
 *
 * Author when the table has no author column: a project-original render or own photo is the project's own work
 * (author = the lane that made it); a source on a creator-hosted page names its creator (`<name>.itch.io`,
 * `github.com/<name>`). Anything else has no author and verify() reports it.
 *
 * WRITE (the fetcher writes gates-perf's own folder) — fixed headers:
 *   ## Stored
 *   | file | slot | gates | subject | author | licence | source | retrieved | sha256 | attribution |
 *   ## URL only (share-alike or unclear; never stored)
 *   | slot | gates | source | licence | why |
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { normaliseLicence } from './licence.mjs';

export const STORED_HEADER = '| file | slot | gates | subject | author | licence | source | retrieved | sha256 | attribution |';
export const URL_HEADER = '| slot | gates | source | licence | why |';
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
export const IMAGE_RE = /\.(jpe?g|png|webp|gif|tiff?|avif)$/i;

/** column name -> field (first alias that a header carries wins) */
const COLUMNS = {
  file: ['file'], slot: ['slot'], gates: ['gates', 'used by', 'gate', 'serves'], subject: ['subject', 'what to compare', 'what'],
  author: ['author', 'by', 'creator'], source: ['source', 'source url', 'url'], licence: ['licence', 'license'],
  retrieved: ['retrieved', 'made', 'date'], sha256: ['sha256'], attribution: ['attribution'], why: ['why'],
};
const DITTO = /^(same|ditto|〃|")$/i;
const EMPTY = /^(—|-|–|n\/a|)$/i;

/** split one table line into cells (an escaped `\|` stays inside its cell) */
export function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}
const unquote = (s) => String(s ?? '').trim().replace(/^`+|`+$/g, '').trim();
const firstUrl = (s) => (/(https?:\/\/[^\s)`'"<>]+)/.exec(String(s ?? '')) || [])[1] || null;
export const gateIdsOf = (s) => [...new Set([...String(s ?? '').matchAll(/\b(?:[VA](?:\d+[a-z]?)?(?:-[A-Za-z0-9]+)+|V\d+[a-z]?)\b/g)].map((m) => m[0]))];

/** the creator a creator-hosted source page names, else '' */
export function creatorOfSource(source) {
  const u = firstUrl(source);
  if (!u) return '';
  let h;
  try { h = new URL(u); } catch { return ''; }
  const itch = /^([a-z0-9-]+)\.itch\.io$/i.exec(h.hostname);
  if (itch) return `${itch[1]} (itch.io creator page)`;
  const gh = /^\/([A-Za-z0-9-]+)\//.exec(h.pathname);
  if (/^github\.com$/i.test(h.hostname) && gh) return `${gh[1]} (GitHub)`;
  return '';
}

/** every Markdown table of a text: [{ heading, header[], rows[][] , line }] */
export function tablesOf(text) {
  const lines = String(text).split('\n');
  const out = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^#{1,6}\s/.test(l)) { heading = l.replace(/^#+\s*/, ''); continue; }
    if (!l.startsWith('|') || !/^\|\s*:?-{3,}/.test((lines[i + 1] || '').trim())) continue;
    const header = splitRow(l).map((h) => h.toLowerCase().replace(/`/g, '').trim());
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) rows.push(splitRow(lines[j]));
    out.push({ heading, header, rows, line: i + 1 });
    i = j - 1;
  }
  return out;
}

/**
 * Parse a MANIFEST text -> { stored[], urlOnly[], notes[], tables[] }. `lane` names the folder (author of a
 * project-original row). Every row keeps `raw` (its cells by header) and `table` (the 1-based line of its header).
 */
export function parseManifest(text, lane = '') {
  const stored = [], urlOnly = [], notes = [], tables = [];
  for (const t of tablesOf(text)) {
    const col = {};
    for (const [field, names] of Object.entries(COLUMNS)) { const k = t.header.findIndex((h) => names.includes(h)); if (k >= 0) col[field] = k; }
    const urlHeading = /url[- ]only/i.test(t.heading);
    const kind = col.file !== undefined ? 'files' : (col.slot !== undefined && (urlHeading || col.why !== undefined)) ? 'url-only' : 'other';
    tables.push({ line: t.line, heading: t.heading, header: t.header, kind, rows: t.rows.length });
    if (kind === 'other') continue;
    const prev = {};
    for (const cells of t.rows) {
      const get = (f) => {
        if (col[f] === undefined) return '';
        let v = unquote(cells[col[f]]);
        if (DITTO.test(v)) v = prev[f] ?? '';
        prev[f] = v;
        return v;
      };
      const raw = Object.fromEntries(t.header.map((h, k) => [h, cells[k] ?? '']));
      const fileCell = get('file'), slotCell = get('slot'), licCell = get('licence'), sourceCell = get('source');
      const lic = normaliseLicence(licCell);
      const sourceUrl = firstUrl(sourceCell);
      const attribution = (() => { const a = get('attribution'); return a && !EMPTY.test(a) ? a : (lic.attribution || ''); })();
      const base = { gates: gateIdsOf(get('gates')), subject: get('subject'), source: sourceUrl || sourceCell, sourceText: sourceCell,
        licence: lic.code, licenceText: licCell, licenceClass: lic.cls, retrieved: EMPTY.test(get('retrieved')) ? '' : get('retrieved'),
        attribution, raw, table: t.line };
      if (kind === 'url-only') { urlOnly.push({ ...base, slot: slotCell, file: '', why: get('why') }); continue; }
      const isImage = IMAGE_RE.test(fileCell);
      const saysUrlOnly = /url[- ]only|not stored/i.test(fileCell) || /not stored/i.test(licCell) || lic.cls === 'url-only' || lic.cls === 'refused';
      if (!isImage) {
        if (saysUrlOnly) urlOnly.push({ ...base, slot: slotCell || '', file: '', why: fileCell });
        else notes.push({ ...base, file: fileCell });
        continue;
      }
      let author = get('author');
      let authorFrom = 'column';
      if (EMPTY.test(author)) author = '';
      if (!author && (lic.code === 'project-original' || lic.code === 'own-photo')) { author = `CALIMA project, lane ${lane || '?'} (${lic.code})`; authorFrom = 'project-original'; }
      if (!author) { author = creatorOfSource(sourceCell); authorFrom = author ? 'source page' : 'none'; }
      const sha = get('sha256');
      stored.push({ ...base, file: fileCell, slot: slotCell || fileCell.replace(IMAGE_RE, ''), author, authorFrom,
        sha256: /^[0-9a-f]{64}$/i.test(sha) ? sha.toLowerCase() : '' });
    }
  }
  return { stored, urlOnly, notes, tables };
}

/** -> { file, exists, stored[], urlOnly[], notes[], tables[], text } */
export function readManifest(dir) {
  const f = path.join(dir, 'MANIFEST.md');
  if (!existsSync(f)) return { file: f, exists: false, stored: [], urlOnly: [], notes: [], tables: [] };
  const text = readFileSync(f, 'utf8');
  return { file: f, exists: true, ...parseManifest(text, path.basename(dir)), text };
}

export function renderManifest({ lane, intro, stored, urlOnly }) {
  return [
    `# reference/r5/${lane} — licence-clean reference set`,
    '',
    intro,
    '',
    'Fetched by `node tools/r5-refs/fetch.mjs --fetch --lane ' + lane + '` from the Wikimedia Commons API, filtered to',
    'PD / CC0 / CC BY (plan §10.2). Share-alike or unclear sources are listed as URLs only and never stored.',
    'Stored files are re-encoded JPEGs (≤ 1280 px wide, metadata stripped); `sha256` is of the stored bytes.',
    'Never shipped (not under `public/`). Verify offline: `node tools/r5-refs/fetch.mjs --verify`.',
    '',
    '## Stored',
    '',
    STORED_HEADER,
    '|---|---|---|---|---|---|---|---|---|---|',
    ...stored.map((r) => '| ' + [r.file, r.slot, r.gates.join(' '), r.subject, r.author, r.licence, r.source, r.retrieved, r.sha256, r.attribution || '—'].map(esc).join(' | ') + ' |'),
    '',
    '## URL only (share-alike or unclear; never stored)',
    '',
    URL_HEADER,
    '|---|---|---|---|---|',
    ...urlOnly.map((r) => '| ' + [r.slot, r.gates.join(' '), r.source, r.licence, r.why].map(esc).join(' | ') + ' |'),
    '',
  ].join('\n');
}

/** every lane folder under reference/r5 */
export function laneFolders(root) {
  const base = path.join(root, 'reference', 'r5');
  try { return readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => ({ lane: e.name, dir: path.join(base, e.name) })); }
  catch { return []; }
}

/**
 * Parser self-test (A-reference-set runs it): one table in each lane layout the set holds, with a known answer,
 * plus negative cases a parser that read only one layout would fail.
 */
export const PARSER_CONTROLS = [
  { name: 'gates-perf layout', lane: 'gates-perf', text: `## Stored\n\n${STORED_HEADER}\n|---|---|---|---|---|---|---|---|---|---|\n| a.jpg | a | V1-x V2-y | s | Ann | CC-BY-2.0 | https://commons.wikimedia.org/wiki/File:A.jpg | 2026-10-19 | ${'ab'.repeat(32)} | "A" by Ann, CC BY 2.0 |\n\n## URL only (share-alike or unclear; never stored)\n\n${URL_HEADER}\n|---|---|---|---|---|\n| b | V3-z | https://commons.wikimedia.org/wiki/File:B.jpg | CC BY-SA 4.0 | share-alike |\n`,
    want: { stored: [{ file: 'a.jpg', gates: ['V1-x', 'V2-y'], author: 'Ann', licence: 'CC-BY-2.0', retrieved: '2026-10-19', sha256: 'ab'.repeat(32), attribution: '"A" by Ann, CC BY 2.0' }], urlOnly: 1, notes: 0 } },
  { name: 'brand layout (main)', lane: 'brand', text: '| file | used by | what to compare | author | source URL | licence | retrieved |\n|---|---|---|---|---|---|---|\n| `p.jpg` | V-logo, V-logo-4k | caps | Bodoni | https://commons.wikimedia.org/wiki/File:P.jpg | Public domain | 2026-10-19 |\n| `q.jpg` | V38-title | sky | Javier | https://commons.wikimedia.org/wiki/File:Q.jpg | CC BY 3.0 (attribution: "Q" by Javier, CC BY 3.0) | 2026-10-19 |\n| (URL only, CC BY-SA 4.0) | V38-title (target) | surf | X | https://commons.wikimedia.org/wiki/File:R.jpg | CC BY-SA 4.0 — not stored | 2026-10-19 |\n| (spec, no image) | V-loading | rule | — | `docs/ROUND5-BIBLE.md` §9.8 | project text | — |\n',
    want: { stored: [{ file: 'p.jpg', gates: ['V-logo', 'V-logo-4k'], author: 'Bodoni', licence: 'PD', retrieved: '2026-10-19', sha256: '', attribution: '' },
      { file: 'q.jpg', gates: ['V38-title'], author: 'Javier', licence: 'CC-BY-3.0', retrieved: '2026-10-19', sha256: '', attribution: '"Q" by Javier, CC BY 3.0' }], urlOnly: 1, notes: 1 } },
  { name: 'hero-body layout (project-original + non-Commons CC0, "same")', lane: 'hero', text: `## Stored\n\n| file | gates | what | source | licence | made | sha256 |\n|---|---|---|---|---|---|---|\n| s.png | V-brea-face | sheet | live build render (\`x\`) | project-original | 2026-10-23 | \`${'cd'.repeat(32)}\` |\n| u.png | A-face-delta (visual) | stock | Base Characters, https://quaternius.itch.io/ubc | CC0-1.0 (render of a CC0 model) | 2026-10-19 | \`${'ef'.repeat(32)}\` |\n| v.png | V-brea-face | profile | same | CC0-1.0 | 2026-10-19 | \`${'01'.repeat(32)}\` |\n\n## Pointers\n\n| gate | reference |\n|---|---|\n| V1 | x |\n`,
    want: { stored: [{ file: 's.png', gates: ['V-brea-face'], author: 'CALIMA project, lane hero (project-original)', licence: 'project-original', retrieved: '2026-10-23', sha256: 'cd'.repeat(32), attribution: '' },
      { file: 'u.png', gates: ['A-face-delta'], author: 'quaternius (itch.io creator page)', licence: 'CC0-1.0', retrieved: '2026-10-19', sha256: 'ef'.repeat(32), attribution: '' },
      { file: 'v.png', gates: ['V-brea-face'], author: 'quaternius (itch.io creator page)', licence: 'CC0-1.0', retrieved: '2026-10-19', sha256: '01'.repeat(32), attribution: '' }], urlOnly: 0, notes: 0 } },
];
export function parserSelfTest() {
  const keys = ['file', 'gates', 'author', 'licence', 'retrieved', 'sha256', 'attribution'];
  const cases = PARSER_CONTROLS.map((c) => {
    const m = parseManifest(c.text, c.lane);
    const diffs = [];
    if (m.stored.length !== c.want.stored.length) diffs.push(`stored ${m.stored.length} != ${c.want.stored.length}`);
    c.want.stored.forEach((w, i) => { const g = m.stored[i] || {}; for (const k of keys) if (JSON.stringify(g[k]) !== JSON.stringify(w[k])) diffs.push(`row ${i} ${k}: ${JSON.stringify(g[k])} != ${JSON.stringify(w[k])}`); });
    if (m.urlOnly.length !== c.want.urlOnly) diffs.push(`urlOnly ${m.urlOnly.length} != ${c.want.urlOnly}`);
    if (m.notes.length !== c.want.notes) diffs.push(`notes ${m.notes.length} != ${c.want.notes}`);
    return { name: c.name, ok: diffs.length === 0, diffs };
  });
  // NEGATIVE: the fix-round-3 parser (one exact header) read the brand layout as 0 rows; this one must not, and a table
  // with no file / slot column must give no row
  const none = parseManifest('| gate | reference |\n|---|---|\n| V1 | a.jpg |\n', 'x');
  cases.push({ name: 'negative: a pointer table is no row', ok: none.stored.length + none.urlOnly.length + none.notes.length === 0, diffs: [] });
  return { ok: cases.every((c) => c.ok), cases };
}
