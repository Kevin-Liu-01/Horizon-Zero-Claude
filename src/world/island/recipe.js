/**
 * ORCHIL — THE LANDFORM RECIPE (world-ground W1, bible §8).
 *
 * Pure functions of (x, z) with no THREE and no DOM, so the same code runs on the page,
 * in the terrain worker pool and in node (tools/build/ground/island-check.mjs proves the
 * site heights and the sight lines offline). Everything here is deterministic.
 *
 * W1 fidelity: the whole island at blockout (coast, shield, caldera, cones, barrancos,
 * the Flank wall) with THE PANS at full fidelity (salt field cell by cell, storm beach,
 * dunes, the Glass, the red crater, the Organ Shelf). Layers and scatter for biomes 2-6
 * start after `V-biome-vista-pans` (plan §3.1, the Pans-first rule).
 *
 * How the macro form is authored: a thin-plate spline through the CONTROL table below
 * (sites + ridges + valleys), the coast as a signed distance to a hand-drawn polygon,
 * then a site-residual pass and a sight-line pass bake into one 8 m grid. The two passes
 * are what let the gates be literal: every site lands at its stated height ±3 m
 * (`A-world-size`) and all ten trig rays stay open (`A-trig-pillars`) however the noise
 * above them is tuned.
 *
 * Authoring frame: (e, n) metres from the island's centre at 1024 m; engine x = e·S,
 * z = −n·S, where S = ISLAND_SCALE (extent.js).
 */
import { ISLAND_SCALE as S } from './extent.js';
import { SITES, TRIG, TRIG_TOP, SIGHT_PAIRS, SALT_FIELD as SF, CISTERN } from './sites.js';

export const BIOMES = Object.freeze(['pans', 'holds', 'malpais', 'cloudline', 'flank', 'caldera']);
export const SEA_LEVEL = 0;
/** The Glass stands a hand above the sea behind its barrier (bible §9.5). */
export const GLASS_LEVEL = 0.16;
/** The Glass as an ellipse, authored frame (`pools[0]`, the wading contract). */
export const GLASS = Object.freeze({ e: -384, n: -176, re: 39, rn: 30 });
/** The depth contour the current ring stands on (bible §8.1). */
export const CURRENT_DEPTH = 1.1;

/* ------------------------------------------------------------------ noise ---- */
function hash(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
/** fbm in 0..1. */
export function fbm(x, z, oct) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(x * f + o * 17.3, z * f - o * 9.1);
    n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}
/** Ridged fbm with a rounded crest (a corner is grid-aligned Nyquist on a 1.94 m mesh). */
function ridged(x, z, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    const n = vnoise(x * f, z * f) * 2 - 1;
    const v = 1 - Math.sqrt(n * n + 0.012);
    s += v * v * a;
    a *= 0.5; f *= 2.05;
  }
  return s;
}
export const ss = (e0, e1, x) => {
  const t = (x - e0) / (e1 - e0);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A small deterministic generator (never Math.random: the bake is byte-identical). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------- the coast ---- */
/**
 * The coast, clockwise from north, authored frame. Bible §8.2's layout read off row by
 * row and pulled inside the play radius so the current ring (the 1.1 m contour) always
 * stops her before the radial clamp does (`A-island-boundary`): r ≤ ≈ 465 m except the
 * storm beach under the Sounding Ring (r 472 is a site), whose sea floor drops faster.
 */
export const COAST = Object.freeze([
  [-30, 398], [70, 392], [165, 362], [255, 326], [322, 268], [385, 198], [432, 122],
  [456, 52], [462, -18], [452, -92], [428, -160], [372, -232], [305, -300], [228, -356],
  [140, -398], [40, -432], [-70, -444], [-140, -444], [-194, -428], [-262, -390],
  [-310, -358], [-351, -327], [-379, -288], [-401, -250], [-425, -212], [-441, -170],
  [-452, -110], [-448, -40], [-442, 30], [-430, 95], [-405, 160], [-360, 225],
  [-290, 285], [-205, 335], [-120, 375],
]);

/**
 * Macro controls [e, n, h]: the thin-plate spline's anchors, every SITE and TRIG added
 * below. Biome bands per bible §8.3 (Pans 0-8, Holds 20-90, Malpaís 20-145, Cloudline
 * 60-215, Flank 0-125, Caldera 160-245).
 */
const CONTROL = [
  // caldera: a high pumice floor, a rim high on the N-NE, breached low to the SE
  [20, 90, 212], [60, 70, 214], [-10, 60, 216], [50, 125, 217], [-20, 140, 214], [90, 95, 212],
  [70, 172, 245], [105, 165, 240], [20, 182, 228], [-30, 182, 218], [-70, 150, 214],
  [-92, 95, 224], [150, 92, 168], [158, 142, 176], [125, 40, 182], [70, -10, 182], [10, -25, 190],
  [-40, 0, 205], [-90, 10, 190],
  // cloudline: ridges falling N and NE, barrancos added as relief
  [0, 262, 182], [110, 268, 166], [40, 360, 66], [-50, 305, 118], [-40, 362, 28], [120, 335, 52],
  [190, 300, 44], [270, 275, 20], [305, 225, 34], [250, 200, 104], [190, 180, 122], [120, 215, 148],
  // malpais: a stepped lava shelf, the Rust Cone stands on its low side
  [170, 15, 160], [250, 40, 132], [330, 62, 66], [395, 62, 26], [370, 150, 24], [300, 130, 74],
  [350, -30, 34], [408, -70, 10], [345, -135, 14], [315, -215, 10], [240, -255, 16], [205, -190, 34],
  [150, -100, 84], [210, -95, 72], [100, -50, 148],
  // holds: terraces falling S from the caldera to the Scar's foot
  [40, -110, 118], [-40, -90, 112], [-70, -160, 62], [40, -210, 82], [130, -240, 44],
  [40, -320, 44], [130, -320, 22], [60, -395, 12], [-30, -310, 26], [-45, -390, 12],
  // flank: a low west bench, the wall rising behind it
  [-300, 0, 16], [-235, 55, 24], [-385, 60, 6], [-350, 130, 5], [-250, 225, 26], [-175, 275, 54],
  [-110, 335, 34], [-205, 100, 24], [-165, 105, 84], [-148, 112, 112], [-122, 118, 138],
  [-110, 210, 126], [-180, 195, 66], [-205, 165, 34], [-150, 20, 66], [-170, -40, 26], [-110, -30, 100],
  // pans: a flat coast plain, 0-8 m, rising to the Holds in the east
  [-300, -100, 6], [-225, -125, 8], [-150, -125, 16], [-110, -190, 18], [-190, -200, 5],
  [-340, -230, 1.6], [-250, -300, 1.4], [-185, -255, 3.5], [-135, -320, 7], [-120, -400, 3.5],
  [-60, -405, 5], [-300, -345, 1.2], [-420, -220, 1.2], [-430, -120, 2.5], [-410, -60, 2.5],
];

/* --------------------------------------------------------- the macro grids ---- */
const GN = 181;                // 8 m cells over ±720 m, authored frame
const GH = 720;
const GC = (GH * 2) / (GN - 1);
const M = {
  ready: false,
  h: null,      // macro height
  c: null,      // coast signed distance (+ inland)
  quiet: null,  // relief scale: 0 on a site or under a sight ray, 1 in open country
  b: null,      // 6 biome weights per cell, interleaved
};

function tps(controls) {
  // thin-plate spline, solved by Gaussian elimination (≈ 100 points: under 3 ms)
  const n = controls.length, N = n + 3;
  const A = new Float64Array(N * N), b = new Float64Array(N);
  const U = (r2) => (r2 > 1e-9 ? r2 * Math.log(r2) * 0.5 : 0);
  const sc = 1 / 500;
  for (let i = 0; i < n; i++) {
    const [xi, zi, hi] = controls[i];
    for (let j = 0; j < n; j++) {
      const dx = (xi - controls[j][0]) * sc, dz = (zi - controls[j][1]) * sc;
      A[i * N + j] = U(dx * dx + dz * dz);
    }
    A[i * N + i] += 0.0012;                // regularised: an exact fit rings between anchors
    A[i * N + n] = 1; A[i * N + n + 1] = xi * sc; A[i * N + n + 2] = zi * sc;
    A[(n) * N + i] = 1; A[(n + 1) * N + i] = xi * sc; A[(n + 2) * N + i] = zi * sc;
    b[i] = hi;
  }
  for (let c = 0; c < N; c++) {
    let p = c, best = Math.abs(A[c * N + c]);
    for (let r = c + 1; r < N; r++) { const v = Math.abs(A[r * N + c]); if (v > best) { best = v; p = r; } }
    if (p !== c) {
      for (let k = c; k < N; k++) { const t = A[c * N + k]; A[c * N + k] = A[p * N + k]; A[p * N + k] = t; }
      const t = b[c]; b[c] = b[p]; b[p] = t;
    }
    const d = A[c * N + c] || 1e-12;
    for (let r = c + 1; r < N; r++) {
      const f = A[r * N + c] / d;
      if (f === 0) continue;
      for (let k = c; k < N; k++) A[r * N + k] -= f * A[c * N + k];
      b[r] -= f * b[c];
    }
  }
  const w = new Float64Array(N);
  for (let r = N - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < N; k++) s -= A[r * N + k] * w[k];
    w[r] = s / (A[r * N + r] || 1e-12);
  }
  return (x, z) => {
    let s = w[n] + w[n + 1] * x * sc + w[n + 2] * z * sc;
    for (let i = 0; i < n; i++) {
      const dx = (x - controls[i][0]) * sc, dz = (z - controls[i][1]) * sc;
      s += w[i] * U(dx * dx + dz * dz);
    }
    return s;
  };
}

