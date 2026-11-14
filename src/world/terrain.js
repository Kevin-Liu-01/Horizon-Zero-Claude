import * as THREE from 'three';
import { WORLD_SIZE, WORLD_HALF, PLAY_RADIUS, MESH_SPAN, MESH_SEGS } from './island/extent.js';
import { REST_SITE, TUBES, SALT_FIELD } from './island/sites.js';
import { BIOMES, CURRENT_DEPTH, biomesAt, heightAt, coverAt, authored } from './island/recipe.js';
import { GRID, MASK_N, PAN_N, PAN_BOX, SHORE_ENC, SKYLINE_N, bakeShade, maskTexel } from './island/bake.js';
import { bakeIsland } from './island/pool.js';
import { LAYER_FILES, LAYER_SIZE } from './island/layers.js';
import { fieldReader } from './island/scatter.js';
import {
  GROUND_VERT_PARS, GROUND_VERT_WORLD, TERRAIN_FRAG_PARS, TERRAIN_COLOR,
  GROUND_ROUGH, GROUND_NORMAL,
} from './island/groundShader.js';
import { IslandWater } from './water.js';

/**
 * ORCHIL'S GROUND (world-ground, Round 5 W1; bible §8, plan §2, §8.3).
 *
 * The heightfield is baked once at boot, by a pool of workers, from the pure recipe in
 * island/recipe.js; this module awaits that bake at its top level, so main.js constructs
 * `Terrain` on a finished island and `getHeight` is bilinear off the grid from the first
 * frame (plan §8.3: pool-terrain-build, getHeight-from-baked-grid, ≤ 600 ms).
 *
 * PUBLISHED API (`A-terrain-api`, frozen names):
 *   terrain.getHeight(x, z)          metres; the drawn surface, bilinear off the 1.94 m grid
 *   terrain.heightFast(x, z)         the same read
 *   terrain.heightInto(x, z, out, i) the same read into out[i] (no heap number per call; returns out)
 *   terrain.getNormal(x, z, out)     unit normal
 *   terrain.slopeFast(x, z)          |grad h| (0 flat, 1 = 45°)
 *   terrain.surfaceAt(x, z)          the audible vocabulary, one of Terrain.SURFACES
 *   terrain.materialAt(x, z)         the ground itself, one of Terrain.MATERIALS
 *   terrain.biomeAt(x, z)            one of Terrain.BIOMES
 *   terrain.biomeWeights(x, z, out)  { pans, holds, malpais, cloudline, flank, caldera }, Σ = 1
 *   terrain.tallGrassDensity(x, z)   0..1 cover; isInTallGrass(x, z) is > 0.45
 *   terrain.trench(id)               a tube's polyline (published W1, carved W3)
 *   terrain.water                    the IslandWater (also ctx.water and environment.water)
 *   stampStealthDisc(x, z, r), stealthField(x, z), WORLD_SIZE, WORLD_HALF, PLAY_RADIUS
 *   riverFactor(x, z)                STILL EXPORTED, RETURNS 0: frozen nav.js imports it
 *
 * Old landform exports are kept returning "no river / no shelf" until their last reader
 * (props.js, world-props W1) is gone; they read nothing and allocate nothing.
 */

/* ---------------- Simplex noise (Stefan Gustavson's public-domain impl) -------- */
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
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
    /* R48: two integers, not a destructured [a, b] per call. This one line was 35 MB/s. */
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
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

/* ------------------------------ extents + constants ------------------------------ */
export { WORLD_SIZE, WORLD_HALF, PLAY_RADIUS };

/* ------------------------------ the old river, gone ------------------------------
 * `riverFactor` stays exported and returns 0 everywhere (plan §1.2: frozen nav.js imports
 * it). The next three have one reader left, props.js, which world-props rewrites in W1. */
export function riverFactor() { return 0; }
export function riverCenterX() { return 1e6; }
export function riverHalfWidth() { return 0; }
export function shelfFactor() { return 0; }

/* ---------------------------------- vocabularies ---------------------------------- */
/**
 * MATERIAL → FOLEY SET. Published for `audio` (`A58b`): every material routes to a set that
 * exists in today's bank. The Pans' crust reads as gravel underfoot, the shingle as cobble.
 */
const SURFACE_AUDIO = Object.freeze({
  water: 'foot/water',
  sand: 'foot/dirt',
  salt: 'foot/gravel',
  silt: 'foot/silt',
  shingle: 'foot/cobble',
  rock: 'foot/rock',
  cinder: 'foot/gravel',
  dirt: 'foot/dirt',
  grass: 'foot/grass',
  // what salt, shingle and cinder emit to audio's closed table: the same foley set each
  shale: 'foot/gravel',
  cobble: 'foot/cobble',
  scree: 'foot/gravel',
});
const MATERIALS = Object.freeze(Object.keys(SURFACE_AUDIO));
/**
 * material → what `surfaceAt()` emits: a name audio's closed footstep table can voice
 * (src/audio/audio.js SURFACE_SET), so no surface ever falls off into `foot/grass`.
 */
const SURFACE_EMIT = Object.freeze({
  water: 'water', sand: 'sand', salt: 'shale', silt: 'silt', shingle: 'cobble',
  rock: 'rock', cinder: 'scree', dirt: 'dirt', grass: 'grass',
  shale: 'shale', cobble: 'cobble', scree: 'scree',
});
const SURFACES = Object.freeze([...new Set(Object.values(SURFACE_EMIT))]);

