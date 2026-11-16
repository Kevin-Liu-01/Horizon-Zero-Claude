/**
 * THE SLICE'S CUE RECIPES (BUILD M1.6k; TECH §14 sourcing 1: "our own synthesis recipes ... deterministic, Node, no
 * licence burden"). Every cue of the slice is made here from `./dsp.js`: no recording, no third-party sample.
 *
 * A recipe is `(seed) => Float32Array` (mono, a point source) or `(seed) => [L, R]` (stereo: beds and music). The
 * builder (tools/gates/audio/build-bank.mjs) calls each recipe once per variant with a fixed seed, normalises it as
 * the cue table says (src/audio/slice/cues.js) and encodes Ogg Vorbis into public/audio/. The Instruments' voices are
 * built only from chimes, ratchets, escapements, whine, clinks and rattles (BUILD M3.8's rule, kept from the start):
 * no roar, no growl, no choir, no drums.
 */
import {
  SR, rng, len, buf, white, pink, brown, biquad, lp, hp, bp, shape, ad, ahr, sine, saw, modal, pluck, mixIn, gain,
  normalize, fades, loopify, sat, grains, verb, sum, wander,
} from './dsp.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, k) => a + (b - a) * k;

/* ------------------------------------------------------------------ helpers */

/** Foley crest control: a soft clip after peak-normalising, so a transient cue carries more body for its peak. */
function firm(x, drive = 2.2) {
  let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  if (pk > 0) for (let i = 0; i < x.length; i++) x[i] /= pk;
  return sat(x, drive);
}

/** A body thump: a low sine drop plus low-passed noise. */
function thump(sec, r, f0 = 90, f1 = 55, d = 0.05, amp = 1) {
  const s = sine(sec, (t) => lerp(f0, f1, Math.min(1, t / 0.08)), amp);
  shape(s, ad(0.003, d));
  const n = lp(white(sec, r), 260, 0.8);
  shape(n, ad(0.002, d * 0.6));
  return mixIn(s, n, 0, amp * 0.8);
}

/** Filtered noise burst. */
function burst(sec, r, type, f, q, env, amp = 1, colour = 'white') {
  const n = colour === 'pink' ? pink(sec, r) : colour === 'brown' ? brown(sec, r) : white(sec, r);
  biquad(n, type, f, q);
  shape(n, env);
  return gain(n, amp);
}

/** A whoosh: band noise whose centre follows `fn(0..1)` with a bell envelope. */
function whoosh(sec, r, fn, q = 1.2, amp = 1) {
  const n = pink(sec, r);
  biquad(n, 'bp', fn, q);
  biquad(n, 'bp', fn, q * 0.8);
  shape(n, (k) => Math.pow(Math.sin(Math.PI * Math.min(1, k)), 1.6), true);
  return gain(n, amp * 6);
}

/** Inharmonic metal: partial ratios typical of a struck plate or bar. */
function metal(sec, r, f, { decay = 0.4, bright = 1, ratios = [1, 2.32, 4.25, 6.63, 9.38], strike = 0.3 } = {}) {
  const modes = ratios.map((k, i) => [f * k * (1 + (r() - 0.5) * 0.01), decay / (1 + i * 0.6), Math.pow(0.62, i) * (i ? bright : 1)]);
  return modal(sec, modes, r, strike);
}

/** A wood knock: two or three low modes, fast decay. */
function wood(sec, r, f = 600, decay = 0.05) {
  return modal(sec, [[f, decay, 1], [f * 2.76, decay * 0.5, 0.5], [f * 5.4, decay * 0.3, 0.22]], r, 0.25);
}

/** A bell: hum, prime, tierce, quint, nominal (a church/guild bell's partials). */
function bell(sec, r, f, decay = 3) {
  const P = [[0.5, 1.1, 0.5], [1, 1, 1], [1.19, 0.75, 0.6], [1.5, 0.6, 0.45], [2, 0.5, 0.9], [2.51, 0.35, 0.5], [3.0, 0.25, 0.45], [4.07, 0.18, 0.35], [5.2, 0.12, 0.2]];
  return modal(sec, P.map(([k, d, a]) => [f * k * (1 + (r() - 0.5) * 0.004), decay * d, a]), r, 0.15);
}

/** Leaves and cane: dense high grains + air hiss, driven by an intensity curve `I(t s) -> 0..1`. */
function rustle(sec, r, I, { f = 4200, density = 900, amp = 0.5 } = {}) {
  const o = buf(sec);
  const n = len(sec);
  // air
  const air = pink(sec, r); hp(air, 900, 0.6); lp(air, 7000, 0.6);
  for (let i = 0; i < n; i++) o[i] += air[i] * 0.55 * I(i / SR);
  // clatter: Poisson grains whose rate follows I
  const g = grains(sec, r, {
    count: Math.round(density * sec), span: sec, f, spread: 0.55, decay: 0.0025, amp: amp,
    env: (u) => I(u * sec),
  });
  for (let i = 0; i < n; i++) o[i] += g[i] * (0.25 + 0.75 * I(i / SR));
  return o;
}

/** Breathy whistle tone: sine + a little 2nd harmonic + noise band at the pitch, with vibrato. */
function whistleNote(sec, r, f, { vib = 5.6, depth = 0.012, glideFrom = null, glide = 0.06, amp = 1 } = {}) {
  const fr = (t) => {
    const base = glideFrom ? lerp(glideFrom, f, Math.min(1, t / glide)) : f;
    const v = 1 + Math.sin(TAU * vib * t) * depth * Math.min(1, t / 0.25);
    return base * v;
  };
  const o = sine(sec, fr, 1);
  const h2 = sine(sec, (t) => fr(t) * 2, 0.06);
  mixIn(o, h2);
  const br = white(sec, r); biquad(br, 'bp', (k) => fr(k * sec), 12); gain(br, 0.35);
  mixIn(o, br);
  shape(o, (t) => Math.min(1, t / 0.035) * (t > sec - 0.06 ? Math.max(0, (sec - t) / 0.06) : 1));
  return gain(o, amp);
}

/* ------------------------------------------------------------------ footsteps (Brea, 25 m) */

/** Shared heel-toe frame: a thump, then a surface layer from `tex(sec, r, at)`. */
function step(seed, tex, { sec = 0.42, thumpAmp = 0.55, f0 = 95, toe = 0.07 } = {}) {
  const r = rng(seed);
  const o = buf(sec);
  mixIn(o, thump(sec, r, f0, 58, 0.04, thumpAmp), 0);
  mixIn(o, tex(sec, r, 0.004), 0, 1);
  mixIn(o, tex(sec, r, toe + r() * 0.02), 0, 0.55);   // the toe's lighter roll
  return fades(firm(o, 2.6), 0.001, 0.03);
}

