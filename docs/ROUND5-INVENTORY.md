# ROUND 5 — INVENTORY (what the redesign keeps, adapts, rebuilds and deletes)

Owner: inventory architect, Round 5 (Oct 15 2026). Read-only survey of the tree at
`8d729b6` ("Final checkpoint of the HZD fan-art line (Round 4)"); the only thing executed was
one baseline gate run on port 5239 (§5). Nothing under `src/`, `public/` or `tools/` was edited.

Kevin's brief (Oct 14, paraphrased): *redesign completely — new graphics, models and maps for everything and
everyone, custom human and enemies, a new location, a custom heroine ("custom aloy model") with weapon and
armor variants, distinct from other Horizons; keep only the rigging and movement (body movement mostly
solved; bow draw and melee not finished); restart from fresh.*

How to read this document:

| § | what | use it for |
|---|---|---|
| 0 | headline numbers + the legal findings | deciding what must go first |
| 1 | file-by-file KEEP / ADAPT / REPLACE / DELETE for `src/**`, `public/**` (+ `tools/**`, repo roots) | lane ownership for Round 5 |
| 2 | the seams new content plugs into, with exact APIs and every Aloy-tuned constant | building the new heroine, species and map |
| 3 | every HZD name/term with counts; full per-file list in Appendix A | the mechanical rename |
| 4 | gate inventory: CARRY / RESTAGE / DIES for all 248 gates; full table in Appendix B | keeping the acceptance bar honest through the swap |
| 5 | perf + memory baseline measured today | the numbers the new content must not regress |
| 6 | movement work still owed on the new body (bow draw, melee), rulings R1–R9 | the animation lanes' backlog |

Classification vocabulary (used everywhere below):

- **KEEP** — system kept as-is (at most a log-tag / comment rename).
- **ADAPT** — the engine of it stays; named content, tables, art or Aloy-specific constants are replaced (each row says exactly what).
- **REPLACE** — content that has to be rebuilt for the new game (the file's *role* survives, its contents do not).
- **DELETE** — Horizon-specific content or IP-risk assets with no role in the new game.

---

## 0. Headline

### 0.1 The tree

| | count | note |
|---|---|---|
| `src/**` | 139 files, 114,918 lines | 8 dirs: audio, combat, core, entities (anim, machines, machines/ai, machines/rig), items, studio, ui, world (npc, props) |
| `public/**` | 207 files, **37 MB** | models 17 MB (17 files), `anims*` 15.9 MB (4 copies of one 3.9 MB pack), audio 2.8 MB (167 files), fonts 1.4 MB |
| gates | **248** (202 action, 42 visual, 4 runner) | `tools/gates.config.mjs` + 27 `tools/gates.round4.*.mjs` lane files, 33 lane tags |
| classification of `src/**` | KEEP 59 · ADAPT 51 · REPLACE 9 · DELETE 20 | §1 |
| classification of gates | CARRY 55 · RESTAGE 181 · DIES 12 | §4 |
| HZD terms | 63 tracked names on 7,757 matching lines (4,851 in `src/` + `tools/` + `index.html`), plus `hzc` on 1,270 lines | §3, Appendix A |

### 0.2 Legal findings (read before anything else)

The provenance below is read out of each GLB's own `asset.extras` (written by the Round-1
optimiser) and `models-staging/MANIFEST.md`, not from memory.

| asset | shipped size | provenance (as recorded in the file) | problem | verdict |
|---|---|---|---|---|
| `public/models/aloy.glb` | 1.71 MB | "Aloy - Fortnite", Yxboireal, Sketchfab, CC-BY-4.0 | Sony/Guerrilla character in an Epic (Fortnite) rig — IP, whatever the uploader's licence says | **DELETE** |
| `public/models/sawtooth.glb` | 0.26 MB | "Sawtooth from Horizon Zero Dawn", Théo Domon, **CC-BY-NC-4.0** | non-commercial + HZD IP | **DELETE** |
| `public/models/behemoth.glb` | 2.36 MB | "Behemoth from Horizon Zero Dawn", Théo Domon, **CC-BY-NC-4.0** | non-commercial + HZD IP | **DELETE** |
| `public/models/thunderjaw.glb` | 0.38 MB | "Thunderjaw from Horizon Zero Dawn", Théo Domon, **CC-BY-NC-4.0** | non-commercial + HZD IP | **DELETE** |
| `public/models/watcher.glb` | 1.83 MB | "Redeye Watcher Rig, Horizon Zero Dawn", JP11555, CC-BY-4.0 | HZD IP | **DELETE** |
| `public/models/npc.glb` | 2.74 MB | "Horizon Zero Dawn Character Fanart", keianhzo, CC-BY-4.0 | HZD IP; still loaded by `assets.js` and `camp.js:1076` / `props/npcs.js` | **DELETE** |
| `strider.glb`, `scrapper.glb`, `snapmaw.glb`, `ravager.glb`, `corruptor.glb`, `stormbird.glb` | 2.9 MB | Poly Pizza CC-BY-3.0 donors (jake young; Jordan Hill; Poly by Google ×3; Sherkiz) | licence-clean with attribution, but each is cast + shelled as an HZD machine | **REPLACE** (re-use only as an attributed donor under a new design) |
| `glinthawk.glb`, `longleg.gltf`, `broadhead.glb`, `grazer.glb`, `shellwalker.glb` | 5.5 MB | Quaternius CC0 (Robot Enemy Flying, Birb, Bull, Deer, Spider) | clean; HZD casting/shells only | **REPLACE** (CC0 rigs + clips are reusable donors) |
| `public/anims/*` | 3.9 MB | Quaternius Universal Animation Library, CC0 (`public/anims/LICENSE`) | none | **KEEP** |
| `public/anims-hybrid/`, `anims-reskin/`, `anims-retarget/` | **12 MB** | duplicates of the same pack + `aloy-ual.json` (an Aloy-rig bake) for the `labs/` spikes | shipped into `dist/` for no runtime reader | **DELETE** from `public/` (move to `labs/` if the spikes are wanted) |
| `public/audio/**` | 2.8 MB | synthesized by `tools/audio-bank.mjs`, dedicated CC0 by the project (SPEC §13.1) | set names only (`aloy/`, `voice/<hzd-kind>/`, `idle/<hzd-kind>`, `bow/{hunter,sharpshot,war}`) | **ADAPT** (rename/regenerate) |
| `public/fonts/*` | 1.4 MB | Michroma, Orbitron, Rajdhani, Chakra Petch, Julius Sans One — SIL OFL | none | **KEEP** |
| `reference/*.jpg` (19, 9.7 MB, **tracked in git**, not shipped) | — | Guerrilla's own HZD/HFW trailer frames, Steam/press screenshots (`reference/MANIFEST.md`) | copyrighted stills in the repo; gates V12/V22/V24/V46/V48 are judged against them | replace with licence-clean pose reference (own photos or CC0/CC-BY archery/spear photography) and drop from git |
| `docs/media/*.png` (8, tracked) | — | screenshots of the HZD-model build used by README | depict Aloy/HZD machines | replace when the new build films |
| `docs/research/{roster-v2,casting-v3,casting-v4,machines,mechanics,ui,spear-canon,reference-v3}.md` | — | HZD canon research | the design canon of the old game | archive; the new game needs its own canon docs |

After the deletions `public/` drops from 37.1 MB to 15.8 MB (−9.3 MB IP/NC models, −12.0 MB
anim duplicates); 8.4 MB of what remains are the CC/CC0 machine donors slated for replacement, so
the assets Round 5 actually keeps are ≈ 8.1 MB (UAL pack 3.9, audio 2.8, fonts 1.4). That leaves
≈ 52 MB of the 60 MB budget for the new heroine, armor/weapon variants, roster, props and textures.

---

## 1. File-by-file classification

### 1.1 `src/` root, `src/core/`

| file | lines | class | reason / exactly what changes |
|---|---|---|---|
| `src/main.js` | 389 | KEEP | Game object, construction order, guarded bounded-step loop (`FIXED_DT 1/60`, `MAX_STEPS 3`, substep/fixed modes), title/start. Only the `[HZC]` log tag and `Calibrating …` loading text are branding. |
| `src/style.css` | 674 | ADAPT | theme tokens `--hzc-accent` (teal, commented "HZD teal"), `--hzc-warn/danger/med/focus/hostile/text/scrim`, `--mn-*`, `@font-face` block, `.hzc-*` / `.mn-*` classes → new palette + names. Layout rules stay. |
| `src/core/engine.js` | 1289 | KEEP | renderer, MSAA+SMAA, GTAO (half-res parity fix), grade, CSM, quality tiers, DRS, size cull, perf ring buffer, warm-up. No content. |
| `src/core/assets.js` | 182 | ADAPT | `normalize()` / `loadExtra()` / `applyShadowPolicy()` / `ANIMS.ual` KEEP. The `SPECS` table (`aloy`, `watcher`, `sawtooth`, `behemoth`, `thunderjaw`, `npc`) is replaced by the new heroine + any boot-critical species. |
| `src/core/events.js` | 19 | KEEP | pub/sub. |
| `src/core/input.js` | 338 | KEEP | action binds, press buffer, gamepad, settings-driven sensitivity. (Kept per brief: control stack.) |
| `src/core/collision.js` | 2414 | KEEP | BVH static world, capsule/segment casts, camera boom, melee approach term. Naming contracts to respect: it auto-seeds scene groups named `world-props` and `hunter-camp` and vegetation instanced meshes named `pines-*` / `rocks-*` (§2.3). |
| `src/core/nav.js` | 626 | KEEP | 2 m navgrid, A*, flow fields, whiskers. |
| `src/core/hitHulls.js` | 933 | KEEP | per-bone capsules derived from skin weights + BVH raycast — species-agnostic. |
| `src/core/progression.js` | 3562 | ADAPT | XP/levels/skill-tree engine, quest registry + objective types, tutorial chain runner, difficulty table, merchant economy, save hooks KEEP. Content REPLACE: NPC registry (`varl`, `sona`, `teb`, `bast`, `vala`, `karst`, `maris`, `olin`, `thok`, `renn`, `delve`, `aura`, `nil`), quests ("Proving of the Hunt", "The Thunderjaw", "The Cauldron Door" …), skill trees `Prowler / Brave / Forager` and nodes (`Silent Strike`, `Concentration+` …), hunting-ground / cauldron / override-node hooks. Densest HZD file in the tree (333 term lines). |
| `src/core/save.js` | 450 | KEEP | storage keys `hzc.save.v4` / `hzc.checkpoint.v4` / `hzc.meta.v4` → rename with the project; bump the version so old saves are refused. |

### 1.2 `src/entities/` — the KEPT rig + movement stack

| file | lines | class | reason / exactly what changes |
|---|---|---|---|
| `entities/anim/boneSpace.js` | 393 | KEEP | the one rotation convention (`rotLocal/rotChar/rotWorld`, cached bind `W/invW`, `adopt`). Rig-agnostic. |
| `entities/anim/restPose.js` | 197 | KEEP | bind capture, clip-driven / reset split, pure-clip cache. |
| `entities/anim/clipLayer.js` | 637 | KEEP | dt-driven timeScale-safe layers, stuck detector (`setIntent`). |
| `entities/anim/rigDebug.js` | 205 | KEEP | `debugFeet`, probes, overlay. |
| `entities/anim/index.js` | 31 | KEEP | re-exports `UAL_TO_ALOY` by name → follows the boneMap rename. |
| `entities/anim/registry.js` | 616 | ADAPT | `__CTX__.anim` audit KEEP. `KNOWN_MODULES` rows say `rig: 'aloy'`; the A26 probe list hard-codes `spine_01_06, head_0104, upperarm_r_043, thigh_l_0185, hand_l_014` (`registry.js:153`); `debug('aloy')` alias. |
| `entities/anim/retargeter.js` | 428 | KEEP | char-space bake; inputs are fully parameterised (§2.1). |
| `entities/anim/boneMap.js` | 72 | ADAPT | `UAL_TO_ALOY` (52 pairs) value column is the Fortnite rig's names; `AIM_RULES`, `CONTACT_BONES` (`foot_l_0189, foot_r_0215, ball_l_0190, ball_r_0216`). Rewritten for the new skeleton (identity-like if the heroine is built on the UAL skeleton). |
| `entities/anim/clipLibrary.js` | 443 | ADAPT | bake/cache/gait analysis KEEP. Hard-coded: `ClipLibrary.shared()` reads `assets.models.aloy`; `FOOT_L/R`, `BALL_L/R` literals for stance flags; `CANON_SPEEDS` mirror of `player.speeds`; `SLOT_OPTS.jog.amp 0.52` (others are solved per rig). |
| `entities/anim/locomotion.js` | 513 | KEEP | phase-locked blend tree, strafe yaw split, `REV_HYST`, `HIP_MAX`. Only a layer-set label `aloy-locomotion`. |
| `entities/anim/meleeLayer.js` | 5059 | ADAPT | the spear system (grip-by-construction, masked additive clips, beat table, draw/holster arm path, guards, step-in, ground/hull clearance) KEEP. Every table is char-space metres on Aloy's 1.72 m body, her back gear and her braid (§2.1.7). |
| `entities/playerAnimator.js` | 3884 | ADAPT | the overlay stack (aim/draw IK, foot lock, ground conform, springs, twist, look-at, hit react, step-in) KEEP. `KEY` bone map, finger/twist name patterns and every proportion constant listed in §2.1.6 must be re-derived for the new body. |
| `entities/player.js` | 4163 | ADAPT (light) | controller + camera KEEP (brief). Aloy coupling: `assets.models.aloy` (line 868), `ORBIT_CAPS` bone-prefix pairs, `ORBIT_CLOTH/HAIR/SKIN_GEAR` regexes on `dyn_*` names, `head_0104` ×8, `hand_l_014` ×2, `HEAD_REST 1.36`, `PIVOT_H 1.45`, `CAP_R 0.4 / CAP_H 1.8`, `LEAN_REST 0.10`, `ORBIT_CROWN 0.13`, `CAMP_POS (18,26)`. `SPEEDS` canon stays. |

### 1.3 `src/entities/machines/` (+ `ai/`, `rig/`)

| file | lines | class | reason / exactly what changes |
|---|---|---|---|
| `machines/machine.js` | 2285 | ADAPT | base `Machine` (FSM, perception hooks, `addEye/addPart/addWeakPoint`, three-channel `takeDamage`, eye colours, death FX, disposal) KEEP. Local `CAMP {22,30,r25}` copy; species names in comments; `displayName` defaults. |
| `machines/index.js` | 702 | ADAPT | manager (spawn, `registerKind`, chassis audit, population budget, LOD tick, alert broadcast) KEEP. Imports of the 8 Round-3 classes, the authored roster (`_spawnCls(Watcher, …)` ×8), `_spawnVariety`, `CAMP` → new roster/layout. |
| `machines/autorig.js` | 498 | ADAPT | `buildRig()` + skin-capture algorithm KEEP. `RIGS.sawtooth/behemoth/thunderjaw` are fitted to the NC sculpts → DELETE those rows; new species add rows. |
| `machines/gait.js` | 2658 | KEEP | `GaitController`, cadence bands from body length, debt trim, corpse lay, death clock. No kind checks in code (species names in comments only). |
| `machines/parts.js` | 520 | KEEP | procedural part factories (`canisterMesh`, `plateMesh`, `antennaMesh`, `powerCellMesh`, `pulseGlow`); rename HZD component labels where they appear. |
| `machines/variety-assets.js` | 561 | ADAPT | `loadVarietyModels` (one `assets.loadExtra` call), `styleMachine`, `freezeSkins`, `registerExpansionSpecies` KEEP; `SPECS`, `STYLE`, `EXPANSION_SPECIES`, `EXPANSION_KINDS` REPLACE. |
| `watcher.js`, `sawtooth.js`, `behemoth.js`, `thunderjaw.js`, `strider.js`, `scrapper.js`, `glinthawk.js`, `longleg.js` | 680/336/411/882/432/476/517/1035 | DELETE | Round-3 HZD species (designs, attacks, components after HZD canon). Use as structural templates: `sawtooth.js` = autorig+gait quadruped, `thunderjaw.js` = autorig biped boss, `longleg.js`/`watcher.js` = clip-driven + FootLock, `glinthawk.js` = flier. |
| `broadhead.js`, `grazer.js`, `snapmaw.js`, `ravager.js`, `shellwalker.js`, `corruptor.js`, `stormbird.js`, `redeye.js` | 283/272/251/301/242/279/474/120 | DELETE | Round-4 expansion HZD species (same reason). `redeye.js` shows the cheap "variant extends species" pattern. |
| `ai/index.js` | 431 | KEEP | lane contract, install, events. |
| `ai/attacks.js` | 1215 | ADAPT | scored selection + generic attack kinds (`lunge`, `charge`, `sweep`, `flurry` …) KEEP; species-authored dispatch names (`_tailSweep`, `_stomp` …) go with their species. |
| `ai/doctrine.js` | 909 | REPLACE | `CHASSIS`, `BODY`, `SPAWN_PLAN`, per-kind doctrines (herd stampede, convoy, basking, corruption, Tallneck loop). Keep the shape: `installDoctrine(m)`, `spawnExpansion(machines)`, `siteAnchor(ctx, plan)`, `doctrineAudit`. |
| `ai/emit.js` | 197 | KEEP | listener-isolated emit. |
| `ai/engage.js` | 919 | KEEP | standoff-band locomotion. |
| `ai/override.js` | 269 | ADAPT | "Override" is an HZD mechanic (teal eyes, follow, mount); the ally/mount state machine can stay under a new fiction and name, or be cut. |
| `ai/perception.js` | 268 | KEEP | senses. |
| `ai/reactions.js` | 172 | KEEP | flinch/stagger/downed tiers. |
| `ai/rng.js` | 95 | KEEP | seeded dice. |
| `ai/search.js` | 117 | KEEP | search sweeps. |
| `ai/sites.js` | 264 | KEEP | MachineSite lifecycle (freeze/fade/dispose/respawn). |
| `ai/squad.js` | 639 | ADAPT | herd/escort engine KEEP; kind-keyed escort pairs (`watcher` guards `strider` …) come from `ECOSYSTEM`. |
| `ai/stimulus.js` | 118 | KEEP | noise/stimulus bus. |
| `ai/tables.js` | 885 | ADAPT | the shape (`PERCEPTION/NOISE/ALARM/SEARCH/ENGAGE/ATTACKS/ATTACK_MODE/SCORING/REACT/ELEM_THRESHOLD/SITE/OVERRIDE/ECOSYSTEM` + `cfg()` default-merge) KEEP; every per-kind row REPLACE (§2.2.4). |
| `rig/bounds.js` | 150 | KEEP | drawn-bounds publication. |
| `rig/components.js` | 1058 | KEEP | one draw for all tearable components (partId + torn mask) — the A21 lever. |
| `rig/contact.js` | 292 | KEEP | contact ledger. |
| `rig/expansion-base.js` | 121 | KEEP | `ExpansionMachine` (socket snap after doctrine components). |
| `rig/footfall.js` | 50 | KEEP | the one `machine-footfall` emit. |
| `rig/footlock.js` | 759 | KEEP | contact foot lock for clip-driven rigs. |
| `rig/fx.js` | 498 | KEEP | instanced machine particle pool. |
| `rig/ground.js` | 1656 | KEEP | foot conform, corpse grounding, `settleCorpseNow`. |
| `rig/lod.js` | 1852 | KEEP | shared tinted materials, merge-by-material, skinned bounds, LOD chain, wreck shadow. |
| `rig/sockets.js` | 550 | KEEP | bone-space sockets + bind proxy snap. |
| `rig/shells.js` | 1106 | ADAPT | `buildShell()` / `hideSculpt()` machinery KEEP; the shell definitions (`SAWTOOTH_SHELL` etc.) are HZD silhouettes → REPLACE with the new designs. |
| `rig/shells-expansion.js` | 923 | DELETE | `BROADHEAD_SHELL … REDEYE_SHELL` — HZD silhouettes only. |
| `rig/rigs-expansion.js` | 298 | DELETE | `EXPANSION_RIGS` fitted to the HZD-cast donors; new species write their own rows (same contract as `autorig.RIGS`). |

