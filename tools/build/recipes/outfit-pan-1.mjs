/**
 * CALIMA — recipe: Brea's default outfit, Pan Whites I — "Raker's Whites"
 * (hero-body W0b; armory from W1 day 1; bible §3.9, §3.4, §4.2; plan §4.1
 * "Brea outfit variant (merged) ≤ 17.5 k, 1 draw", ≤ 0.8 MB per set).
 *
 * OUTPUT public/models/hero/outfit-pan-1.glb — ONE skinned mesh on the UBC
 * skeleton (+ dyn_sashEnd), one material on the 1024² `pan` atlas (512² normal
 * + ORM). `src/hero/outfit.js` binds it to Brea's bones BY NAME at equip time
 * and culls the body triangles whose three vertices carry this set's hide bit
 * (`extras.r5Outfit.hideBit`, written by brea.mjs into `_HIDEMASK` from
 * `panBindTriangles()`, which is why `assemble()` stays the MCO pieces as cut).
 *
 * W1 art pass (armory): the set is what every later armor variant inherits.
 *   Layers, inside out: undyed linen under-tunic (its hem and sleeves show), the
 *   orchil over-smock that HANGS from the bust instead of the source's corset
 *   (MCO yoke + lofted body + four skirt panels with slits), the lapilli girdle
 *   with its brass buckle, a linen sash under it knotted at the left hip, the
 *   sling strap from right shoulder to left hip, a salt pouch, wide basalt
 *   trousers tucked into esparto wraps with lapilli straps.
 *   Atlas: every island re-cut to uniform texel density and turned to the grain;
 *   linen slubs, seam grooves and stitches from the island edges, dye fade, salt
 *   tide lines, worn ridges; leather, brass, rope and palm each with their own
 *   normal / roughness / metal, and a detail class read by src/hero/clothShader.js.
 *
 * Sources: MCO "Modular Character Outfits – Fantasy" [Standard] (CC0) for the
 * yoke, sleeves, trouser and boot meshes and their fold normals; everything else
 * is procedural, project-original.
 */
import path from 'node:path';
import {
  ROOT, srcRoot, UBC_DIR, MCO_DIR, readGltf, cleanDoc, nodeByName, graft, addChain, jointIndex,
  newGeo, appendGeo, stripAlong, bun, hex, noise3, writeSkinned,
} from './lib/face.mjs';
import { CHAINS } from './brea.mjs';
import { Field, V, clamp, compact, conform, cutTris, emptyPart, mix, partFromPrim, recomputeNormals, sstep } from './armor/lib/part.mjs';
import { Trim, fbm, loadRaw, packAtlas, paintAtlas } from './armor/lib/atlas.mjs';
import { beltRing, boxInto, limbStrap, orientOut, ring, skirtPanels, smockBody, strapAlong } from './armor/lib/garment.mjs';
import { outfitDoc, writeOutfit } from './armor/lib/output.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/hero/outfit-pan-1.glb'];
const RECIPE = 'tools/build/recipes/outfit-pan-1.mjs';

/** Bit of `_HIDEMASK` this set owns (brea.mjs computes it against `panBindTriangles`). */
export const HIDE_BIT = 1;

const PIECES = [
  { part: 'Female_Peasant_Body', slot: 'smock' },
  { part: 'Female_Peasant_Arms', slot: 'sleeves' },
  { part: 'Female_Peasant_Legs', slot: 'trousers' },
  { part: 'Female_Peasant_Feet', slot: 'boots' },
];
/** Sleeves rolled to the elbow: nothing past |x| = SLEEVE_CUT (T-pose; elbow at 0.392). */
const SLEEVE_CUT = 0.412;

export const COL = {
  smock: hex('#6B3F73'), girdle: hex('#1C1B1E'), brass: hex('#B08A45'), linen: hex('#D9CFBA'),
  carmine: hex('#A3213A'), basalt: hex('#4A4A50'), esparto: hex('#B59A62'), lapilli: hex('#1C1B1E'),
  leatherBrown: hex('#5A3F2C'), palm: hex('#B7A06A'), celadon: hex('#8FB8A4'), salt: hex('#EDEAE2'),
};

/** The skeleton + grafted, cut pieces (shared by build() and panBindTriangles()). */
async function assemble() {
  const SRC = srcRoot();
  const doc = await readGltf(path.join(UBC_DIR(SRC), 'Superhero_Female_FullBody.gltf'));
  cleanDoc(doc);
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.dispose(); }
  const nodes = [];
  for (const { part, slot } of PIECES) {
    const p = await readGltf(path.join(MCO_DIR(SRC), `${part}.gltf`));
    cleanDoc(p);
    for (const n of graft(doc, p, part)) { n.setName(slot); n.setExtras({ slot }); nodes.push(n); }
  }
  // roll the sleeves: drop every triangle with a vertex past the cut
  const sleeves = nodes.find((n) => n.getName() === 'sleeves').getMesh().listPrimitives()[0];
  {
    const P = sleeves.getAttribute('POSITION'), p = [0, 0, 0];
    const far = new Uint8Array(P.getCount());
    for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); far[i] = Math.abs(p[0]) > SLEEVE_CUT ? 1 : 0; }
    const idx = sleeves.getIndices().getArray();
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) if (!far[idx[t]] && !far[idx[t + 1]] && !far[idx[t + 2]]) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    sleeves.getIndices().setArray(new Uint32Array(keep));
  }
  return { doc, nodes, sleeves };
}

