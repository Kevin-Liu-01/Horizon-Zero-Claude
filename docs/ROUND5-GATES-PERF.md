# ROUND 5 — lane `gates-perf`: W0a exit (R33) and W0b

Port 5255. Tree `scratchpad/r5/gates-perf/tree` → `~/.calima-r5/trees/gates-perf`, branch `r5/w0a-gates-perf`
(this session started at `766e49b`; the orchestrator's WIP checkpoints committed the work as it went). Oct 22 2026.
Plan rows: §2 gates-perf, §1.2 harness grant, §3.1 W0a + W0b exits, §3.2 `gates.r5.carried.mjs`, §4.2 / §4.4, §6
(`reference/*.jpg`), §8.3 R33, §9 gates-perf. The fix-round-2 report this file replaces is in git history.

**Part A (the W0a exit under R33) is reported first and can merge first; Part B is the W0b work.** §5 lists the files of
each part.

## 0. Result

Lane block, `node tools/gates.mjs --port 5255 --lane gates-perf` (12 rows), 10:33–10:43Z (run `p5255-94431-1792665214354`), report copied to
`scratchpad/r5/gates-perf/work/lane-1.json`:

| gate | result | measured |
|---|---|---|
| `A-gate-preludes` | **PASS** | graded (R33 e): `gates.config.mjs`, `gates.mjs`, `gates.r5.carried.mjs`, `gates.r5.gates-perf.mjs`, `budgets.mjs`, `gates/gates-perf.w0b.mjs`: 0 kind literals, 0 old-map coordinates (42 pairs), 0 kind words in prose. Reported, graded at their own exits: brand (`'strider'`, `{ x: 18, z: 26 }`), instruments-core (16 kind literals, `x: 120, z: 40`). 0 of 12 DIES ids registered; preludes used by 78 / 74 / 11 carried rows (roster / places / hero), 0 unresolved. Scanner control 6/6 hits, 0/4 false hits. |
| `A-gates-no-hero-literals` | **PASS** | 12 `tools/gate*.mjs` files, 0 hits; 16 carried rows read bones through the animator. W3 scope (all of `tools/`): 28 files with hits (archive, audio recipes, POC), reported. |
| `A-gates-autodiscover` | **PASS** | 8/8 in child processes (pattern discovery, no lane file named, new id, shadow by id, shadow row still in `--lane carried`, broken file → LOAD-FAIL row, probes removed); 272 rows with the probes. |
| `A-chrome-semaphore` | **PASS** | 4 real `gates.mjs` runs at 1 slot: 4/4 PASS, 3 waited, **at most 1 Chrome over 321 samples**; 4 stand-ins at 2 slots: at most 2 alive, 0 tickets left; SIGKILL: B blocked while A held, done 0.66 s after `kill -9`; preflight at simulated 2.5 GB disk / 20 % memory: both harnesses exit 1, "preflight refused", 0 Chromes; the tree's 5 report files untouched (the children wrote 4 reports in the sandbox). |
| `A-carried-suite` | **FAIL** (true state) | composition 236/236; baseline anchored (git, `766e49b`). In the lane run: 1 complete full sealed run + 6 partial; 124 pass, 7 regression, 8 awaitingJudge, 1 needsQuietBox (A9). Re-graded at 10:47Z in an invocation of its own after A9's quiet-box PASS (8 partial): **125 pass, 7 regression, 8 awaitingJudge**, 35 listed, 30 newly staged, 29 skipReplaced, 2 skipR30 (A.4). |
| `A-reference-clean` | **PASS** | 13 images under `reference/`, all with rows (11 PD, 1 CC0, 1 CC BY 2.0); the 19 deleted stills recorded with sha256, 0 present by name, 0 by content; V12 → `run-side`, V22 → `run-rear`, V24 → `draw-side`, V46 → `lance-ready-side`, V48 → `lance-back-carry`. |
| `A-reference-set` | **PASS** | fetcher queries the Commons API and stores only PD / CC0 / CC BY (classifier controls 10/10); the set verifies offline (13 stored, 0 problems); 8/8 graded visual rows name a reference; 29 SKIP-replaced rows reported with their absorbing lanes. |
| `A-alloc-rate` | **FAIL** | src/** **37,460 KB/s** measured at the staged fight (27.0 fps; 1,389 KB/frame → graded 83,346 KB/s) and **37,043 KB/s** at sprint-and-draw (27.6 fps; graded 80,545 KB/s) vs **64 KB/s**; worst function `noise2D` (terrain.js:78) 18,725 KB/s vs 4; post-GC heap slope +118.7 / +75.5 KB/s vs ≤ 0 (B.6). |
| `A-vram-ledger` | **FAIL** | textures 105.46 MB (≤ 160 PASS), **render targets 437.75 MB (≤ 170 FAIL)**, geometry 79.54 MB (≤ 120 PASS), total 622.75 MB (≤ 450 FAIL), tier high, pixel ratio 1.5, 2400 × 1350. |
| `A90-abs` | **FAIL** | post-GC JS heap **83.15 MB** (≤ 450 PASS); Chrome GPU-process footprint **1,543.9–1,562.3 MB** over the 60 s fight (≤ 1,500 FAIL); 30 kills / 30 respawns (Tiller). Reported: at pixel ratio 1.25 the footprint read 1,427.4 MB. |
| `A-unattributed-cap` | **PASS** | 5 draws / frame unattributed (cap 5 recorded at W0; hide-unregistered 6, per-draw 5) of 335, post chain 22. |
| `A-port-guard` | **PASS** | 16 refusals (8 cases × 2 harnesses); lsof control saw its own connection; 0 connections to :5173 from this run's process tree over 292 samples (10:33:34–10:43:16Z, max gap 2.05 s) and over 7 sealed runs' monitors (incl. the full run: 1,924 samples, max gap 2.74 s); full lane run. |

The box was never quiet this session: five other W0b lanes ran gate Chromes throughout. The sealed full carried run's
own monitor saw a quiet fraction of **1 %** (load max 9.99, up to 2 other gate Chromes) against the baseline runs' 39–66 %.
Every number below that depends on the clock is reported with its box; the orchestrator's 5270 run is authoritative.

---

# Part A — the W0a exit under R33

## A.0 Summary

| item (orchestrator's list) | status |
|---|---|
| A-carried-suite as a regression guard vs the recorded W0-day1 baseline | **built and graded**: 1 sealed full run + 8 sealed partial re-runs of this build. FAIL, truthfully: 8 kept visual rows await an R29 judge (the lane may not judge) and 7 action rows regressed against the baseline (owners named, A.4; one of them, A70b, is my staging defect, §3 gap 3) |
| `tools/gates/carried-baseline.json` written once, with the box sample | already written Oct 19 (3 sealed runs, box sample per run) and committed in `766e49b`; **not rewritten**. Its ledger was lost in the Oct 22 reboot, so it is now anchored by git (A.1) |
| visual rows graded only for kept systems (V1–V4, V12–V14, V21) by an R29 judge | yes; 29 other visual rows `skipReplaced`, each naming its absorbing lane |
| SKIP-replaced rows name their absorbing lane | yes (`detail.skipReplaced`, e.g. `V38-title -> shell-ui`) |
| sealed runs bound to their frames | seal v3: frames hashed and copied at capture, run id in the report and every frame path |
| no report overwritten by a semaphore child | children run in a sandbox cwd; the tree's 5 report files are fingerprinted and restored; **new: children of a monitored run are never sealed** |
| A-gate-preludes on own files + carried.mjs | **PASS** (R33 e); brand's and instruments-core's files reported, graded at their exits |
| A9 on R26 | carried row: draws < 350 always; median fps ≥ 58 graded on a quiet box only. This session: draws 309 every run; median 40.3 / 40.0 fps PENDING at load 6.2 / 4.7, then **58.1 fps PASS at load 2.87** (10:44Z) |
| A21 names its DPR | the verdict line now names tier, pixel ratio, device DPR and the box (A.2) |
| `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` in `tools/budgets.mjs` | done; engine-gpu's file loads it |
| the open W0a judge findings, documented | A.3: all four closed, each with a measurement |

## A.1 What R33 asked, and what the gate does now

| R33 clause | implementation (file) | evidence |
|---|---|---|
| (a) baseline recorded once, with the box sample | `tools/gates/carried-baseline.json` (written Oct 19 07:04Z from three sealed runs of the W0-day1 runtime, committed by the orchestrator in `766e49b`; **not rewritten**). Tally: 131 pass, 3 flaky (A13, A100, A50b), 3 fail (A19, A21, A31c), 36 SKIP-R18, 26 SKIP-R30, 37 visual. Each run's box: quiet fraction 0.393 / 0.387 / 0.656, load max 5.6 / 18.8 / 4.9, 0 other gate Chromes. | **The anchor changed this session.** The run ledger that held those three seals (`$TMPDIR/cal-gate-ledger`) is gone: the machine rebooted (uptime 14 min at 07:21Z) and the directory did not survive. `loadBaseline()` now anchors the file two ways: re-derived from its sealed runs when they are in the ledger (as before), else **byte-identical to the version that first added it to git** (`git log --diff-filter=A`, oldest add = `766e49b`) and internally consistent (every verdict follows from its per-run classes; the tally is the rows'). A partial ledger (some seals present) FAILs. Measured: `anchor: "git: byte-identical to the version first committed in 766e49b21b (2026-10-19T01:09:12-07:00)"`. |
| (b) PASS at baseline must PASS now; known-flaky 3 of 5; FAIL/PENDING not worse | `carriedSuite()` (`tools/gates.r5.gates-perf.mjs`) | see A.2 |
| (c) visual rows graded only for kept systems by an R29 judge; others SKIP-replaced naming the absorbing lane | `KEPT_VISUAL` = V1–V4, V12–V14, V21 (+ any row a lane shadows); every other visual row is `skipReplaced` with `absorbedBy` named; a kept row counts only with a **signed** verdict (judge key registered by an orchestrator key the grader trusts) on the newest complete full run's sealed frame | A.3 (R29 mechanics on a scratch ledger) |
| (d) sealed runs bound to their frames; no report overwritten by a semaphore child | seal v3: frames hashed and copied **at capture** (`Page.prototype.screenshot` observer), the run id in the report (`runId`) and in every frame path (`runs/<runId>/<id>.png`); A-chrome-semaphore's children run in a sandbox cwd, the five tree report files are fingerprinted before/after and restored; **new: a child `gates.mjs` of a monitored run is never sealed** (it would have recorded the semaphore's A1 exercises, including the preflight refusals, as observations of the build) | lane run, A-chrome-semaphore detail `treeReportsUntouched` |
| (e) A-gate-preludes on gates-perf's files + carried.mjs | graded files: `gates.config.mjs`, `gates.mjs`, `gates.r5.carried.mjs`, `gates.r5.gates-perf.mjs`, `budgets.mjs`, **`gates/gates-perf.w0b.mjs` (new)**; brand's and instruments-core's files reported | PASS (§0) |
| (f) A9 on R26; A21 names the DPR it measured, attributable only on a quiet box | A9: median fps ≥ 58 on a quiet box (load < 3), else PENDING attributed; draws < 350 always. A21: the verdict line now reads `measured at tier "high", pixel ratio 1.5 (= min(device DPR 2, tier dprCap 1.5); draws / triangles / frame / JS also at the uncapped DPR 2, graded on the worse) on a LOUD box (1-min load …, N other gate Chrome(s))`; GPU term PENDING unless the box is quiet | carried run |

## A.2 Grading rules added or changed this session (none moves a bar)

1. **One full carried run per round** (orchestrator, W0b: "never run the full suite more than once per round"). The gate
   grades every fresh, complete, sealed FULL run of this build (at least 1; `CAL_CARRIED_RUNS` raises the floor). The
   W0a floor of 3 full runs (66 min each) is gone. A **targeted re-run** — `node tools/gates.mjs --port <P> --only <carried
   ids>` and nothing else — is sealed as a PARTIAL run: one more observation of exactly the rows it ran.
2. **Every observation counts.** A row that PASSED at baseline must PASS in every observation of this build (full and
   partial): re-running cannot erase a failure. Known-flaky rows (A13 under R27; A100, A50b from the baseline) are decided
   by their **first 5** observations on this build (≥ 3 PASS); later runs cannot replace them.
3. **R30.** A row that passed at baseline and now reports `SKIP-legacy-deleted (R30)` because its subject was deleted at
   W0a (the NPC body, the IP machines) is `skipR30`, listed under `r30SinceBaseline` — R30 requires exactly that SKIP.
4. **Attributed PENDING is not a measurement.** For a baseline-PASS row, an observation that is a Round-4-attributed
   PENDING (R26's loud box, a contended GPU) neither passes nor fails it; the row needs at least one measured PASS
   (`needsQuietBox` otherwise, which FAILs the gate).
5. **Newly staged rows.** A row that was a SKIP at baseline (its role had no kind) and now stages on the Tiller fixture
   (R28) is `newlyStaged`: listed with its result and owner, not graded here (there is no Round-4 verdict on that content to
   regress from; the owner's must-stay-green list grades it). **The orchestrator may rule otherwise** (§4).
6. **The box is reported, not used to drop a run.** Each run's quiet fraction (its own monitor: samples with load < 3 and
   0 other gate Chromes) is printed beside the baseline's lowest (0.387). W0a fix round 3 dropped "louder" runs; with one
   full run per round and five other lanes running gates, that would have graded nothing. A loud box can only make a row
   worse; the orchestrator's quiet-box run on 5270 is authoritative.
7. **git HEAD is recorded, not compared.** The orchestrator checkpoints every lane tree with WIP commits (07:45Z, 08:11Z,
   08:37Z, 09:03Z … this session), which moves HEAD without touching a file. Freshness is the build fingerprint (size +
   mtime of every runtime, harness and carried-row file), checked at the run's start, its end and grading time.
8. **The roster waits for the deferred kinds** (`tools/gate-roster.mjs`). Instrument kinds register when their models load,
   after `__READY__`; every herd row read `role herd maps to tiller, which is not in ctx.machines.kinds` and SKIPped. `ROSTER`
   now waits (≤ 25 s) for `ctx.machines.expansionReady`. This is what makes the W0 fixture (R28) stage at all.
9. **A6-machine-foot-plant re-staged by role** (R28). Round 4 read whichever machine was first in the list; after the W0a
   merge that was a standing one (`SKIP: no planted samples`). It now stands the player 11.7 m from the nearest live herd
   machine (so its rig runs at full LOD; a far machine runs the cheap gait, which plants no feet) and samples until 12
   planted-foot samples. Bar unchanged (≤ 0.15 m). Targeted re-run: PASS, 0.000 m over 15 samples, Tiller.

## A.3 The open W0a judge findings

| finding | what is in the tree | measured this session |
|---|---|---|
| **V3-crouch-stalk staging never crouches** (judge control: `crouching false, 4.90 m/s, head 1.275 m`) | crouch is a toggle bound with `input.onDown('KeyC')`, which fires only from a real keydown; the row now dispatches a real `KeyC` keydown + keyup on `window` (fix round 3), W stays held | Numeric witness, the row's own setup + settle through `tools/screenshot.mjs --eval`: **`crouching: true`, 1.40 m/s (canon crouch 1.4), head 0.843 m above the feet**; control (KeyC again, 1.5 s): standing, head 1.422 m. The crouch is 59 % of standing height (criterion ~60 %). The sealed frame shows a low, forward-pitched crouch-walk. |
| **R29 verdicts accept a self-declared judge port** | a verdict counts only when signed by a judge key that an orchestrator key registered for that (judge, port), and only when the grader trusts that orchestrator key (`CAL_ORCHESTRATOR_PUBKEY`); key files inside any worktree are refused; R33 (c): carried visual rows are judged on 5271 only | On a scratch ledger (never the lane's): no key → refused; signed from 5255 (the run's port) → refused ("not a judge port; judged on the port that ran the suite; no registration"); signed, unregistered key → refused; registered by an orchestrator key, then signed → appended, and marked **unanchored** in a shell that trusts no orchestrator key (the gate counts it as `judgeUnanchored`, a FAIL); a key file inside the tree → refused; a 2-character rationale → refused. The lane's own ledger holds **no** verdict and no registration. |
| **A-port-guard's lsof half proves only a watch log** | every `gates.mjs` run of this tree on an allowed port samples `lsof` (connections to :5173 from its own process tree), main's dependency-cache metadata and the box, every 2 s, in a worker thread; A-port-guard grades its own invocation's monitor over the whole invocation (it runs last in the block) and the monitor of every sealed run it vouches for, gap ≤ 10 s, with a positive control on a scratch listener | Lane run 10:33–10:43Z: the invocation's own monitor covered it (292 samples, max gap 2.05 s, 0 connections to :5173 from its process tree, positive control saw its own scratch connection), and each of the 7 sealed runs it vouches for carried its own monitor over its own window (the full run: 1,924 samples, max gap 2.74 s). No external watch log was used. |
| **A65 staged on a quest W0a removed** | A65-save-restore-expansion picks its three side quests by objective SHAPE from `prog.QUESTS`, skipping any quest with an `override` objective (the W0a removal deleted `side-cauldron-override`), and its speakers by having a topic | A65-save-restore and A65-save-restore-expansion PASS in the full run and in the targeted run (quests `side-cave-datapoints` …, 4 quests restored, trial restored, topics not farmable). |

## A.4 The carried suite, graded (R33)

Ledger `scratchpad/r5/gates-perf/ledger/ledger.jsonl` (outside every tree). Observations of this build:

| run | kind | rows | box (its own monitor) |
|---|---|---|---|
| `p5255-87215-1792659828112` | **full** (`--lane carried`, 64 min, 10:07Z) | 236: 148 pass, 13 fail, 38 pending, 37 frames | quiet 1 %, load max 9.99, other gate Chromes ≤ 2 |
| `p5255-75895-1792659154487` | partial | A6 | quiet 54 % |
| `p5255-77079-1792659284078` | partial | 18 machine-iterating rows (preview) | quiet 0 % |
| `p5255-70551-1792663816632` | partial | A13, A100, A50b, A70b, A31b, A31e, A31f, A90b, A73, A9 | — |
| two more | partial | A13, A100 | — |
| `p5255-90136-…` | partial | V3 (the first judge-mechanics attempt sealed into the lane ledger by mistake: one extra filmed V3 observation; no verdict) | — |
| two more (10:44–10:46Z) | partial | A9 (PASS, load 2.87); A31b + A31f (both FAIL at load ≈ 2.8–3.1) | load < 3 at start |

Two full runs started earlier were aborted after 1 and 26 min (a slot race, then the A6 staging defect found mid-run);
their `run-start` entries stay in the ledger (both on earlier builds, so the gate does not list them against this one).

**Row classes** (final grading 10:47Z, in an invocation of its own: 125 pass, 35 listed, 30 newly staged, 29 skipReplaced, 2 skipR30, **7 regression, 8 awaitingJudge**):

| class | rows |
|---|---|
| **regression** (PASSED at baseline, not now) | **A31b-no-ghost-without-occluder** (fail ×3, the third at load ≈ 2.8), **A31e-hillside-pan-clamp** (fail, then pass), **A31f-hillside-yaw-sweep** (fail ×3) — hero-body + orchestrator (camera rows at the hillside place; A31b films the hero at 7 % on-screen against a 12 % floor, A31e's fast pan at pitch −1.15 dropped opacity to 0.33 with the lens 0.03 m from terrain; all three passed 3/3 at baseline; the runtime diff since the baseline is the W0a merge: `engine.js` +398 lines, the machines / legacy collapse, `props/{activities,places,tallneck}.js`, 7 lines of `playerAnimator.js`); **A90b-memory-attribution** (fail ×2) — instruments-core: after the A90 workload on the Tiller fixture, 49 objects created at `machine.js:162` and 24 bones at `autorig.js:75` are retained off-scene (the baseline's legacy respawn kind passed); **A73-sample-bank** (fail ×2) — instruments-core / audio: the Tiller declares voice sets `voice/tiller/windup` and `voice/tiller/strike` with no seeds; **A70b-fast-travel** (fail in the full run, PASS alone) — **my staging defect**: the map fog persists in localStorage (`cal.map.v5`) across the suite's pages, an earlier row revealed the "never visited" point, and the row trusted it; fix below (§3 gap 3) |
| **known-flaky, decided** (first 5 observations) | A13-no-skate **regression** (0 of 4: speed 5.66–5.96 m/s at the window's end vs the 6.12 floor, drift ≤ 0.0025 m in 3 runs, 0.0728 m once) — hero-body, R27; A100-spear-holster **pass** (4 of 4); A50b-aim-on-drawn-geometry **pass** (3 of 3) |
| attributed PENDING, then measured | A9-perf-budget: PENDING 40.3 / 40.0 fps at load 6.2 / 4.7 (not counted, rule 4), then **PASS 58.1 fps at load 2.87**; draws 309 |
| **awaitingJudge** | V1, V2, V3, V4, V12, V13, V14, V21 (R29: the orchestrator's judge) |
| newly staged (SKIP at baseline, on the Tiller fixture now; listed, owner named) | 30 rows: 24 PASS; FAIL A23-aim-cost (hull p95 26.1 ms, spatial), A23b-hull-fidelity, A71-compass-truth, A78b-cast-pose-set ("cast panel offers only 8 states"); unattributed PENDING A42-expansion ("no new kind with a tearable component"), A62-focus-components |
| skipR30 since baseline (R30 requires it) | A99-dialogue, V35-settlement (no NPC body, settlements W2) |
| listed (FAIL / PENDING / SKIP at baseline, not worse) | 35, incl. A19 (fail → fail, 5.87 m/s), A21 (fail → attributed PENDING), A31c (fail → fail), 26 SKIP-R30, 6 SKIP-R18 |
| skipReplaced | 29 visual rows |
| pass | 125 (incl. A9 after its quiet-box PASS, A100 4/4, A50b 3/3) |

---

# Part B — the W0b deliverables

## B.0 Summary

| deliverable (plan §2 / §9) | file(s) | status |
|---|---|---|
| licence-clean reference set via the Commons fetcher | `tools/r5-refs/{fetch,licence,manifest,slots}.mjs`, `reference/r5/gates-perf/**` (13 files + MANIFEST) | done; A-reference-set **PASS** |
| `reference/MANIFEST.md` + deletion of `reference/*.jpg` (HZD stills) | `reference/MANIFEST.md`; the 19 stills deleted | done; A-reference-clean **PASS** |
| `A-alloc-rate` | `tools/gates/gates-perf.w0b.mjs` | built; **FAIL, real** (B.2) |
| `A-vram-ledger` | same | built; **FAIL, real** on render targets (B.3) |
| `A90-abs` | same | built; **FAIL, real** on the GPU-process footprint (B.4) |
| the unattributed-draw cap | same + `MEMORY_BUDGETS.unattributed.w0Cap` | built; W0 cap **recorded: 5 draws**; PASS (B.5) |
| registration | `tools/gates.r5.gates-perf.mjs` spreads the W0b GATES before A-port-guard | `--lane gates-perf` runs all 12 rows |

## B.1 The licence-clean reference set (`A-reference-clean`, `A-reference-set`; plan §6 row `reference/*.jpg`)

- **Deleted:** the 19 Round-4 stills under `reference/` (Guerrilla / Sony marketing stills and trailer frames, 9.7 MB).
  `reference/MANIFEST.md` (top level, this lane's) keeps each one's name, sha256 and bytes so `A-reference-clean` refuses
  it under any name or path; it states plainly that they stay in git history (plan §11 decision 2 is Kevin's).
- **Fetched:** 13 references in `reference/r5/gates-perf/` by `tools/r5-refs/fetch.mjs` from the Wikimedia Commons API,
  each re-encoded (≤ 1280 px, metadata stripped), with a MANIFEST row (file, slot, gates, subject, author, licence,
  source, retrieved date, sha256, the exact attribution string for CC BY). Licences: 11 PD, 1 CC0, 1 CC BY 2.0. The
  classifier stores only PD / CC0 / CC BY; share-alike / GFDL / unclear are URL-only; NC / ND are refused (10 controls).
  `--verify` is offline and is what the gate runs.
- **Pointed:** every kept visual row now carries a `reference` field — V1 (`run-rear`, `run-side`), V2 (`idle-stand`),
  V3 (`crouch-stalk`), V4 (`draw-side`, `draw-front`), V12 (`run-side`), V13 (`draw-front`), V14 (`slope-stand`), V21
  (`chase-camera`); V24 (`draw-side`), V46 (`lance-ready-side`), V47 (`lance-windup/-strike/-follow`), V48 + V49
  (`lance-back-carry`). V22-chase-framing (an action row the plan names) pointed at a slot that did not exist
  (`chase-back`); it now names `run-rear` (a rear view at head height; its 55 % frame-height bar is its own number).
  V46's criteria quoted the Round-4 wording "as in reference/spear-*"; it now says "the Round-4 spear stills (deleted at W0b)".
- **I looked at all 13.** They show what their rows say, with three weak ones the owning lanes should replace:
  `lance-back-carry` is a rifle slung nearly vertical (R10 wants 32–40° from vertical) — melee, W1; `lance-follow` is a
  small archival print of a bayonet drill (small figures on a catalogue card) — melee, W1; `chase-camera` is a hiker under
  a tenth of the frame height among trunks (fine for V21's "nothing covers her", useless for framing) — hero-body.

## B.2 `A-alloc-rate` (plan §0 rule 5, §9)

CDP `HeapProfiler.startSampling` (2 KB interval, objects collected by minor and major GC included, so everything
allocated counts, not only survivors) over 10 s of the A21 staged fight (8 × the herd role's Tiller fixture, R18
fallbacks named) and 10 s of sprint-and-draw, each after 3 s of warm-up. Graded = bytes whose allocating frame is a
`src/**` function, at max(measured KB/s, KB per frame × 60) so a starved box cannot pass by drawing fewer frames.
**The drive is witnessed now** (it was not): in the lane run she was sprinting in 60 % of 100 ms samples and aiming in 40 %,
max speed 6.87 m/s, 3 arrows loosed at full draw. Cross-check independent of the profiler: the used heap read every 100 ms for 2 s with no forced GC
(the sum of its rises is a lower bound on all allocation).

## B.3 `A-vram-ledger` (plan §4.4)

A census of the GL allocation calls installed before the game makes its context: every `texImage*`, `texStorage*`,
`compressedTexImage*`, `copyTexImage2D`, `generateMipmap`, `renderbufferStorage(Multisample)` and `bufferData`, minus
deletes; a texture ever attached to a framebuffer (and every renderbuffer) is a render target; bytes per texel from
engine-gpu's sized-format table. Measured at the staged fight at the shipped tier. **The census's render-target total equals
`engine.renderTargetLedger()`'s to the byte (437,751,372 B)**, an independent cross-check of both.

## B.4 `A90-abs` (global list)

A90-memory-stability's kill → respawn workload (gate-roster `memWorkload`, same loop and lifecycle times: 30 kills, 30
respawned, all Tiller fixture), two forced GCs, then the staged fight for 60 s. JS heap = `Runtime.getHeapUsage().usedSize`
after two `HeapProfiler.collectGarbage`; GPU process = `SystemInfo.getProcessInfo` type `GPU`, macOS
`footprint -p <pid>` (phys_footprint, includes IOSurface / Metal), sampled every 15 s, max graded; both written to the
report. New, reported only: the same fight re-sampled at pixel ratio 1.25 (engine-gpu's ledger DPR).

## B.5 `A-unattributed-cap` (plan §4.2 last row)

At the staged fight, every registered owner's scene roots hidden in turn; unattributed = total − post chain − Σ owners.
Two cross-checks: the unregistered roots hidden together, and a per-draw count (every `renderBufferDirect` call bucketed
by its scene root). Lights and light targets are never hidden (hiding the sun removes every other owner's shadow draws —
the first probe's 223 "unattributed" were exactly that). Draw counts come from the engine's own per-frame ring
(`perfReset` / `perfSnapshot().medianDrawCalls`): the engine resets `renderer.info` at the top of every `render()`, so the
first probe's "41.9 draws/frame" was one frame's calls divided by 8.

## B.6 Measured numbers (W0b rows)

**A-alloc-rate** (lane run; staged fight = 8 × Tiller fixture, the other roles' fallbacks named; tier high, pixel ratio 1.5)

| phase | fps | src/** (self) measured | KB / frame | graded (max of measured, per-frame × 60) | all allocation | used-heap rises (lower bound) | post-GC slope |
|---|---|---|---|---|---|---|---|
| staged fight, 10 s | 27.0 | 37,460 KB/s | 1,389 | 83,346 KB/s | 55,455 KB/s | 3,374 KB/s | +118.7 KB/s |
| sprint and draw, 10 s (sprinting 60 %, aiming 40 %, 6.87 m/s max, 3 arrows at full draw) | 27.6 | 37,043 KB/s | 1,342 | 80,545 KB/s | 49,518 KB/s | 4,730 KB/s | +75.5 KB/s |

Functions over 4 KB/s, by owner (graded KB/s, worst phase): world-ground — `noise2D` terrain.js:78 18,725, `getHeight`
terrain.js:1860 16,318, `_ridged` terrain.js:1847 816, vegetation.js:117 1,971, `_fillChunk` vegetation.js:889 1,713;
frozen spatial — `raycast` collision.js:888 7,842, `_meshPush` collision.js:835 6,104, `occluded` collision.js:1099
2,957, `sphereQuery` collision.js:679 2,593, `steer` nav.js:579 1,933; engine-gpu — engine.js:1352 (the cull pass's
traverse callback) 6,782; hero-body — `_springs` playerAnimator.js:3708 6,673; instruments-core — `update`
machines/index.js:533 2,181; world-props — `update` fauna.js:833 1,560. Three earlier runs this session read 35.6–42.1 MB/s
src at 25–43 fps: the magnitude does not depend on the box.

**A-vram-ledger** — largest render targets: the MSAA scene renderbuffer 2400 × 1350 × 4 samples 103.68 MB and its depth
51.84 MB; five 2400 × 1350 HalfFloat targets 25.92 MB each; the three CSM cascades 2048² colour + depth 16.78 MB each (×6);
one 2400 × 1350 at 12.96 MB. `renderer.info.memory.textures` 125 vs 129 texture objects in the census (the census also
counts render-target textures). engine-gpu's recorded ledger (DPR 1.25, Oct 16) totals 340.74 MB; this tree still ships
pixel ratio 1.5.

**A90-abs** — JS heap after two forced GCs: 65.68 MB at boot, 80.54 MB after the A90 workload, **83.15 MB** after the
60 s fight. GPU process (macOS phys_footprint): 1,543.9 / 1,557.7 / 1,557.7 / 1,562.3 / 1,557.6 MB at 15 s intervals.
What-if (reported only): pixel ratio 1.25 → 1,427.4 MB.

**A-unattributed-cap** — 335 draws / frame at the staged fight: post chain 22; vegetation 76, landmarks + places 75,
Brea + gear 37, Instruments 32, settlement kit 29, terrain / sky / sea 24, VFX / UI / pooled 19, NPCs 16, ground scatter 0,
lamp beams 0; **unattributed 5**: the five unnamed instanced quads of `src/combat/particles.js`. The W0 cap is recorded in
`tools/budgets.mjs` (`MEMORY_BUDGETS.unattributed.w0Cap`, 5 draws, with the run's tier, pixel ratio and cast).

---

## 1. Gate table — the global green list (the items that exist in this tree)

| gate (owner) | result | measured (full carried run `p5255-87215-…` unless noted) |
|---|---|---|
| `A1-boot-clean` | **PASS** | state=playing |
| `A9-perf-budget` (R26) | PENDING ×2, **PASS** ×1 | draws 309 (< 350) every time; median 40.3 / 40.0 fps at load 6.18 / 4.66 (PENDING, R26), **58.1 fps at load 2.87** (PASS, 10:44Z) |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 248 frames |
| `A21-real-draw-calls` | **PENDING** | tier high, pixel ratio 1.5: draws 309 / 232 / 337 (vista / herd / staged fight, ≤ 350 PASS), triangles 4.12 / 4.40 / 4.40 M (≤ 6.5 M PASS); GPU median 75.8 / 97.8 / 82.3 ms, frame p95 and JS p95 PENDING (load 5.65, 1 other gate Chrome) |
| `A90-memory-stability` | **PASS** | 30 kills → 30 respawns (Tiller, role herd): geometries +12 (≤ 40), textures −2 (≤ 8), objects −134 (≤ 60), heap −2.9 % |
| `A90-memory-stability-expansion` | **PASS** | non-machine growth 0, orphan roots 0, heap +1.7 % |
| `A90b-memory-attribution` | **FAIL** (instruments-core) | 49 objects (`machine.js:162`) and 24 bones (`autorig.js:75`) retained off-scene after the Tiller workload; FAIL in both observations |
| `A90-rig-reclaim` | **PASS** (newly staged) | 30 cycles on the Tiller: geometries 0, textures 0; per live machine 0 / 0.38 |
| `A90-abs` | **FAIL** | heap 83.15 MB PASS; GPU process 1,562.3 MB > 1,500 |
| `A-alloc-rate` | **FAIL** | 37,460 / 37,043 KB/s src vs 64 |
| `A-vram-ledger` | **FAIL** | render targets 437.75 MB > 170 |
| `A-ID-ip-assets-gone` (pipeline) | **PASS** | 16 GLBs, 0 IP hits; `aloy.glb` a scheduled exception (hero-body, W0 exit) |
| `A-licence-manifest` (pipeline) | **PENDING** | archive SHA-256s from pipeline's W0b re-fetch and the credits clause outstanding; rows `legacy-anims-duplicates` / `legacy-anims-lab-bake` match no file (the W0a deletions) |
| `A-assets-tracked` (pipeline) | **PASS** | 212 referenced paths, 0 ignored |
| `A-no-horizon-terms-player` / `-code` (brand) | not in this tree | brand's W0b |
| `A-reach-all-sites` | not in this tree | no lane file defines it yet |
| `A-port-guard` | **PASS** | lane block |
| `A-carried-suite` | **FAIL** | A.4 |
| `A79-runner-verdict-line`, `A80-chrome-profile-hygiene` (carried) | **PASS** | full run |

## 2. Contracts and APIs published (exact signatures)

### 2.1 `tools/budgets.mjs` (the one budget file)

```js
export const BUDGETS            // unchanged: drawCalls 350, triangles 6.5e6, frameP95Ms 20, gpuMedianMs 14, jsP95Ms 9, deviceDpr 2, …
export const STAGE_PRELUDE      // unchanged page prelude (__stage: resetAll, pick, place, lookAt, pinAll, castPlan, fill)
export const PERF_SCENARIOS     // unchanged: vista / herd / staged-fight, cast by role, placed by gatePlaces
export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';
                                // engine-gpu's measured render-target ledger, re-exported (A-rt-ledger:
                                // "recorded in tools/budgets.mjs"); { measured, unit, rows: { '<owner>': bytes } }
export const MEMORY_BUDGETS = Object.freeze({
  alloc: { srcKBps: 64, fnKBps: 4, heapSlopeBps: 0, windowS: 10, warmupS: 3, samplingIntervalB: 2048, refFps: 60 },
  vram:  { texturesB: 160e6, renderTargetsB: 170e6, geometryB: 120e6, totalB: 450e6 },
  abs:   { heapB: 450e6, gpuProcessB: 1.5e9, fightS: 60, a90LoopS: 150, a90LifecycleS: 150, minKills: 25 },
  unattributed: { w2Bar: 30, w0Cap: { draws: 5, measured: '<run, cast, tier, pixel ratio>' } },
});
```

### 2.2 `tools/gates/gates-perf.w0b.mjs` (the W0b rows; spread into `tools/gates.r5.gates-perf.mjs` GATES)

```js
export const W0B_BUDGETS = MEMORY_BUDGETS
export const UNATTRIBUTED_CAP_W0      // = MEMORY_BUDGETS.unattributed.w0Cap.draws (5)
export const DRAW_OWNERS              // [{ id, row, lanes, re }] — the §4.2 draw-owner REGISTRATION table (names)
export const ownerOfName(name) -> { id, row, lanes, re } | null
export const GATES                    // A-reference-clean, A-reference-set, A-alloc-rate, A-vram-ledger, A90-abs, A-unattributed-cap
```

How a lane REGISTERS its draws (A-unattributed-cap): give every top-level scene child it adds a name that matches its
§4.2 row in `DRAW_OWNERS` (e.g. `'<kind>-machine'` / `'<kind>-instrument'` for Instruments, `'npc-crowd'`, `'terrain'`,
`'*-fx'`, `'*-particles'`). An unnamed root can never be registered. Lights and light targets are never hidden.

### 2.3 `tools/gate-roster.mjs` (contract change, W0b)

`ROSTER` now begins with a bounded wait (≤ 25 s) for `ctx.machines.expansionReady`: Instrument kinds register when their
models load, AFTER `__READY__`. It must be spliced into an `async` body (every splice in this repo is, and `staged()` /
`stagedSetup()` are). Nothing else changed.

### 2.4 `tools/r5-refs/**` (the Commons fetcher)

```
node tools/r5-refs/fetch.mjs --search <slot | "text"> [--limit 25]      Commons search, licence class per hit
node tools/r5-refs/fetch.mjs --preview <slot | "text"> --out <dir outside every tree>
node tools/r5-refs/fetch.mjs --fetch [--lane <lane>] [--slot <slot>]   pinned slots -> reference/r5/<lane>/<slot>.jpg + MANIFEST.md
node tools/r5-refs/fetch.mjs --verify                                  offline; exit 1 on any problem
node tools/r5-refs/fetch.mjs --selftest                                the classifier's 10 controls
export async function search(query, limit = 25) -> [{ title, cls, licence, why, w, h, mime, page, thumb, author }]
export async function fileInfo(title) -> { title, ii, meta, c }
export function verify(root) -> { ok, problems[], stored, urlOnly, files }
licence.mjs:  classifyCommons(extmetadata) -> { cls: 'stored' | 'url-only' | 'refused', licence, why }, authorOf(meta),
              classifierSelfTest() -> { ok, cases[] }, FORBIDDEN_SOURCE_RE, STORED_LICENCES, CLASSIFIER_CONTROLS
manifest.mjs: readManifest(dir) -> { exists, stored[], urlOnly[] }, renderManifest({ lane, intro, stored, urlOnly }),
              laneFolders(root) -> [{ lane, dir }], STORED_HEADER, URL_HEADER
slots.mjs:    SLOTS = [{ lane, slot, gates[], subject, query, file }]
```

A lane adds its references by adding SLOTS rows (its own `reference/r5/<lane>/`) and running `--fetch --lane <lane>`;
its visual rows name `reference/r5/<lane>/<slot>` in a `reference` field.

## 3. Honest gaps

1. **A-carried-suite cannot PASS in a lane run.** The 8 kept visual rows need an R29 judge (R29: the lane's reading is
   advisory), and seven action rows regressed against the baseline on this build. Those are not mine to fix (§4), except
   A70b (gap 3).
2. **One full run per round is a weaker floor than W0a's three.** It follows the orchestrator's W0b rule and R33 (3 of 5
   applies to flaky rows only); every observation still counts, the first 5 decide a flaky row, and `CAL_CARRIED_RUNS`
   raises the floor. A row that regresses only sometimes can slip through one run.
3. **A70b-fast-travel is my staging defect, found after the full run.** The map fog (`cal.map.v5`) persists across the
   suite's pages; an earlier row revealed the point A70b uses as "never visited". Alone it PASSES. The fix is two lines
   in the row (clear the fog cells first; its storage guard already restores the key). I did not apply it: any edit to
   `carried.mjs` makes the only full run stale, and the orchestrator allows one full run per round. It is the first
   change of the next round (or the orchestrator's fold-back).
4. **The box.** Quiet fraction 1 % in the full run. A9 got one quiet moment (load 2.87: 58.1 fps, PASS); A21's GPU, frame
   and JS terms stay PENDING (draws 309 / 232 / 337, triangles ≤ 4.40 M PASS). Of the camera regressions, A31e passed once
   alone, but A31b and A31f failed all three times, the last at load ≈ 2.8–3.1, so the box does not explain them. The 5270
   quiet-box run decides.
5. **The baseline's own evidence is gone.** Its three sealed runs (report copies and frames) were in `$TMPDIR`, which did
   not survive the reboot. The file is anchored by git: byte-identical to the version first committed (`766e49b`) and
   internally consistent. Nothing proves its verdicts any more except that commit.
6. **"Newly staged" rows are not graded here.** 30 rows that were SKIPs at baseline now stage on the Tiller fixture; 4
   fail and 2 are unattributed PENDINGs. The plan's original bar would fail them; R33 grades against a baseline that has
   no verdict for them. I list them with owners; the orchestrator should rule.
7. **A-alloc-rate is ~600× over** (src 37–42 MB/s against 64 KB/s). The allocations are real (an array per `noise2D`
   call, closures per collision query), and most sit in files this lane may not touch, several of them frozen (§4).
8. **A-vram-ledger and A90-abs** measure the shipped tier of this tree (`high`, pixel ratio 1.5). engine-gpu's W0b levers
   are not merged here; both gates re-measure whatever ships.
9. **Reference set weaknesses** (B.1): `lance-back-carry`, `lance-follow`, `chase-camera` are weak references for the
   rows that will use them; V2 and V4 are filmed from behind (the hands and the anchor are hard to see) — hero-body
   re-stages them on Brea.
10. **Forgery is still possible by someone who sets out to forge** (fix-round-2 gap 3): the ledger is a file on a
    one-user machine. The orchestrator holds the ledger it grades and the private key it trusts.
11. **Slot race.** At 08:17Z my wrapper recorded a short-lived pid in the orchestrator's slot owner file; hero-body
    reclaimed the slot as stale while my Chrome ran (3 gate Chromes for about a minute). Fixed at 08:25Z (the wrapper
    records its own pid).

## 4. What other lanes and the orchestrator must do

| who | what |
|---|---|
| **orchestrator** | **Merge order.** The W0a-exit part (Part A, files in §5.1) can merge first; the W0b part (§5.2) is additive. After the merge every lane's harness takes my semaphore tickets, seals its carried runs and needs no `--extra`. |
| **orchestrator** | **Grade A-carried-suite on 5270** (quiet box, 1 Chrome): `CAL_GATE_LEDGER=<a dir you hold> node tools/gates.mjs --port 5270 --lane carried` **once**; then re-run the known-flaky rows until their first 5 observations decide: `node tools/gates.mjs --port 5270 --only A13-no-skate,A100-spear-holster,A50b-aim-on-drawn-geometry` (each run is sealed as a partial observation); then the judges (next row); then `CAL_ORCHESTRATOR_PUBKEY=<your public key> node tools/gates.mjs --port 5270 --only A-carried-suite` in an invocation of its own. The baseline anchors by git in a fresh ledger. |
| **orchestrator** | **R29 judges for the 8 kept visual rows.** Once: `node tools/gates.r5.gates-perf.mjs --judge-keygen --out <outside every tree>/orchestrator.pem`. Per judge: the judge runs `--judge-keygen --out <its scratch>/judge.pem`, you run `--judge-register --judge-name <who> --port 5271 --judge-pub <its public key> --orchestrator-key orchestrator.pem`. The judge lists frames with `--judge --list --port 5270` and writes each verdict with `--judge --seal <id> --id <V id> --pass true|false --rationale "…" --judge-name <who> --port 5271 --judge-key judge.pem --reference reference/r5/gates-perf/<slot>.jpg`. The lane cannot do this (R29), and its own ledger holds no verdict. |
| **orchestrator** | **Rule or route** the regressions of A.4 — A31b, A31e, A31f, A13 (hero-body), A90b, A73 (instruments-core), A70b (mine, §3 gap 3) — and decide whether `newlyStaged` rows (SKIP at baseline, staged on the Tiller fixture now) should be graded by A-carried-suite or, as implemented, by their owners' must-stay-green lists. |
| **orchestrator** | **Chrome slots.** Your `~/.calima-r5/chrome-slots` treats a slot whose owner pid is dead as stale. A lane that records a short-lived pid (my wrapper did, until 08:25Z: the `$(slot.sh acquire)` subshell) loses its slot to the next lane while its Chrome runs — 3 gate Chromes for ~1 min at 08:17Z. My wrapper now records its own long-lived pid; check the other lanes' wrappers. |
| **engine-gpu** | A-vram-ledger and A90-abs FAIL on render targets: 437.75 MB at the shipped `high` tier (pixel ratio 1.5), equal to the byte to `engine.renderTargetLedger()`. The plan's bar is ≤ 170 MB (A-rt-ledger) and ≤ 450 MB total; A90-abs's GPU-process footprint is 1,562 MB against 1,500 (1,584 MB in an earlier run; 1,427 MB when the same fight was re-sampled at pixel ratio 1.25, reported only). Your W0b tier levers decide both; my gates re-measure whatever ships. |
| **world-ground (W1)** | A-alloc-rate's largest allocator: `terrain.js` `noise2D` (`const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1]` allocates an array per call) and `getHeight` / `_ridged` (≈ 36 MB/s graded together at the staged fight), and `vegetation.js:117` / `_fillChunk` (≈ 3.7 MB/s). Scalar locals instead of the destructured array remove most of it. |
| **orchestrator (grant) — frozen spatial** | `collision.js` `raycast` / `_meshPush` (`bvh.shapecast({ intersectsBounds: (box) => … })`: an object + closures per query) / `occluded` / `sphereQuery`, and `nav.js` `steer`: ≈ 21 MB/s graded. These files are frozen (§1.1); a grant is needed to hoist the callbacks. |
| **engine-gpu** | `engine.js:1352`, the cull pass's `scene.traverse((o) => …)` callback: ≈ 6.8 MB/s graded. |
| **hero-body** | `playerAnimator.js` `_springs`: ≈ 6.7 MB/s graded. The carried rows absorbed by hero-body that regressed or fail here: A13 (0 of 4; `moveSpeed` 5.66–5.96 m/s at the window's end vs 6.12, while A3 reads 6.75 m/s), A31b / A31e / A31f (camera at the hillside), A19 and A31c (failed at baseline too); and the 8 kept visual rows' subject. V2 and V4 are filmed from behind: the idle hands and the cheek anchor cannot be seen — re-stage them when you shadow them on Brea. |
| **instruments-core** | A90b-memory-attribution regressed (global list): 49 objects (`machine.js:162`) and 24 bones (`autorig.js:75`) stay retained off-scene after the Tiller fixture's kill → respawn workload. A73-sample-bank regressed: the Tiller declares `voice/tiller/windup` and `voice/tiller/strike` with no seeds (with audio). `machines/index.js:533` `update`: ≈ 2.2 MB/s graded. Name the five particle meshes of `src/combat/particles.js` (frozen; whoever holds its grant) so A-unattributed-cap can register them (they are the whole W0 cap of 5 draws). |
| **world-props** | `fauna.js:833` `update`: ≈ 1.6 MB/s graded. |
| **brand, instruments-core** | `tools/gates.r5.brand.mjs` (`'strider'`, `{ x: 18, z: 26 }`) and `tools/gates.r5.instruments-core.mjs` (16 kind literals, `x: 120, z: 40`) are reported by A-gate-preludes; graded at your exits (R33 e). |
| **melee (W1), hero-body** | Replace the weak references (B.1): `lance-back-carry` (rifle near vertical, R10 wants 32–40°), `lance-follow` (small figure), `chase-camera` (tiny figure; V22 needs a ≥ 55 % framing reference). Add SLOTS rows for your folder and run `tools/r5-refs/fetch.mjs --fetch --lane <lane>`. |
| **every lane** | Name every top-level scene child you add for its §4.2 row (`DRAW_OWNERS`); unnamed roots count against the unattributed cap (W0: 5; ≤ 30 by W2, non-increasing). Visual rows name `reference/r5/<lane>/<slot>` in a `reference` field. |

## 5. Files changed this session (vs `766e49b`)

### 5.1 The W0a-exit part (merge first)

| file | change |
|---|---|
| `tools/gates.r5.gates-perf.mjs` | R33 grading rewritten (git-anchored baseline, one full run + partial re-runs, R30 / attributed-PENDING / newly-staged classes, box reported, HEAD not compared, SKIP label read from the verdict head); partial seals for targeted re-runs; children of a monitored run never sealed; judge `--list` picks the newest complete full run |
| `tools/gates.r5.carried.mjs` | A21's verdict names tier / pixel ratio / device DPR / box (R33 f); A6 re-staged by the herd role (R28) |
| `tools/gate-roster.mjs` | `ROSTER` waits (≤ 25 s) for `ctx.machines.expansionReady` (the Tiller fixture registers after `__READY__`) |
| `tools/budgets.mjs` | `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` |
| `tools/gates/carried-baseline.json` | unchanged (recorded once, Oct 19) |

### 5.2 The W0b part

| file | change |
|---|---|
| `tools/gates/gates-perf.w0b.mjs` | the six W0b rows (A-reference-clean, A-reference-set, A-alloc-rate, A-vram-ledger, A90-abs, A-unattributed-cap), `DRAW_OWNERS` |
| `tools/gates.r5.gates-perf.mjs` | spreads the W0b rows before A-port-guard; A-gate-preludes scans the W0b module |
| `tools/budgets.mjs` | `MEMORY_BUDGETS` (alloc / vram / abs / unattributed incl. the W0 cap) |
| `tools/gates.r5.carried.mjs` | `reference` fields on V1–V4, V13, V14, V21; V22 → `run-rear`; V46's wording |
| `tools/r5-refs/**`, `reference/MANIFEST.md`, `reference/r5/gates-perf/**` | fetcher, manifests, 13 references (V22 added to `run-rear`'s gates) |
| `docs/ROUND5-GATES-PERF.md` | this report |

No asset was added under `public/`, so no `LICENSES.json` row; the references are not shipped and carry their own
MANIFEST rows. No file outside the §2 row and the §1.2 grant was edited; the 40-line harness grant is untouched this
session.

## 6. Processes

At the end of the turn (10:5xZ): this lane's Vite on 5255 stopped (no listener on 5255); no `gates.mjs` /
`screenshot.mjs` / Chrome of this lane alive; 0 Chrome profiles of this lane under `$TMPDIR/cal-chrome-profiles` (the one
left, `cal-27935-5252-0`, is hero-body's); no ticket in the semaphore; no orchestrator slot held (both held by other lanes).
The tree's `shots/` holds 4 report files (136 KB); every PNG was deleted after reading (frames live in the ledger). Disk
50 GB free.

Kept for the orchestrator and the judges, outside the tree: the run ledger
`scratchpad/r5/gates-perf/ledger/` (54 MB: `ledger.jsonl`, the sealed runs' report copies and monitors, the full run's 37
frames), the run reports `scratchpad/r5/gates-perf/work/{carried-full-3.report,lane-1,acs-final}.json`, and the logs.
Deleted: the judge scratch (`judge-w0b/`, `judge-mech/`, keys included).
