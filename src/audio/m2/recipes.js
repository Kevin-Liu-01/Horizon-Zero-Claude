/**
 * THE FIRST HOUR'S CUE RECIPES (Milestone 2 audio; TECH §14 sourcing 1: "our own synthesis recipes ... deterministic,
 * Node, no licence burden"). The slice's recipes (../slice/recipes.js) made the first 21 minutes; these make the rest of
 * the hour: the Holds, Ninewalls and its work, the Scar, the Malpais edge and the calima's air; Oro's forge and the Kit
 * Rack; the Windwall, the gaff and the pots; the Tiller herd and its trample tell; the Screed's charge, stall, seals and
 * cut; the re-survey's Alidade.
 *
 * Same contract as the slice's: `(seed) => Float32Array` (mono, a point source) or `(seed) => [L, R]` (stereo beds),
 * rendered by tools/gates/audio/build-bank.mjs with seeds fixed per set, normalised and encoded by the cue table
 * (./cues.js). No recording, no third-party sample. The Instruments' voices (the Tiller, the Screed) are built only from
 * ratchets, escapements, whine, clinks, rattles and the ground they strike (BUILD M3.8's rule, kept from the start): no
 * roar, no growl, no choir, no drum.
 */
import {
  SR, rng, len, buf, white, pink, brown, biquad, lp, hp, shape, ad, sine, saw, modal, mixIn, gain, fades, loopify, grains, verb, wander,
} from '../slice/dsp.js';
import { kit } from '../slice/recipes.js';

const { thump, burst, whoosh, metal, wood, rustle, creakTrain, glass, windBed, surf, stereoLoop } = kit;
const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;

/* ------------------------------------------------------------------ shared makers */

/** A stone knock: two or three short low modes and grit (dry-stone, basalt, a quern). */
function stone(sec, r, f = 760, decay = 0.035, amp = 1) {
  const o = modal(sec, [[f, decay, 1], [f * 1.73, decay * 0.7, 0.55], [f * 3.1, decay * 0.4, 0.3], [f * 4.9, decay * 0.25, 0.15]], r, 0.5);
  mixIn(o, grains(sec, r, { count: 14, span: 0.03, f: 3200, spread: 0.6, decay: 0.0015, amp: 0.4 }), 0.002);
  return gain(o, amp);
}

/** Water: a slop of low noise and a few bubbles (sine chirps rising). */
function water(sec, r, { at = 0, amount = 1, bubbles = 8 } = {}) {
  const o = buf(sec);
  const slop = brown(sec, r); lp(slop, 900, 0.7); hp(slop, 80, 0.7);
  shape(slop, (t) => (t < at ? 0 : ad(0.012, 0.18 * amount)(t - at)));
  mixIn(o, slop, 0, 2.2 * amount);
  const spl = pink(sec, r); biquad(spl, 'bp', 1600, 0.8); shape(spl, (t) => (t < at ? 0 : ad(0.004, 0.08)(t - at)));
  mixIn(o, spl, 0, 0.7 * amount);
  for (let k = 0; k < bubbles; k++) {
    const d = 0.03 + r() * 0.05, f0 = 500 + r() * 900;
    const b = sine(d, (t) => f0 * (1 + 2.2 * t / d), 0.25);
    shape(b, (t) => Math.sin(Math.PI * t / d));
    mixIn(o, b, at + 0.02 + r() * 0.35 * amount, 1);
  }
  return o;
}

/** A pour or a stream: band noise with a level curve `I(k 0..1)`. */
function stream(sec, r, f, q, I, amp = 1) {
  const n = pink(sec, r); biquad(n, 'bp', f, q); biquad(n, 'bp', f * 1.4, q);
  shape(n, I, true);
  return gain(n, amp * 3);
}

/** An escapement: clicks at rate(k) Hz (k 0..1 of the cue), each a small bright metal tick, alternating pallets. */
function escapement(sec, r, rate, { f = 2600, decay = 0.006, amp = 1, env = null } = {}) {
  const o = buf(sec);
  const n = len(sec);
  let ph = 0, pal = 0;
  const tickA = metal(0.04, r, f, { decay, bright: 0.45 }), tickB = metal(0.04, r, f * 1.19, { decay, bright: 0.45 });
  for (let i = 0; i < n; i++) {
    ph += rate(i / n) / SR;
    if (ph >= 1) {
      ph -= 1; pal ^= 1;
      const g = (env ? env(i / n) : 1) * (0.7 + 0.3 * r());
      mixIn(o, pal ? tickA : tickB, i / SR, g);
    }
  }
  return gain(o, amp);
}

/** Whine: a servo or a gyro, frequency `fn(k)`, with a little second harmonic and hiss. */
function whine(sec, r, fn, amp = 1) {
  const o = sine(sec, (t) => fn(t / sec), 0.7);
  mixIn(o, sine(sec, (t) => fn(t / sec) * 2.01, 0.18));
  const h = pink(sec, r); biquad(h, 'bp', (k) => fn(k) * 3, 4); mixIn(o, h, 0, 0.25);
  return gain(o, amp);
}

/** Clay breaking: a short modal body and a spray of shards. */
function clay(sec, r, f = 900, amp = 1) {
  const o = modal(sec, [[f, 0.03, 1], [f * 2.31, 0.02, 0.6], [f * 3.9, 0.012, 0.4], [f * 6.2, 0.008, 0.3]], r, 0.8);
  mixIn(o, grains(sec, r, { count: 90, span: 0.18, f: 3400, spread: 0.7, decay: 0.002, amp: 0.65, env: (u) => Math.exp(-u * 3) }), 0.002);
  mixIn(o, grains(sec, r, { count: 30, span: 0.35, at: 0.06, f: 2200, spread: 0.5, decay: 0.003, amp: 0.4 }), 0);
  return gain(o, amp);
}

