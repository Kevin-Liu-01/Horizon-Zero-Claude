import * as THREE from 'three';
import { Machine } from './machine.js';

/**
 * Watcher: rigged raptor scout. Fully procedural bone animation — leg walk
 * cycle, neck scan sweep, tail sway, alert head-snap, lunge-peck attack.
 * Weak point: the eye. Chirps an alert to nearby machines.
 */

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _AX = new THREE.Vector3(1, 0, 0);
const _AY = new THREE.Vector3(0, 1, 0);
const _AZ = new THREE.Vector3(0, 0, 1);
const AXES = { x: _AX, y: _AY, z: _AZ };

export class Watcher extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'watcher',
      displayName: 'Watcher',
      rigged: true,
      yawFix: Math.PI, // model faces -Z in asset space
      maxHealth: 90,
      armor: 0.05,
      walkSpeed: 2.7,
      runSpeed: 7,
      turnRate: 3,
      sightRange: 40,
      hearRange: 26,
      eyeHeight: 1.85,
      attackRange: 2.5,
      bodyRadius: 0.9,
      ...opts,
    });

    // --- bone lookup (procedural rig)
    this.bones = {};
    const want = (key, prefix) => ({ key, prefix });
    const specs = [
      want('hips', 'hipsBone_'),
      want('rHip', 'R_Upleg_jnt_0_'), want('rThigh', 'R_Upleg_jnt_1_'),
      want('rShin', 'R_Dwleg_jnt_0_'), want('rFoot', 'R_Ftleg_jnt_0_'),
      want('rToe', 'R_Ftleg_jnt_1_'),
      want('lHip', 'L_Upleg_jnt_0_'), want('lThigh', 'L_Upleg_jnt_1_'),
      want('lShin', 'L_Dwleg_jnt_0_'), want('lFoot', 'L_Ftleg_jnt_0_'),
      want('lToe', 'L_Ftleg_jnt_1_'),
      want('cam', 'Cam_Bone_'),
    ];
    this.neck = [];
    this.tail = [];
    this.model.traverse((o) => {
      if (!o.isBone) return;
      for (const s of specs) {
        if (o.name.startsWith(s.prefix) && !this.bones[s.key]) this.bones[s.key] = o;
      }
      let m = o.name.match(/^Neck_Bone_(\d+)_/);
      if (m) this.neck[+m[1] - 1] = o;
      m = o.name.match(/^Tail_Bone_(\d+)_/);
      if (m) this.tail[+m[1] - 1] = o;
    });
    this.neck = this.neck.filter(Boolean);
    this.tail = this.tail.filter(Boolean);

    // rest pose snapshot: all procedural rotation is layered on top of it
    this._rest = new Map();
    const snap = (b) => { if (b && !this._rest.has(b)) this._rest.set(b, b.quaternion.clone()); };
    Object.values(this.bones).forEach(snap);
    this.neck.forEach(snap);
    this.tail.forEach(snap);

    // sensor eye on the head camera bone
    const eyeParent = this.bones.cam ?? this.holder;
    this.addEye(eyeParent, 0, 0, 0, 0.55);
    this.addWeakPoint('eye', eyeParent, 0, 0, 0, 0.42);

    this._gait = Math.random() * Math.PI * 2;
    this._lookW = 0;       // 0 = scanning, 1 = snapped onto target
    this._lookYaw = 0;
    this._lookPitch = 0;
    this._peckPose = 0;
  }

  onAlerted() {
    this.manager.alertNearby(this, 60);
  }

  chooseAttack(dist) {
    if (dist > this.attackRange * 1.25) return null;
    return {
      kind: 'peck',
      windup: 0.5, strike: 0.22, recover: 0.85, cooldown: 2.1,
      onStrike: () => {
        // lunge forward with the strike
        this.damagePlayer(15, 3.1, 0.15);
      },
      onUpdate: (a, dt) => {
        if (a.phase === 'windup') {
          this._peckPose = a.phaseT; // coil up & back
        } else if (a.phase === 'strike') {
          this._peckPose = 1 - a.phaseT * 2.4; // slam down & forward
          const step = 2.4 * dt / 0.22;
          this.moveRoot(Math.sin(this.heading) * step, Math.cos(this.heading) * step);
        } else {
          this._peckPose = -1.4 * (1 - a.phaseT);
        }
      },
      cleanup: () => { this._peckPose = 0; },
    };
  }

  _rot(bone, axis, angle) {
    if (!bone) return;
    _q.setFromAxisAngle(AXES[axis], angle);
    bone.quaternion.multiply(_q);
  }

  _resetPose() {
    for (const [b, q] of this._rest) b.quaternion.copy(q);
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    this._resetPose();
    const b = this.bones;

    /* ---- legs: distance-locked gait (no foot slide) ---- */
    const speed = this._speed;
    const stride = 1.05;
    this._gait += dt * speed * (Math.PI / stride);
    const moveK = THREE.MathUtils.clamp(speed / 2.2, 0, 1);
    const amp = moveK * (0.32 + 0.1 * THREE.MathUtils.clamp(speed / this.runSpeed, 0, 1));

    for (const side of [1, -1]) {
      const hip = side > 0 ? b.rHip : b.lHip;
      const shin = side > 0 ? b.rShin : b.lShin;
      const foot = side > 0 ? b.rFoot : b.lFoot;
      const ph = this._gait + (side > 0 ? 0 : Math.PI);
      const swing = Math.sin(ph) * amp;
      const lift = Math.max(0, Math.sin(ph + Math.PI / 2)) * amp * 1.5;
      this._rot(hip, 'x', swing - lift * 0.25);
      this._rot(shin, 'x', lift);
      this._rot(foot, 'x', -(swing + lift) * 0.55);
    }
    // body bob: two footfalls per cycle
    this.body.position.y = Math.abs(Math.sin(this._gait)) * 0.055 * moveK
      + Math.sin(t * 1.7) * 0.012; // idle breathe
    this.body.rotation.z = Math.sin(this._gait) * 0.035 * moveK;

    /* ---- neck: scan sweep vs target lock ---- */
    const hostile = this.state === 'alert' || this.state === 'attack';
    const wary = this.state === 'suspicious' || this.state === 'search';
    const wantLook = hostile || wary ? 1 : 0;
    this._lookW = THREE.MathUtils.damp(this._lookW, wantLook, hostile ? 10 : 4, dt);

    // where to look: player (hostile) or last stimulus (wary), in root space
    let tgtYaw = 0, tgtPitch = 0;
    if (this._lookW > 0.01) {
      _v.copy(hostile && this.ctx.player ? this.ctx.player.position : this.lastKnown);
      _v.y += 1.2;
      this.root.worldToLocal(_v);
      tgtYaw = THREE.MathUtils.clamp(Math.atan2(_v.x, _v.z), -1.35, 1.35);
      const hd = Math.hypot(_v.x, _v.z);
      tgtPitch = THREE.MathUtils.clamp(Math.atan2(_v.y - this.eyeHeight, Math.max(hd, 0.4)), -0.7, 0.5);
    }
    const snapK = hostile ? 12 : 5;
    this._lookYaw = THREE.MathUtils.damp(this._lookYaw, tgtYaw * this._lookW, snapK, dt);
    this._lookPitch = THREE.MathUtils.damp(this._lookPitch, tgtPitch * this._lookW, snapK, dt);

    // bone axes (calibrated by screenshot): Z = neck yaw, X = pitch (+ = up)
    const scanW = 1 - this._lookW;
    const scan = Math.sin(t * 0.75 + this._gait * 0.06) * 0.55 * scanW;
    const nod = Math.sin(t * 1.6) * 0.04 * scanW;
    const n = this.neck.length || 1;
    const yaw = (scan + this._lookYaw) * 1.15;
    const pitch = (this._lookPitch * 1.2 + nod + this._peckPose * 0.85);
    for (let i = 0; i < this.neck.length; i++) {
      this._rot(this.neck[i], 'z', yaw / n);
      this._rot(this.neck[i], 'x', pitch / n);
    }
    this._rot(b.cam, 'x', this._peckPose * 0.35);

    /* ---- tail sway ---- */
    const tailFreq = 1.6 + speed * 0.5;
    for (let i = 0; i < this.tail.length; i++) {
      this._rot(this.tail[i], 'z', Math.sin(t * tailFreq - i * 0.42) * (0.02 + moveK * 0.016));
    }
  }
}
