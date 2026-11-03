import * as THREE from 'three';
import { WORLD_SIZE } from './island/extent.js';
import { COAST, GLASS, GLASS_LEVEL, SEA_LEVEL } from './island/recipe.js';
import { ISLAND_SCALE as S } from './island/extent.js';

/**
 * THE SEA AND THE GLASS (world-ground W1, bible §9.5). The island's signature image is the
 * white surf band on black sand, and it comes from one term: the baked coast distance in
 * the single sea shader (1 draw) drives wave fronts that break, run up the beach and pull
 * back. The Glass is the emerald lagoon behind its barrier: one more draw, still and
 * mirror-like, wading depth. Pans brine is in the ground shader (0 draws). No rivers.
 *
 * Both are lit MeshStandardMaterials, so foam is white in sun and ochre in calima through
 * the same lights as the sand, and the mirror is this sky at this hour from world-sky's
 * aerial colours (no second render target).
 *
 * PUBLISHED: water.levelAt(x, z)   surface height, or null off the water
 *            water.depthAt(x, z)   metres of water, 0 off the water
 *            water.flowAt(x, z, out)  unit XZ shoreward drift (the wade push, audio)
 *            water.pools           [{ x, z, level, rx, rz }]: the Glass first, then the
 *                                  coastal wading ring (player.js `_waterDepth`, nav.js)
 *            water.seaLevel, water.tick(dt, t)
 *
 * Tide (E19, W2) slots in at `seaLevel`.
 */

const SEA_PARS = /* glsl */ `
#include <common>
varying vec3 vWPos;
uniform sampler2D tShore;
uniform sampler2D tRipple;
uniform float uTime;
uniform float uLevel;
uniform float uWorldInv;
uniform float uPlaneY;
vec3 wN; float wRough; float wMirror; float wSkyBias = 0.26; float wFresnelMax = 0.5;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
}
`;

