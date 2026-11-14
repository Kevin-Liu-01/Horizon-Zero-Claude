/**
 * CALIMA — armor recipes: re-pack a garment onto its set atlas and paint it
 * (armory W1; bible §4.1 "one 1024² atlas per set, base 1024², normal/ORM 512²").
 *
 * WHY RE-PACK: the MCO source atlas gives a smock front ~170 px; its layout
 * wastes most of the sheet. `packAtlas` cuts every part into its UV islands,
 * scales each to a uniform texel density (metres, not source pixels), turns it
 * so cloth grain runs down gravity (atlas +y = down the garment), and shelf-packs
 * the set at the largest density that fits, leaving a TRIM band at the bottom of
 * the sheet for the procedural pieces (belts, straps, brass, rope).
 *
 * `paintAtlas` rasterises the layout (bind position, normal, source UV, distance
 * to the island edge per texel), calls the set's painter per texel, adds the
 * curvature pass (creases darken and hold salt, ridges wear pale), combines the
 * re-oriented source normal with the painted height, and returns WebP buffers.
 * ORM channels: R = detail class (0 none, 0.33 grain, 0.66 knit, 1 weave: read
 * by src/hero/clothShader.js; ambient occlusion is baked into the base),
 * G = roughness, B = metal.
 */
import sharp from 'sharp';
import { noise3 } from '../../lib/face.mjs';
import { clamp, sstep } from './part.mjs';

export const fbm = (x, y, z, oct = 3) => {
  let a = 0.5, s = 0, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
};

/* ------------------------------------------------------------- islands */

function islandsOfPart(part) {
  const n = part.pos.length / 3;
  const par = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const { idx } = part;
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]);
    if (a !== b) par[b] = a;
    const a2 = find(a);
    if (a2 !== c) par[c] = a2;
  }
  const map = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(idx[t]);
    if (!map.has(r)) map.set(r, []);
    map.get(r).push(t);
  }
  return [...map.values()];
}

/** Scale (m per uv unit) and grain angle of an island. */
function islandFrame(part, tris) {
  const { pos, uv, idx } = part;
  const axis = part.axis || [0, 1, 0];
  let a3 = 0, a2 = 0, gu = 0, gv = 0;
  for (const t of tris) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const e1 = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]];
    const e2 = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const A3 = Math.hypot(cr[0], cr[1], cr[2]) / 2;
    const du1 = uv[b * 2] - uv[a * 2], dv1 = uv[b * 2 + 1] - uv[a * 2 + 1], du2 = uv[c * 2] - uv[a * 2], dv2 = uv[c * 2 + 1] - uv[a * 2 + 1];
    const det = du1 * dv2 - du2 * dv1;
    a3 += A3; a2 += Math.abs(det) / 2;
    if (Math.abs(det) < 1e-9) continue;
    const s1 = e1[0] * axis[0] + e1[1] * axis[1] + e1[2] * axis[2], s2 = e2[0] * axis[0] + e2[1] * axis[1] + e2[2] * axis[2];
    // gradient of the axis coordinate in (u, v), area-weighted
    const fu = (s1 * dv2 - s2 * dv1) / det, fv = (-s1 * du2 + s2 * du1) / det;
    gu += fu * A3; gv += fv * A3;
  }
  const scale = a2 > 1e-10 ? Math.sqrt(a3 / a2) : 1;
  // rotate so the axis coordinate DEcreases along atlas +y (down the garment)
  let theta = 0;
  if (Math.hypot(gu, gv) > 1e-6) {
    theta = Math.atan2(gu, -gv);        // maps (gu, gv) onto (0, -|g|)
    const snap = Math.round(theta / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(theta - snap) < 0.09) theta = snap;
  }
  return { scale, theta, area3: a3 };
}

/* ---------------------------------------------------------------- pack */

/**
 * Lay every non-trim part onto the sheet. Writes part.uvNew (normalised) and
 * part.srcUV (the source uv, per vertex), returns the layout. `part.density`
 * multiplies the texel density of that part's islands (trousers 0.8, ...).
 */
