import * as THREE from 'three';

/**
 * BoneSpace — the ONE bone-rotation convention for every rig in the game
 * (perf-tech-11: "three bone conventions").
 *
 * Round 3 shipped three incompatible ways to rotate a bone:
 *
 *   1. playerAnimator.js  `_rot(e, axis, angle)`  — char-space axis applied
 *      through a CACHED BIND orientation pair (W / invW), plus `_rotL` which
 *      does the same through the LIVE orientation.
 *   2. machines/gait.js   `rotX/rotY/rotZ(bone, a)` — bone-LOCAL axis,
 *      `bone.quaternion.multiply(axisAngle)`.
 *   3. machines/*.js      `_rot(bone, 'x', a)`      — same as (2) but with a
 *      string axis key and a private `Map<Bone, Quaternion>` rest table.
 *
 * All three are the same algebra at different reference frames. Given a bone
 * whose parent's reference-frame orientation is P and whose local quaternion
 * is L, the bone's orientation in that frame is R = P·L. To PRE-multiply a
 * rotation q onto R (i.e. rotate the bone about an axis expressed in the
 * reference frame) it is enough to write
 *
 *      L' = L · R⁻¹ · q · R                    →   P·L' = q · R
 *
 * so the whole family collapses to "conjugate q by the bone's orientation in
 * the space you care about, then right-multiply onto the local quaternion":
 *
 *      rotLocal   R = identity          (bone's own axes; == gait.js rotX/Y/Z)
 *      rotChar    R = live char orient. (== playerAnimator._rotL, exact)
 *      rotChar(…, bind=true)
 *                 R = cached bind W     (== playerAnimator._rot, cheap)
 *      rotWorld   R = live world orient.
 *
 * `char` space is the character ROOT frame (+Y up, +Z forward, meters) — the
 * same frame the retargeter bakes clips in, so clip authoring, IK solves and
 * additive overlays all speak one language.
 *
 * Entries are `{ name, bone, bindQ, bindP, W, invW, clip }`, byte-compatible
 * with playerAnimator's private `_entries` table, so a lane migrates by
 * calling `BoneSpace.adopt(this._entries, model)` and swapping its private
 * helpers for the methods here — no data conversion, no re-capture, no
 * behaviour change (proved numerically by `anim.audit()`).
 *
 * Zero allocation on every path below the constructor.
 */

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _qR = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();

export const AXIS_X = /* @__PURE__ */ new THREE.Vector3(1, 0, 0);
export const AXIS_Y = /* @__PURE__ */ new THREE.Vector3(0, 1, 0);
export const AXIS_Z = /* @__PURE__ */ new THREE.Vector3(0, 0, 1);
export const AXES = { x: AXIS_X, y: AXIS_Y, z: AXIS_Z, X: AXIS_X, Y: AXIS_Y, Z: AXIS_Z };

/** Resolve 'x'|'y'|'z' or a Vector3 to an axis vector. */
export function axisOf(a) {
  return typeof a === 'string' ? (AXES[a] || AXIS_Y) : a;
}

