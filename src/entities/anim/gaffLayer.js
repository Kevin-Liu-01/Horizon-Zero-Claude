/**
 * THE BOAT GAFF'S HANDLING (Milestone 2 area D, wave 2; the phase tables are handling.js GAFF_DRAW / GAFF_STOW, in
 * seconds of sim time). Installed on PlayerAnimator (installMethods); it runs after the lance layer each step and owns
 * her RIGHT arm while its sequence runs or the gaff is in her hand.
 *
 * One owner at every step ('carry' on its hanger, 'handR'), changed only at the GRIP event (the palm on the grip, the
 * fingers closed: the stowed copy folds and the held one is in her fist, placed by the SAME hand-to-prop map the take
 * was solved from, so it does not move at the change) and the RELEASE event (seated in the frog). Combat only asks
 * (`ctx.combat.gaff.want`, src/combat/gaff.js); the hanger's live line comes from the hero's Oro kit (src/hero/orokit.js,
 * handed to the animator as `this._oroKit` by HeroRig.update).
 *
 * THE HAND ON THE GAFF. The held gaff's group lies in the right hand's frame: its +Z (butt -> beak) on the hand's grip
 * axis `melee.gripDirL` (pinky -> index: the beak stands out above the thumb), its +Y (the hook) on the hand's finger
 * line square to it (the hook stands out in front of the knuckles, toward what she strikes), the grip socket on the
 * fist's haft axis `melee.haftOffL` (the lance's grip: the same radius, 0.017 m). The take's hand orientation is that map
 * read backwards off the stowed gaff's own frame.
 *
 * Kevin's bars: the hands stay at her hips and below her shoulders through every phase (the reach goes round her right
 * hip at belt height, the swing passes her hip), never behind her head.
 */
import * as THREE from 'three';
import { GAFF_DRAW, GAFF_STOW, phaseAt, phaseEnd, ease } from './handling.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _sAx = new THREE.Vector3(), _sHk = new THREE.Vector3();
/** private scratch of _gaffHandQ / _gaffForearm / _gaffReadyQ (callers' scratch never passes through them) */
const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _h3 = new THREE.Vector3(), _f1 = new THREE.Vector3(), _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3();
const _f2 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _r4 = new THREE.Vector3();
const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hq2 = new THREE.Quaternion(), _hq2a = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _ph = [0, 0];
const _sw = { butt: new THREE.Vector3(), tip: new THREE.Vector3(), grip: new THREE.Vector3(), hookC: new THREE.Vector3() };

/** The ready: the right fist beside and in front of her right hip, the haft up and forward, the hook forward. */
const READY = {
  /** the wrist off her right shoulder (char), so a crouch carries it down with her */
  fromShoulder: new THREE.Vector3(-0.115, -0.375, 0.17),
  axis: new THREE.Vector3(-0.28, 0.38, 0.88).normalize(),     // butt -> beak, char: up and forward and a little out (the straight wrist turns it in toward her midline), the beak under her shoulders
  hook: new THREE.Vector3(0.0, -0.35, 1.0).normalize(),       // the hook's side (squared to the axis at use)
  pole: new THREE.Vector3(-0.70, -0.65, -0.30).normalize(),   // the elbow down, out and a little back
};
/** The reach bows out this far to her right (char -x) between where the hand starts and the take: the wrist goes round
 *  her hip, not through it (midway, so it follows her down into a crouch). */
const REACH_OUT = 0.07;
const _viaR = new THREE.Vector3();
/** The swing's bulge: the path from behind her hip to the ready bows out this far to her right (char -x), so the fist and
 *  the gaff pass outside her hip. */
const SWING_OUT = 0.06;
const _via = new THREE.Vector3();
/** The reach's elbow pole: out to her right and back (the elbow leads the hand round the hip). */
const POLE_REACH = new THREE.Vector3(-0.85, -0.15, -0.50).normalize();
/** How far the draw lifts the gaff up its own axis out of the frog before the swing (m), and out from the hip. */
const LIFT = 0.10, OUT = 0.07;
/** Finger curl while open / closing. */
const CURL_OPEN = 0.15;

