# ROUND 3 — The Overnight Gauntlet (Aug 5, 2026)

Kevin's mandate, from the 12:02 AM gameplay video grill: *"development on this game that genuinely
won't stop until this morning."* Eight workstreams, evaluated by **literal quality gates** — scripted
action assertions + screenshot visual criteria (tools/gates.mjs). A lane closes only when its gates
pass.

## What shipped

### 1. Player animation revamp (lane: animator — playerAnimator.js)
Diagnosis: the 8-layer procedural stack was sophisticated but read dead — spine-only lean diluted
17.8° in code to 5.8° on screen; arm swing lived below the hip line. Shipped: hip-hinge lean
(measured 11°+ whole-column at sprint), crossbody arm drive + elbow pump + running fists, 2.2×
idle breathing + bigger weight shifts (bone travel 40mm → 164mm over 5s), deeper stalk crouch,
fixed plant-turn trigger, streaming hair springs, aim-walk skate fix.
**Gates: A2 (dodge 5.07m), A3 (sprint 8.19 m/s), A11 (idle-alive), V1–V4 all PASS.**
Known gap (honest): no true per-foot world-anchor IK — feet micro-slide at stance; future round.

### 2. Machine rigs — the auto-rigger (lane: machines — autorig.js, gait.js)
The three big machines shipped as merged static sculpts with zero skeletons (raw sources gone).
Built a **runtime auto-rigger**: per-species rig specs measured from GLB vertex data, procedural
bone hierarchies (sawtooth 17 / behemoth 19 / thunderjaw 14), capsule-distance vertex weighting
sharpened for crisp mechanical plates, in-place SkinnedMesh conversion preserving materials +
raycast tagging. Plus a **GaitController**: distance-locked stride, per-foot world-locked plants
from terrain height, two-bone IK, pelvis-follows-feet, footfall impact dips, attack pose channels
(behemoth slam rears through the spine; thunderjaw tail sweep travels the tail chain), skeletal
death collapse with settle bounces. Watcher got a bird-strut head snap + alert periscope pop.
**58 fps with all 8 machines animating within 40m. Gates: A7, A8, V5, V6 PASS.**

### 3. Environment overhaul (lane: environment — terrain/environment/vegetation/camp + water.js, props.js)
Mountain ring: silhouettes vary by bearing (alpine teeth / stepped buttes / saddle gaps), sector-
gated strata, wandering snowlines, aspect-lit faces. Riverbed: ~290 cobbles, driftwood, damp-soil
collar, riparian greening, and **3 real water pools** (animated shader: scrolling normals, fresnel,
sun glint) ringed by reeds. Vegetation: +5 tree silhouettes with grove-and-clearing clustering,
380 shrubs, 2,400 flower instances, mossy boulders. Sky: domain-warped cumulus with lit rims,
cirrus, god-ray spokes, sun-bearing gold pooling, bird flocks, pollen motes. Old-world props:
3 rusted ruin clusters + a hunters' watchtower. **Gates: V7, V8, V9 PASS; spawn-vista draw calls
309 (budget 350).**

### 4. UI overhaul (lane: hud — ui/* + index.html)
Loot double-render **fixed** (popup for list-loot, toasts only for auto-pickups; microtask claim
window) with a `__HUD_DEBUG__.lootSurfaces()` gate hook. Machine status stack rebuilt: tracked-caps
name/LV, damage-ghost bar, awareness circle → flashing jagged attack diamond, elemental countdown
rings. Damage numbers: off-white plinks / yellow weak / cyan +TEAR, eased rise. Compass: parchment
ticks, awareness-colored diamond pips, distance labels. Health hides at full; weapon widget fades
holstered. Julius Sans One display headers; terracotta accent language; Focus hexes per research;
smoked-glass menus with corner brackets. **Gates: A1, A9, A10, V10 PASS.**

### 5. Claudeified logo
HORIZON in Julius Sans One (0.45em tracking) / ZERO CLAUDE at 32% (0.65em) between terracotta
hairlines, with the **Claude spark cresting the horizon rule as the rising sun** (#DA7756, soft
glow, below-horizon rays clipped "behind the landscape"). Title + loading + favicon. **Gate: V11 PASS.**

### 6. Animation studio (orchestrator lane — src/studio/)
F10 from gameplay: free-fly camera (WASD/QE, shift boost, click-look), timeScale scrubber 0–1
(freeze-frame staging), FOV + roll, HUD hide, one-click PNG frame export. Styled to match.
Cast panel (spawn/pose machines) lands with the variety wave's `machines.spawn` API.

