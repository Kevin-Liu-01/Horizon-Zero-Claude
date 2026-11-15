/**
 * BUILD M1.5d (first part) — the routines' own logic, in Node (no browser): src/world/npc/people/routines.js driven over two
 * in-game hours (18:00-20:00 on the environment's golden clock: 1800 s a day, the same rate function) with stand-in people
 * that walk at 1.2 m/s and play whatever clip they are told. The live log is the probe's (m15-probe-page.mjs on F22); this
 * guards the schedule itself:
 *   - every routine person changes activity 3 or more times
 *   - nobody stands still more than 90 s outside a work clip
 *   - every person has a clip at every step (no bind pose)
 *   - no place and no straight walk between two of them passes through a Saltrow building's footprint (the layout's keep-outs,
 *     hard radius) or the sea's side of the beach (the breakwater's root and the ramp stand on the shore)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Routines, WORK_CLIPS, places, wayOf } from '../../../../src/world/npc/people/routines.js';
import { SALTROW_KEEPOUTS, CREW, streetPoint } from '../../../../src/world/settlements/saltrow-layout.js';
import { heightAt } from '../../../../src/world/island/recipe.js';

const SUN_RISE = 6.6, SUN_SET = 19.6;   // near enough for the rate's shape; the exact hours are the environment's
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const elev = (h) => 50 * Math.sin(Math.PI * (h - SUN_RISE) / (SUN_SET - SUN_RISE));
const rate = (e) => 1 + 1.5 * (1 - smooth(-5, -3, e)) - 0.5 * smooth(1, 3, e) * (1 - smooth(21, 23, e));
const NORM = (() => { let s = 0; for (let i = 0; i < 4800; i++) s += 1 / rate(elev((i + 0.5) * 24 / 4800)); return s / 4800; })();
const clockRate = (h) => 24 / 1800 * rate(elev(h)) * NORM;

class Stand {
  constructor(id, x, z, seed) { this.id = id; this.seed = seed; this.group = { position: { x, z }, rotation: { y: 0 } }; this.yaw = 0; this.cur = null; this.walk = null; this.props = []; }
  get current() { return this.cur ? { getClip: () => ({ name: this.cur }) } : null; }
  play(name) { this.cur = name; return 2; }
  stopWalk() { this.walk = null; }
  walkTo(x, z, then) { this.walk = { x, z, then }; this.cur = 'Walk_Loop'; }
  showProps() {}
  setPosition(x, z) { this.group.position.x = x; this.group.position.z = z; }
  step(dt) {
    const W = this.walk; if (!W) return;
    const p = this.group.position, dx = W.x - p.x, dz = W.z - p.z, d = Math.hypot(dx, dz), s = 1.2 * dt;
    if (d <= 0.3) { this.walk = null; W.then?.(this); return; }
    p.x += dx / d * Math.min(s, d); p.z += dz / d * Math.min(s, d);
  }
}

function run() {
  const crew = CREW.map((c, i) => { const at = streetPoint(c.s, c.r); return { id: c.id, person: new Stand(c.id, at.x, at.z, 211 + i * 29) }; });
  let h = 18.0;
  const people = crew.map((c) => c.person);
  const sys = {
    ctx: { params: null, environment: { time: h }, settlements: { town: { crew, loaded: true } } },
    spawn: async (id, o) => { const p = new Stand(id, o.x, o.z, o.seed); people.push(p); return p; },
    _propsFor: () => [],
  };
  const R = new Routines(sys);
  R.hourOf = () => h;
  return { R, people, step: async (dt) => { h += clockRate(h) * dt; for (const p of people) p.step(dt); R.update(dt); }, hour: () => h };
}

test('two in-game hours of routines: changes, standing still, clips, keep-outs', async () => {
  const S = run();
  // the keeper's spawn resolves on the next tick
  await S.step(1 / 30); await new Promise((r) => setTimeout(r, 0)); await S.step(1.1);
  const log = new Map();
  const dt = 1 / 30;
  let t = 0;
  while (S.hour() < 20.0) {
    await S.step(dt);
    t += dt;
    for (const e of S.R.list) {
      let L = log.get(e.id);
      if (!L) log.set(e.id, L = { last: null, changes: 0, still: 0, maxStill: 0, anchor: null, noClip: 0, acts: [] });
      const p = e.person, g = p.group.position;
      if (!p.cur) L.noClip++;
      if (e.act !== 'walk' && e.act !== L.last) { if (L.last && L.last !== 'start') L.changes++; L.last = e.act; L.acts.push(e.act); }
      const working = p.cur && WORK_CLIPS.has(p.cur);
      if (!L.anchor || Math.hypot(g.x - L.anchor.x, g.z - L.anchor.z) > 0.25 || working) { L.anchor = { x: g.x, z: g.z }; L.still = 0; }
      else { L.still += dt; L.maxStill = Math.max(L.maxStill, L.still); }
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
  if (process.env.R5_ROUTINE_LOG) console.log(JSON.stringify({ simS: +t.toFixed(0), rows: [...log].map(([id, L]) => ({ id, changes: L.changes, maxStillS: +L.maxStill.toFixed(1), acts: L.acts.join(" ") })) }));
  assert.deepEqual(bad, [], `simulated ${t.toFixed(0)} s`);
});

test('no place or walk through a building of Saltrow', () => {
  const P = places();
  void P;
  // every step's place and every leg (waypoints in order) against each keep-out's hard radius minus 0.6 m (a door step is
  // inside the footprint's circle: the circle is the footprint's corners)
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
  // the buildings' keep-outs only (the street's own keep-outs are its paving, walked on)
  for (const g of legs) for (const k of SALTROW_KEEPOUTS.filter((q) => !/street/.test(q.id))) {
    // a leg to or from a door step starts or ends inside the footprint's circle (the circle runs through its corners)
    const d = segDist(k, g.from, g.to), endIn = Math.hypot(g.to.x - k.x, g.to.z - k.z) < k.hard || Math.hypot(g.from.x - k.x, g.from.z - k.z) < k.hard;
    if (d < k.hard - 0.6 && !endIn) hit.push(`${g.id} -> ${g.step}: ${k.id} ${d.toFixed(2)} m`);
  }
  assert.deepEqual(hit, []);
});

test('every place stands on dry ground (the island heights over the sea at 0)', () => {
  const mod = new Routines({ ctx: { params: null }, _propsFor: () => [] });
  mod.adopt({ group: { position: { x: 0, z: 0 }, rotation: {} }, seed: 1, setPosition() {}, play: () => 1, showProps() {}, stopWalk() {}, walkTo() {}, _beatT: 0 }, 'salt-raker');
  const wet = [];
  for (const [id, loop] of Object.entries(mod.L)) for (const list of [loop.day, loop.night].filter(Boolean)) for (const s of list) {
    for (const q of [s.at, ...(s.via || [])]) { const h = heightAt(q.x, q.z); if (!(h > 0.1)) wet.push(`${id} ${s.act}: ${h.toFixed(2)} m at ${q.x.toFixed(1)}, ${q.z.toFixed(1)}`); }
  }
  assert.deepEqual(wet, []);
});
