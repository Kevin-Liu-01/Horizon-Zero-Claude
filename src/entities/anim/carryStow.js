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
import { BOW_UNSTOW, BOW_STOW, CURL as CURL0, RATE, KEEPER_SLIDE, phaseAt, phaseEnd, ease, makeHandlingInfo } from './handling.js';
/** (M1a weapons round 3: the reverse take's close stops at `take` until the grip event) */
const CURL = { ...CURL0, take: 0.74 };
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
const REACH_YAW = 0.122;
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
/** M1a weapons round 3 (W3/W8): the bow's hand-over between the fist's carry and combat's placement (the raised aim, a
 *  roll): at most this long either way, and the drawn bow turns at most RAISE_STEP (rad) a step while it runs */
const RAISE_S = 0.30, RAISE_STEP = 9.5 * Math.PI / 180;
/** M2 wave 0: the share of the raise (the aim weight) through which the bow stays posed from the fist */
const RAISE_HOLD = 0.5;
/*
 * M1a weapons round 3: THE UNSTOW'S TABLE, with the regrip (the wave 3 ruling). A anticipate, B reach round the hip, C
 * close on the limb (the GRIP event at its end), D out of the keeper and round the hip in the reverse fist, R the two-hand
 * regrip in front of the hip, E the carry's fist, F settle. Seconds of sim time (`handling.js` phaseAt / phaseEnd).
 */
const _tbl = (phases, ev) => { let t = 0; const ends = phases.map(([, x]) => (t += x)); return { phases, ends, total: t, ...ev }; };
const BOW_UNSTOW_R = {
  ask: _tbl([['A', 0.017], ['B', 0.100], ['C', 0.033], ['D', 0.133], ['R', 0.067], ['E', 0.033], ['F', 0.001]], { grip: 'C' }),
  timer: _tbl([['A', 0.033], ['B', 0.133], ['C', 0.050], ['D', 0.133], ['R', 0.133], ['E', 0.050], ['F', 0.017]], { grip: 'C' }),
};
/** the palm's bound as the regripped bow goes out to the carry (m a step: with the fist's turn the wrist stays under 0.08) */
const PALM_STEP_E = 0.058;
/** the keeper slide's time from the grip (s): 0.10 m down the limb before the bow turns at all (W5) */
const SLIDE_S = 0.055;
/** M1a weapons round 3 (W10): a roll takes the sequence's arm over this long, and gives it back over it after (s) */
const ROLL_IN_S = 0.2;
/** the most each regrip hand-off waits on its hand (s of the sequence's clock) */
const REGRIP_WAIT = 0.083, REGRIP_WAIT_L = 0.15;
/** the bow's axis off the carry's line (rad) under which the left closes the carry's way (W1's wrist from there) */
const REGRIP_AX = 0.15;
/*
 * M1a weapons round 3: THE STOW'S TABLE, the unstow's mirror. R the two-hand regrip in front of the hip (the left brings
 * the bow in from the carry, the right takes the upper limb, the left opens, turns over and closes REVERSED on the limb),
 * D round her hip in the reverse fist onto the keeper's line 0.10 m short of it, S seated up its own limb (the RELEASE
 * event at its end), E the open hand home.
 */
const BOW_STOW_R = {
  ask: _tbl([['R', 0.133], ['D', 0.133], ['S', 0.050], ['E', 0.083]], { release: 'S' }),
  timer: _tbl([['R', 0.183], ['D', 0.183], ['S', 0.067], ['E', 0.100]], { release: 'S' }),
};
/** the left fist's turn bound in the regrip (rad a step: it turns over, ~180 deg, open, in R) */
const HAND_TURN_REGRIP = 0.8;
/** how far the open left hand passes off the stave as it turns over round it (m) */
const REGRIP_OUT = 0.07;
/** where the regrip happens: the carry's palm moved in toward her middle and forward (char m); E carries it out to the carry */
const REGRIP_SHIFT = [-0.15, 0.08, 0.06];
/** ...as a point off spine_02 (char m; standing, spine_02 at [-0.008, 1.103, 0.070]): it rides a crouch and a lean (the
 *  crouch drops spine_02 0.56 m, the carry's own goal only 0.30) */
const REGRIP_OFF = [0.133, -0.135, 0.165];
/** M2 wave 0, the quick draw (RMB from stowed): the right fingers' pinch on the arrow at the quiver, and how many steps the
 *  palm stays on the quiver's point before it goes on to the bow */
