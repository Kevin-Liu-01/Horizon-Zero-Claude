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
/**
 * Coiled hair is near-black and matte: at the dielectric 4 % reflectance a strong sun turns it
 * grey. A small metalness (the ORM's B) takes the worst of that off; much more and the diffuse goes
 * with it and the nape reads as a black shell.
 */
const HAIR_METAL = 48;

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
  // deep in the gaps it is the bible's near-black; the coil crowns carry a dark warm brown, so the hair has value and shape
  const k = 0.55 + 1.25 * hv;
  const warm = smooth(0.38, 0.9, hv) * (0.55 + 0.45 * tv);
  return [C[0] * k + warm * 34, C[1] * k + warm * 23, C[2] * k + warm * 17];
}

const fieldNormal = (f, x, y, kN) => {
  const W = f.W, H = f.H;
  const a = f.h[y * W + ((x + 1) % W)], b = f.h[y * W + ((x - 1 + W) % W)], c = f.h[((y + 1) % H) * W + x], d = f.h[((y - 1 + H) % H) * W + x];
  const nx = -(a - b) * kN, ny = (c - d) * kN, l = Math.hypot(nx, ny, 1);
  return [nx / l, ny / l, 1 / l];
};

/** The repeating coil tile (period px both ways, drawn into a (period + margin) square rect). */
export function paintCoilTile(buf, { rect, period, W = 512, hair = '#15110F', seed = 21, rough = 0.8 } = {}) {
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
    const n = fieldNormal(f, sx, sy, 1.5);
    buf.normal[q] = clampB((n[0] * 0.5 + 0.5) * 255); buf.normal[q + 1] = clampB((n[1] * 0.5 + 0.5) * 255); buf.normal[q + 2] = clampB((n[2] * 0.5 + 0.5) * 255);
    buf.orm[q] = 255; buf.orm[q + 1] = clampB((rough + 0.2 * (1 - hv)) * 255); buf.orm[q + 2] = HAIR_METAL;
  }
  return f;
}

/** Tufts for cards: V = 1 (bottom of the rect) is the root, dense; V = 0 the loose tips. */
export function paintCoilFringe(buf, { rect, W = 512, hair = '#15110F', seed = 33, rough = 0.8 } = {}) {
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
    const shade = mix(1, 0.72, root);                              // roots sit in shade
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = clampB(col[0] * shade); buf.base[o + 1] = clampB(col[1] * shade); buf.base[o + 2] = clampB(col[2] * shade);
    const solid = hv > 0.1 || root > 0.92;
    buf.base[o + 3] = solid ? 255 : 2;
    const q = ((y0 + y) * W + x0 + x) * 3;
    const n = fieldNormal(f, x, y, 1.3);
    buf.normal[q] = clampB((n[0] * 0.5 + 0.5) * 255); buf.normal[q + 1] = clampB((n[1] * 0.5 + 0.5) * 255); buf.normal[q + 2] = clampB((n[2] * 0.5 + 0.5) * 255);
    buf.orm[q] = 255; buf.orm[q + 1] = clampB((rough + 0.18 * (1 - hv)) * 255); buf.orm[q + 2] = HAIR_METAL;
  }
  // fix round 1 (A-wrap-closed): below the tips every strand is a texel fatter (the runtime's mipmaps average a thin strand's alpha
  // under the 0.5 cut at 0.8 m, which opened pinholes the full-size texture does not have); then a pocket of air shut inside the coil
  // mass (not open to the tips) is filled with shaded hair, so a card against the sky shows a broken outline but no pinhole of sky
  {
    const clear = (x, y) => buf.base[((y0 + y) * W + x0 + x) * 4 + 3] < 128;
    const solidAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !clear(x, y);
    const fillAt = (x, y) => {
      const o = ((y0 + y) * W + x0 + x) * 4, shade = mix(0.6, 0.45, smooth(0.55, 1, y / h));
      buf.base[o] = clampB(C[0] * shade + 6); buf.base[o + 1] = clampB(C[1] * shade + 4); buf.base[o + 2] = clampB(C[2] * shade + 3); buf.base[o + 3] = 255;
    };
    const fat = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (!clear(x, y) || y < h * 0.22) continue;
      if (solidAt(x - 1, y) || solidAt(x + 1, y) || solidAt(x, y - 1) || solidAt(x, y + 1)) fat.push(x, y);
    }
    for (let i = 0; i < fat.length; i += 2) fillAt(fat[i], fat[i + 1]);
    // open only to the tips: a card's window is a narrower slice of this rect, so a pocket open only to the rect's side is shut in it
    const open = new Uint8Array(w * h), st = [];
    const push = (x, y) => { const s = y * w + x; if (!open[s] && clear(x, y)) { open[s] = 1; st.push(s); } };
    for (let x = 0; x < w; x++) push(x, 0);
    while (st.length) { const s = st.pop(), x = s % w, y = (s / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!open[y * w + x] && clear(x, y)) fillAt(x, y);
  }
  return f;
}

