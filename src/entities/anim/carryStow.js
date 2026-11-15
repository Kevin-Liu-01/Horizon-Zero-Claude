/**
 * CARRY AND STOW: the lowered bow carry, the two-handed heavy carry, the fallback base pose, finger curls
 * and the hand attach points the props hang from. The stowed pieces themselves are posed by `src/hero/carry.js`.
 *
 * M1.3a: these members of `PlayerAnimator` were moved here from `src/entities/playerAnimator.js` verbatim
 * (byte for byte, with the comments above each) and are installed onto `PlayerAnimator.prototype` by that
 * file (`installMethods`); `this` is the animator, as before. This class is a carrier and is never constructed.
 */
import * as THREE from 'three';
import {
  KEY, X_AXIS, Z_AXIS, _grip, _pole, _q1, clamp, damp,
} from './playerCommon.js';

/*
 * M1a round 2 (BUILD M1.2f, BIBLE §5.2): THE BOW'S AUTHORED STOW AND UNSTOW. "The bow hand reaches back at waist height,
 * takes the lower limb below the shoulder blade and draws the bow down and forward past the hip. Never over the
 * shoulder." Character space (+X her left, +Z forward). The kit's stowed Sabina (stowkit piece 2, rigid on spine_02)
 * runs from its lower tip at her right hip (-0.18, 0.65, -0.25) to its upper tip over the left shoulder; its lower
 * limb crosses waist height (y 0.95-1.12) at (-0.06, 1.04, -0.12) at idle. The left hand takes it there, from behind.
 */
const BOW_UNSTOW_T = 0.40;           // s, the whole unstow: reach back, take it, draw it down and forward past the hip
const BOW_STOW_T = 0.42;             // s, the stow: back past the hip, set it on the back, the hand back to her side
const BOW_GRAB_K = 0.45;             // the unstow's fraction where the hand has the limb
const BOW_RELEASE_K = 0.55;          // the stow's fraction where the hand lets it go
/** The grab point on the stowed lower limb, in spine_02's frame at bind (filled once, `_bowPathInit`); this char
 *  fallback, the hand 0.05 m behind the limb, until then. */
const BOW_GRAB_CHAR = [-0.06, 1.04, -0.17];
const BOW_SIDE = [0.31, 1.00, -0.15];      // beside the left hip, a little back: the way round to the back and out
const BOW_PAST_HIP = [0.33, 0.92, -0.07];  // the draw down and forward past the hip
const BOW_POLE = [0.85, -0.45, -0.30];     // the left elbow out and back beside her, low
const _bpA = new THREE.Vector3(), _bpB = new THREE.Vector3(), _bpC = new THREE.Vector3(), _bpT = new THREE.Vector3();
const _bpM = new THREE.Matrix4(), _bpN = new THREE.Matrix4(), _bpS = new THREE.Vector3(), _bpQ = new THREE.Quaternion();
const _bpP = new THREE.Vector3();
const _sm = (x) => { const k = x < 0 ? 0 : x > 1 ? 1 : x; return k * k * (3 - 2 * k); };
/** a quadratic Bezier F -> W -> G at u, into `out` */
function bez(F, W, G, u, out) {
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
  return out.set(F.x * a + W.x * b + G.x * c, F.y * a + W.y * b + G.y * c, F.z * a + W.z * b + G.z * c);
}

export class CarryStow {
  handAttach(side) {
    const s = String(side || 'r').toLowerCase()[0];
    return s === 'l' ? this.bones[this.KEY.handL] : this.bones[this.KEY.handR];
  }