/** Bind-space triangles of the outfit (9 floats each): brea.mjs's hide-mask source. */
export async function panBindTriangles() {
  const { doc, nodes } = await assemble();
  const out = [];
  for (const n of nodes) for (const prim of n.getMesh().listPrimitives()) {
    const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), p = [0, 0, 0];
    for (let t = 0; t < idx.length; t++) { P.getElement(idx[t], p); out.push(p[0], p[1], p[2]); }
  }
  void doc;
  return new Float32Array(out);
}

/* ------------------------------------------------------------- painting */

const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const put = (o, c) => { o.r = c[0]; o.g = c[1]; o.b = c[2]; };
const over = (o, c, a) => { o.r += (c[0] - o.r) * a; o.g += (c[1] - o.g) * a; o.b += (c[2] - o.b) * a; };

/** Woven cloth: slubs along warp and weft, 3-D mottling continuous over seams. */
export function cloth(t, o, col, { slub = 0.1, mottle = 0.12, seed = 0, rough = 0.92 } = {}) {
  // slubs: single thick threads, short and thin, never bands (bands read as plaid)
  const a = noise3(t.x * 0.05, t.y * 0.9, 1.7 + seed), b = noise3(t.x * 0.9, t.y * 0.05, 9.1 + seed);
  const sa = sstep(0.79, 0.95, a), sb = sstep(0.79, 0.95, b);
  const fine = noise3(t.x * 0.7, t.y * 0.7, 4.4 + seed);
  const m = fbm(t.X * 6, t.Y * 6, t.Z * 6 + seed, 3);
  const k = 1 + slub * (sa + sb) * 0.55 - slub * 0.05 + slub * 0.5 * (fine - 0.5) + mottle * 2 * (m - 0.5);
  put(o, sc(col, k));
  o.rough = rough; o.metal = 0; o.det = 1;      // weave
  o.h += 0.0007 * (sa + sb);
}
/** A sewn edge: groove at the island's edge, a running stitch a little inside. */
export function seam(t, o, { thread = null, d0 = 3.4, per = 4.6, duty = 0.62, groove = 0.8, line2 = 0, a = 0.42, threads = true } = {}) {
  const e = t.d;
  if (e < 2.2) { const g = mix(groove, 1, e / 2.2); o.r *= g; o.g *= g; o.b *= g; o.h -= 0.0011 * (1 - e / 2.2); }
  if (!threads) return;
  // thread is a shade lighter than the cloth it holds, unless asked otherwise
  const th = thread || [o.r * 1.32 + 12, o.g * 1.32 + 12, o.b * 1.32 + 12];
  for (const dd of line2 ? [d0, d0 + line2] : [d0]) {
    const band = 1 - clamp(Math.abs(e - dd) / 0.85);
    if (band <= 0) continue;
    const ph = (t.x + 1.37 * t.y) / per, f = ph - Math.floor(ph);
    if (f < duty) { over(o, th, band * a); o.h += 0.0005 * band; } else { const q = 1 - 0.16 * band; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0003 * band; }
  }
}
/** Salt: tide lines on the shin, crust at the hems, dust up from the ground. */
export function salted(t, o, { hem = 0, tide = 1 } = {}) {
  const n = fbm(t.X * 11, t.Y * 3.5, t.Z * 11, 3);
  if (tide > 0 && t.Y < 0.72) {
    // the pans: two pale tide lines where brine dried on the cloth
    for (const [y0, w, a] of [[0.47, 0.012, 0.55], [0.555, 0.009, 0.32], [0.635, 0.008, 0.18]]) {
      const yy = y0 + 0.028 * (fbm(t.X * 5, 3.3, t.Z * 5, 2) - 0.5);
      const line = 1 - clamp(Math.abs(t.Y - yy) / w);
      o.salt = Math.max(o.salt, line * a * tide * (0.6 + 0.8 * n));
    }
    const dust = sstep(0.62, 0.42, t.Y) * 0.34 * tide;
    const dc = [186, 176, 158];
    over(o, dc, dust * (0.4 + 0.6 * n));
  }
  if (hem > 0) {
    const h = 1 - clamp(t.d / 26);
    o.salt = Math.max(o.salt, h * h * hem * (0.45 + n));
  }
}

function strawCell(t, o, col, { strand = 7, rough = 0.88 } = {}) {
  const a = (t.x + t.y) / strand, b = (t.x - t.y) / strand;
  const over1 = (Math.floor(a) + Math.floor(b)) % 2 === 0;
  const f = over1 ? a - Math.floor(a) : b - Math.floor(b);
  const round = Math.sin(f * Math.PI);
  const k = 0.72 + 0.42 * round;
  put(o, sc(col, k * (0.94 + 0.12 * fbm(t.ax * 0.12, t.ay * 0.12, 3.1))));
  o.h = 0.0016 * round; o.rough = rough; o.det = 0;
}

