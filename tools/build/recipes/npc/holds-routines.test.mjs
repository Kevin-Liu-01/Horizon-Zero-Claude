/**
 * M2 wave 3 (area B; BUILD M2.13 "the M1.5d log rows at Ninewalls", briefs §5 NW8, NW9): the Holds people at Ninewalls in
 * Node, no browser. src/world/npc/people/holds.js driven as the game drives it (HoldsPeople.update: the cast streamed in by
 * her distance, adopted by the routines on the walk grid), with stand-in people that walk through the game's own walk step
 * (src/world/npc/people/walk.js walkToward) at their clip's own pace: the clip pack's stride table (public/models/npc/npc-clips.glb
 * r5Clips.gaits: Walk_Loop 0.73 m/s male, 0.72 female, times the person's ts; Jog_Fwd_Loop 3.24 / 3.13), on the people's
 * walk grid (src/core/nav.js WalkGrid) over the island recipe's heights as the bake samples them (1.94 m nodes, bilinear, as
 * terrain.getHeight reads them) and the village's colliders (src/world/settlements/ninewalls-layout.js ninewallsColliders,
 * registered in the game's src/core/collision.js). Rows:
 *   NW8   two in-game hours (10:00-12:00, the first hour's; and 16:00-18:00): each person changes activity >= 3 times; nobody
 *         still over 90 s outside a work clip; a clip at every step (no bind pose); 0 legs of any route through collision (every
 *         leg marched at 0.1 m, a 0.25 m capsule at the ground against every static blocking collider and the Brazier's disc);
 *         0 walking samples inside a collider; every walk on the grid
 *   NW8   the youths trail a herd on the slope 6-12 m* behind its last hull (* this band is confirmed on this first run)
 *   NW9   a Screed walked in from the north-east charging her again and again: 0 people within 10 m of any charge line
 *         while it is inside the outer wall; nobody has a hit table, nobody dies
 *   M1.5d the lookout rule in the Holds: the warning within 3 s at 80 m of the nearest of them; the herd is never called
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HoldsPeople, HOLDS_CAST, NINEWALLS_WALK, ORO_ANCHOR, holdsPlaces, ALARM_R } from '../../../../src/world/npc/people/holds.js';
import { WORK_CLIPS } from '../../../../src/world/npc/people/routines.js';
import { LOOKOUT } from '../../../../src/world/npc/people/lookout.js';
import { walkToward } from '../../../../src/world/npc/people/walk.js';
import * as NWL from '../../../../src/world/settlements/ninewalls-layout.js';
import { heightAt } from '../../../../src/world/island/recipe.js';
import { GRID } from '../../../../src/world/island/bake.js';
import { Collision } from '../../../../src/core/collision.js';
import { WalkGrid } from '../../../../src/core/nav.js';
import { ScreedBrain, SCREED_RULES } from '../../../../src/instruments/kinds/screed-rules.js';
import { HERD_SLOPE } from '../../../../src/world/holds/blockout.js';
import { ISLAND_SCALE as S } from '../../../../src/world/island/extent.js';
import { byId } from './lib/archetypes.mjs';

const { CENTRE, OUTER_R, ninewallsColliders } = NWL;

/* the environment's clock (as routines.test.mjs: 1800 s a day, slower at the golden hours) */
const SUN_RISE = 6.6, SUN_SET = 19.6;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const elev = (h) => 50 * Math.sin(Math.PI * (h - SUN_RISE) / (SUN_SET - SUN_RISE));
const rate = (e) => 1 + 1.5 * (1 - smooth(-5, -3, e)) - 0.5 * smooth(1, 3, e) * (1 - smooth(21, 23, e));
const NORM = (() => { let s = 0; for (let i = 0; i < 4800; i++) s += 1 / rate(elev((i + 0.5) * 24 / 4800)); return s / 4800; })();
const clockRate = (h) => 24 / 1800 * rate(elev(h)) * NORM;

/* the ground as terrain.getHeight reads it: the recipe at the bake's nodes, bilinear between */
const GS = GRID.step, GH = GRID.half, nodes = new Map();
const node = (ix, iz) => { const k = ix * 100003 + iz; let v = nodes.get(k); if (v === undefined) { v = heightAt(ix * GS - GH, iz * GS - GH); nodes.set(k, v); } return v; };
const ground = (x, z) => {
  const fx = (x + GH) / GS, fz = (z + GH) / GS, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = node(ix, iz) + (node(ix + 1, iz) - node(ix, iz)) * tx, b = node(ix, iz + 1) + (node(ix + 1, iz + 1) - node(ix, iz + 1)) * tx;
  return a + (b - a) * tz;
};

