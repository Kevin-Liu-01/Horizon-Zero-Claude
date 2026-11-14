import * as THREE from 'three';
import { rollLoot } from '../../entities/machines/machine.js';
import { buildRig } from '../../entities/machines/autorig.js';
import { GaitController } from '../../entities/machines/gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from '../../entities/machines/rig/lod.js';
import { snapSockets } from '../../entities/machines/rig/sockets.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { liftExtras, seedAuthoredWeights, weightAudit } from '../lib/generated.js';
import { prepareEntry, installHull } from '../lib/hull.js';
import { prepareTools, detachTool, mountTool, glintAnchor, telegraphOnWindup } from '../lib/kindkit.js';
import { installHerdRipple, fileStep, rippleTick } from './tiller-herd.js';

/**
 * TILLER — bible §7.4 #3 (medium; the herd, role `herd`). A glazed boat-hull on
 * six stilts, bronze gimbals with oxblood bands, theodolite drum at the front,
 * seed hopper on top, auger at the rear. Alternating-tripod hexapod.
 *
 * W0: instruments-core's staging fixture on the kept machine stack (generated
 * GLB -> `liftExtras` -> `registerKind` -> `ExpansionMachine` ->
 * `attachRigRuntime({quantise:false})` -> autorig `buildRig` with
 * generator-authored weights -> `GaitController` -> fold -> socket snap; 0 lines
 * changed in `autorig.js` / `gait.js`).
 *
 * W1 FIDELITY PASS (instruments-a). No longer a fixture:
 *   - the finish is the shared kit's (vertex AO, verdigris, dust band, crazing,
 *     the decal atlas: `tools/build/instruments/gen-tiller.mjs`) and the hull
 *     look's (lamp spill, calRim, hull flash: `lib/hull.js`);
 *   - the LOD1 caster proxy (I-04) casts in place of the hull once the engine's
 *     CASTER_ONLY layer is live (look-post), hidden until then;
 *   - the AUGER is a real tool (bible §7.4: Pry -> no rear attack, drops an auger
 *     bit): a component on the tail2 bone, linked to `auger-jab`, and it SPINS
 *     when it works (V27: the working end does the work);
 *   - every attack telegraphs (I-05): steady lamp, pinhole, a warm glint on the
 *     striking end, windups 0.45-0.9 s;
 *   - a Plumb's chime ripples down a herd: the lamps flash in sequence, then the
 *     herd flees IN FILE behind its leader (`./tiller-herd.js`, A-herd-ripple).
 *
 * THE LAMP (bible §7.2 / §7.4 "Weak point: drum lamp"): the face just in front
 * of the glass dome, radius 0.20 m (glass 0.26 m across: >= 0.25 m, >= 5 px at
 * 40 m); a precise hit darkens it for 6 s (`machine.lampDarkT`).
 */

const URL = '/models/instruments/tiller.glb';
const LAMP_AT = [0, 2.28, 2.085];
const LAMP_R = 0.20;
/** The generator's design height (`asset.extras.r5Size[1]`): scale 1, body space == generator space. */
const HEIGHT = 2.6755;

const HEX_WALK = { stride: 0.95, duty: 0.6, lift: 0.15,
  offsets: { LF: 0, RM: 0, LH: 0, RF: 0.5, LM: 0.5, RH: 0.5 } };       // alternating tripod
const HEX_RUN = { stride: 1.9, duty: 0.46, lift: 0.26,
  offsets: { LF: 0, RM: 0.05, LH: 0.1, RF: 0.5, LM: 0.55, RH: 0.6 } };   // tripod, slight wave

const _axis = new THREE.Vector3();

