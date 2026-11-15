import * as THREE from 'three';
import { ORGAN, CRATER } from './layout.js';

/**
 * BASALT AND TUFF (world-props W1): the Organ Shelf's column clusters and the
 * red crater's rock, both generated here at boot from the layout (one merged
 * mesh for the columns, one instanced mesh for the tuff blocks, one merged mesh
 * for the crater's stratified buttresses). Nothing is loaded; everything is
 * snapped to `terrain.getHeight`, so a re-baked island moves nothing by hand.
 *
 * Columns (bible §8.3 "11 hex clusters", §8.7 "hex basalt columns as natural
 * stairs", ROUND5-LOOK W-05): hexagonal prisms 0.6-1.4 m across, packed in a
 * hex grid, the tallest at each cluster's back stepping down in 0.55 m risers
 * toward its face, 2-14 m above the ground, with cross-joints every 0.9-2.4 m.
 * M1.1c: each column leans (the cluster fans 1.7-2.6 deg toward its face), every
 * jointed segment is jogged and resized a little (no straight outline), each
 * hex facet has its own tone, the tops are broken (fracture planes up to ~43
 * deg, a spalled wedge on one column in two), and every cluster has a talus
 * apron of fallen column segments in front of its face (10 + 1.6 per metre of
 * its tallest column). M1a round 2: packed flat to flat with no slot between
 * neighbours, cut at every cross-joint into a lit arris, a dark groove and a
 * shadowed foot, and a lighter albedo (see pushColumn). Each column is one box collider (A24: the player is
 * stopped by one; the mantle climbs the risers).
 *
 * Crater rock: ≈ 150 tuff blocks on the talus apron and the benches of the high
 * wall and seven buttress outcrops at the cliff foot, all BANDED SCORIA (M1.1c):
 * the blocks are lumpy clasts with 6-7 dipping beds across them in their vertex colour, the buttresses
 * are 6-12 beds 0.35-1.2 m thick, each a different scoria colour from the last
 * (rust red, black cinder, orange, ochre) and set in or out from it.
 *
 * Deterministic (seeded); every geometry and material is owned and disposed.
 */

/**
 * M1a round 3 (M1.1c, F05: "the clusters are near-black backlit slabs"): against a low sun the columns' faces toward the
 * lens are all in shade, and shade on dark basalt under the dusk grade is black. Two terms the scene's lights do not give:
 *   BOUNCE  the lit salt and the shelf throw the sun back up: faces that look sideways or down take the sun's colour
 *           times their own albedo times x (0.25 + 0.75 sqrt(sun height)), more the more they face down, so each hex
 *           facet keeps its own tone (its vertex colour) instead of one black
 *   RIM     a backlit column's edges that turn toward the sun catch it at grazing view: (1 - N.V)^3 on the sun's side,
 *           only when the lens looks toward the sun, times y
 * ORGAN_LIGHT.value = (bounce, rim, -, -), shared, so a probe can try values on one page.
 */
export const ORGAN_LIGHT = { value: new THREE.Vector4(0.9, 1.4, 0, 0) };
/* (measured at 730056d: a bounce and rim from the SUN's colour changed nothing in F05 (Organ crop L* 19.8 at 0, 0.55
 * and 1.0): at 19.6 h the sun is in its hand-over trough (sunI <= 0.15) and the light on the columns is the sky's.
 * The bounce and the rim take the sky's own horizon colour, the fog's calFogHorizon, which is what the salt flat in front
 * of them reflects, and the sun's forward glow toward the low sun for the rim) */
