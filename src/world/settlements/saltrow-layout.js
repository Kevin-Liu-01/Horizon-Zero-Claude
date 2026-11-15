import { ISLAND_SCALE as S } from '../island/extent.js';
import { REST } from '../island/sites.js';

/**
 * SALTROW'S LAYOUT (BUILD M1.5a; BIBLE §8.4 "Saltrow", §8.6). Plain frozen data and pure maths, no three: the kit
 * recipe (tools/build/settlements/recipes/saltrow-kit.mjs) reads each building's size and dress from here, the
 * runtime (./saltrow.js) reads where each one stands, and world-props reads the keepouts.
 *
 * The town climbs a main street from Brea's cistern at the pan edge up to the guild house's little square, on the
 * line of the old salt track (island/recipe.js TRACKS[0]): street origin O at bible (E -287, N -250), bearing 36.
 * Each building is placed in the street's frame: `s` metres up the street from O, on `side` +1 (right, looking up
 * the street) or -1 (left), its front face `set` metres off the street's axis, facing the street. The guild house
 * stands across the head of the street (side 0) facing down it, its datum stud in the step about 40 m from the
 * cistern (bible §8.4: "about 40 m"). A second row stands behind each side of the street on a back lane, so the
 * roofs step up the slope.
 *
 * Building record (local frame: x across the front, +z out of the front face, y up from the ground floor):
 *   w, d     footprint (m) · h   parapet top of the main block · tone 0..2 (the three lime washes)
 *   step     the raised block on the roof { w, d, h (above the main parapet), x, z (centre offset) } or null
 *   balcony  the orchil-violet balcony on the first floor (two-storey houses only)
 *   flora    bougainvillea up the front's right corner and over the door
 *   kind     'house' | 'guild' | 'brea'
 * No two neighbours along a row share a parapet height (F22's written target): `rooflineCheck()` says so.
 */

const D2R = Math.PI / 180;
const E = (e, n) => ({ x: e * S, z: -n * S });

export const STREET = Object.freeze({ ...E(-287, -250), bearing: 36, width: 5.2, length: 74 });
const fw = { x: Math.sin(STREET.bearing * D2R), z: -Math.cos(STREET.bearing * D2R) };      // up the street
const rt = { x: Math.cos(STREET.bearing * D2R), z: Math.sin(STREET.bearing * D2R) };       // its right hand

/** A world point (engine x, z) in the street's frame. */
export function streetPoint(s, r) {
  return { x: STREET.x + fw.x * s + rt.x * r, z: STREET.z + fw.z * s + rt.z * r };
}

/** The lime washes: warm white, bone, pale ochre (sRGB). */
export const TONES = Object.freeze([0xefeadf, 0xe9dcc2, 0xe6cfae]);

const H1 = 3.5, H2 = 6.3;                                      // one and two storeys to the parapet top
const B = (id, s, side, set, w, d, h, tone, more = {}) => Object.freeze({
  id, kind: 'house', s, side, set, w, d, h, tone, step: null, balcony: false, flora: false, ...more,
});
const st = (w, d, h, x = 0, z = 0) => Object.freeze({ w, d, h, x, z });

/**
 * A terraced row: houses side by side up the street from `s0`, each `gap` m after the last (0 = sharing a party wall,
 * the Pan Houses way), so no sliver of light shows between neighbours. Records are [id, set, w, d, h, tone, more].
 */
function row(side, s0, list, gap = 0) {
  let s = s0;
  return list.map(([id, set, w, d, h, tone, more = {}]) => {
    const r = B(id, s + w / 2, side, set, w, d, h, tone, more);
    s += w + gap;
    return r;
  });
}

