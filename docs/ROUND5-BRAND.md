# ROUND 5 — lane `brand`, W0-day1 (mechanical pass)

Port 5253 · tree `scratchpad/r5/brand/tree` (branch of c32e968) · plan §7.1, grant §1.2 (brand W0-day1),
gate block §9 "brand / W0-day1". Wordmark, fonts, loading copy, README and the lints are **not** in this
wave (W0b).

Everything below was measured on port 5253 in this tree. "Before" numbers come from the same tree with the
pass not yet applied (first runs of the day) or temporarily reverse-applied (`git apply -R` of the saved
patch, re-applied and verified byte-identical with `cmp`).

---

## 1. What was built

| item | where | notes |
|---|---|---|
| rest-point stub | `src/world/island/sites.js` (new) | `REST`, `REST_SITE` at today's values |
| extent stub | `src/world/island/extent.js` (new) | `PLAY_RADIUS = 330` and the `EXTENT` offset table |
| terrain re-export | `src/world/terrain.js` | `export { PLAY_RADIUS }` from the stub (same binding, `T.PLAY_RADIUS === E.PLAY_RADIUS`) |
| camp literals → imports | 18 files | the 10 grant copies (`player.js` CAMP_POS, `ui/map.js`, `ui/menu.js`, `world/props.js`, `world/terrain.js` CAMP_KEEP, `npc/waypoints.js`, `world/vegetation.js`, `items/gather.js`, `machines/index.js`, `machines/machine.js`) **plus** every other numeric camp literal `A-single-rest` greps for: `ai/doctrine.js` siteAnchor keep-out, `core/progression.js` campfire fallback, `world/fauna.js`, `world/camp.js` FIRE_X/Z, `props/settlement.js` FIRE_X/Z, `props/activities.js`, `props/places.js` ×2, `props/npcs.js` ×3, `terrain.js` worn-path origins ×4, `waypoints.js` fire station + 2 seat facings |
| extent literals → imports | 8 kept files | `player.js` 330/312, `nav.js` 332/324, `machine.js` 318, `gather.js` 315, `machines/index.js` 310, `ai/search.js` 310, `ai/doctrine.js` 296, `ai/squad.js` 285. Content-file radials (`terrain.js:645/738/3368`, `water.js:86`, `props.js:296/379`, `strider.js`) left to world-ground/world-props as the grant says |
| project prefix | src/, tools/, index.html | `hzc`→`cal`, `HZC`→`CAL` (1,782 + 22 occurrences in 60 files): `.cal-*`, `--cal-*`, `#cal-prog`, `[CAL]`, GLSL uniforms `cal*`, userData flags `__cal*`, globals `__CAL_MENUS_BOOT__`, `CAL_AUDIO_RECIPES`, chrome-profile root/env/dir names |
| storage keys | `core/save.js`, `ui/settings.js`, `audio/audio.js`, `ui/map.js`, `ui/hud.js` (+ the Round-4 gates that name them) | `cal.save.v5`, `cal.checkpoint.v5`, `cal.meta.v5`, `cal.settings.v5`, `cal.audio.v5`, `cal.map.v5`, `cal.hud.tips.v5`; `SAVE_VERSION` 4 → 5 so payload and key agree |
| events | emitters + listeners + gates | `fieldbook-found`, `cache-found`, `undercut` (also the melee `hit.type`), `sighting-on/off/pulse`, `steady-start/end`, `instrument-fouled`, `net-fouled` |
| ctx members | all readers | `ctx.sighting`, `combat.steady`, `player.gourd` (+ `maxGourd`, `addGourd()`, getter `gourdDoses`) |
| asset rig row | `core/assets.js` SPECS key, `player.js`, `clipLibrary.js`, `tools/r5-poc/pocHuman.js` | `assets.models.hero` (still loads `/models/aloy.glb` until hero-body swaps the body) |
| package | `package.json` | `"name": "calima"`, `"description": "CALIMA — a survey-machine hunting game"` |
| rename table as data | `tools/lint/rename-map.json` (new) | the §7.1 "from → to" rows with their grep regexes; the gate reads it, W0b `namecheck.mjs` folds it in |
| lane gates | `tools/gates.r5.brand.mjs` (new) | 5 gates, below |
| harness registration | none (`tools/gates.mjs` untouched, byte-identical to `main`) | the lane file is merged through the runner's existing `--extra <file>` flag until gates-perf's `A-gates-autodiscover` (W0a); see §3 |

