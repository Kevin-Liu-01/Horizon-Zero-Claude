/**
 * CALIMA — M1.2d "five palette swatches within ΔE2000 10 of the sheet's": fixed sample boxes on F08 and on the masked
 * turn-front crop, compared by the median colour of each box (sRGB 8-bit, CIEDE2000).
 *
 *   node tools/build/recipes/armor/lib/swatch.mjs <run dir with F08.png> [--crop <turn-front.png>]
 *
 * The crop is read from the review root ($CALIMA_REVIEW, default ~/.calima-r5/review, crops/turn-front.png); nothing private is
 * in this file. Regions are [x0, y0, x1, y1] inclusive, in F08's 1600 x 900 frame and in the crop's 310 x 875: the top (its violet),
 * the sash panels (violet), the trousers (brown between the panels), the harness leather over the top (brown), the boots (brown).
 */
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
// each swatch: a broad region in each image and the class of pixel it takes there (the median of those pixels): VIOLET (red and blue
// both 12 over green) or BROWN (red over green over blue, not violet). Brea's idle sway moves her a few pixels between films, so a
// tight box on one strap or one fold is not a fixed sample; a region and a class are
export const SWATCH_BOXES = {
  top: { f08: [760, 280, 880, 380], crop: [100, 170, 200, 280], cls: 'violet' },
  panel: { f08: [760, 500, 900, 700], crop: [140, 330, 260, 560], cls: 'violet' },
  trousers: { f08: [700, 560, 950, 700], crop: [50, 380, 200, 560], cls: 'brown' },
  'belt leather': { f08: [740, 280, 880, 380], crop: [100, 150, 210, 290], cls: 'brown' },
  boots: { f08: [620, 770, 960, 890], crop: [30, 730, 260, 860], cls: 'brown' },
};
const CLS = {
  violet: (r, g, b) => r > g + 12 && b > g + 12,
  brown: (r, g, b) => r > g + 6 && g >= b - 4 && !(b > g + 12) && r < 125,
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
    const [x0, y0, x1, y1] = b[key], v = [[], [], []], ok = CLS[b.cls];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = (y * info.width + x) * 3; if (!ok(data[k], data[k + 1], data[k + 2])) continue; for (let c = 0; c < 3; c++) v[c].push(data[k + c]); }
    out[name] = v.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
    out[name].n = v[0].length;
  }
  return out;
}

/** { name: { frame, sheet, dE } } and the count within 10. */
export async function swatches(runDir, crop = path.join(process.env.CALIMA_REVIEW || path.join(os.homedir(), '.calima-r5/review'), 'crops/turn-front.png')) {
  const F = await medians(path.join(runDir, 'F08.png'), 'f08'), C = await medians(crop, 'crop');
  const rows = Object.fromEntries(Object.keys(SWATCH_BOXES).map((k) => [k, { frame: [...F[k]], sheet: [...C[k]], px: [F[k].n, C[k].n], dE: +dE2000(F[k], C[k]).toFixed(1) }]));
  return { rows, within10: Object.values(rows).filter((r) => r.dE <= 10).length };
}

/**
 * M1.2d "leather edge wear, brass tarnish and fold fade each visible at 2.5 m", as contrast in F08 (Brea at about 2.5 m): the
 * linear-luminance ratio p90 / p10 inside a box on the harness strap below the plate (worn pale edges against the strap's body) and
 * on the square brass plate (tarnish against polish), and max / min of the column means across the long front panel (the folds'
 * faded crests against their valleys). A ratio of 1.3 or more is taken as visible (about 0.4 stop).
 */
export const WEAR_BOXES = { strap: [822, 350, 832, 360], plate: [790, 316, 816, 342], panelFolds: [800, 570, 860, 650] };
export async function wear(runDir) {
  const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
  const { data, info } = await sharp(path.join(runDir, 'F08.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (x, y) => { const k = (y * info.width + x) * 3; return 0.2126 * lin(data[k]) + 0.7152 * lin(data[k + 1]) + 0.0722 * lin(data[k + 2]); };
  const ratio = ([x0, y0, x1, y1]) => { const v = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) v.push(L(x, y)); v.sort((a, b) => a - b); return +(v[Math.floor(0.9 * (v.length - 1))] / v[Math.floor(0.1 * (v.length - 1))]).toFixed(2); };
  const [x0, y0, x1, y1] = WEAR_BOXES.panelFolds, cols = [];
  for (let x = x0; x <= x1; x++) { let s = 0; for (let y = y0; y <= y1; y++) s += L(x, y); cols.push(s / (y1 - y0 + 1)); }
  const out = { strapEdgeWear: ratio(WEAR_BOXES.strap), brassTarnish: ratio(WEAR_BOXES.plate), panelFoldFade: +(Math.max(...cols) / Math.min(...cols)).toFixed(2) };
  return { ...out, visible: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v >= 1.3])) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), ci = a.indexOf('--crop');
  console.log(JSON.stringify({ ...(await swatches(path.resolve(a[0]), ci >= 0 ? path.resolve(a[ci + 1]) : undefined)), wear: await wear(path.resolve(a[0])) }));
}
