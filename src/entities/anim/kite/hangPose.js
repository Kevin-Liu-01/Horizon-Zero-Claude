/**
 * THE KITE'S HANG AND ITS CLIPS on the rig (M1.3f's static hang, moved into anim/kite/ by M3 area B wave 2, as the M3
 * brief's area B asks; `src/entities/anim/hangPose.js` re-exports it, so the animator's install line is unchanged).
 *
 * BIBLE §5.2: "Stow, unstow, mantle, climb, roll and the kite's hang pose obey the same arm rule as the draw" — never an
 * arm behind the head. BIBLE §12: "a hip sling and chest strap take her weight; her hands hold a cane control bar at
 * sternum-to-chin height, 0.30–0.40 m in front of the chest, elbows bent and below the shoulders. Her arms are never
 * overhead." The hang is built from the posed skeleton so it holds on any body: the bar's height is the live sternum
 * (neck_01's base) to chin line, the bar stands a forearm in front of the chest, the hands a shoulder-width and a fist
 * apart.
 *
 *   animator.setHangPose(true)                 the static hang (wave 1's blockout: a gliding kite with no bank)
 *   animator.setKiteFlight(state, t, opts)     the clips (./kiteClips.js), read from the flight-state seam: `state` and
 *                                              the seconds in it (src/game/kite/flight.js FlightBody.t); opts.bank
 *                                              (-1..1) and opts.forced (R5's reef). 'none' turns the layer off.
 *   animator.hangPoseInfo()                    the last frame's solve: `bar` (the kite's origin, char frame, as wave 1),
 *                                              `sternY`, `chinY`, and `kite` { pos, quat, furl, clip, phase }
 *
 * Installed onto `PlayerAnimator.prototype` (`installMethods`); `this` is the animator. Nothing allocates per frame.
 */
import * as THREE from 'three';
import { X_AXIS, Y_AXIS, Z_AXIS, clamp } from '../playerCommon.js';
import { kiteClipPose, createKitePose } from './kiteClips.js';

const HANG = {
  /** the bar between the sternum (0) and the chin (1): low in the band, so the bent elbows stay under the shoulders */
  barK: 0.25,
  /** in front of spine_05 (char z). BIBLE §12 wants the bar 0.30-0.40 m in front of the CHEST: at the bar's height
   *  Brea's clothed chest (the Pan I outfit's front) stands 0.156 m ahead of spine_05 and the torso capsule's surface
   *  0.101 m (tools/gates/kite/hang-bench.mjs reads both off the posed meshes), so 0.48 puts the bar 0.32 m in front of
   *  the cloth and 0.38 m in front of the capsule (M3 area B fix 1; 0.32 at M1.3f left it 0.17 m and 0.22 m) */
  barFwd: 0.48,
  /** half the hands' spread on the bar (char x); the kite's grips stand here (surveyKite.js KITE_RECIPE.grip) */
  halfGrip: 0.22,
  /** the shoulders brought forward to reach the bar (rad about char y at each clavicle; 0.45 moves each shoulder
   *  joint 0.05 m forward, and the elbows bend 0.05 m under the shoulders at the bar's reach) */
  protract: 0.45,
  /** the hip and knee bends of a hang (rad): thighs a little forward, shins back under them */
  hip: 0.28, knee: 0.42,
};
const _bar = new THREE.Vector3(), _g = new THREE.Vector3();
const _s5 = new THREE.Vector3(), _nk = new THREE.Vector3(), _hd = new THREE.Vector3();
const _shL = new THREE.Vector3(), _shR = new THREE.Vector3();
/** the chest's square-up, shared down the upper spine (spine_03, _04, _05) */
const SQUARE = [['spine3', 0.3], ['spine4', 0.3], ['spine5', 0.4]];
/** m: the open's first step brings a wrist at least this far in front of the head bone (her facing) and under it */
const START_FRONT = 0.12, START_UNDER = 0.12;
const STATIC = Object.freeze({ state: 'gliding', t: 0, bank: 0, forced: false });

export class HangPose {
  setHangPose(on) { this._hangStatic = !!on; this._hangOn = this._hangStatic || !!(this._kiteFl && this._kiteFl.state !== 'none'); return this._hangOn; }

  /**
   * The clips: the flight state and the seconds in it (the law's FlightBody.t), each step. 'none' ends the layer (the
   * fold has already put the roll back and freed her hands by then).
   * @param {'none' | 'opening' | 'gliding' | 'folding' | 'landing'} state @param {number} t
   * @param {{ bank?: number, forced?: boolean }} [opts]
   */
  setKiteFlight(state, t = 0, { bank = 0, forced = false } = {}) {
    const F = this._kiteFl || (this._kiteFl = { state: 'none', t: 0, bank: 0, forced: false });
    F.state = state; F.t = t; F.bank = bank; F.forced = forced;
    this._hangOn = this._hangStatic || state !== 'none';
    return this._hangOn;
  }

  hangPoseInfo() {
    return this._hangInfo || null;
  }

