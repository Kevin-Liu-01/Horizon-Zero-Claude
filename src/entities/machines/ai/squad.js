import * as THREE from 'three';
import { ECOSYSTEM, span } from './tables.js';
import { safeEmit } from './emit.js';

/**
 * Squad + ecosystem behaviour — `machine-ai-07` (herd doctrine is a one-shot
 * dead flag), `machine-ai-14` (no ecosystem behaviour), `strider-07`.
 *
 *  - HERD DOCTRINE RESET: `herd.alarmed` used to latch true forever, so a herd
 *    could stampede exactly once per session and never post a rearguard again.
 *    It now clears once the whole herd has been calm for `calmTime`, and the
 *    rearguard is re-picked among the LIVING whenever the current one dies.
 *  - ESCORTS: the two Watchers that shadow the Strider herd hold slots on a
 *    ring around it instead of walking an unrelated patrol loop, and they
 *    re-space themselves as members die.
 *  - SCAVENGERS: Scrappers within 90 m of a fresh wreck break patrol, lope to
 *    it and pick at it for 8-16 s. That is the Scrapper's entire canon role.
 */

const _v = new THREE.Vector3();

export class Squads {
  constructor(machines) {
    this.machines = machines;
    this.ctx = machines.ctx;
    this.herds = [];
    this.wrecks = [];      // { x, z, t } fresh kills for scavengers
    this.calmTime = 12;
    this._t = 0;
  }

  registerHerd(herd) {
    if (!herd || this.herds.includes(herd)) return herd;
    herd._calmT = 0;
    this.herds.push(herd);
    return herd;
  }

  /** Slot escorts around a herd (or any anchor) at a fixed ring. */
  assignEscorts(anchor, guards, radius) {
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      g.escort = {
        x: anchor.x, z: anchor.z,
        radius,
        slot: (i / guards.length) * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
      };
    }
  }

  noteKill(machine) {
    this.wrecks.push({ x: machine.position.x, z: machine.position.z, t: 0, kind: machine.kind });
    if (this.wrecks.length > 12) this.wrecks.shift();
  }

  _updateHerds(dt) {
    for (const h of this.herds) {
      const living = h.members.filter((m) => m.alive && !m._disposed);
      if (!living.length) { h.alarmed = false; h.rearguard = null; continue; }
      let hot = false;
      for (const m of living) if (m.suspicion > 0.3) { hot = true; break; }
      if (hot) h._calmT = 0;
      else h._calmT = (h._calmT || 0) + dt;

      // the rearguard died (or was overridden): post a new one immediately
      if (h.alarmed && (!h.rearguard || !h.rearguard.alive
        || h.rearguard._disposed || h.rearguard.state === 'overridden')) {
        const p = this.ctx.player;
        let best = null, bd = Infinity;
        for (const m of living) {
          if (m.state === 'overridden') continue;
          const d = p ? m.position.distanceToSquared(p.position) : 0;
          if (d < bd) { bd = d; best = m; }
        }
        h.rearguard = best;
        if (best) { best._fleeing = false; best._fleeT = 0; }
      }

      // machine-ai-07: the flag RESETS, so the herd can be spooked again
      if (h.alarmed && h._calmT > this.calmTime) {
        h.alarmed = false;
        h.rearguard = null;
        for (const m of living) { m._fleeing = false; m._fleeT = 0; }
      }
    }
  }

  _updateScavengers(dt) {
    const cfg = ECOSYSTEM.scavenger;
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      if (w.t > cfg.window) { this.wrecks.splice(i, 1); continue; }
    }
    if (!this.wrecks.length) return;
    for (const m of this.machines.list) {
      if (!m.alive || m._disposed) continue;
      if (!cfg.kinds.includes(m.kind)) continue;
      if (m.state !== 'patrol' && m.state !== 'return') continue;
      if (m.scavenge) continue;
      for (const w of this.wrecks) {
        if (w.claimed >= 2) continue;
        const dx = w.x - m.position.x, dz = w.z - m.position.z;
        if (dx * dx + dz * dz > cfg.radius * cfg.radius) continue;
        w.claimed = (w.claimed || 0) + 1;
        m.scavenge = { x: w.x, z: w.z, dwell: 0, arrived: false, hold: span(cfg.dwell) };
        break;
      }
    }
  }

  /** Called from `Machine._statePatrol` when `machine.scavenge` is set. */
  static stepScavenge(m, dt) {
    const s = m.scavenge;
    const cfg = ECOSYSTEM.scavenger;
    if (!s) return false;
    if (!s.arrived) {
      const d = m._moveToward(s.x, s.z, m.walkSpeed * 1.4, dt);
      if (d < cfg.arrive) { s.arrived = true; safeEmit(m.ctx, 'machine-scavenge', { machine: m }); }
      return true;
    }
    s.dwell += dt;
    m._speed = THREE.MathUtils.damp(m._speed, 0, 6, dt);
    m.heading += Math.sin(s.dwell * 2.2) * dt * 0.9;
    m.aiPose.forage = 0.5 + 0.5 * Math.sin(s.dwell * 3.1);
    if (s.dwell > s.hold) { m.scavenge = null; m.aiPose.forage = 0; }
    return true;
  }

  /** Called from `Machine._statePatrol` when `machine.escort` is set. */
  static stepEscort(m, dt) {
    const e = m.escort;
    if (!e) return false;
    e.phase += dt * 0.12;
    const a = e.slot + e.phase;
    const x = e.x + Math.sin(a) * e.radius;
    const z = e.z + Math.cos(a) * e.radius;
    m._moveToward(x, z, m.walkSpeed, dt);
    return true;
  }

  update(dt) {
    this._updateHerds(dt);
    this._t += dt;
    if (this._t < 0.5) return;
    this._updateScavengers(this._t);
    this._t = 0;
  }
}

export { ECOSYSTEM };
