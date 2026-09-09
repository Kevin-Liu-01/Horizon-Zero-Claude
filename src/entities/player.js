import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PlayerAnimator } from './playerAnimator.js';

const CAMP_POS = new THREE.Vector3(18, 0, 26);

// Dodge roll: the animator's Roll_RM clip carries a root-motion curve; the
// roll travels DODGE_DIST along it over DODGE_T (HZD tap-dodge: 0.7-0.9s,
// 2-3m; A2 gate wants >= 3m). Without the clip pack the old 0.42s impulse runs.
const DODGE_T = 0.82;
const DODGE_DIST = 3.4;
const DODGE_T_IMPULSE = 0.42;

/**
 * Ground speeds (m/s). Round 4: these are chosen against the BAKED clip speeds
 * (animator.clipReport()) so every loop plays near its own cadence — a clip
 * driven far from its nominal speed reads as slow-motion or as a scuttle even
 * though the phase lock keeps the feet planted:
 *   Walk_Loop 1.17 | Jog_Fwd_Loop 6.16 | Sprint_Loop 6.96 | Crouch_Fwd 0.67
 * WALK_SPEED is the hold-Alt stroll; CROUCH_SPEED came down from 2.1 (3.1x the
 * crouch clip, a scuttle) and AIM_SPEED from 2.4 so aim-strafing rides the walk
 * loop instead of dragging a quarter of the run clip into it.
 */
const WALK_SPEED = 1.5;
const CROUCH_SPEED = 1.5;
const AIM_SPEED = 1.8;
const RUN_SPEED = 4.6;
const SPRINT_SPEED = 8.2;

const _wish = new THREE.Vector3();
const _side = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _desired = new THREE.Vector3();

/**
 * Third-person player: capsule kinematics on the terrain heightfield,
 * over-shoulder orbit camera, aim mode, health/stamina/medicine.
 */
export class Player {
  constructor(ctx) {
    this.ctx = ctx;

    // --- model
    const src = ctx.assets.models.aloy;
    this.model = skeletonClone(src.root);
    this.model.name = 'player';
    ctx.scene.add(this.model);

    // --- state
    this.position = new THREE.Vector3(CAMP_POS.x, 0, CAMP_POS.z);
    this.velocity = new THREE.Vector3();
    this.heading = 0;          // facing yaw
    this.moveSpeed = 0;
    this.grounded = true;
    this.crouching = false;
    this.walking = false;      // hold Alt: stroll (drives the Walk_Loop clip)
    this.aiming = false;
    this.dodging = false;
    this._dodgeTime = 0;
    this._dodgeProg = 0;       // root-motion fraction already travelled
    this.dodgeK = 1;           // 0..1 progress of the current roll (animator scrubs the clip)
    this._dodgeDir = new THREE.Vector3();

    this.maxHealth = 100;
    this.health = this.maxHealth;
    // HZD medicine pouch: a 0..100 meter filled by medicinal herbs; holding Q
    // transfers pouch -> health over time (research: docs/research/mechanics.md)
    this.pouch = 60;
    this.maxPouch = 100;
    this.healing = false;
    this.inTallGrass = false;

    // --- camera orbit
    this.camYaw = Math.PI;
    this.camPitch = 0.18;
    this.camDist = 4.2;
    this._camPos = new THREE.Vector3();
    this._shake = 0;

    this.animator = new PlayerAnimator(ctx, this.model);

    ctx.input.onDown('Space', () => this.dodge());
    ctx.input.onDown('ControlLeft', () => this.dodge()); // HZD PC dodge bind

    ctx.events.on('player-damage', ({ amount, from }) => this.takeDamage(amount, from));

    this._snapToGround();
  }

  /* ------------------------------- damage ------------------------------- */

  takeDamage(amount, from) {
    if (this.ctx.state !== 'playing' || this.dodging) return;
    this.health = Math.max(0, this.health - amount);
    this._shake = Math.min(1, this._shake + 0.45);
    this.ctx.events.emit('player-hurt', { health: this.health, max: this.maxHealth });
    if (this.health <= 0) this._die();
  }

  /** Herbs and looted medicine refill the pouch meter. */
  addPouch(amount) {
    this.pouch = Math.min(this.maxPouch, this.pouch + amount);
  }

  /** Deprecated alias for the pre-pouch HUD; do not use in new code. */
  get medicine() { return Math.ceil(this.pouch / 25); }

  _die() {
    this.ctx.state = 'dead';
    this.ctx.events.emit('player-died');
    setTimeout(() => {
      if (this.ctx.state !== 'dead') return; // victory/pause may have superseded
      this.health = this.maxHealth;
      this.pouch = 60;
      this.position.set(CAMP_POS.x, 0, CAMP_POS.z);
      this._snapToGround();
      this.ctx.state = 'playing';
      this.ctx.events.emit('player-respawn');
    }, 3200);
  }

  dodge() {
    if (this.dodging || this.ctx.state !== 'playing') return;
    const dir = this._wishDir();
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.dodging = true;
    this._dodgeTime = 0;
    this._dodgeProg = 0;
    this.dodgeK = 0;
    this._dodgeDir.copy(dir);
    this.ctx.events.emit('player-dodge');
  }

  /** Roll duration: clip-driven when the animator baked a roll, else impulse. */
  get dodgeDuration() {
    return this.animator?.rollProgress?.(0) != null ? DODGE_T : DODGE_T_IMPULSE;
  }

  /* ------------------------------ movement ------------------------------ */

