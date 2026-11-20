/**
 * THE MALPAIS' GROUND AND ROCK IN THE SHADER (Milestone 3 wave 2, area A: the look; BIBLE §3.3 "cold aa and pahoehoe lava
 * rock, cinder bands, lichen crust"; Rust Cone "red cinder cone; scree to slide"; M3 briefs MP1-MP3, MP10).
 *
 *   MALPAIS_PARS   the term's uniforms; included in the ground's fragment pars under CAL_G_MALPAIS only
 *                  (src/world/island/groundShader.js TERRAIN_FRAG_PARS)
 *   MALPAIS_TERM   the term; included in TERRAIN_COLOR under CAL_G_MALPAIS only, after the long shadows and before the
 *                  rain, so only a chunk with Malpais ground under it compiles it (the Holds' pattern, CAL_G_HOLDS: the
 *                  Pans never pay for it) and only once the region has been approached (./malpais-region.js swaps the
 *                  chunks' program when the program is linked and its textures are on the GPU)
 *   MALPAIS_ROCK_COLOR   the rock's colour stage (the clinker, the pinnacles, the hornitos' spatter): one Malpais layer
 *                  read triplanar, as ROCK_COLOR reads the basalt
 *
 * The zones are the ground tone's own law (src/world/island/bake.js malpaisSheet, malpaisCinder) and the zones' data
 * (./malpais-zones.js), read from a zone map the region builds on approach (./malpais-region.js zoneMap): R the Malpais'
 * biome weight, G the sheet field before its cut (pahoehoe above 0.50-0.58), B the cinder bands' offset field (bands
 * every 7 m of height, as malpaisCinder), A Rust Cone's weight. Nothing here is emissive: the term writes the albedo, the
 * normal, the roughness and the AO and nothing else (MP1: 0 emissive ground texels).
 *
 * Needs, from TERRAIN_COLOR: col, pert, gRough, gAO, slope, wn, xz, dCam, hold, macA, vWPos, gNoiseT.
 */
export const MALPAIS_PARS = /* glsl */ `
uniform highp sampler2DArray tMalA;   // aa, pahoehoe, cinder, scree: albedo (sRGB data) + height
uniform highp sampler2DArray tMalN;   // the same: normal XY, roughness, AO
uniform sampler2D tMalZ;              // the zone map (see malpais-shader.js)
uniform vec4 uMalBox;                 // the zone map's x0, z0 (engine) and 1 / its size in x and z
uniform vec4 uMalTile;                // 1 / tile (m): aa, pahoehoe, cinder, scree
uniform vec4 uMalK;                   // x the term's strength (0 = the blockout tint as before), y its far fade start, z its end
vec4 malA(float i, vec2 uv, vec2 gx, vec2 gy) { return textureGrad(tMalA, vec3(uv, i), gx, gy); }
vec4 malN(float i, vec2 uv, vec2 gx, vec2 gy) { return textureGrad(tMalN, vec3(uv, i), gx, gy); }
`;

