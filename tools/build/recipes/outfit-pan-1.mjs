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
import { Field, V, clamp, compact, conform, cutTris, emptyPart, mix, partFromPrim, recomputeNormals, sstep } from './armor/lib/part.mjs';
import { Trim, fbm, loadRaw, packAtlas, paintAtlas } from './armor/lib/atlas.mjs';
import { TAU, beltRing, boxInto, limbStrap, orientOut, ring, skirtPanels, strapAlong } from './armor/lib/garment.mjs';
import { bindingAlong, draftSmock, drapeTable, openEdges, radialTable, roundRect, softSheet, tableAt, tubeInto } from './armor/lib/smock.mjs';
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

/** Folds hanging from a gathered line: tight at the belt, merging into a few deep ones low down. */
export function hangFolds(t, { belt = 1.1, hem = 0.75, seed = 0 } = {}) {
  const th = Math.atan2(t.Z + 0.02, t.X);
  const d = clamp((belt - t.Y) / (belt - hem));
  const wob = 0.11 * (noise3(th * 3.1 + seed, t.Y * 4.0, 3.7) - 0.5);
  const a = fold01(noise3((th + wob) * mix(6.6, 3.0, d), t.Y * 0.7, 1.3 + seed));
  const b = fold01(noise3((th + wob * 1.5) * mix(13, 6.2, d), t.Y * 1.1, 5.1 + seed));
  const c = fold01(noise3((th + wob * 2.2) * mix(26, 11, d), t.Y * 1.8, 8.7 + seed));
  return a * 0.7 + b * 0.24 * (1 - 0.35 * d) + c * 0.06 * (1 - 0.6 * d) + 0.05 * d;
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
    // linen wound round: long creases along the band, deep where it goes under the belt
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; t.d = 99;
    cloth(t, o, sc(COL.linen, 0.98), { slub: 0.05, mottle: 0.08, seed: 13, thread: 0.03 });
    const c = fold01(noise3(t.ax * 0.018, t.y * 0.16, 2.9)), c2 = fold01(noise3(t.ax * 0.04, t.y * 0.34, 7.3));
    const f = c * 0.7 + c2 * 0.3;
    o.h += 0.0022 * (f - 0.6);
    const q = 0.9 + 0.13 * sstep(0.16, 0.7, f); o.r *= q; o.g *= q; o.b *= q;
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
  cloth(t, o, c, { slub: 0.07, mottle: 0.1, seed, thread: 0.075 });
  const d = fbm(t.X * 4.2, t.Y * 1.2, t.Z * 4.2 + 17, 2);
  const k = 0.9 + 0.2 * d; o.r *= k; o.g *= k; o.b *= k;
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
    // gathers above the belt
    const gw = sstep(1.26, 1.165, t.Y);
    if (gw > 0) {
      const f = hangFolds(t, { belt: 1.0, hem: 1.3, seed: 2 });
      h += 0.0062 * gw * (f - 0.6); sh *= 1 - 0.24 * gw * sstep(0.48, 0.12, f);
    }
    // long soft drops under the bust and at the sides
    const dw = sstep(1.3, 1.24, t.Y) * (1 - gw);
    if (dw > 0) { const f = fold01(noise3(Math.atan2(t.Z + 0.02, t.X) * 4.0, t.Y * 1.1, 2.6)); h += 0.0044 * dw * (f - 0.55); sh *= 1 + 0.16 * dw * Math.min(0, f - 0.4); }
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
    o.h += 0.0082 * (f - 0.58);
    o.ao *= 1 - 0.2 * sstep(0.42, 0.06, f);
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
    // brine-darkened and dusty low down
    const n = fbm(t.X * 9, t.Y * 3, t.Z * 9, 3);
    over(o, [120, 100, 110], sstep(0.92, 0.76, t.Y) * 0.2 * (0.4 + n));
    o.wear = 1.1;
  },
  under(t, o) {
    cloth(t, o, sc(COL.linen, 0.92), { slub: 0.1, mottle: 0.14, seed: 2 });
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
    cloth(t, o, sc(COL.linen, 0.97), { slub: 0.1, mottle: 0.1, seed: 16 });
    // shaded by the smock over it, brighter up the collar
    o.ao *= 0.62 + 0.38 * sstep(1.40, 1.49, t.Y);
    seam(t, o, { threads: false, groove: 0.9 });
    o.wear = 0.7; o.crease = 0.4;
  },
  sleeves(t, o) {
    cloth(t, o, COL.linen, { slub: 0.09, mottle: 0.09, seed: 5 });
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
      // a flat plait of esparto wound up the shin, each turn lapping the one below it
      const turn = t.Y / 0.027 + th / TAU * side;
      const k = Math.floor(turn), fb = turn - k;
      const arc = th * 0.058 * side;
      const across = Math.sin(Math.PI * Math.pow(fb, 0.78));              // the band's crown
      const ch = Math.abs(((arc / 0.0105 + Math.abs(fb - 0.5) * 1.5) % 1 + 1) % 1 - 0.5) * 2;   // the plait's chevrons
      const lot = 0.92 + 0.16 * noise3(k * 1.73, 3.3, 1.1);                // grass from different cuts
      const v = (0.76 + 0.24 * across) * (0.92 + 0.12 * ch) * lot * (0.95 + 0.12 * (n - 0.5));
      put(o, sc(COL.esparto, v));
      o.h = 0.0015 * across + 0.00025 * ch;
      // the turn above lies over this one's top edge
      if (fb > 0.88) { const q = mix(1, 0.6, (fb - 0.88) / 0.12); o.r *= q; o.g *= q; o.b *= q; }
      o.rough = 0.92;
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
const BELT_Y = 1.122;
export const KEEP_TORSO = (q) => Math.abs(q.x) < 0.3;
/** Where the smock's armholes are cut (bind space): just outside the sleeve at the shoulder joint. */
export const ARMHOLE = { y: 1.414, z: -0.055, ry: 0.066, rz: 0.062, xMin: 0.12 };

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
  const underYoke = cutTris(partFromPrim(prim('smock'), 'underyoke', { axis: [0, 1, 0], density: 0.62, nScale: 0.3 }), (cx, cy, cz) => cy > 1.345 && Math.abs(cx) < 0.145 && (cz > -0.015 || cy > 1.468));
  conform(underYoke, body, { margin: () => 0.004 });
  recomputeNormals(underYoke);
  // the sleeve starts inside the smock's armhole: anything further in would only poke through the shoulder
  const sleeves = cutTris(partFromPrim(prim('sleeves'), 'sleeves', { density: 0.85, nScale: 0.5 }), (cx) => Math.abs(cx) > 0.152);
  sleeves.axis = [1, 0, 0];
  conform(sleeves, body, { margin: () => 0.0045 });
  // the sleeve eases in as it goes up under the smock's edge, so the arm can drop without its
  // cap coming out through the shoulder (the body under it is culled: nothing shows through)
  for (let i = 0; i < sleeves.pos.length; i += 3) {
    const ax = Math.abs(sleeves.pos[i]), k = sstep(0.24, 0.175, ax);
    if (k <= 0) continue;
    const dy = sleeves.pos[i + 1] - ARMHOLE.y, dz = sleeves.pos[i + 2] - ARMHOLE.z;
    const l = Math.hypot(dy, dz) || 1, cut = Math.min(l * 0.55, 0.024 * k);
    sleeves.pos[i + 1] -= (dy / l) * cut; sleeves.pos[i + 2] -= (dz / l) * cut;
  }
  recomputeNormals(sleeves);
  const trousers = partFromPrim(prim('trousers'), 'trousers', { density: 0.76, nScale: 0.7 });
  conform(trousers, body, {
    margin: () => 0.005,
    field: (x, y) => 0.021 * sstep(1.0, 0.86, y) * (0.72 + 0.28 * sstep(0.8, 0.5, y)) * sstep(0.42, 0.5, y) + 0.008 * sstep(0.5, 0.42, y),
    smooth: 3,
  });
  recomputeNormals(trousers);
  const boots = partFromPrim(prim('boots'), 'boots', { density: 0.98, nScale: 0.2 });
  conform(boots, body, {
    margin: () => 0.006,
    field: (x, y) => 0.014 * sstep(0.28, 0.45, y),
    smooth: 2,
  });
  recomputeNormals(boots);

  // ---- surfaces the lofts read
  const under = new Field([bodyPart, trousers], 0.04);
  const skinOf = new Field([bodyPart], 0.04);
  const W = 1024, H = 1024;
  const trim = (opt.trim || panTrim)(W, H, TRIM_H);
  const mk = (slot, extra = {}) => emptyPart(slot, extra);

  // ---- the over-smock: what cloth does over the body, from the neckline to the belt
  const keepTorso = (x, y) => y < 1.535 && Math.abs(x) < (y > 1.345 ? 0.172 : 0.2);
  const raw = radialTable([bodyPart, underYoke, sleeves], { y0: 1.1, y1: 1.54, keep: keepTorso });
  const drape = drapeTable(raw, { apex: [1.26, 1.4], fall: 0.34, margin: (y) => 0.0055 + 0.004 * sstep(1.3, 1.22, y) + 0.003 * sstep(1.47, 1.51, y) });
  const neckY = (d) => mix(1.432, 1.504, sstep(0.0, 1.3, d)) + 0.011 * sstep(1.7, 3.0, d);
  const smock = draftSmock(mk('smock'), drape, skinOf, {
    rows: 21, cols: 60, neckY, yBelt: 1.144, seed: 1, density: 1.08,
    gather: (y, th) => tableAt(drape, BELT_Y, th) + 0.003 + 0.0075 * sstep(1.148, 1.178, y),
    slit: { yBottom: 1.356, half: 0.0105, round: 0.012 },
    armholes: [{ side: 1, ...ARMHOLE }, { side: -1, ...ARMHOLE }],
  });
  compact(smock);      // the armholes' cut quads leave vertices no triangle uses
  orientOut(smock, 0, -0.02, 1.25);
  // the cap stands proud of the sleeve round the armhole: the arm moves under it, never through it
  for (let i = 0; i < smock.pos.length; i += 3) {
    const x = Math.abs(smock.pos[i]);
    if (x < ARMHOLE.xMin) continue;
    const e = Math.hypot((smock.pos[i + 1] - ARMHOLE.y) / ARMHOLE.ry, (smock.pos[i + 2] - ARMHOLE.z) / ARMHOLE.rz);
    const k = 0.008 * sstep(1.7, 1.05, e);
    if (k <= 0) continue;
    smock.pos[i] += smock.nrm[i] * k; smock.pos[i + 1] += smock.nrm[i + 1] * k; smock.pos[i + 2] += smock.nrm[i + 2] * k;
  }
  recomputeNormals(smock);
  // its cut edges, bound
  const bindRect = trim.rect('bind');
  const binds = mk('binds', { trim: true });
  for (const run of openEdges(smock)) {
    const cy = run.reduce((s, q) => s + q.p[1], 0) / run.length, cx = run.reduce((s, q) => s + q.p[0], 0) / run.length;
    if (cy < 1.2) continue;     // the bottom row: under the belt
    if (Math.abs(cx) > 0.1) {
      const c = [Math.sign(cx) * 0.19, ARMHOLE.y, ARMHOLE.z];
      bindingAlong(binds, run, skinOf, { rect: bindRect, closed: true, center: () => c, w: 0.0095, lift: 0.0026, segEvery: 2 });
    } else {
      // neckline and keyhole: the cloth lies away from the slit below the scoop, down and out above it
      const center = (q) => (q[1] < 1.43 && Math.abs(q[0]) < 0.03 ? [0, q[1], q[2]] : [0, 1.57, -0.02]);
      bindingAlong(binds, run, skinOf, { rect: bindRect, closed: true, center, w: 0.0095, lift: 0.0026 });
    }
  }
  // the skirt, then the under-tunic inside it: four panels, four slits, offset from each other
  const slits = [-Math.PI / 2, 0.02, Math.PI / 2, Math.PI - 0.02];
  const hemS = opt.skirtHem || ((th, y0) => y0 + 0.016 * Math.pow(Math.abs(Math.sin(th)), 3));
  const skirt = skirtPanels(mk, under, joints, { slot: 'skirt', yTop: BELT_Y - 0.024, yHem: 0.748, off: 0.008, flare: 0.078, slits, rows: 8, colsPer: 20, ripA: 0.0115, seed: 3, density: 1.08, keep: KEEP_TORSO, hem: hemS, overlap: 0.055, lip: 0.0035, ...opt.skirt });
  const skirtField = new Field(skirt, 0.04);
  const underY = opt.skirt?.yHem ?? 0.748;
  const undr = skirtPanels(mk, skirtField, joints, { slot: 'under', yTop: underY + 0.05, yHem: underY - 0.04, off: -0.034, flare: 0, slits: slits.map((a) => a + 0.2), rows: 2, colsPer: 12, ripA: 0.004, seed: 9, density: 0.72, hem: (th, y0) => y0 + 0.008 * Math.cos(3 * th) + 0.003 * Math.cos(11 * th + 1.3), overlap: 0.22, floorY: underY + 0.03, ringDth: 0.12, lip: 0.002, weightY: (y) => 0.92 * sstep(1.068, 0.75, y), ...opt.under });

  // what lies on the cloth reads the cloth: never the body hidden under it
  const clothField = new Field([smock, trousers, ...skirt], 0.04);

  // ---- the girdle: stiff leather at the waist, brass buckle, keeper, pierced tongue
  const beltY = BELT_Y, beltH = 0.058;
  const girdle = beltRing(mk('girdle', { trim: true }), under, skinOf, { y: beltY, h: beltH, off: 0.0135, cols: 48, rect: trim.rect('girdle'), keep: KEEP_TORSO, thick: 0.0042, lip: 0.003 });
  // the linen sash under it: a creased band showing just below the belt
  const sashBand = beltRing(mk('sashband', { trim: true }), skirtField, skinOf, { y: BELT_Y - 0.040, h: 0.03, off: 0.0034, cols: 26, rect: trim.rect('sash'), thick: 0.003, lip: 0.002, tilt: 0.003, dy: 0.02 });
  // the buckle stands on the belt, front and a touch to her left, rigid on spine_01
  const fr = new Field([girdle], 0.04).radial(beltY, Math.PI / 2 - 0.12, 0, -0.02, 0.03, 0.14) + 0.0035;
  const bk = [Math.cos(Math.PI / 2 - 0.12) * fr, beltY, -0.02 + Math.sin(Math.PI / 2 - 0.12) * fr];
  const basis = [V.norm([Math.sin(Math.PI / 2 - 0.12), 0, -Math.cos(Math.PI / 2 - 0.12)]), [0, 1, 0], V.norm([Math.cos(Math.PI / 2 - 0.12), 0, Math.sin(Math.PI / 2 - 0.12)])];
  const buckle = mk('buckle', { trim: true });
  const brass = trim.rect('brass');
  const jB = joints.spine_01;
  const off = (dx, dy, dz) => V.add(V.add(V.add(bk, V.mul(basis[0], dx)), V.mul(basis[1], dy)), V.mul(basis[2], dz));
  tubeInto(buckle, roundRect(off(0, 0, 0.0005), basis[0], basis[1], 0.0235, 0.0355, 0.008, 2), 0.0027, { sides: 6, closed: true, rect: brass, joint: jB });
  tubeInto(buckle, [off(0.0235, 0, 0.0005), off(0, 0, 0.0018), off(-0.0235, 0, 0.0005)], 0.0021, { sides: 5, rect: brass, joint: jB });          // the bar the prong turns on
  tubeInto(buckle, [off(0.0, 0, 0.0012), off(-0.013, 0, 0.0052), off(-0.0272, 0, 0.0034)], 0.0019, { sides: 5, rect: brass, joint: jB, radiusAt: (u) => mix(1.15, 0.72, u) });
  // the keeper: a band of the same leather the tongue runs through
  boxInto(buckle, off(-0.046, 0, -0.0006), [0.0072, 0.0345, 0.0034], basis, trim.rect('strapB'), jB);
  recomputeNormals(buckle);
  for (let i = 0; i < buckle.nrm.length; i += 3) void i;
  // the belt's tongue: through the keeper, hanging past it, a rounded pierced end
  const tongue = mk('tongue', { trim: true });
  strapAlong(tongue, clothField, skinOf, [off(-0.028, 0.0, 0.0028), off(-0.1, -0.006, 0.0012), off(-0.142, -0.03, -0.001), off(-0.158, -0.078, -0.004)], { width: 0.047, margin: 0.0145, segs: 9, cols: 2, rect: trim.rect('tongue'), tile: 0.62, crown: 0.001, widthAt: (u) => (u > 0.86 ? Math.sqrt(Math.max(0.04, 1 - ((u - 0.86) / 0.14) ** 2)) : 1) });

  // ---- the sling strap: right shoulder, across the chest to the left hip, and round the back
  const sling = mk('sling', { trim: true });
  const slingCtl = [
    [-0.105, 1.462, 0.04], [-0.06, 1.395, 0.09], [-0.012, 1.325, 0.105], [0.035, 1.25, 0.122], [0.082, 1.195, 0.106], [0.118, 1.15, 0.07],
  ];
  strapAlong(sling, clothField, skinOf, slingCtl, { width: 0.0245, margin: 0.0065, segs: 18, cols: 2, rect: trim.rect('strap'), tile: 0.42 });
  const slingBack = [
    [-0.105, 1.462, 0.04], [-0.12, 1.488, -0.03], [-0.10, 1.43, -0.125], [-0.03, 1.30, -0.118], [0.06, 1.20, -0.09], [0.118, 1.145, -0.08],
  ];
  strapAlong(sling, clothField, skinOf, slingBack, { width: 0.0245, margin: 0.0065, segs: 18, cols: 2, rect: trim.rect('strap'), tile: 0.42 });
  orientOut(sling, 0, -0.02, 1.2);
  // a brass slider where the strap crosses her ribs, so its length reads as adjustable
  {
    const a = slingCtl[2], b = slingCtl[3];
    const c0 = V.lerp(a, b, 0.42);
    const near = clothField.nearest(c0[0], c0[1], c0[2], 4);
    let n = [0, 0, 0]; for (const q of near) n = V.add(n, [q.p.nx, q.p.ny, q.p.nz]); n = V.norm(n);
    const ctr = V.add(near[0].p.x !== undefined ? [near[0].p.x, near[0].p.y, near[0].p.z] : c0, V.mul(n, 0.0095));
    const along = V.norm(V.sub(b, a)), acr = V.norm(V.cross(n, along));
    const s = skinOf.skin(ctr[0], ctr[1], ctr[2], 4);
    const slider = mk('slider', { trim: true });
    tubeInto(slider, roundRect(ctr, acr, along, 0.0168, 0.0092, 0.004, 2), 0.0019, { sides: 5, closed: true, rect: brass, joint: s.j[0] });
    recomputeNormals(slider);
    for (let i = 0; i < slider.jnt.length; i += 4) { for (let k = 0; k < 4; k++) { slider.jnt[i + k] = s.j[k]; slider.wgt[i + k] = s.w[k]; } }
    sling.extra = slider;
  }

  // ---- the salt pouch at the left front hip, rigid on the pelvis, hung off the belt
  const pouchThA = Math.PI / 2 - 0.86;
  const POUCH_Y = BELT_Y - 0.104;
  const pr = ring(clothField, POUCH_Y, 64, { keep: KEEP_TORSO, dth: 0.14 })[Math.round(64 * ((pouchThA + Math.PI / 2) / TAU))] + 0.022;
  const pc = [Math.cos(pouchThA) * pr, POUCH_Y, -0.02 + Math.sin(pouchThA) * pr];
  const pX = V.norm([Math.sin(pouchThA), 0, -Math.cos(pouchThA)]), pZ = V.norm([Math.cos(pouchThA), 0, Math.sin(pouchThA)]);
  const pY = [0, 1, 0];
  const pouch = mk('pouch', { trim: true });
  const pPel = joints.pelvis;
  const pRect = trim.rect('pouch');
  const PW = 0.041, PH = 0.047, PD = 0.0115;
  // the body: soft belly over a flat back, joined by a gusset round the rim
  softSheet(pouch, pc, [pX, pY, pZ], { hw: PW, hh: PH, belly: 0.0105, edge: PD * 0.35, nu: 6, nv: 6, rect: pRect, joint: pPel, round: 0.62 });
  softSheet(pouch, pc, [pX, pY, V.mul(pZ, -1)], { hw: PW, hh: PH, belly: 0.001, edge: PD * 0.6, nu: 2, nv: 2, rect: pRect, joint: pPel, round: 0.62, flip: false });
  {
    // the gusset: the squircle's rim, front edge to back edge
    const rim = [];
    const Nr = 18;
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
  softSheet(pouch, flapC, [pX, V.norm(V.cross(fZ, pX)), fZ], { hw: PW * 1.05, hh: PH * 0.62, belly: 0.0042, nu: 6, nv: 4, rect: pRect, joint: pPel, round: 0.28, bottomRound: 0.9 });
  // two belt loops off the back, up over the girdle
  for (const s of [-1, 1]) {
    const lp = V.add(V.add(pc, V.mul(pX, s * 0.025)), V.add(V.mul(pY, PH + 0.019), V.mul(pZ, -0.004)));
    boxInto(pouch, lp, [0.0072, 0.022, 0.0016], [pX, pY, pZ], trim.rect('strap'), pPel);
  }
  // a bronze toggle through a leather loop, under the flap's lip
  const tgC = V.add(V.add(pc, V.mul(pY, -PH * 0.14)), V.mul(pZ, PD * 0.35 + 0.0155));
  tubeInto(pouch, [V.add(tgC, V.mul(pX, -0.0088)), tgC, V.add(tgC, V.mul(pX, 0.0088))], 0.0041, { sides: 6, rect: brass, joint: pPel, radiusAt: (u) => 0.74 + 0.5 * Math.sin(u * Math.PI) });
  const pouchRecompute = pouch;
  recomputeNormals(pouchRecompute);

  // ---- sash knot + hanging end on dyn_sashEnd
  const sashJ = addChain(doc, CHAINS.sashEnd.names, CHAINS.sashEnd.points, CHAINS.sashEnd.parent);
  const pelvis = jointIndex(doc, 'pelvis');
  const g = newGeo();
  const lin = trim.rect('sash');
  // the bones stay where brea.mjs put them; the cloth lies on the skirt that now covers them
  const outOnSkirt = (q) => {
    const th = Math.atan2(q[2] + 0.02, q[0]);
    const rr = Math.max(clothField.radial(q[1], th, 0, -0.02, 0.03, 0.14), Math.hypot(q[0], q[2] + 0.02)) + 0.011;
    return [Math.cos(th) * rr, q[1], -0.02 + Math.sin(th) * rr];
  };
  const sashPts = CHAINS.sashEnd.points.map(outOnSkirt);
  const k1 = sashPts[0];
  const sashTh = Math.atan2(k1[2] + 0.02, k1[0]);
  const tang = [-Math.sin(sashTh), 0, Math.cos(sashTh)], outW = [Math.cos(sashTh), 0, Math.sin(sashTh)];
  // a tied knot: the wrap of the band, and the two ears of the bow standing either side
  appendGeo(g, bun(V.add(k1, [0, 0.022, 0]), { rx: 0.018, ry: 0.0235, rz: 0.015, seg: 10, rings: 6, joint: pelvis, uvRect: lin, ridges: 3, tilt: [0.25, 1, 0.1] }));
  for (const s of [-1, 1]) {
    appendGeo(g, bun(V.add(V.add(k1, [0, 0.026 + 0.004 * s, 0]), V.add(V.mul(tang, s * 0.0235), V.mul(outW, -0.003))), { rx: 0.0185, ry: 0.0128, rz: 0.0095, seg: 8, rings: 5, joint: pelvis, uvRect: lin, ridges: 2, tilt: V.norm([tang[0] * s * 0.3 + 0.05, 1, tang[2] * s * 0.3]) }));
  }
  // the strip maps across u, along v; the sash cell runs along u: turn it
  const along = (geo, k = 1) => { for (let i = 0; i < geo.uv.length; i += 2) { const fu = (geo.uv[i] - lin[0]) / lin[2], fv = (geo.uv[i + 1] - lin[1]) / lin[3]; geo.uv[i] = lin[0] + lin[2] * fv * k; geo.uv[i + 1] = lin[1] + lin[3] * fu; } return geo; };
  appendGeo(g, along(stripAlong(sashPts, sashJ.slice(0, -1), { along: 8, width: (u) => 0.058 - 0.018 * u, side: tang, uvFront: lin, uvBack: lin, thick: 0.004, curl: 0.045 })));
  // the second tail, shorter, behind the first and a little forward (never on the chain)
  {
    const p2 = [V.add(k1, V.add(V.mul(tang, 0.016), [0, 0.012, 0])), V.add(k1, V.add(V.mul(tang, 0.03), [0, -0.075, 0.002])), V.add(k1, V.add(V.mul(tang, 0.036), [0, -0.165, 0.004]))];
    const pts = p2.map((q) => { const th = Math.atan2(q[2] + 0.02, q[0]); const rr = Math.max(clothField.radial(q[1], th, 0, -0.02, 0.03, 0.14), Math.hypot(q[0], q[2] + 0.02)) + 0.0065; return [Math.cos(th) * rr, q[1], -0.02 + Math.sin(th) * rr]; });
    const tail = stripAlong(pts, [pelvis, joints.thigh_l], { along: 5, width: (u) => 0.044 - 0.01 * u, side: tang, uvFront: lin, uvBack: lin, thick: 0.003, curl: 0.04 });
    appendGeo(g, along(tail, 0.6));
  }
  const sash = mk('sash', { trim: true });
  Object.assign(sash, { pos: g.pos, nrm: g.nrm, uv: g.uv, jnt: g.jnt, wgt: g.wgt, idx: g.idx });

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

  const parts = [underYoke, smock, binds, ...skirt, ...undr, sleeves, trousers, boots, girdle, sashBand, buckle, tongue, sling, sling.extra, pouch, sash, tie, cuffs, straps, tab];
  return { doc, trim, parts, joints, body, bodyPart, clothField, skinOf, W, H, TRIM_H, J, drape };
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
  const { node, material } = outfitDoc(doc, parts, { name: 'Outfit_Pan_1', matName: 'MI_Pan_1', tex, texPrefix: 'pan' });
  void node; void material;
  const file = path.join(out, OUTPUTS[0]);
  return writeOutfit(doc, file, {
    recipe: RECIPE, sources: ['mco-fantasy-standard', 'ubc-standard', 'brea-generated'], licence: 'CC0-1.0',
    r5Outfit: {
      ...PAN_SET, variant: 'pan-1', name: "Pan Whites I — Raker's Whites", density: +layout.D.toFixed(1), detailRep: +((W / layout.D) / 0.026).toFixed(1),
      pieces: ['underyoke', 'smock', 'binds', 'skirt', 'under', 'sleeves', 'trousers', 'boots', 'girdle', 'sashband', 'buckle', 'tongue', 'sling', 'slider', 'pouch', 'sash', 'tie', 'cuffs', 'straps', 'tab'],
    },
  });
}
