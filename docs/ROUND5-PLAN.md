# CALIMA — ROUND 5 BUILD PLAN

Owner: lead designer + technical director, Round 5 (Oct 15 2026). Content canon:
`docs/ROUND5-BIBLE.md`. Gate format: `docs/ROUND4-AUDIT.md` §4. Kept-system facts:
`docs/ROUND5-INVENTORY.md` §1–§6. Revised by the completeness-critic pass (§12).

| § | contents |
|---|---|
| 0 | the rules every lane follows |
| 1 | frozen kept systems and the grants that unfreeze them |
| 2 | lanes: port, waves, exact file ownership, deliverables |
| 3 | waves, cross-lane contracts, worktrees and merges |
| 4 | budgets: per asset, worst-frame ledgers, GPU time, GPU memory, shipped disk, local disk |
| 5 | costed extensions with cut lines |
| 6 | DELETE list and when each item goes |
| 7 | rename plan |
| 8 | rulings (R1–R9 carried, R10–R32 new) |
| 9 | GATE SPEC per lane |
| 10 | licence manifest format and where attributions surface |
| 11 | risks and decisions for Kevin |
| 12 | critic pass changelog |

---

## 0. Rules

1. **No lane edits another lane's file, ever.** A lane edits only the files in its row of §2 for the
   waves it is active; new files only inside its own paths. Cross-lane needs go through the published
   contracts of §3.2 (`ctx` APIs, events, data files) or an orchestrator grant recorded in §1.2.
2. **Kept systems are frozen** (§1.1) except where §1.2 grants an adapt, with a line budget.
3. **Acceptance is literal:** a lane is done when its §9 gates PASS on its own port and the global
   green list PASSES. Self-reports do not count. **Visual gates are graded by an independent judge**
   (R29): an orchestrator-spawned agent on port 5271 that did not build the content, which views the
   shot side by side with its licence-clean reference and writes the verdict and rationale into the
   gate report JSON. A lane's own reading of its V gates is advisory.
4. **Old content is deleted only after its replacement passes its gates** (§6). The exceptions: files
   with no runtime reader (anim duplicates, labs spikes); `ai/override.js` and the corruption block
   (R17); and the **IP/NC files, which go in wave 0 whatever replaces them** (R30).
5. **Memory rule:** no per-frame allocations (`A-alloc-rate`); every runtime object has a dispose
   path; every SkinnedMesh swap or NPC despawn calls `skeleton.dispose()`. **The A90 family, including
   the absolute ceilings of `A90-abs`, is non-negotiable at every wave exit.**
6. **Process hygiene and ports.** Lanes use ports 5250–5269 (one each, §2); the orchestrator's
   global run uses **5270**; independent judges use **5271**. **Port 5173 is Kevin's and is never
   touched.** Each lane runs Vite only as `npx vite --port <p> --strictPort` in its own worktree, and
   headless Chrome only through `tools/gates.mjs` / `tools/screenshot.mjs`. These scripts refuse to run
   without `--port` or `SHOT_PORT` in 5250–5299 and refuse 5173 outright. **Orchestrator amendment (Oct 15):** a lane's engineering/film judge runs on the lane port + 30 (5280–5299) so the two judges of a lane never share a Vite; 5272–5279 stay reserved (`A-port-guard`, gates-perf
   W0a). Every lane kills its Vite and Chrome before ending its turn and leaves 0 Chrome profiles
   (`A80`). Scratch goes under
   `/private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/<lane>/`.
   Downloads are fetched to scratch, repacked, and deleted.
7. **No git commit/push/checkout/stash/reset by lanes.** The orchestrator creates worktrees, merges and
   commits (rule 10).
