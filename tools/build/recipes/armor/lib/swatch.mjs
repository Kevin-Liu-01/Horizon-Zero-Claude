/**
 * CALIMA — M1.2d "five palette swatches within ΔE2000 10 of the sheet's", on FIXED sample boxes: each swatch is the median
 * colour of fixed boxes on the masked turn-front crop (310 x 875) and of fixed boxes on F08 (1600 x 900), compared in
 * CIEDE2000 (sRGB 8-bit, D65).
 *
 *   node tools/build/recipes/armor/lib/swatch.mjs <run dir with F08.png> [--crop <turn-front.png>] [--show <out dir>]
 *
 * The crop is read from the review root ($CALIMA_REVIEW, default ~/.calima-r5/review, crops/turn-front.png); nothing private
 * is in this file. `--show` writes the two images with every box drawn on them (check a box sits on its cloth).
 *
 * M1a round 2 (armory): the round-1 tool took the median of every violet (or brown) pixel in a broad region, which let one
 * bright shade spread over the top, the scarf, the panels and the wraps pass five swatches while the frame read as one colour.
 * Now every box sits on ONE material in each image (the crop is a still image; F08's boxes are inside the piece with a few
 * pixels of room for her idle sway, and a pixel class still drops the odd pixel of a neighbouring piece):
 *   the five    top (two boxes: the chest beside the harness and the panel of the top between the straps under the plate),
 *               sash panel (the long front panel), trousers (the thigh), belt leather (the wide belt), boots (the shaft)
 *   plum        the harness leather against the sheet's plum belt leather (the palette's plum)
 *   ladder      L* of the layers that must stand apart in value: the head wrap, the scarf, the top, the sash panel, the
 *               shin wraps, each in both images (reported, and `ladder.order` says whether F08 keeps the sheet's order)
 */
import path from 'node:path';
import os from 'node:os';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const sharpOf = () => createRequire(path.join(ROOT, 'package.json'))('sharp');

/** Boxes [x0, y0, x1, y1] inclusive. `cls` filters F08's pixels only (the crop's boxes are each on one material). */
export const SWATCH_BOXES = {
  top: { f08: [[752, 300, 768, 330], [806, 348, 822, 372]], crop: [[112, 165, 128, 185], [140, 235, 155, 252]], cls: 'violet' },
  panel: { f08: [[815, 520, 835, 600]], crop: [[200, 380, 215, 420]], cls: 'violet' },
  trousers: { f08: [[880, 600, 905, 680]], crop: [[60, 420, 85, 480]], cls: 'brown' },
  'belt leather': { f08: [[742, 404, 790, 416], [842, 404, 878, 416]], crop: [[160, 291, 180, 299]], cls: 'brown' },
  boots: { f08: [[670, 790, 720, 840]], crop: [[55, 740, 80, 770]], cls: 'brown' },
};
/** The harness leather (F08: the two straps between the scarf and the belt) against the sheet's plum belt leather. */
export const PLUM_BOX = { f08: [[748, 282, 872, 396]], crop: [[160, 291, 180, 299]], cls: 'leather' };
/** The value ladder: the layers the sheet keeps apart. */
export const LADDER_BOXES = {
  wrap: { f08: [[780, 100, 830, 120]], crop: [[115, 15, 150, 30]], cls: 'violet' },
  scarf: { f08: [[780, 215, 840, 240]], crop: [[122, 128, 146, 142]], cls: 'violet' },
  top: SWATCH_BOXES.top,
  panel: SWATCH_BOXES.panel,
  'shin wrap': { f08: [[700, 700, 740, 740]], crop: [[50, 675, 80, 695]], cls: 'violet' },
};
const CLS = {
  any: () => true,
  violet: (r, g, b) => r > g + 8 && b > g + 8,
  brown: (r, g, b) => r > g + 4 && !(b > g + 12) && r < 140,
  // leather: brown or plum (blue may sit over green), never the violet cloth (blue well over red's share) nor bright brass
  leather: (r, g, b) => r > g + 6 && r < 170 && !(b > r - 6) && !(r - b > 70 && g > 90),
};

