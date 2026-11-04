/**
 * CALIMA ground layers (world-ground W1, bible §8.3): the five layers the Pans stand on,
 * all procedural and project-original (R41: replaces the POC's rock scan and its proof
 * textures), deterministic, tileable.
 *
 *   1024²  sand    basalt black sand: ripples, grain, olivine and shell glints   (3.0 m tile)
 *   1024²  salt    salt crust: crystal grit, low plate ridges, drag marks, grit  (6.0 m tile)
 *   1024²  basalt  vesicular basalt: fracture joints, vesicles, salt stain       (7.0 m tile)
 *    512²  mud     wet pan silt: fine desiccation, algal film                    (3.5 m tile)
 *    512²  pebble  storm-beach shingle: rounded basalt cobbles packed in sand    (2.6 m tile)
 *
 * Each layer ships as TWO RGBA WebP (plan §4.1):
 *   <layer>_a.webp   RGB albedo (sRGB, decoded in the shader)      A height, 128..255
 *   <layer>_n.webp   RG normal XY (Z rebuilt)  B roughness         A cavity AO, 128..255
 *
 * Alpha never goes under 128: the page decodes through a 2D canvas, which premultiplies,
 * and half range keeps the RGB under it exact to within one level.
 * Textures are authored for flipY = false (row 0 = v 0); normal Y = −dh/dv.
 *
 *   node tools/build/build-assets.mjs --only world-ground
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const LANE = 'world-ground';
const LAYERS = [
  { id: 'sand', N: 1024 }, { id: 'salt', N: 1024 }, { id: 'basalt', N: 1024 },
  { id: 'mud', N: 512 }, { id: 'pebble', N: 512 },
];
export const OUTPUTS = LAYERS.flatMap((l) => [
  `public/textures/ground/${l.id}_a.webp`, `public/textures/ground/${l.id}_n.webp`,
]);

/* ------------------------------------------------------------ tileable noise ---- */
const wrap = (a, p) => ((a % p) + p) % p;
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Tileable gradient noise, −1..1 (no value-noise lattice to show through). */
function perlin(u, v, p, seed) {
  const x = u * p, y = v * p, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const g = (i, j, dx, dy) => {
    const a = hash2(wrap(i, p), wrap(j, p), seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = g(ix, iy, fx, fy), b = g(ix + 1, iy, fx - 1, fy), c = g(ix, iy + 1, fx, fy - 1), d = g(ix + 1, iy + 1, fx - 1, fy - 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 1.5;
}
/** fbm in about −1..1; every octave stays integer-periodic, so it tiles. */
function fbm(u, v, base, oct, seed, gain = 0.5) {
  let s = 0, a = 1, n = 0, f = base;
  for (let o = 0; o < oct; o++) { s += a * perlin(u, v, f, seed + o * 17); n += a; a *= gain; f *= 2; }
  return s / n;
}
function ridge(u, v, base, oct, seed, gain = 0.5) {
  let s = 0, a = 1, n = 0, f = base;
  for (let o = 0; o < oct; o++) { const t = 1 - Math.abs(perlin(u, v, f, seed + o * 23)); s += a * t * t; n += a; a *= gain; f *= 2; }
  return s / n;
}
/** Tileable Worley: { f1, f2, id, cx, cy }. */
function worley(u, v, p, seed, jitter = 0.9) {
  const x = u * p, y = v * p, ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, ox1 = 0, oy1 = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const cx = ix + i, cy = iy + j, wx = wrap(cx, p), wy = wrap(cy, p);
    const ox = 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter, oy = 0.5 + (hash2(wx, wy, seed + 101) - 0.5) * jitter;
    const dx = cx + ox - x, dy = cy + oy - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 7); ox1 = dx; oy1 = dy; } else if (d < f2) f2 = d;
  }
  return { f1, f2, id, dx: ox1, dy: oy1 };
}
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/* ------------------------------------------------------------------ packing ---- */
function normalFrom(H, N, strength) {
  const nrm = new Float32Array(N * N * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xm = (x - 1 + N) % N, xp = (x + 1) % N, ym = (y - 1 + N) % N, yp = (y + 1) % N;
    const dx = (H[y * N + xp] - H[y * N + xm]) * strength, dy = (H[yp * N + x] - H[ym * N + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    nrm[(y * N + x) * 2] = -dx / l; nrm[(y * N + x) * 2 + 1] = -dy / l;
  }
  return nrm;
}
function cavity(H, N, k, radii) {
  const C = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, c = 0;
    for (const r of radii) for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      s += H[((y + oy + N) % N) * N + (x + ox + N) % N]; c++;
    }
    C[y * N + x] = clamp01(0.82 + (H[y * N + x] - s / c) * k);
  }
  return C;
}
async function writePair(root, name, N, L) {
  const NR = normalFrom(L.H, N, L.normal), AO = cavity(L.H, N, L.ao, L.aoR);
  const a = Buffer.alloc(N * N * 4), n = Buffer.alloc(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    a[i * 4] = Math.round(clamp01(L.A[i * 3]) * 255);
    a[i * 4 + 1] = Math.round(clamp01(L.A[i * 3 + 1]) * 255);
    a[i * 4 + 2] = Math.round(clamp01(L.A[i * 3 + 2]) * 255);
    a[i * 4 + 3] = 128 + Math.round(clamp01(L.H[i]) * 127);
    n[i * 4] = Math.round((NR[i * 2] * 0.5 + 0.5) * 255);
    n[i * 4 + 1] = Math.round((NR[i * 2 + 1] * 0.5 + 0.5) * 255);
    n[i * 4 + 2] = Math.round(clamp01(L.R[i]) * 255);
    n[i * 4 + 3] = 128 + Math.round(clamp01(AO[i]) * 127);
  }
  const dir = path.join(root, 'public/textures/ground');
  mkdirSync(dir, { recursive: true });
  const fa = path.join(dir, `${name}_a.webp`), fn = path.join(dir, `${name}_n.webp`);
  const opt = { effort: 5, exact: true, smartSubsample: true };
  await sharp(a, { raw: { width: N, height: N, channels: 4 } }).webp({ ...opt, quality: L.qa || 82, alphaQuality: 90 }).toFile(fa);
  await sharp(n, { raw: { width: N, height: N, channels: 4 } }).webp({ ...opt, quality: L.qn || 84, alphaQuality: 88 }).toFile(fn);
  return { name, N, bytes: statSync(fa).size + statSync(fn).size };
}

