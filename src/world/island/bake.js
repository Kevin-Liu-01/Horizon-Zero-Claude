/**
 * THE ISLAND BAKE (world-ground W1): the pure jobs behind `terrain.js`, run on the worker
 * pool at boot and proven byte-identical to the single-thread build (`A-world-size`,
 * plan §8.3 pool-terrain-build). No THREE; all buffers are typed arrays.
 *
 *   heights        Float32  H[n²], the render grid; gameplay reads it bilinear
 *   shade          Int16 normals (xyz + pad), Uint8 aTint (sRGB rgb + blockout amount)
 *   masks          Uint8 RGBA ×3 at 512² over the world square
 *                    maskA  R salt beyond the field  G basalt  B shingle  A wet silt
 *                    maskB  R marram cover  G packed track  B damp ground  A wind-pale sand
 *                    shore  R signed coast distance  G ground height  B the Glass  A crater
 *   pan            Uint8 RGBA at 256² over PAN_BOX
 *                    R salt crust  G brine (mirror)  B hue (white..pink..rust)  A cell interior
 */
import { MESH_SPAN, MESH_SEGS, WORLD_SIZE, ISLAND_SCALE as S } from './extent.js';
import { heightAt, biomesAt, authored, coverAt, ss, fbm, GLASS_LEVEL } from './recipe.js';
import { SALT_FIELD as SF } from './sites.js';

export const MASK_N = 512;
export const PAN_N = 256;
/** World box of the pan texture (x0, z0, size), metres. */
export const PAN_BOX = Object.freeze({ x0: -434 * S, z0: 144 * S, size: 244 * S });
/** Encodings shared with the shaders (groundShader.js) and terrain.js. */
export const SHORE_ENC = Object.freeze({ dMin: -48, dMax: 80, hMin: -6, hMax: 12 });

export const GRID = Object.freeze({
  span: MESH_SPAN, segs: MESH_SEGS, side: MESH_SEGS + 1, step: MESH_SPAN / MESH_SEGS, half: MESH_SPAN / 2,
});

/** Grid coordinate per row/column, as float32 (the mesh's own values). */
function gridCoords() {
  const X = new Float32Array(GRID.side);
  for (let k = 0; k < GRID.side; k++) X[k] = k * GRID.step - GRID.half;
  return X;
}

export function bakeHeights(r0, r1) {
  const side = GRID.side, X = gridCoords(), out = new Float32Array((r1 - r0) * side);
  for (let iz = r0; iz < r1; iz++) {
    const z = X[iz], o = (iz - r0) * side;
    for (let ix = 0; ix < side; ix++) out[o + ix] = heightAt(X[ix], z);
  }
  return out;
}

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
/** Blockout tints per biome (bible §9.1) + a second tone each for mottling. sRGB bytes. */
const TINT = [
  [hex(0x2a2826), hex(0x1f1e20)],       // pans        black sand
  [hex(0x2a2523), hex(0x3e342c)],       // holds       lapilli, dust
  [hex(0x2c2826), hex(0x56463a)],       // malpais     aa, rust lichen
  [hex(0x3e5b3a), hex(0x56603f)],       // cloudline   laurel, felt moss
  [hex(0x45423f), hex(0x56603f)],       // flank       basalt, sparse grass
  [hex(0xb9ae98), hex(0xcfc6b4)],       // caldera     pumice
];
const CRATER_T = hex(0x8e3b23), CRATER_T2 = hex(0x5e2a1c);

const _w = new Float64Array(6);

/**
 * Shading normals (central differences) + aTint for rows [r0, r1).
 * `H` is the finished height grid.
 */
