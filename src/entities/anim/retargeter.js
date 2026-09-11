import * as THREE from 'three';
import { BoneSpace } from './boneSpace.js';
import { RestPose } from './restPose.js';
import { register } from './registry.js';

/**
 * Char-space clip retargeter (bake once -> plain AnimationClip for the target).
 * Promoted from src/spikes/retarget/retarget.js (Round 4); the spike README
 * documents the derivation and the artifacts this fixes.
 *
 * Both rigs are reduced to CHARACTER space (their root Group frame: +Y up,
 * +Z forward, meters) — the same frame playerAnimator.js uses for its
 * W / invW trick — so the wildly different bone-axis conventions (Rigify:
 * +Y along bone; UE4/Fortnite: +X along bone, mirrored L/R frames, Z-up cm
 * internal frame) never have to be reconciled bone-by-bone.
 *
 * Per mapped bone pair (s -> t):
 *   Ws, Ps  source rest orientation/position (char space)
 *   Wt, Pt  target bind orientation/position (char space)
 *   C       rest correction: minimal rotation taking the target's bind bone
 *           DIRECTION (to its mapped child) onto the source's rest direction
 *           — this is what turns Aloy's A-pose into the source's T-pose so
 *           "arm down 90° from rest" means the same thing on both rigs.
 *   Wt2     = C * Wt   (target posed into the source's rest pose)
 * Per frame:
 *   D       = Ws(t) * Ws^-1            char-space delta of the source bone
 *   Wdes    = D * Wt2                  ABSOLUTE desired target orientation
 *   local   = parentChar^-1 * Wdes     (parents baked first; unmapped
 *                                       intermediates keep bind local)
 * Hip only: pelvis char position = Pt + (Ps(t) - Ps) * hipScale, written to
 * the pelvis-parent local frame. Root-bone motion is stripped by default.
 *
 * Output tracks are '<boneName>.quaternion' / '<pelvis>.position' so the clip
 * binds by NAME on any SkeletonUtils.clone of the same rig.
 *
 * Round 4 addition: the bake records the char-space position of every
 * contact bone per frame (`info.contactTracks`) so the clip library can
 * measure a loop's nominal ground speed and foot phase without a second pass.
 *
 * Round 4 (anim-core, perf-tech-11): every space conversion here now goes
 * through `BoneSpace` — `poseIn` is `BoneSpace.poseIn` and the per-bone
 * absolute write is `BoneSpace.setLocalFromFrame` — and the bind snapshot is a
 * `RestPose`. The retargeter works between TWO rigs at once, so it uses the
 * static matrix-frame half of the API rather than a cached live root; the
 * arithmetic is byte-identical to the Round 3 version it replaces.
 */

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _qD = new THREE.Quaternion();
const _qW = new THREE.Quaternion();
const _qP = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _vS = new THREE.Vector3(); // source bone char position (must survive poseIn calls)
const _s = new THREE.Vector3();

export function collectBones(root) {
  const out = {};
  root.traverse((o) => { if (o.isBone) out[o.name] = o; });
  return out;
}

// pose of `obj` in the frame whose inverse world matrix is `frameInv`
const poseIn = (obj, frameInv, outQ, outP = _v) => BoneSpace.poseIn(obj, frameInv, outQ, outP);

function depthOf(o) {
  let d = 0;
  while (o.parent) { d++; o = o.parent; }
  return d;
}

const ARM_RE = /shoulder|upper_arm|forearm|hand|f_|thumb|Shoulder|Arm|Hand/;

