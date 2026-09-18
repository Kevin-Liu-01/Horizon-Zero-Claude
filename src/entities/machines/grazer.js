import * as THREE from 'three';
import { rollLoot } from './machine.js';
import { lensMesh } from './parts.js';
import { buildRig, RIGS } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';
import { buildShell } from './rig/shells.js';
import { GRAZER_SHELL } from './rig/shells-expansion.js';
import { ExpansionMachine } from './rig/expansion-base.js';

/**
 * GRAZER — Acquisition T1, herd (`roster-v2 §4`, `casting-v4 §2.2`).
 *
 * "Deer gait, head-down grass-cutting with spinning antler rotors; flees in
 * springy bounds. Components: 4 Blaze canisters in two dorsal rows (Fire
 * chain-detonation); Rotor blades on antlers (Tear). Attacks: Antler Charge
 * 0-50 m; Upward Rotor Stab 1-3.5 m; Leaping Front Kick 2-6 m; Hind Kick."
 *
 * Donor: Quaternius `Deer` (CC0) — the SAME `AnimalArmature` family as the
 * Broadhead's Bull, which is why `casting-v4` §4 puts these two next to each
 * other in the build order: one measurement pass, one rig idiom, two species.
 * Normalised to 2.80 m long with the head carried at 2.44 m, which is
 * `roster-v2 §3`'s 1.6 x 2.8 m.
 *
 * THE ROTORS ARE THE SPECIES. `roster-v2 §4` gives this machine exactly one
 * unique mechanism — antler blades that spin, cut grass, and stab upward — so
 * they are a real driven object here, not a decal: `_rotorSpin` turns the
 * antler bone chain whenever the machine is grazing or swinging, and `A44`
 * grades the blades' sockets against the hull in both states.
 */
