import * as THREE from 'three';
import { WORLD_SIZE, WORLD_HALF, PLAY_RADIUS, MESH_SPAN, MESH_SEGS } from './island/extent.js';
import { REST_SITE, TUBES, SALT_FIELD } from './island/sites.js';
import { BIOMES, CURRENT_DEPTH, biomesAt, heightAt, coverAt, authored } from './island/recipe.js';
import { GRID, MASK_N, PAN_N, PAN_BOX, SHORE_ENC, SKYLINE_N, bakeShade, maskTexel } from './island/bake.js';
import { bakeIsland } from './island/pool.js';
import { LAYER_ARRAY } from './island/layers.js';
import { fieldReader } from './island/scatter.js';
import {
  GROUND_VERT_PARS, GROUND_VERT_WORLD, TERRAIN_FRAG_PARS, TERRAIN_COLOR,
  GROUND_ROUGH, GROUND_NORMAL, FAR_FRAG_PARS, FAR_COLOR, FAR_BAKE_OUT, FAR_BAKE_D,
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
 *   terrain.reedCoverDensity(x, z)   0..1 cover; isInReedCover(x, z) is > 0.45
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
/* M1a round 2 (uGroundR2.x): the sky's fill on dark ground and stone keeps its light and loses most of its blue: shaded
 * black sand, basalt and the dykes' shaded faces read blue at golden hour (the grade turns a neutral dark violet-rose,
 * a blue one stays blue). A brine mirror keeps the sky it mirrors */
if (uGroundR2.x > 0.0) {
  vec3 gLw = vec3(0.2126, 0.7152, 0.0722);
  reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, vec3(dot(reflectedLight.indirectDiffuse, gLw)), uGroundR2.x);
  reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, vec3(dot(reflectedLight.indirectSpecular, gLw)), uGroundR2.x * (1.0 - smoothstep(0.1, 0.5, gLiquid)));
}
#ifdef CAL_CAPTURE
/* the M1.1e tiling capture (tools/perf/meadow-page.mjs topDown): the material alone, albedo under one fixed light
 * on its own normal, with no sun shadow, skyline, sky or sheen, so the autocorrelation sees texture, not lighting */
