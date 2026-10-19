/**
 * CALIMA — the human recipe library (hero-body, W0b; plan §2 "face library for
 * NPCs", bible §3.5 "Face, no Blender", §6.2 "every archetype gets its own face
 * from Brea's recipe library").
 *
 * Node only (gltf-transform + sharp + meshoptimizer). No Blender, no clocks, no
 * Math.random: every output is a pure function of the sources and the recipe
 * numbers (A-build-deterministic).
 *
 * WHAT LIVES HERE
 *   sources      `srcRoot()` — models-staging/r5-src (pipeline W0b), or $R5_SRC
 *   gltf I/O     `readGltf` (repairs the packs' `*_png.png` URIs), `cleanDoc`
 *                (drops TEXCOORD_1..4 / COLOR_*, folds 8 influences to 4)
 *   skin graft   `graft(base, part)` — joins a part onto the base skin BY JOINT
 *                NAME, re-binding by LBS where the part's bind differs
 *   chains       `addChain(doc, names, pointsModelSpace, parentName)` — dyn_
 *                joints + inverse binds, in the model frame of the pack
 *   geometry     `skinnedMesh(doc, name, geo, material)` and the lofts
 *                (`tubeAlong`, `stripAlong`, `bun`, `band`)
 *   FACE FIELD   `findLandmarks(headPts, eyes)`, `faceField(landmarks, deltas,
 *                opts)` and `applyField(prim, field)` — a sum of Gaussian bumps in
 *                bind space, eye sockets held rigid by a falloff mask; the same
 *                field moves head, brows, eyes and hair so nothing parts
 *   PAINT        `positionMap(prim, W, H)` — rasterises a primitive's UV layout
 *                into a per-texel bind-space position + normal, so paint is
 *                authored in 3-D (a salt-line across the nose, a scar through the
 *                brow, a ∴ on the hand) and lands wherever the UVs put it
 *   measure      `profileMask(prim, window, px)` and `iou(a, b)` — the side
 *                profile used by A-face-delta (window documented on the gate)
 *   write        `writeSkinned(doc, file, opts)` — dedup/prune, WebP textures,
 *                meshopt + quantisation that leaves custom attributes exact,
 *                provenance + r5Stats in asset.extras
 *
 * NPC recipes (settlements, W2) reuse `faceField` with seeded per-archetype
 * offsets: `archetypeDeltas(seed, base)` below is the hook.
 */
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, unpartition, reorder, quantize } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProvenance, GENERATOR } from '../../lib/glb.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/* ============================================================== sources */

/**
 * Third-party sources live in `models-staging/r5-src/` (pipeline stages the
 * trimmed packs there in W0b, gitignored). Layout, same as the proof's scratch:
 *   ubc/Base Characters/Godot - UE/*.gltf
 *   ubc/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/*.gltf
 *   mco/Modular Parts/*.gltf
 * `$R5_SRC` overrides (a directory with the same layout).
 */
export function srcRoot() {
  const env = process.env.R5_SRC;
  if (env && existsSync(env)) return env;
  const staged = path.join(ROOT, 'models-staging/r5-src');
  if (existsSync(path.join(staged, 'ubc'))) return staged;
  throw new Error('[recipes] no human sources: stage UBC + MCO under models-staging/r5-src/ (pipeline W0b) or set R5_SRC');
}
export const UBC_DIR = (s = srcRoot()) => path.join(s, 'ubc/Base Characters/Godot - UE');
export const HAIR_DIR = (s = srcRoot()) => path.join(s, 'ubc/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)');
export const MCO_DIR = (s = srcRoot()) => path.join(s, 'mco/Modular Parts');

/* ================================================================ I/O */

let _io = null;
export async function io() {
  if (_io) return _io;
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  _io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  return _io;
}

