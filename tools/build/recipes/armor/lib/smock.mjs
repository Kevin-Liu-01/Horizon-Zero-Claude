/**
 * CALIMA — armor recipes: a loose garment cut from a radial table (armory W1).
 *
 * The MCO bodice is sewn to a mannequin: every cup and under-bust ledge in it is in
 * the mesh, so a re-texture can only ever read as a corset. Real cloth is under
 * tension across the body's high points and HANGS from them. So the smock is lofted
 * from what the cloth would actually touch:
 *
 *   radialTable   the outermost radius per (height, bearing) of the surfaces under it
 *   drapeTable    per height: the convex hull of the slice (cloth bridges every hollow);
 *                 per bearing: a straight run from the collarbone to the bust's apex,
 *                 and below it a limited fall (it hangs, it does not cup back in)
 *   draftSmock    one ring-cut sheet from the neckline to the belt, opening at the
 *                 centre front (the keyhole), with real armholes, metric UVs and the
 *                 skin of the body under it. `edges` returns its open edges in order,
 *                 which is what the binding tapes follow.
 *
 * Bearings as garment.mjs: 0 = +X (her left), PI/2 = +Z (front). Deterministic.
 */
import { V, clamp, mix, sstep } from './part.mjs';
import { ripple, TAU } from './garment.mjs';

/** The outermost radius per (y row, bearing) of `parts` around (0, cz). Sampled off the triangles, not the vertices. */
export function radialTable(parts, { y0, y1, dy = 0.005, nTh = 180, cz = -0.02, keep = null, step = 0.006 } = {}) {
  const nY = Math.ceil((y1 - y0) / dy) + 1;
  const R = new Float64Array(nY * nTh);
  for (const part of parts) {
    const { pos, idx } = part;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], B = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], C = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
      if (Math.max(A[1], B[1], C[1]) < y0 || Math.min(A[1], B[1], C[1]) > y1) continue;
      const L = Math.max(V.len(V.sub(A, B)), V.len(V.sub(B, C)), V.len(V.sub(C, A)));
      const n = Math.max(1, Math.ceil(L / step));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        const x = A[0] * u + B[0] * v + C[0] * w, y = A[1] * u + B[1] * v + C[1] * w, z = A[2] * u + B[2] * v + C[2] * w;
        if (y < y0 || y > y1 || (keep && !keep(x, y, z))) continue;
        const yi = Math.round((y - y0) / dy);
        const ti = Math.floor(((Math.atan2(z - cz, x) + Math.PI) / TAU) * nTh) % nTh;
        const r = Math.hypot(x, z - cz);
        if (r > R[yi * nTh + ti]) R[yi * nTh + ti] = r;
      }
    }
  }
  return { R, nY, nTh, y0, dy, cz };
}

/** Bilinear read of a table at (y, bearing). */
export function tableAt(T, y, th) {
  const fy = clamp((y - T.y0) / T.dy, 0, T.nY - 1.0001), yi = Math.floor(fy), ay = fy - yi;
  let f = (((th + Math.PI) / TAU) % 1 + 1) % 1 * T.nTh - 0.5; if (f < 0) f += T.nTh;
  const ti = Math.floor(f) % T.nTh, at = f - Math.floor(f), tj = (ti + 1) % T.nTh;
  const R = T.R, n = T.nTh;
  return (R[yi * n + ti] * (1 - at) + R[yi * n + tj] * at) * (1 - ay) + (R[(yi + 1) * n + ti] * (1 - at) + R[(yi + 1) * n + tj] * at) * ay;
}

/** A row's convex hull, re-read as a radius per bearing (zero bins are holes). */
function hullRow(R, off, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = R[off + i];
    if (r <= 0) continue;
    const th = -Math.PI + (i + 0.5) / n * TAU;
    pts.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  if (pts.length < 5) return;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const H = lo.slice(0, -1).concat(up.slice(0, -1));
  for (let i = 0; i < n; i++) {
    const th = -Math.PI + (i + 0.5) / n * TAU, cx = Math.cos(th), sx = Math.sin(th);
    let best = 0;
    for (let k = 0; k < H.length; k++) {
      const a = H[k], b = H[(k + 1) % H.length];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const det = cx * ey - sx * ex;
      if (Math.abs(det) < 1e-9) continue;
      const s = (a[0] * ey - a[1] * ex) / det, u = (a[0] * sx - a[1] * cx) / det;
      if (s > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, s);
    }
    if (best > 0) R[off + i] = best;
  }
}