reflectedLight.directDiffuse = diffuseColor.rgb * (0.3 + 0.7 * max(dot(normalize(normal), normalize(vec3(0.35, 0.3, 1.0))), 0.0));
reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectDiffuse = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0);
#endif
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
  gSky = mix(gSky, vec3(dot(gSky, vec3(0.2126, 0.7152, 0.0722))), uGroundR2.x * (1.0 - smoothstep(0.1, 0.5, gLiquid)));
  reflectedLight.indirectSpecular += gSky * gF * gLiquid * 0.95;
}
#endif
`;

/* -------------------------------------- bake -------------------------------------- */
/** The finished island. terrain.js does not evaluate until this resolves (see header). */
const BAKE = await bakeIsland({ layers: false });   // M0.10: the layer arrays are KTX2, loaded by ctx.assets (TEXTURES rows)
const H = BAKE.H;
const { side: GS, step: GSTEP, half: GHALF } = GRID;

/* M1.1a: the four world masks live in one buffer, layer after layer, so the ground samples them as one
 * texture array (one sampler unit). Every reader (maskRead, the stamps, the scatter fields, the water's
 * shore texture, the gates) keeps reading BAKE.maskA / maskB / shore / pan: they are views of it now. */
if (PAN_N !== MASK_N) throw new Error(`terrain: the mask array needs PAN_N (${PAN_N}) === MASK_N (${MASK_N})`);
const MASK_BYTES = MASK_N * MASK_N * 4;
const MASKS = new Uint8Array(MASK_BYTES * 4);
['maskA', 'maskB', 'shore', 'pan'].forEach((k, i) => { MASKS.set(BAKE[k], i * MASK_BYTES); BAKE[k] = MASKS.subarray(i * MASK_BYTES, (i + 1) * MASK_BYTES); });

/* M1.1a terrain chunks and LOD (see _buildMesh) */
const TCHUNK = 64;                       // grid segments per chunk side (124 m); the last row and column are 46
const TSTRIDES = [1, 2, 4, 8, 16];       // grid steps per quad at each LOD
const TDEEP = -7;                        // the sea floor under this is under opaque water: never indexed
const TSKIRT_MAX_ERR = 3;                // m: a stride whose border error is over this is never taken
const TLOD_PX = 2;                       // device px of height error a coarser stride may project
const TLOD_M = 60;
const FAR_START = 250;                   // m: a chunk wholly past this is drawn from the baked far field
const FAR_N = 1024;                      // texels a side of the far-field bake over the world square (1 m a texel)                       // m a stride: stride s only from 60 s m away (normals and tint keep their density)

/* M1a round 2 (F32's pale "ghost ridge"): the trade deck (environment.js, 105-150 m on the windward slopes) is optical
 * depth on the FRAGMENT's ray, and the sky dome draws none. From a lens in or above the deck, windward ground near the
 * horizon went cloud-white while the sky beside it stayed lavender, so a far peak (the Rust Cone from 120 m over T1)
 * stood as a flat pale wedge with a hard outline. The ground's deck depth is capped by how steeply its ray looks down
 * (none above 0.6 deg below level, 0.35 at 1.1 deg, 1.8 at 3.4 deg, the full deck past about 10 deg), so a ridge near the
 * skyline keeps the sky's own haze, the deck still lies over the slopes below the lens, and no level line cuts the deck
 * off (a first cut by a 1.1-6.9 deg ramp on the depth still saturated into a hard edge). The ground's copy of the chunk
 * only; the sky's chunk is untouched. */
const DECK_ANCHOR = 'calTauC = calFogD.x * calSeg * calWw * calBreak;';
function groundFogChunk() {
  const c = THREE.ShaderChunk.fog_fragment;
  if (!c.includes(DECK_ANCHOR)) { console.error('terrain: the cloud-deck anchor in fog_fragment moved; the ground keeps the shared fog'); return c; }
  return c.replace(DECK_ANCHOR, 'calTauC = min( calFogD.x * calSeg * calWw * calBreak, 36.0 * max( 0.0, - calVd.y - 0.01 ) );');
}

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
  reedCoverDensity(x, z) { return maskRead(BAKE.maskB, 0, x, z); }
  isInReedCover(x, z) { return maskRead(BAKE.maskB, 0, x, z) > 0.45; }

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
    {
      const t = new THREE.DataArrayTexture(MASKS, MASK_N, MASK_N, 4);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      /* three uploads ONLY the listed layers when layerUpdates is non-empty, even on the first upload
       * after texStorage3D: a stamp drain before the first frame left layers 0, 2 and 3 (mask A, the
       * shore, the pan) all zero, and the salt crust vanished (M1.1 fix 1). Layer updates only once live. */
      this._maskArrayLive = false;
      t.onUpdate = () => { this._maskArrayLive = true; };
      this._maskArray = t;
    }
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
     * caps colour-role textures through TEXTURE_2D, and these are arrays. M0.10: they ship as
     * KTX2 arrays (ETC1S colour, UASTC normal) with their mips, loaded at boot by ctx.assets
     * (TEXTURES rows groundA1/N1/A2/N2, colorSpace 'none', repeat, anisotropy 4). A missing
     * array (its load already logged an error) becomes a flat mid-grey array so the ground
     * still builds. */
    const flatArr = (n) => {
      const t = new THREE.DataArrayTexture(new Uint8Array(4 * n).fill(160), 1, 1, n);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
      return t;
    };
    /* M1.1a: one array per part, all five layers at 1024² (layers.js LAYER_ARRAY): two sampler units */
    const T = this.ctx.assets?.textures || {}, nL = LAYER_ARRAY.ids.length;
    this._layerTextures = { a: T.groundA || flatArr(nL), n: T.groundN || flatArr(nL) };
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
    /* M1.1a: noise (128² tiled 4 x 4) + the two skyline maps as one 512² array with mips (one sampler unit) */
    {
      const N = SKYLINE_N, L = N * N * 4, data = new Uint8Array(L * 3);
      const src = this._maskTextures.noiseG.image.data, n0 = this._maskTextures.noiseG.image.width;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const o = (y * N + x) * 4, q = ((y % n0) * n0 + (x % n0)) * 4;
        data[o] = src[q]; data[o + 1] = src[q + 1]; data[o + 2] = src[q + 2]; data[o + 3] = src[q + 3];
      }
      data.set(BAKE.skylineA, L); data.set(BAKE.skylineB, 2 * L);
      const t = new THREE.DataArrayTexture(data, N, N, 3);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      this._fieldArray = t;
    }
    /** Shared uniform holders: terrain, rocks and salt all read one set. */
    this.groundUniforms = {
      tA: { value: this._layerTextures.a }, tN: { value: this._layerTextures.n },
      uScale1: { value: new THREE.Vector3(1 / 3.0, 1 / 10.0, 1 / 7.0) },
      uScale2: { value: new THREE.Vector2(1 / 3.5, 1 / 2.6) },
      tField: { value: this._fieldArray },
      uHzW0: { value: new THREE.Vector4(0, 1, 0, 0) }, uHzW1: { value: new THREE.Vector4() },
      uSunTan: { value: 1 }, uSunXZ: { value: new THREE.Vector2(0, -1) },
      uHzWorldInv: { value: 1 / WORLD_SIZE }, uHzK: { value: 1 },
      uGroundR2: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
  }

  /* -------------------------------- the mesh -------------------------------- */
  /**
   * THE GROUND AS CHUNKS WITH DISTANCE LOD (M1.1a). One vertex buffer for the whole 1.94 m grid (plus a
   * skirt node under every chunk-border node), shared by every chunk; each chunk owns one index buffer per
   * stride (1, 2, 4, 8, 16 grid steps), built on first use. Per frame (`updateLod`) every chunk takes the
   * coarsest stride whose height error projects under LOD_PX device pixels AND whose quads stay at least
   * LOD_M metres a stride away (so the per-vertex normal and tint, which carry the shading, are never
   * stretched near the camera). Chunks are frustum-culled on their own bounds. Skirts (both windings) hang
   * from every chunk border by twice the worst border error of the strides a chunk may take, so a fine
   * chunk beside a coarse one shows no crack. The sea floor under −7 m stays out of every index (under
   * opaque water). `terrain.mesh` is the chunk group; `terrain.groundMaterial` the one material.
   */
  _buildMesh() {
    const side = GS, segs = MESH_SEGS, count = side * side, CH = TCHUNK;
    const line = (i) => i % CH === 0 || i === segs;
    const skirtOf = new Int32Array(count).fill(-1);
    let nS = 0;
    for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) if (line(ix) || line(iz)) skirtOf[iz * side + ix] = count + nS++;
    const total = count + nS;
    const pos = new Float32Array(total * 3);
    for (let iz = 0, i = 0; iz < side; iz++) {
      const z = iz * GSTEP - GHALF;
      for (let ix = 0; ix < side; ix++, i++) {
        pos[i * 3] = ix * GSTEP - GHALF; pos[i * 3 + 1] = H[i]; pos[i * 3 + 2] = z;
      }
    }
    const nrm = new Int16Array(total * 4); nrm.set(BAKE.normals);
    const tint = new Uint8Array(total * 4); tint.set(BAKE.tint);

    /* chunks: node ranges, and per stride the height error over the chunk and over its border */
    const nC = Math.ceil(segs / CH);
    const chunks = [];
    const nodesOf = (a, b, s) => { const o = []; for (let i = a; i < b; i += s) o.push(i); o.push(b); return o; };
    for (let cz = 0; cz < nC; cz++) {
      for (let cx = 0; cx < nC; cx++) {
        const x0 = cx * CH, x1 = Math.min(segs, x0 + CH), z0 = cz * CH, z1 = Math.min(segs, z0 + CH);
        const C = { cx, cz, x0, x1, z0, z1, err: new Float32Array(TSTRIDES.length), edge: new Float32Array(TSTRIDES.length),
          lo: Infinity, hi: -Infinity, land: false, geos: new Array(TSTRIDES.length).fill(null), mesh: null, lod: -1, maxLod: 0 };
        for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
          const h = H[iz * side + ix];
          if (h < C.lo) C.lo = h; if (h > C.hi) C.hi = h;
          if (h >= TDEEP) C.land = true;
        }
        for (let k = 1; k < TSTRIDES.length; k++) {
          const s = TSTRIDES[k], X = nodesOf(x0, x1, s), Z = nodesOf(z0, z1, s);
          let err = 0, edge = 0;
          for (let j = 0; j + 1 < Z.length; j++) {
            const za = Z[j], zb = Z[j + 1];
            for (let i = 0; i + 1 < X.length; i++) {
              const xa = X[i], xb = X[i + 1];
              const ha = H[za * side + xa], hb = H[zb * side + xa], hc = H[zb * side + xb], hd = H[za * side + xb];
              for (let iz = za; iz <= zb; iz++) {
                const v = (iz - za) / (zb - za);
                for (let ix = xa; ix <= xb; ix++) {
                  const h = H[iz * side + ix];
                  if (h < TDEEP) continue;
                  const u = (ix - xa) / (xb - xa);
                  const g = u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
                  const e = Math.abs(g - h);
                  if (e > err) err = e;
                  if ((ix === x0 || ix === x1 || iz === z0 || iz === z1) && e > edge) edge = e;
                }
              }
            }
          }
          C.err[k] = err; C.edge[k] = edge;
        }
        // the strides this chunk may ever take: border error under TSKIRT_MAX_ERR
        let maxLod = 0;
        for (let k = 1; k < TSTRIDES.length && C.edge[k] <= TSKIRT_MAX_ERR; k++) maxLod = k;
        C.maxLod = maxLod;
        C.skirt = 2 * C.edge[maxLod] + 0.3;
        chunks.push(C);
      }
    }
    /* skirt nodes: the deepest skirt any chunk touching the node needs */
    const skirtDepth = new Float32Array(nS);
    for (const C of chunks) {
      for (let iz = C.z0; iz <= C.z1; iz++) for (let ix = C.x0; ix <= C.x1; ix++) {
        const n = iz * side + ix, s = skirtOf[n];
        if (s >= 0 && (ix === C.x0 || ix === C.x1 || iz === C.z0 || iz === C.z1)) skirtDepth[s - count] = Math.max(skirtDepth[s - count], C.skirt);
      }
    }
    for (let n = 0; n < count; n++) {
      const s = skirtOf[n];
      if (s < 0) continue;
      pos[s * 3] = pos[n * 3]; pos[s * 3 + 1] = pos[n * 3 + 1] - skirtDepth[s - count]; pos[s * 3 + 2] = pos[n * 3 + 2];
      for (let k = 0; k < 4; k++) { nrm[s * 4 + k] = nrm[n * 4 + k]; tint[s * 4 + k] = tint[n * 4 + k]; }
    }
    const aPos = new THREE.BufferAttribute(pos, 3), aNrm = new THREE.BufferAttribute(nrm, 4, true), aTint = new THREE.BufferAttribute(tint, 4, true);
    this._attr = { position: aPos, normal: aNrm, aTint, skirtOf, count, side };

    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (shader) => this._groundCompile(shader, null);
    mat.customProgramCacheKey = () => 'cal-ground-terrain';
    this.groundMaterial = mat;
    this._buildChunks(chunks);
  }

  /** The layered ground shader; `bake` (a { value } part selector) makes the far-field bake variant. */
  _groundCompile(shader, bake) {
      const U = this.groundUniforms;
      Object.assign(shader.uniforms, U);
      shader.uniforms.tMask = { value: this._maskArray };
      shader.uniforms.uPanBox = { value: new THREE.Vector3(PAN_BOX.x0, PAN_BOX.z0, 1 / PAN_BOX.size) };
      shader.uniforms.uWorldInv = { value: 1 / WORLD_SIZE };
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uSea = this._uSea;
      shader.uniforms.uFieldU = { value: new THREE.Vector2(SALT_FIELD.ue, -SALT_FIELD.un).normalize() };
      shader.uniforms.uStrata = this._uStrata;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', GROUND_VERT_PARS)
        .replace('#include <worldpos_vertex>', GROUND_VERT_WORLD);
      let color = TERRAIN_COLOR, pars = TERRAIN_FRAG_PARS;
      if (bake) {
        const D = 'float dCam = length(vWPos - cameraPosition);';
        if (!color.includes(D)) throw new Error('terrain far bake: the dCam anchor moved');
        color = color.replace(D, `float dCam = ${FAR_BAKE_D.toFixed(1)};`);
        pars += '\n#define CAL_FAR_BAKE\nuniform float uFarPart;';
        shader.uniforms.uFarPart = bake;
      }
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', pars)
        .replace('#include <color_fragment>', color)
        .replace('#include <roughnessmap_fragment>', GROUND_ROUGH)
        .replace('#include <normal_fragment_begin>', GROUND_NORMAL)
        .replace('#include <aomap_fragment>', GROUND_AO);
      if (bake) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', FAR_BAKE_OUT);
      else shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', groundFogChunk());
  }

  _buildChunks(chunks) {
    const mat = this.groundMaterial;
    const root = new THREE.Group();
    root.name = 'terrain-mesh';
    let tris = 0;
    for (const C of chunks) {
      if (!C.land) continue;
      const box = new THREE.Box3(new THREE.Vector3(C.x0 * GSTEP - GHALF, C.lo - C.skirt - 0.5, C.z0 * GSTEP - GHALF),
        new THREE.Vector3(C.x1 * GSTEP - GHALF, C.hi + 0.5, C.z1 * GSTEP - GHALF));
      C.box = box;
      C.inFar = box.min.x >= -WORLD_HALF && box.max.x <= WORLD_HALF && box.min.z >= -WORLD_HALF && box.max.z <= WORLD_HALF;
      C.sphere = box.getBoundingSphere(new THREE.Sphere());
      const g0 = this._chunkGeo(C, 0);
      tris += g0.userData.tris;
      const m = new THREE.Mesh(g0, mat);
      m.name = `terrain-chunk-${C.cx}-${C.cz}`;
      m.receiveShadow = true;
      C.mesh = m; C.lod = 0;
      root.add(m);
    }
    this._chunks = chunks.filter((C) => C.land);
    this.group.add(root);
    this.mesh = root;
    this.indexedTriangles = tris;
    this._lodOn = true;
    this._lodPx = TLOD_PX;
    this._lodM = TLOD_M;
  }

  /**
   * The far field (M1.1a, TECH §5 lever 4): once, with the renderer, the ground's colour stage is rendered
   * top-down over the world square into two 1024² targets with mips (groundShader.js FAR_*), and the far
   * material reads them. Chunks wholly past FAR_START take it in `updateLod`.
   */
  _bakeFarField() {
    const R = this.ctx.renderer;
    if (this._far || !R || !this._chunks) return;
    const mk = () => new THREE.WebGLRenderTarget(FAR_N, FAR_N, { type: THREE.UnsignedByteType, depthBuffer: true, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    const rtA = mk(), rtN = mk();
    const part = { value: 0 };
    const bake = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    bake.toneMapped = false;
    bake.onBeforeCompile = (shader) => this._groundCompile(shader, part);
    bake.customProgramCacheKey = () => 'cal-ground-farbake';
    const scene = new THREE.Scene();
    for (const C of this._chunks) scene.add(new THREE.Mesh(this._chunkGeo(C, 0), bake));
    const cam = new THREE.OrthographicCamera(-WORLD_HALF, WORLD_HALF, WORLD_HALF, -WORLD_HALF, 1, 2000);
    cam.up.set(0, 0, -1); cam.position.set(0, 1000, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    const prev = { t: R.getRenderTarget(), auto: R.autoClear, sm: R.shadowMap.autoUpdate, c: R.getClearColor(new THREE.Color()), a: R.getClearAlpha() };
    const t0 = performance.now();
    try {
      R.shadowMap.autoUpdate = false; R.autoClear = true; R.setClearColor(0x000000, 0);
      part.value = 0; R.setRenderTarget(rtA); R.render(scene, cam);
      part.value = 1; R.setRenderTarget(rtN); R.render(scene, cam);
    } finally {
      R.setRenderTarget(prev.t); R.autoClear = prev.auto; R.shadowMap.autoUpdate = prev.sm; R.setClearColor(prev.c, prev.a);
      bake.dispose();
    }
    const far = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const U = this.groundUniforms;
    far.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.uniforms.tFarA = { value: rtA.texture };
      shader.uniforms.tFarN = { value: rtN.texture };
      shader.uniforms.uFarInv = { value: 1 / WORLD_SIZE };
      shader.uniforms.uStrata = this._uStrata;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', GROUND_VERT_PARS)
        .replace('#include <worldpos_vertex>', GROUND_VERT_WORLD);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', FAR_FRAG_PARS)
        .replace('#include <color_fragment>', FAR_COLOR)
        .replace('#include <roughnessmap_fragment>', GROUND_ROUGH)
        .replace('#include <normal_fragment_begin>', GROUND_NORMAL)
        .replace('#include <aomap_fragment>', GROUND_AO)
        .replace('#include <fog_fragment>', groundFogChunk());
    };
    far.customProgramCacheKey = () => 'cal-ground-far';
    this.ctx.environment?.registerMaterial?.(far);
    this._far = { rtA, rtN, material: far, on: true, bakeMs: +(performance.now() - t0).toFixed(1) };
  }

  /**
   * M1a round 2 (F32 and the kite): the field walls into the far field. The dyke runs are drawn out to DYKE_R from a
   * lens on the ground (more from a high one) and the ground shader's strip stands in for them only inside the pan box,
   * so past that the town's enclosures and the field's outer walls vanished from altitude. Once the scatter has built
   * the runs, every run is drawn top-down into the far bake (both parts, over the ground's own depth, so it lies on the
   * ground): dark lava stone in the albedo, flat and rough in the normal part, each run 2.2 x as wide (a 0.6 m wall
   * keeps a texel at 1 m a texel) and 1.05 x as long (the runs butt). Three regenerates the targets' mips.
   */
  _bakeFarWalls() {
    const F = this._far, R = this.ctx.renderer;
    if (!F || !R || F.walls) return;
    const src = this.ctx.vegetation?.wallBakeSource?.();
    if (!src) { F.wallTries = (F.wallTries || 0) + 1; if (F.wallTries > 900) F.walls = { runs: 0, note: 'no dyke runs to bake' }; return; }
    const part = { value: 0 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPart: part },
      vertexShader: /* glsl */`
        void main() {
          vec3 p = position; p.x *= 2.2; p.z *= 1.05;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uPart;
        // A: the far field's encoding, pow(albedo, 1/2.2) and liquid 0; N: up, roughness 0.92, AO 0.7 (the wall's foot)
        void main() { gl_FragColor = uPart < 0.5 ? vec4(0.205, 0.198, 0.19, 0.0) : vec4(0.5, 0.5, 0.92, 0.7); }`,
    });
    const mesh = new THREE.InstancedMesh(src.geometry, mat, src.count);
    mesh.instanceMatrix.array.set(src.W.subarray(0, src.count * 16));
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    const cam = new THREE.OrthographicCamera(-WORLD_HALF, WORLD_HALF, WORLD_HALF, -WORLD_HALF, 1, 2000);
    cam.up.set(0, 0, -1); cam.position.set(0, 1000, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    const prev = { t: R.getRenderTarget(), auto: R.autoClear, sm: R.shadowMap.autoUpdate };
    const t0 = performance.now();
    try {
      R.shadowMap.autoUpdate = false; R.autoClear = false;
      part.value = 0; R.setRenderTarget(F.rtA); R.render(scene, cam);
      part.value = 1; R.setRenderTarget(F.rtN); R.render(scene, cam);
    } finally {
      R.setRenderTarget(prev.t); R.autoClear = prev.auto; R.shadowMap.autoUpdate = prev.sm;
      mat.dispose(); mesh.dispose();
    }
    F.walls = { runs: src.count, ms: +(performance.now() - t0).toFixed(1) };
  }

  /** One chunk's index at stride TSTRIDES[k] over the shared buffer, with its skirts (built once). */
  _chunkGeo(C, k) {
    if (C.geos[k]) return C.geos[k];
    const { side, skirtOf } = this._attr, s = TSTRIDES[k];
    const nodesOf = (a, b) => { const o = []; for (let i = a; i < b; i += s) o.push(i); o.push(b); return o; };
    const X = nodesOf(C.x0, C.x1), Z = nodesOf(C.z0, C.z1);
    const nx = X.length - 1, nz = Z.length - 1;
    const keep = new Uint8Array(nx * nz);
    const idx = [];
    for (let j = 0; j < nz; j++) {
      const za = Z[j], zb = Z[j + 1];
      for (let i = 0; i < nx; i++) {
        const xa = X[i], xb = X[i + 1];
        let hi = -1e9;
        for (let iz = za; iz <= zb; iz++) for (let ix = xa; ix <= xb; ix++) { const h = H[iz * side + ix]; if (h > hi) hi = h; }
        if (hi < TDEEP) continue;
        keep[j * nx + i] = 1;
        const a = za * side + xa, b = zb * side + xa, c = zb * side + xb, d = za * side + xb;
        idx.push(a, b, d, b, c, d);
      }
    }
    const quadTris = idx.length / 3;
    /* skirts, both windings, under each border edge whose quad is kept */
    const wall = (p, q) => { const sp = skirtOf[p], sq = skirtOf[q]; idx.push(p, sp, q, q, sp, sq, p, q, sp, q, sq, sp); };
    for (let i = 0; i < nx; i++) {
      if (keep[i]) wall(Z[0] * side + X[i], Z[0] * side + X[i + 1]);
      if (keep[(nz - 1) * nx + i]) wall(Z[nz] * side + X[i], Z[nz] * side + X[i + 1]);
    }
    for (let j = 0; j < nz; j++) {
      if (keep[j * nx]) wall(Z[j] * side + X[0], Z[j + 1] * side + X[0]);
      if (keep[j * nx + nx - 1]) wall(Z[j] * side + X[nx], Z[j + 1] * side + X[nx]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', this._attr.position);
    g.setAttribute('normal', this._attr.normal);
    g.setAttribute('aTint', this._attr.aTint);
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.boundingBox = C.box; g.boundingSphere = C.sphere;
    g.userData.tris = quadTris;
    C.geos[k] = g;
    return g;
  }

  /**
   * Per frame: each chunk to the coarsest stride that keeps its height error under `_lodPx` device px at its
   * distance and stays `_lodM` m a stride away from the camera. Allocation-free after the first use of a stride.
   */
  updateLod(camera = this.ctx.camera) {
    if (!this._chunks || !camera) return;
    const p = camera.position;
    const persp = camera.isPerspectiveCamera;
    const hPx = (this.ctx.renderer?.domElement?.height || 1125);
    const K = persp ? hPx / (2 * Math.tan((camera.fov * Math.PI) / 360)) : 0;
    let hist = this._lodHist || (this._lodHist = new Int32Array(TSTRIDES.length));
    hist.fill(0);
    const F = this._far, farOn = !!(F && F.on && persp);
    for (const C of this._chunks) {
      let k = 0, far = false;
      if ((this._lodOn || farOn) && persp) {
        const b = C.box;
        const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x), dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y), dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (this._lodOn) for (let j = C.maxLod; j > 0; j--) {
          if (d >= this._lodM * TSTRIDES[j] && C.err[j] * K <= this._lodPx * d) { k = j; break; }
        }
        far = farOn && C.inFar && d >= FAR_START;
      }
      hist[k]++;
      if (k !== C.lod) { C.mesh.geometry = this._chunkGeo(C, k); C.lod = k; }
      const m = far ? F.material : this.groundMaterial;
      if (C.mesh.material !== m) C.mesh.material = m;
    }
  }

  /** What the chunks draw now (the census and F32 read it). */
  lodStats() {
    if (!this._chunks) return null;
    const by = TSTRIDES.map((s) => ({ stride: s, chunks: 0, tris: 0 }));
    let tris = 0, far = 0;
    for (const C of this._chunks) { const g = C.geos[C.lod]; by[C.lod].chunks++; by[C.lod].tris += g.userData.tris; tris += g.userData.tris; if (this._far && C.mesh.material === this._far.material) far++; }
    return { farChunks: far, farBakeMs: this._far?.bakeMs ?? null, farStart: FAR_START, chunks: this._chunks.length, chunkSegs: TCHUNK, lodOn: this._lodOn, lodPx: this._lodPx, lodM: this._lodM, trisAllChunks: tris, fullResTris: this.indexedTriangles, by };
  }

  /**
   * Runtime switches for the M1.1a A/B (tools/perf/census.mjs): each { id, on(), off() }, measured on
   * against off in one clock state. 'terrain-lod' off = every chunk at full resolution.
   */
  perfSwitches() {
    const cam = () => this.ctx.camera;
    return [
      { id: 'terrain-lod', on: () => { this._lodOn = true; this.updateLod(cam()); }, off: () => { this._lodOn = false; this.updateLod(cam()); } },
      { id: 'terrain-far', on: () => { if (this._far) this._far.on = true; this.updateLod(cam()); }, off: () => { if (this._far) this._far.on = false; this.updateLod(cam()); } },
      ...this.groundTermSwitches(),
    ];
  }

  /**
   * M1a round 2: the near ground shader term by term (groundShader.js CAL_P_*): each switch's 'off' compiles the
   * ground material without that term (a define; three caches both programs), so on - off is the term's cost.
   * 'ground-flat' off draws the whole colour stage as one constant: the stage's whole cost.
   */
  groundTermSwitches() {
    const mat = this.groundMaterial;
    const def = (k, on) => { const d = { ...(mat.defines || {}) }; if (on) delete d[k]; else d[k] = 1; mat.defines = d; mat.needsUpdate = true; };
    const T = [['ground-pebbles', 'CAL_P_NOPEB'], ['ground-crust-detail', 'CAL_P_NOCRUST'], ['ground-pits', 'CAL_P_NOPITS'],
      ['ground-salt-2nd', 'CAL_P_NOSALT2'], ['ground-layer-2nd', 'CAL_P_NOL2'], ['ground-pan-cubic', 'CAL_P_NOCUBIC'],
      ['ground-field-range', 'CAL_P_NOFIELD'], ['ground-meadow-tone', 'CAL_P_NOMTONE'], ['ground-rills', 'CAL_P_NORILL'],
      ['ground-colour-stage', 'CAL_P_FLAT'], ['ground-r2-lod', 'CAL_P_R1LOD']];
    return T.map(([id, k]) => ({ id, on: () => def(k, true), off: () => def(k, false) }));
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
     * sea-level haze thicker than the air at its summit, so the form reads in layers. M1a round 2: that
     * colour is the fog's in-scatter on the isle's ray (the dome's horizon hand-over, water.js SEA_LINE),
     * not the old stand-in darkened off the sun, and the isle thins further with range (x0.75 by 2.2 km):
     * the farthest layer is the palest */
    float hk = smoothstep(-5.0, 150.0, vFogWorldPos.y);
    vec3 dv = vFogWorldPos - cameraPosition;
    float dl = max(length(dv), 1e-3);
    dv /= dl;
    float vis = uIsleVis * (0.62 + 0.38 * hk) * (1.0 - 0.25 * smoothstep(900.0, 2200.0, dl));
    float up = clamp(dv.y * 1.55 + 0.10, 0.0, 1.0);
    vec3 air = mix(calFogHorizon, calFogZenith, up * up);
    float ac = dot(dv, calSunDir);
    air += calFogSun * (calHG(calFogG.x, ac) * calFogG.y + calHG(calFogG.z, ac) * calFogG.w) * calFogB.x;
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
      for (const p of line) if (this.reedCoverDensity(p[0], p[1]) > 0.45) cov++;
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
    if (this._maskArray) {
      if (this._maskArrayLive) this._maskArray.addLayerUpdate(1);
      this._maskArray.needsUpdate = true;
    }
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
    const tint = this._attr.aTint.array;
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
   * THE ROUND-4 SETTLEMENT MUST NOT STAND IN THE PANS. `rest site.js` builds its palisade and huts
   * around REST_SITE, which is Saltrow now; settlements replaces it at W2 (plan §6). Until
   * then its art and its blockers are retired here, once, through the public scene and
   * collision surface; its REST & SAVE interactable keeps working on the same point.
   */
  _retireOldSite() {
    const old = this.ctx.settlements, C = this.ctx.collision;
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
    if (!this._far) this._bakeFarField();
    else if (!this._far.walls) this._bakeFarWalls();
    this.updateLod();
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
  /** Once per rendered frame (main.js): the chunks follow the camera even with time frozen. */
  interpolate() { this.updateLod(); }

  dispose() {
    for (const C of this._chunks || []) for (const g of C.geos) g?.dispose();
    this._fieldArray?.dispose(); this._maskArray?.dispose();
    if (this._far) { this._far.rtA.dispose(); this._far.rtN.dispose(); this._far.material.dispose(); this._far = null; }
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
