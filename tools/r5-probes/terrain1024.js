/**
 * ROUND 5 — lane engine-gpu, W0a PROBE (gate `A-terrain-1024-probe`,
 * docs/ROUND5-PLAN.md §9, bible §8.1, numbers in docs/ROUND5-ENGINE.md).
 *
 * Question: can the kept terrain + nav stack carry the 1024 m world square?
 *   terrain build ≤ 600 ms · vertex buffers ≤ 24 MB · A9 GPU delta vs the 720 m
 *   mesh ≤ +1.5 ms · nav build ≤ 150 ms at R = 492 (N = 493).
 * If not, the fallback (860 m or 720 m) and its PLAY_RADIUS are the W1 values.
 *
 * What this module builds (dev-only; served by Vite at /tools/r5-probes/…,
 * imported by tools/gates.r5.engine-gpu.mjs; never bundled, no game code
 * imports it):
 *
 *   loadTerrainAt()      THE GRADED BUILD (fix round 1). Today's real
 *   realBuild()          src/world/terrain.js, fetched as Vite serves it, with
 *                        only its two mesh constants made settable
 *                        (MESH_SPAN, MESH_SEGS) and two pure module functions
 *                        (_smoothField, _bakeDetail) timed. `realBuild` runs
 *                        the real constructor — every pass of `_buildMesh`
 *                        (heights, filtered field, `_bakeVertexColors`, the
 *                        rim-widened normals, `_buildMasks`, the three detail
 *                        bakes) plus cliffs and far ranges — at any span and
 *                        segment count, on today's own height recipe. The
 *                        first-round probe timed a re-implementation of those
 *                        passes and under-counted them about 2× (the
 *                        colour and mask bakes); this measures the code itself.
 *   parallelBuild()      (fix round 2) the same `_buildMesh` passes on a COLD
 *   compareBuilds()      pool of module workers — spawned, imported and
 *                        terminated inside the call — running today's own
 *                        getHeight / _vertexColor / _maskTexel / _bakeDetail
 *                        and normals loop. compareBuilds() proves its output
 *                        bit-identical to realBuild()'s at the same size; the
 *                        gate grades the pool only when it is.
 *   islandHeight(x, z)   a stand-in Round-5 landform for Orchil (bible §8):
 *                        coast ellipse ≈ 940 × 744 m of land, caldera shield
 *                        to ≈ 245 m, the Pans flats, the Rust Cone, Malpaís and
 *                        Cloudline roughness, shallows. NOT world-ground's
 *                        recipe and NOT used to grade the build any more; it
 *                        gives the navgrid an island's slopes and blockers.
 *   buildTerrain1024()   a LEAN re-implementation of the mesh passes (heights,
 *                        filtered field, colours, normals, masks) — kept only
 *                        as the island heightfield the navgrid reads and as a
 *                        reported, ungraded data point.
 *   loadNavAt(R)         the FROZEN src/core/nav.js, byte for byte as Vite
 *                        serves it, with only its two extent imports rebound:
 *                        PLAY_RADIUS → R and riverFactor → 0 (the W1 contract,
 *                        plan §1.2). No copy of the algorithm lives here.
 *
 * Everything returned owns a dispose(). Nothing here runs per frame.
 */
import * as THREE from 'three';

export const PROBE = Object.freeze({
  worldSize: 1024,
  spanFactor: 1.3,          // bible §8.1: span 1.3 × 1024 = 1331.2 m
  meshSegs: 686,            // → 1.9405 m nodes (today: 972 m / 500 = 1.944 m)
  playRadius: 490,          // bible §8.1
  navSpan: 2,               // EXTENT.navSpan (extent.js stub): R = 492
  maskN: 512,               // 512² biome mask, 2 m/texel
  controlN: 64,             // 64² biome-id control map
});

/** One-number fallbacks (bible §8.1: ×0.84 and ×0.70). */
export const FALLBACKS = Object.freeze([
  Object.freeze({ worldSize: 860, playRadius: 412, meshSegs: 576 }),
  Object.freeze({ worldSize: 720, playRadius: 343, meshSegs: 482 }),
]);

/** The three candidate sizes in decision order (plan §9: 1024, else 860, else 720). */
export const SIZES = Object.freeze([
  Object.freeze({ worldSize: PROBE.worldSize, playRadius: PROBE.playRadius, meshSegs: PROBE.meshSegs }),
  ...FALLBACKS,
]);

/** Today's mesh (terrain.js MESH_SPAN = WORLD_SIZE × 1.35, MESH_SEGS 500): the calibration point. */
export const TODAY = Object.freeze({ worldSize: 720, span: 720 * 1.35, meshSegs: 500 });

/** Bible §8.4 sites, (E, N) → engine (x = E, z = −N). Land sites only. */
export const SITES = Object.freeze([
  ['Saltrow', -267, -229], ['salt pans', -320, -293], ['the Glass', -384, -176],
  ['Organ Shelf', -219, -341], ['Sounding Ring', -347, -320], ['black-sand beach', -187, -411],
  ['Ninewalls', -11, -213], ['the Boilers', -368, -59], ['Roques', -43, 101],
  ['Jameo', 112, -160], ['Kiln Yards', 219, -27], ['Rust Cone', 283, -101],
  ['hornito field', 272, -187], ['Mistfold', 240, 261], ['Fog Harp', 176, 229],
  ['Pinned Cliff', -183, 103], ['Leveler Muster', -283, 160], ['Calibration Yard', 16, 37],
  ['the Fundamental', 128, 144],
].map(([name, e, n]) => Object.freeze({ name, x: e, z: -n })));

/* ----------------------------- noise (no allocation) ----------------------------- */
function hash(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, oct) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f + o * 17.3, z * f - o * 9.1); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function ridged(x, z, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { const v = 1 - Math.abs(vnoise(x * f, z * f) * 2 - 1); s += v * v * a; a *= 0.5; f *= 2.05; }
  return s;
}
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/* ----------------------------- the representative recipe ----------------------------- */
// bible coordinates: E = x, N = −z
const CAL = { e: 40, n: 100 };           // caldera centre (Calibration Yard / Fundamental / Roques ring)
const CONE = { e: 283, n: -101, r: 95, h: 145 };   // Rust Cone

