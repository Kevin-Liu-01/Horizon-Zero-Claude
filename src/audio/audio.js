/**
 * GameAudio — fully procedural WebAudio soundscape. Zero audio assets:
 * every sound is synthesized (noise buffers, FM chirps, Karplus-Strong plucks,
 * metallic partial stacks). The AudioContext is created/resumed only on the
 * first user gesture or 'game-start'. One shared noise buffer + precomputed
 * pluck buffers are reused for all one-shots; simultaneous voices are capped.
 *
 * v2 (HZD-accuracy round): sonifies weapon wheel, Concentration (breath +
 * heartbeat + music low-pass), part tear-off, item pickup, ammo crafting,
 * attack telegraph blips, elemental canister explosions, brittle-freeze
 * shatter, disc-launcher thump and the Focus hologram hum. All new envelopes
 * are scheduled in AudioContext time / performance.now() (REAL time), so
 * engine.timeScale changes (wheel slow-mo, Concentration) never warp them.
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
      attacks: 0, explosions: 0, radar: 0, chimes: 0, machineSteps: 0,
      // v2
      parts: 0, items: 0, wheel: 0, switches: 0, crafts: 0, breaths: 0,
      telegraphs: 0, canisters: 0, shatters: 0, discs: 0, heals: 0,
      focusToggles: 0, concentrations: 0, tags: 0, flashes: 0,
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
    this._attackCd = new Map();   // machine-attack kind -> last one-shot ms
    this._testQueue = null;
    this._testT = 0;

    // v2 state — all timers below are wall-clock (performance.now) so the
    // wheel's / Concentration's engine.timeScale never stretches them.
    this._lastRealMs = performance.now();
    this._prevHealing = false;
    this._healLevel = 0;
    this._concActive = false;     // Concentration slow-mo (Shift while aiming)
    this._concNextHbMs = 0;       // next heartbeat thump, wall-clock ms
    this._concSetMs = -1e9;       // last event-driven flip (poll grace window)
    this._lpFreq = 16000;         // music low-pass current cutoff
    this._focusOn = false;        // Focus mode hum ('focus-on'/'focus-off')
    this._focusOffLag = 0;
    this._humLevel = 0;
    this._partTornMs = -1e9;      // dedupe 'part-torn' vs machine-damaged.tornPart
    this._shatterCdMs = -1e9;
    this._focusBlipMs = -1e9;
    this._itemMs = -1e9;
    this._itemBurst = 0;

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
    // Music routes through a sweepable low-pass: Concentration dips it to a
    // muffled underwater bed (canon slow-mo feel), update() sweeps it back.
    this.musicLP = ac.createBiquadFilter();
    this.musicLP.type = 'lowpass';
    this.musicLP.frequency.value = this._lpFreq;
    this.musicLP.Q.value = 0.4;
    this.musicBus.connect(this.musicLP).connect(this.master);

    this._noiseBuf = this._makeNoiseBuffer(2.0);
    this._pluckBufs = PENTA.map((f) => this._makePluckBuffer(f));

    this._buildWind();
    this._buildMusic();
    this._buildCreak();
    this._buildFocusHum();
    this._buildHealShimmer();

    // update() stops running outside 'playing' (pause/death/victory screens),
    // which would freeze looped layers at a nonzero gain; police them here.
    this._stateWatch = setInterval(() => {
      if (this.ctx.state === 'playing') return;
      if (this._creakLevel > 0 || this.creakGain?.gain.value > 0) this._killCreak();
      this._concActive = false;
      if (this._lpFreq < 15000 && this.musicLP) {
        this._lpFreq = 16000;
        this.musicLP.frequency.value = 16000;
      }
      // hum/heal loops mute while not playing; _focusOn persists so the hum
      // resumes if the player unpauses with Focus still engaged
      if (this._humLevel > 0 && this.humGain) {
        this._humLevel = 0; this.humGain.gain.value = 0;
      }
      if (this._healLevel > 0 && this.healGain) {
        this._healLevel = 0; this.healGain.gain.value = 0;
      }
    }, 200);

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

  /**
   * Focus hologram hum: persistent detuned triangle pair (slow beat) + a thin
   * data-shimmer noise band + 5 Hz flutter. Runs forever at gain 0; update()
   * fades humGain while Focus mode is active ('focus-on'/'focus-off').
   */
  _buildFocusHum() {
    const ac = this.ac;
    this.humGain = ac.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.sfxBus);
    // flutter stage: LFO wiggles a unity gain so update() owns humGain.value
    const flutter = ac.createGain();
    flutter.gain.value = 1;
    flutter.connect(this.humGain);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.2;
    const lfg = ac.createGain();
    lfg.gain.value = 0.14;
    lfo.connect(lfg).connect(flutter.gain);
    lfo.start();

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(flutter);
    const mk = (type, f, rel) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = rel;
      o.connect(g).connect(lp);
      o.start();
    };
    mk('triangle', 462, 1);      // beat pair ≈ 3.5 Hz — "projected light" wobble
    mk('triangle', 465.5, 1);
    mk('sine', 924, 0.3);        // octave sheen
    const ns = ac.createBufferSource();
    ns.buffer = this._noiseBuf;
    ns.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3150;
    bp.Q.value = 9;
    const ng = ac.createGain();
    ng.gain.value = 0.35;
    ns.connect(bp).connect(ng).connect(flutter);
    ns.start(0, 0.45);
  }

  /** Soft green shimmer while the pouch is transfusing (player.healing). */
  _buildHealShimmer() {
    const ac = this.ac;
    this.healGain = ac.createGain();
    this.healGain.gain.value = 0;
    this.healGain.connect(this.sfxBus);
    const ns = ac.createBufferSource();
    ns.buffer = this._noiseBuf;
    ns.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 3;
    ns.connect(bp).connect(this.healGain);
    ns.start(0, 0.9);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = 528;
    const og = ac.createGain();
    og.gain.value = 0.35;
    o.connect(og).connect(this.healGain);
    o.start();
  }

  /** Hard-silence the bow-creak loop (death/pause: update() stops driving it). */
  _killCreak() {
    this._creakLevel = 0;
    if (!this.creakGain) return;
    try { this.creakGain.gain.cancelScheduledValues(this.ac.currentTime); } catch {}
    this.creakGain.gain.value = 0;
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

  /** Blast-sling lob (heavy=false) / disc-launcher shot (heavy=true). */
  _discThump(heavy) {
    const g = this._voice(0.8, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.discs++;
    const t0 = this._now();
    const v = heavy ? 1 : 0.6;
    // deep barrel thump
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.32 * v, 0.006, 0.28);
    const o = this._osc('sine', heavy ? 135 : 175, t0, 0.36, eg);
    o.frequency.exponentialRampToValueAtTime(heavy ? 36 : 58, t0 + 0.27);
    const lp = this._lp(heavy ? 420 : 620);
    const eg2 = this.ac.createGain();
    lp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.17 * v, 0.005, 0.2);
    this._noise(t0, 0.24, lp);
    // mechanical action clack
    const bp = this._bp(1900, 3);
    const eg3 = this.ac.createGain();
    bp.connect(eg3).connect(g);
    this._env(eg3.gain, t0, 0.06 * v, 0.002, 0.04);
    this._noise(t0, 0.05, bp);
    // projectile leaving
    const bp2 = this._bp(700, 1.2);
    const eg4 = this.ac.createGain();
    bp2.connect(eg4).connect(g);
    bp2.frequency.setValueAtTime(700, t0);
    bp2.frequency.exponentialRampToValueAtTime(heavy ? 240 : 1400, t0 + 0.3);
    eg4.gain.setValueAtTime(0.0001, t0 + 0.02);
    eg4.gain.exponentialRampToValueAtTime(0.05 * v + 0.02, t0 + 0.08);
    eg4.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.32);
    this._noise(t0 + 0.02, 0.32, bp2);
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

  /** Freeze-arrow splash: icy hiss + falling crystalline whine. */
  _frostHiss(pan, att) {
    const g = this._voice(0.45, att, pan, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const hp = this._hp(4800);
    const eg = this.ac.createGain();
    hp.connect(eg).connect(g);
    this._env(eg.gain, t0, 0.055, 0.008, 0.24);
    this._noise(t0, 0.3, hp);
    const eg2 = this.ac.createGain();
    eg2.connect(g);
    this._env(eg2.gain, t0, 0.022, 0.006, 0.2);
    const o = this._osc('sine', 2300, t0, 0.26, eg2);
    o.frequency.exponentialRampToValueAtTime(860, t0 + 0.22);
  }

  /** Brittle (frozen) machine takes a hit: glassy shatter tink. */
  _shatter(pan, att) {
    const nowMs = performance.now();
    if (nowMs - this._shatterCdMs < 80) return; // rapid hits: don't stack glass
    this._shatterCdMs = nowMs;
    const g = this._voice(0.5, att, pan, this.sfxBus);
    if (!g) return;
    this._counts.shatters++;
    const t0 = this._now();
    for (let i = 0; i < 5; i++) {
      const t = t0 + Math.random() * 0.035;
      const eg = this.ac.createGain();
      eg.connect(g);
      const dec = 0.03 + Math.random() * 0.09;
      this._env(eg.gain, t, 0.035, 0.002, dec);
      this._osc('sine', 2500 + Math.random() * 3600, t, dec + 0.04, eg);
    }
    const hp = this._hp(6500);
    const eg2 = this.ac.createGain();
    hp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.045, 0.002, 0.05);
    this._noise(t0, 0.08, hp);
  }

  /** Component ripped off: falling metal shear + body clank + debris clatter. */
  _partTorn(pan, att) {
    const g = this._voice(1.3, att, pan, this.sfxBus);
    if (!g) return;
    this._counts.parts++;
    const t0 = this._now();
    // metal shear: falling saw scream through a tight sweeping bandpass
    const bp = this._bp(1500, 3.5);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    bp.frequency.setValueAtTime(1500, t0);
    bp.frequency.exponentialRampToValueAtTime(320, t0 + 0.3);
    this._env(eg.gain, t0, 0.16, 0.006, 0.3);
    const saw = this._osc('sawtooth', 880, t0, 0.36, bp);
    saw.frequency.exponentialRampToValueAtTime(190, t0 + 0.3);
    // rip noise
    const hp = this._hp(2400);
    const eg2 = this.ac.createGain();
    hp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.1, 0.004, 0.14);
    this._noise(t0, 0.18, hp);
    // struck-body ring
    const ratios = [1, 2.76, 5.4];
    const amps = [0.1, 0.06, 0.03];
    for (let i = 0; i < 3; i++) {
      const eg3 = this.ac.createGain();
      eg3.connect(g);
      this._env(eg3.gain, t0 + 0.02, amps[i], 0.003, 0.34 / (1 + i * 0.5));
      this._osc('sine', 340 * ratios[i] * (1 + (Math.random() - 0.5) * 0.03),
        t0 + 0.02, 0.42, eg3);
    }
    // clatter: debris tinks bouncing away, decaying
    let t = t0 + 0.22;
    for (let i = 0; i < 4; i++) {
      const eg4 = this.ac.createGain();
      eg4.connect(g);
      const dec = 0.05 + Math.random() * 0.08;
      this._env(eg4.gain, t, 0.05 / (1 + i * 0.45), 0.002, dec);
      this._osc('sine', 900 + Math.random() * 1500, t, dec + 0.05, eg4);
      t += 0.07 + Math.random() * 0.12;
    }
  }

  /** Pickup tick; leafy=true for medicinal herbs (soft plant rustle). */
  _itemTick(leafy, delay = 0) {
    const g = this._voice(0.45 + delay, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.items++;
    const t0 = this._now() + delay;
    if (leafy) {
      const swish = (t, dur) => {
        const hp = this._hp(3000);
        const eg = this.ac.createGain();
        hp.connect(eg).connect(g);
        this._env(eg.gain, t, 0.035, 0.015, dur);
        this._noise(t, dur + 0.03, hp);
      };
      swish(t0, 0.06);
      swish(t0 + 0.07, 0.09);
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t0 + 0.05, 0.028, 0.01, 0.14);
      const o = this._osc('sine', 780, t0 + 0.05, 0.2, eg);
      o.frequency.exponentialRampToValueAtTime(1180, t0 + 0.17);
    } else {
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t0, 0.04, 0.004, 0.07);
      const o = this._osc('sine', 1480, t0, 0.1, eg);
      o.frequency.exponentialRampToValueAtTime(1150, t0 + 0.08);
      const hp = this._hp(5500);
      const eg2 = this.ac.createGain();
      hp.connect(eg2).connect(g);
      this._env(eg2.gain, t0, 0.02, 0.002, 0.025);
      this._noise(t0, 0.04, hp);
    }
  }

  /** Weapon-wheel time dilation: whoosh down (open) / back up + tick (close). */
  _wheelWhoosh(opening) {
    const g = this._voice(0.7, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.wheel++;
    const t0 = this._now();
    const bp = this._bp(opening ? 2000 : 320, 1.1);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    bp.frequency.setValueAtTime(opening ? 2000 : 320, t0);
    bp.frequency.exponentialRampToValueAtTime(
      opening ? 300 : 1900, t0 + (opening ? 0.42 : 0.3));
    eg.gain.setValueAtTime(0.0001, t0);
    eg.gain.exponentialRampToValueAtTime(0.085, t0 + 0.06);
    eg.gain.exponentialRampToValueAtTime(0.0008, t0 + (opening ? 0.5 : 0.36));
    this._noise(t0, 0.55, bp);
    // pitch drop / rise sells the slow-mo
    const eg2 = this.ac.createGain();
    eg2.connect(g);
    this._env(eg2.gain, t0, 0.045, 0.03, opening ? 0.4 : 0.28);
    const o = this._osc('sine', opening ? 260 : 95, t0, 0.5, eg2);
    o.frequency.exponentialRampToValueAtTime(
      opening ? 88 : 240, t0 + (opening ? 0.38 : 0.26));
    if (!opening) {
      // soft re-engage tick as time snaps back
      const bp2 = this._bp(2600, 4);
      const eg3 = this.ac.createGain();
      bp2.connect(eg3).connect(g);
      this._env(eg3.gain, t0 + 0.24, 0.05, 0.003, 0.04);
      this._noise(t0 + 0.24, 0.05, bp2);
    }
  }

  /** Weapon switch: dry mechanical double-click + low thock. */
  _switchClick() {
    const g = this._voice(0.3, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.switches++;
    const t0 = this._now();
    const tick = (t, f, vol) => {
      const bp = this._bp(f, 5);
      const eg = this.ac.createGain();
      bp.connect(eg).connect(g);
      this._env(eg.gain, t, vol, 0.002, 0.03);
      this._noise(t, 0.04, bp);
    };
    tick(t0, 2900, 0.055);
    tick(t0 + 0.05, 3600, 0.04);
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0 + 0.01, 0.045, 0.004, 0.06);
    const o = this._osc('sine', 210, t0 + 0.01, 0.1, eg);
    o.frequency.exponentialRampToValueAtTime(128, t0 + 0.09);
  }

  /** Ammo crafted: two woody taps + a fletching zip. */
  _craftSound() {
    const g = this._voice(0.7, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.crafts++;
    const t0 = this._now();
    const tap = (t, f) => {
      const bp = this._bp(f, 1.6);
      const eg = this.ac.createGain();
      bp.connect(eg).connect(g);
      this._env(eg.gain, t, 0.09, 0.003, 0.06);
      this._noise(t, 0.08, bp);
      const eg2 = this.ac.createGain();
      eg2.connect(g);
      this._env(eg2.gain, t, 0.05, 0.003, 0.07);
      const o = this._osc('sine', f * 0.35, t, 0.11, eg2);
      o.frequency.exponentialRampToValueAtTime(f * 0.24, t + 0.08);
    };
    tap(t0, 620);
    tap(t0 + 0.13, 540);
    // fletch zip: fast rising high sweep
    const bp = this._bp(1800, 2.2);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    bp.frequency.setValueAtTime(1700, t0 + 0.26);
    bp.frequency.exponentialRampToValueAtTime(5400, t0 + 0.4);
    eg.gain.setValueAtTime(0.0001, t0 + 0.26);
    eg.gain.exponentialRampToValueAtTime(0.05, t0 + 0.3);
    eg.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.44);
    this._noise(t0 + 0.26, 0.2, bp);
  }

  /** Concentration breath: inhale (start) / exhale (end). */
  _breath(inhale) {
    const g = this._voice(0.6, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.breaths++;
    const t0 = this._now();
    const bp = this._bp(inhale ? 480 : 1250, 0.8);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    bp.frequency.setValueAtTime(inhale ? 480 : 1250, t0);
    bp.frequency.exponentialRampToValueAtTime(
      inhale ? 1450 : 430, t0 + (inhale ? 0.38 : 0.32));
    eg.gain.setValueAtTime(0.0001, t0);
    eg.gain.exponentialRampToValueAtTime(
      inhale ? 0.055 : 0.04, t0 + (inhale ? 0.3 : 0.08));
    eg.gain.exponentialRampToValueAtTime(0.0008, t0 + (inhale ? 0.44 : 0.4));
    this._noise(t0, 0.5, bp);
  }

  /** Eye-flash attack telegraph: short rising blip — THE audible dodge cue. */
  _telegraphBlip(pan, att) {
    const g = this._voice(0.35, Math.max(att, 0.45), pan, this.sfxBus);
    if (!g) return;
    this._counts.telegraphs++;
    const t0 = this._now();
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.085, 0.012, 0.2);
    const o = this._osc('sine', 640, t0, 0.26, eg);
    o.frequency.exponentialRampToValueAtTime(1550, t0 + 0.2);
    const eg2 = this.ac.createGain();
    eg2.connect(g);
    this._env(eg2.gain, t0, 0.02, 0.012, 0.16);
    const o2 = this._osc('square', 1280, t0, 0.22, eg2);
    o2.frequency.exponentialRampToValueAtTime(3100, t0 + 0.2);
  }

  /** Elemental canister / status trigger: element-flavored detonation. */
  _canisterBoom(pan, att, element) {
    this._counts.canisters++;
    const a = Math.max(att, 0.5);
    const el = String(element || 'fire');
    if (/freeze|frost|ice|chill|brittle/i.test(el)) {
      // freeze burst: cold whump + icy blast + crystalline shards
      const g = this._voice(1.1, a, pan, this.sfxBus);
      if (!g) return;
      const t0 = this._now();
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t0, 0.2, 0.006, 0.3);
      const o = this._osc('sine', 190, t0, 0.38, eg);
      o.frequency.exponentialRampToValueAtTime(60, t0 + 0.3);
      const hp = this._hp(3800);
      const eg2 = this.ac.createGain();
      hp.connect(eg2).connect(g);
      this._env(eg2.gain, t0, 0.16, 0.004, 0.45);
      this._noise(t0, 0.5, hp);
      for (let i = 0; i < 6; i++) {
        const t = t0 + 0.04 + Math.random() * 0.3;
        const eg3 = this.ac.createGain();
        eg3.connect(g);
        const dec = 0.05 + Math.random() * 0.12;
        this._env(eg3.gain, t, 0.04, 0.002, dec);
        this._osc('sine', 2200 + Math.random() * 3800, t, dec + 0.05, eg3);
      }
    } else if (/shock|stun|spark/i.test(el)) {
      this._zap(pan, a);
      this._zap(pan * 0.5, a * 0.8);
      this._boom(pan, a * 0.9);
    } else {
      // blaze canister: the big one — layered blast + fire-crackle tail
      this._explosion(pan, a, 1.35);
      const g = this._voice(1.2, a, pan, this.sfxBus);
      if (!g) return;
      const bp = this._bp(2900, 1.4);
      bp.connect(g);
      let t = this._now() + 0.1;
      for (let i = 0; i < 7; i++) {
        const eg = this.ac.createGain();
        eg.connect(bp);
        this._env(eg.gain, t, 0.05 + Math.random() * 0.05, 0.002, 0.03);
        this._noise(t, 0.045, eg);
        t += 0.04 + Math.random() * 0.1;
      }
    }
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

  /**
   * Heavy-machine footfall: short quiet sub thud, steeply distance-scaled.
   * Deliberately NOT a roar/boom and never drives combat tension — a calm
   * thunderjaw stomping on patrol should read as distant weight, not threat.
   */
  _machineStep(pan, att, big) {
    // steepen falloff beyond the normal 1/(1+0.03d) so far steps stay subtle
    const a = att * att;
    if (a < 0.015) return;
    const g = this._voice(0.45, 1, pan, this.sfxBus);
    if (!g) return;
    this._counts.machineSteps++;
    const t0 = this._now();
    const vol = (big ? 0.2 : 0.13) * a;
    const lp = this._lp(170);
    const eg = this.ac.createGain();
    lp.connect(eg).connect(g);
    this._env(eg.gain, t0, vol, 0.006, 0.16);
    this._noise(t0, 0.2, lp);
    const eg2 = this.ac.createGain();
    eg2.connect(g);
    this._env(eg2.gain, t0, vol * 1.1, 0.006, 0.2);
    const o = this._osc('sine', big ? 68 : 82, t0, 0.26, eg2);
    o.frequency.exponentialRampToValueAtTime(big ? 28 : 38, t0 + 0.2);
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
    // 'focus-on' + 'focus-pulse' can land the same frame — one blip is enough
    const nowMs = performance.now();
    if (nowMs - this._focusBlipMs < 150) return;
    this._focusBlipMs = nowMs;
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

  /** Focus tag placed on a machine: crisp two-note holo blip. */
  _tagBlip() {
    const g = this._voice(0.4, 1, 0, this.sfxBus);
    if (!g) return;
    this._counts.tags++;
    const t0 = this._now();
    const note = (t, f0, f1) => {
      const eg = this.ac.createGain();
      eg.connect(g);
      this._env(eg.gain, t, 0.045, 0.005, 0.09);
      const o = this._osc('sine', f0, t, 0.13, eg);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
    };
    note(t0, 1320, 1560);
    note(t0 + 0.09, 1760, 2090);
    // tiny data tick under the notes
    const bp = this._bp(4200, 6);
    const eg2 = this.ac.createGain();
    bp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.02, 0.002, 0.03);
    this._noise(t0, 0.04, bp);
  }

  /** Watcher blinding strobe: bright white-hot zap sting (dodge/avert cue). */
  _flashZap(pan, att) {
    const g = this._voice(0.7, Math.max(att, 0.5), pan, this.sfxBus);
    if (!g) return;
    this._counts.flashes++;
    const t0 = this._now();
    // searing rising whine
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.09, 0.006, 0.4);
    const o = this._osc('sawtooth', 1150, t0, 0.48, eg);
    o.frequency.exponentialRampToValueAtTime(3400, t0 + 0.09);
    o.frequency.exponentialRampToValueAtTime(2600, t0 + 0.42);
    // electric burst
    const hp = this._hp(5200);
    const eg2 = this.ac.createGain();
    hp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, 0.08, 0.003, 0.3);
    this._noise(t0, 0.34, hp);
    // capacitor discharge thump grounds the sting
    const eg3 = this.ac.createGain();
    eg3.connect(g);
    this._env(eg3.gain, t0, 0.07, 0.004, 0.12);
    const sub = this._osc('sine', 220, t0, 0.16, eg3);
    sub.frequency.exponentialRampToValueAtTime(88, t0 + 0.13);
  }

  /** Focus powering down: short falling shimmer. */
  _focusOff() {
    const g = this._voice(0.4, 1, 0, this.sfxBus);
    if (!g) return;
    const t0 = this._now();
    const eg = this.ac.createGain();
    eg.connect(g);
    this._env(eg.gain, t0, 0.04, 0.015, 0.28);
    const o = this._osc('sine', 1100, t0, 0.32, eg);
    o.frequency.exponentialRampToValueAtTime(460, t0 + 0.28);
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
    // spatialize from a point/position with a neutral fallback
    const at = (pos, fallbackAtt = 0.7) => {
      if (pos) this._spatial(pos);
      else { this._pan = 0; this._att = fallbackAtt; }
    };

    ev.on('arrow-fired', armed(({ type, drawStrength } = {}) => {
      const id = String(type || '');
      if (/disc/i.test(id)) this._discThump(true);                       // disc launcher: heavy
      else if (/blast|bomb|sling/i.test(id) && !/tear/i.test(id)) this._discThump(false); // blast sling lob
      else this._bowRelease(drawStrength ?? 0.6);
    }));

    ev.on('arrow-hit', armed(({ point, machine, weak, type } = {}) => {
      at(point, 0.8);
      const id = String(type || '');
      const att = Math.max(this._att, 0.35);
      if (machine) {
        this._clank(this._pan, att, !!weak);
        if (/shock|spark/i.test(id)) this._zap(this._pan, att);
        else if (/fire|blaze/i.test(id)) this._ignite(this._pan, att);
        else if (/freeze|chill/i.test(id)) this._frostHiss(this._pan, att);
        else if (/blast|disc|bomb/i.test(id)) this._explosion(this._pan, att, 0.8);
      } else {
        if (/blast|disc|bomb/i.test(id)) this._explosion(this._pan, this._att, 0.75);
        else this._thud(this._pan, this._att);
        if (/fire|blaze/i.test(id)) this._ignite(this._pan, this._att);
        else if (/freeze|chill/i.test(id)) this._frostHiss(this._pan, this._att);
      }
    }));

    // v2: torn components — metal shear + clatter. Machines emit 'part-torn';
    // the tornPart field on 'machine-damaged' is a fallback (120ms dedupe so
    // both surfaces landing together play once).
    const partTornAt = (pos) => {
      const nowMs = performance.now();
      if (nowMs - this._partTornMs < 120) return;
      this._partTornMs = nowMs;
      at(pos);
      this._partTorn(this._pan, Math.max(this._att, 0.45));
    };
    ev.on('part-torn', armed((e = {}) =>
      partTornAt(e?.point ?? e?.machine?.position ?? e?.part?.mesh?.position ?? null)));

    ev.on('machine-damaged', armed((e = {}) => {
      const pos = e.point ?? e.machine?.position ?? null;
      if (e.tornPart) partTornAt(pos);
      if (e.triggeredElement) {
        at(pos);
        this._canisterBoom(this._pan, this._att, e.triggeredElement);
        this._lastTenseT = this._t;
      }
      const brittle = e.brittle ?? e.machine?.brittle ?? e.machine?.frozen ?? false;
      if (brittle && !e.triggeredElement) {
        at(pos);
        this._shatter(this._pan, Math.max(this._att, 0.4));
      }
    }));

    // v2: pickups — burst-staggered so a Take All reads as a fast tick roll
    ev.on('item-gained', armed((e = {}) => {
      const nowMs = performance.now();
      if (nowMs - this._itemMs > 200) this._itemBurst = 0;
      this._itemMs = nowMs;
      const delay = Math.min(this._itemBurst * 0.055, 0.5);
      this._itemBurst++;
      this._itemTick(/herb|medicinal|plant/i.test(String(e.id || '')), delay);
    }));

    // v2: weapon wheel + crafting + concentration. The close whoosh only
    // belongs to live play — Esc/pause/death closing the wheel stays silent.
    ev.on('wheel-open', armed(() => this._wheelWhoosh(true)));
    ev.on('wheel-close', armed(() => {
      if (this.ctx.state === 'playing') this._wheelWhoosh(false);
    }));
    ev.on('weapon-switch', armed(() => this._switchClick()));
    ev.on('ammo-crafted', armed(() => this._craftSound()));
    ev.on('concentration-start', armed(() => this._concSet(true)));
    ev.on('concentration-end', armed(() => this._concSet(false)));

    // v2: the audible dodge cue (eye-flash windup)
    ev.on('machine-telegraph', armed(({ machine } = {}) => {
      at(machine?.position ?? null);
      this._telegraphBlip(this._pan, this._att);
    }));

    // Focus tag marker placed (focus builder emits 'machine-tagged')
    ev.on('machine-tagged', armed(() => this._tagBlip()));

    // Watcher blinding strobe — machines builder may emit this; the
    // optional-chained position read keeps it harmless if it never fires.
    ev.on('watcher-flash', armed((e = {}) => {
      at(e?.machine?.position ?? null);
      this._flashZap(this._pan, this._att);
    }));

    // v2: Focus mode hum (focus builder emits these; harmless if absent)
    ev.on('focus-on', armed(() => {
      this._focusOn = true;
      this._counts.focusToggles++;
      this._focus();
    }));
    ev.on('focus-off', armed(() => {
      this._focusOn = false;
      this._focusOff();
    }));

    ev.on('machine-alerted', armed(({ machine } = {}) => {
      at(machine?.position ?? null);
      this._sting(this._pan, Math.max(this._att, 0.5));
      this._lastTenseT = this._t;
    }));

    ev.on('machine-attack', armed(({ machine, kind } = {}) => {
      at(machine?.position ?? null);
      const big = machine?.kind === 'thunderjaw' || machine?.kind === 'behemoth';
      // Locomotion footfalls are ambience, not aggression: quiet low thud,
      // and never refresh the combat-tension timer.
      if (kind === 'step') {
        this._machineStep(this._pan, this._att, big);
        return;
      }
      // Per-kind cooldown so burst emitters (disc volleys, retriggered
      // attacks) can't stack roars; tension still refreshes below.
      const key = kind || 'attack';
      const nowMs = performance.now();
      if (nowMs - (this._attackCd.get(key) ?? -1e9) >= 800) {
        this._attackCd.set(key, nowMs);
        const stompy = /stomp|slam|charge|quake|shock/i.test(kind || '');
        if (stompy || (big && !kind)) this._boom(this._pan, Math.max(this._att, 0.4));
        else this._roar(this._pan, Math.max(this._att, 0.4), big);
      }
      this._lastTenseT = this._t;
    }));

    ev.on('machine-killed', armed(({ machine } = {}) => {
      at(machine?.position ?? null);
      const size = machine?.kind === 'thunderjaw' ? 1.5
        : machine?.kind === 'behemoth' ? 1.3
          : machine?.kind === 'sawtooth' ? 1.15 : 1;
      this._explosion(this._pan, Math.max(this._att, 0.5), size);
    }));

    ev.on('player-hurt', armed(() => this._hurt()));
    // Heal audio keys off player.healing edges observed in update() — the
    // pouch drains continuously, so count-based chimes would spam.
    ev.on('player-died', armed(() => {
      this._killCreak(); // update() stops on the death screen
      this._droneFall();
    }));
    ev.on('player-respawn', armed(() => {
      this._prevHealing = false;
      this._chime();
    }));
    ev.on('player-dodge', armed(() => this._dodgeWhoosh()));
    ev.on('victory', armed(() => this._victory()));
    ev.on('focus-pulse', armed(() => this._focus()));
    ev.on('objective-changed', armed(() => this._objectiveBlip()));
  }

  /** Concentration slow-mo entered/left (idempotent; event + poll driven). */
  _concSet(on) {
    if (on === this._concActive) return;
    this._concActive = on;
    this._concSetMs = performance.now();
    if (on) {
      this._counts.concentrations++;
      this._breath(true);
      this._concNextHbMs = performance.now() + 380;
    } else {
      this._breath(false);
    }
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
      // ---- v2 additions ----
      [8.2, () => this._partTorn(0.2, 1)],
      [8.9, () => this._itemTick(false)],
      [9.2, () => this._itemTick(true)],
      [9.7, () => this._wheelWhoosh(true)],
      [10.3, () => this._switchClick()],
      [10.7, () => this._wheelWhoosh(false)],
      [11.2, () => this._craftSound()],
      [11.9, () => this._concSet(true)],   // breath in + heartbeat + music LP
      [13.6, () => this._concSet(false)],  // breath out, LP sweeps back
      [14.2, () => this._telegraphBlip(0, 1)],
      [14.7, () => this._canisterBoom(0, 1, 'fire')],
      [16.2, () => this._canisterBoom(0.3, 1, 'shock')],
      [17.2, () => this._canisterBoom(-0.3, 1, 'freeze')],
      [18.2, () => this._shatter(0, 1)],
      [18.6, () => this._frostHiss(0, 1)],
      [19.0, () => this._discThump(true)],
      [19.6, () => this._discThump(false)],
      [20.2, () => { this._focusOn = true; this._focus(); }],  // hum fades in
      [22.2, () => { this._focusOn = false; this._focusOff(); }],
      [22.8, () => this._tagBlip()],
      [23.3, () => this._flashZap(0, 1)],
    ];
  }

  /* -------------------------------- update ------------------------------- */

  update(dt, t) {
    if (!this.ac) return;
    this._t = t;
    const ctx = this.ctx;
    const p = ctx.player;
    const playing = ctx.state === 'playing' || ctx.params?.has?.('shot');
    // Wall-clock dt: engine.timeScale scales `dt`, but slow-mo layers
    // (concentration heartbeat, hum/heal/LP fades) must run in real time.
    const nowMs = performance.now();
    const rdt = clamp((nowMs - this._lastRealMs) / 1000, 0, 0.1);
    this._lastRealMs = nowMs;

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

    // --- footsteps synced to the animator gait (same formula, one footfall
    //     per half stride cycle): stepLen = clamp(0.5+0.3*v, 0.6, 1.92),
    //     footfalls/s = v / stepLen
    if (p && playing) {
      const sp = p.moveSpeed;
      if (sp > 0.6 && !p.dodging && p.health > 0) {
        const stepLen = clamp(0.5 + 0.3 * sp, 0.6, 1.92);
        this._stridePhase += (sp / (2 * stepLen)) * dt;
        if (this._stridePhase >= 0.5) {
          this._stridePhase -= 0.5;
          this._footstep(clamp(sp / 8.2, 0, 1), p.crouching, p.inTallGrass);
        }
      } else {
        this._stridePhase = 0.38; // next step lands soon after moving again
      }
    }

    // --- medicine pouch transfusion (hold Q): chime on start + soft green
    //     shimmer while the pouch drains (player.healing, real-time fade)
    if (p) {
      const healing = !!p.healing;
      if (healing && !this._prevHealing && p.health > 0) {
        this._counts.heals++;
        this._chime();
      }
      this._prevHealing = healing;
      const target = healing && playing && p.health > 0 ? 0.02 : 0;
      this._healLevel += (target - this._healLevel) * Math.min(1, rdt * 6);
      if (this._healLevel < 0.0004) this._healLevel = 0;
      if (this.healGain) this.healGain.gain.value = this._healLevel;
    }

    // --- bow creak follows drawStrength (lazy: combat builds after audio);
    //     hard-muted outside 'playing' so it can't drone over death/pause
    if (ctx.state !== 'playing' || (p && p.health <= 0)) {
      this._killCreak();
      this._prevDraw = 0;
    } else {
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
    }

    // --- Concentration: reconcile with combat's gauge if exposed (covers a
    //     missed event either way), heartbeat on a WALL-CLOCK interval, and
    //     the music ducks under a low-pass while active
    const conc = ctx.combat?.concentration;
    if (conc) {
      // grace window: if the event lands a frame before combat flips .active,
      // don't let the poll cancel and re-trigger (double breaths)
      if (this._concActive && !conc.active
        && nowMs - this._concSetMs > 300) this._concSet(false);
      else if (!this._concActive && conc.active && playing) this._concSet(true);
    }
    if (this._concActive && playing) {
      if (nowMs >= this._concNextHbMs) {
        this._heartbeat();
        this._concNextHbMs = nowMs + 850;
      }
    }
    const lpTarget = this._concActive && playing ? 460 : 16000;
    this._lpFreq += (lpTarget - this._lpFreq)
      * Math.min(1, rdt * (this._concActive ? 10 : 5));
    this.musicLP.frequency.value = this._lpFreq;

    // --- Focus hologram hum: fades with real time while Focus mode is on.
    //     Safety: if the focus system reports inactive for a sustained
    //     stretch (missed 'focus-off'), drop the hum. Lenient window so a
    //     short pulse-style .active flag can't cut a legitimate mode hum.
    if (this._focusOn && ctx.focus && ctx.focus.active === false) {
      this._focusOffLag += rdt;
      if (this._focusOffLag > 2.5) this._focusOn = false;
    } else {
      this._focusOffLag = 0;
    }
    const humTarget = this._focusOn && playing ? 0.02 : 0;
    this._humLevel += (humTarget - this._humLevel) * Math.min(1, rdt * 7);
    if (this._humLevel < 0.0004) this._humLevel = 0;
    if (this.humGain) this.humGain.gain.value = this._humLevel;

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

    // --- low-health heartbeat (skipped while Concentration drives its own)
    if (p && playing && p.health > 0 && p.health < 30 && !this._concActive) {
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
      this._testT += rdt; // real time: the test must ignore slow-mo too
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
        // v2 layers
        musicLP: Math.round(this._lpFreq),
        concentration: this._concActive,
        focusHum: r(this._humLevel),
        healShimmer: r(this._healLevel),
      },
      counts: { ...this._counts },
    };
  }
}
