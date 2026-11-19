/**
 * IN1, the herd never flees: the Node twin of the page row (M2 briefs §6; `src/instruments/kinds/tiller-herd.js`).
 *   node --test tools/instruments/herd-file.test.mjs
 *
 * The herd's own code (HerdFile, fileStep, fileHold, HerdRipple, rippleTick, and machine.js's moveTowardS) drives
 * kinematic members on simulation time (1/60 s steps). The leader walks its bearing at walk speed, as the base patrol
 * does on a straight coring route; followers walk the file. Ten chimes at 5-45 m from the nearest member, herds of 3-6.
 * Bars: 0 members change bearing by more than 2 deg; every file gap 3.5-4.5 m* within 4 s of the chime; the lamp ripple
 * runs nearest-first; no member's speed above its walk (from the chime to 12 s after it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FILE, HerdFile, HerdRipple, fileStep, fileHold, rippleTick } from '../../src/instruments/kinds/tiller-herd.js';
import { _st, moveTowardS } from '../../src/entities/machines/machine.js';

const DT = 1 / 60, WALK = 1.5, D2R = Math.PI / 180;

function makeHerd(n, bearing, x0, z0) {
  const engine = { simTime: 0 };
  const flashes = [];
  const listeners = {};
  const ctx = { engine, events: { on: (k, fn) => { listeners[k] = fn; return () => {}; }, emit: () => {} } };
  const herd = { members: [], alarmed: false, vector: { x: 0, z: 0 } };
  const manager = { ctx, squads: { herds: [herd] }, lamps: { telegraph: (m) => flashes.push({ m, t: engine.simTime }) } };
  const sx = Math.sin(bearing), sz = Math.cos(bearing);
  for (let i = 0; i < n; i++) {
    herd.members.push({ i, alive: true, _disposed: false, ctx, manager, herd, turnRate: 1.5, bodyRadius: 1.15, walkSpeed: WALK,
      position: { x: x0 - sx * FILE.gap * i, z: z0 - sz * FILE.gap * i }, sc: { heading: bearing, _speed: WALK }, _rippleAt: -1 });
  }
  herd.file = new HerdFile(herd);
  const ripple = new HerdRipple(manager);
  // lay the leader's crumbs back along the file it stands in (as 12 s of calm walking would have)
  const f = herd.file; f.refresh();
  const lead = herd.members[0];
  for (let d = FILE.gap * n + 4; d >= 0; d -= FILE.crumbM / 2) f.record(lead.position.x - sx * d, lead.position.z - sz * d);
  return { engine, herd, f, ripple, flashes, listeners, bearing };
}

function step(H) {
  const { f, herd, engine, bearing } = H;
  for (const m of herd.members) {
    if (f.leader === m) {
      f.record(m.position.x, m.position.z);
      if (!fileHold(m, f, DT)) {
        _st.x = m.position.x + Math.sin(bearing) * 30; _st.z = m.position.z + Math.cos(bearing) * 30; _st.speed = WALK;
        moveTowardS(m, DT);
      }
    } else fileStep(m, f, DT, WALK);
    if (m._rippleAt >= 0) rippleTick(m);
  }
  engine.simTime += DT;
}

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

test('IN1: ten chimes at 5-45 m, herds of 3-6: no flight, the file closes at walk on its bearing', () => {
  const out = [];
  for (let k = 0; k < 10; k++) {
    const n = 3 + (k % 4), bearing = (17 + 37 * k) * D2R, dist = 5 + (40 * k) / 9;
    const H = makeHerd(n, bearing, 0, 0);
    for (let s = 0; s < 20 * 60; s++) step(H);                // 20 s of calm walking in file
    const ms = H.herd.members, tail = ms[ms.length - 1];
    // the chime: behind and to one side of the tail, `dist` from the nearest member
    const side = (k % 2 ? 1 : -1);
    const cx = tail.position.x - Math.sin(bearing) * dist * 0.8 + Math.cos(bearing) * side * dist * 0.6;
    const cz = tail.position.z - Math.cos(bearing) * dist * 0.8 - Math.sin(bearing) * side * dist * 0.6;
    const near = Math.min(...ms.map((m) => Math.hypot(m.position.x - cx, m.position.z - cz)));
    const t0 = H.engine.simTime;
    H.flashes.length = 0;
    H.listeners['plumb-chime']({ machine: null, x: cx, z: cz });
    let maxSpeed = 0, maxTurnDeg = 0, gapsAt4 = null;
    while (H.engine.simTime - t0 < 12) {
      step(H);
      for (const m of ms) {
        maxSpeed = Math.max(maxSpeed, m.sc._speed);
        maxTurnDeg = Math.max(maxTurnDeg, angDiff(m.sc.heading, bearing) / D2R);
      }
      if (gapsAt4 === null && H.engine.simTime - t0 >= 4) {
        gapsAt4 = ms.slice(1).map((m, i) => Math.hypot(m.position.x - ms[i].position.x, m.position.z - ms[i].position.z));
      }
    }
    const order = H.flashes.map((e) => Math.hypot(e.m.position.x - cx, e.m.position.z - cz));
    const nearestFirst = H.flashes.length === n && order.every((d, i) => i === 0 || d >= order[i - 1] - 0.3);
    out.push({ n, near: +near.toFixed(1), maxSpeed: +maxSpeed.toFixed(3), maxTurnDeg: +maxTurnDeg.toFixed(2),
      gapsAt4: gapsAt4.map((g) => +g.toFixed(2)), flashes: H.flashes.length, nearestFirst, alarmed: H.herd.alarmed });
  }
  console.log(JSON.stringify(out));
  for (const r of out) {
    assert.ok(r.near >= 4.9 && r.near <= 45.1, `chime distance ${r.near}`);
    assert.equal(r.alarmed, false);
    assert.ok(r.nearestFirst, `ripple order ${JSON.stringify(r)}`);
    assert.ok(r.maxTurnDeg <= 2, `bearing change ${r.maxTurnDeg} deg`);
    assert.ok(r.maxSpeed <= WALK + 1e-6, `speed ${r.maxSpeed}`);
    for (const g of r.gapsAt4) assert.ok(g >= 3.5 && g <= 4.5, `gap ${g} in ${JSON.stringify(r.gapsAt4)}`);
  }
});
