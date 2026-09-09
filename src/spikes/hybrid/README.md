# Spike C — hybrid: clip-derived keyposes driving the procedural convention

**Result: works.** Aloy plays idle / walk / jog / sprint / crouch / crouch-walk /
roll / hit / death / jump / pistol-idle from baked, rest-corrected char-space
tracks applied through the exact `playerAnimator.js` convention
(`bone.quaternion = bindQ · W⁻¹ · R · W`), side by side with the source
mannequin playing the raw clip. Nothing outside this spike was modified.

## Motion source (license)

- **Quaternius — Universal Animation Library**, file
  `AnimationLibrary_Godot_Standard.gltf` (+ `.bin`, 3.9 MB, 46 clips, 53-joint
  Rigify-style `DEF-` rig, T-pose rest).
- URL: <https://quaternius.com/packs/universalanimationlibrary.html>
- License: **CC0 1.0 Universal** (bundled `LICENSE`, copied alongside).
- Provenance: reused from `models-staging/anims-retarget/quaternius-ual/`
  (another spike's staging; not modified), copied to
  `models-staging/anims-hybrid/quaternius-ual/` and served from
  `public/anims-hybrid/ual/` for the side-by-side comparison only.
- Clips baked (12): `Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Sprint_Loop,
  Crouch_Idle_Loop, Crouch_Fwd_Loop, Roll, Hit_Chest, Death01, Jump_Start,
  Jump_Land, Pistol_Idle_Loop` → `idle, walk, jog, run, crouch, crouchwalk,
  roll, hit, death, jumpstart, jumpland, aimidle`. The pack has no bow draw;
  `Pistol_Idle_Loop` is the stand-in for a "weapon up" hold. The `_RM`
  (root-motion) variants were left out; the in-place `Roll` is used.

## How it works

Offline, `tools/spike-hybrid-bake.mjs` (node, gltf-transform + three math):

1. Loads both rigs, computes rest world transforms (`decompose`, so the
   Sketchfab 100× / −90° X wrapper nodes on Aloy are handled correctly).
2. For every mapped source bone and sample (native 24 fps):
   `D = Qsrc(t)·Qsrc_rest⁻¹` (char-space delta from rest),
   `Rtot = D·C` where `C = align(dirAloyBind → dirSrcRest)` is the rest-pose
   correction (T-pose vs A-pose: 41° upper arm, 47° forearm, 62° hand, ~5°
   thigh/calf), and the stored track value is
   `R = Rtot(nearest mapped Aloy ancestor)⁻¹ · Rtot` — i.e. exactly what a
   `_rotQ(entry, R)` call would apply, composing down the chain.
3. Axial bones (pelvis, spine, neck, head, clavicles, feet, toes) get
   `C = I`: Aloy keeps her own bind posture and receives only the source's
   delta. The 3 source spine bones are spread over Aloy's 5 (½,½ / 1 / ½,½)
   and the 1 neck over her 2 via fractional slerp of the delta.
4. Pelvis translation is stored in source meters relative to the rest hips;
   the runtime scales it by Aloy's hip height (`hipScale` = 1.029).
5. Per-sample **foot-contact bits** are detected on the source (toe or ankle
   within 2.5 cm of rest height) and a per-clip gait `syncPhase` (left thigh
   furthest forward) is stored for phase-locked blending.
6. A numeric self-check re-simulates Aloy's skeleton with the baked locals:
   worst limb-direction error **0.037°** (pure rounding).

Output: `public/anims-hybrid/aloy-ual.json` — 305 KB, 12 clips, 25 bones.

Runtime, `src/spikes/hybrid/posePlayer.js`:

- `PosePlayer` builds `{bindQ, bindP, W, invW}` per mapped bone from the live
  three.js skeleton (same code as the animator), evaluates a clip at `t`
  (slerp between samples; loops wrap, one-shots clamp), and `apply()` writes
  the pose from bind every frame (never accumulates).
- `LocomotionBlend`: 1-D speed blend space (idle 0 → walk 1.8 → jog 4.5 →
  run 7.5 m/s) with a cadence-blended shared gait phase (walk 1.333 s, jog
  0.917 s, sprint 0.667 s) aligned by `syncPhase`; idle runs on its own clock;
  a crouch axis (crouch-idle ↔ crouch-walk) is mixed on top by `crouchW`.
  Blending = successive slerp (normalized weights) + pelvis lerp.
- `conformToFloor()`: spike-sized `_groundConform` for a flat floor — plants
  the lowest **contact-flagged** ball bone, released for `conform:false`
  clips (roll/death/jump; the animator's `offW` gate).

## Verified on film (`shots/spike-hybrid-*.png`, 1600×900, port 5193)

Left: Aloy via baked tracks · right: source mannequin via `AnimationMixer`
(raw clip) at the same time. Deterministic (`?t=` evaluates that instant).

| shot | what it shows |
|---|---|
| `spike-hybrid-idle-bind-0.png` | plumbing check: Aloy A-pose next to mannequin T-pose |
| `spike-hybrid-idle-{0,1.2}.png` | relaxed hang, weight on one leg — matches |
| `spike-hybrid-walk-{0,0.33,0.66,1}.png`, `-walk-side-0.66.png` | full walk cycle incl. heel-strike toe-up; feet planted, conform ±1.5 cm |
| `spike-hybrid-jog-{0,0.45}.png` | jog; both flight frames (source is airborne 14/22 samples) |
| `spike-hybrid-run-{0,0.17,0.33,0.5}.png`, `-run-side-0.33.png`, `-run-back-0.33.png` | sprint lean, heel kick, arm carriage — matches |
| `spike-hybrid-crouch-0.5.png`, `-crouchwalk-{0.5,1.5}.png` | deep crouch / crouch walk, conform −2.5 cm |
| `spike-hybrid-roll-{0.3,0.7,1.1}.png` | dive, tuck on the back, recovery step (conform released) |
| `spike-hybrid-hit-0.15.png`, `-death-2.png`, `-aimidle-0.5.png` | one-shots + two-hand hold |
| `spike-hybrid-blend-{idle-walk,walk-jog,jog-run,crouchwalk,halfcrouch}-1.png` | speed/crouch blends at 1.0 / 3.0 / 6.0 m/s, crouch 1 / 0.5 |
| `spike-hybrid-walk-noconform-0.33.png` | conform off for comparison |

## Fidelity vs the raw clips (honest)

- **Joint directions are exact** for corrected limbs (0.04°); on film Aloy's
  pose reads as the mannequin's at every sampled frame. What differs is
  proportion: her hip→ankle is 8 cm longer but her ankle sits 7 cm lower
  (sole height matches), shoulders are narrower — so end-effector positions
  shift a few cm; joint angles do not.
- **Roll/twist about the bone axis is Aloy's, not the source's**: the rest
  correction is the minimal rotation, so palm facing follows Aloy's A-pose
  roll composed with the source delta. Hands read plausible but are not the
  mannequin's clenched fists (fingers are not baked — `_curlFingers` still
  owns them).
- **Axial bones are delta-only**: a source hunch is added to Aloy's upright
  bind instead of replacing it; the ½/1/½ spine split keeps curvature smooth
  but not the source's exact profile (visible as a slightly straighter back
  in the crouch shots).
