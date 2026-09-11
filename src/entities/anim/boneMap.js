/**
 * Bone-name map: Quaternius Universal Animation Library ("Godot Standard"
 * glTF, Blender Rigify DEF- bones) -> Aloy (UE4-mannequin naming, exact names).
 *
 * Promoted from src/spikes/retarget/boneMap.js (Round 4). Aloy has 5 spine
 * bones + 2 neck bones; the source has 3 spine + 1 neck, so the source chain is
 * spread over the target chain (unmapped intermediates hold their bind local
 * rotation and simply inherit). Aloy has metacarpal bones between the hand and
 * *_01, Rigify does not — the retargeter assigns ABSOLUTE char-space
 * orientations per bone, so the extra metacarpal just rides along.
 */
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

export const UAL_HIP = 'DEF-hips';

/** Rest-correction aim rules (source-bone keyed):
 *  undefined -> aim at first mapped descendant, else inherit parent's correction
 *  string    -> aim at that source bone (must be mapped)
 *  'inherit' -> use parent's correction (keeps bind child/parent relation)
 *  null      -> identity (bone keeps its own bind orientation as the rest) */
export const AIM_RULES = {
  'DEF-hand.L': 'DEF-f_middle.01.L',
  'DEF-hand.R': 'DEF-f_middle.01.R',
  'DEF-head': null,
  // ANKLES: identity, i.e. Aloy's bind foot angle IS the rest angle, so the
  // source's per-frame delta from ITS rest is what drives the ankle. The
  // default (aim the ankle at the first mapped descendant, the toe) instead
  // bakes the Quaternius rest ankle pitch onto Aloy, which left her standing
  // ~13 deg plantarflexed — heels floating ~4cm — in every idle/aim frame.
  'DEF-foot.L': null,
  'DEF-foot.R': null,
  'DEF-toe.L': 'inherit',
  'DEF-toe.R': 'inherit',
};

/** Target bones whose char-space height is compared against bind to detect
 *  sunk/floating feet (ankle + ball, both sides). Their per-frame char-space
 *  positions are also recorded during the bake for gait analysis. */
export const CONTACT_BONES = ['foot_l_0189', 'foot_r_0215', 'ball_l_0190', 'ball_r_0216'];
