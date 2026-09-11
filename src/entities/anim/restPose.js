import * as THREE from 'three';

/**
 * RestPose — bind capture / restore + per-bone clip-driven bookkeeping.
 *
 * Every rig in the game re-poses from a rest snapshot each frame, and every
 * one of them rolled its own storage:
 *
 *   gait.js / watcher.js …  `Map<Bone, Quaternion>` rebuilt per species,
 *                           restored with a for..of over the Map.
 *   playerAnimator.js       `_entries[*].bindQ/bindP`, split into a
 *                           `_resetList` (bones the mixer never writes → reset
 *                           to bind every frame) and a `_clipList` (bones the
 *                           mixer DOES write → restored from a per-frame copy
 *                           of the pure clip pose, because three's
 *                           PropertyMixer skips setValue when the blended
 *                           value is unchanged from the previous frame, which
 *                           would otherwise let overlays stack).
 *
 * This class is both, with the clip/no-clip split as first-class state. It
 * takes an existing BoneSpace entry table when there is one (zero copies) and
 * builds its own otherwise.
 *
 * Restores are allocation-free and iterate flat arrays, not Maps.
 */
export class RestPose {
  /**
   * @param {object} o
   * @param {import('./boneSpace.js').BoneSpace} [o.space]  entries come from here
   * @param {THREE.Object3D} [o.root]   capture every bone under this root
   * @param {THREE.Bone[]}   [o.bones]  or exactly these bones
   * @param {boolean} [o.positions=false]  also restore bone.position
   */
  constructor(o = {}) {
    this.space = o.space || null;
    this.positions = !!o.positions;
    this.entries = [];         // { name, bone, bindQ, bindP, clip, clipQ, clipP }
    this.byName = Object.create(null);
    this._reset = [];          // entries with clip === false
    this._clip = [];           // entries with clip === true

    if (this.space) {
      for (const n in this.space.entries) this._adopt(this.space.entries[n]);
    } else if (o.bones) {
      for (const b of o.bones) if (b) this._capture(b);
    } else if (o.root) {
      o.root.traverse((b) => { if (b.isBone) this._capture(b); });
    }
    this._rebuild();
  }

  /** Build from a legacy `Map<Bone, Quaternion>` rest table (machine rigs). */
  static fromMap(map, opts = {}) {
    const rp = new RestPose(opts);
    for (const [bone, q] of map) {
      const e = rp._capture(bone);
      if (e && q) e.bindQ.copy(q);
    }
    rp._rebuild();
    return rp;
  }

  _adopt(e) {
    if (!e || !e.bone || this.byName[e.name]) return null;
    // shares bindQ/bindP objects with the BoneSpace entry on purpose: one
    // bind truth per rig, so a recapture on either side is seen by both.
    const rec = {
      name: e.name, bone: e.bone, bindQ: e.bindQ, bindP: e.bindP,
      get clip() { return e.clip; }, set clip(v) { e.clip = v; },
      clipQ: new THREE.Quaternion().copy(e.bindQ),
      clipP: new THREE.Vector3().copy(e.bindP),
      src: e,
    };
    this.entries.push(rec);
    this.byName[e.name] = rec;
    return rec;
  }

  _capture(bone) {
    if (!bone || this.byName[bone.name]) return this.byName[bone?.name] || null;
    const rec = {
      name: bone.name, bone,
      bindQ: bone.quaternion.clone(),
      bindP: bone.position.clone(),
      clip: false,
      clipQ: bone.quaternion.clone(),
      clipP: bone.position.clone(),
      src: null,
    };
    this.entries.push(rec);
    this.byName[bone.name] = rec;
    return rec;
  }

  _rebuild() {
    this._reset.length = 0;
    this._clip.length = 0;
    for (const e of this.entries) (e.clip ? this._clip : this._reset).push(e);
    return this;
  }

  get size() { return this.entries.length; }
  get(name) { return this.byName[name] || null; }
  names() { return this.entries.map((e) => e.name); }

  /** Re-read the bind pose from the CURRENT pose (rig must be in bind). */
  recapture() {
    for (const e of this.entries) {
      e.bindQ.copy(e.bone.quaternion);
      e.bindP.copy(e.bone.position);
      e.clipQ.copy(e.bone.quaternion);
      e.clipP.copy(e.bone.position);
    }
    return this;
  }

  /* ------------------------ clip-driven flags ------------------------ */

  /** Flag bones an AnimationMixer writes; they leave the reset list. */
  markClipDriven(names, on = true) {
    const it = names instanceof Set ? names : new Set(names);
    for (const e of this.entries) if (it.has(e.name)) e.clip = on;
    return this._rebuild();
  }

  isClipDriven(name) { return !!this.byName[name]?.clip; }
  /** Entries the mixer never writes — reset these to bind every frame. */
  resetList() { return this._reset; }
  /** Entries the mixer writes — snapshot/apply these every frame. */
  clipList() { return this._clip; }

  /* ---------------------------- restore ---------------------------- */

  /** Restore every bone to bind (the machine-rig `for (const [b,q] of rest)`). */
  restore() {
    const E = this.entries;
    for (let i = 0; i < E.length; i++) {
      E[i].bone.quaternion.copy(E[i].bindQ);
      if (this.positions) E[i].bone.position.copy(E[i].bindP);
    }
    return this;
  }

  /** Restore only the bones no clip drives (playerAnimator's `_resetList`). */
  restoreNonClip() {
    const E = this._reset;
    for (let i = 0; i < E.length; i++) {
      E[i].bone.quaternion.copy(E[i].bindQ);
      if (this.positions) E[i].bone.position.copy(E[i].bindP);
    }
    return this;
  }

  /** Restore one bone (by name or entry). */
  restoreOne(nameOrEntry, positions = this.positions) {
    const e = typeof nameOrEntry === 'string' ? this.byName[nameOrEntry] : nameOrEntry;
    if (!e) return this;
    e.bone.quaternion.copy(e.bindQ);
    if (positions) e.bone.position.copy(e.bindP);
    return this;
  }

  /* ------------------- pure-clip-pose cache (mixer) ------------------- */
  // Call applyClip() BEFORE mixer.update() and snapshotClip() AFTER it, so
  // overlays written between frames never stack on the mixer's held values.

  /** Push the cached pure clip pose back onto the bones. */
  applyClip() {
    const E = this._clip;
    for (let i = 0; i < E.length; i++) {
      E[i].bone.quaternion.copy(E[i].clipQ);
      if (this.positions) E[i].bone.position.copy(E[i].clipP);
    }
    return this;
  }

  /** Cache the current (pure clip) pose. */
  snapshotClip() {
    const E = this._clip;
    for (let i = 0; i < E.length; i++) {
      E[i].clipQ.copy(E[i].bone.quaternion);
      if (this.positions) E[i].clipP.copy(E[i].bone.position);
    }
    return this;
  }

  /** Legacy interop: a `Map<Bone, Quaternion>` view of the bind pose. */
  toMap() {
    const m = new Map();
    for (const e of this.entries) m.set(e.bone, e.bindQ);
    return m;
  }

  report() {
    return { bones: this.size, clipDriven: this._clip.length, reset: this._reset.length };
  }
}