export const BUILDINGS = Object.freeze([
  // Brea's house: one storey at the pan edge, its door toward her cistern
  B('brea', 3.0, -1, 4.6, 6.2, 6.0, H1 - 0.2, 0, { kind: 'brea', step: st(2.6, 2.6, 1.9, 1.5, -1.4) }),
  // the main street, left (NW) and right (SE) rows, terraced; heights alternate along each row
  ...row(-1, 8.5, [
    ['l1', 3.4, 8.0, 7.2, H1 + 0.3, 0, { step: st(3.4, 3.4, 2.3, -1.9, -1.5), flora: true }],
    ['l2', 3.2, 8.4, 8.0, H2 + 0.2, 1, { balcony: true }],
    ['l3', 3.6, 8.0, 7.0, H1 + 1.0, 2, { step: st(3.0, 3.6, 2.2, 2.2, -1.2) }],
    ['l4', 3.2, 7.4, 8.0, H2 + 0.7, 0, { balcony: true }],
  ]),
  ...row(1, 11.6, [
    ['r1', 3.4, 7.6, 7.0, H2 - 0.6, 2, { balcony: true }],
    ['r2', 3.6, 8.0, 7.4, H1, 0, { step: st(3.2, 3.0, 2.0, 1.8, -1.6), flora: true }],
    ['r3', 3.2, 8.0, 8.0, H2 + 0.4, 1, { balcony: true }],
    ['r4', 3.4, 7.6, 7.0, H1 + 0.8, 2, { step: st(3.0, 3.2, 2.1, -1.8, -1.4) }],
  ]),
  // the square: the guild house across the head of the street, a house each side of it, set back
  B('guild', 46.0, 0, 0, 11.4, 9.2, H2 + 0.5, 0, { kind: 'guild', step: st(4.2, 3.6, 2.2, -3.2, -2.4) }),
  B('l5', 44.0, -1, 6.2, 7.0, 7.2, H1 + 0.4, 1, { flora: true, step: st(2.8, 2.8, 1.9, 1.6, -1.4) }),
  B('r5', 46.6, 1, 6.2, 7.2, 7.4, H2 - 0.2, 0, { balcony: true }),
  // the back rows, behind each side of the street across a 2 m back lane, uphill of the front rows
  ...row(-1, 11.0, [
    ['lb1', 13.4, 7.2, 7.0, H2 - 0.4, 2, { balcony: true }],
    ['lb2', 13.6, 8.0, 7.2, H1 + 0.6, 0, { step: st(3.2, 3.0, 2.0, 1.6, -1.4) }],
    ['lb3', 13.2, 7.4, 7.4, H2 + 0.6, 1],
  ], 1.6),
  ...row(1, 16.0, [
    ['rb1', 12.8, 7.2, 7.0, H1 + 0.9, 1, { step: st(3.0, 2.8, 2.0, 1.6, -1.6) }],
    ['rb2', 13.0, 8.0, 7.4, H2 + 0.3, 2],
    ['rb3', 12.8, 7.2, 7.0, H1 - 0.1, 0, { step: st(2.8, 3.0, 2.2, -1.5, -1.4) }],
  ], 1.6),
  // either side of the guild house, behind the square's houses
  B('u1', 52.0, -1, 8.4, 7.6, 7.0, H2 - 0.3, 2, { balcony: true }),
  B('u2', 54.2, 1, 8.4, 7.4, 7.0, H1 + 0.5, 1, { step: st(3.2, 3.0, 2.1, 1.8, -1.5) }),
  B('lb4', 41.0, -1, 15.6, 7.6, 7.0, H1 + 0.1, 2, { step: st(3.0, 3.0, 2.2, -1.6, -1.6) }),
  B('u4', 46.4, 1, 15.2, 7.6, 7.2, H2 + 0.8, 2),
  // the pan edge: a house below Brea's, and the foot of the right back row
  B('w1', -5.6, -1, 4.2, 6.8, 6.4, H2 - 0.8, 1, { balcony: true }),
  B('rb0', 12.2, 1, 12.8, 7.2, 6.8, H2 - 0.1, 0),
]);

/** A building's world placement: centre (engine x, z), yaw (local +z, its front, turned to the world), footprint. */
export function placeOf(b) {
  if (b.side === 0) {
    const c = streetPoint(b.s + b.d / 2, 0);
    return { x: c.x, z: c.z, yaw: Math.atan2(-fw.x, -fw.z), w: b.w, d: b.d };
  }
  const c = streetPoint(b.s, b.side * (b.set + b.d / 2));
  const f = { x: -rt.x * b.side, z: -rt.z * b.side };          // the front looks back at the street
  return { x: c.x, z: c.z, yaw: Math.atan2(f.x, f.z), w: b.w, d: b.d };
}

/** The guild house's step and its brass datum stud (bible §8.4; BUILD M1.6b: the home travel node). */
export const GUILD_STUD = Object.freeze((() => {
  const g = BUILDINGS.find((b) => b.kind === 'guild');
  const p = streetPoint(g.s - 0.55, 0);
  return { x: +p.x.toFixed(3), z: +p.z.toFixed(3) };
})());

