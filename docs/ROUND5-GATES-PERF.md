# ROUND 5 — lane `gates-perf`: W0a exit (R33) and W0b — fix round 3

Port 5255. Tree `scratchpad/r5/gates-perf/tree` → `~/.calima-r5/trees/gates-perf`, branch `r5/w0a-gates-perf`.
Oct 22–23 2026, 04:35Z–⟪END⟫Z.
- Plan rows: §2 gates-perf, §1.2 harness grant, §3.1 W0a + W0b exits, §3.2 `gates.r5.carried.mjs`, §4.2 / §4.4,
  §6 (`reference/*.jpg`), §8.3 R33, R33 (g), R34, R44–R49, §9 gates-perf.
- The orchestrator's WIP checkpoints committed earlier edits as they landed. This round's diff is the working tree against
  `HEAD` plus the checkpoint commits since `fbb2a04` (§5).
- The fix-round-2 report is in git history (`fbb2a04`).

**Part A (the W0a exit under R33) can merge first. Part B is the W0b work.** §5 lists the files of each part.

## FR3. Fix round 3: the findings, what changed, what was measured

The judges filed six findings. Two of them overlap (the R48 b instrument criteria), so this table has five items for them,
plus two items for defects this round's own runs found. Every
change was re-run on port 5255. The fix-round-3 chain ran on the final build:
- one sealed full carried run;
- three sealed A50b partials;
- the lane block;
- one suite (the global-list rows that exist in this tree, plus the lane rows);
- A-carried-suite graded last, in an invocation of its own.

A first chain on an intermediate build (05:37–07:11Z) found three more defects of this lane's (item 6), and a second chain
(07:28–08:39Z) found one more (item 7). The final build fixes all four, and the final chain (08:44–10:17Z, plus one lane
block on the final seal code) is what §0 reports.