No logic changed. Every replacement is either a rename applied to every reader and writer at once, or a
literal replaced by an import whose value is identical (proved numerically, by hashes of the world, and on
film below).

---

## 2. Contracts published (exact signatures)

### `src/world/island/sites.js` (brand stub; world-ground owns it from W1)

```js
export const REST      = Object.freeze({ x: 18, z: 26 });          // spawn + "RESPAWN AT CAMP"
export const REST_SITE = Object.freeze({ x: 22, z: 30, r: 25 });   // site centre (campfire) + Instrument no-spawn ring radius
```

Consumers today: `player.js` (CAMP_POS), `ui/menu.js` (title dolly + death respawn), `ui/map.js` (camp marker)
read `REST`; `machines/index.js` and `machines/machine.js` use `REST_SITE` itself as their `CAMP` (`{x,z,r}`);
`terrain.js` keeps machine routes out of `REST_SITE.r + 6` (= the old 31, the same ring `Machines._route`
builds); `ai/doctrine.js` keeps site anchors 46 m from `REST_SITE`; props/vegetation/gather/waypoints/npc/
fauna/camp/settlement/activities/places read `REST_SITE.x/z`. No imports, frozen, safe from node and page.

### `src/world/island/extent.js` (brand stub; world-ground owns it from W1)

```js
export const PLAY_RADIUS = 330;
export const EXTENT = Object.freeze({
  navSpan: 2,      // core/nav.js R           (332)
  edgeSoft: -18,   // entities/player.js EDGE_SOFT (312)
  navOuter: -6,    // core/nav.js OUTER       (324)
  machineRim: -12, // machines/machine.js WORLD_LIMIT (318)
  gatherRim: -15,  // items/gather.js         (315)
  routeRim: -20,   // machines/index.js _route (310)
  searchRim: -20,  // machines/ai/search.js   (310)
  anchorRim: -34,  // machines/ai/doctrine.js siteAnchor (296)
  fleeRim: -45,    // machines/ai/squad.js stepFlee (285)
});
```

Every consumer computes `PLAY_RADIUS + EXTENT.<name>`; `player.js` WORLD_R is `PLAY_RADIUS`;
`world/terrain.js` re-exports `PLAY_RADIUS`. When world-ground derives `PLAY_RADIUS` from `WORLD_SIZE`
(≈ 490 m at 1024 m) every margin moves with it. `nav.js` N stays `(R*2)/CELL + 1` (333 today; keep R an
integer).

### Renamed runtime names other lanes now code against