export const FOOT = {
  // salt crust (the Pans): brittle snaps over a fine crunch
  gravel: (s) => step(s, (sec, r, at) => {
    const g = grains(sec, r, { count: 70, span: 0.07, at, f: 3800, spread: 0.6, decay: 0.0018, amp: 0.55 });
    const snap = grains(sec, r, { count: 6, span: 0.02, at, f: 2200, spread: 0.3, decay: 0.004, amp: 0.9 });
    return mixIn(g, snap);
  }),
  // black sand: a soft hiss of grains, no snap
  dirt: (s) => step(s, (sec, r, at) => {
    const n = burst(sec, r, 'bp', 2600, 0.6, (t) => (t < at ? 0 : ad(0.012, 0.035)(t - at)), 0.55, 'pink');
    return mixIn(n, grains(sec, r, { count: 50, span: 0.06, at, f: 5200, spread: 0.5, decay: 0.0012, amp: 0.18 }));
  }, { thumpAmp: 0.45 }),
  // basalt: a hard tap with a stony ring
  rock: (s) => step(s, (sec, r, at) => {
    const m = modal(sec, [[1450 + r() * 300, 0.04, 0.6], [2900 + r() * 400, 0.03, 0.45], [4700 + r() * 600, 0.02, 0.3], [620, 0.05, 0.4]], r, 0.6);
    const o = buf(sec); mixIn(o, m, at);
    return mixIn(o, grains(sec, r, { count: 24, span: 0.05, at, f: 5200, spread: 0.4, decay: 0.002, amp: 0.35 }));
  }, { thumpAmp: 0.6, f0: 120 }),
  // shallows: a splash with bubbles
  water: (s) => step(s, (sec, r, at) => {
    const n = burst(sec, r, 'bp', 2400, 0.45, (t) => (t < at ? 0 : ad(0.012, 0.11)(t - at)), 1.0, 'white');
    for (let b = 0; b < 7; b++) {
      const t0 = at + 0.02 + r() * 0.15, f = 500 + r() * 900;
      const bub = sine(0.08, (t) => f * (1 + t * 9), 0.12 * r());
      shape(bub, ad(0.002, 0.018));
      mixIn(n, bub, t0);
    }
    return n;
  }, { thumpAmp: 0.3, sec: 0.5 }),
  // brine silt: a wet suck that falls in pitch
  silt: (s) => step(s, (sec, r, at) => {
    const n = pink(sec, r);
    biquad(n, 'bp', (k) => lerp(1600, 380, Math.min(1, k * 3)), 3);
    shape(n, (t) => (t < at ? 0 : ad(0.02, 0.09)(t - at)));
    const sq = grains(sec, r, { count: 14, span: 0.08, at, f: 2600, spread: 0.5, decay: 0.006, amp: 0.25 });
    return mixIn(gain(n, 2.6), sq);
  }, { thumpAmp: 0.5, f0: 80 }),
  // shingle: pebbles clack and roll
  cobble: (s) => step(s, (sec, r, at) => {
    const o = buf(sec);
    for (let k = 0; k < 9; k++) mixIn(o, modal(0.08, [[2200 + r() * 1800, 0.014, 0.5], [4800 + r() * 1500, 0.009, 0.3]], r, 0.2), at + r() * 0.08);
    return o;
  }, { thumpAmp: 0.5 }),
  // meadow grass: a swish
  grass: (s) => step(s, (sec, r, at) => burst(sec, r, 'hp', 2400, 0.6, (t) => (t < at ? 0 : ad(0.03, 0.06)(t - at)), 0.6, 'pink'), { thumpAmp: 0.4 }),
};

/* ------------------------------------------------------------------ Brea's cloth and gear (Brea bus, 10 m) */

export const CLOTH = {
  /** The wrap and leggings brush: a short soft rub. */
  brush: (seed) => {
    const r = rng(seed);
    const sec = 0.32;
    const n = pink(sec, r); biquad(n, 'bp', 900 + r() * 500, 0.7); biquad(n, 'hp', 300, 0.7);
    const w = wander(sec, r, 30);
    shape(n, (t) => Math.sin(Math.PI * Math.min(1, t / sec)) * (0.6 + 0.4 * w(t)));
    return fades(firm(n, 1.8));
  },
  /** The wrap's tail flaps on a sprint, a hop or a landing. */
  flap: (seed) => {
    const r = rng(seed);
    const sec = 0.45;
    const n = pink(sec, r); biquad(n, 'bp', 1300 + r() * 500, 0.7);
    const rate = 14 + r() * 8;
    shape(n, (t) => Math.pow(Math.max(0, Math.sin(TAU * rate * t)), 3) * Math.exp(-t / 0.14) * Math.min(1, t / 0.01));
    return fades(gain(n, 5));
  },
};

export const GEAR = {
  /** The quiver: shafts clicking against each other. */
  light: (seed) => {
    const r = rng(seed);
    const sec = 0.3;
    const o = buf(sec);
    for (let k = 0; k < 6; k++) mixIn(o, wood(0.08, r, 1700 + r() * 1300, 0.012), r() * 0.12, 0.25 + r() * 0.25);
    return fades(firm(o, 2.0));
  },
  /** The lance haft knocks the kit: wood and a strap creak. */
  heavy: (seed) => {
    const r = rng(seed);
    const sec = 0.4;
    const o = wood(sec, r, 420 + r() * 80, 0.06);
    const strap = burst(sec, r, 'bp', 700, 4, ad(0.03, 0.09), 0.5, 'pink');
    return fades(mixIn(o, strap, 0.02));
  },
};

/* ------------------------------------------------------------------ the Making (Brea bus, 8 m) */

export const MAKE = {
  /**
   * Quick-make (TECH §14 cue list; BIBLE §9 "hold a quick slot for 1.2 s to quick-make a bundle"): a bundle of six
   * done: two cane shafts knocked square against each other, the binding twine pulled tight round them, and the
   * fletching combed straight with a thumb. Wood, twine and feather only.
   */
  quick: (seed) => {
    const r = rng(seed);
    const sec = 0.62;
    const o = buf(sec);
    mixIn(o, wood(0.12, r, 760 + r() * 60, 0.03), 0, 0.9);
    mixIn(o, wood(0.12, r, 690 + r() * 60, 0.028), 0.075, 0.75);
    // the twine: a short rasp with a fast flutter, pulled tight (rising centre)
    const tw = pink(0.2, r);
    biquad(tw, 'bp', (k) => lerp(900, 1600, k), 2.2);
    shape(tw, (t) => Math.pow(Math.max(0, Math.sin(TAU * 38 * t)), 2) * Math.sin(Math.PI * Math.min(1, t / 0.2)));
    mixIn(o, gain(tw, 3.2), 0.2);
    // the fletching combed: a soft rising zip of feather barbs
    const zip = grains(0.16, r, { count: 70, span: 0.14, f: 5200, spread: 0.4, decay: 0.0012, amp: 0.4, env: (u) => Math.sin(Math.PI * u) });
    mixIn(o, zip, 0.43);
    return fades(firm(o, 2.0));
  },
};

/* ------------------------------------------------------------------ the bow (Brea bus; hit/miss at the target) */

