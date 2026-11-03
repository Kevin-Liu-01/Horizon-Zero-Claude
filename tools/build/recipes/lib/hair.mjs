/**
 * CALIMA — short coiled hair (character-art, W1; R54, R56). No helmet shell: close hair is
 * painted into the skin atlas as coils (albedo + height), and given depth and a broken
 * outline by coil cards standing on it. Node only, deterministic.
 *
 * API (docs/ROUND5-CHARACTER-ART.md §3)
 *   coilField(W, H, opts)                 a tile of drawn helical coils: height + strand tone
 *   paintCoilTile(buf, opts)              the repeating tile, into the wrap atlas
 *   paintCoilFringe(buf, opts)            tufts for cards: dense roots, loose coil tips
 *   paintLockTile(buf, opts)              the opaque coil surface of a lock
 *   coilSampler(field)                    read the tile by metres: (x, y, o) => height + tone
 *   hairCoverage(pm, shellGrid, opts)     which texels the guide shell covers (blurred)
 *   hairlineLayer(opts)                   the paint layer: skin -> coils, soft dissolved edge
 *   coilCards(anchors, opts)              coil cards from scalp anchors
 *   scatterAnchors(grid, opts)            deterministic anchors on the scalp
 *   coilLocks(points, joints, opts)       twisted locks on a dyn_ chain
 *   paintBrow(opts)                       a brow as hair strokes in the skin atlas
 */
import { noise3, hex, smooth, polyline, v3 } from './face.mjs';
import { rng } from './wrap.mjs';

const { sub, add, mul, dot, cross, norm } = v3;
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const clampB = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/* ======================================================= the drawn coils */

/**
 * Draw `count` helical coils into a periodic W x H field. A coil is a helix seen from the
 * side: it runs `len` px along its axis, turning `turns` times at radius `r`, the strand
 * passing in front and behind itself. Returns { W, H, h (0..1 height), tone (strand tone) }.
 */
export function coilField(W, H, { count = 320, seed = 11, r = [4.2, 7.2], len = [14, 34], turns = [2.6, 4.6], strand = [1.05, 1.5], axisMean = Math.PI / 2, axisSpread = 0.75, density = null, wrapY = true } = {}) {
  const h = new Float32Array(W * H), tone = new Float32Array(W * H);
  const R = rng(seed * 2654435761);
  const splat = (cx, cy, rad, z, t) => {
    const x0 = Math.floor(cx - rad - 1), x1 = Math.ceil(cx + rad + 1), y0 = Math.floor(cy - rad - 1), y1 = Math.ceil(cy + rad + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const yy = wrapY ? ((y % H) + H) % H : y;
      if (yy < 0 || yy >= H) continue;
      const xx = ((x % W) + W) % W;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad;
      if (d >= 1) continue;
      const v = z + 0.2 * Math.sqrt(1 - d * d);
      const o = yy * W + xx;
      if (v > h[o]) { h[o] = v; tone[o] = t; }
    }
  };
  for (let n = 0; n < count; n++) {
    let cx = R() * W, cy = R() * H;
    if (density) { let tries = 0; while (R() > density(cx / W, cy / H) && tries++ < 12) { cx = R() * W; cy = R() * H; } }
    const ax = axisMean + (R() - 0.5) * 2 * axisSpread;
    const ra = mix(r[0], r[1], R()), L = mix(len[0], len[1], R()), tu = mix(turns[0], turns[1], R()), sw = mix(strand[0], strand[1], R());
    const base = 0.26 + 0.34 * R(), t = R();
    const steps = Math.ceil((TAU * tu * ra + L) / 0.7);
    const ph = R() * TAU;
    const ca = Math.cos(ax), sa = Math.sin(ax);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps, w = ph + TAU * tu * f;
      const px = -sa * Math.cos(w) * ra, py = ca * Math.cos(w) * ra;       // across the axis
      const along = (f - 0.5) * L + Math.sin(w) * ra * 0.42;               // the helix's ellipse
      const z = base + 0.2 * Math.sin(w);
      splat(cx + ca * along + px, cy + sa * along + py, sw, z, t);
    }
  }
  return { W, H, h, tone };
}

