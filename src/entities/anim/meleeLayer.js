import * as THREE from 'three';
import { ClipLayerSet } from './clipLayer.js';
import { register } from './registry.js';

/**
 * MeleeLayer — how Brea HOLDS and SWINGS the lance (melee W1; the system is the
 * Round-4 player-melee stack, re-tabled on her body and on two hands).
 *
 * Kevin's bar: "melee performed by the body with the weapon held properly".
 *
 *   1. THE LANCE IS HELD, NOT PLACED. One rigid grip transform, derived once
 *      from the hand bone's own rest axes (knuckle line = grip axis, palm
 *      centre = shaft axis), is written into the lance's bone-local transform.
 *      Every pose after that moves the HAND; the lance follows because it is
 *      in the hand. The LEFT hand then goes ONTO the haft at its table mark
 *      (55 % in the guard) with the same construction: palm on the axis, index
 *      toward the blade, and it slides along the haft when the arm is short.
 *   2. THE BODY PERFORMS THE SWING. A beat table (ready / cock / contact /
 *      follow-through) drives both arms by IK, the torso by procedural
 *      yaw/pitch/roll and the legs by a stance table. An upper-body-masked
 *      ADDITIVE clip (`Sword_Attack`) rides on top of the locomotion tree
 *      through `ClipLayer`, so the legs keep their stride under a swing.
 *   3. IT LIVES ON HER BACK, ON THE STOW KIT. The stowed lance she wears is the
 *      stow kit's skinned piece on the R10 diagonal (`src/hero/carry.js`). The
 *      prop here is hidden while she is holstered and posed on that same line
 *      from the first frame of a draw (the kit collapses its copy on that
 *      frame), the hand travels to the haft where the haft already is, so the
 *      hand-over is a sub-centimetre event rather than a teleport.
 *
 * MEMORY (Kevin's Mac has been force-restarted): every object this file creates
 * is built once in the constructor and released in `dispose()`. Nothing in
 * `update()` allocates: all working vectors/quaternions are the module scratch.
 *
 * Owner: melee. Numbers and history: docs/ROUND5-MELEE.md.
 */

/* small enough to be inlined whatever the budget (R48 c; see playerAnimator.js) */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const damp = (x, y, l, dt) => { const t = 1 - Math.exp(-l * dt); return (1 - t) * x + t * y; };
const smoothstep = (x, a, b) => { if (x <= a) return 0; if (x >= b) return 1; const u = (x - a) / (b - a); return u * u * (3 - 2 * u); };

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/* ------------------------------- scratch -------------------------------- */
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _shaft = new THREE.Vector3();
const _lh = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _butt = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _seg = new THREE.Vector3();
const _sgA = new THREE.Vector3();
const _sgB = new THREE.Vector3();
const _sgC = new THREE.Vector3();
/** Where the haft guard's closest approach happens: the bone, and the haft. */
const _gapBone = new THREE.Vector3();
const _gapPt = new THREE.Vector3();
/** debug(): the haft midpoint. Its own scratch — it outlives _a's next use. */
const _mid = new THREE.Vector3();
/** `_liveSocket`'s own scratch. */
const _skMid = new THREE.Vector3();
const _skA = new THREE.Vector3();
const _skB = new THREE.Vector3();
const _skC = new THREE.Vector3();
/** the prop's world butt on the frame a hand-over happens (`grabGap`). */
const _hoPos = new THREE.Vector3();
/** `_backCentre`'s own scratch. */
const _bcTmp = new THREE.Vector3();
/** `_reparentGap`'s throwaway direction out-param. */
const _rgDir = new THREE.Vector3();
/** `_snapPose`'s own shaft scratch (it runs inside `_blend`, before _lerpPose). */
const _snapD = new THREE.Vector3();
/** `_bowSolve`'s copy of the raw escape, kept across the constraint projection. */
const _bsRaw = new THREE.Vector3();
/** The carry's tilt search (round 6): the midpoint it started from, the best
 *  candidate's midpoint and haft direction. */
const _bsMid0 = new THREE.Vector3();
const _bsMidBest = new THREE.Vector3();
const _bsDirBest = new THREE.Vector3();
/** `_bowClearDir`'s second escape: the predicted bow's, kept beside the live one. */
const _bwDir2 = new THREE.Vector3();
/** `_hairGapFor`'s own three: a candidate carry segment and one strand. */
/** `_clearLeftArmOfBow`'s scratch (round 5 fix pass 1). */
const _lbA = new THREE.Vector3();
const _lbB = new THREE.Vector3();
const _lbS = new THREE.Vector3();
const _lbE = new THREE.Vector3();
const _lbH = new THREE.Vector3();
const _lbF = new THREE.Vector3();
const _lbU = new THREE.Vector3();
const _lbV = new THREE.Vector3();
const _hgA = new THREE.Vector3();
const _hgB = new THREE.Vector3();
const _hgP = new THREE.Vector3();
/** the carry servo's direction scratches (push, hair escape, bow escape) */
const _sv1 = new THREE.Vector3();
const _sv2 = new THREE.Vector3();
const _sv3 = new THREE.Vector3();
/** the bow bound's own: the bow limb's two ends, the haft's, and its escape */
const _bwA = new THREE.Vector3();
const _bwB = new THREE.Vector3();
const _bwC = new THREE.Vector3();
const _bwD = new THREE.Vector3();
/** `_bowSeg`'s own scratch: the limb centre while it is scaled back up. */
const _bwMid = new THREE.Vector3();
const _sv4 = new THREE.Vector3();
/** `_elbowGuard`'s own (round 6): shoulder, elbow, wrist, head, the elbow
 *  circle's axis / centre / basis, and a candidate. */
const _eS = new THREE.Vector3();
const _eE = new THREE.Vector3();
const _eH = new THREE.Vector3();
const _eD = new THREE.Vector3();
const _eAx = new THREE.Vector3();
const _eC = new THREE.Vector3();
const _eU = new THREE.Vector3();
const _eV = new THREE.Vector3();
const _eT = new THREE.Vector3();
const _eQ = new THREE.Quaternion();
/** `_armHullGuard`'s own (round 6, S5): elbow / wrist / fist (world), the
 *  post-layer shift, hull ends, the escape direction, and the model rotation. */
const _ahE = new THREE.Vector3();
const _ahH = new THREE.Vector3();
const _ahF = new THREE.Vector3();
const _ahSh = new THREE.Vector3();
const _ahU = new THREE.Vector3();
const _ahV = new THREE.Vector3();
const _ahD = new THREE.Vector3();
const _ahDir = new THREE.Vector3();
const _ahX = new THREE.Vector3();
const _ahA = new THREE.Vector3();
const _ahB = new THREE.Vector3();
/** ...and `_armHullFinal`'s wrist goal (char). */
const _ahG = new THREE.Vector3();
const _ahQi = new THREE.Quaternion();
/** the left hand's late seat (fix round 1): palm goal, haft butt / tip, knuckle centre */
const _slG = new THREE.Vector3();
const _slB = new THREE.Vector3();
const _slT = new THREE.Vector3();
const _slP = new THREE.Vector3();
const _slF = new THREE.Vector3();
const _ident = new THREE.Quaternion();
const _hTab = new THREE.Vector3();
const _hOff = new THREE.Vector3();
const _hOffD = new THREE.Vector3();
/** The identity, as a value (never mutated). */
function _qi() { return _ident; }
/**
 * Per-frame number fields are born as decimals (R46, melee W1). A field created as
 * `0` has the small-integer representation; its first fractional value (her first
 * step, for most of them, since she stands through the opening) changes the object's
 * map and throws away every optimised function that read it, in every lane, and the
 * next seconds run in the baseline tier where each double is a HeapNumber: measured
 * 0.76 KB/frame standing, 28 KB/frame in the first sprint. The same write also takes
 * a field out of "never changed" tracking, for numbers and booleans.
 */
export function decimalFields(o) {
  const keys = Object.keys(o);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const d = Object.getOwnPropertyDescriptor(o, k);
    if (!d || !('value' in d) || !d.writable) continue;
    const v = d.value;
    if (typeof v === 'number') { if (Number.isFinite(v)) { o[k] = v + 0.25; o[k] = v; } } else if (typeof v === 'boolean') { o[k] = !v; o[k] = v; }
  }
  return o;
}

/**
 * THE GRIP FRACTION. `lance-grip-closeup.jpg`: the right hand wraps the rear
 * ~20 % of the shaft, the butt projecting only a fist-length behind the wrist.
 * `melee.js` used to grip at 0.38 of a 1.85 m haft — 33 cm too far up, which is
 * most of why the carry read wrong. Canon band 0.15-0.28, best 0.22; 0.20 keeps
 * the stub behind the wrist short on a haft that is long for this rig.
 */
/**
 * Round 5 (ruling R3): how far under the head bone the head cylinder starts
 * that A104 holds the heavy's forearm and haft out of (radius 0.16 m, gated).
 */
const HEAD_CYL_DROP = 0.05;
/**
 * Horizontal distance from the head bone's vertical axis to the part of
 * segment a-b at or above `head.y - HEAD_CYL_DROP` (char space); 9 when no
 * part of it is that high. Cold path (debug()).
 */
function headCylDist(a, b, h) {
  const yc = h.y - HEAD_CYL_DROP;
  if (a.y < yc && b.y < yc) return 9;
  let t0 = 0, t1 = 1;
  const dy = b.y - a.y;
  if (a.y < yc || b.y < yc) {
    const ts = (yc - a.y) / dy;
    if (a.y >= yc) t1 = ts; else t0 = ts;
  }
  const dx = b.x - a.x, dz = b.z - a.z;
  const ll = dx * dx + dz * dz;
  let t = ll > 1e-12 ? ((h.x - a.x) * dx + (h.z - a.z) * dz) / ll : t0;
  t = t < t0 ? t0 : (t > t1 ? t1 : t);
  return Math.hypot(a.x + dx * t - h.x, a.z + dz * t - h.z);
}

export const GRIP_FRAC = 0.20;
/** Where the hand meets the shaft when it reaches behind the shoulder. */
export const GRAB_FRAC = 0.60;
/**
 * How close the hand has to be to the stowed haft before the prop changes
 * parent. Under a tenth of a metre is invisible at any sane camera distance,
 * and it is loose enough that one frame of IK residual cannot stall the draw.
 */
export const GRAB_SNAP = 0.09;

/** Upper-body bones the masked clip is allowed to write. Legs are absent on
 *  purpose: that is what keeps locomotion intact under a swing (gate A105). */
const MASK_PREFIX = [
  'spine_01', 'spine_02', 'spine_03', 'spine_04', 'spine_05',
  'neck_01', 'neck_02', 'head_',
  'clavicle_l', 'clavicle_r', 'upperarm_l', 'lowerarm_l', 'hand_l',
];
/** Axial bones the mirror operates on (sagittally symmetric at bind). */
const AXIAL_PREFIX = ['spine_', 'neck_', 'head_'];

/**
 * THE GUARD AND THE BEAT TABLE (melee W1, on Brea with the 1.55 m lance).
 *
 * Character space: +X her LEFT, +Y up, +Z forward, metres, origin on the
 * ground under the pelvis. `hand` is the right WRIST goal; `shaft` the
 * butt->tip direction (normalised on load); `lhW` how much the left hand is ON
 * the haft (1 on it, 0 free at the wrist goal `lh`); `lhOn` where on the haft,
 * in metres ahead of the right grip (authored on the 1.55 m lance and scaled
 * by the live length), and the left hand slides there: a two-handed thrust
 * runs the haft through the front hand. `yaw/pitch/roll` are the procedural
 * torso rotations split across the three spine joints; `py` is the pelvis's own
 * turn and `dz` its travel forward, on a standing body only (a stride owns its
 * hips): the feet are planted by the conform, so the hips load the legs instead
 * of skating them (A105 reads 0.02 m of drift through it).
 *
 * Numbers are for her 0.474 m arm and were read off the offline rig solve
 * (docs/ROUND5-MELEE.md §2): the left shoulder only reaches the 55 % mark of a
 * low guard because she is bladed and her trunk comes forward over the front
 * hand, which is also what a polearm guard looks like (reference/r5/melee).
 *
 * THE GUARD: right hand low beside the hip at 20 % of the haft, left hand
 * forward at 55 % (bible §5.3), blade forward and down, tip 0.35-0.55 m (R2).
 *
 * THE BEATS. All but light-3 carry two hands on the haft (R1, R12).
 *   light-1  the hip-driven THRUST: hands chamber back at the right hip with
 *            the blade up, the rear foot pushes, the haft runs through the
 *            front hand, the follow drops the blade off to her right.
 *   light-2  the SWEEP, left to right: the shoulders wind left and the blade
 *            crosses level at chest height, the hips first.
 *   light-3  the one-handed LONG STAB (R1): the left hand lets go, trails as a
 *            counterweight, the arm goes out over the lead foot.
 *   heavy    the two-handed DRIVE (R3, R12): she sinks and winds up with the
 *            blade high and both hands on the haft, then the whole trunk comes
 *            down behind it; the fist lands at shoulder height, outboard of
 *            the head line, the reach from spine pitch and the lunge.
 */
/* FIX ROUND 1 (the judge's V46 finding: a hand on the hip, the elbow back): the
 * rear wrist 0.05 m further forward and up, the haft a little more to her left,
 * the trunk turned and pitched further toward the front hand. How far forward the
 * rear fist can go is set by A101's bars, not by taste: the left palm has to reach
 * 50-60 % of the haft with the tip at 0.35-0.55 m, and her arm is 0.475 m; the pose
 * lab (f1) measured the left hand sliding to 40-43 % of the haft with the wrist 0.17-0.27 m
 * further forward (doc §6.2). */
const READY = {
  hand: [-0.23, 1.12, 0.0], shaft: [0.38, -0.40, 0.83],
  lh: [0.22, 0.95, 0.20], lhW: 1, lhOn: 0.50, yaw: -0.40, py: -0.28, pitch: 0.32, roll: 0.02, dz: 0.0,
};
/**
 * Her legs, per beat. Rotations are char-space radians on thigh, calf and
 * foot; `dx/dy` the pelvis offset. Read with STANCE_ENV: nothing in a windup's
 * opening, full at the contact, gone by the end of the recover.
 */
/** The left forearm's axis off her pelvis->neck axis (a forearm is 0.05 thick, her belly 0.12 out). */
const LEFT_FORE_CLEAR = 0.13;
/** How much of the trunk's turn the head keeps, and how much of its lean the
 *  neck and skull take out (see `update`). */
const HEAD_LEAD = 0.14;
const HEAD_LEVEL = 0.92;
/** The wrap and knot tails: the two simulated chains near the haft (A104). */
const TAIL_RE = /^dyn_(wrapSash|sashEnd|hairKnotTail)/;
/** `lhOn` is authored on the 1.55 m lance at the guard's 0.20 -> 0.55. */
const LH_ON_REF = 0.5425;
/** Her wrist to the palm's centre on the haft (m; measured on the UBC hand). */
const LH_PALM = 0.075;
/** The left hand never slides closer to the right hand than this (m). */
const LH_ON_MIN = 0.14;
/** The recoil on a hit: metres back along the haft, and its decay (1/s). */
const RECOIL_LIGHT = 0.045;
const RECOIL_HEAVY = 0.085;
const RECOIL_RATE = 11;
/** How much of a stance one RENDERED frame may take on (a loaded box must not
 *  snap her hips; see `_stance`). */
const STANCE_STEP_MAX = 0.10;
const STANCE = {
  ready: { thighL: -0.54, thighR: 0.16, calfL: 0.72, calfR: 0.34, footL: -0.17, footR: -0.30, abd: 0.15, dx: 0.0, dy: -0.115 },
  /* fix round 1 (V47: "four different actions", the body doing the work): light-1 is
   * a lunge (the lead knee over the foot, the rear leg long), light-2 a wide base with
   * the weight going onto the lead leg under the sweep, light-3 sinks onto the lead
   * knee under the overhand stab; f1's pose lab filmed and measured them */
  'light-1': { thighL: -0.88, thighR: 0.48, calfL: 0.86, calfR: 0.08, footL: -0.14, footR: -0.44, abd: 0.10, dx: 0.02, dy: -0.19 },
  'light-2': { thighL: -0.55, thighR: 0.30, calfL: 0.70, calfR: 0.22, footL: -0.12, footR: -0.30, abd: 0.22, dx: 0.06, dy: -0.15 },
  'light-3': { thighL: -0.84, thighR: 0.34, calfL: 1.00, calfR: 0.14, footL: -0.10, footR: -0.30, abd: 0.11, dx: 0.05, dy: -0.175 },
  /* the heavy sinks deepest (V47: "a low committed drive with the hips lowest"; A102 pins it 0.04 m under
   * every light): r1/r2b read its pinned hips 0.643 / 0.669 m against light-3's 0.722 / 0.701, so the
   * margin was the run's noise. Both knees bend further and the long stab stands 0.015 m taller. */
  heavy: { thighL: -1.00, thighR: 0.50, calfL: 1.20, calfR: 0.30, footL: -0.28, footR: -0.50, abd: 0.18, dx: -0.03, dy: -0.32 },
};
/** How much of a beat's stance is on at clip progress `cu` (0 cock .. 1 end). */
const STANCE_ENV = (cu) => (
  cu <= 0.30 ? 0.20 * smoothstep(cu / 0.30, 0, 1)
    : cu <= 0.68 ? 0.20 + 0.80 * smoothstep((cu - 0.30) / 0.38, 0, 1)
      : cu <= 0.82 ? 1
        : 1 - smoothstep((cu - 0.82) / 0.18, 0, 1)
);
const BEATS = [
  {
    id: 'light-1', clip: [0.10, 0.62], mirror: false, clipW: 0.16,
    cock: { hand: [-0.29, 1.24, -0.24], shaft: [0.40, 0.47, 0.79], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.50, yaw: -0.46, py: -0.34, pitch: 0.02, roll: 0.05, dz: -0.07 },
    /* fix round 1: a LEVEL THRUST, the front arm long and the hips driven over the lead foot */
    contact: { hand: [-0.12, 1.10, 0.45], shaft: [0.06, 0.05, 0.997], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.34, yaw: -0.42, py: 0.08, pitch: 0.45, roll: -0.04, dz: 0.22 },
    follow: { hand: [-0.13, 1.06, 0.46], shaft: [0.16, -0.20, 0.966], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.36, yaw: -0.42, py: 0.06, pitch: 0.42, roll: -0.06, dz: 0.20 },
  },
  {
    id: 'light-2', clip: [0.10, 0.62], mirror: true, clipW: 0.16,
    /* fix round 1: a SWEEP CROSSING HER FRONT, the blade 33 deg to her right at contact
     * and the shoulders turned through it (it read as light-1 again at -8 deg) */
    cock: { hand: [-0.30, 1.26, -0.04], shaft: [0.62, 0.18, 0.763], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.36, yaw: 0.30, py: 0.24, pitch: 0.06, roll: 0.04, dz: -0.04 },
    contact: { hand: [-0.17, 1.16, 0.28], shaft: [-0.55, 0.0, 0.835], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.24, yaw: -0.50, py: -0.30, pitch: 0.22, roll: 0.06, dz: 0.06 },
    follow: { hand: [-0.24, 1.04, 0.16], shaft: [-0.80, -0.18, 0.572], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.22, yaw: -0.66, py: -0.42, pitch: 0.18, roll: 0.06, dz: 0.05 },
  },
  {
    id: 'light-3', clip: [0.05, 0.80], mirror: false, clipW: 0.20,
    release: [0.05, 0.42],
    cock: { hand: [-0.31, 1.28, -0.10], shaft: [0.34, 0.42, 0.84], lh: [0.28, 1.02, 0.20], lhW: 1, lhOn: 0.40, yaw: -0.40, py: -0.26, pitch: -0.06, roll: 0.04, dz: -0.06 },
    /* fix round 1 (A102 f1: light-3 and the heavy read as ONE arc, contact pitch -15 vs
     * -3 deg): the overhand stab drives DOWN through the hull, 30 deg under level, which
     * is also what tells it from the heavy's level drive in V47's frames */
    contact: { hand: [-0.22, 1.36, 0.60], shaft: [0.12, -0.50, 0.858], lh: [0.40, 0.98, -0.20], lhW: 0, lhOn: 0.40, yaw: 0.24, py: 0.20, pitch: 0.30, roll: 0.02, dz: 0.12 },
    follow: { hand: [-0.21, 1.08, 0.48], shaft: [0.24, -0.54, 0.806], lh: [0.38, 0.92, -0.24], lhW: 0, lhOn: 0.40, yaw: 0.18, py: 0.20, pitch: 0.26, roll: -0.04, dz: 0.10 },
  },
];
const HEAVY = {
  id: 'heavy', clip: [0.0, 0.92], mirror: false, clipW: 0.18,
  cock: { hand: [-0.28, 1.31, -0.12], shaft: [0.32, 0.46, 0.83], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.38, yaw: -0.46, py: -0.36, pitch: -0.10, roll: 0.08, dz: -0.10 },
  /* fix round 1: the LOWEST, LONGEST drive: the hips sink furthest and travel furthest */
  contact: { hand: [-0.13, 1.28, 0.47], shaft: [0.10, -0.12, 0.988], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.30, yaw: -0.44, py: 0.12, pitch: 0.55, roll: -0.05, dz: 0.26 },
  follow: { hand: [-0.15, 1.16, 0.46], shaft: [0.22, -0.36, 0.906], lh: [0.2, 0.95, 0.2], lhW: 1, lhOn: 0.30, yaw: -0.40, py: 0.10, pitch: 0.50, roll: -0.08, dz: 0.22 },
};
/** How far before `CONTACT_K` the contact key is reached; it is then HELD for
 *  the rest of the strike window. See `_blend`. 0.16 -> 0.10 in fix pass 1: the
 *  hold is still 0.030 s of a 0.10 s strike, and the 0.006 s it gives back goes
 *  to the cock->contact leg, which is the one with no margin. */
const HIT_LEAD = 0.10;
/** How much of `recover` the follow-through takes before the return to guard.
 *  0.16 s of a 0.26 s recover against the canon's filmed 0.20 s; the 0.04 s
 *  goes to the return leg, which was the second-worst per-frame step in the
 *  swing (0.404 m in a 38 ms frame, measured) — see `SETTLE_T`. */
const RECOVER_FOLLOW = 0.62;

/* --------- THE SWING'S OWN RATE BUDGET (fix pass 1, finding F1) ----------- */
/**
 * WHERE THE COCK KEY IS REACHED INSIDE THE WINDUP, and why the release starts
 * before the "strike" phase does.
 *
 * The gate judge reproduced A102 failing 1-in-8 in isolation on the round-4
 * build: `light-1: the HAND moved 0.51 m in one frame — 1.02x the §4 budget`.
 * Filmed per frame, the mechanism is not a teleport and not the hand-over — it
 * is the shape of the clock:
 *
 *   · `melee.js`'s strike phase is 0.10 s and the cock->contact leg used to be
 *     `CONTACT_K - HIT_LEAD` = 0.54 of it, i.e. 54 ms for 0.567 m of wrist
 *     travel — 10.5 m/s, already over A102's own 8.3 m/s budget before any
 *     easing, and `Math.pow(u, 0.62)` front-loaded it to ~17 m/s at the start;
 *   · `poseState` clamps `k` to 1 inside each phase, so the extrapolation
 *     parks the pose ON the cock for up to 45 ms at the end of the windup and
 *     the whole leg then has to happen after the phase flips;
 *   · a box rendering 40-60 ms frames therefore draws the entire leg between
 *     two frames (measured: 0.377 m in 52.8 ms quiet, 0.51 m under the suite).
 *
 * No easing inside a 54 ms window can fix that, so the leg gets more clock: the
 * cock is reached at `WINDUP_COCK` of the windup and the release begins there,
 * which is also what a real swing does (a lance does not dwell at the top).
 * `STRIKE_PRE` is the fraction of the leg that happens before the strike phase,
 * and it is set to the fraction of the leg's TIME that the windup tail owns —
 * 0.48 * 0.15 s of windup against 0.60 * 0.10 s of strike — so the wrist rate
 * is continuous across the phase boundary instead of stepping.
 *
 * Total leg: 132 ms for <= 0.52 m of chord = 3.9 m/s, peaking at 5.1 m/s
 * through `STRIKE_EASE`. Round 4's was 54 ms for 0.567 m.
 */
const WINDUP_COCK = 0.58;
/** ...and how much of the cock->contact leg the windup tail spends: the same
 *  share of the leg that the windup tail owns of its TIME (0.42 * 0.15 s of
 *  windup against 0.60 * 0.10 s of strike), so the wrist rate is continuous
 *  across the phase flip instead of stepping. */
const STRIKE_PRE = 0.51;
/**
 * READY -> cock, and why it is not `k * k` any anymore.
 *
 * `k * k` has rate 0 at the start and 2x uniform at the END — i.e. it is
 * fastest exactly where it hands over to the release, which doubled the peak at
 * the seam. This is the same shape the other way round: 0.7x uniform at the
 * start (the anticipation still loads slowly) rising to 1.3x, which matches
 * `STRIKE_EASE`'s own 1.3x opening so the two legs meet at the same rate.
 */
const WINDUP_EASE = (u) => u * (0.70 + 0.30 * u);
/**
 * The strike's ease, and why it is not a power curve any more.
 *
 * `Math.pow(u, 0.62)` has an INFINITE derivative at u = 0: the first rendered
 * frame of the strike covered 60-80 % of the leg however long the leg was. This
 * one still front-loads — a strike has to have a peak — but its peak rate is a
 * finite 1.30x uniform, at u = 0, decaying to 0.70x at contact.
 */
const STRIKE_EASE = (u) => u * (1.30 - 0.30 * u);
/** The same idea on contact -> follow-through (was `Math.pow(u, 0.8)`). */
const FOLLOW_EASE = (u) => u * (1.25 - 0.25 * u);
/**
 * HOW MUCH OF THE RETURN TO GUARD HAPPENS INSIDE THE SWING, and the rest.
 *
 * The follow-through key is 0.56-0.58 m from the guard on light-1, light-3 and
 * the heavy, and the swing's last leg had 73 ms for it (0.404 m in one 38 ms
 * frame, measured on the round-4 build — the second-worst step in the whole
 * swing and nothing to do with the strike). A `recover` phase cannot be
 * lengthened from here (the durations are `weapons.js`, and the combo window
 * hangs off them), but the return does not have to FINISH inside it: the pose
 * is snapshotted on the last swing frame and the remainder is spent in the
 * guard, which is where a real arm settles anyway. Effective return: 99 ms
 * in-swing for 72 % of the chord, then `SETTLE_T` for the last 28 % — 3.2 m/s
 * where it was 7.9.
 */
const RETURN_IN_SWING = 0.72;
/** How long the post-swing settle into the guard takes, seconds. */
const SETTLE_T = 0.12;

const CARRY_T = 0.16;
/**
 * The draw/holster timing curve (fix round 2).
 *
 * A `smoothstep` peaks at 1.5x the uniform rate halfway through, and halfway
 * through a draw is exactly where the haft has the most angle left to cover.
 * Stack that on the normalised-lerp whip `_slerpDir` replaces and one rendered
 * frame of a loaded box carried 1.65 m of blade tip. Two thirds linear, one
 * third smoothstep keeps the ends soft — the hand still arrives and leaves at
 * rest — while cutting the peak rate to 1.17x uniform. The swings are NOT
 * eased this way: a strike is meant to have a peak.
 */
const CARRY_EASE = (t) => (1 - 0.34) * t + 0.34 * (t * t * (3 - 2 * t));
/**
 * When the hand starts sliding DOWN the haft to the grip point, as a fraction
 * of the return leg. The slide is ~0.6 m of axial travel; run concurrently
 * with the haft's 150 deg of rotation it adds to the peak instead of filling a
 * gap, so it waits until most of the rotation is spent.
 */
const SLIDE_START = 0.45;

/** Ceiling on how fast the blend may move the far end of the haft, m/s. */
const CARRY_RATE = 4.2;
/** and how long it is ever allowed to take. */
const CARRY_MAX = 0.55;
/** ...and the most of the blend one RENDERED frame may spend. */
const CARRY_STEP_MAX = 0.22;

/**
 * Bones the shaft must stay `SHAFT_CLEAR` metres away from (A104).
 *
 * FIX ROUND 4 (finding F7). The list stopped at `spine3`, so the whole LOWER
 * torso — spine_01, spine_02 and the pelvis — was outside both the guard and
 * A104's clause: a beat could load with the butt cap buried in her own hip and
 * nothing would say so. It is the same list in three places (this guard,
 * `_measure`'s per-frame read and `debug()`'s cold read), so adding them here
 * tightens all three at once. Re-authored beats keep it clear: the tightest
 * lower-spine approach across the four swings is light-2's cock at 0.27 m and
 * the heavy's at 0.28 m, both above the 0.20 m guard target and well above
 * A104's 0.12 m bar.
 */
const CLEAR_BONES = [
  'head', 'neck1', 'neck2', 'spine5', 'spine4', 'spine3', 'spine2', 'spine1', 'pelvis',
];
/**
 * THE GUARD'S TARGETS, AND WHY THEY ARE WELL OVER THE BARS.
 *
 * The guard runs inside the arm solve; the twist layer, the ground conform and
 * the dyn_ spring chains all run AFTER it, and the ponytail it is avoiding is
 * simulated after it too — so what it measures is a frame old and what it
 * leaves behind gets nudged again before anything is drawn. Shipping it at the
 * bar (0.12 m to bone, 0.05 m to hair) put light 2 at 0.085 m and light 3's
 * overhead at 0.037 m of the braid across repeated runs. The margins here are
 * the lag, measured, not padding.
 */

