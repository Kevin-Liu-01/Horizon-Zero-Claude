/**
 * CALIMA — the faction atlases and the shared hair + wrap atlas (settlements; R56; plan §4.1 "1024²
 * faction atlas + shared 512² normal/ORM", §4.4). Node only, deterministic.
 *
 * NEUTRAL BY DESIGN. Every texel here is a neutral value carrying form (folds, weave, grain, wear) and
 * the hue is in COLOR_0, so one 1024² atlas dresses every archetype of a faction: an orchil matron, a
 * linen raker and a tarred caulker read the same texels (the mask-aware tint of E13, done per vertex).
 * Baked contact shade rides in the same vertex colour.
 *
 *   ATLAS.mco       the source outfit texture, its used islands normalised, in the top-left 768²
 *   ATLAS.sw.*      procedural swatches in the free L: linen, wool, leather, palm, wicker, wood,
 *                   brass, iron, rope, salt, felt, panelA + panelB (long cloth with long folds)
 *
 * `hairAtlas` is kit `paintWrapAtlas` with neutral dyes: cloth takes a dye per vertex, coils a hair
 * colour; only the lashes are painted as they are.
 */
import sharp from 'sharp';
import path from 'node:path';
import { MCO_DIR, readGltf, cleanDoc, noise3, smooth, srcRoot, writeSkinned } from './kit/face.mjs';
import { webp } from './kit/skin.mjs';
import { paintClothPanel, paintFrayEnd, WRAP_ATLAS } from './kit/wrap.mjs';
import { paintCoilTile, paintCoilFringe, paintLockTile, paintLashes } from './kit/hair.mjs';
import { Document } from '@gltf-transform/core';

export const W = 1024;
export const BLOCK = 768;
const srgb2lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** The atlas's neutral value: `dye()` divides by its linear value. */
export const NEUTRAL_BYTE = 222;
export const NEUTRAL = srgb2lin(NEUTRAL_BYTE / 255);
/** The hair tile's mean value, for tinting coils by vertex. */
export const HAIR_NEUTRAL = srgb2lin(150 / 255);

export const ATLAS = {
  W,
  mco: [0, 0, BLOCK, BLOCK],
  sw: {
    linen: [768, 0, 256, 128],
    wool: [768, 128, 256, 128],
    leather: [768, 256, 256, 128],
    felt: [768, 384, 256, 96],
    palm: [768, 480, 128, 128],
    wicker: [896, 480, 128, 128],
    wood: [768, 608, 128, 96],
    rope: [896, 608, 128, 48],
    brass: [896, 656, 64, 48],
    iron: [960, 656, 64, 48],
    salt: [768, 704, 128, 64],
    panelB: [896, 704, 128, 64],
    panelA: [0, 768, 512, 256],
    panelC: [512, 768, 512, 256],
  },
};

/** px rect -> a UV rect [u0, v0, du, dv] with a small inset (mips do not bleed the neighbour in). */
export const uvRect = (name, inset = 3) => {
  const r = ATLAS.sw[name];
  return [(r[0] + inset) / W, (r[1] + inset) / W, (r[2] - inset * 2) / W, (r[3] - inset * 2) / W];
};

/** Source UV -> atlas UV. */
export const mcoUV = (u, v) => [Math.min(1, Math.max(0, u)) * (BLOCK / W), Math.min(1, Math.max(0, v)) * (BLOCK / W)];

const newBuf = () => {
  const b = { base: Buffer.alloc(W * W * 4), normal: Buffer.alloc(W * W * 3), orm: Buffer.alloc(W * W * 3) };
  for (let i = 0; i < W * W; i++) {
    b.base[i * 4] = NEUTRAL_BYTE; b.base[i * 4 + 1] = NEUTRAL_BYTE; b.base[i * 4 + 2] = NEUTRAL_BYTE; b.base[i * 4 + 3] = 255;
    b.normal[i * 3] = 128; b.normal[i * 3 + 1] = 128; b.normal[i * 3 + 2] = 255;
    b.orm[i * 3] = 255; b.orm[i * 3 + 1] = 225; b.orm[i * 3 + 2] = 0;
  }
  return b;
};

