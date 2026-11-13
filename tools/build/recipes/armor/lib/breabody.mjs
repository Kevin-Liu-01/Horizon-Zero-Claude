/**
 * CALIMA — Brea's own skinned body, read off `public/models/hero/brea.glb`, as a Part in an outfit recipe's raw bind
 * space and joint indices (armory W1, fix round 1).
 *
 * The outfits used to be fitted (lib/romfit.mjs ease) against the stock UBC body their pieces were drafted on, while
 * A-variant-swap-matrix grades them against Brea, whose sculpt is fuller at the deltoids, the chest and the thighs. The
 * fit now reads the body the gate reads. brea.glb is hero-body's output; it shares the UBC skeleton and its bind pose
 * (pelvis 0.9318, the same joint world matrices), so a vertex's bind position is its own skin at rest:
 * sum_j w_j (World_j * IBM_j) p, with brea.glb's own matrices (its positions are quantized and the IBMs undo it).
 *
 * Also the source of an outfit's own body cover (`coverMask`): which of Brea's body vertices the outfit hides, written
 * into the outfit's extras (`r5Outfit.hide`) and applied by src/hero/parts.js `HideMask` in place of the body's
 * hide bit, so a cut that bares the arms (C-06's sleeveless Starter) shows them without a rebuild of brea.glb.
 */
import path from 'node:path';
import { ROOT, io } from '../../lib/face.mjs';

const BREA = () => path.join(ROOT, 'public/models/hero/brea.glb');

const mul4 = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};

let _cache = null;

/**
 * @param doc the recipe's glTF document (its skin's joint names give the indices)
 * @returns a Part { slot: 'brea', pos, nrm, jnt, wgt, idx } in that doc's raw bind space, plus `count`, `tris` (brea.glb's
 *          skin vertex and triangle counts: the runtime mask is keyed on them)
 */
export async function breaBody(doc) {
  if (!_cache) {
    const d = await (await io()).read(BREA());
    const node = d.getRoot().listNodes().find((n) => n.getMesh() && n.getSkin() && n.getMesh().listPrimitives()[0].getAttribute('_HIDEMASK'));
    const prim = node.getMesh().listPrimitives()[0];
    const skin = node.getSkin();
    const joints = skin.listJoints();
    const ibm = skin.getInverseBindMatrices().getArray();
    const M = joints.map((j, k) => mul4(j.getWorldMatrix(), Array.from(ibm.slice(k * 16, k * 16 + 16))));
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
    const n = P.getCount();
    const pos = new Float64Array(n * 3), nrm = new Float64Array(n * 3), jn = new Array(n * 4), wg = new Float64Array(n * 4);
    const p = [0, 0, 0], q = [0, 0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      P.getElement(i, p); N.getElement(i, q); J.getElement(i, j4); W.getElement(i, w4);
      let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0, s = 0;
      for (let k = 0; k < 4; k++) {
        const w = w4[k];
        if (w <= 0) continue;
        const m = M[j4[k]];
        s += w;
        x += w * (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]);
        y += w * (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]);
        z += w * (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]);
        nx += w * (m[0] * q[0] + m[4] * q[1] + m[8] * q[2]);
        ny += w * (m[1] * q[0] + m[5] * q[1] + m[9] * q[2]);
        nz += w * (m[2] * q[0] + m[6] * q[1] + m[10] * q[2]);
      }
      s = s || 1;
      pos[i * 3] = x / s; pos[i * 3 + 1] = y / s; pos[i * 3 + 2] = z / s;
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
      for (let k = 0; k < 4; k++) { jn[i * 4 + k] = joints[j4[k]].getName(); wg[i * 4 + k] = w4[k]; }
    }
    _cache = { pos, nrm, jn, wg, idx: Array.from(prim.getIndices().getArray()), count: n };
  }
  const C = _cache;
  const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());
  const at = new Map(names.map((nm, i) => [nm, i]));
  const n = C.count;
  const jnt = new Array(n * 4), wgt = new Array(n * 4);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const j = at.get(C.jn[i * 4 + k]);
      const w = j == null ? 0 : C.wg[i * 4 + k];
      jnt[i * 4 + k] = j ?? 0; wgt[i * 4 + k] = w; s += w;
    }
    if (s > 0) for (let k = 0; k < 4; k++) wgt[i * 4 + k] /= s;
  }
  return { slot: 'brea', pos: Array.from(C.pos), nrm: Array.from(C.nrm), uv: [], jnt, wgt, idx: C.idx.slice(), count: n, tris: C.idx.length / 3 };
}

