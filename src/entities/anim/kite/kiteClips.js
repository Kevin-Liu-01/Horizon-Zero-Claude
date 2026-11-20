/**
 * M3 area B (M3.1), wave 2: THE KITE'S CLIPS, the open (500 ms), the glide and its banks, the fold (350 ms), the landing's
 * fold (400 ms) and the forced reef (R5), as one timeline read from the FLIGHT-STATE SEAM: the state and the seconds in
 * it (`src/game/kite/flight.js` FlightBody.t), so the page, the Node bench and a staging pose the same frame from the law's
 * own clock (sim time; no wall clock, no clip asset).
 *
 * Kevin's bar, binding in every frame of every clip: both wrists in front of the head's frontal plane and at or below
 * head height; never an arm or a hand behind the head; elbows below their shoulders on the bar (KF1). So the roll is
 * never reached for on the back: it is RELEASED. Her right hand pulls the case's toggle at the front of her belt, the
 * furled roll drops out of the case's lower flap at the waist (BIBLE §5.2) and swings round her right hip on its
 * bridle into her two hands in front of her belly, and the kite opens up out of her hands as she lifts the bar to the
 * hang. The fold is the same backwards: the bar drawn down to the belly folds the cells into the roll round it, the left
 * hand lets go, the right hand swings the roll back by her right hip and the case's spring flap takes it at the waist;
 * hands free at 350 ms.
 *
 * Everything is in her CHARACTER frame (the animator's `_charOf`: +x her left, +y up, +z forward). The kite's frame is
 * ./surveyKite.js's (the origin the bar's centre; furled, the roll lies along the bar).
 *
 * Pure: three's maths only, no scene, nothing allocated per call (the caller owns `out`).
 */
import * as THREE from 'three';
import { KITE_RECIPE } from './surveyKite.js';

/** The clips' lengths (s): the flight law's (flight.js KITE.openS, foldS, landS); the law owns them, these must agree. */
export const CLIP_S = Object.freeze({ open: 0.5, fold: 0.35, land: 0.4, reef: 0.35 });

const D2R = Math.PI / 180;
const qz = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), deg * D2R);

/**
 * The roll's road from the case to her hands (char frame): the place of its centre and its turn at each key, by the
 * share of the open. The case lies on the bow's diagonal, 36 deg from vertical, its top at her left shoulder blade
 * (tools/build/recipes/outfit-pan-1.mjs, the survey case); furled, the roll rides on it, its lower end at the waist.
 */
const CASE_ANGLE = 36;                               // deg from vertical; the roll's axis is 90 - 36 = 54 deg off her x
const MOUNT = Object.freeze({ c: new THREE.Vector3(0.05, 1.22, -0.36), q: qz(90 - CASE_ANGLE) });
const AXIS = new THREE.Vector3(Math.cos((90 - CASE_ANGLE) * D2R), Math.sin((90 - CASE_ANGLE) * D2R), 0);
/** the keys of the open: [share of the open, centre, turn] (the fold plays them backwards) */
const ROLL_KEYS = Object.freeze([
  [0.10, MOUNT.c, MOUNT.q],                                                   // on the case
  [0.24, MOUNT.c.clone().addScaledVector(AXIS, -0.30).setZ(-0.41), MOUNT.q],  // slid down out of the lower flap
  [0.34, new THREE.Vector3(-0.47, 0.88, -0.26), qz(80)],                      // swung out past her right hip, behind
  [0.44, new THREE.Vector3(-0.45, 0.88, 0.28), qz(90)],                       // at her right hip, in front, hanging
  [0.55, new THREE.Vector3(0.0, 1.03, 0.43), qz(0)],                          // across in front of her belly: hands on
]);
/** the case's toggle at the front of her belt, right of the buckle (her right hand pulls it; it shuts the flap) */
export const TOGGLE = Object.freeze(new THREE.Vector3(-0.13, 1.0, 0.27));

/** the left hand's ready place, low in front of her belly, while the right pulls the toggle (it never rides the air
 *  clip's arms up behind her head: it is held in front from the open's first step to the fold's last) */
export const READY_L = Object.freeze(new THREE.Vector3(0.14, 1.04, 0.33));
const POLE_READY_L = new THREE.Vector3(0.7, -0.6, -0.3);

/** the share of the open at which the hands hold the roll (the last key) */
const GRAB = ROLL_KEYS[ROLL_KEYS.length - 1][0];

/** the share of the fold at which the right hand lets the roll go (the roll is at her right hip, in front: the open's
 *  key 0.44) */
