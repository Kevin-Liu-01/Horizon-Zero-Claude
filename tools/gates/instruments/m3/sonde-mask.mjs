/**
 * M3 area C, wave 2: THE SONDE'S SWEPT-VOLUME MASK, and the proof that no accepted frame changes outside it (M3 briefs
 * §2 rule 19: "a moving thing (the Sonde ...) is either kept out of every accepted lens by placement or masked by its
 * swept volume"; row 0 found its post inside five accepted lenses, so it is masked).
 *
 *   node tools/gates/instruments/m3/sonde-mask.mjs --run <film run dir> [--out <dir>] [--json <file>]
 *
 * THE VOLUME. Everything the moored Sonde, its tether and its post can fill, by its own rules (src/instruments/kinds/
 * sonde/rules.js): the tether never runs past `tetherM` (18 m) from the shackle on the post's top, moored, brought
 * down, sinking or fouled alike, and every point of the hull lies within `hullReach` of the keel ring (computed here
 * from the form's parts, with each part's bounding corners). So the volume is the ball of radius 18 + hullReach + 0.5
 * (the post's foot on the game's terrain against the Node bake) round the shackle, cut by the ground. A cut tether
 * (hour two's "A Line Over the Glass") sets it adrift downwind and out of this ball: no accepted frame is staged after
 * that beat, and F61 (the cut) is its own frame.
 * ITS SHADOW. A pixel is also in the mask when its ray, before it strikes the ground, passes through the ball's shadow
 * column: the points from which a line toward the light (environment.lightDir, read off the frozen frame by
 * ./sonde-probe-page.mjs) meets the ball. That takes the shadow on the ground, on her and on anything standing.
 * THE MASK. Rays at a quarter of the frame's resolution, the island bake as the ground (bilinear, the sea at 0; the
 * skyline masks' march), upsampled and dilated by 4 px. Nothing but the ground occludes: the mask is only ever too large.
 * White = may change.
 *
 * THE PROOF. The run is one `film.mjs --repeat 3 --probe /tools/gates/instruments/m3/sonde-probe-page.mjs` session of
 * the accepted frames with CALIMA_SONDE_PROOF=1 (tools/frames/stagings/m3-instruments.mjs): repeat 2 has the grey
 * Sonde moored at its post (./sonde-stage-page.mjs), repeats 1 and 3 do not. Per frame: the share of pixels changed
 * (largest channel over 10 of 255, the skyline masks' threshold) from repeat 1 to repeat 2 inside and outside the mask,
 * against the same from repeat 1 to repeat 3 (the session's own floor: nothing was added); the Sonde's own vertices
 * projected on the frozen frame, and how many fall inside the mask. Masks and diff images go outside the repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { M3_FORMS, expandParts } from './forms.mjs';
import { ground, mooringPost } from './sonde-mooring.mjs';
import { SONDE_KEEL } from '../../../../src/instruments/kinds/sonde/form.js';
import { SONDE_RULES } from '../../../../src/instruments/kinds/sonde/rules.js';
import { REVIEW, assertOutsideRepo } from '../../../frames/paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const r3 = (v) => Math.round(v * 1000) / 1000;
const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** The farthest any point of the hull lies from its keel ring (m), from every part's bounding corners. */
export function hullReach() {
  let best = 0;
  const K = SONDE_KEEL;
  const at = (x, y, z) => { best = Math.max(best, Math.hypot(x - K[0], y - K[1], z - K[2])); };
  for (const p of expandParts(M3_FORMS.sonde.parts)) {
    if (p.type === 'box') { for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) at(p.c[0] + sx * p.s[0] / 2, p.c[1] + sy * p.s[1] / 2, p.c[2] + sz * p.s[2] / 2); }
    else if (p.type === 'cyl') {
      const a = AX[p.axis || 'y'], r = Math.max(p.r, p.r2 ?? p.r), e = [0, 1, 2].map((k) => (a[k] ? p.h / 2 : r));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) at(p.c[0] + sx * e[0], p.c[1] + sy * e[1], p.c[2] + sz * e[2]);
    } else if (p.type === 'strut') { for (const q of [p.a, p.b]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) at(q[0] + sx * p.r, q[1] + sy * p.r, q[2] + sz * p.r); }
  }
  return best;
}

