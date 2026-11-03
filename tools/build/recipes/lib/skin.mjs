/**
 * CALIMA — the skin library (character-art, W1; R54, R56: NPCs are built on this
 * same construction). Node only, no clocks, no Math.random: every output is a
 * pure function of the sources and the recipe numbers (A-build-deterministic).
 *
 * WHAT LIVES HERE (API in docs/ROUND5-CHARACTER-ART.md §3)
 *   uvIslands(prim)                     connected UV islands + bind boxes
 *   relayoutSkinUV(prim, opts)          re-packs the islands by a per-island texel
 *                                       density (uniform scale + translate only, so a
 *                                       tangent-space normal map stays valid): a face
 *                                       gets twice the texels, a hidden thigh a third
 *   TriGrid                             uniform grid of a triangle soup, ray casts
 *   hemisphereSet(n)                    a fixed cosine-weighted sample set
 *   bakeAOTexels(...), bakeAOPoints(...) deterministic obscurance, texels or vertices
 *   blurMasked(...)                     mask-aware separable blur inside one atlas
 *   convexity(prim)                     per-vertex mean-curvature proxy (form shading)
 *   worley2 / pnoise2 / fbm3            the noises the paint layers use
 *   composeNormal / encodeNormal        tangent-space compositing in atlas space
 *   paintSkinAtlas(opts)                the compositor: stock texture re-sampled into
 *                                       the new layout, retoned, form-shaded, then
 *                                       `layers` (salt paste, scar, tattoo, hairline,
 *                                       creases) add albedo + height + roughness
 *   saltPaste / scarSeam / inkDots /
 *   creases / pores / colourZones /
 *   eyeSocketClean / lipTone            ready-made layers
 *   paintEye(W, opts)                   a procedural eye patch (base, normal, ORM)
 */
import sharp from 'sharp';
import { positionMap, noise3, hex, smooth } from './face.mjs';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const rimT = (b) => smooth(0.05, 0.4, b);

/* =========================================================== UV islands */

/** Connected components over the index buffer: UV islands (vertices are split at UV seams). */
export function uvIslands(prim) {
  const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0');
  const idx = prim.getIndices().getArray();
  const n = P.getCount();
  const par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) { par[find(idx[t + 1])] = find(idx[t]); par[find(idx[t + 2])] = find(idx[t]); }
  const byRoot = new Map();
  const u = [0, 0], p = [0, 0, 0];
  const islandOf = new Int32Array(n);
  const islands = [];
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let s = byRoot.get(r);
    if (!s) {
      s = { id: islands.length, verts: 0, tris: 0, uv: [9, 9, -9, -9], min: [9, 9, 9], max: [-9, -9, -9] };
      byRoot.set(r, s); islands.push(s);
    }
    islandOf[i] = s.id;
    UV.getElement(i, u); P.getElement(i, p);
    s.verts++;
    s.uv[0] = Math.min(s.uv[0], u[0]); s.uv[1] = Math.min(s.uv[1], u[1]); s.uv[2] = Math.max(s.uv[2], u[0]); s.uv[3] = Math.max(s.uv[3], u[1]);
    for (let k = 0; k < 3; k++) { s.min[k] = Math.min(s.min[k], p[k]); s.max[k] = Math.max(s.max[k], p[k]); }
  }
  for (let t = 0; t < idx.length; t += 3) islands[islandOf[idx[t]]].tris++;
  return { islands, islandOf };
}

/** Skyline bottom-left packer. rects: [{ id, w, h }] in [0,1] units; returns id -> {x,y} or null when it does not fit. */
function skylinePack(rects, pad) {
  let sky = [{ x: 0, y: 0, w: 1 }];
  const out = new Map();
  for (const r of rects) {
    const w = r.w + pad, h = r.h + pad;
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x;
      if (x + w > 1 + 1e-9) continue;
      let top = 0, rem = w, j = i;
      while (rem > 1e-9 && j < sky.length) { top = Math.max(top, sky[j].y); rem -= sky[j].w; j++; }
      if (rem > 1e-9) continue;
      if (top + h > 1 + 1e-9) continue;
      if (!best || top < best.y - 1e-9 || (Math.abs(top - best.y) < 1e-9 && x < best.x)) best = { x, y: top };
    }
    if (!best) return null;
    out.set(r.id, { x: best.x, y: best.y });
    const nsky = [];
    for (const s of sky) {
      if (s.x + s.w <= best.x + 1e-9 || s.x >= best.x + w - 1e-9) { nsky.push(s); continue; }
      if (s.x < best.x) nsky.push({ x: s.x, y: s.y, w: best.x - s.x });
      if (s.x + s.w > best.x + w) nsky.push({ x: best.x + w, y: s.y, w: s.x + s.w - best.x - w });
    }
    nsky.push({ x: best.x, y: best.y + h, w });
    nsky.sort((a, b) => a.x - b.x);
    sky = [];
    for (const s of nsky) { const l = sky[sky.length - 1]; if (l && Math.abs(l.y - s.y) < 1e-9 && Math.abs(l.x + l.w - s.x) < 1e-9) l.w += s.w; else sky.push({ ...s }); }
  }
  return out;
}

/**
 * Re-pack a body's UV islands. `density(island)` is the wanted scale against the
 * source layout (1 = keep the source texel density; the atlas is the same [0,1]);
 * `reserve` = [{ id, w, h }] free rects in atlas units (a procedural eye patch).
 * Every island keeps its orientation, so tangent-space normals stay valid. Where the
 * wanted layout does not fit, only islands whose density is <= `elastic` shrink.
 * Mutates TEXCOORD_0. Returns { W, islands (with .s, .ox, .oy), islandOf, reserved }.
 */
export function relayoutSkinUV(prim, { density, reserve = [], pad = 0.008, elastic = 1.0 } = {}) {
  const { islands, islandOf } = uvIslands(prim);
  let k = 1;
  let placed = null;
  for (let tries = 0; tries < 40 && !placed; tries++) {
    const rects = [];
    for (const s of islands) {
      const d = density(s);
      s.s = d <= elastic ? d * k : d;
      rects.push({ id: `i${s.id}`, w: (s.uv[2] - s.uv[0]) * s.s, h: (s.uv[3] - s.uv[1]) * s.s, a: 0 });
    }
    for (const r of reserve) rects.push({ id: r.id, w: r.w, h: r.h });
    rects.sort((a, b) => (b.h * Math.max(b.w, b.h)) - (a.h * Math.max(a.w, a.h)) || (a.id < b.id ? -1 : 1));
    placed = skylinePack(rects, pad);
    if (!placed) k *= 0.97;
  }
  if (!placed) throw new Error('[skin] the atlas does not pack');
  for (const s of islands) {
    const q = placed.get(`i${s.id}`);
    s.ox = q.x + pad / 2 - s.uv[0] * s.s; s.oy = q.y + pad / 2 - s.uv[1] * s.s;
  }
  const UV = prim.getAttribute('TEXCOORD_0'), u = [0, 0];
  const arr = new Float32Array(UV.getCount() * 2);
  for (let i = 0; i < UV.getCount(); i++) {
    UV.getElement(i, u);
    const s = islands[islandOf[i]];
    arr[i * 2] = u[0] * s.s + s.ox; arr[i * 2 + 1] = u[1] * s.s + s.oy;
  }
  UV.setArray(arr);
  const reserved = {};
  for (const r of reserve) { const q = placed.get(r.id); reserved[r.id] = { x: q.x + pad / 2, y: q.y + pad / 2, w: r.w, h: r.h }; }
  return { islands, islandOf, reserved, shrink: k };
}

