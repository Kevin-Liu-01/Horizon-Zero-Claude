/**
 * GameAudio — fully procedural WebAudio soundscape. Zero audio assets:
 * every sound is synthesized (noise buffers, FM chirps, Karplus-Strong plucks,
 * metallic partial stacks). The AudioContext is created/resumed only on the
 * first user gesture or 'game-start'. One shared noise buffer + precomputed
 * pluck buffers are reused for all one-shots; simultaneous voices are capped.
 */

const PENTA = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0]; // A min pentatonic
const VOICE_CAP = 24;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class GameAudio {
  constructor(ctx) {
    this.ctx = ctx;
    this.ac = null;

    this._voiceEnds = [];
    this._voicesStarted = 0;
    this._counts = {
      steps: 0, birds: 0, plucks: 0, shots: 0, hits: 0, stings: 0,
      attacks: 0, explosions: 0, radar: 0, chimes: 0,
    };
    this._stridePhase = 0.35;
    this._gust = 0;
    this._tension = 0;
    this._lastTenseT = -99;
    this._pollT = 0;
    this._watcherDist = Infinity;
    this._watcher = null;
    this._birdT = 4;
    this._pluckT = 2.5;
    this._radarT = 1.5;
    this._heartT = 0;
    this._hbOn = false;
    this._creakLevel = 0;
    this._prevDraw = 0;
    this._beatIdx = 0;
    this._nextBeat = 0;
    this._pan = 0;
    this._att = 1;
    this._t = 0;
    this._testQueue = null;
    this._testT = 0;

    const arm = () => { this._init(); this.ac?.resume?.().catch(() => {}); };
    ctx.events.on('game-start', arm);
    // Browsers only allow audio after a gesture; keep listeners persistent so
    // a later click can still resume a suspended context.
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);

    this._bindEvents();
  }

  /* ------------------------------ lifecycle ------------------------------ */

  _init() {
    if (this.ac) return;
    let ac;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return; // no WebAudio: stay silent, never crash the game
    }
    this.ac = ac;

    this.master = ac.createGain();
    this.master.gain.value = 0.85;
    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.24;
    this.master.connect(this.comp).connect(ac.destination);

    this.ambBus = ac.createGain(); this.ambBus.gain.value = 0.9;
    this.sfxBus = ac.createGain(); this.sfxBus.gain.value = 1.0;
    this.musicBus = ac.createGain(); this.musicBus.gain.value = 0.8;
    this.ambBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    this._noiseBuf = this._makeNoiseBuffer(2.0);
    this._pluckBufs = PENTA.map((f) => this._makePluckBuffer(f));

    this._buildWind();
    this._buildMusic();
    this._buildCreak();

    if (this.ctx.params?.get?.('audiotest')) this._buildTestQueue();
  }

  _makeNoiseBuffer(seconds) {
    const sr = this.ac.sampleRate;
    const buf = this.ac.createBuffer(1, Math.floor(sr * seconds), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Karplus-Strong: noise burst circulated through an averaging filter. */
  _makePluckBuffer(freq) {
    const sr = this.ac.sampleRate;
    const N = Math.round(sr / freq);
    const len = Math.floor(sr * 1.7);
    const buf = this.ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i <= N; i++) d[i] = Math.random() * 2 - 1;
    for (let i = N + 1; i < len; i++) d[i] = 0.498 * (d[i - N] + d[i - N - 1]);
    return buf;
  }

  _buildWind() {
    const ac = this.ac;
    this.windGain = ac.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.ambBus);

    // Two detuned bandpass chains panned apart for a wide stereo bed.
    const mk = (freq, pan) => {
      const src = ac.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 0.55;
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      src.connect(bp).connect(p).connect(this.windGain);
      src.start(0, Math.random() * 1.5);
      return bp;
    };
    const bpL = mk(380, -0.45);
    const bpR = mk(465, 0.45);

    // Slow LFO breathes the bandpass center on top of JS-side gusts.
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ac.createGain();
    lg.gain.value = 90;
    lfo.connect(lg);
    lg.connect(bpL.frequency);
    lg.connect(bpR.frequency);
    lfo.start();
    this._windBpL = bpL;
    this._windBpR = bpR;

    // Low rumble under the hiss: what sells "air moving", not "static".
    const rum = ac.createBufferSource();
    rum.buffer = this._noiseBuf;
    rum.loop = true;
    const rlp = ac.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 140;
    this.rumbleGain = ac.createGain();
    this.rumbleGain.gain.value = 0;
    rum.connect(rlp).connect(this.rumbleGain).connect(this.ambBus);
    rum.start(0, 1.1);

    // High grass-rustle layer, gain driven by gusts + player motion in grass.
    const rs = ac.createBufferSource();
    rs.buffer = this._noiseBuf;
    rs.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    this.rustleGain = ac.createGain();
    this.rustleGain.gain.value = 0;
    rs.connect(hp).connect(this.rustleGain).connect(this.ambBus);
    rs.start(0, 0.7);
  }

  _buildMusic() {
    const ac = this.ac;
    // Quiet low drone pad: detuned saw pair + fifth, heavily lowpassed.
    this.droneGain = ac.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneGain.gain.setTargetAtTime(0.045, ac.currentTime, 4);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    lp.connect(this.droneGain).connect(this.musicBus);
    const mkOsc = (type, f, det) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start();
    };
    mkOsc('sawtooth', 55, -4);
    mkOsc('sawtooth', 55, 5);
    mkOsc('sine', 82.41, 0);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = ac.createGain();
    lg.gain.value = 0.012;
    lfo.connect(lg).connect(this.droneGain.gain);
    lfo.start();

    this.pluckBus = ac.createGain();
    this.pluckBus.gain.value = 0.9;
    this.pluckBus.connect(this.musicBus);

    this.tensionBus = ac.createGain();
    this.tensionBus.gain.value = 0;
    this.tensionBus.connect(this.musicBus);
  }

  _buildCreak() {
    const ac = this.ac;
    this.creakOsc = ac.createOscillator();
    this.creakOsc.type = 'sawtooth';
    this.creakOsc.frequency.value = 50;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    this.creakGain = ac.createGain();
    this.creakGain.gain.value = 0;
    this.creakOsc.connect(lp).connect(this.creakGain).connect(this.sfxBus);
    this.creakOsc.start();
  }

  /* ------------------------------- helpers ------------------------------- */

  _now() { return this.ac.currentTime; }

  /**
   * Allocate a one-shot output gain (voice). Returns null when the cap is hit
   * so hot moments degrade gracefully instead of stacking nodes.
   */
  _voice(dur, vol, pan, bus) {
    const ac = this.ac;
    const now = ac.currentTime;
    const ends = this._voiceEnds;
    for (let i = ends.length - 1; i >= 0; i--) {
      if (ends[i] <= now) { ends[i] = ends[ends.length - 1]; ends.pop(); }
    }
    // While suspended currentTime is frozen; skip bookkeeping so the cap
    // can't wedge permanently (nodes are inert anyway).
    if (ac.state === 'running') {
      if (ends.length >= VOICE_CAP) return null;
      ends.push(now + dur);
    }
    this._voicesStarted++;
    const g = ac.createGain();
    g.gain.value = vol;
    if (pan) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p).connect(bus || this.sfxBus);
    } else {
      g.connect(bus || this.sfxBus);
    }
    setTimeout(() => { try { g.disconnect(); } catch {} }, (dur + 0.25) * 1000);
    return g;
  }

  /** Exponential attack/decay envelope (all values kept > 0 for exp ramps). */
  _env(param, t0, peak, attack, decay) {
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0011), t0 + attack);
    param.exponentialRampToValueAtTime(0.0008, t0 + attack + decay);
  }

  _osc(type, freq, t0, dur, dest) {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.connect(dest);
    o.start(t0);
    o.stop(t0 + dur);
    return o;
  }

  _noise(t0, dur, dest) {
    const s = this.ac.createBufferSource();
    s.buffer = this._noiseBuf;
    s.loop = true;
    s.connect(dest);
    s.start(t0, Math.random() * 1.8);
    s.stop(t0 + dur);
    return s;
  }

  _bp(freq, Q) {
    const f = this.ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  _lp(freq) {
    const f = this.ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    return f;
  }

  _hp(freq) {
    const f = this.ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    return f;
  }

  /** Camera-relative pan + distance attenuation into _pan/_att (no allocs). */
  _spatial(pos) {
    const cam = this.ctx.camera;
    const dx = pos.x - cam.position.x;
    const dz = pos.z - cam.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const e = cam.matrixWorld.elements; // column 0 = camera right
    const inv = dist > 0.001 ? 1 / dist : 0;
    this._pan = clamp((dx * e[0] + dz * e[2]) * inv, -1, 1) * 0.8;
    this._att = 1 / (1 + dist * 0.03);
  }

  /* ------------------------------ one-shots ------------------------------ */

  _footstep(speedN, crouched, inGrass) {
    const vol = crouched ? 0.045 : 0.09 + speedN * 0.1;
    const g = this._voice(0.4, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.steps++;
    const t0 = this._now();
    const bp = this._bp(250 + Math.random() * 180 + speedN * 140, 0.9);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    this._env(eg.gain, t0, vol, 0.008, 0.07 + speedN * 0.05);
    this._noise(t0, 0.2, bp);
    if (!crouched && speedN > 0.55) {
      const eg2 = this.ac.createGain();
      eg2.connect(g);
      this._env(eg2.gain, t0, vol * 0.8, 0.005, 0.09);
      const o = this._osc('sine', 84, t0, 0.16, eg2);
      o.frequency.exponentialRampToValueAtTime(46, t0 + 0.13);
    }
    if (inGrass) {
      const hp = this._hp(2800);
      const eg3 = this.ac.createGain();
      hp.connect(eg3).connect(g);
      this._env(eg3.gain, t0, vol * 0.5, 0.012, 0.13);
      this._noise(t0, 0.2, hp);
    }
  }

  _bird() {
    const g = this._voice(1.8, 0.9, (Math.random() * 2 - 1) * 0.8, this.ambBus);
    if (!g) return;
    this._counts.birds++;
    let t = this._now() + 0.02;
    const n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const f = 2100 + Math.random() * 1400;
      const dur = 0.06 + Math.random() * 0.12;
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t, 0.045 + Math.random() * 0.03, 0.015, dur);
      const car = this.ac.createOscillator();
      car.type = 'sine';
      car.frequency.setValueAtTime(f, t);
      car.frequency.exponentialRampToValueAtTime(
        f * (Math.random() < 0.5 ? 1.35 : 0.74), t + dur,
      );
      const mod = this.ac.createOscillator();
      mod.frequency.value = 25 + Math.random() * 45;
      const mg = this.ac.createGain();
      mg.gain.value = 130 + Math.random() * 320;
      mod.connect(mg).connect(car.frequency);
      car.connect(eg);
      car.start(t); car.stop(t + dur + 0.03);
      mod.start(t); mod.stop(t + dur + 0.03);
      t += dur + 0.04 + Math.random() * 0.12;
    }
  }

  _bowRelease(str) {
    const s = clamp(str || 0.5, 0.15, 1);
    const g = this._voice(0.9, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.shots++;
    const t0 = this._now();
    // string twang
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.05 + 0.15 * s, 0.004, 0.22);
    const twang = this._osc('triangle', 130 + 90 * s, t0, 0.3, eg);
    twang.frequency.exponentialRampToValueAtTime((130 + 90 * s) * 0.8, t0 + 0.26);
    // release snap
    const bp = this._bp(2600, 3);
    const eg2 = this.ac.createGain();
    bp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.03 + 0.1 * s, 0.002, 0.05);
    this._noise(t0, 0.08, bp);
    // arrow whoosh: swept bandpass swell
    const bp2 = this._bp(500, 1.2);
    const eg3 = this.ac.createGain();
    bp2.connect(eg3).connect(g);
    bp2.frequency.setValueAtTime(500, t0);
    bp2.frequency.exponentialRampToValueAtTime(2200 + 1400 * s, t0 + 0.3);
    eg3.gain.setValueAtTime(0.0001, t0);
    eg3.gain.exponentialRampToValueAtTime(0.045 + 0.09 * s, t0 + 0.1);
    eg3.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.36);
    this._noise(t0, 0.38, bp2);
  }

  _clank(pan, att, weak) {
    const g = this._voice(0.9, att, pan, this.sfxBus);
    if (!g) return;
    this._counts.hits++;
    const t0 = this._now();
    // inharmonic partials = struck metal plate
    const base = weak ? 840 + Math.random() * 320 : 470 + Math.random() * 160;
    const ratios = [1, 2.76, 5.4, 8.93];
    const amps = [0.14, 0.09, 0.05, 0.028];
    const boost = weak ? 1.7 : 1;
    for (let i = 0; i < 4; i++) {
      const eg = this.ac.createGain();
      eg.connect(g);
      const dec = (weak ? 0.5 : 0.3) / (1 + i * 0.45);
      this._env(eg.gain, t0, amps[i] * boost, 0.002, dec);
      this._osc('sine', base * ratios[i] * (1 + (Math.random() - 0.5) * 0.02), t0, dec + 0.05, eg);
    }
    const hp = this._hp(3500);
    const eg = this.ac.createGain();
    hp.connect(eg).connect(g);
    this._env(eg.gain, t0, 0.06 * boost, 0.002, 0.045);
    this._noise(t0, 0.07, hp);
    if (weak) {
      // spark crackle: sputter of tiny high-passed ticks after the clank
      const chp = this._hp(5200);
      chp.connect(g);
      let t = t0 + 0.03;
      for (let i = 0; i < 5; i++) {
        const ceg = this.ac.createGain();
        ceg.connect(chp);
        this._env(ceg.gain, t, 0.03 + Math.random() * 0.03, 0.002, 0.02);
        this._noise(t, 0.03, ceg);
        t += 0.025 + Math.random() * 0.06;
      }
    }
  }

  /** Shock-arrow zap: harsh AM buzz that stutters out. */
  _zap(pan, att) {
    const g = this._voice(0.5, att, pan, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.09, 0.004, 0.3);
    const car = this._osc('square', 320, t0, 0.36, eg);
    car.frequency.setValueAtTime(320, t0);
    car.frequency.exponentialRampToValueAtTime(95, t0 + 0.32);
    const am = this.ac.createOscillator();
    am.frequency.value = 55;
    const amg = this.ac.createGain();
    amg.gain.value = 0.05; // depth < envelope peak so gain never goes negative
    am.connect(amg).connect(eg.gain);
    am.start(t0);
    am.stop(t0 + 0.36);
    const hp = this._hp(6000);
    const eg2 = this.ac.createGain();
    hp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.035, 0.002, 0.22);
    this._noise(t0, 0.26, hp);
  }

  /** Fire-arrow ignite: soft airy whump with a rising flame flutter. */
  _ignite(pan, att) {
    const g = this._voice(0.7, att, pan, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const bp = this._bp(700, 0.8);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    bp.frequency.setValueAtTime(380, t0);
    bp.frequency.exponentialRampToValueAtTime(1600, t0 + 0.35);
    eg.gain.setValueAtTime(0.0001, t0);
    eg.gain.exponentialRampToValueAtTime(0.12, t0 + 0.07);
    eg.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.55);
    this._noise(t0, 0.58, bp);
  }

  _thud(pan, att) {
    const g = this._voice(0.5, att, pan, this.sfxBus);
    if (!g) return;
    this._counts.hits++;
    const t0 = this._now();
    const lp = this._lp(300);
    const eg = this.ac.createGain();
    lp.connect(eg).connect(g);
    this._env(eg.gain, t0, 0.16, 0.004, 0.13);
    this._noise(t0, 0.16, lp);
    const eg2 = this.ac.createGain();
    eg2.connect(g);
    this._env(eg2.gain, t0, 0.14, 0.004, 0.16);
    const o = this._osc('sine', 92, t0, 0.2, eg2);
    o.frequency.exponentialRampToValueAtTime(44, t0 + 0.17);
  }

  _sting(pan, att) {
    const g = this._voice(0.8, att, pan, this.sfxBus);
    if (!g) return;
    this._counts.stings++;
    const t0 = this._now();
    const lp = this._lp(1400);
    lp.connect(g);
    const note = (t, f0, f1, dur, vol) => {
      const eg = this.ac.createGain();
      eg.connect(lp);
      this._env(eg.gain, t, vol, 0.012, dur);
      const sq = this._osc('square', f0, t, dur + 0.05, eg);
      sq.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const eg2 = this.ac.createGain();
      eg2.connect(g);
      this._env(eg2.gain, t, vol * 0.7, 0.012, dur);
      const si = this._osc('sine', f0 * 2, t, dur + 0.05, eg2);
      si.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur);
    };
    note(t0, 440, 494, 0.16, 0.07);
    note(t0 + 0.15, 587, 690, 0.26, 0.085);
  }

  _roar(pan, att, big) {
    const g = this._voice(1.1, att, pan, this.sfxBus);
    if (!g) return;
    this._counts.attacks++;
    const t0 = this._now();
    const bp = this._bp(420, 1.4);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    bp.frequency.setValueAtTime(430, t0);
    bp.frequency.exponentialRampToValueAtTime(140, t0 + 0.55);
    this._env(eg.gain, t0, 0.22, 0.02, 0.55);
    this._noise(t0, 0.62, bp);
    const lp = this._lp(500);
    const eg2 = this.ac.createGain();
    lp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.12, 0.02, 0.5);
    const sq = this._osc('square', 130, t0, 0.6, lp);
    sq.frequency.exponentialRampToValueAtTime(48, t0 + 0.55);
    if (big) {
      const eg3 = this.ac.createGain();
      eg3.connect(g);
      this._env(eg3.gain, t0, 0.25, 0.02, 0.7);
      const sub = this._osc('sine', 72, t0, 0.8, eg3);
      sub.frequency.exponentialRampToValueAtTime(30, t0 + 0.7);
    }
  }

  _boom(pan, att) {
    const g = this._voice(1.3, att, pan, this.sfxBus);
    if (!g) return;
    this._counts.attacks++;
    const t0 = this._now();
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.42, 0.008, 0.85);
    const sub = this._osc('sine', 62, t0, 1.0, eg);
    sub.frequency.exponentialRampToValueAtTime(26, t0 + 0.75);
    const lp = this._lp(200);
    const eg2 = this.ac.createGain();
    lp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.26, 0.01, 0.6);
    this._noise(t0, 0.65, lp);
  }

  _explosion(pan, att, size = 1) {
    const g = this._voice(1.4 + size, att, pan, this.sfxBus);
    if (!g) return;
    this._counts.explosions++;
    const t0 = this._now();
    const lp = this._lp(5200);
    const eg = this.ac.createGain();
    lp.connect(eg).connect(g);
    lp.frequency.setValueAtTime(5200, t0);
    lp.frequency.exponentialRampToValueAtTime(140, t0 + 1.1 * size);
    this._env(eg.gain, t0, 0.5 * size, 0.006, 1.25 * size);
    this._noise(t0, 1.3 * size, lp);
    const eg2 = this.ac.createGain();
    eg2.connect(g);
    this._env(eg2.gain, t0, 0.34 * size, 0.008, 0.9 * size);
    const sub = this._osc('sine', 130, t0, 1.0 * size, eg2);
    sub.frequency.exponentialRampToValueAtTime(size > 1.1 ? 24 : 32, t0 + 0.85 * size);
    // late metallic debris tinks
    for (let i = 0; i < 2; i++) {
      const t = t0 + 0.16 + i * 0.15;
      const eg3 = this.ac.createGain();
      eg3.connect(g);
      this._env(eg3.gain, t, 0.035, 0.003, 0.16);
      this._osc('sine', 1250 + Math.random() * 900, t, 0.2, eg3);
    }
  }

  _hurt() {
    const g = this._voice(0.5, 1, 0, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.18, 0.006, 0.18);
    const o = this._osc('sine', 165, t0, 0.22, eg);
    o.frequency.exponentialRampToValueAtTime(68, t0 + 0.2);
    const bp = this._bp(500, 1);
    const eg2 = this.ac.createGain();
    bp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.1, 0.005, 0.1);
    this._noise(t0, 0.12, bp);
  }

  _heartbeat() {
    const g = this._voice(0.6, 1, 0, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const thump = (t, vol) => {
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t, vol, 0.008, 0.11);
      const o = this._osc('sine', 62, t, 0.15, eg);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    };
    thump(t0, 0.17);
    thump(t0 + 0.24, 0.12);
  }

  _chime() {
    const g = this._voice(1.4, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.chimes++;
    const t0 = this._now();
    const note = (t, f, vol) => {
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t, vol, 0.01, 0.9);
      this._osc('sine', f, t, 1.0, eg);
    };
    note(t0, 659.25, 0.06);
    note(t0 + 0.13, 987.77, 0.05);
    note(t0 + 0.13, 1975.5, 0.012);
  }

  _droneFall() {
    const g = this._voice(2.8, 1, 0, this.musicBus);
    if (!g) return;
    const t0 = this._now();
    const lp = this._lp(320);
    const eg = this.ac.createGain();
    lp.connect(eg).connect(g);
    eg.gain.setValueAtTime(0.0001, t0);
    eg.gain.exponentialRampToValueAtTime(0.16, t0 + 0.18);
    eg.gain.exponentialRampToValueAtTime(0.0008, t0 + 2.5);
    const saw = this._osc('sawtooth', 110, t0, 2.6, lp);
    saw.frequency.exponentialRampToValueAtTime(28, t0 + 2.3);
    const eg2 = this.ac.createGain();
    eg2.connect(g);
    this._env(eg2.gain, t0, 0.1, 0.2, 2.2);
    const sub = this._osc('sine', 55, t0, 2.6, eg2);
    sub.frequency.exponentialRampToValueAtTime(20, t0 + 2.3);
  }

  _victory() {
    const g = this._voice(3.6, 1, 0, this.musicBus);
    if (!g) return;
    const t0 = this._now();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C major arpeggio
    const note = (t, f, vol, dur) => {
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t, vol, 0.015, dur);
      this._osc('triangle', f, t, dur + 0.1, eg);
      const eg2 = this.ac.createGain();
      eg2.connect(g);
      this._env(eg2.gain, t, vol * 0.4, 0.015, dur);
      this._osc('sine', f * 2, t, dur + 0.1, eg2);
    };
    for (let i = 0; i < notes.length; i++) note(t0 + i * 0.24, notes[i], 0.085, 1.3);
    // closing chord
    note(t0 + 1.15, 523.25, 0.05, 1.8);
    note(t0 + 1.15, 783.99, 0.05, 1.8);
    note(t0 + 1.15, 1318.5, 0.04, 1.8);
  }

  _focus() {
    const g = this._voice(0.7, 1, 0, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.05, 0.03, 0.42);
    const o = this._osc('sine', 480, t0, 0.5, eg);
    o.frequency.exponentialRampToValueAtTime(1150, t0 + 0.45);
    const hp = this._hp(4000);
    const eg2 = this.ac.createGain();
    hp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.02, 0.05, 0.35);
    this._noise(t0, 0.4, hp);
  }

  _dodgeWhoosh() {
    const g = this._voice(0.35, 1, 0, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const bp = this._bp(1000, 1);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    bp.frequency.setValueAtTime(1000, t0);
    bp.frequency.exponentialRampToValueAtTime(350, t0 + 0.2);
    this._env(eg.gain, t0, 0.06, 0.02, 0.18);
    this._noise(t0, 0.24, bp);
  }

  _radarChirp(vol, pan) {
    const g = this._voice(0.35, 1, pan, this.sfxBus);
    if (!g) return;
    this._counts.radar++;
    const t0 = this._now();
    const beep = (t) => {
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t, vol, 0.008, 0.05);
      this._osc('sine', 1750, t, 0.07, eg);
    };
    beep(t0);
    beep(t0 + 0.11);
  }

  _objectiveBlip() {
    const g = this._voice(0.4, 1, 0, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const note = (t, f) => {
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t, 0.035, 0.006, 0.14);
      this._osc('sine', f, t, 0.18, eg);
    };
    note(t0, 880);
    note(t0 + 0.09, 1174.7);
  }

  /** Combat percussion hit scheduled at absolute time (bypasses voice cap). */
  _percHit(tAbs, kick, mid) {
    const ac = this.ac;
    const g = ac.createGain();
    g.gain.value = 1;
    g.connect(this.tensionBus);
    if (kick || mid) {
      const eg = ac.createGain();
      eg.connect(g);
      this._env(eg.gain, tAbs, kick ? 0.5 : 0.3, 0.006, 0.18);
      const o = this._osc('sine', kick ? 175 : 130, tAbs, 0.24, eg);
      o.frequency.exponentialRampToValueAtTime(kick ? 52 : 60, tAbs + 0.16);
    } else {
      const bp = this._bp(1600, 3);
      const eg = ac.createGain();
      bp.connect(eg).connect(g);
      this._env(eg.gain, tAbs, 0.09, 0.002, 0.05);
      this._noise(tAbs, 0.07, bp);
    }
    setTimeout(() => { try { g.disconnect(); } catch {} },
      (tAbs - ac.currentTime + 0.6) * 1000);
  }

  _pluck() {
    const notes = Math.random() < 0.35 ? 2 : 1;
    let t0 = this._now() + 0.02;
    for (let i = 0; i < notes; i++) {
      const g = this._voice(2.0, 0.9, (Math.random() * 2 - 1) * 0.35, this.pluckBus);
      if (!g) return;
      this._counts.plucks++;
      const src = this.ac.createBufferSource();
      src.buffer = this._pluckBufs[(Math.random() * this._pluckBufs.length) | 0];
      const r = Math.random();
      src.playbackRate.value = r < 0.2 ? 0.5 : r > 0.85 ? 2 : 1;
      const eg = this.ac.createGain();
      eg.gain.value = 0.16;
      src.connect(eg).connect(g);
      src.start(t0);
      src.stop(t0 + 1.75);
      t0 += 0.3 + Math.random() * 0.12;
    }
  }

  /* -------------------------------- events ------------------------------- */

  _bindEvents() {
    const ev = this.ctx.events;
    const armed = (fn) => (payload) => { if (this.ac) fn(payload); };

    ev.on('arrow-fired', armed(({ drawStrength } = {}) =>
      this._bowRelease(drawStrength ?? 0.6)));

    ev.on('arrow-hit', armed(({ point, machine, weak, type } = {}) => {
      if (point) this._spatial(point);
      else { this._pan = 0; this._att = 0.8; }
      const att = Math.max(this._att, 0.35);
      if (machine) {
        this._clank(this._pan, att, !!weak);
        if (type === 'shock') this._zap(this._pan, att);
        else if (type === 'fire') this._ignite(this._pan, att);
      } else {
        this._thud(this._pan, this._att);
        if (type === 'fire') this._ignite(this._pan, this._att);
      }
    }));

    ev.on('machine-alerted', armed(({ machine } = {}) => {
      if (machine?.position) this._spatial(machine.position);
      else { this._pan = 0; this._att = 0.7; }
      this._sting(this._pan, Math.max(this._att, 0.5));
      this._lastTenseT = this._t;
    }));

    ev.on('machine-attack', armed(({ machine, kind } = {}) => {
      if (machine?.position) this._spatial(machine.position);
      else { this._pan = 0; this._att = 0.7; }
      const stompy = /stomp|slam|charge|quake|shock/i.test(kind || '');
      const big = machine?.kind === 'thunderjaw' || machine?.kind === 'behemoth';
      if (stompy || (big && !kind)) this._boom(this._pan, Math.max(this._att, 0.4));
      else this._roar(this._pan, Math.max(this._att, 0.4), big);
      this._lastTenseT = this._t;
    }));

    ev.on('machine-killed', armed(({ machine } = {}) => {
      if (machine?.position) this._spatial(machine.position);
      else { this._pan = 0; this._att = 0.7; }
      const size = machine?.kind === 'thunderjaw' ? 1.5
        : machine?.kind === 'behemoth' ? 1.3
          : machine?.kind === 'sawtooth' ? 1.15 : 1;
      this._explosion(this._pan, Math.max(this._att, 0.5), size);
    }));

    ev.on('player-hurt', armed(() => this._hurt()));
    ev.on('medicine-used', armed(() => this._chime()));
    ev.on('player-died', armed(() => this._droneFall()));
    ev.on('player-respawn', armed(() => this._chime()));
    ev.on('player-dodge', armed(() => this._dodgeWhoosh()));
    ev.on('victory', armed(() => this._victory()));
    ev.on('focus-pulse', armed(() => this._focus()));
    ev.on('objective-changed', armed(() => this._objectiveBlip()));
  }

  /* ------------------------------ self-test ------------------------------ */

  _buildTestQueue() {
    this._testT = 0;
    this._testQueue = [
      [0.5, () => this._footstep(0.5, false, true)],
      [0.9, () => this._footstep(0.3, true, false)],
      [1.3, () => this._bird()],
      [1.7, () => this._bowRelease(1)],
      [2.1, () => this._clank(0.3, 1, false)],
      [2.5, () => this._clank(-0.3, 1, true)],
      [2.9, () => this._thud(0, 1)],
      [3.2, () => this._zap(0.2, 1)],
      [3.5, () => this._ignite(-0.2, 1)],
      [3.8, () => this._sting(0, 1)],
      [4.1, () => this._roar(0.2, 1, false)],
      [4.4, () => this._boom(0, 1)],
      [4.7, () => this._explosion(0, 1, 1.3)],
      [5.1, () => this._hurt()],
      [5.4, () => this._chime()],
      [5.7, () => this._focus()],
      [6.0, () => this._radarChirp(0.1, 0.4)],
      [6.3, () => this._pluck()],
      [6.7, () => this._victory()],
      [7.4, () => this._droneFall()],
    ];
  }

  /* -------------------------------- update ------------------------------- */

  update(dt, t) {
    if (!this.ac) return;
    this._t = t;
    const ctx = this.ctx;
    const p = ctx.player;
    const playing = ctx.state === 'playing' || ctx.params?.has?.('shot');

    // --- wind gusts: layered slow sines drive bed + rustle + filter sweep
    const gust = clamp(
      0.45
      + 0.3 * Math.sin(t * 0.13)
      + 0.2 * Math.sin(t * 0.31 + 1.7)
      + 0.1 * Math.sin(t * 0.83 + 4.2), 0, 1,
    );
    this._gust = gust;
    this.windGain.gain.value = 0.05 + gust * 0.11;
    this.rumbleGain.gain.value = 0.02 + gust * gust * 0.09;
    this._windBpL.frequency.value = 340 + gust * 260;
    this._windBpR.frequency.value = 420 + gust * 300;
    let rustle = gust * gust * 0.028;
    if (p && p.inTallGrass && p.moveSpeed > 0.5) {
      rustle += clamp(p.moveSpeed / 8.2, 0, 1) * 0.05;
    }
    this.rustleGain.gain.value = rustle;

    // --- footsteps from locomotion cadence (half stride cycle per step)
    if (p && playing) {
      const sp = p.moveSpeed;
      if (sp > 0.6 && !p.dodging && p.health > 0) {
        const strideLen = clamp(0.8 + sp * 0.45, 1.2, 4.6);
        this._stridePhase += (sp / strideLen) * dt;
        if (this._stridePhase >= 0.5) {
          this._stridePhase -= 0.5;
          this._footstep(clamp(sp / 8.2, 0, 1), p.crouching, p.inTallGrass);
        }
      } else {
        this._stridePhase = 0.38; // next step lands soon after moving again
      }
    }

    // --- bow creak follows drawStrength (lazy: combat builds after audio)
    const draw = ctx.combat?.drawStrength ?? 0;
    let creakTarget = 0;
    if (draw > 0.03) {
      const rising = draw > this._prevDraw + 0.0001;
      creakTarget = rising ? 0.02 + draw * 0.05 : 0.005 + draw * 0.008;
    }
    this._creakLevel += (creakTarget - this._creakLevel) * Math.min(1, dt * 14);
    this.creakGain.gain.value = this._creakLevel;
    // stick-slip flutter makes the saw read as wood under strain
    this.creakOsc.frequency.value =
      46 + draw * 52 + Math.sin(t * 37) * 2.5 * draw;
    this._prevDraw = draw;

    // --- machine polling (throttled): combat tension + nearest idle watcher
    this._pollT -= dt;
    if (this._pollT <= 0) {
      this._pollT = 0.4;
      const list = ctx.machines?.list;
      let tense = false;
      let wDist = Infinity;
      let watcher = null;
      if (list && p) {
        for (let i = 0; i < list.length; i++) {
          const m = list[i];
          if (!m.alive) continue;
          if (m.state === 'attack' || m.state === 'alert') tense = true;
          if (m.kind === 'watcher' && m.state !== 'attack') {
            const dx = m.position.x - p.position.x;
            const dz = m.position.z - p.position.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < wDist) { wDist = d; watcher = m; }
          }
        }
      }
      if (tense) this._lastTenseT = t;
      this._watcherDist = wDist;
      this._watcher = watcher;
    }

    // --- music crossfade: plucks out / percussion in, 6s calm to fade back
    const tenseTarget = t - this._lastTenseT < 6 ? 1 : 0;
    this._tension += (tenseTarget - this._tension)
      * Math.min(1, dt * (tenseTarget ? 1.6 : 0.5));
    this.tensionBus.gain.value = this._tension * 0.9;
    this.pluckBus.gain.value = 0.9 * (1 - this._tension);

    if (this._tension > 0.02 && this.ac.state === 'running') {
      const now = this.ac.currentTime;
      if (this._nextBeat < now) this._nextBeat = now + 0.05;
      while (this._nextBeat < now + 0.3) {
        const b = this._beatIdx % 4;
        this._percHit(this._nextBeat, b === 0, b === 2);
        this._beatIdx++;
        this._nextBeat += 0.44;
      }
    }

    // --- birdsong at random intervals, silenced during combat
    this._birdT -= dt;
    if (this._birdT <= 0) {
      this._birdT = 7 + Math.random() * 12;
      if (this._tension < 0.3) this._bird();
    }

    // --- ambient pentatonic plucks
    this._pluckT -= dt;
    if (this._pluckT <= 0) {
      this._pluckT = 3.5 + Math.random() * 6;
      if (this._tension < 0.25) this._pluck();
    }

    // --- watcher idle radar chirps within 35m
    this._radarT -= dt;
    if (this._radarT <= 0) {
      this._radarT = 2.0 + Math.random() * 1.4;
      const w = this._watcher;
      if (w && w.alive && this._watcherDist < 35) {
        this._spatial(w.position);
        const vol = 0.03 + 0.09 * (1 - this._watcherDist / 35);
        this._radarChirp(vol, this._pan);
      }
    }

    // --- low-health heartbeat
    if (p && playing && p.health > 0 && p.health < 30) {
      this._hbOn = true;
      this._heartT -= dt;
      if (this._heartT <= 0) {
        this._heartT = 0.95;
        this._heartbeat();
      }
    } else {
      this._hbOn = false;
      this._heartT = 0;
    }

    // --- staggered one-shot self test (?audiotest=1)
    if (this._testQueue && this._testQueue.length) {
      this._testT += dt;
      while (this._testQueue.length && this._testQueue[0][0] <= this._testT) {
        this._testQueue.shift()[1]();
      }
    }
  }

  /* -------------------------------- debug -------------------------------- */

  debugState() {
    if (!this.ac) {
      return { contextState: 'uninitialized', activeVoices: 0, layers: {} };
    }
    const now = this.ac.currentTime;
    let active = 0;
    for (let i = 0; i < this._voiceEnds.length; i++) {
      if (this._voiceEnds[i] > now) active++;
    }
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      contextState: this.ac.state,
      activeVoices: active,
      voicesStarted: this._voicesStarted,
      layers: {
        master: r(this.master.gain.value),
        wind: r(this.windGain.gain.value),
        rumble: r(this.rumbleGain.gain.value),
        rustle: r(this.rustleGain.gain.value),
        drone: r(this.droneGain.gain.value),
        plucks: r(this.pluckBus.gain.value),
        tension: r(this._tension),
        creak: r(this._creakLevel),
        gust: r(this._gust),
        heartbeat: this._hbOn,
        watcherDist: this._watcherDist === Infinity
          ? null : Math.round(this._watcherDist),
      },
      counts: { ...this._counts },
    };
  }
}