const fbm = (x, y, z = 0) => noise3(x, y, z) * 0.55 + noise3(x * 2.1, y * 2.1, z + 3) * 0.3 + noise3(x * 4.3, y * 4.3, z + 7) * 0.15;
const clampB = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** A procedural tile: fn(x, y, out) sets out.h (m), out.l (0..1.15 over the neutral), out.rough, out.metal, out.ao. */
function tile(buf, rect, fn, { mm = 0.6, kN = 1 } = {}) {
  const [x0, y0, w, h] = rect;
  const H = new Float32Array(w * h), L = new Float32Array(w * h), R = new Float32Array(w * h), M = new Float32Array(w * h), A = new Float32Array(w * h);
  const o = { h: 0, l: 1, rough: 0.9, metal: 0, ao: 1 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    o.h = 0; o.l = 1; o.rough = 0.9; o.metal = 0; o.ao = 1;
    fn(x, y, o);
    const i = y * w + x;
    H[i] = o.h; L[i] = o.l; R[i] = o.rough; M[i] = o.metal; A[i] = o.ao;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const a = H[y * w + Math.min(w - 1, x + 1)], b = H[y * w + Math.max(0, x - 1)], c = H[Math.min(h - 1, y + 1) * w + x], d = H[Math.max(0, y - 1) * w + x];
    const nx = -(a - b) / (2 * mm * 1e-3) * kN, ny = (c - d) / (2 * mm * 1e-3) * kN, nl = Math.hypot(nx, ny, 1);
    const p = (y0 + y) * W + x0 + x;
    buf.base[p * 4] = clampB(NEUTRAL_BYTE * L[i]); buf.base[p * 4 + 1] = clampB(NEUTRAL_BYTE * L[i]); buf.base[p * 4 + 2] = clampB(NEUTRAL_BYTE * L[i]); buf.base[p * 4 + 3] = 255;
    buf.normal[p * 3] = clampB((nx / nl * 0.5 + 0.5) * 255); buf.normal[p * 3 + 1] = clampB((ny / nl * 0.5 + 0.5) * 255); buf.normal[p * 3 + 2] = clampB((1 / nl * 0.5 + 0.5) * 255);
    buf.orm[p * 3] = clampB(A[i] * 255); buf.orm[p * 3 + 1] = clampB(R[i] * 255); buf.orm[p * 3 + 2] = clampB(M[i] * 255);
  }
}

