/**
 * THE MALPAIS' GROUND LAYERS (Milestone 3 wave 2, area A: the look; BIBLE §3.3 "cold aa and pahoehoe lava rock, cinder
 * bands, lichen crust", Rust Cone "red cinder cone; scree to slide"). Four layers, all procedural and project-original,
 * deterministic, tileable, at 512²:
 *
 *   0 aa        clinker rubble: jagged clasts 3-25 cm, black-brown, their broken tops oxidised, deep voids      (2.6 m tile)
 *   1 pahoehoe  ropy sheets: folded skins in arcs across the flow, glassy blue-black, a few inflation clefts     (3.4 m tile)
 *   2 cinder    lapilli 0.5-3 cm: black and red-brown, loose                                                     (1.6 m tile)
 *   3 scree     Rust Cone's scoria: angular red clasts 2-10 cm, oxidised (the bible's rust red) and a few black   (2.2 m tile)
 *
 * Nothing in them glows: every tone is a dark rock's (BIBLE §3: zero emissive terrain). Shipped as two KTX2 texture
 * arrays (src/world/sites/malpais-files.js MALPAIS_LAYERS), fetched on the Malpais' approach, never at boot:
 *   public/textures/malpais/malpais_a.ktx2   RGB albedo (sRGB data, decoded in the shader), A height          ETC1S
 *   public/textures/malpais/malpais_n.ktx2   RG normal XY (Z rebuilt), B roughness, A cavity AO               UASTC
 * Textures are authored for flipY = false (row 0 = v 0); normal Y = -dh/dv, as tools/build/ground/gen-ground-layers.mjs.
 *
 *   node tools/build/ground/gen-malpais-layers.mjs [--ktx <path of the ktx tool>] [--png <dir outside the repo>]
 *
 * The encoder is KTX-Software's `ktx` (tools/build/pipeline/ktx2.mjs ktxBin: --ktx, $CALIMA_KTX, or the download).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ktxBin, SETTINGS } from '../pipeline/ktx2.mjs';
import { MALPAIS_LAYERS } from '../../../src/world/sites/malpais-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/* ------------------------------------------------------------ tileable noise ---- */
const wrap = (a, p) => ((a % p) + p) % p;
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function perlin(u, v, p, seed) {
  const x = u * p, y = v * p, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const g = (i, j, dx, dy) => { const a = hash2(wrap(i, p), wrap(j, p), seed) * Math.PI * 2; return Math.cos(a) * dx + Math.sin(a) * dy; };
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = g(ix, iy, fx, fy), b = g(ix + 1, iy, fx - 1, fy), c = g(ix, iy + 1, fx, fy - 1), d = g(ix + 1, iy + 1, fx - 1, fy - 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 1.5;
}
function fbm(u, v, base, oct, seed, gain = 0.5) {
  let s = 0, a = 1, n = 0, f = base;
  for (let o = 0; o < oct; o++) { s += a * perlin(u, v, f, seed + o * 17); n += a; a *= gain; f *= 2; }
  return s / n;
}
/** Tileable Worley: f1, f2, the nearest cell's id and its offset (dx, dy) from the point, in cell units. */
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

/** A faceted clast: the Worley cell cut by five planes at its own turn, a low pyramid with flat facets, so it reads broken
 * and angular (clinker), never a rounded pebble. 1 at its peak, 0 at its foot. */
function clast(w, seed) {
  const a0 = w.id * 6.283 + seed;
  let m = -9;
  for (let k = 0; k < 5; k++) {
    const a = a0 + k * 1.2566 + (hash2(k, Math.floor(w.id * 1e6), 3) - 0.5) * 0.5;
    m = Math.max(m, w.dx * Math.cos(a) + w.dy * Math.sin(a));
  }
  return clamp01(1 - m * 2.1);
}

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
/** The albedo's ceiling (sRGB): 0.50 is linear 0.218, so ETC1S's few codes of error stay well under the bar's 0.30. */
export const ALBEDO_CAP = 0.5;
function pack(N, L) {
  const NR = normalFrom(L.H, N, L.normal), AO = cavity(L.H, N, L.ao, L.aoR);
  const a = Buffer.alloc(N * N * 4), n = Buffer.alloc(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    // (M3 wave 2 fix round 1, MP1 on the SHIPPED files: ETC1S lifted 14 scree and cinder texels of 150/255 past linear
    // 0.30) every albedo channel is capped at ALBEDO_CAP before the encoder, leaving the codec its error under 0.30
    a[i * 4] = Math.round(Math.min(ALBEDO_CAP, clamp01(L.A[i * 3])) * 255);
    a[i * 4 + 1] = Math.round(Math.min(ALBEDO_CAP, clamp01(L.A[i * 3 + 1])) * 255);
    a[i * 4 + 2] = Math.round(Math.min(ALBEDO_CAP, clamp01(L.A[i * 3 + 2])) * 255);
    a[i * 4 + 3] = Math.round(clamp01(L.H[i]) * 255);
    n[i * 4] = Math.round((NR[i * 2] * 0.5 + 0.5) * 255);
    n[i * 4 + 1] = Math.round((NR[i * 2 + 1] * 0.5 + 0.5) * 255);
    n[i * 4 + 2] = Math.round(clamp01(L.R[i]) * 255);
    n[i * 4 + 3] = Math.round(clamp01(AO[i]) * 255);
  }
  return { a, n };
}

/* ------------------------------------------------------------------- layers ---- */
/** AA: clinker rubble. Three sizes of broken clasts piled, the larger on top; deep black voids between them. Whole clasts
 * are oxidised (dull red-brown), never their peaks alone: a bright core in a dark clast reads as heat. */
function aa(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  // (fix round 1: the plain read maroon at 17:45, hue 10.5 deg, saturation 0.60) cold basalt: blue-grey black clasts, the
  // oxidised ones a dull umber and fewer
  const black = hex(0x111214), brown = hex(0x26272a), ox = hex(0x352c27), grey = hex(0x34363a);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const wu = u + fbm(u, v, 6, 2, 3) * 0.02, wv = v + fbm(u, v, 6, 2, 5) * 0.02;
    const big = worley(wu, wv, 9, 11, 0.95), mid = worley(wu + 0.37, wv + 0.11, 20, 13, 0.95), sml = worley(wu + 0.13, wv + 0.59, 44, 17, 0.95);
    const hB = clast(big, 1.3) * (0.7 + big.id * 0.3), hM = clast(mid, 2.1) * (0.5 + mid.id * 0.3), hS = clast(sml, 0.7) * 0.38;
    let h = Math.max(hB, hM, hS);
    const id = h === hB ? big.id : h === hM ? mid.id : sml.id;
    const spin = fbm(u, v, 70, 2, 9) * 0.05 + fbm(u, v, 24, 2, 19) * 0.04;   // the clinker's spiny, scoriaceous skin
    h = clamp01(h + spin * sm(0.05, 0.3, h));
    H[i] = h;
    const on = sm(0.02, 0.16, h);
    const oxK = sm(-0.15, 0.45, fbm(u, v, 3, 3, 31));                          // oxidised patches a metre across
    const c0 = id > 0.88 ? grey : id < 0.12 + 0.3 * oxK ? ox : brown;
    const t = 0.8 + id * 0.28 + fbm(u, v, 40, 2, 13) * 0.1;
    const c = mix3(black, [c0[0] * t, c0[1] * t, c0[2] * t], on);
    A[i * 3] = c[0]; A[i * 3 + 1] = c[1]; A[i * 3 + 2] = c[2];
    R[i] = clamp01(0.9 + (1 - on) * 0.08);
  }
  return { H, A, R, normal: 11, ao: 3.4, aoR: [2, 6, 12] };
}