export function packAtlas(parts, { W = 1024, H = 1024, pad = 4, trimH = 0 } = {}) {
  const islands = [];
  for (const part of parts) {
    if (part.trim) continue;
    part.srcUV = part.uv.slice();
    for (const tris of islandsOfPart(part)) {
      const f = part.metricUV ? { scale: 1, theta: 0, area3: 0 } : islandFrame(part, tris);
      const verts = new Set();
      for (const t of tris) { verts.add(part.idx[t]); verts.add(part.idx[t + 1]); verts.add(part.idx[t + 2]); }
      const c = Math.cos(f.theta), s = Math.sin(f.theta);
      let u0 = 1e9, v0 = 1e9, u1 = -1e9, v1 = -1e9;
      for (const v of verts) {
        const a = part.uv[v * 2] * f.scale, b = part.uv[v * 2 + 1] * f.scale;
        const x = c * a - s * b, y = s * a + c * b;
        u0 = Math.min(u0, x); u1 = Math.max(u1, x); v0 = Math.min(v0, y); v1 = Math.max(v1, y);
      }
      islands.push({ part, tris, verts, ...f, c, s, u0, v0, w: u1 - u0, h: v1 - v0, density: part.density || 1 });
    }
  }
  // skyline bottom-left: each island at the lowest place it fits. Armory W1: the order is the one of four (tallest,
  // widest, largest, longest side first) that packs densest, and among equally low places the one that buries the
  // least sky under it, so the sheet's texel density is not lost to holes (islands never rotate: the painters lay
  // the warp down the garment)
  const ORDERS = [
    (a, b) => (b.h * b.density) - (a.h * a.density) || (b.w - a.w),
    (a, b) => (b.w * b.density) - (a.w * a.density) || (b.h - a.h),
    (a, b) => (b.w * b.h * b.density * b.density) - (a.w * a.h * a.density * a.density) || (b.h - a.h),
    (a, b) => (Math.max(b.w, b.h) * b.density) - (Math.max(a.w, a.h) * a.density) || (b.h - a.h),
  ];
  const tryPack = (D) => {
    const HH = H - trimH;
    const sky = new Int32Array(W);          // per column, the first free y
    for (const isl of islands) {
      const w = Math.ceil(isl.w * D * isl.density) + pad * 2, h = Math.ceil(isl.h * D * isl.density) + pad * 2;
      if (w > W) return false;
      let bestX = -1, bestY = 1e9, bestWaste = 1e18;
      for (let x = 0; x + w <= W; x += 4) {
        let y = 0;
        for (let k = x; k < x + w; k++) if (sky[k] > y) y = sky[k];
        if (y > bestY) continue;
        let waste = 0;
        for (let k = x; k < x + w; k++) waste += y - sky[k];
        if (y < bestY || waste < bestWaste) { bestY = y; bestX = x; bestWaste = waste; }
      }
      if (bestX < 0 || bestY + h > HH) return false;
      isl.x = bestX + pad; isl.y = bestY + pad;
      for (let k = bestX; k < bestX + w; k++) sky[k] = bestY + h;
    }
    return true;
  };
  const search = () => { let lo = 50, hi = 4000; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (tryPack(m)) lo = m; else hi = m; } return lo; };
  let bestOrder = 0, D = -1;
  ORDERS.forEach((cmp, i) => { islands.sort(cmp); const d = search(); if (d > D + 1e-9) { D = d; bestOrder = i; } });
  islands.sort(ORDERS[bestOrder]);
  tryPack(D);
  for (const part of parts) if (!part.trim) part.uvNew = part.uv.slice();
  for (const isl of islands) {
    const k = D * isl.density;
    for (const v of isl.verts) {
      const a = isl.part.srcUV[v * 2] * isl.scale, b = isl.part.srcUV[v * 2 + 1] * isl.scale;
      const x = isl.c * a - isl.s * b, y = isl.s * a + isl.c * b;
      isl.part.uvNew[v * 2] = (isl.x + (x - isl.u0) * k) / W;
      isl.part.uvNew[v * 2 + 1] = (isl.y + (y - isl.v0) * k) / H;
    }
  }
  return { W, H, D, islands, pad, trimH };
}

/* --------------------------------------------------------------- paint */

/** Bilinear read of a raw RGB buffer (uv wraps). */
function readRGB(src, u, v, out) {
  u -= Math.floor(u); v -= Math.floor(v);
  const x = u * src.w - 0.5, y = v * src.h - 0.5;
  const x0 = (Math.floor(x) + src.w) % src.w, y0 = (Math.floor(y) + src.h) % src.h;
  const x1 = (x0 + 1) % src.w, y1 = (y0 + 1) % src.h;
  const fx = x - Math.floor(x), fy = y - Math.floor(y);
  for (let k = 0; k < 3; k++) {
    const a = src.data[(y0 * src.w + x0) * src.c + k], b = src.data[(y0 * src.w + x1) * src.c + k];
    const c = src.data[(y1 * src.w + x0) * src.c + k], d = src.data[(y1 * src.w + x1) * src.c + k];
    out[k] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  return out;
}
export async function loadRaw(file, size = null) {
  let s = sharp(file).removeAlpha();
  if (size) s = s.resize(size, size, { kernel: 'lanczos3' });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, c: info.channels };
}

