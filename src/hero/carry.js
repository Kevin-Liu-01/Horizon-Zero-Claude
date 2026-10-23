/**
 * CALIMA · the stowed lance's carry solve (hero-body W0b fix round 1; ruling
 * R10, bible §3.6; gate A-lance-stow).
 *
 * WHY. The first cut skinned the stowed Shepherd's Lance rigidly to
 * `spine_03`. That bone carries the run cycle's chest twist (±27°) and the
 * upper-spine curl of the jog / sprint / crouch clips (its up axis pitched
 * 48–80° forward), so a 1.55 m pole bolted to it swung to 65–90° from vertical
 * with the blade 0.4–0.6 m AHEAD of her face whenever she moved (judged on the
 * V12 / V23 / V3 / V-traversal films). A strap across the back does not follow
 * one vertebra: it rides the TRUNK.
 *
 * WHAT. The lance hangs on `stow_lance`, a socket joint under `spine_02` (kit
 * recipe). Every frame, after the animator has posed the body, this solve:
 *   1. builds the trunk frame in character space: U = pelvis -> neck line,
 *      X = the lateral axis of spine_02 (blended toward spine_03 as the aim
 *      blades the chest), F = X × U (forward);
 *   2. places the lance by its AUTHORED coordinates in that frame (measured
 *      once at bind): the strap point on the upper back, the in-plane tilt α
 *      (34° at bind, butt low-left, blade over the right shoulder), and the
 *      authored sagittal share;
 *   3. searches (α, β) — β tilts the top back off the back plane about a
 *      pivot low on the lance — for the pose nearest the authored one that
 *      holds every R10 / A100 bound: 32–40° from vertical, the blade behind
 *      the head's frontal plane, >= 7 cm from the skull, and while the bow is
 *      drawn >= 7 cm from the draw arm; then eases there (no pops);
 *   4. writes the socket's local transform so the skinned lance lands on it.
 *
 * THE CLIMB. The 1 m climb folds her trunk to 93-96 deg over the ledge (probe
 * `lclimb`, k 0.39-0.52). A lance held on that back by the strap is 60-70 deg
 * from vertical with the blade AHEAD of her face. An exhaustive search of
 * every lance line (32-40 deg, every azimuth, every midpoint within A100's
 * 0.30 m of the upper back) against A100's bars, the torso, the arms on the
 * ledge and the thighs finds 0-29 poses of ~140 000 at k 0.34-0.47, in
 * disjoint families (no continuous path); with A100's in-motion band (30-60,
 * which R10 keeps) the press is clean. So while she climbs the sling lets the
 * lance move round her: a local search over its midpoint (in the trunk frame)
 * and its direction (character space), started from last frame's pose and
 * rate-capped, holds A100's band, prefers <= 38 deg (it is back at 36-38 as
 * she stands), keeps every A100 bar, and keeps the shaft out of the torso, the
 * thighs, both arms, the skull and the tails; it eases back onto the strapped
 * carry when the climb ends.
 * Nothing allocates per frame; every vector is a module scratch.
 */
import * as THREE from 'three';

const R10 = {
  degLo: 33.3 * Math.PI / 180,      // R10 band 32-40 deg, held 1.3 deg inside
  degHi: 38.7 * Math.PI / 180,
  midBall: 0.27,                    // the shaft's midpoint to the upper-back SURFACE (A100: 0.30)
  alphaMin: 14 * Math.PI / 180,     // in-plane tilt range (bind: 34 deg; the cost keeps it near 34)
  alphaMax: 74 * Math.PI / 180,
  bladeLo: 0.25, bladeHi: 0.65,     // the blade over the right shoulder (A100: 0.20-0.70)
  tipRight: 0.18,                   // the blade right of the spine (A100: > 0.15)
  betaMax: 60 * Math.PI / 180,      // top tilted back off the back plane (a folded trunk — the climb's press — needs most of it)
  pivot: 0.30,                      // beta's pivot, fraction of the lance from the butt
  headGap: 0.07,                    // skull (ellipsoid's largest semi-axis) clearance
  armGap: 0.07,                     // draw-arm clearance while aiming
  tailGap: 0.07,                    // the knot tail / wrap tail segments vs the shaft (A100's "ponytail clearance")
  groundGap: 0.06,                  // the bob over the terrain (A-stow-clearance: crouched)
  camGap: 0.42,                     // while aiming: the upper shaft >= this far (NDC, aspect-true) from the head + anchor on screen (V4)
  planeGap: 0.03,                   // blade behind the head's frontal plane
  rate: 14,                         // ease toward the chosen (alpha, beta), 1/s
  torsoA: 0.19, torsoB: 0.15,       // the torso's elliptic section round the pelvis->neck line (side, front/back) + 2 cm
  legGap: 0.10,                     // thigh / shin axes (free search)
  armGapFree: 0.07,                 // both arms' axes (free search: they are on the ledge)
};