function paintSwatches(buf) {
  const S = ATLAS.sw;
  const pale = { dye: '#E2DFD8', dye2: '#D6D3CC', dye3: '#DAD6CE' };
  paintClothPanel(buf, { rect: S.linen, period: 256, W, ...pale, seed: 31, creases: 5, sigma: [0.05, 0.14], amp: [0.0004, 0.001], fringe: 0, mmU: 0.7, mmV: 0.7 });
  paintClothPanel(buf, { rect: S.panelA, period: 512, W, ...pale, seed: 37, creases: 11, sigma: [0.018, 0.06], amp: [0.0006, 0.0022], fringe: 0, mmU: 1.5, mmV: 1.5, weave: 0.7, foldK: 2.6, shadeK: 1.2, drag: 3 });
  paintClothPanel(buf, { rect: S.panelC, period: 512, W, ...pale, seed: 43, creases: 7, sigma: [0.03, 0.09], amp: [0.0008, 0.0026], fringe: 0, mmU: 1.5, mmV: 1.5, weave: 0.7, foldK: 2.4, shadeK: 1.2, drag: 2.5, rough: 0.96 });
  paintClothPanel(buf, { rect: S.panelB, period: 128, W, ...pale, seed: 47, creases: 4, fringe: 0 });
  // wool: coarse, felted, a slubby weave
  tile(buf, S.wool, (x, y, o) => {
    const n = fbm(x * 0.16, y * 0.16, 11), f = fbm(x * 0.55, y * 0.55, 13);
    const ov = ((Math.floor(x / 3) + Math.floor(y / 3)) & 1) === 0;
    o.h = 0.00024 * n + 0.00012 * (ov ? 1 : 0.4) + 0.00006 * f;
    o.l = 0.82 + 0.2 * n + (ov ? 0.04 : -0.03);
    o.rough = 0.97; o.ao = 0.75 + 0.25 * n;
  }, { mm: 0.7 });
  // felt: matted, no thread
  tile(buf, S.felt, (x, y, o) => {
    const n = fbm(x * 0.07, y * 0.09, 17), f = fbm(x * 0.7, y * 0.7, 19);
    o.h = 0.0005 * n + 0.00008 * f;
    o.l = 0.82 + 0.16 * n + 0.05 * (f - 0.5);
    o.rough = 0.98; o.ao = 0.8 + 0.2 * n;
  }, { mm: 0.8 });
  // leather: pores, cracks along wear, a worn lighter ground
  tile(buf, S.leather, (x, y, o) => {
    const n = fbm(x * 0.05, y * 0.05, 23), g = fbm(x * 0.42, y * 0.42, 29);
    const cell = Math.abs(noise3(x * 0.16, y * 0.16, 31) - 0.5);
    const crack = 1 - smooth(0.0, 0.05, cell);
    o.h = 0.00035 * g - 0.0002 * crack + 0.0005 * n;
    o.l = 0.62 + 0.42 * n + 0.1 * (g - 0.5) - 0.14 * crack;
    o.rough = 0.56 + 0.3 * (1 - n); o.ao = 1 - 0.3 * crack;
  }, { mm: 0.7 });
  // palm: flat plaited strips, herringbone
  tile(buf, S.palm, (x, y, o) => {
    const P = 10, a = x + y, b = x - y + 512;
    const ia = Math.floor(a / P), ib = Math.floor(b / P), over = ((ia + ib) & 1) === 0;
    const fa = (a % P) / P, fb = (b % P) / P;
    const f = over ? fa : fb, round = 1 - Math.abs(f - 0.5) * 2;
    const tone = noise3(ia * 0.7, ib * 0.7, over ? 37 : 41);
    o.h = 0.0004 * (over ? 1 : 0.55) * (0.5 + 0.5 * round);
    o.l = 0.82 + 0.2 * tone + 0.06 * round + (over ? 0.03 : -0.05);
    o.rough = 0.72; o.ao = 0.74 + 0.26 * round;
  }, { mm: 0.5 });
  // wicker: over-under round rods
  tile(buf, S.wicker, (x, y, o) => {
    const Px = 14, Py = 9;
    const row = Math.floor(y / Py), f = (y % Py) / Py;
    const over = ((Math.floor(x / Px) + row) & 1) === 0;
    const fx = (x % Px) / Px;
    const bulge = Math.sin(fx * Math.PI);
    const round = Math.sin(f * Math.PI);
    const tone = noise3(row * 0.9, Math.floor(x / Px) * 0.4, 43);
    o.h = 0.0011 * round * (over ? 0.55 + 0.45 * bulge : 0.35);
    o.l = (0.66 + 0.34 * tone) * (0.62 + 0.42 * round) * (over ? 1.05 : 0.86);
    o.rough = 0.66; o.ao = 0.55 + 0.45 * round;
  }, { mm: 0.5, kN: 0.7 });
  // wood: long grain along V
  tile(buf, S.wood, (x, y, o) => {
    const g = fbm(x * 0.32, y * 0.02, 47), r = fbm(x * 0.06, y * 0.01, 53);
    const ring = Math.sin((r * 18 + g * 3));
    o.h = 0.0002 * g;
    o.l = 0.72 + 0.16 * ring * 0.5 + 0.28 * g;
    o.rough = 0.68; o.ao = 0.85 + 0.15 * g;
  }, { mm: 0.6 });
  // rope: laid strands
  tile(buf, S.rope, (x, y, o) => {
    const f = ((x * 0.5 + y) % 9) / 9;
    const round = Math.sin(f * Math.PI);
    const n = fbm(x * 0.5, y * 0.5, 59);
    o.h = 0.0007 * round; o.l = (0.6 + 0.4 * round) * (0.82 + 0.3 * n); o.rough = 0.92; o.ao = 0.55 + 0.45 * round;
  }, { mm: 0.5 });
  // brass, worked and tarnished in the low places: metal, hue by vertex
  tile(buf, S.brass, (x, y, o) => {
    const n = fbm(x * 0.18, y * 0.18, 61), s = fbm(x * 1.2, y * 0.15, 67);
    o.h = 0.00006 * s; o.l = 0.75 + 0.3 * n; o.rough = 0.34 + 0.34 * (1 - n); o.metal = 0.92; o.ao = 0.8 + 0.2 * n;
  }, { mm: 0.5 });
  tile(buf, S.iron, (x, y, o) => {
    const n = fbm(x * 0.22, y * 0.22, 71), s = fbm(x * 0.9, y * 0.9, 73);
    o.h = 0.00012 * s; o.l = 0.5 + 0.34 * n; o.rough = 0.55 + 0.3 * s; o.metal = 0.8; o.ao = 0.85 + 0.15 * n;
  }, { mm: 0.5 });
  // salt crust: bright, crackled, lumps
  tile(buf, S.salt, (x, y, o) => {
    const n = fbm(x * 0.2, y * 0.2, 79), f = fbm(x * 0.9, y * 0.9, 83);
    const crack = 1 - smooth(0, 0.04, Math.abs(noise3(x * 0.1, y * 0.1, 89) - 0.5));
    o.h = 0.0008 * n + 0.0002 * f - 0.0003 * crack;
    o.l = 1.08 + 0.1 * f - 0.28 * crack; o.rough = 0.86; o.ao = 0.85 + 0.15 * n - 0.2 * crack;
  }, { mm: 0.6 });
}

