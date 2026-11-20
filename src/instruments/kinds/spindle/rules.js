import { ST, STATUS } from '../../../combat/status.js';
import { SPINDLE_STAFF_M } from './form.js';
import { SPINDLE_CUES } from './cues.js';

/**
 * THE SPINDLE'S RULES (M3 wave 1, area C; bible §7.4 #6; row IK5 of the M3 brief). Simulation time, no three and no
 * scene: the Node rows (tools/gates/instruments/m3/spindle.test.mjs) and the live kind run the same code. Numbers
 * marked * are starting values.
 *
 * THE RING. While it spins it deflects arrows that come at it from the front (inside `deflectArcDeg` about its facing);
 * from behind they strike. Its answer to the statuses (the typed seam of src/combat/status.js, `onStatus`):
 *   Brine  (Seized)   the ring turns at half speed while the status lasts (it still deflects)
 *   Dust   (Clouded)  the ring STOPS and the hub bearing is exposed for `dustStopS` (2.0 s); a stopped ring deflects
 *                     nothing. Then it spins up again (the lamp stays dark the status' 6 s).
 * THE STAFF THRUST. A `thrustWindupS` wind-up, then a dash of `thrustDashM` on the locked heading; the 3 m staff leads,
 * so the tip reaches `thrustReachM` (9 m) from where it began. It strikes what its tip passes within `thrustHitR` of.
 * THE ESCORT. It holds `escortMin`-`escortMax` m (6-9) from what it escorts, on the side toward the threat.
 */

export const SPINDLE_RULES = Object.freeze({
  spinRps: 1.2,                         // * full speed, turns a second
  brineK: 0.5,                          // IK5: Brine slows it to half speed*
  dustStopS: 2.0,                       // IK5: Dust stops it and exposes the bearing 2.0 s +-0.2
  deflectArcDeg: 120,                   // * the frontal arc (whole) the spinning ring covers
  thrustWindupS: 0.6,                   // * a wind-up she can read (KT9's scripted source used 0.6 s)
  thrustDashS: 0.35,                    // *
  staffM: SPINDLE_STAFF_M,
  thrustReachM: 9.0,                    // IK5
  thrustDashM: 9.0 - SPINDLE_STAFF_M,   // the dash the body makes; the staff makes the rest
  thrustHitR: 0.6,                      // * how near the tip's path counts as struck
  thrustDmg: 30,                        // * (KT9's scripted thrust)
  escortMin: 6, escortMax: 9, escortMid: 7.5,
  walk: 1.6, run: 4.5,                  // * m/s
});

const DEG = Math.PI / 180;

/** The ring's spin and its answer to Brine and Dust. */
export class SpindleRing {
  constructor() { this.slowT = 0; this.stopT = 0; this.speedK = 1; this.angle = 0; this.stops = 0; this.state = 'spinning'; this.events = []; }

  /** Its state ('spinning' | 'slowed' | 'stopped'); each change is an event with its cue id (./cues.js, IK8). */
  _to(st) {
    if (st === this.state) return;
    this.events.push({ type: 'state', from: this.state, to: st, cue: SPINDLE_CUES.state[st] ?? null });
    this.state = st;
    if (st === 'stopped') this.events.push({ type: 'bearing-exposed', cue: SPINDLE_CUES.event['bearing-exposed'] });
  }

  get spinning() { return this.speedK > 0; }
  /** IK5: the hub bearing is exposed exactly while the ring is stopped by Dust. */
  bearingExposed() { return this.stopT > 0; }

  /** The status seam (src/combat/status.js StatusAware.onStatus): Brine slows, Dust stops. */
  onStatus(id, seconds) {
    if (id === ST.blind) { this.stopT = SPINDLE_RULES.dustStopS; this.stops++; this.speedK = 0; this._to('stopped'); }
    else if (id === ST.lock) { this.slowT = Math.max(this.slowT, seconds ?? STATUS[ST.lock].seconds); if (this.stopT <= 0) { this.speedK = SPINDLE_RULES.brineK; this._to('slowed'); } }
  }

  step(dt) {
    if (this.stopT > 0) this.stopT = Math.max(0, this.stopT - dt);
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - dt);
    this.speedK = this.stopT > 0 ? 0 : this.slowT > 0 ? SPINDLE_RULES.brineK : 1;
    this._to(this.stopT > 0 ? 'stopped' : this.slowT > 0 ? 'slowed' : 'spinning');
    this.angle += this.speedK * SPINDLE_RULES.spinRps * 2 * Math.PI * dt;
  }

  /** Does the ring deflect an arrow arriving from offset (dx, dz) (the shooter's offset from the Spindle)? */
  deflects(heading, dx, dz) {
    if (!this.spinning) return false;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return false;
    const c = (Math.sin(heading) * dx + Math.cos(heading) * dz) / d;
    return c >= Math.cos(SPINDLE_RULES.deflectArcDeg * 0.5 * DEG);
  }
}

