/**
 * BUILD M1.5d — the routines' log in Node (no browser): src/world/npc/people/routines.js driven over two in-game hours
 * (18:00-20:00 on the environment's golden clock: 1800 s a day, the same rate function) with stand-in people that walk at
 * 1.2 m/s through the game's own walk step (src/world/npc/people/walk.js walkToward) and play whatever clip they are told,
 * on the people's walk grid (src/core/nav.js WalkGrid) built from the island's recipe heights, its sea and its Glass, the
 * town's own colliders (src/world/settlements/saltrow-layout.js seatTown + townColliders, registered in the game's
 * src/core/collision.js) and the home Brazier's discs. The live log is the probe's (m15-probe-page.mjs on F22). Rows:
 *   - every routine person changes activity 3 or more times
 *   - nobody stands still more than 90 s outside a work clip
 *   - every person has a clip at every step (no bind pose)
 *   - 0 path segments through collision: every leg of every route walked, marched at 0.1 m, a 0.25 m capsule at the
 *     ground against every static blocking collider (collision.resolveCapsule), the Brazier's discs and the water
 *   - 0 samples of a walking person inside a collider; 0 walks off the grid (`navMiss`)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Routines, WORK_CLIPS, places, wayOf, SALTROW_WALK } from '../../../../src/world/npc/people/routines.js';
import { walkToward } from '../../../../src/world/npc/people/walk.js';
import { SALTROW_KEEPOUTS, CREW, streetPoint, seatTown, townColliders } from '../../../../src/world/settlements/saltrow-layout.js';
import { heightAt, GLASS, GLASS_LEVEL, SEA_LEVEL } from '../../../../src/world/island/recipe.js';
import { ISLAND_SCALE } from '../../../../src/world/island/extent.js';
import { Collision } from '../../../../src/core/collision.js';
import { WalkGrid, WALK } from '../../../../src/core/nav.js';

const SUN_RISE = 6.6, SUN_SET = 19.6;   // near enough for the rate's shape; the exact hours are the environment's
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const elev = (h) => 50 * Math.sin(Math.PI * (h - SUN_RISE) / (SUN_SET - SUN_RISE));
const rate = (e) => 1 + 1.5 * (1 - smooth(-5, -3, e)) - 0.5 * smooth(1, 3, e) * (1 - smooth(21, 23, e));
const NORM = (() => { let s = 0; for (let i = 0; i < 4800; i++) s += 1 / rate(elev((i + 0.5) * 24 / 4800)); return s / 4800; })();
const clockRate = (h) => 24 / 1800 * rate(elev(h)) * NORM;

/* the island's water as src/world/water.js levelAt reads it (the Glass's ellipse at 2.2, else the sea) */
const S = ISLAND_SCALE, G = { x: GLASS.e * S, z: -GLASS.n * S, rx: GLASS.re * S, rz: GLASS.rn * S };
const height = (x, z) => heightAt(x, z);
const depth = (x, z) => {
  const h = height(x, z), gx = (x - G.x) / G.rx, gz = (z - G.z) / G.rz;
  if (gx * gx + gz * gz < 2.2 && h < GLASS_LEVEL) return GLASS_LEVEL - h;
  return h < SEA_LEVEL ? SEA_LEVEL - h : 0;
};

/** The town's collision world and the walk grid over it, once per file (the grid's build is the slow part in Node). */
let WORLD = null;
function townWorld() {
  if (WORLD) return WORLD;
  const C = new Collision({});
  const town = seatTown(height);
  const ids = townColliders({ ...town, ground: height }).map((d) => C.register(d));
  const grid = new WalkGrid(SALTROW_WALK.box, { height, depth, colliders: () => C.colliders, forEachTriangle: (c, f) => C.forEachTriangle(c, f) }, { discs: SALTROW_WALK.discs });
  grid.build();
  WORLD = { C, grid, colliderCount: ids.length };
  return WORLD;
}

