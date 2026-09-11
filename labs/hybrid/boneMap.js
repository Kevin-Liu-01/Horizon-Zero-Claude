/**
 * Spike C (hybrid): source-rig -> Aloy bone map shared by the offline baker
 * (tools/spike-hybrid-bake.mjs, node) and the runtime pose player.
 *
 * Source: Quaternius "Universal Animation Library" (Godot Standard rig,
 * Rigify-style DEF- bones, T-pose rest). Target: Aloy (Fortnite-style rig,
 * A-pose bind). Both are Y-up, +Z forward, +X = character's left.
 *
 * Each entry:
 *   src      source bone name
 *   dst      list of [aloyBone, fraction] — the source bone's char-space delta
 *            is split along the target chain by fraction (fractions sum to 1;
 *            the LAST target reaches the full delta). Used to spread the 3
 *            source spine bones over Aloy's 5, and the 1 neck over 2.
 *   tip      [srcTipBone, aloyTipBone] — when present the baker corrects the
 *            rest-pose difference so Aloy's bone POINTS where the source bone
 *            points (T-pose vs A-pose arms). Absent = axial bone: Aloy keeps
 *            her own bind posture and only the source's delta-from-rest is
 *            applied on top.
 *
 * Order matters: parents before children (the baker composes down the chain).
 */
export const BONE_MAP = [
  { src: 'DEF-hips',        dst: [['pelvis_05', 1]] },
  { src: 'DEF-spine.001',   dst: [['spine_01_06', 0.5], ['spine_02_07', 0.5]] },
  { src: 'DEF-spine.002',   dst: [['spine_03_08', 1]] },
  { src: 'DEF-spine.003',   dst: [['spine_04_09', 0.5], ['spine_05_010', 0.5]] },
  { src: 'DEF-neck',        dst: [['neck_01_0102', 0.5], ['neck_02_0103', 0.5]] },
  { src: 'DEF-head',        dst: [['head_0104', 1]] },

  { src: 'DEF-shoulder.L',  dst: [['clavicle_l_011', 1]] },
  { src: 'DEF-upper_arm.L', dst: [['upperarm_l_012', 1]], tip: ['DEF-forearm.L', 'lowerarm_l_013'] },
  { src: 'DEF-forearm.L',   dst: [['lowerarm_l_013', 1]], tip: ['DEF-hand.L', 'hand_l_014'] },
  { src: 'DEF-hand.L',      dst: [['hand_l_014', 1]],     tip: ['DEF-f_middle.01.L', 'middle_metacarpal_l_019'] },

  { src: 'DEF-shoulder.R',  dst: [['clavicle_r_042', 1]] },
  { src: 'DEF-upper_arm.R', dst: [['upperarm_r_043', 1]], tip: ['DEF-forearm.R', 'lowerarm_r_044'] },
  { src: 'DEF-forearm.R',   dst: [['lowerarm_r_044', 1]], tip: ['DEF-hand.R', 'hand_r_045'] },
  { src: 'DEF-hand.R',      dst: [['hand_r_045', 1]],     tip: ['DEF-f_middle.01.R', 'middle_metacarpal_r_050'] },

  { src: 'DEF-thigh.L',     dst: [['thigh_l_0185', 1]],   tip: ['DEF-shin.L', 'calf_l_0186'] },
  { src: 'DEF-shin.L',      dst: [['calf_l_0186', 1]],    tip: ['DEF-foot.L', 'foot_l_0189'] },
  // feet/toes: axial-style (no tip). Aloy's foot bone is flatter than the
  // mannequin's (19 deg vs 31 deg below horizontal); direction-matching would
  // dig her toes 2 cm into the ground, so she keeps her own flat rest and
  // takes only the ankle delta.
  { src: 'DEF-foot.L',      dst: [['foot_l_0189', 1]] },
  { src: 'DEF-toe.L',       dst: [['ball_l_0190', 1]] },

  { src: 'DEF-thigh.R',     dst: [['thigh_r_0211', 1]],   tip: ['DEF-shin.R', 'calf_r_0212'] },
  { src: 'DEF-shin.R',      dst: [['calf_r_0212', 1]],    tip: ['DEF-foot.R', 'foot_r_0215'] },
  { src: 'DEF-foot.R',      dst: [['foot_r_0215', 1]] },
  { src: 'DEF-toe.R',       dst: [['ball_r_0216', 1]] },
];

/**
 * Source clip -> baked track name. loop: cyclic; gait: phase-sync marker;
 * conform:false = the ground-conform layer is released for the clip (rolls,
 * deaths, jumps — same gating playerAnimator applies via offW).
 */
export const CLIPS = [
  { src: 'Idle_Loop',        name: 'idle',       loop: true },
  { src: 'Walk_Loop',        name: 'walk',       loop: true, gait: true },
  { src: 'Jog_Fwd_Loop',     name: 'jog',        loop: true, gait: true },
  { src: 'Sprint_Loop',      name: 'run',        loop: true, gait: true },
  { src: 'Crouch_Idle_Loop', name: 'crouch',     loop: true },
  { src: 'Crouch_Fwd_Loop',  name: 'crouchwalk', loop: true, gait: true },
  { src: 'Roll',             name: 'roll',       loop: false, conform: false },
  { src: 'Hit_Chest',        name: 'hit',        loop: false },
  { src: 'Death01',          name: 'death',      loop: false, conform: false },
  { src: 'Jump_Start',       name: 'jumpstart',  loop: false, conform: false },
  { src: 'Jump_Land',        name: 'jumpland',   loop: false, conform: false },
  // stand-in for a "draw": the UAL has no bow; the two-hand pistol idle is the
  // closest "weapon up" upper-body loop and shows how a one-shot/hold layer
  // would sit under the existing aim IK overlay.
  { src: 'Pistol_Idle_Loop', name: 'aimidle',    loop: true },
];

/** Aloy bone used for the pelvis translation track (char-space meters). */
export const PELVIS = 'pelvis_05';
export const SRC_HIPS = 'DEF-hips';
/** Left thigh bones used to find the gait sync phase (max forward swing). */
export const SYNC_SRC = 'DEF-thigh.L';
export const SYNC_TIP = 'DEF-shin.L';
/**
 * Foot-contact detection on the SOURCE rig (per sample): a foot is planted
 * when its toe or its ankle sits within CONTACT_EPS of its rest height. The
 * bits gate the runtime ground conform so flight-phase frames of jog/sprint
 * are not yanked to the floor.
 */
export const SRC_FEET = { L: ['DEF-foot.L', 'DEF-toe.L'], R: ['DEF-foot.R', 'DEF-toe.R'] };
export const CONTACT_EPS = 0.025;