/** Read a .gltf, repairing image URIs the packs ship under another name. */
export async function readGltf(file) {
  const dir = path.dirname(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const resources = {};
  for (const b of json.buffers || []) resources[b.uri] = new Uint8Array(readFileSync(path.join(dir, b.uri)));
  for (const im of json.images || []) {
    const cands = [im.uri, im.uri.replace(/_png\.png$/, '.png'), im.uri.replace(/\.png$/, '_png.png')];
    const hit = cands.find((u) => existsSync(path.join(dir, u)));
    if (!hit) throw new Error(`missing image ${im.uri} for ${file}`);
    im.uri = hit;
    resources[hit] = new Uint8Array(readFileSync(path.join(dir, hit)));
  }
  return (await io()).readJSON({ json, resources });
}

/** Drop what three never reads; fold 8 influences to 4; one component type per semantic. */
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
      inf.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
      let s = 0;
      for (let k = 0; k < 4; k++) s += inf[k][1];
      for (let k = 0; k < 4; k++) { J[i * 4 + k] = inf[k][0]; W[i * 4 + k] = s > 0 ? inf[k][1] / s : (k === 0 ? 1 : 0); }
    }
    j0.setArray(J).setType('VEC4'); w0.setArray(W).setType('VEC4');
    prim.setAttribute('JOINTS_1', null); prim.setAttribute('WEIGHTS_1', null);
  }
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

export const nodeByName = (doc, name) => doc.getRoot().listNodes().find((n) => n.getName() === name) || null;

/* ============================================================ matrices */

export const m4 = {
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  /** rigid inverse (rotation + translation) */
  inv(m) {
    const o = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
    o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]);
    o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]);
    o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
    return o;
  },
  apply(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  },
};

/** quaternion turning +Y onto unit vector d */
export function quatYTo(d) {
  const [x, y, z] = d;
  if (y < -0.9999) return [1, 0, 0, 0];
  const q = [z, 0, -x, 1 + y];
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}
export function quatToMat(q, t) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    t[0], t[1], t[2], 1,
  ];
}
export function matToQuat(m) {
  const t = m[0] + m[5] + m[10];
  let x, y, z, w;
  if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); w = 0.25 / s; x = (m[6] - m[9]) * s; y = (m[8] - m[2]) * s; z = (m[1] - m[4]) * s; }
  else if (m[0] > m[5] && m[0] > m[10]) { const s = 2 * Math.sqrt(1 + m[0] - m[5] - m[10]); w = (m[6] - m[9]) / s; x = 0.25 * s; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s; }
  else if (m[5] > m[10]) { const s = 2 * Math.sqrt(1 + m[5] - m[0] - m[10]); w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = 0.25 * s; z = (m[9] + m[6]) / s; }
  else { const s = 2 * Math.sqrt(1 + m[10] - m[0] - m[5]); w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = 0.25 * s; }
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}

/* =============================================================== graft */

function ibmOf(skin) {
  const acc = skin.getInverseBindMatrices();
  const out = new Map();
  const e = new Array(16);
  skin.listJoints().forEach((j, i) => { acc.getElement(i, e); out.set(j.getName(), e.slice()); });
  return out;
}

/**
 * Merge `part` into `base`, re-pointing every skinned mesh at the base skin BY
 * JOINT NAME. Where the part was authored on a different bind, its vertices
 * are re-bound by LBS (v' = sum w * inv(IBM_base) * IBM_part * v).
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
  const delta = new Array(pJoints.length).fill(null);
  for (const n of used) {
    if (!bIndex.has(n)) throw new Error(`${label}: joint ${n} not on base skeleton`);
    const A = bIbm.get(n), B = pIbm.get(n);
    let d = 0;
    for (let k = 0; k < 16; k++) d = Math.max(d, Math.abs(A[k] - B[k]));
    if (d > 1e-4) delta[pJoints.indexOf(n)] = m4.mul(m4.inv(A), B);
  }
  const rebound = delta.some(Boolean);
  const map = mergeDocuments(base, part);
  const armature = nodeByName(base, 'Armature');
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
  for (const pn of part.getRoot().listNodes()) if (!pn.getMesh()) map.get(pn)?.dispose();
  map.get(pSkin)?.dispose();
  for (const s of part.getRoot().listScenes()) map.get(s)?.dispose();
  return made;
}

function rebindPrimitive(prim, delta) {
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
    const q = m4.apply(M, p);
    pos.set(q, i * 3);
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

/* ============================================================== chains */

/**
 * Author a dyn_ chain: joints at MODEL-space points `P` (the pack frame: +Y up,
 * +Z forward, metres), each oriented +Y along the chain, parented under
 * `parentName`, added to the base skin with exact inverse binds. The last name
 * is the `_end` terminator the animator's solver reads as the tip.
 * Returns the joint indices in the skin, root first.
 */
