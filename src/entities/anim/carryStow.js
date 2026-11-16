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
  KEY, X_AXIS, Y_AXIS, Z_AXIS, _grip, _pole, _q1, clamp, damp,
} from './playerCommon.js';
import { BOW_UNSTOW, BOW_STOW, CURL, RATE, KEEPER_SLIDE, phaseAt, phaseEnd, ease, makeHandlingInfo } from './handling.js';
import { SOCKETS } from '../../hero/sockets.js';
import { setPropCap, clearPropCap } from './cloth/propCaps.js';

/*
 * THE BOW'S STOW AND UNSTOW (BIBLE §5.2; M1a weapons step 1, Kevin Nov 15: "the animations for grabbing weapons,
 * unsheathing them and getting them into position ... need to be improved a lot"). "The bow hand reaches back at waist
 * height, takes the lower limb below the shoulder blade and draws the bow down and forward past the hip. Never over the
 * shoulder." Character space (+X her left, +Z forward).
 *
 * Round 2 lerped the bow from combat's own back pose (not the kit's Sabina she wears: 0.63 m and 59 deg apart, so the
 * bow popped at the grab, W0 at 0d3feb5) to the carry while the closed fist held a point 0.22 m off it, and the fingers
 * shut in one step. Now the bow has ONE owner at every step (`handling.js`): it sits in its keeper on her back (the
 * kit's own Sabina, its frame read off the kit's mesh) until the open hand is on its lower limb and has closed (the GRIP
 * event); then it slides 0.10 m down its own limb out of the keeper, pivots about the fist down and forward past the hip,
 * and the limb runs through the loosened fist to the riser as she brings it to the low carry, where combat's carry
 * takes it with no step. The stow is the reverse, seated up its axis into the keeper before the RELEASE event. The
 * hand's grip axis (pinky to index) lies along the stave from the reach on; the bow turns at most 9.5 deg a step.
 * Times are seconds of sim time on `handling.js`'s tables (the animator's dt, never the wall clock).
 */
const BOW_SIDE = [0.31, 1.00, -0.15];      // beside the left hip, a little back: the way round to the back and out
const BOW_PAST_HIP = [0.33, 0.92, -0.07];  // the draw down and forward past the hip
/** the left elbow on the reach: low beside her, a little forward, so the forearm runs BACK to the hand behind her (square to
 *  the stowed stave, the wrist nearly straight); a pole out and back laid the forearm along the stave (W1: the wrist bent
 *  77-90 deg at the grab) */
const BOW_POLE = [0.35, -0.75, 0.55];
/** ...and the carry's (the lowered carry's own pole, `_bowCarryLayer`) */
const BOW_POLE_CARRY = [0.85, -0.55, -0.25];
/** the carry layer's wrist goal (its grip, less the breath and the stride it adds) */
const CARRY_GRIP = [0.275, 0.94, 0.135];
/** the held Sabina's stave, tip to tip in its own mesh units (bow-sabina.glb: y +-0.7472) */
const HELD_STAVE = 1.4944;
/** the held Sabina's riser belly from the stave's centreline plane, mesh units (its wrap's radius) */
const HELD_BELLY = 0.022;
/** where the stave points as the fist passes her hip (char): the top limb swung down and forward from its line on her back,
 *  square to the forearm hanging there; the carry's line is reached from it (a straight slerp from the back to the carry
 *  kept the stave along the forearm, W1's wrist 100-109 deg) */
const MID_STAVE = new THREE.Vector3(0.45, 0.15, 0.88).normalize();
/** the trunk's reach additive: spine_02 yaws the left shoulder back this far at the peak of the reach (rad, 7.5 deg) */
const REACH_YAW = 0.131;
const _bpA = new THREE.Vector3(), _bpB = new THREE.Vector3(), _bpC = new THREE.Vector3(), _bpT = new THREE.Vector3();
const _bpM = new THREE.Matrix4(), _bpN = new THREE.Matrix4(), _bpS = new THREE.Vector3(), _bpQ = new THREE.Quaternion();
const _bpP = new THREE.Vector3(), _bpD = new THREE.Vector3(), _bpE = new THREE.Vector3(), _bpG = new THREE.Vector3();
const _bpQ2 = new THREE.Quaternion(), _bpQ3 = new THREE.Quaternion(), _bpQ4 = new THREE.Quaternion(), _bpEu = new THREE.Euler();
const _bpRz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.22);
const _bpPH = [0, 0];
const _gaD = new THREE.Vector3(), _gaE = new THREE.Vector3(), _gaQ = new THREE.Quaternion();
const _gaF = new THREE.Vector3(), _gaW = new THREE.Vector3(), _gaR = new THREE.Quaternion();
/** the palm plan's speed bound (m a step; the wrist's bar is 0.08) */
const PALM_STEP = 0.068;   // (M1a weapons fix round 1, W7's bow unstow: 0.055 -> 0.068; the reach to the limb was 0.20 s)
/** M1a weapons round 2: the palm's distance off the stave's centreline (mesh; sockets.js palm, square to the stave) and the
 *  palm's side at the limb's take and at the riser (mesh, unit, square to the stave) */
