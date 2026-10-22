# ROUND 5 — lane `gates-perf`: W0a exit (R33) and W0b — fix round 1

Port 5255. Tree `scratchpad/r5/gates-perf/tree` → `~/.calima-r5/trees/gates-perf`, branch `r5/w0a-gates-perf`.
Oct 22 2026, 13:16–15:25Z. Plan rows: §2 gates-perf, §1.2 harness grant, §3.1 W0a + W0b exits, §3.2
`gates.r5.carried.mjs`, §4.2 / §4.4, §6 (`reference/*.jpg`), §8.3 R33, **R33 (g)** and **R34**, §9 gates-perf.
The orchestrator synced main's PLAN (with R33 (g), R34 and the rule-8 slot amendment) into this tree at 14:42Z,
byte-identical to main's; it is not my edit. The orchestrator's WIP checkpoints `8d7cede` (13:50Z) and `7cdc46f` (15:09Z)
committed this round's code edits and that PLAN sync, so `git status --short` shows only this report. The previous report
is in git history (`e2ed551`).

**Part A (the W0a exit under R33) can merge first. Part B is the W0b work.** §5 lists the files of each part.

## FR. Fix round 1: the findings, what changed, what was measured

Sixteen findings came from two judges. Several are duplicates, so they group into 12 items. Every item was re-run on
port 5255 after the change. One full carried run was taken this round (`p5255-98487-1792676939017`, 13:49–14:53Z), then
the lane block (14:53–15:04Z), then sealed partial re-runs of the known-flaky rows and A9.