| was | is | kind |
|---|---|---|
| `ctx.focus` | `ctx.sighting` | ctx member (the `FocusSystem` class keeps its name until shell-ui W2) |
| `combat.concentration` `{active, gauge}` | `combat.steady` `{active, gauge}` | ctx member (engine timescale slot name `'concentration'` and `hud.surfaces().concentration` are not ctx members and were left) |
| `player.pouch`, `player.maxPouch`, `player.addPouch(n)`, `get medicine()` | `player.gourd`, `player.maxGourd`, `player.addGourd(n)`, `get gourdDoses()` | ctx member (save payload keys `pouch`/`maxPouch` inside the v5 snapshot unchanged — progression owns the schema, v6 at W3) |
| `assets.models.aloy` | `assets.models.hero` | asset row (`SPECS.hero`; pipeline's W0a data-driven SPECS builds on it) |
| `datapoint-found`, `supply-cache`, `silent-strike`, `focus-on/off/pulse`, `concentration-start/end`, `machine-tied`, `rope-attached` | `fieldbook-found`, `cache-found`, `undercut`, `sighting-on/off/pulse`, `steady-start/end`, `instrument-fouled`, `net-fouled` | events (payloads unchanged) |
| `hzc.*` storage keys | `cal.save.v5`, `cal.checkpoint.v5`, `cal.meta.v5`, `cal.settings.v5`, `cal.audio.v5`, `cal.map.v5`, `cal.hud.tips.v5` | localStorage (old keys are never read: fresh start) |
| `.hzc-*`, `--hzc-*`, `#hzc-prog`, `[HZC]` | `.cal-*`, `--cal-*`, `#cal-prog`, `[CAL]` | CSS / DOM / log tag |
| `$TMPDIR/hzc-chrome-profiles`, `HZC_CHROME_PROFILE_ROOT`, `hzc-<pid>-<port>-<n>` | `$TMPDIR/cal-chrome-profiles`, `CAL_CHROME_PROFILE_ROOT`, `cal-<pid>-<port>-<n>` | gate harness |

---

## 3. Gates

**How the lane file is registered.** `tools/gates.mjs` is frozen for brand (§1.1: the harness is
gates-perf's W0a grant; brand's W0-day1 grant is renames only), and its directory scan merges
`gates.round4.*.mjs` only. The runner already has `--extra <file>`, which imports one more module and
merges its `GATES` exactly as a scanned lane file (same loader, same load-failure reporting, same
duplicate-id rule, `--lane` filter sees its rows). So, until gates-perf lands `A-gates-autodiscover`:

```
node tools/gates.mjs --port 5253 --extra tools/gates.r5.brand.mjs --lane brand
```

runs the five lane gates (`[gates] merged 28 lane file(s): gates.round4.anim-core.mjs, …, /…/tools/gates.r5.brand.mjs` on stdout).
Once `gates.config.mjs` imports `tools/gates.r5.*.mjs` by pattern, the same command without `--extra`
(`node tools/gates.mjs --port 5253 --lane brand`) runs them; leaving `--extra` on then only logs one
"duplicate gate id … keeping the first" line per gate and runs nothing twice. Carried/global gates run by
id with the same flag: `--extra tools/gates.r5.brand.mjs --only A1-boot-clean,A20b-no-system-errors,…`.

### 3.1 W0-day1 block

| gate | verdict | measured |
|---|---|---|
| `A-identifiers-renamed` (runner, node grep of 223 files in src/ tools/ index.html) | **PASS** | 0 hits on all 24 rows of `tools/lint/rename-map.json` (prefix, 7 storage keys, 10 events, ctx members incl. audited `p.`/`this.` receivers, asset rig row); package name/description OK. Excluded: `tools/lint/` (the lexicon itself, §7.4) and `tools/r5-poc/direction-a/horizon-lexicon.txt` (lexicon data). Informational, not failed (§7.1 "removed events" owned elsewhere): `override-node` 13, `cauldron-override` 3 (instruments-core W0a), `hunting-ground` 18 (progression W3) |
| `A-extent-refactor` | **PASS** | all 10 values `PLAY_RADIUS + EXTENT.x` = 330/312/332/324/318/315/310/310/296/285; grep: 0 of those literals left in the 8 kept files, each imports `extent.js` and uses its key; terrain re-export same binding. Old-map probes identical to the pre-pass baseline: nav N 333, **cost-grid hash `92662038`**, **20 fixed `nav.path` queries hash `66a0055d`** (0 nulls), terrain 96×96 height hash `88b3916f`, 4,826 static colliders hash `e8c8ba84`, 203 gather nodes hash `fa5d3dbc` (max r 309.325 < 315), `_route` rim clamp 310 / camp keep-out 31, machine root clamp 318 / no-spawn ring 25, doctrine anchor rim 296 / camp 46, player held at r 329.97 (≤ 330) |
| `A-single-rest` | **PASS** | grep: 0 numeric camp literals in 139 `src/` files (4 named non-camp coincidences allowed by exact line: `tables.js` guard band, `sawtooth.js` damage comment, `fauna.js` stat block, `npc.js` clock times); all 18 rewired files import `sites.js`. Spawn (18, 26), **0.00 m** from REST. Death at 104 m → death card → **RESPAWN AT CAMP** → (18, 26), **0.00 m**, state `playing`, health 100. No-spawn ring centred on REST_SITE (machine pushed to exactly r 25 + bodyRadius), route keep-out 31, doctrine keep-out 46, campfire 0.00 m from REST_SITE; nearest live machine 67.7 m from REST_SITE |
| `A1-boot-clean` | **PASS** | `state=playing`, 0 console errors (before: PASS) |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 337 frames advanced (before: PASS, 342) |

### 3.2 Storage keys (brand W0b gate, implemented and passing now)

| gate | verdict | measured |
|---|---|---|
| `A-storage-keys` | **PASS** | save, checkpoint, settings change, audio volume, map opened, tip shown → localStorage holds exactly `cal.audio.v5, cal.checkpoint.v5, cal.hud.tips.v5, cal.map.v5, cal.meta.v5, cal.save.v5, cal.settings.v5`; 0 keys off `/^cal\..*\.v5$/`. It then plants all 7 pre-Round-5 keys holding **current-format** values (a valid v5 save, sensitivity 2.75, music 0.123, a fully revealed 5,184-cell fog, three seen tips) and clears ours |
| `A-storage-keys-reload` | **PASS** (3/3 after the fix below) | the next boot (same profile, only old keys present): no save; the only checkpoint is the game's own `'start'` checkpoint written 1.5 s into a run with none under the new key (never the planted one); meta fresh, sensitivity 1 (default), music 0.8 (default), fog 284/5,184 seen, tips fresh; old keys byte-identical (never rewritten), 0 stray keys, **0 console errors**; cleans the plants up. One earlier run FAILED its first-draft check "no checkpoint at all": the game had written its `'start'` checkpoint before the read (timing); the check now accepts exactly that and nothing else |
| positive control (scratch, not shipped) | see §3.5 | the same plants under the NEW keys are picked up by the reload, so the fresh start above is evidence, not a blind probe |

### 3.3 Carried gates that must not move (same port, same tree)

| gate | before the pass | after the pass |
|---|---|---|
| `A2-dodge-displacement` | PASS 4.84 m | PASS 4.78 m |
| `A3-sprint-speed` | PASS 6.63 m/s | PASS 6.61 m/s |
| `A11-idle-alive` | PASS 79.1 mm | PASS 82.3 mm |
| `A13-no-skate` | **4/12 PASS** (passes 0.0018–0.0023 m; fails 0.081–0.084 m) | **3/16 PASS** (passes 0.0015–0.0023 m; fails 0.074–0.084 m) |
| `A9-perf-budget` | PASS 319 draws, 48.1 fps (inventory, same commit) | PASS 319 draws, 48.1 fps |
| `A21-real-draw-calls` | FAIL on the GPU term: draws 319/211/343, tris 4.24/3.92/4.37 M, GPU DPR2 84.1/110.1/91.0 ms (inventory §, same commit) | FAIL on the GPU term: draws 319/211/343, tris 4,235,746/3,915,284/4,367,398, GPU DPR2 83.4/106.9/88.7 ms |
| `A79-runner-verdict-line` | — | PASS |
| `A80-chrome-profile-hygiene` | — | PASS (sweeps `cal-*` dirs under the renamed root) |
| A90 family | see §3.5 | see §3.5 |

`A13` is **not green and was not green before**: the same sprint course fails the same two stance windows
(7 and 9) by the same 0.07–0.08 m on the unmodified code as on the renamed code; the pass/fail split is
4/12 vs 3/16 (Fisher exact, not significant). It is the Round-4 intermittency R27 closes on Brea
(hero-body W0b, 5/5). `A21` fails only its GPU term, exactly as the inventory recorded on this commit
(engine-gpu W0a/W0b). Neither is caused or fixed by a rename pass, and this wave may not change logic.

### 3.4 Visual identity (filmed and read)

Frames: `scratchpad/r5/brand/frames/{before,after}/BASE-V-{spawn,title}.png` (1600×900, `?shot=1` spawn view
and the plain title screen). Read side by side: same camera, same camp layout, the same HUD (compass `S 180`,
quest card "Speak with Varl at the campfire", 8 m marker, weapon panel, tool strip, XP bar) in the same
fonts and colours; the title dolly frames the same camp from the same sector with the same lockup. Pixel
diff: weapon panel mean |Δ| **0.008**, compass 0.08, title lockup 0.36; whole spawn frame 2.7 (NPC and
idle animation phase, campfire flicker), whole title 0.66 (dolly time). The CSS prefix rename left no
unstyled element.

### 3.5 A90 family, storage controls, and every Round-4 gate the rename touched

A90 family, one run, quiet-ish box (load 3–4, Kevin's 5173 alive), all **PASS**:

| gate | measured (bar) | pre-pass reference (inventory, same commit) |
|---|---|---|
| `A90-memory-stability` | 30 kills; heap 348.2 → 322.5 MB **−7.4 %** (< 25 %); geometries **+13** (≤ 40); textures **−19** (≤ 8); scene objects **−526** (≤ 60) | −7.8 %, +12, −19, −526 |
| `A90-memory-stability-expansion` | objects +28 (≤ 600), nonMachineGrowth **0**, orphan roots 0, heap −3.7 % | PASS (Round 4 5/5) |
| `A90b-memory-attribution` | 0 offenders, 0 orphaned textures, heap −4.9 % after forced GC, 0 late uploads | PASS (Round 4 5/5) |
| `A90-rig-reclaim` | 30 cycles over 17 kinds: geo +5 (≤ 40), tex 0 (≤ 30); per live machine geo 0 / tex 0.25 (≤ 1); held-then-released 0 / 0 | FAIL 2/6 at perLiveGeo 1.13 in Round 4; PASS here |

Every Round-4 gate whose body the rename edited (28; found by matching each gate's setup/assert/title
against the added diff lines) was re-run: **27 action gates PASS** — `A73d-ui-bus`, `A73e-melee-traps`
(hears `undercut`, `net-fouled`, `instrument-fouled`), `A93-combat-dom-bounded`, `A50-silent-strike`
(emits `undercut`, kills), `A53-conc-not-on-sprint` (`combat.steady`), `A62-focus-components`,
`A63-loot-reveals` (`ctx.sighting`), `A66-quest-objectives-expansion`, `A99-dialogue`,
`A67b-site-ledgers-expansion`, `A64-xp-loop`, `A65-save-restore` (cal.save.v5 round-trip),
`A66-quest-objectives`, `A64b-damage-channels`, `A64c-silent-apex` (`hit.type 'undercut'`),
`A71-compass-truth`, `A71b-hud-scale-floor`, `A71d-conc-veil` (`steady-start/end`), `A71e-tutorial-cards`,
`A70-hub-tabs`, `A72-settings-persist` (cal.settings.v5), `A72b-accessibility` (`--cal-*` palette swap),
`A78b-cast-pose-set`, `A79b-studio-shell` (`cal-*` overlay stack), `A79f-photo-entry`, `A57-aerial`
(`cal*` fog uniforms), `A61c-datapoints-unified` (`fieldbook-found`). The one visual, `V36-focus-scan`, was
filmed and read (advisory; the independent judge grades): violet vignette with the world still in colour,
yellow labels naming BLAZE CANISTER / POWER CELL / ANTENNA / HIP ARMOR with their loot, the holo card
listing 7/7 components with WEAK/TEAR/BLAZE/FREEZE tags and loot rows — the Focus CSS survived the prefix
rename; the patrol ribbon is edge-on in this frame and cannot be graded as a curve from it.

Storage positive controls (scratch `--extra` gates, not shipped): planting the same values under the
**new** keys and reloading picks every one of them up — save present, sensitivity 2.75, fog 5,184/5,184,
tips include `craft`, and (with no settings key, the condition `A-storage-keys-reload` runs under) music
0.123. So the "fresh start" in §3.2 is the old keys being ignored, not a probe that cannot see.

---

### 3.6 Fix round 1 (judge finding: logic edit to the frozen harness)

Finding: the first pass widened `tools/gates.mjs`'s lane-file filter to `gates.(round4|r5).*` — a logic
edit to a file §1.1 freezes for every lane but gates-perf, outside brand's rename-only W0-day1 grant.
Fix: `tools/gates.mjs` restored from `main` (`git diff main -- tools/gates.mjs` is empty; the file is no
longer in `git status`). Registration now goes through the runner's existing `--extra` flag (§3 intro);
nothing else changed. Re-run on port 5253 in this tree after the revert:

| run | result |
|---|---|
| `--extra tools/gates.r5.brand.mjs --lane brand` | **5 gates: 5 pass** — A-identifiers-renamed 0 hits / 223 files / 24 rows; A-extent-refactor all 10 values equal, nav cost `92662038`, path `66a0055d`, terrain `88b3916f`, colliders 4,826 `e8c8ba84`, gather 203 `fa5d3dbc`; A-single-rest spawn 0.00 m, respawn 0.00 m, 0 grep hits / 139 files; A-storage-keys 7 `cal.*.v5` keys, 0 bad; A-storage-keys-reload all 9 checks, 0 console errors |
| A1 / A20b | PASS `state=playing` / PASS 0 system errors, 0 hook errors, 337 frames |
| A2 / A3 / A11 | PASS 4.84 m / PASS 6.63 m/s / PASS 64.3 mm |
| A13 | 3/6 PASS (passes 0.0015–0.0023 m; fails 0.0767–0.0841 m in stance windows 7 and 9) — the same pre-existing intermittency as §3.3 (unmodified code 4/12) |
| A79 / A80 | PASS / PASS |
| A90 family | A90-memory-stability heap **+0.8 %**, geo **+13**, tex **−19**, objects **−525**; -expansion nonMachineGrowth 0, objects −527; A90b 0 offenders, heap −4 % after GC; A90-rig-reclaim geo +7, tex 0, per-live 0 / 0.25, held-released 0 / 0 — all PASS |
| BASE-V-spawn / BASE-V-title re-filmed, read | same camera, camp, HUD and lockup as the pre-pass frames; weapon panel mean abs diff 0.012, compass 0.077; whole title 0.42 |

## 4. Honest gaps

1. **A13 is intermittent before and after** (§3.3). Not a W0-day1 regression; owner hero-body (R27).
2. **A21 GPU term fails before and after** (inventory). Owner engine-gpu.
3. **"RELOAD CHECKPOINT" with no save does not move the player** although its sub-label reads
   "NO SAVE — RESPAWN AT CAMP": traced on the unmodified code, the player stays where she died. Only
   "RESPAWN AT CAMP" lands on REST. Pre-existing; logic, so untouched. Owner: shell-ui (menus, W2) or
   progression (W3).
4. `A-extent-refactor`'s hash half is the **day-1 old map**: any later content change (W0a deletes
   `npc.glb` and the IP machines; W1 moves the extents) legitimately changes the collider, nav and gather
   hashes. It is a W0-day1 exit gate; brand retires or re-baselines it at W0b, and `A-reach-all-sites`
   takes over the extents at W1. Do not read a later FAIL of its hash half as a rename regression.
5. Left on purpose (content names die with their content, §7.2): skill ids `prowler-silent-strike`,
   gate id `A50-silent-strike`, mesh name `activity-supply-caches`, audit ids in comments
   (`stealth-silent-strike-missing`), Aloy rig names, species, places, quests, the `aloy/*` audio sets.
6. Not in this wave: wordmark, fonts, loading copy ("Calibrating …" now reads "Calibrating hero…" for the
   renamed asset row), README, `docs/archive` moves, the two lints (W0b).

---

## 5. For the orchestrator and other lanes

1. **Vite dep cache would clobber Kevin's 5173.** Vite's optimizer hash includes the project root, so a
   lane tree whose `node_modules` is a symlink to main's gets a different `configHash` (`89346238` here vs
   main's `1324183e`) and re-optimizes into `node_modules/.vite` **through the symlink — main's cache, the
   one the 5173 server is using**. This lane avoided it by replacing its own tree's `node_modules` symlink
   with a link farm in `scratchpad/r5/brand/nm/` (one symlink per package of main's `node_modules`, no
   `.vite`), so its cache lived in scratch; main's `_metadata.json` is untouched (still Oct 15 01:10).
   The symlink is restored to main's `node_modules` at the end of this lane. Give every lane tree the same
   link farm (or a `cacheDir`) before W0a starts.
2. Brand does **not** touch `tools/gates.mjs` (byte-identical to `main`). Until gates-perf's
   `A-gates-autodiscover` lands at W0a, every Round-5 lane file (brand's and the other day-1 lanes') is
   run with `--extra tools/gates.r5.<lane>.mjs`; the orchestrator's day-1 lane commands need that flag.
   gates-perf: `tools/gates.r5.brand.mjs` is the first `gates.r5.*` file for the discovery pattern to pick
   up; it exports `GATES` in the Round-4 shape with `lane: 'brand'` on every row.
3. Chrome profiles now live in `$TMPDIR/cal-chrome-profiles` (`CAL_CHROME_PROFILE_ROOT`). Any orchestrator
   script or semaphore path that names the old root/env must follow; the old root on this box is empty.
4. Outside brand's scope and still carrying the old prefix: `.hzc-inspect.mjs` (repo-root GLB inspector,
   no runtime reader) and `.claude/launch.json` config name `hzc-dev`; `package-lock.json` `"name"` is
   still `horizon-zero-claude` (npm rewrites it on the next install).
5. Lanes coding against renamed names: pipeline builds `SPECS.hero` on the existing `hero` row; hero-body
   reads `assets.models.hero`, `player.gourd`; combat-kit/shell-ui listen for `steady-*`, `sighting-*`,
   `undercut`, `instrument-fouled`, `net-fouled`, `cache-found`, `fieldbook-found`; progression keeps
   `SAVE_VERSION` 5 until its v6.
