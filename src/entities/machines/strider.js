import * as THREE from 'three';
import { Machine, rollLoot } from './machine.js';
import { canisterMesh, lensMesh, pulseGlow } from './parts.js';
import { buildRig } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';

/**
 * Strider: T1 acquisition herd machine (mechanical draft horse, roster-v2
 * §4). True horse gaits — 4-beat lateral walk crossfading into a rotary
 * gallop — graze head-down at patrol stops, and the herd doctrine: on alarm
 * the herd STAMPEDES along the herd vector while ONE rearguard turns to
 * fight (charge 15–50 m, front/back kicks up close). Components per roster:
 * Blaze canister between the haunches (fire detonates / tear pops) and the
 * face lens sensor (the ONE state-colored eye of the style pass).
 *
 * Model: MechanicalHorse.glb (jake young, CC-BY 3.0) — static sculpt frozen
 * mid-walk with the right-front leg lifted; rig spec fitted to the vertex
 * data (probe: scratchpad geometry slices), restFoot pulls the lifted leg
 * into a mirrored neutral stance at build time.
 */

// body space: +Z muzzle, y=0 feet, H 2.0, z in [-1.49, 1.49]
const STRIDER_RIG = {
  spine: [
    { name: 'pelvis', pos: [0, 1.32, -0.62], r: 0.66 },
    { name: 'spine', pos: [0, 1.35, -0.02], r: 0.6 },
    { name: 'chest', pos: [0, 1.32, 0.58], r: 0.62 },
    { name: 'neck', pos: [0, 1.62, 1.02], r: 0.46 },
    { name: 'head', pos: [0, 1.8, 1.32], r: 0.4, tip: [0, 1.58, 1.52] },
  ],
  tail: [
    { name: 'tail1', pos: [0, 1.38, -1.02], r: 0.34 },
    { name: 'tail2', pos: [0, 1.28, -1.36], r: 0.3 },
  ],
  legGateY: 0.98,
  legs: [
    { id: 'LF', parent: 'chest', hinge: 1, hip: [-0.42, 1.12, 0.9], knee: [-0.43, 0.58, 0.94], ankle: [-0.43, 0.18, 0.97], toe: [-0.43, 0.03, 1.1], r: 0.27, restFoot: [-0.43, 1.02] },
    // sculpt's lifted leg: bind chain traces the raised pose, restFoot mirrors LF
    { id: 'RF', parent: 'chest', hinge: 1, hip: [0.4, 1.12, 0.8], knee: [0.38, 0.6, 0.95], ankle: [0.37, 0.27, 0.85], toe: [0.37, 0.12, 0.97], r: 0.27, restFoot: [0.43, 1.02] },
    { id: 'LH', parent: 'pelvis', hinge: -1, hip: [-0.4, 1.15, -0.5], knee: [-0.46, 0.62, -0.4], ankle: [-0.47, 0.18, -0.32], toe: [-0.47, 0.03, -0.18], r: 0.27, restFoot: [-0.44, -0.52] },
    { id: 'RH', parent: 'pelvis', hinge: -1, hip: [0.4, 1.15, -0.55], knee: [0.46, 0.6, -0.7], ankle: [0.47, 0.18, -0.62], toe: [0.48, 0.03, -0.48], r: 0.27, restFoot: [0.44, -0.52] },
  ],
};

const _v = new THREE.Vector3();

