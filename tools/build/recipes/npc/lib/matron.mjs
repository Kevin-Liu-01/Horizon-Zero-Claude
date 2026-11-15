/**
 * CALIMA — Guild Matron Ansel's dress (people; BUILD M1.5b; bible §4 "shared dress language", §6.1 archetype 2 with
 * the Elder calling: head wrap, a long layered robe-vest with embroidered panels, sash, trousers, boots; the brass
 * guild chain; TECH §6 "cloth at no less than 60 % of Brea's linear density, the same tiled weave, leather-grain and
 * brass detail").
 *
 * Built on Brea's own garment library, not the NPC kit's recoloured stock parts: the Pan rungs' base
 * (outfit-pan-1.mjs `panBase`, the long cut with sleeves) drafted on the stock UBC female body Ansel shares with
 * every Pan woman, then her own layers on top, all packed onto ONE sheet of her own (1024² base, 512² normal + ORM;
 * the ORM's R channel is the detail class src/hero/clothShader.js reads, so the weave, grain and brass tile at the
 * same size as on Brea).
 *
 * Layers at the torso, inside out:
 *   1. the under-tunic: its stand collar at the neck and its turned hem under the robe (grey linen)
 *   2. the shirt: salt-white linen, sleeves rolled to the elbow, a cuff with an orchil lining
 *   3. the robe-vest: undyed oatmeal linen, sleeveless, cut to a deep V and open down the front from the belt, to
 *      mid-calf, its neckline and fronts bound in a wide deep-orchil band couched with gold-ochre graduated ticks (the
 *      family mark); the skirt's edges and hem embroidered with the ticks and a row of ring-and-plumb glyphs; frayed,
 *      dusty and salt-stained low down
 *   4. the girdle (plum-brown leather, a brass buckle and keeper), the orchil sash under it, knotted at the left hip
 *      (her one violet block, small: Q6)
 *   then the brass guild chain of cast links with the guild's medal, and a key strap at her right hip (leather, a
 *   brass buckle, an iron ring of keys).
 *
 * Deterministic: no clocks, no Math.random. Bind space: the UBC female pack's (raw metres, +Z front, +X her left).
 */
import path from 'node:path';
import { srcRoot, MCO_DIR, noise3, jointPos } from '../../lib/human/face.mjs';
import { panBase, PAN_PAINTERS, COL, cloth, seam, salted, hangFolds, panTrim, rideOn } from '../../outfit-pan-1.mjs';
import { packAtlas, paintAtlas, loadRaw, fbm } from '../../armor/lib/atlas.mjs';
import { Field, V, clamp, compact, emptyPart, mix, recomputeNormals, smoothSkin, sstep, collapseShort } from '../../armor/lib/part.mjs';
import { TAU, orientOut, strapAlong, boxInto } from '../../armor/lib/garment.mjs';
import { radialTable, drapeTable, draftSmock, openEdges, bindingOn, tubeInto, roundRect } from '../../armor/lib/smock.mjs';
import { latheAt } from '../../armor/lib/rung1.mjs';

const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const put = (o, c) => { o.r = c[0]; o.g = c[1]; o.b = c[2]; };
const over = (o, c, a) => { o.r += (c[0] - o.r) * a; o.g += (c[1] - o.g) * a; o.b += (c[2] - o.b) * a; };

/** Ansel's cloth, as albedo (the Pan Houses' salt-white linen with one orchil accent; bible §4). */
export const ANSEL = {
  robe: hex('#B9A682'), shirt: hex('#DCD5C5'), tunic: hex('#9C9384'), trousers: hex('#4B4A4F'), boot: hex('#5B4334'),
  // (M1.5b fix round 1, the judge: "her violet accent is almost invisible" at 3 m in F20; Q6): the orchil a step brighter and more
  // saturated (#6B3F73 -> #7E3A92, the band's deep ground #4F2A5C -> #63287A), still darker than Brea's own violet, and the front band
  // 3.8 cm wide (2.8 before), so it reads as a stripe down her front at 3 m
  // (M1.5b round 2, the review: "embroidery not legible at 3 m": the gold-ochre on the oatmeal robe stood 5 L* off it; the robe's own
  // embroidery takes a deeper ochre, `tickDeep`, about 20 L* under the linen, the bright `tick` stays on the dark orchil band)
  wraps: hex('#7D7468'), orchil: hex('#7E3A92'), orchilDeep: hex('#63287A'), tick: hex('#B8914A'), tickDeep: hex('#8A5D1E'), strap: hex('#5C3D29'),
  iron: hex('#4A4744'),
};
/** What the Pan painters read, set to Ansel's cloth while her sheet is drafted and painted (restored after). */
const COL_ANSEL = {
  smock: ANSEL.shirt, linen: ANSEL.shirt, print: sc(ANSEL.shirt, 1.03), trouserBG: ANSEL.trousers, bootLeather: ANSEL.boot,
  shinWrap: ANSEL.wraps, wrapV: ANSEL.wraps, sashDeep: ANSEL.orchil, carmine: ANSEL.orchilDeep, strapLeather: ANSEL.strap, tick: ANSEL.tick,
};