- **Feet** keep Aloy's flat rest (identity correction) — matching directions
  would tilt her toes 12° into the floor because her foot bone is flatter.
- **Flight phases**: Quaternius' jog/sprint loops are airborne most of the
  cycle (jog 14/22, sprint 9/16 samples). Baked contact bits stop the
  conform from yanking the pelvis 10–15 cm every stride; the game's damped
  `_grnd` (rate 6/s while moving) would otherwise chase that.
- Sampling at native 24 fps, 4-decimal quats: no visible loss vs the mixer.
- Not driven: twist bones, dyn_ chains (springs still own them), fingers.

## Blend quality

- Phase-synced walk↔jog↔run blends stay coherent (legs never mush) because
  all three are aligned on the left-thigh-forward marker and the cadence is
  blended, not the clip time. Idle↔walk is a cross-fade with idle on its own
  clock — reads as a slow walk at w≈0.5.
- **Known artifact**: mixing standing and crouch clips slerps the leg bend
  while the pelvis drop lerps — the two are not consistent, so at crouch=0.5
  the feet sink ~8 cm and the conform lifts them (`halfcrouch` shot). Same
  reason the current crouch layer hand-tunes "pelvis drop matches the leg
  coil". Either let conform own it (it does) or blend crouch in hip-height
  space.