export class Grazer extends ExpansionMachine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'grazer',
      displayName: 'Grazer',
      rigged: false,
      yawFix: 0,              // Deer faces +Z (Head z +0.83 at y 2.44)
      maxHealth: 130,
      armor: 0.05,
      level: 5,
      walkSpeed: 2.6,
      runSpeed: 9.5,
      turnRate: 2.9,
      sightRange: 40,
      hearRange: 30,
      eyeHeight: 2.30,
      attackRange: 4.0,
      bodyRadius: 0.85,
      ...opts,
    });

    this._grazeK = 0;
    this._rotor = 0;          // rotor RPM blend 0..1
    this._rotorPhase = 0;

    // EYE — `casting-v4` §2.2: lens r 0.055 on the head, body space
    // (0, 2.36, 1.27); the measured Deer's muzzle ends at z 1.40, so 1.12 is
    // on the face rather than past it.
    this.addEye(this.body, 0.10, 2.40, 1.02, 0.13, 0.04, 0.55);
    this.addEye(this.body, -0.10, 2.40, 1.02, 0.13, 0.04, 0.55);
    this.addPart({
      name: 'lens', displayName: 'Sensor Lens',
      mesh: lensMesh({ r: 0.055 }),
      pos: [0, 2.36, 1.12], snap: false, orient: false,
      tearHp: Infinity,
      loot: [{ id: 'grazer-lens', n: 1 }],
    });
    this.addWeakPoint('head', this.body, 0, 2.40, 0.96, 0.30, 2.4);

    /**
     * ROTOR BLADES as a tearable component per side (`roster-v2 §4`). Tearing
     * one kills the rotor stab AND the grass-cutting idle — which is the
     * legible consequence, since a Grazer with no rotors has nothing to do.
     */
    for (const side of [1, -1]) {
      this.addPart({
        name: side > 0 ? 'rotor-r' : 'rotor-l', displayName: 'Antler Rotor',
        mesh: rotorStub(side),
        pos: [side * 0.38, 2.86, 0.72], snap: false, orient: false,
        tearHp: 45, settleY: 0.15,
        loot: [{ id: 'metal-shards', n: 3 }],
        onTorn: (part, m) => { m._rotorsLost++; },
      });
    }
    this._rotorsLost = 0;

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 10, max: 18 },
      { id: 'blaze', min: 2, max: 4 },
      { id: 'wire', min: 1, max: 2 },
      { id: 'braided-wire', min: 1, max: 2, chance: 0.35 },
      { id: 'grazer-lens', n: 1, chance: 0.25 },
      { id: 'machine-heart', n: 1, chance: 0.12 },
    ]);

    buildShell(this, GRAZER_SHELL, { rig: RIGS.grazer });
    attachRigRuntime(this);
    buildRig(this, RIGS.grazer);

    this.gait = new GaitController(this, this.rig, {
      // light 4-beat walk with a high lift — a deer picks its feet up
      /**
       * STRIDE IS SIZED FROM THE BAND, NOT FROM TASTE (fix round 1).
       *
       * `A48-cadence` derives a species' legal footfall band from its MEASURED
       * body length (`ref = 2.2 / sqrt(L / 2.5)`, band 0.45x-1.35x of that),
       * and delivered cadence is travel speed over stride. Every expansion
       * species shipped a stride that put its TOP speed above its own ceiling
       * — this one commanded 3.17 Hz at `runRef` against a 2.42 Hz ceiling — and
       * the only reason the gate did not say so is that the controller was
       * hard-clamped at 0.98x the bar it measures. A judge caught the clamp and
       * it is gone (`gait.js`), so the strides below are solved: `runRef /
       * ceiling`, plus ~8% of margin, which is the reach a machine this long
       * has to have anyway.
       */
      walk: { stride: 1.75, duty: 0.62, lift: 0.26, offsets: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 } },
      // SPRINGY BOUNDS (roster §4 "flees in springy bounds"): both hind feet
      // together, both front feet together, real suspension between them
      run: { stride: 4.25, duty: 0.32, lift: 0.62, offsets: { LH: 0, RH: 0.05, LF: 0.46, RF: 0.51 } },
      runRef: 9.5,
      rollAmp: 0.04,
      impactAmp: 0.05,
      breatheRate: 1.4,
      stepDustSpeed: 5.2,
      turnRadius: 0.9,
      lookClampYaw: 1.1,
      stanceFlex: 0.14,
      fidgets: [
        { name: 'graze-cut', head: -0.55, spine: 0.14, dur: 3.4 },
        { name: 'graze-step', head: -0.48, spine: 0.10, tail: 0.14, dur: 2.2 },
        { name: 'head-up', head: 0.34, dur: 1.4 },
        { name: 'ear-flick', head: 0.14, tail: 0.20, dur: 0.6 },
      ],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    snapSockets(this);
    this._deathRoll = 0.62;
    this._deathSink = 0.03;

    // the antler bones the rotor spin drives (the donor's ear chain, which
    // `casting-v4` §2.2 repurposes as the rotor axis)
    this._antlerBones = [];
    this.rig?.root?.traverse?.((o) => {
      if (o.isBone && /head/i.test(o.name)) this._antlerBones.push(o);
    });
  }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /**
   * Species limb work over the AI table's generic moves (gate `V27`).
   *
   *   rotor-stab     the head SNAPS UP (this is an upward stab, roster §4) and
   *                  the rotors spin to full
   *   leap-kick      both front feet leave the ground and drive forward
   *   hind-kick      nose down, both hind legs fire back
   *   antler-charge  antlers levelled, rotors at full, body low over the run
   */
  attackPose(a) {
    const pose = this.gait.pose;
    const k = a.phase === 'windup' ? a.phaseT
      : a.phase === 'strike' ? 1 : Math.max(0, 1 - a.phaseT * 1.8);
    switch (a.kind) {
      case 'rotor-stab': {
        this._rotor = 1;
        // windup coils DOWN, strike throws the head UP through the target
        const up = a.phase === 'windup' ? -a.phaseT
          : a.phase === 'strike' ? -1 + a.phaseT * 2.4 : 0.6 * (1 - a.phaseT);
        pose.headPitch = up * -0.5;
        pose.spineRear = up * 0.24;
        pose.crouch = a.phase === 'windup' ? 0.3 * a.phaseT : 0;
        pose.legLift[0] = a.phase === 'strike' ? Math.min(1, a.phaseT * 2) * 0.55 : 0;
        break;
      }
      case 'leap-kick': {
        const air = a.phase === 'strike' ? Math.sin(a.phaseT * Math.PI) : k * 0.4;
        pose.legLift[0] = air;
        pose.legLift[1] = air * 0.9;
        pose.tuck = a.phase === 'strike' ? air * 0.5 : 0;
        pose.spineRear = 0.32 * air;
        pose.headPitch = -0.18 * air;
        break;
      }
      case 'hind-kick': {
        pose.spineRear = -0.34 * k;
        pose.headPitch = 0.30 * k;
        pose.legLift[2] = k;
        pose.legLift[3] = k * 0.9;
        break;
      }
      case 'antler-charge': {
        this._rotor = 1;
        if (a.phase === 'windup') {
          pose.crouch = 0.3 * a.phaseT;
          pose.headPitch = -0.2 * a.phaseT;   // antlers LEVEL, pointing forward
          pose.legLift[0] = Math.abs(Math.sin(a.phaseT * Math.PI * 3)) * 0.4;
        } else if (a.phase === 'strike') {
          pose.crouch = 0.12;
          pose.headPitch = -0.26;
          pose.spineRear = -0.16;
          pose.legLift[0] = 0;
        } else {
          pose.crouch = 0; pose.spineRear = 0;
          pose.headPitch = -0.26 * (1 - a.phaseT);
        }
        break;
      }
      default: break;
    }
  }

  clearAttackPose() {
    const pose = this.gait?.pose;
    if (!pose) return;
    pose.headPitch = 0; pose.crouch = 0; pose.spineRear = 0;
    pose.tuck = 0;
    pose.legLift[0] = 0; pose.legLift[1] = 0; pose.legLift[2] = 0; pose.legLift[3] = 0;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    // BEFORE the LOD early-out: `ai/doctrine.js` authors this species'
    // components after the constructor returns, and a machine that spawns
    // beyond the animation LOD ring would otherwise never re-snap them —
    // which `A44b-socket-vertex-integrity` measures in the live pose.
    this._snapDoctrineSockets();
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }

    // GRASS-CUTTING IDLE: head down AND the rotors turning. One without the
    // other is either a deer or a lawnmower; the pair is a Grazer.
    const calm = this.state === 'patrol' && this._speed < 0.5 && !this._attack;
    this._grazeK = THREE.MathUtils.damp(this._grazeK, calm ? 1 : 0, 2.2, dt);
    if (!this._attack) this.gait.pose.headPitch = this._grazeK * 0.48;

    const want = this._rotorsLost >= 2 ? 0
      : Math.max(this._grazeK, this._attack ? this._rotor : 0);
    this._rotor = THREE.MathUtils.damp(this._rotor, want, 3.5, dt);

    this.gait.update(dt, t);

    // THE ROTOR SPIN, applied AFTER the gait solve — `gait.update` opens with
    // `rest.restore()`, so anything written before it is wiped. The blades ride
    // the head chain, so one roll on the head bone spins the whole antler: no
    // per-blade bone, no per-frame allocation.
    if (this._rotor > 0.01 && this._antlerBones.length) {
      this._rotorPhase += dt * this._rotor * 16;
      const roll = Math.sin(this._rotorPhase) * 0.12 * this._rotor;
      this.gait.rotZ(this._antlerBones[0], roll);
    }
  }

  attackDisabled(id) {
    if (this._rotorsLost >= 2 && (id === 'rotor-stab' || id === 'antler-charge')) return true;
    return super.attackDisabled(id);
  }
}

/** Three swept blades on a short beam — the tearable rotor's hit volume. */
function rotorStub(side) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc6cdd4, metalness: 0.6, roughness: 0.38 });
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.10), mat);
    blade.position.set(side * i * 0.09, 0.06 + i * 0.05, -i * 0.05);
    blade.rotation.z = side * (0.5 + i * 0.25);
    blade.castShadow = true;
    g.add(blade);
  }
  return g;
}
