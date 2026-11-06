/**
 * THE CALIMA LOOK — the output transform's CPU half (lane look-post, W1;
 * docs/ROUND5-LOOK.md L-01, L-02, L-07, L-14; report docs/ROUND5-LOOK-POST.md).
 *
 * Plain functions and one class, no three.js and no DOM, so the SAME module
 * answers in the game (engine.js builds the grade LUTs from it and publishes
 * `engine.look`), in a page-context gate (`import('/src/core/look.js')`) and in
 * node (tools/look/*.mjs read src/core/look.grade.json and call it directly).
 *
 * THE CHAIN (identical, operation for operation, to OutputGradeShader's
 * CAL_AGX branch in engine.js):
 *
 *   HDR linear sRGB (the scene)                         x
 *   x exposure                                          (LOOK_EXPOSURE x 2^ev)
 *   -> rec2020 -> AgX inset -> log2 [-12.47393, +4.026069] -> clamp 0..1
 *   -> AgX 6th-order sigmoid                            three r169's AgX (MIT)
 *   -> CALIMA look (ASC-CDL in AgX space)               slope, power, luma-preserving sat
 *   -> AgX outset -> pow 2.2 -> rec709 -> clamp 0..1
 *   -> sRGB OETF (three's sRGBTransferOETF, exponent 0.41666)
 *   -> grade: mix(LUT_A(c), LUT_B(c), lutMix), trilinear on a 32^3 RGBA8 grid
 *   -> mix(c, graded, gradeMix)
 *   -> vignette (screen space; not part of evaluate(), which is the screen centre)
 *
 * The grade LUT holds, per grade SET (look.grade.json: golden, noon, dusk,
 * calima), everything the grade does in display space: split tone by luma,
 * contrast about a pivot, saturation by luma, and the hue work in CIE LCh
 * (yellow-olive rotated toward amber with less chroma, greens damped, the
 * Orchil violets lifted). Two LUT slots are blended on the GPU, so the hour
 * and the weather cross-fade sets without a CPU rebuild (L-02).
 *
 * PUBLISHED (the contract other lanes code against; engine.look is an
 * instance of `Look`):
 *   look.evaluate(rgb, out?)  HDR linear [r,g,b] -> display sRGB 0..1 at the
 *                             screen centre, exactly what the grade pass draws
 *                             (within 1/255; A-look-tonemap b). Allocation-free with `out`.
 *   look.invert(rgb, out?)    display sRGB 0..1 -> the HDR linear value whose
 *                             image it is (round trip <= 1/255 inside the
 *                             transform's gamut; a channel at the ceiling stays
 *                             at it). Allocation-free with `out`.
 *   look.toneMap(rgb, out?)   HDR linear -> display LINEAR 0..1 (AgX + look,
 *                             no OETF, no grade): what sheets.js composites.
 *   look.version              bumps on every change a CPU copy must follow
 *                             (exposure, look, sets, slot mix, grade mix)
 *   look.exposure             the exposure in force (LOOK_EXPOSURE x 2^ev)
 *   setsForHour(h, weather)   the pair of grade sets and the mix for an hour
 *                             and a weather, for world-sky's per-hour call to
 *                             engine.setLook() (no allocation with `out`)
 */

/* ------------------------------------------------------------------ */
/* constants (three r169 tonemapping_pars_fragment, MIT; rows here)     */
/* ------------------------------------------------------------------ */

