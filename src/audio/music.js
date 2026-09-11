/**
 * MusicDirector — the adaptive score (`audio-01`).
 *
 * Round 3 shipped "music" that was a 55 Hz drone, a random pentatonic pluck
 * every few seconds and a percussion layer that faded in on a tension float.
 * It had no metre, so nothing could ever land on a beat; it had no form, so a
 * fight and a walk sounded like the same texture at two volumes; and it had no
 * transitions, so the moment a Sawtooth noticed you the mix just got louder.
 *
 * This replaces it with seven composed stems and a bar clock.
 *
 * ## The clock is the whole design
 *
 * Every stem is one 4-bar phrase at 96 BPM — bar 2.5 s, phrase 10.0 s — and
 * **all seven start at the same AudioContext timestamp and never stop.** They
 * are always playing; only their gains move. That is what makes a transition
 * free: there is no "start the combat loop" moment that could land off the
 * beat, because the combat loop has been running silently in phase since the
 * context was armed.
 *
 * Transitions are then scheduled on the bar grid derived from that one origin
 * (`_nextBar()`), so a crossfade begins exactly on a downbeat no matter which
 * frame the game asked for it. `quantised` is not a promise: it is computed
 * from the error of every transition this session actually scheduled, so a
 * regression that ramps immediately turns the flag false and fails A77.
 *
 * Stingers are the one exception and deliberately so — a stinger that waits
 * for the bar arrives after the thing it is reacting to.
 *
 * ## Why AudioContext time, never `dt`
 *
 * `engine.timeScale` stretches gameplay dt (Concentration slow-mo, the weapon
 * wheel, the studio freeze). Music must not slow down with it, so every value
 * here is scheduled against `ac.currentTime` and the only thing `update()`
 * does per frame is move a master fade. This is the same rule the rest of the
 * audio lane follows.
 *
 * Stems live in the bank as CC0 Ogg/Opus rendered by `tools/audio-recipes.js`
 * (see `public/audio/MANIFEST.md`). When they are missing — a failed download,
 * a stripped build — `available` is false and `GameAudio` keeps its legacy
 * procedural score rather than going silent.
 */

export const BPM = 96;
export const BEAT = 60 / BPM;   // 0.625 s
export const BAR = BEAT * 4;    // 2.5 s
export const PHRASE = BAR * 4;  // 10.0 s — the rendered stem length

/** stem key -> bank set id. The key is what the mix table and gates speak. */
export const STEM_SETS = {
  pad: 'music/pad-calm',
  pluck: 'music/pluck-calm',
  drone: 'music/drone-tense',
  perc: 'music/perc-tense',
  drums: 'music/drums-combat',
  bass: 'music/bass-combat',
  lead: 'music/lead-combat',
};

export const STATES = ['calm', 'suspicious', 'combat', 'resolve'];

/**
 * The mix per state. A state is a *chord of stems*, not a track: `suspicious`
 * keeps a quarter of the exploration pad so the world does not vanish when a
 * Watcher turns its head, and `combat` keeps the tense drone underneath the
 * kit so the low end never drops out mid-transition.
 */
export const MIX = {
  calm: { pad: 0.9, pluck: 0.75, drone: 0, perc: 0, drums: 0, bass: 0, lead: 0 },
  suspicious: { pad: 0.34, pluck: 0, drone: 0.95, perc: 0.6, drums: 0, bass: 0, lead: 0 },
  combat: { pad: 0, pluck: 0, drone: 0.42, perc: 0, drums: 1, bass: 0.92, lead: 0.78 },
  resolve: { pad: 0.72, pluck: 0.4, drone: 0.18, perc: 0, drums: 0, bass: 0, lead: 0 },
};

/**
 * Crossfade length in BARS, per transition. Escalation is fast (the score has
 * to arrive with the machine), de-escalation is slow (the valley has to be
 * allowed to settle). Anything not listed uses one bar.
 */
const XFADE_BARS = {
  'calm>suspicious': 0.5,
  'calm>combat': 0.25,
  'suspicious>combat': 0.25,
  'resolve>combat': 0.25,
  'suspicious>calm': 1.5,
  'combat>resolve': 0.5,
  'resolve>calm': 2,
};

