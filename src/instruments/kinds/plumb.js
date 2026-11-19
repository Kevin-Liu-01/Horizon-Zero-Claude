import * as THREE from 'three';
import { rollLoot } from '../../entities/machines/machine.js';
import { buildRig } from '../../entities/machines/autorig.js';
import { GaitController } from '../../entities/machines/gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from '../../entities/machines/rig/lod.js';
import { snapSockets } from '../../entities/machines/rig/sockets.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { liftExtras, seedAuthoredWeights, weightAudit } from '../lib/generated.js';
import { prepareEntry, installHull, hullOf } from '../lib/hull.js';
import { prepareTools, detachTool, mountTool, glintAnchor, telegraphOnWindup, seatFeet } from '../lib/kindkit.js';
import { scaleRig } from '../lib/scale.js';
import { flinchEnvelope } from '../../combat/hitfeel.js';

/**
 * PLUMB — BIBLE §7.4 #2 (small; the sentry, role `sentry`); BUILD M1.4c.
 *
 * Three graduated staff legs meet at a brass tripod head; on a short mast the
 * head, a gyroscope sphere of white-enamel plates in a brass ring, turns 360
 * degrees (the gait's head look, `lookClampYaw` pi) with the LAMP DRUM in the
 * ring's front opening and the glowing LEVEL VIAL in its cradle on the crown; a
 * brass plumb bob hangs on 1.2 m of cable, a 2-bone tail swung here as a
 * pendulum. Model: `tools/build/instruments/gen-plumb.mjs` (the M1.4a hull kit).
 *
 * Two TOOLS Pry off (BIBLE §7.3, §7.4: "Components: lamp drum (no more
 * Flagging); plumb bob (no melee)"): the bob (Pendulum and Bob Drop die with
 * it) and the lamp drum (the lamp goes out for good, so it can never Flag or
 * throw its Sightline again; its lamp weak point goes with it).
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
const LAMP_R = 0.18;
/** The model's height (m) at scale 1: `r5Size[1]` of the GLB (the loader scales the bbox to this, so it must match). */
const HEIGHT = 3.4033;
/**
 * The level vial's weak-point sphere (m), the arrow sweep's own hit body for the vial (core/hitHulls.js, radius <= 0.35).
 * M1a r2 fix: 0.17 m (a 0.34 m ball round a 0.30 x 0.09 m tube) let shots that visibly missed the glass count. 0.10 m
 * holds the tube's middle third and the 3-5 cm low arrivals that slip between the glass and its cradle's crossbar; the
 * tube's ends are hit on their own triangles (the triangle-exact sweep). BUILD M1.4c: vial >= 0.25 m (the glass).
 */
const VIAL_WP_R = 0.10;
/**
 * M1a round 3 (A-weak40:plumb, ruling: "a shot that visibly misses the glass must not count"): the vial's weak point is
 * a CAPSULE on the glass tube's own axis, not a sphere: the tube's half-length (r5Sockets.vialLen / 2, 0.15 m) and the
 * glass radius (0.045 m) plus the Reed arrow's shaft (0.0048 m), so an arrow stops on it only where it touches the
 * glass. The 0.10 m sphere stopped arrows 4-8 cm in the air in front of the tube and counted them.
 */
/**
 * Round 3 fix, second film: the capsule is the glass's radius + 3 mm (0.048 m), not 0.050. At e02321c one of the 10
 * centre shots stopped on the 0.050 capsule 0.052 m off the axis as the probe reads it (in the Plumb's root frame; the
 * head's idle tilt is the likely 1-2 mm), past the row's touch line (glass + shaft 0.0048 + 2 mm = 0.0518). At 0.048
 * a stop point has 3.8 mm of margin to that line; a shaft grazing the glass closer than 3 mm still stops on it.
 */
