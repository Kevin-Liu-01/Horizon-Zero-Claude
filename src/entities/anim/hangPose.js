/**
 * M1.3f — THE KITE'S HANG POSE, a static blockout (BUILD M1.3f; the kite itself is Milestone 3, M3.1).
 *
 * BIBLE §5.2: "Stow, unstow, mantle, climb, roll and the kite's hang pose obey the same arm rule as the draw" — never an
 * arm behind the head. Hanging from a kite's control bar the hands hold the bar IN FRONT of her, between the sternum
 * and the chin, elbows down and out; the body hangs under them with the knees a little bent. This is that pose on the
 * rig, built from the posed skeleton so it holds on any body: the bar's height is the live sternum (neck_01's base) to
 * chin line, the bar stands a forearm in front of the chest, the hands a shoulder-width and a fist apart.
 *
 * `animator.setHangPose(true)` turns it on (a gate or a dev hook; nothing in play calls it yet); `hangPoseInfo()` is
 * the bar the last frame solved for. Installed onto `PlayerAnimator.prototype` (`installMethods`); `this` is the
 * animator. Nothing allocates per frame.
 */
import * as THREE from 'three';
import { X_AXIS, Y_AXIS, Z_AXIS, clamp } from './playerCommon.js';

const HANG = {
  /** the bar between the sternum (0) and the chin (1): low in the band, so the bent elbows stay under the shoulders */
  barK: 0.25,
  /** in front of spine_05 (char z). BIBLE §12 wants the bar 0.30-0.40 m in front of the CHEST: at the bar's height
   *  Brea's clothed chest (the Pan I outfit's front) stands 0.156 m ahead of spine_05 and the torso capsule's surface
   *  0.101 m (tools/gates/kite/hang-bench.mjs reads both off the posed meshes), so 0.48 puts the bar 0.32 m in front of
   *  the cloth and 0.38 m in front of the capsule (M3 area B fix 1; 0.32 at M1.3f left it 0.17 m and 0.22 m) */
  barFwd: 0.48,
  /** half the hands' spread on the bar (char x) */
  halfGrip: 0.22,
  /** the shoulders brought forward to reach the bar (rad about char y at each clavicle; 0.45 moves each shoulder
   *  joint 0.05 m forward, and the elbows bend 0.05 m under the shoulders at the bar's reach) */
  protract: 0.45,
  /** the hip and knee bends of a hang (rad): thighs a little forward, shins back under them */
  hip: 0.28, knee: 0.42,
};
const _bar = new THREE.Vector3(), _g = new THREE.Vector3(), _pole = new THREE.Vector3();
const _s5 = new THREE.Vector3(), _nk = new THREE.Vector3(), _hd = new THREE.Vector3();
const _shL = new THREE.Vector3(), _shR = new THREE.Vector3();
/** the chest's square-up, shared down the upper spine (spine_03, _04, _05) */
const SQUARE = [['spine3', 0.3], ['spine4', 0.3], ['spine5', 0.4]];

export class HangPose {
  setHangPose(on) { this._hangOn = !!on; return this._hangOn; }

  hangPoseInfo() {
    return this._hangInfo || null;
  }

  /** The pose, at weight `w` (1 = the static blockout), after every body layer and before the twists and the chains. */
  _hangLayer(w = 1) {
    const b = this.b;
    if (!b.upArmL || !b.upArmR || !b.spine5 || !b.head) return;
    // the legs first (the hang's own bend), so the arms are solved on the final chest
    if (b.thighL) this._rot(b.thighL, X_AXIS, -HANG.hip * w);
    if (b.thighR) this._rot(b.thighR, X_AXIS, -HANG.hip * w);
    if (b.calfL) this._rot(b.calfL, X_AXIS, HANG.knee * w);
    if (b.calfR) this._rot(b.calfR, X_AXIS, HANG.knee * w);
    this.model.updateMatrixWorld(true);
    // the chest squared to the bar: the body layers under it leave the shoulders yawed (about 18 deg, the left shoulder
    // forward, at the idle) and rolled; hanging from a bar held in both hands the shoulder line lies along the bar
    this._charOf(b.upArmL.bone, _shL); this._charOf(b.upArmR.bone, _shR);
    const dx = _shL.x - _shR.x, yaw = Math.atan2(_shL.z - _shR.z, dx), roll = Math.atan2(_shR.y - _shL.y, dx);
    for (const [k, share] of SQUARE) if (b[k] && this.space) {
      this.space.rotChar(b[k], Y_AXIS, yaw * share * w, false);
      this.space.rotChar(b[k], Z_AXIS, roll * share * w, false);
    }
    if (b.clavL && b.clavR && this.space) {
      this.space.rotChar(b.clavL, Y_AXIS, -HANG.protract * w, false);
      this.space.rotChar(b.clavR, Y_AXIS, HANG.protract * w, false);
    }
    this.model.updateMatrixWorld(true);
    this._charOf(b.spine5.bone, _s5);
    this._charOf((b.neck1 || b.spine5).bone, _nk);
    this._charOf(b.head.bone, _hd);
    // the chin: a head-bone height below the head joint is the jaw line on this rig (the head bone sits at the skull's base)
    const chinY = _hd.y - 0.02, sternY = _nk.y - 0.08;
    const y = sternY + (chinY - sternY) * clamp(HANG.barK, 0, 1);
    _bar.set(_s5.x, y, _s5.z + HANG.barFwd);
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      _g.set(_bar.x + sx * HANG.halfGrip, _bar.y, _bar.z);
      _pole.set(sx * 0.65, -0.75, -0.1);
      this._ikArm(s, _g, _pole, w, null);
    }
    this._curlFingers(this._fingerL, 1.05 * w, 0.7 * w);
    this._curlFingers(this._fingerR, 1.05 * w, 0.7 * w);
    const I = this._hangInfo || (this._hangInfo = { bar: [0, 0, 0], sternY: 0, chinY: 0 });
    I.bar[0] = +_bar.x.toFixed(4); I.bar[1] = +_bar.y.toFixed(4); I.bar[2] = +_bar.z.toFixed(4); I.sternY = +sternY.toFixed(4); I.chinY = +chinY.toFixed(4);
  }
}
