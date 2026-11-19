/**
 * CALIMA — the painters for any kit person's outfit sheet (people; lib/sheet.mjs, lib/paint-kit.mjs). Where Oro has a
 * painter per garment (lib/oro-sheet.mjs), the Holds' cast is painted by what each piece is dyed: wool and dyed cloth
 * (weave, slubs and felted mottle, a frayed edge, the gold-ochre graduated-tick line couched along the open edges of
 * the dyed pieces: sashes, ties, bands, hems), leather (grain, oil, scratches, a burnished cut edge and its stitch
 * line), iron and tarnished brass, wicker and wood; an MCO part by its source sheet (cloth, leather, metal), shaded by
 * its sewn folds. Then what the Holds' work does to it: ash risen from the ground and settled on what faces up, and
 * the stain field a piece carries (a picker's carmine, a farmer's soil), per texel.
 *
 * `pc.dyeHex` is the person's own dye (spec.dyes applied), `pc.shade` its shade.
 */
import { HOLDS, PAN } from './archetypes.mjs';
import { dyeRGB, hexRGB } from './sheet.mjs';
import { clamp, over, scale, wool, leather, iron, wood, dust, fray, burnish, stitch, ticks, srcLum, srcClass, brass, wicker } from './paint-kit.mjs';

const U = (h) => h.toUpperCase();
const KIND = new Map([
  ...[HOLDS.leather, HOLDS.leatherDark, PAN.leather, '#6C5A3F'].map((h) => [U(h), 'leather']),
  ...[HOLDS.iron].map((h) => [U(h), 'iron']),
  ...[HOLDS.brass, PAN.brass, '#B08A45', '#A07A3F'].map((h) => [U(h), 'brass']),
  ...[HOLDS.wicker].map((h) => [U(h), 'wicker']),
  ...[HOLDS.wood, PAN.wood].map((h) => [U(h), 'wood']),
]);
/** A dyed cloth (not the undyed wool and linen): it carries the tick line along its open edges. */
const DYED = new Set([HOLDS.rust, HOLDS.rustDeep, HOLDS.carmine, HOLDS.carmineStain, HOLDS.olive, HOLDS.violet, HOLDS.violetDeep, HOLDS.lapilli].map(U));
const GOLD = hexRGB('#B8914A'), GOLD_DEEP = hexRGB('#8A5D1E'), ASH = [138, 134, 126];

const kindOf = (pc) => (pc.dyeHex ? KIND.get(U(pc.dyeHex)) || 'cloth' : 'cloth');
const lum = (c) => 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];

function clothPiece(t, o, pc, col, seed) {
  wool(t, o, col, { seed, mottle: 0.13, streak: 0.08 });
  const e = t.edge();
  fray(t, o, e, { reach: 0.007 });
  if (pc.dyeHex && DYED.has(U(pc.dyeHex))) ticks(t, o, e, { d0: 0.009, per: 0.0075, long: 5, short: 0.004, longL: 0.007, w: 0.001, col: lum(col) < 90 ? GOLD : GOLD_DEEP, a: 0.85 });
  else stitch(t, o, e, { inset: 0.006, per: 0.0045, col: [col[0] * 1.25 + 14, col[1] * 1.25 + 12, col[2] * 1.2 + 10], a: 0.45 });
}

function kitDefault(t, o, pc) {
  const seed = pc.seed ?? 0;
  const col = pc.dyeHex ? dyeRGB(pc.dyeHex, pc.shade ?? 1) : [180, 176, 168];
  if (pc.mco) {
    const cls = srcClass(t);
    if (cls === 'metal') iron(t, o, [66, 62, 60], { seed });
    else if (cls === 'leather') {
      leather(t, o, kindOf(pc) === 'leather' ? col : dyeRGB(HOLDS.leatherDark, 1.15), { seed: seed + 5 });
      scale(o, srcLum(t, cls, 0.6));
      burnish(t, o, t.edge());
    } else {
      if (kindOf(pc) === 'leather') leather(t, o, col, { seed }); else wool(t, o, col, { seed, mottle: 0.13 });
      scale(o, srcLum(t, cls, 0.85));
      fray(t, o, t.edge(), { reach: 0.006 });
    }
  } else {
    const k = kindOf(pc);
    if (k === 'leather') { leather(t, o, col, { seed, oil: 0.4 }); const e = t.edge(); burnish(t, o, e); stitch(t, o, e, { inset: 0.0045, col: [146, 128, 98], a: 0.7 }); }
    else if (k === 'iron') iron(t, o, col, { seed });
    else if (k === 'brass') brass(t, o, col, { seed });
    else if (k === 'wicker') wicker(t, o, [col[0] * 0.82, col[1] * 0.8, col[2] * 0.82], { seed });
    else if (k === 'wood') wood(t, o, col, { seed });
    else clothPiece(t, o, pc, col, seed);
  }
  // the stain a piece carries, per texel now (a picker's carmine where her hands wipe, the hem's drag)
  if (pc.stain) { const s = clamp(pc.stain.at([t.X, t.Y, t.Z])); if (s > 0) over(o, dyeRGB(pc.stain.hex, 1), s * 0.85); }
  // the Holds' ash
  dust(t, o, { col: ASH, from: 0.6, to: 0.05, k: 0.5, up: 0.14, seed: seed + 3 });
}

export const KIT_PAINTERS = { default: kitDefault };
