/**
 * M3 area B (M3.1), wave 2: THE KITE'S CLIPS, the open (600 ms), the glide and its banks, the fold (390 ms), the landing's
 * fold (400 ms) and the forced reef (R5), as one timeline read from the FLIGHT-STATE SEAM: the state and the seconds in
 * it (`src/game/kite/flight.js` FlightBody.t), so the page, the Node bench and a staging pose the same frame from the law's
 * own clock (sim time; no wall clock, no clip asset).
 *
 * WAVE 2b: THE ROLL IS CARRIED BY HER HAND. The open: her right hand goes round her right hip (never over the shoulder,
 * never near her head) to the furled roll on its mount at the small of her back, at the survey case's lower flap, takes
 * it on its right grip, draws it off the mount and swings it round her right hip into the front of her belly, where the
 * left hand takes its left grip; both hands set it and lift it to the hang as it opens. The fold is the open backwards:
 * the bar drawn down to her belly folds the cells into the roll (the kite pitched forward, away from her face, as it
 * folds), the left hand lets go, the right carries the roll back round her hip and seats it on the mount, and lets go.
 * Nothing moves the roll but a hand: from the take to the seat the roll is placed from her solved palm (hangPose.js), and
 * with both hands on it, from both palms (`carry`, `two` below). Wave 2's roll swung on its bridle from a toggle at her
 * belt with no hand on it (the review at 9d1acc3).
 *
 * Kevin's bar, binding in every frame of every clip: never an arm or a hand behind the head; no wrist over head height; no
 * elbow over its shoulder. The take and the seat put her right hand at the small of her back, 0.4-0.5 m under her head
 * bone: behind the head's frontal plane at her waist, as the lance's and the bow's stow and unstow do (the M1.3f sweep's
 * read: a hand counts as behind the head only up at head level). `o.r.back` marks those steps for the bench.
 *
 * Everything is in her CHARACTER frame (the animator's `_charOf`: +x her left, +y up, +z forward). The kite's frame is
 * ./surveyKite.js's (the origin the bar's centre; furled, the roll lies along the bar).
 *
 * Pure: three's maths only, no scene, nothing allocated per call (the caller owns `out`).
 */
import * as THREE from 'three';
import { KITE_RECIPE } from './surveyKite.js';

/** The clips' lengths (s): the flight law's (flight.js KITE.openS, foldS, landS); the law owns them, these must agree.
 *  (wave 2b: the open 0.5 -> 0.6 s and the fold 0.35 -> 0.39 s, inside KF4's 400-600 ms and <= 400 ms: the hand's road
 *  to the mount and back is 1.4-1.8 m, and W1's wrist bar is 0.08 m a step) */
export const CLIP_S = Object.freeze({ open: 0.6, fold: 0.39, land: 0.55, reef: 0.35 });

const D2R = Math.PI / 180;
const X_AX = Object.freeze(new THREE.Vector3(1, 0, 0));

/**
 * The roll's mount on the survey case (char frame): its centre and its turn. The case lies on the bow's diagonal, 36 deg
 * from vertical, its top at her left shoulder blade (tools/build/recipes/outfit-pan-1.mjs, the survey case); furled, the
 * roll rides on it outside the stowed bow and lance (734d435), its lower end at the waist.
 */
const CASE_ANGLE = 36;
const AXIS = new THREE.Vector3(Math.cos((90 - CASE_ANGLE) * D2R), Math.sin((90 - CASE_ANGLE) * D2R), 0);
const MOUNT = Object.freeze({ c: new THREE.Vector3(0.05, 1.22, -0.36), q: new THREE.Quaternion().setFromUnitVectors(X_AX, AXIS) });
/**
 * THE MOUNT RIDES HER BACK (wave 2b). MOUNT and the road's first keys are written in her character frame as her back
 * stood when the mount was fitted to the stowed kit (734d435: the jump's air pose, the open's first step): spine_02 at
 * BACK_REF. Each step hangPose.js passes spine_02's live place (`opts.back`), and those places ride with it: standing,
 * her back is 0.09 m lower than in the air and a char-frame mount sat off it; bowed in the landing's crouch, further.
 */
