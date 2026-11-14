/**
 * M1.6g1 HUD COVER — how much of a filmed HUD frame the HUD covers (lane ui). Node only, no browser.
 *
 *   node tools/look/hud-cover.mjs <run dir> [--frame F03] [--th 10]
 *
 * Needs a run filmed with `film.mjs --hud-twin --probe /tools/look/hud-probe-page.mjs`: <id>.png (HUD on),
 * <id>-nohud.png (the same frozen frame, page chrome off) and run.json's probe.boxCover.rects.
 *
 * COVER = every glass panel's box, whole (a 0.70 dark glass over dark sand changes few pixels by more than
 * the threshold, but it still hides the world under it) UNION every pixel the HUD changes by more than
 * --th levels (8-bit, max over RGB) INSIDE some painted HUD element's box (ticks, numerals, key caps, ink
 * underlays). A pixel outside every HUD box cannot be the HUD; that is how the frozen world's own noise
 * (cloud drift, dither) is kept out. Also printed: the raw twin difference and the box-union bound.
 * Bar (BUILD M1.6g1): under 6 %.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dir = args.find((a) => !a.startsWith('--') && !/^F\d/.test(a) && !/^\d+$/.test(a));
if (!dir) { console.error('usage: node tools/look/hud-cover.mjs <run dir> [--frame F03] [--th 10]'); process.exit(2); }
const id = flag('--frame', 'F03');
const TH = Number(flag('--th', 10));

const run = JSON.parse(readFileSync(path.join(dir, 'run.json'), 'utf8'));
const fr = run.frames.find((f) => f.id === id);
if (!fr?.probe?.boxCover?.rects) { console.error(`${id}: no probe.boxCover.rects in run.json`); process.exit(1); }
const on = await sharp(path.join(dir, `${id}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const off = await sharp(path.join(dir, `${id}-nohud.png`)).removeAlpha().raw().toBuffer();
const { width: W, height: H } = on.info;
const [vw, vh] = fr.probe.boxCover.viewport || [W, H];
const sx = W / vw, sy = H / vh;

const glass = new Uint8Array(W * H), box = new Uint8Array(W * H);
for (const [l, t, r, b, g] of fr.probe.boxCover.rects) {
  const x0 = Math.max(0, Math.floor(l * sx)), x1 = Math.min(W, Math.ceil(r * sx));
  const y0 = Math.max(0, Math.floor(t * sy)), y1 = Math.min(H, Math.ceil(b * sy));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { box[y * W + x] = 1; if (g) glass[y * W + x] = 1; }
}
let cover = 0, rawDiff = 0, boxN = 0, glassN = 0, strokeN = 0;
const d = on.data;
for (let i = 0, p = 0; p < W * H; p++, i += 3) {
  const ch = Math.max(Math.abs(d[i] - off[i]), Math.abs(d[i + 1] - off[i + 1]), Math.abs(d[i + 2] - off[i + 2])) > TH;
  if (ch) rawDiff++;
  if (box[p]) boxN++;
  if (glass[p]) { glassN++; cover++; } else if (ch && box[p]) { strokeN++; cover++; }
}
const pct = (v) => Math.round(v / (W * H) * 10000) / 100;
const out = {
  frame: id, run: path.basename(dir), threshold: TH,
  coverPct: pct(cover), glassPct: pct(glassN), strokesOutsideGlassPct: pct(strokeN),
  rawTwinDiffPct: pct(rawDiff), twinNoisePct: fr.measured?.hudCover?.noisePct ?? null, boxUnionPct: pct(boxN),
  bar: 6, pass: pct(cover) < 6,
};
console.log(JSON.stringify(out, null, 1));