/** The robe's hem (bind y, the UBC female's mid-calf) and its ragged edge. */
const ROBE_HEM = 0.415;
const raggedHem = (th, y0) => y0 + 0.022 * (noise3(th * 3.1, 1.7, 4.2) - 0.5) + 0.012 * Math.abs(Math.sin(2 * th)) + 0.006 * (noise3(th * 11, 2.2, 7.9) - 0.5);
/** The robe-vest's neckline: a deep V at the front (y 1.17 at the centre), up to the side of the neck, high at the nape. */
const vNeck = (d) => mix(1.172, 1.476, Math.pow(clamp(d / 1.08), 0.82)) + 0.011 * sstep(1.6, 3.0, d);
/** Its armholes: deeper and wider than the shirt's, so the shirt's sleeve cap shows round them. */
const ARMHOLE_V = { y: 1.37, z: -0.045, ry: 0.118, rz: 0.098, xMin: 0.124 };

/* ------------------------------------------------------------------ painting */

/** The gold-ochre thread, couched: a little proud, dulled where it is worn. */
function thread(o, a, cr, col = ANSEL.tick) {
  over(o, sc(col, 0.86 + 0.3 * cr), a);
  o.h += 0.0004 * a; o.rough = mix(o.rough, 0.6, a); o.det = mix(o.det, 0.2, a);
}

/** Frayed, worn edges: pale threads standing out, the cloth darker where it drags and wears through. */
function edgeWear(t, o, { reach = 0.007, pale = [226, 220, 205] } = {}) {
  const e = t.dm;
  if (e > reach) return;
  const q = 1 - e / reach;
  const fr = noise3(t.X * 420, t.Y * 420, t.Z * 420);
  if (fr > 0.56) over(o, pale, 0.45 * q); else { const k = 1 - 0.22 * q; o.r *= k; o.g *= k; o.b *= k; }
  o.wear = 1.6;
}

/** The robe's linen: undyed oatmeal, faintly streaked along the warp, sun-faded on top, dust and salt low down. */
function robeCloth(t, o, seed) {
  cloth(t, o, ANSEL.robe, { slub: 0.08, mottle: 0.09, seed, thread: 0.05, weft: 0.3 });
  const st = fbm(Math.atan2(t.Z + 0.02, t.X) * 30, t.Y * 1.4, 31.7 + seed, 2) - 0.5;
  const q = 1 + 0.05 * st; o.r *= q; o.g *= q; o.b *= q * (st < 0 ? 0.985 : 1);
  // a warmer cast where it is handled, greyer where it lies in shadow folds
  const n = fbm(t.X * 5, t.Y * 5, t.Z * 5 + 3.3, 3);
  over(o, sc(ANSEL.robe, 1.1), 0.18 * sstep(0.5, 0.75, n));
}

/** The vest above the belt: folds from the shoulders, a gold line in from the armhole's edge, wear at every edge. */
function vestPaint(t, o) {
  robeCloth(t, o, 41);
  const f = hangFolds(t, { belt: 1.15, hem: 1.5, seed: 4 });
  o.h += 0.0022 * (f - 0.55);
  o.ao *= 1 - 0.18 * sstep(0.4, 0.05, f);
  o.ao *= 1 - 0.3 * sstep(1.17, 1.145, t.Y);
  const cr = noise3(t.X * 60, t.Y * 60, t.Z * 60);
  // the armhole's edge is turned and stitched, and a single gold line runs 6 mm in from it
  if (t.Y > 1.24 && Math.abs(t.X) > 0.11) {
    seam(t, o, { d0: 2.4, a: 0.2, groove: 0.9 });
    if (Math.abs(t.dm - 0.006) < 0.0009) thread(o, 0.8, cr);
  }
  edgeWear(t, o, { reach: 0.005 });
  o.rough = 0.9; o.det = 1; o.crease = 0.9;
}