export const MALPAIS_TERM = /* glsl */ `
  /* -- the Malpais (M3 wave 2): aa clinker, pahoehoe sheets, cinder bands, Rust Cone's scree; cold ------------------ */
  {
    vec2 zuv = (xz - uMalBox.xy) * uMalBox.zw;
    float mk = 0.0;
    vec4 Z = vec4(0.0);
    if (zuv.x > 0.0 && zuv.x < 1.0 && zuv.y > 0.0 && zuv.y < 1.0) {
      Z = texture(tMalZ, zuv);
      mk = Z.r * (1.0 - hold) * uMalK.x * (1.0 - smoothstep(uMalK.y, uMalK.z, dCam));
    }
    if (mk > 0.004) {
      vec4 nz = gNoiseT(xz * 0.043 + 0.17);
      // the zones: a lobe's edge is crisp and lobate (the sheet field cut at 0.50-0.58, its edge broken at a few metres)
      float pah = smoothstep(0.50, 0.58, Z.g + (nz.g - 0.5) * 0.05);
      float band = vWPos.y / 7.0 + (Z.b - 0.5) * 1.6;
      float cin = smoothstep(0.80, 0.92, fract(band)) * (1.0 - pah);
      float steep = smoothstep(0.45, 0.85, slope);
      float cone = Z.a;
      float wSc = cone * (0.5 + 0.5 * steep);
      float wCi = cin * (1.0 - cone) + cone * (0.5 - 0.5 * steep);
      float wPa = pah * (1.0 - cone);
      float wAa = max(0.0, 1.0 - wSc - wCi - wPa);
      vec2 dx = dFdx(xz), dy = dFdy(xz);
      vec3 mc = vec3(0.0), mp = vec3(0.0); float mr = 0.0, mo = 0.0, ws = 0.0;
      // aa: two reads, turned and scaled apart, blended on a slow field by the taller clast (no 2.6 m repeat in a walk)
      if (wAa > 0.01) {
        vec2 u1 = xz * uMalTile.x, u2 = vec2(dot(xz, vec2(0.766, 0.643)), dot(xz, vec2(-0.643, 0.766))) * uMalTile.x * 0.71 + 0.37;
        vec4 a1 = malA(0.0, u1, dx * uMalTile.x, dy * uMalTile.x), a2 = malA(0.0, u2, dx * uMalTile.x * 0.71, dy * uMalTile.x * 0.71);
        vec4 n1 = malN(0.0, u1, dx * uMalTile.x, dy * uMalTile.x), n2 = malN(0.0, u2, dx * uMalTile.x * 0.71, dy * uMalTile.x * 0.71);
        float b = smoothstep(-0.15, 0.15, nz.r - 0.5 + (a2.a - a1.a) * 0.6);
        vec4 a = mix(a1, a2, b), n = mix(n1, n2, b);
        // the second read is turned 40 deg: its normal turned back into the world frame
        vec2 t1 = n1.xy * 2.0 - 1.0, t2 = n2.xy * 2.0 - 1.0;
        t2 = vec2(t2.x * 0.766 - t2.y * 0.643, t2.x * 0.643 + t2.y * 0.766);
        vec2 t = mix(t1, t2, b);
        vec3 c = pow(a.rgb, vec3(2.2));
        // lichen crust: grey-green flecks on the clinker's tops, a few metres of them here and there
        float lich = smoothstep(0.66, 0.8, nz.b) * smoothstep(0.55, 0.85, a.a) * 0.55;
        c = mix(c, vec3(0.105, 0.118, 0.088), lich);
        mc += c * wAa; mp += vec3(t.x, 0.0, t.y) * 1.25 * wAa; mr += n.z * wAa; mo += n.a * wAa; ws += wAa;
      }
      if (wPa > 0.01) {
        // the ropes run across the flow: the sheet's own downslope, so the arcs bow downhill
        vec2 fall = normalize(wn.xz + vec2(1e-4, 0.0));
        vec2 q = vec2(dot(xz, vec2(-fall.y, fall.x)), dot(xz, fall)) * uMalTile.y;
        vec2 qx = vec2(dot(dx, vec2(-fall.y, fall.x)), dot(dx, fall)) * uMalTile.y, qy = vec2(dot(dy, vec2(-fall.y, fall.x)), dot(dy, fall)) * uMalTile.y;
        vec4 a = malA(1.0, q, qx, qy), n = malN(1.0, q, qx, qy);
        vec2 t = n.xy * 2.0 - 1.0;
        vec2 tw = t.x * vec2(-fall.y, fall.x) + t.y * fall;
        mc += pow(a.rgb, vec3(2.2)) * wPa; mp += vec3(tw.x, 0.0, tw.y) * wPa; mr += n.z * wPa; mo += n.a * wPa; ws += wPa;
      }
      if (wCi > 0.01) {
        vec2 u = vec2(dot(xz, vec2(0.276, 0.961)), dot(xz, vec2(-0.961, 0.276))) * uMalTile.z;
        vec4 a = malA(2.0, u, dx * uMalTile.z, dy * uMalTile.z), n = malN(2.0, u, dx * uMalTile.z, dy * uMalTile.z);
        vec2 t = n.xy * 2.0 - 1.0; t = vec2(t.x * 0.276 + t.y * 0.961, -t.x * 0.961 + t.y * 0.276) * vec2(1.0, 1.0);
        mc += pow(a.rgb, vec3(2.2)) * wCi; mp += vec3(t.x, 0.0, t.y) * wCi; mr += n.z * wCi; mo += n.a * wCi; ws += wCi;
      }
      if (wSc > 0.01) {
        // scree lies down the fall line: the clasts read streaked downhill on the cone's 30-34 deg faces
        vec2 fall = normalize(wn.xz + vec2(1e-4, 0.0));
        vec2 q = vec2(dot(xz, vec2(-fall.y, fall.x)), dot(xz, fall) * 0.8) * uMalTile.w;
        vec2 qx = vec2(dot(dx, vec2(-fall.y, fall.x)), dot(dx, fall) * 0.8) * uMalTile.w, qy = vec2(dot(dy, vec2(-fall.y, fall.x)), dot(dy, fall) * 0.8) * uMalTile.w;
        vec4 a = malA(3.0, q, qx, qy), n = malN(3.0, q, qx, qy);
        vec2 t = n.xy * 2.0 - 1.0;
        vec2 tw = t.x * vec2(-fall.y, fall.x) + t.y * fall;
        // the cone's oxidised bands: redder at mid height, darker cinder toward its crater
        vec3 c = pow(a.rgb, vec3(2.2)) * (0.85 + 0.3 * nz.a);
        mc += c * wSc; mp += vec3(tw.x, 0.0, tw.y) * wSc; mr += n.z * wSc; mo += n.a * wSc; ws += wSc;
      }
      mc /= max(ws, 1e-4); mp /= max(ws, 1e-4); mr /= max(ws, 1e-4); mo /= max(ws, 1e-4);
      // the large scale: each place its own shade (10-30 m), the cone keeps its red
      mc *= 0.82 + 0.36 * macA;
      float ao = clamp(mo * 1.15, 0.0, 1.0);
      col = mix(col, mc * mix(1.0, ao, 0.45), mk);
      pert = mix(pert, mp, mk);
      gRough = mix(gRough, clamp(mr, 0.3, 1.0), mk);
      gAO = mix(gAO, mix(1.0, ao, 0.8), mk);
      gLiquid *= 1.0 - mk;
    }
  }
`;

