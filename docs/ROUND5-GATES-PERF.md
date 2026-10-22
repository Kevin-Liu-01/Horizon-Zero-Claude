# ROUND 5 — lane `gates-perf`: W0a exit (R33) and W0b — fix round 2

Port 5255. Tree `scratchpad/r5/gates-perf/tree` → `~/.calima-r5/trees/gates-perf`, branch `r5/w0a-gates-perf`.
Oct 22 2026, 19:05–TBD:endZ. Plan rows: §2 gates-perf, §1.2 harness grant, §3.1 W0a + W0b exits, §3.2
`gates.r5.carried.mjs`, §4.2 / §4.4, §6 (`reference/*.jpg`), §8.2 R18 / R28, §8.3 R33, R33 (g), R34, R37–R42, §9 gates-perf.
The orchestrator's WIP checkpoint `a2fba7c` (19:29Z) committed the first half of this round's edits; the rest is in
`git status --short` (§5). The fix-round-1 report is in git history (`dcb9e5e`).

**Part A (the W0a exit under R33) can merge first. Part B is the W0b work.** §5 lists the files of each part.

## FR2. Fix round 2: the findings, what changed, what was measured

Eleven findings from two judges, grouped into nine items. Every change was re-run on port 5255: one sealed full
carried run (`TBD:fullrun`), one full suite (the 13 lane rows + every global-list row that exists in this tree, in one
invocation, `TBD:suiterun`), and sealed partial re-runs for the known-flaky rows, A9 and A-unattributed-cap.

