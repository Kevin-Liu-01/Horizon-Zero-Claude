/**
 * Colour science for the Instruments' lamp grammar (instruments-core, Round 5).
 *
 * Plain functions, no three.js and no DOM, so the SAME module answers in the
 * game (lamps.js), in a page-context gate (`import('/src/instruments/lib/color.js')`)
 * and in node (the static half of `A-lamp-canon-distance`).
 *
 *   hexToRgb('#F2EAD3')        -> [r, g, b]  sRGB, 0..1
 *   rgbToHex([r, g, b])        -> '#rrggbb'
 *   srgbToLinear(c) / linearToSrgb(c)        one channel, IEC 61966-2-1
 *   rgbToLab([r, g, b])        -> [L, a, b]  CIE L*a*b*, D65 (sRGB input)
 *   deltaE2000(labA, labB)     -> number     CIEDE2000 (Sharma et al. 2005)
 *   deltaE(hexA|rgbA, hexB|rgbB)              convenience: either form
 *
 * Verified against the Sharma test pairs (see `SHARMA_PAIRS` below; the gate
 * file asserts them so a typo here cannot pass a colour gate by accident).
 */

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#|^0x/i, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const XN = 0.95047, YN = 1.0, ZN = 1.08883;
function f(t) { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116; }

/** sRGB (0..1, gamma-encoded) -> CIE L*a*b* (D65). */
export function rgbToLab(rgb) {
  const r = srgbToLinear(rgb[0]), g = srgbToLinear(rgb[1]), b = srgbToLinear(rgb[2]);
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  const fx = f(x / XN), fy = f(y / YN), fz = f(z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const RAD = Math.PI / 180;

/** CIEDE2000 colour difference between two L*a*b* triples. */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const Cb7 = Math.pow(Cb, 7);
  const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (a, b) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / RAD;
    return h >= 0 ? h : h + 360;
  };
  const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp = (h1p + h2p < 360) ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hbp = (h1p + h2p) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * RAD) + 0.24 * Math.cos(2 * hbp * RAD)
    + 0.32 * Math.cos((3 * hbp + 6) * RAD) - 0.20 * Math.cos((4 * hbp - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Cbp7 = Math.pow(Cbp, 7);
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + Math.pow(25, 7)));
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

const asLab = (c) => rgbToLab(typeof c === 'string' ? hexToRgb(c) : c);

/** ΔE2000 between two colours given as '#rrggbb' strings or sRGB triples (0..1). */
export function deltaE(a, b) { return deltaE2000(asLab(a), asLab(b)); }

/**
 * Sharma, Wu & Dalal (2005) reference pairs [lab1, lab2, ΔE00] — a subset that
 * covers the hue-wrap, the G term and the rotation term.
 */
export const SHARMA_PAIRS = [
  [[50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485], 2.0425],
  [[50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485], 2.8615],
  [[50.0, -1.3802, -84.2814], [50.0, 0.0, -82.7485], 1.0000],
  [[50.0, 0.0, 0.0], [50.0, -1.0, 2.0], 2.3669],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0011], 7.2195],
  [[50.0, 2.5, 0.0], [73.0, 25.0, -18.0], 27.1492],
  [[50.0, 2.5, 0.0], [56.0, -27.0, -3.0], 31.9030],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
  [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, 0.0447], 1.4441],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
];

/** Max |error| of this implementation over SHARMA_PAIRS (should be < 1e-4). */
export function sharmaCheck() {
  let worst = 0;
  for (const [a, b, want] of SHARMA_PAIRS) worst = Math.max(worst, Math.abs(deltaE2000(a, b) - want));
  return worst;
}