/** A hiss of steam or pressure: high band noise, `env(t s)`. */
function hiss(sec, r, f, env, amp = 1) {
  const n = white(sec, r); biquad(n, 'hp', f, 0.7); biquad(n, 'lp', f * 3.2, 0.7);
  shape(n, env);
  return gain(n, amp);
}

/** Rubble: falling stones over `span` s, from `at`. */
function rubble(sec, r, { at = 0, span = 0.8, count = 26, f = 520, amp = 1 } = {}) {
  const o = buf(sec);
  for (let k = 0; k < count; k++) {
    const t = at + Math.pow(r(), 1.6) * span;
    mixIn(o, stone(0.25, r, f * (0.7 + r() * 1.1), 0.02 + r() * 0.03, 0.4 + r() * 0.6), t, 1);
  }
  mixIn(o, grains(sec, r, { count: 140, span, at, f: 2800, spread: 0.7, decay: 0.002, amp: 0.4, env: (u) => Math.exp(-u * 2.5) }), 0);
  return gain(o, amp);
}

/* ------------------------------------------------------------------ places: the beds (ambience bus, stereo loops) */

export const PLACE = {
  /** The Holds: dry wind over the walled terraces and the lapilli pits, the fig and vine stalks ticking, far tin. */
  holds: (seed) => stereoLoop(seed, 20, (sec, r) => {
    const o = windBed(sec, r, { lo: 150, hi: 780, gust: 0.3, rate: 0.14 });
    const w = wander(sec, r, 0.4);
    mixIn(o, rustle(sec, r, (t) => 0.08 + 0.12 * w(t), { f: 3000, density: 120, amp: 0.3 }), 0, 0.8);
    for (let k = 0; k < Math.round(sec / 6); k++) mixIn(o, metal(0.5, r, 2300 + r() * 600, { decay: 0.12, bright: 0.25 }), r() * (sec - 0.5), 0.025);
    mixIn(o, surf(sec, r, { period: 10, amp: 0.06 }));
    return o;
  }),
  /** Ninewalls: the wind broken by nine walls, a hearth's low breath, wood and clay knocks of a village at work. */
  ninewalls: (seed) => stereoLoop(seed, 20, (sec, r) => {
    const o = windBed(sec, r, { lo: 120, hi: 480, gust: 0.15, rate: 0.1 });
    lp(o, 1400, 0.7);
    const hearth = brown(sec, r); lp(hearth, 260, 0.7); mixIn(o, hearth, 0, 0.35);
    for (let k = 0; k < Math.round(sec / 3.2); k++) mixIn(o, wood(0.3, r, 380 + r() * 380, 0.04), r() * (sec - 0.3), 0.05);
    for (let k = 0; k < Math.round(sec / 5); k++) mixIn(o, modal(0.4, [[1150 + r() * 400, 0.05, 1], [2900 + r() * 500, 0.03, 0.4]], r, 0.2), r() * (sec - 0.4), 0.03);
    return o;
  }),
  /** The Scar: the wind running down a dead-straight cut, a hollow tone over its berms, grit trickling. */
  scar: (seed) => stereoLoop(seed, 16, (sec, r) => {
    const o = windBed(sec, r, { lo: 240, hi: 1300, gust: 0.45, rate: 0.24 });
    const w = wander(sec, r, 0.3);
    const tone = pink(sec, r); biquad(tone, 'bp', (k) => 330 + 30 * w(k * sec), 18); biquad(tone, 'bp', (k) => 330 + 30 * w(k * sec), 18);
    shape(tone, (t) => 0.4 + 0.6 * w(t)); mixIn(o, tone, 0, 7);
    mixIn(o, grains(sec, r, { count: Math.round(sec * 9), span: sec, f: 4200, spread: 0.5, decay: 0.0012, amp: 0.12 }), 0);
    return o;
  }),
  /** The Malpais edge: a cold, thin wind over clinker, glassy lava ticking as it settles; nothing living. */
  malpais: (seed) => stereoLoop(seed, 20, (sec, r) => {
    const o = windBed(sec, r, { lo: 420, hi: 2100, gust: 0.5, rate: 0.18 });
    biquad(o, 'lowshelf', 220, 0.7, -9);
    for (let k = 0; k < Math.round(sec * 1.2); k++) mixIn(o, glass(0.5, r, 3800 + r() * 2600), r() * (sec - 0.5), 0.02 + r() * 0.025);
    mixIn(o, grains(sec, r, { count: Math.round(sec * 4), span: sec, f: 5200, spread: 0.4, decay: 0.002, amp: 0.1 }), 0);
    return o;
  }),
  /** The calima's air: the trade wind thinned to a dust hiss, sand ticking on stone, close and soft (gain follows it). */
  calima: (seed) => stereoLoop(seed, 16, (sec, r) => {
    const w = wander(sec, r, 0.25);
    const dust = pink(sec, r); biquad(dust, 'bp', (k) => 2600 + 900 * w(k * sec), 0.6); lp(dust, 6500, 0.6);
    shape(dust, (t) => 0.6 + 0.3 * w(t));
    const o = gain(dust, 1.2);
    const low = brown(sec, r); lp(low, 140, 0.7); mixIn(o, low, 0, 0.35);
    mixIn(o, grains(sec, r, { count: Math.round(sec * 60), span: sec, f: 6800, spread: 0.3, decay: 0.0008, amp: 0.08 }), 0);
    return o;
  }),
};