export function addChain(doc, names, P, parentName) {
  const skin = doc.getRoot().listSkins()[0];
  const parent0 = skin.listJoints().find((j) => j.getName() === parentName);
  if (!parent0) throw new Error(`addChain: no parent joint ${parentName}`);
  const ibmAcc = skin.getInverseBindMatrices();
  const ibm = Array.from(ibmAcc.getArray());
  let parent = parent0, parentW = Array.from(parent0.getWorldMatrix());
  const idx = [];
  for (let i = 0; i < P.length; i++) {
    const cur = P[i];
    const nxt = P[Math.min(i + 1, P.length - 1)];
    let d = i + 1 < P.length ? [nxt[0] - cur[0], nxt[1] - cur[1], nxt[2] - cur[2]]
      : [cur[0] - P[i - 1][0], cur[1] - P[i - 1][1], cur[2] - P[i - 1][2]];
    const l = Math.hypot(...d); d = d.map((v) => v / l);
    const W = quatToMat(quatYTo(d), cur);
    const L = m4.mul(m4.inv(parentW), W);
    const node = doc.createNode(names[i]).setTranslation([L[12], L[13], L[14]]).setRotation(matToQuat(L));
    parent.addChild(node);
    skin.addJoint(node);
    idx.push(skin.listJoints().length - 1);
    ibm.push(...m4.inv(W));
    parent = node; parentW = W;
  }
  ibmAcc.setArray(new Float32Array(ibm));
  return idx;
}

/** Index of a joint in the base skin by name. */
export function jointIndex(doc, name) {
  const i = doc.getRoot().listSkins()[0].listJoints().findIndex((j) => j.getName() === name);
  if (i < 0) throw new Error(`no joint ${name}`);
  return i;
}

/** Model-space position of a joint at bind. */
export function jointPos(doc, name) {
  const j = doc.getRoot().listSkins()[0].listJoints().find((x) => x.getName() === name);
  const w = j.getWorldMatrix();
  return [w[12], w[13], w[14]];
}

/* ============================================================ geometry */

/**
 * A geometry bucket: flat arrays, indexed. `jnt`/`wgt` are 4 per vertex.
 * Extra per-vertex custom attributes go in `custom: { _NAME: { type, array } }`.
 */
export function newGeo() { return { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] }; }

export function appendGeo(a, b) {
  const base = a.pos.length / 3;
  a.pos.push(...b.pos); a.nrm.push(...b.nrm); a.uv.push(...b.uv); a.jnt.push(...b.jnt); a.wgt.push(...b.wgt);
  for (const i of b.idx) a.idx.push(i + base);
  return a;
}

/** Create a skinned mesh node from a bucket under the Armature, on the base skin. */
export function skinnedMesh(doc, name, geo, material, custom = null) {
  const root = doc.getRoot();
  const buf = root.listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(geo.pos)))
    .setAttribute('NORMAL', acc('VEC3', normalizeArr(new Float32Array(geo.nrm))))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(geo.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(geo.jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(geo.wgt)))
    .setIndices(acc('SCALAR', new Uint32Array(geo.idx)));
  if (custom) for (const [k, v] of Object.entries(custom)) prim.setAttribute(k, acc(v.type, v.array));
  prim.setMaterial(material);
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setSkin(root.listSkins()[0]);
  (nodeByName(doc, 'Armature') || root.listScenes()[0]).addChild(node);
  return node;
}

function normalizeArr(a) {
  for (let i = 0; i < a.length; i += 3) {
    const l = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1;
    a[i] /= l; a[i + 1] /= l; a[i + 2] /= l;
  }
  return a;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const v3 = { sub, add, mul, dot, cross, norm };

/** Polyline sampler by arc length: s in [0,1] -> { p, t, seg, f }. */
export function polyline(P) {
  const L = [];
  let total = 0;
  for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(...sub(P[i + 1], P[i])); L.push(l); total += l; }
  return {
    total,
    at(u) {
      let s = Math.min(Math.max(u, 0), 1) * total, acc = 0;
      for (let i = 0; i < L.length; i++) {
        if (s <= acc + L[i] || i === L.length - 1) {
          const f = Math.min(1, Math.max(0, (s - acc) / L[i]));
          return { p: add(P[i], mul(sub(P[i + 1], P[i]), f)), t: norm(sub(P[i + 1], P[i])), seg: i, f };
        }
        acc += L[i];
      }
      return null;
    },
  };
}

