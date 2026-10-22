/**
 * CALIMA · rig profile for the Quaternius Universal Base Characters skeleton
 * (65 joints, UE-mannequin names without numeric suffixes) — Brea's rig
 * (hero-body W0b; plan E1, E2, E3; promoted from tools/r5-poc/ubcRig.js).
 *
 * A body hands the KEPT stack (Retargeter, ClipLibrary, LocomotionBlend,
 * PlayerAnimator, springs, controller, camera) everything that is specific to
 * it on `root.userData.rigProfile`. Everything here is JSON-safe (the profile
 * survives SkeletonUtils.clone through Object3D.copy's userData clone):
 *
 *   name, key, map, aim, contacts, feet, fingerAxes      the Round-5 seams
 *   orbitCaps        camera-orbit capsules by UBC bone name (player.js)
 *   hairChain        the A33 / chainOf('hair') target chain root
 *   handCollider     the M10 spring-side capsule: draw hand + forearm
 *   tune             the ~12 aim/draw constants re-derived on Brea's 0.475 m arm
 *   bow              the Lmax solve: draw length, `pull` per bow, arrow length
 *
 * Bind (pack frame): T-pose, +Y up, +Z forward, metres; +X is her LEFT. The
 * game normalises the body to 1.72 m (scale 0.969), so `tune` and `bow` are in
 * GAME metres, character space (x left, y up, z forward), exactly like the
 * Round-4 constants they replace.
 */
import * as THREE from 'three';
import { AIM_RULES } from '../boneMap.js';

/** UAL (Rigify DEF-*, the UAL1 clip source in public/anims, R15) -> UBC. 52 pairs. */
export const UAL_TO_UBC = {
  'DEF-hips': 'pelvis',
  'DEF-spine.001': 'spine_01',
  'DEF-spine.002': 'spine_02',
  'DEF-spine.003': 'spine_03',
  'DEF-neck': 'neck_01',
  'DEF-head': 'Head',
  'DEF-shoulder.L': 'clavicle_l', 'DEF-shoulder.R': 'clavicle_r',
  'DEF-upper_arm.L': 'upperarm_l', 'DEF-upper_arm.R': 'upperarm_r',
  'DEF-forearm.L': 'lowerarm_l', 'DEF-forearm.R': 'lowerarm_r',
  'DEF-hand.L': 'hand_l', 'DEF-hand.R': 'hand_r',
  'DEF-thigh.L': 'thigh_l', 'DEF-thigh.R': 'thigh_r',
  'DEF-shin.L': 'calf_l', 'DEF-shin.R': 'calf_r',
  'DEF-foot.L': 'foot_l', 'DEF-foot.R': 'foot_r',
  'DEF-toe.L': 'ball_l', 'DEF-toe.R': 'ball_r',
};
for (const side of ['L', 'R']) {
  const s = side.toLowerCase();
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    for (const k of ['01', '02', '03']) UAL_TO_UBC[`DEF-f_${f}.${k}.${side}`] = `${f}_${k}_${s}`;
  }
  for (const k of ['01', '02', '03']) UAL_TO_UBC[`DEF-thumb.${k}.${side}`] = `thumb_${k}_${s}`;
}

/**
 * The animator's short keys -> UBC bones. UBC has 3 spine + 1 neck where the
 * Round-4 rig had 5 + 2: spine1..3 take the three real joints, spine4/spine5
 * ALIAS spine_03 (the melee carry bound reads their positions), neck2 and the
 * face (eyes, lids) are absent — the eyes are a mesh on `Head`.
 */
export const UBC_KEY = {
  pelvis: 'pelvis',
  spine1: 'spine_01', spine2: 'spine_02', spine3: 'spine_03',
  spine4: 'spine_03', spine5: 'spine_03',
  neck1: 'neck_01', neck2: null, head: 'Head',
  clavL: 'clavicle_l', clavR: 'clavicle_r',
  upArmL: 'upperarm_l', upArmR: 'upperarm_r',
  loArmL: 'lowerarm_l', loArmR: 'lowerarm_r',
  handL: 'hand_l', handR: 'hand_r',
  thighL: 'thigh_l', thighR: 'thigh_r',
  calfL: 'calf_l', calfR: 'calf_r',
  footL: 'foot_l', footR: 'foot_r',
  ballL: 'ball_l', ballR: 'ball_r',
};

export const UBC_CONTACTS = ['foot_l', 'foot_r', 'ball_l', 'ball_r'];
export const UBC_FEET = { FOOT_L: 'foot_l', FOOT_R: 'foot_r', BALL_L: 'ball_l', BALL_R: 'ball_r' };