/* ------------------------------------------------------------------ the Holds at work (world SFX) */

export const HOLDS = {
  /** A hoe into the lapilli of a pit: the chop, the black grit's crunch, the drag. */
  hoe: (seed) => {
    const r = rng(seed);
    const sec = 0.9;
    const o = thump(sec, r, 130, 70, 0.03, 0.7);
    mixIn(o, metal(sec, r, 1700 + r() * 300, { decay: 0.03, bright: 0.4 }), 0.002, 0.25);
    mixIn(o, grains(sec, r, { count: 110, span: 0.12, f: 2600, spread: 0.6, decay: 0.0018, amp: 0.55, env: (u) => Math.exp(-u * 3) }), 0.003);
    const drag = pink(sec, r); biquad(drag, 'bp', 1400, 1.1); shape(drag, (t) => (t > 0.25 && t < 0.75 ? Math.sin(Math.PI * (t - 0.25) / 0.5) : 0));
    mixIn(o, drag, 0, 0.9);
    mixIn(o, grains(sec, r, { count: 80, span: 0.45, at: 0.26, f: 3000, spread: 0.6, decay: 0.0018, amp: 0.3, env: (u) => Math.sin(Math.PI * u) }), 0);
    return fades(o, 0.001, 0.08);
  },
  /** Seed sown: a hand into the bag and a scatter over the lapilli. */
  sow: (seed) => {
    const r = rng(seed);
    const sec = 1.0;
    const o = buf(sec);
    const bag = pink(sec, r); biquad(bag, 'bp', 2200, 1.4); shape(bag, (t) => (t < 0.18 ? Math.sin(Math.PI * t / 0.18) : 0)); mixIn(o, bag, 0, 0.8);
    mixIn(o, grains(sec, r, { count: 140, span: 0.5, at: 0.3, f: 4400, spread: 0.5, decay: 0.0012, amp: 0.5, env: (u) => Math.exp(-u * 2) }), 0);
    return fades(o, 0.002, 0.08);
  },
  /** Watering a plot from a pot: the pour onto dry grit, its gulp at the start. */
  water: (seed) => {
    const r = rng(seed);
    const sec = 1.8;
    const o = stream(sec, r, 1100, 1.3, (k) => (k < 0.08 ? k / 0.08 : k > 0.82 ? Math.max(0, (1 - k) / 0.18) : 1) * (0.8 + 0.2 * Math.sin(k * 41)), 0.7);
    mixIn(o, water(sec, r, { at: 0.02, amount: 0.5, bubbles: 10 }), 0, 0.6);
    mixIn(o, grains(sec, r, { count: 60, span: 1.4, at: 0.15, f: 2600, spread: 0.5, decay: 0.002, amp: 0.15 }), 0);
    return fades(o, 0.01, 0.12);
  },
  /** A bucket into the cistern: the wooden rim on the kerb, the slap of water, the rope and the lift. */
  bucket: (seed) => {
    const r = rng(seed);
    const sec = 2.2;
    const o = buf(sec);
    mixIn(o, wood(0.3, r, 420 + r() * 80, 0.05), 0, 0.8);
    mixIn(o, water(sec, r, { at: 0.35, amount: 1.1, bubbles: 12 }), 0, 1);
    const rope = creakTrain(0.8, r, (k) => lerp(30, 55, k), 650, 0.35); shape(rope, (k) => Math.sin(Math.PI * k), true);
    mixIn(o, rope, 1.0, 1);
    mixIn(o, water(0.8, r, { at: 0.0, amount: 0.35, bubbles: 4 }), 1.35, 0.6);
    return fades(o, 0.001, 0.15);
  },
  /** Cochineal picked off a cactus pad: the knife's scrape over the pad, the tap into the cup. */
  pick: (seed) => {
    const r = rng(seed);
    const sec = 1.1;
    const o = buf(sec);
    const scr = pink(sec, r); biquad(scr, 'bp', (k) => lerp(2600, 3600, k), 2.4); shape(scr, (t) => (t < 0.55 ? Math.sin(Math.PI * t / 0.55) : 0));
    mixIn(o, scr, 0, 0.9);
    mixIn(o, modal(0.3, [[1650 + r() * 200, 0.04, 1], [3900, 0.02, 0.4]], r, 0.25), 0.68, 0.6);
    mixIn(o, grains(sec, r, { count: 10, span: 0.06, at: 0.7, f: 5200, spread: 0.3, decay: 0.001, amp: 0.3 }), 0);
    return fades(o, 0.004, 0.08);
  },
  /** Sorting at a door: clay jars set down and a lid turned. */
  sort: (seed) => {
    const r = rng(seed);
    const sec = 1.2;
    const o = buf(sec);
    mixIn(o, modal(0.4, [[620 + r() * 80, 0.05, 1], [1540, 0.03, 0.5], [2870, 0.015, 0.25]], r, 0.4), 0, 0.9);
    mixIn(o, modal(0.4, [[700 + r() * 90, 0.05, 1], [1720, 0.03, 0.5]], r, 0.4), 0.38 + r() * 0.08, 0.7);
    const lid = pink(0.3, r); biquad(lid, 'bp', 1900, 3); shape(lid, (t) => Math.sin(Math.PI * Math.min(1, t / 0.3)));
    mixIn(o, lid, 0.75, 0.5);
    return fades(o, 0.001, 0.08);
  },
};

/* ------------------------------------------------------------------ Oro's forge in the tube mouth */