/**
 * Skin weights along a chain: segment i blends joint i -> i+1 by fraction.
 * `joints` are the DRIVEN joint indices root->last (the `_end` excluded).
 */
function chainWeights(joints, seg, f) {
  const n = joints.length;
  const a = joints[Math.min(seg, n - 1)];
  const b = joints[Math.min(seg + 1, n - 1)];
  const wb = seg + 1 >= n ? 0 : f;
  return { j: [a, b, 0, 0], w: [1 - wb, wb, 0, 0] };
}

/**
 * Tube lofted along polyline `P` (model space), skinned along `joints`.
 * `radius(u)` gives the radius at arc fraction u; `side` is the ring's
 * reference axis. UVs: u around (mapped into `uvRect`), v along.
 */
export function tubeAlong(P, joints, { ring = 8, along = 10, radius = () => 0.02, side = [1, 0, 0], uvRect = [0, 0, 1, 1], lobes = 0, twist = 0, cap = true } = {}) {
  const g = newGeo();
  const pl = polyline(P);
  for (let a = 0; a <= along; a++) {
    const u = a / along;
    const { p, t, seg, f } = pl.at(u);
    let sd = norm(sub(side, mul(t, dot(side, t))));
    const up = cross(t, sd);
    const r0 = radius(u);
    const { j, w } = chainWeights(joints, seg, f);
    for (let r = 0; r <= ring; r++) {
      const th = (r / ring) * Math.PI * 2;
      const lobe = lobes ? 1 + 0.18 * Math.max(0, Math.cos(lobes * th + u * twist)) : 1;
      const c = Math.cos(th), s = Math.sin(th);
      const n = add(mul(sd, c), mul(up, s));
      g.pos.push(...add(p, mul(n, r0 * lobe)));
      g.nrm.push(...n);
      g.uv.push(uvRect[0] + (r / ring) * uvRect[2], uvRect[1] + u * uvRect[3]);
      g.jnt.push(...j); g.wgt.push(...w);
    }
  }
  for (let a = 0; a < along; a++) {
    for (let r = 0; r < ring; r++) {
      const i0 = a * (ring + 1) + r, i1 = i0 + 1, i2 = i0 + ring + 1, i3 = i2 + 1;
      g.idx.push(i0, i1, i2, i1, i3, i2);
    }
  }
  if (cap) {
    // close the tip with a fan so the tube never reads hollow
    const { p, t, seg, f } = pl.at(1);
    const { j, w } = chainWeights(joints, seg, f);
    const c = g.pos.length / 3;
    g.pos.push(...add(p, mul(t, radius(1) * 0.6))); g.nrm.push(...t);
    g.uv.push(uvRect[0] + uvRect[2] * 0.5, uvRect[1] + uvRect[3]); g.jnt.push(...j); g.wgt.push(...w);
    const last = along * (ring + 1);
    for (let r = 0; r < ring; r++) g.idx.push(last + r, last + r + 1, c);
  }
  return g;
}

/**
 * Cloth strip lofted along `P`: width `width(u)`, lying across `side`,
 * double-faced (front uses `uvFront`, back `uvBack`) so the lining reads.
 */
export function stripAlong(P, joints, { along = 12, width = () => 0.07, side = [1, 0, 0], uvFront = [0, 0, 1, 1], uvBack = null, thick = 0.003, curl = 0 } = {}) {
  const g = newGeo();
  const pl = polyline(P);
  const faces = uvBack ? [[uvFront, 1], [uvBack, -1]] : [[uvFront, 1]];
  for (const [rect, sgn] of faces) {
    const base = g.pos.length / 3;
    for (let a = 0; a <= along; a++) {
      const u = a / along;
      const { p, t, seg, f } = pl.at(u);
      const sd = norm(sub(side, mul(t, dot(side, t))));
      const nrm = mul(norm(cross(sd, t)), sgn);
      const hw = width(u) * 0.5;
      const { j, w } = chainWeights(joints, seg, f);
      for (let k = 0; k <= 2; k++) {
        const x = (k / 2) * 2 - 1;                       // -1, 0, 1 across
        const bow = curl * (1 - x * x);                   // slight cup so the edge reads
        const q = add(add(p, mul(sd, x * hw)), mul(nrm, thick * 0.5 + bow * hw));
        g.pos.push(...q);
        g.nrm.push(...nrm);
        g.uv.push(rect[0] + (k / 2) * rect[2], rect[1] + u * rect[3]);
        g.jnt.push(...j); g.wgt.push(...w);
      }
    }
    for (let a = 0; a < along; a++) {
      for (let k = 0; k < 2; k++) {
        const i0 = base + a * 3 + k, i1 = i0 + 1, i2 = i0 + 3, i3 = i2 + 1;
        if (sgn > 0) g.idx.push(i0, i2, i1, i1, i2, i3); else g.idx.push(i0, i1, i2, i1, i3, i2);
      }
    }
  }
  return g;
}