/** The opaque coil surface of a lock, repeating; the flow runs along V. */
export function paintLockTile(buf, { rect, period, W = 512, hair = '#15110F', seed = 47, rough = 0.84 } = {}) {
  const [x0, y0, w, h] = rect;
  const f = coilField(period, period, { count: 260, seed, r: [3.2, 5.4], len: [12, 26], axisSpread: 0.3, strand: [1, 1.4] });
  const C = hex(hair);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x % period, sy = y % period, s = sy * period + sx;
    const col = coilColour(f.h[s], f.tone[s], C);
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = clampB(col[0]); buf.base[o + 1] = clampB(col[1]); buf.base[o + 2] = clampB(col[2]); buf.base[o + 3] = 255;
    const q = ((y0 + y) * W + x0 + x) * 3;
    const n = fieldNormal(f, sx, sy, 1.6);
    buf.normal[q] = clampB((n[0] * 0.5 + 0.5) * 255); buf.normal[q + 1] = clampB((n[1] * 0.5 + 0.5) * 255); buf.normal[q + 2] = clampB((n[2] * 0.5 + 0.5) * 255);
    buf.orm[q] = 255; buf.orm[q + 1] = clampB((rough + 0.2 * (1 - f.h[s])) * 255); buf.orm[q + 2] = HAIR_METAL;
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
export function hairlineLayer({ coverage, sampler, flowUV, hair = '#15110F', skinShadow = 0.72, heightM = 0.00022 } = {}) {
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
    const edge = smooth(0.36, 0.72, c + (hv - 0.42) * 0.85);
    if (edge <= 0) return;
    const col = coilColour(hv, tv, C);
    T.r = mix(T.r, col[0] * 1.05, edge); T.g = mix(T.g, col[1] * 1.05, edge); T.b = mix(T.b, col[2] * 1.05, edge);
    T.h += edge * hv * heightM;
    T.rough = mix(T.rough, 0.84 + 0.12 * (1 - hv), edge);
    T.metal = mix(T.metal, 0.18, edge);           // near-black coils: at the dielectric 4 % a strong sun turns them grey (the material's metal factor is 1)
    T.ao = mix(T.ao, Math.max(T.ao, 0.62), edge);  // the hair is lit by its own crowns: no black band under the hem
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
export function coilCards(anchors, { flow, skinOf, length = [0.014, 0.024], width = [0.012, 0.02], liftTip = [0.003, 0.0075], rect, W = 512, seed = 9, twoSided = false } = {}) {
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
    // the coil field's own scale (0.3 mm per texel), so a coil stays round on any card
    const windowW = Wd / 0.0003, windowH = L / 0.0003;
    const u0 = rect[0] + R() * (rect[2] - windowW - 1);
    const vTop = rect[1] + 14 + R() * Math.max(0, rect[3] - windowH - 16);
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
        g.uv.push((u0 + k * windowW) / W, (vTop + (1 - t) * windowH) / W);
        g.jnt.push(...skin.j); g.wgt.push(...skin.w);
        const shade = mix(0.74, 1, t);
        g.col.push(shade, shade, shade, 1);
      }
    }
    for (let r = 0; r < 2; r++) {
      const a0 = base + r * 2;
      g.idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
    // `twoSided`: the card's back as well (its own vertices, the normal turned): a card standing off the scalp is seen from behind
    // through another card's air, and FrontSide would cull it, leaving a pinhole of sky in the hair
    if (twoSided) {
      const b2 = g.pos.length / 3;
      for (let i = 0; i < 6; i++) {
        const v = base + i;
        g.pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]); g.nrm.push(-g.nrm[v * 3], -g.nrm[v * 3 + 1], -g.nrm[v * 3 + 2]);
        g.uv.push(g.uv[v * 2], g.uv[v * 2 + 1]); g.jnt.push(...g.jnt.slice(v * 4, v * 4 + 4)); g.wgt.push(...g.wgt.slice(v * 4, v * 4 + 4)); g.col.push(...g.col.slice(v * 4, v * 4 + 4));
      }
      for (let r = 0; r < 2; r++) { const a0 = b2 + r * 2; g.idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
    }
  }
  return g;
}