let WORLD = null;
function village() {
  if (WORLD) return WORLD;
  const C = new Collision({});
  const ids = ninewallsColliders(ground).map((d) => C.register(d));
  const t0 = Date.now();
  const grid = new WalkGrid(NINEWALLS_WALK.box, { height: ground, depth: null, colliders: () => C.colliders, forEachTriangle: (c, f) => C.forEachTriangle(c, f) }, { discs: NINEWALLS_WALK.discs, radius: NINEWALLS_WALK.radius });
  grid.build();
  WORLD = { C, grid, colliders: ids.flat().length, buildMs: Date.now() - t0 };
  return WORLD;
}

/* the clip pack's paces (m/s at ts 1) */
const PACE = { M: { Walk_Loop: 0.728, Jog_Fwd_Loop: 3.241 }, F: { Walk_Loop: 0.719, Jog_Fwd_Loop: 3.127 } };

class Stand {
  constructor(id, o) {
    this.id = o.id || id; this.archetype = id; this.seed = o.seed; this.spec = byId[id];
    this.group = { position: { x: o.x, z: o.z }, rotation: { y: 0 } }; this.yaw = 0; this.cur = null; this.walk = null; this.gaitOverride = null;
    this._o = { yaw: 0, x: 0, z: 0, arrived: false };
  }
  get current() { return this.cur ? { getClip: () => ({ name: this.cur }) } : null; }
  get walkTarget() { return this.walk; }
  play(name) { this.cur = name; return 2; }
  stopWalk() { this.walk = null; }
  walkTo(x, z, then) { const g = this.gaitOverride || 'Walk_Loop'; this.walk = { x, z, then, v: PACE[this.spec.sex][g] * (this.gaitOverride ? 1 : this.spec.clips.walk.ts) }; this.cur = g; }
  showProps() {}
  setPosition(x, z) { this.group.position.x = x; this.group.position.z = z; }
  step(dt) {
    const W = this.walk; if (!W) return;
    const o = this._o, p = this.group.position;
    o.yaw = this.yaw; o.x = p.x; o.z = p.z;
    walkToward(o, W, W.v * dt, dt);
    this.yaw = o.yaw; p.x = o.x; p.z = o.z;
    if (o.arrived) { this.walk = null; W.then?.(this); }
  }
}

/** Ninewalls with Brea at its centre's lane, the cast streamed in, and whatever machines the test hands in. */
async function world({ hour = 10, machines = [], before = [] } = {}) {
  const W = village();
  let h = hour;
  const people = [...before];
  const events = [];
  const player = { position: { x: CENTRE.x - 14, z: CENTRE.z + 8 } };
  const ctx = {
    params: null, player, machines: { list: machines }, terrain: { getHeight: ground }, environment: { time: h },
    nav: { walkGrid: () => W.grid, addWalkGrid: () => W.grid }, settlements: { ninewalls: { stats: { colliders: W.colliders } } },
    events: { emit: (ev, o) => events.push({ ev, ...o }) }, systemsGame: null,
  };
  const sys = {
    ctx, list: people,
    spawn: async (id, o) => { const p = new Stand(id, o); people.push(p); return p; },
    despawn: (p) => { const i = people.indexOf(p); if (i >= 0) people.splice(i, 1); },
    _propsFor: () => [],
  };
  const H = new HoldsPeople(sys);
  H.routines.hourOf = () => h;
  const all = [];
  const route0 = H.routines.route.bind(H.routines);
  H.routines.route = (e, from, step) => { const path = route0(e, from, step); all.push(H.routines.routes[H.routines.routes.length - 1]); return path; };
  const step = (dt) => { h += clockRate(h) * dt; for (const p of people) p.step(dt); H.update(dt); };
  // stream the cast in (one a quarter second; each spawn resolves on the next tick)
  for (let i = 0; i < 40 && H.persons.size < HOLDS_CAST.length; i++) { step(0.25); await new Promise((r) => setTimeout(r, 0)); }
  assert.equal(H.persons.size, HOLDS_CAST.length, `the cast stands: ${[...H.persons.keys()].join(' ')}`);
  return { W, H, R: H.routines, people, all, events, player, machines, step, hour: () => h };
}