/** The robe's long panels: deep folds, the embroidered border, a row of glyphs over a frayed, dusty hem. */
function skirtPaint(t, o) {
  robeCloth(t, o, 43);
  const th = Math.atan2(t.Z + 0.02, t.X);
  const f = hangFolds(t, { belt: 1.1, hem: ROBE_HEM, seed: 0 });
  o.h += 0.0034 * (f - 0.58);
  o.ao *= 1 - 0.28 * sstep(0.42, 0.04, f);
  o.ao *= 1 - 0.4 * sstep(1.06, 1.09, t.Y);
  const hemY = raggedHem(th, ROBE_HEM);
  const up = t.Y - hemY;                 // metres above the hem
  const e = t.dm;
  const cr = noise3(t.X * 70, t.Y * 70, t.Z * 70);
  const worn = (1 - 0.45 * sstep(0.62, 0.92, f)) * (noise3(t.X * 30, t.Y * 30, t.Z * 30 + 5) > 0.22 ? 1 : 0.4);
  // along the edge: round the hem it is the bearing, up a slit it is the height
  const along = up < 0.06 ? th * 0.24 : t.Y;
  // M1a round 3 (the review at dee526d: "Ansel's embroidery still not legible at 3 m"; PEOPLE's robes carry their gold work on
  // violet grounds): the skirt's fronts and hem are bound in a band of the orchil, 3.4 cm in from each front edge and 11.5 cm up
  // from the hem, sun-faded a little where it is worn, and the border and the glyph row are couched on it in the bright gold-ochre
  // (`tick`); the oatmeal linen between keeps no thread. Gold on violet, as the vest's front band already is
  const ground = t.Y < 1.07 ? Math.max(sstep(0.036, 0.032, e), sstep(0.119, 0.113, up)) : 0;
  if (ground > 0) over(o, sc(ANSEL.orchil, 0.94 + 0.12 * cr), ground * (0.82 + 0.18 * worn));
  const gold = () => (ground > 0.5 ? ANSEL.tick : ANSEL.tickDeep);
  if (t.Y < 1.07) {
    // the border: a couched line 13 mm in from every edge, short ticks every 8 mm standing in from it to the edge, a long
    // one every 4 cm (the graduated-tick family mark), a second line 4 mm inside it
    // M1.5b round 2 (legible at 3 m, where a texel-sized thread is gone: about 2.6 mm a pixel at F20's 3 m): the border's two lines
    // 4 and 3 mm wide (were 3.4 and 2.4), the ticks every 16 mm and 6 mm wide (8 and 2), a long one every 8 cm, in the deeper ochre
    if (Math.abs(e - 0.015) < 0.002 || Math.abs(e - 0.0235) < 0.0015) thread(o, 0.95 * worn, cr, gold());
    const ph = ((along / 0.016) % 1 + 1) % 1, long = Math.floor(along / 0.016) % 5 === 0;
    if (e > (long ? 0.002 : 0.006) && e < 0.015 && ph < 0.38) thread(o, 0.9 * worn, cr, gold());
    // a row of the ring glyph 6 cm over the hem: a ring, a plumb line through it, a datum bar under it, every 13 cm
    // (round 2: the ring 18 mm across its centre line, was 10.5, its strokes 3.6 and 2.4 mm, was 3.2 and 1.6)
    const gv = up - 0.07;
    if (Math.abs(gv) < 0.04 && e > 0.026) {
      const s = th * 0.24, k = Math.floor(s / 0.13), gu = ((s % 0.13) + 0.13) % 0.13 - 0.065;
      const live = noise3(k * 3.7, 1.3, 2.9) > 0.25 ? 1 : 0.45;
      const rr = Math.hypot(gu, gv);
      if (Math.abs(rr - 0.018) < 0.0018) thread(o, 0.92 * live * worn, cr, gold());
      if (Math.abs(gu) < 0.0012 && Math.abs(gv) < 0.028) thread(o, 0.85 * live * worn, cr, gold());
      if (Math.abs(gv + 0.026) < 0.0012 && Math.abs(gu) < 0.011) thread(o, 0.85 * live * worn, cr, gold());
      // between the rings a running script of short strokes
      if (Math.abs(gu) > 0.022 && Math.abs(gu) < 0.05 && Math.abs(gv) < 0.006) {
        const sv = ((gu + 0.065) / 0.0062) % 1, su = noise3(Math.floor((gu + 0.065) / 0.0062) * 2.3, k, 5.1);
        if (sv < 0.2 && Math.abs(gv - (su - 0.5) * 0.004) < 0.0045 * (0.4 + su)) thread(o, 0.65 * live * worn, cr);
      }
    }
  }
  // the turned hem's fold line and its stitches
  if (up < 0.026 && up > 0) {
    const b = 1 - clamp(Math.abs(up - 0.016) / 0.0018);
    if (b > 0) { o.h += 0.0008 * b; o.ao *= 1 - 0.1 * b; }
  }
  // the hem frays and drags: pale threads, then the dust and the salt of the pans, darker and greyer to the edge
  edgeWear(t, o, { reach: 0.012 });
  const n = fbm(t.X * 7, t.Y * 7, t.Z * 7, 3);
  over(o, [150, 136, 122], sstep(0.16, 0.02, up) * 0.32 * (0.4 + n));
  over(o, [172, 160, 146], sstep(0.75, 0.5, t.Y) * 0.12 * (0.5 + n));
  salted(t, o, { hem: 0.6, hemY: ROBE_HEM + 0.07, tide: 0 });
  o.rough = 0.9; o.det = 1; o.crease = 0.8; o.wear = Math.max(o.wear, 1.2);
}