/* =========================================================== ray casting */

/** A uniform grid over a flat triangle soup [ax,ay,az,bx,by,bz,cx,cy,cz, ...]. */
export class TriGrid {
  constructor(tris, cell = 0.02) {
    this.t = tris; this.cell = cell;
    this.map = new Map();
    this.n = tris.length / 9;
    this.stamp = new Int32Array(this.n);
    this.tick = 0;
    for (let i = 0; i < this.n; i++) {
      const k = i * 9;
      const x0 = Math.floor(Math.min(tris[k], tris[k + 3], tris[k + 6]) / cell), x1 = Math.floor(Math.max(tris[k], tris[k + 3], tris[k + 6]) / cell);
      const y0 = Math.floor(Math.min(tris[k + 1], tris[k + 4], tris[k + 7]) / cell), y1 = Math.floor(Math.max(tris[k + 1], tris[k + 4], tris[k + 7]) / cell);
      const z0 = Math.floor(Math.min(tris[k + 2], tris[k + 5], tris[k + 8]) / cell), z1 = Math.floor(Math.max(tris[k + 2], tris[k + 5], tris[k + 8]) / cell);
      for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) for (let c = z0; c <= z1; c++) {
        const key = (a + 512) * 1048576 + (b + 512) * 1024 + (c + 512);
        let l = this.map.get(key); if (!l) { l = []; this.map.set(key, l); }
        l.push(i);
      }
    }
  }

  /** Nearest hit distance along the unit ray within (minT, maxT), or -1. */
  cast(ox, oy, oz, dx, dy, dz, maxT, minT = 0.0008) {
    const t = this.t, cell = this.cell;
    const tick = ++this.tick;
    let best = -1;
    const step = cell * 0.5;
    let lastKey = -1;
    for (let s = 0; s <= maxT + step; s += step) {
      if (best >= 0 && s > best + cell) break;
      const a = Math.floor((ox + dx * s) / cell), b = Math.floor((oy + dy * s) / cell), c = Math.floor((oz + dz * s) / cell);
      const key = (a + 512) * 1048576 + (b + 512) * 1024 + (c + 512);
      if (key === lastKey) continue;
      lastKey = key;
      const l = this.map.get(key);
      if (!l) continue;
      for (let m = 0; m < l.length; m++) {
        const i = l[m];
        if (this.stamp[i] === tick) continue;
        this.stamp[i] = tick;
        const k = i * 9;
        const e1x = t[k + 3] - t[k], e1y = t[k + 4] - t[k + 1], e1z = t[k + 5] - t[k + 2];
        const e2x = t[k + 6] - t[k], e2y = t[k + 7] - t[k + 1], e2z = t[k + 8] - t[k + 2];
        const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (det > -1e-14 && det < 1e-14) continue;
        const f = 1 / det;
        const sx = ox - t[k], sy = oy - t[k + 1], sz = oz - t[k + 2];
        const u = f * (sx * hx + sy * hy + sz * hz);
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = f * (dx * qx + dy * qy + dz * qz);
        if (v < 0 || u + v > 1) continue;
        const d = f * (e2x * qx + e2y * qy + e2z * qz);
        if (d > minT && d < maxT && (best < 0 || d < best)) best = d;
      }
    }
    return best;
  }
}

/** Flat triangle soup of a primitive (optionally only triangles `keep(a,b,c)` accepts). */
export function triSoup(prim, keep = null, out = []) {
  const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray();
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    if (keep && !keep(idx[t], idx[t + 1], idx[t + 2])) continue;
    P.getElement(idx[t], a); P.getElement(idx[t + 1], b); P.getElement(idx[t + 2], c);
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
  return out;
}

/** n cosine-weighted hemisphere directions (Hammersley), z = up. */
export function hemisphereSet(n) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let bits = i, rad = 0, f = 0.5;
    while (bits) { if (bits & 1) rad += f; bits >>= 1; f *= 0.5; }
    const u1 = (i + 0.5) / n, u2 = rad;
    const r = Math.sqrt(u1), ph = 2 * Math.PI * u2;
    out[i * 3] = r * Math.cos(ph); out[i * 3 + 1] = r * Math.sin(ph); out[i * 3 + 2] = Math.sqrt(Math.max(0, 1 - u1));
  }
  return out;
}

const hash2 = (x, y) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

function aoOne(grid, set, nRays, ox, oy, oz, nx, ny, nz, rot, maxD, lift) {
  // tangent frame of the normal, turned by `rot` about it
  let tx, ty, tz;
  if (Math.abs(nx) < 0.8) { tx = 0; ty = -nz; tz = ny; } else { tx = -nz; ty = 0; tz = nx; }
  const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const px = ox + nx * lift, py = oy + ny * lift, pz = oz + nz * lift;
  let occ = 0;
  for (let i = 0; i < nRays; i++) {
    const a = set[i * 3], b = set[i * 3 + 1], c = set[i * 3 + 2];
    const la = a * cr - b * sr, lb = a * sr + b * cr;
    const dx = tx * la + bx * lb + nx * c, dy = ty * la + by * lb + ny * c, dz = tz * la + bz * lb + nz * c;
    const hit = grid.cast(px, py, pz, dx, dy, dz, maxD);
    if (hit >= 0) { const k = 1 - hit / maxD; occ += k; }
  }
  return 1 - occ / nRays;
}

/**
 * Obscurance per texel of a position map, only where `want(i)` (texel index). Returns
 * Float32Array W*H (1 = open), NaN-free; untouched texels stay 1.
 */
export function bakeAOTexels(pm, grid, { rays = 24, maxD = 0.07, lift = 0.0012, want = null } = {}) {
  const { W, H, pos, nrm } = pm;
  const out = new Float32Array(W * H).fill(1);
  const set = hemisphereSet(rays);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 3;
    if (Number.isNaN(pos[o]) || (want && !want(i))) continue;
    const l = Math.hypot(nrm[o], nrm[o + 1], nrm[o + 2]) || 1;
    out[i] = aoOne(grid, set, rays, pos[o], pos[o + 1], pos[o + 2], nrm[o] / l, nrm[o + 1] / l, nrm[o + 2] / l, hash2(x, y) * 6.2832, maxD, lift);
  }
  return out;
}

/** Obscurance per point: pts/nrms flat xyz arrays. */
export function bakeAOPoints(pts, nrms, grid, { rays = 48, maxD = 0.05, lift = 0.0015 } = {}) {
  const n = pts.length / 3, out = new Float32Array(n);
  const set = hemisphereSet(rays);
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nrms[i * 3], nrms[i * 3 + 1], nrms[i * 3 + 2]) || 1;
    out[i] = aoOne(grid, set, rays, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], nrms[i * 3] / l, nrms[i * 3 + 1] / l, nrms[i * 3 + 2] / l, 1.1 * i, maxD, lift);
  }
  return out;
}