const SHAFT_CLEAR = 0.150;
/**
 * How far the LANCE-side guard tries to stay off the braid.
 *
 * Fix round 1: this was 0.150 m, which was the margin the haft needed when it
 * was the only thing that could give — the braid is simulated after this layer
 * and the guard was avoiding last frame's strands. Now that `_hairOffHaft`
 * enforces `HAIR_FIX` on the BRAID side, after the spring sim, the haft does
 * not have to carry that margin alone; and it must not, because at 0.150 m the
 * hair term beat the axial term inside `_clearDeficit` and pushed light 3's
 * haft toward her spine (filmed: shaftClear 0.107 m against A104's 0.12 bar,
 * with the braid already clear at 0.113). 0.095 is above A104's 0.05 hair bar
 * and below the axial target, so the skull and the spine win ties again.
 */
const HAIR_CLEAR = 0.07;
/**
 * How far the free LEFT arm's axis (upper arm, forearm + hand) is kept from
 * the stowed bow's limb axis, metres (round 5 fix pass 1, `_clearLeftArmOfBow`).
 * A forearm is ~0.09 m thick and a limb ~0.03 m, so 0.06 is touching; 0.11
 * leaves ~0.05 m of daylight. A104 gates >= 0.08 (no contact) on every frame.
 */
const BOW_ARM_CLEAR = 0.11;
/** Distance from the spinal axis to the surface things are stowed on. */
const BACK_DEPTH = 0.13;
/** Forearm pronation/supination budget, and the wrist deviation left over. */
const FORE_TWIST = 2.1;
const WRIST_SWING = 1.10;
/** Elbow roll about the shoulder->wrist axis: free, the wrist never moves. */
const ELBOW_ROLL = 1.9;

/**
 * A SWING TAKEN AT A JOG (round 5 fix pass 2, the engineering/film judge's
 * major). Every beat's torso pitch (`u.pitch`, up to 0.52 rad on the heavy)
 * was authored on a STANDING body, where the pelvis -> head line starts at
 * ~11 deg off vertical, and it was added on top of whatever the stride had
 * already done. The stride leans her 35-41 deg by itself (measured, lance
 * ready, `_moveW` 1), so a jogging heavy reached 56-59 deg with the head
 * down at 1.10 m, and because the drive-hand keys are in CHARACTER space
 * (they do not travel with the spine) the fist ended 0.09 m ABOVE the head
 * on the heavy and 0.15 m above it on light-3 — her face under her own
 * raised arm, on film.
 *
 * So while she is striding (her measured travel speed ramped 1.6 -> 3.0 m/s;
 * a standing swing's step-in never exceeds the drive's 1.15 m/s, so every
 * standing gate and sheet is untouched — see `_stridePitch` for why this is
 * not the animator's `_moveW`):
 *  - `JOG_TORSO_CAP`: the beat's additive pitch is budgeted against the lean
 *    the stride already has, measured on the frame (pelvis -> head bone, char
 *    space), so the total stays at or under 40 deg. A spine rotation above
 *    the pelvis moves the head along an arc about that joint, so a budget in
 *    rotation is conservative in angle. The judge proposed a fixed
 *    (1 - 0.6 moveW) scale; measured, it would leave the heavy at ~52 deg
 *    over a 41 deg stride, so the budget is the one that meets the bar.
 *  - `JOG_COUNTER_MAX`: when the stride alone is over the cap, the layer may
 *    straighten her by at most this much rather than fighting the
 *    locomotion.
 *  - `JOG_HAND_UNDER_HEAD`: from the release of the cock (`WINDUP_COCK`)
 *    through strike and recover, the drive-wrist goal is held this far under
 *    the lowest the head bone can end the frame (`HEAD_STAB_MAX` below where
 *    it is when this layer runs). The cock itself keeps its height (a windup above the
 *    head is the canon); the clamp ramps in over the release so the hand
 *    path has no step.
 * The STANCE legs/pelvis drop is already 0 at a jog (`_stanceW`), so nothing
 * there stacks.
 */
const JOG_TORSO_CAP = 30 * Math.PI / 180;
const STRIDE_FWD = 0.15;
/** How much of the shaft's rise a cock keeps on the move (y of the unit shaft). */
const STRIDE_SHAFT_RISE = 0.18;
/** The most the arm guards' push may change in one animator step (m). */
const GUARD_STEP = 0.055;
/** The stride weight's speed ramp (m/s): above a standing swing's step-in
 *  drive (1.15), full by a slow jog. See `_stridePitch`. */
const STRIDE_V0 = 1.6;
const STRIDE_V1 = 3.0;
const JOG_COUNTER_MAX = 0.10;
const JOG_HAND_UNDER_HEAD = 0.05;
/** `playerAnimator._headStabilise`'s clamp on the head bone's translation
 *  (+-0.055 m), which it applies AFTER this layer — see `_strideHand`. */
const HEAD_STAB_MAX = 0.055;

/* ------------- THE DRAW AND HOLSTER ARM PATH (round 6, ruling R8) ---------- */
/**
 * Kevin's two complaints, verbatim — "arm literally behind head" and "arms
 * crossing into her body" — came back from the r5 skeptic on the one path no
 * gate staged: the DRAW from a jog put her right elbow 0.14-0.19 m above her
 * head and 0.26-0.34 m behind it for ~0.25 s, and from the rear-3/4 the forearm
 * lay across the back of her skull. Two things put it there: the reach pose
 * turned her chest to the RIGHT (yaw -0.16, the drive shoulder back, away from
 * the hand), and `_alignHaft`'s elbow roll (up to 1.9 rad, "free: only the
 * elbow moves") spent the whole wrist correction on swinging the elbow up
 * behind her head.
 *
 * Now the draw and the holster are an ARM PATH with a hard bound, checked on
 * the solved arm every frame the layer drives it (`_elbowGuard`): the elbow
 * never above the head bone, and — wherever it is above the shoulder joint,
 * which is where an arm can be "behind the head" at all — never more than
 * `ELB_BEHIND` behind the head's frontal plane. Violations are removed by
 * rolling the upper arm about shoulder->wrist (the wrist does not move), the
 * roll searched round the whole elbow circle for the nearest compliant angle;
 * if the circle has none, the hand target itself comes forward and down and
 * the arm is re-solved. The margins are the lag, measured: A107 gates 0.05 /
 * 0.10 m, `_headStabilise` translates the head up to 0.055 m after this layer.
 *
 * WHY THE HEIGHT BAND. The READY guard the draw ends in (and the holster
 * starts from) has the elbow beside her ribs, 0.26-0.36 m behind the head's
 * plane — and her SHOULDER JOINT itself sits 0.14-0.20 m behind it (idle, jog
 * and sprint, measured round 6). "Behind the head" is a statement about an arm
 * up at head level; below the shoulder the same plane test fails the canon
 * guard and the bare shoulder. A107 publishes the band-free reading as well.
 */
const ELB_OVER_HEAD = -0.01;
const ELB_BEHIND = 0.07;
/** "Above the shoulder" for the plane clause: elbow.y > shoulder.y + this. */
const ELB_BAND = -0.12;
/** Elbow-circle samples the guard searches (every 10 deg). */
const ELB_SAMPLES = 36;
/** How much of the upper body the draw turns TOWARD the drawing hand: + is
 *  her chest to the LEFT, i.e. the right shoulder forward, which brings the
 *  stowed haft (it rides on `spine_02`, below most of the turn) toward a hand
 *  whose elbow stays in front of her head. Round 5's reach turned it -0.16. */
const DRAW_YAW = 0.42;
/**
 * The draw's PULL: the hand takes the haft behind her shoulder at ~0.7 of its
 * length and has to finish at `GRIP_FRAC` with the prop rigid in the fist.
 * Round 5 let the capture-and-blend (`_blendCarry`) run on its own clock
 * (CARRY_RATE, up to 0.55 s) AFTER the draw had ended, and melee.js fired the
 * first swing into it: grip 0.38-0.45 of the haft at contact (ruling R5). Now
 * the blend is driven by the pull leg itself — it is at 1 exactly when the
 * draw clock is — so "the draw has completed" and "the grip is rigid at the
 * authored fraction" are the same frame (`handoverDone`).
 */
const PULL_EASE = (u) => u * u * (3 - 2 * u);

/** The holster's last leg: the hand leaves the socket DOWN HER SIDE to here
 *  (char), and only then hands the arm back to the locomotion. */
const SIDE_KEY = {
  hand: [-0.25, 0.86, 0.10], shaft: [0.0, -0.2, 1.0], lh: [0.30, 0.90, 0.04], lhOn: 0, lhW: 0,
  yaw: 0, pitch: 0, roll: 0,
};

/* ------------- THE STRIKE AIMS AT THE HULL (round 6, ruling R7) ----------- */
/**
 * The contact keys were authored against a Sentry's chest: the blade lands
 * 1.8 m ahead of her root at 1.0-1.2 m. Every species was staged by the round-6
 * A103 and the ones that are not built like a Sentry could not be hit —
 * nothing of a Colossus is at blade height in front of its centre (the jaw
 * is 2.6 m up, over her head, at the closest the machine manager lets her
 * stand), a Hauler's and a Tower's heads sit above the sweep, a grounded
 * Raptor's chest above it. `melee.js::_aimAt` solves the hull point nearest
 * the beat's contact tip; here the release and the contact are bent toward it
 * by rotating the drive hand and the haft about her SHOULDER — pitch first,
 * then yaw, each bounded — so the blade arrives where the machine is. The
 * weight is 0 through the cock (the windup reads as authored), rises through
 * the release, is 1 at contact and gives way through the follow-through.
 */
/* generous: melee.js `_aimAt` bounds the TARGET (absolute cone about her
 * bearing); these only stop a stale aim point from folding the arm */
const AIM_PITCH_UP = 110 * Math.PI / 180;
const AIM_PITCH_DOWN = 60 * Math.PI / 180;
const AIM_YAW = 90 * Math.PI / 180;
/** ...and on ANY swing the blade tip stays this far above the terrain under
 *  it (the S5 slope row: on a 25 deg rise the authored low sweeps buried it). */
const TIP_GROUND_CLEAR = 0.10;
/** R9: the drive forearm's axis kept this far off her pelvis->neck axis on
 *  every swing frame (contact with the belly mesh starts at about 0.19). */
const FORE_CLEAR = 0.15;
/** The haft's daylight to the skull's largest semi-axis (m). */
const SKULL_CLEAR = 0.04;
/** S5: the forearm/fist capsule radius, and the daylight kept to a hull. */
const ARM_R = 0.05;
const ARM_CLEAR = 0.06;
/** `_armHullFinal`'s own daylight (round 6): it works on the drawn matrices,
 *  so it needs no prediction margin — it acts when the forearm or fist is
 *  within this of a hull, and stops when it is this clear. (Tried at 0.012 to
 *  give marginal swings at a Tower's foot lattice more reach: 5 of 12
 *  whiffed against 3 of 12 at 0.03 — the reach there is short by itself, not
 *  by this margin — so it stays.) */
const ARM_CLEAR_FINAL = 0.03;
/** ...and the most the guard may move the wrist goal in one frame (sideways
 *  out of a hull / back toward the shoulder): the blade is rigid in the fist,
 *  and a guard that shoves the hand half a metre takes the blade off the
 *  machine it was aimed at — the aim (melee `_aimAt`) is what picks a line the
 *  arm fits on; this only takes out what that proxy misses. */
const ARM_PUSH_MAX = 0.40;
/* round 6, Oct 2: 0.25 -> 0.40. A heavy recovering against a Big cat's low
 * head sandwiches the fist between two head capsules (the escape flips each
 * pass, so the guard draws the fist back toward the shoulder instead), and
 * 0.25 m of draw-back left it 0.062 m short of `ARM_CLEAR` — A106's swing row
 * read the forearm 0.004 m INSIDE rig_head#55 on one frame of 39. The recover
 * is after the hit: the blade has nothing left to land, so the arm may fold as
 * far as the push may move it. The strike-leg trim (`ARM_PUSH_STRIKE`, the
 * `1 - sw` taper below) is unchanged. */
const ARM_RETRACT_MAX = 0.40;
/** ...and when the fist is actually INSIDE a hull (see `_armHullGuard`): as
 *  far back toward the shoulder as the arm folds (the 0.25 m floor there) —
 *  a heavy's contact puts the fist 0.80 m out (ruling R3), and a Tower's
 *  foot lattice stands 0.5 m in front of her chest at the head-on stand. */
const ARM_RETRACT_INSIDE = 0.65;
/** ...and through the release and the strike, where the blade is on its way
 *  to the aimed skin: a trim, never a shove, and the elbow may roll <= 45 deg. */
const ARM_PUSH_STRIKE = 0.15;
const ARM_ROLL_STRIKE = Math.PI / 4;
/** The lean into an out-of-reach target: rad of spine pitch per metre short,
 *  and its ceiling (0.38 rad moves the shoulder ~0.18 m toward the target). */
const AIM_LEAN_GAIN = 1.6;
const AIM_LEAN_MAX = 0.38;
/** The most the residual pass turns the goal in one frame. */
const AIM_RESID_MAX = 25 * Math.PI / 180;
/** The most of an overshoot the arm gives back to stop a thrust on the skin. */
const AIM_PULL_MAX = 0.60;