function polySigned(e, n) {
  // signed distance to the coast polygon: + inside
  let best = 1e12, inside = false;
  const P = COAST, L = P.length;
  for (let i = 0, j = L - 1; i < L; j = i++) {
    const ax = P[j][0], az = P[j][1], bx = P[i][0], bz = P[i][1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp01(((e - ax) * dx + (n - az) * dz) / (dx * dx + dz * dz));
    const ex = e - (ax + dx * t), ez = n - (az + dz * t);
    const d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
    if ((az > n) !== (bz > n) && e < ax + ((n - az) / (bz - az)) * (bx - ax)) inside = !inside;
  }
  const d = Math.sqrt(best);
  return inside ? d : -d;
}

let _coastLen = null;
/** Metres along the coast polygon of the nearest point (authored frame), for the surf's coordinates. */
function coastArc(e, n) {
  const P = COAST, L = P.length;
  if (!_coastLen) {
    _coastLen = new Float64Array(L + 1);
    for (let i = 0; i < L; i++) {
      const a = P[i], b = P[(i + 1) % L];
      _coastLen[i + 1] = _coastLen[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  let best = 1e12, arc = 0;
  for (let i = 0; i < L; i++) {
    const a = P[i], b = P[(i + 1) % L];
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = clamp01(((e - a[0]) * dx + (n - a[1]) * dz) / l2);
    const ex = e - (a[0] + dx * t), ez = n - (a[1] + dz * t), d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; arc = _coastLen[i] + t * (_coastLen[i + 1] - _coastLen[i]); }
  }
  return arc;
}

/** Biome cores [e, n, σ, weight]. Soft-partitioned on the 8 m grid, boundary-warped by noise. */
const CORES = [
  [[-300, -260, 120], [-200, -350, 90], [-400, -170, 90], [-135, -340, 62], [-280, -160, 78], [-90, -420, 44]],
  [[-10, -220, 100], [60, -300, 90], [90, -170, 70], [-40, -130, 62], [40, -390, 70], [150, -290, 62], [-20, -330, 70]],
  [[300, -50, 120], [350, 40, 110], [250, -170, 90], [390, 100, 80], [200, 10, 72], [330, -210, 70], [120, -50, 44]],
  [[100, 300, 110], [0, 350, 90], [250, 250, 100], [350, 190, 72], [-40, 270, 72], [180, 210, 60]],
  [[-300, 100, 130], [-400, 0, 110], [-200, 220, 110], [-120, 310, 70], [-300, -40, 90], [-150, 60, 62]],
  [[30, 90, 110], [-40, 130, 70], [100, 120, 62], [0, 30, 72], [60, 170, 56]],
];

function biomeCell(e, n, out) {
  const we = e + (fbm(e * 0.008 + 3, n * 0.008, 3) - 0.5) * 70;
  const wn = n + (fbm(e * 0.008, n * 0.008 + 11, 3) - 0.5) * 70;
  let sum = 0;
  for (let b = 0; b < 6; b++) {
    let v = 0;
    const list = CORES[b];
    for (let i = 0; i < list.length; i++) {
      const dx = we - list[i][0], dz = wn - list[i][1], s = list[i][2];
      const d2 = (dx * dx + dz * dz) / (s * s);
      if (d2 < 12) v += Math.exp(-d2);
    }
    v = v * v;                // sharpen: a border 40-60 m wide, not a smear
    out[b] = v; sum += v;
  }
  if (sum < 1e-6) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = 1; out[5] = 0; return; }
  for (let b = 0; b < 6; b++) out[b] /= sum;
}

function distToSeg(e, n, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp01(((e - ax) * dx + (n - az) * dz) / (dx * dx + dz * dz || 1));
  return { d: Math.hypot(e - (ax + dx * t), n - (az + dz * t)), t };
}

/** Build the macro grids. Pure and idempotent; costs ≈ 30 ms once per thread. */
export function ensureMacro(shared = null) {
  if (M.ready) return M;
  if (shared) {
    M.h = shared.h; M.c = shared.c; M.quiet = shared.quiet; M.b = shared.b;
    M.ready = true;
    return M;
  }
  const cells = GN * GN;
  M.h = new Float32Array(cells);
  M.c = new Float32Array(cells);
  M.quiet = new Float32Array(cells).fill(1);
  M.b = new Float32Array(cells * 6);
  const ctl = CONTROL.slice();
  for (const s of SITES) {
    if (s.id !== 'rust-cone' && s.id !== 'hornito-field') ctl.push([s.e, s.n, s.h]);
  }
  for (const t of TRIG) if (t.id !== 'T3' && t.id !== 'T1') ctl.push([t.e, t.n, t.h]);
  const spline = tps(ctl);
  const tmp = new Float64Array(6);
  for (let j = 0; j < GN; j++) {
    const n = -GH + j * GC;
    for (let i = 0; i < GN; i++) {
      const e = -GH + i * GC, o = j * GN + i;
      const c = polySigned(e, n);
      M.c[o] = c;
      M.h[o] = c > -30 ? spline(e, n) : 0;
      biomeCell(e, n, tmp);
      for (let b = 0; b < 6; b++) M.b[o * 6 + b] = tmp[b];
    }
  }
  // quiet ground: relief fades out on every site and under every sight ray
  const quietAt = (e, n, r0, r1) => {
    const i0 = Math.max(0, Math.floor((e - r1 + GH) / GC)), i1 = Math.min(GN - 1, Math.ceil((e + r1 + GH) / GC));
    const j0 = Math.max(0, Math.floor((n - r1 + GH) / GC)), j1 = Math.min(GN - 1, Math.ceil((n + r1 + GH) / GC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = ss(r0, r1, Math.hypot(-GH + i * GC - e, -GH + j * GC - n));
      const o = j * GN + i;
      if (k < M.quiet[o]) M.quiet[o] = k;
    }
  };
  for (const s of SITES) quietAt(s.e, s.n, 16, 64);
  for (const t of TRIG) quietAt(t.e, t.n, 8, 36);
  M.ready = true;

  /* The sight-line and site passes need the full height (with its stamps), so they run
   * on the finished grids. Order: rays first (they carve), then the sites (they anchor),
   * twice, because a Gaussian correction can nudge a neighbour. */
  const trig = Object.fromEntries(TRIG.map((t) => [t.id, t]));
  const rays = SIGHT_PAIRS.map(([a, b]) => {
    const A = trig[a], B = trig[b];
    return { ae: A.e, an: A.n, be: B.e, bn: B.n, ah: A.h + TRIG_TOP, bh: B.h + TRIG_TOP };
  });
  const anchorSites = () => {
    for (let it = 0; it < 3; it++) {
      for (const s of [...SITES, ...TRIG]) {
        if (s.id === 'T3' || s.id === 'T1') continue;   // the Cone's crest and the Shelf's top set these
        const res = s.h - heightAuthored(s.e, s.n);
        if (Math.abs(res) < 0.12) continue;
        const sig = s.biome === 'pans' ? 12 : s.biome === 'caldera' ? 11 : 20;
        const r1 = sig * 3;
        const i0 = Math.max(0, Math.floor((s.e - r1 + GH) / GC)), i1 = Math.min(GN - 1, Math.ceil((s.e + r1 + GH) / GC));
        const j0 = Math.max(0, Math.floor((s.n - r1 + GH) / GC)), j1 = Math.min(GN - 1, Math.ceil((s.n + r1 + GH) / GC));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const dx = -GH + i * GC - s.e, dz = -GH + j * GC - s.n;
          M.h[j * GN + i] += res * Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig));
        }
      }
    }
  };
  /* A ray's correction is low-passed before it lands on the grid: taken cell by cell it copies
   * the relief's noise onto an 8 m lattice, and that reads as a comb along the notch. */
  const carveDelta = new Float32Array(GN * GN);
  const carveTmp = new Float32Array(GN * GN);
  const carveRays = () => {
    for (const r of rays) {
      carveDelta.fill(0);
      const len = Math.hypot(r.be - r.ae, r.bn - r.an);
      const iLo = Math.max(1, Math.floor((Math.min(r.ae, r.be) - 56 + GH) / GC)), iHi = Math.min(GN - 2, Math.ceil((Math.max(r.ae, r.be) + 56 + GH) / GC));
      const jLo = Math.max(1, Math.floor((Math.min(r.an, r.bn) - 56 + GH) / GC)), jHi = Math.min(GN - 2, Math.ceil((Math.max(r.an, r.bn) + 56 + GH) / GC));
      for (let j = jLo; j <= jHi; j++) {
        const n = -GH + j * GC;
        for (let i = iLo; i <= iHi; i++) {
          const e = -GH + i * GC;
          const q = distToSeg(e, n, r.ae, r.an, r.be, r.bn);
          if (q.d > 40) continue;
          const along = q.t * len;
          if (along < 5 || along > len - 5) continue;
          const o = j * GN + i;
          const k = 1 - ss(12, 38, q.d);
          M.quiet[o] = Math.min(M.quiet[o], 1 - k);
          const cap = r.ah + (r.bh - r.ah) * q.t - 3.0 + Math.max(0, q.d - 12) * 2.1;
          const h = heightAuthored(e, n);
          if (h > cap) carveDelta[o] = (h - cap) * k;
        }
      }
      // one 3x3 max (never under-cut the bar), then two 3x3 box passes
      for (let j = jLo; j <= jHi; j++) for (let i = iLo; i <= iHi; i++) {
        const o = j * GN + i;
        let m = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) m = Math.max(m, carveDelta[o + b * GN + a]);
        carveTmp[o] = m;
      }
      for (let pass = 0; pass < 2; pass++) {
        const src = pass === 0 ? carveTmp : carveDelta, dst = pass === 0 ? carveDelta : carveTmp;
        for (let j = jLo; j <= jHi; j++) for (let i = iLo; i <= iHi; i++) {
          const o = j * GN + i;
          let t = 0;
          for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) t += src[o + b * GN + a];
          dst[o] = t / 9;
        }
      }
      for (let j = jLo; j <= jHi; j++) for (let i = iLo; i <= iHi; i++) {
        const o = j * GN + i;
        M.h[o] -= carveTmp[o];
      }
    }
  };
  anchorSites();
  carveRays();
  anchorSites();
  carveRays();
  carveRays();
  // a site or a pillar a ray's notch shouldered down (the Fundamental, 27 m from T3-T4) stands back up on a tight plug
  for (let it = 0; it < 3; it++) {
    for (const s of [...SITES, ...TRIG]) {
      if (s.id === 'T3' || s.id === 'T1') continue;
      const res = s.h - heightAuthored(s.e, s.n);
      if (Math.abs(res) < 0.8) continue;
      const i0 = Math.max(0, Math.floor((s.e - 24 + GH) / GC)), i1 = Math.min(GN - 1, Math.ceil((s.e + 24 + GH) / GC));
      const j0 = Math.max(0, Math.floor((s.n - 24 + GH) / GC)), j1 = Math.min(GN - 1, Math.ceil((s.n + 24 + GH) / GC));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = -GH + i * GC - s.e, dz = -GH + j * GC - s.n;
        M.h[j * GN + i] += res * Math.exp(-(dx * dx + dz * dz) / (2 * 8 * 8));
      }
    }
  }
  return M;
}

