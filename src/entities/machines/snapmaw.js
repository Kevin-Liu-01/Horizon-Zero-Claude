import * as THREE from 'three';
import { rollLoot } from './machine.js';
import { lensMesh } from './parts.js';
import { buildRig, RIGS } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';
import { buildShell } from './rig/shells.js';
import { SNAPMAW_SHELL } from './rig/shells-expansion.js';
import { ExpansionMachine } from './rig/expansion-base.js';

/**
 * SNAPMAW — Acquisition T2, basking pairs (`roster-v2 §4`, `casting-v4 §2.3`).
 *
 * "Crocodile sprawl-walk, belly-slide into water, fast swimmer; basks
 * motionless (ambush). Weak Fire, resists Freeze. Components: Freeze sac
 * (gullet); 2 Blaze canisters (shoulders). Attacks: Freeze Burst mortar 20-45 m
 * (throat glows blue); Lunge Bite; Snap Bite; Tail Spin 0-15 m."
 *
 * Donor: Poly-by-Google `Black Caiman` (CC-BY 3.0 — credit line in README),
 * static, auto-rigged. Normalised to 8.03 m long and 0.98 m tall: `roster-v2
 * §3` asks for 1.8 x 8 m, and this is the species where scaling on the bbox
 * HEIGHT (which is what `assets.normalize` does) makes the roster's LENGTH come
 * out right.
 *
 * THE SPRAWL IS THE SILHOUETTE. `RIGS.snapmaw` puts the knees OUTBOARD of the
 * hips (hip x ±0.34, knee x ±0.60, ankle x ±0.70) and the gait's `lift` at 0.10
 * — a crocodile barely picks a foot up. `V26a` grades exactly that read, and
 * `A47-corpse-grounded` is tight on this species for the same reason: a 0.98 m
 * body has to settle inside a 0.10 m penetration budget, so the death pose is
 * a flat belly-down settle with almost no roll (`_deathRoll` 0.12) rather than
 * the quadruped buckle every other four-legged machine uses.
 */