/** Normalise a literal direction triple in place. */
function unit(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
/** The tables, for the gates and the offline rig tools (never written at runtime). */
export const MELEE_TABLES = { READY, BEATS, HEAVY, STANCE };

for (const k of ['hand', 'shaft', 'lh']) {
  if (READY[k] && k === 'shaft') READY[k] = unit(READY[k]);
}
for (const beat of [...BEATS, HEAVY]) {
  for (const key of ['cock', 'contact', 'follow']) beat[key].shaft = unit(beat[key].shaft);
}

export class MeleeLayer {
  /** @param {import('../playerAnimator.js').PlayerAnimator} an */
  constructor(an) {
    this.an = an;
    this.ctx = an.ctx;
    this.ok = false;
    this.lance = null;
    this.length = 1.85;
    /** uniform scale written onto the prop (melee.js LANCE_SCALE) */
    this.propScale = 1;
    this.gripFrac = GRIP_FRAC;
    this.w = 0;                 // how much of the upper body this layer owns
    this._aimYaw = 0;
    /* the per-beat stance (fix pass 2, see `STANCE`): its weight, and the
     * pelvis offset the animator folds into its own `pdx`/`pdy` on the same
     * frame so the ground conform's pelvis clamp plants the feet against it */
    this._stanceW = 0;
    this._stanceA = 0;          // rate-limited stance amplitude (STANCE_STEP_MAX)
    this._stanceMix = 0;        // ...and how far from the guard's stance to the beat's
    this._stanceKey = null;     // the beat whose stance is currently applied
    this._saFrame = -1;
    this._saBudget = 1;
    this.pelvisDx = 0;
    this.pelvisDy = 0;
    this.pelvisDz = 0;
    this._pelvisYawNow = 0;
    this._held = false;         // is the lance parented to the hand right now?
    this._grabK = 0.55;         // drawK at which the hand actually took it
    this._handQ = new THREE.Quaternion();  // last SOLVED hand orientation (char)
    /* the post-swing settle (see `SETTLE_T`): parked at the end, so nothing
     * settles until a swing has actually drawn a frame to settle out of */
    this._settleT = SETTLE_T;
    this._swingOut = null;
    /* THE DRAW / HOLSTER ARM PATH (round 6, R5 + R8). `_drawFrom` is the arm
     * as the locomotion left it on the draw's first frame (so the reach starts
     * where the hand IS, not at the guard); `_relK` is the holster fraction at
     * which the prop went back on her back (the return leg starts there);
     * `_fracNow` the grip fraction written this frame; `_pathOn` true while
     * the draw/holster drives the arm (the elbow bound is on). */
    this._drawFrom = {
      hand: [-0.25, 0.9, 0.1], shaft: [0, -0.2, 1], lh: [0.30, 0.90, 0.04], lhOn: 0, lhW: 0,
      yaw: 0, pitch: 0, roll: 0,
    };
    this._holsterFrom = {
      hand: READY.hand.slice(), shaft: READY.shaft.slice(), lh: READY.lh.slice(), lhOn: READY.lhOn, lhW: 1,
      yaw: READY.yaw, pitch: READY.pitch, roll: READY.roll,
    };
    this._prevStance = 'holstered';
    this._relK = 1;
    this._fracNow = GRIP_FRAC;
    this._pathOn = false;
    this._rollOff = false;
    this._handLast = new THREE.Vector3();
    this._handLastOk = false;
    /** per beat (L1, L2, L3, heavy): the reach the contact really achieved */
    this._reachSeen = new Float32Array(4);
    this._pullNow = 0;
    /* how far the animator moved her drive SHOULDER after this layer last
     * frame — the stance's pelvis offset through the ground conform's clamp
     * and tilt (measured, since the requested offset is not what lands: the
     * heavy asks -0.32 m of pelvis and ~-0.14 arrives, and the clamp's tilt
     * moves the shoulder more than the pelvis): the arm-, aim- and ground-
     * checks test the arm where it will be DRAWN (round 6) */
    this._pelvisPre = new THREE.Vector3();
    this._pelvisShift = new THREE.Vector3();
    this._pelvisShiftPrev = new THREE.Vector3();
    this._pelvisShiftOk = false;
    this._dbg = {
      stance: 'holstered', phase: 'idle', k: 0, beat: null, w: 0,
      palmToAxis: 0, gripAngleDeg: 0, bladeAhead: 0,
      shaftClear: 9, torsoYawDeg: 0, elbowOverHead: 0, forearmCross: 0,
      shaftErrDeg: 0, wristSwingDeg: 0, foreTwistDeg: 0, forearmToSpine: 9,
      handSpeed: 0, tipStep: 0, grabGap: 0, grabReach: 0, carryBlend: 1, carryPush: 0,
      hairClearGuard: 9, hairArgmin: null, hairPreFix: 9, hairFixed: 0,
      carrySlide: 0, carrySpan: 0, carryDur: 0,
      elbowGuard: 0, elbowGuardFail: 0, gripFracNow: GRIP_FRAC, handoverDone: true,
      /* R48 c: every field a frame writes is declared (an added field is a new hidden class) */
      drawK: 0, aimLean: 0, aimPitchDeg: 0, aimYawDeg: 0, aimResidDeg: 0, aimW: 0,
      armHullBack: 0, armHullDeficit: 0, armHullFinal: 0, armHullFinalLeft: 0, armHullFull: 0, armHullLeft: 0,
      armHullPush: 0, armHullRetract: 0, armHullRoll: 0, armHullT: 0, foreGuard: 0, forearmToSpineL: 9,
      leftArmToBow: null, legAmp: 0, legBeat: null, legW: 0, lhOnNow: null, lhPalmErr: 0, reachSeen: 0,
      skullGap: 0, strideHandCut: 0, strideLeanDeg: null, stridePitchCut: 0, strideW: 0,
      tipGroundLack: 0, tipGroundLift: 0, tipGroundResid: 0,
      lhReseat: 0, lhGapPre: 0, lhGapPost: 0, lhSlide: 0, armHullFinalL: 0, armHullDefL: 0,
    };

    const b = an.b;
    // spine_05 and upperarm_r are the carry bound's own references (the
    // upper-back surface and the shoulder the blade must clear), so a rig
    // without them takes melee.js's no-rig fallback rather than throwing.
    if (!b?.handR || !b?.spine4 || !b?.spine5 || !b?.upArmR) return;

    /* ---------------------- the grip, from the rest pose ------------------ */
    // knuckle line (index -> pinky) is the axis a fist closes AROUND; the
    // blade leaves the hand past the index/thumb side, so butt->tip is its
    // negation. Both are read from the rig, never eyeballed as an Euler.
    const idx = an.bones[an._findName('index_01_r_')];
    const pky = an.bones[an._findName('pinky_01_r_')];
    const mid = an.bones[an._findName('middle_01_r_')];
    if (!idx || !pky || !mid) return;

    an.model.updateMatrixWorld(true);
    const invM = _m4.copy(an.model.matrixWorld).invert().clone();
    const charOf = (bone) => {
      bone.updateWorldMatrix(true, false);
      return new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(invM);
    };
    const wristC = charOf(b.handR.bone);
    const idxC = charOf(idx), pkyC = charOf(pky), midC = charOf(mid);

    const shaftC = idxC.clone().sub(pkyC).normalize();          // butt -> tip
    /**
     * WHERE THE HAFT CROSSES THE HAND — fix round 1, A101.
     *
     * Round 1 put it at the midpoint of wrist->middle_01 (the metacarpal
     * centre) nudged 1 cm toward the fingers. That point is 0.038 m off the
     * KNUCKLE LINE, and the knuckle line is the axis a fist closes around: the
     * independent check `debug().knuckleToAxis` read 0.0381 m on every held
     * frame of every beat — above A101's own 0.03 m bar — while the gate only
     * looked at `palmToAxis`, which is derived from this same offset and is
     * therefore 0 whatever value it takes. The judge was right that the gate
     * could not fail; it was also right that the number it did not gate was
     * out of band.
     *
     * A haft in a closed fist lies in the grip crease, about 1.5 cm proximal
     * of the knuckle line (`lance-grip-closeup.jpg`: the shaft sits in the
     * fingers with the thumb over it, not back at the wrist). So the axis is
     * placed on the knuckle-line midpoint, backed off toward the wrist along
     * the hand's own long axis — which puts `knuckleToAxis` at 0.015 m by
     * construction AND is 2.3 cm closer to where a hand actually holds a pole.
     */
    const palmC = idxC.clone().add(pkyC).multiplyScalar(0.5);   // knuckle-line centre
    const fingerC = midC.clone().sub(wristC).normalize();       // wrist -> fingers
    palmC.addScaledVector(fingerC, -0.015);                     // into the grip crease

    const invWh = b.handR.W.clone().invert();
    /** shaft axis in HAND-LOCAL space (rotation only: scale-free) */
    this.gripDirL = shaftC.clone().applyQuaternion(invWh).normalize();
    /** palm centre as a hand-local METRIC offset (divided by bone scale at use) */
    this.palmOffL = palmC.clone().sub(wristC).applyQuaternion(invWh);
    /** the quaternion that takes the lance's +Z onto `gripDirL` */
    this.gripQ = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, this.gripDirL);
    /** published for the gates: the hand's grip axis in char space at bind */
    this.gripAxisChar = shaftC.clone();

    /* THE LEFT HAND'S GRIP, derived the same way from ITS bones: pinky -> index
     * along the haft (index toward the blade), the palm centre on the axis. */
    const idxL = an.bones[an._findName('index_01_l_')];
    const pkyL = an.bones[an._findName('pinky_01_l_')];
    const midL = an.bones[an._findName('middle_01_l_')];
    this._knuckleL = idxL && pkyL ? { i: idxL, p: pkyL } : null;
    if (idxL && pkyL && midL && b.handL) {
      const wL = charOf(b.handL.bone), iL = charOf(idxL), pL = charOf(pkyL), mL = charOf(midL);
      const invWl = b.handL.W.clone().invert();
      const pc = iL.clone().add(pL).multiplyScalar(0.5);
      pc.addScaledVector(mL.clone().sub(wL).normalize(), -0.015);
      this.gripDirLL = iL.clone().sub(pL).normalize().applyQuaternion(invWl).normalize();
      this.palmOffLL = pc.sub(wL).applyQuaternion(invWl);
    } else {
      this.gripDirLL = new THREE.Vector3(-this.gripDirL.x, this.gripDirL.y, this.gripDirL.z);
      this.palmOffLL = new THREE.Vector3(-this.palmOffL.x, this.palmOffL.y, this.palmOffL.z);
    }

    /* ---------------------- the back socket, from the rest pose ----------- */
    const spineE = b.spine2 || b.spine4;
    this.socketBone = spineE.bone;
    /** The stowed line (char space), when no stow kit is worn: R10's diagonal. */
    this.socketButt = new THREE.Vector3(0.30, 0.82, -0.20);
    this.socketDir = new THREE.Vector3(-0.54, 0.84, 0.03).normalize();
    /** ...and the kit's stowed bow in `spine_02`'s frame (see `_stowBowInit`). */
    this._bowLA = new THREE.Vector3(); this._bowLB = new THREE.Vector3();
    this._bowLine = this._stowBowInit();
    this._sockStamp = -1; this._sockRun = 0;

    /* -------------------------- the masked clips -------------------------- */
    this.set = null;
    this._clipNames = { swing: null, mirror: null, idle: null };
    this._buildClips();

    /** The live knuckle bones, for `debug()`'s independent grip check. */
    this._knuckle = { i: idx, p: pky };

    /**
     * Ponytail bones the haft must not pass through (A104, V48).
     *
     * FIX ROUND 1 — THE GUARD WAS BLIND TO WHAT THE GATE MEASURED. Round 1
     * gated `debug().hairClear`, a min over all 32 `dyn_hairBack*` bones, but
     * built the per-frame guard from four of them (`dyn_hairBackMain_02..05`).
     * The argmin on light 3 was never in that set — it was
     * `dyn_hairBackMain_06_end`, `dyn_hairBackSide_04_r` and
     * `dyn_hairBackSide_05_r` on four filmed chains — so `_clearDeficit()`
     * could not see, and therefore could not push away from, the strands it
     * was failing on. (The `!endsWith('_end')` filter never excluded anything
     * either: the rig's names carry a numeric suffix, so `..._06_end_0366` is
     * in the list. Both sets are now literally the same array.)
     *
     * Cost is paid the other way round instead: the positions are read ONCE
     * per frame into a flat buffer and the guard's four passes read the
     * buffer, so 32 bones cost less than round 1's four bones × four passes.
     */
    this._hairBones = [];
    for (const n in an.bones) {
      if (TAIL_RE.test(n)) this._hairBones.push(an.bones[n]);
    }
    /** char-space xyz of every `_hairBones` entry, refreshed once per pose. */
    this._hairPos = new Float32Array(this._hairBones.length * 3);
    this._hairN = this._hairBones.length;
    /** index into `_hairBones` of the strand the last guard pass acted on. */
    this._hairArgmin = -1;

    /* ------------------- the hand-over blend (A102) ---------------------- */
    /** 1 = the prop is at its authored transform; < 1 = mid hand-over. */
    this._carryB = 1;
    this._carryP = new THREE.Vector3();
    this._carryQ = new THREE.Quaternion();
    this._carryS = new THREE.Vector3(1, 1, 1);
    /* hand-over convergence (see `_grabSettle`); `needsGrab` is read by
     * `melee.js::_waitForHand` and must exist before the first update. */
    this.needsGrab = false;
    this._gsN = 0;
    this._gsBest = 9;
    this._gsStall = 0;
    this._carryDur = CARRY_T;
    this._cbFrame = -1; this._cbBudget = 1;
    /** last frame's haft tip in its parent's frame, metres (A102 slide read) */
    this._tipLocal = new THREE.Vector3();
    this._tipLocalOk = false;
    /** where on the haft the hand actually took it (fraction from the butt) */
    this._grabFrac = GRAB_FRAC;
    this._recoil = 0;
    this._guardOff = new THREE.Vector3();
    this._windOn = false;
    this._prevBeat = null;
    /* R48 c: every field the frame writes, declared here with the value the lazy
     * code would have made (an added property is a new hidden class, and every
     * optimised reader of the old one is thrown away on the frame it appears);
     * the pose records are born decimal like the rest (`decimalFields`). */
    this._windFrom = decimalFields({ hand: [0.5, 0, 0], shaft: [0.5, 0, 1], lh: [0.5, 0, 0], lhOn: 0, lhW: 0, yaw: 0, pitch: 0, roll: 0, py: 0, dz: 0 });
    this._u = decimalFields({ yaw: 0, pitch: 0, roll: 0, py: 0, dz: 0, lhOn: 0, lhW: 0, clipU: 0, armLift: 0 });
    this._lastDt = 1 / 60;
    this._prevPhase = null;
    this._prevSwing = false;
    this._guardOn = false;
    this._strideW = 0;
    this._ahT = 1;
    this._pfN = 0;
    this._idleT = 0;
    /* the left hand's seat, kept for `postFix` (fix round 1, `_seatLeft`) */
    this._lhOnW = 0;
    this._lhArmW = 0;
    this._lhOnWant = 0;
    this._lhSOn = 0;
    this._lhReachLack = 0;
    this._lhFree = new THREE.Vector3();
    this._weldSwing = false;
    this._weldWas = false;

    this.ok = true;
    register({
      id: 'anim/meleeLayer', file: 'src/entities/anim/meleeLayer.js',
      owner: 'melee', rig: 'brea', convention: 'BoneSpace + ClipLayer',
      status: 'migrated', layers: this.set ? this.set.order.length : 0,
      gripFrac: GRIP_FRAC,
    });
    decimalFields(this);
    decimalFields(this._dbg);
  }

  /* ========================== clip plumbing ============================== */

  /**
   * Bake `Sword_Attack` / `Sword_Idle`, cut every track that is not upper body,
   * and hand the result to anim-core as ADDITIVE ClipLayers.
   *
   * Additive is the whole trick. `locomotion.js` normalises its own weights to
   * 1 on every bone it drives, so an ordinary override action sharing those
   * bindings would only ever reach `w / (1 + w)` of the pose. An additive
   * action accumulates on three's second accumulator and is applied at exactly
   * its own weight on top of the finished locomotion pose — so `weight = 0.55`
   * means 55 % of the sword clip's delta-from-its-own-first-frame, whatever the
   * legs happen to be doing underneath. The mask does the rest: with no leg
   * tracks in the clip at all, the stride is untouched by construction.
   */
  _buildClips() {
    const an = this.an;
    if (!an.lib || !an.mixer) return;
    let atk = null, idle = null;
    try {
      atk = an.lib.get('swordAttack');
      idle = an.lib.get('swordIdle');
    } catch { atk = null; }
    if (!atk && !idle) return;

    this.set = new ClipLayerSet(an.mixer, { name: 'hero-melee', owner: 'melee' });
    const add = (name, entry, mirror) => {
      if (!entry?.clip) return;
      const clip = this._mask(entry.clip, name, mirror);
      if (!clip || !clip.tracks.length) return;
      this.set.add(name, clip, {
        mode: 'additive', external: true, scrubbed: true, loop: true,
      });
      this._clipNames[mirror ? 'mirror' : (name === 'meleeIdle' ? 'idle' : 'swing')] = name;
    };
    add('meleeSwing', atk, false);
    add('meleeSwingM', atk, true);
    add('meleeIdle', idle, false);
    this._clipNames.mirror = this.set.has('meleeSwingM') ? 'meleeSwingM' : this._clipNames.swing;
    this._clipNames.swing = this.set.has('meleeSwing') ? 'meleeSwing' : null;
    this._clipNames.idle = this.set.has('meleeIdle') ? 'meleeIdle' : null;
  }

  /**
   * Upper-body mask + optional axial mirror, applied to the BAKED clip's
   * tracks. The mirror is the real thing, not a sign flip on a euler: for a
   * rotation `R` expressed in character space the sagittal mirror is
   * `(x, -y, -z, w)`, and a bone's local quaternion is carried into and out of
   * char space through its PARENT's bind orientation, which for the axial
   * chain is itself sagittally symmetric. So `q' = Wp⁻¹ · M(Wp · q)`. Only
   * axial bones are mirrored — mirroring a clavicle or an arm would need the
   * left/right tracks swapped, and the right arm is not in this mask at all
   * (it is solved by IK against the beat table).
   */
  _mask(clip, name, mirror) {
    const an = this.an;
    const tracks = [];
    for (const tr of clip.tracks) {
      const bone = tr.name.slice(0, tr.name.indexOf('.'));
      if (!MASK_PREFIX.some((p) => bone.startsWith(p))) continue;
      const axial = AXIAL_PREFIX.some((p) => bone.startsWith(p));
      if (!mirror || !axial || !tr.name.endsWith('.quaternion')) {
        tracks.push(tr.clone());
        continue;
      }
      const e = an._entries[bone];
      const parent = e?.bone?.parent;
      const pe = parent ? an._entries[parent.name] : null;
      const t2 = tr.clone();
      if (!pe) { tracks.push(t2); continue; }
      const Wp = pe.W, invWp = _q3.copy(Wp).invert();
      const v = t2.values;
      for (let i = 0; i < v.length; i += 4) {
        _q1.set(v[i], v[i + 1], v[i + 2], v[i + 3]);
        _q2.copy(Wp).multiply(_q1);              // -> char
        _q2.set(_q2.x, -_q2.y, -_q2.z, _q2.w);   // sagittal mirror
        _q1.copy(invWp).multiply(_q2);           // -> local
        v[i] = _q1.x; v[i + 1] = _q1.y; v[i + 2] = _q1.z; v[i + 3] = _q1.w;
      }
      tracks.push(t2);
    }
    if (!tracks.length) return null;
    const out = new THREE.AnimationClip(`${name}`, clip.duration, tracks);
    out.__maskedFrom = clip.name;
    return out;
  }

  /* ========================== lance attachment =========================== */

  /** melee.js hands the prop over once; this layer owns where it lives. */
  /**
   * Hand the layer the prop: butt at its origin, +Z along the haft to the tip,
   * authored at real length (`propScale` 1: the Round-4 SCALE is retired, M9).
   * `grip` / `grip2` are the two wrap marks as fractions of the haft from the
   * butt (the GLB's sockets; bible §5.3: 0.20 / 0.55).
   */
  attachLance(group, length, propScale = 1, marks = null) {
    this.lance = group || null;
    if (length > 0.2) this.length = length;
    this.propScale = propScale > 1e-3 ? propScale : 1;
    if (marks?.grip > 0.05 && marks.grip < 0.5) this.gripFrac = marks.grip;
    this._lhK = marks?.grip2 > marks?.grip ? ((marks.grip2 - this.gripFrac) * this.length) / LH_ON_REF : this.length / 1.55;
    if (this.lance) { this.lance.userData.meleeLen = this.length; this._toBack(); }
  }

  /** The kit's carry solve (`src/hero/carry.js`), when she wears the kit. */
  get _carry() { return this.ctx.player?.hero?.kit?.carry || null; }

  /**
   * The stowed line right now, char space: butt into `outP`, butt->tip unit
   * into `outD`. While the kit's copy is collapsed (a draw or a holster) the
   * kit no longer solves it, so the layer runs the same solve, once per
   * animator step, for the line the hand is going to.
   */
  _liveSocket(outP, outD) {
    const c = this._carry;
    if (!c) {
      const an = this.an, K = this._sockBind0;
      if (!K) { outP.copy(this.socketButt); outD.copy(this.socketDir); return; }
      an._charOf(this.socketBone, outP); an._liveW(this.socketBone, _q1);
      outP.add(_b.copy(K.p).applyQuaternion(_q1));
      outD.copy(K.d).applyQuaternion(_q1).normalize();
      return;
    }
    const kit = this.ctx.player.hero.kit;
    if ((kit.hidden & 1) && this._sockStamp !== this._sockRun && this.an.skull) {
      this._sockStamp = this._sockRun;
      c.update(this.an, 0, false, this._lastDt || 1 / 60, null);
    }
    outP.copy(c.butt);
    outD.subVectors(c.tip, c.butt).normalize();
  }

  /** The prop on the stowed line (hidden while holstered; see `_settleLance`). */
  _poseHolstered() {
    const g = this.lance;
    const bone = this.socketBone;
    if (!g || !bone) return;
    const an = this.an;
    this._liveSocket(_grip, _c);
    const bs = this._boneScale(bone);
    g.scale.setScalar(this.propScale / bs);
    an._charOf(bone, _a);
    an._liveW(bone, _q1);
    _q2.copy(_q1).invert();
    g.position.copy(_b.subVectors(_grip, _a)).applyQuaternion(_q2).multiplyScalar(1 / bs);
    _q3.setFromUnitVectors(Z_AXIS, _c);
    g.quaternion.copy(_q2).multiply(_q3);
    this._blendCarry(g);
  }

  /**
   * The stowed bow's line in `spine_02`'s frame, read once off the kit's bind
   * (cold; the constructor runs in the bind pose): its two limb tips. The free
   * arm of light-3 and A100 / A104 measure against it. False with no kit.
   */
  _stowBowInit() {
    const an = this.an, kit = this.ctx.player?.hero?.kit, m = kit?.meshes?.[0], bone = this.socketBone;
    if (!m || !bone) return false;
    const P = m.geometry.getAttribute('_piece'), pos = m.geometry.getAttribute('position');
    if (!P || !pos) return false;
    let lo = -1, hi = -1;
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & 2) === 0) continue;
      if (lo < 0 || pos.getY(i) < pos.getY(lo)) lo = i;
      if (hi < 0 || pos.getY(i) > pos.getY(hi)) hi = i;
    }
    if (lo < 0) return false;
    an.model.updateMatrixWorld(true);
    const inv = _m4.copy(bone.matrixWorld).invert().clone();
    m.getVertexPosition(lo, this._bowLA); m.localToWorld(this._bowLA); this._bowLA.applyMatrix4(inv);
    m.getVertexPosition(hi, this._bowLB); m.localToWorld(this._bowLB); this._bowLB.applyMatrix4(inv);
    return true;
  }

  /** The stowed bow's line, char space; false with no kit. */
  _bowChar(a, b) {
    /* the kit is worn after this layer is built: look again until it is there */
    if (!this._bowLine) { this._bowLine = this._stowBowInit(); if (!this._bowLine) return false; }
    const kit = this.ctx.player?.hero?.kit;
    if (kit && (kit.hidden & 2)) return false;   // the bow is in her hand
    const bone = this.socketBone, an = this.an;
    bone.updateWorldMatrix(true, false);
    _m4.copy(an.model.matrixWorld).invert().multiply(bone.matrixWorld);
    a.copy(this._bowLA).applyMatrix4(_m4);
    b.copy(this._bowLB).applyMatrix4(_m4);
    return true;
  }

  /**
   * WEIGHT ON THE HIT (feel, plan §2 W1). The blade stopped on something: the
   * haft is driven back through her hands a little and comes out again. Spent
   * on GAME time, so the hit-stop holds it at the machine and it plays after.
   */
  onHit(heavy) { this._recoil = heavy ? RECOIL_HEAVY : RECOIL_LIGHT; }

  _toBack() {
    if (!this.lance || !this.socketBone) return;
    if (this.lance.parent !== this.socketBone) {
      this._captureCarry(this.socketBone);
      this.socketBone.add(this.lance);
    }
    this._held = false;
  }

  _toHand() {
    const node = this.an.b.handR?.bone;
    if (!this.lance || !node) return;
    if (this.lance.parent !== node) {
      this._captureCarry(node);
      node.add(this.lance);
    }
    this._held = true;
  }

  /**
   * The haft's length in the PROP's OWN local units, i.e. what bow.js built.
   *
   * FIX ROUND 2, and a real bug this lane shipped the moment the prop was
   * scaled: every "point at z = length" read below transforms a point through
   * the lance's own matrix, and that matrix carries `propScale`. Feeding it
   * `this.length` (metres) asks for a point 0.82 of the way up the haft and
   * calls it the tip — which is exactly what made `debug().bowClear` read
   * 0.070 m while the servo, measuring the real segment, read 0.136 m. Local
   * offsets use this; everything in character space uses `this.length`.
   */
  get _localLen() { return this.length / (this.propScale || 1); }

  /** Uniform world scale of a bone (the rig is not authored in metres). */
  _boneScale(bone) {
    bone.updateWorldMatrix(true, false);
    _a.setFromMatrixScale(bone.matrixWorld);
    return Math.max(1e-6, _a.x);
  }

  /**
   * Held: the haft passes through the palm centre along the hand's own grip
   * axis, with `frac` of its length behind the hand. `frac` is animated during
   * the draw (the hand slides from GRAB_FRAC down to GRIP_FRAC as she pulls it
   * off her back) — which is also what makes the draw read as a draw rather
   * than a pop.
   */
  _poseHeld(frac) {
    const g = this.lance;
    const bone = this.an.b.handR?.bone;
    if (!g || !bone) return;
    const s = this._boneScale(bone);
    const inv = this.propScale / s;
    g.scale.set(inv, inv, inv);
    g.quaternion.copy(this.gripQ);
    // butt = palm - frac * L * shaftDir, in hand-local metres, then / scale
    _a.copy(this.gripDirL).multiplyScalar(-frac * this.length).add(this.palmOffL);
    g.position.copy(_a).multiplyScalar(1 / s);
    this._blendCarry(g);
  }

  /**
   * THE HAND-OVER IS CONTINUOUS, NOT INSTANT (fix round 1, A102).
   *
   * Round 1 re-parented the prop the frame the hand got within `GRAB_SNAP` of
   * the haft, and published the residual as `grabGap`. On a quiet box that was
   * 0.084 m; under the full concurrent suite the draw is 0.26 s rendered in
   * two or three frames, the arm's weight ramp has not finished, the hand is
   * still in flight, and the escape clause handed the lance over at whatever
   * gap was left — measured 0.111 m with a 1.13 m tip pop, against coded bars
   * of 0.10 m and 0.9 m. The gate failed for a real reason: the prop visibly
   * jumped, and how far it jumped depended on the frame rate.
   *
   * So the hand-over no longer moves the prop at all. On the frame the parent
   * changes, the prop's CURRENT world transform is captured in the new
   * parent's local frame; for the next `CARRY_T` seconds the written pose is
   * blended out of that capture into the authored one. World position and
   * orientation are therefore continuous ACROSS the re-parent by construction
   * — `grabGap` is 0, whatever the frame rate — and the residual the arm did
   * not close is spent as a short visible slide down the haft instead of as a
   * pop. Both numbers are published: `grabReach` is the honest "how far was
   * the hand from the haft when she took it", and A102 gates the slide's
   * per-frame world motion against the same budget as the swing.
   */
  _blendCarry(g) {
    if (this._carryB >= 1) return;
    if (this._carryDur === CARRY_T) {
      // first frame after the capture: the authored pose exists now, so the
      // residual — and therefore the duration — can finally be measured
      const span = this._carrySpan();
      this._carryDur = clamp(span / CARRY_RATE, CARRY_T, CARRY_MAX);
      this._dbg.carrySpan = span;
      this._dbg.carryDur = this._carryDur;
    }
    const k = this._carryB;
    g.position.lerp(this._carryP, 1 - k);
    g.quaternion.slerp(this._carryQ, 1 - k);
    g.scale.lerp(this._carryS, 1 - k);
  }

  /**
   * Capture the prop's live world transform in `parent`'s local frame, and
   * work out how long the slide out of it is allowed to take.
   *
   * THE BLEND IS RATE-LIMITED BY THE TIP, not by the clock. A hand-over whose
   * residual is mostly ROTATION moves the butt a few centimetres and the tip
   * most of two metres — 1.85 m of lever. Blending that over a fixed 0.16 s
   * puts 2.15 m of tip travel into a 64 ms frame on a loaded box, which is
   * four times §4's per-frame budget and exactly the teleport the clause is
   * about (A102 measures it). So the duration is stretched until the worst
   * point on the haft is moving under `CARRY_RATE`, and the slide reads as her
   * turning the lance into her grip rather than as a snap.
   */
  _captureCarry(parent) {
    const g = this.lance;
    if (!g || !parent) return;
    g.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    _m4.copy(parent.matrixWorld).invert().multiply(g.matrixWorld);
    _m4.decompose(this._carryP, this._carryQ, this._carryS);
    this._carryB = 0;
    this._carryDur = CARRY_T;
  }

  /** Worst-case travel of the haft's far end across the rest of the blend. */
  _carrySpan() {
    const g = this.lance;
    if (!g) return 0;
    // the authored pose is already written into `g` when this runs
    _q1.copy(g.quaternion).invert().multiply(this._carryQ);
    const ang = 2 * Math.acos(clamp(Math.abs(_q1.w), -1, 1));
    // METRES, not parent units: a bone-local offset times the bone's own world
    // scale. (Round 1 multiplied by `g.scale.x`, which is the prop's scale —
    // the reciprocal of the bone's, times propScale.)
    const s = this._boneScale(g.parent || this.socketBone);
    return ang * this.length + g.position.distanceTo(this._carryP) * s;
  }

  /* ============================== the pose =============================== */

  /**
   * @param {number} dt
   * @param {object} st  published by `melee.js`:
   *   { stance:'holstered'|'draw'|'ready'|'swing'|'holster', drawK, phase, k,
   *     combo, heavy, aimYaw, contactK }
   */
  update(dt, st) {
    if (!this.ok) return;
    const an = this.an;
    const b = an.b;
    const stance = st?.stance || 'holstered';
    const D = this._dbg;
    D.stance = stance;
    D.phase = st?.phase || 'idle';
    D.drawK = st?.drawK ?? 0;   // what this frame was POSED at (V49's captions)

    /* the hand-over blend (see `_blendCarry`) and this frame's ponytail */
    /* THE HAND-OVER BLEND IS ALSO CAPPED PER RENDERED FRAME (fix round 2).
     * `_carryDur` rate-limits the blend in SECONDS, which is the right idea
     * and the wrong clock: the sim runs several fixed sub-steps inside one
     * rendered frame, so a 0.16-0.55 s blend can be spent entirely between two
     * frames the player sees and the prop covers its whole residual in one of
     * them (measured 1.21-1.95 m of tip across the hand-over). It may now
     * advance at most `CARRY_STEP_MAX` of itself per RENDERED frame; above
     * ~20 fps the seconds run out first and nothing changes. */
    if (this._carryB < 1) {
      const fid = this.ctx.renderer?.info?.render?.frame;
      const id = typeof fid === 'number' ? fid : Math.floor(performance.now() / 8);
      if (id !== this._cbFrame) { this._cbFrame = id; this._cbBudget = CARRY_STEP_MAX; }
      const step = Math.min(dt / (this._carryDur || CARRY_T), Math.max(0, this._cbBudget));
      this._cbBudget -= step;
      this._carryB = Math.min(1, this._carryB + step);
      /* ...AND ON THE DRAW IT IS THE PULL ITSELF (round 6, ruling R5). The
       * blend is at least as far along as the pull leg, and exactly 1 when the
       * draw clock ends — so the frame the draw completes is the frame the
       * grip is rigid at `GRIP_FRAC` (`handoverDone`), and melee.js starts a
       * queued swing on it, never into the slide. The draw clock is itself
       * capped per rendered frame (melee.js STANCE_STEP_MAX), so this cannot
       * spend the blend faster than the draw is drawn. */
      if (stance === 'draw' && this._held) {
        const g0 = clamp(this._grabK ?? 0.55, 0, 0.95);
        const pk = clamp(((st?.drawK ?? 0) - g0) / Math.max(0.05, 1 - g0), 0, 1);
        const pb = PULL_EASE(pk);
        if (pb > this._carryB) this._carryB = pb;
      }
    }
    this._sockRun++;
    this._cacheHair();
    this._lastDt = dt;
    if (this._recoil > 1e-4) this._recoil *= Math.exp(-RECOIL_RATE * dt); else this._recoil = 0;

    /* THE DRAW STARTS WHERE THE ARM IS (round 6): capture it on the first
     * frame of a draw, before this layer has touched the arm. */
    if (stance === 'draw' && this._prevStance !== 'draw') this._captureFrom();
    /* ...and a holster starts where the arm WAS: from the guard, or (round 6)
     * from a follow-through an aim cut short — not from the READY key */
    if (stance === 'holster' && this._prevStance !== 'holster') this._captureHolsterFrom();
    this._prevStance = stance;
    /* the arm path — the draw and the holster — carries the R8 elbow bound */
    this._pathOn = stance === 'draw' || stance === 'holster';

    /* THE POST-SWING SETTLE CLOCK (fix pass 1 — see `SETTLE_T`). It runs only
     * from a swing into the guard; a draw, a holster or the holstered carry
     * parks it at the end so nothing settles out of a pose that never swung. */
    if (stance === 'swing') this._settleT = 0;
    else if (stance === 'ready') this._settleT = Math.min(SETTLE_T, this._settleT + dt);
    else this._settleT = SETTLE_T;

    /* --- how much of the upper body does melee own this frame? --- */
    /* ROUND 6: the draw takes the arm faster (it starts from the arm's own
     * pose now, so there is nothing to blend away from), and the holster
     * hands it back only after the hand has come down her side (see `_blend`). */
    const want = stance === 'holstered' ? 0
      : stance === 'draw' ? smoothstep(st.drawK ?? 0, 0.0, 0.20)
        : stance === 'holster' ? 1 - smoothstep(st.drawK ?? 0, 0.86, 1.0)
          : 1;
    this.w = damp(this.w, want, stance === 'holstered' ? 9 : (stance === 'draw' ? 30 : 16), dt);
    if (want === 0 && this.w < 0.01) this.w = 0;
    const w = this.w;
    D.w = w;

    /* --- swing direction: melee aims down the camera, so the pose does too - */
    const wantYaw = clamp(st?.aimYaw ?? 0, -0.7, 0.7);
    this._aimYaw = damp(this._aimYaw, w > 0.01 ? wantYaw : 0, 11, dt);

    if (w <= 0.001) {
      // `_stance` never ran, so withdraw last frame's pelvis offset rather than
      // leaving the animator adding a stale one for ever
      this.pelvisDx = 0; this.pelvisDy = 0; this.pelvisDz = 0; this._pelvisYawNow = 0; this._stanceW = 0; this._stanceA = 0; this._stanceMix = 0;
      this._guardOff.set(0, 0, 0);
      this._clipWeights(null, 0, 0); this._settleLance(stance, st); return;
    }

    /* ------------------------ resolve the beat ------------------------ */
    const beat = st.heavy ? HEAVY : BEATS[clamp(st.combo | 0, 0, BEATS.length - 1)];
    D.beat = stance === 'swing' ? beat.id : 'ready';
    /* A NEW SWING STARTS FROM WHERE SHE IS (a combo cuts in on a recover, a held
     * light turns into a heavy): the cock leg opens from the last pose drawn,
     * not from the guard, so a beat change is never a jump. */
    if (stance === 'swing' && this._swingOut && st.phase === 'windup') {
      const id = beat.id;
      if (this._prevBeat !== id || this._prevPhase !== 'windup') {
        const was = this._prevSwing;
        if (was) {
          const f = this._windFrom;
          const so = this._swingOut;
          for (let i = 0; i < 3; i++) { f.hand[i] = so.hand[i]; f.shaft[i] = so.shaft[i]; f.lh[i] = so.lh[i]; }
          f.lhOn = so.lhOn; f.lhW = so.lhW; f.yaw = so.yaw; f.pitch = so.pitch; f.roll = so.roll; f.py = so.py; f.dz = so.dz;
          this._windOn = true;
        } else this._windOn = false;
      }
    } else if (stance !== 'swing') this._windOn = false;
    this._prevBeat = stance === 'swing' ? beat.id : null;
    this._prevPhase = stance === 'swing' ? st.phase : null;
    this._prevSwing = stance === 'swing';
    const u = this._blend(stance, st, beat);
    /* the recoil: back along the haft, the far end up a touch */
    if (this._recoil > 1e-4) {
      _hand.addScaledVector(_shaft, -this._recoil);
      u.pitch -= this._recoil * 1.6;
    }   // fills _hand/_shaft/_lh + torso
    // where her drive SHOULDER is before the animator moves the body under
    // it (see `_pelvisShift`) — read after the torso turns, just below
    /* the swing aimed at the machine and kept out of the ground (round 6):
     * BEFORE the torso turns, so the shoulder girdle below follows the hand
     * the aim actually asks for (the residual pass after the arm solve takes
     * out the difference the torso's own turn makes to the pivot) */
    if (stance === 'swing') {
      this._strikeAim(st, beat, w);
      this._groundClear(st);
      u.armLift = (_hand.y - 1.0) * 2;
    } else if (stance === 'ready' || this._held) {
      /* ...and the GUARD too (round 6): its blade is authored forward-down at
       * shin height on flat ground (canon M7), so on a 25 deg rise it sat
       * 0.04-0.23 m INSIDE the hillside after every swing uphill (probed on
       * the r5 skeptic's slope, Oct 2) — and so did the last frames of a DRAW
       * (the pull ends on that guard: 0.04-0.26 m in, a click from holstered
       * uphill) and the first of a holster. Whenever the lance is in her hand.
       * Flat ground: untouched. */
      this._groundClear(st);
    }

    /* ------------------------- the clip layer ------------------------- */
    if (stance === 'swing') {
      const cw = beat.clipW * w;
      const t = beat.clip[0] + (beat.clip[1] - beat.clip[0]) * u.clipU;
      this._clipWeights(beat.mirror ? this._clipNames.mirror : this._clipNames.swing, cw, t);
    } else {
      this._clipWeights(null, 0, 0, this._clipNames.idle, 0.22 * w);
    }

    /* ------------------- the lower body (fix pass 2) ------------------- */
    // Before the torso, because it publishes the pelvis offset the animator
    // adds to `pdy` on the same frame (see `_stance` and STANCE).
    this._stance(dt, w, u, beat, stance);

    /* --------------------- procedural torso rotation ------------------ */
    // spine_01..03 carry the twist over the hips, which is the axis A102 measures
    // (pelvis -> spine_03); the pelvis's own turn is `_stance`'s, above.
    const yaw = u.yaw * w, roll = u.roll * w;
    // budgeted against the stride's own lean while she is moving (JOG_TORSO_CAP)
    /* ...plus the LEAN INTO a target the blade cannot otherwise reach (round
     * 6, R7): reach comes from the spine and the step (canon, R3), so when
     * the aimed hull point is beyond this beat's reach the spine pitches in by
     * up to `AIM_LEAN_MAX` over the release and the contact. */
    /* the guard's forward lean is for standing: on the move the stride already
     * carries the trunk, and the lance rides lower and closer */
    const guardK = stance === 'swing' ? 1 : 1 - 0.8 * (this._strideW || 0);
    const pitch = this._stridePitch(u.pitch * w * guardK + (stance === 'swing' ? this._aimLean(st, beat, w) : 0), dt);
    an._rotL(b.spine1, Y_AXIS, yaw * 0.30);
    an._rotL(b.spine2, Y_AXIS, yaw * 0.36);
    an._rotL(b.spine3, Y_AXIS, yaw * 0.34);
    an._rot(b.spine1, X_AXIS, pitch * 0.30);
    an._rot(b.spine2, X_AXIS, pitch * 0.38);
    an._rot(b.spine3, X_AXIS, pitch * 0.32);
    an._rot(b.spine2, Z_AXIS, roll * 0.5);
    an._rot(b.spine3, Z_AXIS, roll * 0.5);
    /* HER EYES STAY ON WHAT SHE IS FIGHTING (melee W1, filmed: the trunk's turn and
     * lean carried the head with them, and the guard and every contact read as a
     * woman looking at her own feet). The neck and the skull take out most of the
     * chest's turn and lean, so she faces down the haft however bladed she stands;
     * `HEAD_LEAD` of the turn stays, because the head does lead the swing. */
    {
      const ty = (yaw + (this._pelvisYawNow || 0) * w) * (1 - HEAD_LEAD);
      const tp = pitch;
      an._rot(b.neck1, Y_AXIS, -ty * 0.42);
      an._rot(b.head, Y_AXIS, -ty * 0.50);
      an._rot(b.neck1, X_AXIS, -tp * HEAD_LEVEL * 0.45);
      an._rot(b.head, X_AXIS, -tp * HEAD_LEVEL * 0.55);
    }
    // shoulder girdle follows the drive arm
    // (and further when the swing is aimed up at a tall machine: the girdle
    // rises into a reach over the head — round 6, R7)
    an._rot(b.clavR, Z_AXIS, -(0.10 + 0.10 * (this._dbg.aimW || 0)) * w * clamp(u.armLift, -1, 1.5));
    an._rotL(b.clavR, Y_AXIS, -0.16 * yaw);
    an._rotL(b.clavL, Y_AXIS, -0.10 * yaw);

    /* ---------------------------- the arms ---------------------------- */
    an._headFrame();
    an._charOf(b.upArmR.bone, this._pelvisPre);
    /* THE GUARD IS FOR A HAFT THAT IS IN HER HAND.
     *
     * It stays off while she is REACHING for the socket — the stowed haft lies
     * along her back by design, so a guard tuned for a swing reads the reach
     * pose as a violation and shoves the hand away from the thing it is trying
     * to grab (filmed in round 0: the re-parent gap went 0.085 -> 0.385 m).
     * But once the hand HAS it, the draw and the holster carry 1.1 m of butt
     * past her head and neck, and that is the tightest axial clearance in the
     * whole lane: A104's holster row measured 0.123 m against its own 0.12 bar
     * with the guard off there. So it runs for the carry legs too. */
    this._guardOn = stance === 'ready' || stance === 'swing'
      || (this._held && (stance === 'draw' || stance === 'holster'));
    this._strideHand(st, stance);
    /* A table is written over a standing trunk; a stride carries the chest and
     * the head well forward of it (0.2 m at a jog). The hands go with them. */
    if ((this._strideW || 0) > 0.01 && (stance === 'swing' || stance === 'ready')) {
      _hand.z += STRIDE_FWD * this._strideW;
      _lh.z += STRIDE_FWD * this._strideW;
      const rise = 1 - (1 - STRIDE_SHAFT_RISE) * this._strideW;
      if (_shaft.y > rise) { _shaft.y = rise; _shaft.normalize(); }
    }
    this._solveRight(w, u);
    /* THE CONTACT LANDS WHERE IT WAS AIMED (round 6, R7): the aim above bent
     * the beat's KEY toward the target, but the arm does not reach every key
     * and the wrist does not turn every haft, so the posed tip can sit 0.2-0.3
     * m off it. From the end of the strike leg through the contact hold the
     * posed tip is measured and the goal is turned by the residual about the
     * shoulder and solved once more — the strike homing onto the hull. */
    if (stance === 'swing' && this._aimResidual(st, w)) this._solveRight(w, u);
    /* ...and the blade stays out of the ground as POSED (the goal-side check
     * in `_groundClear` is a prediction; the arm clamps, the wrist limits and
     * the stance's pelvis drop, added after this layer, all move the tip) */
    if ((stance === 'swing' || stance === 'ready' || this._held) && this._groundResidual()) this._solveRight(w, u);
    /* ...and her ARM stays out of the machine (round 6, S5): the blade may
     * go into the hull it hits, the hand and forearm holding it may not. */
    this._armHullGuard(w, st);
    this._solveLeft(w, u);

    // fists: the drive hand is closed on the haft, the free hand open (canon:
    // "left arm empty, swept back and out, PALM OPEN")
    an._curlFingers(an._fingerR, 0.85 * w, 0.75 * w);
    an._curlFingers(an._fingerL, (0.12 + 0.70 * u.lhW) * w, (0.06 + 0.64 * u.lhW) * w);

    this._measure();
    this._settleLance(stance, st);
    /* THE REACH THIS BEAT ACTUALLY GETS (round 6, R7). The contact keys ask
     * for more hand than the arm has on some beats (the IK clamps at full
     * extension), so the tip lands 0.1-0.3 m short of the key's own reach —
     * and `melee._aimAt` picking a target at the KEY's reach put the blade
     * that far short of the machine. Measured on the contact hold of every
     * swing (shoulder to posed tip), per beat, and handed to `_aimAt`. */
    if (stance === 'swing' && st.phase === 'strike'
        && (st.k ?? 0) >= Math.max(0.10, (st.contactK ?? 0.7) - HIT_LEAD) && this.lance) {
      const i = st.heavy ? 3 : clamp(st.combo | 0, 0, 2);
      this.tipWorld(_eT);
      this.an.b.upArmR.bone.getWorldPosition(_eS);
      // the arm's OWN reach: learned only off contacts the aim did not have
      // to lengthen or shorten (`_pullNow`), or one short stab would teach
      // it the arm is shorter than it is
      const r = _eT.distanceTo(_eS);
      if ((this._pullNow || 0) < 0.02) {
        this._reachSeen[i] = this._reachSeen[i] > 0 ? this._reachSeen[i] * 0.5 + r * 0.5 : r;
      }
      D.reachSeen = r;
    }
  }

  /** The shoulder-to-tip reach this beat's contact actually achieved on the
   *  last swings, metres, or 0 before it has been seen (round 6). */
  contactReach(heavy, combo) {
    return this._reachSeen ? this._reachSeen[heavy ? 3 : clamp(combo | 0, 0, 2)] : 0;
  }

  /**
   * Park the prop: on the back socket, or in the hand at `frac` of the haft.
   *
   * RUNS LAST, after the arm solve, and that is load-bearing. The animator
   * resets every non-clip bone and re-applies the mixer pose at the TOP of its
   * frame, so at the start of this method's caller the hand is still wherever
   * the locomotion clip put it — the arm this layer authored last frame is
   * gone. The first version tested the hand-over proximity there and measured
   * the idle hand every time: a constant ~0.94 m gap, so the grab never fired
   * on proximity and always fell through to its escape clause. Reading the
   * hand AFTER `_solveRight` reads the hand the renderer will draw.
   *
   * THE HAND-OVER IS EVENT-DRIVEN, NOT SCHEDULED. Round 0 re-parented at a
   * fixed `drawK` of 0.55; the draw is 0.26 s and this box renders it in five
   * frames, so on the scheduled frame the arm was still travelling and the
   * prop would have jumped 0.97 m. `_reparentGap` is exactly "how far is the
   * hand from the haft right now", so the hand-over waits until that is under
   * `GRAB_SNAP`. `frac` holds at the grab point until then, so the target the
   * arm is chasing cannot slide out from under it, and only slides down the
   * haft afterwards. `k >= 0.90` is the escape: a hand that never arrives
   * still gets its lance rather than reaching forever.
   *
   * FIX ROUND 1: THE ESCAPE NO LONGER COSTS A POP. Under the full concurrent
   * suite the draw renders in two or three frames, the arm's weight ramp has
   * not finished, and the escape fired with 0.111 m of residual — over A102's
   * 0.10 m bar, and a 1.13 m tip pop with it, neither of which happened on a
   * quiet box. So the residual is no longer paid at the re-parent: the prop's
   * world transform is captured and blended (see `_blendCarry`), which makes
   * the hand-over continuous at any frame rate and turns the leftover into a
   * short slide down the haft. Three numbers are published rather than one:
   * `grabReach` (how far the hand was from the haft — the honest reach),
   * `grabGap` (the world-space discontinuity at the re-parent, which is what
   * §4's teleport clause is about), and `carryBlend`.
   */
  /**
   * THE PER-BEAT STANCE (fix pass 2 — see `STANCE` for the defect it closes).
   *
   * Four decisions, each of them a measurement rather than a preference:
   *
   * 1. WHAT IT DRIVES. thigh/calf/foot pitch, thigh abduction, and a pelvis
   *    offset published to the animator. Nothing else: no pelvis YAW (that
   *    swings the planted feet — A105's 0.08 m) and no root translation (the
   *    step-in is a velocity impulse the controller collides, `melee._stepIn`).
   *
   * 2. WHY IT IS SAFE TO ROTATE A LEG HERE AT ALL. This layer runs at
   *    `playerAnimator` line ~1557 and `_groundConform` at ~1581, so the foot
   *    lock, the per-foot flat solve and the pelvis clamp all run AFTER it and
   *    correct for it — a knee bend moves the ball, the lock puts the ball back
   *    with a hip rotation, and the clamp lowers the hips until the higher
   *    planted foot is on the ground. That is a crouch, which is what is wanted.
   *    The precedent is the animator's own tall-grass sink, plant-and-turn,
   *    stop-settle and flinch brace, which drive exactly these bones the same way.
   *
   * 3. WHEN IT STANDS DOWN. `an._strideT` is the animator's own "neither
   *    locomotion stance weight has dropped for a tenth of a second", i.e. both
   *    feet welded to the floor. At a jog it is 0 every frame and this term is
   *    0 with it, so A105's jogging row and A13 are untouched by construction —
   *    the same standing-down test `_stanceStep` uses. Damped at 7/s so nothing
   *    pops when she starts or stops moving.
   *
   * 4. HOW HARD. `STANCE_ENV(clipU)` — loads into the cock, full at contact,
   *    held through the follow-through, released on the return to guard — times
   *    the layer's own `w`, so a draw or a holster carries none of it.
   */
  _stance(dt, w, u, beat, stance) {
    const an = this.an, b = an.b, D = this._dbg;
    if (!b.thighL || !b.thighR || !b.calfL || !b.calfR) {
      this.pelvisDx = 0; this.pelvisDy = 0; this.pelvisDz = 0; this._pelvisYawNow = 0; this._stanceA = 0; return;
    }
    /* The gate, one frame stale on purpose: `_stanceStep` writes `_strideT`
     * from inside `_groundConform`, which runs after this layer. A frame of
     * latency on "is the stride running" is invisible and reading it fresh
     * would mean running the conform first. */
    /* ...OR STANDING, SWINGING (fix round 1): the step-in's velocity floor blends a
     * little of the walk clip in, its stance weights dip under 0.40, `_strideT` reset
     * and the beat's stance damped out under a live contact: the judge filmed light-2
     * and light-3 landing on straight legs with the feet together. So a swing that
     * STARTS welded (standing) stays welded to its end; one started at a jog (the
     * stance weight already out) is untouched, which is what A105's stride needs
     * (keying it on `_moveW` instead read under 0.30 through jogging swings, f1). */
    if (stance === 'swing' && !this._weldWas) this._weldSwing = this._stanceW > 0.5;
    else if (stance !== 'swing') this._weldSwing = false;
    this._weldWas = stance === 'swing';
    const welded = ((an._strideT || 0) > 0.10 || this._weldSwing) ? 1 : 0;
    this._stanceW = damp(this._stanceW || 0, welded, 7, dt);
    /* THE HIPS TURN AND TRAVEL WITH THE BEAT (melee W1; `py` and `dz` on the pose
     * keys, continuous with them). The feet are planted by the conform, so a
     * turned and driven pelvis loads the legs instead of skating them, and the leg
     * rotations below are authored on the turned pelvis. Standing only: a stride
     * owns its hips (`_stanceW` is 0 at a jog). */
    {
      /* (nor a crouch's, nor a roll's) */
      const hw = w * this._stanceW * (1 - (an._crouchW || 0)) * (1 - (an._dodgeW || 0));
      this._pelvisYawNow = (u.py || 0) * hw;
      this.pelvisDz = (u.dz || 0) * hw;
      if (this._pelvisYawNow !== 0 && b.pelvis) an._rot(b.pelvis, Y_AXIS, this._pelvisYawNow);
    }
    const live = stance === 'swing' ? STANCE[beat.id] : (stance === 'ready' ? STANCE.ready : null);
    /* ...and she stands TALL to stab up at a tall machine (round 6, R7): a
     * swing the aim has bent up past ~12 deg (a Colossus's jaw, a Wader's
     * body) gives up most of the crouch — nobody sinks into a lunge to thrust
     * over their own head, and on a Colossus the heavy's 0.1 m of crouch was
     * 0.1 m of reach it did not have. Standing swings with no target, and
     * every gate staging them, are untouched (`aimPitchDeg` is 0). */
    const tall = clamp(((D.aimPitchDeg || 0) - 12) / 25, 0, 1);
    /* THE LEGS LIVE IN THE GUARD AND LOAD INTO THE BEAT (melee W1). `want` is how
     * much of a melee stance is on at all; `mixT` how far from the guard's stance
     * to this beat's: nothing through the cock's opening, full at the contact, gone
     * by the end of the recover. Round 4 scaled one key by an envelope, so the
     * knees straightened at the top of every swing and bent again for the strike. */
    const want = live ? w * this._stanceW * (1 - 0.8 * tall) * (1 - (an._crouchW || 0)) * (1 - (an._dodgeW || 0)) : 0;
    const mixT = stance === 'swing' ? STANCE_ENV(u.clipU) : 0;
    /* THE KEY OUTLIVES THE SWING BY AS LONG AS THE UNWIND TAKES: the rate limit
     * below is in RENDERED frames, so on a loaded box the mix can still be finite
     * when the state machine returns to the guard, and dropping the key there
     * would snap the legs in one frame. The last beat's key is held until it is
     * spent. */
    const key = stance === 'swing' ? live : (this._stanceMix > 0.002 ? this._stanceKey : STANCE.ready);
    /* A NEW KEY UNDER A LOADED STANCE IS A STEP TOO (round 5 fix pass 1): the feet
     * go where the new stance puts them. `rekey` re-captures the home off the new
     * key and a foot re-places once it is `STEP_TRIGGER_REKEY` out of it. */
    if (stance === 'swing' && this._stanceKey && live !== this._stanceKey && this._stanceMix > 0.02 && this._stanceA > 0.02) an.beginMeleeStep?.(true);
    if (stance === 'swing') this._stanceKey = live;
    /* RATE-LIMITED PER RENDERED FRAME (see `STANCE_STEP_MAX`): one budget per drawn
     * frame, not per sim sub-step, shared by the two numbers. */
    const fid = this.ctx.renderer?.info?.render?.frame;
    const fnow = typeof fid === 'number' ? fid : Math.floor(performance.now() / 8);
    if (fnow !== this._saFrame) { this._saFrame = fnow; this._saBudget = STANCE_STEP_MAX; }
    const dA = clamp(want - this._stanceA, -this._saBudget, this._saBudget);
    this._saBudget = Math.max(0, this._saBudget - Math.abs(dA));
    this._stanceA += dA;
    const dM = clamp(mixT - this._stanceMix, -this._saBudget, this._saBudget);
    this._stanceMix += dM;
    const a = this._stanceA, m = this._stanceMix;
    /* A STANCE CHANGE IS A STEP, SO SAY SO: `_stanceStep` unplants, lifts and
     * replants the foot the body has left behind (A105). Armed only while the
     * stance is actively loading: a settled stance must not hold a foot in flight. */
    if (Math.abs(dA) > 0.02 || (a > 0.02 && Math.abs(dM) > 0.02)) an.beginMeleeStep?.();
    // NOT `D.stance` — that is the melee STATE ('swing' / 'ready' / 'holstered')
    // and every gate keys its swing frames off it.
    D.legW = this._stanceW;
    D.legAmp = a;
    D.legBeat = stance === 'swing' ? beat.id : (m > 0.002 ? 'unwind' : (a > 0.002 ? 'ready' : null));
    if (a <= 0.002) { this.pelvisDx = 0; this.pelvisDy = 0; return; }
    const R = STANCE.ready, K = key || R, n = 1 - m;
    an._rot(b.thighL, X_AXIS, (R.thighL * n + K.thighL * m) * a);
    an._rot(b.thighR, X_AXIS, (R.thighR * n + K.thighR * m) * a);
    an._rot(b.calfL, X_AXIS, (R.calfL * n + K.calfL * m) * a);
    an._rot(b.calfR, X_AXIS, (R.calfR * n + K.calfR * m) * a);
    if (b.footL) an._rot(b.footL, X_AXIS, (R.footL * n + K.footL * m) * a);
    if (b.footR) an._rot(b.footR, X_AXIS, (R.footR * n + K.footR * m) * a);
    // track width: +Z on her left thigh and -Z on her right both swing the
    // knee OUTBOARD (the animator's own wide-track term uses the same signs)
    const abd = (R.abd * n + K.abd * m) * a;
    an._rotL(b.thighL, Z_AXIS, abd);
    an._rotL(b.thighR, Z_AXIS, -abd);
    this.pelvisDx = (R.dx * n + K.dx * m) * a;
    this.pelvisDy = (R.dy * n + K.dy * m) * a;
  }

  /**
   * The beat's additive torso pitch, budgeted against the stride's own lean
   * (see `JOG_TORSO_CAP`). Runs BEFORE this layer rotates the spine, so the
   * lean it reads is the locomotion's (clip + the animator's lean overlay +
   * last frame's masked swing clip) on this frame. Two bone reads; nothing
   * allocates. Returns the pitch to apply, in radians of spine rotation.
   */
  _stridePitch(pitch, dt) {
    const an = this.an, b = an.b, D = this._dbg;
    /* "IS SHE STRIDING" IS HER SPEED, NOT THE ANIMATOR'S BLEND WEIGHT. The
     * first version read `an._moveW`, and A105's new heavy segment caught it:
     * that weight is deliberately frozen ("may only fall") while a melee step
     * is armed below 0.45, so a swing thrown as she sets off from a standstill
     * held it at 0.14-0.44 through the whole swing at 4.9-5.0 m/s — the budget
     * a sixth applied, 47.4 deg of torso and the fist 0.06 m over the head
     * (measured). The measured travel speed (`player.moveSpeed`) cannot be
     * frozen: a standing swing's step-in tops out at the drive's 1.15 m/s,
     * under this ramp's 1.6 m/s floor, so every standing swing still reads 0;
     * a jog (5 m/s) reads 1. Damped, so a stop or a start does not pop, and
     * 0 through a dodge roll, whose curl is the dodge's business. */
    const p = this.ctx.player;
    const want = p && !p.dodging ? smoothstep(p.moveSpeed ?? 0, STRIDE_V0, STRIDE_V1) : 0;
    const mv = this._strideW = damp(this._strideW || 0, want, 10, dt);
    D.strideW = mv;
    if (mv < 0.01 || !b.pelvis || !b.head) {
      D.strideLeanDeg = null; D.stridePitchCut = 0;
      return pitch;
    }
    an._charOf(b.pelvis.bone, _a);
    an._charOf(b.head.bone, _b);
    // char space: +Z is her facing, so this is the forward lean off vertical
    const lean = Math.atan2(_b.z - _a.z, Math.max(1e-3, _b.y - _a.y));
    const over = lean + pitch - JOG_TORSO_CAP;
    const cut = over > 0 ? clamp(over, 0, Math.max(0, pitch + JOG_COUNTER_MAX)) * mv : 0;
    D.strideLeanDeg = lean * 180 / Math.PI;
    D.stridePitchCut = cut;
    return pitch - cut;
  }

  /**
   * Hold the drive-wrist goal under the head while she is striding, from the
   * release of the cock through strike and recover (see `JOG_TORSO_CAP`).
   * Scaled by the stride weight and ramped over the release, so a standing
   * swing is untouched and the hand path has no step. Writes `_hand` in place.
   */
  _strideHand(st, stance) {
    const D = this._dbg;
    const mv = this._strideW || 0;
    D.strideHandCut = 0;
    if (mv < 0.01 || stance !== 'swing' || !st) return;
    const ph = st.phase;
    const pw = ph === 'strike' || ph === 'recover' ? 1
      : ph === 'windup' ? smoothstep(clamp(st.k ?? 0, 0, 1), WINDUP_COCK, 1) : 0;
    if (pw <= 0) return;
    const an = this.an;
    an._charOf(an.b.head.bone, _a);
    /* THE HEAD MOVES AGAIN AFTER THIS LAYER. `playerAnimator._headStabilise`
     * runs after the melee layer and translates the head bone by up to
     * `HEAD_STAB_MAX` against the stride's pelvis bob, which at a jog is on.
     * The first build clamped against the unstabilised head and A105 read the
     * wrist only 0.020 m under the FINAL head on the heavy (the stabiliser
     * had taken 0.03 of the 0.05 margin). So the clamp is taken against the
     * lowest the head can end up on this frame. */
    const over = _hand.y - (_a.y - JOG_HAND_UNDER_HEAD - HEAD_STAB_MAX * mv);
    if (over <= 0) return;
    const cut = over * mv * pw;
    _hand.y -= cut;
    D.strideHandCut = cut;
  }

  /**
   * The arm a draw starts from (round 6): the locomotion's wrist and grip axis
   * — or, when the layer already owns the arm (a holster reversed into a
   * draw), last frame's solved wrist — and the free hand, in char space.
   */
  _captureFrom() {
    const an = this.an, b = an.b, f = this._drawFrom;
    if (this.w > 0.02 && this._handLastOk) {
      _a.copy(this._handLast);
      _b.copy(this.gripDirL).applyQuaternion(this._handQ);
    } else {
      an._charOf(b.handR.bone, _a);
      an._liveW(b.handR.bone, _q1);
      _b.copy(this.gripDirL).applyQuaternion(_q1);
    }
    _b.normalize();
    f.hand[0] = _a.x; f.hand[1] = _a.y; f.hand[2] = _a.z;
    f.shaft[0] = _b.x; f.shaft[1] = _b.y; f.shaft[2] = _b.z;
    an._charOf(b.handL.bone, _c);
    f.lh[0] = _c.x; f.lh[1] = _c.y; f.lh[2] = _c.z;
  }

  /**
   * Where this beat's CONTACT key would put the blade tip, in WORLD space, if
   * she swung from where she stands now (melee.js `_aimAt` / `_lungeFor`).
   * The key's hand plus the haft ahead of the grip, turned by the swing
   * bearing the layer is currently carrying. No allocation.
   */
  contactTipWorld(heavy, combo, out) {
    if (!this.ok) return false;
    const beat = heavy ? HEAVY : BEATS[clamp(combo | 0, 0, BEATS.length - 1)];
    const c = beat.contact;
    const L = (1 - this.gripFrac) * this.length;
    out.set(c.hand[0] + c.shaft[0] * L, c.hand[1] + c.shaft[1] * L, c.hand[2] + c.shaft[2] * L + (c.dz || 0));
    if (Math.abs(this._aimYaw) > 1e-3) out.applyAxisAngle(Y_AXIS, this._aimYaw);
    this.an.model.updateWorldMatrix(true, false);
    out.applyMatrix4(this.an.model.matrixWorld);
    return true;
  }

  /**
   * THE HAND AND FOREARM STAY OUT OF THE MACHINE (round 6, S5). The approach
   * term bounds her BODY capsule against the target's hulls (collision.js);
   * her right arm reaches ~0.5 m in front of that capsule, and where a hull
   * overhangs at arm height — a Hauler's head, a Flyer's body, a
   * Tower's jaw — the r5 skeptic found the fist 0.03 m and the forearm
   * 0.06-0.10 m inside it, on a heavy's contact, a follow-through and a
   * holster. The live hull set of the machine the lance is on
   * (`melee.armHulls()`) is read once a frame; the wrist and the forearm
   * segment are tested against every capsule near them (world space, radius
   * `ARM_R` + `ARM_CLEAR`), and a penetration moves the wrist goal straight out
   * of that capsule by the deficit and re-solves (six passes at most: an
   * overhang the elbow is under takes a few, the wrist moving the elbow only
   * part of the way each time).
   * Nothing is read when no machine is in play; nothing allocates.
   */
  _armHullGuard(w, st) {
    this._dbg.armHullFull = 0;
    this._armHullPasses(w, st);
    /* THE LAST RESORT, WHEN THE FIST IS STILL IN THE METAL (round 6, Oct 2).
     * The passes above escape locally — roll the elbow, push out of the
     * nearest capsule, draw back — and a CAGE of thin capsules defeats that
     * (a Tower's foot lattice: eight bars from knee to shoulder height
     * 0.5-0.9 m in front of her chest at the head-on stand; each escape finds
     * the next bar, and the heavy's recover left the knuckles 0.02-0.04 m
     * inside on 5 of 5 probed swings). Her own body capsule is clear of every
     * hull by construction (the melee term), so the space between her
     * shoulder and the fist's goal is clear near the shoulder: the goal is
     * drawn straight back along shoulder -> fist in 0.05 m steps until the
     * forearm and fist clear `ARM_CLEAR`, or the arm is folded to its 0.25 m
     * floor. Only while the arm is inside (`armHullFull`), so every other
     * frame is untouched. */
    const D = this._dbg;
    if (!D.armHullFull) return;
    const mel = this.ctx.combat?.melee;
    const hulls = mel && typeof mel.armHulls === 'function' ? mel.armHulls() : null;
    if (!hulls || !hulls.length) return;
    const an = this.an;
    const M = an.model.matrixWorld;
    let worst = this._armDeficit(hulls, M);
    let steps = 0;
    while (worst > 1e-3 && steps < 12) {
      an._charOf(an.b.upArmR.bone, _ahA);
      _ahX.subVectors(_ahA, _hand);
      const lx = _ahX.length();
      if (lx < 0.27) break;
      _hand.addScaledVector(_ahX, Math.min(0.05, lx - 0.25) / lx);
      an._ikArm('r', _hand, _pole, w, null);
      this._alignHaft(w);
      worst = this._armDeficit(hulls, M);
      steps++;
    }
    D.armHullBack = steps;
    D.armHullLeft = worst;
  }

  _armHullPasses(w, st) {
    const mel = this.ctx.combat?.melee;
    const hulls = mel && typeof mel.armHulls === 'function' ? mel.armHulls() : null;
    const D = this._dbg;
    D.armHullPush = 0; D.armHullRoll = 0; D.armHullRetract = 0; D.armHullBack = 0;
    if (!hulls || !hulls.length || !this.an.b.handR) return;
    const an = this.an;
    an.model.updateWorldMatrix(true, false);
    const M = an.model.matrixWorld;
    M.decompose(_ahA, _ahQi, _ahB);           // model rotation (the arm checks' world <-> char)
    _ahQi.invert();
    /* the body moves under the arm after this layer (the stance's pelvis
     * offset through the conform — the heavy drops ~0.15 m, the clamp tilts):
     * test the arm where it will be DRAWN (`_postShift`, measured last frame) */
    this._postShift(_ahSh);
    /* how much the guard may do depends on what the swing is doing: through
     * the release and the strike the blade is on its way to what it was
     * aimed at (melee `_aimAt` already picked a line the arm fits on), so the
     * guard only trims; after the hit, and in the guard / draw / holster, it
     * may move the arm as far as it has to */
    // 0 -> 1 over the strike leg into contact (smooth: a cap that steps at a
    // phase boundary would step the arm), 0 everywhere else
    const sw = st && st.phase === 'strike'
      ? smoothstep(st.k ?? 0, 0, Math.max(0.1, (st.contactK ?? 0.7) - HIT_LEAD)) : 0;
    let pushMax = ARM_PUSH_MAX + (ARM_PUSH_STRIKE - ARM_PUSH_MAX) * sw;
    let retractMax = ARM_RETRACT_MAX * (1 - sw);
    let rollMax = sw > 0.5 ? ARM_ROLL_STRIKE : Math.PI;
    let retract = false, pushUsed = 0, retrUsed = 0;
    for (let pass = 0; pass < 10; pass++) {
      if (pass > 0) _ahX.copy(_ahDir);          // last pass's escape, to spot a flip
      const worst = this._armDeficit(hulls, M);
      if (pass === 0) {
        D.armHullDeficit = worst;
        /* INSIDE IS NOT A TRIM (round 6, Oct 2). The strike's taper above is
         * for an arm that brushes the `ARM_CLEAR` margin on its way to the
         * aimed skin; a fist actually INSIDE a hull is not what any aim is
         * for. When `_aimAt` had to take a line the arm does not fit on (every
         * candidate clear of her body put the forearm against the machine — a
         * Tower's neck base head-on) the trim left the knuckles 0.04-0.09 m
         * inside it through the strike (A106's swing row, Oct 2). Then the
         * guard has its full reach, strike or not: the arm comes out, and the
         * blade lands wherever that leaves it — a whiff, if it is then out of
         * reach (melee `HIT_TIP_REACH`), never a fist through the metal. */
        D.armHullFull = worst > ARM_CLEAR ? 1 : 0;
        if (worst > ARM_CLEAR) { pushMax = ARM_PUSH_MAX; retractMax = ARM_RETRACT_INSIDE; rollMax = Math.PI; }
      }
      D.armHullLeft = worst;
      if (worst <= 1e-4) return;
      D.armHullT = this._ahT || 0;
      /* an ELBOW-end contact (a head that overhangs the arm) is not taken out
       * by moving the wrist — the IK keeps the elbow on its plane — so the
       * elbow is rolled round its circle about shoulder -> wrist instead (the
       * wrist does not move), to the nearest angle the hulls leave clear */
      if (this._ahT < 0.55 && this._armRollOut(hulls, M, worst, rollMax)) {
        this._rollOff = true; this._alignHaft(w); this._rollOff = false;
        continue;
      }
      /* SANDWICHED (a head cluster above AND below the forearm — the escape
       * flips from pass to pass): the way out is back toward her, so the
       * fist is drawn in toward the shoulder instead */
      if (pass > 0 && _ahX.dot(_ahDir) < 0) retract = true;
      /* ...and when the way OUT is spent and the arm is still in (round 6,
       * Oct 2 — a Tower's foot lattice, eight thin capsules 0.5-0.9 m in
       * front of her chest at the head-on stand: every sideways escape found
       * another bar and the push ran out with the knuckles 0.11 m inside),
       * the way out is back toward her too */
      if (!retract && !(pushMax - pushUsed > 0.002)) retract = true;
      let push;
      if (retract) {
        if (retrUsed >= retractMax) return;
        an._charOf(an.b.upArmR.bone, _ahA);
        _ahX.subVectors(_ahA, _hand);
        const lx = _ahX.length();
        if (lx < 0.25) return;                          // the arm is folded as far as it goes
        _ahX.multiplyScalar(1 / lx);
        push = Math.min(retractMax - retrUsed, worst + 0.01, lx - 0.25);
        if (!(push > 0.002)) return;
        retrUsed += push;
        D.armHullRetract = retrUsed;
      } else {
        _ahX.copy(_ahDir).applyQuaternion(_ahQi);      // world -> char
        push = Math.min(pushMax - pushUsed, (worst + 0.01) / Math.max(0.35, this._ahT));
        if (!(push > 0.002)) return;
        pushUsed += push;
      }
      _hand.addScaledVector(_ahX, push);
      an._ikArm('r', _hand, _pole, w, null);
      this._alignHaft(w);
      D.armHullPush = D.armHullPush + push;
    }
  }

  /**
   * The drive forearm (elbow -> fist, radius `ARM_R`) against the hulls,
   * where the arm will be drawn: the deficit under `ARM_CLEAR` of the worst
   * capsule (0 = clear), with `_ahDir` (world, out of that hull toward the
   * arm) and `_ahT` (how far along elbow -> fist the contact is).
   */
  _armDeficit(hulls, M) {
    const an = this.an, b = an.b;
    an._charOf(b.loArmR.bone, _ahE).add(_ahSh).applyMatrix4(M);
    /* the FIST, where A106 measures it (round 6, Oct 2): the middle of the
     * knuckle line (index_01 .. pinky_01), not the palm centre — the knuckles
     * sit ~0.04 m past it, and a guard that cleared the palm by its margin
     * left the knuckles that much nearer the metal than it thought */
    const K = this._knuckle;
    if (K && K.i && K.p) {
      an._charOf(K.i, _ahH);
      an._charOf(K.p, _ahF);
      _ahF.add(_ahH).multiplyScalar(0.5).add(_ahSh).applyMatrix4(M);
    } else {
      an._charOf(b.handR.bone, _ahH);
      an._liveW(b.handR.bone, _q1);
      _ahF.copy(this.palmOffL).applyQuaternion(_q1).add(_ahH).add(_ahSh).applyMatrix4(M);
    }
    return this._segHullDeficit(hulls, _ahE, _ahF, true);
  }

  /** Worst deficit of segment e-f (world) against the hulls; `keep` records
   *  the direction and the contact fraction of the worst. */
  _segHullDeficit(hulls, e, f, keep) {
    const mx = (e.x + f.x) * 0.5, my = (e.y + f.y) * 0.5, mz = (e.z + f.z) * 0.5;
    const L = e.distanceTo(f);
    let worst = 0;
    for (let i = 0; i < hulls.length; i++) {
      const h = hulls[i];
      const r = h.wr || 0;
      if (r <= 1e-4 || h.off) continue;
      const hx = (h.wax + h.wbx) * 0.5, hy = (h.way + h.wby) * 0.5, hz = (h.waz + h.wbz) * 0.5;
      const half = 0.5 * Math.hypot(h.wbx - h.wax, h.wby - h.way, h.wbz - h.waz);
      if (Math.hypot(hx - mx, hy - my, hz - mz) > half + r + 0.45) continue;
      _ahU.set(h.wax, h.way, h.waz); _ahV.set(h.wbx, h.wby, h.wbz);
      const d = segSegDir(e, f, _ahU, _ahV, _ahD) - r - ARM_R;
      if (d < ARM_CLEAR && ARM_CLEAR - d > worst) {
        worst = ARM_CLEAR - d;
        if (keep) {
          _ahDir.copy(_ahD);
          this._ahT = L > 1e-4 ? _ss.distanceTo(e) / L : 1;
        }
      }
    }
    return worst;
  }

  /**
   * Roll the right upper arm about shoulder -> wrist (char space; the wrist
   * and fist stay put) to the smallest angle, every 15 deg both ways, that
   * leaves the forearm `ARM_CLEAR` off every hull — or, failing that, to the
   * angle that clears it most, if that beats where it is. Never through her
   * head (the arm-in-head test the swing's own roll uses). True if it rolled.
   */
  _armRollOut(hulls, M, now, rollMax = Math.PI) {
    const an = this.an, b = an.b;
    an._charOf(b.upArmR.bone, _eS);
    an._charOf(b.loArmR.bone, _eE);
    an._charOf(b.handR.bone, _eH);
    _eAx.subVectors(_eH, _eS);
    const d = _eAx.length();
    if (d < 1e-4) return false;
    _eAx.multiplyScalar(1 / d);
    const along = _eT.subVectors(_eE, _eS).dot(_eAx);
    _eC.copy(_eS).addScaledVector(_eAx, along);
    _eU.subVectors(_eE, _eC);
    const r = _eU.length();
    if (r < 1e-3) return false;
    _eU.multiplyScalar(1 / r);
    _eV.crossVectors(_eAx, _eU);
    // the fist, world, where it will be drawn (it does not move with the roll)
    an._liveW(b.handR.bone, _q1);
    _ahF.copy(this.palmOffL).applyQuaternion(_q1).add(_eH).add(_ahSh).applyMatrix4(M);
    const step = Math.PI / 12;
    let best = now, bestPhi = 0;
    for (let i = 1; i <= 12; i++) {
      if (i * step > rollMax + 1e-6) break;
      for (let sg = -1; sg <= 1; sg += 2) {
        const phi = sg * i * step;
        _eT.copy(_eC).addScaledVector(_eU, Math.cos(phi) * r).addScaledVector(_eV, Math.sin(phi) * r);
        if (an._segInHead(_eS, _eT) || an._segInHead(_eT, _eH)) continue;
        _ahE.copy(_eT).add(_ahSh).applyMatrix4(M);
        const def = this._segHullDeficit(hulls, _ahE, _ahF, false);
        if (def <= 1e-4) { best = 0; bestPhi = phi; i = 99; break; }
        if (def < best - 0.01) { best = def; bestPhi = phi; }
      }
    }
    if (bestPhi === 0) return false;
    _eQ.setFromAxisAngle(_eAx, bestPhi);
    an._rotQL(b.upArmR, _eQ);
    this._dbg.armHullRoll = bestPhi * 180 / Math.PI;
    return true;
  }


  /** The pelvis shift the animator will add after this layer (x, y into `out`). */
  _postShift(out) {
    if (!this._pelvisShiftOk) return out.set(this.pelvisDx || 0, this.pelvisDy || 0, 0);
    // last frame's, carried one frame on at its own rate (the stance loads and
    // unwinds over a few frames; a lag of one would test the arm a frame late)
    return out.copy(this._pelvisShift).multiplyScalar(2).sub(this._pelvisShiftPrev);
  }

  /** The phase weight of the aim (0 through the cock, 1 at contact). */
  _aimPhaseW(st) {
    if (!st || !st.aimOk) return 0;
    const k = clamp(st.k ?? 0, 0, 1);
    if (st.phase === 'windup') return k <= WINDUP_COCK ? 0 : smoothstep(k, WINDUP_COCK, 1);
    if (st.phase === 'strike') return 1;
    if (st.phase === 'recover') return 1 - smoothstep(k, 0.10, RECOVER_FOLLOW + 0.20);
    return 0;
  }

  /** Extra spine pitch toward an aimed target beyond this beat's reach. */
  _aimLean(st, beat, w) {
    const aw = this._aimPhaseW(st) * w;
    if (aw < 1e-3) { this._dbg.aimLean = 0; return 0; }
    const an = this.an;
    an.b.upArmR.bone.getWorldPosition(_eS);
    _eT.set(st.aimX, st.aimY, st.aimZ);
    const i = st.heavy ? 3 : clamp(st.combo | 0, 0, 2);
    const reach = this._reachSeen[i] > 0.3 ? this._reachSeen[i] : 1.6;
    const short = _eT.distanceTo(_eS) - reach;
    const lean = clamp(short * AIM_LEAN_GAIN, 0, AIM_LEAN_MAX) * aw;
    this._dbg.aimLean = lean;
    return lean;
  }

  /**
   * The residual pass (see the call site): the posed tip, from the hand bone
   * and the held grip, against the aim point; the goal turned by the angle
   * between them about the shoulder (<= `AIM_RESID_MAX`), weighted over the
   * end of the strike leg. True when a second solve is wanted.
   */
  _aimResidual(st, w) {
    if (!st.aimOk || !this._held) return false;
    const k = clamp(st.k ?? 0, 0, 1);
    let cw = 0;
    if (st.phase === 'strike') cw = smoothstep(k, 0.25, Math.max(0.3, (st.contactK ?? 0.7) - HIT_LEAD));
    else if (st.phase === 'recover') cw = 1 - smoothstep(k, 0.0, 0.35);
    cw *= w;
    if (cw < 1e-3) return false;
    const an = this.an, b = an.b;
    // the posed tip, char space
    an._charOf(b.handR.bone, _eH);
    an._liveW(b.handR.bone, _q1);
    _eC.copy(this.gripDirL).multiplyScalar((1 - this._fracNow) * this.length).add(this.palmOffL)
      .applyQuaternion(_q1).add(_eH);
    an._charOf(b.upArmR.bone, _eS);
    an.model.updateWorldMatrix(true, false);
    _m4.copy(an.model.matrixWorld).invert();
    _eT.set(st.aimX, st.aimY, st.aimZ).applyMatrix4(_m4);
    this._postShift(_eD); _eT.sub(_eD);   // see `_strikeAim`
    _eU.subVectors(_eC, _eS);
    _eV.subVectors(_eT, _eS);
    const over = _eU.length() - _eV.length();     // > 0: the tip would pass through
    _eU.normalize(); _eV.normalize();
    const ang = Math.acos(clamp(_eU.dot(_eV), -1, 1));
    this._dbg.aimResidDeg = ang * 180 / Math.PI;
    if (ang < 0.01 && !(Math.abs(over) > 0.02)) return false;
    _eQ.setFromUnitVectors(_eU, _eV);
    const k2 = cw * Math.min(1, AIM_RESID_MAX / Math.max(ang, 1e-3));
    if (k2 < 0.999) _eQ.slerp(_qi(), 1 - k2);
    _hand.sub(_eS).applyQuaternion(_eQ).add(_eS);
    _shaft.applyQuaternion(_eQ);
    /* ...and the DISTANCE, both ways: a tip that would pass through the
     * skin is drawn back (<= `AIM_PULL_MAX`), one that would stop short
     * reaches on (the arm IK clamps at full extension, so this can only use
     * the arm there is). */
    if (Math.abs(over) > 0.02) {
      const pull = clamp(over, -AIM_PULL_MAX, AIM_PULL_MAX) * cw;
      _hand.addScaledVector(_eV, -pull);
      this._pullNow += Math.abs(pull);
    }
    return true;
  }

  /**
   * The least distance from the WORLD segment a-b to her axial bones (the A104
   * set, `CLEAR_BONES`), metres — melee.js `_aimAt` uses it to reject aim
   * lines that would lay the haft across her. Cold path (a handful of calls a
   * swing); no allocation.
   */
  axialGap(ax, ay, az, bx, by, bz) {
    if (!this.ok) return 9;
    _eC.set(ax, ay, az); _eV.set(bx, by, bz);
    let best = 9;
    for (let i = 0; i < CLEAR_BONES.length; i++) {
      const e = this.an.b[CLEAR_BONES[i]];
      if (!e) continue;
      e.bone.getWorldPosition(_eU);
      segPointN(_eC, _eV, _eU); const d = _sgNum[0];
      if (d < best) best = d;
    }
    return best;
  }

  /** Her head bone, world space. */
  headWorld(out) {
    if (!this.ok || !this.an.b.head) return false;
    this.an.b.head.bone.getWorldPosition(out);
    return true;
  }

  /** Her right shoulder joint, world space (melee.js `_aimAt`'s pivot). */
  shoulderWorld(out) {
    if (!this.ok || !this.an.b.upArmR) return false;
    this.an.b.upArmR.bone.getWorldPosition(out);
    return true;
  }

  /** This beat's CONTACT key wrist, world (melee.js `_aimAt` predicts where
   *  the fist lands when the swing is bent onto a target). No allocation. */
  contactHandWorld(heavy, combo, out) {
    if (!this.ok) return false;
    const beat = heavy ? HEAVY : BEATS[clamp(combo | 0, 0, BEATS.length - 1)];
    const c = beat.contact;
    out.set(c.hand[0], c.hand[1], c.hand[2] + (c.dz || 0));
    if (Math.abs(this._aimYaw) > 1e-3) out.applyAxisAngle(Y_AXIS, this._aimYaw);
    this.an.model.updateWorldMatrix(true, false);
    out.applyMatrix4(this.an.model.matrixWorld);
    return true;
  }

  /**
   * Bend the swing toward `melee.aimPoint` (round 6, R7 — see `AIM_PITCH_UP`).
   * Runs after `_blend` has filled `_hand`/`_shaft` and after the torso is
   * rotated (so the shoulder is final), before the stride clamp and the arm
   * solve. The rotation is computed ONCE per frame from the beat's contact
   * key — the tip the aim point was solved against — and applied, weighted by
   * phase, to whatever pose this frame interpolated, about the live shoulder.
   */
  _strikeAim(st, beat, w) {
    const D = this._dbg;
    const want = this._aimPhaseW(st) * w;
    D.aimW = want;
    this._pullNow = 0;
    if (want < 1e-3) { D.aimPitchDeg = 0; D.aimYawDeg = 0; return; }
    const an = this.an, b = an.b;
    // the aim point, char space
    an.model.updateWorldMatrix(true, false);
    _m4.copy(an.model.matrixWorld).invert();
    _eT.set(st.aimX, st.aimY, st.aimZ).applyMatrix4(_m4);
    // the stance's pelvis offset is added by the animator AFTER this layer and
    // carries the whole arm with it (the heavy drops ~0.1 m): aim ahead of it
    this._postShift(_eD); _eT.sub(_eD);
    // the shoulder (the pivot) and the contact key's tip, char space
    an._charOf(b.upArmR.bone, _eS);
    const c = beat.contact;
    const L = (1 - this.gripFrac) * this.length;
    _eC.set(c.hand[0] + c.shaft[0] * L, c.hand[1] + c.shaft[1] * L, c.hand[2] + c.shaft[2] * L);
    if (Math.abs(this._aimYaw) > 1e-3) _eC.applyAxisAngle(Y_AXIS, this._aimYaw);
    _eU.subVectors(_eC, _eS);
    _eV.subVectors(_eT, _eS);
    const lu = _eU.length(), lv = _eV.length();
    if (lu < 0.1 || lv < 0.1) return;
    const pa = Math.asin(clamp(_eU.y / lu, -1, 1)), pb = Math.asin(clamp(_eV.y / lv, -1, 1));
    const ya = Math.atan2(_eU.x, _eU.z), yb = Math.atan2(_eV.x, _eV.z);
    let dy = yb - ya;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = clamp(pb - pa, -AIM_PITCH_DOWN, AIM_PITCH_UP) * want;
    dy = clamp(dy, -AIM_YAW, AIM_YAW) * want;
    // pitch about the horizontal axis across the contact direction, then yaw
    _eH.set(_eU.x, 0, _eU.z);
    if (_eH.lengthSq() < 1e-6) _eH.set(0, 0, 1);
    _eH.normalize();
    _eAx.crossVectors(_eH, Y_AXIS).normalize();
    _eQ.setFromAxisAngle(_eAx, dp);   // (h x Y) by + raises h
    _q3.setFromAxisAngle(Y_AXIS, dy);
    _eQ.premultiply(_q3);
    _hand.sub(_eS).applyQuaternion(_eQ).add(_eS);
    _shaft.applyQuaternion(_eQ);
    /* ...and a target NEARER than the reach stops the thrust ON it: the arm
     * gives back the overshoot (<= `AIM_PULL_MAX`), so the tip lands on the
     * skin instead of passing through a Raptor's chest into the air behind
     * it. The reach is the one this beat has actually been seen to land at. */
    const iB = st.heavy ? 3 : clamp(st.combo | 0, 0, 2);
    const reachNow = this._reachSeen[iB] > 0.3 ? this._reachSeen[iB] : lu - 0.15;
    const over = reachNow - lv;
    if (over > 0) {
      const pull = Math.min(over, AIM_PULL_MAX) * want;
      _hand.addScaledVector(_eV, -pull / lv);
      this._pullNow += pull;
    }
    D.aimPitchDeg = dp * 180 / Math.PI;
    D.aimYawDeg = dy * 180 / Math.PI;
  }

  /**
   * THE BLADE STAYS OUT OF THE GROUND (round 6, S5 — the skeptic's 25 deg
   * slope). The contact keys are authored on flat ground; uphill, a low sweep
   * put the tip into the terrain at contact. The tip this frame's goal would
   * produce is checked against the terrain under it and, if it is lower than
   * `TIP_GROUND_CLEAR`, the swing is pitched up about her shoulder by the
   * angle that clears it — i.e. the strike follows the slope. Flat ground and
   * every authored beat leave it untouched (their tips are >= 0.35 m up).
   */
  _groundClear(st) {
    const terr = this.ctx.terrain;
    if (!terr || typeof terr.getHeight !== 'function') return;
    const an = this.an, b = an.b, D = this._dbg;
    const L = (1 - this.gripFrac) * this.length;
    _eC.copy(_hand).addScaledVector(_shaft, L);
    // the stance's pelvis drop is added after this layer and lowers the blade
    this._postShift(_eD); _eC.add(_eD);
    an.model.updateWorldMatrix(true, false);
    _eT.copy(_eC).applyMatrix4(an.model.matrixWorld);
    _eC.sub(_eD);
    const gy = terr.getHeight(_eT.x, _eT.z);
    const lack = gy + TIP_GROUND_CLEAR - _eT.y;
    D.tipGroundLack = lack;
    if (!(lack > 0)) return;
    an._charOf(b.upArmR.bone, _eS);
    _eU.subVectors(_eC, _eS);
    const lu = _eU.length();
    if (lu < 0.2) return;
    // the pitch that lifts the tip by `lack` (a little over, for the slope
    // rising further along the new, higher tip)
    const ang = Math.min(0.9, Math.asin(clamp((lack * 1.25) / lu, 0, 1)));
    _eH.set(_eU.x, 0, _eU.z);
    if (_eH.lengthSq() < 1e-6) _eH.set(0, 0, 1);
    _eH.normalize();
    _eAx.crossVectors(_eH, Y_AXIS).normalize();
    _eQ.setFromAxisAngle(_eAx, ang);
    _hand.sub(_eS).applyQuaternion(_eQ).add(_eS);
    _shaft.applyQuaternion(_eQ);
    D.tipGroundLift = ang * 180 / Math.PI;
  }

  /** The pose a holster starts from: last frame's solved wrist and grip axis
   *  and the torso scalars it was drawn with (round 6). */
  _captureHolsterFrom() {
    const f = this._holsterFrom;
    const u = this._u;
    if (!this._handLastOk || this.w < 0.5) {
      // not the layer's arm last frame: the guard key is as good as anything
      for (let i = 0; i < 3; i++) { f.hand[i] = READY.hand[i]; f.shaft[i] = READY.shaft[i]; f.lh[i] = READY.lh[i]; }
      f.yaw = READY.yaw; f.pitch = READY.pitch; f.roll = READY.roll; f.py = READY.py; f.dz = READY.dz;
      f.lhW = 1; f.lhOn = READY.lhOn;
      return;
    }
    _b.copy(this.gripDirL).applyQuaternion(this._handQ).normalize();
    f.hand[0] = this._handLast.x; f.hand[1] = this._handLast.y; f.hand[2] = this._handLast.z;
    f.shaft[0] = _b.x; f.shaft[1] = _b.y; f.shaft[2] = _b.z;
    this.an._charOf(this.an.b.handL.bone, _c);
    f.lh[0] = _c.x; f.lh[1] = _c.y; f.lh[2] = _c.z;
    f.yaw = u ? u.yaw : READY.yaw; f.pitch = u ? u.pitch : READY.pitch; f.roll = u ? u.roll : READY.roll;
    f.py = u ? u.py : READY.py; f.dz = u ? u.dz : READY.dz;
    f.lhW = u ? u.lhW : 1; f.lhOn = u ? u.lhOn : READY.lhOn;
    // the capture is already in the swing bearing: undo `_lerpPose`'s turn
    const y = this._aimYaw;
    if (Math.abs(y) > 1e-3) {
      _a.set(f.hand[0], f.hand[1], f.hand[2]).applyAxisAngle(Y_AXIS, -y);
      f.hand[0] = _a.x; f.hand[1] = _a.y; f.hand[2] = _a.z;
      _b.applyAxisAngle(Y_AXIS, -y);
      f.shaft[0] = _b.x; f.shaft[1] = _b.y; f.shaft[2] = _b.z;
      _c.applyAxisAngle(Y_AXIS, -y);
      f.lh[0] = _c.x; f.lh[1] = _c.y; f.lh[2] = _c.z;
    }
  }

  /**
   * The posed tip against the terrain (round 6, S5 — see `_groundClear`): the
   * tip as the solved hand holds it, lowered by the pelvis offset the animator
   * adds after this layer, against the height under it; when it is short of
   * `TIP_GROUND_CLEAR` the goal is pitched up about the shoulder by the angle
   * that clears it and the caller solves again. True when it moved the goal.
   */
  _groundResidual() {
    const terr = this.ctx.terrain;
    if (!terr || typeof terr.getHeight !== 'function' || !this._held) return false;
    const an = this.an, b = an.b, D = this._dbg;
    an._charOf(b.handR.bone, _eH);
    an._liveW(b.handR.bone, _q1);
    _eC.copy(this.gripDirL).multiplyScalar((1 - this._fracNow) * this.length).add(this.palmOffL)
      .applyQuaternion(_q1).add(_eH);
    this._postShift(_eD); _eC.add(_eD);
    an.model.updateWorldMatrix(true, false);
    _eT.copy(_eC).applyMatrix4(an.model.matrixWorld);
    const lack = terr.getHeight(_eT.x, _eT.z) + TIP_GROUND_CLEAR - _eT.y;
    if (!(lack > 0.005)) return false;
    an._charOf(b.upArmR.bone, _eS);
    _eU.subVectors(_eC, _eS);
    const lu = _eU.length();
    if (lu < 0.2) return false;
    const ang = Math.min(0.9, Math.asin(clamp((lack * 1.3) / lu, 0, 1)));
    _eV.set(_eU.x, 0, _eU.z);
    if (_eV.lengthSq() < 1e-6) _eV.set(0, 0, 1);
    _eV.normalize();
    _eAx.crossVectors(_eV, Y_AXIS).normalize();
    _eQ.setFromAxisAngle(_eAx, ang);
    _hand.sub(_eS).applyQuaternion(_eQ).add(_eS);
    _shaft.applyQuaternion(_eQ);
    D.tipGroundResid = ang * 180 / Math.PI;
    return true;
  }

  /** True once a draw has finished: the prop is in the fist, the hand-over
   *  blend is spent and the grip is AT `gripFrac` (round 6, ruling R5). */
  get handoverDone() {
    return this._held && this._carryB >= 1 && Math.abs(this._fracNow - this.gripFrac) < 1e-4;
  }

  _settleLance(stance, st) {
    if (!this.lance) return;
    this.lance.visible = stance !== 'holstered';
    const D = this._dbg;
    let frac = this.gripFrac;
    let holstered = true;
    const k = clamp(st?.drawK ?? 0, 0, 1);
    const gf = this._grabFrac;
    if (stance === 'draw') {
      if (this._held) {
        holstered = false;
        const g0 = clamp(this._grabK ?? 0.55, 0, 0.95);
        const s0 = g0 + SLIDE_START * (1 - g0);
        frac = gf + (GRIP_FRAC - gf) * smoothstep(k, s0, 1);
      } else {
        frac = gf;
        const reach = k >= 0.30 ? this._reparentGap(frac) : 9;
        if (this._grabSettle(reach, k)) {
          D.grabReach = reach > 8 ? this._reparentGap(frac) : reach;
          this._grabK = k;
          holstered = false;
        }
      }
    } else if (stance === 'holster') {
      if (!this._held) { holstered = true; frac = gf; this._grabReset(); }
      else {
        frac = GRIP_FRAC + (gf - GRIP_FRAC) * smoothstep(k, 0.0, 0.42);
        const reach = k >= 0.30 ? this._reparentGap(frac) : 9;
        const give = this._grabSettle(reach, k);
        holstered = !!give;
        if (give) { D.grabReach = reach > 8 ? this._reparentGap(frac) : reach; this._relK = k; }
      }
    } else if (stance !== 'holstered') {
      holstered = false;
      this._grabReset();
    } else {
      this._grabReset();
    }
    /* THE NUMBER §4's "no teleport" CLAUSE IS ABOUT. Measured on the prop's
     * own world matrix across the frame the parent changes — which is where a
     * teleport would be — rather than on the residual the arm left, which is
     * `grabReach` above and is a reach quality, not a discontinuity. */
    const changing = this._held === holstered;   // this frame flips the parent
    if (changing) this._preHandover(_hoPos);
    if (holstered) { this._toBack(); if (stance !== 'holstered' || changing) this._poseHolstered(); }
    else { this._toHand(); this._poseHeld(frac); }
    if (changing) {
      this.lance.updateWorldMatrix(true, false);
      _a.set(0, 0, 0).applyMatrix4(this.lance.matrixWorld);
      D.grabGap = _a.distanceTo(_hoPos);
    }
    D.carryBlend = this._carryB;
    this._fracNow = holstered ? gf : frac;
    D.gripFracNow = this._fracNow;
    D.handoverDone = this.handoverDone;

    /* HOW FAST THE PROP MOVES INSIDE THE HAND (A102's hand-over clause).
     *
     * Measured in the PARENT's frame, deliberately. In world space the tip of
     * a 1.85 m haft on an arm that is travelling from behind her shoulder to
     * the guard covers two metres in a frame, and that is the DRAW, not a
     * teleport — which is exactly why A102's swing clause budgets the grip and
     * not the tip. What the hand-over must not hide is the prop sliding
     * through the hand, so that is what this is: the far end of the haft, in
     * metres, relative to whatever it is parented to. */
    const g = this.lance;
    const sc = this._boneScale(g.parent || this.socketBone);
    _a.set(0, 0, this._localLen * g.scale.z).applyQuaternion(g.quaternion)
      .add(g.position).multiplyScalar(sc);
    D.carrySlide = (changing || !this._tipLocalOk) ? 0 : Math.round(_a.distanceTo(this._tipLocal) * 1e4) / 1e4;   // (no toFixed: a string a frame)
    this._tipLocal.copy(_a);
    this._tipLocalOk = true;

    /* The held haft is a capsule in the spring solver, as the stowed one is
     * (`_stowCap`; the kit only writes it while the lance is on her back), so
     * no wrap tail or knot tail is drawn through the haft (M10). */
    const SC = this.an._stowCap;
    if (SC && this._held) {
      g.updateWorldMatrix(true, false);
      SC.a.set(0, 0, 0).applyMatrix4(g.matrixWorld);
      SC.b.set(0, 0, this._localLen).applyMatrix4(g.matrixWorld);
      SC.on = true;
    }
  }

  /** Clear the hand-over convergence state (see `_grabSettle`). */
  _grabReset() {
    this._gsN = 0; this._gsBest = 9; this._gsStall = 0;
    this.needsGrab = false;
  }

  /**
   * SHOULD THE PROP CHANGE HANDS ON THIS FRAME? (fix round 4, finding F4.)
   *
   * Round 3 answered "yes when the hand is within `GRAB_SNAP` of the haft, or
   * when the clock runs out at `drawK >= 0.90`". The second half of that is
   * what A102's `grabReach` clause was failing on: under the gate's injected
   * 20-80 ms stalls the whole draw is a handful of rendered frames, the arm is
   * still travelling when the clock expires, and the hand took the haft from
   * 0.513 m away against a 0.25 m bar. Waiting for the threshold instead is
   * not a fix either — the arm's own IK leaves a residual (0.0957 m measured
   * on a quiet box, above `GRAB_SNAP`), so a strict threshold never fires and
   * the escape is doing all the work at every frame rate.
   *
   * So the test is CONVERGENCE, not a threshold: the reach has to have stopped
   * improving. `needsGrab` is published for `melee.js::_waitForHand`, which
   * parks the stance clock just short of its end while it is true, so the wait
   * costs frames rather than being skipped by them. Bounded there at
   * `GRAB_HOLD_MAX` of wall clock, and `k >= 0.999` is still the last-resort
   * escape for the frame that hold expires on.
   *
   * @param {number} reach  `_reparentGap`, or > 8 before the window opens
   * @param {number} k      the draw/holster fraction
   */
  _grabSettle(reach, k) {
    if (reach > 8) {
      this._gsN = 0; this._gsBest = 9; this._gsStall = 0;
      this.needsGrab = true;
      return false;
    }
    this._gsN = (this._gsN || 0) + 1;
    if (reach < (this._gsBest ?? 9) - 0.010) { this._gsBest = reach; this._gsStall = 0; } else this._gsStall = (this._gsStall || 0) + 1;
    /* THE STALL PATH HAS A CEILING. "The reach stopped improving" is the right
     * test for an arm that has arrived; it is the wrong one for an arm that
     * has not started, and on the first frames of a leg the weight ramp can
     * leave the reach flat while the hand is still half a metre out. So the
     * convergence exit only fires under 0.20 m — inside A102's 0.25 m bar with
     * margin — and anything worse than that waits for the clock. */
    const settled = reach <= GRAB_SNAP
      || (this._gsN >= 4 && this._gsStall >= 2 && reach <= 0.20);
    this.needsGrab = !settled;
    if (!settled && k < 0.999) return false;
    this._grabReset();
    return true;
  }

  /** The prop's world-space butt BEFORE the hand-over, for `grabGap`. */
  _preHandover(out) {
    this.lance.updateWorldMatrix(true, false);
    return out.set(0, 0, 0).applyMatrix4(this.lance.matrixWorld);
  }

  /** Interpolate the beat into `_hand` / `_shaft` / `_lh` + torso scalars. */
  _blend(stance, st, beat) {
    const out = this._u;
    const phase = st.phase || 'idle';
    const k = clamp(st.k ?? 0, 0, 1);
    const cK = clamp(st.contactK ?? 0.55, 0.05, 0.95);

    let A = READY, B = READY, t = 0, clipU = 0;
    /* how much of the swing bearing (`_aimYaw`) the keys carry: the guard and
     * the beats point where the hit goes; the reach to the socket and the
     * return down her side are BODY-relative (round 6 — rotating the reach
     * target by the camera bearing put the hand beside the haft in play,
     * where `aimLock` is null) */
    let yawK = 1;
    if (stance === 'draw') {
      const dk = clamp(st.drawK ?? 0, 0, 1);
      // keyed on whether she HAS it, not on the clock: the hand-over waits for
      // the hand (see update()), so the return leg has to start from the same
      // event rather than from a scheduled fraction
      if (!this._held) {
        /* ROUND 6: FROM WHERE THE ARM IS, not from the guard. The draw is
         * pressed from the locomotion (a jog's back-swing, a sprint's pump),
         * and round 5 started the reach at READY — a guard the arm was not in
         * — while the layer's weight ramped, so the path the eye saw was a
         * blend of two arms. `_drawFrom` is that arm, captured on the draw's
         * first frame; the elbow bound (`_elbowGuard`) holds from frame one. */
        A = this._drawFrom; B = this._reachPose();
        t = CARRY_EASE(clamp(dk / 0.55, 0, 1));
        yawK = 0;
      } else {
        const g = clamp(this._grabK ?? 0.55, 0, 0.95);
        A = this._reachPose(); B = READY;
        t = CARRY_EASE(clamp((dk - g) / Math.max(0.08, 1 - g), 0, 1));
        yawK = t;
      }
    } else if (stance === 'holster') {
      const dk = clamp(st.drawK ?? 0, 0, 1);
      /* FIX ROUND 4 (F4): 0.45 -> 0.62. The holster's whole pose leg — the
       * hand travelling from the guard to behind her shoulder, which is where
       * a 1.59 m haft's far end covers the most ground — used to be spent in
       * the first 45 % of `HOLSTER_T`. With `STANCE_STEP_MAX` now capping the
       * clock at 0.08 per rendered frame that is six frames; at 0.62 it is
       * nine, and the tip's worst per-frame travel across the re-parent drops
       * by a third. */
      if (this._held) {
        A = this._holsterFrom; B = this._reachPose(); t = CARRY_EASE(clamp(dk / 0.62, 0, 1));
        yawK = 1 - t;
      } else {
        /* ROUND 6: AND THE HAND COMES BACK DOWN HER SIDE before the arm is
         * handed back to the locomotion. Round 5 parked it on the socket and
         * faded the layer out from there, so the last third of every holster
         * was a blend between a hand behind her shoulder and whatever the
         * stride's arm was doing — at a sprint, an elbow pumped up behind her. */
        const r0 = clamp(this._relK ?? 0.62, 0, 0.9);
        A = this._reachPose(); B = SIDE_KEY;
        t = CARRY_EASE(clamp((dk - r0) / Math.max(0.08, 0.92 - r0), 0, 1));
        yawK = 0;
      }
    } else if (stance === 'swing') {
      if (phase === 'windup') {
        /* THE COCK IS REACHED AT `WINDUP_COCK` AND THE RELEASE STARTS THERE
         * (fix pass 1, finding F1 — see the constant for the measurement). The
         * pose leg that lands the blade is 132 ms long now instead of 54, and
         * it does not step at the phase boundary: at windup k = 1 it is exactly
         * `STRIKE_PRE` of the way from cock to contact, which is where the
         * strike branch below starts. */
        if (k <= WINDUP_COCK) {
          A = this._windOn ? this._windFrom : READY; B = beat.cock; t = WINDUP_EASE(k / WINDUP_COCK); clipU = 0.30 * t;
        } else {
          A = beat.cock; B = beat.contact;
          t = STRIKE_PRE * ((k - WINDUP_COCK) / (1 - WINDUP_COCK));
          clipU = 0.30 + 0.38 * t;
        }
      } else if (phase === 'strike') {
        /* THE FOLLOW-THROUGH BELONGS TO `recover`, NOT TO THE TAIL OF THE
         * STRIKE (fix round 4, F3) — and the canon says so.
         *
         * `lance-canon.md` §3 films cocked->contact at 0.15 s and
         * contact->follow-through at 0.20 s. This lane's phases are
         * `windup 0.15 / strike 0.10 / recover 0.26`: the 0.20 s of
         * follow-through is `recover`'s length, not the back third of a 0.10 s
         * strike. Round 3 crammed both into the strike, and that had a
         * measurable cost, not just a stylistic one. `melee.js` resolves the
         * hit at `CONTACT_K` of the strike but can only do it on a rendered
         * frame, and `poseState` extrapolates the pose up to 50 ms forward to
         * cover the animator running first — 50 ms is HALF a strike window, so
         * on a slow frame the pose the hit was measured against was already
         * the follow-through. Filmed on A103: the blade tip read (1.29, 0.64,
         * 0.99) in character space — swept out to her left and down, the
         * follow key — on a swing whose contact key is (0.0, 1.0, 1.95), and
         * the reach came back at 0.98-1.11 m instead of -0.05 m.
         *
         * So: the strike reaches the contact key at `cK - HIT_LEAD` and HOLDS
         * it — an impact hold, which is what a lance landing on metal should
         * have — and `recover` plays contact -> follow -> guard. Phase
         * durations, `CONTACT_K`, the combo window and the damage are all
         * untouched; what moves is which key each phase interpolates. */
        const kA = Math.max(0.10, cK - HIT_LEAD);
        if (k <= kA) {
          A = beat.cock; B = beat.contact;
          t = STRIKE_PRE + (1 - STRIKE_PRE) * STRIKE_EASE(k / kA);
          clipU = 0.30 + 0.38 * t;
        } else { A = beat.contact; B = beat.contact; t = 0; clipU = 0.68; }
      } else if (k <= RECOVER_FOLLOW) {
        // recover, first leg: contact -> follow-through (the canon's ~0.20 s)
        const u2 = k / RECOVER_FOLLOW;
        A = beat.contact; B = beat.follow; t = FOLLOW_EASE(u2); clipU = 0.68 + 0.14 * t;
      } else {
        /* ...AND THE RETURN TO GUARD FINISHES IN THE GUARD (fix pass 1). It
         * gets `RETURN_IN_SWING` of the chord here and the rest in the `ready`
         * branch above, from a snapshot of this pose — see `SETTLE_T`. */
        const u2 = (k - RECOVER_FOLLOW) / (1 - RECOVER_FOLLOW);
        A = beat.follow; B = READY; t = RETURN_IN_SWING * CARRY_EASE(u2);
        clipU = 0.82 + 0.18 * smoothstep(u2, 0, 0.6);
      }
    } else if (stance === 'ready' && this._settleT < SETTLE_T && this._swingOut) {
      /* THE POST-SWING SETTLE. `_swingOut` is the pose the last rendered swing
       * frame drew, captured below, so this leg starts exactly where the swing
       * stopped: the guard is arrived at, not snapped to. */
      A = this._swingOut; B = READY; t = CARRY_EASE(clamp(this._settleT / SETTLE_T, 0, 1));
    }

    if (stance === 'swing') this._snapPose(A, B, t);
    this._lerpPose(A, B, t, yawK);
    out.yaw = A.yaw + (B.yaw - A.yaw) * t;
    out.pitch = A.pitch + (B.pitch - A.pitch) * t;
    out.roll = A.roll + (B.roll - A.roll) * t;
    out.py = (A.py || 0) + ((B.py || 0) - (A.py || 0)) * t;
    out.dz = (A.dz || 0) + ((B.dz || 0) - (A.dz || 0)) * t;
    out.lhOn = (A.lhOn || 0) + ((B.lhOn || 0) - (A.lhOn || 0)) * t;
    out.lhW = (A.lhW || 0) + ((B.lhW || 0) - (A.lhW || 0)) * t;
    /* light-3 (R1): the left hand lets go on its own schedule, off the haft
     * before the strike phase opens (STRIKE_PRE of the cock -> contact leg). */
    if (beat.release && A === beat.cock && B === beat.contact) {
      out.lhW = 1 - smoothstep(t, beat.release[0], beat.release[1]);
    }
    out.clipU = clipU;
    out.armLift = (_hand.y - 1.0) * 2;
    return out;
  }

  /**
   * Capture the pose a swing frame drew, so the return to guard can continue
   * out of it after the swing has ended (fix pass 1 — see `SETTLE_T`).
   *
   * It interpolates the same two keys `_lerpPose` is about to, in the same way,
   * but BEFORE the aim-yaw rotation is applied — `_lerpPose` rotates its output
   * by `_aimYaw`, and a snapshot taken after that would be rotated a second
   * time when the settle re-interpolates it. Allocation-free after the first
   * swing frame: one object, one module scratch.
   */
  _snapPose(A, B, t) {
    const s = this._swingOut || (this._swingOut = decimalFields({
      hand: [0.5, 0, 0], shaft: [0.5, 0, 1], lh: [0.30, 0.98, 0.04], lhOn: 0, lhW: 0,
      yaw: 0, pitch: 0, roll: 0, py: 0, dz: 0,
    }));
    const q = 1 - t;
    const la = A.lh || B.lh || READY.lh, lb = B.lh || A.lh || READY.lh;
    for (let i = 0; i < 3; i++) {
      s.hand[i] = A.hand[i] * q + B.hand[i] * t;
      s.lh[i] = la[i] * q + lb[i] * t;
    }
    this._slerpDir(A.shaft, B.shaft, t, _snapD);
    s.shaft[0] = _snapD.x; s.shaft[1] = _snapD.y; s.shaft[2] = _snapD.z;
    s.lhOn = (A.lhOn || 0) * q + (B.lhOn || 0) * t;
    s.lhW = (A.lhW || 0) * q + (B.lhW || 0) * t;
    s.yaw = A.yaw + (B.yaw - A.yaw) * t;
    s.pitch = A.pitch + (B.pitch - A.pitch) * t;
    s.roll = A.roll + (B.roll - A.roll) * t;
    s.py = (A.py || 0) + ((B.py || 0) - (A.py || 0)) * t;
    s.dz = (A.dz || 0) + ((B.dz || 0) - (A.dz || 0)) * t;
  }

  /**
   * The over-the-shoulder reach pose, read off the LIVE socket.
   *
   * FIX ROUND 1 aimed the hand and the wrist at where the socket sits in the
   * REST pose. The socket is bolted to `spine_02`, and at runtime that bone is
   * posed by the idle/locomotion clip and the ground conform — measured, the
   * stowed haft's tilt reads 36.7 deg at idle against 33.5 deg at bind, and
   * the whole carry sits ~0.1 m from where the constants say. So the hand
   * arrived beside the haft rather than on it, the wrist was 19 deg off its
   * axis, and the re-parent — which is meant to be a sub-centimetre hand-over
   * — would have moved the butt 0.97 m and popped the tip 0.49 m.
   *
   * Reading the socket's live char-space transform instead makes the promise
   * literal: she grabs the haft where the haft is, this frame.
   */
  _reachPose() {
    /* ROUND 6: the chest turns TOWARD the drawing hand (`DRAW_YAW`, right
     * shoulder forward) — round 5 turned it -0.16 rad, away, which is half of
     * why the elbow had to go up behind her head to reach the haft. */
    const p = this._reach || (this._reach = decimalFields({
      hand: [0.5, 0, 0], shaft: [0.5, 0, 1], lh: [0.30, 0.98, 0.04], lhOn: 0.54, lhW: 0,
      yaw: DRAW_YAW, pitch: -0.04, roll: 0.06,
    }));
    this._liveSocket(_grip, _c);           // butt, dir (char)
    /* WHERE ON THE HAFT SHE TAKES IT — the point the hand can actually reach.
     *
     * Fix round 1: a fixed `GRAB_FRAC` asks the arm for one point behind her
     * own shoulder, and reaching behind your own shoulder is at the limit of
     * the arm's reach, so the IK left a residual the hand-over then had to
     * eat. A haft is a metre and a half of grabbable line: the hand takes it
     * where it meets it. The target slides to the closest point on the stowed
     * shaft, clamped to the half of it that reads as a draw (a grab at the
     * butt would be a scoop, at the blade a cut), and only the PERPENDICULAR
     * residual is left for the blend. */
    const an2 = this.an;
    an2._charOf(an2.b.handR.bone, _a);
    an2._liveW(an2.b.handR.bone, _q1);
    _a.add(_b.copy(this.palmOffL).applyQuaternion(_q1));
    /* THE LOW CLAMP IS 0.68 NOW, NOT 0.55 AND CERTAINLY NOT 0.42 (fix pass 1,
     * A104 / the film judge's holster finding).
     *
     * The stowed haft runs from a butt cap at her right hip to a blade over
     * her right shoulder, so 0.42 of the way up it is a point ON her spinal
     * axis at belt height and a third of a metre behind her — and reaching for
     * that lays the right forearm straight across her own lower back. Round 4
     * raised the clamp to 0.55 and claimed the holster leg fixed at 0.083 m;
     * measured on HEAD the film judge got 0.054-0.069 m across 8 runs and
     * FILMED the worst frame — the right forearm lying horizontally across the
     * back of her neck with the hand between her shoulder blades, which is
     * Kevin's "arm literally behind head" verbatim. Two round-4 changes had
     * made it worse rather than better: `LANCE_SCALE` 0.86 -> 0.80 shortened
     * the stowed haft, so the same FRACTION is physically nearer her spine,
     * and the holster's pose leg grew from 0.45 to 0.62 of `HOLSTER_T`, so more
     * rendered frames land in the deep-reach pose.
     *
     * 0.68 of a 1.48 m haft is 0.20 m outboard of the spinal axis and level
     * with the shoulder blade — a hand meeting a slung shaft where the shaft is
     * furthest from her back. It costs nothing anywhere else: `grabReach` has
     * been a CONVERGENCE test since round 4 (A102), and a shorter reach
     * converges sooner. */
    const along = clamp(_a.sub(_grip).dot(_c) / this.length, 0.68, 0.86);
    this._grabFrac = along;
    _grip.addScaledVector(_c, along * this.length);
    /* The goal is the WRIST, but the haft runs through the PALM, so the
     * target is backed off by the palm offset — otherwise the hand parks 5 cm
     * to one side of the haft and the hand-over can never close.
     *
     * `_handQ` is LAST frame's SOLVED hand orientation, cached at the end of
     * `_measure`. Reading it live here is wrong and measurably so: `_blend`
     * runs before `_solveRight`, so the live quaternion at this point is still
     * the locomotion clip's, the offset points somewhere arbitrary, and the
     * target oscillates (filmed: the gap went from 0.10 m to 0.24 m and the
     * grab stopped closing at all). One frame of lag on a wrist that is
     * already holding still is nothing. */
    _grip.sub(_b.copy(this.palmOffL).applyQuaternion(this._handQ));
    p.hand[0] = _grip.x; p.hand[1] = _grip.y; p.hand[2] = _grip.z;
    p.shaft[0] = _c.x; p.shaft[1] = _c.y; p.shaft[2] = _c.z;
    return p;
  }

  /**
   * The braid's smallest distance to a CANDIDATE carry segment (fix pass 1).
   *
   * `_carryServo` measures the braid against the segment the renderer drew;
   * this measures it against one the bound is considering, so the bow escape
   * can be chosen without costing the braid the clearance it cannot buy back
   * (it is simulated after this layer). One pass over the 32 cached strand
   * positions, no matrix work, no allocation.
   */
  _hairGapFor(mid, dir, L) {
    const P = this._hairPos;
    if (!P || !this._hairN) return 9;
    _hgA.copy(mid).addScaledVector(dir, -0.5 * L);
    _hgB.copy(mid).addScaledVector(dir, 0.5 * L);
    let best = 9;
    for (let i = 0, j = 0; i < this._hairN; i++, j += 3) {
      _hgP.set(P[j], P[j + 1], P[j + 2]);
      segPointN(_hgA, _hgB, _hgP); const g = _sgNum[0];
      if (g < best) best = g;
    }
    return best;
  }

  /**
   * The upper-back SURFACE in char space — `spine_04`/`spine_05` midpoint
   * pushed `BACK_DEPTH` behind the spinal axis. Identical to what `debug()`
   * publishes as `backCentre` and what A100 measures `midToBack` against, so
   * the bound and the gate are talking about the same point.
   */
  _backCentre(out) {
    const an = this.an;
    an._charOf(an.b.spine4.bone, out);
    an._charOf(an.b.spine5.bone, _bcTmp);
    out.add(_bcTmp).multiplyScalar(0.5);
    out.z -= BACK_DEPTH;
    return out;
  }

  /**
   * Great-circle interpolation of two unit directions, into `out`.
   *
   * FIX ROUND 2 — THE WHIP. `_lerpPose` used to LERP the two shaft directions
   * and normalise. For the swing beats (60-120 deg apart) that is a mild
   * distortion; for the DRAW it is a defect. The draw takes the haft from the
   * stowed axis (up over her right shoulder, pointing back) to the guard
   * (forward and down) — about 150 deg — and a normalised lerp of two nearly
   * opposite directions has almost all of its angular rate at t = 0.5: filmed,
   * the tip moved 0.12 m, 0.44 m, 1.65 m, 0.54 m across the four rendered
   * frames of one draw on a loaded box. 60 % of the path in 22 % of the clock
   * is what A102's re-parent clause was catching, and it is a real visual
   * whip, not a measurement artefact. A slerp is uniform in angle by
   * construction, so the same draw spends the same radians in every frame.
   *
   * Nearly-antipodal pairs fall back to a stable perpendicular axis.
   */
  _slerpDir(a, b, t, out) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    d = clamp(d, -1, 1);
    if (d > 0.9995) {            // parallel: lerp is exact to a millidegree
      out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
      return out.normalize();
    }
    if (d < -0.9995) {           // antipodal: no unique plane, pick a stable one
      _sgC.set(a[0], a[1], a[2]);
      // the world axis least aligned with `a`, crossed into a true perpendicular
      const ax = Math.abs(a[0]), ay = Math.abs(a[1]), az = Math.abs(a[2]);
      _sgB.set(ax <= ay && ax <= az ? 1 : 0, ay < ax && ay <= az ? 1 : 0, az < ax && az < ay ? 1 : 0);
      _sgA.crossVectors(_sgC, _sgB).normalize();
      _q3.setFromAxisAngle(_sgA, Math.PI * t);
      return out.copy(_sgC).applyQuaternion(_q3).normalize();
    }
    const th = Math.acos(d), s = Math.sin(th);
    const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
    return out.set(a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb).normalize();
  }

  _lerpPose(A, B, t, yawK = 1) {
    const s = 1 - t;
    _hand.set(A.hand[0] * s + B.hand[0] * t, A.hand[1] * s + B.hand[1] * t, A.hand[2] * s + B.hand[2] * t);
    this._slerpDir(A.shaft, B.shaft, t, _shaft);
    if (_shaft.lengthSq() < 1e-6) _shaft.set(0, 0, 1);
    const la = A.lh || B.lh || READY.lh, lb = B.lh || A.lh || READY.lh;
    _lh.set(la[0] * s + lb[0] * t, la[1] * s + lb[1] * t, la[2] * s + lb[2] * t);
    // the swing points where the hit goes (the draw's reach does not: `yawK`)
    const y = this._aimYaw * yawK;
    if (Math.abs(y) > 1e-3) {
      _hand.applyAxisAngle(Y_AXIS, y);
      _shaft.applyAxisAngle(Y_AXIS, y);
      _lh.applyAxisAngle(Y_AXIS, y);
    }
  }

  /* --------------------------- arm solving ------------------------------ */

  /**
   * The drive arm. IK to the wrist goal, then a MINIMAL wrist twist that puts
   * the haft on the beat's shaft direction: the correction is built from the
   * hand's live shaft axis rather than an authored euler, so it can never
   * introduce a roll the pose did not ask for, and it is clamped so the wrist
   * is never broken to make a number.
   *
   * Then two guards, both of which are the literal FAIL conditions of A104:
   * the segment guard Aloy's bow draw already uses (`_clearArmOfHead`), and a
   * shaft guard — the haft is a 1.85 m lever and a wrist that clears her skull
   * can still sweep the pole through it.
   */
  _solveRight(w, u) {
    const an = this.an, b = an.b;
    _hTab.copy(_hand);
    // elbow pole: down-and-back, opened outward as the hand rises, so the
    // elbow stays BESIDE the ribs (canon) instead of lifting over the shoulder
    const lift = clamp((_hand.y - 1.02) * 2.2, -0.4, 1);
    const path = this._pathOn;
    if (path) {
      /* THE DRAW / HOLSTER (round 6, R8): the elbow goes FORWARD and out, in
       * front of her face-plane, and the hand comes back over the shoulder to
       * the haft — never the round-5 elbow up behind her head. The pole only
       * chooses the side of the elbow circle; `_elbowGuard` holds the bound. */
      _pole.set(-0.50, -0.30, 0.81).normalize();
    } else {
      /* a low hand's elbow goes BACK beside the ribs, a raised hand's opens outward:
       * "out" at the guard stood the upper arm level with her shoulder (filmed) */
      const up = Math.max(0, lift);
      _pole.set(-0.36 - 0.54 * up, -0.80 + 0.28 * up, -0.62 + 0.28 * up).normalize();
    }
    an._ikArm('r', _hand, _pole, w, null);
    an._clearArmOfHead(b.upArmR, b.loArmR, b.handR, _hand, _pole, w);
    // on the arm path the wrist correction may not spend the elbow roll
    this._rollOff = path;
    this._alignHaft(w);

    /* HAFT GUARD (gate A104). The wrist can clear her skull and the 1.85 m
     * lever still sweep through it — and through her neck, her spine and her
     * ponytail, which SWINGS: light 3's overhead measured 0.031 m to a hair
     * bone against a 0.05 m bar, because the torso rotation that sells the
     * chop is also what throws the braid forward. The haft is rigid in the
     * hand, so moving the hand moves every
     * point on it one-for-one: the correct push is straight AWAY FROM the bone
     * the haft is closest to, not "outward" along some authored lateral.
     *
     * FIX ROUND 1 pushed `_hand.x` away from the midline, and on light 2's
     * contact that made it WORSE: the butt trails on the far side of the hand,
     * so shoving the hand right shoves the butt left, into her chest. Filmed
     * at 0.100 m against a 0.12 m bar.
     *
     * Four passes; it only engages on the tightest contacts. */
    /* NOT DURING THE DRAW OR THE HOLSTER. The stowed haft lies ALONG her back
     * by design — that is the whole carry — so a guard tuned for a swing reads
     * the reach pose as a violation and shoves the hand away from the socket
     * it is trying to reach (filmed: the re-parent gap went from 0.085 m to
     * 0.385 m the moment the margins went up). The back carry's clearances are
     * A100's business and it measures them; this guard is for swings. */
    for (let i = 0; i < (this._guardOn ? 4 : 0); i++) {
      const push = this._clearDeficit();
      if (push <= 0) break;
      _d.subVectors(_gapPt, _gapBone);
      if (_d.lengthSq() < 1e-6) _d.set(_hand.x <= 0 ? -1 : 1, 0, 0.4);
      _d.normalize();
      _hand.addScaledVector(_d, push + 0.02);
      an._ikArm('r', _hand, _pole, w, null);
      an._clearArmOfHead(b.upArmR, b.loArmR, b.handR, _hand, _pole, w);
      this._alignHaft(w);
    }
    if (path) this._pathGuard(w);
    else if (this._guardOn) this._foreGuard(w);
    /* THE GUARDS MAY NOT POP: what they added to the table's hand changes by at
     * most GUARD_STEP a step, so a clearance that wakes up is a push and not a
     * jump of the far end of a 1.55 m lance (filmed: 0.66 m in a frame at a jog). */
    if (!path) {
      _hOff.subVectors(_hand, _hTab);
      _hOffD.subVectors(_hOff, this._guardOff);
      const m = Math.sqrt(_hOffD.x * _hOffD.x + _hOffD.y * _hOffD.y + _hOffD.z * _hOffD.z);
      if (m > GUARD_STEP) {
        _hOffD.multiplyScalar(GUARD_STEP / m);
        this._guardOff.add(_hOffD);
        _hand.copy(_hTab).add(this._guardOff);
        an._ikArm('r', _hand, _pole, w, null);
        an._clearArmOfHead(b.upArmR, b.loArmR, b.handR, _hand, _pole, w);
        this._alignHaft(w);
      } else this._guardOff.copy(_hOff);
    } else this._guardOff.subVectors(_hand, _hTab);
    this._rollOff = false;
  }

  /**
   * THE FOREARM STAYS OFF HER BELLY (round 6, ruling R9 — the r5 skeptic's
   * heavy follow-through at a jog and from a sprint-stop: the right forearm's
   * mesh 1.8-2.6 cm into her torso). The bone reading A104 gates was 0.19 m
   * off the pelvis->neck axis there — clear of the 0.10 m bar and still in
   * contact, because her belly is 0.12-0.15 m in front of that axis and a
   * forearm is ~0.05 m thick. So the swing keeps the forearm segment
   * `FORE_CLEAR` off the axis: when it is closer, the wrist goal moves straight
   * out from the axis by the deficit and the arm is solved again (twice at
   * most). Standing beats that already clear it are untouched.
   */
  _foreGuard(w) {
    const an = this.an, b = an.b, D = this._dbg;
    for (let i = 0; i < 2; i++) {
      an._charOf(b.loArmR.bone, _eE);
      an._charOf(b.handR.bone, _eH);
      an._charOf(b.pelvis.bone, _eS);
      an._charOf(b.neck1.bone, _eD);
      segSegDirN(_eE, _eH, _eS, _eD, _eU); const g = _sgNum[0];   // _eU: from the axis to the forearm
      if (!(g < FORE_CLEAR)) { if (i === 0) D.foreGuard = 0; return; }
      _eU.y = 0;
      if (_eU.lengthSq() < 1e-8) _eU.set(-1, 0, 0);
      _eU.normalize();
      _hand.addScaledVector(_eU, FORE_CLEAR - g + 0.01);
      an._ikArm('r', _hand, _pole, w, null);
      this._alignHaft(w);
      D.foreGuard = FORE_CLEAR - g;
    }
  }

  /**
   * THE DRAW/HOLSTER ELBOW BOUND, enforced on the solved arm (round 6, R8 —
   * see `ELB_BEHIND`). First the elbow circle about shoulder->wrist (the wrist
   * does not move); only if no point on that circle is legal does the WRIST
   * give way, forward and down, and the arm is re-solved. The grip is then
   * re-seated by pronation and wrist alone (`_rollOff`).
   */
  _pathGuard(w) {
    const an = this.an, D = this._dbg;
    let ok = this._elbowGuard();
    for (let i = 0; i < 5 && !ok; i++) {
      _hand.z += 0.05; _hand.y -= 0.035;
      an._ikArm('r', _hand, _pole, w, null);
      ok = this._elbowGuard();
    }
    if (!ok) D.elbowGuardFail = (D.elbowGuardFail || 0) + 1;
    this._alignHaft(w);
  }

  /** Is char-space elbow `E` inside the R8 bound (shoulder `_eS`, head `_eD`)? */
  _elbowOk(E) {
    if (E.y > _eD.y + ELB_OVER_HEAD) return false;
    if (E.y > _eS.y + ELB_BAND && E.z < _eD.z - ELB_BEHIND) return false;
    return true;
  }

  /**
   * Roll the right upper arm about shoulder->wrist to the NEAREST legal elbow
   * on its circle (every 10 deg, both ways), never through the head. Returns
   * false when the circle has no legal point. No allocation.
   */
  _elbowGuard() {
    const an = this.an, b = an.b, D = this._dbg;
    an._charOf(b.upArmR.bone, _eS);
    an._charOf(b.loArmR.bone, _eE);
    an._charOf(b.handR.bone, _eH);
    an._charOf(b.head.bone, _eD);
    if (this._elbowOk(_eE)) return true;
    _eAx.subVectors(_eH, _eS);
    const d = _eAx.length();
    if (d < 1e-4) return false;
    _eAx.multiplyScalar(1 / d);
    const along = _eT.subVectors(_eE, _eS).dot(_eAx);
    _eC.copy(_eS).addScaledVector(_eAx, along);
    _eU.subVectors(_eE, _eC);
    const r = _eU.length();
    if (r < 1e-3) return false;
    _eU.multiplyScalar(1 / r);
    _eV.crossVectors(_eAx, _eU);
    const step = (2 * Math.PI) / ELB_SAMPLES;
    for (let i = 1; i <= ELB_SAMPLES / 2; i++) {
      for (let sg = -1; sg <= 1; sg += 2) {
        const phi = sg * i * step;
        _eT.copy(_eC).addScaledVector(_eU, Math.cos(phi) * r).addScaledVector(_eV, Math.sin(phi) * r);
        if (!this._elbowOk(_eT)) continue;
        if (an._segInHead(_eS, _eT) || an._segInHead(_eT, _eH)) continue;
        _eQ.setFromAxisAngle(_eAx, phi);
        an._rotQL(b.upArmR, _eQ);
        D.elbowGuard = (D.elbowGuard || 0) + 1;
        return true;
      }
    }
    return false;
  }

  /**
   * Put the held haft on `_shaft` — and put the rotation where a human puts it.
   *
   * FIX ROUND 2. Round 1 dumped the whole correction on `hand_r` (clamped at
   * 1.15 rad) and the ready stance measured 38.6 deg short. Round 2 moved the
   * twist component onto the forearm and got ready to 11 deg — but the light-1
   * CONTACT pose still measured 31 deg off, with a 95.8 deg residual swing,
   * because a haft is held nearly PERPENDICULAR to the forearm (78.1 deg on
   * this rig, measured between `gripAxisChar` and the rest forearm) and
   * pronation can only sweep the haft around a cone at that half-angle. If the
   * cone misses the direction the beat asks for, no amount of wrist will get
   * there, and clamping the wrist is the only thing left.
   *
   * The missing degree of freedom is the ELBOW ROLL. Rotating the upper arm
   * about the SHOULDER->WRIST axis moves the elbow around its circle and does
   * not move the wrist at all (the wrist is on that axis) — it is exactly the
   * freedom `_rollElbow` spends on the bow draw — and it re-aims the forearm,
   * which re-aims the pronation cone. So the correction is spent in the order
   * a body spends it, largest joint first:
   *
   *   1. elbow roll about shoulder->wrist   (free; only the elbow moves)
   *   2. pronation about elbow->wrist       (free; only the hand's roll moves)
   *   3. whatever is left, on the wrist      (clamped: a wrist is not a hinge)
   *
   * Two passes, because step 1 changes the axis step 2 decomposes about. The
   * elbow roll is reverted if it puts a segment through her skull — that guard
   * is Kevin's "arm literally behind head in an odd position" and it outranks
   * any blade angle.
   */
  _alignHaft(w) {
    const an = this.an;
    const up = an.b.upArmR, lo = an.b.loArmR, ha = an.b.handR;
    if (!up || !lo || !ha) return;
    for (let pass = 0; pass < 2; pass++) {
      // --- the correction still outstanding, in char space
      an._liveW(ha.bone, _q1);
      _a.copy(this.gripDirL).applyQuaternion(_q1);
      _q2.setFromUnitVectors(_a, _shaft);
      if (Math.abs(_q2.w) > 0.99995) break;            // already there

      // --- 1. elbow roll about shoulder -> wrist (not on the draw/holster
      // arm path, round 6: that roll is what put the elbow behind her head)
      an._charOf(up.bone, _b);
      an._charOf(ha.bone, _c);
      _d.subVectors(_c, _b);
      if (!this._rollOff && _d.lengthSq() > 1e-6) {
        _d.normalize();
        if (this._twistAbout(_q2, _d, _q3)) {
          const ang = 2 * Math.acos(clamp(Math.abs(_q3.w), -1, 1));
          let k = w;
          if (ang > ELBOW_ROLL) k *= ELBOW_ROLL / ang;
          _q1.copy(_q3);
          if (k < 0.999) _q1.slerp(_qi(), 1 - k);
          an._rotQL(up, _q1);
          if (this._armInHead(up, lo, ha)) {
            _q1.invert();
            an._rotQL(up, _q1);                        // the skull wins
          } else {
            an._liveW(ha.bone, _q1);
            _a.copy(this.gripDirL).applyQuaternion(_q1);
            _q2.setFromUnitVectors(_a, _shaft);
          }
        }
      }

      // --- 2. pronation about elbow -> wrist
      an._charOf(lo.bone, _b);
      an._charOf(ha.bone, _c);
      _d.subVectors(_c, _b);
      if (_d.lengthSq() > 1e-6) {
        _d.normalize();
        if (this._twistAbout(_q2, _d, _q3)) {
          const ang = 2 * Math.acos(clamp(Math.abs(_q3.w), -1, 1));
          this._dbg.foreTwistDeg = ang * 180 / Math.PI;
          let k = w;
          if (ang > FORE_TWIST) k *= FORE_TWIST / ang;
          _q1.copy(_q3);
          if (k < 0.999) _q1.slerp(_qi(), 1 - k);
          an._rotQL(lo, _q1);
          an._liveW(ha.bone, _q1);
          _a.copy(this.gripDirL).applyQuaternion(_q1);
          _q2.setFromUnitVectors(_a, _shaft);
        }
      }

      // --- 3. the residual, on the wrist
      const ang = 2 * Math.acos(clamp(Math.abs(_q2.w), -1, 1));
      this._dbg.wristSwingDeg = ang * 180 / Math.PI;
      let k = w;
      if (ang > WRIST_SWING) k *= WRIST_SWING / ang;
      if (k < 0.999) _q2.slerp(_qi(), 1 - k);
      an._rotQL(ha, _q2);
    }
    an._liveW(ha.bone, _q1);
    _a.copy(this.gripDirL).applyQuaternion(_q1);
    this._dbg.shaftErrDeg = Math.acos(clamp(_a.dot(_shaft), -1, 1)) * 180 / Math.PI;
  }

  /**
   * Swing-twist: the component of `q` about the unit axis `ax`, into `out`.
   * False when the decomposition is degenerate (`q`'s axis perpendicular to
   * `ax`), which is the one case where a twist cannot help.
   */
  _twistAbout(q, ax, out) {
    const dot = q.x * ax.x + q.y * ax.y + q.z * ax.z;
    out.set(ax.x * dot, ax.y * dot, ax.z * dot, q.w);
    if (out.lengthSq() < 1e-8) return false;
    out.normalize();
    return true;
  }

  /** Does either arm segment cross the head ellipsoid (the Kevin guard)? */
  _armInHead(up, lo, ha) {
    const an = this.an;
    an._charOf(up.bone, _sgA);
    an._charOf(lo.bone, _sgB);
    an._charOf(ha.bone, _sgC);
    return an._segInHead(_sgA, _sgB) || an._segInHead(_sgB, _sgC);
  }

  /* ---------------------------- measurement ----------------------------- */

  /** Shoulder line vs hip line, in degrees (the readable torso twist). */
  /**
   * THE LEFT ARM. Free (`lhW` 0) it goes to the table's wrist goal `_lh`. On the
   * haft (`lhW` 1) the palm centre goes to the mark `lhOn` metres ahead of the
   * right grip, on the prop's axis, and when the arm cannot reach that mark the
   * hand takes the farthest point of the haft it can (the haft runs through the
   * front hand). The wrist goal is the palm goal less the hand's own palm offset,
   * which depends on how the hand ends up turned, so it is solved twice.
   */
  _solveLeft(w, u) {
    const an = this.an, b = an.b, D = this._dbg;
    const on = clamp(u.lhW || 0, 0, 1) * w;
    if (on > 1e-3) _pole.set(0.82, -0.54, 0.16).normalize();
    else _pole.set(0.72, -0.62, -0.18).normalize();
    if (on <= 1e-3) {
      an._ikArm('l', _lh, _pole, w, null);
      an._clearArmOfHead(b.upArmL, b.loArmL, b.handL, _lh, _pole, w);
      this._clearLeftArmOfBow(w);
      D.lhOnNow = null;
      this._lhOnW = 0;
      return;
    }
    /* what the late passes (`postFix`) need to seat this hand again on the haft
     * the renderer will draw: its weight, its place on the haft and the free goal */
    this._lhOnW = on;
    this._lhArmW = w;
    this._lhOnWant = (u.lhOn || 0) * (this._lhK || 1);
    this._lhFree.copy(_lh);
    this._seatLeft(on, w, this._lhOnWant, 0);
  }

  /**
   * THE LEFT HAND ON THE HAFT, from wherever the haft is NOW (fix round 1).
   *
   * Split out of `_solveLeft` so the last pass of the frame can run it again:
   * `postFix` turns the right hand after this layer (the hand guard rotates the
   * haft off her braid and spine by up to 0.3 rad a pass, the hull pass pulls the
   * fist in), and the left palm, 0.3-0.5 m down the haft, was left behind by
   * 0.06-0.15 m on light-2's live strike (A101) while the layer's own error read
   * 0-0.04. `slide` moves the goal along the haft (m, + toward the tip): the
   * forearm-off-the-belly fallback below and the hull pass use it.
   */
  _seatLeft(on, w, sWant, slide) {
    const an = this.an, b = an.b, D = this._dbg;
    _pole.set(0.82, -0.54, 0.16).normalize();
    this._gripChar(_grip);
    this._shaftChar(_a);
    an._charOf(b.upArmL.bone, _eS);
    const reach = (an._lenUpL + an._lenLoL) * 0.975 + LH_PALM;
    let sOn = sWant + slide;
    _b.subVectors(_grip, _eS);
    const bd = _b.dot(_a), disc = bd * bd - (_b.lengthSq() - reach * reach);
    const sFar = disc >= 0 ? -bd + Math.sqrt(disc) : -bd;
    this._lhReachLack = disc >= 0 ? 0 : Math.sqrt(-disc);
    if (sOn > sFar) sOn = sFar;
    if (sOn < LH_ON_MIN) sOn = LH_ON_MIN;
    D.lhOnNow = sOn;
    this._lhSOn = sOn;
    _d.copy(_grip).addScaledVector(_a, sOn);          // the palm goal
    _slG.copy(_d);
    for (let pass = 0; pass < 5; pass++) {
      an._liveW(b.handL.bone, _q1);
      _c.copy(this.palmOffLL).applyQuaternion(_q1);
      _eC.subVectors(_slG, _c);                       // the wrist goal on the haft
      _lh.copy(this._lhFree).lerp(_eC, on);
      an._ikArm('l', _lh, _pole, w, null);
      an._clearArmOfHead(b.upArmL, b.loArmL, b.handL, _lh, _pole, w);
      /* the knuckle line along the haft, index toward the blade */
      an._liveW(b.handL.bone, _q1);
      _b.copy(this.gripDirLL).applyQuaternion(_q1);
      _q2.setFromUnitVectors(_b, _a);
      const ang = 2 * Math.acos(clamp(Math.abs(_q2.w), -1, 1));
      let k = on;
      if (ang > 2.6) k *= 2.6 / ang;
      if (k < 0.999) _q2.slerp(_qi(), 1 - k);
      an._rotQL(b.handL, _q2);
      /* turns the pole when the forearm lies on her belly: the next pass solves with
       * it and re-seats the palm. Round 5 stopped after two turns, and A104 read the
       * left forearm 0.084-0.088 m off the spine on light-1's last recover frame and
       * light-2's windup: up to four now, and the loop ends once it is clear. */
      if (pass >= 4 || !this._leftElbowOut()) {
        if (pass >= 2) break;
      }
    }
    /* one last small correction: whatever the turn moved the palm by */
    an._charOf(b.handL.bone, _c);
    an._liveW(b.handL.bone, _q1);
    _b.copy(this.palmOffLL).applyQuaternion(_q1).add(_c);
    D.lhPalmErr = _b.distanceTo(_slG);
    return D.lhPalmErr;
  }

  /** The left forearm's distance to her pelvis->neck axis, on the live bones (char). */
  _leftForeGap() {
    const an = this.an, b = an.b;
    an._charOf(b.loArmL.bone, _lbE);
    an._charOf(b.handL.bone, _lbH);
    an._charOf(b.pelvis.bone, _lbA);
    an._charOf(b.neck1.bone, _lbB);
    segSegN(_lbE, _lbH, _lbA, _lbB);
    return _sgNum[0];
  }

  /** The left knuckle line's centre against the live haft (char); the number A101 reads. */
  _leftPalmGap() {
    const K = this._knuckleL;
    if (!K) return 0;
    const an = this.an;
    this._gripChar(_grip);
    this._shaftChar(_a);
    _slB.copy(_grip).addScaledVector(_a, -this.gripFrac * this.length);
    _slT.copy(_grip).addScaledVector(_a, (1 - this.gripFrac) * this.length);
    an._charOf(K.i, _slP);
    an._charOf(K.p, _slF);
    _slP.add(_slF).multiplyScalar(0.5);
    segPointN(_slB, _slT, _slP);
    return _sgNum[0];
  }

  /**
   * THE LEFT HAND SEATED AGAIN ON THE FINAL HAFT (fix round 1; `postFix`, after
   * the right hand's late passes). Runs only when the left hand is on the haft
   * and something moved it off (> 0.012 m) or laid the forearm on her belly
   * (< 0.115 m off the axis; A104's bar is 0.10). If the turn alone does not clear the belly, the
   * palm slides toward the blade in 0.03 m steps (at most 0.12 m, never past
   * her reach): moving the hand away along the haft moves the forearm off her.
   */
  _reseatLeft() {
    const D = this._dbg;
    const on = this._lhOnW;
    D.lhReseat = 0;
    if (!(on > 1e-3) || !this._held || !this.an.b.handL) return;
    const g0 = this._leftPalmGap(), f0 = this._leftForeGap();
    D.lhGapPre = g0;
    if (g0 <= 0.012 && f0 >= 0.115) { D.lhGapPost = g0; return; }
    let slide = 0;
    this._seatLeft(on, this._lhArmW, this._lhOnWant, slide);
    D.lhReseat = 1;
    let f = this._leftForeGap();
    while (f < 0.115 && slide < 0.12 && this._lhSOn >= this._lhOnWant + slide - 1e-4) {
      slide += 0.03;
      this._seatLeft(on, this._lhArmW, this._lhOnWant, slide);
      D.lhReseat++;
      f = this._leftForeGap();
    }
    D.lhSlide = slide;
    D.lhGapPost = this._leftPalmGap();
  }

  /**
   * THE LEFT FIST OUT OF THE METAL TOO (fix round 1, A106 S5). `_armHullGuard`
   * and `_armHullFinal` kept only the drive arm out of a hull; the left arm rides
   * the haft and a Tiller's shin swept into it (r5: 0.3 mm inside; the judge's run:
   * 20 mm). On the final matrices: the left elbow turns about shoulder -> wrist
   * (the palm stays on the haft), then the palm slides back along the haft toward
   * the right hand in 0.04 m steps until the forearm is `ARM_CLEAR_FINAL` clear.
   */
  _leftHullFinal(an) {
    const D = this._dbg;
    D.armHullFinalL = 0;
    if (!(this._lhOnW > 1e-3)) return;
    const st = D.stance;
    if (st !== 'swing' && st !== 'ready') return;
    const mel = this.ctx.combat?.melee;
    const hulls = mel && typeof mel.armHulls === 'function' ? mel.armHulls() : null;
    if (!hulls || !hulls.length) return;
    an.model.updateWorldMatrix(true, false);
    const M = an.model.matrixWorld;
    _ahSh.set(0, 0, 0);
    const goal = ARM_CLEAR - ARM_CLEAR_FINAL;
    let worst = this._armDeficitL(hulls, M);
    D.armHullDefL = worst;
    if (!(worst > goal)) return;
    let n = 0;
    if (this._armRollOutL(hulls, M, worst)) { n += 100; worst = this._armDeficitL(hulls, M); }
    let slide = 0;
    while (worst > goal && slide > -0.36 && this._lhSOn > LH_ON_MIN + 1e-3) {
      slide -= 0.04;
      this._seatLeft(this._lhOnW, this._lhArmW, this._lhOnWant, slide);
      if (this._armRollOutL(hulls, M, this._armDeficitL(hulls, M))) n += 100;
      worst = this._armDeficitL(hulls, M);
      n++;
    }
    D.armHullFinalL = n;
    D.armHullDefL = worst;
  }

  /** `_armDeficit` for the LEFT forearm (elbow -> knuckle centre), world. */
  _armDeficitL(hulls, M) {
    const an = this.an, b = an.b;
    an._charOf(b.loArmL.bone, _ahE).add(_ahSh).applyMatrix4(M);
    const K = this._knuckleL;
    if (K && K.i && K.p) {
      an._charOf(K.i, _ahH);
      an._charOf(K.p, _ahF);
      _ahF.add(_ahH).multiplyScalar(0.5).add(_ahSh).applyMatrix4(M);
    } else an._charOf(b.handL.bone, _ahF).add(_ahSh).applyMatrix4(M);
    return this._segHullDeficit(hulls, _ahE, _ahF, false);
  }

  /** `_armRollOut` for the left arm: the upper arm turns about shoulder -> wrist,
   *  the hand stays where it is on the haft. True if it turned. */
  _armRollOutL(hulls, M, now) {
    const an = this.an, b = an.b;
    an._charOf(b.upArmL.bone, _eS);
    an._charOf(b.loArmL.bone, _eE);
    an._charOf(b.handL.bone, _eH);
    _eAx.subVectors(_eH, _eS);
    const d = _eAx.length();
    if (d < 1e-4) return false;
    _eAx.multiplyScalar(1 / d);
    const along = _eT.subVectors(_eE, _eS).dot(_eAx);
    _eC.copy(_eS).addScaledVector(_eAx, along);
    _eU.subVectors(_eE, _eC);
    const r = _eU.length();
    if (r < 1e-3) return false;
    _eU.multiplyScalar(1 / r);
    _eV.crossVectors(_eAx, _eU);
    const K = this._knuckleL;
    if (K && K.i && K.p) {
      an._charOf(K.i, _ahH);
      an._charOf(K.p, _ahF);
      _ahF.add(_ahH).multiplyScalar(0.5).add(_ahSh).applyMatrix4(M);
    } else _ahF.copy(_eH).add(_ahSh).applyMatrix4(M);
    an._charOf(b.pelvis.bone, _lbA);
    an._charOf(b.neck1.bone, _lbB);
    const step = Math.PI / 12;
    let best = now, bestPhi = 0;
    for (let i = 1; i <= 8; i++) {
      for (let sg = -1; sg <= 1; sg += 2) {
        const phi = sg * i * step;
        _eT.copy(_eC).addScaledVector(_eU, Math.cos(phi) * r).addScaledVector(_eV, Math.sin(phi) * r);
        if (an._segInHead(_eS, _eT) || an._segInHead(_eT, _eH)) continue;
        /* never onto her belly: the turned forearm keeps A104's 0.10 m */
        segSegN(_eT, _eH, _lbA, _lbB);
        if (_sgNum[0] < 0.10) continue;
        _ahE.copy(_eT).add(_ahSh).applyMatrix4(M);
        const def = this._segHullDeficit(hulls, _ahE, _ahF, false);
        if (def <= 1e-4) { best = 0; bestPhi = phi; i = 99; break; }
        if (def < best - 0.01) { best = def; bestPhi = phi; }
      }
    }
    if (bestPhi === 0) return false;
    _eQ.setFromAxisAngle(_eAx, bestPhi);
    an._rotQL(b.upArmL, _eQ);
    return true;
  }

  /**
   * A LOW TWO-HANDED GRIP MAY NOT LAY THE LEFT FOREARM ON HER BELLY (A104; Kevin's
   * "arms crossing into her body"): when the forearm is within `LEFT_FORE_CLEAR` of
   * the pelvis->neck axis, the elbow pole turns about shoulder->wrist, away from the
   * axis, for the next pass of the solve. (Rolling the solved arm instead left the palm
   * off the haft: the hand turned with it, and A101 read 0.08 m.)
   */
  _leftElbowOut() {
    const an = this.an, b = an.b;
    an._charOf(b.loArmL.bone, _lbE);
    an._charOf(b.handL.bone, _lbH);
    an._charOf(b.pelvis.bone, _lbA);
    an._charOf(b.neck1.bone, _lbB);
    segSegN(_lbE, _lbH, _lbA, _lbB); const g = _sgNum[0];
    if (!(g < LEFT_FORE_CLEAR)) return false;
    an._charOf(b.upArmL.bone, _lbS);
    _lbU.subVectors(_lbH, _lbS);
    const ul = _lbU.length();
    if (ul < 1e-4) return false;
    _lbU.multiplyScalar(1 / ul);
    /* the elbow's radius about shoulder->wrist, and which way round is away from the axis */
    _lbF.subVectors(_lbE, _lbS);
    _lbF.addScaledVector(_lbU, -_lbF.dot(_lbU));
    const r = _lbF.length();
    if (r < 1e-3) return false;
    _lbV.crossVectors(_lbU, _lbF).multiplyScalar(1 / r);   // the elbow's tangent
    const away = _lbV.x * (_ss.x - _segNear.x) + _lbV.y * (_ss.y - _segNear.y) + _lbV.z * (_ss.z - _segNear.z);
    const sign = away >= 0 ? 1 : -1;
    const ang = Math.min(0.9, (LEFT_FORE_CLEAR - g) / r * 1.6) * sign;
    _pole.applyAxisAngle(_lbU, ang);
    return true;
  }

  /**
   * The free left arm (light-3) stays off the stowed bow's limb: the wrist goal
   * and the elbow pole are pushed away from it. Same bar as Round 4 (A104).
   */
  _clearLeftArmOfBow(w) {
    const D = this._dbg;
    if (w < 0.01 || !this._bowChar(_lbA, _lbB)) { D.leftArmToBow = null; return; }
    const an = this.an, b = an.b;
    let g = 9;
    for (let it = 0; it < 4; it++) {
      an._charOf(b.upArmL.bone, _lbS);
      an._charOf(b.loArmL.bone, _lbE);
      an._charOf(b.handL.bone, _lbH);
      _lbF.subVectors(_lbH, _lbE);
      const fl = _lbF.length();
      if (fl > 1e-6) _lbF.multiplyScalar(0.09 / fl);
      _lbF.add(_lbH);
      segSegDirN(_lbS, _lbE, _lbA, _lbB, _lbU); const gU = _sgNum[0];
      segSegDirN(_lbE, _lbF, _lbA, _lbB, _lbV); const gF = _sgNum[0];
      g = Math.min(gU, gF);
      if (g >= BOW_ARM_CLEAR || it === 3) break;
      const push = BOW_ARM_CLEAR - g + 0.01;
      if (gF <= gU) {
        _lh.addScaledVector(_lbV, push);
        _pole.addScaledVector(_lbV, 0.6).normalize();
      } else {
        _pole.addScaledVector(_lbU, 1.2).normalize();
        _lh.addScaledVector(_lbU, push);
      }
      an._ikArm('l', _lh, _pole, w, null);
      an._clearArmOfHead(b.upArmL, b.loArmL, b.handL, _lh, _pole, w);
    }
    D.leftArmToBow = g;
  }

  /** The left arm to the stowed bow, read only (a hand on the haft; cold path). */
  _leftArmBowGap() {
    if (!this._bowChar(_lbA, _lbB)) return null;
    const an = this.an, b = an.b;
    an._charOf(b.upArmL.bone, _lbS);
    an._charOf(b.loArmL.bone, _lbE);
    an._charOf(b.handL.bone, _lbH);
    segSegN(_lbS, _lbE, _lbA, _lbB); const gU = _sgNum[0];
    segSegN(_lbE, _lbH, _lbA, _lbB); const gF = _sgNum[0];
    return gU < gF ? gU : gF;
  }

  _twistDeg() {
    const an = this.an, b = an.b;
    if (!b.clavL || !b.clavR || !b.thighL || !b.thighR) return 0;
    an._charOf(b.clavL.bone, _a);
    an._charOf(b.clavR.bone, _b);
    const sh = Math.atan2(_a.x - _b.x, _a.z - _b.z);
    an._charOf(b.thighL.bone, _a);
    an._charOf(b.thighR.bone, _b);
    const hp = Math.atan2(_a.x - _b.x, _a.z - _b.z);
    let d = sh - hp;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d * 180 / Math.PI;
  }

  /** Live grip point (char space): where the haft meets the palm. */
  _gripChar(out) {
    const an = this.an, bone = an.b.handR.bone;
    an._charOf(bone, out);
    an._liveW(bone, _q1);
    _b.copy(this.palmOffL).applyQuaternion(_q1);
    return out.add(_b);
  }

  /** Live shaft direction (char space, butt -> tip). */
  _shaftChar(out) {
    const an = this.an;
    an._liveW(an.b.handR.bone, _q1);
    return out.copy(this.gripDirL).applyQuaternion(_q1).normalize();
  }

  /**
   * Smallest distance from the live haft segment to the axial bones (and, when
   * `where` is set, the two points that realise it — `_gapBone` is the bone and
   * `_gapPt` the point on the haft, which is the push direction the guard
   * above needs).
   */
  _shaftGap(where = false) {
    const an = this.an;
    this._gripChar(_grip);
    this._shaftChar(_c);
    _butt.copy(_grip).addScaledVector(_c, -this.gripFrac * this.length);
    _tip.copy(_grip).addScaledVector(_c, (1 - this.gripFrac) * this.length);
    let best = 9;
    for (let ci = 0; ci < CLEAR_BONES.length; ci++) {
      const e = an.b[CLEAR_BONES[ci]];
      if (!e) continue;
      an._charOf(e.bone, _d);
      segPointN(_butt, _tip, _d); const g = _sgNum[0];
      if (g < best) {
        best = g;
        if (where) { _gapBone.copy(_d); _gapPt.copy(_segNear); }
      }
    }
    return best;
  }

  /**
   * How far the wrist goal has to move for the haft to clear everything, in
   * metres (<= 0 when it already does). `_gapBone` / `_gapPt` are left on the
   * offending pair, which is the push direction `_solveRight` uses.
   *
   * The braid is guarded at a smaller radius than bone: hair is soft, it is
   * simulated AFTER this layer (so these are last frame's strands), and a haft
   * that grazes it reads fine — what does not read is a pole through the
   * ponytail, which is what light 3's overhead was doing.
   */
  _clearDeficit() {
    const axial = this._shaftGap(true);
    let worst = SHAFT_CLEAR - axial;
    /* THE SKULL, not its joint: \`Head\` is the skull's base, and the haft of a cock
     * can pass over that joint and through her face (filmed at a jog: the head
     * rides 0.2 m forward of where the table was written). */
    const an = this.an;
    if (an.skull) {
      const R = an.skull(_skA, _skB);
      const rr = Math.max(R.x, R.y, R.z) + SKULL_CLEAR;
      segPointN(_butt, _tip, _skA);
      const g = _sgNum[0];
      this._dbg.skullGap = g - rr + SKULL_CLEAR;
      if (rr - g > worst) { worst = rr - g; _gapBone.copy(_skA); _gapPt.copy(_segNear); }
    }
    let hair = 9, argmin = -1;
    const P = this._hairPos;
    for (let i = 0, j = 0; i < this._hairN; i++, j += 3) {
      _d.set(P[j], P[j + 1], P[j + 2]);
      segPointN(_butt, _tip, _d); const g = _sgNum[0];
      if (g < hair) {
        hair = g; argmin = i;
        if (HAIR_CLEAR - g > worst) { worst = HAIR_CLEAR - g; _gapBone.copy(_d); _gapPt.copy(_segNear); }
      }
    }
    this._dbg.hairClearGuard = hair;
    this._hairArgmin = argmin;
    return worst;
  }

  /**
   * This frame's ponytail, in char space, into a flat buffer.
   *
   * All 32 `dyn_hairBack*` bones — the same set `debug().hairClear` reports and
   * A104 gates. Read once per pose instead of per guard pass: four passes over
   * four bones (round 1) cost 16 matrix walks and could only see four strands;
   * one pass over 32 costs 32 and sees every one of them. Called again from
   * `postFix()`, where the spring chains have already run, so the last word on
   * clearance is checked against the braid the renderer will actually draw.
   */
  _cacheHair() {
    const an = this.an, P = this._hairPos;
    for (let i = 0, j = 0; i < this._hairN; i++, j += 3) {
      an._charOf(this._hairBones[i], _d);
      P[j] = _d.x; P[j + 1] = _d.y; P[j + 2] = _d.z;
    }
  }

  /**
   * How far the prop WOULD jump if it re-parented on this frame, computed
   * without touching the scene graph: both candidate world positions of the
   * butt are read straight off the two parents' world matrices. This is the
   * number that makes the draw honest — the hand meets the haft where the haft
   * already is, so the hand-over is a sub-centimetre event and A102's
   * "no teleport > 0.5 m/frame" clause holds across it.
   */
  _reparentGap(frac) {
    const an = this.an;
    const handBone = an.b.handR?.bone;
    if (!this.lance || !handBone || !this.socketBone) return 0;
    // held: where the butt would be, in char space, if the hand took it now
    an._charOf(handBone, _a);
    an._liveW(handBone, _q2);
    _a.add(_c.copy(this.gripDirL).multiplyScalar(-frac * this.length)
      .add(this.palmOffL).applyQuaternion(_q2));
    // holstered: the BOUNDED socket's butt point — the same one `_poseHolstered`
    // writes, so this is the gap the hand-over would actually see
    this._liveSocket(_c, _rgDir);
    return Math.round(_a.distanceTo(_c) * 1e4) / 1e4;
  }

  /**
   * The cheap per-frame reads only. Everything a gate wants that costs a
   * matrix walk lives in `debug()` instead — this runs 60 times a second
   * behind `A9-perf-budget` and `_shaftGap()` (six `updateWorldMatrix` calls)
   * has already been paid for by the guard in `_solveRight`.
   */
  _measure() {
    const an = this.an, D = this._dbg;
    D.shaftClear = this._shaftGap();
    an._charOf(an.b.loArmR.bone, _a);
    an._charOf(an.b.handR.bone, _b);
    an._charOf(an.b.head.bone, _d);
    D.elbowOverHead = _a.y - _d.y;
    D.forearmCross = Math.max(_a.x, _b.x);
    /* THE CROSSING THAT MATTERS IS THE ONE INTO HER BODY.
     *
     * A104 says "the swinging forearm never crosses the body midline by more
     * than 0.10 m inward", and read as a bare x-coordinate that fails every
     * follow-through in the canon: `lance-light-follow.jpg` has the lance tip
     * past the machine's far shoulder, which puts her right hand well over
     * her own midline — out in FRONT of her, half a metre clear of her chest.
     * Kevin's complaint was never "the hand went past the middle", it was
     * "arms crossing INTO her body". So the inward crossing is measured where
     * it can actually be that: the closest the forearm segment comes to the
     * spine axis (pelvis -> neck). Both numbers are published; `forearmCross`
     * is the literal x read and `forearmToSpine` the physical one. */
    an._charOf(an.b.pelvis.bone, _c);
    an._charOf(an.b.neck1.bone, _d);
    segSegN(_a, _b, _c, _d); D.forearmToSpine = _sgNum[0];
    /* AND THE OTHER FOREARM (fix round 4, finding F7).
     *
     * Kevin's complaint — "arms crossing into her body" — is about ARMS, and
     * only the drive arm was ever measured. The left one is the arm that gets
     * dragged across the chest by a two-handed beat, because the hand is being
     * pulled onto a haft that is out in front of the right shoulder; light-3's
     * thrust is exactly that beat. Published unconditionally and gated by A104
     * on the frames where the left hand is actually ON the shaft
     * (`leftHandToShaft <= 0.05`), at the same 0.10 m bar as the right. */
    an._charOf(an.b.loArmL.bone, _sgA);
    an._charOf(an.b.handL.bone, _sgB);
    segSegN(_sgA, _sgB, _c, _d); D.forearmToSpineL = _sgNum[0];
    D.torsoYawDeg = this._twistDeg();
    // the SOLVED hand orientation, for next frame's reach target (see _reachPose)
    an._liveW(an.b.handR.bone, this._handQ);
    // ...and the solved wrist, for a draw that reverses a holster (`_captureFrom`)
    an._charOf(an.b.handR.bone, this._handLast);
    this._handLastOk = true;
  }

  /**
   * Numbers the gates read. Cold path.
   *
   * Everything geometric here is read off the PROP's own world matrix and
   * mapped into character space, not off the hand — so it is equally true when
   * the lance is on her back, in the middle of a draw, or mid-swing, and a
   * gate can never be handed the pose the code intended instead of the pose
   * the renderer will draw.
   */
  debug() {
    const D = this._dbg;
    const an = this.an;
    an.model.updateMatrixWorld(true);
    const out = { ...D, held: this._held, gripFrac: this.gripFrac, length: this.length };
    if (!this.lance) return out;
    if (D.stance === 'holstered' && !this._held) this._poseHolstered();  // the hot path leaves it
    this.lance.updateWorldMatrix(true, false);
    _m4.copy(an.model.matrixWorld).invert().multiply(this.lance.matrixWorld);
    _butt.set(0, 0, 0).applyMatrix4(_m4);
    _tip.set(0, 0, this._localLen).applyMatrix4(_m4);
    _grip.set(0, 0, this.gripFrac * this._localLen).applyMatrix4(_m4);
    _c.subVectors(_tip, _butt).normalize();
    const mid = _mid.copy(_butt).add(_tip).multiplyScalar(0.5);   // NOT _a: reused below
    const f3 = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];

    // A101, measured against the live hand rather than the authored grip
    an._charOf(an.b.handR.bone, _b);
    an._liveW(an.b.handR.bone, _q1);
    _d.copy(this.palmOffL).applyQuaternion(_q1).add(_b);
    out.palmToAxis = +pointToLine(_d, _grip, _c).toFixed(4);
    _b.copy(this.gripDirL).applyQuaternion(_q1).normalize();
    out.gripAngleDeg = +(Math.acos(clamp(_b.dot(_c), -1, 1)) * 180 / Math.PI).toFixed(2);
    an._charOf(an.b.handL.bone, _b);
    out.leftHandToShaft = +Math.min(
      segPoint(_butt, _tip, _b), pointToLine(_b, _grip, _c),
    ).toFixed(4);
    /* ...and to the HAFT itself, butt to tip (round 5). The number above takes
     * the nearer of the segment and the INFINITE line through it, which is
     * right for "is the hand gripping the pole" and wrong for "is the free hand
     * clear of it": the line runs on past the butt, through the air behind her
     * fist. A101's one-handed clause (ruling R1) reads this one. */
    out.leftHandToHaft = +segPoint(_butt, _tip, _b).toFixed(4);

    // A100: how the carry sits against the upper back
    // THE UPPER-BACK CENTRE IS A SURFACE, NOT A BONE. `spine_04`/`spine_05`
    // are on her spinal AXIS; the back she wears things on is BACK_DEPTH
    // behind it — measured on this rig from the two things already stowed
    // there (the ponytail root sits 0.11 m behind the axis, the bow group
    // 0.23 m). Both numbers are reported so the bar cannot be read as moved.
    an._charOf(an.b.spine4.bone, _b);
    an._charOf(an.b.spine5.bone, _d);
    _b.add(_d).multiplyScalar(0.5);
    out.midToSpine = +mid.distanceTo(_b).toFixed(3);
    _d.set(_b.x, _b.y, _b.z - BACK_DEPTH);   // char space: +Z is forward, full stop
    out.backCentre = f3(_d);
    out.midToBack = +mid.distanceTo(_d).toFixed(3);
    out.bowClear = this._bowChar(_bwA, _bwB) ? +segSeg(_butt, _tip, _bwA, _bwB).toFixed(4) : null;
    { const g = this._leftArmBowGap(); out.leftArmToBow = g == null ? null : +g.toFixed(4); }
    // which node that number is about — null when the bow is in her hand, so
    // a gate can tell "clear" from "not stowed, nothing to be clear of"
    { const kit = this.ctx.player?.hero?.kit;
      out.bowStowed = !!kit && !(kit.hidden & 2) && this._bowLine; }
    out.shaftTiltDeg = +(Math.acos(clamp(Math.abs(_c.y), -1, 1)) * 180 / Math.PI).toFixed(2);
    an._charOf(an.b.upArmR.bone, _d);
    out.tipAboveShoulder = +(_tip.y - _d.y).toFixed(3);
    out.tipRightOfSpine = +(-_tip.x).toFixed(3);

    // A104: how close the haft passes to the axial chain / the hair
    let clear = 9, hair = 9;
    for (const name of CLEAR_BONES) {
      const e = an.b[name];
      if (!e) continue;
      an._charOf(e.bone, _d);
      clear = Math.min(clear, segPoint(_butt, _tip, _d));
    }
    let hairArg = -1;
    for (let i = 0; i < this._hairN; i++) {
      an._charOf(this._hairBones[i], _d);
      const g = segPoint(_butt, _tip, _d);
      if (g < hair) { hair = g; hairArg = i; }
    }
    out.shaftClear = +clear.toFixed(4);
    out.hairClear = +hair.toFixed(4);
    out.hairArgmin = hairArg >= 0 ? (this._hairBones[hairArg].name || null) : null;
    out.hairBones = this._hairN;

    out.torsoYawDeg = +this._twistDeg().toFixed(2);
    out.butt = f3(_butt); out.tipChar = f3(_tip); out.grip = f3(_grip);
    out.shaft = f3(_c); out.mid = f3(mid);
    out.socket = {};
    this._liveSocket(_a, _rgDir);
    out.socket.butt = f3(_a);
    out.socket.dir = f3(_rgDir);
    out.socket.tiltDeg = +(Math.acos(clamp(_rgDir.y, -1, 1)) * 180 / Math.PI).toFixed(2);
    out.socket.grabFrac = +this._grabFrac.toFixed(3);
    out.clips = this.set ? this.set.order.map((l) => l.name) : [];
    out.parent = this.lance.parent?.name || null;
    /* BLADE FORWARD OF THE HAND (A101), MEASURED RATHER THAN ASSERTED.
     * Round 1 published `(1 - gripFrac) * length`, which is the definition of
     * the grip fraction restated and cannot fail. What the clause is about is
     * where the BLADE is relative to the fist: how far the tip is in front of
     * the grip along her facing, and how much haft is left behind the wrist.
     * Both come off the prop's own world matrix. */
    out.bladeAhead = +(_tip.z - _grip.z).toFixed(3);
    out.bladeLen = +((1 - this.gripFrac) * this.length).toFixed(3);
    an._charOf(an.b.handR.bone, _d);
    out.buttToWrist = +_butt.distanceTo(_d).toFixed(3);
    out.carryBlend = +this._carryB.toFixed(3);
    /* THE LEFT HAND ON THE HAFT, off the LIVE bones and the prop's own matrix:
     * the left knuckle line's centre against the haft segment (A101's
     * two-handed clause, A-heavy-two-hand). `leftHandToHaft` is the wrist joint. */
    if (this._knuckleL) {
      an._charOf(this._knuckleL.i, _a);
      an._charOf(this._knuckleL.p, _b);
      _d.addVectors(_a, _b).multiplyScalar(0.5);
      out.leftPalmToHaft = +segPoint(_butt, _tip, _d).toFixed(4);
      _c.subVectors(_tip, _butt).normalize();
      out.leftKnuckleAlongDeg = +(Math.acos(clamp(Math.abs(_b.subVectors(_a, _b).normalize().dot(_c)), 0, 1)) * 180 / Math.PI).toFixed(1);
      out.leftGripFrac = +(_d.clone().sub(_butt).dot(_c) / this.length).toFixed(3);
    }
    // diagnostics for the carry bound: what the BOUND thinks it wrote, next to
    // what the prop's own matrix says, so a disagreement is visible
    this._backCentre(_skC);
    out.backCentreNow = [+_skC.x.toFixed(3), +_skC.y.toFixed(3), +_skC.z.toFixed(3)];
    out.postFixN = this._pfN || 0;

    // INDEPENDENT grip check. Everything above is derived from the same
    // `gripDirL` the pose writes, so it cannot fail; this one re-reads the
    // LIVE knuckle bones (which the finger curl moves after the arm solve) and
    // measures the haft against them. If the prop ever comes off the hand,
    // this is the number that says so.
    if (this._knuckle.i && this._knuckle.p) {
      an._charOf(this._knuckle.i, _a);
      an._charOf(this._knuckle.p, _b);
      _d.subVectors(_a, _b);
      out.gripAxisDeg = _d.lengthSq() > 1e-8
        ? +(Math.acos(clamp(_d.normalize().dot(_c), -1, 1)) * 180 / Math.PI).toFixed(2) : null;
      /* THE LIVE KNUCKLE LINE, PUBLISHED (fix round 2, A101).
       * The gate needs a direction that belongs to the HAND and not to the
       * grip transform, so it can ask two independent questions: did the hand
       * actually move through the beat, and did the haft stay on it. A prop
       * bolted to a dead arm answers the first with zero. */
      if (_d.lengthSq() > 1e-8) out.handAxis = f3(_d);
      _a.add(_b).multiplyScalar(0.5);
      out.knuckleToAxis = +pointToLine(_a, _grip, _c).toFixed(4);
    }

    // world-space reads the gates sample per frame
    this.lance.updateWorldMatrix(true, false);
    _a.set(0, 0, this._localLen).applyMatrix4(this.lance.matrixWorld);
    out.tipWorld = f3(_a);
    _a.set(0, 0, this.gripFrac * this._localLen).applyMatrix4(this.lance.matrixWorld);
    out.gripWorld = f3(_a);
    an._charOf(an.b.handR.bone, _a);
    out.handChar = f3(_a);
    /* THE LOWER BODY, IN CHARACTER SPACE (fix pass 2, the film judge's blocker).
     * Published so A102 can gate what the judge measured with a pixel diff: the
     * four contact panels must not share one pair of legs and one shadow. The
     * pelvis and the two knees are the three points a silhouette reads — the
     * feet are deliberately NOT part of the clause (the foot lock pins them by
     * design, and it is the pelvis and the knees that carry the stance). */
    if (an.b.pelvis) { an._charOf(an.b.pelvis.bone, _a); out.pelvisChar = f3(_a); }
    if (an.b.calfL) { an._charOf(an.b.calfL.bone, _a); out.kneeLChar = f3(_a); }
    if (an.b.calfR) { an._charOf(an.b.calfR.bone, _a); out.kneeRChar = f3(_a); }
    if (an.b.footL) { an._charOf(an.b.footL.bone, _a); out.footLChar = f3(_a); }
    if (an.b.footR) { an._charOf(an.b.footR.bone, _a); out.footRChar = f3(_a); }
    /* THE FACE, KEPT CLEAR (round 5, orchestrator ruling R3). A vertical
     * cylinder of radius 0.16 m on the head bone, from `HEAD_CYL_DROP`
     * under it upward: how close the drive FOREARM (elbow -> wrist) and the
     * HAFT (butt -> tip) come to its axis, horizontally, over the part of each
     * that is up at face height. 9 = nothing up there. A104 gates it on the
     * heavy's contact and follow-through, where round 4 put the fist in front
     * of her face. */
    an._charOf(an.b.head.bone, _d);
    an._charOf(an.b.loArmR.bone, _a);
    an._charOf(an.b.handR.bone, _b);
    out.headChar = f3(_d);
    out.elbowRChar = f3(_a);
    out.headCylForearm = +headCylDist(_a, _b, _d).toFixed(4);
    out.headCylHaft = +headCylDist(_butt, _tip, _d).toFixed(4);
    return out;
  }

  /**
   * How close the haft comes to the STOWED BOW's limb axis, in metres — V48's
   * "does not intersect the quiver/bow" clause, as a number.
   *
   * Fix round 1. V48 was judged off a screenshot and the judge was right: at
   * `SOCKET.MID.z = -0.245` the two diagonals passed 0.099 m apart, under a
   * hand's width, and from a dead-back view they read as one X. Nothing
   * measured it, so nothing could catch it. This does — the bow's own world
   * matrix, its limb axis sampled at +-0.75 m (the mesh's own half-extent),
   * mapped into char space and measured segment-to-segment against the haft.
   *
   * The bow group is looked up lazily and re-looked-up if it is swapped: the
   * combat lane owns it, it is stowed on `spine_03`, and this lane may not
   * touch it — so the LANCE is what moves to make room.
   */
  /** World-space tip of the live lance (gates / trail). */
  tipWorld(out) {
    if (!this.lance) return null;
    this.lance.updateWorldMatrix(true, false);
    out.set(0, 0, this._localLen).applyMatrix4(this.lance.matrixWorld);
    return out;
  }

  /** World-space grip point of the live lance. */
  gripWorld(out) {
    if (!this.lance) return null;
    this.lance.updateWorldMatrix(true, false);
    out.set(0, 0, this.gripFrac * this._localLen).applyMatrix4(this.lance.matrixWorld);
    return out;
  }

  /* ---------------------------- clip weights ---------------------------- */

  _clipWeights(active, weight, t, idleName, idleW) {
    if (!this.set) return;
    const order = this.set.order;
    for (let li = 0; li < order.length; li++) {
      const layer = order[li];
      const on = layer.name === active;
      const onIdle = idleName && layer.name === idleName;
      const wv = on ? weight : (onIdle ? idleW : 0);
      layer.setWeight(wv);
      layer.setIntent(wv);
      if (on) layer.scrub(clamp(t, 0, 0.999));
      else if (onIdle) layer.scrub((this._idleT || 0) % 1);
    }
  }

  /**
   * LAST WORD ON CLEARANCE. Called by the animator at the very end of its
   * frame, after the twist layer, the ground conform and the `dyn_` spring
   * chains — which is to say after everything that can still move her spine
   * and after the ponytail has been simulated.
   *
   * The guard inside the arm solve cannot be the whole story: it runs several
   * layers early, and it is avoiding LAST frame's braid. Under load (sixteen
   * lanes on one GPU, ~12 fps) the damped layers that follow overshoot further
   * and the braid swings wider, and the same swing that measures 0.147 m to
   * bone and 0.051 m to hair on a quiet box measured 0.087 m and 0.012 m on a
   * busy one. That is not a pose problem, it is a "the pose was correct when I
   * looked and then three more layers ran" problem.
   *
   * So the final pose is checked and, if the haft still fouls something, the
   * HAND is rotated about its own origin until it does not — the smallest
   * possible correction, clamped, applied where nothing else will overwrite
   * it. The blade angle gives way to the skull and the braid, never the other
   * way round.
   */
  postFix() {
    if (!this.ok) return;
    this._pfN = (this._pfN || 0) + 1;
    /* RE-READ THE CHARACTER FRAME FIRST (fix round 2).
     * `BoneSpace` caches `inv(model.matrixWorld)` once, at the top of the
     * animator's frame. Everything below works in character space and several
     * of the carry's bounds are AXIS-dependent (raise the tip, push outboard),
     * so a stale frame is not a small error during a dodge roll — the root
     * rotates through most of a revolution inside one update and the bound
     * ends up clamping in a frame that no longer means "up". Measured: the
     * bound reported a 0.265 m midpoint on a prop the gate then read at
     * 0.176 m. This is the last pass of the frame, so re-syncing here cannot
     * disturb a layer that has already run. */
    this.an.space?.syncFrame?.();
    /* THE CARRY IS WRITTEN LAST (fix round 2).
     *
     * `_settleLance` runs inside the pose pass, and the ground conform, the
     * twist layer and the `dyn_` spring chains all move `spine_02` afterwards
     * — so the bounded socket the carry was clamped into and the segment the
     * renderer actually drew were two different lines. Measured on a dodge
     * roll: A100's midpoint bound is 0.235 m and the drawn haft read 0.359 m,
     * i.e. the bound had no authority over the thing the gate measures. Posing
     * the stowed prop again here, off the final matrices, makes the bound and
     * the measurement the same statement. It is an absolute local write, so
     * doing it twice costs one `_liveSocket` and changes nothing else. */
    if (this.lance && !this._held && this._dbg.stance !== 'holstered') this._poseHolstered();
    /* the pelvis shift the animator really applied after this layer this
     * frame (stance offset + conform clamp), for next frame's arm checks */
    if (this.w > 0.001 && this.an.b.upArmR) {
      if (this._pelvisShiftOk) this._pelvisShiftPrev.copy(this._pelvisShift);
      this.an._charOf(this.an.b.upArmR.bone, this._pelvisShift);
      this._pelvisShift.sub(this._pelvisPre);
      if (!this._pelvisShiftOk) this._pelvisShiftPrev.copy(this._pelvisShift);
      this._pelvisShiftOk = true;
    } else this._pelvisShiftOk = false;
    // the braid AFTER the spring sim — the strands the renderer will draw
    this._cacheHair();
    const an = this.an, e = an.b.handR;
    if (e && this._held && this._guardOn && this.w >= 0.2) this._handOffSelf(an, e);
    if (e && this._held && this.w >= 0.2) this._armHullFinal(an);
    /* ...AND THE LEFT HAND FOLLOWS THE HAFT THOSE TWO PASSES MOVED, then keeps its
     * own forearm out of the metal (fix round 1: A101 light-2, A104, A106) */
    if (e && this._held && this.w >= 0.2 && this._lhOnW > 1e-3) {
      this._reseatLeft();
      this._leftHullFinal(an);
      this._dbg.forearmToSpineL = this._leftForeGap();
    }
    /* THE BRAID GIVES WAY LAST, because the hand moved the haft above it.
     * Filmed with the order the other way round: `_hairOffHaft` pushed the
     * braid clear, then the hand guard rotated the haft back into it, and
     * light 3 measured 0.048 m of ponytail against A104's 0.05 bar. */
    if (this._held) this._dbg.shaftClear = this._shaftGap();
    /* THE CARRY SERVO MEASURES THE FINAL POSE, NOT THE RAW CLIP (fix round 2).
     * Round 1 ran it at the top of `update`, where the animator has just reset
     * every non-clip bone and re-applied the mixer: `spine_03` — which the
     * stowed BOW is rigid on — is still in the locomotion clip's pose, so the
     * servo was steering off a bow that was a whole pose pass out of date. It
     * read 0.135 m of clearance while the prop the renderer drew had 0.070 m,
     * and therefore never pushed. Here it reads the matrices that get drawn;
     * the value it computes is spent by `_liveSocket` on the NEXT frame, which
     * is the same one-frame lag every damped layer in this rig already has. */
  }

  /**
   * THE FIST OUT OF THE METAL, ON THE MATRICES THAT GET DRAWN (round 6, Oct
   * 2). `_armHullGuard` runs inside the pose pass and has to PREDICT where the
   * arm will be drawn: the stance's pelvis offset and the conform clamp move
   * the whole upper body after this layer, and it uses last frame's shift.
   * Through a heavy's recover that offset changes fastest (the deepest stance
   * rising back up, the spine still pitched in), and the prediction was off by
   * up to 0.09 m: a Tower's foot lattice measured the knuckles 0.08 m
   * inside a bar the guard had scored 0.012 m clear. Here, on the final
   * matrices: if the forearm or fist is INSIDE a hull (past `ARM_CLEAR`), the
   * wrist is drawn straight back toward the shoulder in 0.04 m steps and the
   * arm re-solved until it clears, or the arm is folded to its 0.25 m floor.
   * The lance rides the hand. Nothing allocates; nothing runs unless the fist
   * is in a hull.
   */
  _armHullFinal(an) {
    const st = this._dbg.stance;
    if (st !== 'swing' && st !== 'ready') return;
    const mel = this.ctx.combat?.melee;
    const hulls = mel && typeof mel.armHulls === 'function' ? mel.armHulls() : null;
    if (!hulls || !hulls.length) return;
    an.model.updateWorldMatrix(true, false);
    const M = an.model.matrixWorld;
    _ahSh.set(0, 0, 0);                        // nothing moves the body after this
    let worst = this._armDeficit(hulls, M);
    this._dbg.armHullFinal = 0;
    const goal = ARM_CLEAR - ARM_CLEAR_FINAL;   // the deficit that leaves ARM_CLEAR_FINAL of daylight
    if (!(worst > goal)) return;
    const b = an.b;
    an._charOf(b.handR.bone, _ahG);
    let steps = 0, rolls = 0;
    while (worst > goal && steps < 16) {
      /* the ELBOW first: a folded arm's elbow is what pokes forward into a
       * bar (the fist is already by her shoulder) — round it on its circle
       * about shoulder -> wrist to the clearest angle (the wrist stays) */
      if (rolls < 3 && this._armRollOut(hulls, M, worst, Math.PI)) {
        rolls++;
        this._rollOff = true; this._alignHaft(1); this._rollOff = false;
        worst = this._armDeficit(hulls, M);
        if (!(worst > goal)) break;
      }
      an._charOf(b.upArmR.bone, _ahA);
      _ahX.subVectors(_ahA, _ahG);
      const lx = _ahX.length();
      if (lx < 0.27) break;
      _ahG.addScaledVector(_ahX, Math.min(0.04, lx - 0.25) / lx);
      an._ikArm('r', _ahG, _pole, 1, null);
      this._alignHaft(1);
      worst = this._armDeficit(hulls, M);
      steps++;
    }
    /* ...and if the arm is folded as far as it goes and still in, it is her
     * LEAN that has put her shoulder at the metal (a heavy's spine pitch puts
     * the drive shoulder 0.23 m ahead of her root; a Tower's foot bars are
     * 0.48 m out): she straightens out of it — the upper spine pitched back
     * in 0.03 rad steps, arm and lance riding along rigidly, at most 0.36
     * rad. */
    let backs = 0;
    while (worst > goal && backs < 6 && b.spine2 && b.spine3) {
      an._rot(b.spine2, X_AXIS, -0.03);
      an._rot(b.spine3, X_AXIS, -0.03);
      backs++;
      worst = this._armDeficit(hulls, M);
    }
    this._dbg.armHullFinal = steps + rolls * 100 + backs * 1000;
    this._dbg.armHullFinalLeft = worst;
  }

  /** The hand guard's three passes (see `postFix`). */
  _handOffSelf(an, e) {
    for (let i = 0; i < 3; i++) {
      const push = this._clearDeficit();
      if (push <= 0) break;
      // rotate the haft about the hand until the offending point clears
      _a.subVectors(_gapPt, _grip);           // grip -> the fouling point
      const r = _a.length();
      if (r < 0.05) break;
      _b.subVectors(_gapPt, _gapBone);        // the direction to move it
      if (_b.lengthSq() < 1e-8) break;
      _b.normalize();
      _c.crossVectors(_a, _b);
      if (_c.lengthSq() < 1e-10) break;
      _c.normalize();
      _q1.setFromAxisAngle(_c, clamp(push / r, -0.30, 0.30));
      an._rotQL(e, _q1);
    }
  }

  /** Advance the layer clocks (NOT the mixer — the animator steps that). */
  step(dt) {
    this._idleT = ((this._idleT || 0) + dt * 0.24) % 1;
    if (this.set) this.set.update(dt, false);
  }

  dispose() {
    if (this.set) {
      for (const layer of this.set.order) {
        try { layer.action.stop(); this.an.mixer?.uncacheAction?.(layer.action.getClip()); } catch { /* torn down */ }
        try { this.an.mixer?.uncacheClip?.(layer.action.getClip()); } catch { /* torn down */ }
      }
      this.set.layers = Object.create(null);
      this.set.order.length = 0;
      this.set = null;
    }
    this.lance = null;
    this.socketBone = null;
    /* the post-swing settle's pose snapshot: a plain struct, but it is the one
     * object this layer creates outside the constructor, so it is released
     * here with everything else (fix pass 1) */
    this._swingOut = null;
    this._settleT = SETTLE_T;
    this._bow = null;
    this._hairBones.length = 0;
    this._hairPos = null;
    this._hairN = 0;
    this._knuckle = { i: null, p: null };
    this.ok = false;
  }
}