export const BOW = {
  nock: (seed) => {
    const r = rng(seed);
    const o = wood(0.18, r, 1900 + r() * 200, 0.015);
    return fades(mixIn(o, burst(0.18, r, 'hp', 3000, 0.7, ad(0.001, 0.01), 0.3), 0.012));
  },
  /** The draw: the string stretches over the limbs (rising rub + wood flex). */
  draw: (seed) => {
    const r = rng(seed);
    const sec = 0.85;
    const n = pink(sec, r);
    biquad(n, 'bp', (k) => lerp(500, 1400, k), 2.2);
    shape(n, (k) => Math.min(1, k * 5) * (1 - Math.pow(k, 6)) * (0.7 + 0.3 * k), true);
    const flex = creakTrain(sec, r, (k) => lerp(38, 70, k), 420, 0.4);
    return fades(mixIn(gain(n, 2.2), flex, 0, 0.6), 0.01, 0.08);
  },
  /** The hold: a loopable creak of the limbs under load (stick-slip). */
  creak: (seed) => {
    const r = rng(seed);
    const sec = 2.0;
    const x = creakTrain(sec + 0.3, r, (k) => 52 + 6 * Math.sin(k * 9), 820, 1.0);
    return loopify(x, sec, 0.3);
  },
  /** The loose: a string thrum, the arrow's hiss leaving, a limb slap. */
  loose: (seed) => {
    const r = rng(seed);
    const sec = 0.7;
    const s = pluck(sec, 98 + r() * 10, r, { bright: 0.5, damp: 0.985 });
    shape(s, ad(0.001, 0.12));
    const hiss = whoosh(0.25, r, (k) => lerp(3800, 1800, k), 1.5, 0.5);
    const slap = wood(sec, r, 520, 0.03);
    const o = buf(sec);
    mixIn(o, s, 0, 0.9); mixIn(o, hiss, 0.005, 1); mixIn(o, slap, 0, 0.6);
    return fades(o, 0.0005, 0.05);
  },
  flyby: (seed) => fades(whoosh(0.5, rng(seed), (k) => lerp(3200, 900, k), 2.2, 0.8)),
  /** Into an Instrument: a sharp tick, enamel and brass ringing, the shaft's thunk. */
  hit: (seed) => {
    const r = rng(seed);
    const sec = 0.7;
    const m = metal(sec, r, 1150 + r() * 250, { decay: 0.35, bright: 0.8 });
    const o = buf(sec);
    mixIn(o, m, 0, 0.8);
    mixIn(o, wood(sec, r, 300, 0.05), 0, 0.6);
    mixIn(o, burst(sec, r, 'hp', 4000, 0.7, ad(0.0005, 0.006), 0.8), 0);
    return fades(firm(o, 2.2), 0.0005, 0.08);
  },
  /** Into a weak point: the lens or vial glass cracks bright over the strike. */
  hitWeak: (seed) => {
    const r = rng(seed);
    const sec = 0.9;
    const o = buf(sec);
    mixIn(o, metal(sec, r, 1300, { decay: 0.3, bright: 0.6 }), 0, 0.6);
    mixIn(o, glass(sec, r, 3100 + r() * 400), 0.004, 0.9);
    mixIn(o, grains(sec, r, { count: 30, span: 0.05, at: 0.004, f: 6000, spread: 0.4, decay: 0.002, amp: 0.5 }), 0, 1);
    return fades(o, 0.0005, 0.1);
  },
  /** Into salt or sand: a soft thud and a spray of grains. */
  miss: (seed) => {
    const r = rng(seed);
    const sec = 0.4;
    const o = thump(sec, r, 140, 70, 0.03, 0.7);
    mixIn(o, grains(sec, r, { count: 40, span: 0.05, f: 4200, spread: 0.6, decay: 0.0015, amp: 0.45 }), 0.003);
    mixIn(o, wood(sec, r, 380, 0.04), 0, 0.4);   // the shaft quivers
    return fades(firm(o, 2.2));
  },
  empty: (seed) => {
    const r = rng(seed);
    return fades(mixIn(wood(0.15, r, 1500, 0.01), burst(0.15, r, 'bp', 2500, 3, ad(0.001, 0.01), 0.4), 0.01));
  },
};

/** Stick-slip: a train of tiny clicks at `rate(k)` Hz through a wood resonance. */
function creakTrain(sec, r, rate, f = 400, amp = 1) {
  const o = buf(sec);
  const n = len(sec);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += rate(i / n) / SR;
    if (ph >= 1) { ph -= 1; o[i] += (0.5 + r() * 0.5); }
  }
  biquad(o, 'bp', f, 6);
  biquad(o, 'bp', f * 2.1, 4);
  return gain(o, amp * 9);
}

/** Struck glass: high, pure, slightly detuned pairs. */
function glass(sec, r, f) {
  return modal(sec, [[f, 0.4, 1], [f * 1.003, 0.38, 0.6], [f * 2.71, 0.2, 0.4], [f * 5.1, 0.08, 0.2]], r, 0.2);
}

/* ------------------------------------------------------------------ the lance (Brea bus) */

export const LANCE = {
  /** Off her back: the haft slides through the sling, the head ticks free. */
  draw: (seed) => {
    const r = rng(seed);
    const sec = 0.6;
    const slide = pink(sec, r); biquad(slide, 'bp', (k) => lerp(900, 1600, k), 1.6);
    shape(slide, (k) => Math.sin(Math.PI * Math.min(1, k * 1.25)), true);
    const o = gain(slide, 2.4);
    mixIn(o, metal(sec, r, 2100, { decay: 0.12, bright: 0.5 }), 0.46, 0.35);
    mixIn(o, wood(sec, r, 380, 0.05), 0.47, 0.6);
    return fades(o, 0.005, 0.05);
  },
  swing: (seed) => {
    const r = rng(seed);
    return fades(whoosh(0.42, r, (k) => 380 + 1100 * Math.sin(Math.PI * k), 1.4, 1));
  },
  /** On an Instrument: the head bites with a dull clank. */
  hit: (seed) => {
    const r = rng(seed);
    const sec = 0.6;
    const o = thump(sec, r, 110, 60, 0.05, 0.8);
    mixIn(o, metal(sec, r, 680 + r() * 120, { decay: 0.25, bright: 0.7, ratios: [1, 2.41, 3.9, 5.8] }), 0, 0.7);
    mixIn(o, burst(sec, r, 'bp', 2500, 1, ad(0.001, 0.02), 0.6), 0);
    return fades(firm(o, 2.4), 0.0005, 0.06);
  },
  /** The two-hand heavy and the felling blow: more body, a longer ring. */
  heavy: (seed) => {
    const r = rng(seed);
    const sec = 0.9;
    const o = thump(sec, r, 90, 48, 0.09, 1);
    mixIn(o, metal(sec, r, 520 + r() * 80, { decay: 0.45, bright: 0.8, ratios: [1, 2.41, 3.9, 5.8, 8.1] }), 0, 0.8);
    mixIn(o, grains(sec, r, { count: 14, span: 0.25, at: 0.05, f: 2600, spread: 0.6, decay: 0.006, amp: 0.4 }), 0);
    return fades(firm(o, 2.4), 0.0005, 0.1);
  },
  /** Pry: a part torn off — strain, a shear, the clatter of the part landing. */
  pry: (seed) => {
    const r = rng(seed);
    const sec = 1.2;
    const o = creakTrain(sec, r, (k) => lerp(30, 140, k * 1.6), 900, 0.6);
    shape(o, (k) => (k < 0.45 ? k / 0.45 : Math.exp(-(k - 0.45) * 20)), true);
    const shear = burst(sec, r, 'bp', 3200, 1.2, (t) => (t < 0.52 ? 0 : ad(0.002, 0.05)(t - 0.52)), 1.0);
    mixIn(o, shear);
    for (let k = 0; k < 6; k++) mixIn(o, metal(0.4, r, 900 + r() * 1400, { decay: 0.1, bright: 0.6 }), 0.6 + k * 0.07 + r() * 0.04, 0.35);
    return fades(o, 0.005, 0.1);
  },
};

/* ------------------------------------------------------------------ the Alidade */

export const ALIDADE = {
  /** Raised to the eye: brass clicks and a small detent ratchet. */
  raise: (seed) => {
    const r = rng(seed);
    const sec = 0.45;
    const o = buf(sec);
    for (let k = 0; k < 5; k++) mixIn(o, metal(0.06, r, 2600 + r() * 600, { decay: 0.02, bright: 0.4 }), 0.05 + k * 0.035, 0.4);
    mixIn(o, wood(sec, r, 900, 0.02), 0.25, 0.5);
    return fades(o);
  },
  /** A bearing taken: a small two-note brass ring. */
  bearing: (seed) => {
    const r = rng(seed);
    const sec = 1.2;
    const o = buf(sec);
    mixIn(o, metal(sec, r, 1568, { decay: 0.6, bright: 0.3, ratios: [1, 2.0, 3.01] }), 0, 0.5);
    mixIn(o, metal(sec, r, 2093, { decay: 0.7, bright: 0.3, ratios: [1, 2.0, 3.01] }), 0.09, 0.5);
    return fades(o, 0.001, 0.2);
  },
};

