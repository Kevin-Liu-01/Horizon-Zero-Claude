import * as THREE from 'three';
import { perceptionCfg, NOISE } from './tables.js';
import { safeEmit } from './emit.js';

/**
 * Perception — the honest senses of a machine.
 *
 * Closes `machine-ai-03/04/05/06/12`, `stealth-hidden-radius-and-proximity-bubble`,
 * `stealth-omniscient-pursuit`, `stealth-hearing-stimuli`, `machine-ai-19`.
 *
 * What changed from Round 3, in one list:
 *  - detection FILLS over time as `f(1/d^2) * cone * pose * motion` instead of
 *    snapping to 1 the frame you enter the cone;
 *  - the 360-degree `dist < bodyRadius + 4` bubble is GONE. A short peripheral
 *    arc replaces it, and a machine keeps a real blind spot behind it;
 *  - crouching in tall grass collapses sight to ~1.6 m (was 8 m);
 *  - line of sight tests props/rocks/ruins through `ctx.collision.occluded`,
 *    not just the heightfield;
 *  - hearing arrives as STIMULI on a bus (footsteps, impacts, lures), each
 *    carrying its own position — so `lastKnown` is where the NOISE was, never
 *    where the player secretly is;
 *  - an unseen hit plants suspicion at the reconstructed SHOT ORIGIN.
 *
 * Nothing in here ever reads `player.position` to set `lastKnown` unless the
 * player was actually seen this tick. That single rule is the stealth pillar.
 */

