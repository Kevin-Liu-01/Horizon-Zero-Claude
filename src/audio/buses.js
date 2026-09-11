/**
 * The mix bus graph, built identically on a live `AudioContext` and on an
 * `OfflineAudioContext`. That symmetry is the whole point: the headless gates
 * measure the *same* graph the player hears, not a lookalike.
 *
 *                                        ┌── sfxVol   ←── sfxBus
 *                                        ├── ambVol   ←── ambDuck ←── ambBus
 *   destination ← comp ← master ← worldLP┤── voiceVol ←── voiceBus
 *                          │             └── fxReturn ←── convolver ← reverbSend
 *                          ├── musicVol ← musicDuck ← musicLP ← musicBus
 *                          └── uiVol    ←── uiBus
 *
 * Three deliberate routing decisions:
 *  - **`worldLP` sits over the whole diegetic world**, not just the music, so
 *    Concentration muffles footsteps, machines and reverb together
 *    (`audio-09`; the old build low-passed music only and papered over the rest
 *    with a heartbeat, which is now gone).
 *  - **`uiBus` bypasses `worldLP` and every ducker.** Menu feedback must stay
 *    crisp while the world is under water (`audio-12`).
 *  - **The reverb return re-enters *under* `worldLP`**, so a muffled world has
 *    a muffled tail. A return wired to master would sound like the reverb had
 *    escaped the room.
 */

import { clockFor } from './clock.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Bus names that carry a persisted volume slider. */
export const VOLUME_BUSES = ['master', 'music', 'sfx', 'ambience', 'voice', 'ui'];

export const DEFAULT_VOLUMES = {
  master: 0.85, music: 0.8, sfx: 1.0, ambience: 0.9, voice: 1.0, ui: 0.8, muted: false,
};

/**
 * Procedural impulse response: exponentially decaying noise with a short
 * pre-delay and a darkening tilt. A valley reverb, not a cathedral — 1.5 s.
 * Generated rather than shipped so the bank budget stays for content.
 */
export function makeValleyIR(ac, seconds = 1.5, decay = 3.1) {
  const sr = ac.sampleRate;
  const pre = Math.floor(sr * 0.012);
  const len = Math.max(1, Math.floor(sr * seconds));
  const buf = ac.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      if (i < pre) { d[i] = 0; continue; }
      const t = (i - pre) / (len - pre);
      const white = Math.random() * 2 - 1;
      // one-pole low-pass that closes as the tail decays (air absorption)
      lp += (white - lp) * (0.55 - 0.4 * t);
      d[i] = lp * Math.pow(1 - t, decay) * (c ? 0.94 : 1);
    }
  }
  return buf;
}