const QUICK_PINCH = 0.55, QUICK_PULL = 2;
/** ...and its palm's bound on the way (m a step: W3's 0.08 on the wrist, the hand's turn added: 0.075 read 0.0801, 0.073 0.0781; at 0.071 the right came to the bow a step late and the left's palm left its plan 0.039 m while R waited on it) */
const QUICK_STEP = 0.073;
const _qpP = new THREE.Vector3();
/** the right hand's take on the upper limb (mesh units up the stave from the riser's centre) */
const BOW_UPPER_Y = 0.12;
/** the right arm's pole as it reaches across her to the bow in front of her left hip (char, unit after normalise) */
const BOW_POLE_R = [-0.55, -0.70, -0.35];
const _rvA = new THREE.Vector3(), _rvB = new THREE.Vector3(), _rvC = new THREE.Vector3(), _rvS = new THREE.Vector3();
const _rvT = new THREE.Vector3(), _rvU = new THREE.Vector3(), _rvO = new THREE.Vector3(), _rvP = new THREE.Vector3();
const _rvQ = new THREE.Quaternion(), _rvQ2 = new THREE.Quaternion(), _rvQ3 = new THREE.Quaternion(), _rvQ4 = new THREE.Quaternion();
const _rhA = new THREE.Vector3(), _rhB = new THREE.Vector3(), _rhQ = new THREE.Quaternion(), _rhQ2 = new THREE.Quaternion();
const _rdP = new THREE.Vector3(), _rdQ = new THREE.Quaternion(), _rdQ2 = new THREE.Quaternion(), _rdD = new THREE.Quaternion();
/** M1a weapons round 3: the carried stave's band off the forearm (deg), `_bowCarryAxis` */
const CARRY_STAVE_F = [60, 92];
/** the carry's forearm (char, elbow to wrist, the carry layer's IK standing): the unstow plans the carry's line off it */
const CARRY_FA = [-0.04, -0.97, 0.24];
/** the carried stave's turn bound (rad a step): the carry follows the forearm's band without a cut */
const CARRY_AX_STEP = 6 * Math.PI / 180;
const _caQ = new THREE.Quaternion(), _caA = new THREE.Vector3(), _caR = new THREE.Quaternion(), _caF = new THREE.Vector3(), _caB = new THREE.Vector3();
const _rlQ = new THREE.Quaternion(), _rlQ2 = new THREE.Quaternion(), _rlQ3 = new THREE.Quaternion();
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
      // (M1a weapons round 3: the stave in the band off the forearm the IK above left, `_bowCarryAxis`)
      this._charOf(b.loArmL.bone, _caB); this._charOf(b.handL.bone, _caF); _caF.sub(_caB).normalize();
      this._bowCarryAxis(_gaE, _caF);
      // (turned toward it at CARRY_AX_STEP from where it was drawn: from the unstow's end, a run's swing, a crouch)
      if (!this._carryAx) this._carryAx = new THREE.Vector3().copy(_gaE);
      if ((this._bp?.dqAt ?? -9) < (this._bp?.simT ?? 0) - 0.05 && this._bp?.dqOk === false) this._carryAx.copy(_gaE);
      turnToward(this._carryAx, _gaE, CARRY_AX_STEP * (this._dtA || 1 / 60) * 60);
      _gaE.copy(this._carryAx);
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
      // M1a weapons round 3: the reverse take and the regrip (the stave's axis on her back, the bow in the reverse fist's
      // frame, the bow's origin as planned, the fist's wanted turn and how it is chosen, which grip holds it, how the bow
      // is posed: 'rev' from the reverse fist, 'plan' on the plan, 'hand' from the carry's fist)
      revAxis: new THREE.Vector3(), relQ: new THREE.Quaternion(), org0: new THREE.Vector3(), org: new THREE.Vector3(), orgR: new THREE.Vector3(),
      hqWant: new THREE.Quaternion(), hqRev: new THREE.Quaternion(), hqRevOk: false, hqMode: null, turnMax: 0, gripKind: null, pose: 'hand',
      sockN: [0, 0, 0], sockNOk: false,
      // the right hand on the upper limb through the regrip: its palm plan, turn, weight, curl, phase
      rp: new THREE.Vector3(), rq: new THREE.Quaternion(), rw: 0, rc: 0, rOn: 0, rBack: 0, rRel: 0, rMiss: 9, rHold: false, carryPalm: new THREE.Vector3(),
      rHeld: false, relRQ: new THREE.Quaternion(), relRP: new THREE.Vector3(), revPalm: new THREE.Vector3(), revPalmOk: false, orgROk: false,
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

  /**
   * M1a weapons round 3 (W1's wrist, graded in the carry after the regrip: 40 deg of deviation standing, 61-66 at a run):
   * the carried stave's axis (char): combat's carry line turned, in the plane it makes with the forearm `fa` (unit, char,
   * elbow to wrist), into CARRY_STAVE_F off it. The fist's grip axis lies 68 deg off its own long axis (the rig), so a
   * stave 60-92 deg off the forearm is held with the wrist within -24..+8 deg of straight; combat's line stood 109 deg
   * off it. `fa` null: combat's line. Into `out`; the bow's turn about it into `q` when given.
   */
  _bowCarryAxis(out, fa, q = null) {
    const qq = this._bowCarryQ(q || _caQ);
    out.set(0, 1, 0).applyQuaternion(qq);
    if (!fa || fa.lengthSq() < 0.5) return out;
    const a = out.angleTo(fa), lo = CARRY_STAVE_F[0] * Math.PI / 180, hi = CARRY_STAVE_F[1] * Math.PI / 180;
    const want = a < lo ? lo : a > hi ? hi : a;
    if (Math.abs(want - a) < 1e-5) return out;
    _caA.crossVectors(fa, out);
    if (_caA.lengthSq() < 1e-10) return out;
    _caR.setFromAxisAngle(_caA.normalize(), want - a);
    out.applyQuaternion(_caR);
    if (q) q.premultiply(_caR);
    return out;
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
    if (B.mode === 0) { B.w = 0; B.inHand = B.owner === 'handL'; B.phase = ''; B.yaw = 0; this._bowRightHand(dt); return 0; }
    if (!B.kit) { this._bowKitInit(); if (!B.kit) { B.mode = 0; B.owner = want ? 'handL' : 'carry'; B.inHand = want; return 0; } }
    /* M1a weapons round 3 (W10, a roll mid-sequence: "the arm goes to the roll over 5 f ... the sequence resumes at its
     * present phase on landing"): while she rolls the sequence's clock holds and its arm weight goes out over ROLL_IN_S,
     * so the roll's own clip takes the arm (a bow in the fist rides it, posed from the fist); after the roll the palm's
     * plan starts again from the hand as drawn and the weight comes back in over the same time */
    const rolling = !!this.ctx.player?.dodging;
    B.rollK = clamp((B.rollK || 0) + (rolling ? 1 : -1) * dt / ROLL_IN_S, 0, 1);
    if (rolling && !B.rollWas && this._bpHandOk) B.rollFrom = true;
    B.rollWas = rolling;
    if (B.rollK > 0 && this._bpHandOk) {
      // (the plan follows the drawn hand while the roll has it)
      this._liveW(b.handL.bone, _bpQ);
      B.pp.copy(this._bpHand).add(_bpE.copy(this._bowPalmOff()).applyQuaternion(_bpQ));
      if (B.rOn && this._bpHandR && this.melee?.palmOffL) { this._liveW(b.handR.bone, _bpQ); B.rp.copy(this._bpHandR).add(_bpE.copy(this.melee.palmOffL).applyQuaternion(_bpQ)); }
    }
    if (B.rollK < 0.5) B.t += dt;
    B.frames++;
    /* M1a weapons round 2 (W2 at the grip): the take is an event on the hand, not the clock: at the end of the close the
     * sequence waits (at most BOW_TAKE_WAIT) until the palm is on the limb's socket, so the bow leaves the keeper in the
     * fist, not beside it */
    if (B.mode === 1 && B.owner === 'carry' && B.T) {
      const tG = phaseEnd(B.T, 'C');
      if (B.t >= tG && ((B.palmMiss ?? 9) > BOW_TAKE_TOL || (B.turnMiss || 0) > 0.012) && (B.takeWait || 0) < BOW_TAKE_WAIT) { B.takeWait = (B.takeWait || 0) + dt; B.t = tG - 1e-4; }
    }
    /* (M1a weapons round 3: the regrip's two hand-offs are events too: the left opens (R) only once the right has closed
     *  on the upper limb, and E (the left's fist the carry's way) only once the left is on the riser within 8 mm and 3 deg;
     *  each waits at most REGRIP_WAIT) */
    if (B.mode === 1 && B.owner === 'handL' && B.T && B.T.phases.some((x) => x[0] === 'R')) {
      const tD = phaseEnd(B.T, 'D'), tR = phaseEnd(B.T, 'R');
      if (B.t >= tD && B.t < tD + dt && !B.rHeld && (B.rWait || 0) < REGRIP_WAIT && B.gripKind === 'rev') { B.rWait = (B.rWait || 0) + dt; B.t = tD - 1e-4; }
      // (...and the carry's fist closes once the bow is within REGRIP_AX of the carry's line: the wrist bar holds from there)
      if (B.t >= tR && B.pose === 'right' && ((B.palmMiss ?? 9) > 0.008 || (B.lTurnMiss ?? 9) > 0.052 || (B.axMiss ?? 9) > REGRIP_AX) && (B.lWait || 0) < REGRIP_WAIT_L) { B.lWait = (B.lWait || 0) + dt; B.t = tR - 1e-4; }
    }
    // ...and the stow's release: the fist lets go once the bow is seated in its keeper
    if (B.mode === 2 && B.owner === 'handL' && B.T) {
      const tR = phaseEnd(B.T, B.T.release || 'D');
      // (M1a weapons fix round 1, W2 at the release in swap 1 to 2: 0.094 m / 6.6 deg; the asked stow's turn, held to W3's
      //  rate, was still short of the keeper's line: the release waits on the bow's own turn too)
      if (B.t >= tR && ((B.palmMiss ?? 9) > BOW_TAKE_TOL || (B.turnMiss || 0) > 0.012 || (B.kitMiss || 0) > 0.012) && (B.takeWait || 0) < BOW_TAKE_WAIT) { B.takeWait = (B.takeWait || 0) + dt; B.t = tR - 1e-4; }
    }
    const T = B.T, ph = phaseAt(T, B.t, _bpPH), i = ph[0], k = ph[1], name = T.phases[i][0];
    B.phase = name; B.k = k;
    // the trunk's reach first (the stowed bow rides spine_02, so every goal below is read after it): spine_02 turns the
    // left shoulder back, the neck takes the turn back out so the head stays on its line; faded out under the aim (W11)
    const aimW = this.aimWeight ?? 0;
    const yaw = this._bowYawAt(T) * (1 - Math.min(1, 2 * aimW)) * (1 - _sm(B.rollK || 0));
    B.yaw = yaw;
    if (Math.abs(yaw) > 1e-5) { this._rot(b.spine2, Y_AXIS, yaw); if (b.neck1) this._rot(b.neck1, Y_AXIS, -yaw); }
    // (the plans ride spine_02 as it stands now, the reach's turn in it: the keeper on her back turns with it)
    this._bowRide(B);
    const palmOff = this._bowPalmOff();
    this._liveW(b.handL.bone, _bpQ);                // the hand as it stands this step (clip and earlier layers)
    const kitQ = _bpQ2, kitO = _bpC;
    this._bowKitNow(kitQ, kitO);
    let w = 1, curl = B.curl, rot = 0;              // IK weight, finger target, the hand's grip turn weight
    if (B.mode === 1) {
      /* ---- the unstow. M1a weapons round 3 (the wave 3 ruling: "the stowed bow's diagonal makes an index-up take at
       * waist height unreachable with a natural wrist. The take is a reverse grip at the small of the back, then a two-hand
       * regrip in front of the hip on the way to the carry"): the left fist closes on the limb at the small of her back
       * REVERSED (index toward the lower limb, the palm onto her back, the straightest wrist that holds it: `_handOnStave`
       * sigma -1); the bow leaves its keeper down its own limb in that fist and swings round her hip to the carry's line
       * (D); in front of the hip the RIGHT hand takes the upper limb, the left opens, turns over and closes on the riser
       * the carry's way (R); the right lets go and goes back to its swing (E, and on past the end: `_bowRightHand`) */
      const tGrip = phaseEnd(T, 'C'), tD = phaseEnd(T, 'D'), tR = phaseEnd(T, 'R');
      const GL = this._bowGrip(0), LP = SOCKETS.bow.limb.p;
      _rvA.set(0, 1, 0).applyQuaternion(kitQ);                               // the stave on her back (char)
      if (B.t < tGrip || !GL) {
        // A, B: reach round the hip to the limb, the hand opening; C: close. The fist's turn is the reverse grip's
        // straightest wrist, solved on the arm the IK leaves (the IK passes below, `hqMode` 'rev')
        B.hqMode = 'rev'; B.revAxis.copy(_rvA); B.gripKind = null; B.pose = 'kit';
        this._bowPt(kitQ, kitO, B.kitS, LP[0], LP[1], LP[2], _rvS);           // the limb's centreline point (char)
        // the palm's goal: the limb's point less the fist's palm-to-axis offset, as the fist is turned now
        if (GL) _bpT.copy(_rvS).sub(_rvO.copy(GL.axis).sub(palmOff).applyQuaternion(B.hq)); else _bpT.copy(_rvS);
        if (!B.sockGoal) B.sockGoal = new THREE.Vector3();
        B.sockGoal.copy(_bpT);
        const tB = phaseEnd(T, 'B');
        const u = _sm(B.t / tB);
        this._bowPointNowSide(_bpA);
        bez(B.from, _bpA, _bpT, u, _bpP);                                     // the palm's path (from where it was)
        B.palm.copy(_bpP);
        /* (the fingers close round the limb through C but stop short of the grip's curl until the take: while the take waits
         *  on the palm they go on closing a little a step, and the grip's own step closes them, so the close rises into the
         *  grip event, W1) */
        curl = name === 'C' ? CURL.open + (CURL.take - CURL.open) * _sm(k) + 0.012 * Math.round((B.takeWait || 0) / dt) : CURL.open;
        w = 1;
        rot = _sm(B.t / tB);
        B.q.copy(kitQ); B.scale = B.kitS; B.s = 0; B.keep = 0;
        if (B.owner !== 'carry') this._bowOwner('carry');
      } else {
        if (B.owner !== 'handL') {
          this._bowOwner('handL');
          /* the GRIP: the bow as the fist holds it from this step: the limb's centreline through the fist's grip axis, the
           * stave's top along the fist's reversed index, the bow's own roll about it as it lay in the keeper (the take
           * waited until the palm was within 6 mm and the fist within 0.7 deg of that) */
          _rvQ.copy(B.hq);                                                      // the fist as it was drawn last step
          _rvB.copy(GL.dir).applyQuaternion(_rvQ).negate().normalize();
          _rvQ2.setFromUnitVectors(_rvA, _rvB).multiply(kitQ);                 // the bow (char)
          B.relQ.copy(_rvQ).invert().multiply(_rvQ2);                          // ...in the fist's frame
          B.q.copy(_rvQ2); B.qGrab.copy(_rvQ2);
          B.org0.copy(kitO);
        }
        B.s = 0; B.keep = 0;
        const kd = clamp((B.t - tGrip) / (tD - tGrip), 0, 1), kr = clamp((B.t - tD) / (tR - tD), 0, 1);
        // (the keeper slide, SLIDE_S from the grip; then the swing round her hip, `kp`, to the end of D)
        const ks = clamp((B.t - tGrip) / SLIDE_S, 0, 1), kp = clamp((B.t - tGrip - SLIDE_S) / Math.max(1e-3, tD - tGrip - SLIDE_S), 0, 1);
        // (the swing round her hip waits until the fist HAS slid it out, not only the clock: crouched the palm's plan was
        //  0.02 m short of the keeper's end when the turn began, and the bow's tip left it 74 deg off its axis, W5)
        if (ks >= 1 && !B.slid && ((B.pp.distanceTo(B.palm) < 0.006 && (B.palmMiss ?? 9) < 0.01) || B.t >= tGrip + 3 * SLIDE_S)) B.slid = true;
        const slid = !!B.slid;
        // the carry's line (combat's carry, its axis) and the bow turned onto it as the left fist will hold it there
        // (off the carry's own forearm, not the moving one: the live forearm turned with the bow and the target ran ahead)
        this._bowCarryAxis(_rvB, _caF.fromArray(CARRY_FA).normalize());
        // the bow's turn this step: on her back's line through the keeper slide, then round onto the carry's line, turned
        // about it as the carry's fist holds it (so the hand-over to that fist is still); the rate bound makes it even
        this._handOnStave(_rvB, 1, _rvQ);
        this._bowForHand(_rvQ, 1, _rvQ4);
        if (!slid) _bpQ4.copy(B.qGrab); else _bpQ4.copy(_rvQ4);
        const maxA = RATE.bowDeg * Math.PI / 180 * dt;
        const a = B.q.angleTo(_bpQ4);
        if (a > maxA) B.q.slerp(_bpQ4, maxA / a); else B.q.copy(_bpQ4);
        B.scale = B.kitS + (1 - B.kitS) * _sm((B.t - tGrip) / (tR - tGrip));
        // the carry's palm (the carry's wrist goal plus the palm, the fist on the riser) and the bow's origin with its
        // riser there: where the regrip happens
        this._handOnStave(_rvB, 1, _rvQ);
        _rvP.fromArray(CARRY_GRIP); _rvP.y -= 0.30 * this._crouchW;
        _rvP.add(_rvO.copy(palmOff).applyQuaternion(_rvQ));
        B.carryPalm.copy(_rvP);
        // (the regrip's place: in toward her middle and forward of the carry's; E takes it out to the carry)
        const kE = B.t >= tR ? _sm((B.t - tR) / Math.max(1e-3, phaseEnd(T, 'E') - tR)) : 0;
        this._bowRegripPt(_rvT);
        _rvP.lerpVectors(_rvT, _rvP, kE);
        this._bowSockMesh(1, _bpG);
        _rvO.copy(_rvP).sub(_bpG.multiplyScalar(B.scale).applyQuaternion(B.q));          // origin, the regrip's (char)
        if (B.t < tD) {
          /* D: in the reverse fist. The limb's point: out of the keeper down its own limb (the first 0.6 of D), then round
           * past the hip to where the carry puts it; the fist turned to hold the planned bow (`relQ`) */
          B.pose = 'rev'; B.gripKind = 'rev'; B.hqMode = 'want';
          B.hqWant.copy(B.q).multiply(_rvQ2.copy(B.relQ).invert());
          this._bowPt(B.qGrab, B.org0, B.kitS, LP[0], LP[1], LP[2], _rvS);
          // (smootherstep: the grip's own step moves it under W2's 0.02 m)
          _rvS.addScaledVector(_rvC.set(0, -1, 0).applyQuaternion(B.qGrab), KEEPER_SLIDE * ks * ks * ks * (ks * (ks * 6 - 15) + 10));
          _rvT.set(LP[0], LP[1], LP[2]).multiplyScalar(B.scale).applyQuaternion(B.q).add(_rvO);   // ...at the carry
          this._bowPointNowPast(_bpA);
          if (!slid) _rvU.copy(_rvS);
          else bez(_rvS, _bpA, _rvT, _sm(kp), _rvU);
          // the palm: the limb's point less the fist's palm-to-axis offset as the fist holds it this step
          _bpP.copy(_rvU).sub(_rvC.copy(GL.axis).sub(palmOff).applyQuaternion(B.hq));
          B.palm.copy(_bpP);
          curl = CURL.closed; rot = 1; w = 1;
          B.org.copy(_rvU).sub(_rvC.set(LP[0], LP[1], LP[2]).multiplyScalar(B.scale).applyQuaternion(B.q));
          // (R starts from the bow as the fist drew it last step: `bowPathPose` keeps it)
          B.orgR.copy(B.orgDrawnOk ? B.orgDrawn : B.org);
        } else if (B.t < tR) {
          /* R: the regrip. The RIGHT fist holds the bow (it closed on the upper limb at D's end: `_bowRightHand` keeps the
           * bow in its frame, `relR`, and drives it on the plan: its origin from where the reverse fist left it to the
           * regrip's, its turn at the bound); the left opens, leaves the stave, turns over round it and closes on the
           * riser the carry's way, on the bow as the right fist has it */
          B.pose = 'right';
          if (!B.orgROk) { B.orgR.copy(B.org); B.orgROk = true; }
          B.org.lerpVectors(B.orgR, _rvO, _sm(kr / 0.7));                      // the plan's origin (the right drives it)
          // the fist's two turns: as it let go (reverse) and the one that holds the DRAWN bow on its riser
          if (!B.hqRevOk) { B.hqRev.copy(B.hq); B.hqRevOk = true; }
          // (the plan this step: the right fist drives the bow onto it, a step ahead of the bow it drew last step)
          const qd = B.q, od = B.org;
          this._handForBow(qd, 1, _rvQ);
          const kt = _sm((kr - 0.1) / 0.6);
          B.hqWant.copy(B.hqRev).slerp(_rvQ, kt); B.hqMode = 'want';
          B.turnMax = HAND_TURN_REGRIP;

          // the palm: off the reverse socket, out round the stave (forward and down of it), onto the riser's socket
          this._bowSockMesh(1, _bpG);
          _rvT.copy(_bpG).multiplyScalar(B.scale).applyQuaternion(qd).add(od);                    // the riser's palm point
          if (!B.revPalmOk) { B.revPalm.copy(B.pp); B.revPalmOk = true; }
          _rvC.set(0, 1, 0).applyQuaternion(qd);
          _rvU.set(0, -0.45, 1); _rvU.addScaledVector(_rvC, -_rvC.dot(_rvU)).normalize();
          _bpA.lerpVectors(B.revPalm, _rvT, 0.5).addScaledVector(_rvU, REGRIP_OUT);
          bez(B.revPalm, _bpA, _rvT, _sm((kr - 0.1) / 0.6), _bpP);
          B.palm.copy(_bpP);
          if (!B.sockGoal) B.sockGoal = new THREE.Vector3();
          B.sockGoal.copy(_rvT);
          curl = kr < 0.7 ? CURL.open : CURL.closed;
          B.gripKind = 'regrip';
          if (kr >= 0.7) B.s = 1;
          rot = 1; w = 1;
        }
        if (B.t >= tR) {
          // E: the left fist holds it the carry's way (it closed on the riser within 8 mm and 3 deg: the wait above); the
          // bow is posed from it; the right lets go
          if (B.pose === 'right') { B.q.copy(B.qDrawnR || B.q); }
          B.pose = 'hand'; B.gripKind = 'norm'; B.hqMode = 'want'; B.s = 1; B.turnMax = 0; B.palmStep = PALM_STEP_E;
          // (the fist that holds the planned bow on its riser: the bow drawn from it is the plan's, turning at its bound)
          this._handForBow(B.q, 1, B.hqWant);
          curl = CURL.closed; rot = 1; w = 1;
          _bpP.copy(_rvP); B.palm.copy(_bpP);
          B.org.copy(_rvO);
        }
        B.blendC = 0;
        B.axMiss = _rvC.set(0, 1, 0).applyQuaternion(B.q).angleTo(_rvB);
        if (B.t >= T.total && _rvC.set(0, 1, 0).applyQuaternion(B.q).angleTo(_rvB) < 0.087 && B.pp.distanceTo(B.palm) < 0.02) {
          B.mode = 0; B.readyAt = B.simT; this._carryBowW = 1; B.pose = 'hand'; B.gripKind = 'norm'; B.hqMode = null;
          (this._carryAx || (this._carryAx = new THREE.Vector3())).set(0, 1, 0).applyQuaternion(B.q);
        }
      }
    } else if (B.mode === 2) {
      /* ---- the stow. M1a weapons round 3: the unstow's mirror (the wave 3 ruling's regrip, the reverse fist at the
       * keeper): the left brings the bow in from the carry, the right takes its upper limb (a grip event), the left opens,
       * turns over and closes REVERSED on the limb (an event), the right lets go; the reverse fist takes it round her hip
       * onto the keeper's line 0.10 m short, seats it up its own limb and lets go once it lies in the keeper (the release
       * event); the open hand goes home */
      const tR = phaseEnd(T, 'R'), tD = phaseEnd(T, 'D'), tRel = phaseEnd(T, 'S');
      const GL = this._bowGrip(0), LP = SOCKETS.bow.limb.p;
      if (B.t < tRel && GL) {
        if (B.owner !== 'handL') this._bowOwner('handL');
        // the bow's turn: held through the regrip, then round onto her back's line (the kit's), at the bound
        const maxA = RATE.bowDeg * Math.PI / 180 * dt;
        _bpQ4.copy(B.t < tR && !B.revOk ? B.q : kitQ);
        if (B.t >= tR || B.lOpen) _bpQ4.copy(kitQ);
        const a = B.q.angleTo(_bpQ4);
        if (a > maxA) B.q.slerp(_bpQ4, maxA / a); else B.q.copy(_bpQ4);
        B.kitMiss = B.q.angleTo(kitQ);
        if (!B.revOk) {
          /* R: the regrip. Before the right has it: the carry's fist brings it in to the regrip's place ('hand'); then the
           * right fist holds it ('right', `_bowRightHand`) and the left turns over onto the limb reversed */
          this._bowRegripPt(_rvP);
          if (!B.lOpen) {
            B.pose = 'hand'; B.gripKind = 'norm'; B.hqMode = 'want'; B.s = 1;
            this._handForBow(B.q, 1, B.hqWant);
            _bpP.copy(_rvP); B.palm.copy(_bpP);
            curl = CURL.closed;
            B.org.copy(_rvP).sub(_bpG.set(0, 0, 0).copy(this._bowSockMesh(1, _bpG)).multiplyScalar(B.scale).applyQuaternion(B.q));
            if (B.rHeld) { B.lOpen = true; B.hqRevOk = false; B.revPalmOk = false; B.orgROk = false; }
          }
          if (B.lOpen) {
            B.pose = 'right'; B.gripKind = 'regrip'; B.hqMode = 'want'; B.turnMax = HAND_TURN_REGRIP;
            // the plan holds where the right has it (the right drives it: `_bowRightHand`, from B.q and B.org)
            if (!B.orgROk) { B.orgR.copy(B.orgDrawnR || B.org); B.orgROk = true; }
            B.org.copy(B.orgR);
            if (!B.hqRevOk) { B.hqRev.copy(B.hq); B.hqRevOk = true; }
            // the reverse fist that holds this bow on its limb (the straightest wrist), and its palm there
            this._handOnStave(_rvC.set(0, 1, 0).applyQuaternion(B.q), -1, _rvQ);
            // (the regrip's own clock is sim time: R's end may hold the sequence's clock while it waits on the events)
            if (B.lOpenAt == null) B.lOpenAt = B.simT;
            B.hqWant.copy(B.hqRev).slerp(_rvQ, _sm(clamp((B.simT - B.lOpenAt) / 0.06, 0, 1)));
            _rvS.set(LP[0], LP[1], LP[2]).multiplyScalar(B.scale).applyQuaternion(B.q).add(B.org);
            _rvT.copy(_rvS).sub(_rvC.copy(GL.axis).sub(palmOff).applyQuaternion(_rvQ));            // the reverse palm
            if (!B.revPalmOk) { B.revPalm.copy(B.pp); B.revPalmOk = true; }
            _rvC.set(0, 1, 0).applyQuaternion(B.q);
            _rvU.set(0, -0.45, 1); _rvU.addScaledVector(_rvC, -_rvC.dot(_rvU)).normalize();
            _bpA.lerpVectors(B.revPalm, _rvT, 0.5).addScaledVector(_rvU, REGRIP_OUT);
            const kk = clamp((B.simT - B.lOpenAt) / 0.083, 0, 1);
            bez(B.revPalm, _bpA, _rvT, _sm(kk), _bpP);
            B.palm.copy(_bpP);
            if (!B.sockGoal) B.sockGoal = new THREE.Vector3();
            B.sockGoal.copy(_rvT);
            B.s = 0;
            const on = kk >= 0.999 && (B.palmMiss ?? 9) < 0.008 && (B.lTurnMiss ?? 9) < 0.052;
            curl = kk < 0.75 ? CURL.open : CURL.take + 0.012 * Math.round((B.sWait || 0) / dt);
            if (on && B.curl >= CURL.take - 0.02) {
              // the left's REVERSE grip on the limb (an event): the bow in its frame from here
              curl = CURL.closed;
              // (the bow as the right fist drew it: the left's frame takes it from there, no step)
              if (B.qDrawnR) B.q.copy(B.qDrawnR);
              B.relQ.copy(B.hq).invert().multiply(B.q);
              B.revOk = true; B.lOpenAt = null; B.pose = 'rev'; B.gripKind = 'rev';
              B.hqWant.copy(B.hq);
              B.orgS0 = (B.orgS0 || new THREE.Vector3()).copy(B.org);
            }
          }
          // the regrip waits at R's end on the two events (at most REGRIP_WAIT_L)
          if (B.t >= tR - 1e-4 && !B.revOk && (B.sWait || 0) < REGRIP_WAIT_L) { B.sWait = (B.sWait || 0) + dt; B.t = tR - 1e-4; }
          rot = 1; w = 1;
        } else {
          /* D, S: in the reverse fist, round her hip onto the keeper's line 0.10 m short, then up into it */
          B.pose = 'rev'; B.gripKind = 'rev'; B.hqMode = 'want'; B.s = 0;
          B.hqWant.copy(B.q).multiply(_rvQ2.copy(B.relQ).invert());
          if (!B.stowLimb0) { B.stowLimb0 = new THREE.Vector3(); _rvS.set(LP[0], LP[1], LP[2]).multiplyScalar(B.scale).applyQuaternion(B.q).add(B.orgS0 || B.org); B.stowLimb0.copy(_rvS); }
          const kd = clamp((B.t - tR) / (tD - tR), 0, 1), ks = clamp((B.t - tD) / (tRel - tD), 0, 1);
          B.scale = 1 + (B.kitS - 1) * _sm(kd);
          this._bowPt(kitQ, kitO, B.kitS, LP[0], LP[1], LP[2], _rvT);                         // the limb, seated
          _rvC.set(0, -1, 0).applyQuaternion(kitQ);
          _rvU.copy(_rvT).addScaledVector(_rvC, KEEPER_SLIDE);                                 // ...0.10 m short
          this._bowPointNowPast(_bpA);
          if (B.t < tD) bez(B.stowLimb0, _bpA, _rvU, _sm(kd), _rvS);
          else _rvS.copy(_rvU).addScaledVector(_rvC, -KEEPER_SLIDE * ks * ks * ks * (ks * (ks * 6 - 15) + 10));
          _bpP.copy(_rvS).sub(_rvC.copy(GL.axis).sub(palmOff).applyQuaternion(B.hq));
          B.palm.copy(_bpP);
          if (!B.sockGoal) B.sockGoal = new THREE.Vector3();
          B.sockGoal.copy(_rvT).sub(_rvC.copy(GL.axis).sub(palmOff).applyQuaternion(B.hq));
          curl = CURL.closed; rot = 1; w = 1;
        }
        B.blendC = 0;
      } else {
        // E: the release; the open hand back down her side to the clip's own
        B.relDone = B.owner === 'carry';
        if (B.owner !== 'carry') { this._bowOwner('carry'); B.from.copy(B.palm); }
        B.hqMode = null; B.pose = 'kit'; B.gripKind = null;
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
    stepToward(B.pp, B.palm, (B.palmStep || PALM_STEP) * dt * 60);
    B.palm.copy(B.pp);
    B.palmStep = 0;
    // the elbow's pole turns toward the path's at most 20 deg a step (W11: no flip as the hand passes the hip)
    // (the reach's pole while the hand is behind her; the carry's as it brings the bow round and while it lets go)
    const carryPole = (B.mode === 1 && B.owner === 'handL' && B.t >= phaseEnd(T, 'C') + 0.5 * (phaseEnd(T, 'D') - phaseEnd(T, 'C'))) || (B.mode === 2 && B.t < phaseEnd(T, 'R') && !B.revOk);
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
      this._ikArm('l', _bpT, B.pole, w * (1 - _sm(B.rollK || 0)), null);
      if (pass === 0) {
        let kq = 0;
        if ((B.mode === 1 || B.mode === 2) && B.hqMode) {
          // (M1a weapons round 3: the unstow's fist: the reverse take's straightest wrist, a planned turn, or the carry's)
          if (B.hqMode === 'rev') this._handOnStave(B.revAxis, -1, _bpQ4);
          else if (B.hqMode === 'want') _bpQ4.copy(B.hqWant);
          else this._handOnStave(_bpD, 1, _bpQ4);
          kq = B.mode === 1 ? (B.owner === 'carry' ? 1 : 0) : (B.pose === 'rev' && B.t >= phaseEnd(T, 'D') ? 1 : 0);
        } else {
          this._handOnStave(_bpD, B.sigma, _bpQ4);
          /* (M1a weapons round 2, W2 at the grip and the release: at the keeper the fist holds the PLANNED bow, the one on
           *  her back, turned as it is there (`_handForBow`): the bow posed off the fist is then the kit's own at the take
           *  and at the seat; between, the straightest wrist) */
          kq = this._bowKeepTurn(T);
          if (kq > 1e-3) { this._handForBow(B.q, B.s, _bpQ2); _bpQ4.slerp(_bpQ2, kq); }
        }
        if (rot < 1) { _bpQ.copy(_bpQ3).slerp(_bpQ4, rot); _bpQ4.copy(_bpQ); }
        const a = B.hq.angleTo(_bpQ4), mx = (B.mode && B.turnMax ? B.turnMax : HAND_TURN) * dt * 60;
        if (a > mx) B.hq.slerp(_bpQ4, mx / a); else B.hq.copy(_bpQ4);
        // (at the keeper the fist must hold the bow turned as it sits there: the take and the release wait on it too)
        B.turnMiss = kq >= 0.999 ? B.hq.angleTo(_bpQ4) : 0;
      }
    }
    _bpQ4.copy(B.hq);
    B.tgt.copy(_bpT);
    // (M1a weapons round 3: in the regrip, the left fist's turn off the one that holds the bow on its riser, this step)
    B.lTurnMiss = B.mode && B.pose === 'right' ? B.hq.angleTo(B.hqWant) : 9;
    const wr = w * (1 - _sm(B.rollK || 0));
    if (rot > 1e-3 && wr > 1e-3) { this._liveW(b.handL.bone, _bpQ3); this.space.setCharQ(b.handL, _bpQ3.slerp(_bpQ4, Math.min(1, wr))); }
    // the palm's miss on its plan (the take waits on it)
    this._charOf(b.handL.bone, _bpA); this._liveW(b.handL.bone, _bpQ3);
    const atKeeper = (B.mode === 1 && B.owner === 'carry') || (B.mode === 1 && B.pose === 'right') || (B.mode === 2 && B.owner === 'handL' && (B.pose === 'right' || B.t >= phaseEnd(T, 'D')));
    B.palmMiss = _bpA.add(_bpE.copy(palmOff).applyQuaternion(_bpQ3)).distanceTo(atKeeper && B.sockGoal ? B.sockGoal : B.palm);
    B.atKeeper = atKeeper;
    const G = this._bowGrip(B.s);
    if (G) this._wrapFingers('l', G, B.curl / CURL.closed, B.curl * 0.65 * w, w);
    else this._curlFingers(this._fingerL, B.curl * w, B.curl * 0.65 * w);
    /* (M1a weapons round 3: in the reverse fist the bow is where the fist has it as this step ends (`bowPathPose` draws it
     *  so): its origin and turn, for the right hand's reach and for R's start) */
    if (B.mode && B.pose === 'rev' && this._bowGrip(0)) {
      const GL = this._bowGrip(0), LP = SOCKETS.bow.limb.p;
      this._liveW(b.handL.bone, _bpQ3);
      B.qDrawn = (B.qDrawn || new THREE.Quaternion()).copy(_bpQ3).multiply(B.relQ);
      this._charOf(b.handL.bone, B.org).add(_bpE.copy(GL.axis).applyQuaternion(_bpQ3));
      B.org.sub(_bpE.set(LP[0], LP[1], LP[2]).multiplyScalar(B.scale).applyQuaternion(B.qDrawn));
      B.orgDrawn = (B.orgDrawn || new THREE.Vector3()).copy(B.org); B.orgDrawnOk = true;
    }
    else if (B.mode === 2 && B.pose === 'hand') {
      // (the stow's regrip: the bow as the carry's fist has it as this step ends, for the right hand's reach)
      this._liveW(b.handL.bone, _bpQ3);
      B.qDrawn = (B.qDrawn || new THREE.Quaternion());
      this._bowForHand(_bpQ3, 1, B.qDrawn);
      this._charOf(b.handL.bone, B.org).add(_bpE.copy(palmOff).applyQuaternion(_bpQ3));
      B.org.sub(this._bowSockMesh(1, _bpE).multiplyScalar(B.scale).applyQuaternion(B.qDrawn));
    }
    // the forearm as it ends this step (the next step's pivot reads it)
    this._charOf(b.loArmL.bone, _bpA); this._charOf(b.handL.bone, B.fa); B.fa.sub(_bpA).normalize(); B.faOk = true;
    B.inHand = B.owner === 'handL';
    B.w = w;
    B.turnMax = 0;
    this._bowRightHand(dt);
    return w;
  }

  /**
   * M1a weapons round 3 (the two-hand regrip): the RIGHT hand on the bow's upper limb in front of her left hip while the
   * left fist turns over. It leaves its swing a little before the left closes on the limb at her back (it has further to
   * go), takes the upper limb as the bow comes round (its grip axis up the stave, the straightest wrist, the fingers
   * closed on it) and holds it through R; it lets go once the left has closed on the riser, and its palm plan goes back
   * to the clip's hand at the palm's bound, the arm handed back to the clip over 4 steps (on past the unstow's end).
   */
  _bowRightHand(dt) {
    const B = this._bp, b = this.b, mel = this.melee;
    if (!b.handR || !b.upArmR || !mel?.gripDirL || !this._fingerR?.length) return;
    const T = B.T;
    const regrip = (B.mode === 1 || B.mode === 2) && T && T.phases.some((x) => x[0] === 'R');
    const stow = B.mode === 2;
    const tGrip = regrip && !stow ? phaseEnd(T, 'C') : 0, tR = regrip ? phaseEnd(T, 'R') : 0;
    if (!B.gripR) B.gripR = this._grip('r', 'bowUpR', mel.palmOffL, mel.gripDirL, BOW_PALM_D, SOCKETS.bow.limb.r);
    const GR = B.gripR;
    // the clip's right hand as it stands (before this layer): its palm and turn
    this._liveW(b.handR.bone, _rhQ2);
    this._charOf(b.handR.bone, _rhB).add(_rhA.copy(mel.palmOffL).applyQuaternion(_rhQ2));
    // (a stow asked while the right is still going back from the unstow's regrip: it turns round from where it is)
    if (B.rOn === 2 && B.mode === 2 && regrip && B.t < tR && !B.revOk && !B.stowD0) { B.rOn = 1; B.rHeld = false; B.rBack = 0; B.rw = 1; }
    if (B.rOn === 0) {
      // (the regrip starts the right hand: only from the reverse take, not from a stow turned back in the carry's fist)
      // (M2 wave 0: the quick draw's right hand goes at the request, to the quiver first)
      if (B.quick && !this.ctx.player?.aiming && !B.qDone) B.quick = false;
      const go = stow ? regrip && B.t < tR && !B.revOk && !B.stowD0
        : regrip && B.t < phaseEnd(T, 'D') && B.gripKind !== 'norm' && (B.t >= tGrip - 0.117 || (B.quick && !B.qDone));
      if (!go) { B.rw = 0; B.rHold = false; return; }
      // (from the hand as it was drawn last step: later layers, a run's arm clamp, move the clip's)
      if (this._bpHandR) _rhB.copy(this._bpHandR).add(_rhA.copy(mel.palmOffL).applyQuaternion(_rhQ2));
      B.rOn = 1; B.rp.copy(_rhB); B.rq.copy(_rhQ2); B.rw = 1; B.rc = 0; B.rBack = 0; B.rRel = 0;
      // (the elbow's pole starts where the clip's elbow stands off the shoulder-wrist line, and turns to the reach's)
      if (!B.rpole) B.rpole = new THREE.Vector3();
      this._charOf(b.upArmR.bone, _rvA); this._charOf(b.loArmR.bone, _rvC); this._charOf(b.handR.bone, _rvS);
      _rvS.sub(_rvA).normalize(); _rvC.sub(_rvA); _rvC.addScaledVector(_rvS, -_rvC.dot(_rvS));
      if (_rvC.lengthSq() > 1e-6) B.rpole.copy(_rvC.normalize()); else B.rpole.fromArray(BOW_POLE_R).normalize();
    }
    // the bow's stave and the upper limb's point, as the bow is planned (or as it will be at the regrip, before the grip)
    let want;
    const done = stow ? (!regrip || B.revOk || B.t >= tR + REGRIP_WAIT_L) : (!regrip || B.pose === 'hand' || (B.t >= tR && !B.rHeld));
    if (B.rOn === 1 && done) { B.rOn = 2; B.rRel = 0; }
    if (B.rOn === 1 && B.rHeld) {
      /* holding: the right fist carries the bow (its frame, `relR`): through D's end on the reverse fist's bow as drawn,
       * through R on the plan (its origin and turn) */
      const qb = B.pose === 'right' ? B.q : (B.qDrawn || B.q);
      if (stow && B.pose === 'right' && B.orgROk) B.org.copy(B.orgR);
      _rhQ.copy(qb).multiply(_rvQ.copy(B.relRQ).invert());
      _rhA.copy(B.relRP).applyQuaternion(_rhQ);
      want = _rvU.copy(B.org).sub(_rhA).add(_rvC.copy(mel.palmOffL).applyQuaternion(_rhQ));
      B.rcT = CURL.closed;
    } else if (B.rOn === 1 && B.quick && !B.qDone && !stow) {
      /* (M2 wave 0, the quick draw: the arrow first. The palm to the quiver (the aim's own point, `_quiverPt`), the fingers
       *  pinch as it gets there, QUICK_PULL steps on it, then on to the bow's upper limb (below) with the arrow) */
      want = this._quiverPt(_rvU);
      _rhQ.copy(_rhQ2);
      B.rcT = (B.rMiss ?? 9) < 0.04 ? QUICK_PINCH : CURL.open;
      if ((B.rMiss ?? 9) < 0.03) B.qN = (B.qN || 0) + 1;
      if (B.qN >= QUICK_PULL || (B.t >= tGrip + 0.05 && (B.rMiss ?? 9) < 0.06)) { B.qDone = true; B.qAt = B.simT; }
      if (!this.ctx.player?.aiming) { B.quick = false; B.qDone = false; }
    } else if (B.rOn === 1) {
      // (where the regrip will be, on the carry's line: the hand waits there until the bow comes round to it)
      this._bowCarryAxis(_rhA, _caF.fromArray(CARRY_FA).normalize());
      this._bowRegripPt(_rvT);
      _rvT.addScaledVector(_rhA, BOW_UPPER_Y);
      if (B.owner === 'handL' && B.pose !== 'kit') {
        // (...then the bow's own upper limb, as the bow comes round in the reverse fist, or as the stow brings it in)
        const kk = stow ? _sm(B.t / Math.max(1e-3, 0.5 * tR)) : _sm((B.t - (tGrip + 0.5 * (phaseEnd(T, 'D') - tGrip))) / (0.5 * (phaseEnd(T, 'D') - tGrip)));
        const qb = (B.pose === 'rev' || (stow && B.pose === 'hand')) && B.qDrawn ? B.qDrawn : B.q;
        _rvC.set(0, 1, 0).applyQuaternion(qb); _rhA.lerp(_rvC, kk).normalize();
        _rvT.lerp(_rvC.set(0, BOW_UPPER_Y, 0).multiplyScalar(B.scale).applyQuaternion(qb).add(B.org), kk);
      }
      this._handOnStave(_rhA, 1, _rhQ, 'r');
      want = _rvU.copy(_rvT).sub(_rvC.copy(GR.axis).sub(mel.palmOffL).applyQuaternion(B.rq));     // the right palm's goal
      // the fingers close once the palm is on its goal and the bow is in the left's fist and round
      // (once the fingers have started to close they go on closing: the close is not undone by a jog's bob)
      const on = ((B.rMiss ?? 9) < (B.rc > CURL.open + 0.1 ? 0.035 : 0.022)) && (B.rTurnMiss ?? 9) < 0.1 && B.owner === 'handL' && (stow ? B.pose === 'hand' && B.pp.distanceTo(B.palm) < 0.01 : B.pose === 'rev' && B.t >= phaseEnd(T, 'D') - 0.05);
      B.rcT = on ? CURL.closed : CURL.open;
    } else {
      // letting go: open, then back to the clip's hand
      B.rRel += dt;
      B.rcT = CURL.open * 0.6;
      _rhQ.copy(_rhQ2);
      want = B.rRel < 0.034 ? _rvU.copy(B.rp) : _rvU.copy(_rhB);
    }
    // (the way back to her swing at a little under the palm's bound: the fist turns back as it goes, W3's wrist)
    // (M2 wave 0: the quick draw's right hand goes a little faster, QUICK_STEP, to the quiver and on to the bow)
    stepToward(B.rp, want, (B.rOn === 2 ? PALM_STEP_E : B.quick && !B.rHeld ? QUICK_STEP : PALM_STEP) * dt * 60);
    const a = B.rq.angleTo(_rhQ), mx = HAND_TURN * dt * 60;
    if (a > mx) B.rq.slerp(_rhQ, mx / a); else B.rq.copy(_rhQ);
    const cr = CURL.rate * dt;
    B.rc += clamp(B.rcT - B.rc, -cr, cr);
    if (B.rOn === 2 && B.rRel >= 0.034 && B.rp.distanceTo(_rhB) < 0.03) B.rBack = Math.min(1, B.rBack + dt / 0.067);
    B.rw = 1 - _sm(B.rBack);
    if (B.rOn === 2 && B.rBack >= 1) { B.rOn = 0; B.rw = 0; B.rHold = false; return; }
    const w = B.rw * (1 - _sm(B.rollK || 0));
    _rhA.copy(B.rp).sub(_rvC.copy(mel.palmOffL).applyQuaternion(B.rq));                        // the wrist's goal
    turnToward(B.rpole, _rvC.fromArray(BOW_POLE_R).normalize(), 0.2 * dt * 60);
    this._ikArm('r', _rhA, B.rpole, w, null);
    this._liveW(b.handR.bone, _rhQ2);
    this.space.setCharQ(b.handR, _rhQ2.slerp(B.rq, w));
    this._wrapFingers('r', GR, B.rc / CURL.closed, B.rc * 0.65 * w, w);
    // the right palm's miss on its goal (as drawn), and its turn's on the fist that holds the stave there
    this._liveW(b.handR.bone, _rhQ2);
    this._charOf(b.handR.bone, _rhB);
    _rvS.copy(_rhB).add(_rhA.copy(mel.palmOffL).applyQuaternion(_rhQ2));
    B.rMiss = B.rOn === 1 ? _rvS.distanceTo(want) : 9;
    B.rTurnMiss = B.rOn === 1 ? _rhQ2.angleTo(_rhQ) : 9;
    if (B.rOn === 1 && !B.rHeld && B.rc >= 0.8 && (B.pose === 'rev' || (stow && B.pose === 'hand')) && B.qDrawn) {
      // the right's GRIP on the upper limb: the bow as the reverse fist has it, kept in the right fist's frame from here
      B.relRQ.copy(_rhQ2).invert().multiply(B.qDrawn);
      B.relRP.copy(B.org).sub(_rhB).applyQuaternion(_rvQ.copy(_rhQ2).invert());
      B.rHeld = true; B.rGripAt = B.simT;
    }
    if (B.rHeld && B.rOn === 1) {
      // the bow as the right fist has it this step (R draws it so, `bowPathPose`; the left closes on it)
      B.qDrawnR = (B.qDrawnR || new THREE.Quaternion()).copy(_rhQ2).multiply(B.relRQ);
      B.orgDrawnR = (B.orgDrawnR || new THREE.Vector3()).copy(B.relRP).applyQuaternion(_rhQ2).add(_rhB);
    }
    B.rHold = B.rOn === 1 && B.rHeld && B.rc >= 0.8;
  }

  /**
   * M1a weapons round 3 (the swaps and draws at a jog): the palm plans ride her trunk. Each step spine_02's move since the
   * last (as the clip and the earlier layers leave it, before this layer's reach turn) carries both palm plans with it, so
   * a jog's bob and sway do not leave the hands behind their goals (the right missed the bow's upper limb by 0.02-0.03 m
   * and never closed on it); the plans' own bound is their motion on her.
   */
  _bowRide(B) {
    const sp = this.b.spine2?.bone;
    if (!sp) return;
    this._charOf(sp, _rdP); this._liveW(sp, _rdQ);
    if (B.rideOk && (B.mode || B.rOn)) {
      _rdD.copy(_rdQ).multiply(_rdQ2.copy(B.rideQ).invert());
      if (B.mode) B.pp.sub(B.rideP).applyQuaternion(_rdD).add(_rdP);
      if (B.rOn) B.rp.sub(B.rideP).applyQuaternion(_rdD).add(_rdP);
      // (the keeper's line the reverse fist slides the bow out along rides her back too, until the bow is clear of it)
      if (B.mode === 1 && B.owner === 'handL' && B.pose === 'rev') { B.org0.sub(B.rideP).applyQuaternion(_rdD).add(_rdP); B.qGrab.premultiply(_rdD); }
    }
    if (!B.rideP) { B.rideP = new THREE.Vector3(); B.rideQ = new THREE.Quaternion(); }
    B.rideP.copy(_rdP); B.rideQ.copy(_rdQ); B.rideOk = true;
  }

  /** M1a weapons round 3: the regrip's place for the left palm (char): off spine_02, so a crouch or a lean carries it. */
  _bowRegripPt(out) {
    this._charOf(this.b.spine2.bone, out);
    return out.add(_rvC.fromArray(REGRIP_OFF));
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
      // (M1a weapons round 3: round her hip in D, back to her line by the release)
      const tR = phaseEnd(T, 'R'), tD = phaseEnd(T, 'D'), tS = phaseEnd(T, 'S'), Y = REACH_YAW * 0.5;
      if (t < tR) return 0;
      if (t < tD) return Y * _sm((t - tR) / (tD - tR));
      return Y * (1 - _sm((t - tD) / (tS - tD)));
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
      B.mode = 1; B.tempo = 'ask'; B.T = BOW_UNSTOW_R.ask;
      // (M1a weapons round 3: a stow reversed with the bow still in the carry's fist goes straight to the carry, E)
      B.t = inHand ? phaseEnd(B.T, 'R') : 0;
      if (inHand) { B.qGrab.copy(B.q); B.hqRevOk = false; }
      else { B.hqRevOk = false; B.gripKind = null; }
      B.rHeld = false; B.rWait = 0; B.lWait = 0; B.orgROk = false; B.revPalmOk = false; B.qDrawnR = null; B.orgDrawnR = null; B.slid = inHand;
      if (!inHand) B.curl = Math.min(B.curl, CURL.open + 0.2);
      /* M2 wave 0 (D2, W7 "RMB from stowed to loosable no later than W0's" and W8): an unstow the AIM asked for (RMB with
       * the bow on her back) is the QUICK draw: the right hand takes an arrow from the quiver first, while the left reaches
       * for the bow, and goes on to the regrip with it; the nock's clock runs from the request (`bowNockHold`), and the
       * aim's own quiver beat is not run again once the bow is up (`bowQuickNocked`). At 1d2de89 the beat and the nock
       * waited for the whole unstow and the regrip: RMB to loosable 1.40 s against W0's 0.867 */
      B.quick = !inHand && !!this.ctx.player?.aiming && !this.ctx.combat?.activeWeapon?.heavy;
      B.qDone = inHand; B.qN = 0; B.qAt = -1;
    } else {
      B.quick = false;
      // the lance asked for (key 2) is the player's request; the 8 s timer is the game's
      const asked = !!mel && (mel.stance === 'draw' || mel.stance === 'ready' || mel.stance === 'swing');
      B.tempo = asked ? 'ask' : 'timer';
      B.T = asked ? BOW_STOW_R.ask : BOW_STOW_R.timer;
      B.lOpen = false; B.revOk = false; B.sWait = 0; B.revPalmOk = false; B.hqRevOk = false;
      if (B.mode === 1 && B.owner === 'carry') {
        // an unstow before its grip: abort, the hand goes home (the stow's last phase), the bow never moved
        B.mode = 2; B.t = phaseEnd(B.T, 'S');
      } else if (B.mode === 1 && B.gripKind === 'rev') {
        // (M1a weapons round 3: mid-unstow in the reverse fist: it goes straight back round her hip in that fist, D)
        B.mode = 2; B.t = phaseEnd(B.T, 'R'); B.revOk = true; B.stowD0 = true;
        B.orgS0 = (B.orgS0 || new THREE.Vector3()).copy(B.org); B.stowLimb0 = null;
      } else {
        // (from the carry: the planned bow starts as combat's carried one; mid-unstow: where the plan has it)
        // (M1a weapons round 3: from the bow as it was last drawn in her hand, the fist's carry)
        if (B.mode === 0) { if (B.dqOk && B.dqMesh) B.q.copy(B.dqMesh); else this._bowCarryQ(B.q); B.s = 1; B.scale = 1; B.stowQ0 = (B.stowQ0 || new THREE.Quaternion()).copy(B.q); }
        // (mid-regrip: the right has it or is taking it; the stow's regrip goes on from there)
        if (B.mode === 1 && B.rHeld && B.pose === 'right') B.lOpen = true;
        else B.rHeld = false;
        B.mode = 2; B.t = 0; B.stowD0 = false; B.lOpenAt = null;
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

  /**
   * M1a weapons round 3 (W3/W8, "the aim from stowed turns the bow 126 deg in one step"): the aim's gate. While the bow
   * is not yet in her left hand, or its unstow is still bringing it round her hip, the aim may not come up (the aim rig
   * would raise an empty hand while the path holds the bow behind her, then the path's end handed the bow to the raised
   * aim in one step). The animator holds the aim weight's target under it; combat holds the nock's clock under it; the
   * quiver beat starts when it opens. 1: open.
   */
  bowAimGate() {
    const B = this._bp;
    if (!B) return 1;
    if (B.mode === 1) return 0;
    return B.owner === 'handL' ? 1 : 0;
  }

  /** M1a weapons round 3: is the RIGHT hand on the bow (or reaching for it) in a regrip this step? The lance layer leaves
   *  the right arm alone while it is. */
  bowRightBusy() {
    const B = this._bp;
    return !!B && B.rOn === 1;
  }

  /**
   * M1a weapons round 3 (W8; A32's ramp from stowed): does the nock's clock wait this step? While the aim's gate is shut,
   * and, through a raise that waited on the unstow, until the quiver beat that started with it is `nockTime` from its
   * end: the arrow reaches the string as the hand brings it back there (combat started the draw with the hand still on
   * its way back from the quiver: the string hook 0.071 m off the nock at draw 0.07, A32 at 53e8186).
   */
  bowNockHold(nockTime = 0.42) {
    // (M2 wave 0: the quick draw's nock runs from the request: the right hand is at the quiver long before it lands)
    const QB = this._bp;
    if (QB?.quick && this.ctx.player?.aiming) return false;
    if (this.bowAimGate() < 1) return true;
    if (!this._gateRaise) return false;
    const qT = this.T?.armFlow?.quiverT ?? 0.34;
    return (this._quiverT ?? 1) < 1 - nockTime / qT;
  }

  /** M2 wave 0: did the quick draw's right hand already take the arrow (the aim's quiver beat is not run again)? */
  bowQuickNocked() {
    const B = this._bp;
    return !!B && !!B.quick && !!B.qDone;
  }

  /** M2 wave 0: the quiver's point (char), as the aim rig reads it (`aimRig` `_quivT`: the standing point, riding the
   *  pelvis by `armFlow.bodyRef`), into `out` and into `_quivT` (the rows' and the beat's). No allocation. */
  _quiverPt(out) {
    const T = this.T, b = this.b;
    out.copy(T.quiverHip);
    const BR = T.armFlow?.bodyRef;
    const cbW = T.armFlow?.crouchBody ? (BR ? 1 : (this._crouchW || 0)) : 0;
    if (cbW > 1e-3 && b.pelvis?.bindChar) {
      this._charOf(b.pelvis.bone, _qpP).sub(b.pelvis.bindChar);
      if (BR) { _qpP.x -= BR.pelvis[0]; _qpP.y -= BR.pelvis[1]; _qpP.z -= BR.pelvis[2]; }
      out.addScaledVector(_qpP, cbW);
    }
    if (this._quivT) this._quivT.copy(out);
    return out;
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
    /* M1a weapons round 3 (W3/W8): the hand-over between the bow posed from the fist (the carry) and combat's own placement
     * (the raised aim, a roll) is a BLEND, not a cut: `B.aimK` runs 0 (from the fist) .. 1 (combat's) with the aim weight on
     * the way up (the bow comes up with the arm) and at RAISE_RATE either way, and the drawn bow turns at most RAISE_STEP a
     * step in her frame while it runs. At 375c3ff the path's end gave the raised aim's bow in one step: 126 deg */
    const kWant = aimed ? 1 : 0;
    if (B.aimK == null) B.aimK = kWant;
    const dtA = this._dtA || 1 / 60;
    if (kWant > B.aimK) B.aimK = Math.min(1, B.aimK + dtA / RAISE_S, Math.max(B.aimK, (this.aimWeight ?? 0) > 0.02 ? this.aimWeight : 1));
    else if (kWant < B.aimK) B.aimK = Math.max(0, B.aimK - dtA / RAISE_S);
    const blendOn = B.aimK > 1e-4 && (B.aimK < 1 - 1e-4 || !B.dqConv);
    if (aimed && !blendOn) { this._bowDrawnQ(group, B); return; }
    const cmb = this.ctx.combat;
    /* M1a weapons round 2 (W1, W2): the bow is posed FROM THE HAND that holds it, as drawn: its turn the one the fist
     * holds it in (`_bowForHand`), its socket on the palm. Round 1 posed it on the plan beside the hand (the palm 0.03-0.19
     * m off its socket, the fist closed through the stave) */
    const b = this.b;
    this._liveW(b.handL.bone, _bpQ3);
    const sNow = B.mode ? B.s : 1;
    const scl = B.mode ? B.scale : 1;
    const pose = B.mode ? (B.pose === 'kit' ? 'hand' : B.pose) : 'hand';
    B.sockNOk = false;
    if (pose === 'rev' && this._bowGrip(0)) {
      /* (M1a weapons round 3: in the reverse fist: the bow as the fist took it (`relQ`), the limb's centreline through the
       *  fist's grip axis; the palm's socket is the palm on it, its normal from the palm onto the centreline) */
      const GL = this._bowGrip(0), LP = SOCKETS.bow.limb.p;
      _bpQ4.copy(_bpQ3).multiply(B.relQ);
      this._charOf(b.handL.bone, _bpP).add(_bpE.copy(GL.axis).applyQuaternion(_bpQ3));
      _bpP.sub(_bpG.set(LP[0], LP[1], LP[2]).multiplyScalar(scl).applyQuaternion(_bpQ4));
      if (!B.orgDrawn) B.orgDrawn = new THREE.Vector3();
      B.orgDrawn.copy(_bpP); B.orgDrawnOk = true;
      _bpE.copy(GL.axis).sub(this._bowPalmOff()).applyQuaternion(_bpQ3);
      _bpD.set(0, 1, 0).applyQuaternion(_bpQ4); _bpE.addScaledVector(_bpD, -_bpE.dot(_bpD)).normalize();
      B.sockN[0] = _bpE.x; B.sockN[1] = _bpE.y; B.sockN[2] = _bpE.z; B.sockNOk = true;
    } else if (pose === 'right') {
      // (...in the regrip: in the right fist, as it took it (`relR`); the left open and turning over)
      this._liveW(b.handR.bone, _bpQ);
      _bpQ4.copy(_bpQ).multiply(B.relRQ);
      this._charOf(b.handR.bone, _bpP).add(_bpE.copy(B.relRP).applyQuaternion(_bpQ));
    } else if (pose === 'plan') {
      _bpQ4.copy(B.q); _bpP.copy(B.org);
    } else {
      this._bowForHand(_bpQ3, sNow, _bpQ4);
      this._charOf(b.handL.bone, _bpP).add(_bpE.copy(this._bowPalmOff()).applyQuaternion(_bpQ3));
      this._bowSockMesh(sNow, _bpG);
      _bpG.multiplyScalar(scl).applyQuaternion(_bpQ4);
      _bpP.sub(_bpG);
    }
    if (!aimed || blendOn) {
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
      if (blendOn) {
        // (M1a weapons round 3: combat's placement this step is on the group already; the fist's is blended into it)
        /* (M2 wave 0, D2 W1 in the raise: the bow stays as the fist holds it while the aim is under half up (the palm on
         *  its socket, the grip axis on the stave: the blend from the start of the raise slid it 0.021 m off the palm and
         *  turned it 39 deg in the fist at 1d2de89), and goes over to combat's placement as the aim comes the rest of the way) */
        const k = _sm((B.aimK - RAISE_HOLD) / (1 - RAISE_HOLD));
        group.position.lerpVectors(_bpA, group.position, k);
        group.quaternion.copy(_bpQ.slerp(group.quaternion, k));
        group.scale.lerpVectors(_bpB, group.scale, k);
        this._bowLimitTurn(group, node, B);
        // (...and the fist stays closed round the stave it holds while it does: the aim's own curl went on top of the
        //  carry's fading wrap, 13 finger joint-steps inside the stave and the palm normal 12.5 deg off at 1d2de89)
        const Gc = this._bowGrip(1);
        if (Gc && k < 1) this._wrapFingers('l', Gc, 1, 0.55 * (1 - k), 1 - k);
      } else {
        group.position.copy(_bpA); group.quaternion.copy(_bpQ); group.scale.copy(_bpB);
        cmb?.bow?.setDraw?.(0, false);
        B.dqConv = false;
      }
    }
    this._bowDrawnQ(group, B);
    // the socket the palm holds, as drawn (W1): the group's pose this step
    group.updateMatrixWorld(true);
    if (pose === 'rev') {
      // (the reverse fist's palm on the limb: the fist's own palm point, the bow posed from it)
      this._charOf(b.handL.bone, _bpG).add(_bpE.copy(this._bowPalmOff()).applyQuaternion(_bpQ3));
      B.sockChar[0] = _bpG.x; B.sockChar[1] = _bpG.y; B.sockChar[2] = _bpG.z; B.sockOk = true;
    } else if (pose === 'plan' || pose === 'right') B.sockOk = false;
    else {
      _bpG.set(0, 0, 0); this._bowSockMesh(sNow, _bpG);
      _bpG.applyMatrix4(mesh.matrixWorld);
      _bpM.copy(this.model.matrixWorld).invert();
      _bpG.applyMatrix4(_bpM);
      B.sockChar[0] = _bpG.x; B.sockChar[1] = _bpG.y; B.sockChar[2] = _bpG.z; B.sockOk = true;
    }
    // (the cloth's capsule for the bow in her hand, as drawn this step)
    setPropCap(this, 'heldBow', _bpA.set(0, -0.72, -0.05).applyMatrix4(mesh.matrixWorld), _bpB.set(0, 0.72, -0.05).applyMatrix4(mesh.matrixWorld), 0.045);
  }

  /** M1a weapons round 3: the drawn bow's turn in her frame (char), kept each step its group is drawn in the hand. */
  _bowDrawnQ(group, B) {
    if (!B.dq) B.dq = new THREE.Quaternion();
    group.updateMatrixWorld(true);
    group.matrixWorld.decompose(_bpS, _bpQ, _bpS2);
    this.model.getWorldQuaternion(_rlQ).invert();
    B.dq.copy(_rlQ.multiply(_bpQ)); B.dqOk = true; B.dqAt = B.simT;
    // (...and the mesh's own, the plan's frame: the model under the group is canted 0.22 rad)
    const mesh = group.children[0]?.children?.[0];
    if (mesh) {
      if (!B.dqMesh) B.dqMesh = new THREE.Quaternion();
      mesh.matrixWorld.decompose(_bpS, _bpQ, _bpS2);
      this.model.getWorldQuaternion(_rlQ).invert();
      B.dqMesh.copy(_rlQ.multiply(_bpQ));
    }
  }

  /** M1a weapons round 3: hold the drawn bow's turn (char) to RAISE_STEP from the last drawn step (the group, in place). */
  _bowLimitTurn(group, node, B) {
    if (!B.dqOk || B.dqAt < B.simT - 0.05) { B.dqConv = true; return; }
    group.updateMatrixWorld(true);
    group.matrixWorld.decompose(_bpS, _bpQ, _bpS2);
    this.model.getWorldQuaternion(_rlQ);
    const want = _rlQ2.copy(_rlQ).invert().multiply(_bpQ);        // char
    const a = B.dq.angleTo(want), mx = RAISE_STEP;
    B.dqConv = a <= 0.5 * Math.PI / 180;
    if (a <= mx) return;
    const got = _rlQ3.copy(B.dq).slerp(want, mx / a);              // char, limited
    // back to the node's frame: node world^-1 * model world * got (the group's parent is the node)
    node.updateWorldMatrix(true, false);
    node.getWorldQuaternion(_rlQ2).invert();
    group.quaternion.copy(_rlQ2.multiply(_rlQ.multiply(got)));
    B.dqConv = false;
  }

  /** The handling record (handling.js `makeHandlingInfo`), refilled in place: what the rows read. */
  handlingInfo() {
    const H = this._hInfo || (this._hInfo = makeHandlingInfo());
    const B = this._bowPathState();
    const o = H.bow;
    o.owner = B.owner; o.mode = B.mode; o.tempo = B.tempo; o.phase = B.phase; o.k = B.k; o.t = B.t; o.curl = B.curl;
    o.s = B.mode ? B.s : null; o.gripAt = B.gripAt; o.releaseAt = B.releaseAt; o.readyAt = B.readyAt; o.requestAt = B.requestAt;
    o.sockChar = B.sockOk ? B.sockChar : null; o.yaw = B.yaw;
    o.aimK = B.aimK ?? 0;
    /* (M1a weapons fix round 1, the judge's FIX LIST 12: the bow is posed FROM the fist, so its socket sits on the palm by
     *  construction. What can miss is the hand: the drawn palm against the plan's socket this step (`palmMiss`; at the keeper
     *  the KIT bow's own limb socket, read off her back, so the take and the seat are measured against a bow the hand does
     *  not place). Null while no sequence runs) */
    o.palmMiss = B.mode && B.palmMiss != null ? B.palmMiss : null; o.atKeeper = !!(B.mode && B.atKeeper);
    // (M1a weapons round 3: which grip holds it ('rev' the reverse take, 'regrip' the left open in the regrip, 'norm' the
    //  carry's fist), the socket's palm normal when the handling knows it (char), and the right hand on the upper limb)
    o.gripKind = B.owner === 'handL' ? (B.mode ? B.gripKind || 'norm' : 'norm') : null;
    o.sockN = B.sockNOk ? B.sockN : null;
    o.rightHold = !!B.rHold; o.rightMiss = B.rOn === 1 ? B.rMiss : null; o.rightW = B.rw || 0;
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
