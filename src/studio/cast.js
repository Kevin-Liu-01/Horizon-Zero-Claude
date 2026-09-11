/**
 * Studio cast director — spawn machines, force a state, and HOLD it.
 * Lane `studio` (`onboarding-loop-studio-cast-buttons`, gate A78).
 *
 * ROUND 3'S BUG, PRECISELY: the cast buttons called `machine.setState(name)`.
 * `setState` is the state machine's own SETTER — it writes `this.state` and
 * emits, and then the very next `Machine.update()` re-derives the state from
 * perception (`suspicion`, `_unseenT`, the leash) and threw it away. Pressing
 * "Attack" on a calm Watcher produced one frame of `attack` and 59 frames of
 * `patrol`; on film it did nothing at all.
 *
 * The fix is two things, not one:
 *
 *  1. `machine.forceState(name)` — the testability hook `machine-ai` publishes.
 *     Besides setting the state it wires the INPUTS that state's own exit tests
 *     read (suspicion, `_unseenT`, `lastKnown`, the attack cooldown) and routes
 *     the transient poses to their real owners (`ai.reactions._stagger`,
 *     `_down`, `_die`, `manager.override`).
 *
 *  2. A HOLD. `forceState` is a shove, not a clamp: `attack` still exits on
 *     `_unseenT > 4.5` (the player is 60 m away behind the camera in a photo
 *     shoot) and on the soft leash. So while a state is held the director
 *     re-pins those inputs every frame, re-homes the machine's leash anchor to
 *     where it stands, and re-issues `forceState` the moment the state drifts.
 *     Releasing the hold puts the anchor back and hands the machine to its AI.
 *
 * Nothing here writes to `src/entities/machines/**`; it is `forceState` plus the
 * documented perception fields that same hook already sets.
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();

/** Sustained states: re-asserted every frame while held. */
export const HOLD_STATES = ['patrol', 'suspicious', 'alert', 'search', 'attack', 'overridden'];
/** One-shot poses: fired once, never re-asserted (they resolve by design). */
export const SHOT_STATES = ['stagger', 'downed', 'dead'];

export const CAST_STATES = [
  { id: 'patrol', label: 'Patrol' },
  { id: 'suspicious', label: 'Suspicious' },
  { id: 'alert', label: 'Alert' },
  { id: 'search', label: 'Search' },
  { id: 'attack', label: 'Attack' },
  { id: 'stagger', label: 'Stagger' },
  { id: 'downed', label: 'Downed' },
  { id: 'dead', label: 'Death' },
  { id: 'overridden', label: 'Override' },
];