/* ------------------------------------------------------------------- layers ---- */
/**
 * BLACK SAND. The bible's #1C1B1E–#2A2826, read as what it is: millions of dark grains
 * sorted by the wind. Ripples are broken and they fork; crests sort paler, troughs hold
 * the heavy dark minerals. Glints (olivine, shell) are per-grain, not a speckle overlay.
 */
function sand(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const dark = hex(0x19181a), mid = hex(0x262426), crest = hex(0x3d3a38), olive = hex(0x5b6638), shell = hex(0xc9bea8), rust = hex(0x4a3428);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const warp = fbm(u, v, 2, 3, 11) * 1.1 + fbm(u, v, 5, 2, 23) * 0.35;
    // ripple frequency drifts across the tile (12 to 26 per 3 m), so crests fork and die
    const local = fbm(u, v, 2, 2, 31) * 0.5 + 0.5;
    const ph = (v * 20 + u * 4 + warp * 3.4) * Math.PI * 2;
    const ph2 = (v * 27 - u * 6 + warp * 4.1) * Math.PI * 2;
    const rA = Math.pow(0.5 + 0.5 * Math.sin(ph), 1.7), rB = Math.pow(0.5 + 0.5 * Math.sin(ph2), 1.7);
    const pick = sm(0.36, 0.64, local);
    const ampl = 0.3 + 0.7 * sm(-0.35, 0.25, fbm(u, v, 3, 3, 41));
    const rip = mix(rA, rB, pick) * ampl;
    // grains: two sizes, each a Worley dome, plus per-texel jitter
    const g1 = worley(u, v, 180, 5), g2 = worley(u, v, 64, 9);
    const grain = (1 - g1.f1) * 0.5 + hash2(x, y, 77) * 0.35 + fbm(u, v, 96, 2, 7) * 0.25;
    const big = sm(0.32, 0.08, g2.f1) * (g2.id > 0.74 ? 1 : 0);
    const h = rip * 0.46 + grain * 0.22 + big * 0.42;
    H[i] = h;
    let c = mix3(dark, mid, clamp01(0.5 + (grain - 0.5) * 1.4));
    c = mix3(c, crest, clamp01(rip * 0.36 * (0.5 + hash2(x, y, 13) * 0.8)));
    const sg = fbm(u, v, 4, 3, 53);
    if (sg > 0.12) c = mix3(c, rust, sm(0.12, 0.45, sg) * 0.25);
    const g = hash2(x, y, 91);
    if (g > 0.9992) c = mix3(c, olive, 0.7);
    else if (g < 0.0007) c = mix3(c, shell, 0.65);
    if (big > 0.2) { const t = 0.68 + g2.id * 0.55; c = [c[0] * t, c[1] * t, c[2] * t * 0.98]; }
    A[i * 3] = c[0]; A[i * 3 + 1] = c[1]; A[i * 3 + 2] = c[2];
    R[i] = clamp01(0.9 - rip * 0.05 - big * 0.2 + (hash2(x, y, 3) - 0.5) * 0.06);
  }
  return { H, A, R, normal: 7.5, ao: 3.4, aoR: [2, 6], qa: 78, qn: 58 };
}