/** A wrapped bun (squashed sphere with wrap ridges), rigid on one joint. */
export function bun(center, { rx = 0.07, ry = 0.06, rz = 0.07, seg = 12, rings = 9, joint = 0, uvRect = [0, 0, 1, 1], ridges = 3, tilt = [0, 1, 0] } = {}) {
  const g = newGeo();
  const up = norm(tilt);
  const ax = norm(cross(up, Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const az = cross(ax, up);
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, ph = v * Math.PI;
    const sy = Math.cos(ph), sr = Math.sin(ph);
    const ridge = 1 + 0.06 * Math.max(0, Math.sin(v * Math.PI * ridges * 2));
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const lx = Math.cos(th) * sr * rx * ridge, ly = sy * ry, lz = Math.sin(th) * sr * rz * ridge;
      const p = add(center, add(add(mul(ax, lx), mul(up, ly)), mul(az, lz)));
      const n = norm(add(add(mul(ax, lx / (rx * rx)), mul(up, ly / (ry * ry))), mul(az, lz / (rz * rz))));
      g.pos.push(...p); g.nrm.push(...n);
      g.uv.push(uvRect[0] + (k / seg) * uvRect[2], uvRect[1] + v * uvRect[3]);
      g.jnt.push(joint, 0, 0, 0); g.wgt.push(1, 0, 0, 0);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1;
      g.idx.push(a, c, b, b, c, d);
    }
  }
  return g;
}

/**
 * A band hugging a surface: for each angle around `axisCenter` (vertical axis
 * through the head), the surface radius is read from `surfaceR(theta, y)` and
 * the band sits `offset` outside it, from `y0(theta)` to `y0(theta)+height`.
 */
export function band({ center, surfaceR, y0, height = 0.06, offset = 0.006, seg = 40, rows = 3, joint = 0, uvRect = [0, 0, 1, 1], lip = 0.004 }) {
  const g = newGeo();
  const cols = seg + 1;
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const y = y0(th) + v * height;
      const R = surfaceR(th, y) + offset + lip * Math.sin(v * Math.PI);
      const dx = Math.sin(th), dz = Math.cos(th);
      g.pos.push(center[0] + dx * R, y, center[2] + dz * R);
      g.nrm.push(dx, 0.15 * (v - 0.5), dz);
      g.uv.push(uvRect[0] + (k / seg) * uvRect[2], uvRect[1] + v * uvRect[3]);
      g.jnt.push(joint, 0, 0, 0); g.wgt.push(1, 0, 0, 0);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < seg; k++) {
      const a = r * cols + k, b = a + 1, c = a + cols, d = c + 1;
      g.idx.push(a, b, c, b, d, c);
    }
  }
  return g;
}

/* ============================================================ the face */

/**
 * The seven landmarks (bible §3.5 / A-face-delta), found on a UBC head by
 * geometry, not typed by hand, so the recipe survives a re-export:
 *   noseBridge (sellion, between the eyes), noseTip (pronasale), cheekL/R,
 *   jawL/R (gonion), chin (pogonion), brow (glabella ridge), upperLip.
 * `pts` are [x, y, z, vertexIndex] of the head/neck-weighted vertices in bind
 * model space; `eyes` the two eye centres. Returns name -> [x, y, z].
 */
