/**
 * THE GROUND MATERIAL (world-ground W1, bible §9.2, §8.3): chunks for a
 * MeshStandardMaterial, shared by the terrain mesh and the rock scatter.
 *
 *   ≤ 3 layers blended per pixel (`A-layers-budget`): five weights in, the two smallest
 *   zeroed; texture arrays, so the Pans cost 4 samplers and W2-W4's layers cost none.
 *   Height-blended: the layer that stands taller in the texel wins the edge.
 *   Triplanar only where slope > 0.35, and only on the basalt layer.
 *   Stochastic anti-tile: a low-frequency noise picks one of 8 UV offsets per region and
 *   the seams blend on the texture's own contrast (`A-anti-tile`).
 *   Brine and wet sand mirror THIS sky at THIS hour (world-sky's aerial colours), with no
 *   extra render target.
 *
 * Layer ids: 0 sand, 1 salt, 2 basalt, 3 silt, 4 shingle: one array per part, 1024² (M1.1a; 3 and 4 tiled 2 x 2).
 *
 * M2 wave 2 (area A): the Holds' ground (HOLDS_TERM): black lapilli from the shingle layer read at a cinder's scale,
 * sand drifts in the lee, the pit-cups (a vine in a hollow behind its crescent wall) on worked ground, and the Screed
 * Scar's planed floor and spoil. Its inputs are unpacked per vertex from the normal's fourth channel (holds/ground.js).
 */
import { SCAR } from './sites.js';
const _sl = Math.hypot(SCAR.b.x - SCAR.a.x, SCAR.b.z - SCAR.a.z);
/** The Scar's line, engine xz, unit: along (toward its south-west end); for the blade's grooves on its floor. */
const SCAR_DIR = `vec2(${((SCAR.b.x - SCAR.a.x) / _sl).toFixed(6)}, ${((SCAR.b.z - SCAR.a.z) / _sl).toFixed(6)})`;
export const GROUND_VERT_PARS = /* glsl */ `
#include <common>
attribute vec4 aTint;
attribute vec4 aGround;
varying vec3 vWPos;
varying vec3 vWNorm;
varying vec4 vTint;
varying vec3 vGround;
`;
export const GROUND_VERT_WORLD = /* glsl */ `
#include <worldpos_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNorm = normalize(mat3(modelMatrix) * objectNormal);
vTint = vec4(pow(aTint.rgb, vec3(2.2)), aTint.a);
{
  /* the Holds' ground (holds/ground.js packGround): hold, worked ground, the Scar (+ floor, - spoil), unpacked here so
   * the three interpolate apart */
  float gq = floor(aGround.w * 32767.0 + 0.5);
  vGround = vec3(floor(gq / 1024.0) / 31.0, mod(floor(gq / 32.0), 32.0) / 31.0, (mod(gq, 32.0) - 15.0) / 15.0);
}
`;

export const ROCK_VERT_PARS = /* glsl */ `
#include <common>
varying vec3 vWPos;
varying vec3 vWNorm;
varying vec3 vLocal;
`;
/**
 * The instanced world normal, by the inverse-transpose under non-uniform scale. The POC's
 * `mat3(instanceMatrix) * n` skewed every column's sides toward its long axis: the streak
 * bug (`A-columns-normals`).
 */
export const ROCK_VERT_WORLD = /* glsl */ `
#include <worldpos_vertex>
{
  vec4 rp = vec4(transformed, 1.0);
  vec3 rn = objectNormal;
  #ifdef USE_INSTANCING
    rp = instanceMatrix * rp;
    mat3 im = mat3(instanceMatrix);
    rn = im * (rn / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])));
  #endif
  vWPos = (modelMatrix * rp).xyz;
  vWNorm = normalize(mat3(modelMatrix) * rn);
  vLocal = position;
}
`;

export const GROUND_FRAG_PARS = /* glsl */ `
#include <common>
varying vec3 vWPos;
varying vec3 vWNorm;
/* M1.1a: every layer in one array per part (layers.js LAYER_ARRAY, 1024²); mud and pebble are their 512² sources
 * tiled 2 x 2, read at uv / 2 (the same texel and mip as the 512² layer at uv) */
uniform highp sampler2DArray tA;
uniform highp sampler2DArray tN;
uniform vec3 uScale1;   // 1/tile: sand, salt, basalt
uniform vec2 uScale2;   // 1/tile: silt, shingle
/* M1.1a: one array for the fields the ground reads at world scale (sampler units, TECH §5 lever 5):
 * layer 0 the periodic noise (128² tiled 4 x 4, so uv / 4 reads the same texel and mip), layers 1-2 the
 * skyline's eight bearings (512², clamped by hand: the array repeats for the noise) */
uniform highp sampler2DArray tField;
#define gNoiseT(uv) texture(tField, vec3((uv) * 0.25, 0.0))
uniform vec4 uHzW0;     // the light's bearing as weights over the 8 skyline channels
uniform vec4 uHzW1;
uniform float uSunTan;  // tan(elevation) of the sun or moon
uniform float uHzWorldInv;
uniform float uHzK;     // shadow strength: 1, or the calima's 0.45
uniform vec4 uGroundR2; // M1a round 2: x the shade fill's chroma kept out (GROUND_AO), y the meadow gap tone variant
uniform vec4 uCrust;    // M1a debt: the salt crust's x gain, y cool (1 = round 3's tint), z rose-grey, w grain depth (terrain.js CRUST)
vec3 gN; float gRough; float gAO; float gLiquid; float gSunVis = 1.0;
/** Is the light above the terrain's skyline here? Long soft shadows from one lookup. */
float gSkylineVis(vec2 xz) {
  vec2 uv = clamp(xz * uHzWorldInv + 0.5, vec2(0.5 / 512.0), vec2(1.0 - 0.5 / 512.0));
  float a = dot(texture(tField, vec3(uv, 1.0)), uHzW0) + dot(texture(tField, vec3(uv, 2.0)), uHzW1);
  a = a * a * 0.9;
  return mix(1.0, smoothstep(a - 0.016, a + 0.034, uSunTan), uHzK);
}
// tField layer 0: four octaves of periodic noise in one fetch: R 8, G 16, B 32, A 64 cells a tile
float gScale(int i) { return i == 0 ? uScale1.x : i == 1 ? uScale1.y : i == 2 ? uScale1.z : i == 3 ? uScale2.x : uScale2.y; }
vec4 gA(int i, vec2 uv, vec2 gx, vec2 gy) {
  float k = i < 3 ? 1.0 : 0.5;
  return textureGrad(tA, vec3(uv * k, float(i)), gx * k, gy * k);
}
vec4 gNm(int i, vec2 uv, vec2 gx, vec2 gy) {
  float k = i < 3 ? 1.0 : 0.5;
  return textureGrad(tN, vec3(uv * k, float(i)), gx * k, gy * k);
}
`;

export const TERRAIN_FRAG_PARS = /* glsl */ `
${GROUND_FRAG_PARS}
varying vec4 vTint;
varying vec3 vGround;
/* M1.1a: the four world masks in one array (one sampler unit): 0 mask A, 1 mask B, 2 shore, 3 the pan */
uniform highp sampler2DArray tMask;
#define gPanT(uv) texture(tMask, vec3((uv), 3.0))
uniform vec3 uPanBox;      // x0, z0, 1/size
uniform float uWorldInv;
uniform float uTime;
uniform float uSea;
uniform vec2 uSunXZ;       // unit, toward the light
uniform vec2 uFieldU;      // the salt field's long axis (the rake runs along it), unit, engine xz
uniform float uStrata;     // the crater's bedding strength (terrain.setStrataStrength)
/** The pan texture through a cubic B-spline (4 bilinear taps): its 0.5 contour is a smooth curve,
 * where the bilinear one stepped along every diagonal cell edge at 0.48 m a texel (V32). */
vec4 gPanCubic(vec2 uv) {
  vec2 tc = uv * 512.0 - 0.5;
  vec2 f = fract(tc); tc -= f;
  vec4 nx = vec4(1.0, 2.0, 3.0, 4.0) - f.x, ny = vec4(1.0, 2.0, 3.0, 4.0) - f.y;
  vec4 sx = nx * nx * nx, sy = ny * ny * ny;
  vec4 cx = vec4(sx.x, sx.y - 4.0 * sx.x, sx.z - 4.0 * sx.y + 6.0 * sx.x, 0.0); cx.w = 6.0 - cx.x - cx.y - cx.z;
  vec4 cy = vec4(sy.x, sy.y - 4.0 * sy.x, sy.z - 4.0 * sy.y + 6.0 * sy.x, 0.0); cy.w = 6.0 - cy.x - cy.y - cy.z;
  vec4 c = tc.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 sm = vec4(cx.xz + cx.yw, cy.xz + cy.yw);
  vec4 o = (c + vec4(cx.yw, cy.yw) / sm) / 512.0;
  vec4 s0 = gPanT(o.xz), s1 = gPanT(o.yz), s2 = gPanT(o.xw), s3 = gPanT(o.yw);
  float wx = sm.x / (sm.x + sm.y), wy = sm.z / (sm.z + sm.w);
  return mix(mix(s3, s2, wx), mix(s1, s0, wx), wy);
}
vec2 gHash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
/** Voronoi edge distance (F2 - F1) and the cell's own hash: salt polygons, pebbles. */
vec3 gVoro(vec2 x) {
  vec2 n = floor(x), f = x - n;
  float f1 = 8.0, f2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), o = gHash2(n + g);
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = n + g; } else if (d < f2) f2 = d;
  }
  return vec3(sqrt(f2) - sqrt(f1), sqrt(f1), fract(sin(dot(id, vec2(41.3, 289.1))) * 9137.7));
}
`;

