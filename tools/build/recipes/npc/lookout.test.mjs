/**
 * BUILD M1.5d — the lookout's warning (src/world/npc/people/lookout.js) in Node, no browser: the routines driven with stand-in
 * people (as routines.test.mjs) and stand-in Instruments on `ctx.machines.list`, at 60 Hz.
 *   - the warning fires within 3 s of an Instrument coming to 80 m (10 trials: approach bearings, speeds 0.8-6 m/s, the scan's
 *     phase and the keeper's activity all differ); bar 3 s
 *   - an Instrument that keeps 85 m off for 60 s raises no warning
 *   - one warning per approach; the all-clear once it has been past 100 m for 10 s, then armed again
 *   - the lines are the `lookout` set of src/game/text/barks/saltrow.json
 * The live delay in the game (the keeper spawned in Saltrow, a real Instrument walked in) is the probe's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Routines } from '../../../../src/world/npc/people/routines.js';
import { LOOKOUT } from '../../../../src/world/npc/people/lookout.js';
import { CREW, streetPoint } from '../../../../src/world/settlements/saltrow-layout.js';
import { ROOT } from '../lib/human/face.mjs';

const BARKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/game/text/barks/saltrow.json'), 'utf8'));
const LINES = BARKS.sets.find((s) => s.id === 'lookout').lines;

class Stand {
  constructor(id, x, z, seed) { this.id = id; this.seed = seed; this.group = { position: { x, z }, rotation: { y: 0 } }; this.yaw = 0; this.cur = null; this.walk = null; }
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

async function world(startHour) {
  const crew = CREW.map((c, i) => { const at = streetPoint(c.s, c.r); return { id: c.id, person: new Stand(c.id, at.x, at.z, 211 + i * 29) }; });
  const people = crew.map((c) => c.person);
  const machines = [];
  const events = [];
  const subs = [];
  let h = startHour;
  const sys = {
    ctx: {
      params: null, environment: { time: h }, settlements: { town: { crew, loaded: true } }, machines: { list: machines },
      events: { emit: (ev, o) => events.push({ ev, ...o }) }, systemsGame: { present: { subtitle: (l, w) => subs.push({ l, w }) } },
      player: null,
    },
    spawn: async (id, o) => { const p = new Stand(id, o.x, o.z, o.seed); people.push(p); return p; },
    _propsFor: () => [],
  };
  const R = new Routines(sys);
  R.hourOf = () => h;
  R.lookout.lines = LINES;
  const step = (dt) => { h += dt * 24 / 1800; for (const p of people) p.step(dt); R.update(dt); };
  step(1 / 60); await new Promise((r) => setTimeout(r, 0)); step(1 / 60);
  const keeper = () => R.list.find((e) => e.id === 'lantern-keeper-2');
  assert.ok(keeper(), 'the keeper is adopted');
  return { R, step, machines, events, subs, keeper };
}

test('the warning fires within 3 s of an Instrument at 80 m (10 trials)', async () => {
  const rows = [];
  for (let k = 0; k < 10; k++) {
    const W = await world(k % 2 ? 19.0 : 12.0);   // by day at the harbour and at night at the lamp
    // the keeper about her work for a while first (so the scan's phase and her activity differ per trial)
    for (let i = 0; i < 60 * (3 + k * 1.7); i++) W.step(1 / 60);
    const kp = W.keeper().person.group.position;
    const brg = (k * 37 + 11) * Math.PI / 180, speed = 0.8 + k * 0.58;
    const m = { kind: 'plumb', alive: true, position: { x: kp.x + Math.sin(brg) * 130, z: kp.z + Math.cos(brg) * 130 } };
    W.machines.push(m);
    let crossed = null, fired = null, t = 0;
    for (let i = 0; i < 60 * 120 && fired === null; i++) {
      // walk it straight at where the keeper is now
      const p = W.keeper().person.group.position, dx = p.x - m.position.x, dz = p.z - m.position.z, d = Math.hypot(dx, dz);
      if (d > 5) { m.position.x += dx / d * speed / 60; m.position.z += dz / d * speed / 60; }
      W.step(1 / 60); t += 1 / 60;
      const p2 = W.keeper().person.group.position;
      const d2 = Math.hypot(m.position.x - p2.x, m.position.z - p2.z);
      if (crossed === null && d2 <= LOOKOUT.range) crossed = t;
      if (W.events.some((e) => e.ev === 'npc-warning')) fired = t;
    }
    assert.ok(crossed !== null, `trial ${k}: never came within 80 m`);
    assert.ok(fired !== null, `trial ${k}: no warning`);
    const ev = W.events.find((e) => e.ev === 'npc-warning');
    rows.push({ k, speed: +speed.toFixed(2), delay: +(fired - crossed).toFixed(3), d: ev.d, act: W.keeper().act, line: ev.line?.[0] });
    assert.equal(W.keeper().act, 'warn', `trial ${k}: she calls`);
  }
  console.log(JSON.stringify({ maxDelayS: Math.max(...rows.map((r) => r.delay)), rows }));
  const late = rows.filter((r) => r.delay > 3 || r.delay < 0);
  assert.deepEqual(late, []);
  assert.ok(rows.every((r) => LINES.slice(0, -1).some((l) => l[0] === r.line)), 'a warning line of the lookout set');
});

test('no warning at 85 m; one warning per approach; the all-clear past 100 m for 10 s', async () => {
  const W = await world(12.0);
  const kp = () => W.keeper().person.group.position;
  const m = { kind: 'peg', alive: true, position: { x: 0, z: 0 } };
  W.machines.push(m);
  let a = 0;
  for (let i = 0; i < 60 * 60; i++) { a += 0.2 / 60; m.position.x = kp().x + Math.sin(a) * 85; m.position.z = kp().z + Math.cos(a) * 85; W.step(1 / 60); }
  assert.equal(W.events.filter((e) => e.ev === 'npc-warning').length, 0, 'circling at 85 m');
  for (let i = 0; i < 60 * 20; i++) { m.position.x = kp().x + 60; m.position.z = kp().z; W.step(1 / 60); }
  assert.equal(W.events.filter((e) => e.ev === 'npc-warning').length, 1, 'one warning while it stays at 60 m');
  for (let i = 0; i < 60 * 12; i++) { m.position.x = kp().x + 120; m.position.z = kp().z; W.step(1 / 60); }
  const clear = W.events.filter((e) => e.ev === 'npc-all-clear');
  assert.equal(clear.length, 1, 'the all-clear');
  assert.deepEqual(clear[0].line, LINES[LINES.length - 1]);
  assert.ok(W.R.lookout.armed, 'armed again');
  assert.equal(W.subs.length, 2, 'both said to the subtitle (no player: heard)');
  assert.equal(W.subs[0].w, 'LANTERN-KEEPER');
});

test('a resident Instrument 37 m off is warned of once and does not silence her for the next (fix round 2)', async () => {
  // the live world keeps a Gauge 33-38 m from the keeper: at 731b21a she warned of it at t = 0.27 s and never again
  const W = await world(12.0);
  const kp = () => W.keeper().person.group.position;
  const gauge = { kind: 'gauge', alive: true, position: { x: kp().x + 37, z: kp().z } };
  W.machines.push(gauge);
  for (let i = 0; i < 60 * 5; i++) W.step(1 / 60);
  assert.equal(W.events.filter((e) => e.ev === 'npc-warning').length, 1, 'the resident Gauge, once');
  assert.equal(W.R.lookout.known, 1);
  const rows = [];
  for (let k = 0; k < 4; k++) {
    // a new Instrument walked in from 130 m, a different bearing and speed each time; the Gauge stays
    const brg = (k * 71 + 23) * Math.PI / 180, speed = 1.2 + k * 1.4;
    const m = { kind: 'plumb', alive: true, position: { x: kp().x + Math.sin(brg) * 130, z: kp().z + Math.cos(brg) * 130 } };
    W.machines.push(m);
    const n0 = W.events.filter((e) => e.ev === 'npc-warning').length;
    let crossed = null, fired = null, t = 0, r = 130;
    for (let i = 0; i < 60 * 120 && fired === null; i++) {
      r -= speed / 60;
      m.position.x = kp().x + Math.sin(brg) * r; m.position.z = kp().z + Math.cos(brg) * r;
      if (crossed === null && Math.hypot(m.position.x - kp().x, m.position.z - kp().z) <= LOOKOUT.range) crossed = t;
      W.step(1 / 60); t += 1 / 60;
      // (the keeper moved in the step: the scan read the distance after it)
      if (crossed === null && Math.hypot(m.position.x - kp().x, m.position.z - kp().z) <= LOOKOUT.range) crossed = t - 1 / 60;
      if (W.events.filter((e) => e.ev === 'npc-warning').length > n0) fired = t;
    }
    assert.ok(crossed !== null && fired !== null, `approach ${k}: no warning with the Gauge standing`);
    rows.push(+(fired - crossed).toFixed(3));
    // it leaves: forgotten after 10 s past 100 m (the Gauge is still known, so no all-clear)
    for (let i = 0; i < 60 * 12; i++) { m.position.x = kp().x + Math.sin(brg) * 140; m.position.z = kp().z + Math.cos(brg) * 140; W.step(1 / 60); }
    W.machines.splice(W.machines.indexOf(m), 1);
    for (let i = 0; i < 60; i++) W.step(1 / 60);
  }
  console.log(JSON.stringify({ residentDelaysS: rows }));
  assert.ok(rows.every((d) => d >= 0 && d <= 3), `delays ${rows}`);
  assert.equal(W.events.filter((e) => e.ev === 'npc-all-clear').length, 0, 'no all-clear while the Gauge stands');
  assert.equal(W.R.lookout.known, 1, 'only the Gauge is still known');
  // the Gauge goes too: the all-clear once
  for (let i = 0; i < 60 * 12; i++) { gauge.position.x = kp().x + 150; gauge.position.z = kp().z; W.step(1 / 60); }
  assert.equal(W.events.filter((e) => e.ev === 'npc-all-clear').length, 1);
  assert.ok(W.R.lookout.armed);
});