/** The under-tunic: grey-cream linen, its collar a shade darker inside, its hem turned. */
function tunicPaint(t, o) {
  cloth(t, o, ANSEL.tunic, { slub: 0.07, mottle: 0.12, seed: 2, thread: 0.035 });
  if (t.slot === 'under') {
    const f = hangFolds(t, { belt: 0.95, hem: ROBE_HEM - 0.07, seed: 5 });
    o.h += 0.005 * (f - 0.55);
    edgeWear(t, o, { reach: 0.008, pale: [200, 192, 176] });
    const n = fbm(t.X * 7, t.Y * 7, t.Z * 7, 3);
    over(o, [128, 116, 104], sstep(0.42, 0.3, t.Y) * 0.3 * (0.4 + n));
  } else {
    seam(t, o, { d0: 2.6, a: 0.22 });
  }
  o.rough = 0.92; o.det = 1;
}

/**
 * The shirt: Brea's top painter (its modelled drag folds, gathers and felled seams), its colour taken back to the undyed
 * linen at the same value (Brea's dye fades toward a sun-bleached orchil; this cloth was never dyed).
 */
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function shirtPaint(t, o) {
  PAN_PAINTERS.smock(t, o);
  const k = lum([o.r, o.g, o.b]) / lum(ANSEL.shirt);
  put(o, sc(ANSEL.shirt, k));
  edgeWear(t, o, { reach: 0.004, pale: [214, 204, 184] });
}

export const ANSEL_PAINTERS = { ...PAN_PAINTERS, smock: shirtPaint, vest: vestPaint, skirt: skirtPaint, under: tunicPaint, underyoke: tunicPaint };

/** Her trim band: Brea's cells, the bindings repainted, the wide embroidered band in the cell Pan II's capelet uses. */
function anselTrim(W, H, trimH) {
  const T = panTrim(W, H, trimH);
  // the shirt's neckline binding: its own linen, one stitch (Brea's is orchil)
  T.cells.get('bind').painter = (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; t.d = 99;
    cloth(t, o, sc(ANSEL.shirt, 0.95), { slub: 0.06, mottle: 0.08, seed: 14 });
    const b = 1 - clamp(Math.abs(t.y - 5) / 0.8);
    if (b > 0 && ((t.x / 3.6) % 1) < 0.58) over(o, sc(ANSEL.shirt, 1.18), b * 0.5);
  };
  // the robe-vest's front band (rows across: v 0 lies on the cloth 3 cm in, 2/3 is the rim, 1 is turned under): the robe's
  // linen couched in gold-ochre ticks between two lines, one orchil thread down its middle, the rim worn pale
  T.cells.get('capelet').painter = (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; t.d = 99;
    // (the trim, Q6: the band's ground is the deep orchil, the one violet on her besides the sash and the wrap's lining)
    // (M1.5b round 2, Q6: "her violet accent nearly invisible" in F20's gold light: the ground the brighter orchil, not the deep)
    cloth(t, o, sc(ANSEL.orchil, 1.08), { slub: 0.07, mottle: 0.08, seed: 23, thread: 0.04 });
    const cr = noise3(t.ax * 0.07, t.ay * 0.07, 1.9);
    const worn = noise3(t.ax * 0.03, t.ay * 0.03, 4.4) > 0.24 ? 1 : 0.45;
    const v = t.v, x = t.x;
    if (Math.abs(v - 0.1) < 0.026 || Math.abs(v - 0.58) < 0.026) thread(o, 0.95 * worn, cr);
    // the ticks: short ones every 6 px standing in from each line, long ones every 5th (toward the middle)
    const per = 6, ph = ((x % per) + per) % per, long = Math.floor(x / per) % 5 === 0;
    if (ph < 1.6 && ((v > 0.1 && v < (long ? 0.24 : 0.17)) || (v < 0.58 && v > (long ? 0.44 : 0.51)))) thread(o, 0.8 * worn, cr);
    // a salt-white running thread down its middle
    if (Math.abs(v - 0.34) < 0.02 && ((x / 5) % 1) < 0.6) { over(o, ANSEL.shirt, 0.75 * worn); o.h += 0.0003; }
    // the rim: rolled, worn pale and a little grey
    if (v > 0.6 && v < 0.75) { const q = 1 - Math.abs(v - 0.67) / 0.08; over(o, [120, 92, 120], 0.35 * q); o.h += 0.0006 * q; }
    if (v > 0.75) { o.r *= 0.82; o.g *= 0.82; o.b *= 0.82; }
    o.rough = 0.88; o.det = 0.9;
  };
  return T;
}