/** The strand colour for a field height: near-black with a warm brown crown. */
function coilColour(hv, tv, C) {
  const k = 0.42 + 1.1 * hv;
  const warm = smooth(0.5, 0.95, hv) * (0.5 + 0.5 * tv);
  return [C[0] * k + warm * 18, C[1] * k + warm * 12, C[2] * k + warm * 9];
}

const fieldNormal = (f, x, y, kN) => {
  const W = f.W, H = f.H;
  const a = f.h[y * W + ((x + 1) % W)], b = f.h[y * W + ((x - 1 + W) % W)], c = f.h[((y + 1) % H) * W + x], d = f.h[((y - 1 + H) % H) * W + x];
  const nx = -(a - b) * kN, ny = (c - d) * kN, l = Math.hypot(nx, ny, 1);
  return [nx / l, ny / l, 1 / l];
};

/** The repeating coil tile (period px both ways, drawn into a (period + margin) square rect). */
export function paintCoilTile(buf, { rect, period, W = 512, hair = '#15110F', seed = 21, rough = 0.42 } = {}) {
  const [x0, y0, w, h] = rect;
  const f = coilField(period, period, { count: 340, seed });
  const C = hex(hair);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x % period, sy = y % period, s = sy * period + sx;
    const hv = f.h[s], tv = f.tone[s];
    const col = coilColour(hv, tv, C);
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = clampB(col[0]); buf.base[o + 1] = clampB(col[1]); buf.base[o + 2] = clampB(col[2]);
    // 0.5 is the mask's cut; the deep gaps between coils sit just above it, so a
    // vertex alpha below 1 opens holes between the coils (a dissolving edge)
    buf.base[o + 3] = clampB((0.52 + 0.48 * smooth(0.18, 0.6, hv)) * 255);
    const q = ((y0 + y) * W + x0 + x) * 3;
    const n = fieldNormal(f, sx, sy, 5.2);
    buf.normal[q] = clampB((n[0] * 0.5 + 0.5) * 255); buf.normal[q + 1] = clampB((n[1] * 0.5 + 0.5) * 255); buf.normal[q + 2] = clampB((n[2] * 0.5 + 0.5) * 255);
    buf.orm[q] = 255; buf.orm[q + 1] = clampB((rough + 0.2 * (1 - hv)) * 255); buf.orm[q + 2] = 0;
  }
  return f;
}

/** Tufts for cards: V = 1 (bottom of the rect) is the root, dense; V = 0 the loose tips. */
export function paintCoilFringe(buf, { rect, W = 512, hair = '#15110F', seed = 33, rough = 0.44 } = {}) {
  const [x0, y0, w, h] = rect;
  const f = coilField(w, h, {
    count: 300, seed, wrapY: false, r: [3.6, 6.2], len: [12, 26], turns: [2.4, 4.0], strand: [0.95, 1.35], axisSpread: 0.9,
    density: (u, v) => mix(0.1, 1, smooth(0.08, 0.72, v)),
  });
  const C = hex(hair);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = y * w + x;
    const hv = f.h[s], tv = f.tone[s];
    const col = coilColour(hv, tv, C);
    const root = smooth(0.55, 1, y / h);
    const shade = mix(1, 0.55, root);                              // roots sit in shade
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = clampB(col[0] * shade); buf.base[o + 1] = clampB(col[1] * shade); buf.base[o + 2] = clampB(col[2] * shade);
    const solid = hv > 0.1 || root > 0.92;
    buf.base[o + 3] = solid ? 255 : 2;
    const q = ((y0 + y) * W + x0 + x) * 3;
    const n = fieldNormal(f, x, y, 4.6);
    buf.normal[q] = clampB((n[0] * 0.5 + 0.5) * 255); buf.normal[q + 1] = clampB((n[1] * 0.5 + 0.5) * 255); buf.normal[q + 2] = clampB((n[2] * 0.5 + 0.5) * 255);
    buf.orm[q] = 255; buf.orm[q + 1] = clampB((rough + 0.18 * (1 - hv)) * 255); buf.orm[q + 2] = 0;
  }
  return f;
}