/** Biome weights at (E, N) into `out` [pans, holds, malpais, cloudline, flank, caldera]. */
export function biomeWeights(x, z, out) {
  const e = x, n = -z;
  const dc = Math.hypot(e - CAL.e, n - CAL.n);
  const ang = Math.atan2(n - CAL.n, e - CAL.e);          // 0 = east, +π/2 = north
  const cald = ss(175, 120, dc);
  const rest = 1 - cald;
  const sw = ss(0.3, 1, -Math.cos(ang + Math.PI / 4)) * ss(150, 260, dc);   // toward SW
  const s = Math.max(0, -Math.sin(ang)) * (1 - sw);
  const se = Math.max(0, Math.cos(ang + Math.PI / 4)) * ss(0.2, 0.7, -Math.sin(ang) * 0.5 + Math.cos(ang) * 0.8);
  const nne = Math.max(0, Math.sin(ang - 0.25));
  const w = Math.max(0, -Math.cos(ang)) * (1 - sw) * ss(-0.4, 0.2, Math.sin(ang) + 0.3);
  let sum = sw + s * 0.8 + se + nne + w + 1e-6;
  out[0] = rest * sw / sum; out[1] = rest * s * 0.8 / sum; out[2] = rest * se / sum;
  out[3] = rest * nne / sum; out[4] = rest * w / sum; out[5] = cald;
  sum = out[0] + out[1] + out[2] + out[3] + out[4] + out[5];
  for (let i = 0; i < 6; i++) out[i] /= sum;
  return out;
}

const _bw = new Float32Array(6);

/** Representative analytic island height (metres). Allocation-free. */
export function islandHeight(x, z) {
  const e = x, n = -z;
  // coast: land ellipse centred (E −16, N −40), half-axes 470 × 372, the SW
  // (the Pans) bulging 8 %, the line warped by low-frequency noise
  const ce = (e + 16) / 470, cn = (n + 40) / 372;
  const r0 = Math.hypot(ce, cn);
  const swb = r0 > 1e-6 ? Math.max(0, -(ce + cn) / (r0 * Math.SQRT2)) : 0;
  const q = r0 * (1 - 0.08 * swb) + (fbm(e * 0.006, n * 0.006, 3) - 0.5) * 0.2;
  const land = ss(1.05, 0.93, q);
  const w = biomeWeights(x, z, _bw);
  // shield toward the caldera, bearing-dependent reach
  const dc = Math.hypot(e - CAL.e, n - CAL.n);
  const reach = 300 + 120 * w[2] + 80 * w[1] - 40 * w[4];
  const t = Math.min(1, dc / reach);
  let h = 238 * Math.pow(1 - t * t, 1.25);
  // caldera: rim crest at ~100 m, bowl floor ~60 m below it
  h += 12 * Math.exp(-((dc - 100) * (dc - 100)) / 500) - 58 * ss(105, 35, dc);
  // broad relief everywhere
  h += (fbm(e * 0.004 + 31, n * 0.004, 4) - 0.5) * 22;
  // Cloudline barrancos (ridged), Malpaís lava roughness, Holds pit field
  if (w[3] > 0.02) h += w[3] * (ridged(e * 0.012, n * 0.012, 3) - 0.35) * 34;
  if (w[2] > 0.02) h += w[2] * (ridged(e * 0.05 + 7, n * 0.05, 2) - 0.3) * 7;
  if (w[1] > 0.02) h -= w[1] * Math.pow(vnoise(e * 0.06, n * 0.06), 3) * 6;
  // the Pans: flattened to the water table with low dunes near the beach
  if (w[0] > 0.02) {
    const dune = Math.pow(Math.abs(Math.sin(e * 0.045 + n * 0.075 + fbm(e * 0.01, n * 0.01, 2) * 6)), 1.6) * 2.2;
    h += (1.2 + dune * ss(0.75, 0.95, q) + (fbm(e * 0.02, n * 0.02, 2) - 0.5) * 1.5 - h) * ss(0.02, 0.6, w[0]);
  }
  // the Flank: the west coast drops in a cliff band
  if (w[4] > 0.02) h *= 1 - w[4] * ss(0.82, 0.97, q) * 0.85;
  // the Rust Cone (with a crater)
  const dk = Math.hypot(e - CONE.e, n - CONE.n);
  if (dk < CONE.r) h = Math.max(h, CONE.h * Math.pow(1 - dk / CONE.r, 1.25) - 26 * ss(22, 6, dk));
  // sea and shallows: walkable shelf to −1.2 m, then the drop
  const sea = -1.2 - 14 * ss(1.0, 1.2, q) + (fbm(e * 0.02, n * 0.02, 2) - 0.5) * 0.6;
  return sea + (Math.max(h, 0.4) - sea) * land;
}

/* ----------------------------- the mesh build ----------------------------- */
const _cA = new THREE.Color(), _cB = new THREE.Color();
const PALETTE = [
  new THREE.Color('#2b2a2a'),   // pans: black sand
  new THREE.Color('#5c4a3c'),   // holds: lapilli
  new THREE.Color('#3a3330'),   // malpaís: lava rock
  new THREE.Color('#47563a'),   // cloudline: forest floor
  new THREE.Color('#4a4642'),   // flank: basalt
  new THREE.Color('#8a7d6a'),   // caldera: pumice
];
const SALT = new THREE.Color('#e8e4dc');

/** Separable 2-pass box blur (running sums) — the job of terrain.js `_smoothField`. */
function smoothField(src, side, radius, passes) {
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  const w = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let r = 0; r < side; r++) {          // rows
      const o = r * side;
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += a[o + Math.min(side - 1, Math.max(0, k))];
      for (let c = 0; c < side; c++) {
        b[o + c] = s / w;
        s += a[o + Math.min(side - 1, c + radius + 1)] - a[o + Math.max(0, c - radius)];
      }
    }
    for (let c = 0; c < side; c++) {          // columns
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += b[Math.min(side - 1, Math.max(0, k)) * side + c];
      for (let r = 0; r < side; r++) {
        a[r * side + c] = s / w;
        s += b[Math.min(side - 1, r + radius + 1) * side + c] - b[Math.max(0, r - radius) * side + c];
      }
    }
  }
  b = null;
  return a;
}

/**
 * Build the heightfield mesh + masks. `heightFn(x, z)` defaults to the
 * representative recipe; pass the live `terrain.getHeight` to build the same
 * span from today's landform (the A9 GPU A/B uses that, so the frame the GPU
 * draws is the frame A9 draws).
 *
 * @returns {{ geometry: THREE.BufferGeometry, maskTex: THREE.DataTexture,
 *   controlTex: THREE.DataTexture, grid: {H: Float32Array, side: number, step: number, half: number},
 *   heightAt: (x: number, z: number) => number, ms: object, bytes: object, dispose: () => void }}
 */
