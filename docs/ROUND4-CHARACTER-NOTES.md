# Round 4 — Character pipeline: cross-spike learnings (orchestrator notes)

Three spikes explored driving Aloy with real motion clips (Quaternius Universal Animation
Library, CC0). Spike A (retarget onto the existing Fortnite rig) is the chosen base. These are
the findings from ALL spikes that the live integration must honor.

## From Spike A — `src/spikes/retarget/` (the base)
- `THREE.SkeletonUtils.retargetClip` is unusable for Rigify(T-pose, +Y-along-bone) → UE4
  (A-pose, +X-along-bone): 90° limb twists + wrong frame (Z-up ×100 SkinnedMesh). Use the
  custom char-space `Retargeter`: per bone `Wdes = (Ws(t)·Ws⁻¹) · C · Wt`, C = direction-based
  A→T rest correction; absolute orientations so 3→5 spine + finger metacarpals inherit.
- GLTFLoader sanitizes node names (`DEF-spine.001` → `DEF-spine001`): resolve map keys via
  `PropertyBinding.sanitizeNodeName` or only 3/52 bones bind.
- Root motion is stripped by default; `Roll_RM` carries a 4.99 m root curve usable for dodge.
- Per-clip constant `groundShift` from the lowest ankle/ball bone; airborne clips need
  `ground=0`.
- Contract preserved: same Bone objects by name → `bones`, `getBoneWorld`, `handAttach('l')`
  unchanged; run `mixer.update` BEFORE combat reads.

## From Spike C — `src/spikes/hybrid/` (fold these into the live overlays)
- **Foot-contact bits.** Quaternius `Jog_Fwd_Loop` and `Sprint_Loop` are airborne for a large
  share of samples (jog 14/22, sprint 9/16). A ground conform that plants "the lowest foot
  while moving" yanks the pelvis 10–15 cm each stride. Bake per-sample contact flags per foot
  (heel/ball height + velocity threshold over the loop) and let `_groundConform` plant ONLY
  flagged feet; release conform entirely during roll / death / jump.
- **Shared phase.** Blend walk/jog/run in a 1-D speed space with a cadence-blended shared
  phase aligned on a baked `syncPhase` per clip (heel-strike of the left foot), otherwise the
  legs of the two blended clips fight and read as shuffling. `AnimationAction.syncWith` +
  per-action `timeScale = speed / nominal` achieves this with the mixer.
- **Half-crouch sink.** Blending stand↔crouch slerps leg bend but lerps pelvis drop → feet
  sink ~8 cm mid-blend; the conform must lift, or drive the crouch blend through the
  pelvis-height curve rather than a linear weight.
- The pack has NO bow-draw clip: `Pistol_Idle`/`Pistol_Aim` are the closest upper-body
  stand-ins; the procedural `_aimLayer` (head-glued cheek anchor, reach clamp, head-sphere
  guard) remains the draw solution, layered over the locomotion lower body.
- Hit (`Hit_Chest`, `Hit_Head`), `Death01`, `Jump_Start/Land`, `Interact`, `PickUp_Table`
  exist and should replace the procedural crumple/hit where they read better.

## From Spike B — `src/spikes/reskin/` (pending)
- Re-skinning Aloy's mesh onto a standard skeleton is only worth it if it beats A on film;
  the risk is losing the authored skin weights at shoulders/hips/skirt.

## Gates that define done (character lane)
- A2 dodge ≥ 3 m, A3 sprint 8.2 m/s, A11 idle-alive, V1–V4 (existing).
- A12-clip-driven: mixer present, dominant action = `Sprint_Loop` at speed 8.
- A13-no-skate: planted-foot XZ drift ≤ 0.06 m during its stance window at sprint.
- V12-sprint-vs-reference: side view mid-sprint judged against `reference/run-side.jpg`.
- Aim/draw at camPitch −0.4 / 0 / 0.75: hand at the cheek OUTSIDE the hair, elbow level-back,
  bow arm clear of the chest (compare `reference/draw-side.jpg`).
