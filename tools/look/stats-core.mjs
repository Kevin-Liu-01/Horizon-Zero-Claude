/**
 * LOOK FRAME STATISTICS — the core (lane look-post, L-00; docs/ROUND5-LOOK.md
 * §3.1 L-00, §7 A-look-frame-stats). Pure JS on an RGBA8 buffer: no node, no
 * DOM, so the SAME numbers come out of tools/look/look-stats.mjs (node + sharp,
 * on PNGs and on the reference panels) and of the page-context gates
 * (`import('/tools/look/stats-core.mjs')` on a canvas readback).
 *
 *   frameStats(rgba, width, height, { mask, rect, depth })  -> stats object
 *   swatches(rgba, width, height, k, opts)                  -> <= k L*a*b* swatches (numbers)
 *   srgb8ToLab(r, g, b, out)                                one pixel, CIELAB D65
 *   hueDeg(a, b), hueIn(h, lo, hi) (wrapping)
 *
 * DEFINITIONS (every look gate reads these words this way):
 *   L* percentiles   p1 p5 p20 p40 p50 p60 p80 p90 p95 p99 over the counted pixels; spread = p95 - p5
 *   chroma           mean C* = mean hypot(a*, b*) over the counted pixels
 *   lo20             the pixels with L* <= p20: mean L*, a*, b*; hue = atan2(mean b*, mean a*) in 0..360
 *   mid              the pixels with p40 <= L* <= p60: mean L*, a*, b*, hue
 *   hi10             the pixels with L* >= p90: mean L*, a*, b*, hue; chroma = hypot(mean a*, mean b*)
 *   clip %           pixels whose largest channel is >= 254 (8-bit): a highlight at the ceiling (the threshold at which every panel sits inside its own A-look-frame-stats clip bar)
 *   crush %          pixels whose largest channel is <= 6 (8-bit): shadow detail gone
 *   bands            five equal horizontal bands, top (0) to bottom (4): mean L*, a*, b*, std L*,
 *                    mean |dL* by dx| between horizontal neighbours (the band's texture)
 *   topBottom        bands[0].L / bands[4].L
 *   gold %           hue 50-95, C* >= 25, L* >= 30 (sunlit grass and dry gold)
 *   violet %         hue 280-345, C* >= 10; strongViolet % the same with C* >= 25
 *   depth bins       when a linear-depth buffer (metres per pixel) is given: per bin
 *                    [0,15) [15,60) [60,200) [200,600) [600,inf): count, mean L*, a*, b*, violet %
 * A pixel counts unless `mask` (Uint8Array, 0 = skip) or `rect` exclusions say otherwise.
 */

const XN = 0.95047, ZN = 1.08883;
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** One 8-bit sRGB pixel -> CIELAB (D65) into `out`. */
export function srgb8ToLab(r, g, b, out = [0, 0, 0]) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
  const fx = f(x / XN), fy = f(y), fz = f(z / ZN);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
  return out;
}

export function hueDeg(a, b) { let h = Math.atan2(b, a) * 180 / Math.PI; if (h < 0) h += 360; return h; }
/** Is hue h inside [lo, hi] (degrees), wrapping through 0 when lo > hi (e.g. 320..20). */
export function hueIn(h, lo, hi) { return lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi; }

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Frame statistics of an RGBA8 buffer (row 0 at the top).
 * opts.mask: Uint8Array(w*h), 0 = not counted. opts.exclude: [[x0, y0, x1, y1], ...] rectangles not counted.
 * opts.depth: Float32Array(w*h) linear depth in metres at the same resolution (or opts.depthW/H for a smaller
 * buffer sampled nearest). opts.step: sample every n-th pixel in x and y (default 1).
 */