8. **Machine load.** At most **6 agents** at a time (§3); independent judges and orchestrator gate-fix
   passes count toward the 6 (a judge takes its lane's slot after the lane's agent ends). At most **2 headless gate Chromes**
   machine-wide: a lockfile semaphore lives under the chrome-profile root. A preflight **refuses to
   launch Chrome when free disk < 3 GB or `memory_pressure` free < 25 %**. The orchestrator's global
   run uses exactly 1 Chrome and runs only while 0 lane Chromes are alive. (The machine is an 18 GB
   M3 Pro on a 99 %-full volume with swap already in use; it has crashed twice.)
   **Orchestrator amendment (Oct 19, binding until gates-perf's semaphore is merged to main):** every agent takes a machine-wide slot before ANY `tools/gates.mjs` or `tools/screenshot.mjs` run and releases it the moment the run ends: acquire with `until mkdir /private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/chrome-slots/slot1 2>/dev/null || mkdir /private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/chrome-slots/slot2 2>/dev/null; do sleep 30; done`, write `<lane> <agent> <pid> <utc>` into `owner.txt` in the slot, release with `rm -r` of that slot dir; a slot older than 100 min or whose owner pid is dead is stale and may be removed. Never hold a slot while editing or thinking; batch gate ids into one run. On Oct 19 six agents without a shared cap drove the load to 40–169 and swap to 2.2 of 2.8 GB.
9. **Every new asset carries provenance** (`asset.extras.provenance`) and a `public/LICENSES.json`
   row (§10). CC0 preferred; CC-BY only with attribution; MIT only for shipped code; **never NC, never
   ND, never anything from Horizon / Sony / Guerrilla / Epic / Fortnite, never ripped models.**
10. **One worktree per lane.** The orchestrator gives each lane its own tree (`git worktree add` under
    `scratchpad/r5/<lane>/tree`, ≈ 80 MB of tracked files, `node_modules` and `models-staging/r5-src`
    symlinked read-only from the main tree). It syncs day-1 contract stubs (§3.2) into the running lanes
    and merges each lane at its exit. The main tree, which Kevin's 5173 preview serves, changes only at
    orchestrator commits. Lanes build only their own assets (`npm run build:assets -- --only <lane>`);
    only the orchestrator runs the full build.

---

## 1. Frozen kept systems and grants

### 1.1 Frozen (no lane edits these without a §1.2 grant)

| system | files |
|---|---|
| rigging / bone space | `src/entities/anim/{boneSpace,restPose,clipLayer,retargeter,rigDebug}.js` |
| locomotion blend | `src/entities/anim/locomotion.js` (label string only, hero-body W0) |
| control and camera | `src/core/input.js` (hero-body W0 action grant only), `src/core/events.js`; `src/entities/player.js` outside the hero-body W0 grant (after W0, player behaviour changes only through `player.mods` and `player.ride`) |
| clips | `public/anims/**` (UAL1, CC0): kept as the locomotion source (R15) |
| machine rig | `src/entities/machines/{gait,autorig}.js` (algorithms), `rig/{bounds,contact,expansion-base,footfall,footlock,fx,ground,sockets,components,lod,shells}.js` |
| machine AI engine | `src/entities/machines/ai/{index,emit,engage,reactions,rng,search,sites,squad,stimulus}.js` (after instruments-core W0) |
| spatial | `src/core/{collision,nav,hitHulls}.js` |
| engine | `src/core/engine.js` (after engine-gpu W0), `src/main.js` frame loop |
| gate harness | `tools/{gates,screenshot,gate-verdict,gate-speeds,chrome-profile,chrome-profile-selftest,chaos-gates,dump-structure,compare}.mjs` (gates-perf W0a grant only) |
| UI engines | `src/ui/dialogue.js`, `src/items/{interactables,inventory}.js`, `src/audio/{bank,buses,clock,music,probe,spatial,zones}.js`, `src/combat/particles.js` |

### 1.2 Grants (adapt allowances on kept or other-lane files)

"Removal-only" means the diff may only delete lines or branches; the orchestrator reviews it before
merging.

| lane | wave | file | allowance |
|---|---|---|---|
| brand | **W0-day1** (alone) | all of `src/`, `tools/`, `index.html` | **one-time mechanical pass** (§7.1): identifier and string renames, no logic. It also creates two data stubs at **today's values**: `src/world/island/sites.js` (`REST`, `REST_SITE`) and `src/world/island/extent.js` (`PLAY_RADIUS` = 330 and an `EXTENT` table of named offsets from it). `terrain.js:129` re-exports `PLAY_RADIUS` from the stub. The pass replaces the numeric literals with imports: the **10 camp copies** (`player.js:6` (used again at `:888`, `:1332`), `ui/map.js:386`, `ui/menu.js:97`, `world/props.js:33`, `world/terrain.js:631`, `npc/waypoints.js:13`, `world/vegetation.js:56`, `items/gather.js:26`, `machines/index.js:29`, `machines/machine.js:16`) and the **10 extent literals in kept code** (`player.js:94–95` 330 / 312, `nav.js:26–27` 332 / 324, `machines/index.js:152` 310, `machines/machine.js:17` 318, `ai/search.js:58` 310, `ai/squad.js:259` 285, `ai/doctrine.js:801` 296, `items/gather.js:104` 315, i.e. `PLAY_RADIUS` + 2 … − 45). Behaviour is identical (`A-extent-refactor`). The radial literals inside content files that W1 replaces (`terrain.js:645/738/3368`, `water.js:86`, `props.js:296/379`, legacy `strider.js`) are left to world-ground and world-props |
| pipeline | W0a | `src/core/assets.js` | SPECS made data-driven (rows from `src/core/assets.specs.js` + `machines/legacy.js`); shared loader (dequantise, `getX`, provenance read); `SPECS.hero` |
| pipeline | W0a | `.gitignore` | add `!public/models/**/*.glb`; widen the bake excludes to `public/models/**/*.baked.glb` and `public/models/**/*.orig`; add `models-staging/r5-src/` |
| pipeline | W0a | `src/world/camp.js` | ≤ 6 lines: skip camp NPC bodies when `assets.models.npc` is absent (`npc.glb` goes at W0a, R30) |
| pipeline | W0 exit | `src/main.js` | removal-only: the `?poc=human` and `?poc=creature` blocks, after promotion |
| pipeline | W0 | `tools/{optimize,bake-rigs,measure-machines}.mjs` | removal-only: the HZD donor lists |
| gates-perf | W0a | `tools/{gates,screenshot,chrome-profile}.mjs` | ≤ 40 lines: port guard, Chrome semaphore, disk/memory preflight |
| instruments-core | **W0a** | `src/audio/audio.js`, `src/combat/melee.js`, `src/core/progression.js`, `src/entities/machines/ai/{engage,squad,stimulus}.js`, `src/entities/playerAnimator.js`, `src/studio/{cast,pose}.js`, `src/ui/{focus,menu}.js`, `src/world/props/{activities,places,tallneck}.js` (14 files) | **removal-only**: every line and branch of the Override mechanic (`override-node`, `overridden`, `OVERRIDE`, `overrideNode`, the `cauldron-override` terminal) and the `ai/squad.js` corruption block (`_updateCorruption`, `corrupt`/`uncorrupt`, `ECOSYSTEM.corruption` reads). Runs in W0a, before hero-body and brand start editing `playerAnimator.js` and `menu.js` in W0b. The animation word "override" (`GROUNDED_OVERRIDE`, override channels) is not the mechanic and stays |
| instruments-core | W0 | `machines/{machine,index,variety-assets,parts}.js`, `autorig.js` (RIGS rows + seed API only), `ai/{tables,doctrine,attacks,perception,index}.js`, `ai/override.js` (delete), new `machines/legacy.js` | Override removal; **legacy collapse** (every legacy kind's imports, `_spawnCls` rows, SPECS/STYLE/EXPANSION rows, doctrine SPAWN_PLAN/CHASSIS rows, table rows, RIGS rows and shells move into `legacy.js`); `LAMP_STATES`; loader fixes; role/table registration hooks; perception weather, `detectMul` and `flagDuration` hooks; VFX glint colours (`machine.js:875`, `:1249`) |
| instruments-core | W0 | `ai/stimulus.js` | ≤ 10 lines: `stimulus.addNoiseFilter(fn)` for perks |
| instruments-core | W0 | `rig/lod.js` | PALETTE; quantise flag; `normalizeAttrs` keeps `uv1` when the merge group wants it (≤ 6 lines) |
| instruments-core | W0 | `rig/fx.js` | VFX palette defaults only (the spark default `0xbfe8ff` becomes a bronze/ceramic chip colour) |
| instruments-core | W0a | `rig/{shells,shells-expansion,rigs-expansion}.js` | move legacy shells into `legacy.js`; delete the 4 IP kinds' shells |
| hero-body | W0 | `playerAnimator.js`, `player.js`, `anim/{clipLibrary,boneMap,registry,index}.js`, `locomotion.js` label | rig-profile seams, re-derived constants, orbit capsules, M10 spring collider, alidade overlay; the **`player.mods` surface** (`fallSafe`, `fallLethal`, `slideDegBySurface`, `knockdownMode`, `regen`, `noiseMul`, `zoom`); `ClimbUp_1m` and slide actions; `player.ride(path, clip)` |
| hero-body | W0 | `src/core/input.js` | ≤ 12 lines: actions `plant`, `cast`, `tool`, `slot1..4` + pad entries (bible §5.9) |
| melee | W1–W2 | `anim/meleeLayer.js`, `combat/melee.js`, `playerAnimator.js` (handover from hero-body), new `combat/lanceStow.js` (**created by melee on W1 day 1** from the stow/`spearOut` lines armory marks in `combat.js`; armory then deletes them and calls `lanceStow`), `collision.js` melee approach term (Round-4 grant, R4/R6 only), `player.js` ≤ 15 lines (guard stance uses `speeds.aim`) | tables, beats, clip layers, cast beat |
| instruments-b | W2 exit | `machines/legacy.js`, `rig/{shells-expansion,rigs-expansion}.js` | **delete** the remaining legacy rows and the listed files (§6); nothing else |
| instruments-c | W3 | `rig/components.js` | un-tear ≤ 40 lines (E21), components' one-draw rule unchanged |
| instruments-d | W4 | `gait.js` | ≤ 40 lines: optional `pose.spineYawOverride[]` (follow-the-leader) and `pause()` (burrow); A45/A46/A48 unchanged on every other kind |
| engine-gpu | W0 | `engine.js` | post chain / tier table / DPR only; render-target measurement hooks |
| settlements | W2 | `src/main.js` | ≤ 10 lines: construct `Settlements` in place of `Camp` |
| world-ground | W1–W4 | `world/{terrain,vegetation,water}.js` | full. The terrain API is frozen by `A-terrain-api`; **`riverFactor` stays exported and returns 0**, because frozen `nav.js` imports it |
| world-ground | W1 | `src/world/island/{sites,extent}.js` | owned from W1: sets `REST`/`REST_SITE` to Brea's cistern at Saltrow and the extents from `WORLD_SIZE` (≈ 490 m at 1024 m) |
| world-ground | W1 exit | `src/main.js` | removal-only: the `?poc=biome` block |
| world-sky | W1, W4 | `world/environment.js` | full (system kept, values replaced) |
| combat-kit | W2 | `src/core/save.js` | ≤ 8 lines: unknown item ids in a loaded save are dropped with one `console.warn` (W0-era v5 saves) |
| armory | W3 | `src/ui/inventory.{js,css}` | the equip panel and acquisition state (shell-ui is inactive in W3) |
| brand | W4 | comments in frozen files | comment-only scrub of HZD terms; esbuild-minified output byte-identical before and after (`A-comment-scrub`) |
| orchestrator | W1–W4 (standing) | `tools/gates.r5.carried.mjs`, `tools/gates.r5.kind-block.mjs`, `tools/gate-roster.mjs`, `tools/gate-places.mjs` | gate-fix passes after gates-perf and instruments-core leave; each pass counts as one agent and runs only in a free slot (≤ 6) |

---

## 2. Lanes

20 lanes on ports 5250–5269 (one per lane, never shared); the orchestrator uses 5270 and the judges
5271. "W" = the waves the lane is active in.

| lane | port | W | owns (exact) | deliverables |
|---|---|---|---|---|
| **pipeline** | 5250 | 0a, 0b | `tools/build/**` except `tools/build/recipes/**`, `tools/build/instruments/gen-*.mjs` and `tools/build/settlements/**` (promoted from `tools/r5-poc/`: `humans.mjs`, `lib/{hs,glb}.mjs`, `instruments/lib/**`, `landmarks/lib/**`, `ground/lib/**`, `weapons/lib/**`; the POC Tiller generator is promoted to `tools/build/instruments/gen-tiller.mjs` and handed to instruments-a at W1); `tools/licences/**`; `public/LICENSES.json`, `public/licences/**`; `src/core/assets.js`, new `src/core/assets.specs.js`; `.gitignore`; `models-staging/**` (cleanup + `r5-src/`) | deterministic `npm run build:assets` with `--only <lane>`; data-driven SPECS; shared loader fixes; the W0 re-fetch that records archive SHA-256s, then trimmed sources in `models-staging/r5-src/`; licence manifest + credits generator incl. code (MIT) rows; IP/NC + `npc.glb` deletion (R30); `A-ID-ip-assets-gone`, `A-assets-tracked` |
| **engine-gpu** | 5251 | 0a, 0b | `src/core/engine.js` (post / tiers / DPR), `tools/r5-probes/terrain1024.js`, `docs/ROUND5-ENGINE.md`, `tools/gates.r5.engine-gpu.mjs` | the GPU decision (DPR 1.25 cap / quarter-res GTAO / SMAA-only) as a measured exit gate; 1024 m terrain + nav probe; the render-target ledger |
| **hero-body** | 5252 | 0b | `src/entities/anim/rigs/**` (new), `playerAnimator.js`, `player.js`, `anim/{clipLibrary,boneMap,registry,index,locomotion}.js` (per grant), `input.js` (grant), new `src/hero/**` (**W0**; handed to armory at W1 day 1), `tools/build/recipes/{brea,outfit-pan-1}.mjs` (the pan atlas recipe goes to armory at W1 day 1), `tools/build/recipes/lib/face.mjs`, `tools/build/recipes/weapons/kit-v0*.mjs`, `public/models/hero/**`, `reference/r5/hero/**`, `tools/gates.r5.hero-body.mjs`, `docs/ROUND5-HERO.md` | Brea v1 on the kept rig (body, face, wrap, default outfit); **outfit merge + skeleton dispose, merged stow kit with `pieceId` mask, v0 kit GLBs** (Shepherd's Lance with the bob cap, cane quiver, archer's crescent bracer, Sabina blockout); Lmax solve, ~12 aim constants, M10 collider, alidade overlay; `player.mods`, climb, slide, `ride`; new input actions; face library for NPCs; delete `aloy.glb` at exit |
| **brand** | 5253 | 0-day1, 0b, 4 | W0: `index.html`, `src/style.css`, `src/main.js` (log tag, loading copy), `src/ui/menu.js` (title + credits blocks), `public/favicon.svg`, `public/fonts/**`, `package.json`, `README.md`, `tools/lint/**` (lexicon, `namecheck.mjs`, `engine-allow.json`, `hzd-verbs.json`), `docs/archive/**` (moves); the day-1 stubs (handed to world-ground at W1). W4: same + `src/studio/**`, `docs/media/**`, comment grant | CALIMA wordmark + logo; Bodoni Moda / Plex fonts with OFL.txt; `--cal-*` tokens; `cal.*.v5` keys; union lexicon, player-facing and code lints; W4 comment scrub, studio renames, re-filmed media |
| **instruments-core** | 5254 | 0a, 0b | `src/entities/machines/**` per grant (incl. new `legacy.js`); the W0a removal-only grant; new `src/instruments/{lamps,roles,registry}.js`, `src/instruments/lib/**`, **`src/instruments/kinds/tiller.js` as the W0 fixture** (handed to instruments-a at W1), `tools/gates.r5.kind-block.mjs` (handed to the orchestrator at W1), `tools/gates.r5.instruments-core.mjs` | delete Override + corruption; legacy collapse; IP kinds deleted (R30); `LAMP_STATES` (iris + beam, one instanced draw); kind auto-registration; per-kind tables; perception weather + perk hooks; `ctx.machines.roles`; `uv1` through the fold; VFX palette; A90-rig-reclaim 5/5 |
| **gates-perf** | 5255 | 0a, 0b | `tools/gates.config.mjs`, `tools/gates.round4.*.mjs` (re-stage, then archive to `tools/gates/archive/`), new `tools/gates.r5.carried.mjs` (handed to the orchestrator at W1), `tools/gate-roster.mjs`, `tools/gate-places.mjs`, `tools/budgets.mjs`, `tools/r5-refs/**` (Commons fetcher), `reference/MANIFEST.md` (top level) + deletion of `reference/*.jpg`, the harness grant, `tools/gates.r5.gates-perf.mjs` | role- and place-based preludes; the carried Round-4 suite; auto-discovery of `tools/gates.r5.*.mjs`; port guard, Chrome semaphore, preflight; `A-alloc-rate`, `A-vram-ledger`, `A90-abs`; unattributed-draw cap; licence-clean reference set |
| **melee** | 5256 | 1, 2 | `anim/meleeLayer.js`, new `anim/{clipMelee,castLayer}.js`, `combat/melee.js`, `combat/lanceStow.js`, `playerAnimator.js` (W1–W2), grant lines in `collision.js`/`player.js`, `reference/r5/melee/**`, `tools/gates.r5.melee.mjs` (absorbs `gates.round4.player-melee.mjs`) | W1: lance tables on Brea, A100–A107 + R1–R32, stow clearance, Counterweight heavy, melee latency. W2: gaff, Windwall, pendulum + spin cast, per-clip elbow audit |
| **armory** | 5257 | 1, 3 | `src/hero/**` (from W1 day 1: loadout, variant data), `src/combat/bow.js`, `src/combat/weapons.js` (W1, W3), `src/combat/arrows.js` (W1), `src/combat/combat.js` (W1, W3), `tools/build/recipes/outfit-pan-1.mjs` (from W1 day 1), `tools/build/recipes/weapons/{bow,lance}*.mjs`, `tools/build/recipes/armor/**`, `public/models/armory/{bow-*,lance-*,armor-*,stowkit*}`, W3: `src/ui/inventory.{js,css}` (grant), `tools/gates.r5.armory.mjs` | W1: Sabina Bow, Shepherd's Lance final, Pan Whites II/III, Ash Wraps I, stow kit art pass. W3: all 12 armor variants, the 6 bow and lance variants (of the 18), the swap matrix over all 18, the equip panel and acquisition |
| **instruments-a** | 5258 | 1 | `src/instruments/kinds/{tiller,plumb,peg}*.js`, `tools/build/instruments/gen-{tiller,plumb,peg}.mjs`, `tools/build/instruments/parts/**`, `public/models/instruments/{tiller,plumb,peg}.glb`, `tools/gates.r5.instruments-a.mjs` | Tiller (proven → fidelity pass), Plumb (+ `scale` param, topple), Peg (+ instanced transects) |
| **world-ground** | 5259 | 1–4 | `src/world/{terrain,vegetation,water}.js`, `src/world/island/**` (recipe, masks, `sites.js`, `extent.js`, trench polylines), new `src/world/datum/**` (the `ctx.datum` service and shader chunk), `tools/build/ground/**` (layer recipes), `public/textures/ground/**`, `public/textures/r5-poc/**` (delete at W1 exit), `tools/gates.r5.world-ground.mjs` | W1: whole-island heightfield + masks at blockout, extents and REST, the Pans at full fidelity. W2: Holds (pit-cups, crescent walls, Scar, Datum Line, `walls.cut`, `ctx.datum`, tide E19). W3: Malpaís + Cloudline, tube trenches. W4: Flank (cliff kit) + Caldera |
| **world-props** | 5260 | 1, 3, 4 | `src/world/props.js`, `src/world/props/**` except `settlement.js`/`npcs.js`, `src/world/fauna.js`, new `src/world/sites/**`, `tools/build/landmarks/recipes/**`, `public/models/landmarks/**`, `tools/gates.r5.world-props.mjs` | W1: Sounding Ring, Organ Shelf clusters, wind pumps, red crater, all 6 trig pillars + 12 benchmark pads, `ctx.props.gatePlaces`, static scripted Gauge. W3: Kiln Yards, Fog Harp, Jameo + tube shells, hornitos, **island fauna**. W4: Calibration Yard, Fundamental, Pinned Cliff, Boilers sea-cave shells, Roques |
| **world-sky** | 5261 | 1, 4 | `src/world/environment.js`, `tools/gates.r5.world-sky.mjs` | W1: hour keys, weather `trade/calima/fogbank/squall`, `perceptionScale`, per-biome fog/exposure for all six biomes, cloud sea, calima disc; remove `RiverWater`. W4: per-biome tuning against the vista gates |
| **instruments-b** | 5262 | 2 | `src/instruments/kinds/{sickle,screed,gauge}*.js`, `tools/build/instruments/gen-{sickle,screed,gauge}.mjs`, `public/models/instruments/{sickle,screed,gauge}.glb`, the W2-exit legacy deletion grant, `tools/gates.r5.instruments-b.mjs` | Sickle, Screed (+ self-stun, `screed.followLine`, reads `ctx.datum.regionTrue`), Gauge (+ tide clock hook); deletes the remaining legacy kinds |
| **combat-kit** | 5263 | 2 | `src/combat/{combat,weapons,arrows,traps,feedback}.js`, `feedback.css`, new `src/combat/kit/**` (pots, net, gaff, windwall logic, perk filters), `src/items/{items,crafting,gather,tools}.js`, `src/ui/wheel.{js,css}`, `core/save.js` (grant), `tools/build/recipes/weapons/{gaff,windwall,pot,net}*.mjs`, `public/models/armory/{gaff-*,windwall-*,pot-*,net-*}`, `tools/gates.r5.combat-kit.mjs` (absorbs `gates.round4.{combat,combat-memory}.mjs`) | weapon catalog, elements + statuses (Seized without a multiplier), pots, net foul, Kit Rack in real time + quick slots, Steady breath-hold, item renames; contracts `combat.onArrowHit`, `combat.whistle(at)`, the perk filters |
| **settlements** | 5264 | 2, 4 | new `src/world/settlements/**`, `src/world/npc/**`, `src/world/camp.js` (delete), `src/world/props/{settlement,npcs}.js` (delete), `src/main.js` grant, `tools/build/recipes/npc/**`, **`tools/build/settlements/**`, `public/models/settlements/**`**, `public/models/npc/**`, `tools/gates.r5.settlements.mjs` (absorbs `gates.round4.npc.mjs`) | W2: NPC atlas + LOD + tint shader + per-archetype faces; Saltrow + Ninewalls kits; archetypes 1–9. W4: Mistfold kit, minor sites, Leveler Muster, archetypes 10–13, cable baskets, Fog Harp growth hook |
| **shell-ui** | 5265 | 2 | `src/ui/{hud,focus,inventory,map,menu,settings,tips}.{js,css}`, `src/style.css`, `index.html`, `tools/gates.r5.shell-ui.mjs` (absorbs `gates.round4.{shell-hud,shell-menus,focus-items}.mjs`) | field-book HUD (breath meter for Steady), Sighting overlay (replaces Focus), map with triangles, menus, tips |
| **progression** | 5266 | 3 | `src/core/{progression,save}.js`, `src/ui/{quests,skills}.js`, `src/items/datapoints.js` → `src/items/fieldbooks.js`, `tools/gates.r5.progression.mjs` (absorbs `gates.round4.progression*.mjs`) | first-hour quest chain, Field Books, benchmarks (`ctx.datum.setTrue`), triangulation state, **Field Book certifications** in place of XP skill trees, save v6 + schema hash, `A-first-hour` (provisional) |
| **audio** | 5267 | 3 | `src/audio/{audio,manifest}.js`, `tools/{audio-bank,audio-recipes}.*`, `public/audio/**`, `tools/gates.r5.audio.mjs` | regenerated banks under new set names; Instrument voices; biome beds; **regenerated music** in the bible palette |
| **instruments-c** | 5268 | 3 | `src/instruments/kinds/{spindle,kiln,davit,sonde}*.js`, `src/instruments/lib/tether.js`, gens + GLBs for those, grant in `rig/components.js`, `tools/gates.r5.instruments-c.mjs` | Sonde spike first; Spindle (deflect via `combat.onArrowHit`), Kiln, Davit (un-tear), Sonde |
| **instruments-d** | 5269 | 4 | `src/instruments/kinds/{dredge,transit}*.js`, `src/instruments/lib/followLeader.js`, gens + GLBs, grant in `gait.js`, `tools/gates.r5.instruments-d.mjs` | Transit grey box → art; Dredge follow-the-leader + burrow |

Every lane also owns `docs/ROUND5-<LANE>.md` (its report) and `reference/r5/<lane>/**` (+ that
folder's `MANIFEST.md`).

---

## 3. Waves

### 3.1 Waves and exits

| wave | lanes (≤ 6) | depends on | exit (all lanes' §9 gates + the global green list) |
|---|---|---|---|
| **W0-day1 — mechanical pass** | brand alone | — | `A-identifiers-renamed`, `A-extent-refactor`, `A-single-rest` (grep half), `A1`, `A20b` |
| **W0a — foundations (1–2 days)** | pipeline, gates-perf, instruments-core, engine-gpu (probes only) | W0-day1 | data-driven SPECS + `SPECS.hero`; `legacy.js` collapse; removal-only Override + corruption pass; **IP/NC + `npc.glb` deleted (R30)**; `.gitignore` fixed; port guard, semaphore, preflight; carried Round-4 suite live; Tiller fixture registered. Gates: `A1`, `A20b`, `A-no-override`, `A-no-corruption`, `A-legacy-collapse`, `A-specs-data-driven`, `A-port-guard`, `A-chrome-semaphore`, `A-assets-tracked`, `A-ID-ip-assets-gone`, `A-carried-suite` |
| **W0b — protagonist on the kept rig** | pipeline, engine-gpu, hero-body, brand, instruments-core, gates-perf | W0a | Brea passes the kept movement + draw gates on the real v0 loadout; GPU tier chosen and render targets measured; lamps + roles + perk hooks live; licence manifest complete with SHA-256s; `aloy.glb`, anim duplicates, labs spikes, HZD reference stills, old fonts and the `?poc=human` and `?poc=creature` hooks deleted; **Brea's silhouette and face sheets shown to Kevin** (§11, decision 1) |
| **W1 — vertical slice: The Pans** | melee, armory, instruments-a, world-ground, world-props, world-sky | W0 | the Pans vista passes against real reference; `REST` at Saltrow and the 1024 m extents live (`A-reach-all-sites`); Tiller/Plumb/Peg pass per-species gates; lance melee passes A100–A107; `?poc=biome` removed |
| **W2 — the first hour's content** | instruments-b, melee, combat-kit, settlements, shell-ui, world-ground | W1 | Ninewalls + Saltrow alive; Sickle/Screed/Gauge pass; gaff, Windwall, pots, net pass; field-book UI passes; remaining legacy species, camp and `legacy.js` gone (`A-legacy-gone`); W0-era saves load clean |
| **W3 — breadth** | progression, audio, instruments-c, world-ground, world-props, armory | W2 | `A-first-hour` passes **provisionally** (Plumb generator at `scale` 6.5 for the 0:55 walker); 4 biomes at fidelity; 10 kinds; all 12 armor variants pass the swap matrix; `A-weapon-role` passes; save v6; fauna; music; A21 at each biome vista + the Kiln Yard fight |
| **W4 — apex + final** | instruments-d, world-ground, world-props, settlements, world-sky, brand | W3 | 6 biomes; 12 kinds (or 11 with the Dredge cut, named); 13 archetypes; **final `A-first-hour` with the Transit** (orchestrator run); `A-no-horizon-terms-player` = 0; code allowlist at its cap; comment scrub; credits match the manifest |

Dependency notes:

- **Wave 0 is the bottleneck by design.** Every later lane builds on Brea's rig profile, the shared
  loader, the role map and the GPU tier. Nothing in W1 starts until W0b exits.
- **W0a exists because W0b lanes need its outputs on day 1**: hero-body needs `SPECS.hero` and the
  re-staged animator gates, and nobody may edit `playerAnimator.js` or `menu.js` until the removal-only
  Override pass has merged.
- The **Pans-first rule** (lens 2): world-ground authors the whole-island heightfield and masks in
  W1 at blockout fidelity, but ground layers and scatter for biomes 2–6 start only after
  `V-biome-vista-pans` passes.
- **Same-wave ordering in W3:** world-props places the Kiln Yards on the W1 blockout heights (frozen by
  `A-world-size`), so the Malpaís ground pass and the Kiln Yards can land in either order. The beat-0:55
  shot of `V-first-hour-strip` is taken after both.
- First-hour beats are owned by the wave that builds their content (bible §8.9). `A-first-hour` runs
  provisionally at the W3 exit (progression) and finally at the W4 exit with the Transit, run by the
  orchestrator.
- The orchestrator runs the **global green list** (§9) on port 5270, on a quiet box, with exactly one
  Chrome, at every wave exit.

### 3.2 Cross-lane contracts (published as stubs on the owner's day 1, real by the owner's exit)

A stub returns a documented fixed value and passes the shape clauses of its contract gate. The real
implementation must pass the whole gate by the owner's wave exit. Consumers code against the stub.

| contract | owner | stub | real by | consumers | gate |
|---|---|---|---|---|---|
| `src/world/island/{sites,extent}.js` (`REST`, `REST_SITE`, `PLAY_RADIUS`, `EXTENT`) | brand → world-ground | W0-day1 (today's values) | W1 exit | player, nav, machines (index, machine, search, squad, doctrine), terrain, map, menu, props, vegetation, gather, waypoints | `A-single-rest`, `A-reach-all-sites` |
| `assets.specs` rows + `SPECS.hero` | pipeline | W0a day 1 | W0a exit | hero-body, instruments-core | `A-specs-data-driven`, `A-human-bind` |
| `tools/gates.r5.carried.mjs` (re-staged animator gates first) | gates-perf | W0a day 1 | W0a exit | hero-body and every later lane | `A-carried-suite` |
| `player.mods`, `player.ride(path, clip)`, climb and slide actions | hero-body | W0b day 1 | W0 exit | armory W1/W3, combat-kit W2, settlements W4 | `A-player-mods`, `A-ride-hook` |
| `perception.detectMul`, `perception.flagDuration`, `stimulus.addNoiseFilter`, the perception occlusion flag for Dust-sight outlines | instruments-core | W0b day 1 | W0 exit | armory W1/W3; shell-ui W2 (draws the outline) | `A-perk-hooks` |
| `ctx.machines.roles`, kind auto-registration | instruments-core | W0a | W0 exit | every Instruments lane, the gates | `A-roles-published`, `A-kind-registration` |
| `ctx.terrain.walls.cut(id, h)` on the instanced crescent walls | world-ground | W2 day 1 | W2 exit | instruments-b (`A-correction-day`) | `A-contract-walls-cut` |
| `ctx.datum.regionTrue(region)`, `ctx.datum.setTrue(region)`, `ctx.datum.patch(material)` | world-ground | W2 day 1 | W2 exit | instruments-b (Screed targeting), settlements W2/W4 and world-props W3/W4 (materials), progression W3 (re-survey) | `A-contract-datum` |
| `screed.followLine(path, lampId)` | instruments-b | W2 day 1 | W2 exit | settlements W4 (Levelers) | `A-contract-followline` |
| `combat.onArrowHit(fn) → { deflect }` | combat-kit | W2 day 1 | W2 exit | instruments-c W3 (Ring Spin) | `A-contract-arrow-filter` |
| `combat.whistle(at)`, pool-damage filter, Brine build-up filter, Windwall `parryMul` | combat-kit | W2 day 1 | W2 exit | armory W3 (perks) | `A-perk-hooks-combat` |
| tube trench polylines in `sites.js` + `ctx.terrain.trench(id)` | world-ground | W1 exit | W3 exit | world-props W3/W4 (shells) | `A-tube-colliders` |
| `ctx.props.gatePlaces` | world-props | W1 day 1 | W1 exit | the gates | `A-gate-places-published` |

Screeds stand down after a re-survey with no Screed code in W3: progression calls
`ctx.datum.setTrue(region)` and the Screed's target picker (instruments-b, W2) already skips regions
where `ctx.datum.regionTrue` is true (`A-screed-reads-datum`).

### 3.3 Worktrees, merges and the shared tree

- The orchestrator runs `git worktree add` per lane at wave start, symlinks `node_modules` and
  `models-staging/r5-src`, and gives the lane its port. Lanes never run git.
- Day-1 stubs (§3.2) are merged to main by the orchestrator at the end of the owner's day 1 and
  synced into every running lane's tree.
- At lane exit the orchestrator merges the lane, runs `A1` + the lane's gates on main at port 5270,
  commits, and removes the worktree. Kevin's 5173 preview serves main, which changes only here.
- The rows of `tools/gates.r5.carried.mjs` never move. An absorbing lane shadows a row by id in its
  own gate file while it is active. At lane exit the orchestrator folds the lane's version back into
  `carried.mjs`, so **no Round-4 regression gate goes dark between W0 and its absorbing lane, or after it**.

---

## 4. Budgets

### 4.1 Per asset

| asset | LOD0 tris | LOD1 | bones | main draws | shadow | materials / textures | file |
|---|---|---|---|---|---|---|---|
| Brea body + head + hair + wrap + eyes (body faces hidden under the outfit culled at merge) | **≤ 10 k** | caster proxy | 65 (UBC) + dyn chains | ≤ 2 | via proxy | skin 1024² base + 512² normal/ORM; hair+wrap 512² | ≤ 0.7 MB |
| Brea outfit variant (merged) | **≤ 17.5 k** | caster proxy | — | 1 | via proxy | set atlas 1024² base + 512² normal/ORM | ≤ 0.8 MB / set, ≤ 0.15 MB / extra variant |
| armor piece (procedural) | ≤ 3 k | — | — | merged | — | set atlas | ≤ 0.15 MB |
| stow kit (all stowed gear) | **≤ 9 k** | — | — | **1** (`pieceId` mask) | 1 caster | weapon atlas 1024² | ≤ 0.6 MB |
| held weapon | **≤ 3 k** (bow ≤ 3 k, lance ≤ 1.5 k, gaff ≤ 1.1 k, Windwall ≤ 2.5 k, pot ≤ 0.3 k, net ≤ 1.2 k) | — | Windwall 9 slats | 1–2 | — | weapon atlas | ≤ 0.15 MB each |
| **Brea total** | **≤ 40 k (caps sum to 39.5 k)** | | | **≤ 5 main** | **≤ 2 casters × 3** | | |
| NPC | ≤ 12 k | ≤ 4 k beyond 25 m | 65 | ≤ 2 | nearest 4 only | 1 atlas per body type + faction (**≤ 4 resident**) | body ≤ 0.4 MB |
| settlement (whole kit, instanced per material) | ≤ 150 k | module LOD1 beyond 120 m | — | **≤ 12 incl. casters** | in the 12 | 1–2 kit atlases (1024²) | ≤ 1.2 MB |
| Instrument small (≤ 2.5 m) | ≤ 15 k | — | ≤ 20 | ≤ 3 | 1 caster | hull + lamp; 8×1 palette; shared decal atlas (`uv1`) | ≤ 200 KB |
| Instrument medium (2.5–6 m) | ≤ 35 k | optional | ≤ 30 | ≤ 3 | 1 | " | ≤ 400 KB |
| Instrument large (6–12 m) | ≤ 60 k | required ~35 % | ≤ 40 (**Dredge ≤ 52**) | ≤ 3 | 1 | " | ≤ 700 KB |
| Transit (colossal) | ≤ 120 k | 40 k | ≤ 64 | ≤ 4 | 2 | " | ≤ 1.2 MB |
| landmark | ≤ 40 k | optional | — | ≤ 3 | 1–2 | 2 materials, palette + decal | ≤ 300 KB |
| ground layer | — | — | — | — | — | 2 × RGBA WebP; 5 at 1024² (≈ 1.2 MB, 11 MB VRAM), 5 at 512² (≈ 0.3 MB, 2.8 MB VRAM) | |
| scatter kind | rock ≤ 200, plant ≤ 100–220, wall/pit-cup ≤ 120 per instance | — | — | 1 | rocks/walls yes, plants no | shared | |
| fauna kind | ≤ 1.5 k | — | ≤ 12 | 1 | no | shared | ≤ 60 KB |
| lamp beams (all Instruments) | 64 per cone, instanced | — | — | **1** | no | 1 additive | — |

### 4.2 Worst-frame draw ledgers (≤ 350; measured by hiding each owner on the same frozen frame)

| owner | **Screed fight at Ninewalls** (worst) | **Saltrow at dusk, 10 NPCs** | **Transit fight, Caldera** | **Kiln Yard assault** | **Cloudline fog-bank hunt** |
|---|---|---|---|---|---|
| post chain (measured, fixed) | 22 | 22 | 22 | 22 | 22 |
| terrain, skirt, sky, sea | 12 | 12 | 12 | 12 | 12 |
| ground scatter (≤ 8 kinds) | 32 | 24 | 24 | 28 (cinder rocks, hornitos ×2, lava blocks) | 16 (cull at 140 m in fog) |
| vegetation chunks | 40 | 24 | 30 | 12 (rare tabaiba, lichen) | 56 (laurel near/mid/impostor, heather, ferns, moss) |
| landmarks + places (≤ 3) | 45 | 45 | 45 | 45 (cooling towers, pipe racks, wellheads; Rust Cone T3) | 30 (Fog Harp, T4) |
| settlement kit | 12 (Ninewalls) | 12 (Saltrow) | 0 | 0 | 12 (Mistfold below) |
| Instruments (≈ 6 each: ≤ 3 main + 1 caster × 3) | Screed 6 + 3 Sickles 18 + Plumb 6 + 2 Tillers 12 = **42** | 2 distant Tillers 12 | Transit 10 + 4 Plumbs 24 + Screed 6 = **40** | Kiln 6 + 2 Spindles 12 + Davit 6 + 6 Pegs 36 = **60** | 2 Sondes 12 + 2 Spindles 12 + 3 Sickles 18 = **42** |
| Peg transects (instanced) | 1 | 1 | 0 | 1 | 0 |
| lamp beams | 1 | 0 | 1 | 1 | 1 |
| Brea + gear | 11 (5 + 2 × 3) | 11 | 11 | 11 | 11 |
| NPCs | 8 × 2 + 4 casters × 3 = 28 | 10 × 2 + 12 = 32 | 0 | 0 | 2 × 2 = 4 |
| VFX, UI, pooled (fumaroles, fire pools, mortar shells, fog drips) | 25 | 20 | 30 | 35 | 20 |
| unattributed scene children (**measured at W0, capped ≤ 30 by W2**, `A-unattributed-cap`) | 30 | 30 | 30 | 30 | 30 |
| **total** | **301** (49 headroom) | **245** | **245** | **257** | **256** |
| triangles (bar 6.5 M) | ≈ 3.5 M | ≈ 2.85 M | ≈ 3.2 M | ≈ 3.3 M | ≈ 4.2 M |

`A21` stages the Screed fight at every wave exit. At the W3 and W4 exits it also runs at **each biome
vista** (the `V-biome-vista-*` setups) and at a **staged Kiln Yard assault** (≤ 350 draws, ≤ 6.5 M tris
each).

### 4.3 GPU and frame time

- W0 exit gate `A-gpu-tier`: on a quiet box (load average < 3), 1600×900, the shipped default tier:
  empty frame (post + sky) **≤ 7 ms GPU**, the Pans vista **≤ 13 ms GPU**, **median ≥ 58 fps**,
  p95 frame ≤ 20 ms. Candidate levers, measured in this order: DPR cap 1.25, GTAO at quarter
  resolution, SMAA-only (needs R25). The post chain is ~13.5 ms empty at DPR 1.5 today.
- Ground shader: ≤ 3 layers per pixel, triplanar on slopes only, 512² normals for far layers.
- Calima, fog bank and night frames cull scatter beyond 140 m (B's "fog frames are the cheapest").

### 4.4 GPU memory (gate `A-vram-ledger`; absolute ceilings in `A90-abs`)

| bucket | MB | bar |
|---|---|---|
| ground (5 × 1024² + 5 × 512², 2 RGBA each, mips) | ≈ 70 | |
| masks (512² biome + 256² stealth/wet) | ≈ 4 | |
| Brea (skin 1024² + 2 × 512², hair 512², outfit 1024² + 2 × 512²) | ≈ 18 | |
| NPC faction atlases, **≤ 4 resident** (4 × 1024² base + shared 512² normal/ORM), streamed per settlement | ≈ 25 | `A-npc-atlas-resident` |
| weapon + Instrument decal atlases | ≈ 11 | |
| landmark/prop trim + settlement kit atlases | ≈ 14 | |
| UI | ≈ 4 | |
| **textures** | **≈ 146** | **≤ 160** |
| render targets: CSM 3 × 2048² + sun 2048² (`engine.js:636`, `environment.js:431`), HalfFloat MSAA scene RT (`engine.js:437`), GTAO, bloom chain, at DPR 1.25 and 1600×900 | ≈ 150 (estimate; **measured by engine-gpu at W0**, `A-rt-ledger`) | measured + 10 %, **≤ 170** |
| geometry buffers (1024 m terrain ≈ 471 k vertices, instances, skinned, Instruments) | ≈ 80 | ≤ 120 |
| **total GPU memory (textures + RTs + geometry)** | **≈ 376** | **≤ 450** |

KTX2/Basis is the lever if A90 tightens; measure an encoder's disk cost (`toktx` or WASM) before
adopting one.

### 4.5 Shipped disk (`public/` ≤ 60 MB)

| bucket | MB |
|---|---|
| UAL1 (kept) | 3.9 |
| UAL2 trimmed to the ~22 clips used | ≈ 3.5 |
| Brea + 4 armor sets | ≈ 4.0 |
| weapons (**18 variants** as data in ~8 GLBs) + stow kit + v0 kit | ≈ 1.7 |
| NPC bodies, faction outfits, per-archetype head textures | ≈ 3.6 |
| 12 Instruments | ≈ 5.0 |
| landmarks | ≈ 2.5 |
| settlement kits (3 × ≤ 1.2 MB + minor sites) | ≈ 4.0 |
| ground layers | ≈ 7.5 |
| decal/trim atlases | ≈ 1.0 |
| fauna (6 kinds) | ≈ 0.3 |
| audio incl. regenerated music | ≈ 3.2 |
| fonts (3 OFL families, woff2) | ≈ 0.4 |
| UI, `LICENSES.json`, licence texts | ≈ 0.4 |
| **total** | **≈ 41 MB** |

### 4.6 Local disk ledger (not shipped; floor **≥ 3 GB free** at every lane exit and before every Chrome launch)

Measured Oct 15: 10 GB free on the Data volume (the brief plans against ~7 GB); swap 648 MB in use.

| item | size | lifetime |
|---|---|---|
| `.git` | 170 MB now; + ≈ 60–120 MB over the round (final GLBs committed once per lane exit, not per iteration) | permanent |
| `models-staging/` HZD-cast cleanup | 134 MB → ≈ 30 MB | W0 |
| `models-staging/r5-src/` (trimmed UBC 50, MCO 83, UAL2 9 MB + UAL1, scans, fonts; gitignored) | ≈ 150 MB | the round |
| transient re-fetch of the UBC / MCO / UAL1 / UAL2 zips to record SHA-256s | ≈ 420 MB peak, deleted the same day | W0 |
| per-lane worktrees (tracked files; `node_modules` symlinked) | ≤ 6 × 80 MB = 480 MB | removed at lane exit |
| per-lane scratch (`scratchpad/r5/<lane>`) | ≤ 200 MB each, ≤ 1.2 GB total | cleared at lane exit (reports kept) |
| `shots/` | 85 MB now; pruned to ≤ 150 MB (latest run per gate) | rolling |
| Chrome profiles | ≤ 2 × ≈ 200 MB | per gate run (`A80`) |
| Blender (fallback only) | ≈ 1.2 GB installed + 346 MB DMG (deleted after install) | only after a second `V-brea-face` failure, and only if ≥ 4.5 GB is free at that moment |

Planned peak above today, without Blender: ≈ 2.5 GB. `A-chrome-semaphore`'s preflight enforces the floor.

---

## 5. Costed extensions (✂ = can be cut without breaking the direction)

| id | change | lane / wave | cost | cut line |
|---|---|---|---|---|
| E1 | rig-profile seams finished: orbit capsules, nock bone, `MASK_PREFIX` case-insensitive, braid guard → spring collider, no twist joints | hero-body W0b | 1 d | — |
| E2 | Lmax solve, then ~12 aim constants on Brea | hero-body W0b | 2 d | — |
| E3 | M10 spring-side capsule collider (right hand + forearm vs `dyn_` chains) | hero-body W0b | ½ d | — |
| E4 | face displacement + paint in `recipes/brea.mjs` via `recipes/lib/face.mjs` | hero-body W0b | 1 d | Blender sculpt only on a second `V-brea-face` failure (≈ 1.2 GB installed) |
| E5 | alidade raise overlay (bow-anchor IK target → right eye) | hero-body W0b | ½ d | — |
| E6 | `LAMP_STATES` iris + one-draw instanced beams + shared loader fixes | instruments-core W0b | 1 d | — |
| E7 | per-kind table + kind auto-registration; perception weather/detection hooks | instruments-core W0b | 1 d | — |
| E8 | meleeLayer tables on Brea + 1.55 m lance; A103 per kind | melee W1 | 3 d | — |
| E9 | **outfit merge + skeleton dispose, stow kit merged mesh + `pieceId` mask, v0 kit GLBs** (moved from armory W1) | hero-body W0b | 1.5 d | — |
| E10 | species-level tripod topple (`onDeathPose`), reused by Transit | instruments-a W1 | ½ d | — |
| E11 | Peg transects (instanced pegs, wary trigger) | instruments-a W1 | ½ d | — |
| E12 | calima weather + `perceptionScale` + cloud-sea height fog | world-sky W1 | 1 d | — |
| E13 | NPC atlas + LOD1 + mask-aware tint shader + atlas streaming (≤ 4 resident) | settlements W2 | 2 d | tint shader ✂ (whole-texture tints) |
| E14 | gaff clip routing (Sword_Regular_A + Sword_Block) + hook-rip beat + step-in lunge | melee W2 | 1.5 d | — |
| E15 | pendulum cast + spin-cast beats (`castLayer.js`) | melee W2 | 1 d | — |
| E16 | Windwall fan rig (9 rigid slats, one `open` param), plant-as-cover LOS blocker | combat-kit + melee W2 | 1 d | plant ✂ |
| E17 | cast-net mesh + foul state | combat-kit W2 | ½ d | ✂ (net cut, 5 weapons) |
| E18 | Screed charge self-stun (collision probe in the charge update) | instruments-b W2 | ½ d | — |
| E19 | tide: `uTide`, `water.levelAt` = base + tide, pans flood mask, 2 navgrid keepout sets | world-ground + instruments-b W2 | 1.5 d | ✂ static pans + scripted Gauge flood |
| E20 | Datum Line shader chunk (`uDatum[8]`) + erase on re-survey | world-ground W2 | 1 d | ✂ vermilion-capped Peg stakes on the walls (bible §8.9) |
| E21 | un-tear in `rig/components.js` (Davit) | instruments-c W3 | 1 d | ✂ Davit restores 30 % armor instead |
| E22 | TetherFlightController — **2-day spike first** | instruments-c W3 | 2 + 1 d | ✂ moored mast balloon (spotter, no flight) |
| E23 | ash pit-cups + crescent walls instanced | world-ground W2 | 1 d | — |
| E24 | follow-the-leader spine + burrow (Dredge) | instruments-d W4 | 3 + 1.5 d | ✂ 3-segment rigid train, or ship 11 kinds |
| E25 | Transit grey box through the seam, LOD1, 2 casters | instruments-d W4 | 1 d + art | — |
| E26 | Drowned Flank cliff kit (stratified slabs, instanced, collider boxes) | world-ground W4 | 2 d | ✂ 55° heightfield slope + column clusters |
| E27 | `A-alloc-rate` (CDP sampling heap profiler) + `A-vram-ledger` + `A90-abs` | gates-perf W0b | 1.5 d | — |
| E28 | `player.mods` surface, `ClimbUp_1m` + slide actions, `player.ride` hook | hero-body W0b | 2 d | ride hook ✂ (baskets become ladders) |
| E29 | `legacy.js` collapse + data-driven SPECS + Tiller fixture | instruments-core + pipeline W0a | 1.5 d | — |
| E30 | removal-only Override + corruption pass (14 files) | instruments-core W0a | ½ d | — |
| E31 | port guard + Chrome semaphore + disk/memory preflight | gates-perf W0a | ½ d | — |
| E32 | re-fetch for SHA-256s, `r5-src` staging, code-licence rows; Commons reference pull | pipeline + gates-perf W0b | 1 d | — |
| E33 | perk hooks: perception `detectMul`/`flagDuration`, stimulus noise filter (W0); combat filters, `whistle(at)`, `parryMul` (W2) | instruments-core W0b + combat-kit W2 | 1 d | — |
| E34 | `uv1` survives the fold + VFX palette defaults | instruments-core W0b | ½ d | — |
| E35 | per-archetype NPC faces from the face library | settlements W2 | 1 d | — |
| E36 | settlement modular kits (Saltrow, Ninewalls W2; Mistfold, minor sites W4) | settlements W2, W4 | 2 + 1 d | minor sites ✂ to props |
| E37 | cable baskets | settlements W4 | 1 d | ✂ ladders |
| E38 | tube trenches + overhang shells (Jameo, Malpaís tube; Boilers caves) | world-ground W3 + world-props W3/W4 | 1.5 d | ✂ Malpaís tube (the Jameo stays) |
| E39 | island fauna re-pick | world-props W3 | 1 d | — |
| E40 | music regeneration in the bible palette | audio W3 | 1 d | — |
| E41 | Field Book certifications replace XP skill trees | progression W3 | 1.5 d | — |
| E42 | Steady breath-hold, Kit Rack in real time, quick slots 1–4 | combat-kit W2 | 1 d | — |
| E43 | equip panel + acquisition | armory W3 | 1 d | — |
| E44 | contract stubs (`walls.cut`, `ctx.datum`, `followLine`, `onArrowHit`) | world-ground, instruments-b, combat-kit W2 day 1 | ½ d each | — |
| E45 | day-1 stubs + literal → import pass | brand W0-day1 | ½ d | — |
| E46 | save v6 + item-id/quest-id schema hash | progression W3 | ½ d | — |
| E47 | comment-only scrub of frozen files | brand W4 | ½ d | — |
| — | per-leg IK pole in `gait.js` | — | **not needed** (sagittal knees rule) | — |
| — | swim state | — | **cut this round** (≈ 3–4 d later) | deep water = blocking current ring |
| — | pole-vault leap | — | **cut this round** | baskets + slides cover the descents |
| — | human-combat AI for Levelers | — | not this round | Levelers act through Screeds |

---

## 6. DELETE list (only after the replacement passes its gates, except R30)

| item | size / files | deleted at | unlocked by |
|---|---|---|---|
| `public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb` (HZD IP; three CC-BY-NC) + `watcher.js`, `sawtooth.js`, `behemoth.js`, `thunderjaw.js`, `redeye.js`, their `legacy.js` rows, SPECS rows and `rig/shells.js` definitions | 4.83 MB | **W0a** (instruments-core; SPECS rows by pipeline) | **R30**; roles `sentry`, `flanker`, `heavy`, `colossus` report SKIP-legacy-deleted until Plumb (W1), Sickle/Screed (W2), Transit (W4) |
| `public/models/npc.glb` (HZD fan art), `public/models/npc/README.txt`, `SPECS.npc` | 2.74 MB | **W0a** (pipeline; `camp.js` guard) | **R30**; NPC gates report SKIP-legacy-deleted until settlements W2 |
| any other file under `public/` whose CC0 / CC-BY / project-original provenance cannot be established | — | W0a (pipeline) | R30; `A-licence-manifest` |
| `public/anims-{hybrid,reskin,retarget}/**` (incl. `aloy-ual.json`) | 12.0 MB | W0a (gates-perf) | no runtime reader; `A1-boot-clean` |
| `labs/**`, `spike-*.html`, `tools/spike-*.mjs`, `tools/scratch/*` | — | W0a (gates-perf) | no runtime reader |
| `reference/*.jpg` (Guerrilla/Sony stills) | 9.7 MB | W0b (gates-perf) | `reference/r5/**` exists and V12/V22/V24/V46/V48 point at it (`A-reference-clean`) |
| `src/entities/machines/ai/override.js`, `tables.OVERRIDE`, state `overridden`, events `override-node` / `cauldron-override`, the `ai/squad.js` corruption block | 269 + lines | W0a (instruments-core) | rule R17; `A-no-override`, `A-no-corruption` |
| HZD donor lists in `tools/{optimize,bake-rigs,measure-machines}.mjs` | — | W0b (pipeline) | `A-gates-no-hero-literals` at its W3 scope |
| `public/models/aloy.glb` (Sketchfab "Aloy – Fortnite") | 1.71 MB | W0 exit (hero-body) | Brea passes the hero-body block (§9) incl. A12, A13, A35 |
| `public/fonts/{JuliusSansOne,Rajdhani-*,ChakraPetch-*,Michroma,Orbitron}*` | 1.4 MB | W0 exit (brand) | `A-fonts-licensed` + `V-logo` |
| `src/main.js` `?poc=human` and `?poc=creature` blocks, `tools/r5-poc/**` (3.3 MB, untracked), `public/models/r5-poc/**` (0.5 MB) | 3.8 MB | W0 exit (pipeline) | promoted into `tools/build/**`; `A-build-deterministic`; `A-poc-promoted` |
| the 12 DIES gates (V11, A27b, A100-expansion-doctrine, A44c-lineup-expansion(-b), V26a/b, V27a/b, A66-expansion, V42, V43) | — | W0a (gates-perf) | their subjects are deleted content; replacements are in §9 |
| `docs/research/{roster-v2,casting-v3,casting-v4,machines,mechanics,ui,spear-canon,reference-v3}.md`, `docs/ROUND3.md`, `docs/ROUND4-*.md` | — | W0b → `docs/archive/` (brand), excluded from the lint | — |
| `models-staging/**` HZD-cast items (134 MB on disk, mostly ignored) | disk | W0b (pipeline) | CC0 packs kept only if a lane names them |
| `src/world/props/tallneck.js`, `megastructures.js`, old `PLACES` rows, `rockworks` placements | — | W1 exit (world-props) | Pans landmarks pass `V34`, `A-landmark-bearing` (Pans vantage) |
| old landform recipe (`riverCenterX/shelfFactor/…`), `RiverWater` (**`riverFactor` stays exported, returning 0**) | — | W1 exit (world-ground / world-sky) | `A-terrain-api`, `V-biome-vista-pans` |
| `src/main.js` `?poc=biome` block, `public/textures/r5-poc/**` (4.4 MB, untracked) | 4.4 MB | W1 exit (world-ground) | `V-biome-vista-pans` on the real Pans; `A-gpu-tier` re-run at `gatePlaces.vistas.pans` |
| `src/world/props/npcs.js`, `src/world/camp.js`, `src/world/props/settlement.js`, `npc/waypoints.js` roster | — | W2 exit (settlements) | A95–A97, `A-npc-variety`, V40 at Saltrow |
| `public/models/{strider,scrapper,snapmaw,ravager,corruptor,stormbird,glinthawk,broadhead,grazer,shellwalker}.glb`, `longleg.gltf` + their species files, every remaining `legacy.js` row, `rig/shells-expansion.js`, `rig/rigs-expansion.js`, old doctrine rows | 8.4 MB | **W2 exit** (instruments-b, grant) | Sickle, Screed, Gauge pass the per-kind block; `A-legacy-gone`; `A32-look-up` uses a static gondola target until the Sonde (W3) |
| old fauna (Boar, Fox, Ridge Grouse, Ridge Goat, Scrub Hare) | — | W3 exit (world-props) | `A-fauna-biomes` |
| `public/audio/{aloy,voice/<hzd-kind>,idle/<hzd-kind>,bow/{hunter,sharpshot,war}}/**`, old `music/*` stems | ≈ 0.6 MB | W3 exit (audio) | A73, A75, A73b, A73c, `A-music-palette` on the new sets |
| `docs/media/*.png` (HZD build) | — | W4 (brand) | `V-media-refilm` |

The IP, NC and duplicate removals total ≈ 30 MB; the round ends at ≈ 41 MB shipped (§4.5). **Working-tree
deletion does not remove these files from the public repository's history** (§11, decision 2).

---

## 7. Rename plan

### 7.1 W0-day1 — mechanical pass (brand, grant §1.2, before any other lane starts)

| class | from | to |
|---|---|---|
| project prefix | `hzc`, `.hzc-*`, `--hzc-*`, `#hzc-prog`, `[HZC]` | `cal`, `.cal-*`, `--cal-*`, `#cal-prog`, `[CAL]` |
| storage keys (version bump; old keys refused) | `hzc.save.v4`, `hzc.checkpoint.v4`, `hzc.meta.v4`, `hzc.settings.v1`, `hzc.audio.v1`, `hzc.map.v1`, `hzc.hud.tips.v4` | `cal.save.v5`, `cal.checkpoint.v5`, `cal.meta.v5`, `cal.settings.v5`, `cal.audio.v5`, `cal.map.v5`, `cal.hud.tips.v5` |
| events | `datapoint-found`, `supply-cache`, `silent-strike`, `focus-on/off/pulse`, `concentration-start/end`, `machine-tied`, `rope-attached` | `fieldbook-found`, `cache-found`, `undercut`, `sighting-on/off/pulse`, `steady-start/end`, `instrument-fouled`, `net-fouled` |
| removed events | `override-node`, `cauldron-override`, `hunting-ground` | (deleted with their systems; instruments-core W0a / progression W3) |
| ctx members | `ctx.focus`, `combat.concentration`, `player.pouch`/`medicine` | `ctx.sighting`, `combat.steady`, `player.gourd` |
| asset rig row | `assets.models.aloy` | `assets.models.hero` |
| numeric literals | the camp (18, 26) / (22, 30, r 25 / 31) ×10; the kept-code extents 330 / 312 / 332 / 324 / 318 / 315 / 310 ×2 / 296 / 285 | imports of `REST`, `REST_SITE` from `src/world/island/sites.js` and `PLAY_RADIUS` + the `EXTENT` offsets from `src/world/island/extent.js`, at today's values |
| package | `horizon-zero-claude`, "Horizon Zero Dawn homage" | `calima`, "CALIMA — a survey-machine hunting game" |

### 7.2 Content names die with their content; saves follow the ids

Species kinds, Aloy rig names, NPC names, places, quests and HZD comments disappear when §6 deletes
their files. Item ids (`metal-shards` → `salt`, `blaze` → `cinder-resin`, `chillwater` → `brine`,
`sparker` → `dust`, `ridge-wood` → `juniper`, `wire` → `cord`, `braided-wire` → `bronze-cable`,
`<kind>-lens` → `<kind>-lampglass`, core/heart → `escapement`) change in W2 (combat-kit). A W0-era
`cal.save.v5` still loads after W2: unknown ids are dropped with one warning (combat-kit's `save.js`
grant). Progression W3 bumps to **`cal.save.v6`**, which carries an item-id + quest-id schema hash,
and refuses v5 or a mismatched hash with a fresh start and 0 console errors (`A-save-schema`).

### 7.3 UI words (W2: shell-ui, combat-kit; W3: progression)

Player-facing words per bible §10: Sighting, Alidade, Flagged, Steady, Undercut, Felling blow, Pry,
Blunt, Charred, Seized, Clouded, Field Book, Gourd, Kit Rack, salt, certification. Gate `A-ui-words`.

### 7.4 The two lints

- **Player-facing** (`A-no-horizon-terms-player`): rendered DOM text, content ids, role ids, the keys
  of content tables, and `public/**/*.{json,md,txt}`. The count is recorded at W0b exit, is
  **non-increasing at every wave exit**, and is **0 at W4 exit**. Allowlist: the GENERIC common nouns
  in bible §10.4 only.
- **Code** (`A-no-horizon-terms-code`): identifiers and strings in `src/**`, `index.html` and `tools/**`
  (excluding `tools/lint/**` and comments). Every hit must be an entry of
  `tools/lint/engine-allow.json`, which lists the engine identifiers that stay: `machine(s)` incl. the
  `src/entities/machines/**` path, the `tear`/`impact` channel keys, `lens` (camera), DOM `focus()`,
  `hunter-camp` (frozen `collision.js:1206`), `spear*` (`lanceStow.js`). **Each entry has a count cap**
  and the total is non-increasing. Comments in frozen files are scrubbed once in W4 (`A-comment-scrub`).

---

## 8. Rulings

### 8.1 Carried from Round 4 (stand for the new weapon set)

- **R1** light-3 is one-handed; A101's two-handed clause is void for light-3.
- **R2** V46 ready: tip height 0.35–0.55 m char space.
- **R3** heavy contact: fist at shoulder height, outboard of the head line (≈ `[-0.22, 1.24, 0.80]`
  scaled); haft/forearm never cross the face; reach from spine pitch + lunge, not a raised hand.
- **R4** the approach term releases at a bounded rate (no single-frame root jump > 0.15 m), bounded
  per target by the real hit-hull capsules (body capsule ≥ 0.05 m from every hull capsule);
  `melee.dispose()` clears it.
- **R5** a swing never starts before the draw has completed; first LMB from holstered plays the draw
  and queues the strike; grip fraction 0.15–0.28 at contact.
- **R6** releasing the approach term never moves her unless she moves: total release displacement
  ≤ 0.10 m, planted-foot drag ≤ 0.08 m.
- **R7** A103 stages every **non-legacy** kind in `ctx.machines.kinds` (R28); tip-to-hull reach
  ≤ 0.15 m for each; an unreachable kind is named and its standoff fixed by its species lane.
- **R8** draw/holster arm path: elbow never above `head_y + 0.05 m` nor > 0.10 m behind the head
  plane, from idle, jog and sprint; bow and lance never both in hand.
- **R9** heavy recover: forearm ≥ 0.10 m off the belly/spine axis; on slopes ≤ 25° the blade tip stays
  above terrain at contact.

### 8.2 New this round

- **R10 — lance carry.** The upright back carry is rejected (heel kick at calf height, arm backswing,
  head crossed in every chase frame, A100 band, carry-solver clamp 30.5°, R8). The lance stows on a
  steep diagonal **32–40° from vertical**, butt low at the left hip, blade above the right shoulder;
  A100's 30–60° band, ceiling 0.70 m and tip-right-of-spine > 0.15 m stand. "Ponytail clearance"
  reads the wrap tail and knot tail.
- **R11 — A17 flourish frames** are counted on the **sim clock** (≥ 8 sim frames at 60 Hz); the
  loose follow-through bar (≥ 0.05 m rearward) stands. Fix the loose, do not move the bar.
- **R12 — heavy is two-handed by construction.** `Sword_Heavy_Combo` is never used (measured
  one-handed: hands never within 0.22 m). Heavy beats come from meleeLayer HEAVY.
- **R13 — no `OverhandThrow`.** Every throw is the pendulum cast or the spin-cast: hand never above
  `shoulder_y + 0.05 m`, elbow never > 0.10 m behind the head plane; the lance is never thrown.
- **R14 — UAL2 clip policy.** Raw-clean clips may be used directly: `Sword_Regular_A`, `Sword_Block`,
  `Idle_Shield_Loop`, `Shield_OneShot`. Any other clip (`Sword_Regular_B/C`, `Sword_Dash`,
  `Melee_Hook`, `Shield_Dash`, `Idle_Shield_Break`, …) only through meleeLayer's `ELB_OVER_HEAD` /
  `ELB_BEHIND` guards and only if `A-clip-elbow-audit` reads 0 violating frames after the guards.
- **R15 — UAL1 stays the locomotion source.** No switch to UAL v3. UAL2 is added only as a native
  clip source for melee, shield, climb, slide, consume and farm clips. A28 and A81 bars unchanged.
- **R16 — armor never changes** `player.speeds`, dodge timing or distance, jump, or slide length.
- **R17 — environmental manipulation, never mind control.** No Instrument ever fights for, follows,
  carries or obeys the player, and no Instrument converts another (no corruption); any such state,
  table or event fails `A-no-override` / `A-no-corruption`.
- **R18 — role SKIP rule.** A role-staged gate whose role has no live kind yet reports **SKIP with a
  named note** (never PASS) until that role's kind lands; it may not be silently re-pointed.
- **R19 — A34** is restated as a fraction: ≥ 66 % of the hero's `dyn_` bones move > 0.5° over 3 s of jog.
- **R20 — A58** surfaces: ≥ 4 distinct in the Pans at W1; ≥ 6 island-wide at W4.
- **R21 — A61** colliders: ≥ 95 % of collidable instances registered, with floors ≥ 600 (W1) and ≥ 1,500 (W4).
- **R22 — A98** sites: ≥ 8 at W1, ≥ 18 at W4, each with ≥ 2 interactables that respond.
- **R23 — A95** roster: ≥ 10 NPCs and ≥ 4 body variants at W2; ≥ 13 archetypes at W4.
- **R24 — A54** elemental tiers by size class: small 1–2, medium 3–5, large 8–12 Brine arrows to Seized.
- **R25 — A22** (only if `A-gpu-tier` picks SMAA-only): pass = SMAA present and `V20-aa-crop` passes.
- **R26 — A9** fps bar is 58 median on a quiet box (load average < 3); otherwise PENDING as Round 4's
  attribution rules; the draw bar (< 350) always grades.
- **R27 — A13** must pass 5/5 runs on Brea (the Round-4 intermittency is closed, not tolerated).
- **R28 — staging fixture and SKIP-legacy.** Role-staged gates run on `src/instruments/kinds/*` plus
  the proven POC Tiller, which instruments-core registers in W0 as the fixture `herd` kind. Legacy
  kinds are **never mapped to a role**; any gate that would stage one reports **SKIP-legacy** (counted
  like R18, never PASS). A103, A106, `A-sil40` and `A-lamp-states` stage only non-legacy kinds.
  Breakage of a legacy kind still fails `A1` / `A20b`.
- **R29 — independent visual judges.** Every V gate is graded by an orchestrator-spawned judge
  (port 5271) that did not build the content, from the shot placed side by side with its licence-clean
  reference; the verdict and its rationale are stored in the gate report JSON.
- **R30 — IP/NC removal precedes replacement.** Files with Horizon / Sony / Guerrilla / Fortnite /
  Sketchfab-fan-art provenance or an NC licence are deleted in wave 0 whatever replaces them (the four
  machine GLBs and `npc.glb` at W0a, the reference stills at W0b, `aloy.glb` by the W0 exit). Gates
  whose subject they were report **SKIP-legacy-deleted** with a named note until the replacement lands.
- **R31 — input-driven acceptance runs.** `A-first-hour`, `A-climb-1m`, `A-slide`, `A-basket` and the
  armor-verb probes drive the game through synthesized input into `input.js`, never by calling gameplay
  APIs; every objective or effect event logs its emitter stack, which must originate outside `tools/`.
- **R32 — no time dilation.** Steady and the Kit Rack keep `timeScale` at 1.0 (A53, `A-steady-breath`,
  `A-rack-no-slow`).

---

### 8.3 Orchestrator rulings (W0a exit, Oct 16 2026)

<!-- r5-ruling pool-terrain-build=accepted -->
<!-- r5-ruling rt-ledger-bar=W0b -->

- **pool-terrain-build = accepted.** The worker-pool terrain build is byte-identical to the single-thread build and builds the 1024 m island in 421–451 ms on a quiet box (single-thread 964–969 ms), so the W1 world is **1024 m (`PLAY_RADIUS` ≈ 490)**. Conditions: world-ground ships the pool in `src/world/terrain.js` at W1 (not only in the probe), and `A-world-size` times the **real cold boot** with one competing gate Chrome alive; if that run exceeds the probe bar on 3 of 5 runs, the size falls back to 860 m through `extent.js`.
- **rt-ledger-bar = W0b.** `A-rt-ledger` (render targets ≤ 170 MB, staged-fight total ≤ 450 MB) is graded at the W0b exit, after engine-gpu chooses the tier levers (DPR cap, GTAO resolution, AA). At W0a it is reported, not graded. W0a measured 340.74 MB of render targets, attributed to the byte.
- **World size = 1024 m (Oct 16, from the quiet-box probe on main).** `A-terrain-1024-probe-box` sampled a quiet box (load1 1.46, 0 other Chromes). At 1024 m the GPU delta, nav build, nav N and vertex-MB terms pass. The pool build grades 0.879 µs/vertex against the 1.271 µs budget, but the pool witness drifted 1.17× within the run (> 1.1), so the probe left the build term unjudged and wrote no size. At the slowest pool witness observed (349 ms, 1.28× the median) the build is still 1.125 µs/vertex, inside budget, so the orchestrator sets the size. **Binding at W1:** world-ground ships the pool in `src/world/terrain.js`, serves `getHeight` bilinear from the baked grid (probe condition `getHeight-from-baked-grid`), keeps the build ≤ 1.271 µs/vertex all-in, and `A-world-size` times the real cold boot with one competing gate Chrome on 5 runs; 3 of 5 over the bar → 860 m through `extent.js`.
- **R33 — what `A-carried-suite` means (Oct 18, after four gates-perf rounds).** The carried suite is a **regression guard against the Round-4 baseline**, not a demand that every Round-4 row pass. (a) **Baseline:** each carried row's verdict on the W0-day1 base (`0b75036`) is recorded once in `tools/gates/carried-baseline.json` with the run's box sample. (b) **Action rows:** a row that PASSED at baseline must PASS now; known-flaky rows (A13 under R27 and any row the baseline shows flaky) pass on 3 of 5 runs; a row that FAILED or was PENDING at baseline must not get worse and is listed, not graded. (c) **Visual rows:** only rows whose subject is a KEPT system (the animator rows V1–V4, V12–V14, the camera row V21) are graded at W0a by an R29 judge on port 5271 against licence-clean references; rows staged on content scheduled for replacement (legacy kinds, the old bowl, old HUD art, HZD stills) report **SKIP-replaced** naming their absorbing lane, and become graded when that lane re-stages them on new content. (d) **Integrity:** every graded row must come from a sealed run bound to the frames it filmed (run id in the PNG path and the report), and no report file may be overwritten by a semaphore child; a stale, forged or self-judged report fails the gate. (e) `A-gate-preludes` at W0a grades gates-perf's own files and `carried.mjs`; every other lane's gate file is graded at that lane's own exit. (f) `A9-perf-budget` uses the R26 bar; `A21` names the DPR it measured and is attributable only on a quiet box.
- **R33 (g) — shadowed rows (Oct 19).** A carried row that an active lane shadows by id (§3.3) is graded by that lane, not by `A-carried-suite`: the animator rows V1–V4, V12–V14 and the action rows A2–A19, A28, A31–A33 are graded by **hero-body on Brea** in W0b (the W0a grading of V2, V4, V12 on the old body is void). `A-carried-suite` reports them `SKIP-shadowed(hero-body)` until hero-body's exit, then grades them on the merged build. V13's staging must assert the aim state (player aiming, bow in hand) before filming, or fail by name (gates-perf).
- **R34 — A90b with the role-based workload (Oct 19).** With the IP kinds gone, the A90b workload respawns the `herd` role, i.e. the Tiller fixture. On the merged build A90b fails 2 of 2: the model clone made at `src/entities/machines/machine.js` (≈ line 162) and the auto-rig bones from `autorig.js` (≈ line 75) are retained after the corpse/wreck lifecycle (≈ 48 objects and 24 Bones held per 30 kills). **instruments-core owns the fix at W0b** (dispose the clone's geometry/materials, `skeleton.dispose()`, release the bones and the squad/site references), and its W0b exit requires **A90b-memory-attribution PASS 3 of 3 with the role-based workload** on the build merged with gates-perf's roster. Also gates-perf: `PERF_SCENARIOS` in `tools/budgets.mjs` must be self-contained (engine-gpu's gates eval them with `STAGE_PRELUDE` only), so `A-terrain-1024-probe`, `A-rt-ledger-census` and `A-rt-ledger` run on the merged tree.
- **R35 — the bow-draw elbow (Oct 22).** In correct archery form the draw elbow sits behind the head, in line with the arrow; the licence-clean draw reference measures it about 0.18 m behind the head plane. Kevin's complaint ("arm literally behind head") was the HAND and forearm swinging behind the skull on the draw and the loose, which hero-body fixed (hand 0.03–0.04 m in front of the back of the skull through the loose). So `A-draw-elbow-level` keeps the 0.10 m bar for the hand (plus "always in front of the back of the skull") and allows the elbow up to **0.20 m** behind the head plane at full draw. Moving the fist back inside the jaw to satisfy the old elbow clause is forbidden.
- **R36 — baseline failures in shadowed rows (Oct 22).** R33(b) applies to rows a lane shadows (R33 g): a row that FAILED at the W0-day1 baseline (`tools/gates/carried-baseline.json`), e.g. `A31c-clamp-framing`, is listed and must not get worse; it is not a W0b exit blocker. Rows that PASSED at the baseline (A31b, A31d, A31e, A31f) must pass on Brea: a regression there is the lane's to fix (camera margin for her taller stowed kit). A31c goes on the camera backlog (§11) with an owner named at the W1 exit.
- **R37 — V12 sprint criteria (Oct 22).** V12 is judged side by side against the licence-clean `reference/r5/gates-perf/run-side.jpg`: torso lean 10–30° (hip to neck), the stance leg near vertical at contact with the swing thigh forward, arms bent and swinging fore-aft beside the body (never crossing the midline, never T-rex or prancing — Kevin's bar). The old "25–45° lean" and "front thigh toward horizontal" clauses are replaced.
- **R38 — cross-lane PENDING clauses at W0b (Oct 22).** `A-hero-draws`: Brea's own measure (≤ 4 draws, ≤ 2 casters, ≤ 20 k tris for body + outfit + kit) is binding at W0b; the held-weapon clause (≤ 5 draws / ≤ 2 casters with the Sabina bow in hand) is graded at armory's W1 exit. `A-input-actions`: the actions, pad entries and rebind persistence are binding at W0b; the settings-list clause is graded at shell-ui's W2 exit. Reported PENDING clauses under this ruling are not failures.
- **R39 — merge order for the hero asset swap (Oct 22).** The orchestrator merges pipeline's `SPECS.hero` swap (`/models/hero/brea.glb` and the hero outfit, stow-kit and UAL2 rows) in the same merge window as hero-body's `aloy.glb` deletion, pipeline first; `A-assets-tracked` is graded on main after both.
- **R30 completion.** The orchestrator deleted the four IP machine GLBs (`watcher`, `sawtooth`, `behemoth`, `thunderjaw`) on main after instruments-core's code removal and pipeline's loader rows merged; `aloy.glb` goes at hero-body's W0b exit as planned.

## 9. GATE SPEC — the literal acceptance bar per lane

Same contract as `tools/gates.config.mjs`: **action** gates run JS in page context with
`__CTX__`/`__GAME__` and resolve `{ pass, detail }` (console error during a gate = FAIL; missing API =
`{ pass: null }` → PENDING; R18 / R28 / R30 SKIPs are reported, never counted as PASS). **Visual**
gates capture a deterministic screenshot via a `setup` + `settle` recipe and are graded against written
criteria **by an independent judge** (R29). Staging always comes from `tools/gate-roster.mjs`
(roles → `ctx.machines.roles`), `tools/gate-places.mjs` (`ctx.props.gatePlaces`) and animator-published
bone and chain names (`animator.b.*`, `animator.chainOf(cls)`); **no gate names a species, a coordinate
or a bone literal.**

**Round-4 gate disposition.** All 248 Round-4 gates keep their inventory Appendix B verdict. DIES
gates are deleted in W0a. CARRY and RESTAGE gates are re-staged by gates-perf in W0a (roles, places,
animator-published names, licence-clean references) into **`tools/gates.r5.carried.mjs`**, which runs at
every wave exit (`A-carried-suite`) and is never emptied. The lanes below shadow rows by id while they
are active, then hand them back (§3.3):

| Round-4 source | shadowed by |
|---|---|
| `gates.config.mjs` animator rows (A2–A19, A28, A31–A33, V1–V4, V12–V14) | hero-body |
| `gates.config.mjs` core / core-platform rows (A1, A9, A20–A22, V20) | gates-perf, engine-gpu |
| `gates.config.mjs` machines rows (A6–A8, A44–A48, V5, V6), `machine-rig`, `machines-expansion`, `machine-ai`, `machine-ai-expansion` | the per-kind block (`tools/gates.r5.kind-block.mjs`; species lanes run it) |
| `gates.config.mjs` combat rows (A4, A5) | armory |
| `gates.config.mjs` hud / environment rows (A10, V7–V10) | shell-ui, world-sky, world-ground |
| `anim-core` (A26, A27) | hero-body (A26 registry probe), instruments-core (A27 machine half) |
| `core-platform`, `-followup2`, `-gtao`, `memory`, `spatial` (A23, A23b, A25, A25b, A25c) | engine-gpu, gates-perf; V21-camera-cover → hero-body |
| `player-anim`, `player-control` | hero-body |
| `player-melee` | melee |
| `combat`, `combat-memory` | combat-kit |
| `npc` | settlements |
| `progression`, `progression-expansion` | progression |
| `shell-hud`, `shell-menus`, `focus-items` | shell-ui |
| `studio` | brand (W4) |
| `world-ground`, `world-light`, `world-props`, `world-props-expansion` | world-ground, world-sky, world-props |
| `audio` | audio |

The bullets below are the gates each lane must make PASS (new gates, and Round-4 gates whose bar or
staging changes); carried Round-4 gates not repeated below run in `carried.mjs` at their Round-4 bars.

**Global green list (every wave exit; the orchestrator on port 5270, quiet box, one Chrome):**
`A1-boot-clean`, `A9-perf-budget` (R26), `A20b-no-system-errors`, `A21-real-draw-calls`,
`A90-memory-stability`, `A90-memory-stability-expansion`, `A90b-memory-attribution`,
`A90-rig-reclaim`, **`A90-abs`**, `A-alloc-rate`, `A-vram-ledger`, `A-ID-ip-assets-gone`,
`A-licence-manifest`, `A-assets-tracked`, `A-no-horizon-terms-player` (ratchet),
`A-no-horizon-terms-code` (allowlist cap), `A-reach-all-sites` (on the W0 stub values until the W1
exit), `A-port-guard`, `A-carried-suite`, and from the W2 exit `A-legacy-gone` (20 gates). A90 bars
unchanged: heap < 25 %, geometries ≤ +40, textures ≤ +8, scene objects ≤ +60 (`-expansion`: objects
≤ +600, heap ≤ +25 %; `-rig-reclaim`: geo ≤ +40, tex ≤ +30, ≤ 1 per live machine).

- **A90-abs** — after the A90 run, forced GC; then the staged fight for 60 s → pass: post-GC JS heap
  **≤ 450 MB**; the Chrome GPU-process footprint (CDP `SystemInfo.getProcessInfo` + process memory
  metrics) **≤ 1.5 GB** at the staged fight; both values written to the report every wave.
- **A-reach-all-sites** — teleport the player to every `sites.js` coordinate, step 1 s → pass: final
  position within 1 m of the target (no clamp); `nav.path(REST → site)` non-null for every land site;
  `machines.spawn` at each Pans site keeps its patrol route within 5 m of the request; the nav build
  ≤ 150 ms at N ≈ 491.
- **A-legacy-gone** (from W2 exit) — pass: `src/entities/machines/legacy.js` is absent or exports
  0 rows; 0 imports of any file deleted in §6; 0 legacy GLBs under `public/models/`.

### pipeline (W0a, W0b)
- **A-ID-ip-assets-gone** — `read every *.glb/*.gltf under public/ with gltf-transform; read every MANIFEST*/LICENSES.json` → pass: 0 GLBs whose `asset.extras` / copyright / generator match `/sketchfab|horizon|hzd|hfw|fortnite|guerrilla|sony|aloy/i`; 0 licence strings matching `/\bNC\b|NonCommercial|\bND\b|NoDerivatives/`; every GLB carries `extras.provenance.licence` ∈ {`CC0-1.0`, `CC-BY-4.0`, `CC-BY-3.0`, `project-original`}. Passes from W0a (R30 deletions). A working-tree guarantee only (§11, decision 2).
- **A-licence-manifest** — `node tools/licences/check.mjs` → pass: every file under `public/` matches exactly one `LICENSES.json` row; every third-party asset row has `source_url`, the `archive_sha256` recorded by the W0b re-fetch, and a `retrieved` date; pre-Round-5 files kept until their deletion wave carry a `legacy-r4` row with an established CC0 / CC-BY / project-original source; shipped code (three, three-mesh-bvh, the meshopt decoder) has `MIT` rows; every CC-BY row's `attribution` string appears verbatim in README "Credits" and in the rendered in-game credits; `du public/` ≤ 60 MB.
- **A-assets-tracked** — for every path referenced by a SPECS row or a `LICENSES.json` row → pass: `git check-ignore` reports 0 of them as ignored (`.gitignore` re-includes `public/models/**/*.glb`); `*.baked.glb` and `*.orig` under `public/models/**` stay ignored; `models-staging/r5-src/` is ignored.
- **A-build-deterministic** — `npm run build:assets` twice into two scratch dirs → pass: byte-identical SHA-256 for every generated GLB and WebP; wall time ≤ 180 s; peak RSS ≤ 2 GB; run with the network disabled (sources come from `models-staging/r5-src/` only).
- **A-build-only-lane** — `npm run build:assets -- --only <lane>` for each lane → pass: writes only under that lane's output paths (mtime audit of `public/`); ≤ 60 s each.
- **A-sources-staged** — pass: `models-staging/r5-src/` holds the trimmed UBC, MCO, UAL1, UAL2, scan and font sources (≤ 150 MB) whose archive SHA-256s match `LICENSES.json`; the transient zips are gone from disk.
- **A-specs-data-driven** — a fixture SPECS row and its file are removed in a scratch worktree → pass: `A1` and `A20b` pass with 0 code edits.
- **A-loader-fixes** — `assets.loadExtra` a quantised generated GLB, then fold it through `rig/lod.js` → pass: dequantised position error ≤ 1 mm vs the float source; no vertex moves > 1 mm in the fold; lamp meshes `castShadow === false`; reads go through `getX` (meshopt-interleaved 1-byte attributes correct).
- **A-human-bind** — `bind Brea through her rig profile` → pass: 52/52 UAL pairs, `missingSource` and `missingTarget` empty, missing animator keys ⊆ {`neck2`, eyes, lids}.
- **A-glb-budget** — `read extras.r5Size / stats of every generated GLB` → pass: 0 assets over their §4.1 class budget (tris, materials, **bones**, file size).
- **A-poc-promoted** (W0 exit) — pass: no `?poc=human|creature` code path in `src/main.js`; `tools/r5-poc/` and `public/models/r5-poc/` absent; `?poc=biome` still serves `A-gpu-tier`.
- must stay green: global list.

### engine-gpu (W0a probes, W0b)
- **A-gpu-tier** — quiet box (load avg < 3), 1600×900, shipped default tier; empty frame, `?poc=biome` Pans vista → pass: empty-frame GPU median ≤ 7 ms, vista GPU median ≤ 13 ms, median fps ≥ 58, p95 frame ≤ 20 ms; the chosen levers recorded in `docs/ROUND5-ENGINE.md` with before/after numbers.
- **A-terrain-1024-probe** — `build a 1024 m heightfield at MESH_SEGS 686 in tools/r5-probes/terrain1024.js` + a navgrid at R = 492 → pass: terrain build ≤ 600 ms, vertex buffers ≤ 24 MB, A9 GPU delta vs the 720 m mesh ≤ +1.5 ms, nav build ≤ 150 ms; else the fallback size (860 or 720 m) and its `PLAY_RADIUS` are written into the report as the W1 values.
- **A-rt-ledger** — enumerate every render target at the shipped tier, DPR 1.25, 1600×900 (CSM cascades, sun, MSAA scene RT, GTAO, bloom chain) → pass: bytes per target recorded in `docs/ROUND5-ENGINE.md` and `tools/budgets.mjs`; the render-target total ≤ 170 MB; textures + RTs + geometry ≤ 450 MB at the staged fight.
- **A22-msaa** (R25 if SMAA-only) — pass: `(MSAA samples ≥ 4 && SMAA)` or, under R25, SMAA present and `V20-aa-crop` passes.
- **A108-ao-periodicity** (re-staged on the Pans POC) — pass: no autocorrelation peak > 0.15 at lags 2–32 px with GTAO on, every tier where GTAO is enabled, DPR 1 and 2.
- **A109-ao-distance-fade** (re-staged) — pass: AO at ≥ 150 m ≤ 10 % of its 5 m value; far luminance within 3 % of GTAO off.
- **V20-aa-crop** — shot: Pans POC, 4× nearest crop of a basalt-column edge. Pass: intermediate pixels on edges; FAIL on stair-steps.
- **V33b-no-ao-lattice** — shot: Pans POC four yaws + a 2 m ground close-up at tiers high/ultra. Pass: no screen-locked lattice; AO reads as soft contact darkening only.
- must stay green: global list, `A20-frame-loop-survives`, `A22b-fov-recompile`.

### brand (W0-day1, W0b, W4)
W0-day1:
- **A-identifiers-renamed** — `grep src/ tools/ index.html` → pass: 0 hits for the §7.1 "from" column (events, ctx members, prefixes, storage keys, `assets.models.aloy`).
- **A-extent-refactor** — the old map before and after the day-1 pass → pass: every replaced extent numerically identical (330 / 312, 332 / 324, 318, 315, 310 ×2, 296, 285, now `PLAY_RADIUS` + offset from `extent.js`); grep finds 0 of those literals left in kept code; the path hash of 20 fixed `nav.path` queries identical; A3 and A13 unchanged.
- **A-single-rest** — pass: grep finds 0 numeric camp literals in `src/`; spawn and death-respawn land within 3 m of `REST`; the Instrument no-spawn ring is centred on `REST_SITE`. Re-run by world-ground at the W1 exit with `REST` at Saltrow.
W0b:
- **A-no-horizon-terms-player** — `tools/lint/namecheck.mjs --player`: the union lexicon (A's 331 + B's 235 + 46 phrases + Brittle, Impact, Tear, Frost, Lens, Shards, Stalker, Watcher, Grazer, Charger, Burrower, Rollerback, Saltbite, Call of the Mountain, Camp) with exact / substring ≥ 5 / edit ≤ 1 rules, over the **rendered DOM text** (title, loading, HUD, every hub tab, every tip and tutorial card, dialogue, credits), every content id (kind, role, item, quest, place, faction, event, audio set), every key of every exported content table, and `public/**/*.{json,md,txt}` → pass: count ≤ the W0b ratchet; non-increasing every wave; **0 at W4 exit** (allowlist: bible §10.4 GENERIC nouns).
- **A-no-horizon-terms-code** — `namecheck.mjs --code` over identifiers and strings in `src/**`, `index.html`, `tools/**` (excluding `tools/lint/**` and comments) → pass: every hit matches an entry of `tools/lint/engine-allow.json`; no entry exceeds its count cap; the total is non-increasing every wave.
- **A-fonts-licensed** — pass: `public/fonts/` holds only Bodoni Moda, IBM Plex Sans Condensed, IBM Plex Mono (woff2) and one `OFL.txt` per family; each has a `LICENSES.json` row `OFL-1.1`; computed styles of the wordmark, a HUD label and a numeral resolve to those families; 0 references to Julius, Rajdhani, Chakra Petch, Michroma, Orbitron in CSS/JS.
- **A-storage-keys** — `save, change settings, open the map, dismiss a tip, reload` → pass: every localStorage key written matches `/^cal\..*\.v5$/` (v6 for the save after W3); a planted `hzc.save.v4` is ignored (fresh start, 0 console errors). The W0-era v5 plant is re-run by `A-items-ids` (W2: loads, unknown ids dropped) and `A-save-schema` (W3: refused).
- **A-ui-words** (brand surfaces at W0; all surfaces at W2 via shell-ui) — pass: rendered strings contain none of `/\b(tear|impact|brittle|focus|override|concentration|silent strike|critical (strike|hit)|datapoints?|shards?|medicine|tallneck|cauldron|hunting grounds?|tag(ged)?|machines?|camp)\b/i` (the word "machine" is replaced by "Instrument" in UI).
- **V-logo** — shot: title screen after settle at 1600×900, plus a 4K crop of the lockup. Pass: CALIMA in Bodoni Moda caps; the I is a plumb line whose dot is the **full, unclipped** spark above the word; one hairline datum rule under the word with a small coral broad-arrow under the I; FAIL on any second line of text, tagline, "A CLAUDE GAME", spark on/under/clipped by a rule, reflection dashes, thin wide-tracked caps, or the words HORIZON / ZERO.
- **V38-title** (re-staged) — shot: title screen after settle. Pass: one logo over a live **Pans vista in calima** (salt grid, white surf on black sand, coral disc sun), vertical menu; FAIL on a double logo, a tall walker silhouette on a low-sun skyline, or live lava in frame.
- **V-loading** — shot: loading screen at 40 % and 100 %. Pass: the datum rule fills as progress; copy "Reading the benchmarks…"; no "Waking the machines".
W4:
- **A-comment-scrub** — the comment-only scrub of frozen files → pass: the esbuild-minified output of every touched file is byte-identical before and after; 0 lexicon hits remain in comments under `src/**` except the code allowlist.
- **A-credits** — pass: the rendered credits list every `LICENSES.json` row that needs credit (incl. the MIT code rows); README "Credits" text equals the generator output byte for byte.
- **A79c-lens-stack** (re-staged) — pass: auto-focus distance equals the camera-to-`animator.b.head` distance ±2 %.
- **A78b-cast-pose-set** (re-staged) — pass: every pose in Brea's pose list and every live kind's cast states apply and hold 1 s.
- **V79-photo-portrait** — shot: photo mode portrait. Pass: Brea meets the lens; wrap, topknot, salt-line, brow scar and ∴ readable; no Aloy strings in the studio UI.
- **V-media-refilm** — pass: every `docs/media/*.png` and README image depicts the current build; none shows deleted content.
- must stay green: global list, `A70c-title-flow`, `A72-settings-persist`, `A72b-accessibility`.

### hero-body (W0b)
Kept movement, re-staged on Brea (bars unchanged unless a ruling says otherwise):
- **A2-dodge-displacement** — pass: horizontal displacement 1.5–9 m within 1 s; animator recovers.
- **A3-sprint-speed** — `sprint on gatePlaces.openGround` → pass: 0.9–1.15 × `player.speeds.sprint` in sim time.
- **A11-idle-alive** — pass: pelvis/hand max world path > 8 mm over 5 s.
- **A12-clip-driven** — pass: mixer advancing; `Sprint_Loop` (UAL1, R15) at weight **≥ 0.6** at canon sprint.
- **A13-no-skate** — pass: stance-window XZ drift ≤ 0.06 m at full sprint, **5/5 runs** (R27).
- **A15-foot-flat** — pass: idle and aim foot pitch within 5° of bind; heels not floating.
- **A18-slope-conform / A18b-slope-conform-moving** — `gatePlaces` 10/20/30° faces → pass: Round-4 bars (planted soles on the surface, no float/sink).
- **A28-run-cadence** — pass: ≥ 2.6 steps/s and flight fraction ≤ 0.40 on a plain-W run.
- **A28b-canon-speeds / A81-canon-speed-bands** — pass: walk 1.5, crouch 1.4, jog 5.0, sprint 6.8 (sim time), ClipLibrary mirror equal.
- **A31-aim-strafe-skate** — pass: drift ≤ 0.06 m left and right under aim, speed > 0.9 m/s.
- **A31b-aim-strafe-skate-player-anim** — pass: drift ≤ 0.06 m both ways from a standing start, a backpedal and a run; legs never cross; side-step cadence.
- **A31g-direction-change-skate** — strafe left→right and right→left reversals under aim, 10 each → pass: the first stance after every reversal drifts ≤ 0.08 m (Round 4 left 0.05–0.45 m ungated).
- **A31b-no-ghost-without-occluder / A31c-clamp-framing / A31d-hillside / A31e-hillside / A31f-hillside** — `gatePlaces.hillside38`, head from `animator.b.head` → pass: Round-4 bars (opacity ≥ 0.98, lens ≥ 0.85 m from pivot, head in frame, |NDC x| ≤ 0.8 on ≥ 90 %).
- **A32-look-up / A32b-lookup-no-ghost** — target: a static gondola dummy at 10 m and 16 m altitude until the Sonde lands → pass: pitch ≥ 60° aiming, standing and crouched; target on the reticle; opacity ≥ 0.98.
- **A33-rig-finite** — pass: no non-finite bone or spring over the teleport/turn/sprint/aim/dodge stress run (counts read live).
- **A33-hair-bounce** — `chainOf('hair')` = `dyn_hairKnotTail` → pass: world-Y peak-to-peak ≥ 0.04 m at sprint, locked to footfall cadence ±15 %.
- **A34-chains-driven** (R19) — pass: ≥ 66 % of `dyn_` bones move > 0.5° over 3 s of jog.
- **A36-hit-react-visible** — pass: a 14 hp hit leans the torso ≥ 12°, decays over > 0.45 s, a hit clip becomes dominant (weight ≥ 0.6).
Bow draw on the new body (all at **camPitch −0.55 / −0.4 / 0 / 0.75**; −0.55 is the up-aim that was off the ray in Round 4):
- **A-lmax-solve** — pass: each bow's `pull` equals the Lmax solution on Brea ± 0.01 m; arrow length = pull + 0.20 ± 0.02 m; values published in the rig profile.
- **A16-draw-anchor** — every pitch above and while strafing → pass: drawStrength > 0.9, nock-to-hand ≤ 0.09 m, elbow not above the shoulder, headClear ≥ 0.98; the arrow launch direction within 0.3° of the crosshair ray at each pitch.
- **A17-draw-beats** (R11) — pass: hand-to-quiver minimum ≤ 0.18 m; loose rearward follow-through ≥ 0.05 m; flourish ≥ 8 **sim** frames; draw during flourish ≤ 0.02.
- **A32-draw-ramp** — pass: string hand on the nock for the whole ramp; hand not inside the head at full draw.
- **A35-cheek-anchor** — `drawStrength 1.0` at the four pitches → pass: |hand_r − head| 0.10–0.16 m (UBC `Head` sits at the skull base like Aloy's; the band is re-verified by measuring the jaw-corner point), hand behind the face plane, bow-arm elbow 165–172°, hands ≥ 0.45 m apart.
- **A-draw-elbow-level** — full draw, four pitches + strafing → pass: draw elbow height within [shoulder − 0.03, shoulder + 0.05] m; elbow ≥ 0.05 m behind the hand along the arrow axis; bow arm ≥ 0.04 m clear of the chest surface; the draw HAND never more than 0.10 m behind the head plane and always in front of the back of the skull; the draw ELBOW at most 0.20 m behind the head plane (R35).
- **A-wrap-clear** (M10) — full draw cycle from a sprint-stop at four pitches → pass: **every `dyn_` chain** (wrap tail, knot tail, sash end, alidade cord) ≥ 0.05 m from the draw hand/forearm capsule every frame; the spring solver reports the hand capsule active.
- **A-alidade-pose** — raise the alidade from idle, jog, crouch → pass: tube within 0.03 m of the right eye; elbow below the head and in front of the head plane; returns in ≤ 0.3 s.
- **A-run-arms** — sprint 4 s, sampled every frame → pass: wrist-to-torso-midline lateral ≥ 0.10 m (no crossing); wrist below `shoulder_y − 0.25 m` (no T-rex); fore-aft hand range ≥ 0.25 m per cycle; **pelvis vertical oscillation ≤ 0.08 m peak-to-peak and the knee joint never above the hip joint** (no prancing).
Traversal, control and the published surface:
- **A-climb-1m** (R31) — mantle a 1.0 ± 0.1 m ledge from a walk and a jog, and the trig-pillar steps → pass: on top ≤ 1.2 s per ledge; both hands ≤ 0.05 m from the ledge edge during the pull; no float or sink > 0.05 m after; pillar top ≤ 3 s.
- **A-slide** (R31) — run onto cinder faces at 30° and 40°, then onto a 35° non-cinder face → pass: a slide starts on cinder > 28° and not on the 35° non-cinder face; speed ≤ `SLIDE_TERMINAL`; it exits on input within 0.3 s; the planted foot stays within 0.08 m of the surface.
- **A-player-mods** — set each `player.mods` field, then exercise it through gameplay (a 5.5 m drop, a knockdown hit, 20 s in a fog bank, a jog on ash, an aim) → pass: each field changes exactly its behaviour and resets on clear; `player.speeds` deep-equals canon throughout (R16).
- **A-ride-hook** — `player.ride` on a fixture 40 m path → pass: she stays seated ≤ 0.05 m from the seat socket; dismount on input; no leaked objects (geometries and listeners at baseline).
- **A-input-actions** — pass: `plant`, `cast`, `tool`, `slot1..4` exist with pad entries, appear in the settings rebind list and persist a rebind across a reload.
Identity and draws:
- **A-face-delta** — compare Brea's head vertices to stock UBC at bind → pass: **≥ 6 mm on ≥ 5 of the 7 landmarks**; eye-socket offset ≤ 0.5 mm; the profile-silhouette IoU vs stock UBC at 1.2 m ≤ 0.92.
- **A-brea-contrast** — render Brea (default outfit, noon trade) over salt crust and over black sand/lapilli → pass: silhouette mean luminance contrast ≥ 3.0:1 on salt; on black sand ΔE2000 ≥ 20 and ≥ 15 % of silhouette pixels at ≥ 3:1.
- **A-hero-draws** — the real W0 loadout (merged outfit, merged stow kit, v0 lance/quiver/bracer, Sabina blockout) → pass: ≤ 5 main draws, ≤ 2 shadow casters (× 3 cascades), ≤ 40 k tris with each §4.1 cap met.
- **A-outfit-merge-dispose** — equip/unequip the default outfit and the bracer/Windwall socket swap ×6 → pass: geometries, textures and **skeletons** back to baseline (±0).
Visual (against `reference/r5/hero/**` licence-clean references; R29 judge):
- **V1-sprint-frame / V2-idle-frame / V3-crouch-stalk / V4-aim-anchor** — Pass: Kevin's arm rules (idle hands relaxed; sprint arms fore-aft beside the body, no T-rex, no prance, no crossing); planted feet.
- **V12-sprint-vs-reference** — side sprint vs a licence-clean running photo. Pass: torso drive, full leg extension, arm swing beside the body.
- **V13-aim-strafe / V14-slope-contour** — Pass: Round-4 criteria with Brea.
- **V22-chase-framing** — Pass: Brea fills ≥ 55 % of frame height, lens at head level (vs a licence-clean third-person reference).
- **V23-secondary-motion** — 3 frames 80 ms apart at sprint. Pass: wrap tail, knot tail, sash end and alidade cord in visibly different positions; FAIL if any reads rigid.
- **V24-draw-vs-reference** — full draw, side, zoomed, vs a licence-clean archery side photo. Pass: knuckle at the jaw corner, fletching near the mouth corner, forearm in line with the arrow, elbow level or back, ∴ visible, wrap tail clear of the hand.
- **V-brea-one-glance** — black-fill silhouette front/side/back at 64 px tall, **default loadout**. Pass: 5 of 5 cues (violet wrap + topknot, wrap tail left-rear, crescent bracer, lance diagonal with the bob-shaped butt, cane quiver); no braid, no mane.
- **V-brea-face** — 3-angle sheet at 1.2 m. Pass: salt-line, brow scar and ∴ read; the face is not the stock UBC face; expression readable around the salt-line.
- **V-traversal** — ledge climb, a cinder slide and a basalt-column stair, side views. Pass: hands on the ledge, body over the hands at the top, slide posture low with the arms out for balance, no float.
- must stay green: global list.

### instruments-core (W0a, W0b)
- **A90b-memory-attribution (role-based Tiller workload)** — W0b exit (R34) → pass: 3 of 3 runs on the build merged with gates-perf's roster; 0 offenders at `machine.js` model clone or `autorig.js` bones.
- **A-no-override** — pass: `ai/override.js` absent; `tables.OVERRIDE` undefined; enumerating every FSM state of every live kind never yields `overridden`/ally/mount; 0 matches of `/override-node|overridden|\bOVERRIDE\b|overrideNode|cauldron-override/` in `src/**` (the animation word "override" is not matched); 0 code paths where an Instrument targets another Instrument for the player; the W0a diff on the 14 granted files contains deletions only.
- **A-no-corruption** — pass: `_updateCorruption`, `corrupt`, `uncorrupt` and `ECOSYSTEM.corruption` absent; no live kind ever has `corrupted === true` over a 10-min staged run.
- **A-legacy-collapse** — pass: every legacy kind is reachable only through `machines/legacy.js` (0 legacy imports elsewhere); deleting one legacy row and its files in a scratch worktree passes `A1` and `A20b` with 0 other edits.
- **A-lamp-states** — **rendered lamp pixels sampled at 15 m**, per non-legacy kind (W0: the Tiller fixture) × per AI state → pass: lamp colour within ΔE2000 ≤ 3 of its token (calm `#F2EAD3`, wary `#B5E61D`, hostile `#FF2D8C`, dark `#3B3A36`); iris area 100/50/20 % (consecutive ratio ≥ 2); rhythm 0 / 1 / 4 Hz ±15 %; consecutive states ΔE ≥ 25; beam visible in wary/hostile when fog density > 1.2 or night, never in calm.
- **A-lamp-canon-distance** — every lamp, beam, scanner and compass-pip colour token (JS + CSS) → pass: ΔE2000 ≥ 20 from `#38c6ff`, `#ffb31f`, `#ff2413`, `#19ffd0` and `#9B6BFF`; no lamp-state token within ΔE 10 of a scanner highlight token.
- **A-beams-one-draw** — 8 wary Instruments (Tiller fixtures at W0) in fog → pass: beam draw calls === 1; spawn/kill ×3 then dispose returns geometries and materials to baseline.
- **A-roles-published** — pass: `ctx.machines.roles` maps {sentry, herd, swarm, flanker, heavy, keeper, duelist, artillery, support, spotter, ambusher, colossus} to a live non-legacy kind or `null` + note (R18; W0: only `herd` → Tiller fixture); no legacy kind is ever mapped (R28); no role id matches `/charger|burrower|grazer|stalker|watcher|apex|scout/i`; `tools/gate-roster.mjs` resolves every role.
- **A-kind-registration** — a fixture kind module dropped into `src/instruments/kinds/` → pass: it registers (spec, class, tables, audio set, spawn rows) with 0 edits to kept files; `cfg()` returns its table rows merged over `default`.
- **A-perception-weather** — `setWeather('calima')` then a sight test on the Tiller fixture → pass: sight range ×0.5 ±5 % in sim; `trade` 1.0; the `detectMul` hook scales fill rate (×0.5 probe).
- **A-perk-hooks** (R31; each with a negative control) — pass: `perception.detectMul = 0.5` halves the calm fill rate at 20 m (×1.0 without); `perception.flagDuration = 3` ends a Flag at 3 ± 0.1 s (8 ± 0.1 s without); a noise filter that drops footsteps yields 0 footstep stimulus events over a 10 s jog (> 0 without).
- **A-uv1-survives-fold** — fold a generated GLB with a decal `uv1` through `rig/lod.js` → pass: `uv1` present after the fold and within 1e-4 of the source; groups that do not want it still drop it.
- **A-vfx-palette** — spawn every particle and glint emitter (hits, sparks, deaths, glints) → pass: no particle colour within ΔE2000 15 of `#38c6ff` or `#19ffd0`; the `rig/fx.js` default spark is not blue.
- **A90-rig-reclaim** — pass: bars unchanged, **5/5 runs**.
- **A-kind-block-file** — pass: `tools/gates.r5.kind-block.mjs` exports the per-kind block parameterised by kind and runs green on the Tiller fixture (fidelity-only clauses report SKIP-fixture).
- must stay green: global list, `A37-stealth-approach`, `A39-detection-curve`, `A43-corpse-lifecycle` (staged on the Tiller fixture, R28).

### gates-perf (W0a, W0b)
- **A-gate-preludes** — pass: 0 species literals and 0 old-map coordinates in `tools/gates*.mjs` (the DIES set is deleted); every re-staged gate resolves roles via `gate-roster` and places via `gate-places`.
- **A-gates-no-hero-literals** — pass: 0 matches of `/hand_r_045|hand_l_014|head_0104|dyn_hairBack|dyn_skirtA|dyn_quiverMain|aloy/i` in `tools/gate*.mjs` at W0, and **in all of `tools/` at the W3 exit** (after audio's recipes are regenerated); gates read `animator.b.*` and `animator.chainOf()`.
- **A-gates-autodiscover** — pass: `gates.config.mjs` imports every `tools/gates.r5.*.mjs` by pattern; adding a lane file needs no config edit; a lane row shadows a carried row by id.
- **A-carried-suite** — pass: `tools/gates.r5.carried.mjs` holds every CARRY and RESTAGE Round-4 gate of inventory Appendix B; at every wave exit each is PASS, R18 SKIP with a named note, SKIP-legacy (R28) or SKIP-legacy-deleted (R30), and none is PENDING without a Round-4 attribution.
- **A21-real-draw-calls** (re-cast) — `PERF_SCENARIOS` by role: `vista` (spawn), `herd` (herd ×6 + sentry ×2 at `gatePlaces.herdSite`), `staged-fight` (colossus, heavy, artillery, duelist, sentry, herd, flanker, spotter; R18 fallbacks named); at the W3 and W4 exits also every `gatePlaces.vistas.*` biome vista and the Kiln Yard assault → pass: draws ≤ 350, triangles ≤ 6.5 M, median GPU ≤ 14 ms at the `A-gpu-tier` tier, p95 frame ≤ 20 ms (PENDING on a loud box per Round-4 attribution).
- **A9-perf-budget** (R26) — spawn vista → pass: draws < 350; median fps ≥ 58 on a quiet box.
- **A-alloc-rate** — CDP sampling heap profiler over 10 s of the staged fight + 10 s of sprint-and-draw → pass: steady-state allocation attributed to `src/**` ≤ 64 KB/s; no single `src` function > 4 KB/s; post-GC heap slope ≤ 0.
- **A-vram-ledger** — staged fight → pass: estimated texture GPU bytes (dimensions × format × mips over `renderer.info` textures) ≤ 160 MB; render targets ≤ the `A-rt-ledger` cap (≤ 170 MB); geometry buffers ≤ 120 MB; the sum ≤ 450 MB.
- **A90-abs** — as in the global list.
- **A-unattributed-cap** — staged fight, hide each registered owner in turn → pass: draws from scene children with no registered owner are recorded at W0 (the cap), are ≤ 30 by the W2 exit and non-increasing every wave.
- **A-port-guard** — pass: `node tools/gates.mjs` and `tools/screenshot.mjs` with no `--port` and `SHOT_PORT` unset exit non-zero before opening any socket; `--port 5173` is refused; a port outside 5250–5271 is refused; `lsof` shows 0 connections to :5173 from gate processes over a full lane run.
- **A-chrome-semaphore** — start 4 gate runs at once → pass: at most 2 headless Chromes alive at every 100 ms sample; the lockfile is released on exit and on kill; the preflight refuses to launch (non-zero exit, clear message) when free disk < 3 GB or `memory_pressure` free < 25 % (thresholds simulated through env overrides).
- **A-reference-clean** — pass: `reference/` holds no file sourced from Guerrilla/Sony/HZD/HFW; every file has a MANIFEST row with licence ∈ {PD, CC0, CC-BY (attributed), own photo}; SA or unclear sources are stored as URL only; V12/V22/V24/V46/V48 point at `reference/r5/**`.
- **A-reference-set** — `tools/r5-refs/fetch.mjs` queries the Wikimedia Commons API filtered to PD / CC0 / CC-BY → pass: every V gate in every lane file names ≥ 1 reference file under `reference/r5/**` with a MANIFEST row (author, source URL, licence, retrieved date).
- **A79-runner-verdict-line / A80-chrome-profile-hygiene** — carry.
- must stay green: global list.

### melee (W1, W2)
W1 — the lance on Brea:
- **A100-lance-holster** (R10) — idle, run, sprint, crouch, bow drawn, dodge → pass: parented to a spine socket; midpoint ≤ 0.30 m from the upper-back centre; shaft 30–60° from vertical; blade > 0.20 m and ≤ 0.70 m above the right shoulder; tip > 0.15 m right of the spine; wrap-tail and knot-tail clearance ≥ 0.06 m; no intersection with bow or quiver.
- **A-stow-clearance** — sprint 4 s, crouch-walk, dodge, and a 24-yaw chase-camera sweep → pass: every stowed item's lowest point ≥ 0.05 m from both calf/heel capsules every frame; ≥ 0.05 m above terrain while crouched; no stowed item crosses the boom segment (pivot → lens) by > 0.02 m; stowed items cover ≤ 8 % of the head's screen-space box.
- **A101-lance-grip** (R1, R5, R8; the deciding clauses of inventory M13) — ready + 6 samples of each light and the heavy, first swing from holstered → pass: **knuckleToAxis ≤ 0.03 m** (haft off the prop's world matrix vs the live `index_01_r`→`pinky_01_r` line); **bladeAhead > 0** (tip in front of the grip along her facing); **buttToWrist** = grip fraction 0.15–0.28 of the shaft at contact; handSweep ≥ 45° and shaftSweep ≥ 45° per beat; haft-vs-live-knuckle-line ≤ 3°; two-handed beats' left hand ≤ 0.05 m from the shaft; bow and lance never both in hand. `palmToAxis` and `gripAngle` are construction identities and are reported only.
- **A102-melee-body-motion** — light ×3 then heavy, standing → pass: hand travels ≥ 1.2 m per light; spine/pelvis yaw ≥ 15°; root steps 0.25–0.8 m; ≥ 3 distinct arcs; tip never teleports > 0.5 m/frame.
- **A103-melee-contact-sync** (R7, R9) — every non-legacy kind, flat and ≤ 25° slope rows → pass: `melee-hit` inside the strike phase; tip ≤ 0.15 m from the hull at contact; blade tip above terrain on slopes; any unreachable kind named.
- **A104-melee-self-clear** (R9) — every frame of every swing incl. heavy recover → pass: shaft ≥ 0.12 m from head/neck/spine bones; forearm crosses the midline ≤ 0.10 m; elbow ≤ head + 0.25 m on lights; recover forearm ≥ 0.10 m off the belly axis; wrap/knot tails ≥ 0.06 m from the shaft.
- **A105-melee-while-moving** — swing while jogging, 13 runs → pass: planted-foot drift ≤ 0.08 m on 13/13; horizontal speed ≥ 60 % of un-swinging; upper-body mask blend active.
- **A106-melee-approach-immovable** (R4, R6) — every non-legacy kind → pass: no root jump > 0.15 m/frame; total release displacement ≤ 0.10 m; planted-foot drag ≤ 0.08 m; body capsule ≥ 0.05 m from every hull capsule.
- **A107-draw-arm-path** (R8) — draw and holster from idle, jog, sprint → pass: elbow never above `head_y + 0.05 m`, never > 0.10 m behind the head plane; every clause evaluates ≥ 1 frame (M4).
- **A-heavy-two-hand** (R12) — Counterweight heavy, windup / contact / follow → pass: both hands ≤ 0.05 m from the shaft; the heavy action contains no `Sword_Heavy_Combo` track.
- **A-melee-latency** — at 60 fps sim → pass: with the lance in hand, LMB → strike phase ≤ 0.30 s (Round 4: 0.35–0.45 s, M5); from holstered, LMB → strike phase ≤ the draw time + 0.30 s, the draw ≤ 0.35 s (R5).
- **A49-melee-exists / A50-undercut** — `sentry` role → pass: `melee-hit` and HP drop at 1.5 m; crouched behind an unaware sentry, the prompt reads "UNDERCUT", it kills and emits `undercut`; **the lance is in hand before the Undercut contact frame** (M11: Round 4 drew it on the strike).
- **V46-lance-ready** — side + front at 6 m vs a licence-clean polearm-guard photo. Pass: two-handed low guard, right hand near the hip at 20 %, left forward at 55 %, blade forward-down, tip 0.35–0.55 m (R2), elbows near the body, no T-rex.
- **V47-melee-swing** — light-1 windup / contact / follow, heavy windup / contact, side. Pass: limbs do the work (hip rotation, step-in, follow-through); lance in the hands; no arm behind the head or through the body; heavy two-handed.
- **V48-lance-holster** — back view running. Pass: one steep diagonal, blade over the right shoulder, the bronze bob cap at the left hip, clear of wrap tail, bow and quiver.
- **V49-draw-from-jog** — Pass: draw from a jog keeps the stride; elbow path below the head.
W2 — gaff, Windwall, casts:
- **A-clip-elbow-audit** (R14) — FK-sample every frame of every UAL2 clip any Brea action plays, raw and after guards → pass: 0 frames after guards with a hand behind and above the head or an elbow above `head_y + 0.05 m`; raw stats published per clip; clips outside the raw-clean set appear only if their guarded count is 0.
- **A-gaff-grip** (deciding clauses, as A101) — 3-hit combo + hook-rip + lunge → pass: knuckleToAxis ≤ 0.03 m; hook edge forward ±20° (the gaff's bladeAhead); buttToWrist: the hand 0.08–0.20 m from the haft end; rip moves the hand 0.30–0.40 m toward the body along the haft in 0.25 ± 0.05 s with the elbow below the shoulder and forearm ≥ 0.10 m off the belly axis; gaff and bow never both in hand.
- **A-gaff-moving** — combo while jogging → pass: planted-foot drift ≤ 0.08 m; speed ≥ 60 %.
- **A-windwall-fan** — open/close, parry, plant → pass: `open` 0→1 within the variant's time ±10 % (0.18 / 0.28 s); 9 slat bones rigid (not `dyn_`); closed fan ≥ 0.03 m from the bowstring path at full draw; parry window equals the variant ±1 frame; a planted fan breaks a Plumb's sight at 30 m within 0.5 s.
- **A-shield-guard-move** — pass: guarding move speed = `player.speeds.aim` ±5 %; no new speed value.
- **A-cast-pendulum** (R13) — every pot and net cast from idle, jog, crouch → pass: throwing hand ≤ `shoulder_y + 0.05 m` every frame; elbow never > 0.10 m behind the head plane; pot release 30–40° above horizontal; net release at or below shoulder height; 0 `OverhandThrow` tracks in any action.
- **V-gaff-combo** — side windup / contact / follow. Pass: body-performed, hook forward, weapon in the hand.
- **V-windwall** — guard, parry, plant. Pass: shield on the left forearm, body turns into the block, fan reads as a crescent.
- **V-cast** — pendulum swing and release. Pass: swing beside the thigh, release forward-up; never behind the head.
- must stay green: global list, A2, A3, A11, A12, A13, A31b, A31g, A35, A-draw-elbow-level.

### armory (W1, W3)
- **A-variant-swap-matrix** — every armor variant (W1: Pan I–III, Ash I; W3: all 12) × every weapon variant held (W1: Sabina, Shepherd's; W3: all 18) × 8 poses (idle, sprint mid-stride, full draw at camPitch 0 and −0.55, lance light-1 contact, heavy contact, **gaff hook-rip, Windwall guard, pendulum release**), CPU-skinned → pass: (a) no tearing: max triangle edge stretch vs bind ≤ 1.6×, weights sum to 1 ± 0.01, ≤ 4 influences; (b) body penetration: ≤ 0.5 % of outfit vertices more than 4 mm inside the skinned body and 0 in the head/face region; (c) weapon/stow vs outfit penetration ≤ 5 mm; (d) pauldron/capelet/collar ≥ 0.03 m from the draw hand and from the head at full draw; (e) named pairs: the Guild Whites hat in its back socket ≥ 0.03 m from the lance diagonal; the Highline rope coil ≥ 0.03 m from the bowstring path; Dripline's `dyn_shawlFlap_r` ≥ 0.05 m from the draw hand.
- **A-variant-motion-rerun** — per armor variant (W1: 4; W3: 12) → pass: `A-stow-clearance`, `A-wrap-clear` (every `dyn_` chain the variant adds: shawl flaps, hood, veil) and `A-run-arms` pass at their bars.
- **A-outfit-swap-memory** — 6 swaps across all owned variants, then unequip → pass: geometries, textures and skeletons equal to baseline (±0); 0 console errors.
- **A-weapon-swap-memory** — cycle every weapon variant twice → pass: geometries, textures and materials back to baseline.
- **A-gear-draws** — any loadout → pass: ≤ 5 main draws (skin, hair, merged outfit, stow kit, held weapon), ≤ 2 shadow casters; drawing a weapon hides its stowed copy with 0 extra draws.
- **A-weapon-sockets** — pass: every weapon GLB has its class sockets (`grip`, `stow`, `tip`/`nock`/`string_*`/`hook`); authored length within ±2 cm of the bible (Sabina 1.45, Cane 1.15, Sighting 1.60, lances 1.55/1.55/1.50); `SPEAR_SCALE` removed; bow `pull` = `A-lmax-solve` ± 0.01 m.
- **A-armor-verb** (R31) — each variant's probe from bible §4.7, run through the real path through the published hooks, **with the negative control** → pass: the declared effect within ±10 % with the perk, the base behaviour without it, and nothing else changes.
- **A-no-move-mods** (R16) — with every variant → pass: `player.speeds` deep-equals canon; A2 displacement and A28 jump arc within their bars.
- **A-equip-each-variant** (W3) — equip every armor and weapon variant through the panel in `ui/inventory.js` → pass: each equips and renders; its acquisition route (bible §4.6) is registered (craft recipe, merchant stock or quest reward); the equipped loadout survives save + reload (`A65`).
- **A4-draw-strength / A5-arrow-fired-event / A51-nock-gap / A52-arrow-drop** (`sentry` target) — pass: Round-4 bars (≥ 0.95 draw; event fires; nock interval 1.05–1.40 s; 2.5–5 m drop at 55 m, launch within 0.3° of the crosshair ray, **also at camPitch −0.55**).
- **A-weapon-role** — the six bible §5.1 scenarios, reported every wave → pass **from the W3 exit**: each named weapon's metric beats the median of the other five by ≥ 30 %.
- **V-variant-sheet** — 12 armor variants front/side/back on one sheet, flat-lit. Pass: each variant reads different at 20 m by shape, not only colour; no fur, no red hip sash, no braids; pauldrons sit on the clavicle.
- **V-weapon-sheet** — all bow and lance variants in hand. Pass: silhouettes per spec, real proportions; the bob cap and the Counterweight bob read.
- **V29-wielded-carry** — jog toward an alert `sentry`. Pass: bow low in the LEFT hand, left-arm swing damped; FAIL if on her back.
- must stay green: global list, A35, A100, A101, A-stow-clearance.

### Instruments — the per-kind block (`tools/gates.r5.kind-block.mjs`; instruments-a, -b, -c, -d run it for every kind they own)
- **A44-socket-integrity / A44b-socket-vertex-integrity** — pass: every part/lamp anchor ≤ 0.10 m from the nearest hull vertex, idle and +2 s after death.
- **A45-no-skate-per-species** — walk, run, 150° turn → pass: stance drift ≤ 0.06 m.
- **A45c-foot-continuity** — pass: pad continuity ≤ 0.12 m/frame **absolute** (every kind incl. the Transit).
- **A46-ground-truth** — pass: planted |y − terrain| ≤ 0.08 m per foot.
- **A47-corpse-grounded / A47b-corpse-posed / A47c-corpse-mass** — pass: penetration ≤ 0.10 m at 2.5 s; posed; mass height ≤ 0.75 × the locomotion pose height (sprawler rule).
- **A48-cadence** — **moving frames only** (speed ≥ 0.5 × walk) → pass: inside the body-length band.
- **A-weights-authored** — pass: 0 vertices on the wrong bone vs the generator labels; ≥ 99.5 % rigid.
- **A-sil40** — side + front masks at 40 m (FOV 55, 1600×900, flat ink), **height-normalised** → pass: pairwise shape-IoU ≤ 0.45 against every other non-legacy kind, except the named tripod pair **Plumb–Transit ≤ 0.60**; height ≥ 20 px (Peg exempt).
- **A-weak40** — pass: primary weak point ≥ 5 px across at 40 m (Peg exempt); lamp/vial luminance contrast vs hull ≥ 3:1 at 13:00 `trade` and in `calima`, read from rendered pixels.
- **A-lamp-states** (core's gate, rendered pixels at 15 m) — pass for the new kind.
- **A41b-attack-coverage / A41d-attack-coverage** — sustained duel on its own ground (`gatePlaces`) → pass: every authored attack fires.
- **A41c-sustained-variety** — pass: 5/5 clean runs.
- **A42-stagger** — tear a part mid-windup → pass: attack cancelled; stagger 0.6–1.2 s; `machine-stagger` emitted.
- **A-linked-attack** — pass: after its tool is torn, the linked attack fires 0 times in a 60 s duel.
- **A-glb-budget** — pass: within its size class (§4.1), bones included.
- **A21-with-kind** — pass: staged fight ≤ 350 draws; the kind costs ≤ its class draws.
- **A90-expansion-with-kind / A90-rig-reclaim-with-kind** — pass: bars unchanged.
- **V26-silhouette** — side + front at 12 m, plain sky. Pass: reads as its bible card's one-sentence tool; no head, jaw, tail, face or eye.
- **V27-attack-pose** — freeze mid-windup. Pass: the working end does the work (bob swings, blades scissor, blade lowers, mortar elevates); FAIL if only the body transform changed.
- **V-lineup** (`A44c-lineup-staged`) — every non-legacy kind side by side at 12 m with Brea for scale. Pass: one family (glaze on bronze, vermilion graduations), sizes per bible.

### instruments-a (W1): Tiller, Plumb, Peg
- the per-kind block × {tiller, plumb, peg}.
- **A-plumb-scale** — Plumb generator at `scale` 3 and 6.5, hull hidden → pass: A45c ≤ 0.12 m/frame, A46 ≤ 0.08 m, A48 in band at both scales.
- **A-plumb-topple** — two level-vial hits → pass: topple within 0.5 s, down 4 s ±0.3, grounded (A47 bar) while down, stands back up; 0 `gait.js` lines changed.
- **A-flagged** — a sentry sees Brea → pass: every Instrument within 60 m enters search toward the flag ≤ 1 s; the mark lasts 8 s (3 s in Guild Whites, through `perception.flagDuration`).
- **A-transect** — a Peg swarm lays a line → pass: pegs are 1 instanced draw; crossing within 20 m of a Plumb raises it to wary ≤ 1 s; site dispose removes the pegs (geometries baseline).
- **A-herd-ripple** — a Plumb chimes near a herd → pass: lamps flash in sequence down the herd within 1.5 s; the herd then flees in file: every member within **2 m lateral** of the leader's path for the first 30 m.
- must stay green: global list.

### instruments-b (W2): Sickle, Screed, Gauge
- the per-kind block × {sickle, screed, gauge}.
- **A-no-kept-edit** — pass: 0 lines changed in `gait.js` and `autorig.js` (Sickle blades are part `update()` rotations).
- **A-charge-stun** — a Screed charges into a column cluster / crescent wall / the Organ Shelf → pass: stunned 3 ± 0.3 s; the charge path deviates ≤ 5° (no mid-charge turn); ram seals ×2 broken → 0 charges.
- **A-gauge-neutral** — pass: the Gauge stays calm for **≥ 60 s with Brea walking the pans at ≥ 5 m** from it; it turns hostile only on attack or pan damage; it runs its sluice script on the tide clock (or the static fallback).
- **A-correction-day** — scripted correction: a Screed cuts a crescent wall down to its Datum Line through `ctx.terrain.walls.cut` → pass: the wall segment's height ends within 0.1 m of the line; berm instances spawn; site dispose clean.
- **A-screed-reads-datum** — mark the Ninewalls region true via `ctx.datum.setTrue` → pass: over 10 sim min no Screed selects a correction target inside that region; regions not marked keep their targets.
- **A-contract-followline** — W2 day 1 stub, real by exit → pass: `screed.followLine(path, lampId)` makes a Screed walk the path within 1 m; breaking the lamp with `lampId` makes it lose the line within 1 s and fall back to its patrol.
- **A-legacy-delete** (W2 exit) — pass: `A-legacy-gone` passes after this lane's deletion; `A1` and `A20b` pass.
- must stay green: global list.

### instruments-c (W3): Spindle, Kiln, Davit, Sonde
- the per-kind block × {spindle, kiln, davit, sonde} (Sonde exempt from A45/A45c/A46/A48 — no legs; its corpse runs A47).
- **A-tether** (spike exit, then the real kind) — pass: position ≤ tether + 0.2 m from the anchor at all times; no NaN over 10 min sim; a net foul grounds it ≤ 6 s; a cut tether → downwind drift and crash 25–40 m away, corpse grounded (A47); 5 spawn/kill rounds leave geometries flat.
- **A-ring-deflect** — through `combat.onArrowHit` → pass: arrows deflect only while the ring's spin exceeds its threshold; Brine slows it below threshold within 2 s; Dust stops it.
- **A-quench** — pass: a Brine hit on the Kiln firebox deals ×3 ± 0.1 damage and a stagger.
- **A-untear** (✂) — pass: a Davit re-seats a torn tool within 4 ± 0.5 s from its rack; rack count decrements; components stay 1 draw; with E21 cut, the fallback restores 30 % armor and the gate reports the cut.
- must stay green: global list.

### instruments-d (W4): Dredge, Transit
- the per-kind block × {dredge, transit}.
- **A-transit-greybox** (before any detailing) — 30 k-tri grey box through the full seam → pass: A45c ≤ 0.12 m/frame, A46 ≤ 0.08 m, A48 in band, A21 ≤ 350 with the Transit + 6 Instruments on screen, A103 foot-shoe reach ≤ 0.15 m.
- **A-transit-topple** — pass: the death topples about the planted leg, settles grounded, graded by A47c; no climb interactable exists.
- **A-follow-leader** — Dredge at 2 m/s through a 180° coil → pass: each segment root ≤ 0.15 m from the leader's path history; legs pass A45c; coupling break detaches the segments behind (inert, grounded); bones ≤ 52.
- **A-burrow** — pass: submerged root −1.5 ± 0.1 m with GaitController paused; surfacing re-runs corpse grounding (lowest vertex within 0.10 m of terrain); erupt telegraph ≥ 1.2 s.
- **A-gait-grant-regression** — pass: A45/A46/A48 unchanged on every other kind after the `gait.js` grant.
- **V-transit-key** — title, menu and loading frames. Pass: no Transit silhouette against a sun lower than 20° elevation.
- must stay green: global list; the orchestrator's final `A-first-hour` run with the Transit at 0:55.

### world-ground (W1–W4)
W1:
- **A-terrain-api** — pass: `getHeight/getNormal/heightFast/slopeFast/surfaceAt/materialAt/biomeWeights/stampStealthDisc/WORLD_SIZE/WORLD_HALF` exported and finite across the map; **`riverFactor` still exported and returns 0 everywhere** (frozen `nav.js` imports it); other old river/shelf exports kept returning "no river" or removed with 0 dangling readers.
- **A-world-size** — pass: `WORLD_SIZE` = the `A-terrain-1024-probe` choice; node spacing ≤ 1.95 m; terrain build ≤ 600 ms; every `sites.js` coordinate on land at its stated height ±3 m.
- **A-play-extent** — pass: `PLAY_RADIUS` derives from `WORLD_SIZE` (≈ 490 m at 1024 m; ×0.84 / ×0.70 at the fallbacks) and every `EXTENT` offset follows it; the player clamp, navgrid, Instrument limits, search ring, doctrine rim and gather limit read them (grep finds 0 numeric radial clamps in `src/`, including world-ground's own content files); `A-reach-all-sites` passes.
- **A-single-rest** (W1 re-run) — pass: `REST` is Brea's cistern at Saltrow ±1 m; spawn and death-respawn there within 3 m; the no-spawn ring centred on it.
- **A-island-boundary** — sprint toward the sea in 16 directions → pass: never in water deeper than 1.2 m; stopped by the current ring (registered via `ctx.collision`); no fall-through.
- **A30b-fall-wade-edge** (re-staged) — pass: fall damage > 4 m, lethal > 9 m (base; `player.mods` may raise them); wade slowdown in the Glass shallows; a soft edge, not a wall.
- **A-biomes** — pass: `Terrain.BIOMES` lists the six; `biomeWeights` sums to 1 ± 0.01 at 1,000 random land points; W4: each biome ≥ 5 % of land area.
- **A58-surface-api** (R20) — pass: ≥ 4 distinct surfaces in the Pans at W1, ≥ 6 island-wide at W4; every surface routes to `SURFACE_AUDIO` (A58b).
- **A59b-cover-honesty / A59c-mask-coherence** — carry.
- **A60-stealth-lanes** (re-staged) — pass: every live patrol route ≥ 25 % of its length in cover density > 0.45 (marram, glasswort, sea-lavender, crescent walls).
- **A-layers-budget** — pass: ≤ 5 layers at 1024² + ≤ 5 at 512²; ≤ 3 blended per pixel (shader audit); triplanar only where slope > 0.35.
- **A-scatter-draws** — pass: 1 draw per visible scatter kind (+3 if a caster); ≤ 8 kinds visible in any frame.
- **A-anti-tile** — 256² crop of sand and salt at 20–60 m → pass: no autocorrelation peak > 0.15 at lags 4–64 px.
- **A-skirt-masked** — aerial shot → pass: the far field uses the masked splat; luminance step at the patch/skirt seam ≤ 8 %.
- **A-columns-normals** — pass: basalt instance normals within 2° of the analytic normal under non-uniform scale (the POC streak bug).
- **A-biome-stream-memory** — two laps of a fixed island route → pass: geometries and textures end within +8 of the lap-1 value; heap within +10 %.
- **A18-slope-conform / A18b-slope-conform-moving / A29-steep-face / A29b-steep-face-moving** (re-staged) — `gatePlaces.steepFace` (≥ 50°), `hillside38`, 10/20/30° faces → pass: Round-4 bars.
- **A-poc-biome-removed** (W1 exit) — pass: no `?poc=biome` code path; `public/textures/r5-poc/` absent; `A-gpu-tier` re-run at `gatePlaces.vistas.pans` passes.
- **V-biome-vista-pans** — 07:00 trade and noon calima, vs licence-clean Janubio / El Golfo reference photos. Pass: salt grid, white surf on black sand, the Organ Shelf and the Ring read; no tiling, no empty sand plain; FAIL if it reads as clean CG flat colour.
- **V32-ground-detail** — crouched, 1.5 m. Pass: grain, crust, pebbles, normal relief; no tiling.
W2 (Holds):
- **A-ash-pits** — pass: ≥ 1,500 pit-cup instances with crescent walls on the NE side (045 ± 15°); 2 draws + casters; 0 pits stamped into the heightfield.
- **A-scar** — pass: the Screed Scar is straight within 0.5 m over its length; no pit inside its 25 m width; berm instances on both sides.
- **A-contract-walls-cut** — W2 day 1 stub, real by exit → pass: `ctx.terrain.walls.cut(id, h)` lowers that wall instance to height `h` ± 0.05 m; its collider follows; dispose clean.
- **A-contract-datum** — W2 day 1 stub, real by exit → pass: `ctx.datum.setTrue(region)` flips `regionTrue(region)` and persists through `save`; `ctx.datum.patch(material)` adds the Datum chunk to a foreign material with 0 extra draws.
- **A-datum-line** (✂ E20) — Ninewalls vista → pass: a continuous vermilion band at the region's `uDatum` height across ≥ 3 surface kinds (terrain, wall, rock) covering ≥ 20 % of screen width; ≥ 1 spray break per 10 m; fades to 0 by 250 m; `ctx.datum.setTrue` removes the band in that region ≤ 1 s.
- **A-tide** (✂ E19) — pass: `water.levelAt` follows the tide clock with a **range of 0.4–1.2 m and 6 game-h ± 10 % from high to low water**; pans flood and drain; the navgrid swaps keepout sets only while Brea is ≥ 60 m from the affected shore.
- **V-datum-line** — Pass: reads as in-world paint (follows the surface, occluded by foreground, spray edge, drips), judged against licence-clean survey-paint photos; FAIL if it reads as a UI overlay.
- **V-biome-vista-holds** — vs La Geria reference. Pass: crescent walls and pits read, the Scar a straight line, warm dust light.
W3 (Malpaís, Cloudline, tube trenches):
- **A-no-live-lava** — pass: 0 emissive lava layers or materials; Malpaís glow only at the Kiln Yards wellheads.
- **A-trench** — pass: each tube polyline in `sites.js` is carved as a trench whose floor matches the shell floor ±0.1 m; the heightfield has 0 holes; `ctx.terrain.trench(id)` returns the polyline.
- **V-biome-vista-malpais** — Pass: cold aa, fumaroles, wellhead glow; no lava.
- **V-biome-vista-cloudline** — vs Garajonay reference. Pass: laurisilva, fog nets, the Fog Harp.
W4 (Flank, Caldera):
- **A-cliff-kit** (✂ E26) — pass: colliders registered, no gaps > 0.3 m at the wall foot.
- **V-biome-vista-flank / V-biome-vista-caldera** — Pass: the golden-hour wall with the anchors; the sea of clouds below the caldera.
- **V44-biomes** — four-yaw from the caldera rim. Pass: ≥ 3 biomes in frame.
- **V7-vista** — Pass: the sister-isle stratovolcano on the horizon.
- must stay green: global list, `A25b-nav-and-occlusion`.

### world-props (W1, W3, W4)
- **A98-sites** (R22) — pass: ≥ 8 sites at W1, ≥ 18 at W4, each with ≥ 2 interactables that respond to `interact` (pure landmarks excepted and named).
- **A-trig-pillars** — pass: 6 pillars at `sites.js` ±1 m; the top is reached through `A-climb-1m`'s action in ≤ 3 s; all 10 sight pairs are unobstructed (ray test against terrain and colliders).
- **A-landmark-bearing** — from Saltrow (W1), Ninewalls (W3) and the Calibration Yard (W4) → pass: each of the 8 bearing sectors has ≥ 1 registered landmark at 150–500 m with projected height ≥ 12 px at 1600×900, occlusion-tested.
- **A61-colliders-registered** (R21) — pass: ≥ 95 % of collidable instances registered; ≥ 600 at W1, ≥ 1,500 at W4.
- **A24-player-blocked** (re-staged) — sprint into a basalt column → pass: distance to its axis ≥ 0.45 m; speed < 1 m/s at contact.
- **A98b-clearings** — carry.
- **A-place-draws** — pass: each landmark ≤ 3 main draws + ≤ 2 casters; landmarks + places ≤ 45 draws in any frame.
- **A-site-dispose** — load/unload every place ×3 → pass: geometries, textures and collider ids back to baseline.
- **A-gate-places-published** — pass: `ctx.props.gatePlaces` lists openGround, steepFace, hillside38, herdSite, rest, tallCover, pool, waterFeature, vistas (one per biome), landmarks, kilnYardFight — each on valid terrain.
- **A-fauna-biomes** (W3) — pass: `fauna.js` species are exactly the bible §8.10 six with lint-clean names; each spawns only in its listed biomes (1,000 spawn samples); despawn ×3 returns geometries to baseline.
- **A-tube-camera** (W3; Boilers W4) — 60 s walk through the Jameo, the Malpaís tube and the Boilers → pass: the lens is never inside rock (`collision` occluder test every frame); Brea's opacity ≥ 0.98; head in frame ≥ 90 %.
- **A-tube-colliders** (W3; Boilers W4) — pass: no fall-through over the walk; ≤ 0.3 m gaps between shell colliders and the trench; every shell registered as blocking + occluding.
- **V34-midground** — four-yaw vista. Pass: a landmark silhouette in the 150–300 m band on every bearing.
- **V-landmark-sheet** — Sounding Ring, Organ Shelf, wind pump, trig pillar (W1); Kiln Yards, Fog Harp (W3); Fundamental, Pinned Cliff, Calibration Yard (W4). Pass: each reads as its bible description.
- **V-tube** (W3) — Jameo lava-tube interior. Pass: enclosed, lit through the skylight, readable.
- must stay green: global list.

### world-sky (W1, W4)
- **A-weather-states** — `setWeather` each state → pass: fog colour/density within ±5 % of the bible after the fade; calima disc colour within ΔE 3 of `#F2A27E`; `perceptionScale` 1.0 / 0.5 / 0.5 / 0.8 (trade / calima / fogbank / squall), 0.7 at night.
- **A-hour-keys** — pass: zenith and horizon colours at the bible's hours within ΔE 5.
- **A55-light-ratio** (re-staged under a Saltrow wind pump at noon) — pass: shadow ≤ 55 % of lit.
- **A56-cascades** — carry (≥ 3 cascades, near texel ≤ 2 cm, casters culled beyond 120 m).
- **A57-aerial** (re-staged) — pass: fog transmittance at 300 m 0.55–0.70 in `trade`, 0.20–0.40 in `calima`.
- **A-cloud-sea** — Caldera rim at 07:00 → pass: windward slopes below 150 m read as cloud (luminance ≥ 0.75 of sky); 0 transparent planes (draw delta 0).
- **A-biome-grade** — walk across a biome border → pass: exposure changes ≤ 0.05 EV per frame.
- **A-no-river** — pass: `RiverWater` absent; water draws = sea + Glass + ribbons only.
- **V-calima** — Pans at noon in calima. Pass: ochre flat sky, coral disc sun, soft shadows, lamps readable at 40 m.
- **V31-night** — Pass: moonlit salt, stars, lamps the only colour, no black mud.
- **V-sky-trade** — Pass: flat-bottomed trade cumulus drifting SW; no radial god-ray spokes; not golden-hour drama.
- must stay green: global list, A108, A109.

### combat-kit (W2)
- **A-weapon-catalog** — pass: `weapons.js` ids equal bible §10.3; every id/ammo key lint-clean; the `{impact, tear, element, elementAmount, drawScaled}` shape kept.
- **A-elements** — pass: Cinder/Brine/Dust route to fire/freeze/shock; statuses Charred / Seized / Clouded apply at threshold; **Seized = legs at speed ×0.6 for 8 s and every seized tool or plate detaches on one Pry hit or hook-rip; the damage dealt to a Seized target equals the unseized value ±1 % (no multiplier)**.
- **A54-elemental-tiers** (R24) — pass: Brine arrows to Seized: small 1–2, medium 3–5, large 8–12.
- **A-pots** — each variant → pass: radius and duration ±10 % (Brine 3 m / 10 s with speed −40 % and armor −20 %; Cinder 2.5 m / 6 s; Dust 5 m / 6 s with perception −80 %, lock broken, alert reset); Brine on a firebox triggers quench.
- **A-net-foul** (✂ E17) — pass: fouls small/medium kinds (gait amplitude and speed ×0.4 for 5 ± 0.3 s); fouls a Sonde (descent); Wire net darkens lamps 3 s; retrieval within 3 m; net mesh 1 draw from a preallocated buffer.
- **A91-combat-fx-bounded / A92-arrow-corpse-release / A93-combat-dom-bounded / A94-combat-memory-return / A95-combat-teardown** (re-staged on the new ammo ids) — pass: Round-4 bars.
- **A51-nock-gap / A52-arrow-drop / A53-steady-not-on-sprint** — pass: Round-4 bars (A53: Shift+W to 8 m/s then RMB → `combat.steady.active === false`, `timeScale` = 1).
- **A-steady-breath** (R32) — aim, hold Shift → pass: bow sway amplitude ≤ 0.02° for 4 s (6 s with the Sighting Bow), then a 2 s shake; `timeScale` = 1.0 ± 0.001 throughout; `steady-start/end` fire.
- **A-rack-no-slow** (R32) — hold Tab 3 s → pass: `timeScale` = 1.0 ± 0.001; Instruments and the world clock advance at normal rate; quick slots 1–4 equip within 1 frame.
- **A-items-ids** — pass: `items.js` ids lint-clean (salt, juniper, cord, bronze-cable, cinder-resin, brine, dust, ceramic, escapement, `<kind>-lampglass`); **a planted W0-era `cal.save.v5` with old ids loads with unknown ids dropped, one warning, 0 errors**; a v4 save is refused.
- **A-contract-arrow-filter** — W2 day 1 stub, real by exit → pass: a registered `combat.onArrowHit` filter returning `{ deflect: true }` reflects the arrow about the hit normal with no damage; filters unregister on dispose.
- **A-perk-hooks-combat** (R31; negative controls) — pass: `combat.whistle(at)` puts the nearest Instrument's search target within 2 m of `at` (of Brea without `at`); the pool-damage filter zeroes fire-pool damage (> 0 without); the Brine build-up filter zeroes build-up (> 0 without); `parryMul = 1.5` widens the parry window 1.5× ± 1 frame.
- **A-input-actions-live** — pass: with tool use and craft moved to the Kit Rack, no two `input.js` actions share a key in any context (guard, aim, rack, Sighting, free); F casts, X plants (while guarding), R hook-rips.
- **V28-impact** — full-draw weak-point hit on a Screed at 8 m, +60 ms. Pass: ceramic chip burst, no blue sparks, reticle tick, Plex Mono damage number ≥ 18 px, the Screed flinches.
- **V-kit-rack** — Pass: the weapon selector reads as a field-book protractor; Plex fonts; lint-clean labels; the world visibly keeps moving behind it.
- must stay green: global list, A49, A50-undercut, A101, A-cast-pendulum.

### settlements (W2, W4)
- **A95-npc-roster** (R23) — pass: ≥ 10 NPCs registered and ≥ 4 body variants by mesh/material signature at W2; ≥ 13 archetypes island-wide at W4.
- **A-npc-variety** — pass: ≥ 10 archetypes; **≥ 3 distinct silhouettes among the Saltrow NPCs** (height-normalised mask IoU ≤ 0.85 pairwise at 10 m); every archetype wears ≥ 1 procedural faction piece; ≥ 8 distinct archetypes in one Saltrow frame; ≤ 2 draws each; LOD1 ≤ 4 k tris beyond 25 m; only the nearest 4 cast.
- **A-npc-face-delta** — pass: pairwise between archetypes of the same sex, ≥ 4 mm on ≥ 4 face landmarks; no archetype face equals stock UBC (≥ 6 mm on ≥ 3 landmarks).
- **A-npc-atlas-resident** — walk Saltrow → Ninewalls → Saltrow → pass: ≤ 4 faction atlases resident at every sample; atlases of the settlement left behind are disposed (textures back within +2 of baseline).
- **A96-npc-animated** — 60 sim s → pass: every mixer advances; ≥ 3 distinct clips per NPC; ≥ 4 NPCs traverse ≥ 8 m.
- **A97-npc-no-skate** — pass: planted drift ≤ 0.08 m on a walking NPC.
- **A97b-npc-talk-freeze** — pass: talk freezes the world correctly; seated speakers stand, turn and talk, then return to the seat.
- **A-npc-dispose** — spawn/despawn 20 NPCs ×3 → pass: geometries, textures and skeletons back to baseline.
- **A-npc-draws** — Saltrow at dusk, 10 NPCs → pass: NPC owner ≤ 32 draws incl. casters.
- **A-settlement-draws** — each settlement in view (Saltrow, Ninewalls W2; Mistfold W4) → pass: its kit ≤ 12 draws incl. casters, ≤ 150 k tris, kit files ≤ 1.2 MB.
- **A61-settlement-colliders** — pass: ≥ 95 % of each settlement's collidable modules registered; Brea cannot pass through any wall (16 sprint probes per settlement).
- **A-settlement-dispose** — load/unload each settlement ×3 → pass: geometries, textures, collider ids and NPC skeletons back to baseline.
- **A-lookout-call** — pass: a Lantern-Keeper or Fog-Netter plays `Idle_Rail_Call` within 1 s of an Instrument entering 80 m.
- **A-leveler-stride** (W4) — pass: Leveler stride 0.80 ± 0.02 m.
- **A-leveler-follow** (W4) — pass: a Leveler walks a pegged line ahead of a Screed through `screed.followLine`; one arrow on the staff lamp → that Screed loses the line within 1 s.
- **A-fogharp-growth** (W4) — pass: after the Fog Harp retune, Mistfold gains 2 NPCs and a market-day schedule; dispose clean.
- **A-basket** (W4, R31; ✂ E37 → ladders) — pass: ride a cable basket 40 m through `player.ride`, dismount on input on the far side within 1 m of the landing; 0 leaked objects after 3 rides.
- **A99-dialogue** (re-staged on new ids) — pass: `talkTo(npc)` opens that NPC's lines; a choice advances quest state and closes cleanly.
- **V40-settlement-life** — Saltrow at dusk. Pass: ≥ 6 NPCs in frame doing ≥ 4 visibly different things; lamps lit; wind pumps turning.
- **V35-settlement** — Pass: whitewashed cubes, orchil balconies, salt cones, pumps; reads as a lived-in guild town (no Nora palisade language).
- **V41-npc-closeup** — two bodies walking side by side. Pass: different faces (not the stock face), outfits and builds; natural gait; no T-pose, no skate.
- **V-npc-builds** — adolescent (uniform 0.90 scale only) and adult variants. Pass: no LBS artefacts at the neck, head or shoulders; the younger read comes from the face; otherwise the adolescent variant is cut (fallback text, bible §8.9).
- **V45-dialogue-panel** — Pass: field-book panel (name, line, 2–3 choices) in front of a Pan House NPC; does not cover the speaker.
- must stay green: global list.

### shell-ui (W2)
- **A-ui-words** (all surfaces) — pass: 0 banned words in HUD, hub, inventory, map, tips, cards.
- **A-lamp-canon-distance** (CSS tokens) — pass: as core's gate.
- **A71-compass-truth** — pass: 0 pips at spawn with nothing Flagged; flagging one adds exactly one; pips show iris shape + lamp colour.
- **A71b-hud-scale-floor / A71c-hud-surfaces / A71e-tutorial-cards / A71f-interact-anchor / A71g-tracker-live / A71h-mhb-melee-clear** (re-staged) — pass: Round-4 bars; card texts and order match bible §8.9.
- **A71d-steady-breath-meter** (replaces the Steady veil) — pass: a hairline breath meter shows while Steady is held and drains over its duration; 0 full-screen overlays, 0 desaturation passes, `timeScale` 1.0.
- **A-sighting** — Sighting on a `herd` kind at 15 m → pass: the card lists named components with loot; weak points are cobalt-ink rings; transects are white dashes; overlay hue histogram has 0 % of pixels in 250–290° (violet) or 160–185° (teal) above 0.4 saturation; world keeps its colour under a ≤ 20 % sepia vignette.
- **A62-sighting-components / A63-loot-reveals** (renamed) — pass: Round-4 bars.
- **A68-no-softlock / A69-death-choice / A70-hub-tabs / A72-settings-persist / A72b-accessibility** — pass: Round-4 bars.
- **A-map-triangles** — pass: only the coastline before any reveal; revealing T1 + T2 + T6 paints that triangle's area within 5 % of its geometry; state survives reload.
- **V10-hud / V37-hud-language** — 40 % HP, aiming, Instrument engaged, tool slot full. Pass: levelling-staff health with 10 % graduations, theodolite compass with a 3-digit bearing, paper chips, hairlines, Bodoni/Plex; no hexes, pills, smoked-glass cut corners, red 4-segment bar or green pouch; legible at 1600×900 and 4K.
- **V36-sighting-scan** — Sighting on a Tiller at 15 m. Pass: sepia paper vignette, stadia hairlines, cobalt weak-point rings, dashed component outlines with leader lines; not violet, not teal, not holographic.
- **V-map** — Pass: field-book paper, inked contours, soundings offshore, Bodoni italic place names, revealed triangles, Datum Line regions in vermilion.
- must stay green: global list.

### progression (W3)
- **A64-cert-loop** (replaces A64-xp-loop) — re-survey a benchmark, sight a triangle, Pry 3 tools → pass: each survey act advances its certification (Transect / Bearing / Ballast) and a completed rank grants its perk ≤ 1 s with a card; killing Instruments grants **no** certification progress; HP rises only through Ballast ranks.
- **A64b-damage-channels / A64c-undercut-colossus** (renamed) — pass: Round-4 bars on role-staged kinds.
- **A65-save-restore** — save at Brea's cistern, kill 2, reload, Continue → pass: quest stage, inventory (salt, juniper …), ammo, position, alive-set, revealed triangles, re-surveyed benchmarks (`ctx.datum`), certifications and the **equipped loadout** match; key `cal.save.v6`.
- **A-save-schema** — pass: the save carries an item-id + quest-id schema hash; a planted W0-era `cal.save.v5` and a v6 save with a mismatched hash are both refused with a fresh start and 0 console errors.
- **A66-quest-objectives** — pass: talk / goto / scan / kill / gather / **survey** objectives complete on their real events.
- **A67-machine-respawn** — pass: a cleared site respawns after 6 min of game time out of view.
- **A-first-hour** (R31) — the 8 beats of bible §8.9 from a fresh save, driven by input only; teleports allowed between beats **except the walked leg REST → black-sand beach on the navgrid**; every objective event logs its emitter stack (from gameplay code, never from `tools/`) → pass: all 8 in order; the starting loadout matches bible §8.9; 0 console errors; A90 bars hold at the end. **Provisional at the W3 exit** (the Plumb generator at `scale` 6.5 is the 0:55 walker); **final at the W4 exit with the Transit**, run by the orchestrator.
- **A-benchmark-resurvey** — pass: a 15 s hold re-surveys; `ctx.datum.setTrue(region)` fires; no correction targets in that region for 10 sim min (`A-screed-reads-datum`); that region's Datum Line clears; a fast-travel node registers.
- **A-triangulation** — pass: sighting two pillars from a third emits the reveal; map state persists in the save.
- **A-no-timed-trials** — pass: 0 activities with a countdown timer; Guild Notices are untimed.
- **A-certifications** (replaces A-skill-trees) — pass: Transect / Bearing / Ballast, 3–5 ranks each, every rank tied to a survey act; names lint-clean; 0 skill points or XP values in the save or UI.
- **A-distinct-verbs** — pass: ≥ 5 of the 8 first-hour beats teach a verb absent from `tools/lint/hzd-verbs.json` (bible §11.2 lists 7).
- **V-first-hour-strip** — 8 frames, one per beat. Pass: each matches its beat; none shows live lava or a walker against a low sun.
- must stay green: global list.

### audio (W3)
- **A73-sample-bank** — pass: > 60 buffers, each with a licence entry (project-synth CC0).
- **A73b-hero-effort** — pass: the `hero/` set (breath, effort, hurt) plays on its events, each cue starting **within 0.1 s** of the event.
- **A73c-bow-sets** — pass: `bow/{sabina,cane,sighting}` each complete.
- **A75-instrument-voices** — pass: every live kind has distinct windup + strike cue ids; no roar samples.
- **A75b-death-ladder / A75c-suspicion-scan / A77-music-states / A77b-hit-ladder** (re-staged on roles) — pass: Round-4 bars.
- **A76-footfalls / A76b-footfall-species** — pass: `machine-footfall` fires for every legged kind (the Sonde exempt and named); ≥ 3 player footstep sets across Pans/Holds surfaces.
- **A74b-ambience-zones** — pass: surf, wind-on-stone and fog-drip beds switch at the biome borders.
- **A78-loop-reclaim / A78c-machine-retention-audio** — pass: Round-4 bars.
- **A-audio-manifest** — pass: every file in `public/audio` has a manifest row; author "CALIMA project"; 0 lexicon hits in set names.
- **A-music-palette** — audit the music recipes → pass: 0 `drum()` voices in the combat and tense stems; every stem's voices are drawn from the bible §9.9 palette (bells, whistles, plucked strings, ratchet/clapper percussion, bowed drones).
- **V-score** — 30 s of explore, tense and combat music. Pass (R29 judge): reads as island guild music (bells, whistles, plucked strings, ratchets); FAIL on taiko or frame drums, choirs, or a "tribal" read.
- must stay green: global list, A74-3d, A73d-ui-bus.

### Gate counts per lane (new + re-staged, excluding the global green list)

Counted from the bold ids in the bullets above (a bullet naming several ids counts each). The per-kind
block is counted once and runs once per kind owned.

| lane | action | visual | total |
|---|---|---|---|
| pipeline | 11 | 0 | 11 |
| engine-gpu | 6 | 2 | 8 |
| brand | 12 | 5 | 17 |
| hero-body | 43 | 13 | 56 |
| instruments-core | 14 | 0 | 14 |
| gates-perf | 16 | 0 | 16 |
| melee | 19 | 7 | 26 |
| armory | 14 | 3 | 17 |
| per-kind block | 22 | 3 | 25 |
| instruments-a (+ the block × 3 kinds) | 5 | 0 | 5 + 25 per kind |
| instruments-b (+ the block × 3 kinds) | 7 | 0 | 7 + 25 per kind |
| instruments-c (+ the block × 4 kinds) | 4 | 0 | 4 + 25 per kind |
| instruments-d (+ the block × 2 kinds) | 5 | 1 | 6 + 25 per kind |
| world-ground | 31 | 10 | 41 |
| world-props | 12 | 3 | 15 |
| world-sky | 8 | 3 | 11 |
| combat-kit | 19 | 2 | 21 |
| settlements | 18 | 5 | 23 |
| shell-ui | 19 | 4 | 23 |
| progression | 13 | 1 | 14 |
| audio | 15 | 1 | 16 |
| global green list (orchestrator, every wave exit) | 20 | 0 | 20 |

---

## 10. Licence manifest and attributions

### 10.1 `public/LICENSES.json` (owned by pipeline; every lane adds rows through `tools/licences/add.mjs`)

```json
{
  "schema": 1,
  "project": "CALIMA",
  "rows": [
    {
      "id": "ubc-standard",
      "paths": ["public/models/hero/brea-body.glb", "public/models/npc/body-*.glb"],
      "title": "Universal Base Characters [Standard]",
      "author": "Quaternius",
      "source_url": "https://quaternius.itch.io/universal-base-characters",
      "licence": "CC0-1.0",
      "licence_text": "public/licences/quaternius-ubc-License_Standard.txt",
      "archive_sha256": "<sha256 of the zip, recorded by the W0b re-fetch>",
      "archive_bytes": 128968391,
      "retrieved": "2026-10-15",
      "modified": "cut head/neck by skin weight; face displacement; repainted; recompressed",
      "attribution": null
    },
    {
      "id": "font-bodoni-moda",
      "paths": ["public/fonts/BodoniModa-*.woff2"],
      "title": "Bodoni Moda", "author": "Owen Earl (indestructible type*)",
      "source_url": "https://fonts.google.com/specimen/Bodoni+Moda",
      "licence": "OFL-1.1", "licence_text": "public/fonts/BodoniModa-OFL.txt",
      "archive_sha256": "<sha256>", "retrieved": "<date>", "modified": "woff2 subset",
      "attribution": null
    },
    {
      "id": "code-three",
      "paths": ["dist/assets/*.js (bundled)"],
      "title": "three.js r169", "author": "three.js authors",
      "source_url": "https://github.com/mrdoob/three.js",
      "licence": "MIT", "licence_text": "public/licences/three-LICENSE.txt",
      "archive_sha256": null, "retrieved": null, "modified": null,
      "attribution": "three.js © 2010–2024 three.js authors (MIT)"
    },
    {
      "id": "brea-generated",
      "paths": ["public/models/hero/brea-wrap.glb"],
      "title": "Brea headwrap, topknot and tails", "author": "CALIMA project",
      "source_url": "tools/build/recipes/brea.mjs", "licence": "project-original",
      "licence_text": null, "archive_sha256": null, "retrieved": null, "modified": null, "attribution": null
    }
  ]
}
```

Rules:
- One row per source (glob `paths`). `licence` is an SPDX id from {`CC0-1.0`, `CC-BY-4.0`, `CC-BY-3.0`,
  `OFL-1.1`, `project-original`}, plus **`MIT` for shipped code only** (three, three-mesh-bvh, the
  meshopt decoder). `attribution` is **required** for any CC-BY or MIT row and is the exact string
  shown in credits.
- `archive_sha256` + `retrieved` are required for every third-party asset download (UBC, MCO-Fantasy,
  UAL1, UAL2, Poly Haven / ambientCG scans, fonts). The UBC/MCO/UAL zips were deleted after Round 5's
  proofs (only byte sizes were kept: 128,968,391 and 294,347,394 B), so pipeline **re-fetches each zip
  once in W0b** (≈ 420 MB transient, deleted the same day), records the SHA-256 and byte size, and keeps
  the trimmed sources in gitignored `models-staging/r5-src/` (≈ 150 MB) for `A-build-deterministic`.
  itch.io has no stable file URL, so the row records the page URL, the file name and the byte size
  next to the hash.
- Licence texts ship under `public/licences/` and `public/fonts/*-OFL.txt`. Generated GLBs also carry
  `asset.extras.provenance = { generator, recipe, sources: [row ids], licence }`.
- Pre-Round-5 files that live until their deletion wave carry `legacy-r4` rows. A file whose
  provenance cannot be established is deleted at W0a (R30).

### 10.2 Where attributions surface

1. **README "Credits"** — generated by `tools/licences/credits.mjs` from the manifest (every CC-BY and
   MIT attribution verbatim, CC0 sources thanked, OFL fonts listed with their licence).
2. **In-game Credits** (`src/ui/menu.js` `CREDITS`, populated from the same generator output at build
   time) — no Horizon, Sony, Guerrilla, Sketchfab or fan-art rows remain.
3. **Files:** `public/licences/*`, `public/fonts/*-OFL.txt`.
4. **Reference images** (never shipped): pulled by `tools/r5-refs/fetch.mjs` from the Wikimedia Commons
   API filtered to PD / CC0 / CC-BY, plus own photos; each gets a `reference/r5/<lane>/MANIFEST.md` row
   (source URL, author, licence, retrieved date). Share-alike or unclear sources are stored as a URL
   only. `A-reference-set` checks that every V gate has ≥ 1 reference.

`A-licence-manifest` and `A-credits` keep 1–3 in lockstep.

---

## 11. Risks and decisions for Kevin

| risk | mitigation |
|---|---|
| Brea reads as a stock CC0 girl | silhouette sheet before textures (`V-brea-one-glance` on the default loadout), face field + paint (`A-face-delta` ≥ 6 mm + profile IoU), violet block + wrap + bracer; Blender sculpt only on a second failed `V-brea-face` |
| bow draw fails on the new arm | Lmax solve first; bare-body A35/A16/A32/A17 before any outfit piece; the −0.55 up-aim pitch now gated |
| GPU frame at the shipped tier | `A-gpu-tier` is a W0 exit; fog/calima frames cull at 140 m; five worst-frame ledgers incl. the Kiln Yard and the Cloudline |
| the machine crashes again (memory, swap, disk) | ≤ 2 gate Chromes machine-wide, a disk/memory preflight, a 3 GB floor, `A90-abs` absolute ceilings, `A-vram-ledger` with render targets and a 450 MB total, one worktree per lane |
| a half-finished lane breaks Kevin's preview or another lane | one worktree per lane; main changes only at orchestrator commits; port guard on the gate tools |
| NPCs blow the draw or VRAM budget | atlas + LOD1 + nearest-4 shadows mandatory; ≤ 4 faction atlases resident |
| Sonde / Dredge locomotion | spikes with numeric exits and named cut lines (moored balloon; 3-segment train or 11 kinds) |
| Transit at scale | Plumb `scale` tests, then a 30 k grey box through the seam before art |
| terrain at 1024 m | `A-terrain-1024-probe` (terrain + nav); one-number fallback to 860 or 720 m through `extent.js` |
| the IP stays downloadable from the public repo's history | decision 2 below |

Decisions (recommendation first):

1. **Aloy cannot ship in any form.** The brief asks for a "custom aloy model"; an Aloy likeness, name
   or costume is Sony/Guerrilla IP. **Brea fills her role on the same rig and movement stack.** Kevin
   sees Brea's silhouette and face sheets before W0 exits and confirms.
2. **Make `Kevin-Liu-01/Horizon-Zero-Claude` private now** (it is PUBLIC today). Then either
   (a) rewrite history with `git filter-repo` on `public/models/aloy.glb`,
   `public/models/{watcher,sawtooth,behemoth,thunderjaw,npc}.glb` and `reference/*.jpg` (the 19
   Guerrilla/Sony stills), followed by a force-push, or (b) start a fresh repository for CALIMA from
   the W0 tree. **Kevin's action, not an agent's** (agents never push or rewrite history).
   **Release-blocking:** until it is done, `A-ID-ip-assets-gone` proves only that the working tree is
   clean, not that the IP is no longer distributed.
3. **Title CALIMA** (fallback SALT & SPARK). Before any public release: USPTO/EUIPO search in classes
   9, 28, 41, and a check of Anthropic's brand terms for the Claude spark as a game logo.
   **Release-blocking.**
4. **Lance carry ruling R10** (diagonal, not upright) — recommended on measured physics.
5. **Map 1024 m** if `A-terrain-1024-probe` passes; otherwise 860 m.
6. **Loops changed for distinctiveness** (bible §11.2): Steady as a breath-hold with no slow motion,
   a real-time Kit Rack, Seized without a damage multiplier, Field Book certifications in place of XP
   skill trees, the corruption mechanic deleted. Recommended; Kevin may veto any one, and the matching
   gate then reverts to its Round-4 bar.
7. **Swim and pole-vault leap** deferred to a later round.
8. **Levelers as human combatants** deferred (no human-combat AI); they act through Screeds.
9. **Blender** not installed unless `V-brea-face` fails twice (346 MB DMG, ~1.2 GB installed), and
   only with ≥ 4.5 GB free at that moment (§4.6).

---

## 12. Critic pass changelog (Oct 15 2026)

Every gap the completeness critic raised was fixed. Blockers first.

| # | gap | fix | where |
|---|---|---|---|
| 1 | kept clamps hard-code a ~330 m world; 12 of 26 sites unreachable | day-1 stubs `extent.js` / `sites.js`; every kept clamp (player, nav, machine route/limit, search, squad, doctrine, gather: 10 literals, 5 more than the critic listed) reads `PLAY_RADIUS` (≈ 490 m); `riverFactor` kept returning 0; global `A-reach-all-sites`; nav build ≤ 150 ms | §1.2, §3.2, §9 global + world-ground; bible §8.1 |
| 2 | IP/licence gates could not pass while the IP GLBs lived to W1/W2 | the 4 IP/NC GLBs and `npc.glb` deleted at W0a (R30) with SKIP-legacy-deleted; `A-licence-manifest` joins the global list with `legacy-r4` rows | §6, R30, §9 pipeline |
| 3 | `A-no-override` needed edits in 12+ files instruments-core did not own | W0a removal-only grant on 14 named files, run before W0b edits | §1.2, §3.1 |
| 4 | legacy species deletion needed edits outside the deleting lanes | `machines/legacy.js` collapse at W0a; data-driven SPECS; instruments-b W2-exit deletion grant; `A-legacy-collapse`, `A-legacy-gone` | §1.2, §6, §9 |
| 5 | new GLBs in subdirectories were gitignored | `.gitignore` grant; `A-assets-tracked` in the global list | §1.2, §9 pipeline |
| 6 | IP still downloadable from the public history | decision 2: private now, then `filter-repo` + force-push or a fresh repo (Kevin's action); the IP gate is labelled a working-tree guarantee | §11 |
| 7 | one shared tree, Kevin's 5173 preview, default port 5173 | one worktree per lane (rule 10, §3.3); port guard grant + `A-port-guard`; orchestrator 5270, judges 5271 | §0, §1.2, §9 gates-perf |
| 8 | memory/swap/disk under 6-way concurrency | ≤ 2 gate Chromes (semaphore), disk/memory preflight, one-Chrome global run, local-disk ledger with a 3 GB floor | §0 rule 8, §4.6, `A-chrome-semaphore` |
| 9 | `A-no-horizon-terms` = 0 unreachable | split into a player-facing lint (0 at W4) and a code lint with a capped allowlist; W4 comment scrub verified by identical minified output | §7.4, §9 brand |
| 10 | W0 gates depended on W1/W2 deliverables | outfit merge, stow kit and v0 kit GLBs moved to hero-body W0; archer's crescent bracer from minute 0; Shepherd's Lance bob-shaped butt cap | §2, E9; bible §3.2, §3.9, §5.3 |
| 11 | budgets did not sum | Brea caps 10 + 17.5 + 9 + 3 = 39.5 k; NPC atlases ≤ 4 resident; render-target bucket + 450 MB total; 18 weapon variants; Dredge ≤ 52 bones | §4.1, §4.4, §4.5; bible §7.4 |
| 12 | worst frames missing | Kiln Yard and Cloudline ledgers, settlement and transect rows; A21 per biome vista + Kiln Yard at W3/W4; `A-unattributed-cap` | §4.2, §9 gates-perf |
| 13 | frozen hooks with no grant (uv1, input, player, arrows, VFX) | grants: `lod.js` uv1, `fx.js` palette, `input.js` actions, `player.mods` + climb/slide/ride, `combat.onArrowHit`; gates `A-uv1-survives-fold`, `A-vfx-palette`, `A-input-actions`, `A-player-mods`, `A-contract-arrow-filter`; bible §5.9 control table | §1.2, §3.2, §9 |
| 14 | traversal unowned and ungated | climb/slide to hero-body W0, baskets to settlements W4; `A-climb-1m`, `A-slide`, `A-basket`, `V-traversal` | §9; bible §3.7, §8.7 |
| 15 | fakeable or identity gates | A101/A-gaff-grip graded on knuckleToAxis / bladeAhead / buttToWrist; NPC silhouettes + faction pieces; face delta ≥ 6 mm + profile IoU; input-driven runs with emitter stacks (R31); height-normalised `A-sil40` with a Plumb–Transit bar; rendered lamp pixels; independent judges (R29) | §8.2, §9 |
| 16 | armor perks had no plumbing and self-written probes | published perk hooks; per-perk probes through the real path with negative controls | §3.2, §9 armory/core/combat-kit; bible §4.7 |
| 17 | first-hour gaps | provisional W3 run with the Plumb at ×6.5, final W4 run with the Transit; starting loadout, tutorial cards, walked leg, fallback beat per ✂ cut; W3 same-wave ordering | §3.1, §9 progression; bible §8.9 |
| 18 | spawn/REST had 10 copies and no owner | `REST` stub on day 1, Saltrow at W1; `A-single-rest` | §1.2, §7.1, §9 |
| 19 | W0/W1 gates staged on legacy HZD kinds | Tiller fixture + SKIP-legacy (R28) | §8.2, §9 |
| 20 | intra-wave dependencies and missing APIs | W0 split into day 1 / W0a / W0b; contracts table with stubs and gates (`walls.cut`, `ctx.datum`, `followLine`, arrow filter, perk hooks) | §3.1, §3.2 |
| 21 | Round-4 regression gates dark between waves | permanent `gates.r5.carried.mjs` + shadow-by-id protocol; orchestrator as standing owner | §3.3, §9 |
| 22 | settlement architecture unbudgeted | modular kits per settlement (≤ 12 draws, ≤ 150 k tris, ≤ 1.2 MB) with draw, collider and dispose gates | §2, §4.1, §9 settlements; bible §8.6 |
| 23 | core HZD loops unacknowledged | full overlap table; four loops changed (Steady, Kit Rack, Seized, certifications); corruption deleted; `A-distinct-verbs` | bible §5.8, §11.2; §9 |
| 24 | licence provenance not reproducible | W0b re-fetch for SHA-256s, `r5-src` staging, MIT code rows, Commons reference pull | §10, §4.6 |
| 25 | variant coverage and equipping | matrix + 3 poses + named pairs; motion gates re-run per variant; equip panel grant; acquisition table; loadout in A65 | §9 armory; bible §4.6 |
| 26 | open movement items | A31g, −0.55 pitch on A35/A16/A52, `A-melee-latency`, the A50 lance-in-hand clause, no-prance bars in `A-run-arms` | §9 hero-body, melee, armory |
| 27 | NPC faces and the Head ×1.06 contradiction | per-archetype faces from the face library + `A-npc-face-delta`; head scale dropped | bible §6.2; §9 settlements |
| 28 | no absolute memory ceiling | `A90-abs` (heap ≤ 450 MB, GPU process ≤ 1.5 GB) in the global list | §9 |
| 29–36 (minor) | fauna; music; tubes on a heightfield; DELETE leftovers; ports and gate owners; gates without numbers; ownership nits; save schema; the Aloy decision | island fauna + `A-fauna-biomes`; music regen + `A-music-palette`, `V-score`; trench + overhang shells + `A-tube-camera`, `A-tube-colliders`; POC hooks, donor lists, `npc/README.txt`, shells added to §6; 5270/5271 and the orchestrator as standing owner; numbers for A-weapon-role (pass at W3), A-gauge-neutral, A-herd-ripple, A12, A-tide, A73b; pan atlas and `lanceStow.js` handovers, `build:assets --only`; save v6 + schema hash with W0-era v5 handling; decision 1 | bible §8.7, §8.10, §9.9; §1.2, §6, §9, §11 |