/** The crater's bedding, shared by the layered ground and the far field (needs col, pert, slope, wn, xz, vTint). */
export const STRATA_TERM = /* glsl */ `
  /* -- strata (W-03 b): the red tuff ring's beds, 0.8-2.5 m, on its steep faces: a palette row
   *    per bed, a lit lip and a shaded undercut at each bed's top, dark varnish streaks below.
   *    terrain.beddingAt() is this term's JS mirror (A63) --------------------------------- */
  float strK = smoothstep(0.55, 0.95, slope) * smoothstep(0.02, 0.25, tk0) * uStrata;
  if (strK > 0.01) {
    float bz = vWPos.y + 4.0 * (gNoiseT(xz * 0.0111).r - 0.5) * 2.0;
    float T = 1.7;
    float bnd = bz / T, bi = floor(bnd), bf = bnd - bi;
    float hb = fract(sin(bi * 78.233) * 43758.5453);
    vec3 bedC = hb < 0.25 ? vec3(0.62, 0.44, 0.34) : hb < 0.55 ? vec3(1.08, 0.86, 0.72) : hb < 0.8 ? vec3(0.84, 0.62, 0.5) : vec3(1.22, 1.06, 0.88);
    float lip = smoothstep(0.82, 0.97, bf), under = 1.0 - smoothstep(0.0, 0.12, bf);
    vec2 fall0 = normalize(wn.xz + vec2(1e-5));
    float varn = gNoiseT(vec2(dot(xz, vec2(-fall0.y, fall0.x)) * 0.09, bz * 0.011)).b;
    vec3 sc = bedC * (1.0 + 0.22 * lip - 0.3 * under) * (1.0 - 0.28 * smoothstep(0.55, 0.85, varn));
    col = mix(col, col * sc, strK);
    pert += vec3(fall0.x, 0.0, fall0.y) * (lip * 0.35 - under * 0.25) * strK;
  }
`;

/**
 * THE HOLDS' GROUND (M2 wave 2, area A; bible §3.3, M2 briefs HG2-HG4). Needs hold, hk, hSkip, slope, wn, xz, dCam,
 * dpx, dpy, nMac, macA, farN and the stack's col, pert, rSum, aoSum (blended into them by hk).
 *
 *   lapilli    the shingle layer (4) read at a 0.9 m tile, so its cobbles are 2-6 cm cinders: black (HG4 L* 12-22* in
 *              sun), a little warm, with broad oxidised (red-brown) and ashen fields; two turned reads at
 *              incommensurate scales to 130 m, so no tile repeats over a walk (HG4's autocorrelation)
 *   drifts     pale dust in broad patches, deepest on the lee (south-west-facing) side of every rise
 *   pit-cups   on worked ground under slope 0.32-0.5: a staggered grid 8 m apart, turned 20 deg; in each cell (82 %) a
 *              hollow 1.9-2.6 m across the rim, shaded by its own bowl normal, a crescent drystone wall 0.7 m thick on
 *              its north-east (the trade wind's) side, and at its foot a vine (green in 85 % of pits, dormant in the
 *              rest). One cell per pixel, no neighbour search: every pit and its wall stay inside their cell
 *   the Scar   its planed floor pale graded subsoil scored along the line by the blade; its spoil a heap of the
 *              same pale stuff and black cinder
 * Its fetches: four of the layer array (two reads, albedo and normal, the second read and the normals only near);
 * the whole stack is skipped where hk is 1 (hSkip), so a Holds pixel costs less than a Pans one.
 */