export const FORGE = {
  /** The hearth (loop, positional): coals breathing, a low draught up the tube, sparks ticking. */
  fire: (seed) => {
    const r = rng(seed);
    const sec = 6.0, ext = 6.6;
    const w = wander(ext, r, 0.8);
    const roar = brown(ext, r); lp(roar, 300, 0.7); shape(roar, (t) => 0.6 + 0.4 * w(t));
    const o = gain(roar, 1.4);
    const draught = pink(ext, r); biquad(draught, 'bp', 520, 0.7); shape(draught, (t) => 0.25 + 0.25 * w(t)); mixIn(o, draught, 0, 0.55);
    mixIn(o, grains(ext, r, { count: Math.round(ext * 11), span: ext, f: 3200, spread: 0.7, decay: 0.004, amp: 0.55 }), 0);
    mixIn(o, grains(ext, r, { count: Math.round(ext * 3), span: ext, f: 1300, spread: 0.4, decay: 0.01, amp: 0.4 }), 0);
    return loopify(o, sec, 0.6);
  },
  /** The bellows: the leather's wheeze in and the hearth's answer (a breath of flame). */
  bellows: (seed) => {
    const r = rng(seed);
    const sec = 1.8;
    const o = buf(sec);
    const inh = pink(0.7, r); biquad(inh, 'bp', 700, 0.9); shape(inh, (k) => Math.sin(Math.PI * k) ** 1.5, true); mixIn(o, inh, 0, 0.8);
    const blow = pink(0.9, r); biquad(blow, 'bp', (k) => lerp(380, 900, Math.sin(Math.PI * k)), 0.7); shape(blow, (k) => Math.sin(Math.PI * k) ** 1.2, true);
    mixIn(o, blow, 0.7, 1.6);
    mixIn(o, creakTrain(0.5, r, () => 28, 330, 0.25), 0.62, 1);
    mixIn(o, grains(sec, r, { count: 30, span: 0.6, at: 0.85, f: 2900, spread: 0.6, decay: 0.004, amp: 0.45 }), 0);
    return fades(o, 0.01, 0.15);
  },
  /** Hammer on hot iron at the anvil: a ringing strike, then a lighter bounce strike. */
  anvil: (seed) => {
    const r = rng(seed);
    const sec = 1.6;
    const o = buf(sec);
    const f = 1080 + r() * 120;
    mixIn(o, metal(sec, r, f, { decay: 0.55, bright: 0.85, ratios: [1, 2.76, 5.4, 8.93, 13.3], strike: 0.6 }), 0, 1);
    mixIn(o, thump(0.3, r, 140, 90, 0.02, 0.4), 0, 1);
    mixIn(o, metal(0.8, r, f * 1.01, { decay: 0.3, bright: 0.6, ratios: [1, 2.76, 5.4, 8.93], strike: 0.3 }), 0.21 + r() * 0.03, 0.35);
    return fades(o, 0.0005, 0.25);
  },
  /** The iron quenched in the trough: the bite of the hiss, the boil, the steam going. */
  quench: (seed) => {
    const r = rng(seed);
    const sec = 2.0;
    const o = hiss(sec, r, 2400, (t) => (t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) / 0.5)), 1.2);
    mixIn(o, water(sec, r, { at: 0, amount: 0.6, bubbles: 30 }), 0, 0.7);
    const boil = grains(sec, r, { count: 160, span: 1.2, f: 1500, spread: 0.6, decay: 0.004, amp: 0.25, env: (u) => Math.exp(-u * 2) });
    mixIn(o, boil, 0.05, 1);
    return fades(o, 0.001, 0.2);
  },
};

/* ------------------------------------------------------------------ the Kit Rack (UI glass, with a brass detent) */

function detent(r, f, amp = 1) {
  const o = modal(0.15, [[f, 0.02, 1], [f * 2.4, 0.012, 0.4], [f * 4.1, 0.006, 0.2]], r, 0.15);
  return gain(o, amp);
}

export const RACK = {
  /** The half-ring arrives: a glass sweep up the screen's edge and a brass seat. */
  open: (seed) => {
    const r = rng(seed);
    const sec = 0.32;
    const o = buf(sec);
    const sw = pink(0.12, r); biquad(sw, 'bp', (k) => lerp(2200, 4200, k), 2.2); shape(sw, (k) => Math.sin(Math.PI * k), true);
    mixIn(o, gain(sw, 0.9), 0);
    mixIn(o, detent(r, 1760, 0.9), 0.1);
    return fades(o);
  },
  /** A sector passed: one detent. */
  step: (seed) => { const r = rng(seed); return fades(detent(r, 2350 + r() * 40, 1)); },
  /** Let go: the sector taken, a lower double seat. */
  take: (seed) => {
    const r = rng(seed);
    const o = buf(0.3);
    mixIn(o, detent(r, 1320, 1), 0); mixIn(o, detent(r, 1980, 0.7), 0.05);
    return fades(o);
  },
};

/* ------------------------------------------------------------------ the Windwall (pine slats on a rivet, a woven leaf) */

/** Nine slats run across the rivet: clicks at `times`, each a small pine knock. */
function slats(sec, r, times, f0, f1) {
  const o = buf(sec);
  times.forEach((t, i) => {
    const f = lerp(f0, f1, i / Math.max(1, times.length - 1)) * (0.97 + r() * 0.06);
    mixIn(o, wood(0.08, r, f, 0.012), t, 0.6 + 0.4 * r());
  });
  return o;
}