const ORGAN_LIGHT_GLSL = /* glsl */ `
#include <lights_fragment_end>
#ifdef USE_FOG
{
  vec3 oUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 oSun = normalize((viewMatrix * vec4(calSunDir, 0.0)).xyz);
  vec3 oN = normalize(geometryNormal);
  float oNu = dot(oN, oUp);
  // the salt and the shelf in front throw the horizon's light back up onto faces that look sideways or down
  float oBounce = clamp(0.62 - 0.5 * oNu, 0.0, 1.0);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * calFogHorizon * oBounce * uOrganLight.x;
  // a backlit column's edges on the sun's side catch the glow at grazing view
  float oNv = clamp(dot(oN, geometryViewDir), 0.0, 1.0);
  vec3 oSh = oSun - oUp * dot(oSun, oUp);
  oSh = oSh / max(length(oSh), 1e-3);
  float oSide = clamp(dot(oN, oSh) * 0.8 + 0.2, 0.0, 1.0);
  float oBack = smoothstep(-0.2, 0.5, -dot(geometryViewDir, oSun));
  reflectedLight.indirectDiffuse += diffuseColor.rgb * (calFogHorizon + calFogSun * 0.35) * pow(1.0 - oNv, 3.0) * oSide * oBack * uOrganLight.y;
}
#endif`;
function organLight(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer);
    shader.uniforms.uOrganLight = ORGAN_LIGHT;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uOrganLight;')
      .replace('#include <lights_fragment_end>', ORGAN_LIGHT_GLSL);
  };
  mat.customProgramCacheKey = () => 'cal-organ-light';
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const _c = new THREE.Color();
/* M1a round 2: the columns' albedo toward the dusk crop's basalt (L* about 36): weathered, dusty basalt at 0.09-0.12
 * linear (sRGB 0x55-0x66), where round 1's 0x35-0x4b (0.04-0.07) went to near black in F05's backlight (L* 5.6) */
const BASALT = [0x5c5955, 0x64605b, 0x565451, 0x6a655e, 0x5f5b58];
const TUFF = [0x7a3b2a, 0x8e3b23, 0x9a5a3a, 0x6b3426, 0x8c6a48, 0xa4683f];
/** M1.1c banded scoria (the crater's beds, the same row as its ground): red, black cinder, orange, ochre. */
const SCORIA = [0x8e3b23, 0x2e2420, 0xa8562e, 0x5e2a1c, 0xb0703e, 0x3a2622, 0x96452a, 0x6e3a26];
const D2R = Math.PI / 180;

/**
 * Append one hex column to the flat arrays (non-indexed, flat normals per facet). M1.1c: the column
 * leans (`lean` [dx, dz] per metre of height: the cluster fans outward, as columns do at a flow front),
 * every segment between cross-joints is jogged a few centimetres and a few per cent wider or narrower
 * than the last (so no outline runs straight), each facet carries its own tone (the hexagon reads, not a
 * cylinder), and the top is BROKEN: a tilted fracture plane (up to ~40 deg), on one column in two a
 * second step where a wedge has spalled off.
 *
 * M1a round 2 (F05: the near clusters still read as smooth dark slabs in backlight). What reads against a
 * dusk sky is what the SKY lights, so the column's structure is cut where the sky can reach it:
 *  - every cross-joint is a real notch: the segment below ends in a chipped arris bevelled up (fresh rock, a
 *    little lit by the sky), a hairline groove, the next segment's foot bevelled down (in shadow), 2-4.5 cm
 *    each; the joints are 1.3-3.9 m apart and each dips a few degrees its own way (square, close joints with
 *    a broad lit bevel read as stacked drums on the first film);
 *  - each facet is shaded from one arris to the next (weathering runs off one edge), so where two facets meet
 *    the tone steps and every vertical arris draws a line;
 *  - the fracture planes are steeper and more of them (60 % at 27-43 deg), the spalls deeper.
 */