function insideAt(C, x, z, r = 0.25) {
  const res = C.resolveCapsule({ x, y: ground(x, z), z }, r, 1.6, { passes: 1, filter: (c) => c.blocking && !c.dynamic && c.kind !== 'npc' });
  return res.hit ? res.collider : null;
}
function auditRoute(C, rec, r = 0.25) {
  const bad = [];
  for (let i = 0; i + 1 < rec.pts.length; i++) {
    const a = rec.pts[i], b = rec.pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.1));
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      const c = insideAt(C, x, z, r);
      if (c) { bad.push(`${rec.id} -> ${rec.act} leg ${i}: in a ${c.kind} collider${c.wall ? ' ' + c.wall : ''} at ${x.toFixed(2)}, ${z.toFixed(2)}`); break; }
      const disc = NINEWALLS_WALK.discs.find((d) => Math.hypot(x - d.x, z - d.z) < d.r + r);
      if (disc) { bad.push(`${rec.id} -> ${rec.act} leg ${i}: in the Brazier's disc at ${x.toFixed(2)}, ${z.toFixed(2)}`); break; }
    }
  }
  return bad;
}

/** Two in-game hours from `hour`: the M1.5d rows per person. */
async function logHours(hour, machines = []) {
  const S0 = await world({ hour, machines });
  const log = new Map();
  const dt = 1 / 30;
  let t = 0, inside = 0, sampleT = 0;
  const insideList = [];
  const end = hour + 2;
  while (S0.hour() < end) {
    S0.step(dt);
    t += dt; sampleT += dt;
    const sample = sampleT >= 0.25;
    if (sample) sampleT -= 0.25;
    for (const e of S0.R.list) {
      let L = log.get(e.id);
      if (!L) log.set(e.id, L = { last: null, changes: 0, still: 0, maxStill: 0, anchor: null, noClip: 0, acts: [] });
      const p = e.person, g = p.group.position;
      if (!p.cur) L.noClip++;
      if (e.act !== 'walk' && e.act !== L.last) { if (L.last && L.last !== 'start') L.changes++; L.last = e.act; L.acts.push(e.act); }
      const working = p.cur && WORK_CLIPS.has(p.cur);
      if (!L.anchor || Math.hypot(g.x - L.anchor.x, g.z - L.anchor.z) > 0.25 || working) { L.anchor = { x: g.x, z: g.z }; L.still = 0; }
      else { L.still += dt; L.maxStill = Math.max(L.maxStill, L.still); }
      if (sample && e.act === 'walk') { const c = insideAt(S0.W.C, g.x, g.z, 0.2); if (c) { inside++; if (insideList.length < 5) insideList.push(`${e.id} at ${g.x.toFixed(2)}, ${g.z.toFixed(2)} (${c.kind})`); } }
    }
  }
  const bad = [];
  for (const [id, L] of log) {
    if (L.changes < 3) bad.push(`${id}: ${L.changes} changes (${L.acts.join(' ')})`);
    if (L.maxStill > 90) bad.push(`${id}: still ${L.maxStill.toFixed(1)} s`);
    if (L.noClip) bad.push(`${id}: ${L.noClip} steps with no clip`);
  }
  const legsBad = [];
  let legs = 0;
  for (const rec of S0.all) { legs += rec.pts.length - 1; legsBad.push(...auditRoute(S0.W.C, rec)); }
  const misses = S0.R.list.reduce((n, e) => n + (e.navMiss || 0), 0), offGrid = S0.all.filter((r) => !r.grid).length, stuck = S0.R.list.reduce((n, e) => n + (e.stuck || 0), 0);
  return { S0, t, bad, legsBad, legs, misses, offGrid, stuck, inside, insideList, log };
}

