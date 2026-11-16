import * as THREE from 'three';
import { WORLD_SIZE } from './extent.js';

/**
 * THE GOLDEN MEADOW, TO THE WRITTEN BLADE BUDGET (M1.1b, TECH §5 and §3).
 *
 * Three rings around the camera, each one InstancedMesh whose instances are CHUNKS (a square patch of the ring's
 * geometry) and whose vertices place themselves: the chunk's origin is the instance's translation, the patch is
 * turned by a quarter turn per chunk (hash), every blade reads the island's height grid (R32F, bilinear by hand:
 * terrain.getHeight's own read) and the meadow's density (R8, from bake maskB.a, minus marram cover and the props'
 * keepouts) in the vertex shader, and a blade whose hash is over its density, or outside its ring, is clipped away
 * whole. No CPU records, no allocation per frame: the CPU only picks which chunks of each ring stand in the frustum.
 *
 *   ring   what                                   density    geometry           chunk
 *   0      single blades, 0-10 m                  150 / m²   7 verts, 5 tris    2 m
 *   1      clumps (three blades fused, 3x wide)   40 / m²    8 verts, 6 tris    4 m
 *   2      alpha-to-coverage cards, 30-80 m       4 / m²     4 verts, 2 tris    8 m
 *   past 80 m the ground shader carries the meadow's colour (groundShader.js, the golden meadow term)
 *
 * The rings hand over in 2 m / 4 m bands by a stochastic cross-fade (a blade's hash against complementary ramps), so
 * the density is continuous and nothing pops on a line. Opaque blades everywhere but the cards (Apple's hidden
 * surface removal stays on for them). The blade-width floor (TECH §3.2): a blade thinner than one device pixel is
 * widened to one pixel and, when the main target is multisampled, faded through coverage (alpha-to-coverage) in
 * proportion, so it never flickers between zero and one pixel. Blades seen edge-on are turned part-way to the
 * camera for the same reason. Backlit tips: the sun through the upper blade when the lens looks toward it. Wind
 * from 045: everything leans and sways to the south-west (bible §2.3), with the flora's gust wave. Brea and the
 * three nearest Instruments part it (the flora's displacer slots). Violet viborina stands in 3-9 m clumps.
 *
 *   meadow.update(camera)       pick chunks (call once per rendered frame, after the camera moved)
 *   meadow.stats()              chunks and triangles submitted per ring, and the CPU mirror of the keep rule
 *   meadow.perfSwitches()       A/B switches: 'meadow' (all rings), 'meadow-a2c' (coverage fade on the blades)
 *   meadow.setIdPass(on)        measurement: blades drawn flat (G 1 for rings 0-1, 0.5 for the cards; B distance / 100 m)
 */

const HALF = WORLD_SIZE / 2;
export const MEADOW_RINGS = Object.freeze([
  Object.freeze({ id: 0, name: 'meadow-blades', kind: 'blade', rIn: 0, rOut: 10, bandIn: 0, bandOut: 2, density: 150, chunk: 2 }),
  Object.freeze({ id: 1, name: 'meadow-clumps', kind: 'clump', rIn: 10, rOut: 30, bandIn: 2, bandOut: 4, density: 40, chunk: 4 }),
  Object.freeze({ id: 2, name: 'meadow-cards', kind: 'card', rIn: 30, rOut: 80, bandIn: 4, bandOut: 10, density: 4, chunk: 8 }),
]);
/**
 * M1.6m round 2 (engine lane, the smallest change): the tier's meadow (engine LOOK_ROWS.<tier>.meadow: r0 the blades'
 * outer radius, r1 the clumps'). `high` and `ultra` keep MEADOW_RINGS exactly (the shipped look). `medium` and `low`
 * hand the clumps (6 tris a blade, 40 / m2: most of the meadow's vertices) over to the cards sooner, which is the
 * geometry cut the tier's frame needs (the frame is vertex-bound, docs/STATE.md M0.8); the cards still run to 80 m,
 * where the ground shader carries the meadow's colour, so nothing opens a gap. Read once, at build.
 */
export function meadowRingsFor(quality, row) {
  if (!row || quality === 'high' || quality === 'ultra' || quality == null) return MEADOW_RINGS;
  const [b, c, k] = MEADOW_RINGS;
  const r0 = Math.min(b.rOut, Math.max(4, Number(row.r0) || b.rOut));
  const r1 = Math.min(c.rOut, Math.max(r0 + 6, Number(row.r1) || c.rOut));
  return Object.freeze([
    Object.freeze({ ...b, rOut: r0 }),
    Object.freeze({ ...c, rIn: r0, rOut: r1 }),
    Object.freeze({ ...k, rIn: r1 }),
  ]);
}
const VERTS = { blade: 7, clump: 8, card: 4 };
const TRIS = { blade: 5, clump: 6, card: 2 };

/* --------------------------------------------------------------- the hash, mirrored exactly in GLSL ---- */
export function pcg(v) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
const chunkKey = (cx, cz) => (Math.imul(cx >>> 0, 73856093) ^ Math.imul(cz >>> 0, 19349663)) >>> 0;
const bladeKey = (ck, i) => (ck ^ Math.imul(i >>> 0, 83492791)) >>> 0;

