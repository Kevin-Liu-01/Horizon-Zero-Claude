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
 *   Layers, inside out: the undyed linen under-tunic (its stand collar in the neck
 *   opening, its hem below the skirt, its sleeves), then the orchil over-smock: a
 *   loose T-cut lofted from what the cloth would touch (armor/lib/smock.mjs), hanging
 *   from the bust with no cup or under-bust ledge in the mesh, a bound keyhole neck
 *   tied with a linen cord, bound armholes, gathered into the belt, four skirt panels
 *   with slits and a turned hem. Over it the lapilli girdle (a round-barred brass
 *   buckle, a keeper, a pierced tongue), a creased linen sash knotted at the left hip,
 *   the sling strap with its brass slider, a soft salt pouch with a flap and a bronze
 *   toggle; wide basalt trousers tucked into plaited esparto wound up the shin.
 *   Atlas: slubbed threads along warp and weft, fold shading and pinch lines baked
 *   with the folds' normals, turned hems and fine tone-on-tone stitching on real seams
 *   only, dye fade, salt that dries at hems and tide lines; leather, brass, rope and
 *   palm each with their own normal / roughness / metal, and a detail class read by
 *   src/hero/clothShader.js.
 *
 * Sources: MCO "Modular Character Outfits – Fantasy" [Standard] (CC0) for the
 * under-collar, sleeve, trouser and boot meshes and their fold normals; everything
 * else is procedural, project-original.
 */
import path from 'node:path';
import {
  ROOT, srcRoot, UBC_DIR, MCO_DIR, readGltf, cleanDoc, nodeByName, graft, addChain, jointIndex,
  newGeo, appendGeo, stripAlong, bun, hex, noise3, jointPos,
} from './lib/face.mjs';
import { CHAINS } from './brea.mjs';
import { Field, V, clamp, collapseShort, compact, conform, cutTris, emptyPart, mix, partFromPrim, recomputeNormals, smoothSkin, sstep } from './armor/lib/part.mjs';
import { Trim, fbm, loadRaw, packAtlas, paintAtlas } from './armor/lib/atlas.mjs';
import { TAU, beltRing, boxInto, limbStrap, orientOut, ring, ripple, skirtPanels, strapAlong } from './armor/lib/garment.mjs';
import { bindingOn, draftSmock, drapeTable, openEdges, radialTable, roundRect, softSheet, tableAt, tubeInto } from './armor/lib/smock.mjs';
import { addSocketJoint, outfitDoc, writeOutfit } from './armor/lib/output.mjs';
import { romFit } from './armor/lib/romfit.mjs';
import { sashKnotTied, sashTail } from './armor/lib/sash.mjs';
import { bakeVertexAO } from './armor/lib/vertexao.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/hero/outfit-pan-1.glb'];
const RECIPE = 'tools/build/recipes/outfit-pan-1.mjs';

/**
 * The sash tails' hang (fix round 1): the joint, and (filled by panBase) the knot and the left hip joint in bind space.
 * Written into `extras.r5Outfit.sashSwing`; src/hero/outfit.js poses the joint (SashSwing).
 */
export const SASH_SWING = { joint: 'sash_swing', parent: 'pelvis', thighShare: 0.25, knot: null, hip: null };

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

/** Woven cloth: every thread its own shade along warp and weft, slubs, soft 3-D mottling continuous over seams. */
export function cloth(t, o, col, { slub = 0.1, mottle = 0.12, seed = 0, rough = 0.92, thread = 0.065 } = {}) {
  // single threads differ: 1 texel across, long along their run
  const wa = noise3(t.x * 0.62 + seed * 3.1, t.y * 0.016, 1.7), we = noise3(t.x * 0.016, t.y * 0.62 + seed * 3.1, 9.1);
  // slubs: a thread thick for a few cm, then thin again; never a band (bands read as plaid)
  const sa = sstep(0.72, 0.9, noise3(t.x * 0.41 + seed, t.y * 0.03, 4.4)), sb = sstep(0.74, 0.92, noise3(t.x * 0.035, t.y * 0.41 + seed, 6.2));
  const m = fbm(t.X * 6, t.Y * 6, t.Z * 6 + seed, 3);
  const k = 1 + thread * ((wa - 0.5) * 1.1 + (we - 0.5) * 0.55) + slub * (sa * 0.8 + sb * 0.32) + mottle * 2 * (m - 0.5);
  put(o, sc(col, k));
  o.rough = rough; o.metal = 0; o.det = 1;      // weave
  o.h += 0.0005 * (sa + sb);
}
/** A sewn edge: a soft groove at the island's edge, a fine running stitch a little inside, tone on tone. */
export function seam(t, o, { thread = null, d0 = 3.0, per = 3.4, duty = 0.58, groove = 0.86, line2 = 0, a = 0.26, threads = true } = {}) {
  const e = t.d;
  if (e < 1.8) { const g = mix(groove, 1, e / 1.8); o.r *= g; o.g *= g; o.b *= g; o.h -= 0.0008 * (1 - e / 1.8); }
  if (!threads) return;
  // thread is a shade lighter than the cloth it holds, unless asked otherwise
  const th = thread || [o.r * 1.22 + 8, o.g * 1.22 + 8, o.b * 1.22 + 8];
  for (const dd of line2 ? [d0, d0 + line2] : [d0]) {
    const band = 1 - clamp(Math.abs(e - dd) / 0.7);
    if (band <= 0) continue;
    const ph = (t.x + 1.37 * t.y) / per, f = ph - Math.floor(ph);
    if (f < duty) { over(o, th, band * a); o.h += 0.0003 * band; } else { const q = 1 - 0.1 * band; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0002 * band; }
  }
}
/** Salt: tide lines on the shin and dust up from the ground (world height), crust where cloth ends low. */
export function salted(t, o, { hem = 0, hemY = 0.8, tide = 1 } = {}) {
  const n = fbm(t.X * 11, t.Y * 3.5, t.Z * 11, 3);
  if (tide > 0 && t.Y < 0.72) {
    // the pans: pale tide lines where brine dried on the cloth, broken and soft
    for (const [y0, w, a] of [[0.47, 0.016, 0.34], [0.555, 0.012, 0.2], [0.635, 0.01, 0.1]]) {
      const yy = y0 + 0.032 * (fbm(t.X * 5, 3.3, t.Z * 5, 2) - 0.5);
      const line = 1 - clamp(Math.abs(t.Y - yy) / w);
      o.salt = Math.max(o.salt, line * line * a * tide * (0.35 + 1.1 * n));
    }
    const dust = sstep(0.62, 0.42, t.Y) * 0.3 * tide;
    over(o, [176, 168, 150], dust * (0.3 + 0.7 * n));
  }
  if (hem > 0 && t.Y < hemY) {
    const k = sstep(hemY, hemY - 0.07, t.Y);
    const near = 1 - clamp(t.d / 14);
    o.salt = Math.max(o.salt, (k * 0.55 + near * near * 0.5) * hem * sstep(0.3, 0.72, n));
  }
}

/** Sharp in the valley, round on the crest: how cloth folds. 0 in a pinch, 1 on a crest. */
const fold01 = (n) => Math.abs(2 * n - 1);

/**
 * Folds hanging from a gathered line: tight at the belt, merging into a few deep ones low down. Armory W1: each
 * layer keeps ONE bearing frequency (a fold hangs straight down); it used to scale the bearing by height, which
 * fanned every fold out sideways from the +x side, so the skirt's folds ran diagonally. Now the fine gathers fade
 * with depth and the few deep folds, there from the belt down, take over.
 */