export const WINDWALL = {
  /** The fan opens: nine slats clicking out round the rivet, quickening, and the leaf drawn taut. */
  open: (seed) => {
    const r = rng(seed);
    const sec = 0.55;
    const t = Array.from({ length: 9 }, (_, i) => 0.02 + 0.32 * Math.pow(i / 8, 0.75));
    const o = slats(sec, r, t, 1500, 2100);
    const leaf = pink(sec, r); biquad(leaf, 'bp', (k) => lerp(900, 2600, k), 1.6); shape(leaf, (t2) => (t2 < 0.36 ? t2 / 0.36 : Math.exp(-(t2 - 0.36) / 0.03)));
    mixIn(o, leaf, 0, 0.9);
    mixIn(o, wood(0.15, r, 520, 0.03), 0.36, 0.7);
    return fades(o, 0.001, 0.05);
  },
  /** The fan folds: the slats stack back, slowing, and seat on the forearm. */
  shut: (seed) => {
    const r = rng(seed);
    const sec = 0.55;
    const t = Array.from({ length: 9 }, (_, i) => 0.02 + 0.32 * Math.pow(i / 8, 1.3));
    const o = slats(sec, r, t, 2100, 1400);
    const leaf = pink(sec, r); biquad(leaf, 'bp', (k) => lerp(2200, 800, k), 1.6); shape(leaf, (t2) => (t2 < 0.34 ? 0.6 : Math.exp(-(t2 - 0.34) / 0.03)));
    mixIn(o, leaf, 0, 0.6);
    mixIn(o, wood(0.15, r, 420, 0.035), 0.36, 0.9);
    return fades(o, 0.001, 0.05);
  },
  /** Planted: the rim driven into the ground, the slats shiver, grit settles. */
  plant: (seed) => {
    const r = rng(seed);
    const sec = 1.0;
    const o = thump(sec, r, 110, 55, 0.06, 1.1);
    mixIn(o, grains(sec, r, { count: 120, span: 0.2, f: 2600, spread: 0.6, decay: 0.002, amp: 0.6, env: (u) => Math.exp(-u * 3) }), 0.004);
    const sh = slats(sec, r, Array.from({ length: 9 }, (_, i) => 0.03 + i * 0.022 + r() * 0.01), 1700, 1900);
    mixIn(o, sh, 0, 0.6);
    mixIn(o, wood(0.3, r, 340, 0.06), 0.01, 0.6);
    return fades(o, 0.0005, 0.1);
  },
  /** A blow taken on the face: the pine's thock, the slats rattle against each other. */
  block: (seed) => {
    const r = rng(seed);
    const sec = 0.7;
    const o = thump(sec, r, 150, 80, 0.035, 0.9);
    mixIn(o, wood(0.3, r, 470 + r() * 60, 0.05), 0, 1);
    mixIn(o, slats(sec, r, Array.from({ length: 7 }, () => 0.02 + r() * 0.16), 1500, 2000), 0, 0.7);
    mixIn(o, metal(0.4, r, 1900, { decay: 0.05, bright: 0.4 }), 0.001, 0.25);
    return fades(o, 0.0005, 0.08);
  },
  /** The bash: a short drive of air and the face's hard knock into a hull. */
  bash: (seed) => {
    const r = rng(seed);
    const sec = 0.8;
    const o = whoosh(0.22, r, (k) => lerp(500, 1300, k), 1.0, 0.5);
    const out = buf(sec); mixIn(out, o, 0);
    mixIn(out, thump(sec, r, 120, 60, 0.05, 1.0), 0.2);
    mixIn(out, wood(0.3, r, 400, 0.05), 0.2, 0.9);
    mixIn(out, metal(0.5, r, 820 + r() * 120, { decay: 0.12, bright: 0.6 }), 0.201, 0.5);
    return fades(out, 0.002, 0.08);
  },
  /** A parry at the first instant of the guard: a bright crack of the face, a ring off the struck metal. */
  parry: (seed) => {
    const r = rng(seed);
    const sec = 0.9;
    const o = wood(0.3, r, 820, 0.02);
    mixIn(o, metal(sec, r, 1560, { decay: 0.35, bright: 0.7 }), 0.001, 0.55);
    mixIn(o, burst(sec, r, 'bp', 3200, 1.2, ad(0.0005, 0.012), 0.5), 0);
    return fades(o, 0.0005, 0.15);
  },
};

/* ------------------------------------------------------------------ the gaff (a boat-hook on an ash shaft) */

