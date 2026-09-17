import * as THREE from 'three';
import { rollLoot } from './machine.js';
import { lensMesh } from './parts.js';
import { buildRig, RIGS } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';
import { buildShell } from './rig/shells.js';
import { BROADHEAD_SHELL } from './rig/shells-expansion.js';
import { ExpansionMachine } from './rig/expansion-base.js';

/**
 * BROADHEAD — Acquisition T1, herd, mountable (`roster-v2 §4`, `casting-v4 §2.1`).
 *
 * "Strider chassis, bulkier head; lowers horns when charging. Components: 2
 * Blaze canisters on back; Horns (Tear — disables charge). Attacks: Horn Charge
 * 15-50 m (142, knockdown); rear-up Double Strike 0-7 m (150); Hind Leg Strike
 * 1.5-3.5 m (125). Mountable."
 *
 * Donor: Quaternius `Bull` (CC0), baked out of its bind pose (`freezeSkins`)
 * and auto-rigged — 3.52 m long, withers 1.33 m, which is `roster-v2 §3`'s
 * 2 x 3.5 m to the centimetre. The shell is PARTIAL (`hideSculpt: false`): a
 * longhorn bull IS the animal, so the plate work is a dorsal line, plated
 * limbs, a skull cap and the thing this species is named for — two horn sleeves
 * sweeping out to a 2.1 m span across a 1.1 m body.
 *
 * WHO OWNS WHAT. This file owns the body: sculpt, rig, gait, shell, sockets,
 * fidgets, the authored limb work for every move, the death pose and the LOD
 * chain. `ai/doctrine.js` (machine-ai) owns the brain, the attack table and the
 * canon components. The seam is `machines.registerKind('broadhead', Broadhead)`
 * from `variety-assets.js` the moment the sculpt lands.
 */
