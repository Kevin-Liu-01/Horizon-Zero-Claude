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
import { kiteClipPose, createKitePose, READY_L, READY_R, POLE_READY_L, POLE_READY_R, AFTER_VIA_R, viaWay, CLIP_S, KITE_BEATS } from './kiteClips.js';

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
/** the bones the hang takes from the pose under it to their bind pose before its own bend (pelvis first) */
const LEGS = ['pelvis', 'spine1', 'thighL', 'thighR', 'calfL', 'calfR', 'footL', 'footR'];
/** m: the open's first step brings a wrist at least this far in front of the head bone (her facing) and under it */
const START_FRONT = 0.12, START_UNDER = 0.12;
const STATIC = Object.freeze({ state: 'gliding', t: 0, bank: 0, forced: false });
/**
 * HANDS FREE AFTER THE FOLD (M3 area B fix round 1). The fold's last step does not hand her arms back to her own pose:
 * in the air that pose is the jump's fall, whose right wrist rides 0.09-0.13 m behind the head plane (the judge's read at
 * 949aa01), and a weight faded over the fold's last 0.14 moved the wrist 0.19-0.24 m in 1-2 steps. So the kite's layer
 * stays on after `flight` turns 'none': airborne, both hands are held low in front of her belly (READY_L, READY_R) for as
 * long as she falls; on the ground, after `settleS`, each hand goes to her own pose's wrist brought in front of her head
 * and under it (`front`, `under`) and the layer then fades out over `fadeS`. The goal moves from where the fold left it
 * over `goalS` (a smoothstep: the wrist moves at most ~0.03 m a step).
 */
const AFTER = Object.freeze({ goalS: 0.3, viaS: 0.45, settleS: 0.4, fadeS: 0.5, front: 0.1, under: 0.12, lowBehind: 0.31 });
const _u = new THREE.Vector3();
/** s: a clip changed mid-way blends from the last clip's pose over this (smoothstep) */
const XFADE_S = 0.2;
/** m: the most a wrist's IK goal moves in one step (W1's 0.08, with a margin: handling.js RATE.wristM's 0.075; wave 2b,
 *  was 0.07: the hand's road to the mount and back is 1.4-1.8 m in the open's 36 steps and the fold's 24) */
const GOAL_STEP = 0.078;
const _pl = new THREE.Vector3(), _pr = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _qPlan = new THREE.Quaternion();
const _ua = new THREE.Vector3(), _va = new THREE.Vector3(), _pPlan = new THREE.Vector3(), _ml = new THREE.Vector3();
const sst = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

export class HangPose {
  setHangPose(on) { this._hangStatic = !!on; this._hangOn = this._hangStatic || !!(this._kiteFl && this._kiteFl.state !== 'none') || !!this._kiteAfter; return this._hangOn; }

  /**
   * The clips: the flight state and the seconds in it (the law's FlightBody.t), each step. 'none' ends the layer (the
   * fold has already put the roll back and freed her hands by then).
   * @param {'none' | 'opening' | 'gliding' | 'folding' | 'landing'} state @param {number} t
   * @param {{ bank?: number, forced?: boolean }} [opts]
   */
  setKiteFlight(state, t = 0, { bank = 0, forced = false } = {}) {
    const F = this._kiteFl || (this._kiteFl = { state: 'none', t: 0, bank: 0, forced: false });
    // the fold (or the landing's fold) ending: the hands are handed back by the after-layer, never dropped
    if (state === 'none' && (F.state === 'folding' || F.state === 'landing') && this._kitePose) {
      const A = this._kiteAfter || (this._kiteAfter = { t: 0, groundT: -1, l: new THREE.Vector3(), r: new THREE.Vector3(), lw: 0, rw: 0 });
      A.t = 0; A.groundT = -1;
      A.l.copy(this._kitePose.l.goal); A.r.copy(this._kitePose.r.goal); A.lw = this._kitePose.l.w; A.rw = this._kitePose.r.w;
      // (wave 2b: the fold ends with her right hand at the mount, at the small of her back: it comes round her right hip)
      A.viaR = A.r.z < -0.05;
    } else if (state !== 'none') this._kiteAfter = null;
    F.state = state; F.t = t; F.bank = bank; F.forced = forced;
    // (the next open starts fresh: no cross-fade from a clip that ended before this one)
    if (state === 'none') { this._kiteLast = 'none'; if (this._kiteX) this._kiteX.on = false; if (this._kiteGoal) this._kiteGoal.ok = false; }
    this._hangOn = this._hangStatic || state !== 'none' || !!this._kiteAfter;
    return this._hangOn;
  }