/** Stinger set ids. These are one-shots and are NOT bar-quantised. */
export const STINGERS = {
  combat: 'music/sting-combat',
  resolve: 'music/sting-resolve',
  alert: 'music/sting-alert',
  discover: 'music/sting-discover',
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class MusicDirector {
  /**
   * @param {AudioContext} ac
   * @param {ReturnType<import('./buses.js').buildBuses>} buses
   * @param {import('./bank.js').SampleBank} bank
   */
  constructor(ac, buses, bank) {
    this.ac = ac;
    this.buses = buses;
    this.bank = bank;

    /** @type {Record<string, {set:string, node:AudioBufferSourceNode, gain:GainNode, target:number}>} */
    this._stems = {};
    /**
     * Starts OUTSIDE the state set on purpose. `setState` refuses a no-op, so
     * initialising to 'calm' made the opening `setState('calm')` a no-op and
     * every stem stayed at gain 0 — the score was wired, phase-locked and
     * completely silent until the first Watcher noticed you.
     */
    this._state = 'silent';
    this._pending = null;      // { to, at, xfade } while a transition is queued
    /** @type {{from:string,to:string,at:number,bar:number,barError:number,xfade:number}[]} */
    this.transitions = [];
    this.stingers = { combat: 0, resolve: 0, alert: 0, discover: 0 };
    this._stingerAt = { combat: -1e9, resolve: -1e9, alert: -1e9, discover: -1e9 };
    this.available = false;
    this.origin = 0;
    this.loopEnd = PHRASE;
    this.missing = [];

    this._level = 0;           // master fade (pause / title), real-time
    this._levelTarget = 1;

    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(buses.musicBus);

    this._build();
  }

  /* ------------------------------- build -------------------------------- */

  _build() {
    const ac = this.ac;
    let shortest = Infinity;
    for (const [key, set] of Object.entries(STEM_SETS)) {
      const first = this.bank.first(set);
      if (!first) { this.missing.push(set); continue; }
      shortest = Math.min(shortest, first.buffer.duration);
    }
    if (this.missing.length) return;         // all-or-nothing: a partial score is worse than none

    // The stems must loop at the MUSICAL length, not the buffer length. Opus
    // via MediaRecorder truncates a few tens of ms of tail, so the buffers are
    // rendered 0.6 s long and cut here — a loop at buffer.duration would drift
    // each stem by a different amount and shred the phase lock within a minute.
    this.loopEnd = Math.min(PHRASE, shortest - 0.01);

    // One origin, slightly in the future so every start() is scheduled rather
    // than "as soon as possible" (which is per-node and would smear the mix).
    this.origin = ac.currentTime + 0.12;

    for (const [key, set] of Object.entries(STEM_SETS)) {
      const first = this.bank.first(set);
      const gain = ac.createGain();
      gain.gain.value = 0;
      gain.connect(this.out);
      const node = ac.createBufferSource();
      node.buffer = first.buffer;
      node.loop = true;
      node.loopStart = 0;
      node.loopEnd = this.loopEnd;
      node.connect(gain);
      node.start(this.origin);
      this._stems[key] = { set, node, gain, target: 0, rowGain: first.row.gain ?? 1 };
    }
    this.available = true;
    // arrive at the calm mix on the first bar rather than snapping at t=0
    this.setState('calm', { xfadeBars: 2 });
  }

  /* ------------------------------- clock -------------------------------- */

  /** Bars elapsed since the origin (fractional). */
  get clock() { return (this.ac.currentTime - this.origin) / BAR; }
  /** Integer bar index since the origin. */
  get bar() { return Math.floor(this.clock); }
  /** Position inside the current bar, 0..4 beats. */
  get beat() { return (this.clock - Math.floor(this.clock)) * 4; }

  /**
   * The next bar boundary at least `lead` seconds away. The lead exists because
   * an AudioParam ramp scheduled 2 ms out is indistinguishable from an
   * immediate jump on a loaded frame — it would be quantised on paper and
   * audibly early.
   */
  _nextBar(lead = 0.05) {
    const t = this.ac.currentTime + lead;
    const n = Math.ceil((t - this.origin) / BAR);
    return this.origin + n * BAR;
  }

  /* ----------------------------- transitions ---------------------------- */

  /**
   * Queue a state change on the next bar.
   * @param {'calm'|'suspicious'|'combat'|'resolve'} to
   * @param {{xfadeBars?:number, force?:boolean}} [opts]
   * @returns {boolean} false when the state was already current/pending
   */
  setState(to, opts = {}) {
    if (!this.available || !MIX[to]) return false;
    const from = this._pending ? this._pending.to : this._state;
    if (to === from && !opts.force) return false;

    const xfade = BAR * (opts.xfadeBars ?? XFADE_BARS[`${from}>${to}`] ?? 1);
    const at = this._nextBar();
    const mix = MIX[to];
    const now = this.ac.currentTime;

    for (const [key, s] of Object.entries(this._stems)) {
      const g = s.gain.gain;
      // Cancel whatever ramp is in flight WITHOUT jumping: cancelAndHold keeps
      // the curve's current value. The fallback path re-anchors by hand.
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
      else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
      const target = (mix[key] ?? 0) * s.rowGain;
      s.target = target;
      g.setValueAtTime(g.value, at);         // hold flat until the downbeat
      g.linearRampToValueAtTime(target, at + xfade);
    }

    // Honest quantisation error: how far the scheduled start is from the grid.
    const k = (at - this.origin) / BAR;
    const barError = Math.abs(k - Math.round(k)) * BAR;
    this._pending = { to, at, xfade, from };
    this.transitions.push({
      from, to, at: +at.toFixed(4), bar: Math.round(k), barError: +barError.toFixed(6), xfade,
    });
    if (this.transitions.length > 64) this.transitions.shift();
    return true;
  }

  /** True only if every transition this session landed on the bar grid. */
  get quantised() {
    for (let i = 0; i < this.transitions.length; i++) {
      if (this.transitions[i].barError > 1e-3) return false;
    }
    return true;
  }

  get state() { return this._state; }
  /** The state the score is heading for (the current one when nothing is queued). */
  get nextState() { return this._pending ? this._pending.to : this._state; }

  /* ------------------------------ stingers ------------------------------ */

  /**
   * Fire a one-shot. Not quantised on purpose (see the file header) and
   * throttled per name so a cascading alarm cannot machine-gun the score.
   * @returns {boolean} whether it actually played
   */
  sting(name, { volume = 1, minGap = 6, duck = 0.35 } = {}) {
    const set = STINGERS[name];
    if (!set || !this.ac) return false;
    const now = this.ac.currentTime;
    if (now - this._stingerAt[name] < minGap) return false;
    const picked = this.bank.pick(set);
    if (!picked) return false;
    this._stingerAt[name] = now;
    this.stingers[name] = (this.stingers[name] || 0) + 1;
    const g = this.ac.createGain();
    g.gain.value = volume * (picked.row.gain ?? 1);
    g.connect(this.buses.musicBus);
    const src = this.ac.createBufferSource();
    src.buffer = picked.buffer;
    src.connect(g);
    src.start(now);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* torn down */ } };
    // stingers sit above the world, not inside it
    if (duck) this.buses.ambDuck.gain.setTargetAtTime(0.45, now, 0.05);
    return true;
  }

  /* ------------------------------- update ------------------------------- */

  /**
   * @param {number} rdt real (unscaled) seconds since the last frame
   * @param {boolean} playing false on title / pause / death — the score fades
   *        but the clock keeps running so bars stay aligned across a pause.
   */
  update(rdt, playing) {
    if (!this.available) return;
    // retire a pending transition once its downbeat has passed
    if (this._pending && this.ac.currentTime >= this._pending.at) {
      this._state = this._pending.to;
      this._pending = null;
    }
    this._levelTarget = playing ? 1 : 0.22;
    const k = Math.min(1, rdt * (this._levelTarget < this._level ? 2.4 : 1.4));
    this._level += (this._levelTarget - this._level) * k;
    this.out.gain.value = clamp(this._level, 0, 1);
  }

  /* -------------------------------- debug ------------------------------- */

  /**
   * Live per-stem gains. Allocating — for gates and the debug overlay only,
   * never per frame.
   */
  get stems() {
    const out = {};
    for (const [key, s] of Object.entries(this._stems)) {
      out[key] = {
        set: s.set,
        gain: +s.gain.gain.value.toFixed(4),
        target: +s.target.toFixed(4),
      };
    }
    return out;
  }

  debug() {
    return {
      available: this.available,
      state: this._state,
      next: this.nextState,
      bpm: BPM, bar: BAR, phrase: PHRASE, loopEnd: +this.loopEnd.toFixed(3),
      clockBar: +this.clock.toFixed(3),
      beat: +this.beat.toFixed(2),
      quantised: this.quantised,
      level: +this._level.toFixed(3),
      stems: this.stems,
      stingers: { ...this.stingers },
      transitions: this.transitions.slice(-8),
      missing: this.missing,
    };
  }

  dispose() {
    for (const s of Object.values(this._stems)) {
      try { s.node.stop(); s.node.disconnect(); s.gain.disconnect(); } catch { /* torn down */ }
    }
    this._stems = {};
    this.available = false;
  }
}