/** Applied after the lights: AO on the sky term, and the mirror. */
export const GROUND_AO = /* glsl */ `
#include <aomap_fragment>
reflectedLight.directDiffuse *= gSunVis;
/* Black sand and crust are full of micro-shadow: the Schlick lobe at a low sun would paint them tan. */
reflectedLight.directSpecular *= gSunVis * mix(0.2, 1.0, gLiquid);
reflectedLight.indirectDiffuse *= gAO * 2.3;   // open ground sees the whole sky: shade reads, black sand keeps its grain
reflectedLight.indirectSpecular *= mix(1.0, gAO, 0.6);
#ifdef USE_FOG
if (gLiquid > 0.004) {
  vec3 gV = normalize(cameraPosition - vWPos);
  vec3 gW = normalize(vWNorm + gN * 0.34);
  vec3 gR = reflect(-gV, gW);
  float gUp = clamp(gR.y * 1.8 + 0.08, 0.0, 1.0);
  vec3 gSky = mix(calFogHorizon, calFogZenith, gUp * gUp);
  float gSd = max(dot(gR, calSunDir), 0.0);
  gSky += calFogSun * pow(gSd, 6.0) * 0.55 * smoothstep(0.1, 0.34, gLiquid);
  float gF = 0.02 + 0.98 * pow(1.0 - max(dot(gV, gW), 0.0), 5.0);
  reflectedLight.indirectSpecular += gSky * gF * gLiquid * 0.95;
}
#endif
`;

/* -------------------------------------- bake -------------------------------------- */
/** The finished island. terrain.js does not evaluate until this resolves (see header). */
const BAKE = await bakeIsland();
const H = BAKE.H;
const { side: GS, step: GSTEP, half: GHALF } = GRID;

/* ---------------------------- fast grid reads (module scope) ---------------------- */
function gridHeight(x, z) {
  const fx = (x + GHALF) / GSTEP, fz = (z + GHALF) / GSTEP;
  if (fx < 0 || fz < 0 || fx >= GS - 1 || fz >= GS - 1) return -30;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * GS + ix;
  const a = H[o] + (H[o + 1] - H[o]) * tx;
  const b = H[o + GS] + (H[o + GS + 1] - H[o + GS]) * tx;
  return a + (b - a) * tz;
}

const MCELL = WORLD_SIZE / MASK_N;
/** Bilinear read of one byte channel of a mask, 0..1. */
function maskRead(M, ch, x, z) {
  const fx = (x + WORLD_HALF) / MCELL - 0.5, fz = (z + WORLD_HALF) / MCELL - 0.5;
  if (fx < 0 || fz < 0 || fx >= MASK_N - 1 || fz >= MASK_N - 1) return 0;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
  const o = (iz * MASK_N + ix) * 4 + ch;
  const a = M[o] + (M[o + 4] - M[o]) * tx;
  const b = M[o + MASK_N * 4] + (M[o + MASK_N * 4 + 4] - M[o + MASK_N * 4]) * tx;
  return (a + (b - a) * tz) / 255;
}

/** Packed salt tracks, for props.js and the map (bilinear over the baked mask). */
export function pathFactor(x, z) { return maskRead(BAKE.maskB, 1, x, z); }
export function pathSmooth(x, z) { return maskRead(BAKE.maskB, 1, x, z); }

/* ------------------------------ authored stealth cover ------------------------------
 * The cover field is the marram mask (maskB.r). Route cover is stamped into it at runtime
 * from the LIVE patrol routes (`A60`), through this one door, so the texture, the field,
 * and (via vegetation.invalidateAround) the plants all move on the same tick. `_stamps`
 * remembers the stamped bytes so `maskAudit()` can tell a stamp from a stale texel.
 */
const _stamps = new Uint8Array(MASK_N * MASK_N);
const _stampPending = [];

/** Cover may only be stamped where the marram scatter can stand: the field never claims plants it cannot have. */
let _stampR = null;
function stampable(x, z) {
  _stampR = _stampR || fieldReader({ H, maskA: BAKE.maskA, maskB: BAKE.maskB, shore: BAKE.shore });
  const F = _stampR.at(x, z);
  /* With a margin under every limit of `marramDensity`: the cover is read bilinearly between
   * texels, so a stamped texel next to one the scatter cannot plant must still be plantable. */
  if (F.glass > 0.05 || F.h < 0.35 || F.coast < 1.5 || F.slope > 0.82 || F.rock > 0.42 || F.track > 0.32) return false;
  return authored.pan(x, z).kind < 0;
}

export function stampStealthDisc(x, z, r) {
  _stampPending.push(x, z, r);
  const M = BAKE.maskB;
  const i0 = Math.max(0, Math.floor((x - r + WORLD_HALF) / MCELL));
  const i1 = Math.min(MASK_N - 1, Math.ceil((x + r + WORLD_HALF) / MCELL));
  const j0 = Math.max(0, Math.floor((z - r + WORLD_HALF) / MCELL));
  const j1 = Math.min(MASK_N - 1, Math.ceil((z + r + WORLD_HALF) / MCELL));
  const inner = r * 0.52;
  for (let j = j0; j <= j1; j++) {
    const gz = -WORLD_HALF + (j + 0.5) * MCELL;
    for (let i = i0; i <= i1; i++) {
      const gx = -WORLD_HALF + (i + 0.5) * MCELL;
      const d = Math.hypot(gx - x, gz - z);
      if (d >= r) continue;
      if (!stampable(gx, gz)) continue;
      const t = (d - inner) / (r - inner);
      const k = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
      const v = (k * 255) | 0;
      const c = j * MASK_N + i;
      if (v > _stamps[c]) _stamps[c] = v;
      const o = c * 4;
      if (v > M[o]) M[o] = v;
    }
  }
}

/** Authored stealth-cover field 0..1 (marram colonies + route stamps). */
export function stealthField(x, z) { return maskRead(BAKE.maskB, 0, x, z); }

/* ---------------------------------- biome weights ---------------------------------- */
const _bw = new Float64Array(6);
const _bwOut = { pans: 1, holds: 0, malpais: 0, cloudline: 0, flank: 0, caldera: 0 };

/** The six weights at a point, Σ = 1 ± 0.01 on land. Reuses one object unless `out` is given. */
export function biomeWeights(x, z, out = _bwOut) {
  biomesAt(x, z, _bw);
  out.pans = _bw[0]; out.holds = _bw[1]; out.malpais = _bw[2];
  out.cloudline = _bw[3]; out.flank = _bw[4]; out.caldera = _bw[5];
  return out;
}

