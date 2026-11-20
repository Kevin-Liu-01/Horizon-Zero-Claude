/**
 * THE MALPAIS' GROUND ZONES (Milestone 3 wave 1, area A; BIBLE §3.3: "cold aa and pahoehoe lava rock, cinder bands,
 * lichen crust"; MP9: "aa is slow ground (speed x0.8*), pahoehoe is not"). The zones are the ground tone's own law
 * (src/world/island/bake.js malpaisSheet, malpaisCinder: what the bake paints is what the zones say), read as data:
 *
 *   malpaisZoneAt(x, z, h?)  -> { zone: 'aa' | 'pahoehoe' | 'cinder' | 'none', pahoehoe: 0..1, cinder: 0..1, malpais: 0..1 }
 *   groundSpeedAt(x, z)      -> the walking-speed factor the ground asks for (aa ZONE_SPEED.aa, else 1; blended by the
 *                               Malpais' biome weight so its edge has no step). The player's locomotion reads it (hero-anim
 *                               owns the call); 1 everywhere off the Malpais.
 *
 * Engine frame (x, z). `h` defaults to the recipe's height. Pure: no THREE, no DOM.
 */
import { malpaisSheet, malpaisCinder } from '../island/bake.js';
import { heightAt, biomesAt } from '../island/recipe.js';

/** The speed factor per zone (* MP9). */
export const ZONE_SPEED = Object.freeze({ aa: 0.8, pahoehoe: 1.0, cinder: 1.0 });
/** A point is pahoehoe above this sheet share, cinder above this band weight on the aa (the tone's own thresholds). */
export const ZONE_CUT = Object.freeze({ pahoehoe: 0.5, cinder: 0.5, malpais: 0.5 });

const _w = new Float64Array(6);

export function malpaisZoneAt(x, z, h = null, out = { zone: 'none', pahoehoe: 0, cinder: 0, malpais: 0 }) {
  biomesAt(x, z, _w);
  out.malpais = _w[2];
  const hh = h ?? heightAt(x, z);
  out.pahoehoe = malpaisSheet(x, z);
  out.cinder = malpaisCinder(x, z, hh) * (1 - out.pahoehoe);
  out.zone = out.malpais < ZONE_CUT.malpais ? 'none' : out.pahoehoe >= ZONE_CUT.pahoehoe ? 'pahoehoe' : out.cinder >= ZONE_CUT.cinder ? 'cinder' : 'aa';
  return out;
}

const _z = { zone: 'none', pahoehoe: 0, cinder: 0, malpais: 0 };
export function groundSpeedAt(x, z) {
  malpaisZoneAt(x, z, null, _z);
  if (_z.malpais <= 0) return 1;
  // the aa's share of the ground (not pahoehoe, not a cinder band) slows her; blended by the biome weight
  const aa = (1 - _z.pahoehoe) * (1 - Math.min(1, _z.cinder / ZONE_CUT.cinder));
  return 1 + (ZONE_SPEED.aa - 1) * aa * _z.malpais;
}