export const BACK_REF = Object.freeze({ p: Object.freeze(new THREE.Vector3(-0.0299, 1.1956, 0.0217)), q: Object.freeze(new THREE.Quaternion(-0.0703, -0.1516, -0.0192, 0.9857).normalize()) });
const _bq = new THREE.Quaternion(), _bt = new THREE.Vector3(), _bqI = new THREE.Quaternion();
let _bOn = false;
/** set the back's move from BACK_REF for this call (`back` { p, q }: spine_02's live char place, or null) */
function setBack(back) {
  if (!back) { _bOn = false; return; }
  _bq.copy(back.q).multiply(_bqI.copy(BACK_REF.q).invert());
  _bt.copy(BACK_REF.p).applyQuaternion(_bq); _bt.subVectors(back.p, _bt);
  _bOn = true;
}
const _bv = new THREE.Vector3(), _bqq = new THREE.Quaternion(), _QI = new THREE.Quaternion();
/** a place (and a turn) written on her back, moved with it by share `w` */
function onBack(v, w, out, qIn = null, qOut = null) {
  if (!_bOn || w <= 0) { out.copy(v); if (qOut) qOut.copy(qIn); return out; }
  _bv.copy(v).applyQuaternion(_bq).add(_bt);
  out.copy(v).lerp(_bv, w);
  if (qOut) { _bqq.slerpQuaternions(_QI, _bq, w); qOut.multiplyQuaternions(_bqq, qIn); }
  return out;
}

/** the grips' half-spread on the roll (furled: KITE_RECIPE.grip x 0.97, src/hero/sockets.js kiteBar.furledK) */
const G0 = KITE_RECIPE.grip * 0.97;
/**
 * The right hand's socket on the furled roll while she carries it (the kite's local frame): its right grip, the palm on
 * the roll's outer surface on her right (the side away from the stowed kit and toward her right shoulder, as the hand
 * meets it on the mount), 0.06 m off the roll's axis. sockets.js `kiteBar.rollTake` is this point.
 */
export const ROLL_TAKE = Object.freeze(new THREE.Vector3(-0.19, 0.049, -0.034));
/** the right hand's grip on the roll's axis while it carries it (local x) */
const TAKE_X = ROLL_TAKE.x;

/**
 * The roll's road from the mount to the front of her belly, as the right grip's place and the roll's long axis there
 * (the open plays it forward, the fold backwards). The roll's right grip leads; its long part trails: up and back off the
 * mount, back past her right hip, out and round it, then forward across her belly. Every key is inside her right arm's
 * reach (Node: the palm reaches each within 0.01 m) and clear of her trunk, her right thigh and the stowed kit.
 */
const ROAD_P = [
  MOUNT.c.clone().addScaledVector(AXIS, TAKE_X),     // on the mount: the take
  new THREE.Vector3(-0.36, 1.13, -0.34),             // off the mount, behind the quiver (her elbow over its mouth)
  new THREE.Vector3(-0.50, 1.05, -0.10),             // out past it, beside her right hip, wide (the roll's short end clear of her)
  new THREE.Vector3(-0.49, 1.03, 0.16),              // swung round her hip, out and forward
  new THREE.Vector3(-0.30, 1.06, 0.38),              // in front of it: the set (the left hand takes the roll's left grip)
];
/** the roll's long part (its +x) along the road, at the road's own parameter (the keys at 0, 0.25 .. 1): up and out off
 *  the mount, trailing back past her hip, swung out and round it (never in toward her), then across her belly. The first
 *  keys are written on her back as it stood at BACK_REF and ride it (`onBack`); the set is in her frame. */