/**
 * What a loose cloth does over the table: `fall` metres in per metre down from the
 * apex (it hangs), a straight run from the top down to the apex (tension), `margin`
 * ease all over, and a low-pass so no body landmark prints through.
 */
export function drapeTable(T, { apex = [1.24, 1.40], fall = 0.32, margin = () => 0.006, passes = 3, minEase = 0.003 } = {}) {
  const { nY, nTh, y0, dy } = T;
  const src = T.R.slice();
  const R = T.R.slice();
  for (let y = 0; y < nY; y++) hullRow(R, y * nTh, nTh);
  const iA0 = Math.round((apex[0] - y0) / dy), iA1 = Math.round((apex[1] - y0) / dy);
  for (let t = 0; t < nTh; t++) {
    let iA = iA0, rA = 0;
    for (let y = iA0; y <= iA1; y++) if (R[y * nTh + t] > rA) { rA = R[y * nTh + t]; iA = y; }
    for (let y = iA - 1; y >= 0; y--) {
      const at = rA - fall * (iA - y) * dy;
      if (R[y * nTh + t] < at) R[y * nTh + t] = at;
    }
    // the upper hull of (y, r) from the apex up: a straight run across any hollow
    const st = [iA];
    for (let y = iA + 1; y < nY; y++) {
      if (R[y * nTh + t] <= 0) continue;
      while (st.length >= 2) {
        const a = st[st.length - 2], b = st[st.length - 1];
        const ra = R[a * nTh + t], rb = R[b * nTh + t], rc = R[y * nTh + t];
        if ((rb - ra) * (y - a) <= (rc - ra) * (b - a)) st.pop(); else break;
      }
      st.push(y);
    }
    for (let k = 0; k + 1 < st.length; k++) {
      const a = st[k], b = st[k + 1], ra = R[a * nTh + t], rb = R[b * nTh + t];
      for (let y = a + 1; y < b; y++) R[y * nTh + t] = Math.max(R[y * nTh + t], mix(ra, rb, (y - a) / (b - a)));
    }
  }
  for (let y = 0; y < nY; y++) { const m = margin(y0 + y * dy); for (let t = 0; t < nTh; t++) R[y * nTh + t] += m; }
  // Armory W1: the body under the cloth is read row by row (the outermost sample in each 5 mm band), a staircase
  // where the surface leans; the ease's floor used to be that staircase itself, so every row re-imposed it and the
  // smock showed contour rings round the bust under a low light. The floor is now the body smoothed down its
  // height, and the cloth over it twice as smooth
  const srcS = src.slice();
  for (let p = 0; p < 4; p++) {
    const O = srcS.slice();
    for (let y = 0; y < nY; y++) for (let t = 0; t < nTh; t++) {
      const c = O[y * nTh + t]; if (c <= 0) continue;
      const u = O[Math.max(0, y - 1) * nTh + t] || c, d = O[Math.min(nY - 1, y + 1) * nTh + t] || c;
      srcS[y * nTh + t] = (2 * c + u + d) / 4;
    }
  }
  for (let p = 0; p < passes * 2; p++) {
    const O = R.slice();
    for (let y = 0; y < nY; y++) for (let t = 0; t < nTh; t++) {
      const yu = Math.max(0, y - 1), yd = Math.min(nY - 1, y + 1), tl = (t - 1 + nTh) % nTh, tr = (t + 1) % nTh;
      const v = (2 * O[y * nTh + t] + O[yu * nTh + t] + O[yd * nTh + t] + O[y * nTh + tl] + O[y * nTh + tr]) / 6;
      R[y * nTh + t] = Math.max(v, srcS[y * nTh + t] + minEase);
    }
  }
  return { ...T, R, src };
}