/** Atlas plan of the Pan set: every cell a variant may need is on the sheet from variant I. */
export function panTrim(W, H, trimH) {
  const T = new Trim(W, H, trimH);
  const leather = (t, o, base, { stitch = true, burn = [92, 70, 54], thread = [176, 150, 112] } = {}) => {
    const e = Math.min(t.y, t.h - 1 - t.y);
    const m = fbm(t.ax * 0.05, t.ay * 0.09, 5.3, 3), sc1 = fbm(t.ax * 0.3, t.ay * 0.9, 8.2, 2);
    put(o, sc(base, 0.86 + 0.34 * m));
    // scuffs running along the strap
    if (sc1 > 0.66) over(o, [86, 80, 76], (sc1 - 0.66) * 1.7);
    // the cut edge burnished pale, slightly rounded
    if (e < 3) { over(o, burn, (1 - e / 3) * 0.75); o.h = -0.0012 * (1 - e / 3); }
    if (stitch && t.h >= 24) {
      const band = 1 - clamp(Math.abs(e - 6.2) / 1.1);
      const f = ((t.x / 6) % 1);
      if (band > 0) {
        o.h -= 0.0005 * band;
        if (f < 0.6) { over(o, thread, band * 0.85); o.h += 0.0009 * band; } else { const q = 1 - 0.4 * band; o.r *= q; o.g *= q; o.b *= q; }
      }
    }
    o.rough = 0.56 + 0.2 * m; o.det = 0.33;
  };
  T.cell('girdle', 620, 46, (t, o) => {
    leather(t, o, [38, 36, 40]);
    // a tooled line down the middle of the belt, graduated: the Reckoner's own rule
    const mid = Math.abs(t.y - t.h / 2);
    if (mid < 1.3) { const q = 0.82; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0005; }
    if (mid < 5 && (t.x % 66) < 1.6) { const q = 0.84; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0004; }
  });
  T.cell('strap', 404, 24, (t, o) => leather(t, o, [58, 42, 30]));
  T.cell('strapB', 200, 22, (t, o) => leather(t, o, [34, 32, 35], { stitch: false }));
  T.cell('pouch', 110, 90, (t, o) => {
    leather(t, o, [70, 50, 36], { stitch: false });
    const e = Math.min(t.x, t.y, t.w - 1 - t.x, t.h - 1 - t.y);
    const band = 1 - clamp(Math.abs(e - 5.5) / 1.1);
    if (band > 0) { const f = ((t.x + t.y) / 6) % 1; if (f < 0.6) over(o, [190, 165, 122], band * 0.85); o.h -= 0.0004 * band; }
    if (e < 2.5) over(o, [116, 90, 66], (1 - e / 2.5) * 0.7);
  });
  T.cell('brass', 54, 54, (t, o) => {
    const m = fbm(t.ax * 0.11, t.ay * 0.11, 2.2, 3), f = fbm(t.ax * 0.5, t.ay * 0.5, 4.4, 2);
    put(o, sc(COL.brass, 0.9 + 0.5 * (m - 0.35)));
    if (m < 0.38) over(o, [74, 92, 72], (0.38 - m) * 2.2);          // verdigris in the low spots
    o.metal = m < 0.32 ? 0.5 : 1; o.rough = 0.30 + 0.34 * f; o.det = 0;
  });
  T.cell('linen', 96, 90, (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; t.d = 99;
    cloth(t, o, COL.linen, { slub: 0.09, mottle: 0.1, seed: 4 });
  });
  T.cell('carmine', 54, 54, (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; t.d = 99;
    cloth(t, o, COL.carmine, { slub: 0.07, mottle: 0.1, seed: 7 });
  });
  T.cell('rope', 96, 30, (t, o) => {
    // three twisted strands
    const f = (t.x * 0.28 + t.y * 0.42) % 1, r = Math.sin(((f + 1) % 1) * Math.PI);
    put(o, sc(COL.esparto, 0.62 + 0.52 * r));
    o.h = 0.0018 * r; o.rough = 0.9; o.det = 0;
  });
  // cells Pan II / III map into (the sheet is shared by the three variants)
  T.cell('palm', 110, 90, (t, o) => strawCell(t, o, COL.palm));
  T.cell('capelet', 150, 90, (t, o) => {
    // Orchil Deep, a guild band of undyed linen at the hem (v -> 1), brass-thread stitched
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; t.d = 99;
    cloth(t, o, hex('#5A2E66'), { slub: 0.1, mottle: 0.1, seed: 11 });
    const band = t.v > 0.82;
    if (band) { cloth(t, o, sc(COL.linen, 0.94), { slub: 0.08, mottle: 0.06, seed: 12 }); }
    const e = Math.abs(t.v - 0.82);
    if (e < 0.018) { const q = 0.62; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0009; }
    const st = Math.abs(t.v - 0.78);
    if (st < 0.012 && ((t.x / 5) % 1) < 0.6) { over(o, [196, 160, 92], 0.85); o.h += 0.0006; }
    if (t.v > 0.965) { const q = 0.78; o.r *= q; o.g *= q; o.b *= q; }
  });
  T.cell('celadon', 110, 60, (t, o) => {
    // salvaged float ceramic: glaze pooled pale in the centre, darker to the edge, crazed
    const e = Math.min(t.x, t.y, t.w - 1 - t.x, t.h - 1 - t.y) / 26;
    const m = fbm(t.ax * 0.04, t.ay * 0.04, 6.6, 3);
    // glaze pools thick and dark at the lower rim of each scute, thin and pale over the crown
    put(o, sc(COL.celadon, 0.56 + 0.3 * clamp(e) + 0.2 * (m - 0.5)));
    const rim = sstep(0.66, 1, t.v);
    if (rim > 0) { const q = 1 - 0.55 * rim; o.r *= q; o.g *= q * 1.02; o.b *= q; }
    const craze = Math.abs(fbm(t.ax * 0.22, t.ay * 0.22, 9.9, 2) - 0.5);
    if (craze < 0.018) { const q = 0.72; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0005; }
    o.rough = 0.24 + 0.18 * m; o.metal = 0; o.det = 0; o.wear = 0.2;
  });
  T.cell('crust', 96, 60, (t, o) => {
    // stiffened hide under dried brine: a fine pale crust, grey leather only at the low spots
    const m = fbm(t.ax * 0.34, t.ay * 0.34, 3.3, 3), m2 = fbm(t.ax * 0.9, t.ay * 0.9, 8.3, 2);
    put(o, sc(COL.salt, 0.70 + 0.2 * m + 0.1 * m2));
    over(o, [104, 94, 80], sstep(0.46, 0.30, m) * 0.7);
    const e = Math.min(t.x, t.y, t.w - 1 - t.x, t.h - 1 - t.y);
    if (e < 4) { const q = 0.72 + 0.07 * e; o.r *= q; o.g *= q; o.b *= q; }
    o.h = 0.0035 * m; o.rough = 0.95; o.det = 0;
  });
  return T;
}

