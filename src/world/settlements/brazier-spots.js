import { REST } from '../island/sites.js';

/**
 * WHERE THE HOME BRAZIER STANDS (BUILD M1.6c). Plain data, no three: world-props reads the keepouts before the
 * flora is scattered (src/world/props.js), the Braziers read the spot (src/game/brazier/braziers.js).
 *
 * Brea's cistern Brazier stands 3.9 m behind-left of where she wakes (REST), not on the old Round-4 pit 0.9 m in
 * front of her: F20 (Ansel beside Brea at 3 m, bearing 200) looks straight over the pit's spot, and the bowl sat in
 * its bottom-left corner (systems-1b judge, e42e6ba). Measured in F20's own frame (hero forward f, her right r):
 * the bowl is at f -3.0, r -2.5 from her, 76 degrees left of the lens axis against a half-width of 35. yaw = PI
 * turns the cistern ring (local -1.6, +1.7) to the far side, away from her spawn and out of that frame.
 */
const B = 200 * Math.PI / 180;                       // F20's bearing: forward (sin B, -cos B), right (-cos B, -sin B)
const F = { x: Math.sin(B), z: -Math.cos(B) };
const R = { x: -Math.cos(B), z: -Math.sin(B) };
const along = (f, r) => ({ x: REST.x + F.x * f + R.x * r, z: REST.z + F.z * f + R.z * r });

const home = along(-3.0, -2.5);
export const HOME_BRAZIER = Object.freeze({ x: +home.x.toFixed(3), z: +home.z.toFixed(3), yaw: Math.PI });

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