export function frameStats(rgba, w, h, opts = {}) {
  const step = Math.max(1, opts.step | 0 || 1);
  const ex = opts.exclude || [];
  const mask = opts.mask || null;
  const lab = [0, 0, 0];
  const n0 = Math.ceil(w / step) * Math.ceil(h / step);
  const Ls = new Float32Array(n0), As = new Float32Array(n0), Bs = new Float32Array(n0), Ys = new Uint16Array(n0), Xs = new Uint16Array(n0);
  let n = 0, clip = 0, crush = 0, sumC = 0, gold = 0, vio = 0, svio = 0;
  const bands = Array.from({ length: 5 }, () => ({ n: 0, L: 0, a: 0, b: 0, L2: 0, dx: 0, dxn: 0 }));
  const D = opts.depth || null, dW = opts.depthW || w, dH = opts.depthH || h;
  const BINS = [15, 60, 200, 600, Infinity];
  const dbins = D ? BINS.map((hi, i) => ({ lo: i ? BINS[i - 1] : 0, hi, n: 0, L: 0, a: 0, b: 0, vio: 0 })) : null;
  let prevL = NaN, prevRowY = -1;
  for (let y = 0; y < h; y += step) {
    const band = bands[Math.min(4, Math.floor(y * 5 / h))];
    prevL = NaN; prevRowY = y;
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      let skip = mask ? mask[y * w + x] === 0 : false;
      if (!skip) for (let k = 0; k < ex.length; k++) { const e = ex[k]; if (x >= e[0] && x < e[2] && y >= e[1] && y < e[3]) { skip = true; break; } }
      if (skip) { prevL = NaN; continue; }
      const R = rgba[i], G = rgba[i + 1], B = rgba[i + 2];
      srgb8ToLab(R, G, B, lab);
      const L = lab[0], a = lab[1], b = lab[2];
      Ls[n] = L; As[n] = a; Bs[n] = b; Ys[n] = y; Xs[n] = x; n++;
      const mx = R > G ? (R > B ? R : B) : (G > B ? G : B);
      if (mx >= 254) clip++;
      if (mx <= 6) crush++;
      const C = Math.hypot(a, b);
      sumC += C;
      const hh = hueDeg(a, b);
      if (C >= 25 && L >= 30 && hh >= 50 && hh <= 95) gold++;
      if (C >= 10 && hh >= 280 && hh <= 345) { vio++; if (C >= 25) svio++; }
      band.n++; band.L += L; band.a += a; band.b += b; band.L2 += L * L;
      if (prevL === prevL) { band.dx += Math.abs(L - prevL); band.dxn++; }
      prevL = L;
      if (dbins) {
        const dx = Math.min(dW - 1, Math.floor(x * dW / w)), dy = Math.min(dH - 1, Math.floor(y * dH / h));
        const d = D[dy * dW + dx];
        for (let k = 0; k < dbins.length; k++) {
          if (d >= dbins[k].lo && d < dbins[k].hi) {
            const q = dbins[k]; q.n++; q.L += L; q.a += a; q.b += b;
            if (C >= 10 && hh >= 280 && hh <= 345) q.vio++;
            break;
          }
        }
      }
    }
  }
  if (!n) return { n: 0 };
  const idx = Array.from({ length: n }, (_, k) => k).sort((p, q) => Ls[p] - Ls[q]);
  const pct = (p) => Ls[idx[Math.min(n - 1, Math.max(0, Math.round(p / 100 * (n - 1))))]];
  const P = { p1: pct(1), p5: pct(5), p20: pct(20), p40: pct(40), p50: pct(50), p60: pct(60), p80: pct(80), p90: pct(90), p95: pct(95), p99: pct(99) };
  const group = (lo, hi) => {
    let c = 0, L = 0, a = 0, b = 0, C = 0;
    for (let k = 0; k < n; k++) { const v = Ls[k]; if (v >= lo && v <= hi) { c++; L += Ls[k]; a += As[k]; b += Bs[k]; C += Math.hypot(As[k], Bs[k]); } }
    if (!c) return { n: 0 };
    a /= c; b /= c;
    return { n: c, L: r1(L / c), a: r1(a), b: r1(b), hue: r1(hueDeg(a, b)), chroma: r1(Math.hypot(a, b)), meanC: r1(C / c) };
  };
  const lo20 = group(-1, P.p20), mid = group(P.p40, P.p60), hi10 = group(P.p90, 101);
  const outBands = bands.map((q) => {
    if (!q.n) return { n: 0 };
    const L = q.L / q.n;
    return { L: r1(L), a: r1(q.a / q.n), b: r1(q.b / q.n), stdL: r1(Math.sqrt(Math.max(0, q.L2 / q.n - L * L))), dLdx: r2(q.dxn ? q.dx / q.dxn : 0) };
  });
  const pc = (v) => r2(100 * v / n);
  const out = {
    n,
    L: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, r1(v)])),
    spread: r1(P.p95 - P.p5),
    chroma: r1(sumC / n),
    lo20, mid, hi10,
    clip: pc(clip), crush: pc(crush),
    gold: pc(gold), violet: pc(vio), strongViolet: pc(svio),
    bands: outBands,
    topBottom: outBands[4].L ? r2(outBands[0].L / outBands[4].L) : null,
  };
  if (dbins) out.depth = dbins.map((q) => (q.n ? { lo: q.lo, hi: q.hi === Infinity ? null : q.hi, n: q.n, L: r1(q.L / q.n), a: r1(q.a / q.n), b: r1(q.b / q.n), violet: r2(100 * q.vio / q.n) } : { lo: q.lo, hi: q.hi === Infinity ? null : q.hi, n: 0 }));
  return out;
}

/**
 * <= k colour swatches (L*a*b*, share %) by a deterministic k-means in L*a*b*
 * (seeded from L* quantiles, 12 iterations): the only per-panel colour record
 * refs.json may hold (R66 a: numbers, never pixels).
 */
export function swatches(rgba, w, h, k = 8, opts = {}) {
  const step = Math.max(1, opts.step | 0 || 2);
  const ex = opts.exclude || [];
  const pts = [];
  const lab = [0, 0, 0];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      let skip = false;
      for (const e of ex) if (x >= e[0] && x < e[2] && y >= e[1] && y < e[3]) { skip = true; break; }
      if (skip) continue;
      const i = (y * w + x) * 4;
      srgb8ToLab(rgba[i], rgba[i + 1], rgba[i + 2], lab);
      pts.push([lab[0], lab[1], lab[2]]);
    }
  }
  if (!pts.length) return [];
  pts.sort((p, q) => p[0] - q[0]);
  let cent = Array.from({ length: k }, (_, j) => pts[Math.floor((j + 0.5) / k * (pts.length - 1))].slice());
  const asg = new Int32Array(pts.length);
  for (let it = 0; it < 12; it++) {
    for (let p = 0; p < pts.length; p++) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const c = cent[j]; const d = (pts[p][0] - c[0]) ** 2 + (pts[p][1] - c[1]) ** 2 + (pts[p][2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } }
      asg[p] = best;
    }
    const acc = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let p = 0; p < pts.length; p++) { const a = acc[asg[p]]; a[0] += pts[p][0]; a[1] += pts[p][1]; a[2] += pts[p][2]; a[3]++; }
    cent = cent.map((c, j) => (acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c));
  }
  const share = new Array(k).fill(0);
  for (let p = 0; p < pts.length; p++) share[asg[p]]++;
  return cent.map((c, j) => ({ L: r1(c[0]), a: r1(c[1]), b: r1(c[2]), share: r1(100 * share[j] / pts.length) }))
    .filter((s) => s.share > 0).sort((p, q) => q.share - p.share);
}
