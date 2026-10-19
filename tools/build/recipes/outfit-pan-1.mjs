/**
 * CALIMA — recipe: Brea's default outfit, Pan Whites I — "Raker's Whites"
 * (hero-body W0b; handed to armory at W1 day 1; bible §3.9, §3.4; plan §4.1
 * "Brea outfit variant (merged) ≤ 17.5 k, 1 draw").
 *
 * OUTPUT public/models/hero/outfit-pan-1.glb — ONE skinned mesh on the UBC
 * skeleton (+ dyn_sashEnd), one material on the 1024² `pan` atlas (512² normal
 * + ORM). `src/hero/outfit.js` binds it to Brea's bones BY NAME at equip time
 * and culls the body triangles whose three vertices carry this set's hide bit
 * (`extras.r5Outfit.hideBit`, written by brea.mjs into `_HIDEMASK`).
 *
 * Pieces (MCO "Modular Character Outfits – Fantasy" [Standard], CC0):
 *   over-smock   Female_Peasant_Body   orchil-dyed linen #6B3F73, lapilli-leather
 *                                      girdle #1C1B1E at the waist, brass buckle
 *   sleeves      Female_Peasant_Arms   undyed linen #D9CFBA, ROLLED TO THE ELBOW:
 *                                      cut past the elbow (forearms and hands
 *                                      bare, so the ∴ on her right hand shows),
 *                                      a carmine #A3213A rolled cuff added
 *   trousers     Female_Peasant_Legs   basalt grey #4A4A50, wide
 *   boots        Female_Peasant_Feet   esparto-wrapped #B59A62, lapilli wraps.
 *                                      (The bible names the Ranger feet; the
 *                                      Peasant feet keep the whole set on ONE
 *                                      source texture and cost 2.6 k tris
 *                                      against the Ranger's 9.2 k.)
 *   sash         procedural            undyed linen knot at the left hip + the
 *                                      hanging end on dyn_sashEnd
 * Recolour = the source texel's luminance (folds, seams, stitching) times the
 * slot colour, painted per piece from that piece's own UV islands.
 */
import sharp from 'sharp';
import path from 'node:path';
import { joinPrimitives } from '@gltf-transform/functions';
import {
  ROOT, srcRoot, UBC_DIR, MCO_DIR, readGltf, cleanDoc, nodeByName, graft, addChain, jointIndex,
  newGeo, appendGeo, stripAlong, bun, positionMap, hex, smooth, noise3, writeSkinned, v3,
} from './lib/face.mjs';
import { CHAINS } from './brea.mjs';

export const LANE = 'hero-body';
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

