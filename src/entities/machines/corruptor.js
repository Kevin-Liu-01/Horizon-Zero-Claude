import * as THREE from 'three';
import { rollLoot } from './machine.js';
import { coreMesh, pulseGlow } from './parts.js';
import { buildRig, RIGS } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';
import { buildShell } from './rig/shells.js';
import { CORRUPTOR_SHELL } from './rig/shells-expansion.js';
import { ExpansionMachine } from './rig/expansion-base.js';

/**
 * CORRUPTOR — Combat T3, Faro (`roster-v2 §4`, `casting-v4 §2.6`).
 *
 * "Alien scuttle on 4 arachnid legs, huge leaps, digs in; matte black chassis,
 * hostile to everything; corrupts machines nearby. Weak Fire; exposed glowing
 * heat core on back = crit window. Components: Grenade + spike launchers
 * (dorsal; Tear); prehensile tail."
 *
 * Donor: Poly-by-Google `Scorpion` (CC-BY 3.0 — credit line in README), the
 * only scorpion under a usable licence anywhere in the sourcing sweep, static
 * and authored in centimetres (raw bbox 70 x 38 x 116, normalised to
 * 9.02 m long). Auto-rigged on `RIGS.corruptor`, which is the one shape this
 * file had not been asked for: a LOW HUB with the knees ABOVE the hips, plus a
 * four-bone tail that leaves the body and arches up and forward over the back.
 *
 * TWO THINGS MAKE IT READ AS FARO RATHER THAN AS MACHINE:
 *   1. IT IS BLACK. `roster-v2 §4` names it as the one machine that opts out
 *      of the white-grey family palette, so it is the one species that passes
 *      a `tint` to `buildShell` and a `tint` to the donor style ramp
 *      (`variety-assets.js`). Everything else in the roster is plate-white; a
 *      matte-black silhouette in the same frame is unmistakable.
 *   2. THE STATE CHANNEL IS NOT AN EYE. `casting-v4` §2.6: the exposed heat
 *      core on its BACK is the state sensor AND the crit window
 *      (`weakMult: 3`), and the four tiny red lenses on the hub front are
 *      non-state decoration. `_collectEmissive` therefore finds exactly one
 *      driven surface here, as it does on every other species — it is just
 *      not where a player expects to find it, which is the point.
 *
 * `ai/doctrine.js` owns the corruption cascade (2 victims max, no override on
 * a corrupted machine) and the launchers. This file owns the body.
 */