/** The grids, for handing to the worker pool (they are read-only from here on). */
export function macroShared() { ensureMacro(); return { h: M.h, c: M.c, quiet: M.quiet, b: M.b }; }

function bilinear(g, e, n) {
  const fx = (e + GH) / GC, fz = (n + GH) / GC;
  const ix = fx < 0 ? 0 : fx >= GN - 1 ? GN - 2 : fx | 0;
  const iz = fz < 0 ? 0 : fz >= GN - 1 ? GN - 2 : fz | 0;
  const tx = fx - ix, tz = fz - iz, o = iz * GN + ix;
  const a = g[o] + (g[o + 1] - g[o]) * tx;
  const b = g[o + GN] + (g[o + GN + 1] - g[o + GN]) * tx;
  return a + (b - a) * tz;
}

/** Catmull-Rom over the 8 m grid: C1, so the mesh shows no 8 m lattice. */
function bicubic(g, e, n) {
  const fx = (e + GH) / GC, fz = (n + GH) / GC;
  const ix = fx < 1 ? 1 : fx >= GN - 3 ? GN - 3 : fx | 0;
  const iz = fz < 1 ? 1 : fz >= GN - 3 ? GN - 3 : fz | 0;
  const tx = fx - ix, tz = fz - iz;
  const t2 = tx * tx, t3 = t2 * tx;
  const w0 = -0.5 * t3 + t2 - 0.5 * tx, w1 = 1.5 * t3 - 2.5 * t2 + 1;
  const w2 = -1.5 * t3 + 2 * t2 + 0.5 * tx, w3 = 0.5 * t3 - 0.5 * t2;
  let s = 0;
  const z2 = tz * tz, z3 = z2 * tz;
  const v0 = -0.5 * z3 + z2 - 0.5 * tz, v1 = 1.5 * z3 - 2.5 * z2 + 1;
  const v2 = -1.5 * z3 + 2 * z2 + 0.5 * tz, v3 = 0.5 * z3 - 0.5 * z2;
  let o = (iz - 1) * GN + ix - 1;
  s += v0 * (w0 * g[o] + w1 * g[o + 1] + w2 * g[o + 2] + w3 * g[o + 3]); o += GN;
  s += v1 * (w0 * g[o] + w1 * g[o + 1] + w2 * g[o + 2] + w3 * g[o + 3]); o += GN;
  s += v2 * (w0 * g[o] + w1 * g[o + 1] + w2 * g[o + 2] + w3 * g[o + 3]); o += GN;
  s += v3 * (w0 * g[o] + w1 * g[o + 1] + w2 * g[o + 2] + w3 * g[o + 3]);
  return s;
}

