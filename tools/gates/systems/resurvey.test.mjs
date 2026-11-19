// HR3 in Node (Milestone 2 area E, wave 3): THE RE-SURVEY's rule (src/game/resurvey/rules.js) on simulation time at
// 60 Hz, at Benchmark 1 on the island recipe's own ground, against its three marks (T1, T2, the Sounding Ring; HR0).
//   a 15.0 s hold +-0.1 with the Alidade on the mark within 3 deg; three bearings, each within 2.5 deg, taken with T;
//   a hit over 10 damage or the mark leaving 3 deg pauses the arc and does not reset the bearings taken;
//   Instruments come to look: >= 2 chosen from their stations, sent to points within 20 m (the page row times them).
// Browser-free: node --test tools/gates/systems/resurvey.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResurveyHold, angleToMark, bearingTo, chooseLookers } from '../../../src/game/resurvey/rules.js';
import { liveMarks, ResurveyLive, TURNS } from '../../../src/game/resurvey/live.js';
import { RESURVEY } from '../../../src/game/quest/scar-plan.js';
import { heightAt } from '../../../src/world/island/recipe.js';
import { TRIG, TRIG_TOP } from '../../../src/world/island/sites.js';
import { BENCHMARKS, site } from '../../../src/world/sites/layout.js';

const DT = 1 / 60;
const B1 = BENCHMARKS.find((b) => b.id === RESURVEY.benchmark);
const EYE = { x: B1.x, y: heightAt(B1.x, B1.z) + 1.55, z: B1.z };
const MARKS = liveMarks({ ground: heightAt, trig: TRIG, trigTop: TRIG_TOP, ring: site('sounding-ring') });
const mk = () => new ResurveyHold({ marks: MARKS, holdS: RESURVEY.holdS, onDeg: RESURVEY.onDeg, bearingDeg: RESURVEY.bearingDeg, hitDamage: RESURVEY.hitDamage });

/**
 * A unit vector from the eye at the mark's plate (its top less 0.3 m), turned `off` degrees sideways: rotated about the
 * axis that is "up" for the line itself, so the turn is exactly `off` degrees whatever the line's pitch.
 */
