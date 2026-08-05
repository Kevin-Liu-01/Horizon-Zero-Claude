import * as THREE from 'three';

/* ---------------- Simplex noise (Stefan Gustavson's public-domain impl) -------- */
const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

export class SimplexNoise {
  constructor(seed = 1337) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(xin, yin) {
    const { perm, permMod12 } = this;
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = GRAD3[permMod12[ii + perm[jj]]];
      t0 *= t0;
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = GRAD3[permMod12[ii + i1 + perm[jj + j1]]];
      t1 *= t1;
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = GRAD3[permMod12[ii + 1 + perm[jj + 1]]];
      t2 *= t2;
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  /** Fractal Brownian motion. */
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

/* ------------------------------- Terrain --------------------------------- */

export const WORLD_SIZE = 720;         // playable square, meters
export const WORLD_HALF = WORLD_SIZE / 2;

const SS = THREE.MathUtils.smoothstep; // (x, min, max)

/**
 * Terracing: pulls a height toward stepped strata benches. Continuous and
 * C1-friendly (smooth bench lips), cheap enough for the analytic hot path.
 */
function terrace(h, step, sharp) {
  const t = h / step;
  const fl = Math.floor(t);
  let f = (t - fl - 0.5) * sharp + 0.5;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  const sm = f * f * (3 - 2 * f);
  return (fl + sm) * step;
}

/* --------------------------- dried river (west) ---------------------------
 * Pure trig so getHeight stays fast. Meanders roughly N-S through the west
 * meadow, fading out well before the mountain rim so it stays crossable and
 * never cuts a canyon through the ring.
 */
function riverCenterX(z) {
  return -125 + 38 * Math.sin(z * 0.008) + 14 * Math.sin(z * 0.023 + 1.7);
}
function riverHalfWidth(z) {
  return 13 + 3 * Math.sin(z * 0.021 + 0.5);
}

/**
 * Dried-river channel factor 0..1: ~1 across the silt bed, fading to 0 at the
 * bank tops. Exported so vegetation/gather scatter can keep the channel bare
 * (grass, pines and rocks all reject high values). Cheap: trig + smoothsteps
 * behind a coarse bounding test.
 */
export function riverFactor(x, z) {
  if (x < -200 || x > -50) return 0;
  const r2 = x * x + z * z;
  if (r2 > 302 * 302) return 0;
  const hw = riverHalfWidth(z);
  const rd = Math.abs(x - riverCenterX(z));
  if (rd >= hw * 1.05) return 0;
  return (1 - SS(rd, hw * 0.3, hw * 1.05)) * (1 - SS(Math.sqrt(r2), 250, 302));
}

/**
 * SE rocky-highland shelf mask 0..1 (matches the landform term in getHeight).
 * Exported so vegetation can thin filler grass over the rocky benches.
 */
export function shelfFactor(x, z) {
  const u = (x + z) * 0.70711;
  if (u <= 118) return 0;
  const r = Math.sqrt(x * x + z * z);
  if (r >= 344) return 0;
  const v = Math.abs((z - x) * 0.70711);
  return SS(u, 120, 178) * (1 - SS(v, 85, 150)) * (1 - SS(r, 288, 344));
}

/* ------------------------- worn dirt paths (camp) --------------------------
 * A few trodden routes radiating from the hunter camp (22,30):
 *   west to the dried river crossing, south toward the Thunderjaw territory,
 *   south-east up onto the highland shelf, and a short north trail.
 * pathFactor(x,z) -> 0..1 "how worn is the ground here". Used by the terrain
 * splat for packed-dirt coloring and to thin tall grass; harmless (0) for any
 * caller/area that ignores it.
 */
const PATH_POINTS = [
  // west: camp -> river ford -> a little beyond the far bank
  [[22, 30], [-16, 24], [-52, 14], [-84, 6], [-109, 8], [-136, 12]],
  // south: camp -> Thunderjaw flats
  [[22, 30], [27, -8], [35, -52], [28, -104], [23, -160], [30, -202]],
  // south-east: camp -> highland shelf
  [[22, 30], [58, 50], [96, 80], [136, 116], [168, 148], [188, 172]],
  // north spur
  [[22, 30], [9, 72], [-2, 118], [-13, 156]],
];
const PATH_CORE = 1.7;   // full-strength half width (m)
const PATH_EDGE = 4.6;   // fades to zero by here (m)

function _catmullRom(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t
    + (2 * a - 5 * b + 4 * c - d) * t2
    + (-a + 3 * b - 3 * c + d) * t3);
}

let _pathSegs = null;
function _buildPathSegs() {
  _pathSegs = [];
  for (const pts of PATH_POINTS) {
    // sample the control polygon into a smooth polyline
    const line = [];
    const per = 7;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
      const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = 0; j < per; j++) {
        const t = j / per;
        line.push([
          _catmullRom(p0[0], p1[0], p2[0], p3[0], t),
          _catmullRom(p0[1], p1[1], p2[1], p3[1], t),
        ]);
      }
    }
    line.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);

    // segments carry a wear strength that fades toward the far end
    const M = line.length - 1;
    for (let i = 0; i < M; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const s0 = 1 - SS(i / M, 0.68, 1.0);
      const s1 = 1 - SS((i + 1) / M, 0.68, 1.0);
      const dx = bx - ax, dz = bz - az;
      _pathSegs.push({
        ax, az, bx, bz, dx, dz,
        len2: Math.max(1e-6, dx * dx + dz * dz),
        s0, s1,
        minx: Math.min(ax, bx) - PATH_EDGE, maxx: Math.max(ax, bx) + PATH_EDGE,
        minz: Math.min(az, bz) - PATH_EDGE, maxz: Math.max(az, bz) + PATH_EDGE,
      });
    }
  }
}