/** The dominant biome id at a point. */
export function biomeAt(x, z) {
  biomesAt(x, z, _bw);
  let bi = 0;
  for (let b = 1; b < 6; b++) if (_bw[b] > _bw[bi]) bi = b;
  return BIOMES[bi];
}

/** What a biome mix does to low cover; only the Pans carry any at W1. */
export function biomeGrassDamp(w) { return w && w.pans > 0.5 ? 1 : 0.6; }

/* ---------------------------------- the skirt ---------------------------------- */
/**
 * Bible §8.1: two sister islands on the horizon, one a NW stratovolcano. They stand in a
 * group that rides along with the camera at ISLE_CARRY, so they keep the near-still parallax
 * of land 10 km off while every vertex stays inside the far plane (2,400 m) and the sky dome
 * (1,900 m). Positions are relative to that group.
 */
const ISLES = [
  // NW: the stratovolcano, 7-8 deg over the sea line from the Pans (LOOK L-15: 6-9 deg)
  { x: -960, z: -1090, r: 300, h: 196, seed: 4.1, kind: 'volcano', NR: 14, NA: 56 },
  // WSW: a long low tableland with sea cliffs all round
  { x: -1420, z: 400, r: 225, h: 46, seed: 9.7, kind: 'table', NR: 9, NA: 44 },
  // SSW: a lone basalt islet, a dark tooth on the haze
  { x: -640, z: 1360, r: 70, h: 58, seed: 2.3, kind: 'islet', NR: 6, NA: 28 },
];
const ISLE_CARRY = 0.8;

