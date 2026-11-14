import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanJs, stripComments } from '../lib/scanjs.mjs';
import { parseImports, parseExports } from '../imports.mjs';

test('scanJs tags code, comments, strings, templates and regex literals', () => {
  const src = "const a = 'x'; // c1\n/* c2 */ const r = /ab\\/c/g; const t = `t ${a}`;";
  const segs = scanJs(src).map((s) => `${s.ctx}:${s.text}`);
  assert.ok(segs.includes("string:'x'"));
  assert.ok(segs.includes('comment:// c1'));
  assert.ok(segs.includes('comment:/* c2 */'));
  assert.ok(segs.includes('string:/ab\\/c/g'));
  assert.ok(segs.includes('string:`t ${a}`'));
  const division = scanJs('const q = a / b / c;');
  assert.equal(division.length, 1);
});

test('scanJs reports the line each segment starts on', () => {
  const segs = scanJs('a\n// two\nb\n"four"');
  assert.equal(segs.find((s) => s.ctx === 'comment').line, 2);
  assert.equal(segs.find((s) => s.ctx === 'string').line, 4);
});

test('stripComments keeps line numbers', () => {
  const s = stripComments('a /* x\ny */ b');
  assert.equal(s.split('\n').length, 2);
  assert.ok(!s.includes('x'));
});

test('parseImports: static, re-export, dynamic; comments, prose strings and relative template imports ignored', () => {
  const src = [
    "import { a, b as c } from './m.js';",
    "export { d } from '../n.js';",
    "const x = await import('/src/p.js');",
    "// import { z } from './ignored.js';",
    "const fixture = \"import('./also-ignored.js') in a sentence\";",
    "const page = `import { q } from './written-elsewhere.js'; await import('/src/q.js')`;",
  ].join('\n');
  const got = parseImports(src).map((i) => `${i.spec}|${i.names.join(',')}|${i.dynamic}`);
  assert.deepEqual(got, ['./m.js|a,b|false', '../n.js|d|false', '/src/p.js||true', '/src/q.js||true']);
});

test('parseExports: declarations, lists, defaults, star', () => {
  const e = parseExports([
    'export const A = 1; export async function* g() {} export class K {}',
    'export { x as y, z }; export default 3;',
    'export const { p, q: r } = o;',
    "export * as ns from './n.js';",
  ].join('\n'));
  for (const n of ['A', 'g', 'K', 'y', 'z', 'default', 'p', 'r', 'ns']) assert.ok(e.set.has(n), n);
  assert.equal(e.star, false);
  assert.equal(parseExports("export * from './m.js';").star, true);
});
