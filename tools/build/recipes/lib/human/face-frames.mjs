/**
 * CALIMA — M1.2b's two frame lines as numbers, read off a film run's F11-F13 (fixed lenses, so fixed boxes):
 *   1. "no pure-black shadow pixel on the face in flat light": pixels whose brightest channel is <= 12/255 inside each frame's
 *      face box, outside the features that are dark by design (the eyes with their lash line and brows, the lips' parting).
 *   2. "the profile eye shows iris and cornea": in F13's eye box, IRIS pixels (dark brown: brightest channel 21-58, red >= blue;
 *      the lash line is darker) and CORNEA GLINT pixels (every channel within 10 % of the box's brightest pixel and >= 95) are
 *      counted; the line holds with >= 15 iris pixels and >= 1 glint pixel.
 *
 *   node tools/build/recipes/lib/human/face-frames.mjs <run dir>
 *
 * Boxes are [x0, y0, x1, y1] inclusive in the 1600 x 900 frame.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
// (face boxes: the skin from the wrap's hem to the chin, short of the scarf, the hair and the wrap tail beside the jaw; feature boxes:
// the brows and the eyes with their lash lines; set from the 1e345eb film)
export const FACE = {
  F11: { box: [655, 200, 918, 455], dark: [[662, 222, 758, 298], [798, 222, 895, 298]] },
  F12: { box: [580, 235, 905, 455], dark: [[576, 262, 640, 315], [640, 238, 765, 290]] },
  F13: { box: [570, 240, 760, 455], dark: [[575, 265, 625, 305]] },
};
export const EYE13 = [588, 274, 622, 296];

export async function faceFrames(run) {
  const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
  const out = {};
  for (const [f, { box, dark }] of Object.entries(FACE)) {
    const { data, info } = await sharp(path.join(run, `${f}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let black = 0, excused = 0;
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
      const k = (y * info.width + x) * 3, m = Math.max(data[k], data[k + 1], data[k + 2]);
      if (m > 12) continue;
      if (dark.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) excused++; else black++;
    }
    out[f] = { blackOnSkin: black, blackInFeatures: excused };
    if (f === 'F13') {
      let iris = 0, glint = 0, lash = 0, hi = 0;
      const [a, b, c, d] = EYE13;
      for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) { const k = (y * info.width + x) * 3; hi = Math.max(hi, Math.min(data[k], data[k + 1], data[k + 2])); }
      for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) {
        const k = (y * info.width + x) * 3, r = data[k], bl = data[k + 2], m = Math.max(r, data[k + 1], bl), n = Math.min(r, data[k + 1], bl);
        if (m <= 20) lash++;
        else if (m <= 58 && r >= bl) iris++;
        if (n >= 95 && n >= hi * 0.9) glint++;
      }
      out.F13.profileEye = { iris, glint, lash, brightestMin: hi, ok: iris >= 15 && glint >= 1 };
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await faceFrames(path.resolve(process.argv[2]))));
}
