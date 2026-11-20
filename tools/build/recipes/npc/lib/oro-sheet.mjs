/**
 * CALIMA — Tube Smith Oro's outfit sheet (people; bible §4 "shared dress language", §6.1 archetype 9 "leather apron, burn
 * scar", §6.2 Oro; TECH §6 cloth at no less than 60 % of Brea's linear density). The wave-2 review: his outfit read as
 * flat blocks of colour on the Holds' shared atlas. The same kit pieces (outfits.mjs `oro`), on a 1024² sheet of his own
 * (lib/sheet.mjs), painted here slot by slot:
 *
 *   shirt, sleeves, cuff  undyed wool, its source folds and seams, sweat and soot at the collar, scorched pinholes and
 *                         soot toward the rolled sleeves (a smith's arms), frayed at every opening
 *   vest                  black wool knit, sun-faded on the shoulders, bound in the Holds' carmine with a couched
 *                         gold-ochre graduated-tick line, a row of embroidered crescents across the back
 *   apron                 heavy oiled leather: scorched toward the hem, spatter burns, soot where his hands wipe at the hip,
 *                         a saddle stitch round every edge, the cut edges burnished; a bib pocket of paler leather
 *   sash                  the Holds' carmine wool, faded, its edges couched with the tick line; round the waist a row of
 *                         filled gold crescents, horns up, each 2.8 cm across with a dark couched rim (polish 2: the motif
 *                         read at the dialogue distance, a 2 m portrait; the band carried only the tick line and the
 *                         crescents sat on the end the apron hides); the hanging end carries a row of crescents and a
 *                         fringed tip
 *   belt, straps, pouch   dark leather: stitched edges, burnished cuts, holes by the buckle
 *   iron                  buckles, rivets, the hammer's head, the tongs, the pocket's tools: dark, rust in the low places
 *   trousers, boots       dark wool with a patched left knee (a darker wool: at 2944784 its pale #6E675C read as a pale
 *                         shin beside the other in F37), ash risen from the ground; dark leather boots scuffed pale
 *                         at the toe and dusted grey
 */
import { noise3 } from '../../lib/human/face.mjs';
import { fbm } from '../../armor/lib/atlas.mjs';
import { dyeRGB, hexRGB } from './sheet.mjs';
import { HOLDS } from './archetypes.mjs';
import {
  cells3, clamp, sstep, mix, over, scale, wool, leather, iron, wood, dust, soot, burns, fray, burnish, stitch, ticks, crescents, patch, srcLum, srcClass,
} from './paint-kit.mjs';

const C = {
  shirt: dyeRGB(HOLDS.wool, 0.9), trousers: dyeRGB('#383430', 1.0), binding: dyeRGB(HOLDS.rustDeep, 1.05), boot: dyeRGB(HOLDS.leatherDark, 1.3),
  vest: dyeRGB(HOLDS.lapilli, 1.7), apron: dyeRGB(HOLDS.leather, 1.08), apronDark: dyeRGB(HOLDS.leatherDark, 1.0),
  strap: dyeRGB(HOLDS.leatherDark, 1.15), pocket: dyeRGB('#6A4A33', 1.0), carmine: dyeRGB('#6C1F2B', 1.0),
  carmineDeep: dyeRGB(HOLDS.carmineStain, 1.0), iron: hexRGB('#3A383C'), wood: dyeRGB(HOLDS.wood, 1.0), ash: [136, 132, 124],
  gold: hexRGB('#B8914A'), goldDeep: hexRGB('#8A5D1E'), thread: [164, 146, 112], patch: dyeRGB('#2C2926', 1.0),
  soot: [28, 24, 22], sweat: [120, 104, 80],
};

/** Hands and heat on the front: the hips where he wipes them, the lap where the work rests. */
const wipeZone = (t) => (t.Z > -0.02 ? Math.exp(-(((Math.abs(t.X) - 0.13) / 0.06) ** 2) - (((t.Y - 0.96) / 0.09) ** 2)) : 0);

