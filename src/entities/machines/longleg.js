import * as THREE from 'three';
import { Machine, rollLoot, glowTexture } from './machine.js';
import { antennaMesh, canisterMesh, powerCellMesh, lensMesh, pulseGlow } from './parts.js';

/**
 * Longleg: T2 recon biped (roster-v2 §4 — terror bird). Strut patrol on its
 * authored Walk/Run clips (AnimationMixer, speed-synced timeScales) with an
 * echo-ping scan pause; on alert it screams the whole valley down. Attacks:
 * STUN-SCREAM nova (concussion sacs glow first) and a JET BLAST flame cone
 * up close. Components: head ALARM ANTENNA (torn = can't summon
 * reinforcements), chest concussion sacs x2 (weak, torn = scream disabled),
 * lower-back power cell (shock). Body weak to shock.
 *
 * Model: Birb.gltf (Quaternius Ultimate Monsters, CC0), 43-joint rig; atlas
 * texture desaturated to chassis grey at load; lens part = the ONE sensor.
 */

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _AX = new THREE.Vector3(1, 0, 0);
const _AY = new THREE.Vector3(0, 1, 0);

export class Longleg extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'longleg',
      displayName: 'Longleg',
      rigged: true,
      yawFix: 0,
      maxHealth: 300,
      armor: 0.1,
      level: 12,
      elemWeak: 'shock',
      walkSpeed: 2.9,
      runSpeed: 9.5,
      turnRate: 2.1,
      sightRange: 50, // recon: long eyes
      hearRange: 36,
      eyeHeight: 3.1,
      attackRange: 12,
      bodyRadius: 1.35,
      ...opts,
    });

    this._canAlarm = true;
    this._pingT = 9 + Math.random() * 9;
    this._pinging = 0;
    this._cdScream = 4;
    this._cdJet = 2;
    this._cdPeck = 1;
    this._scanYaw = 0;

    // --- bones (procedural neck layered over the mixer output)
    this.bones = {};
    this.model.traverse((o) => {
      if (o.isBone && !this.bones[o.name]) this.bones[o.name] = o;
    });

    // --- AnimationMixer: Idle / Walk / Run blended by speed
    const src = ctx.assets.models.longleg;
    this.mixer = new THREE.AnimationMixer(this.model);
    this._act = {};
    for (const clip of src.animations ?? []) {
      const a = this.mixer.clipAction(clip);
      this._act[clip.name] = a;
      if (clip.name === 'Idle' || clip.name === 'Walk' || clip.name === 'Run') {
        a.play();
        a.setEffectiveWeight(clip.name === 'Idle' ? 1 : 0);
      } else if (clip.name === 'Death') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      } else if (clip.name === 'Punch' || clip.name === 'HitReact' || clip.name === 'Jump') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
      }
    }
    // walk clip ground speed (for foot-sync): Foot.L travels ~1.1 m of model
    // space per 1.0 s cycle at scale 1.2 -> ~2.6 m/s at timeScale 2
    this._walkRef = 1.35; // m/s covered by the Walk clip at timeScale 1
    this._runRef = 6.2;   // m/s covered by Run at timeScale 1

    // sole calibration for debugFeet (gate A6)
    this._soleOff = 0;
    {
      let sum = 0, n = 0;
      for (const b of [this._footBone('L'), this._footBone('R')]) {
        if (!b) continue;
        b.getWorldPosition(_v);
        sum += _v.y - ctx.terrain.getHeight(_v.x, _v.z);
        n++;
      }
      if (n) this._soleOff = sum / n;
    }

    this._buildParts();
    this._deathRoll = 0.35; // Death clip supplies most of the collapse
    this._deathSink = 0.03;
  }

  /** Convert a BODY-space point (meters) into `bone`-frame meters usable as
   *  an addPart pos (addPart divides by the bone's world scale). */
  _bonePos(bone, bx, by, bz) {
    _v.set(bx, by, bz);
    this.body.updateWorldMatrix(true, false);
    this.body.localToWorld(_v);
    bone.updateWorldMatrix(true, false);
    bone.worldToLocal(_v);
    const s = this._worldScale(bone);
    return [_v.x * s, _v.y * s, _v.z * s];
  }

  _buildParts() {
    const head = this.bones.Head ?? this.body;
    const lensPos = head === this.body ? [0, 3.0, 0.75] : this._bonePos(head, 0, 3.0, 0.78);
    this.addPart({
      name: 'lens', displayName: 'Sensor Lens',
      mesh: lensMesh({ r: 0.13 }),
      parent: head,
      pos: lensPos,
      snap: false, orient: false,
      tearHp: Infinity,
      loot: [{ id: 'watcher-lens', n: 1 }],
    });
    this.addEye(head, lensPos[0], lensPos[1], lensPos[2] + 0.05, 0.5, 0, 0.45);
    this.addWeakPoint('head', head, lensPos[0], lensPos[1], lensPos[2], 0.5, 2.5);

    // --- components (roster-v2 §4 Longleg)
    // 1. Alarm antenna on the crown: torn = can't summon reinforcements.
    const antPos = head === this.body ? [0, 3.4, 0.3] : this._bonePos(head, 0, 3.42, 0.3);
    this._antennaPart = this.addPart({
      name: 'alarm-antenna', displayName: 'Alarm Antenna',
      mesh: antennaMesh({ len: 0.6 }),
      parent: head,
      pos: antPos,
      snap: false, orient: false,
      tearHp: 20, settleY: 0.1,
      loot: [{ id: 'wire', n: 2 }],
      onTorn: () => { this._canAlarm = false; },
    });
    // 2. Concussion sacs x2 (chest): glow through the scream windup; torn =
    //    stun-scream disabled. Weak parts (they burst satisfyingly).
    for (const side of [1, -1]) {
      this.addPart({
        name: side > 0 ? 'concussion-sac-r' : 'concussion-sac-l',
        displayName: 'Concussion Sac',
        mesh: canisterMesh({ color: 0xd8f4ff, r: 0.11, h: 0.3 }),
        pos: [side * 0.3, 1.95, 0.52], snap: true,
        snapTarget: [side * 0.08, 1.9, 0],
        tearHp: 30, settleY: 0.18,
        weak: true, weakMult: 2,
        linkedAttack: 'scream',
        loot: [{ id: 'echo-shell', n: 1 }],
        update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 2.6),
      });
    }
    // 3. Power cell (lower back): shock detonation = self-stun.
    this.addPart({
      name: 'power-cell', displayName: 'Power Cell',
      mesh: powerCellMesh({ color: 0xffd23d }),
      pos: [0, 2.15, -0.55], snap: true, snapTarget: [0, 2.1, 0],
      tearHp: 26, elemental: 'shock', settleY: 0.2,
      loot: [{ id: 'sparker', n: 2 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 4.2),
    });

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 20, max: 32 },
      { id: 'wire', min: 2, max: 3 },
      { id: 'echo-shell', min: 1, max: 2 },
      { id: 'sparker', min: 1, max: 2 },
      { id: 'machine-heart', n: 1, chance: 0.15 },
    ]);

    this._deathRoll = 0.35; // Death clip supplies most of the collapse
    this._deathSink = 0.03;
  }

  /** GLTFLoader strips '.' from node names ('Foot.L' -> 'FootL'). */
  _footBone(side) {
    return this.bones[`Foot${side}`] ?? this.bones[`Foot.${side}`] ?? null;
  }

  tickCooldowns(dt) {
    this._cdScream -= dt;
    this._cdJet -= dt;
    this._cdPeck -= dt;
    if (this.state === 'patrol' || this.state === 'return') this._pingT -= dt;
  }

  /** Recon alarm: pulls combat machines to the caller (roster §2) — unless
   *  the antenna was torn off. */
  onAlerted() {
    if (!this._canAlarm || !this._antennaPart?.attached) return;
    this.manager.alertNearby(this, 75);
    this._eyeFlare = 2.5;
  }

  /* --------------------- echo-ping scan pause --------------------- */

  _statePatrol(dt) {
    if (this._pinging > 0) {
      this._pinging -= dt;
      this._speed = THREE.MathUtils.damp(this._speed, 0, 7, dt);
      this._scanYaw = Math.sin(this._stateT * 1.3) * 0.7;
      this._pingClock = (this._pingClock ?? 0) - dt;
      if (this._pingClock <= 0 && !this.lowLOD) {
        this._pingClock = 1.1;
        this._pingRing();
        const p = this.ctx.player;
        if (p && p.moveSpeed > 0.5 && this.playerDist < 30) {
          this.suspicion = Math.min(1.2, this.suspicion + 0.4);
          this.lastKnown.copy(p.position);
        }
      }
      return;
    }
    this._scanYaw = THREE.MathUtils.damp(this._scanYaw, 0, 4, dt);
    super._statePatrol(dt);
    if (this._pingT <= 0) {
      this._pingT = 15 + Math.random() * 8;
      this._pinging = 3.4;
    }
  }

  /** Expanding echolocation ring from the head. */
  _pingRing() {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xa8e8ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    (this.bones.Head ?? this.body).getWorldPosition(_v);
    s.position.copy(_v);
    s.scale.setScalar(0.6);
    this.ctx.scene.add(s);
    let t = 0;
    this._fx.push({
      update: (dt) => {
        t += dt;
        const k = t / 1.0;
        s.scale.setScalar(0.6 + k * 11);
        mat.opacity = 0.5 * (1 - k);
        if (k >= 1) { this.ctx.scene.remove(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /* --------------------- attacks --------------------- */

  chooseAttack(dist) {
    if (dist < 13 && this._cdScream <= 0 && !this.attackDisabled('scream')) {
      this._cdScream = 11;
      return this._scream();
    }
    if (dist < 6.5 && this._cdJet <= 0) {
      this._cdJet = 7;
      return this._jetBlast();
    }
    if (dist < 4.4 && this._cdPeck <= 0) {
      this._cdPeck = 2.6;
      return this._peck();
    }
    return null;
  }

  /** Stun-scream nova: neck rears, sacs flare, radial concussion ring. */
  _scream() {
    return {
      kind: 'scream',
      windup: 1.0, strike: 0.3, recover: 1.2, cooldown: 2.5,
      onWindup: () => { this._sacFlare = 1; },
      onStrike: () => {
        this.spawnShockRing(this.position.x, this.position.z, 13, 0.7, 16, 10);
        const p = this.ctx.player;
        if (p) p._shake = Math.min(1, (p._shake ?? 0) + 0.5);
        this.ctx.events.emit('machine-attack', { machine: this, kind: 'scream-burst' });
      },
      onUpdate: (a) => {
        if (a.phase === 'windup') {
          this._neckRear = a.phaseT * 0.7;
          this._eyeFlare = 1 + a.phaseT * 2;
        } else if (a.phase === 'strike') {
          this._neckRear = 0.7 - a.phaseT * 0.5;
        } else {
          this._neckRear = 0.2 * (1 - a.phaseT);
        }
      },
      cleanup: () => { this._neckRear = 0; this._sacFlare = 0; },
    };
  }

  /** Jet blast: wings sweep back (Punch clip), flame cone + knockback. */
  _jetBlast() {
    let flameClock = 0;
    return {
      kind: 'jet-blast',
      windup: 0.6, strike: 0.35, recover: 0.9, cooldown: 2,
      onWindup: () => { this._oneShot('Punch', 0.25); },
      onStrike: () => {
        if (this.damagePlayer(24, 7, 0.25)) this.knockbackPlayer(13);
      },
      onUpdate: (a, dt) => {
        if (a.phase === 'strike' || (a.phase === 'recover' && a.phaseT < 0.3)) {
          flameClock -= dt;
          if (flameClock <= 0 && !this.lowLOD) {
            flameClock = 0.05;
            // flame cone out of the chest jets
            const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
            const spread = (Math.random() - 0.5) * 2.4;
            _v.set(
              this.position.x + fx * (1.5 + Math.random() * 3.5) - fz * spread,
              this.position.y + 0.5 + Math.random() * 1.4,
              this.position.z + fz * (1.5 + Math.random() * 3.5) + fx * spread,
            );
            this._flamePuff(_v);
          }
        }
      },
    };
  }

  /** Quick beak thrust. */
  _peck() {
    return {
      kind: 'peck',
      windup: 0.32, strike: 0.16, recover: 0.55, cooldown: 1.6,
      onStrike: () => {
        this.damagePlayer(14, 4.8, 0.2);
      },
      onUpdate: (a) => {
        if (a.phase === 'windup') this._neckRear = a.phaseT * 0.35;
        else if (a.phase === 'strike') this._neckRear = 0.35 - a.phaseT * 0.8;
        else this._neckRear = -0.45 * (1 - a.phaseT);
      },
      cleanup: () => { this._neckRear = 0; },
    };
  }

  _oneShot(name, fade = 0.25) {
    const a = this._act[name];
    if (!a) return;
    a.reset();
    a.setEffectiveWeight(1);
    a.fadeIn(fade);
    a.play();
  }

  /* --------------------- per-frame --------------------- */

  animate(dt, t) {
    if (this.state === 'dead') return;
    // clip mixing: idle <-> walk <-> run by actual speed, foot-synced
    const speed = this._speed;
    const moveK = THREE.MathUtils.clamp(speed / 1.1, 0, 1);
    const runK = THREE.MathUtils.clamp((speed - 3.2) / 3.4, 0, 1);
    const aIdle = this._act.Idle, aWalk = this._act.Walk, aRun = this._act.Run;
    if (aIdle && aWalk && aRun) {
      aIdle.setEffectiveWeight(1 - moveK);
      aWalk.setEffectiveWeight(moveK * (1 - runK));
      aRun.setEffectiveWeight(moveK * runK);
      aWalk.timeScale = THREE.MathUtils.clamp(speed / this._walkRef, 0.5, 2.6);
      aRun.timeScale = THREE.MathUtils.clamp(speed / this._runRef, 0.6, 1.9);
    }
    this.mixer.update(dt);

    // procedural neck layered over the clips: scan sweep, alert look, rear
    const neck = this.bones.Neck;
    const head = this.bones.Head;
    const hostile = this.state === 'alert' || this.state === 'attack';
    if (neck) {
      if (this._scanYaw) {
        _q.setFromAxisAngle(_AY, this._scanYaw);
        neck.quaternion.multiply(_q);
      }
      const rear = (this._neckRear ?? 0) + (hostile ? 0.12 : 0);
      if (rear) {
        _q.setFromAxisAngle(_AX, -rear);
        neck.quaternion.multiply(_q);
      }
    }
    if (head && this._scanYaw) {
      _q.setFromAxisAngle(_AY, this._scanYaw * 0.5);
      head.quaternion.multiply(_q);
    }
    // concussion sacs flare through the scream windup
    if (this._sacFlare) {
      for (const p of this.parts) {
        if (p.attached && p.name.startsWith('concussion')) {
          const core = p.mesh.children[0]?.userData?.coreMat;
          if (core) core.emissiveIntensity = 3.2 + Math.sin(t * 30) * 1.2;
        }
      }
    }
  }

  onDeathPose() {
    // Death clip owns the collapse; mixer must keep stepping while dead
    this.mixer.update(1 / 60);
  }

  onStateChange(name) {
    if (name === 'dead') {
      const d = this._act.Death;
      if (d) {
        this._act.Idle?.fadeOut(0.15);
        this._act.Walk?.fadeOut(0.15);
        this._act.Run?.fadeOut(0.15);
        d.reset();
        d.fadeIn(0.1);
        d.play();
      }
    }
  }

  /** Gate A6 contract: clip-driven feet, planted when at ground height. */
  debugFeet() {
    const out = [];
    const g = this.ctx.terrain;
    for (const name of ['L', 'R']) {
      const b = this._footBone(name);
      if (!b) continue;
      const world = b.getWorldPosition(new THREE.Vector3());
      world.y -= this._soleOff;
      const ground = g.getHeight(world.x, world.z);
      out.push({
        name,
        world,
        planted: this.alive && !this.lowLOD
          && world.y - ground < 0.1 && this._speed < 6,
      });
    }
    return out;
  }
}
