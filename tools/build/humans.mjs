/**
 * CALIMA — the HUMAN build library (pipeline lane, W0b; promoted from the
 * Round-5 proof `tools/r5-poc/build-human.mjs`, plan §2 "promoted from
 * tools/r5-poc/: humans.mjs"). Node only, no Blender.
 *
 * Every function below is the proof's, statement for statement; the promotion
 * changes the ENVELOPE only:
 *   - sources come from `models-staging/r5-src/` (or R5_SRC), never from a
 *     scratch path, and are resolved through the source lock
 *     (`sourcePaths()` -> tools/build/sources.mjs `sourceDir(rowId)`), so the
 *     build is offline and reproducible
 *     (A-build-deterministic, A-sources-staged);
 *   - every written GLB carries `asset.extras.provenance` (generator, recipe,
 *     sources = row ids, licence) and `asset.extras.r5Stats`
 *     (`writeHuman()`), like tools/build/lib/glb.mjs (A-ID-ip-assets-gone,
 *     A-glb-budget);
 *   - logs go to stderr and only with R5_BUILD_VERBOSE=1 (the build driver
 *     prints exactly one JSON line on stdout);
 *   - no clocks, no randomness.
 *
 * CONTRACT for recipe authors (hero-body `recipes/brea.mjs`, settlements
 * `recipes/npc/**`, armory `recipes/armor/**`):
 *
 *   import * as H from '../humans.mjs';          // from tools/build/recipes/
 *   const S = H.sourcePaths();                   // { src, ubc, hair, mco, ual2 } absolute dirs
 *   const doc = await H.readGltf(path.join(S.ubc, 'Superhero_Female_FullBody.gltf'));
 *   H.cleanDoc(doc);                             // drop TEXCOORD_1+/COLOR_n, fold 8 -> 4 influences
 *   H.headCut(doc, bodyNode, ['Head', 'neck_01'], 'Body_Head');
 *   H.graft(doc, partDoc, label) -> Node[]       // re-point a part at the base skin by joint name (LBS re-bind if the bind differs)
 *   H.addBraid(doc, { color, rootRadius })       // dyn_hairBraid_01..06 + _07_end under Head
 *   H.joinByMaterial(doc, nodes, name, keepSeparate: RegExp[])
 *   await H.writeHuman(doc, outFile, { texSize: 1024, hairTexSize: 512,
 *     provenance: { recipe: 'tools/build/recipes/brea.mjs', sources: ['ubc-standard', 'mco-fantasy-standard'], licence: 'CC0-1.0' } })
 *     -> { kb, tris, prims, stats }
 *   H.buildHeroineBase(file, opts) / H.buildMaleBase(file, opts) / H.buildOutfit(name, file, opts), H.OUTFITS
 *     the proof's three builders (opts.provenance required), used by tools/build/pipeline/gen-humans-proof.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  mergeDocuments, prune, dedup, joinPrimitives, textureCompress, meshopt, unpartition,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProvenance } from './lib/glb.mjs';
import { sourceDir, srcDir } from './sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const log = (...a) => { if (process.env.R5_BUILD_VERBOSE) console.error(...a); };

await MeshoptEncoder.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

/**
 * Source directories inside r5-src (tools/build/sources.mjs layout; each row's
 * directory comes from the lock, `sourceDir(rowId)`):
 *   ubc  = <src>/ubc/Base Characters/Godot - UE                         row ubc-standard
 *   hair = <src>/ubc/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal) row ubc-standard
 *   mco  = <src>/mco/Modular Parts                                       row mco-fantasy-standard
 *   ual2 = <src>/ual2                                                    row ual2-standard (UAL2_Standard.glb)
 */