export class Corruptor extends ExpansionMachine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'corruptor',
      displayName: 'Corruptor',
      rigged: false,
      yawFix: 0,              // Scorpion's claws are at +Z, tail arch at −Z
      maxHealth: 600,
      armor: 0.26,
      level: 19,
      walkSpeed: 3.0,
      runSpeed: 12,
      turnRate: 3.2,          // it scuttles: it turns faster than it looks
      sightRange: 50,
      hearRange: 34,
      eyeHeight: 1.1,
      attackRange: 4.6,
      bodyRadius: 1.6,
      standoffHalfLen: 2.2,
      elemWeak: 'fire',
      ...opts,
    });

    this._tailCoil = 0;
    this._clawSpread = 0;

    /**
     * THE HEAT CORE — the state sensor, the crit window, and the reason to get
     * behind this machine. `casting-v4` §2.6 measures it at body space
     * (0, 1.05, −0.55) with `weak: true, weakMult: 3`. `ai/doctrine.js` also
     * authors a `heat-core` component; this is the WEAK POINT and the emissive
     * body under it, which is what makes the crit window visible from range.
     */
    this.addPart({
      name: 'heat-core-glow', displayName: 'Heat Core',
      mesh: coreMesh({ color: 0xff4a2a, r: 0.22 }),
      pos: [0, 1.12, -0.58], snap: true, snapTarget: [0, 0.85, -0.55],
      orient: false, proud: 0.05,
      tearHp: Infinity,
      weak: true, weakMult: 3,
      loot: [{ id: 'metal-shards', n: 6 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 2.6),
    });
    this.addWeakPoint('heat-core', this.body, 0, 1.08, -0.58, 0.42, 3);
    // four tiny NON-state lenses on the hub front (casting §2.6): decoration,
    // deliberately not on the eye channel, so the species keeps ONE sensor
    for (const sx of [1, -1]) {
      for (const dz of [0, 0.18]) {
        this.addEye(this.body, sx * 0.13, 0.95, 0.75 + dz, 0.09, 0.03, 0.35);
      }
    }

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 36, max: 54 },
      { id: 'blaze', min: 2, max: 4 },
      { id: 'sparker', min: 2, max: 4 },
      { id: 'wire', min: 4, max: 6 },
      { id: 'braided-wire', min: 2, max: 4, chance: 0.6 },
      { id: 'machine-core', n: 1, chance: 0.35 },
      { id: 'machine-heart', n: 1, chance: 0.2 },
    ]);

    // the ONE species that opts out of the white-grey plate (roster §4)
    buildShell(this, CORRUPTOR_SHELL, {
      rig: RIGS.corruptor, tint: 0x3a3c40, sensorColor: 0xff4a2a,
    });
    attachRigRuntime(this);
    buildRig(this, RIGS.corruptor);

    this.gait = new GaitController(this, this.rig, {
      // ARACHNID SCUTTLE: diagonal pairs, short stride, high cadence — this is
      // the fastest machine in the roster over the ground and it should look it
      walk: { stride: 1.5, duty: 0.60, lift: 0.34, offsets: { LF: 0, RH: 0, RF: 0.5, LH: 0.5 } },
      run: { stride: 2.4, duty: 0.44, lift: 0.52, offsets: { LF: 0, RH: 0, RF: 0.5, LH: 0.5 } },
      runRef: 12,
      rollAmp: 0.02,
      impactAmp: 0.05,
      breatheRate: 1.6,
      stepDustSpeed: 5.0,
      turnRadius: 1.0,
      lookClampYaw: 0.7,
      stanceFlex: 0.12,
      fidgets: [
        { name: 'tail-flex', tail: 0.42, dur: 1.4 },
        { name: 'claw-clack', spine: 0.06, dur: 0.8 },
        { name: 'crouch-scan', head: 0.16, spine: -0.05, dur: 1.6 },
      ],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    snapSockets(this);
    this._deathRoll = 0.24;   // it folds its legs under itself
    this._deathSink = 0.04;
  }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /**
   * Species limb work (gate `V27b`).
   *
   *   talon-strike      the near claw is thrown forward, the hub drops behind it
   *   tail-sweep        the TAIL leads the 360 — it is a prehensile tail and it
   *                     is the only reason this move has a 9.5 m reach
   *   leap              coil hard onto all four knees, then extend
   *   corruption-spike  planted, tail coiled HIGH and forward over the back —
   *                     the stinger is the spike launcher's muzzle
   *   inferno-blast     the same coil, with the hub braced lower
   */
  attackPose(a) {
    const pose = this.gait.pose;
    const k = a.phase === 'windup' ? a.phaseT
      : a.phase === 'strike' ? 1 : Math.max(0, 1 - a.phaseT * 1.8);
    switch (a.kind) {
      case 'talon-strike': {
        this._clawSpread = k;
        pose.spineYaw = (a.phase === 'strike' ? Math.sin(a.phaseT * Math.PI) * 0.40 : 0.12 * k);
        pose.crouch = 0.26 * k;
        pose.headPitch = 0.20 * k;
        pose.legLift[0] = a.phase === 'strike' ? Math.max(0, 0.7 - a.phaseT * 2) : 0.4 * k;
        break;
      }
      case 'tail-sweep': {
        const s = a.phase === 'windup' ? -a.phaseT
          : a.phase === 'strike' ? -1 + a.phaseT * 2.4 : 0;
        this._tailCoil = 1;
        pose.tailYaw = s * 1.25;
        pose.tailLift = -0.45;             // the tail comes DOWN to sweep
        pose.spineYaw = -s * 0.22;
        pose.crouch = 0.30;
        break;
      }
      case 'leap': {
        if (a.phase === 'windup') {
          pose.crouch = 0.62 * a.phaseT;
          pose.legLift[2] = pose.legLift[3] = 0.2 * a.phaseT;
          pose.tailLift = 0.30 * a.phaseT;
        } else if (a.phase === 'strike') {
          const air = Math.sin(a.phaseT * Math.PI);
          pose.crouch = 0;
          pose.tuck = air * 0.8;
          pose.spineRear = -0.25 * air;
          pose.tailLift = 0.5 * air;
        } else {
          pose.tuck = 0; pose.spineRear = 0; pose.tailLift = 0;
          pose.crouch = 0.2 * (1 - a.phaseT);
          if (a.phaseT < 0.1) this.gait._impact = 2.0;
        }
        break;
      }
      case 'corruption-spike':
      case 'inferno-blast': {
        this._tailCoil = k;
        pose.tailLift = 0.85 * k;          // tail HIGH and forward over the back
        pose.tailYaw = Math.sin(a.t * 5) * 0.08 * k;
        pose.crouch = (a.kind === 'inferno-blast' ? 0.38 : 0.22) * k;
        pose.headPitch = -0.12 * k;
        break;
      }
      default: break;
    }
  }

  clearAttackPose() {
    const pose = this.gait?.pose;
    this._tailCoil = 0; this._clawSpread = 0;
    if (!pose) return;
    pose.tailYaw = 0; pose.tailLift = 0; pose.spineYaw = 0; pose.spineRear = 0;
    pose.crouch = 0; pose.headPitch = 0; pose.tuck = 0;
    pose.legLift[0] = 0; pose.legLift[2] = 0; pose.legLift[3] = 0;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    this._snapDoctrineSockets();

    // THE TAIL IS ALWAYS ALIVE. A scorpion's tail never hangs — it is carried
    // arched, and it tracks whatever the machine is watching. Idle carriage
    // here; the attacks above take it over when one is running.
    if (!this._attack) {
      const engaged = this.state === 'alert' || this.state === 'attack';
      this._tailCoil = THREE.MathUtils.damp(this._tailCoil, engaged ? 0.75 : 0.35, 2.5, dt);
      this.gait.pose.tailLift = this._tailCoil * 0.55;
      this.gait.pose.tailYaw = Math.sin(t * 0.9 + this.position.x) * 0.10 * this._tailCoil;
    }
    this.gait.update(dt, t);
  }
}
