// M3 wave 3b, area B: THE CALDERA'S LIFT, a launch the open rule allows, in Node on the game's own modules (the island's
// height, area A's lift field, the flight law; tools/gates/kite/world.mjs). The page flies the same launch by input
// (tools/gates/kite/flight-page.mjs --only caldera).
//   node --test tools/gates/kite/caldera-launch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOpen, createFlightBody, openAt, stepFlight, KITE } from '../../../src/game/kite/flight.js';
import { CALDERA_LAUNCH, WIND_ROADS } from '../../../src/game/kite/roads.js';
import { islandWorld, heightAt, faceAt } from './world.mjs';

const V0 = Math.sqrt(2 * KITE.gravity * KITE.jumpPeakM);
/** A run off a point at `v` m/s on `bearing`, the jump, Space at 0.42 s airborne and every 0.1 s after: the first open. */
function launch({ x, z, bearing }, v) {
  const r = bearing * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r), g0 = heightAt(x, z);
  for (let k = 0; k < 12; k++) {
    const t = 0.42 + 0.1 * k;
    for (let s = 0.05; s <= t; s += 1 / 60) if (g0 + V0 * s - 0.5 * KITE.gravity * s * s <= heightAt(x + dx * v * s, z + dz * v * s)) return { ok: false, why: 'landed', t: s };
    const px = x + dx * v * t, pz = z + dz * v * t, y = g0 + V0 * t - 0.5 * KITE.gravity * t * t, clearM = y - heightAt(px, pz);
    const q = canOpen({ airborneS: t, clearM });
    if (q.ok) return { ok: true, t, x: px, y, z: pz, clearM };
  }
  return { ok: false, why: 'never' };
}
/** Ride the face: across it with the face on her left, off it under 10 m over the ground, back onto it over 24 m. */
function ride(o, bearing, s) {
  const W = islandWorld(), f = createFlightBody();
  let st = openAt(f, { x: o.x, y: o.y, z: o.z, headingDeg: bearing, groundY: heightAt(o.x, o.z) }), t = 0, bank = 0, maxY = o.y, liftS = 0;
  while (t < s && (st === 'opening' || st === 'gliding')) {
    const fc = faceAt(f.x, f.z), asp = (Math.atan2(fc.aspect.x, -fc.aspect.z) * 180 / Math.PI + 360) % 360;
    const want = f.agl < 10 ? asp : f.agl > 24 ? (asp + 180) % 360 : (asp + 270) % 360;
    let h = (f.heading * 180 / Math.PI) % 360; if (h < 0) h += 360;
    let d = want - h; while (d > 180) d -= 360; while (d < -180) d += 360;
    bank += Math.max(-4 / 60, Math.min(4 / 60, (d < -8 ? -1 : d > 8 ? 1 : 0) - bank));
    st = stepFlight(st, f, { bank }, W, 1 / 60); t += 1 / 60;
    maxY = Math.max(maxY, f.y); if (f.lift > 0) liftS += 1 / 60;
  }
  return { st, t, climbM: maxY - o.y, liftS, launchY: f.launchY };
}

test('CALDERA_LAUNCH: the open rule allows it at a sprint and at a jog, with clearance to spare; she can stand there', () => {
  const sprint = launch(CALDERA_LAUNCH, 6.8), jog = launch(CALDERA_LAUNCH, 5.0);
  assert.ok(sprint.ok && sprint.clearM >= KITE.openClearM + 1.0, `sprint: ${JSON.stringify(sprint)}`);
  assert.ok(jog.ok && jog.clearM >= KITE.openClearM + 0.3, `jog: ${JSON.stringify(jog)}`);
  const face = faceAt(CALDERA_LAUNCH.x, CALDERA_LAUNCH.z);
  assert.ok(face.slopeDeg < 50, `slope ${face.slopeDeg} (SLIDE_DEG 50)`);
  const posts = WIND_ROADS.caldera.map((p) => Math.hypot(p.x - CALDERA_LAUNCH.x, p.z - CALDERA_LAUNCH.z));
  assert.ok(Math.min(...posts) <= 10, `nearest caldera post ${Math.min(...posts).toFixed(1)} m`);
});

test('KF3 on the caldera road: from CALDERA_LAUNCH she climbs in lift, +10 m inside 10 s and to the cap (launch + 25 m) inside 25 s', () => {
  const o = launch(CALDERA_LAUNCH, 6.8);
  const a = ride(o, CALDERA_LAUNCH.bearing, 10), b = ride(o, CALDERA_LAUNCH.bearing, 25);
  assert.ok(a.climbM >= 10, `10 s: ${a.climbM.toFixed(2)} m`);
  assert.ok(b.climbM >= KITE.liftCapM - 0.5 && b.climbM <= KITE.liftCapM + 0.01, `25 s: ${b.climbM.toFixed(2)} m (cap ${KITE.liftCapM})`);
  assert.ok(b.liftS >= 20, `in lift ${b.liftS.toFixed(1)} s`);
});
