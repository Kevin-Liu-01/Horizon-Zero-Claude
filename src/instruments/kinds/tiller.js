import { rollLoot } from '../../entities/machines/machine.js';
import { buildRig } from '../../entities/machines/autorig.js';
import { GaitController } from '../../entities/machines/gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from '../../entities/machines/rig/lod.js';
import { snapSockets } from '../../entities/machines/rig/sockets.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { liftExtras, seedAuthoredWeights, weightAudit } from '../lib/generated.js';

/**
 * TILLER — the W0 STAGING FIXTURE (instruments-core W0a; handed to
 * instruments-a at W1, who own the fidelity pass).
 *
 * Bible §7.4 #3: medium, the herd (`herd` role). A glazed boat-hull on six
 * stilts, bronze gimbals with oxblood bands, theodolite drum at the front, seed
 * hopper on top, auger at the rear. Alternating-tripod hexapod.
 *
 * This is the PROVEN pipeline-proof creature (`tools/r5-poc/tiller.js`,
 * `docs/research/round5-pipeline-creatures-world.md` §0) brought in through the
 * kind registry instead of a `?poc=` hook: generated GLB -> `liftExtras` ->
 * `registerKind` -> `ExpansionMachine` -> `attachRigRuntime({quantise:false})`
 * -> autorig `buildRig` with generator-authored weights -> `GaitController` ->
 * fold -> socket snap. 0 lines changed in `autorig.js` / `gait.js`.
 *
 * R28: role-staged gates run on this fixture until the real kinds land; its
 * fidelity-only clauses (A-sil40 pair set, V26/V27 judging) report
 * SKIP-fixture. It is NEVER a legacy kind.
 *
 * MODEL LOCATION. `public/models/instruments/tiller.glb`, the output of
 * pipeline's promoted generator (`tools/build/instruments/gen-tiller.mjs`,
 * licence row `instrument-tiller`; byte-identical to the W0a POC copy under
 * `public/models/r5-poc/`, which pipeline deletes at the W0 exit).
 *
 * THE LAMP (W0b, bible §7.2 / §7.4 "Weak point: drum lamp"). The lens dome sits
 * in the theodolite drum at the front (generator socket `lens`, dome front at
 * z 2.07 m, radius 0.185 m); its lamp (iris face + graphite barrel) is registered
 * with `addLamp` just in front of the dome and rides the head bone. The drum lamp is also the weak
 * point: a precise hit darkens it for 6 s (`machine.lampDarkT`).
 */

const URL = '/models/instruments/tiller.glb';
/**
 * The lamp drum face: just in front of the lens dome (body space), and its radius. The face
 * (0.20 m) fills the drum front (drum radius 0.228 m); the lit glass is `APERTURE_MAX` of it
 * (0.132 m, 0.26 m across: bible §7.3 >= 0.25 m, >= 5 px at 40 m) and the barrel behind it
 * sinks into the drum.
 */
const LAMP_AT = [0, 2.28, 2.085];
const LAMP_R = 0.20;
/** The generator's design height (`asset.extras.r5Size[1]`): scale 1, body space == generator space. */
const HEIGHT = 2.6755;

const HEX_WALK = { stride: 0.95, duty: 0.6, lift: 0.15,
  offsets: { LF: 0, RM: 0, LH: 0, RF: 0.5, LM: 0.5, RH: 0.5 } };       // alternating tripod
const HEX_RUN = { stride: 1.9, duty: 0.46, lift: 0.26,
  offsets: { LF: 0, RM: 0.05, LH: 0.1, RF: 0.5, LM: 0.55, RH: 0.6 } };   // tripod, slight wave

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
    this._seeded = seedAuthoredWeights(this);

    // the drum lamp: iris + beam drawn by `machines.lamps` (one instanced draw each)
    this.addLamp(LAMP_AT, { radius: LAMP_R });
    this.addWeakPoint('lamp', this.body, S.lens[0], S.lens[1], S.lens[2], 0.26, 2.2);
    this.lootTable = rollLoot([{ id: 'metal-shards', min: 8, max: 14 }, { id: 'wire', min: 1, max: 2 }]);

    attachRigRuntime(this, { quantise: false });   // keep the generated palette
    buildRig(this, entry.r5Rig);
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
    this._deathRoll = 0.3;
    this._deathSink = 0.03;
  }

  /** Generator labels vs the weights the rig binds (A-weights-authored). */
  weightAudit() { return weightAudit(this); }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  animate(dt, t) {
    if (this.state === 'dead') return;
    this._snapDoctrineSockets();
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    this.gait.update(dt, t);
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
  fixture: true,
  Cls: Tiller,
  spec: { url: URL, targetHeight: HEIGHT, yaw: 0 },
  onEntry: liftExtras,
  /** Bible §7.4 #3 attacks on generic builders: Auger Jab (rear), Hopper Burst, Herd Trample. */
  tables: {
    perception: { gain: 2.1, periphRange: 9, scanSweep: 1.0, scanPeriod: 5.0, contactRange: 4.6 },
    engage: { archetype: 'skittish', band: [4.2, 14], orbitSpeed: 0.75, backSpeed: 0.9 },
    attacks: [
      { id: 'hopper-burst', min: 0, max: 5.2, cd: 4.0, score: 1.0, generic: 'sweep',
        params: { damage: 10, windup: 0.5, strike: 0.25, recover: 0.7, range: 5.2, arcDeg: 360, knock: 4 } },
      { id: 'auger-jab', min: 0, max: 4.4, cd: 3.2, score: 0.9, arc: 'rear', generic: 'sweep',
        params: { damage: 16, windup: 0.4, strike: 0.2, recover: 0.6, range: 4.4, arcDeg: 120, knock: 6 } },
      { id: 'drum-shove', min: 3.6, max: 8.6, cd: 3.6, score: 0.85, generic: 'lunge',
        params: { damage: 14, windup: 0.45, strike: 0.22, recover: 0.7, dash: 4.0, range: 4.4 } },
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
    spawn: [{ n: 3, x: 64, z: -96, route: 22, herd: true, poi: 'tiller-fixture' }],
  },
};
