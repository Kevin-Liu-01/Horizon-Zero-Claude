# ROUND 5 — lane `gates-perf`: W0a exit (R33) and W0b — fix round 2

Port 5255. Tree `scratchpad/r5/gates-perf/tree` → `~/.calima-r5/trees/gates-perf`, branch `r5/w0a-gates-perf`.
Oct 22–23 2026, 19:05Z–03:25Z. Plan rows: §2 gates-perf, §1.2 harness grant, §3.1 W0a + W0b exits, §3.2
`gates.r5.carried.mjs`, §4.2 / §4.4, §6 (`reference/*.jpg`), §8.2 R18 / R28, §8.3 R33, R33 (g), R34, R37–R42, §9 gates-perf.
The orchestrator's WIP checkpoints (`a2fba7c` 19:29Z through `3d81f2d` 03:07Z) committed this round's code edits as they
landed; `git status --short` shows only this report (§5). The fix-round-1 report is in git history (`dcb9e5e`).

**Part A (the W0a exit under R33) can merge first. Part B is the W0b work.** §5 lists the files of each part.

## FR2. Fix round 2: the findings, what changed, what was measured

Eleven findings from two judges, grouped into nine items. Every change was re-run on port 5255: one sealed full
carried run (`p5255-30826-1792714911107`, 00:28–01:21Z, on the final build; two earlier full runs of this round are stale),
the lane block (01:34–01:44Z), a full suite (the 13 lane rows + every global-list row that exists in this tree, in one
invocation; the final one 02:50–03:11Z, `p5255-6300-1792723805159`), sealed partial re-runs of the known-flaky rows and A9,
and separate A-unattributed-cap runs; A-carried-suite graded last, alone (03:12Z).

