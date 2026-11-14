// @ts-check
/**
 * Tier 0 name-lint matcher (pure; no I/O). The TERM LIST is private and is never in the repo: the
 * caller reads it from a file outside the tree and hands its text to `parseWordList`.
 *
 * Word rule. Text is split into words on anything that is not a letter, and camelCase / PascalCase
 * runs are split too (`heroBowTip` -> hero, Bow, Tip; `HTMLParser` -> HTML, Parser). A word that
 * came from inside a camel run is "interior".
 *   anywhere / player-visible terms: case-insensitive whole-word match, plus a plain plural (+s, +es).
 *   names: the word must be capitalised and must not be interior ("Quill", "QUILL"; not "quill", not
 *     "heroQuill"), so common words that merely contain or equal a name in lower case do not hit.
 *   phrases (a term with spaces): the same words in sequence, each by the rule of its section.
 */

/** @typedef {{ term: string, section: 'anywhere'|'names'|'player-visible', words: string[] }} Term */
/** @typedef {{ anywhere: Term[], names: Term[], playerVisible: Term[] }} WordList */

/**
 * @param {string} s
 * @returns {{ w: string, interior: boolean }[]}
 */
export function words(s) {
  const out = [];
  for (const m of s.matchAll(/[A-Za-z]+/g)) {
    const parts = m[0].match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g) || [m[0]];
    parts.forEach((p, i) => out.push({ w: p, interior: i > 0 }));
  }
  return out;
}

/**
 * @param {string} text  contents of the private word-list file
 * @returns {WordList}
 */
export function parseWordList(text) {
  /** @type {WordList} */
  const list = { anywhere: [], names: [], playerVisible: [] };
  /** @type {'anywhere'|'names'|'player-visible'} */
  let section = 'anywhere';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sec = /^\[(anywhere|names|player-visible)\]$/.exec(line);
    if (sec) { section = /** @type {any} */ (sec[1]); continue; }
    if (/^\[.*\]$/.test(line)) throw new Error(`word list: unknown section ${line}`);
    const t = { term: line, section, words: words(line).map((x) => x.w.toLowerCase()) };
    if (!t.words.length) continue;
    (section === 'names' ? list.names : section === 'player-visible' ? list.playerVisible : list.anywhere).push(t);
  }
  return list;
}

/** @param {string} word @param {string} term */
function sameWord(word, term) {
  const w = word.toLowerCase();
  return w === term || w === term + 's' || w === term + 'es';
}

/** @param {{w:string, interior:boolean}} x */
const isCapitalised = (x) => !x.interior && /^[A-Z]/.test(x.w);

/**
 * Every listed term found in `s`, once per occurrence.
 * @param {string} s
 * @param {Term[]} terms
 * @returns {string[]}
 */
export function findTerms(s, terms) {
  return makeMatcher(terms)(s);
}

/**
 * Index terms by first word so a large file is not O(words × terms).
 * @param {Term[]} terms
 */
export function makeMatcher(terms) {
  /** @type {Map<string, Term[]>} */
  const byFirst = new Map();
  for (const t of terms) {
    const keys = [t.words[0]];
    if (t.words.length === 1 && t.section !== 'names') keys.push(t.words[0] + 's', t.words[0] + 'es');
    for (const k of keys) { if (!byFirst.has(k)) byFirst.set(k, []); /** @type {Term[]} */ (byFirst.get(k)).push(t); }
  }
  /** @param {string} s @returns {string[]} */
  return function match(s) {
    const ws = words(s);
    const hits = [];
    for (let i = 0; i < ws.length; i++) {
      const cands = byFirst.get(ws[i].w.toLowerCase());
      if (!cands) continue;
      for (const t of cands) {
        if (i + t.words.length > ws.length) continue;
        let ok = true;
        for (let j = 0; j < t.words.length && ok; j++) {
          const x = ws[i + j];
          if (t.section === 'names') ok = isCapitalised(x) && x.w.toLowerCase() === t.words[j];
          else ok = j === t.words.length - 1 ? sameWord(x.w, t.words[j]) : x.w.toLowerCase() === t.words[j];
        }
        if (ok) hits.push(t.term);
      }
    }
    return hits;
  };
}