export function bakeShade(H, r0, r1) {
  const { side, step, segs } = GRID, X = gridCoords();
  const rows = r1 - r0;
  const normals = new Int16Array(rows * side * 4), tint = new Uint8Array(rows * side * 4);
  for (let iz = r0; iz < r1; iz++) {
    const z = X[iz];
    for (let ix = 0; ix < side; ix++) {
      const i = iz * side + ix, o = ((iz - r0) * side + ix) * 4, x = X[ix];
      const hL = H[ix > 0 ? i - 1 : i], hR = H[ix < segs ? i + 1 : i];
      const hD = H[iz > 0 ? i - side : i], hU = H[iz < segs ? i + side : i];
      const gx = (hR - hL) / (((ix < segs ? 1 : 0) + (ix > 0 ? 1 : 0)) * step);
      const gz = (hU - hD) / (((iz < segs ? 1 : 0) + (iz > 0 ? 1 : 0)) * step);
      const il = 1 / Math.sqrt(gx * gx + gz * gz + 1);
      normals[o] = Math.round(-gx * il * 32767);
      normals[o + 1] = Math.round(il * 32767);
      normals[o + 2] = Math.round(-gz * il * 32767);
      normals[o + 3] = 0;
      biomesAt(x, z, _w);
      const m = fbm(x * 0.02 + 7, z * 0.02 - 3, 2);
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 6; k++) {
        const A = TINT[k][0], B = TINT[k][1];
        r += _w[k] * (A[0] + (B[0] - A[0]) * m);
        g += _w[k] * (A[1] + (B[1] - A[1]) * m);
        b += _w[k] * (A[2] + (B[2] - A[2]) * m);
      }
      // full blockout tint outside the Pans, none on them, except the red crater
      let k = 1 - _w[0];
      const cr = authored.crater(x, z);
      if (cr > 0.01) {
        const t = ss(0.02, 0.5, cr), v = fbm(x * 0.05, z * 0.05 + 9, 3);
        const cA = CRATER_T, cB = CRATER_T2;
        r += ((cA[0] + (cB[0] - cA[0]) * v) - r) * t;
        g += ((cA[1] + (cB[1] - cA[1]) * v) - g) * t;
        b += ((cA[2] + (cB[2] - cA[2]) * v) - b) * t;
        k = Math.max(k, t * 0.92);
      }
      tint[o] = r; tint[o + 1] = g; tint[o + 2] = b; tint[o + 3] = Math.min(255, k * 255);
    }
  }
  return { normals, tint };
}