const VIAL_CAP_PAD = 0.003;
/**
 * What else counts as the vial (round 3 fix): a hit on one of the two slim brass bands ON the glass (gen-plumb.mjs
 * levelVial, at +-0.07 m, 3.5 mm proud): within VIAL_BAND_AX of the glass's centre along its axis and VIAL_BAND_R of the
 * axis. The glass's ends are glass now (no brass caps), so nothing else on the cradle (saddles, crossbar, standards)
 * counts: a shot stopped there visibly misses the glass.
 */
const VIAL_BAND_R = 0.058;
const VIAL_BAND_AX = 0.08;
const TRI = (k) => ({
  walk: { stride: 0.78 * k, duty: 0.72, lift: 0.14 * k, offsets: { MF: 0, LH: 1 / 3, RH: 2 / 3 } },
  run: { stride: 1.45 * k, duty: 0.6, lift: 0.22 * k, offsets: { MF: 0, LH: 1 / 3, RH: 2 / 3 } },
});
/** E10, the topple (bible: "topples 4 s"). */
export const TOPPLE = Object.freeze({ fallS: 0.42, downS: 4.0, riseS: 0.6, hits: 2, clearM: 0.02 });

const _wp = new THREE.Vector3();
const _wa = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);
/**
 * M2 wave 0 (hit feel, D5): THE STRUCK BOB SWINGS AWAY. A hit within `r` (m, x scale) of the bob or its cable swings the
 * pendulum `rad` about its top, away from the blow, on hit feel's flinch envelope (real clock: held through the freeze,
 * then under 1 % by 400 ms; combat/hitfeel.js FLINCH). At edd1c95 the cable was the pendulum's alone (the gait's flinch
 * is undone on it), so a lance hit at the bob moved it less in 80 ms than its own idle sway (0.107 m against 0.123 m:
 * the kit's hit-feel-lance row).
 */