export function sourcePaths(src = srcDir(ROOT)) {
  const env = { R5_SRC: src };
  const ubc = sourceDir('ubc-standard', { root: ROOT, env });
  const S = {
    src,
    ubc: path.join(ubc, 'Base Characters/Godot - UE'),
    hair: path.join(ubc, 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)'),
    mco: path.join(sourceDir('mco-fantasy-standard', { root: ROOT, env }), 'Modular Parts'),
    ual2: sourceDir('ual2-standard', { root: ROOT, env }),
  };
  for (const [k, d] of Object.entries(S)) {
    if (existsSync(d)) continue;
    const err = new Error(`humans.mjs: source dir missing (${k}): ${d} — stage it with tools/build/sources.mjs`);
    err.code = 'R5_SRC_MISSING';   // build-assets.mjs isMissingSource(): "blocked on A-sources-staged", not a broken recipe
    throw err;
  }
  return S;
}

/** r5Stats of a document (tris, verts, materials, meshes, textures, bones), like lib/glb.mjs. */
export function docStats(doc) {
  const root = doc.getRoot();
  let tris = 0, verts = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    verts += p.getAttribute('POSITION').getCount();
  }
  const bones = root.listSkins().reduce((n, s) => Math.max(n, s.listJoints().length), 0);
  return { tris, verts, materials: root.listMaterials().length, meshes: root.listMeshes().length, textures: root.listTextures().length, bones };
}

/** The proof's write() + provenance and r5Stats in asset.extras. */
export async function writeHuman(doc, file, { texSize = 1024, hairTexSize = 512, provenance, extras = {} } = {}) {
  const prov = checkProvenance(provenance);
  mkdirSync(path.dirname(file), { recursive: true });
  const asset = doc.getRoot().getAsset();
  asset.generator = 'CALIMA tools/build (gltf-transform)';
  const pre = docStats(doc);
  const res = await writeRawStamped(doc, file, texSize, hairTexSize, () => {
    doc.getRoot().getAsset().extras = { ...extras, provenance: prov, r5Stats: pre };
  });
  return { ...res, stats: pre };
}

/** Read a .gltf, repairing image URIs the pack ships under a different name. */
export async function readGltf(file) {
  const dir = path.dirname(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const resources = {};
  for (const b of json.buffers || []) resources[b.uri] = new Uint8Array(readFileSync(path.join(dir, b.uri)));
  for (const im of json.images || []) {
    let uri = im.uri;
    const cands = [uri, uri.replace(/_png\.png$/, '.png'), uri.replace(/\.png$/, '_png.png')];
    const hit = cands.find((u) => existsSync(path.join(dir, u)));
    if (!hit) throw new Error(`missing image ${uri} for ${file}`);
    if (hit !== uri) { im.uri = hit; uri = hit; }
    resources[uri] = new Uint8Array(readFileSync(path.join(dir, uri)));
  }
  return io.readJSON({ json, resources });
}

/* ------------------------------------------------------------- cleaning */

/** Step 2 + 3: drop unread attributes, fold 8 influences to 4. */
export function cleanPrimitive(prim) {
  for (const sem of prim.listSemantics()) {
    if (/^TEXCOORD_[1-9]$/.test(sem) || /^COLOR_\d$/.test(sem)) prim.setAttribute(sem, null);
  }
  const j1 = prim.getAttribute('JOINTS_1'), w1 = prim.getAttribute('WEIGHTS_1');
  const j0 = prim.getAttribute('JOINTS_0'), w0 = prim.getAttribute('WEIGHTS_0');
  if (j1 && w1) {
    const n = j0.getCount();
    const J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
    const a = [0, 0, 0, 0], b = [0, 0, 0, 0], c = [0, 0, 0, 0], d = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      j0.getElement(i, a); w0.getElement(i, b); j1.getElement(i, c); w1.getElement(i, d);
      const inf = [0, 1, 2, 3].map((k) => [a[k], b[k]]).concat([0, 1, 2, 3].map((k) => [c[k], d[k]]));
      inf.sort((p, q) => q[1] - p[1]);
      let s = 0;
      for (let k = 0; k < 4; k++) s += inf[k][1];
      for (let k = 0; k < 4; k++) { J[i * 4 + k] = inf[k][0]; W[i * 4 + k] = s > 0 ? inf[k][1] / s : (k === 0 ? 1 : 0); }
    }
    j0.setArray(J).setType('VEC4'); w0.setArray(W).setType('VEC4');
    prim.setAttribute('JOINTS_1', null); prim.setAttribute('WEIGHTS_1', null);
  }
  // one component type per semantic, so parts can be JOINED into one draw
  const J = prim.getAttribute('JOINTS_0');
  if (J && !(J.getArray() instanceof Uint16Array)) J.setArray(Uint16Array.from(J.getArray())).setNormalized(false);
  const W = prim.getAttribute('WEIGHTS_0');
  if (W && !(W.getArray() instanceof Float32Array)) {
    const n = W.getCount(), out = new Float32Array(n * 4), e = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) { W.getElement(i, e); out.set(e, i * 4); }
    W.setArray(out).setNormalized(false);
  }
  const I = prim.getIndices();
  if (I && !(I.getArray() instanceof Uint32Array)) I.setArray(Uint32Array.from(I.getArray()));
}