/** The swept volume: { c: [x, y, z] the shackle (engine frame), R }. */
export function sweptVolume() {
  const P = mooringPost(), reach = hullReach();
  return { c: [P.x, P.shackleY, P.z], R: SONDE_RULES.tetherM + reach + 0.5, reach: r3(reach), tetherM: SONDE_RULES.tetherM, post: P };
}

function rayDirs(probe, W, Hh) {
  const [qx, qy, qz, qw] = probe.quaternion;
  const t = Math.tan((probe.fov * Math.PI / 180) / 2), asp = probe.aspect || W / Hh;
  const rot = (x, y, z) => {
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
  };
  return (px, py) => {
    const nx = ((px + 0.5) / W) * 2 - 1, ny = 1 - ((py + 0.5) / Hh) * 2;
    const d = rot(nx * t * asp, ny * t, -1), l = Math.hypot(d[0], d[1], d[2]);
    return [d[0] / l, d[1] / l, d[2] / l];
  };
}

/** The first ground or sea the ray strikes (m along it), Infinity for the sky. */
function groundHit(o, d, g, tMax = 2400) {
  for (let t = 0.3; t < tMax; t += Math.max(0.25, t * 0.004)) {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t, gg = g(x, z);
    if (y <= (gg > 0 ? gg : 0)) return t;
  }
  return Infinity;
}

/** Does the segment o + t d, t in [0, tEnd], meet the ball (c, R)? */
function segBall(o, d, tEnd, c, R) {
  const w = [o[0] - c[0], o[1] - c[1], o[2] - c[2]], b = w[0] * d[0] + w[1] * d[1] + w[2] * d[2], cc = w[0] * w[0] + w[1] * w[1] + w[2] * w[2] - R * R;
  const disc = b * b - cc;
  if (disc < 0) return false;
  const s = Math.sqrt(disc), t0 = -b - s, t1 = -b + s;
  return t1 >= 0 && t0 <= tEnd;
}

/** Does the segment meet the ball's shadow column (points X whose line toward the light, X + s L, s >= 0, meets the ball)? */
function segShadow(o, d, tEnd, c, R, L) {
  // perpendicular distance to the column's axis (through c along L) <= R: a quadratic in t; and (X - c).L <= R (the
  // ball is not behind X as seen from the light): linear in t
  const w = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
  const wl = w[0] * L[0] + w[1] * L[1] + w[2] * L[2], dl = d[0] * L[0] + d[1] * L[1] + d[2] * L[2];
  const wp = [w[0] - wl * L[0], w[1] - wl * L[1], w[2] - wl * L[2]], dp = [d[0] - dl * L[0], d[1] - dl * L[1], d[2] - dl * L[2]];
  const A = dp[0] * dp[0] + dp[1] * dp[1] + dp[2] * dp[2], B = 2 * (wp[0] * dp[0] + wp[1] * dp[1] + wp[2] * dp[2]), Cq = wp[0] * wp[0] + wp[1] * wp[1] + wp[2] * wp[2] - R * R;
  let lo = 0, hi = tEnd;
  if (A < 1e-12) { if (Cq > 0) return false; } else {
    const disc = B * B - 4 * A * Cq;
    if (disc < 0) return false;
    const s = Math.sqrt(disc);
    lo = Math.max(lo, (-B - s) / (2 * A)); hi = Math.min(hi, (-B + s) / (2 * A));
  }
  // wl + t dl <= R
  if (Math.abs(dl) < 1e-12) { if (wl > R) return false; } else if (dl > 0) hi = Math.min(hi, (R - wl) / dl); else lo = Math.max(lo, (R - wl) / dl);
  return lo <= hi;
}

async function png(file, bits, w, h) {
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) buf[i] = bits[i] ? 255 : 0;
  await sharp(buf, { raw: { width: w, height: h, channels: 1 } }).png().toFile(file);
}
function dilate(bits, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bits[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) out[Y * w + X] = 1; }
  }
  return out;
}