const BOB_KICK = Object.freeze({ rad: 0.22, r: 0.5 });
const _bk0 = new THREE.Vector3();
const _bk1 = new THREE.Vector3();
const _bkQ = new THREE.Quaternion();
const _bkP = new THREE.Quaternion();
const _bkPi = new THREE.Quaternion();
const _bkUp = new THREE.Vector3(0, 1, 0);

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
      sightRange: 48, hearRange: 20, eyeHeight: 2.5 * k,
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
    this.onAlerted = () => this._chime();   // Machine's constructor writes an own `onAlerted = null`: shadow it
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
    const drum = detachTool(this, 'plumb-drum');
    const cradle = detachTool(this, 'plumb-crown');
    const fixed = ['plumb-gimbal', 'plumb-gyro-a', 'plumb-gyro-b', 'plumb-scope', 'plumb-mast'].map((n) => [n, detachTool(this, n)]);

    this.addLamp(sc3(S.lamp), { radius: (S.lampR || LAMP_R) * k });
    this._lampWp = this.addWeakPoint('lamp', this.body, ...sc3(S.lamp), 0.16 * k, 2.2);
    this._vialWp = this.addWeakPoint('vial', this.body, ...sc3(S.vial), VIAL_WP_R * k, 2.0);
    // the vial's glass is skinned to the head (the `plumb-vial` mesh): a hit on it is a vial hit
    this._vialGlass = null;
    this.model.traverse((o) => { if (!this._vialGlass && o.isMesh && o.name === 'plumb-vial') this._vialGlass = o; });
    // round 2: the vial is a level glass, not a lamp. Its flat emissive made the machine's eye system take it as a lens
    // (Machine._collectEmissive), so it glowed in the LAMP's state colour (bone-gold x 2.5 calm, magenta hostile); it
    // keeps its own pale ice (the GLB's emissive, #D6F0EE) at intensity 1 and goes dark over 0.8 s when the Plumb dies
    this._vialGlow = null;
    const vm = this._vialGlass?.material;
    if (vm && !Array.isArray(vm) && vm.emissive) {
      this._eyeMats = this._eyeMats.filter((e) => e.mat !== vm);
      vm.emissiveIntensity = 1;
      this._vialGlow = { mat: vm, k: 1 };
    }
    this.lootTable = rollLoot([{ id: 'metal-shards', min: 4, max: 8 }, { id: 'wire', min: 1, max: 3 }]);

    attachRigRuntime(this, { quantise: false });
    const rig = scaleRig(entry.r5Rig, k);
    buildRig(this, rig);
    this._bob = mountTool(this, bob, {
      name: 'bob', displayName: 'Plumb bob', bone: 'tail2', anchor: entry.tools?.['plumb-bob'] || S.bobTop, scale: k,
      tearHp: 55, linkedAttack: 'pendulum', loot: [{ id: 'plumb-bob', n: 1 }],
    });
    // the level vial's cradle (caps, saddles, rings, bubble) is the `vial` part: its own hit capsules, so a shot at the
    // vial stops on the vial. core/hitHulls.js fits a bone's capsules to cells of its whole skin, and on the head's skin
    // the 0.30 m tube had none of its own; never torn (the vial breaks by the topple rule, not by tearing)
    this._vialPart = mountTool(this, cradle, { name: 'vial', displayName: 'Level vial', bone: 'head', anchor: entry.tools?.['plumb-crown'] || S.vial, scale: k,
      tearHp: Infinity, weak: true, weakMult: 2.0 });
    // the equatorial gimbal ring, the two gyroscope rings, the telescope and the vial's standards with the antennae: fixed parts on the head (each its own hit capsules,
    // drawn in the component fold's one draw; never torn)
    for (const [n, mesh] of fixed) mountTool(this, mesh, { name: n.slice(6), displayName: 'Gimbal ring', bone: 'head', anchor: entry.tools?.[n] || S.head, scale: k, tearHp: Infinity });
    // the lamp drum: Pried off, the lamp is gone for good (no Flag, no Sightline); its glass is the loot
    this._drum = mountTool(this, drum, {
      name: 'drum', displayName: 'Lamp drum', bone: 'head', anchor: entry.tools?.['plumb-drum'] || S.drumBack || S.drum, scale: k,
      tearHp: 55, linkedAttack: 'sightline', loot: [{ id: 'lampglass', n: 1 }],
      onTorn: () => this._lampLost(),
    });
    // fix 1: the vial and lamp weak points and the lamp anchor ride their own parts. On the body they were reparented
    // by the rig and then SNAPPED onto the nearest hull sample (rig/sockets.js), which for the vial is the sphere's
    // crown 0.31 m below: the vial sphere sat 0.2-0.36 m off the glass, and shots aimed at it flew past the vial
    this.root.updateMatrixWorld(true);
    if (this._vialPart?.mesh) {
      // the cradle is mounted where it sits on its right standard (round 2): the sphere stays on the glass's centre
      const va = entry.tools?.['plumb-crown'] || S.vial;
      this._vialPart.mesh.add(this._vialWp.obj);
      this._vialWp.obj.position.set((S.vial[0] - va[0]) * k, (S.vial[1] - va[1]) * k, (S.vial[2] - va[2]) * k);
      this._vialWp.obj.userData.noSnap = true;
      // the capsule (see VIAL_CAP_PAD): the glass's axis is the model's +X at the vial (gen-plumb.mjs levelVial), carried
      // into the weak point's own frame once, in the bind pose; the head turns it with the glass from then on
      const S0 = entry.r5Sockets || {};
      // round 3 fix: the capsule's half-length is the glass's half-length LESS its radius, so its rounded tip ends at the
      // glass's own tip (0.15 m) and never stops an arrow in the air past the glass (half 0.15 reached 0.20 m, over the
      // old brass caps; the judge measured it). The glass's rounded ends are hit on their own triangles as well
      this._vialWp.radius = ((S0.vialR || 0.045) + VIAL_CAP_PAD) * k;
      // (`half` is in the weak point's own frame, scale-1 metres: hitHulls carries it through its matrixWorld, x k)
      this._vialWp.half = Math.max(0.01, 0.5 * (S0.vialLen || 0.30) - this._vialWp.radius / k);
      this.root.updateMatrixWorld(true);
      const qo = this._vialWp.obj.getWorldQuaternion(new THREE.Quaternion()), qr = this.root.getWorldQuaternion(new THREE.Quaternion());
      this._vialWp.axis = new THREE.Vector3(1, 0, 0).applyQuaternion(qr).applyQuaternion(qo.invert()).normalize();
    }
    if (this._drum?.mesh) {
      // the drum carries the lamp, which is drawn at any range: its housing is never size-culled (at 30-40 m the
      // engine's small-mesh cull hid it and left the lamp and its weak point floating, which A44 read as 0.175 m)
      this._drum.mesh.traverse((o) => { o.userData.noSizeCull = true; });
      // ...and the vial assembly likewise (the glass, its cradle and the standards): the weak point a 40 m shot aims at
      // must be drawn at 40 m (A44:plumb at spawn read the culled vial 0.253 m off the boxes still drawn)
      for (const q of [this._vialPart, ...(this.parts || []).filter((p) => p.name === 'mast')]) q?.mesh?.traverse((o) => { o.userData.noSizeCull = true; });
      if (this._vialGlass) this._vialGlass.userData.noSizeCull = true;
      this._drum.mesh.attach(this._lampWp.obj);
      this._lampWp.obj.userData.noSnap = true;
      if (this._lampAnchor?.isObject3D) this._drum.mesh.attach(this._lampAnchor);
    }
    const T = TRI(k);
    this.gait = new GaitController(this, this.rig, {
      walk: T.walk, run: T.run, runRef: this.runSpeed,
      rollAmp: 0.012, impactAmp: 0.018, breatheRate: 0.5, stepDustSpeed: 3.0 * rk,
      turnRadius: 0.9 * k, lookClampYaw: Math.PI * 0.95, stanceFlex: 0.05,
      // no idle head fidget: the drum turns only to a stimulus (the gait's look), so a parked Plumb's lamp
      // stays on its lens axis (the lamp gates film it there)
      fidgets: [],
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

  /** Stand on its feet where it now stands, after a move or turn with the update stopped (lib/kindkit.js `seatFeet`). */
  seatFeet() { return seatFeet(this); }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /** A toppled Plumb beyond the animation ring still finishes its fall and stands (animate() is skipped there). */
  update(dt, t) {
    const r = super.update(dt, t);
    if (this._toppleT >= 0 && this.lowLOD && this.alive) this._poseTopple(dt);
    const g = this._vialGlow;
    if (g && (this.alive ? g.k !== 1 : g.k > 0)) {
      g.k = this.alive ? 1 : Math.max(0, g.k - dt / 0.8);
      g.mat.emissiveIntensity = g.k;
    }
    return r;
  }

  /** The drum is off: the lamp is gone (dark for good: perception's "a dark lamp cannot Flag"), its weak point too. */
  _lampLost() {
    this._noLamp = true;
    this.lampDarkT = 1e9;
    if (this._lampWp) this._lampWp.enabled = false;
    this.manager?.lamps?.detach(this);
    this.lamp = null;
  }

  /** Bob Drop needs the bob too (both bob attacks die with it). */
  attackDisabled(id) {
    if (id === 'bob-drop') return !(this._bob && this._bob.attached);
    return super.attackDisabled(id);
  }

  /** Bible: "chimes on alarm" — the herd ripple listens (`./tiller-herd.js`). */
  _chime() {
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

  /** World distance from `pt` to the vial glass's axis segment (the capsule weak point's spine). */
  _vialAxisDist(pt) {
    const wp = this._vialWp;
    wp.obj.getWorldPosition(_wp);
    if (!wp.axis || !(wp.half > 0)) return _wp.distanceTo(pt);
    _wa.copy(wp.axis).multiplyScalar(wp.half).applyMatrix4(wp.obj.matrixWorld).sub(_wp);
    const L2 = _wa.lengthSq();
    const u = L2 > 1e-12 ? Math.max(-1, Math.min(1, ((pt.x - _wp.x) * _wa.x + (pt.y - _wp.y) * _wa.y + (pt.z - _wp.z) * _wa.z) / L2)) : 0;
    return _wp.addScaledVector(_wa, u).distanceTo(pt);
  }

  /** `pt` in the vial glass's frame: [along its axis from the glass's centre, off the axis] (world metres). */
  _vialAxial(pt) {
    const wp = this._vialWp;
    wp.obj.getWorldPosition(_wp);
    if (!wp.axis || !(wp.half > 0)) return [0, _wp.distanceTo(pt)];
    _wa.copy(wp.axis).multiplyScalar(wp.half).applyMatrix4(wp.obj.matrixWorld).sub(_wp).normalize();
    const dx = pt.x - _wp.x, dy = pt.y - _wp.y, dz = pt.z - _wp.z;
    const ax = dx * _wa.x + dy * _wa.y + dz * _wa.z;
    return [ax, Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - ax * ax))];
  }

  /** Two level-vial hits: it cannot find level, and it topples (E10). */
  takeDamage(hit) {
    let vial = false;
    const wp = this._vialWp, pt = hit && hit.point;
    // (round 3) a vial hit is a hit ON THE GLASS: its own triangles, or a point within the capsule round the tube's axis
    // (the weak point's own body, which ends at the glass's tips), or on one of the two bands on the glass (VIAL_BAND_*).
    // A hit on the cradle's saddles or crossbar, or anywhere else near the vial, visibly misses the glass: not a vial hit
    const near = this.alive && wp && pt ? this._vialAxisDist(pt) : Infinity;
    if (wp && near <= wp.radius + 1e-4) vial = true;
    if (this.alive && hit?.object && this._vialPart) {
      if (hit.object === this._vialGlass || hit.object.name === 'plumb-vial') vial = true;
      let o = hit.object;
      while (o && !o.userData?.part) o = o.parent;
      if (o?.userData?.part === this._vialPart && pt) {
        const k = this._scale || 1, [ax, rad] = this._vialAxial(pt);
        if (Math.abs(ax) <= VIAL_BAND_AX * k && rad <= VIAL_BAND_R * k) vial = true;
      }
    }
    // (round 2) no priority rule: a vial hit is a hit whose point lies in the vial's weak-point sphere or on the vial's own
    // geometry. The arrow sweep is triangle-exact on the head's skin now (core/hitHulls.js `_exactBoneT`), so a shot no
    // longer stops in the air short of the glass; one stopped on a part outside that sphere is not a vial hit (the 0.45 m
    // priority reach of fix 1 counted those)
    const r = super.takeDamage(hit);
    if (pt && this.alive && this._toppleT < 0) this._kickBob(pt, hit.dir);
    if (vial && this.alive && this._toppleT < 0) {
      this._vialHits++;
      if (this._vialHits >= TOPPLE.hits) this._topple(pt);
    }
    return r;
  }

  /** The bob's middle in the world (its mesh's origin is the top it hangs from), into `out`. */
  _bobMid(out) {
    const mesh = this._bob?.mesh;
    if (!mesh) return null;
    if (!this._bobMidL) {
      let g = null;
      mesh.traverse((o) => { if (!g && o.isMesh && o.geometry) g = o; });
      if (!g) return mesh.getWorldPosition(out);
      if (!g.geometry.boundingSphere) g.geometry.computeBoundingSphere();
      this._bobMidO = g;
      this._bobMidL = g.geometry.boundingSphere.center.clone();
    }
    return out.copy(this._bobMidL).applyMatrix4(this._bobMidO.matrixWorld);
  }

  /** A hit near the bob or its cable swings it away from the blow (BOB_KICK); read in `animate`. */
  _kickBob(pt, dir) {
    if (!this._bob || this._bob.attached === false || !dir) return;
    const top = this.rig?.tail?.[0];
    if (!top || !this._bobMid(_bk1)) return;
    top.getWorldPosition(_bk0);
    // the point's distance to the cable's line from its top to the bob's middle
    const ax = _bk1.x - _bk0.x, ay = _bk1.y - _bk0.y, az = _bk1.z - _bk0.z, L2 = ax * ax + ay * ay + az * az;
    let u = L2 > 1e-9 ? ((pt.x - _bk0.x) * ax + (pt.y - _bk0.y) * ay + (pt.z - _bk0.z) * az) / L2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = _bk0.x + ax * u - pt.x, qy = _bk0.y + ay * u - pt.y, qz = _bk0.z + az * u - pt.z;
    const lim = BOB_KICK.r * (this._scale || 1);
    if (qx * qx + qy * qy + qz * qz > lim * lim) return;
    // the swing's axis: (the blow, level) x up, so the bob (below its top) moves along the blow
    const hx = dir.x, hz = dir.z, h = Math.hypot(hx, hz);
    if (h < 1e-4) return;
    if (!this._bobKickAx) this._bobKickAx = new THREE.Vector3();
    this._bobKickAx.set(hx / h, 0, hz / h).cross(_bkUp).normalize();
    this._bobKickT0 = performance.now() / 1000;
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
    // round 2: the pivot is the feet's OUTER edge, not their centres: the foot pads reach 0.2-0.25 m past the rest-foot
    // line, and rotating about the centres put them 0.186 m into the ground while down (A-plumb-topple, grounded)
    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        if (by(i) > 0.15) continue;
        const z = bz(i) * k;
        if (z < rearZ && rearZ < 0) rearZ = z;
        if (z > frontZ && frontZ > 0) frontZ = z;
      }
    }
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
    // a struck bob swings away (BOB_KICK): the world swing, carried into the cable top's parent frame
    if (this._bobKickT0 != null) {
      const env = flinchEnvelope(performance.now() / 1000 - this._bobKickT0);
      if (env < 0.002 || !t1.parent) this._bobKickT0 = null;
      else {
        t1.parent.getWorldQuaternion(_bkP);
        _bkQ.setFromAxisAngle(this._bobKickAx, BOB_KICK.rad * env);
        _bkQ.premultiply(_bkPi.copy(_bkP).invert()).multiply(_bkP);
        t1.quaternion.premultiply(_bkQ);
      }
    }
  }
}

