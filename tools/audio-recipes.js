/* eslint-disable */
/**
 * Audio bank synthesis recipes — injected verbatim into a headless Chrome page
 * by tools/audio-bank.mjs and rendered through OfflineAudioContext, then
 * encoded to Ogg/Opus. This file NEVER ships to the browser bundle; the game
 * only ever loads the rendered .ogg files listed in src/audio/manifest.js.
 *
 * Every recipe is `(A) => void` where A is the helper kit built by `kit()`:
 * deterministic RNG, one shared noise buffer, envelope/filter/oscillator
 * shorthands. Determinism matters: `node tools/audio-bank.mjs` must produce the
 * same bank twice so the manifest byte counts stay honest.
 *
 * Licence: everything here is authored for this repository and the rendered
 * output is released CC0-1.0 (see public/audio/MANIFEST.md).
 */
(function attach(global) {
  const SR = 48000;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Helper kit bound to one OfflineAudioContext + one seed. */
  function kit(ac, seed) {
    const R = mulberry32(seed);
    const noise = ac.createBuffer(1, SR * 3, SR);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = R() * 2 - 1;

    const out = ac.destination;
    const F = 1e-4; // exponential-ramp floor (0 is illegal)

    const A = {
      ac, R, out, SR,
      rnd: (a, b) => a + R() * (b - a),
      /** looping-noise source; `rate` pitches the grain. */
      ns(t0, dur, dest, rate = 1) {
        const s = ac.createBufferSource();
        s.buffer = noise; s.loop = true;
        s.playbackRate.value = rate;
        s.connect(dest);
        s.start(t0, R() * 2.5);
        s.stop(t0 + dur + 0.02);
        return s;
      },
      osc(type, f, t0, dur, dest) {
        const o = ac.createOscillator();
        o.type = type; o.frequency.setValueAtTime(f, t0);
        o.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
        return o;
      },
      /** gain node with an attack/decay exponential envelope. */
      env(t0, peak, atk, dec, dest = out) {
        const g = ac.createGain();
        g.gain.setValueAtTime(F, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(peak, F * 2), t0 + Math.max(atk, 0.0005));
        g.gain.exponentialRampToValueAtTime(F, t0 + Math.max(atk, 0.0005) + dec);
        g.gain.setValueAtTime(0, t0 + Math.max(atk, 0.0005) + dec + 0.001);
        g.connect(dest);
        return g;
      },
      /** gain node with a sustained plateau (attack / hold / release). */
      envS(t0, peak, atk, hold, rel, dest = out) {
        const g = ac.createGain();
        g.gain.setValueAtTime(F, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(peak, F * 2), t0 + Math.max(atk, 0.001));
        g.gain.setValueAtTime(Math.max(peak, F * 2), t0 + atk + hold);
        g.gain.exponentialRampToValueAtTime(F, t0 + atk + hold + rel);
        g.gain.setValueAtTime(0, t0 + atk + hold + rel + 0.001);
        g.connect(dest);
        return g;
      },
      flt(type, f, Q, dest = out) {
        const b = ac.createBiquadFilter();
        b.type = type; b.frequency.value = f; if (Q != null) b.Q.value = Q;
        b.connect(dest);
        return b;
      },
      /** one filtered noise burst — the workhorse of every foley cue. */
      burst(t0, dur, { type = 'bandpass', f = 1000, Q = 1, gain = 0.4, atk = 0.002, rate = 1, dest = out, sweepTo = null }) {
        const flt = A.flt(type, f, Q, dest);
        if (sweepTo != null) {
          flt.frequency.setValueAtTime(f, t0);
          flt.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 20), t0 + dur);
        }
        const g = A.env(t0, gain, atk, dur, flt);
        A.ns(t0, dur + atk, g, rate);
        return flt;
      },
      /** metallic partial stack (Chowning-ish inharmonic bell). */
      metal(t0, base, dur, amp, ratios, dest = out) {
        const rs = ratios || [1, 2.76, 5.4, 8.93];
        for (let i = 0; i < rs.length; i++) {
          const d = dur / (1 + i * 0.5);
          const g = A.env(t0 + i * 0.001, amp / (1 + i * 1.5), 0.001, d, dest);
          A.osc(i % 2 ? 'sine' : 'triangle', base * rs[i] * A.rnd(0.99, 1.01), t0, d + 0.02, g);
        }
      },
      /** body thump: a pitched sine that drops as it decays. */
      thump(t0, f, dur, amp, dest = out) {
        const g = A.env(t0, amp, 0.002, dur, dest);
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * 1.9, t0);
        o.frequency.exponentialRampToValueAtTime(f * 0.62, t0 + dur * 0.85);
        o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
      },
      /** amplitude-modulate a destination-bound chain (growl / warble). */
      am(t0, dur, rate, depth, dest) {
        const g = ac.createGain();
        g.gain.value = 1 - depth;
        const lfo = ac.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = rate;
        const lg = ac.createGain(); lg.gain.value = depth;
        lfo.connect(lg).connect(g.gain);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
        g.connect(dest);
        return g;
      },
      /** frequency-swept oscillator (roars, whines, zaps). */
      sweep(type, t0, dur, f0, f1, dest, curve = 'exp') {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t0);
        if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(f1, 12), t0 + dur);
        else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
        o.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
        return o;
      },
      /** stereo spread: pan a sub-chain (only meaningful for 2-channel renders). */
      pan(p, dest = out) {
        if (ac.destination.channelCount < 2) return dest;
        const n = ac.createStereoPanner();
        n.pan.value = p; n.connect(dest);
        return n;
      },
    };
    return A;
  }

  /* ===================================================================== */
  /*  RECIPES                                                              */
  /* ===================================================================== */

  const RECIPES = {};

  /* ---------------------------- footsteps ------------------------------ */
  // Three surfaces the player walks on. world-ground's terrain.surfaceAt(x,z)
  // picks the set; until it lands the bank falls back to 'grass'.
  RECIPES['foot/grass'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.11, { f: A.rnd(1250, 1750), Q: 0.75, gain: 0.42, atk: 0.004 });
    A.burst(t + A.rnd(0.02, 0.04), 0.09, { f: A.rnd(2200, 3000), Q: 0.9, gain: 0.2, atk: 0.004 });
    A.thump(t, 84, 0.09, 0.2);
    A.burst(t, 0.05, { type: 'highpass', f: 5200, gain: 0.07, atk: 0.001 });
  };
  RECIPES['foot/dirt'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.13, { f: A.rnd(420, 640), Q: 1.1, gain: 0.5, atk: 0.002 });
    A.thump(t, 72, 0.12, 0.34);
    A.burst(t + 0.01, 0.055, { type: 'highpass', f: A.rnd(3600, 5000), gain: 0.11, atk: 0.001 });
    A.burst(t + A.rnd(0.03, 0.06), 0.05, { f: A.rnd(900, 1400), Q: 1.4, gain: 0.09, atk: 0.002 });
  };
  RECIPES['foot/rock'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.07, { f: A.rnd(2300, 3200), Q: 1.5, gain: 0.44, atk: 0.001 });
    A.burst(t, 0.022, { type: 'highpass', f: 6200, gain: 0.3, atk: 0.0008 });
    A.thump(t, 118, 0.07, 0.26);
    A.burst(t + 0.012, 0.17, { f: A.rnd(760, 1050), Q: 3.2, gain: 0.07, atk: 0.01 });
    // one loose pebble
    A.burst(t + A.rnd(0.06, 0.13), 0.04, { f: A.rnd(2600, 4200), Q: 3, gain: 0.06, atk: 0.001 });
  };

  /* ------------------------------- bows -------------------------------- */
  // Per-weapon sets so the three bows never share a release (audio-13).
  const BOWS = {
    hunter: { twang: 152, body: 0.9, bright: 1.0 },
    sharpshot: { twang: 196, body: 0.72, bright: 1.35 },
    war: { twang: 112, body: 1.25, bright: 0.78 },
  };
  for (const [name, B] of Object.entries(BOWS)) {
    RECIPES[`bow/${name}/nock`] = (A) => {
      const t = 0.01;
      A.burst(t, 0.03, { type: 'highpass', f: 3000 * B.bright, gain: 0.28, atk: 0.001 });
      A.metal(t, 640 * B.bright, 0.07, 0.1, [1, 2.1, 3.7]);
      A.thump(t, 190 * B.body, 0.05, 0.12);
    };
    RECIPES[`bow/${name}/draw`] = (A) => {
      const t = 0.01, dur = 0.78;
      // stick-slip wood creak: a low saw wobbling under a lowpass
      const lp = A.flt('lowpass', 320 * B.bright, 0.9);
      const g = A.envS(t, 0.16 * B.body, 0.09, dur - 0.34, 0.24, lp);
      const o = A.sweep('sawtooth', t, dur, 44 * B.body, 74 * B.body, g, 'lin');
      const vib = A.ac.createOscillator();
      vib.type = 'sine'; vib.frequency.value = 7.5;
      const vg = A.ac.createGain(); vg.gain.value = 3.4;
      vib.connect(vg).connect(o.frequency); vib.start(t); vib.stop(t + dur);
      // string rasp
      const rg = A.envS(t + 0.05, 0.05, 0.12, dur - 0.4, 0.2, A.flt('bandpass', 2400 * B.bright, 2.2));
      A.ns(t, dur, rg, 0.9);
    };
    RECIPES[`bow/${name}/release`] = (A) => {
      const t = 0.01;
      const tg = A.env(t, 0.5, 0.0015, 0.3 * B.body, A.out);
      A.sweep('triangle', t, 0.3 * B.body, B.twang * 1.18, B.twang * 0.78, tg);
      A.burst(t, 0.06, { f: 2500 * B.bright, Q: 3, gain: 0.3, atk: 0.001 });
      A.burst(t + 0.004, 0.22, { f: 520, Q: 1.2, gain: 0.13, atk: 0.006, sweepTo: 260 });
      A.thump(t, 96 * B.body, 0.1, 0.14);
      A.metal(t + 0.005, 1500 * B.bright, 0.09, 0.05, [1, 1.9, 3.3]);
    };
    RECIPES[`bow/${name}/flyby`] = (A) => {
      const t = 0.02, dur = 0.5;
      // doppler-ish whoosh: bandpass sweeps up then down under a bell envelope
      const f = A.flt('bandpass', 900, 1.6);
      f.frequency.setValueAtTime(700 * B.bright, t);
      f.frequency.exponentialRampToValueAtTime(2100 * B.bright, t + dur * 0.45);
      f.frequency.exponentialRampToValueAtTime(520 * B.bright, t + dur);
      const g = A.env(t, 0.3, dur * 0.42, dur * 0.58, f);
      A.ns(t, dur, g, 1.2);
      const hg = A.env(t + dur * 0.3, 0.08, 0.05, 0.2, A.flt('highpass', 4200));
      A.ns(t + dur * 0.3, 0.26, hg, 1.5);
    };
    RECIPES[`bow/${name}/empty`] = (A) => {
      const t = 0.01;
      A.burst(t, 0.018, { type: 'highpass', f: 5000, gain: 0.3, atk: 0.0008 });
      A.metal(t, 420 * B.bright, 0.045, 0.14, [1, 2.4, 4.1]);
    };
  }

  /* --------------------------- species voices -------------------------- */
  // Eight machines, eight identities. Each gets a windup (the telegraph the
  // player dodges on) and a strike (the commit). audio-02.
  RECIPES['voice/watcher/windup'] = (A) => {
    const t = 0.02, dur = 0.6;
    const am = A.am(t, dur, 34, 0.6, A.flt('bandpass', 1400, 2.2));
    A.sweep('square', t, dur, 880, 1720, A.envS(t, 0.2, 0.03, dur - 0.16, 0.13, am));
    A.burst(t, dur, { type: 'highpass', f: 5200, gain: 0.035, atk: 0.05 });
  };
  // Deliberately the narrowest spectrum in the cast: two tight resonances and
  // no broadband noise at all. The Watcher is a lens on a stalk, not an animal,
  // and this is what keeps it from colliding with the Scrapper's clatter.
  RECIPES['voice/watcher/strike'] = (A) => {
    const t = 0.01, dur = 0.45;
    const g = A.env(t, 0.5, 0.002, dur, A.flt('bandpass', 1950, 9));
    A.sweep('square', t, dur, 2700, 980, g);
    const g2 = A.env(t, 0.16, 0.001, 0.2, A.flt('bandpass', 4200, 12));
    A.sweep('sine', t, 0.22, 5400, 3400, g2);
    A.metal(t + 0.01, 2100, 0.1, 0.05, [1, 2.7]);
  };

  RECIPES['voice/strider/windup'] = (A) => {
    const t = 0.02, dur = 0.7;
    const lp = A.flt('lowpass', 1500, 1.1);
    const g = A.envS(t, 0.22, 0.14, dur - 0.4, 0.26, lp);
    A.sweep('sawtooth', t, dur, 300, 640, g);
    A.sweep('sine', t, dur, 600, 1280, A.envS(t, 0.07, 0.2, dur - 0.45, 0.25, lp));
    A.burst(t, dur, { f: 2200, Q: 1.4, gain: 0.03, atk: 0.15 });
  };
  // Light and airy on purpose: the Strider is prey. A deep body thump here put
  // it inside the Sawtooth's and Thunderjaw's spectra.
  // Warm and tonal, centred in the mids. The airy top end this used to have put
  // it inside the Glinthawk's shriek.
  RECIPES['voice/strider/strike'] = (A) => {
    const t = 0.01, dur = 0.65;
    A.thump(t, 128, 0.14, 0.2);
    const vib = A.am(t, dur, 15, 0.5, A.flt('bandpass', 1050, 3.6));
    const g = A.env(t + 0.02, 0.42, 0.02, dur - 0.12, vib);
    const o = A.sweep('sawtooth', t + 0.02, dur - 0.1, 620, 390, g);
    o.connect(A.flt('bandpass', 2100, 5));
    A.metal(t, 880, 0.22, 0.1, [1, 2.3, 4.4]);
  };

  RECIPES['voice/scrapper/windup'] = (A) => {
    const t = 0.02;
    // accelerating chitter — 9 clicks closing up
    let ct = t;
    for (let i = 0; i < 9; i++) {
      A.burst(ct, 0.028, { f: A.rnd(1500, 2600), Q: 4, gain: 0.26 - i * 0.008, atk: 0.001 });
      A.metal(ct, A.rnd(1100, 1500), 0.05, 0.05, [1, 2.8]);
      ct += 0.085 - i * 0.0055;
    }
    A.burst(t, 0.6, { f: 700, Q: 1.2, gain: 0.045, atk: 0.1 });
  };
  // The Scrapper lives in the low mids: a rasp with a scrapyard of mid metal
  // over it and nothing above 3 kHz, so it never reads as a Watcher.
  // A rattling scavenger, not a predator: no body thump at all, a fast buzzing
  // rasp and a cluster of loose mid-high plates. The growl register belongs to
  // the Sawtooth and the sub to the Behemoth.
  RECIPES['voice/scrapper/strike'] = (A) => {
    const t = 0.01, dur = 0.55;
    const rasp = A.am(t, dur, 62, 0.85, A.flt('bandpass', 1250, 2.2));
    A.sweep('sawtooth', t, dur - 0.06, 330, 215, A.env(t, 0.5, 0.004, dur - 0.08, rasp));
    for (let i = 0; i < 6; i++) {
      A.metal(t + A.rnd(0, 0.28), A.rnd(950, 1650), 0.1, 0.11, [1, 2.3, 3.9]);
    }
    A.burst(t, 0.06, { type: 'highpass', f: 3200, gain: 0.2, atk: 0.001 });
  };

  RECIPES['voice/longleg/windup'] = (A) => {
    const t = 0.02, dur = 0.72;
    const trem = A.am(t, dur, 11, 0.45, A.flt('bandpass', 2400, 3.2));
    A.sweep('triangle', t, dur, 1180, 2650, A.envS(t, 0.22, 0.1, dur - 0.35, 0.24, trem));
    A.sweep('sine', t, dur, 2360, 5300, A.envS(t, 0.05, 0.16, dur - 0.4, 0.23, A.out));
  };
  RECIPES['voice/longleg/strike'] = (A) => {
    const t = 0.01, dur = 0.55;
    const g = A.env(t, 0.4, 0.006, dur, A.flt('bandpass', 3000, 5.5));
    A.sweep('sawtooth', t, dur, 2900, 1450, g);
    A.burst(t, 0.3, { f: 4200, Q: 1.1, gain: 0.22, atk: 0.004, sweepTo: 1600 });
    A.thump(t, 130, 0.12, 0.16);
  };

  RECIPES['voice/glinthawk/windup'] = (A) => {
    const t = 0.02, dur = 0.8;
    // wing beats + a rising turbine
    for (let i = 0; i < 5; i++) {
      const wt = t + i * 0.145;
      A.burst(wt, 0.1, { f: A.rnd(280, 420), Q: 0.9, gain: 0.2, atk: 0.02, rate: 0.7 });
    }
    A.sweep('sawtooth', t, dur, 640, 1420, A.envS(t, 0.12, 0.22, dur - 0.5, 0.28, A.flt('bandpass', 1600, 2.4)));
  };
  // The top of the cast: a metal shriek and wing wash with no mid body at all.
  RECIPES['voice/glinthawk/strike'] = (A) => {
    const t = 0.01, dur = 0.62;
    const g = A.env(t, 0.36, 0.004, dur, A.flt('bandpass', 3400, 6));
    A.sweep('square', t, dur, 2900, 1650, g);
    A.metal(t, 2900, 0.3, 0.15, [1, 2.4, 4.8, 7.1]);
    A.burst(t, 0.34, { type: 'highpass', f: 5200, gain: 0.16, atk: 0.01, rate: 1.4 });
  };

  RECIPES['voice/sawtooth/windup'] = (A) => {
    const t = 0.02, dur = 0.8;
    const growl = A.am(t, dur, 19, 0.7, A.flt('lowpass', 760, 1.4));
    A.sweep('sawtooth', t, dur, 84, 128, A.envS(t, 0.4, 0.13, dur - 0.4, 0.27, growl));
    A.burst(t, dur, { f: 340, Q: 1.6, gain: 0.06, atk: 0.2 });
  };
  RECIPES['voice/sawtooth/strike'] = (A) => {
    const t = 0.01, dur = 1.0;
    const growl = A.am(t, dur, 24, 0.55, A.out);
    const f1 = A.flt('bandpass', 640, 2.4, growl);
    const f2 = A.flt('bandpass', 1450, 3.2, growl);
    const g = A.envS(t, 0.5, 0.02, dur * 0.42, dur * 0.5, A.out);
    const o = A.sweep('sawtooth', t, dur, 152, 94, g);
    o.connect(f1); o.connect(f2);
    // mid-weight body: the sub belongs to the Behemoth and the Thunderjaw
    A.thump(t, 94, 0.28, 0.22);
    A.burst(t, 0.5, { f: 900, Q: 0.9, gain: 0.09, atk: 0.02, sweepTo: 420 });
    A.metal(t + 0.03, 430, 0.26, 0.07, [1, 2.76, 5.4]);
  };

  RECIPES['voice/behemoth/windup'] = (A) => {
    const t = 0.02, dur = 0.95;
    const rum = A.am(t, dur, 6.5, 0.5, A.flt('lowpass', 300, 1.1));
    A.sweep('sawtooth', t, dur, 42, 58, A.envS(t, 0.55, 0.2, dur - 0.55, 0.34, rum));
    A.burst(t, dur, { f: 190, Q: 1.2, gain: 0.09, atk: 0.3 });
    A.metal(t + dur * 0.6, 240, 0.3, 0.05, [1, 2.1, 3.6]);
  };
  RECIPES['voice/behemoth/strike'] = (A) => {
    const t = 0.01, dur = 1.35;
    const g = A.envS(t, 0.62, 0.03, dur * 0.4, dur * 0.55, A.flt('lowpass', 620, 1.2));
    const o = A.sweep('sawtooth', t, dur, 64, 37, g);
    A.am(t, dur, 11, 0.4, A.out).gain.value = 1;
    o.connect(A.flt('bandpass', 210, 2.4));
    A.thump(t, 48, 0.5, 0.5);
    A.burst(t, 0.7, { f: 620, Q: 0.8, gain: 0.1, atk: 0.03, sweepTo: 180 });
    A.metal(t + 0.06, 300, 0.55, 0.09, [1, 1.94, 3.3, 5.8]);
  };

  RECIPES['voice/thunderjaw/windup'] = (A) => {
    const t = 0.02, dur = 1.0;
    A.sweep('sawtooth', t, dur, 118, 268, A.envS(t, 0.3, 0.2, dur - 0.55, 0.33, A.flt('bandpass', 900, 2.8)));
    A.sweep('sine', t, dur, 34, 44, A.envS(t, 0.5, 0.25, dur - 0.5, 0.24, A.out));
    A.burst(t, dur, { f: 1500, Q: 1.5, gain: 0.05, atk: 0.35, sweepTo: 3200 });
    A.metal(t + dur * 0.55, 520, 0.35, 0.06, [1, 2.5, 4.2]);
  };
  RECIPES['voice/thunderjaw/strike'] = (A) => {
    const t = 0.01, dur = 1.45;
    const growl = A.am(t, dur, 15, 0.5, A.flt('lowpass', 900, 1.3));
    const o = A.sweep('sawtooth', t, dur, 92, 44, A.envS(t, 0.66, 0.02, dur * 0.35, dur * 0.6, growl));
    o.connect(A.flt('bandpass', 260, 3));
    o.connect(A.flt('bandpass', 640, 4));
    A.thump(t, 42, 0.55, 0.55);
    A.burst(t, 0.16, { type: 'highpass', f: 2600, gain: 0.24, atk: 0.001 });
    A.burst(t, 0.85, { f: 1150, Q: 0.9, gain: 0.11, atk: 0.02, sweepTo: 300 });
    A.metal(t + 0.02, 380, 0.7, 0.11, [1, 2.76, 5.4, 8.93]);
    // the disc-launcher ring: a bright metal lobe on top of a sub roar. Nothing
    // else in the cast is bimodal, which is what makes it unmistakable.
    A.metal(t + 0.05, 2700, 0.3, 0.1, [1, 2.4, 4.1]);
    A.burst(t + 0.01, 0.09, { type: 'highpass', f: 5400, gain: 0.22, atk: 0.001 });
  };

  /* ------------------------- machine footfalls ------------------------- */
  // Emitted from GaitController._footfall via 'machine-footfall' (audio-07).
  RECIPES['mstep/light'] = (A) => {
    const t = 0.01;
    A.thump(t, 152, 0.1, 0.32);
    A.metal(t, 900, 0.1, 0.07, [1, 2.6, 4.3]);
    A.burst(t, 0.05, { type: 'highpass', f: 4200, gain: 0.1, atk: 0.001 });
    A.burst(t + 0.03, 0.07, { f: A.rnd(1500, 2200), Q: 3, gain: 0.05, atk: 0.004 });
  };
  RECIPES['mstep/medium'] = (A) => {
    const t = 0.01;
    A.thump(t, 96, 0.17, 0.46);
    A.metal(t, 560, 0.2, 0.1, [1, 2.76, 5.4]);
    A.burst(t, 0.09, { f: 700, Q: 1.1, gain: 0.16, atk: 0.002 });
    A.burst(t + 0.04, 0.1, { type: 'highpass', f: 3400, gain: 0.06, atk: 0.004 });
  };
  RECIPES['mstep/heavy'] = (A) => {
    const t = 0.01;
    A.thump(t, 54, 0.34, 0.62);
    A.thump(t + 0.012, 88, 0.2, 0.28);
    A.metal(t + 0.01, 300, 0.36, 0.12, [1, 1.94, 3.6, 6.1]);
    A.burst(t, 0.22, { f: 420, Q: 0.8, gain: 0.2, atk: 0.003, sweepTo: 150 });
    A.burst(t + 0.02, 0.14, { type: 'highpass', f: 2600, gain: 0.07, atk: 0.006 });
  };

  /* ----------------------------- hit ladder ---------------------------- */
  // Four rungs: glance, solid, armour-break, weak-point crit (audio-10).
  RECIPES['hit/plink'] = (A) => {
    const t = 0.01;
    A.metal(t, A.rnd(1350, 1750), 0.13, 0.3, [1, 2.76, 5.4, 8.93]);
    A.burst(t, 0.02, { type: 'highpass', f: 6000, gain: 0.22, atk: 0.0008 });
  };
  RECIPES['hit/thunk'] = (A) => {
    const t = 0.01;
    A.metal(t, A.rnd(430, 560), 0.24, 0.34, [1, 2.76, 5.4]);
    A.thump(t, 118, 0.14, 0.3);
    A.burst(t, 0.04, { type: 'highpass', f: 3500, gain: 0.16, atk: 0.001 });
  };
  RECIPES['hit/crunch'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.16, { f: A.rnd(800, 1100), Q: 1.1, gain: 0.42, atk: 0.001 });
    A.metal(t, A.rnd(320, 420), 0.3, 0.26, [1, 2.4, 4.7, 7.9]);
    A.thump(t, 92, 0.2, 0.36);
    for (let i = 0; i < 4; i++) {
      A.burst(t + 0.03 + A.rnd(0, 0.14), 0.03, { f: A.rnd(2200, 4800), Q: 4, gain: 0.09, atk: 0.001 });
    }
  };
  RECIPES['hit/crit'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.03, { type: 'highpass', f: 7000, gain: 0.4, atk: 0.0006 });
    const zg = A.env(t, 0.3, 0.002, 0.32, A.flt('bandpass', 2600, 2.2));
    A.sweep('square', t, 0.32, 3400, 700, zg);
    A.metal(t, 720, 0.42, 0.24, [1, 2.76, 5.4, 8.93]);
    A.thump(t, 62, 0.28, 0.46);
  };

  /* --------------------------- flesh / ground -------------------------- */
  RECIPES['hit/flesh-soft'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.1, { f: 260, Q: 1.3, gain: 0.4, atk: 0.001 });
    A.thump(t, 74, 0.13, 0.3);
    A.burst(t + 0.01, 0.05, { f: 1300, Q: 1.6, gain: 0.1, atk: 0.002 });
  };
  RECIPES['hit/flesh-hard'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.13, { f: 340, Q: 1.0, gain: 0.52, atk: 0.001 });
    A.thump(t, 58, 0.2, 0.44);
    A.burst(t, 0.03, { type: 'highpass', f: 3000, gain: 0.16, atk: 0.001 });
    A.burst(t + 0.02, 0.14, { f: 900, Q: 2.4, gain: 0.1, atk: 0.004 });
  };
  RECIPES['hit/ground'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.09, { f: 480, Q: 1.2, gain: 0.34, atk: 0.001 });
    A.thump(t, 96, 0.09, 0.22);
    // shaft rattle
    for (let i = 0; i < 3; i++) A.metal(t + 0.05 + i * 0.045, A.rnd(1600, 2400), 0.06, 0.05, [1, 2.2]);
  };

  /* ------------------------- machine behaviour ------------------------- */
  RECIPES['machine/servo-loop'] = (A) => {
    const dur = 3.6;
    const g = A.envS(0, 0.12, 0.25, dur - 0.5, 0.25, A.flt('bandpass', 620, 2.6));
    const am = A.am(0, dur, 3.1, 0.35, g);
    A.osc('sawtooth', 218, 0, dur, am);
    A.osc('sine', 437, 0, dur, A.envS(0, 0.035, 0.3, dur - 0.6, 0.3, A.out));
    for (let t = 0.2; t < dur - 0.2; t += A.rnd(0.35, 0.8)) {
      A.metal(t, A.rnd(1800, 2600), 0.03, 0.03, [1, 2.5]);
    }
  };
  RECIPES['machine/stagger'] = (A) => {
    const t = 0.01, dur = 0.95;
    A.sweep('sawtooth', t, dur, 300, 96, A.env(t, 0.3, 0.01, dur, A.flt('lowpass', 900, 1.5)));
    A.metal(t, 380, 0.45, 0.2, [1, 2.76, 5.4]);
    A.thump(t + 0.05, 70, 0.3, 0.36);
    for (let i = 0; i < 6; i++) {
      A.metal(t + 0.1 + A.rnd(0, 0.5), A.rnd(900, 2400), 0.07, 0.06, [1, 2.4, 4.1]);
    }
    A.burst(t, 0.35, { f: 700, Q: 1.1, gain: 0.11, atk: 0.006, sweepTo: 240 });
  };
  RECIPES['machine/powerdown'] = (A) => {
    const t = 0.01, dur = 1.5;
    A.sweep('sawtooth', t, dur, 820, 52, A.envS(t, 0.28, 0.01, dur - 0.4, 0.38, A.flt('lowpass', 1400, 1.2)));
    A.sweep('sine', t, dur, 1640, 74, A.envS(t, 0.07, 0.02, dur - 0.5, 0.4, A.out));
    for (let i = 0; i < 5; i++) A.metal(t + 0.2 + i * A.rnd(0.16, 0.3), A.rnd(500, 1200), 0.05, 0.07, [1, 2.6]);
    A.thump(t + dur - 0.28, 44, 0.35, 0.42);
    A.burst(t + dur - 0.28, 0.24, { f: 260, Q: 1, gain: 0.13, atk: 0.004 });
  };
  RECIPES['machine/scan-ping'] = (A) => {
    const t = 0.01, dur = 0.75;
    const g = A.env(t, 0.3, 0.004, 0.2, A.flt('bandpass', 1700, 4));
    A.sweep('sine', t, 0.22, 1250, 1950, g);
    // one soft return echo
    const g2 = A.env(t + 0.3, 0.11, 0.01, 0.28, A.flt('bandpass', 1500, 3));
    A.sweep('sine', t + 0.3, 0.3, 1900, 1150, g2);
    A.burst(t, 0.1, { type: 'highpass', f: 6000, gain: 0.05, atk: 0.004 });
  };
  RECIPES['machine/alarm'] = (A) => {
    const t = 0.01;
    for (let i = 0; i < 4; i++) {
      const st = t + i * 0.17;
      const g = A.envS(st, 0.26, 0.006, 0.09, 0.04, A.flt('bandpass', i % 2 ? 1320 : 880, 5));
      A.osc('square', i % 2 ? 1320 : 880, st, 0.14, g);
    }
    A.burst(t, 0.7, { f: 2600, Q: 1.4, gain: 0.035, atk: 0.02 });
  };

  /* ------------------------------ Aloy foley --------------------------- */
  // D2: no VO. Breath and gear only.
  RECIPES['aloy/breath-in'] = (A) => {
    const t = 0.01, dur = 0.45;
    A.burst(t, dur, { f: 620, Q: 1.6, gain: 0.15, atk: 0.16, sweepTo: 1250, rate: 0.85 });
    A.burst(t, dur, { type: 'highpass', f: 2600, gain: 0.05, atk: 0.2 });
  };
  RECIPES['aloy/breath-out'] = (A) => {
    const t = 0.01, dur = 0.55;
    A.burst(t, dur, { f: 1150, Q: 1.4, gain: 0.16, atk: 0.05, sweepTo: 460, rate: 0.9 });
    A.burst(t, dur * 0.7, { type: 'highpass', f: 2200, gain: 0.04, atk: 0.04 });
  };
  RECIPES['aloy/effort'] = (A) => {
    const t = 0.01, dur = 0.32;
    A.burst(t, dur, { f: 780, Q: 2.4, gain: 0.22, atk: 0.012, sweepTo: 420 });
    A.thump(t, 130, 0.12, 0.09);
  };
  RECIPES['aloy/hurt'] = (A) => {
    const t = 0.01, dur = 0.42;
    A.burst(t, dur, { f: 520, Q: 3.2, gain: 0.26, atk: 0.008, sweepTo: 300 });
    A.burst(t, 0.18, { f: 1600, Q: 2.2, gain: 0.09, atk: 0.006 });
    A.thump(t, 110, 0.16, 0.11);
  };
  RECIPES['gear/light'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.09, { f: 1900, Q: 1.4, gain: 0.13, atk: 0.006 });
    A.metal(t + 0.02, 2600, 0.06, 0.04, [1, 2.3]);
  };
  RECIPES['gear/heavy'] = (A) => {
    const t = 0.01;
    A.burst(t, 0.14, { f: 900, Q: 1.1, gain: 0.19, atk: 0.005 });
    A.metal(t + 0.01, 1400, 0.13, 0.09, [1, 2.6, 4.4]);
    A.thump(t, 92, 0.09, 0.11);
  };

  /* ---------------------------- ambience beds -------------------------- */
  // Stereo, ~13 s, crossfade-looped at runtime by LoopEmitter (audio-11).
  RECIPES['amb/meadow'] = (A) => {
    const dur = 13;
    for (const [f, p, q] of [[380, -0.55, 0.7], [470, 0.55, 0.7], [900, 0.15, 0.5]]) {
      const dest = A.pan(p);
      const flt = A.flt('bandpass', f, q, dest);
      const g = A.ac.createGain(); g.gain.value = 0.11; g.connect(flt);
      A.ns(0, dur, g, 1);
      // slow gusts
      const lfo = A.ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07 + A.rnd(0, 0.06);
      const lg = A.ac.createGain(); lg.gain.value = 0.06;
      lfo.connect(lg).connect(g.gain); lfo.start(0); lfo.stop(dur);
    }
    // low bed
    const lg = A.ac.createGain(); lg.gain.value = 0.07;
    lg.connect(A.flt('lowpass', 210, 0.8));
    A.ns(0, dur, lg, 0.35);
    // insects
    for (let t = 0.4; t < dur - 0.6; t += A.rnd(0.5, 1.5)) {
      const p = A.pan(A.rnd(-0.85, 0.85));
      const g = A.env(t, 0.012, 0.08, 0.22, A.flt('bandpass', A.rnd(4200, 6400), 12, p));
      A.ns(t, 0.3, g, 1);
    }
    // birds
    for (let t = 1.2; t < dur - 1.4; t += A.rnd(2.2, 4.2)) {
      const p = A.pan(A.rnd(-0.9, 0.9));
      const n = 2 + ((A.R() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const st = t + i * A.rnd(0.06, 0.14);
        const g = A.env(st, 0.05, 0.008, A.rnd(0.05, 0.12), p);
        A.sweep('sine', st, 0.14, A.rnd(2100, 3200), A.rnd(2600, 4200), g);
      }
    }
  };
  RECIPES['amb/river'] = (A) => {
    const dur = 13;
    const layers = [[2600, 0.6, -0.6, 0.1], [1500, 0.9, 0.6, 0.13], [700, 1.1, 0.0, 0.12], [280, 1.0, -0.2, 0.09]];
    for (const [f, q, p, amp] of layers) {
      const flt = A.flt('bandpass', f, q, A.pan(p));
      const g = A.ac.createGain(); g.gain.value = amp; g.connect(flt);
      A.ns(0, dur, g, 1);
      const lfo = A.ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.13 + A.rnd(0, 0.4);
      const lg = A.ac.createGain(); lg.gain.value = amp * 0.4;
      lfo.connect(lg).connect(g.gain); lfo.start(0); lfo.stop(dur);
    }
    // burbles
    for (let t = 0.3; t < dur - 0.4; t += A.rnd(0.2, 0.7)) {
      const p = A.pan(A.rnd(-0.8, 0.8));
      const g = A.env(t, 0.05, 0.01, A.rnd(0.06, 0.18), p);
      A.sweep('sine', t, 0.2, A.rnd(420, 900), A.rnd(900, 1600), g);
    }
  };
  RECIPES['amb/campfire'] = (A) => {
    const dur = 13;
    const bedFlt = A.flt('lowpass', 700, 0.8);
    const bed = A.ac.createGain(); bed.gain.value = 0.13; bed.connect(bedFlt);
    A.ns(0, dur, bed, 0.6);
    const lfo = A.ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.21;
    const lg = A.ac.createGain(); lg.gain.value = 0.05;
    lfo.connect(lg).connect(bed.gain); lfo.start(0); lfo.stop(dur);
    const hiss = A.ac.createGain(); hiss.gain.value = 0.03;
    hiss.connect(A.flt('bandpass', 2400, 0.9));
    A.ns(0, dur, hiss, 1.1);
    // crackle pops
    for (let t = 0.15; t < dur - 0.2; t += A.rnd(0.03, 0.22)) {
      const p = A.pan(A.rnd(-0.7, 0.7));
      A.burst(t, A.rnd(0.01, 0.045), { f: A.rnd(1200, 5200), Q: A.rnd(2, 7), gain: A.rnd(0.03, 0.19), atk: 0.0008, dest: p });
    }
    // occasional log settle
    for (let t = 2.5; t < dur - 1; t += A.rnd(3, 5.5)) {
      A.burst(t, 0.24, { f: A.rnd(260, 420), Q: 1.4, gain: 0.13, atk: 0.004, dest: A.pan(A.rnd(-0.4, 0.4)) });
    }
  };


  /* ===================================================================== */
  /*  MUSIC — the adaptive score (audio-01)                                */
  /* ===================================================================== */
  /**
   * 96 BPM, 4/4: beat 0.625 s, bar 2.5 s, phrase (4 bars) 10.0 s.
   *
   * Two rules make these stems loop and layer without a seam:
   *  1. **Every sustained partial is rounded to 0.1 Hz**, so it completes an
   *     integer number of cycles in exactly 10.0 s and the loop point is
   *     phase-continuous. A tempered E3 of 164.81 Hz would leave 0.1 of a
   *     cycle hanging and click once per phrase, on every stem, forever.
   *  2. **Sustained layers use a flat gain, never an attack envelope.** A pad
   *     that ramps in at t=0 dips at every loop boundary because the tail of
   *     the previous pass is still at full level. Envelopes are only for
   *     things that are meant to be struck.
   *
   * Stems render 10.6 s and `MusicDirector` loops at exactly 10.0 s. That
   * 0.6 s of overhang exists because MediaRecorder truncates ~40 ms of tail;
   * without it the encoder's loss would land inside the loop.
   */
  const BPM = 96;
  const BEAT = 60 / BPM;          // 0.625
  const BAR = BEAT * 4;           // 2.5
  const PHRASE = BAR * 4;         // 10.0
  const MDUR = PHRASE + 0.6;      // rendered length

  /** A natural minor, snapped to 0.1 Hz (see rule 1). */
  const N = {
    A0: 27.5, E1: 41.2, A1: 55.0, C2: 65.4, E2: 82.4, G2: 98.0,
    A2: 110.0, C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6, G3: 196.0,
    A3: 220.0, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392.0,
    A4: 440.0, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784.0, A5: 880.0,
  };

  /** Flat-gain sustained voice — the only safe way to hold a note across a loop. */
  function hold(A, type, f, amp, dest, dur = MDUR) {
    const g = A.ac.createGain();
    g.gain.value = amp;
    g.connect(dest);
    const o = A.ac.createOscillator();
    o.type = type; o.frequency.value = f;
    o.connect(g); o.start(0); o.stop(dur);
    return g;
  }

  /** Phase-continuous LFO (rate must be a multiple of 0.1 Hz). */
  function lfoOn(A, param, rate, depth, dur = MDUR) {
    const o = A.ac.createOscillator();
    o.type = 'sine'; o.frequency.value = rate;
    const g = A.ac.createGain(); g.gain.value = depth;
    o.connect(g).connect(param);
    o.start(0); o.stop(dur);
  }

  /** Hammered-dulcimer note: struck string, near-harmonic partials, wooden body. */
  function pluck(A, t, f, amp, dur, dest) {
    const rs = [1, 2.0, 3.01, 4.17, 5.4];
    for (let i = 0; i < rs.length; i++) {
      const d = dur / (1 + i * 0.62);
      const g = A.env(t, amp / (1 + i * 1.35), 0.0015, d, dest);
      A.osc(i === 0 ? 'triangle' : 'sine', f * rs[i], t, d + 0.02, g);
    }
    // hammer felt
    A.burst(t, 0.03, { type: 'bandpass', f: f * 6, Q: 1.2, gain: amp * 0.22, atk: 0.0008, dest });
  }

  /** Taiko / frame drum: pitched membrane drop plus skin slap. */
  function drum(A, t, f, amp, dur, dest, bright = 1) {
    A.thump(t, f, dur, amp, dest);
    A.burst(t, 0.045 * bright, { type: 'bandpass', f: 420 * bright, Q: 0.8, gain: amp * 0.5, atk: 0.001, dest });
    A.burst(t, 0.016, { type: 'highpass', f: 3200 * bright, gain: amp * 0.22, atk: 0.0006, dest });
  }

  function shaker(A, t, amp, dest, len = 0.045) {
    A.burst(t, len, { type: 'highpass', f: 6800, gain: amp, atk: 0.003, dest, rate: 1.3 });
  }

  function clap(A, t, amp, dest) {
    for (let i = 0; i < 3; i++) {
      A.burst(t + i * 0.009, 0.055 - i * 0.012, {
        type: 'bandpass', f: 1500 + i * 260, Q: 1.1, gain: amp * (1 - i * 0.22), atk: 0.0008, dest,
      });
    }
  }

  /* ------------------------------ calm --------------------------------- */
  // The exploration bed. No pulse at all: the valley is the melody and this
  // just gives it a floor and a colour.
  RECIPES['music/pad-calm'] = (A) => {
    const wide = A.pan(0), left = A.pan(-0.6), right = A.pan(0.6);
    const lp = A.flt('lowpass', 900, 0.7, wide);
    // root + fifth + octave, each a detuned pair. Offsets are 0.2/0.3 Hz —
    // multiples of 0.1 so they stay phase-continuous while they beat.
    hold(A, 'sawtooth', N.A1, 0.10, lp);
    hold(A, 'sawtooth', N.A1 + 0.2, 0.09, lp);
    hold(A, 'sawtooth', N.E2, 0.06, lp);
    hold(A, 'sawtooth', N.E2 + 0.3, 0.055, lp);
    hold(A, 'sine', N.A2, 0.07, lp);
    // slow filter swell, one cycle per phrase
    lfoOn(A, lp.frequency, 0.1, 420);
    // an airy upper third that breathes across the phrase
    const air = A.flt('bandpass', 1800, 1.1, left);
    const ag = hold(A, 'triangle', N.C4, 0.022, air);
    lfoOn(A, ag.gain, 0.2, 0.016);
    const air2 = A.flt('bandpass', 2200, 1.2, right);
    const ag2 = hold(A, 'triangle', N.E4, 0.017, air2);
    lfoOn(A, ag2.gain, 0.1, 0.013);
    // valley wash: very low noise, inaudible as noise, audible as space
    const wash = A.ac.createGain(); wash.gain.value = 0.02;
    wash.connect(A.flt('lowpass', 640, 0.6, wide));
    A.ns(0, MDUR, wash, 0.5);
  };

  // The melodic layer that reads as "Horizon": a pentatonic dulcimer figure
  // that never resolves, over a bar-long tail.
  RECIPES['music/pluck-calm'] = (A) => {
    const L = A.pan(-0.35), R = A.pan(0.35), C = A.pan(0.05);
    // bar 1..4, positions in beats. A - C - E - D - E - G - A - E
    const fig = [
      [0.0, N.A3, 0.30, C], [1.5, N.C4, 0.24, L], [2.0, N.E4, 0.26, R],
      [3.5, N.D4, 0.20, C],
      [4.0, N.E4, 0.28, L], [5.0, N.G4, 0.22, R], [6.5, N.A4, 0.26, C],
      [7.0, N.E4, 0.18, L],
      [8.0, N.A3, 0.28, C], [9.5, N.C4, 0.22, R], [10.0, N.D4, 0.24, L],
      [11.5, N.A3, 0.18, C],
      [12.0, N.G3, 0.26, R], [13.0, N.E4, 0.20, C], [14.0, N.C4, 0.24, L],
      [15.0, N.A3, 0.30, C],
    ];
    for (const [b, f, amp, dest] of fig) {
      const t = b * BEAT;
      if (t > PHRASE - 0.05) continue;
      pluck(A, t, f, amp, Math.min(1.6, PHRASE - t), dest);
    }
    // a struck-metal answer once per phrase, off the grid on purpose
    A.metal(BEAT * 6.75, N.A5, 1.1, 0.05, [1, 2.4, 3.9], A.pan(0.7));
  };

  /* --------------------------- suspicious ------------------------------ */
  // Not music yet — a held breath. One low pulse per beat and a bowed swell
  // that arrives on the bar.
  RECIPES['music/drone-tense'] = (A) => {
    const C = A.pan(0), L = A.pan(-0.5), R = A.pan(0.5);
    const lp = A.flt('lowpass', 420, 1.0, C);
    hold(A, 'sawtooth', N.A1, 0.13, lp);
    hold(A, 'sawtooth', N.A1 + 0.3, 0.11, lp);
    // the minor second above the root: the interval that makes a room tighten
    hold(A, 'sine', N.C2 - 0.6, 0.045, A.flt('lowpass', 300, 0.9, L));
    lfoOn(A, lp.frequency, 0.4, 150);
    // heartbeat pulse on every beat, dropping in level across the phrase
    for (let b = 0; b < 16; b++) {
      const t = b * BEAT;
      A.thump(t, 44, 0.24, 0.13 - (b % 4) * 0.012, C);
    }
    // bowed-metal swell into each bar
    for (let bar = 0; bar < 4; bar++) {
      const t = bar * BAR + BAR * 0.55;
      const dest = bar % 2 ? R : L;
      const g = A.env(t, 0.05, BAR * 0.4, BAR * 0.42, A.flt('bandpass', 1400, 3.2, dest));
      A.sweep('sawtooth', t, BAR * 0.85, N.E3, N.F3, g, 'lin');
    }
  };

  RECIPES['music/perc-tense'] = (A) => {
    const C = A.pan(0), L = A.pan(-0.45), R = A.pan(0.45);
    for (let bar = 0; bar < 4; bar++) {
      const b0 = bar * BAR;
      drum(A, b0, 96, 0.34, 0.2, C, 0.9);                    // beat 1
      drum(A, b0 + BEAT * 2, 88, 0.22, 0.18, C, 0.85);        // beat 3
      if (bar % 2 === 1) drum(A, b0 + BEAT * 3.5, 128, 0.14, 0.12, R, 1.1);
      // shaker on the offbeats, alternating sides
      for (let e = 0; e < 8; e++) {
        const t = b0 + e * (BEAT / 2);
        if (e % 2 === 0) continue;
        shaker(A, t, 0.055 + (e === 3 ? 0.03 : 0), e % 4 === 1 ? L : R, 0.035);
      }
      // rim tick, one per bar, moving through the bar
      A.burst(b0 + BEAT * (1 + bar * 0.5), 0.02, {
        type: 'bandpass', f: 2600, Q: 4, gain: 0.1, atk: 0.0008, dest: L,
      });
    }
  };

  /* ----------------------------- combat -------------------------------- */
  // The tribal kit. Deep taiko on the downbeat, syncopated toms, 16th shakers
  // and a clap on 2 and 4 — the pattern that makes a Sawtooth fight read as a
  // hunt instead of a chase.
  RECIPES['music/drums-combat'] = (A) => {
    const C = A.pan(0), L = A.pan(-0.55), R = A.pan(0.55), LL = A.pan(-0.8), RR = A.pan(0.8);
    for (let bar = 0; bar < 4; bar++) {
      const b0 = bar * BAR;
      drum(A, b0, 58, 0.72, 0.38, C, 0.85);                   // taiko, beat 1
      drum(A, b0 + BEAT * 1.5, 62, 0.34, 0.26, C, 0.9);
      drum(A, b0 + BEAT * 2.5, 58, 0.46, 0.32, C, 0.85);
      if (bar % 2 === 1) drum(A, b0 + BEAT * 3.75, 70, 0.3, 0.2, C, 1.0);
      // toms answer the kick, panned wide
      drum(A, b0 + BEAT * 1, 148, 0.3, 0.2, L, 1.15);
      drum(A, b0 + BEAT * 3, 124, 0.34, 0.22, R, 1.1);
      if (bar === 3) {
        drum(A, b0 + BEAT * 3.25, 176, 0.26, 0.16, LL, 1.2);
        drum(A, b0 + BEAT * 3.5, 148, 0.3, 0.16, RR, 1.2);
        drum(A, b0 + BEAT * 3.75, 124, 0.34, 0.18, C, 1.15);
      }
      clap(A, b0 + BEAT, 0.2, R);
      clap(A, b0 + BEAT * 3, 0.2, L);
      for (let s = 0; s < 16; s++) {
        const t = b0 + s * (BEAT / 4);
        if (t >= PHRASE - 0.02) break;
        shaker(A, t, s % 4 === 0 ? 0.075 : s % 2 === 0 ? 0.045 : 0.03, s % 2 ? LL : RR, 0.03);
      }
    }
  };

  RECIPES['music/bass-combat'] = (A) => {
    const C = A.pan(0);
    const notes = [
      [0, N.A1, 1.5], [1.5, N.A1, 0.5], [2, N.A1, 1], [3, N.C2, 1],
      [4, N.A1, 1.5], [5.5, N.G2 / 2, 0.5], [6, N.A1, 1], [7, N.E2 / 2, 1],
      [8, N.A1, 1.5], [9.5, N.A1, 0.5], [10, N.C2, 1], [11, N.C2, 1],
      [12, N.D3 / 2, 1], [13, N.C2, 1], [14, N.A1, 2],
    ];
    for (const [b, f, len] of notes) {
      const t = b * BEAT;
      const d = Math.min(len * BEAT * 0.92, PHRASE - t);
      if (d <= 0.02) continue;
      const lp = A.flt('lowpass', 260, 3.4, C);
      lp.frequency.setValueAtTime(1100, t);
      lp.frequency.exponentialRampToValueAtTime(190, t + Math.min(0.22, d));
      const g = A.envS(t, 0.42, 0.006, Math.max(0.01, d - 0.1), 0.09, lp);
      A.osc('sawtooth', f, t, d + 0.02, g);
      A.osc('square', f * 0.5, t, d + 0.02, A.envS(t, 0.16, 0.008, Math.max(0.01, d - 0.1), 0.09, C));
    }
  };

  // The melodic hook. A bowed/vocal-ish lead over the kit — long notes with a
  // slow vibrato, doubled a fifth up at a fraction of the level.
  RECIPES['music/lead-combat'] = (A) => {
    const C = A.pan(-0.15), W = A.pan(0.25);
    const line = [
      [0, N.A3, 1.5], [1.5, N.C4, 0.5], [2, N.D4, 1], [3, N.C4, 1],
      [4, N.A3, 2], [6, N.G3, 2],
      [8, N.A3, 1.5], [9.5, N.C4, 0.5], [10, N.E4, 1.5], [11.5, N.D4, 0.5],
      [12, N.C4, 2], [14, N.A3, 1.8],
    ];
    for (const [b, f, len] of line) {
      const t = b * BEAT;
      const d = Math.min(len * BEAT * 0.95, PHRASE - t);
      if (d <= 0.03) continue;
      const bp = A.flt('bandpass', f * 2.2, 1.6, C);
      const g = A.envS(t, 0.2, 0.07, Math.max(0.02, d - 0.24), 0.17, bp);
      const o = A.osc('sawtooth', f, t, d + 0.03, g);
      // vibrato: 5.6 Hz, arriving after the attack the way a bow does
      const v = A.ac.createOscillator(); v.type = 'sine'; v.frequency.value = 5.6;
      const vg = A.ac.createGain(); vg.gain.value = 0;
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(f * 0.011, t + Math.min(0.3, d));
      v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + d + 0.03);
      // the fifth above, thin and wide
      const g2 = A.envS(t, 0.055, 0.1, Math.max(0.02, d - 0.3), 0.19, A.flt('bandpass', f * 3.4, 2.4, W));
      A.osc('triangle', f * 1.5, t, d + 0.03, g2);
    }
    // struck metal accent on the last bar — the "machine" in the music
    A.metal(BAR * 3, N.A4, 0.9, 0.09, [1, 2.76, 5.4], W);
  };

  /* ----------------------------- stingers ------------------------------ */
  // One-shots. These are the only music cues that are NOT bar-quantised: a
  // stinger that waits for the bar arrives after the thing it is reacting to.
  RECIPES['music/sting-combat'] = (A) => {
    const t = 0.01, C = A.pan(0), L = A.pan(-0.7), R = A.pan(0.7);
    A.thump(t, 46, 0.9, 0.75, C);
    // a rising noise sheet that lands on the hit
    const rise = A.flt('bandpass', 400, 1.2, C);
    rise.frequency.setValueAtTime(300, t);
    rise.frequency.exponentialRampToValueAtTime(3600, t + 0.34);
    const rg = A.env(t, 0.22, 0.3, 0.22, rise);
    A.ns(t, 0.6, rg, 1.1);
    // minor-second cluster stab
    for (const [f, p] of [[N.A2, C], [N.C3, L], [N.E3, R], [N.A3, C]]) {
      const g = A.env(t + 0.3, 0.2, 0.004, 0.9, A.flt('lowpass', 1800, 1.1, p));
      A.osc('sawtooth', f, t + 0.3, 0.95, g);
    }
    drum(A, t + 0.3, 54, 0.6, 0.5, C, 0.8);
    A.metal(t + 0.3, N.A4, 0.8, 0.1, [1, 2.76, 5.4, 8.93], R);
  };

  RECIPES['music/sting-resolve'] = (A) => {
    const t = 0.01, C = A.pan(0), L = A.pan(-0.5), R = A.pan(0.5);
    // descending A-minor arpeggio, warm, with a long tail
    const arp = [[N.A4, 0, R], [N.E4, 0.13, C], [N.C4, 0.26, L], [N.A3, 0.4, C]];
    for (const [f, dt, p] of arp) pluck(A, t + dt, f, 0.3, 2.0, p);
    // the pad answers underneath and fades out
    const lp = A.flt('lowpass', 800, 0.8, C);
    const g = A.env(t, 0.16, 0.35, 2.3, lp);
    A.osc('sawtooth', N.A1, t, 2.7, g);
    A.osc('sawtooth', N.E2, t, 2.7, A.env(t, 0.1, 0.4, 2.2, lp));
    A.osc('sine', N.A2, t, 2.7, A.env(t, 0.07, 0.5, 2.1, L));
    A.metal(t + 0.05, N.A5, 1.6, 0.05, [1, 2.0, 3.01], R);
  };

  RECIPES['music/sting-alert'] = (A) => {
    const t = 0.01, C = A.pan(0), R = A.pan(0.4);
    // two notes, up a minor third — the universal "it heard you"
    for (const [f, dt, amp] of [[N.E4, 0, 0.26], [N.G4, 0.16, 0.3]]) {
      const g = A.env(t + dt, amp, 0.004, 0.5, A.flt('bandpass', f * 1.8, 2.2, dt ? R : C));
      A.osc('triangle', f, t + dt, 0.55, g);
    }
    A.thump(t, 62, 0.3, 0.28, C);
    A.burst(t + 0.16, 0.3, { type: 'highpass', f: 4200, gain: 0.07, atk: 0.02, dest: R });
  };

  RECIPES['music/sting-discover'] = (A) => {
    const t = 0.02, L = A.pan(-0.4), C = A.pan(0), R = A.pan(0.45);
    const arp = [[N.A3, 0, L], [N.C4, 0.1, C], [N.E4, 0.2, R], [N.A4, 0.3, C], [N.E5, 0.44, R]];
    for (const [f, dt, p] of arp) {
      A.metal(t + dt, f, 1.4 - dt, 0.16, [1, 2.0, 3.01, 4.17], p);
    }
    const g = A.env(t, 0.09, 0.25, 1.6, A.flt('lowpass', 1200, 0.8, C));
    A.osc('sine', N.A2, t, 1.9, g);
  };

  /* ===================================================================== */
  /*  SURFACES the published terrain vocabulary adds (audio-04)            */
  /* ===================================================================== */
  // Terrain.SURFACES is ['water','cobble','silt','dirt','gravel','rock','snow',
  // 'grass']. Three sets covered three of them and folded the rest onto rock
  // or dirt; a river crossing sounded like a gravel path. One set each now.
  RECIPES['foot/gravel'] = (A) => {
    const t = 0.01;
    // scree: a shifting mass of small stones, not one impact
    A.burst(t, 0.1, { f: A.rnd(1500, 2100), Q: 0.8, gain: 0.4, atk: 0.001 });
    A.thump(t, 96, 0.08, 0.22);
    for (let i = 0; i < 7; i++) {
      A.burst(t + A.rnd(0.005, 0.19), 0.028, { f: A.rnd(2400, 5200), Q: 3.4, gain: A.rnd(0.05, 0.13), atk: 0.0008 });
    }
    A.burst(t + 0.02, 0.14, { type: 'highpass', f: 4600, gain: 0.09, atk: 0.004 });
  };
  RECIPES['foot/cobble'] = (A) => {
    const t = 0.01;
    // rounded river stone: a hard knock with a short pitched ring
    A.burst(t, 0.045, { f: A.rnd(1700, 2400), Q: 1.6, gain: 0.42, atk: 0.001 });
    A.metal(t, A.rnd(620, 880), 0.1, 0.12, [1, 2.1, 3.4]);
    A.thump(t, 132, 0.06, 0.24);
    A.burst(t + A.rnd(0.05, 0.12), 0.03, { f: A.rnd(1800, 3000), Q: 5, gain: 0.07, atk: 0.001 });
  };
  RECIPES['foot/silt'] = (A) => {
    const t = 0.01;
    // wet river margin: a soft suck, no click at all
    A.burst(t, 0.17, { f: A.rnd(280, 420), Q: 1.0, gain: 0.48, atk: 0.004, sweepTo: 180 });
    A.thump(t, 62, 0.14, 0.3);
    A.burst(t + 0.05, 0.11, { f: A.rnd(700, 1000), Q: 1.8, gain: 0.09, atk: 0.02, sweepTo: 420 });
  };
  RECIPES['foot/water'] = (A) => {
    const t = 0.01;
    // splash: broadband spray plus a handful of droplet pitches falling back
    A.burst(t, 0.2, { type: 'highpass', f: 1400, gain: 0.42, atk: 0.002, rate: 1.2 });
    A.burst(t, 0.09, { f: 520, Q: 0.9, gain: 0.3, atk: 0.001 });
    A.thump(t, 74, 0.1, 0.16);
    for (let i = 0; i < 6; i++) {
      const st = t + A.rnd(0.05, 0.3);
      const g = A.env(st, A.rnd(0.03, 0.08), 0.002, A.rnd(0.03, 0.08), A.flt('bandpass', A.rnd(900, 2400), 6));
      A.sweep('sine', st, 0.1, A.rnd(1100, 2600), A.rnd(1800, 3800), g);
    }
  };
  RECIPES['foot/snow'] = (A) => {
    const t = 0.01;
    // compacting powder: a dull crush with a high squeak, no ring
    A.burst(t, 0.12, { f: A.rnd(700, 950), Q: 0.7, gain: 0.36, atk: 0.003, rate: 0.8 });
    A.burst(t + 0.01, 0.08, { type: 'highpass', f: A.rnd(5200, 7000), gain: 0.14, atk: 0.006 });
    A.thump(t, 58, 0.1, 0.18);
  };

  /* ===================================================================== */
  /*  PER-SPECIES IDLE BEDS (audio-02)                                     */
  /* ===================================================================== */
  // One shared servo hum told you a machine was near. Eight tell you WHICH —
  // and that is the information a stealth approach is actually played on.
  // Each is 3.2 s, flat-gain (see the music rules) so LoopEmitter's crossfade
  // has something continuous to work with.
  const IDLE = {
    // [carrier, carrierType, band, bandQ, amRate, amDepth, shimmer, tickRate]
    watcher: { f: 640, type: 'square', band: 1900, Q: 4.2, am: 5.6, depth: 0.45, hi: 3400, tick: 0.62, amp: 0.10 },
    strider: { f: 196, type: 'sawtooth', band: 720, Q: 2.0, am: 2.4, depth: 0.3, hi: 2100, tick: 0.9, amp: 0.13 },
    scrapper: { f: 262, type: 'square', band: 1250, Q: 2.6, am: 8.4, depth: 0.55, hi: 2900, tick: 0.34, amp: 0.11 },
    longleg: { f: 330, type: 'triangle', band: 2500, Q: 3.4, am: 3.6, depth: 0.4, hi: 4400, tick: 0.72, amp: 0.10 },
    glinthawk: { f: 420, type: 'sawtooth', band: 3100, Q: 1.8, am: 12.0, depth: 0.6, hi: 5600, tick: 1.4, amp: 0.09 },
    sawtooth: { f: 132, type: 'sawtooth', band: 560, Q: 1.6, am: 1.8, depth: 0.35, hi: 1700, tick: 0.86, amp: 0.15 },
    behemoth: { f: 58, type: 'sawtooth', band: 240, Q: 1.2, am: 1.1, depth: 0.4, hi: 900, tick: 1.1, amp: 0.19 },
    thunderjaw: { f: 82, type: 'sawtooth', band: 340, Q: 1.4, am: 1.6, depth: 0.45, hi: 1400, tick: 0.78, amp: 0.18 },
  };
  for (const [sp, S] of Object.entries(IDLE)) {
    RECIPES[`idle/${sp}`] = (A) => {
      const dur = 3.2;
      // the reactor: flat gain, amplitude-modulated by the species' own rate
      const band = A.flt('bandpass', S.band, S.Q);
      const am = A.am(0, dur, S.am, S.depth, band);
      const g = A.ac.createGain(); g.gain.value = S.amp; g.connect(am);
      const o = A.ac.createOscillator();
      o.type = S.type; o.frequency.value = S.f;
      o.connect(g); o.start(0); o.stop(dur);
      // a fifth of coolant hiss in the species' own register
      const hg = A.ac.createGain(); hg.gain.value = S.amp * 0.22;
      hg.connect(A.flt('bandpass', S.hi, 1.1));
      A.ns(0, dur, hg, 1);
      // the harmonic that separates a Strider's whine from a Behemoth's rumble
      const h = A.ac.createGain(); h.gain.value = S.amp * 0.3;
      h.connect(A.flt('bandpass', S.f * 3, 5));
      const o2 = A.ac.createOscillator();
      o2.type = 'sine'; o2.frequency.value = S.f * 2.01;
      o2.connect(h); o2.start(0); o2.stop(dur);
      // relay ticks — the give-away a stalking player listens for
      for (let t = 0.1; t < dur - 0.12; t += S.tick * (0.75 + A.R() * 0.5)) {
        A.metal(t, S.hi * A.rnd(0.7, 1.3), 0.035, S.amp * 0.35, [1, 2.5]);
      }
    };
  }

  /* ===================================================================== */
  /*  DEATH: collapse + loot beacon (audio-06)                             */
  /* ===================================================================== */
  RECIPES['machine/collapse'] = (A) => {
    const t = 0.01;
    // the body hitting ground: mass first, then the chassis coming apart
    A.thump(t, 38, 0.55, 0.78);
    A.thump(t + 0.02, 66, 0.3, 0.34);
    A.burst(t, 0.3, { f: 330, Q: 0.7, gain: 0.34, atk: 0.002, sweepTo: 110 });
    A.metal(t + 0.01, 260, 0.7, 0.2, [1, 1.94, 3.6, 6.1]);
    // debris settling over the next half second
    for (let i = 0; i < 9; i++) {
      const st = t + 0.09 + A.rnd(0, 0.62);
      A.metal(st, A.rnd(700, 2600), A.rnd(0.05, 0.14), A.rnd(0.04, 0.11), [1, 2.4, 4.1]);
      if (A.R() < 0.5) A.burst(st, 0.04, { type: 'highpass', f: A.rnd(3000, 6000), gain: 0.06, atk: 0.001 });
    }
    // dust
    A.burst(t + 0.05, 0.5, { type: 'lowpass', f: 700, gain: 0.06, atk: 0.06, rate: 0.6 });
  };
  // The "there is loot here" beacon: the wreck's last cell still ticking.
  RECIPES['machine/loot-beacon'] = (A) => {
    const dur = 2.4;
    const g = A.ac.createGain(); g.gain.value = 0.05;
    g.connect(A.flt('bandpass', 1450, 3.4));
    const o = A.ac.createOscillator();
    o.type = 'sine'; o.frequency.value = 1450;
    o.connect(g); o.start(0); o.stop(dur);
    // the pulse: two blips per cycle, the second quieter — a dying heartbeat
    for (const [t, amp] of [[0.05, 0.26], [0.34, 0.12], [1.25, 0.26], [1.54, 0.12]]) {
      const bg = A.env(t, amp, 0.004, 0.16, A.flt('bandpass', 2100, 5));
      A.sweep('sine', t, 0.18, 1900, 2400, bg);
    }
    const hg = A.ac.createGain(); hg.gain.value = 0.012;
    hg.connect(A.flt('highpass', 5000));
    A.ns(0, dur, hg, 1);
  };

  /* ===================================================================== */
  /*  SUSPICION (audio-08)                                                 */
  /* ===================================================================== */
  // The sound that turns a walk into a crouch. Rising interrogative warble —
  // deliberately NOT the alarm, which is a decision the machine has made.
  RECIPES['machine/warble'] = (A) => {
    const t = 0.01, dur = 0.7;
    const am = A.am(t, dur, 18, 0.5, A.flt('bandpass', 1600, 3.6));
    const g = A.envS(t, 0.3, 0.02, 0.3, 0.3, am);
    const o = A.sweep('square', t, dur * 0.8, 760, 1180, g);
    o.connect(A.flt('bandpass', 3200, 6));
    // the questioning lift at the end
    const g2 = A.env(t + dur * 0.6, 0.16, 0.03, 0.24, A.flt('bandpass', 2400, 4));
    A.sweep('triangle', t + dur * 0.6, 0.26, 1300, 2050, g2);
    A.burst(t, 0.5, { type: 'highpass', f: 5400, gain: 0.03, atk: 0.06 });
  };
  // Contact lost: the same voice falling instead of rising.
  RECIPES['machine/unwarble'] = (A) => {
    const t = 0.01, dur = 0.6;
    const am = A.am(t, dur, 13, 0.4, A.flt('bandpass', 1300, 3.2));
    A.sweep('square', t, dur * 0.85, 1180, 620, A.envS(t, 0.26, 0.03, 0.22, 0.3, am));
    A.metal(t + dur * 0.5, 900, 0.2, 0.05, [1, 2.4]);
  };

  /* ===================================================================== */
  /*  ELEMENTAL STATUS LOOPS (audio-10)                                    */
  /* ===================================================================== */
  // Flat-gain, 2.4 s, spatialised on the burning/shocked/frozen machine.
  RECIPES['status/burn'] = (A) => {
    const dur = 2.4;
    const bed = A.ac.createGain(); bed.gain.value = 0.16;
    bed.connect(A.flt('bandpass', 900, 0.6));
    A.ns(0, dur, bed, 0.7);
    const roar = A.ac.createGain(); roar.gain.value = 0.09;
    roar.connect(A.flt('lowpass', 380, 0.9));
    A.ns(0, dur, roar, 0.35);
    lfoOn(A, bed.gain, 0.5, 0.06, dur);
    for (let t = 0.05; t < dur - 0.05; t += A.rnd(0.05, 0.3)) {
      A.burst(t, A.rnd(0.012, 0.05), { f: A.rnd(1600, 5600), Q: A.rnd(3, 8), gain: A.rnd(0.04, 0.16), atk: 0.0008 });
    }
  };
  RECIPES['status/shock'] = (A) => {
    const dur = 2.4;
    // arcing: a buzzing carrier plus randomly retriggered crackles
    const band = A.flt('bandpass', 2600, 2.2);
    const am = A.am(0, dur, 47, 0.85, band);
    const g = A.ac.createGain(); g.gain.value = 0.1; g.connect(am);
    const o = A.ac.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = 118;
    o.connect(g); o.start(0); o.stop(dur);
    for (let t = 0.02; t < dur - 0.04; t += A.rnd(0.04, 0.22)) {
      A.burst(t, A.rnd(0.008, 0.03), { type: 'highpass', f: A.rnd(4000, 9000), gain: A.rnd(0.06, 0.2), atk: 0.0005 });
      if (A.R() < 0.4) A.metal(t, A.rnd(2200, 4200), 0.04, 0.05, [1, 2.7]);
    }
  };
  RECIPES['status/frost'] = (A) => {
    const dur = 2.4;
    // brittle: a thin hiss with slow ice creaks, no low end at all
    const hiss = A.ac.createGain(); hiss.gain.value = 0.055;
    hiss.connect(A.flt('bandpass', 5200, 1.2));
    A.ns(0, dur, hiss, 1.3);
    lfoOn(A, hiss.gain, 0.4, 0.02, dur);
    const ring = A.ac.createGain(); ring.gain.value = 0.03;
    ring.connect(A.flt('bandpass', 3100, 9));
    const o = A.ac.createOscillator();
    o.type = 'sine'; o.frequency.value = 3100;
    o.connect(ring); o.start(0); o.stop(dur);
    for (let t = 0.15; t < dur - 0.2; t += A.rnd(0.3, 0.8)) {
      const g = A.env(t, 0.07, 0.01, A.rnd(0.1, 0.3), A.flt('bandpass', A.rnd(1200, 2600), 7));
      A.sweep('triangle', t, 0.3, A.rnd(1800, 3000), A.rnd(900, 1500), g);
    }
  };

  /* ===================================================================== */
  /*  MORE WORLD (audio-11)                                                */
  /* ===================================================================== */
  RECIPES['amb/forest'] = (A) => {
    const dur = 13;
    // canopy: a darker, slower version of the meadow with wood creaks
    for (const [f, p] of [[240, -0.6], [310, 0.6]]) {
      const flt = A.flt('bandpass', f, 0.6, A.pan(p));
      const g = A.ac.createGain(); g.gain.value = 0.12; g.connect(flt);
      A.ns(0, dur, g, 0.8);
      const lfo = A.ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.05 + A.rnd(0, 0.05);
      const lg = A.ac.createGain(); lg.gain.value = 0.07;
      lfo.connect(lg).connect(g.gain); lfo.start(0); lfo.stop(dur);
    }
    const leaf = A.ac.createGain(); leaf.gain.value = 0.035;
    leaf.connect(A.flt('highpass', 3400));
    A.ns(0, dur, leaf, 1.2);
    for (let t = 1.4; t < dur - 1; t += A.rnd(2.4, 5)) {
      // branch creak
      const p = A.pan(A.rnd(-0.8, 0.8));
      const g = A.env(t, 0.05, 0.25, 0.5, A.flt('bandpass', A.rnd(180, 340), 6, p));
      A.sweep('sawtooth', t, 0.8, A.rnd(70, 110), A.rnd(90, 140), g, 'lin');
    }
    for (let t = 0.8; t < dur - 1.2; t += A.rnd(1.8, 4)) {
      const p = A.pan(A.rnd(-0.9, 0.9));
      const n = 2 + ((A.R() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const st = t + i * A.rnd(0.05, 0.12);
        A.sweep('sine', st, 0.12, A.rnd(1700, 2600), A.rnd(2200, 3600), A.env(st, 0.04, 0.006, A.rnd(0.04, 0.1), p));
      }
    }
  };
  RECIPES['amb/night'] = (A) => {
    const dur = 13;
    // colder, emptier, and the insects change species after dark
    const bed = A.ac.createGain(); bed.gain.value = 0.09;
    bed.connect(A.flt('lowpass', 260, 0.7));
    A.ns(0, dur, bed, 0.4);
    for (const p of [-0.7, 0.7]) {
      const flt = A.flt('bandpass', 520, 0.8, A.pan(p));
      const g = A.ac.createGain(); g.gain.value = 0.06; g.connect(flt);
      A.ns(0, dur, g, 0.9);
      const lfo = A.ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.04 + A.rnd(0, 0.04);
      const lg = A.ac.createGain(); lg.gain.value = 0.035;
      lfo.connect(lg).connect(g.gain); lfo.start(0); lfo.stop(dur);
    }
    // crickets: a steady pulse train, two choruses slightly out of phase
    for (const [rate, f, p, amp] of [[0.29, 4600, -0.5, 0.012], [0.34, 5400, 0.55, 0.009]]) {
      for (let t = A.rnd(0, 0.3); t < dur - 0.1; t += rate) {
        const d = A.pan(p);
        for (let k = 0; k < 3; k++) {
          A.burst(t + k * 0.018, 0.012, { f: f * A.rnd(0.95, 1.05), Q: 14, gain: amp, atk: 0.001, dest: d });
        }
      }
    }
    // one owl per bed
    const ot = A.rnd(3, 8);
    for (let i = 0; i < 2; i++) {
      const st = ot + i * 0.42;
      const g = A.env(st, 0.05, 0.06, 0.3, A.flt('lowpass', 900, 1.2, A.pan(-0.3)));
      A.sweep('sine', st, 0.34, 420, 360, g);
    }
  };
  RECIPES['amb/ridge'] = (A) => {
    const dur = 13;
    // exposed rock: wind with an edge, no life in it at all
    for (const [f, q, p, amp] of [[900, 1.6, -0.7, 0.12], [1400, 2.2, 0.7, 0.1], [420, 0.9, 0, 0.13]]) {
      const flt = A.flt('bandpass', f, q, A.pan(p));
      const g = A.ac.createGain(); g.gain.value = amp; g.connect(flt);
      A.ns(0, dur, g, 1.1);
      const lfo = A.ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.09 + A.rnd(0, 0.14);
      const lg = A.ac.createGain(); lg.gain.value = amp * 0.7;
      lfo.connect(lg).connect(g.gain); lfo.start(0); lfo.stop(dur);
    }
    const low = A.ac.createGain(); low.gain.value = 0.1;
    low.connect(A.flt('lowpass', 160, 0.7));
    A.ns(0, dur, low, 0.3);
    // grit skittering over stone
    for (let t = 0.5; t < dur - 0.4; t += A.rnd(0.9, 2.6)) {
      const p = A.pan(A.rnd(-0.8, 0.8));
      for (let i = 0; i < 4; i++) {
        A.burst(t + i * A.rnd(0.02, 0.07), 0.02, { f: A.rnd(2600, 5200), Q: 5, gain: A.rnd(0.02, 0.06), atk: 0.001, dest: p });
      }
    }
  };
  // The valley is inhabited: a machine call arriving from somewhere you
  // cannot see. Long, filtered and reverberant by construction.
  RECIPES['amb/call-far'] = (A) => {
    const t = 0.05, dur = 2.2;
    const lp = A.flt('lowpass', 700, 0.9, A.pan(A.rnd(-0.7, 0.7)));
    const am = A.am(t, dur, A.rnd(3, 9), 0.4, lp);
    A.sweep('sawtooth', t, dur * 0.7, A.rnd(150, 320), A.rnd(90, 190), A.envS(t, 0.3, 0.18, dur * 0.3, dur * 0.45, am));
    // the valley answering
    for (let i = 1; i <= 2; i++) {
      const st = t + i * 0.42;
      const g = A.env(st, 0.07 / i, 0.16, 0.9, A.flt('lowpass', 520 / i, 0.9, A.pan(A.rnd(-0.9, 0.9))));
      A.sweep('sawtooth', st, 0.9, A.rnd(140, 260), A.rnd(80, 150), g);
    }
  };

  /* ===================================================================== */
  /*  ALOY: the harder efforts (audio-03, still no VO)                     */
  /* ===================================================================== */
  RECIPES['aloy/effort-hard'] = (A) => {
    const t = 0.01, dur = 0.44;
    // a landing grunt: the same throat as aloy/effort, forced
    A.burst(t, dur, { f: 430, Q: 3.4, gain: 0.3, atk: 0.006, sweepTo: 240 });
    A.burst(t, 0.2, { f: 1150, Q: 2.6, gain: 0.11, atk: 0.004, sweepTo: 700 });
    A.thump(t, 96, 0.18, 0.13);
  };
  RECIPES['aloy/breath-hard'] = (A) => {
    const t = 0.01, dur = 0.8;
    // two exhausted breaths, in and straight back out
    A.burst(t, 0.34, { f: 700, Q: 1.5, gain: 0.17, atk: 0.11, sweepTo: 1350, rate: 0.85 });
    A.burst(t + 0.38, 0.4, { f: 1250, Q: 1.3, gain: 0.19, atk: 0.04, sweepTo: 480, rate: 0.9 });
    A.burst(t, dur, { type: 'highpass', f: 2800, gain: 0.045, atk: 0.12 });
  };

  global.HZC_AUDIO_RECIPES = { RECIPES, kit, mulberry32, SR };
})(typeof globalThis !== 'undefined' ? globalThis : window);