export function cleanDoc(doc) {
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) cleanPrimitive(p);
}

/* ---------------------------------------------------------------- graft */

function ibmOf(skin) {
  const acc = skin.getInverseBindMatrices();
  const out = new Map();
  const e = new Array(16);
  skin.listJoints().forEach((j, i) => { acc.getElement(i, e); out.set(j.getName(), e.slice()); });
  return out;
}

/** 4x4 column-major multiply / rigid inverse (IBMs are rotation + translation). */
const m4 = {
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  inv(m) {
    const o = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
    o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]);
    o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]);
    o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
    return o;
  },
};

/**
 * Step 4: merge `part` into `base`, re-pointing every skinned mesh at the base
 * skin by joint NAME. Only the joints the part's geometry actually USES are
 * compared. Where the part was authored on a different bind (UBC hair is
 * authored on the female skeleton; the male head sits 5 cm higher), the
 * vertices are RE-BOUND by linear-blend skinning them from the part's bind to
 * the base's: v' = sum_j w_j * inv(IBM_base[j]) * IBM_part[j] * v. A part on the
 * same bind (every female piece here) is untouched.
 */
export function graft(base, part, label) {
  const bSkin = base.getRoot().listSkins()[0];
  const bJoints = bSkin.listJoints().map((j) => j.getName());
  const bIndex = new Map(bJoints.map((n, i) => [n, i]));
  const bIbm = ibmOf(bSkin);
  const pSkin = part.getRoot().listSkins()[0];
  const pJoints = pSkin.listJoints().map((j) => j.getName());
  const pIbm = ibmOf(pSkin);
  const used = new Set();
  const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
  for (const n of part.getRoot().listNodes()) {
    if (!n.getMesh() || n.getSkin() !== pSkin) continue;
    for (const prim of n.getMesh().listPrimitives()) {
      const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      for (let i = 0; i < J.getCount(); i++) {
        J.getElement(i, jj); W.getElement(i, ww);
        for (let k = 0; k < 4; k++) if (ww[k] > 0) used.add(pJoints[jj[k]]);
      }
    }
  }
  let worst = 0;
  const delta = new Array(pJoints.length).fill(null);
  for (const n of used) {
    if (!bIndex.has(n)) throw new Error(`${label}: joint ${n} not on base skeleton`);
    const A = bIbm.get(n), B = pIbm.get(n);
    let d = 0;
    for (let k = 0; k < 16; k++) d = Math.max(d, Math.abs(A[k] - B[k]));
    worst = Math.max(worst, d);
    if (d > 1e-4) delta[pJoints.indexOf(n)] = m4.mul(m4.inv(A), B);
  }
  const rebound = delta.some(Boolean);

  const map = mergeDocuments(base, part);
  const armature = base.getRoot().listNodes().find((n) => n.getName() === 'Armature') || null;
  const remap = pJoints.map((n) => bIndex.get(n));
  const made = [];
  for (const pn of part.getRoot().listNodes()) {
    if (!pn.getMesh()) continue;
    const tn = map.get(pn);
    for (const prim of tn.getMesh().listPrimitives()) {
      const J = prim.getAttribute('JOINTS_0');
      if (!J) continue;
      if (rebound) rebindPrimitive(prim, delta);
      const arr = J.getArray();
      const out = new Uint16Array(arr.length);
      for (let i = 0; i < arr.length; i++) out[i] = remap[arr[i]] ?? 0;
      J.setArray(out);
    }
    tn.setSkin(bSkin);
    for (const p of tn.listParents()) if (p.propertyType === 'Node') p.removeChild(tn);
    (armature || base.getRoot().listScenes()[0]).addChild(tn);
    made.push(tn);
  }
  // drop the part's own armature, joints, skin and scene
  for (const pn of part.getRoot().listNodes()) if (!pn.getMesh()) map.get(pn)?.dispose();
  map.get(pSkin)?.dispose();
  for (const s of part.getRoot().listScenes()) map.get(s)?.dispose();
  log(`  graft ${label}: ${made.length} mesh node(s), ${used.size} joints used, `
    + `ibm max delta ${worst.toExponential(1)}${rebound ? ' -> RE-BOUND by LBS' : ''}`);
  return made;
}