/**
 * The rock's colour stage (needs ROCK_VERT_PARS' vWPos, vWNorm; MALPAIS_PARS; GROUND_FRAG_PARS' gN, gRough, gAO, gLiquid,
 * gSunVis, gSkylineVis, gNoiseT). `uMalRock`: x the layer (0 aa, 2 cinder, 3 scree), y the tile scale (x the layer's), z
 * the albedo's gain, w how much of the vertex colour tints it (the hornitos' spatter keeps a little of its own).
 */
export const MALPAIS_ROCK_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 wn = normalize(vWNorm);
  vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  float L = uMalRock.x;
  float sc = (L < 0.5 ? uMalTile.x : L < 2.5 ? uMalTile.z : uMalTile.w) * uMalRock.y;
  vec2 ux = vWPos.zy * sc, uy = vWPos.xz * sc, uz = vWPos.xy * sc;
  vec3 dx = dFdx(vWPos) * sc, dy = dFdy(vWPos) * sc;
  vec4 a = malA(L, ux, dx.zy, dy.zy) * bw.x + malA(L, uy, dx.xz, dy.xz) * bw.y + malA(L, uz, dx.xy, dy.xy) * bw.z;
  vec4 nx = malN(L, ux, dx.zy, dy.zy), ny = malN(L, uy, dx.xz, dy.xz), nz = malN(L, uz, dx.xy, dy.xy);
  vec2 tx = nx.xy * 2.0 - 1.0, ty = ny.xy * 2.0 - 1.0, tz = nz.xy * 2.0 - 1.0;
  vec3 c = pow(a.rgb, vec3(2.2)) * uMalRock.z;
  float mac = gNoiseT(vWPos.xz * 0.031 + vWPos.y * 0.011).b;
  c *= 0.8 + 0.4 * mac;
  c = mix(c, c * diffuseColor.rgb * 2.0, uMalRock.w);
  gSunVis = gSkylineVis(vWPos.xz);
  diffuseColor.rgb = c;
  gN = (vec3(0.0, tx.y, tx.x) * bw.x + vec3(ty.x, 0.0, ty.y) * bw.y + vec3(tz.x, tz.y, 0.0) * bw.z) * 1.2;
  gRough = clamp(nx.z * bw.x + ny.z * bw.y + nz.z * bw.z, 0.3, 1.0);
  gAO = clamp((nx.a * bw.x + ny.a * bw.y + nz.a * bw.z) * 1.15, 0.0, 1.0);
  gLiquid = 0.0;
}
`;
