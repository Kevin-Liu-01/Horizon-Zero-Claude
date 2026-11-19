/**
 * THE HOLDS' LOOK ROWS ON A FILMED FRAME (area A, M2 wave 2; M2 briefs HG2, HG3, HG4). Node, no browser: reads a film
 * run made with `film.mjs --probe /tools/world/holds-probe-page.mjs` (or the camera probe) and casts the frame's own
 * rays over the island bake (recipe.heightAt on the render grid, bilinear) to say which pixels show the Holds' ground.
 *
 *   node tools/world/holds-look.mjs --run <film run dir> [--frame F33] [--json <out>]
 *
 *   HG4  lapilli: the mean L* (CIE, from the frame's sRGB) of the Holds' ground pixels in the frame's lower third
 *        (bar 12-22*), with the share of them that the long shadow of the land puts out of the sun (not separated: the
 *        number is every Holds pixel there), and the Scar's floor pixels apart
 *   HG2  pit-cups: every pit the ground shader digs (holds/pits.js, worked ground with pitK over 0.5) whose centre is in
 *        the frame and in sight of the lens (no ground over the line to it), and whose rim is at least 3 px across:
 *        countable (bar >= 40); green on them (bar >= a third). Terraces: Ninewalls' (area B) are not counted here
 *   HG3  plants: the holds-flora kinds' instances from the probe (vine, fig, prickly pear, tabaiba, cardon, bougainvillea
 *        present: instances > 0), and the dragon tree is the village's (not counted here)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ensureMacro, heightAt, biomesAt } from '../../src/world/island/recipe.js';
import { GRID } from '../../src/world/island/bake.js';
import { holdsCult, holdsScar } from '../../src/world/holds/ground.js';
import { pitsIn } from '../../src/world/holds/pits.js';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const runDir = flag('--run'), FRAME = flag('--frame', 'F33');
if (!runDir) { console.error('usage: --run <film run dir> [--frame F33] [--json <out>]'); process.exit(2); }
const run = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'));
const fr = run.frames.find((x) => x.id === FRAME && x.ok && (x.repeat || 1) === 1);
if (!fr?.probe || fr.probe.error) { console.error(`${FRAME}: no probed frame in ${runDir}`); process.exit(2); }
const pr = fr.probe;

ensureMacro();
const { side, step, half } = GRID, Hg = new Float32Array(side * side);
for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) Hg[iz * side + ix] = heightAt(ix * step - half, iz * step - half);
const ground = (x, z) => {
  const fx = (x + half) / step, fz = (z + half) / step;
  if (fx < 0 || fz < 0 || fx >= side - 1 || fz >= side - 1) return -20;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * side + ix;
  const a = Hg[o] + (Hg[o + 1] - Hg[o]) * tx, b = Hg[o + side] + (Hg[o + side + 1] - Hg[o + side]) * tx;
  return a + (b - a) * tz;
};

/* the lens */
const img = await sharp(path.join(runDir, fr.file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = img.info.width, Hh = img.info.height, px = img.data;
const [qx, qy, qz, qw] = pr.quaternion, o = pr.position;
const tf = Math.tan((pr.fov * Math.PI / 180) / 2), asp = pr.aspect || W / Hh;
const rot = (x, y, z) => {
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
};
const irot = (x, y, z) => {   // the inverse turn (the conjugate)
  const cx = -qx, cy = -qy, cz = -qz;
  const ix = qw * x + cy * z - cz * y, iy = qw * y + cz * x - cx * z, iz = qw * z + cx * y - cy * x, iw = -cx * x - cy * y - cz * z;
  return [ix * qw + iw * -cx + iy * -cz - iz * -cy, iy * qw + iw * -cy + iz * -cx - ix * -cz, iz * qw + iw * -cz + ix * -cy - iy * -cx];
};
function hit(pxX, pxY) {
  const nx = ((pxX + 0.5) / W) * 2 - 1, ny = 1 - ((pxY + 0.5) / Hh) * 2;
  const d = rot(nx * tf * asp, ny * tf, -1), l = Math.hypot(...d);
  let t = 0.3;
  while (t < 2400) {
    const x = o[0] + d[0] / l * t, y = o[1] + d[1] / l * t, z = o[2] + d[2] / l * t, g = ground(x, z);
    if (y <= Math.max(g, 0)) return g > 0 ? { x, z, t } : null;
    t += Math.max(0.2, t * 0.003);
  }
  return null;
}
const Lstar = (r, g, b) => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
};

/* HG4: the lower third, every 2nd pixel */
const w6 = new Float64Array(6);
let nH = 0, sH = 0, nS = 0, sS = 0;
const Ls = [];
for (let y = Math.floor(Hh * 2 / 3); y < Hh; y += 2) for (let x = 0; x < W; x += 2) {
  const h = hit(x, y);
  if (!h) continue;
  biomesAt(h.x, h.z, w6);
  if (w6[1] < 0.6) continue;
  const k = (y * W + x) * 3, L = Lstar(px[k], px[k + 1], px[k + 2]);
  if (holdsScar(h.x, -h.z) > 0.5) { nS++; sS += L; continue; }
  nH++; sH += L; Ls.push(L);
}
Ls.sort((a, b) => a - b);
const hg4 = { pixels: nH, meanL: nH ? r1(sH / nH) : null, medianL: nH ? r1(Ls[nH >> 1]) : null, p10: nH ? r1(Ls[Math.floor(nH * 0.1)]) : null, p90: nH ? r1(Ls[Math.floor(nH * 0.9)]) : null,
  scarFloor: { pixels: nS, meanL: nS ? r1(sS / nS) : null }, pass: nH > 0 && sH / nH >= 12 && sH / nH <= 22 };

/* HG2: the pits in sight */
function project(x, y, z) {
  const v = irot(x - o[0], y - o[1], z - o[2]);
  if (v[2] >= -0.1) return null;
  const sx = (v[0] / -v[2]) / (tf * asp), sy = (v[1] / -v[2]) / tf;
  return { X: (sx + 1) / 2 * W, Y: (1 - sy) / 2 * Hh, depth: -v[2] };
}
function inSight(x, y, z) {
  const L = Math.hypot(x - o[0], y - o[1], z - o[2]), n = Math.ceil(L / 0.6);
  for (let k = 1; k < n - 2; k++) {
    const t = k / n, xx = o[0] + (x - o[0]) * t, yy = o[1] + (y - o[1]) * t, zz = o[2] + (z - o[2]) * t;
    if (ground(xx, zz) > yy + 0.05) return false;
  }
  return true;
}
let counted = 0, green = 0, inFrame = 0;
const slopeAt = (x, z) => Math.hypot(ground(x + 1.5, z) - ground(x - 1.5, z), ground(x, z + 1.5) - ground(x, z - 1.5)) / 3;
for (const p of pitsIn(-220, 340, 20, 440)) {
  biomesAt(p.x, p.z, w6);
  const pitK = holdsCult(p.x, -p.z, w6[1]) * (1 - ss(0.42, 0.6, slopeAt(p.x, p.z)));
  if (pitK < 0.5) continue;
  const y = ground(p.x, p.z), s = project(p.x, y, p.z);
  if (!s || s.X < 0 || s.X >= W || s.Y < 0 || s.Y >= Hh) continue;
  inFrame++;
  const rimPx = (2 * p.r) / s.depth / (2 * tf) * Hh;     // its rim's width across, in px (its depth along the view)
  if (rimPx < 3 || !inSight(p.x, y + 0.2, p.z)) continue;
  counted++; if (p.green) green++;
}
const hg2 = { inFrame, countable: counted, green, greenShare: counted ? r3(green / counted) : null, pass: counted >= 40 && green >= counted / 3 };

/* HG3 from the probe */
const fl = pr.holdsFlora || null;
const kinds = ['vine', 'fig', 'tunera', 'tabaiba', 'cardon', 'bougain'];
const hg3 = { flora: fl, present: fl ? kinds.filter((k) => fl[k]?.instances > 0) : null, buildMs: pr.floraBuildMs ?? null };

const rec = { tool: 'tools/world/holds-look.mjs', run: path.basename(runDir), commit: run.commit, dirty: run.dirty, frame: FRAME, hg4, hg2, hg3 };
console.log(`${FRAME} at ${run.commit}${run.dirty?.length ? ' (DIRTY)' : ''}`);
console.log(`  HG4 lapilli in the lower third: ${nH} Holds pixels (sampled every 2nd), mean L* ${hg4.meanL} (median ${hg4.medianL}, p10 ${hg4.p10}, p90 ${hg4.p90}); bar 12-22*: ${hg4.pass ? 'PASS' : 'FAIL'}; the Scar's floor ${nS} px, L* ${hg4.scarFloor.meanL}`);
console.log(`  HG2 pit-cups: ${inFrame} dug pits in the frame, ${counted} countable (rim >= 3 px, in sight), ${green} green (${hg2.greenShare}); bar >= 40 and a third green: ${hg2.pass ? 'PASS' : 'FAIL'}`);
console.log(`  HG3 plants: ${fl ? kinds.map((k) => `${k} ${fl[k]?.instances ?? 0}`).join(', ') : 'no probe of the flora'}${hg3.buildMs != null ? `; built in ${hg3.buildMs} ms` : ''}`);
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(rec, null, 1));