export const GAFF = {
  /** A light swing: the shaft through the air, the hook's whistle. */
  swing: (seed) => {
    const r = rng(seed);
    const o = whoosh(0.4, r, (k) => lerp(700, 1900, Math.sin(Math.PI * k * 0.9)), 1.6, 0.8);
    const wh = sine(0.4, (t) => 2400 - 900 * t, 0.05); shape(wh, (k) => Math.sin(Math.PI * k), true); mixIn(o, wh);
    return fades(o);
  },
  /** The hook strikes a plate: iron on enamelled brass, a short clank and its ring. */
  hit: (seed) => {
    const r = rng(seed);
    const sec = 0.8;
    const o = metal(sec, r, 690 + r() * 80, { decay: 0.16, bright: 0.8, strike: 0.6 });
    mixIn(o, thump(sec, r, 140, 80, 0.025, 0.6), 0);
    mixIn(o, metal(sec, r, 2150 + r() * 200, { decay: 0.08, bright: 0.5 }), 0.001, 0.35);
    return fades(o, 0.0005, 0.12);
  },
  /** The hook bites: it catches behind a plate's lip with a clank and a grinding scrape as it is set. */
  hook: (seed) => {
    const r = rng(seed);
    const sec = 0.9;
    const o = metal(sec, r, 760, { decay: 0.12, bright: 0.8, strike: 0.5 });
    const scr = pink(sec, r); biquad(scr, 'bp', (k) => lerp(1700, 1100, k), 3); biquad(scr, 'bp', (k) => lerp(1700, 1100, k), 3);
    shape(scr, (t) => (t > 0.05 && t < 0.5 ? Math.sin(Math.PI * (t - 0.05) / 0.45) : 0));
    mixIn(o, scr, 0, 6);
    mixIn(o, creakTrain(0.45, r, (k) => lerp(90, 40, k), 1250, 0.35), 0.06, 1);
    return fades(o, 0.0005, 0.1);
  },
  /** The rip: the wrench, metal shrieking as it gives, the pop, the part's rattle as it falls. */
  rip: (seed) => {
    const r = rng(seed);
    const sec = 1.6;
    const o = buf(sec);
    const shr = saw(0.42, (t) => lerp(820, 1350, t / 0.42) * (1 + 0.04 * Math.sin(TAU * 31 * t)), 14);
    biquad(shr, 'bp', 1900, 1.2); shape(shr, (k) => Math.pow(k, 1.5) * (k < 0.95 ? 1 : (1 - k) / 0.05), true);
    mixIn(o, shr, 0, 0.6);
    mixIn(o, creakTrain(0.42, r, (k) => lerp(40, 160, k), 900, 0.5), 0, 1);
    mixIn(o, metal(1.0, r, 510, { decay: 0.3, bright: 0.9, strike: 0.9 }), 0.42, 1);
    mixIn(o, burst(sec, r, 'bp', 2600, 0.8, (t) => (t < 0.42 ? 0 : ad(0.0005, 0.02)(t - 0.42)), 0.9), 0);
    for (let k = 0; k < 7; k++) mixIn(o, metal(0.3, r, 1400 + r() * 2200, { decay: 0.06, bright: 0.6 }), 0.7 + k * 0.08 + r() * 0.05, 0.25);
    return fades(o, 0.001, 0.15);
  },
};

/* ------------------------------------------------------------------ the pots (Brine and Cinder, thrown clay) */

export const POT = {
  /** Cast: the arm's swing, the pot's slosh leaving the hand. */
  throw: (seed) => {
    const r = rng(seed);
    const sec = 0.6;
    const o = whoosh(0.45, r, (k) => lerp(380, 1100, k), 1.1, 0.7);
    const out = buf(sec); mixIn(out, o, 0);
    const slosh = brown(0.3, r); lp(slosh, 700, 0.8); shape(slosh, (k) => Math.sin(Math.PI * k), true); mixIn(out, slosh, 0.12, 1.4);
    return fades(out, 0.002, 0.06);
  },
  /** A Brine Pot breaks: the clay bursts, the brine splashes and its mist hisses out. */
  break: (seed) => {
    const r = rng(seed);
    const sec = 1.4;
    const o = clay(sec, r, 860 + r() * 120, 1);
    mixIn(o, water(sec, r, { at: 0.01, amount: 0.8, bubbles: 6 }), 0, 0.9);
    mixIn(o, hiss(sec, r, 3600, (t) => (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) / 0.4)), 0.35), 0.03);
    return fades(o, 0.0005, 0.15);
  },
  /** A Cinder Pot breaks: the clay bursts and the cinders flare and crackle. */
  cinder: (seed) => {
    const r = rng(seed);
    const sec = 1.6;
    const o = clay(sec, r, 780 + r() * 120, 1);
    const flare = pink(sec, r); biquad(flare, 'bp', (k) => lerp(500, 1300, Math.min(1, k * 4)), 0.7);
    shape(flare, (t) => (t < 0.03 ? 0 : Math.min(1, (t - 0.03) / 0.08) * Math.exp(-(t - 0.11) * 2.2 * (t > 0.11))));
    mixIn(o, flare, 0, 1.6);
    mixIn(o, grains(sec, r, { count: 70, span: 1.3, at: 0.08, f: 2600, spread: 0.8, decay: 0.004, amp: 0.5, env: (u) => Math.exp(-u * 1.5) }), 0);
    return fades(o, 0.0005, 0.2);
  },
  /** Brine takes a part: salt crystals growing over it in a fine rising crackle, the joint groaning stiff. */
  seize: (seed) => {
    const r = rng(seed);
    const sec = 1.2;
    const o = grains(sec, r, { count: 320, span: 0.9, f: 5200, spread: 0.4, decay: 0.0009, amp: 0.45, env: (u) => Math.min(1, u * 3) * (1 - u * 0.4) });
    mixIn(o, grains(sec, r, { count: 60, span: 0.9, f: 2400, spread: 0.4, decay: 0.002, amp: 0.4 }), 0);
    const groan = creakTrain(0.9, r, (k) => lerp(60, 18, k), 520, 0.45); shape(groan, (k) => Math.sin(Math.PI * k), true);
    mixIn(o, groan, 0.2, 1);
    return fades(o, 0.002, 0.12);
  },
};

/* ------------------------------------------------------------------ the Tiller (a long hull on six stilts, coring) */

