import * as THREE from 'three';
import { rollLoot } from './machine.js';
import { lensMesh, canisterMesh, pulseGlow } from './parts.js';
import { buildRig, RIGS } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';
import { buildShell, hideSculpt } from './rig/shells.js';
import { RAVAGER_SHELL } from './rig/shells-expansion.js';
import { ExpansionMachine } from './rig/expansion-base.js';

/**
 * RAVAGER — Combat T3, solo (`roster-v2 §4`, `casting-v4 §2.4`).
 *
 * "Leaner cat; opens at range with dorsal cannon (swivels to aim), melee once
 * cannon lost. Weak Fire, resists Shock. Components: Cannon (back; Tear —
 * detachable, player-usable); Power cell (rear; Shock); Chillwater canister
 * (chest; Freeze). Attacks: Cannon Burst 15-65 m; Shock Jaw Smash 1-8 m;
 * Jumping Jaw Smash 16-23 m; Shock Cocoon radial 1.25-5.25 m."
 *
 * Donor: Poly-by-Google `Lion` (CC-BY 3.0 — credit line in README), 844 tris,
 * static, auto-rigged. Normalised to 6.00 m long with the back line at 2.4 m,
 * which is `roster-v2 §3`'s 2.5 x 6 m.
 *
 * WHAT MAKES IT NOT A SECOND SAWTOOTH, which is the literal `V26a` criterion:
 *   1. THE HEAD IS UP. `RIGS.ravager` carries the head at y 2.90 over a 2.34 m
 *      chest — the Lion's own authored pose — against the Sawtooth's low prowl
 *      (head y 1.00 under a 1.58 m chest). One silhouette stalks, one stands.
 *   2. THE MANE IS ARMOUR. A heavy plated shoulder collar the Sawtooth has no
 *      equivalent of, and the thing the cannon rail mounts behind.
 *   3. THE CANNON RAIL. A real flat rail — two side rails, a deck and a swivel
 *      ring — from z −0.9 to +0.6 at y 2.55, authored in the shell so that the
 *      `cannon` component `ai/doctrine.js` adds lands ON something.
 *
 * The cannon SWIVELS. `roster-v2 §4` says so explicitly and it is the species'
 * only ranged telegraph, so `_aimCannon` turns the mounted part toward the
 * target every frame the machine is engaged — a read that survives the part
 * being torn off, because a torn part stops being aimed.
 */