/** Exact analytic path wear — used for baking (splat mask + grid cache). */
function _pathFactorExact(x, z) {
  if (!_pathSegs) _buildPathSegs();
  let f = 0;
  const segs = _pathSegs;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (s.ax + s.dx * t), ez = z - (s.az + s.dz * t);
    const d = Math.sqrt(ex * ex + ez * ez);
    let v = 1 - SS(d, PATH_CORE, PATH_EDGE);
    if (v <= 0) continue;
    v *= s.s0 + (s.s1 - s.s0) * t;
    if (v > f) f = v;
  }
  return f;
}

// grid-cached bilinear lookup so gameplay-frequency callers stay cheap
const PG_N = 288, PG_HALF = 352;
let _pathGrid = null;
function _buildPathGrid() {
  _pathGrid = new Float32Array(PG_N * PG_N);
  const cell = (PG_HALF * 2) / PG_N;
  for (let iz = 0; iz < PG_N; iz++) {
    const z = -PG_HALF + (iz + 0.5) * cell;
    for (let ix = 0; ix < PG_N; ix++) {
      _pathGrid[iz * PG_N + ix] = _pathFactorExact(-PG_HALF + (ix + 0.5) * cell, z);
    }
  }
}

/** Worn-path factor 0..1 at world (x,z). Fast (cached grid, bilinear). */
export function pathFactor(x, z) {
  if (!_pathGrid) _buildPathGrid();
  const cell = (PG_HALF * 2) / PG_N;
  const fx = (x + PG_HALF) / cell - 0.5;
  const fz = (z + PG_HALF) / cell - 0.5;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= PG_N - 1 || iz >= PG_N - 1) return 0;
  const tx = fx - ix, tz = fz - iz;
  const g = _pathGrid, i0 = iz * PG_N + ix;
  const a = g[i0] + (g[i0 + 1] - g[i0]) * tx;
  const b = g[i0 + PG_N] + (g[i0 + PG_N + 1] - g[i0 + PG_N]) * tx;
  return a + (b - a) * tz;
}