| # | finding (severity) | what changed | measured after the change |
|---|---|---|---|
| 1 | **R28: re-staged rows picked "the first live machine of any kind" and counted legacy kinds as PASS; A-gate-preludes could not see it** (major ×2: A50b, A92, A93, A94, A78, A79, A90-expansion) | Every pick of a machine a carried row measures or acts on now goes through new roster helpers (`tools/gate-roster.mjs`: `isStaged`, `liveStaged`, `livesStaged`, `liveOfKind`, `stageAny`, `memVictim`), which only ever return a machine of a **staged** (role-mapped, non-legacy) kind, spawning one when none stands. The judges' seven rows are re-staged, **and every other row the extended scan found**: A90 / A90b / A90-expansion and the A90-abs workload (`memVictim`), A101's threat machine, A43's eight wrecks (plan §9 instruments-core: "staged on the Tiller fixture"), A65's two victims, A74b, A77b, A41b, A23b, A103, A106, A64c, the A71-family `pickMachine`, `docileContract()`, and the shared `SPECIES` prelude of **ten** per-species rows that measured every live kind (A44, A44b, A45, A45b, A45c, A46, A47, A47b, A48, A50). A50b now measures `stagedPicks()` only. A dead helper that picked by kind (`ensureKind`) is deleted. | A-gate-preludes' new check **`noMachinePickWithoutRoster`: 0 unstaged picks** (33 annotated whole-roster sites, used 117 times across the expanded rows: freeze 75, census 22, clear 9, cast 9, warm 1, mirror 1; 8 lines carry a `KIND[...]` / `STAGED_KINDS` filter). Its self-test flags the W0a re-stage's own A92 pick and A50b list (2/2) and passes an annotated freeze, a `KIND[...]` filter and a helper call (0 false hits). The re-staged rows on the Tiller in the full run: every re-staged row PASSES except A45c (SKIP-legacy (R28): the handle rig exists only on legacy kinds) and the rows whose roles have no kind yet (named R18 / R30 SKIPs); A43 killed 8 Tillers (scene −294 objects, 8 respawns scheduled), A65 killed 2 authored Tillers (`restoreWasReal` true), A50b 50/50 arrows on drawn geometry, A92 phase A 8 riders at death. |
| 2 | **A-gate-preludes PASS was not literal** (major) | The scan now grades **every `machines.list` use** in every carried row (preludes expanded) and in `budgets.mjs` / `gates/gates-perf.w0b.mjs`: it must be a roster helper, carry a `KIND[...]` / `STAGED_KINDS` filter on its line, or be annotated `/* r5-all-machines: <reason> */` with one of six closed reasons (`gate-roster.mjs` `ALL_MACHINES_REASONS`: freeze, clear, census, warm, mirror, cast); every annotated site is listed in the detail for audit. The old-map coordinate scan also learned the two forms it missed (found by this round's own audit, not by the judges): a **declared pair** (`const SX = -264, SZ = -176` in A103, `const X0 = -60, Z0 = -45` in V41, `const BX = 0, BZ = 120` in the cast line-up) and a **vocabulary pair written as `hypot()` offsets** (A106: `Math.hypot(o.position.x + 60, o.position.z + 45)` is the openGround spot). All four now resolve named places: `meleeSlope` and `castStage` are new W0 places (§2.2), A106 / V41 use `openGround`. | **A-gate-preludes PASS** in every run of the final build (lane block 01:34Z, final suite 02:50Z: 14/14 checks, 0 unstaged picks, 0 old-map coordinates in owned files). Self-tests: coordinate scanner 8/8 positives (2 new) and 7/7 negatives (3 new, among them a relative `fire.x + 80` placement), machine-pick scan 2/2 and 0 false hits. Brand's and instruments-core's files are reported with one coordinate each (graded at their own exits, R33 e). |
| 3 | **A23b kept the Round-4 count `tested === 8`; A75 the latent `dispatched.length === 8`; the lane co-owns A23/A23b** (major ×2) | Re-stage fixes, as inventory Appendix B words both rows ("`all 8 species` literal -> kinds", "8 named species -> new roster"): A23b `tested === kinds.length && tested >= 1`, A75 `dispatched.length === species.length`; every fidelity term unchanged. The same class of literal sat in four more rows and is fixed the same way: A45 / A46 / A48 / A45b `measured < 2` → `< min(2, staged kinds)`; A50b `speciesDone < 4` → `< min(4, staged kinds)` (the Round-4 count where the roster allows it). A78b's `>= 9` cast-state buttons counted `overridden`, the Override state R17 removed (instruments-core deleted it from `src/studio/cast.js`): it now requires a button for every state the row exercises **and** every state `cast.js` publishes; the hero-pose loop skips `interact` (the Override-node beat R17 removed from `pose.js`) only while `pose.js` does not publish it. Ownership lines in §3 / §4 corrected: A23 and A23b are **engine-gpu + gates-perf** (plan §9). | A23b **PASS** in the full run (`tested 1` of 1 staged kind, gap rate 4.1 % ≤ 4.9 %, worst median 0.18 of the bar). A78b **PASS** (states 5/5 held, stagger / death resolved, all Round-4 poses accepted, `r17Removed=interact`). A75 SKIP-R18 (needs ≥ 2 staged kinds, unchanged). |
| 4 | **A-carried-suite FAILs** (blocker ×2) | Rows mine to fix, fixed: **A23** — its re-stage fell back to "the staged kind with the most triangles" and FAILed only on `bp95 > 60`, the Round-4 colossus's skinned-raycast baseline (the Tiller's: 31.6 ms p95) while every lane-cost term passed. R18 says a role-staged row "may not be silently re-pointed": it now stages the **colossus role only** and reports SKIP-legacy-deleted (R30) until the Transit (instruments-d W4). **A71** — two staging defects, measured with a probe: the herd noticed her at 14 m (3 pips from "fighting" machines, 0 tags), and faceFrom's 0.1 rad pitch put the 2.68 m Tiller 3.47 m off the crosshair ray against sighting's 2.42 m pick radius; the tag step now holds every machine calm and turns the lens until the crosshair passes through the machine. **A92** — each phase now spawns its own staged machine on the named `impactGround`, parked; and, found with a seven-variant probe after the first full run of this round still read 0–8 riders per phase (whole phases at 0), the shots aim at a **posed vertex of the machine's drawn geometry** whose exact hull probe from the nock hits it (and still hits 0.3 m lower), not at "position + 55 % of height": the game's arrow sweep is `hitHulls.raycast(..., { exact: true })`, which accepts an unskinned node's hull only where the ray meets a triangle, and that centre point is open air inside the Tiller's frame for many headings (arrows ended 80–120 m beyond it). Validated 3/3 on the real row before the final full run: **8 / 8 / 8 riders in every phase** (8 is the per-machine cap). **A78b** — item 3. The grader now accepts **SKIP-legacy (R28)** for a row that passed at baseline on legacy content, as plan §9 lists it among A-carried-suite's allowed states, and lists every such row by name (`r28SinceBaseline`); a FAIL in any observation is still a regression. | **A-carried-suite FAIL on 3 rows only** (03:12Z, invocation of its own): A90b, A73, V21. A23, A23b, A71, A78b and A92 are no longer offenders; A9, A100 and A50b are decided PASS. Rows of other lanes still FAIL: A90b (instruments-core, R34: 24 Bones held at `autorig.js:75`; fixed in its unmerged W0b tree) and A73 (the Tiller fixture's voice sets have no seeds); V21 awaits the orchestrator's R29 judge. |
| 5 | **A-unattributed-cap did not reproduce its PASS inside a full suite** (major) | Two steps, both measured. (1) The paired with/without readings run on a **pinned world**: `ctx.state` is held at a non-live state, so `main.js _simulate()` runs no system (no NPC animation or LOD switch, no particle, no AI) while `engine.render()` keeps drawing the same world, dynamic resolution off; state and drawing restored in `finally`. With that alone the full suite PASSed (21:12Z) but the next lane run read NPCs hidden 14 against a pinned direct 16 again, and that pair's own "with" reading was 333 draws where the pinned total was 335: what still moves is render-time state a hide/unhide cycle leaves behind (the cull pass's per-mesh size-cull hysteresis) and draws that move to other roots while an owner is hidden. (2) So each pair now takes the **direct per-root count on the same frames** as its two renderer readings, and the cross-check is exact accounting: the renderer's (with − without) must equal the owner's own direct draws minus what the other roots and the post passes gained while it was hidden (substitution, reported per root), within ±1, and the owner must draw 0 while hidden; the unregistered roots likewise. The graded number is unchanged: the live direct count, worst whole frame; the pinned count must agree with it within ±1. | **PASS 3 of 3** on the final instrument: `--only` run 02:48Z, **inside the full suite** 03:10Z, `--only` run 03:12Z; 5 unattributed draws (live `[5 × 8]`, pinned `[5 × 8]`) every time; renderer and direct-hook hide deltas equal in every pair; NPCs 14 own / 14 hide on the same frames (their pinned count before the pairs was 16: the drift the judge saw); the largest substitution measured was −1 (Instruments, one run). History, honestly: the pinned-only version PASSed in the first full suite (21:33Z) and read PENDING in the lane block (01:44Z, NPCs 14 vs 16); the first same-frame version PASSed in the second full suite (02:07Z) but read PENDING once (02:12Z: VFX 19 vs 20.1, a median-versus-mean mix), which the final version removes by reading both instruments' medians over the same frames |
| 6 | **A21 and A9 PENDING on a loud box** (major) | Re-run in sealed partials and both suites (R26 / Round-4 attribution unchanged). A window with load < 3 **and** no other gate Chrome never came this round. | **A9 PASS**: 59.5 fps median (p95 31.9 / 32.9 ms, scene GPU 35.9 / 20.5 ms) in both sealed partial re-runs (02:50Z, 03:11Z, load 3.4 / 4.8), draws 309; PENDING (attributed) in the full run (39.9 fps at load 7.8). **A21 PENDING**: draws 309 / 232 / 337 ✓ and triangles 4.12 / 4.40 / 4.40 M ✓ in every run; GPU median 78.0 / 103.0 / 68.8 ms, p95 frame 56.4 / 69.1 / 49.6 ms in the final suite, never attributable (load ≥ 3 and another gate Chrome at every start). A21's GPU term will FAIL in this tree even on a quiet box (A9's own vista GPU read 19.6–21.6 ms > 14) until engine-gpu's tier merges |
| 7 | **A-alloc-rate FAILs ~1,750×; A-vram-ledger and A90-abs FAIL** (blocker ×4) | Not fixable inside this lane's paths (rule 1, no grant). Re-measured; routing refined to file:line with the one-line fix for each hot spot (§4). engine-gpu's **unmerged** W0b tier (DPR 1.25, GTAO ¼, SMAA-only, …) records render targets at **127.27 MB** in its tree, under the 170 MB bar; instruments-core's **unmerged** W0b fix records A90b **3/3 PASS** with 0 offenders at `machine.js` / `autorig.js`. Both are graded here only after the merge. | Final suite: A-alloc-rate 120,740 KB/s graded (lane block 91,718), `noise2D` 18,556 KB/s, slope +135.7 / +78.5 KB/s; A-vram-ledger render targets 437.75 MB (identical in every run); A90-abs GPU process 1,504–1,522.4 MB (1,389 at DPR 1.25), heap 80.03 MB |
| 8 | **W0b exit not reached** (blocker) | Items 4 and 7; §4 is the routing table. | — |

---

## 0. Result

