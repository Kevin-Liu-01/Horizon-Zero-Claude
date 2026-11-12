import * as THREE from 'three';
import { rollLoot } from '../../entities/machines/machine.js';
import { buildRig } from '../../entities/machines/autorig.js';
import { GaitController } from '../../entities/machines/gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from '../../entities/machines/rig/lod.js';
import { snapSockets } from '../../entities/machines/rig/sockets.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { liftExtras, seedAuthoredWeights, weightAudit } from '../lib/generated.js';
import { prepareEntry, installHull, hullOf } from '../lib/hull.js';
import { prepareTools, detachTool, mountTool, glintAnchor, telegraphOnWindup } from '../lib/kindkit.js';
import { scaleRig } from '../lib/scale.js';

/**
 * PLUMB — bible §7.4 #2 (small; the sentry, role `sentry`). instruments-a, W1.
 *
 * A walking theodolite: three levelling-staff legs meet at a bronze tripod head;
 * a celadon lamp drum turns 360 degrees on a short mast (the gait's head look,
 * `lookClampYaw` pi) under a telescope on its standards and a glowing LEVEL VIAL;
 * a bronze plumb bob hangs on 1.2 m of cable, a 2-bone tail swung here as a
 * pendulum. Model: `tools/build/instruments/gen-plumb.mjs`.
 *
 * Behaviour (bible): stands at survey stations for 8-15 s readings (the drum
 * sweeps); on sighting Brea it FLAGS her (perception row `flags: true`: every
 * Instrument within 60 m knows her position for `perception.flagDuration`, 8 s,
 * 3 s in Guild Whites) and CHIMES (`plumb-chime`: a Tiller herd within 45 m
 * ripples its lamps and flees in file, `./tiller-herd.js`).
 *
 * Attacks: PENDULUM (the bob swings a 3 m conical arc: knockback) and BOB DROP
 * (the bob is hauled up over the head and slammed: a 2 m ring), both linked to
 * the bob — a TOOL (Pry tears it off: no melee after, bible §7.4); SIGHTLINE (a
 * narrow hit at range from the drum that raises the Flag). Every windup
 * telegraphs (I-05).
 *
 * Weak points: the LAMP (the drum face; a precise hit darkens it 6 s, and a dark
 * Plumb cannot Flag) and the LEVEL VIAL (Joint class): two vial hits and it
 * cannot find level — it TOPPLES for 4 s (E10, `_topple`: a rigid fall about its
 * feet line, laid on its own lowest geometry, then it stands back up), with no
 * `gait.js` change.
 *
 * THE `scale` OPTION (bible: "the same generator at scale 3x and 6.5x walks
 * hull-hidden before the Transit exists"; gate `A-plumb-scale`). `opts.scale` k
 * scales the model holder and the generator's own rig spec through the shared
 * `scaleRig` (`lib/scale.js`, the function the generator's `--scale` uses), so a
 * Plumb at k is the generator's Plumb at k. Speeds scale by sqrt(k) (dynamic
 * similarity); `opts.hullHidden` hides the hull (the rig walks alone).
 */

const URL = '/models/instruments/plumb.glb';
const LAMP_R = 0.19;
const HEIGHT = 3.408;
const TRI = (k) => ({
  walk: { stride: 0.78 * k, duty: 0.72, lift: 0.14 * k, offsets: { MF: 0, LH: 1 / 3, RH: 2 / 3 } },
  run: { stride: 1.45 * k, duty: 0.6, lift: 0.22 * k, offsets: { MF: 0, LH: 1 / 3, RH: 2 / 3 } },
});
/** E10, the topple (bible: "topples 4 s"). */
export const TOPPLE = Object.freeze({ fallS: 0.42, downS: 4.0, riseS: 0.6, hits: 2, clearM: 0.02 });

const _wp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);

