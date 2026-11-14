/**
 * M1.3b — THE AIM AS A CONSTRAINT RIG (TECH §6). Both arms of the bow aim are solved here, last, on the pose
 * the renderer will draw: after every layer that moves the trunk, the head or the arms, before the twist
 * bones and the chains hang off them.
 *
 *   1. Targets, from the live head and the aim ray. The JAW-CORNER ANCHOR is a point fixed to the head bone
 *      on the skin at the right corner of the jaw (profile `cRig.jaw`, head bind frame). At full draw the
 *      string hand's index knuckle sits `kOut` m off it along the skin's outward normal, the hand turned in
 *      the hook grip (wrist -> knuckles along the arrow and in toward her, palm to her neck). The string sits
 *      in the hook (between index_02 and middle_02), so the nock is there, and the BOW HAND is wherever the
 *      Sabina's own geometry (`bow.restZ`, `bow.pull`, its cant and hang) puts the grip for that nock on the
 *      line to the aim point. At a partial draw the hand rides the string between the bow and the jaw; after
 *      a loose it holds on the jaw, kicks back and OUT, then reaches the hip quiver and returns to the string.
 *   2. The raise and the lowering blend TARGETS (the clip's hand and elbow -> the rig's) by the aim weight,
 *      never bone rotations, so every step is a solve to a constrained point.
 *   3. CONSTRAIN FIRST: each wrist target is put in front of the back of the skull and outside the head and
 *      the wrap where it is at the head's height; each pole is chosen analytically (the draw elbow at the
 *      shoulder's height in the aim frame, swung back and out; the bow elbow down and away from the chest)
 *      and kept off the head's mid-plane behind the skull.
 *   4. SOLVE: analytic two-bone IK per arm (law of cosines, elbow on the pole's half-plane), the hand set to
 *      its grip orientation.
 *   5. VERIFY, never clamp after: the result is checked against the shoulder's swing limits and the
 *      behind-the-head region; a failure is counted and recorded (`debugAimRig().verifyFails`, read by the
 *      gate rows) and the pose is left as solved.
 *
 * No draw during a roll: the rig's weight carries `1 - dodgeW` (the animator's `aimW`), and combat holds the
 * draw at 0 while `player.aiming` is false, which it is for the whole roll (player.js).
 *
 * Installed onto `PlayerAnimator.prototype` (`installMethods`); `this` is the animator. Never constructed.
 */
import * as THREE from 'three';
import { clamp, smoothstep } from './playerCommon.js';

