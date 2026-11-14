// @ts-check
/**
 * Tier 0 name lint.
 *
 *   node tools/tier0/namelint.mjs [--tree <dir>] [--words <file>] [--files] [--json]
 *
 * The TERM LIST is private. It is read from $CALIMA_LINT_WORDS, else --words, else
 * ~/.calima-r5/plan-v2/lint-words.txt. On a machine without it the lint is SKIPPED and says so.
 * Exemptions (engine identifiers, path segments, deferred files) are in tools/lint/allow.json.
 *
 * Scope: tracked + untracked-not-ignored files under src/, public/, tools/, docs/ and index.html.
 *   - every file NAME is checked against the `anywhere` and `names` terms;
 *   - text files are read; JS is split into code / comment / string (lib/scanjs.mjs), other text is one block;
 *   - `player-visible` terms are checked only in strings that read as player-facing: a JS string under src/
 *     that contains a space or starts with a capital letter and is not a console / Error message, and
 *     the text of index.html. (The boot, when it runs, also reads the rendered page text.)
 */
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listFiles } from './lib/files.mjs';
import { parseWordList, makeMatcher } from './lib/words.mjs';
import { scanJs } from './lib/scanjs.mjs';

const TEXT = /\.(m?js|cjs|json|md|txt|html|css|svg|glsl|wgsl|vert|frag|csv|ya?ml|patch)$/i;
const SCOPE = ['src', 'public', 'tools', 'docs', 'index.html'];

/** Where the private word list is. */
export function wordListPath(argv = process.argv) {
  if (process.env.CALIMA_LINT_WORDS) return process.env.CALIMA_LINT_WORDS;
  const i = argv.indexOf('--words');
  if (i > 0 && argv[i + 1]) return argv[i + 1];
  return path.join(os.homedir(), '.calima-r5', 'plan-v2', 'lint-words.txt');
}

/** @param {string} root */
export function loadAllow(root) {
  const p = path.join(root, 'tools/lint/allow.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return {
    words: new Set((j.identifiers?.words || []).map((/** @type {string} */ w) => w.toLowerCase())),
    exact: /** @type {string[]} */ (j.identifiers?.exact || []),
    apiStrings: /** @type {string[]} */ (j.identifiers?.apiStrings || []),
    segments: /** @type {string[]} */ (j.paths?.segments || []),
    deferred: /** @type {{path:string, until:string, why:string}[]} */ (j.deferred?.entries || []),
  };
}

