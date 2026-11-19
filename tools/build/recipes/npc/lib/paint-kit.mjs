/**
 * CALIMA — the painters a kit sheet is drawn with (people; lib/sheet.mjs). One texel at a time, armor/lib/atlas.mjs's
 * contract: `t` the texel (x, y on the sheet; X, Y, Z bind metres in the female frame; nx, ny, nz; d, dm the distance to
 * the island's edge in texels and metres; edge() the nearest open edge of the garment in 3-D; src the source sheet's
 * colour on an MCO part), `o` what it writes (r, g, b sRGB 0-255, rough, metal, det, h metres, salt, ao, wear, crease).
 *
 * The bible's shared dress language (§4): cream and dyed cloth with thin gold-ochre graduated-tick embroidery, frayed
 * hems, leather straps and belts with tarnished metal, dust on everything; the Holds' ash-grey and black wool with rust
 * and carmine, their crescent motif. Deterministic.
 */
import { noise3 } from '../../lib/human/face.mjs';
import { fbm } from '../../armor/lib/atlas.mjs';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const put = (o, c) => { o.r = c[0]; o.g = c[1]; o.b = c[2]; };
export const scale = (o, k) => { o.r *= k; o.g *= k; o.b *= k; };
export const over = (o, c, a) => { if (a <= 0) return; a = Math.min(1, a); o.r += (c[0] - o.r) * a; o.g += (c[1] - o.g) * a; o.b += (c[2] - o.b) * a; };
const fract = (v) => v - Math.floor(v);
const hash = (i, j, k, s) => {
  let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** The nearest of a jittered lattice of points (cell metres): { d, id (0..1), cx, cy, cz }. */
export function cells3(x, y, z, cell, seed = 0) {
  const fx = Math.floor(x / cell), fy = Math.floor(y / cell), fz = Math.floor(z / cell);
  let best = 1e9, id = 0, cx = 0, cy = 0, cz = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const i = fx + a, j = fy + b, k = fz + c;
    const px = (i + hash(i, j, k, seed)) * cell, py = (j + hash(i, j, k, seed + 7)) * cell, pz = (k + hash(i, j, k, seed + 13)) * cell;
    const d = Math.hypot(px - x, py - y, pz - z);
    if (d < best) { best = d; id = hash(i, j, k, seed + 29); cx = px; cy = py; cz = pz; }
  }
  return { d: best, id, cx, cy, cz };
}

/* ------------------------------------------------------------------ grounds */

/**
 * Wool: threads a texel wide along the warp (the sheet's y runs down the garment), slubs, a felted mottle at 4 and 14 cm,
 * pale lint where it pills. `knit` reads as the shader's knit tile, else its weave.
 */
export function wool(t, o, col, { seed = 0, streak = 0.07, mottle = 0.11, pill = 0.5, knit = false, rough = 0.95 } = {}) {
  const wa = noise3(t.x * 0.58 + seed * 3.1, t.y * 0.018, 1.7), we = noise3(t.x * 0.02, t.y * 0.5 + seed * 2.3, 9.1);
  const sl = sstep(0.74, 0.92, noise3(t.x * 0.4 + seed, t.y * 0.028, 4.4));
  const m = fbm(t.X * 7 + seed, t.Y * 7, t.Z * 7, 3), m2 = fbm(t.X * 25, t.Y * 25 + seed, t.Z * 25, 2);
  const k = 1 + streak * ((wa - 0.5) * 1.2 + (we - 0.5) * 0.4) + 0.06 * sl + mottle * (2 * (m - 0.5) + 0.6 * (m2 - 0.5));
  put(o, [col[0] * k, col[1] * k, col[2] * k]);
  if (pill > 0 && noise3(t.x * 0.9 + seed, t.y * 0.9, 3.3 + seed) > 0.86) over(o, [col[0] * 1.25 + 14, col[1] * 1.25 + 14, col[2] * 1.25 + 14], 0.35 * pill);
  o.rough = rough; o.metal = 0; o.det = knit ? 0.66 : 1;
  o.h += 0.0004 * (wa - 0.5) + 0.0003 * sl;
}

/**
 * Leather: a fine pebble, a mottle of oil and wear, darker oiled patches (a little glossier), long faint scratches pale on
 * the grain. `grain` the shader's leather tile.
 */