export function findLandmarks(pts, eyes) {
  const eyeY = (eyes[0][1] + eyes[1][1]) / 2;
  const front = (filter) => {
    let best = null;
    for (const q of pts) if (filter(q) && (!best || q[2] > best[2])) best = q;
    return best ? [best[0], best[1], best[2]] : null;
  };
  const mid = (q) => Math.abs(q[0]) < 0.008;
  const noseTip = front((q) => mid(q) && q[1] > eyeY - 0.07 && q[1] < eyeY - 0.015);
  const noseBridge = front((q) => mid(q) && Math.abs(q[1] - eyeY) < 0.004);
  const brow = front((q) => mid(q) && q[1] > eyeY + 0.015 && q[1] < eyeY + 0.045);
  // upper lip: the most forward midline point between the nose base and the mouth line
  const upperLip = front((q) => mid(q) && q[1] > noseTip[1] - 0.05 && q[1] < noseTip[1] - 0.026);
  // chin: the most forward midline point well below the lips
  const chin = front((q) => mid(q) && q[1] > noseTip[1] - 0.095 && q[1] < noseTip[1] - 0.06);
  const lateral = (sgn, yLo, yHi, zLo, zHi, key) => {
    let best = null;
    for (const q of pts) {
      if (Math.sign(q[0]) !== sgn || q[1] < yLo || q[1] > yHi || q[2] < zLo || q[2] > zHi) continue;
      if (!best || key(q) > key(best)) best = q;
    }
    return best ? [best[0], best[1], best[2]] : null;
  };
  // cheekbone: most lateral+forward point under the eye
  const ck = (s) => lateral(s, eyeY - 0.035, eyeY - 0.012, 0.03, 0.09, (q) => Math.abs(q[0]) + 0.6 * q[2]);
  // jaw angle: the most lateral point of the lower face, behind the cheek
  const jw = (s) => lateral(s, chin[1] - 0.005, chin[1] + 0.035, -0.035, 0.03, (q) => Math.abs(q[0]) - 0.3 * q[2]);
  return {
    noseBridge, noseTip, cheekL: ck(1), cheekR: ck(-1), jawL: jw(1), jawR: jw(-1), chin, brow, upperLip,
  };
}

/** The 7 graded landmarks (cheek and jaw counted once each, both sides moved). */
export const GRADED = ['noseBridge', 'noseTip', 'cheekL', 'jawL', 'chin', 'brow', 'upperLip'];

/**
 * A displacement field: sum of anisotropic Gaussian bumps. Each bump is
 * { at: [x,y,z], d: [dx,dy,dz], s: sigma (m) }. `rigid` spheres (the eye
 * sockets) hold the field at 0 inside r0 and ramp it back by r1.
 */
export function faceField(bumps, { rigid = [], r0 = 0.012, r1 = 0.030, region = null } = {}) {
  return (p, out) => {
    let x = 0, y = 0, z = 0;
    for (const b of bumps) {
      const dx = p[0] - b.at[0], dy = p[1] - b.at[1], dz = p[2] - b.at[2];
      const sx = b.sx ?? b.s, sy = b.sy ?? b.s, sz = b.sz ?? b.s;
      const g = Math.exp(-0.5 * (dx * dx / (sx * sx) + dy * dy / (sy * sy) + dz * dz / (sz * sz)));
      x += b.d[0] * g; y += b.d[1] * g; z += b.d[2] * g;
    }
    let m = 1;
    for (const c of rigid) {
      const r = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      const k = r <= r0 ? 0 : r >= r1 ? 1 : (r - r0) / (r1 - r0);
      m = Math.min(m, k * k * (3 - 2 * k));
    }
    if (region) m *= region(p);
    out[0] = x * m; out[1] = y * m; out[2] = z * m;
    return out;
  };
}

/** Move a primitive's bind positions by `field` (in place); normals recomputed after. */
export function applyField(prim, field) {
  const P = prim.getAttribute('POSITION');
  const p = [0, 0, 0], d = [0, 0, 0];
  const arr = new Float32Array(P.getCount() * 3);
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p);
    field(p, d);
    arr[i * 3] = p[0] + d[0]; arr[i * 3 + 1] = p[1] + d[1]; arr[i * 3 + 2] = p[2] + d[2];
  }
  P.setArray(arr);
}