export const TILLER = {
  /** A stilt into tilled soil: a soft ground thud, the foot plate's clink, the soil's crumble. */
  step: (seed) => {
    const r = rng(seed);
    const sec = 0.55;
    const o = thump(sec, r, 120, 62, 0.06, 0.95);
    mixIn(o, metal(sec, r, 1250 + r() * 180, { decay: 0.06, bright: 0.5 }), 0.004, 0.4);
    mixIn(o, grains(sec, r, { count: 50, span: 0.12, f: 2300, spread: 0.6, decay: 0.002, amp: 0.4, env: (u) => Math.exp(-u * 3) }), 0.006);
    mixIn(o, metal(0.2, r, 3100 + r() * 300, { decay: 0.02, bright: 0.3 }), 0.07 + r() * 0.03, 0.15);
    return fades(o, 0.0005, 0.06);
  },
  /** Coring (its idle bed, loop): the auger's escapement ticking under a low whine, soil grinding through the drum. */
  idle: (seed) => {
    const r = rng(seed);
    const sec = 4.0, ext = 4.5;
    const w = wander(ext, r, 0.6);
    const o = escapement(ext, r, () => 7, { f: 1900, decay: 0.008, amp: 0.55 });
    mixIn(o, whine(ext, r, (k) => 240 + 12 * w(k * ext), 0.35));
    const grind = brown(ext, r); biquad(grind, 'bp', 420, 0.8); shape(grind, (t) => 0.5 + 0.5 * w(t)); mixIn(o, grind, 0, 1.6);
    mixIn(o, grains(ext, r, { count: Math.round(ext * 30), span: ext, f: 2600, spread: 0.6, decay: 0.0018, amp: 0.18 }), 0);
    return loopify(o, sec, 0.5);
  },
  /**
   * THE TRAMPLE TELL (heard at the wind-up, before the charge): the coring stops dead on a hard ratchet, and the
   * stilts' escapements wind up from a walk to a run under a rising whine and a rattle of the hull's plates. Its onset
   * is a hard ratchet click at 0 s (no fade-in), so it is heard from its first 50 ms.
   */
  trample: (seed) => {
    const r = rng(seed);
    const sec = 1.5;
    const o = buf(sec);
    mixIn(o, metal(0.3, r, 1600, { decay: 0.03, bright: 0.7, strike: 0.9 }), 0, 1);
    mixIn(o, escapement(sec, r, (k) => lerp(9, 34, Math.pow(k, 0.8)), { f: 2200, decay: 0.007, amp: 0.9, env: (k) => (k < 0.85 ? 1 : (1 - k) / 0.15) }), 0.03);
    mixIn(o, whine(sec, r, (k) => lerp(300, 880, Math.pow(k, 0.7)), 0.5), 0);
    mixIn(o, grains(sec, r, { count: 110, span: 1.3, at: 0.05, f: 1500, spread: 0.5, decay: 0.004, amp: 0.35, env: (u) => 0.3 + 0.7 * u }), 0);
    shape(o, (t) => (t < 1.3 ? 1 : Math.max(0, 1 - (t - 1.3) / 0.2)));
    return fades(o, 0.0003, 0.05);
  },
};

/* ------------------------------------------------------------------ the Screed (a walking road-grader on six legs) */