| # | finding (severity) | what changed | measured on the final build |
|---|---|---|---|
| 1 | **R48 (b) instrument criteria not met for A-alloc-rate, A-vram-ledger, A90-abs: no sealed run, no self-tests, textures and buffers unattributed, no-src bytes unowned** (blocker + major) | <ul><li>**Sealed:** the harness now seals every run that executes one of the three rows, binding the report, the monitor (box sample), the run id (`CAL_RUN_ID`, quoted by each row) and the sha256 of the instrument code at load and at exit. `--instruments` verifies them.</li><li>**Self-tests:** A-alloc-rate plants a known allocator at a src URL and outside src (CDP Fetch; nothing written under `src/`), and tests its own baseline guard. A-vram-ledger creates a render target, a texture and a geometry of exactly known bytes and disposes them. A90-abs makes a known JS-heap delta and a known GPU allocation.</li><li>**Attribution:** A-alloc-rate charges every no-src byte to a named bucket, and src + buckets sum to the byte. A-vram-ledger resolves every GL object to a ledger row, a scene root or a context-graph holder, and anything left goes to an explicit `unattributed` row. A90-abs splits the GPU footprint by lane, canvas and the browser's GPU-process remainder, and attributes heap growth by a live-object profile.</li><li>**Bars** are reported in full with `binding`; they bind at 5270 (R48 b/c). B.1 has the details.</li></ul> | All three rows report **instrument PASS** in every run of the final build (lane blocks `p5255-92940-…` and ⟪LANESEAL⟫, suite `p5255-22029-…`). <ul><li>A-alloc-rate: planted allocator 1.002 / 1.007 x in src and 0.997 / 1.017 x outside src.</li><li>A-vram-ledger: control 843,156 / 8,192 / 1,500 B seen and attributed exactly, disposed back to 0; 0 B unattributed; render targets fully claimed by 23 ledger rows.</li><li>A90-abs: heap control 1.008 / 1.001 x; GPU control 1.485 / 1.058 x.</li></ul>`--instruments` on the final source: ⟪CLI⟫. The bars still fail on other lanes' code and are graded at 5270 (§0, B.2). |
| 2 | **A-reference-set graded only 8 of 37 visual rows** (major) | <ul><li>The gate now grades every visual row of every lane file, SKIP-replaced rows included; R49's in-sheet controls are accepted for engine-gpu's V20, V33b and V-gpu-tier-look only.</li><li>24 new licence-clean references were fetched by the Commons fetcher (37 in all; B.3), and the 24 rows that named none now name theirs.</li></ul> | **PASS**: 37/37 visual rows of every lane file name a licence-clean reference (was 8 graded). A-reference-clean **PASS** (37 images, every one with a row). |
| 3 | **A9 FAILed on a contended GPU that R45 does not count as quiet** (major) | <ul><li>The fps term is graded only when the 1-min load is < 3 **and** no other gate Chrome is alive (A21's two-part test).</li><li>Otherwise the row reports `PENDING-quiet-box (R45)` whatever the median read, which is reported only.</li><li>Draws < 350 are graded on every box.</li><li>A-carried-suite reads that label as R45's: the offender is the orchestrator's 5270 run.</li></ul> | <ul><li>Full run: `PENDING-quiet-box (R45)` at load 4.12 with 1 other gate Chrome.</li><li>Suite: `PENDING-quiet-box` at load 3.60 with 0 other Chromes; it measured 59.9 fps and 309 draws, reported only.</li><li>Draws 309 < 350 in every run.</li><li>A-carried-suite lists A9 as `needsQuietBox` → orchestrator (R45).</li></ul> |
| 4 | **A-alloc-rate has no per-owner baseline + 10 % guard (R46, R48 c); report §4 asked for refused grants** (major) | <ul><li>Per-owner rows (`MEMORY_BUDGETS.alloc.owners`, R48 (c)'s schedule verbatim).</li><li>`CAL_ALLOC_RECORD_BASELINE=1` (or `=merge`) writes `tools/gates/alloc-baseline.json`, with the box sample, from a run whose instrument passed.</li><li>With a baseline present, an owner fails when both its KB/frame and its KB/s exceed 1.10 x.</li><li>The absolute 4 KB/s per-function bar binds per owner from its `barsFrom` wave, and the 64 KB/s total once every owner has a date.</li><li>The guard's own controls run every time.</li><li>§4 now requests no grant: the frozen hot spots go to the §11 W1 perf-hygiene grant.</li></ul> | <ul><li>Lane runs: baseline absent, so the guard term is PENDING (recorded at 5270); no owner's scheduled bar is active at W0b, so it passes.</li><li>Guard self-test passes in every run.</li><li>Record → grade, tested end to end on an unchanged build: 15 of 17 owners within 1.10 x; two exceed it (B.4).</li></ul> |
| 5 | **A-carried-suite ignored R47 and R48 (a, d)** (major) | <ul><li>A100–A107 are `skipReplaced` (melee W1, R47), listed by name.</li><li>A73's per-kind voice-seed clause is reported SKIP-replaced (audio W3, R48 a); every other clause is graded.</li><li>On any port but 5270 the gate returns **PENDING-orchestrator** with its offenders when every structural check holds and every offender is another lane's or ruled (A90b → instruments-core, R34; A9 with the R45 label → orchestrator; V21 → the orchestrator's judge). It FAILs on an offender this lane owns.</li></ul> | **PENDING-orchestrator** (lane block and alone). <ul><li>Offenders: A90b → instruments-core; A9 → orchestrator (R45); V21 → orchestrator's judge.</li><li>A100–A107: SKIP-replaced (melee W1).</li><li>A73: PASS on its graded clauses (167 buffers, 2.41 MB, CC0, 25/25 seeds, crit audible), voice seeds listed.</li><li>Tally: 97 pass, 35 skipShadowed, 61 listed (25 newly staged, none worse), 37 skipReplaced (29 visual + 8 R47), 1 skipR28, 2 skipR30, 1 regression (A90b), 1 needsQuietBox (A9), 1 awaitingJudge (V21).</li></ul> |
| 6 | (found by this round's own first chain) | <ul><li>**A79-runner-verdict-line** FAILed once in the first suite. Its closed-fd self-test raced the harness's run-monitor worker, whose lsof/ps pipes can take a just-closed fd number. The contract is now exercised on a descriptor no process can hold, plus the closed fd when it is still closed.</li><li>**A-alloc-rate's planted allocator** read 1.341 x once. Its three-field objects allocated a different amount in optimised and unoptimised code; it is now one array of small integers (7,624 B per call in every tier).</li><li>**A-chrome-semaphore** FAILed once in the first lane block: three waiting child runs exited 1 with no trace. A diagnostic re-run passed 4 of 4. Each failed child now reports why, and a real preflight refusal while waiting (plan §0 rule 8) reports PENDING with the reading instead of FAIL. Any other failure still FAILs.</li></ul> | <ul><li>A79 PASS in the final full run and the suite (closed fd not reused, invalid fd reported).</li><li>A-alloc-rate controls 0.987–1.007 x in the five runs after the change.</li><li>A-chrome-semaphore PASS 4/4 real runs in both final lane blocks.</li><li>A71c (item 7) PASS in the final full run.</li></ul> |
| 7 | (found by this round's own second chain) | **A71c-hud-surfaces**, newly staged on the Tiller (R28), FAILed `plateOnMachine` once: from 26 m the Tiller's plate anchor sat on the ui-06 clamp floor at HUD scale 1.6, so every plate clamped. The row's own intent is a plate "comfortably clear of the melee clamp", so the stand-off is now the first of 26 / 34 / 44 m at which the staged machine's own plate is unclamped at 1.6, measured before anything is graded; the checks are unchanged. | 3/3 PASS in dev runs (stand-off 44 m; off-axis 0–1 px at both scales); PASS in the final full run. |

---

## 0. Result

Final runs on port 5255 (every one on a loud box):

| run | id | time (Z) | outcome | box (its own monitor) |
|---|---|---|---|---|
| sealed full carried run | `p5255-17628-1792745070068` | 08:44–09:44 | 236 rows: 153 pass, 6 fail, 40 pending, 37 frames | load max 6.65, quiet 2.9 % |
| three sealed A50b partials | — | 09:44–09:45 | pass ×3 | — |
| lane block | ⟪LANESEAL⟫ | ⟪LANETIME⟫ | ⟪LANESUM⟫ | ⟪LANEBOX⟫ |
| suite (24 rows; A-carried-suite apart), sealed | `p5255-22029-1792749334363` | 09:55–10:16 | 20 pass, 1 fail (A90b), 3 pending (A9, A21, A-licence-manifest) | load max 5.59, quiet 9 % |
| A-carried-suite, in an invocation of its own | — | 10:16 | PENDING-orchestrator | — |

The 6 failing rows of the full run:
- five SKIP-shadowed hero-body rows: A13, A19, A31b, A31c, A31f;
- A90b (instruments-core).

The suite and the first lane block of the final build (`p5255-92940-1792748710941`, 09:45Z) carry the same instrument
results. After them I fixed one line in the seal code (§3 gap 9), so their instrument seals read as built from an older
source; the lane block above re-ran on the final source.

| gate | result | measured |
|---|---|---|
| `A-gate-preludes` | **PASS** | 14/14 checks; 0 unstaged machine picks; annotated sites freeze 75, census 22, clear 9, cast 9, warm 1, mirror 1. Brand's and instruments-core's files are reported and graded at their own exits (R33 e). |
| `A-gates-no-hero-literals` | **PASS** | 12 `tools/gate*.mjs` files, 0 hits |
| `A-gates-autodiscover` | **PASS** | 8/8 checks |
| `A-chrome-semaphore` | **PASS** | <ul><li>4 real runs at 1 slot: 4 PASS, 3 waited, at most 1 Chrome.</li><li>Stand-ins at 2 slots: at most 2 alive, 0 tickets left.</li><li>`kill -9` released in ⟪KILLMS⟫ ms.</li><li>4/4 preflight refusals at a simulated 2.5 GB / 20 %.</li><li>Write trace: 0 writes into the tree; positive control 6 ≥ 4.</li></ul> |
| `A-carried-suite` | **PENDING-orchestrator (R48 d)** | Offenders: A90b → instruments-core (R34); A9 → orchestrator (R45); V21 → the orchestrator's R29 judge. None is this lane's (A.3). |
| `A-reference-clean` | **PASS** | 37 images, all with rows (22 PD, 5 CC0, 8 CC BY 2.0, 1 CC BY 3.0, 1 CC BY 4.0); the 19 deleted stills present 0 times by name and 0 by content |
| `A-reference-set` | **PASS** | every visual row of every lane file names a reference: **37/37** (was 8 graded); classifier controls 10/10; the set verifies offline |
| `A-perf-scenarios-self-contained` | **PASS** | vista, herd and staged-fight stage in a STAGE_PRELUDE-only scope; 0 helpers leaked |
| `A-alloc-rate` | **instrument PASS** (R48 b); bars at 5270 | Planted allocator 1.002 x in src and 0.997 x outside src (lane), 1.007 / 1.017 x (suite). Every byte in a named owner. Baseline-guard self-test passed. Bars (not binding here): src total 121,775 KB/s vs 64; `noise2D` 18,173 KB/s vs 4; slope +145 / +20 KB/s. Scheduled bars at W0b: none active, pass. Baseline: absent until the 5270 run (B.2). |
| `A-vram-ledger` | **instrument PASS**; bars at 5270 | The control objects are seen and attributed to the byte (843,156 / 8,192 / 1,500 B) and dispose back to 0. Render targets: 437.75 MB attributed to 23 ledger rows, 0 mismatches. 0 B unattributed. 0.22 MB in two unnamed roots held by `ctx.combat` (B.2). Bars: render targets 437.75 MB > 170 and total 622.75 MB > 450, both failing; textures 105.46 MB and geometry 79.54 MB, both passing. |
| `A90-abs` | **instrument PASS**; bars at 5270 | Heap control 1.008 x; GPU control 1.485 x, fell back 74.9 MB (lane); 1.001 x and 1.058 x (suite). Footprint split: GL 638.37 MB, canvas 25.92 MB, browser GPU process 863.11 MB. Bars: post-GC JS heap 79.85 MB (≤ 450) passes; GPU process 1,527.4 MB (> 1,500) fails, 1,384.3 MB at pixel ratio 1.25. |
| `A-unattributed-cap` | **PASS** | 5 draws/frame (cap 5); hide cross-checks agree within 1 for every owner; 335 draws, post chain 22 |
| `A-port-guard` | **PASS** | 16 refusals; the lsof control saw its own connection; 0 connections to :5173 over the lane block's monitor and every fresh sealed run's |

# Part A — the W0a exit under R33

## A.0 Summary

| item | status |
|---|---|
| A-carried-suite as a regression guard vs the recorded W0-day1 baseline | **PENDING-orchestrator (R48 d)** in the lane run. Offenders: A90b (instruments-core, R34), A9 (R45 quiet box), V21 (the orchestrator's R29 judge). None is this lane's. R47 and R48 (a) are applied |
| `tools/gates/carried-baseline.json` written once, with the box sample | unchanged since Oct 19; git-anchored |
| visual rows graded only for kept systems by an R29 judge | V21 is graded here (awaiting the judge; my advisory reading is a PASS, A.2). V1–V4 and V12–V14 are SKIP-shadowed (hero-body) under R33 (g). 29 other visual rows are SKIP-replaced, each naming its absorbing lane, and every one now names a licence-clean reference (B.3) |
| sealed runs bound to their frames; no report overwritten by a semaphore child | seal v3, now also for instrument runs (R48 b); A-chrome-semaphore **PASS** (0 writes into the tree, positive control) |
| A-gate-preludes on own files + carried.mjs | **PASS** |
| A9 on R26 | quiet test is now R26 + R45 (load < 3 **and** no other gate Chrome); **PENDING-quiet-box** on this box (A.3) |
| A21 names its DPR | yes (tier `high`, pixel ratio 1.5 = min(device DPR 2, tier cap 1.5)); PENDING on a loud box (R45) |
| `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` in `tools/budgets.mjs` | in place |
| open W0a judge findings (V3 crouch, R29 verdict port, A-port-guard lsof half, A65's quest) | closed in earlier rounds |

The machine-pick rule (fix round 2, A.1 of `fbb2a04`) is unchanged: a carried row reaches `ctx.machines.list` only
through a roster helper, a `KIND[...]` / `STAGED_KINDS` filter, or an annotated whole-roster operation. A-gate-preludes
reads 0 unstaged picks; its annotated sites are freeze 75, census 22, clear 9, cast 9, warm 1, mirror 1.

## A.2 Frames read this round (final full run `p5255-17628-1792745070068`)

| frame | read against | reading (advisory; R29 judges decide) |
|---|---|---|
| `V21-camera-cover.png` | criteria (1)–(4) and `reference/r5/gates-perf/chase-camera.jpg` (a walker seen from behind among tall trunks, nothing covering the figure) | <ol><li>The readout reads `boom requested 4.20 m -> 1.50 m | trunk r 0.35 m, 0.15 m off the boom axis | line of sight to the hero: CLEAR`.</li><li>Her head and braids, shoulders and upper back, the bow on her back (screen left) and the lance on her back (screen right) are readable, and nothing in the world is in front of her. The frame bottom crops her at mid-back, which the criteria allow.</li><li>No bark or leaf mass is in the centre: the nearest pine stands mid-ground, left of centre. The lens is in neither a trunk nor the ground.</li><li>The meadow under her and the valley floor below the massif are visible and level.</li></ol>Compared with `chase-camera.jpg`, it is the same read: a figure from behind and above, among trunks, uncovered. I read it as a PASS. The frame is the same composition as in every full run of this round (the row is deterministic; sha256 `244d711f…`). |
| `V13-aim-strafe.png` (SKIP-shadowed; hero-body grades it) | the row's own staging assertion (R33 g) | Front lens. She holds the bow upright in her left hand (screen right) in front of the shoulder; the lance is stowed diagonally on her back. She is mid side-step: the left foot is planted, the right one is lifted, heel up. No STAGING FAILED card. Whether the feet point toward the travel direction is for hero-body's judge to grade on Brea. |

The other 35 frames are SKIP-replaced (29) or SKIP-shadowed (6 besides V13) and are not graded here. Each run's PNGs were
deleted from `shots/` within 15 s of being written; the sealed copies are in the ledger (`ledger/runs/<run>/`), and
`shots/` stayed ≤ a few MB (2.5–2.9 MB at every check; the first chain's cleaner did not start, and `shots/` reached 162 MB there, under the 200 MB cap) during the final chain.

## A.3 The carried suite, graded (R33, R47, R48)

The ledger is `scratchpad/r5/gates-perf/ledger/ledger.jsonl`, outside every tree. These are the observations of the final
build (carried build digest `12413ca907db…`):

| run | kind | rows | box (its own monitor) |
|---|---|---|---|
| `p5255-17628-1792745070068` | **full** (`--lane carried`, 08:44–09:44Z) | 236: 153 pass, 6 fail (5 SKIP-shadowed hero-body rows, A90b), 40 pending, 37 frames | load max 6.65, quiet 2.9 %, up to 1 other gate Chrome |
| `p5255-90880-…`, `p5255-91583-…`, `p5255-92264-…` | partial (`--only A50b-aim-on-drawn-geometry`, 09:44–09:45Z) | A50b pass ×3 | load 3.9–5.7 |
| `p5255-22029-1792749334363` | partial (the suite: 10 carried rows + the instruments, 09:55–10:16Z) | A1, A20b, A79, A80, A90, A90-expansion, A90-rig-reclaim pass; A9 PENDING-quiet-box; A21 PENDING; A90b fail | load max 5.59, quiet 9 % |

| class | rows |
|---|---|
| **offenders, all another lane's or ruled → PENDING-orchestrator** | **A90b-memory-attribution** (regression; instruments-core, R34): 24 Bones from `autorig.js:75` held after 30 Tiller kills (fixed in its unmerged W0b tree). **A9-perf-budget** (`needsQuietBox`, every observation `PENDING-quiet-box (R45)`; orchestrator's 5270 run). **V21-camera-cover** (`awaitingJudge`; the orchestrator's R29 judge) |
| this lane's offenders | **none** |
| skipReplaced (R33 c, R47) | 37: 29 visual rows, each naming its absorbing lane (and now a reference), plus **A100–A107** (melee W1, R47; observed: pass ×8, never counted) |
| R48 (a) | A73-sample-bank **pass** on its graded clauses; the per-kind voice seeds (`voice/tiller/windup`, `voice/tiller/strike`) listed SKIP-replaced (audio W3) |
| skipShadowed (R33 g) | 35 (A2, A3, A11–A19, A28 ×3, the A31 family, A32 ×3, A33 ×2, V1–V4, V12–V14) |
| known-flaky, decided | A50b **pass** (4 of 4) |
| listed (not worse than baseline) | 61, among them **25 newly staged on the Tiller**, none worse (A71c now pass) |
| skipR28 / skipR30 since baseline | A45c / A99, V35 |
| pass | 97 |

# Part B — the W0b deliverables

## B.0 Summary

| deliverable (plan §2 / §9) | file(s) | status |
|---|---|---|
| licence-clean reference set via the Commons fetcher | `tools/r5-refs/{fetch,licence,manifest,slots}.mjs`, `reference/r5/gates-perf/**` (37 files + MANIFEST) | 24 new references this round; A-reference-set **PASS** over every visual row of every lane file (37 of 37) |
| `reference/MANIFEST.md` + deletion of `reference/*.jpg` (HZD stills) | `reference/MANIFEST.md`; the 19 stills deleted | A-reference-clean **PASS** |
| `A-alloc-rate` | `tools/gates/gates-perf.w0b.mjs`, `MEMORY_BUDGETS.alloc` | **instrument PASS** (R48 b); R48 (c) baseline mode, guard and schedule built; bars reported (B.2) |
| `A-vram-ledger` | same | **instrument PASS**: every GL byte attributed (0 B unattributed); bars reported |
| `A90-abs` | same | **instrument PASS**: footprint split, heap growth attributed, known-delta controls; bars reported |
| the unattributed-draw cap | same + `MEMORY_BUDGETS.unattributed.w0Cap` | **PASS**: 5 draws (cap 5) |
| R34 self-contained scenarios | `tools/budgets.mjs` + `A-perf-scenarios-self-contained` | **PASS** |

## B.1 The three instruments under R48 (b)

R48 (b) grades `A-alloc-rate`, `A-vram-ledger` and `A90-abs` at this lane's exit **as instruments**. Each row now returns
two blocks and says which one decided it:

- `instrument`: the checks that make the measurement trustworthy (sealed, attributed, self-tested, routed). They always grade.
- `bars`: the plan's numbers, every one measured and reported, each with `binding: true | false`. A bar binds on port 5270
  (the orchestrator's global run) or with `CAL_BARS_BINDING=1`; on this lane's port they are reported, not graded (R48 b).
  `A-alloc-rate`'s R48 (c) parts bind by their own rule (the scheduled bars from their wave; the baseline guard whenever a
  baseline exists).

**Sealed.** The harness seal (`tools/gates.r5.gates-perf.mjs` `sealRun`) now seals every run that executes one of the three
rows, whatever else it runs (the lane block, an `--only`, a suite). The seal binds the report bytes, the run monitor (the box
sample: load, other gate Chromes, 5173 connections) and the run id, plus the sha256 of the instrument code
(`gates-perf.w0b.mjs`, `budgets.mjs`, `gates.r5.gates-perf.mjs`). Each row's detail quotes the run id (`CAL_RUN_ID`).
`node tools/gates.r5.gates-perf.mjs --instruments --port 5255` verifies every such seal.

**A-alloc-rate**
- *Attribution, every byte.* Each sampled byte is charged to exactly one named owner:
  - the nearest `src/**` frame on its stack (per function, and per owner row of `MEMORY_BUDGETS.alloc.owners`);
  - otherwise a no-src bucket named by the nearest script frame: three.js (engine-gpu), other vendor deps, the Vite dev
    client, this gate's own page code, page script outside `src/`;
  - otherwise "browser / V8 runtime" (no script frame on the stack).
  The src bytes and the buckets must sum to the profile's total to the byte (`accounting.exact`).
- *Self-test: a planted allocator.* A module of known allocation is served at `/src/__gates-perf-control__.js` by CDP
  `Fetch.fulfillRequest` in that page only. Nothing is written under `src/`. The same source is also served outside `src/`.
  - Each copy calls `__w0bControlAlloc()` once per frame.
  - Its true size per call is measured without the profiler: 1,500 results are retained, and the post-GC used heap is read
    before and after.
  - Inside a profiled window with the graded settings, the profiler must give `calls x size` back:
    - to `__w0bControlAlloc /src/__gates-perf-control__.js:2`, within 15 %;
    - and the out-of-src copy's bytes to the "page script outside src" bucket.
  - The control runs after the graded phases and must be absent from them.
- *Self-test: the baseline guard.* On the run's own owner table:
  - an unchanged baseline flags 0 owners;
  - the largest owner grown 25 % on both metrics is flagged, alone;
  - grown on KB/frame only, it is not flagged.
- *The R48 (c) bars.*
  - Baseline: `CAL_ALLOC_RECORD_BASELINE=1` writes `tools/gates/alloc-baseline.json` (per owner and per over-bar function
    KB/frame and KB/s, the box sample, git HEAD and run id) from a run whose instrument passed. `=merge` adds a further run,
    keeping per owner the larger number.
  - Guard: with a baseline present, an owner fails when **both** its KB/frame and its KB/s exceed 1.10 x the baseline's.
  - Schedule: each owner's 4 KB/s per-function bar binds from its `barsFrom` wave (R48 c verbatim: terrain W1,
    playerAnimator W1, fauna W1, shell-ui W2, settlements W2, audio W3). engine.js, the frozen movement and rigging, the
    frame loop, hero-body's other files, the Instruments (graded by `A-alloc-machines`, R46) and the rest have no date:
    baseline guard only. The 64 KB/s src total binds once no owner is left without a date.
  - The post-GC slope binds at the global run.

**A-vram-ledger**
- *Attribution, every GL object.* The census (installed before the game makes its context) also records framebuffer
  attachments and, for every buffer, the typed array it was filled from. Each live GL object is then resolved to one owner,
  in this order:
  1. the engine's `renderTargetLedger()` rows (post chain, CSM, environment PMREM, registered lane targets) claim their
     framebuffer attachments, renderbuffers and textures;
  2. every top-level scene root claims the textures of its subtree's materials (every texture-valued property and uniform),
     its bone and morph textures and its geometry buffers, named by its §4.2 draw-owner row;
  3. a bounded walk of `__CTX__` and the game's systems claims what is held off-scene (pass noise textures, pools,
     templates), owner = the ctx key's lane; an unregistered scene root reached this way is labelled with who holds it;
  4. the rest is an explicit `unattributed` row, with each object's size and the src frames of its first upload.
  Every render target must be claimed by a ledger row whose bytes equal the ledger's (`rtMismatches` empty).
- *Self-test: objects of exactly known size.* Created through the page's own three module (the same module URL as the game's):
  - a 333 x 211 HalfFloat render target with a depth renderbuffer, registered as `gates-perf:control` (843,156 B);
  - a 64 x 32 RGBA8 DataTexture (8,192 B);
  - a 100-vertex + 150-index geometry (1,500 B) on a scene root `gates-perf-control`.
  The census must see each to the byte, the attribution must give each to its owner (the ledger row, the root), the
  engine's own ledger row must agree, and disposing them must return every census total to its value before, to the byte.

**A90-abs**
- *Attribution.* The footprint is split at the last fight reading, with the GL census installed in this page too:
  - GL objects by owner lane;
  - the canvas drawing buffers;
  - the remainder, the Chrome GPU process and ANGLE/Metal runtime itself.
  The heap the workload and the fight add is attributed by a live-object sampling profile (src owner, no-src buckets).
- *Self-tests: known deltas.*
  - Heap: 128 arrays of 65,536 small integers (33.56 MB, computed exactly) are retained. The post-GC heap must rise by that
    within 5 % and fall back when they are released.
  - GPU: with the world held, a 4096 x 4096 RGBA8 render target (67.11 MB) is allocated and cleared. The GPU process
    footprint (median of 5 readings) must rise by 0.75–1.6 x of that. The fall after dispose is reported.

## B.2 Measured numbers (final build; lane block `p5255-92940-1792748710941`, 09:45Z, unless named)

Tier `high`, pixel ratio 1.5 (= min(device DPR 2, tier cap 1.5)), drawing buffer 2400 x 1350. Staged fight: 8 x the herd
role's Tiller fixture (R18 fallbacks named).

**A-alloc-rate**

| phase | fps | all allocation | of which src/** | no-src buckets | graded src (max of KB/s, KB/frame x 60) | post-GC slope |
|---|---|---|---|---|---|---|
| staged fight, 10 s | 29.9 | 54,837 KB/s | 54,837 KB/s | browser / V8 runtime 0.38 | 110,191 KB/s | +145.4 KB/s |
| sprint and draw, 10 s | 24.6 | 49,958 KB/s | 49,948 KB/s | browser / V8 runtime 9.36 | 121,775 KB/s | +20.4 KB/s |
| empty frame (scene hidden, reported) | 56.9 | — | 39,300 KB/s | — | — | — |

- The sprint-and-draw drive was witnessed: sprinting 60 %, aiming 40 %, 6.87 m/s maximum, 3 arrows at full draw.
- In both graded phases the src bytes plus the no-src buckets equal the profile total to the byte.
- Planted allocator: 7,682 B per call by heap delta, 161 calls. The profiler gave 1,238,672 B against an expected
  1,236,804 (1.002 x) to `__w0bControlAlloc /src/__gates-perf-control__.js:2`, and 0.997 x to the out-of-src bucket.
- Guard self-test (owner `terrain`): 0 flags unchanged; flagged alone at +25 %; not flagged on a per-frame-only change.

Per owner, worst phase, graded KB/s:

| owner | graded KB/s | KB/frame | bars from |
|---|---|---|---|
| terrain | 36,955 | 615.9 | W1 |
| frozen-spatial | 35,188 | 586.5 | — (§11 W1 perf-hygiene) |
| playerAnimator | 15,572 | 259.5 | W1 |
| engine | 15,570 | 259.5 | — (§11 engine grant) |
| instruments | 7,180 | 119.7 | — (R46, `A-alloc-machines`) |
| frozen-rigging | 7,054 | 117.6 | — |
| world-other | 6,022 | 100.4 | — |
| hero-body | 3,429 | 57.2 | — |
| frozen-machine-rig | 2,690 | 44.8 | — |
| fauna | 2,545 | 42.4 | W1 |
| settlements | 1,540 | 25.7 | W2 |
| shell-ui | 1,277 | 21.3 | W2 |
| combat | 1,101 | 18.3 | — |
| audio | 890 | 14.8 | W3 |
| progression | 141 | 2.3 | — |
| frame-loop | 15 | 0.26 | — |
| other-src | 11 | 0.18 | — |

The largest functions over 4 KB/s, graded KB/s (336 functions are over the bar; all are in the row's
`functionsOverBar` with owner and file:line):

| function | file:line | graded KB/s | owner |
|---|---|---|---|
| `noise2D` | `terrain.js:78` | 18,173 | terrain |
| `getHeight` | `terrain.js:1860` | 15,102 | terrain |
| `_meshPush` | `collision.js:835` | 14,142 | frozen-spatial |
| `raycast` | `collision.js:888` | 11,762 | frozen-spatial |
| `_springs` | `playerAnimator.js:3708` | 11,331 | playerAnimator |
| `render` | `engine.js:273` | 10,932 | engine |
| `update` | `clipLayer.js:417` | 6,302 | frozen-rigging |
| cull-pass closure | `engine.js:1352` | 5,504 | engine |
| `occluded` | `collision.js:1099` | 3,133 | frozen-spatial |
| `update` | `playerAnimator.js:1168` | 2,689 | playerAnimator |
| `update` | `machines/index.js:533` | 2,550 | instruments |
| `sphereQuery` | `collision.js:679` | 2,345 | frozen-spatial |
| closure | `vegetation.js:117` | 2,190 | world-other |
| `update` | `fauna.js:833` | 2,141 | fauna |
| `steer` | `nav.js:579` | 2,093 | frozen-spatial |
| `_fillChunk` | `vegetation.js:889` | 1,959 | world-other |

**A-vram-ledger** (by lane, MB)

| lane | MB |
|---|---|
| engine-gpu (post chain) | 327.62 |
| engine-gpu (shadow maps / CSM) | 100.65 |
| hero-body, armory | 65.58 |
| instruments (scene root) | 36.14 |
| world-ground (scene vegetation + `ctx.terrain._detailTex`) | 32.05 |
| world-props | 21.40 |
| terrain / sky / sea | 17.54 |
| world-sky (environment PMREM) | 9.44 |
| settlements | 8.99 |
| instruments-core (`ctx.machines.list[]._cmp…combined`) | 1.90 |
| VFX / UI / pooled | 0.78 |
| engine-gpu (`gtao.gtaoNoiseTexture`) | 0.38 |
| unregistered roots (`ctx.combat.sparks.mesh`, `ctx.combat._trajPts`) | 0.22 |
| **unattributed** | **0** |

- Render targets: 437.75 MB, all claimed by the 23 `renderTargetLedger()` rows with 0 byte mismatches.
- Largest render targets: `post:scene` 194.40 MB (2400 x 1350, 4-sample MSAA colour + depth), the CSM cascades
  3 x 33.55 MB, `post:pingA` / `pingB` and SMAA `edgesRT` / `weightsRT` 4 x 25.92 MB, GTAO 2 x 9.72 MB.
- engine-gpu's recorded ledger (DPR 1.25) totals 340.74 MB; its unmerged W0b tier records 127.27 MB.
- The context-graph walk visited 187,124 objects.

**A90-abs**
- JS heap after two forced GCs: 65.58 MB at boot, 76.85 MB after the A90 workload (30 Tiller kills, 30 respawns), 79.85 MB
  after the 60 s fight.
- Live heap growth by owner (sampled, 14.71 MB): engine 4.78 MB (`warmUp` `engine.js:1129` 2.77 MB), frozen-spatial
  3.47 MB (`_fromSkinned` `hitHulls.js:480` 2.67 MB), frozen-machine-rig 1.64 MB, instruments 1.18 MB, frozen-rigging
  1.12 MB, shell-ui 1.00 MB.
- GPU process, read every 15 s: 1,526.4 / 1,520.4 / 1,521.6 / 1,527.4 / 1,527.4 MB.
- Footprint split: GL objects 638.37 MB (by lane as in the table above), canvas drawing buffers 25.92 MB, and the Chrome GPU
  process / ANGLE-Metal remainder 863.11 MB.
- What-if at pixel ratio 1.25: 1,384.29 MB.
- Controls: heap +33.83 MB against 33.56 expected (1.008 x), fell back 33.64 MB. GPU +99.65 MB against 67.11 (1.485 x),
  fell back 74.92 MB.

**A-unattributed-cap**: 5 draws/frame unattributed of 335 (post chain 22). They are the unnamed `ctx.combat.sparks.mesh` and
`ctx.combat._trajPts` roots (`src/combat/particles.js`, frozen). Every owner's hide reading agrees with the direct count within
1 draw.

## B.3 The reference set (24 new this round; 37 in all)

Fetched by `node tools/r5-refs/fetch.mjs --fetch --lane gates-perf --slot <slot>` from the Wikimedia Commons API (licence
re-read from the API at fetch time; PD / CC0 / CC BY only), re-encoded ≤ 1280 px, metadata stripped. The sha256 of each file
is in its `reference/r5/gates-perf/MANIFEST.md` row. 4.8 MB added; `reference/r5/gates-perf/` is 7.6 MB. Each was picked by
eye from 330 px thumbnails of the Commons search hits (scratch, deleted). Never shipped (not under `public/`).

| file | row(s) | licence | author | size |
|---|---|---|---|---|
| `quadruped-trot.jpg` | V5-machine-stride | PD | Eadweard Muybridge | 51 KB |
| `collapsed-tower.jpg` | V6-machine-death | PD | National Weather Service | 525 KB |
| `ridge-skyline.jpg` | V7-vista-mountains | CC0 | Novoklimov | 139 KB |
| `dry-riverbed.jpg` | V8-riverbed | CC BY 2.0 | James St. John | 322 KB |
| `golden-clouds.jpg` | V9-sky-golden | CC BY 2.0 | Felipe Valduga | 94 KB |
| `field-book.jpg` | V10-hud-language, V37-hud-language | PD | Meriwether Lewis Clark (1850 survey notebook) | 106 KB |
| `pine-ridge.jpg` | V20-aa-crop | CC BY 2.0 | S. Rae | 277 KB |
| `hair-trail-run.jpg` | V23-secondary-motion | CC BY 2.0 | Vinod Divakaran | 206 KB |
| `herd-file.jpg` | V25-alarm-converge | CC BY 2.0 | Kashmir Pictures | 231 KB |
| `survey-tripod.jpg` | V26-silhouette | PD | Jerome O. Kilmartin (USGS, 1923) | 272 KB |
| `gathered-limbs.jpg` | V27-attack-pose | PD | Eadweard Muybridge | 90 KB |
| `spark-burst.jpg` | V28-impact | PD | US Air Force | 108 KB |
| `bow-in-hand.jpg` | V29-wielded-carry | PD | USDA Forest Service | 60 KB |
| `long-shadows.jpg` | V30-golden-hour | CC BY 4.0 | sagesolar | 194 KB |
| `night-stars.jpg` | V31-night | PD | Joshua Tree National Park | 185 KB |
| `ground-grain.jpg` | V32-ground-detail | CC0 | Dexter Perkins | 283 KB |
| `strata-talus.jpg` | V33-rim | PD | USGS | 274 KB |
| `wall-contact.jpg` | V33b-no-ao-lattice | CC BY 2.0 | Gajtalbot | 600 KB |
| `surveyor-sighting.jpg` | V36-focus-scan | PD | Edward S. Curtis | 115 KB |
| `salt-pans.jpg` | V38-title | CC BY 2.0 | Jorge Franganillo (Salinas de Janubio) | 280 KB |
| `biome-scrub.jpg` | V44-biomes | CC BY 3.0 | Marc Ryckaert | 290 KB |
| `biome-ravine.jpg` | V44-biomes | CC0 | Novoklimov | 183 KB |
| `conversation.jpg` | V45-dialogue-panel | PD | John Vachon (FSA) | 27 KB |
| `portrait-bokeh.jpg` | V79-photo-portrait | CC0 | chelsea ferenando | 94 KB |

Each slot's `subject` (`tools/r5-refs/slots.mjs`, and the MANIFEST row) says what the judge compares. These rows stay
SKIP-replaced in A-carried-suite (R33 c); the reference is what their absorbing lane re-stages against.

## B.4 The baseline guard on an unchanged build (dev ledger, recorded then graded)

The test:
1. `CAL_ALLOC_RECORD_BASELINE=1 CAL_ALLOC_BASELINE_FILE=<scratch>` recorded a baseline (05:35Z; instrument passed; 17 owners).
2. The next run, on the same build, was graded against it.

Result:
- 15 owners stayed within 1.10 x on both metrics.
- **`frozen-machine-rig` read 1.357 x per frame and 1.302 x per second** (49.8 → 67.6 KB/frame).
- **`frame-loop` read 1.20 x and 1.14 x**, on 0.2 KB/frame.
- So the guard as R48 (c) words it FAILs an unchanged build when the baseline comes from one run.

I did not widen the 1.10 or add a floor. `=merge` lets the orchestrator record the larger number of several global runs
(§4 decisions).

## B.5 Routing of every over-bar owner

§4 routes every owner with its file:line, following R48 (c)'s schedule and the §11 grants. The full list (owner, file:line,
graded KB/s, phase) is the row's `functionsOverBar` in each run report.

## 1. Gate table — the global green list (the items that exist in this tree; final suite `p5255-22029-1792749334363` and full run)

| gate (owner) | result | measured (final build) |
|---|---|---|
| `A1-boot-clean` | **PASS** | full run and suite |
| `A9-perf-budget` (R26 + R45) | **PENDING-quiet-box (R45)** | <ul><li>Draws 309 < 350 (graded: PASS).</li><li>Fps term not graded: full run at load 4.12 with 1 other gate Chrome; suite at load 3.60 with 0 others. The suite read 59.9 fps, p95 18.1 ms, scene GPU 19.06 ms, reported only.</li></ul> |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 239 frames |
| `A21-real-draw-calls` | **PENDING** (R45) | <ul><li>Draws 309 / 232 / 340 and triangles 4.12 / 4.40 / 4.41 M (vista / herd / staged fight): PASS.</li><li>GPU median 78.1 / 103.5 / 53.4 ms on a loud box (load 3.39, 1 other gate Chrome).</li><li>The GPU term is expected to FAIL here until engine-gpu's tier merges (A9's own vista scene GPU is 19.1 ms).</li></ul> |
| `A90-memory-stability` | **PASS** | 30 Tiller kills → 30 respawns: geometries +18 (≤ 40), textures −3 (≤ 8), heap −1.4 % (< 25 %), objects −37 (≤ 60) |
| `A90-memory-stability-expansion` | **PASS** | objects +74 (≤ 600), non-machine +0, orphan roots 0 |
| `A90b-memory-attribution` | **FAIL** (instruments-core, R34) | 24 Bones held off-scene from `autorig.js:75` after 30 Tiller kills; instruments-core's unmerged W0b fix records 0, 3 of 3 |
| `A90-rig-reclaim` | **PASS** | 30 cycles: geometries +0, textures 0; per live machine 0 / 0.5 |
| `A90-abs` | **instrument PASS**; bars at 5270 | B.2 |
| `A-alloc-rate` | **instrument PASS**; bars at 5270 | B.2 |
| `A-vram-ledger` | **instrument PASS**; bars at 5270 | B.2 |
| `A-ID-ip-assets-gone` (pipeline) | **PASS** | 16 GLBs, 0 IP hits; `aloy.glb` a scheduled exception (hero-body, R39) |
| `A-licence-manifest` (pipeline) | **PENDING** (R42) | third-party / legacy-source / credits PENDING-awaiting-download (not blocking W0b); every other clause PASS |
| `A-assets-tracked` (pipeline) | **PASS** | 212 referenced paths, 0 ignored, 0 missing |
| `A-no-horizon-terms-player` / `-code` (brand), `A-reach-all-sites` | not in this tree | brand's W0b / no lane file defines it yet |
| `A-port-guard` | **PASS** | lane block and suite |
| `A-carried-suite` | **PENDING-orchestrator (R48 d)** | A.3 |
| `A79-runner-verdict-line`, `A80-chrome-profile-hygiene` (carried) | **PASS** | full run and suite |

## 2. Contracts and APIs published (exact signatures; changes this round in bold)

### 2.1 `tools/gate-roster.mjs`, `tools/gate-places.mjs`

Unchanged this round (fix round 2's helpers `isStaged`, `liveStaged`, `livesStaged`, `liveOfKind`, `stageAny`,
`memVictim`, `ALL_MACHINES_REASONS`; the W0 places `castStage`, `meleeSlope`).

### 2.2 `tools/budgets.mjs`

```js
export const BUDGETS, STAGE_PRELUDE, PERF_SCENARIOS, MEMORY_BUDGETS   // unchanged API
export { RT_LEDGER } from './r5-probes/rt-ledger.mjs'               // unchanged (R44)
MEMORY_BUDGETS.alloc = { srcKBps: 64, fnKBps: 4, heapSlopeBps: 0, windowS: 10, warmupS: 3, samplingIntervalB: 2048, refFps: 60,
  attribution: 'caller', emptyFrameS: 5,
  baselineGuard: 1.10,                                  // NEW (R48 c): no owner > 1.10 x its baseline (KB/frame AND KB/s)
  baselineFile: 'tools/gates/alloc-baseline.json',      // NEW: recorded at the orchestrator's W0b global run, then committed
  controlTolerance: 0.15, controlWindowS: 6,            // NEW: the planted-allocator self-test
  owners: [{ id, files /* RegExp source over /src/... */, lane, barsFrom /* 'W1' | 'W2' | 'W3' | null */, ruling }] }   // NEW, R48 (c)'s schedule
```

### 2.3 `tools/gates/gates-perf.w0b.mjs`

```js
export const W0B_BUDGETS, UNATTRIBUTED_CAP_W0, DRAW_OWNERS, ownerOfName(name), GATES   // unchanged
export const INSTRUMENT_ROWS = ['A-alloc-rate', 'A-vram-ledger', 'A90-abs']           // NEW (R48 b)
```

Every instrument row's detail now has the same shape: **`{ verdict, instrument: { <check>: boolean }, bars: { <bar>: { binding,
pass, … } }, runId, barsBinding, sealing, selfTest, checks }`**. The row's `pass` = every instrument check AND every bar whose
`binding` is true. Bars bind on port 5270 (the orchestrator's global run) or with `CAL_BARS_BINDING=1`; A-alloc-rate's scheduled
absolute bars bind from `owners[].barsFrom` (`CAL_WAVE`, default `W0b`) and its baseline guard whenever a baseline file exists.

- **A-alloc-rate**: `owners[] { id, lane, barsFrom, ruling, bytes, measuredKBps, kbPerFrame, gradedKBps, phase }`,
  `phases[].noSrc { buckets[] { id, owner, … }, top[] }`, `phases[].accounting { totalBytes, srcBytes, noSrcBytes, exact }`,
  `selfTest { plantedAllocator { ok, perCallBytes, calls, src { expectedBytes, recoveredBytes, ratio }, outsideSrc { … } },
  controlAbsentFromGradedPhases, baselineGuard { ok, owner, unchangedOffenders, grown25PercentFlags, perFrameOnlyGrowthFlags } }`,
  `bars { scheduledAbsoluteBars, baselineGuard { state, file, rows[], offenders[] }, srcTotal, perFunctionAllOwners, postGcHeapSlope }`,
  `functionsOverBar[] { fn: '<name> /src/<file>:<line>', gradedKBps, kbPerFrame, measuredKBps, phase, owner, ownerRow }`, `recorded`.
  Env: **`CAL_ALLOC_RECORD_BASELINE=1 | merge`**, **`CAL_ALLOC_BASELINE_FILE=<path>`** (default `tools/gates/alloc-baseline.json`).
- **A-vram-ledger**: `attribution { owners[] { owner, lane, how, objects, texturesMB, renderTargetsMB, buffersMB, totalB },
  unattributed { textures|renderTargets|buffers { count, bytes, MB, rows[] { kind, bytes, w, h, levels, samples, hint[] } } },
  accountingExact, totals, attributed, ledgerRows[] { owner, allocated, ledgerBytes, glBytes }, rtMismatches[], sceneRoots[] }`,
  `byLaneMB`, `routing`, `selfTest { checks, expectedBytes, censusDelta, afterDispose, attributedTo, engineLedgerRowBytes }`.
  Page side: **`window.__glCensus.totals()`**, **`window.__glCensus.attribute({ drawOwners, ctxLanes })`** (installed before the
  context by `GL_CENSUS`).
- **A90-abs**: `footprintSplit { footprintMB, glObjectsMB, byLaneMB, unattributedGlMB, canvasDrawingBuffersMB,
  chromeGpuProcessRemainderMB, remainderOwner }`, `heapGrowth { liveSampledMB, bySrcOwnerMB, noSrcMB, topFunctions }`,
  `selfTest { heap { expectedB, riseB, ratio, fallB }, gpu { expectedB, riseB, ratio, fallB, before, held1, after } }`.
- **A-reference-set**: graded over every visual row of every lane file; detail `visualGates[]`, `missingByLane`; R49 rows
  accepted with `refs: ['in-sheet control (R49)']`.

### 2.4 `tools/gates.r5.gates-perf.mjs` (seal, ledger and grading contract)

- **Sealing (R48 b)**: any `node tools/gates.mjs` run of this tree that executes an `INSTRUMENT_IDS` row is sealed, whatever
  else it ran. Seal entry fields added: **`instrumentRows[]`, `instrumentSource[] { file, sha256 }`** (the instrument code,
  `gates-perf.w0b.mjs`, `budgets.mjs`, this file), **`scope: 'carried' | 'instruments' | 'carried+instruments'`**; the
  `run-start` entry gains **`instrumentRowsSelected[]`**. The harness exports **`CAL_RUN_ID`** to its rows (the instrument
  rows quote it as `detail.runId`).
- **CLI**: **`node tools/gates.r5.gates-perf.mjs --instruments [--port <p>] [--json]`**: every sealed instrument run of this tree,
  verified (chain, report and monitor hashes, run id, build and instrument source unchanged), with each row's instrument verdict
  and bars; exit 0 when the newest fresh seal holds all three rows with every instrument check true.
- **A-carried-suite**: class **`pendingQuietBox`** (a verdict head `PENDING-quiet-box (R45)`); **`R47_ROWS`** (A100–A107,
  `skipReplaced`, owner `melee W1`); **`RULED_CLASS_OWNER`** (`needsQuietBox` with the R45 label -> orchestrator R45;
  `awaitingJudge` -> orchestrator R48 d); **`ORCHESTRATOR_PORT = 5270`**. On any other port the gate returns
  **`pass: null` with verdict `PENDING-orchestrator (R48 d)`** when every structural check holds and every offender is another
  lane's (`RULED_OWNER`) or ruled; FAIL when an offender is this lane's. Detail adds **`mode`, `offendersThisLane[]`,
  `offendersOtherLaneOrRuled[] { id, cls, owner }`, `r47SkipReplaced[]`, `r48aClauses[]`**. Seals with no carried row are no
  carried observation.

### 2.5 `tools/gates.r5.carried.mjs`

- **A9-perf-budget** (R45): quiet = 1-min load < 3 **and** 0 other gate Chromes; otherwise the fps term reports
  **`PENDING-quiet-box (R45): …`** whatever the median read; draws < 350 always graded.
- **A73-sample-bank** (R48 a): detail **`clauses {}`, `skipReplacedClauses[] { clause, ruling, owner, kinds, missing }`**; the
  per-kind voice seeds are reported, every other clause graded.
- **24 visual rows** gain `reference: 'reference/r5/gates-perf/<slot> (A-reference-set, …)'` (B.3).

### 2.6 `tools/r5-refs/slots.mjs`

24 new slots (37 in all), each `{ lane: 'gates-perf', slot, gates[], subject, query, file }` (B.3).

### 2.7 Registration / auto-discovery

Unchanged: `tools/gates.config.mjs` imports every `tools/gates.r5.*.mjs` by pattern (A-gates-autodiscover), so
`node tools/gates.mjs --port 5255 --lane gates-perf` runs the 13 rows. On a tree without it (main, until this merges):
`node tools/gates.mjs --port <p> --extra tools/gates.r5.gates-perf.mjs --lane gates-perf`.

## 3. Honest gaps

1. **The bars still fail; they move to the global run.** The three W0b instruments pass as instruments (R48 b), and their bars
   are reported. The bars bind at the orchestrator's 5270 run and fail in this tree on other lanes' code:
   - render targets 437.75 MB > 170 (engine-gpu's tier is not merged here);
   - the GPU process 1,527.4 MB > 1,500;
   - the src total 121,775 KB/s > 64 (it binds only when every owner has a date, R48 c);
   - the post-GC slope.
   A21's GPU term and A9's fps term wait for a quiet box (R45).
2. **The baseline guard on an unchanged build.** Two consecutive A-alloc-rate runs with a single-run baseline (dev ledger,
   05:35 and 05:37Z):
   - 15 of 17 owners stayed within 1.10 x;
   - `frozen-machine-rig` read 1.36 x per frame and 1.30 x per second (49.8 → 67.6 KB/frame);
   - `frame-loop` read 1.20 x / 1.14 x on 0.2 KB/frame.
   So a baseline recorded from ONE run will flag owners on an unchanged build. The recording method is the orchestrator's
   call (§4). `=merge` records the larger number of several runs per owner, and the recorded runs stay listed in the file.
   I did not add a noise floor or widen the 1.10.
3. **A-carried-suite cannot PASS in a lane run.** By R48 (d) it reports PENDING-orchestrator. Its offenders on this build:
   - A90b (instruments-core, R34);
   - A9 (R45 quiet box);
   - V21 (awaiting the orchestrator's R29 judge; my advisory reading is a PASS, A.2).
4. **The box.** Every run of this round was loud. The monitors read 1-min load up to 6.65, another lane's gate Chrome
   alive most of the time, and a quiet fraction of 3–20 % (against the baseline's 39 %). A-unattributed-cap, the instruments' self-tests and the
   reference gates are box-independent by construction. The GPU control is the noisiest self-test, because the footprint is a process-wide reading. Over the 7 runs of
   this round it read 0.946, 1.027, 1.058, 1.089, 1.292, 1.357 and 1.485 x against its 0.75–1.6 band, and the fall after dispose
   read 0.80–1.12 x. A run above 1.6 x would fail the instrument. On a quiet box it should be tighter; if it is not, grading the
   fall instead of the rise is the fix (§4).
5. **Weak references.** `gathered-limbs.jpg` is a whole Muybridge plate (24 small frames on a margin). `ridge-skyline.jpg`
   carries a building and a rainbow in the foreground. `field-book.jpg` is an expense ledger rather than a survey book.
   These are SKIP-replaced rows: their absorbing lanes should replace them with their own (§4).
6. **The R49 acceptance is by id.** A-reference-set accepts engine-gpu's V20, V33b and V-gpu-tier-look with no
   `reference/r5` file because R49 names their in-sheet controls. Any other row of any lane must name a file.
7. **The context-graph walk is bounded.** It covers depth ≤ 7 and ≤ 400 k objects; this build reached 187,124. A GL object
   held only by a closure, or deeper than that, would show in `unattributed`, which is 0 bytes today.
8. **Instrument seals from before the final source.** The seal hook hashed the instrument code at module load before its
   hash helper was initialised, so it recorded null. Fixed with `createHash`, one line. As a result, the instrument seals of
   the final full suite (`p5255-22029-…`) and the first final lane block (`p5255-92940-…`) read "changed during the run" in
   `--instruments`, although their rows passed. The lane block ⟪LANESEAL⟫ re-ran on the final source and is the verified seal.
9. **Carried over from earlier rounds:**
   - the semaphore write tracer does not see worker threads;
   - A-gates-autodiscover writes two probe lane files into `tools/` for about 1.5 s;
   - the baseline's own evidence is gone, and the file is anchored by git;
   - anyone with this machine's account can forge the ledger (the orchestrator holds the ledger it grades and the key it
     trusts).

## 4. What other lanes and the orchestrator must do

No grant is requested. Fix round 2's requests for W0b grants on `collision.js`, `nav.js`, `clipLayer.js` and `gait.js` are
withdrawn: R46 and R48 (c) refuse them. The frozen hot spots go to the §11 W1 perf-hygiene grant, and `engine.js` to the §11
engine follow-up grant.

| who | what |
|---|---|
| **orchestrator: merge** | Part A (§5.1) can merge first; Part B (§5.2) is additive. Then merge engine-gpu's W0b tier and instruments-core's W0b A90b fix. |
| **orchestrator: W0b global run, port 5270** (quiet box, one Chrome) | <ol><li>`CAL_GATE_LEDGER=<a ledger you hold> CAL_ALLOC_RECORD_BASELINE=1 node tools/gates.mjs --port 5270 --only A-alloc-rate,A-vram-ledger,A90-abs` records the R48 (c) baseline and grades the binding bars. Add `CAL_ALLOC_RECORD_BASELINE=merge` runs if you record over several runs (B.4).</li><li>Commit `tools/gates/alloc-baseline.json`.</li><li>`node tools/gates.r5.gates-perf.mjs --instruments --port 5270` verifies the seals.</li><li>`--lane carried` once, then `--only A50b-aim-on-drawn-geometry` until its first 5 observations decide.</li><li>The V21 judge (next row).</li><li>`CAL_ORCHESTRATOR_PUBKEY=<your key> node tools/gates.mjs --port 5270 --only A-carried-suite` in an invocation of its own (graded on 5270, not PENDING).</li><li>After hero-body's exit, add `CAL_SHADOW_EXITED=hero-body`.</li></ol> |
| **orchestrator: R29 judge for V21** | Keygen and register are unchanged: `--judge-keygen`, `--judge-register --port 5271`. The judge: `--judge --list --port 5270`, then `--judge --seal <id> --id V21-camera-cover --pass true\|false --rationale "…" --judge-name <who> --port 5271 --judge-key judge.pem --reference reference/r5/gates-perf/chase-camera.jpg`. |
| **orchestrator: decisions** | <ol><li>The baseline-guard metric: both KB/frame and KB/s over 1.10 x (B.4).</li><li>Whether the W0b baseline is recorded from one global run or from the larger of several (`merge`). On an unchanged build, two consecutive runs flagged 2 of 17 owners (B.4).</li><li>If A90-abs's GPU control leaves its 0.75–1.6 x band on the quiet box: grade the fall after dispose instead (§3 gap 4).</li></ol> |
| **engine-gpu** | **A-vram-ledger / A90-abs / A21.** Merge the W0b tier: your report gives render targets 127.27 MB at DPR 1.25. Here, at the shipped `high` (DPR 1.5), the census attributes 437.75 MB of render targets to the 23 ledger rows, including `post:scene` (194.40 MB; 2400 x 1350 x 4-sample MSAA colour + depth), the CSM cascades (3 x 33.55 MB), `post:pingA`/`pingB` and SMAA `edgesRT`/`weightsRT` (4 x 25.92 MB). File:line: `src/core/engine.js` `renderTargetLedger()` rows (the tier's DPR cap, GTAO resolution and AA). **A-alloc-rate** (no lane after W0b; §11 engine follow-up grant at W1 launch): `engine.js:273` `ScenePass.render` → `renderer.render`, three re-deriving a program key every frame (a material whose `version` changes per frame, or a light or shadow toggled per frame); `engine.js:1352`, the cull pass's `scene.traverse((o) => …)` closure. |
| **instruments-core** | **A90b** (R34): 24 Bones from `autorig.js:75` held after 30 Tiller kills in this tree; your unmerged W0b fix records 0, 3 of 3. **A73**: the voice-seed clause is SKIP-replaced (audio W3, R48 a). Allocation (graded by your `A-alloc-machines`, R46): `machines/index.js:533`, `ai/attacks.js:529`, `machine.js:2237` `_updateEyes`, `:1771`. |
| **world-ground (W1; terrain.js bars bind at W1)** | `terrain.js:87`: `const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];` allocates an array and an iterator on every `noise2D` call; `const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;` removes it. `getHeight` (`terrain.js:1860`) has no allocation of its own: its share is most likely `noise2D` inlined into it (re-measure after the fix). `vegetation.js:117` and `:889` `_fillChunk`. |
| **§11 W1 perf-hygiene grant (frozen; outputs bit-identical)** | `collision.js:835` `_meshPush` builds a new `shapecast({ intersectsBounds, intersectsTriangle })` object and two closures per sample, three samples per call: hoist one callbacks object with its state in module scope. `collision.js:888` `raycast`, `:1099` `occluded`, `:679` `sphereQuery` (`gkey()` per cell); `nav.js` `steer` `:579`; `anim/clipLayer.js:417` (`mixer.update` per layer); `locomotion.js:236`; `boneSpace.js:318`; `gait.js:889`, `:1385`, `:1322`; `rig/lod.js:1345`. |
| **melee (W1; playerAnimator.js bars bind at W1)** | `_springs` `playerAnimator.js:3708`, `update` `:1168`, `_twistLayer` `:3569`; `meleeLayer.js:5003` `segPoint`. A100–A107 are SKIP-replaced (melee W1, R47) in A-carried-suite until you shadow them on Brea with the lance. |
| **world-props (W1; fauna.js bars bind at W1)** | `fauna.js:833`. `castStage` and `meleeSlope` join the `gatePlaces` contract. |
| **shell-ui (W2), settlements (W2), audio (W3)** | The allocations in the B.5 table bind from your exits. Re-stage V10 / V36 / V37 / V38 / V45 against the field-book, surveyor and salt-pan references named in B.3, or name better ones under `reference/r5/<lane>/`. |
| **every lane** | <ul><li>Name every top-level scene child for its §4.2 row. An unnamed root counts against the unattributed-draw cap, and its GPU bytes land in "unregistered scene root" in A-vram-ledger. Today that is 0.21 MB from the unnamed `src/combat/particles.js` roots.</li><li>Every V gate you add names a reference under `reference/r5/**` with a MANIFEST row, because A-reference-set now grades every lane file. engine-gpu's V20, V33b and V-gpu-tier-look use their in-sheet controls (R49).</li></ul> |

## 5. Files changed (this round)

`git status --short` at the end of the round shows ⟪STATUS⟫. The orchestrator's WIP checkpoints (`46ab9ab` 04:55Z through
`09a016d` 08:55Z) committed the rest as it landed. This round's diff is `git diff fbb2a04 -- tools reference
docs/ROUND5-GATES-PERF.md`: 30 files, about +1,124 / −157 (24 new JPEGs).

`docs/ROUND5-PLAN.md` also differs from `fbb2a04`. That is the orchestrator's sync of R49–R51 into this tree, not an edit of
mine.

### 5.1 Part A (merge first)

| file | change this round |
|---|---|
| `tools/gates.r5.carried.mjs` | <ul><li>A9: R45 quiet test, `PENDING-quiet-box (R45)`.</li><li>A73: R48 (a) voice-seed clause listed, the rest graded.</li><li>A79: race-free closed-fd self-test (`fstatSync` import).</li><li>A71c: stand-off chosen clear of the ui-06 clamp.</li><li>24 visual rows name their reference.</li></ul> |
| `tools/gates.r5.gates-perf.mjs` | <ul><li>A-carried-suite: R47 class, `pendingQuietBox`, `RULED_CLASS_OWNER`, PENDING-orchestrator (R48 d), carried-only observations.</li><li>Seals for instrument runs, with `instrumentRows` / `instrumentSource` / `scope`; `CAL_RUN_ID`; the `--instruments` CLI.</li><li>A-chrome-semaphore: per-child reasons, and a box refusal reports PENDING.</li></ul> |

### 5.2 Part B

| file | change this round |
|---|---|
| `tools/gates/gates-perf.w0b.mjs` | <ul><li>A-alloc-rate: every byte in a named owner, the planted allocator, per-owner rows, the R48 (c) guard, record and schedule, instrument vs bars.</li><li>A-vram-ledger: framebuffer and array-to-buffer census, attribution, known-object controls.</li><li>A90-abs: footprint split, live-heap attribution, known-delta controls.</li><li>A-reference-set: every visual row of every lane file, R49.</li><li>`INSTRUMENT_ROWS` export.</li></ul> |
| `tools/budgets.mjs` | `MEMORY_BUDGETS.alloc`: `baselineGuard`, `baselineFile`, `controlTolerance`, `controlWindowS`, `owners[]` (R48 c's schedule) |
| `tools/r5-refs/slots.mjs` | 24 new slots; intro text |
| `reference/r5/gates-perf/*.jpg` + `MANIFEST.md` | 24 new licence-clean references (B.3) |
| `docs/ROUND5-GATES-PERF.md` | this report |

No file outside the §2 row was edited. The harness grant files (`gates.mjs`, `screenshot.mjs`, `chrome-profile.mjs`) are
untouched; their 40-line budget is spent. No asset was added under `public/`, so there is no `LICENSES.json` row: the
references are tooling, never shipped, and their provenance is in their MANIFEST.
