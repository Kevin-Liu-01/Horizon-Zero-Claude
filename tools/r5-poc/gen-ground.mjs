#!/usr/bin/env node
/**
 * ROUND 5 PIPELINE PROOF — ground materials for the biome patch.
 *
 *   node tools/r5-poc/gen-ground.mjs            (procedural layers + CC0 rock)
 *   node tools/r5-poc/gen-ground.mjs --no-fetch (procedural only)
 *
 * Every layer ships as TWO RGBA WebP files, so a 3-layer splat costs 6
 * texture units and every channel is used:
 *   <layer>_a.webp  RGB albedo (sRGB)          A height (blend + parallax-free AO)
 *   <layer>_n.webp  RG  normal XY (Z rebuilt)  B roughness   A cavity AO
 * Textures are authored for flipY = false (row 0 = v 0); normal Y = -dh/dv.
 *
 * Layers:
 *   sand  PROCEDURAL  basalt black sand, wind ripples, olivine/shell grains (2.4 m tile)
 *   salt  PROCEDURAL  salt-pan crust: polygon plates, raised rims, dirty cracks (5 m tile)
 *   rock  CC0 SCAN    Poly Haven "rock_face" 1K (CC0, no attribution required),
 *                     repacked into the same two-texture layout (and a procedural
 *                     basalt fallback, `rockp`, so the two routes can be compared)
 *
 * Writes public/textures/r5-poc/*.webp + MANIFEST.json, and
 * tools/r5-poc/out/ground.stats.json (ms + bytes per layer).
 */
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${ROOT}public/textures/r5-poc/`;
const SCRATCH = process.env.R5_SCRATCH
  || '/private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/cc0';
const N = 1024;
const FETCH = !process.argv.includes('--no-fetch');
mkdirSync(OUT, { recursive: true });
mkdirSync(`${ROOT}tools/r5-poc/out`, { recursive: true });

/* ----------------------------- tileable noise ---------------------------- */
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const wrap = (a, p) => ((a % p) + p) % p;
function vnoise(x, y, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = wrap(ix, p), x1 = wrap(ix + 1, p), y0 = wrap(iy, p), y1 = wrap(iy + 1, p);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(u, v, base, oct, seed, gain = 0.5) {
  let s = 0, a = 1, n = 0, f = base;
  for (let o = 0; o < oct; o++) { s += a * vnoise(u * f, v * f, f, seed + o * 17); n += a; a *= gain; f *= 2; }
  return s / n;
}
/** Tileable Worley: { f1, f2, id } over a `p` x `p` jittered lattice. */
function worley(u, v, p, seed, jitter = 0.85) {
  const x = u * p, y = v * p;
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j;
    const wx = wrap(cx, p), wy = wrap(cy, p);
    const ox = 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
    const oy = 0.5 + (hash2(wx, wy, seed + 101) - 0.5) * jitter;
    const dx = cx + ox - x, dy = cy + oy - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 7); } else if (d < f2) f2 = d;
  }
  return { f1, f2, id };
}
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const srgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];

/* --------------------------- packing helpers ----------------------------- */
function normalFromHeight(H, strength) {
  const nrm = new Float32Array(N * N * 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xm = (x - 1 + N) % N, xp = (x + 1) % N, ym = (y - 1 + N) % N, yp = (y + 1) % N;
    const dx = (H[y * N + xp] - H[y * N + xm]) * strength;
    const dy = (H[yp * N + x] - H[ym * N + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    nrm[(y * N + x) * 2] = -dx / l;
    nrm[(y * N + x) * 2 + 1] = -dy / l;
  }
  return nrm;
}
function cavity(H) {
  // height minus its local mean (3-tap box at two radii): crevices darken
  const C = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, n = 0;
    for (const r of [3, 9]) for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      s += H[((y + oy + N) % N) * N + (x + ox + N) % N]; n++;
    }
    C[y * N + x] = clamp01(0.75 + (H[y * N + x] - s / n) * 4.0);
  }
  return C;
}
async function writePair(name, A, H, NR, R, AO) {
  const a = Buffer.alloc(N * N * 4), n = Buffer.alloc(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    a[i * 4] = Math.round(clamp01(A[i * 3]) * 255);
    a[i * 4 + 1] = Math.round(clamp01(A[i * 3 + 1]) * 255);
    a[i * 4 + 2] = Math.round(clamp01(A[i * 3 + 2]) * 255);
    a[i * 4 + 3] = Math.round(clamp01(H[i]) * 254) + 1;   // never 0: keeps RGB under alpha
    n[i * 4] = Math.round((NR[i * 2] * 0.5 + 0.5) * 255);
    n[i * 4 + 1] = Math.round((NR[i * 2 + 1] * 0.5 + 0.5) * 255);
    n[i * 4 + 2] = Math.round(clamp01(R[i]) * 255);
    n[i * 4 + 3] = Math.round(clamp01(AO[i]) * 254) + 1;
  }
  const opt = { quality: 88, alphaQuality: 92, effort: 5, exact: true };
  await sharp(a, { raw: { width: N, height: N, channels: 4 } }).webp(opt).toFile(`${OUT}${name}_a.webp`);
  await sharp(n, { raw: { width: N, height: N, channels: 4 } }).webp({ ...opt, quality: 92 }).toFile(`${OUT}${name}_n.webp`);
  return statSync(`${OUT}${name}_a.webp`).size + statSync(`${OUT}${name}_n.webp`).size;
}

/* ------------------------------- layers ---------------------------------- */
function sandLayer() {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const dark = srgb(0x2e2c2b), crest = srgb(0x4a4643), olive = srgb(0x55613a), shell = srgb(0xcfc6b4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    // wind ripples: 18 crests per tile, phase warped by low-frequency noise
    const warp = fbm(u, v, 3, 3, 11) * 2.2 + fbm(u, v, 7, 2, 23) * 0.5;
    const ph = (v * 18 + u * 3 + warp) * Math.PI * 2;
    const rip = Math.pow(0.5 + 0.5 * Math.sin(ph), 1.6);          // asymmetric crest
    const grain = fbm(u, v, 64, 3, 5, 0.6);
    const w = worley(u, v, 48, 9);
    const peb = sm(0.35, 0.0, w.f1) * (w.id > 0.82 ? 1 : 0);       // sparse pebbles
    const h = rip * 0.55 + grain * 0.3 + peb * 0.5;
    H[i] = h;
    let k = mix(0.0, 1.0, rip * 0.55 + (grain - 0.5) * 0.6);
    let c = [mix(dark[0], crest[0], k), mix(dark[1], crest[1], k), mix(dark[2], crest[2], k)];
    const g = hash2(x, y, 77);
    if (g > 0.9965) c = olive;                                       // olivine glints
    else if (g < 0.0025) c = shell;                                  // shell grit
    if (peb > 0.2) { const t = 0.7 + w.id * 0.3; c = [c[0] * t, c[1] * t, c[2] * t * 0.97]; }
    A[i * 3] = c[0]; A[i * 3 + 1] = c[1]; A[i * 3 + 2] = c[2];
    R[i] = 0.86 + (1 - rip) * 0.08 - peb * 0.2;
  }
  return { H, A, R, normal: 9.0 };
}

function saltLayer() {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const crust = srgb(0xeee8dc), rim = srgb(0xfbf8f2), dirt = srgb(0x8d7a66), pink = srgb(0xe9d5cb);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    // polygon plates ~0.7 m across in a 5 m tile, edges warped
    const wu = u + (fbm(u, v, 6, 2, 41) - 0.5) * 0.035, wv = v + (fbm(u, v, 6, 2, 43) - 0.5) * 0.035;
    const w = worley(wu, wv, 7, 3);
    const edge = w.f2 - w.f1;                                        // 0 on a border
    const ridge = sm(0.16, 0.0, edge);                               // raised pressure ridge
    const crack = sm(0.022, 0.0, edge);                              // the open crack in its crest
    const crystal = fbm(u, v, 96, 3, 13, 0.55);
    const dome = (1 - w.f1) * 0.15;
    const h = 0.35 + ridge * 0.5 - crack * 0.45 + crystal * 0.12 + dome + (w.id - 0.5) * 0.08;
    H[i] = h;
    const dirty = clamp01(crack * 1.2 + (fbm(u, v, 4, 3, 51) - 0.55) * 1.4);
    let c = [mix(crust[0], rim[0], ridge), mix(crust[1], rim[1], ridge), mix(crust[2], rim[2], ridge)];
    const pk = sm(0.55, 0.8, fbm(u, v, 3, 3, 61)) * 0.6;
    c = [mix(c[0], pink[0], pk), mix(c[1], pink[1], pk), mix(c[2], pink[2], pk)];
    c = [mix(c[0], dirt[0], dirty), mix(c[1], dirt[1], dirty), mix(c[2], dirt[2], dirty)];
    const t = 0.92 + crystal * 0.12;
    A[i * 3] = c[0] * t; A[i * 3 + 1] = c[1] * t; A[i * 3 + 2] = c[2] * t;
    R[i] = 0.62 + crystal * 0.18 + crack * 0.15;
  }
  return { H, A, R, normal: 6.0 };
}

function basaltLayer() {
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const base = srgb(0x3a3937), light = srgb(0x5d5a55), rust = srgb(0x6b4a33);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    const w = worley(u, v, 5, 21, 0.6);                              // column joints
    const joint = sm(0.07, 0.0, w.f2 - w.f1);
    const frac = sm(0.03, 0.0, Math.abs(fbm(u, v, 16, 3, 33) - 0.5));  // fine fractures
    const ves = worley(u, v, 40, 31);                                // vesicles
    const pit = sm(0.22, 0.0, ves.f1) * (ves.id > 0.6 ? 1 : 0);
    const n = fbm(u, v, 8, 5, 37);
    const h = 0.55 + n * 0.35 - joint * 0.45 - frac * 0.15 - pit * 0.25;
    H[i] = h;
    const k = clamp01(n * 1.1 - 0.15 + w.id * 0.25);
    let c = [mix(base[0], light[0], k), mix(base[1], light[1], k), mix(base[2], light[2], k)];
    const rr = sm(0.6, 0.85, fbm(u, v, 5, 3, 71)) * 0.45;
    c = [mix(c[0], rust[0], rr), mix(c[1], rust[1], rr), mix(c[2], rust[2], rr)];
    const d = 1 - joint * 0.5 - pit * 0.4;
    A[i * 3] = c[0] * d; A[i * 3 + 1] = c[1] * d; A[i * 3 + 2] = c[2] * d;
    R[i] = 0.78 + joint * 0.12;
  }
  return { H, A, R, normal: 7.0 };
}

async function procedural(name, fn) {
  const t0 = performance.now();
  const L = fn();
  const t1 = performance.now();
  const NR = normalFromHeight(L.H, L.normal);
  const AO = cavity(L.H);
  const t2 = performance.now();
  const bytes = await writePair(name, L.A, L.H, NR, L.R, AO);
  const t3 = performance.now();
  return { layer: name, route: 'procedural (node, tileable fbm/worley)', size: N,
    ms: { field: +(t1 - t0).toFixed(0), derive: +(t2 - t1).toFixed(0), encode: +(t3 - t2).toFixed(0) },
    bytes, kb: +(bytes / 1024).toFixed(1), licence: 'original work (generated)' };
}

/* --------------------------- CC0 scan (Poly Haven) ----------------------- */
async function cc0Rock() {
  const id = 'rock_face';
  const t0 = performance.now();
  mkdirSync(SCRATCH, { recursive: true });
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const want = { diff: files.Diffuse['1k'].jpg, nor: files.nor_gl['1k'].jpg, arm: files.arm['1k'].jpg };
  let downloaded = 0;
  const local = {};
  for (const [k, f] of Object.entries(want)) {
    const p = `${SCRATCH}/${id}_${k}.jpg`;
    if (!existsSync(p)) {
      const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
      writeFileSync(p, buf);
    }
    downloaded += statSync(p).size;
    local[k] = p;
  }
  const t1 = performance.now();
  const raw = async (p) => (await sharp(p).resize(N, N).removeAlpha().raw().toBuffer());
  const D = await raw(local.diff), Nn = await raw(local.nor), M = await raw(local.arm);
  const A = new Float32Array(N * N * 3), H = new Float32Array(N * N), R = new Float32Array(N * N);
  const NR = new Float32Array(N * N * 2), AO = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    A[i * 3] = D[i * 3] / 255; A[i * 3 + 1] = D[i * 3 + 1] / 255; A[i * 3 + 2] = D[i * 3 + 2] / 255;
    // nor_gl is +V-up (flipY textures); every r5 ground texture loads flipY=false, so G flips
    NR[i * 2] = Nn[i * 3] / 127.5 - 1; NR[i * 2 + 1] = -(Nn[i * 3 + 1] / 127.5 - 1);
    AO[i] = M[i * 3] / 255; R[i] = M[i * 3 + 1] / 255;
    // height proxy: AO x luminance (crevices are low) — the splat only needs ordering
    H[i] = clamp01((M[i * 3] / 255) * 0.7 + (D[i * 3 + 1] / 255) * 0.6);
  }
  const bytes = await writePair('rock', A, H, NR, R, AO);
  const t2 = performance.now();
  return { layer: 'rock', route: 'CC0 scan, Poly Haven rock_face 1K (diff + nor_gl + arm JPG), repacked', size: N,
    source: `https://polyhaven.com/a/${id}`, licence: 'CC0 1.0 (Poly Haven: no attribution required)',
    downloadedKB: +(downloaded / 1024).toFixed(1), ms: { download: +(t1 - t0).toFixed(0), repack: +(t2 - t1).toFixed(0) },
    bytes, kb: +(bytes / 1024).toFixed(1) };
}

const stats = [];
stats.push(await procedural('sand', sandLayer));
stats.push(await procedural('salt', saltLayer));
stats.push(await procedural('rockp', basaltLayer));
if (FETCH) {
  try { stats.push(await cc0Rock()); } catch (e) { console.warn('CC0 fetch failed, using procedural rock:', e.message); }
}
// downloads are scratch: keep nothing we do not ship
if (existsSync(SCRATCH)) rmSync(SCRATCH, { recursive: true, force: true });

const manifest = stats.map((s) => ({ files: [`${s.layer}_a.webp`, `${s.layer}_n.webp`], route: s.route,
  source: s.source || 'tools/r5-poc/gen-ground.mjs', licence: s.licence }));
writeFileSync(`${OUT}MANIFEST.json`, JSON.stringify({ generatedBy: 'tools/r5-poc/gen-ground.mjs', layers: manifest }, null, 2));
writeFileSync(`${ROOT}tools/r5-poc/out/ground.stats.json`, JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 1));