- Contact bits in a blend come from the dominant clip.
- Only stills were filmed; the live loop (`?clip=blend` without `t`) runs
  without errors but transition smoothness over time was not evaluated.

## How the existing layers stack on top

`apply(pose)` leaves the skeleton in exactly the state a sequence of
`_rotQ` calls would, so the animator's later layers keep working unchanged:

- **Additive layers** (head stabilization, hit react, death crumple, dodge
  tuck, plant-turn/settle overlays): they `bone.quaternion.multiply(...)` a
  char-space delta — that composes on the baked local the same way it
  composes on the hand-made locomotion today. Replace layers 0–3 (base
  stance, idle, locomotion, crouch) with the pose player; keep 3b–7.
- **Arm IK (aim / carry)**: `_ikArm` reads the live shoulder via `_charOf`
  (works on any base pose) and maps bind directions with torso compensation
  `_qTorso`. With a baked base, seed `_qTorso` from
  `player.torsoQuat(pose)` (the composed pelvis…spine_05 track rotation,
  provided) and blend the IK arm rotations against the baked arm `R` by
  `aimW` instead of against identity — the `w<0.999 → slerp` branch already
  has that shape.
- **Ground conform**: run `_groundConform` after `apply()` exactly as now
  (pelvis clamp + per-foot raise against terrain). Feed it the baked
  contact bits instead of the "min clearance while moving" rule — that is
  the one behavioural change the clips require (flight phases).
- **Pelvis offsets** (`pdx/pdy/pdz` + `_grnd`) add to the baked pelvis delta
  through the same `_pelvisM3` basis; `offsetPelvis()` shows the call.
- **Springs**: `_springs` rotates unmapped dyn_ bones — untouched.
- Cost: 25 bones × (2 slerps + 3 quat mults) per clip evaluated; the JSON
  is 305 KB for 12 clips (gzips to ~70 KB).

## Files

- `src/spikes/hybrid/boneMap.js` — bone map, clip list, contact/sync config
- `src/spikes/hybrid/posePlayer.js` — `Pose`, `PosePlayer`,
  `LocomotionBlend`, `conformToFloor`
- `src/spikes/hybrid/main.js` — standalone page (Aloy `skeletonClone` +
  mannequin, URL params, `window.__READY__`)
- `spike-hybrid.html` — page (repo root)
- `tools/spike-hybrid-bake.mjs` — baker (+ numeric self-check)
- `tools/spike-hybrid-shot.mjs` — screenshot harness (boots/reuses vite 5193)
- `public/anims-hybrid/aloy-ual.json` — baked tracks;
  `public/anims-hybrid/ual/` — source pack + LICENSE for the comparison
- `models-staging/anims-hybrid/quaternius-ual/` — staged source pack

## How to run

```sh
node tools/spike-hybrid-bake.mjs                 # -> public/anims-hybrid/aloy-ual.json
npx vite --port 5193 --strictPort                # (the shot tool boots it if absent)
# live:   http://localhost:5193/spike-hybrid.html?clip=walk
#         http://localhost:5193/spike-hybrid.html?clip=blend&speed=3&crouch=0
# frame:  ...?clip=run&t=0.33&view=side   (params: view=34|front|side|back,
#         conform=0, src=0, skel=1, bind=1)
node tools/spike-hybrid-shot.mjs run 0.33 --params "view=side" --suffix side
node tools/spike-hybrid-shot.mjs --batch         # the review set above
```
