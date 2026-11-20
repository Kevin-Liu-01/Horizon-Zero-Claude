/**
 * THE LIFT FIELD (Milestone 3 wave 1, area A; M3 briefs §3.2 "Wind and lift"). Owner: world. Everyone else only calls:
 * hero-anim (the kite's flight law), cloth, instruments (the cut Sonde), world (a line-post's streamer streams when
 * `liftAt` > 0 at the post), audio, ui (the read-out).
 *
 * BIBLE §12, "The Survey Kite in numbers": "Ridge lift on windward slopes of 25° or more within 40 m below: +0.5 to
 * +1.5 m/s, capped at launch height + 25 m." KF3 (M3 briefs §5): "0 over flat ground, over water and in the lee".
 * One law for the whole island, never bent per road: a wind road that does not lift is reported and ruled on.
 *
 *   liftAt(x, y, z, opts?)    m/s of rise at an engine point (0 where there is none). opts { wind: { x, z } m/s, the
 *                             air's velocity (default: the trade, 5.5 m/s from 045), launchY: the flight's launch height
 *                             (the cap: 0 at or above launchY + LIFT.ceiling) }
 *   faceAt(x, z, out?)        the ground under a point as the law reads it: { h, slopeDeg, aspect: { x, z } (the
 *                             downhill unit vector the face looks along), sea }
 *   strengthOf(face, wind)    the lift a face gives in a wind, ignoring height (0, or LIFT.min..LIFT.max)
 *   bakeLift(x0, z0, x1, z1)  bake the tiles over a box now (an `approach` caller, so a flight never bakes in a frame)
 *   liftStats()               { tiles, cells, ms }
 *
 * BAKED FROM THE ISLAND'S SLOPE AND ASPECT: on a CELL m grid, the ground (src/world/island/recipe.js heightAt, the
 * function the game bakes its terrain from) is read at each node; a cell's slope and aspect are central differences
 * over BASELINE m (2 cells), so a rock or a hornito does not make a ridge. Tiles of TILE m are baked the first time a
 * query lands in them (about 0.7 ms a tile in Node) and kept. Nearest cell, no blend: the law answers 0 or a value in
 * the bible's band, never a value between (the kite may low-pass what it feels; that is the flight law's, not this).
 *
 * The strength on a face is LIFT.min at 25 deg and rises linearly to LIFT.max at FULL_DEG, scaled by how squarely the
 * face looks into the wind (a face looking within WINDWARD_DEG of where the wind comes from is windward; the scale is
 * 0 at that limit and 1 head-on, so a quartering face gives the low end). Under MIN_WIND m/s there is no ridge lift.
 * Pure: no THREE, no DOM. node --test: tools/world/lift.test.mjs; the rows: tools/world/lift-rows.mjs.
 */
import { ensureMacro, heightAt } from './recipe.js';

/** The law's numbers. Bible: MIN_DEG, min, max, below, ceiling. Marked * in the briefs (§14): FULL_DEG, WINDWARD_DEG, MIN_WIND. */
export const LIFT = Object.freeze({
  MIN_DEG: 25, FULL_DEG: 45, min: 0.5, max: 1.5, below: 40, ceiling: 25,
  WINDWARD_DEG: 60, MIN_WIND: 2.5, CELL: 4, BASELINE: 8, TILE: 64, SEA: 0.3,
});

/** The trade (bible §2.3; environment.js WIND_FROM): 5.5 m/s from 045, so the air moves toward 225 (engine -x, +z). */
export const TRADE = Object.freeze({ x: -5.5 * Math.SQRT1_2, z: 5.5 * Math.SQRT1_2 });

const C = LIFT.CELL, NT = LIFT.TILE / C;            // cells a tile side
const D = Math.round(LIFT.BASELINE / 2 / C);        // the half-baseline in cells (1)
const R2D = 180 / Math.PI;
const _tiles = new Map();
const _stats = { tiles: 0, cells: 0, ms: 0 };
const now = () => (typeof performance !== 'undefined' ? performance : Date).now();