/* --------------------------------------------------------- the salt field ---- */
const FU = (e, n) => (e - SF.e) * SF.ue + (n - SF.n) * SF.un;
const FV = (e, n) => (e - SF.e) * SF.ve + (n - SF.n) * SF.vn;
/**
 * The dykes are hand-laid: long shallow bends, rows that are not quite parallel and cross
 * walls that lean, never a ruled brick pattern (the Janubio reference). Field coordinates
 * (U, W) are the straight frame the cells are cut in; `fieldUW` warps a real (u, v) into it,
 * `fieldInv` undoes that. Both warps have |slope| ≪ 1, so the map stays one-to-one.
 */
const skewV = (u, v) => 0.042 * u + 2.4 * Math.sin(u * 0.021 + 0.7)
  + 0.8 * Math.sin(u * 0.026 + v * 0.019 + 1.1) + 0.017 * u * Math.sin(v * 0.04 + 0.5);
const skewU = (u, v) => 0.075 * v * Math.sin(u * 0.037 + 1.0) + 0.9 * Math.sin(v * 0.06 + 2.0);
const _uv = { u: 0, v: 0 };
/** Field coords → real (u, v) along/across the field. Shared record: read at once. */
function fieldInv(U, W) {
  let u = U, v = W - skewV(U, W);
  for (let i = 0; i < 5; i++) { const u2 = U - skewU(u, v), v2 = W - skewV(u, v); u = u2; v = v2; }
  _uv.u = u; _uv.v = v;
  return _uv;
}
const FIELD_APRON = 42;  // metres over which the country falls to the field's floor
const WALL = 0.42;       // half width of an ordinary stone dyke, m
const DYKE = 1.25;       // half width of a walkable main dyke, m
const ROW_V = [-28, -14, 1, 15, 27, 39, 50, 59, 67, 75, 84];
/** Which row boundaries are main dykes (a raised walkable path). */
const MAIN_DYKE = new Set([2, 5]);

/** Cell fill kinds: the salt-pan ladder from sea water to raked crust. */
export const PAN = Object.freeze({ BRINE: 0, PINK: 1, WHITE: 2, CREAM: 3, RUST: 4, MUD: 5 });
/** Per fill: salt crust amount, brine (mirror) amount, hue (0 white .. 0.5 pink .. 1 rust). */
const FILL = [
  [0.10, 0.92, 0.28],     // BRINE  sea water on grey silt, nearly a mirror
  [0.44, 0.74, 0.50],     // PINK   evaporating, the bible's #D9B8B0
  [1.00, 0.04, 0.02],     // WHITE  raked crust
  [0.82, 0.12, 0.17],     // CREAM  crust with sand in it
  [0.34, 0.30, 0.98],     // RUST   crystallisers, red with halophiles
  [0.04, 0.34, 0.26],     // MUD    drained, wet black silt
];
/** Fill odds per row, sea to land [BRINE, PINK, WHITE, CREAM, RUST, MUD]. */
const ROW_ODDS = [
  [0.40, 0.34, 0.08, 0.06, 0.00, 0.12],
  [0.26, 0.40, 0.14, 0.12, 0.00, 0.08],
  [0.10, 0.30, 0.32, 0.22, 0.00, 0.06],
  [0.03, 0.14, 0.52, 0.27, 0.00, 0.04],
  [0.02, 0.12, 0.58, 0.24, 0.02, 0.02],
  [0.02, 0.12, 0.48, 0.26, 0.10, 0.02],
  [0.00, 0.10, 0.34, 0.24, 0.26, 0.06],
  [0.00, 0.08, 0.24, 0.22, 0.40, 0.06],
  [0.00, 0.06, 0.20, 0.20, 0.48, 0.06],
  [0.00, 0.06, 0.26, 0.20, 0.42, 0.06],
];
const ROW_W = [[26, 42], [24, 38], [22, 34], [20, 32], [18, 28], [16, 24], [12, 20], [10, 15], [9, 14], [9, 14]];

let _rows = null;
let _walls = null;
function buildField() {
  if (_rows) return;
  const R = rng(0x5a17f1e1);
  _rows = [];
  // Saltrow: the town the field wraps around (settlements W2 builds into this ellipse)
  const inTown = (u, v) => {
    const du = (u - 2) / 54, dv = (v - 84) / 34;
    return du * du + dv * dv < 1;
  };
  for (let r = 0; r < ROW_V.length - 1; r++) {
    const v0 = ROW_V[r], v1 = ROW_V[r + 1];
    const startJ = (R() - 0.5) * 16, endJ = (R() - 0.5) * 16;
    const uStart = SF.uMin + 4 + Math.abs(startJ) + r * 3.5, uEnd = SF.uMax - 4 - Math.abs(endJ) - r * 2.5;
    const cells = [];
    let u = uStart;
    while (u < uEnd - 6) {
      const [wMin, wMax] = ROW_W[r];
      let w = wMin + R() * (wMax - wMin);
      if (uEnd - (u + w) < wMin * 0.6) w = uEnd - u;
      const odds = ROW_ODDS[r];
      let p = R(), kind = 0;
      for (let k = 0; k < odds.length; k++) { p -= odds[k]; if (p <= 0) { kind = k; break; } kind = k; }
      const cu = u + w * 0.5, cv = (v0 + v1) * 0.5;
      const dry = (cu2, cv2) => {
        const q = fieldInv(cu2, cv2);
        return polySigned(SF.e + q.u * SF.ue + q.v * SF.ve, SF.n + q.u * SF.un + q.v * SF.vn) > 13;
      };
      const keep = !inTown(cu, cv) && !inTown(u, cv) && !inTown(u + w, cv)
        && dry(u, v0) && dry(u + w, v0) && dry(u, v1) && dry(u + w, v1);
      cells.push({
        u0: u, u1: u + w, v0, v1, kind, keep, seed: (R() * 65535) | 0,
        level: 0.62 + (r / 9) * 0.3 + (R() - 0.5) * 0.08,
      });
      u += w;
    }
    _rows.push({ v0, v1, cells });
  }
}