/**
 * SALT CRUST. Not a clean polygon tile: a granular crystal crust, mostly dull cream-white,
 * with low pressure ridges, pits, blown black grit and the faint parallel drag of a rake.
 */
function salt(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const crust = hex(0xefe9dc), bright = hex(0xfdfbf6), cream = hex(0xdbcfb9), dirt = hex(0x8b7c6a), grit = hex(0x2a2826), pink = hex(0xe8cfc3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const wu = u + fbm(u, v, 3, 3, 41) * 0.05, wv = v + fbm(u, v, 3, 3, 43) * 0.05;
    const w = worley(wu, wv, 5, 3);
    const edge = w.f2 - w.f1;
    // plate ridges fade in and out along their length: most of the crust has none
    const present = sm(-0.15, 0.4, fbm(u, v, 4, 2, 61));
    const ridgeK = sm(0.2, 0.0, edge) * present;
    const crack = sm(0.024, 0.0, edge) * sm(0.05, 0.45, fbm(u, v, 6, 2, 67));
    // crystals at three scales, Worley domes so they catch a low sun
    const c1 = worley(u, v, 150, 13), c2 = worley(u, v, 54, 17);
    const crystal = (1 - c1.f1) * 0.42 + (1 - c2.f1) * 0.32 + hash2(x, y, 19) * 0.26;
    // the rake: long shallow parallel drags, broken up
    const dragPh = (v * 34 + fbm(u, v, 2, 3, 71) * 7.5) * Math.PI * 2;
    const drag = (0.5 + 0.5 * Math.sin(dragPh)) * sm(0.15, 0.6, fbm(u, v, 3, 2, 73));
    const pit = sm(0.2, 0.0, worley(u, v, 22, 29).f1) * sm(0.2, 0.6, fbm(u, v, 5, 2, 79));
    const dome = (1 - w.f1) * 0.14;
    const h = 0.34 + ridgeK * 0.34 - crack * 0.3 + crystal * 0.24 + dome + drag * 0.03 - pit * 0.24 + fbm(u, v, 8, 3, 83) * 0.12;
    H[i] = h;
    const tone = fbm(u, v, 3, 4, 51);
    let c = mix3(crust, cream, sm(-0.25, 0.4, tone));
    c = mix3(c, bright, clamp01(ridgeK * 0.8 + sm(0.62, 0.92, crystal) * 0.5));
    c = mix3(c, pink, sm(0.3, 0.6, fbm(u, v, 2, 3, 57)) * 0.3);
    const dirty = clamp01(crack * 1.3 + pit * 0.9 + sm(0.22, 0.5, fbm(u, v, 4, 3, 59)) * 0.32);
    c = mix3(c, dirt, dirty);
    const g = hash2(Math.floor(u * 400), Math.floor(v * 400), 37);
    if (g > 0.9955) c = mix3(c, grit, 0.86);
    const t = 0.9 + crystal * 0.16;
    A[i * 3] = c[0] * t; A[i * 3 + 1] = c[1] * t; A[i * 3 + 2] = c[2] * t;
    R[i] = clamp01(0.58 + crystal * 0.2 + crack * 0.16 - ridgeK * 0.08);
  }
  return { H, A, R, normal: 5.6, ao: 3.2, aoR: [2, 7], qa: 80, qn: 60 };
}

/**
 * BASALT. Vesicular columnar basalt: cooling joints, conchoidal fractures, vesicles, the
 * odd rust and white salt stain. Graphite, never brown: the bible's #3A3A3F.
 */
function basalt(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const base = hex(0x2c2c31), light = hex(0x54545a), rust = hex(0x5a4032), saltS = hex(0xb7b2a8);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const w = worley(u, v, 4, 21, 0.75);
    const joint = sm(0.035, 0.0, w.f2 - w.f1) * sm(0.0, 0.35, fbm(u, v, 5, 2, 22));
    const blocks = worley(u + fbm(u, v, 5, 2, 25) * 0.02, v, 13, 27, 0.9);
    const frac = sm(0.05, 0.0, blocks.f2 - blocks.f1) * 0.7;
    const crazy = ridge(u, v, 7, 4, 33);
    const ves = worley(u, v, 72, 31), ves2 = worley(u, v, 30, 35);
    const pitZone = sm(-0.1, 0.35, fbm(u, v, 4, 2, 44));
    const pit = (sm(0.24, 0.05, ves.f1) * (ves.id > 0.72 ? 1 : 0) + sm(0.16, 0.03, ves2.f1) * (ves2.id > 0.86 ? 1 : 0)) * pitZone;
    const n = fbm(u, v, 6, 5, 37);
    const facet = (w.id - 0.5) * 0.22 + (blocks.id - 0.5) * 0.14;
    const h = 0.52 + n * 0.3 + crazy * 0.16 + facet - joint * 0.2 - frac * 0.1 - pit * 0.2;
    H[i] = clamp01(h);
    let c = mix3(base, light, clamp01(0.32 + n * 0.72 + facet * 1.3));
    c = mix3(c, rust, sm(0.22, 0.55, fbm(u, v, 4, 3, 71)) * 0.34);
    c = mix3(c, saltS, sm(0.3, 0.62, fbm(u, v, 5, 4, 75)) * 0.28 * (1 - pit));
    const d = 1 - joint * 0.22 - frac * 0.12 - clamp01(pit) * 0.42;
    A[i * 3] = c[0] * d; A[i * 3 + 1] = c[1] * d; A[i * 3 + 2] = c[2] * d;
    R[i] = clamp01(0.8 + joint * 0.1 + (n * 0.5) * 0.12);
  }
  return { H, A, R, normal: 9.5, ao: 2.6, aoR: [3, 9], qa: 74, qn: 66 };
}

