# ROUND 5 — lane `gates-perf`, wave W0a (foundations), after fix round 2

Port 5255. Tree `scratchpad/r5/gates-perf/tree` (branch of `9d3b891`). Plan rows: §2 gates-perf,
§1.2 harness grant, §3.1 W0a exit, §3.2 `tools/gates.r5.carried.mjs`, §6 W0a deletes, §9 gates-perf.

## Result (Oct 16, port 5255)

**Lane block**: `node tools/gates.mjs --port 5255 --lane gates-perf` gives **4 PASS, 2 FAIL**
(`shots/gates/report.p5255.json`, 15:31Z; copy `scratchpad/r5/gates-perf/work/r2/report.lane.final.json`).

- PASS: `A-gates-no-hero-literals`, `A-gates-autodiscover` (8/8), `A-port-guard`, `A-chrome-semaphore`.
- FAIL `A-gate-preludes`: on **brand's** `tools/gates.r5.brand.mjs` only (`'strider'` :151, `{ x: 18, z: 26 }`
  :189). Every file this lane owns is clean under the widened scans, and the scanner's own controls pass.
- FAIL `A-carried-suite`: graded **three sealed carried runs** of this tree on one build (13:12Z, 14:19Z,
  15:26Z). It fails on **5 rows that failed in at least one run** (A13, A17, A19, A21, A31c), **1 unattributed
  PENDING** (A33, run 2) and **27 visual rows awaiting an R29 verdict**. Every offender names its owner.

**Carried suite, three sealed runs** (`--lane carried`, 236 rows each, 66–67 min each, load 3–15):

| run (seal) | PASS | FAIL | PENDING | NEEDS-JUDGE | FAIL rows |
|---|---|---|---|---|---|
| 1 `p5255-20261016131209250-7949` (12:05–13:12Z) | 134 | 3 | 62 | 37 | A13 (0.0828 m), A21, A31c |
| 2 `p5255-20261016141941392-46562` (13:12–14:19Z) | 132 | 3 | 64 | 37 | A19 (6.05 m/s), A21, A31c |
| 3 `p5255-20261016152650208-78807` (14:19–15:26Z) | 132 | 4 | 63 | 37 | A17 (3 flourish frames), A19 (5.86 m/s), A21, A31c |

Graded across the three: **129 PASS in every run**, 72 named SKIPs (32 `SKIP-legacy-deleted (R30)`, 40
`SKIP-R18`, 10 of them filmed SKIP cards), 2 attributed PENDINGs (A9, A31), **5 FAIL, 1 unattributed PENDING,
27 awaiting R29**. Six rows differ between runs: A9, A13, A17, A19, A31, A33.

**Global green list (the items that exist at W0a), from the same three runs:**

| gate | result |
|---|---|
| `A1-boot-clean` | PASS ×3 |
| `A20b-no-system-errors` | PASS ×3: 0 system errors, 0 hook errors (314 / 225 / 170 frames) |
| `A90-memory-stability` | PASS ×3: 30 kills → 30 respawns of `kinds[0]` each run. Geometries +13 / +11 / +12 (bar ≤ 40), textures −19 ×3 (≤ 8), objects −527 / −527 / −526 (≤ 60), heap −9.5 / −6.3 / −2.6 % |
| `A90-memory-stability-expansion` | PASS ×3: 30/30 respawns, non-machine growth 0, orphan roots 0, heap +1.4 / −1.3 / −1.2 % |
| `A90b-memory-attribution` | PASS ×3: 30/30 respawns, 0 offenders |
| `A90-rig-reclaim` | SKIP-R18 ×3 (no role resolves; every-kind gate, R7/R28) |
| `A9-perf-budget` (R26) | PASS 59.9 fps (load 6.97), PENDING 31.0 fps (load 7.32, contention witnessed), PASS 59.5 fps (load 7.24); draw calls 319 ×3 (< 350). A loud box can only lower fps, so the gate PASSes a median ≥ 58 at any load and PENDs below it unless the box is quiet |
| `A21-real-draw-calls` | **FAIL ×3** on the GPU term: median GPU 108.2 / 96.0 / 94.3 ms against the §9 re-cast 14 ms, attributable (null frame 0.72 / 0.67 / 0.66 ms). Draws 319 (≤ 350), triangles 4.24 M (≤ 6.5 M) PASS; frame and JS p95 PENDING (not attributable). Herd and staged fight SKIP (R18/R30) |
| `A-port-guard` | PASS |
| `A-carried-suite` | FAIL, as above |

`A90-abs`, `A-alloc-rate` and `A-vram-ledger` are this lane's W0b work. The other green-list gates belong to
other lanes and do not exist in this tree.

---

## 0. Fix round 2 — what changed, by finding

Eight findings. No bar moved, no gate loosened, no exemption list. Every change below is in a file this
lane owns; the 40-line harness grant is untouched.