function pushColumn(out, cx, cz, rad, y0, y1, rot, seed, tone, lean = [0, 0]) {
  const P = out.pos, N = out.nor, C = out.col;
  const R = mulberry32(seed);
  const cham = Math.min(0.06 + rad * 0.05, (y1 - y0) * 0.1);
  const JC = Math.min(0.045, 0.02 + rad * 0.04), JG = 0.016;       // joint bevel, half the groove
  // cross-joint heights (columnar jointing), measured up from the base: long and uneven, so a column reads as one
  // shaft with joints across it, never as a stack of drums
  const rings = [y0];
  let y = y0 + 0.6 + R() * 1.8;
  while (y < y1 - cham - 0.8) { rings.push(y); y += 1.3 + R() * 2.6; }
  rings.push(y1 - cham);
  // each cross-joint dips a few degrees its own way (a cooling joint is never square to the column)
  const tilt = rings.map((_, i) => (i === 0 || i === rings.length - 1) ? [0, 0] : [(R() - 0.5) * 0.26, (R() - 0.5) * 0.26]);
  // per segment: a jog and a width (the joint's offset); small enough that packed neighbours still overlap
  const seg = rings.map(() => [(R() - 0.5) * 0.04, (R() - 0.5) * 0.04, 0.98 + R() * 0.04]);
  // the broken top: a fracture plane, steep on most columns, and a spalled wedge on one in two
  const steep = R() < 0.6 ? 0.5 + R() * 0.43 : 0.14 + R() * 0.22;
  const ta = R() * Math.PI * 2, tx = Math.cos(ta) * steep, tz = Math.sin(ta) * steep;
  const spall = R() < 0.5;
  const spA = R() * 6, spD = 0.4 + R() * 0.7;
  _c.setHex(tone).convertSRGBToLinear();
  const br = _c.r, bg = _c.g, bb = _c.b;
  const k0 = 0.88 + R() * 0.24;
  // facet tones: alternate light and dark round the hexagon (no two neighbours alike), each a little its own
  const facetK = [0, 1, 2, 3, 4, 5].map((i) => (i % 2 ? 0.84 : 1.1) * (0.9 + R() * 0.2));
  const lx = (yy) => (yy - y0) * lean[0], lz = (yy) => (yy - y0) * lean[1];
  const corner = (i, r, yy, si) => {
    const a = rot + (i / 6) * Math.PI * 2; const g = seg[si];
    return [cx + Math.cos(a) * r * g[2] + g[0] + lx(yy), cz + Math.sin(a) * r * g[2] + g[1] + lz(yy)];
  };
  const tri = (ax, ay, az, bx, by, bz, cx2, cy2, cz2, nx, ny, nz, ka, kb, kc) => {
    P.push(ax, ay, az, bx, by, bz, cx2, cy2, cz2);
    N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    C.push(br * ka, bg * ka, bb * ka, br * kb, bg * kb, bb * kb, br * kc, bg * kc, bb * kc);
  };
  // a quad a(lo, left) b(lo, right) c(hi, right) d(hi, left), one normal, tone left/right at lo/hi
  const quad = (a, b, c2, d, n, kl, kr, klh = kl, krh = kr) => {
    tri(a[0], a[1], a[2], c2[0], c2[1], c2[2], b[0], b[1], b[2], n[0], n[1], n[2], kl, krh, kr);
    tri(a[0], a[1], a[2], d[0], d[1], d[2], c2[0], c2[1], c2[2], n[0], n[1], n[2], kl, klh, krh);
  };
  const shadeAt = (yy) => {
    // wet foot, vertical streaks
    let k = k0 * (0.72 + 0.28 * Math.min(1, (yy - y0) / 1.4));
    k *= 0.9 + 0.2 * vnoise(cx * 0.7, yy * 0.4 + cz * 0.7);
    return k;
  };
  const last = rings.length - 2;
  // the top surface height at a point (fracture plane, minus the spalled wedge)
  const topAt = (x, z) => {
    const dx = x - cx - lx(y1), dz = z - cz - lz(y1);
    let h = y1 + tx * dx + tz * dz;
    if (spall && Math.cos(Math.atan2(dz, dx) - spA) > 0.35) h -= spD + 0.2;
    return h;
  };
  // a point on corner s at radius r, `dy` above ring ri's (tilted) plane, with segment si's jog
  const P3 = (s, r, ri, dy, si) => {
    const a = rot + (s / 6) * Math.PI * 2, t = tilt[ri];
    const yy = rings[ri] + dy + rad * (Math.cos(a) * t[0] + Math.sin(a) * t[1]);
    const [x, z] = corner(s, r, yy, si); return [x, yy, z];
  };
  const nUp = (nx, nz, up) => { const l = Math.hypot(nx * (1 - up), up, nz * (1 - up)); return [nx * (1 - up) / l, up / l, nz * (1 - up) / l]; };
  for (let s = 0; s < 6; s++) {
    const fl = facetK[s] * 1.1, fr = facetK[s] * 0.86;              // weathering runs off one arris to the next
    for (let r = 0; r + 1 < rings.length; r++) {
      const da = r ? JG + JC : 0, db = r < last ? -JG - JC : 0;
      const ya = rings[r] + da, yb = rings[r + 1] + db;
      const a = P3(s, rad, r, da, r), b = P3(s + 1, rad, r, da, r), c2 = P3(s + 1, rad, r + 1, db, r), d = P3(s, rad, r + 1, db, r);
      const mx = (a[0] + b[0]) / 2 - cx - lx(ya), mz = (a[2] + b[2]) / 2 - cz - lz(ya), ml = Math.hypot(mx, mz) || 1;
      const nx = mx / ml, nz = mz / ml;
      const ka = shadeAt(ya), kb = shadeAt(yb);
      quad(a, b, c2, d, [nx, 0, nz], ka * fl, ka * fr, kb * fl, kb * fr);
      if (r < last) {
        // the joint: a thin chipped arris (up, a little lit by the sky), a hairline groove, the next foot (in shadow)
        const ri = rad - JC, q = r + 1;
        const e = P3(s, ri, q, -JG, r), f = P3(s + 1, ri, q, -JG, r);
        quad(d, c2, f, e, nUp(nx, nz, 0.62), kb * 1.2, kb * 1.1);
        const g = P3(s, ri, q, JG, q), h = P3(s + 1, ri, q, JG, q);
        quad(e, f, h, g, [nx, 0, nz], kb * 0.5, kb * 0.45);
        const kn = shadeAt(rings[q] + JG + JC);
        const i2 = P3(s, rad, q, JG + JC, q), j2 = P3(s + 1, rad, q, JG + JC, q);
        quad(g, h, j2, i2, nUp(nx, nz, -0.55), kn * 0.7, kn * 0.62, kn * 0.9 * fl, kn * 0.9 * fr);
      }
    }
    // chamfer up to the broken top, then the fracture surface (a fan from the centre)
    const yt = y1 - cham;
    const [ax, az] = corner(s, rad, yt, last), [bx, bz] = corner(s + 1, rad, yt, last);
    const [ia, iaz] = corner(s, rad - cham, yt, last), [ib, ibz] = corner(s + 1, rad - cham, yt, last);
    const hA = Math.max(yt + 0.02, topAt(ia, iaz)), hB = Math.max(yt + 0.02, topAt(ib, ibz));
    const mx = (ax + bx) / 2 - cx - lx(yt), mz = (az + bz) / 2 - cz - lz(yt), ml = Math.hypot(mx, mz) || 1;
    const nx = mx / ml, nz = mz / ml;
    // the side wall rises to the fracture line (a broken column shows its full face up to the break)
    const kc = k0 * facetK[s];
    tri(ax, yt, az, ib, hB, ibz, bx, yt, bz, nx, 0.25, nz, kc * 1.1, kc * 1.2, kc * 0.86);
    tri(ax, yt, az, ia, hA, iaz, ib, hB, ibz, nx, 0.25, nz, kc * 1.1, kc * 1.25, kc * 1.2);
    // the fracture: fresh, rough, lighter than the weathered faces; lichen and salt on the old flat tops
    const hc = topAt(cx + lx(y1), cz + lz(y1));
    const lich = steep < 0.2 && vnoise(cx * 0.9 + s, cz * 0.9) > 0.62 ? 1.6 : 1.3;
    const ux = ib - ia, uy = hB - hA, uz = ibz - iaz, vx = cx + lx(y1) - ia, vy = hc - hA, vz = cz + lz(y1) - iaz;
    let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const fn = Math.hypot(fx, fy, fz) || 1; if (fy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    tri(cx + lx(y1), hc, cz + lz(y1), ib, hB, ibz, ia, hA, iaz, fx / fn, fy / fn, fz / fn, k0 * lich, k0 * 1.2, k0 * 1.2);
  }
}

/**
 * A fallen column segment (talus): a short hex prism lying on its side, tilted, half sunk.
 * `m` places it: centre, yaw, roll (the axis tips by `tip` out of horizontal).
 */
const _tm = new THREE.Matrix4(), _tv = new THREE.Vector3(), _tn = new THREE.Vector3(), _tq = new THREE.Quaternion(), _te = new THREE.Euler(), _ts = new THREE.Vector3(1, 1, 1);
function pushTalus(out, x, y, z, rad, len, yaw, tip, roll, tone, R) {
  const P = out.pos, N = out.nor, C = out.col;
  _tm.compose(_tv.set(x, y, z), _tq.setFromEuler(_te.set(roll, yaw, Math.PI / 2 + tip, 'YXZ')), _ts);
  _c.setHex(tone).convertSRGBToLinear();
  const k0 = 0.8 + R() * 0.3;
  const h = len / 2, sk = (R() - 0.5) * 0.4;      // a broken, skewed end
  const v = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, r = rad * (0.9 + R() * 0.15);
    v.push([Math.cos(a) * r, -h, Math.sin(a) * r], [Math.cos(a) * r, h + sk * Math.cos(a) * rad, Math.sin(a) * r]);
  }
  const put = (a, b, c, k) => {
    const pa = _tv.set(...a).applyMatrix4(_tm).toArray(), pb = _tv.set(...b).applyMatrix4(_tm).toArray(), pc = _tv.set(...c).applyMatrix4(_tm).toArray();
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], wx = pc[0] - pa[0], wy = pc[1] - pa[1], wz = pc[2] - pa[2];
    _tn.set(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx).normalize();
    // wound outward: away from the prism's centre (x, y, z)
    if (_tn.x * (pa[0] + pb[0] + pc[0] - 3 * x) + _tn.y * (pa[1] + pb[1] + pc[1] - 3 * y) + _tn.z * (pa[2] + pb[2] + pc[2] - 3 * z) < 0) {
      _tn.negate(); P.push(...pa, ...pc, ...pb);
    } else P.push(...pa, ...pb, ...pc);
    for (let i = 0; i < 3; i++) { N.push(_tn.x, _tn.y, _tn.z); C.push(_c.r * k, _c.g * k, _c.b * k); }
  };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6, k = k0 * (0.85 + 0.3 * (i % 2));
    const a0 = v[i * 2], a1 = v[i * 2 + 1], b0 = v[j * 2], b1 = v[j * 2 + 1];
    put(a0, b1, b0, k); put(a0, a1, b1, k);
    put([0, -h, 0], a0, b0, k0 * 1.1);
    put([0, h, 0], b1, a1, k0 * 1.15);
  }
}

