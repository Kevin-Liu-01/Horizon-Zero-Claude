import * as THREE from 'three';
import { Machine, rollLoot, glowTexture } from './machine.js';
import { radarMesh, powerCellMesh, pulseGlow } from './parts.js';
import { buildRig } from './autorig.js';
import { GaitController } from './gait.js';

/**
 * Scrapper: T1 pack scavenger (roster-v2 §4 — hyena role, recast onto the
 * Robocat biped chassis). Waddling lope patrol with a RADAR SCAN PAUSE every
 * ~20 s (dorsal dish spins up, ping rings, detects moving prey), pack
 * flanking on attack, mouth LASER BURST at range and a claw swipe up close.
 * Components: back radar (tear = scanning blinded, detection cut) and a
 * power cell between the haunches (shock detonation = self-stun AoE).
 * Sensor: the yellow helmet eyes were converted to the state-color sensor by
 * the style pass (variety-assets.js).
 *
 * Model: Robocat.glb (Jordan Hill, CC-BY 3.0), display stand excised at
 * preprocess. Static -> autorig biped (2-leg spec fitted to the sculpt).
 */

// body space: +Z forward, H 1.5, feet at (±0.26, 0.03)
const SCRAPPER_RIG = {
  spine: [
    { name: 'pelvis', pos: [0, 0.6, 0.02], r: 0.4 },
    { name: 'spine', pos: [0, 0.85, -0.02], r: 0.46 },
    { name: 'chest', pos: [0, 1.05, 0.0], r: 0.44 },
    { name: 'head', pos: [0, 1.28, 0.02], r: 0.42, tip: [0, 1.48, 0.06] },
  ],
  tail: [
    { name: 'tail1', pos: [0, 0.45, -0.35], r: 0.24 }, // dangling cable tuft
  ],
  legGateY: 0.5,
  legs: [
    { id: 'L', parent: 'pelvis', hinge: 1, hip: [-0.15, 0.55, 0.02], knee: [-0.2, 0.32, 0.04], ankle: [-0.25, 0.13, 0.02], toe: [-0.26, 0.02, 0.15], r: 0.16, restFoot: [-0.26, 0.06] },
    { id: 'R', parent: 'pelvis', hinge: 1, hip: [0.15, 0.55, 0.02], knee: [0.2, 0.32, 0.04], ankle: [0.25, 0.13, 0.02], toe: [0.26, 0.02, 0.15], r: 0.16, restFoot: [0.26, 0.06] },
  ],
};

const _v = new THREE.Vector3();