/** linear sRGB -> linear rec2020 (three's LINEAR_SRGB_TO_LINEAR_REC2020, as rows). */
const M_709_TO_2020 = [
  [0.6274, 0.3293, 0.0433],
  [0.0691, 0.9195, 0.0113],
  [0.0164, 0.0880, 0.8956],
];
/** linear rec2020 -> linear sRGB (three's LINEAR_REC2020_TO_LINEAR_SRGB, as rows). */
const M_2020_TO_709 = [
  [1.6605, -0.5876, -0.0728],
  [-0.1246, 1.1329, -0.0083],
  [-0.0182, -0.1006, 1.1187],
];
const AGX_INSET = [
  [0.856627153315983, 0.0951212405381588, 0.0482516061458583],
  [0.137318972929847, 0.761241990602591, 0.101439036467562],
  [0.11189821299995, 0.0767994186031903, 0.811302368396859],
];
const AGX_OUTSET = [
  [1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
  [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
  [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405],
];
export const AGX_MIN_EV = -12.47393;
export const AGX_MAX_EV = 4.026069;
const AGX_RANGE = AGX_MAX_EV - AGX_MIN_EV;
/** The look's own luma weights (Filament's agxLook; rec709). */
const LW = [0.2126, 0.7152, 0.0722];

/**
 * Base exposure: 0.18 grey shows at L* 50 through AgX + the CALIMA look
 * (power 1.22) with the grade at mix 0. Solved by bisection at module load
 * (calibrateExposure) and checked by A-look-tonemap (a); this literal is the
 * fallback and the documented value.
 */
export const LOOK_EXPOSURE_NOMINAL = 1.21;

/** The CALIMA look (L-01): ASC-CDL in AgX space, luma-preserving saturation. */
export const LOOK_DEFAULT = Object.freeze({ slope: Object.freeze([1.0, 0.99, 0.97]), power: 1.22, sat: 1.12 });

/* ------------------------------------------------------------------ */
/* small allocation-free helpers                                       */
/* ------------------------------------------------------------------ */

function mul3(M, v, out) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = M[0][0] * x + M[0][1] * y + M[0][2] * z;
  out[1] = M[1][0] * x + M[1][1] * y + M[1][2] * z;
  out[2] = M[2][0] * x + M[2][1] * y + M[2][2] * z;
  return out;
}
function inv3(m) {
  const a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2], g = m[2][0], h = m[2][1], i = m[2][2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const M_709_TO_2020_INV = inv3(M_709_TO_2020);
const M_2020_TO_709_INV = inv3(M_2020_TO_709);
const AGX_INSET_INV = inv3(AGX_INSET);
const AGX_OUTSET_INV = inv3(AGX_OUTSET);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/** three r169 sRGBTransferOETF (exponent 0.41666, not 1/2.4). */
export function oetf(c) { return c <= 0.0031308 ? c * 12.92 : Math.pow(c, 0.41666) * 1.055 - 0.055; }
/** Inverse of `oetf` (exact for this exponent). */
export function eotf(v) { return v <= 0.0031308 * 12.92 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 1 / 0.41666); }
/** IEC 61966-2-1 decode (what a PNG reader and CIELAB use). */
export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

/** AgX's 6th-order sigmoid (agxDefaultContrastApprox). */
export function agxSigmoid(x) {
  const x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
function agxSigmoidD(x) {
  const x2 = x * x, x4 = x2 * x2;
  return 93 * x4 * x - 200.7 * x4 + 127.84 * x2 * x - 20.604 * x2 + 0.8596 * x + 0.1191;
}
const SIG_LO = agxSigmoid(0), SIG_HI = agxSigmoid(1);

/**
 * THE CALIMA SHOULDER. three's AgX clamps the log encoding at +4.03 EV, so
 * every exposed value above 16.3 shows as one flat grey (L* 98.6): the sun
 * disc, its corona and a sea glint all plateau and nothing ever reaches the
 * display's white. Above the log range the sigmoid continues with an
 * exponential shoulder that leaves it with the same slope (C1) and rises to
 * SH_YMAX, which clears the look's slope so that a white reaches 255: the ramp
 * stays strictly increasing to ~52 scene-linear (A-look-tonemap d) and true
 * highlights clip (the panels' 0.5-4 %). Nothing at or below the AgX white is
 * touched. The shader carries the same three constants.
 */
export const SH_XMAX = 1.5;
export const SH_YMAX = 1.04;
const SIG_D1 = agxSigmoidD(1);
export const SH_A = SH_YMAX - SIG_HI;
export const SH_K = SIG_D1 / SH_A;
/** The sigmoid with the shoulder: x is the log-normalised value clamped to [0, SH_XMAX]. */
export function calSigmoid(x) {
  if (x <= 1) return agxSigmoid(x < 0 ? 0 : x);
  const o = (x > SH_XMAX ? SH_XMAX : x) - 1;
  return SIG_HI + SH_A * (1 - Math.exp(-o * SH_K));
}

/** Inverse of calSigmoid (monotonic on [0, SH_XMAX]): Newton from a bisection bracket, the shoulder in closed form. */
export function agxSigmoidInv(y) {
  if (y <= SIG_LO) return 0;
  if (y >= SIG_HI) {
    const top = SIG_HI + SH_A * (1 - Math.exp(-(SH_XMAX - 1) * SH_K));
    if (y >= top) return SH_XMAX;
    return 1 - Math.log(1 - (y - SIG_HI) / SH_A) / SH_K;
  }
  let lo = 0, hi = 1, x = 0.5;
  for (let i = 0; i < 40; i++) {
    const f = agxSigmoid(x) - y;
    if (Math.abs(f) < 1e-12) break;
    if (f > 0) hi = x; else lo = x;
    const d = agxSigmoidD(x);
    let nx = d > 1e-9 ? x - f / d : 0.5 * (lo + hi);
    if (!(nx > lo && nx < hi)) nx = 0.5 * (lo + hi);
    x = nx;
  }
  return x;
}

/* ------------------------------------------------------------------ */
/* AgX + the CALIMA look (scene linear -> display linear)              */
/* ------------------------------------------------------------------ */

const _a = [0, 0, 0], _b = [0, 0, 0];

/**
 * Exposed HDR linear (already x exposure) -> display-linear sRGB 0..1:
 * AgX with the look, exactly as the shader. Allocation-free.
 */
export function agxLook(x, look, out) {
  mul3(M_709_TO_2020, x, _a);
  mul3(AGX_INSET, _a, _b);
  for (let i = 0; i < 3; i++) {
    let v = Math.log2(Math.max(_b[i], 1e-10));
    v = (v - AGX_MIN_EV) / AGX_RANGE;
    v = calSigmoid(v < 0 ? 0 : v > SH_XMAX ? SH_XMAX : v);
    // the CALIMA look: ASC-CDL (slope, power) in AgX space
    v = Math.pow(Math.max(v * look.slope[i], 0), look.power);
    _a[i] = v;
  }
  const l = LW[0] * _a[0] + LW[1] * _a[1] + LW[2] * _a[2];
  for (let i = 0; i < 3; i++) _a[i] = l + look.sat * (_a[i] - l);
  mul3(AGX_OUTSET, _a, _b);
  for (let i = 0; i < 3; i++) _b[i] = Math.pow(Math.max(_b[i], 0), 2.2);
  mul3(M_2020_TO_709, _b, out);
  out[0] = clamp01(out[0]); out[1] = clamp01(out[1]); out[2] = clamp01(out[2]);
  return out;
}

/**
 * Inverse of agxLook for an in-gamut display-linear value: the exposed HDR
 * linear input (unclamped; a component that sits at the log floor or ceiling
 * comes back at it). Allocation-free.
 */
export function agxLookInv(y, look, out) {
  mul3(M_2020_TO_709_INV, y, _a);
  for (let i = 0; i < 3; i++) _a[i] = Math.pow(Math.max(_a[i], 0), 1 / 2.2);
  mul3(AGX_OUTSET_INV, _a, _b);
  // the sat step preserves luma: undo it about the same luma
  const l = LW[0] * _b[0] + LW[1] * _b[1] + LW[2] * _b[2];
  for (let i = 0; i < 3; i++) {
    let v = l + (_b[i] - l) / look.sat;
    v = Math.pow(Math.max(v, 0), 1 / look.power) / look.slope[i];
    v = agxSigmoidInv(v);
    _a[i] = Math.pow(2, v * AGX_RANGE + AGX_MIN_EV);
  }
  mul3(AGX_INSET_INV, _a, _b);
  mul3(M_709_TO_2020_INV, _b, out);
  return out;
}

/** The exposure that puts 0.18 grey at L* 50 through agxLook + OETF (no grade). */
export function calibrateExposure(look = LOOK_DEFAULT) {
  const y = [0, 0, 0], g = [0, 0, 0];
  const lstar = (e) => {
    g[0] = g[1] = g[2] = 0.18 * e;
    agxLook(g, look, y);
    const Y = srgbToLinear(clamp01(oetf(y[1])));   // the screen's value, decoded as a viewer's PNG reader does
    return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : Y * 24389 / 27;
  };
  let lo = 0.2, hi = 6;
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (lstar(m) < 50) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}

/* ------------------------------------------------------------------ */
/* CIELAB (D65) for the hue work                                       */
/* ------------------------------------------------------------------ */

const XN = 0.95047, ZN = 1.08883;
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fLabInv = (f) => { const t = f * f * f; return t > 216 / 24389 ? t : (116 * f - 16) * 27 / 24389; };

/** display sRGB (0..1) -> L*a*b* into `out`. */
export function srgbToLab(c, out) {
  const r = srgbToLinear(c[0]), g = srgbToLinear(c[1]), b = srgbToLinear(c[2]);
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  const fx = fLab(x / XN), fy = fLab(y), fz = fLab(z / ZN);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
  return out;
}
/** L*a*b* -> display sRGB (0..1, unclamped) into `out`. */
export function labToSrgb(lab, out) {
  const fy = (lab[0] + 16) / 116, fx = fy + lab[1] / 500, fz = fy - lab[2] / 200;
  const x = fLabInv(fx) * XN, y = fLabInv(fy), z = fLabInv(fz) * ZN;
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  out[0] = linearToSrgb(Math.max(0, r)); out[1] = linearToSrgb(Math.max(0, g)); out[2] = linearToSrgb(Math.max(0, b));
  return out;
}

/* ------------------------------------------------------------------ */
/* the grade (display space), baked per set into a LUT                 */
/* ------------------------------------------------------------------ */

const _lab = [0, 0, 0];
/** Hue weight of a band [from, to] (deg, wrapping) with a linear feather on both sides. */
function bandWeight(h, from, to, feather) {
  const span = ((to - from) % 360 + 360) % 360;
  const d = ((h - from) % 360 + 360) % 360;          // distance past `from`
  if (d <= span) return 1;
  const before = 360 - d, after = d - span;
  const k = Math.min(before, after);
  return feather > 0 ? Math.max(0, 1 - k / feather) : 0;
}

/**
 * One grade set applied to a display sRGB triple (0..1) -> graded display
 * sRGB (0..1). The LUT is this function sampled on the 32^3 grid.
 */
export function gradeSet(c, s, out) {
  let r = c[0], g = c[1], b = c[2];
  // GAMUT-EDGE GUARD: colours near the sRGB boundary (Lab chroma >= edgeChroma[0]) keep their
  // chroma and hue, fading to identity at edgeChroma[1]. No scene colour lives there (panel
  // and frame chroma 18-55); the lamp tokens and UI-grade emissives do, and a grade that pulled
  // them inward would put them outside what the output can show (look.invert could not reach
  // them: A-lamp-states).
  srgbToLab(c, _lab);
  const ec = s.edgeChroma || [58, 82];
  const pe = smoothstep(ec[0], ec[1], Math.hypot(_lab[1], _lab[2]));
  // 1. split tone by luma: violet-rose shadow, warm light
  let l = LW[0] * r + LW[1] * g + LW[2] * b;
  const ws = 1 - smoothstep(s.shadowRange[0], s.shadowRange[1], l);
  const wh = smoothstep(s.highlightRange[0], s.highlightRange[1], l);
  r *= 1 + (s.shadowTint[0] - 1) * ws + (s.highlightTint[0] - 1) * wh;
  g *= 1 + (s.shadowTint[1] - 1) * ws + (s.highlightTint[1] - 1) * wh;
  b *= 1 + (s.shadowTint[2] - 1) * ws + (s.highlightTint[2] - 1) * wh;
  // 2. contrast about the pivot
  r = (r - s.pivot) * s.contrast + s.pivot;
  g = (g - s.pivot) * s.contrast + s.pivot;
  b = (b - s.pivot) * s.contrast + s.pivot;
  // 3. saturation by luma (shadow / mid / highlight); never below 1 at the gamut edge
  l = LW[0] * r + LW[1] * g + LW[2] * b;
  const sl = s.satLuma;
  let sat = (sl[0] + (sl[1] - sl[0]) * smoothstep(s.satRange[0], s.satRange[1], l))
    + (sl[2] - sl[1]) * smoothstep(s.satRange[2], s.satRange[3], l);
  if (sat < 1) sat += (1 - sat) * pe;
  r = l + sat * (r - l); g = l + sat * (g - l); b = l + sat * (b - l);
  // 4. hue work in LCh (faded out at the gamut edge)
  out[0] = clamp01(r); out[1] = clamp01(g); out[2] = clamp01(b);
  if (s.hue && s.hue.length && pe < 1) {
    srgbToLab(out, _lab);
    const C = Math.hypot(_lab[1], _lab[2]);
    if (C > 1e-4) {
      let h = Math.atan2(_lab[2], _lab[1]) * 180 / Math.PI;
      if (h < 0) h += 360;
      let dh = 0, kc = 1;
      for (let i = 0; i < s.hue.length; i++) {
        const band = s.hue[i];
        const w = bandWeight(h, band.from, band.to, band.feather) * Math.min(1, C / (band.minChroma || 1)) * (1 - pe);
        if (w <= 0) continue;
        dh += (band.rotate || 0) * w;
        kc *= 1 + ((band.chroma ?? 1) - 1) * w;
      }
      if (dh !== 0 || kc !== 1) {
        const hh = (h + dh) * Math.PI / 180, CC = C * kc;
        _lab[1] = CC * Math.cos(hh); _lab[2] = CC * Math.sin(hh);
        labToSrgb(_lab, out);
      }
    }
  }
  out[0] = clamp01(out[0]); out[1] = clamp01(out[1]); out[2] = clamp01(out[2]);
  return out;
}

/** Bake a set into an RGBA8 LUT (r fastest, then g, then b: the Data3DTexture layout). */
export function bakeLut(set, size = 32, data = new Uint8Array(size * size * size * 4)) {
  const c = [0, 0, 0], o = [0, 0, 0];
  const k = 1 / (size - 1);
  let p = 0;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        c[0] = ri * k; c[1] = gi * k; c[2] = bi * k;
        gradeSet(c, set, o);
        data[p] = Math.round(o[0] * 255); data[p + 1] = Math.round(o[1] * 255); data[p + 2] = Math.round(o[2] * 255); data[p + 3] = 255;
        p += 4;
      }
    }
  }
  return data;
}