export function leather(t, o, col, { seed = 0, oil = 0.35, scratch = 1, mottle = 0.18, rough = 0.66 } = {}) {
  const m = fbm(t.X * 9 + seed, t.Y * 9, t.Z * 9, 3), g = noise3(t.x * 0.7 + seed, t.y * 0.7, 2.2);
  const op = sstep(0.52, 0.74, fbm(t.X * 4.2, t.Y * 4.2 + seed * 1.7, t.Z * 4.2, 3));
  let k = 1 + mottle * 2 * (m - 0.5) + 0.07 * (g - 0.5);
  k *= 1 - 0.22 * op * oil;
  put(o, [col[0] * k, col[1] * k, col[2] * k]);
  o.rough = rough - 0.18 * op * oil; o.metal = 0; o.det = 0.33;
  o.h += 0.00025 * (g - 0.5);
  if (scratch > 0) {
    // two families of long, slightly curved scratches (value noise ridges stretched across each other)
    const s1 = noise3(t.X * 70 + t.Y * 18, t.Y * 6 + seed, t.Z * 70), s2 = noise3(t.X * 9 + seed, t.Y * 55 - t.X * 20, t.Z * 55);
    const l1 = 1 - clamp(Math.abs(s1 - 0.5) / 0.012), l2 = 1 - clamp(Math.abs(s2 - 0.5) / 0.01);
    const gate = sstep(0.55, 0.7, noise3(t.X * 12, t.Y * 12 + seed, t.Z * 12 + 5));
    const a = Math.max(l1, l2 * 0.8) * gate * scratch;
    if (a > 0) { over(o, [col[0] * 1.45 + 22, col[1] * 1.4 + 18, col[2] * 1.35 + 14], 0.5 * a); o.h -= 0.0002 * a; o.rough = mix(o.rough, 0.8, a); }
  }
}

/** Forged iron: dark, a blue-grey sheen, rust in the low places and on its back, bright where it is handled. */
export function iron(t, o, col = [52, 50, 54], { seed = 0, rust = 0.5 } = {}) {
  const m = fbm(t.X * 30 + seed, t.Y * 30, t.Z * 30, 3), r = fbm(t.X * 60, t.Y * 60 + seed, t.Z * 60, 2);
  const k = 0.85 + 0.35 * m;
  put(o, [col[0] * k, col[1] * k, col[2] * k * 1.04]);
  o.metal = 0.6; o.rough = 0.55 + 0.2 * m; o.det = 0; o.wear = 0.8;
  const ru = sstep(0.58, 0.78, r) * rust;
  if (ru > 0) { over(o, [118, 62, 34], ru * 0.8); o.metal *= 1 - ru; o.rough = mix(o.rough, 0.9, ru); o.h += 0.0002 * ru; }
}

/** Worked wood: long grain down its length, a darker grip where hands go, a dull oiled sheen. */
export function wood(t, o, col, { seed = 0, grip = null } = {}) {
  const gr = noise3(t.x * 0.45 + seed, t.y * 0.025, 4.1), ring = noise3(t.x * 0.12, t.y * 0.008 + seed, 8.4);
  const k = 0.86 + 0.24 * gr + 0.12 * (ring - 0.5);
  put(o, [col[0] * k, col[1] * k, col[2] * k]);
  o.rough = 0.7; o.metal = 0; o.det = 0; o.h += 0.0004 * (gr - 0.5);
  if (grip) { const g = grip(t); if (g > 0) { scale(o, 1 - 0.3 * g); o.rough = mix(o.rough, 0.5, g); } }
}

/* ------------------------------------------------------------------ marks */

/** Ash and dust: risen from the ground (bind Y) and settled on what faces up. */
export function dust(t, o, { col = [142, 138, 130], from = 0.55, to = 0.04, k = 0.45, up = 0.18, seed = 0 } = {}) {
  const n = fbm(t.X * 11 + seed, t.Y * 4, t.Z * 11, 3), n2 = noise3(t.x * 0.35, t.y * 0.35, 6.6 + seed);
  const low = sstep(from, to, t.Y) * k * (0.35 + 0.9 * n) * (0.85 + 0.3 * n2);
  const top = sstep(0.45, 0.9, t.ny) * up * (0.4 + 0.8 * n);
  over(o, col, Math.min(0.85, low + top));
  if (low + top > 0.05) o.rough = mix(o.rough, 0.97, Math.min(1, low + top));
}

/** Soot and grime: dark, soft-edged smudges where `at(t)` 0..1 says hands and heat go. */
export function soot(t, o, at, { col = [30, 26, 24], k = 0.6, seed = 0 } = {}) {
  const w = at(t);
  if (w <= 0) return;
  const n = fbm(t.X * 16 + seed, t.Y * 16, t.Z * 16, 3);
  over(o, col, clamp(w * k * sstep(0.32, 0.7, n + 0.25 * w)));
}

