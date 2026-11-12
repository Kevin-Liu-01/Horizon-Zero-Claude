import { rollLoot } from '../../entities/machines/machine.js';
import { buildRig } from '../../entities/machines/autorig.js';
import { GaitController } from '../../entities/machines/gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from '../../entities/machines/rig/lod.js';
import { snapSockets } from '../../entities/machines/rig/sockets.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { liftExtras, seedAuthoredWeights, weightAudit } from '../lib/generated.js';
import { prepareEntry, installHull } from '../lib/hull.js';
import { prepareTools, detachTool, mountTool, glintAnchor, telegraphOnWindup } from '../lib/kindkit.js';
import { transectsOf, TRANSECT } from './peg-transect.js';

/**
 * PEG — bible §7.4 #1 (small; the swarm that draws the lines, role `swarm`).
 * instruments-a, W1. Model: `tools/build/instruments/gen-peg.mjs`.
 *
 * A milk churn on four short bronze legs: one lamp at the front, a PISTON
 * MALLET on its back, a rack of vermilion/white survey pegs on each flank (the
 * TOOL: Pry -> bronze pins; no Peg Shot after). A swarm of 3-6 walks straight
 * lines and, every `TRANSECT.spacing` metres, stops and DRIVES a peg with the
 * mallet: the pegs are a transect (`./peg-transect.js`: one instanced draw for
 * every peg of every Peg; crossing a line within 20 m of a Plumb raises the Plumb
 * to wary; the line cuts the reed through world-ground's `cutCover`).
 *
 * Attacks (bible): MALLET (the piston arm lifts and slams: a short lunge), PEG
 * SHOT (one peg fired from the rack: a knock), SWARM RUSH (a committed lunge).
 * Every windup telegraphs (I-05). Weak point: the lamp — any hit kills it (the
 * Peg is exempt from A-sil40's height and A-weak40's size bars).
 */

const URL = '/models/instruments/peg.glb';
const LAMP_R = 0.12;
const HEIGHT = 0.924;
const QUAD_WALK = { stride: 0.34, duty: 0.6, lift: 0.07, offsets: { LF: 0, RH: 0, RF: 0.5, LH: 0.5 } };   // trot
const QUAD_RUN = { stride: 0.7, duty: 0.44, lift: 0.11, offsets: { LF: 0, RH: 0.04, RF: 0.5, LH: 0.54 } };
/** The drive: stop, lift the mallet, slam the peg in. */
export const DRIVE = Object.freeze({ seconds: 0.75, strikeAt: 0.42 });

