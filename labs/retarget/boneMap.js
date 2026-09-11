/**
 * Bone-name maps: source skeleton -> Aloy (UE4-mannequin naming, exact names).
 *
 * Aloy has 5 spine bones + 2 neck bones; sources have 3 spine + 1 neck, so the
 * source chain is spread over the target chain (unmapped intermediates hold
 * their bind local rotation and simply inherit). Fingers are optional: Aloy has
 * metacarpal bones between the hand and *_01, Rigify/Mixamo do not — the
 * retargeter assigns ABSOLUTE char-space orientations per bone, so the extra
 * metacarpal just rides along.
 */

// Quaternius Universal Animation Library ("Godot Standard" glTF, Blender Rigify DEF- bones)
export const UAL_TO_ALOY = {
  'DEF-hips': 'pelvis_05',
  'DEF-spine.001': 'spine_01_06',
  'DEF-spine.002': 'spine_03_08',
  'DEF-spine.003': 'spine_05_010',
  'DEF-neck': 'neck_01_0102',
  'DEF-head': 'head_0104',
  'DEF-shoulder.L': 'clavicle_l_011',
  'DEF-shoulder.R': 'clavicle_r_042',
  'DEF-upper_arm.L': 'upperarm_l_012',
  'DEF-upper_arm.R': 'upperarm_r_043',
  'DEF-forearm.L': 'lowerarm_l_013',
  'DEF-forearm.R': 'lowerarm_r_044',
  'DEF-hand.L': 'hand_l_014',
  'DEF-hand.R': 'hand_r_045',
  'DEF-thigh.L': 'thigh_l_0185',
  'DEF-thigh.R': 'thigh_r_0211',
  'DEF-shin.L': 'calf_l_0186',
  'DEF-shin.R': 'calf_r_0212',
  'DEF-foot.L': 'foot_l_0189',
  'DEF-foot.R': 'foot_r_0215',
  'DEF-toe.L': 'ball_l_0190',
  'DEF-toe.R': 'ball_r_0216',
  // fingers (optional — see stripFingers)
  'DEF-f_index.01.L': 'index_01_l_016', 'DEF-f_index.02.L': 'index_02_l_017', 'DEF-f_index.03.L': 'index_03_l_018',
  'DEF-f_middle.01.L': 'middle_01_l_020', 'DEF-f_middle.02.L': 'middle_02_l_021', 'DEF-f_middle.03.L': 'middle_03_l_022',
  'DEF-f_ring.01.L': 'ring_01_l_028', 'DEF-f_ring.02.L': 'ring_02_l_029', 'DEF-f_ring.03.L': 'ring_03_l_030',
  'DEF-f_pinky.01.L': 'pinky_01_l_024', 'DEF-f_pinky.02.L': 'pinky_02_l_025', 'DEF-f_pinky.03.L': 'pinky_03_l_026',
  'DEF-thumb.01.L': 'thumb_01_l_031', 'DEF-thumb.02.L': 'thumb_02_l_032', 'DEF-thumb.03.L': 'thumb_03_l_033',
  'DEF-f_index.01.R': 'index_01_r_047', 'DEF-f_index.02.R': 'index_02_r_048', 'DEF-f_index.03.R': 'index_03_r_049',
  'DEF-f_middle.01.R': 'middle_01_r_051', 'DEF-f_middle.02.R': 'middle_02_r_052', 'DEF-f_middle.03.R': 'middle_03_r_053',
  'DEF-f_ring.01.R': 'ring_01_r_059', 'DEF-f_ring.02.R': 'ring_02_r_060', 'DEF-f_ring.03.R': 'ring_03_r_061',
  'DEF-f_pinky.01.R': 'pinky_01_r_055', 'DEF-f_pinky.02.R': 'pinky_02_r_056', 'DEF-f_pinky.03.R': 'pinky_03_r_057',
  'DEF-thumb.01.R': 'thumb_01_r_062', 'DEF-thumb.02.R': 'thumb_02_r_063', 'DEF-thumb.03.R': 'thumb_03_r_064',
};

