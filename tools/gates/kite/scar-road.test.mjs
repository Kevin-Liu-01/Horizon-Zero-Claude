// M3 wave 3c, area B: THE SCAR ROAD BUILT AND FLOWN TO ITS END (R4: a glide road; KF7 for it reads "a glide along the
// posts from the road's launch reaches its last post"), and the open's bearing. Node, on the game's own modules (the
// island's height, area A's lift, the environment's windAt with its clock running: tools/gates/kite/glides.mjs). The page
// flies the same road by input (flight-page.mjs --only scar); leg 6's 'scar-flight' driver is scar-flight-drive.mjs.
//   node --test tools/gates/kite/scar-road.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIND_ROADS, POST_HEIGHT_M, SCAR_FIELD, LANDING_FIELDS, landedNear, ROAD_LAUNCH } from '../../../src/game/kite/roads.js';
import { KITE, openBearingDeg } from '../../../src/game/kite/flight.js';
import { flyScarHome } from './glides.mjs';
import { heightAt, waterDepthAt, faceAt, worldLiftAt } from './world.mjs';

test('the Scar road: 7 posts of 3 m in data, each on dry ground, posts 2-7 on ground under 30 deg (post 1 on the Scar head\'s face), in road order from the Yards end', () => {
  const P = WIND_ROADS.scar;
  assert.equal(P.length, 7);
  for (const p of P) {
    assert.equal(p.heightM, POST_HEIGHT_M);
    assert.equal(waterDepthAt(p.x, p.z), 0, `${p.id} in water`);
    if (p.i > 0) assert.ok(faceAt(p.x, p.z).slopeDeg < 30, `${p.id} slope ${faceAt(p.x, p.z).slopeDeg.toFixed(1)}`);
  }
  console.log(`[scar-road] posts: ${P.map((p) => `${p.id} (${p.x}, ${p.z}) g ${heightAt(p.x, p.z).toFixed(1)} m ${faceAt(p.x, p.z).slopeDeg.toFixed(0)} deg`).join('; ')}`);
  for (let i = 1; i < P.length; i++) assert.ok(P[i].x < P[i - 1].x && P[i].z > P[i - 1].z, 'down the Scar toward its foot (south-west)');
  assert.equal(ROAD_LAUNCH.scar, 'T3');
});

test('SCAR_FIELD: dry, within 0.7 m of level over its radius, no lift at 2 m over it, within 50 m of the Scar foot', () => {
  const F = SCAR_FIELD;
  let lo = Infinity, hi = -Infinity;
  for (let a = 0; a < 16; a++) for (const k of [0, 0.5, 1]) {
    const x = F.x + Math.sin(a * Math.PI / 8) * F.r * k, z = F.z + Math.cos(a * Math.PI / 8) * F.r * k, h = heightAt(x, z);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    assert.equal(waterDepthAt(x, z), 0);
    assert.equal(worldLiftAt(x, h + 2, z), 0);
  }
  assert.ok(hi - lo <= 0.7, `level within ${(hi - lo).toFixed(2)} m`);
  assert.ok(Math.abs(heightAt(F.x, F.z) - F.g) < 0.1, `g ${F.g} vs ${heightAt(F.x, F.z).toFixed(2)}`);
  assert.ok(Math.hypot(F.x - -91, F.z - 384) <= 50, 'near the Scar foot (-91, 384)');
  assert.equal(landedNear(F.x, F.z), 'scar-foot');
  assert.equal(new Set(LANDING_FIELDS.map((f) => f.near)).size, LANDING_FIELDS.length);
});

test('R4, the Scar road: from T3 a glide along the posts reaches the last post, then lands on SCAR_FIELD at <= the safe sink with 0 damage, 10 of 10 trial winds', () => {
  const rr = [...Array(10).keys()].map((k) => flyScarHome(k));
  for (const r of rr) {
    assert.equal(r.passed.length, 7, `trial ${r.k}: ${r.passed.length} posts`);
    assert.ok(r.passed.every((p) => p.agl > POST_HEIGHT_M + 10), `trial ${r.k}: low over a post ${JSON.stringify(r.passed)}`);
    assert.equal(r.state, 'landing', `trial ${r.k}`);
    assert.equal(r.near, 'scar-foot', `trial ${r.k}: ${r.fromCentreM} m from the field's centre`);
    assert.ok(r.landVs <= KITE.safeLandVs && r.landDamage === 0, `trial ${r.k}: ${r.landVs} m/s, ${r.landDamage} hp`);
  }
  const ts = rr.map((r) => r.t), lp = rr.map((r) => r.lastPostAtS);
  console.log(`[scar-road] 10/10: last post at ${Math.min(...lp)}-${Math.max(...lp)} s, down at ${Math.min(...ts)}-${Math.max(...ts)} s, ${Math.max(...rr.map((r) => r.fromCentreM))} m from the centre at most; over the posts ${rr[0].passed.map((p) => p.agl).join(', ')} m`);
});

test('the open bearing (wave 3c): her input direction while a move key is held, else her facing, never her velocity', () => {
  const dir = (b) => ({ x: Math.sin(b * Math.PI / 180), z: -Math.cos(b * Math.PI / 180) });
  // W held with the look on 283: 283, whatever her heading (the velocity is not an input)
  const w = dir(283);
  assert.ok(Math.abs(openBearingDeg({ wishX: w.x, wishZ: w.z, heading: 0.3 }) - 283) < 1e-6);
  // no key: her facing (the player's yaw faces (sin h, cos h); a bearing b is the yaw PI - b)
  for (const b of [0, 45, 283, 330]) {
    const got = openBearingDeg({ wishX: 0, wishZ: 0, heading: Math.PI - b * Math.PI / 180 });
    assert.ok(Math.abs(((got - b + 540) % 360) - 180) < 1e-6, `${b} -> ${got}`);
  }
});