/** LBS a primitive's bind-pose positions/normals through per-joint deltas (null = identity). */
export function rebindPrimitive(prim, delta) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL');
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const p = [0, 0, 0], n = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  const pos = new Float32Array(P.getCount() * 3), nrm = N ? new Float32Array(N.getCount() * 3) : null;
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p); J.getElement(i, j); W.getElement(i, w);
    if (N) N.getElement(i, n);
    const M = new Array(16).fill(0);
    let s = 0;
    for (let k = 0; k < 4; k++) {
      if (!(w[k] > 0)) continue;
      const D = delta[j[k]];
      for (let e = 0; e < 16; e++) M[e] += w[k] * (D ? D[e] : (e % 5 === 0 ? 1 : 0));
      s += w[k];
    }
    if (s <= 0) { M[0] = M[5] = M[10] = M[15] = 1; }
    pos[i * 3] = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12];
    pos[i * 3 + 1] = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13];
    pos[i * 3 + 2] = M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14];
    if (N) {
      const x = M[0] * n[0] + M[4] * n[1] + M[8] * n[2], y = M[1] * n[0] + M[5] * n[1] + M[9] * n[2],
        z = M[2] * n[0] + M[6] * n[1] + M[10] * n[2];
      const l = Math.hypot(x, y, z) || 1;
      nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
    }
  }
  P.setArray(pos);
  if (N) N.setArray(nrm);
}

/* --------------------------------------------------------- head/neck cut */

/** Step 5: triangles any of whose vertices are >= 50 % Head/neck weighted. */
export function headCut(doc, srcNode, keepNames, name) {
  const skin = srcNode.getSkin();
  const keep = new Set(skin.listJoints().map((j, i) => (keepNames.includes(j.getName()) ? i : -1)).filter((i) => i >= 0));
  const prim = srcNode.getMesh().listPrimitives()[0];
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const n = J.getCount();
  const isHead = new Uint8Array(n);
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    J.getElement(i, j); W.getElement(i, w);
    let s = 0;
    for (let k = 0; k < 4; k++) if (keep.has(j[k])) s += w[k];
    isHead[i] = s >= 0.5 ? 1 : 0;
  }
  const idx = prim.getIndices().getArray();
  const kept = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (isHead[idx[t]] || isHead[idx[t + 1]] || isHead[idx[t + 2]]) kept.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const p2 = prim.clone();
  p2.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(prim.getIndices().getBuffer()));
  const mesh = doc.createMesh(name).addPrimitive(p2);
  const node = doc.createNode(name).setMesh(mesh).setSkin(skin);
  srcNode.listParents().find((p) => p.propertyType === 'Node')?.addChild(node);
  log(`  head cut: ${kept.length / 3} of ${idx.length / 3} tris kept`);
  return node;
}

/* ------------------------------------------------------- procedural braid */