/** Salt cones at the foot of the street, the harvest piled where the pans meet the town. */
export const CONES = Object.freeze([
  Object.freeze({ ...streetPoint(6.2, 5.0), r: 1.55, h: 1.9 }),
  Object.freeze({ ...streetPoint(9.6, 5.9), r: 1.75, h: 2.15 }),
  Object.freeze({ ...streetPoint(7.0, 8.8), r: 1.3, h: 1.6 }),
]);

/**
 * The boat ramp on black sand and the breakwater with its lamp (bible §8.4, §8.6; Lantern-Keeper Mise's post): on
 * the shore 105 m from the street's foot on bearing 235 (island/recipe.js coastD < 0 there), 27 m clear of the
 * near intake pump. `ramp` is the slipway's top centre and the bearing it runs down into the sea; the breakwater
 * leaves the shore beside it on `bearing` for `length` m, its lamp at the end.
 */
export const HARBOUR = Object.freeze({
  ramp: Object.freeze({ ...E(-369.5, -305.6), bearing: 232, length: 16, width: 4.2 }),
  breakwater: Object.freeze({ ...E(-376.0, -300.4), bearing: 214, length: 22, width: 3.4 }),
});

/** The breakwater lamp's world (x, z): its end. */
export const BREAKWATER_LAMP = Object.freeze((() => {
  const b = HARBOUR.breakwater, a = b.bearing * D2R;
  return { x: +(b.x + Math.sin(a) * (b.length - 1.2)).toFixed(3), z: +(b.z - Math.cos(a) * (b.length - 1.2)).toFixed(3) };
})());

/** Rows in street order (for the roofline rule): neighbours along each row and across the square. */
export const ROWS = Object.freeze([
  ['w1', 'brea', 'l1', 'l2', 'l3', 'l4', 'l5', 'u1'],
  ['r1', 'r2', 'r3', 'r4', 'r5', 'u2'],
  ['lb1', 'lb2', 'lb3', 'lb4'],
  ['rb0', 'rb1', 'rb2', 'rb3', 'u4'],
  ['l5', 'guild', 'r5'],
  ['u1', 'guild', 'u2'],
]);

/** F22's written rule: no two adjacent buildings with the same roofline height (within `tol` m). [] when it holds. */
export function rooflineCheck(tol = 0.25) {
  const by = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
  const bad = [];
  for (const row of ROWS) {
    for (let i = 0; i + 1 < row.length; i++) {
      const a = by[row[i]], b = by[row[i + 1]];
      if (Math.abs(a.h - b.h) < tol) bad.push(`${a.id}/${b.id}`);
    }
  }
  return bad;
}

/**
 * Ground the scatter keeps clear (world-props' keepout shape { id, x, z, hard, soft, grass, meadow }): each
 * building's footprint circle and the street every 6 m, so no reed or meadow grass stands in a house or the street.
 */
export const SALTROW_KEEPOUTS = Object.freeze([
  ...BUILDINGS.map((b) => {
    const p = placeOf(b), r = Math.hypot(b.w, b.d) / 2;
    return Object.freeze({ id: `saltrow-${b.id}`, x: +p.x.toFixed(2), z: +p.z.toFixed(2), hard: r + 0.8, soft: r + 2.4, grass: r + 0.6, meadow: r + 0.4 });
  }),
  ...Array.from({ length: 12 }, (_, i) => {
    const p = streetPoint(4 + i * 6, 0);
    return Object.freeze({ id: `saltrow-street-${i}`, x: +p.x.toFixed(2), z: +p.z.toFixed(2), hard: 3.4, soft: 5, grass: 3.2, meadow: 2.8 });
  }),
]);

/** REST must stay in the open: the nearest building wall is at least this far from her (m). */
export function restClearance() {
  let best = Infinity;
  for (const b of BUILDINGS) {
    const p = placeOf(b);
    const dx = REST.x - p.x, dz = REST.z - p.z;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const ex = Math.max(0, Math.abs(lx) - b.w / 2), ez = Math.max(0, Math.abs(lz) - b.d / 2);
    best = Math.min(best, Math.hypot(ex, ez));
  }
  return best;
}
