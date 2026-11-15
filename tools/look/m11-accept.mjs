#!/usr/bin/env node
/**
 * M1.1f / M1.1g ACCEPTANCE NUMBERS (lane sky-look). Reads one film run (tools/frames/film.mjs, filmed with
 * --probe /tools/look/sky-probe-page.mjs) and the masked reference crops, and prints every measured line:
 *
 *   node tools/look/m11-accept.mjs <runDir> [--json]
 *
 * DEFINITIONS (fixed before any tuning; changing one is a new row, not a re-grade):
 *   palette     per frame, five named regions; each region's colour is the mean of its pixels in LINEAR sRGB,
 *               then CIELAB D65; ΔE2000 between the frame region and the same-named crop region; the line is
 *               the mean of the five. Bar: <= 12 (M1.1g). Region boxes are fractions [x0, y0, x1, y1] of each
 *               image, chosen for what the region shows (sun-side sky, sky away from the sun, haze or sea, the
 *               lit foreground, shade), not for the number.
 *   shadow hue  ground pixels (probe depth >= 5 m: Brea and her kit excluded; sky excluded), the darkest 20 % by
 *               L*; hue = atan2(mean b*, mean a*) in CIELAB. Bar: 280-330 deg (M1.1f).
 *   contrast    RMS contrast std(Y) / mean(Y) of linear luminance Y over the pixels whose probe depth is in
 *               [120, 180] m (the midground at 150 m) and in [5, 30] m (the foreground). Bar: mid / fore >= 0.60.
 *   sun         the disc's angular diameter from the sky shader (bar < 2 deg); the clipped blob: the pixels with
 *               a channel >= 254 connected to the sun's centre pixel (8-neighbour flood fill), its largest
 *               angular distance from the centre (bar: nothing clipped beyond 4 deg). Only when the sun is in frame.
 *   glitter     with the sun in frame and above the horizon: mean L* of the sea rows (from 0.4 to 6 deg below the
 *               horizon) inside +-1.5 deg of the sun's column, minus the mean L* of the same rows 6-12 deg either
 *               side. Bar: >= 10 L* (a path, not a sheet).
 *   bloom       from the probe: the 8-bit luminance the bloom adds, ring by ring around the sun and frame-wide.
 */
import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CROPS } from '../frames/paths.mjs';