const ROAD_D = [
  [0, AXIS.clone()],
  [0.25, new THREE.Vector3(0.15, 0.6, -0.78).normalize()],
  [0.5, new THREE.Vector3(-0.35, 0.3, -0.89).normalize()],
  [0.75, new THREE.Vector3(-0.55, 0.15, 0.82).normalize()],
  [1, new THREE.Vector3(1, 0, 0)],
];
const ROAD = new THREE.CatmullRomCurve3(ROAD_P, false, 'centripetal');
ROAD.arcLengthDivisions = 400;
ROAD.updateArcLengths();
/** the roll's turn with its long part along `d` and its local y as near her up as it can be (so the turn is continuous
 *  along the road and the carry socket stays on the same side of the roll; MOUNT.q and the set's identity are of it) */
const _ry = new THREE.Vector3(), _rz = new THREE.Vector3(), _rm = new THREE.Matrix4();
function turnAlong(d, out) {
  _ry.set(0, 1, 0).addScaledVector(d, -d.y).normalize();
  _rz.crossVectors(d, _ry);
  return out.setFromRotationMatrix(_rm.makeBasis(d, _ry, _rz));
}
const _rd = new THREE.Vector3();
/** the roll's centre at the set and its left grip there */
const SET_C = ROAD_P[ROAD_P.length - 1].clone().addScaledVector(X_AX, -TAKE_X);
const SET_L = SET_C.clone().addScaledVector(X_AX, G0);
/** the right hand's way round her right hip, from the front to the back and back (a control point the road passes) */
const HIP_R = Object.freeze(new THREE.Vector3(-0.48, 1.05, -0.10));
/** the right hand's way down from where the open finds it (in front of her head, often out and high from the jump):
 *  down in front of her right hip first, then round it (never behind her within 0.30 m of her head's height) */
const DOWN_R = Object.freeze(new THREE.Vector3(-0.44, 1.10, 0.20));
/**
 * THE FRONT KEYS FOLLOW HER CHEST DOWN (wave 2b, the page's film at 857a2c7): the set, the way down in front of her hip
 * and the road's front part are written for her chest as it stands upright (the hang's bar, solved from her chest, at or
 * over BAR_Y). Tucked in the air or bowed, her chest is lower and they come down with it (`_front`): in the page's tucked
 * fall the set sat under her chin. And the way down keeps in front of her head and 0.36 m under it (`opts.head`).
 */
const BAR_Y = 1.355;
const _front = new THREE.Vector3(), _set = new THREE.Vector3(), _setL = new THREE.Vector3(), _down = new THREE.Vector3(), _readyL = new THREE.Vector3();
function setFront(bar, head) {
  _front.set(0, Math.min(0, bar.y - BAR_Y), 0);
  _set.copy(SET_C).add(_front); _setL.copy(SET_L).add(_front);
  _down.copy(DOWN_R).add(_front); _readyL.copy(READY_L).add(_front);
  if (head) { _down.y = Math.min(_down.y, head.y - 0.36); _down.z = Math.max(_down.z, head.z + 0.08); }
}
/** a uniform Catmull-Rom through the points of `P` (its first and last doubled: P[0] === P[1], P[n+1] === P[n+2]) */
const _cr = [null, null, null, null, null, null, null];
function crWay(P, n, u, out) {
  const f = Math.min(n - 1e-9, Math.max(0, u * n)), i = Math.floor(f), t = f - i;
  const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3], t2 = t * t, t3 = t2 * t;
  const k = (q0, q1, q2, q3) => 0.5 * (2 * q1 + (-q0 + q2) * t + (2 * q0 - 5 * q1 + 4 * q2 - q3) * t2 + (-q0 + 3 * q1 - 3 * q2 + q3) * t3);
  return out.set(k(p0.x, p1.x, p2.x, p3.x), k(p0.y, p1.y, p2.y, p3.y), k(p0.z, p1.z, p2.z, p3.z));
}
const _hp = new THREE.Vector3(), _hq = new THREE.Vector3();
/** the left hand's ready place, low in front of her belly (it never rides the air clip's arms up behind her head: it is
 *  held in front from the open's first step to the fold's last) */