/**
 * Which of Brea's body vertices `parts` hide: a ray out along the vertex's normal meets the outfit within `reach`
 * (brea.mjs's own rule, 8 cm, against the finished, fitted pieces instead of the MCO sources), or the vertex lies
 * under a piece by less than `inside`. Returns { count, tris, rle } (the mask run-length coded, base64 of uint16 runs,
 * alternating 0- and 1-runs, starting with 0).
 */
export function coverMask(body, parts, { reach = 0.08, skip = new Set(), keep = null } = {}) {
  const tris = [];
  for (const p of parts) {
    if (skip.has(p.slot) || !p.pos.length) continue;
    for (let t = 0; t < p.idx.length; t += 3) {
      const a = p.idx[t] * 3, b = p.idx[t + 1] * 3, c = p.idx[t + 2] * 3;
      tris.push(p.pos[a], p.pos[a + 1], p.pos[a + 2], p.pos[b], p.pos[b + 1], p.pos[b + 2], p.pos[c], p.pos[c + 1], p.pos[c + 2]);
    }
  }
  // a coarse grid of triangle boxes
  const cell = 0.06, grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let t = 0; t < tris.length; t += 9) {
    let x0 = 9, y0 = 9, z0 = 9, x1 = -9, y1 = -9, z1 = -9;
    for (let k = 0; k < 9; k += 3) { x0 = Math.min(x0, tris[t + k]); x1 = Math.max(x1, tris[t + k]); y0 = Math.min(y0, tris[t + k + 1]); y1 = Math.max(y1, tris[t + k + 1]); z0 = Math.min(z0, tris[t + k + 2]); z1 = Math.max(z1, tris[t + k + 2]); }
    for (let x = Math.floor(x0 / cell); x <= Math.floor(x1 / cell); x++) for (let y = Math.floor(y0 / cell); y <= Math.floor(y1 / cell); y++) for (let z = Math.floor(z0 / cell); z <= Math.floor(z1 / cell); z++) {
      const k = key(x, y, z); let L = grid.get(k); if (!L) { L = []; grid.set(k, L); } L.push(t);
    }
  }
  const hit = (o, d) => {
    // march the ray's cells; Moller-Trumbore against their triangles
    const seen = new Set();
    for (let s = 0; s <= reach + 1e-9; s += cell * 0.5) {
      const k = key(Math.floor((o[0] + d[0] * s) / cell), Math.floor((o[1] + d[1] * s) / cell), Math.floor((o[2] + d[2] * s) / cell));
      const L = grid.get(k);
      if (!L) continue;
      for (const t of L) {
        if (seen.has(t)) continue;
        seen.add(t);
        const e1 = [tris[t + 3] - tris[t], tris[t + 4] - tris[t + 1], tris[t + 5] - tris[t + 2]];
        const e2 = [tris[t + 6] - tris[t], tris[t + 7] - tris[t + 1], tris[t + 8] - tris[t + 2]];
        const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
        const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
        if (Math.abs(det) < 1e-12) continue;
        const tv = [o[0] - tris[t], o[1] - tris[t + 1], o[2] - tris[t + 2]];
        const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
        if (u < 0 || u > 1) continue;
        const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
        const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
        if (dist > -0.004 && dist < reach) return true;
      }
    }
    return false;
  };
  const n = body.count;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (keep && keep(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2])) continue;
    const o = [body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]], d = [body.nrm[i * 3], body.nrm[i * 3 + 1], body.nrm[i * 3 + 2]];
    mask[i] = hit(o, d) ? 1 : 0;
  }
  const runs = [];
  let cur = 0, len = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i] === cur && len < 65535) { len++; continue; }
    if (mask[i] === cur) { runs.push(len, 0); len = 1; continue; }
    runs.push(len); cur = mask[i]; len = 1;
  }
  runs.push(len);
  const buf = Buffer.from(new Uint16Array(runs).buffer);
  let covered = 0; for (let i = 0; i < n; i++) covered += mask[i];
  return { count: n, tris: body.tris, covered, rle: buf.toString('base64'), mask };
}