### 7. Camp polish
NPC no longer T-poses: vertex-level repose during the merge bake (arms down, palm to the flames,
head to the fire). Found + culled a `KHR_materials_transmission` cornea material that forced a
full-scene transmission pass every frame: **camp 469 → 307 draw calls.**

### 8. Machine variety wave (lane: variety — machines/*)
**4/4 species shipped**, roster 4 → 8 kinds, 24 machines in the valley at **60.0 fps avg**:
- **Strider** (MechanicalHorse, 480 meshes→7 preprocess, autorig quadruped): herd ×6 grazing the
  west meadow with 2-Watcher escort; on alarm exactly ONE rearguard fights while five stampede the
  herd vector — proven on film with a state overlay.
- **Scrapper** (Robocat, autorig): pack ×3 at the rusted-hull ruin, ~20s radar scan-pause with ping
  rings, laser burst, power-cell part; flanking on approach.
- **Glinthawk** (RobotEnemyFlying) — the game's **first AnimationMixer machine**: GLB clips
  (Idle/Attack/Shoot/Dead) blended with procedural hover/bank; flock ×3 orbits the river pools,
  sequential dive tokens, screech telegraph, freeze-spit; burn → forced grounding with crit window.
- **Longleg** (Birb, native 43-joint rig): clip-blended strut/run + procedural neck-scan layer,
  echo-ping pauses on the SE shelf, stun-scream nova + jet blast, antenna-gated alarm calls.
All style-passed into the machine family (chassis-grey ramp, single EYE_COLORS sensor). Fixed in
passing: skinned-mesh guard in `_snapToHull`, double-yaw bug, TJ head parts re-seated on the snout.
New APIs: `machine.debugFeet()` on every walker (incl. the big four) and
`ctx.machines.kinds` + `ctx.machines.spawn(kind, x, z)` powering the studio cast panel.
**Gates: A6 PASS (maxGroundErr 0.056–0.112), A7/A8 PASS, species visuals PASS on film.**

## Gate scoreboard

| Gate | Lane | Result |
|---|---|---|
| A1 boot-clean | core | PASS |
| A2 dodge-displacement | animator | PASS (5.07m) |
| A3 sprint-speed | animator | PASS (8.19 m/s) |
| A4 draw-strength | combat | PASS |
| A5 arrow-fired-event | combat | PASS |
| A6 machine-foot-plant | machines | PASS (maxGroundErr 0.112m) |
| A7 alert-fsm | machines | PASS |
| A8 death-collapse | machines | PASS |
| A9 perf-budget | core | PASS (309 calls, ~59 fps) |
| A10 loot-single-render | hud | PASS |
| A11 idle-alive | animator | PASS (path-max sampling; endpoint sampling was phase-flaky and got fixed mid-night) |
| V1–V4 player motion | animator | PASS |
| V5 machine stride | machines | PASS |
| V6 machine death | machines | PASS |
| V7–V9 environment | environment | PASS |
| V10 HUD language | hud | PASS |
| V11 logo | logo | PASS |

## Research corpus written tonight
docs/research/roster-v2.md (16-machine bestiary spec) · reference-v3.md (Aloy animation numbers
from Guerrilla's GDC talk; UI language; logo spec) · casting-v3.md (variety casting/spawn plan) ·
models-staging/MANIFEST.md (18 CC-licensed models + attributions).

## Before/after gallery
shots/compare/index.html — 19 labeled pairs across all lanes (BEFORE gray | AFTER terracotta).

## Model credits (CC-BY attribution required)
See models-staging/MANIFEST.md ATTRIBUTIONS — surface in README before any public deploy.
Sketchfab requires an account token for downloads (fan-made Gloomeskk HZD bestiary is CC-BY-NC
there — a morning option if Kevin has an account).

## Backlog (honest gaps for Round 4)
- Player per-foot world-anchor IK (stance micro-slide).
- Post-tear weak points anchor to body space, not bones (minor drift).
- BVH for skinned-mesh raycasts if combat scales.
- measure-machines.mjs stale cwd in vite-spawn fallback.
- Weather system (rain/snow idle reactions from the research are unimplemented).
- `machines.spawn()` returns null for variety kinds during their few-second post-boot model load.
- Glinthawk freeze sac detonates per base canister rules (freeze-element hits), not canon
  "any damage" (compensated with tearHp 14).
- Behemoth debugFeet reports up to ~0.43m ground error on its steep territory (bone-honest;
  gait tuning opportunity).
- Sketchfab fan-made Gloomeskk HZD bestiary (CC-BY-NC) available if Kevin logs in with a token.
- (Resolved mid-night: TJ head-part offset re-seated; camp transmission material culled 469→307
  draw calls; A11 gate flakiness fixed with path-max sampling.)