const RIDE_FOLD = 0.52;
const _ride = new THREE.Vector3();
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

/** the roll on its road at share `s` of the open (s <= GRAB) */
function rollAt(s, outP, outQ) {
  const K = ROLL_KEYS;
  if (s <= K[0][0]) { outP.copy(K[0][1]); outQ.copy(K[0][2]); return; }
  for (let i = 1; i < K.length; i++) {
    if (s <= K[i][0]) {
      const a = K[i - 1], b = K[i], u = ss(a[0], b[0], s);
      outP.copy(a[1]).lerp(b[1], u); outQ.copy(a[2]).slerp(b[2], u); return;
    }
  }
  outP.copy(K[K.length - 1][1]); outQ.copy(K[K.length - 1][2]);
}

/**
 * @typedef {object} KitePose
 * @property {number} furl       0 the roll .. 1 open (surveyKite.js setFurl)
 * @property {THREE.Vector3} pos the kite's origin (the bar's centre), char frame
 * @property {THREE.Quaternion} quat the kite's turn, char frame
 * @property {{ w: number, goal: THREE.Vector3, pole: THREE.Vector3, curl: number, start: THREE.Vector3, hasStart: boolean }} l
 *   the left hand's IK (`start`: where the open found the wrist, brought in front of her head; the caller sets it)
 * @property {{ w: number, goal: THREE.Vector3, pole: THREE.Vector3, curl: number }} r the right hand's IK
 * @property {number} body       the hang's own body (legs bent, chest squared to the bar), 0..1
 * @property {string} clip       which clip and where: 'open' | 'glide' | 'fold' | 'land' | 'reef' | 'stowed'
 * @property {number} phase      0..1 in that clip
 */
export function createKitePose() {
  const hand = () => ({ w: 0, goal: new THREE.Vector3(), pole: new THREE.Vector3(), curl: 0, start: new THREE.Vector3(), hasStart: false });
  return { furl: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), l: hand(), r: hand(), body: 0, clip: 'stowed', phase: 0 };
}

/** The grip of side `sx` (+1 left, -1 right) on the kite at its pose, char frame. @param {KitePose} o */
function gripOf(o, sx, out) {
  const g = KITE_RECIPE.grip * (0.97 + 0.03 * o.furl);
  return out.set(sx * g, 0, 0).applyQuaternion(o.quat).add(o.pos);
}
const POLE_BAR_L = new THREE.Vector3(0.65, -0.75, -0.1), POLE_BAR_R = new THREE.Vector3(-0.65, -0.75, -0.1);
const POLE_LOW_R = new THREE.Vector3(-0.7, -0.35, -0.55);

/**
 * The pose of the kite and her hands at a point of a clip.
 * @param {'none' | 'opening' | 'gliding' | 'folding' | 'landing'} state the flight state
 * @param {number} t s in it (FlightBody.t)
 * @param {{ bank?: number, forced?: boolean }} opts the bar's bank (-1 left .. 1 right); a forced fold (R5: the reef)
 * @param {THREE.Vector3} bar the hang's bar centre this frame (char frame; hangPose.js solves it from her chest)
 * @param {KitePose} o out
 * @returns {KitePose}
 */