const BOW_PALM_D = Math.hypot(SOCKETS.bow.palm[0], SOCKETS.bow.palm[2]);
const BOW_PSIDE_G = [SOCKETS.bow.palm[0] / BOW_PALM_D, 0, SOCKETS.bow.palm[2] / BOW_PALM_D];
const BOW_PSIDE_L = (() => { const P = SOCKETS.bow.limb.palm || SOCKETS.bow.palm, d = Math.hypot(P[0], P[2]); return [P[0] / d, 0, P[2] / d]; })();
const _hbA = new THREE.Vector3(), _hbB = new THREE.Vector3(), _hbC = new THREE.Vector3(), _bpS2 = new THREE.Vector3();
/** ...and the most the take waits (s of the sequence's clock) for the palm on the limb's socket, within `BOW_TAKE_TOL` m */
const BOW_TAKE_WAIT = 0.10, BOW_TAKE_TOL = 0.006;
/** the hand's turn bound while the sequence holds it (rad a step): with the palm's, the wrist stays under 0.08 m a step */
const HAND_TURN = 0.45;
const _sm = ease;
/** a quadratic Bezier F -> W -> G at u, into `out` */
function bez(F, W, G, u, out) {
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
  return out.set(F.x * a + W.x * b + G.x * c, F.y * a + W.y * b + G.y * c, F.z * a + W.z * b + G.z * c);
}
/** move `cur` toward `want` by at most `max` (m), in place */
function stepToward(cur, want, max) {
  const dx = want.x - cur.x, dy = want.y - cur.y, dz = want.z - cur.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= max || d < 1e-9) return cur.copy(want);
  const k = max / d;
  cur.x += dx * k; cur.y += dy * k; cur.z += dz * k;
  return cur;
}
const _ttA = new THREE.Vector3(), _ttQ = new THREE.Quaternion();
/** turn the unit vector `cur` toward the unit `want` by at most `max` (rad), in place */
function turnToward(cur, want, max) {
  const a = cur.angleTo(want);
  if (a <= max || a < 1e-7) return cur.copy(want);
  _ttA.crossVectors(cur, want);
  if (_ttA.lengthSq() < 1e-12) return cur;
  return cur.applyQuaternion(_ttQ.setFromAxisAngle(_ttA.normalize(), max)).normalize();
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
    /* M1a weapons step 1 (W1; the W1 judges' "the grip in the fist is not legible"): the fist closed ROUND the carried
     * stave, its grip axis along it (combat places the bow off her heading, not off the hand: at 0d3feb5 the stave
     * crossed the fist 74-79 deg off its grip axis at a run), the wrist as straight as that allows */
    /* M1a weapons round 2 (W1 in the carry: the palm faced 86-90 deg off the stave, 120-185 finger joint-steps inside
     * it): the fingers close on the stave (`_grip`), and the carried bow is posed from this hand (`bowPathPose`) */
    if (this.melee?.gripDirLL && this.b.loArmL) {
      _gaE.set(0, 1, 0).applyQuaternion(this._bowCarryQ(_bpQ2));
      this._handOnStave(_gaE, 1, _bpQ3);
      this._liveW(b.handL.bone, _bpQ4);
      this.space.setCharQ(b.handL, _bpQ4.slerp(_bpQ3, w));
    }
    const Gc = this._bowGrip ? (this._bowPathState(), this._bowGrip(1)) : null;
    if (Gc) this._wrapFingers('l', Gc, 1, 0.55 * w, w);
    else this._curlFingers(this._fingerL, 0.85 * w, 0.55 * w);
    // shoulder carries the mass
    this._rot(b.clavL, Z_AXIS, -0.05 * w);
    this._rot(b.spine2, Z_AXIS, -0.025 * w);
  }

  /* ---------------- the bow's stow and unstow (handling.js tables) ---------------- */

  /** The sequence's state (built on first use; the constructor names the field). */
  _bowPathState() {
    return this._bp || (this._bp = {
      mode: 0, t: 0, was: false, tempo: 'ask', T: null, owner: 'carry', inHand: false, w: 0, frames: 0,
      // the kit's stowed Sabina in spine_02's frame: origin (the held mesh's origin, the riser), basis, scale
      kit: null, kitQ: new THREE.Quaternion(), kitO: new THREE.Vector3(), kitS: 1,
      // the planned bow this step (char): orientation, palm point, slide along the stave 0 limb .. 1 riser, scale
      q: new THREE.Quaternion(), qGrab: new THREE.Quaternion(), qMid: new THREE.Quaternion(), palm: new THREE.Vector3(),
      s: 0, scale: 1, keep: 0, blendC: 0, sigma: 1,
      from: new THREE.Vector3(), tgt: new THREE.Vector3(), tgtOk: false, curl: 0, yaw: 0,
      pp: new THREE.Vector3(), pole: new THREE.Vector3(0.85, -0.45, -0.30), hq: new THREE.Quaternion(), hqOk: false, fa: new THREE.Vector3(), faOk: false, back: 0,
      palmOff: null, sockChar: [0, 0, 0], sockOk: false, readyAt: -1,
      gripAt: -1, releaseAt: -1, requestAt: -1, simT: 0, phase: '', k: 0,
    });
  }

  /**
   * Once: the kit's stowed Sabina as a frame in spine_02's space, read off the kit's own skinned vertices (piece 2): the
   * stave's axis (its first principal axis, the upper end up), the belly (from the string toward the riser), the scale
   * against the held Sabina, and the held mesh's origin (the riser's centreline) on it. So the bow in her hand at the
   * grip event is drawn exactly where the one on her back was.
   */
  _bowKitInit() {
    const B = this._bowPathState();
    if (B.kit !== null) return B.kit;
    B.kit = false;
    const kit = this.ctx.player?.hero?.kit, m = kit?.meshes?.[0], sp = this.b?.spine2?.bone;
    if (!m || !sp) return false;
    const P = m.geometry.getAttribute('_piece'), pos = m.geometry.getAttribute('position');
    if (!P || !pos) return false;
    sp.updateWorldMatrix(true, false);
    const pts = [];
    const v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & 2) === 0) continue;
      m.getVertexPosition(i, v); m.localToWorld(v); sp.worldToLocal(v);
      pts.push(v.clone()); c.add(v);
    }
    if (pts.length < 20) return false;
    c.multiplyScalar(1 / pts.length);
    // the covariance and its first two principal axes (power iteration; cold, once)
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of pts) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) C[a * 3 + b2] += d[a] * d[b2]; }
    const pi = (M, x) => { for (let k = 0; k < 100; k++) { const y = [0, 1, 2].map((a) => M[a * 3] * x[0] + M[a * 3 + 1] * x[1] + M[a * 3 + 2] * x[2]); const n = Math.hypot(y[0], y[1], y[2]) || 1; x = y.map((q) => q / n); } return x; };
    const e1 = pi(C, [0.3, 0.9, 0.1]);
    const l1 = [0, 1, 2].reduce((s2, a) => s2 + e1[a] * (C[a * 3] * e1[0] + C[a * 3 + 1] * e1[1] + C[a * 3 + 2] * e1[2]), 0);
    const e2 = pi(C.map((q, i) => q - l1 * e1[Math.floor(i / 3)] * e1[i % 3]), [0.9, -0.3, 0.2]);
    const Y = new THREE.Vector3().fromArray(e1), Z = new THREE.Vector3().fromArray(e2);
    // the upper end up (in her frame as she stands now)
    this.model.updateMatrixWorld(true);
    const up = Y.clone().transformDirection(sp.matrixWorld).transformDirection(_bpM.copy(this.model.matrixWorld).invert());
    if (up.y < 0) Y.negate();
    let t0 = 9, t1 = -9;
    for (const p of pts) { const t = v.subVectors(p, c).dot(Y); if (t < t0) t0 = t; if (t > t1) t1 = t; }
    // the belly: from the tips' chord toward the riser
    const mid = new THREE.Vector3(); let n = 0;
    for (const p of pts) { if (Math.abs(v.subVectors(p, c).dot(Y) - (t0 + t1) / 2) < 0.05) { mid.add(p); n++; } }
    if (n) { mid.multiplyScalar(1 / n); const chord = c.clone().addScaledVector(Y, (t0 + t1) / 2); if (mid.sub(chord).dot(Z) < 0) Z.negate(); }
    let z1 = -9;
    for (const p of pts) z1 = Math.max(z1, v.subVectors(p, c).dot(Z));
    // (spine_02's local units are not metres: its world scale over the model's)
    _bpS.setFromMatrixScale(sp.matrixWorld);
    const u = _bpS.x / (this.model.getWorldScale(v).x || 1);
    B.kitS = (t1 - t0) * u / HELD_STAVE;
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    Z.crossVectors(X, Y).normalize();
    B.kitQ.setFromRotationMatrix(_bpM.makeBasis(X, Y, Z));
    // the held mesh's origin: the stave's middle, the riser's centreline (the belly's extreme less the wrap's radius)
    B.kitO.copy(c).addScaledVector(Y, (t0 + t1) / 2).addScaledVector(Z, z1 - HELD_BELLY * B.kitS / u);
    B.kit = true;
    return true;
  }

  /** The stowed bow's frame this step, char space: orientation into `q`, the held mesh's origin into `o`. */
  _bowKitNow(q, o) {
    const B = this._bp, sp = this.b.spine2.bone;
    this._liveW(sp, _bpQ4);
    q.copy(_bpQ4).multiply(B.kitQ);
    this._charOf(sp, o);
    _bpE.copy(B.kitO).applyQuaternion(_bpQ4);
    // (spine_02's world scale: its local units are not metres)
    sp.updateWorldMatrix(true, false);
    _bpS.setFromMatrixScale(sp.matrixWorld);
    return o.addScaledVector(_bpE, _bpS.x / (this.model.getWorldScale(_bpD).x || 1));
  }

  /** The carried bow's orientation, char space (combat.js `_placeInHand`'s carry: off her heading, canted 0.22 rad). */
  _bowCarryQ(q) {
    let run = (this.ctx.player?.moveSpeed ?? 0) / 6; if (!(run > 0)) run = 0; else if (run > 1) run = 1;
    _bpEu.set(0.92, 0.12 + 0.18 * run, 0.2 - 0.1 * run, 'YXZ');
    return q.setFromEuler(_bpEu).multiply(_bpRz);
  }

  /** A point of a bow posed at (q, o, scale), given in the held mesh's units (char space out). */
  _bowPt(q, o, scale, x, y, z, out) { return out.set(x, y, z).multiplyScalar(scale).applyQuaternion(q).add(o); }

  /** The palm socket (sockets.js: the socket's point plus the palm's offset) at slide `s` (0 limb .. 1 riser), mesh units. */
  _bowSockMesh(s, out) {
    const L = SOCKETS.bow.limb.p, G = SOCKETS.bow.grip.p, P = SOCKETS.bow.palm;
    // (M1a weapons round 2: the palm's side turns round the stave from the limb's take to the grip's over the slide)
    this._bowPside(s, _bpS2);
    return out.set(L[0] + (G[0] - L[0]) * s + _bpS2.x * BOW_PALM_D, L[1] + (G[1] - L[1]) * s + P[1], L[2] + (G[2] - L[2]) * s + _bpS2.z * BOW_PALM_D);
  }

  /** The palm's side of the stave at slide `s` (mesh, unit, square to the stave): the limb's at 0, the grip's at 1. */
  _bowPside(s, out) {
    const a0 = Math.atan2(BOW_PSIDE_L[0], BOW_PSIDE_L[2]), a1 = Math.atan2(BOW_PSIDE_G[0], BOW_PSIDE_G[2]);
    let d = a1 - a0; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    const a = a0 + d * clamp(s, 0, 1);
    return out.set(Math.sin(a), 0, Math.cos(a));
  }

  /**
   * M1a weapons round 2 (W1: the palm on the stave, its normal onto it): the left hand's turn (char) that holds a bow
   * posed `qBow` (char, the mesh's frame) at slide `s`: its grip axis along the stave (index toward the top limb), its
   * palm's normal (the fingers' bend side, `_grip`'s) square onto the stave from the palm's side. Into `out`.
   */
  _handForBow(qBow, s, out) {
    const G = this._bowGrip(s), g = this.melee?.gripDirLL;
    if (!G || !g) return out;
    // the hand's own frame (local): grip axis, palm normal square to it, their cross
    _hbA.copy(g).normalize(); _hbB.copy(G.n).addScaledVector(_hbA, -G.n.dot(_hbA)).normalize(); _hbC.crossVectors(_hbA, _hbB);
    _bpN.makeBasis(_hbA, _hbB, _hbC);
    // the same three in char for the bow: the stave, the palm's normal (onto the stave: minus the palm's side)
    _hbA.set(0, 1, 0).applyQuaternion(qBow);
    this._bowPside(s, _hbB); _hbB.applyQuaternion(qBow).negate().addScaledVector(_hbA, 0).normalize();
    _hbC.crossVectors(_hbA, _hbB);
    _bpM.makeBasis(_hbA, _hbB, _hbC);
    _bpM.multiply(_bpN.transpose());
    return out.setFromRotationMatrix(_bpM);
  }

  /** ...and the reverse: the bow's mesh turn (char) a left hand turned `qHand` (char) holds at slide `s`. Into `out`. */
  _bowForHand(qHand, s, out) {
    const G = this._bowGrip(s), g = this.melee?.gripDirLL;
    if (!G || !g) return out;
    _hbA.copy(g).normalize(); _hbB.copy(G.n).addScaledVector(_hbA, -G.n.dot(_hbA)).normalize();
    _hbA.applyQuaternion(qHand); _hbB.applyQuaternion(qHand).negate();     // stave, palm's side (char)
    _hbC.crossVectors(_hbA, _hbB);
    _bpM.makeBasis(_hbA, _hbB, _hbC);
    this._bowPside(s, _hbB); _hbA.set(0, 1, 0); _hbC.crossVectors(_hbA, _hbB);
    _bpN.makeBasis(_hbA, _hbB, _hbC);
    _bpM.multiply(_bpN.transpose());
    return out.setFromRotationMatrix(_bpM);
  }

  /** The left hand's two solved bow grips (`_grip`): on the limb (s < 0.5) and on the riser. Null before the layer is up. */
  _bowGrip(s) {
    const B = this._bp;
    if (!this.melee?.gripDirLL || !this._fingerL?.length) return null;
    if (!B.gripL) {
      const palm = this._bowPalmOff(), g = this.melee.gripDirLL;
      B.gripL = this._grip('l', 'bowLimb', palm, g, BOW_PALM_D, SOCKETS.bow.limb.r);
      B.gripG = this._grip('l', 'bowGrip', palm, g, BOW_PALM_D, SOCKETS.bow.grip.r);
    }
    return s < 0.5 ? B.gripL : B.gripG;
  }

  /** The left palm's offset from the wrist in the hand's frame (char units; combat's palm: 0.7 to the middle knuckle). */
  _bowPalmOff() {
    const B = this._bp;
    if (B.palmOff) return B.palmOff;
    const hb = this.b.handL.bone, mid = hb.children.find((c) => c.isBone && /^middle_01/.test(c.name));
    B.palmOff = new THREE.Vector3();
    if (!mid) return B.palmOff;
    this._charOf(mid, _bpA); this._charOf(hb, _bpB); this._liveW(hb, _bpQ);
    return B.palmOff.subVectors(_bpA, _bpB).multiplyScalar(0.7).applyQuaternion(_bpQ.invert());
  }

  /**
   * The left hand closed round a stave along `axis` (char): its grip axis (pinky to index) on the stave (`sigma` -1 the
   * other way round), its fingers turned about the stave to lie as near the forearm's line as they can (the straightest
   * wrist that holds it). Into `out` (char).
   */
  _handOnStave(axis, sigma, out, side = 'l') {
    const b = this.b, R = side === 'r', g = R ? this.melee?.gripDirL : this.melee?.gripDirLL;
    const hE = R ? b.handR : b.handL, lE = R ? b.loArmR : b.loArmL;
    const key = R ? '_bpFingerR' : '_bpFingerL';
    const fL = this[key] || (this[key] = (() => { const mid = hE.bone.children.find((c) => c.isBone && /^middle_01/.test(c.name)); return mid ? mid.position.clone().normalize() : new THREE.Vector3(0, 1, 0); })());
    _gaE.copy(axis).multiplyScalar(sigma).normalize();
    _gaQ.setFromUnitVectors(_gaD.copy(g || Z_AXIS).normalize(), _gaE);
    // the forearm's line, elbow to wrist
    this._charOf(lE.bone, _gaF); this._charOf(hE.bone, _gaW);
    _gaW.sub(_gaF).normalize();
    _gaF.copy(fL).applyQuaternion(_gaQ);
    _gaF.addScaledVector(_gaE, -_gaF.dot(_gaE)); _gaW.addScaledVector(_gaE, -_gaW.dot(_gaE));
    if (_gaF.lengthSq() > 1e-8 && _gaW.lengthSq() > 1e-8) {
      _gaF.normalize(); _gaW.normalize();
      const th = Math.atan2(_gaD.crossVectors(_gaF, _gaW).dot(_gaE), _gaF.dot(_gaW));
      _gaR.setFromAxisAngle(_gaE, th);
      _gaQ.premultiply(_gaR);
    }
    return out.copy(_gaQ);
  }

  /**
   * The hand's orientation with its grip axis (pinky to index) laid along `axis` (char), the least turn from `qHand`.
   * `sigma` -1 lays it the other way (a reversed fist). Into `out`.
   */
  _gripAlong(qHand, axis, sigma, out) {
    const g = this.melee?.gripDirLL;
    _gaD.copy(g || Z_AXIS).applyQuaternion(qHand);
    _gaE.copy(axis).multiplyScalar(sigma);
    _gaQ.setFromUnitVectors(_gaD.normalize(), _gaE.normalize());
    return out.copy(_gaQ).multiply(qHand);
  }

  /**
   * The sequence, each step after the aim layer and the carry (it owns the LEFT arm while it runs; the aim rig waits for
   * it, `update`). `want`: combat's `weaponDrawn`. Returns the arm weight it took this step.
   */
  _bowPathLayer(want, dt) {
    const B = this._bowPathState();
    const b = this.b;
    if (!b.handL || !b.upArmL) return 0;
    B.simT += dt;
    if (want !== B.was) this._bowRequest(want);
    B.was = want;
    this._bowCapStowed();
    if (B.mode === 0) { B.w = 0; B.inHand = B.owner === 'handL'; B.phase = ''; B.yaw = 0; return 0; }
    if (!B.kit) { this._bowKitInit(); if (!B.kit) { B.mode = 0; B.owner = want ? 'handL' : 'carry'; B.inHand = want; return 0; } }
    B.t += dt; B.frames++;
    /* M1a weapons round 2 (W2 at the grip): the take is an event on the hand, not the clock: at the end of the close the
     * sequence waits (at most BOW_TAKE_WAIT) until the palm is on the limb's socket, so the bow leaves the keeper in the
     * fist, not beside it */
    if (B.mode === 1 && B.owner === 'carry' && B.T) {
      const tG = phaseEnd(B.T, 'C');
      if (B.t >= tG && ((B.palmMiss ?? 9) > BOW_TAKE_TOL || (B.turnMiss || 0) > 0.012) && (B.takeWait || 0) < BOW_TAKE_WAIT) { B.takeWait = (B.takeWait || 0) + dt; B.t = tG - 1e-4; }
    }
    // ...and the stow's release: the fist lets go once the bow is seated in its keeper
    if (B.mode === 2 && B.owner === 'handL' && B.T) {
      const tR = phaseEnd(B.T, 'D');
      // (M1a weapons fix round 1, W2 at the release in swap 1 to 2: 0.094 m / 6.6 deg; the asked stow's turn, held to W3's
      //  rate, was still short of the keeper's line: the release waits on the bow's own turn too)
      if (B.t >= tR && ((B.palmMiss ?? 9) > BOW_TAKE_TOL || (B.turnMiss || 0) > 0.012 || (B.kitMiss || 0) > 0.012) && (B.takeWait || 0) < BOW_TAKE_WAIT) { B.takeWait = (B.takeWait || 0) + dt; B.t = tR - 1e-4; }
    }
    const T = B.T, ph = phaseAt(T, B.t, _bpPH), i = ph[0], k = ph[1], name = T.phases[i][0];
    B.phase = name; B.k = k;
    // the trunk's reach first (the stowed bow rides spine_02, so every goal below is read after it): spine_02 turns the
    // left shoulder back, the neck takes the turn back out so the head stays on its line; faded out under the aim (W11)
    const aimW = this.aimWeight ?? 0;
    const yaw = this._bowYawAt(T) * (1 - Math.min(1, 2 * aimW));
    B.yaw = yaw;
    if (Math.abs(yaw) > 1e-5) { this._rot(b.spine2, Y_AXIS, yaw); if (b.neck1) this._rot(b.neck1, Y_AXIS, -yaw); }
    const palmOff = this._bowPalmOff();
    this._liveW(b.handL.bone, _bpQ);                // the hand as it stands this step (clip and earlier layers)
    const kitQ = _bpQ2, kitO = _bpC;
    this._bowKitNow(kitQ, kitO);
    let w = 1, curl = B.curl, rot = 0;              // IK weight, finger target, the hand's grip turn weight
    if (B.mode === 1) {
      /* ---- the unstow */
      const tGrip = phaseEnd(T, 'C');
      if (B.t < tGrip) {
        // A, B: reach round the hip to the limb (the plan's socket on the stowed bow), the hand opening; C: close
        this._bowSockMesh(0, _bpG);
        this._bowPt(kitQ, kitO, B.kitS, _bpG.x, _bpG.y, _bpG.z, _bpT);       // the palm's goal: on the stowed limb
        if (!B.sockGoal) B.sockGoal = new THREE.Vector3();
        B.sockGoal.copy(_bpT);
        const tB = phaseEnd(T, 'B');
        const u = _sm(B.t / tB);
        this._bowPointNowSide(_bpA);
        bez(B.from, _bpA, _bpT, u, _bpP);                                     // the palm's path (from where it was)
        B.palm.copy(_bpP);
        curl = name === 'C' ? CURL.open + (CURL.closed - CURL.open) * _sm(k) : CURL.open;
        w = 1;
        rot = _sm(B.t / tB);
        B.q.copy(kitQ); B.scale = B.kitS; B.s = 0; B.keep = 0;
        if (B.owner !== 'carry') this._bowOwner('carry');
      } else {
        if (B.owner !== 'handL') { this._bowOwner('handL'); B.qGrab.copy(kitQ); }
        const tD = phaseEnd(T, 'D'), tE = phaseEnd(T, 'E');
        // D: out of the keeper down its own limb, then the pivot about the fist toward the low carry
        const kd = clamp((B.t - tGrip) / (tD - tGrip), 0, 1), ke = clamp((B.t - tD) / (tE - tD), 0, 1);
        this._bowCarryQ(_bpQ3);
        _bpD.set(0, 1, 0).applyQuaternion(kitQ);
        B.qMid.setFromUnitVectors(_bpD, MID_STAVE).multiply(kitQ);
        if (B.t < tD) {
          /* (M1a weapons fix round 1, W2 at the grip: the slide out of the keeper over 0.6 of D, was 0.35: its first step, the
           *  grip event's own, took the bow 0.037 m down its axis, bar 0.02; the palm's goal below multiplies it again) */
          B.keep = KEEPER_SLIDE * _sm(kd / 0.6);
          _bpQ4.copy(kitQ).slerp(B.qMid, _sm((kd - 0.35) / 0.65));
        } else {
          B.keep = KEEPER_SLIDE;
          _bpQ4.copy(B.qMid).slerp(_bpQ3, _sm(ke));
        }
        // the pivot is about the FIST: out of the keeper, the stave is kept 60-100 deg off the forearm (as rendered last
        // step), so the wrist never folds as the arm swings round her hip (W1); let go of as the carry's line is reached
        if (kd >= 0.35 && B.faOk) this._staveOffForearm(_bpQ4, B.fa, 1 - _sm((ke - 0.2) / 0.5));
        // the bow turns no faster than the rate bound (W3)
        const maxA = RATE.bowDeg * Math.PI / 180 * dt;
        const a = B.q.angleTo(_bpQ4);
        if (a > maxA) B.q.slerp(_bpQ4, maxA / a); else B.q.copy(_bpQ4);
        // the palm: on the stowed limb, out along the keeper, past the hip, and on to the carry's palm
        this._bowSockMesh(0, _bpG);
        this._bowPt(kitQ, kitO, B.kitS, _bpG.x, _bpG.y, _bpG.z, _bpT);
        _bpE.set(0, -1, 0).applyQuaternion(kitQ);
        _bpT.addScaledVector(_bpE, B.keep * _sm(kd / 0.6));
        this._bowPointNowPast(_bpA);
        // (the carry's palm: its wrist goal plus the palm, the hand laid along the carried stave)
        _bpD.set(0, 1, 0).applyQuaternion(_bpQ3);
        this._gripAlong(_bpQ, _bpD, 1, _bpQ4);
        _bpB.fromArray(CARRY_GRIP); _bpB.y -= 0.30 * this._crouchW;
        _bpB.add(_bpE.copy(palmOff).applyQuaternion(_bpQ4));
        // (the fist stays at her back through the slide and the start of the pivot, then travels past the hip to the carry)
        if (B.t < tD) _bpP.lerpVectors(_bpT, _bpA, 0.5 * _sm((kd - 0.4) / 0.6));
        else bez(_bpP.lerpVectors(_bpT, _bpA, 0.5), _bpA, _bpB, _sm(ke), _bpP);
        B.palm.copy(_bpP);
        // E: the fist loosens and the limb runs through it to the riser; closes on the riser as E ends
        B.s = B.t < tD ? 0 : _sm(ke);
        B.scale = B.kitS + (1 - B.kitS) * _sm(ke);
        curl = B.t < tD ? CURL.closed : ke < 0.85 ? CURL.slide : CURL.closed;
        rot = 1;
        // the bow hands over to combat's carry placement over E's second half (bowPathPose)
        B.blendC = _sm((ke - 0.4) / 0.6);
        // (ready only once the bow lies on the carry's line: combat's carry takes it from there with no turn)
        /* (M1a weapons step 2: within 5 deg of the carry's line, half the W3 step bar: combat's carry takes the last of it in
         *  one step; at 3 deg the rate bound's tail held the unstow to 0.45-0.47 s, W7's band 0.30-0.40) */
        if (B.t >= T.total && B.q.angleTo(_bpQ3) < 0.087) { B.mode = 0; B.readyAt = B.simT; this._carryBowW = 1; }
        // (held at the carry through F until the bow lies on the carry's line; the carry layer takes the arm at weight 1)
        w = 1;
      }
    } else if (B.mode === 2) {
      /* ---- the stow */
      const tRel = phaseEnd(T, 'D'), tA = phaseEnd(T, 'A'), tB = phaseEnd(T, 'B'), tC = phaseEnd(T, 'C');
      if (B.t < tRel) {
        if (B.owner !== 'handL') this._bowOwner('handL');
        this._bowCarryQ(_bpQ3);
        _bpD.set(0, 1, 0).applyQuaternion(kitQ);
        B.qMid.setFromUnitVectors(_bpD, MID_STAVE).multiply(kitQ);
        // the orientation: carry -> mid (B) -> stowed (C), rate bound
        if (B.t < tB) _bpQ4.copy(_bpQ3).slerp(B.qMid, _sm((B.t - tA) / (tB - tA)));
        else _bpQ4.copy(B.qMid).slerp(kitQ, _sm((B.t - tB) / (tC - tB)));
        // (the pivot about the fist, as the unstow's; let go of as the stave comes onto its line on her back)
        if (B.faOk && B.t >= tA) this._staveOffForearm(_bpQ4, B.fa, 1 - _sm((B.t - tB - 0.5 * (tC - tB)) / (0.5 * (tC - tB))));
        const maxA = RATE.bowDeg * Math.PI / 180 * dt;
        const a = B.q.angleTo(_bpQ4);
        if (a > maxA) B.q.slerp(_bpQ4, maxA / a); else B.q.copy(_bpQ4);
        B.kitMiss = B.q.angleTo(kitQ);
        // the slide: riser -> limb through the loosened fist (A, B); the keeper: 0.10 m short until D seats it
        B.s = B.t < tA ? 1 : 1 - _sm((B.t - tA) / (tB - tA));
        B.keep = B.t < tC ? KEEPER_SLIDE : KEEPER_SLIDE * (1 - _sm((B.t - tC) / (tRel - tC)));
        B.scale = 1 + (B.kitS - 1) * _sm((B.t - tA) / (tC - tA));
        // the palm: from where it is to past the hip (B), onto the stowed limb short of the keeper (C), up into it (D)
        this._bowSockMesh(0, _bpG);
        this._bowPt(kitQ, kitO, B.kitS, _bpG.x, _bpG.y, _bpG.z, _bpT);
        _bpE.set(0, -1, 0).applyQuaternion(kitQ);
        _bpT.addScaledVector(_bpE, B.keep);
        if (!B.sockGoal) B.sockGoal = new THREE.Vector3();
        B.sockGoal.copy(_bpT);
        this._bowPointNowPast(_bpA);
        if (B.t < tB) _bpP.lerpVectors(B.from, _bpA, _sm((B.t - tA) / (tB - tA)) * (B.t < tA ? 0 : 1));
        else _bpP.lerpVectors(_bpA, _bpT, _sm((B.t - tB) / (tC - tB)));
        if (B.t >= tC) _bpP.copy(_bpT);
        B.palm.copy(_bpP);
        curl = B.t < tA ? CURL.closed + (CURL.slide - CURL.closed) * _sm(B.t / tA) : B.t < tB ? CURL.slide : CURL.closed;
        rot = 1; w = 1; B.blendC = 0;
      } else {
        // E: the release; the open hand back down her side to the clip's own
        B.relDone = B.owner === 'carry';
        if (B.owner !== 'carry') { this._bowOwner('carry'); B.from.copy(B.palm); }
        /* M1a weapons fix round 1 (W7, the bow's asked stow inside swap 1 to 2: 0.45 s, band 0.30-0.37): in a swap the
         * open hand does not go home, it goes for the haft. The lance layer runs after this one and has had the left arm
         * since the release (meleeLayer: the bow is out of the hand); this phase only kept the bow's sequence open. The stow ends
         * a step after the release: the fingers open off the seated limb */
        if (this.ctx.combat?.melee?.stance === 'draw' && B.relDone) { B.mode = 0; B.readyAt = B.simT; B.w = 0; B.inHand = false; B.phase = ''; return 0; }
        const tE = T.total, ke = clamp((B.t - tRel) / (tE - tRel), 0, 1);
        this._charOf(b.handL.bone, _bpB);                 // the clip's wrist (before this layer)
        _bpB.add(_bpE.copy(palmOff).applyQuaternion(_bpQ));
        this._bowPointNowSide(_bpA);
        bez(B.from, _bpA, _bpB, _sm(ke), _bpP);
        B.palm.copy(_bpP);
        curl = CURL.open;
        // (the plan carries the open hand home at the palm's bound; the arm goes back to the clip only over the last steps,
        //  where the plan has caught the clip's hand: a fade from her back threw the wrist 0.12 m a step)
        this._charOf(b.handL.bone, _bpA); _bpA.add(_bpE.copy(palmOff).applyQuaternion(_bpQ));
        if (ke >= 0.6 && B.pp.distanceTo(_bpA) < 0.05) B.back = Math.min(1, B.back + dt / 0.05);
        w = 1 - _sm(B.back);
        rot = 1 - _sm(ke / 0.6);
        if (B.t >= tE && B.back >= 1) { B.mode = 0; B.readyAt = B.simT; }
      }
    }
    // the fingers: toward their target at the curl rate (a close takes >= 2 steps; W1)
    const cr = CURL.rate * dt;
    B.curl = B.curl + clamp(curl - B.curl, -cr, cr);
    // the palm's plan moves no faster than the wrist may (W3): the bow is posed on this plan, so it never outruns the hand
    stepToward(B.pp, B.palm, PALM_STEP * dt * 60);
    B.palm.copy(B.pp);
    // the elbow's pole turns toward the path's at most 20 deg a step (W11: no flip as the hand passes the hip)
    // (the reach's pole while the hand is behind her; the carry's as it brings the bow round and while it lets go)
    const carryPole = (B.mode === 1 && B.owner === 'handL' && B.t >= phaseEnd(T, 'C') + 0.5 * (phaseEnd(T, 'D') - phaseEnd(T, 'C'))) || (B.mode === 2 && B.t < phaseEnd(T, 'A'));
    _bpA.fromArray(carryPole ? BOW_POLE_CARRY : BOW_POLE).normalize();
    turnToward(B.pole, _bpA, 0.2 * dt * 60);
    /* the hand closed round the planned stave, solved twice (the wrist goal depends on the hand's turn, the turn on the
     * forearm the solve leaves): its grip axis along the stave, turned about it to the straightest wrist. M1a weapons
     * round 2: the bow is then posed FROM this hand (`bowPathPose`), on the palm's side of its socket, so the fist holds
     * it as drawn (the palm's normal onto the stave, the fingers closed on its surface, `_grip`) */
    _bpD.set(0, 1, 0).applyQuaternion(B.q);
    if (!B.hqOk) { this._liveW(b.handL.bone, B.hq); B.hqOk = true; }
    this._liveW(b.handL.bone, _bpQ);                // the clip's hand, for the reach's weighting
    _bpQ3.copy(_bpQ);
    for (let pass = 0; pass < 2; pass++) {
      _bpT.copy(B.palm).sub(_bpE.copy(palmOff).applyQuaternion(B.hq));
      this._ikArm('l', _bpT, B.pole, w, null);
      if (pass === 0) {
        this._handOnStave(_bpD, B.sigma, _bpQ4);
        /* (M1a weapons round 2, W2 at the grip and the release: at the keeper the fist holds the PLANNED bow, the one on
         *  her back, turned as it is there (`_handForBow`): the bow posed off the fist is then the kit's own at the take
         *  and at the seat; between, the straightest wrist) */
        const kq = this._bowKeepTurn(T);
        if (kq > 1e-3) { this._handForBow(B.q, B.s, _bpQ2); _bpQ4.slerp(_bpQ2, kq); }
        if (rot < 1) { _bpQ.copy(_bpQ3).slerp(_bpQ4, rot); _bpQ4.copy(_bpQ); }
        const a = B.hq.angleTo(_bpQ4), mx = HAND_TURN * dt * 60;
        if (a > mx) B.hq.slerp(_bpQ4, mx / a); else B.hq.copy(_bpQ4);
        // (at the keeper the fist must hold the bow turned as it sits there: the take and the release wait on it too)
        B.turnMiss = kq >= 0.999 ? B.hq.angleTo(_bpQ4) : 0;
      }
    }
    _bpQ4.copy(B.hq);
    B.tgt.copy(_bpT);
    if (rot > 1e-3 && w > 1e-3) { this._liveW(b.handL.bone, _bpQ3); this.space.setCharQ(b.handL, _bpQ3.slerp(_bpQ4, Math.min(1, w))); }
    // the palm's miss on its plan (the take waits on it)
    this._charOf(b.handL.bone, _bpA); this._liveW(b.handL.bone, _bpQ3);
    const atKeeper = (B.mode === 1 && B.owner === 'carry') || (B.mode === 2 && B.owner === 'handL' && B.t >= phaseEnd(T, 'C'));
    B.palmMiss = _bpA.add(_bpE.copy(palmOff).applyQuaternion(_bpQ3)).distanceTo(atKeeper && B.sockGoal ? B.sockGoal : B.palm);
    const G = this._bowGrip(B.s);
    if (G) this._wrapFingers('l', G, B.curl / CURL.closed, B.curl * 0.65 * w, w);
    else this._curlFingers(this._fingerL, B.curl * w, B.curl * 0.65 * w);
    // the forearm as it ends this step (the next step's pivot reads it)
    this._charOf(b.loArmL.bone, _bpA); this._charOf(b.handL.bone, B.fa); B.fa.sub(_bpA).normalize(); B.faOk = true;
    B.inHand = B.owner === 'handL';
    B.w = w;
    return w;
  }

  /** M1a weapons round 2: how much the fist is turned to the planned bow at the keeper this step (0..1, `_bowPathLayer`). */
  _bowKeepTurn(T) {
    const B = this._bp, t = B.t;
    if (B.mode === 1) {
      const tC = phaseEnd(T, 'C'), tD = phaseEnd(T, 'D');
      return t < tC ? 1 : 1 - _sm((t - tC) / (tD - tC));
    }
    if (B.mode === 2) {
      const tB = phaseEnd(T, 'B'), tC = phaseEnd(T, 'C'), tD = phaseEnd(T, 'D');
      if (t >= tD) return 0;
      return _sm((t - tB) / (tC - tB));
    }
    return 0;
  }

  /** Turn `q` (a bow, char) so its stave lies 60-100 deg off the forearm `fa` (unit, char), at weight `k`. In place. */
  _staveOffForearm(q, fa, k) {
    if (k <= 1e-3) return q;
    _gaD.set(0, 1, 0).applyQuaternion(q);
    const a = _gaD.angleTo(fa), lo = 60 * Math.PI / 180, hi = 100 * Math.PI / 180;
    const want = a < lo ? lo : a > hi ? hi : a;
    if (Math.abs(want - a) < 1e-4) return q;
    _gaW.crossVectors(fa, _gaD);
    if (_gaW.lengthSq() < 1e-10) return q;
    _gaW.normalize();
    _gaR.setFromAxisAngle(_gaW, (want - a) * k);
    return q.premultiply(_gaR);
  }

  /** The trunk's reach additive (rad, + turns the left shoulder back) at this step of the sequence. */
  _bowYawAt(T) {
    const B = this._bp, t = B.t;
    if (B.mode === 1) {
      const tB = phaseEnd(T, 'B'), tC = phaseEnd(T, 'C'), tD = phaseEnd(T, 'D'), tE = phaseEnd(T, 'E');
      if (t < tC) return REACH_YAW * _sm(t / tB);
      if (t < tD) return REACH_YAW * (1 - 0.6 * _sm((t - tC) / (tD - tC)));
      return REACH_YAW * 0.4 * (1 - _sm((t - tD) / (tE - tD)));
    }
    if (B.mode === 2) {
      /* (M1a weapons round 2: the stow turns her trunk half as far as the unstow's reach: the hand only seats the bow, and
       *  every degree of it turns the lance on her back with her, which a swap to the lance counts in its turn, W4) */
      /* (...and it is back to her line by the release: a lance drawn next is taken off a still trunk, W4's first 0.15 m) */
      const tA = phaseEnd(T, 'A'), tB = phaseEnd(T, 'B'), tD = phaseEnd(T, 'D'), Y = REACH_YAW * 0.5;
      if (t < tB) return Y * _sm((t - tA) / (tB - tA));
      return Y * (1 - _sm((t - tB) / (tD - tB)));
    }
    return 0;
  }

  /** A new request (`want` the bow in her hand): start, reverse or abort, always from the pose rendered last step. */
  _bowRequest(want) {
    const B = this._bp;
    this._bowKitInit();
    const cmb = this.ctx.combat, mel = cmb?.melee;
    B.requestAt = B.simT;
    if (this._bpHandOk) B.from.copy(this._bpHand); else this._charOf(this.b.handL.bone, B.from);
    // (the palm, not the wrist: the paths are palm paths)
    this._liveW(this.b.handL.bone, _bpQ);
    B.from.add(_bpE.copy(this._bowPalmOff()).applyQuaternion(_bpQ));
    if (!B.tgtOk) { B.tgt.copy(this._bpHandOk ? this._bpHand : B.from); B.tgtOk = true; }
    // the palm's plan starts where the palm was drawn; the pole where the elbow stands off the shoulder-wrist line
    if (B.mode === 0) {
      B.pp.copy(B.from);
      this._liveW(this.b.handL.bone, B.hq); B.hqOk = true;
      const b = this.b;
      this._charOf(b.upArmL.bone, _bpA); this._charOf(b.loArmL.bone, _bpB); this._charOf(b.handL.bone, _bpC);
      _bpC.sub(_bpA).normalize(); _bpB.sub(_bpA);
      _bpB.addScaledVector(_bpC, -_bpB.dot(_bpC));
      if (_bpB.lengthSq() > 1e-4) B.pole.copy(_bpB.normalize());
    }
    if (want) {
      // a stow under way and the bow still in the hand: the unstow picks up after its grip, from where the bow is
      const inHand = B.mode === 2 && B.owner === 'handL';
      B.mode = 1; B.tempo = 'ask'; B.T = BOW_UNSTOW.ask;
      B.t = inHand ? phaseEnd(B.T, 'C') : 0;
      /* M1a weapons fix round 1 (W7, swap 2 to 1: 0.717 s, band 0.45-0.65): a hand that is already near the limb (it has
       * just seated the lance's butt at her left hip) does not spend the whole reach getting there: the reach starts as far
       * in as its distance allows at the palm plan's speed (x 1.3 for the path's bend). The plan is rate bound and the take
       * waits for the palm on its socket, so a shorter reach is never a jump */
      if (!inHand && B.kit) {
        this._bowKitNow(_bpQ2, _bpC); this._bowSockMesh(0, _bpG); this._bowPt(_bpQ2, _bpC, B.kitS, _bpG.x, _bpG.y, _bpG.z, _bpT);
        const tB = phaseEnd(B.T, 'B'), need = 1.3 * B.from.distanceTo(_bpT) / (PALM_STEP * 60);
        if (need < tB) B.t = tB - need;
      }
      if (inHand) B.qGrab.copy(B.q);
      if (!inHand) B.curl = Math.min(B.curl, CURL.open + 0.2);
    } else {
      // the lance asked for (key 2) is the player's request; the 8 s timer is the game's
      const asked = !!mel && (mel.stance === 'draw' || mel.stance === 'ready' || mel.stance === 'swing');
      B.tempo = asked ? 'ask' : 'timer';
      B.T = asked ? BOW_STOW.ask : BOW_STOW.timer;
      if (B.mode === 1 && B.owner === 'carry') {
        // an unstow before its grip: abort, the hand goes home (the stow's last phase), the bow never moved
        B.mode = 2; B.t = phaseEnd(B.T, 'D');
      } else {
        // (from the carry: the planned bow starts as combat's carried one; mid-unstow: where the plan has it)
        if (B.mode === 0) { this._bowCarryQ(B.q); B.s = 1; B.scale = 1; }
        B.mode = 2; B.t = 0;
      }
    }
    B.frames = 0; B.back = 0; B.takeWait = 0;
  }

  /** An owner change, stamped on the sim clock (the grip and release events). */
  _bowOwner(o) {
    const B = this._bp;
    B.owner = o;
    if (o === 'handL') B.gripAt = B.simT; else B.releaseAt = B.simT;
  }

  /** The two waypoints, riding spine_02 so a crouch or a lean carries the path (char, this step). */
  _bowPointNowSide(out) { return this._bowWaypoint(BOW_SIDE, 'sideL', out); }
  _bowPointNowPast(out) { return this._bowWaypoint(BOW_PAST_HIP, 'pastL', out); }
  _bowWaypoint(arr, key, out) {
    const B = this._bp, sp = this.b.spine2.bone;
    if (!B[key]) {
      // in spine_02's frame at the first use (she stands in her idle), kept
      this.model.updateMatrixWorld(true);
      B[key] = sp.worldToLocal(this.model.localToWorld(new THREE.Vector3().fromArray(arr)));
    }
    sp.updateWorldMatrix(true, false);
    return this.model.worldToLocal(sp.localToWorld(out.copy(B[key])));
  }

  /**
   * The cloth's prop capsules (cloth/propCaps.js, the brief's seam): the stowed Sabina's stave while she wears it on her
   * back (`stowBow`); in her hand `bowPathPose` sets `heldBow` from the bow as drawn. World metres; the radius takes in
   * the string's side of the stave.
   */
  _bowCapStowed() {
    const B = this._bp;
    if (!B?.kit || B.owner === 'handL') { clearPropCap(this, 'stowBow'); return; }
    this._bowKitNow(_bpQ2, _bpC);
    this._bowPt(_bpQ2, _bpC, B.kitS, 0, -0.72, -0.05, _bpA).applyMatrix4(this.model.matrixWorld);
    this._bowPt(_bpQ2, _bpC, B.kitS, 0, 0.72, -0.05, _bpB).applyMatrix4(this.model.matrixWorld);
    setPropCap(this, 'stowBow', _bpA, _bpB, 0.045);
    clearPropCap(this, 'heldBow');
  }

  /** Is the bow in her hand this step (combat shows its own bow on the hand node while true)? Null: no sequence yet. */
  bowInHand() {
    const B = this._bp;
    return B ? B.owner === 'handL' : null;
  }

  /**
   * Combat calls this right after placing its bow on the hand node (`_placeInHand`), with the bow's group. While the
   * sequence holds the bow, the group is posed on the PLANNED bow (char: `B.q`, the palm point, the slide and the scale),
   * handed over to combat's own carry pose as the unstow ends; no arrow on it while it runs.
   */
  bowPathPose(group) {
    const B = this._bp;
    if (!B || B.owner !== 'handL' || !group?.parent) { if (B) B.sockOk = false; return; }
    const node = group.parent, mdl = group.children[0], mesh = mdl?.children?.[0];
    if (!mdl || !mesh) return;
    // (the raised aim places the bow on the aim rig's own line: combat's; nothing here moves it)
    // (...and in the carry only while the carry layer holds the arm: through a roll or a death the clip has the hand, and
    //  combat's own carry placement holds the bow off her heading as before (A100's dodge: the kit's lance tipped to 87 deg)
    const aimed = B.mode === 0 && (!!this.ctx.player?.aiming || (this.aimWeight ?? 0) > 0.02 || (this._carryBowW ?? 0) < 0.98 || (this._dodgeW ?? 0) > 0.01);
    const cmb = this.ctx.combat;
    /* M1a weapons round 2 (W1, W2): the bow is posed FROM THE HAND that holds it, as drawn: its turn the one the fist
     * holds it in (`_bowForHand`), its socket on the palm. Round 1 posed it on the plan beside the hand (the palm 0.03-0.19
     * m off its socket, the fist closed through the stave) */
    const b = this.b;
    this._liveW(b.handL.bone, _bpQ3);
    const sNow = B.mode ? B.s : 1;
    this._bowForHand(_bpQ3, sNow, _bpQ4);
    this._charOf(b.handL.bone, _bpP).add(_bpE.copy(this._bowPalmOff()).applyQuaternion(_bpQ3));
    const scl = B.mode ? B.scale : 1;
    this._bowSockMesh(sNow, _bpG);
    _bpG.multiplyScalar(scl).applyQuaternion(_bpQ4);
    _bpP.sub(_bpG);
    if (!aimed) {
      // char -> world -> the hand node's frame, less the model's and the mesh's own offsets
      this.model.updateMatrixWorld(true);
      node.updateWorldMatrix(true, false);
      mdl.updateMatrix(); mesh.updateMatrix();
      _bpN.compose(_bpP, _bpQ4, _bpS.set(scl, scl, scl));
      _bpM.multiplyMatrices(this.model.matrixWorld, _bpN);                 // the mesh's world matrix, planned
      _bpN.multiplyMatrices(mdl.matrix, mesh.matrix).invert();
      _bpM.multiply(_bpN);                                                 // the group's world matrix
      _bpN.copy(node.matrixWorld).invert();
      _bpM.premultiply(_bpN);                                              // ...in the node's frame
      _bpM.decompose(_bpA, _bpQ, _bpB);
      // (the position hands over to combat's carry as the unstow ends; the turn is the plan's, which ends on combat's)
      // (M1a weapons round 2: from the hand in the carry too, so there is no hand-over to combat's carry pose to blend)
      group.position.copy(_bpA); group.quaternion.copy(_bpQ); group.scale.copy(_bpB);
      cmb?.bow?.setDraw?.(0, false);
    }
    // the socket the palm holds, as drawn (W1): the group's pose this step
    group.updateMatrixWorld(true);
    _bpG.set(0, 0, 0); this._bowSockMesh(sNow, _bpG);
    _bpG.applyMatrix4(mesh.matrixWorld);
    _bpM.copy(this.model.matrixWorld).invert();
    _bpG.applyMatrix4(_bpM);
    B.sockChar[0] = _bpG.x; B.sockChar[1] = _bpG.y; B.sockChar[2] = _bpG.z; B.sockOk = true;
    // (the cloth's capsule for the bow in her hand, as drawn this step)
    setPropCap(this, 'heldBow', _bpA.set(0, -0.72, -0.05).applyMatrix4(mesh.matrixWorld), _bpB.set(0, 0.72, -0.05).applyMatrix4(mesh.matrixWorld), 0.045);
  }

  /** The handling record (handling.js `makeHandlingInfo`), refilled in place: what the rows read. */
  handlingInfo() {
    const H = this._hInfo || (this._hInfo = makeHandlingInfo());
    const B = this._bowPathState();
    const o = H.bow;
    o.owner = B.owner; o.mode = B.mode; o.tempo = B.tempo; o.phase = B.phase; o.k = B.k; o.t = B.t; o.curl = B.curl;
    o.s = B.mode ? B.s : null; o.gripAt = B.gripAt; o.releaseAt = B.releaseAt; o.readyAt = B.readyAt; o.requestAt = B.requestAt;
    o.sockChar = B.sockOk ? B.sockChar : null; o.yaw = B.yaw;
    H.simT = B.simT;
    return H;
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

  /* ---------------- THE GRIP: the palm's frame and fingers closed ON a cylinder (M1a weapons round 2) ----------------
   * Round 1 closed every finger by one fixed curl about its own axis, and the weapon's axis ran through the palm point
   * (the bone line, 2 cm inside the palm): the fingers closed into the haft (W1: 60-700 finger joint-steps inside it, tips
   * 0.04-0.10 m off its surface) and the palm had no side (the palm-normal clause read 91.6 deg on every held step).
   * Now a hand holds a cylinder on its palm side: the axis lies `D` off the palm point along the palm's normal, and each
   * finger's two joints are solved (once a grip, in the hand's own frame) so its tip closes on the surface past the axis
   * and no joint is inside it. The palm normal is the one the rows read: the way the four fingers' first segments bend
   * off the line wrist-to-knuckle. */

  /** Hand-local palm normal (unit; the fingers' bend side), `side` 'l' | 'r'. Cached. With curls `c1` (one a finger). */
  _palmN(side, c1 = null) {
    const key = side === 'l' ? '_pnL' : '_pnR';
    if (!c1 && this[key]) return this[key];
    const list = side === 'l' ? this._fingerL : this._fingerR;
    const n = new THREE.Vector3(), f = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < 4 && i * 3 + 1 < list.length; i++) {
      const e1 = list[i * 3], e2 = list[i * 3 + 1];
      if (e1.isThumb || e2.isThumb) break;
      f.copy(e1.bone.position).normalize();
      q.copy(e1.bindQ).multiply(_q1.setFromAxisAngle(e1.curlAxis || Z_AXIS, c1 ? c1[i] : 0.6));
      d.copy(e2.bone.position).applyQuaternion(q);
      // (summed as they lie, not each normalised: the rows' palm normal, handling-bench `pn`)
      n.add(d.addScaledVector(f, -d.dot(f)));
    }
    n.normalize();
    if (!c1) this[key] = n;
    return n;
  }

  /** The hand bone's world scale over the model's (hand-local units -> char metres). */
  _handScale(side) {
    const hb = (side === 'l' ? this.b.handL : this.b.handR).bone;
    hb.updateWorldMatrix(true, false);
    _gaW.setFromMatrixScale(hb.matrixWorld);
    return _gaW.x / (this.model.getWorldScale(_gaF).x || 1);
  }

  /**
   * Solve the four fingers closed on a cylinder in the HAND's frame: axis through `pt` (char metres, hand-rotated, as
   * `palmOffL` is) along unit `dir`, radius `r` (m). Each finger's first joint and its middle joint (the end joint
   * follows at 0.9) are searched on a grid: the tip (the row's: the end joint plus 0.85 of the middle segment past it)
   * on the surface 4 mm out, past the axis's plane, every joint at least 3 mm outside. Returns [c1, c2] x 4. Cold (once
   * a grip).
   */
  _wrapSolve(side, pt, dir, r, nrm) {
    const list = side === 'l' ? this._fingerL : this._fingerR;
    const s = this._handScale(side);
    const out = new Float32Array(8);
    const P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), P3 = new THREE.Vector3(), T = new THREE.Vector3();
    const R1 = new THREE.Quaternion(), R2 = new THREE.Quaternion(), Rc = new THREE.Quaternion(), v = new THREE.Vector3();
    const dist = (p) => { v.subVectors(p, pt); v.addScaledVector(dir, -v.dot(dir)); return v.length() - r; };
    for (let i = 0; i < 4 && i * 3 + 2 < list.length; i++) {
      const e1 = list[i * 3], e2 = list[i * 3 + 1], e3 = list[i * 3 + 2];
      if (e1.isThumb) break;
      let best = 1e9, b1 = 0.8, b2 = 0.8;
      P1.copy(e1.bone.position).multiplyScalar(s);
      const d1 = dist(P1);
      for (let c1 = -0.2; c1 <= 1.7001; c1 += 0.05) {
        R1.copy(e1.bindQ).multiply(Rc.setFromAxisAngle(e1.curlAxis || Z_AXIS, c1));
        P2.copy(e2.bone.position).multiplyScalar(s).applyQuaternion(R1).add(P1);
        const d2 = dist(P2);
        for (let c2 = 0; c2 <= 1.9001; c2 += 0.05) {
          R2.copy(R1).multiply(e2.bindQ).multiply(Rc.setFromAxisAngle(e2.curlAxis || Z_AXIS, c2));
          P3.copy(e3.bone.position).multiplyScalar(s).applyQuaternion(R2).add(P2);
          const d3 = dist(P3);
          T.subVectors(P3, P2).multiplyScalar(0.85).add(P3);
          const dt = dist(T);
          let sc = Math.abs(dt - 0.004) + 0.002 * (c1 + c2);
          const jm = Math.min(d1, d2, d3);
          if (jm < 0.0015) sc += 1 + (0.0015 - jm) * 50;
          // (the tip closes round the far side of the axis, not onto the near face of it)
          v.subVectors(T, pt);
          if (v.dot(nrm) < 0) sc += 0.5 - v.dot(nrm) * 10;
          if (sc < best) { best = sc; b1 = c1; b2 = c2; }
        }
      }
      out[i * 2] = b1; out[i * 2 + 1] = b2;
    }
    return out;
  }

  /**
   * The grip's cylinder axis point (char metres, hand-rotated: the hand's local frame as `palmOffL` is) for a palm point
   * `palm` and an axis `dir` (both hand-local), `D` (m) off the palm along its normal square to the axis. Into `out`.
   */
  _gripAxisPt(n, palm, dir, D, out) {
    _gaE.copy(n).addScaledVector(dir, -n.dot(dir)).normalize();
    return out.copy(palm).addScaledVector(_gaE, D);
  }

  /**
   * A grip, built once and cached by `key`: the fingers' curls for a cylinder `D` off the palm point `palm` along `dir`
   * (hand-local), radius `r`. Three passes (the palm normal the rows read depends on the first joints' curls). Returns
   * { curls, axis (hand-local metric point), n (palm normal), D, r }.
   */
  _grip(side, key, palm, dir, D, r) {
    const G = this._grips || (this._grips = {});
    if (G[key]) return G[key];
    const pt = new THREE.Vector3(), d = dir.clone().normalize();
    let curls = null, n = this._palmN(side).clone();
    for (let pass = 0; pass < 3; pass++) {
      if (curls) n = this._palmN(side, [curls[0], curls[2], curls[4], curls[6]]);
      this._gripAxisPt(n, palm, d, D, pt);
      curls = this._wrapSolve(side, pt, d, r, n);
    }
    return (G[key] = { curls, axis: pt.clone(), n: n.clone(), D, r, dir: d });
  }

  /**
   * Close a hand's four fingers on a solved grip: each finger's joints SET to its bind turn plus its share of the solved
   * curl (`amt` 0 open .. 1 closed on the surface), the thumb added over it. Earlier layers' finger curls are replaced
   * (the hand holds a weapon: one finger pose).
   */
  _wrapFingers(side, grip, amt, thumbCurl, w = 1) {
    const list = side === 'l' ? this._fingerL : this._fingerR;
    if (!grip || w <= 1e-3) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.isThumb) { _q1.setFromAxisAngle(e.curlAxis || Z_AXIS, thumbCurl * w); e.bone.quaternion.multiply(_q1); continue; }
      const f = (i / 3) | 0, j = i % 3;
      const c = (j === 0 ? grip.curls[f * 2] : j === 1 ? grip.curls[f * 2 + 1] : 0.9 * grip.curls[f * 2 + 1]) * amt;
      _q1.setFromAxisAngle(e.curlAxis || Z_AXIS, c);
      _gaR.copy(e.bindQ).multiply(_q1);
      if (w >= 0.999) e.bone.quaternion.copy(_gaR); else e.bone.quaternion.slerp(_gaR, w);
    }
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