for (const hour of [10, 16]) {
  test(`NW8: two in-game hours at Ninewalls from ${hour}:00 on the walk grid: changes, standing still, clips, 0 legs through collision`, async () => {
    const r = await logHours(hour);
    const summary = { hours: `${hour}-${hour + 2}`, simS: +r.t.toFixed(0), gridMs: r.S0.W.buildMs, routes: r.S0.all.length, legs: r.legs, legsThroughCollision: r.legsBad.length, navMiss: r.misses, offGrid: r.offGrid, stuck: r.stuck, insideSamples: r.inside, grid: r.S0.W.grid.audit(),
      rows: [...r.log].map(([id, L]) => ({ id, changes: L.changes, maxStillS: +L.maxStill.toFixed(1), acts: L.acts.join(' ') })) };
    if (process.env.R5_ROUTINE_LOG) console.log(JSON.stringify(summary), JSON.stringify(r.legsBad.slice(0, 10)), JSON.stringify(r.insideList));
    assert.equal(r.S0.R.list.length, HOLDS_CAST.length, 'the cast adopted');
    assert.deepEqual(r.bad, [], `simulated ${r.t.toFixed(0)} s`);
    assert.deepEqual(r.legsBad.slice(0, 8), [], `${r.legsBad.length} of ${r.legs} legs through collision`);
    assert.equal(r.misses, 0, 'every walk found a path on the grid');
    assert.equal(r.offGrid, 0, 'every route on the grid');
    assert.equal(r.stuck, 0, 'no walk put on its mark');
    assert.deepEqual(r.insideList, [], `${r.inside} walking samples inside a collider`);
  });
}

