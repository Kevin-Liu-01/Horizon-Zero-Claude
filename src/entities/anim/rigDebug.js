import * as THREE from 'three';
import { BoneSpace } from './boneSpace.js';

/**
 * RigDebug — the shared instrumentation every rig gate reads through.
 *
 * Round 3 grew three *different* `debugFeet()` implementations (gait.js,
 * playerAnimator.js, and per-species ad hoc ones) that gates A6 / A13 / A45 /
 * A46 all consume, plus zero way to see a skeleton on film. This is the one
 * implementation:
 *
 *   overlay()      SkeletonHelper on the rig, toggled from the console/gates
 *   probe(name)    local / char / world orientation + position of one bone
 *   feet(spec)     the canonical `[{ name, world:{x,y,z}, planted }]` shape
 *   groundError()  |footY - terrain| per planted foot (A46 / A6)
 *   sampleRange()  per-bone local-quaternion swing over N frames (A34)
 *
 * Cold path throughout: this allocates. Never call it from a hot loop.
 */

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class RigDebug {
  /**
   * @param {object} o
   * @param {import('./boneSpace.js').BoneSpace} [o.space]
   * @param {THREE.Object3D} [o.root]  used when no space is supplied
   * @param {string} [o.label]
   */
  constructor(o = {}) {
    this.space = o.space || (o.root ? new BoneSpace(o.root) : null);
    this.root = o.root || this.space?.root || null;
    this.label = o.label || this.root?.name || 'rig';
    this.helper = null;
    this._scene = null;
  }

  /* ------------------------------ overlay ------------------------------ */

  /**
   * Show/hide a SkeletonHelper over the rig.
   * @param {THREE.Scene} scene
   * @param {boolean} [on=true]
   */
  overlay(scene, on = true) {
    if (!on) return this.hideOverlay();
    if (!this.root) return null;
    if (!this.helper) {
      this.helper = new THREE.SkeletonHelper(this.root);
      this.helper.material.linewidth = 2;
      this.helper.material.depthTest = false;
      this.helper.material.transparent = true;
      this.helper.renderOrder = 999;
      this.helper.frustumCulled = false;
      this.helper.name = `rigdebug:${this.label}`;
    }
    this._scene = scene;
    if (this.helper.parent !== scene) scene.add(this.helper);
    this.helper.visible = true;
    return this.helper;
  }

  hideOverlay() {
    if (this.helper) this.helper.visible = false;
    return null;
  }

  disposeOverlay() {
    if (!this.helper) return;
    this.helper.removeFromParent();
    this.helper.geometry?.dispose();
    this.helper.material?.dispose();
    this.helper = null;
    this._scene = null;
  }

  /* ------------------------------- probes ------------------------------- */

  /**
   * Full state of one bone in all three spaces (+ its bind reference).
   * Read-only: it never CREATES a BoneSpace entry, because an entry made
   * mid-pose would capture the posed orientation as this bone's bind.
   */
  probe(name) {
    const e = this.space?.entries?.[name] || null;
    const bone = e?.bone || this.space?.bones?.[name] || this.space?.find(name);
    if (!bone) return null;
    const out = { name: bone.name };
    out.local = {
      q: bone.quaternion.toArray().map((n) => +n.toFixed(5)),
      p: bone.position.toArray().map((n) => +n.toFixed(5)),
    };
    this.space.charQ(bone, _q);
    this.space.charPos(bone, _v);
    out.char = { q: _q.toArray().map((n) => +n.toFixed(5)), p: _v.toArray().map((n) => +n.toFixed(4)) };
    bone.getWorldQuaternion(_q);
    this.space.worldPos(bone, _v);
    out.world = { q: _q.toArray().map((n) => +n.toFixed(5)), p: _v.toArray().map((n) => +n.toFixed(4)) };
    if (e) {
      out.bind = {
        q: e.bindQ.toArray().map((n) => +n.toFixed(5)),
        W: e.W.toArray().map((n) => +n.toFixed(5)),
      };
      // angle this bone has been rotated away from its bind local pose
      out.deltaDeg = +(THREE.MathUtils.radToDeg(e.bindQ.angleTo(bone.quaternion))).toFixed(3);
    }
    return out;
  }

  probeAll(names) {
    const out = {};
    for (const n of names) { const p = this.probe(n); if (p) out[n] = p; }
    return out;
  }

  /* -------------------------------- feet -------------------------------- */

  /**
   * The canonical debugFeet() payload every foot gate consumes.
   * @param {Array<{name:string, planted:boolean|(()=>boolean), yOffset?:number}>} spec
   * @returns {Array<{name, world:{x,y,z}, planted}>}
   */
  feet(spec) {
    const out = [];
    for (const s of spec || []) {
      const bone = this.space?.bones?.[s.name] || this.space?.find(s.name);
      if (!bone) continue;
      this.space.worldPos(bone, _v);
      const y = _v.y - (s.yOffset || 0);
      out.push({
        name: bone.name,
        world: { x: _v.x, y, z: _v.z },
        planted: typeof s.planted === 'function' ? !!s.planted() : !!s.planted,
      });
    }
    return out;
  }

  /**
   * |footY - terrain| for every planted foot (gates A6 / A46).
   * @param {Array} feet  output of feet() or any debugFeet()
   * @param {{getHeight:(x:number,z:number)=>number}} terrain
   */
  static groundError(feet, terrain) {
    const errs = [];
    for (const f of feet || []) {
      if (!f.planted) continue;
      errs.push({ name: f.name, err: Math.abs(f.world.y - terrain.getHeight(f.world.x, f.world.z)) });
    }
    return { samples: errs.length, max: errs.length ? Math.max(...errs.map((e) => e.err)) : 0, errs };
  }

  /* ------------------------------ sampling ------------------------------ */

  /**
   * Max local-quaternion swing (degrees) per bone over `frames` rAF ticks —
   * the "is this chain actually driven?" probe (gate A34).
   * @param {string[]} names
   * @param {number} [frames=180]
   */
  async sampleRange(names, frames = 180) {
    const rows = names.map((n) => {
      const bone = this.space?.bones?.[n] || this.space?.find(n);
      return bone ? { name: bone.name, bone, ref: bone.quaternion.clone(), max: 0 } : null;
    }).filter(Boolean);
    const step = typeof requestAnimationFrame === 'function'
      ? () => new Promise((r) => requestAnimationFrame(r))
      : () => new Promise((r) => setTimeout(r, 16));
    for (let i = 0; i < frames; i++) {
      for (const r of rows) r.max = Math.max(r.max, r.ref.angleTo(r.bone.quaternion));
      await step();
    }
    const out = {};
    for (const r of rows) out[r.name] = +THREE.MathUtils.radToDeg(r.max).toFixed(3);
    return out;
  }

  /**
   * Peak-to-peak world-Y excursion of one bone over `frames` ticks (A33).
   */
  async sampleBounce(name, frames = 90) {
    const bone = this.space?.bones?.[name] || this.space?.find(name);
    if (!bone) return null;
    let lo = Infinity, hi = -Infinity;
    const step = typeof requestAnimationFrame === 'function'
      ? () => new Promise((r) => requestAnimationFrame(r))
      : () => new Promise((r) => setTimeout(r, 16));
    for (let i = 0; i < frames; i++) {
      this.space.worldPos(bone, _v);
      lo = Math.min(lo, _v.y); hi = Math.max(hi, _v.y);
      await step();
    }
    return { name: bone.name, peakToPeak: +(hi - lo).toFixed(4), lo: +lo.toFixed(4), hi: +hi.toFixed(4) };
  }

  report() {
    return {
      label: this.label,
      bones: this.space ? Object.keys(this.space.bones).length : 0,
      entries: this.space?.size ?? 0,
      overlay: !!this.helper?.visible,
    };
  }
}