/* ------------------------------------------------------------------ the layers she adds */

/** The robe-vest above the belt, lofted over the shirt (armor/lib/smock.mjs), skinned as Brea's top is. */
function robeVest(base, parts) {
  const { bodyPart, skinOf, J } = base;
  const by = (s) => parts.find((p) => p.slot === s);
  const smock = by('smock'), sleeves = by('sleeves'), yoke = by('underyoke'), binds = by('binds'), girdle = by('girdle');
  const keep = (x, y) => y < 1.535 && Math.abs(x) < (y > 1.3 ? 0.19 : 0.215);
  const raw = radialTable([bodyPart, yoke, sleeves, smock, binds].filter(Boolean), { y0: 1.1, y1: 1.54, keep });
  const drape = drapeTable(raw, { crest: [1.26, 1.4], fall: 0.3, minEase: 0.006, margin: (y) => 0.0072 + 0.003 * sstep(1.3, 1.2, y) });
  const gF = new Field([girdle], 0.03), sF = new Field([smock], 0.03);
  const vest = draftSmock(emptyPart('vest'), drape, skinOf, {
    rows: 16, cols: 60, neckY: vNeck, yBelt: 1.13, seed: 7, density: 1,
    // under the girdle the robe is gathered in with the shirt: inside the leather, outside the linen
    gather: (y, th) => Math.max(sF.radial(y, th, 0, -0.02, 0.012, 0.12) + 0.0045, gF.radial(1.13, th, 0, -0.02, 0.03, 0.14) - 0.0085),
    armholes: [{ side: 1, ...ARMHOLE_V }, { side: -1, ...ARMHOLE_V }],
  });
  compact(vest);
  collapseShort(vest, 0.008);
  // the trunk carries it below the armpit, the shoulder above (Brea's top, panBase): no edge crosses a step
  {
    const jC = [J('clavicle_l'), J('clavicle_r')], jS3 = J('spine_03'), jU = [J('upperarm_l'), J('upperarm_r')];
    for (let i = 0; i < vest.pos.length / 3; i++) {
      const k = sstep(1.425, 1.345, vest.pos[i * 3 + 1]);
      if (k <= 0) continue;
      let moved = 0;
      for (let c = 0; c < 4; c++) if (jC.includes(vest.jnt[i * 4 + c]) || jU.includes(vest.jnt[i * 4 + c])) { const m = vest.wgt[i * 4 + c] * k; vest.wgt[i * 4 + c] -= m; moved += m; }
      if (moved > 0) { let s3 = -1, empty = -1; for (let c = 0; c < 4; c++) { if (vest.jnt[i * 4 + c] === jS3) s3 = c; if (vest.wgt[i * 4 + c] <= 1e-5 && empty < 0) empty = c; } if (s3 >= 0) vest.wgt[i * 4 + s3] += moved; else { const q = empty >= 0 ? empty : 3; vest.jnt[i * 4 + q] = jS3; vest.wgt[i * 4 + q] = moved; } }
    }
  }
  smoothSkin(vest, { its: 12, k: 0.5, drop: { [J('upperarm_l')]: J('clavicle_l'), [J('upperarm_r')]: J('clavicle_r'), [J('Head')]: J('neck_01') } });
  orientOut(vest, 0, -0.02, 1.25);
  // the cut rims smoothed in place, every welded copy moved with them (panBase does the same for the shirt)
  {
    const key = (i) => `${Math.round(vest.pos[i * 3] * 1e4)},${Math.round(vest.pos[i * 3 + 1] * 1e4)},${Math.round(vest.pos[i * 3 + 2] * 1e4)}`;
    const byKey = new Map();
    for (let i = 0; i < vest.pos.length / 3; i++) { const k = key(i); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); }
    for (const run of openEdges(vest)) {
      const cy = run.reduce((a, q) => a + q.p[1], 0) / run.length;
      if (cy < 1.19) continue;
      const N = run.length, ids = run.map((q) => byKey.get(key(q.i)) || [q.i]);
      let P = run.map((q) => q.p.slice());
      for (let it = 0; it < 2; it++) P = P.map((p, k) => { const a = P[(k - 1 + N) % N], b = P[(k + 1) % N]; return [0, 1, 2].map((c) => p[c] * 0.5 + (a[c] + b[c]) * 0.25); });
      run.forEach((_, k) => { for (const i of ids[k]) { vest.pos[i * 3] = P[k][0]; vest.pos[i * 3 + 1] = P[k][1]; vest.pos[i * 3 + 2] = P[k][2]; } });
    }
  }
  recomputeNormals(vest);
  // the neckline and the fronts: the wide embroidered band; the armholes: a narrow binding of the robe's own linen
  const band = emptyPart('vestband', { trim: true });
  const vSkin = new Field([vest], 0.04);
  for (const run of openEdges(vest)) {
    const cy = run.reduce((a, q) => a + q.p[1], 0) / run.length, cx = run.reduce((a, q) => a + q.p[0], 0) / run.length;
    if (cy < 1.19) continue;
    // (M1.5b round 2, the review: "a bright jagged sliver where the vest's armhole binding meets the sleeve cap": the armhole binding is
    // smoothed along its run as the front band is, and stands 2.4 mm proud of the vest, not 1.4, so the shirt's sleeve cap under it
    // never cuts through its edge; the front band 5 cm wide, was 3.8, so the orchil reads as a stripe down her front at 3 m)
    if (Math.abs(cx) > 0.1) bindingOn(band, run, vSkin, vSkin, { rect: base.trim.rect('bind'), w: 0.0085, lift: 0.0024, under: 0.3, edge: 0.001, smooth: 2 });
    else bindingOn(band, run, vSkin, vSkin, { rect: base.trim.rect('capelet'), tile: 0.085, w: 0.05, lift: 0.0018, under: 0.2, edge: 0.0016, smooth: 1, center: (q) => (q[1] < 1.42 ? [0, q[1], q[2] - 0.1] : [0, 1.57, -0.02]) });
  }
  recomputeNormals(band);
  rideOn(band, [vest]);
  return [vest, band];
}

