// M1.3e hit feel in Node (src/combat/hitfeel.js), browser-free:
//   node --test tools/gates/systems/hitfeel.test.mjs
// The live row is kit-probe-page.mjs `hit-feel` / `hit-feel-lance` (the slice run's one Chrome session).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HitFeel, KICK, HS, FLINCH, flinchEnvelope } from '../../../src/combat/hitfeel.js';

function rig({ height = 3.4, heading = 0 } = {}) {
  const root = new THREE.Group(), body = new THREE.Group(), rigRoot = new THREE.Group(), head = new THREE.Bone();
  root.add(body); body.add(rigRoot); rigRoot.add(head);
  head.position.set(0, 2.6, 0);
  root.rotation.y = heading;
  root.updateMatrixWorld(true);
  const m = { kind: 'plumb', alive: true, height, position: root.position, root, heading, rig: { root: rigRoot, head }, gait: { pose: { hit: 0, hitDir: 0 } } };
  return m;
}
const headAt = (m) => { m.root.updateMatrixWorld(true); return m.rig.head.getWorldPosition(new THREE.Vector3()); };

test('a frontal arrow rocks the rig away from the blow: the head moves >= 3 cm by 80 ms and is back within 1 cm by 400 ms', () => {
  const m = rig();
  const hf = new HitFeel({ engine: null, environment: null, player: { position: new THREE.Vector3(0, 0, 20) } }, { melee: null });
  const p0 = headAt(m);
  const now = 100;
  // the arrow flies from her (at +z 20) toward the Plumb: direction -z; a plink (share 0)
  hf.hit({ machine: m, point: new THREE.Vector3(0, 2.6, 0.3), dir: new THREE.Vector3(0, 0, -1), k: 0.2, share: 0 });
  const t0 = hf.last.t;
  let peak = 0, at = null;
  for (let ms = 0; ms <= 80; ms += 8) { hf.update(t0 + ms / 1000); const d = headAt(m).distanceTo(p0); if (d > peak) { peak = d; at = headAt(m); } }
  assert.ok(peak >= 0.03, `peak ${peak.toFixed(4)} m`);
  assert.ok(at.z < p0.z, 'the head moves away from her (along the blow, -z)');
  hf.update(t0 + 0.4);
  const back = headAt(m).distanceTo(p0);
  assert.ok(back <= 0.01, `at 400 ms ${back.toFixed(4)} m`);
  hf.update(t0 + KICK.life + 0.01);
  assert.ok(headAt(m).distanceTo(p0) < 1e-9, 'restored exactly');
  assert.equal(m.rig.root.quaternion.equals(new THREE.Quaternion()), true);
  void now;
});

test('the rock follows the body: a blow from her left (the Plumb turned) still moves the head along the blow', () => {
  const m = rig({ heading: 1.1 });
  const hf = new HitFeel({ engine: null, environment: null, player: null }, { melee: null });
  const p0 = headAt(m);
  const dir = new THREE.Vector3(1, 0, 0);
  hf.hit({ machine: m, point: new THREE.Vector3(0, 2.6, 0), dir, k: 0.5, share: 0.1 });
  hf.update(hf.last.t + 0.03);
  const d = headAt(m).sub(p0);
  assert.ok(d.x > 0.03, `along the blow ${d.x.toFixed(4)} m`);
  assert.ok(Math.abs(d.z) < 0.01, `across ${d.z.toFixed(4)} m`);
});

test('a dead machine is not rocked, and the freeze cap holds (one hit <= HS.cap, the 1 s window <= HS.window)', () => {
  const m = rig(); m.alive = false;
  const hf = new HitFeel({ engine: null, environment: null, player: null }, { melee: null });
  hf.hit({ machine: m, point: new THREE.Vector3(0, 2.6, 0), dir: new THREE.Vector3(0, 0, -1), k: 1, share: 1 });
  assert.equal(hf._rocks.length, 0);
  // the freeze: a stand-in engine and the lance's ring
  const ring = { _hsS: new Float64Array(8), _hsE: new Float64Array(8), _hsI: 0 };
  const eng = { requestTimeScale() {} };
  const c = { melee: ring };
  const h2 = new HitFeel({ engine: eng }, c);
  // seven hits 0.13 s apart, each asking 0.1 s (the live row's burst), on a stand-in clock
  const realNow = performance.now.bind(performance);
  let clock = 5000;
  performance.now = () => clock;
  const given = [];
  try { for (let i = 0; i < 7; i++) { given.push(h2.freeze(0.1)); clock += 130; } } finally { performance.now = realNow; }
  assert.ok(given[0] <= HS.cap + 1e-9, `first ${given[0]}`);
  // the frozen time is the union of the ledger's spans (a new freeze cuts the running one where it starts)
  const spans = h2.freezes.filter((f) => f.given > 0).map((f) => [f.s, f.e]);
  let worst = 0;
  for (const [a0] of spans) { let sum = 0; for (const [s0, e0] of spans) { const a = Math.max(s0, a0), b = Math.min(e0, a0 + 1); if (b > a) sum += b - a; } worst = Math.max(worst, sum); }
  assert.ok(worst <= HS.window + 1e-9, `frozen ${worst.toFixed(3)} s in a 1 s window`);
  assert.ok(given.filter((g) => g > 0).length >= 2, `the burst gets more than one freeze: ${given.map((g) => g.toFixed(3))}`);
});

test('the flinch (M1b exit fix): the gait\'s channel is held at the kick through the freeze and under 1 % of it by 400 ms (real clock)', () => {
  const m = rig();
  m.gait._hit = 0;
  // a stand-in gait: reads the impulse, decays on GAME time (6.5/s), and the freeze holds game time (dt ~ 0)
  const gaitStep = (dtGame) => { const p = m.gait.pose; if (p.hit > 0) { m.gait._hit = Math.max(m.gait._hit, p.hit); p.hit = 0; } m.gait._hit *= Math.exp(-6.5 * dtGame); };
  const hf = new HitFeel({ engine: null, environment: null, player: { position: new THREE.Vector3(0, 0, 20) } }, { melee: null });
  hf.hit({ machine: m, point: new THREE.Vector3(0, 2.6, 0.3), dir: new THREE.Vector3(0, 0, -1), k: 0.5, share: 0.2 });
  const t0 = hf.last.t, kick = hf.last.kick;
  assert.ok(kick > 0);
  let at50 = null, at400 = null;
  for (let ms = 0; ms <= 420; ms += 1000 / 60) {
    const frozen = ms < 100;   // a 100 ms freeze: game time at 0.03
    gaitStep((1 / 60) * (frozen ? 0.03 : 1));
    hf.update(t0 + ms / 1000);
    if (at50 === null && ms >= 50) at50 = m.gait._hit;
    if (at400 === null && ms >= 400) at400 = m.gait._hit;
  }
  assert.ok(at50 >= 0.95 * kick, `held through the freeze: ${at50} of ${kick}`);
  assert.ok(at400 <= 0.01 * kick, `settled by 400 ms: ${at400} of ${kick}`);
  assert.ok(flinchEnvelope(FLINCH.hold) === 1 && flinchEnvelope(0.4) < 0.01);
});
