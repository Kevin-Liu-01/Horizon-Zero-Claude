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
 * M1a round 3 (the review's "regression" at dee526d, 0 / 12 / 1 px in F11 / F12 / F13, 0 / 0 / 0 at 970a991 and c5ab6b2): those
 * 13 pixels were the far brow's top edge (F12, x 745-759, y 235-237, rgb 10-12 / 2-4 / 1-2) and the profile eye's outer lash corner
 * (F13, 621, 267), each 1-3 px past its fixed feature box. No commit moved them: the filmer aims a head lens at the head BONE every
 * frame and freezes after a wall-clock settle (tools/frames/page.mjs), so the idle clip's head turn at the freeze moment varies from
 * run to run and turns the face about the bone (F12's brows sit 15 px left and 5 px up at dee526d against c5ab6b2; 471b07d and
 * 970a991 differ as much). A dark feature now keeps its excuse a little past its box: a <= 12 pixel within DRIFT px of a feature
 * box is excused only if its 8-connected component of pixels <= 40 reaches into the box itself (the same brow, the same lash line).
 * A dark pixel that is not part of a feature (a shadow on the cheek, the jaw, a scarf fin under the chin) is counted as before,
 * wherever it is. The drifted excuses are reported apart (`blackInFeaturesDrift`).
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
  // (M1a fix round 1: c15dd43's narrower face and forward brow put F12's far brow and lash line at x 766-839, y 238-271, past the
  // second feature box's right edge (765): 423 'black on skin' pixels that were all brow and lash. A third feature box covers the far
  // eye and brow; the skin box is unchanged)
  F12: { box: [580, 235, 905, 455], dark: [[576, 262, 640, 315], [640, 238, 765, 290], [765, 215, 850, 285]] },
  // (Frame Set v2's F13 is a true profile, the head's look-at held neutral: the boxes re-set from the f039319 film: the face from under the hairline to the chin, short of the scarf behind the jaw)
  F13: { box: [558, 240, 700, 492], dark: [[560, 255, 620, 305]] },
};
export const EYE13 = [583, 276, 618, 304];

/** How far past its box a dark feature keeps its excuse (px), and the darkness that joins a feature's pixels into one region. */
export const DRIFT = 24, JOIN = 40;

export async function faceFrames(run) {
  const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
  const out = {};
  for (const [f, { box, dark }] of Object.entries(FACE)) {
    const { data, info } = await sharp(path.join(run, `${f}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const mx = (x, y) => { const k = (y * W + x) * 3; return Math.max(data[k], data[k + 1], data[k + 2]); };
    const inBox = (x, y, g = 0) => dark.some(([a, b, c, d]) => x >= a - g && x <= c + g && y >= b - g && y <= d + g);
    // the dark regions (<= JOIN) that reach into a feature box, flooded out to DRIFT px past it
    const feat = new Uint8Array(W * H), seen = new Uint8Array(W * H), stack = [];
    for (const [a, b, c, d] of dark) for (let y = Math.max(0, b); y <= Math.min(H - 1, d); y++) for (let x = Math.max(0, a); x <= Math.min(W - 1, c); x++) {
      const i = y * W + x;
      if (seen[i] || mx(x, y) > JOIN) continue;
      seen[i] = 1; stack.push(i);
      while (stack.length) {
        const j = stack.pop(), jx = j % W, jy = (j - jx) / W;
        feat[j] = 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = jx + dx, ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          if (seen[k] || mx(nx, ny) > JOIN || !inBox(nx, ny, DRIFT)) continue;
          seen[k] = 1; stack.push(k);
        }
      }
    }
    let black = 0, excused = 0, drift = 0;
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
      if (mx(x, y) > 12) continue;
      if (inBox(x, y)) excused++;
      else if (feat[y * W + x]) drift++;
      else black++;
    }
    out[f] = { blackOnSkin: black, blackInFeatures: excused, blackInFeaturesDrift: drift };
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