/** The guild chain: cast brass links from the side of her neck down to the guild's medal on her breastbone. */
function guildChain(base, parts) {
  const { J, trim } = base;
  const by = (s) => parts.filter((p) => ['vest', 'vestband', 'smock', 'binds', 'underyoke'].includes(p.slot));
  const surf = new Field(by(), 0.03);
  const brass = trim.rect('brass');
  const chain = emptyPart('chain', { trim: true }), medal = emptyPart('medal', { trim: true });
  const onFront = (x, y, off) => {
    const near = surf.nearest(x, y, 0.25, 6);
    let z = -9, n = [0, 0, 1];
    for (const { p } of near) if (Math.abs(p.x - x) < 0.02 && Math.abs(p.y - y) < 0.02 && p.z > z) { z = p.z; n = [p.nx, p.ny, p.nz]; }
    if (z < -1) { z = near[0].p.z; n = [near[0].p.nx, near[0].p.ny, near[0].p.nz]; }
    n = V.norm(n);
    return { p: V.add([x, y, z], V.mul(n, off)), n };
  };
  const MY = 1.292;
  const med = onFront(0, MY, 0.0075);
  // each strand: from the side of the neck, a hanging curve to the medal's ring
  const jS3 = J('spine_03');
  for (const s of [1, -1]) {
    const pts = [];
    const K = 22;
    for (let k = 0; k <= K; k++) {
      const u = k / K;
      const x = s * mix(0.072, 0.008, u), y = mix(1.468, MY + 0.03, Math.pow(u, 0.86)) - 0.016 * Math.sin(Math.PI * u);
      pts.push(onFront(x, y, 0.0045 + 0.002 * u).p);
    }
    // resample to links 11 mm apart
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + V.len(V.sub(pts[i], pts[i - 1])));
    const step = 0.0105, n = Math.floor(L[L.length - 1] / step);
    for (let m = 0; m <= n; m++) {
      const d = m * step;
      let i = 1; while (i < pts.length - 1 && L[i] < d) i++;
      const c = V.lerp(pts[i - 1], pts[i], (d - L[i - 1]) / (L[i] - L[i - 1] || 1));
      const tan = V.norm(V.sub(pts[Math.min(pts.length - 1, i)], pts[i - 1]));
      const nrm = onFront(c[0], c[1], 0).n;
      const side = V.norm(V.cross(tan, nrm));
      // links alternate flat on the cloth and standing on edge
      const Y = m % 2 ? nrm : side;
      const sk = surf.skin(c[0], c[1], c[2] - 0.01, 4);
      const v0 = chain.pos.length / 3;
      tubeInto(chain, roundRect(c, tan, Y, 0.0072, 0.0042, 0.0034, 1), 0.00135, { sides: 3, closed: true, rect: brass, joint: jS3 });
      for (let q = v0; q < chain.pos.length / 3; q++) for (let c4 = 0; c4 < 4; c4++) { chain.jnt[q * 4 + c4] = sk.j[c4]; chain.wgt[q * 4 + c4] = sk.w[c4]; }
    }
  }
  // the medal: a cast disc with a raised rim, a ring of ticks in relief (the paint), a boss; its ring at the top
  {
    const sk = surf.skin(med.p[0], med.p[1], med.p[2] - 0.01, 4);
    latheAt(medal, V.add(med.p, V.mul(med.n, 0.0005)), med.n, [0, 1, 0], [[0.0225, -0.0012], [0.0245, 0.0012], [0.0236, 0.0036], [0.0196, 0.0042], [0.0176, 0.0032], [0.009, 0.0036], [0.0068, 0.0056], [0.0028, 0.0068], [0, 0.007]], { sides: 18, rect: brass, sk });
    tubeInto(medal, roundRect(V.add(med.p, [0, 0.028, 0.002]), [1, 0, 0], [0, 1, 0], 0.0055, 0.0055, 0.0048, 2), 0.0016, { sides: 4, closed: true, rect: brass, joint: jS3 });
    const v0 = 0;
    for (let q = v0; q < medal.pos.length / 3; q++) for (let c4 = 0; c4 < 4; c4++) { medal.jnt[q * 4 + c4] = sk.j[c4]; medal.wgt[q * 4 + c4] = sk.w[c4]; }
  }
  recomputeNormals(chain); recomputeNormals(medal);
  return [chain, medal];
}