/**
 * The source outfit texture, neutral: each island normalised to its own bright end, so a dark
 * trouser and a pale shirt both carry their folds at the same value and take any dye.
 */
async function paintMco(buf, family) {
  const SRC = srcRoot();
  const dir = MCO_DIR(SRC);
  const size = 1536;      // the working size: a decode of the 4096² source, reduced
  const rd = async (n) => sharp(path.join(dir, `T_${family}_${n}.png`)).resize(size, size, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const base = await rd('BaseColor'), nrm = await rd('Normal'), orm = await rd('ORM');
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) lum[i] = (base[i * 3] * 0.3 + base[i * 3 + 1] * 0.55 + base[i * 3 + 2] * 0.15) / 255;
  // which texels each part's UV covers, labelled by connected island of the used mask
  const parts = PARTS[family];
  const used = new Uint8Array(size * size);
  for (const part of parts) {
    const doc = await readGltf(path.join(dir, `${part}.gltf`));
    cleanDoc(doc);
    for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) {
      if (/Regular/.test(pr.getMaterial()?.getName() || '')) continue;
      const UV = pr.getAttribute('TEXCOORD_0'), idx = pr.getIndices().getArray(), u = [[0, 0], [0, 0], [0, 0]];
      for (let t = 0; t < idx.length; t += 3) {
        for (let k = 0; k < 3; k++) UV.getElement(idx[t + k], u[k]);
        const ax = u[0][0] * size, ay = u[0][1] * size, bx = u[1][0] * size, by = u[1][1] * size, cx = u[2][0] * size, cy = u[2][1] * size;
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
        const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area, w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
          if (w0 >= -0.06 && w1 >= -0.06 && w0 + w1 <= 1.06) used[y * size + x] = 1;
        }
      }
    }
  }
  const label = new Int32Array(size * size).fill(-1);
  const stack = [];
  let isl = 0;
  const hi = [];
  for (let s = 0; s < size * size; s++) {
    if (!used[s] || label[s] >= 0) continue;
    const vals = [];
    label[s] = isl; stack.push(s);
    while (stack.length) {
      const q = stack.pop();
      vals.push(lum[q]);
      const x = q % size, y = Math.floor(q / size);
      for (const n of [x > 0 ? q - 1 : -1, x < size - 1 ? q + 1 : -1, y > 0 ? q - size : -1, y < size - 1 ? q + size : -1]) {
        if (n >= 0 && used[n] && label[n] < 0) { label[n] = isl; stack.push(n); }
      }
    }
    vals.sort((a, b) => a - b);
    hi.push(Math.max(0.05, vals[Math.floor(vals.length * 0.82)]));
    isl++;
  }
  // write into the 768² block (box filter from 1536 is 2:1)
  for (let y = 0; y < BLOCK; y++) for (let x = 0; x < BLOCK; x++) {
    let acc = 0, wsum = 0, nx = 0, ny = 0, nz = 0, ao = 0, ro = 0, me = 0;
    for (let k = 0; k < 4; k++) {
      const sx = x * 2 + (k & 1), sy = y * 2 + (k >> 1), s = sy * size + sx;
      nx += nrm[s * 3]; ny += nrm[s * 3 + 1]; nz += nrm[s * 3 + 2];
      ao += orm[s * 3]; ro += orm[s * 3 + 1]; me += orm[s * 3 + 2];
      if (label[s] < 0) continue;
      const rel = Math.min(1.15, lum[s] / hi[label[s]]);
      acc += Math.pow(Math.max(0.06, rel), 0.62); wsum++;
    }
    const p = y * W + x;
    const v = wsum ? acc / wsum : 1;
    // a light weave over the source's folds, so the shared atlas holds up at dialogue range
    const ov = ((Math.floor(x / 2) + Math.floor(y / 2)) & 1) === 0;
    const grain = (ov ? 1.015 : 0.985) * (0.97 + 0.06 * noise3(x * 0.33, y * 0.33, 97));
    const b = clampB(NEUTRAL_BYTE * v * grain);
    buf.base[p * 4] = b; buf.base[p * 4 + 1] = b; buf.base[p * 4 + 2] = b; buf.base[p * 4 + 3] = 255;
    buf.normal[p * 3] = clampB(nx / 4 + (ov ? 3 : -3)); buf.normal[p * 3 + 1] = clampB(ny / 4 + (ov ? -3 : 3)); buf.normal[p * 3 + 2] = clampB(nz / 4);
    buf.orm[p * 3] = clampB(ao / 4); buf.orm[p * 3 + 1] = clampB(Math.max(150, ro / 4)); buf.orm[p * 3 + 2] = clampB(me / 4 > 110 ? me / 4 : 0);
  }
}