/* ------------------------------------------------------------------ lamp chirps (Instruments bus, 40 m) */

/**
 * The survey chirp per lamp state (bible §7.2's grammar heard: shape, then motion). Calm settles DOWN, wary asks UP,
 * hostile stutters fast and bright, dark sputters out. Each is a clean tone (a lamp's relay and its piezo) so it
 * carries 40 m over the wind.
 */
function chirp(sec, r, fn, { amp = 1, buzz = 0, env = null } = {}) {
  const o = sine(sec, fn, 1);
  if (buzz) {
    const h = saw(sec, fn, 6); lp(h, 5000, 0.7);
    mixIn(o, h, 0, buzz);
  }
  shape(o, env || ahr(0.004, sec - 0.03, 0.025));
  return gain(o, amp);
}

export const LAMP = {
  calm: (seed) => {
    const r = rng(seed);
    const sec = 0.34;
    const o = buf(sec);
    mixIn(o, chirp(0.14, r, 1760), 0, 0.8);
    mixIn(o, chirp(0.18, r, 1318.5, { env: ad(0.004, 0.07) }), 0.13, 0.8);
    return fades(o);
  },
  wary: (seed) => {
    const r = rng(seed);
    const sec = 0.42;
    const o = buf(sec);
    mixIn(o, chirp(0.15, r, (t) => lerp(1100, 1650, t / 0.15)), 0, 0.85);
    mixIn(o, chirp(0.17, r, (t) => lerp(1250, 1980, t / 0.17)), 0.2, 0.9);
    return fades(o);
  },
  hostile: (seed) => {
    const r = rng(seed);
    const sec = 0.48;
    const o = buf(sec);
    for (let k = 0; k < 4; k++) mixIn(o, chirp(0.07, r, 2350 + (k % 2) * 140, { buzz: 0.35 }), k * 0.1, 0.95);
    return fades(o);
  },
  dark: (seed) => {
    const r = rng(seed);
    const sec = 0.6;
    const o = chirp(0.5, r, (t) => 1500 * Math.pow(0.18, t / 0.5), { env: (t) => Math.max(0, 1 - t / 0.5) * (Math.sin(t * 190) > -0.2 ? 1 : 0.15) });
    const out = buf(sec); mixIn(out, o, 0, 0.9);
    mixIn(out, grains(sec, r, { count: 18, span: 0.4, f: 3000, spread: 0.6, decay: 0.002, amp: 0.35 }), 0);
    return fades(out);
  },
};

/* ------------------------------------------------------------------ the Plumb */

export const PLUMB = {
  /** Its gyros: a whine with a slow beat and a bearing hiss (loop). */
  gyro: (seed) => {
    const r = rng(seed);
    const sec = 4.0;
    const ext = sec + 0.5;
    const w = wander(ext, r, 0.5);
    const o = sine(ext, (t) => 612 + 6 * w(t), 0.6);
    mixIn(o, sine(ext, (t) => 618.5 + 5 * w(t), 0.45));
    mixIn(o, sine(ext, (t) => 1229 + 9 * w(t), 0.22));
    mixIn(o, sine(ext, (t) => 2458 + 18 * w(t), 0.12));
    const hiss = pink(ext, r); biquad(hiss, 'bp', 5200, 1.2); gain(hiss, 0.25);
    mixIn(o, hiss);
    shape(o, (t) => 0.85 + 0.15 * Math.sin(TAU * 0.5 * t));
    return loopify(o, sec, 0.5);
  },
  /** A leg servo moving: a short geared whir. */
  servo: (seed) => {
    const r = rng(seed);
    const sec = 0.5;
    const f0 = 180 + r() * 60;
    const o = saw(sec, (t) => f0 * (1 + 0.6 * Math.sin(Math.PI * Math.min(1, t / sec))), 10);
    lp(o, 3200, 0.9);
    const teeth = creakTrain(sec, r, () => f0 * 0.25, 2200, 0.45);
    mixIn(o, teeth);
    shape(o, (k) => Math.sin(Math.PI * k), true);
    return fades(gain(o, 0.8));
  },
  /** The chime it rings on a bearing (80 m). */
  chime: (seed) => {
    const r = rng(seed);
    const sec = 2.6;
    const o = buf(sec);
    mixIn(o, bell(sec, r, 880, 1.6), 0, 0.6);
    mixIn(o, bell(sec, r, 1318.5, 1.3), 0.16, 0.45);
    return fades(o, 0.001, 0.3);
  },
  /** An arrow in the level vial: glass and the bubble's shiver. */
  vial: (seed) => {
    const r = rng(seed);
    const sec = 1.0;
    const o = glass(sec, r, 2650 + r() * 300);
    mixIn(o, grains(sec, r, { count: 60, span: 0.12, f: 7000, spread: 0.3, decay: 0.0015, amp: 0.5 }), 0.002);
    const wob = sine(0.6, (t) => 880 * (1 + 0.05 * Math.sin(TAU * 11 * t)), 0.25); shape(wob, ad(0.02, 0.2));
    mixIn(o, wob, 0.05);
    return fades(o, 0.0005, 0.1);
  },
  /** It cannot find level and topples: gyros wind down, the frame strikes the salt, chain and bob clatter. */
  topple: (seed) => {
    const r = rng(seed);
    const sec = 2.4;
    const o = sine(sec, (t) => 615 * Math.pow(0.35, t / 0.9), 0.4);
    shape(o, (t) => Math.max(0, 1 - t / 0.9));
    mixIn(o, thump(sec, r, 75, 40, 0.18, 1.2), 0.42);
    mixIn(o, metal(sec, r, 410, { decay: 0.7, bright: 0.7 }), 0.43, 0.6);
    for (let k = 0; k < 16; k++) mixIn(o, metal(0.4, r, 1200 + r() * 2600, { decay: 0.09, bright: 0.6 }), 0.45 + r() * 0.7, 0.35);
    mixIn(o, grains(sec, r, { count: 70, span: 0.5, at: 0.42, f: 3600, spread: 0.6, decay: 0.002, amp: 0.4 }), 0);
    return fades(o, 0.001, 0.2);
  },
  /** The bob swinging on its cable: air and a chain rattle. */
  bob: (seed) => {
    const r = rng(seed);
    const sec = 0.9;
    const o = whoosh(sec, r, (k) => 250 + 500 * Math.sin(Math.PI * k), 1.0, 0.8);
    mixIn(o, grains(sec, r, { count: 22, span: 0.6, at: 0.1, f: 3200, spread: 0.4, decay: 0.004, amp: 0.3, env: (u) => Math.sin(Math.PI * u) }), 0);
    return fades(o);
  },
};

/* ------------------------------------------------------------------ the Peg */