/**
 * The Organ Shelf. Returns { mesh, columns: [{x, z, r, y0, y1, rot}], clusters }.
 * `terrain` is ctx.terrain.
 */
export function buildOrganShelf(terrain, clusters = ORGAN) {
  const out = { pos: [], nor: [], col: [] };
  const columns = [];
  const report = [];
  const clusterRecs = [];
  let seed = 9001;
  for (const cl of clusters) {
    const R = mulberry32(seed += 101);
    const diam = 0.95 + R() * 0.4;                        // cluster's mean column diameter (0.6-1.4 m per column)
    /* M1a round 2: packed flat to flat (F05 showed sky between two columns). The pitch is the width across the
     * flats; each hexagon is turned 30 deg to the grid so its flats face its six neighbours, and is 6-10 % wider
     * than the pitch, so neighbours close on each other (a crease, never a slot) through their jogs and leans */
    const pitch = diam * 0.9;
    const fx = Math.sin(cl.face * D2R), fz = -Math.cos(cl.face * D2R);   // toward the face
    const rot = R() * Math.PI / 3;
    const n = Math.ceil(cl.r / pitch) + 1;
    let count = 0, hiMax = 0, hiMin = 99;
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        const lx = (i + (j & 1) * 0.5) * pitch, lz = j * pitch * 0.866;
        const d = Math.hypot(lx, lz);
        // ragged outline: a noisy radius
        const edge = cl.r * (0.82 + 0.3 * vnoise(Math.atan2(lz, lx) * 1.7 + cl.x, cl.z * 0.1));
        if (d > edge) continue;
        const x = cl.x + lx * Math.cos(rot) - lz * Math.sin(rot);
        const z = cl.z + lx * Math.sin(rot) + lz * Math.cos(rot);
        // height: tallest at the back, stepping down toward the face, quantised into risers
        const along = ((x - cl.x) * fx + (z - cl.z) * fz) / cl.r;          // -1 back .. +1 face
        const t = (1 - along) * 0.5;                                       // 1 at the back
        let h = 2 + (cl.top - 2) * Math.pow(Math.max(0, t), 0.8) * (0.75 + 0.5 * vnoise(x * 0.7, z * 0.7));
        // organ pipes: neighbours differ by a riser or two (0.5-1.6 m), so each column reads on its own
        h += (R() - 0.5) * 2.4;
        h = Math.max(2, Math.min(cl.top, Math.round(h / 0.55) * 0.55));
        const rad = (pitch / Math.sqrt(3)) * (1.06 + R() * 0.04);
        const g0 = terrain.getHeight(x, z);
        const g1 = Math.min(g0, terrain.getHeight(x + rad, z), terrain.getHeight(x - rad, z),
          terrain.getHeight(x, z + rad), terrain.getHeight(x, z - rad));
        const y0 = g1 - 0.45, y1 = g0 + h;
        const crot = rot + Math.PI / 6 + (R() - 0.5) * 0.04;
        // the cluster fans out toward its face (1.7-2.6 deg), neighbours nearly parallel (a wider fan opened slots)
        const fan = 0.03 + 0.015 * Math.max(0, along);
        const lean = [fx * fan + (R() - 0.5) * 0.004, fz * fan + (R() - 0.5) * 0.004];
        pushColumn(out, x, z, rad, y0, y1, crot, seed + count * 7, BASALT[(count + (R() * 3 | 0)) % BASALT.length], lean);
        columns.push({ x, z, r: rad, y0, y1, rot: crot, cluster: cl.id });
        hiMax = Math.max(hiMax, h); hiMin = Math.min(hiMin, h);
        count++;
      }
    }
    // M1.1c: the talus apron: fallen column segments and spalled blocks spread in front of the face,
    // densest at the foot, out to 1.8 cluster radii (more under the tall clusters)
    let talus = 0;
    const nT = Math.round(10 + cl.top * 1.6);
    for (let k = 0; k < nT; k++) {
      const spread = (R() - 0.5) * 2.2;                                   // across the face
      const outR = cl.r * (0.85 + Math.pow(R(), 1.6) * 1.0);              // out from the centre
      const sx = -fz, sz = fx;                                            // the face's sideways axis
      const x = cl.x + fx * outR + sx * spread * cl.r, z = cl.z + fz * outR + sz * spread * cl.r;
      const g = terrain.getHeight(x, z);
      const big = R() < 0.35;
      const rad = (diam * (big ? 0.85 + R() * 0.25 : 0.4 + R() * 0.35)) / 2;
      const len = big ? 0.7 + R() * 1.8 : 0.3 + R() * 0.6;
      pushTalus(out, x, g + rad * 0.45, z, rad, len, R() * Math.PI * 2, (R() - 0.5) * 0.5, R() * 1.2, BASALT[(k + 2) % BASALT.length], R);
      talus++;
    }
    report.push({ id: cl.id, columns: count, hMin: +hiMin.toFixed(2), hMax: +hiMax.toFixed(2), talus });
    const mine = columns.filter((c) => c.cluster === cl.id);
    if (mine.length) {
      const y = Math.min(...mine.map((c) => terrain.getHeight(c.x, c.z))), top = Math.max(...mine.map((c) => c.y1));
      clusterRecs.push({ id: cl.id, x: mine.reduce((a, c) => a + c.x, 0) / mine.length, z: mine.reduce((a, c) => a + c.z, 0) / mine.length, y, height: top - y });
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.02, name: 'r5-organ-basalt' });
  organLight(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'organ-shelf-landmark-columns';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, columns, clusters: report, clusterRecs };
}