### 1.4 `src/combat/`, `src/items/`

| file | lines | class | reason / exactly what changes |
|---|---|---|---|
| `combat/combat.js` | 2363 | ADAPT | weapon system, three-channel damage, ammo economy, aim ray, honest ballistics, hitstop, wield/stow KEEP. Rig literals: `hand_l_014` (391), `spine_03_08` (728, bow stow socket), `hand_r_045` (960); `STOW_POS (0.10,1.30,-0.17)`, `STOW_TILT 0.62`, `STOW_LEAN -0.10`; Disc-Launcher pickup and HZD weapon names. |
| `combat/melee.js` | 2391 | ADAPT | swing timing, phases, approach term, contact sync, Silent Strike/Critical Hit engine KEEP; `hand_r_045` fallback (652), `SPEAR_SCALE 0.80`, the names Silent Strike / Critical Strike. |
| `combat/bow.js` | 762 | REPLACE | procedural Hunter Bow / Sharpshot / War Bow / Blast Sling / Ropecaster / Tripcaster / spear models. Keep the model contract `{ group, model, pull, restZ, setDraw(d, showAmmo), setArrowType(id), getNockWorld(d, out) }` and `buildSpear()` / `buildWeaponModel(id)` entry points; new weapon art + variants. |
| `combat/weapons.js` | 307 | REPLACE | catalog ids `hunter-bow, sharpshot-bow, war-bow, blast-sling, ropecaster, tripcaster, disc-launcher` and ammo `hunter, hardpoint, fire, precision, tearblast, shock, freeze, blast-bomb, disc, rope, tripwire-*` → new roster; keep the `{impact, tear, element, elementAmount, drawScaled}` shape. |
| `combat/arrows.js` | 1194 | ADAPT | pooled projectiles + ballistics KEEP; per-ammo look/naming. `ARROW_LEN 0.78`, `NOCK_ARROW_LEN 0.52` tie to the bow's `pull`. |
| `combat/traps.js` | 400 | ADAPT | rope tie-down + tripwire engine KEEP; Ropecaster/Tripcaster names; `tieDownCount(kind)` per-species. |
| `combat/particles.js` | 403 | KEEP | GPU particle pool. |
| `combat/feedback.js`, `feedback.css` | 185/137 | KEEP | reticle tick, damage numbers. |
| `items/items.js` | 340 | REPLACE | item catalog (Hunter Arrow … Tripwire, metal shards, blaze, ridge-wood, sparker, chillwater, wire, braided wire, `*-lens`, machine core/heart) — HZD economy names. Keep the id/rarity/pocket schema. |
| `items/crafting.js` | 193 | ADAPT | capacities + recipes engine KEEP; recipes reference HZD resources. |
| `items/datapoints.js` | 396 | ADAPT | notebook system KEEP; record texts are HZD-flavoured lore (Nora ×7). |
| `items/gather.js` | 517 | ADAPT | gather nodes KEEP; herb variants / ridge-wood naming; local `CAMP` copy; placement is old-map. |
| `items/interactables.js` | 269 | KEEP | `register({ position, radius, label, hold, onInteract, once })`, `current`. |
| `items/inventory.js` | 219 | KEEP | counts, `item-gained`, pockets. |
| `items/tools.js` | 379 | ADAPT | quick-slot engine KEEP; potion/tool names. |

### 1.5 `src/ui/`, `src/studio/`, `src/audio/`

| file | lines | class | reason / exactly what changes |
|---|---|---|---|
| `ui/hud.js`, `hud.css` | 2742/1494 | ADAPT | presentation layer KEEP; HZD visual language (red 4-segment health, green pouch, teal/violet Focus colours, "HZD" comments), tip store key `hzc.hud.tips.v4`, card texts. |
| `ui/focus.js`, `focus.css` | 1808/382 | ADAPT | scanner (component rows, part labels, patrol ribbons, tagging, loot reveals) KEEP; "Focus" is the HZD device name and the violet look is HZD's → new device fiction + palette. |
| `ui/wheel.js`, `wheel.css` | 498/374 | ADAPT | time-slowed radial selector KEEP; file header says "HZD WEAPON WHEEL", petal art + names. |
| `ui/inventory.js`, `inventory.css` | 848/539 | ADAPT | screen KEEP; pocket/rarity names. |
| `ui/map.js` | 815 | KEEP | map baked from the heightfield; labels come from `PLACES`. `hzc.map.v1` key; menu `CAMP {18,26}` copy lives in `menu.js`. |
| `ui/menu.js` | 1219 | ADAPT | hub/title/death/victory/credits KEEP; `CREDITS` (HZD/Sony/Sketchfab rows), `HORIZON ZERO CLAUDE` kicker, `CAMP {18,26}`. |
| `ui/quests.js` | 809 | ADAPT | quest/XP/trade UI KEEP; Varl strings. |
| `ui/skills.js` | 234 | ADAPT | tree UI KEEP; inline CSS + fallback list `['Prowler','Brave','Forager']` (HZD tree names). |
| `ui/settings.js` | 374 | KEEP | `hzc.settings.v1` key only. |
| `ui/tips.js` | 120 | ADAPT | field-manual tips name Focus/Override/Concentration/species. |
| `ui/dialogue.js` | 394 | KEEP | conversation card; lines come from progression/npc data. |
| `studio/studio.js` | 1422 | ADAPT | photo mode KEEP; "hide Aloy", Aloy labels (19 lines). |
| `studio/pose.js` | 499 | ADAPT | pose/expression driver works through animator contracts; Aloy pose names. |
| `studio/cast.js`, `post.js`, `studio.css` | 233/264/218 | KEEP | cast director reads `machines.kinds`; DoF/filters pass. |
| `audio/audio.js` | 3500 | ADAPT | mix engine KEEP; set-name tables keyed by HZD kinds (`voice/<kind>`, `idle/<kind>`, weight classes), `aloy/` foley sets, bow sets `hunter/sharpshot/war`, `hzc.audio.v1`. |
| `audio/manifest.js` | 193 | REPLACE | generated by `tools/audio-bank.mjs`; regenerate with the new set names (keeps the licence column). |
| `audio/bank.js`, `buses.js`, `clock.js`, `music.js`, `probe.js`, `spatial.js`, `zones.js` | 185/219/169/412/311/388/179 | KEEP | licence-gated bank, bus graph, two clocks, adaptive score, offline probes, 3D, zone emitters. |

### 1.6 `src/world/` — the map (all location content)

| file | lines | class | reason / exactly what changes |
|---|---|---|---|
| `world/terrain.js` | 3564 | ADAPT | KEEP: the frozen API (§2.3), splat/triplanar material, surface vocabulary + `SURFACE_AUDIO`, stealth field, `stampStealthDisc`, audits. REPLACE: the landform recipe — `riverCenterX/riverHalfWidth/riverFactor`, `shelfFactor`, `pathFactor`, biome placement (`forestFactor, northBenchFactor, snowFactor, marshFactor, ashFactor, screeFactor`), the north rim/escarpment and its strata. |
| `world/vegetation.js` | 2902 | ADAPT | grass cards, tree LOD/impostors, wind, streaming KEEP; species palette (HZD red-gold grass, pines), `KEEPOUT` literal (4 old-map circles), `CAMP {22,30}`; it constructs `Props` (line 638). |
| `world/water.js` | 650 | ADAPT | ribbon solver KEEP; follows the old river (`riverCenterX`). |
| `world/environment.js` | 1789 | ADAPT | sky/sun/CSM/aerial/fog/day-night/weather KEEP; hour keyframes + grade tuned to "HZD late afternoon" → the new location's look. Builds `RiverWater` (line 488). |
| `world/camp.js` | 1197 | REPLACE | the Nora hunter camp at (22,30): tents, campfire, `npc.glb` crowd (`buildNpcCrowd`), settlement hook, `installNpcs`. Keep the campfire interactable/rest pattern. |
| `world/fauna.js` | 1058 | KEEP | instanced wildlife (Boar, Fox, Ridge Grouse, Ridge Goat, Scrub Hare) — generic animals; re-pick species per biome. |
| `world/props.js` | 930 | ADAPT | composition root (`Props` → megastructures, landmark, rockworks, activities, places, fauna; `registerColliders`, `keepouts`, `ledgeNear`) KEEP; river cobbles/driftwood/ruins content and `CAMP` copy REPLACE. |
| `world/props/kit.js` | 353 | KEEP | geometry kit (`bake`, `tint`, `paintRust/Concrete/Rock`, `tube`, `truss`, shared `materials()`). |
| `world/props/megastructures.js` | 1503 | REPLACE | five old-world landmarks keyed to the old bearings (`SITES`). |
| `world/props/tallneck.js` | 498 | DELETE | the Tallneck landmark (HZD IP). `buildLookout()` (12–15 m lookout) is generic — move it to `kit.js` if wanted. |
| `world/props/places.js` | 2597 | ADAPT | `Places` engine KEEP (baked vertex light, one shared point light, interactables, discovery, dispose). `PLACES` REPLACE: Ridgeback Outpost, Cauldron KAPPA, Ridge Trial Ground, Glowfall Caves, Slackwater Camp, The Fallen Watcher. |
| `world/props/clearings.js` | 430 | ADAPT | keepout clearing engine KEEP; `CLEARINGS` coordinates REPLACE (its own note: delete the day vegetation reads `ctx.props.keepouts`). |
| `world/props/activities.js` | 622 | ADAPT | activity-site engine KEEP; HZD activities (hunting grounds, datapoints, override nodes, supply caches). |
| `world/props/rockworks.js` | 310 | ADAPT | cliff/arch/cave colliders + ledge table KEEP; placements REPLACE. |
| `world/props/settlement.js` | 1143 | REPLACE | the Nora palisade build-out at (22,30). |
| `world/props/npcs.js` | 360 | DELETE | six baked `npc.glb` mannequins; superseded by `world/npc/*` but still called from `camp.js:147`. |
| `world/npc/npc.js` | 2999 | ADAPT | NPC system (13 NPCs, roles, talk, seated speakers, unstick, dispose) KEEP; roster data comes from `waypoints.js`. |
| `world/npc/npcAnim.js` | 1728 | KEEP | anim-core-based NPC animator. |
| `world/npc/npcBody.js` | 1000 | KEEP (seam) | procedural human body/outfit/gear generator skinned to the **UAL** skeleton — the in-repo proof that a custom human can be generated without Blender (§2.1.9). Palette tables `SKIN/HAIR/CLOTH/LEATHER/FUR`, `BODIES` adapt to the new culture. |
| `world/npc/npcRig.js` | 206 | KEEP | `NpcRigSource`: clones the UAL rig, plays clips natively, sanitised-name binding. |
| `world/npc/waypoints.js` | 239 | REPLACE | `CAMP`, `STATIONS`, `ROUTES`, `ROSTER` (Varl, Sona, Teb, Bast, Vala …). |

**Count over all 139 `src/` files:** KEEP 59 · ADAPT 51 · REPLACE 9 · DELETE 20 (multi-file rows counted per file).

### 1.7 `public/`

| path | files | size | class | reason |
|---|---|---|---|---|
| `models/aloy.glb` | 1 | 1.71 MB | DELETE | IP (§0.2). 424 joints / 271 `dyn_` / 4 meshes / 35,351 tris / 13 textures. |
| `models/watcher.glb`, `sawtooth.glb`, `behemoth.glb`, `thunderjaw.glb` | 4 | 4.83 MB | DELETE | HZD IP; three are CC-BY-NC. |
| `models/npc.glb` | 1 | 2.74 MB | DELETE | HZD character fan-art (61 meshes, 73k tris). |
| `models/npc/README.txt` | 1 | — | DELETE | placeholder. |
| `models/strider.glb`, `scrapper.glb`, `snapmaw.glb`, `ravager.glb`, `corruptor.glb`, `stormbird.glb` | 6 | 2.90 MB | REPLACE | CC-BY-3.0 donors cast as HZD machines. |
| `models/glinthawk.glb`, `longleg.gltf`, `broadhead.glb`, `grazer.glb`, `shellwalker.glb` | 5 | 5.53 MB | REPLACE | CC0 Quaternius donors cast as HZD machines; rigs/clips reusable. |
| `anims/AnimationLibrary_Godot_Standard.{gltf,bin}`, `anims/LICENSE` | 3 | 3.9 MB | KEEP | the CC0 UAL pack — 46 clips, 53-joint rig, 1.75 m T-pose. |
| `anims-hybrid/**`, `anims-reskin/**`, `anims-retarget/**` | 9 | 12.0 MB | DELETE | lab-only duplicates; `aloy-ual.json` is an Aloy-rig bake. |
| `audio/aloy/*` | 10 | 39 KB | ADAPT | rename set → hero (breath/effort/hurt, no VO). |
| `audio/voice/<kind>/{windup,strike}.ogg` | 16 | 0.12 MB | REPLACE | one pair per HZD species; regenerate per new species (`tools/audio-recipes.js`). |
| `audio/idle/<kind>.ogg` | 8 | 0.18 MB | REPLACE | servo bed per HZD species. |
| `audio/bow/{hunter,sharpshot,war}/*` | 15 | 0.05 MB | ADAPT | rename to the new bow ids. |
| `audio/{foot,gear,hit,machine,melee,mstep,music,rope,status,trap,amb}/*` | 107 | 2.4 MB | KEEP | generic foley, score stems, ambience beds (beds are biome-named: `meadow/river/forest/ridge/night`). |
| `audio/MANIFEST.md` | 1 | 42 KB | ADAPT | regenerated; author string "Horizon Zero Claude" on 167 rows. |
| `fonts/*.ttf` | 8 | 1.4 MB | KEEP | OFL; swap only if the new brand needs a different display face. |
| `favicon.svg` | 1 | 1 KB | REPLACE | brand. |

### 1.8 `tools/` and repo roots (not asked for, listed because the gates depend on them)

| path | class | reason |
|---|---|---|
| `tools/gates.mjs`, `gate-verdict.mjs`, `gate-speeds.mjs`, `chrome-profile.mjs`, `chrome-profile-selftest.mjs`, `chaos-gates.mjs`, `screenshot.mjs`, `dump-structure.mjs`, `compare.mjs` | KEEP | the harness. |
| `tools/budgets.mjs` | ADAPT | `BUDGETS` KEEP; `PERF_SCENARIOS` cast HZD kinds at old-map coordinates (§4.3). |
| `tools/gates.config.mjs`, `tools/gates.round4.*.mjs` | ADAPT | §4. |
| `tools/optimize.mjs`, `bake-rigs.mjs`, `measure-machines.mjs` | ADAPT | model lists / donor lists; the gltf-transform pipeline (meshopt + quantize + WebP) and the rig-spec bake into `asset.extras.hzcRig` stay. |
| `tools/audio-bank.mjs`, `audio-recipes.js` | ADAPT | set names per species/hero/bow; deterministic synthesis stays. |
| `tools/spike-*.mjs`, `labs/**`, `spike-*.html` | DELETE (or archive) | Round-4 retarget/reskin/hybrid spikes; the only readers of `public/anims-*`. |
| `tools/scratch/*` (tracked) | DELETE | probe scripts + draw dumps naming HZD meshes. |
| `README.md`, `package.json` (`"description": "Horizon Zero Dawn homage …"`), `index.html` | ADAPT | brand, credits, title DOM (§2.4). |
| `models-staging/**` (134 MB, mostly ignored) | DELETE what is HZD-cast; keep CC0 packs only if a lane uses them | disk. |
| `reference/**`, `docs/media/**` | REPLACE | §0.2. |
| `docs/ROUND3.md`, `docs/ROUND4-*.md`, `docs/research/*` | archive | Round-4 history; SPEC.md becomes SPEC v5. |

---

## 2. The seams new content plugs into

### 2.1 A new humanoid body (the heroine; also any human enemy)

#### 2.1.1 Load chain, in boot order

