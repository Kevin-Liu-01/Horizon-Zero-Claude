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

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.24;
  comp.connect(ac.destination);

  const master = g(volumes.muted ? 0 : volumes.master);
  master.connect(comp);

  // The world low-pass. 20 kHz = open; Concentration walks it down to ~420 Hz.
  const worldLP = ac.createBiquadFilter();
  worldLP.type = 'lowpass';
  worldLP.frequency.value = 20000;
  worldLP.Q.value = 0.35;
  worldLP.connect(master);

  const sfxVol = g(volumes.sfx); sfxVol.connect(worldLP);
  const ambVol = g(volumes.ambience); ambVol.connect(worldLP);
  const voiceVol = g(volumes.voice); voiceVol.connect(worldLP);

  const sfxBus = g(1); sfxBus.connect(sfxVol);
  const ambDuck = g(1); ambDuck.connect(ambVol);
  const ambBus = g(1); ambBus.connect(ambDuck);
  const voiceBus = g(1); voiceBus.connect(voiceVol);

  // music keeps its own low-pass (score ducks earlier and harder than the
  // world does) but re-enters at master, above worldLP, so the two filters
  // never stack into mud.
  const musicVol = g(volumes.music); musicVol.connect(master);
  const musicDuck = g(1); musicDuck.connect(musicVol);
  const musicLP = ac.createBiquadFilter();
  musicLP.type = 'lowpass';
  musicLP.frequency.value = 16000;
  musicLP.Q.value = 0.4;
  musicLP.connect(musicDuck);
  const musicBus = g(1); musicBus.connect(musicLP);

  const uiVol = g(volumes.ui); uiVol.connect(master);
  const uiBus = g(1); uiBus.connect(uiVol);

  // reverb: one convolver shared by every spatial send
  const convolver = ac.createConvolver();
  convolver.normalize = true;
  convolver.buffer = ir || makeValleyIR(ac);
  const fxReturn = g(0.55);
  convolver.connect(fxReturn); fxReturn.connect(worldLP);
  const reverbSend = g(1); reverbSend.connect(convolver);

  let tap = null;
  if (analyser && ac.createAnalyser) {
    tap = ac.createAnalyser();
    tap.fftSize = 2048;
    tap.smoothingTimeConstant = 0.2;
    master.connect(tap);
  }

  return {
    ac, comp, master, worldLP,
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
    this._until = 0;     // AudioContext time the hold expires
    this._target = 1;
  }

  /** @param {number} amount 0..1 how far to dip @param {number} hold seconds */
  trigger(amount, hold = 0.35) {
    const a = clamp(1 - amount, 0.05, 1);
    const now = this.buses.ac.currentTime;
    if (a < this._target || now > this._until) this._target = a;
    this._until = Math.max(this._until, now + hold);
  }

  /** Call once per frame with real (unscaled) dt. */
  update(rdt) {
    const now = this.buses.ac.currentTime;
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