/**
 * The knot tail as `count` twisted locks of coil round the chain: each lock winds about
 * the chain's axis and tapers to its own tip. Skinned along `joints` exactly as a tube
 * would be (A33-hair-bounce reads the chain, not the mesh).
 */
export function coilLocks(P, joints, { count = 5, ring = 4, along = 9, spread = 0.0105, radius = 0.0078, twist = 2.4, uv, W = 512, seed = 13, side = [1, 0, 0], period = 96 } = {}) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] };
  const pl = polyline(P);
  const R = rng(seed * 16777619);
  const [rx, ry] = uv.rect;
  const ringAt = (c, a, ph, taper, rad, uOff, v) => {
    const u = (a / along) * taper;
    const { p, t, seg, f } = pl.at(u);
    const sd = norm(sub(side, mul(t, dot(side, t))));
    const up = cross(t, sd);
    const ang = ph + twist * u * TAU;
    const sprd = spread * (0.75 + 0.6 * u) * (1 - 0.35 * smooth(0.7, 1, u));
    const cen = add(p, add(mul(sd, Math.cos(ang) * sprd), mul(up, Math.sin(ang) * sprd)));
    const r0 = rad * (1 - 0.62 * smooth(0.25, 1, a / along)) + 0.0007;
    const n1 = joints.length;
    const ja = joints[Math.min(seg, n1 - 1)], jb = joints[Math.min(seg + 1, n1 - 1)];
    const wb = seg + 1 >= n1 ? 0 : f;
    for (let r = 0; r <= ring; r++) {
      const th = (r / ring) * TAU;
      const nn = add(mul(sd, Math.cos(th)), mul(up, Math.sin(th)));
      g.pos.push(...add(cen, mul(nn, r0)));
      g.nrm.push(...nn);
      g.uv.push((rx + uOff + (r / ring) * period * 0.5) / W, (ry + v) / W);
      g.jnt.push(ja, jb, 0, 0); g.wgt.push(1 - wb, wb, 0, 0);
    }
  };
  for (let c = 0; c < count; c++) {
    const ph = (c / count) * TAU + R() * 0.5;
    const taper = 0.72 + R() * 0.28;
    const rad = radius * (0.8 + 0.4 * R());
    const uOff = R() * period * 0.45;
    for (let a = 0; a < along; a++) {
      // each segment re-reads the coil tile at its own scale, so coils stay round down the lock
      const base = g.pos.length / 3;
      const v0 = R() * (period * 0.2);
      ringAt(c, a, ph, taper, rad, uOff, v0);
      ringAt(c, a + 1, ph, taper, rad, uOff, v0 + period * 0.78);
      for (let r = 0; r < ring; r++) {
        const i0 = base + r, i1 = i0 + 1, i2 = base + ring + 1 + r, i3 = i2 + 1;
        g.idx.push(i0, i1, i2, i1, i3, i2);
      }
    }
  }
  return g;
}