/**
 * The climb's local search (see the header): parameters (a, u, n, theta, phi)
 * = the midpoint's offset from the upper-back centre along her shoulder line,
 * the trunk and the back's normal, and the lance's angle from vertical and
 * azimuth (character space). Steps, per-frame caps (at 60 Hz) and bars.
 */
const FREE = {
  step: [0.03, 0.03, 0.03, 1.5 * Math.PI / 180, 10 * Math.PI / 180],
  cap: [0.08, 0.08, 0.08, 6 * Math.PI / 180, 25 * Math.PI / 180],
  lo: [-0.35, -0.3, -0.35, 31 * Math.PI / 180, -Infinity],
  hi: [0.35, 0.3, 0.3, 59 * Math.PI / 180, Infinity],
  scale: [0.1, 0.1, 0.1, 10 * Math.PI / 180, 90 * Math.PI / 180],
  iters: 30, smooth: 0.5, prefDeg: 38 * Math.PI / 180, pref: 0.3 * 180 / Math.PI, centre: 0.3,
  degLo: 31 * Math.PI / 180, degHi: 59 * Math.PI / 180,      // A100's in-motion band, 1 deg inside
  midBall: 0.28, torsoA: 0.185, torsoB: 0.145, armAxis: 0.09, legAxis: 0.11, butt: 0.03,
  blendOut: 0.45,
};

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _mi = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qm = new THREE.Quaternion();
const _P = new THREE.Vector3(), _N = new THREE.Vector3(), _O = new THREE.Vector3();
const _U = new THREE.Vector3(), _X = new THREE.Vector3(), _F = new THREE.Vector3(), _x3 = new THREE.Vector3();
const _d = new THREE.Vector3(), _din = new THREE.Vector3(), _strap = new THREE.Vector3();
const _b = new THREE.Vector3(), _t = new THREE.Vector3(), _piv = new THREE.Vector3();
const _hc = new THREE.Vector3(), _hf = new THREE.Vector3();
const _a0 = new THREE.Vector3(), _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3();
const _w0 = new THREE.Vector3(), _w1 = new THREE.Vector3(), _nb = new THREE.Vector3(), _nt = new THREE.Vector3();
const _s = new THREE.Vector3(), _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();
const _sc = new THREE.Vector3(), _sh = new THREE.Vector3(), _sa = new THREE.Vector3();
const _vp = new THREE.Matrix4();
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _back = new THREE.Vector3(), _shR = new THREE.Vector3();
// climb search: her shoulder / hip lines, the torso's forward, limbs, the spine polyline's segment frames
const _lat = new THREE.Vector3(), _latH = new THREE.Vector3(), _Ft = new THREE.Vector3(), _M = new THREE.Vector3();
const _shL = new THREE.Vector3(), _thL = new THREE.Vector3(), _thR = new THREE.Vector3(), _cfL = new THREE.Vector3(), _cfR = new THREE.Vector3();
const _laL = new THREE.Vector3(), _laR = new THREE.Vector3();
const _sp0 = new THREE.Vector3(), _sp1 = new THREE.Vector3(), _bT = new THREE.Vector3(), _tT = new THREE.Vector3();
const _q0 = new THREE.Vector3(), _dd = new THREE.Vector3(), _z0 = new THREE.Vector3(), _z1 = new THREE.Vector3();
const _SPINE = [_P, _sp0, _sp1, _O, _N];   // pelvis, spine_01, spine_02, spine_03, neck (filled per climb frame)
const _SEG = [0, 1, 2, 3].map(() => ({ ax: new THREE.Vector3(), l1: new THREE.Vector3(), l2: new THREE.Vector3(), len: 0 }));
const _fp = new Float64Array(5), _fp0 = new Float64Array(5), _fpc = new Float64Array(5), _fpn = new Float64Array(5);

/** Closest distance between segments [p0,p1] and [q0,q1] (Sunday's clamp). */
function segSeg(p0, p1, q0, q1) {
  const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
  const vx = q1.x - q0.x, vy = q1.y - q0.y, vz = q1.z - q0.z;
  const wx = p0.x - q0.x, wy = p0.y - q0.y, wz = p0.z - q0.z;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; } else {
    sN = b * e - c * d; tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; }
  } else if (tN > tD) {
    tN = tD;
    const k = -d + b;
    if (k < 0) sN = 0; else if (k > a) sN = sD; else { sN = k; sD = a; }
  }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  const dx = wx + sc * ux - tc * vx, dy = wy + sc * uy - tc * vy, dz = wz + sc * uz - tc * vz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** A bone's character-space position (`_mi` = the model's inverse world, set per solve). */
