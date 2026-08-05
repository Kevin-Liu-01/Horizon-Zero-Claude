import * as THREE from 'three';
import { Machine, rollLoot, glowTexture } from './machine.js';
import { lensMesh, antennaMesh } from './parts.js';

/**
 * Watcher: rigged raptor scout (HZD level 5, HP 90). Fully procedural bone
 * animation — leg walk cycle, neck scan sweep, tail sway, alert head-snap,
 * lunge-peck attack. Components per research doc 1.3: the EYE is the fight
 * (weak part, not tearable — one sharpshot-class hit kills), plus a body
 * antenna tear-off. Chirps an alert to nearby machines.
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
      maxHealth: 90, // HZD-accurate (research 1.1); eye weak hit still ~3x
      armor: 0.05,
      level: 5,
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

    // sensor eye on the head camera bone — THE identifying feature
    // (research 0.4/1.2): big state-colored iris + halo, readable at 20 m+
    const eyeParent = this.bones.cam ?? this.holder;
    this.addEye(eyeParent, 0, 0, 0, 0.66, 0, 0.55); // soft halo over the lens
    this.addWeakPoint('eye', eyeParent, 0, 0, 0, 0.42);

    // --- components (research 1.3): eye = weak part, NOT tearable — "the
    // eye IS the fight". The lens iris is sensor-tagged (parts.js) so it
    // burns with the exact state color, and gives Focus a highlight target
    // and aimed eye shots real geometry to resolve on.
    this.addPart({
      name: 'eye', displayName: 'Eye',
      mesh: lensMesh({ r: 0.26 }),
      parent: eyeParent, pos: [0, 0, 0],
      tearHp: Infinity, weak: true, weakMult: 3,
      loot: [{ id: 'watcher-lens', n: 1 }],
    });
    // body antenna: cosmetic tear-off on the spine (sparks when shot)
    this.addPart({
      name: 'antenna', displayName: 'Antenna',
      mesh: antennaMesh({ len: 0.62 }),
      pos: [0, 1.22, -0.38], snap: true, snapTarget: [0, 0.7, -0.3],
      tearHp: 18, settleY: 0.1,
      loot: [{ id: 'wire', n: 1 }],
    });

    // corpse loot (research: shards + element resources + wire; lens trade)
    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 10, max: 18 },
      { id: 'wire', min: 1, max: 2 },
      { id: 'sparker', min: 0, max: 2 },
      { id: 'watcher-lens', n: 1, chance: 0.8 },
    ]);

    // effective leg pendulum length (hip→foot, world meters) — the walk cycle
    // amplitude is derived from it so stance feet plant instead of moonwalking
    this.root.updateWorldMatrix(true, true);
    this._legLen = 1.0;
    if (this.bones.rHip && this.bones.rFoot) {
      const f = new THREE.Vector3();
      this.bones.rHip.getWorldPosition(_v);
      this.bones.rFoot.getWorldPosition(f);
      this._legLen = Math.max(0.5, _v.distanceTo(f));
    }

    this._gait = Math.random() * Math.PI * 2;
    this._lookW = 0;       // 0 = scanning, 1 = snapped onto target
    this._lookYaw = 0;
    this._lookPitch = 0;
    this._peckPose = 0;
    this._rear = 0;        // alert rear-up pose blend
    this._cdFlash = 2;     // Blinding Stun Flash cooldown (research 1.4)
    this._cdBlast = 4;     // Energy Blast cooldown (research 1.4)
  }

  onAlerted() {
    this.manager.alertNearby(this, 60);
  }

  /** Ticked from Machine.update() — runs even under lowLOD/stun. */
  tickCooldowns(dt) {
    this._cdFlash -= dt;
    this._cdBlast -= dt;
  }

  /** Death crumple: legs buckle, neck kinks slack — not a parked robot. */
  onDeathPose(k) {
    this._resetPose();
    const b = this.bones;
    for (const side of [1, -1]) {
      const hip = side > 0 ? b.rHip : b.lHip;
      const shin = side > 0 ? b.rShin : b.lShin;
      const foot = side > 0 ? b.rFoot : b.lFoot;
      this._rot(hip, 'x', (0.7 + side * 0.15) * k);
      this._rot(shin, 'x', 1.15 * k);
      this._rot(foot, 'x', -0.7 * k);
    }
    const n = this.neck.length || 1;
    for (let i = 0; i < this.neck.length; i++) {
      this._rot(this.neck[i], 'x', -0.95 * k / n);
      this._rot(this.neck[i], 'z', 0.85 * this._deathSide * k / n);
    }
    this._rot(b.cam, 'x', -0.4 * k);
    const tn = this.tail.length || 1;
    for (let i = 0; i < this.tail.length; i++) {
      this._rot(this.tail[i], 'z', 0.5 * this._deathSide * k / tn);
    }
  }

  chooseAttack(dist) {
    // Blinding Stun Flash (research 1.4): 6-11 m, eye flares super-bright,
    // 1.5 s screen whiteout is the HUD's side ('watcher-flash')
    if (dist > 5.5 && dist < 11.5 && this._cdFlash <= 0) {
      this._cdFlash = 12;
      return this._flashAttack();
    }
    // Energy Blast (research 1.4/1.7): concussive orb when it can't close in
    if (dist > 7 && dist < 26 && this._cdBlast <= 0) {
      this._cdBlast = 6.5;
      return this._energyBlast();
    }
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

  /** Blinding Stun Flash: crane up, lens ramps white-hot, then a blinding
   *  burst. No damage — the payoff is the player's 1.5 s whiteout. */
  _flashAttack() {
    return {
      kind: 'flash',
      windup: 0.8, strike: 0.2, recover: 1.0, cooldown: 2.4,
      onUpdate: (a) => {
        if (a.phase === 'windup') {
          this._peckPose = a.phaseT * 0.9;    // crane up, eye on the player
          this._eyeFlare = 1 + a.phaseT * 3;  // lens ramps to white-hot
        } else if (a.phase === 'recover') {
          this._peckPose = 0.9 * (1 - a.phaseT);
        }
      },
      onStrike: () => {
        this._eyeFlare = 8;
        (this.bones.cam ?? this.body).getWorldPosition(_v);
        this._flashBurst(_v);
        this.ctx.events.emit('watcher-flash', { machine: this });
      },
      cleanup: () => { this._peckPose = 0; },
    };
  }

  /** Energy Blast: kiting variety — small concussive orb, 12 dmg. */
  _energyBlast() {
    return {
      kind: 'energy-blast',
      windup: 0.6, strike: 0.15, recover: 0.75, cooldown: 2.2,
      onUpdate: (a) => {
        if (a.phase === 'windup') {
          this._peckPose = a.phaseT * 0.5;
          this._eyeFlare = 0.6 + a.phaseT * 1.6;
        } else if (a.phase === 'recover') {
          this._peckPose = -0.3 * (1 - a.phaseT); // recoil dip
        }
      },
      onStrike: () => this._fireOrb(),
      cleanup: () => { this._peckPose = 0; },
    };
  }

  /** Expanding white-out burst at the eye (flash strike FX). */
  _flashBurst(pos) {
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture(), color: i === 0 ? 0xffffff : 0xcfe8ff,
        transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false,
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos);
      const s0 = i === 0 ? 1.2 : 2.4;
      s.scale.setScalar(s0);
      this.ctx.scene.add(s);
      let t = 0;
      const dur = i === 0 ? 0.35 : 0.55;
      this._fx.push({
        update: (dt) => {
          t += dt;
          const k = Math.min(1, t / dur);
          s.scale.setScalar(s0 + k * (i === 0 ? 10 : 5));
          mat.opacity = 0.95 * (1 - k * k);
          if (k >= 1) { this.ctx.scene.remove(s); mat.dispose(); return false; }
          return true;
        },
      });
    }
  }

  /** Concussive energy orb: glow-trailed projectile from the eye. */
  _fireOrb() {
    const p = this.ctx.player;
    (this.bones.cam ?? this.body).getWorldPosition(_v);
    const start = _v.clone();
    const tgt = p
      ? new THREE.Vector3(
        p.position.x + p.velocity.x * 0.5,
        p.position.y + 1.0,
        p.position.z + p.velocity.z * 0.5,
      )
      : new THREE.Vector3(
        start.x + Math.sin(this.heading) * 20, start.y,
        start.z + Math.cos(this.heading) * 20,
      );
    const vel = tgt.sub(start);
    const d = vel.length();
    vel.normalize().multiplyScalar(17);
    vel.y += d * 0.05; // slight lob
    const coreMat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xd8f2ff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const core = new THREE.Sprite(coreMat);
    core.scale.setScalar(0.4);
    core.position.copy(start);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x54b8ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.1);
    glow.position.copy(start);
    this.ctx.scene.add(core);
    this.ctx.scene.add(glow);
    let t = 0;
    const terrain = this.ctx.terrain;
    const done = () => {
      this.ctx.scene.remove(core);
      this.ctx.scene.remove(glow);
      coreMat.dispose();
      glowMat.dispose();
      return false;
    };
    this._fx.push({
      update: (dt) => {
        t += dt;
        vel.y -= 3.5 * dt; // slow energy droop, flies almost flat
        core.position.addScaledVector(vel, dt);
        glow.position.copy(core.position);
        glowMat.opacity = 0.5 + Math.sin(t * 30) * 0.15;
        const p2 = this.ctx.player;
        let nearPlayer = false;
        if (p2) {
          const dx = core.position.x - p2.position.x;
          const dy = core.position.y - (p2.position.y + 1.0);
          const dz = core.position.z - p2.position.z;
          nearPlayer = dx * dx + dy * dy + dz * dz < 1.7;
        }
        const gy = terrain.getHeight(core.position.x, core.position.z);
        if (nearPlayer || core.position.y <= gy + 0.15 || t > 3.5) {
          const px = core.position.x, pz = core.position.z;
          this.spawnShockRing(px, pz, 1.8, 0.28, 0, 0);
          if (p2 && Math.hypot(p2.position.x - px, p2.position.z - pz) < 1.7) {
            this.ctx.events.emit('player-damage', { amount: 12, from: this });
          }
          _v.set(px, Math.max(core.position.y, gy + 0.4), pz);
          this._sparkBurst(_v, 8, 0x9fd8ff);
          return done();
        }
        return true;
      },
    });
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
    const runK = THREE.MathUtils.clamp(speed / this.runSpeed, 0, 1);
    const stride = 1.05 + 0.5 * runK;
    this._gait += dt * speed * (Math.PI / stride);
    const moveK = THREE.MathUtils.clamp(speed / 2.2, 0, 1);
    // stride geometry: hip must sweep ~stride/legLen rad over the stance
    // half-cycle or the planted foot moonwalks under the body
    const amp = moveK * THREE.MathUtils.clamp(stride / (2 * this._legLen), 0.3, 0.8);

    const HALF = Math.PI / 2;
    const TAU = Math.PI * 2;
    for (const side of [1, -1]) {
      const hip = side > 0 ? b.rHip : b.lHip;
      const shin = side > 0 ? b.rShin : b.lShin;
      const foot = side > 0 ? b.rFoot : b.lFoot;
      let ph = this._gait + (side > 0 ? 0 : Math.PI);
      ph = ((ph % TAU) + TAU) % TAU;
      let swing, lift;
      if (ph >= HALF && ph <= 3 * HALF) {
        // stance [pi/2..3pi/2]: LINEAR counter-sweep — gait phase advances
        // with distance, so the planted foot stays world-fixed
        swing = 1 - 2 * (ph - HALF) / Math.PI;
        lift = 0;
      } else {
        // swing-through: smooth return with the foot tucked up
        const u = (ph < HALF ? ph + HALF : ph - 3 * HALF) / Math.PI;
        swing = -Math.cos(Math.PI * u);
        lift = Math.sin(Math.PI * u);
      }
      // shin +x drives the ankle forward/DOWN on this rig — tuck is negative
      const hipRot = amp * (swing + 0.35 * lift);
      const shinRot = -amp * 1.5 * lift;
      this._rot(hip, 'x', hipRot);
      this._rot(shin, 'x', shinRot);
      this._rot(foot, 'x', -(hipRot + shinRot) * 0.6);
    }
    // body bob: two footfalls per cycle
    this.body.position.y = Math.abs(Math.sin(this._gait)) * 0.07 * moveK
      + Math.sin(t * 1.7) * 0.012; // idle breathe
    this.body.rotation.z = Math.sin(this._gait) * 0.035 * moveK;

    /* ---- neck: scan sweep vs target lock ---- */
    const hostile = this.state === 'alert' || this.state === 'attack';
    const wary = this.state === 'suspicious' || this.state === 'search';
    const wantLook = hostile || wary ? 1 : 0;
    this._lookW = THREE.MathUtils.damp(this._lookW, wantLook, hostile ? 10 : 4, dt);
    // sharp rear-up when it first goes hostile
    this._rear = THREE.MathUtils.damp(
      this._rear, this.state === 'alert' ? 1 : 0, this.state === 'alert' ? 14 : 5, dt,
    );
    this.body.rotation.x = -this._rear * 0.15; // chest lifts off the ground line

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
    // periscope: the neck carries the head high while scanning (watcher, not
    // low drone), and rears up harder on alert
    const periscope = 0.5 * scanW + this._rear * 0.45;
    const pitch = (periscope + this._lookPitch * 1.2 + nod + this._peckPose * 0.85);
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