/**
 * The sheet. `neckY(deltaFromFront)` gives the neckline's height at an angle from the
 * centre front; `slit` = { yBottom, half, round } opens a keyhole at the centre front
 * below it; `armholes` = [{ side, y, z, ry, rz, xMin }] are cut through the side walls,
 * with their rims snapped onto the ellipse.
 */
export function draftSmock(part, T, skin, {
  rows = 24, cols = 76, neckY, yBelt, gather = null, seed = 1, slit = null, armholes = [], density = 1, uvScale = 1,
} = {}) {
  const cz = T.cz;
  const th0 = Math.PI / 2;
  const posAt = (y, th) => { const r = tableAt(T, y, th); return [Math.cos(th) * r, y, cz + Math.sin(th) * r]; };
  const gridP = [];
  for (let c = 0; c <= cols; c++) {
    const th = th0 + (c / cols) * TAU;
    let del = Math.abs(((th - th0) % TAU + TAU) % TAU);
    if (del > Math.PI) del = TAU - del;
    const yN = neckY(del);
    const M = Math.round((yN - yBelt) / 0.002);
    const prof = [];
    let acc = 0, prev = null;
    for (let m = 0; m <= M; m++) {
      const y = mix(yN, yBelt, m / M);
      const r = tableAt(T, y, th);
      if (prev) acc += Math.hypot(r - prev[0], y - prev[1]);
      prev = [r, y];
      prof.push([r, y, acc]);
    }
    const col = [];
    let k = 0;
    for (let i = 0; i <= rows; i++) {
      const want = acc * (i / rows);
      while (k + 1 < prof.length && prof[k + 1][2] < want) k++;
      const a = prof[k], b = prof[Math.min(k + 1, prof.length - 1)];
      const f = b[2] > a[2] ? (want - a[2]) / (b[2] - a[2]) : 0;
      col.push({ y: mix(a[1], b[1], f), r: mix(a[0], b[0], f), s: want, th });
    }
    gridP.push(col);
  }
  // folds in the mesh: long soft ones low down, tight gathers just above the belt
  const P = [];
  for (let c = 0; c <= cols; c++) for (let i = 0; i <= rows; i++) {
    const q = gridP[c][i];
    const y = q.y;
    const low = sstep(1.27, 1.2, y), gth = sstep(1.205, 1.16, y);
    // (armory W1: the gathers a little deeper, 5.5 mm, and the outfit's painter shades these same ripples)
    const a = 0.0034 * low * (1 - 0.5 * gth) * ripple(q.th, seed, [5, 8]) + 0.0055 * gth * ripple(q.th, seed + 3, [13, 17, 21]);
    const g = gather ? gather(y, q.th) : null;
    let r = (g != null ? mix(q.r, g, sstep(1.205, 1.152, y)) : q.r) + a;
    // the keyhole: the two edges part above its bottom
    let th = q.th;
    if (slit && y > slit.yBottom && (c <= 1 || c >= cols - 1)) {
      const open = slit.half * Math.sqrt(clamp((y - slit.yBottom) / slit.round));
      const w = (c === 0 || c === cols) ? 1 : 0.55;
      th += (c <= 1 ? 1 : -1) * (open / Math.max(0.03, r)) * w;
    }
    P.push([Math.cos(th) * r, y, cz + Math.sin(th) * r]);
  }
  const id = (c, i) => c * (rows + 1) + i;
  // metric uv: v down the column, u the arc of its row from the centre back
  const base = part.pos.length / 3;
  const midC = Math.round(cols / 2);
  const U = new Float64Array((cols + 1) * (rows + 1));
  for (let i = 0; i <= rows; i++) {
    let acc = 0;
    for (let c = midC + 1; c <= cols; c++) { acc += V.len(V.sub(P[id(c, i)], P[id(c - 1, i)])); U[id(c, i)] = acc; }
    acc = 0;
    for (let c = midC - 1; c >= 0; c--) { acc -= V.len(V.sub(P[id(c, i)], P[id(c + 1, i)])); U[id(c, i)] = acc; }
  }
  // (armory W1: v used to start at 0 on the neckline, so every weft thread and slub the painters draw along v ran
  // parallel to the scooped neck: rings round her bust. It now starts at the neckline's height under a level line,
  // so the weft runs level across the cloth, as woven)
  const yRef = Math.max(...Array.from({ length: cols + 1 }, (_, c) => P[id(c, 0)][1]));
  for (let c = 0; c <= cols; c++) {
    let vv = yRef - P[id(c, 0)][1];
    for (let i = 0; i <= rows; i++) {
      if (i) vv += V.len(V.sub(P[id(c, i)], P[id(c, i - 1)]));
      const p = P[id(c, i)];
      const s = skin.skin(p[0], p[1], p[2], 4);
      part.pos.push(...p); part.nrm.push(0, 1, 0);
      part.uv.push((U[id(c, i)] + 0.5) * uvScale, vv * uvScale);
      part.jnt.push(...s.j); part.wgt.push(...s.w);
    }
  }
  for (let c = 0; c < cols; c++) for (let i = 0; i < rows; i++) {
    const a = base + id(c, i), b = base + id(c + 1, i), d = base + id(c, i + 1), e = base + id(c + 1, i + 1);
    part.idx.push(a, d, b, b, d, e);
  }
  part.density = density;
  for (const h of armholes) cutEllipse(part, h, skin);
  return part;
}