/** An even pace with soft ends: the share of the path covered at time share `u` (trapezoid velocity, ends `a` long). */
function even(u, a = 0.28) {
  const x = u < 0 ? 0 : u > 1 ? 1 : u, v = 1 / (1 - a);
  if (x < a) return 0.5 * v * x * x / a;
  if (x > 1 - a) return 1 - 0.5 * v * (1 - x) * (1 - x) / a;
  return 0.5 * v * a + v * (x - a);
}
/** The draw's pull-and-swing path at share `s`: up the haft to `lifted` (the first LIFT_SHARE), then round the hip. */
const LIFT_SHARE = 0.2;
function pullSwing(take, lifted, ready, s, out) {
  if (s < LIFT_SHARE) return out.copy(take).lerp(lifted, s / LIFT_SHARE);
  _via.copy(lifted).add(ready).multiplyScalar(0.5); _via.x -= SWING_OUT;
  return bez(lifted, _via, ready, (s - LIFT_SHARE) / (1 - LIFT_SHARE), out);
}

function bez(a, b, c, t, out) {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z);
}

export class GaffLayer {
  /** The sequence's state (built on first use). */
  _gaffState() {
    return this._gf || (this._gf = {
      mode: 0, owner: 'carry', simT: 0, t: 0, T: null, phase: '', k: 0, was: false, w: 0,
      gripAt: -1, releaseAt: -1, readyAt: -1, requestAt: -1, curl: 0, palmMiss: null,
      start: new THREE.Vector3(), startQ: new THREE.Quaternion(),
      take: new THREE.Vector3(), takeQ: new THREE.Quaternion(), grip: new THREE.Vector3(),
      lifted: new THREE.Vector3(), readyQ: new THREE.Quaternion(), readyW: new THREE.Vector3(), readyAx: new THREE.Vector3(),
      wrist: new THREE.Vector3(), handQ: new THREE.Quaternion(), map: null,
    });
  }

  /** Is the gaff in her right hand (owner handR)? */
  gaffInHand() { return this._gf?.owner === 'handR'; }

  /** The handling record for the rows (handling.js makeHandlingInfo().gaff's fields), refilled in place. */
  gaffInfo(out = {}) {
    const G = this._gaffState();
    out.owner = G.owner; out.mode = G.mode; out.phase = G.phase; out.k = G.k; out.t = G.t; out.curl = G.curl;
    out.gripAt = G.gripAt; out.releaseAt = G.releaseAt; out.readyAt = G.readyAt; out.requestAt = G.requestAt; out.palmMiss = G.palmMiss;
    out.w = G.w;
    return out;
  }