/**
 * Heightfield terrain: analytic height function sampled both by the mesh and
 * by gameplay queries, so they always agree.
 *
 * v2 landform: rolling meadow center; dried river cut meandering N-S through
 * the west meadow (smooth crossable banks); rocky terraced highland shelf in
 * the SE; ridged-noise mountain rim with strata benches and snow only on the
 * upper peaks.
 */
export class Terrain {
  constructor(ctx) {
    this.ctx = ctx;
    this.noise = new SimplexNoise(20770228);
    this.grassNoise = new SimplexNoise(41);

    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this._buildMesh();
    ctx.scene.add(this.group);
  }

  /** Ridged fbm (0..~0.94): sharp crests, good for mountains. */
  _ridged(x, z, oct) {
    const n = this.noise;
    let amp = 0.5, sum = 0, fx = x, fz = z;
    for (let o = 0; o < oct; o++) {
      const v = 1 - Math.abs(n.noise2D(fx, fz));
      sum += v * v * amp;
      amp *= 0.5; fx *= 2.05; fz *= 2.05;
    }
    return sum;
  }

  /** Analytic terrain height at world (x, z). */
  getHeight(x, z) {
    const n = this.noise;
    const r = Math.sqrt(x * x + z * z);

    // Dried-river floodplain corridor (west): damps the mid/fine relief so the
    // banks stay gentle and crossable no matter what the noise does.
    let corridor = 0, riverGate = 0, rd = Infinity, hw = 1;
    if (x > -222 && x < -30 && r < 304) {
      const cxr = riverCenterX(z);
      hw = riverHalfWidth(z);
      rd = Math.abs(x - cxr);
      if (rd < hw + 26) {
        riverGate = 1 - SS(r, 250, 302);
        corridor = (1 - SS(rd, hw * 0.5, hw + 24)) * riverGate;
      }
    }

    // Broad rolling meadow
    let h = n.fbm(x * 0.0035, z * 0.0035, 4) * 9;
    // Medium undulation + close-range relief (flattened across the floodplain)
    h += (n.fbm(x * 0.012 + 100, z * 0.012 - 60, 3) * 2.2
      + n.fbm(x * 0.05 - 31, z * 0.05 + 58, 2) * 0.5) * (1 - corridor * 0.8);

    // Gentle valley basin toward the center
    h -= (1 - SS(r, 0, WORLD_HALF * 0.5)) * 2.5;

    // Rocky SE highland shelf (terraced sediment benches)
    const u = (x + z) * 0.70711;
    if (u > 118 && r < 348) {
      const v = Math.abs((z - x) * 0.70711);
      const m = SS(u, 120, 178) * (1 - SS(v, 85, 150)) * (1 - SS(r, 288, 344));
      if (m > 0.002) {
        // the worn trail smooths the bench risers into a climbable ramp:
        // full path wear kills the terracing AND softens the ridged relief
        // so the trail never meets a stair-step cliff
        const pf = Math.min(1, pathFactor(x, z) * 1.75);
        const sh = 8.5
          + this._ridged(x * 0.010 + 7, z * 0.010 - 13, 3) * 7.5 * (1 - 0.4 * pf);
        const ter = terrace(sh, 3.4, 2.2);
        h += m * (pf > 0.002 ? ter + (sh - ter) * pf : ter);
      }
    }

    // Dried river cut through the west meadow (fades before rim). ~2.6 m deep
    // mid-channel (smoothstep banks stay <= ~0.3 slope over the 13 m half
    // width); the worn crossing packs a shallow gravel bar so the ford is a
    // genuine easy crossing.
    if (rd < hw && riverGate > 0) {
      const t = 1 - rd / hw;
      const bowl = t * t * (3 - 2 * t);
      const ford = 1 - 0.45 * pathFactor(x, z);
      // depth scales with local width so bank slope stays ~<=0.29 everywhere
      const dMax = Math.min(2.95, hw * 0.195);
      h -= dMax * (0.87 * bowl + 0.13 * bowl * bowl) * riverGate * ford;
      // braided bed unevenness
      h += bowl * riverGate * n.noise2D(x * 0.06 + 5, z * 0.06 - 9) * 0.22;
    }

    // Rim mountains: ridged crests rising outside ~78% of the world radius,
    // pulled toward horizontal strata benches
    const rim = SS(r, WORLD_HALF * 0.78, WORLD_HALF * 1.06);
    if (rim > 0) {
      const ridge = this._ridged(x * 0.006 + 31, z * 0.006 + 7, 4);
      h += rim * rim * (34 + ridge * 46);
      const ta = 0.55 * SS(rim, 0.15, 0.7);
      if (ta > 0.002) h = h * (1 - ta) + terrace(h, 6.8, 2.4) * ta;
    }
    return h;
  }

