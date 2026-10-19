/**
 * CALIMA name lint (lane `brand`, plan §7.4 and §9 A-no-horizon-terms-*).
 *
 *   node tools/lint/namecheck.mjs --player [--dom <harvest.json>] [--json]
 *   node tools/lint/namecheck.mjs --code [--json]
 *   node tools/lint/namecheck.mjs --record [--initial]   lower engine-allow caps (or record them once)
 *   node tools/lint/namecheck.mjs --rebuild-lexicon
 *
 * THE LEXICON (tools/lint/lexicon.json, built from tools/lint/lexicon/*):
 * the union the bible §10.4 describes — Direction A's `horizon-lexicon.txt`
 * through A's own tokenizer (every line, plus every part >= 4 characters:
 * 331 entries), Direction B's 190 single names (>= 3 characters, B's rule) and
 * 46 phrases, and the plan's additions (Brittle, Impact, Tear, Frost, Lens,
 * Shards, Stalker, Watcher, Grazer, Charger, Burrower, Rollerback, Saltbite,
 * Call of the Mountain, Camp). The reproducible union of those files is 410
 * entries (the bible counts 417: B's file holds 190 + 46 = 236 where B's
 * write-up counted 235 + 46).
 *
 * TWO CLASSES OF ENTRY. A's tokenizer splits multi-word names into their
 * words, so the union also holds ~120 ordinary English words that are only
 * Horizon terms inside their name (light, world, point, end, run, of, heart,
 * stone, weapon …). Matched alone they would flag every sentence a lane ever
 * writes. Direction B's rule — "multi-word Horizon names: matched as whole word
 * sequences, never split into generic words" — is applied to exactly those:
 *   name    matched alone: exact, or the Horizon term INSIDE a longer word
 *           (both >= 5 characters: watchers, thunderjaws, focused). Not the
 *           English word inside a Horizon compound (under / thunderjaw, other /
 *           all-mother) and not edit distance 1 (blade / blaze, brace / brave):
 *           in running UI text those are ordinary words, not uses of the name
 *   common  an English dictionary word (macOS web2, at build time) that is not
 *           one of: A's single-word "tracked" terms, B's names, the plan's
 *           additions, the A-ui-words terms, or the Horizon element / mechanic /
 *           character words listed in PROTECT below. Matched only as part of a
 *           phrase.
 *   phrase  every multi-word entry (A's multi-word lines with their "/"
 *           alternatives expanded, B's phrases, "Call of the Mountain"),
 *           matched as a contiguous word sequence.
 * The literal reading — every entry alone with ALL of Direction A's rules
 * (exact; substring either way when both >= 5; edit distance <= 1 when both
 * >= 5), allowlist = bible §10.4's six GENERIC nouns only — is ALSO counted and
 * reported as `literal`, so the orchestrator can choose which reading the
 * ratchet grades (see docs/ROUND5-BRAND.md).
 * GENERIC (never a hit, bible §10.4): lance, cliff, shelf, salt, glaze, arrow.
 *
 * --player  public/**\/*.{json,md,txt} here in node; the rendered DOM text,
 *           content ids and content-table keys come from the gate
 *           A-no-horizon-terms-player (page context), which calls the same
 *           matcher (`matchTexts`, serialisable) and folds both halves.
 * --code    identifiers and strings (comments stripped) in src/**, index.html
 *           and tools/** except tools/lint/**. A hit is a distinct (lexicon
 *           term, code token) pair; raw occurrences are reported too. Every hit
 *           must be covered by an entry of tools/lint/engine-allow.json and no
 *           entry may exceed its cap (a count of distinct pairs), so USING a
 *           kept engine identifier again never moves the count, while coining
 *           a new Horizon-named identifier does.
 */
