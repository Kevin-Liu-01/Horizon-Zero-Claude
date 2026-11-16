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
