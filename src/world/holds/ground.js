/**
 * THE HOLDS' GROUND, PER VERTEX (area A, M2 wave 2: the look; bible §3.3 "black lapilli, sand drifts; vines in
 * instanced ash pit-cups behind crescent walls"). What the ground shader cannot know at a pixel without a texture
 * fetch, baked once per render-grid node (1.94 m) into the spare fourth channel of the terrain's normal attribute
 * (bake.js bakeShade, Int16 normalised; the vertex shader unpacks it, groundShader.js GROUND_VERT_WORLD):
 *
 *   hold   0..1  the Holds' biome weight (recipe.biomesAt): lapilli in place of the Pans' black sand
 *   cult   0..1  worked ground: where the pit-cups (each a vine in a hollow behind its crescent wall) may be dug.
 *                Not on the Scar and its spoil, not inside Ninewalls' walls, not in the barranco, not on the Plumb's
 *                bench, B1's pad, the Jameo's lip or a trig pillar's deck; the slope gate is per pixel (the shader)
 *   scar  -1..1  the Screed Scar: + its planed floor (blockout.js scarWeight), - its spoil (bermFoot)
 *
 * Pure (no THREE, no DOM): the bake runs it on the worker pool and in node, byte for byte.
 */
import { SCAR_LINE, PLUMB_TERRACE, BARRANCO, JAMEO, B1, scarFrame, scarWeight, bermFoot } from './blockout.js';
import { TRIG } from '../island/sites.js';
import { CENTRE as NW, OUTER_R as NW_R } from '../settlements/ninewalls-layout.js';
import { ISLAND_SCALE as S } from '../island/extent.js';

const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Keep-outs for the pit-cups (authored metres): a disc's radius and the ease past it. */
const SCAR_KEEP = SCAR_LINE.half + SCAR_LINE.BERM_IN + SCAR_LINE.BERM_OUT + SCAR_LINE.APRON + 2;
const DISCS = Object.freeze([
  { e: NW.x / S, n: -NW.z / S, r: NW_R + 3, ease: 6 },               // Ninewalls inside its outer wall (area B's ground)
  { e: PLUMB_TERRACE.e, n: PLUMB_TERRACE.n, r: PLUMB_TERRACE.r1 + 4, ease: 4 },
  { e: B1.e, n: B1.n, r: 9, ease: 4 },
  { e: JAMEO.e, n: JAMEO.n, r: JAMEO.r + 9, ease: 4 },
  ...TRIG.map((t) => ({ e: t.e, n: t.n, r: 9, ease: 4 })),
]);
const BAR = BARRANCO.path, BAR_R = BARRANCO.half + BARRANCO.bank + 3;

function barrancoD(e, n) {
  let best = Infinity;
  for (let i = 0; i + 1 < BAR.length; i++) {
    const a = BAR[i], b = BAR[i + 1], de = b.e - a.e, dn = b.n - a.n;
    const t = Math.min(1, Math.max(0, ((e - a.e) * de + (n - a.n) * dn) / (de * de + dn * dn)));
    best = Math.min(best, Math.hypot(e - a.e - de * t, n - a.n - dn * t));
  }
  return best;
}

const _f = { u: 0, v: 0 };
/** Worked ground at an authored point, given the Holds' weight there (0..1). */
export function holdsCult(e, n, hold) {
  if (hold < 0.3) return 0;
  let k = ss(0.45, 0.85, hold);
  scarFrame(e, n, _f);
  if (_f.u > -SCAR_LINE.END - 8 && _f.u < SCAR_LINE.len + SCAR_LINE.END + 8) k *= ss(SCAR_KEEP, SCAR_KEEP + 4, Math.abs(_f.v));
  if (k <= 0) return 0;
  for (const d of DISCS) {
    const dd = Math.hypot(e - d.e, n - d.n);
    if (dd < d.r + d.ease) k *= ss(d.r, d.r + d.ease, dd);
    if (k <= 0) return 0;
  }
  const bd = barrancoD(e, n);
  if (bd < BAR_R + 3) k *= ss(BAR_R, BAR_R + 3, bd);
  return k;
}

/** The Scar's signed weight at an authored point: + floor, - spoil. */
export function holdsScar(e, n) { return scarWeight(e, n) - bermFoot(e, n); }

/**
 * Pack (hold, cult, scar) into one Int16 (5 bits each: hold, cult 0..31; scar 0..30 about 15). The shader unpacks it
 * from the normalised attribute (w * 32767, rounded) in the vertex stage, so the three interpolate apart.
 */
export function packGround(hold, cult, scar) {
  const q = (v) => Math.max(0, Math.min(31, Math.round(v * 31)));
  const s = Math.max(0, Math.min(30, Math.round(15 + 15 * scar)));
  return q(hold) * 1024 + q(cult) * 32 + s;
}