/** The staff thrust on sim time: `start(x, z, heading)`, `step(dt)`, `tip()`, `struck(px, pz)`. */
export class SpindleThrust {
  constructor() { this.phase = null; this.t = 0; this.x0 = 0; this.z0 = 0; this.heading = 0; this.dashed = 0; this._hit = false; this.events = []; }
  get busy() { return this.phase !== null; }
  /** Each phase it enters is an event with its cue id (./cues.js, IK8); back to rest is 'rest'. */
  _phase(p) { this.events.push({ type: 'state', from: this.phase ?? 'rest', to: p ?? 'rest', cue: SPINDLE_CUES.state[p ?? 'rest'] ?? null }); this.phase = p; }
  start(x, z, heading) {
    if (this.phase) return false;
    this._phase('windup'); this.t = 0; this.x0 = x; this.z0 = z; this.heading = heading; this.dashed = 0; this._hit = false;
    return true;
  }
  /** The body's place (along the locked heading). */
  body() { return { x: this.x0 + Math.sin(this.heading) * this.dashed, z: this.z0 + Math.cos(this.heading) * this.dashed }; }
  /** The staff's tip (the staff leads by its length, level with the dash). */
  tip() { const L = this.dashed + SPINDLE_RULES.staffM; return { x: this.x0 + Math.sin(this.heading) * L, z: this.z0 + Math.cos(this.heading) * L, reach: L }; }
  step(dt) {
    const R = SPINDLE_RULES;
    if (!this.phase) return null;
    this.t += dt;
    if (this.phase === 'windup') { if (this.t >= R.thrustWindupS) { this._phase('dash'); this.t = 0; return 'dash'; } return null; }
    if (this.phase === 'dash') {
      this.dashed = Math.min(R.thrustDashM, this.dashed + (R.thrustDashM / R.thrustDashS) * dt);
      if (this.dashed >= R.thrustDashM - 1e-9) { this._phase('recover'); this.t = 0; return 'reach'; }
      return null;
    }
    if (this.phase === 'recover' && this.t >= 0.5) { this._phase(null); return 'done'; }
    return null;
  }
  /**
   * Does the tip strike a target of body radius `bodyR` at (px, pz) now (once per thrust)? Only in the dash and its
   * last step: the tip must have reached the target's near surface, and the target stand within `thrustHitR` of the line.
   */
  struck(px, pz, bodyR = 0.3) {
    if (this._hit || !(this.phase === 'dash' || (this.phase === 'recover' && this.t === 0))) return false;
    const tp = this.tip(), s = Math.sin(this.heading), c = Math.cos(this.heading), hr = SPINDLE_RULES.thrustHitR;
    const dx = px - this.x0, dz = pz - this.z0;
    const along = dx * s + dz * c, across = Math.abs(dx * c - dz * s);
    if (along < 0 || along - bodyR > tp.reach + 1e-9 || across > hr + bodyR) return false;
    this._hit = true;
    this.events.push({ type: 'thrust-hit', cue: SPINDLE_CUES.event['thrust-hit'] });
    return true;
  }
}

/**
 * THE ESCORT: where it wants to stand, `escortMid` from the ward toward the threat (or behind the ward's right
 * shoulder with no threat), and one step toward it.
 */
export function escortTarget(ward, threat, out = { x: 0, z: 0 }) {
  const R = SPINDLE_RULES;
  let ux, uz;
  if (threat) { ux = threat.x - ward.x; uz = threat.z - ward.z; }
  else { const h = (ward.heading ?? 0) + Math.PI * 0.75; ux = Math.sin(h); uz = Math.cos(h); }
  const L = Math.hypot(ux, uz) || 1;
  out.x = ward.x + (ux / L) * R.escortMid; out.z = ward.z + (uz / L) * R.escortMid;
  return out;
}

export class SpindleEscort {
  constructor({ x = 0, z = 0 } = {}) { this.x = x; this.z = z; this._t = { x: 0, z: 0 }; }
  step(dt, ward, threat) {
    const R = SPINDLE_RULES, t = escortTarget(ward, threat, this._t);
    const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) { const s = Math.min(d, R.run * dt); this.x += (dx / d) * s; this.z += (dz / d) * s; }
    return Math.hypot(this.x - ward.x, this.z - ward.z);
  }
}
