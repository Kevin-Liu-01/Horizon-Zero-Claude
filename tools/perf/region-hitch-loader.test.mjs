// Milestone 3 wave 2 (area F, EF1 and EF2): the regions seam's OWN loader runs the hitch stand-in's order (load, upload,
// register, compile and wait, then add) and unloads on depart; a region departed mid-load is never added; and the Holds'
// cast leaves memory when the tracker departs the Holds (the game's own holds.js, driven along A-region-hitch's walk to
// the Yards). Browser-free: node --test tools/perf/region-hitch-loader.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RegionMap, RegionTracker, RegionLoader, LOAD_STEPS, regionById, approachOf, HYSTERESIS_M } from '../../src/core/regions.js';
import { WELLHEADS } from '../../src/world/sites/kilnyards-layout.js';
import { CROSSINGS } from './region-hitch-paths.mjs';

const tick = () => new Promise((r) => setImmediate(r));
const fakeMap = () => new RegionMap({ classify: (x) => (x < 0 ? 'pans' : 'malpais'), size: 600, cell: 4 }).build();

function rig({ slowCompile = false } = {}) {
  const log = [], tr = new RegionTracker(fakeMap());
  let release = null;
  const ld = new RegionLoader(tr, {
    assetsOf: (r) => (r.id === 'malpais' ? { a: { url: '/a.glb' }, b: { url: '/b.glb' } } : {}),
    load: async (r, rows) => { log.push(['load', r.id]); return Object.keys(rows).map((name) => ({ name })); },
    upload: async (r, held) => { log.push(['upload', held.length]); },
    register: (r, held) => { log.push(['register', held.length]); },
    compile: (r, held) => { log.push(['compile', held.length]); return slowCompile ? new Promise((res) => { release = res; }) : Promise.resolve(); },
    add: (r, held) => { log.push(['add', held.map((e) => e.name).join(',')]); },
    unload: (r, held) => { log.push(['unload', (held || []).map((e) => e.name).join(',')]); },
  });
  return { tr, ld, log, release: () => release?.() };
}

test('the loader runs load, upload, register, compile (awaited), add, in that order, and nothing is added before the compile resolves', async () => {
  const R = rig({ slowCompile: true });
  R.tr.update(-200, 0); R.tr.update(-50, 0);          // within the Malpais' 60 m on foot: approach
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(R.log.map((x) => x[0]), ['load', 'upload', 'register', 'compile'], 'waiting on the compile: not added');
  assert.equal(R.ld.status().malpais.state, 'loading');
  R.release();
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(R.log.map((x) => x[0]), ['load', 'upload', 'register', 'compile', 'add']);
  assert.deepEqual(R.ld.status().malpais.steps.map((s) => s.step), LOAD_STEPS.slice());
  assert.equal(R.ld.status().malpais.state, 'resident');
  console.log(`  steps: ${R.ld.status().malpais.steps.map((s) => s.step).join(' > ')}`);
});

test('depart unloads what was added; a region departed mid-load runs out and is released, never added', async () => {
  const R = rig();
  R.tr.update(-200, 0); R.tr.update(-50, 0);
  for (let i = 0; i < 5; i++) await tick();
  R.tr.update(-200, 0);                                 // 200 m out: past 60 + 20, depart
  assert.deepEqual(R.log.at(-1), ['unload', 'a,b']);
  assert.equal(R.ld.status().malpais.state, 'idle');
  const S = rig({ slowCompile: true });
  S.tr.update(-200, 0); S.tr.update(-50, 0);
  for (let i = 0; i < 5; i++) await tick();
  S.tr.update(-200, 0);                                 // departed while the compile is pending
  S.release();
  for (let i = 0; i < 5; i++) await tick();
  assert.ok(!S.log.some((x) => x[0] === 'add'), 'never added');
  assert.deepEqual(S.log.at(-1), ['unload', 'a,b'], 'what landed is released');
});

test('the Holds\' cast follows the tracker: departed on the walk to the Yards before any wellhead, back on the approach', async () => {
  const { HoldsPeople } = await import('../../src/world/npc/people/holds.js');
  const map = new RegionMap().build();
  const tr = new RegionTracker(map);
  const pl = { x: 0, z: 0 };
  const spawned = [], despawned = [];
  const ctx = { regions: { tracker: tr }, player: { position: pl }, state: 'playing', nav: null, settlements: null, machines: { list: [] } };
  const sys = { ctx, spawn: async (id) => { spawned.push(id); return { id }; }, despawn: (p) => despawned.push(p.id) };
  const H = new HoldsPeople(sys);
  H.live = () => true;
  H.routines.update = () => {}; H.routines.adopt = () => {}; H.routines.remove = () => {};
  // stand at Ninewalls' cast: in the Holds, the cast stands
  const at = (x, z) => { pl.x = x; pl.z = z; tr.update(x, z); H.update(0.3); };
  at(-11, 213);
  for (let i = 0; i < 40; i++) { H.update(0.3); await tick(); }
  assert.equal(H.state, 'in');
  assert.ok(H.persons.size >= 5, `${H.persons.size} of the cast stand`);
  // A-region-hitch's walk toward the Yards, then on to each wellhead: the cast leaves before the first wellhead
  const c = CROSSINGS.find((x) => x.id === 'holds-malpais-jog');
  let goneAt = null, walked = 0;
  // the walk: A-region-hitch's line to its end inside the Malpais, then on to each wellhead in turn (1 m steps)
  const legs = [[c.a, c.b], [c.b, WELLHEADS[0]], ...WELLHEADS.slice(1).map((w, i) => [WELLHEADS[i], w])];
  at(c.a.x, c.a.z);
  for (const [p0, p1] of legs) {
    const L = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    for (let s = 0; s <= L; s += 1) {
      at(p0.x + ((p1.x - p0.x) * s) / L, p0.z + ((p1.z - p0.z) * s) / L);
      if (H.state !== 'in' && goneAt == null) goneAt = { s: walked + s, depth: +map.depth('holds', pl.x, pl.z).toFixed(1), wellheadsReached: WELLHEADS.filter((w) => Math.hypot(w.x - pl.x, w.z - pl.z) < 1).length };
    }
    walked += L;
    if (p1.id) { assert.equal(H.state, 'out', `${p1.id}: the Holds' cast is out`); assert.ok(!tr.near.has('holds'), p1.id); }
  }
  assert.ok(goneAt, 'the cast left on the walk');
  const want = -(approachOf(regionById('holds'), 'walk') + HYSTERESIS_M);
  assert.ok(goneAt.depth <= want + 0.5, `left at depth ${goneAt.depth}`);
  assert.equal(despawned.length, H.stats.despawns);
  console.log(`  the cast left ${goneAt.s.toFixed(0)} m along the walk, ${-goneAt.depth} m outside the Holds (depart at ${-want} m); 0 of 4 wellheads hold it`);
  // back: approached at 60 m, then within SPAWN_R of the centre it stands again
  at(-11, 213);
  for (let i = 0; i < 40; i++) { H.update(0.3); await tick(); }
  assert.equal(H.state, 'in');
});