/**
 * One scoria block (unit size). M1a round 2: round 1's block was an icosahedron quantised into three terraces
 * and drawn wider than tall, so the crater's apron read as stacked masonry cubes. Now: a lumpy, rounded
 * clast (subdivided three times, displaced at two scales, one fresh planar break on a side, a flattened seat), its
 * BANDS dipping across it (the crater's beds as they cooled, 6-7 across a block, not level with the ground),
 * dark vesicle pits in the cinder bands and a lighter dust on the top. Facets stay flat (rock, not soap).
 */
function scoriaBlockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const cut = [0.78, 0.18, 0.6];                                   // the fresh break's normal (block frame)
  const cl = Math.hypot(...cut); cut[0] /= cl; cut[1] /= cl; cut[2] /= cl;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.74 + 0.3 * vnoise(x * 1.7 + 3.1, z * 1.7 + y * 1.3) + 0.12 * vnoise(x * 4.1 - y * 2.3, z * 4.1 + 7.7);
    x *= k; y *= k; z *= k;
    const d = x * cut[0] + y * cut[1] + z * cut[2] - 0.62;         // planed off past the break
    if (d > 0) { x -= cut[0] * d * 0.9; y -= cut[1] * d * 0.9; z -= cut[2] * d * 0.9; }
    if (y < -0.42) y = -0.42 + (y + 0.42) * 0.2;                   // a seat, so it rests on the ground
    p.setXYZ(i, x, y, z);
  }
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  ng.computeVertexNormals();
  // vertex colour: banded scoria (M1.1c) dipping ~20 deg across the block; cinder beds pitted
  const pos = ng.attributes.position, nor = ng.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const bandF = (y + x * 0.36 - z * 0.12) * 3.3 + vnoise(x * 1.6, z * 1.6 + y) * 0.7;
    const band = Math.floor(bandF);
    const tone = SCORIA[((band % SCORIA.length) + SCORIA.length) % SCORIA.length];
    _c.setHex(tone).convertSRGBToLinear();
    let k = 0.9 + 0.2 * (y + 0.5);
    if (bandF - band < 0.12) k *= 0.62;                            // the bedding plane: a dark seam
    if (tone === 0x2e2420 || tone === 0x3a2622 || tone === 0x5e2a1c) k *= vnoise(x * 9.1 + y * 5.3, z * 9.1 - y * 4.7) > 0.66 ? 0.55 : 1;
    if (nor.getY(i) > 0.6) k *= 1.18;                              // dust on the top
    col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/**
 * The red crater's rock. Returns { blocks (InstancedMesh), buttresses (Mesh), count }.
 * Blocks scatter over the talus apron and the benches of the high wall (the
 * ring's plan ellipse, 0.55-1.05 of its radius, on the wall's side), where the
 * ground is 0.4-34 m up and not steeper than ~50 deg.
 */