export const PAN_PAINTERS = {
  yoke(t, o) { smockPaint(t, o); },
  smockbody(t, o) {
    smockPaint(t, o);
    // long hanging folds, gathers at the belt
    const f1 = fbm(t.X * 19, t.Y * 2.4, t.Z * 19, 3), f2 = fbm(t.X * 58, t.Y * 3.4, t.Z * 58, 2);
    const near = sstep(1.2, 1.15, t.Y);
    o.h += 0.0075 * (f1 - 0.5) + 0.0045 * near * (f2 - 0.5);
    o.ao *= 1 - 0.34 * sstep(1.178, 1.148, t.Y);
    o.ao *= 1 - 0.16 * sstep(1.228, 1.241, t.Y);
  },
  skirt(t, o) {
    smockPaint(t, o);
    const f1 = fbm(t.X * 16, t.Y * 2.0, t.Z * 16, 3);
    o.h += 0.009 * (f1 - 0.5);
    o.ao *= 1 - 0.40 * sstep(1.05, 1.086, t.Y);
    salted(t, o, { hem: 0.55, tide: 0 });
    o.wear = 1.2;
  },
  under(t, o) {
    cloth(t, o, sc(COL.linen, 0.9), { slub: 0.1, mottle: 0.14, seed: 2 });
    seam(t, o);
    salted(t, o, { hem: 0.5, tide: 0 });
    o.ao *= 0.86;
  },
  sleeves(t, o) {
    cloth(t, o, COL.linen, { slub: 0.09, mottle: 0.09, seed: 5 });
    seam(t, o, { threads: false });
    // the shoulder, shaded under the smock's edge
    const ax = Math.abs(t.X);
    o.ao *= 0.76 + 0.24 * sstep(0.17, 0.22, ax);
    const sweat = sstep(0.21, 0.17, ax) * (t.Y < 1.40 ? 1 : 0);
    if (sweat > 0) over(o, [172, 158, 128], sweat * 0.4);
    o.wear = 0.7;
  },
  trousers(t, o) {
    cloth(t, o, COL.basalt, { slub: 0.12, mottle: 0.15, seed: 8, rough: 0.94 });
    o.det = 0.66;
    seam(t, o, { d0: 3.4, line2: 2.6, a: 0.34 });
    // knee patches, sewn on
    const side = t.X >= 0 ? 1 : -1;
    const kx = t.X - side * 0.111, ky = t.Y - 0.56;
    if (t.Z > -0.04) {
      const e = Math.max(Math.abs(kx) / 0.062, Math.abs(ky) / 0.08);
      if (e < 1) {
        put(o, sc([o.r, o.g, o.b], 0.82));
        o.h += 0.0012;
        const edge = 1 - clamp((1 - e) / 0.14);
        if (edge > 0.2 && edge < 0.72) { const f = ((t.x + t.y) / 4.6) % 1; if (f < 0.6) over(o, [118, 114, 108], 0.42); }
        if (edge >= 0.75) { const q = 0.78; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0012; }
      }
    }
    salted(t, o, { tide: 1 });
    o.wear = 1.1;
  },
  boots(t, o) {
    const side = t.X >= 0 ? 1 : -1;
    const cx = side * 0.111, cz = t.Y < 0.13 ? 0.0 : -0.042;
    const th = Math.atan2(t.Z - cz, t.X - cx);
    const n = fbm(t.X * 21, t.Y * 21, t.Z * 21, 3);
    if (t.Y > 0.075) {
      // plaited esparto wound up the shin: flat bands, each a fine herringbone
      const band = t.Y / 0.03 + th / (Math.PI * 2);
      const fb = band - Math.floor(band);
      const across = Math.sin(fb * Math.PI);                     // the band's crown
      const plait = Math.abs(((fb * 3.0 + (th * 5.2)) % 1 + 1) % 1 - 0.5) * 2;
      const k = (0.74 + 0.3 * across) * (0.88 + 0.22 * plait) * (0.93 + 0.18 * (n - 0.5));
      put(o, sc(COL.esparto, k));
      o.h = 0.0016 * across + 0.0005 * plait;
      if (fb < 0.07 || fb > 0.93) { const q = 0.7; o.r *= q; o.g *= q; o.b *= q; }
      o.rough = 0.9;
      // the top turn tucks over: a darker lip
      o.ao *= 1 - 0.3 * sstep(0.435, 0.455, t.Y);
    } else {
      // felt and rope sole, foot wraps of leather
      const f = ((t.X * 42 + t.Z * 90) % 1 + 1) % 1, rnd = Math.sin(f * Math.PI);
      if (t.Y < 0.024) { put(o, sc(COL.esparto, (0.5 + 0.36 * rnd))); o.h = 0.002 * rnd; o.rough = 0.95; } else { put(o, sc(COL.leatherBrown, 0.72 + 0.5 * n)); o.rough = 0.62; o.det = 0.33; }
    }
    seam(t, o, { threads: false });
    // salt and dust rising from the ground
    const dust = sstep(0.26, 0.0, t.Y);
    over(o, [176, 166, 148], dust * (0.14 + 0.42 * n));
    o.salt = Math.max(o.salt, sstep(0.10, 0.0, t.Y) * (0.1 + 0.55 * n));
    o.wear = 0.8;
  },
  default(t, o) { put(o, [200, 0, 200]); },
};
function smockPaint(t, o) {
  // sun-faded on the shoulders and chest top, deeper where the belt and folds hide it
  const up = clamp(t.ny * 0.5 + 0.5);
  const fade = sstep(1.18, 1.44, t.Y) * 0.22 + 0.14 * up * up;
  const c = [mix(COL.smock[0], 150, fade), mix(COL.smock[1], 112, fade), mix(COL.smock[2], 150, fade)];
  cloth(t, o, c, { slub: 0.11, mottle: 0.13, seed: 1 });
  // dye that took unevenly, in long soft clouds down the warp
  const d = fbm(t.X * 4.2, t.Y * 1.2, t.Z * 4.2 + 7, 2);
  const k = 0.88 + 0.26 * d; o.r *= k; o.g *= k; o.b *= k;
  // the MCO yoke is cut into many small islands: only the lofted panels get a sewn line
  seam(t, o, t.part.metricUV ? { d0: 3.6, line2: 2.8, a: 0.5 } : { threads: false, groove: 0.88 });
}

