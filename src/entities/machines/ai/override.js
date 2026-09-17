import * as THREE from 'three';
import { OVERRIDE, overrideCfg } from './tables.js';
import { safeEmit } from './emit.js';

/**
 * Override & mount — `missing-systems-override-mount`.
 *
 * A machine the Spear has overridden turns TEAL, stops being hostile, follows
 * Aloy and fights whatever is hunting her. Mountable species (Strider,
 * Behemoth) additionally offer a MOUNT prompt; riding drives the machine's own
 * gait with the player attached at the saddle.
 *
 * Published on `ctx.machines`:
 *   machines.canOverride(m)              -> bool
 *   machines.override(m)                 -> bool     (also emits machine-overridden)
 *   machines.mount(m) / machines.dismount()
 *   machines.mounted                     -> machine | null
 *
 * Published on `ctx.player` (READ-ONLY for other lanes — `player-control` and
 * `player-anim` consume these; nothing here writes player velocity):
 *   player.mounted        machine | null
 *   player.mountSeat      Vector3 world saddle position (valid while mounted)
 *   events: 'player-mounted' { machine }, 'player-dismounted' { machine }
 */

const _v = new THREE.Vector3();

export class OverrideSystem {
  constructor(machines) {
    this.machines = machines;
    this.ctx = machines.ctx;
    this.mounted = null;
    this._prompt = null;
    this._seat = new THREE.Vector3();
    this._rideT = 0;
  }

  canOverride(m) {
    if (!m || !m.alive || m._disposed) return false;
    if (m.state === 'overridden') return false;
    /**
     * A CORRUPTED MACHINE CANNOT BE TAKEN BACK (casting-v4.md §2.6). The
     * Corruptor's whole threat is that its victims are not merely hostile,
     * they are OUT OF THE PLAYER'S REACH — "overrideCfg returns null for it,
     * so the Spear cannot take it back", in the card's own words. And a docile
     * machine is not a combatant at all: a 25 m comms tower is scenery.
     */
    if (m.corrupted || m.docile) return false;
    return !!overrideCfg(m.kind);
  }

  /** Flip a machine to the player's side. */
  override(m) {
    if (!this.canOverride(m)) return false;
    m.overridden = true;
    m.suspicion = 0;
    m._alertEpisode = false;
    m._cancelAttack();
    m.ai?.search.stop();
    m.ai?.engage.reset();
    m.setState('overridden');
    safeEmit(this.ctx, 'machine-overridden', { machine: m, mountable: !!overrideCfg(m.kind)?.mount });
    if (overrideCfg(m.kind)?.mount) this._registerMountPrompt(m);
    return true;
  }

  _registerMountPrompt(m) {
    const inter = this.ctx.interactables;
    if (!inter?.register) return;
    m._mountEntry = inter.register({
      position: m.position,
      radius: OVERRIDE.radius,
      label: OVERRIDE.mountLabel,
      hold: 0.3,
      machine: m,
      onInteract: () => this.mount(m),
    });
  }

  mount(m) {
    if (!m || !m.alive || m.state !== 'overridden') return false;
    if (!overrideCfg(m.kind)?.mount) return false;
    if (this.mounted) this.dismount();
    this.mounted = m;
    m.mountedBy = this.ctx.player;
    const p = this.ctx.player;
    if (p) {
      p.mounted = m;
      p.mountSeat = this._seat;
      p.velocity.set(0, 0, 0);
    }
    if (m._mountEntry) { this.ctx.interactables?.unregister?.(m._mountEntry); m._mountEntry = null; }
    this.machines.mounted = m;
    safeEmit(this.ctx, 'player-mounted', { machine: m });
    return true;
  }

  dismount() {
    const m = this.mounted;
    if (!m) return false;
    this.mounted = null;
    this.machines.mounted = null;
    m.mountedBy = null;
    const p = this.ctx.player;
    if (p) {
      p.mounted = null;
      // step off to the machine's left so she never lands inside the hull
      const side = m.heading + Math.PI * 0.5;
      p.position.x = m.position.x + Math.sin(side) * (m.bodyRadius + 1);
      p.position.z = m.position.z + Math.cos(side) * (m.bodyRadius + 1);
      p.position.y = this.ctx.terrain.getHeight(p.position.x, p.position.z);
      p.velocity.set(0, 0, 0);
    }
    if (overrideCfg(m.kind)?.mount && m.alive) this._registerMountPrompt(m);
    safeEmit(this.ctx, 'player-dismounted', { machine: m });
    return true;
  }

  /**
   * Per-frame: offer an OVERRIDE prompt on the nearest unaware, overridable
   * machine the player is standing behind. This is what makes the feature
   * reachable without `combat`'s spear; `combat` may also call
   * `machines.override(m)` directly from a Silent-Strike-style prompt.
   */
  update(dt) {
    this._promptT = (this._promptT ?? 0) - dt;
    if (this.mounted) { this._clearPrompt(); return; }
    if (this._promptT > 0) return;
    this._promptT = 0.25;
    const p = this.ctx.player;
    if (!p || p.health <= 0) { this._clearPrompt(); return; }
    let best = null, bd = OVERRIDE.radius * OVERRIDE.radius;
    for (const m of this.machines.list) {
      if (!this.canOverride(m)) continue;
      if (m.state === 'attack' || m.state === 'alert') continue;   // canon: it must not have you
      const d = m.position.distanceToSquared(p.position);
      if (d >= bd) continue;
      bd = d; best = m;
    }
    if (!best) { this._clearPrompt(); return; }
    if (this._prompt && this._prompt.machine === best) {
      this._prompt.position = best.position;
      return;
    }
    this._clearPrompt();
    const inter = this.ctx.interactables;
    if (!inter?.register) return;
    this._prompt = inter.register({
      position: best.position,
      radius: OVERRIDE.radius,
      label: OVERRIDE.label,
      hold: overrideCfg(best.kind)?.time ?? 1.2,
      machine: best,
      onInteract: () => { this._clearPrompt(); this.override(best); },
    });
  }

