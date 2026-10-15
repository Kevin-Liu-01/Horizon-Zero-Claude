/**
 * ROUND 5 PIPELINE PROOF — `?poc=biome` (dev only; main.js skips the game
 * boot entirely for this flag, so the default boot is untouched).
 *
 * A 200 m x 200 m patch of a NEW region — "the salt coast": black basalt
 * sand dunes, a salt pan, a columnar-basalt shelf, a tidal lagoon — built
 * the way a Round-5 map would be, on the KEPT engine (core/engine.js: CSM,
 * GTAO, post chain, warm-up, perf ring):
 *
 *   landform recipe   height(x, z) — the only part of terrain.js a new map
 *                     replaces; masks (salt / rock / wet) come from the same
 *                     functions and are baked once into a 256^2 DataTexture
 *   ground material   3-layer height-blended splat (sand + salt planar, rock
 *                     triplanar) from tools/r5-poc/gen-ground.mjs textures
 *   scatter           one InstancedMesh per kind (columns, boulders, glasswort,
 *                     marram, salt shards), placed by the same masks
 *   landmark          tools/r5-poc/gen-landmark.mjs GLB (2 draws + 1 caster)
 *   scale reference   two static Tillers (the creature GLB in its bind pose)
 *
 * window.__R5BIOME__ exposes views (for film-creature-world.mjs), stats and a
 * per-owner draw-call ledger. Everything created here is disposed by
 * __R5BIOME__.dispose().
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Engine } from '/src/core/engine.js';

const PATCH = 200, HALF = PATCH / 2, SEG = 200;
const WATER_Y = -0.9, PAN_Y = 0.05;
const PAN = { x: -8, z: 6, rx: 46, rz: 30 };
const RING = { x: -6, z: 8 };

/* --------------------------- noise (no allocation) ----------------------- */
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
function fbm(x, z, oct = 4) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f + o * 17.3, z * f - o * 9.1); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/* --------------------------- the landform recipe ------------------------- */
export function panMask(x, z) {
  const d = Math.hypot((x - PAN.x) / PAN.rx, (z - PAN.z) / PAN.rz) + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 0.28;
  return ss(1.0, 0.86, d);
}
export function shelfMask(x, z) {
  const s = x * 0.55 + z * 0.83 - 50 + (fbm(x * 0.03 + 7, z * 0.03, 3) - 0.5) * 26;
  return ss(-1.6, 1.6, s);
}
export function height(x, z) {
  // dunes: long crests across the onshore wind, plus rolling fbm
  const warp = fbm(x * 0.01, z * 0.01, 2) * 6;
  const dune = Math.pow(Math.abs(Math.sin((x * 0.045 + z * 0.075) + warp)), 1.6) * 2.2;
  let h = 0.9 + (fbm(x * 0.018, z * 0.018, 4) - 0.5) * 3.2 + dune * (0.5 + fbm(x * 0.02, z * 0.02, 2));
  // the coast falls away to the south-west into the lagoon / sea
  const coast = -x * 0.6 - z * 0.8;
  h -= ss(45, 150, coast) * 5.5;
  // the salt pan: flattened, a hair above the water table
  const pm = panMask(x, z);
  h = h + (PAN_Y + (fbm(x * 0.2, z * 0.2, 2) - 0.5) * 0.06 - h) * pm;
  // the basalt shelf: a 7-9 m terrace with a stepped edge
  const sh = shelfMask(x, z);
  const step = Math.floor(sh * 3 + fbm(x * 0.1, z * 0.1, 2) * 0.6) / 3;
  h += (sh * 0.65 + step * 0.35) * (7.5 + fbm(x * 0.04, z * 0.04, 3) * 3.0);
  // far field (the skirt only): mesas to the north-east, open sea to the south-west
  const r = Math.hypot(x, z);
  if (r > 110) {
    const ne = ss(-0.2, 0.6, (x + z) / (r * 1.414));
    h += ss(140, 520, r) * ne * (18 + 70 * Math.pow(fbm(x * 0.006, z * 0.006, 4), 2.2));
    h -= ss(120, 320, r) * (1 - ne) * 6;
  }
  return h;
}
function slopeAt(x, z) {
  const e = 0.75;
  return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
}