/** Separable blur of `src` (W*H) that only mixes texels `valid` accepts. */
export function blurMasked(src, W, H, valid, radius) {
  const kernel = [];
  for (let i = -radius; i <= radius; i++) kernel.push(Math.exp(-0.5 * (i * i) / (radius * radius * 0.25 + 1e-6)));
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y * W + x;
    if (!valid(c)) { tmp[c] = src[c]; continue; }
    let s = 0, w = 0;
    for (let k = -radius; k <= radius; k++) { const xx = x + k; if (xx < 0 || xx >= W) continue; const q = y * W + xx; if (!valid(q)) continue; s += src[q] * kernel[k + radius]; w += kernel[k + radius]; }
    tmp[c] = w ? s / w : src[c];
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y * W + x;
    if (!valid(c)) { out[c] = tmp[c]; continue; }
    let s = 0, w = 0;
    for (let k = -radius; k <= radius; k++) { const yy = y + k; if (yy < 0 || yy >= H) continue; const q = yy * W + x; if (!valid(q)) continue; s += tmp[q] * kernel[k + radius]; w += kernel[k + radius]; }
    out[c] = w ? s / w : tmp[c];
  }
  return out;
}

/**
 * A per-vertex convexity proxy over welded positions: the mean neighbour offset along
 * the normal, in metres (positive = a dent, negative = a ridge). The form-shading layer
 * reads it: dents darken, ridges lift, the way a painter marks planes.
 */
export function convexity(prim) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL');
  const idx = prim.getIndices().getArray(), n = P.getCount();
  const pos = P.getArray();
  const key = (i) => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
  const weld = new Map(), rep = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, i); rep[i] = weld.get(k); }
  const sum = new Float64Array(n * 3), cnt = new Int32Array(n);
  const link = (a, b) => { const r = rep[a], s = rep[b]; for (let k = 0; k < 3; k++) sum[r * 3 + k] += pos[s * 3 + k] - pos[r * 3 + k]; cnt[r]++; };
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; link(a, b); link(b, a); link(b, c); link(c, b); link(c, a); link(a, c); }
  const nrm = N.getArray(), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rep[i];
    if (!cnt[r]) continue;
    out[i] = (sum[r * 3] * nrm[i * 3] + sum[r * 3 + 1] * nrm[i * 3 + 1] + sum[r * 3 + 2] * nrm[i * 3 + 2]) / cnt[r];
  }
  return out;
}

/**
 * The stock skin's broad colour as a per-vertex field, welded by position across UV seams:
 * interpolated over the triangles it is continuous where two islands meet, so the source's
 * painted tone steps between islands (temple, wrist, jaw) disappear. Returns Float32Array
 * r, g, b at W*W. Sampled at the vertices' OLD uv = (new - offset) / scale.
 */
export function seamlessTone(prim, islands, islandOf, stock, W) {
  const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0');
  const n = P.getCount(), pos = P.getArray();
  const key = (i) => `${Math.round(pos[i * 3] * 2e4)},${Math.round(pos[i * 3 + 1] * 2e4)},${Math.round(pos[i * 3 + 2] * 2e4)}`;
  const groups = new Map();
  const c = new Float32Array(n * 3);
  const u = [0, 0], o = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    UV.getElement(i, u);
    const s = islands[islandOf[i]];
    sample(stock.blur, stock.W, stock.H, 3, (u[0] - s.ox) / s.s, (u[1] - s.oy) / s.s, o);
    c[i * 3] = o[0]; c[i * 3 + 1] = o[1]; c[i * 3 + 2] = o[2];
    const k = key(i);
    let g = groups.get(k); if (!g) { g = []; groups.set(k, g); }
    g.push(i);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    let r = 0, gr = 0, b = 0;
    for (const i of g) { r += c[i * 3]; gr += c[i * 3 + 1]; b += c[i * 3 + 2]; }
    r /= g.length; gr /= g.length; b /= g.length;
    for (const i of g) { c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b; }
  }
  const take = (k) => { const v = new Float32Array(n); for (let i = 0; i < n; i++) v[i] = c[i * 3 + k]; return scalarMap(prim, v, W, W, 0); };
  return [take(0), take(1), take(2)];
}

/** Rasterise a per-vertex scalar into the UV layout (barycentric). Unset texels stay `fill`. */
export function scalarMap(prim, values, W, H, fill = 0) {
  const UV = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices().getArray();
  const out = new Float32Array(W * H).fill(fill);
  const u = [[0, 0], [0, 0], [0, 0]];
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) UV.getElement(idx[t + k], u[k]);
    const ax = u[0][0] * W, ay = u[0][1] * H, bx = u[1][0] * W, by = u[1][1] * H, cx = u[2][0] * W, cy = u[2][1] * H;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
      let w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
      let w2 = 1 - w0 - w1;
      if (w0 < -0.08 || w1 < -0.08 || w2 < -0.08) continue;
      w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2);
      const s = w0 + w1 + w2;
      out[y * W + x] = (values[idx[t]] * w0 + values[idx[t + 1]] * w1 + values[idx[t + 2]] * w2) / s;
    }
  }
  return out;
}

/* =============================================================== noises */

/** Worley in the plane: F1, F2 and the winning cell's id hash, into `o` = [f1, f2, h]. */
export function worley2(x, y, o = [0, 0, 0]) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, h = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const rx = hash2(cx, cy), ry = hash2(cy * 31 + 7, cx * 17 + 3);
    const d = Math.hypot(cx + rx - x, cy + ry - y);
    if (d < f1) { f2 = f1; f1 = d; h = hash2(cx * 13 + 1, cy * 29 + 5); } else if (d < f2) f2 = d;
  }
  o[0] = f1; o[1] = f2; o[2] = h;
  return o;
}

/** Value noise periodic in x (period px) and y (period py), 0..1. */
export function pnoise2(x, y, px, py) {
  const fx = Math.floor(x), fy = Math.floor(y);
  const tx = x - fx, ty = y - fy;
  const h = (i, j) => hash2(((i % px) + px) % px, ((j % py) + py) % py);
  const s = (t) => t * t * (3 - 2 * t);
  const X = s(tx), Y = s(ty);
  return mix(mix(h(fx, fy), h(fx + 1, fy), X), mix(h(fx, fy + 1), h(fx + 1, fy + 1), X), Y);
}

/** Three octaves of noise3 scaled to `f` cycles per metre, 0..1. */
export const fbm3 = (x, y, z, f) => (noise3(x * f, y * f, z * f) * 0.57 + noise3(x * f * 2.03, y * f * 2.03, z * f * 2.03) * 0.29 + noise3(x * f * 4.1, y * f * 4.1, z * f * 4.1) * 0.14);

/* ================================================================ layers */

/** The one record every paint layer sees per texel (reused, never reallocated). */
class Texel { constructor() { this.br = 0; this.bg = 0; this.bb = 0; this.sr = 0; this.sg = 0; this.sb = 0; this.conv = 0; this.X = 0; this.Y = 0; this.Z = 0; this.nx = 0; this.ny = 0; this.nz = 0; this.r = 0; this.g = 0; this.b = 0; this.h = 0; this.rough = 0.6; this.ao = 1; this.island = -1; this.mPerPx = 0.001; this.x = 0; this.y = 0; this.lum = 0; } }

/**
 * Pores, fine creasing and pigment mottling, weighted by `zone(T)` (0..1). Skin is never
 * one colour: a slow red/yellow drift and a finer melanin mottle; pits dark and matte.
 */