| # | finding (severity) | what changed | measured after the change |
|---|---|---|---|
| 1 | **R28: re-staged rows picked "the first live machine of any kind" and counted legacy kinds as PASS; A-gate-preludes could not see it** (major ×2: A50b, A92, A93, A94, A78, A79, A90-expansion) | Every pick of a machine a carried row measures or acts on now goes through new roster helpers (`tools/gate-roster.mjs`: `isStaged`, `liveStaged`, `livesStaged`, `liveOfKind`, `stageAny`, `memVictim`), which only ever return a machine of a **staged** (role-mapped, non-legacy) kind, spawning one when none stands. The judges' seven rows are re-staged, **and every other row the extended scan found**: A90 / A90b / A90-expansion and the A90-abs workload (`memVictim`), A101's threat machine, A43's eight wrecks (plan §9 instruments-core: "staged on the Tiller fixture"), A65's two victims, A74b, A77b, A41b, A23b, A103, A106, A64c, the A71-family `pickMachine`, `docileContract()`, and the shared `SPECIES` prelude of **ten** per-species rows that measured every live kind (A44, A44b, A45, A45b, A45c, A46, A47, A47b, A48, A50). A50b now measures `stagedPicks()` only. A dead helper that picked by kind (`ensureKind`) is deleted. | A-gate-preludes' new check **`noMachinePickWithoutRoster`: 0 unstaged picks** (TBD:annotated). Its self-test flags the W0a re-stage's own A92 pick and A50b list (2/2) and passes an annotated freeze, a `KIND[...]` filter and a helper call (0 false hits). The re-staged rows on the Tiller in the full run: TBD:r28rows. |
| 2 | **A-gate-preludes PASS was not literal** (major) | The scan now grades **every `machines.list` use** in every carried row (preludes expanded) and in `budgets.mjs` / `gates/gates-perf.w0b.mjs`: it must be a roster helper, carry a `KIND[...]` / `STAGED_KINDS` filter on its line, or be annotated `/* r5-all-machines: <reason> */` with one of six closed reasons (`gate-roster.mjs` `ALL_MACHINES_REASONS`: freeze, clear, census, warm, mirror, cast); every annotated site is listed in the detail for audit. The old-map coordinate scan also learned the two forms it missed (found by this round's own audit, not by the judges): a **declared pair** (`const SX = -264, SZ = -176` in A103, `const X0 = -60, Z0 = -45` in V41, `const BX = 0, BZ = 120` in the cast line-up) and a **vocabulary pair written as `hypot()` offsets** (A106: `Math.hypot(o.position.x + 60, o.position.z + 45)` is the openGround spot). All four now resolve named places: `meleeSlope` and `castStage` are new W0 places (§2.5), A106 / V41 use `openGround`. | **A-gate-preludes PASS** (TBD:preludes). Self-tests: coordinate scanner 8/8 positives (2 new) and 7/7 negatives (3 new, among them a relative `fire.x + 80` placement), machine-pick scan 2/2 and 0 false hits. Brand's and instruments-core's files are reported with one coordinate each (graded at their own exits, R33 e). |
| 3 | **A23b kept the Round-4 count `tested === 8`; A75 the latent `dispatched.length === 8`; the lane co-owns A23/A23b** (major ×2) | Re-stage fixes, as inventory Appendix B words both rows ("`all 8 species` literal -> kinds", "8 named species -> new roster"): A23b `tested === kinds.length && tested >= 1`, A75 `dispatched.length === species.length`; every fidelity term unchanged. The same class of literal sat in four more rows and is fixed the same way: A45 / A46 / A48 / A45b `measured < 2` → `< min(2, staged kinds)`; A50b `speciesDone < 4` → `< min(4, staged kinds)` (the Round-4 count where the roster allows it). A78b's `>= 9` cast-state buttons counted `overridden`, the Override state R17 removed (instruments-core deleted it from `src/studio/cast.js`): it now requires a button for every state the row exercises **and** every state `cast.js` publishes; the hero-pose loop skips `interact` (the Override-node beat R17 removed from `pose.js`) only while `pose.js` does not publish it. Ownership lines in §3 / §4 corrected: A23 and A23b are **engine-gpu + gates-perf** (plan §9). | A23b **TBD:a23b**. A78b **TBD:a78b**. A75 SKIP-R18 (needs ≥ 2 staged kinds, unchanged). |
| 4 | **A-carried-suite FAILs** (blocker ×2) | Rows mine to fix, fixed: **A23** — its re-stage fell back to "the staged kind with the most triangles" and FAILed only on `bp95 > 60`, the Round-4 colossus's skinned-raycast baseline (the Tiller's: 31.6 ms p95) while every lane-cost term passed. R18 says a role-staged row "may not be silently re-pointed": it now stages the **colossus role only** and reports SKIP-legacy-deleted (R30) until the Transit (instruments-d W4). **A71** — two staging defects, measured with a probe: the herd noticed her at 14 m (3 pips from "fighting" machines, 0 tags), and faceFrom's 0.1 rad pitch put the 2.68 m Tiller 3.47 m off the crosshair ray against sighting's 2.42 m pick radius; the tag step now holds every machine calm and turns the lens until the crosshair passes through the machine. **A92** — staged on a freshly spawned staged machine per phase on the named `impactGround`, parked (phase A took 0 riders twice in three runs from an authored machine wherever its site stood). **A78b** — item 3. The grader now accepts **SKIP-legacy (R28)** for a row that passed at baseline on legacy content, as plan §9 lists it among A-carried-suite's allowed states, and lists every such row by name (`r28SinceBaseline`); a FAIL in any observation is still a regression. | **A-carried-suite TBD:acs**. Rows of other lanes still FAIL: TBD:acsOthers. |
| 5 | **A-unattributed-cap did not reproduce its PASS inside a full suite** (major) | The paired with/without readings now run on a **pinned world**: `ctx.state` is held at a non-live state, so `main.js _simulate()` runs no system (no NPC animation or LOD switch, no particle, no AI) while `engine.render()` keeps drawing the same world, with dynamic resolution off. A pinned direct count is taken in the same hold; each owner's hide delta is compared with **its pinned direct count**, the unregistered roots hidden together with the pinned unattributed count, and the pinned unattributed count with the live graded one (all within ±1). The graded number is unchanged: the live direct count, worst whole frame. The state and the drawing are restored in `finally`. | TBD:uac |
| 6 | **A21 and A9 PENDING on a loud box** (major) | Re-run on a quiet window (R26 / Round-4 attribution unchanged). | TBD:a21a9 |
| 7 | **A-alloc-rate FAILs ~1,750×; A-vram-ledger and A90-abs FAIL** (blocker ×4) | Not fixable inside this lane's paths (rule 1, no grant). Re-measured; routing refined to file:line with the one-line fix for each hot spot (§4). engine-gpu's **unmerged** W0b tier (DPR 1.25, GTAO ¼, SMAA-only, …) records render targets at **127.27 MB** in its tree, under the 170 MB bar; instruments-core's **unmerged** W0b fix records A90b **3/3 PASS** with 0 offenders at `machine.js` / `autorig.js`. Both are graded here only after the merge. | TBD:w0bnums |
| 8 | **W0b exit not reached** (blocker) | Items 4 and 7; §4 is the routing table. | — |

---

## 0. Result

TBD:result

---

# Part A — the W0a exit under R33

## A.0 Summary

TBD:A0

## A.1 The machine-pick rule (new contract, `tools/gate-roster.mjs`)

A carried row may touch `ctx.machines.list` in exactly three ways (A-gate-preludes `noMachinePickWithoutRoster`):