/**
 * Burns: scattered spatter (a burnt core, a crusted rim a little paler, a glossy dark halo), denser where `at(t)` is high.
 */
export function burns(t, o, at, { cell = 0.03, rMin = 0.0018, rMax = 0.0065, seed = 0, core = [22, 16, 13], rim = [96, 70, 52] } = {}) {
  const w = at(t);
  if (w <= 0) return;
  const c = cells3(t.X, t.Y, t.Z, cell, seed);
  if (c.id > w * 0.8) return;
  const r = mix(rMin, rMax, fract(c.id * 7.31)) * (0.8 + 0.4 * noise3(t.X * 400, t.Y * 400, t.Z * 400));
  const d = c.d / r;
  if (d > 1.9) return;
  if (d < 0.75) { over(o, core, 0.9); o.rough = 0.55; o.h -= 0.0004; }
  else if (d < 1.05) { over(o, rim, 0.55); o.h += 0.0003; }
  else { scale(o, 1 - 0.28 * (1 - (d - 1.05) / 0.85)); o.rough = mix(o.rough, 0.5, 0.4); }
}

/** A worn, frayed cloth edge: pale threads standing out in the last few mm, the cloth darker where it drags. */
export function fray(t, o, e, { reach = 0.008, pale = null, k = 1 } = {}) {
  if (!e || e.d > reach) return;
  const q = 1 - e.d / reach;
  const f = noise3(e.s * 900, e.d * 260, 1.3);
  const p = pale || [o.r * 1.35 + 22, o.g * 1.33 + 20, o.b * 1.3 + 18];
  if (f > 0.55) over(o, p, 0.6 * q * k); else scale(o, 1 - 0.3 * q * k);
  o.wear = 1.8; o.h += 0.0003 * q * (f - 0.5);
}

/** A cut leather edge: burnished dark at the cut, scuffed paler just inside it. */
export function burnish(t, o, e, { cut = 0.0025, scuff = 0.012, k = 1 } = {}) {
  if (!e || e.d > scuff) return;
  if (e.d < cut) { scale(o, 1 - 0.35 * k); o.rough = mix(o.rough, 0.45, 0.6); o.h -= 0.0003; }
  else { const q = 1 - (e.d - cut) / (scuff - cut); over(o, [o.r * 1.3 + 12, o.g * 1.28 + 10, o.b * 1.25 + 8], 0.35 * q * k * sstep(0.4, 0.7, noise3(e.s * 120, e.d * 300, 2.1))); }
}

/** A running or saddle stitch `inset` m in from the edge: dashes `per` m long, a little proud, a groove between. */
export function stitch(t, o, e, { inset = 0.006, per = 0.004, duty = 0.6, w = 0.0009, col = [170, 152, 118], a = 0.85 } = {}) {
  if (!e) return;
  const band = 1 - clamp(Math.abs(e.d - inset) / w);
  if (band <= 0) return;
  if (fract(e.s / per) < duty) { over(o, col, band * a); o.h += 0.0003 * band; o.rough = mix(o.rough, 0.8, band); }
  else { scale(o, 1 - 0.18 * band); o.h -= 0.0002 * band; }
}

/**
 * The graduated-tick family mark, couched in gold-ochre thread along an edge: a line `d0` in, a short tick every `per`
 * from it toward the edge, a long one every `long` ticks; worn dull in places.
 */
export function ticks(t, o, e, { d0 = 0.012, per = 0.008, long = 5, short = 0.0045, longL = 0.009, w = 0.0011, col = [184, 145, 74], a = 0.9 } = {}) {
  if (!e || e.d > d0 + w * 2) return;
  const worn = 0.7 + 0.3 * sstep(0.3, 0.6, noise3(e.s * 40, e.d * 40, 7.7));
  let on = 1 - clamp(Math.abs(e.d - d0) / w);
  const k = Math.floor(e.s / per), f = fract(e.s / per);
  const L = k % long === 0 ? longL : short;
  if (f < 0.22 && e.d < d0 && e.d > d0 - L) on = Math.max(on, 1);
  if (on <= 0) return;
  over(o, [col[0] * (0.85 + 0.25 * worn), col[1] * (0.85 + 0.25 * worn), col[2] * (0.85 + 0.25 * worn)], on * a * worn);
  o.h += 0.0004 * on; o.rough = mix(o.rough, 0.6, on); o.det = mix(o.det, 0.2, on);
}