const COL = {
  smock: hex('#6B3F73'), girdle: hex('#1C1B1E'), brass: hex('#B08A45'), linen: hex('#D9CFBA'),
  carmine: hex('#A3213A'), basalt: hex('#4A4A50'), esparto: hex('#B59A62'), lapilli: hex('#1C1B1E'),
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

export async function build({ out = ROOT } = {}) {
  const { doc, nodes, sleeves } = await assemble();
  const root = doc.getRoot();
  const mat = root.listMaterials().find((m) => /Peasant/.test(m.getName()));
  mat.setName('MI_Pan_1');

  // ---- free atlas blocks (in the source UV layout) for the procedural pieces
  const W = 1024;
  const maps = {};
  const used = new Uint8Array(W * W);
  for (const n of nodes) {
    const prim = n.getMesh().listPrimitives()[0];
    maps[n.getName()] = positionMap(prim, W, W);
    const pm = maps[n.getName()];
    for (let i = 0; i < W * W; i++) if (!Number.isNaN(pm.pos[i * 3])) used[i] = 1;
  }
  const free = freeBlocks(used, W, 48, 2);
  if (free.length < 2) throw new Error('outfit-pan-1: no free atlas blocks for the sash/cuff');
  const [linenBlk, carmineBlk] = free;
  const rect = (b) => [(b.x + 3) / W, (b.y + 3) / W, (b.s - 6) / W, (b.s - 6) / W];

  // ---- sash: knot at the left hip + the hanging end on dyn_sashEnd
  const sash = addChain(doc, CHAINS.sashEnd.names, CHAINS.sashEnd.points, CHAINS.sashEnd.parent);
  const pelvis = jointIndex(doc, 'pelvis');
  const g = newGeo();
  const k0 = CHAINS.sashEnd.points[0];
  appendGeo(g, bun([k0[0] - 0.004, k0[1] + 0.022, k0[2] + 0.010], { rx: 0.030, ry: 0.024, rz: 0.022, seg: 10, rings: 6, joint: pelvis, uvRect: rect(linenBlk), ridges: 2 }));
  appendGeo(g, stripAlong(CHAINS.sashEnd.points, sash.slice(0, -1), { along: 8, width: (u) => 0.060 - 0.012 * u, side: [0.35, 0, 0.94], uvFront: rect(linenBlk), uvBack: rect(linenBlk), thick: 0.004, curl: 0.05 }));
  // ---- rolled carmine cuffs where the sleeves were cut
  for (const sgn of [1, -1]) appendGeo(g, cuffRing(sleeves, sgn, doc, rect(carmineBlk)));
  const proc = primFromGeo(doc, g);
  proc.setMaterial(mat);

  // ---- the pan atlas
  const baseTex = mat.getBaseColorTexture();
  const src = await sharp(Buffer.from(baseTex.getImage())).resize(W, W, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const outImg = Buffer.from(src);
  const lumMean = {};
  for (const [slot, pm] of Object.entries(maps)) {
    let s = 0, n = 0;
    for (let i = 0; i < W * W; i++) if (!Number.isNaN(pm.pos[i * 3])) { s += src[i * 3] + src[i * 3 + 1] + src[i * 3 + 2]; n++; }
    lumMean[slot] = s / Math.max(1, n) / 765;
  }
  const paint = (o, c, detail) => { for (let k = 0; k < 3; k++) outImg[o + k] = Math.max(0, Math.min(255, Math.round(c[k] * detail))); };
  for (const [slot, pm] of Object.entries(maps)) {
    for (let i = 0; i < W * W; i++) {
      const o = i * 3;
      const X = pm.pos[o], Y = pm.pos[o + 1], Z = pm.pos[o + 2];
      if (Number.isNaN(X)) continue;
      const lum = (src[o] + src[o + 1] + src[o + 2]) / 765;
      const detail = Math.pow(Math.min(1.45, Math.max(0.55, lum / lumMean[slot])), 0.65);
      let c;
      if (slot === 'smock') {
        c = COL.smock;
        if (Y > 0.995 && Y < 1.062) c = COL.girdle;                               // the girdle
        if (Y > 1.012 && Y < 1.046 && Math.abs(X) < 0.022 && Z > 0.05) c = COL.brass; // its buckle
        if (Y < 1.004) c = COL.linen.map((v, k) => v * 0.94 + COL.smock[k] * 0.06);  // linen hem showing under it
      } else if (slot === 'sleeves') {
        c = COL.linen;
      } else if (slot === 'trousers') {
        c = COL.basalt;
      } else {
        // esparto wraps with lapilli bands every ~6 cm up the shin, rope sole
        const band = Math.abs(((Y + 0.01) / 0.062) % 1 - 0.5) < 0.09 && Y > 0.06;
        c = Y < 0.025 ? COL.esparto.map((v) => v * 0.78) : band ? COL.lapilli : COL.esparto;
        const rope = 0.9 + 0.1 * Math.sin(Y * 900 + X * 300);
        paint(o, c, detail * rope);
        continue;
      }
      paint(o, c, detail);
    }
  }
  // procedural blocks: linen weave and carmine
  for (const [blk, c] of [[linenBlk, COL.linen], [carmineBlk, COL.carmine]]) {
    for (let y = blk.y; y < blk.y + blk.s; y++) for (let x = blk.x; x < blk.x + blk.s; x++) {
      const w = 0.9 + 0.06 * Math.sin(x * 2.1) * Math.sin(y * 2.1) + 0.05 * (noise3(x * 0.2, y * 0.2, 3) - 0.5);
      paint((y * W + x) * 3, c, w);
    }
  }
  baseTex.setImage(await sharp(outImg, { raw: { width: W, height: W, channels: 3 } }).webp({ quality: 86, effort: 4 }).toBuffer())
    .setMimeType('image/webp').setURI('pan-1-base.webp');
  const nTex = mat.getNormalTexture();
  if (nTex) {
    const nb = await sharp(Buffer.from(nTex.getImage())).resize(512, 512, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
    for (const blk of [linenBlk, carmineBlk]) {
      for (let y = blk.y >> 1; y < (blk.y + blk.s) >> 1; y++) for (let x = blk.x >> 1; x < (blk.x + blk.s) >> 1; x++) {
        const o = (y * 512 + x) * 3; nb[o] = 128; nb[o + 1] = 128; nb[o + 2] = 255;
      }
    }
    nTex.setImage(await sharp(nb, { raw: { width: 512, height: 512, channels: 3 } }).webp({ quality: 90, effort: 4 }).toBuffer())
      .setMimeType('image/webp').setURI('pan-1-normal.webp');
  }
  const ormTex = mat.getMetallicRoughnessTexture();
  if (ormTex) {
    const ob = await sharp(Buffer.from(ormTex.getImage())).resize(512, 512, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
    for (let i = 0; i < 512 * 512; i++) ob[i * 3 + 2] = Math.min(ob[i * 3 + 2], 20);   // linen/leather: no metal
    ormTex.setImage(await sharp(ob, { raw: { width: 512, height: 512, channels: 3 } }).webp({ quality: 90, effort: 4 }).toBuffer())
      .setMimeType('image/webp').setURI('pan-1-orm.webp');
  }
  mat.setDoubleSided(false).setBaseColorFactor([1, 1, 1, 1]);

  // ---- merge everything into ONE primitive, one node
  const prims = nodes.map((n) => n.getMesh().listPrimitives()[0]).concat(proc);
  for (const p of prims) p.setMaterial(mat);
  const joined = joinPrimitives(prims);
  joined.setMaterial(mat);
  const skin = root.listSkins()[0];
  for (const n of nodes) { n.getMesh().dispose(); n.dispose(); }
  const node = doc.createNode('Outfit_Pan_1').setMesh(doc.createMesh('Outfit_Pan_1').addPrimitive(joined)).setSkin(skin)
    .setExtras({ r5Outfit: true });
  nodeByName(doc, 'Armature').addChild(node);
  for (const m of root.listMaterials()) if (m !== mat) m.dispose();
  for (const t of root.listTextures()) if (!t.listParents().some((p) => p.propertyType === 'Material')) t.dispose();

  const file = path.join(out, OUTPUTS[0]);
  return writeSkinned(doc, file, {
    provenance: { recipe: RECIPE, sources: ['mco-fantasy-standard', 'ubc-standard', 'brea-generated'], licence: 'CC0-1.0' },
    extras: { r5Outfit: { set: 'pan-1', name: "Pan Whites I — Raker's Whites", hideBit: HIDE_BIT, chains: ['dyn_sashEnd'], pieces: PIECES.map((p) => p.slot).concat(['sash', 'cuffs']) } },
  });
}

/** Largest-first free square blocks of `s` px in a used-mask (row-major scan). */
function freeBlocks(used, W, s, want) {
  const out = [];
  const taken = new Uint8Array(W * W);
  for (let y = 0; y + s <= W && out.length < want; y += s / 2) {
    for (let x = 0; x + s <= W && out.length < want; x += s / 2) {
      let ok = true;
      for (let yy = y; yy < y + s && ok; yy++) for (let xx = x; xx < x + s; xx++) if (used[yy * W + xx] || taken[yy * W + xx]) { ok = false; break; }
      if (!ok) continue;
      for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) taken[yy * W + xx] = 1;
      out.push({ x, y, s });
    }
  }
  return out;
}

/** A rolled cuff: a fat ring around the sleeve's cut edge, skinned like the edge. */
function cuffRing(sleeves, sgn, doc, uvRect) {
  const P = sleeves.getAttribute('POSITION'), J = sleeves.getAttribute('JOINTS_0'), Wt = sleeves.getAttribute('WEIGHTS_0');
  const idx = sleeves.getIndices().getArray();
  const p = [0, 0, 0];
  // the edge ring: kept vertices within 1.5 cm of the cut on this side
  const ring = [];
  const seen = new Set();
  for (const i of idx) {
    if (seen.has(i)) continue; seen.add(i);
    P.getElement(i, p);
    if (Math.sign(p[0]) === sgn && Math.abs(p[0]) > SLEEVE_CUT - 0.015) ring.push(i);
  }
  let cy = 0, cz = 0, cx = 0;
  for (const i of ring) { P.getElement(i, p); cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= ring.length; cy /= ring.length; cz /= ring.length;
  let rad = 0;
  for (const i of ring) { P.getElement(i, p); rad = Math.max(rad, Math.hypot(p[1] - cy, p[2] - cz)); }
  // skin the whole cuff like the nearest edge vertex (the elbow blend)
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  J.getElement(ring[0], j); Wt.getElement(ring[0], w);
  const g = newGeo();
  const SEG = 16, ROWS = 3;
  for (let r = 0; r <= ROWS; r++) {
    const a = (r / ROWS) * Math.PI;                     // half torus: rolled lip
    const off = -sgn * 0.012 * (1 - Math.cos(a)) * 0.5;
    const rr = rad + 0.004 + 0.008 * Math.sin(a);
    for (let k = 0; k <= SEG; k++) {
      const th = (k / SEG) * Math.PI * 2;
      const dy = Math.cos(th), dz = Math.sin(th);
      g.pos.push(cx + off, cy + dy * rr, cz + dz * rr);
      g.nrm.push(Math.cos(a) * -sgn * 0.3, dy, dz);
      g.uv.push(uvRect[0] + (k / SEG) * uvRect[2], uvRect[1] + (r / ROWS) * uvRect[3]);
      g.jnt.push(...j); g.wgt.push(...w);
    }
  }
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < SEG; k++) {
    const a = r * (SEG + 1) + k, b = a + 1, c = a + SEG + 1, d = c + 1;
    if (sgn > 0) g.idx.push(a, c, b, b, c, d); else g.idx.push(a, b, c, b, d, c);
  }
  void doc; void v3;
  return g;
}

function primFromGeo(doc, g) {
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(g.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(g.jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(g.wgt)))
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)));
}
void smooth;