/* --------------------------------------------------------------- patch geometry ---- */
/** One chunk's patch: roots on a jittered grid (even cover, no clumping of roots), per-vertex (side, t), per-blade index. */
function patchGeometry(ring) {
  const C = ring.chunk, n = Math.round(ring.density * C * C), kind = ring.kind;
  const cols = Math.round(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const vpb = VERTS[kind], P = new Float32Array(n * vpb * 3), B = new Float32Array(n * vpb * 2), idx = [];
  let sd = 0x9e3779b9 ^ (ring.id * 7919);
  const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  // per kind: [side, t] per vertex and the triangles
  const lay = kind === 'blade'
    ? { v: [[-1, 0], [1, 0], [-1, 1 / 3], [1, 1 / 3], [-1, 2 / 3], [1, 2 / 3], [0, 1]], t: [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6] }
    : kind === 'clump'
      ? { v: [[-1, 0], [1, 0], [-1, 0.4], [1, 0.4], [-1, 0.75], [1, 0.75], [-1, 1], [1, 1]], t: [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6, 5, 7, 6] }
      : { v: [[-1, 0], [1, 0], [-1, 1], [1, 1]], t: [0, 1, 2, 1, 3, 2] };
  for (let b = 0; b < n; b++) {
    const gx = b % cols, gz = (b / cols) | 0;
    const x = ((gx + 0.12 + rnd() * 0.76) / cols) * C, z = ((gz + 0.12 + rnd() * 0.76) / rows) * C;
    for (let k = 0; k < vpb; k++) {
      const o = (b * vpb + k);
      P[o * 3] = x; P[o * 3 + 1] = lay.v[k][1]; P[o * 3 + 2] = z;
      B[o * 2] = lay.v[k][0]; B[o * 2 + 1] = b;
    }
    for (const t of lay.t) idx.push(b * vpb + t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aBlade', new THREE.BufferAttribute(B, 2));
  // never read (the vertex shader builds the normal), but without one three compiles the material flat-shaded
  g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(n * vpb * 3), 3, true));
  g.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  // the chunk's vertices land anywhere inside the ring: three's own culling is off (frustumCulled = false)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WORLD_SIZE);
  g.userData.blades = n;
  return g;
}

/* --------------------------------------------------------------- shaders ---- */
const MEADOW_VERT_PARS = /* glsl */ `
#include <common>
attribute vec2 aBlade;            // side (-1, 0, 1), blade index in the patch
uniform highp sampler2D tMeadowH; // the island's height grid, R32F
uniform sampler2D tMeadowD;       // density 0..1 (R), 2 m a texel
uniform vec4 uHGrid;              // side, 1 / step, half, -
uniform float uWorldInv;
uniform vec4 uRing;               // rIn, rOut, bandIn, bandOut
uniform vec4 uRing2;              // chunk size, kind (0 blade, 1 clump, 2 card), chunk-index offset, -
uniform vec4 uPx;                 // device px a metre at depth 1, width floor on, -, -
uniform float uTime;
uniform vec2 uWind;
uniform vec4 uActors[4];
varying vec3 vMColor;
varying float vMT;
varying float vMCov;
varying vec2 vMUv;
varying float vMSeed;
varying vec2 vFloraXZ;
uniform vec4 uDebug;              // x: flat colour (no lighting), y: every blade clipped (vertex work only)
uniform vec4 uStab;               // M1a round 2, the crawl at 12-30 m: x tip light faded, y foot-tip ramp flattened, z clumps wider, w sub-pixel blades to their mean
uniform vec4 uStab2;              // M1a round 3, the same band: x normals up, y blades square to the lens, z sway damped, w one stand tone
uniform vec4 uStand;              // M1a round 3 fix: the stand tone (rgb) and its weight (w)
varying float vMTr;
uint mPcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float mU(uint v) { return float(mPcg(v)) * (1.0 / 4294967296.0); }
float mHeight(vec2 xz) {
  vec2 f = (xz + uHGrid.z) * uHGrid.y;
  vec2 i0 = clamp(floor(f), vec2(0.0), vec2(uHGrid.x - 2.0));
  vec2 t = clamp(f - i0, 0.0, 1.0);
  ivec2 i = ivec2(i0);
  float a = texelFetch(tMeadowH, i, 0).r, b = texelFetch(tMeadowH, i + ivec2(1, 0), 0).r;
  float c = texelFetch(tMeadowH, i + ivec2(0, 1), 0).r, d = texelFetch(tMeadowH, i + ivec2(1, 1), 0).r;
  float ab = a + (b - a) * t.x;
  return ab + (c + (d - c) * t.x - ab) * t.y;
}
`;

/** The whole blade, built in beginnormal (normals come first in three's vertex chunk order). */
const MEADOW_BUILD = /* glsl */ `
vec3 mP = vec3(0.0); vec3 objectNormal = vec3(0.0, 1.0, 0.0); bool mKeep = false;
{
  float C = uRing2.x;
  vec2 origin = instanceMatrix[3].xz;
  uint cx = uint(int(floor(origin.x / C + 0.5)) + int(uRing2.z)), cz = uint(int(floor(origin.y / C + 0.5)) + int(uRing2.z));
  uint ck = (cx * 73856093u) ^ (cz * 19349663u);
  uint bk = ck ^ (uint(aBlade.y) * 83492791u);
  // the patch turned a quarter turn per chunk: the same roots never line up chunk to chunk
  uint rot = mPcg(ck ^ 0x5bd1e995u) & 3u;
  vec2 l = position.xz - 0.5 * C;
  l = rot == 0u ? l : rot == 1u ? vec2(-l.y, l.x) : rot == 2u ? -l : vec2(l.y, -l.x);
  vec2 root = origin + l + 0.5 * C;
  float u1 = mU(bk), u2 = mU(bk ^ 0x68e31da4u), u3 = mU(bk ^ 0xb5297a4du), u4 = mU(bk ^ 0x1b56c4e9u);
  float dCam = distance(root, cameraPosition.xz);
  float kIn = uRing.x > 0.0 ? smoothstep(uRing.x - uRing.z, uRing.x, dCam) : 1.0;
  float kOut = 1.0 - smoothstep(uRing.y - uRing.w, uRing.y, dCam);
  float dens = texture2D(tMeadowD, root * uWorldInv + 0.5).r;
  float keepP = dens * kIn * kOut;
  mKeep = u1 < keepP && uDebug.y < 0.5;
  #ifdef CAL_M_EARLY
  if (mKeep) {
  #endif
  // a blade near its threshold is short: blades grow in and out of a ring's band instead of popping
  float grow = smoothstep(0.0, 0.12, keepP - u1);
  float kind = uRing2.y;
  float side = aBlade.x, t = position.y;
  float y0 = mHeight(root) - 0.02;
  // viborina: violet spikes in 3-9 m clumps, 8-25 % of the meadow (W-06)
  vec2 cc = floor(root / 6.5 + vec2(0.37, 0.71) * floor(root.yx / 23.0));
  float clump = fract(sin(dot(cc, vec2(12.9898, 78.233))) * 43758.5453);
  bool vib = clump > 0.8 && u4 > (kind > 0.5 ? 0.8 : 0.86);
  // shape: height, half-width at the foot, facing, lean down-wind
  float hgt = (kind > 1.5 ? mix(0.42, 0.72, u2) : mix(0.36, 0.82, u2 * u2)) * (0.72 + 0.4 * dens) * grow;
  if (vib) hgt *= 1.12;
  // widths: TECH §5's lever when the counts do not close the ground ("blade width and clump width, not count")
  float w0 = kind > 1.5 ? mix(0.26, 0.4, u3) : kind > 0.5 ? mix(0.02, 0.032, u3) : mix(0.008, 0.013, u3);
  /* M1.1b fix round 1: the clumps crawled at 12-30 m (133 events per mille walking, 342 sprinting): their tips
   * went sub-pixel. They broaden with distance (about two device px at the foot at 30 m) and taper less */
  float midK = kind > 0.5 && kind < 1.5 ? smoothstep(10.0, 30.0, dCam) : 0.0;
  w0 *= 1.0 + (0.6 + 0.9 * uStab.z) * midK;
  /* M1a round 3 (M1.1b: the walk's 12-30 m band at 1.41 x the 4x MSAA reference): from 6-14 m on, blades and clumps
   * (not cards) take the stabiliser's second set. stK is that band's weight (6-14 m: full across the measured band) */
  #ifdef CAL_M_NOSTAB2
  float stK = 0.0;                // the A/B: the round-3 set compiled out
  #else
  float stK = kind < 1.5 ? smoothstep(6.0, 14.0, dCam) : 0.0;
  #endif
  float yaw = u3 * 6.2831853 + u4 * 1.7;
  vec2 face = vec2(cos(yaw), sin(yaw));
  vec2 rightW = vec2(-face.y, face.x);
  vec2 toCam = cameraPosition.xz - root;
  float tcl = max(length(toCam), 1e-3);
  vec2 camR = vec2(toCam.y, -toCam.x) / tcl;
  if (kind > 1.5) rightW = camR;                       // the cards face the lens
  else {
    // edge-on to the lens, a blade turns part-way toward it (it never thins to nothing)
    float edge = 1.0 - abs(dot(rightW, camR));
    rightW = normalize(rightW + camR * sign(dot(rightW, camR) + 1e-4) * 0.75 * edge);
    // (round 3, y) square to the lens with distance: a blade's projected width no longer swings as the lens walks past it
    rightW = normalize(mix(rightW, camR * sign(dot(rightW, camR) + 1e-4), uStab2.y * stK));
  }
  // the tip's width: blades taper to a point, clumps and cards stay broad
  float taper = kind > 1.5 ? 1.0 : kind > 0.5 ? (1.0 - 0.7 * (1.0 - (0.45 + 0.4 * uStab.z) * midK) * t) : (1.0 - 0.86 * t);
  if (vib) taper = max(taper, 0.55);
  float hw = w0 * taper;
  // wind from 045: a lean to the SW, a sway and a gust wave that run with it (the flora's terms)
  vec2 rnd2 = vec2(cos(u4 * 6.2831853), sin(u4 * 6.2831853));
  vec2 leanDir = normalize(uWind * 0.8 + rnd2 * 0.45);
  float lean = 0.12 + 0.3 * u2;
  float ph = dot(root, uWind) * 0.09 - uTime * 1.5 + root.x * 0.21;
  float gust = 0.55 + 0.45 * sin(dot(root, uWind) * 0.021 - uTime * 0.46);
  float sway = (sin(ph) * 0.05 + sin(ph * 2.3 + root.y) * 0.02 * (1.0 - uStab2.z * stK)) * (0.4 + gust) * 1.6 * (1.0 - 0.6 * uStab2.z * stK);
  vec2 bend = leanDir * lean + uWind * (sway + 0.04 * gust);
  // she parts it as she walks
  vec2 push = vec2(0.0); float press = 0.0;
  for (int a = 0; a < 4; a++) {
    vec2 dv = root - uActors[a].xy;
    float dl = length(dv) + 1e-3;
    float pu = (1.0 - smoothstep(0.0, uActors[a].z, dl)) * uActors[a].w;
    push += (dv / dl) * pu * 0.9; press += pu * 0.45;
  }
  bend += push;
  float t2 = t * t;
  vec3 spine = vec3(root.x, y0, root.y) + vec3(bend.x * hgt * t2, hgt * t * (1.0 - 0.18 * dot(bend, bend) - press * 0.5), bend.y * hgt * t2);
  // the one-pixel floor: the blade's width in device px at its depth
  vec4 mvS = modelViewMatrix * vec4(spine, 1.0);
  float pxPerM = uPx.x / max(-mvS.z, 0.05);
  float wPx = 2.0 * hw * pxPerM;
  float wPxB = 2.0 * w0 * pxPerM;
  float cov = 1.0;
  if (uPx.y > 0.5 && kind < 1.5 && side != 0.0 && wPx < 1.0) { cov = max(wPx, 0.0); hw = 0.5 / pxPerM; }
  mP = spine + vec3(rightW.x, 0.0, rightW.y) * hw * side;
  // shading normal: mostly up (a lit tuft, not a lit card), toward the blade's face and its bend
  vec2 fn = kind > 1.5 ? toCam / tcl : face * sign(dot(face, toCam) + 1e-4);
  objectNormal = normalize(vec3(fn.x * 0.32 + bend.x * 0.4 * t, 0.9, fn.y * 0.32 + bend.y * 0.4 * t));
  // (round 3, x) the face's sign flips as the lens walks round a blade: with distance the normal goes up, one tone
  objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), uStab2.x * stK));
  // colour: dark straw at the foot to pale gold at the tip, tone per blade; violet viborina
  vec3 base = vec3(0.17, 0.112, 0.02) * (0.75 + 0.45 * u3);     // = the ground's meadow litter (groundShader.js)
  vec3 tip = mix(vec3(0.694, 0.431, 0.117), vec3(0.578, 0.352, 0.074), u4) * (0.78 + 0.4 * u2);
  // and the clumps' foot-to-tip ramp flattens with distance, as the ground under them does (less to crawl)
  base = mix(base, tip * 0.6, 0.5 * midK);
  tip = mix(tip, vec3(0.62, 0.5, 0.26), 0.25 * step(0.86, u3));          // a few pale, bleached heads
  float ramp = kind > 1.5 ? 0.55 + 0.45 * t : pow(t, 0.8);
  vMColor = mix(base, tip, ramp);
  if (kind < 1.5) {
    vec3 mMean = mix(base, tip, 0.55);
    vMColor = mix(vMColor, mMean, uStab.y * 0.7 * smoothstep(8.0, 28.0, dCam));
    vMColor = mix(vMColor, mMean * 0.92, uStab.w * (1.0 - clamp(wPxB - 1.0, 0.0, 1.0)) * (1.0 - uPx.z));
    /* (round 3, w) a moving edge between two blades of different tone is what the walk's flicker counts: over the band
     * every blade goes toward one stand tone, the meadow's own mean (no per-blade random) */
    /* (round 3 fix: past about 15 m F02's meadow read as a pale washed-out strip, Lab 56.7 13.8 22.4 against the near
     * meadow's 45.1 22.4 37.4: the stand tone was the blades' own mean, but the near meadow's mean on screen holds its dark
     * feet and the gaps between blades, and the up-turned normals take the whole violet sky fill). The tone is that
     * on-screen mean: 0.6 of the old luminance, richer in chroma (uStand, so a probe can try others); it also narrows the
     * step from a blade to the ground between, which is what the walk's crawl counts */
    vMColor = mix(vMColor, uStand.rgb, uStab2.w * stK * uStand.w);
  }
  vMTr = 1.0 - uStab.x * smoothstep(8.0, 24.0, dCam);
  // a viborina spike is a straw stem with violet florets on its upper half
  if (vib) vMColor = mix(vMColor, mix(vec3(0.13, 0.05, 0.2), vec3(0.2, 0.1, 0.32), u2), smoothstep(0.55, 0.7, t));
  vMT = t;
  vMCov = cov;
  vMUv = vec2(side * 0.5 + 0.5, t);
  if (kind > 1.5 && u2 > 0.5) vMUv.x = 1.0 - vMUv.x;
  vMSeed = u3;
  vFloraXZ = root;
  #ifdef CAL_M_EARLY
  }
  #endif
}
`;
const MEADOW_BEGIN = /* glsl */ `vec3 transformed = mP;`;
const MEADOW_PROJECT = /* glsl */ `
vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
gl_Position = mKeep ? projectionMatrix * mvPosition : vec4(2.0, 2.0, 2.0, 1.0);
`;
const MEADOW_WORLD = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
#endif
`;

const MEADOW_FRAG_PARS = /* glsl */ `
#include <common>
varying vec3 vMColor;
varying float vMT;
varying float vMCov;
varying vec2 vMUv;
varying float vMSeed;
varying vec2 vFloraXZ;
uniform vec4 uDebug;
varying float vMTr;
uniform float uKind;
uniform float uIdPass;
uniform vec4 uStand;
uniform vec4 uSoft;
uniform float uTransl;
uniform highp sampler2DArray tField;
uniform vec4 uHzW0;
uniform vec4 uHzW1;
uniform float uSunTan;
uniform float uHzWorldInv;
uniform float uHzK;
float mHzV = 1.0;
`;
const MEADOW_COLOR = /* glsl */ `
#include <color_fragment>
if (uDebug.x > 0.5) { gl_FragColor = vec4(vMColor, 1.0); return; }
diffuseColor.rgb *= vMColor;
if (uKind > 1.5) {
  /* the card's tuft, drawn here rather than sampled: 8 tapered blades across the card, each its own height and
   * lean, the edge antialiased on its own screen derivative (the coverage A2C turns into samples) */
  float bx = vMUv.x * 8.0 + 0.9 * vMUv.y * vMUv.y;
  float bi = floor(bx);
  float hb = fract(sin(bi * 91.7 + vMSeed * 17.0) * 43758.5453);
  float top = 0.55 + 0.45 * hb;
  float wdt = 0.36 * (1.0 - vMUv.y / top);
  float dx = abs(fract(bx) - 0.5);
  float aa = max(fwidth(bx), 1e-3);
  float a = clamp((wdt - dx) / aa + 0.5, 0.0, 1.0) * step(vMUv.y, top);
  diffuseColor.a *= a;
}
else {
  diffuseColor.a *= vMCov;
  /* M1a debt (M1.1b: the walk's 12-30 m band at 1.23-1.43 x the 4x MSAA reference, with no MSAA in the shipped tier): a
   * blade's or clump's EDGE goes toward the stand's on-screen tone over uSoft.y device px, measured on the blade's own
   * across-coordinate (and a clump's flat top) by its screen derivative, so a sub-pixel step of the lens moves a soft
   * edge instead of flipping a pixel between a lit blade and the ground behind it. The blade's middle keeps its own
   * tone: it is the edge that is softened, not the meadow that is flattened. Faded in over uSoft.z-w metres */
  #ifndef CAL_M_NOSOFT
  float sK = uSoft.x * smoothstep(uSoft.z, uSoft.w, length(vViewPosition));
  if (sK > 0.001) {
    float eU = min(vMUv.x, 1.0 - vMUv.x) / max(fwidth(vMUv.x), 1e-5);
    if (uKind > 0.5) eU = min(eU, (1.0 - vMUv.y) / max(fwidth(vMUv.y), 1e-5));
    float cv = clamp((eU + 0.5) / max(uSoft.y, 0.5), 0.0, 1.0);
    /* (M1a debt fix round 1: a viborina spike is almost all edge, so the soft edge turned its florets to the gold stand
     * tone and F02's violet fell from 1.51 % of the meadow to 0.17-0.25 %, a 6x loss of M1.1b's violet clumps) a violet
     * floret (blue above green in vMColor; straw and gold never are) keeps its own tone at the edge */
    float vio = clamp((vMColor.b - vMColor.g) * 25.0, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uStand.rgb, sK * (1.0 - cv) * (1.0 - vio));
  }
  #endif
}
`;
const MEADOW_AO = /* glsl */ `
#include <aomap_fragment>
{
  vec2 hzUv = clamp(vFloraXZ * uHzWorldInv + 0.5, vec2(0.5 / 512.0), vec2(1.0 - 0.5 / 512.0));
  float hzA = dot(texture(tField, vec3(hzUv, 1.0)), uHzW0) + dot(texture(tField, vec3(hzUv, 2.0)), uHzW1);
  hzA = hzA * hzA * 0.9;
  mHzV = mix(1.0, smoothstep(hzA - 0.016, hzA + 0.034, uSunTan), uHzK);
  reflectedLight.directDiffuse *= mHzV;
  reflectedLight.directSpecular *= mHzV;
  reflectedLight.indirectDiffuse *= 1.7 * mix(0.55, 1.0, vMT);   // open sky above, the tuft's own shade below
}
`;
/**
 * THE GRASS LIGHT (M1.1b, measured): three's physical light loop cost 4.9 of the meadow's 5.1 ms in F02 (lit against
 * flat colour, paired), the cascades' shadow lookups 1.2 of it. Thin blades shade 2 x 2 quads most of whose lanes
 * are helpers, so every instruction counts several times. The blades take a light of their own instead: the sun as
 * a wrapped Lambert (a blade is lit through), the sky as the environment's own irradiance (one PMREM read) plus the
 * ambient and hemisphere terms, no specular, no cascades; the land's long shadow still falls on it (MEADOW_AO) and
 * the fog, tone and grade are three's as before.
 */
const MEADOW_LIGHTS = /* glsl */ `
{
  vec3 mNv = normalize(vNormal);
  vec3 mIrr = getAmbientLightIrradiance(ambientLightColor);
  #if NUM_HEMI_LIGHTS > 0
    for (int i = 0; i < NUM_HEMI_LIGHTS; i++) mIrr += getHemisphereLightIrradiance(hemisphereLights[i], mNv);
  #endif
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_PMREM )
    mIrr += getIBLIrradiance(mNv);
  #endif
  reflectedLight.indirectDiffuse += mIrr * BRDF_Lambert(diffuseColor.rgb);
  #if NUM_DIR_LIGHTS > 0
    float mNdl = dot(mNv, directionalLights[0].direction);
    reflectedLight.directDiffuse += directionalLights[0].color * clamp((mNdl + 0.3) / 1.3, 0.0, 1.0) * BRDF_Lambert(diffuseColor.rgb);
  #endif
}
`;
/** Backlit tips: the low sun through the upper blade when the lens looks toward it. */
const MEADOW_TRANSL = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  vec3 Ls = directionalLights[0].direction;
  vec3 Vv = normalize(vViewPosition);
  float back = clamp(dot(-Vv, Ls), 0.0, 1.0);
  float tr = back * back * back * smoothstep(0.25, 1.0, vMT) * uTransl * mHzV * vMTr;
  reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * tr;
}
#endif
`;
const MEADOW_ID = /* glsl */ `
#include <dithering_fragment>
if (uIdPass > 0.5) gl_FragColor = vec4(0.0, uKind < 1.5 ? 1.0 : 0.5, clamp(length(vViewPosition) / 100.0, 0.0, 1.0), 1.0);
`;

