/**
 * Loudness and true peak, offline (ITU-R BS.1770-4 / EBU R128), for the audio lane's rows (BUILD M1.6k: "the slice
 * walk at -18 LUFS +- 2, true peak <= -1 dB"). Plain JS over Float32Array channels at 48 kHz.
 *
 *   integratedLufs([L, R])   gated integrated loudness (400 ms blocks, 75 % overlap, -70 LUFS absolute gate,
 *                            -10 LU relative gate), LUFS
 *   shortTermMax([L, R])     the loudest 3 s window, LUFS
 *   truePeakDb([L, R])       4x oversampled peak (windowed-sinc polyphase interpolator), dBTP
 *   bandLevels(x, t0, t1)    octave-band levels (dB) of a mono span, for the audibility rows
 */
const SR = 48000;

/** K-weighting at 48 kHz (BS.1770-4 table 1 and 2). */
function kWeight(x) {
  const y = new Float64Array(x.length);
  // stage 1: high shelf
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const b0 = 1.53512485958697, b1 = -2.69169618940638, b2 = 1.19839281085285, a1 = -1.69065929318241, a2 = 0.73248077421585;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  // stage 2: RLB high-pass
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  const c1 = -1.99004745483398, c2 = 0.99007225036621;
  for (let i = 0; i < y.length; i++) {
    const xi = y[i];
    const v = xi - 2 * x1 + x2 - c1 * y1 - c2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Mean-square per block of `blockS` seconds hopping `hopS`, summed over channels. */
function blockPowers(chs, blockS, hopS) {
  const k = chs.map(kWeight);
  const n = k[0].length;
  const B = Math.round(blockS * SR), H = Math.round(hopS * SR);
  // prefix sums of squares per channel
  const pref = k.map((y) => { const p = new Float64Array(y.length + 1); for (let i = 0; i < y.length; i++) p[i + 1] = p[i] + y[i] * y[i]; return p; });
  const out = [];
  for (let s = 0; s + B <= n; s += H) {
    let z = 0;
    for (const p of pref) z += (p[s + B] - p[s]) / B;
    out.push(z);
  }
  return out;
}

const L = (z) => -0.691 + 10 * Math.log10(Math.max(z, 1e-20));

export function integratedLufs(chs) {
  const z = blockPowers(chs, 0.4, 0.1);
  const abs = z.filter((v) => L(v) > -70);
  if (!abs.length) return -Infinity;
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = L(mean) - 10;
  const g = abs.filter((v) => L(v) > rel);
  if (!g.length) return -Infinity;
  return L(g.reduce((a, b) => a + b, 0) / g.length);
}

export function shortTermMax(chs) {
  const z = blockPowers(chs, 3, 1);
  return z.length ? Math.max(...z.map(L)) : -Infinity;
}

/** Short-term loudness series (3 s windows every `hop` s), LUFS. */
export function shortTermSeries(chs, hop = 1) {
  return blockPowers(chs, 3, hop).map(L);
}

let FIR = null;
function fir() {
  if (FIR) return FIR;
  const taps = 48, phases = 4, N = taps * phases;
  const h = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = (i - (N - 1) / 2) / phases;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
    h[i] = sinc * w;
  }
  FIR = { h, taps, phases };
  return FIR;
}

export function truePeakDb(chs) {
  const { h, taps, phases } = fir();
  let pk = 0;
  for (const x of chs) {
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
    for (let i = taps; i < x.length; i++) {
      for (let p = 1; p < phases; p++) {
        let s = 0;
        for (let k = 0; k < taps; k++) s += x[i - k] * h[k * phases + p];
        const a = Math.abs(s);
        if (a > pk) pk = a;
      }
    }
  }
  return 20 * Math.log10(Math.max(pk, 1e-12));
}

/** Sample peak, dBFS. */
export function samplePeakDb(chs) {
  let pk = 0;
  for (const x of chs) for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
  return 20 * Math.log10(Math.max(pk, 1e-12));
}

/** Octave bands (centre Hz) the audibility rows compare in. */
export const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];

/**
 * Octave-band levels of a mono signal over [t0, t1) s: a 4th-order band-pass (two RBJ band-pass sections, Q = 1.41)
 * per band, then the RMS in dB. With `maxWin` (s), the loudest window of that length instead of the mean.
 */
export function bandLevels(x, t0 = 0, t1 = null, maxWin = 0) {
  const a = Math.max(0, Math.round(t0 * SR)), b = Math.min(x.length, t1 == null ? x.length : Math.round(t1 * SR));
  const seg = x.subarray(a, b);
  const out = {};
  for (const f of BANDS) {
    const y = Float64Array.from(seg);
    for (let pass = 0; pass < 2; pass++) rbjBp(y, f, 1.41);
    if (maxWin > 0) {
      const W = Math.max(1, Math.round(maxWin * SR));
      let acc = 0, best = 0;
      for (let i = 0; i < y.length; i++) {
        acc += y[i] * y[i];
        if (i >= W) acc -= y[i - W] * y[i - W];
        if (i >= W - 1 && acc > best) best = acc;
      }
      out[f] = 10 * Math.log10(Math.max(best / Math.min(W, y.length), 1e-20));
    } else {
      let s = 0; for (let i = 0; i < y.length; i++) s += y[i] * y[i];
      out[f] = 10 * Math.log10(Math.max(s / Math.max(1, y.length), 1e-20));
    }
  }
  return out;
}

function rbjBp(y, f, q) {
  const w0 = 2 * Math.PI * f / SR, al = Math.sin(w0) / (2 * q), cw = Math.cos(w0), A0 = 1 + al;
  const b0 = al / A0, b2 = -al / A0, a1 = -2 * cw / A0, a2 = (1 - al) / A0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < y.length; i++) {
    const xi = y[i];
    const v = b0 * xi + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = v; y[i] = v;
  }
}
