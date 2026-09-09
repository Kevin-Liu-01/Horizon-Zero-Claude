import * as THREE from 'three';
import { PELVIS } from './boneMap.js';

/**
 * Spike C (hybrid) — runtime pose player for tracks baked by
 * tools/spike-hybrid-bake.mjs.
 *
 * A baked track holds, per Aloy bone and sample, a CHAR-SPACE rotation R
 * (relative to the nearest mapped parent, already rest-corrected). Applying
 * it uses the exact playerAnimator.js convention:
 *
 *   bone.quaternion = bindQ * invW * R * W          (L(R) = W^-1 R W on bind)
 *   pelvis.position = bindP + M3 * (delta * hipScale)
 *
 * so a baked pose is just "what _rotQ(entry, R) would have produced", and
 * every existing layer that composes further _rot/_rotQ calls, runs IK from
 * live bone positions (_charOf), or clamps the pelvis/feet to terrain can run
 * after apply() unchanged.
 */

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const { clamp } = THREE.MathUtils;

/**
 * A blendable pose: per-bone char-space rotation + pelvis delta (meters),
 * plus foot-contact bits (1 = L planted, 2 = R planted) and whether the
 * ground-conform layer may run at all (false for rolls/deaths/jumps).
 */
export class Pose {
  constructor(names) {
    this.names = names;
    this.q = {};
    for (const n of names) this.q[n] = new THREE.Quaternion();
    this.pelvis = new THREE.Vector3();
    this.contact = 3;
    this.conform = true;
  }
  identity() {
    for (const n of this.names) this.q[n].identity();
    this.pelvis.set(0, 0, 0);
    this.contact = 3;
    this.conform = true;
    return this;
  }
  copy(p) {
    for (const n of this.names) this.q[n].copy(p.q[n]);
    this.pelvis.copy(p.pelvis);
    this.contact = p.contact;
    this.conform = p.conform;
    return this;
  }
  /** this = slerp(this, p, a) — successive slerp gives a normalized-weight blend. */
  mix(p, a) {
    if (a <= 0) return this;
    if (a >= 1) return this.copy(p);
    for (const n of this.names) this.q[n].slerp(p.q[n], a);
    this.pelvis.lerp(p.pelvis, a);
    if (a >= 0.5) { this.contact = p.contact; this.conform = p.conform; }
    return this;
  }
}