const SEA_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec2 p = vWPos.xz;
  float dCam = length(vWPos - cameraPosition);
  vec2 muv = p * uWorldInv + 0.5;
  float inMap = step(max(abs(muv.x - 0.5), abs(muv.y - 0.5)), 0.4985);
  vec4 sh = texture2D(tShore, clamp(muv, 0.0, 1.0));
  // signed coast distance (+ inland) and ground height, from the same bake the ground reads
  float coast = mix(-48.0, sh.r * 128.0 - 48.0, inMap);
  if (coast > 9.0) discard;                 // the sea never stands inland: the Glass has its own surface
  float off = max(-coast, 0.0);
  float ground = mix(-2.0, sh.g * 4.5 - 2.0, inMap);

  /* the set: three trains of fronts with their own speed, wandering along the shore */
  float along = wNoise(p * 0.011) * 3.1 + wNoise(p * 0.037 + 4.0) * 0.8;
  float ph1 = off * 0.052 + uTime * 0.150 + along;
  float ph2 = off * 0.083 + uTime * 0.205 + along * 1.7 + 2.3;
  float ph3 = off * 0.137 + uTime * 0.262 + along * 2.3 + 5.1;
  float w1 = fract(ph1), w2 = fract(ph2), w3 = fract(ph3);
  float set1 = 0.5 + 0.5 * sin(floor(ph1) * 2.4 + 1.3);         // not every wave is big
  float set2 = 0.5 + 0.5 * sin(floor(ph2) * 3.7 + 0.4);

  /* where the waves stand up and break: wider off points, narrower in the coves */
  float breakW = 15.0 + 22.0 * wNoise(p * 0.016 + 21.0);
  float brk = 1.0 - smoothstep(breakW * 0.62, breakW, off);
  float swellK = smoothstep(0.0, 6.0, off) * (1.0 - smoothstep(breakW * 1.3, breakW * 2.8, off));

  /* the run-up: the waterline itself moves. s is the bore's age at this bit of shore */
  float s = fract(along * 0.5 + uTime * 0.125);
  float big = 0.62 + 0.38 * sin(floor(along * 0.5 + uTime * 0.125) * 2.4 + 1.3);
  float runup = 0.26 * exp(-s * 3.4) * (1.0 - smoothstep(0.92, 1.0, s)) * big;
  float level = uLevel + 0.02 + runup + (wNoise(p * 0.55) - 0.5) * 0.035;
  float depth = level - ground;
  float alphaK = smoothstep(0.0, 0.03, depth);
  if (alphaK <= 0.0 && inMap > 0.5) discard;

  /* the foam's own structure, three scales, advected with the water */
  float laceFar = 1.0 - smoothstep(70.0, 260.0, dCam);
  float nearK = 1.0 - smoothstep(10.0, 46.0, dCam);
  vec2 drift = vec2(0.03, 0.02) * uTime;
  vec2 warp = (texture2D(tRipple, p * 0.031 + drift * 0.3).xy - 0.5) * 0.14;
  float n1 = texture2D(tRipple, p * 0.19 + warp + drift).b;
  float n2 = texture2D(tRipple, p * 0.067 - warp - drift * 0.6).a;
  float n3 = nearK > 0.0 ? texture2D(tRipple, p * 0.67 + warp * 3.0 - drift * 2.0).b : 0.5;
  float lace = mix(n1 * 0.6 + n2 * 0.4, n1 * 0.46 + n2 * 0.26 + n3 * 0.28, nearK);

  /* how much of the surface is white: a crest is nearly solid, what it leaves behind is lace */
  float crest1 = exp(-w1 * 7.5) * smoothstep(0.0, 0.012, w1) * (0.42 + 0.58 * set1);
  float crest2 = exp(-w2 * 9.5) * smoothstep(0.0, 0.016, w2) * (0.3 + 0.5 * set2);
  float crest3 = exp(-w3 * 12.0) * smoothstep(0.0, 0.02, w3) * 0.45;
  float trail = exp(-w1 * 2.4) * (0.42 + 0.58 * set1) * 0.72 + exp(-w2 * 3.2) * (0.3 + 0.5 * set2) * 0.46;
  float cover = max(crest1 * 1.25, max(crest2 * 1.15, crest3)) * brk;
  cover = max(cover, trail * brk * 0.68);
  // the carpet: spent bores lie on the shallows, thinning seaward in fingers
  float carpet = (1.0 - smoothstep(0.0, 7.0 + 15.0 * n2, off)) * (0.34 + 0.46 * exp(-s * 1.6));
  cover = max(cover, carpet);
  // the leading lip of the swash, a bright thin line
  float lipLine = (1.0 - smoothstep(0.0, 0.05 + 0.05 * n1, depth)) * (0.45 + 0.55 * exp(-s * 2.6));
  cover = max(cover, lipLine * 1.1);
  float foamTex = mix(0.5, lace, laceFar);
  float foam = smoothstep(1.02 - cover * 1.06, 1.2 - cover * 1.02, foamTex + 0.2);

  // far out the odd whitecap: small, sparse, drawn out by the trade wind
  vec2 capP = vec2(dot(p, vec2(0.7071, -0.7071)) * 0.21, dot(p, vec2(0.7071, 0.7071)) * 0.07);
  float cap = smoothstep(0.84, 0.93, texture2D(tRipple, capP + drift * 0.8).a)
            * smoothstep(0.55, 0.8, wNoise(p * 0.023 + uTime * 0.04)) * smoothstep(38.0, 48.0, off) * 0.6;
  foam = max(foam, cap);

  /* water colour: Atlantic #1F4E66, dark over black sand, lit through the back of a wave */
  vec3 deep = vec3(0.0137, 0.0762, 0.1329);
  vec3 turbid = vec3(0.0095, 0.0430, 0.0560);
  vec3 body = mix(turbid, deep, smoothstep(6.0, 46.0, off));
  float wall = smoothstep(0.70, 0.985, w1) * brk * (0.3 + 0.7 * set1);
  body = mix(body, vec3(0.035, 0.205, 0.195), wall * 0.82);
  float wall2 = smoothstep(0.76, 0.99, w2) * brk * (0.2 + 0.5 * set2);
  body = mix(body, vec3(0.03, 0.17, 0.165), wall2 * 0.6);
  // the thin sheet over the beach shows the black sand under it
  float sheet = 1.0 - smoothstep(0.02, 0.42, depth);
  body = mix(body, vec3(0.012, 0.012, 0.014), sheet * 0.8);

  /* normals: ripple octaves + the wave's own slope */
  float nFade = 1.0 - smoothstep(60.0, 420.0, dCam);
  vec2 r1 = texture2D(tRipple, p * 0.042 + drift * 1.3).xy * 2.0 - 1.0;
  vec2 r2 = texture2D(tRipple, p.yx * 0.11 - drift * 2.1).xy * 2.0 - 1.0;
  vec2 r3 = texture2D(tRipple, p * 0.0067 + drift * 0.2).xy * 2.0 - 1.0;
  vec2 rip = (r1 * 0.36 + r2 * 0.2 * nFade) * (0.3 + 0.7 * nFade) + r3 * 0.16;
  vec2 slopeDir = normalize(vec2(sh.r - texture2D(tShore, clamp(muv + vec2(0.004, 0.0), 0.0, 1.0)).r,
                                 sh.r - texture2D(tShore, clamp(muv + vec2(0.0, 0.004), 0.0, 1.0)).r) + vec2(1e-4));
  float waveS = (exp(-w1 * 4.0) - 0.42 * wall) * swellK * (0.4 + 0.6 * set1) + (exp(-w2 * 5.0) - 0.3 * wall2) * swellK * 0.32;
  wN = vec3(rip.x + slopeDir.x * waveS * 0.6, 0.0, rip.y + slopeDir.y * waveS * 0.6) * (1.0 - foam * 0.75);

  vec3 foamC = vec3(0.86, 0.87, 0.85) * (0.8 + 0.2 * lace);
  diffuseColor.rgb = mix(body, foamC, foam);
  diffuseColor.a = alphaK * mix(0.94 + 0.06 * smoothstep(0.05, 0.8, depth), 1.0, foam);
  wRough = mix(0.08 + 0.1 * (1.0 - nFade), 0.92, foam);
  wMirror = (1.0 - foam);
}
`;

const GLASS_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec2 p = vWPos.xz;
  vec2 muv = p * uWorldInv + 0.5;
  vec4 sh = texture2D(tShore, clamp(muv, 0.0, 1.0));
  float ground = sh.g * 4.5 - 2.0;
  float depth = uLevel - ground;
  float alphaK = smoothstep(0.0, 0.05, depth);
  if (alphaK <= 0.0) discard;
  vec2 drift = vec2(0.004, 0.003) * uTime;
  vec2 r1 = texture2D(tRipple, p * 0.11 + drift).xy * 2.0 - 1.0;
  vec2 r2 = texture2D(tRipple, p * 0.31 - drift * 1.7).xy * 2.0 - 1.0;
  wN = vec3(r1.x * 0.022 + r2.x * 0.012, 0.0, r1.y * 0.022 + r2.y * 0.012);
  // the Glass: emerald #2F8F6F over a pale bed, darkening fast with depth
  vec3 emerald = vec3(0.028, 0.274, 0.159);
  vec3 shallow = vec3(0.10, 0.32, 0.22);
  diffuseColor.rgb = mix(shallow, emerald, smoothstep(0.02, 0.5, depth));
  diffuseColor.a = alphaK * 0.97;
  wRough = 0.06;
  wMirror = 1.0;
  wSkyBias = 0.06;
  wFresnelMax = 1.0;
}
`;