/** An MCO part: its source's cloth, leather and metal each painted as what it is. */
function mcoBy(t, o, { cloth, seed }) {
  const cls = srcClass(t);
  if (cls === 'metal') { iron(t, o, C.iron, { seed }); return cls; }
  if (cls === 'leather') { leather(t, o, C.strap, { seed: seed + 5 }); scale(o, srcLum(t, cls, 0.6)); burnish(t, o, t.edge()); return cls; }
  cloth(t, o);
  scale(o, srcLum(t, cls, 0.85));
  return cls;
}

function shirt(t, o) {
  const cls = mcoBy(t, o, { seed: 1, cloth: (tt, oo) => wool(tt, oo, C.shirt, { seed: 1, mottle: 0.12 }) });
  if (cls !== 'cloth') return;
  const e = t.edge();
  // the collar: sweat and grime a few cm down from the neck's opening
  if (t.Y > 1.38 && e) { const q = sstep(0.035, 0.004, e.d); over(o, C.sweat, 0.35 * q); }
  fray(t, o, e, { reach: 0.006 });
  // soot on the chest and the shoulders, where the vest does not keep it off
  soot(t, o, (tt) => 0.35 * sstep(1.2, 1.38, tt.Y), { col: C.soot, k: 0.35, seed: 3 });
  burns(t, o, () => 0.25, { cell: 0.035, rMax: 0.0035, seed: 11, core: [40, 30, 24], rim: [120, 96, 70] });
}

function sleeves(t, o) {
  const cls = mcoBy(t, o, { seed: 2, cloth: (tt, oo) => wool(tt, oo, C.shirt, { seed: 2, mottle: 0.12 }) });
  if (cls !== 'cloth') return;
  const e = t.edge();
  // toward the rolled end the wool is greyer with soot and pocked with pinholes from the forge
  const toCut = sstep(0.28, 0.42, Math.abs(t.X));
  soot(t, o, () => 0.25 + 0.6 * toCut, { col: C.soot, k: 0.5, seed: 4 });
  burns(t, o, () => 0.2 + 0.5 * toCut, { cell: 0.028, rMax: 0.004, seed: 12, core: [40, 30, 24], rim: [120, 96, 70] });
  fray(t, o, e, { reach: 0.007 });
  stitch(t, o, e, { inset: 0.005, per: 0.0045, col: [196, 186, 160], a: 0.5 });
}

function cuff(t, o) {
  wool(t, o, C.shirt, { seed: 7, mottle: 0.14 });
  scale(o, 0.9);
  soot(t, o, () => 0.8, { col: C.soot, k: 0.45, seed: 8 });
  fray(t, o, t.edge(), { reach: 0.005 });
}

function trousers(t, o) {
  const cls = mcoBy(t, o, { seed: 9, cloth: (tt, oo) => wool(tt, oo, C.trousers, { seed: 9, mottle: 0.13, streak: 0.09 }) });
  if (cls === 'cloth') {
    // a patch on the left knee, a darker wool, stitched round
    patch(t, o, { cx: 0.098, cy: 0.5, hx: 0.052, hy: 0.06, front: 1, col: C.patch, seed: 3 });
    // the wool goes shiny and dark across the thighs where the apron does not reach and the hands wipe
    soot(t, o, (tt) => 0.5 * Math.exp(-(((tt.Y - 0.82) / 0.12) ** 2)), { col: [42, 38, 34], k: 0.45, seed: 10 });
    fray(t, o, t.edge(), { reach: 0.007 });
  }
  dust(t, o, { col: C.ash, from: 0.45, to: 0.06, k: 0.5, seed: 2 });
}