/** One tile: per cell the ground h, the slope (deg) and the downhill unit vector (engine x, z). */
function bakeTile(ti, tj) {
  ensureMacro();
  const t0 = now();
  const W = NT + 2 * D, x0 = ti * LIFT.TILE, z0 = tj * LIFT.TILE;
  const g = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) g[j * W + i] = heightAt(x0 + (i - D) * C, z0 + (j - D) * C);
  const h = new Float32Array(NT * NT), slope = new Float32Array(NT * NT), ax = new Float32Array(NT * NT), az = new Float32Array(NT * NT);
  for (let j = 0; j < NT; j++) for (let i = 0; i < NT; i++) {
    const o = (j + D) * W + (i + D), k = j * NT + i;
    const gx = (g[o + D] - g[o - D]) / (2 * D * C), gz = (g[o + D * W] - g[o - D * W]) / (2 * D * C);
    const m = Math.hypot(gx, gz);
    h[k] = g[o];
    slope[k] = Math.atan(m) * R2D;
    // downhill: against the gradient
    ax[k] = m > 1e-6 ? -gx / m : 0; az[k] = m > 1e-6 ? -gz / m : 0;
  }
  const tile = { h, slope, ax, az };
  _tiles.set(`${ti},${tj}`, tile);
  _stats.tiles++; _stats.cells += NT * NT; _stats.ms += now() - t0;
  return tile;
}

/**
 * The face under an engine point (nearest cell of the bake).
 * @returns {{ h: number, slopeDeg: number, aspect: { x: number, z: number }, sea: boolean }}
 */
export function faceAt(x, z, out = { h: 0, slopeDeg: 0, aspect: { x: 0, z: 0 }, sea: false }) {
  // the nearest node on the global CELL grid, then its tile
  const gi = Math.round(x / C), gj = Math.round(z / C), ti = Math.floor(gi / NT), tj = Math.floor(gj / NT);
  const t = _tiles.get(`${ti},${tj}`) || bakeTile(ti, tj);
  const k = (gj - tj * NT) * NT + (gi - ti * NT);
  out.h = t.h[k]; out.slopeDeg = t.slope[k]; out.aspect.x = t.ax[k]; out.aspect.z = t.az[k]; out.sea = t.h[k] <= LIFT.SEA;
  return out;
}

const COS_WW = Math.cos(LIFT.WINDWARD_DEG / R2D);

/** The lift a face gives in a wind, height aside: 0, or LIFT.min..LIFT.max (m/s). */
export function strengthOf(face, wind = TRADE) {
  if (face.sea || face.slopeDeg < LIFT.MIN_DEG) return 0;
  const sp = Math.hypot(wind.x, wind.z);
  if (sp < LIFT.MIN_WIND) return 0;
  // the face looks along its aspect; the wind comes FROM -wind: windward when the two agree
  const a = (face.aspect.x * -wind.x + face.aspect.z * -wind.z) / sp;
  if (a < COS_WW) return 0;
  const steep = Math.min(1, (face.slopeDeg - LIFT.MIN_DEG) / (LIFT.FULL_DEG - LIFT.MIN_DEG));
  const square = (a - COS_WW) / (1 - COS_WW);
  return LIFT.min + (LIFT.max - LIFT.min) * steep * square;
}

const _f = { h: 0, slopeDeg: 0, aspect: { x: 0, z: 0 }, sea: false };

/**
 * m/s of rise at an engine point: the face below must be windward and 25 deg or steeper, and no more than LIFT.below m
 * under her; nothing at or above launchY + LIFT.ceiling.
 * @param {number} x @param {number} y @param {number} z
 * @param {{ wind?: { x: number, z: number }, launchY?: number }} [opts]
 */
export function liftAt(x, y, z, opts = null) {
  const wind = opts?.wind || TRADE;
  if (opts && Number.isFinite(opts.launchY) && y >= opts.launchY + LIFT.ceiling) return 0;
  faceAt(x, z, _f);
  const over = y - _f.h;
  if (over < 0 || over > LIFT.below) return 0;
  return strengthOf(_f, wind);
}

/** Bake every tile over an engine box now (e.g. on `approach`), so no flight bakes in a frame. Returns tiles baked. */
export function bakeLift(x0, z0, x1, z1) {
  let n = 0;
  for (let tj = Math.floor(Math.min(z0, z1) / LIFT.TILE); tj <= Math.floor(Math.max(z0, z1) / LIFT.TILE); tj++) {
    for (let ti = Math.floor(Math.min(x0, x1) / LIFT.TILE); ti <= Math.floor(Math.max(x0, x1) / LIFT.TILE); ti++) {
      if (!_tiles.has(`${ti},${tj}`)) { bakeTile(ti, tj); n++; }
    }
  }
  return n;
}

/** The bake's census. */
export function liftStats() { return { ..._stats, ms: Math.round(_stats.ms * 10) / 10 }; }