export function buildCraterRock(terrain) {
  const cx = CRATER.centre.e, cz = -CRATER.centre.n;
  const R = mulberry32(0x7aff);
  const recs = [];
  let tries = 0;
  while (recs.length < 150 && tries++ < 6000) {
    const a = R() * Math.PI * 2;
    // the high wall faces S/SE from its N-by-W crest: keep to the N half
    const bearing = (Math.atan2(Math.cos(a), -Math.sin(a)) / D2R + 360) % 360;
    const dWall = Math.abs(((bearing - CRATER.wallBearing + 540) % 360) - 180);
    if (dWall > 95) continue;
    const d = 0.55 + R() * 0.5;
    const x = cx + Math.cos(a) * CRATER.rx * d, z = cz + Math.sin(a) * CRATER.rz * d;
    const h = terrain.getHeight(x, z);
    if (h < 0.4 || h > 34) continue;
    const sl = terrain.slopeFast ? terrain.slopeFast(x, z) : 0;
    if (sl > 1.2) continue;
    const big = R() < 0.12;
    const s = big ? 1.6 + R() * 1.8 : 0.35 + Math.pow(R(), 2.2) * 1.4;
    recs.push({ x, z, h, s, yaw: R() * Math.PI * 2, tilt: (R() - 0.5) * 0.5, tone: 0.8 + R() * 0.35 });
  }
  const geo = scoriaBlockGeo();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, name: 'r5-tuff' });
  const blocks = new THREE.InstancedMesh(geo, mat, recs.length);
  blocks.name = 'red-crater-landmark-tuff';
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    _p.set(r.x, r.h + r.s * 0.22, r.z);
    _q.setFromEuler(_e.set(r.tilt, r.yaw, r.tilt * 0.6));
    _s.set(r.s * (0.9 + 0.25 * Math.sin(i * 1.7)), r.s * (0.72 + 0.2 * Math.cos(i * 2.3)), r.s * (0.85 + 0.2 * Math.sin(i * 0.9 + 1)));
    _m.compose(_p, _q, _s);
    blocks.setMatrixAt(i, _m);
    blocks.setColorAt(i, _c.setRGB(r.tone, r.tone, r.tone));   // the block's bands are in its vertices; the instance only varies its brightness
  }
  blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  blocks.computeBoundingSphere();

  // seven bedded buttress outcrops at the cliff foot: stacks of 3-6 tuff beds
  const out = { pos: [], nor: [], col: [] };
  const buttress = [];
  let b = 0;
  for (let k = 0; k < 40 && buttress.length < 7; k++) {
    const bearing = CRATER.wallBearing - 80 + R() * 160;
    const a = Math.atan2(-Math.cos(bearing * D2R), Math.sin(bearing * D2R));
    const x = cx + Math.cos(a) * CRATER.rx * 0.62, z = cz + Math.sin(a) * CRATER.rz * 0.62;
    const h = terrain.getHeight(x, z);
    if (h < 1 || h > 18) continue;
    if (buttress.some((q) => Math.hypot(q.x - x, q.z - z) < 18)) continue;
    // M1.1c: banded scoria, 6-12 beds 0.35-1.2 m thick, each a different colour from the last and
    // set in or out from it (hard cinder beds stand out, soft ash beds are eaten back)
    let y = h - 1.2;
    const beds = 6 + (R() * 7 | 0);
    let w = 4.5 + R() * 3.5;
    let si = (R() * SCORIA.length) | 0;
    for (let i = 0; i < beds; i++) {
      const t = 0.35 + R() * 0.85;
      const rel = i % 2 ? 1.08 + R() * 0.1 : 0.86 + R() * 0.08;
      si = (si + 1 + ((R() * 3) | 0)) % SCORIA.length;
      pushSlab(out, x + (R() - 0.5) * 1.0, z + (R() - 0.5) * 1.0, y, t, w * rel, w * rel * (0.5 + R() * 0.3), a + (R() - 0.5) * 0.4, SCORIA[si], R);
      y += t; w *= 0.88 + R() * 0.1;
    }
    buttress.push({ x, z, top: y });
    b++;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  bg.computeBoundingBox(); bg.computeBoundingSphere();
  const buttresses = new THREE.Mesh(bg, mat);
  buttresses.name = 'red-crater-landmark-beds';
  buttresses.castShadow = true;
  buttresses.receiveShadow = true;
  return { blocks, buttresses, count: recs.length, buttress, geo, bgeo: bg, mat };
}

