/**
 * CALIMA — NPC recipes, geometry buckets (settlements; R56, R57 c). A bucket is the kit's plain
 * shape: { pos, nrm, uv, jnt, wgt, col, idx } flat arrays, 4 influences per vertex, COLOR_0 linear
 * RGBA. Node only, deterministic.
 */
import { MeshoptSimplifier } from 'meshoptimizer';
import { smooth, v3 } from './kit/face.mjs';
import { TriGrid } from './kit/skin.mjs';

export const emptyGeo = () => ({ pos: [], nrm: [], uv: [], jnt: [], wgt: [], col: [], idx: [] });

export const tris = (g) => g.idx.length / 3;

/** A primitive as a bucket (bind positions as they are; `col` white when the primitive has none). */
export function primToGeo(prim, { dy = 0 } = {}) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), UV = prim.getAttribute('TEXCOORD_0');
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'), C = prim.getAttribute('COLOR_0');
  const n = P.getCount();
  const g = emptyGeo();
  const p = [0, 0, 0], q = [0, 0, 0], u = [0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0], c = [1, 1, 1, 1];
  for (let i = 0; i < n; i++) {
    P.getElement(i, p); N.getElement(i, q); UV.getElement(i, u); J.getElement(i, j); W.getElement(i, w);
    if (C) C.getElement(i, c);
    g.pos.push(p[0], p[1] + dy, p[2]); g.nrm.push(q[0], q[1], q[2]); g.uv.push(u[0], u[1]); g.jnt.push(j[0], j[1], j[2], j[3]); g.wgt.push(w[0], w[1], w[2], w[3]);
    g.col.push(C ? c[0] : 1, C ? c[1] : 1, C ? c[2] : 1, C && c.length > 3 ? c[3] : 1);
  }
  const idx = prim.getIndices().getArray();
  for (let i = 0; i < idx.length; i++) g.idx.push(idx[i]);
  return g;
}

/** Remove the vertices a bucket no longer references. */
export function compact(g) {
  const n = g.pos.length / 3, map = new Int32Array(n).fill(-1);
  let m = 0;
  for (const i of g.idx) if (map[i] < 0) map[i] = m++;
  if (m === n) return g;
  const take = (A, s) => { if (!A || A.length !== n * s) return A; const o = new Array(m * s); for (let i = 0; i < n; i++) if (map[i] >= 0) for (let k = 0; k < s; k++) o[map[i] * s + k] = A[i * s + k]; return o; };
  g.pos = take(g.pos, 3); g.nrm = take(g.nrm, 3); g.uv = take(g.uv, 2); g.jnt = take(g.jnt, 4); g.wgt = take(g.wgt, 4); g.col = take(g.col, 4);
  g.idx = g.idx.map((i) => map[i]);
  return g;
}

/** Join buckets (a part with no `col` is white). */
export function join(list) {
  const o = emptyGeo();
  for (const g of list) {
    const base = o.pos.length / 3, n = g.pos.length / 3;
    for (const k of ['pos', 'nrm', 'uv', 'jnt', 'wgt']) { const s = g[k]; for (let i = 0; i < s.length; i++) o[k].push(s[i]); }
    if (g.col && g.col.length === n * 4) { for (let i = 0; i < g.col.length; i++) o.col.push(g.col[i]); } else for (let i = 0; i < n; i++) o.col.push(1, 1, 1, 1);
    for (let i = 0; i < g.idx.length; i++) o.idx.push(g.idx[i] + base);
  }
  return o;
}

/** Keep the triangles `keep(ax,ay,az, bx,by,bz, cx,cy,cz, ia,ib,ic)` passes. */
export function filterTris(g, keep) {
  const P = g.pos, out = [];
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
    if (keep(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], P[c * 3], P[c * 3 + 1], P[c * 3 + 2], a, b, c)) out.push(a, b, c);
  }
  g.idx = out;
  return compact(g);
}

/** Flat triangle soup of a bucket. */
export function soupOf(g, out = []) {
  for (let i = 0; i < g.idx.length; i++) { const v = g.idx[i] * 3; out.push(g.pos[v], g.pos[v + 1], g.pos[v + 2]); }
  return out;
}

/**
 * meshoptimizer on a bucket: `target` triangles, positions + normal + uv weighted so a UV seam and a
 * crease survive. Vertices are never moved (a collapse), so the result stays on the near mesh.
 */
