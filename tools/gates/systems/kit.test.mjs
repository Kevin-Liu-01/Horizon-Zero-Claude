// M1.6j the slice combat kit, its rules in Node (src/combat/kit.js). Browser-free:
//   node --test tools/gates/systems/kit.test.mjs
// The live rows (one per verb, on its intended target, each with a number) are tools/gates/systems/kit-probe-page.mjs,
// run in the slice run's one Chrome session (slice-hour.mjs --kit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Steady, STEADY, SWAY, swayAt, steadyPhase, wordOf, tearFor, isDown, pryablePart, weakRule, BALLAST, bearingDeg } from '../../../src/combat/kit.js';
import { AMMO } from '../../../src/combat/weapons.js';

const DT = 1 / 60;

test('Steady: sway exactly 0 for 4 s, then 2 s of shake, then the breath is out (60 Hz, 7 s held)', () => {
  const st = new Steady();
  const out = { yaw: 0, pitch: 0, deg: 0 };
  // aim 0.5 s, then a fresh Shift press while aiming
  for (let t = 0; t < 0.5; t += DT) st.step(DT, { aiming: true, shiftDown: false });
  let t = 0, maxHold = 0, maxShake = 0, holdEnd = null, outAt = null;
  for (let i = 0; i < 7 * 60; i++) {
    st.step(DT, { aiming: true, shiftDown: true });
    t += DT;
    swayAt(10 + t, { aiming: true, holdFull: 5, steadyT: st.active ? st.t : -1 }, out);
    if (st.phase === 'hold') { maxHold = Math.max(maxHold, out.deg); holdEnd = st.t; }
    else if (st.phase === 'shake') maxShake = Math.max(maxShake, out.deg);
    else if (outAt === null) outAt = t;
  }
  assert.equal(maxHold, 0, 'sway in the hold');
  assert.ok(holdEnd >= STEADY.holdS - 2 * DT && holdEnd < STEADY.holdS, `hold ran ${holdEnd} s`);
  assert.ok(maxShake > 0.3, `shake ${maxShake} deg`);
  assert.ok(Math.abs(outAt - (STEADY.holdS + STEADY.shakeS)) < 3 * DT, `out at ${outAt} s`);
  assert.equal(st.active, false);
});

test('Steady arms only on a fresh press while aiming (A53), and has no cooldown', () => {
  const st = new Steady();
  // Shift held from a sprint, then aim: no edge, never armed
  st.step(DT, { aiming: false, shiftDown: true });
  for (let i = 0; i < 60; i++) st.step(DT, { aiming: true, shiftDown: true });
  assert.equal(st.active, false);
  st.step(DT, { aiming: true, shiftDown: false });
  st.step(DT, { aiming: true, shiftDown: true });
  assert.equal(st.active, true);
  // let go after 5.5 s (the gauge nearly out), press again at once: a full breath
  for (let i = 0; i < 330; i++) st.step(DT, { aiming: true, shiftDown: true });
  st.step(DT, { aiming: true, shiftDown: false });
  assert.equal(st.active, false);
  st.step(DT, { aiming: true, shiftDown: true });
  assert.equal(st.active, true);
  assert.equal(st.gauge, 1);
  assert.equal(st.phase, 'hold');
});

test('the sway without Steady is never 0 for long and stays under 0.6 deg; the tremble grows after 3 s at full draw', () => {
  const o = { yaw: 0, pitch: 0, deg: 0 };
  let zeroRun = 0, maxRun = 0, maxDeg = 0;
  for (let i = 0; i < 600; i++) {
    swayAt(i * DT, { aiming: true, holdFull: 0, steadyT: -1 }, o);
    maxDeg = Math.max(maxDeg, o.deg);
    if (o.deg < 0.02) { zeroRun++; maxRun = Math.max(maxRun, zeroRun); } else zeroRun = 0;
  }
  assert.ok(maxDeg > 0.2 && maxDeg < 0.6, `breath ${maxDeg}`);
  assert.ok(maxRun < 12, `near-zero run ${maxRun} frames`);
  let tr = 0;
  for (let i = 0; i < 120; i++) tr = Math.max(tr, swayAt(i * DT, { aiming: true, holdFull: 5, steadyT: -1 }, o).deg);
  assert.ok(tr > maxDeg * 0.9, `tremble ${tr}`);
  assert.equal(swayAt(1, { aiming: false }, o).deg, 0);
  assert.equal(steadyPhase(3.99), 'hold');
  assert.equal(steadyPhase(4.01), 'shake');
  assert.equal(steadyPhase(6.01), 'out');
  assert.ok(SWAY.shakeDeg > SWAY.breathPitchDeg);
});