export class Tiller extends ExpansionMachine {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, {
      kind: 'tiller',
      displayName: 'Tiller',
      rigged: false,
      yawFix: 0,                 // generated facing +Z: no correction
      maxHealth: 320, armor: 0.1, level: 6,
      walkSpeed: 1.5, runSpeed: 6.0, turnRate: 1.5,
      sightRange: 34, hearRange: 24, eyeHeight: 1.7,
      attackRange: 3.2, bodyRadius: 1.15,
      ...opts,
    });
    const entry = ctx.assets.models[this.modelKind];
    const S = entry.r5Sockets;
    this._teleA = null;
    this._augerSpin = 0.5; this._augerSpin = 0;
    this._rippleAt = 0.5; this._rippleAt = -1;   // herd ripple: sim time of this member's flash (tiller-herd.js)
    this._seeded = seedAuthoredWeights(this);
    const auger = detachTool(this, 'tiller-auger');

    // the drum lamp: iris + beam drawn by `machines.lamps` (one instanced draw each)
    this.addLamp(LAMP_AT, { radius: LAMP_R });
    this.addWeakPoint('lamp', this.body, S.lens[0], S.lens[1], S.lens[2], 0.26, 2.2);
    this.lootTable = rollLoot([{ id: 'metal-shards', min: 8, max: 14 }, { id: 'wire', min: 1, max: 2 }]);

    attachRigRuntime(this, { quantise: false });   // keep the generated palette
    buildRig(this, entry.r5Rig);
    this._auger = mountTool(this, auger, {
      name: 'auger', displayName: 'Auger', bone: 'tail2', anchor: entry.tools?.['tiller-auger'] || S.augerRoot,
      tearHp: 70, linkedAttack: 'auger-jab', loot: [{ id: 'auger-bit', n: 1 }],
    });
    if (this._auger) {
      const a = entry.tools?.['tiller-auger'] || S.augerRoot, t = S.auger;
      this._augerAxis = new THREE.Vector3(t[0] - a[0], t[1] - a[1], t[2] - a[2]).normalize();
    }
    this.gait = new GaitController(this, this.rig, {
      walk: HEX_WALK, run: HEX_RUN, runRef: 6.0,
      rollAmp: 0.018, impactAmp: 0.025, breatheRate: 0.8, stepDustSpeed: 4.0,
      turnRadius: 1.4, lookClampYaw: 1.2, stanceFlex: 0.08,
      fidgets: [
        { name: 'survey-sweep', head: 0.18, dur: 2.4 },
        { name: 'probe', head: -0.3, spine: 0.06, tail: 0.25, dur: 2.0 },
      ],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    snapSockets(this);
    installHull(this);
    // the striking ends' glints (I-05): auger tip, drum lamp, hopper lantern
    this._gAuger = glintAnchor(this, 'tail2', S.auger);
    this._gDrum = glintAnchor(this, 'head', LAMP_AT);
    this._gHopper = glintAnchor(this, 'pelvis', S.lantern);
    this._deathRoll = 0.3;
    this._deathSink = 0.03;
  }

  /** Generator labels vs the weights the rig binds (A-weights-authored). */
  weightAudit() { return weightAudit(this); }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /** The herd file (`./tiller-herd.js`): the leader lays the crumbs; a pending chime ripple ticks. */
  update(dt, t) {
    const r = super.update(dt, t);
    const h = this.herd, f = h ? h.file : null;
    if (f !== null && f !== undefined && f.leader === this && this.alive) f.record(this.position.x, this.position.z);
    if (this._rippleAt >= 0) rippleTick(this);
    return r;
  }

  /** Calm: a follower walks the leader's path FILE.gap x its rank behind (bible: "on one bearing", in file). */
  _statePatrol(dt) {
    const h = this.herd, f = h ? h.file : null;
    if (f !== null && f !== undefined && f.leader !== this && this.sc.suspicion <= this.perceptCfg.susEnter
      && fileStep(this, f, dt, this.walkSpeed)) return;
    super._statePatrol(dt);
  }

  /** The working end of each attack (I-05 glint, V27). */
  _glintFor(id) {
    return id === 'auger-jab' ? this._gAuger : id === 'hopper-burst' ? this._gHopper : this._gDrum;
  }

  animate(dt, t) {
    /* Both gait entry points are loaded on every call (W0b fix round 3): the cheap path ran for the first time when
     * she sprinted away from the fight (rig LOD 3), and its property load, never run before, deoptimised this
     * function there ("Insufficient type feedback for generic named access", measured). The call stays on its
     * branch; the loads it needs have feedback from the first frame. */
    const gait = this.gait, cheap = gait.updateCheap, dead = this.state === 'dead';
    if (dead) return;
    this._snapDoctrineSockets();
    const lod = updateRigLOD(this);
    if (lod >= 3) { cheap.call(gait, dt, t); return; }
    gait.update(dt, t);
    const a = this._attack;
    if (a !== null && a !== undefined) {
      telegraphOnWindup(this, a, this._glintFor(a.kind), 0.07);
      // V27: the auger bores while it jabs (windup spins up, strike drives, recover spins down)
      if (a.kind === 'auger-jab' && this._auger && this._auger.attached) {
        const w = a.phase === 'windup' ? 6 + 18 * a.phaseT : a.phase === 'strike' ? 28 : 28 * (1 - a.phaseT);
        this._augerSpin += w * dt;
        const k = a.phase === 'windup' ? a.phaseT : a.phase === 'strike' ? 1 : 1 - a.phaseT;
        gait.rotX(this.rig.tail[0], -0.32 * k);
        gait.rotX(this.rig.tail[1], -0.22 * k);
      }
    }
    if (this._auger && this._auger.attached && this._augerSpin !== 0) {
      this._auger.mesh.children[0]?.quaternion.setFromAxisAngle(this._augerAxis, this._augerSpin);
    }
  }
}