const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Perception {
  constructor(machine) {
    this.m = machine;
    this.cfg = perceptionCfg(machine.kind);
    this.acc = Math.random() * this.cfg.tick;   // stagger the ticks
    this.scanT = Math.random() * this.cfg.scanPeriod;
    this.scanOffset = 0;
    this.visible = false;
    this.visibleT = 0;          // seconds of continuous sight
    this.lastSeenAt = -999;
    this.lastStimulus = null;   // { x, z, kind, t }
    this.hearAcc = 0;
    this._hearPos = new THREE.Vector3();
    this._hearStrength = 0;
    this._hearKind = null;
    this.omniActive = false;
    this._losT = 0;
    this._losCached = false;
    this._scanEmit = 0;
  }

  /**
   * The sweep is capped at half the focus half-angle: a machine's scan widens
   * where it is looking, it must never swing a target that is DEAD AHEAD out
   * of the cone (that would make detection stutter and `A39`'s 3-4 s curve
   * meaningless).
   */
  _sweepScale() {
    const cap = this.m.sightHalf * 0.5;
    const a = Math.abs(this.cfg.scanSweep) || 1e-6;
    return Math.min(1, cap / a);
  }

  /** Peripheral+focus cone weight for a bearing, 0 when it cannot be seen. */
  _coneWeight(dot, dist, hidden) {
    const c = this.cfg;
    const m = this.m;
    // focus cone: the machine's authored sight half-angle, plus the sweep
    const focus = Math.cos(Math.min(Math.PI, m.sightHalf + c.focusPad));
    if (dot >= focus) return 1;
    if (hidden && !c.hiddenPeriph) return 0;
    const range = hidden ? c.hiddenPeriph : c.periphRange;
    if (dist > range) return 0;
    const periph = Math.cos(THREE.MathUtils.degToRad(c.periphDeg));
    if (dot < periph) return 0;               // the blind spot behind it
    return c.periphWeight;
  }

  /** True when the machine's own sensors have an unobstructed line. */
  hasLOS(target) {
    const m = this.m;
    const ctx = m.ctx;
    const t = ctx.terrain;
    const y0 = m.position.y + m.eyeHeight;
    const y1 = target.y + this.cfg.targetEyeY;
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      const x = m.position.x + (target.x - m.position.x) * k;
      const z = m.position.z + (target.z - m.position.z) * k;
      if (t.getHeight(x, z) > y0 + (y1 - y0) * k + 1.2) return false;
    }
    // machine-ai-04: trunks, big rocks, ruins and tents break the sightline
    const C = ctx.collision;
    if (C && C.occluded) {
      _eye.set(m.position.x, y0, m.position.z);
      _tgt.set(target.x, y1, target.z);
      if (C.occluded(_eye, _tgt)) return false;
    }
    return true;
  }

  /** Motion multiplier from the player's own speed. */
  _motion(p) {
    const c = this.cfg;
    const s = p.moveSpeed ?? 0;
    if (s < 0.5) return c.motionStill;
    if (s < 4.2) return c.motionWalk;
    return c.motionRun;
  }

  /** A stimulus reached this machine (footstep, impact, lure, alarm). */
  hear(x, z, strength, kind) {
    if (strength <= this._hearStrength && this._hearKind !== 'lure') return;
    this._hearPos.set(x, 0, z);
    this._hearStrength = Math.max(this._hearStrength, strength);
    this._hearKind = kind;
  }

  /**
   * `machine-ai-03` — a hit the machine did not see points it at the SHOT
   * ORIGIN with partial suspicion. It never reveals the player's position.
   */
  unseenHit(ox, oz, strengthScale = 1) {
    const c = this.cfg;
    const m = this.m;
    const j = c.unseenJitter;
    m.lastKnown.set(
      ox + (Math.random() - 0.5) * 2 * j, 0,
      oz + (Math.random() - 0.5) * 2 * j,
    );
    m.lastKnown.y = m.ctx.terrain.getHeight(m.lastKnown.x, m.lastKnown.z);
    m.suspicion = Math.max(m.suspicion, c.unseenHit * strengthScale);
    m._unseenT = 0.001;
    this.lastStimulus = { x: m.lastKnown.x, z: m.lastKnown.z, kind: 'hit' };
  }

  /** Omnidirectional sensor (Thunderjaw radar) — canon, per species. */
  _omni(dist) {
    const o = this.cfg.omni;
    if (!o) return 0;
    if (o.part) {
      let ok = false;
      for (const p of this.m.parts) {
        if (p.name === o.part) { ok = p.attached; break; }
      }
      if (!ok) return 0;
    }
    return dist <= o.radius ? o.weight : 0;
  }

  update(dt) {
    const m = this.m;
    const c = this.cfg;
    const p = m.ctx.player;

    // sensor sweep: the cone itself scans while the machine is calm, which is
    // what stops the peripheral arc from being a static bubble
    const calm = m.state === 'patrol' || m.state === 'return' || m.state === 'suspicious';
    this.scanT += dt;
    const want = calm ? Math.sin((this.scanT / c.scanPeriod) * Math.PI * 2) * c.scanSweep : 0;
    this.scanOffset = THREE.MathUtils.damp(this.scanOffset, want, 4, dt);
    m.scanOffset = this.scanOffset;
    if (calm && !m.lowLOD) {
      this._scanEmit -= dt;
      if (this._scanEmit <= 0) {
        this._scanEmit = c.scanPeriod * 0.5;
        safeEmit(m.ctx, 'machine-scan', { machine: m, sweep: this.scanOffset });
      }
    }

    this.acc += dt;
    if (this.acc < c.tick) return;
    const pd = this.acc;
    this.acc = 0;

    let visible = false;
    let fill = 0;
    let dist = 999;

    if (p && p.health > 0 && m.alive) {
      _d.set(p.position.x - m.position.x, 0, p.position.z - m.position.z);
      dist = Math.hypot(_d.x, _d.z);
      m.playerDist = dist;

      const hidden = !!(p.crouching && p.inTallGrass);
      const omniW = this._omni(dist);
      const ignoreStealth = omniW > 0 && c.omni && c.omni.ignoreStealth;
      const maxSee = (hidden && !ignoreStealth) ? c.hiddenRange : m.sightRange;

      if (dist < maxSee || omniW > 0) {
        let w = 0;
        if (dist < maxSee) {
          const dir = m.heading + this.scanOffset * this._sweepScale();
          const fx = Math.sin(dir), fz = Math.cos(dir);
          const dot = dist > 0.01 ? (_d.x * fx + _d.z * fz) / dist : 1;
          w = this._coneWeight(dot, dist, hidden && !ignoreStealth);
          /**
           * Engaged contact (see PERCEPTION.engagedRange in ai/tables.js): a
           * machine that is ALREADY in the fight does not lose a player it is
           * grappling with just because its body swung past her. Gated on
           * `attack` state, so it can never START a detection, and still LOS-
           * gated below — the stealth pillar (cone + build-up + occluders +
           * grass) is exactly as it was for every machine that has not yet
           * found her.
           */
          if (m.state === 'attack' && dist <= c.engagedRange) {
            const gw = c.engagedWeight ?? 1;
            if (gw > w) w = gw;
          }
        }
        if (omniW > w) w = omniW;
        if (w > 0 && this.hasLOS(p.position)) {
          visible = true;
          const pose = p.crouching ? c.poseCrouch : c.poseStand;
          const dd = dist / c.d0;
          fill = (c.gain / (1 + dd * dd)) * w * pose * this._motion(p);
        }
      }
    }

    if (visible) {
      m.suspicion = Math.min(1.25, m.suspicion + fill * pd);
      m.lastKnown.copy(p.position);
      m._unseenT = 0;
      this.visibleT += pd;
      this.lastSeenAt = m._stateT;
      this.lastStimulus = null;
    } else {
      this.visibleT = 0;
      m._unseenT += pd;
      if (this._hearStrength > 0) {
        // hearing raises suspicion toward — but never past — the alert line
        const cap = m.state === 'attack' ? 1.25 : c.hearCap;
        m.suspicion = Math.min(cap, m.suspicion + c.hearGain * this._hearStrength * pd);
        if (m.suspicion < c.alertAt || this._hearKind === 'lure') {
          m.lastKnown.copy(this._hearPos);
          m.lastKnown.y = m.ctx.terrain.getHeight(m.lastKnown.x, m.lastKnown.z);
        }
        this.lastStimulus = { x: this._hearPos.x, z: this._hearPos.z, kind: this._hearKind };
        if (m.state === 'attack') m._unseenT = Math.min(m._unseenT, 1.5);
      } else {
        const rate = m.state === 'search' || m.state === 'suspicious' ? c.decay : c.decayCalm;
        m.suspicion = Math.max(0, m.suspicion - rate * pd);
      }
    }
    this._hearStrength = 0;
    this._hearKind = null;
    this.visible = visible;
    m._visible = visible;
    m.detectFill = fill;
  }
}

/** Player locomotion noise profile for the stimulus bus. */
export function playerNoise(p) {
  const n = NOISE.player;
  const s = p.moveSpeed ?? 0;
  if (s < n.minSpeed) return null;
  if (p.crouching) return n.crouch;
  if (s > 7) return n.sprint;
  if (s > 4.2) return n.jog;
  return n.walk;
}
