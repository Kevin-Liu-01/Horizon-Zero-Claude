// @ts-check
/**
 * M3 area B, THE LIFT SEAM as the kite reads it. The seam's owner is area A (world): `liftAt(x, y, z)` in
 * `src/world/island/lift.js`, baked from the island's slope and aspect (M3 briefs §3.2; landed at f6d3eb7). The flight
 * law never imports the world: the page binds area A's function here (`setLiftSource(liftAt)`) and the Node rows step
 * the law on it directly (tools/gates/kite/world.mjs; rule 21, a twin imports the game's own module).
 *
 *   BIBLE §12: ridge lift on windward slopes of 25 deg or more within 40 m below: +0.5 to +1.5 m/s; 0 over flat
 *   ground, over water and in the lee. The cap at launch height + 25 m is applied by the flight law as well (it knows
 *   the launch); the band is read as her climb in lift (BIBLE §18's read-out: LIFT +0.8).
 */

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