const HOLDS_TERM = /* glsl */ `
  if (hk > 0.004) {
    /* -- lapilli ---------------------------------------------------------------- */
    vec2 luv = xz * 1.111, lgx = dpx * 1.111, lgy = dpy * 1.111;
    vec4 la = gA(4, luv, lgx, lgy);
    vec4 ln = vec4(0.5, 0.5, 0.631, 0.905);
    if (farN < 1.0) ln = mix(gNm(4, luv, lgx, lgy), ln, farN);
    if (dCam < 130.0) {
      mat2 Lr = mat2(0.788, 0.616, -0.616, 0.788);
      vec2 luv2 = Lr * luv * 0.731 + vec2(0.41, 0.19), lgx2 = Lr * lgx * 0.731, lgy2 = Lr * lgy * 0.731;
      float k2 = 0.5 * (1.0 - smoothstep(100.0, 130.0, dCam));
      la = mix(la, gA(4, luv2, lgx2, lgy2), k2);
      if (farN < 1.0) {
        vec4 n2 = gNm(4, luv2, lgx2, lgy2);
        n2.xy = (vec2(dot(n2.xy * 2.0 - 1.0, Lr[0]), dot(n2.xy * 2.0 - 1.0, Lr[1]))) * 0.5 + 0.5;
        ln = mix(ln, mix(n2, vec4(0.5, 0.5, 0.631, 0.905), farN), k2);
      }
    }
    vec3 hc = pow(la.rgb, vec3(2.2));
    // black: the shingle's pale and rusty stones pulled down toward the cinder (a 1 + 6 L compression), a little warm
    hc *= vec3(1.22, 1.13, 1.04) / (1.0 + 6.0 * dot(hc, vec3(0.2126, 0.7152, 0.0722)));
    // broad fields: some cinder oxidised red-brown, some ashen
    vec4 nF = gNoiseT(xz * 0.0047 + 0.83);
    float ox = smoothstep(0.58, 0.8, nF.r * 0.7 + nMac.a * 0.3), ashF = smoothstep(0.6, 0.82, nF.b);
    hc *= mix(vec3(1.0), vec3(1.5, 1.08, 0.86), ox * 0.7) * mix(1.0, 1.28, ashF * 0.6);
    vec2 ht = ln.xy * 2.0 - 1.0;
    vec3 hp = vec3(ht.x, 0.0, ht.y) * 1.1;
    float hR = ln.z, hAO = ln.a * 2.0 - 1.0;

    /* -- drifts: dust on the lee of every rise (the trade wind blows toward the south-west: engine (-0.71, 0.71)) -- */
    float lee = clamp(dot(wn.xz, vec2(-0.7071, 0.7071)) * 3.0, -0.6, 1.0);
    vec4 nD = gNoiseT(xz * 0.0213 + 0.31);
    float drift = smoothstep(0.63, 0.86, nD.r * 0.55 + gNoiseT(xz * 0.0071 + 0.67).b * 0.45 + 0.1 * lee) * (1.0 - smoothstep(0.35, 0.75, slope));
    vec3 dustC = vec3(0.098, 0.082, 0.061) * (0.86 + 0.28 * nD.g);
    hc = mix(hc, dustC, drift * 0.6);
    hp *= 1.0 - 0.65 * drift;
    hR = mix(hR, 0.97, drift);

    /* -- the pit-cups ------------------------------------------------------------- */
    float pitK = vGround.y * (1.0 - smoothstep(0.32, 0.5, slope));
    if (pitK > 0.01) {
      mat2 PM = mat2(0.9397, 0.342, -0.342, 0.9397);
      vec2 pq = PM * xz * 0.125;
      float prow = floor(pq.y);
      pq.x += 0.5 * mod(prow, 2.0);
      vec2 pc = floor(pq), ph = gHash2(pc + 17.0);
      float ph3 = fract(sin(dot(pc, vec2(12.9898, 78.233))) * 43758.5453);
      vec2 pf = (fract(pq) - 0.5 - (ph - 0.5) * 0.12) * 8.0;     // m from the pit's centre, in the turned frame
      vec2 po = pf * PM;                                          // the same, in the world
      float R = 1.9 + 0.7 * ph3, d = length(po);
      float px = max(length(vec2(length(dpx), length(dpy))), 0.03);   // a pixel's footprint, m
      float has = step(0.18, ph.x) * pitK;
      if (has > 0.0 && d < R + 1.4) {
        vec2 rdir = po / max(d, 1e-3);
        float inside = 1.0 - smoothstep(R - px, R + px, d);
        // the bowl, about 1.2 m deep: its floor faces the centre, steepest at the rim
        float tilt = 2.4 * (d / R) * inside;
        hp = mix(hp, hp * 0.35, inside * has) + vec3(-rdir.x, 0.0, -rdir.y) * tilt * has;
        hc *= mix(1.0, 0.6, inside * has * (0.6 + 0.4 * (1.0 - d / R)));
        // the dug cinder heaped round the rim: a lip a little paler and dustier
        float lip = (smoothstep(R - 0.5 - px, R - 0.1, d) - smoothstep(R + 0.05, R + 0.5 + px, d)) * has;
        hc = mix(hc, hc * 1.35 + dustC * 0.12, lip * 0.6);
        hAO = mix(hAO, hAO * 0.62, inside * has);
        hc = mix(hc, hc * 0.7 + dustC * 0.3, drift * inside * has * 0.5);
        // the crescent wall on the north-east (engine (0.71, -0.71)): its arc +-75 deg, 0.7 m thick past the rim
        float face = dot(rdir, vec2(0.7071, -0.7071));
        float arc = smoothstep(0.2, 0.45, face) * has;
        float w0 = R + 0.1, w1 = R + 0.95, wm = (w0 + w1) * 0.5;
        float wall = (smoothstep(w0 - px, w0 + px, d) - smoothstep(w1 - px, w1 + px, d)) * arc;
        if (wall > 0.0) {
          // drystone: blocks about 0.4 m along the arc, each its own tone, dark joints between
          float ang = atan(rdir.y, rdir.x) * R * 2.6, ring = (d - w0) * 2.8;
          vec2 bc = floor(vec2(ang, ring + floor(ang) * 0.5));
          float bh = fract(sin(dot(bc + pc * 7.0, vec2(41.3, 289.1))) * 9137.7);
          vec2 bf = fract(vec2(ang, ring + floor(ang) * 0.5));
          float joint = (1.0 - smoothstep(0.0, 0.12, min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)))) * (1.0 - smoothstep(0.08, 0.2, px));
          vec3 stoneC = vec3(0.15, 0.136, 0.118) * (0.7 + 0.6 * bh) * (1.0 - 0.5 * joint);
          hc = mix(hc, stoneC, wall);
          // its faces: outward on the outer half, inward on the inner, its top flat
          float fo = clamp((d - wm) / (w1 - wm), -1.0, 1.0);
          hp = mix(hp, vec3(rdir.x, 0.0, rdir.y) * fo * 1.8 * smoothstep(0.3, 0.85, abs(fo)), wall);
          hR = mix(hR, 0.86, wall);
          hAO = mix(hAO, 0.8 - 0.3 * joint, wall);
        }
        // the vine at the bowl's foot: a lumpy bush 0.3-0.45 of the rim, green (85 %) or dormant; past the plants' ring it
        // keeps about two pixels, so a far pit still shows its green
        float vr = R * (0.3 + 0.15 * ph.y) * (0.82 + 0.3 * gNoiseT(rdir * 0.5 + pc * 0.37 + 0.5).r) * mix(1.0, 1.6, smoothstep(0.12, 0.6, px));
        float vine = (1.0 - smoothstep(vr - px * 1.5, vr + px * 1.5, d)) * has;
        if (vine > 0.0) {
          float leaf = gNoiseT(xz * 1.37 + ph * 3.0).a * 0.6 + gNoiseT(xz * 0.53 + 0.2).b * 0.4;
          vec3 green = mix(vec3(0.046, 0.082, 0.018), vec3(0.085, 0.118, 0.026), ph.y) * (0.7 + 0.6 * leaf);
          vec3 dormant = vec3(0.07, 0.05, 0.032) * (0.7 + 0.6 * leaf);
          hc = mix(hc, ph.y > 0.15 ? green : dormant, vine);
          hp = mix(hp, vec3(leaf - 0.5, 0.0, gNoiseT(xz * 1.11 + 0.7).g - 0.5) * 1.4 + vec3(-rdir.x, 0.0, -rdir.y) * 0.4, vine);
          hR = mix(hR, 0.72, vine);
          hAO = mix(hAO, 0.62 + 0.3 * leaf, vine);
        }
      }
    }

    /* -- the Scar: its planed floor and its spoil ---------------------------------- */
    float scS = vGround.z;
    if (abs(scS) > 0.02) {
      vec2 sd = ${SCAR_DIR};
      float across = dot(xz, vec2(-sd.y, sd.x)), along = dot(xz, sd);
      vec4 nS = gNoiseT(vec2(across * 0.13, along * 0.004) + 0.21);
      vec3 sub = vec3(0.19, 0.163, 0.128) * (0.84 + 0.32 * nS.r);   // the pale subsoil the blade cut down to
      if (scS > 0.0) {
        // the blade's grooves along the line, 0.6-1.3 m apart, fading past 90 m
        float gv = across * 1.15 + nS.g * 1.6;
        float groove = (0.5 + 0.5 * sin(gv * 6.2831853)) * (1.0 - smoothstep(60.0, 90.0, dCam));
        vec3 fc = sub * (1.0 - 0.18 * groove) * mix(1.0, 0.82, smoothstep(0.55, 0.8, nS.b));
        // cinder blown back onto the floor in patches
        fc = mix(fc, hc, smoothstep(0.62, 0.86, gNoiseT(xz * 0.041 + 0.5).a) * 0.6);
        hc = mix(hc, fc, scS);
        hp = mix(hp, vec3(-sd.y, 0.0, sd.x) * cos(gv * 6.2831853) * 0.35 * (1.0 - smoothstep(30.0, 60.0, dCam)), scS);
        hR = mix(hR, 0.9, scS);
        hAO = mix(hAO, 0.88, scS);
      } else {
        // spoil: clods of the pale subsoil in the black cinder, about a third of it
        float clod = smoothstep(0.5, 0.62, gNoiseT(xz * 0.37 + 0.13).a * 0.6 + gNoiseT(xz * 0.11 + 0.71).b * 0.4);
        hc = mix(hc, mix(hc * 1.25, sub * 0.9, clod), -scS);
        hp *= 1.0 + 0.6 * clod * -scS;
      }
    }

    /* -- into the stack ------------------------------------------------------------ */
    col = hSkip ? hc : mix(col, hc, hk);
    pert = hSkip ? hp : mix(pert, hp, hk);
    rSum = hSkip ? hR : mix(rSum, hR, hk);
    aoSum = hSkip ? hAO : mix(aoSum, hAO, hk);
    w[0] *= 1.0 - hk;
  }
`;