export function pores({ strength = 1, zone = () => 1, poreFreq = 700, depth = 0.000085 } = {}) {
  return (T) => {
    const z = zone(T);
    if (z <= 0) return;
    const { X, Y, Z } = T;
    const n1 = noise3(X * poreFreq, Y * poreFreq, Z * poreFreq), n2 = noise3(X * poreFreq * 2.1 + 7, Y * poreFreq * 2.1, Z * poreFreq * 2.1);
    const pit = smooth(0.6, 0.86, n1) * 0.75 + smooth(0.66, 0.9, n2) * 0.5;
    const mott = noise3(X * 120, Y * 120, Z * 120) - 0.5, mott2 = noise3(X * 340 + 3, Y * 340, Z * 340) - 0.5, drift = noise3(X * 38, Y * 38 + 9, Z * 38) - 0.5;
    const k = 1 + (mott * 0.09 + mott2 * 0.075 - pit * 0.09) * z * strength;
    T.r *= k * (1 + drift * 0.05 * z); T.g *= k; T.b *= k * (1 - drift * 0.06 * z);
    T.h -= pit * depth * z * strength;
    T.h += (noise3(X * 2400, Y * 2400, Z * 2400) - 0.5) * 0.00003 * z;
    T.rough += pit * 0.08 * z;
  };
}

/**
 * The face's colour map (the painter's three zones): warm yellow forehead, red through
 * cheeks, nose and ears, a cooler, greyer muzzle. `zones` = [{ at, s:[sx,sy,sz], gain:[r,g,b] }].
 */
export function colourZones(zones) {
  return (T) => {
    for (const z of zones) {
      const dx = (T.X - z.at[0]) / z.s[0], dy = (T.Y - z.at[1]) / z.s[1], dz = (T.Z - z.at[2]) / z.s[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 9) continue;
      const k = Math.exp(-0.5 * d2);
      T.r *= 1 + (z.gain[0] - 1) * k; T.g *= 1 + (z.gain[1] - 1) * k; T.b *= 1 + (z.gain[2] - 1) * k;
      if (z.rough !== undefined) T.rough += z.rough * k;
    }
  };
}

/** Thin, dark crease lines between 3-D poly-points: [{ pts: [[x,y,z],..], w, depth, dark }]. */
export function creases(list) {
  const segs = [];
  for (const c of list) for (let i = 0; i + 1 < c.pts.length; i++) segs.push({ a: c.pts[i], b: c.pts[i + 1], w: c.w, depth: c.depth, dark: c.dark, fade: c.fade ?? 1 });
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (const s of segs) for (const p of [s.a, s.b]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const m = 0.006;
  return (T) => {
    if (T.X < x0 - m || T.X > x1 + m || T.Y < y0 - m || T.Y > y1 + m) return;
    let best = 0, dk = 0, dp = 0;
    for (const s of segs) {
      const ax = s.b[0] - s.a[0], ay = s.b[1] - s.a[1], az = s.b[2] - s.a[2];
      const px = T.X - s.a[0], py = T.Y - s.a[1], pz = T.Z - s.a[2];
      const t = clamp01((px * ax + py * ay + pz * az) / (ax * ax + ay * ay + az * az));
      const d = Math.hypot(px - ax * t, py - ay * t, pz - az * t);
      const k = (1 - smooth(s.w * 0.3, s.w, d));
      if (k > best) { best = k; dk = s.dark; dp = s.depth; }
    }
    if (best <= 0) return;
    const f = 1 - best * dk;
    T.r *= f; T.g *= f; T.b *= f;
    T.h -= best * dp;
    T.ao *= 1 - best * dk * 0.5;
  };
}

/**
 * The salt-line: paste with real thickness. The band is a cheek-to-cheek ribbon
 * (`y(X)` centre, `half(X)` half-height); the paste dried in plates split by a crack
 * network (Worley cell borders, wider where it dried thin), lifts at the plate edges,
 * flakes off along its border, and drags thin in the direction it was wiped. It only
 * writes `albedo` where the paste is, and bakes its plate relief into `h`.
 */
export function saltPaste({ y, half, xMax, salt = '#EDEAE2', thick = 0.00052, cell = 280, front = (T) => T.nz > 0.0 && T.Z > 0.015 } = {}) {
  const S = hex(salt);
  const w = [0, 0, 0];
  return (T) => {
    if (Math.abs(T.X) > xMax + 0.008 || !front(T)) return;
    const cy = y(T.X);
    const hh = half(T.X);
    const dy = T.Y - cy;
    if (Math.abs(dy) > hh * 1.7) return;
    // the wipe: streaks along the band, irregular top and bottom edge
    const streak = noise3(T.X * 42, T.Y * 1150, 1.7) - 0.5;
    const edge = noise3(T.X * 240, T.Y * 240, 4.1) - 0.5;
    const e2 = noise3(T.X * 900, T.Y * 900, 9.3) - 0.5;
    const body = 1 - smooth(hh * (0.62 + edge * 0.5 + streak * 0.35), hh * (0.98 + edge * 0.55 + e2 * 0.22), Math.abs(dy));
    const end = 1 - smooth(xMax * (0.84 + 0.12 * (noise3(T.Y * 300, 2, 3) - 0.5)), xMax * (1.0 + 0.1 * edge), Math.abs(T.X));
    let cov = body * end;
    if (cov <= 0.002) return;
    // dried plates
    worley2(T.X * cell + noise3(T.X * 500, T.Y * 500, 0.3) * 0.28, T.Y * cell * 1.15 + noise3(T.X * 500, T.Y * 500, 7.7) * 0.28, w);
    const border = w[1] - w[0];
    const crackW = mix(0.085, 0.2, clamp01(1 - cov * 1.35)) + 0.035 * e2;
    const crack = 1 - smooth(crackW * 0.55, crackW, border);
    const fine = 1 - smooth(0.02, 0.07, Math.abs(noise3(T.X * 1500, T.Y * 1500, 2.2) - 0.5));
    // whole plates flake off near the border of the band
    const flake = w[2] > mix(0.45, 1.05, smooth(0.25, 0.75, cov)) ? 1 : 0;
    const plate = (1 - flake) * cov;
    const a = clamp01(plate * smooth(0.04, 0.3, cov) * 1.25) * (1 - crack * 0.82);
    if (a <= 0.002 && !crack) return;
    // tone: white paste, greyed in hollows and browned where thin
    const tone = 0.74 + 0.2 * (noise3(T.X * 660, T.Y * 660, 5.5)) + 0.07 * w[2] - fine * 0.08 + 0.05 * (rimT(border) - 0.5);
    const warm = mix(0.965, 1, cov);
    const ar = S[0] * tone, ag = S[1] * tone * warm, ab = S[2] * tone * warm * warm;
    T.r = mix(T.r, ar, a); T.g = mix(T.g, ag, a); T.b = mix(T.b, ab, a);
    // the crack shows the skin, darkened
    if (crack > 0 && plate > 0.05) { const k = 1 - crack * 0.42 * clamp01(plate * 2); T.r *= k; T.g *= k; T.b *= k; }
    // relief: plate thickness, each plate a little tilted and lifted at its rim
    const lift = (0.75 + 0.5 * w[2]) * thick;
    const rim = smooth(0.0, 0.28, border);
    T.h += a * lift * rim + a * (noise3(T.X * 1300, T.Y * 1300, 8.8) - 0.5) * thick * 0.5 - fine * a * thick * 0.25;
    T.rough = mix(T.rough, 0.97, a);
    T.ao *= 1 - crack * 0.4 * clamp01(plate * 2);
  };
}

/**
 * Smooth the source skin wherever `zone(T)` (0..1) wants it: replaces the painted strokes and
 * freckles with the source's soft zones (the pore layer then puts real grain back).
 */
export function smoothSkin({ zone = () => 1 } = {}) {
  return (T) => {
    const k = zone(T);
    if (k <= 0) return;
    T.r = mix(T.r, T.br, k); T.g = mix(T.g, T.bg, k); T.b = mix(T.b, T.bb, k);
  };
}

/**
 * Take the source's superhero make-up off an eye: the grey-blue lid and under-eye halo go
 * to a warm brown of the skin's own hue, the winged liner is cut back, and only a thin dark
 * line stays on the lid margin. `eyes` = eye centres.
 */
export function eyeSocketClean({ eyes, rx = 0.0285, ry = 0.0175, lid = [0.94, 0.84, 0.8] } = {}) {
  return (T) => {
    if (T.nz < 0.05) return;
    for (const e of eyes) {
      const dx = (T.X - e[0]) / rx, dy = (T.Y - e[1]) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1.7) continue;
      const k = 1 - smooth(0.55, 1.45, d2);
      // keep the source's luminance only where it is the true dark lash margin
      const lum = (T.sr + T.sg + T.sb) / 3, soft = (T.br + T.bg + T.bb) / 3 || 1;
      const skinL = (T.br / (T.br + T.bg + T.bb + 1e-3));
      void skinL; void soft;
      const lidK = smooth(0.18, 0.9, 1 - d2);
      const lashEdge = 1 - smooth(70, 112, lum);
      // the clean skin colour under it: the blurred source pulled warm, then a lid shade
      const r = T.br, g = T.bg, b = T.bb;
      const shade = mix(1, lid[0], lidK), sg = mix(1, lid[1], lidK), sb = mix(1, lid[2], lidK);
      const cr = r * shade, cg = g * sg, cb = b * sb;
      T.r = mix(T.r, cr, k * (1 - lashEdge * 0.88));
      T.g = mix(T.g, cg, k * (1 - lashEdge * 0.88));
      T.b = mix(T.b, cb, k * (1 - lashEdge * 0.88));
    }
  };
}