/**
 * A tuft of coils on a dyn_ chain: `count` strips crossing on the chain's axis (a star in
 * section), UV'd at the coil field's own scale, repeating down the chain. The
 * COLOR_0 alpha falls toward each strip's edges and tip, and the alpha cut opens between the
 * coils there: the outline is individual coils, not a card edge. No rope, no braid.
 * uv: { rect, period, W } (the coil tile); mPerPx = the tile's scale.
 */
export function coilTuft(P, joints, { count = 3, along = 7, width = 0.03, side = [1, 0, 0], uv, seed = 13, mPerPx = 0.0003, taper = 0.3 } = {}) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [], col: [] };
  const pl = polyline(P);
  const R = rng(seed * 16777619);
  const [rx, ry] = uv.rect, per = uv.period, W = uv.W;
  const skinAt = (seg, f) => {
    const n = joints.length;
    const a = joints[Math.min(seg, n - 1)], b = joints[Math.min(seg + 1, n - 1)], wb = seg + 1 >= n ? 0 : f;
    return { j: [a, b, 0, 0], w: [1 - wb, wb, 0, 0] };
  };
  for (let c = 0; c < count; c++) {
    const rot0 = (c / count) * Math.PI + (R() - 0.5) * 0.3;
    const u0 = R() * (per - 110), lenMul = 0.82 + 0.18 * R();
    const segPx = pl.total * lenMul / along / mPerPx;
    const emit = (a, v) => {
      const u = (a / along) * lenMul;
      const { p, t, seg, f } = pl.at(u);
      const sd0 = norm(sub(side, mul(t, dot(side, t))));
      const up0 = cross(t, sd0);
      const rot = rot0 + 0.5 * u;
      const sd = add(mul(sd0, Math.cos(rot)), mul(up0, Math.sin(rot)));
      const nn = norm(cross(t, sd));
      const lump = 1 + 0.22 * Math.sin(a * 2.3 + c * 2.1);
      const w = width * lump * (0.62 + 0.38 * smooth(0, 0.18, u)) * (1 - taper * smooth(0.5, 1, u));
      const sk = skinAt(seg, f);
      for (let k = 0; k <= 2; k++) {
        const x = k - 1;
        const q = add(p, add(mul(sd, x * w * 0.5), mul(nn, 0.0028 * (1 - x * x))));
        g.pos.push(...q);
        g.nrm.push(...norm(add(nn, mul(sd, x * 0.7))));
        g.uv.push((rx + u0 + (k / 2) * (w / mPerPx)) / W, (ry + v) / W);
        g.jnt.push(...sk.j); g.wgt.push(...sk.w);
        const edgeA = k === 1 ? 1 : 0.58;
        const tipA = 1 - 0.44 * smooth(0.5, 1, a / along);
        const sh = mix(0.5, 1, smooth(0, 0.3, a / along));
        g.col.push(sh, sh, sh, edgeA * tipA);
      }
    };
    for (let a = 0; a < along; a++) {
      // each segment reads its own window of the coil tile
      const base = g.pos.length / 3;
      const v0 = R() * Math.max(0, 255 - segPx);
      emit(a, v0); emit(a + 1, v0 + segPx);
      for (let k = 0; k < 2; k++) g.idx.push(base + k, base + k + 1, base + 3 + k, base + k + 1, base + 3 + k + 1, base + 3 + k);
    }
  }
  return g;
}

/* ================================================================= brows */

/**
 * Brows painted hair by hair over a soft mass. `line(x)` -> { y, half } gives the brow's centre and
 * half height along x (bind metres). Hairs grow from the lower edge up and out, herringbone: the
 * lower ones lean up, the upper ones lie down onto them, so the brow has a combed top edge and no
 * scratches. The inner end stands up and feathers; the outer third lies along the brow and tapers
 * to a point. `scar` (a segment) parts the hairs along it. Each hair only tests texels in its box.
 */