| # | finding | what changed | measured now |
|---|---|---|---|
| 1 | A-carried-suite FAILs: 5 FAIL rows + 27 unjudged visual rows; a judge graded 14 visual FAIL | (a) **Routing**, row by row, §4: every offender names its §9 owner and the plan ruling, in the gate's detail. (b) **Staging I own**, re-filmed and read (§1.3): `V7` showed no skyline (a beige wall: the crest sits 21–39° above every station), now a fixed lens on `gatePlaces.ringSkyline`; `V1`, `V3`, `V12` hid her legs and feet in meadow grass, now the vegetation is hidden as in V13/V14. (c) The judges' verdicts cannot be written by this lane (R29): the judges write them into the ledger with `--judge` (§1.5), bound to the sealed frames of the newest run. | Three sealed runs: 5 rows FAIL in at least one run (A13 1/3, A17 1/3, A19 2/3, A21 3/3, A31c 3/3), A33 unattributed PENDING 1/3, 27 visual rows awaiting R29. A45 (worst 0.023 / 0.047 / 0.049 m vs 0.06) and A100 PASS in all three runs this time. Re-filmed and read from the run-1 seal: `V7` now frames the ring's crest against sky across the frame (varied peaks; the banding on the faces is world-ground's to judge); `V1`, `V3`, `V12` show her legs down to the boots. What the body does is unchanged and is hero-body's: V3 reads as a standing walk (full height, not 60 %); V1 and V12 are for the judge (V12's rear foot is on the ground line with a forward lean). V38's new criteria FAIL the frame (HORIZON ZERO CLAUDE). |
| 2 | A-gate-preludes FAILs on brand's gate file | Cross-lane: this lane may not edit `tools/gates.r5.brand.mjs` (rule 1). §4 gives brand two exact replacements. The gate keeps failing on it. | FAIL on `gates.r5.brand.mjs` only: `'strider'` (:151) and `{ x: 18, z: 26 }` (:189). |
| 3 | A-gate-preludes missed A25b's nav legs (4-number arrays) | (a) A25b re-staged: legs from `PLACE('navLegs').legs`, the late-blocker probe at `PLACE('navProbe')` (2 new places, §5). (b) The coordinate vocabulary is no longer only the W0 table: it adds every ABSOLUTE placement in the 28 archived Round-4 gate files (`.set(x,y,z)`, `px=&pz=`, 2-D `{x, z}`, `new V(x,y,z)`, `spawn(k, x, z)`, both ends of every `[x0,z0,x1,z1]` leg list): 42 pairs. (c) Structural patterns: a pair as a call, an array, either half of a leg, a 3-arg call, an object, a URL. (d) Any LITERAL placement (`x: N, z: N`, `position.set(N, y, N)`, `.spawn*(k, N, N)`, `px=N&pz=N`, \|N\| ≥ 10) counts whatever map it names. (e) A positive + negative control runs inside the gate: 6 Round-4 forms built from the table at run time must hit, 4 non-coordinates (distance bands, a 3-D listener point, a band list, a tolerance tuple) must not. | The old A25b line is caught (8 pairs, `gates.r5.carried.mjs:14404`) before the re-stage, 0 after. Control: 6/6 hit, 0/4 false hits. In the other W0a trees (read only), `gates.r5.instruments-core.mjs` will FAIL after merge on 16 kind literals and the literal placement `x: 120, z: 40`. |
| 4 | A-chrome-semaphore's child runs overwrite `report.p<PORT>.json`, so A-carried-suite graded an older report | (a) Nothing A-carried-suite grades lives in the tree any more: each carried run copies its own report and frames into the **run ledger** as it exits (§1.5). (b) A-chrome-semaphore keeps `report.p<P>.json`, `report.p<P>.md`, `report.json`, `report.md` and `A1-boot-clean.png` byte for byte with their mtimes, and puts them back after its child runs. (c) A-carried-suite's verdict line names every run it graded (seal id, stamp, load). | Lane run: `treeReportsAfterChildRuns` = all 5 files "restored"; `A1-boot-clean.png` sha256 `0d490a83…` and mtime unchanged across the lane run. A-carried-suite graded the three ledger runs while the semaphore's 4 child runs rewrote and restored the tree's files: "graded 3 sealed runs: p5255-…78807 (…, load 4.88→14.87); p5255-…46562 (…); p5255-…7949 (…)". |
| 5 | W0a exit not met; which rows FAIL changes run to run | (a) **A-carried-suite grades every sealed carried run of the current build, at least 3** (`CAL_CARRIED_RUNS` raises the floor, never lowers it). A row must hold in every one; the runs it failed in stay in the record until the build changes, so retrying until three lucky runs line up does not pass. Rows whose status differs between runs are listed under `flaky` with each run's status; a SKIP in one run and a staged result in another is `stagingFlaky` (FAIL). (b) Three sealed carried runs on 5255 this round, back to back on one build. (c) Routing of A13 / A17 / A19 / A31c / A45 / A100 / A9 / A21 in §4. | Graded: 5 FAIL + 1 unattributed PENDING across the three runs (table in "Result"), 6 rows listed as differing between runs. The box was never quiet (1-min load 3.05–14.87). A13: 0.0828 / 0.0014 / 0.0019 m (R27 needs 5/5). A17: 9 / 9 / 3 flourish frames (R11). A19: 6.15 / 6.05 / 5.86 m/s vs 6.12. A33: 59.6 / 33.7 / 24 Hz sampling, PENDING without attribution at 33.7 Hz. |
| 6 | Re-staged criteria still cite HZD/HFW stills and the HORIZON wordmark | V47 → `reference/r5/gates-perf/lance-windup, lance-strike, lance-follow`; V48, V49 → `reference/r5/gates-perf/lance-back-carry` (the HFW-still note in V48 is gone); V46 → `lance-ready-side`; all four carry a `reference` field like V12/V24. V38 → "exactly ONE wordmark, and it reads CALIMA as bible §9.8 draws it … any other wordmark is a FAIL" (brand's W0b shadow re-stages it). V45 → "a conversation card … the NPC being spoken to". A101 and A104 detail text cite `docs/research/spear-canon.md`, not a still. **A-gate-preludes now scans** every carried row's and every visual row's title / criteria / reference for `hzd`, `hfw`, `horizon zero`, `horizon forbidden`, `nora`, the old hero's name (read from the plan's A-gates-no-hero-literals regex, so this lane's file does not spell it) and any non-`reference/r5/` still (`spear-*.jpg` + every file in `reference/`), and every carried row's code for still basenames; its control must see the Round-4 originals in the archive. §1.3 is corrected. | Scan: 0 hits (before the edits: V38, V45, V47, V48 ×2, V49, A101, A104 — exactly the judge's list plus the two action rows). Control: the archived player-melee, progression-expansion and shell-menus files are all seen. |
| 7 | A-carried-suite could grade a stale or forged report; A-chrome-semaphore destroyed an un-adopted report | (a) **Seal** (written by the harness process at exit, §1.5): report sha256, every frame's sha256, git HEAD, and a **build fingerprint** (size + mtime of every file of `src/`, `public/`, `index.html`, `vite.config.js`, `package.json`, the harness and every file that defines a carried row) at the start AND the end of the run. A run whose build changed during it never counts; a run whose build changed since is stale. (b) **Hash-chained, append-only ledger** outside every tree (`$TMPDIR/cal-gate-ledger`, or `CAL_GATE_LEDGER`; the gate and the CLI refuse a ledger inside any worktree): an edited, deleted or re-ordered line FAILs the gate naming the line; a run whose report copy is gone or edited is TAMPERED and FAILs the gate. (c) **Verdicts** are ledger entries bound to (seal, row, frame sha256), refused from a non-judge port or from the run's own port. (d) **Refuses to grade inside a run that executes carried rows.** (e) The report-adoption code and `report.carried.p<P>.json` are gone. | Mechanics, on a scratch ledger: report copy edited → "FAIL: 1 sealed run … tampered with after sealing (its report copy does not match the seal)"; one ledger line edited → "FAIL: … broken at line 2: its hash does not match its text"; a gate source touched after the run → "0 fresh sealed carried run(s) … stale: the build changed after the run (newest file now tools/gate-speeds.mjs …)"; a verdict from 5255 → refused by the CLI ("judged on the port that ran the suite"); a 5-character rationale → refused. `--only A1-boot-clean,A-carried-suite` → "FAIL: refused — this invocation also executes 1 carried row(s) (A1-boot-clean)". |
| 8 | Kevin's 5173 dependency cache, unverified | Not a lane's to touch (rule 6): §3 gap 6 states what the files show, read only. A-port-guard's cache half now also checks **every worktree** of the repo (`git worktree list`): a tree whose `node_modules/.vite` resolves into the main repo FAILs it. It reports, ungraded, who last optimized main's cache. | All 4 lane trees have their own `node_modules/.vite`. Main's cache: 14 optimized deps + 6 chunks, all files present, matching exactly the 14 bare imports of main's `src/`. **Its module comments start `../../../../../../../../../Users/kevinliu/Horizon…`**: it was optimized by a Vite whose cwd was outside the main tree (rooted at this lane's tree, this lane's or its judge's, 22:34–22:36 Oct 15 local time), so its content-hashed chunk names differ from what the 5173 server wrote. The orchestrator or Kevin should restart the 5173 Vite with `--force` (or confirm a hard reload). Watch over this round: 12:05:19Z–15:34:35Z, 6,148 samples every 2 s over the three carried runs and both lane runs: 0 gate connections to :5173, 0 rewrites of main's `_metadata.json`, 0 errors. |
| — | found while fixing | (a) A shadowing lane row was dropped from `--lane carried` (its lane is the lane's), so the carried suite would have gone dark on every absorbed row at W0b: it now runs there too (§1.2). (b) A-port-guard's leak check counted any new Chrome on the box; it now counts only Chromes on the control harness's own profile (`cal-<control pid>-…`) and new Vites on the port. (c) Visual rows staged in one run and SKIP-carded in another were accepted; now `stagingFlaky`. | `A-gates-autodiscover` 8/8 (new: `shadowRowRunsInCarriedSuite`). |


---

## 1. What was built

| item | file(s) | status |
|---|---|---|
| port guard, machine-wide Chrome semaphore, disk/memory preflight | `tools/chrome-profile.mjs` (+34 / −1), `tools/gates.mjs` (+3 / −2), `tools/screenshot.mjs` (+3 / −2) — **40 lines** (§1.2 budget ≤ 40; untouched in both fix rounds) | live in both harnesses |
| r5 gate auto-discovery, shadow-by-id, shadow rows kept in `--lane carried` | `tools/gates.config.mjs` | live |
| the carried Round-4 suite | `tools/gates.r5.carried.mjs` (236 rows) | live |
| **the run ledger**: run seals (exit hook), R29 verdicts, frame copies — outside every tree | `tools/gates.r5.gates-perf.mjs` (§1.5) | live |
| role prelude ("who") + the A90-family workload helpers | `tools/gate-roster.mjs` | published |
| place prelude ("where") + W0 map table (28 places) | `tools/gate-places.mjs` | published |
| PERF_SCENARIOS re-cast by role and place; `BUDGETS.gpuMedianMs = 14` | `tools/budgets.mjs` | live (A21 runs on it) |
| this lane's W0a gate block, the `--watch-5173` and `--judge` CLIs | `tools/gates.r5.gates-perf.mjs` | live |
| Round-4 gate files archived | `tools/gates/archive/` (28 originals from `HEAD` + README; nothing loads them; A-gate-preludes reads them as the coordinate vocabulary) | done |
| §6 W0a deletes (no runtime reader) | `public/anims-{hybrid,reskin,retarget}/**` (12.0 MB), `labs/**`, `spike-*.html`, `tools/spike-*.mjs`, `tools/scratch/*` | deleted |
| the 12 DIES gates | removed from the sources before generation (plan §6) | gone |

### 1.1 Harness grant (plan §0 rules 6 + 8, §1.2)

`tools/chrome-profile.mjs` exports, used by both harnesses:

```js
guardPort(raw: string|undefined): number        // exits 2 with "[port-guard] refused port …" unless raw is an
                                                // integer in 5250-5271 or 5280-5299 (5173 never; 5272-5279 reserved)
preflight(env = process.env): { ok, why, freeGB, memFreePct }
                                                // free GiB on /System/Volumes/Data (statfs) < 3 or `memory_pressure`
                                                // free < 25 % -> ok:false. CAL_PREFLIGHT_FREE_GB / CAL_PREFLIGHT_MEM_FREE_PCT
                                                // simulate a reading (the gate uses them)
acquireChromeSlot(): Promise<{ ticket, rank, queue }>
                                                // FIFO ticket queue under <PROFILE_ROOT>/chrome-semaphore: a ticket is
                                                // `pid|ps lstart`; the first CHROME_SLOTS live tickets may run a Chrome.
                                                // A SIGKILLed or recycled pid's ticket is dead (lstart mismatch) and is
                                                // skipped, then removed. Re-checks the preflight on every call and throws
                                                // Error('infra: preflight refused to launch Chrome: …') when it fails.
releaseChromeSlot(): void                       // also runs on process 'exit' (and so on SIGINT/SIGTERM via
                                                // installProfileCleanup)
CHROME_SLOTS = min(2, max(1, CAL_CHROME_SLOTS || 2)); SEMAPHORE_DIR
```

- `gates.mjs`: `const PORT = guardPort(getFlag('--port', process.env.SHOT_PORT))` (no default; was `'5173'`),
  `await acquireChromeSlot()` first thing in `launchBrowser()`; the slot is held from the first launch to
  process exit, across relaunches.
- `screenshot.mjs`: the same guard; `await acquireChromeSlot()` before `puppeteer.launch`.
- The semaphore root is the profile root (`$TMPDIR/cal-chrome-profiles`, or `CAL_CHROME_PROFILE_ROOT`), i.e.
  machine-wide for every tree. It only counts processes that run this code: until the orchestrator merges
  this lane, the other lanes' harnesses take no tickets.

### 1.2 Registry and auto-discovery — `tools/gates.config.mjs`

Exports `GATES`, `LANE_FILES`, `LANE_FILE_RE = /^gates\.r5\.([a-z0-9][a-z0-9-]*)\.mjs$/`,
`LOAD_FAILURES`, `CONFLICTS`, `SHADOWED`.

- Every `tools/gates.r5.<lane>.mjs` (except `carried`) is imported by pattern; adding a lane file needs no
  edit anywhere.
- **Shadow by id**: a lane row whose id equals a carried row's id replaces it in place (`shadows:
  'gates.r5.carried.mjs'`). Two lane files with one id: first wins, `CONFLICTS` + stderr.
- **A shadowing row still runs in the carried suite** (fix round 2): under `--lane carried` it takes lane
  `carried` (its own lane kept in `shadowLane`), so `node tools/gates.mjs --lane carried` never drops a row a
  lane has absorbed; `--lane <its lane>` still selects it. `A-gates-autodiscover` checks both.
- **A lane file that does not load is a FAIL row** (`LOAD-FAIL:<file>`, kind `runner`, in that lane).
  Every `gates.r5.*.mjs` must export a `GATES` array (a helper module exports `GATES = []`).
- **Rows keep their accessors**: a row may define `get assert()` (A9 reads the load average when it runs).
- `--extra tools/gates.r5.<lane>.mjs` keeps working after the merge (one "duplicate gate id" line per gate).
- `node tools/gates.mjs --port <p> --lane carried` runs the carried suite; `--lane gates-perf` this block.

### 1.3 The carried suite — `tools/gates.r5.carried.mjs`

236 rows = every CARRY (55) and RESTAGE (181) gate of `docs/ROUND5-INVENTORY.md` Appendix B; the 12 DIES
gates were deleted. Each row carries `lane: 'carried'`, `r4Lane`, `r4Source`, `absorbedBy` (the §9 shadow
table) and `requires: { roles, places }`.

| Round-4 coupling | Round-5 mechanism | rows |
|---|---|---|
| a machine kind literal | `staged(['<role>'], …)` + `stageRole/liveOf/spawnRole/KIND.<role>`; "every species" → `stagedPicks()` / `STAGED_KINDS` (non-legacy only, R7 + R28); size-class bars (A54, A76) from body length (R24) | 77 rows use the roster |
| the A90 family's respawn kind | `memRespawn` / `memWorkload` / `memRespawnAfter` / `memWorkloadVerdict` (Appendix B "kind swap": a role's kind, else `ctx.machines.kinds[0]`; every kill respawned; never kill-only) | A90, A90b, A90-expansion |
| an old-map coordinate | `placed([...], …)` + `PLACE(name)` / `standAt(p, name)`; 28 named places | 74 rows use places (A25b's nav legs and late-blocker probe joined in fix round 2) |
| a rig bone / dyn_ chain literal | `HERO`: `HB(key)` / `HBN(key)`, `chainOf(cls)`, `chainLink(cls, i)` | 11 rows (16 read bones via the animator) |
| a quest / NPC id that the W0a removal deletes | A65-save-restore-expansion picks its three side quests by objective SHAPE from `prog.QUESTS` and its two speakers by having a topic | 1 row |
| the old hero's name in an API key / DOM id / set name | discovered, not named (A26, A79b, A73b) | 3 rows |
| an HZD/HFW reference still | **fix round 2 (corrected):** every visual row that is judged against a reference names a `reference/r5/gates-perf/<slot>` file of `A-reference-set` (W0b) in a `reference` field and in its criteria; no row names an HZD/HFW basename. Until the slot exists the R29 judge has no reference and the row cannot PASS (R29). The round-1 text claimed V47–V49 already pointed at a licence-clean set; they still named `spear-light-*.jpg` and `holster-back-hfw`. | V12, V22, V24, V46, V47, V48, V49 |
| the old IP in criteria | V38 now asks for the CALIMA wordmark (bible §9.8; brand re-stages the row at W0b), V45 for "a conversation card … the NPC being spoken to" | V38, V45 |
| bars that a ruling restated | A9 → **R26** (median fps ≥ 58 on a quiet box, load average < 3; draws < 350 always); A21 GPU term → **§9 re-cast** (median GPU ≤ 14 ms at the shipped default tier); A34 → R19; A54 → R24 | |

One id was renamed because the Round-4 id named the old rig: `A73b-<rig>-effort` → **`A73b-hero-effort`**.

**Staging that changed in fix round 2** (the frame must show the row's subject):

- `V7-vista-mountains`: a fixed lens on `gatePlaces.ringSkyline` looking up at the ring's crest on the
  Round-4 bearing. The chase camera at the Round-4 pitch never had the skyline in frame: the crest sits 21–39°
  above every station (measured on 7 stations × 12 bearings), so the W0a frame was a beige wall with no sky.
- `V1-sprint-frame`, `V3-crouch-stalk`, `V12-sprint-vs-reference`: the vegetation group is hidden, as the
  Round-4 V13/V14 recipes already did. The meadow grass hid her legs and feet in every W0a frame, so V12's
  clause (1) and V3's silhouette could not be judged.

**SKIP semantics (never PASS).** A row whose staging cannot resolve returns `pass: null` with a labelled
detail: `SKIP-legacy-deleted (R30)`, `SKIP-legacy (R28)`, `SKIP-R18`. Visual rows that cannot stage draw a
full-frame **SKIP card** (#101418), so no judge can grade an unstaged frame.

**Scratch storage.** A row that needs scratch localStorage keys across a reload (A65, A65-expansion) reads
and removes them first thing in its assert, and its setup removes them if it throws.

**Mechanics-validation mode** (not a verdict): `CAL_GATE_ROLE_OVERRIDE='{"<role>":"<kind>",…}'`. Every
result is tagged `roleOverride`; A-carried-suite refuses such a run.

### 1.4 The preludes (contracts other lanes consume)

`tools/gate-roster.mjs`

```js
ROLES, ROLE_PENDING, ROLE_OVERRIDE
ROSTER                        // page prelude (splice inside an async body). Defines:
  //   KIND[role] -> kind|null, ROLE_NOTE[role] -> { label, text }
  //   roleSkip(...roles) -> null | { pass: null, detail: '<label>: <named note>' }
  //   liveOf(role, filter?), livesOf(role), spawnRole(role, x, z, opts), stageRole(role, { dx, dz, wait, filter })
  //   STAGED_KINDS, stagedPicks(filter?), noKindsSkip(), anyKind() -> { kind, role, source }, roleOfKind(k)
  //   memRespawn(killedKind) -> { kind, source }      the A90 family's ONE respawn kind (role, else kinds[0])
  //   memWorkload() -> { kills, respawned, respawnFailed, kinds, sources }
  //   memRespawnAfter(W, killedKind, x, z)            respawn after a kill, recorded in W
  //   memWorkloadVerdict(W, minKills) -> null | { pass: null (nothing killed) | false (a respawn failed), detail }
staged(roles, assertExpr): string, stagedSetup(roles, setupStr): string
HERO                          // HB(key), HBN(key), chainOf(cls), chainLink(cls, i), chainBones(cls), HERO_CHAINS
SKIP_CARD                     // __skipCard(detail)
```

`ctx.machines.roles` (instruments-core) may be a plain object, a Map or `{ get(role) }`, with values
`kind | null | { kind, note }`; a mapped kind not in `ctx.machines.kinds` is treated as null.

`tools/gate-places.mjs`: `W0_SIGNATURE`, `W0_PLACES`, `PLACE_KEYS` (the `ctx.props.gatePlaces` contract),
`PLACES` (page prelude: `PLACE(name)`, `placeSkip(...names)`, `standAt(p, name, { dx, dz, yaw })`),
`placed(names, assertExpr)`, `placedSetup(names, setupStr)`. Resolution order: `rest` / `restSite` from
`src/world/island/sites.js`; then `ctx.props.gatePlaces[name]`; then the W0 table while the W0 terrain is
live; else `SKIP-R18 (place)`.

`tools/budgets.mjs`: `BUDGETS` (draws 350, triangles 6.5 M, frame p95 20 ms, JS p95 9 ms, **GPU median
14 ms**), `PERF_SCENARIOS` (`vista` / `herd` / `staged-fight`, cast by role).

### 1.5 The run ledger and the R29 verdict contract (fix round 2; replaces the in-report verdicts)

Nothing A-carried-suite grades lives in a lane tree any more.

```
<CAL_GATE_LEDGER, default $TMPDIR/cal-gate-ledger>/       (the seal hook, the gate and the CLI refuse a ledger inside any worktree)
  ledger.jsonl                 append-only, hash-chained: one entry per line, `<sha256>\t<prev sha256>\t<json>`,
                               sha256 = H(prev + json) over the raw text; an edited, deleted or re-ordered line
                               breaks the chain and A-carried-suite FAILs naming the line
  runs/<sealId>/report.json    the run's report, copied by the run itself as it exits (never pruned)
  runs/<sealId>/<V id>.png     every visual frame the run filmed (frames of all but the newest 4 runs per tree + port are pruned)
```

**Seal** (written by the harness process, never by hand): `gates.config.mjs` auto-imports
`gates.r5.gates-perf.mjs`; inside `node tools/gates.mjs` of the same tree that import installs an exit
hook. A run whose report covers ≥ 80 % of the carried rows is sealed at exit:

```js
{ kind: 'seal', sealId: 'p<port>-<report stamp>-<pid>', tree, port, pid, argv, startedAt, endedAt,
  load: { start: [1, 5, 15 min], end: [...] }, reportStamp, reportSha256, results, carriedRows, gitHead,
  shadowFiles,                  // lane files shadowing a carried id (they define those rows)
  build: { atStart, atEnd },    // { digest, files, newest } over size+mtime of src/**, public/**, index.html,
                                // vite.config.js, package.json, the harness and every file defining a carried row
  frames: { '<V id>': sha256 }, framesNotFilmed: [ids] }
```

**Verdict** (written by an R29 judge):

```
node tools/gates.r5.gates-perf.mjs --judge --list [--port <run port>] [--seal <sealId>]
    the sealed runs of this tree (FRESH or why not), then every visual row of the newest fresh run:
    class (SKIP card / awaiting / judged), the ledger frame path, its sha256, the reference slot, the criteria
node tools/gates.r5.gates-perf.mjs --judge --seal <sealId> --id <V id> --pass true|false \
    --rationale "<against the criteria and the reference>" --judge-name <who> --port <5271 | 5280-5299> \
    [--reference reference/r5/...]
    -> { kind: 'verdict', sealId, id, frameSha256, pass, rationale, judge, port, reference, writer: { pid, ppid, cwd } }
```

The CLI refuses a port that is not a judge port or is the run's own port, a rationale under 20 characters, a
row that is not a visual carried row, and a frame whose ledger copy no longer matches the seal. The latest
verdict for a (seal, row) wins; A-carried-suite reports how many there were.

**How A-carried-suite grades** (`node tools/gates.mjs --port <P> --only A-carried-suite`, in an invocation
that runs **no** carried row — it refuses otherwise):

1. composition: the 236 rows are exactly Appendix B's CARRY + RESTAGE set;
2. ledger chain intact; no sealed run of this tree + port tampered with (report copy gone or edited);
3. the runs graded are **every** sealed run of this tree + port on the **current build** (digest and git
   HEAD equal; a run during which the build changed never counts), at least **3** (`CAL_CARRIED_RUNS` can
   raise the floor, never lower it). Retrying until three lucky runs line up does not work: the runs a row
   failed in stay in the record until the build changes;
4. an action row must be PASS, a named SKIP or a Round-4-attributed PENDING in **every** graded run. A row that
   is a SKIP in one run and staged in another is `stagingFlaky` (FAIL). Every row whose status differs between
   runs is listed under `flaky` with each run's status;
5. a visual row is graded on the **newest** run's sealed frame: an R29 verdict bound to that frame, or the
   frame is the pixel-checked SKIP card; the older runs must have filmed it too;
6. the verdict line names the runs it graded (seal id, stamp, load average).

`CAL_CARRIED_SEALS=<id,id,…>` grades exactly those seals of this tree instead (the orchestrator's record).

## 2. Gate table (measured, port 5255)

| gate | result | numbers |
|---|---|---|
| `A-gate-preludes` | **FAIL** (brand's file) | Scanned `gates.config.mjs`, `gates.mjs`, `gates.r5.brand.mjs`, `gates.r5.carried.mjs`, `gates.r5.gates-perf.mjs`, `budgets.mjs` with 23 kind names (bible §10.2) and **42 old-map pairs** (32 from the W0 table, 2 from `sites.js`, 19 Round-4 placements and 8 Round-4 leg ends read from the 28 archived files; overlaps counted once) plus the literal-placement rule. Offender: `brand (gates.r5.brand.mjs)`: `'strider'`, `(18, 26)` twice (vocabulary + literal). gates-perf files: 0 / 0 / 0. 0 of the 12 DIES ids registered. Of 236 carried rows, 77 use the roster, **74** the places, 11 the hero prelude; 0 unresolved, 0 literal staging. Old-IP / still scan: 0 hits in titles, criteria and references (19 stills known in `reference/`), 0 in carried code. Scanner control: 6/6 Round-4 forms hit, 0/4 false hits, 3/3 archived originals seen. |
| `A-gates-no-hero-literals` | **PASS** | 9 `tools/gate*.mjs` files, 0 hits (the old hero's name in the new IP scan is read from the plan's regex, not written). 16 carried rows read bones through the animator. W3 scope (all of `tools/`): 24 files with hits (archive, audio recipes), reported, not graded. |
| `A-gates-autodiscover` | **PASS** | 8/8 in child processes: discovery by pattern, no lane file named in the config, new id registered, `A1-boot-clean` shadowed, **the shadowing row runs under `--lane carried` with `shadowLane` kept**, broken file → `LOAD-FAIL` row, probes removed. 249 rows with the probes. |
| `A-port-guard` | **PASS** | 16/16 refusals (8 cases × 2 harnesses), each exit 2 with the message and 0 sockets / 0 child processes. Control on 5255: the trap saw `connect` + `spawn npx`; 0 leaked processes (the leak check now only counts the control's own profile and new Vites on the port). Accepted: 5250, 5255, 5269, 5270, 5271, 5280, 5299. Watch 12:05:19Z–15:31:32Z at grading (6,059 samples): 0 gate connections to :5173, 0 errors. Cache half: this tree's cacheDir is its own; **all 4 lane worktrees** have their own `node_modules/.vite`; 0 rewrites of main's cache during the watch. Reported: main's cache was last written by a Vite outside main (§3 gap 6). |
| `A-chrome-semaphore` | **PASS** | (a) 4 real `gates.mjs --only A1-boot-clean` at 1 slot: 4/4 PASS, 3 waited, **at most 1 Chrome over 376 samples**. (b) 4 stand-ins at 2 slots: **at most 2 alive**, every exit 0, 0 tickets left. (c) SIGKILL release: B blocked while A held the slot, finished 0.681 s after `kill -9 A`. (d) Preflight at simulated 2.5 GB disk and 20 % memory: both harnesses exit 1 with "preflight refused to launch Chrome", 0 Chromes. (e) The 5 tree report files its children overwrite: all restored. |
| `A-carried-suite` | **FAIL** | Composition 236/236 (0 missing, 0 duplicate, 0 extra, 0 DIES, 1 renamed). Ledger `$TMPDIR/cal-gate-ledger/ledger.jsonl`: 3 entries, chain intact, 0 tampered runs. **3 fresh sealed runs** (build digest and git HEAD unchanged since each). Row classes across the runs: 129 pass, 32 skipR30, 40 skipR18, 2 pendingAttributed, **5 fail, 1 pendingUnattributed, 27 awaitingJudge**. Offenders (owner): A13 (hero-body, R27), A17 (hero-body, R11), A19 (hero-body), A21 (gates-perf + engine-gpu), A31c (hero-body, inherited Round-4 FAIL), A33 (hero-body), and 27 visual rows (an R29 judge). |

**Advisory reading of the newest run's 37 frames** (R29 grades them; this is the builder's read, from the
ledger copies). The 10 SKIP cards (V5, V6, V10, V25–V29, V36, V37) are full-frame #101418 cards naming
their role and label. Of the 27 staged frames, the five whose staging changed this round:

- `V7-vista-mountains`: the south massif's crest runs across the whole frame against blue sky, peaks of
  different heights and shapes with pale summits; the horizontal banding repeats on most faces.
- `V1-sprint-frame`: rear chase view on bare ground, legs mid-stride and visible down to the boots; the
  right hand swings out beside the hip, the left arm is hidden behind the bow.
- `V3-crouch-stalk`: rear view; she is upright at full height, not a crouch; her boots reach the bottom
  edge of the frame.
- `V12-sprint-vs-reference`: side view, rear foot on the ground line, torso leaning forward, front knee
  raised, hair trailing; one arm hidden behind the body.
- `V38-title`: the HORIZON / ZERO CLAUDE wordmark with a tagline: a FAIL on the new criteria until brand's
  W0b.

V13, V14 still show the inherited Round-4 defects (no aim on the strafe; a lifted heel on the slope).

## 3. Honest gaps

1. **`A-carried-suite` is red, and that is the true state** (§2). It stays red until the owners in §4 fix
   their rows or the orchestrator rules, the R29 judges grade the newest sealed run's frames, and
   `A-reference-set` (W0b) lands the reference slots V12, V22, V24 and V46–V49 need. V38 now FAILs on its
   own criteria (the title still reads HORIZON ZERO CLAUDE) until brand's W0b shadow.
2. **No run of this round was on a quiet box.** The 1-minute load average was 3.05–14.87 across the three
   sealed runs (other lanes' gate Chromes were alive). A9 (R26) cleared 58 fps twice even so (59.9 and 59.5)
   and was PENDING at 31.0 fps in run 2 (load 7.32, contention witnessed), so it has no quiet-box grade yet.
   A21's GPU term is attributable regardless (null frame 0.72 / 0.67 / 0.66 ms) and FAILs at
   108.2 / 96.0 / 94.3 ms against 14 ms. A quiet-box set of three runs on 5270 is the orchestrator's.
3. **A forged seal is still possible, by someone who sets out to forge one.** The ledger is a file on a
   one-user machine: an agent that reads this code can compute a correct chain hash, write a fabricated
   report copy and append a matching seal. What it can no longer do by accident or by a quick edit: edit a
   report or a frame after the run, delete a failing run, edit or re-order a ledger line, grade a stale
   build, write a verdict from the run's own port, or keep re-running until three lucky runs line up. The
   remaining defence is procedural: the orchestrator holds the ledger directory it grades
   (`CAL_GATE_LEDGER`) and runs the 5270 suite itself.
4. **The A90 workload choice** (unchanged from fix round 1): respawning the kind just killed FAILs A90 at
   geometries +54 (bar 40), mostly a one-time lazy geometry cache per kind; the carried rows use Appendix B's
   literal "kind swap … or `machines.kinds[0]`". Instruments-core should name or dispose those caches before
   A90-abs at W0b.
5. **Cost of the new bar:** three carried runs per wave exit, ≈ 66 min each with one Chrome (this round:
   66.2, 67.5 and 67.2 min). Frames are kept for the newest 4 runs per tree and port (≈ 49 MB per run; the three runs of this round
   take 147 MB in `$TMPDIR/cal-gate-ledger`); report copies (≈ 0.3 MB) are kept for every run.
6. **Kevin's 5173 dependency cache.** Read only: main's `node_modules/.vite/deps` holds 14 optimized deps + 6
   chunks, every file present, exactly the 14 bare imports main's `src/` makes, so the cache is internally
   consistent. But its module comments are relative to a cwd outside the main tree
   (`// ../../../../../../../../../Users/kevinliu/Horizon…`), i.e. it was rebuilt on Oct 15 at 22:34–22:36 by
   a Vite rooted at this lane's tree (this lane's or its judge's, before the per-tree `node_modules`), and
   its configHash `4ddc2828` is this tree's. The chunk files are content-hashed, so their names differ from
   the ones the 5173 server optimized itself; a browser holding the server's old chunk names in cache, or the
   server's in-memory optimizer, can request files that are gone. Nothing has rewritten it since (watch over
   this round: 0 rewrites). Restart the 5173 Vite with `--force`, or hard-reload the preview and check it:
   the orchestrator's or Kevin's call (rule 6).
7. **Extent literals, not coordinates.** About ten carried rows keep the W0 map's radius margins as numbers
   (`Math.hypot(x, z) > 310` for "inside the playable disc", trees within 220 m of the centre). They are
   not coordinates and keep working on a larger island (they scan a smaller disc), but they should derive
   from `PLAY_RADIUS` once world-ground owns the extent (W1).
8. **`A-chrome-semaphore` proves its real phase at 1 slot** (the one-Chrome-per-agent rule until this merges);
   the 2-slot cap is proved with stand-ins. After the merge `CAL_SEMAPHORE_REAL_SLOTS=2` runs the real
   phase at 2. The semaphore only counts harnesses that run this code.
9. **Not started (W0b, this lane):** `tools/r5-refs/**`, `reference/MANIFEST.md` (`A-reference-set`,
   `A-reference-clean`) and the `reference/*.jpg` deletion; `A-alloc-rate`, `A-vram-ledger`, `A90-abs`;
   `A-unattributed-cap`.


## 4. What other lanes and the orchestrator must do

| who | what |
|---|---|
| **orchestrator** | **Route or rule on every A-carried-suite offender** (the gate records owner + ruling per row and exempts nothing). Action rows that failed in at least one of this round's sealed runs: A13 (hero-body; failed 1 of 3, R27 demands 5/5), A17 (hero-body; 3 flourish frames in run 3, R11 sim clock), A19 (hero-body; 6.05 and 5.86 m/s vs the 6.12 floor), A31c (hero-body; inherited Round-4 FAIL, 3 of 3), A33 (hero-body; PENDING without an attribution at 33.7 Hz sampling), A21 (engine-gpu; GPU term 94–108 ms vs 14 ms, 3 of 3, attributable). |
| **orchestrator** | **Spawn the R29 judges** for the visual rows of the newest sealed run (`--judge --list` prints them, with the ledger frame paths). They view the ledger copies (never re-film in a lane tree to judge) and write verdicts with `--judge --seal <id> …` from 5271 or the lane judge port. V12, V22, V24, V46–V49 cannot PASS until `A-reference-set` (this lane, W0b) puts their `reference/r5/gates-perf/<slot>` files in place. V38 now FAILs on the old wordmark until brand's W0b shadow. |
| **orchestrator** | **Kevin's 5173 dependency cache** (§3 gap 6): restart the 5173 Vite with `--force`, or confirm a hard reload of the preview. Its chunks were written by a Vite rooted at this lane's tree on Oct 15 (22:34–22:36), before the per-tree `node_modules`. Nothing has rewritten it since. A lane may not touch 5173. |
| **orchestrator** | At each wave exit, on the quiet box, with 0 lane Chromes: `node tools/gates.mjs --port 5270 --lane carried` **three times** on one unchanged build (each run seals itself into `$TMPDIR/cal-gate-ledger`, or set `CAL_GATE_LEDGER` to a directory you hold), then the judges, then `node tools/gates.mjs --port 5270 --only A-carried-suite` in an invocation of its own. Do not delete `runs/` by hand: a missing report copy reads as tampering (start a new ledger directory instead). |
| **orchestrator** | Merge this lane first: until then the other lanes take no semaphore tickets and seal no runs. After the merge, `--extra tools/gates.r5.<lane>.mjs` is redundant. Re-run the carried suite after the instruments-core and pipeline merges: the IP kinds and the NPC body go, `kinds[0]` becomes a legacy kind (or the Tiller once `ctx.machines.roles` resolves `herd`). |
| **orchestrator** | At W3, exclude `tools/gates/archive/` from `A-gates-no-hero-literals`' all-of-`tools/` scope, or delete it (A-gate-preludes then builds its coordinate vocabulary from the W0 table and `sites.js` alone). |
| **brand** | `tools/gates.r5.brand.mjs` fails A-gate-preludes on two literals. (1) `:151` NOT_CAMP keys an allowlisted src line by its full text, which contains `'strider'`: key it by `file + '|' + sha1(trimmed line)` computed node-side with `crypto` instead (the page-side `fnvStr` in its LIB is not available to `restGrep`). (2) `:189` `BASELINE.spawn` / `campRespawn` `{ x: 18, z: 26 }`: read the baseline value from the baseline commit (`git show c32e968:src/entities/player.js`, line 6 `CAMP_POS`) or compare against `sites.js` REST in page context. Or the orchestrator rules on it in the plan; this gate keeps failing until one of the two happens. |
| **instruments-core** | `tools/gates.r5.instruments-core.mjs` will FAIL A-gate-preludes after the merge: 16 quoted kind literals (`IP_KIND_FILES`, `LEGACY_PROBE_KINDS`, …) and the literal placement `x: 120, z: 40` (`:821`, the doctrine probe spawn). Read the old-kind names from bible §10.2 (as A-gate-preludes does) and stage the probe through `PLACE(...)`. Also: publish `ctx.machines.roles`; declare `sizeClass` per Round-5 kind; name or dispose the lazy per-kind geometry caches (§3 gap 4). |
| **world-props** | Publish `ctx.props.gatePlaces` with the 28 names in §5 (three new this round: `navLegs`, `navProbe`, `ringSkyline`), plus `rest` / `restSite` from `sites.js`. |
| **every lane** | Put gates in `tools/gates.r5.<lane>.mjs` exporting `GATES`; define a carried id to shadow it (it then runs under `--lane carried` too). A row may use a `get assert()`. Scratch localStorage keys must be removed by the row that wrote them. No row names a coordinate, a kind, a bone, an HZD/HFW term or a non-r5 still. |
| **hero-body** | At W0b shadow A13 (R27 5/5), A17 (R11 sim clock), A19, A31c, A33 (its "cannot resolve the cadence" PENDING carries no attribution) and the hero-body visual rows (V1–V4, V12–V14, V23, V24). The frames of the newest sealed run are in the ledger. |
| **melee** | V46–V49 at W1. A100 failed once in the judge's run (haft-to-bow 0.0794 m vs 0.10) and PASSed in all three sealed runs here: keep it in view. |
| **engine-gpu** | A21's GPU term (14 ms; 94.3–108.2 ms measured, attributable) and A9 (R26) at the chosen tier. |
| **the per-kind block** | A45 (stance drift per kind): failed once in the judge's run (0.062 m vs 0.06), PASS ×3 here at worst 0.023 / 0.047 / 0.049 m, close to the bar. |
| **pipeline** | Remove the `public/LICENSES.json` rows for the deleted `public/anims-{hybrid,reskin,retarget}/**`. |


## 5. The place names `ctx.props.gatePlaces` must publish

Each is `{ x, z, yaw?, pitch? }` (metres / radians; ground y is resolved by the gate). The W0 column is the map table used while the W0 terrain signature matches; at W1 world-props publishes the Round-5 equivalents (same meaning, new island).

| name | meaning (what the gate needs there) | carried rows |
|---|---|---|
| `openGround` | flat meadow strip, clear run along +Z | 35 |
| `spawnVista` | map centre facing the valley (Round-4 spawn vista) | 3 |
| `herdSite` | west meadow herd ground | A21 herd scenario (`budgets.mjs`) |
| `fightGround` | flat ground at the map centre | 1 + A21 staged-fight scenario |
| `waterFeature` | dry riverbed cut | V8 (its fallback stand) |
| `aaRidgeView` | pine ridge against sky from the map centre | 1 |
| `runway` | open-ground spot facing due -X: flat, grass, fast for 50 m | 3 |
| `steepFace` | terrace lip, 56 deg over ~1.5 m of its fall line | 2 |
| `duelGround` | flat clear meadow, away from the herd | 2 |
| `impactGround` | flat clear meadow, the impact/carry film spot | 2 |
| `rangeGround` | flat meadow with 55 m of open sight line along +Z | 1 |
| `riverChannel` | the dry west river channel | 2 |
| `rockShelf` | SE rocky-highland shelf | 1 |
| `grassSite` | meadow, dense grass | 2 |
| `grassPoints` | six meadow points | 1 |
| `rimView` | north of the camp palisade, facing the north rim | 4 |
| `biomeStation` | valley-floor station, four bearings 35/125/215/305 deg | 4 |
| `rimFace` | r=300 at the north wall | 1 |
| `litMeadowRef` | lit meadow reference frame | 1 |
| `rimStrata` | facing the north wall strata | 1 |
| `shadowCaster` | hunters watchtower platform, 5.05 m | 1 |
| `parkAway` | open meadow far from the light probes | 1 |
| `aerialStation` | map centre with 240-290 m sight lines on 8 bearings | 1 |
| `midgroundVista` | low rise NW of the camp, open on four bearings | 1 |
| `gtaoPark` | player parking east of the camp, out of the GTAO frames | 3 |
| `navLegs` (fix round 2) | `{ legs: [[x0, z0, x1, z1] ×4] }`: four cross-map nav legs between walkable land points ≥ 150 m apart, over the valley floor, the river cut and the rock highland | A25b |
| `navProbe` (fix round 2) | open walkable ground with a clear 34 m run east and west, no blocker inside 8 m | A25b |
| `ringSkyline` (fix round 2) | a station + `look: { x, z, dy }` whose lens frames the boundary massif's crest against open sky across the frame | V7 |
| `rest`, `restSite` | read from `src/world/island/sites.js` (REST), never from the table | 10 |
