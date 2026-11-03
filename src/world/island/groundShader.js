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
 * Layer ids: 0 sand, 1 salt, 2 basalt (array 1, 1024²); 3 silt, 4 shingle (array 2, 512²).
 */
export const GROUND_VERT_PARS = /* glsl */ `
#include <common>
attribute vec4 aTint;
varying vec3 vWPos;
varying vec3 vWNorm;
varying vec4 vTint;
`;
export const GROUND_VERT_WORLD = /* glsl */ `
#include <worldpos_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNorm = normalize(mat3(modelMatrix) * objectNormal);
vTint = vec4(pow(aTint.rgb, vec3(2.2)), aTint.a);
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
uniform highp sampler2DArray tA1;
uniform highp sampler2DArray tN1;
uniform highp sampler2DArray tA2;
uniform highp sampler2DArray tN2;
uniform vec3 uScale1;   // 1/tile: sand, salt, basalt
uniform vec2 uScale2;   // 1/tile: silt, shingle
uniform sampler2D tHzA;
uniform sampler2D tHzB;
uniform vec4 uHzW0;     // the light's bearing as weights over the 8 horizon channels
uniform vec4 uHzW1;
uniform float uSunTan;  // tan(elevation) of the sun or moon
uniform float uHzWorldInv;
uniform float uHzK;     // shadow strength: 1, or the calima's 0.45
vec3 gN; float gRough; float gAO; float gLiquid; float gSunVis = 1.0;
/** Is the light above the terrain's horizon here? Long soft shadows from one lookup. */
float gHorizonVis(vec2 xz) {
  vec2 uv = xz * uHzWorldInv + 0.5;
  float a = dot(texture2D(tHzA, uv), uHzW0) + dot(texture2D(tHzB, uv), uHzW1);
  a = a * a * 0.9;
  return mix(1.0, smoothstep(a - 0.016, a + 0.034, uSunTan), uHzK);
}
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
}
float gScale(int i) { return i == 0 ? uScale1.x : i == 1 ? uScale1.y : i == 2 ? uScale1.z : i == 3 ? uScale2.x : uScale2.y; }
vec4 gA(int i, vec2 uv, vec2 gx, vec2 gy) {
  return i < 3 ? textureGrad(tA1, vec3(uv, float(i)), gx, gy) : textureGrad(tA2, vec3(uv, float(i - 3)), gx, gy);
}
vec4 gNm(int i, vec2 uv, vec2 gx, vec2 gy) {
  return i < 3 ? textureGrad(tN1, vec3(uv, float(i)), gx, gy) : textureGrad(tN2, vec3(uv, float(i - 3)), gx, gy);
}
`;

export const TERRAIN_FRAG_PARS = /* glsl */ `
${GROUND_FRAG_PARS}
varying vec4 vTint;
uniform sampler2D tMaskA;
uniform sampler2D tMaskB;
uniform sampler2D tShore;
uniform sampler2D tPan;
uniform vec3 uPanBox;      // x0, z0, 1/size
uniform float uWorldInv;
uniform float uTime;
uniform float uSea;
uniform vec2 uSunXZ;       // unit, toward the light
`;

