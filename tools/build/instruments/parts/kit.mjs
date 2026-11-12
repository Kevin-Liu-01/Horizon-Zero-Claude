/**
 * CALIMA — the Instruments' shared build kit (instruments-a, W1; plan §2
 * `tools/build/instruments/parts/**`). Original work: no third-party asset is
 * read. Every Instrument generator (`gen-tiller`, `gen-plumb`, `gen-peg`, and
 * the later species lanes) builds through this file so the family reads as one
 * maker's work (bible §7.1 rules 3-4, ROUND5-LOOK I-01 / I-03 / I-04):
 *
 *   KBucket            a `hs.mjs` Bucket that also carries a decal/trim `uv1`
 *                      per vertex and a crazing roughness row in `uv.y`
 *   mergeLabelled      per-bone buckets -> one labelled bucket (`_BONE`)
 *   finish             baked vertex AO (>= 28 rays, 0.4 m, three-mesh-bvh),
 *                      the dust/grime band on the lowest 0.6 m, verdigris in
 *                      the bronze crevices, and the `_LAMPPROX` spill field
 *                      (1 at a lamp's rim -> 0 at 0.8 m; I-01's hull spill)
 *   lod1From           the LOD1 caster proxy (meshopt simplify, labels kept)
 *   decalAtlasPNG      the shared 256 x 256 decal/trim atlas (levelling-staff
 *                      E-pattern, brass numerals, vernier ticks), uv1
 *   writeInstrument    Bucket set -> GLB: hull (vertex colour x atlas on uv1,
 *                      roughness/metal from an 8 x 4 palette on uv0), sensor
 *                      (emissive), LOD1 (caster proxy), `_BONE`, `_LAMPPROX`,
 *                      provenance + r5Stats like `tools/build/lib/glb.mjs`
 *
 * Deterministic: no clocks, no Math.random; the AO directions and the crazing
 * field are fixed functions of position (A-build-deterministic).
 */
import { Document, NodeIO, Logger } from '@gltf-transform/core';
import { weld, dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureTransform } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { MeshBVH } from 'three-mesh-bvh';
import sharp from 'sharp';
import { THREE, Bucket, SURF, PALETTE_W } from '../../lib/hs.mjs';
import { checkProvenance, GENERATOR } from '../../lib/glb.mjs';

/* ------------------------------------------------------------------ */
/* bible §7.1 palette (sRGB)                                            */
/* ------------------------------------------------------------------ */
export const C = Object.freeze({
  BONE: 0xe6dcc8,      // bone glaze
  CELADON: 0xa9c4b0,   // celadon glaze
  OXBLOOD: 0x6e2421,   // oxblood glaze
  BRONZE: 0xa07a3f,    // bronze
  VERDI: 0x4f8f7e,     // verdigris
  GRAPH: 0x2b2c30,     // graphite joints
  VERM: 0xd2452e,      // survey vermilion (flat ink, never emissive)
  STAFF: 0xf1eee6,     // staff white
  RUBBER: 0x1b1a19,
  CHROME: 0xb9b5ad,    // piston rods: a warm worn steel, never mirror chrome (bible: "no chrome")
  LAMP: 0x1a1208,      // sensor glass albedo (emissive does the work)
});