export function browLayer({ x0, x1, line, strokes = 260, seed = 17, hair = '#15110F', scar = null, side = 1, width = 0.00029, length = [0.0032, 0.0052], mass = 0.5 } = {}) {
  const R = rng(seed * 374761393);
  const list = [];
  const seg = (a, b, p) => {
    const ax = b[0] - a[0], ay = b[1] - a[1];
    const t = clamp01(((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / (ax * ax + ay * ay));
    return Math.hypot(p[0] - (a[0] + ax * t), p[1] - (a[1] + ay * t));
  };
  // f: 0 inner end, 1 outer tail. The brow's own height tapers along it
  const fOf = (x) => clamp01((x - x0) / (x1 - x0));
  const taper = (f) => mix(0.84, 0.98, smooth(0, 0.18, f)) * mix(1, 0.32, smooth(0.5, 1, f));
  const scarD = 0.0019;
  for (let n = 0; n < strokes; n++) {
    const f = Math.pow(R(), 0.86);                       // a little denser toward the inner two thirds
    const x = mix(x0, x1, f);
    const { y, half } = line(x);
    const hh = half * taper(f);
    const v = R() * 2 - 1;                                // -1 lower edge, +1 top edge
    const yy = y + v * hh * 0.8;
    // the inner hairs stand, the outer ones lie along the brow; the top rows comb down onto the rest
    const base = mix(1.02, 0.1, smooth(0.04, 0.5, f));
    const ang = base + (v > 0 ? -0.42 * v : 0.12 * -v) + (R() - 0.5) * 0.22;
    const dirX = side * Math.cos(ang), dirY = Math.sin(ang);
    const L = mix(length[0], length[1], R()) * mix(0.74, 1, smooth(0, 0.22, f)) * mix(1, 0.7, smooth(0.78, 1, f));
    const a = [x - dirX * L * 0.5, yy - dirY * L * 0.5], b = [x + dirX * L * 0.5, yy + dirY * L * 0.5];
    if (scar) {
      // the scar cuts the brow clean: no hair crosses it, anywhere along the hair
      let near = 9;
      for (let q = 0; q <= 4; q++) near = Math.min(near, seg(scar.a, scar.b, [mix(a[0], b[0], q / 4), mix(a[1], b[1], q / 4)]));
      if (near < scarD) continue;
    }
    list.push({ a, b, w: width * (0.82 + 0.44 * R()), d: 0.7 + 0.3 * R(), warm: R() });
  }
  const C = hex(hair);
  const W0 = [C[0] + 34, C[1] + 22, C[2] + 15];
  const bx0 = Math.min(x0, x1) - 0.008, bx1 = Math.max(x0, x1) + 0.008;
  let by0 = 9, by1 = -9;
  for (const s of list) { by0 = Math.min(by0, s.a[1], s.b[1]); by1 = Math.max(by1, s.a[1], s.b[1]); }
  by0 -= 0.002; by1 += 0.002;
  const xLo = Math.min(x0, x1), xHi = Math.max(x0, x1);
  return (T) => {
    if (T.X < bx0 || T.X > bx1 || T.Y < by0 || T.Y > by1 || T.nz < 0.05) return;
    // the soft mass: darkest along the brow's middle, gone before the hair tips
    const f = fOf(Math.max(xLo, Math.min(xHi, T.X)));
    const { y, half } = line(Math.max(xLo, Math.min(xHi, T.X)));
    const hh = half * taper(f);
    const inX = 1 - smooth(0, 0.0032, Math.max(xLo - T.X, T.X - xHi));
    const nearScar = scar ? 1 - smooth(scarD * 0.7, scarD * 1.25, seg(scar.a, scar.b, [T.X, T.Y])) : 0;
    const body = (1 - smooth(hh * 0.3, hh * 1.05, Math.abs(T.Y - y + 0.00025))) * inX * (1 - nearScar) * mix(0.85, 1, noise3(T.X * 900, T.Y * 900, 1.3));
    const sk = 1 - body * mass;
    T.r = mix(T.r, C[0] * 1.9, body * mass); T.g = mix(T.g, C[1] * 1.9, body * mass); T.b = mix(T.b, C[2] * 1.9, body * mass);
    void sk;
    let best = 0, warm = 0;
    for (const s of list) {
      if (T.X < Math.min(s.a[0], s.b[0]) - s.w * 2 || T.X > Math.max(s.a[0], s.b[0]) + s.w * 2 || T.Y < Math.min(s.a[1], s.b[1]) - s.w * 2 || T.Y > Math.max(s.a[1], s.b[1]) + s.w * 2) continue;
      const ax = s.b[0] - s.a[0], ay = s.b[1] - s.a[1];
      const t = clamp01(((T.X - s.a[0]) * ax + (T.Y - s.a[1]) * ay) / (ax * ax + ay * ay));
      const d = Math.hypot(T.X - (s.a[0] + ax * t), T.Y - (s.a[1] + ay * t));
      const tip = mix(1, 0.5, t);
      const k = (1 - smooth(s.w * 0.45 * tip, s.w * 1.5 * tip, d)) * s.d;
      if (k > best) { best = k; warm = s.warm; }
    }
    if (best > 0) {
      const cr = mix(C[0], W0[0], warm), cg = mix(C[1], W0[1], warm), cb = mix(C[2], W0[2], warm);
      T.r = mix(T.r, cr, best); T.g = mix(T.g, cg, best); T.b = mix(T.b, cb, best);
      T.h += best * 0.00014;
      T.rough = mix(T.rough, 0.58, best);
    }
  };
}

/* ================================================================ lashes */

/**
 * Upper lash cards along a lid (open = lib/skin eyeOpening). `segments` quads following the
 * margin, leaning up and forward, UVs running along the lash cell; `zAt(x, y)` gives the lid's
 * surface depth. Rigid on `joint`. Returns a geometry bucket with COLOR_0.
 */
export function lashCard(open, { side, joint, zAt, segments = 7, length = 0.0062, W = 512, rect, lean = 0.62, rim = null, twoSided = false, curl = 0 } = {}) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [], col: [] };
  const inner = side > 0 ? open.x0 : open.x1, outer = side > 0 ? open.x1 : open.x0;
  // fix round 2 (the judges: "no lash hairs in profile, only a dark lid line"; "no upper-lid thickness"): `rim` adds a row BELOW
  // the margin, lying on the ball (`rim.onBall(p)` puts a point on it) and mapped to the lid-margin cell `rim.rect`: the upper lid's
  // thickness and its dark lash line over the white, tapering into both corners. `curl` bends the lashes forward past the lid, so
  // a profile finds them as a fringe of hair; `twoSided` gives the card its back, so they read from behind the eye's plane too.
  const rows = rim ? 3 : 2;
  for (let i = 0; i <= segments; i++) {
    const f = 0.06 + 0.98 * (i / segments);
    const x = inner + (outer - inner) * Math.min(1.02, f);
    const y = open.upper(Math.max(Math.min(open.x0, open.x1), Math.min(Math.max(open.x0, open.x1), x)));
    const z = zAt(x, y);
    // longest at two thirds, short and thin into the outer corner: from the side a lash is hair, not a slab
    // (fix round 1: the outer corner splays less and ends shorter, so the far eye's lashes do not stand past the cheek against the sky)
    // (fix round 2: with the lashes now curling forward on a two-sided card, the outer third shortens sooner and splays less, and its
    // curl fades: the far eye's outer lashes stand at the temple's outline from a 3/4, and must not shut pockets of sky against it)
    const L = length * mix(0.62, 1.04, smooth(0.0, 0.5, f)) * mix(1, 0.34, smooth(0.55, 1.0, f));
    const out = side * mix(0.02, 0.3, f);
    const up = [out * 0.8, Math.cos(lean * 0.72), Math.sin(lean) + curl * (1 - 0.8 * smooth(0.45, 0.95, f))];
    const ul = Math.hypot(up[0], up[1], up[2]);
    const a = [x, y + 0.0001, z + 0.0002], b = [x + up[0] / ul * L, y + up[1] / ul * L, z + up[2] / ul * L];
    const n = norm([0, -0.35, 1]);
    const u = rect[0] + (i / segments) * (rect[2] - 1);
    if (rim) {
      const taper = smooth(0.0, 0.2, f) * (1 - smooth(0.86, 1.04, f));
      const r = rim.onBall([x, y - rim.h * mix(0.35, 1, taper), z - rim.h * 0.2]);
      const ur = rim.rect[0] + (i / segments) * (rim.rect[2] - 1);
      g.pos.push(...r); g.nrm.push(...norm([0, 0.2, 1])); g.uv.push(ur / W, (rim.rect[1] + rim.rect[3] - 1) / W);
      g.jnt.push(joint, 0, 0, 0); g.wgt.push(1, 0, 0, 0); g.col.push(0.82, 0.82, 0.82, 1);
      // the margin row carries the rim cell's top edge: a duplicate of the lash root with the rim's UV
      g.pos.push(...a); g.nrm.push(...norm([0, 0.2, 1])); g.uv.push(ur / W, rim.rect[1] / W);
      g.jnt.push(joint, 0, 0, 0); g.wgt.push(1, 0, 0, 0); g.col.push(1, 1, 1, 1);
    }
    g.pos.push(...a, ...b); g.nrm.push(...n, ...n);
    g.uv.push(u / W, (rect[1] + rect[3] - 1) / W, u / W, rect[1] / W);
    g.jnt.push(joint, 0, 0, 0, joint, 0, 0, 0); g.wgt.push(1, 0, 0, 0, 1, 0, 0, 0);
    g.col.push(1, 1, 1, 1, 1, 1, 1, 1);
  }
  const stride = rim ? 4 : 2;
  const quad = (a, b, c, d, back) => { if ((side > 0) !== back) g.idx.push(a, c, b, b, c, d); else g.idx.push(a, b, c, b, d, c); };
  for (let i = 0; i < segments; i++) {
    const o = i * stride, p = o + stride;
    const lr = rim ? 2 : 0;
    quad(o + lr, o + lr + 1, p + lr, p + lr + 1, false);
    if (rim) quad(o, o + 1, p, p + 1, false);
  }
  void rows;
  if (twoSided) {
    // the lashes' back faces (their own vertices, the normals turned); the rim lies on the ball and is only ever seen from the front
    const nV = g.pos.length / 3, map = new Int32Array(nV).fill(-1);
    for (let i = 0; i <= segments; i++) for (const k of [rim ? 2 : 0, rim ? 3 : 1]) {
      const v = i * stride + k;
      map[v] = g.pos.length / 3;
      g.pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]); g.nrm.push(-g.nrm[v * 3], -g.nrm[v * 3 + 1], -g.nrm[v * 3 + 2]);
      g.uv.push(g.uv[v * 2], g.uv[v * 2 + 1]); g.jnt.push(joint, 0, 0, 0); g.wgt.push(1, 0, 0, 0); g.col.push(1, 1, 1, 1);
    }
    const lr = rim ? 2 : 0;
    for (let i = 0; i < segments; i++) { const o = i * stride + lr, p = o + stride; quad(map[o], map[o + 1], map[p], map[p + 1], true); }
  }
  return g;
}