export async function simplify(g, target, { err = 0.02, lock = false, prune = false, attr = [1, 1, 1, 1.2, 1.2] } = {}) {
  await MeshoptSimplifier.ready;
  if (tris(g) <= target) return g;
  const n = g.pos.length / 3;
  const pos = Float32Array.from(g.pos), idx = Uint32Array.from(g.idx);
  const at = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) { at[i * 5] = g.nrm[i * 3]; at[i * 5 + 1] = g.nrm[i * 3 + 1]; at[i * 5 + 2] = g.nrm[i * 3 + 2]; at[i * 5 + 3] = g.uv[i * 2] * 4; at[i * 5 + 4] = g.uv[i * 2 + 1] * 4; }
  const flags = lock ? ['LockBorder'] : (prune ? ['Prune'] : []);
  const [out] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, at, 5, attr, null, target * 3, err, flags);
  return compact({ pos: g.pos.slice(), nrm: g.nrm.slice(), uv: g.uv.slice(), jnt: g.jnt.slice(), wgt: g.wgt.slice(), col: g.col?.slice(), idx: Array.from(out) });
}

/** A TriGrid of a bucket list. */
export const gridOf = (list, cell = 0.02) => { const s = []; for (const g of list) soupOf(g, s); return new TriGrid(new Float32Array(s), cell); };

/** Skin weights of the nearest vertex among `verts` ([x,y,z,i]). */
export function nearestSkin(verts, J, W) {
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  return (p) => {
    let best = 0, bd = 1e9;
    for (let k = 0; k < verts.length; k += 4) { const d = (verts[k] - p[0]) ** 2 + (verts[k + 1] - p[1]) ** 2 + (verts[k + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = verts[k + 3]; } }
    J.getElement(best, j); W.getElement(best, w);
    return { j: j.slice(), w: w.slice() };
  };
}

/** A smooth blend of two weight sets (top four influences kept, normalised). */
export function blendSkin(a, b, t) {
  const m = new Map();
  for (let k = 0; k < 4; k++) { if (a.w[k] > 0) m.set(a.j[k], (m.get(a.j[k]) || 0) + a.w[k] * (1 - t)); if (b.w[k] > 0) m.set(b.j[k], (m.get(b.j[k]) || 0) + b.w[k] * t); }
  const list = [...m.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, 4);
  const s = list.reduce((q, e) => q + e[1], 0) || 1;
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  list.forEach((e, i) => { j[i] = e[0]; w[i] = e[1] / s; });
  return { j, w };
}

/** Smooth vertex normals of a bucket, welded by position. */
export function recomputeGeoNormals(g) {
  const n = g.pos.length / 3;
  const key = (i) => `${Math.round(g.pos[i * 3] * 2e4)},${Math.round(g.pos[i * 3 + 1] * 2e4)},${Math.round(g.pos[i * 3 + 2] * 2e4)}`;
  const weld = new Map(), rep = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, i); rep[i] = weld.get(k); }
  const acc = new Float64Array(n * 3);
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
    const e1 = [g.pos[b * 3] - g.pos[a * 3], g.pos[b * 3 + 1] - g.pos[a * 3 + 1], g.pos[b * 3 + 2] - g.pos[a * 3 + 2]];
    const e2 = [g.pos[c * 3] - g.pos[a * 3], g.pos[c * 3 + 1] - g.pos[a * 3 + 1], g.pos[c * 3 + 2] - g.pos[a * 3 + 2]];
    const f = v3.cross(e1, e2);
    for (const v of [a, b, c]) { const r = rep[v]; acc[r * 3] += f[0]; acc[r * 3 + 1] += f[1]; acc[r * 3 + 2] += f[2]; }
  }
  for (let i = 0; i < n; i++) {
    const r = rep[i], l = Math.hypot(acc[r * 3], acc[r * 3 + 1], acc[r * 3 + 2]);
    if (l < 1e-12) continue;
    g.nrm[i * 3] = acc[r * 3] / l; g.nrm[i * 3 + 1] = acc[r * 3 + 1] / l; g.nrm[i * 3 + 2] = acc[r * 3 + 2] / l;
  }
  return g;
}