const _m = {
  mul(a, b) { // column-major 4x4
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  inv(m) { // affine inverse (rotation + translation, uniform scale 1)
    const o = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
    const t = [m[12], m[13], m[14]];
    o[12] = -(o[0] * t[0] + o[4] * t[1] + o[8] * t[2]);
    o[13] = -(o[1] * t[0] + o[5] * t[1] + o[9] * t[2]);
    o[14] = -(o[2] * t[0] + o[6] * t[1] + o[10] * t[2]);
    return o;
  },
};

/** quaternion that turns +Y onto unit vector d */
function quatYTo(d) {
  const [x, y, z] = d;
  const dot = y;
  if (dot < -0.9999) return [1, 0, 0, 0];
  // axis = Y x d = (z, 0, -x)
  const ax = z, az = -x;
  const q = [ax, 0, az, 1 + dot];
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}
function quatToMat(q, t) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    t[0], t[1], t[2], 1,
  ];
}
function matToQuat(m) {
  const t = m[0] + m[5] + m[10];
  let x, y, z, w;
  if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); w = 0.25 / s; x = (m[6] - m[9]) * s; y = (m[8] - m[2]) * s; z = (m[1] - m[4]) * s; }
  else if (m[0] > m[5] && m[0] > m[10]) { const s = 2 * Math.sqrt(1 + m[0] - m[5] - m[10]); w = (m[6] - m[9]) / s; x = 0.25 * s; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s; }
  else if (m[5] > m[10]) { const s = 2 * Math.sqrt(1 + m[5] - m[0] - m[10]); w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = 0.25 * s; z = (m[9] + m[6]) / s; }
  else { const s = 2 * Math.sqrt(1 + m[10] - m[0] - m[5]); w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = 0.25 * s; }
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}

/**
 * Step 6. Joints are placed in MODEL space (the glTF scene frame of the base:
 * +Y up, +Z forward, metres) and converted to Head-local TRS + inverse-bind
 * matrices. The tube is skinned by arc length to the two nearest joints.
 */