export function kiteClipPose(state, t, { bank = 0, forced = false } = {}, bar, o) {
  const L = o.l, R = o.r;
  L.pole.copy(POLE_BAR_L); R.pole.copy(POLE_BAR_R); L.curl = 1; R.curl = 1;
  if (state === 'none') {
    o.clip = 'stowed'; o.phase = 0; o.furl = 0; o.pos.copy(MOUNT.c); o.quat.copy(MOUNT.q); L.w = 0; R.w = 0; o.body = 0; L.curl = 0; R.curl = 0;
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
    return o;
  }
  if (state === 'opening') {
    const s = Math.min(1, Math.max(0, t / CLIP_S.open));
    o.clip = 'open'; o.phase = s;
    if (s < GRAB) { rollAt(s, o.pos, o.quat); o.furl = 0; }
    else {
      // out of her hands: the cells fill as the bar rises from her belly to the hang
      const u = ss(GRAB, 1, s);
      o.pos.copy(ROLL_KEYS[ROLL_KEYS.length - 1][1]).lerp(bar, u); o.quat.identity();
      o.furl = ss(GRAB, 0.95, s);
    }
    // the right hand: to the toggle (from where the open found it, brought in front of her head: `start`), then down to
    // the roll as it comes round her hip, then the bar's right grip
    R.w = R.hasStart ? 1 : ss(0, 0.12, s);
    if (s < 0.36) { R.goal.copy(TOGGLE); if (R.hasStart) R.goal.copy(R.start).lerp(TOGGLE, ss(0, 0.14, s)); R.pole.copy(POLE_LOW_R); }
    else {
      gripOf(o, -1, _p); const u = ss(0.36, GRAB, s);
      R.goal.copy(TOGGLE).lerp(_p, u); R.pole.copy(POLE_LOW_R).lerp(POLE_BAR_R, u);
    }
    R.curl = s < 0.12 ? s / 0.12 : s < 0.36 ? 1 : s < GRAB - 0.05 ? 0.4 : 1;
    // the left hand: held ready low in front of her belly from the first step, then in to the roll's left end as it
    // arrives across her belly
    { gripOf(o, 1, _p); const u = ss(0.3, GRAB, s); L.goal.copy(READY_L); if (L.hasStart) L.goal.copy(L.start).lerp(READY_L, ss(0, 0.14, s));
      L.goal.lerp(_p, u); L.pole.copy(POLE_READY_L).lerp(POLE_BAR_L, u); }
    L.w = L.hasStart ? 1 : ss(0, 0.12, s); L.curl = s < GRAB - 0.03 ? 0.3 : 1;
    o.body = ss(0.35, 1, s);
    return o;
  }
  // the fold (hands free at its end) and the landing's fold: the open's road backwards
  const len = state === 'landing' ? CLIP_S.land : CLIP_S.fold;
  const s = Math.min(1, Math.max(0, t / len));
  o.clip = state === 'landing' ? 'land' : 'fold'; o.phase = s;
  // the open's share this point of the fold plays: bar to belly by 0.4 (the cells folded round it), the roll back round
  // her hip by 0.75, into the flap by 1
  // (the landing's fold holds the roll across her belly through the landing's crouch, to 0.62, and swings it back after:
  //  swung by her hip while she crouches, the roll's top end came within 0.10 m of her bowed head in the bench)
  const land = state === 'landing', hold = land ? 0.62 : 0.4, RIDE_TO = land ? 0.7 : RIDE_FOLD;
  const back = s < 0.4 ? 1 - (1 - GRAB) * ss(0, 0.4, s) : GRAB * (1 - ss(hold, 1, s));
  if (back >= GRAB) {
    const u = (back - GRAB) / (1 - GRAB);
    o.pos.copy(ROLL_KEYS[ROLL_KEYS.length - 1][1]).lerp(bar, u); o.quat.identity(); o.furl = u;
  } else { rollAt(back, o.pos, o.quat); o.furl = 0; }
  // (landing, she holds the roll out from her body while her trunk bows in the crouch: 0.12 m further forward until it
  //  swings behind her hip)
  if (land) o.pos.z += 0.12 * (1 - ss(0.74, 0.9, s));
  // the left hand lets go of the bar to its ready place in front of her belly, and is freed at the fold's end
  { gripOf(o, 1, _p); const u = ss(hold, hold + 0.22, s); L.goal.copy(_p).lerp(READY_L, u); L.pole.copy(POLE_BAR_L).lerp(POLE_READY_L, u); }
  L.w = 1 - ss(0.85, 1, s); L.curl = s < hold + 0.05 ? 1 : 0.3;
  // the right hand rides the roll round her hip, then lets it go to the flap and comes off by the toggle
  gripOf(o, -1, _p);
  if (s < Math.min(0.72, RIDE_TO)) { R.goal.copy(_p); R.w = 1; R.pole.copy(POLE_BAR_R).lerp(POLE_LOW_R, ss(0.4, 0.72, s)); }
  else { const u = ss(0.72, 0.86, s); R.goal.copy(_p).lerp(TOGGLE, u); R.w = 1 - ss(0.86, 1, s); R.pole.copy(POLE_LOW_R); }
  R.curl = s < 0.72 ? 1 : 0.5;
  if (RIDE_TO < 0.72 && s >= RIDE_TO) {
    // (the hand lets the roll go at her right hip, in front, before it swings behind her to the flap)
    const u = ss(RIDE_TO, RIDE_TO + 0.18, s); gripOf(o, -1, _v); R.goal.copy(_ride).lerp(TOGGLE, u); R.pole.copy(POLE_LOW_R); R.curl = 0.5;
    if (u <= 0) _ride.copy(_v);
  } else if (s < RIDE_TO) _ride.copy(R.goal);
  o.body = 1 - ss(0.3, 1, s);
  return o;
}

/** the furled roll's mount on the survey case (char frame), for a staging or a bench that shows it stowed */
export const ROLL_MOUNT = MOUNT;
