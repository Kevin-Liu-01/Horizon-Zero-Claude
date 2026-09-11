# Spike A — retarget CC0 clips onto the existing Aloy rig

**Result: works.** Quaternius Universal Animation Library clips (Blender Rigify
skeleton, T-pose rest) play on `public/models/aloy.glb` (UE4/Fortnite-style rig,
A-pose rest, 424 joints) through a plain `THREE.AnimationMixer` on a
`SkeletonUtils.clone(aloy.root)`. Idle, walk, jog, sprint, crouch-idle,
crouch-walk, roll and jump all land with plausible poses, no exploded or
twisted limbs, feet on the ground.

## Motion source

| | |
|---|---|
| Pack | Quaternius **Universal Animation Library** — "Godot Standard" glTF variant (`AnimationLibrary_Godot_Standard.gltf` + `.bin`, 3.9 MB, mannequin mesh + 46 clips) |
| URL | https://quaternius.com/packs/universalanimationlibrary.html |
| License | **CC0 1.0 Universal** (`public/anims-retarget/LICENSE`, copied from the pack) |
| Skeleton | Blender Rigify `DEF-*` bones: hips, spine.001-003, neck, head, shoulder/upper_arm/forearm/hand ×2, 15 finger bones per hand, thigh/shin/foot/toe ×2, plus a `root` bone |
| Rest pose | true T-pose (`A_TPose` clip == node rest), +Y up, +Z forward, meters, hips at 0.917 m, mesh 1.83 m |
| Root motion | all `*_Loop` clips are in place (root translation 0); `Roll_RM` / `Sword_Attack_RM` carry root translation (Roll_RM: 4.99 m) |

