/**
 * GameAudio — the hybrid WebAudio mix (Round 4, decision **D2**).
 *
 * v1/v2 were 100 % procedural. That ceiling (`audio-16`) made four blockers
 * unfixable: eight species shared two synthesized roars, one footstep served
 * every surface, three bows shared one release, and there was no Aloy foley at
 * all. v3 keeps every procedural voice that is *idiomatic* — the Focus
 * hologram, elemental zaps, UI blips, the wind bed, the adaptive plucks — and
 * puts a licensed sample bank underneath everything that wanted a recording.
 *
 * What v3 adds
 *  - `SampleBank` (src/audio/bank.js): 90 CC0 Ogg/Opus cues in 58 sets, each
 *    with a licence row. See `public/audio/MANIFEST.md`.
 *  - Real 3D (src/audio/spatial.js): PannerNode + inverse distance + air
 *    absorption + reverb send + occlusion via `ctx.collision.occluded()`.
 *  - A mix graph (src/audio/buses.js): world low-pass over the whole diegetic
 *    world for Concentration, a UI bus that bypasses it, sidechain ducking and
 *    persisted volume sliders on `ctx.settings.audio`.
 *  - A priority voice pool: a Thunderjaw roar steals a footstep, never the
 *    other way round.
 *  - Headless verification (src/audio/probe.js): the gates render the real
 *    graph through an OfflineAudioContext and measure the samples.
 *
 * The AudioContext is still created/resumed only on the first gesture or
 * 'game-start', and all envelopes are still scheduled in AudioContext /
 * performance.now() time, so `engine.timeScale` never warps them.
 */

import { SampleBank } from './bank.js';
import { buildBuses, Ducker, DEFAULT_VOLUMES, VOLUME_BUSES } from './buses.js';
import { SpatialPool, SpatialChain, LoopEmitter, syncListener } from './spatial.js';
import { probeSpatial, probeBuffer, bandDistance, beatGrid } from './probe.js';
import { MusicDirector, BEAT } from './music.js';
import { ZoneEmitters } from './zones.js';

const PENTA = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0]; // A min pentatonic
const VOICE_CAP = 24;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const SETTINGS_KEY = 'hzc.audio.v1';

/** Machine kind -> footfall weight class (mstep/*) and voice loudness. */
const WEIGHT = {
  watcher: 'light', scrapper: 'light', glinthawk: 'light', longleg: 'medium',
  strider: 'medium', sawtooth: 'medium', behemoth: 'heavy', thunderjaw: 'heavy',
};
const SPECIES = [
  'watcher', 'strider', 'scrapper', 'longleg',
  'glinthawk', 'sawtooth', 'behemoth', 'thunderjaw',
];
/** Biome beds, cross-faded one-at-a-time by `_pickBed()` (`audio-11`). */
const BEDS = [
  'amb/meadow', 'amb/river', 'amb/forest', 'amb/night', 'amb/ridge',
];
/** Per-bed level: a campfire is a presence, a night bed is a floor. */
const BED_GAIN = {
  'amb/campfire': 0.5, 'amb/river': 0.46, 'amb/ridge': 0.44,
  'amb/forest': 0.42, 'amb/meadow': 0.42, 'amb/night': 0.34,
};
/**
 * `terrain.surfaceAt()` vocabulary -> footstep set (`audio-04`).
 *
 * `Terrain.SURFACES` is ['water','cobble','silt','dirt','gravel','rock','snow',
 * 'grass'] and every one of them now has its own recorded set. The previous
 * map folded five of the eight onto rock or dirt, which meant wading the river
 * and walking a gravel bench produced the same sound — the single most
 * audible thing world-ground's new surface field could have fixed and didn't.
 * The extra keys are aliases so a future vocabulary addition degrades to a
 * near neighbour instead of falling all the way back to grass.
 */
const SURFACE_SET = {
  grass: 'foot/grass', meadow: 'foot/grass', moss: 'foot/grass',
  dirt: 'foot/dirt', path: 'foot/dirt', sand: 'foot/dirt',
  silt: 'foot/silt', mud: 'foot/silt',
  water: 'foot/water', shallow: 'foot/water',
  cobble: 'foot/cobble', stone: 'foot/cobble',
  gravel: 'foot/gravel', scree: 'foot/gravel', shale: 'foot/gravel',
  rock: 'foot/rock', metal: 'foot/rock',
  snow: 'foot/snow', ice: 'foot/snow',
};
/**
 * Weapon id fragment -> bow set (`audio-13`).
 *
 * `rope` is on the heavy rung deliberately: the Ropecaster is a crossbow-weight
 * draw, and without it `bowSetFor('ropecaster')` fell through to `hunter` and a
 * harpoon launcher twanged like a short bow.
 */
function bowSetFor(id) {
  const s = String(id || '').toLowerCase();
  if (/sharp|precision|marks/.test(s)) return 'sharpshot';
  if (/war|heavy|tear|rope/.test(s)) return 'war';
  return 'hunter';
}

