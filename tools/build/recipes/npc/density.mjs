/**
 * CALIMA — texel density of a person, measured off the shipped GLBs (people; BUILD M1.5b, TECH §6 "faces equal to
 * Brea's, cloth and leather at no less than 60 % of her linear density at 3 m").
 *
 *   node tools/build/recipes/npc/density.mjs            Brea against Ansel (the Guild Matron), as JSON
 *
 * Linear density is texels per metre of the person's WORLD surface (the GLB's raw bind space times the scale the game
 * gives it: Brea's r5Hero.scale, an NPC's r5Npc.scale). Per triangle: sqrt(uv area x W x H / world area); a region's
 * figure is the area-weighted median over its triangles (a few stretched or tiled triangles do not move it), with the
 * area-weighted mean beside it.
 *
 * Regions, in the UBC female pack's bind frame (both bodies are that pack; a male NPC's head is 42 mm higher):
 *   face    skin triangles in front of the ears, chin to brow, the eyes' own patch excluded
 *   outfit  every triangle of the near outfit mesh (Brea: outfit-pan-1.glb, cloth and trim; an NPC: Outfit_L0)
 *   cloth   the outfit's triangles whose uv lies above the set's trim band (the packed garment islands only)
 */
import path from 'node:path';
import { io, ROOT } from '../lib/human/face.mjs';

const tri3 = (a, b, c) => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
};
const tri2 = (a, b, c) => 0.5 * Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));

/**
 * The bind-space matrix of a skinned node's (quantised) positions: the writer folds its dequantisation into the inverse
 * bind matrices, so joint world x inverse bind is the same matrix for every joint in the bind pose.
 */
function bindMatrix(node) {
  const skin = node.getSkin();
  if (!skin) return node.getWorldMatrix();
  const j = skin.listJoints()[0], ibm = skin.getInverseBindMatrices();
  const I = ibm ? ibm.getElement(0, new Array(16).fill(0)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const Wm = j.getWorldMatrix(), o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += Wm[k * 4 + r] * I[c * 4 + k];
  return o;
}
const apply = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];

/** The uv transform a quantising writer may have put on the base colour (KHR_texture_transform): offset + scale. */
function uvXform(prim) {
  const info = prim.getMaterial()?.getBaseColorTextureInfo();
  const ext = info?.getExtension?.('KHR_texture_transform');
  if (!ext) return (u) => u;
  const o = ext.getOffset(), s = ext.getScale();
  return (u) => [o[0] + u[0] * s[0], o[1] + u[1] * s[1]];
}

/** Per-triangle density samples of a primitive: { d (texels/m), w (world m²), c (bind centroid), uv (uv centroid) }. */
function samples(prim, { W, H, scale, dy = 0, M = null }) {
  const P = prim.getAttribute('POSITION'), U = prim.getAttribute('TEXCOORD_0');
  if (!U) return [];
  const X = uvXform(prim);
  const idx = prim.getIndices()?.getArray() || Array.from({ length: P.getCount() }, (_, i) => i);
  const out = [];
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], u = [[0, 0], [0, 0], [0, 0]];
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) { P.getElement(idx[t + k], p[k]); if (M) p[k] = apply(M, p[k]); U.getElement(idx[t + k], u[k]); u[k] = X(u[k]); }
    const wa = tri3(p[0], p[1], p[2]) * scale * scale, ua = tri2(u[0], u[1], u[2]) * W * H;
    if (wa < 1e-10 || ua <= 0) continue;
    out.push({
      d: Math.sqrt(ua / wa), w: wa, t: [u[0].slice(), u[1].slice(), u[2].slice()], W, H,
      c: [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3 - dy, (p[0][2] + p[1][2] + p[2][2]) / 3],
      uv: [(u[0][0] + u[1][0] + u[2][0]) / 3, (u[0][1] + u[1][1] + u[2][1]) / 3],
    });
  }
  return out;
}

/**
 * Unique texels: the texels the set's triangles cover, each counted once however many triangles map onto it (a tiled
 * strap, a mirrored sleeve, a faction atlas several people share), rasterised at the texture's own size.
 */
function uniqueTexels(S) {
  if (!S.length) return 0;
  const W = S[0].W, H = S[0].H, bits = new Uint8Array(W * H);
  let n = 0;
  for (const q of S) {
    const [a, b, c] = q.t.map((v) => [v[0] * W, v[1] * H]);
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d;
      if (l1 < -0.02 || l2 < -0.02 || 1 - l1 - l2 < -0.02) continue;
      const k = y * W + x;
      if (!bits[k]) { bits[k] = 1; n++; }
    }
  }
  return n;
}