export class Ravager extends ExpansionMachine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'ravager',
      displayName: 'Ravager',
      rigged: false,
      yawFix: 0,              // Lion faces +Z (mane/head at +Z)
      maxHealth: 650,
      armor: 0.24,
      level: 18,
      walkSpeed: 2.4,
      runSpeed: 10,
      turnRate: 2.4,
      sightRange: 48,
      hearRange: 34,
      eyeHeight: 2.6,
      attackRange: 4.2,
      bodyRadius: 1.5,
      elemWeak: 'fire',
      elemResist: 'shock',
      ...opts,
    });

    this._crouch = 0;
    this._cannonYaw = 0;
    this._cannonPitch = 0;

    // EYE — `casting-v4` §2.4: lens r 0.10 on `rig_head`, body space
    // (0, 2.95, 2.55). The measured Lion's muzzle ends at z 3.0.
    this.addEye(this.body, 0.20, 2.98, 2.52, 0.24, 0.06, 0.7);
    this.addEye(this.body, -0.20, 2.98, 2.52, 0.24, 0.06, 0.7);
    this.addPart({
      name: 'lens', displayName: 'Sensor Lens',
      mesh: lensMesh({ r: 0.10 }),
      pos: [0, 2.95, 2.62], snap: false, orient: false,
      tearHp: Infinity,
      loot: [{ id: 'ravager-lens', n: 1 }],
    });
    this.addWeakPoint('head', this.body, 0, 2.92, 2.40, 0.52, 2.2);

    /**
     * CHILLWATER CANISTER, chest (`roster-v2 §4`). `ai/doctrine.js` authors the
     * cannon and the power cell; the third canon component is this one, and it
     * belongs here because it is a chest-mounted elemental the doctrine's
     * generic positions cannot place on a head-up cat.
     */
    this.addPart({
      name: 'chillwater', displayName: 'Chillwater Canister',
      mesh: canisterMesh({ color: 0xbfe9ff, r: 0.16, h: 0.48 }),
      pos: [0, 2.10, 1.62], snap: true, snapTarget: [0, 2.20, 0.6],
      orient: false, proud: 0.06,
      tearHp: 70, elemental: 'freeze', settleY: 0.22,
      weak: true, weakMult: 2.4,
      loot: [{ id: 'chillwater', n: 3 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 3.2),
    });

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 30, max: 46 },
      { id: 'chillwater', min: 2, max: 4 },
      { id: 'sparker', min: 2, max: 3 },
      { id: 'wire', min: 3, max: 5 },
      { id: 'braided-wire', min: 2, max: 3, chance: 0.5 },
      { id: 'ravager-lens', n: 1, chance: 0.25 },
      { id: 'machine-core', n: 1, chance: 0.28 },
      { id: 'machine-heart', n: 1, chance: 0.16 },
    ]);

    buildShell(this, RAVAGER_SHELL, { rig: RIGS.ravager });
    attachRigRuntime(this);
    buildRig(this, RIGS.ravager);

    this.gait = new GaitController(this, this.rig, {
      // lateral-sequence prowl — the same footfall order as the Sawtooth's,
      // because it is the same body plan; everything above the legs differs
      walk: { stride: 1.85, duty: 0.63, lift: 0.28, offsets: { LF: 0, RH: 0.25, RF: 0.5, LH: 0.75 } },
      // bounding charge with real suspension
      run: { stride: 3.6, duty: 0.40, lift: 0.56, offsets: { LF: 0.08, RF: 0, LH: 0.58, RH: 0.5 } },
      runRef: 10,
      rollAmp: 0.05,
      impactAmp: 0.08,
      breatheRate: 1.0,
      stepDustSpeed: 5.5,
      turnRadius: 1.35,
      lookClampYaw: 0.95,
      stanceFlex: 0.1,
      fidgets: [
        { name: 'scan-high', head: 0.30, spine: -0.04, dur: 1.8 },
        { name: 'shoulder-roll', spine: 0.12, tail: 0.16, dur: 1.2 },
        { name: 'head-low', head: -0.20, spine: 0.06, dur: 1.5 },
        { name: 'tail-flick', tail: 0.34, dur: 0.9 },
      ],
    });
    this.gait.update(0.016, 0);
    /**
     * THE SHELL IS THE MACHINE HERE (see the note in `RAVAGER_SHELL`). The Lion
     * donor is auto-rigged onto one joint — 2,196 of its 2,496 vertices land on
     * `rig_head` — so it is retired after the rig binds and the merge runs, the
     * same order `sawtooth.js` uses, and the hull every gate measures is the
     * shell this lane authored.
     */
    hideSculpt(this);
    foldMachineMeshes(this);
    snapSockets(this);
    this._deathRoll = 0.44;
    this._deathSink = 0.03;
  }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /**
   * Species limb work (gate `V27`).
   *
   *   jaw-smash / bite  a raised paw AND a head drop — the cat swats and bites
   *                     in the same move, which is what "Shock Jaw Smash" is
   *   pounce            coil onto the hind legs, then tuck mid-air, nose first
   *   shock-cocoon      the whole body rears and slams: a radial needs a
   *                     vertical windup or the ring has no source
   *   cannon-burst      planted, front end braced, head turned off the line so
   *                     the rail can see past it
   */
  attackPose(a) {
    const pose = this.gait.pose;
    switch (a.kind) {
      case 'jaw-smash':
      case 'bite': {
        const k = a.phase === 'windup' ? a.phaseT
          : a.phase === 'strike' ? Math.max(0, 1 - a.phaseT * 2.2) : 0;
        pose.legLift[0] = k;                 // LF paw cocks high
        pose.crouch = 0.20 + 0.30 * k;
        pose.headPitch = a.phase === 'strike' ? 0.34 * (1 - k) : 0.16 * k;
        pose.spineRear = -0.12 * k;
        pose.spineYaw = (a.phase === 'strike' ? Math.sin(a.phaseT * Math.PI) * 0.35 : 0);
        break;
      }
      case 'pounce': {
        if (a.phase === 'windup') {
          this._crouch = a.phaseT;
          pose.crouch = this._crouch;
          pose.legLift[2] = pose.legLift[3] = this._crouch * 0.35;
          pose.headPitch = 0.22 * this._crouch;
        } else if (a.phase === 'strike') {
          pose.crouch = 0;
          pose.legLift[2] = pose.legLift[3] = 0;
          const air = Math.sin(a.phaseT * Math.PI);
          pose.tuck = air;
          pose.spineRear = -0.22 * air;      // nose leads
          pose.headPitch = -0.10 * air;
        } else {
          pose.tuck = 0;
          pose.spineRear = 0;
          pose.crouch = 0.18 * (1 - a.phaseT);
          if (a.phaseT < 0.1) this.gait._impact = 1.7;
        }
        break;
      }
      case 'shock-cocoon': {
        const rear = a.phase === 'windup' ? a.phaseT
          : a.phase === 'strike' ? 1 - a.phaseT : 0;
        pose.spineRear = 0.50 * rear;
        pose.legLift[0] = rear;
        pose.legLift[1] = rear;
        pose.headPitch = -0.28 * rear;
        if (a.phase === 'strike' && a.phaseT > 0.7) this.gait._impact = 2.1;
        break;
      }
      case 'cannon-burst': {
        const k = a.phase === 'recover' ? Math.max(0, 1 - a.phaseT * 2) : 1;
        pose.crouch = 0.24 * k;              // brace
        pose.headPitch = 0.10 * k;
        pose.spineYaw = -0.22 * k;           // head off the rail's line
        break;
      }
      default: break;
    }
  }

  clearAttackPose() {
    const pose = this.gait?.pose;
    this._crouch = 0;
    if (!pose) return;
    pose.crouch = 0; pose.headPitch = 0; pose.spineRear = 0; pose.spineYaw = 0;
    pose.tuck = 0;
    pose.legLift[0] = 0; pose.legLift[1] = 0; pose.legLift[2] = 0; pose.legLift[3] = 0;
  }

  /**
   * THE CANNON SWIVELS TO AIM (`roster-v2 §4`). The part `ai/doctrine.js` adds
   * is parented to whichever bone owns the rail after `snapSockets`, so a yaw
   * on its own transform is a yaw in the machine's frame — and when the part is
   * torn this stops running, because `parts` only reports attached ones as
   * aimable.
   */
  _aimCannon(dt) {
    const part = this._cannonPart
      || (this._cannonPart = (this.parts || []).find((p) => p.name === 'cannon'));
    if (!part || !part.attached || !part.mesh) return;
    const p = this.ctx.player;
    let wantYaw = 0, wantPitch = 0;
    const engaged = this.state === 'alert' || this.state === 'attack';
    if (p && engaged) {
      const dx = p.position.x - this.position.x;
      const dz = p.position.z - this.position.z;
      let rel = Math.atan2(dx, dz) - this.heading;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      wantYaw = THREE.MathUtils.clamp(rel, -1.5, 1.5);
      const d = Math.hypot(dx, dz);
      wantPitch = THREE.MathUtils.clamp(
        Math.atan2((p.position.y + 1) - (this.position.y + 2.6), Math.max(d, 1)), -0.5, 0.35);
    }
    this._cannonYaw = THREE.MathUtils.damp(this._cannonYaw, wantYaw, 5, dt);
    this._cannonPitch = THREE.MathUtils.damp(this._cannonPitch, wantPitch, 5, dt);
    part.mesh.rotation.y = this._cannonYaw;
    part.mesh.rotation.x = this._cannonPitch;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    this._snapDoctrineSockets();

    // STALK: a cat lowers itself when it is working out how to reach you, but
    // never as far as the Sawtooth — the head stays up, which is the species.
    const stalking = this.state === 'suspicious' || this.state === 'search';
    if (!this._attack) {
      this._crouch = THREE.MathUtils.damp(this._crouch, stalking ? 0.45 : 0, 3.5, dt);
      this.gait.pose.crouch = this._crouch;
      this.gait.walk.duty = stalking ? 0.69 : 0.63;
    }
    this.gait.update(dt, t);
    this._aimCannon(dt);
  }
}