export function addBraid(doc, { color = [0.11, 0.07, 0.05], rootRadius = 0.034 } = {}) {
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const head = skin.listJoints().find((j) => j.getName() === 'Head');
  const headW = head.getWorldMatrix();
  { // sanity: this frame is the one the pack's IBMs were written in (IBM * world = I)
    const e = new Array(16);
    skin.getInverseBindMatrices().getElement(skin.listJoints().indexOf(head), e);
    const I = _m.mul(e, Array.from(headW));
    const err = Math.max(...I.map((v, k) => Math.abs(v - ((k % 5 === 0) ? 1 : 0))));
    if (err > 1e-3) throw new Error(`Head IBM*world != I (${err})`);
  }
  const P = [ // model-space joint path: crown-back -> down the spine line
    [0, 1.640, -0.108], [0, 1.560, -0.140], [0, 1.475, -0.158], [0, 1.390, -0.168],
    [0, 1.305, -0.172], [0, 1.225, -0.170], [0, 1.150, -0.166],
  ];
  const names = ['dyn_hairBraid_01', 'dyn_hairBraid_02', 'dyn_hairBraid_03', 'dyn_hairBraid_04',
    'dyn_hairBraid_05', 'dyn_hairBraid_06', 'dyn_hairBraid_07_end'];
  const worlds = [];
  let parent = head, parentW = headW;
  const ibmAcc = skin.getInverseBindMatrices();
  const ibm = Array.from(ibmAcc.getArray());
  const jointIdx = [];
  for (let i = 0; i < P.length; i++) {
    const nxt = P[Math.min(i + 1, P.length - 1)], cur = P[i];
    let d = i + 1 < P.length ? [nxt[0] - cur[0], nxt[1] - cur[1], nxt[2] - cur[2]]
      : [cur[0] - P[i - 1][0], cur[1] - P[i - 1][1], cur[2] - P[i - 1][2]];
    const l = Math.hypot(...d); d = d.map((v) => v / l);
    const W = quatToMat(quatYTo(d), cur);
    const L = _m.mul(_m.inv(parentW), W);
    const node = doc.createNode(names[i])
      .setTranslation([L[12], L[13], L[14]])
      .setRotation(matToQuat(L));
    parent.addChild(node);
    skin.addJoint(node);
    jointIdx.push(skin.listJoints().length - 1);
    ibm.push(..._m.inv(W));
    worlds.push(W);
    parent = node; parentW = W;
  }
  ibmAcc.setArray(new Float32Array(ibm));

  // ---- plaited tube: 3 lobes twisting along the length
  const RING = 12, ALONG = 46;
  const pos = [], nrm = [], uv = [], jnt = [], wgt = [], idx = [];
  const segLen = [];
  let total = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1], P[i + 1][2] - P[i][2]);
    segLen.push(l); total += l;
  }
  const sample = (s) => { // arc length -> (point, tangent, segment index, frac)
    let acc = 0;
    for (let i = 0; i < segLen.length; i++) {
      if (s <= acc + segLen[i] || i === segLen.length - 1) {
        const f = Math.min(1, Math.max(0, (s - acc) / segLen[i]));
        const a = P[i], b = P[i + 1];
        const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]].map((v) => v / segLen[i]);
        return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], t, i, f };
      }
      acc += segLen[i];
    }
    return null;
  };
  for (let a = 0; a <= ALONG; a++) {
    const u = a / ALONG, s = u * total;
    const { p, t, i, f } = sample(s);
    // ring frame: side = X (braid hangs in the sagittal plane), up = t x side
    const side = [1, 0, 0];
    const up = [t[1] * side[2] - t[2] * side[1], t[2] * side[0] - t[0] * side[2], t[0] * side[1] - t[1] * side[0]];
    const taper = u < 0.06 ? 0.75 + 0.25 * (u / 0.06) : 1 - 0.55 * Math.pow((u - 0.06) / 0.94, 1.3);
    const r0 = rootRadius * taper;
    // skin: blend joint i -> i+1 by fraction, last ring all on the last driven joint
    const ja = jointIdx[Math.min(i, jointIdx.length - 2)], jb = jointIdx[Math.min(i + 1, jointIdx.length - 2)];
    const wb = i + 1 >= jointIdx.length - 1 ? 0 : f;
    for (let r = 0; r <= RING; r++) {
      const th = (r / RING) * Math.PI * 2;
      // three plaits: radius bulges 3x per turn, the bulge pattern twists down the length
      const lobe = 1 + 0.22 * Math.max(0, Math.cos(3 * th + u * 38));
      const rr = r0 * lobe;
      const cx = Math.cos(th), cy = Math.sin(th);
      const n = [side[0] * cx + up[0] * cy, side[1] * cx + up[1] * cy, side[2] * cx + up[2] * cy];
      pos.push(p[0] + n[0] * rr, p[1] + n[1] * rr, p[2] + n[2] * rr);
      nrm.push(...n);
      uv.push(r / RING, u * 6);
      jnt.push(ja, jb, 0, 0);
      wgt.push(1 - wb, wb, 0, 0);
    }
  }
  for (let a = 0; a < ALONG; a++) {
    for (let r = 0; r < RING; r++) {
      const i0 = a * (RING + 1) + r, i1 = i0 + 1, i2 = i0 + RING + 1, i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const buf = root.listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(nrm)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(wgt)))
    .setIndices(acc('SCALAR', new Uint32Array(idx)));
  const mat = doc.createMaterial('MI_Braid').setBaseColorFactor([...color, 1])
    .setRoughnessFactor(0.72).setMetallicFactor(0);
  // borrow the hair strand normal map so the plaits catch light like the hair
  const hairMat = root.listMaterials().find((m) => /Hair/.test(m.getName()));
  if (hairMat?.getNormalTexture()) mat.setNormalTexture(hairMat.getNormalTexture());
  if (hairMat?.getBaseColorTexture()) mat.setBaseColorTexture(hairMat.getBaseColorTexture());
  prim.setMaterial(mat);
  const node = doc.createNode('Braid').setMesh(doc.createMesh('Braid').addPrimitive(prim)).setSkin(skin);
  root.listNodes().find((n) => n.getName() === 'Armature')?.addChild(node);
  log(`  braid: ${names.length - 1} driven joints + _end, ${idx.length / 3} tris`);
  return node;
}