export const READY_L = Object.freeze(new THREE.Vector3(0.14, 1.04, 0.33));
export const POLE_READY_L = Object.freeze(new THREE.Vector3(0.7, -0.6, -0.3));
/** the right hand's, its mirror (hands free after the fold, while she falls: hangPose.js AFTER) */
export const READY_R = Object.freeze(new THREE.Vector3(-0.14, 1.04, 0.33));
export const POLE_READY_R = Object.freeze(new THREE.Vector3(-0.7, -0.6, -0.3));
/** the right arm's pole on the back reach: the elbow out to her right and back (it never lifts over the shoulder) */
const POLE_BACK_R = Object.freeze(new THREE.Vector3(-0.85, -0.25, -0.45));
/** the right hand's way round from wherever the after-layer finds it behind her to the front (hangPose.js AFTER) */
export const AFTER_VIA_R = Object.freeze(new THREE.Vector3(-0.44, 1.08, -0.02));

/** The open's beats (share of the open). */
const OPEN = Object.freeze({ take: 0.33, grip: 0.36, set: 0.82, lift: 1 });
/** The fold's beats (share of the fold): the bar down to the belly (cells folded) by `down`, the left lets go by
 *  `free`, the roll carried from `carry` and seated on the mount at `seat`; the right hand lets go after it. */
const FOLD = Object.freeze({ seat: 0.9 });
/** the landing's (0.55 s): the bar comes down through the touchdown, she holds the roll across her belly through the
 *  crouch and carries it back once she rises (bowed in the crouch, the reach to the small of her back lifted her elbow
 *  over her shoulder) */
const LAND = Object.freeze({ down: 0.2, free: 0.42, carry: 0.44, seat: 0.92 });
/** rad: the kite pitched forward about its bar as it folds and opens over her hands, so the cells fold down in front of
 *  her and never through the column in front of her face (the review at 9d1acc3: the half-furled frame crossed it at
 *  0.30 of the fold) */
const PITCH = 85 * D2R;

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** a trapezoid's ease: even speed but for `a` of the time at each end (the peak is 1 / (1 - a) of the mean: W1's wrist bar) */
function trap(x, a = 0.15) {
  x = Math.min(1, Math.max(0, x));
  const v = 1 / (1 - a);
  if (x < a) return 0.5 * v * x * x / a;
  if (x > 1 - a) return 1 - 0.5 * v * (1 - x) * (1 - x) / a;
  return v * (x - a / 2);
}
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _qp = new THREE.Quaternion();

/** the roll on its road at `u` (0 the mount, 1 the set): its centre and turn, and the right grip's axis point */
function roadAt(u, outC, outQ, outG) {
  u = Math.min(1, Math.max(0, u));
  const t = ROAD.getUtoTmapping(u);
  ROAD.getPoint(t, outG);
  let i = 0; while (i < ROAD_D.length - 2 && t > ROAD_D[i + 1][0]) i++;
  const k = ss(ROAD_D[i][0], ROAD_D[i + 1][0], t);
  // (the long part turns on the great circle between the keys; wave 2b: slerping whole turns made from the shortest arc
  //  off +x swung it through her hip at 0.6-0.7 of the road)
  const a = ROAD_D[i][1], c = ROAD_D[i + 1][1], om = Math.acos(Math.min(1, Math.max(-1, a.dot(c))));
  if (om < 1e-4) _rd.copy(a); else _rd.copy(a).multiplyScalar(Math.sin((1 - k) * om) / Math.sin(om)).addScaledVector(c, Math.sin(k * om) / Math.sin(om));
  turnAlong(_rd.normalize(), outQ);
  // (the road's first part rides her back with the mount; the set in front of her is the hang's, in her frame)
  const wb = 1 - ss(0.35, 0.85, t);
  onBack(outG, wb, outG, outQ, outQ);
  outG.addScaledVector(_front, 1 - wb);
  outC.copy(outG).addScaledVector(_w.set(-TAKE_X, 0, 0).applyQuaternion(outQ), 1);
}
/** the right palm's road length (m), for timing the fold as one even run */
const ROAD_LEN = (() => {
  const c = new THREE.Vector3(), q = new THREE.Quaternion(), g = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  let L = 0;
  for (let i = 0; i <= 200; i++) { roadAt(i / 200, c, q, g); b.copy(ROLL_TAKE).applyQuaternion(q).add(c); if (i) L += b.distanceTo(a); a.copy(b); }
  return L;
})();
/** a quadratic way from `a` to `b` through `via` at its middle (u 0..1) */
function viaWay(a, via, b, u, out) {
  const cx = 2 * via.x - (a.x + b.x) / 2, cy = 2 * via.y - (a.y + b.y) / 2, cz = 2 * via.z - (a.z + b.z) / 2, m = 1 - u;
  return out.set(m * m * a.x + 2 * u * m * cx + u * u * b.x, m * m * a.y + 2 * u * m * cy + u * u * b.y, m * m * a.z + 2 * u * m * cz + u * u * b.z);
}
export { viaWay };