import { readFileSync, writeFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
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
  return {
    schema: 1,
    built: 'node tools/lint/namecheck.mjs --rebuild-lexicon',
    rules: { name: 'named reading: exact, or the term inside the word (both >= 5 chars). literal reading: Direction A as written — exact; substring either way when both >= 5; edit distance <= 1 when both >= 5',
      common: 'phrase-only (Direction B: never split a Horizon name into generic words)',
      phrase: 'contiguous normalised word sequence', short: 'entries under 3 characters are split artefacts (B drops them): not matched',
      line: "A's whole lines with spaces / slashes / notes: matched through their expanded phrases" },
    union: { entries: tokens.length + ph.length, tokens: tokens.length, phrases: ph.length,
      name: count('name'), common: count('common'), line: count('line'), short: count('short') },
    generic: GENERIC,
    tokens, phrases: ph,
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
 * [{ where, text }]; `mode` 'named' (the graded reading) or 'literal'.
 * Returns [{ where, word, term, rule }] — one per distinct (where, term), with the first word seen.
 */
export function matchTexts(lex, texts, mode = 'named') {
  const nm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'‘`]/g, '').replace(/[\s\-_]/g, '');
  const generic = new Set(lex.generic);
  const isGeneric = (w) => generic.has(w) || (w.endsWith('s') && generic.has(w.slice(0, -1)));
  const solo = lex.tokens.filter((t) => t.cls === 'name' || (mode === 'literal' && t.cls !== 'line'));
  const exact = new Map(solo.map((t) => [t.n, t]));
  const long = solo.filter((t) => t.n.length >= 5);
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
  const wordHits = (w) => {
    if (memo.has(w)) return memo.get(w);
    const hits = [];
    if (w.length >= 1 && !isGeneric(w)) {
      const e = exact.get(w);
      if (e) hits.push({ term: e.t, rule: 'exact' });
      else if (w.length >= 5) {
        // named: only a Horizon term INSIDE the word (watchers, thunderjaws, focused); an English
        // word inside a Horizon compound (under/thunderjaw, other/all-mother) is not a use of it
        for (const t of long) {
          if (w.includes(t.n) || (mode === 'literal' && t.n.includes(w))) { hits.push({ term: t.t, rule: 'substring' }); break; }
        }
        if (!hits.length && mode === 'literal') for (const t of long) if (lev1(w, t.n)) { hits.push({ term: t.t, rule: 'edit1' }); break; }
      }
    }
    memo.set(w, hits);
    return hits;
  };
  const byFirst = new Map();
  for (const p of lex.phrases) {
    if (!byFirst.has(p.words[0])) byFirst.set(p.words[0], []);
    byFirst.get(p.words[0]).push(p);
  }
  const out = [];
  const seen = new Set();
  // one hit per distinct (surface, term): a surface that says a term ten times, or in
  // two spellings, holds that term once
  const push = (where, word, term, rule) => {
    const k = where + '\u0000' + term;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ where, word, term, rule });
  };
  for (const { where, text } of texts) {
    if (!text) continue;
    // words: letters (any script) joined by internal apostrophes / hyphens
    const raw = String(text).match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [];
    const words = [];
    for (const r of raw) {
      // camelCase / digit boundaries split too (content ids and table keys)
      const parts = r.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').split(/[\s\-]+/);
      const whole = nm(r);
      if (parts.length > 1 && whole) for (const h of wordHits(whole)) push(where, r, h.term, h.rule);
      for (const p of parts) { const n = nm(p); if (n) words.push(n); }
    }
    for (let i = 0; i < words.length; i++) {
      for (const h of wordHits(words[i])) push(where, words[i], h.term, h.rule);
      const cands = byFirst.get(words[i]);
      if (cands) for (const p of cands) {
        let ok = true;
        for (let k = 1; k < p.words.length; k++) if (words[i + k] !== p.words[k]) { ok = false; break; }
        if (ok) push(where, p.words.join(' '), p.t, 'phrase');
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
 * Third-party licence texts that must ship VERBATIM (OFL.txt, the MIT notices):
 * they are the licensors' words, not the project's, and cannot be edited, so
 * they are outside the player lint's public/** scope.
 */
export const VERBATIM_LICENCE_TEXTS = [/^public\/licences\//, /^public\/fonts\/[^/]+-OFL\.txt$/, /(^|\/)LICENSE(\.txt)?$/];

/** public/**\/*.{json,md,txt}, less the verbatim licence texts */
export function playerStatic(mode = 'named') {
  const lex = loadLexicon();
  const files = walk('public', ['.json', '.md', '.txt'], []).filter((f) => !VERBATIM_LICENCE_TEXTS.some((re) => re.test(f)));
  const texts = files.map((f) => ({ where: f, text: rd(f) }));
  return { files: files.length, hits: matchTexts(lex, texts, mode) };
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
    const st = playerStatic('named');
    const lit = playerStatic('literal');
    let dom = [];
    const domFile = flag('--dom');
    if (domFile) dom = matchTexts(lex, JSON.parse(readFileSync(domFile, 'utf8')), 'named');
    const hits = [...st.hits, ...dom];
    const ratchet = JSON.parse(readFileSync(path.join(LINT, 'ratchet.json'), 'utf8'));
    const res = { mode: 'named', staticFiles: st.files, staticHits: st.hits.length, staticLiteral: lit.hits.length, domHits: dom.length,
      total: hits.length, ratchet: ratchet.player, hits };
    if (json) console.log(JSON.stringify(res, null, 1));
    else {
      for (const h of hits) console.log(`${h.where}: "${h.word}" -> ${h.term} (${h.rule})`);
      console.log(`[namecheck --player] ${hits.length} hit(s) (static ${st.hits.length}, literal reading ${lit.hits.length}${domFile ? `, dom ${dom.length}` : ', DOM half: run the gate'}); W0b ratchet ${ratchet.player?.count ?? 'unset'}`);
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
