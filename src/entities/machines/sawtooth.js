import * as THREE from 'three';
import { Machine } from './machine.js';

/**
 * Sawtooth: big-cat stalker (static sculpt, procedural root motion).
 * Prowl bob/sway, low stalk when suspicious, charge + committed pounce.
 * Weak point: chest blaze canister.
 */
export class Sawtooth extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'sawtooth',
      displayName: 'Sawtooth',
      rigged: false,
      yawFix: Math.PI / 2, // model faces -X in asset space (head under the antenna sweep)
      maxHealth: 260,
      armor: 0.2,
      walkSpeed: 2.2,
      runSpeed: 9,
      turnRate: 2.6,
      sightRange: 42,
      hearRange: 30,
      eyeHeight: 1.9,
      attackRange: 9, // pounce launch distance
      bodyRadius: 1.5,
      ...opts,
    });

    // model length runs along asset +X -> body-space +Z after yaw fix
    const len = this.size.x;
    const h = this.height;
    // eyes: pair on the head (body space: +Z forward)
    this.addEye(this.body, 0.2, h * 0.74, len * 0.38, 0.32, 0.06);
    this.addEye(this.body, -0.2, h * 0.74, len * 0.38, 0.32, 0.06);
    // weak point: chest blaze canister
    this.addWeakPoint('chest', this.body, 0, h * 0.52, len * 0.20, 0.65);

    this._gait = Math.random() * Math.PI * 2;
    this._crouch = 0;   // stalk pose blend
    this._pounceDir = new THREE.Vector3();
  }

  chooseAttack(dist) {
    if (dist < 3.4) {
      return {
        kind: 'swipe',
        windup: 0.45, strike: 0.18, recover: 0.8, cooldown: 1.6,
        onStrike: () => this.damagePlayer(12, 4, 0.1),
        onUpdate: (a) => {
          // rear back, then slash across
          if (a.phase === 'windup') this.body.rotation.y = a.phaseT * 0.4;
          else if (a.phase === 'strike') this.body.rotation.y = 0.4 - a.phaseT * 0.9;
          else this.body.rotation.y = -0.5 + 0.5 * a.phaseT;
        },
        cleanup: () => { this.body.rotation.y = 0; },
      };
    }
    if (dist <= this.attackRange && dist > 3) {
      return {
        kind: 'pounce',
        windup: 0.55, strike: 0.5, recover: 1.1, cooldown: 3.2,
        track: true,
        jump: 5,
        onWindup: () => { this._crouchTarget = 1; },
        onStrike: (a) => {
          // commit to the player's position at launch — dodge beats it;
          // leap scales to the live range, landing 1.5m short (standoff)
          const p = this.ctx.player;
          this._pounceDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
          if (p) {
            this._pounceDir.set(
              p.position.x - this.position.x, 0, p.position.z - this.position.z,
            );
            const d = this._pounceDir.length();
            this._pounceDir.normalize();
            this.heading = Math.atan2(this._pounceDir.x, this._pounceDir.z);
            a.jump = THREE.MathUtils.clamp(d - 1.5, 2, this.attackRange);
          }
          this._airborne = true;
        },
        onUpdate: (a, dt) => {
          if (a.phase === 'windup') {
            this._crouch = Math.min(1, this._crouch + dt * 5); // coil down
          } else if (a.phase === 'strike') {
            const step = (a.jump / 0.5) * dt;
            this.moveRoot(this._pounceDir.x * step, this._pounceDir.z * step);
            const arc = Math.sin(a.phaseT * Math.PI) * 1.4;
            this.position.y = this.ctx.terrain.getHeight(this.position.x, this.position.z) + arc;
            // damage window covers the whole landing half of the leap
            if (a.phaseT > 0.5 && !a.hit && this.damagePlayer(25, 2.9)) {
              a.hit = true;
              this.knockbackPlayer(8);
            }
          } else {
            this._airborne = false;
            this._crouch = Math.max(0, this._crouch - dt * 2);
          }
        },
        cleanup: () => { this._airborne = false; },
      };
    }
    return null;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    const speed = this._speed;
    const stride = 1.7;
    this._gait += dt * speed * (Math.PI / stride);
    const moveK = THREE.MathUtils.clamp(speed / 2.5, 0, 1);
    const runK = THREE.MathUtils.clamp(speed / this.runSpeed, 0, 1);

    // stalk: low and slow while suspicious/searching
    const stalking = this.state === 'suspicious' || this.state === 'search';
    this._crouch = THREE.MathUtils.damp(this._crouch, stalking ? 0.8 : (this._attack?.kind === 'pounce' && this._attack.phase === 'windup' ? 1 : 0), 4, dt);

    // root motion: bob with footfalls, sway with stride, pitch with acceleration
    const bob = Math.abs(Math.sin(this._gait)) * (0.06 + runK * 0.09) * moveK;
    this.body.position.y = bob - this._crouch * 0.42 + Math.sin(t * 1.1) * 0.012;
    this.body.rotation.x = Math.sin(this._gait * 2) * 0.02 * moveK
      - (speed - this._accelPitch) * 0.028  // nose dips as it accelerates
      + this._crouch * 0.1;
    if (!this._attack || this._attack.kind !== 'swipe') {
      this.body.rotation.y = 0;
    }
    this.body.rotation.z = Math.sin(this._gait) * (0.035 + runK * 0.03) * moveK;
  }
}