export class Peg extends ExpansionMachine {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, {
      kind: 'peg',
      displayName: 'Peg',
      rigged: false,
      yawFix: 0,
      maxHealth: 46, armor: 0.0, level: 3,
      walkSpeed: 1.25, runSpeed: 5.2, turnRate: 3.2,
      sightRange: 26, hearRange: 18, eyeHeight: 0.55,
      attackRange: 1.5, bodyRadius: 0.45,
      ...opts,
    });
    const entry = ctx.assets.models[this.modelKind];
    const S = entry.r5Sockets;
    this._teleA = null;
    this._driveT = 0.5; this._driveT = -1;
    this._drove = 0;
    this._trav = 0.5; this._trav = 0;
    this._lx = 0.5; this._lx = this.position.x;
    this._lz = 0.5; this._lz = this.position.z;
    this._seeded = seedAuthoredWeights(this);
    const rack = detachTool(this, 'peg-rack');

    this.addLamp(S.lamp, { radius: LAMP_R });
    // any hit on the lamp kills a Peg (bible §7.4 #1)
    this.addWeakPoint('lamp', this.body, S.lamp[0], S.lamp[1], S.lamp[2], 0.11, 8);
    this.lootTable = rollLoot([{ id: 'metal-shards', min: 2, max: 4 }]);

    attachRigRuntime(this, { quantise: false });
    buildRig(this, entry.r5Rig);
    this._rack = mountTool(this, rack, {
      name: 'peg-rack', displayName: 'Peg rack', bone: 'pelvis', anchor: entry.tools?.['peg-rack'] || S.rackRoot,
      tearHp: 30, linkedAttack: 'peg-shot', loot: [{ id: 'bronze-pins', n: 3 }],
    });
    this.gait = new GaitController(this, this.rig, {
      walk: QUAD_WALK, run: QUAD_RUN, runRef: 5.2,
      rollAmp: 0.03, impactAmp: 0.04, breatheRate: 1.4, stepDustSpeed: 2.5,
      turnRadius: 0.5, lookClampYaw: 0.7, stanceFlex: 0.06,
      fidgets: [{ name: 'sniff-line', head: 0.25, dur: 1.4 }],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    snapSockets(this);
    installHull(this);
    this._gMallet = glintAnchor(this, 'mallet', S.mallet);
    this._gLamp = glintAnchor(this, 'head', S.lamp);
    this._gRack = glintAnchor(this, 'pelvis', S.rack);
    this._deathRoll = 0.6;
    this._deathSink = 0.02;
  }

  weightAudit() { return weightAudit(this); }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /** The transect: walk, stop, drive a peg every TRANSECT.spacing metres (calm only). */
  _statePatrol(dt) {
    const sc = this.sc;
    if (this._driveT >= 0) {
      const t0 = this._driveT;
      this._driveT += dt;
      sc._speed += (0 - sc._speed) * (1 - Math.exp(-10 * dt));
      if (t0 < DRIVE.strikeAt && this._driveT >= DRIVE.strikeAt) {
        const h = sc.heading;
        transectsOf(this.manager)?.add(this, this.position.x + Math.sin(h) * 0.62, this.position.z + Math.cos(h) * 0.62);
        this._drove++;
      }
      if (this._driveT >= DRIVE.seconds) this._driveT = -1;
      if (sc.suspicion > this.perceptCfg.susEnter) { this._driveT = -1; this.setState('suspicious'); }
      return;
    }
    super._statePatrol(dt);
    const dx = this.position.x - this._lx, dz = this.position.z - this._lz;
    this._lx = this.position.x; this._lz = this.position.z;
    if (sc._waitT <= 0) this._trav += Math.sqrt(dx * dx + dz * dz);
    if (this._trav >= TRANSECT.spacing && this.state === 'patrol') { this._trav = 0; this._driveT = 0; }
  }

  update(dt, t) {
    const r = super.update(dt, t);
    if (this.alive) transectsOf(this.manager)?.update();
    return r;
  }

  /** Its pegs leave the world with it (`ai/sites.js` dispose ends in disposeFx with `_disposed` set). */
  disposeFx(keepBeacon = false) {
    const r = super.disposeFx(keepBeacon);
    if (this._disposed) this.manager?.transects?.release(this);
    return r;
  }

  animate(dt, t) {
    const gait = this.gait, cheap = gait.updateCheap, dead = this.state === 'dead';
    if (dead) return;
    this._snapDoctrineSockets();
    const lod = updateRigLOD(this);
    if (lod >= 3) { cheap.call(gait, dt, t); return; }
    gait.update(dt, t);
    // the mallet: lifts (arm up and back), then slams the head down in front of the lamp
    let lift = 0;
    const d = this._driveT;
    if (d >= 0) {
      const s = DRIVE.strikeAt;
      lift = d < s ? -1.0 * Math.sin((d / s) * 1.5708) : 0.32 * Math.max(0, 1 - (d - s) / 0.25);
    }
    const a = this._attack;
    if (a !== null && a !== undefined) {
      const g = a.kind === 'mallet' ? this._gMallet : a.kind === 'peg-shot' ? this._gRack : this._gLamp;
      telegraphOnWindup(this, a, g, 0.05);
      if (a.kind === 'mallet') lift = a.phase === 'windup' ? -1.05 * a.phaseT : a.phase === 'strike' ? -1.05 + 1.4 * a.phaseT : 0.35 * (1 - a.phaseT);
      else if (a.kind === 'swarm-rush') lift = -0.5 * (a.phase === 'windup' ? a.phaseT : a.phase === 'strike' ? 1 : 1 - a.phaseT);
    }
    if (lift !== 0) gait.rotX(this.rig.tail[0], lift);
  }
}

export default {
  id: 'peg',
  role: 'swarm',
  Cls: Peg,
  /** P-03: the registry height (m) (`machines.heightOf`). */
  height: HEIGHT,
  spec: { url: URL, targetHeight: HEIGHT, yaw: 0 },
  onEntry: (entry) => { liftExtras(entry); prepareEntry(entry, 'peg'); prepareTools(entry); },
  tables: {
    perception: { gain: 2.4, periphRange: 7, scanSweep: 0.7, scanPeriod: 3.2, contactRange: 2.2 },
    engage: { archetype: 'pack', band: [1.2, 7], orbitSpeed: 1.2, backSpeed: 1.1 },
    attacks: [
      { id: 'mallet', min: 0, max: 2.0, cd: 2.4, score: 1.0, generic: 'lunge',
        params: { damage: 9, windup: 0.5, strike: 0.18, recover: 0.5, dash: 0.6, range: 1.5 } },
      { id: 'peg-shot', min: 3.0, max: 14, cd: 3.6, score: 0.9, generic: 'volley',
        params: { damage: 8, windup: 0.55, strike: 0.12, recover: 0.6, shots: 1, range: 14, arcDeg: 10, knock: 3 } },
      { id: 'swarm-rush', min: 1.7, max: 9, cd: 4.4, score: 0.8, generic: 'lunge',
        params: { damage: 10, windup: 0.46, strike: 0.3, recover: 0.6, dash: 3.2, range: 1.6 } },
    ],
    attackMode: 'table',
    react: { staggerFrac: 0.3, downedFrac: 0.6 },
    elem: 50,
  },
  audio: { set: 'peg', mass: 'small' },
  doctrine: {
    spawn: [{ n: 3, x: 54, z: -80, route: 16, routePoints: 2, poi: 'peg-transect' }],
  },
};
