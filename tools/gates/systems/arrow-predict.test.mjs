/**
 * M1b (the slice's topple): `ArrowPool.predict` is the game's own flight read ahead. Each case fires a real pooled
 * arrow (`fire` + `update` on a fixed step, the game's `_stepFly` and sweep) and asks `predict` for the same launch on
 * the same step: where it strikes must agree to the millimetre, on any sub-step (1/60 s at 60 fps, 1/90 at 45), and a
 * riding aim must be met where the moving point will be. Node only: the terrain is analytic and no hulls are installed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// arrows.js draws two radial sprite textures on a canvas at import: a stand-in canvas is enough for Node
globalThis.document ??= { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const { ArrowPool, ARROW_LEN } = await import('../../../src/combat/arrows.js');

const terrain = { getHeight: (x, z) => 0.02 * x + 0.5 * Math.sin(z * 0.1), getNormal: (x, z, o) => o.set(0, 1, 0) };
const pool = () => {
  const ctx = { scene: new THREE.Scene(), terrain, machines: { list: [] }, events: { emit() {} } };
  const p = new ArrowPool(ctx, null, 4);
  p.onImpact = () => {};
  return p;
};

for (const dt of [1 / 60, 1 / 90, 1 / 45]) {
  test(`predict meets the ground where a fired arrow does (step ${(1 / dt).toFixed(0)} Hz)`, () => {
    const P = pool();
    const o = new THREE.Vector3(0, 1.4, 0), dir = new THREE.Vector3(0.3, 0.05, 1).normalize();
    const pr = P.predict(o, dir, 62, { dt, maxT: 4 });
    const a = P.fire(o, dir, 62, 'hunter', 1);
    for (let i = 0, t = 0; i < 800 && a.mode === 'fly'; i++) P.update(dt, (t += dt));
    assert.equal(a.mode, 'stuck');
    assert.equal(pr.hit, 'ground');
    // the stuck arrow's tip is planted 12 cm in: the hit point is ARROW_LEN - 0.12 ahead of its tail
    const tip = new THREE.Vector3(0, 0, ARROW_LEN - 0.12).applyQuaternion(a.group.quaternion).add(a.pos);
    assert.ok(tip.distanceTo(new THREE.Vector3(pr.x, pr.y, pr.z)) < 0.001, `predicted ${[pr.x, pr.y, pr.z]} fired ${tip.toArray()}`);
  });
}

test('the step matters: 1/60 against 1/90 s moves the strike by more than a vial', () => {
  const P = pool();
  const o = new THREE.Vector3(0, 1.4, 0), dir = new THREE.Vector3(0.3, 0.05, 1).normalize();
  const a = P.predict(o, dir, 62, { dt: 1 / 60, maxT: 4 }), b = P.predict(o, dir, 62, { dt: 1 / 90, maxT: 4 });
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.096);
});

test('a riding aim is met where the point will be, not where it stands', () => {
  const P = pool();
  const o = new THREE.Vector3(0, 30, 0);   // well above the ground: nothing is struck
  const ride = { x: 1.1, y: 0, z: 0 };
  // a point 31 m out: launched at where it will be after the flight, the flight passes it in its own frame
  const aim0 = { x: 0, y: 30, z: 31 };
  const still = P.predict(o, new THREE.Vector3(0, 0, 1), 62, { aim: aim0 });
  const tf = still.tAim;
  const lead = new THREE.Vector3(aim0.x + ride.x * tf, 30 - still.dy, 31).sub(o).normalize();
  const led = P.predict(o, lead, 62, { aim: aim0, ride });
  const unled = P.predict(o, new THREE.Vector3(0, 0, 1), 62, { aim: aim0, ride });
  assert.ok(led.d < 0.03, `led ${led.d}`);
  assert.ok(unled.d > 0.45, `unled ${unled.d}`);
});