1. `src/core/assets.js` `SPECS.aloy = { url: '/models/aloy.glb', targetHeight: 1.72, yaw: 0, yOffset: -0.055 }` →
   `assets.normalize()`: bbox-height scale to `targetHeight`, feet at y = 0 (+ `yOffset`, here −55 mm because skirt tassels hang below the soles), visual forward +Z, every material forced `FrontSide`, `applyShadowPolicy` (cast if bounding sphere ≥ 15 % of the model's, largest 8 always).
   `ANIMS.ual = { url: '/anims/AnimationLibrary_Godot_Standard.gltf' }` is loaded raw, meshes hidden, never added to the scene.
2. `Player` constructor (`player.js:868`): `this.model = skeletonClone(ctx.assets.models.aloy.root)`, `model.name = 'player'`, added to the scene, then `this.animator = new PlayerAnimator(ctx, this.model)` (`player.js:1138`). `ctx.player` does not exist yet inside this call.
3. `PlayerAnimator` constructor: collects bones by name, builds `_entries` for the `KEY` table, fingers, `dyn_` chains, twists; measures arm lengths, ball/ankle rest heights, bind sole pitch and pelvis rest height **from the bind pose**; calls `ClipLibrary.shared(ctx.assets, ctx.player?.speeds)`; builds `AnimationMixer(model)`, `LocomotionBlend`, `BoneSpace.adopt`, `RestPose`, `RigDebug`, `MeleeLayer(this)`; registers with `anim/registry`.
4. `ClipLibrary.shared(assets, speeds)` returns `null` unless **both** `assets.models.aloy` and `assets.anims.ual` exist (the procedural fallback then runs). It clones the rig privately (`SkeletonUtils.clone(aloy.root)`), builds one `Retargeter`, and bakes slots on demand (`get(slot)`; cached module-level, ~90 ms for the gait set).

To bind a new body: give `assets.js` a `SPECS.<hero>` row, point `player.js:868` and `clipLibrary.js shared()` at it (two literal `aloy` reads), and supply a new `boneMap` + `KEY` table. Nothing else in the chain names the model.

#### 2.1.2 `boneMap.js` — key semantics

```js
export const UAL_TO_ALOY = { 'DEF-hips': 'pelvis_05', 'DEF-spine.001': 'spine_01_06', … };  // 52 pairs
export const UAL_HIP = 'DEF-hips';
export const AIM_RULES = { 'DEF-hand.L': 'DEF-f_middle.01.L', 'DEF-hand.R': 'DEF-f_middle.01.R',
                           'DEF-head': null, 'DEF-foot.L': null, 'DEF-foot.R': null,
                           'DEF-toe.L': 'inherit', 'DEF-toe.R': 'inherit' };
export const CONTACT_BONES = ['foot_l_0189', 'foot_r_0215', 'ball_l_0190', 'ball_r_0216'];
```

- **Keys are SOURCE bones** (the UAL / Rigify `DEF-*` names, written with dots). `GLTFLoader` sanitises names (`DEF-spine.001` → `DEF-spine001`, `DEF-toe.L` → `DEF-toeL`); the retargeter resolves both spellings. **Values are EXACT target bone names** (no prefix matching).
- 52 pairs = 22 body (hips, spine.001/.002/.003, neck, head, shoulder/upper_arm/forearm/hand/thigh/shin/foot/toe ×2) + 30 finger joints (index/middle/ring/pinky/thumb × 3 × 2). The source has 3 spine + 1 neck; Aloy has 5 + 2, so `spine_02_07`, `spine_04_09`, `neck_02_0103` are unmapped: they hold their bind local rotation and inherit.
- `AIM_RULES` (source-keyed) choose the rest correction per bone: *undefined* → aim the target bind bone at its first mapped descendant (this is what turns an A-pose bind into the source's T-pose so "arm down 90° from rest" means the same on both rigs); a source-bone *string* → aim at that bone; `'inherit'` → parent's correction; `null` → identity (the target's own bind IS the rest). Ankles are `null` because aiming them baked the source's rest ankle onto Aloy (13° plantarflexed idle). **Assumption carried by `null` ankles: the new body's bind pose has flat feet.**
- `CONTACT_BONES` are target names whose char-space heights are recorded per baked frame (ground fix + gait analysis).
- Missing pairs are tolerated (`missingSource`, `missingTarget` lists), but every bone the animator writes must exist (§2.1.6).

#### 2.1.3 `Retargeter` inputs and assumptions

```js
new Retargeter({ targetRoot, sourceRoot, map, hip, aim, contacts,
                 correct: 'all'|'arms'|'none',  hipScale: null, rootMotion: 'strip'|'keep' })
retargeter.bake(clip, { groundFix = true, amp = 1, name }) → { clip, info }
```

- Both roots are reduced to **character space**: the root Group's frame, +Y up, +Z forward, metres. Bone-local axis conventions never have to agree (Rigify +Y along the bone vs UE4 +X along the bone, mirrored L/R).
- The source must be in **rest pose** when the retargeter is built (UAL: clean T-pose, bindMatrix identity, 1.75 m, feet at y≈0).
- Per pair: rest correction `C`, `Wt2 = C·Wt`; per frame `Wdes = (Ws(t)·Ws⁻¹)·Wt2`, written as an absolute char orientation, parents first.
- Hip: `pelvis = Pt + (Ps(t) − Ps)·hipScale`, `hipScale = Pt.y / Ps.y` (1.029 for Aloy). Root motion stripped by default; `Roll_RM` keeps its travel as `rootProgress`.
- `amp` is an amplitude warp used by `clipLibrary` to retime cadence (solved per rig, §2.1.5).
- Output tracks `'<bone>.quaternion'` and `'<pelvis>.position'` bind **by name** on any `SkeletonUtils.clone` of the same rig.

#### 2.1.4 `RestPose` / overlay assumptions

- Bind is captured once, in the animator constructor (model at identity, `updateMatrixWorld(true)`).
- Each frame: bones the clips never write (Aloy: `spine_02/04`, `neck_02`, every `dyn_`) are reset to bind; clip-driven bones restore the pure clip pose (`e.clipQ`) before `mixer.update`, then overlays **multiply** on top.
- `_rot`/`_rotQ` rotate about a **char-space** axis with the bone's bind char orientation; `_rotL`/`_rotQL` with the live one. Consequence that matters for Round 5: **every angular overlay (leans, banks, stance flexes, blade/pitch, hit lean) is rig-agnostic** as long as the new body's root is in char frame. What is NOT rig-agnostic is (a) bone names, (b) absolute char-space positions in metres, (c) one bone-local axis: `_curlFingers` curls about **bone-local +Z** (UE4 convention; Rigify fingers curl about local X).

#### 2.1.5 `ClipLibrary` / `LocomotionBlend`

- `CLIPS` slot → UAL clip: `idle Idle_Loop, walk Walk_Loop, jog Jog_Fwd_Loop, sprint Sprint_Loop, strafe Walk_Loop (re-baked as Strafe_Loop), crouchIdle, crouchFwd, roll Roll_RM, death Death01, hitChest, hitHead, jumpStart/Loop/Land, interact, pickup PickUp_Table, swordAttack, swordAttackRM, swordIdle, punchJab, punchCross`. Rig-agnostic.
- `SLOT_OPTS`: `jog { amp: 0.52 }` (fixed), `strafe { cadence 2.9, speed 'aim', ampRange [0.35, 0.95] }`, `sprint { cadence 3.25, speed 'sprint', ampRange [0.70, 1.0] }` — the amp is **solved** against the measured cycle, so cadence re-derives on a new body automatically; only `jog.amp` was hand-tuned on Aloy.
- `CANON_SPEEDS { walk 1.5, crouch 1.4, crouchAim 1.05, aim 1.35, jog 5.0, sprint 6.8 }` mirrors `player.speeds` (A81 fails on a mismatch).
- Gait analysis hard-codes Aloy names: `FOOT_L 'foot_l_0189'`, `FOOT_R 'foot_r_0215'`, `BALL_L 'ball_l_0190'`, `BALL_R 'ball_r_0216'`; `STANCE_H 0.035 m`, `LOWER_EPS 0.02 m`.

#### 2.1.6 What `playerAnimator.js` hard-codes about the Fortnite rig

**The `KEY` table (`playerAnimator.js:241`)** — the 31 names the overlays address:

| short | Aloy bone | short | Aloy bone | short | Aloy bone |
|---|---|---|---|---|---|
| pelvis | `pelvis_05` | clavL / clavR | `clavicle_l_011` / `clavicle_r_042` | thighL / thighR | `thigh_l_0185` / `thigh_r_0211` |
| spine1 | `spine_01_06` | upArmL / upArmR | `upperarm_l_012` / `upperarm_r_043` | calfL / calfR | `calf_l_0186` / `calf_r_0212` |
| spine2 | `spine_02_07` | loArmL / loArmR | `lowerarm_l_013` / `lowerarm_r_044` | footL / footR | `foot_l_0189` / `foot_r_0215` |
| spine3 | `spine_03_08` | handL / handR | `hand_l_014` / `hand_r_045` | ballL / ballR | `ball_l_0190` / `ball_r_0216` |
| spine4 | `spine_04_09` | neck1 / neck2 | `neck_01_0102` / `neck_02_0103` | eyeL / eyeR | `L_eye_0127` / `R_eye_0124` |
| spine5 | `spine_05_010` | head | `head_0104` (sits at the **skull base**: bone y 1.40, chin 1.32, crown 1.56) | lids | `L/R_eye_lid_upper/lower_mid_0125…0129` |

- Null-safety: `_rot*` skip a null entry, so eyes/lids/neck2/spine2 may be absent; **`meleeLayer` dereferences `b.spine4.bone`, `b.spine5.bone`, `b.neck1.bone` unguarded** (`meleeLayer.js:3782, 3783, 3932, 4388, 4458, 4459`) — on a 3-spine/1-neck body alias those keys to real bones.
- Name patterns resolved by prefix (`_findName`, shortest match, skipping `_end`/`_Base`): fingers `${index|middle|ring|pinky}_${01|02|03}_${l|r}_`, `thumb_${01..03}_${side}_`; twist joints `lowerarm_twist_0{1,2}_{l,r}_`, `upperarm_twist_0{1,2}_{l,r}_`, `calf_twist_0{1,2}_{l,r}_`, `thigh_twist_01_{l,r}_` (14 driven; skipped if absent). `meleeLayer` derives the spear grip from `index_01_r_`, `middle_01_r_`, `pinky_01_r_` (knuckle line).
- `handAttach(side)` returns the `KEY.handL` / `KEY.handR` **Bone objects themselves** (combat parents the bow to the left hand bone and orients it in world space; `melee` grips the spear off the right). `getBoneWorld(name, out)` accepts full names or prefixes.
- **Hair/cloth springs** (`_buildChains` / `_springs`): every bone whose name starts `dyn_` and whose parent is not `dyn_` roots a chain; chains follow the first child, forks start new chains, `_end` bones are tips (fallback tip offset `(0, 0.05, 0)`). Class by regex on the root name: `hair /hair|frontLock/`, `necklace`, `dangle /Dangle/`, `cloth /skirt|Flap|[Ss]ash|Rope/`, `gear /pouch|quiver|arrow/`, `shirt`; unmatched → cloth. Right side detected by `/_r_|_r$|_r[0-9]/`. Collision capsules: pelvis→head r 0.155, thigh→calf r 0.105 ×2. Solver: `SUB_DT 1/45`, `MAX_SUB 3`, `RESEAT_D2 1.0`, `DRIVE_V_MAX 14`, `DRIVE_A_MAX 26`, `PBD_V_MAX 1.5`. Aloy: **66 chains / 271 `dyn_` bones**. Other readers of `dyn_` names: `player.js` orbit proxy (`ORBIT_CLOTH /^dyn_(skirt|legFlap|hipFlap|hipSash)/`, `ORBIT_HAIR /^dyn_(hairBack|frontLock)/`, `ORBIT_SKIN_GEAR /^dyn_(quiver|arrow)/`), `meleeLayer` braid guard (`dyn_hairBack*`, `dyn_hairBackMain_02/03/06_end`, `dyn_hairBackSide_04/05_r`), gates A19/A33/A34/A104.

**Constants measured from the bind pose (transfer automatically):** arm segment lengths (`_lenUpL/LoL/UpR/LoR`; Aloy bow arm 0.493–0.501 m), `_ballRest` (−0.007 m), `_ankRest`, `_bindPitch` per foot, `_pelvisRestY`, pelvis translation basis.

**Constants tuned by hand to Aloy (must be re-derived on the new body):**

| constant (file:line) | value | what it encodes |
|---|---|---|
| `QUIVER_HIP` (pA:188) | `(-0.2, 1.02, -0.14)` char m | hip quiver point the string hand dips to (A17) |
| `QUIVER_T` (pA:186) | 0.34 s | reach-to-quiver beat |
| `ANCHOR_OFF` (pA:198) | `(-0.086, -0.024, 0.118)` head-bind m | cheek/mouth-corner draw anchor, relative to a head bone at the skull base |
| `ANCHOR_DROP` (pA:212) | 0.038 m | max slide down the jaw when the draw triangle won't close |
| `HAND_ANCHOR_R` / `_FROM` (pA:219-220) | 0.064 m / 0.72 | string hand may sit this far from the anchor past 72 % draw |
| `HEAD_OFF` / `HEAD_R` (pA:226-227) | `(0,0.05,0.01)` / `(0.105, 0.135, 0.115)` | head keep-out ellipsoid fitted to Aloy's skull |
| `HAND_IN` (pA:232) | 0.90 | how deep the drawing hand may sit in the ellipsoid |
| `BOW_ARM_LOCK` (pA:237) | 0.9945 of span | ~168° bow-arm elbow (A35 165–172°) |
| aim layer (pA:2757–3176) | chest blade `-(0.22 + 0.80·draw)` rad, clavicle protraction `0.62·draw`, stance pelvis yaw −0.3, thigh/calf/foot flex 0.05–0.26 | closes Aloy's draw triangle: anchor ≈0.63 m from the bow shoulder vs 0.49 m arm and 0.465 m draw |
| grip seed (pA:2936) | `(0.14, 1.42, 0.03) + 0.42·aim` char m | ready-hold bow grip |
| aim-ray origin (pA:2836-2837) | `position + (0.45 fwd, 1.43 up)` | chest height for the fallback ray |
| right-arm reach (pA) | `(lenUpR + lenLoR) · 0.985`; nock residual 0.068 m; loose kick 0.075 m | |
| poles (pA:3024, 3113) | `(0.3,-0.95,0.12)`, `(-0.45,-0.75+0.2·draw,-0.9)`, flourish `(-0.5,-0.95,-0.3)` | elbow directions |
| bow carry (pA:1932-1950) | grip `(±0.24/0.245, 0.86–0.94, 0.06–0.135)`, pole `(0.85,-0.55,-0.25)` | low carry in the left hand |
| two-hand carry (pA:3318-3324) | L `(0.08, 1.03, 0.36)`, R `(-0.02, 0.97, 0.10)` | heavy-weapon carry |
| heal reach (pA:1724) | `(0.12, 1.30, 0.16)` | medicine beat |
| `MAX_LOCK` (pA:132) | 0.30 m | foot-lock budget |
| `STEP_TRIGGER/_REKEY/_DUR/_LIFT/_LEAD/_LEAD_MAX/_WINDOW/_COOL/_SLIP` (pA:157-177) | 0.105 / 0.03 / 0.155 s / 0.075 / 0.22 s / 0.34 / 1.15 s / 0.06 s / 0.040 m | melee step-in |
| `HIT_CLASSES` (pA:268) | lean 0.17 / 0.30 / 0.44 rad, dur 0.62 / 1.18 / 1.55 s | hit react |
| roll flatten | 60 % of hip rise, cap 0.24 m | `Roll_RM` swan-dive fix |
| ground conform | clamp ±0.35 rad, fade `1 − smoothstep(speed, 0.5, 2.0)` | |
| `_bodyCapsules` | 0.155 / 0.105 m | spring collision |

**`player.js` (controller/camera, kept) — the Aloy-scale numbers:** `CAP_R 0.4`, `CAP_H 1.8`, `PIVOT_H 1.45`, `PIVOT_H_CROUCH 1.06`, `HEAD_REST 1.36`, `LEAN_REST 0.10`, `ORBIT_CROWN 0.13`, `ORBIT_HAIR_R 0.09`, `ORBIT_CLOTH_R 0.13`, `ORBIT_CAPS` radii 0.04–0.17 on bone-prefix pairs (`lowerarm_l→hand_l`, `hand_l→middle_03_l_end` …), `CAM_DIST 2.8 / AIM 1.75 / CROUCH 2.55`. A different height scales most of these by `newHeight / 1.72`.

**`combat.js` / `melee.js` / `bow.js`:** `STOW_POS (0.10, 1.30, -0.17)` char m on `spine_03_08`, `STOW_TILT 0.62`, `STOW_LEAN -0.10`; bow `pull 0.52`, `restZ 0.055` (the draw length the animator's triangle must close); `ARROW_LEN 0.78`, `NOCK_ARROW_LEN 0.52`; `SPEAR_SCALE 0.80` (authored 1.85 m haft → 1.48 m).

#### 2.1.7 `meleeLayer.js` tables (all char-space metres on Aloy)

`SOCKET { MID (-0.15, 1.18, -0.335), TILT 31°, LEAN 8°, BONE 'spine2' }`; `CARRY { TILT_MIN 30.5°, TILT_MAX 54°, MID_BALL 0.265, TIP_ABOVE 0.23, TIP_ABOVE_MAX 0.66, TIP_RIGHT 0.22, HAIR_KEEP 0.105, BOW_KEEP 0.22, PUSH_MAX 0.22, MID_CEIL 0.288 }`; `READY { hand (-0.36,1.02,0.26), shaft (0.40,-0.37,0.84), lh (0.35,0.93,0.08) … }`; `STANCE` per beat (thigh/calf/foot angles + `dx/dy` pelvis drops to −0.37 m on the heavy); `BEATS` light-1/2/3 cock/contact/follow keys (hand/shaft/left-hand positions + yaw/pitch/roll); `HEAVY` cock `(-0.30,1.62,0.22)` / contact `(-0.22,1.24,0.80)` / follow `(0.04,0.94,0.54)`; guards `HEAD_CYL_DROP 0.05`, `SHAFT_CLEAR 0.200`, `HAIR_CLEAR 0.095`, `HAIR_FIX 0.078`, `BOW_ARM_CLEAR 0.11`, `BACK_DEPTH 0.13`, `FORE_CLEAR 0.24`, `ARM_R 0.05`, `ARM_CLEAR 0.06/0.03`, `TIP_GROUND_CLEAR 0.10`, `ELB_OVER_HEAD -0.01`, `ELB_BEHIND 0.07`, `DRAW_YAW 0.42`, `JOG_TORSO_CAP 40°`, `HEAD_STAB_MAX 0.055`; grip `GRIP_FRAC 0.20`, `GRAB_FRAC 0.60`, `GRAB_SNAP 0.09`; `MASK_PREFIX` (UE4 names: `spine_01…05`, `neck_01/02`, `head_`, `clavicle_l/r`, `upperarm_l`, `lowerarm_l`, `hand_l`) and `AXIAL_PREFIX ['spine_','neck_','head_']` select which bones the masked `Sword_Attack` clip may write. First-pass port: scale positions by height ratio, then re-measure against A100–A107.

#### 2.1.8 The two ways to build the new body

| | A. author on the UAL skeleton (generated in node, like `npcBody.js`) | B. custom skeleton (needs Blender or another DCC) |
|---|---|---|
| retarget | none needed (`boneMap` ≈ identity; retargeter still bakes gait metadata) — zero retarget error | full retarget, same as Aloy |
| `KEY` | 3 spine + 1 neck: alias spine2/spine4/neck2 or insert intermediate bones into the generated skeleton | keep UE4-style names and the table moves almost unchanged |
| springs / twist / face | add `dyn_*` chains (+ `_end` tips) to the skeleton at generation time; twist and face are optional | authored |
| bone-local axes | Rigify (+Y along bone): flip `_curlFingers` to local X | match UE4 or adapt |
| tooling | node + three + gltf-transform (in repo) | Blender not installed (`brew install --cask blender`, ~1 GB) |

`npcBody.js` + `npcRig.js` already prove A for 13 NPCs (one skinned mesh per body, outfit + gear in one buffer, 13 draws for 13 NPCs, clips played natively).

### 2.2 A new machine species

#### 2.2.1 The class shape (template: `sawtooth.js`)

```js
export class Species extends Machine {
  constructor(ctx, manager, opts) {
    super(ctx, manager, { kind, displayName, rigged:false, yawFix, maxHealth, armor, level,
      elemWeak, elemResist?, walkSpeed, runSpeed, turnRate, sightRange, hearRange, eyeHeight,
      attackRange, bodyRadius, standoffHalfLen?, ...opts });
    this.addEye(parent, x, y, z, scale, core, intensity);            // state-coloured sensor
    const p = this.addPart({ name, displayName, mesh, pos, snap, snapTarget, orient, proud, rot,
      tearHp, elemental:'blaze'|'freeze'|null, settleY, weak, weakMult, loot:[{id,n}],
      linkedAttack?, pickupWeapon?, update(dt,t,p), onTorn(part,m) });
    this.addWeakPoint(name, parent, x, y, z, radius, mult);
    this.lootTable = rollLoot([{ id, min, max, chance? }, …]);
    buildShell(this, SHELL_FN, { rig: RIGS[kind] });    // optional authored plates (rig/shells.js)
    attachRigRuntime(this);                              // rig/lod.js: shared mats, LOD, skinned bounds
    buildRig(this, RIGS[kind]);                          // autorig.js (static sculpt → SkinnedMesh)
    this.gait = new GaitController(this, this.rig, { walk:{stride,duty,lift,offsets:{LF,RF,LH,RH}},
      run:{…}, runRef, rollAmp, impactAmp, breatheRate, stepDustSpeed, turnRadius, lookClampYaw,
      stanceFlex, fidgets:[{name, head, spine, tail, dur}], cadenceWalk?, cadenceRun?, bodyLength?,
      crouchDrop?, corpse?, layWreck?, highWalk?, standLift?, bellyMin? });
    hideSculpt(this); foldMachineMeshes(this); snapSockets(this);
  }
  _updateDeath(dt) { super._updateDeath(deathDt(this, dt)); }
  _die() { super._die(); settleCorpseNow(this); }
  onDeathPose(k, deathT) {}  chooseAttack(dist) {}  animate(dt, t) {}
}
```

Clip-driven alternative (rigged donor with clips — `longleg.js`, `watcher.js`): `AnimationMixer` + `ClipLayerSet` + `rig/footlock.js` `FootLock` + `rig/footfall.js`. Every mesh in the subtree carries `userData.machine`. Contract fields gates read: `kind, root, position, alive, health, maxHealth, displayName, level, state, parts, route, debugFeet()`.

#### 2.2.2 Autorig spec (`autorig.RIGS[kind]`, or `rig/rigs-expansion.js`)

```js
{ spine: [{ name:'pelvis'|'spine'|'chest'|'neck'|'head', pos:[x,y,z], r, tip? }],
  tail:  [{ name:'tail1'…, pos, r }],
  legGateY,                                   // leg bones capture only verts below this
  legs:  [{ id:'LF'|'RF'|'LH'|'RH'|'L'|'R', parent:'chest'|'pelvis', hinge:±1,
            hip, knee, ankle, toe, r, restFoot:[x,z] }] }
```

Body space of the normalised model: +Z forward, y = 0 at the feet, metres. `tools/bake-rigs.mjs` writes it into the GLB as `asset.extras.hzcRig` (seen in today's sawtooth/behemoth/thunderjaw files). Gait cadence band: `cadenceBand(bodyLength)` (`BAND_REF_HZ 2.2` for a 2.5 m body, `BAND_LO_K 0.45`, `BAND_HI_K 1.35`), gate A48.

#### 2.2.3 Loading and registration

- Boot-critical: a row in `assets.js SPECS`. Deferred (normal): `variety-assets.js` `SPECS[kind] = { url, targetHeight, yaw: 0 }` (facing goes in the class's `yawFix`, never both), optional `STYLE[kind]` for `styleMachine`, loaded by one `ctx.assets.loadExtra(SPECS, { onEntry })`, then `machines.registerKind(kind, Cls)`. `machines.kinds` lists every constructible kind; `canSpawn(kind)`; `CHASSIS[kind] = '<donor kind>'` lets doctrine/tables/gates run before the sculpt exists.
- `targetHeight` scales on **bbox height** — derive it from the design's length for long/low bodies (`variety-assets.js` comment).

#### 2.2.4 AI tables (`ai/tables.js`) — per-kind rows, merged over `default` by `cfg(table, kind)`

`PERCEPTION` (d0, gain, focusPad, periph*, hiddenRange, engagedRange …), `NOISE`, `ALARM.radius`, `SEARCH`, `ENGAGE` (standoff band), `ATTACKS[kind] = [{ id, min, max, cd, score, arc?:'rear', authored:'species'|'_methodName', cdField?, generic?:'lunge'|'charge'|'sweep'|'flurry'|…, params:{damage, windup, strike, recover, dash, range, speed, knock, hits, arcDeg, close} }]`, `ATTACK_MODE` (`default 'hybrid'`, `'table'`), `SCORING`, `REACT`, `ELEM_THRESHOLD`, `SITE` (freeze 10 s, fade 70+12 s, respawn 300–420 s, maxWrecks 10), `OVERRIDE.kinds`, `ECOSYSTEM` (escorts, population budget in scene nodes). Body/stat blocks for doctrine kinds: `doctrine.js BODY[kind]`.

#### 2.2.5 Spawn API

`machines.spawn(kind, x, z, opts)` → resolver (registered class or chassis) → `_recycleForBudget` (population ceiling in scene nodes) → `_spawnCls(Cls, x, z, { route, heading, …, kind, modelKind, _placement })`; route default `_route(x, z, 22, 4, seed)` (clamped to 310 m). Authored layout lives in the `Machines` constructor (`_spawnCls(Watcher, -30, -40, …)` ×8) and in `doctrine.js SPAWN_PLAN` (`{ kind, n, x, z, route, herd?, convoy?, basking?, escort?, poi }`, anchored by `siteAnchor` to `ctx.props` POIs). Sites remember placement only; identity always comes from the resolver.

#### 2.2.6 Other per-kind hooks

Audio sets `voice/<kind>/{windup,strike}`, `idle/<kind>`, `mstep/{light,medium,heavy}` by mass class (`audio.js`); hit hulls are derived from skin weights (no per-kind data); Focus card from `parts`; perf budget per machine ≈ **≤ 8 rendered meshes and ≤ 5 shadow casters at 8–45 m** (SPEC §11 A21 note) — today's folded species cost 4–17 draws each (§5).

### 2.3 The world

Construction order (`main.js`): `Terrain → Environment (builds RiverWater) → Vegetation (builds Props → Megastructures, TallneckLandmark, Rockworks, Activities, Places, Fauna) → Camp (installNpcs) → Player (installSpatial → collision.seedWorld) → … → installProgression → audio → hud → installMenus → studio`.

| piece | API to keep | location content to replace |
|---|---|---|
| terrain | `getHeight(x,z)`, `getNormal(x,z,out)`, `heightFast`, `slopeFast`, `tallGrassDensity(x,z)`, `isInTallGrass(x,z)`, `surfaceAt(x,z)` ∈ `Terrain.SURFACES`, `materialAt(x,z)` ∈ `Terrain.MATERIALS`, `Terrain.BIOMES`, `Terrain.SURFACE_AUDIO`, `WORLD_SIZE 720`, `WORLD_HALF`, `PLAY_RADIUS 330`, `stampStealthDisc(x,z,r)`, `stealthField`, `biomeWeights` | river/shelf/path/biome field functions, rim + strata, `MARSH_LEVEL` |
| vegetation | `grassDensityAt`, `windAt`, `forceStream`, `invalidate`, `countGrassNear`, `grassStats/treeStats`, `dispose`; instanced meshes named `pines-*` / `rocks-*` are auto-collided | species, `KEEPOUT` literal, camp clearing |
| water | `levelAt`, `depthAt`, `flowAt` | the river path |
| environment | `time`, `setTime(h)`, `setWeather(name, fade)`, `registerMaterial(mat)`, `rest()`, `debugInfo()`; owns `engine.grade.uniforms` values | hour keyframes, palette, weather mix |
| props | `ctx.props.places`, `sites()`, `placeAt(x,z)`, `ledgeNear(x,y,z,d)`, `keepouts [{id,x,z,hard,soft}]`, `npcSlots`, `crossings`, `registerColliders()`, `dispose()`; `PLACES` row schema `{ id, name, kind, x, z, radius, blurb }` (kind is read by machine-ai + progression) | every place, landmark, ruin, crossing |
| collision | auto-seed: meshes under scene groups named **`world-props`** (kind `ruin`/`tower` by mesh name) and **`hunter-camp`** (kind `tent`); skipped: meshes owning a `raycast` (FX shells), < 0.3 m tall, `depthWrite:false`. Everything else: `ctx.collision.register({ kind, object \| shape, blocking, occluder, dynamic })` (also stamps the navgrid), returning ids to keep for disposal | — |
| interactables | `ctx.interactables.register({ position, radius, label, hold, onInteract, once })` | labels |
| NPCs | `installNpcs(ctx, { camp })`, `npcs.talkTo(id)`, `nearest`, `landmarks()`; data `ROSTER/STATIONS/ROUTES` (`waypoints.js`), `BODIES` (`npcBody.js`) | roster, stations, routes, culture palette |
| spawn / respawn point | — | **eight copies** of the camp coordinate: `player.js CAMP_POS (18,26)`, `menu.js (18,26)`, `{22,30}` in `machine.js`, `machines/index.js` (r 25), `props.js`, `vegetation.js`, `gather.js`, `npc/waypoints.js`; plus `terrain.js`, `settlement.js`, `camp.js`, `props/npcs.js` reference (22,30). Centralise in one exported constant. |

### 2.4 UI theme and branding

| surface | where | what it says today |
|---|---|---|
| document title + wordmark | `index.html:6` `<title>Horizon Zero Claude</title>`; `#loading` and `#title` each carry `.hzc-logo` (`HORIZON` / spark SVG / `ZERO CLAUDE`); inline `<style>` (Julius Sans One `@font-face`, `.hzc-main/.hzc-dawn/.hzc-spark/.hzc-sub`) | the HZD-parody wordmark |
| loading/title copy | `index.html` `#load-label` "Waking the machines…"; `main.js` "Calibrating …", "Compiling shaders…" | |
| tokens | `src/style.css:46` `--hzc-accent #59c1c6` ("HZD teal"), `--hzc-warn #f2c230`, `--hzc-danger #b03a2e`, `--hzc-med #7fb069`, `--hzc-focus #7b5cd6`, `--hzc-hostile #e8762c`, `--hzc-text #efe6d5`, `--hzc-scrim`; fonts `--font` Rajdhani, `--font-display` Michroma, `--font-stinger` Orbitron, `--font-focus` Chakra Petch; `:root` at 161 `--hud-scale`, `--mn-ink/dim/faint/line/gold/spark/panel` | one place to re-theme |
| component CSS | `hud.css` (1494), `focus.css` (violet scan), `wheel.css`, `inventory.css`, `studio.css`, `feedback.css`, `skills.js` inline per-tree colours (`.sk-col.Prowler/Brave/Forager`) | |
| credits / hub | `menu.js CREDITS` (HZD © Guerrilla/Sony row, Sketchfab fan-art row), hub kicker `HORIZON ZERO CLAUDE` | |
| storage keys | `hzc.save.v4`, `hzc.checkpoint.v4`, `hzc.meta.v4`, `hzc.settings.v1`, `hzc.audio.v1`, `hzc.map.v1`, `hzc.hud.tips.v4` | rename together with a version bump |
| CSS/DOM prefixes | `.hzc-*`, `#hzc-prog`, `.mn-*` | `hzc` appears on 1,270 lines (1,167 in `src`) |
| log tag | `[HZC]` in `main.js` | |
| favicon / README / package.json | `public/favicon.svg`; README "in the spirit of Horizon Zero Dawn", Credits; `package.json` name `horizon-zero-claude`, description "Horizon Zero Dawn homage", repo URL | |
| audio manifest | `src/audio/manifest.js` + `public/audio/MANIFEST.md` author "Horizon Zero Claude" ×167 | regenerated by `tools/audio-bank.mjs` |

---

## 3. HZD names and terms

Counted case-insensitively, one hit per matching line, over `src/`, `tools/`, `docs/`, `public/` text files, `index.html`, `README.md`, `package.json` (excluding `node_modules`, `dist`, `shots`, `models-staging`, `labs`). The complete per-file list is **Appendix A**; reproduce with the regexes there.

### 3.1 People, places, factions, brands

| term | lines | src | tools | docs | top code files |
|---|---|---|---|---|---|
| Aloy | 462 | 163 | 143 | 130 | `anim/registry` 26, `studio/studio` 19, `gates.round4.studio` 20, `audio/audio` 13, `audio/manifest` 10, `player` 9, `clipLibrary` 9, `playerAnimator` 7, `combat` 7 |
| Varl | 70 | 44 | 4 | 22 | `core/progression` 28, `ui/quests` 5, `camp` 3, `npc/npc` 3 |
| Nora | 43 | 32 | 4 | 6 | `items/datapoints` 7, `props/places` 6, `props/activities` 4 |
| Teb / Sona / Nil (NPC names) | 15 / 16 / 9 | | | | `npc/waypoints`, `core/progression` |
| Tallneck | 199 | 103 | 27 | 66 | `props/tallneck` 24, `ai/doctrine`, `props/places` |
| Cauldron (+ "KAPPA") | 87 (+31) | 56 | 20 | 11 | `core/progression`, `props/places`, `props/activities` |
| Hunting Grounds | 52 | 34 | 7 | 11 | `core/progression`, `props/activities` |
| Corrupted / Corruption | 73 | 41 | 13 | 19 | `ai/doctrine`, `corruptor` |
| Prowler / Brave / Forager (skill trees) | 20 / 13 / 12 | | | | `core/progression`, `ui/skills` |
| HZD / HFW | 173 / 64 | 65 / 6 | 14 / 7 | 84 / 48 | comments + gate criteria |
| "Horizon Zero" (title) | ~385 | 171 | 9 | 15 | `audio/manifest` 167 + `public/audio/MANIFEST.md` 168, `menu.js` 3, `index.html` 2 |
| Zero Dawn / Forbidden West | 25 / 14 | 2 / 0 | 2 / 3 | 10 / 6 | |
| Guerrilla / Sony / Fortnite / Sketchfab | 12 / 2 / 3 / 9 | 1 / 1 / 1 / 4 | | | `menu.js` credits, `assets.js` comment |
| HZC (project abbrev.) | 1,270 | 1,167 | 64 | 13 | CSS/DOM prefixes, storage keys, `[HZC]` |
| Carja, Banuk, Mother's Heart/Watch | 1, 1, 2 | | | | docs / one src comment |

### 3.2 Machines (each also a `kind` string, an audio set, a table key, and a gate literal)

| kind | lines (all) | src | tools | docs | gates naming it |
|---|---|---|---|---|---|
| Watcher | 707 | 286 | 153 | 261 | 57 |
| Thunderjaw | 473 | 221 | 74 | 170 | 19 |
| Sawtooth | 384 | 152 | 109 | 117 | 29 |
| Longleg | 296 | 124 | 27 | 141 | 17 |
| Behemoth | 288 | 120 | 32 | 131 | 10 |
| Strider | 286 | 134 | 45 | 103 | 15 |
| Scrapper | 240 | 115 | 31 | 90 | 23 |
| Redeye | 230 | 90 | 26 | 113 | 16 |
| Stormbird | 225 | 82 | 32 | 110 | 9 |
| Glinthawk | 219 | 87 | 43 | 85 | 22 |
| Corruptor | 219 | 95 | 12 | 111 | 5 |
| Snapmaw | 207 | 83 | 21 | 102 | 21 |
| Broadhead | 172 | 84 | 17 | 70 | 20 |
| Shell-Walker | 164 | 76 | 12 | 75 | 9 |
| Ravager | 141 | 62 | 12 | 66 | 8 |
| Grazer | 138 | 63 | 11 | 63 | 6 |
| Stalker / Bellowback / Lancehorn / Rockbreaker / Trampler / Fireclaw / Charger | 9 / 2 / 3 / 3 / 1 / 1 / 1 | | | | research docs |

### 3.3 Mechanics, items, weapons (HZD-specific vocabulary)

| term | lines | src | tools | docs | where in code |
|---|---|---|---|---|---|
| Focus | 365 | 194 | 55 | 111 | `ui/focus.*`, `hud`, events `focus-on/off/pulse`, `ctx.focus` |
| Override | 260 | 186 | 27 | 46 | `ai/override.js`, `OVERRIDE` table, event `override-node`, machine state `'overridden'` |
| Concentration | 173 | 105 | 23 | 42 | `combat.concentration`, `requestTimeScale('concentration')`, events |
| Silent Strike | 147 | 58 | 36 | 53 | `melee.js`, event `silent-strike`, prompt `SILENT STRIKE`, skill node |
| Critical Strike / Hit | 42 | 26 | 3 | 13 | `melee.js`, `reactions.js` |
| Datapoint | 233 | 138 | 50 | 45 | `items/datapoints.js`, event `datapoint-found` |
| Metal Shards (currency) | 182 | 140 | 17 | 25 | item id `metal-shards`, merchant |
| Blaze / Chillwater / Sparker / Ridge-wood / Wire / Braided Wire | 107 / 36 / 39 / 70 / — / 9 | | | | item ids + part `elemental` values (`'blaze'`, `'freeze'`) |
| Machine core / heart / lens (`<kind>-lens`) | 61 | | | | loot ids |
| Tearblast / Ropecaster / Tripcaster / Blast Sling / Sharpshot / Hunter Bow / War Bow / Disc Launcher | 41 / 43 / 41 / 23 / 46 / 33 / 16 / 89 | | | | `weapons.js`, `bow.js`, `items.js`, audio sets `bow/{hunter,sharpshot,war}` |
| Medicine Pouch | 43 | 24 | 1 | 15 | `player.pouch`, HUD |
| Weapon wheel ("HZD WEAPON WHEEL") | 31 | 14 | 1 | 11 | generic name, HZD header |
| Spear (Aloy's weapon) | 638 | 241 | 105 | 273 | generic word; keep or rename per the new weapon set |

### 3.4 Identifiers that are contracts (rename with care)

- **Events (SPEC §7 "names are law")**: `override-node`, `datapoint-found`, `hunting-ground`, `supply-cache`, `silent-strike`, `focus-on/off/pulse`, `concentration-start/end`, `machine-tied`, `rope-attached`. Rename in one pass across emitters, `audio.js` listeners and gates, or keep the strings as engine identifiers.
- **Kind strings** (`machine.kind`) key `tables.js`, `doctrine.js`, audio sets, `ELEM_THRESHOLD`, `OVERRIDE.kinds`, `ECOSYSTEM`, per-species gate exemptions and `PERF_SCENARIOS`.
- **Item ids** (`metal-shards`, `blaze`, `ridge-wood`, `sawtooth-lens` …) are persisted in saves → bump the save version.
- **Machine states**: `'overridden'` (SPEC §8).
- **`ctx` members**: `ctx.focus`, `combat.concentration`, `player.pouch` / `medicine` getter.

---

## 4. Gate inventory

248 gates (202 action, 42 visual, 4 runner). Verdicts for every gate are in **Appendix B**.

| verdict | count | meaning |
|---|---|---|
| **CARRY** | 55 | content-agnostic: runs unchanged against the new content (some only need the new content to *exist*, e.g. a 20° face, a walking machine) |
| **RESTAGE** | 181 | the assertion and its bar survive; the staging names old content — a kind literal, a coordinate, an Aloy bone/chain name, an HZD reference still, or criteria wording |
| **DIES** | 12 | the subject is old content: `V11-logo-title`, `A27b-timescale-safe-glinthawk`, `A100-expansion-doctrine`, `A44c-lineup-expansion`, `A44c-lineup-expansion-b`, `V26a/V26b-silhouette`, `V27a/V27b-attack-pose`, `A66-quest-objectives-expansion`, `V42-interior` (Cauldron KAPPA), `V43-outpost` (Nora outpost) |

### 4.1 What the 181 re-stages are made of

| coupling | gates | mechanical fix |
|---|---|---|
| a machine kind literal (`'watcher'` in 57 gates, `sawtooth` 29, `scrapper` 23, `glinthawk` 22, `snapmaw` 21, `broadhead` 20, `thunderjaw` 19 …) | 92 | one prelude module `tools/gate-roster.mjs` (pattern of `gate-speeds.mjs`) mapping **roles** → kinds: `scout`, `stalker`, `heavy`, `apex`, `herd`, `flier`, `widestCone`, `sprawlers[]`, `fliers[]`; gates splice `${ROSTER}` and stop naming species |
| a world coordinate (57 gates: `OPEN_GROUND (-60,-45)`, the 56° face at (118,220), the 38.4° hillside, the west herd (-205,-55), camp (22,30)/(18,26), rim/meadow vistas, watchtower) | 57 | `tools/gate-places.mjs`: `openGround`, `steepFace`, `hillside38`, `herdSite`, `campfire`, `rimVista[4]`, `tallGrass`, `pool`, `waterFeature` — authored once per map, ideally published by the build (`ctx.props.gatePlaces`) the way `player.speeds` is |
| an Aloy bone or chain name (16 gates name bones, 5 name `dyn_` chains: `hand_r_045`, `hand_l_014`, `head_0104`, `dyn_hairBackMain_03_0147/_04`, `dyn_skirtA_02_l_0202`, `dyn_quiverMain_0307`) | 21 | read them from the animator (`animator.b.handR.name`, a published `animator.chainOf('hair')`) instead of literals |
| an HZD reference still (V12, V22, V24, V46, V48 + criteria of V47/V49) | 7 | replace `reference/*.jpg` with licence-clean stills; criteria text keeps its geometry |
| "reads as its HZD machine / HZD design language" criteria (V10, V26, V27, V36, V37, V9) | 6 | judge against the Round-5 design sheets |
| an Aloy-specific **bar** (needs an orchestrator ruling, not a re-stage): `A34` "180 of 271 dyn_ bones", `A35` hand–head 0.10–0.16 m (head bone at the skull base), `A58` "≥ 7 grounds incl. snow/mud/ash", `A54` per-species freeze tiers, `A61` ≥ 800/1200 colliders, `A98` ≥ 6 places, `A95` 13 NPCs/6 builds | 7 | restate as fractions / roles / per-design counts |

### 4.2 CARRY list (55)

`A1-boot-clean`, `A2-dodge-displacement`, `A4-draw-strength`, `A5-arrow-fired-event`, `A6-machine-foot-plant`, `A9-perf-budget`, `A18-slope-conform`, `A20-frame-loop-survives`, `A22-msaa`, `A20b-no-system-errors`, `A45-no-skate-per-species`, `A44-socket-integrity`, `A47-corpse-grounded`, `A48-cadence`, `A74-3d`, `A73d-ui-bus`, `A53-conc-not-on-sprint`, `A79-runner-verdict-line`, `A80-chrome-profile-hygiene`, `A81-canon-speed-bands`, `A22b-fov-recompile`, `A43-corpse-lifecycle`, `A45c-foot-continuity`, `A46-ground-truth`, `A44b-socket-vertex-integrity`, `A47b-corpse-posed`, `A50-hulls-visible`, `A50b-aim-on-drawn-geometry`, `A45b-stance-report-integrity`, `A18b-slope-conform-moving`, `A28-jump-arc`, `A28b-canon-speeds`, `A30-dodge-window`, `A29b-slope-no-ghost`, `A32b-lookup-no-ghost`, `A71d-conc-veil`, `A71g-tracker-live`, `A68-no-softlock`, `A70-hub-tabs`, `A70c-title-flow`, `A72-settings-persist`, `A72b-accessibility`, `A25b-nav-and-occlusion`, `A78-cast-states`, `A79-time-authority`, `A79b-studio-shell`, `A79e-pose-overlay-frozen`, `A79f-photo-entry`, `A79d-studio-gate-shape`, `A60-stealth-lanes`, `A58b-surface-audio-world-ground`, `A59b-cover-honesty-world-ground`, `A59c-mask-coherence-world-ground`, `A56-cascades`, `A98b-clearings`.

Note: the per-species rig gates (A44/A45/A46/A47/A48 and the strict b/c variants) iterate whatever `machines.kinds` holds, so they become the new roster's acceptance bar for free.

### 4.3 The perf/memory gates (constraint gates for this round)

| gate | coupling | re-stage |
|---|---|---|
| `A9-perf-budget` | spawn vista | none (re-baseline at the new spawn) |
| `A21-real-draw-calls` | `tools/budgets.mjs PERF_SCENARIOS`: `west-herd` picks `strider`×6 + `watcher`×2 at (-205,-55); `staged-fight` order `['thunderjaw','sawtooth','behemoth','longleg','watcher','strider','scrapper','glinthawk']` | role-based cast + new herd site; budget 350 unchanged |
| `A90-memory-stability` | spawns `'watcher'` | kind swap only |
| `A90-memory-stability-expansion` | "full expansion roster" | full new roster |
| `A90b-memory-attribution` | A90 workload | kind swap |
| `A90-rig-reclaim` | `'watcher'` | kind swap |

---

## 5. Perf and memory baselines

No `shots/gates/report.*.json` existed (only an empty `p5208-suite/`), so the four named gates were run once:
`node tools/gates.mjs --port 5239 --only A1-boot-clean,A9-perf-budget,A21-real-draw-calls,A90-memory-stability`
on Oct 15 00:00–00:07, load average 4.0–5.0, Kevin's port-5173 Vite alive, headless Chrome-for-Testing 151. Report:
`shots/gates/report.p5239.json` (gitignored). Vite and Chrome exited; 0 profiles left.

| gate | verdict | numbers |
|---|---|---|
| `A1-boot-clean` | PASS (6.8 s) | `state=playing` |
| `A9-perf-budget` | PASS (9.4 s) | 1600×900 at DPR 1: draw calls **319** (< 350), **48.1 fps** (≥ 45), scene GPU 20.7 ms, attributable |
| `A90-memory-stability` | PASS (316.7 s) | 30 kills; heap 347.5 → 320.5 MB (**−7.8 %**, bar < 25 %); geometries 168 → 180 (**+12**, bar ≤ 40); textures 169 → 150 (**−19**, bar ≤ 8); programs 193 → 179; scene objects 4237 → 3711 (**−526**, bar ≤ 60) |
| `A21-real-draw-calls` | **FAIL** (on the GPU term) | see below |

**A21, graded (worse of tier-capped DPR 1.5 and raw DPR 2), three staged + pinned scenarios:**

| term | spawn vista | west herd | staged 8-machine fight | budget | status |
|---|---|---|---|---|---|
| draw calls | 319 | 211 | **343** | 350 | PASS — the fight has **7 draws of headroom** |
| triangles | 4.24 M | 3.92 M | 4.37 M | 6.5 M | PASS |
| median GPU ms (DPR 2) | 84.1 | 110.1 | 91.0 | 20 | **FAIL** — null frame 1.01 ms, GPU instability 1.06×, so the gate counts it |
| median GPU ms (DPR 1.5, the shipped `high` tier) | 53.7 | 71.9 | 58.2 | 20 | (reported, not graded) |
| p95 frame ms | 35.4 | 44.9 | 77.3 | 20 | PENDING — null frame p95 23.3 ms, burst instability 2.11× |
| p95 JS ms (sim + submit + tail) | 17.0 (12.2+4.6) | 13.0 (9.1+4.5) | 44.4 (12.6+34.2) | 9 | PENDING — JS burst instability 4.56× |

Staged-fight per-owner draw ledger (343 = 150 shadow + 171 main + 22 post; 110 active shadow casters × 3 cascades):

| owner | main | shadow | total |
|---|---|---|---|
| props | 45 | 54 | 99 |
| vegetation | 43 | 33 | 76 |
| other (unnamed scene children) | 22 | 23 | 45 |
| **player (Aloy + bow/spear/quiver)** | **16** | **21** | **37** |
| machines (8, folded) | 25 | 3 | 28 |
| post chain | 22 | — | 22 |
| terrain + sky | 13 | 9 | 22 |
| pooled VFX (unnamed roots) | 7 | 0 | 7 |

World-wide machine meshes now **316 draws** for 39 machines (engine batch ceiling 247): watcher 9/instance, sawtooth 11, behemoth 9, thunderjaw 17, strider 5, scrapper 6, glinthawk 4, longleg 7, broadhead 8, redeye 10, grazer 15, ravager 8, snapmaw 6, shellwalker 7, corruptor 10, stormbird 11, tallneck 9.

**What this means for Round 5 content.**
1. The draw-call budget is met with 7 to spare; the heroine (37 draws today with gear) and props (99) are the largest owners, not machines (Round 4's folding/LOD worked).
2. The frame is **GPU-bound**: 20.7 ms GPU at 1600×900, DPR 1 (A9) rising to 54–72 ms at the shipped DPR 1.5 and 84–110 ms at DPR 2. "60 fps on Kevin's Mac" is not met by the current content at the `high` tier; the new world should carry an explicit GPU budget per owner (the SPEC's Sep-9 quiet-box figure was 20.5 ms at DPR 1.5 for the spawn vista, before the Round-4 world/props/NPC expansion — the A21 GPU term should be re-run on a quiet box before attributing the full difference).
3. Memory is healthy and the A90 bars hold with margin; keep it that way by giving every new runtime object a dispose path.

Historical reference points (from the Round-4 docs, not re-measured today): A21 graded 296 / 489 / 508 draws before the machine-rig LOD work (SPEC §11); `A90-memory-stability-expansion` PASS 5/5 (objGrowth −541, heap +0.9 %, nonMachineGrowth 0), `A90b` PASS 5/5, `A90-rig-reclaim` FAIL 2/6 runs at `perLiveGeo 1.13` (ROUND4-MEMORY §6.5); last full suite (`suite3`, Oct 2): **248 gates — 196 PASS, 8 FAIL** (`A17-draw-beats`, `A81-canon-speed-bands`, `A47c-corpse-mass`, `A31c-clamp-framing`, `A23-aim-cost`, `A23b-hull-fidelity`, `A103-melee-contact-sync`, `A105-melee-while-moving`), 2 PENDING, 42 NEEDS-JUDGE.

---

## 6. Movement still owed on the new body

The rig/movement stack is what Round 5 keeps; these are its open items, which carry over to
whatever body it drives. Kevin's standing animation rules apply to any protagonist: idle hands
fine; running arms swing fore-aft beside the body (never T-rex, never prancing, never crossing
into the body); **bow draw hand at the cheek, outside the hair, elbow level/back, bow arm clear of
the chest; never an arm behind the head; melee performed by the body with the weapon held
properly.**

### 6.1 Bow draw

| item | state at `8d729b6` | what it needs on the new body |
|---|---|---|
| draw source | no bow-draw clip exists in UAL; the draw is the procedural `_aimLayer` (torso blade + spine pitch, cheek anchor, 2-bone IK both arms, reach clamp, head ellipsoid guard, quiver flourish, loose follow-through, tremble) | keep the layer; re-derive every constant in §2.1.6 (anchor, head ellipsoid, quiver point, grip seed, poles, blade/protraction gains) from the new skull, shoulder width and arm length |
| the draw triangle | closes only because the chest blade opens to 0.80 rad, the clavicle protracts 0.62 rad and the anchor may drop 0.038 m (arm 0.493 m vs a 0.465 m draw at 0.63 m anchor-to-shoulder) | solve `Lmax = −u·d + sqrt((u·d)² − ‖u‖² + reach²)` for the new body before choosing `bow.pull`; a longer arm frees the blade |
| extreme up-aim | at camPitch −0.4/−0.55 and while strafing the reach solve falls back to the radial pull-in (`slide −1`); the bow is not exactly on the animator's ray there | open |
| `A17-draw-beats` | **FAILS in every Round-4 suite**: `looseRearM` 0.158–0.30 against its bar, and `flourishFrames ≥ 8` is a wall-clock count (0–6 frames on a loaded box) | fix the loose follow-through; ask for a sim-clock frame count |
| `A16`, `A32`, `A35` | PASS in Round 4 (nock→hand 0.026–0.075 m, elbow under shoulder, `handHeadUnit` ≥ 0.88, bow elbow 165–172°) | re-stage (bone names) and re-tune |
| `V24-draw-vs-reference` | NEEDS-JUDGE against an HZD still | new reference |
| hair vs draw hand | the anchor was moved off the ear because the braid rendered through the glove (§9.6 of ROUND4-CHARACTER); hair collision exists only as the melee layer's post-hoc braid guard | give the new hair a collider in `_springs` against the drawing hand/forearm |
| arrow/bow geometry | `bow.pull 0.52` vs `ARROW_LEN 0.78`; nocked arrow shortened to `NOCK_ARROW_LEN 0.52` | author new bows at the new draw length |
| strafe | no strafe/backpedal clips in UAL (`Strafe_Loop` is an amplitude-warped, yawed `Walk_Loop`); the first stance after a direction change skates 0.05–0.45 m (ungated); downhill sole tilt 16–24° on a 20° face; mantle is procedural; `Hit_Head` used for knockdown | asset gaps, carried |

### 6.2 Melee — rulings R1–R9 (ROUND4-AUDIT §4 `player-melee`) stand for the new weapon set

- **R1** light-3 is one-handed (left hand never rides the shaft); A101's two-handed clause void.
- **R2** V46 ready: tip height 0.35–0.55 m char space; the "39° off vertical" claim is orthographic.
- **R3** heavy contact: fist at shoulder height, outboard of the head line (≈ `[-0.22, 1.24, 0.80]`); haft/forearm never cross the face; reach from spine pitch + lunge, not a raised hand.
- **R4** the approach term releases at a bounded rate (no single-frame root jump > 0.15 m), bounded per target by the machine's real hit-hull capsules (body capsule ≥ 0.05 m from every hull capsule); `melee.dispose()` clears it.
- **R5** a swing never starts before the draw has completed; first LMB from holstered plays the draw and queues the strike; A101 stages its first swing from holstered and reads grip fraction 0.15–0.28 at contact.
- **R6** releasing the approach term never moves her unless she moves: total release displacement ≤ 0.10 m, planted-foot drag ≤ 0.08 m (A106).
- **R7** A103 stages every kind in `ctx.machines.kinds`; tip-to-hull reach ≤ 0.15 m for each; an unreachable species is named and its standoff fixed.
- **R8** draw/holster arm path (A107): elbow never above head_y + 0.05 m nor > 0.10 m behind the head plane, from idle, jog and sprint; bow and spear never both in hand (A101).
- **R9** heavy recover: forearm ≥ 0.10 m off the belly/spine axis (A104, recover frames too); on slopes ≤ 25° the blade tip stays above terrain at contact (A103 slope rows).

### 6.3 Melee — open findings at the end of Round 4 (ROUND4-PLAYER-MELEE §0r6.4, §4–§6)

| # | finding | owner / decision needed |
|---|---|---|
| M1 | **A103 FAILS** on both final-build runs: one row whiffs where a machine's own limb holds her at arm's length (Shellwalker light-1 at a 4.0 m stop; Longleg light-2; Tallneck heavy, a lattice 0.48–0.9 m from her chest). Two rules collide: a hit needs the tip within 0.15 m of the hull, and the fist may not enter a hull (S5c/A106); with a 1.48 m spear the tip lands ≥ 1.4 m ahead | orchestrator: per-species melee stand, or a hit rule for the blade's steel rather than its point. Re-appears with any lattice-limbed new species. |
| M2 | **A105** intermittent: planted foot 0.098 m once in `suite3` (bar 0.08) on the jogging heavy/L3; earlier 1 in 13 at 0.1226 m; mechanism not caught | instrument the jogging swing window; no bar moved |
| M3 | first click at a Tallneck / grounded Stormbird from the manager's standoff (8.8 m / 12.1 m) is an honest whiff; lunge capped at 1.0 m | machine standoff (`standoffHalfLen` from an animated bbox) is a spatial/machine-rig defect the melee term only eats for melee |
| M4 | A107 clause (b) evaluates no frames (the elbow never enters its band); clause (c) binds | gate wording |
| M5 | click → first swing 0.35–0.45 s game time on a loaded box (10-frame floor from the A102 tip-teleport bound); 0.28 s at 60 fps | feel |
| M6 | hits land early in the strike (k 0.23–0.47 vs contact key 0.70) because the hit follows the blade onto the hull | accepted |
| M7 | a kill mid-lunge finishes its step 0.6–0.84 m into the freed space | accepted |
| M8 | arm last resort straightens the upper spine ≤ 0.36 rad against a lattice | accepted |
| M9 | haft authored 1.85 m, scaled by `SPEAR_SCALE 0.80` to 1.48 m (scales the blade and wrap too) | author the new weapons at their real length (`buildSpear` / weapon variants) |
| M10 | braid clearance is post-hoc (springs run after the melee layer) | spring-side collider |
| M11 | Silent Strike draws the spear on the strike, not before | interactables hold window |
| M12 | `Sword_Attack_RM` root motion unused (step-in is a velocity impulse) | — |
| M13 | A101's `palmToAxis` / `gripAngleDeg` are construction identities (cannot fail); the deciding clauses are `knuckleToAxis`, `bladeAhead`, `buttToWrist` | — |
| M14 | clip source is thin: one overhand `Sword_Attack` (retimed, mirrored per combo step), `Sword_Idle`, `Punch_Jab/Cross`, all masked to the upper body by `MASK_PREFIX` | new weapon classes (melee variants) need more clip coverage or more procedural beats |
| M15 | the beat table, stance, carry socket and guards are tuned to Aloy's 1.72 m body, quiver, braid and bow stow (§2.1.7) | re-measure on the new body before any visual judging |

---

## Appendix A — HZD terms, per file

Format `file:matching-lines`, code files only (src + `index.html` + tools; `m/` = `src/entities/machines/`, `e/` = `src/entities/`, `w/` = `src/world/`, `g4.` = `tools/gates.round4.`, `t/` = `tools/`); the docs column is a count. Regexes (case-insensitive, word-anchored): `\baloy`, `\bvarl\b`, `\bnora\b`, `\bteb\b`, `\bwatcher`, `\bred-?eye`, `\bsawtooth`, `\bthunderjaw`, `\bbehemoth`, `\bstrider`, `\bscrapper`, `\bglinthawk`, `\blongleg`, `\bgrazer`, `\bbroadhead`, `\bsnapmaw`, `\bravager`, `\bcorruptor`, `\bstormbird`, `\bshell-?walker`, `\btall-?neck`, `\bcauldron`, `\bhunting[ -]grounds?\b`, `\bcorrupt(ed|ion)\b`, `\bfocus`, `\boverrid`, `\bsilent[ -_]?strike`, `\bcritical[ -_]?(strike|hit)`, `\bconcentration`, `\btear-?blast`, `\bropecaster`, `\btripcaster`, `\bblast[ -_]?sling`, `\bsharpshot`, `\bhunter[ -_]?bow`, `\bwar[ -_]?bow`, `\bmedicine`, `\b(metal )?shards?\b`, `\bridge-?wood`, `\bblaze`, `\bchillwater`, `\bsparker`, `\bmachine (muscle|lens|heart|core)`, `\bdata-?points?`, `\bdisc[ -_]?launcher`, `\bhzd\b`, `\bhfw\b`, `\bzero dawn\b`, `\bforbidden west\b`, `\bguerrilla\b`, `\bsony\b`, `\bfortnite\b`, `\bsketchfab\b`.

| term | lines (src / tools / docs / other) | code files, `file:matching-lines` (src + index.html + tools; docs counted only) |
|---|---|---|
| Aloy | 462 (163/143/130/26) | t/spike-hybrid-bake:31, e/anim/registry:26, g4.studio:20, studio/studio:19, g4.audio:18, g4.anim-core:14, g4.player-control:14, audio/audio:13, audio/manifest:10, t/audio-recipes:9, t/audio-bank:9, e/player:9, e/anim/clipLibrary:9, t/gates.config:7, combat/combat:7, e/playerAnimator:7, e/anim/meleeLayer:6, combat/melee:5, e/anim/boneMap:5, studio/pose:4, core/collision:4, core/assets:4, g4.world-ground:3, g4.spatial:3, g4.npc:3, e/anim/retargeter:3, m/machine:3, g4.player-melee:2, g4.machine-ai:2, g4.focus-items:2, ui/menu:2, combat/bow:2, combat/arrows:2, w/terrain:2, w/npc/npc:2, w/npc/npcAnim:2, e/anim/locomotion:2, m/index:2, g4.progression-expansion:1, t/optimize:1, g4.world-light:1, g4.combat:1, g4.progression:1, g4.player-anim:1, main:1, ui/map:1, studio/studio.css:1, core/progression:1, core/save:1, combat/weapons:1, w/npc/npcRig:1, items/tools:1, e/anim/clipLayer:1, m/ai/index:1, m/ai/engage:1, m/ai/emit:1, m/ai/override:1 |
| Varl | 70 (44/4/22/0) | core/progression:28, ui/quests:5, g4.progression:3, w/camp:3, w/npc/npc:3, w/props/npcs:2, g4.progression-expansion:1, ui/hud:1, w/npc/waypoints:1, w/npc/npcAnim:1 |
| Nora | 43 (32/4/6/1) | items/datapoints:7, w/props/places:6, w/props/activities:4, g4.progression-expansion:3, core/progression:3, w/props/tallneck:3, combat/bow:2, g4.world-props-expansion:1, ui/dialogue:1, w/props:1, w/camp:1, w/props/settlement:1, w/props/npcs:1, w/npc/npc:1, items/items:1 |
| Teb | 15 (9/0/6/0) | w/npc/npcAnim:3, core/progression:2, w/npc/npc:2, w/props/npcs:1, w/npc/waypoints:1 |
| Carja | 1 (0/0/1/0) |  |
| Banuk | 1 (0/0/1/0) |  |
| Mother's Heart/Watch/Rise | 2 (2/0/0/0) | ui/menu:2 |
| Zero Dawn | 25 (2/2/10/11) | g4.player-melee:2, ui/menu:1, e/anim/meleeLayer:1 |
| Forbidden West | 14 (0/3/6/5) | g4.player-melee:3 |
| HZD | 173 (65/14/84/10) | core/progression:7, e/player:7, combat/combat:5, g4.player-melee:4, ui/focus:4, combat/melee:4, e/playerAnimator:4, w/vegetation:3, g4.progression-expansion:2, t/gates.config:2, g4.machines-expansion:2, ui/wheel.css:2, ui/quests:2, ui/hud.css:2, ui/wheel:2, combat/bow:2, w/terrain:2, m/watcher:2, g4.machine-ai:1, g4.machine-rig:1, t/gate-speeds:1, t/compare:1, style.css:1, ui/map:1, ui/dialogue:1, core/engine:1, combat/traps:1, combat/weapons:1, w/environment:1, w/props/places:1, w/props/rockworks:1, items/gather:1, e/anim/clipLibrary:1, e/anim/meleeLayer:1, m/behemoth:1, m/gait:1, m/sawtooth:1, m/thunderjaw:1, m/ai/tables:1 |
| HFW | 64 (6/7/48/3) | e/anim/meleeLayer:5, g4.player-melee:4, g4.npc:3, combat/combat:1 |
| Guerrilla | 12 (1/0/8/3) | ui/menu:1 |
| Sony | 2 (1/0/0/1) | ui/menu:1 |
| Fortnite | 3 (1/0/1/1) | e/anim/retargeter:1 |
| Sketchfab | 9 (4/0/3/2) | ui/menu:1, m/index:1, m/machine:1, m/rig/lod:1 |
| Hunting Grounds | 52 (34/7/11/0) | core/progression:16, w/props/activities:11, g4.progression:5, ui/map:3, w/props/places:2, g4.shell-menus:1, g4.progression-expansion:1, ui/quests:1, audio/audio:1 |
| Cauldron | 87 (56/20/11/0) | w/props/places:37, g4.progression-expansion:13, core/progression:12, g4.world-props-expansion:7, w/terrain:4, m/ai/doctrine:2, w/props/clearings:1 |
| Tallneck | 199 (103/27/66/3) | w/props/tallneck:21, m/ai/doctrine:19, w/props/places:14, g4.machine-ai-expansion:10, e/anim/meleeLayer:9, w/props:8, g4.machines-expansion:5, g4.world-props:4, core/progression:4, combat/melee:4, w/props/activities:4, m/variety-assets:4, m/machine:4, ui/map:3, g4.player-melee:2, g4.machine-ai:2, t/bake-rigs:2, ui/menu:2, m/gait:2, m/ai/index:2, g4.shell-menus:1, g4.machine-rig:1, w/props/kit:1, w/props/clearings:1, m/rig/ground:1 |
| Corrupted/Corruption | 73 (41/13/19/0) | m/ai/squad:16, g4.machine-ai-expansion:13, m/ai/doctrine:5, m/corruptor:4, m/ai/tables:3, m/index:2, m/machine:2, m/ai/index:2, m/ai/override:2, core/progression:1, combat/combat:1, w/props/clearings:1, m/ai/attacks:1, m/ai/sites:1 |
| Watcher | 707 (286/153/261/7) | g4.machine-ai:28, m/rig/lod:28, g4.player-melee:25, g4.progression:23, m/watcher:20, core/collision:17, core/progression:17, combat/melee:17, m/index:17, audio/audio:15, g4.combat:13, m/redeye:13, t/gates.config:12, g4.audio:11, m/ai/tables:11, e/anim/meleeLayer:8, ui/hud:7, w/props/places:7, m/rig/footlock:7, m/ai/doctrine:7, g4.spatial:6, g4.machines-expansion:6, m/rig/components:6, t/audio-recipes:5, g4.machine-ai-expansion:5, ui/focus:5, items/items:5, m/gait:5, m/rig/ground:5, g4.shell-hud:4, t/budgets:4, m/variety-assets:4, m/machine:4, m/longleg:4, m/parts:4, combat/combat:3, combat/weapons:3, audio/manifest:3, m/rig/rigs-expansion:3, m/rig/shells-expansion:3, m/rig/contact:3, g4.memory:2, g4.machine-rig:2, t/audio-bank:2, ui/menu:2, combat/arrows:2, w/props:2, audio/music:2, e/anim/registry:2, m/strider:2, m/rig/footfall:2, m/ai/index:2, g4.combat-memory:1, t/optimize:1, g4.studio:1, g4.focus-items:1, t/bake-rigs:1, ui/hud.css:1, ui/tips:1, studio/cast:1, core/assets:1, combat/traps:1, w/terrain:1, w/camp:1, w/props/activities:1, w/npc/waypoints:1, items/datapoints:1, e/anim/restPose:1, m/behemoth:1, m/sawtooth:1, m/thunderjaw:1, m/scrapper:1, m/rig/shells:1, m/rig/fx:1, m/ai/emit:1, m/ai/squad:1 |
| Redeye | 230 (90/26/113/1) | m/ai/doctrine:23, m/redeye:21, g4.player-melee:10, m/rig/shells-expansion:10, core/collision:8, g4.machines-expansion:7, m/variety-assets:7, g4.machine-ai-expansion:6, ui/focus:3, m/gait:3, m/machine:3, m/ai/index:3, core/progression:2, m/watcher:2, g4.machine-ai:1, t/optimize:1, t/bake-rigs:1, m/rig/shells:1, m/rig/rigs-expansion:1, m/rig/lod:1, m/rig/components:1, m/rig/contact:1 |
| Sawtooth | 384 (152/109/117/6) | t/audio-recipes:44, m/sawtooth:13, g4.combat:12, g4.machine-ai:11, audio/audio:11, m/gait:10, m/rig/lod:10, m/ai/tables:9, ui/focus:8, g4.machine-rig:7, g4.focus-items:7, m/ravager:7, core/progression:6, m/index:6, m/rig/shells:6, m/rig/shells-expansion:6, g4.shell-hud:5, items/items:5, m/ai/attacks:5, g4.audio:4, combat/combat:4, m/rig/ground:4, g4.spatial:3, ui/hud:3, audio/manifest:3, m/rig/rigs-expansion:3, m/ai/doctrine:3, g4.shell-menus:2, t/gates.config:2, g4.machines-expansion:2, t/audio-bank:2, ui/menu:2, core/assets:2, combat/arrows:2, w/terrain:2, m/autorig:2, g4.player-melee:1, t/budgets:1, t/optimize:1, t/compare:1, g4.machine-ai-expansion:1, g4.progression:1, g4.player-anim:1, g4.player-control:1, ui/inventory:1, ui/tips:1, studio/studio:1, studio/pose:1, core/collision:1, combat/melee:1, combat/weapons:1, w/props:1, w/props/activities:1, audio/zones:1, audio/music:1, items/datapoints:1, items/interactables:1, e/anim/registry:1, e/anim/meleeLayer:1, m/snapmaw:1, m/scrapper:1, m/rig/footfall:1, m/rig/components:1, m/rig/bounds:1 |
| Thunderjaw | 473 (221/74/170/8) | m/gait:24, m/rig/ground:20, core/progression:18, g4.progression:15, g4.machine-ai:14, m/ai/tables:10, g4.spatial:9, audio/audio:9, m/thunderjaw:9, g4.player-melee:8, core/collision:8, m/rig/lod:8, m/rig/sockets:8, g4.machine-rig:7, ui/focus:6, core/hitHulls:6, items/items:6, m/rig/shells:6, t/audio-recipes:5, g4.combat:5, combat/combat:5, combat/melee:5, m/index:5, m/parts:5, g4.audio:4, t/audio-bank:4, ui/hud:4, m/ai/emit:4, m/ai/attacks:4, core/assets:3, combat/arrows:3, combat/weapons:3, w/terrain:3, audio/manifest:3, e/anim/meleeLayer:3, m/autorig:3, m/rig/bounds:3, ui/menu:2, combat/bow:2, audio/spatial:2, items/interactables:2, m/rig/components:2, t/budgets:1, t/optimize:1, t/compare:1, main:1, style.css:1, ui/tips:1, core/engine:1, combat/feedback:1, combat/traps:1, w/props:1, audio/buses:1, e/anim/registry:1, m/watcher:1, m/machine:1, m/rig/footfall:1, m/rig/fx:1, m/ai/index:1, m/ai/engage:1, m/ai/perception:1, m/ai/doctrine:1 |
| Behemoth | 288 (120/32/131/5) | m/behemoth:10, m/gait:9, g4.player-melee:8, m/ai/tables:8, m/index:7, m/rig/lod:7, t/audio-recipes:6, core/progression:6, g4.machine-ai:5, ui/focus:5, m/rig/ground:5, t/audio-bank:4, combat/melee:4, audio/audio:4, items/items:4, m/parts:4, m/rig/shells:4, core/collision:3, audio/manifest:3, m/ai/attacks:3, g4.audio:2, ui/menu:2, ui/hud:2, combat/combat:2, combat/arrows:2, w/terrain:2, e/anim/meleeLayer:2, m/autorig:2, m/variety-assets:2, m/ai/index:2, m/ai/engage:2, m/ai/doctrine:2, t/budgets:1, g4.spatial:1, t/optimize:1, g4.machine-rig:1, t/compare:1, g4.machines-expansion:1, g4.progression:1, ui/tips:1, core/assets:1, combat/weapons:1, w/props:1, e/anim/registry:1, m/corruptor:1, m/rig/footfall:1, m/rig/fx:1, m/rig/components:1, m/rig/bounds:1, m/ai/emit:1, m/ai/override:1 |
| Strider | 286 (134/45/103/4) | m/ai/tables:23, g4.machine-ai:15, g4.player-melee:13, core/collision:11, m/strider:8, m/ai/attacks:8, m/index:7, core/progression:6, w/fauna:6, m/ai/doctrine:6, t/audio-recipes:5, m/machine:5, m/rig/components:5, m/ai/squad:5, m/rig/lod:4, m/ai/index:4, t/budgets:3, audio/manifest:3, m/gait:3, m/variety-assets:3, m/ai/engage:3, g4.audio:2, g4.spatial:2, t/audio-bank:2, core/engine:2, combat/weapons:2, audio/audio:2, m/broadhead:2, m/rig/contact:2, m/ai/sites:2, g4.shell-hud:1, g4.machine-ai-expansion:1, t/gates.config:1, ui/menu:1, ui/tips:1, combat/melee:1, w/terrain:1, w/npc/waypoints:1, items/datapoints:1, e/anim/registry:1, m/rig/footfall:1, m/rig/shells:1, m/rig/shells-expansion:1, m/rig/sockets:1, m/ai/override:1 |
| Scrapper | 240 (115/31/90/4) | m/ai/tables:24, m/scrapper:17, core/progression:13, g4.machine-ai:8, g4.machine-rig:7, m/rig/shells:7, m/ai/engage:7, m/index:6, m/ai/attacks:6, t/audio-recipes:5, m/rig/lod:4, audio/manifest:3, audio/audio:3, m/machine:3, m/ai/index:3, g4.audio:2, g4.spatial:2, g4.progression-expansion:2, t/audio-bank:2, combat/weapons:2, m/gait:2, m/variety-assets:2, m/ai/squad:2, g4.shell-hud:1, g4.player-melee:1, t/budgets:1, ui/menu:1, ui/tips:1, core/assets:1, w/terrain:1, e/anim/registry:1, m/autorig:1, m/rig/footfall:1, m/rig/shells-expansion:1, m/rig/ground:1, m/rig/sockets:1, m/ai/emit:1 |
| Glinthawk | 219 (87/43/85/4) | g4.anim-core:13, m/glinthawk:12, m/rig/ground:10, g4.machine-rig:9, m/ai/tables:8, m/index:6, t/audio-recipes:5, m/rig/shells:5, g4.player-melee:3, g4.machine-ai:3, g4.player-control:3, core/progression:3, audio/manifest:3, e/player:3, m/rig/bounds:3, m/ai/index:3, m/ai/doctrine:3, g4.audio:2, t/audio-bank:2, core/collision:2, combat/weapons:2, w/terrain:2, w/water:2, audio/audio:2, e/anim/registry:2, e/anim/clipLayer:2, m/variety-assets:2, m/machine:2, m/stormbird:2, t/budgets:1, g4.spatial:1, g4.studio:1, ui/menu:1, ui/tips:1, combat/melee:1, combat/traps:1, e/anim/meleeLayer:1, m/rig/lod:1, m/rig/components:1, m/ai/emit:1 |
| Longleg | 296 (124/27/141/4) | m/longleg:20, g4.machine-rig:13, m/rig/footlock:12, m/gait:11, m/ai/tables:11, m/index:8, m/rig/ground:7, m/rig/lod:6, m/rig/contact:6, t/audio-recipes:4, t/audio-bank:4, core/progression:4, m/rig/shells:4, audio/manifest:3, m/rig/sockets:3, g4.audio:2, w/terrain:2, audio/audio:2, e/anim/registry:2, m/watcher:2, m/variety-assets:2, m/rig/footfall:2, m/rig/rigs-expansion:2, t/budgets:1, g4.machine-ai:1, g4.spatial:1, g4.machines-expansion:1, ui/menu:1, ui/tips:1, combat/melee:1, combat/weapons:1, e/anim/meleeLayer:1, m/behemoth:1, m/sawtooth:1, m/thunderjaw:1, m/strider:1, m/scrapper:1, m/rig/bounds:1, m/ai/index:1, m/ai/emit:1, m/ai/attacks:1, m/ai/doctrine:1 |
| Grazer | 138 (63/11/63/1) | m/ai/doctrine:19, m/grazer:11, m/gait:7, g4.machines-expansion:6, m/variety-assets:6, m/rig/rigs-expansion:4, m/rig/shells-expansion:4, g4.machine-ai-expansion:3, t/bake-rigs:2, core/progression:2, m/rig/lod:2, m/ai/index:2, w/fauna:1, items/datapoints:1, m/autorig:1, m/machine:1, m/rig/expansion-base:1, m/ai/squad:1 |
| Broadhead | 172 (84/17/70/1) | m/ai/doctrine:25, m/broadhead:11, g4.machines-expansion:10, m/variety-assets:8, m/gait:7, m/rig/lod:7, m/rig/shells-expansion:5, m/rig/rigs-expansion:4, g4.machine-ai-expansion:3, t/bake-rigs:3, m/machine:3, core/progression:2, m/ai/index:2, m/ai/sites:2, g4.machine-ai:1, m/grazer:1, m/index:1, m/ravager:1, m/stormbird:1, m/rig/expansion-base:1, m/rig/ground:1, m/rig/components:1, m/ai/squad:1 |
| Snapmaw | 207 (83/21/102/1) | m/ai/doctrine:19, m/gait:15, g4.machines-expansion:14, m/snapmaw:12, m/rig/rigs-expansion:6, m/ai/squad:6, m/variety-assets:5, core/progression:3, m/rig/shells-expansion:3, m/rig/ground:3, g4.machine-rig:2, g4.machine-ai-expansion:2, t/bake-rigs:2, m/machine:2, m/rig/expansion-base:2, m/ai/tables:2, g4.machine-ai:1, w/terrain:1, m/autorig:1, m/rig/lod:1, m/ai/index:1, m/ai/attacks:1 |
| Ravager | 141 (62/12/66/1) | m/ai/doctrine:23, m/ravager:11, g4.machines-expansion:9, m/variety-assets:5, m/gait:4, m/rig/rigs-expansion:4, m/rig/shells-expansion:4, t/bake-rigs:2, core/progression:2, m/rig/expansion-base:2, m/rig/lod:2, g4.progression:1, core/collision:1, m/shellwalker:1, m/watcher:1, m/ai/index:1, m/ai/tables:1 |
| Corruptor | 219 (95/12/111/1) | m/gait:28, m/ai/doctrine:16, m/corruptor:11, m/variety-assets:7, g4.machines-expansion:6, m/ai/squad:6, m/rig/shells-expansion:5, m/autorig:4, m/rig/ground:4, g4.machine-ai-expansion:3, core/progression:3, m/rig/rigs-expansion:3, g4.machine-rig:2, t/bake-rigs:1, core/collision:1, m/machine:1, m/rig/expansion-base:1, m/rig/shells:1, m/rig/lod:1, m/ai/index:1, m/ai/override:1, m/ai/tables:1 |
| Stormbird | 225 (82/32/110/1) | m/stormbird:22, m/ai/doctrine:19, g4.machine-ai-expansion:16, m/gait:7, g4.player-melee:5, g4.machines-expansion:5, m/variety-assets:5, m/rig/shells-expansion:5, m/ai/engage:5, core/progression:3, m/rig/rigs-expansion:3, t/gates.config:2, t/bake-rigs:2, combat/melee:2, e/anim/meleeLayer:2, m/ai/index:2, m/ai/attacks:2, g4.machine-rig:1, g4.progression:1, core/collision:1, m/broadhead:1, m/rig/expansion-base:1, m/rig/lod:1, m/rig/ground:1 |
| Shell-Walker | 164 (76/12/75/1) | m/ai/doctrine:20, m/shellwalker:12, m/gait:10, m/rig/shells-expansion:6, g4.machines-expansion:5, m/variety-assets:5, m/rig/rigs-expansion:4, m/rig/lod:4, m/ai/attacks:4, m/ai/squad:4, g4.machine-ai-expansion:3, g4.player-melee:2, t/bake-rigs:2, core/progression:2, m/ai/index:2, combat/melee:1, m/machine:1, m/rig/expansion-base:1 |
| Stalker | 9 (6/0/3/0) | m/ai/engage:2, m/ai/doctrine:2, m/sawtooth:1, m/ai/tables:1 |
| Bellowback | 2 (0/0/2/0) |  |
| Trampler | 1 (0/0/1/0) |  |
| Lancehorn | 3 (0/0/3/0) |  |
| Fireclaw | 1 (0/0/1/0) |  |
| Rockbreaker | 3 (0/0/3/0) |  |
| Charger | 1 (0/0/1/0) |  |
| Focus | 365 (194/55/111/5) | ui/focus:36, g4.focus-items:23, w/props/activities:20, audio/audio:20, studio/studio:15, g4.shell-hud:9, ui/hud:9, g4.progression:8, core/progression:8, g4.studio:7, ui/hud.css:7, ui/focus.css:7, ui/tips:6, items/datapoints:6, style.css:5, m/ai/perception:5, main:4, ui/map:4, items/interactables:4, ui/settings:3, studio/post:3, core/input:3, w/props/places:3, items/items:3, index.html:2, g4.machine-ai-expansion:2, ui/inventory:2, core/save:2, w/props/megastructures:2, items/tools:2, m/machine:2, m/ai/tables:2, m/ai/doctrine:2, g4.memory:1, g4.world-ground:1, g4.world-props:1, g4.progression-expansion:1, g4.machine-rig:1, g4.player-anim:1, ui/skills:1, ui/menu:1, studio/studio.css:1, w/water:1, items/inventory:1, items/crafting:1, m/gait:1, m/watcher:1, m/rig/shells:1 |
| Override | 260 (186/27/46/1) | m/ai/override:35, core/progression:22, w/props/activities:19, g4.progression-expansion:15, m/machine:15, m/ai/index:13, m/ai/squad:7, m/ai/tables:7, m/index:6, w/props/places:5, e/playerAnimator:5, e/anim/clipLayer:5, e/anim/locomotion:5, ui/focus:3, ui/map:3, ui/hud:3, studio/cast:3, w/npc/npcAnim:3, g4.player-melee:2, g4.machine-ai-expansion:2, g4.world-props-expansion:2, studio/pose:2, combat/bow:2, combat/melee:2, m/gait:2, m/ai/stimulus:2, m/ai/engage:2, m/ai/doctrine:2, g4.shell-menus:1, g4.shell-hud:1, g4.machine-ai:1, t/spike-hybrid-bake:1, g4.npc:1, g4.combat:1, ui/menu:1, core/input:1, combat/particles:1, w/terrain:1, w/props/tallneck:1, audio/audio:1, items/tools:1, e/anim/retargeter:1, e/anim/meleeLayer:1, m/variety-assets:1, m/corruptor:1, m/rig/lod:1, m/ai/sites:1 |
| Silent Strike | 147 (58/36/53/0) | core/progression:35, g4.progression:22, combat/melee:12, g4.combat:7, g4.player-melee:2, g4.audio:2, t/audio-recipes:2, combat/weapons:2, audio/audio:2, t/audio-bank:1, ui/tips:1, ui/hud:1, core/collision:1, combat/combat:1, w/props/activities:1, m/index:1, m/ai/override:1 |
| Critical Strike/Hit | 42 (26/3/13/0) | combat/melee:5, combat/weapons:4, m/machine:4, m/ai/reactions:4, t/audio-recipes:2, combat/combat:2, combat/traps:2, m/ai/tables:2, t/audio-bank:1, combat/feedback:1, audio/audio:1, m/ai/index:1 |
| Concentration | 173 (105/23/42/3) | combat/combat:26, ui/hud:17, audio/audio:17, core/progression:12, g4.shell-hud:10, g4.combat:7, studio/studio:5, m/gait:5, ui/hud.css:4, g4.studio:3, core/engine:3, g4.audio:2, combat/melee:2, audio/buses:2, e/playerAnimator:2, index.html:1, g4.anim-core:1, ui/wheel:1, ui/menu:1, ui/tips:1, combat/feedback:1, w/vegetation:1, audio/music:1, e/player:1, e/anim/clipLayer:1, m/glinthawk:1, m/rig/fx:1 |
| Tearblast | 41 (26/2/12/1) | combat/arrows:10, combat/combat:6, combat/weapons:5, ui/hud:2, g4.machine-ai:1, g4.combat-memory:1, ui/tips:1, core/progression:1, items/items:1 |
| Ropecaster | 43 (24/5/14/0) | combat/bow:5, combat/weapons:5, combat/traps:4, audio/audio:4, ui/hud:2, combat/combat:2, g4.audio:1, g4.combat-memory:1, t/audio-recipes:1, t/audio-bank:1, g4.player-control:1, ui/wheel.css:1, ui/wheel:1 |
| Tripcaster | 41 (23/5/13/0) | combat/bow:6, combat/combat:5, combat/weapons:5, combat/traps:3, g4.audio:1, g4.combat-memory:1, t/audio-recipes:1, t/audio-bank:1, g4.player-control:1, ui/wheel.css:1, ui/wheel:1, ui/hud:1, audio/audio:1 |
| Blast Sling | 23 (15/2/6/0) | combat/bow:5, combat/combat:4, combat/weapons:3, audio/audio:2, g4.combat-memory:1, g4.player-control:1, ui/hud:1 |
| Sharpshot | 46 (21/8/9/8) | audio/manifest:8, combat/weapons:5, combat/bow:4, g4.audio:3, g4.combat-memory:2, t/audio-recipes:1, t/audio-bank:1, g4.player-control:1, ui/hud:1, combat/combat:1, audio/audio:1, m/watcher:1 |
| Hunter Bow | 33 (23/5/4/1) | combat/weapons:7, ui/hud:6, combat/combat:6, combat/bow:4, g4.combat-memory:2, g4.combat:2, g4.audio:1 |
| War Bow | 16 (8/3/5/0) | combat/weapons:4, g4.audio:1, g4.combat-memory:1, g4.player-control:1, ui/hud:1, combat/combat:1, combat/bow:1, items/tools:1 |
| Medicine Pouch | 43 (24/1/15/3) | e/player:5, ui/hud:4, ui/hud.css:3, items/items:3, ui/inventory:2, core/progression:2, index.html:1, g4.shell-hud:1, style.css:1, ui/focus:1, core/save:1, audio/audio:1, items/tools:1 |
| Metal Shards | 182 (140/17/25/0) | core/progression:43, ui/inventory:11, g4.progression-expansion:10, items/crafting:10, g4.progression:7, combat/weapons:7, ui/hud:5, items/items:5, m/thunderjaw:5, w/props/places:4, w/props/activities:4, items/gather:4, ui/quests:3, ui/inventory.css:3, w/npc/waypoints:3, m/behemoth:3, ui/menu:2, ui/tips:2, m/grazer:2, m/broadhead:2, m/watcher:2, m/sawtooth:2, m/corruptor:2, m/ai/doctrine:2, audio/audio:1, items/datapoints:1, items/interactables:1, items/inventory:1, m/snapmaw:1, m/shellwalker:1, m/glinthawk:1, m/ravager:1, m/longleg:1, m/strider:1, m/stormbird:1, m/scrapper:1, m/rig/rigs-expansion:1, m/rig/shells-expansion:1 |
| Ridge-wood | 70 (35/13/20/2) | combat/weapons:11, core/progression:8, g4.progression-expansion:7, g4.progression:6, items/gather:5, w/props/places:2, items/items:2, items/crafting:2, ui/tips:1, ui/hud:1, w/props/activities:1, items/interactables:1, items/inventory:1 |
| Blaze | 107 (70/1/35/1) | m/sawtooth:9, m/thunderjaw:6, m/strider:6, core/progression:5, m/rig/shells-expansion:5, ui/focus:4, m/ai/doctrine:4, combat/weapons:3, audio/audio:3, items/items:3, m/machine:3, m/rig/sockets:3, items/gather:2, m/grazer:2, m/snapmaw:2, m/broadhead:2, g4.focus-items:1, ui/tips:1, ui/hud:1, w/props/activities:1, items/datapoints:1, items/inventory:1, m/corruptor:1, m/parts:1, m/stormbird:1 |
| Chillwater | 36 (27/0/9/0) | m/ravager:5, m/behemoth:4, combat/weapons:3, core/progression:2, items/gather:2, items/items:2, m/glinthawk:2, m/thunderjaw:2, ui/hud:1, items/inventory:1, m/snapmaw:1, m/stormbird:1, m/ai/doctrine:1 |
| Sparker | 39 (31/0/8/0) | combat/weapons:4, m/behemoth:3, m/sawtooth:3, core/progression:2, items/gather:2, items/items:2, m/longleg:2, m/scrapper:2, ui/hud:1, w/props/places:1, w/props/activities:1, items/inventory:1, items/crafting:1, m/shellwalker:1, m/ravager:1, m/watcher:1, m/thunderjaw:1, m/corruptor:1, m/stormbird:1 |
| Machine Muscle/Lens/Heart | 12 (7/0/5/0) | ui/hud:2, items/items:2, ui/inventory:1, items/crafting:1, m/sawtooth:1 |
| Datapoint | 233 (138/50/45/0) | w/props/activities:46, core/progression:26, g4.world-props:22, items/datapoints:17, g4.progression-expansion:14, items/interactables:12, g4.progression:9, items/inventory:7, ui/focus:6, ui/inventory:6, w/props/places:5, g4.focus-items:4, ui/focus.css:3, ui/map:3, w/props:3, ui/tips:2, g4.shell-hud:1, audio/audio:1, e/playerAnimator:1 |
| Disc Launcher | 89 (62/3/22/2) | combat/combat:20, m/thunderjaw:12, combat/bow:6, combat/weapons:4, items/interactables:4, audio/audio:2, items/items:2, m/parts:2, g4.combat-memory:1, t/audio-recipes:1, g4.player-control:1, ui/tips:1, ui/hud:1, items/datapoints:1, e/playerAnimator:1, m/machine:1, m/rig/shells:1, m/rig/lod:1, m/rig/components:1, m/ai/tables:1, m/ai/doctrine:1 |

## Appendix B — every gate, with its verdict

`kind`: a = action, v = visual, r = runner (node-only).

| gate | lane | kind | verdict | why / how to re-stage |
|---|---|---|---|---|
| `A90-memory-stability` | core | a | **RESTAGE** | workload spawns `'watcher'` by literal; swap to a new-roster kind (or `machines.kinds[0]`). Bars unchanged (heap<25 %, geo<=40, tex<=8, objs<=60). |
| `A1-boot-clean` | core | a | **CARRY** |  |
| `A2-dodge-displacement` | animator | a | **CARRY** |  |
| `A3-sprint-speed` | animator | a | **RESTAGE** | `OPEN_GROUND` prelude teleports to the old flat meadow (-60,-45); re-point at a flat strip of the new map. |
| `A4-draw-strength` | combat | a | **CARRY** |  |
| `A5-arrow-fired-event` | combat | a | **CARRY** |  |
| `A6-machine-foot-plant` | machines | a | **CARRY** | any walking machine |
| `A7-alert-fsm` | machines | a | **RESTAGE** | Watcher literal -> new scout kind |
| `A8-death-collapse` | machines | a | **RESTAGE** | Watcher literal |
| `A9-perf-budget` | core | a | **CARRY** | spawn vista = wherever the new spawn is; re-baseline |
| `A10-loot-single-render` | hud | a | **RESTAGE** | Watcher kill |
| `A11-idle-alive` | animator | a | **RESTAGE** | samples Aloy pelvis/hand bone names |
| `A12-clip-driven` | animator | a | **RESTAGE** | OPEN_GROUND coordinate; `Sprint_Loop` is a UAL clip name and stays |
| `A13-no-skate` | animator | a | **RESTAGE** | OPEN_GROUND coordinate |
| `A14-dodge-zero-dt` | animator | a | **RESTAGE** | teleport coordinate |
| `A15-foot-flat` | animator | a | **RESTAGE** | teleport coordinate |
| `A16-draw-anchor` | animator | a | **RESTAGE** | `'hand_r_045'` literal + camp coordinate |
| `A17-draw-beats` | animator | a | **RESTAGE** | camp coordinate; needs a hip quiver on the new hero (QUIVER_HIP). FAILING in every Round-4 suite (looseRearM / flourishFrames) |
| `A18-slope-conform` | animator | a | **CARRY** | scans terrain for 10/20/30 deg faces; the new map must contain them |
| `A19-secondary-motion` | animator | a | **RESTAGE** | names `dyn_hairBackMain_03_0147`, `dyn_skirtA_02_l_0202`, `dyn_quiverMain_0307` -> the new hero's hair/cloth/gear chains |
| `A33-rig-finite` | animator | a | **RESTAGE** | stress run is generic; detail quotes Aloy bone/chain counts - read them live |
| `A28-run-cadence` | animator | a | **RESTAGE** | teleport coordinate |
| `A31-aim-strafe-skate` | animator | a | **RESTAGE** | teleport coordinate |
| `A32-draw-ramp` | animator | a | **RESTAGE** | hand bone literal + camp coordinate |
| `A20-frame-loop-survives` | core-platform | a | **CARRY** |  |
| `A21-real-draw-calls` | core-platform | a | **RESTAGE** | `tools/budgets.mjs` PERF_SCENARIOS casts 6 `strider` + 2 `watcher` at (-205,-55) and an 8-kind order list; re-cast with the new roster/herd site. Budget 350 unchanged. |
| `A22-msaa` | core-platform | a | **CARRY** |  |
| `A20b-no-system-errors` | core-platform | a | **CARRY** |  |
| `A45-no-skate-per-species` | machine-rig | a | **CARRY** | iterates every living kind |
| `A44-socket-integrity` | machine-rig | a | **CARRY** | iterates every living kind |
| `A47-corpse-grounded` | machine-rig | a | **CARRY** | iterates every living kind |
| `A48-cadence` | machine-rig | a | **CARRY** | band derived from body length per kind |
| `V1-sprint-frame` | animator | v | **RESTAGE** | criteria re-read against the new hero |
| `V2-idle-frame` | animator | v | **RESTAGE** | criteria re-read |
| `V3-crouch-stalk` | animator | v | **RESTAGE** | criteria re-read |
| `V4-aim-anchor` | animator | v | **RESTAGE** | criteria re-read |
| `V5-machine-stride` | machines | v | **RESTAGE** | Sawtooth literal |
| `V6-machine-death` | machines | v | **RESTAGE** | Watcher literal |
| `V7-vista-mountains` | environment | v | **RESTAGE** | criteria for the new location skyline |
| `V8-riverbed` | environment | v | **RESTAGE** | old dried-river feature; restage on the new map's water feature or retire |
| `V9-sky-golden` | environment | v | **RESTAGE** | "golden-hour drama" is HZD look; restate for the new location palette |
| `V10-hud-language` | hud | v | **RESTAGE** | criteria say "matches HZD design language"; restate against the new HUD spec |
| `V13-aim-strafe` | animator | v | **RESTAGE** | coordinate + criteria |
| `V14-slope-contour` | animator | v | **RESTAGE** | criteria name Aloy |
| `V12-sprint-vs-reference` | animator | v | **RESTAGE** | judged against `reference/run-side.jpg` (a Guerrilla trailer frame) -> licence-clean reference |
| `V20-aa-crop` | core-platform | v | **RESTAGE** | pine ridge from the camp coordinate |
| `V11-logo-title` | logo | v | **DIES** | HORIZON ZERO CLAUDE wordmark; replace with the new title gate |
| `A26-one-convention` | anim-core | a | **RESTAGE** | gate is generic, but `anim/registry.js` KNOWN_MODULES rows say `rig:'aloy'` and its probe list names Aloy bones (registry.js:153) |
| `A27-timescale-safe` | anim-core | a | **RESTAGE** | roll layer is generic; the machine half drives a Glinthawk one-shot -> any new kind with a ClipLayer one-shot |
| `A27b-timescale-safe-glinthawk` | machine-rig | a | **DIES** | Glinthawk-only; fold into A27 |
| `A73-sample-bank` | audio | a | **RESTAGE** | "seed sets complete" list names species/bow sets |
| `A78-loop-reclaim` | audio | a | **RESTAGE** | Watcher deaths |
| `A74-3d` | audio | a | **CARRY** |  |
| `A75-species-voices` | audio | a | **RESTAGE** | 8 named species -> new roster |
| `A76-footfalls` | audio | a | **RESTAGE** | 8 named species + valley surface sweep |
| `A77-music-states` | audio | a | **RESTAGE** | drives a Watcher through machine-state |
| `A73b-aloy-effort` | audio | a | **RESTAGE** | `aloy/*` set names -> hero set |
| `A75b-death-ladder` | audio | a | **RESTAGE** | Thunderjaw |
| `A77b-hit-ladder` | audio | a | **RESTAGE** | Sawtooth |
| `A73c-bow-sets` | audio | a | **RESTAGE** | hunter/sharpshot/war set ids -> new weapon ids |
| `A75c-suspicion-scan` | audio | a | **RESTAGE** | Watcher |
| `A78c-machine-retention-audio` | audio | a | **RESTAGE** | Watcher churn |
| `A73d-ui-bus` | audio | a | **CARRY** |  |
| `A74b-ambience-zones` | audio | a | **RESTAGE** | meadow/river/ridge/camp coordinates -> new biomes |
| `A73e-melee-traps` | audio | a | **RESTAGE** | Watcher target; spear/rope/trap names |
| `A91-combat-fx-bounded` | combat-memory | a | **RESTAGE** | ammo ids (tearblast, sharpshot ...) |
| `A92-arrow-corpse-release` | combat-memory | a | **RESTAGE** | camp/site staging |
| `A93-combat-dom-bounded` | combat-memory | a | **RESTAGE** | ammo ids |
| `A94-combat-memory-return` | combat-memory | a | **RESTAGE** | ammo ids |
| `A95-combat-teardown` | combat-memory | a | **RESTAGE** | Ropecaster/Tripcaster/weapon ids |
| `A49-melee-exists` | combat | a | **RESTAGE** | Watcher at 1.5 m |
| `A50-silent-strike` | combat | a | **RESTAGE** | Watcher + prompt string `SILENT STRIKE` |
| `A51-nock-gap` | combat | a | **RESTAGE** | `hunter` bow id |
| `A52-arrow-drop` | combat | a | **RESTAGE** | `hunter` bow + Watcher target |
| `A53-conc-not-on-sprint` | combat | a | **CARRY** | reads `combat.concentration` (API name) |
| `A54-elemental-tiers` | combat | a | **RESTAGE** | tiers are per named species (Watcher 1-2 / Sawtooth 3-5 / Thunderjaw 8-12); restate as light/medium/apex tiers of the new roster |
| `V28-impact` | combat | v | **RESTAGE** | Sawtooth |
| `V29-wielded-carry` | combat | v | **RESTAGE** | Sawtooth + criteria name Aloy |
| `A79-runner-verdict-line` | core-platform-followup2 | r | **CARRY** | runner-kind, node only |
| `A80-chrome-profile-hygiene` | core-platform-followup2 | r | **CARRY** | runner-kind |
| `A81-canon-speed-bands` | core-platform-followup2 | r | **CARRY** | runner-kind; reads player.js canon |
| `V33b-no-ao-lattice` | core-platform-gtao | v | **RESTAGE** | rim/meadow camera coordinates |
| `A108-ao-periodicity` | core-platform-gtao | a | **RESTAGE** | far-massif/mid-ground camera coordinates |
| `A109-ao-distance-fade` | core-platform-gtao | a | **RESTAGE** | 5/50/200 m samples from fixed coordinates |
| `A22b-fov-recompile` | core-platform | a | **CARRY** | studio path; spawn-side staging only |
| `A62-focus-components` | focus-items | a | **RESTAGE** | Sawtooth + "Focus" naming |
| `A63-loot-reveals` | focus-items | a | **RESTAGE** | Watcher wreck + supply crate + datapoint |
| `V36-focus-scan` | focus-items | v | **RESTAGE** | Sawtooth + violet Focus criteria |
| `A37-expansion` | machine-ai-expansion | a | **RESTAGE** | "behind a REDEYE (widest cone)" -> widest-cone kind of the new roster |
| `A38-expansion` | machine-ai-expansion | a | **RESTAGE** | "every new kind" = the 9 HZD expansion kinds -> every new-roster kind |
| `A39-expansion` | machine-ai-expansion | a | **RESTAGE** | same; drop the "Tallneck never reacts" clause |
| `A40-expansion` | machine-ai-expansion | a | **RESTAGE** | every fighting kind; Stormbird/Shell-Walker named |
| `A41-expansion` | machine-ai-expansion | a | **RESTAGE** | every fighting kind on "its own ground" (SPAWN_PLAN sites) |
| `A41b-expansion` | machine-ai-expansion | a | **RESTAGE** | table-coverage audit over the expansion kinds -> all kinds |
| `A41c-expansion` | machine-ai-expansion | a | **RESTAGE** | seeded duels per expansion kind |
| `A41d-must-fire` | machine-ai-expansion | a | **RESTAGE** | owed-move audit per expansion kind |
| `A42-expansion` | machine-ai-expansion | a | **RESTAGE** | kinds with a tearable component |
| `A43-expansion` | machine-ai-expansion | a | **RESTAGE** | kill one of every expansion kind |
| `A90-memory-stability-expansion` | machine-ai-expansion | a | **RESTAGE** | "full expansion roster" + Watcher spawns -> full new roster. Bars unchanged |
| `A100-expansion-doctrine` | machine-ai-expansion | a | **DIES** | asserts HZD doctrines (herd stampede+rearguard, convoy crate, basking pair, corruption cap, Tallneck loop); re-author for the new doctrines |
| `A37-stealth-approach` | machine-ai | a | **RESTAGE** | Watcher |
| `A38-unseen-shot` | machine-ai | a | **RESTAGE** | Watcher |
| `A39-detection-curve` | machine-ai | a | **RESTAGE** | Watcher |
| `A40-lost-contact` | machine-ai | a | **RESTAGE** | Watcher |
| `A41-combat-motion` | machine-ai | a | **RESTAGE** | Sawtooth duel |
| `A41b-attack-coverage` | machine-ai | a | **RESTAGE** | iterates species; named exceptions (Redeye ...) |
| `A41c-sustained-variety` | machine-ai | a | **RESTAGE** | iterates species; named exemptions (Tallneck ...) |
| `A41d-held-radius-coverage` | machine-ai | a | **RESTAGE** | iterates species; named exemptions |
| `A42-stagger` | machine-ai | a | **RESTAGE** | Sawtooth part tear |
| `A43-corpse-lifecycle` | machine-ai | a | **CARRY** | eight wrecks of whatever kinds exist |
| `A44-listener-isolation-machine-ai` | machine-ai | a | **RESTAGE** | Watcher/Thunderjaw emit sites |
| `V25n-alarm-converge-numbers` | machine-ai | a | **RESTAGE** | Watcher alarm |
| `V25-alarm-converge` | machine-ai | v | **RESTAGE** | Watcher alarm; criteria |
| `A45c-foot-continuity` | machine-rig | a | **CARRY** |  |
| `A44c-lineup-staged` | machine-rig | a | **RESTAGE** | names the V26/V27 species list |
| `A46-ground-truth` | machine-rig | a | **CARRY** |  |
| `A44b-socket-vertex-integrity` | machine-rig | a | **CARRY** |  |
| `A47b-corpse-posed` | machine-rig | a | **CARRY** |  |
| `A47c-corpse-mass` | machine-rig | a | **RESTAGE** | named sprawler exemptions (Snapmaw, Corruptor) |
| `A50-hulls-visible` | machine-rig | a | **CARRY** |  |
| `A49-fx-pool-clean` | machine-rig | a | **RESTAGE** | Sawtooth/Thunderjaw |
| `A76b-footfall-species` | machine-rig | a | **RESTAGE** | Glinthawk named as the flier exemption |
| `V26-silhouette` | machine-rig | v | **RESTAGE** | criteria "reads as its HZD machine" -> reads as its Round-5 design sheet |
| `V27-attack-pose` | machine-rig | v | **RESTAGE** | species list; limbs-do-the-work bar unchanged |
| `A50b-aim-on-drawn-geometry` | machine-rig | a | **CARRY** |  |
| `A45b-stance-report-integrity` | machine-rig | a | **CARRY** |  |
| `A44c-lineup-expansion` | machines-expansion | a | **DIES** | batch-A HZD kinds; merge into one lineup gate for the new roster |
| `A44c-lineup-expansion-b` | machines-expansion | a | **DIES** | batch-B HZD kinds; merge |
| `A90-rig-reclaim` | machines-expansion | a | **RESTAGE** | Watcher literal; bars unchanged (geo<=+40, tex<=+30, <=1 per live machine) |
| `A48b-cadence-headroom-expansion` | machines-expansion | a | **RESTAGE** | Watcher/Longleg named |
| `V26c-plate-contrast-expansion` | machines-expansion | a | **RESTAGE** | donor-keeping species list |
| `V26a-silhouette` | machines-expansion | v | **DIES** | HZD batch A silhouettes |
| `V26b-silhouette` | machines-expansion | v | **DIES** | HZD batch B silhouettes |
| `V27a-attack-pose` | machines-expansion | v | **DIES** | batch A |
| `V27b-attack-pose` | machines-expansion | v | **DIES** | batch B |
| `A90b-memory-attribution` | memory-attribution | a | **RESTAGE** | A90 Watcher workload; bars unchanged |
| `A95-npc-roster` | npc | a | **RESTAGE** | "13 named NPCs, 6 builds" at the camp -> new settlement roster |
| `A96-npc-animated` | npc | a | **RESTAGE** | lookout/camp routes |
| `A97-npc-no-skate` | npc | a | **RESTAGE** | camp staging |
| `A97b-npc-talk-freeze` | npc | a | **RESTAGE** | camp staging |
| `V40-settlement-life` | npc | a | **RESTAGE** | camp at dusk |
| `V41-npc-closeup` | npc | a | **RESTAGE** | camp staging; criteria |
| `A33-hair-bounce` | player-anim | a | **RESTAGE** | `dyn_hairBackMain_04` -> new hair chain (needs a ponytail-like chain) |
| `A34-chains-driven` | player-anim | a | **RESTAGE** | bar "180 of 271 dyn_ bones" is Aloy's count: needs an orchestrator ruling to restate as a fraction (66 %) |
| `A35-cheek-anchor` | player-anim | a | **RESTAGE** | `head_0104`/`hand_r` names; the 0.10-0.16 m hand-head band assumes the head bone sits at the skull base (Aloy rig) - re-derive for the new head bone |
| `A36-hit-react-visible` | player-anim | a | **RESTAGE** | pelvis -> spine_03 lean read by name |
| `A31b-aim-strafe-skate-player-anim` | player-anim | a | **RESTAGE** | coordinates |
| `A18b-slope-conform-moving` | player-anim | a | **CARRY** | needs a ~20 deg face |
| `V23-secondary-motion` | player-anim | v | **RESTAGE** | criteria name ponytail/quiver/pouches/skirt |
| `V24-draw-vs-reference` | player-anim | v | **RESTAGE** | `reference/draw-side.jpg` is an HZD still -> licence-clean archery reference |
| `A28-jump-arc` | player-control | a | **CARRY** |  |
| `A28b-canon-speeds` | player-control | a | **CARRY** |  |
| `A29-slope-limit` | player-control | a | **RESTAGE** | "the 56 deg face at (118,220)" -> a steep face on the new map |
| `A30-dodge-window` | player-control | a | **CARRY** |  |
| `A30b-fall-wade-edge` | player-control | a | **RESTAGE** | needs a pool and the soft edge at the new map |
| `A31-crouch-aim` | player-control | a | **RESTAGE** | tall-grass spot near the camp |
| `A32-look-up` | player-control | a | **RESTAGE** | Glinthawk at 10 m/16 m altitude -> new flier or a dummy target |
| `V22-chase-framing` | player-control | a | **RESTAGE** | `reference/run-back-2-walking.jpg` (HZD press still) -> licence-clean reference; 55 % frame-height bar stays |
| `A29b-slope-no-ghost` | player-control | a | **CARRY** | scans real terrain |
| `A32b-lookup-no-ghost` | player-control | a | **CARRY** |  |
| `A31b-no-ghost-without-occluder` | player-control | a | **RESTAGE** | `head_0104` literal + hillside/valley staging |
| `A31d-hillside-pan-0.8` | player-control | a | **RESTAGE** | the 38.4 deg hillside coordinate + head bone name |
| `A31e-hillside-pan-clamp` | player-control | a | **RESTAGE** | same |
| `A31f-hillside-yaw-sweep` | player-control | a | **RESTAGE** | same |
| `A31c-clamp-framing` | player-control | a | **RESTAGE** | `head_0104`, `hand_l_014` literals |
| `A100-spear-holster` | player-melee | a | **RESTAGE** | spine socket + bow/hair clearances read Aloy bones/chains; metre bars are adult-human generic |
| `A101-spear-grip` | player-melee | a | **RESTAGE** | hand bone names; grip fraction 0.15-0.28 stays |
| `A102-melee-body-motion` | player-melee | a | **RESTAGE** | hand bone name |
| `A103-melee-contact-sync` | player-melee | a | **RESTAGE** | "every species in ctx.machines.kinds" (generic) + named exceptions (Tallneck lattice, Stormbird grounded, Thunderjaw) |
| `A104-melee-self-clear` | player-melee | a | **RESTAGE** | `dyn_hairBack*` names + head/neck/spine bones |
| `A105-melee-while-moving` | player-melee | a | **RESTAGE** | hand bone name |
| `A106-melee-approach-immovable` | player-melee | a | **RESTAGE** | species list (Watcher, Behemoth, Thunderjaw, Strider, Glinthawk, Stormbird, Redeye) |
| `A107-draw-arm-path` | player-melee | a | **RESTAGE** | head ellipsoid is the animator's (HEAD_OFF/HEAD_R) - re-fit to the new skull |
| `V46-spear-ready` | player-melee | v | **RESTAGE** | `reference/spear-ready-side.jpg` (HZD) -> new reference |
| `V47-melee-swing` | player-melee | v | **RESTAGE** | criteria vs HZD stills |
| `V48-spear-holster` | player-melee | v | **RESTAGE** | `reference/spear-holster-back-hfw.jpg` (HFW) -> new reference |
| `V49-draw-from-jog` | player-melee | v | **RESTAGE** | criteria; bars stay |
| `A66-quest-objectives-expansion` | progression-expansion | a | **DIES** | six HZD-flavoured site quests (cauldron, override, hunting ground ...); re-author for the new quest content |
| `A65-save-restore-expansion` | progression-expansion | a | **RESTAGE** | mechanism generic; staged on the six expansion quests + trial |
| `A99-dialogue` | progression-expansion | a | **RESTAGE** | roster ids (Varl, Teb ...) |
| `V45-dialogue-panel` | progression-expansion | v | **RESTAGE** | criteria "in front of a camp Nora" |
| `A67b-site-ledgers-expansion` | progression-expansion | a | **RESTAGE** | site ledgers generic; staged on named sites |
| `A64-xp-loop` | progression | a | **RESTAGE** | Watcher kill |
| `A65-save-restore` | progression | a | **RESTAGE** | campfire + item ids (ridge-wood, shards) |
| `A66-quest-objectives` | progression | a | **RESTAGE** | tutorial chain content (talk to Varl ...) |
| `A67-machine-respawn` | progression | a | **RESTAGE** | Watcher site |
| `A64b-damage-channels` | progression | a | **RESTAGE** | Watcher |
| `A64c-silent-apex` | progression | a | **RESTAGE** | apex species list + Prowler/Silent Strike names |
| `A71-compass-truth` | shell-hud | a | **RESTAGE** | shared species prelude (watcher/sawtooth/strider/scrapper) + "Focus-tagged" |
| `A71b-hud-scale-floor` | shell-hud | a | **RESTAGE** | shared species prelude only |
| `A71c-hud-surfaces` | shell-hud | a | **RESTAGE** | shared prelude; V37 surface list |
| `A71d-conc-veil` | shell-hud | a | **CARRY** | reads the concentration API |
| `A71e-tutorial-cards` | shell-hud | a | **RESTAGE** | card text names Focus etc. |
| `A71f-interact-anchor` | shell-hud | a | **RESTAGE** | datapoint staging |
| `A71g-tracker-live` | shell-hud | a | **CARRY** |  |
| `A71h-mhb-melee-clear` | shell-hud | a | **RESTAGE** | shared species prelude |
| `V37-hud-language` | shell-hud | v | **RESTAGE** | criteria: HZD red 4-segment health etc. -> new HUD spec |
| `A68-no-softlock` | shell-menus | a | **CARRY** |  |
| `A69-death-choice` | shell-menus | a | **RESTAGE** | killer named (Sawtooth) |
| `A70-hub-tabs` | shell-menus | a | **CARRY** |  |
| `A70b-fast-travel` | shell-menus | a | **RESTAGE** | campfire-only rule generic; staged at Tallneck/lookout |
| `A70c-title-flow` | shell-menus | a | **CARRY** |  |
| `A72-settings-persist` | shell-menus | a | **CARRY** |  |
| `A72b-accessibility` | shell-menus | a | **CARRY** |  |
| `V38-title` | shell-menus | v | **RESTAGE** | wordmark criteria |
| `A23-aim-cost` | spatial | a | **RESTAGE** | Thunderjaw at 25 m -> heaviest new kind |
| `A23b-hull-fidelity` | spatial | a | **RESTAGE** | "all 8 species" literal -> kinds |
| `A24-player-blocked` | spatial | a | **RESTAGE** | pine trunk near the camp |
| `A25-machine-immovable` | spatial | a | **RESTAGE** | Watcher |
| `A25b-nav-and-occlusion` | spatial | a | **CARRY** |  |
| `A25c-camera-vs-machine` | spatial | a | **RESTAGE** | Watcher/Thunderjaw |
| `V21-camera-cover` | spatial | v | **RESTAGE** | camp trunk; criteria name Aloy |
| `A78-cast-states` | studio | a | **CARRY** |  |
| `A78b-cast-pose-set` | studio | a | **RESTAGE** | Glinthawk + Aloy pose list |
| `A79-time-authority` | studio | a | **CARRY** |  |
| `A79b-studio-shell` | studio | a | **CARRY** |  |
| `A79c-lens-stack` | studio | a | **RESTAGE** | auto-focus on Aloy's head bone |
| `A79e-pose-overlay-frozen` | studio | a | **CARRY** |  |
| `V79-photo-portrait` | studio | v | **RESTAGE** | criteria "Aloy meeting the lens" |
| `A79f-photo-entry` | studio | a | **CARRY** |  |
| `A79g-death-menu-live` | studio | a | **RESTAGE** | Watcher killer |
| `A79d-studio-gate-shape` | studio | r | **CARRY** | runner-kind |
| `A58-surface-api` | world-ground | a | **RESTAGE** | bar "at least 7 grounds, snow/mud/ash among them" is the old map's vocabulary - ruling needed |
| `A59-grass-coverage` | world-ground | a | **RESTAGE** | six meadow points |
| `A60-stealth-lanes` | world-ground | a | **CARRY** | iterates live patrol routes |
| `V32-ground-detail` | world-ground | v | **RESTAGE** | trail-and-channel ground coordinate |
| `V33-rim` | world-ground | v | **RESTAGE** | "from the camp toward the north rim" -> new skyline |
| `V44-biomes` | world-ground | v | **RESTAGE** | four-bearing vista; >=3 biomes bar stays |
| `A61-scree-seated-world-ground` | world-ground | a | **RESTAGE** | rim talus fans; retire if the new location has no rim |
| `A62-rim-face-lit-world-ground` | world-ground | a | **RESTAGE** | boundary escarpment; same |
| `A63-bedding-planar-world-ground` | world-ground | a | **RESTAGE** | rim strata; same |
| `A58b-surface-audio-world-ground` | world-ground | a | **CARRY** | vocabulary <-> audio route consistency |
| `A59b-cover-honesty-world-ground` | world-ground | a | **CARRY** | biome names read from Terrain.BIOMES |
| `A59c-mask-coherence-world-ground` | world-ground | a | **CARRY** |  |
| `A55-light-ratio` | world-light | a | **RESTAGE** | "under the watchtower" |
| `A56-cascades` | world-light | a | **CARRY** |  |
| `A57-aerial` | world-light | a | **RESTAGE** | rim geometry coordinates |
| `V30-golden-hour` | world-light | v | **RESTAGE** | spawn vista at 17:30; criteria |
| `V31-night` | world-light | v | **RESTAGE** | campfire + machine eyes |
| `A98-sites` | world-props-expansion | a | **RESTAGE** | ">= 6 new places" counts content |
| `V42-interior` | world-props-expansion | a | **DIES** | inside Cauldron KAPPA |
| `V43-outpost` | world-props-expansion | a | **DIES** | Ridgeback Outpost, "lived-in Nora post" |
| `A98b-clearings` | world-props-expansion | a | **CARRY** | every published keepout |
| `A61-colliders-registered` | world-props | a | **RESTAGE** | >=800 / >=1200 colliders and the palisade - counts content |
| `V34-midground` | world-props | a | **RESTAGE** | landmark silhouettes incl. the Tallneck |
| `V35-settlement` | world-props | a | **RESTAGE** | camp at dusk |
| `A61b-camp-rest-event` | world-props | a | **RESTAGE** | campfire |
| `A61c-datapoints-unified` | world-props | a | **RESTAGE** | datapoint naming |