Clips used on film: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`,
`Crouch_Fwd_Loop`, `Crouch_Idle_Loop`, `Roll`, `Roll_RM`, `Jump_Loop`.
Others in the pack: Jump_Start/Land, Hit_Chest/Head, Death01, Punch_*,
Sword_*, Pistol_*, Interact, PickUp_Table, Sitting_*, Swim_*, Dance_Loop, …

Mixamo cannot be downloaded here (Adobe login). `boneMap.js` ships an
untested `mixamorig*` map and the retargeter is source-agnostic (any T-pose,
+Z-forward humanoid GLB), so a Mixamo FBX→GLB clip should drop in.

## How it works (`retarget.js`)

`THREE.SkeletonUtils.retargetClip` was read and rejected for this pair: it
copies the source bone's *world rotation* straight onto the target bone
(no rest-pose delta, so Rigify's +Y-along-bone frames land on UE4's
+X-along-bone frames = 90° twisted limbs), and it works in the target
SkinnedMesh's frame, which for this Sketchfab GLB is a Z-up, ×100 cm frame,
not the game's char space. Its `localOffsets` hook can only fix the first
problem. So the spike bakes its own clip, entirely in **character space**
(the root Group frame: +Y up, +Z fwd, meters — the same frame
`playerAnimator.js` uses for its `W / invW` trick):

```
per bone pair s→t (computed once):
  Ws, Ps  source rest orientation / position   (char space)
  Wt, Pt  target bind orientation / position   (char space)
  C       rest correction = minimal rotation taking the target bone's bind
          DIRECTION (to its mapped child) onto the source's rest direction
  Wt2     = C * Wt          (Aloy posed into the mannequin's T-pose)
per frame:
  D       = Ws(t) * Ws^-1   source delta from rest
  Wdes    = D * Wt2         ABSOLUTE desired target orientation
  local   = parentChar^-1 * Wdes   (parents first; unmapped intermediates
                                    keep bind local and just inherit)
hip only: pelvis char pos = Pt + (Ps(t) − Ps) * hipScale  → pelvis-parent local
```

Absolute per-bone orientations are what make the spine subdivision
(3 source → 5 Aloy bones, `spine.001→spine_01`, `.002→spine_03`,
`.003→spine_05`) and the finger metacarpals (Aloy has them, Rigify doesn't)
a non-issue — the unmapped bones inherit, the mapped ones are pinned.

Output tracks are `<boneName>.quaternion` + `pelvis_05.position`, so the baked
`AnimationClip` binds by name on any `SkeletonUtils.clone` of the rig.
Baking 46 clips at 24–25 fps takes well under a second; it could also be done
offline once (gltf-transform) into an animation-only GLB.

## Artifacts seen on film and what fixed them

| Artifact | Cause | Fix |
|---|---|---|
| Only hips/neck/head animated, everything else frozen (first run) | `GLTFLoader` sanitizes node names (`PropertyBinding.sanitizeNodeName`): `DEF-spine.001` loads as `DEF-spine001`, so 49/52 map keys missed | resolve map keys through the same sanitizer (`retarget.js`) |
| Feet 1 m below ground, ground-fix silently lifting the pelvis by 0.99 m | scratch-vector aliasing: `poseIn()` reused `_v` and clobbered the decoded source hip position | dedicated `_vS` scratch; metric now reads ±3 cm |
| Arms over-rotate ~40° past the source pose, hands clip into hips/skirt (`fix=none` control shot) | A-pose (Aloy) vs T-pose (source) rest mismatch | per-bone rest correction `C` (`fix=all`, default) — `pose=rest` diagnostic shows Aloy in an exact T-pose |
| Feet sink 2.5–3 cm (idle/walk) or float 1.5 cm (crouch) | leg/hip proportion differences after hip-height scaling (hipScale 1.029) | constant per-clip `groundShift` from the lowest ankle/ball bone over the loop; live game should keep its per-foot ground conform on top |
| `Jump_Loop` pulled down 10 cm | ground fix applied to an airborne clip | per-clip `ground=0` for airborne clips (or use `Jump_Start` contact frame as reference) |
| `root=keep` on `Roll_RM` walks Aloy 5 m out of frame | root bone carries translation | root motion **stripped** by default (`rootDispMax` reported); keep it only when extracting a root-motion curve for dodge |
| Hair/braids/skirt tassels rigid, poke through in the roll | `dyn_*` chains are not in the map (correct) | live game keeps its spring chains |
| Slightly more upright neck than Aloy's bind slouch | `fix=all` straightens the UE4 neck to the source's near-vertical neck; head uses `C = identity` so it stays level | cosmetic; `fix=arms` keeps her bind neck (see `-fixarms-side` vs `-fixall-side`) |
| Not seen: twisted forearms, spine kinks, mirrored legs | direction-based `C` + absolute orientations | — |

Finger transfer works (loose fists in walk/idle close-ups) but the game's
procedural finger curl/bow-grip can simply overwrite them.

## Integration notes for the live game

- **Contract unchanged.** `PlayerAnimator.bones[name]`, `getBoneWorld(name)`
  and `handAttach('l'|'r')` keep working — the clip drives the same `Bone`
  objects by name on the same clone. Run `mixer.update(dt)` *before* combat /
  bow attach reads them in the frame.
- **Stacking.** `PlayerAnimator.update()` currently resets every posed bone to
  `bindQ` (line ~436) and multiplies char-space layer rotations on top. With a
  clip base: `mixer.update(dt)` first, drop the reset, keep `_rot/_rotQ`
  (they still rotate about bind-char axes — fine for breathe/lean/hit-react
  offsets). Arm IK for bow-draw, head look-at and foot ground-conform are
  absolute solves: re-read live joint positions from the posed skeleton
  (`_charPos` is bind-only today) and apply as the final layer.
- **Pelvis.** Clip writes `pelvis_05.position` (parent-local, includes the
  baked `groundShift`); the animator's `_grnd` / `_pelvisM3` offset should be
  *added* after the mixer, not assigned.
- **Locomotion.** Loops are in place: `action.timeScale = moveSpeed /
  clipNominalSpeed` (walk 1.333 s, jog 0.917 s, sprint 0.667 s cycles) and
  cross-fade idle/walk/jog/sprint + crouch variants with mixer weights;
  `Roll_RM` root curve can replace the procedural dodge translation.
- **Assets.** Ship only baked animation data (strip the mannequin mesh); load
  through the same `GLTFLoader` (meshopt is only needed for aloy.glb).

## Files

- `labs/retarget/boneMap.js` — UAL→Aloy map (52 pairs incl. fingers), Mixamo map (untested), aim rules, contact bones
- `labs/retarget/retarget.js` — `Retargeter` (bake, rest correction, hip scale, root-motion strip, ground metric)
- `labs/retarget/main.js` — viewer page logic (URL params documented in-file), exposes `window.__RETARGET__`
- `spike-retarget.html` — page shell (repo root, served by vite)
- `tools/spike-retarget-shot.mjs` — puppeteer film harness, port 5191 only
- `public/anims-retarget/` — the CC0 pack (`.gltf`, `.bin`, `LICENSE`)
- `shots/spike-retarget-<clip>-<t>[-tag].png` — film

## How to run

```sh
npm run dev -- --port 5191          # or let the shot tool boot it
open http://localhost:5191/spike-retarget.html?clip=Walk_Loop&src=1   # live, animating
# film (freezes at t, saves shots/spike-retarget-<clip>-<t>.png):
node tools/spike-retarget-shot.mjs Idle_Loop,Walk_Loop,Jog_Fwd_Loop,Sprint_Loop,Crouch_Fwd_Loop --t 0.3,0.6 --params "src=1" --dump
node tools/spike-retarget-shot.mjs Idle_Loop --t 0 --params "pose=rest&src=1" --tag srcrest   # correction diagnostic
```
