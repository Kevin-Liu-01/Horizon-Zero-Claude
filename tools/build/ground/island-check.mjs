/**
 * Offline proof of the landform recipe (world-ground W1): runs src/world/island/recipe.js
 * in node, with no browser, and checks what `A-world-size` and `A-trig-pillars` will
 * test in the page: site heights ±3 m, the ten sight rays, land area, biome bands.
 *
 *   node tools/build/ground/island-check.mjs [--png <dir>]
 *
 * With --png it writes a shaded-relief map and a biome map (development aid).
 * Not a recipe: it has no LANE/OUTPUTS, the asset driver skips it.
 */
import { performance } from 'node:perf_hooks';
import { ensureMacro, heightAt, biomesAt, BIOMES, COAST } from '../../../src/world/island/recipe.js';
import { SITES, TRIG, TRIG_TOP, SIGHT_PAIRS } from '../../../src/world/island/sites.js';
import { PLAY_RADIUS } from '../../../src/world/island/extent.js';

const t0 = performance.now();
ensureMacro();
const macroMs = performance.now() - t0;

const rows = [];
let bad = 0;
for (const s of SITES) {
  const h = heightAt(s.x, s.z);
  const ok = Math.abs(h - s.h) <= 3;
  if (!ok) bad++;
  rows.push(`${ok ? 'ok ' : 'BAD'} ${s.id.padEnd(18)} stated ${String(s.h).padStart(5)}  got ${h.toFixed(2).padStart(7)}`);
}
for (const t of TRIG) {
  const h = heightAt(t.x, t.z);
  rows.push(`    ${t.id.padEnd(18)} stated ${String(t.h).padStart(5)}  got ${h.toFixed(2).padStart(7)}`);
}
console.log(rows.join('\n'));

const trig = Object.fromEntries(TRIG.map((t) => [t.id, t]));
let blocked = 0;
for (const [a, b] of SIGHT_PAIRS) {
  const A = trig[a], B = trig[b];
  const ah = heightAt(A.x, A.z) + TRIG_TOP, bh = heightAt(B.x, B.z) + TRIG_TOP;
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  let clear = Infinity, at = 0;
  for (let d = 6; d < len - 6; d += 2) {
    const t = d / len;
    const c = ah + (bh - ah) * t - heightAt(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t);
    if (c < clear) { clear = c; at = d; }
  }
  if (clear < 0) blocked++;
  console.log(`${clear >= 0 ? 'ok ' : 'BAD'} ${a}-${b} len ${len.toFixed(0)} min clearance ${clear.toFixed(2)} at ${at} m`);
}

// land area + extent + slope stats
let land = 0, maxH = -1e9, hist = {}, beyond = 0;
const w = new Float64Array(6);
const STEP = 4;
const t1 = performance.now();
let n = 0;
for (let z = -660; z <= 660; z += STEP) for (let x = -660; x <= 660; x += STEP) {
  const h = heightAt(x, z); n++;
  if (h > 0) {
    land += STEP * STEP;
    if (h > maxH) maxH = h;
    biomesAt(x, z, w);
    let bi = 0; for (let b = 1; b < 6; b++) if (w[b] > w[bi]) bi = b;
    hist[BIOMES[bi]] = (hist[BIOMES[bi]] || 0) + STEP * STEP;
    if (Math.hypot(x, z) > PLAY_RADIUS) beyond += STEP * STEP;
  }
}
const us = (performance.now() - t1) * 1000 / n;
console.log(`macro ${macroMs.toFixed(0)} ms; height eval ${us.toFixed(2)} us/sample`);
console.log(`land ${(land / 1e6).toFixed(3)} km2; summit ${maxH.toFixed(1)} m; land beyond PLAY_RADIUS ${beyond} m2`);
for (const b of BIOMES) console.log(`  ${b.padEnd(10)} ${(100 * (hist[b] || 0) / land).toFixed(1)} %`);

// the current ring must stand inside the play radius: walk each bearing from outside
let worstR = 0, worstB = 0;
for (let a = 0; a < 360; a += 3) {
  const cs = Math.cos(a * Math.PI / 180), sn = Math.sin(a * Math.PI / 180);
  let r = 640;
  while (r > 100 && heightAt(cs * r, sn * r) < -1.1) r -= 1;
  if (r > worstR) { worstR = r; worstB = a; }
}
console.log(`outermost 1.1 m contour r = ${worstR} (bearing ${worstB}); PLAY_RADIUS ${PLAY_RADIUS}`);