/** WET PAN SILT: dark, smooth, fine desiccation where it dries, a film of algal colour. */
function mud(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const wet = hex(0x1d1b1b), damp = hex(0x35302c), algae = hex(0x3c3a28), red = hex(0x4a2a24);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const dry = sm(-0.15, 0.35, fbm(u, v, 3, 3, 11));
    const w = worley(u + fbm(u, v, 6, 2, 13) * 0.04, v + fbm(u, v, 6, 2, 15) * 0.04, 9, 17);
    const crack = sm(0.05, 0.0, w.f2 - w.f1) * dry;
    const n = fbm(u, v, 8, 4, 19);
    H[i] = clamp01(0.46 + n * 0.16 + dry * 0.1 - crack * 0.36 + (1 - w.f1) * 0.1 * dry);
    let c = mix3(wet, damp, dry * 0.9);
    c = mix3(c, algae, sm(0.15, 0.5, fbm(u, v, 4, 3, 23)) * 0.4);
    c = mix3(c, red, sm(0.28, 0.6, fbm(u, v, 3, 3, 29)) * 0.3);
    const d = 1 - crack * 0.6;
    A[i * 3] = c[0] * d; A[i * 3 + 1] = c[1] * d; A[i * 3 + 2] = c[2] * d;
    R[i] = clamp01(0.42 + dry * 0.34 + crack * 0.1);
  }
  return { H, A, R, normal: 3.6, ao: 2.8, aoR: [2, 5], qa: 76, qn: 70 };
}

/** STORM-BEACH SHINGLE: rounded cobbles, a few pale, packed in dark sand. */
function pebble(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const sandC = hex(0x1b1a1b), stone = hex(0x3b3a3d), pale = hex(0x8c8880), rust = hex(0x5c4638);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const wu = u + fbm(u, v, 6, 2, 3) * 0.016, wv = v + fbm(u, v, 6, 2, 5) * 0.016;
    const a = worley(wu, wv, 15, 7, 0.95), b = worley(wu + 0.31, wv + 0.17, 31, 11, 0.95);
    const domeA = Math.sqrt(Math.max(0, 1 - Math.pow(a.f1 / 0.62, 2))), domeB = Math.sqrt(Math.max(0, 1 - Math.pow(b.f1 / 0.6, 2)));
    const hA = domeA * (0.72 + a.id * 0.3), hB = domeB * 0.56;
    const top = hA > hB;
    const dome = top ? hA : hB, id = top ? a.id : b.id;
    const h = dome * 0.86 + fbm(u, v, 40, 2, 9) * 0.05;
    H[i] = clamp01(h);
    const on = sm(0.04, 0.2, dome);
    const stoneC = id > 0.97 ? pale : id > 0.9 ? rust : stone;
    const t = (0.62 + id * 0.56 + fbm(u, v, 30, 2, 13) * 0.14) * (0.62 + 0.5 * dome);
    const sc = [stoneC[0] * t, stoneC[1] * t, stoneC[2] * t];
    const c = mix3(sandC, sc, on);
    const ao = mix(0.46, 1, sm(0.05, 0.42, dome));
    A[i * 3] = c[0] * ao; A[i * 3 + 1] = c[1] * ao; A[i * 3 + 2] = c[2] * ao;
    R[i] = clamp01(mix(0.92, 0.62, on));
  }
  return { H, A, R, normal: 8, ao: 3.0, aoR: [2, 6], qa: 76, qn: 70 };
}

const MAKERS = { sand, salt, basalt, mud, pebble };

export async function build({ out }) {
  const stats = [];
  for (const l of LAYERS) stats.push(await writePair(out, l.id, l.N, MAKERS[l.id](l.N)));
  return { layers: stats, bytes: stats.reduce((s, x) => s + x.bytes, 0) };
}