// Mixamo (FBX -> GLB, "mixamorig" prefix). UNTESTED here (Mixamo needs an Adobe
// login); the retargeter is source-agnostic, so a Mixamo GLB should drop in
// with this map once one is exported. Mixamo rest = T-pose, +Z forward, cm units
// (three's FBX/GLB path usually leaves a 0.01 scale on the armature — the
// retargeter reads positions in char space so scale is handled).
const MIX = (side) => {
  const S = side === 'L' ? 'Left' : 'Right', s = side.toLowerCase();
  const f = (m, a, b, c) => ({
    [`mixamorig${S}Hand${m}1`]: `${a}_${s}`, [`mixamorig${S}Hand${m}2`]: `${b}_${s}`, [`mixamorig${S}Hand${m}3`]: `${c}_${s}`,
  });
  return {
    [`mixamorig${S}Shoulder`]: `clavicle_${s}`, [`mixamorig${S}Arm`]: `upperarm_${s}`,
    [`mixamorig${S}ForeArm`]: `lowerarm_${s}`, [`mixamorig${S}Hand`]: `hand_${s}`,
    [`mixamorig${S}UpLeg`]: `thigh_${s}`, [`mixamorig${S}Leg`]: `calf_${s}`,
    [`mixamorig${S}Foot`]: `foot_${s}`, [`mixamorig${S}ToeBase`]: `ball_${s}`,
    ...f('Index', 'index_01', 'index_02', 'index_03'), ...f('Middle', 'middle_01', 'middle_02', 'middle_03'),
    ...f('Ring', 'ring_01', 'ring_02', 'ring_03'), ...f('Pinky', 'pinky_01', 'pinky_02', 'pinky_03'),
    ...f('Thumb', 'thumb_01', 'thumb_02', 'thumb_03'),
  };
};
// values here are PREFIXES (Aloy names carry numeric suffixes) — resolved by resolvePrefixes()
export const MIXAMO_TO_ALOY_PREFIX = {
  mixamorigHips: 'pelvis', mixamorigSpine: 'spine_01', mixamorigSpine1: 'spine_03', mixamorigSpine2: 'spine_05',
  mixamorigNeck: 'neck_01', mixamorigHead: 'head', ...MIX('L'), ...MIX('R'),
};

/** Rest-correction aim rules (source-bone keyed):
 *  undefined -> aim at first mapped descendant, else inherit parent's correction
 *  string    -> aim at that source bone (must be mapped)
 *  'inherit' -> use parent's correction (keeps bind child/parent relation)
 *  null      -> identity (bone keeps its own bind orientation as the rest) */
export const AIM_RULES = {
  'DEF-hand.L': 'DEF-f_middle.01.L',
  'DEF-hand.R': 'DEF-f_middle.01.R',
  'DEF-head': null,
  'DEF-toe.L': 'inherit',
  'DEF-toe.R': 'inherit',
  mixamorigLeftHand: 'mixamorigLeftHandMiddle1',
  mixamorigRightHand: 'mixamorigRightHandMiddle1',
  mixamorigHead: null,
  mixamorigLeftToeBase: 'inherit',
  mixamorigRightToeBase: 'inherit',
};

/** Target bones whose char-space height is compared against bind to detect
 *  sunk/floating feet (ankle + ball, both sides). */
export const CONTACT_BONES = ['foot_l_0189', 'foot_r_0215', 'ball_l_0190', 'ball_r_0216'];

export const FINGER_RE = /f_(index|middle|ring|pinky)|thumb|Hand(Index|Middle|Ring|Pinky|Thumb)/;

export function stripFingers(map) {
  const out = {};
  for (const k in map) if (!FINGER_RE.test(k)) out[k] = map[k];
  return out;
}

/** Resolve prefix-valued maps against the actual target bone names. */
export function resolvePrefixes(prefixMap, targetBones) {
  const names = Object.keys(targetBones);
  const out = {};
  for (const [src, prefix] of Object.entries(prefixMap)) {
    if (targetBones[prefix]) { out[src] = prefix; continue; }
    let best = null;
    for (const n of names) {
      if (n.startsWith(prefix + '_') && !n.includes('_end') && !n.includes('twist') && !n.includes('metacarpal')) {
        if (!best || n.length < best.length) best = n;
      }
    }
    if (best) out[src] = best;
  }
  return out;
}

/** Pick a map by sniffing the source skeleton's bone names.
 *  NOTE: GLTFLoader sanitizes node names (dots stripped: "DEF-spine.001" ->
 *  "DEF-spine001"); the Retargeter resolves keys through the same sanitizer,
 *  so maps are written with the authored (dotted) names. */
export function detectSourceMap(sourceBones, targetBones) {
  if (sourceBones['DEF-hips']) return { kind: 'ual-rigify', hip: 'DEF-hips', map: { ...UAL_TO_ALOY } };
  if (sourceBones['mixamorigHips']) {
    return { kind: 'mixamo', hip: 'mixamorigHips', map: resolvePrefixes(MIXAMO_TO_ALOY_PREFIX, targetBones) };
  }
  return { kind: 'unknown', hip: null, map: {} };
}