/**
 * The opening of an eye as seen from the front, read off the meshes: for each x across the
 * eye, the upper and lower lid heights where the eyeball stops being the first thing a +Z
 * ray from the front meets. Returns { x0, x1, upper(x), lower(x), zAt(x, y) }.
 */
export function eyeOpening(faceGrid, eyeCentre, { rx = 0.024, ry = 0.016, step = 0.00035, zFront = 0.2, eyeR = 0.0172 } = {}) {
  const cx = eyeCentre[0], cy = eyeCentre[1];
  const zc = eyeCentre[2];
  const cols = [];
  for (let x = cx - rx; x <= cx + rx; x += step) {
    let up = null, lo = null;
    for (let y = cy - ry; y <= cy + ry; y += step) {
      const t = faceGrid.cast(x, y, zFront, 0, 0, -1, zFront - zc + 0.02, 0.0001);
      if (t < 0) continue;
      const zHit = zFront - t;
      // the first thing met is the eyeball when that hit lies on the eye sphere
      const dz = Math.hypot(x - cx, y - cy);
      const onBall = dz < eyeR && zHit < zc + Math.sqrt(Math.max(0, eyeR * eyeR - dz * dz)) + 0.0009;
      if (onBall) { if (lo === null) lo = y; up = y; }
    }
    if (up !== null && up - lo > 0.0006) cols.push({ x, up, lo });
  }
  const at = (x, key) => {
    if (!cols.length) return 0;
    const f = Math.max(0, Math.min(cols.length - 1.0001, (x - cols[0].x) / step));
    const i = Math.floor(f), t = f - i;
    return cols[i][key] + (cols[i + 1][key] - cols[i][key]) * t;
  };
  return { x0: cols[0].x, x1: cols[cols.length - 1].x, upper: (x) => at(x, 'up'), lower: (x) => at(x, 'lo'), centre: eyeCentre };
}

/**
 * The lid margin: a tapered dark line along the top of the opening (thickest at the outer
 * third, a short flick past the outer corner), a thinner one at the outer half of the
 * bottom, a warm crease above the lid, and the pink of the inner corner.
 */
export function lidLines({ open, side, ink = '#120C0A', w = 0.0011, crease = 0.0052 } = {}) {
  const C = hex(ink);
  const inner = side > 0 ? open.x0 : open.x1, outer = side > 0 ? open.x1 : open.x0;
  const len = Math.abs(outer - inner);
  return (T) => {
    if (T.nz < 0.0) return;
    const f = (T.X - inner) / (outer - inner);        // 0 inner corner, 1 outer corner
    if (f < -0.12 || f > 1.22) return;
    const cl = Math.max(0, Math.min(1, f));
    const xx = inner + (outer - inner) * cl;
    const up = open.upper(xx), lo = open.lower(xx);
    const past = (f - 1) * len;                        // metres past the outer corner
    const yUp = up + 0.00012 + (f > 1 ? past * 0.32 : 0);
    const dy = T.Y - yUp;
    // upper line
    const thick = w * mix(0.35, 1.2, smooth(0.05, 0.72, cl)) * (f > 1 ? 1 - smooth(0, 0.0055, past) : 1);
    if (dy > -0.0006 && dy < thick * 1.5 && f < 1.2) {
      const k = (1 - smooth(thick * 0.55, thick * 1.35, dy)) * smooth(-0.0006, -0.0002, dy);
      T.r = mix(T.r, C[0], k); T.g = mix(T.g, C[1], k); T.b = mix(T.b, C[2], k); T.rough = mix(T.rough, 0.45, k);
    }
    // the crease above the lid
    const yCr = up + crease * mix(0.75, 1.05, Math.sin(Math.PI * cl));
    const dc = Math.abs(T.Y - yCr);
    if (dc < 0.0016 && f > 0.02 && f < 1.06) {
      const k = (1 - smooth(0.0003, 0.0015, dc)) * 0.36;
      T.r *= 1 - k * 0.8; T.g *= 1 - k; T.b *= 1 - k; T.h -= k * 0.00028;
    }
    // the lower line, outer half
    if (f > 0.25 && f < 1.02) {
      const dl = lo - 0.0002 - T.Y;
      if (dl > -0.0004 && dl < 0.0009) {
        const k = (1 - smooth(0.0001, 0.0009, Math.abs(dl))) * smooth(0.25, 0.75, f) * 0.5;
        T.r = mix(T.r, C[0] * 1.6, k); T.g = mix(T.g, C[1] * 1.6, k); T.b = mix(T.b, C[2] * 1.6, k);
      }
    }
  };
}

/** Lips from the source's lipstick to a natural deep rose: `center`, `r` the ellipsoid; `gain` and a matte `rough`. */
export function lipTone({ center, r, gain = [0.94, 0.74, 0.74], rough = 0.44, sat = 0.72 } = {}) {
  return (T) => {
    const dx = (T.X - center[0]) / r[0], dy = (T.Y - center[1]) / r[1], dz = (T.Z - center[2]) / r[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 1.4) return;
    const red = T.sr ? (T.sr - T.sg) / T.sr : 0;
    const m = (1 - smooth(0.7, 1.35, d2)) * smooth(0.24, 0.36, red);
    if (m <= 0) return;
    const l = (T.r + T.g + T.b) / 3;
    T.r = mix(T.r, mix(l, T.r, sat) * gain[0], m); T.g = mix(T.g, mix(l, T.g, sat) * gain[1], m); T.b = mix(T.b, mix(l, T.b, sat) * gain[2], m);
    T.rough = mix(T.rough, rough, m);
  };
}

