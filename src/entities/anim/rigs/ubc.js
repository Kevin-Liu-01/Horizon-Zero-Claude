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
  // head keep-out ellipsoid (centre offset + semi-axes) fitted to Brea's skull + wrap
  headOff: [0, 0.098, 0.004],                      // (0, 0.05, 0.01)
  headR: [0.098, 0.150, 0.118],                    // (0.105, 0.135, 0.115)
  handIn: 0.90,                                    // 0.90
  bowArmLock: 0.9945,                              // 0.9945
  // rest bow-hold seed and its reach along the aim (char space)
  restGrip: [0.14, 1.42, 0.03], restReach: 0.40,   // (0.14, 1.42, 0.03), 0.42
  // aim-ray origin before the first achieved grip: forward, height
  rayFwd: 0.42, rayH: 1.42,                        // 0.45, 1.43
  // string hand behind the nock, loose kick
  handBehindNock: 0.062, looseKick: 0.075,         // 0.068, 0.075
  // bow-arm elbow pole (char space)
  bowPole: [0.3, -0.95, 0.12],                     // same
  // the right eye relative to `Head` at bind (UBC Eyes mesh centre; alidade raise)
  eyeR: [-0.0334, 0.1030, 0.0717],
  // aim pitch share [spine2, spine3, spine4(=spine_03 again), neck, head]
  pitchShare: [0.30, 0.22, 0.20, 0.12, 0.16],     // (0.14, 0.15, 0.13, 0.2, 0.28)
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
  drawLength: 0.452,
  pitches: [-0.55, -0.4, 0, 0.75],
  restZ: 0.055,
  pull: 0.507,
  arrowLen: 0.707,
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
    handCollider: UBC_HAND_COLLIDER,
    tune: UBC_TUNE,
    bow: UBC_BOW,
  };
}