/* ------------------------------------------------------------ the pieces */

/** A copy of a part's cloud with each triangle's centroid added, so a coarse layer reads as a surface, not as points. */
function densified(part) {
  const q = { pos: part.pos.slice(), nrm: part.nrm.slice(), jnt: part.jnt.slice(), wgt: part.wgt.slice() };
  const { pos, nrm, idx, jnt, wgt } = part;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    for (let k = 0; k < 3; k++) { q.pos.push((pos[a * 3 + k] + pos[b * 3 + k] + pos[c * 3 + k]) / 3); q.nrm.push((nrm[a * 3 + k] + nrm[b * 3 + k] + nrm[c * 3 + k]) / 3); }
    for (let k = 0; k < 4; k++) { q.jnt.push(jnt[a * 4 + k]); q.wgt.push(wgt[a * 4 + k]); }
  }
  return q;
}

/** The body in bind space + its field (head and arms included). */
export async function bodyField() {
  const SRC = srcRoot();
  const d = await readGltf(path.join(UBC_DIR(SRC), 'Superhero_Female_FullBody.gltf'));
  cleanDoc(d);
  const prim = nodeByName(d, 'Superhero_Female').getMesh().listPrimitives()[0];
  const part = partFromPrim(prim, 'body');
  return { part, field: new Field([part], 0.04) };
}

const TRIM_H = 214;
const BELT_Y = 1.122;
export const KEEP_TORSO = (q) => Math.abs(q.x) < 0.3;