export function buildTerrain1024({ heightFn = islandHeight, worldSize = PROBE.worldSize, segs = PROBE.meshSegs,
  masks = true, sampleFrom = null } = {}) {
  const ms = {};
  const T0 = performance.now();
  const span = worldSize * PROBE.spanFactor;
  const side = segs + 1, count = side * side, step = span / segs, half = span / 2;

  // pass 0: today's layout — PlaneGeometry position/normal/uv + Uint32 index
  let t = performance.now();
  const geometry = new THREE.PlaneGeometry(span, span, segs, segs);
  geometry.rotateX(-Math.PI / 2);
  const P = geometry.attributes.position.array;
  ms.geometry = performance.now() - t;

  // pass 1: heights (row iz runs +z; x = −half + ix·step, as terrain.js `_hg`)
  t = performance.now();
  const H = new Float32Array(count);
  for (let iz = 0; iz < side; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix < side; ix++) {
      const i = iz * side + ix;
      const h = heightFn(-half + ix * step, z);
      H[i] = h;
      P[i * 3 + 1] = h;
    }
  }
  ms.heights = performance.now() - t;

  // pass 2: filtered field (what terrain.js keys rim albedo on)
  t = performance.now();
  const HS = smoothField(H, side, 10, 2);
  ms.smooth = performance.now() - t;

  // pass 3: vertex colours from biome weights, slope, the filtered field
  t = performance.now();
  const colors = new Float32Array(count * 3);
  const bw = new Float32Array(6);
  for (let iz = 0; iz < side; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix < side; ix++) {
      const i = iz * side + ix;
      const x = -half + ix * step;
      biomeWeights(x, z, bw);
      _cA.setRGB(0, 0, 0);
      for (let k = 0; k < 6; k++) { _cB.copy(PALETTE[k]).multiplyScalar(bw[k]); _cA.add(_cB); }
      const gx = (H[iz * side + Math.min(segs, ix + 1)] - H[iz * side + Math.max(0, ix - 1)]) / (2 * step);
      const gz = (H[Math.min(segs, iz + 1) * side + ix] - H[Math.max(0, iz - 1) * side + ix]) / (2 * step);
      const slope = Math.hypot(gx, gz);
      _cA.lerp(PALETTE[4], ss(0.5, 1.1, slope) * 0.7);
      if (bw[0] > 0.3 && H[i] < 2.2 && H[i] - HS[i] < 0.4) _cA.lerp(SALT, ss(0.3, 0.8, bw[0]) * 0.6);
      colors[i * 3] = _cA.r; colors[i * 3 + 1] = _cA.g; colors[i * 3 + 2] = _cA.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ms.colors = performance.now() - t;

  // pass 4: shading normals, central differences widened on steep ground
  t = performance.now();
  const N = geometry.attributes.normal.array;
  for (let iz = 0; iz < side; iz++) {
    for (let ix = 0; ix < side; ix++) {
      const i = iz * side + ix;
      const k = 1 + (Math.abs(H[i] - HS[i]) > 6 ? 2 : 0);
      const x0 = Math.max(0, ix - k), x1 = Math.min(segs, ix + k);
      const z0 = Math.max(0, iz - k), z1 = Math.min(segs, iz + k);
      const gx = (H[iz * side + x1] - H[iz * side + x0]) / ((x1 - x0) * step);
      const gz = (H[z1 * side + ix] - H[z0 * side + ix]) / ((z1 - z0) * step);
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      N[i * 3] = -gx * inv; N[i * 3 + 1] = inv; N[i * 3 + 2] = -gz * inv;
    }
  }
  // A/B film only: inside the old mesh's span, take colour + normal from it
  // (bilinear), so the two frames differ in vertex count, not in paint.
  if (sampleFrom) copyInside(sampleFrom, P, colors, N, count);
  geometry.attributes.normal.needsUpdate = true;
  geometry.attributes.position.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  ms.normals = performance.now() - t;

  // pass 5: 512² biome mask (2 m/texel over the world square) + 64² control map
  let maskTex = null, controlTex = null;
  if (masks) {
    t = performance.now();
    const M = PROBE.maskN, data = new Uint8Array(M * M * 4), sc = worldSize / M, wh = worldSize / 2;
    for (let j = 0; j < M; j++) {
      const z = -wh + (j + 0.5) * sc;
      for (let i = 0; i < M; i++) {
        biomeWeights(-wh + (i + 0.5) * sc, z, bw);
        const o = (j * M + i) * 4;
        data[o] = (bw[0] * 255) | 0; data[o + 1] = (bw[1] * 255) | 0;
        data[o + 2] = (bw[2] * 255) | 0; data[o + 3] = ((bw[3] + bw[4]) * 255) | 0;
      }
    }
    maskTex = new THREE.DataTexture(data, M, M, THREE.RGBAFormat);
    maskTex.magFilter = THREE.LinearFilter; maskTex.minFilter = THREE.LinearFilter; maskTex.needsUpdate = true;
    const C = PROBE.controlN, cd = new Uint8Array(C * C), cs = worldSize / C;
    for (let j = 0; j < C; j++) {
      for (let i = 0; i < C; i++) {
        biomeWeights(-wh + (i + 0.5) * cs, -wh + (j + 0.5) * cs, bw);
        let best = 0;
        for (let k = 1; k < 6; k++) if (bw[k] > bw[best]) best = k;
        cd[j * C + i] = best;
      }
    }
    controlTex = new THREE.DataTexture(cd, C, C, THREE.RedFormat);
    controlTex.needsUpdate = true;
    ms.masks = performance.now() - t;
  }
  ms.total = performance.now() - T0;

  let vertex = 0;
  const attrs = {};
  for (const [k, a] of Object.entries(geometry.attributes)) { attrs[k] = a.array.byteLength; vertex += a.array.byteLength; }
  const index = geometry.index ? geometry.index.array.byteLength : 0;

  /** Bilinear off the mesh's own grid: agrees with the drawn surface (terrain.js `heightFast`). */
  const heightAt = (x, z) => {
    const fx = Math.min(segs - 1e-4, Math.max(0, (x + half) / step));
    const fz = Math.min(segs - 1e-4, Math.max(0, (z + half) / step));
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    const i = iz * side + ix;
    const a = H[i], b = H[i + 1], c = H[i + side], d = H[i + side + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };

  return {
    geometry, maskTex, controlTex,
    grid: { H, side, step, half },
    heightAt, ms: roundAll(ms),
    bytes: { attrs, vertex, index, total: vertex + index, vertexMB: +(vertex / 1e6).toFixed(2), indexMB: +(index / 1e6).toFixed(2) },
    shape: { worldSize, span: +span.toFixed(1), segs, vertices: count, nodeSpacing: +step.toFixed(4) },
    dispose() {
      geometry.dispose();
      maskTex?.dispose();
      controlTex?.dispose();
    },
  };
}

function copyInside(src, P, colors, N, count) {
  const { side, step, half, color, normal } = src;
  const segs = side - 1;
  for (let i = 0; i < count; i++) {
    const fx = (P[i * 3] + half) / step, fz = (P[i * 3 + 2] + half) / step;
    if (fx < 0 || fz < 0 || fx > segs - 1e-4 || fz > segs - 1e-4) continue;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    const a = iz * side + ix, b = a + 1, c = a + side, d = c + 1;
    const wa = (1 - tx) * (1 - tz), wb = tx * (1 - tz), wc = (1 - tx) * tz, wd = tx * tz;
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) {
      colors[i * 3 + k] = color[a * 3 + k] * wa + color[b * 3 + k] * wb + color[c * 3 + k] * wc + color[d * 3 + k] * wd;
    }
    nx = normal[a * 3] * wa + normal[b * 3] * wb + normal[c * 3] * wc + normal[d * 3] * wd;
    ny = normal[a * 3 + 1] * wa + normal[b * 3 + 1] * wb + normal[c * 3 + 1] * wc + normal[d * 3 + 1] * wd;
    nz = normal[a * 3 + 2] * wa + normal[b * 3 + 2] * wb + normal[c * 3 + 2] * wc + normal[d * 3 + 2] * wd;
    const inv = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz));
    N[i * 3] = nx * inv; N[i * 3 + 1] = ny * inv; N[i * 3 + 2] = nz * inv;
  }
}

