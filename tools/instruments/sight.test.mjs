/**
 * The sight occluders' one ray test (src/instruments/lib/sight.js; M2 wave 1, area C), browser-free:
 *   node --test tools/instruments/sight.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setOccluder, clearOccluder, clearOccluders, occluderSlots, sightBlocked, segmentHit } from '../../src/instruments/lib/sight.js';

const box = { type: 'box', cx: 0, cy: 1.5, cz: 0, hx: 0.9, hy: 0.5, hz: 2.25, yaw: 0 };

test('box: a ray through the hull hits, one over it or beside it does not', () => {
  assert.ok(segmentHit(box, -5, 1.5, 0, 5, 1.5, 0) > 0);
  assert.equal(segmentHit(box, -5, 2.2, 0, 5, 2.2, 0), -1);          // over the top
  assert.equal(segmentHit(box, -5, 0.6, 0, 5, 0.6, 0), -1);          // under the belly
  assert.equal(segmentHit(box, -5, 1.5, 2.4, 5, 1.5, 2.4), -1);      // past the bow
  assert.equal(segmentHit(box, -5, 1.5, 0, -1, 1.5, 0), -1);         // stops short
  const t = segmentHit(box, -5, 1.5, 0, 5, 1.5, 0);
  assert.ok(Math.abs(t - (5 - 0.9) / 10) < 1e-9);
});

test('box: yaw turns the long axis (yaw pi/2 lays it along x)', () => {
  const b = { ...box, yaw: Math.PI / 2 };
  assert.ok(segmentHit(b, 2.0, 1.5, -5, 2.0, 1.5, 5) > 0);           // 2 m along x is inside the 2.25 m half-length
  assert.equal(segmentHit(box, 2.0, 1.5, -5, 2.0, 1.5, 5), -1);      // unturned, x 2 m is past the 0.9 m half-width
});

test('cylinder and arc', () => {
  const c = { type: 'cyl', cx: 0, cz: 0, r: 0.5, y0: 0, y1: 3 };
  assert.ok(segmentHit(c, -2, 1, 0, 2, 1, 0) >= 0);
  assert.equal(segmentHit(c, -2, 3.5, 0, 2, 3.5, 0), -1);
  assert.ok(segmentHit(c, 0, 5, 0, 0, 1, 0) >= 0);                    // straight down through the cap
  // a wall arc of radius 20 facing NE (bearings 0..pi/2), 0.6 m thick, 2.5 m high
  const a = { type: 'arc', cx: 0, cz: 0, r: 20, thick: 0.6, a0: 0, a1: Math.PI / 2, y0: 0, y1: 2.5 };
  assert.ok(segmentHit(a, 10, 1, 10, 20, 1, 20) >= 0);               // out through the wall at bearing 45
  assert.equal(segmentHit(a, -10, 1, -10, -20, 1, -20), -1);         // bearing 225: no wall there
  assert.equal(segmentHit(a, 10, 3, 10, 20, 3, 20), -1);             // over the wall-top
  assert.equal(segmentHit(a, 5, 1, 5, 10, 1, 10), -1);               // inside the ring, never reaches it
  const wrap = { ...a, a0: 1.5 * Math.PI, a1: 2.5 * Math.PI };       // a span across bearing 0
  assert.ok(segmentHit(wrap, 0, 1, 10, 0, 1, 30) >= 0);
  assert.equal(segmentHit(wrap, 0, 1, -10, 0, 1, -30), -1);
});

test('the slot list: set, replace, ignore, clear', () => {
  clearOccluders();
  setOccluder('tiller:1:hull', box);
  setOccluder('wall:3', { type: 'cyl', cx: 10, cz: 0, r: 1, y0: 0, y1: 3 });
  assert.deepEqual(occluderSlots(), ['tiller:1:hull', 'wall:3']);
  assert.equal(sightBlocked(-5, 1.5, 0, 5, 1.5, 0), 'tiller:1:hull');
  assert.equal(sightBlocked(-5, 1.5, 0, 5, 1.5, 0, 'tiller:1:'), null);
  setOccluder('tiller:1:hull', { ...box, cx: 50 });
  assert.equal(sightBlocked(-5, 1.5, 0, 5, 1.5, 0), null);
  clearOccluder('wall:3');
  assert.deepEqual(occluderSlots(), ['tiller:1:hull']);
  clearOccluders('tiller:');
  assert.deepEqual(occluderSlots(), []);
});
