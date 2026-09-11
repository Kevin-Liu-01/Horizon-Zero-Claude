/**
 * 3D spatialisation (`audio-05`) — PannerNode positioning, distance-driven
 * air absorption, a reverb send, and geometric occlusion through
 * `ctx.collision.occluded()`.
 *
 * The old build panned with a `StereoPannerNode` and a hand-rolled
 * `1 - d/40` falloff: everything sat on a flat line in front of the camera and
 * a Thunderjaw 200 m away was as loud as one at 45 m. Every voice now runs
 * through this chain:
 *
 *   input ─ occLP ─ panner ─┬─ dry  ─→ sfx/amb/voice bus
 *                           └─ send ─→ reverbSend
 *
 *  - `panner` owns distance: HRTF panning + an inverse distance model, so
 *    front-right and back-right are audibly different positions (equalpower
 *    folds them onto the same gains — that is why HRTF is not optional here).
 *  - `occLP` is one filter doing two jobs: distance air-absorption
 *    (`AIR_HALF_DISTANCE`) multiplied by an occlusion factor that closes when
 *    `collision.occluded()` says a trunk or a ruin is in the way.
 *  - `send` rises with distance and with occlusion — a machine behind a rock
 *    is not just quieter, it is *further into the room*.
 *
 * Chains are pooled. Playing a one-shot allocates exactly one
 * AudioBufferSourceNode (unavoidable — they are single-use) and nothing else.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Distance at which the air-absorption low-pass halves its cutoff. */
export const AIR_HALF_DISTANCE = 26;
export const REF_DISTANCE = 2.0;
export const ROLLOFF = 0.9;
export const MAX_DISTANCE = 600;

/** Cutoff for a source `d` metres away with occlusion factor `occ` (0..1). */
export function airCutoff(d, occ = 0) {
  const open = 21000 * Math.pow(0.5, d / AIR_HALF_DISTANCE);
  const closed = 520 * Math.pow(0.5, d / (AIR_HALF_DISTANCE * 4));
  return clamp(open * (1 - occ) + closed * occ, 180, 21000);
}

/** Point the Web Audio listener at the render camera. Called once per frame. */
export function syncListener(ac, camera, scratch) {
  const L = ac.listener;
  if (!L) return;
  const p = camera.position;
  const e = camera.matrixWorld.elements;
  // three.js camera looks down local -Z; column 1 is up, column 2 is +Z.
  const fx = -e[8]; const fy = -e[9]; const fz = -e[10];
  const ux = e[4]; const uy = e[5]; const uz = e[6];
  if (L.positionX) {
    // plain .value, not setValueAtTime: this runs 60x a second for the whole
    // session and an automation timeline that long is pure garbage
    L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
    L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
    L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
  } else {
    // deprecated path — still the only one in older Safari
    L.setPosition(p.x, p.y, p.z);
    L.setOrientation(fx, fy, fz, ux, uy, uz);
  }
  if (scratch) {
    scratch.x = p.x; scratch.y = p.y; scratch.z = p.z;
    scratch.fx = fx; scratch.fy = fy; scratch.fz = fz;
  }
}

/**
 * One reusable spatial voice. Built once, re-pointed forever — the graph nodes
 * are never re-created, which is what keeps a 24-voice combat mix off the
 * allocator.
 */
export class SpatialChain {
  constructor(buses, { panningModel = 'HRTF' } = {}) {
    const ac = buses.ac;
    this.ac = ac;
    this.buses = buses;

    this.input = ac.createGain();
    this.input.gain.value = 1;

    this.occLP = ac.createBiquadFilter();
    this.occLP.type = 'lowpass';
    this.occLP.frequency.value = 21000;
    this.occLP.Q.value = 0.4;

    this.panner = ac.createPanner();
    this.panner.panningModel = panningModel;
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = REF_DISTANCE;
    this.panner.rolloffFactor = ROLLOFF;
    this.panner.maxDistance = MAX_DISTANCE;
    this.panner.coneInnerAngle = 360;

    this.dry = ac.createGain();
    this.send = ac.createGain();
    this.send.gain.value = 0.1;

    this.input.connect(this.occLP);
    this.occLP.connect(this.panner);
    this.panner.connect(this.dry);
    this.panner.connect(this.send);
    this.send.connect(buses.reverbSend);

    this._category = null;
    this._dest = null;
    /**
     * Per-playback gain, in front of `input`. It exists so a steal can fade the
     * OLD source without touching the new one: `input` is shared by every
     * playback this chain has ever hosted, so ducking it would silence the
     * incoming sound too — and cancelling the fade to make room for the new
     * sound would leave the stolen one blaring at full level until it ended.
     */
    this.voiceGain = null;
    this.source = null;
    this.busy = false;
    this.endsAt = 0;
    this.priority = 0;
    this.startedAt = 0;
    this.tag = '';

    // occlusion state (smoothed, so a machine walking behind a pine fades)
    this.occ = 0;
    this._occTarget = 0;
    this._occNext = 0;
    this.x = 0; this.y = 0; this.z = 0;
    this.dist = 0;
    this.rear = 0;
    this.tracked = null;   // optional { position } followed each frame
  }