/** The opaque coil surface of a lock, repeating; the flow runs along V. */
export function paintLockTile(buf, { rect, period, W = 512, hair = '#15110F', seed = 47, rough = 0.40 } = {}) {
  const [x0, y0, w, h] = rect;
  const f = coilField(period, period, { count: 260, seed, r: [3.2, 5.4], len: [12, 26], axisSpread: 0.3, strand: [1, 1.4] });
  const C = hex(hair);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x % period, sy = y % period, s = sy * period + sx;
    const col = coilColour(f.h[s], f.tone[s], C);
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = clampB(col[0]); buf.base[o + 1] = clampB(col[1]); buf.base[o + 2] = clampB(col[2]); buf.base[o + 3] = 255;
    const q = ((y0 + y) * W + x0 + x) * 3;
    const n = fieldNormal(f, sx, sy, 5);
    buf.normal[q] = clampB((n[0] * 0.5 + 0.5) * 255); buf.normal[q + 1] = clampB((n[1] * 0.5 + 0.5) * 255); buf.normal[q + 2] = clampB((n[2] * 0.5 + 0.5) * 255);
    buf.orm[q] = 255; buf.orm[q + 1] = clampB((rough + 0.2 * (1 - f.h[s])) * 255); buf.orm[q + 2] = 0;
  }
}

/** Read a field by metres (`period` metres per tile). o = [height, tone]. */
export function coilSampler(f, periodM) {
  const k = f.W / periodM;
  return (x, y, o) => {
    const fx = x * k, fy = y * k;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const X0 = ((x0 % f.W) + f.W) % f.W, Y0 = ((y0 % f.H) + f.H) % f.H, X1 = (X0 + 1) % f.W, Y1 = (Y0 + 1) % f.H;
    o[0] = (f.h[Y0 * f.W + X0] * (1 - tx) + f.h[Y0 * f.W + X1] * tx) * (1 - ty) + (f.h[Y1 * f.W + X0] * (1 - tx) + f.h[Y1 * f.W + X1] * tx) * ty;
    o[1] = f.tone[Y0 * f.W + X0];
    return o;
  };
}

/* ====================================================== hair on the skin */

/**
 * Which texels of a position map lie under the guide shell (a cast along the normal,
 * then outward from the skull), blurred so a low-poly shell does not print its polygons.
 */
export function hairCoverage(pm, shellGrid, { W, want, maxD = 0.03, blur } = {}) {
  const cov = new Float32Array(W * W);
  for (let i = 0; i < W * W; i++) {
    const o = i * 3;
    if (Number.isNaN(pm.pos[o]) || (want && !want(i))) continue;
    const l = Math.hypot(pm.nrm[o], pm.nrm[o + 1], pm.nrm[o + 2]) || 1;
    const hit = shellGrid.cast(pm.pos[o] - pm.nrm[o] / l * 0.003, pm.pos[o + 1] - pm.nrm[o + 1] / l * 0.003, pm.pos[o + 2] - pm.nrm[o + 2] / l * 0.003, pm.nrm[o] / l, pm.nrm[o + 1] / l, pm.nrm[o + 2] / l, maxD, 0.0001);
    cov[i] = hit >= 0 ? 1 : 0;
  }
  return blur ? blur(cov) : cov;
}

/**
 * The hairline paint layer. `coverage(T)` -> 0..1 (blurred shell); the edge dissolves through
 * the coil field itself, so the skin-to-hair transition is individual coils, not a stencil.
 */