/** Everything of the set's base (shared by the variants): parts, trim, chains, joints. */
export async function panBase(opt = {}) {
  const { doc, nodes } = await assemble();
  const { part: bodyPart, field: body } = await bodyField();
  const prim = (slot) => nodes.find((n) => n.getName() === slot).getMesh().listPrimitives()[0];
  const J = (n) => jointIndex(doc, n);
  const joints = { pelvis: J('pelvis'), thigh_l: J('thigh_l'), thigh_r: J('thigh_r'), spine_01: J('spine_01'), spine_02: J('spine_02'), spine_03: J('spine_03'), calf_l: J('calf_l'), calf_r: J('calf_r') };

  // ---- the MCO pieces, re-cut and pushed out of THIS body
  const yoke = cutTris(partFromPrim(prim('smock'), 'yoke', { axis: [0, 1, 0], density: 1.12, nScale: 0.55 }), (cx, cy) => cy > 1.226);
  conform(yoke, body, { margin: () => 0.005 });
  recomputeNormals(yoke);
  const sleeves = compact(partFromPrim(prim('sleeves'), 'sleeves', { density: 0.85 }));
  sleeves.axis = [1, 0, 0];
  conform(sleeves, body, { margin: () => 0.0045 });
  recomputeNormals(sleeves);
  const trousers = partFromPrim(prim('trousers'), 'trousers', { density: 0.76 });
  conform(trousers, body, {
    margin: () => 0.005,
    field: (x, y) => 0.021 * sstep(1.0, 0.86, y) * (0.72 + 0.28 * sstep(0.8, 0.5, y)) * sstep(0.42, 0.5, y) + 0.008 * sstep(0.5, 0.42, y),
    smooth: 3,
  });
  recomputeNormals(trousers);
  const boots = partFromPrim(prim('boots'), 'boots', { density: 0.98 });
  conform(boots, body, {
    margin: () => 0.006,
    field: (x, y) => 0.014 * sstep(0.28, 0.45, y),
    smooth: 2,
  });
  recomputeNormals(boots);

  // ---- surfaces the lofts read
  const under = new Field([bodyPart, yoke, trousers], 0.04);
  const skinOf = new Field([bodyPart], 0.04);
  const W = 1024, H = 1024;
  const trim = (opt.trim || panTrim)(W, H, TRIM_H);
  const mk = (slot, extra = {}) => emptyPart(slot, extra);

  // the hanging body of the smock, from the yoke to the belt
  const sbody = smockBody(mk('smockbody'), under, skinOf, { yTop: 1.242, yBelt: 1.146, rBeltY: BELT_Y, rows: 6, keep: KEEP_TORSO, seed: 1, density: 1.12, fall: 0.5 });
  // the skirt, then the under-tunic inside it: four panels, four slits, offset from each other
  const slits = [-Math.PI / 2, 0.02, Math.PI / 2, Math.PI - 0.02];
  const hemS = opt.skirtHem || ((th, y0) => y0 + 0.016 * Math.pow(Math.abs(Math.sin(th)), 3));
  const skirt = skirtPanels(mk, under, joints, { slot: 'skirt', yTop: BELT_Y - 0.024, yHem: 0.748, off: 0.007, flare: 0.075, slits, rows: 7, colsPer: 16, ripA: 0.0085, seed: 3, density: 1.08, keep: KEEP_TORSO, hem: hemS, overlap: 0.055, ...opt.skirt });
  const skirtField = new Field(skirt, 0.04);
  const underY = opt.skirt?.yHem ?? 0.748;
  const undr = skirtPanels(mk, skirtField, joints, { slot: 'under', yTop: underY + 0.05, yHem: underY - 0.036, off: -0.034, flare: 0, slits: slits.map((a) => a + 0.45), rows: 2, colsPer: 10, ripA: 0, seed: 9, density: 0.7, hem: (th, y0) => y0 + 0.008 * Math.cos(3 * th), overlap: 0.3, floorY: underY + 0.03, ringDth: 0.12, ...opt.under });

  const clothField = new Field([bodyPart, densified(yoke), trousers, sbody, ...skirt], 0.04);

  // ---- the girdle: stiff leather at the waist, brass buckle, tongue end
  const beltY = BELT_Y, beltH = 0.058;
  const girdle = beltRing(mk('girdle', { trim: true }), under, skinOf, { y: beltY, h: beltH, off: 0.0125, rect: trim.rect('girdle'), keep: KEEP_TORSO, thick: 0.004, lip: 0.003 });
  // the linen sash under it: a band showing just below the belt
  const sashBand = beltRing(mk('sashband', { trim: true }), under, skinOf, { y: BELT_Y - 0.040, h: 0.03, off: 0.0115, cols: 48, rect: trim.rect('linen'), keep: KEEP_TORSO, thick: 0.003, lip: 0.002, tilt: 0.003 });
  // buckle: frame + bar + prong, rigid on spine_01, front and a touch to her left
  const fr = new Field([girdle], 0.04).radial(beltY, Math.PI / 2 - 0.12, 0, -0.02, 0.03, 0.14) + 0.004;
  const bk = [Math.cos(Math.PI / 2 - 0.12) * fr, beltY, -0.02 + Math.sin(Math.PI / 2 - 0.12) * fr];
  const basis = [V.norm([Math.sin(Math.PI / 2 - 0.12), 0, -Math.cos(Math.PI / 2 - 0.12)]), [0, 1, 0], V.norm([Math.cos(Math.PI / 2 - 0.12), 0, Math.sin(Math.PI / 2 - 0.12)])];
  const buckle = mk('buckle', { trim: true });
  const brass = trim.rect('brass');
  const jB = joints.spine_01;
  const off = (dx, dy, dz) => V.add(V.add(V.add(bk, V.mul(basis[0], dx)), V.mul(basis[1], dy)), V.mul(basis[2], dz));
  boxInto(buckle, off(0, 0.031, 0), [0.031, 0.0045, 0.0045], basis, brass, jB);
  boxInto(buckle, off(0, -0.031, 0), [0.031, 0.0045, 0.0045], basis, brass, jB);
  boxInto(buckle, off(-0.027, 0, 0), [0.0045, 0.027, 0.0045], basis, brass, jB);
  boxInto(buckle, off(0.027, 0, 0), [0.0045, 0.027, 0.0045], basis, brass, jB);
  boxInto(buckle, off(0.002, 0, 0.003), [0.027, 0.003, 0.003], basis, brass, jB);
  // the belt's tongue end, hanging down past the buckle (a stiff strip)
  const tongue = mk('tongue', { trim: true });
  strapAlong(tongue, clothField, skinOf, [off(-0.03, 0.0, 0.002), off(-0.12, -0.012, 0.0), off(-0.155, -0.075, -0.004)], { width: 0.046, margin: 0.014, segs: 6, cols: 2, rect: trim.rect('girdle'), tile: 0.6, crown: 0.001 });

  // ---- the sling strap: right shoulder, across the chest to the left hip, and round the back
  const sling = mk('sling', { trim: true });
  const slingCtl = [
    [-0.105, 1.452, 0.04], [-0.06, 1.395, 0.09], [-0.012, 1.325, 0.105], [0.035, 1.25, 0.122], [0.082, 1.195, 0.106], [0.118, 1.15, 0.07],
  ];
  strapAlong(sling, clothField, skinOf, slingCtl, { width: 0.027, margin: 0.0075, segs: 18, cols: 2, rect: trim.rect('strap'), tile: 0.42 });
  const slingBack = [
    [-0.105, 1.452, 0.04], [-0.12, 1.478, -0.03], [-0.10, 1.43, -0.125], [-0.03, 1.30, -0.118], [0.06, 1.20, -0.09], [0.118, 1.145, -0.08],
  ];
  strapAlong(sling, clothField, skinOf, slingBack, { width: 0.027, margin: 0.0075, segs: 18, cols: 2, rect: trim.rect('strap'), tile: 0.42 });
  orientOut(sling, 0, -0.02, 1.2);

  // ---- the salt pouch at the left front hip, rigid on the pelvis, hung off the belt
  const pouchThA = Math.PI / 2 - 0.86;
  const POUCH_Y = BELT_Y - 0.098;
  const pr = ring(clothField, POUCH_Y, 64, { keep: KEEP_TORSO, dth: 0.14 })[Math.round(64 * ((pouchThA + Math.PI / 2) / (Math.PI * 2)))] + 0.026;
  const pc = [Math.cos(pouchThA) * pr, POUCH_Y, -0.02 + Math.sin(pouchThA) * pr];
  const pX = V.norm([Math.sin(pouchThA), 0, -Math.cos(pouchThA)]), pZ = V.norm([Math.cos(pouchThA), 0, Math.sin(pouchThA)]);
  const pouch = mk('pouch', { trim: true });
  const pPel = joints.pelvis;
  boxInto(pouch, pc, [0.038, 0.042, 0.016], [pX, [0, 1, 0], pZ], trim.rect('pouch'), pPel);
  boxInto(pouch, V.add(pc, [pZ[0] * 0.019, 0.02, pZ[2] * 0.019]), [0.042, 0.024, 0.004], [pX, V.norm([0, 1, -0.16]), pZ], trim.rect('pouch'), pPel);
  boxInto(pouch, V.add(pc, [pZ[0] * 0.025, 0.0, pZ[2] * 0.025]), [0.006, 0.006, 0.0025], [pX, [0, 1, 0], pZ], brass, pPel);
  boxInto(pouch, V.add(pc, [pX[0] * 0.024 - pZ[0] * 0.012, 0.062, pX[2] * 0.024 - pZ[2] * 0.012]), [0.0075, 0.03, 0.002], [pX, [0, 1, 0], pZ], trim.rect('strap'), pPel);
  boxInto(pouch, V.add(pc, [-pX[0] * 0.024 - pZ[0] * 0.012, 0.062, -pX[2] * 0.024 - pZ[2] * 0.012]), [0.0075, 0.03, 0.002], [pX, [0, 1, 0], pZ], trim.rect('strap'), pPel);
  recomputeNormals(pouch);
  pouch.nrmFaceted = true;

  // ---- sash knot + hanging end on dyn_sashEnd
  const sashJ = addChain(doc, CHAINS.sashEnd.names, CHAINS.sashEnd.points, CHAINS.sashEnd.parent);
  const pelvis = jointIndex(doc, 'pelvis');
  const g = newGeo();
  const k0 = CHAINS.sashEnd.points[0];
  const lin = trim.rect('linen');
  // the bones stay where brea.mjs put them; the cloth lies on the skirt that now covers them
  const outOnSkirt = (q) => {
    const th = Math.atan2(q[2] + 0.02, q[0]);
    const rr = Math.max(clothField.radial(q[1], th, 0, -0.02, 0.03, 0.14), Math.hypot(q[0], q[2] + 0.02)) + 0.009;
    return [Math.cos(th) * rr, q[1], -0.02 + Math.sin(th) * rr];
  };
  const sashPts = CHAINS.sashEnd.points.map(outOnSkirt);
  const k1 = sashPts[0];
  appendGeo(g, bun([k1[0], k1[1] + 0.022, k1[2]], { rx: 0.030, ry: 0.024, rz: 0.022, seg: 10, rings: 6, joint: pelvis, uvRect: lin, ridges: 2 }));
  const sashTh = Math.atan2(k1[2] + 0.02, k1[0]);
  appendGeo(g, stripAlong(sashPts, sashJ.slice(0, -1), { along: 8, width: (u) => 0.062 - 0.012 * u, side: [-Math.sin(sashTh), 0, Math.cos(sashTh)], uvFront: lin, uvBack: lin, thick: 0.004, curl: 0.05 }));
  void k0;
  const sash = mk('sash', { trim: true });
  Object.assign(sash, { pos: g.pos, nrm: g.nrm, uv: g.uv, jnt: g.jnt, wgt: g.wgt, idx: g.idx });

  // ---- rolled cuffs where the sleeves were cut: a fat linen roll, a thin carmine lining
  const cuffs = mk('cuffs', { trim: true });
  for (const sgn of [1, -1]) cuffRing(cuffs, sleeves, sgn, lin, trim.rect('carmine'), skinOf);
  recomputeNormals(cuffs);

  // ---- boots: lapilli straps over the esparto, a thin rope tie at the top
  const straps = mk('straps', { trim: true });
  const bootField = new Field([boots], 0.03);
  const strapR = trim.rect('strapB');
  for (const side of [1, -1]) {
    const cx = side * 0.111;
    for (const [y, cz, h] of [[0.405, -0.052, 0.022], [0.285, -0.056, 0.022], [0.15, -0.058, 0.024]]) {
      limbStrap(straps, bootField, skinOf, { cx, cz, y, h, off: 0.001, cols: 14, rect: strapR, tilt: 0.008, tiltTh: side > 0 ? -2.2 : -0.9, keep: (q) => Math.sign(q.x) === side, thick: 0.003 });
    }
  }
  recomputeNormals(straps);

  const parts = [yoke, sbody, ...skirt, ...undr, sleeves, trousers, boots, girdle, sashBand, buckle, tongue, sling, pouch, sash, cuffs, straps];
  return { doc, trim, parts, joints, body, bodyPart, clothField, skinOf, W, H, TRIM_H, J };
}