export class Scrapper extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'scrapper',
      displayName: 'Scrapper',
      rigged: false,
      yawFix: -Math.PI / 2, // sculpt faces +X
      maxHealth: 120,
      armor: 0.05,
      level: 6,
      walkSpeed: 2.3,
      runSpeed: 6,
      turnRate: 3.2,
      sightRange: 34,
      hearRange: 24,
      eyeHeight: 1.3,
      attackRange: 26, // laser burst envelope; melee gates on real distance
      bodyRadius: 0.7,
      ...opts,
    });

    this._flank = opts.flank ?? 0; // -1 | 0 | 1 — pack spread on approach
    this._scanT = 8 + Math.random() * 12;
    this._scanning = 0;
    this._pingClock = 0;
    this._cdLaser = 2 + Math.random() * 2;
    this._cdClaw = 1;

    // mouth anchor for the laser (added pre-rig -> reparents onto the head bone)
    this._muzzle = new THREE.Object3D();
    this._muzzle.position.set(0, 1.22, 0.32);
    this.body.add(this._muzzle);

    this.addWeakPoint('head', this.body, 0, 1.3, 0.22, 0.3, 2.5);

    // --- components (roster-v2 §4 Scrapper)
    // 1. Radar dish on the jetpack: spins during scan pauses. Torn ->
    //    scanning blinded + detection cut.
    const radar = radarMesh({ accent: 0x9fd8ff });
    radar.scale.setScalar(0.3);
    this._radarPart = this.addPart({
      name: 'radar', displayName: 'Radar',
      mesh: radar,
      pos: [0, 1.24, -0.32], snap: false, orient: false,
      tearHp: 25, settleY: 0.2,
      loot: [{ id: 'echo-shell', n: 1 }, { id: 'wire', n: 1 }],
      update: (dt) => {
        radar.userData.fin.rotation.y += dt * (this._scanning > 0 ? 11 : 1.3);
      },
      onTorn: () => {
        this.sightRange *= 0.65;
        this._scanT = Infinity; // scanning blinded
        this._scanning = 0;
      },
    });
    // 2. Power cell between the haunches: shock detonation = self-stun AoE.
    this.addPart({
      name: 'power-cell', displayName: 'Power Cell',
      mesh: powerCellMesh({ color: 0xffd23d }),
      pos: [0, 0.78, -0.4], snap: true, snapTarget: [0, 0.7, -0.1],
      tearHp: 20, elemental: 'shock', settleY: 0.18,
      loot: [{ id: 'sparker', n: 2 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 5),
    });

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 8, max: 14 },
      { id: 'wire', min: 1, max: 2 },
      { id: 'sparker', min: 1, max: 2 },
      { id: 'echo-shell', n: 1, chance: 0.5 },
    ]);

    // --- auto-rig + waddle gait
    buildRig(this, SCRAPPER_RIG);
    this.gait = new GaitController(this, this.rig, {
      walk: { stride: 0.55, duty: 0.62, lift: 0.09, offsets: { L: 0, R: 0.5 } },
      run: { stride: 1.1, duty: 0.42, lift: 0.22, offsets: { L: 0, R: 0.5 } },
      runRef: 6,
      rollAmp: 0.1,     // comic little waddle
      impactAmp: 0.05,
      breatheRate: 1.7,
      stepDustSpeed: 4.5,
      turnRadius: 0.5,
      lookClampYaw: 1.1,
      stanceFlex: 0.05, // legs bind near full extension — keep IK headroom
    });
    this.gait.update(0.016, 0);
    this._deathRoll = 0.75; // small chassis tips right over
    this._deathSink = 0.05;
  }

  onDeathPose(k, deathT) {
    this.gait.deathPose(k, deathT);
  }

  tickCooldowns(dt) {
    this._cdLaser -= dt;
    this._cdClaw -= dt;
    if (this.state === 'patrol' || this.state === 'return') this._scanT -= dt;
  }

  /* --------------------- radar scan pause --------------------- */

  _statePatrol(dt) {
    if (this._scanning > 0) {
      this._scanning -= dt;
      this._speed = THREE.MathUtils.damp(this._speed, 0, 8, dt);
      this.heading += dt * 0.55; // slow sweep in place
      this._pingClock -= dt;
      if (this._pingClock <= 0 && !this.lowLOD) {
        this._pingClock = 0.9;
        this._pingRing();
        // radar actually detects: moving human-sized objects (roster)
        const p = this.ctx.player;
        if (p && p.moveSpeed > 0.5 && this.playerDist < 24) {
          this.suspicion = Math.min(1.2, this.suspicion + 0.45);
          this.lastKnown.copy(p.position);
        }
      }
      return;
    }
    super._statePatrol(dt);
    if (this._scanT <= 0 && this._radarPart.attached) {
      this._scanT = 16 + Math.random() * 9;
      this._scanning = 3.2;
      this._eyeFlare = 1.5;
    }
  }

  /** Expanding radar ping ring above the dish. */
  _pingRing() {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x9fd8ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    this._radarPart.mesh.getWorldPosition(_v);
    s.position.copy(_v);
    s.position.y += 0.35;
    s.scale.setScalar(0.4);
    this.ctx.scene.add(s);
    let t = 0;
    this._fx.push({
      update: (dt) => {
        t += dt;
        const k = t / 0.8;
        s.scale.setScalar(0.4 + k * 7);
        mat.opacity = 0.55 * (1 - k);
        if (k >= 1) { this.ctx.scene.remove(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /* --------------------- pack flanking --------------------- */

  _stateAttack(dt) {
    if (this._attack) { this._updateAttack(dt); return; }
    this._attackCd -= dt;
    const p = this.ctx.player;
    if (!p) { this.setState('return'); return; }
    if (this._unseenT > 4.5) { this.setState('search'); return; }
    const dist = this.playerDist;
    if (dist > 7) {
      // flank: approach a point offset to the player's side, collapsing the
      // offset as the pack closes in — three scrappers arrive on three arcs
      _v.set(p.position.x - this.position.x, 0, p.position.z - this.position.z).normalize();
      const off = this._flank * THREE.MathUtils.clamp(dist * 0.45, 2, 7);
      this._moveToward(
        p.position.x + -_v.z * off,
        p.position.z + _v.x * off,
        this.runSpeed, dt,
      );
    } else {
      this._face(p.position.x, p.position.z, dt);
      this._speed = THREE.MathUtils.damp(this._speed, 0, 8, dt);
    }
    if (this._attackCd <= 0) {
      const a = this.chooseAttack?.(dist);
      if (a) this._startAttack(a);
    }
  }

  /* --------------------- attacks --------------------- */

  chooseAttack(dist) {
    if (dist < 3.4 && this._cdClaw <= 0) {
      this._cdClaw = 2.4;
      return this._clawSwipe();
    }
    if (dist > 7 && dist < 29 && this._cdLaser <= 0) {
      this._cdLaser = 6;
      return this._laserBurst();
    }
    return null;
  }

  /** Laser Burst 8-29 m (roster): mouth glows, then a stagger of red bolts. */
  _laserBurst() {
    let fired = 0;
    const total = 7;
    const burst = { hits: 0 };
    return {
      kind: 'laser',
      windup: 0.55, strike: 0.75, recover: 0.8, cooldown: 2,
      onUpdate: (a) => {
        if (a.phase === 'windup') {
          this._eyeFlare = 0.8 + a.phaseT * 2.2;
          this.gait.pose.headPitch = -0.15 * a.phaseT; // head rears to aim
        } else if (a.phase === 'strike') {
          this.gait.pose.headPitch = 0.06;
          const due = Math.min(total, Math.floor(a.phaseT * total) + 1);
          while (fired < due) {
            fired += 1;
            this._fireLaserBolt(burst);
          }
        } else {
          this.gait.pose.headPitch = 0;
        }
      },
      cleanup: () => { this.gait.pose.headPitch = 0; },
    };
  }

  _fireLaserBolt(burst) {
    const p = this.ctx.player;
    this._muzzle.getWorldPosition(_v);
    const start = _v.clone();
    const tgt = p
      ? new THREE.Vector3(
        p.position.x + p.velocity.x * 0.35 + (Math.random() - 0.5) * 1.1,
        p.position.y + 1.0 + (Math.random() - 0.5) * 0.5,
        p.position.z + p.velocity.z * 0.35 + (Math.random() - 0.5) * 1.1,
      )
      : new THREE.Vector3(
        start.x + Math.sin(this.heading) * 20, start.y,
        start.z + Math.cos(this.heading) * 20,
      );
    const vel = tgt.sub(start);
    const dist = vel.length();
    vel.normalize().multiplyScalar(46);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4a2a, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const bolt = new THREE.Mesh(Scrapper._boltGeo, mat);
    bolt.scale.set(0.035, 0.9, 0.035);
    bolt.position.copy(start);
    _v.copy(vel).normalize();
    bolt.quaternion.setFromUnitVectors(Scrapper._up, _v);
    this.ctx.scene.add(bolt);
    let flown = 0;
    const terrain = this.ctx.terrain;
    this._fx.push({
      update: (dt) => {
        const step = 46 * dt;
        flown += step;
        bolt.position.addScaledVector(vel, dt);
        const p2 = this.ctx.player;
        let hit = false;
        if (p2 && burst.hits < 5) {
          const dx = bolt.position.x - p2.position.x;
          const dy = bolt.position.y - (p2.position.y + 1.0);
          const dz = bolt.position.z - p2.position.z;
          hit = dx * dx + dy * dy + dz * dz < 1.2;
        }
        const gy = terrain.getHeight(bolt.position.x, bolt.position.z);
        if (hit || bolt.position.y <= gy + 0.08 || flown > dist + 6) {
          if (hit) {
            burst.hits += 1;
            this.ctx.events.emit('player-damage', { amount: 4, from: this });
          }
          _v.set(bolt.position.x, Math.max(bolt.position.y, gy) + 0.15, bolt.position.z);
          this._sparkBurst(_v, 4, 0xff6a3a);
          this.ctx.scene.remove(bolt);
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  /** Claw swipe: torso wheels through, one big paw slap. */
  _clawSwipe() {
    return {
      kind: 'claw',
      windup: 0.38, strike: 0.16, recover: 0.6, cooldown: 1.4,
      onStrike: () => {
        if (this.damagePlayer(12, 3.8, 0.1)) this.knockbackPlayer(6);
      },
      onUpdate: (a) => {
        let y;
        if (a.phase === 'windup') y = a.phaseT * 0.5;
        else if (a.phase === 'strike') y = 0.5 - a.phaseT * 1.1;
        else y = -0.6 + 0.6 * a.phaseT;
        this.body.rotation.y = y * 0.5;
        this.gait.pose.spineYaw = y * 0.7;
        this.gait.pose.crouch = 0.15;
      },
      cleanup: () => {
        this.body.rotation.y = 0;
        this.gait.pose.spineYaw = 0;
        this.gait.pose.crouch = 0;
      },
    };
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    // scan pose: crane up, slight strut freeze handled in _statePatrol
    if (!this._attack) {
      const scanK = this._scanning > 0 ? 1 : 0;
      this.gait.pose.headPitch = THREE.MathUtils.damp(
        this.gait.pose.headPitch, -0.28 * scanK, 6, dt);
    }
    this.gait.update(dt, t);
  }
}

Scrapper._boltGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
Scrapper._up = new THREE.Vector3(0, 1, 0);