  getNormal(x, z, out = new THREE.Vector3()) {
    const e = 0.75;
    const hL = this.getHeight(x - e, z), hR = this.getHeight(x + e, z);
    const hD = this.getHeight(x, z - e), hU = this.getHeight(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
    return out;
  }

  /** Density of tall (stealth) grass at a point, 0..1. Thin on worn paths,
   *  bare across the dried riverbed, sparse on the rocky SE shelf. */
  tallGrassDensity(x, z) {
    const v = this.grassNoise.fbm(x * 0.016, z * 0.016, 2);
    let d = SS(v, 0.12, 0.42);
    if (d > 0) {
      const p = pathFactor(x, z);
      if (p > 0.03) d *= 1 - p * 0.85;
      const rf = riverFactor(x, z);
      if (rf > 0.02) d *= 1 - rf * 0.96;
      const sf = shelfFactor(x, z);
      if (sf > 0.02) d *= 1 - sf * 0.5;
    }
    return d;
  }

  isInTallGrass(x, z) {
    return this.tallGrassDensity(x, z) > 0.45;
  }

  /* ------------------------------ splat mask ------------------------------
   * 512^2 RGBA baked once: R = worn path, G = river-bank moisture,
   * B = dried river bed, A = SE rocky-shelf mask. Sampled in the fragment
   * shader for crisp ground features that vertex colors (≈2 m spacing)
   * would alias away.
   */
  _buildMask() {
    const N = 512;
    const data = new Uint8Array(N * N * 4);
    const scale = WORLD_SIZE / N;
    for (let iz = 0; iz < N; iz++) {
      const wz = (iz + 0.5) * scale - WORLD_HALF;
      for (let ix = 0; ix < N; ix++) {
        const wx = (ix + 0.5) * scale - WORLD_HALF;
        const o = (iz * N + ix) * 4;
        if (Math.abs(wx) > 348 || Math.abs(wz) > 348) continue; // clean border
        const r = Math.sqrt(wx * wx + wz * wz);

        const path = _pathFactorExact(wx, wz);

        const rd = Math.abs(wx - riverCenterX(wz));
        const hw = riverHalfWidth(wz);
        const gate = 1 - SS(r, 250, 302);
        // riparian greening hugs ~1.5 half-widths of the channel
        const moist = (1 - SS(rd, hw * 0.55, hw * 1.6)) * gate;
        const bed = (1 - SS(rd, hw * 0.25, hw * 0.8)) * gate;

        data[o] = (path * 255) | 0;
        data[o + 1] = (moist * 255) | 0;
        data[o + 2] = (bed * 255) | 0;
        data[o + 3] = (shelfFactor(wx, wz) * 255) | 0;
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  _buildMesh() {
    const segs = 500;
    const size = WORLD_SIZE * 1.35;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const count = pos.count;
    const side = segs + 1;
    const step = size / segs;

    // pass 1: heights (cached so the color pass gets slopes for free)
    const H = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const h = this.getHeight(pos.getX(i), pos.getZ(i));
      pos.setY(i, h);
      H[i] = h;
    }

    // pass 2: colors from cached heights + finite-difference slope
    const colors = new Float32Array(count * 3);
    const cLush = new THREE.Color('#46651e');   // moist rich green (riparian)
    const cGrass = new THREE.Color('#7a8b3f');  // meadow base
    const cDry = new THREE.Color('#a99354');    // sun-dried gold
    const cOchre = new THREE.Color('#a87840');  // umber/ochre dry patches
    const cDirt = new THREE.Color('#6e5a3e');
    const cRock = new THREE.Color('#7d7a72');
    const cRockWarm = new THREE.Color('#8b7355'); // warm umber rock variant
    const cSilt = new THREE.Color('#948468');   // pale dried riverbed
    const cSnow = new THREE.Color('#dcdfe2');
    const tmp = new THREE.Color();
    const tmp2 = new THREE.Color();
    const gn = this.grassNoise;

    for (let iz = 0; iz <= segs; iz++) {
      for (let ix = 0; ix <= segs; ix++) {
        const i = iz * side + ix;
        const x = pos.getX(i), z = pos.getZ(i);
        const h = H[i];

        // slope (tan) from cached neighbors
        const iL = ix > 0 ? i - 1 : i, iR = ix < segs ? i + 1 : i;
        const iD = iz > 0 ? i - side : i, iU = iz < segs ? i + side : i;
        const gx = (H[iR] - H[iL]) / (((iR - iL) || 1) * step);
        const gz = (H[iU] - H[iD]) / ((((iU - iD) / side) || 1) * step);
        const m = Math.sqrt(gx * gx + gz * gz);

        const r = Math.hypot(x, z);
        const rim = SS(r, WORLD_HALF * 0.78, WORLD_HALF * 1.02);

        // moisture / dryness fields
        const dryness = gn.fbm(x * 0.01 + 9, z * 0.01 - 4, 2) * 0.5 + 0.5;
        const umber = SS(gn.fbm(x * 0.023 - 40, z * 0.023 + 31, 2), 0.18, 0.52);
        const rd = Math.abs(x - riverCenterX(z));
        const hw = riverHalfWidth(z);
        const gate = 1 - SS(r, 250, 302);
        // deeper, more saturated greening tight to the channel (~1.5 hw)
        const moist = (1 - SS(rd, hw * 0.55, hw * 1.6)) * gate;
        const bed = (1 - SS(rd, hw * 0.3, hw * 0.95)) * gate;

        tmp.copy(cGrass).lerp(cDry, dryness * 0.85);
        tmp.lerp(cOchre, umber * (1 - moist) * 0.5);
        tmp.lerp(cLush, moist * 0.85);
        tmp.lerp(cSilt, bed * 0.55); // fragment mask sharpens this

        // slope splat: dirt then bare rock
        if (m > 0.5) tmp.lerp(cDirt, SS(m, 0.5, 0.85));
        if (m > 0.75) tmp.lerp(cRock, SS(m, 0.75, 1.25));

        // SE highland shelf: rock + ochre read at much gentler slopes so the
        // benches look like layered stone, not grassy mounds
        const sf = shelfFactor(x, z);
        if (sf > 0.02) {
          tmp.lerp(cOchre, sf * 0.25 * (1 - SS(m, 0.3, 0.7)));
          tmp.lerp(cRock, sf * (0.45 + 0.4 * SS(m, 0.16, 0.55)));
        }

        // rim reads as rock — vary cool gray -> warm umber by low-freq noise
        // so big faces (esp. the south rim) don't wash into one flat beige
        if (rim > 0.01) {
          const rv = gn.fbm(x * 0.0065 - 21, z * 0.0065 + 44, 2) * 0.5 + 0.5;
          tmp2.copy(cRock).lerp(cRockWarm, rv * 0.85);
          tmp.lerp(tmp2, rim * 0.7);
          tmp.multiplyScalar(1 + (rv - 0.5) * 0.26 * rim);
        }
        if (h > 30) tmp.lerp(cRock, SS(h, 30, 46) * 0.55);
        const snow = SS(h, 52, 64);
        if (snow > 0) {
          tmp.lerp(cSnow, snow * (0.3 + 0.7 * rim) * (1 - 0.65 * SS(m, 1.3, 2.2)));
        }

        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const maskTex = this._buildMask();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    // World-space splat detail: value-noise breakup + mask-driven features
    // (worn paths, moist banks, dried bed) + strata banding on steep faces.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uMask = { value: maskTex };
      shader.uniforms.uDirtCol = { value: new THREE.Color('#7d5f3c') };
      shader.uniforms.uSiltCol = { value: new THREE.Color('#8f8065') };
      shader.uniforms.uMoistCol = { value: new THREE.Color('#46521f') };
      shader.uniforms.uStrataCol = { value: new THREE.Color('#8a7458') };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform sampler2D uMask;
uniform vec3 uDirtCol;
uniform vec3 uSiltCol;
uniform vec3 uMoistCol;
uniform vec3 uStrataCol;
float thash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float tnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(thash(i),thash(i+vec2(1,0)),f.x),
             mix(thash(i+vec2(0,1)),thash(i+vec2(1,1)),f.x),f.y);
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float dn = tnoise(vWPos.xz * 0.9) * 0.6 + tnoise(vWPos.xz * 0.16) * 0.4;
  diffuseColor.rgb *= 0.88 + dn * 0.24;                       // macro mottling
  diffuseColor.rgb *= 0.94 + tnoise(vWPos.xz * 7.0) * 0.12;   // fine grain

  vec4 mask = texture2D(uMask, clamp(vWPos.xz * ${(1 / WORLD_SIZE).toFixed(8)} + 0.5, 0.001, 0.999));

  // moist dark soil + greener growth along the dried river
  diffuseColor.rgb = mix(diffuseColor.rgb, uMoistCol * (0.8 + dn * 0.35), mask.g * 0.72);

  // dried riverbed: pale cracked silt with pebble grain
  float peb = tnoise(vWPos.xz * 2.6) * 0.6 + tnoise(vWPos.xz * 9.0) * 0.4;
  diffuseColor.rgb = mix(diffuseColor.rgb, uSiltCol * (0.72 + peb * 0.5), mask.b * 0.9);

  // rocky SE highland: gravelly stone breakup across the shelf flats
  float shelf = mask.a;
  if (shelf > 0.004) {
    float rg = tnoise(vWPos.xz * 1.9) * 0.55 + tnoise(vWPos.xz * 0.33) * 0.45;
    vec3 rockC = mix(vec3(0.30, 0.285, 0.245), vec3(0.52, 0.49, 0.42), rg);
    diffuseColor.rgb = mix(diffuseColor.rgb, rockC, shelf * 0.55);
  }

  // worn dirt paths: packed earth with trodden unevenness
  float pw = mask.r * (0.55 + 0.45 * tnoise(vWPos.xz * 1.4));
  diffuseColor.rgb = mix(diffuseColor.rgb, uDirtCol * (0.85 + dn * 0.25), min(pw * 1.15, 0.92));

  // world-space strata banding on steep faces; the shelf mask lowers the
  // slope threshold so bench risers band too. Band step/phase drift with a
  // low-freq sector noise and each bench gets its own albedo variance so the
  // banding reads as sediment, not wallpaper stripes.
  vec3 wn = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
  float steep = smoothstep(0.28 - 0.235 * shelf, 0.62 - 0.42 * shelf, 1.0 - abs(wn.y));
  if (steep > 0.003) {
    float sector = tnoise(vWPos.xz * 0.012);
    float bp = vWPos.y * mix(0.34, 0.82, sector)
             + tnoise(vWPos.xz * 0.045) * 4.5 + sector * 9.7;
    float band = smoothstep(-0.25, 0.55, sin(bp) + 0.5 * sin(bp * 2.31 + sector * 6.0));
    float bvar = thash(vec2(floor(bp * 0.159) * 0.171, floor(sector * 5.0) * 0.37));
    vec3 sc = mix(uStrataCol * 0.70, uStrataCol * 1.18, band) * (0.82 + 0.34 * bvar);
    diffuseColor.rgb = mix(diffuseColor.rgb, sc, steep * (0.38 + 0.30 * shelf));
  }
}`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain-mesh';
    this.group.add(this.mesh);
  }

  update() {}
}