/** A bedded slab: an irregular 11-sided prism drawn in toward its top, with a pale top and a darker underside. */
function pushSlab(out, cx, cz, y0, t, w, d, yaw, tone, R) {
  const P = out.pos, N = out.nor, C = out.col;
  // M1a round 2: 11 sides, more ragged, the top drawn in (an eroded bed, not a cut paver)
  const k = 11;
  const pts = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const j = 0.72 + R() * 0.46;
    const lx = Math.cos(a) * w * 0.5 * j, lz = Math.sin(a) * d * 0.5 * j;
    pts.push([cx + lx * Math.cos(yaw) - lz * Math.sin(yaw), cz + lx * Math.sin(yaw) + lz * Math.cos(yaw)]);
  }
  _c.setHex(tone).convertSRGBToLinear();
  const push = (ax, ay, az, bx, by, bz, qx, qy, qz, kk) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = qx - ax, vy = qy - ay, vz = qz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    P.push(ax, ay, az, bx, by, bz, qx, qy, qz);
    N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    for (let i = 0; i < 3; i++) C.push(_c.r * kk, _c.g * kk, _c.b * kk);
  };
  const y1 = y0 + t;
  const ins = 0.84 + R() * 0.08;
  const top = pts.map(([x, z]) => [cx + (x - cx) * ins, cz + (z - cz) * ins]);
  for (let i = 0; i < k; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % k];
    const [tax, taz] = top[i], [tbx, tbz] = top[(i + 1) % k];
    const kk = 0.85 + R() * 0.2;
    push(ax, y0, az, tax, y1, taz, tbx, y1, tbz, kk);
    push(ax, y0, az, tbx, y1, tbz, bx, y0, bz, kk);
    push(cx, y1, cz, tbx, y1, tbz, tax, y1, taz, 1.22);
    push(cx, y0, cz, ax, y0, az, bx, y0, bz, 0.6);
  }
}