export class Retargeter {
  /**
   * @param {object} o
   * @param {THREE.Object3D} o.targetRoot   Aloy root Group (char frame)
   * @param {THREE.Object3D} o.sourceRoot   source gltf.scene (char frame), in REST pose
   * @param {Record<string,string>} o.map   source bone name -> target bone name
   * @param {string} o.hip                  source hip bone name
   * @param {Record<string,string|null>} [o.aim]  rest-correction aim rules
   * @param {'all'|'arms'|'none'} [o.correct='all']  which bones get rest correction
   * @param {number|null} [o.hipScale]      override hip translation scale
   * @param {'strip'|'keep'} [o.rootMotion='strip']
   * @param {string[]} [o.contacts]         target bones used for the ground metric
   */
  constructor(o) {
    this.targetRoot = o.targetRoot;
    this.sourceRoot = o.sourceRoot;
    this.correct = o.correct || 'all';
    this.rootMotion = o.rootMotion || 'strip';
    this.tBones = collectBones(this.targetRoot);
    this.sBones = collectBones(this.sourceRoot);

    this.targetRoot.updateMatrixWorld(true);
    this.sourceRoot.updateMatrixWorld(true);
    this.tInv = this.targetRoot.matrixWorld.clone().invert();
    this.sInv = this.sourceRoot.matrixWorld.clone().invert();

    // GLTFLoader runs node names through PropertyBinding.sanitizeNodeName
    // ("DEF-spine.001" -> "DEF-spine001"), so resolve map keys both ways.
    const san = (n) => THREE.PropertyBinding.sanitizeNodeName(n);
    const srcBone = (n) => this.sBones[n] || this.sBones[san(n)] || null;
    const hipName = srcBone(o.hip)?.name;

    this.pairs = [];
    this.missingSource = [];
    this.missingTarget = [];
    for (const [rawS, tName] of Object.entries(o.map)) {
      const s = srcBone(rawS), t = this.tBones[tName];
      if (!s) { this.missingSource.push(rawS); continue; }
      if (!t) { this.missingTarget.push(tName); continue; }
      const sName = s.name;
      const p = {
        sName, tName, s, t,
        Ws: new THREE.Quaternion(), invWs: new THREE.Quaternion(), Ps: new THREE.Vector3(),
        Wt: new THREE.Quaternion(), Pt: new THREE.Vector3(),
        C: new THREE.Quaternion(), Wt2: new THREE.Quaternion(),
        bindQ: t.quaternion.clone(), bindP: t.position.clone(),
        parent: null, isHip: sName === hipName,
      };
      poseIn(s, this.sInv, p.Ws, p.Ps);
      p.invWs.copy(p.Ws).invert();
      poseIn(t, this.tInv, p.Wt, p.Pt);
      this.pairs.push(p);
    }
    this.pairs.sort((a, b) => depthOf(a.t) - depthOf(b.t)); // parents first
    this.byS = new Map(this.pairs.map((p) => [p.sName, p]));
    this.byT = new Map(this.pairs.map((p) => [p.tName, p]));
    for (const p of this.pairs) {
      let a = p.s.parent;
      while (a && !this.byS.has(a.name)) a = a.parent;
      p.parent = a ? this.byS.get(a.name) : null;
    }
    this.hip = this.pairs.find((p) => p.isHip) || null;
    if (!this.hip) throw new Error(`retarget: hip bone "${o.hip}" not mapped`);

    this.unmappedSource = Object.keys(this.sBones).filter((n) => !this.byS.has(n));

    // root bone (topmost Bone above the hip) — its motion gets stripped
    let r = this.hip.s;
    while (r.parent && r.parent.isBone) r = r.parent;
    this.rootBone = r !== this.hip.s ? r : null;
    this.rootRestM = new THREE.Matrix4();
    if (this.rootBone) {
      this.rootBone.updateWorldMatrix(true, false);
      this.rootRestM.multiplyMatrices(this.sInv, this.rootBone.matrixWorld);
    }

    this.hipScale = o.hipScale ?? (this.hip.Pt.y / Math.max(1e-6, this.hip.Ps.y));

    // --- rest correction C per bone ---
    const aim = {};
    for (const [k, v] of Object.entries(o.aim || {})) aim[san(k)] = typeof v === 'string' && v !== 'inherit' ? san(v) : v;
    const firstMappedDescendant = (s) => {
      const queue = [...s.children];
      while (queue.length) {
        const c = queue.shift();
        if (this.byS.has(c.name)) return this.byS.get(c.name);
        queue.push(...c.children);
      }
      return null;
    };
    for (const p of this.pairs) {
      const rule = aim[san(p.sName)];
      let target = null, inherit = false;
      if (rule === null) { /* identity */ }
      else if (rule === 'inherit') inherit = true;
      else if (typeof rule === 'string') target = this.byS.get(rule) || null;
      else target = firstMappedDescendant(p.s);
      if (rule !== null && !target) inherit = true;

      if (inherit) {
        if (p.parent) p.C.copy(p.parent.C);
      } else if (target) {
        const dS = _v.copy(target.Ps).sub(p.Ps).normalize();
        const dT = _v2.copy(target.Pt).sub(p.Pt).normalize();
        if (dS.lengthSq() > 0.5 && dT.lengthSq() > 0.5) p.C.setFromUnitVectors(dT, dS);
      }
      const wants = this.correct === 'all' || (this.correct === 'arms' && ARM_RE.test(p.sName));
      if (!wants) p.C.identity();
      p.Wt2.copy(p.C).multiply(p.Wt);
    }

    // ground-contact probes on the target (rest heights in char space)
    this.contacts = [];
    for (const n of o.contacts || []) {
      const b = this.tBones[n];
      if (!b) continue;
      poseIn(b, this.tInv, _q, _v);
      this.contacts.push({ bone: b, restY: _v.y, name: n });
    }

    // shared bind snapshot (anim-core): one restore path for the whole rig
    this.bind = new RestPose({
      bones: this.pairs.map((p) => p.t),
      positions: true,
    });

    this._cache = new Map();
    register({
      id: 'anim/retargeter', file: 'src/entities/anim/retargeter.js',
      owner: 'anim-core', rig: 'aloy', convention: 'BoneSpace',
      status: 'migrated', bones: this.pairs.length,
    });
  }

