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
import { installHerdRipple, fileStep, fileHold, rippleTick } from './tiller-herd.js';
import { hullShapes, hullShapesInto } from '../lib/blockout.js';
import { setOccluder, clearOccluders } from '../lib/sight.js';

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
 *   - a Plumb's chime ripples down a herd: the lamps flash in sequence, nearest
 *     first, and the herd closes file and keeps coring on its bearing. It never
 *     flees (M2 wave 1, IN1; `./tiller-herd.js`, A-herd-ripple).
 *
 * M2 WAVE 2, THE CORRECTED FORM (owner question Q1's default; the wave 1 ruling 7: "the Tiller that plays becomes
 * the corrected form in wave 2, so the herd gives cover"). The M1 body (three turned segments on a 1.30 m keel, its
 * drum on a neck) is replaced by the skirted six-stilt hull of `tools/build/instruments/gen-tiller.mjs`, 2.7 m,
 * about 4.5 x 1.8 m, in the Instruments' shared language (white enamel plates, brass, gunmetal, a lamp drum in a
 * yoke at the bow, a level vial, antennae and a banner). The bone set and order are the M1 Tiller's, so the gait,
 * the herd and the staged rows read the same skeleton. Its hull and skirt are SIGHT OCCLUDERS while it lives
 * (src/instruments/lib/sight.js, blockout.js form `built`): behaviour (moving cover, IN3) reads them in wave 3.
 *
 * THE LAMP (bible §7.2 / §7.4 "Weak point: drum lamp"): the kit lamp drum's face at the bow (r5Sockets.lens), lens
 * radius 0.171 m (a weak point of 0.22 m: >= 0.25 m across, >= 5 px at 40 m); a precise hit darkens it for 6 s
 * (`machine.lampDarkT`). The drum turns in its yoke (the `head` bone) within LOOK_YAW of the hull's heading.
 */

const URL = '/models/instruments/tiller.glb';
/** The generator's design height (`asset.extras.r5Size[1]`, the antenna's spike): scale 1, body space == generator space. */
const HEIGHT = 2.7;
/** How far the drum turns in its yoke toward what it looks at (rad): the yoke's cheeks clear the bow to here. */
const LOOK_YAW = 0.5;
/** The sight occluders' form (src/instruments/lib/blockout.js): the built hull and its skirt. */
const OCC_FORM = 'built';
let _occSerial = 0;

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
    this.addLamp(S.lens, { radius: S.lensR ?? 0.171 });
    this.addWeakPoint('lamp', this.body, S.lens[0], S.lens[1], S.lens[2], Math.max(0.22, (S.lensR ?? 0.171) * 1.3), 2.2);
    this._occSlot = `tiller:${++_occSerial}:`;
    this._occAt = null;
    this._occShapes = null;
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
      turnRadius: 1.4, lookClampYaw: LOOK_YAW, stanceFlex: 0.08,
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
    this._gDrum = glintAnchor(this, 'head', S.lens);
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
    this._publishOccluders();
    return r;
  }

  /**
   * The hull and skirt as sight occluders while it lives. The shapes are made once and moved in place
   * (`hullShapesInto`: no allocation on a frame it walks); a dead or disposed Tiller takes them out.
   */
  _publishOccluders() {
    if (!this.alive || this.state === 'dead') { this._dropOccluders(); return; }
    const p = this.position, h = this.heading;
    if (this._occShapes === null) {
      this._occShapes = hullShapes('tiller', p.x, p.z, h, OCC_FORM, p.y);
      for (let i = 0; i < this._occShapes.length; i++) setOccluder(this._occSlot + i, this._occShapes[i]);
      this._occAt = [p.x, p.z, h, p.y];
      return;
    }
    const o = this._occAt;
    if (Math.abs(o[0] - p.x) < 0.05 && Math.abs(o[1] - p.z) < 0.05 && Math.abs(o[2] - h) < 0.01 && Math.abs(o[3] - p.y) < 0.05) return;
    hullShapesInto('tiller', p.x, p.z, h, OCC_FORM, p.y, this._occShapes);
    o[0] = p.x; o[1] = p.z; o[2] = h; o[3] = p.y;
  }

  _dropOccluders() {
    if (this._occShapes === null) return;
    clearOccluders(this._occSlot);
    this._occShapes = null;
  }

  /** `ai/sites.js` dispose ends here (it never calls `dispose`): the occluders go with the wreck. */
  disposeFx(keepBeacon = false) {
    if (this._disposed) this._dropOccluders();
    return super.disposeFx(keepBeacon);
  }

  /** A staged Tiller (tools/frames/page.mjs) is undone through `dispose`. */
  dispose() { this._dropOccluders(); super.dispose(); }

  /** Calm: a follower walks the leader's path FILE.gap x its rank behind (bible: "on one bearing", in file). */
  _statePatrol(dt) {
    const h = this.herd, f = h ? h.file : null;
    if (f !== null && f !== undefined && this.sc.suspicion <= this.perceptCfg.susEnter) {
      if (f.leader !== this) { if (fileStep(this, f, dt, this.walkSpeed)) return; }
      else if (fileHold(this, f, dt)) return;     // IN1: after a chime the leader halts to core while the file closes
    }
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
  /** Size class (lib/sizeclass.js; bible §7.4): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'medium',
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
    /** the herd walks IN FILE, a Plumb's chime ripples down it and it closes file; it never flees (IN1, `./tiller-herd.js`) */
    install: (m) => installHerdRipple(m),
  },
};

