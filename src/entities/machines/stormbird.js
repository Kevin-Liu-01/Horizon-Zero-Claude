import * as THREE from 'three';
import { rollLoot } from './machine.js';
import { lensMesh } from './parts.js';
import { buildRig, RIGS } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';
import { buildShell } from './rig/shells.js';
import { STORMBIRD_SHELL } from './rig/shells-expansion.js';
import { ExpansionMachine } from './rig/expansion-base.js';

/**
 * STORMBIRD — Combat T5, solo flyer (`roster-v2 §4`, `casting-v4 §2.7`).
 *
 * "Soars high; alternates strafing dives, hover lightning barrages, landed
 * melee. Six feather-jet engines (3/wing, blue exhaust). Resists Shock.
 * Components: Engines x6 (ALL TORN = GROUNDED); Lightning gun (chest)."
 *
 * Donor: Sherkiz `Hawk` (CC-BY 3.0 — credit line in README), 58-joint metarig,
 * baked out of its bind pose. It is the heaviest sculpt in the expansion by
 * 3.7x (9,956 triangles), and the one whose bind box and drawn body disagreed
 * most before `freezeSkins` — raw buffer y −3.30 … +9.53 against a drawn bird
 * of 0 … 7.89, which is exactly the case that bake exists for.
 *
 * TWO LIVES, ONE MACHINE. Every other species in the roster is either a walker
 * or a flyer; this one is both, and the seam is a DATA FACT rather than an
 * if-ladder: `ai/doctrine.js` gives the two grounded rows a negated
 * `needPart: '!engine'`, so `thunder-rush` and `tail-lash` are illegal while
 * any of the six engines is still attached, and legal the instant the sixth
 * comes off. `RIGS.stormbird` exists for that second life — two raptor legs
 * under a 17 m wingspan — and `A48s` measures cadence on the grounded bird.
 *
 * WHILE AIRBORNE the gait is not driving anything: `_fly` owns `position.y`,
 * the legs tuck, and the wings are the animation. `updateRigLOD`'s cheap path
 * still runs so a Stormbird on the far ridge keeps beating its wings.
 */