export function lab([r, g, b]) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function dE2000(c1, c2) {
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

async function readRaw(file) {
  const { data, info } = await sharpOf()(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Median of the pixels of `boxes` (that pass `cls`): [r, g, b] with .n the pixel count. */
function medianOf(img, boxes, cls = 'any') {
  const v = [[], [], []], ok = CLS[cls];
  for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = (y * img.w + x) * 3;
    if (!ok(img.data[k], img.data[k + 1], img.data[k + 2])) continue;
    for (let c = 0; c < 3; c++) v[c].push(img.data[k + c]);
  }
  const out = v.map((a) => { a.sort((p, q) => p - q); return a.length ? a[a.length >> 1] : 0; });
  out.n = v[0].length;
  return out;
}

const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
const row = (F, C, b) => {
  const f = medianOf(F, b.f08, b.cls), c = medianOf(C, b.crop, 'any');
  return { frame: hex(f), sheet: hex(c), px: [f.n, c.n], L: [+lab(f)[0].toFixed(1), +lab(c)[0].toFixed(1)], dE: f.n ? +dE2000(f, c).toFixed(1) : null };
};

export const defaultCrop = () => path.join(process.env.CALIMA_REVIEW || path.join(os.homedir(), '.calima-r5/review'), 'crops/turn-front.png');

/** { rows: { name: { frame, sheet, px, L, dE } }, within10, plum, ladder }. */
export async function swatches(runDir, crop = defaultCrop()) {
  const F = await readRaw(path.join(runDir, 'F08.png')), C = await readRaw(crop);
  const rows = Object.fromEntries(Object.entries(SWATCH_BOXES).map(([k, b]) => [k, row(F, C, b)]));
  const plum = row(F, C, PLUM_BOX);
  const ladder = Object.fromEntries(Object.entries(LADDER_BOXES).map(([k, b]) => [k, row(F, C, b)]));
  const rank = (i) => Object.keys(ladder).sort((a, b) => ladder[a].L[i] - ladder[b].L[i]);
  const worst = Math.max(...Object.values(rows).map((r) => r.dE ?? 99), plum.dE ?? 99);
  return {
    rows, within10: Object.values(rows).filter((r) => r.dE != null && r.dE <= 10).length, worst: +worst.toFixed(1), plum,
    ladder: { ...ladder, order: { frame: rank(0), sheet: rank(1), same: rank(0).join() === rank(1).join() } },
  };
}

/** Write F08 and the crop with every box drawn (one colour per swatch) into `outDir`. */
export async function show(runDir, outDir, crop = defaultCrop()) {
  const sharp = sharpOf();
  mkdirSync(outDir, { recursive: true });
  const all = { ...SWATCH_BOXES, plum: PLUM_BOX, wrap: LADDER_BOXES.wrap, scarf: LADDER_BOXES.scarf, 'shin wrap': LADDER_BOXES['shin wrap'] };
  const cols = [[0, 255, 0], [255, 255, 0], [0, 255, 255], [255, 0, 0], [255, 128, 0], [255, 255, 255], [0, 0, 255], [255, 0, 255], [0, 128, 255]];
  for (const [file, key, name] of [[path.join(runDir, 'F08.png'), 'f08', 'f08-boxes.png'], [crop, 'crop', 'crop-boxes.png']]) {
    const img = await readRaw(file);
    Object.values(all).forEach((b, i) => {
      const c = cols[i % cols.length];
      for (const [x0, y0, x1, y1] of b[key]) {
        const put = (x, y) => { const k = (y * img.w + x) * 3; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; };
        for (let x = x0 - 1; x <= x1 + 1; x++) { put(x, y0 - 1); put(x, y1 + 1); }
        for (let y = y0 - 1; y <= y1 + 1; y++) { put(x0 - 1, y); put(x1 + 1, y); }
      }
    });
    await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 3 } }).png().toFile(path.join(outDir, name));
  }
  return Object.keys(all).map((k, i) => `${k}: rgb(${cols[i % cols.length].join(',')})`);
}

/**
 * M1.2d "leather edge wear, brass tarnish and fold fade each visible at 2.5 m", as contrast in F08 (Brea at about 2.5 m): the
 * linear-luminance ratio p90 / p10 inside a box on the harness strap below the plate (worn pale edges against the strap's body) and
 * on the square brass plate (tarnish against polish), and max / min of the column means across the long front panel (the folds'
 * faded crests against their valleys). A ratio of 1.3 or more is taken as visible (about 0.4 stop).
 */
export const WEAR_BOXES = { strap: [822, 350, 832, 360], plate: [790, 316, 816, 342], panelFolds: [800, 570, 860, 650] };
export async function wear(runDir) {
  const { data, w } = await readRaw(path.join(runDir, 'F08.png'));
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (x, y) => { const k = (y * w + x) * 3; return 0.2126 * lin(data[k]) + 0.7152 * lin(data[k + 1]) + 0.0722 * lin(data[k + 2]); };
  const ratio = ([x0, y0, x1, y1]) => { const v = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) v.push(L(x, y)); v.sort((a, b) => a - b); return +(v[Math.floor(0.9 * (v.length - 1))] / v[Math.floor(0.1 * (v.length - 1))]).toFixed(2); };
  const [x0, y0, x1, y1] = WEAR_BOXES.panelFolds, cols = [];
  for (let x = x0; x <= x1; x++) { let s = 0; for (let y = y0; y <= y1; y++) s += L(x, y); cols.push(s / (y1 - y0 + 1)); }
  const out = { strapEdgeWear: ratio(WEAR_BOXES.strap), brassTarnish: ratio(WEAR_BOXES.plate), panelFoldFade: +(Math.max(...cols) / Math.min(...cols)).toFixed(2) };
  return { ...out, visible: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v >= 1.3])) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), ci = a.indexOf('--crop'), si = a.indexOf('--show');
  const crop = ci >= 0 ? path.resolve(a[ci + 1]) : undefined;
  if (si >= 0) console.error((await show(path.resolve(a[0]), path.resolve(a[si + 1]), crop)).join('\n'));
  console.log(JSON.stringify({ ...(await swatches(path.resolve(a[0]), crop)), wear: await wear(path.resolve(a[0])) }));
}