  /** Route the dry path at the bus for this category (idempotent). */
  route(category) {
    const dest = this.buses.dryFor(category);
    if (dest === this._dest) return;
    if (this._dest) { try { this.dry.disconnect(this._dest); } catch { /* already gone */ } }
    this.dry.connect(dest);
    this._dest = dest;
    this._category = category;
  }

  setPosition(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    const p = this.panner;
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
  }

  /**
   * Re-derive the distance filter, the head-shadow tilt and the reverb send.
   * `lx/ly/lz` is the listener; `fx/fy/fz` is where it is looking.
   *
   * The rear tilt is not decoration. An HRTF panner separates left from right
   * beautifully and front from back barely at all — that is the well-known
   * front/back confusion of a generic HRTF, and in a game it means an arrow
   * loosed behind you sounds like one in front of you. Real ears solve it with
   * pinna shadowing: sources behind the head lose their top octaves and a
   * little level. That is exactly what this does, and it is what makes a
   * machine circling you legible without looking.
   */
  applyDistance(lx, ly, lz, fx = 0, fy = 0, fz = -1) {
    const dx = this.x - lx; const dy = this.y - ly; const dz = this.z - lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.dist = d;
    const inv = d > 1e-4 ? 1 / d : 0;
    const cosA = clamp((dx * fx + dy * fy + dz * fz) * inv, -1, 1);
    const rear = (1 - cosA) * 0.5;           // 0 dead ahead, 1 dead behind
    this.rear = rear;
    this.occLP.frequency.value = airCutoff(d, this.occ) * (1 - 0.55 * rear);
    // more send with distance, and more again when the direct path is blocked
    this.send.gain.value = clamp(0.06 + d / 260, 0, 0.42) * (1 + this.occ * 0.9);
    // occlusion and the head shadow both cost direct level, not only brightness
    this.dry.gain.value = (1 - this.occ * 0.55) * (1 - 0.16 * rear);
    return d;
  }

  /** Throttled line-of-sight test; `spread` staggers chains across frames. */
  updateOcclusion(collision, lx, ly, lz, nowMs, a, b) {
    if (!collision || !collision.occluded) { this._occTarget = 0; return; }
    if (nowMs >= this._occNext) {
      this._occNext = nowMs + 110 + Math.random() * 60;
      a.set(lx, ly, lz);
      b.set(this.x, this.y, this.z);
      let blocked = false;
      try { blocked = !!collision.occluded(a, b); } catch { blocked = false; }
      this._occTarget = blocked ? 1 : 0;
    }
  }

  smoothOcclusion(rdt) {
    if (this.occ !== this._occTarget) {
      this.occ += (this._occTarget - this.occ) * Math.min(1, rdt * 7);
      if (Math.abs(this.occ - this._occTarget) < 0.01) this.occ = this._occTarget;
    }
  }

  reset() {
    this.busy = false;
    this.tracked = null;
    this.tag = '';
    this.priority = 0;
    this.occ = 0; this._occTarget = 0; this._occNext = 0;
    this.voiceGain = null;
    this.source = null;
    this.input.gain.value = 1;
  }
}

/**
 * Priority voice pool (`audio-14`). Cheap sounds never starve a Thunderjaw
 * roar: at the cap the pool steals the oldest *lower-priority* chain and fades
 * it out in 25 ms rather than cutting it, and refuses the new sound outright
 * if nothing quieter is playing.
 */
export class SpatialPool {
  constructor(buses, { size = 28 } = {}) {
    this.buses = buses;
    this.chains = [];
    for (let i = 0; i < size; i++) {
      // HRTF for the first 16 (the ones close enough to matter), equalpower
      // beyond — HRTF convolution is the single most expensive node we use.
      this.chains.push(new SpatialChain(buses, { panningModel: i < 16 ? 'HRTF' : 'equalpower' }));
    }
    this.stolen = 0;
    this.refused = 0;
    this.peak = 0;
  }