export class PosePlayer {
  /**
   * @param model  the Assets wrapper root (char space: feet y=0, +Z forward),
   *               placed at identity when constructed
   * @param data   parsed public/anims-hybrid/aloy-ual.json
   */
  constructor(model, data) {
    this.model = model;
    this.data = data;
    this.bones = {};
    model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    model.updateMatrixWorld(true);
    const invModelQ = model.getWorldQuaternion(new THREE.Quaternion()).invert();

    // union of tracked bones across clips
    const names = new Set();
    for (const c of Object.values(data.clips)) for (const n of Object.keys(c.bones)) names.add(n);
    this.names = [...names].filter((n) => this.bones[n]);
    this.missing = [...names].filter((n) => !this.bones[n]);

    this.entries = {};
    for (const name of this.names) {
      const bone = this.bones[name];
      const W = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(invModelQ);
      this.entries[name] = { bone, bindQ: bone.quaternion.clone(), bindP: bone.position.clone(), W, invW: W.clone().invert() };
    }

    // pelvis translation basis (char meters -> pelvis-parent local) + hip scale
    const pelvis = this.bones[PELVIS];
    this.pelvis = pelvis;
    this.pelvisBindP = pelvis.position.clone();
    const par = pelvis.parent;
    par.updateWorldMatrix(true, false);
    this.pelvisM3 = new THREE.Matrix3().setFromMatrix4(_m4.copy(par.matrixWorld).invert());
    const hipY = model.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3())).y;
    this.hipY = hipY;
    this.hipScale = hipY / (data.hipsRestY || hipY);

    this.scratch = new Pose(this.names);
  }

  newPose() { return new Pose(this.names); }
  clip(name) { return this.data.clips[name]; }

  /** Evaluate a clip at time t (seconds; loops wrap, one-shots clamp) into pose. */
  evaluate(name, t, pose) {
    const c = this.data.clips[name];
    if (!c) throw new Error(`no baked clip "${name}"`);
    const n = c.n;
    let f;
    if (c.loop) {
      let ph = (t / c.duration) % 1;
      if (ph < 0) ph += 1;
      f = ph * n;
    } else {
      f = clamp(t / c.duration, 0, 1) * (n - 1);
    }
    const i0 = Math.min(Math.floor(f), n - 1);
    const i1 = c.loop ? (i0 + 1) % n : Math.min(i0 + 1, n - 1);
    const a = f - Math.floor(f);
    for (const bn of this.names) {
      const tr = c.bones[bn];
      const q = pose.q[bn];
      if (!tr) { q.identity(); continue; }
      _q1.fromArray(tr, i0 * 4);
      _q2.fromArray(tr, i1 * 4);
      q.copy(_q1).slerp(_q2, a).normalize();
    }
    const p = c.pelvis;
    pose.pelvis.set(
      (p[i0 * 3] + (p[i1 * 3] - p[i0 * 3]) * a) * this.hipScale,
      (p[i0 * 3 + 1] + (p[i1 * 3 + 1] - p[i0 * 3 + 1]) * a) * this.hipScale,
      (p[i0 * 3 + 2] + (p[i1 * 3 + 2] - p[i0 * 3 + 2]) * a) * this.hipScale,
    );
    pose.contact = c.contact ? c.contact[a < 0.5 ? i0 : i1] : 3;
    pose.conform = c.conform !== false;
    return pose;
  }

  /**
   * Composed char-space rotation of the chest for a pose (product of the
   * pelvis..spine_05 track rotations) — the equivalent of playerAnimator's
   * _qTorso, so an arm-IK overlay can compensate the torso exactly as
   * _ikArm does today.
   */
  torsoQuat(pose, out = new THREE.Quaternion()) {
    out.identity();
    for (const bn of ['pelvis_05', 'spine_01_06', 'spine_02_07', 'spine_03_08', 'spine_04_09', 'spine_05_010']) {
      if (pose.q[bn]) out.multiply(pose.q[bn]);
    }
    return out;
  }

  /** Loop clip at a normalized phase, aligned so the clip's syncPhase lands at 0. */
  evaluatePhase(name, phase, pose, sync = true) {
    const c = this.data.clips[name];
    let ph = phase + (sync ? c.syncPhase : 0);
    ph %= 1; if (ph < 0) ph += 1;
    return this.evaluate(name, ph * c.duration, pose);
  }

  /** Write a pose onto the skeleton — rebuilt from bind, never accumulated. */
  apply(pose) {
    for (const bn of this.names) {
      const e = this.entries[bn];
      _q1.copy(e.invW).multiply(pose.q[bn]).multiply(e.W);
      e.bone.quaternion.copy(e.bindQ).multiply(_q1);
    }
    _v1.copy(pose.pelvis).applyMatrix3(this.pelvisM3);
    this.pelvis.position.copy(this.pelvisBindP).add(_v1);
  }

  /** Add a char-space pelvis offset (meters) on top of the applied pose. */
  offsetPelvis(dx, dy, dz) {
    _v1.set(dx, dy, dz).applyMatrix3(this.pelvisM3);
    this.pelvis.position.add(_v1);
  }
}

/* --------------------------- speed blend space --------------------------- */

/**
 * 1D locomotion blend by speed with a shared, cadence-blended gait phase,
 * plus a crouch axis. Mirrors how playerAnimator gates its layers
 * (moveW / runW / crouchW from speed and crouch state).
 */
export class LocomotionBlend {
  constructor(player, opts = {}) {
    this.player = player;
    this.stand = opts.stand || [
      { clip: 'idle', speed: 0 }, { clip: 'walk', speed: 1.8 },
      { clip: 'jog', speed: 4.5 }, { clip: 'run', speed: 7.5 },
    ];
    this.crouch = opts.crouch || [{ clip: 'crouch', speed: 0 }, { clip: 'crouchwalk', speed: 1.6 }];
    this.phase = 0;      // shared gait phase 0..1
    this.idleT = 0;      // idle loops run on their own clock
    this._a = player.newPose();
    this._b = player.newPose();
    this._c = player.newPose();
  }