/** Accumulates one layer: albedo into col, world normal offset, rough + AO, height blend. */
export const TERRAIN_COLOR = /* glsl */ `
#include <color_fragment>
#ifdef CAL_P_FLAT
diffuseColor.rgb = vec3(0.1); gN = vec3(0.0); gRough = 1.0; gAO = 1.0; gLiquid = 0.0; gSunVis = 1.0;
#else
/* M1a round 2 (F02 at 11 ms with the look off): the near ground's distance LOD. The normal maps give way to their
 * per-layer means over 85-115 m (was 150-190), the second anti-tile reads fade out over 100-130 m (was 200-240), the
 * pan's cubic read stops at 60 m (was 110); and ground the meadow wholly covers skips the layer stack (its colour is the
 * meadow's own tone either way). The far-field bake and CAL_P_R1LOD (the A/B) keep round 1's distances */
#if defined(CAL_P_R1LOD) || defined(CAL_FAR_BAKE)
#define G_CUBIC_D 110.0
#define G_FARN0 150.0
#define G_FARN1 190.0
#define G_SEC0 200.0
#define G_SEC1 240.0
#define G_R1 1
#else
#define G_CUBIC_D 60.0
#define G_FARN0 85.0
#define G_FARN1 115.0
#define G_SEC0 100.0
#define G_SEC1 130.0
#endif
{
  vec3 wn = normalize(vWNorm);
  vec2 xz = vWPos.xz;
  float dCam = length(vWPos - cameraPosition);
  vec2 muv = xz * uWorldInv + 0.5;
  vec4 mA = texture(tMask, vec3(muv, 0.0));
  vec4 mB = texture(tMask, vec3(muv, 1.0));
  vec4 sh = texture(tMask, vec3(muv, 2.0));
  vec2 puv = (xz - uPanBox.xy) * uPanBox.z;
  vec4 pan = vec4(0.0);
  if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
    #ifdef CAL_P_NOCUBIC
    pan = gPanT(puv);
    #else
    pan = dCam < G_CUBIC_D ? gPanCubic(puv) : gPanT(puv);
    #endif
  }

  float slope = sqrt(max(1.0 - wn.y * wn.y, 0.0)) / max(wn.y, 0.05);
  vec4 nMac = gNoiseT(xz * 0.0039);                 // cells 32, 16, 8, 4 m
  float macA = nMac.r * 0.6 + nMac.b * 0.4;
  /* M2 wave 2: the Holds. On their gentle ground the layer stack is skipped (HOLDS_TERM draws all of it); their steep
   * faces (over 44 deg) keep the rock layer and blend into the lapilli over slope 0.95-1.4 */
  float hold = vGround.x;
  float hk = hold * (1.0 - smoothstep(0.95, 1.4, slope));
  bool hSkip = hk > 0.985;

  /* -- the five weights, then the three that survive ----------------------- */
  /* The cell's own crust and brine, un-premultiplied, cut by the iso-line of its interior: the
   * interior ramp baked at 0.48 m a texel, used raw, drew zigzag teeth along every diagonal
   * cell edge under the dykes; its 0.5 contour is a clean line. */
  float inK = smoothstep(0.38, 0.62, pan.a);
  float crust = pan.a > 0.004 ? clamp(pan.r / pan.a, 0.0, 1.0) * inK : 0.0;
  float brine = pan.a > 0.004 ? clamp(pan.g / pan.a, 0.0, 1.0) * inK : 0.0;
  #ifdef CAL_CAPTURE_LAYER
  #if CAL_CAPTURE_LAYER == 1
  /* the M1.1e salt-crust material capture: the crust as it is inside a dry white cell, everywhere in the square (no dyke,
   * cell edge or brine), so a 40 m top-down reads the crust's own repeat, not the field's walls */
  inK = 1.0; crust = 1.0; brine = 0.0; pan = vec4(1.0, 0.0, 0.0, 1.0);
  #endif
  #endif
  float fineN = 0.0;
  if (pan.a > 0.01) {
    /* the crust's fine grain: wet patches, sand blown in, drag marks at 1-3 m. Baked at
     * 0.48 m a texel it read as a lattice (A-anti-tile); two rotated lookups here do not */
    vec2 fr = vec2(dot(xz, vec2(0.8, 0.6)), dot(xz, vec2(-0.6, 0.8)));
    fineN = gNoiseT(xz * 0.0625 + 0.17).r * 0.55 + gNoiseT(fr * 0.0371 + 0.53).g * 0.45 - 0.5;
    crust = clamp(crust + fineN * 0.26 * inK, 0.0, 1.0);
    brine = clamp(brine + fineN * 0.34 * inK, 0.0, 1.0);
    // M1a round 3: a pond's open water carries no crust (its cracks drew through the brine in F04)
    crust *= 1.0 - smoothstep(0.72, 0.95, brine);
  }
  /* the crust at 10-60 m (W-08, Janubio): polygon crack ridges 0.8-2.5 m across, rake lines
   * along the field, footprints and drag on the paths, wet and dry patches: a worked surface */
  float crustDet = 0.0, rake = 0.0, crack = 0.0, pits = 0.0;
  #ifndef CAL_P_NOCRUST
  if (crust > 0.05 && dCam < 75.0) {
    float nk = 1.0 - smoothstep(45.0, 75.0, dCam);
    vec3 vp = gVoro(xz * 0.62 + fineN * 0.9);
    crack = (1.0 - smoothstep(0.0, 0.09 + 0.05 * (1.0 - nk), vp.x)) * nk;
    vec2 fu = uFieldU, fv = vec2(-uFieldU.y, uFieldU.x);
    /* M1a round 3 fix (the in-cell top-down's 0.34 at 2.64 m along the field: a straight sinusoid correlates with itself
     * at any offset along its own lines): each furrow wanders a third of its spacing over a metre or two (two turned
     * reads at incommensurate scales, so no read's own repeat carries it), and the rake marks lie in patches */
    /* (past 35 m a furrow is a pixel or two: the three reads stop there, so the pans in F02 pay them only near) */
    float rWob = 0.0, rPatch = 1.0;
    if (dCam < 35.0) {
      vec2 rS = vec2(dot(xz, vec2(0.8, 0.6)), dot(xz, vec2(-0.6, 0.8))), rT = vec2(dot(xz, vec2(0.276, 0.961)), dot(xz, vec2(-0.961, 0.276)));
      float rNear = 1.0 - smoothstep(25.0, 35.0, dCam);
      rWob = (gNoiseT(rS * 0.47 + 0.29).r + gNoiseT(rT * 0.33 + 0.61).g - 1.0) * rNear;
      rPatch = mix(1.0, smoothstep(0.3, 0.6, gNoiseT(rT * 0.061 + 0.47).a), rNear);
    }
    float rk = dot(xz, fv) * 1.65 + gNoiseT(xz * 0.013).r * 2.2 + rWob * 0.9;
    rake = (0.5 + 0.5 * sin(rk * 6.2831853)) * nk * smoothstep(0.35, 0.8, crust) * rPatch;
    crustDet = (vp.z - 0.5) * 0.16 * nk;            // each polygon its own tone
    /* Janubio's trampled crust: shallow pits, footprints and drag, 0.3-0.5 m apart, to 35 m. M1a round 2: soft-edged
     * blots from two reads of the periodic noise, irregular and of mixed size; the Voronoi discs they replace, each
     * kept or dropped by its own cell's hash, were cut along straight bisectors where two overlapped (the round stamp
     * blotches with flat sides in F04), and cost a 3 x 3 cell search per pixel */
    if (dCam < 35.0) {
      #ifndef CAL_P_NOPITS
      float pn = gNoiseT(xz * 0.31 + vp.xy * 0.05 + 0.23).b * 0.65 + gNoiseT(xz * 0.157 + 0.61).a * 0.35;
      pits = smoothstep(0.6, 0.74, pn) * (1.0 - smoothstep(22.0, 35.0, dCam));
      #endif
    }
  }
  #endif
  float wRock = max(mA.g, smoothstep(0.62, 1.05, slope));
  float wSalt = crust * (1.0 - wRock) * (1.0 - brine * 0.4);
  // a cell's floor is pan silt wherever it is not crust: never dune sand with its ripples
  float wSilt = max(max(mA.a, brine * 0.85 * (1.0 - crust)), (1.0 - wSalt) * inK) * (1.0 - wRock);
  float wPeb = mA.b * (1.0 - wSalt) * (1.0 - wRock);
  float wSand = clamp(1.0 - wSalt - wRock - wSilt - wPeb, 0.0, 1.0);
  float w[5];
  w[0] = wSand; w[1] = wSalt; w[2] = wRock; w[3] = wSilt; w[4] = wPeb;
  for (int z = 0; z < 2; z++) {
    int lo = -1; float lv = 2.0;
    for (int i = 0; i < 5; i++) if (w[i] > 0.0 && w[i] < lv) { lv = w[i]; lo = i; }
    if (lo < 0) break;
    int n = 0;
    for (int i = 0; i < 5; i++) if (w[i] > 0.0) n++;
    if (n <= 3) break;
    w[lo] = 0.0;
  }

  /* -- anti-tile: one of 8 offsets per region, seams blended on contrast ---- */
  float tk = nMac.g * 8.0;
  float tia = floor(tk), tf = fract(tk);
  vec2 offA = sin(vec2(3.0, 7.0) * tia), offB = sin(vec2(3.0, 7.0) * (tia + 1.0));
  vec2 dpx = dFdx(xz), dpy = dFdy(xz);
  float nearK = 1.0 - smoothstep(55.0, 140.0, dCam);
  float slopeT = smoothstep(0.35, 0.55, slope);
  /* past 190 m a normal map's mips are its own mean: the per-layer mean (measured off the
   * shipped _n textures) stands in for the fetch, faded in over 150-190 m so no seam shows.
   * At the Pans vista that is most of the frame: it is the ground's largest GPU saving. */
  float farN = smoothstep(G_FARN0, G_FARN1, dCam);

  /* M1a round 2 (M1.1e: black sand repeated at its 3 m tile, autocorrelation 0.61 in a 40 m top-down; basalt 0.48 at its
   * 7 m tile): the sand's and the flat basalt's reads are displaced by a smooth field of up to about 0.7 m (2.5-5 m
   * cells), so a tile never lines up with itself a tile away; ripples and joints bend a little with it */
  #ifdef CAL_CAPTURE_LAYER
  /* the M1.1e material capture (tools/perf/meadow-page.mjs topDown { layer }): one layer alone, no overlays */
  for (int i = 0; i < 5; i++) w[i] = i == CAL_CAPTURE_LAYER ? 1.0 : 0.0;
  wSalt = w[1]; wRock = w[2]; mB = vec4(0.0); sh.a = 0.0; brine = 0.0;
  #endif
  #ifdef G_R1
  bool gSkip = false;
  #else
  bool gSkip = mB.a > 0.5 && smoothstep(0.02, 0.6, mB.a) * (1.0 - wSalt) * (1.0 - wRock) > 0.985;
  #endif
  vec2 sWarp = vec2(0.0);
  /* M1a round 3 (F04 and the 1 m swatches: the black sand and the flat basalt read as wood grain and marble, the ripples
   * bent round 2.5-5 m whorls): the displacement is a broad field (16-40 m cells) of up to about 1.3 m, which still moves
   * each 3 m tile off its neighbour by 0.3-0.9 m but bends a ripple no tighter than a dune does */
  /* (M1a debt: paired with the look off at 5f79f50 the warp cost F02 0.5 ms, iqr 0.2-0.8, where no black sand is near) it
   * runs to 60 m, faded over 40-60 m: past that a 3 m tile is a few pixels and its repeat is the field's to hide */
  #ifndef CAL_P_NOWARP
  if (!gSkip && (w[0] > 0.012 || w[2] > 0.012) && dCam < 60.0) { vec4 nw = gNoiseT(xz * 0.025 + 0.77); sWarp = ((nw.rg - 0.5) * vec2(2.6, 2.2) + (nw.ba - 0.5) * vec2(0.5, 0.4)) * (1.0 - smoothstep(40.0, 60.0, dCam)); }
  #endif
  vec3 col = vec3(0.0), pert = vec3(0.0);
  float hMax = -9.0, wTot = 0.0, rSum = 0.0, aoSum = 0.0;
  vec4 keepA[3]; vec4 keepN[3]; float keepW[3]; int keepI[3]; int nKeep = 0;
  for (int i = 0; i < 5; i++) {
    if (gSkip || hSkip) break;
    if (w[i] < 0.012) continue;
    float sc = gScale(i);
    vec2 uv = (i == 0 || i == 2 ? xz + sWarp : xz) * sc, gx = dpx * sc, gy = dpy * sc;
    /* M1a fix round (F04's crust ridges in stair steps at 2-3 m): magnified past 1.7 px a texel, the salt normals' steep
     * plate ridges showed their texels and compression blocks under the sun's highlight. Where a texel is magnified the
     * normal reads take mip 1 (the gradient raised to two texels a pixel), so a ridge is a smooth fold; the albedo keeps mip 0 */
    vec2 gxN = gx, gyN = gy;
    if (i == 1) { float kM = max(1.0, 2.0 / max(max(length(gx), length(gy)) * 1024.0, 1e-3)); gxN *= kM; gyN *= kM; }
    vec4 a, nn;
    if (i == 2 && slopeT > 0.0) {
      /* triplanar: basalt on real slopes only */
      vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      vec3 dpxz = dFdx(vWPos), dpyz = dFdy(vWPos);
      vec2 ux = vWPos.zy * sc, uz = vWPos.xy * sc;
      vec4 ax = gA(2, ux, dpxz.zy * sc, dpyz.zy * sc), ay = gA(2, uv + offA, gx, gy), az = gA(2, uz, dpxz.xy * sc, dpyz.xy * sc);
      a = ax * bw.x + ay * bw.y + az * bw.z;
      nn = vec4(0.0, 0.0, 0.801, 0.905);
      if (farN < 1.0) {
        vec4 nx = gNm(2, ux, dpxz.zy * sc, dpyz.zy * sc), ny = gNm(2, uv + offA, gx, gy), nz = gNm(2, uz, dpxz.xy * sc, dpyz.xy * sc);
        vec2 tx = nx.xy * 2.0 - 1.0, ty = ny.xy * 2.0 - 1.0, tz = nz.xy * 2.0 - 1.0;
        pert += (vec3(0.0, tx.y, tx.x) * bw.x + vec3(ty.x, 0.0, ty.y) * bw.y + vec3(tz.x, tz.y, 0.0) * bw.z) * w[i] * 0.95 * (1.0 - farN);
        nn = mix(vec4(0.0, 0.0, nx.z * bw.x + ny.z * bw.y + nz.z * bw.z, nx.a * bw.x + ny.a * bw.y + nz.a * bw.z), nn, farN);
      }
    } else {
      vec2 uv0 = i == 1 ? uv + offA : uv;
      a = gA(i, uv0, gx, gy);
      nn = vec4(0.5, 0.5, i == 0 ? 0.877 : i == 1 ? 0.686 : i == 2 ? 0.801 : i == 3 ? 0.539 : 0.631, 0.905);
      if (farN < 1.0) nn = mix(gNm(i, uv0, gxN, gyN), nn, farN);
      #ifndef CAL_P_NOSALT2
      if (i == 1 && dCam < G_SEC1) {
        #ifdef G_R1
        float kS2 = 0.5;
        #else
        float kS2 = 0.5 * (1.0 - smoothstep(G_SEC0, G_SEC1, dCam));
        #endif
        /* salt: the crust fills whole 20-40 m cells, so any one tile's repeat lines up along a
         * cell (A-anti-tile). A second lookup, rotated 37 degrees at 0.61 of the scale, is always
         * half the read: two incommensurate repeats, neither strong. Its normal is turned back. */
        mat2 Mr = mat2(0.8, 0.6, -0.6, 0.8);
        vec2 uvR = Mr * uv * 0.61 + offB, gxR = Mr * gx * 0.61, gyR = Mr * gy * 0.61;
        a = mix(a, gA(1, uvR, gxR, gyR), kS2);
        if (farN < 1.0) {
          vec4 n2 = gNm(1, uvR, Mr * gxN * 0.61, Mr * gyN * 0.61);
          n2.xy = (vec2(dot(n2.xy * 2.0 - 1.0, Mr[0]), dot(n2.xy * 2.0 - 1.0, Mr[1]))) * 0.5 + 0.5;
          nn = mix(nn, mix(n2, vec4(0.5, 0.5, 0.686, 0.905), farN), kS2);
        }
      } else
      #endif
      #ifndef CAL_P_NOL2
      if (i != 1 && w[i] > 0.12 && dCam < G_SEC1) {     // past 240 m the mips are a few texels: a second read buys nothing
        /* M1.1e anti-tile (fix round 1): one tile and a per-region offset still repeated inside each region (black
         * sand 0.61 at its 3 m tile in a 40 m top-down). Two incommensurate reads at half each, the second turned and
         * scaled (sand only a little, so its ripples keep the wind's direction): no region seams, and either repeat
         * carries a quarter of the variance. The normals' deviation is restored by 1/|f|, so the ripples keep relief. */
        float ang = i == 0 ? 0.2 : 0.65, k2 = i == 0 ? 0.71 : 0.61;
        float cs = cos(ang), sn = sin(ang);
        mat2 Mr = mat2(cs, sn, -sn, cs);
        vec2 uvR = Mr * uv * k2 + vec2(0.37, 0.73), gxR = Mr * gx * k2, gyR = Mr * gy * k2;
        float f2 = 0.5 * smoothstep(0.12, 0.24, w[i]) * (1.0 - smoothstep(G_SEC0, G_SEC1, dCam));
        a = mix(a, gA(i, uvR, gxR, gyR), f2);
        if (nearK > 0.0) {
          vec4 n2 = gNm(i, uvR, gxR, gyR);
          n2.xy = (vec2(dot(n2.xy * 2.0 - 1.0, Mr[0]), dot(n2.xy * 2.0 - 1.0, Mr[1]))) * 0.5 + 0.5;
          vec4 nm = mix(nn, n2, f2 * nearK);
          nm.xy = 0.5 + (nm.xy - 0.5) / length(vec2(1.0 - f2 * nearK, f2 * nearK));
          nn = nm;
        }
      }
      #else
      {}
      #endif
    }
    keepA[nKeep] = a; keepN[nKeep] = nn; keepW[nKeep] = w[i]; keepI[nKeep] = i; nKeep++;
    if (nKeep == 3) break;
  }
  if (gSkip) { col = vec3(0.04); rSum = 0.877; aoSum = 0.81; }   // the sand layer's means: the meadow's tone replaces the colour below
  float hBest = -9.0;
  for (int k = 0; k < nKeep; k++) hBest = max(hBest, (keepA[k].a * 2.0 - 1.0) + keepW[k] * 1.6);
  float bs = 1e-4; float bl[3];
  for (int k = 0; k < nKeep; k++) {
    bl[k] = max((keepA[k].a * 2.0 - 1.0) + keepW[k] * 1.6 - hBest + 0.28, 0.0);
    bs += bl[k];
  }
  for (int k = 0; k < nKeep; k++) {
    float b = bl[k] / bs;
    vec3 c = pow(keepA[k].rgb, vec3(2.2));
    // the storm-beach cobbles and the pan silt are the island's basalt too: dark, never a grey beach
    if (keepI[k] == 4) c *= 0.5;
    else if (keepI[k] == 3) c *= 0.78;
    /* M1a round 2: the basalt layer toward the dusk crop (F05's shelf read L* 20-24 against the crop's ~36): the
     * texture's graphite (mean about sRGB 0x40, 0.05 linear) to weathered, dusty basalt at about 0.1 linear */
    /* (round 3 fix: the basalt at 1 m read pale lilac, L* 47) a shade darker, 1.9 -> 1.5 */
    else if (keepI[k] == 2) c *= 1.5;
    if (keepI[k] == 1) {
      /* M1a fix round (M1.1e, F04 against the swatch: the crust read a smooth pink glaze, b* 8.1 against the swatch's 1.1,
       * L* 64.8 against 48.9): the texture's cream keeps 45 % of its chroma, the cell's pink reaches the crust at 40 % of its
       * old strength (brine keeps its own, below), and the crust is a shade lower: white salt, grey in its grain */
      /* M1a round 3 (M1.1e: the crust at 1 m read b* 4.9 against the swatch's ~1, F04 a milky pink-grey): the texture's cream
       * keeps 15 % of its chroma (was 45), a white cell's crust takes no pink (the cell's pink starts at hue 0.15) and a
       * hair of cool, so raked salt reads white under the noon sun */
      /* (round 3 fix: F04 36.9 % against the bar's 40, the crust at 1 m b* 3.1 against ~1 and a blurry grey plaster) a
       * shade brighter (0.9 -> 0.97), cooler on a white cell, and less of the grey mottle below */
      /* (M1a debt: F04 34.7 % at fb6d5f0 against the bar's 40, the crust b* 2 against about 1) the gain and the cool are
       * uCrust (terrain.js CRUST), measured as variants */
      c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.1) * 0.97 * uCrust.x;
      /* salt runs white → brine pink → crystalliser rust, by cell */
      float hue = pan.b;
      vec3 tintC = hue < 0.5 ? mix(vec3(1.0), vec3(0.93, 0.62, 0.52), smoothstep(0.15, 0.5, hue) * 0.4)
                             : mix(vec3(0.97, 0.85, 0.81), vec3(0.42, 0.13, 0.08), (hue - 0.5) * 2.0);
      c *= tintC * mix(vec3(1.0 - 0.055 * uCrust.y, 1.0 - 0.01 * uCrust.y, 1.0 + 0.075 * uCrust.y), vec3(1.0), smoothstep(0.1, 0.3, hue));
      /* (M1a debt fix round 1: F04's palette 15.6 at 49aae31 against the bar's 12, the crust boxes L* 74-85 a* 0.9 against
       * the swatch's 56.2 6.5 0.4: the swatch's crust is a rose-grey bed of crystals, not chalk) the rose-grey of the
       * swatch, its linear ratio 1 : 0.78 : 0.83 against the frame's 1 : 0.96 : 0.94, by uCrust.z */
      c *= mix(vec3(1.0), vec3(1.0, 0.82, 0.86), uCrust.z);
      // and the grain in the crust's own tone: the texture repeats, this does not
      c *= 1.0 + fineN * 0.22;
      // polygons, their raised white rims with a grey crack in each, and the rake's furrows
      c *= 1.0 + crustDet - rake * 0.12;
      c = mix(c, c * vec3(0.62, 0.6, 0.58), crack * 0.32);
      c *= 1.0 - 0.2 * pits;
      // wet crust: big damp patches go grey and dull, dry ones stay chalk
      float dampC = smoothstep(0.55, 0.8, gNoiseT(xz * 0.0053 + 0.41).g);
      c *= mix(1.0, 0.86, dampC * (1.0 - crack));
    }
    col += c * b;
    if (!(keepI[k] == 2 && slopeT > 0.0)) {
      vec2 t = keepN[k].xy * 2.0 - 1.0;
      pert += vec3(t.x, 0.0, t.y) * b;
    }
    rSum += keepN[k].z * b;
    aoSum += (keepN[k].a * 2.0 - 1.0) * b;
  }
  pert *= mix(0.32, 1.0, nearK);
  ${HOLDS_TERM}
  /* M1a fix round (M1.1e: the swatch's crust is granular, crystals and clods 2-20 cm with dark gaps between them; F04 read a
   * glaze): within 12 m the crust takes a grain, crystal grit at about 3 cm and clods at about 15 cm, each darkening its
   * gaps and tilting the lit faces. Past 12 m it is under a pixel and the texture's own grit carries it */
  #ifndef CAL_P_NOGRAIN
  if (wSalt > 0.05 && dCam < 12.0 && !gSkip) {
    float sk = (1.0 - smoothstep(6.0, 12.0, dCam)) * wSalt * (1.0 - brine * 0.8);
    /* each read of the field noise repeats every 1/scale m: two turned reads at incommensurate scales for the clods, so no
     * one repeat carries more than half the grain (the first pass's single clod read showed at 4.77 m in the top-down) */
    vec2 xzS = vec2(dot(xz, vec2(0.8, 0.6)), dot(xz, vec2(-0.6, 0.8))), xzT = vec2(dot(xz, vec2(0.276, 0.961)), dot(xz, vec2(-0.961, 0.276)));
    vec4 gA4 = gNoiseT(xzS * 0.53 + 0.19), gB4 = gNoiseT(xzS * 0.104 + 0.63), gC4 = gNoiseT(xzT * 0.0893 + 0.37);
    /* (round 3 fix: the grit's one read repeated at 2.6 m in the in-cell top-down, 0.34) a second, turned the other way at an
     * incommensurate scale, half each */
    vec4 gD4 = gNoiseT(xzT * 0.71 + 0.83);
    /* (fix round, second pass: at 1 m the crust read L* 84 against the swatch's 55 and the grain barely showed) the gaps
     * between grains go dark: a sharper grit and clod mask, 0.3 in a gap to 1.05 on a crystal, mean about 0.7 */
    float grit = smoothstep(0.3, 0.7, 0.5 * gA4.a + 0.5 * gD4.b), clod = smoothstep(0.3, 0.7, 0.5 * gB4.a + 0.5 * gC4.a);
    float sGrain = grit * 0.45 + clod * 0.55;
    // (round 3: F04's mean luminance 32 % against the bar's 40) the gaps a shade less deep: 0.45 to 1.05, mean about 0.8
    // (round 3 fix) shallower still: 0.62 to 1.04, mean about 0.88
    /* (M1a debt fix round 1: the crust at 1 m read smooth plaster with dark dots, 25.4 dE2000 from the swatch) the gaps go
     * back down by uCrust.w: 0.62 to 1.04 at 0, 0.32 to 1.10 at 1, so the crystals stand out of dark gaps as the swatch's do */
    col *= mix(1.0, mix(0.62, 0.32, uCrust.w) + mix(0.42, 0.78, uCrust.w) * sGrain, sk);
    pert += vec3(gA4.b + gB4.b - 1.0, 0.0, gD4.g + gC4.b - 1.0) * 0.45 * sk;
    /* (a 1-2 cm crystal bed from gVoro(xz * 62) was tried at a000205 and taken out: at 1 m it read as a regular honeycomb of
     * equal cells with a straight shear in it, the cell hash losing precision at coordinates near 20,000) */
  }
  #endif

  /* -- the field at range (W-11, Janubio): the dykes are the field's drawing, so past 50 m a
   *    dyke strip is darkened and widened with distance (its stone is sub-pixel there), and
   *    round the field the ground carries salt stains and dead cells, never a clean rug edge -- */
  #ifndef CAL_P_NOFIELD
  if (pan.a < 0.6 && dCam > 45.0 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
    float wd = (0.7 + dCam * 0.0075) * uPanBox.z;
    float nb = max(max(gPanT(puv + vec2(wd, 0.0)).a, gPanT(puv - vec2(wd, 0.0)).a),
                   max(gPanT(puv + vec2(0.0, wd)).a, gPanT(puv - vec2(0.0, wd)).a));
    float dyk = smoothstep(0.35, 0.75, nb) * (1.0 - inK) * smoothstep(45.0, 110.0, dCam);
    col *= mix(1.0, 0.42, dyk);
  }
  #endif
  if (sh.a > 0.01) {
    // the field's halo: salt-stained silt, scalded patches, a ghost of a cell (bake: shore.a)
    float st = sh.a * smoothstep(0.45, 0.75, nMac.g * 0.6 + gNoiseT(xz * 0.047 + 0.2).r * 0.4);
    col = mix(col, vec3(0.42, 0.40, 0.37) * (0.7 + 0.5 * macA), st * 0.55 * (1.0 - wRock));
  }

  /* -- the macro read: nothing is one flat value from 200 m ----------------- */
  col *= 0.8 + 0.42 * macA;
  // wind-pale sand on crests, damp dark hollows
  float pale = smoothstep(0.46, 0.7, nMac.r) * smoothstep(0.2, 2.6, vWPos.y);
  col *= 1.0 + 0.4 * pale * w[0] - 0.42 * mB.b * w[0];
  if (w[0] > 0.02 && !gSkip) {
    /* the black sand from far off: fabric drawn out along the trade wind, warmer ash in broad
     * patches, and past the plants' range the colonies and the scrub as tone in the ground */
    vec2 wv = vec2(dot(xz, vec2(0.7071, -0.7071)), dot(xz, vec2(0.7071, 0.7071)));
    vec4 nStreak = gNoiseT(vec2(wv.x * 0.0106, wv.y * 0.00137));
    float streak = nStreak.r * 0.6 + nStreak.b * 0.4;
    vec4 nAsh = gNoiseT(xz * 0.00116 + 0.31);
    float ash = smoothstep(0.42, 0.78, nAsh.r * 0.7 + nAsh.b * 0.3);
    // black sand stays black (W-07, bible 0.02-0.05 linear): structure, not a lift
    vec3 sandTone = mix(vec3(1.0), vec3(1.14, 1.09, 1.04), ash) * (0.74 + 0.34 * streak);
    float farK = smoothstep(40.0, 170.0, dCam);
    float scrub = smoothstep(0.54, 0.8, nMac.a * 0.6 + nMac.b * 0.4);
    vec3 sandCol = col * sandTone;
    sandCol = mix(sandCol, vec3(0.05, 0.046, 0.03), scrub * 0.6 * farK);
    sandCol = mix(sandCol, vec3(0.17, 0.15, 0.078), mB.r * farK * 0.8);
    sandCol = mix(sandCol, vec3(0.12, 0.095, 0.15), mA.r * farK * (0.18 + 0.3 * nMac.a));
    col = mix(col, sandCol, smoothstep(0.02, 0.5, w[0]));
  }
  /* the golden meadow (W-06 R3, M1.1b): past the cards' ring (80 m, island/meadow.js) it is the ground's own tone,
   * cerrillo gold #C9A04E-#D9B060 in drifts, a ±8 % wind wave running toward 225°, violet speckle where the
   * viborina clumps; inside the rings the ground under the blades is the blades' own foot colour (TECH §5), so a gap
   * between blades reads as shade in grass, never as soil */
  float canopy = 0.0;
  if (mB.a > 0.01) {
    float mk = smoothstep(0.02, 0.6, mB.a) * (1.0 - wSalt) * (1.0 - wRock);
    float farG = smoothstep(52.0, 82.0, dCam);
    vec4 gn = gNoiseT(xz * 0.0071 + 0.13);
    vec3 grass = mix(vec3(0.578, 0.352, 0.074), vec3(0.694, 0.431, 0.117), gn.r);   // #C9A04E..#D9B060
    float wave = sin(dot(xz, vec2(-0.7071, -0.7071)) * 0.21 + uTime * 1.3 + gn.g * 3.0);
    grass *= 0.62 * (1.0 + 0.08 * wave) * (0.72 + 0.5 * gn.b);
    float clump = smoothstep(0.66, 0.8, gNoiseT(xz * 0.0187 + 0.61).a);
    vec3 grassNoVio = grass;
    grass = mix(grass, vec3(0.20, 0.10, 0.30), clump * 0.4 * smoothstep(0.4, 0.7, gn.a));
    float gTone = 1.0;
    // dark culms and gaps between the drifts read as texture from the rim, never a flat fill
    // two incommensurate, turned reads: one read of the periodic noise repeated every 16.4 m (M1.1e tiling check)
    #ifndef CAL_P_NOMTONE
    vec2 xzR = vec2(dot(xz, vec2(0.8, 0.6)), dot(xz, vec2(-0.6, 0.8)));
    /* M1a fix round (M1.1e): inside the meadow (a 40 m square wholly in it) the tone repeated at 16.4 m (autocorrelation
     * 0.37 at (16.41, 0) m): the field noise repeats every 1/scale metres, and the b read at 0.061 was the drifts' main
     * read. Now every read repeats past 20 m: two a reads (64 cells a period: 0.36 and 0.33 m blots, periods 22.9 and
     * 21.3 m) turned 37 and 74 deg, and a b read for the drifts (1.7 m, period 54 m), on a softer ramp */
    vec2 xzR2 = vec2(dot(xz, vec2(0.276, 0.961)), dot(xz, vec2(-0.961, 0.276)));
    gTone = 0.68 + 0.42 * smoothstep(0.2, 0.8, 0.42 * gNoiseT(xzR * 0.0437 + 0.29).a + 0.33 * gNoiseT(xzR2 * 0.047 + 0.11).a
                                                + 0.25 * gNoiseT(xz * 0.0185 + 0.53).b);
    grass *= gTone;
    #endif
    vec3 litter = vec3(0.17, 0.112, 0.02) * (0.82 + 0.3 * gn.b);   // meadow.js: the blade's foot colour, a shade lit
    vec3 grassL = mix(grass, grassNoVio * gTone, uGroundR2.y);
    /* M1.1b fix round 1: under the clumps' ring (10-30 m) a gap shows the clumps' own mid tone, not the dark foot:
     * blade against gap is the contrast that crawls when the lens moves */
    litter = mix(litter, grassL * 0.78, 0.55 * smoothstep(8.0, 30.0, dCam));
    /* and within the blades' ring the gap is the stand's lower golden straw (light through and off the blades),
     * not its darkest foot: a dark gap falls under the grade's violet floor and reads as soil (M1.1b soil line) */
    litter = mix(litter, grassL * 0.85, 0.75 * (1.0 - smoothstep(8.0, 30.0, dCam)));
    col = mix(col, mix(litter, grass, farG), mk);
    canopy = mk * (1.0 - farG);
    pert *= 1.0 - mk * mix(0.75, 0.5, farG);
  }
  // packed tracks: pale, smooth, salt-dusted
  if (mB.g > 0.01) {
    float tr = smoothstep(0.1, 0.8, mB.g) * (0.6 + 0.4 * macA);
    col = mix(col, vec3(0.152, 0.124, 0.088) * (0.6 + 0.6 * gNoiseT(xz * 0.031).b), tr * 0.8);   // warm dust, not grey
    pert *= 1.0 - 0.6 * tr;
    rSum = mix(rSum, 0.82, tr);
  }
  // duff under marram: the ground darkens where the colonies stand
  col *= 1.0 - 0.24 * mB.r;

  /* -- the blockout tint: red crater, and biomes 2-6 ------------------------- */
  /* (M2 wave 2) the Holds' blockout tint gives way to their ground; the crater's bedding is never drawn on them */
  float tk0 = vTint.a * (1.0 - hold);
  if (tk0 > 0.004) {
    float g = clamp(dot(col, vec3(0.33)) / 0.02, 0.55, 1.5);
    col = mix(col, vTint.rgb * g * (0.82 + 0.36 * macA), tk0 * (1.0 - 0.6 * wRock));
  }

  /* M1.1a: the strata are drawn live in the far field too (FAR_COLOR): a top-down bake at 1 m a texel cannot
   * hold a band 1.7 m tall on a near-vertical face, so the bake leaves them out */
  #ifndef CAL_FAR_BAKE
  ${STRATA_TERM}
  #endif

  /* -- rills: every real slope is scored down its fall line (gullies on the ring, wash on the
   *    knolls); from 300 m a smooth tinted hill is what reads as CG, a scored one does not -- */
  float rillK = smoothstep(0.16, 0.55, slope) * (1.0 - wSalt);
  #ifdef CAL_P_NORILL
  rillK = 0.0;
  #endif
  if (rillK > 0.01) {
    vec2 fall = normalize(wn.xz + vec2(1e-5));
    vec2 q = vec2(dot(xz, vec2(-fall.y, fall.x)), dot(xz, fall));
    float rill = gNoiseT(vec2(q.x * 0.0131, q.y * 0.0019)).b * 0.7 + gNoiseT(vec2(q.x * 0.031, q.y * 0.0047) + 0.37).a * 0.3;
    col *= mix(1.0, 0.66 + 0.62 * rill, rillK * 0.85);
  }

  /* -- the ground at a pace (V32): pebbles at 6-15 cm and grit at 2-3 cm on sand, silt and
   *    shingle, each pebble with a lit and a shaded side; gone by 16 m, where they are sub-pixel */
  #ifndef CAL_P_NOPEB
  /* M1a fix round (F04's round half-lit discs with straight cuts): the pebbles were laid on the pans' cells too, wherever
   * brine pulled the crust's weight under 0.6, and each took its tilt from the SQUARE grid cell under the pixel, not its own
   * Voronoi cell, so a disc that crossed a grid line was lit on one side of it and shaded on the other. A cell's floor (crust,
   * brine or silt) has no pebbles now, and a pebble's tilt is its own cell's hash */
  if (dCam < 16.0 && wSalt < 0.6 && inK < 0.98 && !gSkip) {
    /* (round 3 fix: the basalt at 1 m read as polka dots, the pebbles' pale discs laid on bare rock) no pebble on rock */
    float gk = (1.0 - smoothstep(9.0, 16.0, dCam)) * (1.0 - wSalt) * (1.0 - smoothstep(0.15, 0.5, wRock)) * (1.0 - canopy) * (1.0 - inK) * (1.0 - 0.7 * hk);
    vec3 pb = gVoro(xz * 9.0);
    // M1a round 2: a pebble fades out before its cell's edge, so two overlapping discs never meet on a straight cut
    float peb = smoothstep(0.42, 0.3, pb.y) * smoothstep(0.02, 0.16, pb.x) * step(0.58, pb.z) * gk;
    float pa = pb.z * 40.7;
    vec2 pd = vec2(cos(pa), sin(pa)) * (0.22 + 0.28 * fract(pb.z * 17.3));
    col = mix(col, col * (0.6 + 0.9 * pb.z) + vec3(0.012, 0.011, 0.01) * pb.z, peb * 0.7);
    pert += vec3(pd.x, 0.0, pd.y) * peb * 0.9;
    float grit = gNoiseT(xz * 0.83).a * 0.6 + gNoiseT(xz * 1.71 + 0.3).b * 0.4;
    col *= 1.0 + (grit - 0.5) * 0.42 * gk;
  }
  #endif

  /* -- liquid: brine mirrors, the swash zone is wet black glass -------------- */
  float coast = sh.r * 64.0 - 48.0;
  float tide = uSea + 0.26 + 0.09 * sin(uTime * 0.42 + xz.x * 0.03 + xz.y * 0.021);
  float wetSea = (1.0 - smoothstep(tide, tide + 0.34, vWPos.y)) * (1.0 - smoothstep(2.5, 8.5, coast));
  // the Glass's margin: a damp band a few metres wide that dries into the sand, no hard ring
  float wetGlass = sh.b * (1.0 - smoothstep(0.17, 0.46, vWPos.y)) * (0.55 + 0.45 * smoothstep(0.3, 0.7, nMac.b));
  /* M1a round 3 (M1.1e "black sand with a wet band"): a dyke's sand is wet and dark in a band a metre wide along a brine
   * pond (the brine creeps into it), read off the pond's brine a metre either side across the dyke */
  float wetDyke = 0.0;
  #ifndef CAL_P_NOWETD
  if (inK < 0.6 && dCam < 60.0 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) {
    vec2 fvT = vec2(-uFieldU.y, uFieldU.x) * (1.15 * uPanBox.z);
    float gB = max(gPanT(puv + fvT).g, gPanT(puv - fvT).g);
    wetDyke = smoothstep(0.18, 0.5, gB) * (1.0 - inK) * (1.0 - wRock);
  }
  #endif
  float wet = max(max(wetSea, wetGlass), wetDyke);
  // a wet ground is dark and flat; brine is thin water on crust, pink where it evaporates
  col *= mix(1.0, 0.42, wet);
  gLiquid = max(wet * 0.62, brine);
  if (brine > 0.004) {
    float hue = pan.b;
    // (round 3 fix: the pond's edge read peach, hue 50 deg) the evaporating film is rose: more red than yellow over the crust
    vec3 water = mix(vec3(0.52, 0.56, 0.58), vec3(0.74, 0.45, 0.48), smoothstep(0.1, 0.5, hue));
    water = mix(water, vec3(0.34, 0.12, 0.08), smoothstep(0.55, 0.95, hue));
    /* M1a round 3 (M1.1e "brine cells that mirror the sky"): open water is dark under its surface, so the sky's
     * reflection carries it; only the drying margin keeps the pale pink of the crust under a film */
    water = mix(water, vec3(0.1, 0.11, 0.115), smoothstep(0.75, 0.95, brine) * 0.8);
    /* (round 3 fix: both brine swatches at 1 m read cracked crust, the floor showing through at 38 %) open water covers its
     * floor; the film over the drying margin stays thin */
    col = mix(col, water * (0.72 + 0.4 * macA), mix(brine * 0.62, 1.0, smoothstep(0.7, 0.92, brine)));
  }
  pert *= 1.0 - gLiquid * 0.86;
  // fine black sand has a sheen at a low angle: the sky in it, and the ripples through it
  gLiquid = max(gLiquid, 0.025 * smoothstep(0.1, 0.7, w[0]));
  gRough = mix(clamp(rSum, 0.25, 1.0), mix(0.3, 0.07, smoothstep(0.3, 0.9, brine)), gLiquid);
  gAO = mix(1.0, clamp(aoSum, 0.0, 1.0), 0.78);
  col *= mix(1.0, clamp(aoSum * 1.08, 0.0, 1.0), 0.4);
  /* M1.1b fix round 1: the ground under the blades sees little of the (violet) sky and has no sheen: the sky in the
   * black sand's grazing sheen and the open-sky fill turned the meadow's gaps rose-grey (the soil-coloured pixels) */
  /* (measured: darkening the gaps further, sun and sky blocked at the roots, sent them under the grade's blue-violet
   * floor: soil-coloured 2.1 -> 3.5 %. The gaps are lit; their colour is the stand's own, above) */
  gAO *= 1.0 - 0.3 * canopy;
  gLiquid *= 1.0 - canopy;
  gRough = mix(gRough, 1.0, canopy);

  /* -- the long shadows: the land's own, and past the cascades the dykes' ------ */
  gSunVis = gSkylineVis(xz);
  if (pan.a > 0.01 && dCam > 70.0) {
    // a dyke is ≈ 0.4 m tall: a band of shadow on the side away from the light
    float L = min(0.42 / max(uSunTan, 0.08), 4.5);
    vec2 toSun = uSunXZ * L * uPanBox.z;
    float behind = min(gPanT(puv + toSun).a, gPanT(puv + toSun * 0.5).a);
    gSunVis *= mix(1.0, smoothstep(0.1, 0.72, behind), smoothstep(70.0, 110.0, dCam));
  }

  /* -- rain (world-sky's calWeather.x): the flats darken and shine ----------- */
  #ifdef USE_FOG
  {
    float rainW = clamp(calWeather.x, 0.0, 1.0);
    if (rainW > 0.002) {
      float pool = 1.0 - smoothstep(0.0, 0.35, slope);
      col *= 1.0 - 0.34 * rainW * (0.45 + 0.55 * pool);
      gRough *= 1.0 - 0.55 * rainW * pool;
    }
  }
  #endif
  // 0.03-0.85 linear (bible §9.2): salt clamps, the blacks keep a floor
  diffuseColor.rgb = clamp(col, vec3(0.012), vec3(0.85));
  gN = pert;
}
#undef G_CUBIC_D
#undef G_FARN0
#undef G_FARN1
#undef G_SEC0
#undef G_SEC1
#ifdef G_R1
#undef G_R1
#endif
#endif
`;