class Stand {
  constructor(id, x, z, seed) { this.id = id; this.seed = seed; this.group = { position: { x, z }, rotation: { y: 0 } }; this.yaw = 0; this.cur = null; this.walk = null; this.props = []; this._o = { yaw: 0, x: 0, z: 0, arrived: false }; }
  get current() { return this.cur ? { getClip: () => ({ name: this.cur }) } : null; }
  get walkTarget() { return this.walk; }
  play(name) { this.cur = name; return 2; }
  stopWalk() { this.walk = null; }
  walkTo(x, z, then) { this.walk = { x, z, then }; this.cur = 'Walk_Loop'; }
  showProps() {}
  setPosition(x, z) { this.group.position.x = x; this.group.position.z = z; }
  step(dt) {
    const W = this.walk; if (!W) return;
    const o = this._o, p = this.group.position;
    o.yaw = this.yaw; o.x = p.x; o.z = p.z;
    walkToward(o, W, 1.2 * dt, dt);
    this.yaw = o.yaw; p.x = o.x; p.z = o.z;
    if (o.arrived) { this.walk = null; W.then?.(this); }
  }
}

function run(withGrid = true) {
  const crew = CREW.map((c, i) => { const at = streetPoint(c.s, c.r); return { id: c.id, person: new Stand(c.id, at.x, at.z, 211 + i * 29) }; });
  let h = 18.0;
  const people = crew.map((c) => c.person);
  const W = withGrid ? townWorld() : null;
  const nav = W ? { walkGrid: () => W.grid, addWalkGrid: () => W.grid } : null;
  const sys = {
    ctx: { params: null, environment: { time: h }, terrain: { getHeight: height }, nav, settlements: { town: { crew, loaded: true, colliderCount: W ? W.colliderCount : 0 } } },
    spawn: async (id, o) => { const p = new Stand(id, o.x, o.z, o.seed); people.push(p); return p; },
    _propsFor: () => [],
  };
  const R = new Routines(sys);
  R.hourOf = () => h;
  const all = [];
  const route0 = R.route.bind(R);
  R.route = (e, from, step) => { const path = route0(e, from, step); all.push(R.routes[R.routes.length - 1]); return path; };
  return { R, W, people, all, step: async (dt) => { h += clockRate(h) * dt; for (const p of people) p.step(dt); R.update(dt); }, hour: () => h };
}

/** A capsule of radius r at the ground at (x, z) against every static blocking collider: the collider it is inside, or null. */
function insideAt(C, x, z, r = 0.25) {
  const pos = { x, y: height(x, z), z };
  const res = C.resolveCapsule(pos, r, 1.6, { passes: 1, filter: (c) => c.blocking && !c.dynamic && c.kind !== 'npc' });
  return res.hit ? res.collider : null;
}

/** Every leg of a route, marched at 0.1 m: collider hits, disc hits and wet samples. */
function auditRoute(C, rec, r = 0.25) {
  const bad = [];
  for (let i = 0; i + 1 < rec.pts.length; i++) {
    const a = rec.pts[i], b = rec.pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.1));
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      const c = insideAt(C, x, z, r);
      if (c) { bad.push(`${rec.id} -> ${rec.act} leg ${i}: in a ${c.kind} collider at ${x.toFixed(2)}, ${z.toFixed(2)}`); break; }
      const disc = SALTROW_WALK.discs.find((d) => Math.hypot(x - d.x, z - d.z) < d.r + r);
      if (disc) { bad.push(`${rec.id} -> ${rec.act} leg ${i}: in a Brazier disc at ${x.toFixed(2)}, ${z.toFixed(2)}`); break; }
      if (depth(x, z) > WALK.wet) { bad.push(`${rec.id} -> ${rec.act} leg ${i}: in ${depth(x, z).toFixed(2)} m of water at ${x.toFixed(2)}, ${z.toFixed(2)}`); break; }
    }
  }
  return bad;
}