function boots(t, o) {
  const cls = mcoBy(t, o, { seed: 13, cloth: (tt, oo) => leather(tt, oo, C.boot, { seed: 13 }) });
  if (cls === 'cloth' || cls === 'leather') {
    // scuffed pale at the toe and the heel, creased dark across the instep (the source's folds)
    const toe = sstep(0.06, 0.13, t.Z) * sstep(0.1, 0.03, t.Y);
    if (toe > 0) over(o, [o.r * 1.6 + 20, o.g * 1.5 + 16, o.b * 1.4 + 12], 0.45 * toe * sstep(0.35, 0.65, noise3(t.X * 60, t.Y * 60, t.Z * 60)));
    burnish(t, o, t.edge(), { cut: 0.002, scuff: 0.01 });
    stitch(t, o, t.edge(), { inset: 0.005, per: 0.0045, col: [128, 112, 86], a: 0.6 });
  }
  dust(t, o, { col: C.ash, from: 0.3, to: 0.0, k: 0.7, up: 0.3, seed: 5 });
}

function vest(t, o) {
  // (felted, not knit: at 1b's film a rib every 8.5 mm read as a pinstripe)
  wool(t, o, C.vest, { seed: 21, knit: true, mottle: 0.32, streak: 0.04, pill: 0.9 });
  // sun-faded where it faces up and on the shoulders, in patches; greyed with ash
  const fade = sstep(0.1, 0.75, t.ny) * (0.5 + 0.7 * fbm(t.X * 6, t.Y * 6 + 2, t.Z * 6, 2)) + 0.35 * sstep(0.55, 0.8, fbm(t.X * 5 + 7, t.Y * 5, t.Z * 5, 3));
  over(o, [112, 102, 92], 0.45 * clamp(fade));
  // darned holes: a few patches of a browner yarn worked across in rows
  {
    const c = cells3(t.X, t.Y, t.Z, 0.07, 23);
    if (c.id < 0.22 && c.d < 0.011 + 0.006 * c.id) { const row = Math.sin(t.Y * Math.PI * 2 / 0.0024); over(o, [84, 70, 58], 0.75); scale(o, 1 + 0.12 * row); o.h += 0.0004 * row; }
  }
  dust(t, o, { col: C.ash, from: 0, to: 0, k: 0, up: 0.22, seed: 21 });
  const e = t.edge();
  if (e && e.d < 0.017) {
    // the binding: the Holds' rust, faded, over the edge
    const q = sstep(0.017, 0.0155, e.d);
    const m = fbm(t.X * 30, t.Y * 30, t.Z * 30, 2);
    over(o, [C.binding[0] * (0.8 + 0.3 * m), C.binding[1] * (0.8 + 0.3 * m), C.binding[2] * (0.8 + 0.3 * m)], q);
    o.det = 1;
    if (e.d > 0.0152 && e.d < 0.0172) { scale(o, 0.7); o.h -= 0.0004; }
    ticks(t, o, e, { d0: 0.0105, per: 0.007, long: 6, short: 0.0035, longL: 0.0075, w: 0.0009, col: C.gold });
    fray(t, o, e, { reach: 0.004, pale: [168, 96, 92] });
  } else if (e && t.Z < -0.03 && Math.abs(e.ty) < 0.6) {
    // across the back, above the lower edge: the crescents
    crescents(t, o, e, { d: 0.036, per: 0.046, r: 0.0105, w: 0.0011, col: C.gold, a: 0.85 });
  }
}

