/**
 * ZoneEmitters — the positional loops (`audio-11`, `audio-10`, `audio-06`).
 *
 * A bed on the ambience bus tells you what kind of place you are in. It cannot
 * tell you that the fire is on your left, that the river is thirty metres
 * behind the ridge, or that the Sawtooth you set alight is still burning
 * somewhere in the smoke. Those are *sources*, and a source has to be in the
 * world: spatialised, occluded by the terrain between you and it, and
 * attenuated by distance like everything else.
 *
 * This is the registry for them. Each entry is a keyed, long-lived
 * `LoopEmitter` on its own `SpatialChain`:
 *
 *   fire:<n>       campfires and burning props (world-props / camp)
 *   water:river    the nearest point of open water, re-aimed as you move
 *   burn:<machine> / shock:<machine> / frost:<machine>   elemental status
 *   loot:<machine> the wreck beacon that says "there is something here"
 *
 * Ownership rules, learned from the servo-bed leak this lane already fixed
 * once (gate `A78-loop-reclaim`):
 *  - `ensure()` is idempotent and is the ONLY way an emitter is created.
 *  - `retire()` is the ONLY way one stops. It fades, then keeps the chain
 *    reserved for exactly the length of that fade.
 *  - `_sweep()` is the only thing that hands a chain back, and it runs every
 *    frame before anything can ask for one. A chain is never freed while its
 *    tail is still audible, and never held after it is not.
 *
 * The pool is separate from the servo-bed pool on purpose: a valley full of
 * burning machines must not be able to starve the idle beds that stealth
 * gameplay is played on, and vice versa.
 */

import { SpatialChain, LoopEmitter } from './spatial.js';
import { clockFor } from './clock.js';

const MAX_CHAINS = 14;

export class ZoneEmitters {
  /**
   * @param {AudioContext} ac
   * @param {ReturnType<import('./buses.js').buildBuses>} buses
   * @param {import('./bank.js').SampleBank} bank
   */
  constructor(ac, buses, bank) {
    this.ac = ac;
    this.buses = buses;
    this.bank = bank;
    // Chain reserve/reclaim is `now + fade` bookkeeping, so it runs on the
    // monotonic clock: a context with no output device keeps its render clock
    // pinned, and every retired emitter would hold its chain forever.
    this.clock = clockFor(ac);
    /** @type {Map<string, {loop:LoopEmitter, chain:SpatialChain, set:string, x:number,y:number,z:number}>} */
    this._live = new Map();
    /** @type {SpatialChain[]} */
    this._chains = [];
    this.refused = 0;
  }

  get size() { return this._live.size; }
  get chainCount() { return this._chains.length; }
  get busyChains() { return this._chains.reduce((n, c) => n + (c.busy ? 1 : 0), 0); }

  /** Ids currently sounding — debug/gate facing, allocates. */
  ids() { return Array.from(this._live.keys()); }

  /* ------------------------------- pool --------------------------------- */

  _sweep() {
    const now = this.clock.now();
    for (let i = 0; i < this._chains.length; i++) {
      const c = this._chains[i];
      if (!c.busy || c.endsAt > now) continue;
      if (c.loop) { c.loop.dispose(); c.loop = null; }
      c.reset();
    }
  }

  _take() {
    this._sweep();
    for (let i = 0; i < this._chains.length; i++) if (!this._chains[i].busy) return this._chains[i];
    if (this._chains.length >= MAX_CHAINS) { this.refused++; return null; }
    const c = new SpatialChain(this.buses, { panningModel: 'equalpower' });
    c.loop = null;
    this._chains.push(c);
    return c;
  }

  /* ------------------------------ lifecycle ----------------------------- */

  /**
   * Create or refresh one positional loop.
   * @param {string} id      stable key — `ensure` on the same id moves it
   * @param {string} setId   bank set (must be a loop cue)
   * @param {number} x @param {number} y @param {number} z
   * @param {{volume?:number, rate?:number, reverb?:number, category?:string}} [opts]
   * @returns {boolean} whether the emitter is (now) live
   */
  ensure(id, setId, x, y, z, opts = {}) {
    const have = this._live.get(id);
    if (have) {
      have.x = x; have.y = y; have.z = z;
      have.chain.setPosition(x, y, z);
      if (opts.volume != null) have.loop.volume = opts.volume;
      return true;
    }
    const first = this.bank.first(setId);
    if (!first) return false;
    const chain = this._take();
    if (!chain) return false;
    chain.route(opts.category || 'ambience');
    chain.busy = true;
    chain.priority = 1;
    chain.startedAt = this.clock.now();
    chain.endsAt = Infinity;
    chain.tag = id;
    chain.tracked = null;
    chain.voiceGain = null;
    chain.source = null;
    chain.setPosition(x, y, z);
    if (opts.reverb != null) chain.send.gain.value = opts.reverb;
    const loop = new LoopEmitter(this.ac, first.buffer, chain.input, {
      gain: 0, xf: opts.xf ?? 0.9, rate: opts.rate ?? 1,
    });
    loop.start();
    loop.volume = (opts.volume ?? 0.4) * (first.row.gain ?? 1);
    chain.loop = loop;
    this._live.set(id, { loop, chain, set: setId, x, y, z });
    return true;
  }

  has(id) { return this._live.has(id); }

  /** Fade one emitter out and hold its chain for exactly that fade. */
  retire(id, fade = 0.6) {
    const e = this._live.get(id);
    if (!e) return false;
    e.loop.stop(fade);
    e.chain.endsAt = this.clock.now() + fade + 0.1;
    this._live.delete(id);
    return true;
  }

  /** Retire everything whose id starts with `prefix` (e.g. all status loops). */
  retirePrefix(prefix, fade = 0.4) {
    let n = 0;
    for (const id of this._live.keys()) {
      if (id.startsWith(prefix)) { this.retire(id, fade); n++; }
    }
    return n;
  }

  retireAll(fade = 0.4) {
    let n = 0;
    for (const id of Array.from(this._live.keys())) { this.retire(id, fade); n++; }
    return n;
  }

  /**
   * Per-frame: hand back finished chains, keep every loop scheduled ahead, and
   * re-solve occlusion + distance against the listener. No allocation.
   */
  update(rdt, L, collision, nowMs, occA, occB) {
    this._sweep();
    if (!this._live.size) return;
    for (const e of this._live.values()) {
      e.loop.pump();
      const c = e.chain;
      if (occA) c.updateOcclusion(collision, L.x, L.y, L.z, nowMs, occA, occB);
      c.smoothOcclusion(rdt);
      c.applyDistance(L.x, L.y, L.z, L.fx, L.fy, L.fz);
    }
  }

  debug() {
    const out = {};
    for (const [id, e] of this._live) out[id] = { set: e.set, volume: +e.loop.volume.toFixed(3) };
    return { count: this._live.size, chains: this._chains.length, busy: this.busyChains, refused: this.refused, live: out };
  }
}