test('two in-game hours of routines on the walk grid: changes, standing still, clips, 0 legs through collision', async () => {
  const S = run(true);
  // the keeper's spawn resolves on the next tick
  await S.step(1 / 30); await new Promise((r) => setTimeout(r, 0)); await S.step(1.1);
  const log = new Map();
  const dt = 1 / 30;
  let t = 0, insideSamples = 0, sampleT = 0;
  const insideAtList = [];
  while (S.hour() < 20.0) {
    await S.step(dt);
    t += dt;
    sampleT += dt;
    const sample = sampleT >= 0.25;
    if (sample) sampleT -= 0.25;
    for (const e of S.R.list) {
      let L = log.get(e.id);
      if (!L) log.set(e.id, L = { last: null, changes: 0, still: 0, maxStill: 0, anchor: null, noClip: 0, acts: [] });
      const p = e.person, g = p.group.position;
      if (!p.cur) L.noClip++;
      if (e.act !== 'walk' && e.act !== L.last) { if (L.last && L.last !== 'start') L.changes++; L.last = e.act; L.acts.push(e.act); }
      const working = p.cur && WORK_CLIPS.has(p.cur);
      if (!L.anchor || Math.hypot(g.x - L.anchor.x, g.z - L.anchor.z) > 0.25 || working) { L.anchor = { x: g.x, z: g.z }; L.still = 0; }
      else { L.still += dt; L.maxStill = Math.max(L.maxStill, L.still); }
      if (sample && e.act === 'walk') { const c = insideAt(S.W.C, g.x, g.z, 0.2); if (c) { insideSamples++; if (insideAtList.length < 5) insideAtList.push(`${e.id} at ${g.x.toFixed(2)}, ${g.z.toFixed(2)} (${c.kind})`); } }
    }
  }
  assert.equal(S.R.list.length, CREW.length + 1, 'the crew and the keeper');
  const bad = [];
  for (const [id, L] of log) {
    if (L.changes < 3) bad.push(`${id}: ${L.changes} changes (${L.acts.join(' ')})`);
    if (L.maxStill > 90) bad.push(`${id}: still ${L.maxStill.toFixed(1)} s`);
    if (L.noClip) bad.push(`${id}: ${L.noClip} steps with no clip`);
  }
  const keeper = log.get('lantern-keeper-2');
  assert.ok(keeper.acts.includes('light'), `the lamp is lit: ${keeper.acts.join(' ')}`);
  const legsBad = [];
  let legs = 0;
  for (const rec of S.all) { legs += rec.pts.length - 1; legsBad.push(...auditRoute(S.W.C, rec)); }
  const misses = S.R.list.reduce((n, e) => n + (e.navMiss || 0), 0), offGrid = S.all.filter((r) => !r.grid).length;
  const summary = { simS: +t.toFixed(0), routes: S.all.length, legs, legsThroughCollision: legsBad.length, navMiss: misses, offGrid, insideSamples, grid: S.W.grid.audit(),
    rows: [...log].map(([id, L]) => ({ id, changes: L.changes, maxStillS: +L.maxStill.toFixed(1), acts: L.acts.join(' ') })) };
  if (process.env.R5_ROUTINE_LOG) console.log(JSON.stringify(summary));
  assert.deepEqual(bad, [], `simulated ${t.toFixed(0)} s`);
  assert.deepEqual(legsBad.slice(0, 8), [], `${legsBad.length} of ${legs} legs through collision`);
  assert.equal(misses, 0, 'every walk found a path on the grid');
  assert.equal(offGrid, 0, 'every route on the grid');
  assert.deepEqual(insideAtList, [], `${insideSamples} walking samples inside a collider`);
});