/**
 * The kind module contract (`src/instruments/registry.js`): one default export
 * per kind, dropped into `src/instruments/kinds/`, picked up with 0 edits to
 * kept files.
 */
export default {
  id: 'tiller',
  role: 'herd',
  Cls: Tiller,
  /** P-03: the registry height (m) hero-body's big-fight framing reads (`machines.heightOf`). */
  height: HEIGHT,
  spec: { url: URL, targetHeight: HEIGHT, yaw: 0 },
  onEntry: (entry) => { liftExtras(entry); prepareEntry(entry, 'tiller'); prepareTools(entry); },
  /** Bible §7.4 #3 attacks on generic builders: Auger Jab (rear), Hopper Burst, Herd Trample; windups 0.45-0.9 s (I-05). */
  tables: {
    perception: { gain: 2.1, periphRange: 9, scanSweep: 1.0, scanPeriod: 5.0, contactRange: 4.6 },
    engage: { archetype: 'skittish', band: [4.2, 14], orbitSpeed: 0.75, backSpeed: 0.9 },
    attacks: [
      { id: 'hopper-burst', min: 0, max: 5.2, cd: 4.0, score: 1.0, generic: 'sweep',
        params: { damage: 10, windup: 0.5, strike: 0.25, recover: 0.7, range: 5.2, arcDeg: 360, knock: 4 } },
      { id: 'auger-jab', min: 0, max: 4.4, cd: 3.2, score: 0.9, arc: 'rear', generic: 'sweep',
        params: { damage: 16, windup: 0.48, strike: 0.2, recover: 0.6, range: 4.4, arcDeg: 120, knock: 6 } },
      { id: 'drum-shove', min: 3.6, max: 8.6, cd: 3.6, score: 0.85, generic: 'lunge',
        params: { damage: 14, windup: 0.48, strike: 0.22, recover: 0.7, dash: 4.0, range: 4.4 } },
      { id: 'herd-trample', min: 8.2, max: 28, cd: 6.5, score: 0.7, generic: 'charge',
        params: { damage: 20, windup: 0.6, strike: 0.8, recover: 0.9, speed: 9, knock: 8, range: 3.4 } },
    ],
    attackMode: 'table',
    react: { staggerFrac: 0.13, downedFrac: 0.3 },
    elem: 110,
  },
  /** Audio set id (audio lane, W3): until it exists `audio.js` falls back to its default voice. */
  audio: { set: 'tiller', mass: 'medium' },
  doctrine: {
    herd: true,
    spawn: [{ n: 3, x: 64, z: -96, route: 22, herd: true, poi: 'tiller-herd' }],
    /** the herd flees IN FILE (A-herd-ripple), and a Plumb's chime ripples down it (`./tiller-herd.js`) */
    install: (m) => installHerdRipple(m),
  },
};