/**
 * The upper lid's margin cell (fix round 2): the lid's thickness seen over the ball. Top row (at the margin): the lash line, a
 * near-black warm brown; down to a warm dark brown where it lies on the white; its lower edge wavers by a texel (lash roots, not a
 * ruled liner) and its last row is wet, a little lighter and smooth.
 */
export function paintLidRim(buf, { rect, W = 512, ink = '#1C120E', lid = '#3E271D', seed = 71 } = {}) {
  const [x0, y0, w, h] = rect;
  const I = hex(ink), Ld = hex(lid);
  const R = rng(seed * 2246822519);
  const jag = []; for (let x = 0; x < w; x++) jag.push(R());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / (h - 1);
    const edge = h - 1 - (jag[x] > 0.7 ? 1 : 0);
    const k = smooth(0.15, 0.85, t);
    let r = mix(I[0], Ld[0], k), g = mix(I[1], Ld[1], k), b = mix(I[2], Ld[2], k);
    // (fix round 2, read on the 08:00 frame: a wet, smooth last row caught the low sun as a white liner along the lid; it is a lid's
    // margin in its own shade, a touch lighter at its edge and no shinier than skin)
    const wet = y >= edge - 1 ? 1.08 : 1;
    r *= wet; g *= wet; b *= wet;
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = clampB(r); buf.base[o + 1] = clampB(g); buf.base[o + 2] = clampB(b); buf.base[o + 3] = y <= edge ? 255 : 2;
    const q = ((y0 + y) * W + x0 + x) * 3;
    buf.normal[q] = 128; buf.normal[q + 1] = clampB(128 + 40 * (t - 0.5)); buf.normal[q + 2] = 250;
    buf.orm[q] = 255; buf.orm[q + 1] = clampB(mix(0.62, 0.5, t) * 255); buf.orm[q + 2] = 0;
  }
}