/** PAHOEHOE: ropy sheets. Folds bowed downflow in arcs (the skin dragged by the moving lava under it), a glassy
 * blue-black skin, low smooth swells between the rope trains, and a few clefts where a lobe inflated and cracked. */
function pahoehoe(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const skin = hex(0x18181b), skinHi = hex(0x2b2b2f), bronze = hex(0x3a3028), cleft = hex(0x0d0d0f), ox = hex(0x4a3226);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    // the rope trains: arcs across the flow (v downflow), each arc's bow from a slow field, warped so no two are equal
    const train = sm(-0.05, 0.3, fbm(u, v, 2, 2, 41));                              // where the ropes are, 0 = smooth sheet
    const bow = Math.cos((u * 2 + fbm(u, v, 1, 2, 43) * 0.5) * Math.PI * 2) * 0.09 + fbm(u, v, 3, 3, 47) * 0.1;
    const s = (v + bow) * 22 + fbm(u, v, 8, 2, 49) * 0.9;
    const rope = Math.pow(Math.abs(Math.sin(s * Math.PI)), 0.6);                   // rounded crests, narrow troughs
    const fine = Math.abs(Math.sin((v + bow * 1.1) * 61 * Math.PI + fbm(u, v, 16, 2, 51) * 3)) * 0.18;
    const swell = fbm(u, v, 3, 3, 53) * 0.5 + 0.5;
    const cw = worley(u + fbm(u, v, 5, 2, 55) * 0.05, v, 3, 57, 0.8);
    const crk = sm(0.035, 0.0, cw.f2 - cw.f1) * sm(0.1, 0.5, fbm(u, v, 3, 2, 59));
    const h = clamp01(0.3 + swell * 0.35 + (rope * 0.32 + fine) * train - crk * 0.45);
    H[i] = h;
    const sheen = sm(0.45, 0.95, rope) * train;
    let c = mix3(skin, skinHi, clamp01(swell * 0.6 + sheen * 0.4));
    c = mix3(c, bronze, sm(0.2, 0.6, fbm(u, v, 4, 3, 61)) * 0.35);                   // the skin's iridescent bronze patches, dull
    c = mix3(c, ox, sm(0.3, 0.7, fbm(u, v, 6, 3, 63)) * 0.18);
    c = mix3(c, cleft, crk);
    A[i * 3] = c[0]; A[i * 3 + 1] = c[1]; A[i * 3 + 2] = c[2];
    // a glassy skin (0.45) on the crests, duller in the troughs and the clefts
    R[i] = clamp01(0.62 - sheen * 0.18 + crk * 0.3 + (1 - train) * 0.06);
  }
  return { H, A, R, normal: 7, ao: 2.4, aoR: [2, 5] };
}