function _cp(bone, out) { bone.updateWorldMatrix(true, false); return out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_mi); }
/** Closest distance from point p to segment [a,b]. */
function ptSeg(p, a, b) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const l2 = ux * ux + uy * uy + uz * uz;
  let t = l2 > 1e-12 ? ((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + ux * t - p.x, dy = a.y + uy * t - p.y, dz = a.z + uz * t - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class LanceCarry {
  /**
   * @param {object} player   the Player (model, animator)
   * @param {THREE.Bone} socket  `stow_lance` (child of spine_02, identity at bind)
   * @param {THREE.Vector3} buttW  the lance butt's WORLD position in the bind pose
   * @param {THREE.Vector3} tipW   the lance tip's WORLD position in the bind pose
   * @param {object} bones  { pelvis, neck, spine2, spine3 } bones (bind pose now)
   */
  constructor(player, socket, buttW, tipW, bones) {
    this.player = player;
    this.socket = socket;
    this.bones = bones;
    const model = player.model;
    model.updateMatrixWorld(true);
    const inv = _mi.copy(model.matrixWorld).invert();
    const invQ = model.getWorldQuaternion(_qm).invert();
    // the socket's own frame: butt / tip in spine_02-local (socket == identity child)
    const par = socket.parent;
    _m.copy(par.matrixWorld).invert();
    this.Lb = buttW.clone().applyMatrix4(_m);
    this.Lt = tipW.clone().applyMatrix4(_m);
    // the trunk frame at bind (char space)
    const P = bones.pelvis.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const N = bones.neck.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const O = bones.spine3.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const U = N.clone().sub(P).normalize();
    // each spine bone's local axis that is char +X at bind
    const q2 = bones.spine2.getWorldQuaternion(new THREE.Quaternion()).premultiply(invQ);
    const q3 = bones.spine3.getWorldQuaternion(new THREE.Quaternion()).premultiply(invQ);
    this.lat2 = new THREE.Vector3(1, 0, 0).applyQuaternion(q2.clone().invert());
    this.lat3 = new THREE.Vector3(1, 0, 0).applyQuaternion(q3.clone().invert());
    const X = new THREE.Vector3(1, 0, 0).addScaledVector(U, -U.x).normalize();
    const F = new THREE.Vector3().crossVectors(X, U).normalize();
    const b = buttW.clone().applyMatrix4(inv), t = tipW.clone().applyMatrix4(inv);
    const d = t.clone().sub(b);
    this.len = d.length();
    d.normalize();
    // the strap point: where the shaft passes nearest the upper back (spine_03)
    const s = Math.max(0.2, Math.min(0.8, O.clone().sub(b).dot(d) / this.len));
    this.strapS = s;
    const strap = b.clone().addScaledVector(d, s * this.len).sub(O);
    this.strapC = [strap.dot(X), strap.dot(U), strap.dot(F)];
    // the authored direction in the trunk frame: in-plane tilt alpha toward
    // her RIGHT (-X), and the sagittal share kept as is
    const dU = d.dot(U), dX = d.dot(X), dF = d.dot(F);
    this.alpha0 = Math.atan2(-dX, dU);
    this.dF0 = dF;
    this.alpha = this.alpha0; this.beta = 0;
    this.k3 = 0.25;                       // spine_03's share of the lateral axis (run)
    this.out = { deg: 0, alpha: 0, beta: 0, tipBehindHeadPlane: 0, headGap: 0, armGap: null, feasible: true, active: false, mode: 'strap' };
    this._freeT = Infinity;               // s since the free (climb) search last ran
    this.butt = new THREE.Vector3(); this.tip = new THREE.Vector3();   // last solved (char space)
  }

  /** The lance direction for (alpha, beta) into `out` (char space; frame _U _X _F). */
  _dir(alpha, beta, out) {
    // in the back plane, then the authored sagittal share, then beta back
    _din.copy(_U).multiplyScalar(Math.cos(alpha)).addScaledVector(_X, -Math.sin(alpha)).addScaledVector(_F, this.dF0).normalize();
    out.copy(_din).multiplyScalar(Math.cos(beta)).addScaledVector(_F, -Math.sin(beta)).normalize();
    return out;
  }

  /** Butt / tip (char) for (alpha, beta): alpha about the strap point, beta about the pivot. */
  _place(alpha, beta, butt, tip) {
    this._dir(alpha, 0, _d);
    // alpha only: the line through the strap point
    _piv.copy(_strap).addScaledVector(_d, (this.pivotS() - this.strapS) * this.len);
    this._dir(alpha, beta, _d);
    butt.copy(_piv).addScaledVector(_d, -this.pivotS() * this.len);
    tip.copy(_piv).addScaledVector(_d, (1 - this.pivotS()) * this.len);
  }

  pivotS() { return R10.pivot; }

  /**
   * Solve and pose the socket. `an` the PlayerAnimator, `aimW` 0..1 (the
   * blade of the chest), `armOn` whether the draw arm is a keep-out.
   */
  update(an, aimW, armOn, dt, cam = null) {
    const B = this.bones, model = this.player.model;
    model.updateWorldMatrix(true, false);
    _mi.copy(model.matrixWorld).invert();
    model.getWorldQuaternion(_qm).invert();
    _cp(B.pelvis, _P); _cp(B.neck, _N); _cp(B.spine3, _O);
    _U.copy(_N).sub(_P).normalize();
    B.spine2.getWorldQuaternion(_q).premultiply(_qm);
    _X.copy(this.lat2).applyQuaternion(_q);
    B.spine3.getWorldQuaternion(_q2).premultiply(_qm);
    _x3.copy(this.lat3).applyQuaternion(_q2);
    const k = this.k3 + (1 - this.k3) * aimW;
    _X.multiplyScalar(1 - k).addScaledVector(_x3, k);
    _X.addScaledVector(_U, -_X.dot(_U)).normalize();
    _F.crossVectors(_X, _U).normalize();
    _strap.copy(_O).addScaledVector(_X, this.strapC[0]).addScaledVector(_U, this.strapC[1]).addScaledVector(_F, this.strapC[2]);
    _back.copy(_O).addScaledVector(_F, -0.13);
    _cp(an.b.upArmR.bone, _shR);
    this._climb = !!this.player.mantling;
    // keep-outs: the skull and its frontal plane; the draw arm while aiming
    const R = an.skull(_hc, _hf);
    const headR = Math.max(R.x, R.y, R.z);
    if (armOn) { _cp(an.b.upArmR.bone, _a0); _cp(an.b.loArmR.bone, _a1); _cp(an.b.handR.bone, _a2); }
    // V4: while aiming, the over-the-shoulder camera looks past her head at the
    // anchor; the upper shaft keeps out of that part of the screen
    this._camOn = !!cam && aimW > 0.3;
    if (this._camOn) {
      cam.updateMatrixWorld();
      _vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(model.matrixWorld);   // char -> clip
      this._aspect = cam.aspect || 1;
      _sh.copy(_hc).applyMatrix4(_vp);
      _sa.copy(armOn ? _a2 : _hc).applyMatrix4(_vp);
    }
    // the tails' segments this frame (char space), into a buffer sized once
    this._nTail = 0;
    if (!this._tailChains) {
      // (fix round 4: the wrap tail is its own class, 'wrap'; 'cloth' is the sash end)
      this._tailChains = [an.chainOf?.('hair') || [], an.chainOf?.('wrap') || an.chainOf?.('cloth') || []];
      let n = 0; for (const c of this._tailChains) n += Math.max(0, c.length - 1);
      this._tailPts = new Float32Array(n * 6);
    }
    for (let ci = 0; ci < this._tailChains.length; ci++) {
      const ch = this._tailChains[ci];
      for (let i = 0; i + 1 < ch.length; i++) {
        _cp(ch[i], _tmp); _cp(ch[i + 1], _tmp2);
        const k = this._nTail * 6, P = this._tailPts;
        P[k] = _tmp.x; P[k + 1] = _tmp.y; P[k + 2] = _tmp.z; P[k + 3] = _tmp2.x; P[k + 4] = _tmp2.y; P[k + 5] = _tmp2.z;
        this._nTail++;
      }
    }
    this._terr = this.player.ctx?.terrain?.getHeight ? this.player.ctx.terrain : null;
    if (this._climb && this.out.active) {
      // the climb: the free search round the folded trunk (see the header)
      const feas = this._updateFree(an, headR, dt);
      this._freeT = 0;
      this._report(headR, armOn, feas, 'free');
      this._pose();
      return;
    }
    this._fpOn = false;
    // the search: the feasible (alpha, beta) nearest the authored pose
    let best = Infinity, bA = this.alpha0, bB = 0, bFeas = false;
    for (let ia = 0; ia <= 15; ia++) {
      const alpha = R10.alphaMin + (R10.alphaMax - R10.alphaMin) * ia / 15;
      for (let ib = 0; ib <= 13; ib++) {
        const beta = R10.betaMax * ib / 13;
        this._place(alpha, beta, _b, _t);
        const viol = this._viol(_b, _t, headR, armOn);
        const cost = viol * 100 + Math.abs(alpha - this.alpha0) + 1.5 * beta;
        if (cost < best) { best = cost; bA = alpha; bB = beta; bFeas = viol === 0; }
      }
    }
    // ease (first frame: snap)
    const e = this.out.active ? 1 - Math.exp(-R10.rate * Math.min(dt, 0.05)) : 1;
    this.alpha += (bA - this.alpha) * e;
    this.beta += (bB - this.beta) * e;
    this._place(this.alpha, this.beta, _bT, _tT);
    // the ease never carries the pose out of a bound the target holds: if the
    // eased pose breaks one (the frame moved faster than the ease), take the
    // target this frame
    if (bFeas && this._viol(_bT, _tT, headR, armOn) > 0) {
      this.alpha = bA; this.beta = bB;
      this._place(this.alpha, this.beta, _bT, _tT);
    }
    if (this._freeT < FREE.blendOut) {
      // just off the climb: the lance eases (character space) from where the
      // free search left it back onto the strapped carry
      this._freeT += dt;
      const e2 = 1 - Math.exp(-10 * Math.min(dt, 0.05));
      this.butt.lerp(_bT, e2); this.tip.lerp(_tT, e2); this._relen(this.butt, this.tip);
      if (this.butt.distanceToSquared(_bT) + this.tip.distanceToSquared(_tT) < 1e-4) this._freeT = Infinity;
    } else { this.butt.copy(_bT); this.tip.copy(_tT); }
    this._report(headR, armOn, bFeas, 'strap');
    this._pose();
  }

  /** Fill `out` from the posed butt / tip (gates read these). */
  _report(headR, armOn, feas, mode) {
    _s.copy(this.tip).sub(this.butt).normalize();
    const o = this.out;
    o.active = true; o.feasible = feas; o.mode = mode;
    o.deg = Math.acos(Math.min(1, Math.max(-1, _s.y))) * 180 / Math.PI;
    o.alpha = this.alpha * 180 / Math.PI; o.beta = this.beta * 180 / Math.PI;
    _tmp.copy(this.tip).sub(_hc);
    o.tipBehindHeadPlane = -Math.max(_tmp.dot(_hf), _tmp.z);
    _tmp2.copy(this.butt).lerp(this.tip, 0.45);
    o.headGap = ptSeg(_hc, _tmp2, this.tip) - headR;
    o.armGap = armOn ? Math.min(segSeg(this.butt, this.tip, _a0, _a1), segSeg(this.butt, this.tip, _a1, _a2)) - 0.05 : null;
    o.camGap = this._camOn ? this._camGap(this.butt, this.tip) : null;
    o.tailGap = this._nTail > 0 ? this._tailGap(this.butt, this.tip) : null;
  }

  /** Keep the shaft its length about its midpoint (after a character-space ease). */
  _relen(b, t) {
    _q0.copy(b).add(t).multiplyScalar(0.5);
    _s.copy(t).sub(b).normalize().multiplyScalar(this.len * 0.5);
    b.copy(_q0).sub(_s); t.copy(_q0).add(_s);
  }

  /**
   * The climb: the rate-capped local search (see the header). Writes
   * butt / tip; returns whether the pose holds every bar.
   */
  _updateFree(an, headR, dt) {
    const b = an.b, F = FREE;
    _cp(b.upArmL.bone, _shL);
    _lat.copy(_shL).sub(_shR); _lat.y = 0; _lat.normalize();
    _cp(b.thighL.bone, _thL); _cp(b.thighR.bone, _thR);
    _latH.copy(_thL).sub(_thR); _latH.y = 0; _latH.normalize();
    _Ft.crossVectors(_lat, _U).normalize();
    _cp(b.calfL.bone, _cfL); _cp(b.calfR.bone, _cfR);
    _cp(b.loArmL.bone, _laL); _cp(b.loArmR.bone, _laR);
    _cp(b.spine1.bone, _sp0); _cp(b.spine2.bone, _sp1);
    // the torso's segment frames (elliptic section: shoulder-line side x back normal)
    for (let j = 0; j < 4; j++) {
      const S = _SEG[j], A0 = _SPINE[j];
      S.ax.copy(_SPINE[j + 1]).sub(A0); S.len = S.ax.length();
      if (S.len < 1e-4) continue;
      S.ax.multiplyScalar(1 / S.len);
      S.l1.copy(_lat).addScaledVector(S.ax, -_lat.dot(S.ax)).normalize();
      S.l2.crossVectors(S.ax, S.l1);
    }
    // the gate's upper-back centre: spine_03 0.13 m back along the torso's forward
    _back.copy(_O).addScaledVector(_Ft, -0.13);
    if (!this._fpOn) {
      // enter from the strapped pose
      _q0.copy(this.butt).add(this.tip).multiplyScalar(0.5).sub(_back);
      _dd.copy(this.tip).sub(this.butt).normalize();
      _fp[0] = _q0.dot(_lat); _fp[1] = _q0.dot(_U); _fp[2] = -_q0.dot(_Ft);
      _fp[3] = Math.acos(Math.min(1, Math.max(-1, _dd.y))); _fp[4] = Math.atan2(_dd.z, _dd.x);
      this._fpOn = true;
    }
    const k60 = Math.min(3, Math.max(0.25, dt * 60));
    for (let i = 0; i < 5; i++) { _fp0[i] = _fp[i]; _fpc[i] = _fp[i]; }
    let cc = this._freeCost(_fpc, headR), step0 = F.step[0];
    const st = this._fstep || (this._fstep = new Float64Array(5));
    for (let i = 0; i < 5; i++) st[i] = F.step[i];
    for (let it = 0; it < F.iters; it++) {
      let bc = cc, bk = -1, bv = 0;
      for (let k = 0; k < 5; k++) {
        for (let sg = -1; sg <= 1; sg += 2) {
          let v = _fpc[k] + sg * st[k];
          const cap = F.cap[k] * k60;
          if (v < _fp0[k] - cap) v = _fp0[k] - cap; else if (v > _fp0[k] + cap) v = _fp0[k] + cap;
          if (v < F.lo[k]) v = F.lo[k]; else if (v > F.hi[k]) v = F.hi[k];
          if (v === _fpc[k]) continue;
          for (let i = 0; i < 5; i++) _fpn[i] = _fpc[i];
          _fpn[k] = v;
          const c = this._freeCost(_fpn, headR);
          if (c < bc) { bc = c; bk = k; bv = v; }
        }
      }
      if (bk < 0) {
        if (st[0] < 0.006) break;
        for (let i = 0; i < 5; i++) st[i] *= 0.5;
        continue;
      }
      _fpc[bk] = bv; cc = bc;
    }
    for (let i = 0; i < 5; i++) _fp[i] = _fpc[i];
    this._freePose(_fp, this.butt, this.tip);
    return this._violFree(this.butt, this.tip, headR) === 0;
  }

  /** (a, u, n, theta, phi) -> butt / tip (char space). */
  _freePose(p, b, t) {
    const half = this.len * 0.5, st = Math.sin(p[3]);
    _M.copy(_back).addScaledVector(_lat, p[0]).addScaledVector(_U, p[1]).addScaledVector(_Ft, -p[2]);
    _dd.set(st * Math.cos(p[4]), Math.cos(p[3]), st * Math.sin(p[4]));
    b.copy(_M).addScaledVector(_dd, -half); t.copy(_M).addScaledVector(_dd, half);
  }

  /** The local search's objective: the bars (x100), then near the centre, near 38 deg, near last frame. */
  _freeCost(p, headR) {
    const F = FREE;
    this._freePose(p, _bT, _tT);
    let c = this._violFree(_bT, _tT, headR) * 100 + F.centre * Math.abs(p[0]);
    if (p[3] > F.prefDeg) c += F.pref * (p[3] - F.prefDeg);
    for (let k = 0; k < 5; k++) c += F.smooth * Math.abs(p[k] - _fp0[k]) / F.scale[k];
    return c;
  }

  /** Every bar of the climb search (0 = holds them all). */
  _violFree(b, t, headR) {
    const F = FREE;
    let v = 0;
    _s.copy(t).sub(b).normalize();
    const deg = Math.acos(Math.min(1, Math.max(-1, _s.y)));
    if (deg < F.degLo) v += (F.degLo - deg) * 180 / Math.PI / 10; else if (deg > F.degHi) v += (deg - F.degHi) * 180 / Math.PI / 10;
    const bl = (b.x - _P.x) * _latH.x + (b.z - _P.z) * _latH.z;
    if (bl < F.butt) v += F.butt - bl;
    const tr = -((t.x - _O.x) * _lat.x + (t.z - _O.z) * _lat.z);
    if (tr < R10.tipRight) v += R10.tipRight - tr;
    const bh = t.y - _shR.y;
    if (bh < R10.bladeLo) v += R10.bladeLo - bh; else if (bh > R10.bladeHi) v += bh - R10.bladeHi;
    const rx = t.x - _hc.x, ry = t.y - _hc.y, rz = t.z - _hc.z;
    const plane = Math.max(rx * _hf.x + ry * _hf.y + rz * _hf.z, rz) + R10.planeGap;
    if (plane > 0) v += plane;
    const mx = (b.x + t.x) * 0.5 - _back.x, my = (b.y + t.y) * 0.5 - _back.y, mz = (b.z + t.z) * 0.5 - _back.z;
    const md = Math.sqrt(mx * mx + my * my + mz * mz);
    if (md > F.midBall) v += md - F.midBall;
    _tmp2.copy(b).lerp(t, 0.45);
    const hg = ptSeg(_hc, _tmp2, t) - headR;
    if (hg < R10.headGap) v += R10.headGap - hg;
    if (this._nTail > 0) { const tg = this._tailGap(b, t); if (tg < R10.tailGap) v += R10.tailGap - tg; }
    const e = this._torsoE(b, t, F.torsoA, F.torsoB);
    if (e < 1) v += (1 - e) * 0.3;
    const lg = Math.min(segSeg(b, t, _thL, _cfL), segSeg(b, t, _thR, _cfR));
    if (lg < F.legAxis) v += F.legAxis - lg;
    const ag = Math.min(segSeg(b, t, _shL, _laL), segSeg(b, t, _shR, _laR));
    if (ag < F.armAxis) v += F.armAxis - ag;
    if (this._terr) {
      _w0.copy(b).applyMatrix4(this.player.model.matrixWorld);
      const gg = _w0.y - this._terr.getHeight(_w0.x, _w0.z) - 0.05;
      if (gg < R10.groundGap) v += R10.groundGap - gg;
    }
    return v;
  }

  /**
   * The shaft against the torso: per spine segment, both ends taken into the
   * segment's frame scaled by the elliptic section (side A, front/back B), so
   * the section is a unit circle round the axis; the shaft clipped to the
   * segment's span (the torso ends at the pelvis and the neck), then its
   * distance from the axis (>= 1: outside). Exact, not sampled.
   */
  _torsoE(b, t, A, B) {
    let e = Infinity;
    for (let j = 0; j < 4; j++) {
      const S = _SEG[j], A0 = _SPINE[j];
      if (S.len < 1e-4) continue;
      _q0.copy(b).sub(A0); _z0.set(_q0.dot(S.ax), _q0.dot(S.l1) / A, _q0.dot(S.l2) / B);
      _q0.copy(t).sub(A0); _z1.set(_q0.dot(S.ax), _q0.dot(S.l1) / A, _q0.dot(S.l2) / B);
      const dx = _z1.x - _z0.x;
      let ta = 0, tb = 1;
      if (Math.abs(dx) < 1e-9) { if (_z0.x < 0 || _z0.x > S.len) continue; } else {
        const u0 = -_z0.x / dx, u1 = (S.len - _z0.x) / dx;
        ta = Math.max(0, Math.min(u0, u1)); tb = Math.min(1, Math.max(u0, u1));
        if (ta > tb) continue;
      }
      // the clipped piece in the section plane (y, z): its distance from the origin
      const ay = _z0.y + (_z1.y - _z0.y) * ta, az = _z0.z + (_z1.z - _z0.z) * ta;
      const by = _z0.y + (_z1.y - _z0.y) * tb, bz = _z0.z + (_z1.z - _z0.z) * tb;
      const ux = by - ay, uz = bz - az, l2 = ux * ux + uz * uz;
      let k = l2 > 1e-12 ? -(ay * ux + az * uz) / l2 : 0;
      k = k < 0 ? 0 : k > 1 ? 1 : k;
      const d = Math.hypot(ay + ux * k, az + uz * k);
      if (d < e) e = d;
    }
    return e;
  }

  /**
   * How far (butt, tip) breaks the bounds (0 = holds them all): the R10 band,
   * the blade behind the head's frontal plane (the head's own forward AND the
   * character's: a head pitched down tilts its plane back at the top), the
   * skull clearance along the upper shaft, the draw arm while aiming.
   */
  _viol(b, t, headR, armOn) {
    _s.copy(t).sub(b).normalize();
    const deg = Math.acos(Math.min(1, Math.max(-1, _s.y)));
    let viol = 0;
    if (deg < R10.degLo) viol += R10.degLo - deg;
    if (deg > R10.degHi) viol += deg - R10.degHi;
    // the blade over the right shoulder and right of the spine (A100)
    const bh = t.y - _shR.y;
    if (bh < R10.bladeLo) viol += (R10.bladeLo - bh) * 2; else if (bh > R10.bladeHi) viol += (bh - R10.bladeHi) * 2;
    const tr = -((t.x - _O.x) * _X.x + (t.y - _O.y) * _X.y + (t.z - _O.z) * _X.z);
    if (tr < R10.tipRight) viol += (R10.tipRight - tr) * 2;
    // the midpoint on the upper back (A100's surface centre: spine_03 pushed 0.13 m back)
    const mx = (b.x + t.x) * 0.5 - _back.x, my = (b.y + t.y) * 0.5 - _back.y, mz = (b.z + t.z) * 0.5 - _back.z;
    const md = Math.sqrt(mx * mx + my * my + mz * mz);
    if (md > R10.midBall) viol += (md - R10.midBall) * 3;
    _tmp.copy(t).sub(_hc);
    const plane = Math.max(_tmp.dot(_hf), _tmp.z) + R10.planeGap;
    if (plane > 0) viol += plane * 3;
    _tmp2.copy(b).lerp(t, 0.45);
    const hg = ptSeg(_hc, _tmp2, t) - headR;
    if (hg < R10.headGap) viol += (R10.headGap - hg) * 3;
    if (armOn) {
      const ag = Math.min(segSeg(b, t, _a0, _a1), segSeg(b, t, _a1, _a2)) - 0.05;
      if (ag < R10.armGap) viol += (R10.armGap - ag) * 3;
    }
    if (this._camOn) {
      const cg = this._camGap(b, t);
      if (cg < R10.camGap) viol += (R10.camGap - cg) * 0.5;
    }
    if (this._nTail > 0) {
      const tg = this._tailGap(b, t);
      if (tg < R10.tailGap) viol += (R10.tailGap - tg) * 3;
    }
    if (this._terr) {
      _w0.copy(b).applyMatrix4(this.player.model.matrixWorld);
      const gg = _w0.y - this._terr.getHeight(_w0.x, _w0.z) - 0.05;
      if (gg < R10.groundGap) viol += (R10.groundGap - gg) * 3;
    }
    return viol;
  }

  /** Smallest distance from the shaft to the knot-tail / wrap-tail segments (char), less the shaft's radius. */
  _tailGap(b, t) {
    let g = Infinity;
    const P = this._tailPts;
    for (let i = 0; i < this._nTail; i++) {
      const k = i * 6;
      _ta.set(P[k], P[k + 1], P[k + 2]); _tb.set(P[k + 3], P[k + 4], P[k + 5]);
      const d = segSeg(b, t, _ta, _tb) - 0.0145;
      if (d < g) g = d;
    }
    return g;
  }

  /** Screen distance (NDC, x scaled by aspect) of the upper shaft from the head and the anchor hand. */
  _camGap(b, t) {
    let g = Infinity;
    for (let k = 0; k < 4; k++) {
      _sc.copy(b).lerp(t, 0.45 + 0.55 * k / 3).applyMatrix4(_vp);
      if (_sc.z < -1 || _sc.z > 1) continue;            // behind the lens / past far
      const d1 = Math.hypot((_sc.x - _sh.x) * this._aspect, _sc.y - _sh.y);
      const d2 = Math.hypot((_sc.x - _sa.x) * this._aspect, _sc.y - _sa.y);
      if (d1 < g) g = d1;
      if (d2 < g) g = d2;
    }
    return g;
  }

  /**
   * Write the socket so the skinned lance lands on (butt, tip): the rigid
   * motion taking the NATURAL lance (socket at identity under spine_02) to the
   * solved one, with the shortest-arc rotation (the lance is round; its roll
   * stays spine_02's).
   */
  _pose() {
    const par = this.socket.parent, model = this.player.model;
    par.updateWorldMatrix(true, false);
    // natural butt / tip, world
    _nb.copy(this.Lb).applyMatrix4(par.matrixWorld);
    _nt.copy(this.Lt).applyMatrix4(par.matrixWorld);
    // solved butt / tip, world
    _w0.copy(this.butt).applyMatrix4(model.matrixWorld);
    _w1.copy(this.tip).applyMatrix4(model.matrixWorld);
    _tmp.copy(_nt).sub(_nb).normalize();
    _tmp2.copy(_w1).sub(_w0).normalize();
    _q.setFromUnitVectors(_tmp, _tmp2);
    // M = T(w0) R T(-nb) ; socket world = M · par.world ; local = par^-1 · M · par
    _m.makeRotationFromQuaternion(_q);
    _tmp.copy(_nb).applyQuaternion(_q);
    _m.setPosition(_w0.x - _tmp.x, _w0.y - _tmp.y, _w0.z - _tmp.z);
    _m2.copy(par.matrixWorld).invert().multiply(_m).multiply(par.matrixWorld);
    _m2.decompose(this.socket.position, this.socket.quaternion, this.socket.scale);
    // world matrix now, not at the next render: anything that reads the
    // skinned lance this frame (the camera proxy, gates) sees the solved pose
    this.socket.updateMatrix();
    this.socket.matrixWorld.multiplyMatrices(par.matrixWorld, this.socket.matrix);
  }

  /** Back to the identity (the lance rides spine_02). */
  reset() {
    this.socket.position.set(0, 0, 0); this.socket.quaternion.identity(); this.socket.scale.set(1, 1, 1);
    this.out.active = false; this._freeT = Infinity; this._fpOn = false;
  }
}

export { R10 as CARRY_BOUNDS };