export const PEG = {
  /** The piston mallet: a hiss, then the head on the peg (hard wood). */
  mallet: (seed) => {
    const r = rng(seed);
    const sec = 0.6;
    const o = burst(sec, r, 'hp', 2500, 0.7, (t) => (t < 0.12 ? Math.min(1, t / 0.02) * 0.6 : Math.exp(-(t - 0.12) / 0.01) * 0.6), 0.6);
    mixIn(o, wood(sec, r, 780 + r() * 120, 0.07), 0.13, 1);
    mixIn(o, thump(sec, r, 120, 70, 0.04, 0.6), 0.13);
    return fades(firm(o, 2.2), 0.002, 0.05);
  },
  /** A peg fired from the rack: a knock and the peg's whistle. */
  shot: (seed) => {
    const r = rng(seed);
    const sec = 0.7;
    const o = wood(sec, r, 1100, 0.03);
    const wh = sine(0.5, (t) => lerp(2300, 1300, t / 0.5), 0.25); shape(wh, ad(0.01, 0.2));
    mixIn(o, wh, 0.03);
    mixIn(o, whoosh(0.4, r, (k) => lerp(3000, 1200, k), 2, 0.5), 0.02);
    return fades(o);
  },
  /** The swarm rush: a ratchet that runs up as it lunges. */
  rush: (seed) => {
    const r = rng(seed);
    const sec = 0.9;
    const o = buf(sec);
    let t = 0, gap = 0.06;
    while (t < sec - 0.05) { mixIn(o, metal(0.05, r, 2400 + r() * 300, { decay: 0.01, bright: 0.5 }), t, 0.6); t += gap; gap = Math.max(0.018, gap * 0.86); }
    return fades(o);
  },
  /** Idle: its escapement ticks (loop). */
  idle: (seed) => {
    const r = rng(seed);
    const sec = 2.0;
    const o = buf(sec + 0.2);
    for (let k = 0; k < 8; k++) mixIn(o, metal(0.08, r, k % 2 ? 3100 : 2700, { decay: 0.02, bright: 0.5 }), k * 0.25, k % 2 ? 0.7 : 1);
    return loopify(o, sec, 0.05);
  },
};

/* ------------------------------------------------------------------ the Gauge */

export const GAUGE = {
  /** The sluice: the gate's clank and the brine let through (loop body; the clank is its own cue). */
  sluice: (seed) => {
    const r = rng(seed);
    const sec = 4.0, ext = sec + 0.6;
    const w = wander(ext, r, 2);
    const n = pink(ext, r); biquad(n, 'bp', (k) => 1500 + 500 * w(k * ext), 0.5);
    const hissN = white(ext, r); biquad(hissN, 'bp', 3800, 0.8);
    const rumble = brown(ext, r); lp(rumble, 220, 0.7);
    const o = buf(ext); mixIn(o, n, 0, 1.2); mixIn(o, hissN, 0, 0.35); mixIn(o, rumble, 0, 0.8);
    mixIn(o, grains(ext, r, { count: 700, span: ext, f: 2200, spread: 0.6, decay: 0.006, amp: 0.2 }), 0);
    return loopify(o, sec, 0.6);
  },
  /** The gate opening: an iron clank and a chain run. */
  gate: (seed) => {
    const r = rng(seed);
    const sec = 1.4;
    const o = metal(sec, r, 260, { decay: 0.6, bright: 0.6 });
    mixIn(o, thump(sec, r, 90, 50, 0.1, 0.8));
    let t = 0.15;
    for (let k = 0; k < 12; k++) { mixIn(o, metal(0.08, r, 1700 + r() * 500, { decay: 0.02, bright: 0.4 }), t, 0.3); t += 0.05; }
    return fades(o, 0.001, 0.15);
  },
  /** A stilt step: the long leg creaks, its foot thuds into brine. */
  stilt: (seed) => {
    const r = rng(seed);
    const sec = 0.8;
    const o = creakTrain(sec, r, (k) => lerp(45, 30, k), 700, 0.8);
    shape(o, (k) => Math.sin(Math.PI * Math.min(1, k * 2)), true);
    mixIn(o, thump(sec, r, 85, 45, 0.08, 1), 0.38);
    mixIn(o, burst(sec, r, 'bp', 1000, 0.6, (t) => (t < 0.38 ? 0 : ad(0.01, 0.06)(t - 0.38)), 0.5), 0);
    return fades(o);
  },
  /** The float ring sliding on its staff and settling with a ring. */
  float: (seed) => {
    const r = rng(seed);
    const sec = 1.3;
    const slide = pink(sec, r); biquad(slide, 'bp', 2400, 3); shape(slide, (t) => (t < 0.5 ? Math.sin(Math.PI * t / 0.5) : 0));
    const o = gain(slide, 1.6);
    mixIn(o, metal(sec, r, 1980, { decay: 0.5, bright: 0.35, ratios: [1, 2.76, 5.4] }), 0.5, 0.6);
    return fades(o, 0.002, 0.15);
  },
  /** Idle: its brass pump's slow beat (loop). */
  idle: (seed) => {
    const r = rng(seed);
    const sec = 3.0;
    const o = buf(sec + 0.3);
    for (let k = 0; k < 2; k++) {
      mixIn(o, burst(1.0, r, 'bp', 1100, 1.2, (t) => Math.sin(Math.PI * Math.min(1, t / 0.7)), 0.6, 'pink'), k * 1.5);
      mixIn(o, metal(0.3, r, 1250, { decay: 0.06, bright: 0.5 }), k * 1.5 + 0.7, 0.6);
      mixIn(o, wood(0.2, r, 340, 0.05), k * 1.5 + 0.7, 0.6);
    }
    return loopify(o, sec, 0.3);
  },
};

/* ------------------------------------------------------------------ Instruments in general (inst/*) */

export const INST = {
  /** A generic servo bed for a kind with none of its own (loop). */
  servo: (seed) => {
    const r = rng(seed);
    const sec = 3.0;
    const ext = sec + 0.4;
    const w = wander(ext, r, 0.8);
    const o = saw(ext, (t) => 74 + 6 * w(t), 8); lp(o, 600, 0.8);
    mixIn(o, sine(ext, (t) => 1480 + 20 * w(t), 0.05));
    return loopify(gain(o, 0.7), sec, 0.4);
  },
  /** A wind-up before an attack: a ratchet winding. */
  windup: (seed) => {
    const r = rng(seed);
    const sec = 0.7;
    const o = buf(sec);
    for (let t = 0.02, k = 0; t < 0.6; t += Math.max(0.014, 0.045 - k * 0.002), k++) mixIn(o, metal(0.04, r, 2000 + k * 40, { decay: 0.008, bright: 0.4 }), t, 0.5);
    return fades(o);
  },
  /** An attack landing (a tool's strike): a heavy clank. */
  strike: (seed) => {
    const r = rng(seed);
    const sec = 0.7;
    const o = metal(sec, r, 330, { decay: 0.35, bright: 0.7 });
    mixIn(o, thump(sec, r, 100, 55, 0.06, 0.9));
    return fades(o, 0.001, 0.08);
  },
  /** Staggered: a stumble of loose plates. */
  stagger: (seed) => {
    const r = rng(seed);
    const sec = 0.8;
    const o = buf(sec);
    for (let k = 0; k < 7; k++) mixIn(o, metal(0.3, r, 700 + r() * 1500, { decay: 0.08, bright: 0.6 }), r() * 0.3, 0.35);
    mixIn(o, thump(sec, r, 90, 50, 0.07, 0.6));
    return fades(o);
  },
  /** Powered down (killed): the escapement runs out, a last chime falls. */
  powerdown: (seed) => {
    const r = rng(seed);
    const sec = 1.8;
    const o = buf(sec);
    let t = 0, gap = 0.04;
    while (t < 1.2) { mixIn(o, metal(0.05, r, 2600, { decay: 0.01, bright: 0.4 }), t, 0.4 * (1 - t / 1.2)); t += gap; gap *= 1.14; }
    mixIn(o, modal(1.2, [[880, 0.6, 0.4], [659, 0.7, 0.3]], r), 0.5, 0.6);
    return fades(firm(o, 1.8), 0.001, 0.2);
  },
  /** The frame collapsing onto the ground. */
  collapse: (seed) => {
    const r = rng(seed);
    const sec = 1.6;
    const o = thump(sec, r, 70, 38, 0.2, 1.2);
    for (let k = 0; k < 16; k++) mixIn(o, metal(0.4, r, 700 + r() * 2600, { decay: 0.1, bright: 0.6 }), 0.02 + r() * 0.7, 0.34);
    mixIn(o, grains(sec, r, { count: 60, span: 0.5, f: 3600, spread: 0.6, decay: 0.002, amp: 0.35 }), 0.02);
    return fades(firm(o, 2.4), 0.001, 0.2);
  },
};