/** CINDER: loose lapilli, black and red-brown, in drifts. */
function cinder(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const black = hex(0x18181a), red = hex(0x3e2620), ox = hex(0x553023), fines = hex(0x222023);   // (fix round 1) cooler, the red a tinge
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const a = worley(u, v, 48, 71, 0.95), b = worley(u + 0.27, v + 0.41, 96, 73, 0.95);
    const dA = Math.sqrt(Math.max(0, 1 - Math.pow(a.f1 / 0.6, 2))), dB = Math.sqrt(Math.max(0, 1 - Math.pow(b.f1 / 0.58, 2))) * 0.6;
    const top = dA >= dB, dome = top ? dA : dB, id = top ? a.id : b.id;
    H[i] = clamp01(dome * 0.8 + fbm(u, v, 4, 2, 75) * 0.12 + 0.05);
    const on = sm(0.05, 0.25, dome);
    const redK = sm(-0.25, 0.35, fbm(u, v, 3, 3, 77));
    const sc = id > 0.8 ? ox : id > 0.45 * (1 - redK * 0.6) ? red : black;
    const t = (0.7 + id * 0.45) * (0.65 + 0.45 * dome);
    const c = mix3(fines, [sc[0] * t, sc[1] * t, sc[2] * t], on);
    A[i * 3] = c[0]; A[i * 3 + 1] = c[1]; A[i * 3 + 2] = c[2];
    R[i] = clamp01(0.93 + (1 - on) * 0.05);
  }
  return { H, A, R, normal: 9, ao: 3.0, aoR: [2, 5] };
}