/**
 * Cut an armhole: every triangle is clipped against the ellipse in the (y, z) plane on
 * one side of her, so the rim is a clean curve however the grid crosses it. New
 * vertices interpolate uv and take the body's skin.
 */
function cutEllipse(part, a, skin) {
  const { pos, uv } = part;
  const f = (i) => {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (Math.sign(x) !== a.side || Math.abs(x) < a.xMin) return 1;
    return Math.sqrt(((y - a.y) / a.ry) ** 2 + ((z - a.z) / a.rz) ** 2) - 1;       // < 0 inside
  };
  const edgeMemo = new Map();
  const split = (i, j) => {
    const k = i < j ? `${i}_${j}` : `${j}_${i}`;
    if (edgeMemo.has(k)) return edgeMemo.get(k);
    let lo = 0, hi = 1;
    const fi = f(i);
    const P = (t) => [mix(pos[i * 3], pos[j * 3], t), mix(pos[i * 3 + 1], pos[j * 3 + 1], t), mix(pos[i * 3 + 2], pos[j * 3 + 2], t)];
    const F = ([x, y, z]) => (Math.sign(x) !== a.side || Math.abs(x) < a.xMin ? 1 : Math.sqrt(((y - a.y) / a.ry) ** 2 + ((z - a.z) / a.rz) ** 2) - 1);
    for (let it = 0; it < 18; it++) { const m = (lo + hi) / 2; if ((F(P(m)) < 0) === (fi < 0)) lo = m; else hi = m; }
    const t = (lo + hi) / 2, q = P(t);
    const n = pos.length / 3;
    pos.push(...q); part.nrm.push(0, 1, 0);
    uv.push(mix(uv[i * 2], uv[j * 2], t), mix(uv[i * 2 + 1], uv[j * 2 + 1], t));
    const s = skin.skin(q[0], q[1], q[2], 4);
    part.jnt.push(...s.j); part.wgt.push(...s.w);
    edgeMemo.set(k, n);
    return n;
  };
  const out = [];
  const idx = part.idx;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    const ins = v.map((q) => f(q) < 0);
    const nIn = ins[0] + ins[1] + ins[2];
    if (nIn === 0) { out.push(...v); continue; }
    if (nIn === 3) continue;
    // rotate so v[0] is the odd one out
    const odd = nIn === 1 ? ins.indexOf(true) : ins.indexOf(false);
    const [A, B, C] = [v[odd], v[(odd + 1) % 3], v[(odd + 2) % 3]];
    const ab = split(A, B), ac = split(A, C);
    if (nIn === 1) { out.push(ab, B, C, ab, C, ac); } else { out.push(A, ab, ac); }
  }
  part.idx = out;
}

/**
 * The open edges of a part, chained into ordered loops or runs of positions, each
 * `[{ p, n, i }]`. Vertices are welded by position; only edges with one triangle count.
 */