test('the walk grid joins every pair of routine places, and every path keeps clear of collision', () => {
  const W = townWorld();
  const P = places();
  const pts = Object.entries(P).filter(([k, v]) => v && typeof v.x === 'number' && k !== 'sea' && k !== 'lamp' && k !== 'pans' && k !== 'coneR' && k !== 'coneL');
  const bad = [];
  let n = 0;
  for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts.length; j++) {
    if (i === j) continue;
    const p = W.grid.path(pts[i][1], pts[j][1]);
    n++;
    if (!p) { bad.push(`no path ${pts[i][0]} -> ${pts[j][0]}`); continue; }
    bad.push(...auditRoute(W.C, { id: pts[i][0], act: pts[j][0], pts: p }));
    const end = p[p.length - 1];
    if (Math.hypot(end.x - pts[j][1].x, end.z - pts[j][1].z) > 0.75) bad.push(`${pts[i][0]} -> ${pts[j][0]} ends ${Math.hypot(end.x - pts[j][1].x, end.z - pts[j][1].z).toFixed(2)} m off the place`);
  }
  assert.ok(n > 300, `${n} pairs`);
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} bad of ${n}`);
});

test('no authored place or fallback walk through a building of Saltrow', () => {
  // every step's place and every leg of the authored fallback (waypoints in order) against each keep-out's hard radius
  // minus 0.6 m (a door step is inside the footprint's circle: the circle is the footprint's corners)
  const legs = [];
  const mod = new Routines({ ctx: { params: null }, _propsFor: () => [] });
  mod.adopt({ group: { position: { x: 0, z: 0 }, rotation: {} }, seed: 1, setPosition() {}, play: () => 1, showProps() {}, stopWalk() {}, walkTo() {}, _beatT: 0 }, 'salt-raker');
  for (const [id, loop] of Object.entries(mod.L)) {
    for (const list of [loop.day, loop.night].filter(Boolean)) {
      for (let k = 0; k < list.length; k++) {
        const a = list[k].at, b = list[(k + 1) % list.length];
        const way = [a, ...wayOf(a, b)];
        for (let i = 0; i + 1 < way.length; i++) legs.push({ id, from: way[i], to: way[i + 1], step: b.act });
      }
    }
  }
  const hit = [];
  const segDist = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2)); return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z); };
  for (const g of legs) for (const k of SALTROW_KEEPOUTS.filter((q) => !/street/.test(q.id))) {
    const d = segDist(k, g.from, g.to), endIn = Math.hypot(g.to.x - k.x, g.to.z - k.z) < k.hard || Math.hypot(g.from.x - k.x, g.from.z - k.z) < k.hard;
    if (d < k.hard - 0.6 && !endIn) hit.push(`${g.id} -> ${g.step}: ${k.id} ${d.toFixed(2)} m`);
  }
  assert.deepEqual(hit, []);
});

test('every place stands on dry ground, outside every collider and Brazier disc', () => {
  const W = townWorld();
  const mod = new Routines({ ctx: { params: null }, _propsFor: () => [] });
  mod.adopt({ group: { position: { x: 0, z: 0 }, rotation: {} }, seed: 1, setPosition() {}, play: () => 1, showProps() {}, stopWalk() {}, walkTo() {}, _beatT: 0 }, 'salt-raker');
  const wet = [];
  for (const [id, loop] of Object.entries(mod.L)) for (const list of [loop.day, loop.night].filter(Boolean)) for (const s of list) {
    for (const q of [s.at, ...(s.via || [])]) { const h = heightAt(q.x, q.z); if (!(h > 0.1)) wet.push(`${id} ${s.act}: ${h.toFixed(2)} m at ${q.x.toFixed(1)}, ${q.z.toFixed(1)}`); }
    const c = insideAt(W.C, s.at.x, s.at.z, 0.25);
    if (c) wet.push(`${id} ${s.act}: inside a ${c.kind} collider`);
    if (SALTROW_WALK.discs.some((d) => Math.hypot(s.at.x - d.x, s.at.z - d.z) < d.r + 0.25)) wet.push(`${id} ${s.act}: inside a Brazier disc`);
  }
  assert.deepEqual(wet, []);
});
