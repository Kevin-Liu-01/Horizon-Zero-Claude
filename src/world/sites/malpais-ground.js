/**
 * THE MALPAIS' GROUND AT BLOCKOUT (Milestone 3 wave 1, area A): what the Kiln Yards and the tube shelter do to the
 * island's height, as pure functions of the authored frame (e, n), so the recipe, its terrain workers and node
 * (tools/world/malpais-rows.mjs) run the same code. No THREE, no DOM.
 *
 *   malpaisHeight(e, n, h)   the natural height `h` with the Yards' apron levelled (./kilnyards-layout.js APRON: a
 *                            bench at 143 m, its batter handing back to the shelf over APRON.batter m) and the tube
 *                            shelter's trench cut under its crust (./malpais-layout.js TUBE_SHELTER). Outside FOOTPRINT
 *                            it returns `h` itself, so the island outside the box is the island before, bit for bit
 *                            (malpais-rows.mjs --base proves it against the commit before).
 *
 * Applied in recipe.js heightAt only (before the Holds' blockout, whose Scar profile reads the ground without it), so no
 * pass of the macro sees it and the sites keep their anchors.
 */
import { APRON, apronUV } from './kilnyards-layout.js';
import { TUBE_SHELTER as T, FOOTPRINT, tubeFloor } from './malpais-layout.js';

const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const _uv = { u: 0, v: 0 };

export function malpaisHeight(e, n, h) {
  if (e < FOOTPRINT.e0 || e > FOOTPRINT.e1 || n < FOOTPRINT.n0 || n > FOOTPRINT.n1) return h;
  apronUV(e, n, _uv);
  const { u, v } = _uv;
  let out = h;
  // the apron: level inside its rectangle, the batter (cut on the shelf's side, fill below) handing back over APRON.batter
  const du = Math.max(0, Math.abs(u) - APRON.halfLen), dv = Math.max(0, Math.abs(v) - APRON.halfWid), d = Math.hypot(du, dv);
  if (d < APRON.batter) out = h + (APRON.h - h) * (1 - ss(0, APRON.batter, d));
  // the tube shelter's trench: cut only (never a fill), its floor rising gently to the back, its walls steep
  const tu = Math.max(0, Math.abs(u - T.u) - T.half), tv = v < T.v0 ? 0 : Math.max(0, v - T.v1);
  if (v >= T.v0 - 0.5 && tu < T.wallBlend && tv < T.wallBlend) {
    const k = 1 - ss(0, T.wallBlend, Math.hypot(tu, tv));
    const f = tubeFloor(v);
    if (f < out) out = out + (f - out) * k;
  }
  return out;
}