export function openEdges(part) {
  const { pos, nrm, idx } = part;
  const n = pos.length / 3;
  const ids = new Map(), weld = new Int32Array(n), rep = [];
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    if (!ids.has(k)) { ids.set(k, ids.size); rep.push(i); }
    weld[i] = ids.get(k);
  }
  const count = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
      const u = weld[a], v = weld[b];
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const adj = new Map();
  for (const [k, c] of count) {
    if (c !== 1) continue;
    const [u, v] = k.split('_').map(Number);
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u).push(v); adj.get(v).push(u);
  }
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const run = [start];
    seen.add(start);
    let cur = start;
    for (;;) {
      const nx = adj.get(cur).find((q) => !seen.has(q));
      if (nx == null) break;
      seen.add(nx); run.push(nx); cur = nx;
    }
    loops.push(run.map((w) => {
      const i = rep[w];
      return { p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], n: [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]], i };
    }));
  }
  return loops;
}

/**
 * A tape bound over a cut edge: a little C of cloth that wraps the edge and reads as
 * real thickness. `inward` = the direction from the edge into the cloth (per point).
 * u runs along the edge (mirrored at `tile`), v across the tape.
 */
export function bindingAlong(part, run, skin, { w = 0.011, lift = 0.0028, rect, tile = 0.3, closed = false, center = null, segEvery = 1 } = {}) {
  const pts = run.filter((_, i) => i % segEvery === 0);
  const N = pts.length;
  if (N < 3) return part;
  const base = part.pos.length / 3;
  const prof = [[-w, 0.0006], [-w * 0.45, lift], [w * 0.1, lift * 0.55], [0, -lift * 0.7]];
  let acc = 0;
  for (let k = 0; k < N; k++) {
    const q = pts[k], pv = pts[closed ? (k - 1 + N) % N : Math.max(0, k - 1)], nx = pts[closed ? (k + 1) % N : Math.min(N - 1, k + 1)];
    const tan = V.norm(V.sub(nx.p, pv.p));
    const n = V.norm(q.n);
    let inw = V.norm(V.cross(n, tan));
    if (center) {
      // the cloth lies AWAY from the opening's centre
      const out = V.sub(q.p, center(q.p));
      if (V.dot(inw, out) < 0) inw = V.mul(inw, -1);
    }
    if (k) acc += V.len(V.sub(q.p, pts[k - 1].p));
    for (let r = 0; r < prof.length; r++) {
      const [d, h] = prof[r];
      const p = V.add(V.add(q.p, V.mul(inw, -d)), V.mul(n, h));
      part.pos.push(...p); part.nrm.push(...V.norm(V.add(V.mul(n, h >= 0 ? 1 : -1), V.mul(inw, -d / (w * 1.6)))));
      const f = acc / tile, tri = Math.abs((f % 2) - 1);
      part.uv.push(rect[0] + rect[2] * tri, rect[1] + rect[3] * (r / (prof.length - 1)));
      const s = skin.skin(q.p[0], q.p[1], q.p[2], 4);
      part.jnt.push(...s.j); part.wgt.push(...s.w);
    }
  }
  const cc = prof.length;
  const K = closed ? N : N - 1;
  for (let k = 0; k < K; k++) {
    const k2 = (k + 1) % N;
    for (let r = 0; r < cc - 1; r++) {
      const a = base + k * cc + r, b = a + 1, d = base + k2 * cc + r, e = d + 1;
      part.idx.push(a, b, d, b, e, d);
    }
  }
  return part;
}

/**
 * A round section swept along a path (`closed` for a loop). Smooth normals from the
 * parallel-transported frame. rect: u along, v around.
 */