/* --------------------------- shader chunks ------------------------------- */
const COMMON_V = /* glsl */`#include <common>
varying vec3 vWPos;
varying vec3 vWNorm;`;
const WORLD_V = /* glsl */`#include <worldpos_vertex>
{
  vec4 r5p = vec4(transformed, 1.0);
  vec3 r5n = objectNormal;
  #ifdef USE_INSTANCING
    r5p = instanceMatrix * r5p;
    r5n = mat3(instanceMatrix) * r5n;
  #endif
  vWPos = (modelMatrix * r5p).xyz;
  vWNorm = normalize(mat3(modelMatrix) * r5n);
}`;
const COMMON_F = /* glsl */`#include <common>
varying vec3 vWPos;
varying vec3 vWNorm;
uniform sampler2D tSandA; uniform sampler2D tSandN;
uniform sampler2D tSaltA; uniform sampler2D tSaltN;
uniform sampler2D tRockA; uniform sampler2D tRockN;
uniform sampler2D tMask;
uniform vec4 uPatch;   // x0, z0, size, waterY
uniform vec3 uScale;   // 1/tile (m) for sand, salt, rock
uniform vec3 uRockTint;
vec3 r5N; float r5Rough; float r5AO;
float r5hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float r5noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(r5hash(i), r5hash(i + vec2(1, 0)), f.x), mix(r5hash(i + vec2(0, 1)), r5hash(i + vec2(1, 1)), f.x), f.y); }
// rock, triplanar: albedo (rgb) + height (a); world-space normal offset + rough/ao
vec4 r5Rock(vec3 wp, vec3 wn, out vec3 pert, out vec2 ra) {
  vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  vec2 ux = wp.zy * uScale.z, uy = wp.xz * uScale.z, uz = wp.xy * uScale.z;
  vec4 a = texture2D(tRockA, ux) * bw.x + texture2D(tRockA, uy) * bw.y + texture2D(tRockA, uz) * bw.z;
  vec4 nx = texture2D(tRockN, ux), ny = texture2D(tRockN, uy), nz = texture2D(tRockN, uz);
  vec2 tx = nx.xy * 2. - 1., ty = ny.xy * 2. - 1., tz = nz.xy * 2. - 1.;
  pert = vec3(0.0, tx.y, tx.x) * bw.x + vec3(ty.x, 0.0, ty.y) * bw.y + vec3(tz.x, tz.y, 0.0) * bw.z;
  ra = vec2(nx.z * bw.x + ny.z * bw.y + nz.z * bw.z, nx.w * bw.x + ny.w * bw.y + nz.w * bw.z);
  a.rgb = mix(vec3(dot(a.rgb, vec3(0.3, 0.59, 0.11))), a.rgb, 0.28) * uRockTint;
  return a;
}`;
const GROUND_COLOR = /* glsl */`#include <color_fragment>
{
  vec3 wn = normalize(vWNorm);
  vec2 muv = (vWPos.xz - uPatch.xy) / uPatch.z;
  vec4 mk = texture2D(tMask, clamp(muv, 0.002, 0.998));
  float inside = 1.0 - step(1.0, max(abs(muv.x - 0.5), abs(muv.y - 0.5)) * 2.0);
  float dist = length(vWPos - cameraPosition);
  // sand, planar, with a rotated 0.31x sample fading in to break the repeat
  vec2 uvS = vWPos.xz * uScale.x;
  vec4 sa = texture2D(tSandA, uvS); vec4 sn = texture2D(tSandN, uvS);
  vec4 sa2 = texture2D(tSandA, mat2(0.8, -0.6, 0.6, 0.8) * uvS * 0.31);
  sa.rgb = mix(sa.rgb, (sa.rgb + sa2.rgb) * 0.5, smoothstep(10.0, 40.0, dist));
  vec2 uvL = vWPos.xz * uScale.y;
  vec4 la = texture2D(tSaltA, uvL); vec4 ln = texture2D(tSaltN, uvL);
  vec3 rP; vec2 rRA;
  vec4 ra = r5Rock(vWPos, wn, rP, rRA);
  float slope = 1.0 - wn.y;
  float wRock = clamp(max(mk.g * inside, smoothstep(0.28, 0.5, slope)), 0.0, 1.0);
  float wSalt = mk.r * inside * (1.0 - wRock);
  float wSand = clamp(1.0 - wSalt - wRock, 0.0, 1.0);
  // height blend: the layer that stands taller in the texel wins the edge
  float h0 = sa.a + wSand * 1.5, h1 = la.a + wSalt * 1.5, h2 = ra.a + wRock * 1.5;
  float hm = max(h0, max(h1, h2)) - 0.3;
  float b0 = max(h0 - hm, 0.0) * step(0.002, wSand);
  float b1 = max(h1 - hm, 0.0) * step(0.002, wSalt);
  float b2 = max(h2 - hm, 0.0) * step(0.002, wRock);
  float bs = b0 + b1 + b2 + 1e-5; b0 /= bs; b1 /= bs; b2 /= bs;
  vec3 col = sa.rgb * b0 + la.rgb * b1 + ra.rgb * b2;
  float mac = r5noise(vWPos.xz * 0.035) * 0.6 + r5noise(vWPos.xz * 0.11) * 0.4;
  col *= 0.84 + 0.32 * mac;
  float wet = clamp(mk.b * inside + smoothstep(uPatch.w + 0.7, uPatch.w + 0.05, vWPos.y), 0.0, 1.0);
  col *= mix(1.0, 0.5, wet * (1.0 - b1 * 0.7));
  r5AO = sn.w * b0 + ln.w * b1 + rRA.y * b2;
  col *= mix(1.0, r5AO, 0.35);
  diffuseColor.rgb = col;
  r5N = vec3(sn.x * 2. - 1., 0.0, sn.y * 2. - 1.) * b0 + vec3(ln.x * 2. - 1., 0.0, ln.y * 2. - 1.) * b1 + rP * b2;
  r5Rough = mix(sn.z * b0 + ln.z * b1 + rRA.x * b2, 0.16, wet * 0.85);
}`;
const ROCK_COLOR = /* glsl */`#include <color_fragment>
{
  vec3 wn = normalize(vWNorm);
  vec3 rP; vec2 rRA;
  vec4 ra = r5Rock(vWPos, wn, rP, rRA);
  float mac = r5noise(vWPos.xz * 0.21 + vWPos.y * 0.13);
  // salt/dust settles on up-facing faces; the foot of a column is wet-dark
  vec3 col = ra.rgb * (0.85 + 0.3 * mac);
  col = mix(col, vec3(0.62, 0.6, 0.56), smoothstep(0.75, 0.98, wn.y) * 0.35);
  col *= mix(0.55, 1.0, smoothstep(uPatch.w + 0.2, uPatch.w + 1.4, vWPos.y));
  r5AO = rRA.y;
  diffuseColor.rgb = col * vColor.rgb * mix(1.0, r5AO, 0.4);
  r5N = rP;
  r5Rough = rRA.x;
}`;
const ROUGH = /* glsl */`#include <roughnessmap_fragment>
roughnessFactor = clamp(r5Rough, 0.05, 1.0);`;
const NORMAL = /* glsl */`#include <normal_fragment_begin>
normal = normalize(normal + (viewMatrix * vec4(r5N, 0.0)).xyz);`;
const AO = /* glsl */`#include <aomap_fragment>
reflectedLight.indirectDiffuse *= r5AO;
reflectedLight.indirectSpecular *= mix(1.0, r5AO, 0.6);`;

