// M3 area B, wave 2: the GLIDES the orchestrator's rulings R3 and R4 grade, flown by the flight law (src/game/kite/flight.js)
// on the island's height, area A's lift and the environment's own windAt with its clock RUNNING (each trial starts the
// wind's clock at a different time and with a different gust, so the gust and the noise along the wind differ). The
// launch is the one launch (a jump off a trig pillar's top, Space at 0.35 s: flight.js openHeightOffTop). No browser.
//   flyTestFlight(k)   R3: T1 -> the marked field (roads.js TEST_FLIGHT), the hand holding the ground track on its centre
//   flyRoad(road, k)   R4: a glide road from its launch (roads.js ROAD_LAUNCH), the hand holding the track on each post in
//                      turn; a post is passed when her ground track comes within POST_PASS_M of it, airborne
import { Environment } from '../../../src/world/environment.js';
import { TRIG, TRIG_TOP } from '../../../src/world/island/sites.js';
import { openHeightOffTop, dirBearing } from '../../../src/game/kite/flight.js';
import { WIND_ROADS, ROAD_LAUNCH, POST_PASS_M, TEST_FLIGHT } from '../../../src/game/kite/roads.js';
import { WEATHER, islandWorld, heightAt, fly, waterDepthAt } from './world.mjs';

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