/* ------------------------------------------------------------ finishing */

/** Join every primitive that shares a material, per mesh-node group. */
export function joinByMaterial(doc, nodes, name, keepSeparate = []) {
  const groups = new Map();
  for (const n of nodes) {
    if (keepSeparate.some((re) => re.test(n.getName()))) continue;
    for (const p of n.getMesh().listPrimitives()) {
      const k = p.getMaterial();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ n, p });
    }
  }
  const skin = nodes[0].getSkin();
  const parent = nodes[0].listParents().find((x) => x.propertyType === 'Node');
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const joined = joinPrimitives(list.map((e) => e.p));
    joined.setMaterial(mat);
    const node = doc.createNode(`${name}_${mat.getName()}`)
      .setMesh(doc.createMesh(`${name}_${mat.getName()}`).addPrimitive(joined)).setSkin(skin);
    parent.addChild(node);
    for (const e of list) e.n.getMesh().removePrimitive(e.p);
  }
  for (const n of nodes) if (n.getMesh() && n.getMesh().listPrimitives().length === 0) { n.getMesh().dispose(); n.dispose(); }
}

async function writeRawStamped(doc, file, texSize, hairTexSize, stamp) {
  // hair/eye textures are grey strand detail tinted by the material colour: half res
  await doc.transform(
    dedup(), prune({ keepLeaves: true }), unpartition(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [hairTexSize, hairTexSize],
      pattern: /Hair|Eye/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [texSize, texSize],
      pattern: /^(?!.*(Hair|Eye)).*$/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  stamp();
  await io.write(file, doc);
  const kb = statSync(file).size / 1024;
  let tris = 0, prims = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { tris += p.getIndices().getCount() / 3; prims++; }
  const tex = doc.getRoot().listTextures().map((t) => `${t.getName() || t.getURI()}:${t.getSize()?.join('x')}`);
  log(`  -> ${path.relative(process.cwd(), file)}  ${kb.toFixed(0)} KB, ${prims} primitives, ${tris} tris, textures [${tex.join(', ')}]`);
  return { kb: +kb.toFixed(1), tris, prims };
}

/* ------------------------------------------------- the proof's builders */

/** heroine base: body + head cut + eyes + brows + hair (+ alternates) + braid. */
export async function buildHeroineBase(file, { hair = 'Hair_BuzzedFemale', src, provenance } = {}) {
  const S = sourcePaths(src);
  log('heroine-base');
  const base = await readGltf(path.join(S.ubc, 'Superhero_Female_FullBody.gltf'));
  cleanDoc(base);
  const root = base.getRoot();
  for (const n of root.listNodes()) {
    if (n.getName() === 'Superhero_Female') n.setName('Body_Full');
    if (n.getName() === 'Eyebrows') n.setName('Brows');
  }
  const bodyNode = root.listNodes().find((n) => n.getName() === 'Body_Full');
  headCut(base, bodyNode, ['Head', 'neck_01'], 'Body_Head');
  for (const [i, h] of [hair, 'Hair_Long', 'Hair_Buns'].entries()) {
    const hd = await readGltf(path.join(S.hair, `${h}.gltf`));
    cleanDoc(hd);
    for (const n of graft(base, hd, h)) n.setName(i === 0 ? 'Hair' : `HairAlt_${h.replace('Hair_', '')}`);
  }
  addBraid(base);
  await base.transform(dedup());
  for (const m of root.listMaterials()) {
    if (/Hair/.test(m.getName())) m.setBaseColorFactor([0.16, 0.10, 0.075, 1]); // near-black brown, tinted grey strands
  }
  return writeHuman(base, file, { texSize: 1024, hairTexSize: 512, provenance });
}

/**
 * male NPC base: the outfits' REGULAR male skeleton (the free kit ships only the Superhero male, whose limbs
 * sit 2-3 cm wider) + the Superhero male's head/neck cut (head and spine joints are identical) + hair, re-bound by LBS.
 */
export async function buildMaleBase(file, { src, provenance } = {}) {
  const S = sourcePaths(src);
  log('npc-male-base');
  const base = await readGltf(path.join(S.mco, 'Male_Peasant_Body.gltf'));
  cleanDoc(base);
  for (const n of base.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.dispose(); }
  const sh = await readGltf(path.join(S.ubc, 'Superhero_Male_FullBody.gltf'));
  cleanDoc(sh);
  for (const n of sh.getRoot().listNodes()) {
    if (n.getName() === 'SuperHero_Male') n.setName('Body_Full');
    if (n.getName() === 'Eyebrows') n.setName('Brows');
  }
  const full = sh.getRoot().listNodes().find((n) => n.getName() === 'Body_Full');
  headCut(sh, full, ['Head', 'neck_01'], 'Body_Head');
  full.getMesh().dispose(); full.dispose();
  graft(base, sh, 'Superhero_Male head');
  for (const [i, h] of ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Beard'].entries()) {
    const hd = await readGltf(path.join(S.hair, `${h}.gltf`));
    cleanDoc(hd);
    for (const n of graft(base, hd, h)) n.setName(i === 0 ? 'Hair' : `HairAlt_${h.replace('Hair_', '')}`);
  }
  await base.transform(dedup());
  for (const m of base.getRoot().listMaterials()) if (/Hair/.test(m.getName())) m.setBaseColorFactor([0.30, 0.20, 0.13, 1]);
  return writeHuman(base, file, { texSize: 1024, hairTexSize: 512, provenance });
}

/** outfits: each a set of modular parts grafted onto ONE skeleton (skel: 'ubc' | 'mco' + file). */
export const OUTFITS = {
  ranger: { skel: ['ubc', 'Superhero_Female_FullBody.gltf'], parts: ['Female_Ranger_Body', 'Female_Ranger_Arms',
    'Female_Ranger_Legs', 'Female_Ranger_Feet', 'Female_Ranger_Acc_Pauldrons', 'Female_Ranger_Head_Hood'] },
  peasant: { skel: ['ubc', 'Superhero_Female_FullBody.gltf'], parts: ['Female_Peasant_Body', 'Female_Peasant_Arms',
    'Female_Peasant_Legs', 'Female_Peasant_Feet'] },
  'male-ranger': { skel: ['mco', 'Male_Peasant_Body.gltf'], parts: ['Male_Ranger_Body', 'Male_Ranger_Arms',
    'Male_Ranger_Legs', 'Male_Ranger_Feet_Boots', 'Male_Ranger_Acc_Pauldron', 'Male_Ranger_Head_Hood'] },
  'male-peasant': { skel: ['mco', 'Male_Peasant_Body.gltf'], parts: ['Male_Peasant_Body', 'Male_Peasant_Arms',
    'Male_Peasant_Legs', 'Male_Peasant_Feet'] },
};

export async function buildOutfit(name, file, { src, provenance } = {}) {
  const S = sourcePaths(src);
  const { skel, parts } = OUTFITS[name];
  log(`outfit-${name}`);
  // a skeleton-only base: the matching body's armature, meshes removed
  const doc = await readGltf(path.join(S[skel[0]], skel[1]));
  cleanDoc(doc);
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.dispose(); }
  const nodes = [];
  for (const part of parts) {
    const p = await readGltf(path.join(S.mco, `${part}.gltf`));
    cleanDoc(p);
    for (const n of graft(doc, p, part)) { n.setName(part.replace(/^(Fem|M)ale_/, '')); nodes.push(n); }
  }
  // the parts arrive with one copy of each material per file: dedup first so "MI_Ranger" is ONE material, then
  // variant pieces that toggle stay their own draw and everything else joins per material
  await doc.transform(dedup());
  joinByMaterial(doc, nodes, name, [/Hood/, /Pauldron/]);
  return writeHuman(doc, file, { texSize: 1024, hairTexSize: 512, provenance });
}