test('every place of every loop is on an open walk-grid cell and reachable from every other; Oro keeps to his forecourt', async () => {
  const S0 = await world({ hour: 10 });
  const G = S0.W.grid, bad = [];
  const steps = [];
  for (const [id, loop] of Object.entries(S0.R.L)) for (const s of loop.day) steps.push({ id, s });
  for (const { id, s } of steps) if (G.blockedAt(s.at.x, s.at.z)) bad.push(`${id} ${s.act}: on a shut cell (${G.why[G.index(s.at.x, s.at.z)]})`);
  for (let i = 0; i < steps.length; i++) for (let j = 0; j < steps.length; j += 3) {
    if (i === j) continue;
    const p = G.path(steps[i].s.at, steps[j].s.at);
    if (!p) bad.push(`no path ${steps[i].id} ${steps[i].s.act} -> ${steps[j].id} ${steps[j].s.act}`);
  }
  for (const s of S0.R.L.oro.day) { const d = Math.hypot(s.at.x - ORO_ANCHOR.x, s.at.z - ORO_ANCHOR.z); if (d > 6) bad.push(`Oro's ${s.act} ${d.toFixed(1)} m from his anchor`); }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} bad`);
  const P = holdsPlaces();
  assert.ok(Math.hypot(P.oroAnvil.x - P.anvil.x, P.oroAnvil.z - P.anvil.z) < 1.2, 'Oro stands at the anvil');
});

/* a herd of four on the slope west of the village (HERD_SLOPE): the leader walks its coring line at the Tiller's 1.5 m/s,
   halting 6 s to core every 10 m; the file follows at 9.5 m centre to centre (tiller-herd.js FILE.gap) */
function herdOf(n = 4) {
  const a = { x: HERD_SLOPE[0].e * S, z: -HERD_SLOPE[0].n * S }, b = { x: HERD_SLOPE[1].e * S, z: -HERD_SLOPE[1].n * S };
  const L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
  const file = { order: [] };
  const herd = { file };
  for (let i = 0; i < n; i++) file.order.push({ kind: 'tiller', alive: true, herd, position: { x: a.x - ux * 9.5 * i, z: a.z - uz * 9.5 * i }, root: { rotation: { y: Math.atan2(ux, uz) } } });
  let s = 0, halt = 0, walked = 0, dir = 1;
  return {
    list: file.order, a, b, ux, uz,
    step(dt) {
      if (halt > 0) { halt -= dt; return; }
      const v = 1.5 * dt * dir;
      s += v; walked += Math.abs(v);
      if (s > L - 5 || s < 0) { dir = -dir; file.order.reverse(); for (const m of file.order) m.root.rotation.y += Math.PI; }
      if (walked >= 10) { walked = 0; halt = 6; }
      const lead = file.order[0];
      for (let i = 0; i < file.order.length; i++) {
        const m = file.order[i];
        const k = s - 9.5 * i * dir;
        m.position.x = a.x + ux * k; m.position.z = a.z + uz * k;
      }
      void lead;
    },
  };
}

test('NW8*: with a herd on the slope the youths trail it 6-12 m behind its last hull, and the others keep their loops', async () => {
  const herd = herdOf(4);
  const S0 = await world({ hour: 10, machines: herd.list });
  const dists = { 'tiller-follower': [], 'tiller-follower-2': [] };
  const dt = 1 / 30;
  let t = 0, caughtUp = {};
  for (let i = 0; i < 30 * 240; i++) {
    herd.step(dt); S0.step(dt); t += dt;
    if (i % 3) continue;
    const H = S0.R._herd;
    if (!H) continue;
    const last = H.last.position, sx = Math.sin(H.heading), sz = Math.cos(H.heading);
    for (const id of Object.keys(dists)) {
      const e = S0.R.list.find((q) => q.id === id), p = e.person.group.position;
      const d = Math.hypot(p.x - last.x, p.z - last.z), behind = -((p.x - last.x) * sx + (p.z - last.z) * sz);
      if (!caughtUp[id] && d <= 12) caughtUp[id] = t;
      if (caughtUp[id] && e.phase === 'do' && e.trailing) dists[id].push({ d, behind });
    }
  }
  const q = (a, k) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * s.length))]; };
  const rows = Object.entries(dists).map(([id, a]) => ({ id, caughtUpS: caughtUp[id] ? +caughtUp[id].toFixed(1) : null, n: a.length,
    p10: a.length ? +q(a.map((x) => x.d), 0.1).toFixed(2) : null, p50: a.length ? +q(a.map((x) => x.d), 0.5).toFixed(2) : null, p90: a.length ? +q(a.map((x) => x.d), 0.9).toFixed(2) : null,
    behindP10: a.length ? +q(a.map((x) => x.behind), 0.1).toFixed(2) : null, inBand: a.length ? +(a.filter((x) => x.d >= 6 && x.d <= 12).length / a.length).toFixed(3) : null }));
  console.log(JSON.stringify({ trail: rows, stats: S0.R.stats }));
  for (const r of rows) {
    assert.ok(r.caughtUpS !== null && r.caughtUpS < 120, `${r.id} reaches the herd (${r.caughtUpS} s)`);
    assert.ok(r.n > 40, `${r.id} works behind it (${r.n} samples)`);
    // the band* as this first run confirms it: 90 % of the samples at work behind the herd in 6-12 m
    assert.ok(r.inBand >= 0.9, `${r.id} 6-12 m behind the last hull at work: ${r.inBand} in band (p10 ${r.p10}, p90 ${r.p90})`);
    assert.ok(r.behindP10 > 3, `${r.id} behind it, not beside or ahead (${r.behindP10} m)`);
  }
  const others = S0.R.list.filter((e) => !e.R.trail);
  assert.ok(others.every((e) => !e.trailing), 'only the youths trail');
});

test('NW9: a Screed walked in charging her: 0 people within 10 m of any charge line inside the outer wall; nobody has a hit table', async () => {
  NWL.resetWalls();
  // it comes down the Scar side from the north-east, 110 m out, and walks at her; its walls are the real ones (it cuts what its
  // walking blade reaches; at the third cut the fight ends fail-soft and it walks on down the Scar, as screed-rules.js has it)
  const start = NWL.polar(45, 110);
  const brain = new ScreedBrain({ x: start.x, z: start.z, heading: Math.atan2(CENTRE.x - start.x, CENTRE.z - start.z), walls: NWL });
  const m = { kind: 'screed', alive: true, brain, position: { x: brain.x, z: brain.z } };
  const S0 = await world({ hour: 10, machines: [] });
  // the cast at its work for a while, then the Screed arrives
  for (let i = 0; i < 30 * 20; i++) S0.step(1 / 30);
  S0.machines.push(m);
  // Brea fights it on the outer three terraces (r 54-66 m, bearings 0-100: where the brief has the fight), moving every 8 s to
  // a spot 12-26 m from it; it walks at her and charges her whenever it can (every 3 s or more, she within 30 m)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const place = () => {
    for (let k = 0; k < 80; k++) {
      const q = NWL.polar(rnd() * 100, 54 + rnd() * 12), d = Math.hypot(q.x - brain.x, q.z - brain.z);
      if (d >= 12 && d <= 26) { S0.player.position.x = q.x; S0.player.position.z = q.z; return; }
    }
  };
  S0.player.position = { ...NWL.polar(45, 60) };
  const dt = 1 / 30;
  let t = 0, chargeFrom = null, lastCharge = -9, worst = { d: Infinity }, worstPotential = { d: Infinity }, charges = 0, insideS = 0, shelteredMin = Infinity;
  const segs = [];
  for (let i = 0; i < 30 * 300; i++) {
    t += dt;
    const r = Math.hypot(brain.x - CENTRE.x, brain.z - CENTRE.z), inside = r < OUTER_R;
    if (inside) insideS += dt;
    if (brain.failSoft) brain.target = NWL.polar(135, 260);
    else brain.target = { x: S0.player.position.x, z: S0.player.position.z };
    if (!brain.failSoft && r < OUTER_R + 20 && i % (30 * 8) === 0) place();
    const dB = Math.hypot(brain.x - S0.player.position.x, brain.z - S0.player.position.z);
    if (!brain.failSoft && brain.phase === 'walk' && r < OUTER_R - 1.5 && dB < 30 && t - lastCharge > 3) {
      brain.charge(S0.player.position.x, S0.player.position.z); charges++; lastCharge = t; chargeFrom = { x: brain.x, z: brain.z, t };
    }
    const was = brain.phase;
    brain.step(dt);
    m.position.x = brain.x; m.position.z = brain.z;
    if ((was === 'charge' || was === 'windup') && brain.phase !== was && brain.phase !== 'charge') {
      const F = SCREED_RULES.bladeFront, h = brain.lockedHeading ?? brain.heading;
      segs.push({ a: chargeFrom, b: { x: brain.x + Math.sin(h) * F, z: brain.z + Math.cos(h) * F }, inside, stall: brain.phase === 'stall' });
    }
    S0.step(dt);
    if ((brain.phase === 'windup' || brain.phase === 'charge') && inside && chargeFrom) {
      const h = brain.lockedHeading ?? brain.heading, L = SCREED_RULES.chargeLen + SCREED_RULES.bladeFront;
      const a = chargeFrom, bp = { x: a.x + Math.sin(h) * L, z: a.z + Math.cos(h) * L }, bnow = { x: brain.x + Math.sin(h) * SCREED_RULES.bladeFront, z: brain.z + Math.cos(h) * SCREED_RULES.bladeFront };
      for (const e of S0.R.list) {
        const p = e.person.group.position;
        const seg = (q, b) => { const dx = b.x - q.x, dz = b.z - q.z, L2 = dx * dx + dz * dz || 1e-9; const u = Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.z - q.z) * dz) / L2)); return Math.hypot(q.x + dx * u - p.x, q.z + dz * u - p.z); };
        const dNow = seg(a, bnow), dPot = seg(a, bp);
        if (dNow < worst.d) worst = { d: +dNow.toFixed(2), id: e.id, act: e.act, t: +t.toFixed(1) };
        if (dPot < worstPotential.d) worstPotential = { d: +dPot.toFixed(2), id: e.id, act: e.act, t: +t.toFixed(1) };
      }
    }
    // everyone at (or on the way to) a shelter spot once it has been inside the outer wall 30 s
    if (insideS > 30 && inside) shelteredMin = Math.min(shelteredMin, S0.R.list.filter((e) => e.shelter).length);
    if (brain.failSoft && r > ALARM_R + 5) break;
  }
  const atSpot = S0.R.list.filter((e) => e.act === 'shelter').length;
  console.log(JSON.stringify({ charges, chargeLines: segs.length, insideLines: segs.filter((q) => q.inside).length, stalls: segs.filter((q) => q.stall).length, cuts: brain.cuts, failSoft: brain.failSoft,
    insideOuterWallS: +insideS.toFixed(1), worstToChargeLine: worst, worstToFullLine: worstPotential, shelteredMin, atSpotAtEnd: atSpot, alarms: S0.R.stats.alarms, shelterMoves: S0.R.stats.shelterMoves, simS: +t.toFixed(0) }));
  NWL.resetWalls();
  assert.ok(segs.filter((q) => q.inside).length >= 5, `the Screed charged inside the outer wall (${segs.length})`);
  assert.ok(insideS > 30, `it spent time inside the outer wall (${insideS.toFixed(0)} s)`);
  assert.ok(worst.d >= 10, `nobody within 10 m of a charge line: worst ${JSON.stringify(worst)}`);
  assert.ok(worstPotential.d >= 10, `nobody within 10 m of a charge's full 28 m line either: worst ${JSON.stringify(worstPotential)}`);
  assert.equal(shelteredMin, HOLDS_CAST.length, 'everyone sheltering while it is inside');
  // no hit table: a person is never a hit target (the stand-ins carry none, and the game's Person registers no hurt box)
  assert.ok(S0.people.every((p) => p.hp === undefined && p.health === undefined));
  // it has gone: they go back to work
  S0.machines.length = 0;
  for (let i = 0; i < 30 * 15; i++) S0.step(1 / 30);
  assert.ok(!S0.R.alarm, 'the alarm clears');
  assert.ok(S0.R.list.every((e) => e.act !== 'shelter'), `back to work: ${S0.R.list.map((e) => e.act).join(' ')}`);
});