/** One frame's mask at full resolution (Uint8Array, 1 = may change) and what made it. */
export function maskFor(probe, V, vw = 1600, vh = 900, S = 4) {
  const g = ground(), w = vw / S, h = vh / S, dir = rayDirs(probe, w, h), o = probe.position;
  const L0 = probe.lightDir, Ll = L0 ? Math.hypot(...L0) : 0, L = Ll ? L0.map((v) => v / Ll) : null;
  const useShadow = !!L && L[1] > 0;
  const bits = new Uint8Array(w * h);
  let direct = 0, shadow = 0;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const d = dir(px, py), tHit = groundHit(o, d, g);
    if (segBall(o, d, tHit === Infinity ? 1e5 : tHit, V.c, V.R)) { bits[py * w + px] = 1; direct++; continue; }
    if (useShadow && tHit !== Infinity && segShadow(o, d, tHit, V.c, V.R, L)) { bits[py * w + px] = 1; shadow++; }
  }
  const full = new Uint8Array(vw * vh);
  for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) full[y * vw + x] = bits[((y / S) | 0) * w + ((x / S) | 0)];
  const mask = dilate(full, vw, vh, 4);
  let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i];
  return { mask, coveragePct: r3(n / mask.length * 100), rays: { direct, shadow, of: w * h }, shadowUsed: useShadow, light: L && L.map(r3) };
}

async function rawOf(file) { const r = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return r; }
function diffStats(a, b, mask, W, H, TH = 10, outBits = null) {
  let inN = 0, inC = 0, outN = 0, outC = 0;
  for (let k = 0; k < W * H; k++) {
    const o = k * 3, dd = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
    if (mask[k]) { inN++; if (dd > TH) inC++; } else { outN++; if (dd > TH) { outC++; if (outBits) outBits[k] = 1; } }
  }
  return { insidePx: inC, insidePct: inN ? r3(inC / inN * 100) : null, outsidePx: outC, outsidePct: outN ? r3(outC / outN * 100) : null };
}