export function hairlineLayer({ coverage, sampler, flowUV, hair = '#15110F', skinShadow = 0.72, heightM = 0.00042 } = {}) {
  const C = hex(hair);
  const o = [0, 0];
  const uv = [0, 0];
  return (T) => {
    const c = coverage(T);
    if (c <= 0.01) return;
    flowUV(T, uv);
    sampler(uv[0], uv[1], o);
    const hv = o[0], tv = o[1];
    // scalp stubble darkening starts before the coils do
    const under = smooth(0.1, 0.5, c);
    const dark = mix(1, skinShadow, under);
    T.r *= dark; T.g *= dark * 0.98; T.b *= dark * 0.96;
    const edge = smooth(0.42, 0.64, c + (hv - 0.42) * 0.62);
    if (edge <= 0) return;
    const col = coilColour(hv, tv, C);
    T.r = mix(T.r, col[0] * 1.05, edge); T.g = mix(T.g, col[1] * 1.05, edge); T.b = mix(T.b, col[2] * 1.05, edge);
    T.h += edge * hv * heightM;
    T.rough = mix(T.rough, 0.42 + 0.2 * (1 - hv), edge);
  };
}

/* ================================================================= cards */

/**
 * Anchors on a scalp: rays from outside onto `grid`, on a jittered az/el lattice around
 * `center`; `keep(p)` decides. Returns [{ p, n, az, el }].
 */
export function scatterAnchors(grid, { center, step = 0.14, seed = 5, keep, elMin = -1.1, elMax = 0.9 } = {}) {
  const R = rng(seed * 16777619);
  const out = [];
  const far = 0.3;
  for (let el = elMin; el < elMax; el += step * 0.72) {
    const c = Math.max(0.3, Math.cos(el));
    const stepA = step / c;
    for (let az = -Math.PI; az < Math.PI; az += stepA) {
      const a = az + (R() - 0.5) * stepA * 0.9, e = el + (R() - 0.5) * step * 0.6;
      const d = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
      const t = grid.cast(center[0] + d[0] * far, center[1] + d[1] * far, center[2] + d[2] * far, -d[0], -d[1], -d[2], far, 0.0001);
      if (t < 0) continue;
      const p = [center[0] + d[0] * (far - t), center[1] + d[1] * (far - t), center[2] + d[2] * (far - t)];
      if (!keep(p, d)) continue;
      out.push({ p, n: d, az: a, el: e });
    }
  }
  return out;
}

/**
 * Coil cards. Each anchor grows a short two-segment card along its local flow: a root row
 * pressed to the scalp, a tip row lifted off it. `skinOf(p)` -> { j, w } copies the nearest
 * body vertex's weights, so nape cards follow the neck. UVs are random windows of the
 * fringe cell (root at its bottom edge).
 */