/**
 * paintAtlas(parts, layout, { painters, srcNormal, trim, curv })
 *   painters[slot](t, o): t = { x, y, X, Y, Z, nx, ny, nz, d, slot, part, isl }
 *   writes o = { r, g, b (sRGB 0-255), rough, metal, det, h (height, m), salt, ao }
 *   trim: Trim sheet painted after the islands (same o contract), never re-oriented
 * Returns { base, normal, orm } WebP buffers (base 1024², normal + ORM 512²).
 */
export async function paintAtlas(parts, layout, { painters, srcNormal = null, trim = null, salt = [237, 234, 226], curv = {}, q = {} } = {}) {
  const { W, H, islands, D } = layout;
  const NT = W * H;
  const owner = new Int32Array(NT).fill(-1);
  const P = new Float32Array(NT * 3), N = new Float32Array(NT * 3), S = new Float32Array(NT * 2);
  islands.forEach((isl, ii) => {
    const { part, tris } = isl;
    const { pos, nrm, srcUV, uvNew, idx } = part;
    for (const t of tris) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const ax = uvNew[a * 2] * W, ay = uvNew[a * 2 + 1] * H, bx = uvNew[b * 2] * W, by = uvNew[b * 2 + 1] * H, cx = uvNew[c * 2] * W, cy = uvNew[c * 2 + 1] * H;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        let w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        let w2 = 1 - w0 - w1;
        const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
        if (w0 < -0.15 || w1 < -0.15 || w2 < -0.15) continue;
        const o = y * W + x;
        if (owner[o] >= 0 && owner[o] !== ii) continue;
        if (owner[o] === ii && !inside) continue;
        w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2);
        const s = w0 + w1 + w2; w0 /= s; w1 /= s; w2 /= s;
        owner[o] = ii;
        for (let k = 0; k < 3; k++) {
          P[o * 3 + k] = pos[a * 3 + k] * w0 + pos[b * 3 + k] * w1 + pos[c * 3 + k] * w2;
          N[o * 3 + k] = nrm[a * 3 + k] * w0 + nrm[b * 3 + k] * w1 + nrm[c * 3 + k] * w2;
        }
        S[o * 2] = srcUV[a * 2] * w0 + srcUV[b * 2] * w1 + srcUV[c * 2] * w2;
        S[o * 2 + 1] = srcUV[a * 2 + 1] * w0 + srcUV[b * 2 + 1] * w1 + srcUV[c * 2 + 1] * w2;
      }
    }
  });
  // distance (texels) to the island's edge, two-pass chamfer
  const dist = new Float32Array(NT).fill(1e6);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = y * W + x;
    if (owner[o] < 0) { dist[o] = 0; continue; }
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || owner[o - 1] !== owner[o] || owner[o + 1] !== owner[o] || owner[o - W] !== owner[o] || owner[o + W] !== owner[o]) dist[o] = 0.5;
  }
  for (let y = 1; y < H; y++) for (let x = 1; x < W - 1; x++) {
    const o = y * W + x; if (owner[o] < 0) continue;
    dist[o] = Math.min(dist[o], dist[o - 1] + 1, dist[o - W] + 1, dist[o - W - 1] + 1.414, dist[o - W + 1] + 1.414);
  }
  for (let y = H - 2; y >= 0; y--) for (let x = W - 2; x > 0; x--) {
    const o = y * W + x; if (owner[o] < 0) continue;
    dist[o] = Math.min(dist[o], dist[o + 1] + 1, dist[o + W] + 1, dist[o + W + 1] + 1.414, dist[o + W - 1] + 1.414);
  }

  const R = new Float32Array(NT * 3), ROUGH = new Float32Array(NT).fill(0.85), METAL = new Float32Array(NT), DET = new Float32Array(NT), HT = new Float32Array(NT), SALT = new Float32Array(NT), AO = new Float32Array(NT).fill(1);
  const WEAR = new Float32Array(NT).fill(1), CREASE = new Float32Array(NT).fill(1);
  const nX = new Float32Array(NT), nY = new Float32Array(NT);
  const o = { r: 128, g: 128, b: 128, rough: 0.85, metal: 0, det: 0, h: 0, salt: 0, ao: 1, wear: 1 };
  const t = { x: 0, y: 0, X: 0, Y: 0, Z: 0, nx: 0, ny: 0, nz: 0, d: 0, slot: '', part: null, isl: null, D };
  const sn = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, ii = owner[i];
    if (ii < 0) continue;
    const isl = islands[ii];
    t.x = x; t.y = y; t.X = P[i * 3]; t.Y = P[i * 3 + 1]; t.Z = P[i * 3 + 2];
    const nl = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    t.nx = N[i * 3] / nl; t.ny = N[i * 3 + 1] / nl; t.nz = N[i * 3 + 2] / nl;
    t.d = dist[i]; t.slot = isl.part.slot; t.part = isl.part; t.isl = isl;
    t.dm = dist[i] / (D * isl.density);    // edge distance in metres
    o.salt = 0; o.ao = 1; o.h = 0; o.metal = 0; o.det = 0; o.rough = 0.85; o.wear = 1; o.crease = 1;
    const fn = painters[t.slot] || painters.default;
    fn(t, o);
    R[i * 3] = o.r; R[i * 3 + 1] = o.g; R[i * 3 + 2] = o.b;
    ROUGH[i] = o.rough; METAL[i] = o.metal; DET[i] = o.det; HT[i] = o.h; SALT[i] = o.salt; AO[i] = o.ao; WEAR[i] = o.wear; CREASE[i] = o.crease;
    if (srcNormal && !isl.part.metricUV) {
      readRGB(srcNormal, S[i * 2], S[i * 2 + 1], sn);
      const a = (sn[0] / 127.5 - 1) * (isl.part.nScale ?? 1), b = (sn[1] / 127.5 - 1) * (isl.part.nScale ?? 1);
      // rotate the tangent-space xy with the island (uv: x, -y; see the file head)
      nX[i] = isl.c * a - isl.s * -b;
      nY[i] = -(isl.s * a + isl.c * -b);
    }
  }
  // the trim band
  if (trim) trim.paint({ R, ROUGH, METAL, DET, HT, SALT, AO, WEAR, owner, W, H, o, D });

  // height -> normal (height in metres, texel = 1/D metres)
  const slopeK = D;     // dh/dx in m per texel * texels per metre = slope
  const fx = new Float32Array(NT), fy = new Float32Array(NT);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (owner[i] === -1) continue;
    const l = owner[i - 1] === owner[i] ? HT[i - 1] : HT[i], r = owner[i + 1] === owner[i] ? HT[i + 1] : HT[i];
    const u = owner[i - W] === owner[i] ? HT[i - W] : HT[i], d = owner[i + W] === owner[i] ? HT[i + W] : HT[i];
    // glTF: +x right, +y up in the image: n.x = -dh/dx, n.y = +dh/dy(down)
    fx[i] = nX[i] - (r - l) * 0.5 * slopeK;
    fy[i] = nY[i] + (d - u) * 0.5 * slopeK;
  }
  // curvature pass: creases darken and hold salt, ridges wear pale
  const creaseK = curv.crease ?? 0.9, ridgeK = curv.ridge ?? 0.55;
  const out = Buffer.alloc(NT * 3), orm = Buffer.alloc(NT * 3);
  const CR = 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (owner[i] === -1) continue;
    let c = 0;
    if (x >= CR && y >= CR && x < W - CR && y < H - CR) {
      const xl = owner[i - CR] === owner[i] ? fx[i - CR] : fx[i], xr = owner[i + CR] === owner[i] ? fx[i + CR] : fx[i];
      const yu = owner[i - CR * W] === owner[i] ? fy[i - CR * W] : fy[i], yd = owner[i + CR * W] === owner[i] ? fy[i + CR * W] : fy[i];
      c = (xr - xl) - (yd - yu);          // > 0 convex ridge, < 0 crease (in image axes)
    }
    const ridge = clamp(c * 1.6), crease = clamp(-c * 1.6);
    const ao = AO[i];
    const wearK = WEAR[i];
    let r = R[i * 3], g = R[i * 3 + 1], b = R[i * 3 + 2];
    const lift = 1 + ridge * ridgeK * 0.35 * wearK;
    const dark = (1 - crease * creaseK * 0.42 * CREASE[i]) * ao;
    r *= lift * dark; g *= lift * dark; b *= lift * dark;
    const sm = clamp(SALT[i] * (0.65 + crease * 1.4));
    if (sm > 0) { const s2 = sstep(0.18, 0.62, sm); r += (salt[0] - r) * s2; g += (salt[1] - g) * s2; b += (salt[2] - b) * s2; }
    out[i * 3] = clamp(Math.round(r), 0, 255); out[i * 3 + 1] = clamp(Math.round(g), 0, 255); out[i * 3 + 2] = clamp(Math.round(b), 0, 255);
    orm[i * 3] = Math.round(clamp(DET[i]) * 255);
    orm[i * 3 + 1] = Math.round(clamp(ROUGH[i] + sm * 0.2 * (1 - ROUGH[i])) * 255);
    orm[i * 3 + 2] = Math.round(clamp(METAL[i]) * 255);
  }
  // dilate into the padding (no bleed in the mips)
  const nrm = Buffer.alloc(NT * 3);
  for (let i = 0; i < NT; i++) {
    let nx = fx[i], ny = fy[i];
    const lim = 2.2, l = Math.hypot(nx, ny);
    if (l > lim) { nx *= lim / l; ny *= lim / l; }
    const nz = 1;
    const m = Math.hypot(nx, ny, nz);
    nrm[i * 3] = Math.round((nx / m * 0.5 + 0.5) * 255); nrm[i * 3 + 1] = Math.round((ny / m * 0.5 + 0.5) * 255); nrm[i * 3 + 2] = Math.round((nz / m * 0.5 + 0.5) * 255);
  }
  const filled = new Int8Array(NT);
  for (let i = 0; i < NT; i++) filled[i] = owner[i] !== -1 ? 1 : 0;
  for (let pass = 0; pass < 6; pass++) {
    const next = filled.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (filled[i]) continue;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (!filled[j]) continue;
        for (let k = 0; k < 3; k++) { out[i * 3 + k] = out[j * 3 + k]; nrm[i * 3 + k] = nrm[j * 3 + k]; orm[i * 3 + k] = orm[j * 3 + k]; }
        next[i] = 1; break;
      }
    }
    filled.set(next);
  }
  const web = (buf, w, h, quality, size) => {
    let s = sharp(buf, { raw: { width: w, height: h, channels: 3 } });
    if (size) s = s.resize(size, size, { kernel: 'lanczos3' });
    return s.webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
  };
  return {
    base: await web(out, W, H, q.base ?? 88),
    normal: await web(nrm, W, H, q.normal ?? 90, 512),
    orm: await web(orm, W, H, q.orm ?? 88, 512),
    raw: { base: out, normal: nrm, orm },
  };
}