const DEV_MESSAGE = /(console\.\w+|Error|assert\w*|warn|debug)\s*\(\s*$/;

/**
 * Lint one file's text. Pure apart from its inputs.
 * @param {string} rel
 * @param {string} src
 * @param {{ any: (s: string) => string[], visible: (s: string) => string[] }} m
 * @param {ReturnType<typeof loadAllow>} allow
 * @returns {{ term: string, ctx: string, line: number }[]}
 */
export function lintText(rel, src, m, allow) {
  /** @type {{ term: string, ctx: string, line: number }[]} */
  const hits = [];
  const isJs = /\.(m?js|cjs)$/i.test(rel);
  if (rel === 'tools/lint/allow.json') {
    // the allow-list must spell what it allows: its own quoted entries are not hits (its prose still is)
    for (const e of [...allow.words, ...allow.exact, ...allow.apiStrings]) src = src.split(`"${e}"`).join('""');
  }
  if (!isJs) {
    const lines = src.split('\n');
    lines.forEach((ln, k) => {
      for (const t of m.any(ln)) hits.push({ term: t, ctx: 'text', line: k + 1 });
      if (rel === 'index.html') for (const t of m.visible(ln)) hits.push({ term: t, ctx: 'visible', line: k + 1 });
    });
    return hits;
  }
  const exactRe = allow.exact.length ? new RegExp(`\\b(?:${allow.exact.map((e) => e.replace(/[$]/g, '\\$')).join('|')})\\b`, 'g') : null;
  const segs = scanJs(src);
  let prevCode = '';
  for (const s of segs) {
    const segLines = s.text.split('\n');
    segLines.forEach((ln, k) => {
      const line = s.line + k;
      if (s.ctx === 'code') {
        const text = exactRe ? ln.replace(exactRe, ' ') : ln;
        for (const t of m.any(text)) if (!allow.words.has(t.toLowerCase())) hits.push({ term: t, ctx: 'code', line });
      } else if (s.ctx === 'string') {
        const inner = s.text.slice(1, -1).trim();
        const keyLike = allow.words.has(inner.toLowerCase()) || allow.exact.includes(inner) || allow.apiStrings.includes(inner);
        const idLike = /^[\w./:-]+$/.test(inner);   // an id or path ('trap-x', 'status/x.ogg'), not prose
        if (!keyLike) for (const t of m.any(ln)) if (!(idLike && allow.words.has(t.toLowerCase()))) hits.push({ term: t, ctx: 'string', line });
        const prose = /\s/.test(inner) || /^[A-Z]/.test(inner);
        if (rel.startsWith('src/') && prose && !keyLike && !DEV_MESSAGE.test(prevCode)) {
          for (const t of m.visible(ln)) hits.push({ term: t, ctx: 'visible', line });
        }
      } else {
        for (const t of m.any(ln)) hits.push({ term: t, ctx: 'comment', line });
      }
    });
    if (s.ctx === 'code') prevCode = (prevCode + s.text).slice(-200);
  }
  return hits;
}

/**
 * @param {{ root: string, argv?: string[], listFilesToo?: boolean }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult>}
 */
export async function run({ root, argv = process.argv }) {
  const t0 = Date.now();
  const wl = wordListPath(argv);
  if (!existsSync(wl)) {
    return { id: 'name-lint', status: 'SKIP', summary: `private word list not found at ${wl}: name lint NOT run (this machine has no term list)`, failures: [], ms: Date.now() - t0 };
  }
  const list = parseWordList(readFileSync(wl, 'utf8'));
  const m = { any: makeMatcher([...list.anywhere, ...list.names]), visible: makeMatcher(list.playerVisible) };
  const allow = loadAllow(root);
  const files = listFiles(root, SCOPE);
  /** @type {Record<string, { n: number, terms: Record<string, number>, deferred?: string, first: number }>} */
  const byFile = {};
  /** @type {Record<string, number>} */
  const byTerm = {};
  /** @type {Record<string, number>} */
  const byCtx = {};
  const pathHits = [];
  let total = 0;
  let deferredTotal = 0;
  for (const f of files) {
    const def = allow.deferred.find((d) => f === d.path || (d.path.endsWith('/') && f.startsWith(d.path)));
    /** @type {{ term: string, ctx: string, line: number }[]} */
    const hits = [];
    let name = f;
    for (const seg of allow.segments) name = name.split(seg).join('/');
    for (const t of m.any(name)) hits.push({ term: t, ctx: 'path', line: 0 });
    if (TEXT.test(f)) {
      let src = '';
      try { src = readFileSync(path.join(root, f), 'utf8'); } catch { /* unreadable: path check only */ }
      hits.push(...lintText(f, src, m, allow));
    }
    if (!hits.length) continue;
    const terms = /** @type {Record<string, number>} */ ({});
    for (const h of hits) terms[h.term] = (terms[h.term] || 0) + 1;
    byFile[f] = { n: hits.length, terms, first: hits[0].line, ...(def ? { deferred: def.until } : {}) };
    if (def) { deferredTotal += hits.length; continue; }
    total += hits.length;
    for (const h of hits) {
      byTerm[h.term] = (byTerm[h.term] || 0) + 1;
      byCtx[h.ctx] = (byCtx[h.ctx] || 0) + 1;
      if (h.ctx === 'path') pathHits.push(f);
    }
  }
  /** @type {Record<string, number>} */
  const byTop = {};
  for (const [f, v] of Object.entries(byFile)) if (!v.deferred) {
    const top = f.split('/').length > 2 ? f.split('/').slice(0, 2).join('/') : f.split('/')[0];
    byTop[top] = (byTop[top] || 0) + v.n;
  }
  const failing = Object.entries(byFile).filter(([, v]) => !v.deferred).sort((a, b) => b[1].n - a[1].n);
  const failures = failing.map(([f, v]) => `${f}:${v.first} ${v.n} (${Object.entries(v.terms).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join(', ')})`);
  const deferred = Object.entries(byFile).filter(([, v]) => v.deferred).map(([f, v]) => `${f}: ${v.n} (until ${v.deferred})`);
  return {
    id: 'name-lint',
    status: total === 0 ? 'PASS' : 'FAIL',
    summary: `${total} listed-term hits in ${failing.length} files (${files.length} files scanned; ${list.anywhere.length + list.names.length + list.playerVisible.length} terms from the private list)` +
      (deferredTotal ? `; DEFERRED ${deferredTotal} in ${deferred.length} files held to R4b by tools/lint/allow.json` : ''),
    failures,
    notes: [
      `by area: ${JSON.stringify(Object.fromEntries(Object.entries(byTop).sort((a, b) => b[1] - a[1])))}`,
      `by context: ${JSON.stringify(byCtx)}`,
      `by term: ${JSON.stringify(Object.fromEntries(Object.entries(byTerm).sort((a, b) => b[1] - a[1])))}`,
      ...(pathHits.length ? [`file names: ${pathHits.join(', ')}`] : []),
      ...deferred.map((d) => `DEFERRED ${d}`),
    ],
    details: { total, deferredTotal, byTerm, byCtx, byTop, wordList: 'private (not printed)' },
    ms: Date.now() - t0,
  };
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const { treeRoot } = await import('./lib/files.mjs');
  const r = await run({ root: treeRoot() });
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`${r.status} name-lint: ${r.summary}`);
    for (const n of r.notes || []) console.log('  ' + n);
    for (const f of r.failures) console.log('  - ' + f);
  }
  process.exitCode = r.status === 'FAIL' ? 1 : 0;
}