/** The key strap at her right hip: leather, doubled through a brass buckle, an iron ring with three keys under it. */
function keyStrap(base, parts) {
  const { J, trim } = base;
  const girdle = parts.find((p) => p.slot === 'girdle');
  const skirt = parts.filter((p) => p.slot === 'skirt');
  const surf = new Field([girdle, ...skirt], 0.03);
  const th = Math.PI - 0.62;                      // her right front hip
  const at = (y, off) => { const r = surf.radial(y, th, 0, -0.02, 0.02, 0.16) + off; return [Math.cos(th) * r, y, -0.02 + Math.sin(th) * r]; };
  const strap = emptyPart('keystrap', { trim: true }), keys = emptyPart('keys', { trim: true });
  const jP = J('pelvis');
  const rigid = () => ({ j: [jP, 0, 0, 0], w: [1, 0, 0, 0] });
  const ctl = [at(1.15, 0.004), at(1.1, 0.006), at(1.04, 0.009), at(0.985, 0.012)];
  strapAlong(strap, surf, surf, ctl, { width: 0.024, margin: 0.007, segs: 10, cols: 2, rect: trim.rect('strap'), tile: 0.2, crown: 0.0012, rigid });
  // the buckle on it, 3 cm under the belt
  const c = at(1.05, 0.0125);
  const out = V.norm([Math.cos(th), 0, Math.sin(th)]), across = V.norm(V.cross([0, 1, 0], out));
  tubeInto(strap, roundRect(c, across, [0, 1, 0], 0.0165, 0.012, 0.0035, 1), 0.0019, { sides: 4, closed: true, rect: trim.rect('brass'), joint: jP });
  tubeInto(strap, [V.add(c, V.mul(across, -0.0165)), V.add(c, V.mul(out, 0.0013)), V.add(c, V.mul(across, 0.0165))], 0.0015, { sides: 4, rect: trim.rect('brass'), joint: jP });
  tubeInto(strap, [V.add(c, V.mul(out, 0.0016)), V.add(V.add(c, [0, -0.013, 0]), V.mul(out, 0.0024))], 0.0012, { sides: 4, rect: trim.rect('brass'), joint: jP });
  boxInto(strap, V.add(at(1.025, 0.0125), [0, 0, 0]), [0.0145, 0.005, 0.0016], [across, [0, 1, 0], out], trim.rect('strapB'), jP);
  // the ring and the keys
  const rc = V.add(at(0.968, 0.016), [0, 0, 0]);
  const ring = [];
  for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; ring.push(V.add(rc, V.add(V.mul(across, Math.cos(a) * 0.017), [0, Math.sin(a) * 0.017, 0]))); }
  tubeInto(keys, ring, 0.0016, { sides: 4, closed: true, rect: trim.rect('brass'), joint: jP });
  for (const [dx, ang, len] of [[-0.009, -0.25, 0.062], [0.002, 0.05, 0.072], [0.011, 0.3, 0.055]]) {
    const top = V.add(rc, V.add(V.mul(across, dx), [0, -0.017, 0]));
    const dir = V.norm(V.add(V.mul(across, Math.sin(ang)), [0, -Math.cos(ang), 0]));
    const bow = V.add(top, V.mul(dir, 0.008));
    const bowRing = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; bowRing.push(V.add(bow, V.add(V.mul(across, Math.cos(a) * 0.0065), V.mul(dir, Math.sin(a) * 0.0065)))); }
    tubeInto(keys, bowRing, 0.0014, { sides: 3, closed: true, rect: trim.rect('brass'), joint: jP });
    const shaftA = V.add(bow, V.mul(dir, 0.0065)), shaftB = V.add(bow, V.mul(dir, len));
    tubeInto(keys, [shaftA, shaftB], 0.0019, { sides: 4, rect: trim.rect('brass'), joint: jP });
    boxInto(keys, V.add(V.add(shaftB, V.mul(dir, -0.007)), V.mul(across, 0.0045)), [0.0045, 0.006, 0.0012], [across, dir, out], trim.rect('brass'), jP);
  }
  recomputeNormals(strap); recomputeNormals(keys);
  for (const p of [strap, keys]) for (let i = 0; i < p.jnt.length / 4; i++) { p.jnt.splice(i * 4, 4, jP, 0, 0, 0); p.wgt.splice(i * 4, 4, 1, 0, 0, 0); }
  return [strap, keys];
}