test('the damage words: Reed is Blunt (0 tear on any tool), Barbed is Pry; Pry on a down Instrument takes the tool in one hit', () => {
  assert.equal(wordOf('hunter'), 'blunt');
  assert.equal(wordOf('hardpoint'), 'pry');
  assert.equal(AMMO.hunter.name, 'Reed Arrow');
  assert.equal(AMMO.hardpoint.name, 'Barbed Arrow');
  const bob = { name: 'bob', tearable: true, attached: true, tearHp: 55 };
  const standing = { alive: true, _toppleT: -1, ai: { reactions: { downedT: 0 } } };
  const toppled = { alive: true, _toppleT: 1.2, ai: { reactions: { downedT: 2.8 } } };
  assert.equal(tearFor('blunt', toppled, bob, 10), 0);
  assert.equal(tearFor('pry', standing, bob, 20), 20);
  assert.ok(tearFor('pry', toppled, bob, 20) > bob.tearHp, 'one hit on the toppled Plumb');
  // a quarter-drawn Barbed (tear 60 x 0.4375 = 26) still takes it in one hit while it is down
  assert.ok(tearFor('pry', toppled, bob, AMMO.hardpoint.tear * (0.25 + 0.75 * 0.25)) > bob.tearHp);
  assert.equal(isDown(standing), false);
  assert.equal(isDown(toppled), true);
  assert.equal(isDown({ alive: true, ai: { reactions: { downedT: 1 } } }), true);
  assert.equal(isDown({ alive: false, _toppleT: 1 }), false);
});

test('the lance Pry finds the nearest tool within reach on a down Instrument, never on a standing one', () => {
  const parts = [
    { name: 'bob', tearable: true, attached: true, tearHp: 55, w: { x: 2, z: 0 } },
    { name: 'drum', tearable: true, attached: true, tearHp: 55, w: { x: 3.0, z: 0.5 } },
    { name: 'vial', tearable: false, attached: true, tearHp: Infinity, w: { x: 1, z: 0 } },
  ];
  const m = { alive: true, _toppleT: 0.5, parts };
  const w = (q) => q.w;
  assert.equal(pryablePart(m, { x: 0, z: 0 }, w)?.name, 'bob');
  assert.equal(pryablePart({ ...m, _toppleT: -1, ai: { reactions: { downedT: 0 } } }, { x: 0, z: 0 }, w), null);
  assert.equal(pryablePart(m, { x: -5, z: 0 }, w), null);
  // fix 1: with her heading, the tool she faces wins over a nearer one abeam (eafbff2: PRY took the drum beside her)
  const m2 = { alive: true, _toppleT: 0.5, parts: [
    { name: 'bob', tearable: true, attached: true, tearHp: 55, w: { x: 1.6, z: 0 } },
    { name: 'drum', tearable: true, attached: true, tearHp: 55, w: { x: 0, z: -1.4 } },
  ] };
  assert.equal(pryablePart(m2, { x: 0, z: 0 }, w)?.name, 'drum');
  assert.equal(pryablePart(m2, { x: 0, z: 0 }, w, 3.2, Math.PI / 2)?.name, 'bob');
  assert.equal(pryablePart(m2, { x: 0, z: 0 }, w, 3.2, Math.PI)?.name, 'drum');
});

test('weak-point rules: the Gauge lists at -40 % speed on its first ballast puncture; the Peg lamp and Plumb vial and lamp are named', () => {
  const g = { kind: 'gauge', walkSpeed: 1.25 };
  const r1 = weakRule(g, 'ballast tank');
  assert.equal(r1.first, true);
  assert.ok(Math.abs(g.walkSpeed / 1.25 - BALLAST.speedK) < 1e-9);
  assert.equal(weakRule(g, 'ballast tank').first, false);
  assert.ok(Math.abs(g.walkSpeed / 1.25 - 0.6) < 1e-9, 'a second puncture does not slow it again');
  assert.equal(weakRule({ kind: 'peg' }, 'lamp').rule, 'peg-lamp');
  assert.equal(weakRule({ kind: 'plumb' }, 'vial').rule, 'plumb-vial');
  assert.equal(weakRule({ kind: 'plumb' }, 'lamp').rule, 'plumb-lamp');
  assert.equal(weakRule({ kind: 'gauge' }, 'knee seal'), null);
});

test('a bearing: degrees from north, clockwise (x = E, z = -N)', () => {
  assert.equal(Math.round(bearingDeg({ x: 0, z: 0 }, { x: 0, z: -10 })), 0);
  assert.equal(Math.round(bearingDeg({ x: 0, z: 0 }, { x: 10, z: 0 })), 90);
  assert.equal(Math.round(bearingDeg({ x: 0, z: 0 }, { x: 0, z: 10 })), 180);
  assert.equal(Math.round(bearingDeg({ x: 0, z: 0 }, { x: -10, z: 0 })), 270);
});