/** Instrument footfalls by weight class (mstep/*). */
export const MSTEP = {
  light: (seed) => { const r = rng(seed); const o = thump(0.3, r, 160, 90, 0.025, 0.6); mixIn(o, metal(0.3, r, 2300, { decay: 0.03, bright: 0.4 }), 0.004, 0.35); return fades(o); },
  medium: (seed) => { const r = rng(seed); const o = thump(0.45, r, 110, 60, 0.05, 0.9); mixIn(o, metal(0.45, r, 900, { decay: 0.08, bright: 0.5 }), 0.004, 0.4); mixIn(o, grains(0.45, r, { count: 25, span: 0.05, f: 3800, decay: 0.0018, amp: 0.3 }), 0.005); return fades(o); },
  heavy: (seed) => { const r = rng(seed); const o = thump(0.7, r, 80, 42, 0.11, 1.2); mixIn(o, metal(0.7, r, 380, { decay: 0.2, bright: 0.6 }), 0.006, 0.5); mixIn(o, grains(0.7, r, { count: 40, span: 0.1, f: 3000, decay: 0.0025, amp: 0.35 }), 0.006); return fades(o); },
};

/* ------------------------------------------------------------------ places (ambience and world SFX) */

/** Wind over open ground: broadband, low-mid weighted, gusting slowly. */
function windBed(sec, r, { lo = 180, hi = 1400, gust = 0.35, rate = 0.12 } = {}) {
  const w = wander(sec, r, rate);
  const n = pink(sec, r);
  biquad(n, 'bp', (k) => lerp(lo, hi, 0.25 + 0.5 * w(k * sec)), 0.5);
  shape(n, (t) => 0.55 + gust * (w(t) - 0.5) * 2);
  const rum = brown(sec, r); lp(rum, 120, 0.7);
  return mixIn(gain(n, 1.6), rum, 0, 0.9);
}

/** Surf: breakers on a slow swell, wash and hiss. */
function surf(sec, r, { period = 8.5, amp = 1 } = {}) {
  const o = buf(sec);
  const n = len(sec);
  const wash = pink(sec, r); lp(wash, 1800, 0.6);
  const hiss = white(sec, r); hp(hiss, 3000, 0.7); lp(hiss, 9000, 0.7);
  const rum = brown(sec, r); lp(rum, 160, 0.7);
  const ph0 = r();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ph = ((t / period) + ph0) % 1;
    // a break: a fast rise, then a long wash back
    const br = ph < 0.08 ? ph / 0.08 : Math.exp(-(ph - 0.08) * 4.2);
    o[i] = wash[i] * (0.25 + 0.9 * br) + hiss[i] * (0.05 + 0.35 * br * br) + rum[i] * (0.6 + 0.6 * br);
  }
  return gain(o, amp);
}

export const AMB = {
  /** The Pans by day: open air over salt, the sea far off (stereo loop). */
  pans: (seed) => stereoLoop(seed, 20, (sec, r) => {
    const o = windBed(sec, r, { lo: 160, hi: 900, gust: 0.25 });
    mixIn(o, surf(sec, r, { period: 9, amp: 0.25 }));
    // a dry insect tick, very sparse
    mixIn(o, grains(sec, r, { count: Math.round(sec * 3), span: sec, f: 6200, spread: 0.1, decay: 0.004, amp: 0.05 }), 0);
    return o;
  }),
  /** The trade wind layer (gain follows the wind): higher, with a whistle over edges (stereo loop). */
  trade: (seed) => stereoLoop(seed, 16, (sec, r) => {
    const o = windBed(sec, r, { lo: 200, hi: 950, gust: 0.4, rate: 0.2 });
    biquad(o, 'highshelf', 1500, 0.7, -9);
    const wh = sine(sec, (t) => 520 + 40 * Math.sin(TAU * 0.07 * t), 0.012);
    return mixIn(o, wh);
  }),
  /** Saltrow: wind in the walls, the harbour below, rigging and far work (stereo loop). */
  saltrow: (seed) => stereoLoop(seed, 24, (sec, r) => {
    const o = windBed(sec, r, { lo: 140, hi: 700, gust: 0.2 });
    mixIn(o, surf(sec, r, { period: 7.5, amp: 0.35 }));
    for (let k = 0; k < Math.round(sec / 2.2); k++) mixIn(o, metal(0.6, r, 1900 + r() * 900, { decay: 0.15, bright: 0.3 }), r() * (sec - 0.6), 0.04);
    for (let k = 0; k < Math.round(sec / 5); k++) mixIn(o, wood(0.3, r, 500 + r() * 300, 0.04), r() * (sec - 0.3), 0.06);
    return o;
  }),
  /** The shore bed: surf close (stereo loop, gain keyed to the distance from the waterline). */
  shore: (seed) => stereoLoop(seed, 24, (sec, r) => surf(sec, r, { period: 8, amp: 1 })),
  /** Wind in cane, the gust (the Reed cover tell): the canes thrash and clatter (stereo loop). */
  caneGust: (seed) => stereoLoop(seed, 8, (sec, r) => {
    const w = wander(sec, r, 1.5);
    return rustle(sec, r, (t) => 0.7 + 0.3 * w(t), { f: 3600, density: 1400, amp: 0.55 });
  }),
  /** Wind in cane, the lull: a few stems tick (stereo loop). */
  caneLull: (seed) => stereoLoop(seed, 8, (sec, r) => {
    const w = wander(sec, r, 0.6);
    return gain(rustle(sec, r, (t) => 0.15 + 0.2 * w(t), { f: 4200, density: 220, amp: 0.4 }), 0.8);
  }),
  /** A gull: two or three nasal cries. */
  gull: (seed) => {
    const r = rng(seed);
    const sec = 1.6;
    const o = buf(sec);
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const d = 0.28 + r() * 0.12, f0 = 900 + r() * 300;
      const c = saw(d, (t) => f0 * (1 + 0.8 * Math.sin(Math.PI * Math.min(1, t / d)) - 0.35 * (t / d)), 14);
      biquad(c, 'bp', 1900, 1.4); biquad(c, 'peak', 3200, 2, 6);
      shape(c, (t) => Math.min(1, t / 0.02) * Math.max(0, 1 - t / d));
      mixIn(o, c, k * (0.38 + r() * 0.1), 1);
    }
    return fades(o);
  },
};

/** Render a stereo loop: two decorrelated renders of `fn(sec + xf, r)`, loopified. */
function stereoLoop(seed, sec, fn, xf = 1) {
  const L = loopify(fn(sec + xf, rng(seed)), sec, xf);
  const R = loopify(fn(sec + xf, rng(seed ^ 0x5bd1e995)), sec, xf);
  // keep some correlation (a bed is a place, not two places)
  for (let i = 0; i < L.length; i++) { const m = (L[i] + R[i]) * 0.5; L[i] = lerp(L[i], m, 0.35); R[i] = lerp(R[i], m, 0.35); }
  return [L, R];
}