export function hangFolds(t, { belt = 1.1, hem = 0.75, seed = 0 } = {}) {
  const th = Math.atan2(t.Z + 0.02, t.X);
  const d = clamp((belt - t.Y) / (belt - hem));
  const wob = 0.05 * (noise3(th * 3.1 + seed, t.Y * 4.0, 3.7) - 0.5);
  const deep = fold01(noise3((th + wob) * 3.4, t.Y * 0.55, 1.3 + seed));
  const mid = fold01(noise3((th + wob * 1.5) * 7.4, t.Y * 0.9, 5.1 + seed));
  const fine = fold01(noise3((th + wob * 2.2) * 16, t.Y * 1.6, 8.7 + seed));
  return deep * (0.42 + 0.36 * d) + mid * (0.36 - 0.14 * d) + fine * (0.22 - 0.19 * d) + 0.04 * d;
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

/** Oiled strap leather: grain, scuffs along the run, a burnished cut edge, an edge stitch tone on tone. */
function leatherStrap(t, o, base, { stitch = true, burn = [104, 84, 64], thread = [132, 112, 86], eS = 4.2, per = 4.4 } = {}) {
  const e = Math.min(t.y, t.h - 1 - t.y);
  const m = fbm(t.ax * 0.05, t.ay * 0.09, 5.3, 3), sc1 = fbm(t.ax * 0.22, t.ay * 0.9, 8.2, 2), g = noise3(t.ax * 0.6, t.ay * 0.6, 2.2);
  put(o, sc(base, 0.84 + 0.36 * m + 0.1 * (g - 0.5)));
  // scuffs along the strap, a little paler and duller
  const sf = sstep(0.62, 0.8, sc1);
  if (sf > 0) over(o, [84, 74, 66], sf * 0.45);
  // the cut edge burnished pale, slightly rounded
  if (e < 2.4) { over(o, burn, (1 - e / 2.4) * 0.62); o.h = -0.001 * (1 - e / 2.4); }
  if (stitch && t.h >= 20) {
    const band = 1 - clamp(Math.abs(e - eS) / 0.8);
    const f = ((t.x / per) % 1);
    if (band > 0) {
      o.h -= 0.0003 * band;
      if (f < 0.55) { over(o, thread, band * 0.7); o.h += 0.0005 * band; } else { const q = 1 - 0.34 * band; o.r *= q; o.g *= q; o.b *= q; }
    }
  }
  o.rough = 0.46 + 0.22 * m + 0.2 * sf; o.det = 0.33;
}

/** Atlas plan of the Pan set: every cell a variant may need is on the sheet from variant I. */
export function panTrim(W, H, trimH) {
  const T = new Trim(W, H, trimH);
  const LAP = [40, 36, 36];
  T.cell('girdle', 620, 46, (t, o) => {
    leatherStrap(t, o, LAP, { eS: 5 });
    // one tooled line down the middle of the belt, ticked: the Reckoner's own rule
    const mid = Math.abs(t.y - t.h / 2);
    if (mid < 1) { const q = 0.8; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0004; }
    if (mid < 4.5 && (t.x % 70) < 1.4) { const q = 0.82; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0003; }
  });
  T.cell('strap', 404, 24, (t, o) => leatherStrap(t, o, [62, 44, 31], { eS: 3.6, per: 4.8 }));
  T.cell('strapB', 200, 22, (t, o) => leatherStrap(t, o, [38, 35, 36], { stitch: false }));
  T.cell('pouch', 110, 90, (t, o) => {
    leatherStrap(t, o, [78, 56, 38], { stitch: false });
    const e = Math.min(t.x, t.y, t.w - 1 - t.x, t.h - 1 - t.y);
    const band = 1 - clamp(Math.abs(e - 4.6) / 0.9);
    if (band > 0) { const f = ((t.x + t.y) / 4.8) % 1; if (f < 0.55) over(o, [150, 126, 92], band * 0.75); else { const q = 1 - 0.3 * band; o.r *= q; o.g *= q; o.b *= q; } o.h -= 0.0003 * band; }
    if (e < 2) over(o, [116, 90, 66], (1 - e / 2) * 0.55);
    // handled pale in the middle, dark oil at the edges
    const c = 1 - clamp(Math.hypot(t.u - 0.5, t.v - 0.55) * 1.9);
    over(o, [108, 82, 58], c * 0.22);
  });
  T.cell('brass', 54, 54, (t, o) => {
    const m = fbm(t.ax * 0.11, t.ay * 0.11, 2.2, 3), f = fbm(t.ax * 0.5, t.ay * 0.5, 4.4, 2);
    put(o, sc(COL.brass, 0.9 + 0.55 * (m - 0.35)));
    if (m < 0.42) over(o, [62, 70, 56], (0.42 - m) * 2.4);          // patina in the low spots
    o.metal = m < 0.32 ? 0.45 : 1; o.rough = 0.26 + 0.34 * f; o.det = 0;
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
    if (st < 0.012 && ((t.x / 4) % 1) < 0.6) { over(o, [196, 160, 92], 0.75); o.h += 0.0005; }
    if (t.v > 0.965) { const q = 0.78; o.r *= q; o.g *= q; o.b *= q; }
  });
  T.cell('celadon', 110, 60, (t, o) => {
    // salvaged float ceramic: glaze pooled pale in the centre, darker to the edge, crazed
    const e = Math.min(t.x, t.y, t.w - 1 - t.x, t.h - 1 - t.y) / 26;
    const m = fbm(t.ax * 0.04, t.ay * 0.04, 6.6, 3);
    // glaze pools thick and dark at the lower rim of each scute, thin and pale over the crown
    // (armory W1: lighter: celadon is a pale jade glaze, and at 0.56 it read as dark bottle green)
    put(o, sc(COL.celadon, 0.8 + 0.22 * clamp(e) + 0.16 * (m - 0.5)));
    const rim = sstep(0.66, 1, t.v);
    if (rim > 0) { const q = 1 - 0.32 * rim; o.r *= q; o.g *= q * 1.02; o.b *= q; }
    const craze = Math.abs(fbm(t.ax * 0.22, t.ay * 0.22, 9.9, 2) - 0.5);
    if (craze < 0.012) { const q = 0.86; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0003; }
    o.rough = 0.24 + 0.18 * m; o.metal = 0; o.det = 0; o.wear = 0.2;
  });
  T.cell('crust', 96, 60, (t, o) => {
    // stiffened hide under dried brine: a fine pale crust, grey leather only at the low spots
    const m = fbm(t.ax * 0.34, t.ay * 0.34, 3.3, 3), m2 = fbm(t.ax * 0.9, t.ay * 0.9, 8.3, 2);
    put(o, sc(COL.salt, 0.72 + 0.16 * m + 0.08 * m2));
    over(o, [132, 120, 102], sstep(0.44, 0.26, m) * 0.5);
    const e = Math.min(t.x, t.y, t.w - 1 - t.x, t.h - 1 - t.y);
    if (e < 4) { const q = 0.72 + 0.07 * e; o.r *= q; o.g *= q; o.b *= q; }
    o.h = 0.0035 * m; o.rough = 0.95; o.det = 0;
  });
  T.cell('tongue', 240, 46, (t, o) => {
    leatherStrap(t, o, LAP, { eS: 5 });
    // the worn end of the belt: holes where the prong sits, the leather creased pale around the used one
    for (let i = 0; i < 5; i++) {
      const cx = 50 + i * 34, d = Math.hypot(t.x - cx, t.y - t.h / 2);
      if (d < 2.4) { const q = 0.16; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0012; o.rough = 0.9; } else if (d < 5 && i === 1) over(o, [96, 82, 68], (1 - (d - 2.4) / 2.6) * 0.5);
    }
  });
  T.cell('sash', 300, 44, (t, o) => {
    // linen wound round: long creases along the band, deep where it goes under the belt. Armory W1: it read flat and
    // pale in sun (one bright tone, shallow creases). Unbleached now, a shade under the sleeves; the creases deeper,
    // their valleys a little shaded; both long edges rolled and hemmed (a soft lip, a stitch inside it): no stripes,
    // the knot's tails run the cell's length
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; t.d = 99;
    cloth(t, o, [mix(COL.linen[0], 182, 0.32), mix(COL.linen[1], 166, 0.32), mix(COL.linen[2], 134, 0.32)], { slub: 0.07, mottle: 0.1, seed: 13, thread: 0.04 });
    const c = fold01(noise3(t.ax * 0.018, t.y * 0.16, 2.9)), c2 = fold01(noise3(t.ax * 0.04, t.y * 0.34, 7.3));
    const f = c * 0.7 + c2 * 0.3;
    o.h += 0.0032 * (f - 0.6);
    const q = 0.92 + 0.1 * sstep(0.16, 0.7, f); o.r *= q; o.g *= q; o.b *= q;
    o.ao *= 1 - 0.14 * sstep(0.3, 0.04, f);
    // the rolled hems: a round lip at each long edge, its fold line a touch darker, a running stitch inside it
    const e = Math.min(t.v, 1 - t.v);
    if (e < 0.1) {
      const lip = Math.sin(Math.PI * clamp(e / 0.08));
      o.h += 0.0008 * lip;
      if (e > 0.075 && e < 0.1) { o.r *= 0.92; o.g *= 0.92; o.b *= 0.92; }
      const st = Math.abs(e - 0.055);
      if (st < 0.014 && ((t.x / 3.6) % 1) < 0.55) over(o, [o.r * 1.12 + 6, o.g * 1.12 + 6, o.b * 1.1 + 4], 0.4);
    }
  });
  T.cell('bind', 240, 18, (t, o) => {
    // bias tape in the deep dye, one running stitch
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; t.d = 99;
    cloth(t, o, hex('#55305F'), { slub: 0.06, mottle: 0.08, seed: 14 });
    const b = 1 - clamp(Math.abs(t.y - 5) / 0.8);
    if (b > 0 && ((t.x / 3.6) % 1) < 0.58) over(o, [126, 96, 128], b * 0.6);
  });
  return T;
}

/** Sun-faded on the shoulders and chest top, deeper where the belt and folds hide it; dye that took unevenly. */
function smockDye(t, o, seed = 1) {
  const up = clamp(t.ny * 0.5 + 0.5);
  const sun = sstep(1.2, 1.46, t.Y) * 0.2 + 0.16 * up * up;
  const blot = fbm(t.X * 3.6, t.Y * 1.1, t.Z * 3.6 + 7, 3);
  const fade = sun + 0.16 * sstep(0.46, 0.68, blot);
  const c = [mix(COL.smock[0], 142, fade), mix(COL.smock[1], 108, fade), mix(COL.smock[2], 136, fade)];
  // (armory W1: the Museo Egizio linen beside it has slubs you can count and dye that took along the warp)
  cloth(t, o, c, { slub: 0.08, mottle: 0.12, seed, thread: 0.07 });
  const d = fbm(t.X * 4.2, t.Y * 1.2, t.Z * 4.2 + 17, 2);
  const k = 0.9 + 0.2 * d; o.r *= k; o.g *= k; o.b *= k;
  // the dye took unevenly along the warp: long faint streaks down the cloth, a little browner where it is thin
  const st = fbm(Math.atan2(t.Z + 0.02, t.X) * 38, t.Y * 1.6, 23.1 + seed, 2) - 0.5;
  const q = 1 + 0.12 * st; o.r *= q * (st < 0 ? 1.02 : 1); o.g *= q; o.b *= q * (st < 0 ? 0.96 : 1);
}

export const PAN_PAINTERS = {
  /** The bodice: one sheet from the neckline to the belt. */
  smock(t, o) {
    smockDye(t, o, 1);
    const front = t.Z > -0.02;
    // tension: drag lines fanning from the two high points of the chest
    let h = 0, sh = 1;
    if (front && t.Y > 1.17) {
      const ax = Math.abs(t.X) - 0.078, ay = t.Y - 1.325, rr = Math.hypot(ax, ay);
      const ang = Math.atan2(ay, ax);
      const f = fold01(noise3(ang * 2.6, 3.3, 7.7)), f2 = fold01(noise3(ang * 5.3, 6.1, 3.2));
      const w = sstep(0.035, 0.09, rr) * sstep(0.27, 0.13, rr);
      const q = (f * 0.7 + f2 * 0.3 - 0.55) * w;
      h += 0.0026 * q; sh *= 1 + 0.07 * Math.min(0, q * 1.6);
    }
    // the back pulls from the shoulder blades to the belt
    if (!front && t.Y > 1.17) {
      const f = fold01(noise3(t.X * 16, t.Y * 3.5, 4.1));
      const w = sstep(1.42, 1.3, t.Y);
      h += 0.0026 * (f - 0.55) * w; sh *= 1 + 0.06 * Math.min(0, (f - 0.45) * w * 1.5);
    }
    // gathers above the belt and the long drops under the bust: the SAME ripples the mesh is cut with
    // (draftSmock, seed 1: [5, 8] low, seed 4: [13, 17, 21] gathered), so the map's shade lies in the mesh's own
    // valleys (armory W1: the painted gathers had their own pattern and crossed the modelled ones), sharpened there
    const thS = Math.atan2(t.Z + 0.02, t.X);
    const gw = sstep(1.215, 1.16, t.Y);
    if (gw > 0) {
      const f = 0.5 + 0.5 * ripple(thS, 4, [13, 17, 21]);
      h += 0.0024 * gw * (f - 0.5); sh *= 1 - 0.3 * gw * sstep(0.45, 0.05, f);
    }
    const dw = sstep(1.29, 1.2, t.Y) * (1 - gw);
    if (dw > 0) { const f = 0.5 + 0.5 * ripple(thS, 1, [5, 8]); h += 0.0018 * dw * (f - 0.5); sh *= 1 - 0.14 * dw * sstep(0.4, 0.05, f); }
    // the fine crush of the gathers, a second scale the mesh cannot carry
    if (gw > 0) { const f2 = hangFolds(t, { belt: 1.0, hem: 1.3, seed: 2 }); h += 0.0016 * gw * (f2 - 0.6); }
    o.h += h;
    o.ao *= sh;
    // shaded under the belt's top edge, and where the arm presses
    o.ao *= 1 - 0.34 * sstep(1.172, 1.148, t.Y);
    if (Math.abs(t.X) > 0.11 && t.Y < 1.36 && t.Y > 1.2) o.ao *= 1 - 0.13 * sstep(0.11, 0.15, Math.abs(t.X));
    // the side seam under the arm, felled
    const sd = Math.min(Math.abs(Math.atan2(t.Z + 0.02, t.X)), Math.abs(Math.abs(Math.atan2(t.Z + 0.02, t.X)) - Math.PI)) * 0.14 * 400;
    if (t.Y < 1.34 && sd < 3.5) {
      const q = 1 - clamp(sd / 1.2); o.h -= 0.0007 * q; o.r *= 1 - 0.14 * q; o.g *= 1 - 0.14 * q; o.b *= 1 - 0.14 * q;
      const b = 1 - clamp(Math.abs(sd - 2.6) / 0.7);
      if (b > 0 && ((t.Y * 400 / 3.4) % 1) < 0.58) over(o, [o.r * 1.3 + 8, o.g * 1.3 + 8, o.b * 1.3 + 8], b * 0.3);
    }
    o.wear = 0.8;
  },
  skirt(t, o) {
    smockDye(t, o, 3);
    const f = hangFolds(t, { belt: 1.1, hem: 0.75, seed: 0 });
    // (the geometry carries the fold now: the map keeps its crease, sharpened in the valley, and the valley's shade)
    o.h += 0.0034 * (f - 0.58);
    o.ao *= 1 - 0.26 * sstep(0.42, 0.04, f);
    o.ao *= 1 - 0.42 * sstep(1.05, 1.088, t.Y);
    // the turned hem: a second layer 14 mm deep, its fold line and one row of stitches
    const hemD = t.Y - 0.748 - 0.016 * Math.pow(Math.abs(Math.sin(Math.atan2(t.Z + 0.02, t.X))), 3);
    if (hemD < 0.03) {
      const up = 1 - clamp(Math.abs(hemD - 0.016) / 0.002);
      o.h += 0.0009 * up;
      const q = hemD < 0.016 ? 1.05 : 1; o.r *= q; o.g *= q; o.b *= q;
      if (hemD > 0.016 && hemD < 0.019) o.ao *= 0.86;
      const b = 1 - clamp(Math.abs(hemD - 0.012) / 0.0016);
      if (b > 0 && ((t.x / 3.4) % 1) < 0.58) over(o, [o.r * 1.25 + 8, o.g * 1.25 + 8, o.b * 1.25 + 8], b * 0.32);
    }
    // the slit edges are turned too: stitched, never a comb
    if (t.Y > 0.79) seam(t, o, { d0: 3.2, a: 0.24, groove: 0.9 });
    salted(t, o, { hem: 0.5, hemY: 0.83, tide: 0 });
    // brine-darkened and dusty low down (soft blots, not bands: stretched across they crossed the folds as plaid)
    const n = fbm(t.X * 7, t.Y * 7, t.Z * 7, 3);
    over(o, [120, 100, 110], sstep(0.92, 0.76, t.Y) * 0.2 * (0.4 + n));
    o.wear = 1.1;
  },
  under(t, o) {
    cloth(t, o, sc(COL.linen, 0.92), { slub: 0.06, mottle: 0.14, seed: 2, thread: 0.05 });
    const f = hangFolds(t, { belt: 0.95, hem: 0.68, seed: 5 });
    o.h += 0.005 * (f - 0.55);
    o.ao *= 0.72 + 0.28 * sstep(0.775, 0.725, t.Y);
    o.ao *= 1 - 0.22 * sstep(0.4, 0.1, f);
    // frayed at the hem: threads worn pale, a little salt
    salted(t, o, { hem: 0.42, hemY: 0.76, tide: 0 });
    o.wear = 1.2;
  },
  /** The linen under-tunic's stand collar and yoke, seen in the neck opening. */
  underyoke(t, o) {
    cloth(t, o, sc(COL.linen, 0.97), { slub: 0.06, mottle: 0.1, seed: 16, thread: 0.05 });
    // shaded by the smock over it, brighter up the collar
    o.ao *= 0.62 + 0.38 * sstep(1.40, 1.49, t.Y);
    seam(t, o, { threads: false, groove: 0.9 });
    o.wear = 0.7; o.crease = 0.4;
  },
  sleeves(t, o) {
    // (armory W1: slubs and single threads quieter: at 0.09 the warp and weft bands crossed into a plaid on the arm)
    cloth(t, o, COL.linen, { slub: 0.05, mottle: 0.09, seed: 5, thread: 0.045 });
    // the shoulder, shaded under the smock's edge, sweat-yellowed
    const ax = Math.abs(t.X);
    o.ao *= 0.7 + 0.3 * sstep(0.165, 0.215, ax);
    const sweat = sstep(0.24, 0.17, ax);
    if (sweat > 0) over(o, [178, 164, 134], sweat * 0.34);
    // soft drag folds along the arm
    // long soft folds along the arm (never across it: crossed bands read as plaid)
    const ang = Math.atan2(t.Z + 0.055, t.Y - 1.414);
    const f = fold01(noise3(ax * 3.2, ang * 1.5, 3.1)), f2 = fold01(noise3(ax * 7, ang * 3.2, 6.4));
    o.h += 0.0026 * (f * 0.7 + f2 * 0.3 - 0.55); o.ao *= 1 - 0.1 * sstep(0.3, 0.06, f);
    o.wear = 0.6; o.crease = 0.35;
  },
  trousers(t, o) {
    cloth(t, o, COL.basalt, { slub: 0.1, mottle: 0.13, seed: 8, rough: 0.94, thread: 0.08 });
    o.det = 0.66;
    seam(t, o, { d0: 3.0, line2: 2.2, a: 0.2 });
    // knee patches, sewn on
    const side = t.X >= 0 ? 1 : -1;
    const kx = t.X - side * 0.111, ky = t.Y - 0.56;
    if (t.Z > -0.04) {
      const e = Math.max(Math.abs(kx) / 0.062, Math.abs(ky) / 0.08);
      if (e < 1) {
        put(o, sc([o.r, o.g, o.b], 0.86));
        o.h += 0.0009;
        const edge = 1 - clamp((1 - e) / 0.12);
        if (edge > 0.25 && edge < 0.7) { const f = ((t.x + t.y) / 3.6) % 1; if (f < 0.58) over(o, [112, 108, 102], 0.3); }
        if (edge >= 0.78) { const q = 0.82; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0008; }
        // the patch itself worn at the kneecap
        const w = 1 - clamp(Math.hypot(kx / 0.05, (ky - 0.01) / 0.05));
        if (w > 0) over(o, [116, 112, 108], w * w * 0.3);
      }
    }
    salted(t, o, { tide: 0.8 });
    o.wear = 0.9; o.crease = 0.6;
  },
  boots(t, o) {
    const side = t.X >= 0 ? 1 : -1;
    const cx = side * 0.111, cz = t.Y < 0.13 ? 0.0 : -0.042;
    const th = Math.atan2(t.Z - cz, t.X - cx);
    const n = fbm(t.X * 21, t.Y * 21, t.Z * 21, 3);
    if (t.Y > 0.075) {
      // A FLAT plait of esparto (a pleita) wound up the shin, each turn lapping the one below it. Armory W1: it read
      // as stacked rope, because its height was one round crown per turn. Now the band is flat across with rounded
      // edges, and its face is the plait: strands at 45 degrees from either edge meeting at the middle (chevrons),
      // each strand its own lot of grass, a groove between strands, the two halves' strands interleaved at the spine
      const turn = t.Y / 0.03 + th / TAU * side;
      const k = Math.floor(turn), fb = turn - k;
      const arc = th * 0.058 * side;
      const edge = sstep(0.0, 0.15, fb) * sstep(1.0, 0.86, fb);            // flat across, rounded at both edges
      const half = Math.abs(fb - 0.5) * 2, hs = fb < 0.5 ? 0 : 1;
      const sp = arc / 0.0105 + half * 1.15 + hs * 0.5;                    // strand coordinate (period 10.5 mm)
      const si = Math.floor(sp), sf = sp - si;
      const strand = Math.sin(Math.PI * sf);                               // each strand's own round crown
      const groove = sstep(0.16, 0.0, sf) + sstep(0.84, 1.0, sf);          // the shade between two strands
      const lot = 0.9 + 0.2 * noise3(si * 1.37 + hs * 9.1, k * 2.11, 3.3);  // grass from different cuts, strand by strand
      const spine = 1 - clamp(half / 0.07);                                 // where the halves interleave
      const v = (0.72 + 0.28 * edge) * (0.87 + 0.16 * strand) * (1 - 0.15 * groove) * (1 - 0.08 * spine) * lot * (0.95 + 0.1 * (n - 0.5));
      put(o, sc(COL.esparto, v));
      o.h = 0.0011 * edge + 0.00055 * strand * edge - 0.0002 * groove;
      // the turn above lies over this one's top edge
      if (fb > 0.9) { const q = mix(1, 0.62, (fb - 0.9) / 0.1); o.r *= q; o.g *= q; o.b *= q; }
      o.rough = 0.9;
      o.ao *= 1 - 0.3 * sstep(0.435, 0.455, t.Y);
    } else if (t.Y < 0.027) {
      // the rope sole: a coil seen from the side, twisted strands, whipped to the upper
      const coil = Math.sin(Math.PI * ((t.Y / 0.0075) % 1));
      const tw = Math.abs(Math.sin((th * 0.09 + t.Y) / 0.0045));
      put(o, sc([196, 178, 140], (0.62 + 0.34 * coil) * (0.84 + 0.2 * tw)));
      o.h = 0.0016 * coil; o.rough = 0.95; o.det = 0;
    } else {
      // the upper: dark oiled leather, scuffed; the whipping thread round the sole line
      put(o, sc(COL.leatherBrown, 0.68 + 0.42 * n)); o.rough = 0.56 + 0.2 * n; o.det = 0.33;
      if (t.Y < 0.036) {
        const s = ((th * 0.09 / 0.0125) % 1 + 1) % 1;
        if (s < 0.3) { over(o, [206, 196, 174], 0.72); o.h += 0.0006; }
      }
    }
    // salt and dust rising from the ground
    const dust = sstep(0.26, 0.0, t.Y);
    over(o, [176, 166, 148], dust * (0.1 + 0.34 * n));
    o.salt = Math.max(o.salt, sstep(0.08, 0.0, t.Y) * (0.05 + 0.4 * n));
    o.wear = 0.7; o.crease = 0.2;
  },
  default(t, o) { put(o, [200, 0, 200]); },
};

/* ------------------------------------------------------------ the pieces */

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
/** The skirt's modelled fold depth at the hem (m): crest to valley. */
const SKIRT_FOLD = 0.026;
const BELT_Y = 1.122;
export const KEEP_TORSO = (q) => Math.abs(q.x) < 0.3;
/** Where the smock's armholes are cut (bind space): just outside the sleeve at the shoulder joint. */
export const ARMHOLE = { y: 1.394, z: -0.055, ry: 0.086, rz: 0.069, xMin: 0.12 };

/** Everything of the set's base (shared by the variants): parts, trim, chains, joints. */
export async function panBase(opt = {}) {
  const { doc, nodes } = await assemble();
  const { part: bodyPart, field: body } = await bodyField();
  const prim = (slot) => nodes.find((n) => n.getName() === slot).getMesh().listPrimitives()[0];
  const J = (n) => jointIndex(doc, n);
  const joints = { pelvis: J('pelvis'), thigh_l: J('thigh_l'), thigh_r: J('thigh_r'), spine_01: J('spine_01'), spine_02: J('spine_02'), spine_03: J('spine_03'), calf_l: J('calf_l'), calf_r: J('calf_r') };

  // ---- the MCO pieces, re-cut and pushed out of THIS body
  // the bodice survives only as the linen under-tunic's stand collar and yoke: everything
  // the smock hangs over, kept so nothing shows the skin the body's hide bit culled
  // (fix round 1, judges: "a see-through window between the neck and the stand collar": the back of the collar stood
  // only above 1.53, and between it and the smock's back neckline (1.515) the skin the hide bit culls showed the world
  // through her. The collar's back now comes down to 1.492, under the smock's neckline)
  const underYoke = cutTris(partFromPrim(prim('smock'), 'underyoke', { axis: [0, 1, 0], density: 0.62, nScale: 0.3 }), (cx, cy, cz) => (cy > 1.462 && Math.abs(cx) < 0.1 && (cz > -0.07 || cy > 1.492)) || (cz > 0 && ((cy > 1.42 && Math.abs(cx) < 0.09) || (cy > 1.345 && Math.abs(cx) < 0.04))));
  conform(underYoke, body, { margin: () => 0.0085, smooth: 4 });
  recomputeNormals(underYoke);
  // the collar rides the trunk and eases onto the neck by height, not by whichever body vertex is nearest
  // (head turn and draw shear a nearest-vertex skin apart at these short edges)
  {
    const jN = J('neck_01'), jS = J('spine_03');
    for (let i = 0; i < underYoke.pos.length / 3; i++) {
      const w = 0.75 * sstep(1.45, 1.515, underYoke.pos[i * 3 + 1]);
      underYoke.jnt.splice(i * 4, 4, jS, jN, 0, 0); underYoke.wgt.splice(i * 4, 4, 1 - w, w, 0, 0);
    }
  }
  // (its inner end low under the arm, past the armhole's rim, lies under the smock where arm and ribs share the space: gone)
  const sleeves = cutTris(partFromPrim(prim('sleeves'), 'sleeves', { density: 0.85, nScale: 0.5 }), (cx, cy, cz) => !(Math.abs(cx) < 0.158 && cy < 1.35 && Math.hypot((cy - ARMHOLE.y) / ARMHOLE.ry, (cz - ARMHOLE.z) / ARMHOLE.rz) > 1.2));
  sleeves.axis = [1, 0, 0];
  conform(sleeves, body, { margin: () => 0.012 });
  recomputeNormals(sleeves);
  // the crease under the arm: never seen, and arm and ribs share that space in every arms-down pose
  collapseShort(sleeves, 0.004, null, (x, y) => (Math.abs(x) < 0.22 && y < 1.375 ? 0.023 : Math.abs(x) < 0.24 && y < 1.375 ? 0.016 : Math.abs(x) < 0.24 ? 0.012 : Math.abs(x) > 0.34 ? 0.0065 : 0.004));
  smoothSkin(sleeves, { its: 8, k: 0.5, filter: (x) => Math.abs(x) < 0.26 || Math.abs(x) > 0.33 });
  // the cap's top stays up under the rim when the arm drops: stretched over the deltoid, not swung away from it,
  // or the armhole shows a window through her (the hide bit culls the skin behind it)
  {
    const jCl = J('clavicle_l'), jCr = J('clavicle_r');
    for (let i = 0; i < sleeves.pos.length / 3; i++) {
      const x = sleeves.pos[i * 3], y = sleeves.pos[i * 3 + 1];
      const k = sstep(0.225, 0.165, Math.abs(x)) * sstep(1.38, 1.43, y) * 0.85;
      if (k <= 0) continue;
      const j = x > 0 ? jCl : jCr;
      const m = new Map();
      for (let c = 0; c < 4; c++) if (sleeves.wgt[i * 4 + c] > 0) m.set(sleeves.jnt[i * 4 + c], (m.get(sleeves.jnt[i * 4 + c]) || 0) + sleeves.wgt[i * 4 + c] * (1 - k));
      m.set(j, (m.get(j) || 0) + k);
      const top = [...m.entries()].sort((u, v) => v[1] - u[1] || u[0] - v[0]).slice(0, 4);
      const sum = top.reduce((a2, e) => a2 + e[1], 0);
      for (let c = 0; c < 4; c++) { sleeves.jnt[i * 4 + c] = top[c] ? top[c][0] : 0; sleeves.wgt[i * 4 + c] = top[c] ? top[c][1] / sum : 0; }
    }
    smoothSkin(sleeves, { its: 3, k: 0.5, filter: (x) => Math.abs(x) < 0.26 });
  }
  // (the inseam's top, between her thighs and under the skirt: never seen, always inside her at a stride)
  const trousers = cutTris(partFromPrim(prim('trousers'), 'trousers', { density: 0.76, nScale: 0.7 }), (cx, cy) => !((Math.abs(cx) < 0.04 && cy > 0.78 && cy < 0.96) || (Math.abs(cx) < 0.022 && cy > 0.69 && cy <= 0.78)));
  conform(trousers, body, {
    margin: () => 0.018,
    field: (x, y) => 0.021 * sstep(1.0, 0.86, y) * (0.72 + 0.28 * sstep(0.8, 0.5, y)) * sstep(0.42, 0.5, y) + 0.008 * sstep(0.5, 0.42, y) + 0.006 * sstep(0.42, 0.5, y) * sstep(0.66, 0.58, y),
    smooth: 3,
  });
  recomputeNormals(trousers);
  // the web the source stretches between the legs down to the knee goes: two legs, no skirt of triangles
  {
    const { pos, idx } = trousers, out = [];
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const mixed = Math.sign(pos[a * 3]) !== Math.sign(pos[b * 3]) || Math.sign(pos[b * 3]) !== Math.sign(pos[c * 3]);
      if (mixed && Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1]) < 0.82) continue;
      out.push(a, b, c);
    }
    trousers.idx = out;
  }
  // the inseam: the source splits left and right thigh across a 3 mm edge at the crotch, which a stride tears
  // open. Under the skirt nobody sees how it creases; so a wide blend, by place, across the middle of the legs
  {
    const jL = J('thigh_l'), jR = J('thigh_r'), jP = J('pelvis');
    for (let i = 0; i < trousers.pos.length / 3; i++) {
      const x = trousers.pos[i * 3], y = trousers.pos[i * 3 + 1];
      if (Math.abs(x) > 0.062 || y < 0.72 || y > 1.0) continue;
      const pel = 0.85 * sstep(0.8, 0.95, y), l = sstep(-0.062, 0.062, x) * (1 - pel), r = (1 - sstep(-0.062, 0.062, x)) * (1 - pel);
      trousers.jnt.splice(i * 4, 4, jP, jL, jR, 0); trousers.wgt.splice(i * 4, 4, pel, l, r, 0);
    }
  }
  collapseShort(trousers, 0.0042, null, (x, y, z) => (Math.abs(x) < 0.05 && y > 0.8 ? 0.016 : y > 0.44 && y < 0.62 ? (z < -0.1 ? 0.019 : 0.012) : 0.0042));
  // baggy cloth: the knee's blend runs a hand's width each way
  smoothSkin(trousers, { its: 12, k: 0.5 });
  smoothSkin(trousers, { its: 14, k: 0.5, filter: (x, y) => y > 0.42 && y < 0.68 });
  // ... and below the crotch each leg belongs to its own thigh, whatever diffused down the inner seam
  {
    const jL = J('thigh_l'), jR = J('thigh_r');
    for (let i = 0; i < trousers.pos.length / 3; i++) {
      const fade = sstep(0.82, 0.72, trousers.pos[i * 3 + 1]);
      if (fade <= 0) continue;
      const own = trousers.pos[i * 3] >= 0 ? jL : jR, other = own === jL ? jR : jL;
      let m = 0, slot = -1;
      for (let c = 0; c < 4; c++) { if (trousers.jnt[i * 4 + c] === other) { const q = trousers.wgt[i * 4 + c] * fade; m += q; trousers.wgt[i * 4 + c] -= q; } if (trousers.jnt[i * 4 + c] === own) slot = c; }
      if (m > 0) { if (slot >= 0) trousers.wgt[i * 4 + slot] += m; else for (let c = 0; c < 4; c++) if (trousers.wgt[i * 4 + c] === 0) { trousers.jnt[i * 4 + c] = own; trousers.wgt[i * 4 + c] = m; break; } }
    }
  }
  // (cut lower behind the knee: at a stride the calf folds shut against the hamstring there)
  const boots = cutTris(partFromPrim(prim('boots'), 'boots', { density: 1.15, nScale: 0.2 }), (cx, cy, cz) => !(cy > 0.452 && cz < -0.11));
  conform(boots, body, {
    margin: () => 0.016,
    field: (x, y) => 0.014 * sstep(0.28, 0.45, y) + 0.006 * sstep(0.06, 0.12, y) * sstep(0.26, 0.18, y),
    smooth: 2,
  });
  recomputeNormals(boots);
  // (the top at the back of the calf and the ankle's front fold shut with the joint: fewer points there)
  collapseShort(boots, 0.0085, null, (x, y, z) => ((y > 0.4 && z < -0.12) || (y > 0.11 && y < 0.2 && z > -0.03) ? 0.015 : 0.0085));
  smoothSkin(boots, { its: 30, k: 0.5 });

  // ---- surfaces the lofts read
  const under = new Field([bodyPart, trousers], 0.04);
  const skinOf = new Field([bodyPart], 0.04);
  const W = 1024, H = 1024;
  const trim = (opt.trim || panTrim)(W, H, TRIM_H);
  const mk = (slot, extra = {}) => emptyPart(slot, extra);

  // ---- the over-smock: what cloth does over the body, from the neckline to the belt
  const keepTorso = (x, y) => y < 1.535 && Math.abs(x) < (y > 1.32 ? 0.158 : 0.2);
  const raw = radialTable([bodyPart, underYoke, sleeves], { y0: 1.1, y1: 1.54, keep: keepTorso });
  const drape = drapeTable(raw, { apex: [1.26, 1.4], fall: 0.34, minEase: 0.007, margin: (y) => 0.009 + 0.004 * sstep(1.3, 1.22, y) + 0.003 * sstep(1.47, 1.51, y) });
  const neckY = (d) => mix(1.432, 1.504, sstep(0.0, 1.3, d)) + 0.011 * sstep(1.7, 3.0, d);
  const smock = draftSmock(mk('smock'), drape, skinOf, {
    rows: 21, cols: 60, neckY, yBelt: 1.128, seed: 1, density: 1.08,
    gather: (y, th) => tableAt(drape, BELT_Y, th) + 0.003 + 0.0075 * sstep(1.148, 1.178, y),
    slit: { yBottom: 1.356, half: 0.0105, round: 0.012 },
    armholes: [{ side: 1, ...ARMHOLE }, { side: -1, ...ARMHOLE }],
  });
  compact(smock);      // the armholes' cut quads leave vertices no triangle uses
  collapseShort(smock, 0.0095, (i) => smock.pos[i * 3 + 1] > 1.345 && Math.abs(smock.pos[i * 3]) > ARMHOLE.xMin && Math.abs(Math.hypot((smock.pos[i * 3 + 1] - ARMHOLE.y) / ARMHOLE.ry, (smock.pos[i * 3 + 2] - ARMHOLE.z) / ARMHOLE.rz) - 1) < 0.02, (x, y, z) => {
    if (Math.abs(x) < 0.135 || y < 1.2 || y > 1.345) return 0.0095;
    // the crease under the arm: the rim stays a curve (a point every 1.6 cm), the side behind it goes coarse
    return Math.abs(Math.hypot((y - ARMHOLE.y) / ARMHOLE.ry, (z - ARMHOLE.z) / ARMHOLE.rz) - 1) < 0.14 ? 0.012 : 0.022;
  });
  // the smock rides the trunk: the arm moves under its cap. Its skin diffused, so no edge crosses a step
  // (the clavicle lifts with a drawn arm: below the armpit the ribs carry the cloth, not the shoulder)
  {
    const jC = [J('clavicle_l'), J('clavicle_r')], jS3 = J('spine_03');
    for (let i = 0; i < smock.pos.length / 3; i++) {
      const y = smock.pos[i * 3 + 1], k = sstep(1.47, 1.37, y);
      if (k <= 0) continue;
      let moved = 0;
      for (let c = 0; c < 4; c++) if (jC.includes(smock.jnt[i * 4 + c]) || smock.jnt[i * 4 + c] === J('upperarm_l') || smock.jnt[i * 4 + c] === J('upperarm_r')) { const m = smock.wgt[i * 4 + c] * k; smock.wgt[i * 4 + c] -= m; moved += m; }
      if (moved > 0) { let s3 = -1, empty = -1; for (let c = 0; c < 4; c++) { if (smock.jnt[i * 4 + c] === jS3) s3 = c; if (smock.wgt[i * 4 + c] <= 1e-5 && empty < 0) empty = c; } if (s3 >= 0) smock.wgt[i * 4 + s3] += moved; else { const q = empty >= 0 ? empty : 3; smock.jnt[i * 4 + q] = jS3; smock.wgt[i * 4 + q] = moved; } }
    }
  }
  smoothSkin(smock, { its: 12, k: 0.5, drop: { [J('upperarm_l')]: J('clavicle_l'), [J('upperarm_r')]: J('clavicle_r'), [J('Head')]: J('neck_01') } });
  orientOut(smock, 0, -0.02, 1.25);
  // the cap stands proud of the sleeve round the armhole: the arm moves under it, never through it
  for (let i = 0; i < smock.pos.length; i += 3) {
    const x = Math.abs(smock.pos[i]);
    if (x < ARMHOLE.xMin) continue;
    const e = Math.hypot((smock.pos[i + 1] - ARMHOLE.y) / ARMHOLE.ry, (smock.pos[i + 2] - ARMHOLE.z) / ARMHOLE.rz);
    // (over the shoulder only: under the arm the cloth stays in against the ribs)
    const k = 0.008 * sstep(1.7, 1.05, e) * sstep(ARMHOLE.y - 0.01, ARMHOLE.y + 0.03, smock.pos[i + 1]);
    if (k <= 0) continue;
    smock.pos[i] += smock.nrm[i] * k; smock.pos[i + 1] += smock.nrm[i + 1] * k; smock.pos[i + 2] += smock.nrm[i + 2] * k;
  }
  recomputeNormals(smock);
  // its cut edges, bound
  const bindRect = trim.rect('bind');
  const binds = mk('binds', { trim: true });
  const smockSkin = new Field([smock], 0.04);
  for (const run of openEdges(smock)) {
    const cy = run.reduce((s, q) => s + q.p[1], 0) / run.length, cx = run.reduce((s, q) => s + q.p[0], 0) / run.length;
    if (cy < 1.2) continue;     // the bottom row: under the belt
    if (Math.abs(cx) > 0.1) {
      // fix round 1 (judges: the purple "hook" over each shoulder): EVERY rim point, the strip snapped onto the cloth
      // (armor/lib/smock.mjs bindingOn), no longer offset along the one-sided rim normals or chorded every 2nd / 4th point
      bindingOn(binds, run, smockSkin, smockSkin, { rect: bindRect, w: 0.0088, lift: 0.0015, under: 0.35 });
      // the armhole's own linen, on the rim's points alone (no vertex that could end up inside her): raise the arm, and
      // what shows through the hole is the under-tunic, not the far side of the smock
      {
        const lin = trim.rect('sash');
        const step = Math.max(1, Math.floor(run.length / 14));
        const hoop = run.filter((_, i) => i % step === 0);
        const b0 = binds.pos.length / 3;
        // (armory W1: it read as one flat pale polygon. Its rim normals now lean in toward the hole's middle, so it
        // shades like cloth falling away into the hole, and its texels span the linen's creases instead of one point)
        let mx = 0, my = 0, mz = 0;
        for (const q of hoop) { mx += q.p[0] / hoop.length; my += q.p[1] / hoop.length; mz += q.p[2] / hoop.length; }
        hoop.forEach((q, k) => {
          const n = V.norm(q.n);
          binds.pos.push(q.p[0] - n[0] * 0.003, q.p[1] - n[1] * 0.003, q.p[2] - n[2] * 0.003);
          binds.nrm.push(...V.norm(V.add([Math.sign(cx), 0, 0], V.mul([mx - q.p[0], my - q.p[1], mz - q.p[2]], 14))));
          binds.uv.push(lin[0] + lin[2] * (0.15 + 0.7 * k / Math.max(1, hoop.length - 1)), lin[1] + lin[3] * (0.3 + 0.4 * (k % 2)));
          const sk = smockSkin.skin(q.p[0], q.p[1], q.p[2], 4);
          binds.jnt.push(...sk.j); binds.wgt.push(...sk.w);
        });
        for (let k = 1; k < hoop.length - 1; k++) binds.idx.push(b0, b0 + k, b0 + k + 1);
      }
    } else {
      // neckline and keyhole: the cloth lies away from the slit below the scoop, down and out above it
      const center = (q) => (q[1] < 1.43 && Math.abs(q[0]) < 0.03 ? [0, q[1], q[2]] : [0, 1.57, -0.02]);
      bindingOn(binds, run, smockSkin, smockSkin, { rect: bindRect, center, w: 0.0092, lift: 0.0016, smooth: 1 });
    }
  }
  // the skirt, then the under-tunic inside it: four panels, four slits, offset from each other
  const slits = [-Math.PI / 2, 0.02, Math.PI / 2, Math.PI - 0.02];
  const hemS = opt.skirtHem || ((th, y0) => y0 + 0.016 * Math.pow(Math.abs(Math.sin(th)), 3));
  // armory W1: the folds are MODELLED, on the painter's own fold field (`hangFolds`, the same bearing and height), so the
  // shading the atlas bakes lies in the geometry's valleys: tight gathers under the belt, a few deep ones at the hem.
  // Sharp in the valley, round on the crest; mostly outward (a valley dips 0.3 of the depth, a crest stands 0.7)
  const skirtFold = (th, y, t) => {
    const f = hangFolds({ X: Math.cos(th) * 0.25, Y: y, Z: Math.sin(th) * 0.25 - 0.02 }, { belt: 1.1, hem: 0.75, seed: 0 });
    // (none under the sash band: its crests stood through the band)
    return SKIRT_FOLD * sstep(0.12, 0.9, t) * (f - 0.3);
  };
  const skirt = skirtPanels(mk, under, joints, { slot: 'skirt', yTop: BELT_Y - 0.024, yHem: 0.748, off: 0.024, offTop: 0.006, easeFront: 0.014, flare: 0.078, slits, rows: 10, colsPer: 34, fold: skirtFold, seed: 3, density: 1.08, keep: KEEP_TORSO, hem: hemS, overlap: 0.055, lip: 0.0035, ...opt.skirt });
  const skirtField = new Field(skirt, 0.04);
  const underY = opt.skirt?.yHem ?? 0.748;
  const undr = skirtPanels(mk, skirtField, joints, { slot: 'under', yTop: underY + 0.05, yHem: underY - 0.04, off: -0.024, flare: 0, slits: slits.map((a) => a + 0.2), rows: 2, colsPer: 12, ripA: 0.004, seed: 9, density: 0.72, hem: (th, y0) => y0 + 0.008 * Math.cos(3 * th) + 0.003 * Math.cos(11 * th + 1.3), overlap: 0.22, floorY: underY + 0.03, ringDth: 0.12, lip: 0.002, weightY: (y) => 0.92 * sstep(1.068, 0.75, y), ...opt.under });

  // what lies on the cloth reads the cloth: never the body hidden under it
  const clothField = new Field([smock, trousers, ...skirt], 0.04);

  // ---- the girdle: stiff leather at the waist, brass buckle, keeper, pierced tongue
  const beltY = BELT_Y, beltH = 0.058;
  // (armory W1: 8 mm deeper at its lower edge, so it still laps the sash band when a draw lifts her trunk)
  const girdle = beltRing(mk('girdle', { trim: true }), under, skinOf, { y: beltY - 0.004, h: beltH + 0.008, off: 0.017, cols: 48, rect: trim.rect('girdle'), keep: KEEP_TORSO, thick: 0.0042, lip: 0.003 });
  // the linen sash under it: a creased band showing just below the belt
  // (armory W1: its top takes the girdle's skin, its foot the skirt's: at full draw the girdle rode up with her
  // trunk and the 4 mm they shared opened to a band of skin; moved whole with the girdle, the skirt's top stood
  // through its foot instead)
  const sashBand = beltRing(mk('sashband', { trim: true }), skirtField, skinOf, { skinY: [BELT_Y - 0.055, BELT_Y], y: BELT_Y - 0.043, h: 0.026, off: 0.0016, cols: 26, rect: trim.rect('sash'), thick: 0.003, lip: 0.002, tilt: 0.003, dy: 0.02 });
  // the buckle stands on the belt, front and a touch to her left, rigid on spine_01
  const fr = new Field([girdle], 0.04).radial(beltY, Math.PI / 2 - 0.12, 0, -0.02, 0.03, 0.14) + 0.0035;
  const bk = [Math.cos(Math.PI / 2 - 0.12) * fr, beltY, -0.02 + Math.sin(Math.PI / 2 - 0.12) * fr];
  const basis = [V.norm([Math.sin(Math.PI / 2 - 0.12), 0, -Math.cos(Math.PI / 2 - 0.12)]), [0, 1, 0], V.norm([Math.cos(Math.PI / 2 - 0.12), 0, Math.sin(Math.PI / 2 - 0.12)])];
  const buckle = mk('buckle', { trim: true });
  const brass = trim.rect('brass');
  const jB = joints.spine_01;
  const off = (dx, dy, dz) => V.add(V.add(V.add(bk, V.mul(basis[0], dx)), V.mul(basis[1], dy)), V.mul(basis[2], dz));
  if (opt.buckle !== false) {
    tubeInto(buckle, roundRect(off(0, 0, 0.0005), basis[0], basis[1], 0.0235, 0.0355, 0.008, 2), 0.0027, { sides: 6, closed: true, rect: brass, joint: jB });
    tubeInto(buckle, [off(0.0235, 0, 0.0005), off(0, 0, 0.0018), off(-0.0235, 0, 0.0005)], 0.0021, { sides: 5, rect: brass, joint: jB });          // the bar the prong turns on
    tubeInto(buckle, [off(0.0, 0, 0.0012), off(-0.013, 0, 0.0052), off(-0.0272, 0, 0.0034)], 0.0019, { sides: 5, rect: brass, joint: jB, radiusAt: (u) => mix(1.15, 0.72, u) });
    // the keeper: a band of the same leather the tongue runs through
    boxInto(buckle, off(-0.046, 0, -0.0006), [0.0072, 0.0345, 0.0034], basis, trim.rect('strapB'), jB);
    recomputeNormals(buckle);
  }
  // the belt's tongue: through the keeper, hanging past it, a rounded pierced end
  const tongue = mk('tongue', { trim: true });
  if (opt.buckle !== false) strapAlong(tongue, clothField, skinOf, [off(-0.028, 0.0, 0.0028), off(-0.1, -0.006, 0.0012), off(-0.142, -0.03, -0.001), off(-0.158, -0.078, -0.004)], { width: 0.047, margin: 0.0145, segs: 9, cols: 2, rect: trim.rect('tongue'), tile: 0.62, crown: 0.001, widthAt: (u) => (u > 0.86 ? Math.sqrt(Math.max(0.04, 1 - ((u - 0.86) / 0.14) ** 2)) : 1) });

  // ---- the sling strap: right shoulder, across the chest to the left hip, and round the back
  const sling = mk('sling', { trim: true });
  const slingCtl = [
    [-0.105, 1.462, 0.04], [-0.06, 1.395, 0.09], [-0.012, 1.325, 0.105], [0.035, 1.25, 0.122], [0.082, 1.195, 0.106], [0.118, 1.15, 0.07],
  ];
  strapAlong(sling, clothField, clothField, slingCtl, { width: 0.0245, margin: 0.0065, segs: 18, cols: 2, rect: trim.rect('strap'), tile: 0.42 });
  const slingBack = [
    [-0.105, 1.462, 0.04], [-0.12, 1.488, -0.03], [-0.10, 1.43, -0.125], [-0.03, 1.30, -0.118], [0.06, 1.20, -0.09], [0.118, 1.145, -0.08],
  ];
  strapAlong(sling, clothField, clothField, slingBack, { width: 0.0245, margin: 0.0065, segs: 18, cols: 2, rect: trim.rect('strap'), tile: 0.42 });
  orientOut(sling, 0, -0.02, 1.2);
  // a brass slider where the strap crosses her ribs, so its length reads as adjustable
  {
    const a = slingCtl[2], b = slingCtl[3];
    const c0 = V.lerp(a, b, 0.42);
    const near = clothField.nearest(c0[0], c0[1], c0[2], 4);
    let n = [0, 0, 0]; for (const q of near) n = V.add(n, [q.p.nx, q.p.ny, q.p.nz]); n = V.norm(n);
    const ctr = V.add(near[0].p.x !== undefined ? [near[0].p.x, near[0].p.y, near[0].p.z] : c0, V.mul(n, 0.0095));
    const along = V.norm(V.sub(b, a)), acr = V.norm(V.cross(n, along));
    const s = clothField.skin(ctr[0], ctr[1], ctr[2], 4);
    const slider = mk('slider', { trim: true });
    tubeInto(slider, roundRect(ctr, acr, along, 0.0168, 0.0092, 0.004, 2), 0.0019, { sides: 5, closed: true, rect: brass, joint: s.j[0] });
    recomputeNormals(slider);
    for (let i = 0; i < slider.jnt.length; i += 4) { for (let k = 0; k < 4; k++) { slider.jnt[i + k] = s.j[k]; slider.wgt[i + k] = s.w[k]; } }
    sling.extra = slider;
  }

  // ---- the salt pouch at the left front hip, rigid on the pelvis, hung off the belt
  // on the side of the hip, just behind the seam: out of the thigh's swing and of the arm's
  const pouchThA = -1.75;
  const POUCH_Y = BELT_Y - 0.092;
  const pr = ring(skirtField, POUCH_Y, 64, { keep: () => true, dth: 0.14 })[Math.round(64 * (((pouchThA + Math.PI / 2 + TAU) % TAU) / TAU)) % 64] + 0.009;
  const pc = [Math.cos(pouchThA) * pr, POUCH_Y, -0.02 + Math.sin(pouchThA) * pr];
  const pX = V.norm([Math.sin(pouchThA), 0, -Math.cos(pouchThA)]), pZ = V.norm([Math.cos(pouchThA), 0, Math.sin(pouchThA)]);
  const pY = [0, 1, 0];
  const pouch = mk('pouch', { trim: true });
  const pPel = joints.pelvis;
  const pRect = trim.rect('pouch');
  const PW = 0.041, PH = 0.047, PD = 0.0115;
  // the body: a soft belly and a gusset round its rim, closing on the skirt it lies against
  softSheet(pouch, pc, [pX, pY, pZ], { hw: PW, hh: PH, belly: 0.0105, edge: PD * 0.35, nu: 5, nv: 5, rect: pRect, joint: pPel, round: 0.62 });
  {
    // the gusset: the squircle's rim, front edge to back edge
    const rim = [];
    const Nr = 14;
    for (let k = 0; k < Nr; k++) {
      const a = (k / Nr) * TAU, u = Math.cos(a), v = Math.sin(a);
      const m = Math.max(Math.abs(u), Math.abs(v)); const uu = u / m, vv = v / m;
      const sx = uu * mix(1, Math.sqrt(1 - 0.5 * vv * vv), 0.62), sy = vv * mix(1, Math.sqrt(1 - 0.5 * uu * uu), 0.62);
      rim.push([sx * PW, sy * PH]);
    }
    const base = pouch.pos.length / 3;
    for (const [sx, sy] of rim) for (const dz of [PD * 0.35, -PD * 0.6]) {
      const q = V.add(V.add(V.add(pc, V.mul(pX, sx)), V.mul(pY, sy)), V.mul(pZ, dz));
      pouch.pos.push(...q); pouch.nrm.push(...V.norm(V.add(V.mul(pX, sx), V.mul(pY, sy))));
      pouch.uv.push(pRect[0] + pRect[2] * 0.02, pRect[1] + pRect[3] * (0.5 + 0.48 * Math.sign(dz)));
      pouch.jnt.push(pPel, 0, 0, 0); pouch.wgt.push(1, 0, 0, 0);
    }
    for (let k = 0; k < Nr; k++) { const a = base + k * 2, b = a + 1, c = base + ((k + 1) % Nr) * 2, d = c + 1; pouch.idx.push(a, b, c, b, d, c); }
  }
  // the flap: comes over the top and hangs to below the middle, its corners rounded
  const flapC = V.add(V.add(pc, V.mul(pY, PH * 0.42)), V.mul(pZ, PD * 0.35 + 0.0125));
  const fZ = V.norm(V.add(pZ, V.mul(pY, 0.16)));
  softSheet(pouch, flapC, [pX, V.norm(V.cross(fZ, pX)), fZ], { hw: PW * 1.05, hh: PH * 0.62, belly: 0.0042, nu: 5, nv: 3, rect: pRect, joint: pPel, round: 0.28, bottomRound: 0.9 });
  // two belt loops off the back, up over the girdle
  for (const s of [-1, 1]) {
    const lp = V.add(V.add(pc, V.mul(pX, s * 0.025)), V.add(V.mul(pY, PH + 0.019), V.mul(pZ, -0.004)));
    boxInto(pouch, lp, [0.0072, 0.022, 0.0016], [pX, pY, pZ], trim.rect('strap'), pPel);
  }
  // a bronze toggle through a leather loop, under the flap's lip
  const tgC = V.add(V.add(pc, V.mul(pY, -PH * 0.14)), V.mul(pZ, PD * 0.35 + 0.0155));
  tubeInto(pouch, [V.add(tgC, V.mul(pX, -0.0088)), tgC, V.add(tgC, V.mul(pX, 0.0088))], 0.0041, { sides: 6, rect: brass, joint: pPel, radiusAt: (u) => 0.74 + 0.5 * Math.sin(u * Math.PI) });
  recomputeNormals(pouch);
  // it rides on the skirt, which gives to the thigh: one skin for the whole bag, the loops stay on the belt
  {
    const sk = skirtField.skin(pc[0], pc[1] - 0.012, pc[2], 4);
    const top = pc[1] + PH + 0.004;
    for (let i = 0; i < pouch.pos.length / 3; i++) {
      if (pouch.pos[i * 3 + 1] > top) continue;
      for (let c = 0; c < 4; c++) { pouch.jnt[i * 4 + c] = sk.j[c]; pouch.wgt[i * 4 + c] = sk.w[c]; }
    }
  }

  // ---- sash knot + hanging ends, behind the left hip
  const sashJ = addChain(doc, CHAINS.sashEnd.names, CHAINS.sashEnd.points, CHAINS.sashEnd.parent);
  const pelvis = jointIndex(doc, 'pelvis');
  // the tails' hang (fix round 1): a joint under the pelvis standing at the knot, posed per frame by src/hero/outfit.js
  // (`SashSwing`): it carries a quarter of her left thigh's swing about the hip joint (what the tails' skin took from
  // the thigh before) and a damped pendulum about the knot driven by her pelvis's motion, so the tails have secondary
  // motion again. dyn_sashEnd's bones stand at the FRONT of the hip (brea.mjs), 24 cm from the knot behind it
  const g = newGeo();
  const lin = trim.rect('sash');
  // (armory W1, Nov 6: turned round to the back of her left hip. At the side it hung exactly where her left hand
  // carries the bow: the stave went through the knot and the tails at every step of a jog, and her thigh came up
  // through it in the lance's light attack. Behind the hip it is clear of the hand, the bow and the stride)
  const k0 = CHAINS.sashEnd.points[0];
  const sashTh = Math.atan2(k0[2] + 0.02, k0[0]) - 1.35;
  const tang = [-Math.sin(sashTh), 0, Math.cos(sashTh)], outW = [Math.cos(sashTh), 0, Math.sin(sashTh)];
  // fix round 1 (judges: "the knot hangs 6-7 cm under the band with nothing joining them; the ears look like wire
  // loops; the tails are flat strips with sharp cut ends"): the knot sits ON the band, tied (armor/lib/sash.mjs
  // sashKnotTied: a gathered roll with the tying turn proud round its middle, a turn of the band coming down into
  // it, two puffed loops), and the tails hang from under it with rolled hems, gathered pleats and weight
  const KNOT_Y = BELT_Y - 0.047;
  const onCloth = (y, th, off) => { const rr = clothField.radial(y, th, 0, -0.02, 0.03, 0.2) + off; return [Math.cos(th) * rr, y, -0.02 + Math.sin(th) * rr]; };
  const kc = onCloth(KNOT_Y, sashTh, 0.0085);
  const swingJ = addSocketJoint(doc, SASH_SWING.joint, 'pelvis', kc);
  appendGeo(g, sashKnotTied(kc, { side: tang, up: [0, 1, 0], out: outW }, { joint: pelvis, rect: lin, w: 0.05, h: 0.034, d: 0.024, drop: 0.026, ear: 0.046, earW: 0.021, earT: 0.0075 }));
  const knotEnd = g.pos.length / 3;
  // the two tails: from under the knot, down the back of the hip, standing a little off the skirt's folds
  const tail = (dth, len, off0, off1, y0) => [0, 0.25, 0.5, 0.75, 1].map((u) => onCloth(y0 - len * u, sashTh + dth * (0.4 + 0.6 * u), off0 + (off1 - off0) * u));
  appendGeo(g, sashTail(tail(0.05, 0.25, 0.012, 0.02, KNOT_Y - 0.012), [pelvis, pelvis, pelvis, pelvis], { along: 10, across: 6, width: (u) => 0.056 - 0.01 * u, side: tang, out: outW, rect: lin, uLen: 0.42, twist: 0.28, thick: 0.0028, hem: 0.0062, pleats: 2, pleat: (u) => 0.009 * (1 - u) ** 1.6 + 0.002, endCut: 0.012 }));
  appendGeo(g, sashTail(tail(-0.16, 0.19, 0.016, 0.024, KNOT_Y - 0.008), [pelvis, pelvis, pelvis, pelvis], { along: 8, across: 5, width: (u) => 0.047 - 0.008 * u, side: tang, out: outW, rect: lin, uLen: 0.3, u0: 0.5, twist: -0.22, thick: 0.0028, hem: 0.0058, pleats: 2, pleat: (u) => 0.008 * (1 - u) ** 1.5 + 0.0015, endCut: -0.011 }));
  // the tails' skin: the pelvis at the knot, the swing socket taking over down their length (its pivot is the knot,
  // so the cloth bends from there instead of hinging)
  {
    let yTop = -9, yBot = 9;
    for (let i = knotEnd; i < g.pos.length / 3; i++) { const y = g.pos[i * 3 + 1]; if (y > yTop) yTop = y; if (y < yBot) yBot = y; }
    for (let i = knotEnd; i < g.pos.length / 3; i++) {
      const t = Math.max(0, Math.min(1, (yTop - g.pos[i * 3 + 1]) / (yTop - yBot)));
      const k = sstep(0.0, 0.55, t);
      g.jnt[i * 4] = pelvis; g.jnt[i * 4 + 1] = swingJ; g.jnt[i * 4 + 2] = 0; g.jnt[i * 4 + 3] = 0;
      g.wgt[i * 4] = 1 - k; g.wgt[i * 4 + 1] = k; g.wgt[i * 4 + 2] = 0; g.wgt[i * 4 + 3] = 0;
    }
  }
  void sashJ;
  const sash = mk('sash', { trim: true });
  Object.assign(sash, { pos: g.pos, nrm: g.nrm, uv: g.uv, jnt: g.jnt, wgt: g.wgt, idx: g.idx });
  // what the runtime needs to hang them: the knot (the pendulum's pivot) and the left hip joint (the thigh's pivot)
  SASH_SWING.knot = kc.map((v) => +v.toFixed(4));
  SASH_SWING.hip = jointPos(doc, 'thigh_l').map((v) => +v.toFixed(4));

  // ---- a linen cord tied at the keyhole, as the reference tunic's
  const tie = mk('tie', { trim: true });
  {
    const yT = 1.388, rT = tableAt(drape, yT, Math.PI / 2) + 0.0038;
    const c = [0, yT, -0.02 + rT];
    const jS = J('spine_03');
    const rope = trim.rect('linen');
    const pX1 = [1, 0, 0], pY1 = [0, 1, 0];
    const at = (x, y, z = 0) => V.add(V.add(V.add(c, V.mul(pX1, x)), V.mul(pY1, y)), [0, 0, z]);
    tubeInto(tie, [at(-0.0115, 0.002, -0.002), at(-0.004, 0.001, 0.001), at(0.004, 0.0005, 0.001), at(0.0115, 0.002, -0.002)], 0.00135, { sides: 3, rect: rope, joint: jS });
    tubeInto(tie, [at(0, 0), at(-0.006, 0.0075, 0.0012), at(-0.0135, 0.0065, 0.0012), at(-0.0115, -0.0005, 0.0012), at(0, 0)], 0.0012, { sides: 3, rect: rope, joint: jS });
    tubeInto(tie, [at(0, 0), at(0.006, 0.0075, 0.0012), at(0.0135, 0.0065, 0.0012), at(0.0115, -0.0005, 0.0012), at(0, 0)], 0.0012, { sides: 3, rect: rope, joint: jS });
    tubeInto(tie, [at(0, -0.0005), at(-0.0045, -0.012, 0.0012), at(-0.0035, -0.026, 0.0015), at(-0.0065, -0.035, 0.0015)], 0.0011, { sides: 3, rect: rope, joint: jS });
    tubeInto(tie, [at(0, -0.0005), at(0.0035, -0.01, 0.0012), at(0.0055, -0.021, 0.0015)], 0.0011, { sides: 3, rect: rope, joint: jS });
    tubeInto(tie, [at(0, -0.001), at(0.0011, 0.0011, 0.0011), at(-0.0012, 0.0013, 0.0012)], 0.0024, { sides: 5, rect: rope, joint: jS });
  }

  // ---- rolled cuffs where the sleeves were cut: a fat linen roll, a thin carmine lining
  const cuffs = mk('cuffs', { trim: true });
  for (const sgn of [1, -1]) cuffRing(cuffs, sleeves, sgn, trim.rect('linen'), trim.rect('carmine'), skinOf);
  recomputeNormals(cuffs);

  // ---- boots: two lapilli straps cinched over the esparto
  const straps = mk('straps', { trim: true });
  const bootField = new Field([boots], 0.03);
  const strapR = trim.rect('strapB');
  for (const side of [1, -1]) {
    const cx = side * 0.111;
    for (const [y, cz, h, thick, rc] of [[0.408, -0.052, 0.0165, 0.0017, strapR], [0.262, -0.056, 0.0165, 0.0017, strapR]]) {
      limbStrap(straps, bootField, skinOf, { cx, cz, y, h, off: 0.0006, cols: 12, rect: rc, tilt: 0.009, tiltTh: side > 0 ? -2.2 : -0.9, keep: (q) => Math.sign(q.x) === side, thick });
    }
  }
  recomputeNormals(straps);

  // ---- the archer's finger tab on her right hand (bible §3.9): a leather pad under the three
  // string fingers, the back of the hand left bare (the ∴)
  const tab = mk('tab', { trim: true });
  {
    const hand = jointPos(doc, 'hand_r');
    const hP = bodyPart;
    // the palm's frame off the finger joints: along the fingers, across them, and out of the palm
    const mid1 = jointPos(doc, 'middle_01_r'), mid2 = jointPos(doc, 'middle_02_r'), idx1 = jointPos(doc, 'index_01_r'), rng1 = jointPos(doc, 'ring_01_r');
    const along = V.norm(V.sub(mid2, mid1));
    const across = V.norm(V.sub(idx1, rng1));
    let palm = V.norm(V.cross(across, along));
    const thumb = jointPos(doc, 'thumb_01_r');
    if (V.dot(palm, V.sub(thumb, mid1)) < 0) palm = V.mul(palm, -1);     // the thumb sits on the palm's side of the knuckles
    // how far the skin stands off that plane under the first finger bones
    let out = 0;
    for (let i = 0; i < hP.pos.length; i += 3) {
      const d = [hP.pos[i] - mid1[0], hP.pos[i + 1] - mid1[1], hP.pos[i + 2] - mid1[2]];
      const a1 = V.dot(d, along), c1 = V.dot(d, across);
      if (a1 > -0.012 && a1 < 0.05 && Math.abs(c1) < 0.028) out = Math.max(out, V.dot(d, palm));
    }
    const cTab = V.add(V.add(mid1, V.mul(along, 0.016)), V.mul(palm, out + 0.0016));
    const rectT = trim.rect('pouch');
    const base = tab.pos.length / 3;
    const NX = 3, NZ = 3;
    for (let a2 = 0; a2 <= NX; a2++) for (let b2 = 0; b2 <= NZ; b2++) {
      const u = -1 + 2 * a2 / NX, v = -1 + 2 * b2 / NZ;
      const q = V.add(V.add(V.add(cTab, V.mul(along, u * 0.031)), V.mul(across, v * 0.0265 * (u > 0.3 ? mix(1, 0.78, (u - 0.3) / 0.7) : 1))), V.mul(palm, 0.0012 * (1 - v * v)));
      const sk = skinOf.skin(q[0] - palm[0] * 0.008, q[1] - palm[1] * 0.008, q[2] - palm[2] * 0.008, 3);
      tab.pos.push(...q); tab.nrm.push(...palm);
      tab.uv.push(rectT[0] + rectT[2] * (a2 / NX), rectT[1] + rectT[3] * (b2 / NZ));
      tab.jnt.push(...sk.j); tab.wgt.push(...sk.w);
    }
    for (let a2 = 0; a2 < NX; a2++) for (let b2 = 0; b2 < NZ; b2++) { const a3 = base + a2 * (NZ + 1) + b2; tab.idx.push(a3, a3 + 1, a3 + NZ + 1, a3 + 1, a3 + NZ + 2, a3 + NZ + 1); }
  }
  recomputeNormals(tab);

  // (the lofts above read the whole garment; its top, hip-high under the skirt's yoke and always covered, need not ship)
  const trousersCut = cutTris(trousers, (cx, cy) => cy < 0.94 && cy > 0.42);
  const parts = [underYoke, smock, binds, ...skirt, ...undr, sleeves, trousersCut, boots, girdle, sashBand, ...(buckle.pos.length ? [buckle, tongue] : []), sling, sling.extra, pouch, sash, tie, cuffs, straps, tab];
  return { doc, trim, parts, joints, body, bodyPart, clothField, skinOf, W, H, TRIM_H, J, drape };
}

