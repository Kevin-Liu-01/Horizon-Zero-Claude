/**
 * SIGHT OCCLUDERS (Milestone 2 seam; owner: instruments. M2 briefs §3.2 "Sight occluders").
 *
 * One list of moving and fixed shapes that block an Instrument's sightline, and the one ray test every
 * kind uses. Callers only call: instruments (a Tiller hull and its skirt, moving every frame), combat
 * (the planted Windwall), settlements (the nine walls of Ninewalls, from `ninewalls-layout.js`), world
 * (terraces). Reed on a gust stays in `src/game/reeds` (it hides; it does not block a ray).
 *
 * Shapes are world space, metres, y up. Yaw is the heading about +y, the game's convention
 * (atan2(dx, dz): yaw 0 faces +z).
 *
 *   { type: 'box', cx, cy, cz, hx, hy, hz, yaw }   an oriented box about y (a hull, a skirt, a wall segment)
 *   { type: 'cyl', cx, cz, r, y0, y1 }             an upright cylinder (a basalt column, a post, a stilt)
 *   { type: 'arc', cx, cz, r, thick, a0, a1, y0, y1 }
 *                                                  an upright wall on a circle of radius r (its centre line),
 *                                                  `thick` m through, spanning bearings a0..a1 (radians,
 *                                                  atan2(dx, dz) about the centre, a0 < a1, may pass 2 pi),
 *                                                  from y0 to y1
 *
 * API (allocation-free per query; a slot is a string the caller owns, e.g. 'tiller:12:hull'):
 *   setOccluder(slot, shape)      add or replace; `shape` null removes the slot. Returns the slot.
 *   clearOccluder(slot)           remove it
 *   clearOccluders(prefix?)       remove every slot (or every slot starting with `prefix`)
 *   occluderSlots()               the slots, in insertion order (a copy; cold path)
 *   sightBlocked(ax, ay, az, bx, by, bz, ignore?)
 *                                 the first slot whose shape the segment a -> b crosses, or null. `ignore` is a
 *                                 slot prefix the test skips (a kind's own hull: 'tiller:12:')
 *   segmentHit(shape, ax, ay, az, bx, by, bz)
 *                                 pure: the segment parameter t in [0, 1] of the first crossing, or -1
 *
 * This module imports nothing, so node can load it for its tests (tools/instruments/sight.test.mjs).
 */

/** @typedef {{ type: 'box', cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw?: number }} BoxShape */
/** @typedef {{ type: 'cyl', cx: number, cz: number, r: number, y0: number, y1: number }} CylShape */
/** @typedef {{ type: 'arc', cx: number, cz: number, r: number, thick: number, a0: number, a1: number, y0: number, y1: number }} ArcShape */
/** @typedef {BoxShape | CylShape | ArcShape} OccluderShape */

/** @type {Map<string, OccluderShape>} */
const SLOTS = new Map();

/**
 * @param {string} slot
 * @param {OccluderShape | null} shape
 * @returns {string}
 */
export function setOccluder(slot, shape) {
  if (shape == null) SLOTS.delete(slot);
  else SLOTS.set(slot, shape);
  return slot;
}

/** @param {string} slot */
export function clearOccluder(slot) { SLOTS.delete(slot); }

/** @param {string} [prefix] */
export function clearOccluders(prefix) {
  if (!prefix) { SLOTS.clear(); return; }
  for (const k of [...SLOTS.keys()]) if (k.startsWith(prefix)) SLOTS.delete(k);
}

/** @returns {string[]} */
export function occluderSlots() { return [...SLOTS.keys()]; }

/**
 * @param {OccluderShape} shape
 * @returns {number} t in [0, 1] of the first crossing, or -1
 */
// eslint-disable-next-line no-unused-vars
export function segmentHit(shape, ax, ay, az, bx, by, bz) {
  return -1;   // seam commit: typed and empty; the tests land with the implementation
}

/**
 * @param {string} [ignore] a slot prefix to skip
 * @returns {string | null}
 */
export function sightBlocked(ax, ay, az, bx, by, bz, ignore) {
  for (const [slot, s] of SLOTS) {
    if (ignore && slot.startsWith(ignore)) continue;
    if (segmentHit(s, ax, ay, az, bx, by, bz) >= 0) return slot;
  }
  return null;
}