export const SALTROW = {
  /** The guild bell (300 m). */
  bell: (seed) => { const r = rng(seed); const sec = 5.5; return fades(bell(sec, r, 311, 3.2), 0.001, 0.5); },
  /** A wind pump turning: vane creak, rod clank (loop). */
  pump: (seed) => {
    const r = rng(seed);
    const sec = 4.8;
    const o = buf(sec + 0.4);
    for (let k = 0; k < 2; k++) {
      const t0 = k * 2.4;
      const cr = creakTrain(1.2, r, (q) => lerp(40, 75, Math.sin(Math.PI * q)), 520, 0.5);
      shape(cr, (q) => Math.sin(Math.PI * q), true);
      mixIn(o, cr, t0);
      mixIn(o, metal(0.6, r, 980, { decay: 0.18, bright: 0.7 }), t0 + 1.25, 0.9);
      mixIn(o, wood(0.3, r, 300, 0.05), t0 + 1.27, 0.5);
    }
    return loopify(o, sec, 0.4);
  },
  /** A rake drawn over the crust. */
  rake: (seed) => {
    const r = rng(seed);
    const sec = 1.3;
    const o = buf(sec);
    mixIn(o, grains(sec, r, { count: 260, span: 0.9, at: 0.1, f: 3400, spread: 0.6, decay: 0.002, amp: 0.4, env: (u) => Math.sin(Math.PI * u) }), 0);
    const scrape = pink(sec, r); biquad(scrape, 'bp', 1800, 1.2); shape(scrape, (t) => (t > 0.1 && t < 1.0 ? Math.sin(Math.PI * (t - 0.1) / 0.9) : 0));
    mixIn(o, scrape, 0, 1.2);
    return fades(o, 0.01, 0.1);
  },
  /** A shovel into a salt cone and the throw into a basket. */
  shovel: (seed) => {
    const r = rng(seed);
    const sec = 1.4;
    const o = buf(sec);
    mixIn(o, metal(0.4, r, 1350, { decay: 0.06, bright: 0.4 }), 0, 0.4);
    mixIn(o, grains(sec, r, { count: 120, span: 0.25, f: 3000, spread: 0.6, decay: 0.002, amp: 0.45 }), 0.01);
    mixIn(o, grains(sec, r, { count: 160, span: 0.3, at: 0.8, f: 2600, spread: 0.6, decay: 0.002, amp: 0.4 }), 0);
    mixIn(o, wood(0.4, r, 260, 0.05), 0.82, 0.5);
    return fades(o, 0.002, 0.1);
  },
  /** A salt cart's wheel over stones. */
  cart: (seed) => {
    const r = rng(seed);
    const sec = 2.4;
    const o = creakTrain(sec, r, (k) => 30 + 10 * Math.sin(k * 20), 480, 0.4);
    for (let t = 0.05; t < sec - 0.2; t += 0.18 + r() * 0.1) mixIn(o, wood(0.15, r, 520 + r() * 200, 0.03), t, 0.35);
    shape(o, (k) => Math.sin(Math.PI * k), true);
    return fades(o, 0.02, 0.1);
  },
  /** A mallet on a boat's seam or a crate. */
  hammer: (seed) => {
    const r = rng(seed);
    const sec = 1.2;
    const o = buf(sec);
    for (let k = 0; k < 3; k++) mixIn(o, wood(0.3, r, 560 + r() * 80, 0.05), k * 0.34 + r() * 0.03, 0.8);
    return fades(o, 0.001, 0.1);
  },
};

export const BRAZIER = {
  /** Kindled: a strike, the catch, the first crackle. */
  kindle: (seed) => {
    const r = rng(seed);
    const sec = 1.8;
    const o = burst(sec, r, 'bp', 3000, 0.8, ad(0.001, 0.02), 0.6);
    const catchUp = pink(sec, r); biquad(catchUp, 'bp', (k) => lerp(400, 1200, Math.min(1, k * 3)), 0.7);
    shape(catchUp, (t) => (t < 0.08 ? 0 : Math.min(1, (t - 0.08) / 0.25) * Math.exp(-(t - 0.33) * 1.5 * (t > 0.33))));
    mixIn(o, catchUp, 0, 1.4);
    mixIn(o, grains(sec, r, { count: 40, span: 1.4, at: 0.3, f: 2500, spread: 0.7, decay: 0.004, amp: 0.4 }), 0);
    return fades(o, 0.001, 0.2);
  },
  /** It burns (loop, 15 m): a low roar and pops. */
  burn: (seed) => {
    const r = rng(seed);
    const sec = 6.0, ext = 6.6;
    const w = wander(ext, r, 1.2);
    const roar = brown(ext, r); lp(roar, 380, 0.7); shape(roar, (t) => 0.7 + 0.3 * w(t));
    const o = gain(roar, 1.6);
    const breath = pink(ext, r); biquad(breath, 'bp', 900, 0.6); shape(breath, (t) => 0.2 + 0.2 * w(t)); mixIn(o, breath, 0, 0.5);
    mixIn(o, grains(ext, r, { count: Math.round(ext * 16), span: ext, f: 2800, spread: 0.8, decay: 0.005, amp: 0.8 }), 0);
    mixIn(o, grains(ext, r, { count: Math.round(ext * 2), span: ext, f: 900, spread: 0.4, decay: 0.012, amp: 0.6 }), 0);
    return loopify(o, sec, 0.6);
  },
  /** The rest: a log settles and the coals sigh. */
  rest: (seed) => {
    const r = rng(seed);
    const sec = 2.6;
    const o = wood(sec, r, 210, 0.12);
    mixIn(o, grains(sec, r, { count: 50, span: 1.6, at: 0.1, f: 1800, spread: 0.6, decay: 0.006, amp: 0.4, env: (u) => Math.exp(-u * 2) }), 0);
    const sigh = pink(sec, r); biquad(sigh, 'bp', 600, 0.8); shape(sigh, (t) => Math.sin(Math.PI * Math.min(1, t / 2.2)));
    mixIn(o, sigh, 0, 0.8);
    return fades(o, 0.002, 0.3);
  },
};

/* ------------------------------------------------------------------ UI: glass ticks (UI bus) */

function tick(r, f, decay = 0.05, amp = 1) {
  return gain(modal(0.2, [[f, decay, 1], [f * 2.03, decay * 0.6, 0.35], [f * 3.97, decay * 0.3, 0.12]], r, 0.05), amp);
}