/**
 * Camera-orbit capsules (player.js `_orbitProxyReady`): [boneA, boneB, radius,
 * occluderFlag]. The Round-4 list named `middle_03_l_end` / `ball_l_end` /
 * `head`; on UBC the terminators are `*_04_leaf_*` / `ball_leaf_*` and the head
 * is `Head`, so the proxy silently lost its hand, foot and head capsules.
 */
export const UBC_ORBIT_CAPS = [
  ['lowerarm_l', 'hand_l', 0.05], ['hand_l', 'middle_04_leaf_l', 0.06], ['hand_l', 'thumb_04_leaf_l', 0.04],
  ['lowerarm_r', 'hand_r', 0.05], ['hand_r', 'middle_04_leaf_r', 0.06], ['hand_r', 'thumb_04_leaf_r', 0.04],
  ['upperarm_l', 'lowerarm_l', 0.07, 1], ['upperarm_r', 'lowerarm_r', 0.07, 1],
  ['clavicle_l', 'upperarm_l', 0.09, 1], ['clavicle_r', 'upperarm_r', 0.09, 1],
  ['thigh_l', 'calf_l', 0.10], ['calf_l', 'foot_l', 0.07], ['foot_l', 'ball_leaf_l', 0.06],
  ['thigh_r', 'calf_r', 0.10], ['calf_r', 'foot_r', 0.07], ['foot_r', 'ball_leaf_r', 0.06],
  ['pelvis', 'spine_01', 0.17, 1], ['spine_01', 'spine_02', 0.17, 1],
  ['spine_02', 'spine_03', 0.17, 1], ['spine_03', 'neck_01', 0.12, 1],
  ['neck_01', 'Head', 0.10], ['Head', 'Head', 0.14],
];
/** dyn_ chains whose segments get orbit capsules (wrap tail, knot tail, sash end). */
export const UBC_ORBIT_CHAINS = { cloth: '^dyn_(wrapSash|sashEnd)', hair: '^dyn_hairKnotTail' };

/**
 * M10 — the spring-side capsule on the DRAW hand + forearm (bible §3.5). It
 * replaces the Round-4 braid guard (which matched `dyn_hairBack*` by name and
 * was inert on any other rig). Every dyn_ particle is pushed out of it every
 * substep; `A-wrap-clear` reads `animator.debugHandCollider()`.
 */
export const UBC_HAND_COLLIDER = { from: 'lowerarm_r', to: 'hand_r', tip: 'middle_04_leaf_r', r: 0.09 };
/** The hand/forearm's own half-thickness: A-wrap-clear's clearance is axis distance minus this. */
export const UBC_HAND_HALF = 0.035;

/**
 * The aim/draw constants re-derived on Brea (character space, GAME metres, the
 * head offsets relative to the `Head` joint at bind). Round-4 values in
 * comments. Derivation and measurements: docs/ROUND5-HERO-BODY.md §3.
 */