/** A rolled sleeve cuff: fat linen roll around the sleeve's cut edge, carmine lining inside its lip. */
function cuffRing(part, sleeves, sgn, uvLinen, uvCarmine, skinOf) {
  const { pos } = sleeves;
  const n = pos.length / 3;
  let cx = 0, cy = 0, cz = 0, m = 0;
  for (let i = 0; i < n; i++) if (Math.sign(pos[i * 3]) === sgn && Math.abs(pos[i * 3]) > SLEEVE_CUT - 0.02) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; m++; }
  cx /= m; cy /= m; cz /= m;
  const SEG = 12;
  const radAt = new Float64Array(SEG + 1);
  for (let i = 0; i < n; i++) {
    if (Math.sign(pos[i * 3]) !== sgn || Math.abs(pos[i * 3]) < SLEEVE_CUT - 0.03) continue;
    const a = Math.atan2(pos[i * 3 + 2] - cz, pos[i * 3 + 1] - cy);
    const k = Math.round((a + Math.PI) / (Math.PI * 2) * SEG) % SEG;
    radAt[k] = Math.max(radAt[k], Math.hypot(pos[i * 3 + 1] - cy, pos[i * 3 + 2] - cz));
  }
  for (let k = 0; k < SEG; k++) if (!radAt[k]) radAt[k] = radAt[(k + 1) % SEG] || radAt[(k + SEG - 1) % SEG] || 0.05;
  radAt[SEG] = radAt[0];
  const profile = [[-0.019, 0.004, 'l'], [-0.004, 0.012, 'l'], [0.008, 0.01, 'l'], [0.0115, 0.004, 'c'], [0.0085, -0.002, 'c']];
  const base = part.pos.length / 3;
  for (let r = 0; r < profile.length; r++) {
    const [dx, dr, m2] = profile[r];
    const rect = m2 === 'l' ? uvLinen : uvCarmine;
    for (let k = 0; k <= SEG; k++) {
      const a = -Math.PI + (k / SEG) * Math.PI * 2;
      const rad = radAt[k % SEG] + dr;
      // bearing a measured (z, y) as above
      const p = [cx + sgn * dx, cy + Math.cos(a) * rad, cz + Math.sin(a) * rad];
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

/** The fit's limits for this cut: the yoke lies flat on the collarbones and shows; it takes little room, whatever a draw asks of it. */
export const PAN_FIT = { capAt: (x, y, z, slot, max) => (y > 1.385 && Math.abs(x) < 0.21 && !(slot === 'wrap' || slot === 'cowl' || slot === 'capelet') ? (z < -0.02 ? 0.01 : 0.005) : max) };

export const PAN_SET = { set: 'pan', hideBit: HIDE_BIT, chains: ['dyn_sashEnd'], get sashSwing() { return { ...SASH_SWING }; } };

export async function build({ out = ROOT } = {}) {
  const base = await panBase();
  const { doc, parts, trim, W, H } = base;
  const layout = await panLayout(parts, trim, W, H);
  const SRC = srcRoot();
  const srcNormal = await loadRaw(path.join(MCO_DIR(SRC), 'T_Peasant_Normal.png'), 1024);
  const tex = await paintAtlas(parts, layout, {
    painters: PAN_PAINTERS, srcNormal, trim, salt: COL.salt, curv: { crease: 1, ridge: 0.7 }, q: { base: 95, normal: 88, orm: 84 },
  });
  romFit(parts, base, PAN_FIT);
  // the contact shadow every layer casts on the one under it (armor/lib/vertexao.mjs)
  const ao = bakeVertexAO(parts, { body: base.bodyPart });
  const { node, material } = outfitDoc(doc, parts, { name: 'Outfit_Pan_1', matName: 'MI_Pan_1', tex, texPrefix: 'pan', extra: { _AO: ['SCALAR', ao] } });
  void node; void material;
  for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) pr.getAttribute('_AO')?.setNormalized(true);
  const file = path.join(out, OUTPUTS[0]);
  return writeOutfit(doc, file, {
    recipe: RECIPE, sources: ['mco-fantasy-standard', 'ubc-standard', 'brea-generated'], licence: 'CC0-1.0',
    r5Outfit: {
      ...PAN_SET, variant: 'pan-1', name: "Pan Whites I — Raker's Whites", density: +layout.D.toFixed(1), detailRep: +((W / layout.D) / 0.026).toFixed(1), hasAo: true,
      pieces: ['underyoke', 'smock', 'binds', 'skirt', 'under', 'sleeves', 'trousers', 'boots', 'girdle', 'sashband', 'buckle', 'tongue', 'sling', 'slider', 'pouch', 'sash', 'tie', 'cuffs', 'straps', 'tab'],
    },
  });
}
