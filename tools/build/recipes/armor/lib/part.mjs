/**
 * CALIMA — armor recipes: a garment part as plain arrays (armory W1).
 *
 * A Part is what every armor recipe works on between the sources and the one
 * merged primitive: { slot, pos, nrm, uv, jnt, wgt, idx } as JS arrays, in the
 * RAW bind space of the UBC skeleton (+Z front, +X her left). Parts come from a
 * grafted MCO primitive (`partFromPrim`) or from the procedural builders in
 * garment.mjs. Deterministic: no clocks, no Math.random.
 */
export const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

export function emptyPart(slot, opts = {}) {
  return { slot, pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [], metricUV: true, ...opts };
}

/** Copy a grafted glTF primitive into arrays. */
export function partFromPrim(prim, slot, opts = {}) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), UV = prim.getAttribute('TEXCOORD_0');
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const n = P.getCount();
  const part = emptyPart(slot, { metricUV: false, ...opts });
  const a = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    P.getElement(i, a); part.pos.push(a[0], a[1], a[2]);
    N.getElement(i, a); part.nrm.push(a[0], a[1], a[2]);
    UV.getElement(i, a); part.uv.push(a[0], a[1]);
    J.getElement(i, a); part.jnt.push(a[0], a[1], a[2], a[3]);
    W.getElement(i, a); part.wgt.push(a[0], a[1], a[2], a[3]);
  }
  part.idx = Array.from(prim.getIndices().getArray());
  return part;
}

/** Keep the triangles for which keep(cx, cy, cz, minY, maxY) holds; unused vertices removed. */
export function cutTris(part, keep) {
  const { pos, idx } = part;
  const out = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1], yc = pos[c * 3 + 1];
    const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, cy = (ya + yb + yc) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
    if (keep(cx, cy, cz, Math.min(ya, yb, yc), Math.max(ya, yb, yc))) out.push(a, b, c);
  }
  part.idx = out;
  return compact(part);
}

export function compact(part) {
  const n = part.pos.length / 3;
  const map = new Int32Array(n).fill(-1);
  const np = [], nn = [], nu = [], nj = [], nw = [];
  let w = 0;
  const idx = part.idx;
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    if (map[v] < 0) {
      map[v] = w++;
      np.push(part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]);
      nn.push(part.nrm[v * 3], part.nrm[v * 3 + 1], part.nrm[v * 3 + 2]);
      nu.push(part.uv[v * 2], part.uv[v * 2 + 1]);
      nj.push(part.jnt[v * 4], part.jnt[v * 4 + 1], part.jnt[v * 4 + 2], part.jnt[v * 4 + 3]);
      nw.push(part.wgt[v * 4], part.wgt[v * 4 + 1], part.wgt[v * 4 + 2], part.wgt[v * 4 + 3]);
    }
    idx[i] = map[v];
  }
  part.pos = np; part.nrm = nn; part.uv = nu; part.jnt = nj; part.wgt = nw;
  return part;
}