/** sRGB hex -> linear [r, g, b]. */
export const lin = (hexStr) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return [f(parseInt(hexStr.slice(1, 3), 16)), f(parseInt(hexStr.slice(3, 5), 16)), f(parseInt(hexStr.slice(5, 7), 16))];
};

/** Multiply a bucket's COLOR_0 by a dye (hex) over the atlas neutral, in linear light. */
export function dye(g, hexStr, neutral, pred = null) {
  const c = lin(hexStr);
  const n = g.pos.length / 3;
  if (!g.col || g.col.length !== n * 4) { g.col = []; for (let i = 0; i < n; i++) g.col.push(1, 1, 1, 1); }
  for (let i = 0; i < n; i++) {
    if (pred && !pred(i)) continue;
    for (let k = 0; k < 3; k++) g.col[i * 4 + k] = Math.min(1, g.col[i * 4 + k] * c[k] / neutral);
  }
  return g;
}

export { smooth };

/** The last resort for a far tier: collapses across components and seams, never over the target. */
export async function simplifySloppy(g, target, err = 0.2) {
  await MeshoptSimplifier.ready;
  if (tris(g) <= target) return g;
  const [out] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(g.idx), Float32Array.from(g.pos), 3, null, target * 3, err);
  return compact({ pos: g.pos.slice(), nrm: g.nrm.slice(), uv: g.uv.slice(), jnt: g.jnt.slice(), wgt: g.wgt.slice(), col: g.col?.slice(), idx: Array.from(out) });
}

/**
 * Clip a bucket by a plane: `side(i)` is the signed distance of vertex i (keep >= 0). Triangles crossing the plane are cut on
 * it, so a rolled sleeve has a straight edge and not the source's triangle teeth. A new vertex's skin comes from the kept end of its edge.
 */
function clipBy(g, dist) {
  const o = emptyGeo();
  const hasCol = g.col && g.col.length === (g.pos.length / 3) * 4;
  const put = (i) => {
    const k = o.pos.length / 3;
    o.pos.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); o.nrm.push(g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]); o.uv.push(g.uv[i * 2], g.uv[i * 2 + 1]);
    for (let q = 0; q < 4; q++) { o.jnt.push(g.jnt[i * 4 + q]); o.wgt.push(g.wgt[i * 4 + q]); if (hasCol) o.col.push(g.col[i * 4 + q]); }
    return k;
  };
  const cross = (a, b) => {
    const da = dist(a), db = dist(b), t = da / (da - db);
    const k = o.pos.length / 3;
    for (let q = 0; q < 3; q++) { o.pos.push(g.pos[a * 3 + q] + (g.pos[b * 3 + q] - g.pos[a * 3 + q]) * t); o.nrm.push(g.nrm[a * 3 + q] + (g.nrm[b * 3 + q] - g.nrm[a * 3 + q]) * t); }
    for (let q = 0; q < 2; q++) o.uv.push(g.uv[a * 2 + q] + (g.uv[b * 2 + q] - g.uv[a * 2 + q]) * t);
    for (let q = 0; q < 4; q++) { o.jnt.push(g.jnt[a * 4 + q]); o.wgt.push(g.wgt[a * 4 + q]); if (hasCol) o.col.push(g.col[a * 4 + q]); }
    return k;
  };
  const map = new Map();
  const keep = (i) => { let k = map.get(i); if (k === undefined) { k = put(i); map.set(i, k); } return k; };
  const inside = (i) => dist(i) >= 0;
  for (let t = 0; t < g.idx.length; t += 3) {
    const v = [g.idx[t], g.idx[t + 1], g.idx[t + 2]];
    const n = v.filter(inside).length;
    if (n === 3) { o.idx.push(keep(v[0]), keep(v[1]), keep(v[2])); continue; }
    if (n === 0) continue;
    let r = 0;
    if (n === 1) { while (!inside(v[r])) r++; } else { while (inside(v[r])) r++; }
    const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3];
    if (n === 1) {
      o.idx.push(keep(a), cross(a, b), cross(a, c));
    } else {
      const ab = cross(b, a), ac = cross(c, a);
      o.idx.push(keep(b), keep(c), ac, keep(b), ac, ab);
    }
  }
  return o;
}
export const clipAbsX = (g, X) => clipBy(g, (i) => X - Math.abs(g.pos[i * 3]));
export const clipTopY = (g, Y) => clipBy(g, (i) => Y - g.pos[i * 3 + 1]);