export const SCREED = {
  /** A step's own layer over its heavy footfall: the plated hull's clank, a hydraulic sigh. */
  step: (seed) => {
    const r = rng(seed);
    const sec = 0.8;
    const o = metal(sec, r, 300 + r() * 50, { decay: 0.22, bright: 0.7, strike: 0.6 });
    mixIn(o, metal(sec, r, 980 + r() * 120, { decay: 0.1, bright: 0.5 }), 0.003, 0.4);
    mixIn(o, hiss(sec, r, 1800, (t) => (t < 0.08 ? 0 : ad(0.02, 0.12)(t - 0.08)), 0.25), 0);
    return fades(o, 0.0005, 0.1);
  },
  /** Working (its idle bed, loop): the moldboard's grind on the ground, a pump's whine, the chain's clatter. */
  idle: (seed) => {
    const r = rng(seed);
    const sec = 5.0, ext = 5.5;
    const w = wander(ext, r, 0.5);
    const grind = pink(ext, r); biquad(grind, 'bp', 650, 0.9); shape(grind, (t) => 0.55 + 0.45 * w(t));
    const o = gain(grind, 1.6);
    mixIn(o, whine(ext, r, (k) => 172 + 8 * w(k * ext), 0.4));
    mixIn(o, grains(ext, r, { count: Math.round(ext * 22), span: ext, f: 1800, spread: 0.6, decay: 0.004, amp: 0.3 }), 0);
    mixIn(o, escapement(ext, r, () => 3.2, { f: 900, decay: 0.03, amp: 0.4 }), 0);
    return loopify(o, sec, 0.5);
  },
  /** The charge's wind-up: the blade rams on a climbing ratchet, the pump's whine rising, then the lock's clank. */
  charge: (seed) => {
    const r = rng(seed);
    const sec = 1.6;
    const o = escapement(sec, r, (k) => lerp(6, 26, k), { f: 1300, decay: 0.012, amp: 1, env: (k) => (k < 0.75 ? 0.6 + 0.4 * k / 0.75 : 0) });
    mixIn(o, whine(sec, r, (k) => lerp(150, 520, Math.min(1, k / 0.75)), 0.6), 0);
    mixIn(o, metal(0.8, r, 260, { decay: 0.3, bright: 0.8, strike: 0.9 }), 1.2, 1.1);
    mixIn(o, metal(0.6, r, 820, { decay: 0.15, bright: 0.6 }), 1.201, 0.5);
    shape(o, (t) => (t < 1.15 ? Math.min(1, 0.4 + t / 0.3) : 1));
    return fades(o, 0.0005, 0.1);
  },
  /** THE STALL: the blade's charge stopped dead on a wall: a huge iron-on-stone impact, the drive grinding to a halt. */
  stall: (seed) => {
    const r = rng(seed);
    const sec = 2.4;
    const o = thump(sec, r, 70, 34, 0.22, 1.4);
    mixIn(o, metal(sec, r, 190, { decay: 0.7, bright: 0.9, strike: 1 }), 0.001, 1.1);
    mixIn(o, stone(0.5, r, 520, 0.05, 1.3), 0, 1);
    const grind = pink(sec, r); biquad(grind, 'bp', (k) => lerp(700, 220, k), 1.4); shape(grind, (t) => (t < 0.05 ? 0 : Math.exp(-(t - 0.05) / 0.5)));
    mixIn(o, grind, 0, 2.2);
    mixIn(o, whine(sec, r, (k) => lerp(520, 90, Math.min(1, k * 2.2)), 0.4), 0.02);
    mixIn(o, rubble(sec, r, { at: 0.08, span: 1.3, count: 18, f: 480, amp: 0.7 }), 0);
    return fades(o, 0.0005, 0.3);
  },
  /** A ram seal comes off: the pressure goes with a hiss, the cap pops and clatters, the ram sags on a long groan. */
  seal: (seed) => {
    const r = rng(seed);
    const sec = 1.6;
    const o = metal(sec, r, 640, { decay: 0.2, bright: 0.9, strike: 1 });
    mixIn(o, hiss(sec, r, 2000, (t) => (t < 0.01 ? t / 0.01 : Math.exp(-(t - 0.01) / 0.45)), 1.1), 0);
    for (let k = 0; k < 5; k++) mixIn(o, metal(0.3, r, 1600 + r() * 1600, { decay: 0.05, bright: 0.6 }), 0.25 + k * 0.11 + r() * 0.05, 0.35);
    const sag = creakTrain(0.9, r, (k) => lerp(50, 15, k), 380, 0.5); shape(sag, (k) => Math.sin(Math.PI * k), true);
    mixIn(o, sag, 0.5, 1);
    return fades(o, 0.0005, 0.15);
  },
  /** Brine on a seal: the salt bites in with a hard crackle and the ram stalls against it with a strained whine. */
  seize: (seed) => {
    const r = rng(seed);
    const sec = 1.3;
    const o = grains(sec, r, { count: 260, span: 0.7, f: 4800, spread: 0.45, decay: 0.0012, amp: 0.55, env: (u) => Math.exp(-u * 1.5) });
    mixIn(o, whine(sec, r, (k) => lerp(420, 300, k) * (1 + 0.03 * Math.sin(TAU * 13 * k)), 0.35), 0.1);
    shape(o, (t) => (t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 0.2)));
    mixIn(o, metal(0.4, r, 900, { decay: 0.08, bright: 0.5 }), 0, 0.5);
    return fades(o, 0.001, 0.08);
  },
  /** A wall cut: the moldboard shearing dry-stone to the Datum Line, the courses grinding and falling. */
  cut: (seed) => {
    const r = rng(seed);
    const sec = 2.6;
    const o = buf(sec);
    const shear = pink(sec, r); biquad(shear, 'bp', 520, 0.9); shape(shear, (t) => (t < 0.05 ? t / 0.05 : t < 1.1 ? 1 : Math.exp(-(t - 1.1) / 0.3)));
    mixIn(o, shear, 0, 2.4);
    mixIn(o, rubble(sec, r, { at: 0.05, span: 1.9, count: 34, f: 560, amp: 1 }), 0);
    mixIn(o, thump(sec, r, 80, 42, 0.2, 0.9), 0.9);
    return fades(o, 0.001, 0.3);
  },
};

/* ------------------------------------------------------------------ the re-survey's Alidade (Brea's own, 2D) */

export const RESURVEY = {
  /**
   * The hold on the mark (loop): a glass tone between two detuned partials, the hairs' brass hum under it. The
   * director brings it up while the arc is filling and lets it go when she is off the mark.
   */
  hold: (seed) => {
    const r = rng(seed);
    const sec = 3.0, ext = 3.4;
    const o = sine(ext, 1318.5, 0.35);
    mixIn(o, sine(ext, 1321.2, 0.3));
    mixIn(o, sine(ext, 1975.5, 0.12));
    mixIn(o, sine(ext, 659.3, 0.18));
    const air = pink(ext, r); biquad(air, 'bp', 2640, 6); mixIn(o, air, 0, 0.12);
    shape(o, (t) => 0.85 + 0.15 * Math.sin(TAU * 0.33 * t));
    return loopify(o, sec, 0.4);
  },
  /** A bearing taken on the re-survey: the brass index seats and a glass tone answers, a fifth over the hold. */
  mark: (seed) => {
    const r = rng(seed);
    const sec = 1.1;
    const o = buf(sec);
    mixIn(o, modal(0.2, [[2349, 0.02, 1], [4870, 0.01, 0.4]], r, 0.2), 0, 0.7);
    mixIn(o, glass(sec, r, 1975.5), 0.04, 0.6);
    return fades(o, 0.0005, 0.15);
  },
  /** The re-survey closes, true ground: three glass tones rising (the three marks), held into a chord. */
  true: (seed) => {
    const r = rng(seed);
    const sec = 2.8;
    const o = buf(sec);
    [[1318.5, 0], [1661.2, 0.22], [1975.5, 0.44]].forEach(([f, t]) => mixIn(o, glass(sec - t, r, f), t, 0.6));
    const w = verb(o, { size: 1.2, wet: 0.3, tail: 0 });
    return fades(w.subarray(0, len(sec)).slice(), 0.0005, 0.4);
  },
};

/** Every group of this file, by name (the builder merges them with the slice's). */
export const GROUPS = Object.freeze({ PLACE, HOLDS, FORGE, RACK, WINDWALL, GAFF, POT, TILLER, SCREED, RESURVEY });

