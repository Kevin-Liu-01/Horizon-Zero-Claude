/**
 * CALIMA name lint (lane `brand`, plan §7.4 and §9 A-no-horizon-terms-*).
 *
 *   node tools/lint/namecheck.mjs --player [--dom <harvest.json>] [--json]
 *   node tools/lint/namecheck.mjs --code [--json]
 *   node tools/lint/namecheck.mjs --record [--initial]   lower engine-allow caps (or record them once)
 *   node tools/lint/namecheck.mjs --rebuild-lexicon
 *
 * THE UNION LEXICON (`lexicon.json` → `plan`, built from tools/lint/lexicon/*),
 * exactly as bible §10.4 and plan §9 define it — 410 distinct entries:
 *   A  Direction A's `horizon-lexicon.txt` (355 lines) through A's own tokenizer
 *      (Direction A's own namecheck.py: every line lower-cased, plus every
 *      part >= 4 characters after splitting on space / slash / brackets /
 *      hyphen): 331 entries — "A's 331"
 *   B  Direction B's names (`names-check.mjs` HORIZON, >= 3 characters, B's own
 *      filter): 189, and its 46 phrases (MULTI) — "B's 235": B's write-up
 *      (docs/research/round5-direction-b.md:17) counts "235 Horizon names and
 *      terms (189 single words, 46 phrases)", so plan §9's "B's 235 + 46
 *      phrases" names the 46 phrases twice; every one of them is here
 *   +  the plan §9 additions: Brittle, Impact, Tear, Frost, Lens, Shards,
 *      Stalker, Watcher, Grazer, Charger, Burrower, Rollerback, Saltbite,
 *      Call of the Mountain, Camp.
 * (The bible prints "417 tokens"; the files reproduce 410 after lower-case
 * de-duplication. Both direction sources are byte-copies, checked at build:
 * A by its SHA-256, pinned when it was verified byte-identical to Direction A's
 * file (W0b; plan §8.3 R40 retires the POC folder, so the lint names no path
 * in it), B against its source while that file exists.)
 *
 * THE GRADED READING (`plan`, plan §9 / bible §10.4 "A's rules"): every DOM
 * word, id part or table key is compared with EVERY union entry —
 *   exact      the word equals the entry
 *   substring  either contains the other, both >= 5 characters
 *   edit <= 1  Levenshtein distance <= 1, both >= 5 characters
 * plus every multi-word name as a contiguous word sequence. Allowlist: bible
 * §10.4's GENERIC nouns only (lance, cliff, shelf, salt, glaze, arrow, and
 * their plurals). Nothing else is exempt: A's split-off words (of, end, run,
 * light, world, title …) and the edit-1 neighbours (blade/blaze, brace/brave)
 * are hits, as the plan wrote it. Unit: one per distinct (surface, offending
 * word or phrase); a surface that says a word ten times holds it once.
 *
 * THE ADVISORY READING (`named`, reported beside the graded count, never
 * graded): only the Horizon NAMES alone — exact, or the name inside a longer
 * word (both >= 5) — with A's split-off English words matched only inside
 * their multi-word name (Direction B's rule). It shows how much of the graded
 * count is English rather than Horizon (docs/ROUND5-BRAND.md, ruling request).
 *
 * --player  public/**\/*.{json,md,txt} (all of it, licence texts included) here
 *           in node; the rendered DOM text, content ids and content-table keys
 *           come from the gate A-no-horizon-terms-player (page context), which
 *           calls the same matcher (`matchTexts`, serialisable) and folds both.
 * --code    identifiers and strings (comments stripped) in src/**, index.html
 *           and tools/** except tools/lint/**, matched with the NAMED reading
 *           (plan §9 gives the code lint no matching rule; §7.4's allowlist
 *           lists engine NAMES — machine(s), tear/impact, lens, focus,
 *           hunter-camp, spear — not English words). A hit is a distinct
 *           (lexicon term, code token) pair; raw occurrences are reported too.
 *           Every hit must be covered by an entry of tools/lint/engine-allow.json
 *           and no entry may exceed its cap (a count of distinct pairs), so
 *           USING a kept engine identifier again never moves the count, while
 *           coining a new Horizon-named identifier does.
 */