  restoreBind() {
    this.bind.restore();
    this.targetRoot.updateMatrixWorld(true);
  }

  /** Names of the target bones the baked clips animate (quaternion tracks). */
  animatedTargetNames() {
    return this.pairs.map((p) => p.tName);
  }

  /**
   * Bake a source clip into a target clip.
   * @param {THREE.AnimationClip} clip  source clip (as loaded by GLTFLoader)
   * @param {object} [opts]  { fps, groundFix=true, extraShift=0, name, amp }
   *   `amp` (0..1) is an AMPLITUDE WARP: every baked track is slerped/lerped
   *   toward its own loop mean, which shortens the stride and lowers the flight
   *   arc of a loop without changing its duration (see `_ampWarp`).
   */
  bake(clip, opts = {}) {
    const key = clip.name + JSON.stringify(opts);
    if (this._cache.has(key)) return this._cache.get(key);

    const keyRate = Math.max(...clip.tracks.map((t) => t.times.length)) / Math.max(clip.duration, 1e-6);
    const fps = opts.fps ?? Math.min(60, Math.max(24, Math.round(keyRate)));
    const n = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(n);
    for (let i = 0; i < n; i++) times[i] = Math.min(i / fps, clip.duration);

    this.targetRoot.updateMatrixWorld(true);
    this.sourceRoot.updateMatrixWorld(true);
    this.tInv.copy(this.targetRoot.matrixWorld).invert();
    this.sInv.copy(this.sourceRoot.matrixWorld).invert();

    const quat = new Map(this.pairs.map((p) => [p, new Float32Array(n * 4)]));
    const hipPos = new Float32Array(n * 3);
    const soleMin = new Float32Array(n);
    const contactTracks = this.contacts.map(() => new Float32Array(n * 3));
    const rootTrack = new Float32Array(n * 3); // char-space root displacement per frame
    const stripM = new THREE.Matrix4();
    const rootDisp = new THREE.Vector3();
    let rootDispMax = 0;

    const mixer = new THREE.AnimationMixer(this.sourceRoot);
    const action = mixer.clipAction(clip);
    action.play();

    for (let i = 0; i < n; i++) {
      mixer.setTime(times[i]);
      this.sourceRoot.updateMatrixWorld(true);

      stripM.identity();
      if (this.rootBone) {
        _m2.multiplyMatrices(this.sInv, this.rootBone.matrixWorld);
        rootDisp.setFromMatrixPosition(_m2).sub(_v.setFromMatrixPosition(this.rootRestM));
        rootDispMax = Math.max(rootDispMax, rootDisp.length());
        rootDisp.toArray(rootTrack, i * 3);
        if (this.rootMotion === 'strip') stripM.copy(this.rootRestM).multiply(_m2.invert());
      }

      for (const p of this.pairs) {
        // source char pose (root motion stripped)
        _m2.multiplyMatrices(this.sInv, p.s.matrixWorld);
        _m.multiplyMatrices(stripM, _m2);
        _m.decompose(_vS, _q, _s);
        // delta from rest, applied to the corrected target bind
        _qD.copy(_q).multiply(p.invWs);
        _qW.copy(_qD).multiply(p.Wt2);
        poseIn(p.t.parent, this.tInv, _qP);
        BoneSpace.setLocalFromFrame(p.t, _qP, _qW);
        p.t.quaternion.toArray(quat.get(p), i * 4);

        if (p.isHip) {
          _v.copy(_vS).sub(p.Ps).multiplyScalar(this.hipScale).add(p.Pt); // char-space pelvis pos
          _m2.copy(p.t.parent.matrixWorld).invert().multiply(this.targetRoot.matrixWorld);
          p.t.position.copy(_v).applyMatrix4(_m2);
          p.t.position.toArray(hipPos, i * 3);
        }
      }

      // ground metric: lowest contact bone vs its bind height (+ record positions)
      this.targetRoot.updateMatrixWorld(true);
      let lo = Infinity;
      for (let c = 0; c < this.contacts.length; c++) {
        poseIn(this.contacts[c].bone, this.tInv, _q, _v);
        _v.toArray(contactTracks[c], i * 3);
        lo = Math.min(lo, _v.y - this.contacts[c].restY);
      }
      soleMin[i] = lo === Infinity ? 0 : lo;
    }

    mixer.stopAllAction();
    mixer.uncacheRoot(this.sourceRoot); // restores source rest pose

    // amplitude warp (stride/energy warping) — see _ampWarp. Re-derives the
    // contact tracks from the warped pose, because the gait analysis downstream
    // measures the clip's nominal speed off exactly these positions.
    const amp = opts.amp ?? 1;
    if (amp < 0.999) {
      this._ampWarp(quat, hipPos, n, amp);
      this._sampleContacts(quat, hipPos, n, contactTracks, soleMin);
    }

    // constant vertical shift so the lowest contact over the loop sits on bind height
    let minSole = Infinity, maxSole = -Infinity;
    for (let i = 0; i < n; i++) { minSole = Math.min(minSole, soleMin[i]); maxSole = Math.max(maxSole, soleMin[i]); }
    const groundFix = opts.groundFix !== false;
    const shift = (groundFix ? -minSole : 0) + (opts.extraShift || 0);
    if (shift !== 0) {
      _m2.copy(this.hip.t.parent.matrixWorld).invert().multiply(this.targetRoot.matrixWorld);
      _m3.setFromMatrix4(_m2);
      _v.set(0, shift, 0).applyMatrix3(_m3);
      for (let i = 0; i < n; i++) { hipPos[i * 3] += _v.x; hipPos[i * 3 + 1] += _v.y; hipPos[i * 3 + 2] += _v.z; }
      for (const tr of contactTracks) for (let i = 0; i < n; i++) tr[i * 3 + 1] += shift;
    }

    this.restoreBind();

    const tracks = [];
    for (const p of this.pairs) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${p.tName}.quaternion`, times, quat.get(p)));
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${this.hip.tName}.position`, times, hipPos));
    const out = new THREE.AnimationClip(opts.name || clip.name, clip.duration, tracks);

    const contacts = {};
    this.contacts.forEach((c, i) => { contacts[c.name] = contactTracks[i]; });
    const info = {
      clip: clip.name, duration: +clip.duration.toFixed(4), fps, frames: n, times,
      hipScale: +this.hipScale.toFixed(4),
      soleMinPreFix: +minSole.toFixed(4), soleMaxPreFix: +maxSole.toFixed(4),
      groundShift: +shift.toFixed(4),
      rootMotion: this.rootMotion, rootBone: this.rootBone?.name || null,
      rootDispMax: +rootDispMax.toFixed(3),
      mapped: this.pairs.length,
      missingSource: this.missingSource, missingTarget: this.missingTarget,
      contactTracks: contacts,
      rootTrack, // char-space root-bone displacement per frame (even when stripped)
    };
    const result = { clip: out, info };
    this._cache.set(key, result);
    return result;
  }

  /**
   * AMPLITUDE WARP — offline stride/energy warping.
   *
   * The Quaternius pack has one forward run (`Jog_Fwd_Loop`) and it is authored
   * at 6.05 m/s with a 5.55 m cycle: 2.8 m per step and 71% of the loop with
   * both feet clear of the floor. Phase-locking it to a 4.6 m/s player is
   * mathematically no-skate but reads as low-gravity BOUNDING, because the only
   * knob a phase lock has is playback rate, and slowing an airborne clip down
   * keeps every centimetre of its stride and its flight arc.
   *
   * The knob that IS missing is amplitude. Slerping every bone toward the loop's
   * own MEAN pose by `amp` shrinks the deviation the clip makes from its average
   * stance — shorter stride, lower knee lift, smaller pelvis bob — while leaving
   * the mean pose (the run's forward lean, the arm carriage), the coordination
   * between limbs and the duration untouched. The result is a clip whose nominal
   * speed is `amp`-ish times the original, so it can be played NEAR 1x at the
   * speed the game actually moves: correct cadence, correct flight fraction, and
   * still no skate, because the gait analysis re-measures the warped clip.
   *
   * (This is the offline sibling of runtime stride warping; doing it at bake
   * time costs nothing per frame and cannot fight the foot lock.)
   */
  _ampWarp(quat, hipPos, n, amp) {
    const per = n > 1 ? n - 1 : 1;   // unique frames: a loop repeats frame 0
    const qm = new THREE.Quaternion();
    const qi = new THREE.Quaternion();
    const qs = new THREE.Quaternion();
    for (const p of this.pairs) {
      const arr = quat.get(p);
      // sign-aligned linear mean, normalized: the samples of a gait loop all
      // sit inside one hemisphere of the first frame, where nlerp-averaging a
      // quaternion set is accurate to well under a degree.
      const rx = arr[0], ry = arr[1], rz = arr[2], rw = arr[3];
      let mx = 0, my = 0, mz = 0, mw = 0;
      for (let i = 0; i < per; i++) {
        let x = arr[i * 4], y = arr[i * 4 + 1], z = arr[i * 4 + 2], w = arr[i * 4 + 3];
        if (x * rx + y * ry + z * rz + w * rw < 0) { x = -x; y = -y; z = -z; w = -w; }
        mx += x; my += y; mz += z; mw += w;
      }
      if (mx * mx + my * my + mz * mz + mw * mw < 1e-9) continue;
      qm.set(mx, my, mz, mw).normalize();
      for (let i = 0; i < n; i++) {
        qi.fromArray(arr, i * 4);
        qs.copy(qm).slerp(qi, amp).toArray(arr, i * 4);
      }
    }
    // pelvis translation: same treatment, so the vertical bob shrinks with the
    // stride instead of leaving her pogoing over shorter steps
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < per; i++) { px += hipPos[i * 3]; py += hipPos[i * 3 + 1]; pz += hipPos[i * 3 + 2]; }
    px /= per; py /= per; pz /= per;
    for (let i = 0; i < n; i++) {
      hipPos[i * 3] = px + (hipPos[i * 3] - px) * amp;
      hipPos[i * 3 + 1] = py + (hipPos[i * 3 + 1] - py) * amp;
      hipPos[i * 3 + 2] = pz + (hipPos[i * 3 + 2] - pz) * amp;
    }
  }

  /** Re-pose the target rig from baked tracks and re-record the contact probes. */
  _sampleContacts(quat, hipPos, n, contactTracks, soleMin) {
    const hipBone = this.hip.t;
    for (let i = 0; i < n; i++) {
      for (const p of this.pairs) p.t.quaternion.fromArray(quat.get(p), i * 4);
      hipBone.position.fromArray(hipPos, i * 3);
      this.targetRoot.updateMatrixWorld(true);
      let lo = Infinity;
      for (let c = 0; c < this.contacts.length; c++) {
        poseIn(this.contacts[c].bone, this.tInv, _q, _v);
        _v.toArray(contactTracks[c], i * 3);
        lo = Math.min(lo, _v.y - this.contacts[c].restY);
      }
      soleMin[i] = lo === Infinity ? 0 : lo;
    }
  }
}