/** The rock scatter's material: basalt triplanar, salt on top, wet at the foot. */
export const ROCK_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 wn = normalize(vWNorm);
  vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  float sc = uScale1.z * uRockScale;
  vec2 ux = vWPos.zy * sc, uy = vWPos.xz * sc, uz = vWPos.xy * sc;
  vec3 dx = dFdx(vWPos) * sc, dy = dFdy(vWPos) * sc;
  vec4 a = gA(2, ux, dx.zy, dy.zy) * bw.x + gA(2, uy, dx.xz, dy.xz) * bw.y + gA(2, uz, dx.xy, dy.xy) * bw.z;
  vec4 nx = gNm(2, ux, dx.zy, dy.zy), ny = gNm(2, uy, dx.xz, dy.xz), nz = gNm(2, uz, dx.xy, dy.xy);
  vec2 tx = nx.xy * 2.0 - 1.0, ty = ny.xy * 2.0 - 1.0, tz = nz.xy * 2.0 - 1.0;
  vec3 c = pow(a.rgb, vec3(2.2));
  float mac = gNoiseT(vWPos.xz * 0.012 + vWPos.y * 0.007).b;
  c *= (0.78 + 0.5 * mac) * uRockLift;
  // salt rime settles on what faces up; the foot in the swash is wet and black
  float rime = smoothstep(0.78, 0.99, wn.y) * uRime * smoothstep(0.42, 0.72, mac);
  c = mix(c, vec3(0.5, 0.48, 0.44), rime);
  float wetK = 1.0 - smoothstep(0.02, 0.36, vWPos.y);
  c *= mix(1.0, 0.42, wetK);
  gSunVis = gSkylineVis(vWPos.xz);
  diffuseColor.rgb = c * diffuseColor.rgb;
  gN = (vec3(0.0, tx.y, tx.x) * bw.x + vec3(ty.x, 0.0, ty.y) * bw.y + vec3(tz.x, tz.y, 0.0) * bw.z) * 1.1;
  gRough = mix(nx.z * bw.x + ny.z * bw.y + nz.z * bw.z, 0.22, wetK * 0.8);
  gAO = nx.a * bw.x + ny.a * bw.y + nz.a * bw.z;
  gAO = clamp(gAO * 2.0 - 1.0, 0.0, 1.0);
  gLiquid = wetK * 0.55;
}
`;

export const GROUND_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(gRough, 0.05, 1.0);
`;
export const GROUND_NORMAL = /* glsl */ `
#include <normal_fragment_begin>
normal = normalize(normal + (viewMatrix * vec4(gN, 0.0)).xyz);
`;

