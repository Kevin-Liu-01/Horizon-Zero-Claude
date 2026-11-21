// M3 area B, wave 2: the GLIDES the orchestrator's rulings R3 and R4 grade, flown by the flight law (src/game/kite/flight.js)
// on the island's height, area A's lift and the environment's own windAt with its clock RUNNING (each trial starts the
// wind's clock at a different time and with a different gust, so the gust and the noise along the wind differ). The
// launch is the one launch (a jump off a trig pillar's top, Space at 0.35 s: flight.js openHeightOffTop). No browser.
//   flyTestFlight(k)   R3: T1 -> the marked field (roads.js TEST_FLIGHT), the hand holding the ground track on its centre
//   flyScarHome(k)     wave 3c: the Scar road from T3 along its seven posts, then home to roads.js SCAR_FIELD
//   flyCalderaHome(at, k)  wave 3c: the caldera lift road's ride, then home to roads.js CALDERA_FIELD
//   flyRoad(road, k)   R4: a glide road from its launch (roads.js ROAD_LAUNCH), the hand holding the track on each post in
//                      turn; a post is passed when her ground track comes within POST_PASS_M of it, airborne
import { Environment } from '../../../src/world/environment.js';
import { TRIG, TRIG_TOP } from '../../../src/world/island/sites.js';
import { openHeightOffTop, dirBearing, createFlightBody, openAt, stepFlight } from '../../../src/game/kite/flight.js';
import { alongPosts, toField, bankToward } from '../../../src/game/kite/pilot.js';
import { WIND_ROADS, ROAD_LAUNCH, POST_PASS_M, TEST_FLIGHT, SCAR_FIELD, CALDERA_FIELD, landedNear } from '../../../src/game/kite/roads.js';
import { WEATHER, islandWorld, heightAt, fly, waterDepthAt, faceAt } from './world.mjs';

const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
/** the hand on the bar: turn the GROUND TRACK toward a goal (row0.mjs's driver) */
const holdTrack = (goal, gain = 3) => (f) => {
  if (!(f.vx || f.vz)) return {};
  const want = Math.atan2(goal.x - f.x, -(goal.z - f.z)), have = Math.atan2(f.vx, -f.vz);
  return { bank: Math.max(-1, Math.min(1, wrap(want - have) * gain)) };
};

/** trial k's wind: the environment's own windAt, its clock starting at 17.3 k s and running with the flight; gust 0..0.9 */
export function trialWind(k) {
  const env = { _t: 17.3 * k, wind: { x: -Math.SQRT1_2, z: Math.SQRT1_2, gust: (k % 4) * 0.3, strength: 0.85 }, _windMS: WEATHER.trade.windMS, weather: 'trade' };
  return { env, windAt: (x, z, out) => Environment.prototype.windAt.call(env, x, z, out), t0: env._t };
}

const launchOf = (id) => { const T = TRIG.find((t) => t.id === id); return { T, y: openHeightOffTop(heightAt(T.x, T.z) + TRIG_TOP) }; };

/** R3: the test flight, trial k. */
export function flyTestFlight(k = 0) {
  const W = trialWind(k), world = islandWorld({ windAt: W.windAt });
  const { T, y } = launchOf(TEST_FLIGHT.from), F = TEST_FLIGHT.field;
  let minAgl = Infinity;
  const r = fly(world, { x: T.x, y, z: T.z, headingDeg: TEST_FLIGHT.bearing, maxS: 60, steer: holdTrack(F, 2.5 + (k % 3) * 0.5),
    onStep: (f, t, s) => { W.env._t = W.t0 + t; if (s === 'gliding') minAgl = Math.min(minAgl, f.agl); } });
  return { k, state: r.state, t: r.t, e: +r.f.x.toFixed(2), n: +(-r.f.z).toFixed(2), fromCentreM: +Math.hypot(r.f.x - F.x, r.f.z - F.z).toFixed(2),
    landVs: +r.f.landVs.toFixed(2), landDamage: r.f.landDamage, depth: waterDepthAt(r.f.x, r.f.z), minAgl: +minAgl.toFixed(2), launchY: +y.toFixed(2), gust: W.env.wind.gust };
}

/** R4: a glide road, trial k. */
export function flyRoad(road, k = 0) {
  const W = trialWind(k), world = islandWorld({ windAt: W.windAt });
  const posts = WIND_ROADS[road], { T, y } = launchOf(ROAD_LAUNCH[road]);
  const passed = [];
  let i = 0, end = 'flying';
  const gain = 2.5 + (k % 3) * 0.5;
  const r = fly(world, { x: T.x, y, z: T.z, headingDeg: dirBearing(posts[0].x - T.x, posts[0].z - T.z), maxS: 240,
    steer: (f) => {
      if (i >= posts.length) return { fold: true };
      const p = posts[i], d = Math.hypot(p.x - f.x, p.z - f.z);
      if (d <= POST_PASS_M) { passed.push({ id: p.id, agl: +(f.y - heightAt(p.x, p.z)).toFixed(2), overTopM: +(f.y - heightAt(p.x, p.z) - p.heightM).toFixed(2), d: +d.toFixed(2) }); i++; if (i >= posts.length) { end = 'last post reached'; return { fold: true }; } }
      return holdTrack(posts[i], gain)(f);
    },
    onStep: (f, t) => { W.env._t = W.t0 + t; } });
  if (end !== 'last post reached') end = `${r.state} at (${r.f.x.toFixed(1)}, ${(-r.f.z).toFixed(1)}) after ${r.t} s`;
  return { k, road, launch: ROAD_LAUNCH[road], launchY: +y.toFixed(2), passed, end, t: r.t };
}