export const PARTS = {
  Peasant: ['Female_Peasant_Arms', 'Female_Peasant_Body', 'Female_Peasant_Feet', 'Female_Peasant_Legs', 'Male_Peasant_Arms', 'Male_Peasant_Body', 'Male_Peasant_Feet', 'Male_Peasant_Legs'],
  Ranger: ['Female_Ranger_Arms', 'Female_Ranger_Body', 'Female_Ranger_Feet', 'Female_Ranger_Legs', 'Male_Ranger_Arms', 'Male_Ranger_Body', 'Male_Ranger_Feet_Boots', 'Male_Ranger_Legs'],
};

/** Whatever the row needs as a body: a tiny triangle under the shared material (assets.normalize wants a bbox). */
function carrier(doc, name, material) {
  const buf = doc.getRoot().listBuffers()[0] || doc.createBuffer();
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0])))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array([0, 0, 1, 0, 0, 1])))
    .setIndices(acc('SCALAR', new Uint32Array([0, 1, 2])))
    .setMaterial(material);
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
  const scene = doc.createScene('atlas').addChild(node);
  doc.getRoot().setDefaultScene(scene);
}

export async function buildFactionAtlas(file, { faction, family, provenance }) {
  const buf = newBuf();
  await paintMco(buf, family);
  paintSwatches(buf);
  const doc = new Document();
  doc.createBuffer();
  const tex = async (name, bytes) => doc.createTexture(name).setImage(bytes).setMimeType('image/webp').setURI(`${name}.webp`);
  // the base goes out RGB: the outfit is opaque
  const rgb = Buffer.alloc(W * W * 3);
  for (let i = 0; i < W * W; i++) { rgb[i * 3] = buf.base[i * 4]; rgb[i * 3 + 1] = buf.base[i * 4 + 1]; rgb[i * 3 + 2] = buf.base[i * 4 + 2]; }
  const base = await tex(`npc-${faction}-base`, await webp(rgb, W, { quality: 88 }));
  const normal = await tex(`npc-${faction}-normal`, await webp(buf.normal, W, { to: 512, quality: 88 }));
  const orm = await tex(`npc-${faction}-orm`, await webp(buf.orm, W, { to: 512, quality: 82, kernel: 'mitchell' }));
  const mat = doc.createMaterial(`MI_Npc_${faction}`).setBaseColorTexture(base).setNormalTexture(normal).setMetallicRoughnessTexture(orm).setOcclusionTexture(orm)
    .setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(false).setEmissiveTexture(base).setEmissiveFactor([0.07, 0.07, 0.07]);
  carrier(doc, `atlas-${faction}`, mat);
  const stats = await writeSkinned(doc, file, { provenance, extras: { r5NpcAtlas: { faction, neutral: NEUTRAL_BYTE, block: BLOCK, swatches: Object.keys(ATLAS.sw) } } });
  return stats;
}