import { readFileSync, writeFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LINT = path.join(ROOT, 'tools/lint');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/** bible §10.4 accepted generic nouns */
export const GENERIC = ['lance', 'cliff', 'shelf', 'salt', 'glaze', 'arrow'];
/** plan §9 A-no-horizon-terms-player additions */
export const PLAN_ADDITIONS = ['Brittle', 'Impact', 'Tear', 'Frost', 'Lens', 'Shards', 'Stalker', 'Watcher', 'Grazer',
  'Charger', 'Burrower', 'Rollerback', 'Saltbite', 'Call of the Mountain', 'Camp'];
/**
 * SHA-256 of `tools/lint/lexicon/direction-a.txt`, pinned at W0b fix round 3 after the copy was checked
 * byte-identical to Direction A's horizon-lexicon.txt (main 148f007). The lexicon build compares the copy with
 * this hash instead of reading the POC folder (plan §8.3 R40).
 */
export const DIRECTION_A_SHA256 = 'b58b5a22d7214f4eeede5a3b6c3ebca4457890a229cab9ea23e3f4f9c5e92b4a';
/** plan §9 A-ui-words terms (always matched alone) */
export const UI_WORDS = ['tear', 'impact', 'brittle', 'focus', 'override', 'concentration', 'datapoint', 'datapoints',
  'shard', 'shards', 'medicine', 'tallneck', 'cauldron', 'machine', 'machines', 'camp'];
/**
 * Dictionary words that are Horizon element / mechanic / character names and so
 * stay "name" (matched alone): the element set CALIMA replaced (acid, adhesive,
 * plasma, shock), the bow mechanic (overdraw), the characters (erik, gerard,
 * travis, ted, nemesis).
 */
export const PROTECT = ['acid', 'adhesive', 'plasma', 'shock', 'overdraw', 'erik', 'gerard', 'travis', 'ted', 'nemesis'];

/** lower-case, drop apostrophes, drop spaces and hyphens (B's normalisation) */
export const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[’'‘`]/g, '').replace(/[\s\-_]/g, '');

/* ------------------------------------------------------------------ build */

function parseA() {
  const out = [];
  let section = null;
  for (const raw of rd('tools/lint/lexicon/direction-a.txt').split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('## ')) { section = l.slice(3).trim(); continue; }
    if (l.startsWith('#')) continue;
    out.push({ line: l, section });
  }
  return out;
}

/** "Critical Strike/Hit" -> ["Critical Strike", "Critical Hit"]; "Brave/Seeker/Outcast" -> 3; "(…)" annotations dropped */
function expandLine(line) {
  const l = line.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (!l.includes('/')) return [l];
  const words = l.split(/\s+/);
  const at = words.findIndex((w) => w.includes('/'));
  if (at < 0) return [l];
  const alts = words[at].split('/');
  return alts.map((a) => [...words.slice(0, at), a, ...words.slice(at + 1)].join(' ').trim()).filter(Boolean);
}

export function buildLexicon({ dictionary = '/usr/share/dict/web2' } = {}) {
  const A = parseA();
  const B = JSON.parse(rd('tools/lint/lexicon/direction-b.json'));
  const dict = new Set(readFileSync(dictionary, 'utf8').split('\n').map((w) => w.trim().toLowerCase()));
  const isDict = (w) => dict.has(w) || (w.endsWith('s') && dict.has(w.slice(0, -1))) || (w.endsWith('es') && dict.has(w.slice(0, -2)));
  const entries = new Map();              // norm -> { t, src:Set }
  const phrases = new Map();              // words.join(' ') -> { t, words, src:Set }
  const addTok = (t, src) => {
    const n = norm(t);
    if (!n) return;
    if (!entries.has(n)) entries.set(n, { t, src: new Set(), multi: false });
    const e = entries.get(n);
    e.src.add(src);
    if (/[\s/()]/.test(t.trim())) e.multi = true;      // a whole multi-word line of A's file
  };
  const addPhrase = (t, src) => {
    const words = t.toLowerCase().replace(/[’']/g, '').split(/[\s\-]+/).map(norm).filter(Boolean);
    if (words.length < 2) { addTok(t, src); return; }
    const k = words.join(' ');
    if (!phrases.has(k)) phrases.set(k, { t, words, src: new Set() });
    phrases.get(k).src.add(src);
  };
  // A: namecheck.py's tokenizer — the whole line, plus every part >= 4 characters
  const trackedSingle = new Set();
  for (const { line, section } of A) {
    addTok(line, `A:${section}`);
    for (const p of line.split(/[ /()\-]+/)) if (p.length >= 4) addTok(p, `A:${section}`);
    for (const alt of expandLine(line)) {
      if (/\s/.test(alt)) addPhrase(alt, `A:${section}`);
      else if (section === 'tracked') trackedSingle.add(norm(alt));
    }
  }
  // B: single names >= 3 characters, and the phrases
  for (const w of B.names) if (w.length >= 3) addTok(w, 'B');
  for (const p of B.phrases) addPhrase(p, 'B');
  for (const w of PLAN_ADDITIONS) (/\s/.test(w) ? addPhrase : addTok)(w, 'plan');
  const protectedSet = new Set([...trackedSingle, ...B.names.map(norm), ...PLAN_ADDITIONS.map(norm), ...UI_WORDS.map(norm), ...PROTECT]);
  const tokens = [];
  for (const [n, e] of entries) {
    // A's whole-line entries that carry spaces, slashes or notes are matched as their phrases
    if (e.multi || /[^a-z0-9]/.test(n)) { tokens.push({ n, t: e.t, cls: 'line', src: [...e.src] }); continue; }
    const cls = n.length < 3 ? 'short'
      : protectedSet.has(n) ? 'name'
        : isDict(n) ? 'common' : 'name';
    tokens.push({ n, t: e.t, cls, src: [...e.src] });
  }
  tokens.sort((a, b) => a.n.localeCompare(b.n));
  const ph = [...phrases.values()].map((p) => ({ words: p.words, t: p.t, src: [...p.src] })).sort((a, b) => a.words.join(' ').localeCompare(b.words.join(' ')));
  const count = (c) => tokens.filter((x) => x.cls === c).length;

  // ---- the plan §9 union (the GRADED lexicon): A's tokenizer verbatim + B + the additions
  const planMap = new Map();               // lower-case entry -> { t, src:Set }
  const addPlan = (t, src) => {
    const l = String(t).toLowerCase();
    if (!planMap.has(l)) planMap.set(l, { t, src: new Set() });
    planMap.get(l).src.add(src);
  };
  for (const { line } of A) {               // namecheck.py: lex.add(line.lower()); parts >= 4
    addPlan(line, 'A');
    for (const p of line.split(/[ /()\-]+/)) if (p.length >= 4) addPlan(p, 'A');
  }
  const aEntries = new Set([...planMap.keys()]).size;
  const bSingles = B.names.filter((w) => w.length >= 3);    // names-check.mjs: terms >= 3 characters
  for (const w of bSingles) addPlan(w, 'B');
  for (const p of B.phrases) addPlan(p, 'B-phrase');
  for (const w of PLAN_ADDITIONS) addPlan(w, 'plan');
  const plan = [...planMap.entries()].map(([l, e]) => ({ n: norm(l), len: l.length, t: e.t, src: [...e.src].sort() }))
    .sort((a, b) => a.n.localeCompare(b.n) || a.len - b.len);
  // byte-copy checks of the two direction sources: A against its pinned SHA-256, B while its original exists
  const aSha = createHash('sha256').update(readFileSync(path.join(LINT, 'lexicon/direction-a.txt'))).digest('hex');
  let bSame = null;
  if (existsSync(path.join(ROOT, 'tools/r5-direction/names-check.mjs'))) {
    const src = rd('tools/r5-direction/names-check.mjs');
    const H = /const HORIZON = `([\s\S]*?)`;/.exec(src)[1].split(/\s+/).filter(Boolean);
    const M = [...(/const MULTI = \[([\s\S]*?)\];/.exec(src)[1]).matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'"));
    bSame = H.length === B.names.length && H.every((w, i) => w === B.names[i]) && M.length === B.phrases.length && M.every((p, i) => p === B.phrases[i]);
  }
  return {
    schema: 2,
    built: 'node tools/lint/namecheck.mjs --rebuild-lexicon',
    rules: {
      plan: "GRADED (plan §9, bible §10.4 A's rules): every union entry; exact, or substring either way when both >= 5 characters, or edit distance <= 1 when both >= 5; multi-word names also as contiguous word sequences; allowlist = GENERIC only",
      name: 'advisory named reading: exact, or the term inside the word (both >= 5 chars)',
      common: 'advisory named reading: phrase-only (Direction B: never split a Horizon name into generic words)',
      phrase: 'contiguous normalised word sequence', short: 'advisory named reading: entries under 3 characters not matched alone',
      line: "advisory named reading: A's whole lines with spaces / slashes / notes, matched through their expanded phrases" },
    union: { plan: plan.length, planSources: { A: aEntries, B: bSingles.length + B.phrases.length, bSingles: bSingles.length, bPhrases: B.phrases.length, additions: PLAN_ADDITIONS.length },
      sourceCopies: { directionA: aSha === DIRECTION_A_SHA256, directionB: bSame },
      entries: tokens.length + ph.length, tokens: tokens.length, phrases: ph.length,
      name: count('name'), common: count('common'), line: count('line'), short: count('short') },
    generic: GENERIC,
    plan, tokens, phrases: ph,
  };
}

let _lex = null;
export function loadLexicon() {
  if (!_lex) _lex = JSON.parse(readFileSync(path.join(LINT, 'lexicon.json'), 'utf8'));
  return _lex;
}

/* --------------------------------------------------------------- matcher */

/**
 * The matcher, written to be SERIALISED into a page (`matchTexts.toString()`):
 * no closures over this module. `lex` is lexicon.json; `texts` is
 * [{ where, text }]; `mode` 'plan' (the GRADED plan §9 reading, see the header)
 * or 'named' (advisory). Returns [{ where, word, term, rule }]: one per distinct
 * (surface, offending text unit) — a word / id / table key that hits (the whole
 * token, or any of its camelCase / hyphen parts), or a multi-word name found as
 * a word sequence — with the first lexicon entry it hit and the rule.
 */
export function matchTexts(lex, texts, mode = 'plan') {
  const nm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'‘`]/g, '').replace(/[\s\-_]/g, '');
  const generic = new Set(lex.generic);
  const isGeneric = (w) => generic.has(w) || (w.endsWith('s') && generic.has(w.slice(0, -1)));
  const PLAN = mode === 'plan';
  // plan: every union entry (len = the lower-case entry's own length, A's ">= 5" test)
  // named: the advisory classes
  const solo = PLAN ? lex.plan.map((e) => ({ n: e.n, t: e.t, len: e.len }))
    : lex.tokens.filter((t) => t.cls === 'name').map((t) => ({ n: t.n, t: t.t, len: t.n.length }));
  const exact = new Map();
  for (const t of solo) if (t.n && !exact.has(t.n)) exact.set(t.n, t);
  const long = solo.filter((t) => t.len >= 5 && t.n.length >= 1);
  const lev1 = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  };
  const memo = new Map();
  /** w: normalised word; rawLen: its length as written (A compares len(word) >= 5) */
  const wordHit = (w, rawLen) => {
    const key = w + '\u0000' + (rawLen >= 5 ? 1 : 0);
    if (memo.has(key)) return memo.get(key);
    let hit = null;
    if (w && !isGeneric(w)) {
      const e = exact.get(w);
      if (e) hit = { term: e.t, rule: 'exact' };
      else if (rawLen >= 5) {
        if (PLAN) {
          // A's rules: substring either way (both >= 5), then edit distance <= 1 (both >= 5)
          for (const t of long) if (w.includes(t.n) || t.n.includes(w)) { hit = { term: t.t, rule: 'substring' }; break; }
          if (!hit) for (const t of long) if (lev1(w, t.n)) { hit = { term: t.t, rule: 'edit1' }; break; }
        } else {
          // named (advisory): only a Horizon name INSIDE the word (watchers, thunderjaws)
          for (const t of long) if (w.includes(t.n)) { hit = { term: t.t, rule: 'substring' }; break; }
        }
      }
    }
    memo.set(key, hit);
    return hit;
  };
  const byFirst = new Map();
  for (const p of lex.phrases) {
    if (!byFirst.has(p.words[0])) byFirst.set(p.words[0], []);
    byFirst.get(p.words[0]).push(p);
  }
  const out = [];
  const seen = new Set();
  const push = (where, unit, word, term, rule) => {
    const k = where + '\u0000' + unit;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ where, word, term, rule });
  };
  for (const { where, text } of texts) {
    if (!text) continue;
    // tokens: letters (any script) joined by internal apostrophes / hyphens
    const raw = String(text).match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [];
    const words = [];
    for (const r of raw) {
      // camelCase / digit / hyphen boundaries split too (content ids and table keys)
      const parts = r.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').split(/[\s\-]+/).filter(Boolean);
      const whole = nm(r);
      let hit = whole ? wordHit(whole, r.length) : null;
      let word = r;
      if (!hit && parts.length > 1) for (const p of parts) { const h = wordHit(nm(p), p.length); if (h) { hit = h; word = p; break; } }
      if (hit) push(where, 'w:' + whole, word, hit.term, hit.rule);
      for (const p of parts) { const n = nm(p); if (n) words.push(n); }
    }
    for (let i = 0; i < words.length; i++) {
      const cands = byFirst.get(words[i]);
      if (cands) for (const p of cands) {
        let ok = true;
        for (let k = 1; k < p.words.length; k++) if (words[i + k] !== p.words[k]) { ok = false; break; }
        if (ok) push(where, 'p:' + p.words.join(' '), p.words.join(' '), p.t, 'phrase');
      }
    }
  }
  return out;
}

/* ------------------------------------------------------- player (static) */

function walk(rel, exts, exclude, out = []) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return out;
  if (exclude.some((x) => rel === x || rel.startsWith(x + '/'))) return out;
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) return out;
  if (st.isDirectory()) { for (const e of readdirSync(abs).sort()) walk(rel ? `${rel}/${e}` : e, exts, exclude, out); }
  else if (exts.includes(path.extname(rel).toLowerCase())) out.push(rel);
  return out;
}

