import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PlayerAnimator } from './playerAnimator.js';

const CAMP_POS = new THREE.Vector3(18, 0, 26);

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
    this.aiming = false;
    this.dodging = false;
    this._dodgeTime = 0;
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
    this._dodgeDir.copy(dir);
    this.ctx.events.emit('player-dodge');
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
    let targetSpeed = 0;
    if (wish.lengthSq() > 0.01) {
      targetSpeed = this.crouching ? 2.1 : sprinting ? 8.2 : 4.6;
      if (this.aiming) targetSpeed = 2.4;
      // hauling a torn-off heavy weapon slows the hunt (canon -35%)
      if (this.ctx.combat?.activeWeapon?.heavy) targetSpeed *= 0.65;
    }

    if (this.dodging) {
      this._dodgeTime += dt;
      const k = 1 - this._dodgeTime / 0.42;
      if (k <= 0) this.dodging = false;
      else {
        this.velocity.x = this._dodgeDir.x * 11 * k;
        this.velocity.z = this._dodgeDir.z * 11 * k;
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