/** A healed seam: pale, slightly sunk, between two x/y points on the front of the face. */
export function scarSeam({ a, b, color = [164, 122, 100], w = 0.00105 } = {}) {
  return (T) => {
    if (T.nz < 0.1 || T.Y < Math.min(a[1], b[1]) - 0.006 || T.Y > Math.max(a[1], b[1]) + 0.006 || Math.abs(T.X - (a[0] + b[0]) / 2) > Math.abs(a[0] - b[0]) / 2 + 0.008) return;
    const ax = b[0] - a[0], ay = b[1] - a[1];
    const t = clamp01(((T.X - a[0]) * ax + (T.Y - a[1]) * ay) / (ax * ax + ay * ay));
    const wob = (noise3(T.Y * 180, 2.2, 1.1) - 0.5) * 0.0011;
    const d = Math.hypot(T.X - (a[0] + ax * t) + wob, T.Y - (a[1] + ay * t));
    const taper = smooth(0, 0.16, t) * smooth(0, 0.16, 1 - t);
    const k = (1 - smooth(w * 0.45, w * (0.7 + taper * 0.6), d)) * (0.45 + 0.55 * taper);
    if (k <= 0.004) return;
    T.r = mix(T.r, color[0], k * 0.72); T.g = mix(T.g, color[1], k * 0.72); T.b = mix(T.b, color[2], k * 0.72);
    T.h -= k * 0.00022;
    T.rough = mix(T.rough, 0.42, k * 0.8);
  };
}

/** A small fine tattoo: dark dots in the skin, the ink a little blurred (old ink), on the normal side `side`. */
export function inkDots({ dots, r = 0.0026, ink = '#191B26', where = () => true, axis = ['X', 'Z'] } = {}) {
  const c = hex(ink);
  const [A, B] = axis;
  return (T) => {
    if (!where(T)) return;
    for (const [dx, dz] of dots) {
      const d = Math.hypot(T[A] - dx, T[B] - dz);
      if (d > r * 1.8) continue;
      const wob = (noise3(T.X * 1500, T.Y * 1500, T.Z * 1500) - 0.5) * r * 0.22;
      const k = (1 - smooth(r * 0.78, r * 1.14, d + wob)) * 0.93;
      T.r = mix(T.r, c[0], k); T.g = mix(T.g, c[1], k); T.b = mix(T.b, c[2], k);
      T.rough = mix(T.rough, 0.5, k * 0.5);
    }
  };
}

/* ========================================================= the compositor */

/** Bilinear sample from an interleaved byte image (channels c) at u,v in [0,1]. */
function sample(img, W, H, c, u, v, o) {
  const x = u * W - 0.5, y = v * H - 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  x0 = x0 < 0 ? 0 : x0 >= W ? W - 1 : x0; y0 = y0 < 0 ? 0 : y0 >= H ? H - 1 : y0;
  const x1 = x0 + 1 >= W ? W - 1 : x0 + 1, y1 = y0 + 1 >= H ? H - 1 : y0 + 1;
  for (let k = 0; k < c; k++) {
    o[k] = (img[(y0 * W + x0) * c + k] * (1 - fx) + img[(y0 * W + x1) * c + k] * fx) * (1 - fy)
      + (img[(y1 * W + x0) * c + k] * (1 - fx) + img[(y1 * W + x1) * c + k] * fx) * fy;
  }
  return o;
}

/** Fill every empty texel from its nearest painted neighbour (iterative), so mips and bilinear never bleed. */
function dilate(buf, W, H, c, filled, passes = 12) {
  let cur = filled.slice();
  for (let p = 0; p < passes; p++) {
    const next = cur.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cur[i]) continue;
      let s = [0, 0, 0, 0], n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (!cur[q]) continue;
        for (let k = 0; k < c; k++) s[k] += buf[q * c + k];
        n++;
      }
      if (n) { for (let k = 0; k < c; k++) buf[i * c + k] = s[k] / n; next[i] = 1; }
    }
    cur = next;
  }
}

/**
 * The skin atlas.
 *   prim       the body primitive with its FINAL bind positions and RELAID UVs
 *   islands, islandOf   from relayoutSkinUV
 *   stock      { base, normal, rough } decoded raw images + sizes (source layout)
 *   W          base size (1024); normal/ORM are written at NW (512)
 *   tone       '#rrggbb' target at `toneAt` (bible: #8A5A3C mid-cheek)
 *   ao         Float32Array at aoW*aoW (1 = open), or null
 *   conv       Float32Array at W*W (scalarMap of convexity), or null
 *   layers     functions (T) => void, in order
 *   patches    [{ x, y, w, h, base(RGB bytes), normal(RGB bytes), orm(RGB bytes) }] in atlas px of NW / W scales (the eye)
 * Returns { base, normal, orm } raw RGB buffers + stats.
 */