/**
 * Third-party licence texts that ship VERBATIM (OFL.txt, the MIT notices): the
 * licensors' words, which no lane may edit. They ARE in the graded scope (plan
 * §9 says public/**\/*.{json,md,txt}, no exception); `playerStatic` reports
 * their share separately so the ruling on them can be made with the number.
 */
export const VERBATIM_LICENCE_TEXTS = [/^public\/licences\//, /^public\/fonts\/[^/]+-OFL\.txt$/, /(^|\/)LICENSE(\.txt)?$/];

/** public/**\/*.{json,md,txt}, every file (the verbatim licence texts' share reported apart) */
export function playerStatic(mode = 'plan') {
  const lex = loadLexicon();
  const files = walk('public', ['.json', '.md', '.txt'], []);
  const texts = files.map((f) => ({ where: f, text: rd(f) }));
  const hits = matchTexts(lex, texts, mode);
  const verbatim = hits.filter((h) => VERBATIM_LICENCE_TEXTS.some((re) => re.test(h.where))).length;
  return { files: files.length, hits, verbatimLicenceHits: verbatim };
}

/* ------------------------------------------------------------------ code */

export const CODE_SCOPE = {
  roots: ['src', 'tools', 'index.html'],
  exts: ['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.glsl', '.py', '.sh'],
  exclude: ['tools/lint'],
};

/** Replace comments with spaces (line breaks kept). JS/CSS/GLSL: // and /* *\/; HTML: <!-- -->; py/sh: #. String-aware. */
export function stripComments(src, ext) {
  let out = '';
  const n = src.length;
  const hashComments = ext === '.py' || ext === '.sh';
  const html = ext === '.html';
  const json = ext === '.json';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  // a "/" starts a regex literal when the previous significant char cannot end an expression
  const regexOk = () => {
    let k = out.length - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    if (k < 0) return true;
    const c = out[k];
    if (/[(,=:[!&|?{};+\-*%<>~^]/.test(c)) return true;
    const m = /([A-Za-z_$]+)$/.exec(out.slice(Math.max(0, k - 12), k + 1));
    return !!m && ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'yield', 'await'].includes(m[1]);
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (json) { out += src.slice(i); break; }
    if (html && src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); const j = e < 0 ? n : e + 3; out += blank(src.slice(i, j)); i = j; continue; }
    if (hashComments && c === '#') { const e = src.indexOf('\n', i); const j = e < 0 ? n : e; out += blank(src.slice(i, j)); i = j; continue; }
    if (!hashComments && c === '/' && d === '/' && !html) { const e = src.indexOf('\n', i); const j = e < 0 ? n : e; out += blank(src.slice(i, j)); i = j; continue; }
    if (!hashComments && c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; out += blank(src.slice(i, j)); i = j; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; else if (c !== '`' && src[j] === '\n') break; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '/' && !hashComments && !html && ext !== '.css' && regexOk()) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break;
        j++;
      }
      if (src[j] === '/') { out += src.slice(i, j + 1); i = j + 1; continue; }
    }
    out += c; i++;
  }
  return out;
}

