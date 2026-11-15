import { REST } from '../island/sites.js';

/**
 * WHERE THE HOME BRAZIER STANDS (BUILD M1.6c). Plain data, no three: world-props reads the keepouts before the
 * flora is scattered (src/world/props.js), the Braziers read the spot (src/game/brazier/braziers.js).
 *
 * Brea's cistern Brazier stands 6.6 m in front of where she wakes (REST), not on the old Round-4 pit 0.9 m from
 * her: F20 (Ansel beside Brea at 3 m, bearing 200) films her FACE from about 4 m along her forward f, so whatever
 * stands behind her is in its frame. The pit's spot put the bowl in its bottom-left corner (systems-1b judge,
 * e42e6ba); f -3 put the cistern ring behind her in view (7ae0fd0 film). At f +6.5, r -1.0 the bowl is 2.5 m behind
 * F20's lens (f90d2b0 film: nothing of it in F20). yaw 293 deg turns the cistern ring (local -1.6, +1.7) 2.3 m to
 * the bowl's left (-r): yaw 23 put it 2.3 m along f, which is where the seat block stands (bearing 200, 1.6 m), and
 * she sat inside the ring in F30 (f90d2b0). Ring to seat is now 2.8 m centre to centre (ring radius 0.95).
 */
const B = 200 * Math.PI / 180;                       // F20's bearing: forward (sin B, -cos B), right (-cos B, -sin B)
const F = { x: Math.sin(B), z: -Math.cos(B) };
const R = { x: -Math.cos(B), z: -Math.sin(B) };
const along = (f, r) => ({ x: REST.x + F.x * f + R.x * r, z: REST.z + F.z * f + R.z * r });

const home = along(6.5, -1.0);
export const HOME_BRAZIER = Object.freeze({ x: +home.x.toFixed(3), z: +home.z.toFixed(3), yaw: 293 * Math.PI / 180 });

/** Every Brazier's yaw: the cistern ring to the left of the seat line (bearing 200), never on the seat. */
export const BRAZIER_YAW = 293 * Math.PI / 180;

/** The cistern ring's centre in world space (buildBrazier's local -1.6, +1.7 turned by yaw). */
const cy = Math.cos(HOME_BRAZIER.yaw), sy = Math.sin(HOME_BRAZIER.yaw);
const CL = { x: -1.6, z: 1.7 };
export const HOME_CISTERN = Object.freeze({
  x: +(HOME_BRAZIER.x + CL.x * cy + CL.z * sy).toFixed(3),
  z: +(HOME_BRAZIER.z - CL.x * sy + CL.z * cy).toFixed(3),
});

/**
 * Trodden ground round a hearth: no meadow or scatter blade stands in the bowl, the cistern or the seat
 * (F30 round 1: grass blades cut through the bowl). Shape as world-props' keepouts { id, x, z, hard, soft, grass, meadow }.
 */
export const BRAZIER_KEEPOUTS = Object.freeze([
  Object.freeze({ id: 'brazier-home', x: HOME_BRAZIER.x, z: HOME_BRAZIER.z, hard: 2.4, soft: 3.4, grass: 2.4, meadow: 2.2 }),
  Object.freeze({ id: 'brazier-cistern', x: HOME_CISTERN.x, z: HOME_CISTERN.z, hard: 1.5, soft: 2.2, grass: 1.5, meadow: 1.4 }),
]);