function apron(t, o, pc) {
  leather(t, o, C.apron, { seed: 31, oil: 0.75, scratch: 1.3, mottle: 0.26 });
  // worn paler and drier where his belly and thighs push it out, darker and oilier in the hollows between
  const worn = sstep(0.55, 0.8, fbm(t.X * 3.2, t.Y * 3.2 + 5, t.Z * 3.2, 3));
  over(o, [C.apron[0] * 1.35 + 10, C.apron[1] * 1.3 + 8, C.apron[2] * 1.25 + 6], 0.35 * worn);
  o.rough = mix(o.rough, 0.85, 0.5 * worn);
  // a few old scorches the size of a coin to a palm, dark-cored and soft-edged (they read at a few metres)
  {
    const c = cells3(t.X, t.Y, t.Z, 0.09, 37), r = 0.012 + 0.03 * c.id;
    if (c.id < 0.45 && t.Y < 1.25 && c.d < r * 1.6) { const q = 1 - c.d / (r * 1.6); over(o, [30, 20, 15], 0.75 * q * q); o.rough = mix(o.rough, 0.9, q); }
  }
  // the heat: darker and drier toward the hem (the old stain field, now per texel), the burns thickest low and in the middle
  const st = pc.stain ? clamp(pc.stain.at([t.X, t.Y, t.Z])) : 0;
  over(o, C.apronDark, st * 0.8);
  o.rough = mix(o.rough, 0.82, st * 0.6);
  burns(t, o, (tt) => 0.25 + 0.6 * sstep(1.15, 0.6, tt.Y) * (1 - 0.5 * sstep(0.08, 0.2, Math.abs(tt.X))), { cell: 0.026, rMin: 0.002, rMax: 0.0075, seed: 33 });
  soot(t, o, wipeZone, { col: C.soot, k: 0.75, seed: 34 });
  const e = t.edge();
  burnish(t, o, e, { cut: 0.003, scuff: 0.016 });
  stitch(t, o, e, { inset: 0.0075, per: 0.005, duty: 0.62, w: 0.001, col: C.thread, a: 0.8 });
  // the back face against him: darker, unworn
  if (t.nz < -0.2 && t.Z > -0.05) scale(o, 0.82);
}

function apronHem(t, o, pc) {
  leather(t, o, C.apronDark, { seed: 35, oil: 0.3 });
  burns(t, o, () => 0.6, { cell: 0.02, seed: 36 });
  void pc;
}

function pocket(t, o) {
  leather(t, o, C.pocket, { seed: 41, oil: 0.2, scratch: 0.8, mottle: 0.22 });
  const e = t.edge();
  burnish(t, o, e, { cut: 0.0025, scuff: 0.01 });
  stitch(t, o, e, { inset: 0.005, per: 0.0045, col: C.thread, a: 0.85 });
  // the mouth, darkened where his fingers go in
  if (t.Y > 1.25) scale(o, 1 - 0.25 * sstep(1.25, 1.29, t.Y));
  soot(t, o, () => 0.35, { col: C.soot, k: 0.5, seed: 42 });
}

function strapLeather(t, o) {
  leather(t, o, C.strap, { seed: 51, oil: 0.4, scratch: 0.7 });
  const e = t.edge();
  burnish(t, o, e, { cut: 0.0022, scuff: 0.008 });
  stitch(t, o, e, { inset: 0.0042, per: 0.004, col: [140, 122, 92], a: 0.75 });
}

function belt(t, o) {
  strapLeather(t, o);
  // the holes by the buckle (front, his right of it), each a dark punched oval with a stretched rim
  const e = t.edge();
  if (e && t.Z > 0.05 && t.X < -0.03 && t.X > -0.15) {
    const k = Math.round(t.X / 0.022) * 0.022;
    const mid = Math.abs(e.d - 0.02);
    const dd = Math.hypot((t.X - k) / 0.0032, mid / 0.0028);
    if (dd < 1) { scale(o, 0.25); o.h -= 0.0012; } else if (dd < 1.5) scale(o, 0.85);
  }
}

/**
 * The sash's crescent row (polish 2): round the waist (the ring of outfits.mjs waistTie at SASH.y, its centre SASH.cz behind
 * the origin), one each SASH.per m of arc, centred in the band; a gold disc less a disc lifted half its radius (horns up),
 * filled in satin stitch, outlined in a dark couched thread so it reads against the carmine at a few metres.
 */
