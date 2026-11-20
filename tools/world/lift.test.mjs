/**
 * node --test tools/world/lift.test.mjs — the lift field's law (src/world/island/lift.js; BIBLE §12, M3 briefs KF3):
 * windward slopes of 25 deg or more within 40 m below give +0.5 to +1.5 m/s; 0 over flat ground, over water, in the lee,
 * in still air and at or above launch height + 25 m. Read on the island itself (the recipe's ground).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { liftAt, faceAt, strengthOf, bakeLift, liftStats, LIFT, TRADE } from '../../src/world/island/lift.js';

// a windward face of the caldera's outer north-east wall, found by the law itself (engine x, z)
function windwardCell() {
  for (let x = 80; x <= 260; x += 4) for (let z = -260; z <= -60; z += 4) {
    const f = faceAt(x, z);
    if (strengthOf(f, TRADE) >= 1.2) return { x, z, h: f.h };
  }
  return null;
}

test('a windward face gives lift inside the band, up to 40 m over it', () => {
  const c = windwardCell();
  assert.ok(c, 'a windward face exists on the island');
  const L = liftAt(c.x, c.h + 10, c.z);
  assert.ok(L >= LIFT.min && L <= LIFT.max, `lift ${L}`);
  assert.equal(liftAt(c.x, c.h + LIFT.below + 0.5, c.z), 0, 'more than 40 m over the face');
  assert.equal(liftAt(c.x, c.h - 1, c.z), 0, 'under the ground');
});

test('launch height + 25 m caps it', () => {
  const c = windwardCell();
  assert.ok(liftAt(c.x, c.h + 10, c.z, { launchY: c.h - 10 }) > 0);
  assert.equal(liftAt(c.x, c.h + 10, c.z, { launchY: c.h + 10 - LIFT.ceiling }), 0);
});

test('the lee, still air and a reversed wind give none', () => {
  const c = windwardCell();
  assert.equal(liftAt(c.x, c.h + 10, c.z, { wind: { x: 0, z: 0 } }), 0, 'still air');
  assert.equal(liftAt(c.x, c.h + 10, c.z, { wind: { x: -TRADE.x, z: -TRADE.z } }), 0, 'the wind from 225: the face is in the lee');
});

test('0 over flat ground and over the sea', () => {
  // T1's table on the Organ Shelf (flat) and the open sea south of the black-sand beach
  assert.equal(liftAt(-187, 20, 357), 0);
  const sea = faceAt(-190, 470);
  assert.equal(sea.sea, true);
  assert.equal(liftAt(-190, 10, 470), 0);
});

test('every lift the law gives on the island is in the band (8 m samples, 10 m up)', () => {
  bakeLift(-480, -480, 480, 480);
  let any = 0;
  for (let x = -480; x <= 480; x += 8) for (let z = -480; z <= 480; z += 8) {
    const f = faceAt(x, z), L = liftAt(x, f.h + 10, z);
    if (!L) continue;
    any++;
    assert.ok(L >= LIFT.min - 1e-9 && L <= LIFT.max + 1e-9, `lift ${L} at ${x}, ${z}`);
    assert.ok(f.slopeDeg >= LIFT.MIN_DEG && !f.sea);
  }
  assert.ok(any > 100);
  assert.ok(liftStats().tiles >= 225);
});

test('deterministic: the same point reads the same', () => {
  const c = windwardCell();
  assert.equal(liftAt(c.x, c.h + 12.3, c.z), liftAt(c.x, c.h + 12.3, c.z));
});