export class Broadhead extends ExpansionMachine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'broadhead',
      displayName: 'Broadhead',
      rigged: false,          // the donor was baked static (see `freezeSkins`)
      yawFix: 0,              // Bull faces +Z (Head z +1.28, tail z −1.73)
      maxHealth: 220,
      armor: 0.10,
      level: 7,
      walkSpeed: 2.4,
      runSpeed: 8.5,
      turnRate: 2.3,
      sightRange: 42,
      hearRange: 30,
      eyeHeight: 1.62,
      attackRange: 4.6,
      bodyRadius: 1.15,
      ...opts,
    });

    this._grazeK = 0;
    this._hornDrop = 0;       // horns-down blend (the charge telegraph)
    this._hornsLost = 0;

    /**
     * THE EYE. `casting-v4` §2.1 measures one lens at body space (0, 1.61,
     * 1.84), 0.10 m proud of the brow, with the rig's head joint at
     * (0, 1.70, 1.24). It is authored a touch back of the card's z because the
     * measured Bull's muzzle ends at z 1.76 and a lens past the nose is a lens
     * in the air; `snapSockets()` then pulls it onto the real hull, which is
     * what gate `A44` grades.
     */
    this.addEye(this.body, 0.16, 1.68, 1.50, 0.17, 0.05, 0.6);
    this.addEye(this.body, -0.16, 1.68, 1.50, 0.17, 0.05, 0.6);
    this.addPart({
      name: 'lens', displayName: 'Sensor Lens',
      mesh: lensMesh({ r: 0.07 }),
      pos: [0, 1.62, 1.60], snap: false, orient: false,
      tearHp: Infinity,
      loot: [{ id: 'broadhead-lens', n: 1 }],
    });
    this.addWeakPoint('head', this.body, 0, 1.70, 1.38, 0.42, 2.2);

    /**
     * THE HORNS as a tearable component (`roster-v2 §4`: "Horns (Tear —
     * disables charge)"). The shell draws them; these are the hit volumes, the
     * tear behaviour and the flag the AI table reads. Losing BOTH disables the
     * charge — which is the canon consequence and the reason to shoot them.
     */
    for (const side of [1, -1]) {
      this.addPart({
        name: side > 0 ? 'horn-r' : 'horn-l', displayName: 'Horn',
        mesh: hornStub(side),
        pos: [side * 0.66, 1.90, 1.16], snap: false, orient: false,
        tearHp: 65, settleY: 0.2,
        loot: [{ id: 'metal-shards', n: 4 }],
        onTorn: (part, m) => { m._hornsLost++; },
      });
    }

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 16, max: 26 },
      { id: 'blaze', min: 2, max: 3 },
      { id: 'wire', min: 1, max: 3 },
      { id: 'braided-wire', min: 1, max: 2, chance: 0.4 },
      { id: 'broadhead-lens', n: 1, chance: 0.25 },
      { id: 'machine-core', n: 1, chance: 0.16 },
      { id: 'machine-heart', n: 1, chance: 0.12 },
    ]);

    buildShell(this, BROADHEAD_SHELL, { rig: RIGS.broadhead });
    attachRigRuntime(this);
    buildRig(this, RIGS.broadhead);

    this.gait = new GaitController(this, this.rig, {
      // 4-beat lateral walk, the heavy version: long duty, low lift
      walk: { stride: 1.45, duty: 0.68, lift: 0.17, offsets: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 } },
      // a bull does not gallop, it CANTERS: hind pair together, then front pair
      run: { stride: 2.7, duty: 0.42, lift: 0.38, offsets: { LH: 0, RH: 0.12, LF: 0.5, RF: 0.62 } },
      runRef: 8.5,
      rollAmp: 0.045,
      impactAmp: 0.08,
      breatheRate: 0.95,
      stepDustSpeed: 4.4,
      turnRadius: 1.4,
      lookClampYaw: 0.85,
      // the Bull's legs bind near-straight (hip→ankle 0.94 m against a 0.945 m
      // chain), exactly like the Strider's — the flex is what gives the solver
      // real ground reach instead of a clamped, dragged foot
      stanceFlex: 0.16,
      /**
       * IDLE LIFE (`machine-rig-11`). This is what replaces the donor's
       * `Idle_Headlow` / `Eating` clips, and a grazing herd is the shot this
       * species exists for, so `graze` is the long one and there are two of it.
       */
      fidgets: [
        { name: 'graze', head: -0.42, spine: 0.12, dur: 3.2 },
        { name: 'graze-chew', head: -0.36, spine: 0.08, tail: 0.18, dur: 2.0 },
        { name: 'horn-toss', head: 0.30, spine: -0.06, dur: 0.9 },
        { name: 'tail-swish', tail: 0.30, dur: 1.2 },
        { name: 'ear-flick', head: 0.12, dur: 0.6 },
      ],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    snapSockets(this);
    this._deathRoll = 0.55;
    this._deathSink = 0.04;
  }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /**
   * AUTHORED LIMB WORK over the AI table's generic moves (gate `V27`).
   *
   * Every row `ai/doctrine.js` gives this species is a generic builder, and
   * those write the shared channels — so this layer only has to add what is
   * BROADHEAD about each move, on top:
   *
   *   horn-strike / dash-horn  head and horns DOWN, front end drops into it,
   *                            near-side foreleg cocks and snaps through
   *   hind-kick                nose down, rump up, BOTH hind legs fire back
   *   horn-charge              horns down for the whole run, and a pawed
   *                            ground during the windup — the canon telegraph
   */
  attackPose(a) {
    const pose = this.gait.pose;
    const k = a.phase === 'windup' ? a.phaseT
      : a.phase === 'strike' ? 1 : Math.max(0, 1 - a.phaseT * 1.6);
    switch (a.kind) {
      case 'horn-strike':
      case 'dash-horn': {
        const drive = a.phase === 'strike' ? 1 - a.phaseT * 0.35 : k;
        this._hornDrop = drive;
        pose.headPitch = 0.44 * drive;
        pose.crouch = 0.22 * drive;
        pose.spineRear = -0.18 * drive;
        pose.legLift[0] = a.phase === 'windup' ? a.phaseT * 0.65
          : a.phase === 'strike' ? Math.max(0, 0.65 - a.phaseT * 2.2) : 0;
        if (a.phase === 'strike') pose.spineYaw = Math.sin(a.phaseT * Math.PI) * 0.20;
        break;
      }
      case 'hind-kick': {
        pose.spineRear = -0.34 * k;      // nose DOWN, rump UP
        pose.headPitch = 0.28 * k;
        pose.legLift[2] = k;
        pose.legLift[3] = k * 0.88;
        break;
      }
      case 'horn-charge': {
        if (a.phase === 'windup') {
          this._hornDrop = a.phaseT;
          // paw the ground: the near foreleg strikes twice before the run
          pose.legLift[0] = Math.abs(Math.sin(a.phaseT * Math.PI * 2.5)) * 0.5;
          pose.crouch = 0.26 * a.phaseT;
        } else if (a.phase === 'strike') {
          this._hornDrop = 1;
          pose.legLift[0] = 0;
          pose.crouch = 0.10;
          pose.spineRear = -0.22;
        } else {
          this._hornDrop = Math.max(0, 1 - a.phaseT * 2);
          pose.crouch = 0; pose.spineRear = 0;
        }
        pose.headPitch = 0.46 * this._hornDrop;
        break;
      }
      default: break;
    }
  }

  clearAttackPose() {
    const pose = this.gait?.pose;
    this._hornDrop = 0;
    if (!pose) return;
    pose.headPitch = 0; pose.crouch = 0; pose.spineRear = 0; pose.spineYaw = 0;
    pose.legLift[0] = 0; pose.legLift[2] = 0; pose.legLift[3] = 0;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    this._snapDoctrineSockets();

    // GRAZING: head-down while calm and stationary — `roster-v2 §2` gives the
    // acquisition machines' idle as heads-down work, and it is what makes a
    // herd read as a herd rather than as five statues.
    const calm = this.state === 'patrol' && this._speed < 0.5 && !this._attack;
    this._grazeK = THREE.MathUtils.damp(this._grazeK, calm ? 1 : 0, 2.5, dt);
    if (!this._attack) this.gait.pose.headPitch = this._grazeK * 0.30;

    // TORN HORNS DISABLE THE CHARGE (roster §4) — published for the AI table,
    // which reads `attackDisabled(id)` before it will score a row.
    this._chargeDisabled = this._hornsLost >= 2;
    this.gait.update(dt, t);
  }

  /** `roster-v2 §4`: both horns torn and the charge is gone. */
  attackDisabled(id) {
    if (this._chargeDisabled && (id === 'horn-charge' || id === 'dash-horn')) return true;
    return super.attackDisabled(id);
  }
}

/** A short tapered horn stub — the tearable component's hit volume. */
function hornStub(side) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.6, 6),
    new THREE.MeshStandardMaterial({ color: 0xc6cdd4, metalness: 0.55, roughness: 0.42 }),
  );
  cone.rotation.z = side * -1.15;
  cone.rotation.x = 0.16;
  cone.castShadow = true;
  g.add(cone);
  return g;
}