export const UBC_TUNE = {
  // hip-quiver nock cluster the string hand dips to (stowkit-v0 quiverNocksGame)
  quiverHip: [-0.255, 1.205, 0.055],              // (-0.2, 1.02, -0.14)
  // the draw anchor on the right jaw corner, head-bind frame offset from `Head`
  anchorOff: [-0.072, 0.034, 0.052],               // (-0.086, -0.024, 0.118)
  anchorDrop: 0.030,                               // 0.038
  handAnchorR: 0.060,                              // 0.064
  handAnchorFrom: 0.72,                            // 0.72
  // head keep-out ellipsoid (centre offset + semi-axes), measured: the box of
  // Brea_Skin's Head-weighted vertices above the jaw line (1st-99th percentile,
  // head-bind frame) is x +-0.0778, y 0.023..0.205, z -0.092..0.123 off `Head`;
  // the ellipsoid is that box's inscribed one plus 5 mm of skin/wrap margin.
  // The hand may rest at 0.985 of it (the anchor is ON the face, not in it).
  headOff: [0, 0.114, 0.016],                      // (0, 0.05, 0.01)
  headR: [0.083, 0.096, 0.113],                    // (0.105, 0.135, 0.115)
  handIn: 0.985,                                   // 0.90
  bowArmLock: 0.9945,                              // 0.9945
  // rest bow-hold seed and its reach along the aim (char space)
  restGrip: [0.14, 1.42, 0.03], restReach: 0.40,   // (0.14, 1.42, 0.03), 0.42
  // aim-ray origin before the first achieved grip: forward, height
  rayFwd: 0.42, rayH: 1.42,                        // 0.45, 1.43
  // string hand behind the nock; the loose: the hand slides back along the jaw
  // from the anchor by looseKick at the kick's peak (bible §5.2: 8-12 cm), not
  // out along the un-clamped string line (Oct 22: 0.30 m, the arm behind the head)
  // fix round 3: the wrist 6.0 cm behind the nock (was 7.6): with the draw
  // no longer sliding back off the anchor (`drawProtDown`, the re-derived
  // pull) the wrist sits 8-9.5 cm in front of the back of the skull at full
  // draw, which is the room the loose has (`looseClear`); knuckles still 0/6
  // inside the posed head mesh at every gate pitch (Oct 22 probe)
  handBehindNock: 0.060, looseKick: 0.11,          // 0.068, 0.075
  looseOnJaw: true,
  // the loose (fix round 3; judge r0: the wrist went 0.03-0.06 m BEHIND the
  // back of the skull at looseT 0.22-0.44): the kick runs back along the jaw
  // and `looseOut` of it out to her right, away from the face (`looseDown`
  // of it down the jaw line toward the neck), and a hard
  // guard holds the wrist `looseClear` m in front of the back of the skull on
  // every aimed frame (R35 "always in front of the back of the skull")
  looseOut: 0.6, looseDown: 0.25, looseClear: 0.012,
  // the draw hand is placed off the NOCK's anchor, not on it: the wrist
  // `handBehindNock` back along the arrow (UBC wrist -> middle knuckle 0.084 m:
  // the knuckle row at the jaw corner, inside A16's 0.09 m nock-to-hand bar) and
  // `handOut` to her right (the back of the hand outside the face; Oct 22 the
  // knuckles and thumb were inside the jaw mesh)
  // (fix round 3: 0.020 -> 0.026, the wrist a little further out of the face:
  // A35's hand-to-Head-joint read 0.1035 at the level aim with the draw no
  // longer sliding back, 3.5 mm over its 0.10 floor)
  anchorNock: true, handOut: 0.026,
  // ...and the wrist bent back this much (radians) at full draw, so the
  // knuckles ride outside the jaw and the hooked fingers curl in to the string
  drawWristExt: 0.35,
  // the bow's lateral offset off the anchor line (char +X = her left; Round 4
  // 0.035): Brea's string touches the jaw corner, a hair outside it
  gripOut: -0.008,
  // bow-arm elbow pole (char space)
  bowPole: [0.3, -0.95, 0.12],                     // same
  // the right eye relative to `Head` at bind (UBC Eyes mesh centre; alidade raise)
  eyeR: [-0.0334, 0.1030, 0.0717],
  // the string-side clavicle's elevation at full draw (radians): lifts the
  // shoulder joint toward the arrow line (V24 forearm-in-line; A16 holds the
  // elbow at or under that joint)
  drawShrug: 0.58,
  // the string-side scapula's retraction share at full draw (Round 4: 0.8):
  // with the shoulder lifted, less retraction keeps the elbow inside the
  // 0.10 m behind-the-skull bar (A-draw-elbow-level) with the forearm in line
  drawRetract: -0.10,
  // ...and at a steep down aim (Round 4: 0.8; fix round 1: 1.1), where the
  // elbow has to sit up-and-back of the hand along the falling arrow
  // (A-draw-elbow-level >= 0.05 m) AND level with the aim frame's shoulder
  // line: with the hand outside the jaw (fix round 2) 1.1 dropped it to
  // -0.036..-0.040 there; 0.5 reads -0.009, 0.055 behind the hand (Oct 22 probe)
  drawRetractDown: 0.5,
  // fix round 3: the bow shoulder's protraction share at a steep down aim
  // (1 = Round 4). The down aim's Lmax stood 0.02 m over the other three
  // pitches (0.553 vs 0.526-0.533), and the pull is cut to the largest, so the
  // other pitches slid their whole draw 2-4 cm back off the anchor — the draw
  // hand with it, toward the back of the skull. At 0.7 the four Lmax agree
  // within 0.004 m (0.528-0.532, Oct 22 sweep)
  drawProtDown: 0.7,
  // ...and a share of the draw shrug at the steep down aim (fix round 3): the
  // joint rises so the elbow can sit >= 0.05 m up-and-back of the hand along
  // the falling arrow (A-draw-elbow-level) AND under the shoulder joint (A16):
  // 0.057 -> 0.077 m behind the hand, -0.006 under the joint (Oct 22 sweep)
  drawShrugDown: 0.4,
  // the closed-loop chest blade (fix round 3): the shoulder line's yaw before
  // the stance and the blade, standing, is -0.311 rad at every gate pitch
  // (Oct 22 sweep); while aiming on the move the trunk is turned back to it
  // (the strafe / aim-walk loops left it 0.2-0.6 rad short, and the reach
  // clamp slid the draw 8.6-9.0 cm off the anchor)
  bladeLock: { ref: -0.311, gain: 1 },
  // the draw elbow's form scan (fix round 3; A-draw-elbow-level, R35): the
  // elbow is rolled on its shoulder -> wrist circle to the nearest point
  // inside the aim-frame height band `up` (m about the shoulder line), at
  // least `behindHand` back of the wrist along the arrow and at most
  // `behindHead` past the back of the skull (bars: [-0.03, 0.05], 0.05, 0.20)
  // (`looseDrop`: through the loose the height floor drops this much, m)
  elbowForm: { up: [-0.022, 0.04], behindHand: 0.072, behindHead: 0.17, looseDrop: 0.15 },
  // the string hand's roll at full draw (0..1 of the way to back-of-hand out,
  // palm to the neck): the hooked fingers stand on the vertical string and the
  // ∴ on the back of the right hand faces a side camera (V24)
  drawHandRoll: 1.0,
  // the anchor's height along the head's up axis by aim pitch (metres): level /
  // down aims 1.2 cm lower along the jaw, the -0.55 up-aim 1.6 cm higher (A35:
  // the hand 0.148 m from the skull there, under the 0.16 ceiling; 0.12 at the
  // 0.75 down aim, over the 0.10 floor)
  anchorPitch: { level: 0.0, up: 0.016, down: -0.012 },
  // aim pitch share [spine2, spine3, spine4(=spine_03 again), neck, head]
  pitchShare: [0.36, 0.32, 0.32, 0.0, 0.0],     // (0.14, 0.15, 0.13, 0.2, 0.28)
  pitchLive: true,                                 // about the live char X axis (bind-frame on Round 4)
  // Kevin's running arms (A-run-arms): wrists >= 0.27 m under the shoulder, >= 0.11 m off the midline
  // (+ swingBack: the arc's centre moved back, so an elbow passes >= 0.10 m behind the hip each stride)
  runArms: { wristDrop: 0.27, midGap: 0.11, swingBack: 0.40 },
  // A-run-arms "no prancing": the sprint clip bounces Brea's pelvis 0.13-0.15 m
  // p-p; the animator keeps `keep` of the excursion around a 0.4 s running mean
  // (planted legs re-solved), so the sprint reads 0.06-0.07 m
  runBob: { keep: 0.42, keepJog: 0.22, rate: 2.5 },
  // trunk posture (V12 / V3 / R10): the pelvis->neck line's forward pitch per
  // gait (radians, character space). The UAL1 clips ran Brea at 35 / 44 / 47
  // deg (jog / sprint / crouch-walk); the licence-clean run-side reference is
  // ~10 deg and the crouch-stalk reference a flat back at ~35-40 deg. Only the
  // excess is given back, spread up the spine (`share`), neck + head forward
  // by `gaze` of it so the eyes stay on the horizon.
  trunk: { walk: 0.17, jog: 0.23, sprint: 0.30, crouch: 0.63, gain: 1.15, share: [0.25, 0.35, 0.40], shareCrouch: [0.05, 0.30, 0.65], gaze: [0.5, 0.45] },
  // fix round 3 (V-brea-one-glance cue 2, bible §3.2 "a 0.40 m cloth tail
  // trailing left-rear"): the wrap tail's authored rest hangs flat down the
  // left of her spine and never left her outline at 64 px; its root -> end
  // line is turned out to her LEFT-REAR every frame before the springs (which
  // hang, bounce and collide it about that rest). Character space: +X her
  // left, -Z back; ~50 deg off the vertical, as a stiff wrapped tail in the
  // island's wind stands
  restKick: [{ bone: 'dyn_wrapSash_01', tip: 'dyn_wrapSash_end', dir: [0.55, -0.62, -0.56] }],
  // the Head bone's standing height over her feet (camera stance follow; Aloy's
  // head_0104 stood at 1.36, the Round-4 HEAD_REST); measured idle on flat ground
  headRest: 1.468,
};