export class Strider extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'strider',
      displayName: 'Strider',
      rigged: false,
      yawFix: Math.PI, // sculpt faces -Z
      maxHealth: 180,
      armor: 0.05,
      level: 4,
      walkSpeed: 1.9,
      runSpeed: 10.5, // gallop — horses outrun everything but a pounce
      turnRate: 2.5,
      sightRange: 36,
      hearRange: 26,
      eyeHeight: 1.75,
      attackRange: 8, // approach envelope; the charge triggers from 15-50 m
      bodyRadius: 1.05,
      ...opts,
    });

    // herd doctrine wiring (shared object created in index.js)
    this.herd = opts.herd ?? null;
    if (this.herd) this.herd.members.push(this);
    this._fleeing = false;
    this._fleeT = 0;
    this._cdCharge = 2 + Math.random() * 2;
    this._grazeK = 0;

    // sensor eyes: paired glow dots + the lens part below (the style pass
    // leaves the horse fully desaturated, so the lens IS the sensor)
    this.addEye(this.body, 0.11, 1.8, 1.38, 0.2, 0.045, 0.55);
    this.addEye(this.body, -0.11, 1.8, 1.38, 0.2, 0.045, 0.55);
    this.addWeakPoint('head', this.body, 0, 1.8, 1.4, 0.38, 2.5);

    // --- components (roster-v2 §4 Strider)
    // 1. Blaze canister between the haunches: THE acquisition-machine loot.
    this.addPart({
      name: 'blaze-canister', displayName: 'Blaze Canister',
      mesh: canisterMesh({ color: 0xff7a1e, r: 0.11, h: 0.34 }),
      pos: [0, 1.5, -0.75], snap: true, snapTarget: [0, 1.1, -0.75],
      tearHp: 30, elemental: 'blaze', settleY: 0.18,
      weak: true, weakMult: 2,
      loot: [{ id: 'blaze', n: 2 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 4.5),
    });
    // 2. Face lens: sensor-tagged emissive -> full EYE_COLORS state wiring.
    this.addPart({
      name: 'lens', displayName: 'Sensor Lens',
      mesh: lensMesh({ r: 0.085 }),
      pos: [0, 1.8, 1.42], snap: false, orient: false,
      tearHp: Infinity,
      loot: [{ id: 'watcher-lens', n: 1 }],
    });

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 12, max: 20 },
      { id: 'blaze', min: 1, max: 2 },
      { id: 'wire', min: 1, max: 2 },
      { id: 'strider-lens', n: 1, chance: 0.25 },
      { id: 'braided-wire', min: 1, max: 2, chance: 0.4 },
      { id: 'machine-heart', n: 1, chance: 0.12 },
    ]);

    // --- auto-rig + horse gaits
    attachRigRuntime(this);
    buildRig(this, STRIDER_RIG);
    // the lifted-leg bind ankle sits high; its STANDING pivot height matches
    // the planted legs (plant targets use ankleH — without this the RF hoof
    // would hover 9 cm forever)
    for (const leg of this.rig.legs) if (leg.id === 'RF') leg.ankleH = 0.18;
    this.gait = new GaitController(this, this.rig, {
      // 4-beat lateral walk: LH -> LF -> RH -> RF
      walk: { stride: 1.4, duty: 0.66, lift: 0.2, offsets: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 } },
      // rotary gallop: hind pair leads, front pair follows, real suspension
      run: { stride: 3.3, duty: 0.36, lift: 0.5, offsets: { LH: 0, RH: 0.14, LF: 0.55, RF: 0.69 } },
      runRef: 10.5,
      rollAmp: 0.035,
      impactAmp: 0.06,
      breatheRate: 1.25,
      stepDustSpeed: 5,
      turnRadius: 1.1,
      lookClampYaw: 1.0,
      fidgets: [
        { name: 'graze', head: -0.34, spine: 0.10, dur: 2.8 },
        { name: 'tail-swish', tail: 0.26, dur: 1.1 },
        { name: 'look-round', head: 0.30, dur: 1.5 },
      ],
      stanceFlex: 0.15, // legs bind near-straight: flex restores IK ground reach
    });
    this.gait.update(0.016, 0); // settle the sculpt's frozen stride
    snapSockets(this);          // bone-space sockets sit ON the hull (A44)
    this._deathRoll = 0.5;
    this._deathSink = 0.05;
  }

  onDeathPose(k, deathT) {
    this.gait.deathPose(k, deathT, 'quad');
  }

  tickCooldowns(dt) {
    this._cdCharge -= dt;
  }

  /* ------------------------ herd doctrine ------------------------ */

  /** First alert of an episode: alarm the herd. ONE rearguard fights, the
   *  rest stampede along the herd vector (roster-v2 §2). */
  onAlerted() {
    const h = this.herd;
    if (!h) return;
    const p = this.ctx.player;
    if (!h.alarmed) {
      h.alarmed = true;
      // herd vector: threat -> through the meadow, away
      h.vector.set(
        h.center.x - (p?.position.x ?? this.position.x), 0,
        h.center.z - (p?.position.z ?? this.position.z),
      );
      if (h.vector.lengthSq() < 1) h.vector.set(0, 0, -1);
      h.vector.normalize();
      // rearguard: the member closest to the threat turns to fight
      let rg = this;
      let best = Infinity;
      for (const m of h.members) {
        if (!m.alive) continue;
        const d = p ? m.position.distanceToSquared(p.position) : 0;
        if (d < best) { best = d; rg = m; }
      }
      h.rearguard = rg;
      for (const m of h.members) {
        if (!m.alive) continue;
        m.suspicion = 1;
        m._unseenT = 0;
        if (p) m.lastKnown.copy(p.position);
        if (m !== rg) {
          m._fleeing = true;
          m._fleeT = 12 + Math.random() * 4;
        }
        if (m.state !== 'alert' && m.state !== 'attack') m.setState('alert');
      }
    } else if (h.rearguard !== this) {
      this._fleeing = true;
      this._fleeT = Math.max(this._fleeT, 10);
    }
  }

  _stateAlert(dt) {
    if (this._fleeing) { this._flee(dt); return; }
    super._stateAlert(dt);
  }

  _stateAttack(dt) {
    if (this._fleeing) { this._flee(dt); return; }
    super._stateAttack(dt);
  }

  /** Stampede: gallop along the herd vector; slide along the valley rim
   *  instead of piling into it; calm down once clear. */
  _flee(dt) {
    const h = this.herd;
    this._fleeT -= dt;
    let dx = h.vector.x;
    let dz = h.vector.z;
    const px = this.position.x, pz = this.position.z;
    const r = Math.hypot(px, pz);
    if (r > 285) {
      // rim ahead: bend the run tangentially (keep the current swirl side)
      const side = (px * dz - pz * dx) >= 0 ? 1 : -1;
      dx = (-pz / r) * side;
      dz = (px / r) * side;
    }
    this._moveToward(px + dx * 30, pz + dz * 30, this.runSpeed, dt);
    const p = this.ctx.player;
    if (this._fleeT <= 0 && (!p || this.playerDist > 65)) {
      this._fleeing = false;
      this.suspicion = 0;
      this._unseenT = 99;
      this.setState('return');
    }
  }

  _playerBehind() {
    const p = this.ctx.player;
    if (!p) return false;
    _v.subVectors(p.position, this.position);
    const d = Math.hypot(_v.x, _v.z);
    if (d < 0.1) return false;
    return (_v.x * Math.sin(this.heading) + _v.z * Math.cos(this.heading)) / d < -0.25;
  }

  /* ------------------------ rearguard attacks ------------------------ */

  chooseAttack(dist) {
    if (dist > 15 && dist < 50 && this._cdCharge <= 0) {
      this._cdCharge = 8;
      return this._charge(dist);
    }
    if (dist < 4.2) {
      return this._playerBehind() ? this._backKick() : this._frontKick();
    }
    return null;
  }

  /** Charge 15-50 m (roster): rear-up paw telegraph, committed gallop with
   *  mild homing, impact stops the run. */
  _charge(dist) {
    const runT = THREE.MathUtils.clamp(dist / 12, 0.9, 3.2);
    return {
      kind: 'charge',
      windup: 0.7, strike: runT, recover: 0.9, cooldown: 2.5,
      onWindup: () => { this._chargeHit = false; },
      onStrike: () => {
        const p = this.ctx.player;
        if (p) {
          this.heading = Math.atan2(
            p.position.x - this.position.x, p.position.z - this.position.z,
          );
        }
      },
      onUpdate: (a, dt) => {
        const pose = this.gait.pose;
        if (a.phase === 'windup') {
          // rear up: nose high, front feet pawing
          pose.spineRear = 0.5 * Math.sin(a.phaseT * Math.PI);
          pose.legLift[0] = Math.max(0, Math.sin(a.phaseT * Math.PI * 2)) * 0.8;
          pose.legLift[1] = Math.max(0, Math.sin(a.phaseT * Math.PI * 2 + Math.PI)) * 0.8;
          this._eyeFlare = 1.2;
        } else if (a.phase === 'strike') {
          pose.spineRear = 0;
          pose.legLift[0] = 0;
          pose.legLift[1] = 0;
          const p = this.ctx.player;
          if (p) {
            const want = Math.atan2(
              p.position.x - this.position.x, p.position.z - this.position.z,
            );
            let d = want - this.heading;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            this.heading += THREE.MathUtils.clamp(d, -0.7 * dt, 0.7 * dt);
          }
          const step = 13 * dt;
          this.moveRoot(Math.sin(this.heading) * step, Math.cos(this.heading) * step);
          if (!this._chargeHit && p) {
            const reach = this.bodyRadius + this.standoffHalfLen + 0.8;
            if (this.playerDist < reach) {
              this._chargeHit = true;
              this.damagePlayer(24, reach + 0.8);
              this.knockbackPlayer(11);
              a.t = a.windup + a.strike; // stop on impact
            }
          }
        }
      },
      cleanup: () => {
        const pose = this.gait.pose;
        pose.spineRear = 0;
        pose.legLift[0] = 0;
        pose.legLift[1] = 0;
      },
    };
  }

  /** Double front-kick 0-4 m: rear on the hinds, slam both fronts down. */
  _frontKick() {
    return {
      kind: 'front-kick',
      windup: 0.5, strike: 0.2, recover: 0.75, cooldown: 2.2,
      onStrike: () => {
        if (this.damagePlayer(16, 4.6, 0.15)) this.knockbackPlayer(9);
        this.gait._impact = 1.4;
        _v.set(
          this.position.x + Math.sin(this.heading) * 1.2,
          this.position.y,
          this.position.z + Math.cos(this.heading) * 1.2,
        );
        this._dustPuff(_v.x, _v.y + 0.3, _v.z, 0.9);
      },
      onUpdate: (a) => {
        const pose = this.gait.pose;
        if (a.phase === 'windup') {
          pose.spineRear = 0.55 * a.phaseT;
          pose.legLift[0] = a.phaseT;
          pose.legLift[1] = a.phaseT * 0.85;
        } else if (a.phase === 'strike') {
          pose.spineRear = 0.55 * (1 - a.phaseT);
          pose.legLift[0] = Math.max(0, 1 - a.phaseT * 3);
          pose.legLift[1] = Math.max(0, 0.85 - a.phaseT * 3);
        } else {
          pose.spineRear = 0;
          pose.legLift[0] = 0;
          pose.legLift[1] = 0;
        }
      },
      cleanup: () => {
        const pose = this.gait.pose;
        pose.spineRear = 0;
        pose.legLift[0] = 0;
        pose.legLift[1] = 0;
      },
    };
  }

  /** Hind spin-kick when the player crowds the rump. */
  _backKick() {
    return {
      kind: 'back-kick',
      windup: 0.4, strike: 0.18, recover: 0.7, cooldown: 2.4, track: false,
      onStrike: () => {
        if (this._playerBehind() && this.damagePlayer(18, 4.4)) this.knockbackPlayer(10);
        this.gait._impact = 1.2;
      },
      onUpdate: (a) => {
        const pose = this.gait.pose;
        if (a.phase === 'windup') {
          pose.spineRear = -0.22 * a.phaseT; // nose dips as the hinds load
          pose.legLift[2] = a.phaseT;
          pose.legLift[3] = a.phaseT;
        } else if (a.phase === 'strike') {
          pose.spineRear = -0.22 + 0.3 * a.phaseT;
          pose.legLift[2] = Math.max(0, 1 - a.phaseT * 2.5);
          pose.legLift[3] = Math.max(0, 1 - a.phaseT * 2.5);
          pose.tailLift = 0.4;
        } else {
          pose.spineRear = 0;
          pose.legLift[2] = 0;
          pose.legLift[3] = 0;
          pose.tailLift = 0;
        }
      },
      cleanup: () => {
        const pose = this.gait.pose;
        pose.spineRear = 0;
        pose.legLift[2] = 0;
        pose.legLift[3] = 0;
        pose.tailLift = 0;
      },
    };
  }

  /* ------------------------ per-frame ------------------------ */

  animate(dt, t) {
    if (this.state === 'dead') return;
    // perf-tech-04: LOD ring. Past ~40 body heights the rig runs phase-only
    // (machine-rig-17) so a tall machine still strides on the far ridge.
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    // graze head-down at patrol stops (acquisition machines work heads-down)
    const grazing = this.state === 'patrol' && this._waitT > 0.15 && !this._fleeing;
    this._grazeK = THREE.MathUtils.damp(this._grazeK, grazing ? 1 : 0, 3.5, dt);
    if (!this._attack) {
      const pose = this.gait.pose;
      pose.headPitch = 0.78 * this._grazeK + (this._fleeing ? -0.16 : 0);
      pose.headYaw = Math.sin(t * 0.7) * 0.22 * this._grazeK;
      pose.crouch = 0.06 * this._grazeK;
    }
    this.gait.update(dt, t);
  }
}