test('M1.5d at Ninewalls: the lookout rule in the Holds: within 3 s at 80 m of the nearest; one call for a pack; the herd never called', async () => {
  const rows = [];
  for (let k = 0; k < 8; k++) {
    const S0 = await world({ hour: 10 + k * 0.4 });
    for (let i = 0; i < 60 * (3 + k * 2.3); i++) S0.step(1 / 60);
    const brg = (k * 41 + 7), speed = 0.8 + k * 0.7;
    const at = NWL.polar(brg, 190);
    const kind = k % 3 === 0 ? 'sickle' : 'plumb';
    const ms = [{ kind, alive: true, position: { x: at.x, z: at.z } }];
    if (kind === 'sickle') ms.push({ kind, alive: true, position: { x: at.x + 3, z: at.z + 2 } }, { kind, alive: true, position: { x: at.x - 2, z: at.z + 3 } });
    S0.machines.push(...ms);
    let crossed = null, fired = null, t = 0;
    const nearest = () => Math.min(...ms.flatMap((m) => S0.R.list.map((e) => Math.hypot(e.person.group.position.x - m.position.x, e.person.group.position.z - m.position.z))));
    for (let i = 0; i < 60 * 240 && fired === null; i++) {
      for (const m of ms) { const dx = CENTRE.x - m.position.x, dz = CENTRE.z - m.position.z, d = Math.hypot(dx, dz); if (d > 5) { m.position.x += dx / d * speed / 60; m.position.z += dz / d * speed / 60; } }
      S0.step(1 / 60); t += 1 / 60;
      if (crossed === null && nearest() <= LOOKOUT.range) crossed = t;
      if (S0.events.some((e) => e.ev === 'npc-warning')) fired = t;
    }
    assert.ok(crossed !== null && fired !== null, `trial ${k}: crossed ${crossed} fired ${fired}`);
    // the rest of the pack comes in: no second call for it
    for (let i = 0; i < 60 * 10; i++) S0.step(1 / 60);
    const calls = S0.events.filter((e) => e.ev === 'npc-warning');
    const ev = calls[0];
    rows.push({ k, kind, speed: +speed.toFixed(2), delay: +(fired - crossed).toFixed(3), d: ev.d, caller: ev.id, calls: calls.length });
  }
  console.log(JSON.stringify({ maxDelayS: Math.max(...rows.map((r) => r.delay)), rows }));
  assert.deepEqual(rows.filter((r) => r.delay > 3 || r.delay < 0), []);
  assert.ok(rows.every((r) => r.calls === 1), 'one call for each approach (a pack is one call)');
  // the herd: four Tillers walking past the village all day raise no call
  const herd = herdOf(4);
  const S1 = await world({ hour: 10, machines: herd.list });
  for (let i = 0; i < 30 * 120; i++) { herd.step(1 / 30); S1.step(1 / 30); }
  assert.equal(S1.events.filter((e) => e.ev === 'npc-warning').length, 0, 'the herd is never called');
});

test('one Oro: the quest stood him first (hour.js _standOro) and the cast takes him into his loop instead of standing a second', async () => {
  const quest = new Stand('oro', { x: ORO_ANCHOR.x + 1, z: ORO_ANCHOR.z + 1, seed: 9, id: 'oro#9' });
  const S0 = await world({ hour: 10, before: [quest] });
  const oros = S0.people.filter((p) => p.archetype === 'oro');
  assert.equal(oros.length, 1, `${oros.length} Oros`);
  assert.equal(S0.H.person('oro'), quest, 'the cast holds the quest\'s Oro');
  for (let i = 0; i < 30 * 30; i++) S0.step(1 / 30);
  const e = S0.R.list.find((q) => q.id === 'oro');
  assert.ok(e && e.person === quest && e.act !== 'start', `he works his loop (${e?.act})`);
});