export class Stormbird extends ExpansionMachine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'stormbird',
      displayName: 'Stormbird',
      rigged: false,
      yawFix: Math.PI,        // the Hawk faces −Z (head/beak at z −0.82)
      maxHealth: 1400,
      armor: 0.30,
      level: 26,
      walkSpeed: 8,           // cruise
      runSpeed: 16,           // pursuit
      turnRate: 1.6,
      sightRange: 90,
      hearRange: 50,
      eyeHeight: 3.7,
      attackRange: 18,
      bodyRadius: 2.2,
      elemResist: 'shock',
      ...opts,
    });

    this._airborne = true;
    this.flyCruise = opts.flyCruise ?? 16;
    this._wing = 0;           // 0 = folded, 1 = spread
    this._beat = Math.random() * 6.28;
    this._dive = 0;

    /**
     * ONE GLOWING SENSOR, not two eyes (`roster-v2 §1`, `casting-v4` §2.7): an
     * emissive BROW STRIP on the head at body space (0, 3.72, 2.95) after the
     * yaw fix. The engine nacelles glow blue-white on their own shell material
     * and are deliberately OFF the state channel.
     */
    this.addEye(this.body, 0, 3.40, 2.62, 0.34, 0.09, 0.9);
    this.addPart({
      name: 'lens', displayName: 'Sensor Strip',
      mesh: lensMesh({ r: 0.14 }),
      pos: [0, 3.42, 2.78], snap: false, orient: false,
      tearHp: Infinity,
      loot: [{ id: 'stormbird-lens', n: 1 }],
    });
    this.addWeakPoint('head', this.body, 0, 3.32, 2.50, 0.62, 2.0);

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 48, max: 72 },
      { id: 'sparker', min: 4, max: 7 },
      { id: 'chillwater', min: 2, max: 4 },
      { id: 'blaze', min: 2, max: 4 },
      { id: 'wire', min: 5, max: 8 },
      { id: 'braided-wire', min: 3, max: 5, chance: 0.7 },
      { id: 'stormbird-lens', n: 1, chance: 0.3 },
      { id: 'machine-core', n: 1, chance: 0.45 },
      { id: 'machine-heart', n: 1, chance: 0.3 },
    ]);

    buildShell(this, STORMBIRD_SHELL, { rig: RIGS.stormbird });
    attachRigRuntime(this);
    buildRig(this, RIGS.stormbird);

    this.gait = new GaitController(this, this.rig, {
      // the GROUNDED gait: a two-legged raptor strut, heavy and slow — this is
      // what `A48s` measures once all six engines are torn
      walk: { stride: 2.4, duty: 0.66, lift: 0.34, offsets: { L: 0, R: 0.5 } },
      run: { stride: 4.0, duty: 0.48, lift: 0.60, offsets: { L: 0, R: 0.5 } },
      runRef: 9,
      rollAmp: 0.05,
      impactAmp: 0.09,
      breatheRate: 0.75,
      stepDustSpeed: 4.0,
      turnRadius: 2.0,
      lookClampYaw: 0.8,
      stanceFlex: 0.12,
      fidgets: [
        { name: 'wing-settle', spine: 0.08, dur: 1.6 },
        { name: 'head-cock', head: 0.30, dur: 1.1 },
        { name: 'tail-fan', tail: 0.30, dur: 1.4 },
      ],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    snapSockets(this);
    this._deathRoll = 0.55;
    this._deathSink = 0.05;
  }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'biped'); }

  /** Cruise altitude hold — the Glinthawk's own flight seam, same contract. */
  _fly(want, dt, rate = 1.3) {
    const g = this.ctx.terrain.getHeight(this.position.x, this.position.z);
    this.position.y = THREE.MathUtils.damp(this.position.y, g + want, rate, dt);
  }

  /**
   * A FLYING MACHINE HAS NO FEET ON THE GROUND, and says so.
   *
   * `debugFeet()` is the contact report every consumer reads — the audio
   * lane's footstep bank, the camera's step shake, and gates `A45`, `A46` and
   * `A48`. While this machine is in the air its legs are tucked and nothing
   * they do is a footfall, so reporting two "feet" is a lie that the cadence
   * gate reads as a cadence of zero: measured `cadenceHz: 0`,
   * `airborneFraction: 1.000`, against a [0.29, 0.87] band. The Glinthawk is
   * already exempt from exactly these three gates by having no feet at all;
   * this is the same fact, told once per frame instead of once per species.
   *
   * The moment all six engines are torn (`roster-v2 §4`: grounded for good,
   * `flyCruise` goes to 0 in `ai/doctrine.js`) the report comes back and the
   * grounded bird is measured like any other walker — which is what
   * `casting-v4` §6's `A48s` asks for.
   */
  debugFeet() {
    if (this._airborne && (this.flyCruise ?? 0) > 0) return [];
    return this.gait ? this.gait.debugFeet() : [];
  }

  /**
   * Species limb work (gate `V27b`).
   *
   *   thunder-clash  the dive: wings FOLD back, the body pitches nose-down —
   *                  roster names a ~2 s telegraph and this is its shape
   *   shock-blast    hover: wings spread wide and beat, body upright
   *   bomb-run       wings level, body flat, a strafing pass
   *   screech-stun   head thrown back, wings thrown wide — the widest pose it
   *                  has, which is what makes a stun read
   *   tail-lash / thunder-rush  GROUNDED only: wings clamped, the body drives
   */
  attackPose(a) {
    const pose = this.gait.pose;
    const k = a.phase === 'windup' ? a.phaseT
      : a.phase === 'strike' ? 1 : Math.max(0, 1 - a.phaseT * 1.8);
    switch (a.kind) {
      case 'thunder-clash': {
        this._dive = k;
        this._wing = 1 - k * 0.85;              // fold
        pose.spineRear = -0.55 * k;             // nose down
        pose.tuck = k * 0.7;
        pose.headPitch = 0.35 * k;
        break;
      }
      case 'shock-blast': {
        this._wing = 1;
        pose.spineRear = 0.32 * k;              // upright hover
        pose.headPitch = -0.18 * k;
        pose.tuck = 0.35 * k;
        break;
      }
      case 'bomb-run': {
        this._wing = 0.9;
        pose.spineRear = -0.14 * k;
        pose.tailLift = 0.25 * k;
        break;
      }
      case 'screech-stun': {
        this._wing = 1;
        pose.spineRear = 0.48 * k;
        pose.headPitch = -0.45 * k;             // head thrown BACK
        pose.tailLift = -0.3 * k;
        break;
      }
      case 'tail-lash': {
        const s = a.phase === 'strike' ? Math.sin(a.phaseT * Math.PI) : k * 0.4;
        this._wing = 0.25;
        pose.tailYaw = s * 1.2;
        pose.spineYaw = -s * 0.3;
        pose.crouch = 0.25 * k;
        break;
      }
      case 'thunder-rush': {
        this._wing = 0.35;
        pose.crouch = 0.3 * k;
        pose.spineRear = -0.3 * k;
        pose.headPitch = 0.25 * k;
        break;
      }
      default: break;
    }
  }

  clearAttackPose() {
    const pose = this.gait?.pose;
    this._dive = 0;
    if (!pose) return;
    pose.spineRear = 0; pose.headPitch = 0; pose.tuck = 0;
    pose.tailYaw = 0; pose.tailLift = 0; pose.spineYaw = 0; pose.crouch = 0;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    const tier = updateRigLOD(this);
    this._snapDoctrineSockets();

    /**
     * WINGS. One channel, three readings: spread while airborne, clamped once
     * the engines are gone and it is walking, folded through a dive. The beat
     * is a sine on the spine roll, which the wing spars are bound to — a
     * hexapod's tripod and a bird's wingbeat are the two locomotion classes
     * this expansion added, and this is the cheap half of the second one.
     */
    const grounded = !this._airborne || this.flyCruise <= 0;
    const want = this._attack ? this._wing : (grounded ? 0.3 : 1);
    this._wing = THREE.MathUtils.damp(this._wing, want, 3.5, dt);
    this._beat += dt * (grounded ? 0.8 : 2.4 + this._speed * 0.12);

    if (tier >= 3) { this.gait.updateCheap(dt, t); return; }

    if (!this._attack) {
      // airborne: the legs tuck up under the body and stop pretending to walk
      this.gait.pose.tuck = grounded ? 0 : 0.85;
    }
    this.gait.update(dt, t);

    // wingbeat AFTER the solve (`gait.update` restores the rest pose first)
    const chest = this.rig?.bones?.chest;
    if (chest) {
      const flap = Math.sin(this._beat) * (grounded ? 0.06 : 0.26) * this._wing;
      this.gait.rotZ(chest, flap);
      this.gait.rotX(chest, -0.10 * this._wing + this._dive * 0.35);
    }
  }
}
