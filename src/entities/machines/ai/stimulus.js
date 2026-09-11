import * as THREE from 'three';
import { NOISE, ALARM, alarmRadius } from './tables.js';
import { playerNoise } from './perception.js';
import { safeEmit } from './emit.js';

/**
 * Stimulus bus — `machine-ai-12`, `stealth-hearing-stimuli`,
 * `stealth-lure-missing`, `stealth-alarm-leaks-position`, `machine-ai-06`.
 *
 * Published API (on `ctx.machines`):
 *
 *   machines.noise({ pos|x,z, radius, strength, kind, source })
 *       One world stimulus. Every living machine inside `radius` hears it at
 *       `strength * falloff` and points its `lastKnown` AT THE NOISE.
 *       `kind` picks defaults from `NOISE.kinds` when radius/strength are
 *       omitted. Kinds flagged `lure: true` (whistle, thrown rock) also pull
 *       the machine off its route to investigate.
 *
 *   machines.lure(pos, opts)      — shorthand for a `lure` stimulus
 *   machines.alarm(caller, radius)— squad alarm; recipients converge on the
 *                                   CALLER in `search`, never on the player
 *
 * Everything is fire-and-forget and allocation-free in the hot path.
 */

const _p = new THREE.Vector3();

export class StimulusBus {
  constructor(machines) {
    this.machines = machines;
    this.ctx = machines.ctx;
    this._playerT = 0;
    this.count = 0;
    this.last = null;
  }

  /** Fire one stimulus into the world. Returns how many machines heard it. */
  emit(ev) {
    const kind = ev.kind || 'noise';
    const def = NOISE.kinds[kind] || NOISE.kinds.noise;
    const x = ev.x ?? ev.pos?.x ?? 0;
    const z = ev.z ?? ev.pos?.z ?? 0;
    const radius = ev.radius ?? def.radius;
    const strength = ev.strength ?? def.strength;
    const lure = ev.lure ?? def.lure ?? false;
    const r2 = radius * radius;
    let heard = 0;

    for (const m of this.machines.list) {
      if (!m.alive || m._disposed || m === ev.source) continue;
      if (m.state === 'overridden') continue;
      const dx = m.position.x - x, dz = m.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2);
      // smooth falloff: full strength at the source, nothing at the rim
      const k = 1 - d / radius;
      const s = strength * k * k * (m.hearScale ?? 1);
      if (s <= 0.02) continue;
      heard++;
      m.ai?.perception.hear(x, z, s, lure ? 'lure' : kind);
      if (lure) m.ai?.lure(x, z, ev.hold ?? NOISE.lureHold);
    }

    this.count++;
    this.last = { x, z, radius, strength, kind, heard };
    safeEmit(this.ctx, 'stimulus', { x, z, radius, strength, kind, heard, source: ev.source ?? null });
    return heard;
  }

  /**
   * Squad alarm. `machine-ai-06` + `stealth-alarm-leaks-position`: the caller
   * hands out ITS OWN position and a `search` order. Recipients go yellow and
   * converge; only their own senses can turn that red.
   */
  alarm(caller, radius) {
    const r = radius ?? alarmRadius(caller.kind);
    if (caller._alarmCd > 0) return 0;
    caller._alarmCd = ALARM.cooldown;
    const r2 = r * r;
    let n = 0;
    for (const m of this.machines.list) {
      if (m === caller || !m.alive || m._disposed) continue;
      if (m.state === 'attack' || m.state === 'alert' || m.state === 'overridden'
        || m.state === 'downed' || m.state === 'dead') continue;
      if (m.position.distanceToSquared(caller.position) > r2) continue;
      const j = ALARM.callerJitter;
      m.lastKnown.set(
        caller.position.x + (Math.random() - 0.5) * 2 * j, 0,
        caller.position.z + (Math.random() - 0.5) * 2 * j,
      );
      m.lastKnown.y = this.ctx.terrain.getHeight(m.lastKnown.x, m.lastKnown.z);
      m.suspicion = Math.max(m.suspicion, ALARM.recipientSuspicion);
      m._unseenT = 0.001;
      m.ai?.beginSearch(true);
      m.setState(ALARM.recipientState);
      n++;
    }
    safeEmit(this.ctx, 'machine-alarm', { machine: caller, radius: r, recipients: n });
    return n;
  }

  /** Per-frame: the player's own footstep noise becomes a stimulus. */
  update(dt) {
    const p = this.ctx.player;
    if (!p || p.health <= 0) return;
    this._playerT -= dt;
    if (this._playerT > 0) return;
    this._playerT = NOISE.player.period;
    const n = playerNoise(p);
    if (!n) return;
    _p.copy(p.position);
    this.emit({
      x: _p.x, z: _p.z, radius: n.radius, strength: n.strength,
      kind: 'footstep', source: null,
    });
  }
}