/** Code tokens of one file: identifiers and string-literal words, with their line numbers. */
export function codeTokens(text) {
  const out = [];
  const re = /[A-Za-z_$][A-Za-z0-9_$]*(?:-[A-Za-z0-9_$]+)*/g;
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(lines[li]))) out.push({ tok: m[0], line: li + 1 });
  }
  return out;
}

/** Split a code token into normalised word parts (camelCase, snake_case, kebab-case, digits). */
export function codeParts(tok) {
  return tok.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-$0-9]+/).map((p) => p.toLowerCase()).filter(Boolean);
}

/**
 * Code hits: per file, per token, the lexicon terms its word parts match
 * (named tokens: exact or substring >= 5 on a part, no edit distance — code
 * is not screened for sound-alikes; phrases over consecutive parts).
 */
export function scanCode() {
  const lex = loadLexicon();
  const generic = new Set(lex.generic);
  const isGeneric = (w) => generic.has(w) || (w.endsWith('s') && generic.has(w.slice(0, -1)));
  const named = lex.tokens.filter((t) => t.cls === 'name');
  const exact = new Map(named.map((t) => [t.n, t.t]));
  const long = named.filter((t) => t.n.length >= 5);
  const memo = new Map();
  const partHit = (p) => {
    if (memo.has(p)) return memo.get(p);
    let term = null;
    if (!isGeneric(p)) {
      term = exact.get(p) ?? null;
      if (!term && p.length >= 5) for (const t of long) if (p.includes(t.n)) { term = t.t; break; }
    }
    memo.set(p, term);
    return term;
  };
  const byFirst = new Map();
  for (const ph of lex.phrases) { if (!byFirst.has(ph.words[0])) byFirst.set(ph.words[0], []); byFirst.get(ph.words[0]).push(ph); }
  const files = [];
  for (const r of CODE_SCOPE.roots) walk(r, CODE_SCOPE.exts, CODE_SCOPE.exclude, files);
  const hits = new Map();       // key term\0token -> { term, token, files:Set, occurrences, first }
  let occurrences = 0;
  for (const f of files) {
    const text = stripComments(rd(f), path.extname(f).toLowerCase());
    for (const { tok, line } of codeTokens(text)) {
      const parts = codeParts(tok);
      const terms = new Set();
      for (let i = 0; i < parts.length; i++) {
        const t = partHit(parts[i]);
        if (t) terms.add(t);
        const c = byFirst.get(parts[i]);
        if (c) for (const ph of c) {
          let ok = true;
          for (let k = 1; k < ph.words.length; k++) if (parts[i + k] !== ph.words[k]) { ok = false; break; }
          if (ok) terms.add(ph.t);
        }
      }
      for (const term of terms) {
        occurrences++;
        const k = term + '\u0000' + tok;
        let h = hits.get(k);
        if (!h) { h = { term, token: tok, files: new Set(), occurrences: 0, first: `${f}:${line}` }; hits.set(k, h); }
        h.files.add(f);
        h.occurrences++;
      }
    }
  }
  return { files: files.length, occurrences, hits: [...hits.values()].map((h) => ({ ...h, files: [...h.files].sort() })) };
}