function at(id, off = 0) {
  const m = MARKS.find((q) => q.id === id);
  const y = m.y1 - 0.3;
  const dx = m.x - EYE.x, dy = y - EYE.y, dz = m.z - EYE.z, L = Math.hypot(dx, dy, dz);
  const d = { x: dx / L, y: dy / L, z: dz / L };
  // u: world up made perpendicular to d
  let ux = -d.y * d.x, uy = 1 - d.y * d.y, uz = -d.y * d.z;
  const uL = Math.hypot(ux, uy, uz); ux /= uL; uy /= uL; uz /= uL;
  const a = (off * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // Rodrigues with u perpendicular to d: d cos a + (u x d) sin a
  const cx = uy * d.z - uz * d.y, cy = uz * d.x - ux * d.z, cz = ux * d.y - uy * d.x;
  return { x: d.x * c + cx * s, y: d.y * c + cy * s, z: d.z * c + cz * s };
}
const view = (dir, o = {}) => ({ eye: EYE, dir, alidade: true, onPad: true, ...o });
function run(R, s, v) { const n = Math.round(s / DT); for (let i = 0; i < n; i++) R.step(DT, v); }

test('B1\'s three marks are T1, T2 and the Sounding Ring on the live ground, and aiming at each puts the line on it', () => {
  assert.deepEqual(MARKS.map((m) => m.id), ['T1', 'T2', 'sounding-ring']);
  for (const m of MARKS) {
    assert.ok(angleToMark(EYE, at(m.id), m) < 0.01, m.id);
    assert.ok(Math.abs(angleToMark(EYE, at(m.id, 2.9), m) - 2.9) < 0.15, `${m.id} 2.9 deg off reads ${angleToMark(EYE, at(m.id, 2.9), m)}`);
  }
  // the bearings HR0 measured at f6d3567 (T1 249.3, T2 76.6, the Ring 264)
  const b = Object.fromEntries(MARKS.map((m) => [m.id, bearingTo(EYE, m)]));
  assert.ok(Math.abs(b.T1 - 249.3) < 0.5 && Math.abs(b.T2 - 76.6) < 0.5 && Math.abs(b['sounding-ring'] - 264) < 0.5, JSON.stringify(b));
});

test('a 15.0 s hold on the mark with three bearings closes the re-survey at 15.0 s +-0.1 of simulation time', () => {
  const R = mk();
  run(R, 1, view(at('T1', 1.0)));
  assert.ok(R.take(view(at('T1', 1.0))), 'T1 at 1.0 deg');
  run(R, 4, view(at('T1', 1.0)));
  // slewing to T2 (about 173 deg round): off the mark, the arc waits
  const a0 = R.arc;
  run(R, 1.2, view(at('T2', 40)));
  assert.equal(R.arc, a0, 'off the mark the arc does not fill');
  assert.ok(R.take(view(at('T2', -2.0))));
  run(R, 5, view(at('T2', -2.0)));
  assert.ok(R.take(view(at('sounding-ring', 0.5))));
  for (let i = 0; i < 6 / DT && !R.done; i++) R.step(DT, view(at('sounding-ring', 0.5)));
  const rep = R.report();
  assert.equal(rep.done, true);
  assert.ok(Math.abs(rep.arc - 15.0) <= 0.1, `arc ${rep.arc}`);
  assert.equal(rep.taken, 3);
  for (const b of rep.bearings) assert.ok(b.err <= 2.5);
  // the hold's on-mark time is the arc, to one step
  assert.ok(Math.abs(R.onSteps * DT - 15.0) <= DT + 1e-9, `${R.onSteps} steps`);
});

test('3 deg is the mark: 2.9 deg off fills the arc, 3.1 deg off does not', () => {
  const A = mk(); run(A, 2, view(at('T2', 2.9))); assert.ok(Math.abs(A.arc - 2) < DT * 1.5, `2.9: ${A.arc}`);
  const B = mk(); run(B, 2, view(at('T2', 3.1))); assert.equal(B.arc, 0);
  // the Alidade down or off the pad pauses it too
  const C = mk(); run(C, 2, view(at('T2'), { alidade: false })); run(C, 2, view(at('T2'), { onPad: false })); assert.equal(C.arc, 0);
});

test('a bearing is taken within 2.5 deg, once per mark', () => {
  const R = mk();
  assert.equal(R.take(view(at('T1', 2.6))), null);
  const t = R.take(view(at('T1', 2.4)));
  assert.equal(t.id, 'T1');
  assert.equal(R.take(view(at('T1', 0))), null, 'twice on one mark is one bearing');
  assert.equal(R.take(view(at('T2'), { alidade: false })), null, 'T with the Alidade down takes nothing');
  assert.equal(R.bearings.size, 1);
});

test('a hit over 10 damage pauses the arc 1.5 s and keeps the arc and the bearings; 10 or less does not', () => {
  const R = mk();
  R.take(view(at('T1')));
  run(R, 5, view(at('T1')));
  const arc = R.arc;
  assert.equal(R.hit(10), false);
  run(R, 0.5, view(at('T1')));
  assert.ok(R.arc > arc + 0.45);
  const arc2 = R.arc;
  assert.equal(R.hit(11), true);
  run(R, 1.0, view(at('T1')));
  assert.equal(R.arc, arc2, 'paused');
  assert.equal(R.bearings.size, 1, 'the bearing taken stays');
  run(R, 1.0, view(at('T1')));
  assert.ok(R.arc > arc2 && R.arc < arc2 + 0.6, `it runs again after 1.5 s: ${R.arc - arc2}`);
  // the mark leaving 3 deg pauses it too, and keeps it
  const arc3 = R.arc;
  run(R, 2, view(at('T1', 5)));
  assert.equal(R.arc, arc3);
  assert.equal(R.report().pauses.hit, 1);
  assert.ok(R.report().pauses.offMark >= 1);
});

test('a full arc waits for the last bearing', () => {
  const R = mk();
  R.take(view(at('T1'))); R.take(view(at('T2')));
  run(R, 20, view(at('T1')));
  assert.equal(R.done, false);
  assert.equal(R.arc, 15);
  assert.ok(R.take(view(at('sounding-ring'))));
  assert.equal(R.done, true);
});

test('Instruments come to look: the nearest live non-correcting ones within 70 m, each sent to 6 m short of her', () => {
  const list = [
    { id: 1, kind: 'peg', x: B1.x + 27, z: B1.z }, { id: 2, kind: 'peg', x: B1.x, z: B1.z + 27 }, { id: 3, kind: 'peg', x: B1.x - 27, z: B1.z },
    { id: 4, kind: 'screed', x: B1.x + 10, z: B1.z }, { id: 5, kind: 'plumb', x: B1.x + 90, z: B1.z },
  ];
  const pick = chooseLookers(list, B1, { n: 3, range: 70, standOff: 6, refuse: (k) => k === 'screed' });
  assert.deepEqual(pick.map((p) => p.id).sort(), [1, 2, 3]);
  for (const p of pick) assert.ok(Math.abs(Math.hypot(p.x - B1.x, p.z - B1.z) - 6) < 0.05);
  assert.ok(pick.length >= RESURVEY.lookers);
  // a lured Peg creeps at 0.7 of its 1.25 m/s walk after 0.9 s facing (machine.js _stateSuspicious): from 27 m it is
  // within 20 m at about 0.9 + 7 / 0.875 = 8.9 s, inside the 12 s; the page row times the real ones
  const tArrive = 0.9 + (27 - RESURVEY.nearM) / (1.25 * 0.7);
  assert.ok(tArrive < RESURVEY.arriveS, `${tArrive.toFixed(1)} s`);
});

// (M2 fix wave, HR8: tense, not lethal) the lookers take TURNS while the re-survey is armed: three engaged Pegs, asked
// every step as machine.js asks (engaged and off cooldown), never two strike in one step; each gets the turn; nobody
// strikes in the rests; after the arc closes they choose as their table does
test('the lookers strike one at a time while armed (TURNS), each in its turn, and freely after', () => {
  const ctx = { machines: { list: [] }, events: { on() {} }, input: null, player: { position: { x: EYE.x, z: EYE.z }, health: 72 }, camera: null };
  const L = new ResurveyLive(ctx, { at: { x: B1.x, z: B1.z }, marks: MARKS });
  const pegs = [0, 1, 2].map((i) => {
    const m = { id: i, kind: 'peg', alive: true, state: 'attack', position: { x: B1.x + 5 + i, z: B1.z + 3 }, cd: 0, blows: 0 };
    m.ai = { chooseAttack: () => (m.cd <= 0 ? { kind: 'mallet' } : null) };
    return m;
  });
  L.arm(true);
  L.watch(pegs);
  let both = 0, inRest = 0;
  const sim = (s, armed = true) => {
    for (let i = 0; i < Math.round(s / DT); i++) {
      L.simT += DT;
      if (armed) L._turnStep();
      let now = 0;
      for (const m of pegs) { m.cd -= DT; const a = m.ai.chooseAttack(4); if (a) { m.blows++; m.cd = 2.4; now++; if (L._turn.rest) inRest++; } }
      if (now > 1) both++;
    }
  };
  sim(30);
  assert.equal(both, 0, 'two lookers struck in one step');
  assert.equal(inRest, 0, 'a looker struck in a rest');
  for (const m of pegs) assert.ok(m.blows >= 2, `looker ${m.id} struck ${m.blows} times in 30 s`);
  const total = pegs.reduce((a, m) => a + m.blows, 0);
  // unheld, three Pegs off a 2.4 s cooldown strike 3 x 12.5 = 37 times in 30 s; in turns about a third of that
  assert.ok(total <= 14, `${total} blows in 30 s`);
  console.log(`# turns: ${total} blows in 30 s (unheld: ${pegs.length * Math.floor(30 / 2.4)})`);
  L.R.done = true;
  for (const m of pegs) m.blows = 0;
  sim(10, false);
  assert.ok(pegs.every((m) => m.blows >= 3), 'after the arc closes they choose freely');
  assert.ok(TURNS.strikeS > 0 && TURNS.restS > 0);
});