/* ------------------------------------------------------------------ */
/* deterministic noise                                                  */
/* ------------------------------------------------------------------ */
export function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
/** Smooth value noise in [0, 1] at cell size `s` metres. */
export function vnoise(x, y, z, s = 0.1) {
  const fx = x / s, fy = y / s, fz = z / s;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    v += w * hash3(ix + dx, iy + dy, iz + dz);
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* the palette: 8 surfaces x 4 roughness rows                           */
/* ------------------------------------------------------------------ */
export const PAL_ROWS = 4;
/** Row r of surface s: glaze 0.15 / 0.20 / 0.25 / 0.30 (crazing, I-03); the rest their base +/- 0.06. */
export function paletteRough(slot, row) {
  const s = Object.values(SURF).find((q) => q.slot === slot);
  if (!s) return 0.5;
  if (slot === SURF.glaze.slot) return [0.15, 0.2, 0.25, 0.3][row];
  return Math.min(1, Math.max(0.05, s.rough + (row - 1.5) * 0.04));
}
export function paletteBytes4() {
  const out = new Uint8Array(PALETTE_W * PAL_ROWS * 4);
  for (const s of Object.values(SURF)) {
    for (let r = 0; r < PAL_ROWS; r++) {
      const o = (r * PALETTE_W + s.slot) * 4;
      out[o] = 255;
      out[o + 1] = Math.round(paletteRough(s.slot, r) * 255);
      out[o + 2] = Math.round(s.metal * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the decal / trim atlas (uv1)                                         */
/* ------------------------------------------------------------------ */
export const ATLAS = 256;
/** Bands of the atlas, as v ranges (glTF: v = 0 is the image's top row). */
export const BAND = Object.freeze({
  staff: [0, 32],      // levelling-staff E pattern: vermilion / white blocks, black 1 cm ticks; period = full width
  numerals: [32, 64],  // 0-9, dark engraved glyphs on white (multiplies into bronze / glaze)
  vernier: [64, 96],   // graduated circle: long tick / 8, mid / 16, short / 4 px; period = full width
  bands: [96, 128],    // survey bands: vermilion / staff-white halves (u < 0.5 vermilion)
  white: [192, 256],   // plain white (every undecorated vertex samples here)
});
export const WHITE_UV = [0.5, 224 / ATLAS];
/**
 * uv1 is written as (u / U1_SCALE, v) and the atlas carries KHR_texture_transform scale (U1_SCALE, 1): the
 * repeating bands (staff, vernier) run u past 1, and an attribute outside [0, 1] is not quantised (float32 bytes).
 */
export const U1_SCALE = 8;

const DIGITS = [
  ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
];

export function decalAtlasBytes() {
  const N = ATLAS, px = new Uint8Array(N * N * 4).fill(255);
  const set = (x, y, rgb) => { const o = (y * N + x) * 4; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255; };
  const VERM = [0xd2, 0x45, 0x2e], WHITE = [255, 255, 255], INK = [0x2a, 0x26, 0x22], ENGRAVE = [0x5a, 0x52, 0x48];
  // staff: 4 blocks of 64 px (period 0.4 m on a leg), V W V W; the E ticks on the left 60 % of the band height
  for (let y = BAND.staff[0]; y < BAND.staff[1]; y++) {
    const fy = (y - BAND.staff[0]) / 32;
    for (let x = 0; x < N; x++) {
      const blk = (x >> 6) & 1;
      let c = blk ? WHITE : VERM;
      const xi = x & 63;
      if (fy < 0.6 && ((xi >> 2) & 1) === 0 && xi % 32 < 28) c = blk ? INK : WHITE;   // 1 cm E ticks
      if (fy >= 0.6 && fy < 0.68) c = INK;                                              // hairline
      set(x, y, c);
    }
  }
  // numerals: ten 24-px cells; glyph 5x7 at 3 px, centred
  for (let d = 0; d < 10; d++) {
    const x0 = d * 25 + 2, y0 = BAND.numerals[0] + 4;
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
      if (DIGITS[d][gy][gx] !== '1') continue;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) set(x0 + 4 + gx * 3 + sx, y0 + gy * 3 + sy, ENGRAVE);
    }
  }
  // vernier: ticks hanging from the band top
  for (let x = 0; x < N; x++) {
    const L = x % 32 === 0 ? 26 : x % 16 === 0 ? 18 : x % 4 === 0 ? 10 : 0;
    for (let y = 0; y < L; y++) { set(x, BAND.vernier[0] + 3 + y, INK); }
    for (let y = 0; y < 2; y++) set(x, BAND.vernier[0] + y, INK);
  }
  // survey bands
  for (let y = BAND.bands[0]; y < BAND.bands[1]; y++) for (let x = 0; x < N; x++) set(x, y, x < N / 2 ? VERM : WHITE);
  return px;
}
export async function decalAtlasPNG() {
  return sharp(Buffer.from(decalAtlasBytes()), { raw: { width: ATLAS, height: ATLAS, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}
export async function paletteTexturePNG4() {
  return sharp(Buffer.from(paletteBytes4()), { raw: { width: PALETTE_W, height: PAL_ROWS, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}
/** uv1 band centre helpers. */
export const bandV = (band, f = 0.5) => (band[0] + (band[1] - band[0]) * f) / ATLAS;
/** The uv1 of numeral `d` at local (fx, fy) in [0, 1] of its cell. */
export const numeralUV = (d, fx, fy) => [(d * 25 + 2 + 4 + fx * 15) / ATLAS, (BAND.numerals[0] + 4 + fy * 21) / ATLAS];

/* ------------------------------------------------------------------ */
/* the bucket                                                           */
/* ------------------------------------------------------------------ */
const _inv = new THREE.Matrix4();
const _p = new THREE.Vector3();

export class KBucket extends Bucket {
  constructor(name) { super(name); this.uv1 = []; this.surf = []; }

  add(geo, opts = {}) {
    const n0 = this.pos.length / 3;
    super.add(geo, opts);
    const n1 = this.pos.length / 3;
    const slot = (SURF[opts.surf] || SURF.glaze).slot;
    for (let i = n0; i < n1; i++) {
      this.uv1.push(WHITE_UV[0], WHITE_UV[1]);
      this.surf.push(slot);
    }
    if (opts.decal) this.decalSince(n0, opts.decal);
    return this;
  }

  /** Vertex count so far (for `decalSince`). */
  mark() { return this.pos.length / 3; }

  /**
   * Map uv1 for every TRIANGLE added since `mark` (the bucket is a triangle soup, `mark` is a vertex count):
   * `fn(local) -> [u, v] | null` is asked at the triangle's centroid (null: the triangle keeps the white
   * texel), then at each of its corners (a corner outside the region takes the centroid's value), so no
   * triangle ever interpolates between a decal and the white texel. `uPeriod` unwraps u across a
   * periodic seam (a ring's atan2 cut). `frame` places the primitive (local = frame^-1 x body).
   */
  decalSince(mark, { fn, frame = null, uPeriod = 0 }) {
    if (frame) _inv.copy(frame).invert();
    const n = this.pos.length / 3;
    const q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], c = new THREE.Vector3();
    for (let t = mark; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = t + k;
        q[k].set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
        if (frame) q[k].applyMatrix4(_inv);
      }
      c.copy(q[0]).add(q[1]).add(q[2]).multiplyScalar(1 / 3);
      const uc = fn(c);
      if (!uc) continue;
      for (let k = 0; k < 3; k++) {
        const uv = fn(q[k]) || uc;
        let u = uv[0];
        if (uPeriod > 0) { while (u - uc[0] > uPeriod / 2) u -= uPeriod; while (uc[0] - u > uPeriod / 2) u += uPeriod; }
        this.uv1[(t + k) * 2] = u; this.uv1[(t + k) * 2 + 1] = uv[1];
      }
    }
  }

  translate(dx, dy, dz) { super.translate(dx, dy, dz); }

  /** Scale every vertex about the origin (the generators' `scale` param; normals unchanged). */
  scale(k) { for (let i = 0; i < this.pos.length; i++) this.pos[i] *= k; }
}

/** A decal that wraps a band around a lathe/strut (local +Y is the axis). */
export function wrapDecal(band, { period = 0.4, faceFrac = 1, along = 'y', phase = 0 } = {}) {
  return {
    fn: (p) => {
      const a = along === 'y' ? p.y : p.z;
      const ang = Math.atan2(p.x, along === 'y' ? p.z : p.y) / (Math.PI * 2) + 0.5;   // 0..1 around
      const v = bandV(band, Math.min(0.98, Math.max(0.02, ang * faceFrac)));
      return [a / period + phase, v];
    },
  };
}
/** A decal that runs a full-width band AROUND the axis (vernier rings on drums). */
export function ringDecal(band, { ticks = 1, vAt = 0.5, axis = 'y' } = {}) {
  return {
    fn: (p) => {
      const ang = axis === 'y' ? Math.atan2(p.x, p.z) : axis === 'x' ? Math.atan2(p.y, p.z) : Math.atan2(p.x, p.y);
      return [(ang / (Math.PI * 2) + 0.5) * ticks, bandV(band, vAt)];
    },
  };
}

/* ------------------------------------------------------------------ */
/* merge per material, labels                                           */
/* ------------------------------------------------------------------ */
export function mergeLabelled(map, order, name) {
  const out = new KBucket(name);
  const labels = [];
  for (const [bone, b] of map) {
    const idx = order.indexOf(bone);
    if (idx < 0) throw new Error(`bone ${bone} not in rig spec`);
    for (let i = 0; i < b.pos.length; i++) out.pos.push(b.pos[i]);
    for (let i = 0; i < b.nor.length; i++) out.nor.push(b.nor[i]);
    for (let i = 0; i < b.col.length; i++) out.col.push(b.col[i]);
    for (let i = 0; i < b.uv.length; i++) out.uv.push(b.uv[i]);
    const nv = b.pos.length / 3;
    for (let i = 0; i < nv; i++) {
      out.uv1.push(b.uv1 ? b.uv1[i * 2] : WHITE_UV[0], b.uv1 ? b.uv1[i * 2 + 1] : WHITE_UV[1]);
      out.surf.push(b.surf ? b.surf[i] : 0);
      labels.push(idx);
    }
  }
  out.labels = labels;
  return out;
}

/* ------------------------------------------------------------------ */
/* finishing: AO, dust band, verdigris, crazing rows, lamp proximity    */
/* ------------------------------------------------------------------ */
/** 28 fixed cosine-weighted hemisphere directions about +Z (Hammersley, deterministic). */
function hemiDirs(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let b = i, r = 0, f = 0.5;
    while (b) { r += f * (b & 1); b >>= 1; f *= 0.5; }
    const u = (i + 0.5) / n, phi = 2 * Math.PI * r;
    const s = Math.sqrt(u);
    out.push(new THREE.Vector3(Math.cos(phi) * s, Math.sin(phi) * s, Math.sqrt(1 - u)));
  }
  return out;
}

/**
 * Bake the finishing passes into `hull` (and the vertex colours of `extra` occluders' AO only).
 * opts:
 *   occluders   extra KBuckets that occlude (the sensor glass) — not shaded
 *   rays        AO rays per vertex (>= 28), dist (0.4 m)
 *   aoMin       darkest AO multiplier (0.42)
 *   footBand    metres of the dust/grime band (0.6) and its floor tint
 *   lamps       [{ at: [x, y, z], r }] lamp rims for `_LAMPPROX` (falls to 0 at r + 0.8 m)
 *   proxFar     0.8
 */
export function finish(hull, opts = {}) {
  const rays = Math.max(28, opts.rays ?? 28), dist = opts.dist ?? 0.4, aoMin = opts.aoMin ?? 0.42;
  const all = [hull, ...(opts.occluders || [])];
  let nv = 0;
  for (const b of all) nv += b.pos.length / 3;
  const P = new Float32Array(nv * 3);
  let o = 0;
  for (const b of all) { P.set(b.pos, o); o += b.pos.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const bvh = new MeshBVH(geo);
  const dirs = hemiDirs(rays);
  const ray = new THREE.Ray();
  const n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), d = new THREE.Vector3();
  const cache = new Map();
  const nh = hull.pos.length / 3;
  const ao = new Float32Array(nh);
  for (let i = 0; i < nh; i++) {
    const px = hull.pos[i * 3], py = hull.pos[i * 3 + 1], pz = hull.pos[i * 3 + 2];
    n.set(hull.nor[i * 3], hull.nor[i * 3 + 1], hull.nor[i * 3 + 2]).normalize();
    const key = `${Math.round(px * 500)},${Math.round(py * 500)},${Math.round(pz * 500)},${Math.round(n.x * 8)},${Math.round(n.y * 8)},${Math.round(n.z * 8)}`;
    const hit = cache.get(key);
    if (hit !== undefined) { ao[i] = hit; continue; }
    // tangent frame
    if (Math.abs(n.y) < 0.9) t1.set(0, 1, 0).cross(n).normalize(); else t1.set(1, 0, 0).cross(n).normalize();
    t2.crossVectors(n, t1);
    let occ = 0;
    for (const q of dirs) {
      d.set(0, 0, 0).addScaledVector(t1, q.x).addScaledVector(t2, q.y).addScaledVector(n, q.z);
      ray.origin.set(px + n.x * 0.004, py + n.y * 0.004, pz + n.z * 0.004);
      ray.direction.copy(d);
      const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0.0005, dist);
      if (h) occ += 1 - h.distance / dist * 0.5;
    }
    const k = 1 - occ / rays;
    ao[i] = k;
    cache.set(key, k);
  }
  geo.dispose();
  const floorH = opts.footBand ?? 0.6;
  const dust = new THREE.Color(opts.dustTint ?? 0x8a7a64);   // pans dust, linear after ColorManagement
  const verdi = new THREE.Color(C.VERDI), tmp = new THREE.Color();
  const bronzeSlot = SURF.bronze.slot, patinaSlot = SURF.patina.slot, glazeSlot = SURF.glaze.slot, graphiteSlot = SURF.graphite.slot;
  const prox = new Float32Array(nh);
  const lamps = opts.lamps || [];
  const proxFar = opts.proxFar ?? 0.8;
  for (let i = 0; i < nh; i++) {
    const x = hull.pos[i * 3], y = hull.pos[i * 3 + 1], z = hull.pos[i * 3 + 2];
    const slot = hull.surf[i];
    let r = hull.col[i * 3], g = hull.col[i * 3 + 1], b = hull.col[i * 3 + 2];
    // AO: crevices darken; graphite joints go darker still (dark joints, I-03)
    const a = aoMin + (1 - aoMin) * Math.pow(ao[i], 1.4);
    const ka = slot === graphiteSlot ? a * a : slot === glazeSlot ? Math.pow(a, 0.6) : a;
    r *= ka; g *= ka; b *= ka;
    // verdigris settles in the bronze crevices and on patches (>= 3 % of bronze, I-03 d)
    if (slot === bronzeSlot || slot === patinaSlot) {
      const occl = 1 - ao[i];
      const patch = vnoise(x, y, z, 0.09);
      const v = Math.min(1, Math.max(0, occl * 3.2 + (patch - 0.36) * 3.0));
      if (v > 0) {
        tmp.setRGB(r, g, b).lerp(verdi.clone().multiplyScalar(0.55 + 0.45 * a), v * 0.85);
        r = tmp.r; g = tmp.g; b = tmp.b;
      }
    }
    // dust and grime band: the feet sit in the ground (A-hull-value c: foot band <= 0.8 x the upper half);
    // soil-dark at the pads, fading out by `footBand` metres
    const fb = y < floorH ? 1 - y / floorH : 0;
    if (fb > 0) {
      const k = Math.pow(fb, 0.8);
      const keep = 1 - 0.9 * k, add = 0.03 * k;
      r = r * keep + dust.r * add;
      g = g * keep + dust.g * add;
      b = b * keep + dust.b * add;
    }
    hull.col[i * 3] = r; hull.col[i * 3 + 1] = g; hull.col[i * 3 + 2] = b;
    // crazing: glaze roughness 0.15-0.30 by a crackle field; other surfaces jitter a row
    const cz = vnoise(x, y, z, 0.035) * 0.65 + vnoise(x + 7, y, z, 0.11) * 0.35;
    const row = slot === glazeSlot ? Math.min(3, Math.floor(cz * 4.4)) : Math.min(3, Math.floor(hash3(x * 3, y * 3, z * 3) * 4));
    hull.uv[i * 2 + 1] = (row + 0.5) / PAL_ROWS;
    // lamp spill field
    let pv = 0;
    for (const L of lamps) {
      const dx = x - L.at[0], dy = y - L.at[1], dz = z - L.at[2];
      const dd = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - (L.r ?? 0));
      const q = Math.max(0, 1 - dd / proxFar);
      if (q > pv) pv = q;
    }
    prox[i] = pv;
  }
  hull.prox = prox;
  hull.ao = ao;
  return { verts: nh, aoMean: ao.reduce((s, v) => s + v, 0) / Math.max(1, nh) };
}

/* ------------------------------------------------------------------ */
/* LOD1: the caster proxy (I-04)                                        */
/* ------------------------------------------------------------------ */
/**
 * Weld the hull per (position, bone label) and simplify to `ratio` of its
 * triangles with meshoptimizer. Returns a soup KBucket with `labels` (the
 * caster deforms with the same skeleton), no colour work.
 */
export async function lod1From(hull, ratio = 0.35, name = 'lod1') {
  await MeshoptSimplifier.ready;
  const nv = hull.pos.length / 3;
  const map = new Map(), pos = [], lab = [], idx = new Uint32Array(nv);
  for (let i = 0; i < nv; i++) {
    const x = hull.pos[i * 3], y = hull.pos[i * 3 + 1], z = hull.pos[i * 3 + 2], l = hull.labels[i];
    const key = `${Math.round(x * 2000)},${Math.round(y * 2000)},${Math.round(z * 2000)},${l}`;
    let k = map.get(key);
    if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(x, y, z); lab.push(l); }
    idx[i] = k;
  }
  const P = new Float32Array(pos);
  const target = Math.floor((nv * ratio) / 3) * 3;
  const [out] = MeshoptSimplifier.simplify(idx, P, 3, target, 0.02, ['LockBorder']);
  let tri = out;
  if (tri.length > target * 1.15) {
    const [sl] = [MeshoptSimplifier.simplifySloppy(idx, P, 3, target, 0.05)];
    tri = Array.isArray(sl) ? sl[0] : sl;
  }
  // smooth per-vertex normals over the simplified mesh, so the writer's weld shares every vertex again
  const nrm = new Float32Array(P.length);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), N = new THREE.Vector3();
  for (let t = 0; t < tri.length; t += 3) {
    A.fromArray(P, tri[t] * 3); B.fromArray(P, tri[t + 1] * 3); Cc.fromArray(P, tri[t + 2] * 3);
    N.subVectors(B, A).cross(Cc.sub(A));
    for (let k = 0; k < 3; k++) { const o = tri[t + k] * 3; nrm[o] += N.x; nrm[o + 1] += N.y; nrm[o + 2] += N.z; }
  }
  const b = new KBucket(name);
  b.labels = [];
  for (let t = 0; t < tri.length; t++) {
    const ii = tri[t], o = ii * 3;
    N.set(nrm[o], nrm[o + 1], nrm[o + 2]).normalize();
    b.pos.push(P[o], P[o + 1], P[o + 2]); b.nor.push(N.x, N.y, N.z); b.col.push(0.5, 0.5, 0.5); b.uv.push(0.5, 0.5);
    b.uv1.push(WHITE_UV[0], WHITE_UV[1]); b.surf.push(0);
    b.labels.push(lab[ii]);
  }
  return b;
}

/* ------------------------------------------------------------------ */
/* the writer                                                           */
/* ------------------------------------------------------------------ */
function normalize(a) {
  for (let i = 0; i < a.length; i += 3) {
    const l = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1;
    a[i] /= l; a[i + 1] /= l; a[i + 2] /= l;
  }
  return a;
}

/**
 * parts: [{ bucket, role: 'hull' | 'sensor' | 'lod1', material: { name, emissive?, baseColor? } }]
 * opts: { file, provenance, extras }
 *
 * The LOD1 caster proxy SHARES the hull's glTF material (bible §4.1: "hull + lamp", two materials per
 * Instrument): its node and mesh are named `*-lod1` and carry `extras.casterProxy`, and the kind's
 * `onEntry` (`src/instruments/lib/lod1.js`) gives it its own runtime material before any machine is built,
 * so the fold never merges it into the hull. It carries POSITION, NORMAL and `_BONE` only.
 */
export async function writeInstrument(parts, opts) {
  const provenance = checkProvenance(opts.provenance);
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  const buffer = doc.createBuffer();
  const scene = doc.createScene('scene');
  let palette = null, atlas = null;
  const counts = {};
  for (const { bucket, role, material: M } of parts) {
    if (!bucket.pos.length) continue;
    const nv = bucket.pos.length / 3;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(bucket.pos)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normalize(new Float32Array(bucket.nor))).setBuffer(buffer));
    if (role !== 'lod1') {
      prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(bucket.uv)).setBuffer(buffer))
        .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(bucket.col)).setBuffer(buffer));
    }
    if (role === 'hull') {
      const u1 = new Float32Array(bucket.uv1);
      for (let i = 0; i < u1.length; i += 2) { u1[i] = Math.min(1, Math.max(0, u1[i] / U1_SCALE)); u1[i + 1] = Math.min(1, Math.max(0, u1[i + 1])); }
      prim.setAttribute('TEXCOORD_1', doc.createAccessor().setType('VEC2').setArray(u1).setBuffer(buffer));
      if (bucket.prox) {
        const q = new Uint8Array(nv);
        for (let i = 0; i < nv; i++) q[i] = Math.round(Math.min(1, Math.max(0, bucket.prox[i])) * 255);
        prim.setAttribute('_LAMPPROX', doc.createAccessor().setType('SCALAR').setArray(q).setNormalized(true).setBuffer(buffer));
      }
    }
    if (bucket.labels) {
      prim.setAttribute('_BONE', doc.createAccessor().setType('SCALAR').setArray(Uint8Array.from(bucket.labels)).setBuffer(buffer));
    }
    if (role === 'lod1' || role === 'tool') {
      // a TOOL (a tearable component: bible §7.3 "Tool ... Pry: tears off") is hull-finished geometry in its own
      // node, unlabelled (never skinned), sharing the hull material; the kind file mounts it on its bone as a part
      const hullMat = doc.getRoot().listMaterials().find((m) => m.getExtras()?.instrumentHull);
      if (!hullMat) throw new Error(`writeInstrument: the ${role} part must follow the hull part`);
      if (role === 'tool') {
        prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(bucket.uv)).setBuffer(buffer))
          .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(bucket.col)).setBuffer(buffer));
        const u1 = new Float32Array(bucket.uv1);
        for (let i = 0; i < u1.length; i += 2) { u1[i] = Math.min(1, Math.max(0, u1[i] / U1_SCALE)); u1[i + 1] = Math.min(1, Math.max(0, u1[i + 1])); }
        prim.setAttribute('TEXCOORD_1', doc.createAccessor().setType('VEC2').setArray(u1).setBuffer(buffer));
      }
      prim.setMaterial(hullMat);
      const ex = role === 'lod1' ? { casterProxy: true } : { instrumentTool: true, anchor: M.anchor || [0, 0, 0] };
      const mesh = doc.createMesh(bucket.name).addPrimitive(prim).setExtras(ex);
      scene.addChild(doc.createNode(bucket.name).setMesh(mesh).setExtras(ex));
      continue;
    }
    const mat = doc.createMaterial(M.name).setBaseColorFactor(M.baseColor || [1, 1, 1, 1]).setDoubleSided(false);
    if (role === 'sensor') {
      mat.setEmissiveFactor(M.emissive || [1, 0.78, 0.45]).setMetallicFactor(0).setRoughnessFactor(0.05);
    } else {
      if (!palette) palette = doc.createTexture('r5-palette-4').setImage(await paletteTexturePNG4()).setMimeType('image/png');
      if (!atlas) atlas = doc.createTexture('r5-instrument-decals').setImage(await decalAtlasPNG()).setMimeType('image/png');
      mat.setMetallicFactor(1).setRoughnessFactor(1).setMetallicRoughnessTexture(palette);
      mat.getMetallicRoughnessTextureInfo().setMagFilter(9728).setMinFilter(9728).setWrapS(33071).setWrapT(33071);
      mat.setBaseColorTexture(atlas);
      mat.getBaseColorTextureInfo().setTexCoord(1).setMagFilter(9729).setMinFilter(9987).setWrapS(10497).setWrapT(33071);
      if (!doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'KHR_texture_transform')) doc.createExtension(KHRTextureTransform);
      const tt = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_texture_transform');
      mat.getBaseColorTextureInfo().setExtension('KHR_texture_transform', tt.createTransform().setScale([U1_SCALE, 1]));
      mat.setExtras({ uv1: true, instrumentHull: true });
    }
    prim.setMaterial(mat);
    const mesh = doc.createMesh(bucket.name).addPrimitive(prim);
    scene.addChild(doc.createNode(bucket.name).setMesh(mesh));
  }
  await doc.transform(weld(), dedup(), prune());
  let tris = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    let mt = 0;
    for (const p of mesh.listPrimitives()) {
      verts += p.getAttribute('POSITION').getCount();
      mt += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    }
    counts[mesh.getName()] = mt;
    tris += mt;
  }
  await MeshoptEncoder.ready;
  await doc.transform(reorder({ encoder: MeshoptEncoder }));
  await doc.transform(quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0|TEXCOORD_1|COLOR_0)$/, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const stats = {
    tris, verts, meshTris: counts,
    materials: doc.getRoot().listMaterials().length,
    meshes: doc.getRoot().listMeshes().length,
    textures: doc.getRoot().listTextures().length,
    bones: 0,
  };
  const asset = doc.getRoot().getAsset();
  asset.generator = GENERATOR;
  asset.extras = { ...(opts.extras || {}), provenance, r5Stats: stats };
  const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureTransform])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  if (opts.file) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(opts.file), { recursive: true });
    writeFileSync(opts.file, bytes);
  }
  return { bytes: bytes.byteLength, ...stats };
}

/* ------------------------------------------------------------------ */
/* rig helpers                                                          */
/* ------------------------------------------------------------------ */
/** The two-bone knee GaitController holds at rest (hinge pole +/-Z in the body frame). */
export function solveKnee(Hp, A, hinge, L1, L2) {
  const D = A.clone().sub(Hp);
  const d = D.length();
  D.divideScalar(d);
  const n = new THREE.Vector3().crossVectors(D, new THREE.Vector3(0, 0, hinge)).normalize();
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const dir = D.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(n, Math.acos(cosA)));
  return Hp.clone().addScaledVector(dir, L1);
}

/** Scale a rig spec (body space) uniformly: the generators' `scale` param and the runtime `opts.scale` share ONE implementation. */
export { scaleRig } from '../../../../src/instruments/lib/scale.js';

export { THREE };
