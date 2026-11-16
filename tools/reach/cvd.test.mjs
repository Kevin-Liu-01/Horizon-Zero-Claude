// M1.6m: the colour-vision check on UI tokens (tools/reach/cvd.mjs), in Tier 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, simulate, MIN_DE } from './cvd.mjs';

test('the simulation is the identity on greys and moves reds under protanopia', () => {
  assert.equal(simulate('#808080', 'protan'), '#808080');
  assert.notEqual(simulate('#D2452E', 'protan'), '#D2452E');
});

test(`UI signal tokens: >= ${MIN_DE} dE2000 apart under each type with its palette, or differ in shape`, () => {
  const r = check();
  for (const [type, g] of Object.entries(r.graded)) {
    assert.deepEqual(g.fails.map((p) => `${p.pair} ${p.de}`), [], `${type} (${g.palette})`);
  }
  for (const [k, found] of Object.entries(r.shapes)) assert.ok(found, `shape claim ${k}: its CSS is not in the tree`);
});

test(`round 2: the DEFAULT tokens (no palette picked) pass under all three types, by distance or by a shape that holds`, () => {
  const r = check();
  for (const [type, d] of Object.entries(r.default)) assert.deepEqual(d.fails, [], `default under ${type}`);
  for (const [k, c] of Object.entries(r.claims)) {
    assert.ok(c.found, `shape claim ${k}: missing ${c.missing.join(' | ')}; forms ${c.forms.filter((f) => !f.ok).map((f) => f.what).join(', ')}`);
  }
});

test('round 2: the lamp roles of every palette (wary, hostile) are >= 20 dE2000 from the five excluded colours', () => {
  const r = check();
  assert.deepEqual(r.canon.rows.filter((x) => !x.pass).map((x) => `${x.palette} ${x.token} ${x.hex} ${x.minDE}`), []);
  assert.ok(r.canon.rows.filter((x) => x.lamp).length >= 6);
});

test('the form census reads aliases and keyframes (an invariant over no uses proves nothing)', async () => {
  const { census } = await import('./cvd.mjs');
  const U = census(`:root { --a: #fff; } .x { --lamp: var(--a); } .cal-iris i { background: var(--lamp); border-radius: 50%; }
    @keyframes k { 0% { color: var(--a); } }`);
  const u = U('--a');
  assert.equal(u.length, 2);
  assert.ok(u.some((x) => x.via === '--lamp' && x.round));
  assert.ok(u.some((x) => /@keyframes k/.test(x.sel)));
});