/* ------------------------------------------------------------------ wave 3c: the roads flown to a landing */

/** One flight stepped at 60 Hz with a pilot's wanted bearing (pilot.js); the bar rolls in over 0.25 s as on the page. */
function flyWant(world, W, at, want, maxS = 240) {
  const f = createFlightBody();
  let st = openAt(f, { ...at, groundY: heightAt(at.x, at.z) }), t = 0, bank = 0, maxY = at.y;
  while (t < maxS && st !== 'none' && st !== 'landing') {
    const w = want(f, t);
    bank += Math.max(-4 / 60, Math.min(4 / 60, bankToward(f, w) - bank));
    W.env._t = W.t0 + t;
    st = stepFlight(st, f, { bank }, world, 1 / 60); t += 1 / 60; maxY = Math.max(maxY, f.y);
  }
  return { f, st, t: +t.toFixed(2), maxY };
}

/** R4 to its end: the Scar road from T3's top, the track on each post in turn, then home to SCAR_FIELD (trial k). */
export function flyScarHome(k = 0) {
  const W = trialWind(k), world = islandWorld({ windAt: W.windAt }), posts = WIND_ROADS.scar, { T, y } = launchOf(ROAD_LAUNCH.scar);
  const passed = [], phases = { track: 0, orbit: 0, final: 0 };
  let i = 0, tLast = null;
  const r = flyWant(world, W, { x: T.x, y, z: T.z, headingDeg: dirBearing(posts[0].x - T.x, posts[0].z - T.z) }, (f, t) => {
    if (i < posts.length) {
      const a = alongPosts(f, posts, i, POST_PASS_M);
      if (a.passed) { passed.push({ id: posts[i].id, agl: +(f.y - heightAt(posts[i].x, posts[i].z)).toFixed(1), d: +a.d.toFixed(1), t: +t.toFixed(1) }); i++; if (i === posts.length) tLast = +t.toFixed(1); }
      if (i < posts.length) return a.want;
    }
    const h = toField(f, SCAR_FIELD); phases[h.phase] += 1 / 60; return h.want;
  });
  const f = r.f;
  return { k, launch: ROAD_LAUNCH.scar, launchY: +y.toFixed(2), passed, lastPostAtS: tLast, state: r.st, t: r.t, near: r.st === 'landing' ? landedNear(f.x, f.z) : null,
    fromCentreM: +Math.hypot(f.x - SCAR_FIELD.x, f.z - SCAR_FIELD.z).toFixed(2), landVs: +f.landVs.toFixed(2), landDamage: f.landDamage, depth: +waterDepthAt(f.x, f.z).toFixed(2),
    phases: Object.fromEntries(Object.entries(phases).map(([a, b]) => [a, +b.toFixed(1)])) };
}

/**
 * The caldera lift road flown home (trial k): open where the caldera launch opens (`at`, the law's own launch off
 * CALDERA_LAUNCH), ride the face with the face on her RIGHT (across it south-east; off it under 10 m over the ground, back
 * onto it over 24 m) for `rideS` (16 s), then home to CALDERA_FIELD.
 */
export function flyCalderaHome(at, k = 0, rideS = 16) {
  const W = trialWind(k), world = islandWorld({ windAt: W.windAt });
  let liftS = 0;
  const r = flyWant(world, W, at, (f, t) => {
    if (f.lift > 0) liftS += 1 / 60;
    if (t < rideS) { const fc = faceAt(f.x, f.z), asp = (Math.atan2(fc.aspect.x, -fc.aspect.z) * 180 / Math.PI + 360) % 360; return f.agl < 10 ? asp : f.agl > 24 ? (asp + 180) % 360 : (asp + 90) % 360; }
    return toField(f, CALDERA_FIELD).want;
  });
  const f = r.f;
  return { k, state: r.st, t: r.t, climbM: +(r.maxY - at.y).toFixed(2), liftS: +liftS.toFixed(1), near: r.st === 'landing' ? landedNear(f.x, f.z) : null,
    fromCentreM: +Math.hypot(f.x - CALDERA_FIELD.x, f.z - CALDERA_FIELD.z).toFixed(2), landVs: +f.landVs.toFixed(2), landDamage: f.landDamage, slopeDeg: +faceAt(f.x, f.z).slopeDeg.toFixed(1) };
}