/** The cell at field coords (u, skewed v), or null. */
function cellAt(u, vw) {
  buildField();
  for (let r = 0; r < _rows.length; r++) {
    const row = _rows[r];
    if (vw < row.v0 || vw >= row.v1) continue;
    const cs = row.cells;
    for (let i = 0; i < cs.length; i++) {
      if (u >= cs[i].u0 && u < cs[i].u1) return cs[i].keep ? cs[i] : null;
    }
    return null;
  }
  return null;
}

const _pan = { inside: 0, edge: 9, salt: 0, brine: 0, hue: 0, level: 0, kind: -1 };
/**
 * The salt field at an authored point. `inside` is 1 well inside any cell, `edge` the
 * distance to its dyke (m, past the dyke's half width). Shared record: read immediately.
 */
export function panAt(e, n) {
  const P = _pan;
  P.inside = 0; P.edge = 9; P.salt = 0; P.brine = 0; P.hue = 0; P.level = 0; P.kind = -1;
  const u0 = FU(e, n), v0 = FV(e, n);
  if (u0 < SF.uMin - 8 || u0 > SF.uMax + 8 || v0 < SF.vMin - 16 || v0 > SF.vMax + 20) return P;
  const u = u0 + skewU(u0, v0), vw = v0 + skewV(u0, v0);
  const c = cellAt(u, vw);
  if (!c) return P;
  const ri = ROW_V.indexOf(c.v0);
  const wV0 = MAIN_DYKE.has(ri) ? DYKE : WALL, wV1 = MAIN_DYKE.has(ri + 1) ? DYKE : WALL;
  const d = Math.min(u - c.u0 - WALL, c.u1 - u - WALL, vw - c.v0 - wV0, c.v1 - vw - wV1);
  P.edge = d;
  P.inside = ss(-0.06, 0.2, d);
  const f = FILL[c.kind];
  // inside a cell the crust is never one flat value: wet patches, sand blown in, drag marks
  const wob = fbm(e * 0.09 + c.seed * 0.01, n * 0.09, 3) - 0.5;
  const fine = fbm(e * 0.42, n * 0.42 + c.seed * 0.02, 2) - 0.5;
  P.salt = clamp01(f[0] + wob * 0.5 + fine * 0.22);
  P.brine = clamp01(f[1] + wob * 1.05 - ss(0, 1.8, 2.2 - d) * 0.38);
  P.hue = clamp01(f[2] + wob * 0.34);
  P.level = c.level;
  P.kind = c.kind;
  return P;
}

/**
 * Every wall run of the field as [u0, vw, u1, vw] / [u, v0, u, v1] in field coords,
 * deduplicated, plus `main` for the walkable dykes. Used by the scatter (one instanced
 * draw) and by the mask bake's dark foot.
 */