async function main() {
  const args = process.argv.slice(2), flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const runDir = flag('--run');
  if (!runDir) { console.error('usage: --run <film run dir> [--out <dir>] [--json <file>]'); process.exit(2); }
  const run = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'));
  const out = flag('--out') || path.join(REVIEW, 'masks', `sonde-${path.basename(runDir)}`);
  assertOutsideRepo(out, REPO);
  mkdirSync(out, { recursive: true });
  const V = sweptVolume();
  const vw = run.viewport?.width || 1600, vh = run.viewport?.height || 900;
  const res = { tool: 'tools/gates/instruments/m3/sonde-mask.mjs', run: path.basename(runDir), commit: run.commit, dirty: run.dirty, volume: { centre: V.c.map(r3), R: r3(V.R), tetherM: V.tetherM, hullReachM: V.reach, post: V.post }, threshold: 10, frames: {} };
  const ids = [...new Set(run.frames.filter((f) => f.ok).map((f) => f.id))];
  for (const id of ids) {
    const fr = (k) => run.frames.find((f) => f.id === id && (f.repeat || 1) === k && f.ok);
    const f1 = fr(1), f2 = fr(2), f3 = fr(3);
    if (!f1?.probe || f1.probe.error) { res.frames[id] = { error: 'no probe on repeat 1' }; continue; }
    const M = maskFor(f1.probe, V, vw, vh);
    await png(path.join(out, `${id}-mask.png`), M.mask, vw, vh);
    const rec = { coveragePct: M.coveragePct, rays: M.rays, shadowUsed: M.shadowUsed, light: M.light, lens: { position: f1.probe.position.map(r3), fov: f1.probe.fov } };
    // the lens must be the same in every repeat (else the comparison is not of one frame)
    rec.lensMovedM = [f2, f3].map((f) => (f?.probe?.position ? r3(Math.hypot(...f.probe.position.map((v, k) => v - f1.probe.position[k]))) : null));
    if (f2 && f3) {
      const a = await rawOf(path.join(runDir, f1.file)), b = await rawOf(path.join(runDir, f2.file)), c = await rawOf(path.join(runDir, f3.file));
      const W = a.info.width, H = a.info.height, outBits = new Uint8Array(W * H);
      rec.withSonde = diffStats(a.data, b.data, M.mask, W, H, 10, outBits);
      rec.floor = diffStats(a.data, c.data, M.mask, W, H);
      rec.r3vsR2 = diffStats(c.data, b.data, M.mask, W, H);
      // outside the mask, changed with the Sonde in (1 vs 2) AND (3 vs 2), but not in the floor (1 vs 3): what the Sonde
      // and only the Sonde changed outside its mask
      let only = 0; const onlyBits = new Uint8Array(W * H);
      for (let k = 0; k < W * H; k++) {
        if (M.mask[k] || !outBits[k]) continue;
        const o = k * 3, d13 = Math.max(Math.abs(a.data[o] - c.data[o]), Math.abs(a.data[o + 1] - c.data[o + 1]), Math.abs(a.data[o + 2] - c.data[o + 2]));
        const d32 = Math.max(Math.abs(c.data[o] - b.data[o]), Math.abs(c.data[o + 1] - b.data[o + 1]), Math.abs(c.data[o + 2] - b.data[o + 2]));
        if (d13 <= 10 && d32 > 10) { only++; onlyBits[k] = 1; }
      }
      rec.outsideOnlyWithSondePx = only;
      // a picture: the frame with the Sonde, the mask's edge in white, the changes outside it in magenta
      const pic = Buffer.from(b.data);
      for (let k = 0; k < W * H; k++) {
        const x = k % W, y = (k / W) | 0, edge = M.mask[k] && ((x > 0 && !M.mask[k - 1]) || (x < W - 1 && !M.mask[k + 1]) || (y > 0 && !M.mask[k - W]) || (y < H - 1 && !M.mask[k + W]));
        if (edge) { pic[k * 3] = 255; pic[k * 3 + 1] = 255; pic[k * 3 + 2] = 255; }
        if (onlyBits[k]) { pic[k * 3] = 255; pic[k * 3 + 1] = 45; pic[k * 3 + 2] = 140; }
      }
      await sharp(pic, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(out, `${id}-proof.png`));
    } else rec.missing = { r2: !f2, r3: !f3 };
    const sp = f2?.probe?.sonde;
    if (sp) {
      const pts = sp.projected || [];
      const inside = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < vw && y < vh && M.mask[y * vw + x]).length;
      rec.sonde = { installed: true, wind: sp.wind, keel: sp.keel && [sp.keel.x, sp.keel.y, sp.keel.z].map(r3), tetherM: r3(sp.tetherM), postInGame: sp.post && [sp.post.x, sp.post.y, sp.post.z].map(r3),
        projectedVerticesInFrame: pts.length, insideMask: inside };
    } else rec.sonde = { installed: false };
    rec.pass = !!(rec.withSonde && rec.sonde.installed && rec.sonde.insideMask === rec.sonde.projectedVerticesInFrame && rec.outsideOnlyWithSondePx === 0);
    res.frames[id] = rec;
    console.log(`${id.padEnd(10)} mask ${String(M.coveragePct).padStart(6)} %  ` + (rec.withSonde
      ? `with the Sonde: inside ${rec.withSonde.insidePx} px, outside ${rec.withSonde.outsidePx} px (${rec.withSonde.outsidePct} %); floor outside ${rec.floor.outsidePx} px; outside, changed only with the Sonde ${only(rec)} px; Sonde vertices ${rec.sonde.insideMask}/${rec.sonde.projectedVerticesInFrame} inside  ${rec.pass ? 'PASS' : 'FAIL'}`
      : JSON.stringify(rec.missing || rec.error)));
  }
  const all = Object.values(res.frames);
  res.verdict = { frames: all.length, pass: all.filter((r) => r.pass).length };
  writeFileSync(path.join(out, 'sonde-mask.json'), JSON.stringify(res, null, 1));
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(res, null, 1));
  console.log(`masks and proof pictures: ${out}`);
}
function only(rec) { return rec.outsideOnlyWithSondePx; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