export function coilCards(anchors, { flow, skinOf, length = [0.014, 0.024], width = [0.012, 0.02], liftTip = [0.003, 0.0075], rect, W = 512, seed = 9 } = {}) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [], col: [] };
  const R = rng(seed * 2166136261);
  for (const a of anchors) {
    const n = norm(a.n);
    let f = flow(a, R);
    f = norm(sub(f, mul(n, dot(f, n))));
    const s = norm(cross(n, f));
    const L = mix(length[0], length[1], R()), Wd = mix(width[0], width[1], R()) * (a.scale ?? 1), lift = mix(liftTip[0], liftTip[1], R());
    const roll = (R() - 0.5) * 0.7;                                   // a little rotation about the flow, so cards do not all face out
    const sd = norm(add(mul(s, Math.cos(roll)), mul(n, Math.sin(roll))));
    const windowW = Wd / (0.078) * rect[2] * 0.5;                     // the fringe cell is ~7.8 cm wide
    const u0 = rect[0] + R() * (rect[2] - windowW - 1);
    const skin = skinOf(a.p);
    const rows = [0, 0.55, 1];
    const base = g.pos.length / 3;
    for (let r = 0; r < 3; r++) {
      const t = rows[r];
      const c = add(add(a.p, mul(f, L * t)), mul(n, -0.0006 + lift * t * t + 0.0012 * t));
      const nn = norm(add(mul(n, 0.82), mul(f, 0.28 - 0.5 * t)));
      for (let k = 0; k < 2; k++) {
        const x = k ? 0.5 : -0.5;
        g.pos.push(...add(c, mul(sd, x * Wd * (1 - 0.18 * t))));
        g.nrm.push(...nn);
        g.uv.push((u0 + k * windowW) / W, (rect[1] + (1 - t) * (rect[3] - 1)) / W);
        g.jnt.push(...skin.j); g.wgt.push(...skin.w);
        const shade = mix(0.55, 1, t);
        g.col.push(shade, shade, shade, 1);
      }
    }
    for (let r = 0; r < 2; r++) {
      const a0 = base + r * 2;
      g.idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  return g;
}

/**
 * The knot tail as `count` twisted locks of coil round the chain: each lock winds about
 * the chain's axis and tapers to its own tip. Skinned along `joints` exactly as a tube
 * would be (A33-hair-bounce reads the chain, not the mesh).
 */
export function coilLocks(P, joints, { count = 5, ring = 4, along = 9, spread = 0.0105, radius = 0.0078, twist = 2.4, uv, W = 512, seed = 13, side = [1, 0, 0] } = {}) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] };
  const pl = polyline(P);
  const R = rng(seed * 16777619);
  const [rx, ry, rw, rh] = uv.rect;
  for (let c = 0; c < count; c++) {
    const ph = (c / count) * TAU + R() * 0.5;
    const taper = 0.72 + R() * 0.28;
    const rad = radius * (0.8 + 0.4 * R());
    const sOff = R() * rw * 0.5, vOff = R() * rh * 0.3;
    const base = g.pos.length / 3;
    for (let a = 0; a <= along; a++) {
      const u = (a / along) * taper;
      const { p, t, seg, f } = pl.at(u);
      const sd = norm(sub(side, mul(t, dot(side, t))));
      const up = cross(t, sd);
      const ang = ph + twist * u * TAU;
      const sprd = spread * (0.75 + 0.6 * u) * (1 - 0.35 * smooth(0.7, 1, u));
      const off = add(mul(sd, Math.cos(ang) * sprd), mul(up, Math.sin(ang) * sprd));
      const cen = add(p, off);
      const r0 = rad * (1 - 0.62 * smooth(0.25, 1, a / along)) + 0.0007;
      const n1 = joints.length;
      const ja = joints[Math.min(seg, n1 - 1)], jb = joints[Math.min(seg + 1, n1 - 1)];
      const wb = seg + 1 >= n1 ? 0 : f;
      for (let r = 0; r <= ring; r++) {
        const th = (r / ring) * TAU;
        const nn = add(mul(sd, Math.cos(th)), mul(up, Math.sin(th)));
        g.pos.push(...add(cen, mul(nn, r0)));
        g.nrm.push(...nn);
        g.uv.push((rx + sOff + (r / ring) * rw * 0.5) / W, (ry + vOff + (a / along) * rh * 0.68) / W);
        g.jnt.push(ja, jb, 0, 0); g.wgt.push(1 - wb, wb, 0, 0);
      }
    }
    for (let a = 0; a < along; a++) for (let r = 0; r < ring; r++) {
      const i0 = base + a * (ring + 1) + r, i1 = i0 + 1, i2 = i0 + ring + 1, i3 = i2 + 1;
      g.idx.push(i0, i1, i2, i1, i3, i2);
    }
  }
  return g;
}

/* ================================================================= brows */

/**
 * Brows painted hair by hair. `line(x)` -> { y, half } gives the brow's centre and half
 * height along x (bind metres); a stroke grows up and out from the lower edge. Returns a
 * paint layer plus the strokes (`scar`, a segment, parts the hairs along it). Each stroke
 * only tests texels in its own box, so 90 strokes per brow cost little.
 */