/** SCREE: Rust Cone's scoria. Angular oxidised clasts, the bible's rust red (#8E3B23) and its kin, a few black. */
function scree(N) {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  // (fix round 1: at a 1.2 m tile the red clasts on black read as confetti from 10-60 m) the clasts and the fines in one
  // narrow band of rust (#8E3B23 and its kin), a few darker, almost none black
  const rust = hex(0x7e3624), dark = hex(0x5a2a1e), ochre = hex(0x7a4029), black = hex(0x3a221c), fines = hex(0x5e2c1f);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const wu = u + fbm(u, v, 8, 2, 81) * 0.015, wv = v + fbm(u, v, 8, 2, 83) * 0.015;
    const big = worley(wu, wv, 18, 85, 0.95), sml = worley(wu + 0.21, wv + 0.33, 40, 87, 0.95);
    const hB = clast(big, 0.9) * (0.7 + big.id * 0.3), hS = clast(sml, 2.7) * 0.5;
    const h = Math.max(hB, hS), id = h === hB ? big.id : sml.id;
    H[i] = clamp01(h + fbm(u, v, 60, 2, 89) * 0.05);
    const on = sm(0.03, 0.2, h);
    const sc = id > 0.96 ? black : id > 0.86 ? ochre : id > 0.4 ? rust : dark;
    const t = 0.86 + id * 0.16 + fbm(u, v, 30, 2, 91) * 0.08;
    const c = mix3(fines, [sc[0] * t, sc[1] * t, sc[2] * t], on);
    A[i * 3] = c[0]; A[i * 3 + 1] = c[1]; A[i * 3 + 2] = c[2];
    R[i] = clamp01(0.9 + (1 - on) * 0.06);
  }
  return { H, A, R, normal: 10, ao: 3.0, aoR: [2, 6] };
}

const MAKERS = { aa, pahoehoe, cinder, scree };

/** Every layer as two RGBA buffers (Node tests read the albedo: no texel brighter than a dark rock's). */
export function buildLayers(N = MALPAIS_LAYERS.size) {
  return MALPAIS_LAYERS.ids.map((id) => ({ id, N, ...pack(N, MAKERS[id](N)) }));
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const bin = ktxBin(flag('--ktx'));
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'malpais-layers-'));
  const pngOut = flag('--png');
  try {
    const layers = buildLayers();
    for (const part of ['a', 'n']) {
      const pngs = [];
      for (const L of layers) {
        const f = path.join(tmp, `${L.id}_${part}.png`);
        await sharp(L[part], { raw: { width: L.N, height: L.N, channels: 4 } }).png({ compressionLevel: 1 }).toFile(f);
        pngs.push(f);
        if (pngOut) { mkdirSync(pngOut, { recursive: true }); writeFileSync(path.join(pngOut, `${L.id}_${part}.png`), readFileSync(f)); }
      }
      const srgb = part === 'a';
      const out = path.join(ROOT, 'public', MALPAIS_LAYERS.files[part]);
      mkdirSync(path.dirname(out), { recursive: true });
      const ktxOut = path.join(tmp, `malpais_${part}.ktx2`);
      const argv = ['create', '--format', `R8G8B8A8_${srgb ? 'SRGB' : 'UNORM'}`, '--assign-tf', srgb ? 'srgb' : 'linear', '--assign-primaries', 'bt709', '--testrun',
        '--layers', String(pngs.length), ...SETTINGS.mips, '--mipmap-wrap', 'wrap', ...SETTINGS[srgb ? 'etc1s' : 'uastc'], ...pngs, ktxOut];
      execFileSync(bin, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
      writeFileSync(out, readFileSync(ktxOut));
      console.log(`${path.relative(ROOT, out)}: ${layers.length} layers ${MALPAIS_LAYERS.size}², ${readFileSync(out).length} B`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
