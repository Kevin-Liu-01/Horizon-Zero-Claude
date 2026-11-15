/**
 * CALIMA — M1.2d "five palette swatches within ΔE2000 10 of the sheet's": fixed sample boxes on F08 and on the masked
 * turn-front crop, compared by the median colour of each box (sRGB 8-bit, CIEDE2000).
 *
 *   node tools/build/recipes/armor/lib/swatch.mjs <run dir with F08.png> [--crop <turn-front.png>]
 *
 * The crop is read from the review root ($CALIMA_REVIEW, default ~/.calima-r5/review, crops/turn-front.png); nothing private is
 * in this file. The boxes are [x0, y0, x1, y1] inclusive, in F08's 1600 x 900 frame and in the crop's 310 x 875: the top's violet
 * over her left ribs between the harness straps, the long front panel, the trousers' left thigh, the girdle's leather, the right boot's
 * shaft. They are fixed, so a re-run measures the same cloth.
 */
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
export const SWATCH_BOXES = {
  top: { f08: [812, 338, 838, 360], crop: [143, 226, 160, 240] },
  panel: { f08: [800, 560, 840, 620], crop: [172, 385, 192, 425] },
  trousers: { f08: [880, 600, 898, 660], crop: [75, 425, 100, 470] },
  'belt leather': { f08: [800, 394, 822, 406], crop: [155, 291, 175, 299] },
  boots: { f08: [665, 800, 700, 840], crop: [50, 780, 75, 810] },
};

export function dE2000(c1, c2) {
  const lab = ([r, g, b]) => {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { const v = Math.atan2(b, a) * 180 / Math.PI; return v < 0 ? v + 360 : v; };
  const h1 = h(b1, a1p), h2 = h(b2, a2p), dL = L2 - L1, dC = C2p - C1p;
  let dh = h2 - h1; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * Math.PI / 360), Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1 + h2; if (C1p * C2p !== 0) { if (Math.abs(h1 - h2) > 180) hm += h1 + h2 < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hm * Math.PI / 180) + 0.32 * Math.cos((3 * hm + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hm - 63) * Math.PI / 180);
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T;
  const RT = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * Math.PI / 180);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

async function medians(file, key) {
  const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = {};
  for (const [name, b] of Object.entries(SWATCH_BOXES)) {
    const [x0, y0, x1, y1] = b[key], v = [[], [], []];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = (y * info.width + x) * 3; for (let c = 0; c < 3; c++) v[c].push(data[k + c]); }
    out[name] = v.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
  }
  return out;
}

/** { name: { frame, sheet, dE } } and the count within 10. */
export async function swatches(runDir, crop = path.join(process.env.CALIMA_REVIEW || path.join(os.homedir(), '.calima-r5/review'), 'crops/turn-front.png')) {
  const F = await medians(path.join(runDir, 'F08.png'), 'f08'), C = await medians(crop, 'crop');
  const rows = Object.fromEntries(Object.keys(SWATCH_BOXES).map((k) => [k, { frame: F[k], sheet: C[k], dE: +dE2000(F[k], C[k]).toFixed(1) }]));
  return { rows, within10: Object.values(rows).filter((r) => r.dE <= 10).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), ci = a.indexOf('--crop');
  console.log(JSON.stringify(await swatches(path.resolve(a[0]), ci >= 0 ? path.resolve(a[ci + 1]) : undefined)));
}
