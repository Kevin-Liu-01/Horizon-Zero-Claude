import { REST, TRIG } from '../island/sites.js';

/**
 * WHERE THE BRAZIERS STAND (BUILD M1.6c). Plain data, no three: world-props reads the keepouts before the flora is
 * scattered (src/world/props.js), the Braziers read the spots (src/game/brazier/braziers.js), the object reads where
 * its cistern stands (src/world/settlements/brazier.js), and node --test checks the frames' lenses against them
 * (tools/gates/systems/brazier.test.mjs).
 *
 * Brea's cistern Brazier stands 6.6 m in front of where she wakes (REST), not on the old Round-4 pit 0.9 m from
 * her: F20 (Ansel beside Brea at 3 m, bearing 200) films her FACE from about 4 m along her forward f, so whatever
 * stands behind her is in its frame. The pit's spot put the bowl in its bottom-left corner (systems-1b judge,
 * e42e6ba); f -3 put the cistern ring behind her in view (7ae0fd0 film). At f +6.5, r -1.0 the bowl is 2.5 m behind
 * F20's lens (f90d2b0 film: nothing of it in F20).
 *
 * The cistern stands on world bearing 120 from the bowl, 2.6 m centre to centre. At 39f7533 it stood on bearing 290
 * (the bowl's local -1.6, +1.7 turned by yaw 293): 1 m from F30's lens, its blocks filled the frame's lower right.
 * F30's lens stands 3.5 m from the seat and looks back over the bowl on bearing 150; from there the bowl is 14 deg
 * left of the axis and the cistern 22 deg left, 5.0 m out, just beyond the bowl (its ring spans 11-34 deg, inside
 * the frame's 37); it stays behind F20's lens and 2.8 m from the seat.
 */
const D2R = Math.PI / 180;
const B = 200 * D2R;                                 // F20's bearing: forward (sin B, -cos B), right (-cos B, -sin B)
const F = { x: Math.sin(B), z: -Math.cos(B) };
const R = { x: -Math.cos(B), z: -Math.sin(B) };
const along = (f, r) => ({ x: REST.x + F.x * f + R.x * r, z: REST.z + F.z * f + R.z * r });

/** Every Brazier's yaw (the bowl's lathe and the seat are round; kept for the record's shape). */
export const BRAZIER_YAW = 293 * D2R;

const home = along(6.5, -1.0);
export const HOME_BRAZIER = Object.freeze({ x: +home.x.toFixed(3), z: +home.z.toFixed(3), yaw: BRAZIER_YAW });

/** The seat block: 1.6 m off the bowl on world bearing 200, where F30 sits her, facing the fire. */
export const SEAT = Object.freeze({ bearing: 200, dist: 1.6, height: 0.42 });
/** The cistern: world bearing and distance of its centre from the bowl, and its outer radius. */
export const CISTERN = Object.freeze({ bearing: 120, dist: 2.6, r: 1.07 });

/** A world offset { x, z } (engine axes: x east, z south) on a compass bearing. */
export const offsetOn = (bearingDeg, d) => ({ x: Math.sin(bearingDeg * D2R) * d, z: -Math.cos(bearingDeg * D2R) * d });

const co = offsetOn(CISTERN.bearing, CISTERN.dist);
export const HOME_CISTERN = Object.freeze({ x: +(HOME_BRAZIER.x + co.x).toFixed(3), z: +(HOME_BRAZIER.z + co.z).toFixed(3) });

/**
 * ACCEPTED FRAMES A BRAZIER MAY NOT STAND IN (unless its reference has one). F05 (look.vista: T1 - 6 m x, - 4 m z,
 * bearing 283, a chase lens about 3.5 m behind her) is the only accepted frame that stands near a Brazier's spot:
 * 5baa3e7 put the T1 Brazier 1 m from her there and its cistern ring stood in F05's right foreground (the review at
 * 39f7533). The lens is `lens` m behind her along the frame's forward (the chase boom is 4.2 m at most). A spot is
 * clear of a frame when its whole footprint stands behind that lens, or outside the cone of `half` deg off the
 * lens's axis (F05: fov 46 at 16:9 is 37 deg each side; 45 with a margin), or past `range` m.
 */
const T1 = TRIG.find((t) => t.id === 'T1');
export const FRAME_KEEPOUTS = Object.freeze([
  Object.freeze({ frame: 'F05', x: T1.x - 6, z: T1.z - 4, bearing: 283, lens: 4.2, half: 45, range: 120 }),
]);

/** Is (x, z), with a footprint of `r` m, clear of every accepted frame's lens? */
export function clearOfFrames(x, z, r = 3.6) {
  for (const k of FRAME_KEEPOUTS) {
    const f = offsetOn(k.bearing, 1);
    const dx = x - (k.x - f.x * k.lens), dz = z - (k.z - f.z * k.lens), d = Math.hypot(dx, dz);
    if (d - r > k.range) continue;
    const ahead = dx * f.x + dz * f.z;
    if (ahead + r < 0) continue;
    const side = Math.abs(dx * f.z - dz * f.x);
    const off = Math.atan2(Math.max(0, side - r), ahead) / D2R;
    if (off > k.half) continue;
    return false;
  }
  return true;
}

/**
 * The T1 Brazier: at the pillar's foot, 7 m off it, on its landward (east) side, where F05's lens never turns. The
 * runtime takes the flattest of these that is clear of the accepted frames (src/game/brazier/braziers.js).
 */
export const T1_SPOTS = Object.freeze([[5, 5], [5, -5], [7, 0], [-5, 5]]
  .map(([dx, dz]) => Object.freeze({ x: T1.x + dx, z: T1.z + dz })));

/**
 * Trodden ground round a hearth: no meadow or scatter blade stands in the bowl, the cistern or the seat
 * (F30 round 1: grass blades cut through the bowl). Shape as world-props' keepouts { id, x, z, hard, soft, grass, meadow }.
 */
export const BRAZIER_KEEPOUTS = Object.freeze([
  Object.freeze({ id: 'brazier-home', x: HOME_BRAZIER.x, z: HOME_BRAZIER.z, hard: 2.4, soft: 3.4, grass: 2.4, meadow: 2.2 }),
  Object.freeze({ id: 'brazier-cistern', x: HOME_CISTERN.x, z: HOME_CISTERN.z, hard: 1.6, soft: 2.3, grass: 1.6, meadow: 1.5 }),
]);
