/**
 * A small deterministic DSP kit for the slice's cue recipes (BUILD M1.6k, TECH §14 "our own synthesis recipes").
 *
 * Plain JS over Float32Array at one sample rate: no Web Audio, no DOM, no Node built-ins, so the SAME code renders
 * the bank offline in Node (tools/gates/audio/build-bank.mjs) and the measurement rows (tools/gates/audio/*) read
 * the same numbers the shipped files were made from. Every random draw comes from a seeded generator: the same
 * seed gives the same samples, so re-running the builder reproduces the bank bit for bit before encoding.
 */
export const SR = 48000;
const TAU = Math.PI * 2;

/** mulberry32: a seeded uniform generator in [0, 1). */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const len = (sec) => Math.max(1, Math.round(sec * SR));
export const buf = (sec) => new Float32Array(len(sec));
export const dbToGain = (db) => Math.pow(10, db / 20);

/** White noise. */
export function white(sec, r) {
  const o = buf(sec);
  for (let i = 0; i < o.length; i++) o[i] = r() * 2 - 1;
  return o;
}

/** Pink-ish noise (Paul Kellet's economy filter). */
export function pink(sec, r) {
  const o = buf(sec);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < o.length; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    o[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return o;
}

/** Brown noise (leaky integrator of white). */
export function brown(sec, r) {
  const o = buf(sec);
  let y = 0;
  for (let i = 0; i < o.length; i++) {
    y = 0.996 * y + (r() * 2 - 1) * 0.06;
    o[i] = y;
  }
  return o;
}

/**
 * RBJ biquad, in place. `f` may be a number or a function of the normalised position 0..1 (re-solved every 32
 * samples), so a sweep costs one filter. type: lp | hp | bp | peak | notch | lowshelf | highshelf.
 */
export function biquad(x, type, f, q = 0.707, gainDb = 0) {
  const n = x.length;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  const solve = (fc) => {
    const w0 = TAU * Math.min(Math.max(fc, 10), SR * 0.49) / SR;
    const cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let B0, B1, B2, A0, A1, A2;
    switch (type) {
      case 'hp': B0 = (1 + cw) / 2; B1 = -(1 + cw); B2 = (1 + cw) / 2; A0 = 1 + al; A1 = -2 * cw; A2 = 1 - al; break;
      case 'bp': B0 = al; B1 = 0; B2 = -al; A0 = 1 + al; A1 = -2 * cw; A2 = 1 - al; break;
      case 'notch': B0 = 1; B1 = -2 * cw; B2 = 1; A0 = 1 + al; A1 = -2 * cw; A2 = 1 - al; break;
      case 'peak': B0 = 1 + al * A; B1 = -2 * cw; B2 = 1 - al * A; A0 = 1 + al / A; A1 = -2 * cw; A2 = 1 - al / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * al;
        B0 = A * ((A + 1) - (A - 1) * cw + s); B1 = 2 * A * ((A - 1) - (A + 1) * cw); B2 = A * ((A + 1) - (A - 1) * cw - s);
        A0 = (A + 1) + (A - 1) * cw + s; A1 = -2 * ((A - 1) + (A + 1) * cw); A2 = (A + 1) + (A - 1) * cw - s; break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * al;
        B0 = A * ((A + 1) + (A - 1) * cw + s); B1 = -2 * A * ((A - 1) + (A + 1) * cw); B2 = A * ((A + 1) + (A - 1) * cw - s);
        A0 = (A + 1) - (A - 1) * cw + s; A1 = 2 * ((A - 1) - (A + 1) * cw); A2 = (A + 1) - (A - 1) * cw - s; break;
      }
      default: B0 = (1 - cw) / 2; B1 = 1 - cw; B2 = (1 - cw) / 2; A0 = 1 + al; A1 = -2 * cw; A2 = 1 - al;
    }
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
  };
  const dyn = typeof f === 'function';
  if (!dyn) solve(f);
  for (let i = 0; i < n; i++) {
    if (dyn && (i & 31) === 0) solve(f(i / n));
    const xi = x[i];
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}
export const lp = (x, f, q) => biquad(x, 'lp', f, q);
export const hp = (x, f, q) => biquad(x, 'hp', f, q);
export const bp = (x, f, q) => biquad(x, 'bp', f, q);

/** Multiply by an envelope function of time in seconds (or of 0..1 when `norm`). */
export function shape(x, fn, norm = false) {
  const n = x.length;
  for (let i = 0; i < n; i++) x[i] *= fn(norm ? i / n : i / SR);
  return x;
}

/** Attack-decay envelope: linear attack `a` s, exponential decay with time constant `d` s. */
export const ad = (a, d) => (t) => (t < a ? t / a : Math.exp(-(t - a) / d));
/** Attack, hold, release (linear), in seconds. */
export const ahr = (a, h, r) => (t) => (t < a ? t / a : t < a + h ? 1 : Math.max(0, 1 - (t - a - h) / r));

/** Sine with a frequency function of time (s) -> Hz; phase-continuous. */
export function sine(sec, freq, amp = 1, phase = 0) {
  const o = buf(sec);
  let ph = phase;
  const dyn = typeof freq === 'function';
  for (let i = 0; i < o.length; i++) {
    const f = dyn ? freq(i / SR) : freq;
    ph += TAU * f / SR;
    o[i] = Math.sin(ph) * amp;
  }
  return o;
}

/** Band-limited-enough saw (sum of `h` harmonics), frequency function of time. */
export function saw(sec, freq, h = 12) {
  const o = buf(sec);
  let ph = 0;
  const dyn = typeof freq === 'function';
  for (let i = 0; i < o.length; i++) {
    const f = dyn ? freq(i / SR) : freq;
    ph += TAU * f / SR;
    let s = 0;
    const H = Math.min(h, Math.floor(SR / 2 / Math.max(f, 1)));
    for (let k = 1; k <= H; k++) s += Math.sin(ph * k) / k;
    o[i] = s * 0.55;
  }
  return o;
}

/**
 * A modal resonator bank: sum of exponentially damped sines. modes: [[freqHz, decaySec, amp], ...].
 * `strike` adds a short noise transient. The voice of bells, chimes, glass, brass and wood.
 */
export function modal(sec, modes, r = null, strike = 0) {
  const o = buf(sec);
  for (const [f, d, a, ph0 = 0] of modes) {
    if (f >= SR * 0.48) continue;
    const w = TAU * f / SR, k = Math.exp(-1 / (d * SR));
    // recursive oscillator: cheap and exact
    let s1 = Math.sin(ph0), s0 = Math.sin(ph0 - w);
    const c = 2 * Math.cos(w);
    let g = a;
    for (let i = 0; i < o.length; i++) {
      const s = c * s1 - s0; s0 = s1; s1 = s;
      o[i] += s * g;
      g *= k;
      if (g < 1e-6) break;
    }
  }
  if (strike && r) {
    const m = Math.min(o.length, len(0.006));
    for (let i = 0; i < m; i++) o[i] += (r() * 2 - 1) * strike * (1 - i / m);
  }
  return o;
}

/** Karplus-Strong plucked string. `bright` 0..1 shapes the pluck; `damp` the loop's loss. */
export function pluck(sec, f, r, { bright = 0.6, damp = 0.996, pickPos = 0.18 } = {}) {
  const o = buf(sec);
  const N = Math.max(2, Math.round(SR / f));
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = r() * 2 - 1;
  // soften the excitation (less bright = more low-passed noise), and comb it for the pick position
  let z = 0;
  for (let i = 0; i < N; i++) { z += Math.max(0.05, bright) * (line[i] - z); line[i] = z; }
  const P = Math.max(1, Math.round(N * pickPos));
  const ex = line.slice();
  for (let i = 0; i < N; i++) line[i] = ex[i] - ex[(i + P) % N] * 0.9;
  let idx = 0, prev = 0;
  for (let i = 0; i < o.length; i++) {
    const cur = line[idx];
    const nx = line[(idx + 1) % N];
    const y = damp * 0.5 * (cur + nx);
    o[i] = cur;
    line[idx] = y * 0.999 + prev * 0.001;
    prev = y;
    idx = (idx + 1) % N;
  }
  return o;
}

/** Add `src` into `dst` at time `at` (s) with gain `g`. Returns dst. */
export function mixIn(dst, src, at = 0, g = 1) {
  const o = Math.round(at * SR);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * g;
  return dst;
}

export function gain(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }

export function peak(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }

/** Scale to a peak in dBFS. */
export function normalize(x, db = -1) {
  const p = peak(x);
  return p > 0 ? gain(x, dbToGain(db) / p) : x;
}

/** Fade the first `a` and last `b` seconds (raised cosine). */
export function fades(x, a = 0.002, b = 0.01) {
  const na = Math.min(x.length, len(a)), nb = Math.min(x.length, len(b));
  for (let i = 0; i < na; i++) x[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / na);
  for (let i = 0; i < nb; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / nb);
  return x;
}

/**
 * Make a seamless loop of `sec` seconds from a longer render `x` (needs sec + xf seconds): the tail past `sec` is
 * crossfaded (equal power) over the head, so sample sec wraps onto sample 0 with no seam.
 */
export function loopify(x, sec, xf = 0.5) {
  const n = len(sec), m = len(xf);
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = x[i];
  for (let i = 0; i < m && n + i < x.length; i++) {
    const k = i / m;
    o[i] = x[i] * Math.sin(k * Math.PI / 2) + x[n + i] * Math.cos(k * Math.PI / 2);
  }
  return o;
}

/** Soft clip (tanh) with drive. */
export function sat(x, drive = 1.5) {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}

/**
 * Grains: `count` short filtered clicks scattered over `span` s with density shaped by `env(t0..1)`; each grain is
 * an impulse through a decaying resonance near `f` (+- spread). Salt crust, sand, pebbles, crackle and rattle.
 */
export function grains(sec, r, { count = 40, span = 0.1, at = 0, f = 3000, spread = 0.5, decay = 0.003, amp = 0.5, env = null } = {}) {
  const o = buf(sec);
  for (let g = 0; g < count; g++) {
    let u = r();
    if (env) { for (let tries = 0; tries < 6 && r() > env(u); tries++) u = r(); }
    const t0 = at + u * span;
    const fr = f * (1 + (r() * 2 - 1) * spread);
    const a = amp * (0.3 + 0.7 * r());
    const w = TAU * fr / SR, k = Math.exp(-1 / (decay * SR * (0.6 + 0.8 * r())));
    const start = Math.round(t0 * SR);
    let s1 = 0, s0 = 0, gg = a;
    const c = 2 * Math.cos(w);
    s1 = Math.sin(w);
    for (let i = start; i < o.length; i++) {
      const s = c * s1 - s0; s0 = s1; s1 = s;
      o[i] += s * gg;
      gg *= k;
      if (gg < 1e-5) break;
    }
  }
  return o;
}

/** Schroeder reverb tail (4 combs, 2 allpasses), mono in, mono out, mixed `wet`. */
export function verb(x, { size = 1, damp = 0.4, wet = 0.25, tail = 1.0 } = {}) {
  const extra = len(tail);
  const o = new Float32Array(x.length + extra);
  o.set(x);
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round(d * size * SR / 44100));
  const out = new Float32Array(o.length);
  for (const d of combs) {
    const line = new Float32Array(d); let idx = 0, lpz = 0;
    const fb = 0.84;
    for (let i = 0; i < o.length; i++) {
      const y = line[idx];
      lpz = y * (1 - damp) + lpz * damp;
      line[idx] = o[i] + lpz * fb;
      idx = (idx + 1) % d;
      out[i] += y * 0.25;
    }
  }
  for (const d of [225, 556].map((v) => Math.round(v * SR / 44100))) {
    const line = new Float32Array(d); let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const bv = line[idx];
      const y = -out[i] * 0.5 + bv;
      line[idx] = out[i] + bv * 0.5;
      idx = (idx + 1) % d;
      out[i] = y;
    }
  }
  for (let i = 0; i < o.length; i++) o[i] = o[i] * (1 - wet * 0.5) + out[i] * wet;
  return o;
}

/** Concatenate / sum helpers. */
export function sum(sec, ...parts) {
  const o = buf(sec);
  for (const [x, at = 0, g = 1] of parts) mixIn(o, x, at, g);
  return o;
}

/** A decorrelated stereo pair from one mono render function `fn(seed) -> Float32Array`. */
export function stereo(fn, seed) { return [fn(seed), fn(seed ^ 0x5bd1e995)]; }

/** Slow random modulation curve (smoothed noise) of `sec` s sampled at 100 Hz, returned as t(s) -> 0..1. */
export function wander(sec, r, rate = 0.3) {
  const n = Math.ceil(sec * 100) + 2;
  const v = new Float32Array(n);
  let y = r(), target = r(), k = 0;
  const step = Math.max(1, Math.round(100 / Math.max(rate, 0.01)));
  for (let i = 0; i < n; i++) {
    if (k-- <= 0) { target = r(); k = step; }
    y += (target - y) * (1 / step) * 2.2;
    v[i] = y;
  }
  return (t) => { const p = Math.min(n - 1, Math.max(0, t * 100)); const i = p | 0, f = p - i; return v[i] + ((v[i + 1] ?? v[i]) - v[i]) * f; };
}