  /** @returns {SpatialChain|null} */
  acquire(priority, nowCtx) {
    let free = null;
    let victim = null;
    let active = 0;
    for (let i = 0; i < this.chains.length; i++) {
      const c = this.chains[i];
      if (c.busy && c.endsAt <= nowCtx) c.reset();
      if (!c.busy) { if (!free) free = c; continue; }
      active++;
      if (c.priority < priority
        && (!victim || c.priority < victim.priority
          || (c.priority === victim.priority && c.startedAt < victim.startedAt))) {
        victim = c;
      }
    }
    if (active + 1 > this.peak) this.peak = active + 1;
    if (free) return free;
    if (victim) {
      this.stolen++;
      const g = victim.voiceGain && victim.voiceGain.gain;
      if (g) {
        try {
          g.cancelScheduledValues(nowCtx);
          g.setValueAtTime(g.value, nowCtx);
          g.linearRampToValueAtTime(0, nowCtx + 0.025);
        } catch { /* offline contexts can refuse a past time */ }
      }
      try { victim.source?.stop(nowCtx + 0.04); } catch { /* already stopped */ }
      victim.busy = false;
      victim.tracked = null;
      victim.voiceGain = null;
      victim.source = null;
      return victim;
    }
    this.refused++;
    return null;
  }

  activeCount(nowCtx) {
    let n = 0;
    for (const c of this.chains) if (c.busy && c.endsAt > nowCtx) n++;
    return n;
  }
}

/**
 * Seamlessly looped bed. Opus decodes with encoder padding, so a plain
 * `loop = true` clicks every pass; two staggered sources crossfading over
 * `xf` seconds do not. Used for ambience beds and machine servo loops.
 */
export class LoopEmitter {
  constructor(ac, buffer, dest, { gain = 0.2, xf = 1.1, rate = 1 } = {}) {
    this.ac = ac;
    this.buffer = buffer;
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.target = gain;
    this.xf = Math.min(xf, buffer.duration * 0.35);
    this.rate = rate;
    this._sources = [];
    this._next = 0;
    this.playing = false;
  }

  start(when = 0) {
    if (this.playing) return;
    this.playing = true;
    this._next = Math.max(when, this.ac.currentTime) + 0.02;
    this._schedule();
    this._schedule();
  }

  _schedule() {
    const dur = this.buffer.duration;
    const t = this._next;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + this.xf);
    g.gain.setValueAtTime(1, t + dur - this.xf);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out);
    const s = this.ac.createBufferSource();
    s.buffer = this.buffer;
    s.playbackRate.value = this.rate;
    s.connect(g);
    s.start(t);
    s.stop(t + dur + 0.05);
    s.onended = () => { try { g.disconnect(); } catch { /* torn down */ } };
    this._sources.push({ s, g, until: t + dur });
    this._next = t + dur - this.xf;
  }

  /** Keep two sources in flight; call from the audio system's update(). */
  pump(lookahead = 1.5) {
    if (!this.playing) return;
    const now = this.ac.currentTime;
    // A backgrounded tab freezes update(); without this the catch-up loop
    // schedules every missed pass at a start time in the past, and Web Audio
    // fires all of them at once — a bed that has been idle for a minute would
    // come back as a wall of overlapping copies.
    if (this._next < now - 0.25) this._next = now + 0.02;
    let guard = 0;
    while (this._next < now + lookahead && guard++ < 4) this._schedule();
    for (let i = this._sources.length - 1; i >= 0; i--) {
      if (this._sources[i].until < now - 0.5) this._sources.splice(i, 1);
    }
  }

  set volume(v) {
    // only schedule on a real change: the bed selector re-asserts this twice a
    // second, and an unconditional setTargetAtTime would pile thousands of
    // automation events onto the param over a long session
    if (Math.abs(v - this.target) < 1e-4) return;
    this.target = v;
    this.out.gain.setTargetAtTime(v, this.ac.currentTime, 0.25);
  }

  get volume() { return this.target; }

  stop(fade = 0.6) {
    if (!this.playing) return;
    this.playing = false;
    const now = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0.0001, now + fade);
    for (const e of this._sources) { try { e.s.stop(now + fade + 0.05); } catch { /* already stopped */ } }
    this._sources.length = 0;
  }

  /**
   * Unhook from the graph. `stop()` only fades — it deliberately leaves `out`
   * connected so the tail can play — so whoever recycles the destination chain
   * must call this once the tail is done, or the dead emitter's gain node
   * stays wired to a chain that now belongs to a different machine.
   */
  dispose() {
    this.stop(0);
    for (const e of this._sources) {
      try { e.s.stop(); } catch { /* already stopped */ }
      try { e.g.disconnect(); } catch { /* torn down */ }
    }
    this._sources.length = 0;
    try { this.out.disconnect(); } catch { /* torn down */ }
    this.disposed = true;
  }
}
