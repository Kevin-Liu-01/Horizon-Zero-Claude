# ROUND 5 — lane `instruments-core` (W0b report; the W0a report follows below)

Port 5254. Worktree `scratchpad/r5/instruments-core/tree` (branch `r5/w0b-instruments-core`), based on
main `a953355` (W0a merged + PLAN §8.3). Plan rows used: §2 (`instruments-core`), §1.2 (the W0 machines
grant: `machine`, `index`, `variety-assets`, `parts`, `ai/{tables,attacks,perception,index}`,
`ai/stimulus.js` ≤ 10 lines, `rig/lod.js` ≤ 6 lines for `uv1` + PALETTE + quantise flag, `rig/fx.js`
palette defaults), §3.1 (W0b exit: "lamps + roles + perk hooks live"), §3.2 (the two contracts this
lane owns), §4.1 (lamp beams: 64 per cone, instanced, 1 draw), §6 (no W0b deletions for this lane),
§8 (R17, R18, R28, R30, R34), §9 (`instruments-core` W0b block, the per-kind block, the global list).

**HOW TO RUN.** `tools/gates.mjs` (frozen harness, unchanged) merges `tools/gates.round4.*.mjs` by its
directory scan plus ONE `--extra <file>`, with the same `GATES`-array merge. gates-perf's r5
auto-discovery (`LANE_FILE_RE` in `gates.config.mjs`) is not in main yet, so this lane file rides in on
`--extra`:

```
R5_SCRATCH=<scratchpad>/r5/instruments-core \
R5_GATE_ROSTER=<gates-perf tree>/tools/gate-roster.mjs \      # only until gate-roster.mjs is in the tree
node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core
node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core-kind   # the per-kind block on the fixture
R5_IC_FILM=1 node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core-film   # the lamp films (advisory) + the beam films' in-frame probes
```

R5_IC_* diagnostics only (a report made with any of them says "DIAGNOSIS FLAGS ON (not gradeable)"):
`R5_IC_NOINLINE`, `R5_IC_OPTSTATUS`, `R5_IC_TRACEDEOPT` (deopts timed against the windows, with the
lazy-invalidation waves clustered), `R5_IC_SHAPEWATCH` (every object reachable from the root ctx
fingerprinted every 200 ms: added/removed keys and value-representation changes, timed),
`R5_IC_PROTOWATCH` (281 prototypes: key and value diffs), `R5_IC_PROTOLOCK` (prototypes made
non-extensible; the stack of whoever adds to one), `R5_IC_PROTOTRACE` (`--trace-prototype-users`),
`R5_IC_MICRO`, `R5_IC_INGAME`, and five added in fix round 3:
- `R5_IC_DEOPTMARK`: every deopt of this lane's functions, timed by markers compiled into the trace stream; the
  tier timeline of each hot function; and a shape report of live machines against a fresh spawn;
- `R5_IC_CALLEES`: the non-src frames a lane frame's callee bytes sit in;
- `R5_IC_MATHTEST`: bytes per call of each builtin in each V8 tier of this Chrome;
- `R5_IC_GPSEQ`: gates-perf's `A-alloc-rate` sequence on this staging;
- `R5_IC_BCPRINT=<fn>`: one function's bytecode, to map a deopt's offset to source.

The allocation gate has its own lane:
```
node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core-alloc   # A-alloc-machines (+ its paired attribution run)
```
For the global list in this tree I used one `--extra` combiner in scratch (`bin/global.mjs`). It
re-exports this lane's `GATES`, pipeline's `GATES` and gates-perf's `A-alloc-rate` (their W0b module,
imported read-only from their worktree).

Once auto-discovery merges, drop `--extra` (the file exports `GATES` in the registry shape) and the
shadow rows change id from `<id>@ic` to `<id>` by themselves (`shadowId()` reads
`gates.config.mjs` for `LANE_FILE_RE`), so they shadow the carried rows of the same id (§3.3).
`R5_GATE_ROSTER` is read only when `tools/gate-roster.mjs` is absent.


---

## W0b TARGETED FIX ROUND 1 (Oct 30 2026) — the five open findings, with numbers

The cut-off attempts' WIP (Oct 23 and Oct 29; orchestrator checkpoints) held the lens cone, the bible length, the
gameplay films, `warmSteering` and the sunlit pixel probe. I verified each against the finding and finished what was
missing. Every number below was measured on port 5254 under `nice -n 10`, with one gate Chrome machine-wide. No result
recorded under `taskpolicy -b` is used here (the round-3 runs above predate the rule and are superseded where they
differ). No bar moved and no gate was loosened.

| # | finding | what changed (file:line) | measured |
|---|---|---|---|
| 1 | blocker: the hostile lock leaves the back of the lens | `lamps.js:150-157` `coneFullDeg` 55 / `coneOffDeg` 70; `lamps.js:964-985` the drawn direction is clamped into the lens cone and the light fades to 0 between 55° and 70°; the film's yaw is set level and corrected about world up, and is held after every frame (`gates…:1909`, `:1946`, `:1968`); new lane row `A-beam-lens-cone` (`gates…:2262-2394`) | `A-beam-lens-cone` PASS 3/3 (B1b, B3, lane run G2). Lens 150° from Brea, no yaw correction, 90 frames: drawn lock ≤ 70.0° off the axis, cone light 0, magenta at 0 of 12 points. Positive control (lens facing her): cone light 1, shaft at 8/8, then 7/8 after the narrowing. The two beam probes read lens·bearing **1 / 1** live in every run |
| 2 | major: the lock is a dense widening magenta wedge | lock half-angle 3° → **1.5°** (`lamps.js:105`); the lock's light falls as along² / (1 + d/5 m)² (`:125-129`, shader `:509-512`); cross-section edge³ for the lock, edge² kept for the sweep (`:140`, `:514`); `gainHostile` / `gainHostileFog` are now the light at the lens (5.5 / 16). At 8 m they are 0.8 / 2.4, at or under the old flat cap (1.3 / 2.4) | fog gameplay frame pink: 5.0 % (3°) → 2.1 % (1.5°). Probes' fade clause (mean addition 10-30 % vs 60-80 % of the way to her), 3 runs on the final code: night 269.5 / 152.9, 266.4 / 159.1, 271.2 / 157.9; fog 368.3 / 306.3, 358.2 / 289.9, 353.8 / 300.1. The flat 1/(1+d/5) falloff failed this clause in 2 of 3 fog runs (291.3 / 291.5, 274.4 / 288.1), which is why the squared falloff was chosen |
| 3 | major: the lock length departs from bible §7.2 | the lock is not cut at her: `r.blen` = sight range × `perceptionScale` (`lamps.js:883`). Past her chest the light halves every 2 m (`pastTargetHalfM`, `:148`): her body takes part of it. The probe clause is the bible's: drawn length = sight × weather within 2 % and > segment + 1 m; beyond her (110-140 %) still magenta at ≥ 1 point, fading (`gates…:2203-2207`) | drawn lock **24.07 m = 24.07 m** (night) and **27.20 m = 27.20 m** (fog), against a 10.02 m segment. Beyond her: magenta at 1/3 (night) and 3/3 (fog) points, mean 22-24 (night) and 66-78 (fog), below the near mean |
| 4 | major: the sunlit staging is nondeterministic | `FILM` asserts in rendered pixels that the lamp is on screen and unoccluded before it films (`gates…:1998-2040`): ≥ minPx lamp pixels within ΔE2000 10 of the token, AND the same block changes when the lamp draw is hidden. Else it tries the next heading; if none passes, it fails the staging by name. New action twins `A-film-{calm,wary}-sunlit-15m-staging`, `A-film-calm-sunlit-40m-staging` report the choice (`gates…:2070-2090`) | 6 runs (B3 ×3, F ×3): the same heading every time, after 1 try. Calm 15 m: 211 token px and 341 changed px (bar 15). Wary 15 m: 112 token px, 369-402 changed. Calm 40 m: 31 token px, 48-50 changed (bar 3). The frames show the Tiller unoccluded, the palisade to the side |
| 5 | major: fight-start allocation transient in the steering helpers | `warmSteering` runs every helper through every branch at spawn and once at navgrid-ready (`machine.js:298`, `index.js:271`, `:604-625`; WIP, kept). `_steerOpts` and `_st` are born mutable (`machine.js:99`, `:137`): DEOPTMARK caught navTowardS lazily deoptimised on "dependent field type constness changed" 3.4 s after staging. `_moveToward` returns the distance on demand on legacy kinds (`machine.js:1050`, `:2659-2664`; `index.js:55`, `:265`); see below | gates-perf's own `A-alloc-rate` row on this tree, 7 runs (2 of them, G1, on the final source): **steerAlongS, navTowardS and `_moveToward` are not among its over-4 KB/s functions in either phase of any run**. `A-alloc-machines`: PASS in 6 consecutive runs (B3 ×2 and F4 ×2 with the first form of the fix, G1 ×2 on the final source). In every paired no-inline run `_moveToward` allocated **0 B**: it is absent from a list that reaches down to 0.2 KB/s. Before (B1b) it was 3.35 / 3.43 / **4.26** / 2.42 / 3.02 / 2.95 KB/s |

**`_moveToward`, measured.** A census of every call in `A-alloc-machines`' staging (405 frames) found 4.89 calls per
frame, all on legacy kinds. 3.67 come from `Glinthawk._orbit` (glinthawk.js:144) and 1.22 from the frozen convoy step
walking the ShellWalkers (`Squads.stepConvoy`, squad.js:289). Every one of these callers discards the result. The bytes
were not a deopt. They were the return: a double returned from a call that is not inlined is a fresh HeapNumber, in
every window. The only caller that reads the value is the frozen scavenger step (`Squads.stepScavenge`, squad.js:501,
`d < cfg.arrive`), and it calls only while `m.scavenge` is set. So a legacy machine (`_mtOnDemand` 1, set at spawn
from `LEGACY_KINDS`) returns the distance while it scavenges and nothing otherwise. Every Instrument keeps the
contract (the distance, always). No frozen file was touched.

A first version installed this as a prototype method on the legacy classes. I replaced it the same day, because a
class prototype changed after its definition is a known source of prototype-chain deopts. The per-instance flag
mutates no prototype. Four runs of gates-perf's row taken after the first version listed `updateEyesM` (36.6-43.6
KB/s), against none in the one run before it. With the flag it is still listed (37.4, 36.7 KB/s), so the prototype
method was not the cause; see the honest gaps.

**The beam lab** (scratch diagnosis, `bin/beamlab*.mjs`). The four beam stagings are filmed once, and the lock shader
is swapped at runtime through 6 + 5 variants. For each variant the lab records the probe's own reads, a frame-wide
pink census and the frame. I chose the variant from those numbers and frames, then re-filmed it with the real code.

**The films, re-filmed at the cited angles on the final code (F1) and read by me against their written criteria**
(advisory; no licence-clean reference exists):
- **`V-lamp-beams-night`** (side): a narrow magenta shaft, hot at the drum lamp, dimming toward Brea. It carries past
  her and fades out with no cut. It is translucent (the grass reads through it). The wary chartreuse sweep is separate.
  No beam leaves the back of a lamp. PASS.
- **`V-lamp-beams-fog`** (side): white-hot magenta at the lens, deepening and dimming toward her, then fading about
  3 m past her. Narrow, not a wedge, not brightest at her end. PASS.
- **`V-lamp-beams-{night,fog}-gameplay`** (her chase camera, the hostile Tiller 8 m ahead): a thin shaft from the lamp
  to her head, brightest at the lens, opening into a faint fan over her shoulders. The frame is not washed (2.1 % of
  the frame pink in fog by the lab census). PASS.
- **The 4 lens films, the noon, three-quarter and 40 m frames**: unchanged from round 3. The sunlit frames show the
  Tiller in the open, its lit lens in the dark drum face. PASS.

**Global and lane gates on the final source** (G1-G3): see "Targeted fix — the runs" below.

**Honest gaps.**
- gates-perf's row passes for the three helpers in 5 of 5 runs, but my stricter emulation of its sequence is not
  clean. `R5_IC_GPSEQ` stages its own 8-Tiller fight and opens one window 3 s after staging. There, steerAlongS read
  0.5-58 KB/s and navTowardS 16-21 KB/s in 4 diagnosis runs. The cause is lazy "dependent prototype chain changed"
  deopts 8-12 s after staging, from a source I did not find: `R5_IC_PROTOWATCH` saw none of 283 watched prototypes
  change.
- The same 3 s method also lists other lane frames that are not in this finding: `_statePatrol` (83-101 KB/s),
  `_engageFrame`, `_updateAttack`, the accessors, and in four of five runs `updateEyesM`. I did not change them (scope).
  They become the R48 (c) baseline as measured. With `A-alloc-machines`' 30 s warm-up, none of them is a lane frame
  over 4 KB/s.

---

## W0b FIX ROUND 3 (Oct 23 2026) — what changed, by judge finding, with numbers

Four findings: two blockers on the memory rule, the hostile beam missing from the films, and the published
accessors returning a stale 0. No bar moved. `A-alloc-machines` keeps every term of round 2: caller attribution,
a 30 s warm-up, six graded 10 s windows, the re-armed fight, and the paired no-inline run. R46 is recorded, so
the four carried classes pass only under its marker. Class (c), `_steerAlong`, now has its own label
(`frozen-return`), so the gate no longer lumps it in with lane code. Every other lane frame still has to be
≤ 4 KB/s in every window.

| finding | status | the number |
|---|---|---|
| 1 + 3 — memory rule on lane frames (`_sight`, `conformM`, `updateEyesM`) | **fixed** | `A-alloc-machines` **PASS in 9 consecutive runs (R8–R16), the last 3 (R14–R16) on the final source**: 0 lane frames over 4 KB/s in any window. In R14–R16, `_sight`, `conformM`, `updateEyesM` and `Machine.update` allocate 0 KB/s in all six windows (not one sample) |
| 2 — the hostile lock beam is missing from the beam films | **fixed**, and asserted in the film frame | magenta shaft read at **8/8** points (night) and **8/8** (fog) along the lamp-to-Brea line |
| 4 — the published accessors return a stale 0 for 0.5 | **fixed**, and a new gate | `A-published-scalars` PASS: 330 round-trips, 0 wrong; the round-2 seed fails 30/30 (negative control) |

### Findings 1 and 3 — the memory rule on this lane's frames

**How the causes were found.** I added a new diagnosis mode, `R5_IC_DEOPTMARK`, which times each V8
deoptimisation:
- **Markers in the trace.** `--trace-deopt` lines reach the gate in buffered blocks, so the time they arrive
  says nothing. Instead, every 200 ms the page compiles a fresh, uniquely named function, optimises it, and
  deopts it. Its trace line sits in the stream at a known page time, and every other line is timed by the
  markers around it.
- **Tiers.** The same tick samples `%GetOptimizationStatus` of this lane's hot functions, from the module
  instance the game really runs (Vite serves it as `machine.js?t=…`).
- **Shapes.** After the windows, every live machine and its per-frame records are compared, with
  `%HaveSameMap`, against a freshly spawned machine of the same kind.

Three companion modes were also added: `R5_IC_CALLEES` (which non-src frames a lane frame's callee bytes sit
in), `R5_IC_MATHTEST` (bytes per call of each builtin in each tier of this Chrome), and `R5_IC_MICRO`.

Diagnosis runs G1–G14 (port 5254) found nine separate causes. Each one is a mid-session event that either
deoptimises a lane function or makes its optimised code allocate:

| # | lane frame | what happened (measured) | fix |
|---|---|---|---|
| 1 | `_sight` | At her first sprint (61.7 s): `Insufficient type feedback for binary operation`. The peripheral-arc compare and the perk multiply had never run while she stood in the fight. The function then spent 3.8 s in Sparkplug. At 62.5 s (G6) came a second deopt, `not a Smi`: in the fight every cone weight was 1 or 0, so V8 had recorded "small integers" for the weight compares. | Every load, compare and arithmetic operation runs on every tick; branches only select between locals. The cone weights 1 and 0 are loaded from Double fields (`WK`), so the compares are typed "number" from the first tick. |
| 2 | `_beliefTick` | At her first sprint: `Insufficient type feedback for compare operation`, from the hearing branch. | The same treatment. The heard position is grounded in `hear()`, when the stimulus arrives, with the same `terrain.getHeight(x, z)`. `lure` is a Smi flag. |
| 3 | `updateEyesM` | G3 at 60.9 s: `embedded weak objects cleared` (a GC), then 609 KB/s for the next window. G1: 1,188 KB/s in one window. | The function is branch-free. The colours are written through the `THREE.Color` each lens record caches (`EyeRecord.col`). There is no per-frame `instanceof`; records are normalised when the count changes. The two rare material writes go through `eyeMatSetM`. |
| 4 | `conformM` | R5: 93.6 KB/s in one window. `Insufficient type feedback for call` in three's XYZ Euler extraction. A pure yaw within 0.03° of ±90° is that extraction's gimbal case, so its `atan2` call first ran whenever a machine happened to face due east or west. | Both cases are computed every frame and the result is selected. The ground patch, the normal and the ground ease are branch-free too. |
| 5 | `_statePatrol`, Tiller `animate` | G6: `wrong map` at 47.2 s and 48.8 s; 32.9 KB/s. The shape report showed live machines carrying keys a fresh one lacks, so their maps changed mid-session: `_doctrineSnapped` (set in a microtask by frozen `rig/expansion-base.js`), `onAlerted` and `_flee` (herd kinds), and the legacy species' own fields. The Tiller had 2 maps among 11 live machines. | Those fields are declared in the `Machine` constructor (undefined or null, the values every reader already treats as "not set yet"). Every own field of the machine, its scalars, its AI, its perception and its lamp record is written with a different value and back, once, at spawn (`mutableFromBirth`). No field is still "const" when per-machine code is optimised. |
| 6 | everything that read `HOT` | `HOT.pTallGrass` and `pCrouch` stayed 0 until her first run through grass or first crouch. A module object's fields are folded as constants, so the first new value was a constness deopt. | `mutableFromBirth(HOT)`. |
| 7 | `Machines.update` | A `dependent prototype chain changed` wave at her first sprint (the root ctx is a prototype, of every machine's ctx view). `refreshHot` was inlined, so `update` spent 8 s in Sparkplug. | `refreshHot` is called through `Reflect.apply`, which the optimiser does not inline, and her position comes from `HOT`. `HOT.ppos` is her own `Vector3`, held by reference: nothing is copied, so nothing is boxed even in the baseline tier. |
| 8 | `_sight` | 2–5 KB/s in the fight windows. `R5_IC_CALLEES` showed it was `abs (native)`: `Math.abs(cScanSweep)` receives a tagged cfg value (a Smi in one kind's row, a double in another's), and the mid tier then calls the builtin, which boxes a double result. Separately, `collision.occluded` (kept code: the BVH raycast allocates its hit records) was inlined into `_sight`. | `abs` is written out (also `Math.max` in `hear`). The occluder ray is called through `Reflect.apply`, so it keeps its own frame; its bytes are now charged to `collision.js`, where they are made. The ray is also re-tested at most every 0.25 s while neither end moves 0.5 m (details below). |
| 9 | `updateEyesM` (gates-perf's sequence) | In gates-perf's `A-alloc-rate` "sprint and draw" phase (3 s warm-up; respawns as she sprints and shoots): 1,544 KB/s. I emulated that sequence (`R5_IC_GPSEQ`) and timed it: `lost precision or NaN` at bytecode 123 (`R5_IC_BCPRINT`: the load just after `if (lp0 < 0) sc._lampPhase = Math.random()`). That branch was taken only on a NEW machine's first frame. | The phase is drawn when `MachineScalars` is built, so there is no branch. On the final source, gates-perf's own run no longer lists `updateEyesM` (Q5, below). |

Smaller changes in the same files:
- **Steering helpers.** `steerAlongS`, `moveTowardS`, `navTowardS` and `stepRootS` have the same treatment: the
  zero-direction stop, the arrival test, the camp push-out and the world rim are now selects, not branches with
  their own operations.
- **Tiller `animate`.** It loads both gait entry points on every call.
- **Indexed loops.** `attackDisabled`, `coveredAt`, `nearestCovered`, `bandBlocked`, `_bestArrangeablePass`
  and `hasFresh` loop by index, not with `for…of`.
- **`_machineNodes`.** It counts nodes without a closure per machine.

**A regression of my own, found and removed this round.** My first branch-free `updateEyesM` called
`Math.random()` on every frame. In this Chrome that builtin boxes its result in every tier: 12 B per call
(`R5_IC_MATHTEST`), 42 KB/s in G6. It is now drawn once per machine.

**The occluder cache in `hasLOS` (a behaviour change, stated plainly).**
- **When the ray is re-tested.** The occluder result (trunks, rocks, ruins, palisades) is kept for 0.25 s, as
  long as the machine's eye and her body each stay within 0.5 m of where it was tested. Any larger move
  re-tests at once.
- **What does not change.** The terrain samples still run every tick.
- **The effect.** In a still scene the ray runs at 4 Hz instead of 10 Hz. A moving scene (her sprint, a chase)
  is re-tested every tick as before.
- **The gates.** On the final source, `A39` reads 1.84 s / 3.50 s at 30 m (round 2: 1.77 s / 3.51 s), and
  `A37` passes with 0 seen samples while hidden.

**The gate.** The only change is the R46 (c) label: `_steerAlong`, the one frame that ruling names, is classed
`frozen-return` and passes only with the marker. Nothing else changed.

**Runs** (`A-alloc-machines`, port 5254, the graded run plus its paired no-inline run; KB/s graded = max(KB/s,
KB/frame × 60)):

| run | code | verdict | lane frames over 4 KB/s | highest lane frame | fps per window | cast hostile per window |
|---|---|---|---|---|---|---|
| R1 | occluder cache v1, before `Reflect.apply` | FAIL | `_steerAlong` 13.5 (R46 c, not yet labelled), `_beliefTick` 5.35, `_sight` 4.5 | — | 20 / 21 / 23 / 20 / 23 / 21 (loaded box) | 0.96 / 0.86 / 0.98 / 0.97 / 0.91 / 1.00 |
| R2 | + `Reflect.apply` (occluder, `refreshHot`), label (c) | PASS | 0 | `_sight` 3.34 | 38 / 38 / 38 / 53 / 47 / 35 | 0.97 / 0.93 / 0.93 / 0.95 / 0.94 / 0.93 |
| R3 | same | FAIL | `_sight` 4.35 (the `abs (native)` box, #8) | — | 38 / 35 / 31 / 35 / 35 / 38 | 0.95 / 0.98 / 0.95 / 0.93 / 0.93 / 0.95 |
| R4 | same | PASS | 0 | `_beliefTick` 2.93 | 44 / 49 / 50 / 51 / 36 / 35 | 0.95 / 0.95 / 0.91 / 0.95 / 0.93 / 0.93 |
| R5 | + `abs` written out, indexed loops | FAIL | `conformM` 93.6 (the gimbal call, #4) | — | 38 / 43 / 43 / 45 / 37 / 44 | 0.95 / 0.98 / 0.91 / 0.93 / 0.95 / 0.93 |
| R6 | same | PASS | 0 | `_beliefTick` 2.43 | 36 / 34 / 45 / 37 / 38 / 38 | 0.95 / 0.98 / 0.93 / 0.93 / 0.93 / 0.95 |
| R7 | same | PASS | 0 | `_moveToward` 2.74 | 39 / 38 / 34 / 46 / 35 / 46 | 0.93 / 0.95 / 0.95 / 0.97 / 0.93 / 0.93 |
| **R8** | **+ gimbal and steering helpers** | **PASS** | **0** | `_moveToward` 3.05 | 33 / 35 / 31 / 35 / 34 / 46 | 0.93 / 0.93 / 0.98 / 0.95 / 0.91 / 0.93 |
| **R9** | same | **PASS** | **0** | `_beliefTick` 2.32 | 49 / 55 / 45 / 54 / 37 / 35 | 0.93 / 0.93 / 0.93 / 0.94 / 0.92 / 0.95 |
| **R10** | same | **PASS** | **0** | `_moveToward` 3.17 | 42 / 48 / 36 / 44 / 37 / 37 | 0.95 / 0.95 / 0.95 / 0.90 / 0.95 / 0.93 |
| R11 | + two value-identical edits | PASS | 0 | `_moveToward` 1.69 | 40 / 43 / 48 / 55 / 47 / 52 | 0.95 / 0.95 / 0.90 / 0.93 / 0.93 / 0.95 |
| R12 | same | PASS | 0 | `_beliefTick` 2.38 | 44 / 46 / 36 / 42 / 38 / 49 | 0.95 / 0.93 / 0.98 / 0.97 / 0.93 / 0.91 |
| R13 | same | PASS | 0 | `_moveToward` 2.58 | 34 / 40 / 36 / 44 / 43 / 38 | 0.95 / 0.98 / 0.95 / 0.95 / 0.95 / 0.95 |
| **R14** | **final source** (+ #9) | **PASS** | **0** | `_beliefTick` 2.07 | 40 / 44 / 39 / 40 / 42 / 47 | 0.96 / 0.88 / 0.95 / 0.96 / 0.94 / 0.95 |
| **R15** | **final source** | **PASS** | **0** | `_beliefTick` 3.58 | 31 / 35 / 32 / 36 / 36 / 35 | 0.95 / 0.95 / 0.88 / 0.94 / 0.95 / 0.94 |
| **R16** | **final source** | **PASS** | **0** | `_beliefTick` 2.37 | 44 / 50 / 47 / 54 / 56 / 52 | 0.93 / 0.95 / 0.91 / 0.95 / 0.93 / 0.95 |

Runs R1, R3 and R5 each failed on one lane frame. Each failure led to one fix above (#8 `abs`, #8 occluder,
#4 gimbal). From R8 on, every run passed: R8–R10, R11–R13 and then R14–R16.
- **R11–R13** followed two edits with identical values: the lock fade constant, and a comment moved so
  `A-lamp-canon-distance`'s structural check finds the beam tint.
- **R14–R16** followed fix #9, the only change after R13.
- **Highest lane frame by name over R8–R16:** `_beliefTick` 3.58 KB/s, `_moveToward` 3.17, `lamps.update` 1.92,
  `_sight` 1.5, `_statePatrol` 1.27, `updateEyesM` 0.7, `refreshHot` 0.36, `conformM` 0.36, `Machine.update` 0.
- **Load.** These runs were not quiet: other lanes' Chromes ran alongside, at 31–56 fps.

In every passing run the residual is the R46 classes only:
- inlined-frozen: Tiller `animate` (`gait.update` and `updateCheap`, 1.7–2.9 MB/s with inlining off) and
  `_engageFrame` (`engage.pursue`, 150–210 KB/s);
- the legacy species files;
- the three accessors;
- `_steerAlong` (frozen-return).

### Finding 2 — the hostile lock beam (the films)

**Why it was missing.** I measured the old staging with a new probe (`A-film-beams-*-probe`, below):
- **End-on.** The hostile Tiller stood 7 m along world x, so its lock line to Brea ran almost along the camera's
  view axis. A 10.35 m shaft covered 62 px of the frame, end-on behind its own lamp.
- **Dim.** The beam was also weak. It added 9–21 to R+G+B, and 0 of 8 points read. The cochineal magenta carries
  2.7× less luminance than the chartreuse at the same gain (linear Y 0.250 vs 0.665), and the 4 Hz flicker
  dropped the beam to 0.3.
- **Facing.** In one staging, `forceState('attack')` turned the hostile Tiller toward where Brea had been, so
  its lock left the drum backwards over its own hull.

**Fixes:**
- **Staging.** The hostile Tiller stands 6 m to the camera's side of the wary one. Brea is placed first, then
  the lock, then the facing: the body is yawed until the LENS axis (the lamp rides the head bone) points at her.
  Brea stands 10 m straight ahead of its lamp. The view is from the side at 6.5 m above the ground, looking down.
  So the shafts cross ground and bodies, not the fog-white horizon, and the nearer (hostile) shaft sits below the
  wary one instead of across it.
- **Beam colour** (`lamps.js` `BEAM`):
  - the hostile gain is 1.6× in clear air and rises to 2.7× at fog density 2.55 (`gainHostileFog`, the
    luminance match). 2.7× at night saturated the shaft into a solid cone (I read that frame);
  - the beam's flicker trough is 0.65 (the lens keeps 0.3);
  - the fog term of the air boost is 1.0 per unit of density, up from 0.8.
- **Beam length** (bible §7.2 "locked on the target"). A lock is cut where it meets her: min(sight range × weather
  scale, distance to her chest). It fades as along^0.5 to nothing on her (`aBeam.w` = 0.5), and a sweep keeps
  along². With a linear fade the half nearest her lost its magenta over the warm ground in fog (FILM4: judge
  scan 4/8).
- **Staging assertion.** Each beam film has an action twin with the same setup, which measures in its own frame.
  It samples 8 points from 10 % to 80 % of the lamp-to-Brea segment, taking 6 paired frames with and without
  the beam draw. It requires:
  - the shaft adds ≥ 24 to R+G+B with dR > dG and dB > dG at ≥ 6 of 8 points;
  - the judge's own magenta scan (R and B each > G + 25) on the frame at ≥ 6 of 8;
  - the wary shaft reads at ≥ 6 of 8;
  - no magenta light beyond her;
  - the hostile Tiller's lens axis points at her (dot > 0.9).

| probe | hostile shaft (≥ 24, magenta) | judge scan | wary | beyond her | lens axis · bearing |
|---|---|---|---|---|---|
| night (clear, 23:00) | **8/8**: +188 to +380 R+G+B; on-frame (195,25,103) at the lens to (139,9,62) at 80 % | **8/8** | 6/8 | 0.1 | 1.00 |
| fog (rain, density ×2.55) | **8/8**: +254 to +392; on-frame (252,115,169) to (232,99,133) | **8/8** | 8/8 | 0 | 1.00 |

**The frames, read by me** (no licence-clean reference exists, so no judge has graded them):
- **`V-lamp-beams-night`.** Two narrow additive shafts, clearly apart. The chartreuse one leaves the rear
  Tiller's drum lamp, sweeping up and to the right, and fades out. The magenta one leaves the front Tiller's drum
  lamp, hair-thin at the lens; it widens to its 5° cone and dies on Brea, a dark figure about 10 m away at the
  right end of the shaft. Both are translucent (the grass reads through them); neither is opaque or a block. At
  night Brea herself is barely visible.
- **`V-lamp-beams-fog`.** The same pair, with rain streaks and a grey sky. The chartreuse shaft runs toward the
  palisade. The magenta shaft reads pink-magenta over the warm grass, fading toward Brea, who stands at its end
  tinted by it. The cones are narrow, and there is no cone on a calm machine.
- **The ten other lamp films** (same run). The lens films (`calm`, `wary`, `hostile`, `dark` at 15 m, with
  `calm` also zoomed and three-quarter) read as in rounds 1 and 2. Calm is a full iris, a bone ring and a hot
  core. Wary is a half iris in chartreuse. Hostile is a magenta pinhole. Dark is a closed iris with a branched
  crack and no lit glass. No Horizon blue, amber or red appears. The 40 m and noon frames show the lit lens as a
  point on the drum. The PNGs were deleted once read.

### Finding 4 — the publish-on-change accessors (fixed; new gate `A-published-scalars`)

- **Cause.** Every box was born `_pb = 0` beside a sentinel `_pv = 0.5`. A first read of a value of exactly 0.5
  matched the sentinel and returned the box's 0. 27 of the 30 names are not read at spawn, so all 27 were
  exposed: for example `forceState('search')` writes `suspicion = 0.5`, and the herd's "hot" test then read 0.
- **Fix.** The sentinel is born NaN, which no value equals, so the first read of every name re-boxes the real
  value.
- **Gate** (`A-published-scalars`, lane block). Every name in `MACHINE_SCALARS` is written through its setter
  and read back through its getter:
  - on a fresh record, the first read for each of 0.5, 0, −1, 1e-7 and 99 (150 checks);
  - on a freshly spawned herd-role machine (180 checks).
  - **Negative control:** the round-2 seed, built by hand, must make the probe fail. It does, on 30 of 30 names.
- **Result:** PASS, 0 wrong.


---

## W0b FIX ROUND 2 (Oct 22 2026) — what changed, by judge finding, with numbers

Three findings. No bar moved; the allocation gate got stricter.
- **Finding 3 (`A-weak40`) is fixed in the gate.** It grades min(glass vs face, glass vs hull) = 5.15 : 1,
  and calima is PENDING, never PASS.
- **Findings 1 and 2 (the memory rule on this lane's frames): `A-alloc-machines` still FAILS.**
  - **In the final run (F12)** two of this lane's frames are over 4 KB/s, each in one window:
    - `_sight`, 13.8 KB/s in the first-sprint window;
    - `_steerAlong`, 13.9 KB/s in the first fight window. It is the wrapper that frozen `engage` calls
      for a number.

    Every other frame this lane's own code allocates in is ≤ 4 KB/s in all six windows. The judges' run
    had this lane's frames at 1,029 / 420 KB/s.
  - **In three earlier runs on nearly the final code** (F5, F7, F9), a GC-timed deopt also sent
    `updateEyesM` to 165–1,006 KB/s for one or two sprint windows. It did not recur in F11 / F12, and I did
    not find what tied it to that GC.
  - **The rest over the bar is code this lane may not edit** (legacy species files, frozen readers of the
    accessors, frozen code V8 inlines into this lane's frames). The gate names it, proves it with a paired
    no-inline run, and fails on it until the orchestrator records a ruling (below).

### Finding 3 — `A-weak40` graded two shader constants; calima was folded into PASS

`tools/gates.r5.kind-block.mjs` (the per-kind block, handed to the orchestrator at W1):
- **Contrast is the worse of two ratios:** `min(glass vs drum face, glass vs hull) >= 3`. The hull is the
  machine's own surface beyond the drum (flat-ink machine mask, 1.1–1.8 face radii out), lit by the scene,
  so a pale kind on a pale glaze fails it. Both medians were already measured; the face term alone could
  not fail (both are unlit HDR constants in `lamps.js`), and the gate no longer relies on it.
- **Calima is PENDING, never PASS.** When the environment publishes a `calima` state (world-sky W1) the
  gate re-reads the same pixels under it and grades the same min-ratio; until then the clause is PENDING
  and so is the row's verdict (`pass: null`), with every 13:00 clause still graded (a 13:00 failure is a
  FAIL). `A-kind-block-file` reports PENDING (never PASS) when its only non-green row is that cross-lane
  clause, and names it.

**Measured** (run F2, port 5254, the per-kind block on the Tiller fixture inside `A-kind-block-file`):

| clause | measured | bar | verdict |
|---|---|---|---|
| weak point at 40 m | hit sphere 11.2 px, lit glass 5.5 px across (24 lit px) | ≥ 5 px | PASS |
| glass vs drum face, 13:00, lens facing the sun (axis · sun azimuth 1.00, sun 49.9° up) | ring 0.843 / face 0.044 = **9.46 : 1** | — | reported |
| glass vs hull beyond the drum (672 machine-masked pixels) | ring 0.843 / hull median 0.123 = **5.15 : 1** (hull P75 0.391 → 2.02 : 1, P90 0.706, reported) | — | reported |
| **graded contrast = min of the two** | **5.15 : 1** | ≥ 3 : 1 | PASS |
| calima | no `calima` state in `environment.weatherStates` | ≥ 3 : 1 | **PENDING** (world-sky W1) |
| `A-weak40:herd` verdict | every 13:00 clause PASS, calima pending | | **PENDING** |
| `A-kind-block-file` verdict | 19 PASS + 5 SKIP-fixture + `A-weak40` PENDING (calima); `A41c` 5 / 5 | | **PENDING**, naming the clause |

The hull here is the median, as the judge's fix asks; the 75th percentile (the brightest quarter of the
sunlit glaze) is below 3 : 1 and is reported, not graded. If the orchestrator wants that percentile as
the bar, every generator needs a darker hull behind the drum (gap 1).

### Findings 1 and 2 — the memory rule on this lane's frames

**What the judges measured, and why it happened.** With a 30 s warm-up the judge still saw this lane's
functions at hundreds of KB/s in some windows (`updateEyesM` 775–887, `Machines._stepMachines` 443–461).
I instrumented the gate (diagnosis modes, never graded) and found the cause:
- **Deopt waves.** `R5_IC_TRACEDEOPT` timed every deoptimisation against the windows. Waves of lazy
  "dependent prototype chain changed" deopts hit 30–100 functions at once (machines, the player, the
  renderer) at ~10–12 s, ~40 s and ~61 s after staging, and this lane's per-machine functions then ran
  in V8's interpreter/baseline tiers — where every double is a heap allocation — sometimes for a whole
  10 s window (`updateEyesM` 953 KB/s in one window of my run `s6`).
- **What triggers them** (`R5_IC_SHAPEWATCH`: every object reachable from the root ctx fingerprinted
  every 200 ms by keys and value representation): at the player's first knockback (~12.6 s)
  `player.moveSpeed` goes Smi → double and `player.contact` / `contactKind` go null → object/string; at her
  first sprint (~61.2 s) `player.heading`, `fovBias`, `_fov`, `_faceX`, `velocity.x/z`, eleven
  `player.animator` fields and `engine.camera.fov` go Smi → double, and `combat.melee._aimYaw`. Each such
  first generalisation is a map transition of a singleton, and V8 throws away every optimised function
  that read it. The wave at ~40 s matched no watched object (a deeper object or a GC clearing weakly
  embedded objects — "embedded weak objects cleared" lands in the same batch).
- **Why this lane's code was in the blast radius:** its per-machine paths read the player, the engine,
  the terrain and the nav through `machine.ctx`, a prototype-chained VIEW of the root ctx
  (`ai/emit.js` `machineCtx`), and this lane's own per-frame objects were born with integer fields
  (`MachineScalars.heading = 0` …), so the FIRST wary pulse, telegraph, stun or fractional value was itself
  a map transition that deoptimised all of this lane's code. `R5_IC_PROTOWATCH` (281 prototypes, key and
  value diffs) and `R5_IC_PROTOTRACE` (`--trace-prototype-users`) showed no prototype being edited after
  boot, which is how the cause above was isolated.

**What I changed (code this lane owns; no frozen file touched):**

| # | change | where |
|---|---|---|
| 1 | **`lib/hot.js` `HOT`**: one module record of fixed shape, filled once per frame by `Machines.update` (`refreshHot`): the services (terrain, nav, engine, environment, collision), the sim clock, and the PLAYER VALUES the machines read (`ppos`, a Vector3 it owns, `pHealth`, `pMoveSpeed`, `pCrouch`, `pTallGrass`). Every per-machine path reads `HOT`, never `machine.ctx` and never the player object, so another system's shape change deoptimises only `refreshHot` | new `src/instruments/lib/hot.js`; `machine.js`, `index.js`, `ai/perception.js`, `ai/attacks.js`, `lamps.js` |
| 2 | **Doubles born Double**: every double field of `MachineScalars`, `Perception`, `MachineAI.lureT`, the picker clock, the lamp records and `LampSystem`, `HOT`, the attack objects' `t` / `phaseT` is stored as 0.5 first, so no first fractional value is ever a map transition mid-session | same files |
| 3 | **One lens-record class** (`EyeRecord`): the five eye-record literal shapes (and the frozen shells' sixth) become one class with fixed fields; a foreign-shaped record is converted the first time `updateEyesM` meets it | `machine.js` |
| 4 | **Own-field method slots** (judge item 2): `update`, the state methods, `animate`, `tickCooldowns` copied into own fields at construction (`m.update` in the manager is no longer a prototype load); `update` calls `ai.perception.update` directly | `machine.js` |
| 5 | **No double crosses a call** (judge item 1): the far-LOD tick passes the constant `LOD_TICK` and carries the remainder (it passed `Math.min(accum, 0.4)`); frozen `engage.update(dt, x, z)` gets the player's x/z as two boxes shared by every machine per frame (`playerBoxes`) and `pursue` gets per-machine boxes re-made only when the belief moves (`lkBoxes`); the perception tick's seconds travel in a field (`_beliefTick`); `updateEyesM` reads the clock from `HOT` unconditionally (a merge of a double and the tagged `t` parameter was boxed on every call); `Math.min/max/hypot` on hot paths written out | `machine.js`, `index.js`, `ai/perception.js`, `ai/index.js`, `ai/attacks.js`, `lamps.js` |
| 6 | **Terrain without boxed arguments**: `conformM` reads the drawn ground through a 1 m lattice — `heightFast` at the integer-metre corners of the cell under the root, sampled only when the root enters a new cell (2.04 calls per cell, corners reused; unit-tested exact), height and normal from the bilinear patch. Integer arguments are Smis: the call boxes nothing in any tier. `hasLOS` samples the drawn ground at the nearest integer metre (its 1.2 m clearance unchanged) | `machine.js`, `ai/perception.js` |
| 7 | **Orientation written out**: tilt × yaw quaternion and three's XYZ Euler extraction stored into the private fields (it fired Object3D's quaternion→Euler sync twice per machine per frame: three.js calls handing doubles across). Checked against three.js on 200,000 random cases: max |Δq| 2.2e-16, max |ΔEuler| 1.1e-13 | `machine.js` `conformM` |
| 8 | **The pulse folded into the emissive colour** (intensity held at 1; three uploads emissive × intensity, so the lens is lit exactly as before): a per-frame write is three Color stores, not a double stored into one of a dozen material shapes | `machine.js` `updateEyesM`, `emisBaseOf` |
| 9 | **Publish-on-change boxes for every scalar accessor** (`get suspicion`, `get health`, … like `get heading`): a frozen read of an unchanged value allocates nothing. Settled values settle (`_speed` / `_accelPitch` snap inside 1 mm/s; heading untouched inside 1e-5 rad) | `machine.js` |
| 10 | **Per-frame allocators removed**: `fx.splice` per finished effect → in-place compaction; the 'machine-scan' payload reused per machine; the Dust-sight occlusion pass run as a round-robin slice every frame (it ran over every machine five times a second, which V8 left un-optimised); the Flag pass reads `m.sc` and `HOT` | `machine.js`, `ai/perception.js` |

**The gate got stricter (`A-alloc-machines`, lane `instruments-core-alloc`):**
- **Caller attribution** (gates-perf's `budgets.mjs` `alloc.attribution`): a byte is charged to the
  nearest src frame on its stack, so three.js or builtin work done for this lane's code counts.
- **30 s warm-up, then six 10 s windows** (three of the staged fight, three of a sprint through the roster;
  60 s of play), **each graded on its own**: a function over 4 KB/s in any window fails.
- **The fight stays a fight**: with a 30 s warm-up the herd cast had gone back to patrol before the windows
  opened (all 36 lamps calm, `probe1`), so the windows would have graded a calm patrol. A cast member
  that leaves the fight is re-armed every second, and every window reports and requires the share of the
  cast in a hostile state (≥ 0.75).
- **Every frame is classed by who can fix it**, and only an orchestrator ruling recorded in the plan
  (`<!-- r5-ruling ic-alloc-residual=carried -->`) lets a non-lane class pass:
  - `lane` — code this lane edits whose allocation it causes. Must be ≤ 4 KB/s; no ruling helps.
  - `legacy` — the legacy species files (derived from `legacy.js`'s class imports), deleted at W2.
  - `accessor` — a published-name accessor in `machine.js` whose bytes are ≥ 90 % charged by readers
    this lane may not edit (frozen gait / rig / collision, melee, the legacy species).
  - `inlined-frozen` — a lane frame over the bar ONLY because V8 inlined frozen code into it. Decided by a
    **paired attribution run** in the same gate: same staging, warm-up and windows with inlining off; the
    frame qualifies only if its own bytes AND every lane function it calls are ≤ 4 KB/s in every window
    of that run.

**Measured** (`A-alloc-machines`, port 5254, KB/s graded = max(KB/s, KB/frame × 60), caller attribution,
worst of six 10 s windows after a 30 s warm-up; cast hostile 0.88–0.98 of samples in every window). Runs
F1 (23:07 UTC, before the `_sight` hoist), F5 (00:04), F7 (00:11) and **F9 (01:21, the final source)**. The "before"
column is the judge's run on the fix-round-1 code (3 s warm-up, one window per phase, self attribution —
a weaker method than today's).

| frame (class) | judge, fix round 1 | F1 | F5 | F7 |
|---|---|---|---|---|
| this lane's frames, sum per window | 1,029 fight / 420 sprint | 160–279 | 139–1,391 | **102–175**, and 986 in the first-sprint window |
| `updateEyesM` (lane) | 80.6; 775–887 in a 30 s-warm-up window | ≤ 4 | 965 in the first-sprint window, 0 elsewhere | **737 in the first-sprint window, 0 in the other five** |
| `conformM` (lane) | 122–126 | ≤ 4 | ≤ 4 | **≤ 4** |
| `lamps.update` (lane) | 134–136 | 1.5 | ≤ 4 | **≤ 4** |
| `steerAlongS` / `navTowardS` (lane) | 111–135 / 46 | ≤ 4 | ≤ 4 | **≤ 4** |
| `_scan` / `_sight` / `hasLOS` (lane) | 46–66 / – / – | ≤ 4 / 7.3 / ≤ 4 | 27.8 (one window) / 12.9 (first sprint) / ≤ 4 | **≤ 4 / 8.7 (first sprint) / ≤ 4** |
| `Machines._stepMachines` / `_standoffPass` (lane) | 443–461 in a window / – | ≤ 4 | ≤ 4 | **≤ 4** |
| `Machine.update` (lane) | – | ≤ 4 | 13.2 (one window) | **93 (first sprint; with inlining off its own bytes are 0, the bytes are `updateEyesM` / `conformM` inlined into it in that window)** |
| `_engageFrame` (inlined-frozen) | – | 41.4 | 38.9 | **36.4** — with inlining off its own bytes are 0; frozen `engage.pursue` carries 101–165 |
| `_statePatrol` (lane under the corrected rule) | 87.6 | ≤ 4 | 169 (first sprint) | **14.2** — with inlining off 0, but its frozen callee `squad.stepConvoy` carries only 4.6 |
| `Tiller.animate` (inlined-frozen) | – | 47.1 | 70.6 | ≤ 4 in F7; in F5 with inlining off 0, frozen `gait.update` 1,278, `updateCheap` 298, `rig/lod.js updateRigLOD` 94 |
| `get _speed` / `get heading` / `get _accelPitch` (accessor, frozen-reader share 1.00) | 42 / 22 / – | 31.0 / 18.7 / 13.3 | 21.6 / 19.1 / 10.9 | **15.7 / 11.9 / 11.6** |
| `get suspicion` (accessor) | – | 1.8 | ≤ 4 | **3.0** (one box per change now) |
| legacy species (`longleg`, `glinthawk`, `stormbird`, `scrapper`) | 4–22 each | 5–46 | 4–33 | **4–29** |

**F9, the final source** (cast hostile 0.93–0.98 in every window, 49–59 fps): this lane's frames sum to
108–124 KB/s per window in four windows and 816 / 284 KB/s in the last two sprint windows. Every `lane`
frame is ≤ 4 KB/s in every window except:
- `updateEyesM`: 628 KB/s in sprint 2/3 and 165 in sprint 3/3;
- `_statePatrol`: 92 in sprint 2/3;
- `Machine.update`: 10.9 in sprint 1/3;
- `_sight`: 7.1 in sprint 1/3;
- `_steerAlong`: 8.1 in fight 1/3. This is the wrapper frozen `engage` calls; it must return the metres
  moved, a fresh double per call.

`_engageFrame` (21.7) and `Tiller.animate` (10.2) are `inlined-frozen`: with inlining off their own bytes
are 0, and frozen `engage.pursue` (166 KB/s) and `gait.update` (6,149) carry the allocation.

**F11 and F12, with the corrected rule in the gate** (F12 is the final source):

| run | lane frames over 4 KB/s (window) | `inlined-frozen` (evidence: with inlining off) | sums per window |
|---|---|---|---|
| F11 | `_steerAlong` 12.7 (fight 1/3), `_sight` 7.2 (sprint 1/3) | `Tiller.animate` 48.1 (own 0; `gait.update` 1,723, `updateCheap` 429, `updateRigLOD` 126), `_engageFrame` 42.6 (own 0; `engage.pursue` 135) | 73–205 |
| **F12** | **`_steerAlong` 13.9 (fight 1/3), `_sight` 13.8 (sprint 1/3)** | `Tiller.animate` 72.3 (own 0; `gait.update` 2,180, `updateCheap` 400, `updateRigLOD` 180), `_engageFrame` 42.4 (own 0; `engage.pursue` 166) | 207–298 at 32–35 fps |

No `updateEyesM`, `_statePatrol` or `Machine.update` spike in F11 or F12; every other lane frame is ≤ 4 KB/s
in all six windows of both.

Two lane frames are over the bar in a single window each:
- **`_sight`, the first-sprint window, every run** (7–14 KB/s; it also allocates there with inlining off).
- **`_steerAlong`, the first fight window** (13.9 KB/s). It is the wrapper frozen `engage` calls
  (`this.travelled += m._steerAlong(...)`); it must hand back a fresh number per call until V8 inlines it
  into `engage`, which it does in later windows (0 there).

**Correction to the paired-run rule after F9.** F9's paired run re-classed `updateEyesM` and `_statePatrol`
as `inlined-frozen`. Their spike did not recur with inlining off, and the first rule asked only for clean
own bytes. That was wrong: `updateEyesM` calls no code outside this lane. The rule now also requires that
the frozen callees measured with inlining off allocate at least the frame's graded excess. The F9 line
above is classed by that rule (from its evidence strings); F11 runs it in the gate.

**Verdict: FAIL**, on three things:
- **F12's two single-window lane frames**, `_sight` and `_steerAlong` (above).
- **Spikes in the sprint phase** in F5, F7, F9 and the diagnosis run `s9` (none in F11 / F12), each in one
  or two windows. The diagnosis run puts a GC's "embedded weak objects cleared" deopt (44 functions,
  `updateEyesM`, `navTowardS` and `_statePatrol` among them) and a 77-function "dependent prototype chain
  changed" wave (the player's readers: camera, HUD, vignette, `refreshHot`) at her first sprint. At the
  same moment `R5_IC_SHAPEWATCH` shows `player.heading`, `fovBias`, `_fov`, `_faceX`, `velocity`, eleven
  animator fields and `engine.camera.fov` generalising Smi → double. A deoptimised function then runs in
  V8's baseline tier for much of a window. I removed every dependency of this lane's per-machine code on
  those objects that I could find (HOT, `EYE_RGB`, born-Double fields, lens records normalised at
  construction); what still ties `updateEyesM` to that GC I did not identify.
- **The residual classes** (legacy, accessor, inlined-frozen), which pass only under the ruling below.

**What only the orchestrator (or another lane) can remove — the request for the ruling.** Record
`<!-- r5-ruling ic-alloc-residual=carried -->` with these owners and dates, or deny it and the gate stays
FAIL on them:

| residual | measured (F7) | who removes it | when |
|---|---|---|---|
| **accessor** — `get _speed`, `get heading`, `get _accelPitch` (one HeapNumber per changed value: the readers need a number) | 15.7, 11.9, 11.6 KB/s; 100 % charged by frozen readers | the orchestrator, by grant: the readers read `m.sc.<name>` (identical values) — `gait.js` 754, 871, 925, 928, 931, 1112, 1328, 1882, 1894, 1896, 1904, 1958; `rig/footlock.js` 317, 413, 414; `rig/ground.js` 1147; `rig/footfall.js` 33; `collision.js` 1410, 1651, 1771, 1834, 2058, 2090, 2094, 2127, 2205; `melee.js` 152, 2152 (melee lane) | W1 day 1 |
| **legacy** — the legacy species files' own frames (`longleg.animate` 29, `glinthawk._fly` 18, `glinthawk.animate` 14, `glinthawk/longleg._statePatrol` 9, `scrapper.update` 7.6, `stormbird.animate` 5.5, …) | 4–29 KB/s | instruments-b deletes them (plan §6) | W2 exit |
| **inlined-frozen** — `_engageFrame` (36.4), `_statePatrol` (14.2); in other runs `Tiller.animate` (47–71) | their own bytes 0 with inlining off | frozen `engage.pursue` (101–165 KB/s), `nav.steer` (a 7-element `ANG` array per call), `squad.stepConvoy`, `gait.update` (1,278), `rig/lod.js` `updateRigLOD` (94): the orchestrator, by grant (hoist `ANG` in `nav.js`; the frozen machine rig and engage are outside every W0b grant) | W1 or carried |

The gate reads the ruling from the plan with the same pattern as engine-gpu's rulings
(`/^<!-- r5-ruling ic-alloc-residual=carried -->$/m`). With it recorded, F7 would still FAIL on the
sprint-phase spikes above. Those need the other owners' fix below, or a second ruling on a warm-up that
includes her first sprint (gates-perf's call: it is the same question for `A-alloc-rate`).

**The other lanes' share of the waves** (attribution for gates-perf and the owners; not this lane's to
edit): hero-body — `player.js` / `playerAnimator.js` fields born as integers (`moveSpeed`, `heading`,
`fovBias`, `_fov`, `_faceX`, `velocity`, `_bobK`, `_bobPhase`, the animator's `_prevHeading`, `_yawRate`,
`_lvx/_lvz`, `_prevLvx/_prevLvz`, `_jerkX/_jerkZ`, `_leanAcc`, `_bank`, `_mx`, `_moveW`, `_flatW`,
`_puff`, `_prevSpd`, `_recentSpd`, `_headStab`) and `contact`/`contactKind` born null; engine-gpu —
`engine.camera.fov` born integer; melee — `_aimYaw`. Each one's first fractional value deoptimises every
function in the game that read the object (store 0.5 first, as `MachineScalars` now does). gates-perf —
`A-alloc-rate`'s 3 s warm-up measures exactly these waves (the player has not moved yet when its windows
open); a warm-up that includes a knockback and a sprint, or the owners' fix, is needed before its
per-function bar can grade steady state.

### The lamp films, re-filmed on this round's code (F4, 00:02 UTC; advisory, read by me, then deleted)

No judge finding cited a film this round; the eye-material change (the pulse folded into the emissive
colour) and the lamp-system edits touch what they show, so all twelve were re-filmed at last round's
angles and read:
- **calm 15 m (4°)** — a white-hot core in a bone ring, set in the graphite drum face with the iris seams
  and the bezel; the white sensor-sprite halos on the shoulder plates glow in the calm colour.
- **calm 15 m zoom, face to the sun** — the same lens, still glowing and ringed dark against sunlit
  grass.
- **wary 15 m** — a half-closed iris, chartreuse glass with a yellow-white core; the top sensor
  chartreuse.
- **hostile 15 m** — a magenta pinhole with a pink core, the blades closed around it; the top sensor
  pink.
- **dark 15 m** — the closed grey iris with the fracture and its branch; no lit glass.
- **three-quarter 15 m** — the lamp is a short barrel with the lit glass at its face.
- **calm 40 m wide** — the Tiller is a small figure mid-frame; the lamp is a white point.
- **beams at night / in fog** — a chartreuse sweep and a magenta lock shaft at night; a chartreuse shaft
  in the rain.
- **calm sunlit 15 m** — at play scale beside the palisade, a lit point on the drum.

Nothing here differs from last round's readings. The views are unchanged because three.js lights the
lens with emissive × intensity, and that product is unchanged. There is still no licence-clean reference
for an R29 judge (gap 2).

---

## W0b FIX ROUND 1 (Oct 22 2026) — what changed, by judge finding, with numbers

Both major findings are fixed in code, and no bar moved. Finding 2 is resolved: the lamp reads at noon,
and the contrast clause now grades the fixture. Finding 1 is resolved for this lane's own code: the
allocation in this lane's frames fell 4.42 MB/s → 0.78 MB/s (staged fight) and 3.71 → 0.30 MB/s
(sprint). It is not yet at gates-perf's 4 KB/s per function. What remains is driven from frozen files,
from the terrain API, and from V8's tiering; each cause is named below with its owner.

### Finding 2 — "Calm lamp does not read at noon": the bible's lamp is built; `A-weak40` grades the fixture

I built the bible's design rather than ask for a ruling. Bible §7.2 "lamp emissive ×2.5 with a core above
the bloom threshold so lenses read at noon" and §7.3 "≥ 3 : 1 luminance against the hull at noon" now hold
together (`src/instruments/lamps.js`; still ONE instanced draw for every lamp and one for every beam):

- **Core above the bloom threshold.** The hot core of the glass is `CORE_FRAC_BY_STATE` of the open
  aperture (calm/wary 0.4, hostile pinhole 0.2, so its ring is still a ring).
  - Its HDR is ×2.5 the ring's, raised until it clears the engine's live bloom threshold by ×1.25.
  - Measured against threshold 1.08: calm HDR lum 2.44, wary 1.65, hostile ×4.79 → 1.35.
  - It drives the bloom chain, so the lens glows in daylight.
- **Token ring.** Around the core, the solver still maps the ring's HDR exactly onto the token through
  the output pass. `A-lamp-states` grades this ring.
- **Lamp drum face.** The glass sits in a dark graphite face: the retracted blades and the housing in
  the closed-iris token `#3B3A36`, then a bezel. The glass is `APERTURE_MAX` 0.66 of the face radius;
  on the Tiller the face is 0.20 m and the glass 0.264 m (bible ≥ 0.25 m).
- **Barrel.** A short graphite barrel (0.85 face radii) behind the face, lit by the environment's sun
  and sky, sinks the lamp into the hull. From three-quarters it is an object, not a disc.
- **Lamp glass ×2.5** (`machine.js`). An Instrument's flat lens materials now carry ×2.5 the state
  colour (bible §10). They were capped at the token before.

**The judgement call (orchestrator may rule otherwise).** The contrast is graded against the lamp's own
drum face, not the bone glaze beyond it:
- The calm token `#F2EAD3` and bone glaze `#E6DCC8` are nearly the same colour, and a pixel tops out at
  luminance 1.0. So no lamp design reaches 3 : 1 against sunlit glaze: the ceiling is
  (1 + 0.05) / (0.82 + 0.05) = 1.21 : 1.
- The bible's 3 : 1 therefore needs a dark surround: the black backplate of a railway signal, the
  barrel of a searchlight. The judge's option 2 (a graphite or bronze drum face behind every lamp) is
  that surround. Here every lamp draws it itself, so no generator has to.
- `A-weak40` still reports the ratio against the glaze beyond the face, so nothing is hidden.

**Gate changes (no bar moved):**
- **`A-lamp-states`:**
  - Colour = the median of the lit RING pixels inside the glass edge.
  - Iris area = the lit glass (ring + core); the ring-only counts are reported.
  - New clauses `coreAboveBloomCalm/Wary/Hostile`: the core's HDR luminance exceeds the live bloom
    threshold, AND the rendered core is brighter than the rendered ring.
- **`A-weak40`** (per-kind block): the contrast clause GRADES every kind, the fixture included. The
  `|| __KB.fixture` excuse and SKIP-fixture are gone.
  - Staged on the worst light: 13:00, every heading in 5° steps, the lamp face turned to the sun's
    azimuth.
  - Lens axis · sun azimuth must be ≥ 0.9 at the 15 m placement, and the machine is moved over open
    ground until the 15 m line is clear.
  - Graded: the lit token ring against the drum face around it.
  - Reported: the core, and the bone glaze beyond the face, masked to machine pixels by a flat-ink pass
    (the old annulus counted sky).

| gate | verdict | measured |
|---|---|---|
| `A-lamp-states` | **PASS** | 15.000 m on the lens axis, game lens. **Ring colour:** calm `#f4ecd6` ΔE **0.58**, wary `#b6e621` **0.18**, hostile `#ff328d` **0.45**, dark `#3e3d39` **0.98** (bar ≤ 3). **Core above bloom:** HDR lum 2.44 / 1.65 / 1.35 > 1.08 (×2.5 / ×2.5 / ×4.79); rendered core max 0.996 / 0.944 / 0.58 against ring 0.926 / 0.806 / 0.369. **Iris:** lit glass 180 / 80 / 32 px, ratios **2.25 / 2.50** (bar ≥ 2); ring-only 128 / 48 / 28 px, 2.67 / 1.71, reported. **Rhythm:** calm rel. std 0.000, wary **1.00 Hz**, hostile **3.98 Hz**; dark sputters, then out. **Token ΔE** 25.1 / 83.1 / 42.8 (measured 25.3 / 82.5 / 42.4). **Beams:** fog (densMul 1.85) wary +42.7, hostile +42.2, calm +0.16; night +140.9 / +61.7 / 0; clear day none |
| `A-weak40:herd` | **PASS**, contrast now graded on the fixture | **Size:** hit sphere **11.2 px**, lamp face 8.6 px, lit glass **5.5 px** across at 40 m (bar ≥ 5). **Contrast:** 13:00, sun elevation 49.9°, lens axis · sun azimuth **1.00**; glass ring lum **0.843** against drum face **0.041** = **9.85 : 1** (bar 3 : 1). **Reported:** core 0.991; bone glaze beyond the face 0.127, against which the glass is 5.03 : 1 and the core 5.87 : 1 |
| `A-beams-one-draw` | **PASS** | 8 / 8 wary in rain (densMul 2.55). **1** beam draw every frame, 8 instances, 1 attributed (321 vs 320 calls). After 3 spawn/kill/dispose cycles: geometries 200 → 200, textures 120 → 120, materials 378 → 378, records 3 → 3, the same two meshes |

**The films** (`R5_IC_FILM=1 … --lane instruments-core-film`). These are re-filmed at the judge's angles,
and these are MY readings: advisory, and there is still no licence-clean reference.

| frame | what I see |
|---|---|
| `V-lamp-calm-15m` (4°) | A white-hot core glowing into a bone ring. Around it: the dark graphite face with six blade seams, then a grey bezel. A lit lens in a lamp drum, not a flat cream disc |
| `V-lamp-iris-calm-15m-zoom` (4°, face to the sun) | The same lens in full sun, still glowing and still ringed dark. Two palisade posts cut into the left foreground (see below) |
| `V-lamp-calm-sunlit-15m` (55°, face to the sun) | At play scale, a bright glowing point in a dark ring on the bone drum: the first thing the eye finds on the machine |
| `V-lamp-calm-40m-wide` (55°, 40 m, face to the sun) | Still a distinct lit point with a dark ring |
| `V-lamp-wary-15m` / `V-lamp-wary-sunlit-15m` | A half-closed iris: chartreuse glass with a yellow-white core in the dark face. It reads at noon |
| `V-lamp-hostile-15m` / `V-lamp-hostile-15m-wide` | A magenta pinhole with a pink-white core and a magenta bloom across the closed blades. At play scale, a magenta point in a dark ring |
| `V-lamp-dark-15m` | The iris closed in grey, with a jagged fracture and its branch across it; no lit glass |
| `V-lamp-calm-sunlit-threeq-15m` (40° off-axis) | The lamp is a short dark barrel set into the drum, with the lit glass at its face: an object with depth, not a sticker |
| `V-lamp-beams-night` / `-fog` | A soft chartreuse shaft sweeping from the wary lamp. The hostile shaft is fainter from this side angle (its pixel probe in `A-lamp-states`: +61.7 at night, +42.2 in fog) |
Frames are 1600 × 900, filmed at 17:04 UTC, read by me and then deleted (disk rule).
- **Palisade in the sunlit close-up.** In `V-lamp-iris-calm-15m-zoom` the sun-facing heading put two
  camp palisade posts (thin, not collision occluders) into the left of the frame. The lamp itself is
  unobstructed; the clean full-face close-up is `V-lamp-calm-15m`.
- **A failed attempt, reverted.** Staging the sunlit frames 90–150 m out put tall grass and branches
  between the camera and the lamp, so the staging is back at 30–60 m.

### Finding 1 — the memory rule on this lane's frames

**New gate: `A-alloc-machines`** (lane `instruments-core-alloc`, a runner row with its own single
Chrome; `node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane
instruments-core-alloc`).

- **Method:** gates-perf's `A-alloc-rate` method — CDP sampling heap profiler at a 2048 B interval with
  minor- and major-GC objects included, 3 s warm-up, a 10 s window per phase, self attribution per
  physical frame, graded max(KB/s, KB/frame × 60), bar 4 KB/s per function.
- **Scope:** only the frames this lane answers for, and every one of them graded (A-alloc-rate prints
  only its top 12).
- **Workload:** eight herd-role Instruments in `attack` on the staged-fight arc plus the boot roster
  (36 machines, 12 kinds), then a sprint.
- **Reported, not graded:** the frozen machine files and the rest of `src/**`, each with its owner. For
  every accessor frame it also reports who called it.
- **Diagnostic modes** (never graded): `R5_IC_NOINLINE` (one frame per function), `R5_IC_OPTSTATUS`
  (the V8 tier of each hot function), `R5_IC_TRACEDEOPT` (deopts per function), `R5_IC_MICRO` (bytes
  per call of each helper over all 36 machines in the page), `R5_IC_INGAME` (heap delta around real
  in-game calls).

**What allocated and what was done.** Every cause was measured first, either in the page or in a node
reproduction.

| # | cause (how found) | fix | where |
|---|---|---|---|
| 1 | **Megamorphic double fields.** A machine is one of a dozen classes, so `this.heading` in a shared method is megamorphic, and V8 boxes a megamorphic read or write of a Double field. Proven in node: 8 classes, 122 B per 40-machine pass vs 1.6 B monomorphic | the per-frame doubles live on ONE monomorphic object per machine, `machine.sc` (`MachineScalars`, 30 fields + caches), behind `get`/`set` pairs on `Machine.prototype` with the old names, so every other file is unchanged. The read-mostly doubles (`bodyRadius`, `turnRate`, `walkSpeed`, `runSpeed`, `sightRange`, `sightHalf`, `eyeHeight`, `height`, `standoffHalfLen`, `hearRange`, `attackRange`, `maxHealth`) stay own fields, added as `null` first so V8 gives them the Tagged representation. A megamorphic read then returns the stored number without boxing (node: 1.6 B vs 122 B), which helps the frozen readers too | `machine.js` |
| 2 | **Megamorphic cfg rows.** Every kind's `cfg()` merge has its own shape, so `c.susEnter`, `c.scanPeriod` and the rest box | `cfg()` builds each merged row with Tagged fields (null first) | `ai/tables.js` |
| 3 | **Doubles crossing calls.** A double argument or return value is boxed whenever the call is not inlined: `_turnToward(want)` returned `d`, `_steerAlong(dx, dz, …)`, `moveRoot(dx, dz)`, `THREE.MathUtils.damp/clamp`, `Vector3.set/setScalar/lerp`, `Quaternion.setFromAxisAngle`, `Color.lerp` | the steering helpers pass doubles through ONE module scratch object `_st` (`turnS`, `faceS`, `moveTowardS`, `steerAlongS`, `navTowardS`, `stepRootS`). `damp`, `clamp`, the lerps and the axis-angle quaternion are written out. The named methods keep their signatures as one-line wrappers | `machine.js`, `index.js`, `ai/perception.js`, `lamps.js` |
| 4 | **Prototype loads under stub-cache pressure.** `this._turnS(dt)` is a megamorphic load of a prototype-held property, and the game's megamorphic stub cache is far over capacity. A miss on a prototype property allocates a load handler. Proven in node: 12 classes × 200 names = 5.1 KB per frame of 7,200 loads, 3 B at 8 names | the per-frame helpers are module functions called directly (`conformM`, `updateEyesM`, `updatePartsM`, `updateElementalM`, `updateFxM`, plus the steering set). The names hot loops read on every machine are own fields from construction (`meleeStandoffHalfLen`, `_partsHidden`, `_fleeing`, `_downT`, `_lampState`, `_lampPrev`). `tickCooldowns` and `animate` are tested once, at construction | `machine.js` |
| 5 | **Per-frame Map rewrites.** `AttackPicker.tick` counted five hold maps down every frame with `for (const [k, v] of map)` (an iterator and an entry array per step) and `map.set(k, n)` (a boxed double). Measured: 200 B per machine per frame | the maps hold EXPIRY times on the picker's own clock (`_now += dt`, exactly the dt the countdown used). `_held(map, id)` drops an entry the first time it is asked after expiry, the same moment the countdown deleted it. The published `blindRings()` and `unreachableRings()` return the same seconds-left. Measured after: 0.3 B per frame over 36 machines | `ai/attacks.js` |
| 6 | **`Matrix4.decompose` + `compose` per lamp** (16 B per lamp, node), and `updateWorldMatrix(true, false)` per lamp per frame (a megamorphic walk up each rig) | the lamp and beam instance matrices are written from the anchors' world matrices in the scene's `onBeforeRender`, after the renderer's `updateMatrixWorld` and before the instance upload: exact for the frame, no walk, element by element (max error 2.3e-7 vs decompose/compose) | `lamps.js` `_writeMatrices` |
| 7 | **Keyed loads by state name** (`LAMP_STATES[s]`, `this.hdr[s]`, `EYE_COLORS[s]`): a megamorphic keyed lookup that misses the same cache | state → index by comparison; the solved values as flat `Float64Array`s by index | `lamps.js`, `machine.js` |
| 8 | **Float modulo** (`x % 1` in the 4 Hz flicker): allocates in V8's mid tier; the staged fight is all hostile lamps | `x - Math.floor(x)` | `lamps.js`, `machine.js` |
| 9 | **Material writes every frame** (eye glass, body strips) and part glows reading a double from `userData` (a different shape on every part) | written only when the value changed (`e.last`, `sc._eEmis`, `sc._ePulse`); the pulse seed is an integer (milli-radians) | `machine.js`, `parts.js` |
| 10 | **Terrain samples.** `terrain.getHeight(x, z)` / `getNormal` box both arguments on every call | `_conform` samples only when the root moved, and the normal (which only steers a tilt eased at 3.5/s) every 0.25 m of travel. `hasLOS` samples the drawn surface (`heightFast`, inlinable) | `machine.js`, `ai/perception.js` |
| 11 | **Per-tick objects**: `{ radius, look }` per `nav.steer` call, `lastStimulus = { … }` per hearing tick, `for…of` loops | one reused object each; indexed loops | `machine.js`, `ai/perception.js` |
| 12 | **The accessor frames.** Frozen files read `m.heading` / `m._speed` / `m._accelPitch` megamorphically every frame (`collision._syncMachines`, `gait.update`, `gait.updateCheap`, `melee.surfaceGap`) | each getter returns ONE boxed copy per change (a Tagged `_pb*` field), not a fresh HeapNumber per read: `get heading` 150 → 13–21 KB/s | `machine.js` |

**Measured** (`A-alloc-machines`, run D, port 5254, the last code). The "before" column is the same
gate on this tree before the fix (`report-alloc0.json`, 13:31 UTC).

| this lane's frames | before | after |
|---|---|---|
| sum, staged fight | 4,420 KB/s (37 fps) | **777 KB/s** (43 fps) |
| sum, sprint | 3,707 KB/s | **304 KB/s** |
| `Machines.update` (`index.js`) | 1,815 / 1,845 | **1.6** (sprint) — the passes split out: `_standoffPass` 20 (fight), `_separationPass` < 1, `_stepMachines` < 1.6 |
| `_updateEyes` | 573 / 382 | `updateEyesM` 75 / 29 |
| `_conform` | 324 / 319 | `conformM` 98 / 40 |
| `_steerAlong` + `_navToward` + `_moveToward` + `_turnToward` + `_applyStep` | 873 / 582 | 130 / 15 |
| `perception.update` | 240 / 213 | `_scan` + `_sight` + `_belief` 104 / 55 |
| `AttackPicker.tick` (`ai/attacks.js`) | 14 / 13, and 200 B per machine per frame in the page | **5.9** / < 0.7 in the profile; 0.3 B per frame over 36 machines in the page |
| `lamps.js` (`update`, `paramSig`, `readOutputParams`, `_lightUpdate`, `lampGain`) | 128 / 21 | `update` 102 / < 0.7 |
| accessor frames (`get heading` / `_speed` / `_accelPitch`; did not exist) | — | 56 / 35 |

**Frames still over 4 KB/s, and why.**

- **`conformM` (98 / 40).** Two `terrain.getHeight(x, z)` arguments are boxed per moving machine per
  frame. The normal is now sampled every 0.25 m, and a standing machine samples nothing.
  - Owner: world-ground. The W1 binding condition (plan §8.3) serves `getHeight` bilinear from the
    baked grid, a function small enough for V8 to inline, which removes the boxing.
- **The accessor frames (56 / 35).** Called from `gait.update` / `updateCheap` / `_homeWorld`
  (frozen), `collision._syncMachines` (frozen spatial) and `melee.surfaceGap` (melee lane).
  - Owner: the orchestrator, by grant. Reading `m.sc.heading`, `m.sc._speed` and `m.sc._accelPitch`
    there makes them 0. Each getter already returns one box per change instead of one per read (150 →
    22 KB/s for `heading`).
- **`steerAlongS`, `navTowardS`, `_statePatrol`, `_engageFrame` (≈ 173 / 42 together).** These are
  physical frames, so they are charged what V8 inlines into them: frozen `nav.steer` builds a 7-element
  array literal per call (`ANG`), and frozen `engage.update` / `pursue` and the squad steps take
  doubles as arguments.
  - Evidence: called over all 36 machines in the page (`R5_IC_MICRO`), `steerAlongS` measured 7 B and
    `turnS` 4 B per frame of 36 calls, against `nav.steer` at 6–19 KB.
  - Owner: the orchestrator, by grant. Hoisting `ANG` in `nav.js` to module scope is one line.
- **`lamps.update` (102 in the fight, < 0.7 in the sprint), `updateEyesM`, `_scan`, `_standoffPass`
  (≈ 257 / 78 together).** These are once-per-frame or tiny functions. In the 10–25 s after boot that
  the gate measures, V8 still runs them in its baseline or mid tier, where double arithmetic and
  `Math.*` calls box. The same code called in a loop in the page, where it is optimised, allocates
  ≈ 0: `lamps.update` 11.5 B, `_scan` 1.3 B, `_standoffPass` 0.3 B per frame-equivalent.
  - Tiers seen at the end of the fight (`R5_IC_OPTSTATUS`): `_scan`, `turnS`, `conformM` and the
    manager passes in Maglev; `lamps.update` optimized, but de-optimized at least once.
  - I found no source-level change that holds in every tier. A longer warm-up in the gate would not
    move the bar and would measure steady state.
  - gates-perf decides whether warm-up length is part of the method; I have not changed it.
- **Legacy species files (`longleg`, `glinthawk`, `stormbird`, `scrapper`; 4–15 KB/s each).** These
  kinds are deleted at the W2 exit (instruments-b, §6) and were left as they are.

**Global `A-alloc-rate`** (gates-perf's row, their unmerged W0b module imported read-only, run against
this tree): **FAIL** build-wide, as before.
- `src/**` totals 64.0 MB/s self (98 MB/s caller-attributed) against a bar of 64 KB/s.
- The worst frames belong to other owners: frozen collision `_meshPush` 13.6 MB/s and `raycast`
  11.8 MB/s; terrain `noise2D` 12.7 and `getHeight` 11.1; `engine.render` 10.5; frozen `clipLayer`
  5.9; `playerAnimator._springs` 7.7.
- This lane's frames in its over-bar list are only `conformM` 194 KB/s and `_statePatrol` 123 KB/s, at
  their 31 fps. Before this round, `Machines.update` sat in its top 12 at 1.8 MB/s.

---

## W0b — what was built, by deliverable

### 1. `LAMP_STATES` — the lamp grammar (bible §7.2), iris + one-draw beam
`src/instruments/lamps.js` (new). Shape, then motion, then colour:

| state | token | iris (lit area) | rhythm | beam |
|---|---|---|---|---|
| calm (patrol, return) | `#F2EAD3` | 100 % | steady | never |
| wary (suspicious, search) | `#B5E61D` | 50 % | 1 Hz pulse (trough 0.55) | sweeping ±14° at 0.5 Hz toward `lastKnown` |
| hostile (alert, attack, stagger, downed) | `#FF2D8C` | 20 % (pinhole) | 4 Hz flicker (trough 0.30) | locked on the player's chest |
| dark (dead, a lamp hit for 6 s, Clouded = `stunT`) | `#3B3A36` | closed, cracked | 0.55 s sputter of the last colour, then out | never |

- **Two instanced draws for every lamp of every Instrument** (`LampSystem`, owned by the manager as
  `machines.lamps`): one `InstancedMesh` of lamp drums and one `InstancedMesh` of additive
  64-segment cones (the beams, §4.1 "1 draw"). A lamp drum is the face disc plus a short barrel, and
  the lens, the core, the six swept blades, the drum face, the bezel and the dark fracture are all one
  shader; capacity is 128. A kind registers its lamp once with `machine.addLamp(at, { radius })`;
  nothing is per machine (no geometry, material or texture). The states, colours and apertures are
  written in `Machines.interpolate()`. The instance matrices are written in the scene's onBeforeRender,
  from fresh world matrices. Both paths are allocation-free, and records self-prune when a machine is
  disposed.
- **Fix round 1: the lamp reads at noon** (judge finding; see "W0b FIX ROUND 1" above).
  - **Core:** a hot core above the bloom threshold (bible §7.2) inside the token ring.
  - **Drum face:** a dark graphite drum face around the glass (the retracted blades and the housing).
  - **Barrel:** a graphite barrel lit by the sun and sky, sinking into the hull.
  - **Lens size:** on the Tiller the lens is 0.264 m across in a 0.40 m face.
- **The ring on screen is the token.** The engine tone-maps (ACES), sRGB-encodes and grades every
  pixel in one output pass, so the ring carries the HDR value that the output pass maps back onto the
  token. This is `outputInverse`: the grade, the sRGB transfer and the ACES fit inverted analytically,
  then Newton on an exact copy of the forward pass.
  - **Core value:** the core is ×2.5 the ring's HDR, raised until it clears the live bloom threshold
    by ×1.25.
  - **Re-solve:** it runs only when exposure, a grade uniform or the bloom threshold changes (a cheap
    change test per frame, plus the full signature every 64 frames).
  - **Allocation:** a re-solve allocates nothing.
  - **Lamps are not lit like the hull:** they never cast shadows, are not fogged, and their G-buffer
    copy is skipped. A `scene.onBeforeRender` chain hides both draws when `scene.overrideMaterial` is
    set (the GTAO normal/depth pass), so one draw stays one draw.
- **Beams** are drawn only in wary/hostile and only when the air carries them: aerial-fog density
  multiplier > 1.2 (`environment.weatherParams.densMul`) or `nightFactor` > 0.5. Length = the
  machine's sight range × `perceptionScale`; half-angle 5°; brightness falls with length (`along²`)
  and toward the silhouette (`|n·v|²`). Fixed this round (from the films): the cone is scaled
  non-uniformly (radius × radius × length) and its normals were not taken through the inverse scale,
  so every normal leaned down the axis and the shaft read as a flat, hard-edged wedge that grew
  brighter with length; normals now go `M (n / s²)` (= `R S⁻¹ n`). Fog boost raised from
  `0.35 (densMul − 1)` to `0.8 (densMul − 1)` so a beam reads in daytime fog.
- **Every glow the machine owns follows the same grammar** (`machine._updateEyes`): eye sprites,
  flat emissive lenses and shell sensor strips use `lampStateFor` / `lampGain` on the SIM clock;
  `EYE_COLORS` are the four tokens (legacy kinds included, until they go at W2). The Round-4
  white-hot windup flash stays only on machines WITHOUT an iris lamp (the legacy kinds' dodge cue).
- **The Tiller fixture** (`src/instruments/kinds/tiller.js`) registers its drum lamp at body
  `[0, 2.28, 2.085]`, face radius 0.20 m (fix round 1; was 0.18) (just in front of the generator's lens dome, riding the head
  bone); the drum lamp is its weak point, and a precise hit darkens it for 6 s (`lampDarkT`, which
  also blinds its perception: sight range 0, no omni).
- Published for shell-ui (W2): `COMPASS_PIP` (the lamp tokens + apertures for the compass ◆), and
  `SCANNER_TOKENS` / `SCANNER_HIGHLIGHTS` (bible §9.7 paper / ink / cobalt), so no HUD file re-types a
  lamp colour.

### 2. `ctx.machines.roles`, kind auto-registration, per-kind tables (W0a; graded again at W0b)
Unchanged from W0a (contract below). New this round: `A-roles-published` now GRADES its last clause,
"`tools/gate-roster.mjs` resolves every role": it runs gates-perf's `ROSTER` prelude in the page and
requires every role to resolve to the published kind (herd → `tiller`) or to `null` with a SKIP label,
and the roster's `STAGED_KINDS` to hold no legacy kind. The module is read from the tree, or from
`R5_GATE_ROSTER` until gates-perf merges; with neither the gate is PENDING by name, never PASS.

### 3. Perception weather hook + `perceptionScale`
`src/instruments/lib/weather.js` (new): `perceptionScale(env)` — `environment.perceptionScale` when
world-sky publishes it (W1, authoritative), else bible §2.3 by the weather NAME (`trade`/`clear` 1.0,
`calima`/`fogbank` 0.5, `squall`/`rain` 0.8) and night ×0.7 (`nightFactor` blend), the smaller
applying. `ai/perception.js` multiplies every Instrument's sight range by
`machines.perception.sightScale` (read once per sim step). No edit to `environment.js`.

### 4. The perk hooks (§3.2 contract, bible §4.7) and the Dust-sight occlusion flag
`machines.perception` (`PerceptionHooks`, `ai/perception.js`) and `machines.stimulus.addNoiseFilter`
(`ai/stimulus.js`, +7 lines of the ≤ 10 granted):
- `perception.detectMul` (default 1) multiplies the sight FILL RATE of every Instrument that has not
  found her (calm, wary); alert/attack/stagger/downed are unchanged ("Read as true": 0.5).
- `perception.flagDuration` (default 8 s; "Shrug": 3). A Flag is raised by a machine whose perception
  row says `flags: true` (or `machine.flagsOnSight`) when it goes alert BY SIGHT with a lit lamp (a
  dark lamp cannot Flag); every Instrument within `flagRadius` (60 m) is marked (`machine.flagMark`),
  searches toward her, and the mark clears when the Flag ends. Events `flagged`, `flag-ended`.
- `stimulus.addNoiseFilter(fn)` → remover; `fn(ev)` sees every stimulus first; `false` drops it.
- Dust-sight: `perception.addDustCloud({ x, y, z, r, seconds })` → remover; a cloud blocks every
  Instrument's line of sight through it (`hasLOS`); `machine.dustOccluded` (5 Hz) is THE occlusion
  flag — Dust on the line from her eye, or calima beyond 24 m; `perception.outlined(m)` =
  `dustSight && m.dustOccluded` is what shell-ui's Sighting overlay outlines (W2).

### 5. `uv1` survives the fold
`rig/lod.js` (`normalizeAttrs` + `mergeByMaterial`, 5 lines of the ≤ 6): a merge group whose material
samples the second UV set (any texture with `channel === 1`, or `material.userData.uv1 === true`)
keeps `uv1` through the merge (and gets zeros for a member that lacks it); groups that do not
sample it still drop it. Same grant: `INSTRUMENT_PALETTE` (bible §7.1 / §9.1: bone, celadon,
oxblood, bronze, verdigris, graphite, vermilion, staff white) and `unifyMaterials(m, { quantise:
'instrument' })`; `quantise: true` keeps the Round-4 palette for the legacy kinds, `false` (the
Tiller) keeps a generated kind's own palette.

### 6. The VFX palette
`src/instruments/lib/vfx.js` (new, no imports): `VFX_COLORS` — Cinder / Brine / Dust element ramps
(bible §5.8), salt-crust glints, bronze chips (the `rig/fx.js` default spark and `_arcFlash`, was ice
blue `0xbfe8ff`), the loot beacon (was cyan), the Seized plate tint, late flame (no longer lerps to
the hostile lamp), sensor ping rings (the calm token). Every machine emitter in `machine.js`,
`ai/attacks.js`, `rig/fx.js`, `legacy.js` and the legacy species files reads it; `parts.js` sensor
parts start in the calm token.

### 7. R34 — the role-based memory workload (A90b 3/3, A90-rig-reclaim 5/5)
`Machine._releaseOnDispose()` (the last step of a disposed machine): lamp record and Flag mark
released, every SkinnedMesh skeleton disposed and unbound, bone arrays emptied, the subtree cut from
`root`, and every field still pointing into it nulled, so a stale reference to a Machine retains a
shell, not a sculpt. `index.js` `releaseBuildScope(m)` rebuilds `machine._rot` over the rig alone,
so `autorig.buildRig`'s closure scope (the replaced Meshes) can be collected (measured before: 2
detached Meshes per live auto-rigged machine).

### 8. `tools/gates.r5.kind-block.mjs` — the per-kind block
`kindBlock({ kind | role, lane, class, fixture, suffix })` returns the 25 §9 rows for one kind (ids
`<§9 id>:<kind or role>`); the module's own `GATES` is `[]` so auto-discovery registers nothing by
itself. The Round-4 per-species rows are vendored VERBATIM (bars unchanged) with the
"one machine per species" prelude replaced by "one machine of KIND". Fixture clauses that are
fidelity-only (A-sil40 pair set, A-weak40 glaze contrast, A42 / A-linked-attack components, V26 /
V27 / V-lineup) report `SKIP-fixture` with the measured numbers. Hand-over: the orchestrator at W1;
instruments-a/-b/-c/-d call it for their kinds.

### 9. Gate-file hygiene for the W0b-exit scans (this round)
- **No species literal, no old-map coordinate** in either gate file (gates-perf `A-gate-preludes`
  grades every lane's file at its exit): the old kind names the static scans need now come from the
  spec (bible §10.2's "old kind" column, plan §6's IP row; the corrupting kind from the W0a base's
  doctrine), the probe kind spawns relative to `REST_SITE`, and the vendored A47c's
  `SPRAWLERS = [two Round-4 kinds]` became `[...species.keys()]` (plan §9 A47c: "mass height ≤ 0.75
  × the locomotion pose height (sprawler rule)" for every Instrument). gates-perf's own scanner, run
  in a scratch copy of its tree with these two files dropped in: 0 offenders in both.
- **The lamp films are not registered by default** (`R5_IC_FILM=1` registers them). This lane's §9
  block has 0 visual gates (A-lamp-states grades the lamp from rendered pixels); the films are
  advisory frames with no licence-clean reference yet, and gates-perf's `A-reference-set` would count a
  registered visual row without one against this lane.
- **Brand lexicon (code lint)**: brand's `namecheck.mjs --code`, run on a scratch copy with brand's
  lint folder: the coined `brineFrost` became `seizedTint`; `type: 'tearblast'` (a Round-4 arrow
  name used as a damage label; `takeDamage` reads only `fire`/`shock`/`freeze`) became `'tear'`; the
  vendored comments that named Round-4 kinds were reworded; the gate no longer writes `brittleT`
  (the Brine hit already seizes the plates). One pair remains in `kind-block.mjs`:
  `scene.overrideMaterial` (three.js API, A-sil40's flat-ink pass) — brand, please allowlist it for
  `tools/gates.r5.kind-block.mjs`.

---

## Contracts published (exact signatures; W0b additions — the W0a contract follows in the W0a report)

### Fix round 3 changes (exact; internal to this lane unless marked CONTRACT)

- **`src/instruments/lib/hot.js`:**
  - `HOT.ppos` is now the player's own `THREE.Vector3`, held by reference. It is read-only to lane code, and
    no lane code writes it.
  - `HOT.events` is the event bus: per-machine code emits with `safeEmit(HOT, name, payload)`.
  - New export: `mutableFromBirth(o: object): object`. It writes every own, writable data field once with a
    different value of the same kind and then back. Accessors, frozen fields and functions are skipped.
  - `HOT` itself is passed through `mutableFromBirth` at load.
- **`machine.js`:**
  - The `MACHINE_SCALARS` accessors keep their names and values. The sentinel is born NaN, so the first read
    always re-boxes the real value. This is graded by `A-published-scalars`.
  - `EyeRecord(mat, base, kind, part)` gains three fields:
    - `mode`: 0 sprite, 1 basic, 2 emissive;
    - `col`: the `THREE.Color` it writes, which is `mat.emissive` or `mat.color`;
    - `op`: the last opacity or intensity written (−1 = never).
  - New exports: `tickTimersM(sc, dt): void` and `stateClockM(sc, dt): void`, which hold `Machine.update`'s
    own arithmetic.
  - The `Machine` constructor declares these fields up front, undefined or null:
    - `_doctrineSnapped`, `onAlerted`, `_flee`;
    - the legacy species' `_soar`, `_pingClock`, `_cadBand`, `_cadLoop`, `_cadence`, `_groundHold`,
      `_perchPhase`.
  - `_emisCols` holds the strips' emissive `THREE.Color`s.
- **`index.js`:**
  - `Machines.update` calls `refreshHot` through `Reflect.apply` and reads her position from `HOT`.
  - `_spawnCls` runs `mutableFromBirth` on the machine, its `sc` and its `ai`.
  - `_machineNodes()` returns the same count, without closures.
- **`ai/perception.js`:**
  - **CONTRACT behaviour:** `hasLOS(target)` keeps an occluder result for `OCCL_TTL` = 0.25 s, as long as the
    machine's eye and her body each stay within `OCCL_MOVE` = 0.5 m. It calls `collision.occluded` through
    `Reflect.apply`.
  - `hear(x, z, strength, kind)` grounds `_hearPos.y` with `terrain.getHeight(x, z)` and sets `_hearLure`
    (a Smi).
  - `PerceptionHooks` is unchanged.
- **`lamps.js`, CONTRACT:**
  - `BEAM` adds `gainWary: 1.0`, `gainHostile: 1.6`, `gainHostileFog: 2.7`, `fogFull: 2.55` and
    `flickerLowHostile: 0.65`.
  - The beam's air boost is `0.6 + 1.0 × max(0, fogK − 1) + 0.9 × night`, capped at 2.5. The fog term was 0.8.
  - A lock beam's cone is min(sight range × weather scale, distance to her chest), fading as along^0.5 to
    nothing on her. A sweep keeps along².
  - The `aBeam.w` attribute is that fade exponent.
  - `lamps.audit()` and the record shape are unchanged.
- **`ai/attacks.js`, `kinds/tiller.js`:** no API change (indexed loops; both gait entry points loaded every
  call).
- **Gates** (`tools/gates.r5.instruments-core.mjs`):
  - new `A-published-scalars` (lane `instruments-core`);
  - new `A-film-beams-night-probe` and `A-film-beams-fog-probe` (film lane, `R5_IC_FILM=1`);
  - `A-alloc-machines`: the R46 (c) label `frozen-return`, for `_steerAlong` only, plus the three new
    diagnosis modes;
  - the beam films' staging.

### Fix round 2 additions (internal to this lane; not contracts for other lanes)

- `src/instruments/lib/hot.js`: `HOT` (fields `root, player, terrain, nav, engine, environment, collision,
  frame, boxedFrame, playerX, playerZ, simTime, pOk, ppos, pHealth, pMoveSpeed, pCrouch, pTallGrass`),
  `refreshHot(ctx): void` (once per frame, first thing in `Machines.update`), `playerBoxes(): void`.
- `machine.js`: `class EyeRecord(mat, base, kind, part)`, `normalizeEyeRecords(m): void`,
  `lkBoxes(m): void`; `Machine.prototype` accessors unchanged in name and value (each now returns one box
  per changed value).
- `ai/perception.js`: `Perception._belief(pd)` keeps its signature (gates); the game calls
  `_beliefTick()` with the seconds in `this._pd`. `PerceptionHooks._dustPass()` still refreshes every
  machine; the game runs `_dustSlice(k)` round-robin (each machine once per 0.2 s).

### `ctx.machines.lamps` — `LampSystem` (`src/instruments/lamps.js`)
```
lamps.attach(machine, anchor: Object3D, { radius = 0.13 } = {}) -> record | null   (one lamp per machine; null at capacity, with one console.warn)
lamps.detach(machine) -> boolean
lamps.stateOf(machine) -> 'calm' | 'wary' | 'hostile' | 'dark'
lamps.lampHdr(stateId) -> { r, g, b } | null      the solved RING value (a copy)
lamps.coreHdr(stateId) -> { r, g, b, k, lum } | null   the core: ring HDR x k (k >= 2.5, raised to clear the bloom threshold x1.25), its HDR luminance (fix round 1)
lamps.beamsOn() -> boolean                          densMul > 1.2 or nightFactor > 0.5
lamps.audit() -> { lamps, beams, capacity, lampDraws, beamDraws, solves, fogK, night, beamsOn, states }
lamps.update()                                      called by Machines.interpolate() once per rendered frame (states, colours, apertures)
lamps._writeMatrices()                              the instance matrices, from the scene's onBeforeRender (fresh world matrices, before upload)
lamps.lampMesh, lamps.beamMesh, lamps.group         the two instanced draws (and their parent in the scene)
lamps.records, lamps.beamDraws, lamps.lampDraws, lamps.beamCount, lamps.fogK, lamps.night
lamps.hideBeams = false                             gate/debug: draw the frame without the beams
lamps.dispose()                                     (Machines.dispose())
record = { machine, anchor, radius, phase, state, prev, since, aperture, dir, beamOn, slot, bslot, bmode, bt, blen }   (machine.lamp)
```
Module exports: `LAMP_STATES` (frozen `{ calm, wary, hostile, dark }` rows `{ id, token, aperture,
beam, rhythm, hz, sweepHz? }`), `LAMP_ORDER`, `LAMP_HEX`, `COMPASS_PIP` (`{ state: { color,
aperture } }`), `LAMP_CANON` (the five forbidden Horizon colours), `SCANNER_TOKENS`,
`SCANNER_HIGHLIGHTS`, `BEAM` (`{ fogK: 1.2, night: 0.5, halfAngleDeg: 5, segments: 64, sweepDeg:
14, capacity: 128 }`), `APERTURE_MAX` (0.66 of the face radius; was 0.86), `CORE_FRAC` (0.4),
`CORE_FRAC_BY_STATE` (`{ calm: 0.4, wary: 0.4, hostile: 0.2, dark: 0.4 }`, of the current aperture radius),
`CORE_GAIN` (2.5), `BEZEL_IN` (0.93), `BARREL_DEPTH` (0.85 face radii), `LAMP_RHYTHM` (`{ pulseLow:
0.55, flickerLow: 0.3 }`), `lampStateFor(machine)`, `lampGain(state, t, phase)`,
`outputForward(x, P)`, `outputInverse(t, P)`, `LampSystem`; re-exports `WEATHER_PERCEPTION`,
`NIGHT_PERCEPTION`, `perceptionScale`.

### On every machine (`machine.js`)
```
machine.addLamp(at: Object3D | [x, y, z] body-space, { radius = 0.13 } = {}) -> record | null
                      radius = the lamp FACE (glass = APERTURE_MAX of it); the barrel sinks 0.85 radii behind the face
                      an array makes an anchor facing +Z under machine.body (call BEFORE buildRig, so the rig carries it)
machine.lamp          the record, or null
machine.lampDarkT     seconds left dark after a precise hit on the weak point named 'lamp' (6 s, bible §7.3)
machine.flagMark      the Flag this machine searches toward, or null
machine.dustOccluded  boolean, 5 Hz (the Dust-sight occlusion flag)
machine.flagsOnSight  staging override of the perception row's `flags`
PERCEPTION.default.flags = false                     a kind row sets `flags: true` (the sentry role, W1)
EYE_COLORS = { calm, wary, hostile, dead: the four tokens, flash }   VFX_COLORS re-exported
machine.sc            MachineScalars: the per-frame doubles (heading, _speed, _accelPitch, strafeK, suspicion, _unseenT,
                      _stateT, playerDist, detectFill, scanOffset, health, lampDarkT, stunT, burnT, _burnDps, clocks,
                      _alarmCd, _attackCd, ...); Machine.prototype get/set pairs keep every old name working
MACHINE_SCALARS       the moved names (array)
stepRoot(m, dx, dz), stepRootS(m)    the shared root step (camp ring + world rim); stepRootS reads _st.sx/_st.sz
_st                   the steering scratch { want, d, x, z, fx, fz, speed, out, sx, sz }
turnS(m, dt), faceS(m, dt), moveTowardS(m, dt), steerAlongS(m, dt), navTowardS(m, dt)   (read/write _st)
conformM(m, dt), updateEyesM(m, dt, t), updatePartsM(m, dt, t), updateElementalM(m, dt), updateFxM(m, dt)
                      the machine's per-frame helpers as module functions; the methods of the old names stay as wrappers
picker._now, picker._held(map, id)   ai/attacks.js: the hold maps (cd, missed, stalled, blind, unreach) hold expiry times
```

### `ctx.machines.perception` — `PerceptionHooks` (`ai/perception.js`) and the noise filter
```
perception.detectMul      number, default 1      x sight fill rate while not alert/attack/stagger/downed
perception.flagDuration   seconds, default 8     read when a Flag is raised
perception.flagRadius     metres, default 60
perception.dustSight      boolean, default false
perception.calimaClear    metres, default 24
perception.sightScale     read-only per step: perceptionScale(environment)
perception.weather        read-only per step: the weather name it was read from
perception.clock          sim seconds
perception.flag           { active, source, t0, until, duration, raised, ended }
perception.flagPlayer(source?: Machine) -> flag | null
perception.addDustCloud({ x = 0, y = 0, z = 0, r = 3, seconds = 10 } = {}) -> remover()
perception.dustBetween(a: {x,y,z}, b: {x,y,z}) -> boolean
perception.outlined(machine) -> boolean          dustSight && machine.dustOccluded
perception.update(dt)                            from Machines.update, once per sim step
perception.audit() -> { detectMul, flagDuration, dustSight, sightScale, weather, clouds, flag, flagged }
events: 'flagged' { source, duration }, 'flag-ended' { duration, lasted }
FLAG = { duration: 8, radius: 60 }, CALIMA_CLEAR_M = 24                (exports of ai/perception.js)

machines.stimulus.addNoiseFilter(fn: (ev) => false | void) -> remover()   false drops the stimulus; edits to ev stand
```

### `src/instruments/lib/weather.js`, `lib/vfx.js`, `lib/color.js`
```
WEATHER_PERCEPTION = { trade: 1, clear: 1, overcast: 1, calima: 0.5, fogbank: 0.5, squall: 0.8, rain: 0.8, storm: 0.8 }
NIGHT_PERCEPTION = 0.7
weatherName(env) -> string;  perceptionScale(env) -> number in [0, 1]
VFX_COLORS = { cinderHot, cinderMid, cinderLate, brineHot, brineMid, brineLate, dustHot, dustMid, dustLate,
               saltGlint, bronzeChip, beacon, seizedTint, flameLate, sensorPing }   (three.js colour ints)
hexToRgb, rgbToHex, srgbToLinear, linearToSrgb, rgbToLab, deltaE2000(labA, labB), deltaE(a, b), SHARMA_PAIRS, sharmaCheck()
```

### `rig/lod.js`, `index.js`
```
INSTRUMENT_PALETTE: THREE.Color[8];  PALETTES = { legacy, instrument }
unifyMaterials(machine, { quantise: true | 'instrument' | false, ... })
mergeByMaterial: a group keeps uv1 when its material samples channel 1 (or material.userData.uv1 === true)
Machines.interpolate()   (main.js frame loop: once per rendered frame)   Machines.dispose()
```

### `tools/gates.r5.kind-block.mjs`
```
kindBlock({ kind?, role?, lane = 'kind-block', class = 'medium' | 'small' | 'large' | 'colossal', fixture = false, suffix = ':' + (kind || role) }) -> row[25]
KIND_PRELUDE(spec) -> string     page prelude: KIND, KIND_NOTE, FIXTURE, wait, simSleep, flatSpot, stageKind, freezeAll, freezeOne, holdStill, thaw, park, skipNoKind
lampStatesAssert(spec) -> string  core's A-lamp-states for any kind
PIX                               page prelude: canvas pixel capture after the composer
SIZE_CLASS                        §4.1 classes;   GATES = []
```

---

## Gates (port 5254, this tree, Oct 22 2026)

### Fix round 3 — the runs that grade this round (Oct 23; supersede every table below wherever they differ)

Port 5254, this tree, one Chrome at a time through the machine-wide slots. The box was shared: load 2.4–6.4,
and the other lanes' Chromes were alive.

- **`A-alloc-machines`:** PASS in 9 consecutive runs (R8–R16), the last three on the final source. The run
  table and residual are in the fix-round-3 section above.
- **The lane block, run L3** (`--lane instruments-core`, 08:14–08:54 UTC; source of R8–R10 plus the lock fade):
  20 PASS, 1 FAIL, 1 PENDING.
  - **`A-lamp-canon-distance` FAILED, then was fixed.** The colours were unchanged; the failure was the static
    clause that the beam tint is built from the tokens. That clause reads `lamps.js` for `const LA =
    this._linA … B[ob] = LA[si * 3] * k` within 200 characters, and my new comment sat between the two. I moved
    the comment, and the row re-ran **PASS** (L3canon, 28 tokens, min ΔE 24.7, Sharma error 4.2e-5).
  - **`A-kind-block-file` is PENDING on the calima clause only (R46).** 19 rows PASS, 5 are SKIP-fixture,
    `A-weak40:herd` is PENDING on calima, and `A41c` passed 5 of 5.
  - **PASS, with numbers:**
    - `A-published-scalars` (new): 0 of 150 first reads wrong, 0 of 180 on a machine, negative control 30/30;
    - `A-lamp-states`: ring colour ΔE 0.58 (calm) and every clause true, including all the beam clauses;
    - `A-beams-one-draw`: 1 draw for 8 beams, baselines restored;
    - `A-perception-weather`: calima ×0.499 (34.03 → 16.98 m);
    - `A-perk-hooks`: every clause true;
    - `A-uv1-survives-fold`, `A-vfx-palette`;
    - `A90-rig-reclaim` 5 of 5, `A90b` 3 of 3;
    - `A-no-override`, `A-no-corruption` (600 s), `A-roles-published`, `A-boot-roster`, `A-legacy-collapse`,
      `A-kind-registration`;
    - A37: 0 seen samples while hidden;
    - A39: suspicious 1.86 s, alert 3.54 s at 30 m;
    - A43: scene objects −280;
    - `A90-rig-reclaim@ic`, `A90b@ic`.
- **After fix #9, the only change after L3 (run Q5):** all PASS on the final source.
  - A1, A20b, `A-published-scalars`, `A-lamp-states`, `A-beams-one-draw`, `A-perception-weather`,
    `A-perk-hooks`, A37 and `A-lamp-canon-distance`;
  - A39 at 30 m: suspicious 1.84 s, alert 3.50 s.

  These rows were not re-run after #9, which only moves when the lamp phase is drawn: `A-legacy-collapse`,
  `A-kind-registration`, the two n-run rows, `A-kind-block-file`, `A-no-override`, `A-no-corruption`,
  `A-roles-published`, `A-boot-roster`, `A-uv1-survives-fold`, `A-vfx-palette`, A43, and the two `@ic` memory
  rows.
- **The films** (`R5_IC_FILM=1`, FILM3 and FILM6):
  - 12 NEEDS-JUDGE frames, read by me (fix-round-3 section);
  - `A-film-beams-night-probe` and `A-film-beams-fog-probe` PASS;
  - the PNGs were deleted.
- **Global list, run G3** (before #9):
  - A1, A20b PASS;
  - **A90** PASS: heap −5 %, textures −28, objects −1,091 over 28 kills;
  - `A90-memory-stability-expansion`, `A90-rig-reclaim` (12 kinds), `A90b-memory-attribution` PASS;
  - `A-ID-ip-assets-gone`, `A-assets-tracked` PASS;
  - **A9** PASS: 58.3 fps, 310 draws, scene GPU 19.2 ms;
  - **A21:**
    - draws (310 / 196 / 324 ≤ 350) and triangles (≤ 4.23 M) PASS;
    - **`medianGpuMs` FAIL: 78.6 / 97.2 / 81.7 ms against 20**;
    - p95 PENDING (not attributable).

    Round 2 measured 125 / 154 / 83 ms on an unstable box and reported it PENDING. This tree has none of
    engine-gpu's tier levers (DPR cap, GTAO resolution), and R45 grades A21's GPU terms at the orchestrator's
    quiet run. No change this round touches the render path except the beams, which are not drawn in A21's
    scenarios.
  - `A-licence-manifest` PENDING, on pipeline's clauses (third-party, legacy-source, credits; R42);
  - `A-alloc-rate` timed out waiting for `__READY__` in G3. It was re-run alone (G4, then Q5 on the final source).
- **gates-perf's `A-alloc-rate` on the final source (Q5):**
  - Its instrument PASSES. Its bars are graded at the orchestrator's global run (R48 b/c): build-wide 98 MB/s,
    top owners terrain, collision, engine and playerAnimator.
  - Its instruments-core row now lists:
    - frozen `engage.update` 370 KB/s, `squad._updateHerds` 158, `engage.pursue` 135, `search` 102,
      `sites` 86 (R46 a, frozen);
    - three lane frames within 3 s of its staging: `steerAlongS` 103 (fight), `_statePatrol` 102 (sprint and
      draw), `navTowardS` 44;
    - Tiller `animate` 43 (inlined-frozen).
  - **`updateEyesM` is gone from it** (1,544 KB/s in G4, before #9).
  - The three lane frames are its 3 s warm-up measuring the transient as the fight starts: wrong-map deopts
    while more kinds join the polymorphic sites (`R5_IC_GPSEQ` timed them at 2–12 s after staging). With
    `A-alloc-machines`' 30 s warm-up, the same frames read ≤ 1.3 KB/s (`_statePatrol`; `steerAlongS` and
    `navTowardS` 0) in every window of R8–R16.

### Fix round 2 — the runs that grade this round (supersede every table below wherever they differ)

All on port 5254 in this tree, one machine-wide Chrome slot per batch (plan §0 rule 8), at most one Chrome
of this lane alive, load average 2.5–5.4 with other lanes' judges running (so A9 / A21's timing terms are
R45's: PENDING-quiet-box). Reports and logs: `scratchpad/r5/instruments-core/report-F*.json`,
`run-F*.log`.
- **Batch 1** (23:07–00:04 UTC): F0 boot check, F1 `A-alloc-machines`, F2 the lane block
  (`--lane instruments-core`, every row incl. the nested 5/5, 3/3 and per-kind-block runs), F3 the global
  list items in this tree, F4 the lamp films. Two behaviour-neutral edits landed while F2 ran (23:16 and
  23:20: `_sight` / `_beliefTick` read their inputs up front; same arithmetic): its first three runner rows
  (`A-legacy-collapse`, `A-kind-registration`, `A90-rig-reclaim-5of5`) started before them, every later
  row ran on the edited code.
- **F5 / F6** (00:04): `A-alloc-machines` and gates-perf's `A-alloc-rate` retried.
- **F7 / F8** (00:11): `A-alloc-machines` on the code after the `EYE_RGB` change, and a re-run of the rows
  that code touches (`A1`, `A20b`, `A-lamp-states`, `A-vfx-palette`, `A-perk-hooks`, `A39`).
- **F9 / F10** (01:21–01:29): `A-alloc-machines` on the final source (lens records normalised at
  construction), and `A1`, `A20b`, `A-lamp-states`, `A-beams-one-draw`, `A-perk-hooks`, `A-vfx-palette`,
  `A37`, `A39`, `A43` re-run on it: **all PASS** (A39: 30 m suspicious 1.81 s / alert 3.48 s, 10 m alert
  0.86 s; A43: scene objects −279, 0 orphans).
- **F11** (01:32): `A-alloc-machines` with the corrected paired-run rule (below).
- **F12 / F13** (01:37–01:45): the final source, with `PerceptionHooks` fields born Double too. It ran
  `A-alloc-machines`, then `A1`, `A20b`, `A-lamp-states`, `A-perception-weather`, `A-beams-one-draw`,
  `A-perk-hooks`, `A-vfx-palette`, `A37`, `A39`, `A43`: **all PASS** except `A-alloc-machines`.
  Numbers: A39 30 m suspicious 1.77 s, alert 3.51 s; A43 scene objects −280, 0 orphans.

| gate | verdict | run | measured |
|---|---|---|---|
| `A-lamp-states` | **PASS** | F2, F8 | ring ΔE calm 0.58 / wary 0.18 / hostile 0.39 / dark 0.98 (≤ 3); core HDR 2.44 / 1.65 / 1.35 over bloom 1.08; iris lit px 180 / 80 / 32 (ratios 2.25 / 2.50); wary 0.98 Hz, hostile 4.04 Hz, calm rel. std 0; dark sputters then out; beams in fog and at night only |
| `A-lamp-canon-distance` | **PASS** | F2 | 28 graded tokens, 0 offenders |
| `A-beams-one-draw` | **PASS** | F2 | 1 beam draw per frame for 8 instances (321 vs 320 calls); geometries, materials, textures, lamp records back to baseline after 3 cycles |
| `A-perception-weather` | **PASS** | F2 | trade 34.03 m, calima 16.98 m (×0.499), night 24.04 m (×0.706), `detectMul` halves the fill |
| `A-perk-hooks` | **PASS** | F2, F8 | `detectMul` 0.2779 / 0.5559 = ×0.500 calm, ×1.000 hostile; Flag 3.004 s with Shrug (control 8 s); footstep filter 0 vs > 0; Dust-sight occlusion flag |
| `A-uv1-survives-fold` / `A-vfx-palette` | **PASS** / **PASS** | F2, F8 | uv1 kept within 1e-4 in the decal group, dropped elsewhere / 19 live colours, closest ΔE 18.7 (bar 15) |
| `A-roles-published` / `A-kind-registration` / `A-legacy-collapse` / `A-boot-roster` | **PASS** ×4 | F2 | herd → tiller, 11 R18 nulls / a dropped module registers in a scratch copy / 11 legacy kinds behind `legacy.js` / READY 3.4 s |
| `A-no-override` / `A-no-corruption` | **PASS** / **PASS** | F2 | 0 hits, removal-only / 600 s, 2,366 samples, 0 corrupted |
| `A90-rig-reclaim` **5 / 5** | **PASS** | F2 | geometry growth 0 / +1 / 0 / +1 / 0, textures 0 |
| `A90b-memory-attribution` **3 / 3** (R34) | **PASS** | F2 | 0 offenders in each run |
| `A37` / `A39` / `A43` (`@ic`, on the fixture) | **PASS** ×3 | F2, F8 | peak suspicion 0 while hidden / 30 m: suspicious 1.74 s, alert 3.55 s; 10 m: alert 0.85 s / scene objects −278, 0 orphans |
| `A-kind-block-file` | **PENDING** (calima only) | F2 | 19 PASS + 5 SKIP-fixture + `A-weak40:herd` PENDING; `A41c` 5 / 5; A44 / A45 / A45c / A46 / A47 / A48 PASS on the lattice-conformed root |
| `A-weak40:herd` | **PENDING** (calima) | F2 | size 5.5 px (≥ 5); contrast min(9.46, 5.15) = **5.15 : 1** (≥ 3); calima PENDING (world-sky W1) |
| `A-alloc-machines` | **FAIL** | F12 | lane frames over the bar: `_sight` 13.8 (first-sprint window), `_steerAlong` 13.9 (first fight window); every other lane frame ≤ 4 KB/s in all six windows; residual (legacy, accessor, inlined-frozen) awaits the ruling; see the fix-round-2 section |

**Global list items present in this tree (F3, F6):**

| gate | verdict | measured |
|---|---|---|
| `A1-boot-clean` / `A20b-no-system-errors` | **PASS** / **PASS** | playing / 0 system and hook errors, 356 frames |
| `A90-memory-stability` | **PASS** | 28 kills, heap −5.4 %, geometries +9, textures −28, objects −1,092 |
| `A90-memory-stability-expansion` | **PASS** | objects −1,057, non-machine growth 0, orphans 0, geometries +3 |
| `A90-rig-reclaim` (Round-4 row) / `A90b-memory-attribution` | **PASS** / **PASS** | geometries +7, textures 0 / 0 offenders |
| `A9-perf-budget` | **PENDING** (R26 / R45) | draws 310 (< 350 PASS); fps 38.8 not attributable (null frame 6.0 ms GPU) |
| `A21-real-draw-calls` | **PENDING** (R45 timing terms) | draws 310 / 196 / 324 (≤ 350 PASS), triangles 4.12 / 3.67 / 4.23 M (≤ 6.5 M PASS) |
| `A-ID-ip-assets-gone` / `A-assets-tracked` | **PASS** / **PASS** | 19 GLBs, 0 IP hits / 221 referenced, 0 missing |
| `A-licence-manifest` (pipeline) | **PENDING** | pipeline's third-party / legacy-source / credits clauses (R42); this lane added no asset |
| `A-alloc-rate` (gates-perf's unmerged W0b module) | **FAIL** build-wide | F6: `src/**` 93,163 KB/s caller-attributed (bar 64), worst `collision._meshPush` 13,171 KB/s; F3's attempt timed out waiting for `__READY__` in its own Chrome on a loaded box |

Not in this tree: `A90-abs`, `A-vram-ledger`, `A-port-guard`, `A-carried-suite` (gates-perf), the brand lints.

### Fix round 1 — the runs that grade this round (supersede the first-round tables below wherever they differ)

There were two runs, each under one machine-wide Chrome slot (plan §0 rule 8), with at most one Chrome
of this lane alive. Other lanes' judges and agents held the second slot throughout (load average
2.9–7.6). Reports are in `scratchpad/r5/instruments-core/report-{lane1,glob1}.json`.
- **Run E** (`lane1`, 15:32–16:13 UTC): `--lane instruments-core`, the whole block, including the
  nested 5/5, 3/3 and per-kind-block runs.
- **Run F** (`glob1`, 16:41–16:52 UTC): the global-list items in this tree, plus `A-alloc-machines`,
  gates-perf's `A-alloc-rate`, and the two rows that needed a re-run (`A-lamp-canon-distance`,
  `A-roles-published` with `R5_GATE_ROSTER`).

| gate | verdict | run | measured |
|---|---|---|---|
| `A-lamp-states` | **PASS** | E | see the fix-round section (ring ΔE 0.58 / 0.18 / 0.45 / 0.98; core above bloom ×3; iris 2.25 / 2.50; 1.00 / 3.98 Hz) |
| `A-lamp-canon-distance` | **PASS** | F | 28 graded tokens, 0 offenders, min ΔE 20.1; beam tint from the tokens (the check now follows the tint into the flat `_linA`; in run E it printed FAIL on that regex alone) |
| `A-beams-one-draw` | **PASS** | E | 1 beam draw per frame, 8 instances; baselines restored |
| `A-perception-weather` | **PASS** | E | trade 34.03 m, calima 16.98 m (×**0.499**), night ×0.706, `detectMul` ×0.500 |
| `A-perk-hooks` | **PASS** | E | `detectMul` ×0.500 calm / ×1.000 hostile; Flag **3.003 s** with the perk (control 8 s, ±0.1); footstep stimuli **0** with the filter / **49** without (10 s jog); Dust-sight occludes, outlined only with the perk |
| `A-uv1-survives-fold` | **PASS** | E | `uv1` kept in the decal group, error < 1e-4; dropped in the plain group |
| `A-vfx-palette` | **PASS** | E | 19 live colours, 0 offenders, closest ΔE 18.7 (bar 15) |
| `A-roles-published` | **PASS** | F | 12 roles, herd → `tiller`, 11 null with R18 notes; gate-roster resolves every role (`R5_GATE_ROSTER` → gates-perf's `tools/gate-roster.mjs`; PENDING in run E only because the variable was not set) |
| `A-kind-registration` | **PASS** | E | a dropped module registers in a scratch copy; A1 / A20b PASS there |
| `A-legacy-collapse` | **PASS** | E | 11 legacy kinds behind `legacy.js`, one door; a row deleted in a scratch copy boots clean |
| `A-no-override` / `A-no-corruption` / `A-boot-roster` | **PASS** ×3 | E | 0 hits in 145 files and removal-only 14/14 / 600 s with 2,349 samples and 0 corrupted / READY 3.71 s with 14 alive |
| `A90-rig-reclaim` **5/5** | **PASS** | E | geometry growth +1 / +1 / +1 / +1 / 0, textures 0 (bars +40 / +30) |
| `A90b-memory-attribution` **3/3** (R34) | **PASS** | E | 0 offenders in each run; `autorig.js:75` bones 816 created, 0 held; post-GC heap −8.7 / −6.2 / +4.6 % (bar < 25 %) |
| `A-kind-block-file` | **PASS** | E | 20 PASS + 5 SKIP-fixture (A42, A-linked-attack, V26, V27, V-lineup), 0 FAIL; `A41c` **5 / 5**. `A-weak40:herd` contrast **graded: 9.85 : 1**; A44 / A44b 0.00 m; A45 0.00 m; A45c 0 m/frame; A46 0.00 m; A47 0.02 m; A48 1.26 Hz in band; A21-with-kind 318 draws |
| `A37-stealth-approach@ic` / `A39-detection-curve@ic` / `A43-corpse-lifecycle@ic` | **PASS** ×3 | E | peak suspicion 0 / suspicious 1.80 s and alert 3.52 s at 30 m, alert 0.87 s at 10 m / scene objects −280, 0 orphans |
| `A-alloc-machines` (new, the memory rule on this lane's frames) | **FAIL** (45 frames > 4 KB/s) | F | this lane's frames sum to **777 KB/s** in the fight and **304 KB/s** in the sprint (before: 4,420 / 3,707); per-frame causes in the fix-round section |

**Global list items present in this tree (run F):**

| gate | verdict | measured |
|---|---|---|
| `A1-boot-clean` | **PASS** | `state=playing` |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 231 frames |
| `A90-memory-stability` | **PASS** | 28 kills; heap **−5.5 %**, geometries **+7**, textures −28, objects −1,092 |
| `A90-memory-stability-expansion` | **PASS** | objects −1,057, non-machine growth **0**, orphans 0, geometries +1, heap −11.6 % |
| `A90b-memory-attribution` (Round-4 workload) | **PASS** | 0 offenders, post-GC heap −11.9 % |
| `A90-rig-reclaim` (Round-4 row, all 12 kinds) | **PASS** | geometries +8, textures 0; per live machine geo 0, tex 0.38 |
| `A9-perf-budget` | **PENDING** (R26: not attributable) | draws **310** (< 350, PASS); fps 34.1, but the gate's own empty frame costs 5.58 ms of GPU at load ~5, so the deficit is contention |
| `A21-real-draw-calls` | **PENDING** (GPU terms) | draws 310 / 196 / 326 (≤ 350 PASS), triangles 4.12 / 3.67 / 4.23 M (≤ 6.5 M PASS) |
| `A-ID-ip-assets-gone` / `A-assets-tracked` | **PASS** / **PASS** | 19 GLBs, 0 IP hits / 221 referenced, 0 missing |
| `A-licence-manifest` (pipeline) | **PENDING** | pipeline's own clauses (third-party, legacy-source, credits); this lane added no asset |
| `A-alloc-rate` (gates-perf's W0b module) | **FAIL** build-wide | `src/**` 64.0 MB/s self (bar 64 KB/s); this lane's frames in its over-bar list: `conformM` 194 KB/s, `_statePatrol` 123 KB/s (31 fps); the rest belong to other owners |

Not in this tree: `A90-abs` and `A-vram-ledger` (gates-perf), and the brand lints. `A-legacy-gone`
grades from W2.

### First W0b round (kept for the record; superseded above)


Runs (each under one machine-wide Chrome slot, PLAN §0 rule 8 amendment; at most one Chrome of this lane
alive at any time — runner rows go first and their nested runs are sequential; load average 2.5–5.5,
other lanes' gate Chromes alive): **run A** 08:52–09:07 UTC (the page block, 14 / 14 PASS), **run B**
09:29–09:42 (the scratch-copy probes and the N-run memory rows, 4 / 4 PASS), **run C** 09:42–09:53
(`A-kind-block-file`, PASS), **run D** 09:53–10:05 (the global list items in this tree + a re-run of the
two lamp gates on the final code). Reports: `scratchpad/r5/instruments-core/report-{ra,rb,rc,rd}.json`.

**Summary: the W0b block is 21 / 21 PASS on this port** (10 W0b rows + the A90-rig-reclaim and A90b
shadow rows through their 5/5 and 3/3 runners + A37 / A39 / A43 on the fixture + the 6 W0a rows),
the per-kind block 20 PASS + 5 SKIP-fixture, and the global items in this tree PASS except `A9` (PENDING
by R26 on a loud box; main fails the same term in an interleaved A/B), `A21` (PENDING, GPU terms
unattributable; draws and triangles PASS) and pipeline's `A-licence-manifest` (PENDING on pipeline's
own clauses).

### This lane's W0b block (§9 `instruments-core`) + the W0a rows it keeps green

| gate | verdict | measured |
|---|---|---|
| `A-lamp-states` | **PASS** (run A, 42 s; re-run in run D) | Tiller fixture (role `herd`, R28), camera 15.000 m on the lens axis, rendered pixels after the composer. Colour at the rhythm peak: calm `#f2ead3` ΔE **0.00**, wary `#aee318` ΔE **1.06**, hostile `#ff2f8c` ΔE **0.19**, dark `#3d3b37` ΔE **0.77** (bar ≤ 3). Iris lit px 294 / 112 / 52 → ratios **2.63 / 2.15** (bar ≥ 2), dark aperture 0 after a real precise hit on the lamp weak point. Rhythm (periodogram over 2.4 sim-s): calm rel. std **0.000**, wary **1.00 Hz**, hostile **4.00 Hz** (±15 %); dark: 0.55 s sputter (luminance range 0.391, 200 lit px of the old colour) then out (range 0.000, 0 lit). Consecutive tokens ΔE **25.1 / 83.1 / 42.8** (measured 25.4 / 83.2 / 42.2; bar ≥ 25). Beams (side view, 9 × 9 px at 3/5/7 m, 10 paired frames with/without the beam draw): overcast fog (densMul 1.85) wary **+96.8**, hostile **+35.8**, calm +0.23 with no beam; night (nightFactor 0.97) wary **+76.0**, hostile **+62.2**, calm 0; clear day: no beam in any state (bar: visible ≥ +6, none < 1.5) |
| `A-lamp-canon-distance` | **PASS** (run A, node) | CIEDE2000 checked first against the Sharma pairs (max err 4.2e-5). 28 graded tokens/literals: LAMP_STATES, COMPASS_PIP and the beam tint calm **24.7** / wary **27.8** / hostile **26.6** / dark **41.0**; SCANNER_TOKENS paper **20.1**, ink 33.8, cobalt 26.7; every lamp-context colour literal in `src/instruments/**` and `src/entities/machines/**` (incl. `vfx.js` sensorPing 24.7); 0 offenders (bar ≥ 20). Lamp tokens vs scanner highlights: min ΔE **10.6** (dark vs ink; bar ≥ 10). Listed, not graded (owner named): `ui/focus.*`, `hud.*`, `inventory.css`, `items.js`, `places.js`, `tallneck.js` (Round-4 UI/props, shell-ui W2 / world-props W1), 4 sensor-part BODY colours (their emissive lamp colour is graded), the dead `rig/shells.js` default |
| `A-beams-one-draw` | **PASS** (run A, 27 s; re-run in run D) | 8 wary Tillers in rain (densMul **2.55**): **8 / 8** lamps wary, **1** beam draw every frame (40 frames, min = max = 1), **8** instances; frame calls wary 321 vs calm 320 on the same frozen frame → **1** attributed draw; calm: 0 beam draws, 0 instances. After a warm cycle, spawn/kill/dispose × 3: geometries **200 → 200**, textures **120 → 120**, scene materials **378 → 378**, lamp records **3 → 3**, the same two meshes and geometries (uuids) |
| `A-perception-weather` | **PASS** (run A, 38 s) | Sight range by bisection to 0.08 m, player dead ahead in the open, the machine perception-only on the sim clock: trade **34.03 m** (sightRange 34; ±5 %), calima **16.98 m** → ratio **0.499** (bar 0.5 ± 5 %), fogbank 16.98 m, trade again 34.03 m; night 24.04 m (×0.706, bible 0.7). `sightScale` 1 / 0.5 / 0.708. detectMul ×0.5 probe: fill 0.5559 → 0.2779 → **0.500** (first run read 0.531: the first samples after a change carried the previous tick's value; the probe now settles 0.25 sim-s, ≥ 2 perception ticks, before sampling) |
| `A-perk-hooks` | **PASS** (run A, 54 s) | each with its negative control (R31): **detectMul** 0.5 → calm fill at 20 m 0.5559 → 0.2779 (×**0.500**), hostile 0.5559 → 0.5559 (×**1.000**); **flagDuration** 3 → Flag lasted **3.010 s**, control **8.006 s** (±0.1), the 3 recipients facing away all in `search` and marked, marks cleared at the end, the Flag raised by the flagging machine's own `setState('alert')` → `flagPlayer` (no gate frame in the stack); **noise filter** dropping footsteps → **0** footstep stimuli over a 10 s jog (median speed 4.78 m/s), control **49** (4.58 m/s), 0 emitted from gate code, filter removed after; **Dust-sight**: no cloud → not occluded, not outlined; a cloud on the line → `dustOccluded` true, outlined only with the perk, and the Instrument cannot see through it; cloud removed → not occluded. Player movement by synthesized `KeyboardEvent`s into `input.js` |
| `A-uv1-survives-fold` | **PASS** (run A, 5 s) | a generated 8.4 KB GLB (gltf-transform): 2 meshes on a decal material reading `TEXCOORD_1` (three `channel === 1`), 2 on a plain one. After `foldMachineMeshes`: decal group merged ×2 with `uv1` present, max error **3.0e-8** over 192 vertices (bar 1e-4); plain group merged ×2, `uv1` dropped, `uv` kept |
| `A-vfx-palette` | **PASS** (run A, 29 s) | static: 130 colour literals in 52 files of `src/entities/machines/**` + `src/instruments/**`, 0 within ΔE 15 of `#38c6ff` / `#19ffd0`; `rig/fx.js` default spark and `_arcFlash` = `VFX_COLORS.bronzeChip`. Live: every spawnable kind (12) driven through hit, tear, fire/freeze/shock, explosions, default arc and spark, every attack flash colour, its own FX functions, burn/seized/Clouded statuses, death and beacon; **19** distinct colours seen, 0 offenders, closest `#bde6e3` (Brine mid) at ΔE **18.7**. Listed (combat-kit W2): 25 near-blue literals in `src/combat/**` |
| `A-roles-published` | **PASS** (run A) | 12 roles exactly; herd → `tiller` (R28 note); 11 null, each with an R18 note naming kind, lane, wave; 0 legacy mapped; 0 forbidden ids; `roles.herd` spawns a non-legacy `tiller`. **gate-roster clause graded**: gates-perf's `ROSTER` prelude (from `R5_GATE_ROSTER`, its W0b worktree) resolves herd → `tiller` and the other 11 to null with their SKIP labels (R30 / R28 / R18); `STAGED_KINDS` = [tiller], 0 legacy |
| `A-kind-registration` (W0a, re-run) | **PASS** (run B, 62 s) | a new module `zz-icprobe.js` dropped into a scratch copy (spawning relative to `REST_SITE`; the only difference from this tree): A1, A20b PASS; `icprobe` registered, model loaded, own perception/engage rows merged over `default`, 2 attacks, mode `table`, elem 77, audio set `icprobe`, 1 spawn row, 1 live at boot, role null. The fixture in the same page: 4 attacks, elem 110, audio `tiller`, 3 live, role `herd` |
| `A90-rig-reclaim` **5/5** (`A90-rig-reclaim-5of5`, shadow row on the staged role kinds) | **PASS** (run B, 291 s; 5 fresh-page runs, one Chrome at a time) | **5 / 5 PASS**; 30 spawn/kill/dispose cycles of the Tiller each: geometry growth **+1 / 0 / 0 / 0 / 0** (bar ≤ +40), texture growth **0 / 0 / 0 / 0 / 0** (≤ +30); per live machine (8 Tillers) geo **0**, tex **0.38–0.63** (≤ 1 each); held-then-released ≤ +1 geo |
| `A90b-memory-attribution` **3/3** (R34, role-based workload; `A90b-memory-attribution-3of3`) | **PASS** (run B, 238 s; 3 fresh-page runs) | **3 / 3 PASS**: 30 kills each followed by a respawn of the herd role's kind (30 / 30 respawned, 0 failed); **0 offenders**, **0 at the `machine.js` model clone or the `autorig.js` bones** (autorig.js:75 bones: 816 created, 0 attached, 0 detached-retained, 0 held unreachable — W0a held ≈ 24 per 30 kills); post-GC heap **−3.1 / −0.8 / −7.5 %**; scene objects 3058 → 2561, geometries 158 → 164, textures 119 → 107 after the corpse lifecycle |
| `A-kind-block-file` | **PASS** (run C, 660 s) | shape: exports `kindBlock()`, `GATES = []`, all 25 §9 ids present, parameterised by kind (`{ kind: 'plumb' }` gives 25 rows suffixed `:plumb`), lane honoured. The block on the fixture (role `herd`, class medium), one nested fresh-page run: **20 PASS + 5 SKIP-fixture, 0 FAIL**; `A41c-sustained-variety` **5 / 5** clean runs (1 in the block + 4 fresh pages). Per-row numbers in the table below |
| `A37-stealth-approach` (shadow `@ic`, herd role) | **PASS** (run A) | crouched in tall grass 20 m → 3 m behind the Tiller: peak suspicion **0**, never left patrol, 165 samples, 0 seen while hidden |
| `A39-detection-curve` (shadow `@ic`) | **PASS** (run A) | 30 m: suspicious at **1.84 s**, alert **3.53 s** (bars ≥ 1.5 s / 3.0–4.6 s); 10 m: alert **0.86 s** (≤ 1.5 s) |
| `A43-corpse-lifecycle` (shadow `@ic`) | **PASS** (run A) | 8 Tiller wrecks frozen, faded, disposed, 8 respawns scheduled; scene objects 3233 → 2955 (**−278**, bar ≤ +40); 0 orphans retaining a disposed machine, 0 FX meshes left |
| `A-no-override` (W0a, global) | **PASS** (run A, 13 s) | 145 `src/**` files, **0** raw hits of the §9 regex (comments included, no allowlist), 0 code hits, 0 mechanic identifiers; removal-only **14/14** deletions-only vs `9d3b891` (`ai/stimulus.js`, which W0b edits again under its own ≤ 10-line grant, is proved on its W0a commit); 12 spawnable kinds × 12 asked states → 0 forbidden; FSM 9 states |
| `A-no-corruption` (W0a) | **PASS** (run A, 605 s) | 0 code hits in 138 files; staged the old corrupting kind (read from the W0a base's doctrine) + 6 others within 9 m for **600 s**: 2,361 samples, **0** `corrupted`, 0 `_corruptor`, 0 corruption events, up to 8 engaged at once |
| `A-boot-roster` (W0a lane guard) | **PASS** (run A) | READY 3.66 s after navigation; 14 alive at `__READY__` (6/3/3/2), damage wrapper installed at construction (`hookTries` 0), deferred half +0.65 s, boot roster not re-spawned |

### The per-kind block on the Tiller fixture (run C; `--lane instruments-core-kind` runs the same rows)

| row | verdict | measured |
|---|---|---|
| A44 / A44b socket integrity | PASS / PASS | lamp anchor and lamp weak point on the hull: gap **0.00 m** alive and +2 s dead (bar ≤ 0.10) |
| A45 no-skate / A45c foot continuity | PASS / PASS | stance drift **0.00 m** over 36 windows, 6.3 m walked (≤ 0.06); planted toe **0.00 m/frame** (≤ 0.12), 465 planted samples |
| A46 ground truth | PASS | planted \|y − terrain\| **0.00 m** on all 6 feet, 507 samples (≤ 0.08) |
| A47 / A47b / A47c corpse | PASS ×3 | penetration/float **0.03 m** / posed **0.029 m**; mass: the sprawler rule (reference = the locomotion chassis median 1.663 m, plan §9 A47c) |
| A48 cadence | PASS | **1.12 Hz**, band 0.70–2.11 for a 5 m body, moving frames only (5.0 s, 34 plants) |
| A-weights-authored | PASS | 25,445 vertices, **0** wrong-dominant, **100 %** rigid |
| A-sil40 | PASS (+ pair clause SKIP-fixture) | side **60 px**, front **62 px** tall at 40 m (≥ 20); no second non-legacy kind for the IoU pairs until W1 |
| A-weak40 | PASS (contrast clause SKIP-fixture, value reported) | hit sphere **11.2 px**, lamp disc 7.8 px, lit glass **6.8 px** across at 40 m (36 px within ΔE 10 of the token; bar ≥ 5); glass vs hull **4.78 : 1** at 13:00 trade (bar 3 : 1; see gap 1 — this depends on the hull's shading). Fixed this round: the first run read 3.2 px because grass and props between camera and lamp were counted; the size read now shows the machine and its lamp alone (haze and output pass still applied) and counts only inside the projected disc |
| A-lamp-states (core's gate on the kind) | PASS | as in the lane row |
| A41b / A41d / A41c attacks | PASS ×3 | A41b: band 4.2–14 m covered with no holes (hopper-burst, drum-shove, herd-trample observed); A41d: 0 failures, 0 starved over 12 bearings; A41c: 0 failures, the same move sequence on a seeded replay, **5 / 5** runs |
| A42 stagger / A-linked-attack | SKIP-fixture | the fixture has no tearable tool yet (species lane fidelity pass) |
| A-glb-budget | PASS | 32,960 tris (≤ 35 k), 24 bones (≤ 30), 2 materials, 309,880 B (≤ 400 KB) |
| A21-with-kind | PASS | staged fight **316** draws (≤ 350); the kind's own draws **6** = class budget (3 main + 1 caster × 3); lamps + beams are the shared `machines.lamps` draws |
| A90-expansion-with-kind / A90-rig-reclaim-with-kind | PASS / PASS | 30 kills + respawns: objects −462, non-machine growth 0, orphans 0, geo +5, tex −11, heap −0.2 %; 30 cycles: geo 0, tex 0, per live 0 / 0.5 |
| V26 / V27 / V-lineup | SKIP-fixture | staged and filmed, judged on the species lane's fidelity pass (bible §7.5) |

### Run D — the global green list items that exist in this tree, + the two lamp gates on the final code

09:53–10:05 UTC, load average 4.4–5.5 (two other lanes' gate Chromes alive), one
`--extra` slot: a combiner module in scratch re-exporting this lane's `GATES` + pipeline's (the
orchestrator's "combiner" route).

| gate | verdict | measured |
|---|---|---|
| `A1-boot-clean` | **PASS** | `state=playing`, 0 console errors |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 229 frames |
| `A9-perf-budget` (R26) | printed **FAIL** on its fps term; **PENDING by R26** (load average 4.4–5.5; R26's quiet box is < 3) | draws **310** (< 350, PASS; W0a 309 + the lamp draw). fps 42.2, scene GPU 55.3 ms; the gate's own null-frame probe read 0.57 ms at that instant while `A21` in the same run read a 6.61 ms null frame. **Interleaved A/B, same minutes, this tree vs main `a953355` (W0a)**, one slot: tree **38.1 / 41.8** fps (scene GPU 53.5 / 46.3 ms), main **40.6 / 41.6** fps (50.2 / 47.8 ms) — main fails the same term at this load; median 40.0 vs 41.1 fps (−2.7 %, inside the run-to-run spread); draws 310 vs 309 |
| `A21-real-draw-calls` | **PENDING** (Round-4 attribution) | draws **310 / 196 / 324** (spawn vista / west herd / staged fight; ≤ 350 PASS), triangles **4.12 / 3.67 / 4.23 M** (≤ 6.5 M PASS); GPU and p95 terms not attributable (null frame 6.61 ms GPU, burst 1.84×). Its staged fight still names Round-4 kinds (gates-perf re-casts it by role) |
| `A90-memory-stability` | **PASS** | 28 kills; heap **−10.9 %** (< 25 %), geometries **+9** (≤ 40), textures **−28** (≤ 8), scene objects **−1,091** (≤ 60) |
| `A90-memory-stability-expansion` | **PASS** | objects −1,057, non-machine growth **0**, orphan roots **0**, geometries +3, heap −11.5 % |
| `A90b-memory-attribution` (Round-4 workload) | **PASS** | 28 kills, **0** offenders, 0 orphaned textures, post-GC heap **−13 %** |
| `A90-rig-reclaim` (Round-4 row, all 12 spawnable kinds) | **PASS** | 30 cycles: geometries **+9** (≤ 40), textures **0** (≤ 30); per live machine geo 0, tex 0.25 (≤ 1) |
| `A-ID-ip-assets-gone` (pipeline) | **PASS** | 19 GLBs, 0 IP hits, 0 without provenance; `aloy.glb` a scheduled exception (hero-body W0b exit) |
| `A-assets-tracked` (pipeline) | **PASS** | 221 referenced assets, 0 missing, 0 ignored; the four R30 GLBs deleted and not served |
| `A-licence-manifest` (pipeline) | **PENDING** — pipeline's clauses, not this lane's | files-matched, row schema, code rows, licence texts, size PASS; third-party (archive SHA-256 re-fetch), legacy-source (scheduled deletions) and credits PENDING. This lane added no asset this wave (the `uv1` probe GLB is built in memory and never written) |
| `A-no-override` | **PASS** | as in run A (0 raw hits in 145 files; removal-only 14/14) |
| `A-lamp-states` (final code) | **PASS** | calm `#f2ead3` ΔE 0.00, wary `#afe31a` 0.96, hostile `#ff318c` 0.39, dark `#3e3c38` 0.98; iris 272 / 112 / 52 px → 2.43 / 2.15; rhythm 0 / 1 / 4 Hz; beams fog wary +105.0 / hostile +85.7 / calm −0.2, night +221.1 / +150.6 / −0.1, clear day none |
| `A-beams-one-draw` (final code) | **PASS** | 8 / 8 wary, 1 beam draw every frame, 1 attributed; baseline geometries / textures / materials / lamp records restored after 3 cycles |

Not in this tree yet (other lanes' W0a/W0b files, not merged): `A90-abs`, `A-alloc-rate`,
`A-vram-ledger`, `A-port-guard`, `A-carried-suite` (gates-perf); `A-no-horizon-terms-player`,
`A-no-horizon-terms-code` (brand W0b); `A-reach-all-sites`; `A-legacy-gone` grades from the W2 exit.

### Advisory: gates-perf's W0b memory gates on this lane's code (not in this tree; run from a scratch copy)

gates-perf's `A-alloc-rate`, `A-vram-ledger` and `A90-abs` (their unmerged W0b worktree, `ef89f75`),
copied to scratch with THIS tree's `src/` and served on 5254 (10:17–10:24 UTC, load 3.5–4.4). Not this
lane's gates and not graded here; reported because the memory rule is Kevin's first bar.

| gate | result | what it says about this lane |
|---|---|---|
| `A-alloc-rate` | FAIL build-wide: `src/**` 83 MB/s (bar 64 KB/s); worst `noise2D` terrain.js 18.7 MB/s; then `getHeight` (terrain), `raycast` / `_meshPush` / `occluded` / `sphereQuery` (frozen collision), engine.js:1352, `_springs` (playerAnimator) | this lane's frames over 4 KB/s: `Machines.update` (index.js, 1.8–2.3 MB/s graded) and the frozen `gait.js` `update` (1.8–2.1 MB/s) |
| `A-vram-ledger` | FAIL: render targets 437.8 MB at DPR 1.5 (bar 170), total 622.8 MB (bar 450); textures 105.5 MB and geometry 79.5 MB inside their bars | engine-gpu's tier decision, not this lane's |
| `A90-abs` | FAIL on the GPU-process term only: 1,570.9 MB (ceiling 1,500); post-GC JS heap **83.2 MB** (ceiling 450) after 30 kills + 30 respawns | the JS heap after this lane's workload is far inside its ceiling |

**Is any of it this round's?** A sampling heap profile (CDP `HeapProfiler`, 10 s, 8 hostile Tillers + the
roster, 36 machines) of this tree against main `a953355` (W0a), back to back on 5254: self allocation in
machine frames is the same before and after — `Machines.update` 1,205 → 1,072 KB/s, `_updateEyes`
429 → 353 KB/s, `gait.update` 369 → 441 KB/s, `_conform` 241 → 210 KB/s, `perception.update` 121 →
152 KB/s — and `lamps.js` and the `PerceptionHooks` do not appear among the allocating frames (the
re-solve path was made allocation-free this round: 20,000 solves, heap delta ≤ 0). The profile is
dominated by double boxing in Round-4 code paths (terrain height, nav steer, collision raycasts, the
O(n²) separation loop in `Machines.update`), present on main before this lane's W0b work. See gap 10.

### The lamp films (advisory; read by me against their criteria — no licence-clean reference yet)

`R5_IC_FILM=1 … --lane instruments-core-film`, 8 frames, 1600 × 900. Iris rows are filmed through a
4° lens (`camera.zoom`) from 15.0 m on the lens axis so the iris can be read; the wide rows at the game
lens (55°). Centre-pixel colours read from the PNGs.

| frame | what I see | vs its criterion |
|---|---|---|
| `V-lamp-calm-15m` | a fully open disc, centre `#f2ead3` (the token exactly), thin dark bezel ring, set in the drum's white glaze; no beam | meets (criterion text corrected: the bezel is dark, not bronze) |
| `V-lamp-wary-15m` | the iris at half area, chartreuse `#b2e41c`, six swept blades with hairline seams around it: reads as a camera iris | meets |
| `V-lamp-hostile-15m` | a pinhole in dark blades; this frame caught the 4 Hz flicker trough (`#b00041`, still ΔE 25.0 from canon red `#ff2413`; peak `#ff2f8c`, ΔE 0.19 to the token in A-lamp-states) | meets |
| `V-lamp-dark-15m` | closed, centre `#44413c` (token `#3B3A36`), a jagged fracture with a branch | meets after the fix: the first frame's two straight cracks read as a cross-hair reticle; the shader now draws one wavering fracture and a branch below it |
| `V-lamp-hostile-15m-wide` | at play scale a small magenta point on the front drum; no glow ball, hull not blown out | meets |
| `V-lamp-calm-40m-wide` | a ≈ 6 px bone disc (core pixels `#f1e9d2`) on the bone-white drum; it separates from the drum only by its dark bezel | weak: see gap 1 |
| `V-lamp-beams-night` | after the fix: two narrow shafts, chartreuse sweeping and magenta ending on Brea, brightest at the lens, soft-edged, the grass visible through both | meets. Before the fix: a flat, hard-edged green wedge that brightened with length (the non-uniform-scale normal bug, found by this frame) |
| `V-lamp-beams-fog` | the chartreuse shaft reads clearly through the rain; the hostile beam of the second Tiller points away from the camera toward Brea and is faint against the bright grey sky | wary meets; hostile only faint from this angle (A-lamp-states' side-view probe reads it at +35.8 RGB in fog) |

---

## Honest gaps

**Fix round 3 (first):**
- **A. Two lane frames run within 1 KB/s of the bar.**
  - `_beliefTick` reaches 3.58 KB/s (R15) and `_moveToward` 3.17. Both are under 4 KB/s in every window of
    every run since R4.
  - `_moveToward` is the same pattern as R46 (c). It is a wrapper that legacy species and frozen `squad.js`
    call, and it returns `_st.out`; the boxed return is its whole allocation. Should it ever cross the bar, it
    needs R46 (c) widened to it, or the callers gone (the legacy kinds at W2; squad by grant).
- **B. Three of the graded runs failed (R1, R3, R5), each on one lane frame.** Each led to a fix (listed
  with the run table). After R8–R10 came two edits with identical values: the lock beam's fade constant, and a
  comment moved for `A-lamp-canon-distance`. Then fix #9 landed. So R11–R13 re-ran after those edits, and
  R14–R16 on the final source (in the table).
- **C. Robustness, not proof against every event.** The fixes remove every deopt and every allocation that the
  diagnosis runs found in this staging (a fight, then a sprint).
  - Some rare events are not exercised by any profiled gate: a stun, a burn, a machine death, a torn part, a
    flipped machine. One of them can still meet a never-run operation in a lane function once per session.
  - What limits the damage: the per-frame leaves are branch-free; `Machine.update`'s own arithmetic lives in
    leaves; and no per-machine path reads another system's object or the root ctx.
- **D. Behaviour changes, stated plainly:**
  - the occluder cache (0.25 s / 0.5 m; `A37` and `A39` pass);
  - `hear()` grounds the noise when it arrives (the same `getHeight(x, z)` as before, called earlier);
  - the beam look: gains, the lock cut at her, the along^0.5 fade and the 0.65 flicker trough.

  The steering helpers, `conformM` and `updateEyesM` compute the same values as before.
- **E. `collision.occluded`'s allocation is not removed, it is attributed.** Its BVH raycast still allocates
  its hit records. The `Reflect.apply` call charges those bytes to `collision.js`, where they are made; the
  cache makes fewer of them. That file is kept code (R48 c, W1 perf-hygiene grant).
- **F. Something reshapes the root ctx at her first sprint.** A `dependent prototype chain changed` wave hits
  the root ctx's readers (`refreshHot`, and hero, camera and HUD functions). This lane's per-machine code is
  no longer exposed to it. I did not find who does it.
- **G. The beam films' staging varies with the random flat spot.** In the final films (FILM6) every probe
  clause passes, but earlier stagings in this round read the fog scan at 4–8 of 8. The facing is now asserted
  by the probe; the framing (raised camera, hostile Tiller on the camera's side) is fixed in the staging. At night Brea is barely visible (nothing lights her but the end of the shaft).

**Fix round 2 (first):**
- **A. `A-alloc-machines` FAILS.**
  - **In the final run (F12)** only two lane frames are over the bar, each in one window: `_sight` 13.8 at
    the first sprint and `_steerAlong` 13.9 in the first fight window.
  - **In F5, F7 and F9** (none in F11 / F12), one or two windows of the sprint phase also failed:
    `updateEyesM` 165–1,006 KB/s, plus `_statePatrol`, `Machine.update` and `_sight`.
    - A GC's "embedded weak objects cleared" deopt and the player-shape wave land there, and the
      deoptimised function then runs in V8's baseline tier for much of a window.
    - What ties `updateEyesM` to that GC is not identified. Normalising the lens records at construction
      (F9) moved the spike from sprint 1/3 to sprints 2/3 and 3/3; it is absent in F11 (the same source as F9)
      and in F12. Two clean runs do not prove it gone.
  - **The residual classes** (legacy, accessor, inlined-frozen) pass only under the ruling.
- **B. The paired attribution run is the gate's own method.** It decides `inlined-frozen` from a second
  run with inlining off. It is stricter than doing nothing, since a frame qualifies only if its own bytes
  and every lane callee are clean there. Still, it is a classification the judges should check: the
  evidence strings are in the report (`detail.pairedRun.evidence`). Its first version had a hole:
  in F9 it re-classed a one-window spike that simply did not recur with inlining off. The fix now also
  requires the frozen callees to carry the excess, and F9 is re-classed by hand above.
- **C. The fight is re-armed every second.** A herd cast left alone goes back to patrol before a 30 s
  warm-up ends. The re-arm (lastKnown, suspicion 1, `forceState('attack')`) keeps it fighting, and every
  window reports the hostile share (0.88–0.98).
- **D. The terrain under a machine's root is now the drawn grid read through a 1 m lattice.** Behaviour
  changes by the lattice error (`heightFast` exact at the integer corners, bilinear between them; the
  drawn grid vs the analytic `getHeight` is p50 1 cm, p99 19 cm, and 11 cm at most at the machines
  probed). `hasLOS` samples the drawn ground at the nearest integer metre, with its 1.2 m clearance. A45,
  A45c, A46, A47 and A48 pass on the fixture; A37 / A39 pass.
- **E. `A-weak40` is PENDING until world-sky publishes calima**, and so is `A-kind-block-file`. Under R38's
  logic a cross-lane PENDING clause is not a lane failure, but no ruling names this one: the orchestrator
  should say so.
- **F. gates-perf's `A-alloc-rate` timed out in F3** (its own Chrome never saw `__READY__` in 90 s on a
  loaded box). It ran in F6 and FAILS build-wide on other owners' frames, as before.

1. **The lamp core and the 3 : 1 contrast: resolved in fix round 1, with one judgement call.**
   - **Built:** the bible's core above the bloom threshold, inside a token ring that `A-lamp-states`
     grades. `A-weak40`'s contrast clause grades the fixture with the face turned to the sun: **9.85 : 1**.
   - **The call:** the "hull" a lamp is measured against is its own graphite drum face. The bone glaze
     beyond the face is reported too (glass 5.03 : 1 against it on the fixture's mixed surround).
   - **Why:** a bone lamp cannot reach 3 : 1 against SUNLIT bone glaze on any display (the ceiling is
     1.21 : 1).
   - **For the orchestrator:** if you rule that the glaze beyond must be the reference, every
     generator needs a darker hull behind every lamp (the judge's option 2).
2. **The lamp films have no licence-clean reference.** I did not download one (this agent does not
   fetch files without the user's say-so). Two slots for gates-perf's Commons fetcher (PD / CC0 /
   CC-BY): an iris-diaphragm close-up at several apertures, and a searchlight shaft in fog / at night.
   With those under `reference/r5/instruments-core/`, the films can be registered as V rows for an R29
   judge; until then they stay unregistered (`R5_IC_FILM`).
3. **Two contract clauses are measured against gates-perf's work, which is not in this tree.**
   `A-roles-published`'s "gate-roster resolves every role" ran gates-perf's own `ROSTER` prelude from
   its worktree (`R5_GATE_ROSTER`, read-only); `A90b` 3/3 ran with this lane's role-based re-stage of
   the Round-4 row (R34 asks for "the build merged with gates-perf's roster"). Both must be re-run on
   the merged build.
4. **No calima in the environment yet.** `A-perception-weather` stages `trade` / `calima` /
   `fogbank` by writing `environment.weather` (the NAME the hook reads, bible §2.3), because
   `environment.js` has none of those states until world-sky W1 (E12); night is `setTime(23)`. When
   world-sky publishes `environment.perceptionScale`, that number wins and the gate's
   `setWeather(...)` path runs instead. `A-weak40`'s calima half reports "trade measured".
5. **No kind sets `flags: true` yet.** The Flag is the sentry role's (Plumb, instruments-a W1);
   `A-perk-hooks` stages it with `machine.flagsOnSight` on the Tiller fixture and checks the stack: the
   Flag is raised by the machine's own `setState('alert')` from its own sight, not by gate code.
6. **The per-kind block on the fixture: 5 rows SKIP-fixture by design** (A42, A-linked-attack: the
   Tiller has no tearable tool yet; V26, V27, V-lineup: judged after the species lane's fidelity pass,
   bible §7.5), and the A-sil40 pair clause (no second non-legacy kind until W1).
7. **Round-4 colours this lane does not own are listed, not graded**: the Focus/HUD violet and teal
   in `src/ui/{focus.js,focus.css,hud.css,hud.js,inventory.css}` (shell-ui W2: the Sighting replaces
   Focus; draw the pips from `COMPASS_PIP`), 25 near-blue elemental-arrow literals in `src/combat/**`
   (combat-kit W2), and the frozen `rig/shells.js` `shellMaterials(sensorColor = 0x38c6ff)` default,
   which is dead code (all 10 `buildShell` callers pass the calm token) in a file outside my W0b grant.
8. **The beams were tuned from the films** (normals, fog boost). The fog boost is a look decision; the
   gate bars did not move (A-lamp-states' beam probe went from +7.5 to +96.8 / +35.8 RGB in fog,
   +76 / +62 at night, still 0 in calm and in clear day).
9. **Grant line counts**: `ai/stimulus.js` +7 (≤ 10); `rig/lod.js` uv1 5 lines (≤ 6) plus the
   PALETTE/quantise grant (23 lines); `rig/fx.js` one import + two defaults. The legacy species files
   (`glinthawk`, `longleg`, `scrapper`, `ravager`, `broadhead`, `corruptor`, `grazer`, `shellwalker`,
   `snapmaw`, `stormbird`) changed colour literals and their shell `sensorColor` only (VFX palette and
   lamp tokens), inside `src/entities/machines/**`, which §2 gives this lane.

10. **The memory rule on this lane's frames: 4.42 → 0.78 MB/s (staged fight) and 3.71 → 0.30 MB/s
    (sprint), still not 4 KB/s per function** (fix round 1; measured by `A-alloc-machines`). `Machines.update`
    fell 1,815 → 1.6 KB/s, `_updateEyes` 573 → 75, the attack picker 200 B per machine per frame → 0, and
    the lamps' per-frame helpers 128 → 102 / < 0.7. The frames still over the bar, each with its cause and
    owner, are in the fix-round section:
    - frozen-file reads through the accessors (gait, collision, melee);
    - the terrain API boxing its (x, z) arguments (world-ground W1);
    - frozen `nav.steer` / `engage` code that V8 inlines into this lane's frames;
    - once-per-frame functions that V8 still runs in its baseline or mid tier in the measured window.
    The global `A-alloc-rate` fails build-wide (64 MB/s against a 64 KB/s bar) on other owners' frames.
11. **The film frames were filmed and read by me only** (rule 3: a lane's own reading is advisory); the
   §9 block has no V gate for an R29 judge to grade.

---

## What another lane or the orchestrator must do

**Fix round 3 additions (first):**
- **Orchestrator:**
  1. R46 is recorded and the gate uses it. Consider widening (c) to `_moveToward` (gap A): it is the same
     wrapper, frozen and legacy callers consume its return, and it is under the bar today.
  2. **Merge order.** `machine.js`, `index.js`, `ai/perception.js`, `ai/attacks.js`, `lamps.js`, `lib/hot.js`
     and `kinds/tiller.js` changed again this round; merge them before any lane touches them.
  3. Gap F: find the system that adds to or reshapes the root ctx at her first sprint. It deoptimises every
     reader of the root ctx (hero, camera, HUD).
- **gates-perf (for `A-alloc-rate`'s owners), measured in this Chrome (151):**
  - `Math.random()` boxes its result in every tier (12 B per call), so no per-frame `Math.random()`.
  - `Math.abs`, `Math.max` and `Math.min` on a TAGGED argument (a field load that is sometimes a Smi) call the
    boxing builtin in Maglev; arithmetic arguments do not.
  - A for-of builds an array iterator in Maglev.
  - The `R5_IC_DEOPTMARK` timing method (trace markers compiled into the stream) may be useful to them.
- **hero-body, engine-gpu, melee:** unchanged from fix round 2 (fields born as integers deoptimise their
  readers on their first fractional value; `mutableFromBirth` in `lib/hot.js` is one way to fix it).
- **world-sky:** publish the calima weather state at W1 (`A-weak40:herd`, and so `A-kind-block-file`, are
  PENDING on it under R46).

**Fix round 2 additions (first):**
- **Orchestrator:**
  1. **Rule on the allocation residual.** Record `<!-- r5-ruling ic-alloc-residual=carried -->` with the
     owners and dates in the residual table (fix-round-2 section), or deny it. The gate reads it and
     passes the `legacy`, `accessor` and `inlined-frozen` classes only under it.
  2. **Grant the frozen readers `m.sc.<name>`.** The list of lines is in the residual table (gait,
     footlock, ground, footfall, collision; melee's two at W1). This removes the accessor class.
  3. **`nav.js`: hoist `ANG` to module scope.** One line; part of what frozen `engage.pursue` / `nav.steer`
     allocate.
  4. **Rule that `A-weak40`'s calima clause (and so `A-kind-block-file`) PENDING is not a W0b failure**,
     as R38 did for other cross-lane clauses (gap E).
  5. **Merge order.** `machine.js`, `perception.js` and the new `src/instruments/lib/hot.js` changed a lot
     this round; merge them before any lane touches them.
- **hero-body:** the player's and the animator's fields born as integers or null deoptimise the whole
  game the first time they change: `moveSpeed`, `heading`, `fovBias`, `_fov`, `_faceX`, `velocity.x/z`,
  `_bobK`, `_bobPhase`, `contact`, `contactKind`, the animator's `_prevHeading`, `_yawRate`, `_lvx`,
  `_lvz`, `_prevLvx`, `_prevLvz`, `_jerkX`, `_jerkZ`, `_leanAcc`, `_bank`, `_mx`, `_moveW`, `_flatW`,
  `_puff`, `_prevSpd`, `_recentSpd`, `_headStab`. The measured times are the first knockback (12.6 s) and
  the first sprint (61.2 s). Store 0.5 first (a placeholder object for the object fields); see
  `MachineScalars` in `machine.js`.
- **engine-gpu:** `engine.camera.fov` is born an integer (same fix).
- **melee:** `combat.melee._aimYaw` is born an integer (same fix).
- **gates-perf:**
  - `A-alloc-rate`'s 3 s warm-up measures these first-change waves.
  - Decide the method question with the orchestrator: a warm-up that includes a knockback and a sprint,
    or wait for the owners' fix.
  - Consider adopting `A-alloc-machines`' paired no-inline run and its residual classes for
    `A-alloc-rate`'s per-function list.
- **world-sky (W1):** publish a `calima` weather state; `A-weak40` grades it with no edit.

**Fix round 1 additions:**
- **Orchestrator:**
  1. **Rule on the lamp-contrast reference.** The drum face around the glass (built and graded) or the
     glaze beyond it (needs a dark hull behind every lamp in every generator); see gap 1.
  2. **Grant the frozen readers one token each** so this lane's accessor frames go to 0:
     - `gait.js` `update`, `updateCheap` and `_homeWorld`: `m.heading` / `m._speed` / `m._accelPitch` →
       `m.sc.heading` / `m.sc._speed` / `m.sc._accelPitch`;
     - `collision.js` `_syncMachines`: `m.heading` → `m.sc.heading`.
     Measured 56 KB/s fight, 35 KB/s sprint. The values are identical (the accessors read `sc`).
  3. **`nav.js` `steer`:** hoist `const ANG = [...]` to module scope (a 7-element array literal per
     call, inlined into this lane's steering frames).
  4. **Merge order:** `machine.js` and `index.js` changed a lot this round (`MachineScalars`, the
     steering module functions, the split manager passes); merge before any other lane touches them.
- **melee (W1):** `melee.js` `surfaceGap` reads `m.heading` → `m.sc.heading`.
- **world-ground (W1):** serve `getHeight` bilinear from the baked grid (plan §8.3 binding). It will then
  be small enough for V8 to inline, and the boxed `(x, z)` arguments in `conformM` and `hasLOS` go away;
  `heightFast` is what `hasLOS` already uses.
- **gates-perf:**
  - Register `A-alloc-machines` (lane `instruments-core-alloc`) next to `A-alloc-rate`, or fold its
    every-frame-graded view into it. `A-alloc-rate` prints only the top 12.
  - Decide whether the measured window should start after V8 has tiered the once-per-frame functions
    up (see the fix-round section). I did not change the method.
- **instruments-a (W1):** `addLamp(at, { radius })` now takes the FACE radius; the glass is 0.66 of it
  and the barrel sinks 0.85 radii behind the face. The Tiller uses 0.20 m. A kind with a smaller drum
  sets a smaller face but keeps the glass ≥ 0.25 m across, which `A-weak40` grades.

**Orchestrator** — merge this lane with gates-perf's W0a/W0b, then on the merged build re-run
`A-roles-published` (gate-roster now in the tree) and `A90b-memory-attribution-3of3` (R34); the
shadow ids drop their `@ic` suffix by themselves. Rule on gap 1. The `legacy.js` merge-order bridge
(W0a gap 9b) is inert now that pipeline's loader is merged; it can be deleted with `legacy.js` at W2.

**gates-perf** — `A-gate-preludes` and `A-reference-set` were run (from a scratch copy of your tree)
over both of this lane's files: 0 species literals, 0 old-map coordinates, 0 unreferenced V rows.
`tools/gates.r5.kind-block.mjs` exports `GATES = []`; register nothing from it by pattern. Fetch the two
reference slots of gap 2 when you next run the Commons fetcher.

**brand** — your code lint finds one new pair in this lane's files: `scene.overrideMaterial` (three.js
API) in `tools/gates.r5.kind-block.mjs` (A-sil40's flat-ink pass); please allowlist it there.

**instruments-a (W1)** — `src/instruments/kinds/tiller.js` is yours. Every kind: `this.addLamp(at,
{ radius })` BEFORE `buildRig`, name the lamp weak point `'lamp'` (precise hits darken it via
`lampDarkT`), and give the drum face a dark bezel (gap 1). The Plumb's perception row sets
`flags: true` (the Flag; Shrug reads `perception.flagDuration`). Register `kindBlock({ kind, lane:
'instruments-a', class })` for each kind; the Peg is exempt from A-sil40 height / A-weak40 size by the
block's own rule.

**armory (W1/W3)** — perks act only through `machines.perception.detectMul` ("Read as true" 0.5),
`.flagDuration` ("Shrug" 3), `.dustSight` (Dust-sight) and `machines.stimulus.addNoiseFilter(fn)`
(Brine-wade, Ash-step): set on equip, restore on unequip (the filter's remover).

**shell-ui (W2)** — outline every machine with `machines.perception.outlined(m)`; compass ◆ from
`COMPASS_PIP` (colour + aperture); Sighting/scanner colours from `SCANNER_TOKENS`; the Round-4 Focus
violet/teal in `ui/focus.*`, `hud.*` are yours to replace (gap 7).

**combat-kit (W2)** — a Dust Pot calls `machines.perception.addDustCloud({ x, y, z, r, seconds })`;
Clouded is the engine's `shock` channel (`stunT`), which already darkens the lamp; recolour the
near-blue elemental-arrow literals in `src/combat/**` (gap 7).

**world-sky (W1)** — publish `environment.perceptionScale` (a number) with `trade / calima / fogbank /
squall`; this lane's hook prefers it over the name table. Beams read `weatherParams.densMul` (> 1.2)
and `nightFactor` (> 0.5).

**audio (W3)** — `tiller` still falls back to the default voice set.

---

## Files changed this wave (against main `a953355`, the W0a merge)

**Fix round 3** (against `c347f89`, the round-2 checkpoint; the orchestrator's checkpoints since hold the code):
- `src/entities/machines/machine.js`: the accessor sentinel, `updateEyesM`, `conformM`, the steering
  helpers, `tickTimersM` / `stateClockM`, the declared fields, the lamp phase, `EyeRecord.col`.
- `ai/perception.js`: `_sight`, `_beliefTick`, `_scan`, `hasLOS`, `hear`, `mutableFromBirth`.
- `index.js`: `refreshHot` through `Reflect.apply`, spawn-time `mutableFromBirth`, `countNodes`.
- `ai/attacks.js`: indexed loops.
- `src/instruments/lamps.js`: the beam gains, lock cut and fade, `mutableFromBirth` on records.
- `lib/hot.js`: `HOT.events`, `HOT.ppos` by reference, `mutableFromBirth`.
- `kinds/tiller.js`: gait loads.
- `tools/gates.r5.instruments-core.mjs`: `A-published-scalars`, the beam-film probes and staging, the R46 (c)
  label, five diagnosis modes.
- `docs/ROUND5-INSTRUMENTS-CORE.md`.

In all, 9 files, +1,305 / −340 against `c347f89`. No frozen file was touched, no asset was added, and the plan
is unchanged by me (R49–R51 are the orchestrator's).

**Fix round 2** (against the round's base `2fd2ac6`; the orchestrator's WIP checkpoints `bda9b48` …
`ff99173` hold most of it). All of it is in this lane's §2 row and §1.2 W0 grants, and no frozen file is
touched. `ai/stimulus.js` and `rig/*` are unchanged; `docs/ROUND5-PLAN.md` differs only by the
orchestrator's own R43–R45 sync.

| file | change |
|---|---|
| `src/instruments/lib/hot.js` (new) | `HOT`, `refreshHot(ctx)`, `playerBoxes()`: the per-frame services and player values, one fixed-shape record |
| `src/entities/machines/machine.js` | hot paths read `HOT`; doubles born Double (`MachineScalars`); `EyeRecord` + `normalizeEyeRecords`; own-field method slots; publish-on-change boxes for every scalar accessor; `conformM` lattice (`latticeM`) and written-out orientation; emissive fold (`emisBaseOf`); `EYE_RGB`; `lkBoxes`; `updateFxM` compaction; settle snaps, heading deadband; Math.* written out |
| `src/entities/machines/index.js` | `refreshHot` per frame (and at construction); fixed-step far-LOD tick; `normalizeEyeRecords` after construction |
| `src/entities/machines/ai/perception.js` | `HOT` reads; inputs read up front in `_sight` / `_beliefTick`; the tick's seconds in a field; integer-metre LOS samples; reused scan payload; round-robin Dust pass; Flag pass on `m.sc`; born-Double fields |
| `src/entities/machines/ai/attacks.js` | generic moves write `m.sc` and step through `_st`; `HOT` player; born-Double picker clock |
| `src/entities/machines/ai/index.js` | born-Double `lureT`, written-out decay |
| `src/instruments/lamps.js` | `HOT` reads, born-Double fields, Math.* written out |
| `tools/gates.r5.instruments-core.mjs` | `A-alloc-machines`: caller attribution, 30 s warm-up, six graded windows, fight re-arm and witness, residual classes + plan ruling, the paired no-inline attribution run; diagnosis modes SHAPEWATCH / PROTOWATCH / PROTOLOCK / PROTOTRACE; `A-kind-block-file` PENDING on a cross-lane clause |
| `tools/gates.r5.kind-block.mjs` | `A-weak40`: min(glass vs face, glass vs hull) graded; calima measured when published, else PENDING |

**Fix round 1** (against the last pre-round checkpoint `f7c3ec2`; 11 files, +1,651 / −543). All are in this
lane's §2 row and §1.2 W0 grants, and no frozen file was touched (`gait`, `autorig`, `rig/*`,
`ai/{engage,search,squad,sites,reactions,emit,stimulus,rng}`, `collision`, `nav` and `terrain` are
unchanged). The `ai/stimulus.js` grant is still +7 of 10 lines, and `rig/lod.js` is unchanged this round.

| file | change |
|---|---|
| `src/instruments/lamps.js` | core above bloom (`coreHdr`, per-state `CORE_FRAC_BY_STATE`), drum face + barrel geometry and lit wall, ring/core/face shader, allocation-free `update`, instance matrices in the scene hook (`_writeMatrices`), state-index arrays, `LAMP_RHYTHM` |
| `src/entities/machines/machine.js` | `MachineScalars` + accessors, Tagged read-mostly fields, steering scratch `_st` and the module-function helpers, `stepRoot(S)`, terrain sample cache in `conformM`, eye/strip writes on change, lamp glass ×2.5, own-field inits |
| `src/entities/machines/index.js` | `update` split into `_stepMachines` / `_standoffPass` / `_separationPass`, all reading `m.sc` and stepping through `stepRootS` |
| `src/entities/machines/ai/attacks.js` | hold maps on an expiry clock (`_now`, `_held`) |
| `src/entities/machines/ai/perception.js` | `update` split into `_scan` / `_sight` / `_belief`, helpers written out, `m.sc` reads, LOS on `heightFast`, a reused stimulus record |
| `src/entities/machines/ai/tables.js` | `cfg()` rows with Tagged fields |
| `src/entities/machines/ai/index.js` | the cooldown snapshot includes the `sc`-held cooldowns |
| `src/entities/machines/parts.js` | integer pulse seed |
| `src/instruments/kinds/tiller.js` | lamp face 0.18 → 0.20 m |
| `tools/gates.r5.instruments-core.mjs` | `A-alloc-machines` + diagnostics, the film rows at the judge's angles (sunlit, three-quarter), the beam-tint check following `_linA` |
| `tools/gates.r5.kind-block.mjs` | `A-lamp-states` ring/core estimator + core clauses; `A-weak40` contrast graded on every kind, sun-facing staging, machine-masked outer hull |

**First W0b round, as reported then:**

New: `src/instruments/lamps.js`, `src/instruments/lib/{color,vfx,weather}.js`,
`tools/gates.r5.kind-block.mjs`. Changed in this lane's paths: `src/instruments/kinds/tiller.js`,
`tools/gates.r5.instruments-core.mjs`, this doc. Changed under the §1.2 W0 grants:
`src/entities/machines/{machine,index,parts,variety-assets,legacy}.js`,
`ai/{perception,index,tables,attacks}.js`, `ai/stimulus.js` (+7, ≤ 10), `rig/lod.js` (uv1 5 lines ≤ 6;
PALETTE + quantise flag), `rig/fx.js` (palette defaults). Legacy species files (colour literals and
shell `sensorColor` only): `broadhead`, `corruptor`, `glinthawk`, `grazer`, `longleg`, `ravager`,
`scrapper`, `shellwalker`, `snapmaw`, `stormbird`. Code: 29 files, +3,604 / −115 (plus this doc). No asset added or deleted;
no file outside this lane's §2 row and grants touched (`docs/ROUND5-PLAN.md` differs from `a953355` by
the orchestrator's own R33(g)/R34 sync only).

---

---

# W0a report (Oct 16 2026; kept as written, superseded where the W0b report above says so)

Port 5254. Worktree `scratchpad/r5/instruments-core/tree`, base `9d3b891`. Plan rows used: §2
(`instruments-core`), §1.2 (the W0a removal-only grant on 14 files; the W0 machines grant), §3.1 (W0a
exit), §3.2 (`ctx.machines.roles`, kind auto-registration), §6 (Override/corruption, IP kinds), §8
(R17, R18, R28, R30), §9 (`instruments-core` block). W0b items: see the W0b report above.

**Fix round 1 (Oct 16):** one judge finding — the collapse had deferred the whole roster past
`__READY__`. The roster is built in the `Machines` constructor again; see **FIX ROUND 1** below.
Files touched this round: `machines/{index,legacy,variety-assets}.js`,
`tools/gates.r5.instruments-core.mjs` (new lane guard `A-boot-roster`) and this doc. None of the 14
removal-only files changed.

**Fix round 2 (Oct 16):** one judge finding — `A-no-override` passed on a 3-line comment allowlist
while the §9 bar is 0 literal matches in `src/**`. The three comment hits are deleted (removal-only,
inside the W0a grant on `playerAnimator.js` and `menu.js`) and the allowlist is gone: the gate now
greps the raw text of every file under `src/` against 0. See **FIX ROUND 2** below.

Gates run with:

```
node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core
```

`--extra` is needed until gates-perf's `A-gates-autodiscover` merges (today `tools/gates.mjs` scans
only `tools/gates.round4.*.mjs`). After that, drop `--extra`; nothing else changes (the file exports
`GATES` in the same shape).

---

## FIX ROUND 2 — `A-no-override` checks the literal bar (judge finding instruments-core/W0a #2)

**Finding.** §9: "0 matches of `/override-node|overridden|\bOVERRIDE\b|overrideNode|cauldron-override/`
in `src/**`". A literal `grep -rnE` of that regex over `src/` found 3 comment lines
(`ui/menu.js:787`, `playerAnimator.js:2527`, `:2665`), and the gate passed them through a named
allowlist (`OVERRIDE_COMMENT_ALLOW`) and only counted code with comments stripped. The bar had moved.

**Fix 1: the three hits are deleted, deletions only** (the W0a removal-only grant names both files):

| file:line | before | after (characters deleted, none inserted) |
|---|---|---|
| `src/ui/menu.js:787` | "only a non-positive restore is overridden, and only on the frame after the restore has run." | "only a non-positive restore, and only on the frame after the restore has run." (−14) |
| `src/entities/playerAnimator.js:2527` | "A LOCK THAT IS ABOUT TO SLIDE DOES \*\*NOT\*\* OVERRIDE THE MOVE TEST, and this was tried and reverted rather than guessed. Letting a hot lock force the system live …" | "Letting a hot lock force the system live …" (−127; the rest of the comment, the A105 measurement and "`moveW` … is the only discriminator", is unchanged and still states the rule) |
| `src/entities/playerAnimator.js:2665` | "THE OVERRIDE THAT MAKES THE DRIFT BAR A GUARANTEE." | "THE DRIFT BAR GUARANTEE." (−26) |

Comments only; no code token changed in either file (esbuild's comment-stripped output of both files
is byte-identical before and after). The subsequence proof still holds: `removalOnly` reads 14/14
deletions-only against `9d3b891`, `menu.js` now 14 chars removed (was 0), `playerAnimator.js` 170
(was 17).

**Fix 2: the gate checks raw text, no allowlist.** `OVERRIDE_COMMENT_ALLOW` and the
comment/unexplained split are deleted from `tools/gates.r5.instruments-core.mjs`. The static half
now walks EVERY regular file under `src/` (140 today: 133 `.js` + 7 `.css`, not only `.js`), greps
the raw text (comments included) with the §9 regex verbatim, and the verdict requires
`rawHits.length === 0`. The comment-stripped code scan and the mechanic-identifier scan stay as
additional zero checks.

**Measured:**
- literal `grep -rnE '<§9 regex>' src/` in the tree: **0 lines** (exit 1);
- gate static half: `rawHits` **0** over 140 files, `codeHits` 0, `identHits` 0, removal-only 14/14;
- **negative control** (scratch copy of `src/` + the gate file, the three old comment lines put
  back): `rawHits` **3**, exactly `playerAnimator.js:2527`, `:2665`, `menu.js:787` → the gate fails;
- **negative control, other extension**: one `/* override-node probe */` line appended to
  `src/style.css` in a scratch copy: `rawHits` **1** (`src/style.css:676`), `codeHits` 0 — the old
  `.js`-only walk would have missed it;
- the full gate on port 5254: **PASS** (14 s), `rawHits` 0 over 140 files; the whole lane block
  6/6 PASS and the global list re-run (gate tables below).

Files touched this round: `src/ui/menu.js` and `src/entities/playerAnimator.js` (comment
deletions only), `tools/gates.r5.instruments-core.mjs` (allowlist removed, raw `src/**` scan added),
this doc. No runtime code changed.

---

## FIX ROUND 1 — the boot contract restored (judge finding instruments-core/W0a #1)

**Finding.** The collapse deferred the WHOLE roster until every model had loaded: `Machines` built
nothing in its constructor and all 28 machines spawned ≈ 1–2.6 s after `__READY__`.
`progression.js:3032` finds the Machine prototype through `machines.list[0]` when it is constructed,
so its difficulty/skill damage wrapper fell to a 1 Hz retry that gives up after 30 tries. The judge
measured `A64b-damage-channels` and `A64c-silent-apex` FAIL ("the machine damage wrapper is not
installed"), and `A62`/`A63` SKIP ("no living machine").

**Cause, precisely.** In base the constructor's roster was the four IP kinds, the only machine
models `assets.js` loaded at boot; every other kind already streamed in later. R30 deletes exactly
those four, so the constructor had nothing it could build. The fix gives the boot roster models
that are loaded at boot again.

**What changed (4 files, all in my grant; the 14 removal-only files are untouched by this round).**
1. `machines/legacy.js` — `BOOT_SPECS`: the four Round-3 kinds (strider, scrapper, glinthawk,
   longleg; `registerAt: 'boot'`) are boot rows now, 1.7 MB in all, against the 4.8 MB of IP
   models base loaded at boot. `LEGACY_SPECS` now lists only the 7 deferred Round-4 kinds. Both
   carry `shadowPolicy: MACHINE_SHADOWS`. `installLegacy` returns `boot` (the kinds whose model it
   handed over inside the call). `spawnLegacyRoster` spawns each kind's roster at most once per
   manager, so the deferred pass can never spawn the boot roster a second time.
2. `machines/variety-assets.js` — `loadKindModels` finishes a model that is already in
   `ctx.assets.models` (style, `loaded`, `onLoaded`) BEFORE it returns, not on a microtask; only
   the models still to fetch wait for the promise.
3. `machines/legacy.js` — **merge-order bridge** (W0a only). Pipeline's data-driven `assets.js`
   reads `BOOT_SPECS` and loads it in `loadAll` (its `legacyRows().boot`, read in the pipeline
   tree). In a tree without that merge, `legacy.js` wraps `Assets.prototype.loadAll` once, when it
   is imported: if the instance publishes `assets.specs` (the §3.2 contract, i.e. the data-driven
   loader) the wrapper calls straight through; otherwise it loads the missing boot rows through
   the public `loadExtra` in parallel with the original rows, inside the same awaited `loadAll`. A
   boot row that fails is not fatal: that kind falls back to the deferred path. Nothing in
   `assets.js` is edited. The bridge can be deleted when both W0a branches are merged; it is
   inert either way, and goes with `legacy.js` at W2.
4. `machines/index.js` — the constructor builds the boot roster again, as base did: registrars
   first (with `kinds` and `_chassis` created before them, since a registrar can now call
   `registerKind` synchronously), then `spawnLegacyRoster(this)` for every kind whose model is
   present. The deferred pass (`varietyReady` → leftover legacy rosters → `spawnExpansion` →
   watermark → `expansionReady`) is unchanged in order. `bootAudit` records both halves. Also
   fixed: `_resolveKind` referenced `EXPANSION_BODY` after the import was removed (a chassis spawn
   would have thrown a ReferenceError); `BODY as EXPANSION_BODY` is imported again.

**Measured on this tree (port 5254, `--only`, Oct 16 00:00–00:45).**

| check | before fix (judge) | after fix |
|---|---|---|
| alive at `__READY__` (`settle: 0`) | 0 (judge `JP-focus-pick`: 0 at READY + 600 ms) | **14** (6 strider, 3 scrapper, 3 glinthawk, 2 longleg), `list[0]` = strider |
| progression wrapper at `__READY__` | false, `hookTries` 0 → true only by + 1.5 s | **true**, `hookTries` 0, `_hooked` true |
| deferred kinds land | ≈ 1–2.6 s after READY | 0.69–1.02 s after READY (14 more, total 28; Tiller herd 3) |
| boot roster spawned twice? | — | no: `deferred.roster` 0, per-kind counts unchanged |
| `A64b-damage-channels` | FAIL ×2 | **PASS** (legacy = modern damage 38 / 47.5 / 32.3 at normal / easy / hard; tear 14) |
| `A63-loot-reveals` | SKIP ×2 | **PASS** (STRIDER WRECK + SUPPLY CRATE, 3 reveals drawn, 28 datapoints) |
| `A64c-silent-apex` | FAIL (wrapper) | FAIL "no Thunderjaw in the scene" — R30; the same text the judge's waited run gave |
| `A62-focus-components` | SKIP | FAIL — it now stages a strider (2 components; it needs ≥ 3). Its subject is `sawtooth` (R30), and the judge's waited run also FAILed it. Needs gates-perf's re-stage (kinds with ≥ 3 components today: longleg 5, broadhead 4, grazer 7, ravager 4, shellwalker 4, corruptor 4, stormbird 8) |
| judge `JP-roster-timing` | wrapper false at start | wrapper/hooked/noise/gourd all true at start, 14 alive; 28 at `expansionReady` (+1.02 s) |

**New lane guard `A-boot-roster`** (`tools/gates.r5.instruments-core.mjs`; not a §9 row, it guards
this finding). It samples at `settle: 0`. `main.js` sets `__READY__` before it starts the frame
loop, so no hook retry can have run by then, and a wrapper present at that sample was installed at
construction. Checks: the boot rows are published and loaded at READY; the constructor's
`bootAudit.boot` names every boot kind; alive at READY ≥ the boot roster, and the boot kinds' count
equals it; the wrapper is installed; the deferred half lands (`expansion` > 0, `roles.herd` alive);
the boot roster is not re-spawned. Names no species (reads `BOOT_SPECS`).
**Negative control:** a scratch copy identical to this tree except `return;` as the bridge's first
line (the boot rows then load deferred, which is the pre-fix behaviour) → **FAIL**: 0 alive at READY,
wrapper false, `bootAudit.boot` empty, `deferred.roster` 14. In the same copy `A64b` happened to
PASS (its 1.2 s settle let the 1 Hz retry land), which is why the guard samples at READY and does
not rely on A64b.

**The judge's non-PASS list, re-run on the fixed tree** (the 44 action/V-number gates of
`judge/nonpass.txt`, `--only`, 01:22–01:40; `work/fix1/report-r4subset.json`), against the judge's
pre-fix tree run and base:
- changed to PASS: `A64b-damage-channels`, `A63-loot-reveals` (this fix); `A19-secondary-motion`
  and `A31e-hillside-pan-clamp` (both load-sensitive; they flip between runs on this box);
- `A21-real-draw-calls` FAIL → PENDING (GPU terms not attributable under load; draws and triangles
  PASS);
- `A62-focus-components` SKIP → FAIL (R30 staging, above);
- the other 38 are unchanged: each names a deleted kind (`watcher`, `sawtooth`, `thunderjaw`,
  `behemoth`, `redeye`, `tallneck`), the deleted quest or tally type, or corruption (A100), or was
  FAIL on base too. **None of them is a "no living machine" timing SKIP any more.**
- `A31b` / `A31f` stay FAIL for a reason worth naming. Their hill-site picker takes the steepest
  26–40° face with no collider within 7 m. In base the Thunderjaw stood at (30, −220), so the face at
  (33, −228) was excluded and the gates ran at (−30, −273). With R30 that face is clear, the picker
  chooses it, and the camera bar fails there (in the judge's pre-fix run as well). The camera belongs
  to hero-body and the staging to gates-perf; the change of site comes from R30, not from timing.

**Styling unchanged by the loader path.** `ICP-entry-signature` (scratch probe) hashes every boot
entry's materials (name, colour, metalness, roughness, emissive, side), per-mesh `castShadow`,
`shadowCasters`, `styledKind`, `shadowPolicy` and size. Results: boot path in this tree, against the
deferred path in the negative-control copy: **identical hashes for all four kinds** (strider
`7b421c90`, scrapper `8a36aa51`, glinthawk `d78ab827`, longleg `dea1e18e`; 1 / 1 / 3 / 1 shadow
casters, `styledKind` set once).

---

## PART A — the removal-only Override + corruption pass (14 granted files)

Done first, kept separate. Grant §1.2: "removal-only: every line and branch of the Override mechanic
(`override-node`, `overridden`, `OVERRIDE`, `overrideNode`, the `cauldron-override` terminal) and the
`ai/squad.js` corruption block". Review it with:

```
git diff 9d3b891 -- src/audio/audio.js src/combat/melee.js src/core/progression.js \
  src/entities/machines/ai/engage.js src/entities/machines/ai/squad.js src/entities/machines/ai/stimulus.js \
  src/entities/playerAnimator.js src/studio/cast.js src/studio/pose.js src/ui/focus.js src/ui/menu.js \
  src/world/props/activities.js src/world/props/places.js src/world/props/tallneck.js
```

**Proof of "deletions only"** (inside `A-no-override`, clause `removalOnly`): for each file the
W0a text is a character SUBSEQUENCE of the `9d3b891` text, i.e. it is reachable by deleting
characters and inserting none. `git diff --word-diff` shows 12 `+` tokens; every one is a truncation
of the `-` token it replaces (`['dead','downed','stagger']);` from `[...,'stagger','overridden']);`,
`restore,` from `restore is overridden,`). The subsequence test is the exact form of that claim.
Result (after fix round 2): 14/14 deletions-only, 14 files changed; 33 line-diff insertions / 245
deletions, every insertion a truncated line.

| file | removed (chars) | what |
|---|---|---|
| `src/audio/audio.js` | 17 | `'override-node'` from the discovery-sting event list |
| `src/combat/melee.js` | 66 | `'overridden'` from `NO_SNEAK_STATES`; three `p.mounted` / `p?.mounted` guards (the mount half of Override; nothing sets `player.mounted` any more); "or a mount" in one comment |
| `src/core/progression.js` | 1272 | the whole `side-cauldron-override` quest; the `override` tally type (`TALLY_TYPES`, the `case 'override'` branch, the `on('override-node')` listener); `'override-tallneck'` in `PLACE_NAMES`; the doc lines naming them |
| `src/entities/machines/ai/engage.js` | 32 | "(an overridden machine chasing)" comment |
| `src/entities/machines/ai/squad.js` | 3668 | the corruption block: `CORRUPT_EYE`, `_updateCorruption`, `corrupt`, `uncorrupt`, the `_corruptor` releases in `noteKill` / `forget`, the `update()` call; the three `overridden` rearguard checks |
| `src/entities/machines/ai/stimulus.js` | 74 | two `overridden` skips |
| `src/entities/playerAnimator.js` | 170 | `'override-node'` from the interact-beat event list (17); fix round 2: the two comment sentences that used the word `OVERRIDE` (153) |
| `src/studio/cast.js` | 77 | `'overridden'` hold state, the `Override` cast row, `manager.override` in the doc |
| `src/studio/pose.js` | 108 | the `interact` pose (it fired `override-node`) and its doc mention |
| `src/ui/focus.js` | 67 | `m.mountedBy \|\| m.overridden` in `_walksRoute`; two doc mentions |
| `src/world/props/activities.js` | 3654 | the OVERRIDE NODE activity: build, interactable, `sites()` row, glow update, doc |
| `src/world/props/places.js` | 821 | the `cauldron-override` terminal interactable and its banner comment (the terminal's mesh stays as an inert prop) |
| `src/world/props/tallneck.js` | 144 | "carries the OVERRIDE interactable" doc sentence |
| `src/ui/menu.js` | 14 | fix round 2: " is overridden" from the respawn-guard comment (the file's only §9 regex hit) |

**No §9 regex hit is left anywhere in `src/**`, comments included** (fix round 2). The first round
kept three English-word comment lines behind a gate allowlist; that was a moved bar, and both the
lines and the allowlist are now deleted (see FIX ROUND 2).

---

## PART B — `src/entities/machines/**` (the W0 machines grant)

### B1. Override and corruption gone from the machine code
- `ai/override.js` deleted (269 lines): ally state, follow, mount, ride, teal eyes.
- `ai/index.js`: `OverrideSystem` import/export/install and `machines.{override,canOverride,mount,
  dismount,overrides,mounted}` removed; `lure()` no longer checks `overridden`; contract doc updated.
- `ai/tables.js`: `OVERRIDE` table, `overrideCfg`, `ECOSYSTEM.corruption` removed.
- `machine.js`: `EYE_COLORS.override`, `corrupted`, `overridden`, `mountedBy` fields, the mount
  release in `_die`, `forceState('overridden')`, the `overridden` FSM case and `_stateOverridden`
  removed. **The FSM is now closed:** `export const MACHINE_STATES` = patrol, suspicious, alert,
  search, attack, return, stagger, downed, dead, and `setState` refuses any other name (the first
  A-no-override run caught `forceState('overridden')` still parking a machine in an unhandled state
  through the generic `setState` fall-through).
- `index.js`: respawn / recycle / standoff loops no longer test `overridden`, `corrupted`,
  `mountedBy`; `overrides.update()` gone.
- `ai/doctrine.js`: the Corruptor's corruption install and `corrupted` audit count gone (the
  Corruptor body stays a plain legacy hostile until instruments-b deletes it at W2).

### B2. IP kinds deleted (R30, §6)
`watcher.js`, `sawtooth.js`, `behemoth.js`, `thunderjaw.js`, `redeye.js` deleted (2,429 lines) with
every row that named them: the authored roster (4 Watchers, 2 Sawtooths, Behemoth, Thunderjaw), the
2-Watcher strider escort, `RIGS.{sawtooth,behemoth,thunderjaw}`, `SAWTOOTH/THUNDERJAW/BEHEMOTH_SHELL`,
`REDEYE_SHELL`, their table rows, the Redeye doctrine/escort/spawn rows. The **Tallneck kind** (its
only body was the Behemoth chassis) and the snapmaw/ravager/shellwalker chassis rows that pointed at
deleted donors went too. The GLBs and `assets.js` SPECS rows are pipeline's (R30); this half never
reads them, so either merge order works.

### B3. Legacy collapse
Every surviving pre-CALIMA kind — strider, scrapper, glinthawk, longleg, broadhead, grazer, snapmaw,
ravager, shellwalker, corruptor, stormbird — lives in **`src/entities/machines/legacy.js`** (one row
per kind: class, asset spec, style, bake flag, registration timing, rig row, table rows, doctrine row,
roster) and is reachable only from it. Kept files carry no kind row any more:

| kept file | before | now |
|---|---|---|
| `index.js` | imported 8 species classes; authored roster; `_spawnVariety` | reaches `legacy.js` through a guarded `import.meta.glob('./legacy.js')` (absent file = no legacy kinds, 0 edits) and imports `installInstruments`; names no kind |
| `ai/tables.js` | 8 kinds' rows in PERCEPTION/ENGAGE/ATTACKS/REACT/ELEM/ALARM/ATTACK_MODE/ESCORT/SCAVENGER | `default` rows + `registerKindTables` |
| `ai/doctrine.js` | 9 kinds' CHASSIS/BODY/NEW_* tables/COMPONENTS/doctrine branches/SPAWN_PLAN | kind-agnostic host + `registerDoctrine` |
| `autorig.js` | `RIGS` for 3 IP kinds + spread of `rigs-expansion.js` | `RIGS = {}` + `registerRig` |
| `variety-assets.js` | species imports, SPECS, STYLE, EXPANSION lists, `registerExpansionSpecies` | `loadKindModels` + style/bake machinery |
| `rig/shells.js` | 6 species shells | shell machinery only; the 3 legacy shells moved to `rig/shells-expansion.js` |

`rig/shells-expansion.js` (legacy, deleted at W2 with `legacy.js`) received SCRAPPER/LONGLEG/
GLINTHAWK_SHELL; `scrapper.js`, `longleg.js`, `glinthawk.js` had their shell import line repointed
(one line each). Shells were moved to that file, not into `legacy.js`, because the species modules
import their shell and `legacy.js` imports the species: putting the shells in `legacy.js` would make
an import cycle.

**Behaviour preserved.** Every table, rig, style, component and spawn number moved verbatim
(extracted programmatically from the old files). Roster now: 25 legacy machines (6 striders,
3 scrappers, 3 glinthawks, 2 longlegs, 2 broadheads, 2 grazers, 2 snapmaws, 1 ravager,
2 shell-walkers, 1 corruptor, 1 stormbird) + 3 Tiller fixtures, against 39 before (the 14 removed:
4 Watchers + 2 Sawtooths + Behemoth + Thunderjaw of the authored roster, the 2-Watcher strider
escort, 3 Redeyes, the Tallneck).

**Boot timing is base's (fix round 1, see the FIX ROUND 1 section).** As in base, the authored
roster is built INSIDE the `Machines` constructor and exists at `__READY__`: the 14 Round-3 machines
(6 striders, 3 scrappers, 3 glinthawks, 2 longlegs; base built its 8 IP machines there). Their
models are boot rows (`legacy.js` `BOOT_SPECS`). The Round-4 expansion kinds and the Tiller stream
in afterwards exactly as base's deferred kinds did (`varietyReady` / `expansionReady`, ≈ 0.7–1.0 s
after `__READY__` here).

Each kind loads on its own (`loadKindModels`): a kind whose model fails is listed in
`bootAudit.*.failed` with one `console.warn` and never spawned; the rest of the roster is untouched.

---

## PART C — Instruments core (`src/instruments/**`)

- `registry.js` — kind auto-registration (`import.meta.glob('./kinds/*.js')`).
- `roles.js` — the 12 role ids, the R18 notes, `buildRoles`.
- `lib/generated.js` — `liftExtras`, `seedAuthoredWeights`, `weightAudit` (the POC's generated-kind
  helpers, promoted: dequantise once per kind, keep `_bone` labels via `getX`, lamp mesh `noShadow`).
- `kinds/tiller.js` — **the W0 fixture**, role `herd`, `fixture: true`. The proven POC creature
  (`tools/r5-poc/tiller.js`) through the registry; class `kind: 'tiller'`, weak point `lamp`, calm
  lamp `#F2EAD3` (bible §7.2; the wary/hostile colours stay `EYE_COLORS` until LAMP_STATES in W0b),
  bible §7.4 #3 attacks on generic builders (hopper-burst, auger-jab rear, drum-shove, herd-trample),
  one spawn row (herd of 3 at (64, −96)). Model: `/models/r5-poc/tiller.glb` (see gaps).

---

## Contracts published (exact signatures)

### `ctx.machines` (manager)

```
machines.roles        Readonly<{ sentry|herd|swarm|flanker|heavy|keeper|duelist|artillery|support|spotter|ambusher|colossus: string|null }>
                      exactly 12 keys; a value is a LIVE non-legacy kind id (W0: herd -> 'tiller'); null = R18
machines.roleNotes    Readonly<{ [role]: string }>   'R18: no live kind yet — plumb (instruments-a, W1)' | 'R28 fixture: …' | 'live: …'
machines.roleIds      readonly string[]   (ROLE_IDS order)
machines.roleOf(kind) -> string | null
machines.isLegacyKind(kind) -> boolean    true for every kind NOT registered from src/instruments/kinds/
machines.instrumentKinds  Readonly<{ [id]: descriptor }>   (descriptor + `source` path)
machines.kindAudio    Readonly<{ [id]: { set, mass } | null }>
machines.bootAudit    { boot: { kinds: string[], roster: number },          // set IN the constructor
                        deferred: { roster: number, expansion: number },     // set when expansionReady goes up
                        legacy: { loaded, failed } | null, instruments: { loaded, failed } | null }
machines.kinds / canSpawn(kind) / spawn(kind, x, z, opts) / registerKind(kind, Cls)   (unchanged)
```

Removed: `machines.override`, `canOverride`, `mount`, `dismount`, `overrides`, `mounted`,
`squads.corrupt`, `squads.uncorrupt`; machine fields `overridden`, `corrupted`, `mountedBy`;
events `machine-overridden`, `player-mounted`, `player-dismounted`, `machine-corrupted`,
`machine-uncorrupted`, `override-node`, `cauldron-override`.

### Kind module (`src/instruments/kinds/<id>.js`, default export)

```
{ id, Cls, spec: { url, targetHeight, yaw, shadowPolicy? },
  onEntry?(entry), style?, role?, fixture?,
  tables?: { perception?, engage?, attacks?, attackMode?, react?, elem?, alarm?, escort?, scavenger? },
  rig?, doctrine?: { body?, chassis?, components?(m), herd?, reband?: { part: [lo, hi] }, install?(m, opts), spawn?: [ { n, x, z, route, poi, herd?, basking?, convoy?, escort?, routePoints?, territory? } ] },
  audio?: { set, mass } }
```
A file in `kinds/` whose default export has no `id` is ignored (helpers may live beside a kind).

### Registrars (kept files, my grant)

```
ai/tables.js     registerKindTables(kind, rows, { replace = false } = {}) -> string[]   (blocks written; drops the kind's cfg() memo)
                 unregisterKindTables(kind) -> boolean
                 registeredKindTables() -> string[]
ai/doctrine.js   registerDoctrine(kind, row, { replace = false } = {}) -> boolean
                 unregisterDoctrine(kind) -> boolean
                 doctrineKinds() -> string[]
                 rebandMachine(m, band, archetype = null) -> boolean
                 CHASSIS, BODY, SPAWN_PLAN (filled by registration)
                 installDoctrine(m, opts), installExpansionDoctrine(machines), spawnExpansion(machines),
                 siteAnchor(ctx, plan), doctrineAudit(machines)          (unchanged shapes)
autorig.js       RIGS; registerRig(kind, spec, { replace = false } = {}) -> boolean; unregisterRig(kind) -> boolean
variety-assets.js loadKindModels(ctx, rows, { onLoaded, onProgress }) -> Promise<{ loaded: string[], failed: string[] }>
                 (a model already in ctx.assets.models is styled and handed to onLoaded BEFORE the call returns)
                 styleMachine(root, style); freezeSkins(root) -> number; MACHINE_SHADOWS
machine.js       MACHINE_STATES (frozen, 9 states); setState refuses any other name
registry.js      installInstruments(machines) -> { kinds: string[], roles, ready: Promise<{ loaded, failed }> }
roles.js         ROLE_IDS, ROLE_PLAN, FORBIDDEN_ROLE_ID, buildRoles(descriptors) -> { roles, notes }
legacy.js        LEGACY, LEGACY_KINDS,
                 BOOT_SPECS   { kind: { url, targetHeight, yaw, shadowPolicy } }   boot rows (registerAt 'boot')
                 LEGACY_SPECS { kind: { url, targetHeight, yaw, shadowPolicy } }   deferred rows (registerAt 'loaded')
                 installLegacy(machines) -> { kinds: string[], boot: string[], ready: Promise<{ loaded, failed }> }
                 spawnLegacyRoster(machines) -> number   (each kind's roster at most once per manager)
lib/generated.js liftExtras(entry); seedAuthoredWeights(machine) -> number; weightAudit(machine) -> { verts, wrongDominant, legBodyCross, blendedVerts, rigidPct }
```

**For pipeline (`assets.specs` contract):** `legacy.js` publishes the two row sets your
data-driven `assets.js` reads (names as in your branch): `BOOT_SPECS` — strider, scrapper,
glinthawk, longleg — which `loadAll` must load before `Machines` is built (your `legacyRows().boot`
does), and `LEGACY_SPECS` — the 7 Round-4 kinds — which stay deferred (`installLegacy` loads them;
you only list them). Rows carry `shadowPolicy: MACHINE_SHADOWS`, so an entry normalises the same
whichever loader fetched it, and `loadKindModels` styles a pre-loaded entry exactly once
(`entry.styledKind`). Nothing in machines reads `assets.models.{watcher,sawtooth,behemoth,thunderjaw,npc}`.
Until your loader is merged, `legacy.js` carries a merge-order bridge (FIX ROUND 1 §3) that is
inert against a loader exposing `assets.specs`.

---

## Gates (port 5254, this tree)

Fix-round-2 runs on the final code, Oct 16 2026 from 04:42. Reports archived in
`scratchpad/r5/instruments-core/work/fix2/report-{lane,global}.json` (fix round 1 in `work/fix1/`,
the first round in `work/{lane-report-final,global-report-final}.json`).

### This lane's W0a block — `--lane instruments-core`: **5 / 5 PASS, + the `A-boot-roster` guard PASS**

| gate | verdict | measured |
|---|---|---|
| `A-legacy-collapse` (runner) | **PASS** (167 s) | static: 11 legacy kinds / 11 legacy modules, 0 IP kind files, 0 imports of a deleted file, **0 stray imports** of a legacy module outside legacy files, **0 kind rows** in 14 kept machine files (code scan, comments stripped), one door (`index.js` glob). Deletion probes in a scratch copy, 0 other edits: **scrapper** (row 61 lines + `scrapper.js` + `scrapper.glb`) A1 PASS, A20b PASS; **snapmaw** (row 85 lines + `snapmaw.js` + `snapmaw.glb`) A1 PASS, A20b PASS; **the whole legacy set** (`legacy.js`, 2 legacy rig files, 11 species files, 11 models) A1 PASS, A20b PASS |
| `A-kind-registration` (runner) | **PASS** (62 s) | a new module `src/instruments/kinds/zz-icprobe.js` dropped into a copy (the only difference from this tree): copy boots clean (A1, A20b PASS); kind `icprobe` registered, model loaded, `perceptionCfg.gain` 1.234 (own) with `d0`/`tick` from default, `engageCfg.band` [5.1, 13.3] (own) with `hyst` from default, `reactCfg` all default, 2 attacks, mode `table`, elem 77, audio set `icprobe`, 1 spawn row, **1 live at boot**, `isLegacyKind` false, role null. The Tiller fixture in the same page: 4 attacks, elem 110, 3 live, role `herd` |
| `A-no-override` | **PASS** (14 s) | `ai/override.js` absent; **140** `src/**` files (133 `.js` + 7 `.css`): **0** raw-text hits of the §9 regex, comments included, **no allowlist** (fix round 2); 0 hits in comment-stripped code; **0** mechanic identifiers (`OverrideSystem`, `canOverride`, `mountedBy`, `machines.mount`, …); removal-only **14/14** deletions-only vs `9d3b891` (`playerAnimator.js` 170 chars, `menu.js` 14); live: `tables.OVERRIDE` undefined, `overrideCfg` undefined, `EYE_COLORS.override` absent, `_stateOverridden` undefined, 0 of `override/canOverride/mount/dismount/overrides/mounted` on the manager, `MACHINE_STATES` = 9 states; all 12 spawnable kinds asked for 12 states incl. `overridden`/`ally`/`mount`/`mounted` → **0** forbidden states reached. Negative controls (static half): the 3 old comment lines restored → `rawHits` 3; an `override-node` line in `style.css` → `rawHits` 1 |
| `A-no-corruption` | **PASS** (606 s) | 0 code hits of `_updateCorruption` / `corrupt` / `uncorrupt` / `ECOSYSTEM.corruption` / `corrupted` / `_corruptor` / corruption events in 133 files; `ECOSYSTEM.corruption` absent, `squads.{corrupt,uncorrupt,_updateCorruption}` absent; staged Corruptor + strider, scrapper, glinthawk, longleg, broadhead, grazer within 9 m, fight held for **600 s**, 2,359 samples of every machine: **0** `corrupted === true`, 0 `_corruptor`, 0 corruption events, up to 8 machines engaged at once |
| `A-roles-published` | **PASS** (6 s) | 12 roles exactly; `herd` → `tiller` (R28 fixture note), 11 null each with an R18 note naming kind, lane and wave; 0 legacy kinds mapped; 0 forbidden role ids; staging `roles.herd` spawns a `tiller` (modelKind `tiller`, non-legacy). **Not graded:** the gate-roster clause (gap 1) |
| `A-boot-roster` (lane guard, fix round 1) | **PASS** (6 s; 3/3 runs in fix round 1, 1/1 in fix round 2) | READY at 4.1–4.5 s after navigation (3.6 s in fix round 2, same 14 / 6-3-3-2, wrapper at READY, `hookTries` 0); at READY **14 alive** = `bootAudit.boot.roster` (strider 6, scrapper 3, glinthawk 3, longleg 2), all 4 boot models loaded, wrapper installed, `hookTries` 0; deferred half +0.69 / +0.73 / +0.79 s: expansion 14, Tiller herd 3, total 28, boot roster not re-spawned. Negative control (bridge off): FAIL, 0 alive at READY |

### Global green list items that exist today (this tree, port 5254)

Fix-round-2 run, 04:57–05:07, two other lanes' Chromes (5250, 5255) alive; load average 4.08 / 3.90 / 3.94 (1 / 5 / 15 min) when it ended.

| gate | verdict | measured |
|---|---|---|
| `A1-boot-clean` | **PASS** | `state=playing`, 0 console errors |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 221 frames |
| `A90-memory-stability` | **PASS** | 28 kills; heap **−9.6 %** (bar < 25 %), geometries **+9** (≤ 40), textures **−28** (≤ 8), scene objects **−1,096** (≤ 60) |
| `A90-memory-stability-expansion` | **PASS** | objGrowth −1,059, nonMachineGrowth **0**, orphan roots 0, geo +3, heap −3.5 %; population budget 1,600 nodes, bootNodes 1,250, not over budget |
| `A90b-memory-attribution` | **PASS** | 0 offenders, 0 orphaned textures, post-GC heap −4.1 % |
| `A90-rig-reclaim` | **PASS** (1 run; 5/5 is the W0b bar) | 30 cycles over 12 kinds incl. the Tiller: geometries **+7** (≤ 40), textures **0** (≤ 30); per live machine (8 striders) geo **0**, tex **0.38** (≤ 1 each); held-then-released 0 / 0 |
| `A9-perf-budget` | gate printed **FAIL** on the fps term; by **R26 it is PENDING** (load average ≈ 4, R26's quiet box is < 3) | draws **309** (< 350, PASS; base 319); fps 36.6, scene GPU 58.8 ms; the gate's own null-frame probe read 1.52 ms at that instant, so its attribution called the box quiet while the load average said otherwise. **Interleaved A/B, base `9d3b891` vs this tree, same minutes (05:08–05:11, load 3.2–6.3), 3 rounds:** base 23.8 / 27.6 / 27.4 fps, tree 27.2 / 27.9 / 38.3 fps (median 27.4 vs 27.9), all six PENDING (null frame 4.3–6.6 ms GPU); draws 319 vs 309. Fix round 2 changed comments only (esbuild output of both `src` files identical), so it cannot move fps; the quiet-box run belongs to the orchestrator (R26) |
| `A21-real-draw-calls` | **PENDING** | draws 309 / 195 / 325 (≤ 350, PASS), triangles 4.12 / 3.67 / 4.25 M (≤ 6.5 M, PASS); GPU and p95 terms not attributable (null frame 6.0 ms GPU). Its staged fight still asks for deleted kinds by name, so it stages fewer machines (gates-perf re-casts it by role) |

Not in this tree yet (other lanes' W0a/W0b gates): `A90-abs`, `A-alloc-rate`, `A-vram-ledger`,
`A-ID-ip-assets-gone`, `A-licence-manifest`, `A-assets-tracked`, `A-no-horizon-terms-player`,
`A-no-horizon-terms-code`, `A-reach-all-sites`, `A-port-guard`, `A-carried-suite`.

### Other checks run here
- brand's W0-day1 block on this tree: `A-identifiers-renamed`, `A-single-rest`, `A-storage-keys`,
  `A-storage-keys-reload` PASS; `A-extent-refactor` FAILs on `colliders` / `navCostHash` only — the
  Override Node pillar R17 removes (see brand, below). All 10 extents and the 20-query path hash
  are identical.
- Two frames of the Tiller herd at boot (`shots/gates/FILM-tiller-{side,herd}.png`, gitignored,
  read by me): the glazed hull, oxblood bands, six stilt legs and front drum render in the old
  valley meadow; a sanity check only — this block has no V gate and the fixture's fidelity is
  instruments-a's W1 work.

---

## Honest gaps

1. **`A-roles-published` is not fully graded.** Its "`tools/gate-roster.mjs` resolves every role"
   clause needs gates-perf's file, which does not exist in this tree; the gate passes on the shape,
   live-kind and R28 clauses and says so in its detail. It must be re-graded once gate-roster lands.
2. **The Tiller model is untracked.** The fixture loads `/models/r5-poc/tiller.glb`, the POC
   generator's output, which is in the main tree but gitignored (`*.glb`). For testing I copied it
   byte-identical from main (sha256 `5900d51e…9c661b53`) into this tree; it is NOT part of the
   branch. On a clone without it the kind fails to load (one `console.warn`), is never spawned, and
   `roles.herd` falls back to null with an R18 note — no console error. When pipeline promotes the
   generator (W0b) `spec.url` in `src/instruments/kinds/tiller.js` moves to its output (one line).
   The GLB carries `extras.r5Generator.licence` but no `extras.provenance` (pipeline's
   `A-ID-ip-assets-gone` / manifest).
3. **Closed in fix round 2.** The three prose comments that kept the English word are deleted and
   `A-no-override` has no allowlist; 0 raw hits in `src/**`. The cost is two shorter comment
   headlines in `playerAnimator.js` (the "tried and reverted" remark is gone; the measurement that
   proves it stays) — deletion was the only edit the removal-only grant allows.
4. **Removal-only leaves two stale counts in prose**: progression.js still says "Six new quests"
   (five listed) and "FOUR NEW OBJECTIVE TYPES" (three remain). Rewording needs an insertion.
5. **Lamp colours are half-done.** The fixture's calm lamp is the bible's `#F2EAD3`; wary and
   hostile still come from `EYE_COLORS` (canon amber/red) until `LAMP_STATES` (W0b).
6. **`A-no-corruption` has no negative control** (the deleted cascade cannot be re-run); its staging
   reproduces the old trigger condition (Corruptor in a fight with 6 other kinds inside 9 m, 25 m
   was the old radius, 4 s period) for 600 s.
7. **A9's fps half is unresolved on this box.** The first run read FAIL (32.9 fps, scene GPU 49 ms)
   while two other lanes' Chromes were rendering. Interleaved A/B on the base commit vs this tree,
   same minutes, load 4.7–8.2: base 22.9 / 24.4 fps (GPU 98.4 / 90.0 ms), this tree 33.6 / 25.0
   fps (68.6 / 86.5 ms), all four PENDING (null frame 6–7 ms GPU); draws 319 base vs 309 here. Not
   a regression; the R26 quiet-box run belongs to the orchestrator. Fix round 2: the global run's A9
   printed FAIL (36.6 fps; the null-frame probe read 1.52 ms at that instant) at load average ≈ 4,
   which R26 grades PENDING; a 3-round interleaved A/B right after gave base 23.8 / 27.6 / 27.4 fps
   vs this tree 27.2 / 27.9 / 38.3, all PENDING. `tools/gates.config.mjs` (gates-perf's) grades
   attribution by the null frame only and does not read the load average R26 names; gates-perf may
   want to add that term.
8. **The Round-4 per-kind machine gates** (`machine-ai`, `machine-rig`, `machines-expansion` lane
   files) were not re-run: they stage deleted kinds by name and are being re-staged by gates-perf
   into the carried suite / kind block. The legacy roster was exercised by the two A-legacy-collapse
   deletion probes, the whole-set probe, A1, A20b and the four A90 gates.
9. **Boot roster (fix round 1): the contract is base's again, with one difference in WHICH
   machines exist at `__READY__`.** Base had 8 IP machines there; now there are the 14 Round-3
   machines. The Round-4 kinds and the Tiller still arrive with `varietyReady` / `expansionReady`
   (0.7–1.0 s after READY here), as base's deferred kinds did. Two consequences others must know:
   (a) **at the W2 exit**, when instruments-b deletes `legacy.js`, the boot roster is empty again
   unless an Instrument kind by then has a boot row (pipeline's `assets.specs.js`) AND its spawn
   rows run in the constructor (today `spawnExpansion` is deferred-only). `A-boot-roster` will FAIL
   at that point by design, so the regression cannot pass unnoticed. (b) The merge-order bridge in
   `legacy.js` wraps `Assets.prototype.loadAll` from outside pipeline's file; it is inert against
   pipeline's loader, but it is still a runtime wrapper of another lane's class, and it should be
   deleted once both branches are on main (deleting 44 lines of `legacy.js`, plus its `Assets` import).
10. **The scratch-copy probes need the lane port.** They stop the lane's own Vite (only one whose
    cwd is this tree), run, and restart it; anything else on the port makes them PENDING.
11. **Fixture details that belong to later lanes:** loot uses today's item ids (`metal-shards`,
    `wire`; combat-kit renames in W2); its audio falls back to the default voice set until the audio
    lane builds `tiller` (W3).
12. **W0b items not started:** `LAMP_STATES` + beams (`A-lamp-states`, `A-lamp-canon-distance`,
    `A-beams-one-draw`), perception weather + perk hooks (`A-perception-weather`, `A-perk-hooks`;
    the §3.2 perk-hook stubs are due on W0b day 1), `uv1` through the fold, VFX palette,
    `A90-rig-reclaim` 5/5 (1/1 PASS today), `tools/gates.r5.kind-block.mjs`.
13. **`A-no-corruption`'s static half is a code scan, by the wording of its bar** (found while
    fixing round 2, not a judge finding). §9 words it as "`_updateCorruption`, `corrupt`,
    `uncorrupt` and `ECOSYSTEM.corruption` absent" (the mechanic's identifiers), not as a
    `src/**` regex count like `A-no-override`, so the gate scans code + strings with comments
    stripped: 0 hits. A raw `grep -rnE '_updateCorruption|\bcorrupt\b|\buncorrupt\b|ECOSYSTEM\.corruption' src/`
    finds 2 comment lines that use the English word for damaged data, both outside my grant:
    `src/ui/settings.js:193` ("corrupt payload: defaults stand") and `src/audio/bank.js:14`
    ("a missing or corrupt file"). If the orchestrator reads that bar as raw text too, those two
    comments need an owner (`settings.js` is shell-ui's from W2; §2 names no owner for
    `audio/bank.js`) or a ruling; I did not edit them.

---

## What another lane or the orchestrator must do

**Orchestrator**
- Merge this lane before hero-body and brand touch `playerAnimator.js` / `menu.js` in W0b (plan
  §3.1). `A-no-override`'s removal-only clause then proves the W0a version on the first commit after
  `9d3b891` that touched each file, so later edits by those lanes do not fail it.
- Run this block alone (`--lane instruments-core`): the two runner probes go first, before the
  harness opens its own Chrome, so the run never holds two Chromes. On the main tree set
  `R5_SCRATCH` (default there is `$TMPDIR/r5-ic-probe-<port>`; in a lane tree it is
  `<tree>/../ic-probe-<port>`). The copies are a few MB and deleted after each probe.
- The full Round-4 suite still names deleted content (list under gates-perf below); expect those
  FAILs until the carried suite replaces them.
- Fix round 1: no ruling is needed — the boot contract is kept on the lane side (machines exist at
  `__READY__`, progression's wrapper installs at construction). After both W0a branches are merged,
  delete the `legacy.js` merge-order bridge (it is inert then) and re-run `A-boot-roster` on main.
  Carry `A-boot-roster` into the W2 exit: deleting `legacy.js` empties the boot roster unless an
  Instrument kind has a boot row and constructor-time spawn by then (gap 9a).

**pipeline** — delete `SPECS.{watcher,sawtooth,behemoth,thunderjaw,npc}` and their GLBs (R30); this
lane no longer reads `assets.models` for them. `legacy.js` now exports **non-empty `BOOT_SPECS`**
(strider, scrapper, glinthawk, longleg, with `shadowPolicy`), which your `legacyRows().boot` merges
into `assets.specs` and `loadAll` loads — your docs say "none today", and your lane guard
`A-pipeline-boot-rows` should expect 6 boot rows after the merge, not 2. Those four files are
tracked and already carry your provenance stamp. `LEGACY_SPECS` is now the 7 deferred Round-4 rows
only. Tell this lane the promoted Tiller output path; add `extras.provenance` to generated GLBs.

**gates-perf** — `ctx.machines.roles` / `roleNotes` / `roleIds` / `roleOf` / `isLegacyKind` are the
shape `tools/gate-roster.mjs` should resolve. Round-4 gates that exercise deleted content:
`A66-quest-objectives-expansion` (lists and walks the deleted `side-cauldron-override` quest) and
`A65-save-restore-expansion` (override tally type gone), `A100-expansion-doctrine` (DIES), and
every gate that stages `watcher` / `sawtooth` / `behemoth` / `thunderjaw` / `redeye` / `tallneck`
by name (`budgets.mjs` staged-fight order, the A90 loop's `spawn('watcher')`, which now returns null
with a console.warn and still PASSes). Fix round 1 measured two of them on this tree:
`A62-focus-components` prefers `sawtooth` and falls back to `list[0]`, now a strider with 2
components against its bar of 3 (FAIL); re-stage it on a kind with ≥ 3 components.
`A64c-silent-apex` FAILs "no Thunderjaw in the scene". Both are R30 staging, not timing; the
judge's waited runs on the pre-fix tree gave the same verdicts. `A31b` / `A31f` choose their hill by
"steepest clear face", and R30 changed which face that is (FIX ROUND 1); pin the site through
`gate-places` when you re-stage them.

**brand** — `A-extent-refactor` now FAILs on two of its own stricter terms: `colliders` 4825 vs the
recorded 4826 and `navCostHash` `e18558a5` vs `92662038`. Both are the Override Node pillar
(`activities.js`) that R17 removes — one static collider and the nav cells under it. All 10 extents
are identical, and so is the 20-query **path hash** (`66a0055d`, the plan's literal clause).
Re-baseline those two terms after this merge. `A-identifiers-renamed`, `A-single-rest`,
`A-storage-keys`, `A-storage-keys-reload` PASS on this tree. `menu.js:787` lost " is overridden"
(fix round 2, comment only); if you want the sentence fuller in W0b, reword it without
`overridden` / `OVERRIDE` — `A-no-override` now greps raw `src/**` with no allowlist.

**hero-body** — `player.mounted` / `mountSeat` no longer exist (nothing sets them). Fix round 2
deleted the English-word "OVERRIDE" from two foot-lock comments in `playerAnimator.js` (the
`_stanceStep` live-test note and the `_tryStep` URGENT headline, now "THE DRIFT BAR GUARANTEE.");
no code changed.

**every lane that edits `src/`** — `A-no-override` is on the global list and now greps the raw text
of every file under `src/` (comments, strings, CSS) with the §9 regex and no allowlist. Lower-case
"override" is fine (`GROUNDED_OVERRIDE`, override channels — `\bOVERRIDE\b` does not match inside
`GROUNDED_OVERRIDE`); the words `overridden` and upper-case `OVERRIDE` anywhere in `src/` fail it.

**instruments-a (W1)** — `src/instruments/kinds/tiller.js` is yours from W1 day 1. Its weak point is
named `lamp` (was `lantern` in the POC). The kind-module contract is above; a module dropped into
`kinds/` registers with no other edit (proved by `A-kind-registration`).

**instruments-b (W2 exit)** — `A-legacy-gone` is already proved in shape: deleting `legacy.js`,
`rig/shells-expansion.js`, `rig/rigs-expansion.js`, the 11 species files and the 11 legacy models
boots clean (A-legacy-collapse's whole-set probe). `index.js` reaches `legacy.js` through a guarded
glob, so no other file needs an edit.

**combat-kit (W2)** — `src/items/tools.js:91` still checks `ctx.machines.mounted` /
`ctx.player.mounted` (always undefined now).

**shell-ui (W2)** — `src/ui/map.js` still lists an `override` site kind (none exist now);
`src/ui/hud.js` quest rows ask for Watcher/Sawtooth/Behemoth/Thunderjaw kills (no such kinds).

**progression (W3)** — first-hour quests that kill/scan a Watcher or the Thunderjaw cannot complete
until rewritten; the `override` tally type and `side-cauldron-override` are gone; `docs/SPEC.md:983`
still lists `override-node` (core-platform's doc).

**audio (W3)** — `audio.js` `SPECIES` still lists the deleted kinds; unknown kinds (the Tiller) fall
back to the default voice set.

**world-props (W1)** — `activities.revealList()` and `props.revealed` lost their only writer; the
cauldron terminal mesh is now an inert prop.