/* ------------------------------- helpers -------------------------------- */

/**
 * Distance from point P to the segment AB. The closest point on AB is left in
 * `_segNear` — the haft guard pushes along (P -> that point), so it needs both.
 */
const _segNear = new THREE.Vector3();
/** The hot paths read a distance from here: a double returned across a call is
 *  a heap number (R48 c). `segPointN`, `segSegN`, `segSegDirN` fill it. */
const _sgNum = new Float64Array(1);
function segPoint(A, B, P) {
  _seg.subVectors(B, A);
  const l2 = _seg.lengthSq();
  let t = l2 > 1e-9 ? (P.x - A.x) * _seg.x + (P.y - A.y) * _seg.y + (P.z - A.z) * _seg.z : 0;
  t = l2 > 1e-9 ? clamp(t / l2, 0, 1) : 0;
  _segNear.set(A.x + _seg.x * t, A.y + _seg.y * t, A.z + _seg.z * t);
  return Math.hypot(_segNear.x - P.x, _segNear.y - P.y, _segNear.z - P.z);
}

/**
 * Distance between segments AB and CD. Iterative, allocation-free and good to
 * a millimetre in 12 steps — the analytic form needs four scratch vectors this
 * module would then carry for one caller.
 */
function segSeg(A, B, C, D) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    segPointN(C, D, _lerp3(A, B, a, _ss)); const fa = _sgNum[0];
    segPointN(C, D, _lerp3(A, B, b, _ss)); const fb = _sgNum[0];
    if (fa < fb) hi = b; else lo = a;
  }
  return segPoint(C, D, _lerp3(A, B, (lo + hi) * 0.5, _ss));
}