export default {
  id: 'plumb',
  role: 'sentry',
  /** Size class (lib/sizeclass.js; bible §7.4): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'small',
  Cls: Plumb,
  /** P-03: the registry height (m) at scale 1 (`machines.heightOf`); a scaled Plumb's is `machine.height`. */
  height: HEIGHT,
  spec: { url: URL, targetHeight: HEIGHT, yaw: 0 },
  onEntry: (entry) => { liftExtras(entry); prepareEntry(entry, 'plumb'); prepareTools(entry); },
  tables: {
    /** the sentry: long sight, a slow fill, a 360-degree sweep; `flags: true` is the Sightline (the Flag) */
    perception: { gain: 1.7, periphRange: 12, scanSweep: 2.6, scanPeriod: 6.5, contactRange: 3.4, flags: true },
    engage: { archetype: 'orbit', band: [2.6, 7], orbitSpeed: 0.55, backSpeed: 0.8 },
    attacks: [
      { id: 'pendulum', min: 0, max: 3.8, cd: 3.4, score: 1.0, generic: 'sweep',
        params: { damage: 14, windup: 0.55, strike: 0.38, recover: 0.7, range: 3.8, arcDeg: 360, knock: 7 } },
      // Bob Drop: the tripod steps in (a short committed stride) and drops the bob in front of it
      { id: 'bob-drop', min: 0, max: 4.6, cd: 4.2, score: 0.85, generic: 'lunge',
        params: { damage: 18, windup: 0.62, strike: 0.24, recover: 0.8, dash: 2.0, range: 2.4 } },
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