export function buildBuses(ac, { volumes = DEFAULT_VOLUMES, ir = null, analyser = false } = {}) {
  const g = (v) => { const n = ac.createGain(); n.gain.value = v; return n; };

  /**
   * Every edge in this graph is made through `wire()`, which records it as it
   * connects it. `graph.edges` is therefore a *description that cannot drift
   * from the wiring* — it is produced by the same call that makes the
   * connection, not written down beside it.
   *
   * That matters because the two routing rules this file exists to enforce —
   * "the world goes through `worldLP`, the UI does not" (`audio-09`/`audio-12`)
   * — are invisible to any measurement a headless gate can make: WebAudio has
   * no API for reading connections, and a context with no output device
   * renders no samples to analyse. The edge list is what makes them testable
   * (`A73d-ui-bus`).
   */
  const edges = [];
  const wire = (from, to, fromName, toName) => {
    from.connect(to);
    edges.push([fromName, toName]);
    return from;
  };

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.24;
  wire(comp, ac.destination, 'comp', 'destination');

  const master = g(volumes.muted ? 0 : volumes.master);
  wire(master, comp, 'master', 'comp');

  // The world low-pass. 20 kHz = open; Concentration walks it down to ~420 Hz.
  const worldLP = ac.createBiquadFilter();
  worldLP.type = 'lowpass';
  worldLP.frequency.value = 20000;
  worldLP.Q.value = 0.35;
  wire(worldLP, master, 'worldLP', 'master');

  const sfxVol = g(volumes.sfx); wire(sfxVol, worldLP, 'sfxVol', 'worldLP');
  const ambVol = g(volumes.ambience); wire(ambVol, worldLP, 'ambVol', 'worldLP');
  const voiceVol = g(volumes.voice); wire(voiceVol, worldLP, 'voiceVol', 'worldLP');

  const sfxBus = g(1); wire(sfxBus, sfxVol, 'sfxBus', 'sfxVol');
  const ambDuck = g(1); wire(ambDuck, ambVol, 'ambDuck', 'ambVol');
  const ambBus = g(1); wire(ambBus, ambDuck, 'ambBus', 'ambDuck');
  const voiceBus = g(1); wire(voiceBus, voiceVol, 'voiceBus', 'voiceVol');

  // music keeps its own low-pass (score ducks earlier and harder than the
  // world does) but re-enters at master, above worldLP, so the two filters
  // never stack into mud.
  const musicVol = g(volumes.music); wire(musicVol, master, 'musicVol', 'master');
  const musicDuck = g(1); wire(musicDuck, musicVol, 'musicDuck', 'musicVol');
  const musicLP = ac.createBiquadFilter();
  musicLP.type = 'lowpass';
  musicLP.frequency.value = 16000;
  musicLP.Q.value = 0.4;
  wire(musicLP, musicDuck, 'musicLP', 'musicDuck');
  const musicBus = g(1); wire(musicBus, musicLP, 'musicBus', 'musicLP');

  const uiVol = g(volumes.ui); wire(uiVol, master, 'uiVol', 'master');
  const uiBus = g(1); wire(uiBus, uiVol, 'uiBus', 'uiVol');

  // reverb: one convolver shared by every spatial send
  const convolver = ac.createConvolver();
  convolver.normalize = true;
  convolver.buffer = ir || makeValleyIR(ac);
  const fxReturn = g(0.55);
  wire(convolver, fxReturn, 'convolver', 'fxReturn');
  wire(fxReturn, worldLP, 'fxReturn', 'worldLP');
  const reverbSend = g(1); wire(reverbSend, convolver, 'reverbSend', 'convolver');

  let tap = null;
  if (analyser && ac.createAnalyser) {
    tap = ac.createAnalyser();
    tap.fftSize = 2048;
    tap.smoothingTimeConstant = 0.2;
    master.connect(tap);                 // a tap, not a path: deliberately unwired
  }

  /**
   * Every node name between `from` and `destination`, in order, or null when
   * `from` does not reach it. Used to assert routing rules ("the UI never
   * passes through the world low-pass") rather than trusting a comment.
   */
  const pathFrom = (from, to = 'destination', seen = []) => {
    if (from === to) return [from];
    if (seen.indexOf(from) >= 0) return null;             // cycles cannot exist, but never hang
    const next = seen.concat(from);
    for (let i = 0; i < edges.length; i++) {
      if (edges[i][0] !== from) continue;
      const rest = pathFrom(edges[i][1], to, next);
      if (rest) return [from].concat(rest);
    }
    return null;
  };

  return {
    ac, comp, master, worldLP,
    graph: { edges, pathFrom },
    sfxBus, ambBus, voiceBus, uiBus, musicBus,
    sfxVol, ambVol, voiceVol, uiVol, musicVol,
    ambDuck, musicDuck, musicLP,
    reverbSend, convolver, fxReturn,
    analyser: tap,
    /** Dry destination for a spatial voice, by category. */
    dryFor(category) {
      if (category === 'ambience') return ambBus;
      if (category === 'voice') return voiceBus;
      if (category === 'ui') return uiBus;
      return sfxBus;
    },
  };
}

/**
 * Sidechain ducker. `trigger(amount)` dips ambience + music under a loud,
 * important voice and lets them breathe back — the reason a Thunderjaw roar
 * reads as *big* instead of just louder (`audio-14`).
 */
export class Ducker {
  constructor(buses) {
    this.buses = buses;
    this.level = 1;      // 1 = open, 0 = fully ducked
    this._until = 0;     // clock time the hold expires — monotonic, see below
    this._target = 1;
    /**
     * The hold window is `now + hold` bookkeeping, so it runs on the monotonic
     * clock (src/audio/clock.js). On `ac.currentTime` it wedges: a context
     * whose render clock has stopped (no output device) never passes
     * `now > this._until`, so the first roar of the session ducks ambience and
     * the score to 0.65 and they never come back up.
     */
    this._clock = clockFor(buses.ac);
  }

  /** @param {number} amount 0..1 how far to dip @param {number} hold seconds */
  trigger(amount, hold = 0.35) {
    const a = clamp(1 - amount, 0.05, 1);
    const now = this._clock.now();
    if (a < this._target || now > this._until) this._target = a;
    this._until = Math.max(this._until, now + hold);
  }

  /** Call once per frame with real (unscaled) dt. */
  update(rdt) {
    const now = this._clock.now();
    const want = now > this._until ? 1 : this._target;
    if (now > this._until) this._target = 1;
    // fast attack, slow release — classic sidechain shape
    const k = Math.min(1, rdt * (want < this.level ? 24 : 3.2));
    this.level += (want - this.level) * k;
    if (Math.abs(this.level - 1) < 0.002) this.level = 1;
    this.buses.ambDuck.gain.value = 0.35 + 0.65 * this.level;
    this.buses.musicDuck.gain.value = 0.25 + 0.75 * this.level;
  }
}