  hangPoseInfo() {
    return this._hangInfo || null;
  }

  /** the palm's offset from the wrist (char frame, 0.7 of wrist to middle knuckle) of each hand as posed now */
  _kitePalmRead(PO) {
    const b = this.b;
    if (!PO.ml || !PO.mr) { PO.l.set(0, 0, 0); PO.r.set(0, 0, 0); PO.ok = true; return; }
    this._charOf(b.handL.bone, _u); this._charOf(PO.ml, PO.l); PO.l.sub(_u).multiplyScalar(0.7);
    this._charOf(b.handR.bone, _u); this._charOf(PO.mr, PO.r); PO.r.sub(_u).multiplyScalar(0.7);
    PO.ok = true;
  }

  /** the after-layer's weight now (0 when her own pose has her hands), for a bench */
  kiteAfterWeight() { return this._kiteAfter ? this._kiteAfter.w ?? 1 : 0; }

  /** Hands free after the fold (AFTER above): held in front while she falls, handed to her own pose on the ground. */
  _kiteAfterLayer(w) {
    const A = this._kiteAfter, b = this.b, p = this.ctx.player, dt = this._dtA || 1 / 60;
    A.t += dt;
    const air = !!p && p.grounded === false;
    if (!air && A.groundT < 0) A.groundT = A.t;
    const g0 = A.groundT < 0 ? Infinity : Math.max(A.groundT + AFTER.settleS, AFTER.goalS);
    const fade = A.groundT < 0 ? 1 : 1 - sst(g0, g0 + AFTER.fadeS, A.t);
    A.w = fade;
    this._charOf(b.head.bone, _hd);
    const own = A.groundT < 0 ? 0 : sst(A.groundT, g0, A.t);
    for (const s of ['l', 'r']) {
      // (the right hand's way round her hip from the mount is ~0.9 m: over AFTER.viaS, W1's wrist bar)
      const u = sst(0, s === 'r' && A.viaR ? AFTER.viaS : AFTER.goalS, A.t);
      // the hand's place: low in front of her belly (in the air), then her own pose's wrist brought in front of her
      // head and under it (on the ground)
      _g.copy(s === 'l' ? READY_L : READY_R);
      if (own > 0) {
        this._charOf((s === 'l' ? b.handL : b.handR).bone, _u);
        _u.z = Math.max(_u.z, _hd.z + AFTER.front); _u.y = Math.min(_u.y, _hd.y - AFTER.under);
        _g.lerp(_u, own);
      }
      if (s === 'r' && A.viaR) { _u.copy(_g); viaWay(A.r, AFTER_VIA_R, _u, u, _g); }
      else _g.lerp(s === 'l' ? A.l : A.r, 1 - u);
      // (and always under her head: in front of it, `under`; not in front of it, `lowBehind` (0.31 m: Kevin's bar as the
      //  clip bench reads it, no wrist behind a head plane within 0.30 m of its height). A hard landing's crouch brings
      //  her head over her hands. Wave 2b: a hand coming round from the small of her back is held low, never pulled
      //  through her body to the front: a z clamp there threw the wrist 0.56 m in one step as her head came down)
      if (_g.z < _hd.z + AFTER.front) _g.y = Math.min(_g.y, _hd.y - AFTER.lowBehind);
      else _g.y = Math.min(_g.y, _hd.y - AFTER.under);
      // (a hand the fold had already let go keeps its fold weight until the goal has arrived)
      const hw = fade * (A[s + 'w'] + (1 - A[s + 'w']) * u) * w;
      if (hw > 1e-4) this._ikArm(s, _g, s === 'l' ? POLE_READY_L : POLE_READY_R, hw, null);
    }
    this._curlFingers(this._fingerL, 0.35 * fade * w, 0.25 * fade * w);
    this._curlFingers(this._fingerR, 0.35 * fade * w, 0.25 * fade * w);
    if (fade <= 1e-3) { this._kiteAfter = null; this._hangOn = this._hangStatic || !!(this._kiteFl && this._kiteFl.state !== 'none'); }
  }