/**
 * Recompute smooth normals for a primitive, welding by position so UV seams do
 * not crease. Only vertices whose position moved (`moved`) take the new normal,
 * so the artist's normals everywhere else are kept bit for bit.
 */
export function recomputeNormals(prim, moved) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL');
  const idx = prim.getIndices().getArray();
  const n = P.getCount();
  const pos = P.getArray();
  const key = (i) => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
  const weld = new Map(); const rep = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, i); rep[i] = weld.get(k); }
  const acc = new Float64Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const e1 = [pos[b * 3] - pa[0], pos[b * 3 + 1] - pa[1], pos[b * 3 + 2] - pa[2]];
    const e2 = [pos[c * 3] - pa[0], pos[c * 3 + 1] - pa[1], pos[c * 3 + 2] - pa[2]];
    const fn = cross(e1, e2);
    for (const v of [a, b, c]) { const r = rep[v]; acc[r * 3] += fn[0]; acc[r * 3 + 1] += fn[1]; acc[r * 3 + 2] += fn[2]; }
  }
  const out = Float32Array.from(N.getArray());
  for (let i = 0; i < n; i++) {
    if (moved && !moved[i]) continue;
    const r = rep[i];
    const l = Math.hypot(acc[r * 3], acc[r * 3 + 1], acc[r * 3 + 2]);
    if (l < 1e-12) continue;
    out[i * 3] = acc[r * 3] / l; out[i * 3 + 1] = acc[r * 3 + 1] / l; out[i * 3 + 2] = acc[r * 3 + 2] / l;
  }
  N.setArray(out);
}

/**
 * Per-archetype face offsets for the NPC recipes (settlements W2): a
 * deterministic hash of `seed` scales each base bump by 0.6-1.4 and flips the
 * sign of the minor ones, so archetypes of one sex differ by >= 4 mm on >= 4
 * landmarks (A-npc-face-delta) without any random state.
 */
export function archetypeDeltas(seed, base) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  return base.map((b) => ({ ...b, d: b.d.map((v) => v * (0.6 + 0.8 * rnd()) * (Math.abs(v) < 0.003 && rnd() < 0.5 ? -1 : 1)) }));
}

/* ================================================================ paint */

/**
 * Rasterise a primitive's UV layout at W x H: for every covered texel, the
 * barycentric bind-space position and normal (Float32 xyz, NaN where empty).
 * `filter(tri)` may skip triangles (by index).
 */
export function positionMap(prim, W, H, filter = null) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), UV = prim.getAttribute('TEXCOORD_0');
  const idx = prim.getIndices().getArray();
  const pos = new Float32Array(W * H * 3).fill(NaN);
  const nrm = new Float32Array(W * H * 3);
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], n = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], u = [[0, 0], [0, 0], [0, 0]];
  for (let t = 0; t < idx.length; t += 3) {
    if (filter && !filter(t / 3)) continue;
    for (let k = 0; k < 3; k++) { P.getElement(idx[t + k], p[k]); N.getElement(idx[t + k], n[k]); UV.getElement(idx[t + k], u[k]); }
    const ax = u[0][0] * W, ay = u[0][1] * H, bx = u[1][0] * W, by = u[1][1] * H, cx = u[2][0] * W, cy = u[2][1] * H;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        let w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        let w2 = 1 - w0 - w1;
        // 1-texel dilation: accept slightly outside, clamp the weights
        if (w0 < -0.08 || w1 < -0.08 || w2 < -0.08) continue;
        const o = (y * W + x) * 3;
        if (!Number.isNaN(pos[o]) && (w0 < 0 || w1 < 0 || w2 < 0)) continue;
        w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2);
        const s = w0 + w1 + w2;
        w0 /= s; w1 /= s; w2 /= s;
        for (let k = 0; k < 3; k++) {
          pos[o + k] = p[0][k] * w0 + p[1][k] * w1 + p[2][k] * w2;
          nrm[o + k] = n[0][k] * w0 + n[1][k] * w1 + n[2][k] * w2;
        }
      }
    }
  }
  return { W, H, pos, nrm };
}