  /** cycle rate (Hz) blended across the active segment */
  cadence(nodes, speed) {
    const { i, w } = this._segment(nodes, speed);
    const d0 = this.player.clip(nodes[i].clip).duration;
    const d1 = this.player.clip(nodes[Math.min(i + 1, nodes.length - 1)].clip).duration;
    // idle node contributes the neighbouring gait cadence (keeps phase moving)
    const g0 = nodes[i].speed === 0 ? 1 / d1 : 1 / d0;
    return g0 * (1 - w) + (1 / d1) * w;
  }

  _segment(nodes, speed) {
    let i = 0;
    while (i < nodes.length - 2 && speed > nodes[i + 1].speed) i++;
    const s0 = nodes[i].speed, s1 = nodes[i + 1].speed;
    const w = clamp((speed - s0) / Math.max(1e-6, s1 - s0), 0, 1);
    return { i, w };
  }

  /** Blend pose for the given nodes at (speed, phase, idleT) into out. */
  _blendNodes(nodes, speed, phase, idleT, out) {
    const { i, w } = this._segment(nodes, speed);
    const A = nodes[i], B = nodes[i + 1];
    const evalNode = (node, pose) => {
      if (node.speed === 0) this.player.evaluate(node.clip, idleT, pose);
      else this.player.evaluatePhase(node.clip, phase, pose);
      return pose;
    };
    evalNode(A, out);
    if (w > 0.0005) out.mix(evalNode(B, this._c), w);
    return { i, w, dominant: w < 0.5 ? A.clip : B.clip };
  }

  /** Advance clocks (live mode). */
  update(dt, speed, crouch) {
    const cad = this.cadence(this.stand, speed) * (1 - crouch) + this.cadence(this.crouch, speed) * crouch;
    this.phase = (this.phase + dt * cad) % 1;
    this.idleT += dt;
  }

  /** Deterministic clocks from an absolute time (screenshot mode). */
  setTime(t, speed, crouch) {
    const cad = this.cadence(this.stand, speed) * (1 - crouch) + this.cadence(this.crouch, speed) * crouch;
    this.phase = (t * cad) % 1;
    this.idleT = t;
  }

  /** Compose the final pose for speed/crouch into out; returns debug info. */
  pose(speed, crouch, out) {
    const s = this._blendNodes(this.stand, speed, this.phase, this.idleT, out);
    let info = { stand: s, crouch: null };
    if (crouch > 0.0005) {
      const c = this._blendNodes(this.crouch, speed, this.phase, this.idleT, this._b);
      out.mix(this._b, crouch);
      info.crouch = c;
    }
    return info;
  }
}

/**
 * Spike-sized ground conform for a flat floor at y=0: after apply(), drop or
 * lift the pelvis so the lowest PLANTED ball bone touches the floor (the
 * animator's _groundConform does the same against terrain height + slope and
 * then raises any foot still underground). Feet are taken from the baked
 * contact bits, so flight-phase frames (sprint, jog) are left alone, and the
 * layer is released for clips flagged conform:false (roll/death/jump — the
 * animator's offW gate). Returns { shift, planted }.
 */
export function conformToFloor(player, pose, ballL = 'ball_l_0190', ballR = 'ball_r_0216', ballRest = 0.005) {
  const model = player.model;
  const bl = player.bones[ballL], br = player.bones[ballR];
  const res = { shift: 0, planted: pose ? pose.contact : 3, released: pose ? !pose.conform : false };
  if (!bl || !br || res.released || res.planted === 0) return res;
  model.updateMatrixWorld(true);
  const yl = model.worldToLocal(bl.getWorldPosition(_v1)).y;
  const yr = model.worldToLocal(br.getWorldPosition(new THREE.Vector3())).y;
  let c = Infinity;
  if (res.planted & 1) c = Math.min(c, yl);
  if (res.planted & 2) c = Math.min(c, yr);
  c -= ballRest;                                // clearance of the stance foot
  res.shift = clamp(-c, -0.38, 0.32);
  player.offsetPelvis(0, res.shift, 0);
  return res;
}