/** Accumulates one layer: albedo into col, world normal offset, rough + AO, height blend. */
export const TERRAIN_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 wn = normalize(vWNorm);
  vec2 xz = vWPos.xz;
  float dCam = length(vWPos - cameraPosition);
  vec2 muv = xz * uWorldInv + 0.5;
  vec4 mA = texture2D(tMaskA, muv);
  vec4 mB = texture2D(tMaskB, muv);
  vec4 sh = texture2D(tShore, muv);
  vec2 puv = (xz - uPanBox.xy) * uPanBox.z;
  vec4 pan = vec4(0.0);
  if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0) pan = texture2D(tPan, puv);

  float slope = sqrt(max(1.0 - wn.y * wn.y, 0.0)) / max(wn.y, 0.05);
  float macA = gNoise(xz * 0.031) * 0.6 + gNoise(xz * 0.097 + 7.0) * 0.4;

  /* -- the five weights, then the three that survive ----------------------- */
  float crust = max(mA.r * (1.0 - pan.a), pan.r);
  float brine = pan.g;
  float wRock = max(mA.g, smoothstep(0.62, 1.05, slope));
  float wSalt = crust * (1.0 - wRock) * (1.0 - brine * 0.4);
  float wSilt = max(mA.a, brine * 0.85 * (1.0 - crust)) * (1.0 - wRock);
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
  float tk = gNoise(xz * 0.043) * 8.0;
  float tia = floor(tk), tf = fract(tk);
  vec2 offA = sin(vec2(3.0, 7.0) * tia), offB = sin(vec2(3.0, 7.0) * (tia + 1.0));
  vec2 dpx = dFdx(xz), dpy = dFdy(xz);
  float nearK = 1.0 - smoothstep(55.0, 140.0, dCam);
  float slopeT = smoothstep(0.35, 0.55, slope);

  vec3 col = vec3(0.0), pert = vec3(0.0);
  float hMax = -9.0, wTot = 0.0, rSum = 0.0, aoSum = 0.0;
  vec4 keepA[3]; vec4 keepN[3]; float keepW[3]; int keepI[3]; int nKeep = 0;
  for (int i = 0; i < 5; i++) {
    if (w[i] < 0.012) continue;
    float sc = gScale(i);
    vec2 uv = xz * sc, gx = dpx * sc, gy = dpy * sc;
    vec4 a, nn;
    if (i == 2 && slopeT > 0.0) {
      /* triplanar: basalt on real slopes only */
      vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      vec3 dpxz = dFdx(vWPos), dpyz = dFdy(vWPos);
      vec2 ux = vWPos.zy * sc, uz = vWPos.xy * sc;
      vec4 ax = gA(2, ux, dpxz.zy * sc, dpyz.zy * sc), ay = gA(2, uv + offA, gx, gy), az = gA(2, uz, dpxz.xy * sc, dpyz.xy * sc);
      a = ax * bw.x + ay * bw.y + az * bw.z;
      vec4 nx = gNm(2, ux, dpxz.zy * sc, dpyz.zy * sc), ny = gNm(2, uv + offA, gx, gy), nz = gNm(2, uz, dpxz.xy * sc, dpyz.xy * sc);
      vec2 tx = nx.xy * 2.0 - 1.0, ty = ny.xy * 2.0 - 1.0, tz = nz.xy * 2.0 - 1.0;
      pert += (vec3(0.0, tx.y, tx.x) * bw.x + vec3(ty.x, 0.0, ty.y) * bw.y + vec3(tz.x, tz.y, 0.0) * bw.z) * w[i] * 0.95;
      nn = vec4(0.0, 0.0, nx.z * bw.x + ny.z * bw.y + nz.z * bw.z, nx.a * bw.x + ny.a * bw.y + nz.a * bw.z);
    } else {
      a = gA(i, uv + offA, gx, gy);
      nn = gNm(i, uv + offA, gx, gy);
      if (w[i] > 0.18) {
        vec4 a2 = gA(i, uv + offB, gx, gy);
        float cdiff = dot(a.rgb - a2.rgb, vec3(0.33));
        float bl = smoothstep(0.22, 0.78, tf - 0.12 * cdiff);
        a = mix(a, a2, bl);
        if (nearK > 0.0) nn = mix(nn, gNm(i, uv + offB, gx, gy), bl);
      }
    }
    keepA[nKeep] = a; keepN[nKeep] = nn; keepW[nKeep] = w[i]; keepI[nKeep] = i; nKeep++;
    if (nKeep == 3) break;
  }
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
    if (keepI[k] == 1) {
      /* salt runs white → brine pink → crystalliser rust, by cell */
      float hue = pan.b;
      vec3 tintC = hue < 0.5 ? mix(vec3(1.0), vec3(0.93, 0.62, 0.52), hue * 2.0)
                             : mix(vec3(0.93, 0.62, 0.52), vec3(0.42, 0.13, 0.08), (hue - 0.5) * 2.0);
      c *= tintC;
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

  /* -- the macro read: nothing is one flat value from 200 m ----------------- */
  col *= 0.8 + 0.42 * macA;
  // wind-pale sand on crests, damp dark hollows
  col *= 1.0 + 0.5 * mB.a * w[0] - 0.42 * mB.b * w[0];
  if (w[0] > 0.02) {
    /* the black sand from far off: fabric drawn out along the trade wind, warmer ash in broad
     * patches, and past the plants' range the colonies and the scrub as tone in the ground */
    vec2 wv = vec2(dot(xz, vec2(0.7071, -0.7071)), dot(xz, vec2(0.7071, 0.7071)));
    float streak = gNoise(vec2(wv.x * 0.085, wv.y * 0.011)) * 0.6 + gNoise(vec2(wv.x * 0.31, wv.y * 0.04) + 9.0) * 0.4;
    float ash = smoothstep(0.42, 0.78, gNoise(xz * 0.0093 + 31.0) * 0.7 + gNoise(xz * 0.041) * 0.3);
    vec3 sandTone = mix(vec3(1.0), vec3(1.7, 1.52, 1.3), ash) * (0.7 + 0.66 * streak);
    float farK = smoothstep(40.0, 170.0, dCam);
    float scrub = smoothstep(0.54, 0.8, gNoise(xz * 0.29 + 3.0) * 0.6 + gNoise(xz * 0.083 + 17.0) * 0.4);
    vec3 sandCol = col * sandTone;
    sandCol = mix(sandCol, vec3(0.05, 0.046, 0.03), scrub * 0.6 * farK);
    sandCol = mix(sandCol, vec3(0.17, 0.15, 0.078), mB.r * farK * 0.8);
    col = mix(col, sandCol, smoothstep(0.02, 0.5, w[0]));
  }
  // packed tracks: pale, smooth, salt-dusted
  if (mB.g > 0.01) {
    float tr = smoothstep(0.1, 0.8, mB.g) * (0.6 + 0.4 * macA);
    col = mix(col, vec3(0.32, 0.29, 0.25) * (0.55 + 0.55 * gNoise(xz * 2.1)), tr * 0.82);
    pert *= 1.0 - 0.6 * tr;
    rSum = mix(rSum, 0.82, tr);
  }
  // duff under marram: the ground darkens where the colonies stand
  col *= 1.0 - 0.24 * mB.r;

  /* -- the blockout tint: red crater, and biomes 2-6 ------------------------- */
  float tk0 = vTint.a;
  if (tk0 > 0.004) {
    float g = clamp(dot(col, vec3(0.33)) / 0.02, 0.55, 1.5);
    col = mix(col, vTint.rgb * g * (0.82 + 0.36 * macA), tk0 * (1.0 - 0.6 * wRock));
  }

  /* -- liquid: brine mirrors, the swash zone is wet black glass -------------- */
  float coast = sh.r * 128.0 - 48.0;
  float tide = uSea + 0.26 + 0.09 * sin(uTime * 0.42 + xz.x * 0.03 + xz.y * 0.021);
  float wetSea = (1.0 - smoothstep(tide, tide + 0.34, vWPos.y)) * (1.0 - smoothstep(7.0, 17.0, coast));
  float wetGlass = sh.b * (1.0 - smoothstep(0.34, 0.78, vWPos.y));
  float wet = max(wetSea, wetGlass);
  // a wet ground is dark and flat; brine is thin water on crust, pink where it evaporates
  col *= mix(1.0, 0.42, wet);
  gLiquid = max(wet * 0.62, brine);
  if (brine > 0.004) {
    float hue = pan.b;
    vec3 water = mix(vec3(0.52, 0.56, 0.58), vec3(0.72, 0.5, 0.45), smoothstep(0.1, 0.5, hue));
    water = mix(water, vec3(0.34, 0.12, 0.08), smoothstep(0.55, 0.95, hue));
    col = mix(col, water * (0.72 + 0.4 * macA), brine * 0.62);
  }
  pert *= 1.0 - gLiquid * 0.86;
  gRough = mix(clamp(rSum, 0.25, 1.0), mix(0.3, 0.07, smoothstep(0.3, 0.9, brine)), gLiquid);
  gAO = mix(1.0, clamp(aoSum, 0.0, 1.0), 0.78);
  col *= mix(1.0, clamp(aoSum * 1.08, 0.0, 1.0), 0.4);

  /* -- the long shadows: the land's own, and past the cascades the dykes' ------ */
  gSunVis = gHorizonVis(xz);
  if (pan.a > 0.01 && dCam > 70.0) {
    // a dyke is ≈ 0.55 m tall: a band of shadow on the side away from the light
    float L = min(0.55 / max(uSunTan, 0.08), 5.5);
    vec2 toSun = uSunXZ * L * uPanBox.z;
    float behind = min(texture2D(tPan, puv + toSun).a, texture2D(tPan, puv + toSun * 0.5).a);
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
  float mac = gNoise(vWPos.xz * 0.37 + vWPos.y * 0.21);
  c *= 0.78 + 0.5 * mac;
  // salt rime settles on what faces up; the foot in the swash is wet and black
  float rime = smoothstep(0.78, 0.99, wn.y) * uRime * smoothstep(0.42, 0.72, mac);
  c = mix(c, vec3(0.5, 0.48, 0.44), rime);
  float wetK = 1.0 - smoothstep(0.02, 0.36, vWPos.y);
  c *= mix(1.0, 0.42, wetK);
  gSunVis = gHorizonVis(vWPos.xz);
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