export function tubeInto(part, path, r, { sides = 6, closed = false, rect, joint = null, skin = null, tile = null, radiusAt = null } = {}) {
  const N = path.length;
  const base = part.pos.length / 3;
  let frame = null;
  let acc = 0;
  for (let k = 0; k < N + (closed ? 1 : 0); k++) {
    const i = k % N;
    const q = path[i];
    const pv = path[closed ? (i - 1 + N) % N : Math.max(0, i - 1)], nx = path[closed ? (i + 1) % N : Math.min(N - 1, i + 1)];
    const tan = V.norm(V.sub(nx, pv));
    if (!frame) {
      const a = Math.abs(tan[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const s = V.norm(V.cross(tan, a));
      frame = [s, V.norm(V.cross(s, tan))];
    } else {
      // parallel transport
      const s = V.norm(V.sub(frame[0], V.mul(tan, V.dot(frame[0], tan))));
      frame = [s, V.norm(V.cross(s, tan))];
    }
    if (k) acc += V.len(V.sub(q, path[(k - 1) % N]));
    const rr = radiusAt ? radiusAt(k / (N - 1 + (closed ? 1 : 0))) * r : r;
    const sk = skin ? skin.skin(q[0], q[1], q[2], 4) : null;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU;
      const nrm = V.add(V.mul(frame[0], Math.cos(a)), V.mul(frame[1], Math.sin(a)));
      part.pos.push(...V.add(q, V.mul(nrm, rr)));
      part.nrm.push(...nrm);
      const uu = tile ? Math.abs(((acc / tile) % 2) - 1) : k / (N - 1 + (closed ? 1 : 0));
      part.uv.push(rect[0] + rect[2] * uu, rect[1] + rect[3] * (s / sides));
      if (sk) { part.jnt.push(...sk.j); part.wgt.push(...sk.w); } else { part.jnt.push(joint, 0, 0, 0); part.wgt.push(1, 0, 0, 0); }
    }
  }
  const cc = sides + 1;
  const K = closed ? N : N - 1;
  for (let k = 0; k < K; k++) for (let s = 0; s < sides; s++) {
    const a = base + k * cc + s, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, d, b, b, d, e);
  }
  return part;
}

/** A rounded-rectangle path in the plane (X, Y) about `c`. */
export function roundRect(c, X, Y, hw, hh, rad, perCorner = 3) {
  const pts = [];
  const corners = [[hw - rad, hh - rad, 0], [-(hw - rad), hh - rad, Math.PI / 2], [-(hw - rad), -(hh - rad), Math.PI], [hw - rad, -(hh - rad), Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= perCorner; k++) {
      const a = a0 + (k / perCorner) * (Math.PI / 2);
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      pts.push(V.add(V.add(c, V.mul(X, x)), V.mul(Y, y)));
    }
  }
  return pts;
}

/**
 * A soft sheet with rounded corners and a belly: `u, v` in [-1, 1] mapped onto
 * (X * hw, Y * hh), pushed `belly` along Z in the middle and `edge` at the rim.
 * rect covers it whole (a stitched cell border lands on the rim).
 */
export function softSheet(part, c, [X, Y, Z], { hw, hh, belly = 0.01, edge = 0, nu = 6, nv = 6, rect, joint, round = 0.55, flip = false, bottomRound = null } = {}) {
  const base = part.pos.length / 3;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = -1 + 2 * i / nu, v = -1 + 2 * j / nv;
    const rk = bottomRound && v < 0 ? bottomRound : round;
    // squircle: pinches the corners in, keeps the sides straight
    const sx = u * mix(1, Math.sqrt(1 - 0.5 * v * v), rk), sy = v * mix(1, Math.sqrt(1 - 0.5 * u * u), rk);
    const b = (1 - u * u) * (1 - v * v);
    const q = V.add(V.add(V.add(c, V.mul(X, sx * hw)), V.mul(Y, sy * hh)), V.mul(Z, belly * b + edge));
    part.pos.push(...q); part.nrm.push(...Z);
    part.uv.push(rect[0] + rect[2] * (i / nu), rect[1] + rect[3] * (1 - j / nv));
    part.jnt.push(joint, 0, 0, 0); part.wgt.push(1, 0, 0, 0);
  }
  const cc = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = base + j * cc + i, b = a + 1, d = a + cc, e = d + 1;
    if (flip) part.idx.push(a, d, b, b, d, e); else part.idx.push(a, b, d, b, e, d);
  }
  return part;
}
