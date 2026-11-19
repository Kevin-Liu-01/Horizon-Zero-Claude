/**
 * IN3, moving cover, under node --test (M2 wave 3, area C): tools/instruments/moving-cover.mjs's ten lee walks.
 *   node --test tools/instruments/moving-cover.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runMovingCover } from './moving-cover.mjs';

test('IN3: ten crouched lee walks beside a moving Tiller hull: 0 detections; 3 m out of the shadow: seen within 4 s in 10 of 10', () => {
  const r = runMovingCover();
  assert.equal(r.controlSeen, 10, `control: with no occluders the lee walks are seen in ${r.controlSeen} of 10`);
  assert.equal(r.leeDetections, 0, `lee detections ${r.leeDetections}: ${JSON.stringify(r.lee.filter((x) => x.seenTicks))}`);
  assert.equal(r.openDetected4s, 10, `out of the shadow seen within 4 s in ${r.openDetected4s} of 10`);
});