/** The shared hair + wrap atlas: WRAP_ATLAS at 512², neutral cloth, a mid-grey coil, real lashes. */
export async function buildHairAtlas(file, { provenance }) {
  const A = WRAP_ATLAS, Wh = A.W;
  const buf = { base: Buffer.alloc(Wh * Wh * 4), normal: Buffer.alloc(Wh * Wh * 3), orm: Buffer.alloc(Wh * Wh * 3) };
  for (let i = 0; i < Wh * Wh; i++) { buf.base[i * 4] = 160; buf.base[i * 4 + 1] = 158; buf.base[i * 4 + 2] = 155; buf.base[i * 4 + 3] = 2; buf.normal[i * 3] = 128; buf.normal[i * 3 + 1] = 128; buf.normal[i * 3 + 2] = 255; buf.orm[i * 3] = 255; buf.orm[i * 3 + 1] = 230; }
  const deep = '#E2DFD8', mid = '#D8D5CE', dark = '#CFCCC5';
  paintClothPanel(buf, { ...A.clothA, W: Wh, dye: deep, dye2: mid, dye3: dark, seed: 2, creases: 7, fringe: 2 });
  paintClothPanel(buf, { ...A.clothB, W: Wh, dye: deep, dye2: dark, dye3: mid, seed: 5, creases: 9, sigma: [0.022, 0.06], amp: [0.00022, 0.00055], fringe: 2, creaseWander: 0.28, drag: 0.35 });
  paintClothPanel(buf, { ...A.tailA, W: Wh, dye: deep, dye2: mid, dye3: dark, seed: 9, creases: 5, mmU: 0.9, mmV: 1.56, sigma: [0.05, 0.16], amp: [0.0006, 0.0014], fringe: 2 });
  paintClothPanel(buf, { ...A.lining, W: Wh, dye: deep, dye2: mid, dye3: dark, seed: 13, creases: 3, mmU: 1.2, mmV: 1.56, fringe: 0, weave: 0.25 });
  paintClothPanel(buf, { ...A.knotFold, W: Wh, dye: deep, dye2: dark, dye3: dark, seed: 17, creases: 9, sigma: [0.03, 0.07], amp: [0.0005, 0.0011], mmU: 1.2, mmV: 0.7, fringe: 3 });
  paintFrayEnd(buf, { ...A.frayEnd, W: Wh, dye: deep });
  // the coil tile, the fringe and the locks are mid-grey (peak ~ 250): a vertex colour takes them to any hair
  const hairMid = '#8C8A86';
  paintCoilTile(buf, { ...A.coilTile, W: Wh, seed: 21, hair: hairMid });
  paintCoilFringe(buf, { ...A.coilFringe, W: Wh, hair: hairMid });
  paintLockTile(buf, { ...A.lockTile, W: Wh, hair: hairMid });
  paintLashes(buf, { ...A.lashes, W: Wh });
  const doc = new Document();
  doc.createBuffer();
  const tex = async (name, bytes) => doc.createTexture(name).setImage(bytes).setMimeType('image/webp').setURI(`${name}.webp`);
  const base = await tex('npc-hair-base', await webp(buf.base, Wh, { channels: 4, quality: 88, alphaQuality: 100 }));
  const normal = await tex('npc-hair-normal', await webp(buf.normal, Wh, { quality: 88 }));
  const orm = await tex('npc-hair-orm', await webp(buf.orm, Wh, { quality: 82 }));
  const mat = doc.createMaterial('MI_Npc_hair').setBaseColorTexture(base).setNormalTexture(normal).setMetallicRoughnessTexture(orm)
    .setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(true).setAlphaMode('MASK').setAlphaCutoff(0.5)
    .setEmissiveTexture(base).setEmissiveFactor([0.09, 0.09, 0.09]);
  carrier(doc, 'atlas-hair', mat);
  return writeSkinned(doc, file, { provenance, extras: { r5NpcAtlas: { faction: 'hair', neutral: 222, hairNeutral: 150 } } });
}