const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export class Terrain {
  constructor(ctx) {
    this.ctx = ctx;
    this.noise = new SimplexNoise(20770228);
    this.grassNoise = new SimplexNoise(41);

    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this._colliderIds = null;
    this._colliderTries = 0;
    this._uTime = { value: 0 };
    this._uSea = { value: 0 };
    this._uStrata = { value: 1 };
    this.bakeStats = BAKE.stats;
    /** Where the Pans' scatter stands (vegetation.js builds its draws from these). */
    this.scatterBake = BAKE.scatter;
    this.scatterFields = { H, maskA: BAKE.maskA, maskB: BAKE.maskB, shore: BAKE.shore };

    this._hg = { n: GS, step: GSTEP, half: GHALF, H };
    this._maskData = { N: MASK_N, d1: BAKE.maskA, d2: BAKE.maskB, d3: BAKE.shore, pan: BAKE.pan, tex: null };

    this._buildTextures();
    this._buildMesh();
    this._buildSkirt();
    ctx.scene.add(this.group);

    /* The sea and the Glass live here so `ctx.terrain` is whole on its own. world-sky's
     * environment.js reaches them through the RiverWater alias or ctx.water (water.js). */
    this.water = new IslandWater(ctx, this);
    ctx.water = this.water;
  }

  /** The surface vocabulary `audio`, machine footfalls and the gates read. */
  static get SURFACES() { return SURFACES; }
  /** The fine ground vocabulary `materialAt()` reports. */
  static get MATERIALS() { return MATERIALS; }
  /** material -> emitted surface. */
  static get SURFACE_EMIT() { return SURFACE_EMIT; }
  /** Orchil's six biomes, fidelity order in bible §8.3. */
  static get BIOMES() { return BIOMES; }
  /** material -> foley set (`A58b`). */
  static get SURFACE_AUDIO() { return SURFACE_AUDIO; }

  /* -------------------------------- heights -------------------------------- */
  /* R48 (c): the bilinear read is written out here rather than called: a double handed back
   * from a call that is not inlined is boxed on the heap, and the per-function bar is 4 KB/s. */
  getHeight(x, z) {
    const fx = (x + GHALF) / GSTEP, fz = (z + GHALF) / GSTEP;
    if (fx < 0 || fz < 0 || fx >= GS - 1 || fz >= GS - 1) return -30;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * GS + ix;
    const a = H[o] + (H[o + 1] - H[o]) * tx;
    return a + (H[o + GS] + (H[o + GS + 1] - H[o + GS]) * tx - a) * tz;
  }
  /**
   * The same read, written into `out[i]` (any typed or plain array) instead of returned: a
   * caller in a hot loop that is not inlined gets no heap number per call (R48 c). Returns `out`.
   */
  heightInto(x, z, out, i = 0) {
    const fx = (x + GHALF) / GSTEP, fz = (z + GHALF) / GSTEP;
    if (fx < 0 || fz < 0 || fx >= GS - 1 || fz >= GS - 1) { out[i] = -30; return out; }
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * GS + ix;
    const a = H[o] + (H[o + 1] - H[o]) * tx;
    out[i] = a + (H[o + GS] + (H[o + GS + 1] - H[o + GS]) * tx - a) * tz;
    return out;
  }
  heightFast(x, z) {
    const fx = (x + GHALF) / GSTEP, fz = (z + GHALF) / GSTEP;
    if (fx < 0 || fz < 0 || fx >= GS - 1 || fz >= GS - 1) return -30;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * GS + ix;
    const a = H[o] + (H[o + 1] - H[o]) * tx;
    return a + (H[o + GS] + (H[o + GS + 1] - H[o + GS]) * tx - a) * tz;
  }

  /** The recipe's own height at a point: what the grid was baked from (gates only). */
  recipeHeight(x, z) { return heightAt(x, z); }

  getNormal(x, z, out = new THREE.Vector3()) {
    const e = GSTEP * 0.5;
    const hL = gridHeight(x - e, z), hR = gridHeight(x + e, z);
    const hD = gridHeight(x, z - e), hU = gridHeight(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
    return out;
  }

  slopeFast(x, z) {
    const e = GSTEP;
    const gx = (gridHeight(x + e, z) - gridHeight(x - e, z)) / (2 * e);
    const gz = (gridHeight(x, z + e) - gridHeight(x, z - e)) / (2 * e);
    return Math.sqrt(gx * gx + gz * gz);
  }

  /* -------------------------------- fields -------------------------------- */
  tallGrassDensity(x, z) { return maskRead(BAKE.maskB, 0, x, z); }
  isInTallGrass(x, z) { return maskRead(BAKE.maskB, 0, x, z) > 0.45; }

  surfaceAt(x, z) { return SURFACE_EMIT[this.materialAt(x, z)]; }

  /** The ground at a point, in the fine vocabulary. Allocation-free. */
  materialAt(x, z) {
    const w = this.water;
    if (w && w.depthAt(x, z) > 0.03) return 'water';
    const A = BAKE.maskA;
    const rock = maskRead(A, 1, x, z);
    if (rock > 0.5) return 'rock';
    const P = this._panRead(x, z);
    if (P.inside > 0.5) return P.brine > 0.55 ? 'silt' : 'salt';
    if (maskRead(A, 3, x, z) > 0.5) return 'silt';
    if (maskRead(A, 2, x, z) > 0.42) return 'shingle';
    if (maskRead(BAKE.maskB, 1, x, z) > 0.42) return 'dirt';
    if (this.slopeFast(x, z) > 1.0) return 'rock';
    biomesAt(x, z, _bw);
    let bi = 0;
    for (let b = 1; b < 6; b++) if (_bw[b] > _bw[bi]) bi = b;
    switch (bi) {
      case 0: return 'sand';
      case 1: return 'cinder';
      case 2: return 'rock';
      case 3: return 'grass';
      case 4: return 'dirt';
      default: return 'cinder';
    }
  }

  /** The baked pan texture at a world point (shared record). */
  _panRead(x, z) {
    const R = this._panRec || (this._panRec = { inside: 0, brine: 0, salt: 0 });
    const u = (x - PAN_BOX.x0) / PAN_BOX.size, v = (z - PAN_BOX.z0) / PAN_BOX.size;
    if (u <= 0 || v <= 0 || u >= 1 || v >= 1) { R.inside = 0; R.brine = 0; R.salt = 0; return R; }
    const o = ((v * PAN_N | 0) * PAN_N + (u * PAN_N | 0)) * 4, P = BAKE.pan;
    R.salt = P[o] / 255; R.brine = P[o + 1] / 255; R.inside = P[o + 3] / 255;
    return R;
  }

  /* -------------------------------- biomes -------------------------------- */
  biomeAt(x, z) { return biomeAt(x, z); }
  biomeWeights(x, z, out) { return biomeWeights(x, z, out); }
  /** A tube's polyline (bible §8.7); null if unknown. Carved at W3 (`A-trench`). */
  trench(id) { return TUBES[id] || null; }
  /** Round-4 strata hooks: the wall they painted is gone, the names stay for the carried rows. */
  setStrataStrength() {}
  beddingAt() { return { bh: 0, thick: 1 }; }

  /* -------------------------------- textures -------------------------------- */
  _buildTextures() {
    const mkMask = (data, n) => {
      const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    this._maskTextures = {
      a: mkMask(BAKE.maskA, MASK_N), b: mkMask(BAKE.maskB, MASK_N),
      shore: mkMask(BAKE.shore, MASK_N), pan: mkMask(BAKE.pan, PAN_N),
    };
    this._maskData.tex = [this._maskTextures.a, this._maskTextures.b, this._maskTextures.shore];
    const mkHz = (data) => {
      const t = mkMask(data, SKYLINE_N);
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      return t;
    };
    this._maskTextures.hzA = mkHz(BAKE.skylineA);
    this._maskTextures.hzB = mkHz(BAKE.skylineB);
    const cf = new THREE.DataTexture(BAKE.coastF, MASK_N, MASK_N, THREE.RGFormat, THREE.HalfFloatType);
    cf.internalFormat = 'RG16F';
    cf.minFilter = THREE.LinearFilter; cf.magFilter = THREE.LinearFilter;
    cf.wrapS = cf.wrapT = THREE.ClampToEdgeWrapping;
    cf.generateMipmaps = false;
    cf.needsUpdate = true;
    this._maskTextures.coastF = cf;
    /* Layers as texture arrays: every layer of the wave costs two samplers per size. They
     * stay NoColorSpace on purpose (the shader decodes sRGB): engine.js's anisotropy sweep
     * caps colour-role textures through TEXTURE_2D, and these are arrays. */
    const mkArr = (data, s, n) => {
      const t = new THREE.DataArrayTexture(data, s, s, n);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    };
    const L = BAKE.layers, nB = LAYER_FILES.big.length, nS = LAYER_FILES.small.length;
    const sB = LAYER_SIZE.big, sS = LAYER_SIZE.small;
    this._layerTextures = {
      a1: mkArr(L.aBig, sB, nB), n1: mkArr(L.nBig, sB, nB),
      a2: mkArr(L.aSmall, sS, nS), n2: mkArr(L.nSmall, sS, nS),
    };
    /* Four octaves of periodic value noise in one texture: the ground's macro read costs a few
     * fetches, where sin-hash noise cost forty sines a pixel. */
    {
      const N = 128, data = new Uint8Array(N * N * 4), oct = [8, 16, 32, 64];
      let sd = 90127;
      const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
      for (let c = 0; c < 4; c++) {
        const P = oct[c], lat = new Float32Array(P * P);
        for (let i = 0; i < lat.length; i++) lat[i] = rnd();
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const fx = (x / N) * P, fy = (y / N) * P, ix = fx | 0, iy = fy | 0;
          let tx = fx - ix, ty = fy - iy;
          tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
          const a = lat[iy * P + ix], b = lat[iy * P + (ix + 1) % P], d = lat[((iy + 1) % P) * P + ix], e = lat[((iy + 1) % P) * P + (ix + 1) % P];
          const v = a + (b - a) * tx, w = d + (e - d) * tx;
          data[(y * N + x) * 4 + c] = (v + (w - v) * ty) * 255;
        }
      }
      const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      this._maskTextures.noiseG = t;
      // the R channel read as the shader reads it (repeat, bilinear): beddingAt's mirror
      this._noiseGAt = (u, v) => {
        const fx = u * N - 0.5, fy = v * N - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const at = (i, j) => data[((((j % N) + N) % N) * N + (((i % N) + N) % N)) * 4] / 255;
        const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
        return a + (b - a) * ty;
      };
    }
    /** Shared uniform holders: terrain, rocks and salt all read one set. */
    this.groundUniforms = {
      tA1: { value: this._layerTextures.a1 }, tN1: { value: this._layerTextures.n1 },
      tA2: { value: this._layerTextures.a2 }, tN2: { value: this._layerTextures.n2 },
      uScale1: { value: new THREE.Vector3(1 / 3.0, 1 / 10.0, 1 / 7.0) },
      uScale2: { value: new THREE.Vector2(1 / 3.5, 1 / 2.6) },
      tHzA: { value: this._maskTextures.hzA }, tHzB: { value: this._maskTextures.hzB },
      tNoiseG: { value: this._maskTextures.noiseG },
      uHzW0: { value: new THREE.Vector4(0, 1, 0, 0) }, uHzW1: { value: new THREE.Vector4() },
      uSunTan: { value: 1 }, uSunXZ: { value: new THREE.Vector2(0, -1) },
      uHzWorldInv: { value: 1 / WORLD_SIZE }, uHzK: { value: 1 },
    };
  }

  /* -------------------------------- the mesh -------------------------------- */
  _buildMesh() {
    const side = GS, segs = MESH_SEGS, count = side * side;
    const pos = new Float32Array(count * 3);
    for (let iz = 0, i = 0; iz < side; iz++) {
      const z = iz * GSTEP - GHALF;
      for (let ix = 0; ix < side; ix++, i++) {
        pos[i * 3] = ix * GSTEP - GHALF; pos[i * 3 + 1] = H[i]; pos[i * 3 + 2] = z;
      }
    }
    /* The sea floor below −7 m is under opaque water: its triangles are never drawn, so
     * the index leaves them out (≈ 45 % of the mesh, and the frame's cheapest saving). */
    const idx = new Uint32Array(segs * segs * 6);
    let n = 0;
    const DEEP = -7;
    for (let iz = 0; iz < segs; iz++) {
      for (let ix = 0; ix < segs; ix++) {
        const a = iz * side + ix, b = a + side, c = b + 1, d = a + 1;
        if (H[a] < DEEP && H[b] < DEEP && H[c] < DEEP && H[d] < DEEP) continue;
        idx[n++] = a; idx[n++] = b; idx[n++] = d;
        idx[n++] = b; idx[n++] = c; idx[n++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(BAKE.normals, 4, true));
    geo.setAttribute('aTint', new THREE.BufferAttribute(BAKE.tint, 4, true));
    geo.setIndex(new THREE.BufferAttribute(idx.slice(0, n), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), MESH_SPAN * 0.75);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-GHALF, -40, -GHALF), new THREE.Vector3(GHALF, 260, GHALF));

    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const U = this.groundUniforms;
    const mt = this._maskTextures;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.uniforms.tMaskA = { value: mt.a };
      shader.uniforms.tMaskB = { value: mt.b };
      shader.uniforms.tShore = { value: mt.shore };
      shader.uniforms.tPan = { value: mt.pan };
      shader.uniforms.uPanBox = { value: new THREE.Vector3(PAN_BOX.x0, PAN_BOX.z0, 1 / PAN_BOX.size) };
      shader.uniforms.uWorldInv = { value: 1 / WORLD_SIZE };
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uSea = this._uSea;
      shader.uniforms.uFieldU = { value: new THREE.Vector2(SALT_FIELD.ue, -SALT_FIELD.un).normalize() };
      shader.uniforms.uStrata = this._uStrata;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', GROUND_VERT_PARS)
        .replace('#include <worldpos_vertex>', GROUND_VERT_WORLD);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', TERRAIN_FRAG_PARS)
        .replace('#include <color_fragment>', TERRAIN_COLOR)
        .replace('#include <roughnessmap_fragment>', GROUND_ROUGH)
        .replace('#include <normal_fragment_begin>', GROUND_NORMAL)
        .replace('#include <aomap_fragment>', GROUND_AO);
    };
    mat.customProgramCacheKey = () => 'cal-ground-terrain';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain-mesh';
    this.group.add(this.mesh);
    this.indexedTriangles = n / 3;
  }

  /**
   * The crater's bedding (LOOK W-03 b), the JS mirror of the ground shader's strata term: `bh` is
   * the bed-height coordinate the shader bands (planes of constant y, warped ±4 m over 90 m), and
   * `thick` the bed thickness. A63 bounds its gradient and renders it on and off.
   */
  beddingAt(x, y, z, out) {
    const o = out || { bh: 0, thick: 0 };
    const nz = this._noiseGAt ? this._noiseGAt(x * 0.0111, z * 0.0111) : 0.5;
    o.bh = y + 4.0 * (nz - 0.5) * 2.0;
    o.thick = 1.7;
    return o;
  }
  /** Strength of the strata term (1 shipped, 0 off): A63's render A/B. */
  setStrataStrength(k) { this._uStrata.value = Math.max(0, Math.min(1, k)); }

  /* -------------------------------- the skirt -------------------------------- */
  /**
   * Sister islands, one merged draw. Their haze is their own: the scene fog at 1.5 km is
   * opaque, and a far plane cutting a fogged mesh left ghost edges in the sky. Each frame
   * `_updateIsles` sets one visibility from world-sky's own transmittance (clear air shows a
   * blue-grey silhouette, calima nearly hides it) and the colour fades to the fog's own colour.
   */
  _buildSkirt() {
    /* LOOK L-15: three basalt silhouettes for the haze to carry, 2-4 k triangles in all. Each is a
     * polar grid whose rings are packed where the form turns: the sea cliff at the foot (a
     * 25-40 m wall standing out of the water, so the isle sits ON the sea and never floats), the
     * concave flank, the notched summit. Bands of ash, tuff and basalt run round them in the
     * vertex colour, so a lit flank reads as rock at 1.5 km and not as a grey cone. */
    const RINGS = {
      volcano: [0, 0.035, 0.08, 0.15, 0.24, 0.34, 0.45, 0.56, 0.67, 0.77, 0.85, 0.895, 0.915, 0.95, 1.0],
      table: [0, 0.15, 0.32, 0.5, 0.66, 0.78, 0.86, 0.885, 0.93, 1.0],
      islet: [0, 0.2, 0.45, 0.7, 0.86, 0.93, 1.0],
    };
    let verts = 0, tris = 0;
    for (const I of ISLES) { verts += RINGS[I.kind].length * I.NA; tris += (RINGS[I.kind].length - 1) * I.NA * 2; }
    const pos = new Float32Array(verts * 3), col = new Float32Array(verts * 3), index = [];
    const n = this.noise;
    let base = 0;
    const cBasalt = new THREE.Color('#2f2d2f'), cAsh = new THREE.Color('#5c544b'), cTuff = new THREE.Color('#6b4a3a'), cT = new THREE.Color();
    for (const I of ISLES) {
      const TR = RINGS[I.kind], NA = I.NA;
      for (let r = 0; r < TR.length; r++) {
        const t = TR[r];
        for (let a = 0; a < NA; a++) {
          const ang = (a / NA) * Math.PI * 2;
          const cs = Math.cos(ang), sn = Math.sin(ang);
          const wob = 1 + n.fbm(cs * 1.7 + I.seed, sn * 1.7, 3) * 0.3;
          const rr = I.r * wob * t;
          const gul = n.noise2D(cs * 9 + I.seed, sn * 9 + t * 3.1);
          let h, cliff = 0;
          if (I.kind === 'volcano') {
            const cliffT = 0.9, cliffH = 32 + 14 * n.noise2D(cs * 3 + I.seed, sn * 3);
            if (t <= cliffT) {
              const u = t / cliffT;
              h = cliffH + (I.h - cliffH) * Math.pow(1 - u, 1.75) * (1 + gul * 0.12 * u * (1 - u) * 4);
              h -= t < 0.05 ? (0.05 - t) * 520 : 0;                    // the summit crater's notch
              h += t < 0.09 && cs > 0.4 ? (0.09 - t) * 260 * (cs - 0.4) : 0;   // its broken lip
            } else {
              cliff = 1;
              h = t < 0.92 ? cliffH * 0.96 : -12;
            }
          } else if (I.kind === 'table') {
            const top = I.h * (0.82 + 0.18 * (1 - t * t)) + n.fbm(cs * 2.3 + I.seed, sn * 2.3, 2) * 9;
            if (t <= 0.86) h = top - gul * 3 * t;
            else { cliff = 1; h = t < 0.89 ? top * 0.9 : -12; }
          } else {
            const u = Math.min(1, t / 0.86);
            h = I.h * (1 - Math.pow(u, 3.2)) + gul * 5 * u;
            if (t > 0.86) { cliff = 1; h = t < 0.93 ? I.h * 0.25 : -12; }
          }
          const o = base + r * NA + a;
          const px = I.x + cs * rr * (I.kind === 'table' ? 1.75 : 1), pz = I.z + sn * rr;
          pos[o * 3] = px; pos[o * 3 + 1] = h; pos[o * 3 + 2] = pz;
          // beds: ash and tuff bands by height, basalt in the cliffs and the gullies
          const band = Math.sin(h * 0.19 + n.noise2D(px * 0.006, pz * 0.006) * 2.2);
          cT.copy(cAsh).lerp(cTuff, Math.max(0, band) * 0.6);
          cT.lerp(cBasalt, Math.min(1, cliff * 0.8 + Math.max(0, -gul) * 0.5 + (h < 6 ? 0.6 : 0)));
          col[o * 3] = cT.r; col[o * 3 + 1] = cT.g; col[o * 3 + 2] = cT.b;
          if (r < TR.length - 1) {
            const a1 = (a + 1) % NA;
            const p = base + r * NA + a, q = base + r * NA + a1, s = p + NA, u = q + NA;
            index.push(p, s, q, q, s, u);
          }
        }
      }
      base += TR.length * NA;
    }
    this.isleTris = tris;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    const uVis = this._isleVis = { value: 0.3 };
    this._isleTick = 29;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uIsleVis = uVis;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uIsleVis;')
        .replace('#include <fog_fragment>', `#ifdef USE_FOG
  {
    /* The deep band's air (LOOK W-02): the isle takes the sky dome's own sea-line colour, the
     * sea-level haze thicker than the air at its summit, so the form reads in layers */
    float hk = smoothstep(-5.0, 150.0, vFogWorldPos.y);
    float vis = uIsleVis * (0.62 + 0.38 * hk);
    vec3 dv = normalize(vFogWorldPos - cameraPosition);
    vec2 hz = normalize(dv.xz + vec2(1e-5)), sz = normalize(calSunDir.xz + vec2(1e-5));
    float az = max(dot(hz, sz), 0.0);
    vec3 air = calFogHorizon * mix(0.72, 1.0, pow(az, 2.2)) + calFogSun * pow(az, 6.0) * 0.18;
    gl_FragColor.rgb = mix(air, gl_FragColor.rgb, vis);
  }
#endif`);
    };
    mat.customProgramCacheKey = () => 'cal-sister-isles';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sister-isles';
    mesh.frustumCulled = false;
    mesh.renderOrder = 0.5;     // after the sky dome, which would paint over anything past its 1,900 m
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // carried by the camera the frame is drawn with (the player's, a gate's, the title's)
    mesh.onBeforeRender = (renderer, scene, camera) => {
      mesh.position.set(camera.position.x * ISLE_CARRY, 0, camera.position.z * ISLE_CARRY);
      mesh.updateMatrixWorld(true);
    };
    this.group.add(mesh);
    this.isles = mesh;
  }

  /** Per frame, no allocation: the isles ride with the camera and take the air's haze. */
  _updateIsles() {
    const m = this.isles;
    if (!m) return;
    // twice a second is plenty for a haze (and keeps world-sky's double return off every frame)
    if (++this._isleTick < 30) return;
    this._isleTick = 0;
    const fp = this.ctx.environment?.fogParams;
    // the air's own transmittance over 300 m, as a measure of how far one sees today
    const T = fp?.transmittance ? fp.transmittance(300, 6, 6) : 0.6;
    // deep band at the W-02 transmittance (0.35-0.55 in clear air), all but gone in calima
    const vis = Math.max(0, Math.min(0.55, (T - 0.12) * 0.9));
    if (Math.abs(this._isleVis.value - vis) > 0.002) this._isleVis.value = vis;
  }

  /* -------------------------------- the current -------------------------------- */
  /**
   * Bible §8.1: no swim state; at the 1.1 m depth contour a ring of blocking colliders
   * ("the current") stops her. Walked per bearing from outside in, so a bay cannot put
   * the ring on the wrong side of the shallows. Registered once `ctx.collision` exists
   * (the player constructs after us); `registerColliders` also stamps the navgrid.
   */
  _registerColliders() {
    const C = this.ctx.collision;
    if (!C || this._colliderIds) return;
    const ids = [];
    /* Spheres, not boxes: frozen nav.js stamps a sphere's disc into the grid, so the ring
     * also closes the sea to every path. 7 m apart at radius 7: no gap a capsule can pass. */
    const N = 420;
    this.currentRing = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      let r = GHALF - 4;
      while (r > 60 && gridHeight(cs * r, sn * r) < -CURRENT_DEPTH) r -= 0.5;
      const cx = cs * (r + 5.6), cz = sn * (r + 5.6);
      const id = C.register({
        kind: 'current',
        shape: { type: 'sphere', c: [cx, -0.5, cz], radius: 7 },
        blocking: true, occluder: false, camera: false, ref: this,
      });
      if (id >= 0) ids.push(id);
      this.currentRing.push({ x: cx, z: cz, r });
    }
    this._colliderIds = ids;
    return ids;
  }

  /**
   * Give every LIVE patrol route real cover (`A60`): walks the routes the Instruments are
   * actually carrying, measures each, and stamps arcs over any under the bar. Runs once,
   * only raises the field.
   */
  _ensureRouteCover() {
    const list = this.ctx.machines?.list;
    if (!Array.isArray(list) || !list.length) return false;
    const seen = this._coveredRoutes || (this._coveredRoutes = new Set());
    for (const m of list) {
      const r = m && m.route;
      if (!Array.isArray(r) || r.length < 3) continue;
      const key = `${r[0].x.toFixed(1)},${r[0].z.toFixed(1)},${r.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = [];
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.round(len / 3));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          line.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]);
        }
      }
      if (line.length < 4) continue;
      let cov = 0;
      for (const p of line) if (this.tallGrassDensity(p[0], p[1]) > 0.45) cov++;
      if (cov / line.length >= 0.40) continue;
      const L = line.length, arcs = 3;
      const phase = Math.abs(Math.round(r[0].x * 7 + r[0].z * 3)) % L;
      for (let k = 0; k < arcs; k++) {
        const start = (phase + Math.floor((k / arcs) * L)) % L;
        const span = Math.floor((0.85 / arcs) * L);     // a route on broken ground only plants where it can: stamp most of it
        for (let s = 0; s < span; s += 2) {
          const p = line[(start + s) % L];
          if (gridHeight(p[0], p[1]) < 0.05) continue;
          stampStealthDisc(p[0], p[1], 9.5);
        }
      }
    }
    return true;
  }

  /** What the runtime cover stamp repaired (`A59c`); null until the route pass has run. */
  routeCoverStats() { return this._routeCoverStats || null; }

  _drainStamps() {
    const t0 = performance.now();
    let discs = 0, texels = 0;
    const veg = this.ctx.vegetation;
    for (let i = 0; i < _stampPending.length; i += 3) {
      const x = _stampPending[i], z = _stampPending[i + 1], r = _stampPending[i + 2];
      discs++;
      texels += Math.round((Math.PI * r * r) / (MCELL * MCELL));
      veg?.invalidateAround?.(x, z, r + 2);
    }
    _stampPending.length = 0;
    this._maskTextures.b.needsUpdate = true;
    const prev = this._routeCoverStats;
    this._routeCoverStats = {
      discs, texels, vertices: 0, tiles: discs, ms: +(performance.now() - t0).toFixed(1),
      rebakes: (prev ? prev.rebakes : 0) + 1, totalDiscs: (prev ? prev.totalDiscs : 0) + discs,
    };
  }

  /**
   * MASK COHERENCE AUDIT (`A59c`): the baked bytes against the same `maskTexel` the bake
   * used, plus the stamps. Any non-zero delta is a pixel describing a field that moved.
   */
  maskAudit(step = 2) {
    const md = this._maskData;
    if (!md) return null;
    const v = new Uint8Array(12), arr = [md.d1, md.d2, md.d3];
    let cells = 0, mismatched = 0, worst = 0, worstAt = null, worstCh = -1;
    for (let iz = 0; iz < MASK_N; iz += step) {
      const z = (iz + 0.5) * MCELL - WORLD_HALF;
      for (let ix = 0; ix < MASK_N; ix += step) {
        const x = (ix + 0.5) * MCELL - WORLD_HALF;
        if (x * x + z * z > PLAY_RADIUS * PLAY_RADIUS) continue;
        cells++;
        maskTexel(H, x, z, v);
        const c = iz * MASK_N + ix;
        if (_stamps[c] > v[4]) v[4] = _stamps[c];
        const o = c * 4;
        let bad = 0;
        for (let k = 0; k < 12; k++) {
          const d = Math.abs(arr[(k / 4) | 0][o + (k % 4)] - v[k]);
          if (d > bad) bad = d;
          if (d > worst) { worst = d; worstAt = [+x.toFixed(1), +z.toFixed(1)]; worstCh = k; }
        }
        if (bad > 1) mismatched++;
      }
    }
    return { cells, mismatched, worstDelta255: worst, worstAt, worstChannel: worstCh };
  }

  /** VERTEX COHERENCE AUDIT (`A59c`): the mesh's tint + normals against a fresh bake. */
  vertexColorAudit(stride = 3) {
    let vertices = 0, mismatched = 0, worst = 0, worstAt = null;
    const tint = this.mesh.geometry.attributes.aTint.array;
    for (let iz = 1; iz < GS - 1; iz += stride * 8) {
      const row = bakeShade(H, iz, iz + 1).tint;
      for (let ix = 1; ix < GS - 1; ix += stride) {
        const x = ix * GSTEP - GHALF, z = iz * GSTEP - GHALF;
        if (x * x + z * z > PLAY_RADIUS * PLAY_RADIUS) continue;
        vertices++;
        const o = (iz * GS + ix) * 4, q = ix * 4;
        const d = Math.max(Math.abs(tint[o] - row[q]), Math.abs(tint[o + 1] - row[q + 1]), Math.abs(tint[o + 2] - row[q + 2]));
        if (d > worst) { worst = d; worstAt = [+x.toFixed(1), +z.toFixed(1)]; }
        if (d > 1) mismatched++;
      }
    }
    return { vertices, mismatched, worstDelta: worst / 255, worstAt };
  }

  /**
   * THE ROUND-4 SETTLEMENT MUST NOT STAND IN THE PANS. `camp.js` builds its palisade and huts
   * around REST_SITE, which is Saltrow now; settlements replaces it at W2 (plan §6). Until
   * then its art and its blockers are retired here, once, through the public scene and
   * collision surface; its REST & SAVE interactable keeps working on the same point.
   */
  _retireOldSite() {
    const old = this.ctx.camp, C = this.ctx.collision;
    if (!old?.group || !C) return false;
    old.group.visible = false;
    const inOld = new Set();
    old.group.traverse((o) => { if (o.isMesh) inOld.add(o); });
    const ids = [];
    for (const c of C.colliders) if (c.ref && inOld.has(c.ref)) ids.push(c.id);
    if (ids.length) C.unregister(ids);
    this.oldSiteRetired = { colliders: ids.length };
    return true;
  }

  /** The light (sun or moon) as the skyline map reads it: bearing weights + elevation. No allocation. */
  _updateSunUniforms() {
    const env = this.ctx.environment, L = env?.lightDir;
    if (!L) return;
    const U = this.groundUniforms, hyp = Math.hypot(L.x, L.z) || 1e-3;
    /* A uniform's `value` is a tagged field (three's uniform objects share one map), so every
     * double stored there is a fresh heap number: store only when the light has really moved. */
    const k = env.weather === 'calima' ? 0.45 : 1;
    if (U.uHzK.value !== k) U.uHzK.value = k;
    const tan = L.y / hyp;
    if (Math.abs(U.uSunTan.value - tan) < 2e-4 && Math.abs(U.uSunXZ.value.x * hyp - L.x) < 2e-4 * hyp) return;
    U.uSunTan.value = tan;
    U.uSunXZ.value.set(L.x / hyp, L.z / hyp);
    let b = Math.atan2(L.x, -L.z) / (Math.PI / 4);
    if (b < 0) b += 8;
    const i0 = b | 0, f = b - i0, i1 = (i0 + 1) % 8;
    const w0 = U.uHzW0.value.set(0, 0, 0, 0), w1 = U.uHzW1.value.set(0, 0, 0, 0);
    if (i0 < 4) w0.setComponent(i0, 1 - f); else w1.setComponent(i0 - 4, 1 - f);
    if (i1 < 4) w0.setComponent(i1, f); else w1.setComponent(i1 - 4, f);
  }

  update(dt, t) {
    if (!this._colliderIds && this._colliderTries < 600) {
      this._colliderTries++;
      if (this.ctx.collision) this._registerColliders();
    }
    if (!this.oldSiteRetired) this._retireOldSite();
    if (!this._routeCoverDone) {
      this._routeCoverTries = (this._routeCoverTries || 0) + 1;
      const ready = this.ctx.machines?.varietyReady || this._routeCoverTries > 600;
      if (ready && this._ensureRouteCover()) {
        this._routeCoverDone = true;
        if (!_stampPending.length && !this._routeCoverStats) {
          this._routeCoverStats = { discs: 0, texels: 0, vertices: 0, tiles: 0, ms: 0, rebakes: 0, totalDiscs: 0 };
        }
      }
    }
    if (_stampPending.length) this._drainStamps();
    this._updateSunUniforms();
    this._updateIsles();
    const env = this.ctx.environment;
    if (env) {
      /* world-sky's mainland ridges are from the old valley: an island's horizon is the
       * sea and the sister isles (plan §2 world-sky W1; a no-op once they are gone). */
      if (env.ridges && env.ridges.visible) env.ridges.visible = false;
      if (!env.water) env.water = this.water;
    }
    const time = typeof t === 'number' ? t : this._uTime.value + (dt || 0);
    this._uTime.value = time;
    this.water.tick(dt || 0, time);
  }

  /**
   * Full teardown: the mesh, the isles, the water, every texture. The retained bake
   * buffers belong to the module (one island per page load), so references drop and the
   * typed arrays stay valid for a later Terrain on this page.
   */
  dispose() {
    this.water?.dispose?.();
    this.water = null;
    if (this.ctx.water) this.ctx.water = null;
    const seen = new Set();
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && !seen.has(m)) { seen.add(m); m.dispose(); }
    });
    for (const t of [...Object.values(this._maskTextures || {}), ...Object.values(this._layerTextures || {})]) t.dispose();
    this._maskTextures = null;
    this._layerTextures = null;
    this.groundUniforms = null;
    this._maskData = null;
    this.group.parent?.remove(this.group);
    this.group.clear();
    this._hg = null;
  }
}

export { coverAt, SHORE_ENC, REST_SITE };