/* ---------------------------------------------------------------- trim */

/**
 * The trim band: named rectangles at the bottom of the sheet that procedural
 * pieces map into. `cell(name, w, h, painter)` allocates; `rect(name)` gives
 * [u, v, du, dv] (normalised, inset 2 px).
 */
export class Trim {
  constructor(W, H, trimH) {
    this.W = W; this.H = H; this.trimH = trimH;
    this.x = 0; this.y = H - trimH; this.rowH = 0;
    this.cells = new Map();
  }
  cell(name, w, h, painter, { det = 0 } = {}) {
    if (this.x + w > this.W) { this.x = 0; this.y += this.rowH; this.rowH = 0; }
    if (this.y + h > this.H) throw new Error(`Trim: no room for ${name} (${w}x${h})`);
    this.cells.set(name, { x: this.x, y: this.y, w, h, painter, det });
    this.x += w; this.rowH = Math.max(this.rowH, h);
    return this;
  }
  rect(name) {
    const c = this.cells.get(name);
    if (!c) throw new Error(`Trim: no cell ${name}`);
    return [(c.x + 2) / this.W, (c.y + 2) / this.H, (c.w - 4) / this.W, (c.h - 4) / this.H];
  }
  paint({ R, ROUGH, METAL, DET, HT, SALT, AO, WEAR, owner, W, o }) {
    const t = {};
    for (const [, c] of this.cells) {
      for (let py = 0; py < c.h; py++) for (let px = 0; px < c.w; px++) {
        const i = (c.y + py) * W + c.x + px;
        t.x = px; t.y = py; t.u = px / c.w; t.v = py / c.h; t.w = c.w; t.h = c.h;
        t.ax = c.x + px; t.ay = c.y + py;
        o.salt = 0; o.ao = 1; o.h = 0; o.metal = 0; o.det = c.det; o.rough = 0.8; o.wear = 1;
        c.painter(t, o);
        R[i * 3] = o.r; R[i * 3 + 1] = o.g; R[i * 3 + 2] = o.b;
        ROUGH[i] = o.rough; METAL[i] = o.metal; DET[i] = o.det; HT[i] = o.h; SALT[i] = o.salt; AO[i] = o.ao; WEAR[i] = o.wear;
        owner[i] = -2 - c.x;   // one trim id per cell column: edges read as edges
      }
    }
  }
}
