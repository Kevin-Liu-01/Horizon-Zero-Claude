/**
 * The mix's two clocks.
 *
 * Web Audio has exactly one honest *scheduling* clock: `AudioContext
 * .currentTime`, the render thread's own time base. An envelope, a
 * `src.start(t)` or an `AudioParam` ramp scheduled against it is
 * sample-accurate no matter what the frame rate is doing, which is why every
 * voice in this lane is written as `now + duration` rather than driven from
 * `dt`.
 *
 * That clock has one failure mode, and we hit it every single run:
 *
 *   **a context can report `state === 'running'` while `currentTime` never
 *   advances**, because there is no output device behind it.
 *
 * It is the normal state of headless Chrome — where every gate in this lane
 * runs — and it happens on a real machine the moment the last output device
 * goes away (unplugged interface, a Bluetooth headset dropping, a VM losing
 * its sink). Measured in our own harness: `state: 'running'`, `currentTime`
 * pinned at 0.0053 s for the life of the page.
 *
 * Everything written as `now + duration` then wedges *permanently*:
 *
 *  - `_voice()`'s cap never expires an entry, so after 24 one-shots every
 *    `play2D` returns false — no footsteps, no bow, no breath, forever;
 *  - `SpatialPool.acquire()` never reclaims a chain (and `src.onended` never
 *    fires either, because that is the render thread's callback), so the 28th
 *    positional sound is the last one the session ever plays;
 *  - `MusicDirector`'s pending transition never retires, so the score stays on
 *    whatever state it was born in and every stem sits at gain 0.
 *
 * None of that is recoverable when the device comes back, which makes it a
 * real bug and not merely a headless artefact.
 *
 * ## The split
 *
 * `sched()` — **what you hand to Web Audio.** Always the raw `currentTime`,
 * because it is the only value the audio timeline understands. When the render
 * clock is dead this is frozen; nothing is rendering anyway, so scheduling
 * against it is correct-by-default and instantly right again the moment a
 * device returns.
 *
 * `now()` — **what you compare your own bookkeeping against.** Follows
 * `currentTime` exactly while it advances (so in every healthy browser the two
 * are the same number and behaviour is bit-identical to having no clock at
 * all), and falls forward on the wall clock when the render clock stalls, so
 * voice caps, pool reclaim and the bar grid keep working.
 *
 * The one rule: **never compare a `sched()` value with a `now()` value.** Pick
 * the clock that matches what the number means and stay on it.
 */

/** Wall time in seconds — the same units as the AudioContext clock. */
const wall = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;

/**
 * How long the render clock may fail to advance before we call it stalled.
 * A healthy context advances one render quantum at a time (2.67 ms at 48 kHz)
 * and two JS reads inside the same quantum legitimately see the same value, so
 * this has to be comfortably longer than a quantum — and comfortably shorter
 * than any duration the mix cares about.
 */
export const STALL_AFTER = 0.25;

export class AudioClock {
  /** @param {BaseAudioContext} ac */
  constructor(ac) {
    this.ac = ac;
    const raw = ac.currentTime || 0;
    this._raw = raw;        // the last render-clock value we observed
    this._rawAt = wall();   // the wall time we observed it at
    this._out = raw;        // the last value now() returned (monotonic)
    this._gap = 0;          // wall seconds since the render clock last moved
    /**
     * Synthetic seconds already handed out while the render clock was dead.
     * Folded in the moment it starts moving again, so a device coming back
     * does not re-freeze this clock for the length of the outage it just
     * ended: without it, `now()` would sit on its inflated value until the
     * render clock caught up — which is the same wedge, arriving later.
     */
    this._offset = 0;
    this._everStalled = false;
  }

  /** The raw render clock: the only thing Web Audio scheduling accepts. */
  sched() { return this.ac.currentTime; }

  /**
   * Monotonic bookkeeping time. Equal to `sched()` in any context whose render
   * thread is alive.
   */
  now() {
    const ac = this.ac;
    const raw = ac.currentTime;
    const w = wall();

    if (raw > this._raw + 1e-7) {          // the render clock is moving: trust it
      this._fold();
      this._raw = raw;
      this._rawAt = w;
      this._gap = 0;
    } else if (ac.state !== 'running') {
      // Suspended or closed: the clock is *supposed* to be frozen and the
      // graph really is paused, so freezing with it is the correct answer —
      // a voice scheduled before the pause must still be counted as playing
      // when the page comes back.
      this._fold();
      this._rawAt = w;
    } else {
      this._gap = w - this._rawAt;
      if (this._gap > STALL_AFTER) this._everStalled = true;
    }

    // Below the threshold the render clock is merely inside its current
    // quantum, which is not a stall and must not advance anything.
    const synthetic = this._gap > STALL_AFTER ? this._gap : 0;
    const t = this._raw + this._offset + synthetic;
    if (t > this._out) this._out = t;
    return this._out;
  }

  /** Bank the synthetic advance so far; see `_offset`. */
  _fold() {
    if (this._gap > STALL_AFTER) { this._offset += this._gap; this._gap = 0; }
  }

  /**
   * True while the render clock is not advancing under a running context —
   * i.e. there is no output device. Callers use it to take the one path that
   * cannot be expressed on the audio timeline: driving an `AudioParam` from
   * the frame loop instead of scheduling a ramp onto a timeline that will
   * never be evaluated.
   */
  get stalled() {
    this.now();
    return this._gap > STALL_AFTER;
  }

  /** Whether this context has stalled at any point (debug/gate facing). */
  get everStalled() { return this._everStalled; }

  debug() {
    return {
      sched: +this.sched().toFixed(4),
      now: +this.now().toFixed(4),
      stalled: this.stalled,
      gap: +this._gap.toFixed(3),
      state: this.ac.state,
    };
  }
}

/** @type {WeakMap<BaseAudioContext, AudioClock>} */
const CLOCKS = new WeakMap();

/**
 * The clock for a context. Memoised per context so every module in the mix
 * shares one observation history without threading a constructor argument
 * through the whole graph — two clocks on one context would each see the other
 * one's reads as "no progress" and disagree about the stall.
 *
 * @param {BaseAudioContext} ac
 * @returns {AudioClock}
 */
export function clockFor(ac) {
  let c = CLOCKS.get(ac);
  if (!c) { c = new AudioClock(ac); CLOCKS.set(ac, c); }
  return c;
}