  /**
   * The hand-to-prop map, once (the right hand's frame, bind): the prop group's rotation in the hand (+Z on the grip
   * axis, +Y on the finger line square to it) and the grip axis point (metric, hand-local). Null before the lance layer
   * has read the hand.
   */
  _gaffMap() {
    const G = this._gaffState();
    if (G.map) return G.map;
    const ml = this.melee, hb = this.b.handR?.bone;
    if (!ml?.gripDirL || !ml.haftOffL || !hb) return null;
    const mid = hb.children.find((c) => c.isBone && /^middle_01/.test(c.name));
    const gY = ml.gripDirL.clone().normalize();
    const f = mid ? mid.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const gZ = f.addScaledVector(gY, -f.dot(gY)).normalize();     // the hook's side: the finger line, square to the grip
    const gX = new THREE.Vector3().crossVectors(gZ, gY);           // so that (X, Z, Y) is right-handed with +Z = gY
    // group basis in hand-local: group +X = ?, +Y = gZ (hook), +Z = gY (haft)
    const bx = new THREE.Vector3().crossVectors(gZ, gY);           // +Y x +Z = +X
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, gZ, gY));
    void gX;
    // the fingers' true line leans off the grip's square toward the index by beta (~22 deg on Brea's hand)
    const fT = mid ? mid.position.clone().normalize() : gZ.clone();
    G.map = { q, axis: ml.haftOffL.clone(), gY, gZ, sinB: Math.max(-0.7, Math.min(0.7, fT.dot(gY))) };
    return G.map;
  }

  /**
   * The hand's char orientation that holds a gaff whose haft runs `axis` (butt -> beak) with its hook toward `hook`
   * (char, any length; squared here): the map read backwards. Into `out`.
   */
  _gaffHandQ(axis, hook, out) {
    const M = this._gaffMap();
    _h1.copy(axis).normalize();
    _h2.copy(hook); _h2.addScaledVector(_h1, -_h2.dot(_h1));
    if (_h2.lengthSq() < 1e-8) _h2.set(0, 0, 1).addScaledVector(_h1, -_h1.z);
    _h2.normalize();
    _h3.crossVectors(_h2, _h1);
    _hm.makeBasis(_h3, _h2, _h1);                 // the prop group's frame in char
    _hq.setFromRotationMatrix(_hm);               // group -> char
    return out.copy(_hq).multiply(_hq2.copy(M.q).invert());   // hand = group * (hand -> group)^-1
  }

  /**
   * A straight wrist: the gaff's frame for a fist whose TRUE finger line lies on the forearm `F` (unit, char), its haft
   * as near `a0` as that allows. The finger line leans off the hook's square by beta toward the beak:
   * F = cos(beta) hook + sin(beta) axis, axis = sin(beta) F + cos(beta) u (u: a0 squared to F). Into axisOut, hookOut.
   */
  _gaffStraight(F, a0, axisOut, hookOut) {
    const sb = this._gaffMap().sinB, cb = Math.sqrt(1 - sb * sb);
    _r2.copy(a0).addScaledVector(F, -a0.dot(F));
    if (_r2.lengthSq() < 1e-8) _r2.set(0, -1, 0).addScaledVector(F, F.y);
    _r2.normalize();
    axisOut.copy(F).multiplyScalar(sb).addScaledVector(_r2, cb).normalize();
    hookOut.copy(F).addScaledVector(axisOut, -sb).multiplyScalar(1 / cb).normalize();
    return axisOut;
  }

  /** The wrist (hand bone origin, char) that puts the grip socket of a gaff held at hand orientation `q` on `grip`. */
  _gaffWristFor(grip, q, out) {
    const M = this._gaffMap();
    return out.copy(M.axis).applyQuaternion(q).negate().add(grip);
  }

  /** A request edge (combat's want changed). */
  _gaffRequest(want) {
    const G = this._gaffState();
    G.requestAt = G.simT;
    // capture where the hand starts (char): the wrist and the hand's orientation as the earlier layers left them
    this._charOf(this.b.handR.bone, G.start);
    this._liveW(this.b.handR.bone, G.startQ);
    if (want) { G.mode = 1; G.T = GAFF_DRAW.ask; G.takeOk = false; } else { G.mode = 2; G.T = GAFF_STOW.ask; }
    G.t = 0;
  }

  /**
   * The stowed gaff's frame, char: its grip point, its axis (butt -> beak) and its hook side. False when there is no
   * Oro kit on her.
   */
  _gaffStowed(gripOut, axisOut, hookOut) {
    const K = this._oroKit;
    // (the take's frame as the hanger will hold it: the visible copy swings onto it as the hand comes, and while it is in
    // her hand the hanger follows the held one, so the stowed copy's own pose is no target)
    if (!K?.gaffTake || !K.gaffTake(_sw, this.model)) return false;
    _m2.copy(this.model.matrixWorld).invert();
    _sw.butt.applyMatrix4(_m2); _sw.tip.applyMatrix4(_m2);
    axisOut.subVectors(_sw.tip, _sw.butt).normalize();
    const gy = this.ctx.combat?.gaff?.prop?.gripY ?? 0.098;
    gripOut.copy(_sw.butt).addScaledVector(axisOut, gy);
    hookOut.copy(_sw.hookC);
    return true;
  }

  /**
   * Each step after the lance layer. Returns the arm weight it took.
   */
  _gaffLayer(dt) {
    const gaff = this.ctx.combat?.gaff;
    const G = this._gaffState();
    G.simT += dt;
    const b = this.b;
    if (!gaff?.owned || !b.handR || !b.upArmR || !this._gaffMap()) { G.w = 0; return 0; }
    const want = !!gaff.want;
    // the right hand is the lance's while it is out: a draw waits for the lance to be home
    const lanceOut = !!(this.ctx.combat?.melee && (this.ctx.combat.melee.stance !== 'holstered' || this.ctx.combat.melee.lanceInHand));
    if (want !== G.was && !(want && lanceOut && G.owner !== 'handR')) { this._gaffRequest(want); G.was = want; }
    const prop = gaff.prop;
    if (G.mode === 0) {
      if (G.owner !== 'handR') { G.w = 0; G.phase = ''; if (this._oroKit) this._oroKit.tiltK = 0; this._gaffShowHeld(prop, false); return 0; }
      if (this._oroKit) this._oroKit.tiltK = 1;
      // in hand, idle: the fist holds the ready (wave 3 drives it from the verbs)
      this._gaffReadyPose(1, dt);
      G.w = 1;
      this._gaffShowHeld(prop, true);
      return 1;
    }
    G.t += dt;
    const T = G.T;
    phaseAt(T, G.t, _ph);
    const i = _ph[0], k = _ph[1], name = T.phases[i][0];
    G.phase = name; G.k = k;
    // the stowed frame (the take's target), char; the hand's straight-wrist frame at the take is handed to the hanger
    // (it swings the gaff on its strap into it), then the stowed frame is read again with that swing
    const okStow = this._gaffStowed(G.grip, _sAx, _sHk);
    if (okStow && this._oroKit && (G.mode === 1 || G.owner === 'handR' || G.mode === 2)) {
      this._gaffTakeFrame(G.grip, _sAx, this._oroKit.takeAxis, this._oroKit.takeHook, G.takeOk ? G.take : null);
    }
    if (okStow) {
      this._gaffHandQ(_sAx, _sHk, G.takeQ);
      this._gaffWristFor(G.grip, G.takeQ, G.take); G.takeOk = true;
      G.lifted.copy(G.take).addScaledVector(_sAx, -LIFT).add(_v1.set(-OUT, 0, -0.02));
    }
    // the ready
    this._charOf(b.upArmR.bone, G.readyW).add(READY.fromShoulder);
    this._gaffReadyQ(G.readyW, G.readyQ, G.readyAx);
    _v2.copy(G.readyW);
    const W = G.wrist, Q = G.handQ;
    let pole = POLE_REACH, curl = CURL_OPEN, eT = 0;
    const K = this._oroKit;
    if (G.mode === 1) {
      if (name === 'A' || name === 'B') {
        const u = name === 'A' ? 0.2 * k : 0.2 + 0.8 * even(k, 0.22);
        _viaR.copy(G.start).add(G.take).multiplyScalar(0.5); _viaR.x -= REACH_OUT;
        bez(G.start, _viaR, G.take, u, W);
        Q.copy(G.startQ).slerp(G.takeQ, ease(u));
        if (K) K.tiltK = ease(Math.min(1, u * 1.15));
      } else if (name === 'C') {
        W.copy(G.take); Q.copy(G.takeQ); curl = CURL_OPEN + (1 - CURL_OPEN) * ease(k);
        if (K) K.tiltK = 1;
      } else {
        const sP = name === 'D' ? even(k) : 1;
        pullSwing(G.take, G.lifted, _v2, sP, W);
        const sw = sP < LIFT_SHARE ? 0 : (sP - LIFT_SHARE) / (1 - LIFT_SHARE);
        pole = _v1.copy(POLE_REACH).lerp(READY.pole, ease(sw)).normalize();
        this._gaffSwingQ(W, pole, sw, sP, G.takeQ, _sAx, G.readyAx, Q);
        curl = 1;
      }
      // the grip event: the end of C
      eT = phaseEnd(T, 'C');
      if (G.owner !== 'handR' && G.t >= eT) { G.owner = 'handR'; G.gripAt = G.simT; K?.setHeld?.(1); }
    } else {
      // the stow: D back past the hip onto its line over the frog, S seat, C open, A back down her side
      if (name === 'D') {
        const sP = 1 - even(k);
        pullSwing(G.take, G.lifted, _v2, sP, W);
        const sw = sP < LIFT_SHARE ? 0 : (sP - LIFT_SHARE) / (1 - LIFT_SHARE);
        Q.copy(G.takeQ).slerp(G.readyQ, ease(sw));
        pole = _v1.copy(POLE_REACH).lerp(READY.pole, ease(sw)).normalize(); curl = 1;
        if (K) K.tiltK = 1;
      } else if (name === 'S') {
        // (D ended on the lifted line's foot: the seat is the last of the lift, down the haft)
        W.copy(G.take); Q.copy(G.takeQ); curl = 1;
        if (K) K.tiltK = 1;
      } else if (name === 'C') {
        W.copy(G.take); Q.copy(G.takeQ); curl = 1 - (1 - CURL_OPEN) * ease(k);
        // (released: the gaff starts where the held one was, the hanger followed it, and swings back on its strap)
        if (K) K.tiltK = 0;
      } else {
        // back down her side: the arm's weight lets go to the clip; the gaff swings back to hang on its strap
        W.copy(G.take); Q.copy(G.takeQ); curl = CURL_OPEN;
        if (K) K.tiltK = 0;
      }
      eT = phaseEnd(T, 'S');
      if (G.owner === 'handR' && G.t >= eT) {
        G.owner = 'carry'; G.releaseAt = G.simT; K?.setHeld?.(0);
        // a swap to the lance: its draw starts now (the left hand takes it; the right opens and comes down meanwhile)
        if (gaff.after === 'lance') { gaff.after = null; this.ctx.combat?.melee?.drawLance?.(); }
      }
    }
    // the arm's weight: in over the draw's first phase (from the clip's arm), full through the sequence, letting go over
    // the stow's last phase
    let w = 1;
    if (G.mode === 2 && name === 'A') w = 1 - even(k, 0.4);
    else if (G.mode === 1 && name === 'A') w = even(k, 0.4);
    G.w = w;
    if (w > 1e-3) {
      this._ikArm('r', W, pole, w, null);
      this._liveW(b.handR.bone, _q3);
      this.space.setCharQ(b.handR, _q3.slerp(Q, w));
      G.curl = curl;
      const grip = this.melee?.gripR;
      if (grip) this._wrapFingers('r', grip, curl, 0.55 * curl, w);
    }
    // the miss at the grip (W1's palm clause): the grip socket off the solved wrist, after the IK's reach clamp
    if (G.owner === 'handR' || name === 'C') {
      this._charOf(b.handR.bone, _v1); this._liveW(b.handR.bone, _q1);
      _v1.add(_v2.copy(this._gaffMap().axis).applyQuaternion(_q1));
      G.palmMiss = G.owner === 'handR' && G.mode !== 2 ? null : G.palmMiss;
      if (okStow && name === 'C') G.palmMiss = _v1.distanceTo(G.grip);
    }
    this._gaffShowHeld(prop, G.owner === 'handR');
    // the end of the sequence
    if (G.t >= T.total) {
      if (G.mode === 1) G.readyAt = G.simT;
      G.mode = 0; G.phase = '';
    }
    return w;
  }

  /**
   * The frame a straight-wristed right hand closes on at the grip point `grip` (char): the arm's IK elbow for that wrist
   * (the same law of cosines as `_ikArm`, toward the reach's pole), the fist's fingers along the forearm, its grip axis
   * square to the forearm and as near the hanging haft `hang` (butt -> beak) as that allows. Into `axisOut` (the haft,
   * butt -> beak) and `hookOut` (the hook's side: the finger line).
   */
  _gaffTakeFrame(grip, hang, axisOut, hookOut, wristPrev = null) {
    const b = this.b, _v1 = _f1, _v2 = _r1, _v3 = _r2;
    this._charOf(b.upArmR.bone, _v1);
    const L1 = this._lenUpR || 0.233, L2 = this._lenLoR || 0.242;
    // the wrist: last step's take wrist (the frame converges on itself), else ~ the palm's offset short of the grip
    if (wristPrev) { this._gaffForearm(wristPrev, POLE_REACH, _f2); return this._gaffStraight(_f2, hang, axisOut, hookOut); }
    _v2.subVectors(grip, _v1);
    const d0 = _v2.length();
    const dLen = Math.min(Math.max(d0 - 0.06, 0.05), (L1 + L2) * 0.985);
    _v2.normalize();
    const wx = _v1.x + _v2.x * dLen, wy = _v1.y + _v2.y * dLen, wz = _v1.z + _v2.z * dLen;
    const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + dLen * dLen - L2 * L2) / (2 * L1 * dLen))));
    _v3.copy(POLE_REACH).addScaledVector(_v2, -POLE_REACH.dot(_v2)).normalize();
    // elbow = shoulder + L1 (cos A dir + sin A pole)
    const ex = _v1.x + L1 * (Math.cos(A) * _v2.x + Math.sin(A) * _v3.x), ey = _v1.y + L1 * (Math.cos(A) * _v2.y + Math.sin(A) * _v3.y), ez = _v1.z + L1 * (Math.cos(A) * _v2.z + Math.sin(A) * _v3.z);
    _f2.set(wx - ex, wy - ey, wz - ez).normalize();               // the forearm: the fingers continue it
    return this._gaffStraight(_f2, hang, axisOut, hookOut);
  }

  /**
   * The ready's hand orientation for a wrist at `wrist` (char): the fist straight on the forearm the ready's elbow pole
   * gives (the fingers on its line), the haft square to it and as near READY.axis as that allows (into `out`).
   */
  _gaffReadyQ(wrist, out, axisOut = null) {
    this._gaffForearm(wrist, READY.pole, _r1);
    this._gaffStraight(_r1, READY.axis, _r3, _r4);
    if (axisOut) axisOut.copy(_r3);
    return this._gaffHandQ(_r3, _r4, out);
  }

  /**
   * The fist along the swing (draw D, stow D): straight on the forearm the IK gives for the wrist `W` toward `pole`,
   * the haft between the take's line and the ready's (`sw` 0..1) squared to that forearm. Eased in from the take's
   * exact frame over the first quarter of the path (`sP`), so the grip and the release frames are the take's. Into Q.
   */
  _gaffSwingQ(W, pole, sw, sP, takeQ, takeAx, readyAx, Q) {
    this._gaffForearm(W, pole, _r1);
    _f2.copy(takeAx).lerp(readyAx, ease(sw)).normalize();
    this._gaffStraight(_r1, _f2, _r3, _r4);
    this._gaffHandQ(_r3, _r4, _hq2a);
    return Q.copy(_hq2a);
  }

  /** The forearm's line (elbow -> wrist, unit, char) the arm's IK gives for a wrist at `wrist` toward `pole`. */
  _gaffForearm(wrist, pole, out) {
    const S = this._charOf(this.b.upArmR.bone, _f1);
    const L1 = this._lenUpR || 0.233, L2 = this._lenLoR || 0.242;
    out.subVectors(wrist, S);
    const dLen = Math.min(Math.max(out.length(), 0.05), (L1 + L2) * 0.985);
    out.normalize();
    const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + dLen * dLen - L2 * L2) / (2 * L1 * dLen))));
    const _v1 = S;
    const px = pole.x - out.x * pole.dot(out), py = pole.y - out.y * pole.dot(out), pz = pole.z - out.z * pole.dot(out);
    const pl = Math.hypot(px, py, pz) || 1;
    const ex = _v1.x + L1 * (Math.cos(A) * out.x + Math.sin(A) * px / pl), ey = _v1.y + L1 * (Math.cos(A) * out.y + Math.sin(A) * py / pl), ez = _v1.z + L1 * (Math.cos(A) * out.z + Math.sin(A) * pz / pl);
    const wx = _v1.x + out.x * dLen, wy = _v1.y + out.y * dLen, wz = _v1.z + out.z * dLen;
    return out.set(wx - ex, wy - ey, wz - ez).normalize();
  }

  /** In hand at the ready (mode 0, owner handR). */
  _gaffReadyPose(w, dt) {
    const b = this.b, G = this._gaffState();
    this._charOf(b.upArmR.bone, _v2).add(READY.fromShoulder);
    // a little of the stride in the carried fist
    const sw = Math.sin((this.loco?.phase ?? 0) * Math.PI * 2) * 0.03 * (this._moveW || 0);
    _v2.z += sw; _v2.y += Math.abs(sw) * 0.3;
    this._gaffReadyQ(_v2, G.readyQ);
    this._ikArm('r', _v2, READY.pole, w, null);
    this._liveW(b.handR.bone, _q3);
    this.space.setCharQ(b.handR, _q3.slerp(G.readyQ, w));
    G.curl = 1;
    const grip = this.melee?.gripR;
    if (grip) this._wrapFingers('r', grip, 1, 0.55, w);
    void dt;
  }

  /** Show (or hide) the held gaff in her right fist, placed by the hand-to-prop map. */
  _gaffShowHeld(prop, on) {
    const g = prop?.group;
    if (!g) return;
    // (the hanger follows the held gaff unseen while it is in her hand: orokit.js `follow`)
    if (this._oroKit) this._oroKit.follow = on && prop.inner ? prop.inner.children[0] ?? null : null;
    const hb = this.b.handR?.bone;
    if (!on || !hb || !prop.inner) { if (g.visible) g.visible = false; return; }
    if (g.parent !== hb) hb.add(g);
    const M = this._gaffMap();
    // the bone's own scale (the rig's units): metric offsets are divided by it, the prop scaled back up
    hb.updateWorldMatrix(true, false);
    const e = hb.matrixWorld.elements;
    const s = Math.hypot(e[0], e[1], e[2]) / (this.model.matrixWorld.elements[0] ** 2 + this.model.matrixWorld.elements[1] ** 2 + this.model.matrixWorld.elements[2] ** 2) ** 0.5 || 1;
    g.quaternion.copy(M.q);
    // the grip socket on the fist's haft axis: butt = axis point - gripY along the haft
    g.position.copy(M.gY).multiplyScalar(-prop.gripY).add(M.axis).multiplyScalar(1 / s);
    g.scale.setScalar(1 / s);
    g.visible = true;
  }
}
