/**
 * The aim's convergence (combat._updateAimPoint -> core/hitHulls.js nearPath; M2 wave 0, D5), browser-free:
 *   node --test tools/instruments/aimconverge.test.mjs
 * A hull set is written by hand (world capsules, refreshed this frame) and the reticle ray is walked past it, so the
 * depth the aim takes is graded without a page. The page twin is the vial probe (an unaware Plumb's glass, A/B).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HitHulls } from '../../src/core/hitHulls.js';

/** A machine with one capsule from a to b (radius r, the skin included) and optional capsule weak point. */
function rig(a, b, r, { at = null, wp = null } = {}) {
  const m = { kind: 'probe', alive: true, root: {}, position: at || { x: (a[0] + b[0]) / 2, y: 0, z: (a[2] + b[2]) / 2 }, height: 3, size: { x: 2, z: 2 }, weakPoints: wp ? [wp] : [] };
  const h = { off: false, wax: a[0], way: a[1], waz: a[2], wbx: b[0], wby: b[1], wbz: b[2], wr: r,
    minx: Math.min(a[0], b[0]) - r, maxx: Math.max(a[0], b[0]) + r, miny: Math.min(a[1], b[1]) - r, maxy: Math.max(a[1], b[1]) + r,
    minz: Math.min(a[2], b[2]) - r, maxz: Math.max(a[2], b[2]) + r };
  return { m, set: { machine: m, hulls: [h], bones: [], frame: 0 } };
}
function hulls(...rigs) {
  const H = new HitHulls({ machines: { list: rigs.map((x) => x.m) } });
  for (const x of rigs) { x.set.frame = H.frame; H.sets.set(x.m, x.set); }
  return H;
}
const O = { x: 0, y: 1.6, z: 0 }, D = { x: 0, y: 0, z: 1 };
const DROP = 4.9 / (62 * 62);

test('a ray held 0.3 m over a hull at 15 m converges at its depth', () => {
  const H = hulls(rig([-0.3, 1.2, 15], [0.3, 1.2, 15], 0.05));
  const t = H.nearPath(O, D, 200, 0, 0.4);
  assert.ok(Math.abs(t - 15) < 0.25, `t ${t}`);
  assert.equal(H.nearKind, 'probe');
  assert.ok(Math.abs(H.nearGap - 0.35) < 0.02, `gap ${H.nearGap}`);
});

test('the drop is counted: a reticle held over by the fall at 15 m finds the hull under it', () => {
  const fall = DROP * 15 * 15;   // 0.287 m
  const H = hulls(rig([-0.3, 1.6 - fall - 0.5, 15], [0.3, 1.6 - fall - 0.5, 15], 0.05));
  // 0.79 m under the ray and 0.5 m under the fallen ray: out of the margin either way
  assert.equal(H.nearPath(O, D, 200, 0, 0.4), -1);
  const H2 = hulls(rig([-0.3, 1.6 - fall - 0.3, 15], [0.3, 1.6 - fall - 0.3, 15], 0.05));
  const t = H2.nearPath(O, D, 200, DROP, 0.4);
  assert.ok(Math.abs(t - 15) < 0.25, `t ${t}`);
  assert.ok(H2.nearGap < 0.3, `gap ${H2.nearGap}`);
});

test('nothing within the margin: no convergence', () => {
  const H = hulls(rig([-0.3, 0.2, 15], [0.3, 0.2, 15], 0.05));
  assert.equal(H.nearPath(O, D, 200, 0, 0.4), -1);
  assert.equal(H.nearKind, null);
});

test('a hull past the ground (far) is never taken', () => {
  const H = hulls(rig([-0.3, 1.3, 30], [0.3, 1.3, 30], 0.05));
  assert.equal(H.nearPath(O, D, 20, 0, 0.4), -1);
});

test('of two machines the closer pass wins, whatever its depth', () => {
  const near = rig([-0.3, 1.0, 12], [0.3, 1.0, 12], 0.05);     // 0.55 under: gap 0.55
  const far = rig([-0.3, 1.45, 25], [0.3, 1.45, 25], 0.05);    // 0.10 under: gap 0.10
  const H = hulls(near, far);
  const t = H.nearPath(O, D, 200, 0, 0.4);
  assert.ok(Math.abs(t - 25) < 0.25, `t ${t}`);
});

test('a dead machine is never taken', () => {
  const x = rig([-0.3, 1.3, 15], [0.3, 1.3, 15], 0.05);
  x.m.alive = false;
  assert.equal(hulls(x).nearPath(O, D, 200, 0, 0.4), -1);
});