/**
 * @typedef {object} KiteHand
 * @property {number} w IK weight
 * @property {THREE.Vector3} goal the PALM's goal (char frame)
 * @property {THREE.Vector3} pole
 * @property {number} curl
 * @property {THREE.Vector3} start where the open found the wrist, brought in front of her head (the caller sets it)
 * @property {boolean} hasStart
 * @property {'bar' | 'roll' | null} hold what the hand holds this step (null: free)
 * @property {THREE.Vector3} loc its socket in the kite's local frame while it holds
 * @property {boolean} back the hand is on the back reach (the take or the seat at the small of her back)
 */
/**
 * @typedef {object} KitePose
 * @property {number} furl       0 the roll .. 1 open (surveyKite.js setFurl)
 * @property {THREE.Vector3} pos the kite's origin (the bar's centre), char frame: the PLAN, before her palms place it
 * @property {THREE.Quaternion} quat the kite's turn, char frame (the plan)
 * @property {KiteHand} l @property {KiteHand} r
 * @property {number} carry      0..1: how far the kite is placed from her palms (hangPose.js) rather than the plan
 * @property {number} two        0..1: of that, from both palms (else from the right alone)
 * @property {number} body       the hang's own body (legs bent, chest squared to the bar), 0..1
 * @property {string} clip       'open' | 'glide' | 'fold' | 'land' | 'reef' | 'stowed'
 * @property {number} phase      0..1 in that clip
 */
export function createKitePose() {
  const hand = () => ({ w: 0, goal: new THREE.Vector3(), pole: new THREE.Vector3(), curl: 0, start: new THREE.Vector3(), hasStart: false, hold: null, loc: new THREE.Vector3(), back: false });
  return { furl: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), l: hand(), r: hand(), carry: 0, two: 0, body: 0, clip: 'stowed', phase: 0 };
}

/** The grip of side `sx` (+1 left, -1 right) on the kite at its pose, char frame. @param {KitePose} o */
function gripOf(o, sx, out) {
  const g = KITE_RECIPE.grip * (0.97 + 0.03 * o.furl);
  return out.set(sx * g, 0, 0).applyQuaternion(o.quat).add(o.pos);
}
/** a local point of the kite at its pose, char frame */
function localAt(o, loc, out) { return out.copy(loc).applyQuaternion(o.quat).add(o.pos); }
const POLE_BAR_L = new THREE.Vector3(0.65, -0.75, -0.1), POLE_BAR_R = new THREE.Vector3(-0.65, -0.75, -0.1);
const POLE_LOW_R = new THREE.Vector3(-0.8, -0.4, 0.1);
/** the bar's socket of side sx (local), the furl's share of the span */
const barLoc = (o, sx, out) => out.set(sx * KITE_RECIPE.grip * (0.97 + 0.03 * o.furl), 0, 0);