export function browLayer({ x0, x1, line, strokes = 110, seed = 17, hair = '#15110F', scar = null, side = 1, width = 0.00028, length = [0.0052, 0.0088] } = {}) {
  const R = rng(seed * 374761393);
  const list = [];
  const seg = (a, b, p) => {
    const ax = b[0] - a[0], ay = b[1] - a[1];
    const t = clamp01(((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / (ax * ax + ay * ay));
    return Math.hypot(p[0] - (a[0] + ax * t), p[1] - (a[1] + ay * t));
  };
  for (let n = 0; n < strokes; n++) {
    const f = R();
    const x = mix(x0, x1, f);
    const { y, half } = line(x);
    const yy = y + (R() * 2 - 1) * half * 0.86;
    // inner hairs stand up, the outer ones lie along the brow
    const ang = mix(1.25, 0.1, smooth(0.0, 0.62, f)) + (R() - 0.5) * 0.42;
    const dirX = side * Math.cos(ang), dirY = Math.sin(ang);
    const L = mix(length[0], length[1], R()) * mix(0.72, 1, smooth(0, 0.3, f)) * mix(1, 0.72, smooth(0.8, 1, f));
    const a = [x - dirX * L * 0.5, yy - dirY * L * 0.5], b = [x + dirX * L * 0.5, yy + dirY * L * 0.5];
    if (scar && Math.min(seg(scar.a, scar.b, a), seg(scar.a, scar.b, b), seg(scar.a, scar.b, [x, yy])) < 0.0021) continue;
    list.push({ a, b, w: width * (0.8 + 0.5 * R()), d: 0.82 + 0.18 * R() });
  }
  const C = hex(hair);
  const bx0 = Math.min(x0, x1) - 0.008, bx1 = Math.max(x0, x1) + 0.008;
  let by0 = 9, by1 = -9;
  for (const s of list) { by0 = Math.min(by0, s.a[1], s.b[1]); by1 = Math.max(by1, s.a[1], s.b[1]); }
  by0 -= 0.002; by1 += 0.002;
  return (T) => {
    if (T.X < bx0 || T.X > bx1 || T.Y < by0 || T.Y > by1 || T.nz < 0.05) return;
    // a soft under-tone, then the strokes
    const { y, half } = line(Math.max(Math.min(x0, x1), Math.min(Math.max(x0, x1), T.X)));
    const inX = 1 - smooth(0, 0.004, Math.max(Math.min(x0, x1) - T.X, T.X - Math.max(x0, x1)));
    const shadow = (1 - smooth(half * 0.5, half * 1.25, Math.abs(T.Y - y))) * inX * 0.42;
    const sk = 1 - shadow * 0.62;
    T.r *= sk; T.g *= sk * 0.97; T.b *= sk * 0.95;
    let best = 0;
    for (const s of list) {
      if (T.X < Math.min(s.a[0], s.b[0]) - s.w * 2 || T.X > Math.max(s.a[0], s.b[0]) + s.w * 2 || T.Y < Math.min(s.a[1], s.b[1]) - s.w * 2 || T.Y > Math.max(s.a[1], s.b[1]) + s.w * 2) continue;
      const ax = s.b[0] - s.a[0], ay = s.b[1] - s.a[1];
      const t = clamp01(((T.X - s.a[0]) * ax + (T.Y - s.a[1]) * ay) / (ax * ax + ay * ay));
      const d = Math.hypot(T.X - (s.a[0] + ax * t), T.Y - (s.a[1] + ay * t));
      const tip = mix(1, 0.45, t);
      const k = (1 - smooth(s.w * 0.55 * tip, s.w * 1.45 * tip, d)) * s.d;
      if (k > best) best = k;
    }
    if (best > 0) {
      T.r = mix(T.r, C[0] * 1.2, best); T.g = mix(T.g, C[1] * 1.2, best); T.b = mix(T.b, C[2] * 1.2, best);
      T.h += best * 0.00016;
      T.rough = mix(T.rough, 0.5, best);
    }
  };
}