/* --------------------------------- boot ---------------------------------- */
export default async function bootBiomePoc() {
  const T = { start: performance.now() };
  document.getElementById('loading')?.remove();
  document.getElementById('title')?.classList.add('hidden');
  const engine = new Engine(document.getElementById('app'), { quality: 'high', dynamicResolution: false });
  const { scene, camera, renderer } = engine;
  const owned = { geo: [], mat: [], tex: [] };
  const own = (k, x) => { owned[k].push(x); return x; };
  const groups = {};
  const group = (name) => { const g = new THREE.Group(); g.name = name; scene.add(g); groups[name] = g; return g; };

  /* -------- light: sun through the KEPT cascades, hemi, sky IBL -------- */
  const sunDir = new THREE.Vector3(0.30, -0.44, 0.84).normalize();    // light travels north-north-east: a low south-south-west sun
  const csm = engine.enableCSM({ cascades: 3, maxFar: 220, mode: 'practical', shadowMapSize: 2048,
    lightMargin: 220, shadowBias: -0.00022, fade: true, lightDirection: sunDir, lightIntensity: 4.3 });
  for (const l of csm.lights) { l.color.set('#ffe6c8'); l.shadow.normalBias = 0.035; }
  scene.add(new THREE.HemisphereLight('#a8c4e0', '#4d463f', 0.42));
  scene.fog = new THREE.FogExp2('#bccbd6', 0.0026);
  const csmMat = (mat) => {
    const prev = mat.onBeforeCompile;
    engine.csmSetupMaterial(mat);
    const csmFn = mat.onBeforeCompile !== prev ? mat.onBeforeCompile : null;
    mat.onBeforeCompile = function (sh, r) { prev?.call(this, sh, r); csmFn?.call(this, sh, r); };
    mat.needsUpdate = true;
    return mat;
  };

  // sky dome (also the IBL source and the lagoon's reflection)
  const sunTo = sunDir.clone().negate();
  const skyMat = own('mat', new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunTo }, uZen: { value: new THREE.Color('#4f86c2') },
      uHor: { value: new THREE.Color('#d9e3ea') }, uGnd: { value: new THREE.Color('#9fa7ab') }, uSunC: { value: new THREE.Color('#fff1dc') } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun, uZen, uHor, uGnd, uSunC;
      void main(){ vec3 d = normalize(vD); float t = clamp(d.y, 0., 1.);
        vec3 c = mix(uHor, uZen, pow(t, 0.42));
        c = d.y < 0. ? mix(uHor, uGnd, clamp(-d.y * 5., 0., 1.)) : c;
        float s = max(dot(d, normalize(uSun)), 0.);
        c += uSunC * (pow(s, 1400.) * 40. + pow(s, 14.) * 0.22 + pow(s, 3.) * 0.08);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  const sky = new THREE.Mesh(own('geo', new THREE.SphereGeometry(1800, 32, 16)), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -1; sky.name = 'r5-sky';
  group('sky').add(sky);
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const s2 = new THREE.Scene(); s2.add(new THREE.Mesh(sky.geometry, skyMat));
    scene.environment = own('tex', pm.fromScene(s2, 0.02).texture);
    scene.environmentIntensity = 0.32;
    pm.dispose();
  }

  /* -------- textures (gen-ground.mjs) -------- */
  const T0 = performance.now();
  const tl = new THREE.TextureLoader();
  const load = (n, srgb) => tl.loadAsync(`/textures/r5-poc/${n}.webp`).then((t) => {
    t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
    return own('tex', t);
  });
  const ROCK = new URLSearchParams(location.search).get('rock') === 'proc' ? 'rockp' : 'rock';
  const [sandA, sandN, saltA, saltN, rockA, rockN] = await Promise.all([
    load('sand_a', true), load('sand_n', false), load('salt_a', true), load('salt_n', false),
    load(`${ROCK}_a`, true), load(`${ROCK}_n`, false)]);
  T.textures = performance.now() - T0;

  /* -------- terrain patch + skirt -------- */
  const T1 = performance.now();
  const mask = new Uint8Array(256 * 256 * 4);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const x = -HALF + ((i + 0.5) / 256) * PATCH, z = -HALF + ((j + 0.5) / 256) * PATCH;
    const o = (j * 256 + i) * 4;
    const pm = panMask(x, z), sh = shelfMask(x, z);
    const h = height(x, z);
    mask[o] = Math.round(ss(0.15, 0.6, pm) * 255);
    mask[o + 1] = Math.round(Math.max(sh * ss(0.45, 0.7, fbm(x * 0.06, z * 0.06, 3)), ss(0.55, 0.9, slopeAt(x, z))) * 255);
    mask[o + 2] = Math.round(Math.max(ss(0.95, 0.35, pm) * ss(0.05, 0.3, pm) * 0.8, ss(WATER_Y + 1.2, WATER_Y + 0.2, h)) * 255);
    mask[o + 3] = 255;
  }
  const maskTex = own('tex', new THREE.DataTexture(mask, 256, 256, THREE.RGBAFormat));
  maskTex.magFilter = THREE.LinearFilter; maskTex.minFilter = THREE.LinearFilter; maskTex.needsUpdate = true;
  T.mask = performance.now() - T1;

  const uniforms = {
    tSandA: { value: sandA }, tSandN: { value: sandN }, tSaltA: { value: saltA }, tSaltN: { value: saltN },
    tRockA: { value: rockA }, tRockN: { value: rockN }, tMask: { value: maskTex },
    uPatch: { value: new THREE.Vector4(-HALF, -HALF, PATCH, WATER_Y) },
    uScale: { value: new THREE.Vector3(1 / 2.4, 1 / 5.0, 1 / 6.0) },
    uRockTint: { value: new THREE.Color(ROCK === 'rock' ? 0.62 : 1.0, ROCK === 'rock' ? 0.6 : 1.0, ROCK === 'rock' ? 0.58 : 1.0) },
  };
  const patch = (mat, colorChunk) => {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', COMMON_V).replace('#include <worldpos_vertex>', WORLD_V);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', COMMON_F)
        .replace('#include <color_fragment>', colorChunk).replace('#include <roughnessmap_fragment>', ROUGH)
        .replace('#include <normal_fragment_begin>', NORMAL).replace('#include <aomap_fragment>', AO);
    };
    mat.customProgramCacheKey = () => `r5-${colorChunk === GROUND_COLOR ? 'ground' : 'rock'}`;
    return csmMat(own('mat', mat));
  };
  const groundMat = patch(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), GROUND_COLOR);

  const T2 = performance.now();
  const pg = own('geo', new THREE.PlaneGeometry(PATCH, PATCH, SEG, SEG));
  pg.rotateX(-Math.PI / 2);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setY(i, height(pp.getX(i), pp.getZ(i)));
  pg.computeVertexNormals();
  const terrain = new THREE.Mesh(pg, groundMat);
  terrain.receiveShadow = true; terrain.name = 'r5-terrain';
  group('terrain').add(terrain);
  // skirt: 1.8 km at 10 m, vertices aligned to the patch border, tucked under it
  const sg = own('geo', new THREE.PlaneGeometry(1800, 1800, 180, 180));
  sg.rotateX(-Math.PI / 2);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i);
    const inside = Math.abs(x) <= HALF + 0.01 && Math.abs(z) <= HALF + 0.01;
    sp.setY(i, height(x, z) - (inside ? (Math.abs(x) >= HALF - 0.01 || Math.abs(z) >= HALF - 0.01 ? 0.25 : 3.0) : 0));
  }
  sg.computeVertexNormals();
  const skirt = new THREE.Mesh(sg, groundMat);
  skirt.receiveShadow = true; skirt.name = 'r5-skirt';
  group('skirt').add(skirt);
  T.terrain = performance.now() - T2;

  // water: lagoon + open sea, mirror-ish under the sky IBL
  const water = new THREE.Mesh(own('geo', new THREE.PlaneGeometry(3600, 3600).rotateX(-Math.PI / 2)),
    csmMat(own('mat', new THREE.MeshStandardMaterial({ color: '#1f3d47', roughness: 0.07, metalness: 0.0, envMapIntensity: 2.2 }))));
  water.position.y = WATER_Y; water.receiveShadow = true; water.name = 'r5-water';
  group('water').add(water);

  /* -------- scatter: one InstancedMesh per kind -------- */
  const T3 = performance.now();
  let seed = 9;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const counts = {};
  function scatter(name, geo, mat, n, place, opts = {}) {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    let k = 0, tries = 0;
    while (k < n && tries < n * 40) {
      tries++;
      const x = -HALF + 2 + rnd() * (PATCH - 4), z = -HALF + 2 + rnd() * (PATCH - 4);
      const r = place(x, z);
      if (!r) continue;
      pos.set(x, height(x, z) + (r.dy ?? 0), z);
      e.set(r.rx ?? 0, rnd() * Math.PI * 2, r.rz ?? 0); q.setFromEuler(e);
      scl.set(r.sx, r.sy ?? r.sx, r.sz ?? r.sx);
      mesh.setMatrixAt(k++, m4.compose(pos, q, scl));
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = !!opts.cast; mesh.receiveShadow = true; mesh.name = `r5-${name}`;
    counts[name] = { instances: k, trisEach: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 };
    group(name).add(mesh);
    return mesh;
  }
  const rockMat = patch(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, vertexColors: true }), ROCK_COLOR);
  // basalt columns: bevelled hex prisms, organ-piped along the shelf edge
  const colGeo = own('geo', (() => {
    const g = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.52, 0), new THREE.Vector2(0.52, 0.985),
      new THREE.Vector2(0.47, 1.0), new THREE.Vector2(0, 1.0)], 6);
    g.computeVertexNormals();
    const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  })());
  /**
   * COLUMNAR BASALT is a packed hex lattice, not a scatter: cluster centres
   * along the shelf edge, a hex grid inside each, tops stepped to the shelf
   * surface (eroded lower toward the foot), plus fallen drums at the foot.
   */
  {
    const NX = 0.55, NZ = 0.83;                  // shelf normal (into the shelf)
    const shelfTop = (x, z) => height(x + NX * 9, z + NZ * 9);
    const mats = [];
    const centres = [];
    for (let t = 0; t < 4000 && centres.length < 26; t++) {
      const x = -HALF + 6 + rnd() * (PATCH - 12), z = -HALF + 6 + rnd() * (PATCH - 12);
      const sh = shelfMask(x, z);
      if (sh < 0.3 || sh > 0.7) continue;
      if (centres.some((c) => Math.hypot(c[0] - x, c[1] - z) < 8)) continue;
      centres.push([x, z, 3 + rnd() * 3.5, rnd() * Math.PI / 3]);
    }
    const R0 = 0.52, DX = R0 * 1.732 * 1.02, DZ = R0 * 1.5 * 1.02;
    for (const [cx, cz, cr, rot] of centres) {
      const ca = Math.cos(rot), sa = Math.sin(rot);
      const n = Math.ceil(cr / DZ) + 1;
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
        const lx = i * DX + (j & 1) * DX * 0.5, lz = j * DZ;
        if (Math.hypot(lx, lz) > cr * (0.75 + 0.5 * vnoise(lx * 0.4 + cx, lz * 0.4 + cz))) continue;
        const x = cx + lx * ca - lz * sa, z = cz + lx * sa + lz * ca;
        const sh = shelfMask(x, z), g = height(x, z);
        const top = Math.max(g + 0.4, g + (shelfTop(x, z) - g) * Math.pow(sh, 0.6)
          - Math.floor(vnoise(x * 0.35, z * 0.35) * 4) * 0.55 - rnd() * 0.25);
        const base = g - 1.6;
        if (top - base < 0.8) continue;
        pos.set(x, base, z); e.set(0, rot + Math.PI / 6, 0); q.setFromEuler(e);
        scl.set(1, top - base, 1);
        mats.push(m4.compose(pos, q, scl).clone());
      }
    }
    // fallen drums at the foot of the shelf
    for (let t = 0, k = 0; t < 3000 && k < 70; t++) {
      const x = -HALF + 4 + rnd() * (PATCH - 8), z = -HALF + 4 + rnd() * (PATCH - 8);
      const sh = shelfMask(x, z);
      if (sh < 0.02 || sh > 0.25) continue;
      pos.set(x, height(x, z) - 0.1, z); e.set(Math.PI / 2, rnd() * Math.PI * 2, 0, 'YXZ'); q.setFromEuler(e);
      scl.set(0.9 + rnd() * 0.3, 0.8 + rnd() * 2.2, 0.9 + rnd() * 0.3);
      mats.push(m4.compose(pos, q, scl).clone()); k++;
    }
    const cols = new THREE.InstancedMesh(colGeo, rockMat, mats.length);
    mats.forEach((mm, i) => cols.setMatrixAt(i, mm));
    cols.instanceMatrix.needsUpdate = true; cols.computeBoundingSphere();
    cols.castShadow = true; cols.receiveShadow = true; cols.name = 'r5-columns';
    counts.columns = { instances: mats.length, clusters: centres.length, trisEach: colGeo.index ? colGeo.index.count / 3 : colGeo.attributes.position.count / 3 };
    group('columns').add(cols);
  }
  // boulders: one noise-displaced icosphere, instanced at every size
  const bGeo = own('geo', (() => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.78 + 0.42 * fbm(x * 1.7 + 3, z * 1.7 + y * 1.3, 3);
      p.setXYZ(i, x * k, y * k * 0.72, z * k);
    }
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3).fill(1), 3));
    return g;
  })());
  scatter('boulders', bGeo, rockMat, 160, (x, z) => {
    const pm = panMask(x, z), sh = shelfMask(x, z);
    if (pm > 0.2 || rnd() > 0.35 + sh * 0.6) return null;
    const s = 0.25 + Math.pow(rnd(), 3) * 2.2;
    return { sx: s, dy: -s * 0.25 };
  }, { cast: true });
  // vegetation: vertex-coloured solid geometry (no alpha cards, no overdraw)
  const vegMat = csmMat(own('mat', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide })));
  const tuft = (blades, hMin, hMax, w, bend, cBase, cTip, segs = 3) => {
    const P = [], C = [], cb = new THREE.Color(cBase), ct = new THREE.Color(cTip), c = new THREE.Color();
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + rnd() * 0.8, hgt = hMin + rnd() * (hMax - hMin);
      const lean = bend * (0.4 + rnd() * 0.6), dx = Math.cos(a), dz = Math.sin(a), r0 = 0.03 + rnd() * 0.05;
      let px = dx * r0, pz = dz * r0, py = 0, wid = w;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        const nx = dx * (r0 + lean * t1 * t1 * hgt), nz = dz * (r0 + lean * t1 * t1 * hgt), ny = hgt * t1;
        const w0 = wid * (1 - t0 * 0.85), w1 = wid * (1 - t1 * 0.85);
        const ox = -dz, oz = dx;
        const v = [[px - ox * w0, py, pz - oz * w0], [px + ox * w0, py, pz + oz * w0], [nx + ox * w1, ny, nz + oz * w1], [nx - ox * w1, ny, nz - oz * w1]];
        for (const idx of [0, 1, 2, 0, 2, 3]) {
          P.push(...v[idx]);
          c.copy(cb).lerp(ct, idx < 2 ? t0 : t1);
          C.push(c.r, c.g, c.b);
        }
        px = nx; pz = nz; py = ny;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    return own('geo', g);
  };
  scatter('marram', tuft(16, 0.45, 0.9, 0.012, 0.35, '#5f6b3c', '#c9be8a'), vegMat, 5200, (x, z) => {
    const pm = panMask(x, z), sh = shelfMask(x, z), h = height(x, z);
    if (pm > 0.05 || sh > 0.3 || h < WATER_Y + 0.8 || slopeAt(x, z) > 0.45) return null;
    if (fbm(x * 0.07, z * 0.07, 3) < 0.5 + rnd() * 0.08) return null;   // colonies, dense in the middle
    return { sx: 0.8 + rnd() * 0.7, dy: -0.03 };
  });
  scatter('glasswort', tuft(9, 0.08, 0.2, 0.014, 0.25, '#5a7a33', '#a8352c', 2), vegMat, 2600, (x, z) => {
    const pm = panMask(x, z), h = height(x, z);
    const margin = pm > 0.02 && pm < 0.55;
    const shore = h > WATER_Y + 0.05 && h < WATER_Y + 0.9;
    if (!(margin || shore) || rnd() > 0.85) return null;
    return { sx: 0.9 + rnd() * 1.2, sy: 0.8 + rnd() * 0.8, dy: -0.01 };
  });
  const shardMat = csmMat(own('mat', new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 0.55, metalness: 0 })));
  scatter('saltshards', own('geo', new THREE.BoxGeometry(0.5, 0.025, 0.3)), shardMat, 700, (x, z) => {
    const pm = panMask(x, z);
    if (pm < 0.6 || pm > 0.97 || rnd() > 0.6) return null;
    return { sx: 0.6 + rnd() * 1.2, sy: 1, sz: 0.6 + rnd(), rx: (rnd() - 0.5) * 0.9, rz: (rnd() - 0.5) * 0.9, dy: 0.02 };
  });
  T.scatter = performance.now() - T3;

  /* -------- landmark + scale creatures (generated GLBs) -------- */
  const T4 = performance.now();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [ringG, tillerG] = await Promise.all([loader.loadAsync('/models/r5-poc/sounding-ring.glb'), loader.loadAsync('/models/r5-poc/tiller.glb')]);
  const prep = (root) => root.traverse((o) => {
    if (!o.isMesh) return;
    own('geo', o.geometry);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      own('mat', m); csmMat(m);
      for (const k of ['map', 'metalnessMap', 'roughnessMap']) if (m[k]) own('tex', m[k]);
    }
    const lampMesh = /lamp|sensor/.test(o.material.name);
    if (lampMesh) o.material.emissiveIntensity = 2.0;
    o.castShadow = !lampMesh; o.receiveShadow = true;
  });
  prep(ringG.scene);
  ringG.scene.position.set(RING.x, PAN_Y - 0.6, RING.z);
  ringG.scene.rotation.y = 0.35;
  group('landmark').add(ringG.scene);
  prep(tillerG.scene);
  const tillers = group('tillers');
  for (const [x, z, yaw] of [[16, -14, -2.2], [23, -7, -2.5]]) {
    const t = tillerG.scene.clone();
    t.position.set(x, height(x, z), z); t.rotation.y = yaw;
    tillers.add(t);
  }
  T.glb = performance.now() - T4;

  /* -------- route (b) for comparison: a CC0 kit model, palette-restyled --------
   * Quaternius "Animated Mech" (CC0 1.0, models-staging/quaternius-animatedmech,
   * dev-served). Restyle = remap its flat-colour atlas onto the r5 palette in a
   * canvas; geometry and silhouette are the kit's. Hidden except in the
   * `kitbash` view, so it never enters the vista ledger. */
  let kitMixer = null;
  try {
    const T5 = performance.now();
    const kit = await loader.loadAsync('/models-staging/quaternius-animatedmech/Mike.gltf');
    kit.scene.traverse((o) => {
      if (!o.isMesh) return;
      own('geo', o.geometry);
      const m = o.material;
      if (m.map?.image) {
        const img = m.map.image, cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0);
        const d = c2.getImageData(0, 0, cv.width, cv.height), px = d.data;
        const pal = { bone: [231, 220, 203], ox: [122, 42, 32], ver: [77, 139, 120], bro: [177, 138, 82], gra: [42, 45, 50] };
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, sat = mx - mn;
          let c = pal.gra;
          if (l > 0.62 && sat < 0.25) c = pal.bone;
          else if (sat >= 0.25 && r >= g && r >= b) c = l > 0.5 ? pal.bro : pal.ox;
          else if (sat >= 0.25) c = pal.ver;
          else if (l > 0.35) c = pal.bro;
          px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
        }
        c2.putImageData(d, 0, 0);
        const t = own('tex', new THREE.CanvasTexture(cv));
        t.flipY = m.map.flipY; t.colorSpace = THREE.SRGBColorSpace;
        own('tex', m.map); m.map = t;
      }
      m.roughness = 0.45; m.metalness = 0.25;
      own('mat', m); csmMat(m);
      o.castShadow = true; o.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(kit.scene);
    const k = 2.7 / Math.max(0.01, box.max.y - box.min.y);       // the Tiller's height
    kit.scene.scale.setScalar(k);
    kit.scene.position.set(9.5, height(9.5, -17) - box.min.y * k, -17);
    kit.scene.rotation.y = -2.0;
    const g = group('kitbash'); g.add(kit.scene); g.visible = false;
    const idle = kit.animations.find((a) => /idle/i.test(a.name));
    if (idle) { kitMixer = new THREE.AnimationMixer(kit.scene); kitMixer.clipAction(idle).play(); }
    let tris = 0; kit.scene.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    counts.kitbash = { source: 'Quaternius Animated Mech "Mike" (CC0 1.0)', tris, ms: Math.round(performance.now() - T5) };
  } catch (err) { console.warn('[r5-biome] kit model unavailable:', err.message); }

  /* -------- loop -------- */
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const frameMs = Math.min(500, now - last); last = now;
    const js0 = performance.now();
    let renderMs = 0;
    kitMixer?.update(Math.min(0.05, frameMs / 1000));
    try { renderMs = engine.render(Math.min(0.05, frameMs / 1000)); } catch (err) { console.error('[r5-biome] render', err); }
    engine._recordFrame(frameMs, performance.now() - js0, 0, renderMs, 0);
    engine.frames++;
  });

  /* -------- views -------- */
  const look = (px, pz, ph, tx, ty, tz, fov = 50, fog = 0.0026) => ({ px, pz, ph, tx, ty, tz, fov, fog });
  const views = {
    vista: look(-82, 0, 2.6, -6, 6.0, 10, 46),
    landmark: look(26, -32, 1.9, 0, 7.0, 6, 46),
    ground: look(-56, -1, 1.25, -47, PAN_Y - 0.4, 6, 50),
    cliff: look(16, 22, 2.2, 40, 6.5, 40, 52),
    overview: look(-150, -150, 105, 5, 0, 10, 42, 0.0007),
    kitbash: look(4, -27, 1.5, 13.5, 1.5, -15, 40),
  };
  const view = (name) => {
    const v = views[name];
    const gy = height(v.px, v.pz);
    camera.position.set(v.px, Math.max(gy, WATER_Y) + v.ph, v.pz);
    camera.fov = v.fov; camera.updateProjectionMatrix();
    scene.fog.density = v.fog;
    if (groups.kitbash) groups.kitbash.visible = name === 'kitbash';
    camera.lookAt(v.tx, v.ty, v.tz);
    csm.updateFrustums?.();
    return { camera: camera.position.toArray().map((n) => +n.toFixed(1)) };
  };
  view('vista');
  const warm = await engine.warmUp(scene, camera);
  T.warmUp = warm.ms;
  T.total = performance.now() - T.start;

  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function medianCalls(n = 16) {
    const calls = [], tris = [];
    for (let i = 0; i < n; i++) { await frame(); calls.push(renderer.info.render.calls); tris.push(renderer.info.render.triangles); }
    calls.sort((a, b) => a - b); tris.sort((a, b) => a - b);
    return { calls: calls[n >> 1], tris: tris[n >> 1] };
  }
  window.__R5BIOME__ = {
    engine, scene, views, view, groups,
    stats() {
      const tri = (g) => { let t = 0; g.traverse((o) => { if (o.isMesh) { const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; t += o.isInstancedMesh ? n * o.count : n; } }); return t; };
      const bytes = {};
      for (const e of performance.getEntriesByType('resource')) {
        if (/r5-poc\//.test(e.name)) bytes[e.name.split('/').pop()] = e.encodedBodySize || e.transferSize || 0;
      }
      return {
        buildMs: Object.fromEntries(Object.entries(T).filter(([k]) => k !== 'start').map(([k, v]) => [k, Math.round(v)])),
        patch: { size: PATCH, seg: SEG, terrainTris: tri(groups.terrain), skirtTris: tri(groups.skirt) },
        scatter: counts, landmarkTris: tri(groups.landmark), tillerTris: tri(groups.tillers),
        bytes, totalKB: +(Object.values(bytes).reduce((a, b) => a + b, 0) / 1024).toFixed(1),
        memory: { ...renderer.info.memory, programs: renderer.info.programs?.length },
        rock: ROCK,
      };
    },
    async measure(ms = 3000) {
      engine.enableGpuTimer(true);
      await frame();
      engine.perfReset();
      const t0 = performance.now(); let n = 0;
      while (performance.now() - t0 < ms) { await frame(); n++; }
      const snap = engine.perfSnapshot(n);
      const all = await medianCalls();
      const ledger = {};
      for (const [name, g] of Object.entries(groups)) {
        if (!g.visible) continue;
        g.visible = false;
        const off = await medianCalls(10);
        g.visible = true;
        ledger[name] = { draws: all.calls - off.calls, tris: all.tris - off.tris };
      }
      return { view: 'vista', viewport: [innerWidth, innerHeight], dpr: renderer.getPixelRatio(), snap, total: all, ledger };
    },
    /** GPU ms each owner costs at this view: median GPU time with it hidden vs shown (noisy on a shared box). */
    async gpuLedger(ms = 1500) {
      engine.enableGpuTimer(true);
      const med = async () => {
        await frame(); await frame(); engine.perfReset();
        const t0 = performance.now(); let n = 0;
        while (performance.now() - t0 < ms) { await frame(); n++; }
        return engine.perfSnapshot(n)?.medianGpuMs ?? null;
      };
      const all = await med();
      const out = { all };
      for (const [name, g] of Object.entries(groups)) {
        g.visible = false;
        const off = await med();
        g.visible = true;
        out[name] = off === null || all === null ? null : +(all - off).toFixed(2);
      }
      return out;
    },
    /** Coarse GPU ledger: median GPU ms with whole owner SETS hidden (3 s each). */
    async gpuStates(ms = 3000) {
      engine.enableGpuTimer(true);
      const sets = {
        all: [], noGround: ['terrain', 'skirt'], noVegetation: ['marram', 'glasswort'],
        noRocks: ['columns', 'boulders'], noProps: ['landmark', 'tillers'], noWater: ['water'],
        emptyFrame: Object.keys(groups).filter((k) => k !== 'sky' && k !== 'kitbash'),
      };
      const out = {};
      for (const [name, hide] of Object.entries(sets)) {
        for (const h of hide) groups[h].visible = false;
        await frame(); await frame(); engine.perfReset();
        const t0 = performance.now(); let n = 0;
        while (performance.now() - t0 < ms) { await frame(); n++; }
        const sn = engine.perfSnapshot(n);
        out[name] = { gpu: sn?.medianGpuMs ?? null, calls: sn?.medianDrawCalls ?? null };
        for (const h of hide) groups[h].visible = true;
      }
      return out;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      kitMixer?.stopAllAction(); kitMixer = null;
      for (const g of owned.geo) g.dispose?.();
      for (const m of owned.mat) m.dispose?.();
      for (const t of owned.tex) t.dispose?.();
      for (const g of Object.values(groups)) scene.remove(g);
      engine.disableCSM();
      return { ...renderer.info.memory };
    },
  };
  window.__R5BIOME_READY__ = true;
  console.log('[r5-biome] ready', T);
}