export const UI = {
  tick: (seed) => { const r = rng(seed); return fades(tick(r, 3150, 0.03)); },
  select: (seed) => { const r = rng(seed); const o = buf(0.3); mixIn(o, tick(r, 2640, 0.05), 0); mixIn(o, tick(r, 3520, 0.07), 0.06); return fades(o); },
  back: (seed) => { const r = rng(seed); const o = buf(0.3); mixIn(o, tick(r, 3520, 0.04), 0); mixIn(o, tick(r, 2349, 0.06), 0.06); return fades(o); },
  error: (seed) => { const r = rng(seed); const o = buf(0.35); mixIn(o, tick(r, 740, 0.05), 0); mixIn(o, tick(r, 740, 0.05), 0.11); return fades(o); },
  tab: (seed) => {
    const r = rng(seed); const o = buf(0.3);
    const sl = pink(0.12, r); biquad(sl, 'bp', 3500, 2); shape(sl, (t) => Math.sin(Math.PI * t / 0.12));
    mixIn(o, gain(sl, 0.8), 0); mixIn(o, tick(r, 2960, 0.05), 0.1);
    return fades(o);
  },
  /** The map sheet: paper over the table, then a tick. */
  map: (seed) => {
    const r = rng(seed); const o = buf(0.6);
    const pp = pink(0.4, r); biquad(pp, 'bp', 2500, 0.6); shape(pp, (t) => Math.sin(Math.PI * t / 0.4) * (0.7 + 0.3 * Math.sin(t * 60)));
    mixIn(o, gain(pp, 1.4), 0); mixIn(o, tick(r, 2793, 0.06), 0.36);
    return fades(o);
  },
  open: (seed) => { const r = rng(seed); const o = buf(0.35); mixIn(o, tick(r, 2093, 0.06), 0); mixIn(o, tick(r, 3136, 0.08), 0.07); return fades(o); },
  close: (seed) => { const r = rng(seed); const o = buf(0.35); mixIn(o, tick(r, 3136, 0.05), 0); mixIn(o, tick(r, 2093, 0.07), 0.07); return fades(o); },
  /** A triangle closed: three glass notes rising (a survey closes). */
  triangle: (seed) => {
    const r = rng(seed); const sec = 1.6; const o = buf(sec);
    [1760, 2217.5, 2637].forEach((f, k) => mixIn(o, glass(1.2, r, f), k * 0.13, 0.45));
    return fades(o, 0.001, 0.2);
  },
  /** Saved: a soft glass chord. */
  save: (seed) => {
    const r = rng(seed); const sec = 1.2; const o = buf(sec);
    [1318.5, 1975.5].forEach((f, k) => mixIn(o, glass(1.0, r, f), k * 0.05, 0.4));
    return fades(o, 0.001, 0.2);
  },
};

/* ------------------------------------------------------------------ music: the Pans theme (one cue, a tension layer) */

/**
 * One cue (TECH §14: "the Pans theme (plucked strings and a whistle line) ... with a ratchet tension layer when lamps
 * are up"). 96 BPM, 8 bars of 4/4 = 20 s, all stems the same length and phase-locked (src/audio/music.js loops them
 * from one origin). A aeolian: Am | Am | G | G | F | F | G | E.
 */
export const MUSIC_BPM = 96;
export const MUSIC_BARS = 8;
const BEAT_S = 60 / MUSIC_BPM;
export const MUSIC_SEC = MUSIC_BARS * 4 * BEAT_S;   // 20 s
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [[57, 60, 64], [57, 60, 64], [55, 59, 62], [55, 59, 62], [53, 57, 60], [53, 57, 60], [55, 59, 62], [52, 56, 59]];
// the whistle line: [bar, beat, midi, beats]
const MELODY = [
  [0, 0, 76, 1.5], [0, 1.5, 74, 0.5], [0, 2, 72, 1], [0, 3, 71, 1], [1, 0, 69, 3],
  [2, 0, 71, 1], [2, 1, 72, 0.5], [2, 1.5, 74, 1.5], [2, 3, 71, 1], [3, 0, 67, 3],
  [4, 0, 72, 1.5], [4, 1.5, 71, 0.5], [4, 2, 69, 2], [5, 0, 65, 1], [5, 1, 67, 1], [5, 2, 69, 2],
  [6, 0, 71, 1], [6, 1, 74, 1], [6, 2, 72, 1], [6, 3, 71, 1], [7, 0, 68, 3.5],
];

function musicStereo(seed, fn) {
  const sec = MUSIC_SEC;
  const tail = 1.5;
  const L = buf(sec + tail), R = buf(sec + tail);
  fn(L, R, rng(seed));
  // wrap the tail past the loop end onto the head so the loop rings through its seam
  const n = len(sec);
  const outL = L.slice(0, n), outR = R.slice(0, n);
  for (let i = n; i < L.length; i++) { outL[i - n] += L[i]; outR[i - n] += R[i]; }
  return [outL, outR];
}

export const MUSIC = {
  /** Plucked strings: an arpeggio in eighths over the progression, panned a little left and right. */
  strings: (seed) => musicStereo(seed, (L, R, r) => {
    const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
    for (let bar = 0; bar < MUSIC_BARS; bar++) {
      const ch = CHORDS[bar];
      for (let e = 0; e < 8; e++) {
        const t = (bar * 4 + e * 0.5) * BEAT_S;
        const m = ch[pattern[e]] + (e === 0 ? -12 : 0);
        const p = pluck(1.6, hz(m), r, { bright: 0.45 + r() * 0.15, damp: 0.9965, pickPos: 0.15 + r() * 0.1 });
        shape(p, ad(0.001, 0.9));
        const g = (e === 0 ? 0.55 : 0.36) * (0.9 + r() * 0.2);
        const pan = e % 2 ? 0.3 : -0.3;
        mixIn(L, p, t + r() * 0.008, g * (1 - pan) * 0.7);
        mixIn(R, p, t + r() * 0.008, g * (1 + pan) * 0.7);
      }
    }
    lp(L, 5200, 0.7); lp(R, 5200, 0.7);
  }),
  /** The whistle line over it. */
  whistle: (seed) => musicStereo(seed, (L, R, r) => {
    let prev = null;
    for (const [bar, beat, m, beats] of MELODY) {
      const t = (bar * 4 + beat) * BEAT_S;
      const d = beats * BEAT_S * 0.96;
      const f = hz(m + 12);
      const note = whistleNote(d, r, f, { glideFrom: prev && Math.abs(prev - f) < f * 0.3 ? prev : null, depth: beats >= 2 ? 0.014 : 0.006, amp: 0.32 });
      mixIn(L, note, t, 0.85); mixIn(R, note, t, 0.95);
      prev = f;
    }
    const wl = verb(L, { size: 1.1, wet: 0.3, tail: 0 }), wr = verb(R, { size: 1.15, wet: 0.3, tail: 0 });
    L.set(wl.subarray(0, L.length)); R.set(wr.subarray(0, R.length));
  }),
  /** The tension pedal: a low bowed A that swells per bar (under the ratchet). */
  pedal: (seed) => musicStereo(seed, (L, R, r) => {
    const sec = MUSIC_SEC;
    const o = saw(sec, (t) => hz(45) * (1 + 0.002 * Math.sin(TAU * 0.3 * t)), 10);
    lp(o, 420, 0.9);
    shape(o, (t) => 0.55 + 0.45 * Math.pow(Math.sin(Math.PI * ((t / (4 * BEAT_S)) % 1)), 2));
    const fifth = saw(sec, hz(52), 8); lp(fifth, 360, 0.8);
    mixIn(o, fifth, 0, 0.35);
    mixIn(L, o, 0, 0.5); mixIn(R, o, 0, 0.5);
  }),
  /** The ratchet tension layer: an escapement in sixteenths, accents on the beat, a low wood knock on 1 and 3. */
  ratchet: (seed) => musicStereo(seed, (L, R, r) => {
    for (let s = 0; s < MUSIC_BARS * 16; s++) {
      const t = s * BEAT_S / 4;
      const acc = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.55 : 0.35;
      const c = metal(0.06, r, 2500 + (s % 4 === 0 ? 0 : 300) + r() * 60, { decay: 0.009, bright: 0.35 });
      const pan = (s % 2 ? 0.25 : -0.25);
      mixIn(L, c, t, acc * 0.5 * (1 - pan)); mixIn(R, c, t, acc * 0.5 * (1 + pan));
      if (s % 8 === 0) { const k = wood(0.3, r, 190, 0.06); mixIn(L, k, t, 0.7); mixIn(R, k, t, 0.7); }
    }
  }),
};