/**
 * The pose of the kite and her hands at a point of a clip.
 * @param {'none' | 'opening' | 'gliding' | 'folding' | 'landing'} state the flight state
 * @param {number} t s in it (FlightBody.t)
 * @param {{ bank?: number, forced?: boolean }} opts the bar's bank (-1 left .. 1 right); a forced fold (R5: the reef)
 * @param {THREE.Vector3} bar the hang's bar centre this frame (char frame; hangPose.js solves it from her chest)
 * @param {KitePose} o out
 * @returns {KitePose}
 */
export function kiteClipPose(state, t, { bank = 0, forced = false, back = null, furl0 = 1, drop0 = 0, head = null } = {}, bar, o) {
  setBack(back); setFront(bar, head);
  const L = o.l, R = o.r;
  L.pole.copy(POLE_BAR_L); R.pole.copy(POLE_BAR_R); L.curl = 1; R.curl = 1;
  L.hold = null; R.hold = null; L.back = false; R.back = false;
  o.carry = 0; o.two = 0; barLoc(o, 1, L.loc); barLoc(o, -1, R.loc);
  if (state === 'none') {
    o.clip = 'stowed'; o.phase = 0; o.furl = 0; onBack(MOUNT.c, 1, o.pos, MOUNT.q, o.quat); L.w = 0; R.w = 0; o.body = 0; L.curl = 0; R.curl = 0;
    return o;
  }
  if (state === 'gliding' || (state === 'folding' && forced)) {
    // the hang; banked, the bar rolls with the kite (right side down to turn right) and slides a little to the left of
    // her as her weight goes right; reefed (R5), the cells drawn flat and the bar a hand lower, hands on it
    const reef = state === 'folding' ? ss(0, CLIP_S.reef, t) : 0;
    o.clip = reef > 0 ? 'reef' : 'glide'; o.phase = state === 'folding' ? Math.min(1, t / CLIP_S.reef) : 0;
    const b = Math.max(-1, Math.min(1, bank)) * (1 - reef);
    o.furl = 1 - 0.65 * reef;
    o.pos.copy(bar); o.pos.x += 0.05 * b; o.pos.y -= 0.05 * reef;
    o.quat.setFromAxisAngle(_v.set(0, 0, 1), 0.2 * b);
    gripOf(o, 1, L.goal); gripOf(o, -1, R.goal); L.w = 1; R.w = 1; o.body = 1;
    L.hold = 'bar'; R.hold = 'bar'; barLoc(o, 1, L.loc); barLoc(o, -1, R.loc);
    o.carry = 1; o.two = 1;
    return o;
  }
  if (state === 'opening') {
    const s = Math.min(1, Math.max(0, t / CLIP_S.open));
    o.clip = 'open'; o.phase = s;
    // the kite: on its mount until the hand has it; carried on its road round her hip; set across her belly; lifted to
    // the hang as the cells fill, pitched forward over her hands and up to the hang by the open's end
    if (s < OPEN.grip) { onBack(MOUNT.c, 1, o.pos, MOUNT.q, o.quat); o.furl = 0; }
    else if (s < OPEN.set) { roadAt(trap((s - OPEN.grip) / (OPEN.set - OPEN.grip), 0.12), o.pos, o.quat, _p); o.furl = 0; }
    else {
      const u = trap((s - OPEN.set) / (1 - OPEN.set), 0.15);
      o.pos.copy(_set).lerp(bar, u);
      o.quat.setFromAxisAngle(X_AX, PITCH * ss(OPEN.set, OPEN.set + 0.04, s) * (1 - ss(OPEN.set + 0.08, 1, s)));
      o.furl = ss(OPEN.set, 0.95, s);
    }
    // the right hand: round her right hip to the take on the mount (from where the open found it: `start`), closes on
    // the roll, carries it (its socket on the roll: ROLL_TAKE), and settles on the bar's right grip as both hands set it
    R.w = R.hasStart ? 1 : ss(0, 0.1, s);
    if (s < OPEN.take) {
      localAt(o, ROLL_TAKE, _w);
      // (down in front of her hip, round it wide, behind the quiver, to the take)
      _cr[0] = _cr[1] = R.hasStart ? R.start : READY_R; _cr[2] = _down; _cr[3] = onBack(HIP_R, 0.7, _hp); _cr[4] = onBack(ROAD_P[1], 1, _hq); _cr[5] = _cr[6] = _w;
      crWay(_cr, 4, trap(s / OPEN.take, 0.12), R.goal);
      R.pole.copy(POLE_LOW_R).lerp(POLE_BACK_R, ss(0.3 * OPEN.take, OPEN.take, s));
      R.curl = 0.25 + 0.2 * ss(0.6 * OPEN.take, OPEN.take, s);
      R.back = R.goal.z < -0.05;
    } else if (s < OPEN.set) {
      localAt(o, ROLL_TAKE, R.goal);
      R.pole.copy(POLE_BACK_R).lerp(POLE_LOW_R, ss(OPEN.grip, 0.6, s)).lerp(POLE_BAR_R, ss(0.6, OPEN.set, s));
      R.curl = 0.45 + 0.55 * ss(OPEN.take, OPEN.grip, s);
      R.hold = s >= OPEN.grip ? 'roll' : null; R.loc.copy(ROLL_TAKE);
      R.back = R.goal.z < -0.05;
    } else {
      // (onto the bar's grip as it opens: the palm from the roll's surface to the grip's centreline)
      const k = ss(OPEN.set, OPEN.set + 0.08, s);
      barLoc(o, -1, _v); R.loc.copy(ROLL_TAKE).lerp(_v, k);
      localAt(o, R.loc, R.goal); R.pole.copy(POLE_BAR_R); R.curl = 1; R.hold = k >= 1 ? 'bar' : 'roll';
    }
    // the left hand: held ready low in front of her belly from the first step, then to the roll's left grip where it
    // arrives across her belly, and with it to the hang
    if (s < OPEN.set) {
      L.goal.copy(_readyL); if (L.hasStart) L.goal.copy(L.start).lerp(_readyL, ss(0, 0.3, s));
      L.goal.lerp(_setL, ss(0.55, OPEN.set, s));
      L.pole.copy(POLE_READY_L).lerp(POLE_BAR_L, ss(0.55, OPEN.set, s));
      L.curl = s < OPEN.set - 0.03 ? 0.3 : 1;
    } else { barLoc(o, 1, L.loc); localAt(o, L.loc, L.goal); L.curl = 1; }
    L.w = L.hasStart ? 1 : ss(0, 0.1, s);
    // placed from her palms: the right's from the grip (closing on it over the take), both once the left has it
    o.carry = ss(OPEN.take, OPEN.grip, s); o.two = ss(OPEN.set - 0.03, OPEN.set + 0.01, s);
    if (o.two >= 1) L.hold = 'bar';
    o.body = ss(OPEN.set, 1, s);
    return o;
  }
  // the fold (hands free at its end) and the landing's fold: the open's road backwards
  const land = state === 'landing', len = land ? CLIP_S.land : CLIP_S.fold, B = land ? LAND : FOLD;
  const s = Math.min(1, Math.max(0, t / len));
  o.clip = land ? 'land' : 'fold'; o.phase = s;
  // the right hand's progress: the bar's way down to her belly (u, 0..1), then the road back to the mount (ur, 0..1).
  // The fold times both as ONE even run (a trapezoid over the whole way, W1's wrist bar: 1.4-1.5 m in 21 steps); the
  // landing holds the roll across her belly through the crouch and runs the road once she rises.
  let u, ur;
  if (!land) {
    const Ld = _p.subVectors(bar, _set).length(), x = trap(s / B.seat, 0.1), split = Ld / (Ld + ROAD_LEN);
    u = Math.min(1, x / split); ur = x <= split ? 0 : (x - split) / (1 - split);
  } else {
    u = trap(s / B.down, 0.25); ur = s <= B.carry ? 0 : trap((s - B.carry) / (B.seat - B.carry), 0.12);
  }
  if (ur <= 0) {
    // the bar drawn down to her belly; the cells fold into the roll round it, the kite pitched forward over her hands
    const b = Math.max(-1, Math.min(1, bank)) * (1 - u);
    o.pos.copy(bar); o.pos.y -= drop0; o.pos.lerp(_set, u); o.pos.x += 0.05 * b;
    // (the glide's bank goes out of the bar as it comes down: the fold starts from the glide's own pose, no cross-fade)
    // (pitched first, then furled: the cells, still tall, sweep down in front 1.3 m and more off her face and fold
    //  flat out there; furled first, they came down through the column in front of her face)
    o.quat.setFromAxisAngle(_v.set(0, 0, 1), 0.2 * b).multiply(_qp.setFromAxisAngle(X_AX, PITCH * ss(0, 0.35, u)));
    o.furl = furl0 * (1 - ss(0.2, 0.95, u));
  } else if (s < B.seat) {
    roadAt(1 - ur, o.pos, o.quat, _p); o.furl = 0;
    // (the pitch the fold left on the roll unwinds about its own axis as the road turns it: a roll is round)
    _qp.setFromAxisAngle(X_AX, PITCH * (1 - ss(0, 0.2, ur))); o.quat.multiply(_qp);
  } else { onBack(MOUNT.c, 1, o.pos, MOUNT.q, o.quat); o.furl = 0; }
  // (landing, she holds the roll out from her body while her trunk bows in the crouch, until it goes round her hip)
  if (land) o.pos.z += 0.1 * u * (1 - ss(0, 0.2, ur));
  // the right hand: on the bar's grip, then its palm onto the roll's surface (the roll's socket) as the cells close, and
  // with the roll back round her hip to the mount; it lets go there (the after-layer brings it round to the front)
  if (s < B.seat) {
    const k = ur > 0 ? 1 : ss(0.75, 1, u);
    barLoc(o, -1, _v); R.loc.copy(_v).lerp(ROLL_TAKE, k);
    localAt(o, R.loc, R.goal); R.hold = k <= 0 ? 'bar' : 'roll'; R.curl = 1;
    R.pole.copy(POLE_BAR_R).lerp(POLE_LOW_R, ss(0, 0.3, ur)).lerp(POLE_BACK_R, ss(0.4, 1, ur));
  } else {
    localAt(o, ROLL_TAKE, R.goal); R.pole.copy(POLE_BACK_R); R.curl = 1 - 0.6 * ss(B.seat, 1, s); R.hold = 'roll';
  }
  R.w = 1; R.back = R.goal.z < -0.05;
  // the left hand: on the bar's grip until the roll is across her belly, then off to its ready place
  const lf = land ? ss(B.free - 0.04, B.free + 0.02, s) : ss(0, 0.1, ur);
  if (lf < 1) { barLoc(o, 1, L.loc); localAt(o, L.loc, L.goal); L.hold = lf <= 0 ? 'bar' : null; L.curl = 1; L.pole.copy(POLE_BAR_L); }
  else {
    barLoc(o, 1, _v); localAt(o, _v, _p);
    const ul = land ? ss(B.free + 0.02, B.free + 0.3, s) : ss(0.1, 0.45, ur);
    L.goal.copy(_p).lerp(_readyL, ul); L.pole.copy(POLE_BAR_L).lerp(POLE_READY_L, ul); L.curl = 0.3 + 0.7 * (1 - ul);
  }
  // (held at full weight to the fold's last step; hangPose.js's after-layer hands each arm back to her own pose)
  L.w = 1;
  // (the roll rides her palm to the fold's last step: the hand has seated it on the mount by then, and lets go)
  o.carry = 1 - ss(B.seat + 0.06, 1, s);
  if (o.carry < 1) R.hold = null;
  o.two = 1 - lf;
  o.body = 1 - ss(0.05, 0.45, s);
  return o;
}

/** the furled roll's mount on the survey case (char frame), for a staging or a bench that shows it stowed */
export const ROLL_MOUNT = MOUNT;
/** the open's and the fold's beats, for the bench and the film (shares of each clip) */
export const KITE_BEATS = Object.freeze({ open: OPEN, fold: FOLD, land: LAND });