/** A rolled sleeve cuff: fat linen roll around the sleeve's cut edge, carmine lining inside its lip. */
function cuffRing(part, sleeves, sgn, uvLinen, uvCarmine, skinOf) {
  const { pos } = sleeves;
  const n = pos.length / 3;
  let cx = 0, cy = 0, cz = 0, m = 0;
  for (let i = 0; i < n; i++) if (Math.sign(pos[i * 3]) === sgn && Math.abs(pos[i * 3]) > SLEEVE_CUT - 0.02) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; m++; }
  cx /= m; cy /= m; cz /= m;
  const SEG = 16;
  const radAt = new Float64Array(SEG + 1);
  for (let i = 0; i < n; i++) {
    if (Math.sign(pos[i * 3]) !== sgn || Math.abs(pos[i * 3]) < SLEEVE_CUT - 0.03) continue;
    const a = Math.atan2(pos[i * 3 + 2] - cz, pos[i * 3 + 1] - cy);
    const k = Math.round((a + Math.PI) / (Math.PI * 2) * SEG) % SEG;
    radAt[k] = Math.max(radAt[k], Math.hypot(pos[i * 3 + 1] - cy, pos[i * 3 + 2] - cz));
  }
  for (let k = 0; k < SEG; k++) if (!radAt[k]) radAt[k] = radAt[(k + 1) % SEG] || radAt[(k + SEG - 1) % SEG] || 0.05;
  radAt[SEG] = radAt[0];
  const profile = [[-0.022, 0.002, 'l'], [-0.016, 0.0085, 'l'], [-0.004, 0.0125, 'l'], [0.008, 0.0105, 'l'], [0.0115, 0.004, 'c'], [0.0085, -0.002, 'c']];
  const base = part.pos.length / 3;
  for (let r = 0; r < profile.length; r++) {
    const [dx, dr, m2] = profile[r];
    const rect = m2 === 'l' ? uvLinen : uvCarmine;
    for (let k = 0; k <= SEG; k++) {
      const a = -Math.PI + (k / SEG) * Math.PI * 2;
      const rad = radAt[k % SEG] + dr;
      const p = [cx + sgn * dx, cy + Math.cos(a) * rad * 0, cz];
      p[1] = cy + Math.sin(a) * 0 + Math.cos(a) * 0;
      p[1] = cy + Math.cos(a + Math.PI / 2) * 0;
      // bearing a measured (z, y) as above
      p[2] = cz + Math.sin(a) * rad; p[1] = cy + Math.cos(a) * rad;
      const s = skinOf.skin(cx - sgn * 0.015, cy, cz, 3);
      part.pos.push(...p); part.nrm.push(0, 1, 0);
      part.uv.push(rect[0] + rect[2] * (k / SEG), rect[1] + rect[3] * (r / (profile.length - 1)));
      part.jnt.push(...s.j); part.wgt.push(...s.w);
    }
  }
  const cc = SEG + 1;
  for (let r = 0; r < profile.length - 1; r++) for (let k = 0; k < SEG; k++) {
    const a = base + r * cc + k, b = a + 1, c = a + cc, d = c + 1;
    if (sgn > 0) part.idx.push(a, b, c, b, d, c); else part.idx.push(a, c, b, b, c, d);
  }
}