/**
 * Trilinear sample of an RGBA8 LUT at display sRGB `c`, as the GPU samples it
 * (texel centres at (i + 0.5) / size; coordinate c * (size - 1) / size + 0.5 / size).
 */
export function sampleLut(data, size, c, out) {
  const n = size - 1;
  const fr = clamp01(c[0]) * n, fg = clamp01(c[1]) * n, fb = clamp01(c[2]) * n;
  const r0 = Math.min(n - 1, Math.floor(fr)), g0 = Math.min(n - 1, Math.floor(fg)), b0 = Math.min(n - 1, Math.floor(fb));
  const tr = fr - r0, tg = fg - g0, tb = fb - b0;
  const sx = 4, sy = 4 * size, sz = 4 * size * size;
  const base = r0 * sx + g0 * sy + b0 * sz;
  for (let ch = 0; ch < 3; ch++) {
    const i = base + ch;
    const c000 = data[i], c100 = data[i + sx], c010 = data[i + sy], c110 = data[i + sx + sy];
    const c001 = data[i + sz], c101 = data[i + sx + sz], c011 = data[i + sy + sz], c111 = data[i + sx + sy + sz];
    const x00 = c000 + (c100 - c000) * tr, x10 = c010 + (c110 - c010) * tr;
    const x01 = c001 + (c101 - c001) * tr, x11 = c011 + (c111 - c011) * tr;
    const y0 = x00 + (x10 - x00) * tg, y1 = x01 + (x11 - x01) * tg;
    out[ch] = (y0 + (y1 - y0) * tb) / 255;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* hour -> sets (world-sky calls engine.setLook with this, per hour)   */
/* ------------------------------------------------------------------ */

/**
 * The pair of grade sets and their mix for an hour (0..24) and a weather name.
 * `hours` is look.grade.json's `hours` table: [[h, setName], ...] ascending,
 * wrapping at 24. Calima weather (weight `calima` 0..1, default 1 when the
 * weather is 'calima') takes slot B. Allocation-free with `out`.
 */
export function setsForHour(grade, h, weather = null, calimaWeight = null, out = { a: 'golden', b: 'golden', mix: 0 }) {
  const H = grade.hours;
  const hh = ((h % 24) + 24) % 24;
  let i = H.length - 1;
  for (let k = 0; k < H.length; k++) if (H[k][0] <= hh) i = k;
  const j = (i + 1) % H.length;
  const h0 = H[i][0], h1 = j === 0 ? H[0][0] + 24 : H[j][0];
  const t = h1 > h0 ? smoothstep(0, 1, ((hh < h0 ? hh + 24 : hh) - h0) / (h1 - h0)) : 0;
  const cw = calimaWeight ?? (weather === 'calima' ? 1 : 0);
  if (cw > 0) {
    out.a = t < 0.5 ? H[i][1] : H[j][1];
    out.b = 'calima';
    out.mix = cw;
  } else {
    out.a = H[i][1]; out.b = H[j][1]; out.mix = t;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Look: the live state, mirrored by engine.js's shader uniforms        */
/* ------------------------------------------------------------------ */

export class Look {
  /**
   * @param {object} grade  the parsed look.grade.json
   */
  constructor(grade) {
    this.grade = grade;
    this.size = grade.lutSize || 32;
    this.look = {
      slope: (grade.look?.slope || LOOK_DEFAULT.slope).slice(),
      power: grade.look?.power ?? LOOK_DEFAULT.power,
      sat: grade.look?.sat ?? LOOK_DEFAULT.sat,
    };
    this.baseExposure = grade.look?.exposure === 'calibrate' || grade.look?.exposure == null
      ? calibrateExposure(this.look) : grade.look.exposure;
    this.ev = 0;
    this.exposure = this.baseExposure;
    /** CPU copies of every set's LUT, baked once (4 x 128 KB); the GPU holds two slots. */
    this.luts = {};
    for (const name of Object.keys(grade.sets)) this.luts[name] = bakeLut(grade.sets[name], this.size);
    this.setA = grade.default || 'golden';
    this.setB = this.setA;
    this.lutMix = 0;
    this.gradeMix = 1;
    this.vignette = grade.vignette ?? 0.28;
    this.bloomScale = 1;
    this.version = 1;
    this._x = [0, 0, 0]; this._y = [0, 0, 0]; this._la = [0, 0, 0]; this._lb = [0, 0, 0];
    this._d = [0, 0, 0]; this._f = [0, 0, 0]; this._r = [0, 0, 0]; this._xs = [0, 0, 0]; this._fh = [0, 0, 0];
    this._J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  }

  /** Every set name in the grade file. */
  get sets() { return Object.keys(this.luts); }

  /** Display (post-OETF) value -> graded display value: the two slots and the grade mix. */
  _grade(c, out) {
    const la = sampleLut(this.luts[this.setA], this.size, c, this._la);
    if (this.lutMix > 0 && this.setB !== this.setA) {
      const lb = sampleLut(this.luts[this.setB], this.size, c, this._lb);
      for (let i = 0; i < 3; i++) la[i] += (lb[i] - la[i]) * this.lutMix;
    }
    const g = this.gradeMix;
    for (let i = 0; i < 3; i++) out[i] = clamp01(c[i] + (la[i] - c[i]) * g);
    return out;
  }

  /** HDR linear -> display LINEAR (AgX + look at the exposure in force; no OETF, no grade). */
  toneMap(rgb, out = [0, 0, 0]) {
    const x = this._x;
    x[0] = rgb[0] * this.exposure; x[1] = rgb[1] * this.exposure; x[2] = rgb[2] * this.exposure;
    return agxLook(x, this.look, out);
  }

  /** HDR linear -> display sRGB 0..1, what the grade pass writes at the screen centre. */
  evaluate(rgb, out = [0, 0, 0]) {
    const y = this.toneMap(rgb, this._y);
    y[0] = oetf(y[0]); y[1] = oetf(y[1]); y[2] = oetf(y[2]);
    return this._grade(y, out);
  }

  /**
   * display sRGB 0..1 -> HDR linear. Analytic first guess (LUT by refinement
   * steps, OETF, AgX + look by their exact inverses), then Newton on the exact
   * forward with a finite-difference Jacobian; a channel at the ceiling aims a
   * hair past it so it stays there.
   */
  invert(t, out = [0, 0, 0]) {
    const d = this._d, f = this._f, r = this._r;
    // 1. ungrade: fixed-point refinement through the live slots and mix
    d[0] = t[0]; d[1] = t[1]; d[2] = t[2];
    for (let it = 0; it < 6; it++) {
      this._grade(d, f);
      let e = 0;
      for (let i = 0; i < 3; i++) { const di = t[i] - f[i]; d[i] = clamp01(d[i] + di); e += Math.abs(di); }
      if (e < 1e-5) break;
    }
    // 2. un-encode, 3. un-tonemap
    for (let i = 0; i < 3; i++) f[i] = t[i] >= 0.999 ? 1 : eotf(d[i]);
    agxLookInv(f, this.look, out);
    const k = 1 / this.exposure;
    out[0] *= k; out[1] *= k; out[2] *= k;
    // 4. Newton on the exact forward
    const xs = this._xs, fh = this._fh, J = this._J;
    for (let it = 0; it < 10; it++) {
      this.evaluate(out, f);
      let e = 0;
      for (let i = 0; i < 3; i++) { r[i] = (t[i] >= 0.999 && f[i] >= 0.9995) ? 0 : f[i] - t[i]; e += Math.abs(r[i]); }
      if (e < 2e-6) break;
      for (let j = 0; j < 3; j++) {
        const h = 1e-4 * Math.max(0.01, Math.abs(out[j]));
        xs[0] = out[0]; xs[1] = out[1]; xs[2] = out[2];
        xs[j] += h;
        this.evaluate(xs, fh);
        for (let i = 0; i < 3; i++) J[i][j] = (fh[i] - f[i]) / h;
      }
      for (let i = 0; i < 3; i++) if (r[i] === 0) { J[i][0] = i === 0 ? 1 : 0; J[i][1] = i === 1 ? 1 : 0; J[i][2] = i === 2 ? 1 : 0; }
      const Ji = inv3(J);
      if (!Number.isFinite(Ji[0][0] + Ji[1][1] + Ji[2][2] + Ji[0][1] + Ji[1][2] + Ji[2][0])) break;
      mul3(Ji, r, xs);
      // a channel may go negative (an emitter pre-compensating AgX's inset, which mixes the
      // channels): the transform clamps only in AgX space, after the inset
      for (let i = 0; i < 3; i++) out[i] -= xs[i];
    }
    return out;
  }

  /**
   * Set any part of the live state. Fields: ev (exposure offset, stops), a, b
   * (set names for the two slots), mix (slot B weight 0..1), gradeMix (0..1),
   * bloomScale. Returns whether a LUT slot changed (the engine re-uploads it).
   */
  set({ ev, a, b, mix, gradeMix, bloomScale } = {}) {
    let slots = 0, changed = false;
    if (ev !== undefined && ev !== this.ev) { this.ev = ev; this.exposure = this.baseExposure * Math.pow(2, ev); changed = true; }
    if (a !== undefined && a !== this.setA && this.luts[a]) { this.setA = a; slots |= 1; changed = true; }
    if (b !== undefined && b !== this.setB && this.luts[b]) { this.setB = b; slots |= 2; changed = true; }
    if (mix !== undefined && mix !== this.lutMix) { this.lutMix = clamp01(mix); changed = true; }
    if (gradeMix !== undefined && gradeMix !== this.gradeMix) { this.gradeMix = clamp01(gradeMix); changed = true; }
    if (bloomScale !== undefined && bloomScale !== this.bloomScale) { this.bloomScale = bloomScale; changed = true; }
    if (changed) this.version++;
    return slots;
  }
}
