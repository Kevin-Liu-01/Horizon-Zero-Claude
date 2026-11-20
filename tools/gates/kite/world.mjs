// M3 area B: the kite's Node world. The flight law (src/game/kite/flight.js) stepped on the game's own modules (rule 21:
// a twin imports the game's module, not a copy of its law): the island's height (src/world/island/recipe.js heightAt),
// the environment's own windAt (src/world/environment.js, called on a stand-in `this` holding the trade's numbers,
// read from the environment's own weather table), area A's lift field (src/world/island/lift.js liftAt). No browser.
import { heightAt, GLASS_LEVEL, SEA_LEVEL } from '../../../src/world/island/recipe.js';
import { Environment } from '../../../src/world/environment.js';
import { liftAt as worldLiftAt, LIFT as WORLD_LIFT, faceAt } from '../../../src/world/island/lift.js';
import { flyableIn, createFlightBody, openAt, stepFlight, KITE } from '../../../src/game/kite/flight.js';

/** The environment's weather table (its `states` getter reads no instance state). */
export const WEATHER = Object.getOwnPropertyDescriptor(Environment.prototype, 'states').get.call({});

/**
 * The game's windAt on a stand-in environment: `weather` picks the wind speed from the weather table; `steady` holds the
 * gust noise's clock at 0 and its gust at 0 (the noise along the wind still varies with place, +-22 %).
 * @param {{ weather?: string, ms?: number }} [o]
 */
export function gameWind({ weather = 'trade', ms } = {}) {
  const env = { _t: 0, wind: { x: -Math.SQRT1_2, z: Math.SQRT1_2, gust: 0, strength: 0.85 }, _windMS: ms ?? WEATHER[weather].windMS, weather };
  return { env, windAt: (x, z, out) => Environment.prototype.windAt.call(env, x, z, out) };
}

/** A steady wind with no noise: `ms` from `fromDeg` (the law's bands are stated on a steady wind). */
export function steadyWind(ms, fromDeg = 45) {
  const r = (fromDeg + 180) * Math.PI / 180, wx = Math.sin(r), wz = -Math.cos(r);
  return (x, z, out) => { out.x = wx * ms; out.z = wz * ms; return ms; };
}

/** area A's liftAt in the trade (its default wind), as the flight law calls it */
export const islandLift = (x, y, z) => worldLiftAt(x, y, z);
export { WORLD_LIFT, faceAt, worldLiftAt };
export const waterDepthAt = (x, z) => { const g = heightAt(x, z); return Math.max(0, Math.max(SEA_LEVEL, GLASS_LEVEL) - g); };

/**
 * The island world for the law.
 * @param {{ weather?: () => string, windAt?: Function, liftAt?: Function }} [o]
 */
export function islandWorld({ weather = () => 'trade', windAt, liftAt = islandLift } = {}) {
  const w = windAt || gameWind().windAt;
  return { windAt: w, liftAt, groundAt: heightAt, waterDepthAt, flyable: () => flyableIn(weather()) };
}

/** A flat world at height `g`, with a wind and an optional lift function. */
export function flatWorld({ g = 0, windAt = steadyWind(0), liftAt = () => 0, flyable = () => true } = {}) {
  return { windAt, liftAt, groundAt: () => g, waterDepthAt: () => 0, flyable };
}

/**
 * Fly a body: open at a point and step at 60 Hz until it lands or `maxS` passes. `steer(f, t)` returns the input.
 * Returns the trace's summary.
 */
export function fly(world, { x, y, z, headingDeg, maxS = 120, dt = 1 / 60, steer = () => ({}), onStep = null }) {
  const f = createFlightBody();
  let state = openAt(f, { x, y, z, headingDeg, groundY: world.groundAt(x, z) });
  let t = 0, maxY = y, minAgl = Infinity, dist = 0, px = x, pz = z;
  const states = new Set([state]);
  while (t < maxS) {
    const prev = state;
    state = stepFlight(state, f, steer(f, t, state) || {}, world, dt);
    t += dt; states.add(state);
    dist += Math.hypot(f.x - px, f.z - pz); px = f.x; pz = f.z;
    if (f.y > maxY) maxY = f.y;
    if (state === 'gliding' && f.agl < minAgl) minAgl = f.agl;
    if (onStep) onStep(f, t, state);
    if (prev !== 'landing' && state === 'landing') break;
    if (state === 'none') break;
  }
  return { f, state, t: +t.toFixed(3), maxY: +maxY.toFixed(2), dist: +dist.toFixed(1), states: [...states], KITE };
}

export { heightAt };
