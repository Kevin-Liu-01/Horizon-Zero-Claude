/**
 * IN2 under node --test (M2 wave 4, area C): tools/instruments/herd-bearing.mjs, the herd holds its bearing and
 * reacts only when she stands on it.   node --test tools/instruments/herd-bearing.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runHerdBearing } from './herd-bearing.mjs';

test('IN2: beside the bearing 0 of 10 react, on it 10 of 10; the bearing holds within 2 deg over 120 m', () => {
  const r = runHerdBearing();
  console.log(JSON.stringify({ besideReacted: r.besideReacted, onReacted: r.onReacted, controlReacted: r.controlReacted, maxTurnDeg: r.maxTurnDeg, minWalked: r.minWalked,
    onReactedS: r.on.map((o) => o.reactedS) }));
  assert.equal(r.besideReacted, 0, 'a herd reacted to her beside its bearing');
  assert.equal(r.onReacted, 10, 'a herd did not react to her on its bearing');
  assert.ok(r.maxTurnDeg <= 2, `bearing change ${r.maxTurnDeg} deg`);
  assert.ok(r.minWalked >= 119.5, `walked ${r.minWalked} m`);
  assert.ok(r.controlReacted >= 8, `the control (no gate) reacted only ${r.controlReacted} of 10: the walks prove nothing about the gate`);
});