export function fieldWalls() {
  if (_walls) return _walls;
  buildField();
  const out = [];
  // along-row boundaries: the union of the spans of the kept cells either side
  for (let b = 0; b < ROW_V.length; b++) {
    const spans = [];
    for (const ri of [b - 1, b]) {
      if (ri < 0 || ri >= _rows.length) continue;
      for (const c of _rows[ri].cells) if (c.keep) spans.push([c.u0, c.u1]);
    }
    spans.sort((p, q) => p[0] - q[0]);
    let cur = null;
    for (const s of spans) {
      if (cur && s[0] <= cur[1] + 0.2) cur[1] = Math.max(cur[1], s[1]);
      else { if (cur) out.push({ u0: cur[0], v0: ROW_V[b], u1: cur[1], v1: ROW_V[b], main: MAIN_DYKE.has(b) }); cur = s.slice(); }
    }
    if (cur) out.push({ u0: cur[0], v0: ROW_V[b], u1: cur[1], v1: ROW_V[b], main: MAIN_DYKE.has(b) });
  }
  // across-row boundaries: each kept cell's two ends
  const seen = new Set();
  for (const row of _rows) {
    for (const c of row.cells) {
      if (!c.keep) continue;
      for (const u of [c.u0, c.u1]) {
        const k = `${u.toFixed(2)}:${row.v0}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ u0: u, v0: row.v0, u1: u, v1: row.v1, main: false });
      }
    }
  }
  _walls = out;
  return out;
}

/** Field coords (u, skewed v) → engine (x, z). */
export function fieldToWorld(u, vw, out) {
  const q = fieldInv(u, vw);
  const e = SF.e + q.u * SF.ue + q.v * SF.ve, n = SF.n + q.u * SF.un + q.v * SF.vn;
  out.x = e * S; out.z = -n * S;
  return out;
}

/** Metres from (e, n) to the nearest kept cell of the field, capped at `reach`. */
function fieldDist(e, n, reach) {
  const u0 = FU(e, n), v0 = FV(e, n);
  if (u0 < SF.uMin - reach - 8 || u0 > SF.uMax + reach + 8 || v0 < SF.vMin - reach - 8 || v0 > SF.vMax + reach + 8) return reach;
  const u = u0 + skewU(u0, v0), vw = v0 + skewV(u0, v0);
  buildField();
  let best = reach;
  for (let r = 0; r < _rows.length; r++) {
    const row = _rows[r];
    if (vw < row.v0 - best || vw > row.v1 + best) continue;
    const cs = row.cells;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.keep) continue;
      const dx = Math.max(c.u0 - u, u - c.u1, 0), dv = Math.max(c.v0 - vw, vw - c.v1, 0);
      const d = Math.hypot(dx, dv);
      if (d < best) best = d;
    }
  }
  return best;
}

/** 0..1 how much of (e, n) belongs to the field: flat ground, dykes included. */
function fieldK(e, n) {
  const d = fieldDist(e, n, 12);
  return d >= 12 ? 0 : 1 - ss(0.6, 12, d);
}

/** Packed salt tracks + dyke paths [(e, n)...], bible §8.6: Saltrow's working paths. */
const TRACKS = [
  [[-268, -229], [-290, -262], [-303, -285], [-322, -310], [-340, -322]],
  [[-268, -229], [-232, -262], [-212, -300], [-196, -352], [-192, -400]],
  [[-268, -229], [-310, -200], [-352, -190]],
  [[-268, -229], [-205, -222], [-130, -214], [-60, -208], [-11, -213]],
];

let _trackSegs = null;
function trackAt(e, n) {
  if (!_trackSegs) {
    _trackSegs = [];
    for (const line of TRACKS) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        _trackSegs.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1],
          minx: Math.min(a[0], b[0]) - 5, maxx: Math.max(a[0], b[0]) + 5,
          minz: Math.min(a[1], b[1]) - 5, maxz: Math.max(a[1], b[1]) + 5 });
      }
    }
  }
  let f = 0;
  for (let i = 0; i < _trackSegs.length; i++) {
    const s = _trackSegs[i];
    if (e < s.minx || e > s.maxx || n < s.minz || n > s.maxz) continue;
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const t = clamp01(((e - s.ax) * dx + (n - s.az) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(e - (s.ax + dx * t), n - (s.az + dz * t));
    const wob = (vnoise(e * 0.07, n * 0.07) - 0.5) * 1.4;
    const v = 1 - ss(0.6, 1.9, d + wob);
    if (v > f) f = v;
  }
  return f;
}

/* ------------------------------------------------------- walkable ground at sites ---- */
/**
 * A site you can stand on and walk to (`A-reach-all-sites`: frozen nav.js blocks any 2 m cell
 * steeper than 45°). PADS level a small disc at the site's stated height and ease out to the
 * country. The Rust Cone's flanks stand at the angle of repose, so a cinder track climbs a third
 * of the way round it to T3 on the rim.
 */
const PADS = Object.freeze(['rust-cone', 'mistfold', 'pinned-cliff', 'the-fundamental', 'T4']
  .map((id) => [...SITES, ...TRIG].find((s) => s.id === id))
  .map((s) => ({ e: s.e, n: s.n, h: s.h, r0: s.id === 'pinned-cliff' || s.id === 'the-fundamental' ? 16 : 8, r1: s.id === 'pinned-cliff' || s.id === 'the-fundamental' ? 52 : 34 })));

function padHeight(e, n, h) {
  for (let i = 0; i < PADS.length; i++) {
    const P = PADS[i], dx = e - P.e, dz = n - P.n;
    if (dx > P.r1 || dx < -P.r1 || dz > P.r1 || dz < -P.r1) continue;
    const d = Math.hypot(dx, dz);
    if (d < P.r1) h += (P.h - h) * (1 - ss(P.r0, P.r1, d));
  }
  return h;
}

/* ---------------------------------------------------------- stamps (authored) ---- */
/** The Organ Shelf's plan: overlapping lobes [e, n, r], warped below (a lava flow's front, not a box). */
const SHELF_LOBES = [[-188, -351, 23], [-168, -346, 35], [-132, -362, 34], [-156, -386, 20], [-104, -338, 20], [-214, -372, 15]];
const CRATER = { e: -388, n: -160, R: 72, H: 41, squash: 1.5 };
const CONE = { e: 283, n: -101, r: 98, h: 146 };

/** Organ Shelf: signed distance inside its lobed plan, m (+ inside). */
function shelfD(e, n) {
  if (e < -280 || e > -40 || n < -440 || n > -270) return -60;
  // the flow front wanders: big lobes from the warp, small embayments from the second octave
  const we = e + (fbm(e * 0.021 + 3, n * 0.021, 2) - 0.5) * 34 + (fbm(e * 0.07, n * 0.07 + 8, 2) - 0.5) * 11;
  const wn = n + (fbm(e * 0.021, n * 0.021 + 13, 2) - 0.5) * 34 + (fbm(e * 0.07 + 5, n * 0.07, 2) - 0.5) * 11;
  // smooth union of the lobes (exponential smooth-min of the distances)
  let acc = 0;
  for (let i = 0; i < SHELF_LOBES.length; i++) {
    const L = SHELF_LOBES[i];
    acc += Math.exp(-(Math.hypot(we - L[0], wn - L[1]) - L[2]) / 7);
  }
  return acc > 1e-12 ? 7 * Math.log(acc) : -60;
}

/**
 * The half-eroded red tuff ring over the Glass (El Golfo, the wall behind Janubio): open to
 * the sea, a pale talus apron at its foot, a stratified cliff above that, a dark flat cap, a
 * long gentle back. Shared record: h metres above the country, k 0..1 how much of the ground
 * is the ring's (the tint), ti 0 at the inner foot .. 1 on the crest.
 */
const _cr = { h: 0, k: 0, ti: 0 };
function craterField(e, n) {
  const C = _cr;
  C.h = 0; C.k = 0; C.ti = 0;
  // an ellipse in plan, long E-W: from the pans it is a wall across the frame, not a peak
  const dx = (e - CRATER.e) / CRATER.squash, dz = n - CRATER.n;
  const d = Math.hypot(dx, dz);
  if (d > CRATER.R + 74 || d < 1) return C;
  const cs = dx / d, sn = dz / d;
  const cosN = cs * -0.32 + sn * 0.947;                   // 1 facing the wall's high side, N by W
  const open = ss(-0.46, 0.2, cosN + (fbm(e * 0.014, n * 0.014, 2) - 0.5) * 0.55);
  if (open <= 0) return C;
  const Rr = CRATER.R + (fbm(cs * 1.2 + 4, sn * 1.2, 3) - 0.5) * 18;
  // the crest runs nearly level, with the odd notch where a gully has eaten back
  const notch = ss(0.16, 0.36, ridged(cs * 5 + 7, sn * 5 + 2, 2));
  const Hr = CRATER.H * (0.92 + 0.14 * fbm(cs * 3.3 + 9, sn * 3.3 + 2, 2)) * (0.86 + 0.14 * notch) * open * (0.3 + 0.7 * ss(4, 66, coastD(e, n)));
  // the talus reaches out in fans
  const fan = (ridged(cs * 7 + 1, sn * 7 + 5, 2) - 0.3) * 0.16;
  const ti = clamp01((d - (Rr - 40)) / 40 + fan), to = clamp01((d - (Rr + 12)) / 52);
  let p;
  if (d <= Rr) p = 0.26 * ss(0, 0.66, ti) * (0.62 + 0.38 * ti * ti) + 0.74 * Math.pow(ss(0.5, 1, ti), 1.1);
  else if (d <= Rr + 12) p = 1 - 0.04 * (d - Rr) / 12;    // the flat cap
  else p = 0.96 * Math.pow(1 - to, 1.5);
  let hc = Hr * p;
  // gullies: V cuts down the wall, deepest mid-height, fainter on the back
  const g = ridged(cs * 13 + 11 + d * 0.012, sn * 13 + 3 + d * 0.012, 2);
  const cut = (g - 0.42) * (d <= Rr ? ss(0.1, 0.5, ti) * (1 - ss(0.78, 0.96, ti)) * 9 : ss(0.02, 0.3, to) * (1 - ss(0.6, 1, to)) * 6);
  hc = Math.max(0, hc + cut * open);
  // the beds: benches on the cliff that dip seaward
  const K = ss(0.46, 0.74, ti) * (d <= Rr ? 1 : 0);
  if (K > 0.01 && hc > 2) {
    const dip = dx * 0.07 + (fbm(e * 0.05, n * 0.05, 2) - 0.5) * 2.4, stepH = 4.6;
    const t = (hc + dip) / stepH, fl = Math.floor(t), f = ss(0.22, 0.78, t - fl);
    hc += ((fl + f) * stepH - dip - hc) * 0.66 * K;
  }
  // the Boilers' cove bites into the back of the ring
  const db = Math.hypot(e + 368, n + 59);
  if (db < 44) hc *= ss(12, 42, db);
  C.h = hc;
  C.ti = ti;
  C.k = open * ss(Rr - 46, Rr - 36, d) * (1 - ss(Rr + 40, Rr + 62, d));
  return C;
}
/** The ring's weight at a point, for the tint and the mask bake. */
function craterAt(e, n) { return craterField(e, n).k; }

/** 1 on the south-west arc, where the coast runs out to the Sounding Ring's bearing. */
function stormArc(e, n) {
  const r = Math.hypot(e, n);
  return r > 1 ? ss(0.84, 0.95, (e * -0.72 + n * -0.694) / r) : 0;
}

/**
 * The storm beach: how far down the sea floor falls. Under the Sounding Ring the shingle
 * drops steeply (a real storm-beach step), which keeps the 1.1 m contour inside the play
 * radius at the one bearing where land reaches r 480.
 */
function seaDepth(d, e, n) {
  const a = 0.05 + 0.18 * stormArc(e, n);
  return a * d + 0.0006 * d * d;
}

/* -------------------------------------------------------- the height recipe ---- */
/** The Glass's plan: 1 on its shoreline, warped so the lagoon has bays and points, never an oval. */
function glassD(e, n) {
  const gu = (e - GLASS.e) / GLASS.re, gv = (n - GLASS.n) / GLASS.rn;
  const r = Math.hypot(gu, gv);
  if (r > 2.4) return r;
  return r + (fbm(e * 0.017 + 4, n * 0.017, 2) - 0.5) * 0.7 + (fbm(e * 0.055, n * 0.055 + 4, 2) - 0.5) * 0.24;
}

const CONE_PROFILE = (dk) => CONE.h * Math.pow(Math.max(0, 1 - dk / CONE.r), 1.12);
/** The cinder track up the Rust Cone: a bench cut across the flank, level from side to side. */
const CONE_TRACK = (() => {
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const dk = 92 * (1 - t) + 4 * t, phi = (205 - 200 * t) * Math.PI / 180;       // climbs from the SW round by the E
    pts.push([CONE.e + Math.cos(phi) * dk, CONE.n + Math.sin(phi) * dk, CONE_PROFILE(dk)]);
  }
  return pts;
})();
function coneTrack(e, n, h) {
  if (Math.hypot(e - CONE.e, n - CONE.n) > CONE.r + 14) return h;
  let best = 1e9, hl = h;
  for (let i = 0; i < CONE_TRACK.length - 1; i++) {
    const a = CONE_TRACK[i], b = CONE_TRACK[i + 1];
    const q = distToSeg(e, n, a[0], a[1], b[0], b[1]);
    if (q.d < best) { best = q.d; hl = a[2] + (b[2] - a[2]) * q.t; }
  }
  return best > 12 ? h : h + (hl - h) * (1 - ss(3.2, 12, best));
}

/** Signed distance to the shoreline with its noise: + inland, metres (authored frame). */
export function coastD(e, n) {
  if (!M.ready) ensureMacro();
  const k = 1 - 0.72 * stormArc(e, n);
  return bicubic(M.c, e, n)
    + (fbm(e * 0.011 + 5, n * 0.011, 3) - 0.5) * 18 * k
    + (fbm(e * 0.052, n * 0.052 + 9, 2) - 0.5) * 3.6;
}

const _w = new Float64Array(6);

/** The authored height: the macro form plus stamps, relief scaled by `quiet`. */
function heightAuthored(e, n) {
  const c = coastD(e, n);
  if (c <= 0) return -seaDepth(-c, e, n);
  const W = M.b;
  // biome weights, bilinear
  const fx = (e + GH) / GC, fz = (n + GH) / GC;
  const ix = fx < 0 ? 0 : fx >= GN - 1 ? GN - 2 : fx | 0;
  const iz = fz < 0 ? 0 : fz >= GN - 1 ? GN - 2 : fz | 0;
  const tx = fx - ix, tz = fz - iz;
  const o0 = (iz * GN + ix) * 6, o1 = o0 + 6, o2 = ((iz + 1) * GN + ix) * 6, o3 = o2 + 6;
  for (let b = 0; b < 6; b++) {
    const a = W[o0 + b] + (W[o1 + b] - W[o0 + b]) * tx;
    const d = W[o2 + b] + (W[o3 + b] - W[o2 + b]) * tx;
    _w[b] = a + (d - a) * tz;
  }
  const pans = _w[0], holds = _w[1], malp = _w[2], cloud = _w[3], flank = _w[4], cald = _w[5];
  const quiet = bilinear(M.quiet, e, n);

  let h = bicubic(M.h, e, n);
  // broad relief everywhere except the flat Pans
  const hNot = 1 - pans;
  if (hNot > 0.01) h += (fbm(e * 0.009 + 31, n * 0.009, 3) - 0.5) * 11 * hNot * quiet;
  // cloudline barrancos: deep ridged cuts running downhill
  if (cloud > 0.02) {
    const wx = (fbm(e * 0.008, n * 0.008 + 5, 2) - 0.5) * 60, wz = (fbm(e * 0.008 + 9, n * 0.008, 2) - 0.5) * 60;
    h += cloud * (ridged((e + wx) * 0.011 + 3, (n + wz) * 0.011 - 7, 3) - 0.36) * 36 * quiet;
  }
  // malpaís: hummocky aa, ropes at 15-40 m, no cones (hornitos are W3 instances)
  if (malp > 0.02) {
    const wx = (fbm(e * 0.02, n * 0.02 + 5, 2) - 0.5) * 34, wz = (fbm(e * 0.02 + 9, n * 0.02, 2) - 0.5) * 34;
    h += malp * ((ridged((e + wx) * 0.026 + 9, (n + wz) * 0.026, 2) - 0.34) * 5.5 + (fbm(e * 0.11, n * 0.11, 2) - 0.5) * 2.2) * quiet;
  }
  // flank: strata benches on the wall
  if (flank > 0.02) {
    h += (fbm(e * 0.024, n * 0.024 + 3, 3) - 0.5) * 7 * flank * quiet;
    const wall = 1 - ss(16, 58, distToSeg(e, n, -190, 40, -142, 210).d);
    if (wall > 0.01) {
      const step = 13 + 5 * vnoise(e * 0.012, n * 0.012);
      const t = h / step, fl = Math.floor(t);
      let f = (t - fl - 0.5) * 2.1 + 0.5; f = f < 0 ? 0 : f > 1 ? 1 : f;
      h += ((fl + f * f * (3 - 2 * f)) * step - h) * 0.42 * wall * flank * ss(18, 50, h);
    }
  }
  // holds: long terraces, gentle (pit-cups and walls are instances at W2)
  if (holds > 0.02) h += ((fbm(e * 0.021 - 7, n * 0.021, 2) - 0.5) * 4.5 + (ridged(e * 0.017 + 3, n * 0.017 - 9, 3) - 0.34) * 9) * holds * quiet;
  // caldera floor: pumice swells
  if (cald > 0.02) h += (fbm(e * 0.02 + 2, n * 0.02 + 8, 2) - 0.5) * 3.2 * cald * quiet;
  if (h < 0.2) h = 0.2;
  if (h > 238) h = 238 + (h - 238) * 0.45;     // the summit, ≈ 245 m on the NE rim

  /* ---------- the Pans at fidelity ---------- */
  if (pans > 0.02) {
    // undulating coast plain, never quite flat; hummocks a low sun can draw
    h += (fbm(e * 0.018, n * 0.018, 3) - 0.5) * 1.5 * pans * quiet;
    h += (fbm(e * 0.13 + 7, n * 0.13, 2) - 0.5) * 0.85 * pans * quiet * ss(4, 16, c);
    // dunes behind the beach: long crests across the onshore wind, clear of the field and sites
    const duneZone = pans * ss(8, 26, c) * (1 - ss(70, 140, c)) * quiet;
    if (duneZone > 0.01) {
      const warp = fbm(e * 0.01, n * 0.01, 2) * 6;
      const s = Math.sin(e * 0.052 + n * 0.066 + warp);
      const crest = Math.pow(Math.abs(s), 1.6);
      h += crest * (1.0 + 2.6 * fbm(e * 0.02, n * 0.02, 2)) * duneZone;
    }
    // Saltrow's rise: a low tuff knoll behind the town, the vantage over the pans
    const dk0 = Math.hypot(e + 222, n + 183);
    if (dk0 < 100) h += 12 * Math.exp(-(dk0 * dk0) / (2 * 26 * 26));
    // storm-beach ridge at the top of the swash: shingle thrown up by winter seas
    const berm = ss(3, 12, c) * (1 - ss(14, 34, c));
    h += berm * 1.25 * pans;
  }
  // the crater's rim, over the Glass
  h += craterField(e, n).h;
  // the Rust Cone: a cinder cone at the angle of repose, crater on the far side of T3
  const dk = Math.hypot(e - CONE.e, n - CONE.n);
  if (dk < CONE.r + 8) {
    const gul = 1 + (vnoise(Math.atan2(n - CONE.n, e - CONE.e) * 7 + 9, dk * 0.03) - 0.5) * 0.09 * ss(14, 60, dk);
    let hc = CONE.h * Math.pow(Math.max(0, 1 - dk / CONE.r), 1.12) * gul;
    const dk2 = Math.hypot(e - CONE.e - 26, n - CONE.n + 12);
    hc -= 22 * (1 - ss(6, 25, dk2));
    // a smooth union: the cone's skirt spreads onto the shelf, no circular crease at its foot
    const sk = 16, gap = Math.max(sk - Math.abs(h - hc), 0);
    h = Math.max(h, hc) + gap * gap / (4 * sk);
  }
  // the Organ Shelf: a low basalt table, stepped at its seaward foot (columns are world-props')
  const sd = shelfD(e, n);
  if (sd > -14) {
    const top = 9.4 + (fbm(e * 0.06, n * 0.06, 2) - 0.5) * 1.4;
    const k = ss(-6 + vnoise(e * 0.11, n * 0.11) * 5, 9, sd);
    const hs = h + (top - h) * k;
    if (hs > h) h = hs;
  }
  // the salt field: cell floors planed flat, dykes raised (the stone is instanced on them)
  const fd = fieldDist(e, n, FIELD_APRON);
  if (fd < FIELD_APRON) {
    const P = panAt(e, n);
    const floor = P.kind >= 0 ? P.level - 0.12 * P.inside : 0.72;
    const crown = P.kind >= 0 ? (1 - P.inside) * 0.24 : 0.2;
    // planed flat in the field and its first metres, then a long apron up to the country
    const fk = 1 - ss(0.6, FIELD_APRON, fd);
    h += (floor + crown - h) * (fd < 1.2 ? 1 : fk * fk * (3 - 2 * fk) * 0.35 + fk * 0.65);
  }
  // the Glass: a still shallow lagoon behind the barrier
  const gd = glassD(e, n);
  if (gd < 1.42) {
    const bed = GLASS_LEVEL - 0.78 * (1 - ss(0.2, 1.0, gd)) + 0.14;
    const k = 1 - ss(0.9, 1.42, gd);
    h += (bed - h) * k;
  }
  h = coneTrack(e, n, h);
  h = padHeight(e, n, h);
  // a track is a hand's depth into the ground
  const tr = trackAt(e, n);
  if (tr > 0.05) h -= 0.07 * tr;

  /* ---------- meeting the sea ---------- */
  const shoreW = 11 + 6 * pans + 8 * cloud;
  return h * (1 - Math.exp(-c / shoreW));
}

/** Full-detail island height at an engine point. Baked once onto the render grid. */
export function heightAt(x, z) {
  if (!M.ready) ensureMacro();
  return heightAuthored(x / S, -z / S);
}

/** Biome weights at an engine point into `out` [pans, holds, malpais, cloudline, flank, caldera]. */
export function biomesAt(x, z, out) {
  if (!M.ready) ensureMacro();
  const e = x / S, n = -z / S;
  const fx = (e + GH) / GC, fz = (n + GH) / GC;
  const ix = fx < 0 ? 0 : fx >= GN - 1 ? GN - 2 : fx | 0;
  const iz = fz < 0 ? 0 : fz >= GN - 1 ? GN - 2 : fz | 0;
  const tx = fx - ix, tz = fz - iz;
  const W = M.b;
  const o0 = (iz * GN + ix) * 6, o1 = o0 + 6, o2 = ((iz + 1) * GN + ix) * 6, o3 = o2 + 6;
  let sum = 0;
  for (let b = 0; b < 6; b++) {
    const a = W[o0 + b] + (W[o1 + b] - W[o0 + b]) * tx;
    const d = W[o2 + b] + (W[o3 + b] - W[o2 + b]) * tx;
    const v = a + (d - a) * tz;
    out[b] = v; sum += v;
  }
  if (sum > 0) for (let b = 0; b < 6; b++) out[b] /= sum;
  return out;
}

/** Engine-point wrappers, for the mask bake and the scatter. */
export const authored = Object.freeze({
  coast: (x, z) => coastD(x / S, -z / S),
  coastArc: (x, z) => coastArc(x / S, -z / S),
  pan: (x, z) => panAt(x / S, -z / S),
  track: (x, z) => trackAt(x / S, -z / S),
  crater: (x, z) => craterAt(x / S, -z / S),
  shelf: (x, z) => shelfD(x / S, -z / S),
  fieldK: (x, z) => fieldK(x / S, -z / S),
  glass: (x, z) => glassD(x / S, -z / S),
});

/** The cistern in the field's frame, for the check script. */
export const CISTERN_FIELD = Object.freeze({ u: FU(CISTERN.e, CISTERN.n), v: FV(CISTERN.e, CISTERN.n) });

/* ------------------------------------------------------------- ground fields ---- */
/**
 * Marram cover 0..1 at an engine point: colonies on the dunes and along the Glass, never
 * on the salt field, the beach, the tracks or a site's own ground. `terrain.tallGrassDensity`
 * reads the baked copy of this (plus the runtime route stamps); the marram scatter plants
 * from the same value, so the field can never claim cover the scatter did not plant.
 */
export function coverAt(x, z) {
  if (!M.ready) ensureMacro();
  const e = x / S, n = -z / S;
  const c = coastD(e, n);
  if (c < 7) return 0;
  const pans = biomePans(e, n);
  if (pans < 0.05) return 0;
  const colony = ss(-0.06, 0.2, fbm(e * 0.024 + 11, n * 0.024 - 4, 3) - 0.5 + (fbm(e * 0.09, n * 0.09, 2) - 0.5) * 0.3);
  if (colony <= 0) return 0;
  const zone = ss(7, 20, c) * (1 - ss(95, 170, c));
  const glass = glassD(e, n);
  const reed = (1 - ss(1.1, 1.9, glass)) * ss(1.04, 1.14, glass);
  const k = Math.max(zone * 0.96, reed) * pans * colony;
  if (k <= 0.01) return 0;
  const fk = fieldK(e, n);
  if (fk > 0.9) return 0;
  let out = k * (1 - fk * 0.95) * (1 - trackAt(e, n)) * ss(-9, -2, -shelfD(e, n) - 2);
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i];
    if (s.biome !== 'pans' || s.id === 'the-glass') continue;
    const d = Math.hypot(e - s.e, n - s.n);
    if (d < 34) out *= ss(18, 34, d);
  }
  return out;
}

function biomePans(e, n) {
  const fx = (e + GH) / GC, fz = (n + GH) / GC;
  const ix = fx < 0 ? 0 : fx >= GN - 1 ? GN - 2 : fx | 0;
  const iz = fz < 0 ? 0 : fz >= GN - 1 ? GN - 2 : fz | 0;
  const tx = fx - ix, tz = fz - iz, W = M.b;
  const o0 = (iz * GN + ix) * 6, o2 = ((iz + 1) * GN + ix) * 6;
  const a = W[o0] + (W[o0 + 6] - W[o0]) * tx;
  const d = W[o2] + (W[o2 + 6] - W[o2]) * tx;
  return a + (d - a) * tz;
}

/** The kept cells of the salt field, in field coords (read-only). */
export function fieldCells() {
  buildField();
  const out = [];
  for (const row of _rows) for (const c of row.cells) if (c.keep) out.push(c);
  return out;
}
