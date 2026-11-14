#!/usr/bin/env node
/**
 * GRADE SIMULATOR (lane sky-look, M1.1g). Re-grades the UNGRADED frames a probed film run carries
 * (tools/look/sky-probe-page.mjs: AgX + the CALIMA look, grade mix 0, 800 x 450) through a grade file, offline,
 * exactly as the grade pass does (the two LUT slots from src/core/look.js bakeLut / sampleLut, trilinear on the
 * half-float texels, then the vignette), and prints the M1.1g palette lines and the M1.1f shadow hue of the result.
 *
 *   node tools/look/grade-sim.mjs <runDir> [--grade <file.json>] [--out <dir>]
 *        --grade   a grade file to try (default src/core/look.grade.json); its sets replace the shipped ones
 *        --out     writes <id>-sim.png per frame (outside the repo)
 *        --identity  no grade at all (AgX + the look only), for the "before the grade" column
 * The slots and mix are the ones the probe recorded for the frame. Shafts (added after the grade in the game)
 * are graded here too: a small error near the sun only.
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureImage } from './m11-accept.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = await import(path.join(REPO, 'src/core/look.js'));
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const runDir = args[0];
if (!runDir) { console.error('usage: grade-sim.mjs <runDir> [--grade file] [--out dir]'); process.exit(2); }
const grade = JSON.parse(readFileSync(flag('--grade') || path.join(REPO, 'src/core/look.grade.json'), 'utf8'));
const OUT = flag('--out');
const IDENT = args.includes('--identity');   // no grade, no vignette: what AgX + the CALIMA look alone show
if (OUT) mkdirSync(OUT, { recursive: true });
const luts = {};
const lutOf = (name) => (luts[name] ||= L.bakeLut(grade.sets[name], grade.lutSize || 32));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const run = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'));
for (const fr of run.frames.filter((f) => f.ok && f.probe?.ungraded?.png)) {
  const U = fr.probe.ungraded, G = fr.probe.grade;
  const { data, info } = await sharp(Buffer.from(U.png, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels, out = Buffer.alloc(W * H * 3);
  const A = grade.sets[G.setA] ? G.setA : grade.default, B = grade.sets[G.setB] ? G.setB : A, mix = A !== B ? G.mix : 0;
  const la = lutOf(A), lb = lutOf(B), size = grade.lutSize || 32;
  const c = [0, 0, 0], ga = [0, 0, 0], gb = [0, 0, 0];
  const vig = grade.vignette ?? U.vignette ?? 0.28, asp = U.aspect || 16 / 9, rn = 0.5 * Math.sqrt(asp * asp + 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * ch;
    c[0] = data[i] / 255; c[1] = data[i + 1] / 255; c[2] = data[i + 2] / 255;
    if (IDENT) { ga[0] = c[0]; ga[1] = c[1]; ga[2] = c[2]; } else {
      L.sampleLut(la, size, c, ga);
      if (mix > 0) { L.sampleLut(lb, size, c, gb); for (let k = 0; k < 3; k++) ga[k] += (gb[k] - ga[k]) * mix; }
    }
    const rv = Math.hypot(((x + 0.5) / W - 0.5) * asp, (y + 0.5) / H - 0.5) / rn;
    const v = IDENT ? 1 : 1 - vig * smooth(0.34, 0.92, rv);
    const o = (y * W + x) * 3;
    for (let k = 0; k < 3; k++) out[o + k] = Math.max(0, Math.min(255, Math.round(ga[k] * v * 255)));
  }
  const img = { data: out, w: W, h: H, ch: 3 };
  // the sun's sky ring: share of sky pixels with a channel >= 254 at 0-4 and 4-8 degrees (above the sun's row)
  let ring = '';
  const S = fr.probe.sun;
  if (S?.inFrame) {
    const sc = W / 1600, ppd = S.pxPerDeg.r4 * sc, cx = S.px[0] * sc, cy = S.px[1] * sc, n = [0, 0], c = [0, 0];
    for (let y = 0; y < Math.min(H, cy); y++) for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - cx, y - cy) / ppd, k = r < 4 ? 0 : r < 8 ? 1 : -1; if (k < 0) continue;
      const o = (y * W + x) * 3; n[k]++; if (Math.max(out[o], out[o + 1], out[o + 2]) >= 254) c[k]++;
    }
    ring = `sun clip 0-4 ${(100 * c[0] / Math.max(1, n[0])).toFixed(0)} % 4-8 ${(100 * c[1] / Math.max(1, n[1])).toFixed(1)} %`;
  }
  const m = await measureImage(img, fr);
  const pal = m.palette ? `palette ${m.palette.meanDE} [${m.palette.regions.map((q) => `${q.name} ${q.dE}`).join(', ')}]` : '';
  const sh = m.shadow ? `shadow hue ${m.shadow.hue} (L ${m.shadow.L} a ${m.shadow.a} b ${m.shadow.b})` : '';
  const ct = m.contrast ? `contrast ${m.contrast.ratio}` : '';
  console.log(`${fr.id} ${A}${mix ? `/${B} ${mix}` : ''}: ${pal}  ${sh}  ${ct}  ${ring}`);
  if (args.includes('--verbose') && m.palette) for (const q of m.palette.regions) console.log(`    ${q.name.padEnd(10)} dE ${q.dE}  sim ${q.frame.join(' ')}  ref ${q.ref.join(' ')}`);
  if (OUT) await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(OUT, `${fr.id}-sim.png`));
}