/** Deterministic value noise in 3-D (hash lattice, smooth), 0..1. */
export function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const tx = x - fx, ty = y - fy, tz = z - fz;
  const h = (i, j, k) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const s = (t) => t * t * (3 - 2 * t);
  const L = (a, b, t) => a + (b - a) * t;
  const X = s(tx), Y = s(ty), Z = s(tz);
  return L(L(L(h(fx, fy, fz), h(fx + 1, fy, fz), X), L(h(fx, fy + 1, fz), h(fx + 1, fy + 1, fz), X), Y),
    L(L(h(fx, fy, fz + 1), h(fx + 1, fy, fz + 1), X), L(h(fx, fy + 1, fz + 1), h(fx + 1, fy + 1, fz + 1), X), Y), Z);
}

export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ============================================================== measure */

/**
 * Side-profile silhouette (orthographic, looking along -X) of the triangles
 * `filter` keeps, inside `win = { y0, y1, z0, z1 }` at `px` metres per pixel.
 * Positions may be overridden (`posOf(i) -> [x,y,z]`).
 */
export function profileMask(prim, win, px, filter = null, posOf = null) {
  const P = prim.getAttribute('POSITION');
  const idx = prim.getIndices().getArray();
  const W = Math.round((win.z1 - win.z0) / px), H = Math.round((win.y1 - win.y0) / px);
  const img = new Uint8Array(W * H);
  const p = [0, 0, 0];
  const get = (i) => { if (posOf) return posOf(i); P.getElement(i, p); return [p[0], p[1], p[2]]; };
  for (let t = 0; t < idx.length; t += 3) {
    if (filter && !filter(idx[t], idx[t + 1], idx[t + 2])) continue;
    const q = [get(idx[t]), get(idx[t + 1]), get(idx[t + 2])].map((v) => [(v[2] - win.z0) / px, (win.y1 - v[1]) / px]);
    const [a, b, c] = q;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      const w0 = ((b[0] - qx) * (c[1] - qy) - (c[0] - qx) * (b[1] - qy)) / area;
      const w1 = ((c[0] - qx) * (a[1] - qy) - (a[0] - qx) * (c[1] - qy)) / area;
      if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) img[y * W + x] = 1;
    }
  }
  return { W, H, img };
}
export function iou(a, b) {
  let i = 0, u = 0;
  for (let k = 0; k < a.img.length; k++) { const x = a.img[k], y = b.img[k]; if (x && y) i++; if (x || y) u++; }
  return u ? i / u : 1;
}
/** Run-length encode a 0/1 mask (for asset extras; the gate decodes it). */
export function rle(mask) {
  const out = [];
  let cur = 0, run = 0;
  for (let k = 0; k < mask.img.length; k++) {
    if (mask.img[k] === cur) run++; else { out.push(run); cur = mask.img[k]; run = 1; }
  }
  out.push(run);
  return { W: mask.W, H: mask.H, runs: out };
}

/* ================================================================ write */

/**
 * Write a skinned document: dedup + prune, then reorder and quantise only the
 * standard attributes (custom `_*` attributes stay exact integers), meshopt
 * compression, asset.extras = { ...extras, provenance, r5Stats }.
 * Texture images must already be final (the recipe encodes them with sharp).
 */
export async function writeSkinned(doc, file, { provenance, extras = {}, compress = true } = {}) {
  const prov = checkProvenance(provenance);
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: true }), unpartition());
  let tris = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      verts += p.getAttribute('POSITION').getCount();
      tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    }
  }
  if (compress) {
    await MeshoptEncoder.ready;
    await doc.transform(
      reorder({ encoder: MeshoptEncoder }),
      // one quantisation volume for the whole scene: every skinned mesh keeps the ONE
      // skin (a per-mesh volume would clone the skin per mesh and three would build
      // a Skeleton + bone texture for each)
      quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0|WEIGHTS_0)$/, quantizationVolume: 'scene', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
    );
    doc.createExtension(EXTMeshoptCompression).setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  }
  const stats = {
    tris, verts,
    materials: doc.getRoot().listMaterials().length,
    meshes: doc.getRoot().listMeshes().length,
    textures: doc.getRoot().listTextures().length,
    bones: doc.getRoot().listSkins().reduce((n, s) => n + s.listJoints().length, 0),
  };
  const asset = doc.getRoot().getAsset();
  asset.generator = GENERATOR;
  asset.extras = { ...extras, provenance: prov, r5Stats: stats };
  const bytes = await (await io()).writeBinary(doc);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return { bytes: bytes.byteLength, ...stats };
}