const SEA_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(wRough, 0.05, 1.0);
`;
const SEA_NORMAL = /* glsl */ `
#include <normal_fragment_begin>
normal = normalize(normal + (viewMatrix * vec4(wN, 0.0)).xyz);
`;
const SEA_MIRROR = /* glsl */ `
#include <aomap_fragment>
#ifdef USE_FOG
{
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 W = normalize(vec3(0.0, 1.0, 0.0) + wN);
  vec3 R = reflect(-V, W);
  float up = clamp(R.y * 1.6 + wSkyBias, 0.0, 1.0);
  vec3 sky = mix(calFogHorizon, calFogZenith, up);
  float sd = max(dot(R, calSunDir), 0.0);
  sky += calFogSun * pow(sd, 6.0) * 0.55;
  float F = min(0.02 + 0.98 * pow(1.0 - max(dot(V, W), 0.0), 5.0), wFresnelMax);
  reflectedLight.indirectSpecular += sky * F * wMirror;
}
#endif
`;

function bakeRipple(N = 256) {
  /* RG ripple normal (sums of periodic directional waves), B foam lace, A big-scale lace. */
  const data = new Uint8Array(N * N * 4);
  const W = [];
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 26; i++) {
    const f = 1 + Math.floor(rnd() * rnd() * 22), a = rnd() * 6.2832;
    W.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), rnd() * 6.2832, 1 / (1 + f * 0.45)]);
  }
  const cells = (u, v, p, seed) => {
    const x = u * p, y = v * p, ix = Math.floor(x), iy = Math.floor(y);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = ((ix + i) % p + p) % p, cy = ((iy + j) % p + p) % p;
      const hx = Math.abs(Math.sin(cx * 127.1 + cy * 311.7 + seed) * 43758.5453) % 1;
      const hy = Math.abs(Math.sin(cx * 269.5 + cy * 183.3 + seed) * 43758.5453) % 1;
      const d = Math.hypot(ix + i + hx - x, iy + j + hy - y);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
  };
  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const u = x / N;
      let dx = 0, dy = 0;
      for (let i = 0; i < W.length; i++) {
        const w = W[i], c = Math.cos((w[0] * u + w[1] * v) * 6.2832 + w[2]) * w[3];
        dx += c * w[0] * 0.05; dy += c * w[1] * 0.05;
      }
      const o = (y * N + x) * 4;
      data[o] = Math.max(0, Math.min(255, (dx * 0.5 + 0.5) * 255));
      data[o + 1] = Math.max(0, Math.min(255, (dy * 0.5 + 0.5) * 255));
      // foam lace is the network between bubbles: thin bright rims around dark cells
      const l1 = 1 - Math.min(1, cells(u, v, 7, 1) * 3.2), l2 = 1 - Math.min(1, cells(u, v, 17, 5) * 2.6);
      data[o + 2] = Math.max(0, Math.min(255, (l1 * 0.66 + l2 * 0.34) * 255));
      data[o + 3] = Math.max(0, Math.min(255, (1 - Math.min(1, cells(u, v, 4, 9) * 1.9)) * 255));
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 2;
  t.needsUpdate = true;
  return t;
}

export class IslandWater {
  constructor(ctx, terrain) {
    this.ctx = ctx;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.seaLevel = SEA_LEVEL;
    this.glassLevel = GLASS_LEVEL;
    this._uTime = { value: 0 };
    this._uLevel = { value: SEA_LEVEL };
    this._uGlassLevel = { value: GLASS_LEVEL };
    this._ripple = bakeRipple();
    this._glass = { x: GLASS.e * S, z: -GLASS.n * S, rx: GLASS.re * S, rz: GLASS.rn * S };
    this.pools = this._buildPools();

    const shore = terrain._maskTextures.shore;
    const mk = (colorChunk, levelU, planeY, key) => {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0, transparent: true, depthWrite: false });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.tShore = { value: shore };
        shader.uniforms.tRipple = { value: this._ripple };
        shader.uniforms.uTime = this._uTime;
        shader.uniforms.uLevel = levelU;
        shader.uniforms.uWorldInv = { value: 1 / WORLD_SIZE };
        shader.uniforms.uPlaneY = { value: planeY };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', SEA_PARS)
          .replace('#include <color_fragment>', colorChunk)
          .replace('#include <roughnessmap_fragment>', SEA_ROUGH)
          .replace('#include <normal_fragment_begin>', SEA_NORMAL)
          .replace('#include <aomap_fragment>', SEA_MIRROR);
      };
      mat.customProgramCacheKey = () => key;
      return mat;
    };

    /* The sea plane rides 0.34 m above sea level: the run-up has to reach above it, and a
     * fragment over dry sand is discarded by its own depth term. Out to the far plane. */
    const SEA_Y = this.seaLevel + 0.34;
    const seaGeo = new THREE.PlaneGeometry(7000, 7000, 1, 1).rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(seaGeo, mk(SEA_COLOR, this._uLevel, SEA_Y, 'cal-sea'));
    this.sea.position.y = SEA_Y;
    this.sea.name = 'island-sea';
    this.sea.renderOrder = 1;
    this.sea.frustumCulled = false;
    this.group.add(this.sea);

    const gw = this._glass.rx * 2.9, gh = this._glass.rz * 2.9;
    const glassGeo = new THREE.PlaneGeometry(gw, gh, 1, 1).rotateX(-Math.PI / 2);
    this.glassMesh = new THREE.Mesh(glassGeo, mk(GLASS_COLOR, this._uGlassLevel, GLASS_LEVEL, 'cal-glass'));
    this.glassMesh.position.set(this._glass.x, GLASS_LEVEL, this._glass.z);
    this.glassMesh.name = 'the-glass-water';
    this.glassMesh.renderOrder = 1;
    this.group.add(this.glassMesh);

    ctx.scene.add(this.group);
  }

  /**
   * `pools[0]` is the Glass (the wading contract). The rest stand along the coast, centred
   * offshore, so `player._waterDepth` wades her in the sea through the kept code; frozen
   * nav.js marks their cells as standing water.
   */
  _buildPools() {
    const G = this._glass;
    const pools = [{ x: G.x, z: G.z, level: GLASS_LEVEL, rx: G.rx * 1.25, rz: G.rz * 1.25, kind: 'glass' }];
    const SP = 62 * S, R = 46 * S, OUT = 30 * S;
    const P = COAST, L = P.length;
    let carry = 0;
    let cx = 0, cz = 0;
    for (const p of P) { cx += p[0]; cz += p[1]; }
    cx /= L; cz /= L;
    for (let i = 0; i < L; i++) {
      const a = P[i], b = P[(i + 1) % L];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      let t = carry;
      while (t < len) {
        const e = a[0] + (dx * t) / len, n = a[1] + (dz * t) / len;
        const rx = e - cx, rz = n - cz, rl = Math.hypot(rx, rz) || 1;
        const ox = e + (rx / rl) * (OUT / S), oz = n + (rz / rl) * (OUT / S);
        pools.push({ x: ox * S, z: -oz * S, level: this.seaLevel, rx: R, rz: R, kind: 'sea' });
        t += SP / S;
      }
      carry = t - len;
    }
    return pools;
  }

  /** Surface height at a point, or null off the water. */
  levelAt(x, z) {
    const G = this._glass;
    const gx = (x - G.x) / G.rx, gz = (z - G.z) / G.rz;
    const h = this.terrain.getHeight(x, z);
    if (gx * gx + gz * gz < 2.2 && h < GLASS_LEVEL) return GLASS_LEVEL;
    return h < this.seaLevel ? this.seaLevel : null;
  }

  /** Metres of water at a point, 0 off the water. */
  depthAt(x, z) {
    const L = this.levelAt(x, z);
    if (L === null) return 0;
    const d = L - this.terrain.getHeight(x, z);
    return d > 0 ? d : 0;
  }

  /** Unit XZ drift: toward the island's centre on the sea (shoreward), still on the Glass. */
  flowAt(x, z, out) {
    const o = out || { x: 0, y: 0, z: 0 };
    const G = this._glass;
    const gx = (x - G.x) / G.rx, gz = (z - G.z) / G.rz;
    if (gx * gx + gz * gz < 2.2) { o.x = 0; o.z = 0; return o; }
    const r = Math.hypot(x, z) || 1;
    o.x = -x / r; o.z = -z / r;
    return o;
  }

  /** Per frame: one time uniform. */
  tick(dt, t) {
    this._uTime.value = t;
    this._uLevel.value = this.seaLevel;
  }

  /** Round-4 name, still called by environment.js until world-sky's W1 removes it. */
  update(dt, t) { this.tick(dt, t); }

  dispose() {
    for (const m of [this.sea, this.glassMesh]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this._ripple.dispose();
    this._ripple = null;
    this.group.parent?.remove(this.group);
    this.group.clear();
    this.pools = [];
  }
}

/**
 * ALIAS UNTIL world-sky's W1 MERGE: environment.js still does `new RiverWater(ctx)` and its
 * `.update`; the river is gone, so this hands back the island's one water. world-sky deletes
 * the import (`A-no-river`), then this line goes.
 */
export class RiverWater { constructor(ctx) { return ctx.water; } }