Runs on the final build, port 5255 (every one on a loud box: load 2.8–7.8, another lane's gate Chrome alive most of
the time): the sealed full carried run `p5255-30826-1792714911107` (00:28–01:21Z), the lane block
`node tools/gates.mjs --port 5255 --lane gates-perf` (01:34–01:44Z, report `scratchpad/r5/gates-perf/work/lane-fix2.report.json`),
the final full suite (the 13 lane rows + every global-list row in this tree, 02:50–03:11Z, `work/suite-fix2c.report.json`), sealed
partial re-runs of the known-flaky rows and A9, separate A-unattributed-cap runs, and A-carried-suite graded last in an
invocation of its own (03:12Z).

| gate | result | measured |
|---|---|---|
| `A-gate-preludes` | **PASS** (lane block and full suite) | 14/14 checks: 0 kind literals, 0 old-map coordinates (now also declared pairs and `hypot()` offsets) and **0 unstaged machine picks** in the graded files; 33 annotated whole-roster sites listed; every prelude resolved; scanner self-tests 8/8 + 7/7 and 2/2 + 0 false hits. Brand's (`'strider'`, one REST pair) and instruments-core's (5 old kind names, one placement) files reported, graded at their exits (R33 e). |
| `A-gates-no-hero-literals` | **PASS** | 12 `tools/gate*.mjs` files, 0 hits; 17 carried rows read bones through the animator. |
| `A-gates-autodiscover` | **PASS** | 8/8 checks in child processes; 273 rows with the probes. |
| `A-chrome-semaphore` | **PASS** (lane block) | 4 real runs at 1 slot: at most 1 Chrome over 345 samples, 3 waited; stand-ins at 2 slots: at most 2, 0 tickets left; `kill -9` released in 0.71 s; preflight refusals at simulated 2.5 GB / 20 %; write trace 555 calls from 22 pids, **0 into the tree**, positive control 6 ≥ 4. (In the mixed full suite it reports PENDING by design: it needs a runner-only invocation.) |
| `A-carried-suite` | **FAIL**, 3 rows | graded 03:12Z in an invocation of its own over the final full run + 2 sealed partials: composition 236/236, ledger intact, baseline anchored, 1 complete full run. Offenders: **A90b** regression (instruments-core, R34), **A73** regression (the Tiller's voice seeds), **V21** awaiting the R29 judge. Tally: 103 pass, 35 skipShadowed, 63 listed, 29 skipReplaced, 1 skipR28 (A45c), 2 skipR30. Known-flaky A100 and A50b **PASS 3 of 3**; A9 **PASS** (59.5 fps twice). |
| `A-reference-clean` | **PASS** | 13 images, all with rows (11 PD, 1 CC0, 1 CC BY 2.0); the 19 deleted stills recorded by sha256, 0 present. |
| `A-reference-set` | **PASS** | classifier controls 10/10; 8/8 graded visual rows name a reference. |
| `A-perf-scenarios-self-contained` | **PASS** | vista, herd and staged-fight staged in a scope holding `STAGE_PRELUDE` only; 0 helpers leaked. |
| `A-alloc-rate` | **FAIL**, real (§4) | caller-attributed src/** **91,718 KB/s** (lane block, 42.5 fps) / **120,740 KB/s** (final suite, 27.6 fps) against 64; worst function `noise2D` terrain.js:78 13,905 / 18,556 KB/s against 4; post-GC slope +108.9 / +12.8 and +135.7 / +78.5 KB/s against ≤ 0. |
| `A-vram-ledger` | **FAIL**, real (engine-gpu tier) | textures 105.46 MB ✓, **render targets 437.75 MB ✗ (170)**, geometry 79.54 MB ✓, total 622.75 MB ✗ (450), tier high, pixel ratio 1.5. Same to the byte in every run. |
| `A90-abs` | **FAIL**, real (engine-gpu tier) | JS heap 79.25 / 80.03 MB ✓ (450); GPU process **1,520.9 / 1,522.4 MB** ✗ (1,500) (lane block / final suite); at pixel ratio 1.25: 1,377–1,389 MB. |
| `A-unattributed-cap` | **PASS 3 of 3** | 5 draws/frame unattributed (cap 5) in every run: 02:48Z, **inside the full suite** 03:10Z, 03:12Z. Every pair: renderer hide delta = direct-hook hide delta on the same frames, owner draws 0 while hidden. |
| `A-port-guard` | **PASS** (lane block) | 16 refusals (8 cases × 2 harnesses); lsof control saw its own connection; 0 connections to :5173 over 301 samples of the lane block and over the sealed full run's monitor (1,792 samples, max gap 2.12 s). |

---

# Part A — the W0a exit under R33

## A.0 Summary

| item | status |
|---|---|
| A-carried-suite as a regression guard vs the recorded W0-day1 baseline | built and graded on the final build: **FAIL on 3 rows** — A90b and A73 regress (instruments-core / audio; A90b is fixed in instruments-core's unmerged tree), V21 awaits the orchestrator's R29 judge. Every row this lane re-staged now PASSes or reports a named SKIP |
| `tools/gates/carried-baseline.json` written once, with the box sample | unchanged since Oct 19; git-anchored (`766e49b`) |
| visual rows graded only for kept systems by an R29 judge | V21 graded here (awaiting the judge; advisory reading PASS, A.2); V1–V4, V12–V14 SKIP-shadowed(hero-body) under R33 (g); 29 other visual rows SKIP-replaced, each naming its absorbing lane |
| R33 (g) / V13 staging | 35 rows SKIP-shadowed; V13 asserts aim + bow in hand or draws the STAGING FAILED card (it did not) |
| sealed runs bound to their frames; no report overwritten by a semaphore child | seal v3 unchanged; A-chrome-semaphore **PASS** (0 writes into the tree, positive control) |
| A-gate-preludes on own files + carried.mjs | **PASS**, now with the R28 machine-pick rule (A.1) and two more coordinate forms |
| A9 on R26 | **PASS** (59.5 fps, draws 309) |
| A21 names its DPR | yes: tier `high`, pixel ratio 1.5 = min(device DPR 2, tier cap 1.5), uncapped DPR 2 reported; PENDING on the box |
| `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` in `tools/budgets.mjs` | in place (engine-gpu's census and its `A-rt-ledger` read it) |
| open W0a judge findings (V3 crouch, R29 verdict port, A-port-guard lsof half, A65's quest) | closed in earlier rounds; A65 now also R28-staged (authored Tillers) and PASSes |

## A.1 The machine-pick rule (new contract, `tools/gate-roster.mjs`)

A carried row may touch `ctx.machines.list` in exactly three ways (A-gate-preludes `noMachinePickWithoutRoster`):

1. through a roster helper, which returns staged (role-mapped, non-legacy) kinds only:
   `liveOf(role)`, `livesOf(role)`, `stageRole(role, opts)`, `stagedPicks(filter)`, **`isStaged(m)`, `liveStaged(filter)`,
   `livesStaged(filter)`, `liveOfKind(kind, filter)`** (null for a legacy kind), **`stageAny({ dx, dz, wait, filter })`**
   (a living staged machine, else one spawned for the gate), **`memVictim(filter)`** (the A90 family's kill pick);
2. with a `KIND[...]` or `STAGED_KINDS` filter on the same line;
3. as a whole-roster operation annotated on its own line `/* r5-all-machines: <reason> */`, reason one of
   `ALL_MACHINES_REASONS`:

| reason | meaning | uses (per expanded row: freeze 75, census 22, clear 9, cast 9, warm 1, mirror 1) |
|---|---|---|
| `freeze` | stops (or restores) every machine's update so nothing interferes; no machine is measured | the FREEZE / freezeAll preludes |
| `clear` | moves every machine out of an area, or picks a spot away from all of them | A102, A103, A105, A106, V47, A24, A77 |
| `census` | reads or counts every live machine as whole-world state | A20 (the frame loop), the A90-family leak censuses, A109, A43 / A43-expansion / A44 checks, the save alive-set mirror (A64-family `liveRoster`), A60 (the world's patrol lanes), A49 (the shared FX pool), the perf scenarios' `machines()` |
| `warm` | warms a per-machine cache before the staged subject is measured | A23 (hull sets) |
| `mirror` | a stand-in for a shipped loop that itself visits every machine | A23 (the aim function) |
| `cast` | operates on machines the row already picked through the roster | V26/V27 line-up, A67's respawned site |

A row whose subject exists only on legacy content reports **SKIP-legacy (R28)** with the reason, never PASS. This round
that is A45c (the handle rig, `footContinuity`, runs only on legacy kinds); A65's kill clause would be, but three Tillers
stand in the authored roster, so it stages on them (full run: PASS with `restoreWasReal` true; 3 of the 29 authored (boot) sites hold a Tiller (a diagnostic boot census, 19:31Z)).

## A.2 Frames read this round

| frame (final sealed full run `p5255-30826-1792714911107`) | read against | reading (advisory; R29 judges decide) |
|---|---|---|
| `V21-camera-cover.png` | criteria (1)–(4) + `reference/r5/gates-perf/chase-camera.jpg` (a walker seen from behind on a forest path, tall trunks either side) | (1) readout `boom requested 4.20 m -> 1.50 m`, trunk 0.15 m off the boom axis (< 0.8), `line of sight to the hero: CLEAR`; (2) head and braids, shoulders, upper back, the bow on her back (left) and the lance (right) are all readable and nothing in the world is in front of her; the frame bottom crops her at mid-back, which the criteria allow; (3) no bark or leaf mass in the centre: the nearest pine stands mid-ground left of centre, its foliage clear of the middle, and the lens is not inside a trunk or under the ground; (4) the meadow under her and the distant ground line under the massif are visible and level. Reads as a PASS to me. The frame is byte-for-byte the same composition as the first full run's of this round (the row is deterministic). |
| `V13-aim-strafe.png` (SKIP-shadowed, hero-body grades it) | the row's own staging assertion (R33 g) | front lens at 24°: she is aiming, the bow upright **in her left hand** (screen right), lance stowed diagonally on her back, mid-step with the left heel lifted; no STAGING FAILED card. Whether the feet point toward the travel direction is hero-body's judge's, on Brea. |

The run's other 35 frames are SKIP-replaced (29) or SKIP-shadowed (6 besides V13): not graded here. Every PNG was deleted from
the tree after the sealed copies were in the ledger (`scratchpad/r5/gates-perf/ledger/runs/<run>/`).

## A.3 The carried suite, graded (R33)

Ledger `scratchpad/r5/gates-perf/ledger/ledger.jsonl`, outside every tree. Observations of the final build:

| run | kind | rows | box (its own monitor) |
|---|---|---|---|
| `p5255-30826-1792714911107` | **full** (`--lane carried`, 00:28–01:21Z) | 236: 151 pass, 7 fail (5 SKIP-shadowed hero-body rows, A90b, A73), 41 pending, 37 frames | quiet 1 %, load max 7.82, up to 2 other gate Chromes |
| `p5255-4434-1792723748438` | partial | A9 (pass, 59.5 fps), A100 (pass), A50b (pass) | load max 4.17, 1 other gate Chrome |
| `p5255-40821-1792725052185` | partial | A9 (pass, 59.5 fps), A100 (pass), A50b (pass) | load max 6.28, 1 other gate Chrome |

The two earlier full runs of this round (`p5255-33647-…`, `p5255-67111-…`) ran intermediate A92 stagings and are stale
(`notGraded`); the suites are not sealed (mixed invocations; by design only `--lane carried` and carried-only `--only`
runs are).

| class | rows |
|---|---|
| **regression** | **A90b-memory-attribution** (fail): 24 Bones created at `autorig.js:75` held off-scene after the re-staged, Tiller-only workload (the `machine.js:162` clone no longer appears). Owner **instruments-core (R34)**; fixed in its unmerged W0b tree (3/3, 0 held). **A73-sample-bank** (fail): the Tiller declares `voice/tiller/windup` and `voice/tiller/strike` with no seeds. Owner audio / instruments-core (the fixture's voice sets). |
| **awaitingJudge** | V21-camera-cover (frame of the final full run; my advisory reading in A.2) |
| skipShadowed (R33 g) | 35 rows (A2, A3, A11–A19, A28 ×3, A31 family, A32 ×3, A33 ×2, V1–V4, V12–V14); observed, not graded |
| skipR28 (new) | A45c-foot-continuity: the handle rig exists only on legacy kinds |
| skipR30 since baseline | A99-dialogue, V35-settlement |
| known-flaky, decided | A100-spear-holster **pass** (3/3), A50b-aim-on-drawn-geometry **pass** (3/3) |
| listed (not worse than baseline) | 63, among them the **27 rows newly staged on the Tiller, all 27 PASS** (A23b, A71, A78b among them); A23 went from SKIP-R18 at baseline to SKIP-legacy-deleted (R30) on the colossus role |
| skipReplaced | 29 visual rows, each naming its absorbing lane |
| pass | 103 (A9 decided PASS on its measured observations; A92 PASS with 8 / 8 / 8 riders) |

---

# Part B — the W0b deliverables

## B.0 Summary

| deliverable (plan §2 / §9) | file(s) | status |
|---|---|---|
| licence-clean reference set via the Commons fetcher | `tools/r5-refs/{fetch,licence,manifest,slots}.mjs`, `reference/r5/gates-perf/**` (13 files + MANIFEST) | done; A-reference-set **PASS** |
| `reference/MANIFEST.md` + deletion of `reference/*.jpg` (HZD stills) | `reference/MANIFEST.md`; the 19 stills deleted | done; A-reference-clean **PASS** |
| `A-alloc-rate` | `tools/gates/gates-perf.w0b.mjs` | built (caller attribution); **FAIL, real**, other lanes' code (§4) |
| `A-vram-ledger` | same | built; **FAIL, real** on render targets until engine-gpu's tier merges |
| `A90-abs` | same | built; workload re-staged (R28); **FAIL, real**: GPU process 1,520.9 / 1,522.4 MB > 1,500 (1,377–1,389 MB at pixel ratio 1.25); JS heap 79.25 / 80.03 MB PASS |
| the unattributed-draw cap | same + `MEMORY_BUDGETS.unattributed.w0Cap` | direct count graded; cross-checks on a pinned world with both instruments over the same frames; **PASS 5** (3 of 3 on the final instrument, one inside the full suite) |
| R34 self-contained scenarios | `tools/budgets.mjs` + `A-perf-scenarios-self-contained` | done; **PASS** |

## B.1–B.5 Methods

Unchanged from fix round 1 except: **A90-abs**'s A90 workload kills a staged kind's machine (`memVictim`) like the carried
A90 row; **A-unattributed-cap**'s cross-checks run on a pinned world, each pair read by the renderer's counter and the direct hook over the same frames (FR2 item 5). The methods in brief: A-alloc-rate is the
CDP sampling heap profiler (2 KB interval) over 10 s of the staged fight + 10 s of sprint-and-draw, every sampled byte charged
to the nearest `src/**` frame, graded at max(measured, KB/frame × 60); A-vram-ledger is a census of the GL allocation calls
installed before the game makes its context (render targets = textures ever attached to a framebuffer + renderbuffers,
engine-gpu's sized-format table); A90-abs runs the A90 workload, two forced GCs, then the staged fight for 60 s, JS heap
from `Runtime.getHeapUsage` after GC, GPU process from `SystemInfo.getProcessInfo` + macOS `footprint`.

## B.6 Measured numbers

The per-function breakdown below is from this round's first full suite, 21:12–21:33Z (load 2.9–4.8, 1 other gate
Chrome; the W0b gate code for these three rows is the final one). The final suite (02:50Z) and the lane block (01:34Z) read
the same picture: A-alloc-rate 120,740 / 91,718 KB/s graded with `noise2D` first, render targets 437.75 MB to the byte,
GPU process 1,522.4 / 1,520.9 MB. Tier high, pixel ratio 1.5 (= min(device DPR 2, tier cap 1.5)), 2400 × 1350 drawing buffer.

**A-alloc-rate** (staged fight = 8 × the herd role's Tiller fixture; R18 fallbacks named)

| phase | fps | src/** caller, measured | KB / frame | **graded** | self attribution, graded | post-GC slope |
|---|---|---|---|---|---|---|
| staged fight, 10 s | 27.4 | 56,869 KB/s | 2,078 | **124,699 KB/s** | 85,348 KB/s | +30.3 KB/s |
| sprint and draw, 10 s | 28.0 | 53,767 KB/s | 1,921 | **115,235 KB/s** | 88,249 KB/s | +67.4 KB/s |
| empty frame (scene hidden, reported) | 55.7 | 45,517 KB/s | — | — | — | — |

Bars: ≤ 64 KB/s total, ≤ 4 KB/s per function, slope ≤ 0. Drive witnessed: sprinting 60 %, aiming 40 %, 6.87 m/s max, 3 arrows
at full draw. Of the empty-frame floor, the engine + frame loop is 4,500 KB/s (4,388 of it the cull traverse closure,
`engine.js:1352`); the rest is the simulation, so no allowance is warranted or recorded. Functions over 4 KB/s, graded KB/s
(worst phase), by owner — the routing with the fix for each is in §4:
- world-ground (W1): `noise2D` terrain.js:78 **19,091**, `getHeight` terrain.js:1860 16,462, `_ridged` :1847 843.
- FROZEN spatial (grant needed): `_meshPush` collision.js:835 **15,426**, `raycast` :888 12,630, `occluded` :1099 3,648, `sphereQuery` :679 2,667.
- engine-gpu: `render` engine.js:273 **11,134**, the cull traverse closure engine.js:1352 6,736, :1439 384, :1658 358.
- hero-body: `_springs` playerAnimator.js:3708 **8,690**, `update` :1168 2,306, `meleeLayer.js:5003` `segPoint` 784, `_twistLayer` :3569 467.
- FROZEN rigging (grant needed): `clipLayer.js:417` 6,673, `locomotion.js:236` 531, `boneSpace.js:318` 391.
- FROZEN machine rig (grant needed): `gait.js:889` 5,009, :1385 590, :1322 272, `rig/lod.js:1345` 208.
- instruments-core: `machines/index.js:533` 2,317, `ai/attacks.js:529` 1,194, `machine.js:2237` `_updateEyes` 737, `:1771` 474.
- world-props: `fauna.js:833` 1,915; shell-ui: hud.js 442 / 317 / 181 / 136; settlements: npcAnim.js:1562 420, npc.js 242 / 143 / 136; audio: 239 / 204 / 200.

**A-vram-ledger**: textures 105.46 MB (≤ 160 PASS), **render targets 437.75 MB (≤ 170 FAIL)**, geometry 79.54 MB
(≤ 120 PASS), total 622.75 MB (≤ 450 FAIL). Largest: the MSAA scene renderbuffer 2400 × 1350 × 4 samples 103.68 MB and its
depth 51.84 MB; five 2400 × 1350 HalfFloat targets 25.92 MB each; the CSM cascades 2048² colour + depth 16.78 MB each (× 6).
engine-gpu's recorded ledger in this tree (its W0a probe, DPR 1.25) totals 340.74 MB; its **unmerged W0b tier** records
127.27 MB (its report, `L12`).

**A90-abs**: JS heap after two forced GCs 65.30 MB at boot, 76.14 MB after the A90 workload (30 Tiller kills, 30 respawns),
**79.93 MB** after the 60 s fight (≤ 450 PASS). GPU process 1,505.43 / 1,501.27 / 1,511.57 / 1,514.93 / **1,515.06 MB**
(≤ 1,500 FAIL). What-if at pixel ratio 1.25: 1,377.65 MB.

**A-unattributed-cap**: 335 draws/frame, post chain 22; vegetation 76, landmarks + places 75, Brea + gear 37, Instruments 32,
settlement kit 29, terrain / sky / sea 24, VFX / UI / pooled 19, NPCs 16; **unattributed 5** (live `[5 × 8]`, pinned
`[5 × 8]`): the five unnamed instanced quads of `src/combat/particles.js` (frozen). On the pinned world every owner's
per-frame count is constant (NPCs `[16 × 8]` live and pinned). With the final instrument (03:10Z, inside the full suite) the
renderer and direct-hook hide deltas are equal in every pair; NPCs read 14 / 14 on the pair's own frames (16 before the
pairs: the cull-hysteresis drift), vegetation and Instruments show a 0.5 draw substitution, the unregistered pair 5 / 5.

---

## 1. Gate table — the global green list (the items that exist in this tree)

| gate (owner) | result | measured (final build) |
|---|---|---|
| `A1-boot-clean` | **PASS** | full run, both suites |
| `A9-perf-budget` (R26) | **PASS** | 59.5 fps median in both sealed partial re-runs (load 3.4 / 4.8), draws 309 < 350; the full run's 39.9 fps at load 7.8 is an attributed PENDING (R26), not counted |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors |
| `A21-real-draw-calls` | **PENDING** (box) | draws 309 / 232 / 337 ✓, triangles 4.12 / 4.40 / 4.40 M ✓; GPU median 78.0 / 103.0 / 68.8 ms, p95 frame 56.4 / 69.1 / 49.6 ms (final suite), JS PENDING: another gate Chrome alive and load ≥ 3 at every start. Expected FAIL on the GPU term until engine-gpu's tier merges (A9's own scene GPU on the vista: 19.6–21.6 ms). |
| `A90-memory-stability` | **PASS** | 30 Tiller kills → 30 respawns (the re-staged workload kills a staged kind only): geometries 157 → 174 (+17 ≤ 40), textures −3 (≤ 8), heap +1.7 % (< 25 %), scene objects −37 (≤ 60) |
| `A90-memory-stability-expansion` | **PASS** | objects +37 (≤ 600), non-machine growth 0, orphan roots 0, heap +4.4 % (< 25 %) |
| `A90b-memory-attribution` | **FAIL** (instruments-core, R34) | 24 Bones from `autorig.js:75` held after 30 Tiller kills; instruments-core's unmerged W0b fix records 0, 3/3 |
| `A90-rig-reclaim` | **PASS** | 30 cycles on the Tiller: geometries +0, textures 0; per live machine 0 / 0.63 (≤ 1) |
| `A90-abs` | **FAIL** | above |
| `A-alloc-rate` | **FAIL** | above |
| `A-vram-ledger` | **FAIL** | above |
| `A-ID-ip-assets-gone` (pipeline) | **PASS** | 16 GLBs, 0 IP hits; `aloy.glb` a scheduled exception (hero-body, R39) |
| `A-licence-manifest` (pipeline) | **PENDING** | third-party / legacy-source / credits clauses PENDING (R42: awaiting Kevin's download go-ahead, not blocking W0b); the rest PASS |
| `A-assets-tracked` (pipeline) | **PASS** | 212 referenced paths, 0 ignored, 0 missing |
| `A-no-horizon-terms-player` / `-code` (brand) | not in this tree | brand's W0b |
| `A-reach-all-sites` | not in this tree | no lane file defines it yet |
| `A-port-guard` | **PASS** | lane block |
| `A-carried-suite` | **FAIL** (3 rows) | A90b and A73 regress (other lanes), V21 awaits its R29 judge (A.3) |
| `A79-runner-verdict-line`, `A80-chrome-profile-hygiene` (carried) | **PASS** | full run and suites |

## 2. Contracts and APIs published (exact signatures; changes this round in bold)

### 2.1 `tools/gate-roster.mjs`

```js
export const ROLES, ROLE_PENDING, ROLE_OVERRIDE, ROSTER, SKIP_CARD, FAIL_CARD, HERO   // unchanged
export function staged(roles, body), stagedSetup(roles, setup)                      // unchanged
export const ALL_MACHINES_REASONS   // NEW: { freeze, clear, census, warm, mirror, cast } -> meaning (A.1)
// NEW inside the ROSTER page prelude (splice inside an async body):
const isStaged    = (m) => boolean                         // living, not disposed, kind in STAGED_KINDS
const liveStaged  = (filter?) => Machine | null            // first living machine of a staged kind passing filter
const livesStaged = (filter?) => Machine[]
const liveOfKind  = (kind, filter?) => Machine | null      // null when kind is not staged (a legacy kind)
const stageAny    = async ({ dx = 18, dz = 18, wait = 700, filter } = {}) => Machine | null
                                                           // liveStaged(filter), else one of anyKind()'s role spawned dx/dz from the player
const memVictim   = (filter?) => Promise<Machine | null>   // stageAny({ dx: 30, dz: 30, wait: 400 }), never docile
```

### 2.2 `tools/gate-places.mjs`

**Two new W0 places** (contract names for world-props' `gatePlaces`, W1): `castStage` `{ x, z }` — open flat ground where a
side-on cast line-up stands, framed from 60 m (V26 / V27 / A44c / V26c); `meleeSlope` `{ x, z, heading }` — a ≈ 25° grass
slope and its uphill heading (A103's slope rows). Everything else unchanged.

### 2.3 `tools/budgets.mjs`

Unchanged API (`BUDGETS`, `STAGE_PRELUDE`, `PERF_SCENARIOS`, `RT_LEDGER` re-export, `MEMORY_BUDGETS`); the scenario
`machines()` helper is annotated `census` (it resets and pins the world; the casts are role-staged through `pick` / `fill`).

### 2.4 `tools/gates/gates-perf.w0b.mjs`

```js
export const W0B_BUDGETS, UNATTRIBUTED_CAP_W0, DRAW_OWNERS, ownerOfName(name), GATES   // unchanged
// A-unattributed-cap detail (CHANGED): crossChecks.perOwner[] { id, hidden (renderer hide delta), hiddenDirectHook,
//   ownDirectSameFrames, substitution, infoVsDirectMaxPerFrame, pinnedDirect, liveDirect, livePerFrame[], pinnedPerFrame[], roots },
//   crossChecks.pinnedWorld { method, held, framesAdvanced, pinnedUnattributedPerFrame[] },
//   probe.owners[id] / probe.unregisteredPair { draws, directDelta, with, without, ownDirectWith, ownDirectHidden,
//   substitution, infoVsDirectMaxPerFrame, framesWith, framesWithout }
```

### 2.5 `tools/gates.r5.gates-perf.mjs` (grading contract)

- A-gate-preludes detail: **`machineListUse { unstagedPicks[], unstagedPickCount, unknownReasons[], stagedFilterLines,
  annotatedByReason{}, reasons, selfTest, annotatedSites[] }`**; checks **`noMachinePickWithoutRoster`**,
  **`machinePickScanSelfTest`**.
- A-carried-suite: class **`skipR28`** (a baseline-PASS row re-staged under R28 that reports SKIP-legacy (R28) in every
  observation; listed in **`r28SinceBaseline[] { id, note }`**, never counted as PASS).
- Unchanged: `CAL_SHADOW_EXITED`, `RULED_OWNER`, the judge CLI, ledger, seal v3, `CAL_ORCHESTRATOR_PUBKEY`,
  `CAL_CARRIED_RUNS`, the semaphore write tracer.

### 2.6 Registration / auto-discovery

`tools/gates.config.mjs` imports every `tools/gates.r5.*.mjs` by pattern (A-gates-autodiscover), so
`node tools/gates.mjs --port 5255 --lane gates-perf` runs the 13 rows. On a tree without it (main, until this merges):
`node tools/gates.mjs --port <p> --extra tools/gates.r5.gates-perf.mjs --lane gates-perf`.

## 3. Honest gaps

1. **A-carried-suite cannot PASS in a lane run.** V21 needs the orchestrator's R29 judge (my advisory reading is a
   PASS, A.2); A90b (instruments-core, R34; fixed in its unmerged W0b tree) and A73 (the Tiller's voice seeds) regress.
2. **A-alloc-rate, A-vram-ledger, A90-abs and A21's GPU term fail or wait on other lanes' code** (§4). The gates are
   built and fail truthfully; nothing in this lane's paths can move them.
3. **The box.** The monitors saw a quiet fraction of 1 % (final full run, load max 7.82, up to 2 other gate Chromes) and 0 % (both partial re-runs) against the baseline's 39 %. A21's
   GPU / frame / JS terms need load < 3 **and** 0 other gate Chromes when the row starts; another lane's gate Chrome was
   alive at every A21 start this round, so they stay PENDING here (the orchestrator's 5270 run decides). Its GPU term is
   expected to FAIL in this tree even on a quiet box: A9's own scene-GPU read on the same vista was 21.6 ms at load
   2.9, over 14, until engine-gpu's tier lands.
4. **A92's earlier observations on this build are gone.** Two full runs of this round ran the intermediate A92
   stagings (the second, with a "settle" that made every phase 0, FAILed it); both runs are stale now, because the aim
   change edited `carried.mjs`. The graded observations are the final full run's and the partial re-runs' (A.3).
5. **The machine-pick scan is lexical.** An alias annotated `census` or `clear` could later be used for a pick; every
   annotated site (33) is listed in the gate's detail for audit, and the six reasons are a closed set.
6. **SKIP-legacy (R28) for a baseline-PASS row is my reading** of plan §9 (A-carried-suite's allowed states) together with
   R28; it applies to one row (A45c) and is listed by name. The orchestrator may overrule it (§4).
7. **Slot discipline by others.** At 19:42Z another lane's judge re-took machine slot 1 while my diagnostic run held it
   (3 gate Chromes for ~5 min). My scripts only ever release slots whose owner line is gates-perf's.
8. **`shots/` peaked at 449 MB** during each full carried run (the harness writes one PNG per row, 236 rows); every
   PNG was deleted as soon as the run's sealed copies were in the ledger. The 200 MB cap held only between runs.
9. **One complete full run per build** is the floor (`CAL_CARRIED_RUNS` raises it); a known-flaky row is decided by its
   first 5 observations.
10. **Carried over:** the write tracer does not see worker threads; A-gates-autodiscover writes two probe lane files into
    `tools/` for ~1.5 s; the baseline's own evidence is gone (the file is anchored by git); a forger with this
    machine's account can forge the ledger (the orchestrator holds the ledger it grades and the key it trusts).

## 4. What other lanes and the orchestrator must do

| who | what |
|---|---|
| **orchestrator** | **Merge order.** Part A (§5.1) can merge first; Part B (§5.2) is additive. Merge engine-gpu's W0b tier and instruments-core's W0b A90b fix, then re-grade A-vram-ledger, A90-abs, A90b, A21 and A-alloc-rate on the merged build. |
| **orchestrator** | **Grade A-carried-suite on 5270** (quiet box, 1 Chrome): `CAL_GATE_LEDGER=<a dir you hold> node tools/gates.mjs --port 5270 --lane carried` once; then `--only A100-spear-holster,A50b-aim-on-drawn-geometry,A9-perf-budget` until the flaky rows' first 5 observations decide; then the V21 judge (next row); then `CAL_ORCHESTRATOR_PUBKEY=<your key> node tools/gates.mjs --port 5270 --only A-carried-suite` in an invocation of its own. After hero-body's exit add `CAL_SHADOW_EXITED=hero-body` to grade the 35 shadowed rows on the merged build. |
| **orchestrator** | **R29 judge for V21** (the only kept visual row graded here). Keygen / register / verdict: `node tools/gates.r5.gates-perf.mjs --judge-keygen --out <outside every tree>/orchestrator.pem`; per judge `--judge-register --judge-name <who> --port 5271 --judge-pub <its key> --orchestrator-key orchestrator.pem`; the judge: `--judge --list --port 5270`, then `--judge --seal <id> --id V21-camera-cover --pass true|false --rationale "…" --judge-name <who> --port 5271 --judge-key judge.pem --reference reference/r5/gates-perf/chase-camera.jpg`. |
| **orchestrator** | **Confirm four re-stage readings** (none moves a bar; each is recorded in its row): (a) Round-4 roster counts mapped to the staged roster — A23b `tested === kinds.length` and A75 `dispatched === species.length` (Appendix B's own words), A45/A46/A48/A45b `min(2, staged kinds)`, A50b `min(4, staged kinds)`; (b) A78b's ninth cast state and the `interact` pose are the Override mechanic R17 removed; (c) A23 staged on the colossus role only (R18, no re-pointing); (d) A-carried-suite accepts SKIP-legacy (R28) for a baseline-PASS row whose subject exists only on legacy content (A45c), listed by name. **Grants** for the frozen hot spots below (`collision.js`, `nav.js`, `anim/clipLayer.js`, `gait.js`). |
| **engine-gpu** | **A-vram-ledger / A90-abs / A21**: merge the W0b tier (your report: render targets 127.27 MB at DPR 1.25, vista GPU 11.8–12.4 ms). In this tree: RT 437.75 MB at the shipped `high` (DPR 1.5); GPU process 1,520.9–1,522.4 MB (1,377–1,389 at 1.25); A21 GPU medians 78 / 103 / 69 ms on a loud box, and A9's own scene GPU read 21.6 ms on the vista at load 2.9, over A21's 14 ms bar until the tier lands. **A-alloc-rate**: `engine.js:273` `ScenePass.render` → `renderer.render` 11.1 MB/s, almost all of it three's `getParameters` / `getProgramCacheKeyParameters` / `join`: three re-derives a program key every frame, which it does when a material's `version` changes every frame (`needsUpdate = true` per frame) or the lights state version does (a light or shadow toggled per frame); find that material or light. `engine.js:1352` the cull pass's `scene.traverse((o) => …)` 6.7 MB/s (4.4 with nothing drawn); `:1439`, `:1658`. **A23 / A23b** are yours and gates-perf's (plan §9): A23 now waits for the colossus role; A23b PASSes on the Tiller. |
| **instruments-core** | **A90b** (R34): in this tree 24 Bones created at `autorig.js:75` stay held after 30 Tiller kills (the `machine.js:162` clone no longer appears with the re-staged, Tiller-only workload); your unmerged W0b fix records 0 held, 3/3. **A73**: the Tiller fixture declares `voice/tiller/windup` and `voice/tiller/strike` with no seeds (or the orchestrator rules them audio's at W3). Allocation: `machines/index.js:533` 2.3 MB/s, `ai/attacks.js:529` 1.2, `machine.js:2237` `_updateEyes` 0.7, `:1771` 0.5. Name the five particle meshes of `src/combat/particles.js` (frozen; whoever holds its grant) so the unattributed cap can register them. |
| **world-ground (W1)** | `terrain.js:87` `const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];` allocates an array and an iterator on every `noise2D` call (19.1 MB/s); `const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;` removes it. `getHeight` (terrain.js:1860, 16.5 MB/s) has no allocation of its own in its body: its share is most likely `noise2D` inlined into it, so the same line should clear both (re-measure). |
| **orchestrator (grant) → spatial** | frozen `collision.js:835` `_meshPush`: a new `shapecast({ intersectsBounds, intersectsTriangle })` object and two closures per sample, three samples per call (15.4 MB/s); one hoisted callbacks object with its state in module scope removes them. `raycast` :888 12.6 MB/s, `occluded` :1099 3.6, `sphereQuery` :679 2.7 (`gkey()` per cell); `nav.js` `steer` :579. |
| **orchestrator (grant) → rigging / machine rig** | frozen `anim/clipLayer.js:417` (`mixer.update` per layer) 6.7 MB/s, `locomotion.js:236`, `boneSpace.js:318`; `gait.js:889` 5.0 MB/s, `:1385`, `:1322`; `rig/lod.js:1345`. The allocation sits inside or inlined below these frames (the report's `topSrcSelf` / `topOutsideSrc` lists name the callees). |
| **hero-body** | `_springs` playerAnimator.js:3708 8.7 MB/s, `update` :1168 2.3, `_twistLayer` :3569 0.5, `meleeLayer.js:5003` 0.8. The 35 R33 (g) rows are yours to grade on Brea; V13's staging asserts aim + bow in hand and films at 24°. |
| **world-props** | `fauna.js:833` 1.9 MB/s. `castStage` and `meleeSlope` join the `gatePlaces` contract (§2.2). |
| **shell-ui (W2), settlements (W2), audio (W3)** | the allocations listed in B.6. A71 PASSes on the Tiller now. |
| **melee (W1), hero-body** | Replace the weak references `lance-back-carry`, `lance-follow`, `chase-camera` (add SLOTS rows, `tools/r5-refs/fetch.mjs --fetch --lane <lane>`). |
| **every lane** | Name every top-level scene child for its §4.2 row (`DRAW_OWNERS`); unnamed roots count against the cap (W0: 5; ≤ 30 by W2). Pick machines only through the roster helpers (A.1). A-gate-preludes grades every `machines.list` use in the carried file and in this lane's sources; it does not yet scan other lanes' files for machine picks (their species literals and coordinates are reported, R33 e). |

## 5. Files changed (this round)

`git status --short` shows only this report at the end of the round because the orchestrator's WIP checkpoints
(`a2fba7c` 19:29Z through `3d81f2d` 03:07Z) committed the code edits as they landed. This round's diff is
`git diff dcb9e5e -- tools docs/ROUND5-GATES-PERF.md` (7 files, +818 / −489 at 03:25Z).

### 5.1 Part A (merge first)

| file | change this round |
|---|---|
| `tools/gate-roster.mjs` | `ALL_MACHINES_REASONS`; roster helpers `isStaged`, `liveStaged`, `livesStaged`, `liveOfKind`, `stageAny`, `memVictim` (A.1) |
| `tools/gate-places.mjs` | W0 places `castStage`, `meleeSlope` |
| `tools/gates.r5.carried.mjs` | R28 re-stages (A90, A90b, A90-expansion, A92, A93, A94, A78, A79, A101, A43, A65, A74b, A77b, A41b, A23b, A103, A106, A64c, `pickMachine`, `docileContract`, the two `SPECIES` preludes, A50b), whole-roster annotations, `ensureKind` deleted; roster-count re-stages (A23b, A75, A45, A46, A48, A45b, A50b), A78b (R17), A23 on the colossus role (R18), A71 staging, A92 staged on `impactGround` and aimed at drawn geometry the exact sweep hits, A45c SKIP-legacy (R28); literal coordinates replaced by places (A103, A106, V41, the cast line-up) |
| `tools/gates.r5.gates-perf.mjs` | A-gate-preludes: machine-pick scan + self-test, declared-pair and hypot-offset coordinate forms + self-test lines; A-carried-suite: `skipR28` + `r28SinceBaseline`; title / rule text |
| `tools/budgets.mjs` | the scenario `machines()` helper annotated `census` (no behaviour change) |

### 5.2 Part B

| file | change this round |
|---|---|
| `tools/gates/gates-perf.w0b.mjs` | A-unattributed-cap: cross-checks on a pinned world, each hide pair read by the renderer's counter (per frame at `onAfterRender`) and the direct hook over the same frames, substitution reported, state restored in `finally`; A90-abs workload pick `memVictim` |
| `docs/ROUND5-GATES-PERF.md` | this report |

No file outside the §2 row and the §1.2 grant was edited; the harness grant files (`gates.mjs`, `screenshot.mjs`,
`chrome-profile.mjs`) are untouched this round. No asset was added under `public/`, so there is no `LICENSES.json` row.

## 6. Processes

At the end of the turn (03:2xZ): this lane's Vite on 5255 stopped (no listener on 5255); no `gates.mjs`, `run-gates.sh`,
diagnostic or chain process of this lane alive; no Chrome of this lane (the one gate Chrome alive belongs to
instruments-core's 5254 judge); 0 Chrome profiles of this lane under `$TMPDIR/cal-chrome-profiles` (the one there,
`cal-29023-5254-0`, is instruments-core's; `chrome-semaphore` is the shared semaphore root); no machine slot held by
gates-perf. `shots/` holds the 4 report files (112 KB): every PNG was deleted after its sealed copy was in the ledger
(the harness writes one per row, so `shots/` peaked at 449 MB during each full carried run, §3 gap 8). Disk 45 GB free.

Kept for the orchestrator and the judges, outside the tree: the run ledger `scratchpad/r5/gates-perf/ledger/` (208 MB:
`ledger.jsonl`, every sealed run's report copy and monitor, the frames of the recent full runs including the final one's 37);
the reports `scratchpad/r5/gates-perf/work/{carried-full-fix2c,lane-fix2,suite-fix2c,uac1-fix2,uac3-fix2,acs-final-fix2,p2-fix2,p3-fix2}.report.json`
(and the earlier runs of this round); the logs in `scratchpad/r5/gates-perf/logs/`. Deleted: the diagnostic ledger, the
throwaway diagnostic gate modules and the run-chain script. There was no judge scratch this round.