  _clearPrompt() {
    if (!this._prompt) return;
    this.ctx.interactables?.unregister?.(this._prompt);
    this._prompt = null;
  }

  /** Saddle position for the current mount. */
  seat(m, out) {
    const h = m.height * OVERRIDE.seat;
    return out.set(m.position.x, m.position.y + h, m.position.z);
  }

  /**
   * One frame of an overridden machine's behaviour. Called from
   * `Machine._stateOverridden`.
   */
  step(m, dt) {
    if (this.mounted === m) return this._ride(m, dt);
    const p = this.ctx.player;
    if (!p) return;

    // defend: the nearest hostile inside the help radius is the target
    let target = null, bd = OVERRIDE.helpRadius * OVERRIDE.helpRadius;
    for (const o of this.machines.list) {
      if (o === m || !o.alive || o._disposed || o.state === 'overridden') continue;
      if (o.suspicion < 0.4 && o.state !== 'attack' && o.state !== 'alert') continue;
      const d = o.position.distanceToSquared(m.position);
      if (d < bd) { bd = d; target = o; }
    }

    if (target) {
      const d = Math.sqrt(bd);
      if (d > m.attackRange * 0.8) {
        m.ai.engage.pursue(dt, target.position.x, target.position.z, m.runSpeed);
      } else {
        m._face(target.position.x, target.position.z, dt);
        m._speed = THREE.MathUtils.damp(m._speed, 0, 8, dt);
        m._allyCd = (m._allyCd ?? 0) - dt;
        if (m._allyCd <= 0) {
          m._allyCd = 1.6;
          const dmg = 8 + m.maxHealth * 0.02;
          _v.copy(target.position); _v.y += target.height * 0.5;
          m._telegraphT = 0.25;
          target.takeDamage({
            impact: dmg, tear: dmg * 0.4, element: 'none', elementAmount: 0,
            point: _v.clone(), object: null, dir: { x: 0, y: 0, z: 1 },
            type: 'override-ally', seen: true, from: m,
          });
          safeEmit(m.ctx, 'machine-attack', { machine: m, kind: 'ally-strike' });
        }
      }
      return;
    }

    // heel: hold a loose band behind the player
    const band = OVERRIDE.followBand;
    const d = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
    if (d > band[1]) {
      m.ai.engage.pursue(dt, p.position.x, p.position.z, m.runSpeed * 0.85);
    } else if (d < band[0]) {
      m._face(p.position.x, p.position.z, dt);
      m._speed = THREE.MathUtils.damp(m._speed, 0, 6, dt);
    } else {
      m._speed = THREE.MathUtils.damp(m._speed, 0, 4, dt);
      m._face(p.position.x, p.position.z, dt);
    }
  }

  /** Player is riding: her input drives the machine, she rides the saddle. */
  _ride(m, dt) {
    const ctx = this.ctx;
    const p = ctx.player;
    const input = ctx.input;
    if (!p) return;
    if (p.health <= 0) { this.dismount(); return; }

    let throttle = 0, turn = 0;
    if (input) {
      if (input.isDown('KeyW')) throttle += 1;
      if (input.isDown('KeyS')) throttle -= 0.6;
      if (input.isDown('KeyA')) turn += 1;
      if (input.isDown('KeyD')) turn -= 1;
      if (input.isDown('KeyF')) { this.dismount(); return; }
    }
    // steering: A/D yaw, and holding forward leans the mount toward the camera
    if (turn !== 0) m.heading += turn * OVERRIDE.rideTurn * dt;
    else if (throttle > 0 && typeof p.camYaw === 'number') {
      let d = (p.camYaw + Math.PI) - m.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.heading += THREE.MathUtils.clamp(d, -OVERRIDE.rideTurn * dt, OVERRIDE.rideTurn * dt);
    }
    const sprint = input?.isDown('ShiftLeft') ? 1 : 0.62;
    const want = throttle * OVERRIDE.rideSpeed * sprint;
    m._speed = THREE.MathUtils.damp(m._speed, want, 3.2, dt);
    const step = m._speed * dt;
    m._applyStep(Math.sin(m.heading) * step, Math.cos(m.heading) * step);
    m.moveDir.set(Math.sin(m.heading), 0, Math.cos(m.heading));
    m.strafeK = 0;

    // seat the rider — machines update after the player, so this is the last
    // write of the frame and she never fights it
    this.seat(m, this._seat);
    p.position.copy(this._seat);
    p.velocity.set(0, 0, 0);
    p.moveSpeed = Math.abs(m._speed);
    p.heading = m.heading;
    this._rideT += dt;
  }
}

export { OVERRIDE };