/* ------------------------------------------------------------------ the set */

/**
 * Ansel's dress: { parts (armory Parts on `doc`'s skeleton, uv on her sheet), jointNames (that skeleton's joint names, by
 * index), tex { base, normal, orm } (WebP), D (texels per bind metre), trimV, detailRep, slots }.
 */
export async function matronOutfit() {
  const saved = {};
  for (const k of Object.keys(COL_ANSEL)) saved[k] = COL[k];
  Object.assign(COL, COL_ANSEL);
  try {
    const base = await panBase({
      ubcBody: true, cut: 'long', sleeves: true, harness: true, armKit: false, keyhole: false, trim: anselTrim,
      skirt: { yHem: ROBE_HEM, hem: raggedHem, rows: 12, flare: 0.12, colsPer: 19 },
      under: { yTop: ROBE_HEM + 0.05, yHem: ROBE_HEM - 0.065, rows: 2 },
    });
    // what an archer and a raker carry is not hers
    const drop = new Set(['tab', 'sling', 'slider']);
    const parts = base.parts.filter((p) => !drop.has(p.slot));
    const [vest, band] = robeVest(base, parts);
    parts.push(vest, band);
    parts.push(...guildChain(base, parts));
    parts.push(...keyStrap(base, parts));
    const clothSlots = new Set(['underyoke', 'smock', 'skirt', 'under', 'sleeves', 'trousers', 'boots', 'vest']);
    const sheet = parts.filter((p) => clothSlots.has(p.slot));
    const layout = packAtlas(sheet, { W: base.W, H: base.H, pad: 3, trimH: base.TRIM_H });
    const SRC = srcRoot();
    const srcNormal = await loadRaw(path.join(MCO_DIR(SRC), 'T_Peasant_Normal.png'), 1024);
    const tex = await paintAtlas(parts, layout, { painters: ANSEL_PAINTERS, srcNormal, trim: base.trim, salt: [237, 234, 226], curv: { crease: 1, ridge: 0.75 }, q: { base: 95, normal: 88, orm: 84 } });
    for (const p of parts) if (p.uvNew) { p.uv = p.uvNew; delete p.uvNew; }
    for (const p of parts) if (p.idx.length) recomputeNormals(p);
    const jointNames = base.doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());
    return {
      parts: parts.filter((p) => p.idx.length), jointNames, tex, D: layout.D, trimV: 1 - base.TRIM_H / base.H,
      // the shader's tile: the same 2.6 cm a thread pattern repeats at on Brea (outfit-pan-1.mjs build)
      detailRep: +((base.W / layout.D) / 0.026).toFixed(1),
      slots: [...new Set(parts.map((p) => p.slot))],
      hip: jointPos(base.doc, 'pelvis'),
      // (M1.5b round 2: where the sash's knot pivots, so the person build can hang its tails on a chain of their own)
      swing: jointNames.includes('sash_swing') ? jointPos(base.doc, 'sash_swing') : null,
    };
  } finally {
    Object.assign(COL, saved);
  }
}