const ARM = ['upArmL', 'loArmL', 'handL', 'upArmR', 'loArmR', 'handR'];
// scratch (module-local, allocation-free per frame)
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _W = new THREE.Vector3(), _T = new THREE.Vector3();
const _r = new THREE.Vector3(), _p = new THREE.Vector3(), _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
const _d = new THREE.Vector3(), _up = new THREE.Vector3(), _lat = new THREE.Vector3(), _bx = new THREE.Vector3();
const _hd = new THREE.Vector3(), _J = new THREE.Vector3(), _K = new THREE.Vector3(), _H = new THREE.Vector3();
const _G = new THREE.Vector3(), _N = new THREE.Vector3(), _Wr = new THREE.Vector3(), _Wl = new THREE.Vector3();
const _Pr = new THREE.Vector3(), _Pl = new THREE.Vector3(), _aim = new THREE.Vector3(), _sk = new THREE.Vector3();
const _kOff = new THREE.Vector3(), _hOff = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _hq = new THREE.Quaternion(), _hqi = new THREE.Quaternion(), _Qr = new THREE.Quaternion(), _Ql = new THREE.Quaternion();
const _un = new THREE.Vector3(), _Qc = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _sS = new THREE.Vector3(), _sE = new THREE.Vector3(), _sT = new THREE.Vector3(), _sW = new THREE.Vector3(), _sr = new THREE.Vector3();
const _sp = new THREE.Vector3(), _se = new THREE.Vector3(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion();
const wrap = (x) => x - Math.round(x / (2 * Math.PI)) * 2 * Math.PI;
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

export class ConstraintAim {
  /** Before the aim layer: the clip's (and the earlier overlays') arm pose, the rig's starting point. */
  _cRigCapture() {
    const C = this._cr || this._cRigInit();
    if (!C) return;
    for (let i = 0; i < 6; i++) C.pre[i].copy(C.e[i].bone.quaternion);
    C.preOk = true;
  }

  /** Once: the rig's bones, the hand frames and the audit. */
  _cRigInit() {
    const b = this.b, R = this.T.cRig;
    if (!R || !b.head || ARM.some((k) => !b[k])) return null;
    const bone = (n) => this.bones[n] || null;
    const C = this._cr = {
      e: ARM.map((k) => b[k]), pre: ARM.map(() => new THREE.Quaternion()), preOk: false,
      knR: bone('index_01_r'), i2R: bone('index_02_r'), m2R: bone('middle_02_r'), mkR: bone('middle_01_r'), pkR: bone('pinky_01_r'),
      mkL: bone('middle_01_l'), ikL: bone('index_01_l'), pkL: bone('pinky_01_l'),
      jaw: new THREE.Vector3().fromArray(R.jaw), out: new THREE.Vector3().fromArray(R.out).normalize(),
      // hand frames in hand-bone local axes: L wrist -> middle knuckle, P the palm's normal (filled on first use)
      Lr: new THREE.Vector3(), Pr: new THREE.Vector3(), Ll: new THREE.Vector3(), Pl: new THREE.Vector3(), framesOk: false,
      // the aim ray and the targets this step (character space), for the gates and the next step
      d: new THREE.Vector3(0, 0, 1), anchor: new THREE.Vector3(), knT: new THREE.Vector3(), hook: new THREE.Vector3(), grip: new THREE.Vector3(),
      hold: 0, lastLooseT: 1, lastRaw: 0, slide: 0, w: 0, gripDef: 0, tw: 0, twist: 0, reachDef: 0, reachDefMax: 0,
      verifyFails: 0, verifyLast: null, solves: 0,
    };
    return C;
  }

  /** The hand's local frame (L, P) from its finger roots: rigid in the hand bone, pose-independent. */
  _cRigFrames() {
    const C = this._cr, b = this.b;
    const loc = (hand, bone, out) => {
      this._charOf(hand.bone, _a); this._charOf(bone, out);
      this._liveW(hand.bone, _q);
      return out.sub(_a).applyQuaternion(_q.invert());
    };
    if (!C.mkR || !C.knR || !C.pkR || !C.mkL || !C.ikL || !C.pkL) return false;
    // right: L to the middle knuckle; across index -> pinky; palm = L x across (T-pose, palms down: -Y)
    loc(b.handR, C.mkR, C.Lr).normalize();
    loc(b.handR, C.knR, _b); loc(b.handR, C.pkR, _c);
    C.Pr.crossVectors(C.Lr, _c.sub(_b)).normalize();
    // left (the mirror image: a reflection turns the cross product round)
    loc(b.handL, C.mkL, C.Ll).normalize();
    loc(b.handL, C.ikL, _b); loc(b.handL, C.pkL, _c);
    C.Pl.crossVectors(_c.sub(_b), C.Ll).normalize();
    C.framesOk = true;
    return true;
  }

  /** Char orientation that takes the hand's local (L, P) onto the char directions (L, P). */
  _cRigHandQ(Lloc, Ploc, L, P, out) {
    _z.copy(L).normalize(); _y.copy(P).addScaledVector(_z, -P.dot(_z)).normalize(); _x.crossVectors(_y, _z);
    _m1.makeBasis(_x, _y, _z);
    _a.copy(Lloc).normalize(); _b.copy(Ploc).addScaledVector(_a, -Ploc.dot(_a)).normalize(); _c.crossVectors(_b, _a);
    _m2.makeBasis(_c, _b, _a).transpose();
    return out.setFromRotationMatrix(_m1.multiply(_m2));
  }

  /** Set a bone's character-space orientation. */
  _cRigSetCharQ(e, Q) {
    this._liveW(e.bone.parent, _qp);
    e.bone.quaternion.copy(_qp.invert().multiply(Q));
  }

  /**
   * Analytic two-bone IK in character space: the wrist onto `W`, the elbow on the half-plane of `pole` (a
   * direction), the hand to `Qh` (char). Returns the reach deficit (m, 0 when reached).
   */
  _cRigSolve(iUp, W, pole, Qh) {
    const C = this._cr, up = C.e[iUp], lo = C.e[iUp + 1], ha = C.e[iUp + 2];
    this._charOf(up.bone, _sS); this._charOf(lo.bone, _sE); this._charOf(ha.bone, _sT);
    const L1 = _sS.distanceTo(_sE), L2 = _sE.distanceTo(_sT);
    _sr.subVectors(W, _sS);
    const want = _sr.length();
    const kMax = iUp === 0 ? (this.T.bowArmLock || 0.9945) : 0.995;
    const dist = clamp(want, Math.abs(L1 - L2) + 0.01, (L1 + L2) * kMax);
    _sr.multiplyScalar(1 / Math.max(want, 1e-6));
    const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    _sp.copy(pole).addScaledVector(_sr, -pole.dot(_sr));
    if (_sp.lengthSq() < 1e-8) _sp.set(0, -1, 0).addScaledVector(_sr, _sr.y);
    _sp.normalize();
    _se.copy(_sS).addScaledVector(_sr, L1 * cosA).addScaledVector(_sp, L1 * sinA);       // the elbow
    _sW.copy(_sS).addScaledVector(_sr, dist);                                            // the wrist as reached
    // upper arm: live direction -> wanted, in character space
    _sa.subVectors(_sE, _sS).normalize(); _sb.subVectors(_se, _sS).normalize();
    _sq.setFromUnitVectors(_sa, _sb);
    this._liveW(up.bone, _sq2); _sq2.premultiply(_sq); this._cRigSetCharQ(up, _sq2);
    // forearm
    this._charOf(lo.bone, _sE); this._charOf(ha.bone, _sT);
    _sa.subVectors(_sT, _sE).normalize(); _sb.subVectors(_sW, _se).normalize();
    _sq.setFromUnitVectors(_sa, _sb);
    this._liveW(lo.bone, _sq2); _sq2.premultiply(_sq); this._cRigSetCharQ(lo, _sq2);
    if (Qh) this._cRigSetCharQ(ha, Qh);
    C.solves++;
    return Math.max(0, want - dist);
  }

  /** The head frame (character space): bone position and live-vs-bind rotation; returns the skull centre. */
  _cRigHead() {
    this._charOf(this.b.head.bone, _hd);
    this._liveW(this.b.head.bone, _hq); _hq.multiply(this.b.head.invW); _hqi.copy(_hq).invert();
    return _sk.copy(this.T.headOff).applyQuaternion(_hq).add(_hd);
  }

  /** A char point in head-ellipsoid units about the skull centre (`_cRigHead` first). */
  _cRigUnit(P, out = _un) {
    out.subVectors(P, _sk).applyQuaternion(_hqi);
    const H = this.T.headR;
    out.x /= H.x; out.y /= H.y; out.z /= H.z;
    return out;
  }

  /** Behind the head: behind the back of the skull within its half-width (shoulders up), or over the crown. */
  _cRigBehind(P, hand = true) {
    const u = this._cRigUnit(P);
    if (Math.abs(u.x) < 1 && u.z > -1.4 && u.z < 0.8 && u.y > 1) return true;
    return u.z < -1 && Math.abs(u.x) < 1 && (u.y >= -1 || (hand && u.y > -2.4 && u.z > -2.5));
  }

  /**
   * CONSTRAIN A WRIST TARGET (before the solve): out of the behind-the-head region (moved forward to the
   * back of the skull's plane and out to the head's half-width), and out of the head itself.
   */
  _cRigConstrain(P, margin) {
    const H = this.T.headR, u = this._cRigUnit(P), mb = this.T.cRig.behindMargin ?? 0.03;
    let moved = false;
    if (u.y > -2.4 && u.y < 1.2 && Math.abs(u.x) < 1 + mb && u.z < -1 + mb && (u.y >= -1 || u.z > -2.5)) {
      // forward to the plane, then out to the side it is on
      u.z = -1 + mb; if (Math.abs(u.x) < 1 + mb && u.y > -1) u.x = (u.x < 0 ? -1 : 1) * (1 + mb);
      moved = true;
    }
    // out of the head, and at the wrap's height out of the wrap with a hand's thickness to spare
    const k = 1 + (u.y > -0.9 ? Math.max(margin, this.T.cRig.wrapK ?? 0.7) : margin);
    const r = Math.hypot(u.x, u.y, u.z);
    if (r < k && r > 1e-6) { u.multiplyScalar(k / r); moved = true; }
    if (moved) { u.x *= H.x; u.y *= H.y; u.z *= H.z; P.copy(u.applyQuaternion(_hq)).add(_sk); }
    return moved;
  }

  /** The hook grip, in the HEAD's frame (the anchor is on her face, so the hand's set on it is the head's at
   *  any pitch): L = wrist -> knuckles along her gaze and in toward her, P = palm to her neck. Into `_q`. */
  _cRigHandGrip() {
    const C = this._cr, R = this.T.cRig;
    _z.set(0, 0, 1).applyQuaternion(_hq);
    _up.set(0, 1, 0).applyQuaternion(_hq);
    _lat.crossVectors(_up, _z).normalize();                                   // her left in the head's frame
    _a.copy(_z).multiplyScalar(R.handL[0]).addScaledVector(_lat, R.handL[1]).addScaledVector(_up, R.handL[2]).normalize();
    _b.copy(_lat).multiplyScalar(R.handP[0]).addScaledVector(_z, R.handP[1]).addScaledVector(_up, R.handP[2]);
    return this._cRigHandQ(C.Lr, C.Pr, _a, _b, _q);
  }

  /** The index knuckle's and the hook's offsets from the wrist for the hand turned to `Q` (the hook rides the
   *  finger curl as posed: the string in the first finger joints, `hookBack` of the way back to the knuckles). */
  _cRigOffsets(Q) {
    const C = this._cr, b = this.b;
    this._liveW(b.handR.bone, _q2); _q2.invert();
    this._charOf(b.handR.bone, _a);
    this._charOf(C.knR, _kOff).sub(_a).applyQuaternion(_q2).applyQuaternion(Q);
    this._charOf(C.i2R, _hOff); this._charOf(C.m2R, _b); _hOff.lerp(_b, 0.5);
    this._charOf(C.knR, _b); this._charOf(C.mkR, _c); _b.lerp(_c, 0.5);
    _hOff.lerp(_b, this.T.cRig.hookBack ?? 0.25).sub(_a).applyQuaternion(_q2).applyQuaternion(Q);
  }

  /** The nock's offset from the bow hand for the arrow `dir` at draw `s` (combat aims the bow's +Z down the
   *  line, +Y off world up; the Sabina hangs `gY` under the hand under a `cant`). */
  _cRigNockOff(dir, s, out) {
    const C = this._cr;
    _up.set(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    _bx.crossVectors(_up, dir).normalize();
    return out.copy(dir).multiplyScalar(C.restZ - C.pull * s + C.gZ)
      .addScaledVector(_up, Math.cos(C.cant) * 0.018 + C.gY).addScaledVector(_bx, -Math.sin(C.cant) * 0.018 + C.gX);
  }

  /**
   * FULL DRAW from the live head: the knuckle on the anchor, the hook where the nock is, and the bow hand where
   * the bow's geometry puts the grip for that nock. Combat aims the bow from the bow hand to the aim point, and
   * the bow hand is the hook less the nock's offset along that very line, so the arrow is the hook -> aim point
   * less the offset's two small cross terms: exact in two steps, with no fixed point to run away when the aim
   * point is near.
   */
  _cRigGrip() {
    const C = this._cr, R = this.T.cRig;
    this._cRigHead();
    _J.copy(C.jaw).applyQuaternion(_hq).add(_hd);
    C.anchor.copy(_J);
    _K.copy(C.out).applyQuaternion(_hq).multiplyScalar(R.kOut).add(_J);
    C.knT.copy(_K);
    this._cRigHandGrip(); _Qr.copy(_q);
    this._cRigOffsets(_Qr);
    _H.copy(_K).sub(_kOff).add(_hOff);                                        // the hook at full draw
    _r.subVectors(_aim, _H);
    if (_r.lengthSq() < 0.36) _r.copy(C.d);
    _d.copy(_r).normalize();
    for (let it = 0; it < 2; it++) {
      this._cRigNockOff(_d, 1, _c).addScaledVector(_d, -_c.dot(_d));         // the cross terms
      _d.copy(_r).add(_c).normalize();
    }
    _G.copy(_H).sub(this._cRigNockOff(_d, 1, _c));                            // the bow hand
  }

  /**
   * THE PASS. `aimW` is the animator's (the aim weight with the roll, death and heavy carry taken out),
   * `drawS` its smoothed draw.
   */
  _cRigPass(aimW, drawS, p) {
    const C = this._cr;
    if (!C || !C.preOk) return;
    C.preOk = false;
    const looseOn = this._looseT < 1;
    const w = aimW;
    C.w = w;
    // a new loose: the string hand holds the draw it loosed from until the quiver beat takes it
    if (this._looseT < C.lastLooseT) C.hold = this._looseDraw ?? 1;
    C.lastLooseT = this._looseT;
    if (w < 0.004) { C.hold = 0; C.tw = 0; C.lastRaw = 0; return; }
    if (!C.framesOk && !this._cRigFrames()) return;
    const R = this.T.cRig, b = this.b, cmb = this.ctx.combat;
    const e = w >= 0.999 ? 1 : smoothstep(w, 0, 1);

    // the bow hand's orientation as the aim layer left it (the stave's grip read), kept
    this._liveW(b.handL.bone, _Ql);
    // ---- the clip's arms: restore, read the hands and elbows the blend starts from
    for (let i = 0; i < 6; i++) C.e[i].bone.quaternion.copy(C.pre[i]);
    this._charOf(b.handR.bone, _Wr); this._charOf(b.loArmR.bone, _Pr);
    this._charOf(b.handL.bone, _Wl); this._charOf(b.loArmL.bone, _Pl);
    this._liveW(b.handR.bone, _Qc);
    // (the clip's elbow as a pole: elbow minus the shoulder -> wrist line, kept as a direction)
    this._charOf(b.upArmR.bone, _S); _r.subVectors(_Wr, _S).normalize(); _Pr.sub(_S); _Pr.addScaledVector(_r, -_Pr.dot(_r));
    this._charOf(b.upArmL.bone, _S); _r.subVectors(_Wl, _S).normalize(); _Pl.sub(_S); _Pl.addScaledVector(_r, -_Pl.dot(_r));

    // ---- the aim frame: from the hook at full draw to the aim point
    this._cRigHead();
    _J.copy(C.jaw).applyQuaternion(_hq).add(_hd);                           // the jaw-corner anchor
    if (cmb?.aimPoint && this.ctx.player?.position) this._charOfWorld(cmb.aimPoint, _aim);
    else _aim.copy(_J).addScaledVector(C.d, 30);
    _d.copy(C.d);
    // the bow: the nock's offset from the bow hand (combat._placeInHand, the Sabina's hang), read live
    const bow = cmb?.bow;
    C.cant = bow?.model?.rotation?.z ?? 0.22;
    C.gX = bow?.model?.position?.x ?? 0; C.gY = bow?.model?.position?.y ?? -0.1; C.gZ = bow?.model?.position?.z ?? 0;
    C.restZ = bow?.restZ ?? 0.055; C.pull = bow?.pull ?? 0.582;
    this._cRigGrip();
    // ---- SPINE TWIST: the trunk turns about the aim's up axis until the bow arm carries the grip all but
    // locked (the bow shoulder onto the arrow line, as an archer stands), and no further than the shoulder's
    // swing limit allows; the neck turns the head back by as much, so the face stays on the arrow. Spread
    // over spine_01..03, smoothed, at most `twistMax`.
    {
      this._charOf(b.upArmL.bone, _S);
      const reach = (this._lenUpL + this._lenLoL) * (this.T.bowArmLock || 0.9945) - (R.twistSpare ?? 0.004);
      _up.set(0, 1, 0).addScaledVector(_d, -_d.y).normalize();
      _a.subVectors(_H, _S);                                                   // v
      _b.copy(_G).sub(_H);                                                     // L d (the grip off the hook)
      const L = _b.length(); _c.copy(_b).multiplyScalar(1 / Math.max(L, 1e-6));
      const vPar = _a.dot(_up);
      _p.copy(_a).addScaledVector(_up, -vPar);                                 // v_perp
      _u1.crossVectors(_up, _p);                                               // a x v_perp
      const A0 = _c.dot(_up) * vPar, Bc = _c.dot(_p), Cs = _c.dot(_u1);
      const cWant = (reach * reach - _a.lengthSq() - L * L) / (2 * L);
      let th = 0;
      // two-sided: the grip at `reach` exactly (the bow arm all but locked), the smallest turn that puts it there
      const cur = A0 + Bc;
      if (Math.abs(cur - cWant) > 0.002) {
        const rho = Math.hypot(Bc, Cs), phi = Math.atan2(Cs, Bc);
        if (rho > 1e-6) {
          const k = (cWant - A0) / rho;
          if (k <= -1) th = wrap(phi + Math.PI);
          else if (k >= 1) th = wrap(phi);
          else {
            const ac = Math.acos(k), t1 = wrap(phi + ac), t2 = wrap(phi - ac);
            th = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
          }
        }
        th = clamp(th, -R.twistMax, R.twistMax);
      }
      // ...and far enough that the bow arm, carrying the grip, stays inside the shoulder's horizontal
      // extension (the swing limit, constrained here before the solve rather than clamped after it)
      {
        const chest = b.spine3 || b.spine2;
        this._liveW(chest.bone, _q); _q.multiply(chest.invW);
        _u2.set(0, 0, 1).applyQuaternion(_q);                                  // the chest's forward (char)
        _a.subVectors(_G, _S).normalize();                                     // the bow arm's reach
        const fPar = _u2.dot(_up);
        _p.copy(_u2).addScaledVector(_up, -fPar); _u1.crossVectors(_up, _p);
        const A1 = _a.dot(_up) * fPar, B1 = _a.dot(_p), C1 = _a.dot(_u1);
        const cMin = -((R.limits?.bow?.back ?? 0.75) - (R.backSpare ?? 0.12));
        if (A1 + B1 * Math.cos(th) + C1 * Math.sin(th) < cMin) {
          const rho = Math.hypot(B1, C1), phi = Math.atan2(C1, B1);
          let tb = 0;
          if (rho > 1e-6) {
            const k = (cMin - A1) / rho;
            if (k >= 1) tb = phi;
            else {
              const ac = Math.acos(Math.max(-1, k));
              const t1 = wrap(phi + ac), t2 = wrap(phi - ac);
              tb = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
            }
          }
          th = clamp(tb, -R.twistMax, R.twistMax);
        }
      }
      const dt = this._dtA || 1 / 60;
      C.tw += (th - C.tw) * (1 - Math.exp(-(R.twistRate ?? 14) * dt));
      const tw = C.tw * e;
      if (Math.abs(tw) > 1e-4) {
        this._rotL(b.spine1, _up, tw / 3); this._rotL(b.spine2, _up, tw / 3); this._rotL(b.spine3, _up, tw / 3);
        if (b.neck1) this._rotL(b.neck1, _up, -tw);
        this._cRigGrip();
      }
      C.twist = tw;
    }
    C.d.copy(_d); C.hook.copy(_H); C.grip.copy(_G);
    // a grip the bow arm cannot reach yet (the trunk still turning onto a steep aim): the nearest it can, and
    // the string rides from there; at full draw the shortfall shows as the knuckle off the jaw, measured
    this._charOf(b.upArmL.bone, _S);
    {
      const reach = (this._lenUpL + this._lenLoL) * (this.T.bowArmLock || 0.9945) - 0.002;
      _a.subVectors(_G, _S); const dG = _a.length();
      C.gripDef = Math.max(0, dG - reach);
      if (dG > reach) _G.copy(_S).addScaledVector(_a, reach / dG);
    }
    // the string hand at this draw: on the string between the bow and the jaw; held on the jaw after a loose
    // (on the STRING's draw, combat's, a step ahead: combat moves the string after this pass)
    const raw = cmb ? clamp(cmb.drawStrength ?? drawS, 0, 1) : drawS;
    const rawNext = raw > C.lastRaw && raw < 1 ? Math.min(1, 2 * raw - C.lastRaw) : raw;
    C.lastRaw = raw;
    const sDraw = Math.max(rawNext, C.hold);
    // at a low draw the string is out at the bow, past the draw arm's reach from its shoulder: the bow comes
    // back along the arrow just far enough for the string hand to hold it, and goes out as the draw builds
    {
      const reachR = (this._lenUpR + this._lenLoR) * 0.97;
      this._charOf(b.upArmR.bone, _S);
      _a.copy(_G).add(this._cRigNockOff(_d, sDraw, _c)).sub(_hOff).sub(_S);
      let slide = 0;
      if (_a.lengthSq() > reachR * reachR) {
        const ud = _a.dot(_d), disc = ud * ud - _a.lengthSq() + reachR * reachR;
        slide = Math.max(0, disc > 0 ? ud - Math.sqrt(disc) : ud);
      }
      C.slide = slide;
      _G.addScaledVector(_d, -slide);
    }
    _N.copy(_G).add(this._cRigNockOff(_d, sDraw, _c));                                  // the nock now
    _T.copy(_N).sub(_hOff);                                                    // the wrist for it
    if (looseOn || C.hold > 0) {
      // the loose: the hand kicks back along the arrow and OUT, away from her face, then settles
      const lk = this._looseT < 0.35 ? smoothstep(this._looseT, 0, 0.35) : 1 - smoothstep(this._looseT, 0.35, 1);
      // (along the arrow's level heading, never up the back of a down aim)
      _a.set(_d.x, 0, _d.z).normalize(); _lat.set(_a.z, 0, -_a.x);
      _T.addScaledVector(_a, -R.kick * lk).addScaledVector(_lat, -R.kick * (R.kickOut ?? 0.8) * lk);
    }
    if (this._looseT >= 1 && C.hold > 0 && this._quiverT >= 0.5) C.hold = 0;
    // the quiver beat (arrow pulled at the raise and after a loose): down to the hip, out to her right
    if (this._quiverT < 1) {
      const AF = this.T.armFlow;
      const tq = this._quiverT;
      const reach = smoothstep(tq, 0, AF?.qUp ?? 0.18) * (1 - smoothstep(tq, AF?.qBack ?? 0.62, 1));
      const qw = reach * (1 - smoothstep(Math.min(drawS, this._prevRawDraw ?? drawS), 0.02, 0.14));
      if (qw > 1e-4) {
        _a.copy(this._quivT || this.T.quiverHip);
        _up.set(0, 1, 0).addScaledVector(_d, -_d.y).normalize(); _lat.crossVectors(_up, _d).normalize();
        _b.set(_d.x, 0, _d.z).normalize();
        _T.lerp(_a, qw * 0.92).addScaledVector(_lat, -R.qOut * 4 * qw * (1 - qw)).addScaledVector(_b, R.qFwd * 4 * qw * (1 - qw));
        _Qr.slerp(_Qc, qw);
      }
    }
    // ---- blend from the clip by the aim weight (targets, not rotations)
    if (e < 1) {
      _T.lerp(_Wr, 1 - e);
      _Qr.slerp(_Qc, 1 - e);                                                  // (the clip's hand)
    }
    _W.copy(_G);
    if (e < 1) _W.lerp(_Wl, 1 - e);
    // the bow hand's grip on the stave: knuckles across it to her right and up, palm to the target
    {
      _up.set(0, 1, 0).addScaledVector(_d, -_d.y).normalize(); _lat.crossVectors(_up, _d).normalize();
      _a.copy(_lat).multiplyScalar(R.bowL[0]).addScaledVector(_up, R.bowL[1]).addScaledVector(_d, R.bowL[2]);
      _b.copy(_d).multiplyScalar(R.bowP[0]).addScaledVector(_lat, R.bowP[1]).addScaledVector(_up, R.bowP[2]);
      this._cRigHandQ(C.Ll, C.Pl, _a, _b, _q);
      this._liveW(b.handL.bone, _q2);                                          // (the clip's hand, restored above)
      _Ql.copy(_q2).slerp(_q, e);
    }

    // ---- CONSTRAIN the targets
    // (on the hand's middle: the wrist and 0.6 of the way to the knuckles in the grip it will take)
    this._cRigOffsets(_Qr);
    if (e < 1) {
      // a raise or a lowering travels out to her side, never across the face or the back of the head
      _up.set(0, 1, 0).addScaledVector(_d, -_d.y).normalize(); _lat.crossVectors(_up, _d).normalize();
      _T.addScaledVector(_lat, -R.blendOut * 4 * e * (1 - e));
      _W.addScaledVector(_lat, R.blendOut * 4 * e * (1 - e));
    }
    this._cRigConstrain(_T, 0.1);
    _a.copy(_T).addScaledVector(_kOff, 0.6); _b.copy(_a);
    if (this._cRigConstrain(_a, 0.15)) _T.add(_a.sub(_b));
    this._cRigConstrain(_W, 0.15);
    // draw pole: the elbow at the shoulder's height in the aim frame, back along the arrow and out
    this._charOf(b.upArmR.bone, _S);
    const L1 = this._lenUpR, L2 = this._lenLoR;
    _r.subVectors(_T, _S); const dist = clamp(_r.length(), Math.abs(L1 - L2) + 0.01, (L1 + L2) * 0.995); _r.normalize();
    const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _up.set(0, 1, 0).addScaledVector(_d, -_d.y).normalize(); _lat.crossVectors(_up, _d).normalize();
    _u1.copy(_up).addScaledVector(_r, -_up.dot(_r));
    let poleOk = false;
    if (_u1.lengthSq() > 1e-6 && sinA > 0.05) {
      _u1.normalize(); _u2.crossVectors(_r, _u1);
      const ku = _u1.dot(_up);
      const want = ((R.elbowH ?? 0.01) / L1 - cosA * _r.dot(_up)) / sinA;
      const cphi = clamp(want / Math.max(ku, 1e-3), -1, 1), sphi = Math.sqrt(1 - cphi * cphi);
      // the side that is back along the arrow and out to her right
      _a.copy(_d).multiplyScalar(-1).addScaledVector(_lat, -0.6);
      const sgn = _u2.dot(_a) >= 0 ? 1 : -1;
      _Pr.lerp(_b.copy(_u1).multiplyScalar(cphi).addScaledVector(_u2, sgn * sphi), e);
      poleOk = true;
    }
    if (!poleOk) _Pr.lerp(_b.copy(_d).multiplyScalar(-1).addScaledVector(_lat, -0.6).addScaledVector(_up, -0.3), e);
    // bow pole: down and away from the chest
    _Pl.lerp(_b.copy(_lat).multiplyScalar(R.bowPole[0]).addScaledVector(_up, R.bowPole[1]).addScaledVector(_d, R.bowPole[2]), e);
    // ...and neither elbow may stand behind the head (the pole turns it out to the side)
    for (let side = 0; side < 2; side++) {
      const iUp = side ? 0 : 3, P = side ? _Pl : _Pr, Tt = side ? _W : _T;
      this._charOf(C.e[iUp].bone, _S);
      const l1 = iUp ? this._lenUpR : this._lenUpL, l2 = iUp ? this._lenLoR : this._lenLoL;
      _r.subVectors(Tt, _S); const dd = clamp(_r.length(), Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.995); _r.normalize();
      const ca = clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1), sa = Math.sqrt(1 - ca * ca);
      for (let k = 0; k < 6; k++) {
        _p.copy(P).addScaledVector(_r, -P.dot(_r)).normalize();
        _E.copy(_S).addScaledVector(_r, l1 * ca).addScaledVector(_p, l1 * sa);
        if (!this._cRigBehind(_E, false)) break;
        P.addScaledVector(_lat, iUp ? -0.5 : 0.5).normalize();
      }
    }

    // ---- SOLVE
    if (C.dbgOn) C.dbg = { T: _T.toArray(), W: _W.toArray(), K: _K.toArray(), H: _H.toArray(), G: _G.toArray(), N: _N.toArray(), Pr: _Pr.toArray(), Pl: _Pl.toArray(), kOff: _kOff.toArray(), hOff: _hOff.toArray(), e };
    C.reachDef = this._cRigSolve(3, _T, _Pr, _Qr);
    const dl = this._cRigSolve(0, _W, _Pl, _Ql);
    C.reachDef = Math.max(C.reachDef, dl);
    if (w > 0.98 && C.reachDef > C.reachDefMax) C.reachDefMax = C.reachDef;

    if (C.dbgOn) { const o = new THREE.Vector3(); C.dbg.after = { hr: this._charOf(b.handR.bone, o).toArray(), er: this._charOf(b.loArmR.bone, o).toArray(), hl: this._charOf(b.handL.bone, o).toArray(), el: this._charOf(b.loArmL.bone, o).toArray() }; }
    // ---- VERIFY (never a clamp): the shoulders' swing limits, nothing behind the head
    this._cRigVerify(w, drawS);
    // the aim layer's diagnostics now describe this rig (the next step's ray starts at this anchor)
    const D = this._aimDbg;
    if (D) { D.anchor.copy(C.hook); this._charOf(b.head.bone, D.headAt); D.d.copy(_d); }
  }

  /** Swing limits (upper arm in the chest's frame) and the behind-the-head region; failures are logged. */
  _cRigVerify(w, drawS) {
    const C = this._cr, b = this.b, L = this.T.cRig.limits;
    let why = null;
    this._cRigHead();
    const chest = b.spine3 || b.spine2;
    this._liveW(chest.bone, _q); _q.multiply(chest.invW); _q.invert();          // char -> chest bind frame
    for (let side = 0; side < 2; side++) {
      const iUp = side ? 0 : 3, lim = side ? L.bow : L.draw, nm = side ? 'bow' : 'draw';
      this._charOf(C.e[iUp].bone, _S); this._charOf(C.e[iUp + 1].bone, _E); this._charOf(C.e[iUp + 2].bone, _T);
      _a.subVectors(_E, _S).normalize().applyQuaternion(_q);
      if (-_a.z > lim.back) why = `${nm} upper arm ${(-_a.z).toFixed(2)} back of the chest (limit ${lim.back})`;
      else if (_a.y > lim.up) why = `${nm} upper arm ${_a.y.toFixed(2)} up (limit ${lim.up})`;
      for (let k = 1; k <= 4; k++) {
        const t = k * 0.25;
        _b.copy(_E).lerp(_T, t);
        if (this._cRigBehind(_b, t === 1)) { why = `${nm} ${t === 1 ? 'wrist' : 'forearm'} behind the head at ${t}`; break; }
      }
      if (why) break;
    }
    if (!why && C.knR) { this._charOf(C.knR, _b); if (this._cRigBehind(_b)) why = 'draw knuckle behind the head'; }
    if (why && w > 0.05) { C.verifyFails++; C.verifyLast = { why, w: +w.toFixed(3), drawS: +drawS.toFixed(3) }; }
  }

  /** Gate read: the rig's state this step and its audit since boot. */
  debugAimRig() {
    const C = this._cr;
    if (!C) return null;
    const v = (x) => [+x.x.toFixed(4), +x.y.toFixed(4), +x.z.toFixed(4)];
    return { on: !!this.T.cRig, w: +C.w.toFixed(4), d: v(C.d), anchor: v(C.anchor), knuckleTarget: v(C.knT), hook: v(C.hook), grip: v(C.grip),
      reachDef: +C.reachDef.toFixed(4), gripDef: +C.gripDef.toFixed(4), twist: +C.twist.toFixed(4), reachDefMax: +C.reachDefMax.toFixed(4), verifyFails: C.verifyFails, verifyLast: C.verifyLast, solves: C.solves };
  }

  /**
   * Combat asks before it looses (Kevin's bar: an arrow only ever leaves a raised, drawn bow): the aim weight
   * and the RENDERED draw, so the arrow leaves the bow the player sees. Profile `cRig.loose`: [aim, draw].
   */
  looseReady() {
    const L = this.T.cRig?.loose;
    if (!L) return true;
    return this._aimW * (1 - this._dodgeW) >= L[0] && this._drawS >= L[1];
  }

  /**
   * Combat aims the bow down the rig's own arrow (world) while the rig is solving, so the string it moves
   * after this pass lands in the hand it was solved for (its aim point moves after the animator: on a
   * camera sweep that is a step of lag, measured 0.06-0.19 m at the string). False: aim as before.
   */
  bowAimDir(out) {
    const C = this._cr;
    if (!C || !this.T.cRig || C.w < 0.004) return false;
    return !!out.copy(C.d).transformDirection(this.model.matrixWorld);
  }

  /** Gate: zero the audit. */
  resetAimAudit() { const C = this._cr; if (C) { C.verifyFails = 0; C.verifyLast = null; C.reachDefMax = 0; } }
}