/**
 * The Lmax solve (bible §3.8 step 2; gate A-lmax-solve). At full draw the
 * largest draw the locked bow arm can carry from the anchor is
 *   Lmax = -u·d + sqrt((u·d)^2 - |u|^2 + reach^2),  u = anchor - bow shoulder
 * measured live by the animator (`debugAim().lmax`) at the four gate pitches
 * (camPitch -0.55, -0.4, 0, 0.75). `drawLength` is the solve the bows are cut
 * to; each bow's `pull` = drawLength + its rest offset (restZ), and the arrow is
 * pull + 0.20 m. Filled from the measured solve (docs/ROUND5-HERO-BODY.md §3).
 */
export const UBC_BOW = {
  // measured Lmax on Brea (T-form elevation, pitchLive; fix round 1 draw form:
  // drawShrug, pitch-dependent anchor, level retraction), the range over the
  // fix-round runs (gate A-lmax-solve and probe diag1, Oct 19): 0.529-0.532 /
  // 0.524-0.530 / 0.526-0.533 / 0.541-0.550 m at camPitch -0.55 / -0.4 / 0 /
  // 0.75. Cut at the middle of the largest pitch's run-to-run spread, so every
  // run's solution stays within A-lmax-solve's +-0.01 (the reach clamp takes
  // the small excess as anchor drop / slide, never as a bent bow arm)
  // FIX ROUND 3 (Oct 22): with `drawProtDown` 0.7 the down aim no longer
  // stands over the others; the sweep's four-pitch Lmax: 0.5285-0.5301 /
  // 0.5291-0.5306 / 0.5272-0.5296 / 0.5284-0.5323 (two runs). The draw is cut
  // just under the run-to-run maximum so the slide at the other pitches is
  // ~1 cm, not 2-4 (was drawLength 0.548, pull 0.603, arrow 0.803)
  drawLength: 0.527,
  pitches: [-0.55, -0.4, 0, 0.75],
  lmaxMeasured: [[0.5285, 0.5301], [0.5291, 0.5306], [0.5272, 0.5296], [0.5284, 0.5323]],
  restZ: 0.055,
  pull: 0.582,
  arrowLen: 0.782,
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ax = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();

/**
 * Per-finger curl axis in BONE-LOCAL space, derived from the bind pose:
 * axis_char = fingerDir × palmNormal (palm faces -Y in a T-pose), so a positive
 * curl always turns the finger toward the palm, whatever the rig's local axes.
 */
export function deriveFingerAxes(root) {
  root.updateMatrixWorld(true);
  const invRootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const invRootM = root.matrixWorld.clone().invert();
  const out = {};
  const down = new THREE.Vector3(0, -1, 0);
  root.traverse((o) => {
    if (!o.isBone || !/^(index|middle|ring|pinky|thumb)_0[123]_[lr]$/.test(o.name)) return;
    const child = o.children.find((c) => c.isBone);
    if (!child) return;
    _a.setFromMatrixPosition(o.matrixWorld).applyMatrix4(invRootM);
    _b.setFromMatrixPosition(child.matrixWorld).applyMatrix4(invRootM);
    const dir = _b.sub(_a).normalize();
    _ax.crossVectors(dir, down).normalize();
    o.getWorldQuaternion(_q).premultiply(invRootQ);
    _ax.applyQuaternion(_qi.copy(_q).invert());
    out[o.name] = [+_ax.x.toFixed(5), +_ax.y.toFixed(5), +_ax.z.toFixed(5)];
  });
  return out;
}

/** True when `root` carries the UBC skeleton (exact UE-style names, no suffixes). */
export function isUbcRig(root) {
  let n = 0;
  root.traverse((o) => { if (o.isBone && (o.name === 'Head' || o.name === 'spine_03' || o.name === 'hand_r' || o.name === 'ball_leaf_l')) n++; });
  return n >= 4;
}

/** The JSON-safe profile the kept stack reads off `root.userData.rigProfile`. */
export function ubcProfile(root, name = 'ubc-brea') {
  return {
    name,
    key: UBC_KEY,
    map: UAL_TO_UBC,
    aim: AIM_RULES,
    contacts: UBC_CONTACTS,
    feet: UBC_FEET,
    fingerAxes: deriveFingerAxes(root),
    orbitCaps: UBC_ORBIT_CAPS,
    orbitChains: UBC_ORBIT_CHAINS,
    hairChain: 'dyn_hairKnotTail_01',
    // chain classes by name ahead of the Round-4 regexes (the alidade on its
    // cord is gear: A19's gear probe, chainOf('gear'))
    chainClasses: { gear: '^dyn_alidadeCord' },
    // Round-4 bone names kept systems still look up (combat.js bow back-stow)
    boneAliases: { spine_03_08: 'spine_02' },
    handCollider: UBC_HAND_COLLIDER,
    tune: UBC_TUNE,
    bow: UBC_BOW,
  };
}
