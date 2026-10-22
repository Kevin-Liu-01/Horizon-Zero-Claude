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
| 1 | **R28: re-staged rows picked "the first live machine of any kind" and counted legacy kinds as PASS; A-gate-preludes could not see it** (major ×2: A50b, A92, A93, A94, A78, A79, A90-expansion) | Every pick of a machine a carried row measures or acts on now goes through new roster helpers (`tools/gate-roster.mjs`: `isStaged`, `liveStaged`, `livesStaged`, `liveOfKind`, `stageAny`, `memVictim`), which only ever return a machine of a **staged** (role-mapped, non-legacy) kind, spawning one when none stands. The judges' seven rows are re-staged, **and every other row the extended scan found**: A90 / A90b / A90-expansion and the A90-abs workload (`memVictim`), A101's threat machine, A43's eight wrecks (plan §9 instruments-core: "staged on the Tiller fixture"), A65's two victims, A74b, A77b, A41b, A23b, A103, A106, A64c, the A71-family `pickMachine`, `docileContract()`, and the shared `SPECIES` prelude of **ten** per-species rows that measured every live kind (A44, A44b, A45, A45b, A45c, A46, A47, A47b, A48, A50). A50b now measures `stagedPicks()` only. A dead helper that picked by kind (`ensureKind`) is deleted. | A-gate-preludes' new check **`noMachinePickWithoutRoster`: 0 unstaged picks** (33 annotated whole-roster sites, used 117 times across the expanded rows: freeze 75, census 22, clear 9, cast 9, warm 1, mirror 1; 8 lines carry a `KIND[...]` / `STAGED_KINDS` filter). Its self-test flags the W0a re-stage's own A92 pick and A50b list (2/2) and passes an annotated freeze, a `KIND[...]` filter and a helper call (0 false hits). The re-staged rows on the Tiller in the full run: every re-staged row PASSES except A45c (SKIP-legacy (R28): the handle rig exists only on legacy kinds) and the rows whose roles have no kind yet (named R18 / R30 SKIPs); A43 killed 8 Tillers (scene −294 objects, 8 respawns scheduled), A65 killed 2 authored Tillers (`restoreWasReal` true), A50b 50/50 arrows on drawn geometry, A92 phase A 8 riders at death. |
| 2 | **A-gate-preludes PASS was not literal** (major) | The scan now grades **every `machines.list` use** in every carried row (preludes expanded) and in `budgets.mjs` / `gates/gates-perf.w0b.mjs`: it must be a roster helper, carry a `KIND[...]` / `STAGED_KINDS` filter on its line, or be annotated `/* r5-all-machines: <reason> */` with one of six closed reasons (`gate-roster.mjs` `ALL_MACHINES_REASONS`: freeze, clear, census, warm, mirror, cast); every annotated site is listed in the detail for audit. The old-map coordinate scan also learned the two forms it missed (found by this round's own audit, not by the judges): a **declared pair** (`const SX = -264, SZ = -176` in A103, `const X0 = -60, Z0 = -45` in V41, `const BX = 0, BZ = 120` in the cast line-up) and a **vocabulary pair written as `hypot()` offsets** (A106: `Math.hypot(o.position.x + 60, o.position.z + 45)` is the openGround spot). All four now resolve named places: `meleeSlope` and `castStage` are new W0 places (§2.5), A106 / V41 use `openGround`. | **A-gate-preludes PASS** (full suite 21:12–21:33Z: 14/14 checks, 0 unstaged picks, 0 old-map coordinates in owned files). Self-tests: coordinate scanner 8/8 positives (2 new) and 7/7 negatives (3 new, among them a relative `fire.x + 80` placement), machine-pick scan 2/2 and 0 false hits. Brand's and instruments-core's files are reported with one coordinate each (graded at their own exits, R33 e). |
| 3 | **A23b kept the Round-4 count `tested === 8`; A75 the latent `dispatched.length === 8`; the lane co-owns A23/A23b** (major ×2) | Re-stage fixes, as inventory Appendix B words both rows ("`all 8 species` literal -> kinds", "8 named species -> new roster"): A23b `tested === kinds.length && tested >= 1`, A75 `dispatched.length === species.length`; every fidelity term unchanged. The same class of literal sat in four more rows and is fixed the same way: A45 / A46 / A48 / A45b `measured < 2` → `< min(2, staged kinds)`; A50b `speciesDone < 4` → `< min(4, staged kinds)` (the Round-4 count where the roster allows it). A78b's `>= 9` cast-state buttons counted `overridden`, the Override state R17 removed (instruments-core deleted it from `src/studio/cast.js`): it now requires a button for every state the row exercises **and** every state `cast.js` publishes; the hero-pose loop skips `interact` (the Override-node beat R17 removed from `pose.js`) only while `pose.js` does not publish it. Ownership lines in §3 / §4 corrected: A23 and A23b are **engine-gpu + gates-perf** (plan §9). | A23b ****PASS** in the full run (`tested 1` of 1 staged kind, gap rate 4.1 % ≤ 4.9 %, worst median 0.18 of the bar)**. A78b ****PASS** (states 5/5 held, stagger / death resolved, all Round-4 poses accepted, `r17Removed=interact`)**. A75 SKIP-R18 (needs ≥ 2 staged kinds, unchanged). |
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

TBD:frames

## A.3 The carried suite, graded (R33)

TBD:A3

---

# Part B — the W0b deliverables

## B.0 Summary

| deliverable (plan §2 / §9) | file(s) | status |
|---|---|---|
| licence-clean reference set via the Commons fetcher | `tools/r5-refs/{fetch,licence,manifest,slots}.mjs`, `reference/r5/gates-perf/**` (13 files + MANIFEST) | done; A-reference-set **PASS** |
| `reference/MANIFEST.md` + deletion of `reference/*.jpg` (HZD stills) | `reference/MANIFEST.md`; the 19 stills deleted | done; A-reference-clean **PASS** |
| `A-alloc-rate` | `tools/gates/gates-perf.w0b.mjs` | built (caller attribution); **FAIL, real**, other lanes' code (§4) |
| `A-vram-ledger` | same | built; **FAIL, real** on render targets until engine-gpu's tier merges |
| `A90-abs` | same | built; workload re-staged (R28); **FAIL, real**: GPU process 1,515.06 MB > 1,500 (1,377.65 MB at pixel ratio 1.25); JS heap 79.93 MB PASS |
| the unattributed-draw cap | same + `MEMORY_BUDGETS.unattributed.w0Cap` | direct count graded; cross-checks on a pinned world; **PASS 5** (TBD:uac3) |
| R34 self-contained scenarios | `tools/budgets.mjs` + `A-perf-scenarios-self-contained` | done; **PASS** |

## B.1–B.5 Methods

Unchanged from fix round 1 except: **A90-abs**'s A90 workload kills a staged kind's machine (`memVictim`) like the carried
A90 row; **A-unattributed-cap**'s cross-checks run on a pinned world (FR2 item 5). The methods in brief: A-alloc-rate is the
CDP sampling heap profiler (2 KB interval) over 10 s of the staged fight + 10 s of sprint-and-draw, every sampled byte charged
to the nearest `src/**` frame, graded at max(measured, KB/frame × 60); A-vram-ledger is a census of the GL allocation calls
installed before the game makes its context (render targets = textures ever attached to a framebuffer + renderbuffers,
engine-gpu's sized-format table); A90-abs runs the A90 workload, two forced GCs, then the staged fight for 60 s, JS heap
from `Runtime.getHeapUsage` after GC, GPU process from `SystemInfo.getProcessInfo` + macOS `footprint`.

## B.6 Measured numbers

Full suite, 21:12–21:33Z (load 2.9–4.8, 1 other gate Chrome, the harness relaunched the browser twice for shared-GPU
contention). Tier high, pixel ratio 1.5 (= min(device DPR 2, tier cap 1.5)), 2400 × 1350 drawing buffer.

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
per-frame count is constant (NPCs `[16 × 8]` live and pinned); hide vs pinned direct: settlement 30 / 29, NPCs 15 / 16,
every other owner equal.

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

| who | what |
|---|---|
| **orchestrator** | **Merge order.** Part A (§5.1) can merge first; Part B (§5.2) is additive. Merge engine-gpu's W0b tier and instruments-core's W0b A90b fix, then re-grade A-vram-ledger, A90-abs, A90b, A21 and A-alloc-rate on the merged build. |
| **orchestrator** | **Grade A-carried-suite on 5270** (quiet box, 1 Chrome): `CAL_GATE_LEDGER=<a dir you hold> node tools/gates.mjs --port 5270 --lane carried` once; then `--only A100-spear-holster,A50b-aim-on-drawn-geometry,A9-perf-budget` until the flaky rows' first 5 observations decide; then the V21 judge (next row); then `CAL_ORCHESTRATOR_PUBKEY=<your key> node tools/gates.mjs --port 5270 --only A-carried-suite` in an invocation of its own. After hero-body's exit add `CAL_SHADOW_EXITED=hero-body` to grade the 35 shadowed rows on the merged build. |
| **orchestrator** | **R29 judge for V21** (the only kept visual row graded here). Keygen / register / verdict: `node tools/gates.r5.gates-perf.mjs --judge-keygen --out <outside every tree>/orchestrator.pem`; per judge `--judge-register --judge-name <who> --port 5271 --judge-pub <its key> --orchestrator-key orchestrator.pem`; the judge: `--judge --list --port 5270`, then `--judge --seal <id> --id V21-camera-cover --pass true|false --rationale "…" --judge-name <who> --port 5271 --judge-key judge.pem --reference reference/r5/gates-perf/chase-camera.jpg`. |
| **orchestrator** | **Confirm four re-stage readings** (none moves a bar; each is recorded in its row): (a) Round-4 roster counts mapped to the staged roster — A23b `tested === kinds.length` and A75 `dispatched === species.length` (Appendix B's own words), A45/A46/A48/A45b `min(2, staged kinds)`, A50b `min(4, staged kinds)`; (b) A78b's ninth cast state and the `interact` pose are the Override mechanic R17 removed; (c) A23 staged on the colossus role only (R18, no re-pointing); (d) A-carried-suite accepts SKIP-legacy (R28) for a baseline-PASS row whose subject exists only on legacy content (A45c), listed by name. **Grants** for the frozen hot spots below (`collision.js`, `nav.js`, `anim/clipLayer.js`, `gait.js`). |
| **engine-gpu** | **A-vram-ledger / A90-abs / A21**: merge the W0b tier (your report: render targets 127.27 MB at DPR 1.25, vista GPU 11.8–12.4 ms). In this tree: RT 437.75 MB at the shipped `high` (DPR 1.5); GPU process 1,515 MB (1,378 at 1.25); A21 GPU medians 76 / 101 / 84 ms on a loud box, and A9's own scene GPU read 21.6 ms on the vista at load 2.9, over A21's 14 ms bar until the tier lands. **A-alloc-rate**: `engine.js:273` `ScenePass.render` → `renderer.render` 11.1 MB/s, almost all of it three's `getParameters` / `getProgramCacheKeyParameters` / `join`: three re-derives a program key every frame, which it does when a material's `version` changes every frame (`needsUpdate = true` per frame) or the lights state version does (a light or shadow toggled per frame); find that material or light. `engine.js:1352` the cull pass's `scene.traverse((o) => …)` 6.7 MB/s (4.4 with nothing drawn); `:1439`, `:1658`. **A23 / A23b** are yours and gates-perf's (plan §9): A23 now waits for the colossus role; A23b PASSes on the Tiller. |
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

`git status --short` is empty at the end of the round because the orchestrator's WIP checkpoints (`a2fba7c` 19:29Z,
`dcd81b7` 19:56Z, `5531dc0` 20:22Z, `4ae6d3f` 21:14Z, `0b62d50` 21:40Z, and any later one) committed the edits as they
landed. This round's diff is `git diff dcb9e5e -- tools docs/ROUND5-GATES-PERF.md` (7 files, +631 / −502).

### 5.1 Part A (merge first)

| file | change this round |
|---|---|
| `tools/gate-roster.mjs` | `ALL_MACHINES_REASONS`; roster helpers `isStaged`, `liveStaged`, `livesStaged`, `liveOfKind`, `stageAny`, `memVictim` (A.1) |
| `tools/gate-places.mjs` | W0 places `castStage`, `meleeSlope` |
| `tools/gates.r5.carried.mjs` | R28 re-stages (A90, A90b, A90-expansion, A92, A93, A94, A78, A79, A101, A43, A65, A74b, A77b, A41b, A23b, A103, A106, A64c, `pickMachine`, `docileContract`, the two `SPECIES` preludes, A50b), whole-roster annotations, `ensureKind` deleted; roster-count re-stages (A23b, A75, A45, A46, A48, A45b, A50b), A78b (R17), A23 on the colossus role (R18), A71 staging, A92 staging on `impactGround`, A45c SKIP-legacy (R28); literal coordinates replaced by places (A103, A106, V41, the cast line-up) |
| `tools/gates.r5.gates-perf.mjs` | A-gate-preludes: machine-pick scan + self-test, declared-pair and hypot-offset coordinate forms + self-test lines; A-carried-suite: `skipR28` + `r28SinceBaseline`; title / rule text |
| `tools/budgets.mjs` | the scenario `machines()` helper annotated `census` (no behaviour change) |

### 5.2 Part B

| file | change this round |
|---|---|
| `tools/gates/gates-perf.w0b.mjs` | A-unattributed-cap: cross-checks on a pinned world (`directCount()` live + pinned, state restored in `finally`); A90-abs workload pick `memVictim` |
| `docs/ROUND5-GATES-PERF.md` | this report |

No file outside the §2 row and the §1.2 grant was edited; the harness grant files (`gates.mjs`, `screenshot.mjs`,
`chrome-profile.mjs`) are untouched this round. No asset was added under `public/`, so there is no `LICENSES.json` row.

## 6. Processes

TBD:processes
