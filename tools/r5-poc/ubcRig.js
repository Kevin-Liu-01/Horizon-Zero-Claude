/**
 * ROUND 5 · rig profile for the Quaternius Universal Base Characters skeleton
 * (65 joints, UE-mannequin names without numeric suffixes: `pelvis`,
 * `spine_01..03`, `neck_01`, `Head`, `clavicle_l`, `upperarm_l`, `lowerarm_l`,
 * `hand_l`, `index_01_l…`, `thigh_l`, `calf_l`, `foot_l`, `ball_l`).
 *
 * Bind (measured from the glTF, scratch/r5 glbinfo): T-pose, +Y up, +Z forward,
 * metres, feet flat (sole at y≈0), body 1.767 m. Bone-local axes are Blender's
 * (+Y along the bone), so fingers curl about local ±X, not UE4's +Z — handled
 * per finger by `fingerAxes`, derived from the bind pose, not hand-typed.
 *
 * This is what a new body hands the KEPT stack: a bone map for the retargeter
 * (UAL source -> this rig), the animator's KEY table, the gait contact bones.
 */
import * as THREE from 'three';
import { AIM_RULES } from '../../src/entities/anim/boneMap.js';

/** UAL (Rigify DEF-*, the clip source in public/anims) -> UBC. 52 pairs. */
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
 * The animator's short keys -> UBC bones. UBC has 3 spine + 1 neck where Aloy
 * has 5 + 2: spine1..3 take the three real joints (all clip-driven), spine4 /
 * spine5 ALIAS spine_03 (the melee carry bound reads their positions and
 * refuses to arm without them), neck2 and the face (eyes, lids) are absent —
 * the eyes are a mesh weighted to `Head`, so the look-at's last 10 % and the
 * blink are lost, not broken.
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

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ax = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();

/**
 * Per-finger curl axis in BONE-LOCAL space, derived from the bind pose:
 * axis_char = fingerDir × palmNormal (palm faces -Y in a T-pose), so a positive
 * curl always turns the finger toward the palm, whatever the rig's local axes.
 *
 * @param {THREE.Object3D} root  the model root, in bind pose, at identity
 */
export function deriveFingerAxes(root) {
  root.updateMatrixWorld(true);
  const invRootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const invRootM = root.matrixWorld.clone().invert();
  const out = {};
  root.traverse((o) => {
    if (!o.isBone || !/^(index|middle|ring|pinky|thumb)_0[123]_[lr]$/.test(o.name)) return;
    const child = o.children.find((c) => c.isBone);
    if (!child) return;
    _a.setFromMatrixPosition(o.matrixWorld).applyMatrix4(invRootM);
    _b.setFromMatrixPosition(child.matrixWorld).applyMatrix4(invRootM);
    const dir = _b.sub(_a).normalize();
    _ax.crossVectors(dir, new THREE.Vector3(0, -1, 0)).normalize();
    o.getWorldQuaternion(_q).premultiply(invRootQ);          // bind char orientation
    _ax.applyQuaternion(_qi.copy(_q).invert());              // -> bone local
    out[o.name] = [+_ax.x.toFixed(5), +_ax.y.toFixed(5), +_ax.z.toFixed(5)];
  });
  return out;
}

/** The JSON-safe profile the kept stack reads off `root.userData.rigProfile`. */
export function ubcProfile(root) {
  return {
    name: 'ubc-female',
    key: UBC_KEY,
    map: UAL_TO_UBC,
    aim: AIM_RULES,
    contacts: UBC_CONTACTS,
    feet: UBC_FEET,
    fingerAxes: deriveFingerAxes(root),
  };
}