/* ------------------------------------------------- engine-allow.json */

export function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') { if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; } else re += '[^/]*'; }
    else if (c === '{') { const e = glob.indexOf('}', i); re += `(?:${glob.slice(i + 1, e).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`; i = e; }
    else re += c.replace(/[.+^$()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * Grade code hits against engine-allow.json. An entry covers a hit when the
 * hit's term is one of its `terms` (case-insensitive) and EVERY file the hit
 * occurs in matches one of its `paths`; a hit occurring in files of two areas
 * is split per file group, so each area's entry carries its own share.
 */
export function gradeCode(scan, allow) {
  const entries = allow.entries.map((e) => ({ ...e, re: (e.paths || ['**']).map(globRe), termSet: new Set(e.terms.map((t) => t.toLowerCase())), n: 0, sample: [] }));
  const uncovered = [];
  for (const h of scan.hits) {
    const groups = new Map();        // entry -> files
    const loose = [];
    for (const f of h.files) {
      const e = entries.find((x) => x.termSet.has(h.term.toLowerCase()) && x.re.some((r) => r.test(f)));
      if (!e) { loose.push(f); continue; }
      if (!groups.has(e)) groups.set(e, []);
      groups.get(e).push(f);
    }
    for (const [e] of groups) { e.n++; if (e.sample.length < 4) e.sample.push(`${h.token} (${h.term})`); }
    if (loose.length) uncovered.push({ term: h.term, token: h.token, files: loose.slice(0, 6), first: h.first });
  }
  const over = entries.filter((e) => e.n > e.cap).map((e) => ({ id: e.id, count: e.n, cap: e.cap }));
  const total = entries.reduce((s, e) => s + e.n, 0) + uncovered.length;
  const capTotal = allow.entries.reduce((s, e) => s + e.cap, 0);
  const pass = uncovered.length === 0 && over.length === 0 && total <= (allow.ratchet?.total ?? capTotal);
  return { pass, total, capTotal, ratchetTotal: allow.ratchet?.total ?? null, uncovered, over,
    entries: entries.map((e) => ({ id: e.id, kind: e.kind, owner: e.owner, until: e.until, count: e.n, cap: e.cap, sample: e.sample })) };
}

/**
 * (Re)record engine-allow.json's entries from its `definitions` (engine terms,
 * guard files, owner areas). `initial` (the W0b exit on merged main, once) sets
 * every cap to today's count; without it caps and the total can only go DOWN,
 * and a hit no entry covers stays uncovered (it must be renamed, not allowed).
 */
export function recordAllow({ initial = false } = {}) {
  const file = path.join(LINT, 'engine-allow.json');
  const allow = JSON.parse(readFileSync(file, 'utf8'));
  const D = allow.definitions;
  const scan = scanCode();
  const engineRe = D.engine.map((e) => ({ ...e, re: (e.paths || ['**']).map(globRe), set: new Set(e.terms.map((t) => t.toLowerCase())) }));
  const guardRe = D.guard.map((g) => ({ ...g, re: g.paths.map(globRe) }));
  const areaRe = D.areas.map((a) => ({ ...a, re: globRe(a.glob) }));
  const counts = new Map();
  const bump = (id, mk, term, token) => {
    if (!counts.has(id)) counts.set(id, { entry: mk(), pairs: new Set(), terms: new Set() });
    const c = counts.get(id); c.pairs.add(term + '\u0000' + token); c.terms.add(term);
  };
  for (const h of scan.hits) for (const f of h.files) {
    const e = engineRe.find((x) => x.set.has(h.term.toLowerCase()) && x.re.some((r) => r.test(f)));
    if (e) { bump(e.id, () => ({ id: e.id, kind: 'engine', owner: 'engine', until: 'permanent (capped)', terms: e.terms, paths: e.paths || ['**'], reason: e.reason }), h.term, h.token); continue; }
    const g = guardRe.find((x) => x.re.some((r) => r.test(f)));
    if (g) { bump(g.id, () => ({ id: g.id, kind: 'guard', owner: g.owner, until: 'while the guard exists', terms: null, paths: g.paths, reason: g.reason }), h.term, h.token); continue; }
    const a = areaRe.find((x) => x.re.test(f));
    if (!a) continue;
    const id = `scheduled:${a.owner}:${a.glob}`;
    const frozen = a.owner === 'frozen';
    bump(id, () => ({ id, kind: frozen ? 'engine' : 'scheduled', owner: frozen ? 'frozen (W4 comment scrub only)' : a.owner, until: a.until, terms: null, paths: [a.glob],
      reason: frozen ? 'identifiers in frozen kept-system files stay (plan §1.1); comments are scrubbed at W4' : 'dies with its content (plan §6 / §7.2)' }), h.term, h.token);
  }
  const rank = (id) => {
    let i = D.engine.findIndex((x) => x.id === id); if (i >= 0) return i;
    i = D.guard.findIndex((x) => x.id === id); if (i >= 0) return 1000 + i;
    return 2000 + D.areas.findIndex((a) => id === `scheduled:${a.owner}:${a.glob}`);
  };
  const old = new Map((allow.entries || []).map((e) => [e.id, e]));
  const entries = [];
  for (const c of counts.values()) {
    const e = c.entry;
    if (!e.terms) e.terms = [...c.terms].sort();
    const prev = old.get(e.id);
    if (!initial) {
      if (!prev) continue;                                  // new area: not allowed without a ruling
      e.terms = prev.terms;
      entries.push({ ...e, cap: Math.min(prev.cap, c.pairs.size) });
    } else entries.push({ ...e, cap: c.pairs.size });
  }
  if (!initial) for (const [id, prev] of old) if (!entries.some((e) => e.id === id)) entries.push({ ...prev, cap: 0 });
  entries.sort((a, b) => rank(a.id) - rank(b.id));
  const total = entries.reduce((n, e) => n + e.cap, 0);
  const prevTotal = allow.ratchet?.total ?? Infinity;
  allow.entries = entries;
  allow.ratchet = { ...(allow.ratchet || {}), total: initial ? total : Math.min(prevTotal, total),
    recorded: new Date().toISOString().slice(0, 10), ...(initial ? { initialRecord: true } : {}) };
  writeFileSync(file, `${JSON.stringify(allow, null, 1)}\n`);
  return { entries: entries.length, total: allow.ratchet.total };
}

/* ------------------------------------------------------------------- CLI */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const json = a.includes('--json');
  const flag = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
  if (a.includes('--rebuild-lexicon')) {
    const lex = buildLexicon();
    writeFileSync(path.join(LINT, 'lexicon.json'), `${JSON.stringify(lex, null, 1)}\n`);
    console.log(`[namecheck] lexicon.json: ${JSON.stringify(lex.union)}`);
  } else if (a.includes('--player')) {
    const lex = loadLexicon();
    const st = playerStatic('plan');
    const stNamed = playerStatic('named');
    let dom = [], domNamed = [];
    const domFile = flag('--dom');
    if (domFile) {
      const texts = JSON.parse(readFileSync(domFile, 'utf8'));
      dom = matchTexts(lex, texts, 'plan');
      domNamed = matchTexts(lex, texts, 'named');
    }
    const hits = [...st.hits, ...dom];
    const ratchet = JSON.parse(readFileSync(path.join(LINT, 'ratchet.json'), 'utf8'));
    const res = { mode: 'plan', staticFiles: st.files, staticHits: st.hits.length, staticVerbatimLicence: st.verbatimLicenceHits, domHits: dom.length,
      total: hits.length, namedAdvisory: stNamed.hits.length + domNamed.length, ratchet: ratchet.player, hits };
    if (json) console.log(JSON.stringify(res, null, 1));
    else {
      for (const h of hits) console.log(`${h.where}: "${h.word}" -> ${h.term} (${h.rule})`);
      console.log(`[namecheck --player] ${hits.length} hit(s), plan §9 reading (static ${st.hits.length} of which verbatim licence texts ${st.verbatimLicenceHits}${domFile ? `, dom ${dom.length}` : ', DOM half: run the gate'}); advisory named reading ${stNamed.hits.length + domNamed.length}; W0b ratchet ${ratchet.player?.count ?? 'unset'}`);
    }
  } else if (a.includes('--record')) {
    const r = recordAllow({ initial: a.includes('--initial') });
    console.log(`[namecheck --record${a.includes('--initial') ? ' --initial' : ''}] engine-allow.json: ${r.entries} entries, ratchet total ${r.total}`);
  } else if (a.includes('--code')) {
    const scan = scanCode();
    const allowFile = path.join(LINT, 'engine-allow.json');
    const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : { entries: [] };
    const g = gradeCode(scan, allow);
    if (json) console.log(JSON.stringify({ files: scan.files, occurrences: scan.occurrences, pairs: scan.hits.length, ...g }, null, 1));
    else {
      for (const u of g.uncovered.slice(0, 60)) console.log(`UNCOVERED ${u.first}: ${u.token} (${u.term})`);
      for (const o of g.over) console.log(`OVER CAP ${o.id}: ${o.count} > ${o.cap}`);
      console.log(`[namecheck --code] ${scan.files} files, ${scan.hits.length} distinct (term, token) pairs, ${scan.occurrences} occurrences; uncovered ${g.uncovered.length}, over cap ${g.over.length}; total ${g.total} vs ratchet ${g.ratchetTotal} -> ${g.pass ? 'PASS' : 'FAIL'}`);
    }
    process.exitCode = g.pass ? 0 : 1;
  } else {
    console.log('usage: namecheck.mjs --player [--dom harvest.json] [--json] | --code [--json] | --record [--initial] | --rebuild-lexicon');
  }
}
