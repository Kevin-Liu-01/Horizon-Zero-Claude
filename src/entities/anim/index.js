/**
 * anim-core — the shared rig runtime (`docs/ROUND4-ANIM-CORE.md`).
 *
 * One import for every lane that poses a skeleton:
 *
 *   import { BoneSpace, RestPose, ClipLayerSet, RigDebug } from './anim/index.js';
 *
 * BoneSpace   one bone-rotation convention (local / char / world) with a
 *             cached bind pair (W, invW) and exact live conversions.
 * RestPose    bind capture + restore + the clip-driven / reset split.
 * ClipLayer   dt-driven, timeScale-safe layers: weights, crossfades,
 *             one-shots that restore on MIXER time, scrubbed one-shots.
 * RigDebug    skeleton overlay, per-bone probes, the canonical debugFeet().
 * anim        the `__CTX__.anim` surface: register(), audit(), selftest().
 *
 * Importing this module is enough to publish `__CTX__.anim`.
 */
export { BoneSpace, AXIS_X, AXIS_Y, AXIS_Z, AXES, axisOf } from './boneSpace.js';
export { RestPose } from './restPose.js';
export { ClipLayer, ClipLayerSet, timeScaleSelfTest } from './clipLayer.js';
export { RigDebug } from './rigDebug.js';
export {
  anim, register, unregister, registered,
  audit, selftest, algebraSelfTest, rigSelfTest,
  debug, overlay, clearDebuggers,
  ANIM_VERSION, MIGRATION_DOC,
} from './registry.js';
export { Retargeter, collectBones } from './retargeter.js';
export { ClipLibrary, CLIPS, GAIT_SLOTS, analyzeGait, analyzeRoot } from './clipLibrary.js';
export { LocomotionBlend } from './locomotion.js';
export { UAL_TO_ALOY, UAL_HIP, AIM_RULES, CONTACT_BONES } from './boneMap.js';
