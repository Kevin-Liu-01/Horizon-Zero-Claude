/**
 * CALIMA — armory W1: a per-vertex contact shadow for an outfit, baked in bind pose off every
 * layer and the body under it (the V-pan-closeup row asks for "layers with real depth: the
 * girdle over the smock with a contact shadow"; the atlas can only paint where a painter knows
 * something lies). Rays from each vertex over the hemisphere of its normal, a short reach, hits
 * weighted by how near they are; then a little smoothing along the mesh so it reads as soft.
 *
 *   bakeVertexAO(parts, { body, reach, rays, strength, skipOccluder }) -> Uint8Array   (0..255, 255 = open)
 *
 * The order of the result is the parts' own (as `mergeParts` / `outfitDoc` lays them out).
 * Node only, deterministic (a fixed ray set turned per vertex by a hash).
 */
const hash = (i) => { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };

/** A cosine-weighted hemisphere set about +Z (Fibonacci spiral). */
function raySet(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, r = Math.sqrt(u), a = i * 2.399963229728653;
    out.push([r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - u)]);
  }
  return out;
}

/** Triangle soup in a uniform grid. */
class Soup {
  constructor(cell = 0.02) { this.cell = cell; this.T = []; this.m = new Map(); }
  add(A, B, C, tag) {
    const i = this.T.length; this.T.push([A, B, C, tag]);
    const c = this.cell;
    const x0 = Math.floor(Math.min(A[0], B[0], C[0]) / c), x1 = Math.floor(Math.max(A[0], B[0], C[0]) / c);
    const y0 = Math.floor(Math.min(A[1], B[1], C[1]) / c), y1 = Math.floor(Math.max(A[1], B[1], C[1]) / c);
    const z0 = Math.floor(Math.min(A[2], B[2], C[2]) / c), z1 = Math.floor(Math.max(A[2], B[2], C[2]) / c);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const k = `${x},${y},${z}`; let L = this.m.get(k); if (!L) { L = []; this.m.set(k, L); } L.push(i);
    }
  }
  /** Nearest hit distance along the ray within `reach` (Moller-Trumbore), skipping triangles `skip(tag)`; or -1. */
  cast(o, d, reach, skip) {
    const c = this.cell, steps = Math.ceil(reach / (c * 0.5));
    const seen = new Set();
    let best = -1;
    for (let s = 0; s <= steps; s++) {
      const t0 = (s / steps) * reach;
      const k = `${Math.floor((o[0] + d[0] * t0) / c)},${Math.floor((o[1] + d[1] * t0) / c)},${Math.floor((o[2] + d[2] * t0) / c)}`;
      const L = this.m.get(k); if (!L) continue;
      for (const i of L) {
        if (seen.has(i)) continue; seen.add(i);
        const [A, B, C, tag] = this.T[i];
        if (skip && skip(tag)) continue;
        const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
        const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det, tv = [o[0] - A[0], o[1] - A[1], o[2] - A[2]];
        const u = (tv[0] * p[0] + tv[1] * p[1] + tv[2] * p[2]) * inv; if (u < 0 || u > 1) continue;
        const q = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
        const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (v < 0 || u + v > 1) continue;
        const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
        if (t > 0 && t <= reach && (best < 0 || t < best)) best = t;
      }
      if (best >= 0 && best < t0) break;
    }
    return best;
  }
}

/**
 * `parts`: the outfit's parts (pos, nrm, idx; `pieceBit` for pieces that come and go: a piece never
 * shades the others, only itself). `body`: a part for the body under them (occluder only).
 */
export function bakeVertexAO(parts, { body = null, reach = 0.055, rays = 28, strength = 0.75, start = 0.0015, smooth = 2 } = {}) {
  const soup = new Soup(0.02);
  const addPart = (p, tag) => { const P = p.pos; for (let t = 0; t < p.idx.length; t += 3) { const a = p.idx[t] * 3, b = p.idx[t + 1] * 3, c = p.idx[t + 2] * 3; soup.add([P[a], P[a + 1], P[a + 2]], [P[b], P[b + 1], P[b + 2]], [P[c], P[c + 1], P[c + 2]], tag); } };
  if (body) addPart(body, -1);
  parts.forEach((p, i) => addPart(p, i));
  const R = raySet(rays);
  const out = [];
  parts.forEach((p, pi) => {
    const n = p.pos.length / 3, occ = new Float64Array(n);
    // a piece that comes and goes (a hat copy) shades nothing but itself
    const skip = (tag) => tag >= 0 && tag !== pi && (parts[tag].pieceBit || 0) > 1;
    for (let i = 0; i < n; i++) {
      const o0 = [p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]];
      let N = [p.nrm[i * 3], p.nrm[i * 3 + 1], p.nrm[i * 3 + 2]];
      const l = Math.hypot(N[0], N[1], N[2]) || 1; N = [N[0] / l, N[1] / l, N[2] / l];
      const ref = Math.abs(N[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let T = [ref[1] * N[2] - ref[2] * N[1], ref[2] * N[0] - ref[0] * N[2], ref[0] * N[1] - ref[1] * N[0]];
      const tl = Math.hypot(...T) || 1; T = T.map((q) => q / tl);
      const Bv = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
      const rot = hash(i + pi * 7919) * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
      const o = [o0[0] + N[0] * start, o0[1] + N[1] * start, o0[2] + N[2] * start];
      let hit = 0;
      for (const [x0, y0, z] of R) {
        const x = x0 * cr - y0 * sr, y = x0 * sr + y0 * cr;
        const d = [T[0] * x + Bv[0] * y + N[0] * z, T[1] * x + Bv[1] * y + N[1] * z, T[2] * x + Bv[2] * y + N[2] * z];
        const t = soup.cast(o, d, reach, skip);
        if (t >= 0) hit += 1 - 0.6 * (t / reach);
      }
      occ[i] = hit / R.length;
    }
    // soften along the mesh (shared positions and edges)
    for (let s = 0; s < smooth; s++) {
      const acc = Float64Array.from(occ), cnt = new Float64Array(n).fill(1);
      for (let t = 0; t < p.idx.length; t += 3) {
        const a = p.idx[t], b = p.idx[t + 1], c = p.idx[t + 2];
        acc[a] += occ[b] + occ[c]; cnt[a] += 2; acc[b] += occ[a] + occ[c]; cnt[b] += 2; acc[c] += occ[a] + occ[b]; cnt[c] += 2;
      }
      for (let i = 0; i < n; i++) occ[i] = acc[i] / cnt[i];
    }
    for (let i = 0; i < n; i++) out.push(Math.round(255 * (1 - strength * Math.min(1, occ[i] * 1.25))));
  });
  return new Uint8Array(out);
}