export async function paintSkinAtlas({ prim, islands, stock, W = 1024, tone = '#8A5A3C', toneAt, toneR = 0.014, ao = null, aoW = 512, conv = null, layers = [], formK = 1, baseRough = 0.62, pm: pmIn = null, toneMaps = null, toneK = [1, 1, 1] } = {}) {
  const pm = pmIn || positionMap(prim, W, W);
  // which island each texel belongs to: rasterise the island id
  const islandTex = new Int16Array(W * W).fill(-1);
  {
    const UV = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices().getArray();
    const { islandOf } = uvIslandsFor(prim);
    const u = [[0, 0], [0, 0], [0, 0]];
    for (let t = 0; t < idx.length; t += 3) {
      for (let k = 0; k < 3; k++) UV.getElement(idx[t + k], u[k]);
      const ax = u[0][0] * W, ay = u[0][1] * W, bx = u[1][0] * W, by = u[1][1] * W, cx = u[2][0] * W, cy = u[2][1] * W;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(W - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
      const id = islandOf[idx[t]];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        const w2 = 1 - w0 - w1;
        // strict coverage: the rim is dilated from painted texels, never painted from a clamped position
        const eps = -0.012 * Math.max(1, 40 / Math.sqrt(Math.abs(area)));
        if (w0 < eps || w1 < eps || w2 < eps) continue;
        islandTex[y * W + x] = id;
      }
    }
  }
  const out = new Float32Array(W * W * 3);
  const rough = new Float32Array(W * W).fill(baseRough);
  const aoOut = new Float32Array(W * W).fill(1);
  const height = new Float32Array(W * W);
  const nrm = new Float32Array(W * W * 2);
  const filled = new Uint8Array(W * W);
  const s0 = [0, 0, 0], s1 = [0, 0, 0], s2 = [0, 0, 0], s3 = [0, 0, 0];
  // the retone: gain from the stock mid-cheek to the tone target
  const target = hex(tone);
  let acc = [0, 0, 0], n = 0;
  for (let i = 0; i < W * W; i++) {
    const o = i * 3;
    if (Number.isNaN(pm.pos[o]) || islandTex[i] < 0) continue;
    if (Math.hypot(pm.pos[o] - toneAt[0], pm.pos[o + 1] - toneAt[1], pm.pos[o + 2] - toneAt[2]) >= toneR) continue;
    const s = islands[islandTex[i]];
    const x = i % W, y = (i - x) / W;
    const u = ((x + 0.5) / W - s.ox) / s.s, v = ((y + 0.5) / W - s.oy) / s.s;
    sample(stock.base, stock.W, stock.H, 3, u, v, s0);
    acc[0] += s0[0]; acc[1] += s0[1]; acc[2] += s0[2]; n++;
  }
  const gain = n ? target.map((t, k) => toneK[k] * t / Math.max(1, acc[k] / n)) : [1, 1, 1];
  const T = new Texel();
  const stats = { gain: gain.map((g) => +g.toFixed(4)), texels: 0 };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 3;
    const id = islandTex[i];
    if (id < 0 || Number.isNaN(pm.pos[o])) continue;
    const s = islands[id];
    const u = ((x + 0.5) / W - s.ox) / s.s, v = ((y + 0.5) / W - s.oy) / s.s;
    sample(stock.base, stock.W, stock.H, 3, u, v, s0);
    sample(stock.normal, stock.NW, stock.NH, 3, u, v, s1);
    sample(stock.rough, stock.RW, stock.RH, 1, u, v, s2);
    T.X = pm.pos[o]; T.Y = pm.pos[o + 1]; T.Z = pm.pos[o + 2];
    const nl = Math.hypot(pm.nrm[o], pm.nrm[o + 1], pm.nrm[o + 2]) || 1;
    T.nx = pm.nrm[o] / nl; T.ny = pm.nrm[o + 1] / nl; T.nz = pm.nrm[o + 2] / nl;
    T.island = id; T.x = x; T.y = y;
    T.lum = (s0[0] + s0[1] + s0[2]) / 3;
    T.sr = s0[0]; T.sg = s0[1]; T.sb = s0[2];
    if (stock.blur) sample(stock.blur, stock.W, stock.H, 3, u, v, s3);
    if (toneMaps) {
      // the source's detail over a seamless tone: stock / blur keeps the painted forms, the tone field the colour
      T.br = toneMaps[0][i] * gain[0]; T.bg = toneMaps[1][i] * gain[1]; T.bb = toneMaps[2][i] * gain[2];
      T.r = T.br * Math.max(0.55, s0[0] / Math.max(1, s3[0])); T.g = T.bg * Math.max(0.5, s0[1] / Math.max(1, s3[1])); T.b = T.bb * Math.max(0.5, s0[2] / Math.max(1, s3[2]));
    } else {
      T.r = s0[0] * gain[0]; T.g = s0[1] * gain[1]; T.b = s0[2] * gain[2];
      T.br = s3[0] * gain[0]; T.bg = s3[1] * gain[1]; T.bb = s3[2] * gain[2];
    }
    T.h = 0;
    T.rough = baseRough * (0.55 + 0.45 * (s2[0] / 255) / 0.72);
    // the baked form: AO (a reddened multiply, light through skin is warm) + convexity
    let a = 1;
    if (ao) {
      const ax = Math.min(aoW - 1, Math.floor((x + 0.5) * aoW / W)), ay = Math.min(aoW - 1, Math.floor((y + 0.5) * aoW / W));
      // bilinear on the AO texels
      const fx = (x + 0.5) * aoW / W - 0.5 - ax, fy = (y + 0.5) * aoW / W - 0.5 - ay;
      const bx = fx < 0 ? Math.max(0, ax - 1) : Math.min(aoW - 1, ax + 1), by = fy < 0 ? Math.max(0, ay - 1) : Math.min(aoW - 1, ay + 1);
      const wx = Math.abs(fx), wy = Math.abs(fy);
      a = (ao[ay * aoW + ax] * (1 - wx) + ao[ay * aoW + bx] * wx) * (1 - wy) + (ao[by * aoW + ax] * (1 - wx) + ao[by * aoW + bx] * wx) * wy;
    }
    T.ao = a;
    const c = conv ? conv[i] : 0;
    T.conv = c;
    for (let l = 0; l < layers.length; l++) layers[l](T);
    // form shading: painted from the AO and the convexity (after the layers, so paste and ink shade too)
    if (formK > 0) {
      const ak = Math.pow(clamp01(T.ao), 1.15);
      const dent = clamp01(c / 0.0016) * 0.22 * formK, ridge = clamp01(-c / 0.0016) * 0.11 * formK;
      T.r *= mix(0.70, 1, ak) * (1 - dent * 0.8) * (1 + ridge);
      T.g *= mix(0.58, 1, ak) * (1 - dent) * (1 + ridge * 0.9);
      T.b *= mix(0.54, 1, ak) * (1 - dent * 1.02) * (1 + ridge * 0.8);
    }
    out[o] = T.r; out[o + 1] = T.g; out[o + 2] = T.b;
    rough[i] = T.rough; aoOut[i] = T.ao; height[i] = T.h;
    nrm[i * 2] = s1[0] / 127.5 - 1; nrm[i * 2 + 1] = s1[1] / 127.5 - 1;
    filled[i] = 1;
    stats.texels++;
  }
  // bake the height into the normal: atlas-space central differences in metres
  const nOut = new Float32Array(W * W * 3);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 3;
    if (!filled[i]) continue;
    const xl = x > 0 && filled[i - 1] ? i - 1 : i, xr = x < W - 1 && filled[i + 1] ? i + 1 : i;
    const yu = y > 0 && filled[i - W] ? i - W : i, yd = y < W - 1 && filled[i + W] ? i + W : i;
    const dX = Math.hypot(pm.pos[xr * 3] - pm.pos[xl * 3], pm.pos[xr * 3 + 1] - pm.pos[xl * 3 + 1], pm.pos[xr * 3 + 2] - pm.pos[xl * 3 + 2]) || 1e-3;
    const dY = Math.hypot(pm.pos[yd * 3] - pm.pos[yu * 3], pm.pos[yd * 3 + 1] - pm.pos[yu * 3 + 1], pm.pos[yd * 3 + 2] - pm.pos[yu * 3 + 2]) || 1e-3;
    const hx = (height[xr] - height[xl]) / dX, hy = (height[yd] - height[yu]) / dY;
    // stock tangent normal + the height's slope (glTF +Y is up the texture, i.e. -v)
    const ax = nrm[i * 2] - hx, ay = nrm[i * 2 + 1] + hy;
    const az = Math.sqrt(Math.max(0.04, 1 - Math.min(0.96, nrm[i * 2] * nrm[i * 2] + nrm[i * 2 + 1] * nrm[i * 2 + 1])));
    const l = Math.hypot(ax, ay, az) || 1;
    nOut[o] = ax / l; nOut[o + 1] = ay / l; nOut[o + 2] = az / l;
  }
  // bytes + dilation
  const base = Buffer.alloc(W * W * 3), normal = Buffer.alloc(W * W * 3), orm = Buffer.alloc(W * W * 3);
  for (let i = 0; i < W * W; i++) {
    const o = i * 3;
    for (let k = 0; k < 3; k++) base[o + k] = Math.max(0, Math.min(255, Math.round(out[o + k])));
    if (filled[i]) {
      normal[o] = Math.round((nOut[o] * 0.5 + 0.5) * 255); normal[o + 1] = Math.round((nOut[o + 1] * 0.5 + 0.5) * 255); normal[o + 2] = Math.round((nOut[o + 2] * 0.5 + 0.5) * 255);
      orm[o] = Math.round(clamp01(aoOut[i]) * 255); orm[o + 1] = Math.round(clamp01(rough[i]) * 255); orm[o + 2] = 0;
    } else { normal[o] = 128; normal[o + 1] = 128; normal[o + 2] = 255; orm[o] = 255; orm[o + 1] = 160; orm[o + 2] = 0; }
  }
  dilate(base, W, W, 3, filled);
  dilate(normal, W, W, 3, filled);
  dilate(orm, W, W, 3, filled);
  return { base, normal, orm, filled, stats, pm, islandTex };
}

