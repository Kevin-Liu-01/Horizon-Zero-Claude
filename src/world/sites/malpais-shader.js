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
 * Needs, from TERRAIN_COLOR: col, pert, gRough, gAO, slope, wn, xz, dCam, hold, macA, nMac, vWPos, gNoiseT.
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
/* (fix round 1: past 90 m the plain read flat) the flow's large relief as a height field (m): pressure ridges and
 * tumuli, ridged noise, 0 in the troughs to about 4 m on a crest; read once, its slope from the screen derivatives
 * (wave 2b).
 * (M3 wave 3, R11: F56's far plain, about 200 m out, showed rows of yellow rings) one read of the field noise on the
 * world's axes, ridged, draws a closed crest round every node of its lattice (cells of 6.9 m, in rows), and the low sun
 * lit each crest's sunward arc. The read is turned 31 deg off the axes and stretched 2.3 times along one of them (a crest
 * is a long fold 16 m and more, not a ring), and its place pushed up to a cell by the slow field \`warp\` (8-16 m cells),
 * so no two crests line up. Still one read */
float malRidge(vec2 p, vec2 warp) {
  vec2 q = vec2(dot(p, vec2(0.857, 0.515)), dot(p, vec2(-0.515, 0.857)));
  vec4 n = gNoiseT(q * vec2(0.018, 0.0078) + warp * 0.25 + 0.61);
  float r = 1.0 - abs(2.0 * (0.65 * n.r + 0.35 * n.g) - 1.0);
  return r * r * 4.0;
}
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
      float cin = smoothstep(0.84, 0.93, fract(band)) * (1.0 - pah);
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
        // (wave 3, MP2 at a true aa square) the taller clast of the two reads wins pixel by pixel; the slow field only leans
        // it, so both repeats (2.6 m, and 3.7 m turned 40 deg) carry about half the ground everywhere (was: whole patches of
        // one read, its 2.6 m repeat whole)
        float b = smoothstep(-0.2, 0.2, (nz.r - 0.5) * 0.35 + (a2.a - a1.a) * 0.8);
        vec4 a = mix(a1, a2, b), n = mix(n1, n2, b);
        // the second read is turned 40 deg: its normal turned back into the world frame
        vec2 t1 = n1.xy * 2.0 - 1.0, t2 = n2.xy * 2.0 - 1.0;
        t2 = vec2(t2.x * 0.766 - t2.y * 0.643, t2.x * 0.643 + t2.y * 0.766);
        vec2 t = mix(t1, t2, b);
        vec3 c = pow(a.rgb, vec3(2.2));
        // (wave 2 film at e664972: the aa read red-brown in the low sun) (fix round 1: still maroon at 17:45, hue 10.5 deg,
        // saturation 0.60) half its chroma out and the rest a cold blue-grey: the layer is cool basalt now, this keeps it so
        c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.9, 0.98, 1.14), c, 0.5);
        // lichen crust: grey-green flecks on the clinker's tops, a few metres of them here and there
        float lich = smoothstep(0.66, 0.8, nz.b) * smoothstep(0.55, 0.85, a.a) * 0.55;
        c = mix(c, vec3(0.105, 0.118, 0.088), lich);
        mc += c * wAa; mp += vec3(t.x, 0.0, t.y) * 1.25 * wAa; mr += n.z * wAa; mo += n.a * wAa; ws += wAa;
      }
      if (wPa > 0.01) {
        // the ropes run across the flow: the sheet's own downslope, so the arcs bow downhill
        // (fix round 1: on level ground, the Yards' apron, wn.xz is near zero and its noise turned the ropes into rosettes)
        // the sheet's downslope where it has one, else a slow flow field that turns over 50-100 m
        vec2 flow = normalize(vec2(0.42, 0.91) + (nz.rg - 0.5) * 0.8);
        vec2 fall = normalize(wn.xz * 6.0 + flow * 0.3);
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
        // (e664972: the bands read as red streams across the flow) dark, a red-brown tinge only
        vec3 cc = pow(a.rgb, vec3(2.2));
        cc = mix(vec3(dot(cc, vec3(0.2126, 0.7152, 0.0722))), cc, 0.55) * 0.75;
        mc += cc * wCi; mp += vec3(t.x, 0.0, t.y) * wCi; mr += n.z * wCi; mo += n.a * wCi; ws += wCi;
      }
      if (wSc > 0.01) {
        // (e664972: read down the fall line the scree streaked into stripes where the lens looks along the cone's face)
        // (fix round 1: at a 1.2 m tile the clasts read as confetti from 10-60 m) two reads, turned apart and at 1.2 and
        // 2.9 m, blended on a 4 m field; a 2-4 m patchwork of the cone's own shades over them; the rust red kept
        vec2 u = vec2(dot(xz, vec2(0.906, 0.423)), dot(xz, vec2(-0.423, 0.906))) * uMalTile.w;
        vec2 uq = vec2(dot(xz, vec2(-0.259, 0.966)), dot(xz, vec2(-0.966, -0.259))) * uMalTile.w * 0.41 + 0.53;
        vec4 a = malA(3.0, u, dx * uMalTile.w, dy * uMalTile.w), n = malN(3.0, u, dx * uMalTile.w, dy * uMalTile.w);
        vec4 a2 = malA(3.0, uq, dx * uMalTile.w * 0.41, dy * uMalTile.w * 0.41), n2 = malN(3.0, uq, dx * uMalTile.w * 0.41, dy * uMalTile.w * 0.41);
        // (M3 wave 3, MP2: the aa's and the scree's top-downs shared one 9.06 m peak, 0.353 and 0.332; both squares lie on
        // Rust Cone, and the field noise read here at 0.11 / m repeats every 1 / 0.11 = 9.09 m, its fine channels (A, B) in
        // every patch) one read at 0.0147 / m, turned 37 deg: it repeats every 68 m, its cells 4.3 m (G), 2.1 m (B), 1.1 m (A)
        vec4 sp = gNoiseT(vec2(dot(xz, vec2(0.799, 0.602)), dot(xz, vec2(-0.602, 0.799))) * 0.0147 + 0.23);
        float b = smoothstep(0.35, 0.65, sp.g + (a2.a - a.a) * 0.4);
        vec2 t = n.xy * 2.0 - 1.0; t = vec2(t.x * 0.906 - t.y * 0.423, t.x * 0.423 + t.y * 0.906);
        vec2 t2 = n2.xy * 2.0 - 1.0; t2 = vec2(-t2.x * 0.259 - t2.y * 0.966, t2.x * 0.966 - t2.y * 0.259);
        vec3 c = pow(mix(a.rgb, a2.rgb, b), vec3(2.2));
        c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.55) * 0.6;
        // the patchwork: darker and lighter fans and streaks a few metres across (B 2.3 m cells, A 1.1 m), and the slow
        // field's 10-30 m shade
        // (wave 3, after the top-down at 55126d7: with the patchwork's fine cells gone the scree's square read 0.384, the
        // cone's large forms left in its high-passed luma) the grit back, from the term's own 23 m read (nz: 0.36 and 0.73 m
        // cells), no new fetch
        c *= (0.72 + 0.5 * sp.b) * (0.88 + 0.24 * sp.a) * (0.85 + 0.3 * nz.a) * (0.8 + 0.4 * nz.b);
        mc += c * wSc; mp += vec3(mix(t, t2, b).x, 0.0, mix(t, t2, b).y) * wSc; mr += mix(n.z, n2.z, b) * wSc; mo += mix(n.a, n2.a, b) * wSc; ws += wSc;
      }
      mc /= max(ws, 1e-4); mp /= max(ws, 1e-4); mr /= max(ws, 1e-4); mo /= max(ws, 1e-4);
      // (e664972: the pahoehoe's glassy ropes glinted in a grid at 100 m, the tile's repeat) the relief and the gloss fade
      // with range, where the texel's detail is under a pixel anyway
      float farK = smoothstep(20.0, 90.0, dCam);
      // (wave 2b, F56 at dde7982: past 100 m the sheets still glinted in rows of yellow rings, the rope tile's normals
      // catching the low sun) on the sheets the relief and the gloss go almost wholly with range
      float pahK = wPa / max(ws, 1e-4);
      mp *= 1.0 - mix(0.65, 0.95, pahK) * farK;
      mr = mix(mr, max(mr, mix(0.82, 0.96, pahK)), farK);
      // (fix round 1) the flow's large relief, off Rust Cone and kept at every range: the ridges' slope bends the normal
      // and their troughs darken, so the plain reads as ridged rock to 300 m where the texel detail has faded out
      // (wave 2b, MP10) its slope from the screen derivatives of one read (was two more reads 2 m off): the world gradient
      // solved from d/dx and d/dy of the height and of xz
      {
        float rH = malRidge(xz, nMac.gb - 0.5);
        vec2 gR = vec2(dFdx(rH), dFdy(rH));
        float det = dx.x * dy.y - dx.y * dy.x;
        vec2 gW = abs(det) > 1e-10 ? vec2(dy.y * gR.x - dx.y * gR.y, dx.x * gR.y - dy.x * gR.x) / det : vec2(0.0);
        gW = clamp(gW, vec2(-1.5), vec2(1.5));
        // (wave 3) on the sheets past 110 m the relief goes to a quarter: a sheet is smooth, and its far crests were the rings
        float rk = (1.0 - cone) * (1.0 - pah * mix(0.6, 0.75, smoothstep(110.0, 190.0, dCam)));
        mp += vec3(-gW.x, 0.0, -gW.y) * 0.55 * rk;
        mc *= mix(1.0, 0.62 + 0.12 * rH, rk);
        mo *= mix(1.0, 0.75 + 0.07 * rH, rk);
      }
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
