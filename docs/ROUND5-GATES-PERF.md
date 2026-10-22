# ROUND 5 — lane `gates-perf`: W0a exit (R33) and W0b

Port 5255. Tree `scratchpad/r5/gates-perf/tree` → `~/.calima-r5/trees/gates-perf`, branch `r5/w0a-gates-perf`
(this session started at `766e49b`; the orchestrator's WIP checkpoints committed the work as it went). Oct 22 2026.
Plan rows: §2 gates-perf, §1.2 harness grant, §3.1 W0a + W0b exits, §3.2 `gates.r5.carried.mjs`, §4.2 / §4.4, §6
(`reference/*.jpg`), §8.3 R33, §9 gates-perf. The fix-round-2 report this file replaces is in git history.

**Part A (the W0a exit under R33) is reported first and can merge first; Part B is the W0b work.** §8 lists the files of
each part.

## 0. Result

Lane block, `node tools/gates.mjs --port 5255 --lane gates-perf` (13 rows), ⟨LANE_TIME⟩, report copied to
`scratchpad/r5/gates-perf/work/lane-1.json`:

⟨LANE_TABLE⟩

The box was never quiet this session: five other W0b lanes ran gate Chromes throughout. The sealed full carried run's
own monitor saw a quiet fraction of **1 %** (load max 9.99, up to 2 other gate Chromes) against the baseline runs' 39–66 %.
Every number below that depends on the clock is reported with its box; the orchestrator's 5270 run is authoritative.

---

# Part A — the W0a exit under R33

## A.0 Summary

| item (orchestrator's list) | status |
|---|---|
| A-carried-suite as a regression guard vs the recorded W0-day1 baseline | **built and graded**: 1 sealed full run + 6 sealed partial re-runs of this build. FAIL, truthfully: 8 kept visual rows await an R29 judge (the lane may not judge), 6 action rows regressed against the baseline (owners named, A.4), A9 needs a quiet box |
| `tools/gates/carried-baseline.json` written once, with the box sample | already written Oct 19 (3 sealed runs, box sample per run) and committed in `766e49b`; **not rewritten**. Its ledger was lost in the Oct 22 reboot, so it is now anchored by git (A.1) |
| visual rows graded only for kept systems (V1–V4, V12–V14, V21) by an R29 judge | yes; 29 other visual rows `skipReplaced`, each naming its absorbing lane |
| SKIP-replaced rows name their absorbing lane | yes (`detail.skipReplaced`, e.g. `V38-title -> shell-ui`) |
| sealed runs bound to their frames | seal v3: frames hashed and copied at capture, run id in the report and every frame path |
| no report overwritten by a semaphore child | children run in a sandbox cwd; the tree's 5 report files are fingerprinted and restored; **new: children of a monitored run are never sealed** |
| A-gate-preludes on own files + carried.mjs | **PASS** (R33 e); brand's and instruments-core's files reported, graded at their exits |
| A9 on R26 | carried row: draws < 350 always; median fps ≥ 58 graded on a quiet box only. This session: draws 309 PASS, fps PENDING on every run (load 4.7–6.2) |
| A21 names its DPR | the verdict line now names tier, pixel ratio, device DPR and the box (A.2) |
| `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` in `tools/budgets.mjs` | done; engine-gpu's file loads it |
| the open W0a judge findings, documented | A.3: all four closed, each with a measurement |

## A.1 What R33 asked, and what the gate does now

⟨R33_TABLE⟩

## A.2 Grading rules added or changed this session (none moves a bar)

⟨R33_RULES⟩

## A.3 The open W0a judge findings

| finding | what is in the tree | measured this session |
|---|---|---|
| **V3-crouch-stalk staging never crouches** (judge control: `crouching false, 4.90 m/s, head 1.275 m`) | crouch is a toggle bound with `input.onDown('KeyC')`, which fires only from a real keydown; the row now dispatches a real `KeyC` keydown + keyup on `window` (fix round 3), W stays held | Numeric witness, the row's own setup + settle through `tools/screenshot.mjs --eval`: **`crouching: true`, 1.40 m/s (canon crouch 1.4), head 0.843 m above the feet**; control (KeyC again, 1.5 s): standing, head 1.422 m. The crouch is 59 % of standing height (criterion ~60 %). The sealed frame shows a low, forward-pitched crouch-walk. |
| **R29 verdicts accept a self-declared judge port** | a verdict counts only when signed by a judge key that an orchestrator key registered for that (judge, port), and only when the grader trusts that orchestrator key (`CAL_ORCHESTRATOR_PUBKEY`); key files inside any worktree are refused; R33 (c): carried visual rows are judged on 5271 only | On a scratch ledger (never the lane's): no key → refused; signed from 5255 (the run's port) → refused ("not a judge port; judged on the port that ran the suite; no registration"); signed, unregistered key → refused; registered by an orchestrator key, then signed → appended, and marked **unanchored** in a shell that trusts no orchestrator key (the gate counts it as `judgeUnanchored`, a FAIL); a key file inside the tree → refused; a 2-character rationale → refused. The lane's own ledger holds **no** verdict and no registration. |
| **A-port-guard's lsof half proves only a watch log** | every `gates.mjs` run of this tree on an allowed port samples `lsof` (connections to :5173 from its own process tree), main's dependency-cache metadata and the box, every 2 s, in a worker thread; A-port-guard grades its own invocation's monitor over the whole invocation (it runs last in the block) and the monitor of every sealed run it vouches for, gap ≤ 10 s, with a positive control on a scratch listener | ⟨PORTGUARD⟩ |
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

Two full runs started earlier were aborted after 1 and 26 min (a slot race, then the A6 staging defect found mid-run);
their `run-start` entries stay in the ledger and the gate lists them as never sealed.

**Row classes** (⟨ACS_TALLY⟩):

| class | rows |
|---|---|
| **regression** (PASSED at baseline, not now) | **A31b-no-ghost-without-occluder** (fail ×2), **A31e-hillside-pan-clamp** (fail, then pass), **A31f-hillside-yaw-sweep** (fail ×2) — hero-body (camera rows; hillside place, pans at pitch −1.15: min opacity 0.33, on-screen fraction 0.018, nearest vertex 0.03 m); **A90b-memory-attribution** (fail ×2) — instruments-core: after the A90 workload on the Tiller fixture, 49 objects created at `machine.js:162` and 24 bones at `autorig.js:75` are retained off-scene (the baseline's legacy respawn kind passed); **A73-sample-bank** (fail ×2) — instruments-core / audio: the Tiller declares voice sets `voice/tiller/windup` and `voice/tiller/strike` with no seeds; **A70b-fast-travel** (fail in the full run, PASS alone) — **my staging defect**: the map fog persists in localStorage (`cal.map.v5`) across the suite's pages, an earlier row revealed the "never visited" point, and the row trusted it; fix below (§3 gap 3) |
| **known-flaky, decided** (first 5 observations) | A13-no-skate **regression** (0 of 4: speed 5.66–5.96 m/s at the window's end vs the 6.12 floor, drift ≤ 0.0025 m in 3 runs, 0.0728 m once) — hero-body, R27; A100-spear-holster **pass** (4 of 4); A50b-aim-on-drawn-geometry **pass** (3 of 3) |
| **needsQuietBox** | A9-perf-budget: every observation an attributed PENDING (40.0–40.3 fps at load 4.7–6.2); draws 309 |
| **awaitingJudge** | V1, V2, V3, V4, V12, V13, V14, V21 (R29: the orchestrator's judge) |
| newly staged (SKIP at baseline, on the Tiller fixture now; listed, owner named) | 30 rows: 24 PASS; FAIL A23-aim-cost (hull p95 26.1 ms, spatial), A23b-hull-fidelity, A71-compass-truth, A78b-cast-pose-set ("cast panel offers only 8 states"); unattributed PENDING A42-expansion ("no new kind with a tearable component"), A62-focus-components |
| skipR30 since baseline (R30 requires it) | A99-dialogue, V35-settlement (no NPC body, settlements W2) |
| listed (FAIL / PENDING / SKIP at baseline, not worse) | 35, incl. A19 (fail → fail, 5.87 m/s), A21 (fail → attributed PENDING), A31c (fail → fail), 26 SKIP-R30, 6 SKIP-R18 |
| skipReplaced | 29 visual rows |
| pass | ⟨PASS_N⟩ |

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
| registration | `tools/gates.r5.gates-perf.mjs` spreads the W0b GATES before A-port-guard | `--lane gates-perf` runs all 13 rows |

⟨W0B_DETAIL⟩

## B.6 Measured numbers (W0b rows)

⟨W0B_NUMBERS⟩

---

## 2. Gate table — lane block and the global green list (port 5255, this tree)

⟨GATE_TABLE⟩

⟨APIS⟩

## 3. Honest gaps

1. **A-carried-suite cannot PASS in a lane run.** The 8 kept visual rows need an R29 judge (R29: the lane's reading is
   advisory), and six action rows regressed against the baseline on this build. Those are not mine to fix (§7), except
   A70b (gap 3).
2. **One full run per round is a weaker floor than W0a's three.** It follows the orchestrator's W0b rule and R33 (3 of 5
   applies to flaky rows only); every observation still counts, the first 5 decide a flaky row, and `CAL_CARRIED_RUNS`
   raises the floor. A row that regresses only sometimes can slip through one run.
3. **A70b-fast-travel is my staging defect, found after the full run.** The map fog (`cal.map.v5`) persists across the
   suite's pages; an earlier row revealed the point A70b uses as "never visited". Alone it PASSES. The fix is two lines
   in the row (clear the fog cells first; its storage guard already restores the key). I did not apply it: any edit to
   `carried.mjs` makes the only full run stale, and the orchestrator allows one full run per round. It is the first
   change of the next round (or the orchestrator's fold-back).
4. **The box.** Quiet fraction 1 % in the full run. A9 has no quiet-box grade; A21's GPU, frame and JS terms are PENDING
   (draws 309 / 232 / 337, triangles ≤ 4.40 M PASS). The camera regressions (A31b / A31e / A31f) may be load-sensitive:
   A31e passed alone, A31b and A31f failed twice. The 5270 quiet-box run decides.
5. **The baseline's own evidence is gone.** Its three sealed runs (report copies and frames) were in `$TMPDIR`, which did
   not survive the reboot. The file is anchored by git: byte-identical to the version first committed (`766e49b`) and
   internally consistent. Nothing proves its verdicts any more except that commit.
6. **"Newly staged" rows are not graded here.** 30 rows that were SKIPs at baseline now stage on the Tiller fixture; 4
   fail and 2 are unattributed PENDINGs. The plan's original bar would fail them; R33 grades against a baseline that has
   no verdict for them. I list them with owners; the orchestrator should rule.
7. **A-alloc-rate is ~600× over** (src 37–42 MB/s against 64 KB/s). The allocations are real (an array per `noise2D`
   call, closures per collision query), and most sit in files this lane may not touch, several of them frozen (§7).
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

⟨OTHERS⟩

## 8. Files changed this session (vs `766e49b`)

### 8.1 The W0a-exit part (merge first)

| file | change |
|---|---|
| `tools/gates.r5.gates-perf.mjs` | R33 grading rewritten (git-anchored baseline, one full run + partial re-runs, R30 / attributed-PENDING / newly-staged classes, box reported, HEAD not compared, SKIP label read from the verdict head); partial seals for targeted re-runs; children of a monitored run never sealed; judge `--list` picks the newest complete full run |
| `tools/gates.r5.carried.mjs` | A21's verdict names tier / pixel ratio / device DPR / box (R33 f); A6 re-staged by the herd role (R28) |
| `tools/gate-roster.mjs` | `ROSTER` waits (≤ 25 s) for `ctx.machines.expansionReady` (the Tiller fixture registers after `__READY__`) |
| `tools/budgets.mjs` | `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` |
| `tools/gates/carried-baseline.json` | unchanged (recorded once, Oct 19) |

### 8.2 The W0b part

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

## 9. Processes

⟨PROCESSES⟩