/** Pack + paint the Pan atlas once (variants II / III reuse this layout and sheet). */
export async function panLayout(parts, trim, W, H) {
  return packAtlas(parts, { W, H, pad: 3, trimH: TRIM_H });
}

export const PAN_SET = { set: 'pan', hideBit: HIDE_BIT, chains: ['dyn_sashEnd'] };

export async function build({ out = ROOT } = {}) {
  const base = await panBase();
  const { doc, parts, trim, W, H } = base;
  const layout = await panLayout(parts, trim, W, H);
  const SRC = srcRoot();
  const srcNormal = await loadRaw(path.join(MCO_DIR(SRC), 'T_Peasant_Normal.png'), 1024);
  const tex = await paintAtlas(parts, layout, {
    painters: PAN_PAINTERS, srcNormal, trim, salt: COL.salt, curv: { crease: 1, ridge: 0.7 }, q: { base: 95, normal: 88, orm: 84 },
  });
  void noise3;
  const { node, material } = outfitDoc(doc, parts, { name: 'Outfit_Pan_1', matName: 'MI_Pan_1', tex, texPrefix: 'pan' });
  void node; void material;
  const file = path.join(out, OUTPUTS[0]);
  return writeOutfit(doc, file, {
    recipe: RECIPE, sources: ['mco-fantasy-standard', 'ubc-standard', 'brea-generated'], licence: 'CC0-1.0',
    r5Outfit: {
      ...PAN_SET, variant: 'pan-1', name: "Pan Whites I — Raker's Whites", density: +layout.D.toFixed(1), detailRep: +((W / layout.D) / 0.026).toFixed(1),
      pieces: ['yoke', 'smockbody', 'skirt', 'under', 'sleeves', 'trousers', 'boots', 'girdle', 'sashband', 'buckle', 'tongue', 'sling', 'pouch', 'sash', 'cuffs', 'straps'],
    },
  });
}