/**
 * THE FAR FIELD (M1.1a, TECH §5 lever 4). Past FAR_START a chunk is drawn with one baked albedo and one baked
 * normal instead of the layered shader. terrain.js bakes them once (`_bakeFarField`): the ground material's own
 * colour stage, rendered top-down over the world square at 1 m a texel with `dCam` held at FAR_BAKE_D (every
 * distance fade in TERRAIN_COLOR is saturated there), written out instead of lit. A: albedo (gamma 2.2) and the
 * liquid (brine, wet sand); N: the perturbed world normal's x and z, roughness, AO. The light stays live: the
 * skyline's long shadows, the cascades, the rain, the sky in the brine (GROUND_AO).
 */
export const FAR_BAKE_D = 200.0;
export const FAR_FRAG_PARS = /* glsl */ `
${GROUND_FRAG_PARS}
varying vec4 vTint;
varying vec3 vGround;
uniform sampler2D tFarA;
uniform sampler2D tFarN;
uniform float uFarInv;     // 1 / the baked square's side
uniform float uStrata;
`;
export const FAR_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec2 fuv = vec2(vWPos.x * uFarInv + 0.5, 0.5 - vWPos.z * uFarInv);
  vec4 fa = texture2D(tFarA, fuv), fn = texture2D(tFarN, fuv);
  vec2 nxz = fn.rg * 2.0 - 1.0;
  vec3 nW = vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.0)), nxz.y);
  gN = nW - normalize(vWNorm);
  gRough = fn.b;
  gAO = fn.a;
  gLiquid = fa.a;
  gSunVis = gSkylineVis(vWPos.xz);
  vec3 col = pow(fa.rgb, vec3(2.2));
  #ifdef USE_FOG
  {
    float rainW = clamp(calWeather.x, 0.0, 1.0);
    if (rainW > 0.002) {
      vec3 wn = normalize(vWNorm);
      float slope = sqrt(max(1.0 - wn.y * wn.y, 0.0)) / max(wn.y, 0.05);
      float pool = 1.0 - smoothstep(0.0, 0.35, slope);
      col *= 1.0 - 0.34 * rainW * (0.45 + 0.55 * pool);
      gRough *= 1.0 - 0.55 * rainW * pool;
    }
  }
  #endif
  {
    vec3 wn = normalize(vWNorm);
    vec2 xz = vWPos.xz;
    float slope = sqrt(max(1.0 - wn.y * wn.y, 0.0)) / max(wn.y, 0.05);
    float tk0 = vTint.a * (1.0 - vGround.x);
    vec3 pert = vec3(0.0);
    ${STRATA_TERM}
    gN += pert;
  }
  diffuseColor.rgb = col;
}
`;
/** The bake's output, in place of the lit result (terrain.js renders the colour stage with this). */
export const FAR_BAKE_OUT = /* glsl */ `
#include <opaque_fragment>
{
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  gl_FragColor = uFarPart < 0.5 ? vec4(pow(clamp(diffuseColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2)), clamp(gLiquid, 0.0, 1.0))
                                : vec4(nW.xz * 0.5 + 0.5, clamp(roughnessFactor, 0.0, 1.0), clamp(gAO, 0.0, 1.0));
}
`;