  _wishDir() {
    const input = this.ctx.input;
    const f = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const r = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const dir = _wish.set(0, 0, 0);
    if (f === 0 && r === 0) return dir;
    // camera sits at +(sin,cos)·camYaw from the pivot, so view-forward is the negation
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    dir.set(-sin * f + cos * r, 0, -cos * f - sin * r).normalize();
    return dir;
  }

  _snapToGround() {
    this.position.y = this.ctx.terrain.getHeight(this.position.x, this.position.z);
  }

  update(dt, t) {
    const ctx = this.ctx;
    const input = ctx.input;
    if (ctx.state !== 'playing' && !ctx.params.has('shot')) {
      this.animator.update(dt, t);
      return;
    }

    // --- camera orbit from mouse
    const sens = 0.0023;
    this.camYaw -= input.mouse.dx * sens;
    this.camPitch = THREE.MathUtils.clamp(
      this.camPitch + input.mouse.dy * sens, -0.55, 1.05,
    );

    this.aiming = input.mouseDown(2) && !this.dodging;
    this.crouching = input.isDown('KeyC') && !this.aiming;

    // --- locomotion
    const wish = this._wishDir();
    const sprinting = input.isDown('ShiftLeft') && !this.aiming && !this.crouching;
    this.walking = input.isDown('AltLeft') && !sprinting;
    let targetSpeed = 0;
    if (wish.lengthSq() > 0.01) {
      targetSpeed = this.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : RUN_SPEED;
      if (this.aiming) targetSpeed = AIM_SPEED;
      if (this.walking) targetSpeed = Math.min(targetSpeed, WALK_SPEED);
      // hauling a torn-off heavy weapon slows the hunt (canon -35%)
      if (this.ctx.combat?.activeWeapon?.heavy) targetSpeed *= 0.65;
    }

    if (this.dodging) {
      this._dodgeTime += dt;
      const T = this.dodgeDuration;
      const k = this._dodgeTime / T;
      if (k >= 1) {
        this.dodging = false;
        this.dodgeK = 1;
      } else {
        this.dodgeK = k;
        const prog = this.animator?.rollProgress?.(k);
        let v;
        if (prog != null) {
          // velocity = derivative of the clip's root-motion curve, scaled so
          // the whole roll covers DODGE_DIST (feet match the ground)
          v = Math.max(0, prog - this._dodgeProg) / dt * DODGE_DIST;
          this._dodgeProg = prog;
        } else {
          v = 11 * (1 - k);
        }
        this.velocity.x = this._dodgeDir.x * v;
        this.velocity.z = this._dodgeDir.z * v;
      }
    }

    if (!this.dodging) {
      const accel = 22;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wish.x * targetSpeed, accel / 4, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wish.z * targetSpeed, accel / 4, dt);
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // keep inside world
    const r = Math.hypot(this.position.x, this.position.z);
    const maxR = 330;
    if (r > maxR) {
      this.position.x *= maxR / r;
      this.position.z *= maxR / r;
    }

    // stick to terrain
    const groundY = ctx.terrain.getHeight(this.position.x, this.position.z);
    this.position.y = THREE.MathUtils.damp(this.position.y, groundY, 18, dt);

    this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.inTallGrass = ctx.terrain.isInTallGrass(this.position.x, this.position.z);

    // --- facing: face move dir normally; face camera dir while aiming
    if (this.aiming) {
      this.heading = this.camYaw + Math.PI;
    } else if (this.moveSpeed > 0.4) {
      const want = Math.atan2(this.velocity.x, this.velocity.z);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * 11);
    }

    this.model.position.copy(this.position);
    this.model.rotation.y = this.heading;

    // --- hold Q: transfer medicine pouch into health (HZD pouch mechanic)
    this.healing = input.isDown('KeyQ') && this.pouch > 0.5 && this.health < this.maxHealth;
    if (this.healing) {
      const rate = 16; // hp per second, 1 pouch unit = 1 hp
      const amt = Math.min(rate * dt, this.pouch, this.maxHealth - this.health);
      this.pouch -= amt;
      this.health += amt;
    }

    this._updateCamera(dt);
    this.animator.update(dt, t);
  }

  _updateCamera(dt) {
    const cam = this.ctx.camera;
    const targetDist = this.aiming ? 1.9 : 4.2;
    this.camDist = THREE.MathUtils.damp(this.camDist, targetDist, 10, dt);

    const pivotHeight = this.crouching ? 1.1 : 1.55;
    const shoulder = this.aiming ? 0.55 : 0.32;

    const pivot = _pivot.set(
      this.position.x, this.position.y + pivotHeight, this.position.z,
    );
    // shoulder offset perpendicular to view
    const side = _side.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    pivot.addScaledVector(side, shoulder);

    const dir = _camDir.set(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch),
    );
    const desired = _desired.copy(pivot).addScaledVector(dir, this.camDist);

    // terrain collision: keep camera above ground
    const minY = this.ctx.terrain.getHeight(desired.x, desired.z) + 0.4;
    if (desired.y < minY) desired.y = minY;

    this._camPos.copy(desired);

    // camera shake decay
    if (this._shake > 0.001) {
      const s = this._shake * 0.12;
      this._camPos.x += (Math.random() - 0.5) * s;
      this._camPos.y += (Math.random() - 0.5) * s;
      this._shake = THREE.MathUtils.damp(this._shake, 0, 6, dt);
    }

    cam.position.copy(this._camPos);
    cam.lookAt(pivot.x - dir.x, pivot.y + 0.15 - dir.y * 0.2, pivot.z - dir.z);
  }
}
