// Milestone 3 rule 15 (area F, EF1's Node half): the regions seam along A-region-hitch's crossings
// (tools/perf/region-hitch-paths.mjs), in each crossing's mode. Out: approach the Malpais, leave the Holds, enter the
// Malpais, once each; back: leave the Malpais, enter the Holds, depart the Malpais. The Malpais is approached at 60 m on
// foot and 150 m in the air; the fetch's lead before the enter, in seconds at the crossing's speed, is printed.
// Browser-free: node --test tools/perf/region-hitch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RegionMap, RegionTracker, REGIONS, approachOf, regionById, modeOfFlight, FLIGHT_APPROACH_M, APPROACH_M } from '../../src/core/regions.js';
import { FLIGHT_STATES } from '../../src/game/kite/flight.js';
import { CROSSINGS, sweep } from './region-hitch-paths.mjs';

const map = new RegionMap().build();
const mal = REGIONS.find((r) => r.id === 'malpais');

test('the Malpais and (M3 wave 2) the Holds as data: approached at 60 m walking and 150 m flying; the other regions keep the seam\'s', () => {
  for (const id of ['malpais', 'holds']) { assert.equal(approachOf(regionById(id), 'walk'), 60, id); assert.equal(approachOf(regionById(id), 'flight'), 150, id); }
  for (const r of REGIONS.filter((x) => x.id !== 'malpais' && x.id !== 'holds')) { assert.equal(approachOf(r, 'walk'), APPROACH_M); assert.equal(approachOf(r, 'flight'), FLIGHT_APPROACH_M); }
  assert.equal(mal.built, false);
  assert.deepEqual({ ...mal.standIn }, { residentMb: 16, shippedMb: 14 });
});

test('the flight seam binds the mode: any flight state but none approaches the Malpais at 150 m, none at 60 m', () => {
  for (const st of FLIGHT_STATES) assert.equal(modeOfFlight(st), st === 'none' ? 'walk' : 'flight', st);
  assert.equal(modeOfFlight(undefined), 'walk');
  // the game binds it (src/game/runtime.js installGame), not a row: the page row reads the bound modeOf back
  assert.match(readFileSync(new URL('../../src/game/runtime.js', import.meta.url), 'utf8'), /tracker\.modeOf = \(\) => modeOfFlight\(ctx\.player\?\.flight\)/);
  const c = CROSSINGS.find((x) => x.id === 'holds-malpais-kite');
  for (const [flight, want] of [['gliding', -150], ['none', -60]]) {
    const P = { flight };
    const tr = new RegionTracker(map, { modeOf: () => modeOfFlight(P.flight) });
    const L = Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z);
    let got = null;
    for (let s = 0; s <= L && got == null; s += 0.25) {
      const x = c.a.x + ((c.b.x - c.a.x) * s) / L, z = c.a.z + ((c.b.z - c.a.z) * s) / L;
      const e = tr.update(x, z).find((q) => q.type === 'approach' && q.region === 'malpais');
      if (e) got = e.depth;
    }
    assert.ok(Math.abs(got - want) <= 0.5, `${flight}: approached at depth ${got}, want ${want}`);
  }
});

test('EF1: the crossings are every border among the Pans, the Holds and the Malpais, each at a jog and in the air', () => {
  const n = map.n, pairs = new Set();
  const want = new Set(['pans', 'holds', 'malpais']);
  for (let iz = 0; iz < n - 1; iz++) for (let ix = 0; ix < n - 1; ix++) {
    const a = map.label[iz * n + ix];
    for (const o of [map.label[iz * n + ix + 1], map.label[(iz + 1) * n + ix]]) {
      if (a === o || a === 255 || o === 255) continue;
      const p = [map.regions[a].id, map.regions[o].id].sort();
      if (want.has(p[0]) && want.has(p[1])) pairs.add(p.join('-'));
    }
  }
  assert.deepEqual([...pairs].sort(), ['holds-malpais', 'holds-pans']);
  for (const p of pairs) for (const mode of ['walk', 'flight']) {
    assert.ok(CROSSINGS.some((c) => [c.from, c.to].sort().join('-') === p && c.mode === mode), `${p} ${mode}`);
  }
});

for (const c of CROSSINGS) {
  test(`${c.id}: starts in the ${c.from} outside the approach, ends in the ${c.to}; one crossing each way`, () => {
    const to = regionById(c.to);
    assert.equal(map.regionAt(c.a.x, c.a.z), c.from);
    assert.equal(map.regionAt(c.b.x, c.b.z), c.to);
    assert.ok(map.depth(c.to, c.a.x, c.a.z) < -(approachOf(to, c.mode) + 10), 'starts outside the approach band');
    const { L, ev } = sweep(map, c);
    const mine = ev.filter((e) => e.region === c.to || e.region === c.from);
    const seq = mine.filter((e) => e.type !== 'approach' || e.region === c.to).filter((e) => !(e.type === 'depart' && e.region !== c.to))
      .map((e) => `${e.leg}:${e.type}:${e.region}`);
    assert.deepEqual(seq.filter((s) => !s.endsWith(`approach:${c.from}`)), [
      `out:enter:${c.from}`, `out:approach:${c.to}`, `out:leave:${c.from}`, `out:enter:${c.to}`,
      `back:leave:${c.to}`, `back:enter:${c.from}`, `back:depart:${c.to}`,
    ]);
    const ap = ev.find((e) => e.type === 'approach' && e.region === c.to), en = ev.find((e) => e.type === 'enter' && e.region === c.to);
    const lead = (en.m - ap.m) / c.speed;
    console.log(`  ${c.id}: ${L} m at ${c.speed} m/s; approach at ${ap.m} m, enter at ${en.m} m: the fetch leads the enter by ${lead.toFixed(1)} s`);
    assert.ok(lead >= 10, `lead ${lead.toFixed(1)} s`);
    if (c.to !== 'malpais' && c.from !== 'malpais') assert.ok(!ev.some((e) => e.region === 'malpais'), 'the Malpais is never approached on a crossing that is not its own');
  });
}

test('(fix round 1) a long frame\'s cause: a program linked in it is a compile even at 0 ms (parallel compile), and the build step open over it is named', async () => {
  const { causeOf } = await import('./region-hitch-cause.mjs');
  // the frame of deb74cc's jog (run 20261120T123120Z-deb74cc-region-hitch): 35.3 ms inside the Malpais' compile step
  const marks = [{ t: 36838, tag: 'malpais:register' }, { t: 37415, tag: 'malpais:compile' }, { t: 37438, tag: 'malpais:add' }];
  const f = { t: 37118, d: 35.3, gl: { compileShader: [4, 0], linkProgram: [2, 0], getProgramParameter: [2, 0], texSubImage2D: [5, 0.1] } };
  const c = causeOf(f, marks);
  assert.equal(c.cause, 'compile'); assert.equal(c.during, 'malpais:compile'); assert.equal(c.links, 2);
  // nothing in it, nothing open: unattributed (a crossing with one fails)
  assert.equal(causeOf({ t: 50000, d: 40, gl: {} }, marks).cause, 'unattributed');
  assert.equal(causeOf({ t: 50000, d: 40, gl: {} }, marks).during, null);
  assert.equal(causeOf({ t: 900, d: 40, gl: { texImage2D: [1, 7] } }, []).cause, 'upload');
});