export class Plumb extends ExpansionMachine {
  constructor(ctx, manager, opts = {}) {
    const k = opts.scale > 0 ? opts.scale : 1, rk = Math.sqrt(k);
    super(ctx, manager, {
      kind: 'plumb',
      displayName: 'Plumb',
      rigged: false,
      yawFix: 0,
      maxHealth: 190, armor: 0.05, level: 5,
      walkSpeed: 1.1 * rk, runSpeed: 3.8 * rk, turnRate: 1.8 / rk,
      sightRange: 48, hearRange: 20, eyeHeight: 2.9 * k,
      attackRange: 3.0 * k, bodyRadius: 0.95 * k,
      ...opts,
    });
    const entry = ctx.assets.models[this.modelKind];
    const S = entry.r5Sockets;
    const sc3 = (v) => [v[0] * k, v[1] * k, v[2] * k];
    this._scale = k;
    this._hullHidden = !!opts.hullHidden;
    this._teleA = null;
    this._flagA = null;
    this._vialHits = 0;
    this._toppleT = 0.5; this._toppleT = -1;
    this._toppleDir = 1;
    this._toppleAng = 0.5; this._toppleAng = 1.7;
    this._pivotZ = 0.5; this._pivotZ = 0;
    this._swing = 0.5; this._swing = 0;
    this._lastWp = -1;
    if (k !== 1) {
      this.holder.scale.setScalar(k);
      this.height *= k;
      this.size = this.size.clone().multiplyScalar(k);
    }
    this._seeded = seedAuthoredWeights(this);
    const bob = detachTool(this, 'plumb-bob');

    this.addLamp(sc3(S.lamp), { radius: LAMP_R * k });
    this.addWeakPoint('lamp', this.body, ...sc3(S.lamp), 0.14 * k, 2.2);
    this._vialWp = this.addWeakPoint('vial', this.body, ...sc3(S.vial), 0.13 * k, 2.0);
    this.lootTable = rollLoot([{ id: 'metal-shards', min: 4, max: 8 }, { id: 'wire', min: 1, max: 3 }]);

    attachRigRuntime(this, { quantise: false });
    const rig = scaleRig(entry.r5Rig, k);
    buildRig(this, rig);
    this._bob = mountTool(this, bob, {
      name: 'bob', displayName: 'Plumb bob', bone: 'tail2', anchor: entry.tools?.['plumb-bob'] || S.bobTop, scale: k,
      tearHp: 55, linkedAttack: 'pendulum', loot: [{ id: 'plumb-bob', n: 1 }],
    });
    const T = TRI(k);
    this.gait = new GaitController(this, this.rig, {
      walk: T.walk, run: T.run, runRef: this.runSpeed,
      rollAmp: 0.012, impactAmp: 0.018, breatheRate: 0.5, stepDustSpeed: 3.0 * rk,
      turnRadius: 0.9 * k, lookClampYaw: Math.PI * 0.95, stanceFlex: 0.05,
      fidgets: [
        { name: 'station-sweep', head: 0.9, dur: 3.2 },
        { name: 'reading', head: -0.5, dur: 2.6 },
      ],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this, k !== 1 ? { pool: `plumb@${k}` } : {});
    snapSockets(this);
    installHull(this);
    if (opts.hullHidden) { const h = hullOf(this); if (h) h.visible = false; }
    this._gBob = glintAnchor(this, 'tail2', S.bob, k);
    this._gDrum = glintAnchor(this, 'head', S.lamp, k);
    this._measureTopple(entry, k);
    this._deathRoll = 0.25;
    this._deathSink = 0.02;
  }

  weightAudit() { return weightAudit(this); }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /** A toppled Plumb beyond the animation ring still finishes its fall and stands (animate() is skipped there). */
  update(dt, t) {
    const r = super.update(dt, t);
    if (this._toppleT >= 0 && this.lowLOD && this.alive) this._poseTopple(dt);
    return r;
  }

  /** Bob Drop needs the bob too (both bob attacks die with it). */
  attackDisabled(id) {
    if (id === 'bob-drop') return !(this._bob && this._bob.attached);
    return super.attackDisabled(id);
  }

  /** Bible: "chimes on alarm" — the herd ripple listens (`./tiller-herd.js`). */
  onAlerted() {
    if (this.lampDarkT > 0) return;
    this.emit('plumb-chime', { machine: this, x: this.position.x, z: this.position.z });
  }

  /** Survey stations: 8-15 s readings at each waypoint (the drum sweeps through the gait's fidgets). */
  _statePatrol(dt) {
    super._statePatrol(dt);
    if (this._wpIndex !== this._lastWp) {
      if (this._lastWp >= 0) this.sc._waitT = 8 + Math.random() * 7;
      this._lastWp = this._wpIndex;
    }
  }

  /** Two level-vial hits: it cannot find level, and it topples (E10). */
  takeDamage(hit) {
    let vial = false;
    const wp = this._vialWp, pt = hit && hit.point;
    if (this.alive && wp && pt) {
      wp.obj.getWorldPosition(_wp);
      vial = _wp.distanceToSquared(pt) <= wp.radius * wp.radius;
    }
    const r = super.takeDamage(hit);
    if (vial && this.alive && this._toppleT < 0) {
      this._vialHits++;
      if (this._vialHits >= TOPPLE.hits) this._topple(pt);
    }
    return r;
  }

  /**
   * The lay angle, once per spawn: the rigid fall about the rear feet line (or the
   * front foot) that brings the hull's lowest bind-pose vertex to TOPPLE.clearM.
   */
  _measureTopple(entry, k) {
    let pos = null, node = null;
    entry.root.traverse((o) => { if (!pos && o.isMesh && o.material?.userData?.instrumentHull && !o.userData?.casterProxy && !o.userData?.instrumentTool) { pos = o.geometry.attributes.position; node = o; } });
    // the vertices in body space at scale 1 (a quantised node carries its dequantising scale + offset)
    const M = node ? node.matrix.elements : null;
    const by = (i) => M[1] * pos.getX(i) + M[5] * pos.getY(i) + M[9] * pos.getZ(i) + M[13];
    const bz = (i) => M[2] * pos.getX(i) + M[6] * pos.getY(i) + M[10] * pos.getZ(i) + M[14];
    const legs = this.rig.legs;
    let rearZ = 0, frontZ = 0, nr = 0;
    for (const L of legs) { const z = L.restFoot[1]; if (z < 0) { rearZ += z; nr++; } else frontZ = Math.max(frontZ, z); }
    rearZ = nr ? rearZ / nr : -0.6 * k;
    this._pivotRear = rearZ; this._pivotFront = frontZ;
    const lay = (pz, dir) => {
      if (!pos) return 1.65;
      let lo = 0.8, hi = 2.2;
      for (let it = 0; it < 22; it++) {
        const phi = (lo + hi) / 2, c = Math.cos(phi), s = Math.sin(phi);
        let minY = 1e9;
        for (let i = 0; i < pos.count; i += 3) {
          const y = by(i) * k, zr = (bz(i) * k - pz) * dir;
          const yy = y * c + zr * s;
          if (yy < minY && zr > 0) minY = yy;
        }
        if (minY > TOPPLE.clearM) lo = phi; else hi = phi;
      }
      return lo;
    };
    this._layRear = lay(rearZ, 1);
    this._layFront = lay(frontZ, -1);
  }

  _topple(pt) {
    // fall away from the shot: a hit from the front fells it backward onto the rear feet line
    let dir = 1;
    if (pt) {
      const lx = pt.x - this.position.x, lz = pt.z - this.position.z, h = this.sc.heading;
      dir = (Math.sin(h) * lx + Math.cos(h) * lz) >= 0 ? 1 : -1;
    }
    this._toppleDir = dir;
    this._pivotZ = dir > 0 ? this._pivotRear : this._pivotFront;
    this._toppleAng = dir > 0 ? this._layRear : this._layFront;
    this._toppleT = 0;
    this.ai.reactions._down();
    this.ai.reactions.downedT = TOPPLE.downS;
    this.ai.reactions.cdT = TOPPLE.downS + 1;
    this.emit('plumb-topple', { machine: this, dir, seconds: TOPPLE.downS });
  }

  /** The topple pose: a rigid rotation of the body about the pivot line (no gait while down). */
  _poseTopple(dt) {
    this._toppleT += dt;
    const t = this._toppleT, F = TOPPLE.fallS, D = TOPPLE.downS, R = TOPPLE.riseS;
    let k;
    if (t < F) { const u = t / F; k = u * u; }
    else if (t < D - R) { const b = t - F; k = 1 - 0.04 * Math.exp(-6 * b) * Math.abs(Math.sin(12 * b)); }
    else if (t < D) { const u = (t - (D - R)) / R; k = 1 - u * u * (3 - 2 * u); }
    else k = 0;
    const phi = -this._toppleDir * this._toppleAng * k;
    const body = this.body, pz = this._pivotZ;
    _q.setFromAxisAngle(_xAxis, phi);
    body.quaternion.copy(_q);
    // rotate about (0, 0, pz): p' = R (p - P) + P
    const c = Math.cos(phi), s = Math.sin(phi);
    body.position.y = -(-pz) * s;
    body.position.z = pz + (-pz) * c;
    if (t >= D) {
      this._toppleT = -1;
      this._vialHits = 0;
      body.quaternion.identity();
      body.position.y = 0; body.position.z = 0;
    }
  }

  animate(dt, t) {
    const gait = this.gait, cheap = gait.updateCheap, dead = this.state === 'dead';
    if (dead) return;
    this._snapDoctrineSockets();
    if (this._toppleT >= 0) { this._poseTopple(dt); return; }
    const lod = updateRigLOD(this);
    if (lod >= 3) { cheap.call(gait, dt, t); return; }
    gait.update(dt, t);
    // the bob: a pendulum on the 2-bone cable (idle sway from the gait; the attacks swing it)
    const t1 = this.rig.tail[0], t2 = this.rig.tail[1];
    const sp = this.sc._speed, mk = sp > 0.05 ? (sp < 2 ? sp / 2 : 1) : 0;
    let ax = 0.07 * mk * Math.sin(gait.phase * 6.2832) + 0.03 * Math.sin(t * 1.3);
    let az = 0.035 * Math.sin(t * 0.9 + 1.1);
    let ax2 = 0;
    const a = this._attack;
    if (a !== null && a !== undefined) {
      if (a.kind === 'pendulum') {
        telegraphOnWindup(this, a, this._gBob, 0.08 * this._scale);
        // the bob swings back, then round a conical 3 m arc (360 deg), then settles
        const tilt = a.phase === 'windup' ? 1.25 * a.phaseT : a.phase === 'strike' ? 1.25 : 1.25 * (1 - a.phaseT);
        const az0 = a.phase === 'strike' ? 6.2832 * a.phaseT : a.phase === 'recover' ? 6.2832 : 0;
        ax = -tilt * Math.cos(az0); az = tilt * Math.sin(az0);
      } else if (a.kind === 'bob-drop') {
        telegraphOnWindup(this, a, this._gBob, 0.08 * this._scale);
        // hauled up over the head, then dropped: the bob slams the ground in front
        if (a.phase === 'windup') { ax = 2.3 * a.phaseT; ax2 = 0.7 * a.phaseT; }
        else if (a.phase === 'strike') { const u = a.phaseT; ax = 2.3 * (1 - u * u) + 0.25 * u; ax2 = 0.7 * (1 - u); }
        else { ax = 0.25 * (1 - a.phaseT); }
      } else {
        telegraphOnWindup(this, a, this._gDrum, 0.08 * this._scale);
        // SIGHTLINE: the hairline fix — at the strike the Plumb Flags her (a lit lamp only; perception.flagPlayer)
        if (a.kind === 'sightline' && a.phase === 'strike' && this._flagA !== a) { this._flagA = a; if (!(this.lampDarkT > 0)) this.manager?.perception?.flagPlayer(this); }
      }
    }
    // the cable is the pendulum's alone: the gait's tail follow-through is undone before the swing is applied
    t1.quaternion.identity(); t2.quaternion.identity();
    gait.rotX(t1, ax);
    gait.rotZ(t1, az);
    if (ax2 !== 0) gait.rotX(t2, ax2);
  }
}

export default {
  id: 'plumb',
  role: 'sentry',
  Cls: Plumb,
  /** P-03: the registry height (m) at scale 1 (`machines.heightOf`); a scaled Plumb's is `machine.height`. */
  height: HEIGHT,
  spec: { url: URL, targetHeight: HEIGHT, yaw: 0 },
  onEntry: (entry) => { liftExtras(entry); prepareEntry(entry, 'plumb'); prepareTools(entry); },
  tables: {
    /** the sentry: long sight, a slow fill, a 360-degree sweep; `flags: true` is the Sightline (the Flag) */
    perception: { gain: 1.7, periphRange: 12, scanSweep: 2.6, scanPeriod: 6.5, contactRange: 3.4, flags: true },
    engage: { archetype: 'orbit', band: [3.0, 12], orbitSpeed: 0.55, backSpeed: 0.8 },
    attacks: [
      { id: 'pendulum', min: 0, max: 3.4, cd: 3.4, score: 1.0, generic: 'sweep',
        params: { damage: 14, windup: 0.55, strike: 0.38, recover: 0.7, range: 3.4, arcDeg: 360, knock: 7 } },
      { id: 'bob-drop', min: 0, max: 2.6, cd: 4.2, score: 0.85, generic: 'slam',
        params: { damage: 18, windup: 0.62, strike: 0.2, recover: 0.8, ring: 2.0, radius: 2.0 } },
      // Sightline (bible §7.4 #2): the drum's hairline sight — a narrow, light hit at range that Flags her
      { id: 'sightline', min: 2.8, max: 24, cd: 5.0, score: 0.8, generic: 'volley',
        params: { damage: 5, windup: 0.7, strike: 0.15, recover: 0.6, shots: 1, range: 24, arcDeg: 6 } },
    ],
    attackMode: 'table',
    react: { staggerFrac: 0.16, downedFrac: 0.34 },
    elem: 90,
  },
  audio: { set: 'plumb', mass: 'small' },
  doctrine: {
    spawn: [{ n: 1, x: 40, z: -70, route: 16, routePoints: 3, poi: 'plumb-station' }],
  },
};