export class CastDirector {
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {object|null} the machine the panel acts on */
    this.target = null;
    this.locked = false;
    /** @type {{machine:object,state:string,home:THREE.Vector3|null,t:number}|null} */
    this.hold = null;
    this.lastError = null;
    this._spawned = [];
  }

  /* ------------------------------------------------------------- targeting */

  /** Machines the manager will construct — the Round 3 cast contract. */
  get kinds() { return this.ctx.machines?.kinds ?? []; }
  get canSpawn() { return typeof this.ctx.machines?.spawn === 'function'; }

  /** Live machines, nearest to `p` first. */
  _living() {
    const list = this.ctx.machines?.list ?? [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m && !m._disposed && m.position) out.push(m);
    }
    return out;
  }

  /**
   * Pick the machine nearest the camera's look ray (weighted so something the
   * lens is pointed at wins over something closer but off-frame).
   */
  pick(from, dir) {
    let best = null, bs = Infinity;
    for (const m of this._living()) {
      _v.copy(m.position).sub(from);
      const along = _v.dot(dir);
      if (along < -4) continue;                    // behind the lens
      const lateral = Math.sqrt(Math.max(0, _v.lengthSq() - along * along));
      const score = lateral * 2.2 + Math.abs(along) * 0.35;
      if (score < bs) { bs = score; best = m; }
    }
    return best;
  }

  /** Re-aim at whatever is in shot, unless the user locked the target. */
  retarget(from, dir) {
    if (this.locked && this.target && !this.target._disposed) return this.target;
    const m = this.pick(from, dir);
    if (m) this.target = m;
    else if (this.target?._disposed) this.target = null;
    return this.target;
  }

  setTarget(m) { this.target = m || null; return this.target; }
  cycle(step = 1) {
    const list = this._living();
    if (!list.length) return null;
    const i = Math.max(0, list.indexOf(this.target));
    this.target = list[(i + step + list.length) % list.length];
    this.locked = true;
    return this.target;
  }

  /* --------------------------------------------------------------- spawning */

  spawn(kind, x, z) {
    if (!this.canSpawn) { this.lastError = 'machines.spawn not available'; return null; }
    try {
      const m = this.ctx.machines.spawn(kind, x, z);
      if (m) { this._spawned.push(m); this.target = m; this.locked = true; }
      return m;
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      console.warn('[studio] spawn failed:', err);
      return null;
    }
  }

  /* ------------------------------------------------------------------ state */

  /**
   * Force a state on the cast target. Sustained states are HELD until released
   * or replaced; transient poses fire once.
   * @returns {{ok:boolean, detail:string, state?:string}}
   */
  setState(name, { hold = true } = {}) {
    const m = this.target;
    if (!m) return { ok: false, detail: 'no cast target' };
    if (typeof m.forceState !== 'function') return { ok: false, detail: 'machine has no forceState' };
    if (!m.alive && name !== 'dead') return { ok: false, detail: 'target is dead' };
    this.release();
    if (HOLD_STATES.includes(name) && hold) {
      const home = m.spawnPos ? m.spawnPos.clone() : null;
      // re-home the leash so a cast machine 200 m from its patrol cannot be
      // pulled out of `attack` by `engage.leashed()` mid-shot
      if (m.spawnPos) m.spawnPos.set(m.position.x, m.spawnPos.y, m.position.z);
      this.hold = { machine: m, state: name, home, t: 0, reforced: 0 };
      this._pin(m, name);
    }
    try {
      m.forceState(name);
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      console.warn('[studio] forceState failed:', err);
      return { ok: false, detail: this.lastError };
    }
    return { ok: true, detail: name, state: m.state };
  }

  /** Hand the held machine back to its own AI. */
  release() {
    const h = this.hold;
    if (!h) return;
    if (h.home && h.machine?.spawnPos) h.machine.spawnPos.copy(h.home);
    this.hold = null;
  }

  /**
   * Re-pin the perception inputs the held state's exit tests read. These are
   * exactly the fields `Machine.forceState` writes; the hold just keeps
   * writing them.
   */
  _pin(m, state) {
    const p = this.ctx.player;
    switch (state) {
      case 'attack':
      case 'alert':
        m.suspicion = 1;
        m._unseenT = 0;
        if (p && m.lastKnown) m.lastKnown.copy(p.position);
        break;
      case 'search':
        m.suspicion = 0.5;
        break;
      case 'suspicious':
        m.suspicion = 0.6;
        m._unseenT = 0;
        break;
      case 'patrol':
      case 'return':
        m.suspicion = 0;
        break;
      default:
        break;
    }
  }

  /** One frame of the hold. `dt` is SIM seconds (0 while the world is frozen). */
  update(dt) {
    const h = this.hold;
    if (!h) return;
    const m = h.machine;
    if (!m || m._disposed || (!m.alive && h.state !== 'dead')) { this.release(); return; }
    h.t += dt;
    this._pin(m, h.state);
    if (m.state !== h.state) {
      h.reforced++;
      try { m.forceState(h.state); } catch { this.release(); }
    }
  }

  /** Everything the studio staged, undone. */
  dispose() {
    this.release();
    this._spawned.length = 0;
    this.target = null;
    this.locked = false;
  }

  debug() {
    const m = this.target;
    return {
      target: m ? { kind: m.kind, state: m.state, alive: !!m.alive, hp: Math.round(m.health ?? 0) } : null,
      hold: this.hold ? { state: this.hold.state, held: +this.hold.t.toFixed(2), reforced: this.hold.reforced } : null,
      locked: this.locked,
      kinds: this.kinds,
      canSpawn: this.canSpawn,
      lastError: this.lastError,
    };
  }
}
