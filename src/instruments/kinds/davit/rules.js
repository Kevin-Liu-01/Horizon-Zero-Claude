import { reseat } from '../../lib/kindkit.js';
import { DAVIT_CUES } from './cues.js';

/**
 * THE DAVIT'S RULES (M3 wave 1, area C; bible §7.4 #7; row IK6 of the M3 brief). Simulation time, no scene: the Node
 * rows (tools/gates/instruments/m3/davit.test.mjs) and the live kind run the same code. Numbers marked * are starting
 * values.
 *
 * THE REPAIR. It walks to the nearest Instrument with a hit part `off`, and once within `reachM` of it re-seats that
 * part from its rack in `reseatS` (4.0 s), through the hit-parts seam's `reseat(part)` (src/instruments/lib/kindkit.js:
 * `off` -> `sealed`). Each repair takes one plate off the rack. Moving out of reach starts the 4 s over.
 * THE RACK. Three plates, countable; one fewer per repair and per plate shot off. No plate, no repair.
 * THE WINCH DRUM. Its weak point: Pried (`off`), it makes no more repairs.
 * THE FOLLOW. With no repair to make it keeps `followM` (about 20 m) behind the nearest large kind (behind its heading).
 */

export const DAVIT_RULES = Object.freeze({
  reseatS: 4.0,                 // IK6: 4.0 s +-0.3
  reachM: 3.5,                  // * the crane arms' reach from its centre
  plates: 3,
  walk: 1.6,                    // * m/s
  followM: 20, followTolM: 3,   // IK6: about 20 m behind a large kind
});

/** The parts of an Instrument that are `off` (records of the hit-parts seam), as [name, record] pairs. */
const offParts = (inst) => Object.entries(inst?.parts || {}).filter(([, p]) => p && p.state === 'off');

export class DavitBrain {
  constructor({ x = 0, z = 0, heading = 0 } = {}) {
    this.x = x; this.z = z; this.heading = heading;
    this.plates = DAVIT_RULES.plates;
    this.winch = { state: 'sealed', hits: 0 };   // the weak point: Pried -> 'off'
    this.job = null;                             // { inst, name, part, t }
    this.repairs = 0;
    /** 'idle' | 'following' | 'to-repair' | 'reseating' | 'spent' (no plate or the winch Pried) */
    this.state = 'idle';
    this.events = [];
  }

  /** Every event carries its cue id (./cues.js: the Cues seam; IK8), and every state change is an event. */
  _ev(type, p) { this.events.push({ type, ...(p || {}), cue: DAVIT_CUES.event[type] ?? null }); }
  _set(s) { if (s === this.state) return; this.events.push({ type: 'state', from: this.state, to: s, cue: DAVIT_CUES.state[s] ?? null }); this.state = s; }

  /** Can it make a repair now? */
  canRepair() { return this.winch.state !== 'off' && this.plates > 0; }

  /** A plate shot off the rack: one fewer repair. */
  shootPlate() { if (this.plates <= 0) return false; this.plates--; this._ev('plate-off', { left: this.plates }); return true; }

  /** A Pry on the winch drum: no repairs after. */
  pryWinch() { if (this.winch.state === 'off') return false; this.winch.state = 'off'; this.job = null; this._ev('winch-off'); return true; }

  _walkTo(tx, tz, dt, stopAt = 0) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d <= stopAt + 1e-9) return d;
    this.heading = Math.atan2(dx, dz);
    const s = Math.min(DAVIT_RULES.walk * dt, d - stopAt);
    this.x += (dx / d) * s; this.z += (dz / d) * s;
    return d - s;
  }

  /**
   * Sim time. `world.instruments` = [{ id, x, z, heading, large, alive, parts: { name: { state } } }] (the Davit's own
   * record is never in it). Events of the step in `this.events`.
   */
  step(dt, world = {}) {
    this._set(this._step(dt, world));
  }

  _step(dt, world) {
    const R = DAVIT_RULES, list = (world.instruments || []).filter((i) => i && i.alive !== false);
    const J = this.job;
    if (J && (!list.includes(J.inst) || J.part.state !== 'off' || !this.canRepair())) this.job = null;
    if (!this.job && this.canRepair()) {
      let best = null, bd = Infinity;
      for (const inst of list) {
        const off = offParts(inst);
        if (!off.length) continue;
        const d = Math.hypot(inst.x - this.x, inst.z - this.z);
        if (d < bd) { bd = d; best = { inst, name: off[0][0], part: off[0][1], t: 0 }; }
      }
      if (best) { this.job = best; this._ev('repair-start', { kind: best.inst.id, part: best.name }); }
    }
    if (this.job) {
      const j = this.job;
      const left = this._walkTo(j.inst.x, j.inst.z, dt, R.reachM);
      if (left > R.reachM + 1e-6) { j.t = 0; return 'to-repair'; }   // out of reach: the 4 s start over
      j.t += dt;
      if (j.t >= R.reseatS - 1e-9) {
        if (reseat(j.part)) { this.plates--; this.repairs++; this._ev('reseated', { kind: j.inst.id, part: j.name, t: +j.t.toFixed(3), plates: this.plates }); }
        this.job = null;
      }
      return this.job ? 'reseating' : (this.canRepair() ? 'idle' : 'spent');
    }
    // no repair: keep followM behind the nearest large kind
    let lead = null, ld = Infinity;
    for (const inst of list) { if (!inst.large) continue; const d = Math.hypot(inst.x - this.x, inst.z - this.z); if (d < ld) { ld = d; lead = inst; } }
    if (lead) {
      const h = lead.heading ?? 0;
      this._walkTo(lead.x - Math.sin(h) * R.followM, lead.z - Math.cos(h) * R.followM, dt, 0.5);
      return this.canRepair() ? 'following' : 'spent';
    }
    return this.canRepair() ? 'idle' : 'spent';
  }
}