/**
 * The Holds' crescent, embroidered in a row along an edge (each `per` m along, `d` m in): a disc less a disc shifted
 * toward the edge, outlined in thread.
 */
export function crescents(t, o, e, { d = 0.03, per = 0.05, r = 0.011, w = 0.0012, col = [184, 145, 74], a = 0.9, fill = 0 } = {}) {
  if (!e || Math.abs(e.d - d) > r * 1.6) return;
  const sc = (Math.round(e.s / per)) * per;
  const x = e.s - sc, y = e.d - d;
  const r1 = Math.hypot(x, y), r2 = Math.hypot(x, y + r * 0.45);
  const inA = r1 < r, inB = r2 < r * 0.82;
  const edgeA = Math.abs(r1 - r) < w && !inB, edgeB = Math.abs(r2 - r * 0.82) < w && inA;
  if (edgeA || edgeB) { over(o, col, a); o.h += 0.0004; o.rough = mix(o.rough, 0.6, 1); }
  else if (fill > 0 && inA && !inB) over(o, col, fill);
}

/** A sewn-on patch (box in X/Y on the front or back): its own cloth, a running stitch round it. */
export function patch(t, o, { cx, cy, hx, hy, front = 1, col, seed = 0, inset = 0.004 }) {
  if (Math.sign(t.Z + 0.02) !== front) return false;
  const dx = Math.abs(t.X - cx), dy = Math.abs(t.Y - cy);
  const wob = 0.004 * (noise3(t.X * 40 + seed, t.Y * 40, 1.1) - 0.5);
  if (dx > hx + wob || dy > hy + wob) return false;
  const db = Math.min(hx - dx, hy - dy);
  wool(t, o, col, { seed: seed + 50, mottle: 0.14 });
  if (db < 0.0022) { scale(o, 0.75); o.h += 0.0006; }
  if (Math.abs(db - inset) < 0.0009 && fract((t.X + t.Y) / 0.005) < 0.6) { over(o, [col[0] * 1.4 + 20, col[1] * 1.4 + 18, col[2] * 1.35 + 14], 0.8); o.h += 0.0003; }
  return true;
}

/** Shade from an MCO part's source sheet: its luminance against the class mean (its sewn folds and seams). */
export function srcLum(t, cls = srcClass(t), k = 0.8) {
  if (!t.src) return 1;
  const mean = t.srcMean?.[cls] || 100;
  const l = 0.3 * t.src[0] + 0.55 * t.src[1] + 0.15 * t.src[2];
  return clamp(1 + k * (l / mean - 1), 0.62, 1.3);
}

/** What the Ranger sheet is under the texel: 'cloth' (its greens), 'metal' (pale, grey), else 'leather'. */
export function srcClass(t) {
  if (!t.src) return 'cloth';
  const [r, g, b] = t.src, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx > 150 && mx - mn < 55) return 'metal';
  if (g > r * 1.05 && g > b) return 'cloth';
  return 'leather';
}

/** Tarnished brass: a warm ochre metal gone brown-green in the low places, bright where it is handled. */
export function brass(t, o, col = [160, 122, 63], { seed = 0, tarnish = 0.6 } = {}) {
  const m = fbm(t.X * 40 + seed, t.Y * 40, t.Z * 40, 3), tn = sstep(0.45, 0.75, fbm(t.X * 25, t.Y * 25 + seed, t.Z * 25, 2)) * tarnish;
  const k = 0.82 + 0.35 * m;
  put(o, [col[0] * k, col[1] * k, col[2] * k]);
  over(o, [82, 78, 52], tn * 0.7);
  o.metal = 0.9 * (1 - 0.5 * tn); o.rough = 0.38 + 0.3 * tn; o.det = 0; o.wear = 2.4;
}

/** Wicker: a plain over-under weave of split cane, each strand rounded, the gaps dark. */
export function wicker(t, o, col, { strand = 6.5, seed = 0 } = {}) {
  const a = t.x / strand, b = t.y / strand, ia = Math.floor(a), ib = Math.floor(b);
  const overA = (ia + ib) % 2 === 0, f = overA ? a - ia : b - ib;
  const round = Math.sin(f * Math.PI);
  const k = (0.62 + 0.5 * round) * (0.9 + 0.2 * noise3(ia * 1.7 + seed, ib * 1.3, 2.2));
  put(o, [col[0] * k, col[1] * k, col[2] * k]);
  o.h = 0.0014 * round; o.rough = 0.85; o.metal = 0; o.det = 0;
}