/**
 * `segSeg`, plus the unit direction that moves AB AWAY from CD, in `out`.
 *
 * FIX ROUND 2. The carry servo used to push along -Z and nothing else, which
 * is the right escape from the ponytail (the braid lies between the haft and
 * her spine) and the WRONG one from the stowed bow during a dodge roll: the
 * bow is rigid on `spine_03`, that bone curls through most of a right angle,
 * and the direction that opens the gap turns with it. Measured across four
 * consecutive roll frames the clearance went 0.127 -> 0.0996 -> 0.067 ->
 * 0.0274 m with the -Z servo at its ceiling the whole time. The mutual
 * perpendicular is the direction that actually buys clearance.
 */
function segPointN(A, B, P) {
  const ax = A.x, ay = A.y, az = A.z;
  const ex = B.x - ax, ey = B.y - ay, ez = B.z - az;
  const l2 = ex * ex + ey * ey + ez * ez;
  let t = l2 > 1e-9 ? ((P.x - ax) * ex + (P.y - ay) * ey + (P.z - az) * ez) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const nx = ax + ex * t, ny = ay + ey * t, nz = az + ez * t;
  _segNear.x = nx; _segNear.y = ny; _segNear.z = nz;
  const dx = nx - P.x, dy = ny - P.y, dz = nz - P.z;
  _sgNum[0] = Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Closest points of segments AB and CD (closed form): `_ss` on AB, `_segNear` on CD. */
function segSegN(A, B, C, D) {
  const d1x = B.x - A.x, d1y = B.y - A.y, d1z = B.z - A.z;
  const d2x = D.x - C.x, d2y = D.y - C.y, d2z = D.z - C.z;
  const rx = A.x - C.x, ry = A.y - C.y, rz = A.z - C.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  if (a > 1e-9 || e > 1e-9) {
    if (a <= 1e-9) { t = f / e; t = t < 0 ? 0 : t > 1 ? 1 : t; } else {
      const c = d1x * rx + d1y * ry + d1z * rz;
      if (e <= 1e-9) { s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; } else {
        const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
        if (den > 1e-12) { s = (b * f - c * e) / den; s = s < 0 ? 0 : s > 1 ? 1 : s; }
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; } else if (t > 1) { t = 1; s = (b - c) / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
      }
    }
  }
  const px = A.x + d1x * s, py = A.y + d1y * s, pz = A.z + d1z * s;
  const qx = C.x + d2x * t, qy = C.y + d2y * t, qz = C.z + d2z * t;
  _ss.x = px; _ss.y = py; _ss.z = pz;
  _segNear.x = qx; _segNear.y = qy; _segNear.z = qz;
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  _sgNum[0] = Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function segSegDirN(A, B, C, D, out) {
  segSegN(A, B, C, D);
  const x = _ss.x - _segNear.x, y = _ss.y - _segNear.y, z = _ss.z - _segNear.z;
  const l2 = x * x + y * y + z * z;
  if (l2 > 1e-12) { const i = 1 / Math.sqrt(l2); out.x = x * i; out.y = y * i; out.z = z * i; } else out.set(0, 0, -1);
}
function segSegDir(A, B, C, D, out) {
  segSegN(A, B, C, D); const d = _sgNum[0];
  // segSeg leaves the closest point on AB in `_ss` and the one on CD in
  // `_segNear` (segPoint's own out-param, written by its final call)
  out.subVectors(_ss, _segNear);
  const l = out.length();
  if (l > 1e-6) out.multiplyScalar(1 / l); else out.set(0, 0, -1);
  return d;
}
const _ss = new THREE.Vector3();
function _lerp3(A, B, t, out) {
  return out.set(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t);
}

/** Distance from point P to the infinite line through O with unit direction D. */
function pointToLine(P, O, D) {
  const dx = P.x - O.x, dy = P.y - O.y, dz = P.z - O.z;
  const t = dx * D.x + dy * D.y + dz * D.z;
  return Math.hypot(dx - D.x * t, dy - D.y * t, dz - D.z * t);
}