/** The area-weighted median and mean of a sample set, and its unique-texel density. */
export function summarise(S) {
  if (!S.length) return { median: 0, mean: 0, unique: 0, areaM2: 0, tris: 0 };
  const s = S.slice().sort((a, b) => a.d - b.d);
  const tot = s.reduce((a, q) => a + q.w, 0);
  let acc = 0, med = s[s.length - 1].d;
  for (const q of s) { acc += q.w; if (acc >= tot / 2) { med = q.d; break; } }
  const mean = s.reduce((a, q) => a + q.d * q.w, 0) / tot;
  const uniq = Math.sqrt(uniqueTexels(S) / tot);
  return { median: +med.toFixed(1), mean: +mean.toFixed(1), unique: +uniq.toFixed(1), areaM2: +tot.toFixed(4), tris: s.length };
}

/** The face window (bind frame, female pack; `dy` already taken off): in front of the ears, chin to brow. */
export const FACE = (c) => c[1] > 1.535 && c[1] < 1.705 && c[2] > 0.02 && Math.abs(c[0]) < 0.068;

const meshNodes = (doc, re) => doc.getRoot().listNodes().filter((n) => n.getMesh() && re.test(n.getName()));
const meshPrims = (doc, re) => meshNodes(doc, re).flatMap((n) => n.getMesh().listPrimitives());
const sizeOf = (prim) => prim.getMaterial()?.getBaseColorTexture()?.getSize() || null;
const inEye = (uv, eye) => eye.some((e) => uv[0] >= e.x && uv[0] <= e.x + e.w && uv[1] >= e.y && uv[1] <= e.y + e.h);

/**
 * Measure one person. `kind` 'hero' (brea.glb + its outfit GLB) or 'npc' (one people GLB). `outfitTex` is the outfit
 * atlas size when the GLB does not carry its own maps (the shared faction atlas, resolved at spawn).
 */
export async function measure({ kind, file, outfitFile = null, outfitTex = null }) {
  const IO = await io();
  const doc = await IO.read(file);
  const A = doc.getRoot().getAsset().extras || {};
  const scale = kind === 'hero' ? A.r5Hero.scale : A.r5Npc.scale;
  const dy = kind === 'hero' ? 0 : A.r5Npc.sex === 'M' ? 0.0425 : 0;
  const eye = [].concat(A.r5Paint?.layout?.eyePatch || []);
  const faceS = [];
  for (const nd of meshNodes(doc, kind === 'hero' ? /^Brea_Skin$/ : /^Skin_L0$/)) for (const pr of nd.getMesh().listPrimitives()) {
    const sz = sizeOf(pr) || [1024, 1024];
    for (const q of samples(pr, { W: sz[0], H: sz[1], scale, dy, M: bindMatrix(nd) })) if (FACE(q.c) && !inEye(q.uv, eye)) faceS.push(q);
  }
  let oDoc = doc, oRe = /^Outfit_L0$/, oScale = scale, trimV = null;
  if (kind === 'hero') { oDoc = await IO.read(outfitFile); oRe = /^Outfit_/; }
  const oA = oDoc.getRoot().getAsset().extras || {};
  const oInfo = kind === 'hero' ? oA.r5Outfit : A.r5Npc?.outfitAtlas || null;
  if (oInfo?.trimV != null) trimV = oInfo.trimV;
  else if (kind === 'hero') trimV = 1 - 214 / 1024;      // outfit-pan-1.mjs TRIM_H on its 1024² sheet
  const outS = [], clothS = [];
  for (const nd of meshNodes(oDoc, oRe)) for (const pr of nd.getMesh().listPrimitives()) {
    const sz = sizeOf(pr) || outfitTex || [1024, 1024];
    for (const q of samples(pr, { W: sz[0], H: sz[1], scale: oScale, dy, M: bindMatrix(nd) })) {
      outS.push(q);
      if (trimV != null && q.uv[1] < trimV) clothS.push(q);
    }
  }
  return {
    file: path.relative(ROOT, file), scale, face: summarise(faceS), outfit: summarise(outS), cloth: trimV != null ? summarise(clothS) : null,
    outfitTex: (meshPrims(oDoc, oRe)[0] && sizeOf(meshPrims(oDoc, oRe)[0])) || outfitTex,
  };
}

/** Brea against one NPC: the M1.5b ratios. */
export async function compare(npcId = 'guild-matron') {
  const brea = await measure({ kind: 'hero', file: path.join(ROOT, 'public/models/hero/brea.glb'), outfitFile: path.join(ROOT, 'public/models/hero/outfit-pan-1.glb') });
  const npc = await measure({ kind: 'npc', file: path.join(ROOT, `public/models/npc/${npcId}.glb`), outfitTex: [1024, 1024] });
  const r = (a, b) => (b ? +(a / b).toFixed(3) : null);
  return {
    brea, [npcId]: npc,
    ratio: {
      face: r(npc.face.median, brea.face.median),
      faceUnique: r(npc.face.unique, brea.face.unique),
      outfit: r(npc.outfit.median, brea.outfit.median),
      outfitUnique: r(npc.outfit.unique, brea.outfit.unique),
      cloth: npc.cloth && brea.cloth ? r(npc.cloth.median, brea.cloth.median) : null,
      clothUnique: npc.cloth && brea.cloth ? r(npc.cloth.unique, brea.cloth.unique) : null,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await compare(process.argv[2] || 'guild-matron'), null, 1));
}
