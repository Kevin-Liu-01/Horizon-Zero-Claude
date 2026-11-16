/**
 * Crop dE2000 between two frames of the same pose (M1.6m round 2, the context rows): per crop, the mean and p90 of the
 * per-pixel CIEDE2000 (on a 1/4 downsample, so a pixel of animation is averaged in), the dE2000 of the crops' mean
 * colours, and each crop's mean RGB. Crops are fractions of the frame, so they hold at any screenshot size.
 */
import sharp from 'sharp';
import { rgbToLab, deltaE2000 } from '../../src/instruments/lib/color.js';

/**
 * The context rows' crops (fractions of width and height). They keep off Brea (the centre column, whose idle and cloth
 * move between any two shots), the HUD (top strip, top-left column, bottom bar, the weapon tag) and the banner and
 * subtitle lines a reload shows: the ground on both sides of her, the dyke line and the land behind the Ring.
 */
export const CTX_CROPS = Object.freeze({
  groundLeft: [0.0, 0.70, 0.33, 0.88],
  groundRight: [0.64, 0.73, 1.0, 0.88],
  // round 2, after the run at e885a00: the old far crop [0.30, 0.62, 0.62, 0.69] took in her head and bow (the idle) and,
  // at a wall, the near-clipped wall the camera stood in; the distance right of her holds no part of her
  far: [0.66, 0.50, 0.98, 0.62],
});

const r255 = (v) => v / 255;

export async function cropDE(fileA, fileB, crops = CTX_CROPS) {
  const load = async (f) => {
    const m = await sharp(f).metadata();
    return { m, img: sharp(f).removeAlpha() };
  };
  const A = await load(fileA), B = await load(fileB);
  const out = {};
  for (const [name, [x0, y0, x1, y1]] of Object.entries(crops)) {
    const px = async (S) => {
      const W = S.m.width, H = S.m.height;
      const left = Math.round(x0 * W), top = Math.round(y0 * H), width = Math.max(4, Math.round((x1 - x0) * W)), height = Math.max(4, Math.round((y1 - y0) * H));
      return sharp(await S.img.clone().extract({ left, top, width, height }).toBuffer())
        .resize(Math.max(1, width >> 2), Math.max(1, height >> 2), { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    };
    const a = await px(A), b = await px(B);
    const n = Math.min(a.data.length, b.data.length) / 3;
    const des = new Float64Array(n);
    const sa = [0, 0, 0], sb = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const ra = [r255(a.data[3 * i]), r255(a.data[3 * i + 1]), r255(a.data[3 * i + 2])];
      const rb = [r255(b.data[3 * i]), r255(b.data[3 * i + 1]), r255(b.data[3 * i + 2])];
      for (let c = 0; c < 3; c++) { sa[c] += ra[c]; sb[c] += rb[c]; }
      des[i] = deltaE2000(rgbToLab(ra), rgbToLab(rb));
    }
    const sorted = Array.from(des).sort((p, q) => p - q);
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    const ma = sa.map((v) => v / n), mb = sb.map((v) => v / n);
    out[name] = { meanDE: +mean.toFixed(2), p90DE: +sorted[Math.floor(n * 0.9)].toFixed(2), dEOfMeans: +deltaE2000(rgbToLab(ma), rgbToLab(mb)).toFixed(2),
      rgbA: ma.map((v) => Math.round(v * 255)), rgbB: mb.map((v) => Math.round(v * 255)) };
  }
  return out;
}

/** The worst crop's mean dE (the row's number). */
export const worstDE = (r) => Math.max(...Object.values(r).map((c) => c.meanDE));
