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
 *
 * ALLOCATION (armory W1, A-alloc-rate's 4 KB/s per function, R48 c). Optimised
 * code still boxes a double that crosses a call it did not inline: an argument,
 * a return value (`v.length()`, `normalize()`, `addScaledVector(v, s)`,
 * `getWorldQuaternion` -> `decompose`). So the per-frame path never hands a
 * double to a call: three.js is used only through calls that take objects
 * (`copy`, `applyMatrix4`, `setFromMatrixPosition`, `invert`, `multiplyMatrices`),
 * directions are taken through the bones' world matrices, doubles cross this
 * file's own calls through typed slots, `out`'s numbers are never null (NaN
 * reads "not measured"; `HeroStowKit.carryInfo()` gives the gates null), and the
 * socket's transform is solved in place (`_pose`). Measured offline on a mock
 * rig with V8's sampling heap profiler (the gate's method): 0 KB/s per function.
 */
import * as THREE from 'three';

const R10 = {
  degLo: 33.3 * Math.PI / 180,      // R10 band 32-40 deg, held 1.3 deg inside
  degHi: 38.7 * Math.PI / 180,
  midBall: 0.27,                    // the shaft's midpoint to the upper-back SURFACE (A100: 0.30)
  alphaMin: 14 * Math.PI / 180,     // in-plane tilt range (bind: 34 deg; the cost keeps it near 34)
  alphaMax: 74 * Math.PI / 180,
  bladeLo: 0.25, bladeHi: 0.65,     // the blade over the right shoulder (A100: 0.20-0.70)
  tipRight: 0.18,                   // the blade right of the spine (A100: > 0.15), along her level shoulder line
  buttLeft: 0.02,                   // the butt left of the pelvis along her level hip line (A-lance-stow: > 0)
  betaMax: 60 * Math.PI / 180,      // top tilted back off the back plane (a folded trunk — the climb's press — needs most of it)
  pivot: 0.30,                      // beta's pivot, fraction of the lance from the butt
  headGap: 0.07,                    // skull (ellipsoid's largest semi-axis) clearance
  armGap: 0.07,                     // draw-arm clearance while aiming
  tailGap: 0.085,                   // the knot tail / wrap tail segments vs the shaft (A100's "ponytail clearance", 0.06; fix round 5: 0.07 -> 0.085, the leaned-back up aim sat on it)
  groundGap: 0.06,                  // the bob over the terrain (A-stow-clearance: crouched)
  camGap: 0.42,                     // while aiming: the upper shaft >= this far (NDC, aspect-true) from the head + anchor on screen (V4)
  planeGap: 0.03,                   // blade behind the head's frontal plane
  rate: 14,                         // ease toward the chosen (alpha, beta), 1/s
  degW: 4,                          // weight of the R10 band's upper-edge violation (fix round 5: its 1.3 deg of margin costs what the blade's 3-5 cm do)
  slLo: -0.12, slHi: 0.04,          // fix round 5: the lance's slide along itself through the strap (m)
  slCost: 2,                        // ...and its cost per metre off the authored strap position
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
/** Fix round 1: the strapped search runs at most every this many frames (it re-runs at once when the held pose breaks a bound). */
const SEARCH_EVERY = 4;
/** Fix round 1: how many times the solve runs itself at its first frame, so V8 optimizes it before play (see `warm`). */
const WARM_CALLS = 1600;
/** ...and every this many searches it starts from the whole grid instead of the last answer. */
const GRID_EVERY = 8;

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
// Doubles cross function boundaries through these slots: a returned or passed double is a heap number per
// call, and the search below evaluates some 300 poses a frame (A-alloc-rate, R48 c).
const _R = new Float64Array(1);      // segSeg / ptSeg
const _RG = new Float64Array(3);     // _viol, _tailGap, _camGap
const _ARG = new Float64Array(3);    // _placeS: alpha, beta, slide
const _FR = new Float64Array(2);     // this frame: the head's radius, the ground under the lance's butt
const _CAMK = new Float64Array([0.45, 0.45 + 0.55 / 3, 0.45 + 1.1 / 3, 1]);
const _SEG = [0, 1, 2, 3].map(() => ({ ax: new THREE.Vector3(), l1: new THREE.Vector3(), l2: new THREE.Vector3(), len: 0 }));
const _fp = new Float64Array(5), _fp0 = new Float64Array(5), _fpc = new Float64Array(5), _fpn = new Float64Array(5);
// _viol's terms, every evaluation (debugViol reads them): deg, blade, mid, plane, head, arm, cam, tail, ground, groundGapM
const _VP = new Float64Array(11);
const _VPN = ['deg', 'blade', 'mid', 'plane', 'head', 'arm', 'cam', 'tail', 'ground', 'groundGapM', 'butt'];
// _pose: the socket's parent inverse, the rigid motion, products (column-major, as three.js)
const _PI = new Float64Array(16), _MM = new Float64Array(16), _T1 = new Float64Array(16), _LM = new Float64Array(16);

/** `x` clamped to [-1, 1] into `_CL[0]`, for Math.acos: a clamp's phi feeding a Math call boxes in V8's mid tier. */
const _CL = new Float64Array(1);
// the search's best pose (cost, alpha, beta, slide), two scalars, and the six trial moves' signs
const _BS = new Float64Array(4), _ST = new Float64Array(2), _SS = new Float64Array(4);
const _DA = new Float64Array([1, -1, 0, 0, 0, 0]), _DB = new Float64Array([0, 0, 1, -1, 0, 0]), _DS = new Float64Array([0, 0, 0, 0, 1, -1]);
function _clampAcos(x) { _CL[0] = x; if (x > 1) _CL[0] = 1; else if (x < -1) _CL[0] = -1; }
/** Normalise in place (no double crosses a call). */
function _nrm(v) {
  const l = (v.x * v.x + v.y * v.y + v.z * v.z) ** 0.5 || 1;
  v.x /= l; v.y /= l; v.z /= l;
}
/** `out` = the bone's world rotation applied to the local direction `v`, taken to character space (`_mi`), unit. */
function _dirChar(bone, v, out) {
  const e = bone.matrixWorld.elements, m = _mi.elements;
  const wx = e[0] * v.x + e[4] * v.y + e[8] * v.z, wy = e[1] * v.x + e[5] * v.y + e[9] * v.z, wz = e[2] * v.x + e[6] * v.y + e[10] * v.z;
  out.x = m[0] * wx + m[4] * wy + m[8] * wz; out.y = m[1] * wx + m[5] * wy + m[9] * wz; out.z = m[2] * wx + m[6] * wy + m[10] * wz;
  _nrm(out);
}
/** out = a * b (4x4, column-major; `a`, `b` arrays or typed arrays). */
function _m4mul(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
}
/** out = inverse(te) (three.js's Matrix4.invert, into a typed array). */
function _m4inv(out, te) {
  const n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3], n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7];
  const n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11], n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];
  const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
  const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
  const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
  const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (det === 0) { out.fill(0); return; }
  const d = 1 / det;
  out[0] = t11 * d;
  out[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * d;
  out[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * d;
  out[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * d;
  out[4] = t12 * d;
  out[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * d;
  out[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * d;
  out[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * d;
  out[8] = t13 * d;
  out[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * d;
  out[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * d;
  out[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * d;
  out[12] = t14 * d;
  out[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * d;
  out[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * d;
  out[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * d;
}

/** Closest distance between segments [p0,p1] and [q0,q1] (Sunday's clamp), into `_R[0]`. */
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
  _R[0] = (dx * dx + dy * dy + dz * dz) ** 0.5;
}
/** A bone's character-space position (`_mi` = the model's inverse world, set per solve). */
function _cp(bone, out) { bone.updateWorldMatrix(true, false); return out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_mi); }
/** Closest distance from point p to segment [a,b], into `_R[0]`. */
function ptSeg(p, a, b) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const l2 = ux * ux + uy * uy + uz * uz;
  let t = l2 > 1e-12 ? ((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + ux * t - p.x, dy = a.y + uy * t - p.y, dz = a.z + uz * t - p.z;
  _R[0] = (dx * dx + dy * dy + dz * dz) ** 0.5;
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
    this.strapC = new Float64Array([strap.dot(X), strap.dot(U), strap.dot(F)]);
    // the authored direction in the trunk frame: in-plane tilt alpha toward
    // her RIGHT (-X), and the sagittal share kept as is
    const dU = d.dot(U), dX = d.dot(X), dF = d.dot(F);
    this.alpha0 = Math.atan2(-dX, dU);
    this.dF0 = dF;
    this.alpha = this.alpha0; this.beta = 0; this.sl = 0;
    this.k3 = 0.25;                       // spine_03's share of the lateral axis (run)
    this.bounds = R10;                    // (probes / gates read the live bounds)
    this._gridAge = 8; this._lastFeas = false; this._tA = 0; this._tB = 0; this._tS = 0;
    this._tick = 0; this._aspect = 1; this._camOn = false; this._armOn = false; this._climb = false; this._headR = 0.1;
    this._searchAge = 0; this._armWas = false; this._camWas = false;
    this._nTail = 0; this._tailChains = null; this._tailPts = null; this._terr = null; this._fpOn = false; this._fstep = null;
    // every number is a number (NaN: not measured this frame), so no field ever holds a boxed double
    this.out = { deg: 0, alpha: 0, beta: 0, slide: 0, tipBehindHeadPlane: 0, headGap: 0, armGap: NaN, camGap: NaN, tailGap: NaN, feasible: true, active: false, mode: 'strap' };
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
  _place(alpha, beta, butt, tip, sl = 0) {
    this._dir(alpha, 0, _d);
    // alpha only: the line through the strap point
    _piv.copy(_strap).addScaledVector(_d, (this.pivotS() - this.strapS) * this.len);
    this._dir(alpha, beta, _d);
    // fix round 5: `sl` slides the lance along itself through the strap (m, + = up)
    butt.copy(_piv).addScaledVector(_d, -this.pivotS() * this.len + sl);
    tip.copy(_piv).addScaledVector(_d, (1 - this.pivotS()) * this.len + sl);
  }

  /** `_place` for the search: (alpha, beta, slide) in `_ARG`, no double crossing a call. Same arithmetic. */
  _placeS(butt, tip) {
    const alpha = _ARG[0], beta = _ARG[1], sl = _ARG[2], pv = R10.pivot, len = this.len, dF = this.dF0;
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    let ix = _U.x * ca - _X.x * sa + _F.x * dF, iy = _U.y * ca - _X.y * sa + _F.y * dF, iz = _U.z * ca - _X.z * sa + _F.z * dF;
    const il = (ix * ix + iy * iy + iz * iz) ** 0.5 || 1;
    ix /= il; iy /= il; iz /= il;
    const ps = (pv - this.strapS) * len;
    const px = _strap.x + ix * ps, py = _strap.y + iy * ps, pz = _strap.z + iz * ps;
    const cb = Math.cos(beta), sb = Math.sin(beta);
    let dx = ix * cb - _F.x * sb, dy = iy * cb - _F.y * sb, dz = iz * cb - _F.z * sb;
    const dl = (dx * dx + dy * dy + dz * dz) ** 0.5 || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const kb = -pv * len + sl, kt = (1 - pv) * len + sl;
    butt.x = px + dx * kb; butt.y = py + dy * kb; butt.z = pz + dz * kb;
    tip.x = px + dx * kt; tip.y = py + dy * kt; tip.z = pz + dz * kt;
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
    _cp(B.pelvis, _P); _cp(B.neck, _N); _cp(B.spine3, _O);     // (spine_03's update brings spine_02's world matrix with it)
    _U.x = _N.x - _P.x; _U.y = _N.y - _P.y; _U.z = _N.z - _P.z; _nrm(_U);
    _dirChar(B.spine2, this.lat2, _X);
    _dirChar(B.spine3, this.lat3, _x3);
    const k = this.k3 + (1 - this.k3) * aimW, k1 = 1 - k;
    _X.x = _X.x * k1 + _x3.x * k; _X.y = _X.y * k1 + _x3.y * k; _X.z = _X.z * k1 + _x3.z * k;
    const xu = _X.x * _U.x + _X.y * _U.y + _X.z * _U.z;
    _X.x -= _U.x * xu; _X.y -= _U.y * xu; _X.z -= _U.z * xu; _nrm(_X);
    _F.x = _X.y * _U.z - _X.z * _U.y; _F.y = _X.z * _U.x - _X.x * _U.z; _F.z = _X.x * _U.y - _X.y * _U.x; _nrm(_F);
    const c0 = this.strapC[0], c1 = this.strapC[1], c2 = this.strapC[2];
    _strap.x = _O.x + _X.x * c0 + _U.x * c1 + _F.x * c2;
    _strap.y = _O.y + _X.y * c0 + _U.y * c1 + _F.y * c2;
    _strap.z = _O.z + _X.z * c0 + _U.z * c1 + _F.z * c2;
    _back.x = _O.x - _F.x * 0.13; _back.y = _O.y - _F.y * 0.13; _back.z = _O.z - _F.z * 0.13;
    _cp(an.b.upArmR.bone, _shR);
    // her level shoulder line (the blade's right) and hip line (the butt's left): A-lance-stow's own axes. A bladed
    // draw or a crouch turns them off the spine's lateral, which is where the blade's 0.15 and the butt's side failed
    _cp(an.b.upArmL.bone, _shL);
    _lat.x = _shL.x - _shR.x; _lat.y = 0; _lat.z = _shL.z - _shR.z; _nrm(_lat);
    _cp(an.b.thighL.bone, _thL); _cp(an.b.thighR.bone, _thR);
    _latH.x = _thL.x - _thR.x; _latH.y = 0; _latH.z = _thL.z - _thR.z; _nrm(_latH);
    this._climb = !!this.player.mantling;
    // keep-outs: the skull and its frontal plane; the draw arm while aiming
    const R = an.skull(_hc, _hf);
    let headR = R.x; if (R.y > headR) headR = R.y; if (R.z > headR) headR = R.z;
    this._headR = headR; this._armOn = armOn;
    _FR[0] = headR;
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
    // the ground under the butt, every other frame (the two coordinates it takes are the only doubles this frame
    // hands to a call): every pose of the search lies within a hand of it, and she covers 0.2 m in two frames
    this._tick = (this._tick + 1) & 1023;
    if (this._terr && ((this._tick & 1) === 0 || !this.out.active)) { _w0.copy(this.butt).applyMatrix4(model.matrixWorld); _FR[1] = this._terr.getHeight(_w0.x, _w0.z); }
    if (this._climb && this.out.active) {
      // the climb: the free search round the folded trunk (see the header)
      const feas = this._updateFree(an, headR, dt);
      this._freeT = 0;
      this._report(armOn, feas, 'free');
      this._pose();
      return;
    }
    this._fpOn = false;
    // the search: the feasible (alpha, beta) nearest the authored pose
    // the best pose so far lives in a typed slot (cost, alpha, beta, slide): no double merges through control flow
    const BS = _BS;
    BS[0] = 1e9; BS[1] = this.alpha0; BS[2] = 0; BS[3] = this.sl;
    let bFeas = false;
    /* FIX ROUND 1 (armory W1 judges, A-alloc-rate's 4 KB/s per function): the search no longer runs every frame. The
     * pose it finds is (alpha, beta, slide) IN THE TRUNK FRAME, so it follows the body by construction; it is
     * re-searched at most every SEARCH_EVERY frames (15 Hz at 60), and at once when the held target breaks a bound in
     * this frame's body (one evaluation), when the draw arm or the aim camera turns on or off, and while the solve has
     * no feasible pose. The grid runs every GRID_EVERY-th search (<= 2 Hz) so the search cannot stay in a local
     * minimum. The ease and the bound check on the eased pose below run every frame, as before. */
    let due = !this.out.active || this._lastFeas !== true || this._searchAge >= SEARCH_EVERY - 1
      || armOn !== this._armWas || this._camOn !== this._camWas || this._freeT < FREE.blendOut;
    if (!due) {
      _ARG[0] = this._tA; _ARG[1] = this._tB; _ARG[2] = this._tS;
      this._placeS(_b, _t);
      this._viol(_b, _t, armOn);
      if (_RG[0] > 0) due = true;
    }
    this._armWas = armOn; this._camWas = this._camOn;
    if (!due) {
      this._searchAge++;
      BS[1] = this._tA; BS[2] = this._tB; BS[3] = this._tS;
      bFeas = true;
    } else this._searchAge = 0;
    // the whole grid while there is no feasible pose to start from, and every GRID_EVERY-th search
    const warm = !due || (this.out.active && this._lastFeas === true && this._gridAge < GRID_EVERY);
    if (due) this._gridAge = warm ? this._gridAge + 1 : 0;
    if (!due) { /* the held target: nothing to search */ } else if (warm) {
      BS[1] = this._tA; BS[2] = this._tB; BS[3] = this._tS;
      _ARG[0] = BS[1]; _ARG[1] = BS[2]; _ARG[2] = BS[3];
      this._placeS(_b, _t);
      this._viol(_b, _t, armOn);
      BS[0] = _RG[0] * 100 + Math.abs(BS[1] - this.alpha0) + 1.5 * BS[2] + R10.slCost * Math.abs(BS[3]);
      bFeas = _RG[0] === 0;
    } else for (let ia = 0; ia <= 15; ia++) {
      const alpha = R10.alphaMin + (R10.alphaMax - R10.alphaMin) * ia / 15;
      for (let ib = 0; ib <= 13; ib++) {
        const beta = R10.betaMax * ib / 13;
        _ARG[0] = alpha; _ARG[1] = beta; _ARG[2] = this.sl;
        this._placeS(_b, _t);
        this._viol(_b, _t, armOn);
        const viol = _RG[0];
        const cost = viol * 100 + Math.abs(alpha - this.alpha0) + 1.5 * beta + R10.slCost * Math.abs(this.sl);
        if (cost < BS[0]) { BS[0] = cost; BS[1] = alpha; BS[2] = beta; bFeas = viol === 0; }
      }
    }
    /* R5 fix round 5 (judge r2, A-lance-stow: crouch-walk 40.011 deg against
     * R10's 40 on one run in three). The 16 x 14 grid steps alpha by 4.0 deg
     * and beta by 4.6; crouched (the trunk pitched 35-40 deg forward) no grid
     * point held every bound, and the nearest one paid for the blade's height
     * over the shoulder with the band's 1.3 deg of margin — 38.8-39.8 deg
     * crouch-walking, 42 crouch-strafing (probe `lance2`). A PATTERN SEARCH
     * from the best grid point (step halving, <= 12 rounds of 4 trial poses)
     * finds the feasible pose between the grid points where one exists, and
     * the band's upper edge is weighted (`degW`) like the blade's margins, so
     * where none does the trade no longer spends the R10 band first. */
    {
      // ...over (alpha, beta) and `sl`, the lance's slide along itself through
      // the strap: crouched, the blade stood 0.64-0.69 m over the right
      // shoulder against the solve's 0.65 (A100: 0.70) and only a steeper
      // lance could lower it — sliding it down its sling lowers the blade at
      // the same angle (the bob still clears the ground: `groundGap`)
      // the steps (alpha, beta, slide) in a typed slot too: a double carried round a loop boxes in V8's mid tier
      const SS = _SS;
      SS[3] = 1; if (warm) SS[3] = 0.25;
      SS[0] = SS[3] * (R10.alphaMax - R10.alphaMin) / 30; SS[1] = SS[3] * R10.betaMax / 26; SS[2] = SS[3] * 0.02;
      for (let it = 0; due && it < 14 && BS[0] > 0; it++) {
        let moved = false;
        for (let k = 0; k < 6; k++) {
          // the six trial moves: +-alpha, +-beta, +-slide (signs from typed tables: a ternary's phi would box)
          const a = BS[1] + SS[0] * _DA[k], bb = BS[2] + SS[1] * _DB[k];
          const sl = BS[3] + SS[2] * _DS[k];
          if (a < R10.alphaMin || a > R10.alphaMax || bb < 0 || bb > R10.betaMax || sl < R10.slLo || sl > R10.slHi) continue;
          _ARG[0] = a; _ARG[1] = bb; _ARG[2] = sl;
          this._placeS(_b, _t);
          this._viol(_b, _t, armOn);
          const viol = _RG[0];
          const cost = viol * 100 + Math.abs(a - this.alpha0) + 1.5 * bb + R10.slCost * Math.abs(sl);
          if (cost < BS[0] - 1e-9) { BS[0] = cost; BS[1] = a; BS[2] = bb; BS[3] = sl; bFeas = viol === 0; moved = true; }
        }
        if (!moved) { SS[0] *= 0.5; SS[1] *= 0.5; SS[2] *= 0.5; if (SS[0] < 0.002) break; }
      }
    }
    const bA = BS[1], bB = BS[2], bS = BS[3];
    this._tA = bA; this._tB = bB; this._tS = bS; this._lastFeas = bFeas;
    // ease (first frame: snap)
    _ST[1] = 1; if (this.out.active) _ST[1] = 1 - Math.exp(-R10.rate * (dt < 0.05 ? dt : 0.05));
    const e = _ST[1];
    this.alpha += (bA - this.alpha) * e;
    this.beta += (bB - this.beta) * e;
    this.sl += (bS - this.sl) * e;
    _ARG[0] = this.alpha; _ARG[1] = this.beta; _ARG[2] = this.sl;
    this._placeS(_bT, _tT);
    // the ease never carries the pose out of a bound the target holds: if the
    // eased pose breaks one (the frame moved faster than the ease), take the
    // target this frame
    this._viol(_bT, _tT, armOn);
    if (bFeas && _RG[0] > 0) {
      this.alpha = bA; this.beta = bB; this.sl = bS;
      _ARG[0] = bA; _ARG[1] = bB; _ARG[2] = bS;
      this._placeS(_bT, _tT);
    }
    const bt = this.butt, tp = this.tip;
    if (this._freeT < FREE.blendOut) {
      // just off the climb: the lance eases (character space) from where the
      // free search left it back onto the strapped carry
      this._freeT += dt;
      const e2 = 1 - Math.exp(-10 * (dt < 0.05 ? dt : 0.05));   // (only off a climb)
      bt.x += (_bT.x - bt.x) * e2; bt.y += (_bT.y - bt.y) * e2; bt.z += (_bT.z - bt.z) * e2;
      tp.x += (_tT.x - tp.x) * e2; tp.y += (_tT.y - tp.y) * e2; tp.z += (_tT.z - tp.z) * e2;
      this._relen(bt, tp);
      const db = (bt.x - _bT.x) ** 2 + (bt.y - _bT.y) ** 2 + (bt.z - _bT.z) ** 2, dtp = (tp.x - _tT.x) ** 2 + (tp.y - _tT.y) ** 2 + (tp.z - _tT.z) ** 2;
      if (db + dtp < 1e-4) this._freeT = Infinity;
    } else { bt.copy(_bT); tp.copy(_tT); }
    this._report(armOn, bFeas, 'strap');
    this._pose();
  }

  /** Fill `out` from the posed butt / tip (gates read these). The head's radius is this frame's `_FR[0]`. */
  _report(armOn, feas, mode) {
    const b = this.butt, t = this.tip, o = this.out, headR = _FR[0];
    const sx = t.x - b.x, sy = t.y - b.y, sz = t.z - b.z;
    _clampAcos(sy / ((sx * sx + sy * sy + sz * sz) ** 0.5 || 1));
    o.active = true; o.feasible = feas; o.mode = mode;
    o.deg = Math.acos(_CL[0]) * 180 / Math.PI;
    o.alpha = this.alpha * 180 / Math.PI; o.beta = this.beta * 180 / Math.PI; o.slide = this.sl;
    const px = t.x - _hc.x, py = t.y - _hc.y, pz = t.z - _hc.z;
    const pf = px * _hf.x + py * _hf.y + pz * _hf.z;
    o.tipBehindHeadPlane = -(pf > pz ? pf : pz);
    _tmp2.x = b.x + sx * 0.45; _tmp2.y = b.y + sy * 0.45; _tmp2.z = b.z + sz * 0.45;
    ptSeg(_hc, _tmp2, t);
    o.headGap = _R[0] - headR;
    if (armOn) {
      segSeg(b, t, _a0, _a1);
      const g0 = _R[0];
      segSeg(b, t, _a1, _a2);
      o.armGap = (g0 < _R[0] ? g0 : _R[0]) - 0.05;
    } else o.armGap = NaN;
    if (this._camOn) { this._camGap(b, t); o.camGap = _RG[2]; } else o.camGap = NaN;
    if (this._nTail > 0) { this._tailGap(b, t); o.tailGap = _RG[1]; } else o.tailGap = NaN;
  }

  /** Keep the shaft its length about its midpoint (after a character-space ease). */
  _relen(b, t) {
    const mx = (b.x + t.x) * 0.5, my = (b.y + t.y) * 0.5, mz = (b.z + t.z) * 0.5;
    let sx = t.x - b.x, sy = t.y - b.y, sz = t.z - b.z;
    const h = this.len * 0.5 / ((sx * sx + sy * sy + sz * sz) ** 0.5 || 1);
    sx *= h; sy *= h; sz *= h;
    b.x = mx - sx; b.y = my - sy; b.z = mz - sz;
    t.x = mx + sx; t.y = my + sy; t.z = mz + sz;
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
    const k6 = dt * 60, k60 = k6 > 3 ? 3 : k6 < 0.25 ? 0.25 : k6;
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
    _clampAcos(_s.y);
    const deg = Math.acos(_CL[0]);
    if (deg < F.degLo) v += (F.degLo - deg) * 180 / Math.PI / 10; else if (deg > F.degHi) v += (deg - F.degHi) * 180 / Math.PI / 10;
    const bl = (b.x - _P.x) * _latH.x + (b.z - _P.z) * _latH.z;
    if (bl < F.butt) v += F.butt - bl;
    const tr = -((t.x - _O.x) * _lat.x + (t.z - _O.z) * _lat.z);
    if (tr < R10.tipRight) v += R10.tipRight - tr;
    const bh = t.y - _shR.y;
    if (bh < R10.bladeLo) v += R10.bladeLo - bh; else if (bh > R10.bladeHi) v += bh - R10.bladeHi;
    const rx = t.x - _hc.x, ry = t.y - _hc.y, rz = t.z - _hc.z;
    const rf = rx * _hf.x + ry * _hf.y + rz * _hf.z, plane = (rf > rz ? rf : rz) + R10.planeGap;
    if (plane > 0) v += plane;
    const mx = (b.x + t.x) * 0.5 - _back.x, my = (b.y + t.y) * 0.5 - _back.y, mz = (b.z + t.z) * 0.5 - _back.z;
    const md = (mx * mx + my * my + mz * mz) ** 0.5;
    if (md > F.midBall) v += md - F.midBall;
    _tmp2.copy(b).lerp(t, 0.45);
    ptSeg(_hc, _tmp2, t);
    const hg = _R[0] - headR;
    if (hg < R10.headGap) v += R10.headGap - hg;
    if (this._nTail > 0) { this._tailGap(b, t); const tg = _RG[1]; if (tg < R10.tailGap) v += R10.tailGap - tg; }
    const e = this._torsoE(b, t, F.torsoA, F.torsoB);
    if (e < 1) v += (1 - e) * 0.3;
    segSeg(b, t, _thL, _cfL);
    const lg0 = _R[0];
    segSeg(b, t, _thR, _cfR);
    const lg = lg0 < _R[0] ? lg0 : _R[0];
    if (lg < F.legAxis) v += F.legAxis - lg;
    segSeg(b, t, _shL, _laL);
    const ag0 = _R[0];
    segSeg(b, t, _shR, _laR);
    const ag = ag0 < _R[0] ? ag0 : _R[0];
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
    let e = 1e9;
    for (let j = 0; j < 4; j++) {
      const S = _SEG[j], A0 = _SPINE[j];
      if (S.len < 1e-4) continue;
      _q0.copy(b).sub(A0); _z0.set(_q0.dot(S.ax), _q0.dot(S.l1) / A, _q0.dot(S.l2) / B);
      _q0.copy(t).sub(A0); _z1.set(_q0.dot(S.ax), _q0.dot(S.l1) / A, _q0.dot(S.l2) / B);
      const dx = _z1.x - _z0.x;
      let ta = 0, tb = 1;
      if (Math.abs(dx) < 1e-9) { if (_z0.x < 0 || _z0.x > S.len) continue; } else {
        const u0 = -_z0.x / dx, u1 = (S.len - _z0.x) / dx;
        const ulo = u0 < u1 ? u0 : u1, uhi = u0 < u1 ? u1 : u0;
        ta = ulo > 0 ? ulo : 0; tb = uhi < 1 ? uhi : 1;
        if (ta > tb) continue;
      }
      // the clipped piece in the section plane (y, z): its distance from the origin
      const ay = _z0.y + (_z1.y - _z0.y) * ta, az = _z0.z + (_z1.z - _z0.z) * ta;
      const by = _z0.y + (_z1.y - _z0.y) * tb, bz = _z0.z + (_z1.z - _z0.z) * tb;
      const ux = by - ay, uz = bz - az, l2 = ux * ux + uz * uz;
      let k = l2 > 1e-12 ? -(ay * ux + az * uz) / l2 : 0;
      k = k < 0 ? 0 : k > 1 ? 1 : k;
      const dy = ay + ux * k, dz = az + uz * k, d = (dy * dy + dz * dz) ** 0.5;
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
  _viol(b, t, armOn) {
    const headR = _FR[0];
    const sx = t.x - b.x, sy = t.y - b.y, sz = t.z - b.z;
    _clampAcos(sy / ((sx * sx + sy * sy + sz * sz) ** 0.5 || 1));
    const deg = Math.acos(_CL[0]);
    let viol = 0, v = 0;
    if (deg < R10.degLo) viol += R10.degLo - deg;
    if (deg > R10.degHi) viol += (deg - R10.degHi) * R10.degW;
    _VP[0] = viol;
    // the blade over the right shoulder and right of the spine (A100)
    const bh = t.y - _shR.y;
    v = viol;
    if (bh < R10.bladeLo) viol += (R10.bladeLo - bh) * 2; else if (bh > R10.bladeHi) viol += (bh - R10.bladeHi) * 2;
    const tr = -((t.x - _O.x) * _lat.x + (t.z - _O.z) * _lat.z);
    if (tr < R10.tipRight) viol += (R10.tipRight - tr) * 2;
    _VP[1] = viol - v;
    v = viol;
    const bl = (b.x - _P.x) * _latH.x + (b.z - _P.z) * _latH.z;
    if (bl < R10.buttLeft) viol += (R10.buttLeft - bl) * 2;
    _VP[10] = viol - v;
    // the midpoint on the upper back (A100's surface centre: spine_03 pushed 0.13 m back)
    const mx = (b.x + t.x) * 0.5 - _back.x, my = (b.y + t.y) * 0.5 - _back.y, mz = (b.z + t.z) * 0.5 - _back.z;
    const md = (mx * mx + my * my + mz * mz) ** 0.5;
    v = viol;
    if (md > R10.midBall) viol += (md - R10.midBall) * 3;
    _VP[2] = viol - v;
    const px = t.x - _hc.x, py = t.y - _hc.y, pz = t.z - _hc.z;
    const pf = px * _hf.x + py * _hf.y + pz * _hf.z;
    const plane = (pf > pz ? pf : pz) + R10.planeGap;
    v = viol;
    if (plane > 0) viol += plane * 3;
    _VP[3] = viol - v;
    _tmp2.x = b.x + sx * 0.45; _tmp2.y = b.y + sy * 0.45; _tmp2.z = b.z + sz * 0.45;
    ptSeg(_hc, _tmp2, t);
    const hg = _R[0] - headR;
    v = viol;
    if (hg < R10.headGap) viol += (R10.headGap - hg) * 3;
    _VP[4] = viol - v;
    v = viol;
    if (armOn) {
      segSeg(b, t, _a0, _a1);
      const g0 = _R[0];
      segSeg(b, t, _a1, _a2);
      const ag = (g0 < _R[0] ? g0 : _R[0]) - 0.05;
      if (ag < R10.armGap) viol += (R10.armGap - ag) * 3;
    }
    _VP[5] = viol - v;
    v = viol;
    if (this._camOn) {
      this._camGap(b, t);
      const cg = _RG[2];
      if (cg < R10.camGap) viol += (R10.camGap - cg) * 0.5;
    }
    _VP[6] = viol - v;
    v = viol;
    if (this._nTail > 0) {
      this._tailGap(b, t);
      const tg = _RG[1];
      if (tg < R10.tailGap) viol += (R10.tailGap - tg) * 3;
    }
    _VP[7] = viol - v;
    v = viol;
    _VP[9] = NaN;
    if (this._terr) {
      const e = this.player.model.matrixWorld.elements;
      const gg = e[1] * b.x + e[5] * b.y + e[9] * b.z + e[13] - _FR[1] - 0.05;
      if (gg < R10.groundGap) viol += (R10.groundGap - gg) * 3;
      _VP[9] = gg;
    }
    _VP[8] = viol - v;
    _RG[0] = viol;
  }

  /** Cold path (probes / gates): the last solved pose's violation, term by term. */
  debugViol() {
    const parts = {};
    _FR[0] = this._headR ?? 0.1;
    this._viol(this.butt, this.tip, !!this._armOn);
    for (let i = 0; i < _VPN.length; i++) if (_VP[i] === _VP[i]) parts[_VPN[i]] = _VP[i];
    parts.total = _RG[0];
    return parts;
  }

  /** Smallest distance from the shaft to the knot-tail / wrap-tail segments (char), less the shaft's radius: `_RG[1]`. */
  _tailGap(b, t) {
    _RG[1] = 1e9;
    const P = this._tailPts;
    for (let i = 0; i < this._nTail; i++) {
      const k = i * 6;
      _ta.x = P[k]; _ta.y = P[k + 1]; _ta.z = P[k + 2]; _tb.x = P[k + 3]; _tb.y = P[k + 4]; _tb.z = P[k + 5];
      segSeg(b, t, _ta, _tb);
      const d = _R[0] - 0.0145;
      if (d < _RG[1]) _RG[1] = d;
    }
  }

  /** Screen distance (NDC, x scaled by aspect) of the upper shaft from the head and the anchor hand: `_RG[2]`. */
  _camGap(b, t) {
    _RG[2] = 1e9;
    const e = _vp.elements, asp = this._aspect;
    for (let k = 0; k < 4; k++) {
      const f = _CAMK[k];
      const x = b.x + (t.x - b.x) * f, y = b.y + (t.y - b.y) * f, z = b.z + (t.z - b.z) * f;
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      const cz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      if (cz < -1 || cz > 1) continue;                  // behind the lens / past far
      const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w, cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      const ax = (cx - _sh.x) * asp, ay = cy - _sh.y, bx = (cx - _sa.x) * asp, by = cy - _sa.y;
      const d1 = (ax * ax + ay * ay) ** 0.5, d2 = (bx * bx + by * by) ** 0.5;
      if (d1 < _RG[2]) _RG[2] = d1;
      if (d2 < _RG[2]) _RG[2] = d2;
    }
  }

  /**
   * Write the socket so the skinned lance lands on (butt, tip): the rigid
   * motion taking the NATURAL lance (socket at identity under spine_02) to the
   * solved one, with the shortest-arc rotation (the lance is round; its roll
   * stays spine_02's).
   */
  _pose() {
    const sock = this.socket, par = sock.parent, model = this.player.model;
    par.updateWorldMatrix(true, false);
    const pe = par.matrixWorld.elements, me = model.matrixWorld.elements, Lb = this.Lb, Lt = this.Lt, b = this.butt, t = this.tip;
    // natural butt / tip, world
    const nbx = pe[0] * Lb.x + pe[4] * Lb.y + pe[8] * Lb.z + pe[12], nby = pe[1] * Lb.x + pe[5] * Lb.y + pe[9] * Lb.z + pe[13], nbz = pe[2] * Lb.x + pe[6] * Lb.y + pe[10] * Lb.z + pe[14];
    const ntx = pe[0] * Lt.x + pe[4] * Lt.y + pe[8] * Lt.z + pe[12], nty = pe[1] * Lt.x + pe[5] * Lt.y + pe[9] * Lt.z + pe[13], ntz = pe[2] * Lt.x + pe[6] * Lt.y + pe[10] * Lt.z + pe[14];
    // solved butt / tip, world
    const w0x = me[0] * b.x + me[4] * b.y + me[8] * b.z + me[12], w0y = me[1] * b.x + me[5] * b.y + me[9] * b.z + me[13], w0z = me[2] * b.x + me[6] * b.y + me[10] * b.z + me[14];
    const w1x = me[0] * t.x + me[4] * t.y + me[8] * t.z + me[12], w1y = me[1] * t.x + me[5] * t.y + me[9] * t.z + me[13], w1z = me[2] * t.x + me[6] * t.y + me[10] * t.z + me[14];
    let ax = ntx - nbx, ay = nty - nby, az = ntz - nbz;
    const al = (ax * ax + ay * ay + az * az) ** 0.5 || 1; ax /= al; ay /= al; az /= al;
    let bx = w1x - w0x, by = w1y - w0y, bz = w1z - w0z;
    const bl = (bx * bx + by * by + bz * bz) ** 0.5 || 1; bx /= bl; by /= bl; bz /= bl;
    // the shortest arc a -> b (three.js's setFromUnitVectors)
    let qx, qy, qz, qw = ax * bx + ay * by + az * bz + 1;
    if (qw < Number.EPSILON) {
      qw = 0;
      if (Math.abs(ax) > Math.abs(az)) { qx = -ay; qy = ax; qz = 0; } else { qx = 0; qy = -az; qz = ay; }
    } else { qx = ay * bz - az * by; qy = az * bx - ax * bz; qz = ax * by - ay * bx; }
    const ql = (qx * qx + qy * qy + qz * qz + qw * qw) ** 0.5 || 1;
    qx /= ql; qy /= ql; qz /= ql; qw /= ql;
    // M = T(w0) R T(-nb): the rotation (three.js's compose), then the translation that lands nb on w0
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz, xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
    const M = _MM;
    M[0] = 1 - (yy + zz); M[1] = xy + wz; M[2] = xz - wy; M[3] = 0;
    M[4] = xy - wz; M[5] = 1 - (xx + zz); M[6] = yz + wx; M[7] = 0;
    M[8] = xz + wy; M[9] = yz - wx; M[10] = 1 - (xx + yy); M[11] = 0;
    M[12] = w0x - (M[0] * nbx + M[4] * nby + M[8] * nbz);
    M[13] = w0y - (M[1] * nbx + M[5] * nby + M[9] * nbz);
    M[14] = w0z - (M[2] * nbx + M[6] * nby + M[10] * nbz);
    M[15] = 1;
    // socket world = M . par.world ; local = par^-1 . M . par
    _m4inv(_PI, pe);
    _m4mul(_T1, M, pe);
    _m4mul(_LM, _PI, _T1);
    const L = _LM;
    // decompose (three.js's Matrix4.decompose + Quaternion.setFromRotationMatrix), written in place: a rigid motion
    // conjugated by the parent has unit scale; the columns are normalised against rounding
    const sx = (L[0] * L[0] + L[1] * L[1] + L[2] * L[2]) ** 0.5 || 1, sy = (L[4] * L[4] + L[5] * L[5] + L[6] * L[6]) ** 0.5 || 1, sz = (L[8] * L[8] + L[9] * L[9] + L[10] * L[10]) ** 0.5 || 1;
    const m11 = L[0] / sx, m21 = L[1] / sx, m31 = L[2] / sx, m12 = L[4] / sy, m22 = L[5] / sy, m32 = L[6] / sy, m13 = L[8] / sz, m23 = L[9] / sz, m33 = L[10] / sz;
    const tr = m11 + m22 + m33;
    let rx, ry, rz, rw;
    if (tr > 0) { const s = 0.5 / (tr + 1) ** 0.5; rw = 0.25 / s; rx = (m32 - m23) * s; ry = (m13 - m31) * s; rz = (m21 - m12) * s; }
    else if (m11 > m22 && m11 > m33) { const s = 2 * (1 + m11 - m22 - m33) ** 0.5; rw = (m32 - m23) / s; rx = 0.25 * s; ry = (m12 + m21) / s; rz = (m13 + m31) / s; }
    else if (m22 > m33) { const s = 2 * (1 + m22 - m11 - m33) ** 0.5; rw = (m13 - m31) / s; rx = (m12 + m21) / s; ry = 0.25 * s; rz = (m23 + m32) / s; }
    else { const s = 2 * (1 + m33 - m11 - m22) ** 0.5; rw = (m21 - m12) / s; rx = (m13 + m31) / s; ry = (m23 + m32) / s; rz = 0.25 * s; }
    sock.position.x = L[12]; sock.position.y = L[13]; sock.position.z = L[14];
    // the quaternion's own fields: its change callback would re-derive the Euler `rotation` (nothing reads a bone's)
    const Q = sock.quaternion;
    Q._x = rx; Q._y = ry; Q._z = rz; Q._w = rw;
    sock.scale.x = 1; sock.scale.y = 1; sock.scale.z = 1;
    // world matrix now, not at the next render: anything that reads the
    // skinned lance this frame (the camera proxy, gates) sees the solved pose
    sock.updateMatrix();
    sock.matrixWorld.multiplyMatrices(par.matrixWorld, sock.matrix);
  }

  /**
   * FIX ROUND 1 (A-alloc-rate's 4 KB/s per function; diagnosis in docs/ROUND5-ARMORY.md §0.7). V8 compiles a
   * function called once a frame late: it runs interpreted, then in Sparkplug (where EVERY double an expression
   * makes is a fresh heap number) for its first ~400-800 calls, and in Maglev for minutes before TurboFan, so the
   * solve allocated 1.4-13 KB a frame in the measured windows whatever its source said. At the first frame the
   * animator exists, the solve runs itself `WARM_CALLS` times on her real pose, through every branch a frame can
   * take (aiming or not, the draw arm and the aim camera on and off), which is what V8 counts to optimize it; then
   * it resets, so the first real frame snaps as before. About 40 ms, once.
   */
  warm(an, cam) {
    if (this._warmed || !an?.skull) return;
    this._warmed = true;
    for (let i = 0; i < WARM_CALLS; i++) {
      const k = i & 3;
      this.update(an, k === 0 ? 0 : k === 1 ? 0.45 : 1, k >= 2, 1 / 60, k === 0 ? null : cam);
    }
    this.reset();
    this._gridAge = 8; this._lastFeas = false; this._searchAge = 0; this._armWas = false; this._camWas = false;
  }

  /** Back to the identity (the lance rides spine_02). */
  reset() {
    this.socket.position.set(0, 0, 0); this.socket.quaternion.identity(); this.socket.scale.set(1, 1, 1);
    this.out.active = false; this._freeT = Infinity; this._fpOn = false; this.sl = 0;
  }
}

export { R10 as CARRY_BOUNDS };