| # | finding (severity) | what changed | measured after the change |
|---|---|---|---|
| 1 | **R33 (g) not implemented**: A-carried-suite still graded the rows hero-body shadows (major ×2, and part of the blocker) | `carriedSuite()` classifies R33 (g)'s id set as **`skipShadowed`** with the note `SKIP-shadowed(hero-body): R33 (g) …`. A row is in the set when it is in V1–V4, V12–V14, A2–A19, A28 or A31–A33 **and** its §9 absorbing lane is hero-body. The §9 table gives A4/A5 to armory, A6–A8 to the per-kind block, A9 to gates-perf + engine-gpu and A10 to shell-ui, so those stay graded here. V21 stays graded here (R33 c). After hero-body's exit the orchestrator grades the set with `CAL_SHADOW_EXITED=hero-body`. The rows are still observed, and what each run saw is listed under `detail.shadowed`. | **35 rows SKIP-shadowed** (28 action, 7 visual: V1–V4, V12–V14), including A13, A19, A31b, A31c, A31e and A31f. `detail.shadowed.planHasR33g: true` (this tree's synced PLAN). The 8 "awaitingJudge" rows of the last round are now **1** (V21). |
| 2 | **V13 staging does not assert the aim state** (major ×2) | V13's setup asserts the aim state twice: before the camera lock and again at the freeze. It checks: player aiming; combat holds the weapon drawn; the bow is parented under the **animator-published** left hand `HB('handL')` (no bone literal) and shown (`bowVis ≥ 0.9`); upper-body aim layer `_aimW ≥ 0.9`; stepping ≥ 0.5 m/s. Any miss draws a new **STAGING FAILED card** (`gate-roster.mjs` `FAIL_CARD`, dark red) naming the miss and leaves `window.__V13_STAGE__`. A-carried-suite reads that card as a **FAIL** of the row, never as a SKIP (`isFailCard`). Two filming fixes make the frame the one the recipe names. (a) The lock freezes the aim point; without it the moved lens re-aimed the bow at its own ray. (b) The aim zoom targets the recipe's 24°; combat's aim-FOV damp had pulled the lens back to the weapon's 44° every frame, so the old frame was twice as wide as the recipe. No draw is held: R33 (g) asks for "aiming, bow in hand", and the Round-4 recipe aims without drawing. | Probe of the row's own setup + settle: `{aiming: true, weaponDrawn: true, bowVis: 1, bowInLeftHand: true, upperBodyAimW: 1, speed: 1.37 m/s, fov: 24}`, frozen. The sealed full-run frame (`…/p5255-98487-…/V13-aim-strafe.png`) **was read**: front view at 24°, bow upright **in her left hand**, raised to shoulder height, lance stowed on her back, mid-step. It is no longer the stowed-bow frame the judge saw. V13 is SKIP-shadowed (hero-body grades it on Brea). |
| 3 | **A70b-fast-travel: my own staging defect** (major, part of the blocker) | The row's "never visited" point is now the first candidate (the Round-4 offset first, then 64 points on rings round the fire) that the live fog reports **unseen** through `FogOfWar.seenAt` and that lies on the map (`worldToMap` inside the canvas). Nothing is revealed or cleared. If every candidate is revealed, the row FAILs by name. The refusal must now give the right reason (`/UNDISCOVERED/`). The `fast-travel` listener is removed in `finally`. | Full run: **PASS** (`seenBefore: false`, reason `UNDISCOVERED — WALK THERE FIRST`). Polluted-fog control (the Round-4 point revealed first): **PASS**. It skipped 1 revealed candidate and used `(+300, 0)`. |
| 4 | **The "newlyStaged" exemption was self-granted** (major ×2) | Removed. A row that was a SKIP at baseline and stages now (R28) is graded like every other listed row: never worse than its baseline. A FAIL or unattributed PENDING is worse than a named SKIP, so it is **`worseThanBaseline`** and FAILs the gate with its owner named. Such rows keep a `newlyStaged` marker for the listing. | 28 newly staged rows: 24 PASS, **4 FAIL (A23, A23b, A71, A78b → FAIL the gate)**, 0 unattributed PENDING (next row). |
| 5 | **Two unattributed PENDINGs** (A42-expansion, A62-focus-components) | Their subject is a kind *with* a tearable component or named parts. The W0 roster is the R28 fixture only, which has neither, so this is R18's case. Both now return `SKIP-R18: no staged kind has … (staged kinds: tiller; the R28 fixture has none); the first lands with the Instruments lanes from instruments-a W1`. | Both `skipR18` in the full run (baseline `skipR18`): listed, not worse. |
| 6 | **R34: PERF_SCENARIOS were not self-contained** (major ×2) | `STAGE_PRELUDE` now splices the roster and places preludes **inside** the `__stage` closure (awaited) and publishes `__stage.KIND / ROLE_NOTE / roleSkip / PLACE / placeSkip / standAt / placesSource`. The scenarios read only those. Nothing is declared at the caller's top level except `__stage`, so A21 and the W0b rows, which also splice ROSTER/PLACES, do not collide. New self-test row **`A-perf-scenarios-self-contained`** evals every scenario in a page scope holding `STAGE_PRELUDE` and nothing else. | Self-test **PASS** (vista, herd and staged-fight all staged; 0 roster/place helpers visible outside `__stage`). engine-gpu's own **`A-rt-ledger-census` PASS on this tree** (it evals the scenarios with `STAGE_PRELUDE` only: 340.74 MB at DPR 1.25, GL recount equal to the byte). A21 in the full run staged all three scenarios (draws 309 / 232 / 337). |
| 7 | **A-unattributed-cap graded a noise-dominated value** (major) | The gate now grades the **direct per-draw count**: every `renderBufferDirect` call over 10 frames, bucketed by scene root and keyed by engine frame, with the partial first and last frames dropped. The graded value is the worst whole frame. The hide methods are re-measured as **paired** with/without readings. Each owner's hide delta must equal its direct count within ±1, and the unregistered roots hidden together must equal the direct unattributed count within ±1, else **PENDING** with the disagreement named. The hide-each-owner remainder is reported only. The `budgets.mjs` comment that said "the three methods agreed" is corrected. | **PASS, 5** (direct `[5,5,5,5,5,5,5,5]`; hidden together 5; per owner, hide vs direct: terrain 24/24, vegetation 77/76, landmarks 75/75, settlement 29/29, Instruments 32/32, hero 37/37, NPCs 15/16, VFX 19/19, all within 1). Same value in the validation run (13:41Z). |
| 8 | **A-alloc-rate graded only self-attributed bytes** (major) | It now grades **caller attribution**: every sampled byte is charged to the **nearest `src/**` frame** on its stack, for the total and per function. Self attribution is reported. The **empty-frame floor** (scene hidden on the same page) is measured and reported, not subtracted. `MEMORY_BUDGETS.alloc` records `attribution: 'caller'` and no allowance. | **FAIL, worse than before, as expected**: graded **116,476 KB/s** (staged fight, 28 fps; measured 54,351 KB/s) and 99,498 KB/s (sprint and draw, 30 fps) against 64; self attribution alone 78,065. Empty-frame floor: src 40,560 KB/s (the sim keeps running), of which **engine + frame loop 2,807 KB/s** (2,488 of it the cull traverse closure, `engine.js:1352`). The renderer floor proper is small, so no allowance is warranted. Function list by owner in B.6. |
| 9 | **A-chrome-semaphore FAILed once inside a lane run** (major) | The fingerprint could not say who wrote the tree's reports. Its `restore()` would also have overwritten a concurrent same-tree run's legitimate report. Now the semaphore's **children run under a write tracer** preloaded through `NODE_OPTIONS=--import=…`, inherited by every node descendant. Every fs write call (sync, callback and promise forms, open-for-write, createWriteStream) is logged with pid and resolved path. The gate grades **0 writes into the tree**, with a **positive control**: every real child run's `report.p<PORT>.json` write must be seen in the sandbox. The fingerprint is kept as **attribution**: a change no child made is another process's run, named from the new report's own `port`/`stamp`/gate ids, and is left alone. A child-made change is restored and FAILs. | Lane block: **PASS** (4 real runs, at most 1 Chrome over 329 samples; 531 traced writes from 22 pids, **0 into the tree**; positive control 6 report writes ≥ 4 runs). Foreign-writer control at 13:45Z: a fake `report.json` (port 5285) written into the tree mid-window was attributed `{port: 5285, gates: 1, ids: [FOREIGN-WRITER-CONTROL]}`, left as written, and the gate still **PASSED**. The 12:03Z event cannot be reconstructed: the old gate restored the files and overwrote the evidence. The new gate would name the writer. |
| 10 | **A-alloc-rate, A-vram-ledger and A90-abs FAIL on other lanes' code** (blocker ×3, major) | Not mine to fix (no §1.2 grant on `terrain.js`, `collision.js`, `nav.js`, `engine.js`, `clipLayer.js`, `playerAnimator.js`). Routing is refined: the allocation owner table now names the **frozen** rigging files (`anim/{boneSpace,restPose,clipLayer,retargeter,rigDebug,locomotion}.js`) and the frozen machine-rig algorithms (`gait.js`, `autorig.js`, `rig/*`) as needing grants. The exact lines are in §4. | All three still **FAIL, real** (B.6). A-vram-ledger: render targets 437.75 MB vs 170 at the shipped DPR 1.5. A90-abs: GPU process 1,537.2 MB vs 1,500 (1,410.8 MB at pixel ratio 1.25, reported). |
| 11 | **A-carried-suite FAILs** (blocker) | Items 1, 3, 4 and 5, plus A90b's owner taken from **R34** (`instruments-core`, an owner override recorded in the gate, `RULED_OWNER`). | **FAIL, truthfully**: 8 offenders after the partial re-runs (A.4): 3 regressions, 4 newly staged FAILs, 1 awaiting the judge. A9, A100 and A50b are decided PASS. None is a row I can fix inside the plan's rules this round, except possibly A92 (§3 gap 2). |
| 12 | (both judges) "take one fresh full carried run on 5270 with the orchestrator's ledger" | That is the orchestrator's run; §4 has the commands. My 5255 run is one observation. | — |

---

## 0. Result

Lane block, `node tools/gates.mjs --port 5255 --lane gates-perf` (**13 rows**), 14:53–15:04Z, report copied to
`scratchpad/r5/gates-perf/work/lane-fix1.report.json`: **9 PASS, 4 FAIL**. A-carried-suite was re-graded at 15:16Z in an
invocation of its own, after the partial re-runs (`work/acs-fix1.json`); that grading is the one quoted.

| gate | result | measured |
|---|---|---|
| `A-gate-preludes` | **PASS** | graded files (R33 e): `gates.config.mjs`, `gates.mjs`, `gates.r5.carried.mjs`, `gates.r5.gates-perf.mjs`, `budgets.mjs`, `gates/gates-perf.w0b.mjs`: 0 kind literals, 0 old-map coordinates, every prelude resolved, scanner self-test. Brand's and instruments-core's files are reported and graded at their own exits. |
| `A-gates-no-hero-literals` | **PASS** | 12 `tools/gate*.mjs` files, 0 hits; 17 carried rows read bones through the animator (V13 now does too: `HB('handL')`). |
| `A-gates-autodiscover` | **PASS** | 8/8 checks in child processes; 273 rows with the probes. |
| `A-chrome-semaphore` | **PASS** | 4 real `gates.mjs` runs at 1 slot: 4/4 PASS, 3 waited, **at most 1 Chrome over 329 samples**. 4 stand-ins at 2 slots: at most 2 alive, 0 tickets left. SIGKILL: B blocked while A held, done 0.68 s after `kill -9`. Preflight at simulated 2.5 GB disk / 20 % memory: both harnesses exit 1, "preflight refused", 0 Chromes. **Write trace: 531 calls from 22 child pids, 0 into this tree**; positive control 6 sandbox report writes ≥ 4 real runs. The tree's 5 report files were unchanged. |
| `A-carried-suite` | **FAIL** (true state) | Composition 236/236, baseline git-anchored (`766e49b`), 1 complete sealed full run on this build + 3 sealed partial re-runs. Final grading in an invocation of its own (15:16Z, A.4): **FAIL: 8 offenders.** 3 regressions: A90b → instruments-core (R34), A73 → audio (the Tiller fixture's voice sets have no seeds), A92 → combat-kit (intermittent, §3 gap 2). 4 worseThanBaseline, all newly staged: A23, A23b, A71, A78b. 1 awaitingJudge: V21. Tally: 103 pass, **35 skipShadowed (R33 g)**, 59 listed, 29 skipReplaced, 2 skipR30. Known-flaky rows: A100 **PASS** (3 of its first 4 observations: pass / fail / pass / pass), A50b **PASS** (3/3). A9 **PASS** (59.9 fps on a quiet box; 3 attributed PENDINGs not counted). |
| `A-reference-clean` | **PASS** | 13 images under `reference/`, all with rows (11 PD, 1 CC0, 1 CC BY 2.0); the 19 deleted stills recorded with sha256, 0 present by name, 0 by content; V12 / V22 / V24 / V46 / V48 → `reference/r5/gates-perf/*`. |
| `A-reference-set` | **PASS** | Commons fetcher, classifier controls 10/10, the set verifies offline (13 stored); 8/8 graded visual rows name a reference; 29 SKIP-replaced rows reported with their absorbing lanes. |
| **`A-perf-scenarios-self-contained`** (new, R34) | **PASS** | vista, herd and staged-fight staged in a scope holding `STAGE_PRELUDE` only (cast: 8 × Tiller with the R18 fallbacks named); 0 helpers leaked; every unpin worked. |
| `A-alloc-rate` | **FAIL** | caller-attributed src/** **116,476 KB/s** graded (staged fight, 28.0 fps, 1,941 KB/frame; measured 54,351 KB/s) / **99,498 KB/s** (sprint and draw, 30.3 fps) vs **64**; self attribution alone 78,065. Worst function `noise2D` (terrain.js:78) **18,297 KB/s** vs 4. Post-GC heap slope **+144.4 / +60.4 KB/s** vs ≤ 0. Drive witnessed: sprinting 60 %, aiming 40 %, 6.87 m/s max, 3 arrows at full draw. Empty-frame floor reported: src 40,560 KB/s, engine + frame loop 2,807 KB/s. |
| `A-vram-ledger` | **FAIL** | textures 105.46 MB (≤ 160 PASS), **render targets 437.75 MB (≤ 170 FAIL)**, geometry 79.54 MB (≤ 120 PASS), total 622.75 MB (≤ 450 FAIL); tier high, pixel ratio 1.5, 2400 × 1350. |
| `A90-abs` | **FAIL** | post-GC JS heap **82.72 MB** (≤ 450 PASS); Chrome GPU-process footprint **1,526.7–1,537.2 MB** over the 60 s fight (≤ 1,500 FAIL); 30 kills / 30 respawns (Tiller). Reported: 1,410.8 MB at pixel ratio 1.25. |
| `A-unattributed-cap` | **PASS** | **5** draws/frame unattributed by the direct count (cap 5), worst of 8 whole frames `[5,5,5,5,5,5,5,5]`; cross-checks agree (hidden together 5, every owner within 1); 335 draws total, post chain 22. |
| `A-port-guard` | **PASS** | 16 refusals (8 cases × 2 harnesses); lsof control saw its own connection; 0 connections to :5173 from this run's process tree over 298 samples (14:53:48–15:03:42Z, max gap 2.04 s) and over the sealed full run's own monitor (1,933 samples, max gap 2.19 s); full lane run. |

The box was loud again. The full run's own monitor saw a quiet fraction of **7 %** (load max 6.94, 1 other gate Chrome)
against the baseline runs' 39–66 %. Every clock-dependent number is reported with its box; the orchestrator's 5270 run is
authoritative.

---

# Part A — the W0a exit under R33

## A.0 Summary

| item | status |
|---|---|
| A-carried-suite as a regression guard vs the recorded W0-day1 baseline | **built and graded**. FAIL, truthfully (A.4): 1 kept visual row awaits an R29 judge (V21), 3 action rows regressed against the baseline (A90b and A73: instruments-core / audio; A92: intermittent, see §3 gap 2), 4 newly staged rows fail (A23, A23b, A71, A78b). The known-flaky A100 (3 of its first 4 observations) and A9 (59.9 fps on a quiet box, R26) both PASS now |
| `tools/gates/carried-baseline.json` written once, with the box sample | written Oct 19 (3 sealed runs, box sample per run), committed in `766e49b`, **not rewritten**; anchored by git (byte-identical to the first committed version, internally consistent) |
| visual rows graded only for kept systems by an R29 judge | V1–V4 and V12–V14 are **SKIP-shadowed(hero-body)** under R33 (g); **V21** is graded here (awaiting the orchestrator's judge); 29 other visual rows `skipReplaced`, each naming its absorbing lane |
| R33 (g) | implemented (FR 1): 35 rows `SKIP-shadowed(hero-body)` |
| V13's staging asserts the aim state or fails by name (R33 g) | implemented (FR 2); measured and filmed |
| sealed runs bound to their frames; no report overwritten by a semaphore child | seal v3 unchanged; the semaphore's children are now **traced** (FR 9): 0 writes into the tree, positive control, foreign writers attributed and never overwritten |
| A-gate-preludes on own files + carried.mjs | **PASS** |
| A9 on R26 | carried row: draws < 350 always, median fps ≥ 58 graded on a quiet box only. This round: draws 309 every run; median 40.0 / 39.7 / 39.7 fps PENDING at load 4.84 / 4.35 / 3.64 with 1 other gate Chrome; then **PASS at 59.9 fps** (p95 18.1 ms, scene GPU 19.1 ms) at load 2.25 with 0 other gate Chromes (15:14Z, sealed partial `p5255-50232-1792682030441`) |
| A21 names its DPR | the verdict names tier "high", pixel ratio 1.5 (= min(device DPR 2, tier dprCap 1.5)), the uncapped DPR 2 and the box; draws 309 / 232 / 337 and triangles 4.12 / 4.40 / 4.40 M PASS; GPU, frame and JS terms PENDING on the loud box (load 3.78, 1 other gate Chrome) |
| `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` in `tools/budgets.mjs` | done (last round); engine-gpu's census loads it |
| open W0a judge findings | V3 crouch (closed last round, unchanged); R29 signed verdicts (unchanged); A-port-guard's own monitors (PASS above); A65 (PASS in the full run) |

## A.1 What R33 asks, and what the gate does (changes this round in bold)

| clause | implementation | evidence |
|---|---|---|
| (a) baseline recorded once | `carried-baseline.json`, git-anchored | `anchor: git: byte-identical to the version first committed in 766e49b21b` |
| (b) PASS at baseline must PASS; known-flaky 3 of 5; FAIL/PENDING not worse | `carriedSuite()`. **Newly staged rows are no longer exempt** (FR 4). | A.4 |
| (c) visual rows graded only for kept systems | **V21 only, while R33 (g) shadows V1–V4 and V12–V14** | A.4 |
| (d) integrity | seal v3; **traced semaphore children** | FR 9 |
| (e) A-gate-preludes scope | unchanged | PASS |
| (f) A9 R26, A21 names its DPR | unchanged | A.0 |
| **(g) shadowed rows** | **`r33gShadowed()` + `skipShadowed`; `CAL_SHADOW_EXITED=hero-body` grades them after hero-body's exit** | 35 rows |
| **R34 A90b owner** | **`RULED_OWNER`: A90b → instruments-core (R34)** | A.4 |

Grading rules carried over from the last round, unchanged: one full run per round plus sealed partial re-runs; every
observation counts; a known-flaky row is decided by its first 5 observations; an attributed PENDING is no observation; the
box is reported, never used to drop a run; HEAD is recorded, not compared; the roster waits ≤ 25 s for the deferred kinds.

## A.2 The STAGING FAILED card (new contract, `tools/gate-roster.mjs`)

A visual row whose **own** staging assertion fails draws `__failCard(detail)`: a full-frame `#3a0d12` panel with the
reason. It is distinct from the SKIP card (`#101418`). A-carried-suite reads the frame's corners: (16, 20, 24) is a SKIP,
(58, 13, 18) is a **FAIL** of the row. A judge sees the reason instead of a misleading frame. V13 is the first user.

## A.3 Frames read this round

| frame (sealed run `p5255-98487-1792676939017`) | read against | reading (advisory; R29 judges decide) |
|---|---|---|
| `V13-aim-strafe.png` | its criteria (front view of an aiming side-step) | Front lens at 24°, as the recipe says. She is aiming: the bow is upright **in her left hand**, raised to shoulder height, and the lance is stowed diagonally on her back. Mid-step, feet apart. The staged state is now the graded state. Whether the feet "point toward the travel direction" is for hero-body's judge on Brea (the row is SKIP-shadowed here). |
| `V21-camera-cover.png` | criteria (1)–(4) + `reference/r5/gates-perf/chase-camera.jpg` | (1) readout `boom requested 4.20 m -> 1.50 m`, trunk 0.15 m off the boom axis, `line of sight to the hero: CLEAR`; (2) hair, shoulders, the bow and lance on her back all readable, nothing in front of her; (3) no bark or leaf mass in the centre (the nearest trunk is mid-ground, left of centre); (4) ground under her and the horizon visible and level. Reads as a PASS to me, but the lane may not judge it (R29). |

The run's other 35 visual frames are SKIP-replaced (29) or SKIP-shadowed (6 besides V13). They are not graded here, and I
did not re-read them this round. Every PNG was deleted from the tree after reading; the sealed copies are in the ledger.

## A.4 The carried suite, graded (R33)

Ledger `scratchpad/r5/gates-perf/ledger/ledger.jsonl`, outside every tree. Observations of this build:

| run | kind | rows | box (its own monitor) |
|---|---|---|---|
| `p5255-98487-1792676939017` | **full** (`--lane carried`, 64 min, 13:49–14:53Z) | 236: 149 pass, 12 fail, 38 pending, 37 frames | quiet 7 %, load max 6.94, other gate Chromes ≤ 1 |
| `p5255-40778-1792681608950` | partial | A100 (fail), A50b (pass), A9 (attributed PENDING), A92 (pass) | load 4.35, 1 other gate Chrome |
| `p5255-43201-1792681697410` | partial | A100 (pass), A50b (pass), A9 (attributed PENDING), A92 (pass) | load 3.64, 1 other gate Chrome |
| `p5255-50232-1792682030441` | partial | A100, A9 | started in a quiet window (load 2.63 → 2.25, 0 other gate Chromes): A9 **PASS 59.9 fps**, A100 pass; its monitor: quiet 50 %, load max 2.63 |

Earlier runs (last round's builds) are listed under `notGraded` as stale.

**Row classes** (final grading 15:16Z, invocation of its own):

| class | rows |
|---|---|
| **regression** (PASSED at baseline, not in every observation now) | **A90b-memory-attribution** (fail ×1): 47 objects created at `machine.js:162` and 24 bones at `autorig.js:75` retained off-scene after the Tiller workload. Owner **instruments-core (R34)**. **A73-sample-bank** (fail ×1): the Tiller declares `voice/tiller/windup` and `voice/tiller/strike` with no seeds. Owner audio (the voice sets are the fixture's, registered by instruments-core). **A92-arrow-corpse-release** (fail / pass / pass): phase A planted 0 arrows in the full run and 8 in both re-runs. Owner combat-kit; likely my re-stage's non-role pick (§3 gap 2). |
| **worseThanBaseline** (SKIP at baseline, staged on the R28 fixture now, FAIL) | **A23-aim-cost** ("the spatial lane itself is over budget": hull p95 41.5 ms, idle p95 37 ms, box scale 1.78; engine-gpu + gates-perf), **A23b-hull-fidelity** (`tested 1` vs the Round-4 `tested === 8`; every fidelity term passes; §3 gap 3), **A71-compass-truth** (`tagTarget()` tagged nothing: tags 0, pips 0; shell-ui), **A78b-cast-pose-set** ("cast panel offers only 8 states"; brand W4) |
| **awaitingJudge** | V21-camera-cover (frame `017b4f640da0…` in the full run; my advisory reading is in A.3) |
| **skipShadowed (R33 g)** | 35 rows: A2, A3, A11–A19 (incl. A13, A18b, A19), A28 ×3, A31 ×2, A31b ×2, A31c, A31d, A31e, A31f, A32 ×3, A33 ×2, V1–V4, V12–V14. What each run observed is under `detail.shadowed` (A13, A19, A31b, A31c and A31f failed in the full run; hero-body grades them on Brea) |
| known-flaky, decided | A100-spear-holster **pass** (3 of 4), A50b-aim-on-drawn-geometry **pass** (3 of 3) |
| attributed PENDING, then measured | A9-perf-budget: PENDING ×3 on the loud box (not counted), then **PASS 59.9 fps** at load 2.25 |
| skipR30 since baseline (R30 requires it) | A99-dialogue, V35-settlement |
| listed (not worse than baseline) | 59: 26 SKIP-R30 → SKIP-R30; A21 fail → attributed PENDING; 24 newly staged rows SKIP-R18 → PASS; 8 SKIP-R18 → SKIP-R18 (incl. A42-expansion and A62-focus-components, now named) |
| skipReplaced | 29 visual rows, each naming its absorbing lane |
| pass | 103 |

---

# Part B — the W0b deliverables

## B.0 Summary

| deliverable (plan §2 / §9) | file(s) | status |
|---|---|---|
| licence-clean reference set via the Commons fetcher | `tools/r5-refs/{fetch,licence,manifest,slots}.mjs`, `reference/r5/gates-perf/**` (13 files + MANIFEST) | done; A-reference-set **PASS** |
| `reference/MANIFEST.md` + deletion of `reference/*.jpg` (HZD stills) | `reference/MANIFEST.md`; the 19 stills deleted | done; A-reference-clean **PASS** |
| `A-alloc-rate` | `tools/gates/gates-perf.w0b.mjs` | built; graded on **caller attribution** now; **FAIL, real** |
| `A-vram-ledger` | same | built; **FAIL, real** on render targets |
| `A90-abs` | same | built; **FAIL, real** on the GPU-process footprint |
| the unattributed-draw cap | same + `MEMORY_BUDGETS.unattributed.w0Cap` | grades the **direct count** now; W0 cap 5; **PASS** |
| R34 self-contained scenarios | `tools/budgets.mjs` + `A-perf-scenarios-self-contained` | done; **PASS**; engine-gpu's census PASS on this tree |

## B.1 The reference set

Unchanged this round: 13 references (11 PD, 1 CC0, 1 CC BY 2.0), the 19 Round-4 stills deleted and recorded by sha256.
Three weak references remain for their owners to replace (`lance-back-carry`, `lance-follow`, `chase-camera`, §4).

## B.2 `A-alloc-rate` (plan §0 rule 5, §9)

CDP `HeapProfiler.startSampling` (2 KB interval; objects collected by minor and major GC included, so everything allocated
counts, not only survivors). It runs over 10 s of the staged fight (8 × the herd role's Tiller fixture, R18 fallbacks
named) and 10 s of sprint-and-draw, each after 3 s of warm-up. **Graded = every sampled byte charged to the nearest
`src/**` frame on its allocation stack**, at max(measured KB/s, KB per frame × 60) so a starved box cannot pass by drawing
fewer frames, for the total and for each function. Self attribution is reported. The empty-frame floor is measured over 5 s
with `scene.visible = false` on the same page (no scene draw, no shadow pass; the post chain and every system update still
run) and reported. The drive is witnessed (sprint fraction, aim fraction, speed, arrows loosed, draw strength). Cross-check
independent of the profiler: the used heap read every 100 ms for 2 s with no forced GC.

## B.3 `A-vram-ledger` (plan §4.4)

Unchanged: a census of the GL allocation calls installed before the game makes its context, render targets = textures ever
attached to a framebuffer + renderbuffers, engine-gpu's sized-format table. The census's render-target total equals
`engine.renderTargetLedger()` to the byte (437,751,372 B).

## B.4 `A90-abs` (global list)

Unchanged: A90-memory-stability's kill → respawn workload (30 kills, 30 respawns, Tiller), two forced GCs, then the
staged fight for 60 s; JS heap = `Runtime.getHeapUsage().usedSize` after two forced GCs; GPU process = macOS
`footprint -p` of the `SystemInfo.getProcessInfo` GPU pid, sampled every 15 s, max graded. What-if at pixel ratio 1.25
reported.

## B.5 `A-unattributed-cap` (plan §4.2 last row)

**Graded: the direct per-draw count** (FR 7), the worst whole frame of 8. Cross-checks: each registered owner hidden in
turn as a paired (with, without) reading must match its direct count within 1 draw, and the unregistered roots hidden
together must match the direct unattributed count within 1. Otherwise the row is PENDING and names the disagreement.
Lights and light targets are never hidden.

## B.6 Measured numbers (lane block, 14:53–15:04Z)

**A-alloc-rate** (tier high, pixel ratio 1.5; staged fight = 8 × Tiller fixture)

| phase | fps | src/** caller, measured | KB / frame | **graded** | self attribution, measured | all allocation | used-heap rises | post-GC slope |
|---|---|---|---|---|---|---|---|---|
| staged fight, 10 s | 28.0 | 54,351 KB/s | 1,941 | **116,476 KB/s** | 36,427 KB/s | 54,352 KB/s | 3,398 KB/s | +144.4 KB/s |
| sprint and draw, 10 s | 30.3 | 50,261 KB/s | 1,658 | **99,498 KB/s** | 37,596 KB/s | 50,269 KB/s | 3,855 KB/s | +60.4 KB/s |
| empty frame (scene hidden, reported) | 56.0 | 40,560 KB/s | — | — | — | — | — | — |

Nearly all allocation now has a src frame on its stack (caller ≈ all allocation): what self attribution missed was
three.js, three-mesh-bvh and built-ins called from src. Functions over 4 KB/s, by owner (graded KB/s, worst phase):
- world-ground: `noise2D` terrain.js:78 **18,297**, `getHeight` terrain.js:1860 15,786, `_ridged` 859, `fbm` 247; vegetation.js:117 1,784, `_fillChunk` :889 1,571, `grassDensityAt` :666 469.
- FROZEN spatial: `_meshPush` collision.js:835 **14,330** (incl. `three-mesh-bvh` `shapecast` called from it), `raycast` collision.js:888 12,581, `occluded` :1099 3,591, `sphereQuery` :679 2,539, `steer` nav.js:579 1,765, `_clearance` nav.js:605 339.
- engine-gpu: `render` engine.js:273 **11,084** (three's uniform uploads, `getParameters` / `getProgramCacheKeyParameters` / `join`: a per-frame program-key rebuild), the cull pass's traverse closure engine.js:1352 4,532, engine.js:1658 345, the caster sort closure engine.js:1439 226.
- FROZEN rigging: `update` clipLayer.js:417 **6,395** (`AnimationMixer` evaluate), boneSpace.js:318 407, locomotion.js:236 482.
- hero-body: `_springs` playerAnimator.js:3708 **8,726**, `update` :1168 2,075, `_twistLayer` :3569 428, `_updateCamera` player.js:3381 444.
- instruments-core: `update` machines/index.js:533 2,129, `tick` ai/attacks.js:529 1,079, machine.js `_conform` / `_steerAlong` / `_navToward` / `_applyStep` ≈ 1,480 together, engage.js:635 347; FROZEN machine rig: gait.js:889 1,078, :1385 555, :1507 290, :1322 287.
- world-props: fauna.js:833 1,718. shell-ui: hud.js `_updateCompass` / `_updateAwareness` / `_scanMachines` 400 / 319 / 177. settlements: npcAnim.js:1562 375, npc.js:2083 221. audio: spatial.js:164 228, audio.js:3072 195.

The empty frame shows where the floor is: the renderer's own path with nothing drawn is 197 KB/s (engine.js:1658) + 80
(the caster sort); the 2,488 KB/s at engine.js:1352 is the cull traverse closure, which runs whether anything is drawn or
not. The rest of the 40.6 MB/s is the simulation. No allowance is warranted or recorded.

**A-vram-ledger**: largest render targets: the MSAA scene renderbuffer 2400 × 1350 × 4 samples 103.68 MB and its depth
51.84 MB; five 2400 × 1350 HalfFloat targets 25.92 MB each; the three CSM cascades 2048² colour + depth 16.78 MB each (×6).
engine-gpu's recorded ledger (DPR 1.25) totals 340.74 MB, still over 170.

**A90-abs**: JS heap after two forced GCs 65.43 MB at boot, 80.20 MB after the A90 workload, **82.72 MB** after the fight.
GPU process 1,532.5 / 1,526.8 / 1,526.7 / **1,537.2** / 1,534.2 MB. What-if pixel ratio 1.25: 1,410.8 MB.

**A-unattributed-cap**: 335 draws/frame, post chain 22; vegetation 76, landmarks + places 75, Brea + gear 37, Instruments
32, settlement kit 29, terrain / sky / sea 24, VFX / UI / pooled 19, NPCs 16; **unattributed 5**: the five unnamed
instanced quads of `src/combat/particles.js` (frozen).

---

## 1. Gate table — the global green list (the items that exist in this tree)

| gate (owner) | result | measured (full run `p5255-98487-…` unless noted) |
|---|---|---|
| `A1-boot-clean` | **PASS** | state=playing |
| `A9-perf-budget` (R26) | **PASS** (R26) | draws 309 (< 350) every run; median 40.0 / 39.7 / 39.7 fps at load 4.84 / 4.35 / 3.64 with 1 other gate Chrome (PENDING, R26); **59.9 fps at load 2.25, 0 other gate Chromes (PASS, 15:14Z)** |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 220 frames |
| `A21-real-draw-calls` | **PENDING** | draws 309 / 232 / 337, triangles 4.12 / 4.40 / 4.40 M PASS; GPU median 77.2 / 103.7 / 58.4 ms, frame p95, JS p95 PENDING (load 3.78, 1 other gate Chrome) |
| `A90-memory-stability` | **PASS** | 30 kills → 30 respawns (Tiller): geometries +11, textures −2, heap −2.6 % |
| `A90-memory-stability-expansion` | **PASS** | non-machine growth 0, orphan roots 0 |
| `A90b-memory-attribution` | **FAIL** (instruments-core, R34) | 47 objects (`machine.js:162`) and 24 bones (`autorig.js:75`) retained off-scene after the Tiller workload |
| `A90-rig-reclaim` | **PASS** | 30 cycles on the Tiller: geometries +2, textures 0; per live machine 0 / 0.38 |
| `A90-abs` | **FAIL** | heap 82.72 MB PASS; GPU process 1,537.2 MB > 1,500 |
| `A-alloc-rate` | **FAIL** | 116,476 / 99,498 KB/s caller-attributed vs 64 |
| `A-vram-ledger` | **FAIL** | render targets 437.75 MB > 170 |
| `A-ID-ip-assets-gone` (pipeline) | **PASS** | 16 GLBs, 0 IP hits; `aloy.glb` a scheduled exception (hero-body, W0 exit) |
| `A-licence-manifest` (pipeline) | **PENDING** | third-party (`r5-poc-rock-scan`, `ual1`: archive SHA-256 + retrieved date from pipeline's W0b re-fetch), legacy-source (`aloy.glb` scheduled) and credits (9 attributions not yet in README / in game) PENDING; the rest PASS |
| `A-assets-tracked` (pipeline) | **PASS** | 212 referenced paths, 0 ignored, 0 missing; the 4 R30 GLBs deleted, none served |
| `A-no-horizon-terms-player` / `-code` (brand) | not in this tree | brand's W0b |
| `A-reach-all-sites` | not in this tree | no lane file defines it yet |
| `A-port-guard` | **PASS** | lane block |
| `A-carried-suite` | **FAIL** | A.4 |
| `A79-runner-verdict-line`, `A80-chrome-profile-hygiene` (carried) | **PASS** | full run |

## 2. Contracts and APIs published (exact signatures; changes this round in bold)

### 2.1 `tools/budgets.mjs`

```js
import { ROSTER } from './gate-roster.mjs';            // NEW (R34): spliced inside STAGE_PRELUDE
import { PLACES } from './gate-places.mjs';            // NEW (R34)
export const BUDGETS                                   // unchanged
export const STAGE_PRELUDE   // CHANGED (R34): `const __stage = await (async () => { ROSTER; PLACES; ... })();`
                             //   splice inside an async body; declares only `__stage` at the caller's level;
                             //   __stage = { machines, resetAll, pick, place, lookAt, pinAll, groundY, castPlan, fill, casts,
                             //               KIND, ROLE_NOTE, roleSkip, PLACE, placeSkip, standAt, placesSource }
export const PERF_SCENARIOS  // CHANGED (R34): read roles/places only through __stage (eval with STAGE_PRELUDE alone)
export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';
export const MEMORY_BUDGETS = Object.freeze({
  alloc: { srcKBps: 64, fnKBps: 4, heapSlopeBps: 0, windowS: 10, warmupS: 3, samplingIntervalB: 2048, refFps: 60,
           attribution: 'caller', emptyFrameS: 5 },     // CHANGED: graded attribution named; no allowance
  vram:  { texturesB: 160e6, renderTargetsB: 170e6, geometryB: 120e6, totalB: 450e6 },
  abs:   { heapB: 450e6, gpuProcessB: 1.5e9, fightS: 60, a90LoopS: 150, a90LifecycleS: 150, minKills: 25 },
  unattributed: { w2Bar: 30, w0Cap: { draws: 5, measured: '<run, cast, tier, pixel ratio>' } },   // comment corrected
});
```

### 2.2 `tools/gates/gates-perf.w0b.mjs`

```js
export const W0B_BUDGETS, UNATTRIBUTED_CAP_W0, DRAW_OWNERS, ownerOfName(name)      // unchanged
export const GATES   // A-reference-clean, A-reference-set, A-perf-scenarios-self-contained (NEW, action),
                     // A-alloc-rate (caller attribution), A-vram-ledger, A90-abs, A-unattributed-cap (direct count)
```

### 2.3 `tools/gate-roster.mjs`

```js
export const FAIL_CARD   // NEW: page prelude defining __failCard(detail): the STAGING FAILED card (#3a0d12), sets
                         // window.__R5_STAGING_FAILED__; A-carried-suite grades a frame with this card as FAIL
```
`ROSTER` (the bounded wait for the deferred kinds) and `SKIP_CARD` are unchanged.

### 2.4 `tools/gates.r5.gates-perf.mjs` (grading contract)

- `CAL_SHADOW_EXITED=<lane>[,…]`: grade R33 (g)'s shadowed rows (after that lane's exit). Default: `SKIP-shadowed(hero-body)`.
- `detail.shadowed = { ruling, lane, exited, planHasR33g, rows[] }`; `detail.newlyStaged[]` now carries each row's class.
- `RULED_OWNER`: owner overrides recorded by a §8.3 ruling (A90b → instruments-core, R34).
- A-chrome-semaphore detail: `writeTrace { calls, pids, intoThisTree, firstIntoTree, outsideSandboxAndTree, positiveControl }`,
  `foreignWritesInWindow[] { file, writtenBy { port, stamp, gates, ids }, at }`, `treeReportsRestored` (child-made changes only).
- Everything else (judge CLI, ledger, seal v3, `CAL_ORCHESTRATOR_PUBKEY`, `CAL_CARRIED_RUNS`) is unchanged.

### 2.5 `tools/r5-refs/**`

Unchanged (fetch / verify / selftest CLI; `search`, `fileInfo`, `verify`, `classifyCommons`, `readManifest`, `SLOTS`).

### 2.6 Registration / auto-discovery

In this tree `tools/gates.config.mjs` imports every `tools/gates.r5.*.mjs` by pattern (A-gates-autodiscover PASS), so
`node tools/gates.mjs --port 5255 --lane gates-perf` runs the 13 rows. On a tree without it (main, until this merges):
`node tools/gates.mjs --port <p> --extra tools/gates.r5.gates-perf.mjs --lane gates-perf`.

## 3. Honest gaps

1. **A-carried-suite cannot PASS in a lane run.** V21 needs the orchestrator's R29 judge; A90b (instruments-core, R34)
   and A73 (Tiller voice seeds) regressed; four newly staged rows fail on content that is not mine (A23, A23b, A71, A78b).
2. **A92-arrow-corpse-release failed once** in the full run: phase A planted 0 arrows on its machine, and the row needs
   riders at death. It passed in both partial re-runs (8 riders) and in last round's full run, so it is intermittent. Every
   observation counts, so it stays a regression. My suspicion is a staging weakness of my re-stage: phase A takes
   `machines.list.find(…)`, the first live machine of **any** kind (a legacy kind can be first, R28), not the herd role.
   The fix is a role pick (`liveOf('herd')`) in the row. I did not apply it: any edit to `carried.mjs` makes the only full
   run of this round stale. It is the first change of the next round, or the orchestrator's gate-fix pass.
3. **A23b-hull-fidelity fails only on `tested === 8`**, the Round-4 roster size; 1 kind is staged (the Tiller). Every
   fidelity term passes: gap rate 4.1 % ≤ 4.9 %, worst median 0.18 of the bar, slowest 5.2 µs. Re-staging the count as
   "every staged kind" is arguably part of the re-stage, but it changes a number in the row, so I leave it to the
   orchestrator to rule. A23-aim-cost fails "the spatial lane itself is over budget" with idle p95 37 ms on a loud box
   (box scale 1.78).
4. **A50b-aim-on-drawn-geometry measures every live kind, legacy kinds included** (12 kinds, e.g. a legacy walker). R28
   says role-staged rows stage non-legacy kinds only. It passes 3/3. Re-staging it to `STAGED_KINDS` is a next-round
   change to `carried.mjs` (same reason as gap 2).
5. **One full run per round** is a weaker floor than W0a's three; the first 5 observations decide a flaky row, and
   `CAL_CARRIED_RUNS` raises the floor.
6. **The box.** Quiet fraction 7 % in the full run. A9 and A21's clock terms stay PENDING unless a quiet window opens;
   the orchestrator's 5270 run decides.
7. **The write tracer does not see worker threads** (Node does not apply `NODE_OPTIONS --import` to workers; measured).
   The only worker a child harness starts is the run monitor, which writes to the ledger's staging directory outside
   every tree; non-node processes (Chrome) write only to their sandbox profile.
8. **A-gates-autodiscover writes its two probe lane files into `tools/` for ~1.5 s.** A concurrent `gates.mjs` loading
   the config in that window would see a shadowing probe row and a LOAD-FAIL row. I have not seen it happen. Isolating it
   needs a symlinked tool tree; that is listed for the next round.
9. **The baseline's own evidence is gone** (`$TMPDIR` lost in the Oct 22 reboot); the file is anchored by git only.
10. **Forgery is possible by someone set on forging**: the ledger is a file on a one-user machine. The orchestrator holds
    the ledger it grades and the private key it trusts.
11. **A-alloc-rate is ~1,800× over** (caller attribution). The allocations are real and sit almost entirely in files this
    lane may not touch.

## 4. What other lanes and the orchestrator must do

| who | what |
|---|---|
| **orchestrator** | **Merge order.** Part A (§5.1) can merge first; Part B (§5.2) is additive. Merging R34's `STAGE_PRELUDE` change lets main's engine-gpu gates eval the scenarios as they are (proven on this tree by `A-rt-ledger-census`). |
| **orchestrator** | **Grade A-carried-suite on 5270** (quiet box, 1 Chrome): `CAL_GATE_LEDGER=<a dir you hold> node tools/gates.mjs --port 5270 --lane carried` once; then `--only A100-spear-holster,A50b-aim-on-drawn-geometry,A9-perf-budget` until the flaky rows' first 5 observations decide; then the V21 judge (next row); then `CAL_ORCHESTRATOR_PUBKEY=<your key> node tools/gates.mjs --port 5270 --only A-carried-suite` in an invocation of its own. After hero-body's exit add `CAL_SHADOW_EXITED=hero-body` to grade the 35 shadowed rows on the merged build. |
| **orchestrator** | **R29 judge for V21** (the only kept visual row graded here now). Keygen / register / verdict commands: `node tools/gates.r5.gates-perf.mjs --judge-keygen --out <outside every tree>/orchestrator.pem`; per judge `--judge-register --judge-name <who> --port 5271 --judge-pub <its key> --orchestrator-key orchestrator.pem`; the judge: `--judge --list --port 5270`, then `--judge --seal <id> --id V21-camera-cover --pass true|false --rationale "…" --judge-name <who> --port 5271 --judge-key judge.pem --reference reference/r5/gates-perf/chase-camera.jpg`. |
| **orchestrator** | **Rule**: (a) A23b's `tested === 8` → "every staged kind" (gap 3)? (b) A92 and A50b re-stages by role (gaps 2, 4), mine next round or your gate-fix pass. (c) Grants to hoist the per-call closures in frozen `collision.js` / `nav.js` and the AnimationMixer path in frozen `clipLayer.js` (A-alloc-rate). |
| **instruments-core** | **A90b** (R34): 47 objects from `machine.js:162` and 24 bones from `autorig.js:75` retained off-scene after 30 Tiller kills (FAIL in the full run). **A73**: the Tiller fixture declares `voice/tiller/windup` and `voice/tiller/strike` with no seeds. Allocation: `machines/index.js:533` 2.1 MB/s, `ai/attacks.js:529` 1.1, `machine.js` movement helpers ≈ 1.5 together, `ai/engage.js:635` 0.3. Name the five particle meshes of `src/combat/particles.js` (frozen; whoever holds its grant) so the unattributed cap can register them. |
| **engine-gpu** | **A-vram-ledger / A90-abs**: render targets 437.75 MB at the shipped `high` tier, pixel ratio 1.5 (bar 170; your DPR-1.25 ledger is 340.74, still over). Largest: MSAA scene renderbuffer 103.68 MB + depth 51.84, five HalfFloat targets 25.92 MB each, CSM 6 × 16.78. GPU process 1,537 MB vs 1,500 (1,411 at DPR 1.25). **A-alloc-rate**: `engine.js:273` render path 11.1 MB/s (per-frame `getParameters` / `getProgramCacheKeyParameters` / `join`: a program-key rebuild every frame, and uniform `setValue*`), the cull traverse closure `engine.js:1352` 4.5 MB/s (hoist the callback), the caster sort closure `engine.js:1439`. **A23-aim-cost / A23b** (absorbing lane). |
| **world-ground (W1)** | `terrain.js:87` `const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1]` allocates an array per `noise2D` call (18.3 MB/s); `getHeight` terrain.js:1860 15.8 MB/s; vegetation.js:117 1.8 and `_fillChunk` :889 1.6 MB/s. |
| **orchestrator (grant) → spatial** | frozen `collision.js`: `_meshPush` :835 (a `shapecast({ intersectsBounds: (box) => … })` object + closures per sample, 14.3 MB/s), `raycast` :888 12.6, `occluded` :1099 3.6, `sphereQuery` :679 2.5 (`gkey()` per cell); `nav.js` `steer` :579 1.8. |
| **orchestrator (grant) → rigging** | frozen `anim/clipLayer.js:417` (AnimationMixer evaluate per layer) 6.4 MB/s, `boneSpace.js:318`, `locomotion.js:236`. |
| **hero-body** | `_springs` playerAnimator.js:3708 8.7 MB/s, `update` :1168 2.1, `_twistLayer` :3569 0.4, `player.js` `_updateCamera` 0.4. The 35 R33 (g) rows are yours to grade on Brea; V13's staging now asserts aim + bow in hand (A.2/FR 2), and its frame is filmed at 24°. |
| **shell-ui** | A71-compass-truth on the Tiller: `sighting.tagTarget()` tagged nothing (tags 0, pips 0) after facing the fixture. |
| **brand (W4)** | A78b-cast-pose-set: "cast panel offers only 8 states". |
| **combat-kit** | A92 (gap 2) if the role re-stage does not settle it. |
| **world-props** | `fauna.js:833` 1.7 MB/s. |
| **melee (W1), hero-body** | Replace the weak references `lance-back-carry`, `lance-follow`, `chase-camera` (add SLOTS rows, `tools/r5-refs/fetch.mjs --fetch --lane <lane>`). |
| **every lane** | Name every top-level scene child for its §4.2 row (`DRAW_OWNERS`); unnamed roots count against the cap (W0: 5; ≤ 30 by W2). Visual rows name `reference/r5/<lane>/<slot>`. A visual row whose own staging can fail should draw `FAIL_CARD`, never `SKIP_CARD`. |

## 5. Files changed (this round)

### 5.1 Part A (merge first)

| file | change this round |
|---|---|
| `tools/gates.r5.gates-perf.mjs` | R33 (g) `skipShadowed` + `CAL_SHADOW_EXITED`; newly staged rows graded (exemption removed); `RULED_OWNER` (R34); STAGING FAILED card → FAIL; A-chrome-semaphore write tracer, positive control, foreign-write attribution, child-only restore |
| `tools/gates.r5.carried.mjs` | A70b (unseen-point pick through the fog API, reason check, listener removed); V13 (aim-state assertion, FAIL card, frozen aim point, 24° zoom); A42-expansion / A62-focus-components named `SKIP-R18` |
| `tools/gate-roster.mjs` | `FAIL_CARD` |
| `tools/budgets.mjs` | R34: `STAGE_PRELUDE` carries roster + places; scenarios read `__stage.*` |

### 5.2 Part B

| file | change this round |
|---|---|
| `tools/gates/gates-perf.w0b.mjs` | A-alloc-rate caller attribution + empty-frame floor; A-unattributed-cap direct count + paired cross-checks; `A-perf-scenarios-self-contained`; frozen files named in the owner table |
| `tools/budgets.mjs` | `MEMORY_BUDGETS.alloc.attribution / emptyFrameS`; the unattributed comment corrected |
| `docs/ROUND5-GATES-PERF.md` | this report |

`docs/ROUND5-PLAN.md` changed only by the orchestrator's sync of main's PLAN (14:42Z, committed in `7cdc46f`), not by me.
This round's diff is `git diff e2ed551 -- tools docs/ROUND5-GATES-PERF.md`.
No asset was added under `public/`, so there is no `LICENSES.json` row. No file outside the §2 row and the §1.2 grant was
edited, and the harness grant files (`gates.mjs`, `screenshot.mjs`, `chrome-profile.mjs`) are untouched this round.

## 6. Processes

At the end of the turn (15:2xZ): this lane's Vite on 5255 stopped (no listener on 5255); no `gates.mjs`, `screenshot.mjs`,
`run-gates.sh` or Chrome of this lane alive; 0 Chrome profiles of this lane (the one left under `$TMPDIR/cal-chrome-profiles`,
`cal-51685-5254-1`, is instruments-core's); 0 semaphore tickets; no orchestrator slot held by gates-perf. Every PNG was
deleted from the tree after reading: `shots/` holds the 4 report files (128 KB), and the frames live in the ledger. Disk
44 GB free.

Kept for the orchestrator and the judges, outside the tree: the run ledger `scratchpad/r5/gates-perf/ledger/` (104 MB:
`ledger.jsonl`, every sealed run's report copy and monitor, the frames of the last 4 full runs, including this round's 37);
the reports `scratchpad/r5/gates-perf/work/{carried-full-fix1.report,lane-fix1.report,acs-fix1}.json`; the logs in
`scratchpad/r5/gates-perf/logs/`. Deleted: the scratch ledger and the probe modules of the validation runs. There was no
judge scratch this round.
