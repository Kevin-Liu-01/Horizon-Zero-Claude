// Milestone 3 rule 15 (area F, EF1's Node half): the regions seam along A-region-hitch's crossings
// (tools/perf/region-hitch-paths.mjs), in each crossing's mode. Out: approach the Malpais, leave the Holds, enter the
// Malpais, once each; back: leave the Malpais, enter the Holds, depart the Malpais. The Malpais is approached at 60 m on
// foot and 150 m in the air; the fetch's lead before the enter, in seconds at the crossing's speed, is printed.
// Browser-free: node --test tools/perf/region-hitch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RegionMap, REGIONS, approachOf, FLIGHT_APPROACH_M, APPROACH_M } from '../../src/core/regions.js';
import { CROSSINGS, sweep } from './region-hitch-paths.mjs';

const map = new RegionMap().build();
const mal = REGIONS.find((r) => r.id === 'malpais');

test('the Malpais as data: approached at 60 m walking and 150 m flying; the other regions keep the seam\'s', () => {
  assert.equal(approachOf(mal, 'walk'), 60);
  assert.equal(approachOf(mal, 'flight'), 150);
  for (const r of REGIONS.filter((x) => x.id !== 'malpais')) { assert.equal(approachOf(r, 'walk'), APPROACH_M); assert.equal(approachOf(r, 'flight'), FLIGHT_APPROACH_M); }
  assert.equal(mal.built, false);
  assert.deepEqual({ ...mal.standIn }, { residentMb: 16, shippedMb: 14 });
});

for (const c of CROSSINGS) {
  test(`${c.id}: starts in the ${c.from} outside the approach, ends in the ${c.to}; one crossing each way`, () => {
    assert.equal(map.regionAt(c.a.x, c.a.z), c.from);
    assert.equal(map.regionAt(c.b.x, c.b.z), c.to);
    assert.ok(map.depth(c.to, c.a.x, c.a.z) < -(approachOf(mal, c.mode) + 10), 'starts outside the approach band');
    const { L, ev } = sweep(map, c);
    const mine = ev.filter((e) => e.region === 'malpais' || e.region === c.from);
    const seq = mine.filter((e) => e.type !== 'approach' || e.region === 'malpais').filter((e) => !(e.type === 'depart' && e.region !== 'malpais'))
      .map((e) => `${e.leg}:${e.type}:${e.region}`);
    assert.deepEqual(seq.filter((s) => !s.endsWith(`approach:${c.from}`)), [
      `out:enter:${c.from}`, 'out:approach:malpais', `out:leave:${c.from}`, 'out:enter:malpais',
      'back:leave:malpais', `back:enter:${c.from}`, 'back:depart:malpais',
    ]);
    const ap = ev.find((e) => e.type === 'approach' && e.region === 'malpais'), en = ev.find((e) => e.type === 'enter' && e.region === 'malpais');
    const lead = (en.m - ap.m) / c.speed;
    console.log(`  ${c.id}: ${L} m at ${c.speed} m/s; approach at ${ap.m} m, enter at ${en.m} m: the fetch leads the enter by ${lead.toFixed(1)} s`);
    assert.ok(lead >= 10, `lead ${lead.toFixed(1)} s`);
  });
}