/* --------------------------------------------------------------- the meadow ---- */
export class Meadow {
  /**
   * @param ctx  the game context (terrain, camera, engine)
   * @param o    { uTime, uWind, uActors } the flora's shared uniforms (vegetation.js), { keepouts }
   */
  constructor(ctx, o) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'meadow';
    this.enabled = true;
    this.a2cBlades = true;
    this._owned = { geo: [], mat: [], tex: [] };
    const T = ctx.terrain;
    const { n: GS, step: GSTEP, half: GHALF, H } = T._hg;
    this._hg = T._hg;
    // the height grid as R32F: the vertex shader reads it texel by texel (the same bilinear as getHeight)
    const tH = new THREE.DataTexture(H, GS, GS, THREE.RedFormat, THREE.FloatType);
    tH.minFilter = tH.magFilter = THREE.NearestFilter; tH.generateMipmaps = false; tH.needsUpdate = true;
    this._owned.tex.push(tH);
    // density: the meadow mask (bake maskB.a) as the scatter read it, where the marram does not stand
    const M = T.scatterFields.maskB, N = Math.round(Math.sqrt(M.length / 4));
    const D = new Uint8Array(N * N);
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < N * N; i++) {
      const mead = M[i * 4 + 3] / 255, cover = M[i * 4] / 255;
      D[i] = Math.round(255 * ss(0.04, 0.6, mead) * (1 - ss(0.3, 0.45, cover)));
    }
    this._N = N; this._D = D;
    this._applyKeepouts(o.keepouts);
    const tD = new THREE.DataTexture(D, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    tD.minFilter = tD.magFilter = THREE.LinearFilter; tD.generateMipmaps = false;
    tD.wrapS = tD.wrapT = THREE.ClampToEdgeWrapping; tD.needsUpdate = true;
    this._tD = tD;
    this._owned.tex.push(tD);
    this._u = {
      tMeadowH: { value: tH }, tMeadowD: { value: tD },
      uHGrid: { value: new THREE.Vector4(GS, 1 / GSTEP, GHALF, 0) }, uWorldInv: { value: 1 / WORLD_SIZE },
      uPx: { value: new THREE.Vector4(1000, 1, 0, 0) },
      uTime: o.uTime, uWind: o.uWind, uActors: o.uActors,
      uIdPass: { value: 0 }, uTransl: { value: 1.6 }, uDebug: { value: new THREE.Vector4() },
      /* M1a round 2: the crawl stabiliser on, all four terms (measured at 889bce2, F02's walk and sprint, 12-30 m: 245 -> 201
       * and 527 -> 508 events per mille at 0 samples; past 30 m 195 -> 35 and 449 -> 223) */
      // (round 3, measured at 42be5d0: y and z at 1.4 took the walk's band 156 -> 148 per mille, the sprint's 464 -> 454)
      uStab: { value: new THREE.Vector4(1, 1.4, 1.4, 1) },
      uStab2: { value: new THREE.Vector4(1, 1, 1, 1) },
      // (weight 0.85 -> 1, measured as a variant at a000205: walk band 94.1 -> 85.8 per mille, sprint 367 -> 339; F02's
      // 15-30 m band Lab 52.8 -> 50.7 against the near meadow's 41)
      uStand: { value: new THREE.Vector4(0.28, 0.15, 0.012, 1.0) },
      /* M1a debt: the soft edge (x weight, y width in device px, z-w the metres it fades in over); see MEADOW_COLOR.
       * Measured as variants at 5f79f50 (F02's walk, 12-30 m band, against the 4x reference's 64.9 per mille): off 85.9,
       * 1.5 px 79.2, 2.5 px 75.4 (sprint 339 -> 312 against 313); with the stand tone at half weight it read 92.4 (2 px),
       * so the stand tone stays and the edge is softened instead. At 483283a (reference 58.7): 2.5 px over 8-14 m 75.4,
       * 4 px 73.6, 6 px 72.5, 8 px 71.9, 4 px over 5-12 m 61.4 (sprint 276 against 287): the band's near edge is what
       * crawled. 4 px over 5-12 m */
      uSoft: { value: new THREE.Vector4(1, 4, 5, 12) },
    };
    this.ringTable = meadowRingsFor(ctx.engine?.quality, ctx.engine?.tier?.look?.meadow);
    this.rings = this.ringTable.map((ring) => this._buildRing(ring));
    this._frustum = new THREE.Frustum();
    this._pv = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this._msaa = -1;
    ctx.scene.add(this.group);
  }

  _applyKeepouts(K) {
    if (!Array.isArray(K)) return;
    const N = this._N, cell = WORLD_SIZE / N, D = this._D;
    for (const z of K) {
      const hard = z.meadow ?? z.hard ?? z.r ?? 0;          // a keepout may name its own radius for the meadow
      if (!(hard > 0)) continue;
      const i0 = Math.max(0, Math.floor((z.x - hard + HALF) / cell)), i1 = Math.min(N - 1, Math.ceil((z.x + hard + HALF) / cell));
      const j0 = Math.max(0, Math.floor((z.z - hard + HALF) / cell)), j1 = Math.min(N - 1, Math.ceil((z.z + hard + HALF) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + (i + 0.5) * cell, zz = -HALF + (j + 0.5) * cell;
        if ((x - z.x) ** 2 + (zz - z.z) ** 2 < hard * hard) D[j * N + i] = 0;
      }
    }
  }

  _material(ring) {
    const isCard = ring.kind === 'card';
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
    mat.name = `CAL.${ring.name}`;
    const U = this._u, G = this.ctx.terrain.groundUniforms;
    const ringU = {
      uRing: { value: new THREE.Vector4(ring.rIn, ring.rOut, ring.bandIn, ring.bandOut) },
      uRing2: { value: new THREE.Vector4(ring.chunk, ring.kind === 'blade' ? 0 : ring.kind === 'clump' ? 1 : 2, Math.ceil(HALF / ring.chunk) + 8, 0) },
      uKind: { value: ring.kind === 'blade' ? 0 : ring.kind === 'clump' ? 1 : 2 },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U, ringU);
      shader.uniforms.tField = G.tField;
      shader.uniforms.uHzW0 = G.uHzW0; shader.uniforms.uHzW1 = G.uHzW1;
      shader.uniforms.uSunTan = G.uSunTan; shader.uniforms.uHzWorldInv = G.uHzWorldInv; shader.uniforms.uHzK = G.uHzK;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', MEADOW_VERT_PARS)
        .replace('#include <beginnormal_vertex>', MEADOW_BUILD)
        .replace('#include <begin_vertex>', MEADOW_BEGIN)
        .replace('#include <project_vertex>', MEADOW_PROJECT)
        .replace('#include <worldpos_vertex>', MEADOW_WORLD);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', MEADOW_FRAG_PARS)
        .replace('#include <color_fragment>', MEADOW_COLOR)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace('#include <aomap_fragment>', MEADOW_AO)
        .replace('#include <lights_fragment_begin>', MEADOW_LIGHTS)
        .replace('#include <lights_fragment_maps>', '')
        .replace('#include <lights_fragment_end>', MEADOW_TRANSL)
        .replace('#include <dithering_fragment>', MEADOW_ID);
    };
    mat.customProgramCacheKey = () => `cal-meadow-${ring.kind}`;
    if (isCard) mat.alphaTest = 0.5;
    this._owned.mat.push(mat);
    return mat;
  }

  _buildRing(ring) {
    const geo = patchGeometry(ring);
    const mat = this._material(ring);
    const span = 2 * ring.rOut + 2 * ring.chunk;
    const cap = Math.ceil(span / ring.chunk + 1) ** 2;
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.name = ring.name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;           // grass never casts (TECH §5 lever 3)
    mesh.receiveShadow = false;        // the grass light reads no cascade (MEADOW_LIGHTS); the land's long shadow it does
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    this._owned.geo.push(geo);
    return { ring, mesh, mat, geo, blades: geo.userData.blades, cap, chunks: 0, ox: 1e9, oz: 1e9, list: new Int32Array(cap * 2) };
  }

  /** Max density over a chunk (CPU density array, its texels and their neighbours). */
  _chunkDensity(x0, z0, C) {
    const N = this._N, cell = WORLD_SIZE / N, D = this._D;
    const i0 = Math.max(0, Math.floor((x0 + HALF) / cell - 1)), i1 = Math.min(N - 1, Math.ceil((x0 + C + HALF) / cell));
    const j0 = Math.max(0, Math.floor((z0 + HALF) / cell - 1)), j1 = Math.min(N - 1, Math.ceil((z0 + C + HALF) / cell));
    let m = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (D[j * N + i] > m) m = D[j * N + i];
    return m;
  }

  /** Pick the chunks of every ring that stand in the frustum and in the ring's band. */
  update(camera = this.ctx.camera) {
    if (!camera) return;
    this._syncAA();
    const E = this.ctx.engine;
    const hPx = E?.renderer ? E.renderer.getDrawingBufferSize(this._v2 || (this._v2 = new THREE.Vector2())).y : 1125;
    this._u.uPx.value.x = hPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (!this.enabled) { for (const R of this.rings) R.mesh.count = 0; return; }
    camera.updateMatrixWorld();
    this._pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pv);
    const cx = camera.position.x, cz = camera.position.z, T = this.ctx.terrain;
    for (const R of this.rings) {
      const { ring, mesh } = R, C = ring.chunk, rMax = ring.rOut, rMin = Math.max(0, ring.rIn - ring.bandIn);
      const a0 = Math.floor((cx - rMax) / C), a1 = Math.floor((cx + rMax) / C);
      const b0 = Math.floor((cz - rMax) / C), b1 = Math.floor((cz + rMax) / C);
      const M = mesh.instanceMatrix.array;
      let n = 0;
      for (let b = b0; b <= b1; b++) {
        const z0 = b * C;
        for (let a = a0; a <= a1; a++) {
          const x0 = a * C;
          // nearest and farthest point of the chunk from the camera, in plan
          const nx = Math.max(x0 - cx, 0, cx - x0 - C), nz = Math.max(z0 - cz, 0, cz - z0 - C);
          const near = Math.hypot(nx, nz);
          if (near > rMax) continue;
          const fx = Math.max(Math.abs(x0 - cx), Math.abs(x0 + C - cx)), fz = Math.max(Math.abs(z0 - cz), Math.abs(z0 + C - cz));
          if (Math.hypot(fx, fz) < rMin) continue;
          if (this._chunkDensity(x0, z0, C) < 3) continue;
          const yc = T.getHeight(x0 + C * 0.5, z0 + C * 0.5);
          this._box.min.set(x0 - 1.2, yc - 1.5 - C * 0.3, z0 - 1.2);
          this._box.max.set(x0 + C + 1.2, yc + 1.5 + C * 0.3, z0 + C + 1.2);
          if (!this._frustum.intersectsBox(this._box)) continue;
          if (n >= R.cap) continue;
          const o = n * 16;
          M[o] = 1; M[o + 1] = 0; M[o + 2] = 0; M[o + 3] = 0;
          M[o + 4] = 0; M[o + 5] = 1; M[o + 6] = 0; M[o + 7] = 0;
          M[o + 8] = 0; M[o + 9] = 0; M[o + 10] = 1; M[o + 11] = 0;
          M[o + 12] = x0; M[o + 13] = 0; M[o + 14] = z0; M[o + 15] = 1;
          R.list[n * 2] = a; R.list[n * 2 + 1] = b;
          n++;
        }
      }
      mesh.count = n;
      R.chunks = n;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, n * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Alpha-to-coverage needs a multisampled main target: on with MSAA, off (opaque, cards alpha-tested) without. */
  _syncAA() {
    const s = this.ctx.engine?.sceneTarget?.samples ?? 0;
    const key = (s > 0 ? 1 : 0) + (this.a2cBlades ? 2 : 0);
    if (key === this._msaa) return;
    this._msaa = key;
    for (const R of this.rings) {
      const card = R.ring.kind === 'card';
      const want = s > 0 && (card || this.a2cBlades);
      if (R.mat.alphaToCoverage !== want) { R.mat.alphaToCoverage = want; R.mat.needsUpdate = true; }
    }
    // the floor's coverage fade is only meaningful through coverage; without it a floored blade stays solid
    this._u.uPx.value.y = 1;
    this._u.uPx.value.z = s > 0 && this.a2cBlades ? 1 : 0;
  }

  setIdPass(on) { this._u.uIdPass.value = on ? 1 : 0; }

  /**
   * Chunks and triangles per ring as submitted (instances x patch triangles), and as drawn: the vertex shader's keep
   * rule (density x ring ramps against the blade hash) mirrored on the CPU with the same hash. The density is read
   * bilinear from the CPU array, so `drawn` can differ from the GPU's by the 8-bit filter's rounding.
   */
  stats(camera = this.ctx.camera, { drawn = true } = {}) {
    const out = { rings: {}, submittedTris: 0, drawnTris: 0, ringTotalTris: 0 };
    const N = this._N, cell = WORLD_SIZE / N, D = this._D;
    const dens = (x, z) => {
      const fx = (x + HALF) / cell - 0.5, fz = (z + HALF) / cell - 0.5;
      const ix = Math.max(0, Math.min(N - 2, Math.floor(fx))), iz = Math.max(0, Math.min(N - 2, Math.floor(fz)));
      const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz));
      const a = D[iz * N + ix], b = D[iz * N + ix + 1], c = D[(iz + 1) * N + ix], d = D[(iz + 1) * N + ix + 1];
      return ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) / 255;
    };
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (const R of this.rings) {
      const { ring } = R, tris = TRIS[ring.kind], C = ring.chunk, off = Math.ceil(HALF / C) + 8;
      const sub = R.mesh.count * R.blades * tris;
      const area = Math.PI * (ring.rOut ** 2 - ring.rIn ** 2);
      const row = { chunks: R.mesh.count, bladesPerChunk: R.blades, trisPerBlade: tris, submittedTris: sub, wholeRingTris: Math.round(area * ring.density * tris) };
      if (drawn && camera) {
        const P = R.geo.attributes.position.array, vpb = VERTS[ring.kind];
        let kept = 0;
        for (let k = 0; k < R.mesh.count; k++) {
          const a = R.list[k * 2], b = R.list[k * 2 + 1];
          const ck = chunkKey(a + off, b + off), rot = pcg((ck ^ 0x5bd1e995) >>> 0) & 3;
          for (let i = 0; i < R.blades; i++) {
            let lx = P[i * vpb * 3] - C / 2, lz = P[i * vpb * 3 + 2] - C / 2;
            if (rot === 1) [lx, lz] = [-lz, lx]; else if (rot === 2) { lx = -lx; lz = -lz; } else if (rot === 3) [lx, lz] = [lz, -lx];
            const rx = a * C + lx + C / 2, rz = b * C + lz + C / 2;
            const d = Math.hypot(rx - camera.position.x, rz - camera.position.z);
            const kIn = ring.rIn > 0 ? ss(ring.rIn - ring.bandIn, ring.rIn, d) : 1, kOut = 1 - ss(ring.rOut - ring.bandOut, ring.rOut, d);
            const u1 = pcg(bladeKey(ck, i)) / 4294967296;
            if (u1 < dens(rx, rz) * kIn * kOut) kept++;
          }
        }
        row.drawnBlades = kept;
        row.drawnTris = kept * tris;
        out.drawnTris += row.drawnTris;
      }
      out.rings[ring.name] = row;
      out.submittedTris += sub;
      out.ringTotalTris += row.wholeRingTris;
    }
    return out;
  }

  /** Runtime switches for the A/B (tools/perf/meadow.mjs). */
  perfSwitches() {
    const D = this._u.uDebug.value;
    const ring = (i) => ({ id: `meadow-r${i}`, on: () => { this.rings[i].mesh.visible = true; }, off: () => { this.rings[i].mesh.visible = false; } });
    return [
      { id: 'meadow', on: () => { this.enabled = true; this.group.visible = true; this.update(); }, off: () => { this.enabled = false; this.group.visible = false; } },
      { id: 'meadow-a2c', on: () => { this.a2cBlades = true; this._syncAA(); }, off: () => { this.a2cBlades = false; this._syncAA(); } },
      ring(0), ring(1), ring(2),
      // diagnostics: lit against flat colour (the fragment's lighting), and every blade clipped (what is left is vertex work)
      { id: 'meadow-lighting', on: () => { D.x = 0; }, off: () => { D.x = 1; } },
      { id: 'meadow-raster', on: () => { D.y = 0; }, off: () => { D.y = 1; } },
      { id: 'meadow-shadow-recv', on: () => { for (const R of this.rings) R.mesh.receiveShadow = true; }, off: () => { for (const R of this.rings) R.mesh.receiveShadow = false; } },
      // M1a round 2: the vertex shader stops at the keep test for a clipped blade (on = the early-out, off = as shipped)
      // M1a round 3 fix (the judge's FIX LIST 1): the round-3 stabiliser set compiled out (define CAL_M_NOSTAB2)
      { id: 'meadow-stab2', on: () => this._define('CAL_M_NOSTAB2', false), off: () => this._define('CAL_M_NOSTAB2', true) },
      // M1a debt: the soft edge compiled out (define CAL_M_NOSOFT)
      { id: 'meadow-soft', on: () => this._define('CAL_M_NOSOFT', false), off: () => this._define('CAL_M_NOSOFT', true) },
      { id: 'meadow-vs-early', on: () => this.setEarlyOut(true), off: () => this.setEarlyOut(false), restore: () => this.setEarlyOut(this._early0 ?? false) },
    ];
  }

  /** Set or clear one define on every ring's material. */
  _define(k, on) {
    for (const R of this.rings) {
      const d = { ...(R.mat.defines || {}) };
      if (on) d[k] = 1; else delete d[k];
      R.mat.defines = d; R.mat.needsUpdate = true;
    }
  }

  /** The stand tone (uStand: rgb and weight). */
  setStand(r, g, b, w = this._u.uStand.value.w) { this._u.uStand.value.set(r, g, b, w); }

  /** The soft edge (uSoft: weight, width in device px, fade-in start and full, metres). */
  setSoft(x, y = this._u.uSoft.value.y, z = this._u.uSoft.value.z, w = this._u.uSoft.value.w) { this._u.uSoft.value.set(x, y, z, w); }

  /** The vertex shader's early-out for clipped blades (define CAL_M_EARLY): the same pixels, less vertex work. */
  setEarlyOut(on) {
    if (this._early0 === undefined) this._early0 = !!this._early;
    this._early = !!on;
    for (const R of this.rings) {
      const d = { ...(R.mat.defines || {}) };
      if (on) d.CAL_M_EARLY = 1; else delete d.CAL_M_EARLY;
      R.mat.defines = d; R.mat.needsUpdate = true;
    }
  }

  /** The crawl stabiliser's four terms (uStab, see MEADOW_BUILD), each 0..1. */
  setStab(x = 0, y = 0, z = 0, w = 0) { this._u.uStab.value.set(x, y, z, w); }

  /** The round-3 set (uStab2: normals up, square to the lens, sway damped, one stand tone), each 0..1. */
  setStab2(x = 0, y = 0, z = 0, w = 0) { this._u.uStab2.value.set(x, y, z, w); }

  /** Density 0..1 at a point (the vertex shader's read, bilinear). */
  densityAt(x, z) {
    const N = this._N, cell = WORLD_SIZE / N;
    const ix = Math.max(0, Math.min(N - 1, Math.round((x + HALF) / cell - 0.5))), iz = Math.max(0, Math.min(N - 1, Math.round((z + HALF) / cell - 0.5)));
    return this._D[iz * N + ix] / 255;
  }

  dispose() {
    for (const R of this.rings) R.mesh.dispose();
    for (const g of this._owned.geo) g.dispose();
    for (const m of this._owned.mat) m.dispose();
    for (const t of this._owned.tex) t.dispose();
    this._owned = { geo: [], mat: [], tex: [] };
    this.group.parent?.remove(this.group);
    this.group.clear();
  }
}
