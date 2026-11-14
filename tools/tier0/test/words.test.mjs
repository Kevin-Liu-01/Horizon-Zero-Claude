// Tier 0 name-lint matcher. Uses invented terms only: the real list is private and never in the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { words, parseWordList, makeMatcher, findTerms } from '../lib/words.mjs';
import { lintText } from '../namelint.mjs';

const LIST = parseWordList(`
# comment
[anywhere]
zorblat
quiet fen
[names]
Quill
Bright Hollow
[player-visible]
gizmo
`);

test('word list sections parse', () => {
  assert.deepEqual(LIST.anywhere.map((t) => t.term), ['zorblat', 'quiet fen']);
  assert.deepEqual(LIST.names.map((t) => t.term), ['Quill', 'Bright Hollow']);
  assert.deepEqual(LIST.playerVisible.map((t) => t.term), ['gizmo']);
  assert.throws(() => parseWordList('[nonsense]\nx'));
});

test('camelCase and snake_case split into words', () => {
  assert.deepEqual(words('heroZorblatTip_quiet-fen').map((w) => w.w), ['hero', 'Zorblat', 'Tip', 'quiet', 'fen']);
  assert.deepEqual(words('HTMLParser').map((w) => w.w), ['HTML', 'Parser']);
  assert.equal(words('heroZorblat')[1].interior, true);
});

test('anywhere terms: whole words, any case, plain plurals, phrases across identifiers', () => {
  const any = LIST.anywhere;
  assert.deepEqual(findTerms('a ZORBLAT and two zorblats', any), ['zorblat', 'zorblat']);
  assert.deepEqual(findTerms('zorblatish unzorblat', any), []);
  assert.deepEqual(findTerms('isInQuietFen()', any), ['quiet fen']);
  assert.deepEqual(findTerms('quiet fens', any), ['quiet fen']);
});

test('names match only capitalised, not inside a camel run', () => {
  const n = LIST.names;
  assert.deepEqual(findTerms('Quill said; QUILL shouted', n), ['Quill', 'Quill']);
  assert.deepEqual(findTerms('a quill pen; heroQuill', n), []);
  assert.deepEqual(findTerms('to Bright Hollow; bright hollow', n), ['Bright Hollow']);
});

test('matcher and findTerms agree', () => {
  const m = makeMatcher([...LIST.anywhere, ...LIST.names]);
  const s = 'Quill keeps zorblats by the quiet fen';
  assert.deepEqual(m(s), findTerms(s, [...LIST.anywhere, ...LIST.names]));
});

test('lintText: code, comments, strings, allow-listed identifiers, player-visible prose', () => {
  const m = { any: makeMatcher([...LIST.anywhere, ...LIST.names]), visible: makeMatcher(LIST.playerVisible) };
  const allow = { words: new Set(['zorblat']), exact: ['isInQuietFen'], apiStrings: [], segments: [], deferred: [] };
  const src = [
    'const zorblatRate = isInQuietFen(p);   // the zorblat',
    "const id = 'trap-zorblat';",
    "const label = 'A gizmo for you';",
    "console.warn('gizmo failed');",
    "const k = 'gizmo';",
  ].join('\n');
  const hits = lintText('src/x.js', src, m, allow);
  assert.deepEqual(hits.map((h) => `${h.ctx}:${h.term}:${h.line}`), ['comment:zorblat:1', 'visible:gizmo:3']);
});