/** Smooth normals from the triangles (positions welded by 0.1 mm across UV seams). */
export function recomputeNormals(part) {
  const { pos, idx } = part;
  const n = pos.length / 3;
  const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  const ids = new Map();
  const weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); if (!ids.has(k)) ids.set(k, ids.size); weld[i] = ids.get(k); }
  const acc = new Float64Array(ids.size * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { const o = weld[v] * 3; acc[o] += nx; acc[o + 1] += ny; acc[o + 2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const o = weld[i] * 3, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
    part.nrm[i * 3] = acc[o] / l; part.nrm[i * 3 + 1] = acc[o + 1] / l; part.nrm[i * 3 + 2] = acc[o + 2] / l;
  }
  return part;
}

/**
 * Point cloud with a uniform grid: nearest queries (skin transfer, push-out)
 * and a radial profile around a vertical axis (the loft builders).
 */
export class Field {
  constructor(parts, cell = 0.04) {
    this.cell = cell;
    this.grid = new Map();
    this.pts = [];
    for (const p of parts) {
      const n = p.pos.length / 3;
      for (let i = 0; i < n; i++) {
        const o = this.pts.length;
        this.pts.push({
          x: p.pos[i * 3], y: p.pos[i * 3 + 1], z: p.pos[i * 3 + 2],
          nx: p.nrm[i * 3], ny: p.nrm[i * 3 + 1], nz: p.nrm[i * 3 + 2],
          j: p.jnt ? [p.jnt[i * 4], p.jnt[i * 4 + 1], p.jnt[i * 4 + 2], p.jnt[i * 4 + 3]] : null,
          w: p.wgt ? [p.wgt[i * 4], p.wgt[i * 4 + 1], p.wgt[i * 4 + 2], p.wgt[i * 4 + 3]] : null,
        });
        const k = this._key(this.pts[o].x, this.pts[o].y, this.pts[o].z);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(o);
      }
    }
  }
  _key(x, y, z) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`; }
  /** The k nearest points to (x, y, z), nearest first: [{ p, d }]. */
  nearest(x, y, z, k = 1, maxRing = 12) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell), cz = Math.floor(z / this.cell);
    const best = [];
    for (let r = 0; r <= maxRing; r++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
        if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== r) continue;
        const list = this.grid.get(`${cx + a},${cy + b},${cz + c}`);
        if (!list) continue;
        for (const i of list) {
          const q = this.pts[i];
          const d = Math.hypot(q.x - x, q.y - y, q.z - z);
          best.push({ p: q, d });
        }
      }
      if (best.length >= k) {
        best.sort((u, v) => u.d - v.d);
        best.length = Math.min(best.length, Math.max(k, 8));
        if (best[Math.min(k, best.length) - 1].d <= r * this.cell) break;
      }
    }
    best.sort((u, v) => u.d - v.d);
    return best.slice(0, k);
  }
  /** Blended skin of the k nearest points (inverse-distance), top 4 joints, summing to 1. */
  skin(x, y, z, k = 4) {
    const near = this.nearest(x, y, z, k);
    const acc = new Map();
    for (const { p, d } of near) {
      const f = 1 / (d * d + 1e-4);
      for (let m = 0; m < 4; m++) if (p.w[m] > 0) acc.set(p.j[m], (acc.get(p.j[m]) || 0) + p.w[m] * f);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const s = top.reduce((u, e) => u + e[1], 0) || 1;
    const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    top.forEach((e, m) => { j[m] = e[0]; w[m] = e[1] / s; });
    return { j, w };
  }
  /**
   * Radial extent of the cloud around the vertical axis (cx, cz): the largest
   * radius of the points within `dy` of y and `dth` of the bearing `th`
   * (0 = +X, PI/2 = +Z). 0 when none.
   */
  radial(y, th, cx = 0, cz = 0, dy = 0.018, dth = 0.2, keep = null) {
    let r = 0;
    for (const q of this.pts) {
      if (Math.abs(q.y - y) > dy) continue;
      if (keep && !keep(q)) continue;
      const a = Math.atan2(q.z - cz, q.x - cx);
      let dA = Math.abs(a - th); if (dA > Math.PI) dA = 2 * Math.PI - dA;
      if (dA > dth) continue;
      const rr = Math.hypot(q.x - cx, q.z - cz);
      if (rr > r) r = rr;
    }
    return r;
  }
}

/**
 * Push a part out of a body field: any vertex closer than `margin(x, y, z)`
 * above the body surface moves out along the body normal, then the whole part
 * is low-passed once so the push does not leave kinks. Skin is transferred
 * from the body when `transfer` is set (so the cloth deforms with the skin
 * under it: the cheapest cure for penetration in poses).
 */
export function conform(part, body, { margin = () => 0.004, transfer = 1, smooth = 2, field = null } = {}) {
  const n = part.pos.length / 3;
  const disp = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = part.pos[i * 3], y = part.pos[i * 3 + 1], z = part.pos[i * 3 + 2];
    const near = body.nearest(x, y, z, 3);
    if (!near.length) continue;
    let sx = 0, sy = 0, sz = 0, sd = 0, sf = 0;
    for (const { p, d } of near) {
      const f = 1 / (d * d + 1e-5);
      sx += p.nx * f; sy += p.ny * f; sz += p.nz * f;
      sd += ((x - p.x) * p.nx + (y - p.y) * p.ny + (z - p.z) * p.nz) * f; sf += f;
    }
    const l = Math.hypot(sx, sy, sz) || 1;
    const nx = sx / l, ny = sy / l, nz = sz / l;
    const h = sd / sf;
    const m = margin(x, y, z);
    const extra = field ? field(x, y, z, nx, ny, nz) : 0;
    const need = Math.max(0, m - h) + extra;
    if (need > 0) { disp[i * 3] = nx * need; disp[i * 3 + 1] = ny * need; disp[i * 3 + 2] = nz * need; }
  }
  // low-pass the displacement over the welded mesh
  const key = (i) => `${Math.round(part.pos[i * 3] * 1e4)},${Math.round(part.pos[i * 3 + 1] * 1e4)},${Math.round(part.pos[i * 3 + 2] * 1e4)}`;
  const ids = new Map(); const weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); if (!ids.has(k)) ids.set(k, ids.size); weld[i] = ids.get(k); }
  const m = ids.size;
  let D = new Float64Array(m * 3); const cnt0 = new Int32Array(m);
  for (let i = 0; i < n; i++) { const o = weld[i]; D[o * 3] += disp[i * 3]; D[o * 3 + 1] += disp[i * 3 + 1]; D[o * 3 + 2] += disp[i * 3 + 2]; cnt0[o]++; }
  for (let o = 0; o < m; o++) { const c = cnt0[o] || 1; D[o * 3] /= c; D[o * 3 + 1] /= c; D[o * 3 + 2] /= c; }
  const nb = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < part.idx.length; t += 3) {
    const a = weld[part.idx[t]], b = weld[part.idx[t + 1]], c = weld[part.idx[t + 2]];
    nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
  }
  for (let s = 0; s < smooth; s++) {
    const E = new Float64Array(m * 3);
    for (let o = 0; o < m; o++) {
      let ax = D[o * 3] * 2, ay = D[o * 3 + 1] * 2, az = D[o * 3 + 2] * 2, c = 2;
      for (const q of nb[o]) { ax += D[q * 3]; ay += D[q * 3 + 1]; az += D[q * 3 + 2]; c++; }
      E[o * 3] = ax / c; E[o * 3 + 1] = ay / c; E[o * 3 + 2] = az / c;
    }
    D = E;
  }
  for (let i = 0; i < n; i++) {
    const o = weld[i];
    part.pos[i * 3] += D[o * 3]; part.pos[i * 3 + 1] += D[o * 3 + 1]; part.pos[i * 3 + 2] += D[o * 3 + 2];
    if (transfer) {
      const s = body.skin(part.pos[i * 3], part.pos[i * 3 + 1], part.pos[i * 3 + 2], 4);
      for (let k = 0; k < 4; k++) { part.jnt[i * 4 + k] = s.j[k]; part.wgt[i * 4 + k] = s.w[k]; }
    }
  }
  return part;
}

/** Append a vertex grid: rows x cols of [x,y,z], given metric uv and skin function. */
export function gridInto(part, rows, cols, fn, { closed = false, flip = false } = {}) {
  const base = part.pos.length / 3;
  const cc = cols + 1;
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const v = fn(r / rows, c / cols, r, c);
    part.pos.push(v.p[0], v.p[1], v.p[2]);
    part.nrm.push(0, 1, 0);
    part.uv.push(v.uv[0], v.uv[1]);
    part.jnt.push(v.j[0], v.j[1], v.j[2], v.j[3]);
    part.wgt.push(v.w[0], v.w[1], v.w[2], v.w[3]);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = base + r * cc + c, b = a + 1, d = a + cc, e = d + 1;
    if (flip) part.idx.push(a, b, d, b, e, d); else part.idx.push(a, d, b, b, d, e);
  }
  void closed;
  return part;
}

/** Merge parts into flat typed arrays: { pos, nrm, uv, jnt, wgt, idx, ranges: {slot: [firstTri, triCount]} } */
export function mergeParts(parts) {
  const out = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [], piece: [], ranges: {} };
  for (const p of parts) {
    const o = out.pos.length / 3;
    const first = out.idx.length / 3;
    const nv = p.pos.length / 3;
    for (let i = 0; i < p.pos.length; i++) out.pos.push(p.pos[i]);
    for (let i = 0; i < p.nrm.length; i++) out.nrm.push(p.nrm[i]);
    for (let i = 0; i < p.uv.length; i++) out.uv.push(p.uv[i]);
    for (let i = 0; i < p.jnt.length; i++) out.jnt.push(p.jnt[i]);
    for (let i = 0; i < p.wgt.length; i++) out.wgt.push(p.wgt[i]);
    for (let i = 0; i < p.idx.length; i++) out.idx.push(p.idx[i] + o);
    for (let i = 0; i < nv; i++) out.piece.push(p.pieceBit || 0);
    const r = out.ranges[p.slot] || [first, 0];
    r[1] += p.idx.length / 3;
    out.ranges[p.slot] = r;
  }
  return out;
}
