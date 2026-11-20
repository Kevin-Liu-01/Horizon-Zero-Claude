// @ts-check
/**
 * M3 area B, THE LIFT SEAM as the kite reads it. The seam's owner is area A (world): `liftAt(x, y, z)` from
 * `src/world/island/lift.js`, baked from the island's slope and aspect (M3 briefs §3.2). Until that file lands, this is
 * the STUB the flight law and the Node rows step: the same law in the bible's words, computed per call from the
 * island's own height function (injected, so this file stays three-free and never imports the recipe itself).
 *
 *   BIBLE §12: ridge lift on windward slopes of 25 deg or more within 40 m below: +0.5 to +1.5 m/s; 0 over flat
 *   ground, over water and in the lee. (The cap at launch height + 25 m is the flight law's: it depends on the launch.)
 *
 * When area A's `liftAt` lands, the page calls `setLiftSource(liftAtFromA)` and nothing else changes; the Node rows
 * then run against it (rule 21: a twin imports the game's own module).
 */

/** The stub's numbers (the bible's bands; * are starting values). */
export const LIFT = Object.freeze({
  /** deg: a face this steep or steeper, looking into the wind, lifts */
  minSlopeDeg: 25,
  /** deg: at this slope or steeper (straight into the wind) the lift is the band's top */
  fullSlopeDeg: 40,
  /** deg*: a face looks "into the wind" when the bearing it looks toward is within this of the wind's FROM bearing */
  facingDeg: 60,
  /** m: the face must lie within this far below her */
  depthM: 40,
  /** m/s: the band, read as her climb in that air (BIBLE §18's read-out: LIFT +0.8) */
  min: 0.5, max: 1.5,
  /** m*: how far upwind of her (along the wind's FROM bearing) the face may lie, how far downwind, and the step */
  upwindM: 30, downwindM: 6, stepM: 3,
  /** m*: the gradient's half baseline */
  halfM: 2,
  /** m: ground at or under this height is water (the Glass's level is 0.16) */
  waterY: 0.16,
  /** m*: the lee: ground this far upwind standing above her shades her */
  leeM: 12,
  /** deg: the trade blows from 045 */
  windFromDeg: 45,
});

/**
 * Build the ridge-lift function on a height field. Pure; about 40 height reads a call.
 * @param {(x: number, z: number) => number} heightAt engine-frame ground height
 * @param {{ windFromDeg?: number }} [o]
 * @returns {(x: number, y: number, z: number) => number}
 */
export function makeRidgeLift(heightAt, { windFromDeg = LIFT.windFromDeg } = {}) {
  const r = windFromDeg * Math.PI / 180;
  // the direction the wind comes FROM (engine frame: x = sin b, z = -cos b); upwind of her is along it
  const fx = Math.sin(r), fz = -Math.cos(r);
  const cosFacing = Math.cos(LIFT.facingDeg * Math.PI / 180);
  const h = LIFT.halfM;
  return function liftAt(x, y, z) {
    const g0 = heightAt(x, z);
    if (g0 <= LIFT.waterY) return 0;                    // over water
    if (y < g0 || y - g0 > LIFT.depthM) return 0;
    if (heightAt(x + fx * LIFT.leeM, z + fz * LIFT.leeM) > y) return 0;   // in the lee
    let best = 0;
    for (let s = -LIFT.downwindM; s <= LIFT.upwindM; s += LIFT.stepM) {
      const px = x + fx * s, pz = z + fz * s;
      const hm = heightAt(px, pz);
      if (hm <= LIFT.waterY) continue;
      const below = y - hm;
      if (below < 0 || below > LIFT.depthM) continue;
      const gx = (heightAt(px + h, pz) - heightAt(px - h, pz)) / (2 * h);
      const gz = (heightAt(px, pz + h) - heightAt(px, pz - h)) / (2 * h);
      const gm = Math.hypot(gx, gz);
      if (gm < 1e-6) continue;
      const slope = Math.atan(gm) * 180 / Math.PI;
      if (slope < LIFT.minSlopeDeg) continue;
      // the face looks downhill, along -grad; into the wind when that is near the FROM direction
      const facing = (-gx * fx - gz * fz) / gm;
      if (facing < cosFacing) continue;
      const kS = Math.min(1, (slope - LIFT.minSlopeDeg) / (LIFT.fullSlopeDeg - LIFT.minSlopeDeg));
      const kF = (facing - cosFacing) / (1 - cosFacing);
      const v = Math.min(LIFT.max, LIFT.min + (LIFT.max - LIFT.min) * kS * kF);
      if (v > best) best = v;
    }
    return best;
  };
}

/** @type {((x: number, y: number, z: number) => number) | null} */
let source = null;

/**
 * Set where `liftAt` reads from: area A's baked field when it lands, else a `makeRidgeLift` stub.
 * @param {((x: number, y: number, z: number) => number) | null} fn
 */
export function setLiftSource(fn) { source = fn; }

/** The seam call. 0 until a source is set. */
export function liftAt(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) {
  return source ? source(x, y, z) : 0;
}