  /** The hang and the clips, after every body layer and before the twists and the chains. `w` scales the whole layer. */
  _hangLayer(w = 1) {
    const b = this.b;
    if (!b.upArmL || !b.upArmR || !b.spine5 || !b.head) return;
    if (this._kiteAfter && !this._hangStatic && !(this._kiteFl && this._kiteFl.state !== 'none')) { this._kiteAfterLayer(w); return; }
    const F0 = this._kiteFl && this._kiteFl.state !== 'none' ? this._kiteFl : STATIC;
    // (wave 2b: the forced reef (R5) taken before both hands have set the roll finishes the set first: the open plays on
    //  from where it was to both hands on the bar, then the reef cross-fades from there; at 9d1acc3 the cross-fade from a
    //  roll half round her hip put a palm 0.056-0.064 m off the bar)
    const EF = this._kiteEff || (this._kiteEff = { state: 'none', t: 0, bank: 0, forced: false, fin: null, openT: 0, back: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, furl0: 1 });
    // (wave 2b: spine_02's live place: the mount and the road's first keys ride her back, kiteClips.js BACK_REF)
    if (b.spine2) { this._charOf(b.spine2.bone, EF.back.p); this._liveW(b.spine2.bone, EF.back.q); } else EF.back = null;
    EF.bank = F0.bank; EF.forced = F0.forced; EF.state = F0.state; EF.t = F0.t;
    if (F0.state === 'opening') { EF.fin = null; EF.openT = F0.t; }
    else if (F0.state === 'folding' && F0.forced) {
      // (to the open's end: from there the reef is the glide's, with no cross-fade; a cross-fade from the set, the kite
      //  pitched over her hands, stood the half-furled cells up through her face's column)
      const setT = CLIP_S.open;
      if (!EF.fin && this._kiteLast === 'opening' && EF.openT < setT) EF.fin = { t0: EF.openT, dur: setT - EF.openT };
      if (EF.fin) { if (F0.t < EF.fin.dur) { EF.state = 'opening'; EF.t = EF.fin.t0 + F0.t; } else EF.t = F0.t - EF.fin.dur; }
    } else EF.fin = null;
    const F = EF;
    const P = this._kitePose || (this._kitePose = createKitePose());
    // (P still holds the last step's pose here: on a change of clip mid-way it is the cross-fade's start, the body's
    //  weight included)
    // (wave 2b: the fold and the landing start from the glide's own pose and the glide from the open's last, so they take
    //  no cross-fade: at 9d1acc3 the glide's open kite, cross-faded into the fold over 0.2 s, held the half-furled cells
    //  up in front of her face at 0.30 of the fold. A landing from the reef starts from the reef's furl, `furl0`)
    const seamless = (this._kiteLast === 'gliding' && (F.state === 'landing' || F.state === 'folding'))
      || (this._kiteLast === 'opening' && (F.state === 'gliding' || (F.state === 'folding' && F.forced)))
      || (this._kiteLast === 'folding' && F.state === 'landing');
    // (a landing from the reef starts from the reef's furl and its bar, a hand lower)
    if (F.state !== this._kiteLast) { const r = F.state === 'landing' && this._kiteLast === 'folding'; EF.furl0 = r ? P.furl : 1; EF.drop0 = r ? 0.05 : 0; }
    F.furl0 = EF.furl0; F.drop0 = EF.drop0 || 0; if (F.drop0 > 0) F.bank = 0;
    if (F.state !== this._kiteLast && this._kiteLast && this._kiteLast !== 'none' && !seamless) {
      const X = this._kiteX || (this._kiteX = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), furl: 0, l: new THREE.Vector3(), r: new THREE.Vector3(), lw: 0, rw: 0, body: 0, t0: 0, on: false });
      X.pos.copy(P.pos); X.quat.copy(P.quat); X.furl = P.furl; X.l.copy(P.l.goal); X.r.copy(P.r.goal); X.lw = P.l.w; X.rw = P.r.w; X.body = P.body; X.t0 = F.t; X.on = true;
      X.lh = !!P.l.hold; X.rh = !!P.r.hold;
    } else if (F.state !== this._kiteLast && this._kiteX) this._kiteX.on = false;
    const xk = this._kiteX && this._kiteX.on ? sst(0, XFADE_S, F.t - this._kiteX.t0) : 1;
    // the clip's timing first (the body weight), with the bar of the last frame; the bar is solved below on the final
    // chest and the clip's places solved again on it
    kiteClipPose(F.state, F.t, F, this._hangInfo ? _bar.fromArray(this._hangInfo.bar) : _bar.set(0, 1.35, 0.5), P);
    if (xk < 1) P.body = this._kiteX.body + (P.body - this._kiteX.body) * xk;
    const wb = P.body * w;
    // the legs first (the hang's own bend), so the arms are solved on the final chest
    if (wb > 1e-4) {
      // (fix round 1, the judge's FIX LIST 8: the hang's legs and hips are the hang's own, not the jump's under it: the
      //  pelvis and both legs are taken to their bind pose by the body weight first, so no knee stays raised in the jump
      //  pose and the hips are square under the chest, then the hang's even bend is added)
      for (const k of LEGS) if (b[k] && b[k].bindQ) b[k].bone.quaternion.slerp(b[k].bindQ, wb);
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
    // a change of clip mid-way (the forced reef from the open, the landing from a glide) starts from where the last
    // clip left the kite and her hands, not from the new clip's own first pose: XFADE_S of smoothstep (fix round 1:
    // the reef taken at 0.57 of the open moved her right wrist 0.35 m in one step)
    this._kiteLast = F.state;
    if (F.back && b.spine2) { this._charOf(b.spine2.bone, F.back.p); this._liveW(b.spine2.bone, F.back.q); }
    kiteClipPose(F.state, F.t, F, _bar, P);
    if (this._kiteX && this._kiteX.on) {
      const X = this._kiteX, k = sst(0, XFADE_S, F.t - X.t0);
      if (k >= 1) X.on = false;
      else {
        P.pos.lerpVectors(X.pos, P.pos, k); P.quat.slerpQuaternions(X.quat, P.quat, k); P.furl = X.furl + (P.furl - X.furl) * k;
        P.l.goal.lerpVectors(X.l, P.l.goal, k); P.r.goal.lerpVectors(X.r, P.r.goal, k);
        P.l.w = X.lw + (P.l.w - X.lw) * k; P.r.w = X.rw + (P.r.w - X.rw) * k; P.body = X.body + (P.body - X.body) * k;
        // (wave 2b: a hand that holds in both clips stays on its socket of the blended kite, not on a blend of the two
        //  sockets: the bar's turn is slerped, the hands' goals were lerped, and the palm left the bar)
        for (const s of ['l', 'r']) if (P[s].hold && X[s + 'h']) P[s].goal.copy(P[s].loc).applyQuaternion(P.quat).add(P.pos);
      }
    }
    // the clips place her PALM (0.7 of wrist to middle knuckle, as the handling rows read a palm) on the goal, not her
    // wrist: the IK's goal is the clip's less the palm's offset from the wrist on the last step's solved hand (fix round
    // 1: with the wrist on the grip the palm stood 0.081 m off the bar against W1's 0.010)
    const PO = this._kitePalm || (this._kitePalm = { l: new THREE.Vector3(), r: new THREE.Vector3(), ok: false,
      ml: this.model.getObjectByName('middle_01_l'), mr: this.model.getObjectByName('middle_01_r') });
    if (!PO.ok || F.state === 'opening' && F.t <= 1e-6) this._kitePalmRead(PO);
    // (and the wrist's goal moves at most GOAL_STEP a step: W1's wrist bar, 0.08 m a step outside a swing, held where
    //  the body itself moves under the bar, as at the touchdown's crouch)
    const GL = this._kiteGoal || (this._kiteGoal = { l: new THREE.Vector3(), r: new THREE.Vector3(), ok: false });
    const fresh = !GL.ok || (F.state === 'opening' && F.t <= 1e-6);
    for (const s of ['r', 'l']) {
      const H = P[s], hw = H.w * w;
      _g.copy(H.goal).sub(PO[s]);
      if (!fresh) _g.sub(GL[s]).clampLength(0, GOAL_STEP).add(GL[s]);
      GL[s].copy(_g);
      if (hw > 1e-4) this._ikArm(s, _g, H.pole, hw, null);
    }
    GL.ok = true;
    this._kitePalmRead(PO);
    // WAVE 2b: THE KITE IS WHERE HER HANDS ARE. From the take to the seat the roll (and the bar) is placed from her solved
    // palms, never on its own road: from the right palm alone (its socket on the roll, the plan's turn) while she carries
    // it, from both palms (the bar's axis through both sockets, the plan's turn about it) once both hold it. `carry` and
    // `two` are the clip's weights (kiteClips.js); the plan's own place is kept for the bench (`plan`).
    _pPlan.copy(P.pos); _qPlan.copy(P.quat);
    if (P.carry > 1e-4 && w > 1e-4) {
      this._charOf(b.handR.bone, _pr).add(PO.r); this._charOf(b.handL.bone, _pl).add(PO.l);
      // one hand: the right palm on its socket
      _q1.copy(P.quat); _c1.copy(P.r.loc).applyQuaternion(_q1); _c1.subVectors(_pr, _c1);
      if (P.two > 1e-4) {
        // both: the plan's socket-to-socket line turned onto the palms' line, its middle on theirs
        _ua.subVectors(P.l.loc, P.r.loc).applyQuaternion(P.quat).normalize();
        _va.subVectors(_pl, _pr);
        if (_va.lengthSq() > 1e-6) _dq.setFromUnitVectors(_ua, _va.normalize()); else _dq.identity();
        _q2.copy(_dq).multiply(P.quat);
        _ml.addVectors(P.l.loc, P.r.loc).multiplyScalar(0.5).applyQuaternion(_q2);
        _c2.addVectors(_pl, _pr).multiplyScalar(0.5).sub(_ml);
        _c1.lerp(_c2, P.two); _q1.slerp(_q2, P.two);
      }
      const k = Math.min(1, P.carry * w);
      P.pos.lerp(_c1, k); P.quat.slerp(_q1, k);
    }
    this._curlFingers(this._fingerL, 1.05 * P.l.curl * P.l.w * w, 0.7 * P.l.curl * P.l.w * w);
    this._curlFingers(this._fingerR, 1.05 * P.r.curl * P.r.w * w, 0.7 * P.r.curl * P.r.w * w);
    const I = this._hangInfo || (this._hangInfo = { bar: [0, 0, 0], sternY: 0, chinY: 0, hangBar: [0, 0, 0], kite: { pos: [0, 0, 0], quat: [0, 0, 0, 1], furl: 1, clip: 'glide', phase: 0, plan: [0, 0, 0], carry: 0, two: 0, hold: { l: null, r: null }, loc: { l: [0, 0, 0], r: [0, 0, 0] }, back: { l: false, r: false } } });
    // `bar` is where the kite's origin is (its bar's centre); `hangBar` the hang's own solve (they agree in a glide)
    I.bar[0] = +P.pos.x.toFixed(4); I.bar[1] = +P.pos.y.toFixed(4); I.bar[2] = +P.pos.z.toFixed(4);
    I.hangBar[0] = +_bar.x.toFixed(4); I.hangBar[1] = +_bar.y.toFixed(4); I.hangBar[2] = +_bar.z.toFixed(4);
    I.sternY = +sternY.toFixed(4); I.chinY = +chinY.toFixed(4);
    const K = I.kite;
    K.pos[0] = P.pos.x; K.pos[1] = P.pos.y; K.pos[2] = P.pos.z;
    K.quat[0] = P.quat.x; K.quat[1] = P.quat.y; K.quat[2] = P.quat.z; K.quat[3] = P.quat.w;
    K.furl = P.furl; K.clip = P.clip; K.phase = P.phase;
    K.plan[0] = _pPlan.x; K.plan[1] = _pPlan.y; K.plan[2] = _pPlan.z; K.carry = P.carry; K.two = P.two;
    K.hold.l = P.l.hold; K.hold.r = P.r.hold; P.l.loc.toArray(K.loc.l); P.r.loc.toArray(K.loc.r); K.back.l = P.l.back; K.back.r = P.r.back;
  }
}