1. through a roster helper, which returns staged (role-mapped, non-legacy) kinds only:
   `liveOf(role)`, `livesOf(role)`, `stageRole(role, opts)`, `stagedPicks(filter)`, **`isStaged(m)`, `liveStaged(filter)`,
   `livesStaged(filter)`, `liveOfKind(kind, filter)`** (null for a legacy kind), **`stageAny({ dx, dz, wait, filter })`**
   (a living staged machine, else one spawned for the gate), **`memVictim(filter)`** (the A90 family's kill pick);
2. with a `KIND[...]` or `STAGED_KINDS` filter on the same line;
3. as a whole-roster operation annotated on its own line `/* r5-all-machines: <reason> */`, reason one of
   `ALL_MACHINES_REASONS`:

| reason | meaning | uses (TBD:annotatedCounts) |
|---|---|---|
| `freeze` | stops (or restores) every machine's update so nothing interferes; no machine is measured | the FREEZE / freezeAll preludes |
| `clear` | moves every machine out of an area, or picks a spot away from all of them | A102, A103, A105, A106, V47, A24, A77 |
| `census` | reads or counts every live machine as whole-world state | A20 (the frame loop), the A90-family leak censuses, A109, A43 / A43-expansion / A44 checks, the save alive-set mirror (A64-family `liveRoster`), A60 (the world's patrol lanes), A49 (the shared FX pool), the perf scenarios' `machines()` |
| `warm` | warms a per-machine cache before the staged subject is measured | A23 (hull sets) |
| `mirror` | a stand-in for a shipped loop that itself visits every machine | A23 (the aim function) |
| `cast` | operates on machines the row already picked through the roster | V26/V27 line-up, A67's respawned site |

A row whose subject exists only on legacy content reports **SKIP-legacy (R28)** with the reason, never PASS. This round
that is A45c (the handle rig, `footContinuity`, runs only on legacy kinds); A65's kill clause would be, but three Tillers
stand in the authored roster, so it stages on them (TBD:a65).

## A.2 Frames read this round

TBD:frames

## A.3 The carried suite, graded (R33)

TBD:A3

---

# Part B — the W0b deliverables

## B.0 Summary

| deliverable (plan §2 / §9) | file(s) | status |
|---|---|---|
| licence-clean reference set via the Commons fetcher | `tools/r5-refs/{fetch,licence,manifest,slots}.mjs`, `reference/r5/gates-perf/**` (13 files + MANIFEST) | done; A-reference-set TBD:refset |
| `reference/MANIFEST.md` + deletion of `reference/*.jpg` (HZD stills) | `reference/MANIFEST.md`; the 19 stills deleted | done; A-reference-clean TBD:refclean |
| `A-alloc-rate` | `tools/gates/gates-perf.w0b.mjs` | built (caller attribution); **FAIL, real**, other lanes' code (§4) |
| `A-vram-ledger` | same | built; **FAIL, real** on render targets until engine-gpu's tier merges |
| `A90-abs` | same | built; workload re-staged (R28); TBD:a90absStatus |
| the unattributed-draw cap | same + `MEMORY_BUDGETS.unattributed.w0Cap` | direct count graded; cross-checks on a pinned world; TBD:uacStatus |
| R34 self-contained scenarios | `tools/budgets.mjs` + `A-perf-scenarios-self-contained` | TBD:selfcontained |

## B.1–B.5 Methods

Unchanged from fix round 1 except: **A90-abs**'s A90 workload kills a staged kind's machine (`memVictim`) like the carried
A90 row; **A-unattributed-cap**'s cross-checks run on a pinned world (FR2 item 5). The methods in brief: A-alloc-rate is the
CDP sampling heap profiler (2 KB interval) over 10 s of the staged fight + 10 s of sprint-and-draw, every sampled byte charged
to the nearest `src/**` frame, graded at max(measured, KB/frame × 60); A-vram-ledger is a census of the GL allocation calls
installed before the game makes its context (render targets = textures ever attached to a framebuffer + renderbuffers,
engine-gpu's sized-format table); A90-abs runs the A90 workload, two forced GCs, then the staged fight for 60 s, JS heap
from `Runtime.getHeapUsage` after GC, GPU process from `SystemInfo.getProcessInfo` + macOS `footprint`.

## B.6 Measured numbers

TBD:B6

---

## 1. Gate table — the global green list (the items that exist in this tree)

TBD:global

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
// A-unattributed-cap detail (CHANGED): crossChecks.perOwner[] { id, hidden, pinnedDirect, liveDirect, livePerFrame[],
//   pinnedPerFrame[], roots }, crossChecks.pinnedWorld { method, held, framesAdvanced, pinnedUnattributedPerFrame[] }
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

TBD:gaps

## 4. What other lanes and the orchestrator must do

TBD:routing

## 5. Files changed (this round)

TBD:files

## 6. Processes

TBD:processes