/* ------------------------------------------------------------ colour */
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LIN = new Float64Array(256); for (let i = 0; i < 256; i++) LIN[i] = lin(i);
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
export function linToLab(r, g, b) {
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b, y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b, z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  const fx = fLab(x / 0.95047), fy = fLab(y), fz = fLab(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** CIEDE2000 (Sharma, Wu, Dalal 2005). */
export function dE2000(L1, a1, b1, L2, a2, b2) {
  const R = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => { if (b === 0 && a === 0) return 0; const h = Math.atan2(b, a) / R; return h < 0 ? h + 360 : h; };
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0; if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh * R / 2);
  const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  let hm = hp1 + hp2; if (Cp1 * Cp2 !== 0) { if (Math.abs(hp1 - hp2) > 180) hm = hm < 360 ? hm + 360 : hm - 360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * R) + 0.24 * Math.cos(2 * hm * R) + 0.32 * Math.cos((3 * hm + 6) * R) - 0.20 * Math.cos((4 * hm - 63) * R);
  const dTh = 30 * Math.exp(-(((hm - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTh * R) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
const hueOf = (a, b) => { let h = Math.atan2(b, a) * 180 / Math.PI; if (h < 0) h += 360; return h; };

/* ------------------------------------------------------------ regions (fixed; see the header) */
/** The M1.1h re-registration (Nov 15): frame boxes of F02 and F05 move down by REG_DY, clamped; `--reg 0` reads the old. */
const REG_DY = (() => { const i = process.argv.indexOf('--reg'); return i >= 0 ? +process.argv[i + 1] : 0.15; })();
const reg = (rs) => Object.fromEntries(Object.entries(rs).map(([k, v]) => [k, { ...v, frame: [v.frame[0], Math.min(0.99, v.frame[1] + REG_DY), v.frame[2], Math.min(1, v.frame[3] + REG_DY)], frame0: v.frame }]));
export const REGIONS = {
  // RE-REGISTERED Nov 15 (fix round 1, before any tuning): M1.1h (73f60c7) pitched the chase lens 9 deg up out of the
  // aim, which moved every F02 and F05 frame row down by 0.15 of the frame (the horizon: F02 row 425 -> 560, F05 row
  // 435 -> 570 of 900, same camera otherwise). Every frame box moves down by REG_DY (clamped to the frame) so it
  // covers what it covered when the boxes were fixed; the crop boxes are unchanged
  F02: { crop: 'over-pans-golden', regions: reg({
    sunSky: { ref: [0.62, 0.03, 0.74, 0.13], frame: [0.21, 0.06, 0.33, 0.16] },
    skyAway: { ref: [0.25, 0.00, 0.45, 0.08], frame: [0.45, 0.00, 0.65, 0.08] },
    haze: { ref: [0.50, 0.27, 0.72, 0.37], frame: [0.30, 0.425, 0.50, 0.465] },
    foreground: { ref: [0.03, 0.72, 0.33, 0.88], frame: [0.03, 0.62, 0.33, 0.85] },
    shade: { ref: [0.62, 0.60, 0.88, 0.72], frame: [0.65, 0.45, 0.98, 0.56] },
  }) },
  F05: { crop: 'key-dusk', regions: reg({
    sunSky: { ref: [0.30, 0.14, 0.45, 0.26], frame: [0.58, 0.28, 0.72, 0.40] },
    skyAway: { ref: [0.45, 0.00, 0.75, 0.10], frame: [0.30, 0.00, 0.70, 0.10] },
    // (the first box, [0.15, 0.50, 0.30, 0.56], fell on the basalt stacks left of the Ring, not on water: corrected
    // to the open sea left of them on the first probed film, before any tuning)
    sea: { ref: [0.00, 0.42, 0.14, 0.58], frame: [0.00, 0.49, 0.14, 0.56] },
    far: { ref: [0.75, 0.32, 0.97, 0.42], frame: [0.82, 0.42, 0.98, 0.50] },
    foreground: { ref: [0.05, 0.90, 0.60, 0.99], frame: [0.10, 0.70, 0.35, 0.95] },
  }) },
  // F04's crop is five material swatches; the frame shows the Pans' ground (salt crust, black sand: world-ground's
  // M1.1e decides which, and the integrated tree moved from salt to black sand at the same camera on Nov 14). Five
  // frame regions; each is compared with the swatch of the material it shows, read from its own L* (>= 40 salt
  // crust, below it black sand), never from the distance
  F04: { crop: 'over-materials', byMaterial: { split: 40, bright: 'salt', dark: 'sand' }, refs: {
    salt: [0.215, 0.05, 0.38, 0.75], sand: [0.415, 0.05, 0.585, 0.75] }, regions: {
    a: { frame: [0.05, 0.05, 0.35, 0.30] },
    b: { frame: [0.65, 0.05, 0.95, 0.30] },
    c: { frame: [0.35, 0.35, 0.65, 0.60] },
    d: { frame: [0.05, 0.65, 0.30, 0.95] },
    e: { frame: [0.70, 0.65, 0.95, 0.95] },
  } },
};

async function loadRgb(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
function regionLab(img, box) {
  const x0 = Math.floor(box[0] * img.w), y0 = Math.floor(box[1] * img.h), x1 = Math.ceil(box[2] * img.w), y1 = Math.ceil(box[3] * img.h);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.w + x) * img.ch; r += LIN[img.data[i]]; g += LIN[img.data[i + 1]]; b += LIN[img.data[i + 2]]; n++; }
  return linToLab(r / n, g / n, b / n);
}
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

export async function measureFrame(runDir, fr) {
  const id = fr.id, file = path.join(runDir, `${id}.png`);
  if (!existsSync(file)) return { id, error: 'no PNG' };
  return measureImage(await loadRgb(file), fr);
}

/** The same lines on an image already in memory ({ data, w, h, ch }; any size: regions are fractions). */
export async function measureImage(img, fr, opts = {}) {
  const id = fr.id;
  const P = fr.probe && !fr.probe.error ? fr.probe : null;
  const res = { id, hour: fr.hour };

  /* palette */
  const R = REGIONS[id];
  if (R) {
    const ref = await loadRgb(path.join(CROPS, `${R.crop}.png`));
    const rows = [];
    for (const [name, b] of Object.entries(R.regions)) {
      const f = regionLab(img, b.frame);
      let refBox = b.ref, nm = name;
      if (R.byMaterial) { const m = f[0] >= R.byMaterial.split ? R.byMaterial.bright : R.byMaterial.dark; refBox = R.refs[m]; nm = `${name}:${m}`; }
      const c = regionLab(ref, refBox);
      rows.push({ name: nm, frame: f.map(r1), ref: c.map(r1), dE: r1(dE2000(f[0], f[1], f[2], c[0], c[1], c[2])) });
    }
    res.palette = { crop: R.crop, regions: rows, meanDE: r1(rows.reduce((s, q) => s + q.dE, 0) / rows.length) };
  }
  if (!P) { res.probe = fr.probe?.error || 'none'; return res; }
  if (opts.paletteOnly) return res;

  /* per-pixel depth from the probe grid */
  const D = P.depth, sx = D.w / img.w, sy = D.h / img.h;
  const depthAt = (x, y) => D.dist[Math.min(D.h - 1, Math.floor(y * sy)) * D.w + Math.min(D.w - 1, Math.floor(x * sx))];

  /* shadow hue, contrast */
  const ground = [];
  const band = { fore: [], mid: [] };
  for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
    const d = depthAt(x, y); if (d < 5) continue;
    const i = (y * img.w + x) * img.ch, r = LIN[img.data[i]], g = LIN[img.data[i + 1]], b = LIN[img.data[i + 2]];
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    ground.push([Y, r, g, b]);
    if (d <= 30) band.fore.push(Y); else if (d >= 120 && d <= 180) band.mid.push(Y);
  }
  ground.sort((p, q) => p[0] - q[0]);
  const k = Math.max(1, Math.floor(ground.length * 0.2));
  let sa = 0, sb = 0, sL = 0;
  for (let j = 0; j < k; j++) { const lab = linToLab(ground[j][1], ground[j][2], ground[j][3]); sL += lab[0]; sa += lab[1]; sb += lab[2]; }
  const hue = hueOf(sa / k, sb / k);
  res.shadow = { n: k, L: r1(sL / k), a: r1(sa / k), b: r1(sb / k), hue: r1(hue), pass: hue >= 280 && hue <= 330 };
  const rms = (a) => { if (a.length < 50) return null; const m = a.reduce((s, v) => s + v, 0) / a.length; const v = a.reduce((s, q) => s + (q - m) ** 2, 0) / a.length; return Math.sqrt(v) / m; };
  const cf = rms(band.fore), cm = rms(band.mid);
  res.contrast = { foreN: band.fore.length, midN: band.mid.length, fore: r2(cf), mid: r2(cm), ratio: cf && cm != null ? r2(cm / cf) : null,
    pass: cf && cm != null ? cm / cf >= 0.6 : null, t150: P.fog?.t150, t30: P.fog?.t30 };

  /* sun disc, clipped blob, glitter */
  const S = P.sun;
  if (img.w !== 1600) return res;   // the sun lines read the filmed frame only (probe px are 1600 x 900 CSS px)
  res.sun = { elevDeg: S.elevDeg, inFrame: S.inFrame, px: S.px, pxPerDeg: S.pxPerDeg.r1, discDiameterDeg: r2(S.discRadiusDeg * 2) };
  if (S.inFrame) {
    const ppd = S.pxPerDeg.r4, cx = Math.round(S.px[0]), cy = Math.round(S.px[1]);
    // the sun's blob is read in the SKY (probe depth -1): a glitter path's clipped core on the sea below a sun on the
    // horizon touches the disc but is the sea's highlight, reported separately (clipAllMaxDeg)
    let skyOnly = true;
    const clipped = (x, y) => { const i = (y * img.w + x) * img.ch; return Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) >= 254 && (!skyOnly || depthAt(x, y) < 0); };
    const blob = () => {
    let maxR = 0, n = 0;
    // seed: the sun's centre pixel, or the nearest clipped pixel within 0.6 deg (the disc's own radius plus a margin)
    let seed = null;
    for (let rr = 0; rr <= Math.ceil(0.6 * ppd) && !seed; rr++) for (let dy = -rr; dy <= rr && !seed; dy++) for (let dx = -rr; dx <= rr && !seed; dx++) {
      const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < img.w && y < img.h && clipped(x, y)) seed = [x, y];
    }
    if (seed) {
      const seen = new Uint8Array(img.w * img.h), st = [seed];
      seen[seed[1] * img.w + seed[0]] = 1;
      while (st.length) {
        const [x, y] = st.pop(); n++;
        const r = Math.hypot(x - S.px[0], y - S.px[1]) / ppd; if (r > maxR) maxR = r;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue;
          const j = Y * img.w + X; if (seen[j] || !clipped(X, Y)) continue; seen[j] = 1; st.push([X, Y]);
        }
      }
    }
    return [n, maxR];
    };
    const [n, maxR] = blob();
    skyOnly = false;
    const [nAll, maxAll] = blob();
    res.sun.clipAllPx = nAll; res.sun.clipAllMaxDeg = r2(maxAll);
    res.sun.clipPx = n; res.sun.clipMaxDeg = r2(maxR);
    res.sun.pass = S.discRadiusDeg * 2 < 2 && maxR <= 4;
    if (S.elevDeg > 0 && id === 'F05') {   // the sea under the sun: F05 (F02's sun stands over the land)
      const hy = S.px[1] + S.elevDeg * ppd;   // the horizon row under the sun
      const Lrow = (x0, x1, y0, y1) => {
        let s = 0, m = 0;
        for (let y = Math.max(0, Math.round(y0)); y < Math.min(img.h, Math.round(y1)); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(img.w, Math.round(x1)); x++) {
          const i = (y * img.w + x) * img.ch; s += linToLab(LIN[img.data[i]], LIN[img.data[i + 1]], LIN[img.data[i + 2]])[0]; m++;
        }
        return m ? s / m : null;
      };
      const y0 = hy + 0.4 * ppd, y1 = hy + 6 * ppd;
      const path_ = Lrow(S.px[0] - 1.5 * ppd, S.px[0] + 1.5 * ppd, y0, y1);
      const side = [Lrow(S.px[0] - 12 * ppd, S.px[0] - 6 * ppd, y0, y1), Lrow(S.px[0] + 6 * ppd, S.px[0] + 12 * ppd, y0, y1)].filter((v) => v != null);
      const sideL = side.length ? side.reduce((s, v) => s + v, 0) / side.length : null;
      res.glitter = { pathL: r1(path_), sideL: r1(sideL), dL: path_ != null && sideL != null ? r1(path_ - sideL) : null };
      res.glitter.pass = res.glitter.dL != null && res.glitter.dL >= 10;
    }
  }
  res.bloom = P.bloom; res.exposure = P.exposure; res.grade = P.grade;
  return res;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const runDir = process.argv[2];
  if (!runDir) { console.error('usage: m11-accept.mjs <runDir> [--json]'); process.exit(2); }
  const run = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'));
  const out = [];
  for (const fr of run.frames.filter((f) => f.ok)) out.push(await measureFrame(runDir, fr));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  console.log(`run ${path.basename(runDir)} (commit ${run.commit}${run.dirty ? ', dirty tree' : ''})`);
  for (const r of out) {
    console.log(`\n${r.id} @ ${r.hour}`);
    if (r.palette) {
      console.log(`  palette vs ${r.palette.crop}: mean dE2000 ${r.palette.meanDE} (bar <= 12) ${r.palette.meanDE <= 12 ? 'PASS' : 'FAIL'}`);
      for (const q of r.palette.regions) console.log(`    ${q.name.padEnd(10)} dE ${String(q.dE).padStart(5)}  frame Lab ${q.frame.join(' ')}  ref ${q.ref.join(' ')}`);
    }
    if (r.shadow) console.log(`  shadow hue ${r.shadow.hue} (L ${r.shadow.L} a ${r.shadow.a} b ${r.shadow.b}) bar 280-330: ${r.shadow.pass ? 'PASS' : 'FAIL'}`);
    if (r.contrast) console.log(`  contrast fore ${r.contrast.fore} (n ${r.contrast.foreN}) mid150 ${r.contrast.mid} (n ${r.contrast.midN}) ratio ${r.contrast.ratio} bar >= 0.60: ${r.contrast.pass == null ? 'n/a' : r.contrast.pass ? 'PASS' : 'FAIL'}; fog T(150 m) ${r.contrast.t150}, T(30 m) ${r.contrast.t30}`);
    if (r.sun) console.log(`  sun elev ${r.sun.elevDeg} in frame ${r.sun.inFrame} at ${r.sun.px}; disc ${r.sun.discDiameterDeg} deg; clipped blob in the sky ${r.sun.clipPx ?? '-'} px to ${r.sun.clipMaxDeg ?? '-'} deg (with the sea's ${r.sun.clipAllPx ?? '-'} px to ${r.sun.clipAllMaxDeg ?? '-'} deg): ${r.sun.pass == null ? 'n/a' : r.sun.pass ? 'PASS' : 'FAIL'}`);
    if (r.glitter) console.log(`  glitter path L ${r.glitter.pathL} vs sides ${r.glitter.sideL}: dL ${r.glitter.dL} (bar >= 10) ${r.glitter.pass ? 'PASS' : 'FAIL'}`);
    if (r.bloom) console.log(`  bloom ${JSON.stringify(r.bloom)}`);
    if (r.exposure) console.log(`  exposure ${JSON.stringify(r.exposure)}  grade ${JSON.stringify(r.grade)}`);
  }
}