  /**
   * Wielded carry (player-anim-14 / combat-bow-stowed-in-combat): while
   * `combat.weaponDrawn` is up but she is not aiming, the bow hangs LOW in the
   * LEFT hand and that arm's clip swing is damped to about a third — a bow in
   * a running hand does not pump like an empty one.
   */
  _bowCarryLayer(w, p, t) {
    const b = this.b;
    if (w < 0.01) return;
    // damp the left arm's own swing by rotating it back toward its bind pose
    // (the list is built once: no per-frame array, plan §0 rule 5)
    const arm = this._bowCarryArm || (this._bowCarryArm = [b.upArmL, b.loArmL, b.handL]);
    for (let i = 0; i < arm.length; i++) {
      const e = arm[i];
      if (!e) continue;
      _q1.copy(e.bone.quaternion);
      e.bone.quaternion.slerp(e.bindQ, 0.62 * w);
      // keep a third of the swing so it is damped, not dead
      e.bone.quaternion.slerp(_q1, 0.34 * w);
    }
    // ...then hold it at a low, slightly-forward carry beside her left thigh,
    // riding the breath and a little of the stride
    const sw = Math.sin((this.loco?.phase ?? 0) * Math.PI * 2) * 0.022 * this._moveW;
    /* R64 (c), Nov 6: 3 cm wider than Round 5's 0.245, so the held bow and the
     * hand clear the skirt by >= 0.5 cm on all four Pans (A-variant-swap-matrix's
     * held clause) */
    _grip.set(0.275, 0.94 + sw + (this._brNow - 0.5) * 0.012 - 0.30 * this._crouchW, 0.135);
    _pole.set(0.85, -0.55, -0.25);
    this._ikArm('l', _grip, _pole, w * 0.92, null);
    this._rot(b.handL, X_AXIS, -0.30 * w);
    this._rot(b.handL, Z_AXIS, 0.22 * w);
    this._curlFingers(this._fingerL, 0.85 * w, 0.55 * w);
    // shoulder carries the mass
    this._rot(b.clavL, Z_AXIS, -0.05 * w);
    this._rot(b.spine2, Z_AXIS, -0.025 * w);
  }

  /* ---------------- M1a round 2: the bow's stow and unstow path ---------------- */

  /** The path's state (built on first use; the constructor names the field). */
  _bowPathState() {
    return this._bp || (this._bp = {
      mode: 0, t: 0, k: 0, dur: BOW_UNSTOW_T, was: false, inHand: false, w: 0,
      from: new THREE.Vector3(), grab: new THREE.Vector3(), grabLocal: null, sideLocal: null, pastLocal: null, cap: false,
      capP: new THREE.Vector3(), capQ: new THREE.Quaternion(), live: false, liveP: new THREE.Vector3(), liveQ: new THREE.Quaternion(),
      blend: 1, maxBehind: 0, frames: 0,
    });
  }

