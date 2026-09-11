import * as THREE from 'three';
import { Machine, rollLoot } from './machine.js';
import { canisterMesh, plateMesh, antennaMesh, powerCellMesh, pulseGlow } from './parts.js';
import { buildRig, RIGS } from './autorig.js';
import { GaitController } from './gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from './rig/lod.js';
import { snapSockets } from './rig/sockets.js';
import { buildShell, hideSculpt, SAWTOOTH_SHELL } from './rig/shells.js';

/**
 * Sawtooth: big-cat stalker (static sculpt, procedural root motion; HZD
 * level 15). Prowl bob/sway, low stalk when suspicious, charge + committed
 * pounce. Components per research doc 2.7: chest BLAZE CANISTER (fire hit
 * while attached = elemental explosion; tear = lootable Blaze) and hip armor
 * plates that pop off to expose a +25% impact zone. Fire-weak body.
 */
export class Sawtooth extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'sawtooth',
      displayName: 'Sawtooth',
      rigged: false,
      yawFix: Math.PI / 2, // model faces -X in asset space (head under the antenna sweep)
      maxHealth: 450, // spec v2 retune
      armor: 0.2,
      level: 15,
      elemWeak: 'fire', // research 2.1: fire melts it
      walkSpeed: 2.2,
      runSpeed: 9,
      turnRate: 2.6,
      sightRange: 42,
      hearRange: 30,
      eyeHeight: 1.9,
      attackRange: 9, // pounce launch distance
      bodyRadius: 1.5,
      ...opts,
    });

    // model length runs along asset +X -> body-space +Z after yaw fix
    const len = this.size.x;
    const h = this.height;
    const w = this.size.z;
    // eyes: pair on the head (body space: +Z forward)
    this.addEye(this.body, 0.2, h * 0.74, len * 0.38, 0.32, 0.06);
    this.addEye(this.body, -0.2, h * 0.74, len * 0.38, 0.32, 0.06);

    // --- components (research 2.7)
    // 1. Blaze Canister, center chest — THE Sawtooth fantasy: glows orange,
    //    fire arrow detonates it, tear pops it off as lootable Blaze. WEAK
    //    part (machines.md: the glowing chest is the aim marker) so hitting
    //    it pops orange weak-hit numbers.
    const canister = this.addPart({
      name: 'blaze-canister', displayName: 'Blaze Canister',
      mesh: canisterMesh({ color: 0xff7a1e, r: 0.15, h: 0.46 }),
      pos: [0, h * 0.5, len * 0.36], snap: true, snapTarget: [0, h * 0.48, 0],
      // combat-blaze-canister-unreachable-frontal: recessed 8 cm INTO the
      // chest housing, the canister could not be hit from the front at all —
      // every frontal arrow struck the plate in front of it. It now stands
      // 6 cm proud of the hull, and the weak point below carries a 0.35 m
      // proximity credit so a hit near the socket still counts as the canister.
      orient: false, proud: 0.06,
      tearHp: 40, elemental: 'blaze', settleY: 0.24,
      weak: true, weakMult: 2.5,
      loot: [{ id: 'blaze', n: 3 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 4),
    });
    // chest weak spot sits AT the canister socket (stays after tear-off, so
    // the exposed chest keeps rewarding precise shots with orange numbers)
    this.addWeakPoint('chest', this.body,
      canister.anchor.x, canister.anchor.y, canister.anchor.z, 0.7 + 0.35, 2);
    // power cell atop the hindquarters (research 2.7.4): shock detonation
    // -> shock explosion + self-stun; tear -> lootable Sparker
    this.addPart({
      name: 'power-cell', displayName: 'Power Cell',
      mesh: powerCellMesh({ color: 0xffd23d }),
      pos: [0, h * 0.74, -len * 0.3], snap: true, snapTarget: [0, h * 0.4, -len * 0.28],
      tearHp: 35, elemental: 'shock', settleY: 0.2,
      loot: [{ id: 'sparker', n: 2 }],
      update: (dt, t, p) => pulseGlow(p.mesh.children[0], t, 5),
    });
    // fan of three long antennae behind the shoulders (research 2.2):
    // cosmetic tear-offs, tips glow with the eye state
    for (let i = 0; i < 3; i++) {
      const side = i - 1; // -1, 0, 1
      const ant = this.addPart({
        name: `antenna-${i + 1}`, displayName: 'Antenna',
        mesh: antennaMesh({ len: 0.72 + Math.abs(side) * 0.1 }),
        pos: [side * 0.24, h * 0.82, len * 0.1 - Math.abs(side) * 0.12],
        snap: true, snapTarget: [0, h * 0.5, len * 0.08],
        orient: false, rot: [-0.55, 0, side * 0.35], // swept back like a crest
        tearHp: 14, settleY: 0.1,
        loot: [{ id: 'wire', n: 1 }],
      });
      // machine-rig-11: the antenna fan is a SPRING CHAIN — it lags the body
      // through an acceleration and whips through a turn (gait._updateSprings)
      ant.springy = true;
    }
    // 2. Hip armor plates x2 on the upper haunches — tearing exposes brighter
    //    "muscle" that takes +25% impact (research: plates cover bonus zones).
    for (const side of [1, -1]) {
      this.addPart({
        name: side > 0 ? 'hip-plate-r' : 'hip-plate-l', displayName: 'Hip Armor',
        mesh: plateMesh({ w: 0.5, l: 0.7, color: 0xd6dade }),
        pos: [side * 0.55, h * 0.66, -len * 0.22],
        snap: true, snapTarget: [side * -0.1, h * 0.35, -len * 0.22],
        tearHp: 30, settleY: 0.12,
        loot: [{ id: 'metal-shards', n: 5 }],
        onTorn: (part, m) => {
          m.addWeakPoint('exposed-hip', m.body,
            part.anchor.x, part.anchor.y, part.anchor.z, 0.9, 1.25);
        },
      });
    }

    // corpse loot (research loot table)
    // corpse loot — progression-010 canon rates: species lens 25 %,
    // machine heart 12 %, plus the core and braiding tiers
    this.lootTable = rollLoot([
      { id: 'metal-shards', min: 25, max: 40 },
      { id: 'blaze', min: 2, max: 3 },
      { id: 'sparker', min: 1, max: 2 },
      { id: 'wire', min: 2, max: 3 },
      { id: 'braided-wire', min: 1, max: 2, chance: 0.45 },
      { id: 'sawtooth-lens', n: 1, chance: 0.25 },
      { id: 'machine-core', n: 1, chance: 0.2 },
      { id: 'machine-heart', n: 1, chance: 0.12 },
    ]);

    this._crouch = 0;   // stalk pose blend
    this._pounceDir = new THREE.Vector3();

    // --- silhouette pass (D3 / machine-rig-01): plate + muscle kitbash over
    // the sculpt so the cat mech reads as a Sawtooth — fangs, chest mass,
    // shoulder plates, haunch muscle. Built BEFORE the rig so the shells are
    // skinned with the body they sit on.
    buildShell(this, SAWTOOTH_SHELL, { rig: RIGS.sawtooth });

    // --- mesh budget (perf-tech-04/14): shared tinted materials, merged
    // batches, two shadow casters, padded skinned bounds, pooled FX
    attachRigRuntime(this);

    // --- auto-rig (autorig.js): skeleton + skinned rebind, then the cat gait
    buildRig(this, RIGS.sawtooth);
    this.gait = new GaitController(this, this.rig, {
      // lateral-sequence prowl: LF -> RH -> RF -> LH, low and long
      walk: { stride: 1.55, duty: 0.64, lift: 0.24, offsets: { LF: 0, RH: 0.25, RF: 0.5, LH: 0.75 } },
      // bounding charge: front pair then hind pair, airborne-ish suspension
      run: { stride: 3.1, duty: 0.42, lift: 0.5, offsets: { LF: 0.08, RF: 0, LH: 0.58, RH: 0.5 } },
      runRef: 9,
      rollAmp: 0.05,
      impactAmp: 0.07,
      breatheRate: 1.15,
      stepDustSpeed: 5.5,
      turnRadius: 1.2,
      lookClampYaw: 0.9,
      stanceFlex: 0.1,
      // machine-rig-11: idle life. A calm Sawtooth is a cat — it lowers its
      // head, rolls a shoulder, flicks the antenna fan.
      fidgets: [
        { name: 'head-low', head: -0.22, spine: 0.06, dur: 1.6 },
        { name: 'shoulder-roll', spine: 0.10, tail: 0.12, dur: 1.2 },
        { name: 'scent', head: 0.26, spine: -0.05, dur: 2.0 },
        { name: 'ear-flick', head: 0.10, dur: 0.7 },
      ],
    });
    this.gait.update(0.016, 0); // settle out of the sculpt's frozen stride
    // the SHELL is the machine now (machine-rig-01): retire the donor
    // sculpt AFTER the rig binds and the merge pass runs, and BEFORE the
    // socket proxy is built, so the hull every gate measures is the shell
    hideSculpt(this);
    // --- RESIDUE ROUND (A21-real-draw-calls): the draw-call fold. One
    // skeleton, one bind frame, every rigid bone attachment re-expressed as a
    // one-bone skin, then the material merge. Lossless — see rig/lod.js.
    foldMachineMeshes(this);
    snapSockets(this);          // bone-space sockets sit ON the hull (A44)
    this._deathRoll = 0.42;     // skeletal buckle does the collapsing now
    this._deathSink = 0.03;
  }

  /** Death crumple: legs buckle one side first, spine sags, settle bounces. */
  onDeathPose(k, deathT) {
    this.gait.deathPose(k, deathT, 'quad');
  }

  chooseAttack(dist) {
    if (dist < 3.4) {
      return {
        kind: 'swipe',
        windup: 0.45, strike: 0.18, recover: 0.8, cooldown: 1.6,
        // damage ladder (research 5): sawtooth hits 22-30
        onStrike: () => this.damagePlayer(22, 4, 0.1),
        onUpdate: (a) => {
          // AUTHORED LIMB KEYFRAMES (machine-rig-08, gate V27): the swipe is
          // a raised paw and a coiled hindquarter, not a yawed body. LF is
          // cocked high through the windup, snaps down across the strike, and
          // the head drops to follow the paw.
          const pose = this.gait.pose;
          let y;
          if (a.phase === 'windup') y = a.phaseT * 0.4;
          else if (a.phase === 'strike') y = 0.4 - a.phaseT * 0.9;
          else y = -0.5 + 0.5 * a.phaseT;
          this.body.rotation.y = y * 0.55;
          pose.spineYaw = y * 0.9;
          if (a.phase === 'windup') {
            pose.legLift[0] = a.phaseT;                 // LF paw cocks up
            pose.crouch = 0.25 + 0.35 * a.phaseT;       // hindquarters coil
            pose.headPitch = 0.18 * a.phaseT;
            pose.spineRear = -0.10 * a.phaseT;          // shoulders load
          } else if (a.phase === 'strike') {
            pose.legLift[0] = Math.max(0, 1 - a.phaseT * 3);
            pose.crouch = 0.6 - 0.45 * a.phaseT;
            pose.headPitch = 0.18 - 0.34 * a.phaseT;
            pose.spineRear = -0.10 + 0.16 * a.phaseT;
          } else {
            pose.legLift[0] = 0;
            pose.crouch = 0.15 * (1 - a.phaseT);
            pose.headPitch = -0.16 * (1 - a.phaseT);
            pose.spineRear = 0.06 * (1 - a.phaseT);
          }
        },
        cleanup: () => {
          this.body.rotation.y = 0;
          const pose = this.gait.pose;
          pose.spineYaw = 0; pose.crouch = 0; pose.headPitch = 0;
          pose.spineRear = 0; pose.legLift[0] = 0;
        },
      };
    }
    if (dist <= this.attackRange && dist > 3) {
      return {
        kind: 'pounce',
        windup: 0.55, strike: 0.5, recover: 1.1, cooldown: 3.2,
        track: true,
        jump: 5,
        onWindup: () => { this._crouchTarget = 1; },
        onStrike: (a) => {
          // commit to the player's position at launch — dodge beats it;
          // leap scales to the live range, landing 1.5m short (standoff)
          const p = this.ctx.player;
          this._pounceDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
          if (p) {
            this._pounceDir.set(
              p.position.x - this.position.x, 0, p.position.z - this.position.z,
            );
            const d = this._pounceDir.length();
            this._pounceDir.normalize();
            this.heading = Math.atan2(this._pounceDir.x, this._pounceDir.z);
            a.jump = THREE.MathUtils.clamp(d - 1.5, 2, this.attackRange);
          }
          this._airborne = true;
        },
        onUpdate: (a, dt) => {
          if (a.phase === 'windup') {
            this._crouch = Math.min(1, this._crouch + dt * 5); // coil down
            this.gait.pose.crouch = this._crouch;
            // hind legs gather under the belly, head drops onto the line
            this.gait.pose.legLift[2] = this.gait.pose.legLift[3] = this._crouch * 0.35;
            this.gait.pose.headPitch = 0.22 * this._crouch;
          } else if (a.phase === 'strike') {
            this.gait.pose.crouch = this._crouch = 0;
            this.gait.pose.legLift[2] = this.gait.pose.legLift[3] = 0;
            this.gait.pose.headPitch = 0;
            const step = (a.jump / 0.5) * dt;
            this.moveRoot(this._pounceDir.x * step, this._pounceDir.z * step);
            const arc = Math.sin(a.phaseT * Math.PI) * 1.4;
            this.position.y = this.ctx.terrain.getHeight(this.position.x, this.position.z) + arc;
            this.gait.pose.tuck = Math.sin(a.phaseT * Math.PI); // legs gather mid-leap
            this.gait.pose.spineRear = -0.18 * Math.sin(a.phaseT * Math.PI); // nose leads
            // damage window covers the whole landing half of the leap
            if (a.phaseT > 0.5 && !a.hit && this.damagePlayer(30, 2.9)) {
              a.hit = true;
              this.knockbackPlayer(8);
            }
          } else {
            if (this._airborne) this.gait._impact = 1.6; // landing thump
            this._airborne = false;
            this.gait.pose.tuck = 0;
            this.gait.pose.spineRear = 0;
            this._crouch = Math.max(0, this._crouch - dt * 2);
          }
        },
        cleanup: () => {
          this._airborne = false;
          this.gait.pose.tuck = 0;
          this.gait.pose.spineRear = 0;
        },
      };
    }
    return null;
  }

  animate(dt, t) {
    if (this.state === 'dead') return;
    // perf-tech-04: LOD ring. Past ~40 body heights the rig runs phase-only
    // (machine-rig-17) so a tall machine still strides on the far ridge.
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    // wounded flavor (research 2.5): heavily damaged Sawtooths LIMP —
    // 40% slower with a hitching gait, like a cat holding up a paw
    const limp = this.health < this.maxHealth * 0.35;
    if (limp !== this._limping) {
      this._limping = limp;
      this.runSpeed = limp ? 5.4 : 9;
      this.gait.walk.stride = limp ? 1.25 : 1.55; // short hitching steps
      this.gait.impactAmp = limp ? 0.11 : 0.07;
    }

    // stalk: low prowl while suspicious/searching — long slinking stance
    const stalking = this.state === 'suspicious' || this.state === 'search';
    if (!this._attack) {
      this._crouch = THREE.MathUtils.damp(this._crouch, stalking ? 0.75 : 0, 4, dt);
      this.gait.pose.crouch = this._crouch;
      this.gait.walk.duty = stalking ? 0.7 : 0.64;
    }
    this.gait.update(dt, t);
  }
}