// offline A-reach-all-sites: the same slope rule as frozen nav.js (2 m cells, |grad| > 1 blocked, dry land only)
{
  const C = 2, R = PLAY_RADIUS + 2, N = Math.ceil(R * 2 / C) + 1;
  const g = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = heightAt(-R + i * C, -R + j * C);
  const open = new Uint8Array(N * N);
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const o = j * N + i, h = g[o];
    const sl = Math.hypot((g[o + 1] - h) / C, (g[o + N] - h) / C);
    const r = Math.hypot(-R + i * C, -R + j * C);
    open[o] = sl <= 1 && h > -1.0 && r <= PLAY_RADIUS - 6 ? 1 : 0;
  }
  const seen = new Int32Array(N * N).fill(-1);
  const idx = (x, z) => Math.round((z + R) / C) * N + Math.round((x + R) / C);
  const s0 = idx(-283.4, 246.3);
  seen[s0] = 0;
  let q = [s0];
  while (q.length) {
    const nx = [];
    for (const o of q) for (const d of [1, -1, N, -N, N + 1, N - 1, -N + 1, -N - 1]) {
      const p = o + d;
      if (p < 0 || p >= N * N || !open[p] || seen[p] >= 0) continue;
      seen[p] = seen[o] + 1;
      nx.push(p);
    }
    q = nx;
  }
  const near = (x, z) => {
    const c = idx(x, z);
    for (let rad = 0; rad < 40; rad++) for (let b = -rad; b <= rad; b++) for (let a = -rad; a <= rad; a++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== rad) continue;
      if (seen[c + b * N + a] >= 0) return rad * C;
    }
    return 99;
  };
  for (const s of [...SITES, ...TRIG]) {
    const d = near(s.x, s.z);
    console.log(`${d === 0 ? 'ok ' : 'BAD'} reach ${s.id.padEnd(18)} nearest reachable cell ${d} m`);
    if (d) bad++;
  }
}

const pngAt = process.argv.indexOf('--png');
if (pngAt > 0) {
  const dir = process.argv[pngAt + 1];
  const sharp = (await import('sharp')).default;
  const N = 1024, span = 1100;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    H[j * N + i] = heightAt(-span / 2 + (i + 0.5) * span / N, -span / 2 + (j + 0.5) * span / N);
  }
  const rgb = Buffer.alloc(N * N * 3), bio = Buffer.alloc(N * N * 3);
  const PAL = [[230, 225, 210], [150, 110, 80], [80, 70, 70], [80, 130, 70], [120, 130, 150], [210, 190, 150]];
  const step = span / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i, h = H[o];
    const hx = H[j * N + Math.min(N - 1, i + 1)] - h, hz = H[Math.min(N - 1, j + 1) * N + i] - h;
    const nx = -hx / step, nz = -hz / step;
    const l = Math.max(0.05, (nx * 0.6 + nz * -0.5 + 0.62) / Math.hypot(nx, nz, 1));
    let c;
    if (h < 0) { const k = Math.min(1, -h / 8); c = [30 + 20 * (1 - k), 70 + 50 * (1 - k), 110 + 50 * (1 - k)]; }
    else { const t = Math.min(1, h / 245); c = [90 + 150 * t, 85 + 130 * t, 75 + 120 * t]; }
    const lm = h < 0 ? 1 : l * 1.3; rgb[o * 3] = Math.min(255, c[0] * lm); rgb[o * 3 + 1] = Math.min(255, c[1] * lm); rgb[o * 3 + 2] = Math.min(255, c[2] * lm);
    biomesAt(-span / 2 + (i + 0.5) * step, -span / 2 + (j + 0.5) * step, w);
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < 6; k++) { r += PAL[k][0] * w[k]; g += PAL[k][1] * w[k]; b += PAL[k][2] * w[k]; }
    const m = h < 0 ? 0.25 : 1;
    bio[o * 3] = r * m; bio[o * 3 + 1] = g * m; bio[o * 3 + 2] = b * m;
  }
  await sharp(rgb, { raw: { width: N, height: N, channels: 3 } }).png().toFile(`${dir}/relief.png`);
  await sharp(bio, { raw: { width: N, height: N, channels: 3 } }).png().toFile(`${dir}/biomes.png`);
  // the Pans close up, 400 m wide
  const PN = 1000, cx = -300, cz = 300, ps = 360;
  const q = Buffer.alloc(PN * PN * 3);
  const H2 = new Float32Array(PN * PN);
  for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) {
    H2[j * PN + i] = heightAt(cx - ps / 2 + (i + 0.5) * ps / PN, cz - ps / 2 + (j + 0.5) * ps / PN);
  }
  const st2 = ps / PN;
  for (let j = 0; j < PN; j++) for (let i = 0; i < PN; i++) {
    const o = j * PN + i, h = H2[o];
    const hx = H2[j * PN + Math.min(PN - 1, i + 1)] - h, hz = H2[Math.min(PN - 1, j + 1) * PN + i] - h;
    const l = Math.max(0.1, Math.min(1.6, 0.8 + (-hx / st2) * 2.2 + (hz / st2) * 1.6));
    const t = Math.min(1, Math.max(0, h / 8));
    const c = h < 0 ? [40, 90, 130] : [60 + 190 * t, 60 + 180 * t, 60 + 160 * t];
    q[o * 3] = Math.min(255, c[0] * l); q[o * 3 + 1] = Math.min(255, c[1] * l); q[o * 3 + 2] = Math.min(255, c[2] * l);
  }
  await sharp(q, { raw: { width: PN, height: PN, channels: 3 } }).png().toFile(`${dir}/pans.png`);
}
if (bad || blocked) process.exitCode = 1;
