import * as THREE from 'three';
import { reactCfg, span, REACT } from './tables.js';
import { safeEmit } from './emit.js';

/**
 * Hit reactions — `combat-machine-no-flinch`, `machine-ai-10`.
 *
 * A hit that matters now interrupts the machine. Three tiers:
 *   flinch  (> 4 % maxHP)  — a `_react` impulse the rig reads, no state change
 *   stagger (> 12 % maxHP, or ANY component torn) — the current attack is
 *           cancelled, the machine is planted for 0.6-1.2 s, `machine-stagger`
 *           fires and the body is shoved along the hit direction
 *   downed  (> 30 % maxHP in one hit, or 3 staggers inside 8 s) — it goes to
 *           the ground for 3.5-5 s and a CRITICAL HIT prompt appears on it
 *
 * `machine._react` is published for `machine-rig`: `{ x, y, z, k, t }` where
 * `x/y/z` is the world-space push direction, `k` decays 1 -> 0 and `t` is the
 * seconds since the hit. Pose channels read it; nothing here touches bones.
 */

const _v = new THREE.Vector3();

export class Reactions {
  constructor(machine) {
    this.m = machine;
    this.cfg = reactCfg(machine.kind);
    this.staggerT = 0;
    this.downedT = 0;
    this.cdT = 0;
    this.history = [];         // recent stagger timestamps
    this.resumeState = 'attack';
    this.crit = null;          // the CRITICAL HIT interactable while downed
    this.staggers = 0;
  }

  /** Called from `Machine.takeDamage` after the damage has been applied. */
  onDamage(damage, hit, tornPart) {
    const m = this.m;
    const c = this.cfg;
    if (!m.alive) return;
    const frac = damage / Math.max(1, m.maxHealth);

    // direction of the shove: the projectile direction, else away from the hit
    if (hit && hit.dir) _v.set(hit.dir.x || 0, 0, hit.dir.z || 0);
    else if (hit && hit.point) _v.set(m.position.x - hit.point.x, 0, m.position.z - hit.point.z);
    else _v.set(-Math.sin(m.heading), 0, -Math.cos(m.heading));
    if (_v.lengthSq() < 1e-5) _v.set(-Math.sin(m.heading), 0, -Math.cos(m.heading));
    _v.normalize();

    const strength = Math.min(1, frac / Math.max(0.02, c.staggerFrac));
    m._react.x = _v.x; m._react.z = _v.z; m._react.y = 0;
    m._react.k = Math.max(m._react.k, Math.max(0.25, strength) * c.impulse);
    m._react.t = 0;

    if (frac >= c.flinchFrac || tornPart) {
      safeEmit(m.ctx, 'machine-flinch', { machine: m, strength: Math.min(1, strength) });
    }

    const shouldStagger = (frac >= c.staggerFrac) || (tornPart && c.tearStaggers);
    if (!shouldStagger || this.cdT > 0) return;

    const now = performance.now() / 1000;
    this.history.push(now);
    while (this.history.length && now - this.history[0] > c.downedWindow) this.history.shift();

    if (frac >= c.downedFrac || this.history.length >= c.downedStaggers) this._down();
    else this._stagger(span(c.staggerTime));
  }

  _stagger(time) {
    const m = this.m;
    const c = this.cfg;
    if (m.state !== 'stagger' && m.state !== 'downed') this.resumeState = m.state;
    m._cancelAttack();
    this.staggerT = time;
    this.cdT = c.staggerCd + time;
    this.staggers++;
    m._speed = 0;
    // shove the body a hand's width along the hit direction
    m.moveRoot(m._react.x * c.pushBack, m._react.z * c.pushBack);
    m.setState('stagger');
    safeEmit(m.ctx, 'machine-stagger', {
      machine: m, duration: time, kind: 'stagger',
    });
  }

  _down() {
    const m = this.m;
    const c = this.cfg;
    if (m.state !== 'stagger' && m.state !== 'downed') this.resumeState = m.state;
    m._cancelAttack();
    this.staggerT = 0;
    this.downedT = span(c.downedTime);
    this.cdT = c.staggerCd + this.downedT;
    this.history.length = 0;
    m._speed = 0;
    m.setState('downed');
    safeEmit(m.ctx, 'machine-stagger', {
      machine: m, duration: this.downedT, kind: 'downed',
    });
    this._openCrit();
  }

  /** The Critical Hit window: a hold prompt on the downed machine. */
  _openCrit() {
    const m = this.m;
    const c = this.cfg;
    const inter = m.ctx.interactables;
    if (!inter || !inter.register) return;
    this.crit = inter.register({
      position: m.position,
      radius: Math.max(3, m.bodyRadius + 2),
      label: c.critLabel,
      hold: c.critHold,
      once: true,
      machine: m,
      onInteract: () => {
        this.crit = null;
        if (!m.alive) return;
        const dmg = m.maxHealth * c.critDamage;
        safeEmit(m.ctx, 'critical-hit', { machine: m, damage: dmg });
        m.takeDamage({
          impact: dmg, tear: 0, element: 'none', elementAmount: 0,
          point: m.position.clone(), object: null, dir: { x: 0, y: 0, z: 1 },
          type: 'critical', seen: true,
        });
      },
    });
  }

  _closeCrit() {
    if (!this.crit) return;
    this.m.ctx.interactables?.unregister?.(this.crit);
    this.crit = null;
  }

  /** @returns true when the reaction owns this frame (movement suspended). */
  update(dt) {
    const m = this.m;
    this.cdT = Math.max(0, this.cdT - dt);
    if (m._react.k > 0) {
      m._react.t += dt;
      m._react.k = Math.max(0, m._react.k - dt * 2.6);
    }
    if (this.downedT > 0) {
      this.downedT -= dt;
      m._speed = THREE.MathUtils.damp(m._speed, 0, 8, dt);
      if (this.downedT <= 0) {
        this._closeCrit();
        m.setState(this._resume());
      }
      return true;
    }
    if (this.staggerT > 0) {
      this.staggerT -= dt;
      m._speed = THREE.MathUtils.damp(m._speed, 0, 8, dt);
      if (this.staggerT <= 0) m.setState(this._resume());
      return true;
    }
    return false;
  }

  _resume() {
    const s = this.resumeState;
    if (s === 'stagger' || s === 'downed' || s === 'dead') return 'attack';
    return s === 'patrol' || s === 'return' ? 'alert' : s;
  }

  onDeath() { this._closeCrit(); this.staggerT = 0; this.downedT = 0; }
}

export { REACT };