function sampleH(H, x, z) {
  const { side, step, half } = GRID;
  const fx = (x + half) / step, fz = (z + half) / step;
  const ix = fx < 0 ? 0 : fx >= side - 1 ? side - 2 : fx | 0;
  const iz = fz < 0 ? 0 : fz >= side - 1 ? side - 2 : fz | 0;
  const tx = fx - ix, tz = fz - iz, o = iz * side + ix;
  const a = H[o] + (H[o + 1] - H[o]) * tx;
  const b = H[o + side] + (H[o + side + 1] - H[o + side]) * tx;
  return a + (b - a) * tz;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/**
 * The bytes of one mask texel at a world point, in maskA / maskB / shore order.
 * Pure (a function of the recipe + H). `terrain.maskAudit()` re-derives these.
 */
export function maskTexel(H, x, z, out) {
  const c = authored.coast(x, z);
  const h = sampleH(H, x, z);
  const e = 2;
  const gx = (sampleH(H, x + e, z) - sampleH(H, x - e, z)) / (2 * e);
  const gz = (sampleH(H, x, z + e) - sampleH(H, x, z - e)) / (2 * e);
  const slope = Math.sqrt(gx * gx + gz * gz);
  biomesAt(x, z, _w);
  const pans = _w[0];
  const glass = authored.glass(x, z);
  const cr = authored.crater(x, z);
  const sd = authored.shelf(x, z);
  const fk = authored.fieldK(x, z);
  const track = authored.track(x, z);
  const nA = fbm(x * 0.06 + 3, z * 0.06, 3), nB = fbm(x * 0.19, z * 0.19 + 5, 2);

  // salt beyond the cells: efflorescence blowing off the field, and white rime on low flats
  const rime = pans * ss(0.46, 0.62, nA + nB * 0.15) * ss(0.2, 0.9, fk + (1 - ss(1.2, 2.6, h)) * 0.32) * (1 - ss(0.9, 1, fk));
  // basalt: the Shelf's table, steep ground, the reef at the tide line, the crater's crags
  const shelf = ss(-3, 4, sd);
  const reef = pans * (1 - ss(-1.5, 4, Math.abs(c + 3))) * ss(0.56, 0.68, fbm(x * 0.035 + 21, z * 0.035, 3));
  let rock = Math.max(ss(0.72, 1.15, slope), shelf * ss(0.28, 0.5, nA + 0.14), reef);
  rock = Math.max(rock, cr * ss(0.5, 0.95, slope) * 0.7);
  // shingle: the storm berm, and a fringe at the shelf's foot
  const berm = pans * ss(2, 7, c) * (1 - ss(10, 22, c)) * ss(0.36, 0.54, fbm(x * 0.03 + 5, z * 0.03 + 2, 2) + nB * 0.12);
  const foot = pans * ss(-11, -5, sd) * (1 - ss(-1, 3, sd)) * ss(0.38, 0.6, nA);
  const shingle = Math.max(berm, foot);
  // wet silt: the Glass's margin, cut-off hollows behind the dunes
  const silt = Math.max((1 - ss(1.0, 1.42, glass)) * 0.95, pans * (1 - ss(0.25, 0.8, h)) * ss(16, 40, c) * (1 - fk));
  // damp dark ground in hollows; wind-pale sand on crests
  const damp = pans * clamp01(1 - h / 2.2) * ss(8, 40, c) * 0.7;
  const pale = pans * ss(0.46, 0.7, nA) * ss(0.2, 2.6, h);

  out[0] = clamp255(rime * 255);
  out[1] = clamp255(rock * 255);
  out[2] = clamp255(shingle * (1 - rock) * 255);
  out[3] = clamp255(silt * 255);
  out[4] = clamp255(coverAt(x, z) * 255);
  out[5] = clamp255(track * 255);
  out[6] = clamp255(damp * 255);
  out[7] = clamp255(pale * 255);
  out[8] = clamp255(((c - SHORE_ENC.dMin) / (SHORE_ENC.dMax - SHORE_ENC.dMin)) * 255);
  out[9] = clamp255(((h - SHORE_ENC.hMin) / (SHORE_ENC.hMax - SHORE_ENC.hMin)) * 255);
  out[10] = clamp255((1 - ss(1.1, 1.5, glass)) * 255);
  out[11] = clamp255(cr * 255);
  return out;
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Mask rows [r0, r1). */
export function bakeMasks(H, r0, r1) {
  const N = MASK_N, scale = WORLD_SIZE / N, n = (r1 - r0) * N * 4, v = new Uint8Array(12);
  const a = new Uint8Array(n), b = new Uint8Array(n), s = new Uint8Array(n);
  for (let iz = r0; iz < r1; iz++) {
    const z = (iz + 0.5) * scale - WORLD_SIZE / 2;
    for (let ix = 0; ix < N; ix++) {
      const x = (ix + 0.5) * scale - WORLD_SIZE / 2;
      maskTexel(H, x, z, v);
      const o = ((iz - r0) * N + ix) * 4;
      a[o] = v[0]; a[o + 1] = v[1]; a[o + 2] = v[2]; a[o + 3] = v[3];
      b[o] = v[4]; b[o + 1] = v[5]; b[o + 2] = v[6]; b[o + 3] = v[7];
      s[o] = v[8]; s[o + 1] = v[9]; s[o + 2] = v[10]; s[o + 3] = v[11];
    }
  }
  return [a, b, s];
}

/** The salt field, cell by cell, at ≈ 1 m. */
export function bakePan() {
  const N = PAN_N, { x0, z0, size } = PAN_BOX, out = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    const z = z0 + ((j + 0.5) / N) * size;
    for (let i = 0; i < N; i++) {
      const x = x0 + ((i + 0.5) / N) * size;
      const P = authored.pan(x, z);
      if (P.kind < 0) continue;
      const o = (j * N + i) * 4;
      out[o] = clamp255(P.salt * P.inside * 255);
      out[o + 1] = clamp255(P.brine * P.inside * 255);
      out[o + 2] = clamp255(P.hue * 255);
      out[o + 3] = clamp255(P.inside * 255);
    }
  }
  return out;
}

export { GLASS_LEVEL, SF };