export class Snapmaw extends ExpansionMachine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'snapmaw',
      displayName: 'Snapmaw',
      rigged: false,
      yawFix: 0,              // Caiman faces +Z (snout slab at +Z)
      maxHealth: 400,
      armor: 0.22,
      level: 13,
      walkSpeed: 1.6,
      runSpeed: 7.5,
      turnRate: 1.5,          // a croc turns its whole body
      sightRange: 40,
      hearRange: 26,
      eyeHeight: 0.85,
      attackRange: 6.0,
      bodyRadius: 1.3,
      standoffHalfLen: 2.6,   // an 8 m body: the snout must not sweep through
      elemWeak: 'fire',
      elemResist: 'freeze',
      ...opts,
    });

    this._bask = 0;
    this._baskPhase = Math.random() * 6.28;
    this._jaw = 0;            // 0..1 gape

    /**
     * THE EYE. `casting-v4` §2.3: r 0.09 on `rig_head`, body space
     * (0, 0.72, 3.45) — a crocodile's eye sits on TOP of the snout, not on its
     * side, and getting that wrong is the difference between a caiman and a
     * lizard. Two small halos flank it on the brow ridge.
     */
    this.addEye(this.body, 0.17, 0.78, 3.10, 0.14, 0.05, 0.6);
    this.addEye(this.body, -0.17, 0.78, 3.10, 0.14, 0.05, 0.6);
    this.addPart({
      name: 'lens', displayName: 'Sensor Lens',
      mesh: lensMesh({ r: 0.09 }),
      pos: [0, 0.80, 3.20], snap: false, orient: false,
      tearHp: Infinity,
      loot: [{ id: 'snapmaw-lens', n: 1 }],
    });
    this.addWeakPoint('head', this.body, 0, 0.66, 3.20, 0.46, 2.2);
    // the gullet: where the freeze sac sits, and a real weak point with or
    // without it (roster §4 — "heavy impact = big freeze explosion")
    this.addWeakPoint('gullet', this.body, 0, 0.44, 2.30, 0.40, 2.6);

    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 22, max: 34 },
      { id: 'chillwater', min: 2, max: 4 },
      { id: 'blaze', min: 1, max: 2 },
      { id: 'wire', min: 2, max: 3 },
      { id: 'braided-wire', min: 1, max: 2, chance: 0.45 },
      { id: 'snapmaw-lens', n: 1, chance: 0.25 },
      { id: 'machine-core', n: 1, chance: 0.2 },
      { id: 'machine-heart', n: 1, chance: 0.12 },
    ]);

    buildShell(this, SNAPMAW_SHELL, { rig: RIGS.snapmaw });
    attachRigRuntime(this);
    buildRig(this, RIGS.snapmaw);

    this.gait = new GaitController(this, this.rig, {
      // SPRAWL WALK: diagonal pairs, long duty, and a lift of 0.10 — the foot
      // barely clears the ground, which is the whole crocodile read
      walk: { stride: 1.5, duty: 0.72, lift: 0.10, offsets: { LF: 0, RH: 0.25, RF: 0.5, LH: 0.75 } },
      // the high walk / bolt: the body lifts clear and the stride doubles
      run: { stride: 2.6, duty: 0.52, lift: 0.26, offsets: { LF: 0, RH: 0.22, RF: 0.5, LH: 0.72 } },
      runRef: 7.5,
      rollAmp: 0.10,          // a croc rolls its whole trunk as it walks
      impactAmp: 0.04,
      breatheRate: 0.7,
      stepDustSpeed: 4.0,
      turnRadius: 2.2,
      lookClampYaw: 0.55,     // the neck barely turns; the body does
      stanceFlex: 0.06,
      fidgets: [
        { name: 'bask', head: 0.04, dur: 4.0 },
        { name: 'gape', head: 0.10, spine: 0.02, dur: 2.2 },
        { name: 'tail-sweep', tail: 0.42, dur: 1.8 },
        { name: 'blink', head: -0.05, dur: 0.5 },
      ],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    snapSockets(this);
    /**
     * CORPSE POSE. `A47-corpse-grounded` allows 0.10 m of penetration, and this
     * body is 0.98 m tall — rolling it 0.5 rad the way a Sawtooth rolls puts
     * the far flank 0.4 m into the soil. A crocodile dies flat, so it does:
     * almost no roll, a small sink, and `casting-v4` §6 flags this species as
     * the tight one for exactly this reason.
     */
    this._deathRoll = 0.12;
    this._deathSink = 0.02;
  }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /**
   * Species limb work (gate `V27`).
   *
   *   snap-bite / lunge-bite  the jaw GAPES through the windup and slams shut
   *                           across the strike, with the whole trunk driving
   *                           forward behind it
   *   tail-spin               the tail leads, the body pivots behind it, and
   *                           the outboard legs brace — a croc's death roll
   *   freeze-mortar           the head rears, the gullet lifts, and the body
   *                           plants (the throat-glow telegraph roster names)
   */
  attackPose(a) {
    const pose = this.gait.pose;
    switch (a.kind) {
      case 'snap-bite':
      case 'lunge-bite': {
        const gape = a.phase === 'windup' ? a.phaseT
          : a.phase === 'strike' ? Math.max(0, 1 - a.phaseT * 3) : 0;
        this._jaw = gape;
        pose.headPitch = -0.34 * gape;
        pose.spineRear = 0.16 * gape;
        pose.crouch = a.phase === 'strike' ? 0.18 * (1 - a.phaseT) : 0.08 * gape;
        if (a.phase === 'strike') {
          pose.headPitch = 0.30 * Math.min(1, a.phaseT * 3);  // the slam
          pose.legLift[0] = Math.max(0, 0.5 - a.phaseT * 1.5);
          pose.legLift[1] = Math.max(0, 0.5 - a.phaseT * 1.5);
        }
        break;
      }
      case 'tail-spin': {
        const k = a.phase === 'windup' ? a.phaseT
          : a.phase === 'strike' ? Math.sin(a.phaseT * Math.PI) : 1 - a.phaseT;
        // the TAIL leads and the trunk counter-rotates behind it
        pose.tailYaw = (a.phase === 'windup' ? -1 : 1) * 1.05 * k;
        pose.spineYaw = (a.phase === 'windup' ? 0.22 : -0.30) * k;
        pose.crouch = 0.22 * k;
        pose.legLift[2] = a.phase === 'strike' ? k * 0.4 : 0;
        break;
      }
      case 'freeze-mortar': {
        const k = a.phase === 'windup' ? a.phaseT
          : a.phase === 'strike' ? 1 : Math.max(0, 1 - a.phaseT * 2);
        // head UP and back: the gullet has to be visible for the glow to read
        pose.headPitch = -0.55 * k;
        pose.spineRear = 0.30 * k;
        pose.crouch = 0.16 * k;
        this._jaw = k;
        break;
      }
      default: break;
    }
  }

  clearAttackPose() {
    const pose = this.gait?.pose;
    this._jaw = 0;
    if (!pose) return;
    pose.headPitch = 0; pose.spineRear = 0; pose.crouch = 0;
    pose.tailYaw = 0; pose.spineYaw = 0;
    pose.legLift[0] = 0; pose.legLift[1] = 0; pose.legLift[2] = 0;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    this._snapDoctrineSockets();

    /**
     * BASKING. `roster-v2 §4` gives this species' idle as "basks motionless
     * (ambush)", and `ai/doctrine.js` expresses the ambush half as a perception
     * shape (late notice, then commitment). The BODY half is here: a basking
     * Snapmaw settles onto its belly, the legs splay a little further and the
     * only motion is a slow breath through the trunk. It is the one machine in
     * the roster that is allowed to look switched off.
     */
    const calm = this.state === 'patrol' && this._speed < 0.35 && !this._attack;
    this._bask = THREE.MathUtils.damp(this._bask, calm ? 1 : 0, 1.4, dt);
    if (!this._attack && this._bask > 0.01) {
      this._baskPhase += dt * 0.55;
      const pose = this.gait.pose;
      pose.crouch = this._bask * 0.42;
      pose.headPitch = this._bask * (0.05 + Math.sin(this._baskPhase) * 0.03);
    }
    this.gait.update(dt, t);
  }
}