export class BoneSpace {
  /**
   * @param {THREE.Object3D} root  character root (the char frame)
   * @param {object} [opts]
   * @param {Record<string, object>} [opts.entries]  adopt an existing table
   * @param {string[]} [opts.bones]      capture these bone names now
   * @param {boolean} [opts.all]         capture every bone under root
   * @param {(b:THREE.Bone)=>boolean} [opts.filter]  with `all`
   * @param {boolean} [opts.worldFrame]  derive the live char frame from the
   *        root's WORLD quaternion instead of its local one. Default false,
   *        matching playerAnimator (the model's parent carries no rotation)
   *        and costing one quaternion copy per frame instead of a matrix walk.
   */
  constructor(root, opts = {}) {
    if (!root) throw new Error('BoneSpace: no root');
    this.root = root;
    this.worldFrame = !!opts.worldFrame;
    this.entries = opts.entries || Object.create(null);
    this.adopted = !!opts.entries;
    this.bones = Object.create(null);
    root.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });

    // char frame inverse, refreshed once per frame by syncFrame()
    this.invFrameQ = new THREE.Quaternion();
    this._frameM = new THREE.Matrix4();      // root world matrix inverse (positions)
    this._frameMDirty = true;
    this.syncFrame();

    // bind capture must happen while the rig sits in its bind/rest pose
    if (opts.all) this.captureAll(opts.filter);
    else if (opts.bones) this.capture(opts.bones);
  }

  /**
   * Wrap an EXISTING entry table (playerAnimator._entries and friends) without
   * touching a single quaternion — the migration adapter.
   * @param {Record<string, {bone: THREE.Bone, bindQ, bindP, W, invW}>} entries
   * @param {THREE.Object3D} root
   */
  static adopt(entries, root, opts = {}) {
    return new BoneSpace(root, { ...opts, entries });
  }

  /* --------------------- static frame conversions --------------------- */
  // Used where the frame is an arbitrary matrix rather than a live root —
  // the clip retargeter works between TWO rigs, so it cannot cache one frame.
  // Matrix-based (not quaternion-based) on purpose: it survives a scaled rig.

  /**
   * Pose of `obj` expressed in the frame whose INVERSE world matrix is given.
   * @param {THREE.Object3D} obj
   * @param {THREE.Matrix4} frameInv
   * @param {THREE.Quaternion} outQ
   * @param {THREE.Vector3} [outP]
   */
  static poseIn(obj, frameInv, outQ, outP = _v1) {
    obj.updateWorldMatrix(true, false);
    _m4.multiplyMatrices(frameInv, obj.matrixWorld);
    _m4.decompose(outP, outQ, _sc);
    return outQ;
  }

  /**
   * Write a bone's local quaternion so its orientation in some frame equals
   * `desired`, given its PARENT's orientation in that same frame.
   *   local = parentFrameQ⁻¹ · desired
   */
  static setLocalFromFrame(bone, parentFrameQ, desired) {
    bone.quaternion.copy(parentFrameQ).invert().multiply(desired);
    return bone.quaternion;
  }

  /**
   * Char-space offset -> a bone's PARENT local frame, given the char->parent
   * matrix. (`charM` maps char space into the parent's local space.)
   */
  static offsetToFrame(offset, charM, out) {
    _m3.setFromMatrix4(charM);
    return out.copy(offset).applyMatrix3(_m3);
  }

  /* ------------------------------ bind ------------------------------ */

  /**
   * Bind char orientation of a bone: its world rotation relative to the root's
   * world rotation. (Always world-derived — the bind capture happens once, and
   * `worldFrame` only chooses how the per-frame LIVE inverse is refreshed.)
   */
  _captureW(bone, out) {
    bone.getWorldQuaternion(out);
    this.root.getWorldQuaternion(_q3);
    return out.premultiply(_q3.invert());
  }

  /** Create (or fetch) the entry for a bone name / Bone. Captures bind pose. */
  entry(nameOrBone) {
    if (!nameOrBone) return null;
    if (typeof nameOrBone === 'object') {
      const got = this.entries[nameOrBone.name];
      if (got && got.bone === nameOrBone) return got;
      return this._make(nameOrBone.name, nameOrBone);
    }
    const got = this.entries[nameOrBone];
    if (got) return got;
    const bone = this.bones[nameOrBone] || this.find(nameOrBone);
    return bone ? this._make(bone.name, bone) : null;
  }

  _make(name, bone) {
    const W = new THREE.Quaternion();
    this._captureW(bone, W);
    const e = {
      name, bone,
      bindQ: bone.quaternion.clone(),
      bindP: bone.position.clone(),
      W,
      invW: W.clone().invert(),
      clip: false,
    };
    this.entries[name] = e;
    return e;
  }

  /** Shortest bone name starting with `prefix` (rig names carry index suffixes). */
  find(prefix) {
    if (this.bones[prefix]) return this.bones[prefix];
    let best = null;
    for (const n in this.bones) {
      if (n.startsWith(prefix) && !n.includes('_end') && !n.includes('_Base')) {
        if (!best || n.length < best.length) best = n;
      }
    }
    return best ? this.bones[best] : null;
  }

  capture(names) {
    const out = [];
    for (const n of names) { const e = this.entry(n); if (e) out.push(e); }
    return out;
  }

  captureAll(filter) {
    for (const n in this.bones) {
      const b = this.bones[n];
      if (filter && !filter(b)) continue;
      this.entry(b);
    }
    return this;
  }

  /** Re-read bind data from the CURRENT pose (call in the bind pose only). */
  recapture() {
    for (const n in this.entries) {
      const e = this.entries[n];
      e.bindQ.copy(e.bone.quaternion);
      e.bindP.copy(e.bone.position);
      this._captureW(e.bone, e.W);
      e.invW.copy(e.W).invert();
    }
    return this;
  }

  get size() { return Object.keys(this.entries).length; }
  names() { return Object.keys(this.entries); }

  /* ---------------------------- per frame ---------------------------- */

  /** Refresh the cached char-frame inverse. Call once at the top of update(). */
  syncFrame() {
    if (this.worldFrame) {
      this.root.getWorldQuaternion(_q3);
      this.invFrameQ.copy(_q3).invert();
    } else {
      this.invFrameQ.copy(this.root.quaternion).invert();
    }
    this._frameMDirty = true;
    return this;
  }

  /** Adopt someone else's cached frame inverse (verification / shared owner). */
  setFrameInv(q) { this.invFrameQ.copy(q); this._frameMDirty = true; return this; }

  /* ---------------------------- conversions ---------------------------- */

  /** Live char-space orientation of a bone. */
  charQ(bone, out) {
    bone.getWorldQuaternion(out);
    return out.premultiply(this.invFrameQ);
  }

  /** Live world orientation of a bone. */
  worldQ(bone, out) { return bone.getWorldQuaternion(out); }

  /** Live char-space position of a bone. */
  charPos(bone, out) {
    if (this._frameMDirty) {
      this.root.updateWorldMatrix(true, false);
      this._frameM.copy(this.root.matrixWorld).invert();
      this._frameMDirty = false;
    }
    bone.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(bone.matrixWorld);
    return out.applyMatrix4(this._frameM);
  }

  /** Live world position of a bone. */
  worldPos(bone, out) {
    bone.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(bone.matrixWorld);
  }

  /* ----------------------------- rotations ----------------------------- */
  // Every one of these RIGHT-multiplies onto bone.quaternion, so they compose
  // as additive layers on top of whatever posed the bone (clip, IK, rest).

  /** Rotate about the bone's OWN axes. (== gait.js rotX/rotY/rotZ) */
  rotLocal(e, axis, angle) {
    const bone = e && (e.bone || e);
    if (!bone || !angle) return;
    _q1.setFromAxisAngle(axisOf(axis), angle);
    bone.quaternion.multiply(_q1);
  }

  /** Apply an arbitrary quaternion in the bone's own local frame. */
  rotLocalQ(e, q) {
    const bone = e && (e.bone || e);
    if (!bone) return;
    bone.quaternion.multiply(q);
  }

  /**
   * Rotate about a CHARACTER-space axis.
   * @param {boolean} [bind=false] use the cached bind orientation (cheap,
   *        exact only near bind — playerAnimator's `_rot`) instead of the live
   *        one (exact everywhere — playerAnimator's `_rotL`).
   */
  rotChar(e, axis, angle, bind = false) {
    if (!e || !angle) return;
    _q1.setFromAxisAngle(axisOf(axis), angle);
    this._applyChar(e, _q1, bind);
  }

  /** Apply an arbitrary char-space quaternion. */
  rotCharQ(e, q, bind = false) {
    if (!e) return;
    this._applyChar(e, q, bind);
  }

  /** Cheap bind-orientation variants (aliases; explicit at call sites). */
  rotCharBind(e, axis, angle) { this.rotChar(e, axis, angle, true); }
  rotCharBindQ(e, q) { this.rotCharQ(e, q, true); }

  _applyChar(e, q, bind) {
    const bone = e.bone || e;
    if (bind && e.invW) {
      _q2.copy(e.invW).multiply(q).multiply(e.W);
    } else {
      this.charQ(bone, _qR);
      _q2.copy(_qR).invert().multiply(q).multiply(_qR);
    }
    bone.quaternion.multiply(_q2);
  }

  /** Rotate about a WORLD-space axis (exact). */
  rotWorld(e, axis, angle) {
    if (!e || !angle) return;
    _q1.setFromAxisAngle(axisOf(axis), angle);
    this.rotWorldQ(e, _q1);
  }

  /** Apply an arbitrary world-space quaternion (exact). */
  rotWorldQ(e, q) {
    const bone = e && (e.bone || e);
    if (!bone) return;
    bone.getWorldQuaternion(_qR);
    _q2.copy(_qR).invert().multiply(q).multiply(_qR);
    bone.quaternion.multiply(_q2);
  }

  /* ----------------------------- absolutes ----------------------------- */

  /** Set a bone's ABSOLUTE char-space orientation (IK / retarget writes). */
  setCharQ(e, q) {
    const bone = e && (e.bone || e);
    if (!bone) return;
    const parent = bone.parent;
    if (!parent) { bone.quaternion.copy(q); return; }
    this.charQ(parent, _qR);
    bone.quaternion.copy(_qR.invert()).multiply(q);
  }

  /** Set a bone's ABSOLUTE world orientation. */
  setWorldQ(e, q) {
    const bone = e && (e.bone || e);
    if (!bone) return;
    const parent = bone.parent;
    if (!parent) { bone.quaternion.copy(q); return; }
    parent.getWorldQuaternion(_qR);
    bone.quaternion.copy(_qR.invert()).multiply(q);
  }

  /**
   * Char-space offset -> a bone's PARENT local frame (pelvis translation).
   * Returns `out` (a Vector3) so callers can add it to bone.position.
   */
  charOffsetToParent(e, offset, out) {
    const bone = e && (e.bone || e);
    const parent = bone?.parent;
    if (!parent) return out.copy(offset);
    parent.updateWorldMatrix(true, false);
    _m4.copy(parent.matrixWorld).invert().multiply(this.root.matrixWorld);
    out.copy(offset).applyMatrix4(_m4);
    _v1.set(0, 0, 0).applyMatrix4(_m4);
    return out.sub(_v1);
  }

  /** Debug: is this table byte-compatible with the adopt() contract? */
  validate() {
    const bad = [];
    for (const n in this.entries) {
      const e = this.entries[n];
      if (!e.bone || !e.W || !e.invW || !e.bindQ) { bad.push(n); continue; }
      _q1.copy(e.W).multiply(e.invW);
      if (Math.abs(1 - Math.abs(_q1.w)) > 1e-5) bad.push(n);
    }
    return { ok: bad.length === 0, size: this.size, bad };
  }
}
