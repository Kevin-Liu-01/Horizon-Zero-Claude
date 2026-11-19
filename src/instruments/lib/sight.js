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

/** Slots and shapes in parallel arrays, so the per-query loop allocates nothing (a Map's iterator would). */
/** @type {string[]} */
const KEYS = [];
/** @type {OccluderShape[]} */
const SHAPES = [];

/**
 * @param {string} slot
 * @param {OccluderShape | null} shape
 * @returns {string}
 */
export function setOccluder(slot, shape) {
  const i = KEYS.indexOf(slot);
  if (shape == null) { if (i >= 0) { KEYS.splice(i, 1); SHAPES.splice(i, 1); } return slot; }
  if (i >= 0) SHAPES[i] = shape;
  else { KEYS.push(slot); SHAPES.push(shape); }
  return slot;
}

/** @param {string} slot */
export function clearOccluder(slot) { setOccluder(slot, null); }

/** @param {string} [prefix] */
export function clearOccluders(prefix) {
  for (let i = KEYS.length - 1; i >= 0; i--) {
    if (!prefix || KEYS[i].startsWith(prefix)) { KEYS.splice(i, 1); SHAPES.splice(i, 1); }
  }
}

/** @returns {string[]} */
export function occluderSlots() { return KEYS.slice(); }

/** Narrow the module's [_s0, _s1] to where p + t d lies inside [lo, hi]; false when it empties. */
let _s0 = 0, _s1 = 1;
function slab(p, d, lo, hi) {
  if (Math.abs(d) < 1e-12) return p >= lo && p <= hi;
  let a = (lo - p) / d, b = (hi - p) / d;
  if (a > b) { const t = a; a = b; b = t; }
  if (a > _s0) _s0 = a;
  if (b < _s1) _s1 = b;
  return _s0 <= _s1;
}

/** The t-interval where the xz segment is inside a circle (centre cx, cz, radius r): sets _c0, _c1; false if none. */
let _c0 = 0, _c1 = 0;
function inCircle(px, pz, dx, dz, cx, cz, r) {
  const ox = px - cx, oz = pz - cz;
  const a = dx * dx + dz * dz, b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - r * r;
  if (a < 1e-12) { if (c > 0) return false; _c0 = -1e9; _c1 = 1e9; return true; }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const q = Math.sqrt(disc);
  _c0 = (-b - q) / (2 * a); _c1 = (-b + q) / (2 * a);
  return true;
}

const TAU = Math.PI * 2;
/** Is bearing `a` (atan2(dx, dz)) inside [a0, a1] (a1 may pass 2 pi)? */
function inSpan(a, a0, a1) {
  let x = a - a0;
  x -= Math.floor(x / TAU) * TAU;
  return x <= a1 - a0 + 1e-9;
}

/**
 * @param {OccluderShape} shape
 * @returns {number} t in [0, 1] of the first crossing, or -1
 */
export function segmentHit(shape, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  if (shape.type === 'box') {
    const c = Math.cos(shape.yaw || 0), s = Math.sin(shape.yaw || 0);
    const ox = ax - shape.cx, oz = az - shape.cz;
    const lx = ox * c - oz * s, lz = ox * s + oz * c, ldx = dx * c - dz * s, ldz = dx * s + dz * c;
    _s0 = 0; _s1 = 1;
    if (!slab(lx, ldx, -shape.hx, shape.hx)) return -1;
    if (!slab(ay - shape.cy, dy, -shape.hy, shape.hy)) return -1;
    if (!slab(lz, ldz, -shape.hz, shape.hz)) return -1;
    return _s0 <= _s1 ? _s0 : -1;
  }
  if (shape.type === 'cyl') {
    if (!inCircle(ax, az, dx, dz, shape.cx, shape.cz, shape.r)) return -1;
    _s0 = Math.max(0, _c0); _s1 = Math.min(1, _c1);
    if (_s0 > _s1) return -1;
    if (!slab(ay, dy, shape.y0, shape.y1)) return -1;
    return _s0;
  }
  if (shape.type === 'arc') {
    const ro = shape.r + shape.thick / 2, ri = Math.max(0, shape.r - shape.thick / 2);
    if (!inCircle(ax, az, dx, dz, shape.cx, shape.cz, ro)) return -1;
    const o0 = _c0, o1 = _c1;
    let i0 = 1, i1 = 0;   // empty unless the inner circle is crossed
    if (ri > 0 && inCircle(ax, az, dx, dz, shape.cx, shape.cz, ri)) { i0 = _c0; i1 = _c1; }
    // the annulus is [o0, o1] minus [i0, i1]: up to two intervals, tested in order of t
    const iv = i0 <= i1 ? [o0, Math.min(o1, i0), Math.max(o0, i1), o1] : [o0, o1, 1, 0];
    for (let k = 0; k < 4; k += 2) {
      _s0 = Math.max(0, iv[k]); _s1 = Math.min(1, iv[k + 1]);
      if (_s0 > _s1) continue;
      if (!slab(ay, dy, shape.y0, shape.y1)) continue;
      // the wall's bearing span: the interval is at most `thick` / sin(grazing) long; test its ends and middle
      for (let j = 0; j <= 4; j++) {
        const t = _s0 + (_s1 - _s0) * (j / 4);
        if (inSpan(Math.atan2(ax + dx * t - shape.cx, az + dz * t - shape.cz), shape.a0, shape.a1)) return t;
      }
    }
    return -1;
  }
  return -1;
}

/**
 * @param {string} [ignore] a slot prefix to skip
 * @returns {string | null}
 */
export function sightBlocked(ax, ay, az, bx, by, bz, ignore) {
  for (let i = 0; i < KEYS.length; i++) {
    if (ignore && KEYS[i].startsWith(ignore)) continue;
    if (segmentHit(SHAPES[i], ax, ay, az, bx, by, bz) >= 0) return KEYS[i];
  }
  return null;
}