/** Weapons that put an arrow on a string — the only ones that nock. */
const NOCKING = /bow|ropecaster/;
/** Voice priorities — the pool steals upward only. */
const PRI = {
  ambience: 1, footstep: 2, gear: 2, ui: 9, item: 3, machineStep: 3,
  hit: 5, bow: 5, breath: 4, voice: 7, big: 8, death: 8, hurt: 8,
};

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

    /* --------------------------- v3 (Round 4) --------------------------- */
    this.bank = new SampleBank();
    this.buses = null;
    this.pool = null;
    this.ducker = null;
    /** @type {Record<string, LoopEmitter>} */
    this.loops = {};
    this._bed = null;             // current ambience bed set id
    this._bedList = [];           // cached values of this.loops (no per-frame for-in)
    this._bedT = 0;
    this._worldLPFreq = 20000;
    this._surface = 'grass';
    this._servoT = 0;
    this._pendingFlyby = null;
    this._listener = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };
    this._occA = null;            // Vector3 scratch, built in _init
    this._occB = null;
    this._machineLoops = new Map();  // machine -> LoopEmitter (servo idle)
    /**
     * Cached `_machineLoops.values()` — see `_rebuildLoopList()`. The spatial
     * update walks this array, never the Map, because a Map iterator is a
     * per-frame allocation and this loop runs every frame a machine is in
     * earshot.
     */
    this._loopList = [];
    this._scanCd = new Map();
    this._footfallCd = new Map();
    this._staggerMs = -1e9;

    /* ------------------- v4 (Round 4, audio content half) --------------- */
    /** @type {MusicDirector|null} the adaptive stem score (audio-01) */
    this.music = null;
    /** @type {ZoneEmitters|null} positional fire / water / status / loot loops */
    this.zones = null;
    this._musicState = 'calm';
    this._combatUntil = -1e9;      // wall-clock ms the combat mix holds until
    this._suspectUntil = -1e9;
    this._resolveUntil = -1e9;
    this._musicT = 0;              // selector throttle
    this._zoneT = 0;               // zone-emitter rescan throttle
    this._statusT = 0;             // elemental status rescan throttle
    this._callT = 22 + Math.random() * 20;   // distant machine call timer
    this._breathT = 0;             // exertion breath timer (audio-03)
    this._nockPrev = false;        // rising edge of combat.nockLanded (audio-13)
    this._drawPrev = false;        // rising edge of combat.drawStrength
    this._nockBow = null;          // which bow set those edges belong to
    this._exertion = 0;            // 0..1 running average of effort
    this._airborne = false;
    this._wreckBeacons = new Map();  // machine -> ms the beacon started
    this._warbleCd = new Map();
    this._mids = new WeakMap();      // machine -> stable small int for zone ids
    this._midN = 0;
    this._wantSet = new Set();       // reused by _statusScan; never reallocated
    this._legacyScore = true;        // false once MusicDirector takes over
    this._surfaceKey = 'grass';    // last raw surfaceAt value (debug + gates)
    this._sampleCounts = { played: 0, refused: 0, missing: 0 };
    /** rolling window of played cue ids, for eyeballing (`recentCues()`). */
    this._recent = [];
    /**
     * Monotonic per-set play counter. The rolling window is NOT a sound basis
     * for an assertion: once machine-rig started emitting `machine-footfall`
     * for real, a live roster pushed ~100 footfall cues through it and shifted
     * the earliest entries of a gate's own measurement window off the front.
     * These counters never lose an event.
     */
    this._cueCounts = new Map();
    this._contract = {
      'machine-footfall': 0, 'machine-stagger': 0, 'machine-state': 0,
      'machine-scan': 0, 'machine-attack-phase': 0,
    };
    this.settings = this._loadSettings();
    ctx.settings = ctx.settings || {};
    ctx.settings.audio = this.settings;

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

    // --- v3 mix graph. The bus names below are the same ones every existing
    //     procedural voice already writes to, so the whole synth stack keeps
    //     working while the world gains a low-pass, a UI bus and a reverb.
    const buses = buildBuses(ac, { volumes: this.settings, analyser: true });
    this.buses = buses;
    this.master = buses.master;
    this.comp = buses.comp;
    this.ambBus = buses.ambBus;
    this.sfxBus = buses.sfxBus;
    this.uiBus = buses.uiBus;
    this.voiceBus = buses.voiceBus;
    this.musicBus = buses.musicBus;
    this.musicLP = buses.musicLP;
    this.worldLP = buses.worldLP;
    this.analyser = buses.analyser;
    this.pool = new SpatialPool(buses, { size: 28 });
    this.ducker = new Ducker(buses);
    this._applyVolumes();

    // Vector3 scratch for the occlusion queries (ctx.collision wants vectors).
    const V = this.ctx.player?.position?.constructor
      || this.ctx.camera?.position?.constructor;
    if (V) { this._occA = new V(); this._occB = new V(); }

    // The bank loads in the background; every cue falls back to synthesis
    // until its buffer lands, so nothing is ever silent while it downloads.
    this.bankReady = this.bank.load(ac).then((b) => {
      this._startBeds();
      this.zones = new ZoneEmitters(ac, buses, this.bank);
      // audio-01 — the composed score replaces the procedural one the moment
      // its stems are decoded. If any stem is missing the director reports
      // `available: false` and the legacy drone/pluck/percussion layers keep
      // playing, so a failed download degrades instead of going silent.
      const music = new MusicDirector(ac, buses, this.bank);
      if (music.available) {
        this.music = music;
        this._retireProceduralScore();
      } else {
        music.dispose();
      }
      return b;
    }).catch(() => this.bank);

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
      if (this._worldLPFreq < 19000 && this.worldLP) {
        this._worldLPFreq = 20000;
        this.worldLP.frequency.value = 20000;
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

  /**
   * Hand the score over to `MusicDirector` (`audio-01`).
   *
   * The procedural layers are faded rather than disconnected: the drone's
   * oscillators are `start()`ed once at boot and have no stop scheduled, and a
   * hard disconnect mid-ring would click. They stay in the graph at zero gain,
   * which costs three oscillators and nothing else, and `update()` stops
   * driving them (see `_legacyScore`). If the bank ever fails to decode a stem
   * this never runs and the old score simply keeps playing.
   */
  _retireProceduralScore() {
    this._legacyScore = false;
    const now = this.ac.currentTime;
    for (const g of [this.droneGain, this.pluckBus, this.tensionBus]) {
      if (!g) continue;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + 2.5);
    }
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

  /* ========================== v3 — mix + samples ========================= */

  /* ------------------------------ settings ------------------------------ */

  /** Persisted sliders (`audio-14`). shell-menus writes these through setVolume(). */
  _loadSettings() {
    const out = { ...DEFAULT_VOLUMES };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const k of VOLUME_BUSES) {
          if (typeof saved[k] === 'number' && Number.isFinite(saved[k])) {
            out[k] = clamp(saved[k], 0, 1);
          }
        }
        if (typeof saved.muted === 'boolean') out.muted = saved.muted;
      }
    } catch { /* private mode / disabled storage: defaults are fine */ }
    return out;
  }

  _saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
  }

  _applyVolumes() {
    const b = this.buses;
    if (!b) return;
    const s = this.settings;
    b.master.gain.value = s.muted ? 0 : s.master;
    b.musicVol.gain.value = s.music;
    b.sfxVol.gain.value = s.sfx;
    b.ambVol.gain.value = s.ambience;
    b.voiceVol.gain.value = s.voice;
    b.uiVol.gain.value = s.ui;
  }

  /**
   * Published for `shell-menus`. `bus` is one of
   * master|music|sfx|ambience|voice|ui. Persists immediately.
   */
  setVolume(bus, value) {
    if (!VOLUME_BUSES.includes(bus)) return false;
    this.settings[bus] = clamp(+value || 0, 0, 1);
    this._applyVolumes();
    this._saveSettings();
    this.ctx.events.emit('audio-settings-changed', { ...this.settings });
    return true;
  }

  getVolume(bus) { return this.settings[bus]; }

  /** Snapshot of every slider — what a settings screen renders from. */
  volumes() { return { ...this.settings }; }

  setMuted(on) {
    this.settings.muted = !!on;
    this._applyVolumes();
    this._saveSettings();
    this.ctx.events.emit('audio-settings-changed', { ...this.settings });
    return this.settings.muted;
  }

  /* ------------------------- sample playback ---------------------------- */

  /**
   * Play a bank set through the 3D chain.
   *
   * @param {string} setId       e.g. 'voice/thunderjaw/strike'
   * @param {{x:number,y:number,z:number}|null} pos  world position; null = 2D
   * @param {object} [opts] { volume, category, priority, rate, track, duck, reverb }
   * @returns {boolean} false when the bank has no such set (caller synthesizes)
   */
  playAt(setId, pos, opts = {}) {
    if (!this.ac || !this.pool) return false;
    const picked = this.bank.pick(setId);
    if (!picked) { this._sampleCounts.missing++; return false; }
    const now = this.ac.currentTime;
    const priority = opts.priority ?? PRI.hit;
    const chain = this.pool.acquire(priority, now);
    if (!chain) { this._sampleCounts.refused++; return false; }

    const category = opts.category || 'sfx';
    chain.route(category);
    chain.busy = true;
    chain.priority = priority;
    chain.startedAt = now;
    chain.tag = setId;
    chain.tracked = opts.track || null;

    const p = pos || this._listener;
    chain.setPosition(p.x, (p.y ?? 0) + (opts.height ?? 0), p.z);
    const L = this._listener;
    chain.applyDistance(L.x, L.y, L.z, L.fx, L.fy, L.fz);
    if (opts.reverb != null) chain.send.gain.value = opts.reverb;

    // one BufferSource + one gain per playback: sources are single-use, and the
    // gain is what lets the pool fade this exact voice out if it gets stolen
    const vg = this.ac.createGain();
    vg.gain.value = (opts.volume ?? 1) * (picked.row.gain ?? 1);
    vg.connect(chain.input);
    const src = this.ac.createBufferSource();
    src.buffer = picked.buffer;
    if (opts.rate) src.playbackRate.value = opts.rate;
    src.connect(vg);
    src.start(now);
    chain.voiceGain = vg;
    chain.source = src;
    const dur = picked.buffer.duration / (opts.rate || 1);
    chain.endsAt = now + dur;
    src.onended = () => {
      if (chain.source === src) chain.reset();
      try { src.disconnect(); vg.disconnect(); } catch { /* torn down */ }
    };

    if (opts.duck) this.ducker.trigger(opts.duck, opts.duckHold ?? 0.4);
    this._note(setId);
    return true;
  }

  /** Non-positional bank playback (UI, Aloy first-person foley). */
  play2D(setId, opts = {}) {
    if (!this.ac) return false;
    const picked = this.bank.pick(setId);
    if (!picked) { this._sampleCounts.missing++; return false; }
    const bus = opts.category === 'ui' ? this.uiBus
      : opts.category === 'ambience' ? this.ambBus
        : opts.category === 'voice' ? this.voiceBus : this.sfxBus;
    const g = this._voice(picked.buffer.duration + 0.1, (opts.volume ?? 1) * (picked.row.gain ?? 1), opts.pan || 0, bus);
    if (!g) return false;
    const src = this.ac.createBufferSource();
    src.buffer = picked.buffer;
    if (opts.rate) src.playbackRate.value = opts.rate;
    src.connect(g);
    src.start(this.ac.currentTime);
    src.onended = () => { try { src.disconnect(); } catch { /* torn down */ } };
    if (opts.duck) this.ducker.trigger(opts.duck, opts.duckHold ?? 0.4);
    this._note(setId);
    return true;
  }

  /** Record a played cue: a lossless counter plus a rolling window. */
  _note(setId) {
    this._sampleCounts.played++;
    this._cueCounts.set(setId, (this._cueCounts.get(setId) || 0) + 1);
    this._recent.push(setId);
    if (this._recent.length > 256) this._recent.shift();
  }

  /** The last <=256 bank cue ids played, oldest first (debugging only). */
  recentCues() { return this._recent.slice(); }

  /**
   * Total plays per set since boot — the number a gate should diff across an
   * action, because it cannot be lost to a busy mix.
   */
  cueCounts() {
    const out = {};
    for (const [k, v] of this._cueCounts) out[k] = v;
    return out;
  }

  /* --------------------------- ambience beds ---------------------------- */

  /** Build the beds once the bank lands; update() picks which one plays. */
  _startBeds() {
    if (!this.ac || !this.buses) return;
    for (const set of BEDS) {
      if (this.loops[set]) continue;
      const first = this.bank.first(set);
      if (!first) continue;
      const l = new LoopEmitter(this.ac, first.buffer, this.buses.ambBus, { gain: 0, xf: 1.2 });
      l.start();
      this.loops[set] = l;
    }
    this._bedList = Object.values(this.loops);
    this._bed = null;
  }

  /**
   * Which biome bed is under the mix (`audio-11`).
   *
   * Ordered most-specific first, and every branch reads a PUBLISHED query —
   * `camp.firePosition`, `water.depthAt`, `terrain.surfaceAt`,
   * `environment.phase` — rather than a hard-coded coordinate. The Round-3
   * selector guessed the river was "roughly x ≈ 40", which was true of one
   * build's terrain seed and nothing else.
   */
  _pickBed() {
    const p = this.ctx.player;
    if (!p) return 'amb/meadow';
    const x = p.position.x; const z = p.position.z;

    // NOTE: there is deliberately no campfire bed. A fire is a source you can
    // walk around, not a place you are inside — `_zoneScan()` puts it in the
    // world at `camp.firePosition` instead (`audio-11`).

    // open water within ~18 m: close enough that you are inside the sound
    // field rather than hearing it from over there (which is the zone emitter)
    if (this._waterNear(x, z, 18)) return 'amb/river';

    const s = this._surfaceKey;
    if (s === 'water' || s === 'silt' || s === 'cobble') return 'amb/river';
    // bare rock above the meadow: wind with an edge and nothing living in it
    if (s === 'rock' || s === 'gravel' || s === 'snow') return 'amb/ridge';

    // sheltered, tree-scattered low ground. `grassDensityAt` is the only local
    // vegetation query world-ground publishes; the tree belts in this valley
    // sit in the dense-scatter band, so it is a proxy — see the report's ASK
    // for `vegetation.treeDensityAt(x, z)`.
    const dens = this.ctx.vegetation?.grassDensityAt?.(x, z);
    if (typeof dens === 'number' && dens > 1.5) return 'amb/forest';

    const phase = this.ctx.environment?.phase;
    if (phase === 'night') return 'amb/night';
    return 'amb/meadow';
  }

  /**
   * Is there open water within `r` metres? Eight probes on a ring plus the
   * centre — cheap enough for the 0.5 s bed poll, and honest about the river
   * wherever world-ground decides to put it.
   */
  _waterNear(x, z, r) {
    const w = this.ctx.environment?.water;
    if (!w || typeof w.depthAt !== 'function') return false;
    if (w.depthAt(x, z) > 0.02) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (w.depthAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > 0.02) return true;
    }
    return false;
  }


  /* ========================= the adaptive score ========================= */

  /**
   * Choose the music state (`audio-01`).
   *
   * Two inputs, deliberately: a **poll** of the machine roster's FSM states,
   * and **event stamps** written by the combat/alert handlers. The poll alone
   * lags — `machine-attack-phase` fires on the windup frame and the state flip
   * can be a tick later, which would put the combat stinger behind the first
   * strike. The events alone flicker — a single alarm would drop the score
   * back to calm the moment its handler stopped writing. Together: events set
   * the floor, the poll extends it, and a hold window (`*Until`) stops the mix
   * chattering between states on the boundary.
   *
   * The director does the quantising; this only ever names a state.
   */
  _musicSelect(nowMs) {
    const m = this.music;
    if (!m || !m.available) return;
    const ctx = this.ctx;
    const p = ctx.player;
    const list = ctx.machines?.list;
    let hostile = false;
    let wary = false;
    if (list && p) {
      const px = p.position.x; const pz = p.position.z;
      for (let i = 0; i < list.length; i++) {
        const mm = list[i];
        if (!mm.alive) continue;
        const dx = mm.position.x - px; const dz = mm.position.z - pz;
        if (dx * dx + dz * dz > 14400) continue;         // 120 m
        const st = String(mm.state || '');
        if (st === 'attack' || st === 'combat' || st === 'engage'
          || st === 'alert' || st === 'alarm' || st === 'charge') hostile = true;
        else if (st === 'suspicious' || st === 'search' || st === 'investigate'
          || st === 'alerted' || st === 'wary') wary = true;
      }
    }
    if (hostile) this._combatUntil = Math.max(this._combatUntil, nowMs + 5000);
    if (wary) this._suspectUntil = Math.max(this._suspectUntil, nowMs + 4000);

    const prev = this._musicState;
    let want = 'calm';
    if (nowMs < this._combatUntil) want = 'combat';
    else if (nowMs < this._resolveUntil) want = 'resolve';
    else if (nowMs < this._suspectUntil) want = 'suspicious';

    if (want === prev) return;
    // leaving a fight is a moment; give it a phrase of its own before calm
    if (prev === 'combat' && want !== 'combat') {
      this._resolveUntil = nowMs + 12000;
      want = 'resolve';
      m.sting('resolve', { volume: 0.9, minGap: 10 });
    } else if (want === 'combat') {
      m.sting('combat', { volume: 1, minGap: 8 });
    } else if (want === 'suspicious' && prev === 'calm') {
      m.sting('alert', { volume: 0.75, minGap: 12 });
    }
    this._musicState = want;
    m.setState(want);
  }

  /**
   * Published so `shell-menus`, quests, the studio and the gates can name a
   * state directly.
   *
   * It must CLEAR the holds it outranks, not just set its own. The first cut
   * only set them, so asking for `resolve` while the 5 s combat hold was still
   * running made the selector flip straight back to combat on its next tick and
   * then out again — three transitions scheduled on one downbeat for what the
   * caller asked to be one.
   */
  setMusicState(name, opts) {
    if (!this.music || !this.music.available) return false;
    this._musicState = name;
    const nowMs = performance.now();
    this._combatUntil = -1e9; this._suspectUntil = -1e9; this._resolveUntil = -1e9;
    if (name === 'combat') this._combatUntil = nowMs + 5000;
    else if (name === 'suspicious') this._suspectUntil = nowMs + 4000;
    else if (name === 'resolve') this._resolveUntil = nowMs + 12000;
    return this.music.setState(name, opts);
  }

  /** Published: fire a score stinger by name ('combat'|'resolve'|'alert'|'discover'). */
  sting(name, opts) { return this.music ? this.music.sting(name, opts) : false; }

  /* ====================== positional world emitters ==================== */

  /** Stable small integer per machine, for zone-emitter ids. */
  _idOf(machine) {
    let id = this._mids.get(machine);
    if (id === undefined) { id = ++this._midN; this._mids.set(machine, id); }
    return id;
  }

  /**
   * Zone ambience that lives in the world rather than on the bus (`audio-11`):
   * the campfire you can circle, and open water heard from the bank.
   *
   * The water emitter deliberately does NOT run while the river bed is up.
   * Inside ~18 m you are in the sound field (that is the bed); past it the
   * river is a thing over there, which is a source. Running both would double
   * the same recording at two pan positions and read as a phasey smear.
   */
  _zoneScan(playing) {
    const z = this.zones;
    if (!z) return;
    if (!playing) { z.retireAll(0.5); return; }
    const p = this.ctx.player;
    if (!p) return;
    const px = p.position.x; const pz = p.position.z;

    // --- fire
    const fire = this.ctx.camp?.firePosition;
    if (fire && Math.hypot(px - fire.x, pz - fire.z) < 80) {
      z.ensure('fire:camp', 'amb/campfire', fire.x, fire.y + 0.35, fire.z,
        { volume: 0.62, reverb: 0.2 });
    } else z.retire('fire:camp', 0.8);

    // --- water, mid distance only
    const w = this.ctx.environment?.water;
    if (w && typeof w.depthAt === 'function' && this._bed !== 'amb/river') {
      let best = null; let bestD = 1e9;
      // coarse polar sweep: 3 radii x 12 bearings, 0.6 s apart. Cheaper than a
      // grid and it finds a ribbon river from any angle.
      for (let ri = 0; ri < 3; ri++) {
        const r = 20 + ri * 22;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const x = px + Math.cos(a) * r; const zz = pz + Math.sin(a) * r;
          if (w.depthAt(x, zz) <= 0.02) continue;
          if (r < bestD) { bestD = r; best = [x, zz]; }
        }
        if (best) break;
      }
      if (best) {
        const y = (this.ctx.terrain?.getHeight?.(best[0], best[1]) ?? p.position.y) + 0.2;
        z.ensure('water:river', 'amb/river', best[0], y, best[1], { volume: 0.5, reverb: 0.18 });
      } else z.retire('water:river', 1.0);
    } else z.retire('water:river', 1.0);
  }

  /**
   * Elemental status loops (`audio-10`).
   *
   * Polled, not evented: the machine lane owns `burnT` / `stunT` / `brittleT`
   * as continuous timers and publishes no start/stop pair for them, so a
   * listener would have to guess when a status ended. A 4 Hz sweep of the
   * machines in earshot is exact, costs one pass over ~24 objects, and is the
   * only place the status can actually be observed to STOP.
   */
  _statusScan(playing) {
    const z = this.zones;
    if (!z) return;
    const want = this._wantSet;
    want.clear();
    const p = this.ctx.player;
    const list = this.ctx.machines?.list;
    if (playing && p && list) {
      const px = p.position.x; const pz = p.position.z;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m.alive) continue;
        const dx = m.position.x - px; const dz = m.position.z - pz;
        if (dx * dx + dz * dz > 4900) continue;          // 70 m
        const id = this._idOf(m);
        const y = m.position.y + (m.height ?? 2) * 0.45;
        if (m.burnT > 0.05) {
          const k = `burn:${id}`; want.add(k);
          z.ensure(k, 'status/burn', m.position.x, y, m.position.z, { volume: 0.55 });
        }
        if (m.stunT > 0.05) {
          const k = `shock:${id}`; want.add(k);
          z.ensure(k, 'status/shock', m.position.x, y, m.position.z, { volume: 0.5 });
        }
        if (m.brittleT > 0.05) {
          const k = `frost:${id}`; want.add(k);
          z.ensure(k, 'status/frost', m.position.x, y, m.position.z, { volume: 0.42 });
        }
      }
    }
    // anything that was burning and is not any more — including machines that
    // died, were disposed, or walked out of earshot
    for (const id of z.ids()) {
      if (id.startsWith('burn:') || id.startsWith('shock:') || id.startsWith('frost:')) {
        if (!want.has(id)) z.retire(id, 0.45);
      }
    }
  }

  /**
   * The wreck beacon (`audio-06`): a dead machine's last cell still ticking, so
   * a kill you made across the valley is findable by ear. Dies when the wreck
   * is looted, when it despawns, or after 100 s — a beacon that outlives its
   * loot is a lie.
   */
  _beaconScan(playing) {
    const z = this.zones;
    if (!z) return;
    const p = this.ctx.player;
    const nowMs = performance.now();
    for (const [m, startedMs] of this._wreckBeacons) {
      const gone = !m.position || m._disposed || m._looted === true
        || nowMs - startedMs > 100000;
      const id = `loot:${this._idOf(m)}`;
      const d = (playing && p && !gone)
        ? Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) : 1e9;
      if (gone) { z.retire(id, 0.6); this._wreckBeacons.delete(m); continue; }
      if (nowMs - startedMs < 1400) continue;            // let the collapse finish
      if (d < 55) {
        z.ensure(id, 'machine/loot-beacon', m.position.x,
          m.position.y + 0.5, m.position.z, { volume: 0.3 });
      } else z.retire(id, 0.6);
    }
  }

  /**
   * A machine call arriving from somewhere you cannot see (`audio-11`). Only
   * while the score is calm — during a fight it would read as a second machine
   * joining, which is a lie the player would act on.
   */
  _distantCall(rdt, playing) {
    this._callT -= rdt;
    if (this._callT > 0) return;
    this._callT = 26 + Math.random() * 34;
    if (!playing || this._musicState !== 'calm') return;
    const p = this.ctx.player;
    const list = this.ctx.machines?.list;
    if (!p || !list) return;
    let far = null;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m.alive) continue;
      const dx = m.position.x - p.position.x; const dz = m.position.z - p.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 4900 && d2 < 90000) { far = m; break; }   // 70..300 m
    }
    if (!far) return;
    // pull the source to a fixed 95 m on the machine's bearing: the cue is
    // rendered with its own distance baked in, so playing it at 72 m would
    // stack two attenuations and read as a machine right behind you
    const a = Math.atan2(far.position.z - p.position.z, far.position.x - p.position.x);
    this.playAt('amb/call-far', {
      x: p.position.x + Math.cos(a) * 95,
      y: p.position.y + 6,
      z: p.position.z + Math.sin(a) * 95,
    }, { category: 'ambience', volume: 1, priority: PRI.ambience, reverb: 0.9 });
  }

  /* ============================ Aloy foley ============================= */

  /**
   * Effort and breath (`audio-03`). D2 stands: no VO, ever — this is a throat
   * and a diaphragm, not a line. `_exertion` is a slow running average of how
   * hard she is working, so the breath layer arrives after a sprint instead of
   * on its first frame, and recovers over several seconds rather than cutting.
   */
  _effort(hard = false, volume = 1) {
    const set = hard ? 'aloy/effort-hard' : 'aloy/effort';
    if (!this.play2D(set, { volume: 0.5 * volume, category: 'voice', rate: 0.96 + Math.random() * 0.1 })) {
      this.play2D('aloy/effort', { volume: 0.45 * volume, category: 'voice' });
    }
    this._exertion = Math.min(1, this._exertion + (hard ? 0.28 : 0.16));
  }

  /**
   * Nock / re-nock / draw, polled off `combat`'s public state (`audio-13`).
   *
   * The audit asked for a nock and a re-nock per bow, and the listeners for
   * `arrow-nocked` / `arrow-draw` are published in the contract — but `combat`
   * emits neither, so those cues were wired to nothing and the bow made no
   * sound at all until the string was released. Rather than leave a blocker
   * waiting on another lane, this reads the two fields `combat` already
   * publishes for the animator:
   *
   *   `nockLanded`   false while the arrow is travelling from quiver to
   *                  string, true when it arrives. It is reset on every loose,
   *                  so its RISING EDGE is exactly the re-nock — the sound the
   *                  0.42 s nock delay exists to make audible.
   *   `drawStrength` 0 until the string starts moving; its first frame above
   *                  the deadzone is the draw creak.
   *
   * Same idiom as `_statusScan`: the other lane owns a continuous value, we
   * watch its edges. Two booleans and no allocation per frame.
   *
   * A dry-fire click still needs `weapon-empty` from `combat` — "tried to
   * shoot with an empty quiver" has no observable edge, because the draw
   * simply never starts.
   */
  _nockPoll(playing) {
    const cb = this.ctx.combat;
    if (!playing || !cb) { this._nockPrev = false; this._drawPrev = false; return; }
    const id = String(cb.activeWeapon?.id || '');
    if (!NOCKING.test(id)) { this._nockPrev = false; this._drawPrev = false; return; }
    const bow = bowSetFor(id);
    // swapping bows mid-aim puts a new arrow on a new string: re-arm both
    // edges so the swap is heard, rather than being swallowed because
    // `nockLanded` happened to already be true on the weapon we left.
    if (bow !== this._nockBow) { this._nockBow = bow; this._nockPrev = false; this._drawPrev = false; }

    const nocked = !!cb.nockLanded;
    if (nocked && !this._nockPrev) this.play2D(`bow/${bow}/nock`, { volume: 0.42 });
    this._nockPrev = nocked;

    const drawing = (cb.drawStrength ?? 0) > 0.02;
    if (drawing && !this._drawPrev) this.play2D(`bow/${bow}/draw`, { volume: 0.36 });
    this._drawPrev = drawing;
  }

  /** Breath layer driven by `_exertion`; called from update() on a real-time clock. */
  _breathLayer(rdt, playing) {
    const p = this.ctx.player;
    if (!p || !playing) { this._exertion *= Math.max(0, 1 - rdt * 0.5); return; }
    const sp = p.moveSpeed || 0;
    // sprinting costs, standing still repays — the 8.2 m/s ceiling is the same
    // number the footstep cadence uses
    const load = clamp((sp - 3.4) / 4.8, 0, 1) * (p.crouching ? 0.4 : 1);
    this._exertion = clamp(this._exertion + (load - 0.42) * rdt * 0.34, 0, 1);
    this._breathT -= rdt;
    if (this._breathT > 0) return;
    if (this._exertion > 0.62) {
      this._breathT = 2.1 + Math.random() * 0.9;
      this.play2D('aloy/breath-hard', { volume: 0.34 + this._exertion * 0.2, category: 'voice' });
    } else if (this._exertion > 0.3) {
      this._breathT = 3.4 + Math.random() * 1.6;
      this.play2D('aloy/breath-out', { volume: 0.22, category: 'voice' });
    } else {
      this._breathT = 2.5;
    }
  }

  /* -------------------------- surface + species ------------------------- */

  /** Footstep set for where the player is standing (`audio-04`). */
  _footSet() {
    const p = this.ctx.player;
    const t = this.ctx.terrain;
    if (p && t && typeof t.surfaceAt === 'function') {
      try {
        const s = t.surfaceAt(p.position.x, p.position.z);
        if (s) { this._surface = String(s); this._surfaceKey = this._surface; }
      } catch { /* terrain not ready */ }
    }
    return SURFACE_SET[this._surface] || 'foot/grass';
  }

  _speciesSet(machine, phase) {
    const kind = String(machine?.kind || '').toLowerCase();
    const k = SPECIES.includes(kind) ? kind : 'watcher';
    return `voice/${k}/${phase}`;
  }

  _weightOf(machine) { return WEIGHT[String(machine?.kind || '')] || 'medium'; }

  /**
   * Play a species voice at a machine. Heavy machines get priority, a longer
   * reverb send and a duck; a Watcher warble must never shove a Thunderjaw
   * roar out of the pool.
   * @returns {boolean} false when the bank has no such cue
   */
  _machineVoice(machine, phase, opts = {}) {
    const pos = opts.position || machine?.position;
    if (!pos) return false;
    const heavy = this._weightOf(machine) === 'heavy';
    return this.playAt(this._speciesSet(machine, phase), pos, {
      category: 'voice',
      volume: (opts.volume ?? 1) * (heavy ? 1 : 0.85),
      priority: opts.priority ?? (heavy ? PRI.big : PRI.voice),
      rate: opts.rate ?? (0.97 + Math.random() * 0.06),
      height: machine?.eyeHeight ?? 1.2,
      track: machine,
      duck: opts.duck ?? (heavy ? 0.4 : 0.18),
      duckHold: opts.duckHold ?? 0.45,
    });
  }

  /**
   * The suspicion voice (`audio-08`). `lost` plays the falling version — the
   * machine giving up on whatever it heard — which is the cue a player needs
   * to know the crouch-walk worked.
   *
   * Throttled per machine, because a search state can re-enter several times a
   * second while the FSM settles on a lead.
   */
  _warble(machine, lost = false) {
    if (!machine?.position) return false;
    const nowMs = performance.now();
    if (nowMs - (this._warbleCd.get(machine) ?? -1e9) < 1600) return false;
    this._warbleCd.set(machine, nowMs);
    const set = lost ? 'machine/unwarble' : 'machine/warble';
    const played = this.playAt(set, machine.position, {
      category: 'voice',
      volume: lost ? 0.6 : 0.8,
      priority: PRI.voice,
      rate: this._weightOf(machine) === 'heavy' ? 0.82
        : this._weightOf(machine) === 'light' ? 1.14 : 1,
      height: machine.eyeHeight ?? 1.2,
      track: machine,
    });
    // no dedicated cue in the bank: the species windup is the nearest thing
    if (!played) this._machineVoice(machine, 'windup', { volume: 0.5, rate: lost ? 0.9 : 1.05 });
    return true;
  }

  /**
   * One servo idle loop per living machine within earshot (`audio-02`: the
   * spatialized idle bed that tells you a Sawtooth is behind the ridge).
   * Loops are created lazily and torn down on death or when the machine leaves
   * the radius, so a 24-machine roster costs at most a handful of voices.
   */
  _syncServoLoop(machine) {
    if (!machine || !this.buses) return;
    const have = this._machineLoops.get(machine);
    const alive = !!machine.alive;
    const p = this.ctx.player;
    const d = p ? Math.hypot(machine.position.x - p.position.x, machine.position.z - p.position.z) : 1e9;
    const want = alive && d < 55;
    if (want && !have) {
      // audio-02 — the species owns its idle bed. One shared servo hum told
      // you a machine was near; eight tell you WHICH, which is the information
      // a stealth approach is actually played on. `machine/servo-loop` stays
      // as the fallback for a kind the bank has no bed for.
      const kind = String(machine.kind || '').toLowerCase();
      const first = (SPECIES.includes(kind) && this.bank.first(`idle/${kind}`))
        || this.bank.first('machine/servo-loop');
      if (!first) return;
      const chain = this._loopChain();
      if (!chain) return;
      chain.route('ambience');
      chain.busy = true;
      chain.priority = PRI.ambience;
      chain.startedAt = this.ac.currentTime;
      chain.endsAt = Infinity;
      chain.tag = 'servo';
      chain.tracked = machine;
      chain.setPosition(machine.position.x, machine.position.y + 1, machine.position.z);
      chain.voiceGain = null;
      chain.source = null;
      // the composed beds are already pitched per species, so the old
      // rate hack (0.7 / 1.15) would now detune them off their own identity
      const speciesBed = first.row.set.startsWith('idle/');
      const loop = new LoopEmitter(this.ac, first.buffer, chain.input, {
        gain: 0, xf: 0.8, rate: speciesBed ? 1 : (this._weightOf(machine) === 'heavy' ? 0.7 : 1.15),
      });
      loop.start();
      loop.volume = (this._weightOf(machine) === 'heavy' ? 0.5 : 0.32) * (first.row.gain ?? 1);
      chain.loop = loop;
      this._machineLoops.set(machine, { loop, chain });
      this._rebuildLoopList();
    } else if (!want && have) {
      this._retireLoop(machine, have, 0.5);
    }
  }

  /**
   * Re-cache the servo-loop entries as a plain array.
   *
   * `_updateSpatial` used to iterate `this._machineLoops.values()` directly,
   * two lines under a comment insisting that a Map iterator here would be a
   * per-frame allocation. It was: the guard on `.size` only skipped the
   * allocation while nothing was humming, so the cost appeared exactly when
   * machines were in earshot — i.e. during a fight. The Map stays as the
   * identity index (`get`/`delete` by machine); the array is what the frame
   * walks. Rebuilt only on insert/retire, which the 0.6 s roster sync bounds
   * to a few times a second over at most 8 entries.
   */
  _rebuildLoopList() {
    const list = this._loopList;
    list.length = 0;
    for (const e of this._machineLoops.values()) list.push(e);
  }

  /**
   * The ONE way a servo loop stops. Every caller used to hand-roll its own
   * teardown and each got it subtly wrong: `machine-killed` armed `endsAt` but
   * left `busy` set (nothing swept `_loopChains`, so the chain was orphaned
   * forever — 8 kills in earshot and no machine ever hummed again); the
   * out-of-radius branch cleared `busy` *immediately*, handing a still-fading
   * emitter's chain to the next machine; the pause branch did neither.
   *
   * Retiring means: fade the emitter, keep the chain reserved for exactly that
   * fade, and let `_reclaimLoopChains()` return it once the tail is silent.
   */
  _retireLoop(machine, entry, fade = 0.5) {
    if (!entry) return;
    entry.loop.stop(fade);
    // hold the chain for the length of the tail, then the sweep takes it back
    entry.chain.endsAt = this.ac.currentTime + fade + 0.1;
    entry.chain.tracked = null;   // a dead machine may be recycled by the pool
    this._machineLoops.delete(machine);
    this._rebuildLoopList();
  }

  /**
   * Reclaim sweep for `_loopChains` — the counterpart of the one the one-shot
   * pool runs in `SpatialPool.take()`. Without it `_retireLoop`'s `endsAt` is
   * written and never read, and the 8-chain pool is one-way.
   * Fixed-size, no allocation: safe to call every frame.
   */
  _reclaimLoopChains() {
    const chains = this._loopChains;
    if (!chains) return;
    const now = this.ac.currentTime;
    for (let i = 0; i < chains.length; i++) {
      const c = chains[i];
      if (!c.busy || c.endsAt > now) continue;
      if (c.loop) { c.loop.dispose(); c.loop = null; }
      c.reset();
    }
  }

  /**
   * Dedicated chains for looping emitters. Loops are long-lived and quiet, so
   * they must NOT compete in the one-shot pool: at PRI.ambience a single
   * footstep would steal a Sawtooth's idle bed and it would never come back.
   * Capped at 8 — the 55 m radius rarely holds more.
   */
  _loopChain() {
    if (!this._loopChains) this._loopChains = [];
    this._reclaimLoopChains();
    for (const c of this._loopChains) if (!c.busy) return c;
    if (this._loopChains.length >= 8) return null;
    const c = new SpatialChain(this.buses, { panningModel: 'equalpower' });
    c.loop = null;
    this._loopChains.push(c);
    return c;
  }

  /* --------------------------- gate-facing API -------------------------- */

  /** Bank + licence summary. A73 reads this. */
  bankAudit() {
    return {
      ...this.bank.audit(),
      contextState: this.ac?.state || 'uninitialized',
      samples: { ...this._sampleCounts },
    };
  }

  /**
   * Render `points` (world positions relative to a listener at the origin
   * facing −Z) through the real bus + spatial graph offline and report the
   * energy each ear receives. A74 reads this.
   */
  probe3D(points, opts) { return probeSpatial(points, opts); }

  /** Offline render of one bank set — level + spectrum. A73/A75 read this. */
  async probeSet(setId, opts) {
    await this.bankReady;
    const first = this.bank.first(setId);
    if (!first) return null;
    return probeBuffer(first.buffer, opts);
  }

  /** Cosine distance between two band vectors (0 identical). */
  static bandDistance(a, b) { return bandDistance(a, b); }

  /**
   * Onset envelope of a bank set measured against the score's beat grid.
   * A77 uses it to prove the stems are composed rather than crossfaded noise.
   */
  async probeBeats(setId, beat = BEAT) {
    await this.bankReady;
    const first = this.bank.first(setId);
    if (!first) return null;
    return beatGrid(first.buffer, beat);
  }

  /** Live master level, for a gate that wants to know the mix is moving. */
  level() {
    if (!this.analyser) return null;
    const n = this.analyser.fftSize;
    if (!this._levelBuf || this._levelBuf.length !== n) this._levelBuf = new Float32Array(n);
    this.analyser.getFloatTimeDomainData(this._levelBuf);
    let peak = 0; let sum = 0;
    for (let i = 0; i < n; i++) { const v = this._levelBuf[i]; const m = v < 0 ? -v : v; if (m > peak) peak = m; sum += v * v; }
    return { peak: +peak.toFixed(5), rms: +Math.sqrt(sum / n).toFixed(6) };
  }

  /** Which contract events have actually been received (Wave 3 handshake). */
  contractCounts() { return { ...this._contract }; }

  /* ------------------------------ one-shots ------------------------------ */

  _footstep(speedN, crouched, inGrass) {
    const vol = crouched ? 0.045 : 0.09 + speedN * 0.1;
    // audio-04 — per-surface sets from terrain.surfaceAt(); the synthesized
    // step below stays as the fallback until the bank has decoded.
    const set = this._footSet();
    if (this.bank.has(set)) {
      this._counts.steps++;
      const played = this.play2D(set, {
        volume: (crouched ? 0.24 : 0.42 + speedN * 0.42),
        rate: 0.93 + Math.random() * 0.14,
      });
      // gear foley on the harder strides
      if (played && !crouched && speedN > 0.45 && Math.random() < 0.55) {
        this.play2D(speedN > 0.8 ? 'gear/heavy' : 'gear/light',
          { volume: 0.2 + speedN * 0.2, rate: 0.95 + Math.random() * 0.1 });
      }
      if (played) return;
    }
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
    const g = this._voice(0.7, 1, 0, this.uiBus);
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
    const g = this._voice(0.3, 1, 0, this.uiBus);
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
    // sampled breath first (D2 — breath and effort are the whole of Aloy's
    // voice), synthesized noise sweep as the fallback
    if (this.play2D(inhale ? 'aloy/breath-in' : 'aloy/breath-out',
      { volume: inhale ? 0.7 : 0.55, category: 'voice' })) {
      this._counts.breaths++;
      return;
    }
    const g = this._voice(0.6, 1, 0, this.voiceBus);
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
    const g = this._voice(0.4, 1, 0, this.uiBus);
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

  /**
   * The UI voice: one filtered sine blip, optionally sweeping to `f1`. Short,
   * dry and on `uiBus`, so it never fights the world mix.
   */
  _uiBlip(f0, vol = 0.04, dur = 0.09, f1 = null) {
    const g = this._voice(dur + 0.15, 1, 0, this.uiBus);
    if (!g) return;
    this._counts.switches++;
    const t0 = this._now();
    const bp = this._bp(f0, 3.5);
    const eg = this.ac.createGain();
    bp.connect(eg).connect(g);
    this._env(eg.gain, t0, vol, 0.004, dur);
    const o = this._osc('sine', f0, t0, dur + 0.05, bp);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const hp = this._hp(4200);
    const eg2 = this.ac.createGain();
    hp.connect(eg2).connect(g);
    this._env(eg2.gain, t0, vol * 0.35, 0.002, 0.03);
    this._noise(t0, 0.05, hp);
  }

  _objectiveBlip() {
    const g = this._voice(0.4, 1, 0, this.uiBus);
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

    ev.on('arrow-fired', armed(({ type, drawStrength, weapon } = {}) => {
      const id = String(type || '');
      if (/disc/i.test(id)) this._discThump(true);                       // disc launcher: heavy
      else if (/blast|bomb|sling/i.test(id) && !/tear/i.test(id)) this._discThump(false); // blast sling lob
      else {
        // audio-13 — one full set per bow. The synthesized twang stays as the
        // fallback so a failed download never silences the weapon.
        const bow = bowSetFor(weapon || this.ctx.combat?.weapon?.id || type);
        const s = clamp(drawStrength ?? 0.6, 0.15, 1);
        if (!this.play2D(`bow/${bow}/release`, { volume: 0.45 + s * 0.5, rate: 0.96 + s * 0.1 })) {
          this._bowRelease(s);
        } else {
          this._pendingFlyby = { bow, at: performance.now() + 90 };
        }
      }
    }));

    // Per-weapon nock / re-nock / dry-fire (audio-13). combat may not emit
    // these yet; the listeners are the contract, harmless until it does.
    ev.on('arrow-nocked', armed(({ weapon } = {}) => {
      this.play2D(`bow/${bowSetFor(weapon)}/nock`, { volume: 0.5 });
    }));
    ev.on('arrow-draw', armed(({ weapon } = {}) => {
      this.play2D(`bow/${bowSetFor(weapon)}/draw`, { volume: 0.4 });
    }));
    ev.on('weapon-empty', armed(({ weapon } = {}) => {
      this.play2D(`bow/${bowSetFor(weapon)}/empty`, { volume: 0.55 });
    }));

    ev.on('arrow-hit', armed(({ point, machine, weak, type, damage } = {}) => {
      at(point, 0.8);
      const id = String(type || '');
      const att = Math.max(this._att, 0.35);
      // audio-10 — a four-rung ladder instead of one clank. The rung is chosen
      // from the same numbers the damage numbers use, so what you hear and what
      // you read agree.
      const rung = machine
        ? (weak ? 'hit/crit' : (damage ?? 0) >= 25 ? 'hit/crunch' : (damage ?? 0) >= 8 ? 'hit/thunk' : 'hit/plink')
        : point ? ((damage ?? 0) >= 15 ? 'hit/flesh-hard' : 'hit/flesh-soft') : null;
      const ladder = rung && this.playAt(rung, point, {
        volume: weak ? 1 : 0.85,
        priority: weak ? PRI.big : PRI.hit,
        rate: 0.95 + Math.random() * 0.1,
        duck: weak ? 0.35 : 0,
      });
      if (machine) {
        if (!ladder) this._clank(this._pan, att, !!weak);
        if (/shock|spark/i.test(id)) this._zap(this._pan, att);
        else if (/fire|blaze/i.test(id)) this._ignite(this._pan, att);
        else if (/freeze|chill/i.test(id)) this._frostHiss(this._pan, att);
        else if (/blast|disc|bomb/i.test(id)) this._explosion(this._pan, att, 0.8);
      } else {
        if (/blast|disc|bomb/i.test(id)) this._explosion(this._pan, this._att, 0.75);
        else if (!ladder) this._thud(this._pan, this._att);
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
      this.playAt('machine/alarm', machine?.position, {
        volume: 0.85, priority: PRI.voice, duck: 0.3, height: 1.2,
      });
      this._sting(this._pan, Math.max(this._att, 0.5));
      this._lastTenseT = this._t;
      this._combatUntil = Math.max(this._combatUntil, performance.now() + 5000);
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
        // audio-02 — the species owns the voice now. Eight banks, not two.
        this._combatUntil = Math.max(this._combatUntil, nowMs + 5000);
        const voiced = this._machineVoice(machine, 'strike');
        if (!voiced) {
          if (stompy || (big && !kind)) this._boom(this._pan, Math.max(this._att, 0.4));
          else this._roar(this._pan, Math.max(this._att, 0.4), big);
        } else if (stompy) {
          this._boom(this._pan, Math.max(this._att, 0.4) * 0.6);
        }
      }
      this._lastTenseT = this._t;
    }));

    /* ------------------- Round 4 event contract (Wave 3) -----------------
     * These five are published by machine-rig / machine-ai. Every listener is
     * live now and no-ops harmlessly until the emitter lands, so the content
     * half is a data change and not a code change. Counts are reported by
     * `contractCounts()` so a gate can prove the handshake.
     * ------------------------------------------------------------------- */

    // machine-rig: GaitController._footfall — { machine, foot, position, speed }
    ev.on('machine-footfall', armed((e = {}) => {
      this._contract['machine-footfall']++;
      const m = e.machine;
      const pos = e.position || m?.position;
      if (!pos) return;
      // per-machine throttle: a sprinting Scrapper must not out-shout a fight
      const nowMs = performance.now();
      const last = this._footfallCd.get(m) ?? -1e9;
      if (nowMs - last < 90) return;
      this._footfallCd.set(m, nowMs);
      const cls = this._weightOf(m);
      if (!this.playAt(`mstep/${cls}`, pos, {
        volume: cls === 'heavy' ? 1 : 0.75,
        priority: PRI.machineStep,
        rate: 0.94 + Math.random() * 0.12,
        duck: cls === 'heavy' ? 0.18 : 0,
      })) {
        at(pos);
        this._machineStep(this._pan, this._att, cls === 'heavy');
      }
    }));

    // machine-ai: a hit or a tear knocked the machine off its feet
    ev.on('machine-stagger', armed((e = {}) => {
      this._contract['machine-stagger']++;
      const nowMs = performance.now();
      if (nowMs - this._staggerMs < 140) return;
      this._staggerMs = nowMs;
      const pos = e.point || e.machine?.position;
      this.playAt('machine/stagger', pos, {
        volume: 0.95, priority: PRI.voice, duck: 0.4, duckHold: 0.5,
      });
      this._machineVoice(e.machine, 'strike', { volume: 0.5, rate: 0.82 });
    }));

    // machine-ai: FSM transition — { machine, from, to }
    ev.on('machine-state', armed((e = {}) => {
      this._contract['machine-state']++;
      const m = e.machine;
      const to = String(e.to || e.state || '');
      const pos = m?.position;
      const nowMs = performance.now();
      if (to === 'suspicious' || to === 'search' || to === 'investigate'
        || to === 'alerted' || to === 'wary') {
        // audio-08 — its own voice, not the attack windup at +5 % pitch. A
        // player who cannot tell "it heard something" from "it is committing"
        // cannot play stealth.
        this._warble(m, false);
        this._suspectUntil = Math.max(this._suspectUntil, nowMs + 4000);
      } else if (to === 'alert' || to === 'alarm') {
        this.playAt('machine/alarm', pos, { volume: 0.9, priority: PRI.voice, duck: 0.3 });
        this._lastTenseT = this._t;
        this._combatUntil = Math.max(this._combatUntil, nowMs + 5000);
      } else if (to === 'attack' || to === 'combat' || to === 'engage') {
        this._machineVoice(m, 'windup', { volume: 0.9, duck: 0.3 });
        this._lastTenseT = this._t;
        this._combatUntil = Math.max(this._combatUntil, nowMs + 5000);
      } else if ((to === 'idle' || to === 'patrol' || to === 'calm')
        && (e.prev === 'suspicious' || e.prev === 'search' || e.from === 'suspicious')) {
        // contact lost: the same voice falling instead of rising
        this._warble(m, true);
      }
      // idle servo loop follows aliveness, not state
      this._syncServoLoop(m);
    }));

    // machine-ai: the scan cone swept the world — { machine, position, hit }
    ev.on('machine-scan', armed((e = {}) => {
      this._contract['machine-scan']++;
      const m = e.machine;
      const nowMs = performance.now();
      if (nowMs - (this._scanCd.get(m) ?? -1e9) < 700) return;
      this._scanCd.set(m, nowMs);
      const pos = e.position || m?.position;
      if (!this.playAt('machine/scan-ping', pos, {
        volume: 0.7, priority: PRI.machineStep, rate: e.hit ? 1.12 : 1,
      })) {
        at(pos);
        this._radarChirp(0.06, this._pan);
      }
    }));

    // machine-ai: multi-part attacks — { machine, attack, phase, index }
    // phase: 'windup' | 'strike' | 'recover'
    ev.on('machine-attack-phase', armed((e = {}) => {
      this._contract['machine-attack-phase']++;
      const phase = String(e.phase || '');
      if (phase === 'windup' || phase === 'strike') {
        this._combatUntil = Math.max(this._combatUntil, performance.now() + 5000);
      }
      if (phase === 'windup') {
        this._machineVoice(e.machine, 'windup', { volume: 0.85, duck: 0.22 });
      } else if (phase === 'strike') {
        // per-projectile: index > 0 means a volley, so drop the roar and let
        // the launcher thump carry it (audio-15)
        if ((e.index | 0) > 0) this._discThump(this._weightOf(e.machine) === 'heavy');
        else this._machineVoice(e.machine, 'strike', { volume: 1, duck: 0.36 });
      }
      this._lastTenseT = this._t;
    }));

    ev.on('machine-killed', armed(({ machine } = {}) => {
      at(machine?.position ?? null);
      const size = machine?.kind === 'thunderjaw' ? 1.5
        : machine?.kind === 'behemoth' ? 1.3
          : machine?.kind === 'sawtooth' ? 1.15 : 1;
      this._explosion(this._pan, Math.max(this._att, 0.5), size);
      // audio-06 — death is not one explosion: the reactor spins down after it
      this.playAt('machine/powerdown', machine?.position, {
        volume: 0.9, priority: PRI.death, height: 1.0,
        rate: size > 1.2 ? 0.78 : 1, duck: 0.35, duckHold: 0.8,
      });
      // the servo bed must die with the machine — and its chain must come back
      this._retireLoop(machine, this._machineLoops.get(machine), 0.35);
      // one more machine may still be alive: do not let the resolve stinger
      // fire on the kill frame of a three-machine fight
      this._combatUntil = Math.max(this._combatUntil, performance.now() + 2600);
      // machine-rig publishes 'machine-death-impact' from the corpse grounder,
      // but a species that never poses a corpse would never arm the beacon.
      if (machine && !this._wreckBeacons.has(machine)) {
        this._wreckBeacons.set(machine, performance.now() + 900);
      }
      // and every status loop it was carrying stops with it
      if (this.zones && machine) {
        const id = this._idOf(machine);
        this.zones.retire(`burn:${id}`, 0.4);
        this.zones.retire(`shock:${id}`, 0.3);
        this.zones.retire(`frost:${id}`, 0.4);
      }
    }));

    ev.on('player-hurt', armed(() => {
      // D2: no VO. Breath and effort only.
      this.play2D('aloy/hurt', { volume: 0.75, category: 'voice', duck: 0.25 });
      this._hurt();
    }));
    ev.on('player-dodge', armed(() => this.play2D('aloy/effort', { volume: 0.55, category: 'voice' })));
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

    /* ---------------- Round 4 content half: death, suspicion, effort ------
     * Everything below consumes an event another lane already publishes. No
     * lane was asked to add anything for these — `machine-death-impact` comes
     * from the corpse grounder, the status timers are read off the machine,
     * and the player verbs were already on the bus.
     * ------------------------------------------------------------------- */

    // machine-rig (rig/ground.js CorpseGrounder._impact): the body lands.
    // audio-06 — death was one explosion; it is now explosion -> reactor
    // power-down -> the mass actually hitting the ground -> a loot beacon.
    ev.on('machine-death-impact', armed((e = {}) => {
      const pos = e.position || e.machine?.position;
      if (!pos) return;
      const strength = clamp(e.strength ?? 0.5, 0.1, 1);
      this.playAt('machine/collapse', pos, {
        volume: 0.55 + strength * 0.5,
        priority: PRI.death,
        rate: 1.12 - strength * 0.34,      // a Thunderjaw lands slower than a Watcher
        duck: 0.25 + strength * 0.2,
        duckHold: 0.5,
        reverb: 0.7,
      });
      if (e.machine) this._wreckBeacons.set(e.machine, performance.now());
    }));

    // audio-08 — a machine that is unsure has its own voice. The alarm is a
    // decision it has already made; this is the sound before that.
    ev.on('machine-suspicion', armed((e = {}) => this._warble(e.machine, e.lost)));

    // Loot taken: the beacon has been answered, so it stops.
    const quietBeacon = (m) => {
      if (!m || !this.zones) return;
      this.zones.retire(`loot:${this._idOf(m)}`, 0.5);
      this._wreckBeacons.delete(m);
    };
    ev.on('machine-looted', armed((e = {}) => quietBeacon(e.machine)));
    ev.on('loot-rummage', armed((e = {}) => quietBeacon(e.machine)));
    ev.on('machine-disposed', armed((e = {}) => quietBeacon(e.machine)));

    /* ----- Aloy: effort on the verbs that cost something (audio-03) ----- */
    ev.on('player-jump', armed(() => { this._airborne = true; this._effort(false, 0.8); }));
    ev.on('player-land', armed((e = {}) => {
      const hard = this._airborne && ((e.fallHeight ?? e.height ?? 0) > 2.4 || (e.impact ?? 0) > 0.5);
      this._airborne = false;
      // the boots land whatever the drop was; the grunt is only for a real fall
      this.play2D(this._footSet(), { volume: hard ? 0.65 : 0.42, rate: 0.9 });
      this.play2D('gear/heavy', { volume: hard ? 0.4 : 0.22 });
      if (hard) this._effort(true, 1);
    }));
    ev.on('player-mantle', armed(() => this._effort(true, 0.85)));
    ev.on('player-splash', armed((e = {}) => {
      const v = clamp(e.speed ? e.speed / 6 : 0.6, 0.25, 1);
      this.play2D('foot/water', { volume: 0.4 + v * 0.4, rate: 0.92 + Math.random() * 0.14 });
    }));
    ev.on('player-crouch', armed((e = {}) => {
      this.play2D('gear/light', { volume: e?.crouching === false ? 0.18 : 0.26 });
    }));

    /* ------- discovery stingers on the score (audio-01, audio-12) ------- */
    const discover = armed(() => this.music?.sting('discover', { volume: 0.8, minGap: 8 }));
    for (const name of ['level-up', 'skill-unlocked', 'quest-started', 'quest-complete',
      'datapoint-found', 'discovery', 'supply-cache', 'override-node', 'hunting-ground']) {
      ev.on(name, discover);
    }

    /* -------------------------- UI bus (audio-12) ------------------------
     * Menus were silent. These are procedural on purpose — a UI blip is one of
     * the few places synthesis beats a sample — but they route to `uiBus`, so
     * they stay crisp under Concentration and answer to their own slider.
     * `shell-menus` / `shell-hud` emit them; unemitted names cost nothing.
     * ------------------------------------------------------------------- */
    ev.on('ui-nav', armed(() => this._uiBlip(1520, 0.03, 0.05)));
    ev.on('ui-confirm', armed(() => this._uiBlip(880, 0.05, 0.1, 1320)));
    ev.on('ui-back', armed(() => this._uiBlip(660, 0.045, 0.09, 440)));
    ev.on('ui-error', armed(() => this._uiBlip(220, 0.06, 0.16, 165)));
    ev.on('ui-open', armed(() => this._wheelWhoosh(true)));
    ev.on('ui-close', armed(() => this._wheelWhoosh(false)));
    ev.on('inventory-open', armed(() => this._uiBlip(1180, 0.04, 0.08, 1560)));
    ev.on('inventory-close', armed(() => this._uiBlip(1180, 0.035, 0.08, 780)));
  }

  /** Concentration slow-mo entered/left (idempotent; event + poll driven). */
  _concSet(on) {
    if (on === this._concActive) return;
    this._concActive = on;
    this._concSetMs = performance.now();
    if (on) {
      this._counts.concentrations++;
      this._breath(true);
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

  /* ---------------------- update: the spatial half ----------------------- */

  /**
   * Listener, per-voice distance/occlusion, ducking, loops and the ambience
   * bed. Runs on REAL dt (slow-mo must not stretch a reverb tail) and never
   * allocates: the occlusion query reuses two Vector3 scratches and the chain
   * pool is fixed-size.
   */
  _updateSpatial(rdt, nowMs, playing) {
    const ctx = this.ctx;
    if (!this.buses) return;

    syncListener(this.ac, ctx.camera, this._listener);
    const collision = ctx.collision || null;   // spatial lane installs this late
    const L = this._listener;
    const lx = L.x; const ly = L.y; const lz = L.z;

    const chains = this.pool.chains;
    const nowCtx = this.ac.currentTime;
    for (let i = 0; i < chains.length; i++) {
      const c = chains[i];
      if (!c.busy) continue;
      if (c.endsAt <= nowCtx && c.tag !== 'servo') { c.reset(); continue; }
      const tr = c.tracked;
      if (tr && tr.position) {
        c.setPosition(tr.position.x, tr.position.y + (tr.eyeHeight ?? 1), tr.position.z);
      }
      if (this._occA) c.updateOcclusion(collision, lx, ly, lz, nowMs, this._occA, this._occB);
      c.smoothOcclusion(rdt);
      c.applyDistance(lx, ly, lz, L.fx, L.fy, L.fz);
    }

    this.ducker.update(rdt);
    // loop chains retire on a fade, not on a stop() — hand the finished ones
    // back before anything this frame asks for one.
    this._reclaimLoopChains();

    // keep every crossfading loop scheduled a beat ahead. Both iterations are
    // over cached arrays / guarded by size: this runs every frame and a Map
    // iterator or a for-in key list here is a per-frame allocation.
    const beds = this._bedList;
    for (let i = 0; i < beds.length; i++) beds[i].pump();
    const loops = this._loopList;                 // cached array, NOT Map.values()
    for (let i = 0; i < loops.length; i++) {
      const e = loops[i];
      e.loop.pump();
      const c = e.chain;
      if (this._occA) c.updateOcclusion(collision, lx, ly, lz, nowMs, this._occA, this._occB);
      c.smoothOcclusion(rdt);
      if (c.tracked && c.tracked.position) {
        c.setPosition(c.tracked.position.x, c.tracked.position.y + 1, c.tracked.position.z);
      }
      c.applyDistance(lx, ly, lz, L.fx, L.fy, L.fz);
    }

    // --- ambience bed (audio-11): one zone bed up, the others down
    this._bedT -= rdt;
    if (this._bedT <= 0) {
      this._bedT = 0.5;
      const want = playing ? this._pickBed() : null;
      if (want !== this._bed) this._bed = want;
      for (const k in this.loops) {
        this.loops[k].volume = k === this._bed ? (BED_GAIN[k] ?? 0.42) : 0;
      }
    }

    // --- servo idle loops follow the roster (throttled; 24 machines)
    this._servoT -= rdt;
    if (this._servoT <= 0) {
      this._servoT = 0.6;
      const list = ctx.machines?.list;
      if (list && playing) for (let i = 0; i < list.length; i++) this._syncServoLoop(list[i]);
      else for (const [m, e] of this._machineLoops) this._retireLoop(m, e, 0.4);
    }

    // --- positional world emitters (fire / water / status / loot beacons)
    if (this.zones) {
      this.zones.update(rdt, L, collision, nowMs, this._occA, this._occB);
      this._zoneT -= rdt;
      if (this._zoneT <= 0) {
        this._zoneT = 0.6;
        this._zoneScan(playing);
        this._beaconScan(playing);
      }
      this._statusT -= rdt;
      if (this._statusT <= 0) { this._statusT = 0.25; this._statusScan(playing); }
    }

    // arrow flyby trails the release by ~90 ms (audio-13)
    if (this._pendingFlyby && nowMs > this._pendingFlyby.at) {
      this.play2D(`bow/${this._pendingFlyby.bow}/flyby`, { volume: 0.32, pan: 0.15 });
      this._pendingFlyby = null;
    }
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

    this._updateSpatial(rdt, nowMs, playing);

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
    // audio-09 — Concentration muffles the WORLD, not just the score. The
    // heartbeat that used to paper over the un-filtered world is gone: it was
    // not in the canon cue and it fought the low-health heartbeat below.
    const lpTarget = this._concActive && playing ? 460 : 16000;
    this._lpFreq += (lpTarget - this._lpFreq)
      * Math.min(1, rdt * (this._concActive ? 10 : 5));
    this.musicLP.frequency.value = this._lpFreq;
    const worldTarget = this._concActive && playing ? 900 : 20000;
    this._worldLPFreq += (worldTarget - this._worldLPFreq)
      * Math.min(1, rdt * (this._concActive ? 9 : 4.5));
    if (this.worldLP) this.worldLP.frequency.value = this._worldLPFreq;

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

    // --- tension float. Still computed when the stem score is live: the
    //     bird/pluck suppression and the HUD read it.
    const tenseTarget = t - this._lastTenseT < 6 ? 1 : 0;
    this._tension += (tenseTarget - this._tension)
      * Math.min(1, dt * (tenseTarget ? 1.6 : 0.5));

    if (this.music && this.music.available) {
      // audio-01 — the composed score. `_musicSelect` names a state at 4 Hz;
      // the director quantises the crossfade to the bar and owns every gain.
      this._musicT -= rdt;
      if (this._musicT <= 0) { this._musicT = 0.25; this._musicSelect(nowMs); }
      this.music.update(rdt, playing);
    } else if (this._legacyScore) {
      // pre-Round-4 fallback: only reachable if a stem failed to decode
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
    }

    // --- Aloy's breath layer + the distant valley (audio-03 / audio-11)
    this._breathLayer(rdt, playing);
    this._distantCall(rdt, playing);
    this._nockPoll(playing);

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
      // the composed score has its own melodic layer; a random pentatonic
      // pluck over it is a second, unrelated piece of music
      if (this._tension < 0.25 && this._legacyScore) this._pluck();
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
        // v3
        worldLP: Math.round(this._worldLPFreq),
        duck: r(this.ducker ? this.ducker.level : 1),
        bed: this._bed,
        surface: this._surface,
        servoLoops: this._machineLoops.size,
        // the loop-chain pool is one-way if the reclaim sweep ever regresses:
        // busy must track servoLoops (plus whatever is mid-fade), never climb.
        loopChains: this._loopChains ? this._loopChains.length : 0,
        loopChainsBusy: this._loopChains
          ? this._loopChains.reduce((n, c) => n + (c.busy ? 1 : 0), 0) : 0,
        // v4
        musicState: this.music?.available ? this.music.state : 'procedural',
        exertion: r(this._exertion),
        zoneEmitters: this.zones ? this.zones.size : 0,
        beacons: this._wreckBeacons.size,
      },
      music: this.music ? this.music.debug() : null,
      zones: this.zones ? this.zones.debug() : null,
      counts: { ...this._counts },
      // v3 — the numbers the gates read
      bank: this.bank.audit(),
      pool: this.pool ? {
        size: this.pool.chains.length,
        active: this.pool.activeCount(now),
        peak: this.pool.peak,
        stolen: this.pool.stolen,
        refused: this.pool.refused,
      } : null,
      volumes: { ...this.settings },
      contract: { ...this._contract },
      samples: { ...this._sampleCounts },
      occlusion: this.ctx.collision ? 'active' : 'no ctx.collision (spatial lane not installed)',
    };
  }
}