  /** The hang and the clips, after every body layer and before the twists and the chains. `w` scales the whole layer. */
  _hangLayer(w = 1) {
    const b = this.b;
    if (!b.upArmL || !b.upArmR || !b.spine5 || !b.head) return;
    const F = this._kiteFl && this._kiteFl.state !== 'none' ? this._kiteFl : STATIC;
    const P = this._kitePose || (this._kitePose = createKitePose());
    // the clip's timing first (the body weight), with the bar of the last frame; the bar is solved below on the final
    // chest and the clip's places solved again on it
    kiteClipPose(F.state, F.t, F, this._hangInfo ? _bar.fromArray(this._hangInfo.bar) : _bar.set(0, 1.35, 0.5), P);
    const wb = P.body * w;
    // the legs first (the hang's own bend), so the arms are solved on the final chest
    if (wb > 1e-4) {
      if (b.thighL) this._rot(b.thighL, X_AXIS, -HANG.hip * wb);
      if (b.thighR) this._rot(b.thighR, X_AXIS, -HANG.hip * wb);
      if (b.calfL) this._rot(b.calfL, X_AXIS, HANG.knee * wb);
      if (b.calfR) this._rot(b.calfR, X_AXIS, HANG.knee * wb);
      this.model.updateMatrixWorld(true);
      // the chest squared to the bar: the body layers under it leave the shoulders yawed (about 18 deg, the left
      // shoulder forward, at the idle) and rolled; hanging from a bar held in both hands the shoulder line lies along it
      this._charOf(b.upArmL.bone, _shL); this._charOf(b.upArmR.bone, _shR);
      const dx = _shL.x - _shR.x, yaw = Math.atan2(_shL.z - _shR.z, dx), roll = Math.atan2(_shR.y - _shL.y, dx);
      for (const [k, share] of SQUARE) if (b[k] && this.space) {
        this.space.rotChar(b[k], Y_AXIS, yaw * share * wb, false);
        this.space.rotChar(b[k], Z_AXIS, roll * share * wb, false);
      }
      if (b.clavL && b.clavR && this.space) {
        this.space.rotChar(b.clavL, Y_AXIS, -HANG.protract * wb, false);
        this.space.rotChar(b.clavR, Y_AXIS, HANG.protract * wb, false);
      }
      this.model.updateMatrixWorld(true);
    }
    this._charOf(b.spine5.bone, _s5);
    this._charOf((b.neck1 || b.spine5).bone, _nk);
    this._charOf(b.head.bone, _hd);
    // the chin: a head-bone height below the head joint is the jaw line on this rig (the head bone sits at the skull's base)
    const chinY = _hd.y - 0.02, sternY = _nk.y - 0.08;
    const y = sternY + (chinY - sternY) * clamp(HANG.barK, 0, 1);
    _bar.set(_s5.x, y, _s5.z + HANG.barFwd);
    // the open's first step: where it finds each wrist (the jump's arms), brought in front of her head and under it, is
    // where its path starts, so no step of the open has a hand behind the head plane or over the head
    if (F.state === 'opening' && this._kiteLast !== 'opening') {
      for (const s of ['l', 'r']) {
        const H = P[s];
        this._charOf((s === 'l' ? b.handL : b.handR).bone, H.start);
        H.start.z = Math.max(H.start.z, _hd.z + START_FRONT); H.start.y = Math.min(H.start.y, _hd.y - START_UNDER);
        H.hasStart = true;
      }
    }
    if (F.state !== 'opening') { P.l.hasStart = false; P.r.hasStart = false; }
    this._kiteLast = F.state;
    kiteClipPose(F.state, F.t, F, _bar, P);
    for (const s of ['l', 'r']) {
      const H = P[s], hw = H.w * w;
      if (hw > 1e-4) this._ikArm(s, _g.copy(H.goal), H.pole, hw, null);
    }
    this._curlFingers(this._fingerL, 1.05 * P.l.curl * P.l.w * w, 0.7 * P.l.curl * P.l.w * w);
    this._curlFingers(this._fingerR, 1.05 * P.r.curl * P.r.w * w, 0.7 * P.r.curl * P.r.w * w);
    const I = this._hangInfo || (this._hangInfo = { bar: [0, 0, 0], sternY: 0, chinY: 0, hangBar: [0, 0, 0], kite: { pos: [0, 0, 0], quat: [0, 0, 0, 1], furl: 1, clip: 'glide', phase: 0 } });
    // `bar` is where the kite's origin is (its bar's centre); `hangBar` the hang's own solve (they agree in a glide)
    I.bar[0] = +P.pos.x.toFixed(4); I.bar[1] = +P.pos.y.toFixed(4); I.bar[2] = +P.pos.z.toFixed(4);
    I.hangBar[0] = +_bar.x.toFixed(4); I.hangBar[1] = +_bar.y.toFixed(4); I.hangBar[2] = +_bar.z.toFixed(4);
    I.sternY = +sternY.toFixed(4); I.chinY = +chinY.toFixed(4);
    const K = I.kite;
    K.pos[0] = P.pos.x; K.pos[1] = P.pos.y; K.pos[2] = P.pos.z;
    K.quat[0] = P.quat.x; K.quat[1] = P.quat.y; K.quat[2] = P.quat.z; K.quat[3] = P.quat.w;
    K.furl = P.furl; K.clip = P.clip; K.phase = P.phase;
  }
}
