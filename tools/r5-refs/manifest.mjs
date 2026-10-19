/**
 * reference/r5/<lane>/MANIFEST.md — read and write (gates-perf W0b; plan §10.2 item 4).
 *
 * Two tables per lane folder, with fixed headers so tools and gates can parse them:
 *
 *   ## Stored
 *   | file | slot | gates | subject | author | licence | source | retrieved | sha256 | attribution |
 *   ## URL only (share-alike or unclear; never stored)
 *   | slot | gates | source | licence | why |
 *
 * A row's `file` is relative to its folder; `gates` lists the gate ids the slot serves. `sha256` is of
 * the stored bytes. `attribution` is required for CC-BY rows and is the exact credit string.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

export const STORED_HEADER = '| file | slot | gates | subject | author | licence | source | retrieved | sha256 | attribution |';
export const URL_HEADER = '| slot | gates | source | licence | why |';
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(' | ').map((c) => c.trim().replace(/\\\|/g, '|'));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** -> { stored: [{ file, slot, gates[], subject, author, licence, source, retrieved, sha256, attribution }], urlOnly: [...], text } */
export function readManifest(dir) {
  const f = path.join(dir, 'MANIFEST.md');
  if (!existsSync(f)) return { file: f, exists: false, stored: [], urlOnly: [] };
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const take = (header) => {
    const at = lines.findIndex((l) => l.trim() === header);
    if (at < 0) return [];
    const out = [];
    for (let i = at + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) out.push(cells(lines[i]));
    return out;
  };
  const stored = take(STORED_HEADER).map(([file, slot, gates, subject, author, licence, source, retrieved, sha256, attribution]) => ({
    file, slot, gates: (gates || '').split(/[ ,]+/).filter(Boolean), subject, author, licence, source, retrieved, sha256,
    attribution: attribution === '—' ? '' : attribution }));
  const urlOnly = take(URL_HEADER).map(([slot, gates, source, licence, why]) => ({ slot, gates: (gates || '').split(/[ ,]+/).filter(Boolean), source, licence, why }));
  return { file: f, exists: true, stored, urlOnly, text };
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