const SASH = { y: 1.06, cz: -0.012, R: 0.165, per: 0.062, r: 0.014, rim: 0.0016 };
function sashCrescent(t, o) {
  // (the arc's spacing on a nominal radius; the crescent's own width on the band's radius there, so it is round over the apron too)
  const th = Math.atan2(t.X, t.Z - SASH.cz), k = Math.round(th * SASH.R / SASH.per);
  const x = (th - k * SASH.per / SASH.R) * Math.hypot(t.X, t.Z - SASH.cz), y = t.Y - SASH.y;
  const r = SASH.r, r1 = Math.hypot(x, y + 0.001), r2 = Math.hypot(x, y - r * 0.5);
  const inA = r1 < r, outB = r2 > r * 0.8;
  if (inA && outB) {
    const rimD = Math.min(r - r1, r2 - r * 0.8);
    if (rimD < SASH.rim) { over(o, [58, 22, 18], 0.9); o.h -= 0.0003; }
    else { const st = 0.9 + 0.1 * Math.sin((x + y) * Math.PI * 2 / 0.0014); over(o, [C.gold[0] * st * 1.08, C.gold[1] * st * 1.06, C.gold[2] * st], 0.95); o.h += 0.0005; o.rough = mix(o.rough, 0.55, 1); }
    o.det = 0.2;
  } else if (r1 < r + SASH.rim && r2 > r * 0.8 - SASH.rim) { over(o, [58, 22, 18], 0.75); }
}

function sash(t, o) {
  wool(t, o, C.carmine, { seed: 61, mottle: 0.16, streak: 0.08 });
  // faded a little where it faces up and the sun takes it
  over(o, [150, 92, 88], 0.14 * sstep(0.1, 0.9, t.ny));
  const e = t.edge();
  ticks(t, o, e, { d0: 0.0085, per: 0.0075, long: 5, short: 0.004, longL: 0.007, w: 0.001, col: C.gold });
  sashCrescent(t, o);
  fray(t, o, e, { reach: 0.004, pale: [176, 110, 100] });
  dust(t, o, { col: C.ash, from: 0, to: 0, k: 0, up: 0.16, seed: 62 });
  soot(t, o, () => 0.4, { col: [46, 26, 26], k: 0.35, seed: 64 });
}

function sashEnd(t, o) {
  wool(t, o, C.carmine, { seed: 63, mottle: 0.16, streak: 0.08 });
  const e = t.edge();
  if (e && Math.abs(e.ty) > 0.55) {
    // along its long edges: the tick line; down its middle: crescents
    ticks(t, o, e, { d0: 0.009, per: 0.0075, long: 5, short: 0.004, longL: 0.007, w: 0.001, col: C.gold });
    crescents(t, o, e, { d: 0.032, per: 0.05, r: 0.0095, w: 0.001, col: C.gold, a: 0.85, fill: 0.85 });
  } else if (e && e.d < 0.028) {
    // the tip: a fringe of loose threads over a darker shadow between them
    const f = (e.s / 0.0032) % 1;
    if (f < 0.55) { over(o, [C.carmine[0] * 1.1 + 10, C.carmine[1] * 1.05 + 6, C.carmine[2] * 1.05 + 6], 0.6); o.h += 0.0004; }
    else { scale(o, 0.55); o.h -= 0.0004; }
  }
  fray(t, o, e, { reach: 0.004, pale: [176, 110, 100] });
}

function sashKnot(t, o) {
  wool(t, o, C.carmine, { seed: 65, mottle: 0.2 });
  scale(o, 0.86);
}

function pouch(t, o) {
  leather(t, o, dyeRGB(HOLDS.leather, 1.0), { seed: 71, oil: 0.45 });
  const e = t.edge();
  burnish(t, o, e);
  stitch(t, o, e, { inset: 0.005, col: C.thread, a: 0.7 });
  soot(t, o, () => 0.4, { col: C.soot, k: 0.4, seed: 72 });
}

const ironP = (t, o) => iron(t, o, C.iron, { seed: 81, rust: 0.55 });
const handle = (t, o) => wood(t, o, C.wood, { seed: 91, grip: (tt) => 0.55 * sstep(0.95, 0.85, tt.Y) });

function fallback(t, o, pc) {
  const col = pc.dye ? dyeRGB(pc.dye, pc.shade ?? 1) : [180, 180, 180];
  wool(t, o, col, { seed: 99 });
}

export const ORO_PAINTERS = {
  shirt, sleeves, cuff, trousers, boots, vest, apron, apronHem, pocket, strap: strapLeather, belt, sash, sashEnd, sashKnot, pouch,
  iron: ironP, handle, default: fallback,
};