  /** Once: the grab point in spine_02's frame, from the kit's own stowed bow (its lower limb at waist height). */
  _bowPathInit() {
    const B = this._bowPathState();
    if (B.grabLocal !== null) return;
    B.grabLocal = false;
    const kit = this.ctx.player?.hero?.kit, m = kit?.meshes?.[0], sp = this.b?.spine2?.bone;
    if (!m || !sp) return;
    const P = m.geometry.getAttribute('_piece'), pos = m.geometry.getAttribute('position');
    if (!P || !pos) return;
    this.model.updateMatrixWorld(true);
    let n = 0;
    _bpA.set(0, 0, 0);
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & 2) === 0) continue;
      m.getVertexPosition(i, _bpB); m.localToWorld(_bpB); this.model.worldToLocal(_bpB);
      if (_bpB.y < 0.95 || _bpB.y > 1.12) continue;
      _bpA.add(_bpB); n++;
    }
    if (!n) return;
    _bpA.multiplyScalar(1 / n);
    _bpA.z -= 0.05;                           // the palm on its far side, behind it
    this.model.localToWorld(_bpA);
    B.grabLocal = sp.worldToLocal(_bpA.clone());
    // the two waypoints ride the same bone, so a crouch or a lean carries the whole path with her waist
    B.sideLocal = sp.worldToLocal(this.model.localToWorld(_bpA.fromArray(BOW_SIDE)).clone());
    B.pastLocal = sp.worldToLocal(this.model.localToWorld(_bpA.fromArray(BOW_PAST_HIP)).clone());
  }

  /** A point kept in spine_02's frame, this step, character space (`fallback` until `_bowPathInit` found the kit). */
  _bowPointNow(local, fallback, out) {
    if (!local) return out.fromArray(fallback);
    const sp = this.b.spine2.bone;
    sp.updateWorldMatrix(true, false);
    out.copy(local); sp.localToWorld(out); this.model.worldToLocal(out);
    return out;
  }

  /** The grab point this step, character space. */
  _bowGrabNow(out) { return this._bowPointNow(this._bp?.grabLocal || null, BOW_GRAB_CHAR, out); }

  /**
   * The path, each step after the aim layer and the carry (it owns the LEFT arm while it runs; the aim rig waits for
   * it, `update`). `want`: combat's `weaponDrawn` (the bow in her hand). Returns the arm weight it took this step.
   */
  _bowPathLayer(want, dt) {
    const B = this._bowPathState();
    const b = this.b;
    if (!b.handL || !b.upArmL) return 0;
    if (want !== B.was) {
      // a new path: from where the hand was RENDERED last step (or reversing one under way, from where it is)
      this._bowPathInit();
      B.mode = want ? 1 : 2; B.t = 0; B.k = 0; B.dur = want ? BOW_UNSTOW_T : BOW_STOW_T;
      B.inHand = !want;
      if (this._bpHandOk) B.from.copy(this._bpHand); else this._charOf(b.handL.bone, B.from);
      B.cap = false; B.live = false; B.maxBehind = 0; B.frames = 0;
    }
    B.was = want;
    if (B.mode === 0) { B.w = 0; B.blend = 1; B.inHand = want; return 0; }
    B.t += dt; B.frames++;
    const k = B.k = clamp(B.t / B.dur, 0, 1);
    const G = this._bowGrabNow(_bpC);
    const side = this._bowPointNow(B.sideLocal, BOW_SIDE, _bpA), past = this._bowPointNow(B.pastLocal, BOW_PAST_HIP, _bpB);
    let w = 1;
    if (B.mode === 1) {
      if (k < BOW_GRAB_K) bez(B.from, side, G, _sm(k / BOW_GRAB_K), _bpT);
      else {
        // where the carry layer holds it (its grip, breath and stride left out: they come in with its weight)
        _bpP.set(0.275, 0.94 - 0.30 * this._crouchW, 0.135);
        bez(G, past, _bpP, _sm((k - BOW_GRAB_K) / (1 - BOW_GRAB_K)), _bpT);
      }
      w = _sm(k / 0.12);
      B.inHand = k >= BOW_GRAB_K;
      B.blend = k < BOW_GRAB_K ? 0 : _sm((k - BOW_GRAB_K) / (1 - BOW_GRAB_K));
    } else {
      if (k < BOW_RELEASE_K) bez(B.from, past, G, _sm(k / BOW_RELEASE_K), _bpT);
      else {
        // back to her side, where the clip's own hand is: the arm is handed back over the last fifth
        this._charOf(b.handL.bone, _bpP);
        bez(G, side, _bpP, _sm((k - BOW_RELEASE_K) / (1 - BOW_RELEASE_K)), _bpT);
      }
      w = 1 - _sm((k - 0.8) / 0.2);
      B.inHand = k < BOW_RELEASE_K;
      B.blend = k < BOW_RELEASE_K ? 1 - _sm(k / BOW_RELEASE_K) : 0;
    }
    _pole.fromArray(BOW_POLE);
    this._ikArm('l', _bpT, _pole, w, null);
    // the fingers close on the limb while she holds it
    if (B.inHand) this._curlFingers(this._fingerL, 0.85 * w, 0.55 * w);
    if (k >= 1) {
      B.mode = 0; B.blend = 1;
      // the lowered carry starts where the path left the hand
      if (want) this._carryBowW = 1;
    }
    B.w = w;
    return w;
  }

  /** M1a round 2: is the bow in her hand this step (combat shows its own bow on the hand node while true)? Null: no path. */
  bowInHand() {
    const B = this._bp;
    return B ? B.inHand : null;
  }

  /**
   * M1a round 2: combat calls this right after placing its bow on the hand node (`_placeInHand`), with the bow's group.
   * While the unstow draws it down past the hip, the bow goes from the pose it had on her back when the hand took it
   * (held rigid in the hand) to combat's in-hand pose; on the stow, from combat's pose to its place on her back,
   * reached as the hand lets go.
   */
  bowPathPose(group) {
    const B = this._bp, cmb = this.ctx.combat;
    if (!B || B.mode === 0 || !B.inHand || !group?.parent) return;
    const st = cmb?._stow;
    if (!st) return;
    const node = group.parent;
    node.updateWorldMatrix(true, false);
    st.bone.updateWorldMatrix(true, false);
    // the bow's place on her back, in the hand node's frame, this step
    _bpN.compose(st.pos, st.quat, _bpS.set(1, 1, 1));
    _bpM.copy(node.matrixWorld).invert().multiply(st.bone.matrixWorld).multiply(_bpN);
    _bpM.decompose(B.liveP, B.liveQ, _bpS);
    if (B.mode === 1 && !B.cap) { B.capP.copy(B.liveP); B.capQ.copy(B.liveQ); B.cap = true; }
    const a = B.blend;
    if (B.mode === 1) {
      group.position.lerpVectors(B.capP, group.position, a);
      _bpQ.copy(B.capQ).slerp(group.quaternion, a); group.quaternion.copy(_bpQ);
    } else {
      group.position.lerpVectors(B.liveP, group.position, a);
      _bpQ.copy(B.liveQ).slerp(group.quaternion, a); group.quaternion.copy(_bpQ);
    }
  }

  /* -------------------- procedural fallback (no clip pack) ---------------- */

  _fallbackBase(aimW, carryW) {
    for (const e of Object.values(this._entries)) e.bone.quaternion.copy(e.bindQ);
    const hangW = 1 - Math.max(aimW, carryW);
    if (hangW > 0.001) {
      _grip.set(0.24, 0.86, 0.06); _pole.set(0.35, -0.5, -0.85);
      this._ikArm('l', _grip, _pole, hangW, null);
      _grip.set(-0.24, 0.86, 0.06); _pole.set(-0.35, -0.5, -0.85);
      this._ikArm('r', _grip, _pole, hangW, null);
    }
    this._curlFingers(this._fingerL, 0.32, 0.15);
    this._curlFingers(this._fingerR, 0.32, 0.15);
  }

  /* --------------------- heavy two-hand carry overlay ---------------------- */

  _carryLayer(w, p, t) {
    const b = this.b;
    this._rot(b.pelvis, X_AXIS, 0.04 * w);
    this._rot(b.spine1, X_AXIS, -0.07 * w);
    this._rot(b.spine2, X_AXIS, -0.09 * w);
    this._rot(b.spine3, X_AXIS, -0.05 * w);
    this._rot(b.neck1, X_AXIS, 0.08 * w);
    this._rot(b.head, X_AXIS, 0.1 * w);
    this._rot(b.thighL, Z_AXIS, 0.07 * w);
    this._rot(b.thighR, Z_AXIS, -0.07 * w);
    this._rot(b.calfL, X_AXIS, 0.1 * w);
    this._rot(b.calfR, X_AXIS, 0.1 * w);

    const pitch = clamp(p.camPitch ?? 0, -0.5, 0.7);
    const heave = (this._brNow - 0.5) * 0.01 - 0.4 * this._crouchW;
    _grip.set(0.08, 1.03 - 0.1 * pitch + heave, 0.36);
    _pole.set(0.7, -0.6, 0.1);
    this._ikArm('l', _grip, _pole, w, null);
    _grip.set(-0.02, 0.97 - 0.05 * pitch + heave, 0.1);
    _pole.set(-0.8, -0.55, -0.15);
    this._ikArm('r', _grip, _pole, w, null);
    this._curlFingers(this._fingerL, 0.55 * w, 0.35 * w);
    this._curlFingers(this._fingerR, 0.55 * w, 0.35 * w);
  }

  _curlFingers(list, curl, thumbCurl) {
    if (curl === 0 && thumbCurl === 0) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      // Round 5: a rig whose fingers do not curl about local +Z (Rigify-style
      // UBC: local X) sets `e.curlAxis` per finger; Brea leaves it unset
      _q1.setFromAxisAngle(e.curlAxis || Z_AXIS, e.isThumb ? thumbCurl : curl);
      e.bone.quaternion.multiply(_q1);
    }
  }
}