/** islandOf for a primitive whose indices did not change since relayout (a re-walk; cheap). */
function uvIslandsFor(prim) { return uvIslands(prim); }

/** Blit an RGB patch into a W-square RGB buffer at (x, y). */
export function blit(dst, W, patch, pw, ph, x, y) {
  for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
    const s = (j * pw + i) * 3, o = ((y + j) * W + x + i) * 3;
    if (o < 0 || o + 2 >= dst.length) continue;
    dst[o] = patch[s]; dst[o + 1] = patch[s + 1]; dst[o + 2] = patch[s + 2];
  }
}

/* ================================================================== eyes */

/**
 * A procedural eye patch, N square. The eyeball is planar-projected along +Z, the patch
 * spanning `span` metres (the iris centre at the patch centre). Returns RGB bytes for
 * base, normal, ORM. Dark iris with fibres and a brighter lower crescent (the cornea
 * focuses light on the side opposite the source), a limbal ring, a warm sclera with lid
 * shadow painted from above, and a small window catch-light; the cornea's bulge goes in
 * the normal and its wetness in the roughness.
 */
export function paintEye(N, { span, iris = '#3B2A20', amber = '#5E3A20', rIris = 0.0064, rPupil = 0.0024, lidY = 0.0048, sclera = [214, 203, 188] } = {}) {
  const base = Buffer.alloc(N * N * 3), normal = Buffer.alloc(N * N * 3), orm = Buffer.alloc(N * N * 3);
  const Ic = hex(iris), Am = hex(amber);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const mx = ((x + 0.5) / N - 0.5) * span, my = (0.5 - (y + 0.5) / N) * span;     // metres, +y up
    const r = Math.hypot(mx, my), ang = Math.atan2(my, mx);
    let R, G, B;
    // sclera
    const dimEdge = 1 - 0.34 * smooth(0.0072, 0.0165, Math.abs(mx)) - 0.2 * smooth(0.006, 0.013, Math.abs(my));
    const vein = smooth(0.62, 0.9, noise3(ang * 7, r * 300, 1.5)) * smooth(0.0075, 0.0145, r) * 0.1;
    const pink = smooth(0.0085, 0.0155, Math.abs(mx)) * 0.16;
    R = sclera[0] * dimEdge * (1 + pink * 0.1); G = sclera[1] * dimEdge * (1 - pink * 0.55 - vein * 0.9); B = sclera[2] * dimEdge * (1 - pink * 0.6 - vein);
    // iris
    if (r < rIris * 1.14) {
      const t = r / rIris;
      const fib = noise3(Math.cos(ang) * 14 + 3, Math.sin(ang) * 14 + 3, t * 3.2) * 0.62 + noise3(Math.cos(ang) * 42, Math.sin(ang) * 42, t * 1.4) * 0.38;
      const crest = smooth(0.46, 0.56, t) * (1 - smooth(0.58, 0.74, t));      // the collarette
      const lower = smooth(-0.1, 0.9, -my / rIris) * smooth(0.28, 0.6, t) * (1 - smooth(0.8, 0.98, t));
      const lit = 0.62 + fib * 0.62 + crest * 0.3;
      const k = clamp01(lower * 0.75 + crest * 0.15);
      let ir = mix(Ic[0], Am[0], k) * lit, ig = mix(Ic[1], Am[1], k) * lit, ib = mix(Ic[2], Am[2], k) * lit;
      const limb = smooth(0.74, 1.02, t);                                     // the dark limbal ring
      ir = mix(ir, 14, limb); ig = mix(ig, 10, limb); ib = mix(ib, 9, limb);
      const blend = 1 - smooth(1.0, 1.14, t);
      R = mix(R, ir, blend); G = mix(G, ig, blend); B = mix(B, ib, blend);
    }
    // pupil
    const pk = 1 - smooth(rPupil * 0.88, rPupil * 1.12, r);
    R = mix(R, 5, pk); G = mix(G, 4, pk); B = mix(B, 4, pk);
    // the upper lid's shadow on the ball, then a soft under-lid
    const lidS = smooth(lidY - 0.0058, lidY + 0.0005, my);
    const shade = 1 - lidS * 0.74 - 0.14 * smooth(0.0035, 0.0075, -my);
    R *= shade; G *= shade * 0.985; B *= shade * 0.975;
    // catch-lights: a tight sun glint and a soft sky window, up and to one side
    const gl = Math.hypot(mx + 0.00205, my - 0.00205);
    const glint = 1 - smooth(0.00042, 0.00072, gl);
    const wnd = (1 - smooth(0.0012, 0.0024, Math.hypot(mx + 0.0014, (my - 0.0021) * 1.4))) * 0.11;
    const low = (1 - smooth(0.0003, 0.0011, Math.hypot(mx - 0.0022, my + 0.0029))) * 0.2;
    R = mix(R, 255, Math.min(1, glint * 0.92 + wnd + low)); G = mix(G, 252, Math.min(1, glint * 0.92 + wnd + low)); B = mix(B, 244, Math.min(1, glint * 0.92 + wnd + low));
    const o = (y * N + x) * 3;
    base[o] = clampB(R); base[o + 1] = clampB(G); base[o + 2] = clampB(B);
    // the cornea: a tighter dome over the iris, seated at the limbus
    const rC = 0.0075;
    let sx = 0, sy = 0;
    if (r > 1e-6) {
      const k = r < rC ? (r / rC) * 0.42 * (1 - 0.35 * r / rC) : 0.42 * 0.65 * (1 - smooth(rC, rC * 1.3, r));
      sx = (mx / r) * k; sy = (my / r) * k;
    }
    const nl = Math.hypot(sx, sy, 1);
    normal[o] = Math.round((sx / nl * 0.5 + 0.5) * 255); normal[o + 1] = Math.round((sy / nl * 0.5 + 0.5) * 255); normal[o + 2] = Math.round((1 / nl * 0.5 + 0.5) * 255);
    orm[o] = Math.round((1 - lidS * 0.8) * 255);
    orm[o + 1] = Math.round((r < rC ? 0.07 : 0.16) * 255);
    orm[o + 2] = 0;
  }
  return { base, normal, orm };
}
const clampB = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/* ========================================================== encode + I/O */

/** Decode the stock skin images once (RGB + a greyscale roughness), at full source size. */
export async function decodeStockSkin(baseImg, normalImg, roughImg) {
  const b = await sharp(Buffer.from(baseImg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = await sharp(Buffer.from(normalImg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = await sharp(Buffer.from(roughImg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  // a soft copy of the base: the skin's broad zones without the painted freckles and strokes
  const blurred = await sharp(b.data, { raw: { width: b.info.width, height: b.info.height, channels: 3 } }).blur(5).raw().toBuffer();
  return { base: b.data, blur: blurred, W: b.info.width, H: b.info.height, normal: n.data, NW: n.info.width, NH: n.info.height, rough: r.data, RW: r.info.width, RH: r.info.height };
}

/** RGB bytes -> WebP at an optional smaller size (`to`). */
export async function webp(buf, W, { to = null, quality = 86, kernel = 'lanczos3', channels = 3, alphaQuality = 90, effort = 5 } = {}) {
  let s = sharp(buf, { raw: { width: W, height: W, channels } });
  if (to && to !== W) s = s.resize(to, to, { kernel });
  return s.webp({ quality, alphaQuality, effort, smartSubsample: true }).toBuffer();
}
