import * as THREE from 'three';
import { Machine } from './machine.js';

/**
 * Behemoth: territorial giant ox (static sculpt). Only aggros inside its
 * home territory. Charge with knockback + periodic ground slam shockwave.
 * Weak points: side cargo sacks.
 */

export class Behemoth extends Machine {
  constructor(ctx, manager, opts) {
    const spawn = opts.spawn;
    super(ctx, manager, {
      kind: 'behemoth',
      displayName: 'Behemoth',
      rigged: false,
      yawFix: Math.PI, // model faces -Z in asset space
      maxHealth: 520,
      armor: 0.35,
      walkSpeed: 1.7,
      runSpeed: 6.2,
      turnRate: 1.6,
      sightRange: 45,
      sightHalf: THREE.MathUtils.degToRad(55),
      hearRange: 32,
      eyeHeight: 3.4,
      attackRange: 26,
      bodyRadius: 2.3,
      territory: { x: spawn.x, z: spawn.z, r: 70 },
      ...opts,
    });

    const h = this.height;        // 4.5
    const len = this.size.z;      // length along asset z
    const w = this.size.x;
    // eyes: low head at the front
    this.addEye(this.body, 0.42, h * 0.54, len * 0.37, 0.4, 0.08);
    this.addEye(this.body, -0.42, h * 0.54, len * 0.37, 0.4, 0.08);
    // weak points: side cargo sacks
    this.addWeakPoint('sack-l', this.body, w * 0.38, h * 0.52, -len * 0.12, 0.95);
    this.addWeakPoint('sack-r', this.body, -w * 0.38, h * 0.52, -len * 0.12, 0.95);

    this._gait = Math.random() * Math.PI * 2;
    this._slamCd = 3;
    this._chargeDir = new THREE.Vector3();
  }

  chooseAttack(dist) {
    if (dist < 12 && this._slamCd <= 0) {
      this._slamCd = 7;
      return {
        kind: 'slam',
        windup: 0.8, strike: 0.3, recover: 1.2, cooldown: 1.6,
        onStrike: () => {
          this.spawnShockRing(this.position.x, this.position.z, 14, 0.85, 25, 9);
        },
        onUpdate: (a) => {
          if (a.phase === 'windup') {
            this.body.rotation.x = -0.5 * a.phaseT;          // rear up
            this.body.position.y = a.phaseT * 0.9;
          } else if (a.phase === 'strike') {
            this.body.rotation.x = -0.5 + a.phaseT * 0.62;   // crash down
            this.body.position.y = (1 - a.phaseT) * 0.9;
          } else {
            this.body.rotation.x = 0.12 * (1 - a.phaseT);
            this.body.position.y = 0;
          }
        },
        cleanup: () => { this.body.rotation.x = 0; this.body.position.y = 0; },
      };
    }
    if (dist > 6 && dist < this.attackRange * 1.6) {
      const runT = THREE.MathUtils.clamp(dist / 13, 0.7, 2.4);
      return {
        kind: 'charge',
        windup: 0.7, strike: runT, recover: 1.1, cooldown: 4.5,
        onWindup: () => { this._chargeHit = false; },
        onStrike: () => {
          const p = this.ctx.player;
          if (p) this.heading = Math.atan2(
            p.position.x - this.position.x, p.position.z - this.position.z,
          );
        },
        onUpdate: (a, dt) => {
          if (a.phase === 'windup') {
            // paw the ground: head dips twice
            this.body.rotation.x = Math.abs(Math.sin(a.phaseT * Math.PI * 2)) * 0.14;
          } else if (a.phase === 'strike') {
            const p = this.ctx.player;
            if (p) {
              // committed charge: only mild homing, dodging sidesteps it
              const want = Math.atan2(
                p.position.x - this.position.x, p.position.z - this.position.z,
              );
              let d = want - this.heading;
              while (d > Math.PI) d -= Math.PI * 2;
              while (d < -Math.PI) d += Math.PI * 2;
              this.heading += THREE.MathUtils.clamp(d, -0.65 * dt, 0.65 * dt);
            }
            const step = 12.5 * dt;
            this.moveRoot(Math.sin(this.heading) * step, Math.cos(this.heading) * step);
            this._gait += step * (Math.PI / 2.4);
            this.body.rotation.x = -0.06;
            if (!this._chargeHit && p) {
              const dd = Math.hypot(
                p.position.x - this.position.x, p.position.z - this.position.z,
              );
              if (dd < this.bodyRadius + 1.6) {
                this._chargeHit = true;
                this.damagePlayer(30, this.bodyRadius + 2);
                this.knockbackPlayer(14);
                a.t = a.windup + a.strike; // stop the run on impact
              }
            }
          } else {
            this.body.rotation.x = 0;
          }
        },
        cleanup: () => { this.body.rotation.x = 0; },
      };
    }
    return null;
  }

  animate(dt, t) {
    this._slamCd -= dt;
    if (this.state === 'dead') return;
    const speed = this._speed;
    const stride = 2.4;
    this._gait += dt * speed * (Math.PI / stride);
    const moveK = THREE.MathUtils.clamp(speed / 2, 0, 1);

    const inAttack = !!this._attack;
    if (!inAttack) {
      this.body.position.y = Math.abs(Math.sin(this._gait)) * 0.14 * moveK
        + Math.sin(t * 0.9) * 0.02;
      this.body.rotation.x = Math.sin(this._gait * 2) * 0.015 * moveK
        - (speed - this._accelPitch) * 0.02;
      this.body.rotation.z = Math.sin(this._gait) * 0.05 * moveK;
    } else {
      this.body.rotation.z = Math.sin(this._gait) * 0.05 * moveK;
    }
  }
}