/** The lash cell: tapered curved hairs, root at the bottom, near-black, a hard alpha. */
export function paintLashes(buf, { rect, W = 512, hair = '#0E0A09', seed = 61, rough = 0.7 } = {}) {
  const [x0, y0, w, h] = rect;
  const R = rng(seed * 2654435761);
  const cov = new Float32Array(w * h);
  const n = Math.floor(w / 1.7);
  for (let i = 0; i < n; i++) {
    const xr = (i + R()) * w / n;
    const xf = xr / w;
    // the lash thins toward its ends: a soft fan at the inner corner, separate hairs at the outer one
    if (R() > mix(0.5, 1, smooth(0, 0.22, xf)) * mix(1, 0.34, smooth(0.62, 1, xf))) continue;
    // (fix round 2: the strands fan but never cross, so no view of a card closes a pocket of sky between two of them: A-wrap-closed)
    const lean = (R() - 0.5) * 0.9 + (xf - 0.5) * 9;
    const L = h * (0.58 + 0.42 * R());
    const steps = Math.ceil(L * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = xr + lean * t * t, y = h - 1 - t * L;
      const rad = mix(0.86, 0.3, t);
      for (let yy = Math.floor(y - rad); yy <= Math.ceil(y + rad); yy++) for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        cov[yy * w + xx] = Math.max(cov[yy * w + xx], clamp01(1.2 - d / rad));
      }
    }
  }
  // (fix round 2: the roots are a solid band, the lid's lash line: every gap between two lashes is open at the tips, so no view of
  // the card shuts a pocket of sky between the lashes and the lid)
  for (let y = h - 4; y < h; y++) for (let x = 0; x < w; x++) cov[y * w + x] = 1;
  const C = hex(hair);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = C[0]; buf.base[o + 1] = C[1]; buf.base[o + 2] = C[2];
    buf.base[o + 3] = cov[y * w + x] > 0.3 ? 255 : 2;
    const q = ((y0 + y) * W + x0 + x) * 3;
    buf.normal[q] = 128; buf.normal[q + 1] = 128; buf.normal[q + 2] = 255;
    buf.orm[q] = 255; buf.orm[q + 1] = clampB(rough * 255); buf.orm[q + 2] = 0;
  }
  // fix round 1 (A-wrap-closed): where two lashes cross, the air they shut in is lash too (from the side the far eye's lashes stand
  // against the sky, and a pocket between them read as a pinhole of background)
  const open = new Uint8Array(w * h), st = [];
  const clear = (x, y) => cov[y * w + x] <= 0.3;
  const push = (x, y) => { const s2 = y * w + x; if (!open[s2] && clear(x, y)) { open[s2] = 1; st.push(s2); } };
  for (let x = 0; x < w; x++) push(x, 0);
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const s2 = st.pop(), x = s2 % w, y = (s2 / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!open[y * w + x] && clear(x, y)) buf.base[((y0 + y) * W + x0 + x) * 4 + 3] = 255;
}