function roundAll(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = +v.toFixed(1);
  return out;
}

/* ----------------------------- today's real terrain build at another size ----------------------------- */

const TIMED_METHODS = ['_buildMesh', '_bakeVertexColors', '_buildMasks', '_buildCliffs', '_buildFarRanges'];

/**
 * Today's `Terrain` class, compiled from src/world/terrain.js exactly as Vite
 * serves it to the game, with:
 *   - `const MESH_SPAN = WORLD_SIZE * 1.35;` and `const MESH_SEGS = 500;` made
 *     `let` and settable through `__probeMesh(span, segs)` (both are read only
 *     inside `_buildMesh`, at call time);
 *   - the pure module functions `_smoothField` and `_bakeDetail` wrapped with
 *     a timer (renamed, re-declared; behaviour unchanged);
 *   - the five build methods timed on THIS copy's prototype (the game's own
 *     class is a different module instance and is never touched).
 * Every other import (three, sites.js, extent.js) resolves to the game's own
 * module instances. Throws if an anchor moved: the probe never measures
 * something it did not mean to.
 *
 * @returns {Promise<{ mod: object, sink: object, source: string }>}
 */
export async function loadTerrainAt() {
  const res = await fetch('/src/world/terrain.js');
  const src = await res.text();
  const A = {
    span: /const MESH_SPAN = WORLD_SIZE \* 1\.35;/,
    segs: /const MESH_SEGS = 500;/,
    smooth: /function _smoothField\(src, side, radius, passes\) \{/,
    detail: /function _bakeDetail\(N, cfg\) \{/,
  };
  for (const [k, re] of Object.entries(A)) {
    if (!re.test(src)) throw new Error(`terrain.js anchor "${k}" moved — probe refuses to guess`);
  }
  const patched = 'const __PROBE_T = { smooth: 0, detail: 0 };\n' + src
    .replace(A.span, 'let MESH_SPAN = WORLD_SIZE * 1.35;')
    .replace(A.segs, 'let MESH_SEGS = 500;')
    .replace(A.smooth, 'function __probeOrigSmoothField(src, side, radius, passes) {')
    .replace(A.detail, 'function __probeOrigBakeDetail(N, cfg) {')
    .replace(/from "\//g, `from "${location.origin}/`)
    + `
function _smoothField(src, side, radius, passes) {
  const t0 = performance.now();
  try { return __probeOrigSmoothField(src, side, radius, passes); } finally { __PROBE_T.smooth += performance.now() - t0; }
}
function _bakeDetail(N, cfg) {
  const t0 = performance.now();
  try { return __probeOrigBakeDetail(N, cfg); } finally { __PROBE_T.detail += performance.now() - t0; }
}
export function __probeMesh(span, segs) { MESH_SPAN = span; MESH_SEGS = segs; }
export { __PROBE_T };
/* fix round 2 — what parallelBuild()'s workers call: today's own functions, nothing re-written */
export const __probeInternals = {
  THREE, Terrain, SS, RIM_IN, RIM_OUT, MASK_N, WORLD_SIZE, WORLD_HALF,
  smoothField: __probeOrigSmoothField,
  bakeDetail: __probeOrigBakeDetail,
  /** today's constructor, minus its three build calls: every field, seed and module grid it sets */
  bareTerrain() {
    const p = Terrain.prototype, keep = [p._buildMesh, p._buildCliffs, p._buildFarRanges];
    p._buildMesh = p._buildCliffs = p._buildFarRanges = function () {};
    try { return new Terrain({ scene: { add() {} } }); }
    finally { [p._buildMesh, p._buildCliffs, p._buildFarRanges] = keep; }
  },
};
`;
  // the three detail-bake configs, read from today's _buildMesh (not copied): parallelBuild bakes these
  const detailCfgs = [...src.matchAll(/_bakeDetail\(256, (\{[^;]*?\})\);/g)].map((m) => {
    if (!/^[\s\w:.,\-[\]{}]+$/.test(m[1])) throw new Error('terrain.js _bakeDetail config is not a plain literal — probe refuses to guess');
    return Function(`"use strict"; return (${m[1]});`)();
  });
  if (detailCfgs.length !== 3) throw new Error(`terrain.js has ${detailCfgs.length} _bakeDetail(256, …) bakes, expected 3 — probe refuses to guess`);
  const url = URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }));
  let mod;
  try { mod = await import(/* @vite-ignore */ url); } finally { URL.revokeObjectURL(url); }
  const proto = mod.Terrain.prototype;
  const sink = {};
  for (const name of TIMED_METHODS) {
    const f = proto[name];
    if (typeof f !== 'function') throw new Error(`Terrain.${name} missing — probe refuses to guess`);
    proto[name] = function timed(a, b) {
      const t0 = performance.now();
      try { return f.call(this, a, b); } finally { sink[name] = (sink[name] || 0) + (performance.now() - t0); }
    };
  }
  return { mod, sink, patched, detailCfgs,
    source: 'src/world/terrain.js (Vite-served; MESH_SPAN/MESH_SEGS settable; 2 pure functions + 5 methods timed)' };
}

/**
 * Run today's real Terrain constructor at `span` × `segs` on today's own
 * height recipe and time every pass. `heights` is the pass-1 loop re-run on
 * the built grid (getHeight per vertex, the writes left out), so the pass
 * split is: heights + filtered field + vertex colours + masks + detail bakes
 * + normals/geometry (the remainder of `_buildMesh`).
 *
 * @param {{ mod: object, sink: object }} T   from loadTerrainAt()
 * @param {{ span: number, segs: number }} size
 * @returns {{ ms: object, vertices: number, span: number, segs: number, nodeSpacing: number,
 *   perSampleUs: number, perVertexUs: number, bytes: object, geometry: THREE.BufferGeometry,
 *   heightAt: (x: number, z: number) => number, dispose: () => void }}
 */
export function realBuild(T, { span, segs }) {
  const { mod, sink } = T;
  mod.__probeMesh(span, segs);
  for (const k of TIMED_METHODS) sink[k] = 0;
  mod.__PROBE_T.smooth = 0; mod.__PROBE_T.detail = 0;
  const t0 = performance.now();
  const inst = new mod.Terrain({ scene: { add() {} } });
  const ctorMs = performance.now() - t0;
  const geo = inst.mesh.geometry;
  const pos = geo.attributes.position, count = pos.count;
  let s = 0;
  const th = performance.now();
  for (let i = 0; i < count; i++) s += inst.getHeight(pos.getX(i), pos.getZ(i));
  const heightsMs = performance.now() - th;
  if (!(s > -1e15)) throw new Error('heights replica produced NaN');
  const ms = {
    constructor: ctorMs,
    buildMesh: sink._buildMesh,
    heights: heightsMs,
    smooth: mod.__PROBE_T.smooth,
    vertexColors: sink._bakeVertexColors,
    masks: sink._buildMasks,
    detail: mod.__PROBE_T.detail,
    cliffs: sink._buildCliffs,
    farRanges: sink._buildFarRanges,
  };
  ms.normalsAndGeometry = Math.max(0, ms.buildMesh - ms.heights - ms.smooth - ms.vertexColors - ms.masks - ms.detail);
  let vertex = 0;
  const attrs = {};
  for (const [k, a] of Object.entries(geo.attributes)) { attrs[k] = a.array.byteLength; vertex += a.array.byteLength; }
  const index = geo.index ? geo.index.array.byteLength : 0;
  return {
    ms: roundAll(ms), vertices: count, span: +span.toFixed(1), segs, nodeSpacing: +(span / segs).toFixed(4),
    perSampleUs: +((heightsMs * 1000) / count).toFixed(3),
    perVertexUs: +((ms.buildMesh * 1000) / count).toFixed(3),
    bytes: { attrs, vertex, index, vertexMB: +(vertex / 1e6).toFixed(2), indexMB: +(index / 1e6).toFixed(2) },
    geometry: geo,
    heightAt: (x, z) => inst.heightFast(x, z),
    /** what compareBuilds() reads: today's own outputs, as the constructor left them */
    outputs: () => ({
      geometry: geo, H: inst._hg.H, HS: inst._hg.HS,
      masks: inst._maskTextures, detail: [inst._detailTex, inst._gravelTex, inst._macroTex],
    }),
    dispose() { inst.dispose(); },
  };
}

/* ----------------------------- the same build, on a worker pool (fix round 2) ----------------------------- */

/**
 * The worker: a module that imports the SAME patched terrain.js the page uses
 * (its own module instance), constructs today's Terrain minus the three build
 * calls (`bareTerrain`: every field, seed and module grid the constructor
 * sets), and then runs today's own per-sample functions on the rows it is
 * handed — `getHeight`, `_vertexColor`, `_maskTexel`, `_bakeDetail`. Nothing
 * of the recipe is re-written here. The loops around those calls copy the
 * constructor's loops (PlaneGeometry's float32 grid coordinates,
 * `_bakeMaskTexels`' texel centres and border) and `compareBuilds()` proves
 * the result bit for bit against today's single-thread constructor.
 */
const WORKER_SRC = (terrainUrl) => `
const ready = import(${JSON.stringify(terrainUrl)}).then((mod) => {
  const I = mod.__probeInternals;
  return { I, T: I.bareTerrain(), COL: new I.THREE.Color() };
});
let F = null;   // the fields the colour + normal passes read: { H, HS, X, segs, side, step, pos }
/** PlaneGeometry's float32 grid coordinate per row/column (x = ix * w - w/2; rotateX(-PI/2) maps -y to z exactly) */
function gridCoords(span, segs) {
  const side = segs + 1, sw = span / segs, hw = span / 2, X = new Float32Array(side);
  for (let k = 0; k < side; k++) X[k] = k * sw - hw;
  return X;
}
/** pass 1 of _buildMesh: getHeight at every vertex of rows [r0, r1) */
function doHeights(T, span, segs, r0, r1) {
  const side = segs + 1, X = gridCoords(span, segs), out = new Float32Array((r1 - r0) * side);
  for (let iz = r0; iz < r1; iz++) {
    const z = X[iz], o = (iz - r0) * side;
    for (let ix = 0; ix < side; ix++) out[o + ix] = T.getHeight(X[ix], z);
  }
  return out;
}
/** pass 2 (_bakeVertexColors' loop around today's _vertexColor) for rows [r0, r1) */
function doColors(T, COL, r0, r1) {
  const side = F.side, out = new Float32Array((r1 - r0) * side * 3);
  T._meshBake = { pos: F.pos, H: F.H, HS: F.HS, segs: F.segs, side, step: F.step, colors: null, attr: null };
  try {
    for (let iz = r0; iz < r1; iz++) {
      for (let ix = 0; ix < side; ix++) {
        T._vertexColor(iz * side + ix, ix, iz, COL);
        const o = ((iz - r0) * side + ix) * 3;
        out[o] = COL.r; out[o + 1] = COL.g; out[o + 2] = COL.b;
      }
    }
  } finally { T._meshBake = null; }
  return out;
}
/** pass 3 of _buildMesh (the rim-widened shading normals), today's arithmetic in today's order, rows [r0, r1) */
function doNormals(I, r0, r1) {
  const { H, X, segs, side, step } = F, out = new Float32Array((r1 - r0) * side * 3);
  const SS = I.SS, RIM_IN = I.RIM_IN, RIM_OUT = I.RIM_OUT, two = 2 * step;
  for (let iz = r0; iz < r1; iz++) {
    for (let ix = 0; ix <= segs; ix++) {
      const i = iz * side + ix;
      const rimN = SS(Math.hypot(X[ix], X[iz]), RIM_IN, RIM_OUT * 0.94);
      const W = 1 + Math.round(rimN * 30);
      let gx = 0, gz = 0, wx = 0, wz = 0;
      for (let k = 1; k <= W; k++) {
        if (ix - k >= 0 && ix + k <= segs) { gx += (H[i + k] - H[i - k]) / two; wx += k; }
        if (iz - k >= 0 && iz + k <= segs) { gz += (H[i + k * side] - H[i - k * side]) / two; wz += k; }
      }
      const g0 = wx ? gx / wx : 0, g1 = wz ? gz / wz : 0;
      const i1 = 1 / Math.sqrt(g0 * g0 + 1 + g1 * g1);
      const o = ((iz - r0) * side + ix) * 3;
      out[o] = -g0 * i1; out[o + 1] = i1; out[o + 2] = -g1 * i1;
    }
  }
  return out;
}
/** _bakeMaskTexels(null)'s loop around today's _maskTexel, texel rows [r0, r1) */
function doMasks(I, T, r0, r1) {
  const N = I.MASK_N, scale = I.WORLD_SIZE / N, n = (r1 - r0) * N * 4, v = new Uint8Array(12);
  const d1 = new Uint8Array(n), d2 = new Uint8Array(n), d3 = new Uint8Array(n);
  for (let iz = r0; iz < r1; iz++) {
    const wz = (iz + 0.5) * scale - I.WORLD_HALF;
    if (Math.abs(wz) > 348) continue;
    for (let ix = 0; ix < N; ix++) {
      const wx = (ix + 0.5) * scale - I.WORLD_HALF;
      if (Math.abs(wx) > 348) continue;
      T._maskTexel(wx, wz, v);
      const o = ((iz - r0) * N + ix) * 4;
      d1[o] = v[0]; d1[o + 1] = v[1]; d1[o + 2] = v[2]; d1[o + 3] = v[3];
      d2[o] = v[4]; d2[o + 1] = v[5]; d2[o + 2] = v[6]; d2[o + 3] = v[7];
      d3[o] = v[8]; d3[o + 1] = v[9]; d3[o + 2] = v[10]; d3[o + 3] = v[11];
    }
  }
  return [d1, d2, d3];
}
self.onmessage = async (ev) => {
  const m = ev.data;
  let S;
  try { S = await ready; } catch (err) { self.postMessage({ id: m.id, error: 'worker import: ' + (err && err.message) }); return; }
  const t0 = performance.now();
  try {
    const { I, T, COL } = S;
    if (m.op === 'heights') {
      const out = doHeights(T, m.span, m.segs, m.r0, m.r1);
      self.postMessage({ id: m.id, out, ms: performance.now() - t0 }, [out.buffer]);
    } else if (m.op === 'fields') {
      const X = gridCoords(m.span, m.segs), side = m.segs + 1;
      F = { H: m.H, HS: m.HS, X, segs: m.segs, side, step: m.span / m.segs,
        pos: { getX: (i) => X[i % side], getZ: (i) => X[(i / side) | 0] } };
      self.postMessage({ id: m.id, ms: performance.now() - t0 });
    } else if (m.op === 'colorsNormals') {
      const colors = doColors(T, COL, m.r0, m.r1), normals = doNormals(I, m.r0, m.r1);
      self.postMessage({ id: m.id, out: [colors, normals], ms: performance.now() - t0 }, [colors.buffer, normals.buffer]);
    } else if (m.op === 'masks') {
      const out = doMasks(I, T, m.r0, m.r1);
      self.postMessage({ id: m.id, out, ms: performance.now() - t0 }, out.map((d) => d.buffer));
    } else if (m.op === 'detail') {
      const tex = I.bakeDetail(256, m.cfg), out = tex.image.data;
      tex.image.data = null;
      self.postMessage({ id: m.id, out, ms: performance.now() - t0 }, [out.buffer]);
    } else if (m.op === 'drop') {
      F = null;
      self.postMessage({ id: m.id, ms: 0 });
    } else {
      self.postMessage({ id: m.id, error: 'unknown op ' + m.op });
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.stack) || err) });
  }
};
`;

/**
 * Pool shape. 4 workers on this box (an M3 Pro: 5 performance cores = 4
 * workers + the page's own thread). Jobs are dealt on demand, at most 2 in
 * flight per worker, largest first within a phase — the box's cores are not
 * equal (performance + efficiency), so a static deal leaves a tail.
 */
export const PARALLEL = Object.freeze({ workers: 4, rowsPerJob: 24, maskRowsPerJob: 64, inflightPerWorker: 2 });

/** PlaneGeometry(span, span, segs, segs).rotateX(-PI/2) as typed arrays (positions' y left 0). */
function planeArrays(span, segs) {
  const side = segs + 1, count = side * side, step = span / segs, half = span / 2;
  const position = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const index = new Uint32Array(segs * segs * 6);
  const X = new Float32Array(side);
  for (let c = 0; c < side; c++) X[c] = c * step - half;
  for (let iz = 0, i = 0; iz < side; iz++) {
    const v = 1 - iz / segs;
    for (let ix = 0; ix < side; ix++, i++) {
      position[i * 3] = X[ix]; position[i * 3 + 2] = X[iz];
      uv[i * 2] = ix / segs; uv[i * 2 + 1] = v;
    }
  }
  for (let iy = 0, o = 0; iy < segs; iy++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = ix + side * iy, b = ix + side * (iy + 1), c = ix + 1 + side * (iy + 1), d = ix + 1 + side * iy;
      index[o++] = a; index[o++] = b; index[o++] = d;
      index[o++] = b; index[o++] = c; index[o++] = d;
    }
  }
  return { position, uv, index };
}

/**
 * TODAY'S `_buildMesh`, every pass, on a pool of `workers` module workers —
 * COLD: the pool is spawned, imports the module and builds its module grids
 * inside the timed window, and is terminated before this returns (no worker
 * outlives the call). The per-sample passes run in the workers through
 * today's own functions — heights (`getHeight`), vertex colours
 * (`_vertexColor`), the three 512² masks (`_maskTexel`), the three detail
 * bakes (`_bakeDetail`, configs read from today's source) — and the
 * rim-widened normals (today's loop, without its per-vertex array). The page
 * thread builds the PlaneGeometry arrays and the filtered field
 * (`_smoothField`, today's) and assembles. The returned geometry and textures
 * are what `_buildMesh` leaves behind: prove it with
 * `compareBuilds(realBuild(...), parallelBuild(...))`.
 *
 * @param {{ mod: object, patched: string, detailCfgs: object[] }} TL   from loadTerrainAt()
 * @param {{ span: number, segs: number, workers?: number }} size
 * @returns {Promise<{ ms: object, vertices: number, span: number, segs: number, workers: number,
 *   workerBusyMs: number, jobs: number, geometry: THREE.BufferGeometry, outputs: () => object, dispose: () => void }>}
 */
export async function parallelBuild(TL, { span, segs, workers = PARALLEL.workers }) {
  const I = TL.mod.__probeInternals;
  const side = segs + 1, count = side * side;
  const ms = {};
  const T0 = performance.now();
  const termUrl = URL.createObjectURL(new Blob([TL.patched], { type: 'text/javascript' }));
  const wUrl = URL.createObjectURL(new Blob([WORKER_SRC(termUrl)], { type: 'text/javascript' }));
  const pool = [], inflight = [];
  const pending = new Map();
  const queue = [];
  let seq = 0, failed = null, busy = 0, jobs = 0;
  const fail = (why) => {
    failed = failed || why;
    for (const p of pending.values()) p.reject(new Error(failed));
    pending.clear();
  };
  const post = (k, msg, transfer) => new Promise((resolve, reject) => {
    if (failed) { reject(new Error(failed)); return; }
    const id = ++seq;
    pending.set(id, { resolve, reject, k });
    pool[k].postMessage(Object.assign({ id }, msg), transfer || []);
  });
  const onMsg = (ev) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.error) { fail(ev.data.error); p.reject(new Error(ev.data.error)); return; }
    busy += ev.data.ms || 0;
    p.resolve(ev.data);
  };
  /** deal queued jobs to workers with < inflightPerWorker outstanding */
  const pump = () => {
    for (let k = 0; k < pool.length && queue.length; k++) {
      while (inflight[k] < PARALLEL.inflightPerWorker && queue.length) {
        const job = queue.shift();
        inflight[k]++; jobs++;
        post(k, job.msg).then((r) => { inflight[k]--; job.done(r); pump(); }, (err) => job.fail(err));
      }
    }
  };
  const enqueue = (msg, front) => new Promise((done, failJob) => {
    const job = { msg, done, fail: failJob };
    if (front) queue.unshift(job); else queue.push(job);
  });
  const out = { geometry: null, masks: null, detail: null, H: null, HS: null, mat: null };
  const terminate = () => {
    for (const w of pool) { w.onmessage = null; w.onerror = null; w.terminate(); }
    pool.length = 0; queue.length = 0;
    URL.revokeObjectURL(wUrl); URL.revokeObjectURL(termUrl);
  };
  try {
    for (let k = 0; k < workers; k++) {
      const w = new Worker(wUrl, { type: 'module' });
      w.onmessage = onMsg;
      w.onerror = (ev) => { if (ev.preventDefault) ev.preventDefault(); fail('worker error: ' + (ev.message || 'unknown')); };
      pool.push(w); inflight.push(0);
    }
    // ---- phase A: heights, then the size-independent bakes (which also fill the filtered-field gap) ----
    let t = performance.now();
    const R = PARALLEL.rowsPerJob;
    const hJobs = [];
    for (let r = 0; r < side; r += R) hJobs.push({ r0: r, p: enqueue({ op: 'heights', span, segs, r0: r, r1: Math.min(side, r + R) }) });
    const aJobs = [];
    for (const cfg of TL.detailCfgs) aJobs.push({ kind: 'detail', p: enqueue({ op: 'detail', cfg }) });
    for (let r = 0; r < I.MASK_N; r += PARALLEL.maskRowsPerJob) {
      aJobs.push({ kind: 'masks', r0: r, p: enqueue({ op: 'masks', r0: r, r1: Math.min(I.MASK_N, r + PARALLEL.maskRowsPerJob) }) });
    }
    pump();
    const { position, uv, index } = planeArrays(span, segs);   // page thread, meanwhile
    ms.geometryArrays = performance.now() - t;
    const H = new Float32Array(count);
    for (const j of hJobs) H.set((await j.p).out, j.r0 * side);
    for (let i = 0; i < count; i++) position[i * 3 + 1] = H[i];
    ms.heights = performance.now() - t;          // wall clock to the last height row, spawn + module import included

    // ---- the filtered field (today's _smoothField) on the page thread ----
    t = performance.now();
    const HS = I.smoothField(H, side, 10, 2);
    ms.smooth = performance.now() - t;

    // ---- phase B: vertex colours + normals in the workers, ahead of any bake still queued ----
    t = performance.now();
    const fieldsP = pool.map((w, k) => post(k, { op: 'fields', span, segs, H, HS }));
    const cJobs = [];
    for (let r = 0; r < side; r += R) cJobs.push({ r0: r, p: enqueue({ op: 'colorsNormals', r0: r, r1: Math.min(side, r + R) }, false) });
    // colour jobs go before any bake not yet dealt (front of the queue, in row order)
    const cq = queue.splice(queue.length - cJobs.length, cJobs.length);
    queue.unshift(...cq);
    pump();
    await Promise.all(fieldsP);
    const colors = new Float32Array(count * 3), normals = new Float32Array(count * 3);
    for (const j of cJobs) { const r = (await j.p).out; colors.set(r[0], j.r0 * side * 3); normals.set(r[1], j.r0 * side * 3); }
    ms.colorsNormals = performance.now() - t;

    // ---- assemble what _buildMesh leaves: geometry, the three masks, the three detail textures ----
    t = performance.now();
    const N = I.MASK_N, md = [new Uint8Array(N * N * 4), new Uint8Array(N * N * 4), new Uint8Array(N * N * 4)];
    const detailData = [];
    for (const j of aJobs) {
      const r = await j.p;
      if (j.kind === 'detail') detailData.push(r.out);
      else for (let q = 0; q < 3; q++) md[q].set(r.out[q], j.r0 * N * 4);
    }
    ms.bakesWait = performance.now() - t;
    const TH = I.THREE;
    const geo = new TH.BufferGeometry();
    geo.setAttribute('position', new TH.BufferAttribute(position, 3));
    geo.setAttribute('normal', new TH.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new TH.BufferAttribute(uv, 2));
    geo.setAttribute('color', new TH.BufferAttribute(colors, 3));
    geo.setIndex(new TH.BufferAttribute(index, 1));
    const masks = md.map((data) => {                      // _buildMasks' mk()
      const tx = new TH.DataTexture(data, N, N, TH.RGBAFormat);
      tx.minFilter = TH.LinearFilter; tx.magFilter = TH.LinearFilter;
      tx.wrapS = tx.wrapT = TH.ClampToEdgeWrapping; tx.needsUpdate = true;
      return tx;
    });
    const detail = detailData.map((data) => {            // _bakeDetail's tail
      const tx = new TH.DataTexture(data, 256, 256, TH.RGBAFormat);
      tx.wrapS = tx.wrapT = TH.RepeatWrapping;
      tx.minFilter = TH.LinearMipmapLinearFilter; tx.magFilter = TH.LinearFilter;
      tx.generateMipmaps = true; tx.anisotropy = 4; tx.needsUpdate = true;
      return tx;
    });
    const mat = new TH.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
    ms.total = performance.now() - T0;
    Object.assign(out, { geometry: geo, masks, detail, H, HS, mat });
  } catch (err) {
    terminate();
    throw new Error('parallelBuild: ' + (failed || err.message));
  }
  terminate();                                              // no worker outlives the build
  ms.afterTerminate = performance.now() - T0;
  return {
    ms: roundAll(ms), vertices: count, span: +span.toFixed(1), segs, workers,
    workerBusyMs: +busy.toFixed(1), jobs,
    geometry: out.geometry,
    outputs: () => ({ geometry: out.geometry, H: out.H, HS: out.HS, masks: out.masks, detail: out.detail }),
    dispose() {
      out.geometry?.dispose(); out.mat?.dispose();
      for (const tx of [...(out.masks || []), ...(out.detail || [])]) tx.dispose();
      out.geometry = out.mat = out.masks = out.detail = out.H = out.HS = null;
    },
  };
}

/**
 * Bit-for-bit comparison of two builds' outputs (`.outputs()` of realBuild /
 * parallelBuild): every vertex attribute, the index, the height grid and its
 * filtered copy, the three masks and the three detail bakes (bytes compared
 * through 32-bit views, so -0 ≠ +0 and NaN payloads count), plus every
 * sampling parameter of the six textures.
 * @returns {{ equal: boolean, buffers: object, params: object[], differing: string[] }}
 */
export function compareBuilds(a, b) {
  const A = a.outputs(), B = b.outputs();
  const words = (x) => (x.byteLength % 4 === 0 ? new Uint32Array(x.buffer, x.byteOffset, x.byteLength / 4) : new Uint8Array(x.buffer, x.byteOffset, x.byteLength));
  const cmp = (x, y) => {
    if (!x || !y) return { length: [x ? x.length : null, y ? y.length : null], diffs: null };
    if (x.constructor !== y.constructor || x.length !== y.length) return { type: [x.constructor.name, y.constructor.name], length: [x.length, y.length], diffs: null };
    const u = words(x), v = words(y);
    let diffs = 0, first = -1;
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) { if (first < 0) first = i; diffs++; }
    return { length: x.length, diffs, first };
  };
  const buffers = {};
  const keysA = Object.keys(A.geometry.attributes), keysB = Object.keys(B.geometry.attributes);
  buffers.attributeSet = { a: keysA.join(','), b: keysB.join(','), diffs: keysA.join(',') === keysB.join(',') ? 0 : null };
  for (const key of keysA) buffers[key] = cmp(A.geometry.attributes[key].array, B.geometry.attributes[key]?.array);
  buffers.index = cmp(A.geometry.index.array, B.geometry.index?.array);
  buffers.H = cmp(A.H, B.H);
  buffers.HS = cmp(A.HS, B.HS);
  A.masks.forEach((tx, q) => { buffers['mask' + (q + 1)] = cmp(tx.image.data, B.masks[q]?.image.data); });
  A.detail.forEach((tx, q) => { buffers['detail' + q] = cmp(tx.image.data, B.detail[q]?.image.data); });
  const P = ['format', 'type', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'generateMipmaps', 'anisotropy', 'flipY', 'unpackAlignment', 'colorSpace'];
  const params = [...A.masks, ...A.detail].map((tx, q) => {
    const ty = [...B.masks, ...B.detail][q];
    const bad = P.filter((p) => !ty || tx[p] !== ty[p] || tx.image.width !== ty.image.width || tx.image.height !== ty.image.height);
    return { texture: q < 3 ? 'mask' + (q + 1) : 'detail' + (q - 3), bad };
  });
  const differing = Object.keys(buffers).filter((k) => buffers[k].diffs !== 0)
    .concat(params.filter((p) => p.bad.length).map((p) => p.texture + ' params ' + p.bad.join('/')));
  return { equal: differing.length === 0, buffers, params, differing };
}

/* ----------------------------- the frozen navgrid at another R ----------------------------- */

/**
 * The Round-4 `Nav` class, compiled against `PLAY_RADIUS = playRadius` and
 * `riverFactor = () => 0`. Fetches the module exactly as Vite serves it to the
 * game, rebinds the two imports, and loads it from a blob URL; three and every
 * other import resolve to the SAME module instances the game uses. Throws if
 * an anchor moved (the probe must never silently measure something else).
 *
 * @param {number} playRadius
 * @returns {Promise<{ Nav: Function, R: number, N: number, source: string }>}
 */
export async function loadNavAt(playRadius = PROBE.playRadius) {
  const res = await fetch('/src/core/nav.js');
  const src = await res.text();
  const reRiver = /import \{ riverFactor \} from "[^"]+";/;
  const reExtent = /import \{ PLAY_RADIUS, EXTENT \} from "[^"]+";/;
  if (!reRiver.test(src) || !reExtent.test(src)) throw new Error('nav.js import anchors moved — probe refuses to guess');
  const ext = await import('/src/world/island/extent.js');
  const patched = src
    .replace(reRiver, 'const riverFactor = () => 0; // W1 contract (plan §1.2): riverFactor returns 0')
    .replace(reExtent, `const PLAY_RADIUS = ${Number(playRadius)}; const EXTENT = ${JSON.stringify(ext.EXTENT)};`)
    .replace(/from "\//g, `from "${location.origin}/`);
  const url = URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }));
  let mod;
  try { mod = await import(/* @vite-ignore */ url); } finally { URL.revokeObjectURL(url); }
  const R = playRadius + ext.EXTENT.navSpan;
  return { Nav: mod.Nav, R, N: (R * 2) / 2 + 1, source: 'src/core/nav.js (Vite-served, 2 imports rebound)' };
}

/**
 * Build the navgrid at R with `getHeight` as the terrain and `collision` as
 * the static blocker set, timing the three phases of the frozen build.
 *
 * @returns {{ nav: object, N: number, ms: object, open: number, blocked: number, dispose: () => void }}
 */
export function buildNav(Nav, { getHeight, collision, pools = [] }) {
  const ctx = { terrain: { getHeight }, environment: { water: { pools } } };
  const nav = new Nav(ctx, collision);
  const ms = {};
  let t = performance.now();
  const phases = ['height', 'cost', 'stamp'];
  for (const ph of phases) {
    t = performance.now();
    while (nav._phase === ph) nav._buildSlice(1e9);
    ms[ph] = +(performance.now() - t).toFixed(1);
  }
  ms.total = +(ms.height + ms.cost + ms.stamp).toFixed(1);
  let open = 0;
  const c = nav.cost;
  for (let i = 0; i < c.length; i++) if (c[i] !== 0) open++;
  return {
    nav, N: nav.N, ms, open, blocked: c.length - open, ready: nav.ready,
    dispose() { nav._fields?.clear?.(); },
  };
}
