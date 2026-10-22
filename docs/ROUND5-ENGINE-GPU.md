# ROUND 5 — lane engine-gpu, W0b report (the GPU tier decision) — fix round 1

Port 5251, worktree `scratchpad/r5/engine-gpu/tree`, Oct 19 2026.

Plan sections this report follows: `docs/ROUND5-PLAN.md` §2 (row engine-gpu), §1.2 (the engine.js
grant: post chain / tier table / DPR; render-target measurement hooks), §3.1 (W0b exit: "GPU tier
chosen and render targets measured"), §4.3–§4.4, §8.3 (`rt-ledger-bar=W0b`) and §9 (the engine-gpu block
and the global green list). The measured numbers live in **`docs/ROUND5-ENGINE.md`** (§1 the ledger at
the shipped tier, §3 the tier decision); this file is the lane report and replaces round 0's (its numbers are
kept below and in the numbers doc as the "before"); the W0a report is in git at `5fd2849`.

## 0. What fix round 1 changed, by finding

| finding (judges, round 0) | what was done | result now |
|---|---|---|
| **A-gpu-tier FAILS its vista GPU term on a quiet box** (judge runs 16.05 / 17.27 ms; mine 15.25 / 17.63 / 17.09; bar 13) — blocker + major | Cut the vista's GPU work inside the engine grant, measured lever by lever on the gate's own instrument: (1) **direct post topology** — no MSAA means no resolve copy; the scene target is the read buffer and `renderTarget2` holds only the grade's RGBA8 output; (2) **`postFold`** — GTAO's multiply and bloom's composite done inside the grade pass, two full-resolution blends fewer; (3) **`csmFarCadence: 2`** — far cascades on alternate frames; (4) **`maxAnisotropy: 2`** — the POC ground's 11 texture fetches per pixel at 8× anisotropic filtering were the vista's cost. No bar, threshold or measurement in the gate changed. | **PASS in 3 judged runs**: vista **10.28 / 11.62 / 11.23 ms** ≤ 13 (round 0: 15.25–17.63), empty frame 4.83 / 4.87 / 4.85 ms ≤ 7 (round 0: 6.32–9.41), fps 59.88–60.24, p95 18.5–18.7 ms. My in-run monitor saw another lane's gate Chrome alive during part of each judged run (the gate's witness samples only at the start); clean exploration runs agree (10.08–10.22 and 11.91 ms). The price is far-ground texture detail, filmed in `V-gpu-tier-look` (§5.3, §6.1) |
| **A-rt-ledger PENDING: no `RT_LEDGER` in `tools/budgets.mjs`** — blocker | `tools/budgets.mjs` is gates-perf's file (plan §0.1): this lane cannot add the line. Re-measured the ledger at the new topology (127.27 MB, GL recount equal to the byte), regenerated `RT_LEDGER` and the docs table, and **proved the clause**: A-rt-ledger run against a copy of `budgets.mjs` carrying the one line passes every clause (report `L11`). Patch for gates-perf / the orchestrator: `scratchpad/r5/engine-gpu/budgets-rt-ledger.patch`. | in this tree: PENDING on that one clause only (render targets 127.27 MB ≤ 170, staged fight 342.45 MB ≤ 450, docs ✓); with the line: **PASS** (`L11`) |

## 1. Deliverables

| item | file | status |
|---|---|---|
| the GPU tier decision: shipped `high` = DPR cap 1.25 + GTAO ¼ + SMAA-only + SMAA RGBA8 + far cascades 1024 (round 0) + direct post topology + post fold + far-cascade cadence 2 + anisotropy cap 2 (fix round 1) | `src/core/engine.js` (tier table, `applyTier`, `_applyPostTopology`, `_postFold`, `_bloomFold`, `_gtaoInPlace`, `_applyAnisotropyCap`, `_csmUpdate`, `ScenePass`, `OutputGradeShader`; engine grant) | done; RT bar met; GPU bars met (A-gpu-tier PASS, 3 judged runs, vista 10.28 / 11.62 / 11.23 ms) |
| `A-gpu-tier` as a measured exit gate, before/after per lever | `tools/gates.r5.engine-gpu.mjs` (`A-gpu-tier-box` + `A-gpu-tier`, Pans POC); lever record now 9 rows | A-gpu-tier PASS, 3 judged runs, vista 10.28 / 11.62 / 11.23 ms |
| what the tier costs the picture, filmed | `V-gpu-tier-look` (new visual gate) | filmed, NEEDS-JUDGE |
| `A-rt-ledger` graded (ruling `rt-ledger-bar=W0b`) | same file; `tools/r5-probes/rt-ledger.mjs` regenerated | 127.27 MB ≤ 170, 342.45 MB ≤ 450; PENDING only on gates-perf's `budgets.mjs` line (PASS with it, `L11`) |
| GTAO lattice fix intact (A108 / A109 / V33b) on the folded chain | `engine.js`; gates unchanged | A108 PASS, A109 PASS, V33b filmed |
| AA under R25 (A22, V20) with SMAA reading RGBA8 | gates unchanged | A22 PASS (0.317 vs 0.195), V20 filmed |
| W0a judge's minor: sweep dead WeakRefs in `registerRenderTarget` | `engine.js` (round 0) | done (census registration contract PASS) |
| `docs/ROUND5-ENGINE.md` W0b section | §1 (ledger), §3 (decision, before/after, the timer calibration, equivalence, gate table) | done |
| lane report | this file | done |

No asset was created (no provenance or `LICENSES.json` row needed). Files edited: only this lane's §2 row
(`src/core/engine.js` under its grant, `tools/gates.r5.engine-gpu.mjs`, `tools/r5-probes/rt-ledger.mjs`,
`docs/ROUND5-ENGINE.md`, this file). `docs/ROUND5-PLAN.md` shows as modified in this tree: that is the
orchestrator's sync of R33 (g) and R34, not this lane's edit. Two untracked, gitignored, read-only symlinks
to main's files keep the POC booting (round 0, unchanged): `public/models/r5-poc/sounding-ring.glb`,
`models-staging/quaternius-animatedmech/Mike.gltf`.

## 2. The decision in one table (details: `docs/ROUND5-ENGINE.md` §3.1)

| | Round-4 `high` | shipped `high` (W0b fix round 1) |
|---|---|---|
| DPR cap | 1.5 | **1.25** |
| AA | MSAA ×4 + SMAA (HalfFloat targets) | **SMAA only, RGBA8 targets** (R25) |
| GTAO | ½ res, in-place blend | **¼ res, multiplied in the grade pass** |
| bloom composite | full-res additive blend | **added in the grade pass** |
| post topology | resolve copy, HalfFloat ping-pong | **direct; `renderTarget2` RGBA8; `postTarget` released** |
| CSM | 3 × 2048, every frame | **2048 + 2 × 1024; cascades 1/2 alternate frames** |
| anisotropic filtering | as authored (POC ground 8×) | **capped at 2×** |
| render targets, DPR 1.25 | 340.74 MB (437.75 at its 1.5 cap) | **127.27 MB** |
| staged fight, textures + geometry + RTs | 891.87 MB (W0a content) | **342.45 MB** |
| Pans vista / empty-frame GPU (gate reading) | 21.6 / 12.8 ms (round-0 Q3 chain) | **10.28 / 4.83 ms (G1), 11.62 / 4.87 (QJ1), 11.23 / 4.85 (QJ2)** |

## 3. Contracts published (exact signatures)

### 3.1 `src/core/engine.js`

```js
export const QUALITY_TIERS            // rows carry, besides Round 4's fields:
  // smaaHalfFloat: boolean           false → SMAA edge + weight targets RGBA8 (UnsignedByteType)
  // csmMapCaps: number[] | null      cascade i map = min(requested, caps[min(i, caps.length - 1)]); null = uncapped
  // postFold: boolean                GTAO multiply + bloom composite inside the grade pass (false = Round 4's in-place blends)
  // csmFarCadence: number            cascade i >= 1 renders when (frame + i) % n === 0; 1 = every frame
  // maxAnisotropy: number | null     cap on every texture's anisotropic filtering; null = the GPU's maximum
export const DEFAULT_TIER = 'high'
export const ROUND4_HIGH              // frozen Round-4 `high` row (postFold false, cadence 1, anisotropy uncapped)
engine.applyTier(row: object, name = 'custom') → string   // every lever, incl. topology and anisotropy re-apply
engine.setQuality(name) → string      // unchanged signature
engine.tier                           // per-engine COPY of the row
engine.csmMapSizes: number[] | null
engine.postDirect: boolean            // direct topology in force (scene target has no MSAA samples)
engine.anisotropyCap: number          // the anisotropic-filtering cap in force
engine.grade.uniforms.tAO / uAOMix / tBloom / uBloomOn   // folded inputs; zeroed each frame, re-armed by GTAO / bloom
engine.enableCSM(opts)                // unchanged; tier caps applied after the cascades are built
engine._csmUpdate()                   // per frame, no allocation: texel snapping per cascade + the far-cascade cadence
engine.registerRenderTarget(owner, rt) → rt   // unchanged; sweeps dead WeakRefs before adding
```

Behaviour other lanes rely on, unchanged: `composer.renderTarget1 === engine.sceneTarget`;
`engine.depthTexture` is never bound as a write target (the composer's swap now refuses to hand the scene
target out as a write buffer); the studio pass appended after SMAA still gets a write target
(`postTarget`, allocated on demand); `setGrade(false)` keeps the tonemap and the folded AO/bloom;
disabling the grade pass (`grade.enabled = false`) brings back Round 4's in-place blends.

### 3.2 `tools/r5-probes/rt-ledger.mjs`

`export const RT_LEDGER` — frozen `{ measured, unit: 'bytes (1 MB = 1e6)', rows: { [owner]: bytes } }`,
12 rows (`post:pingB` = 0: released), 127,271,712 B, equal to the GL recount (`A-rt-ledger-census`).
gates-perf records it with `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` in `tools/budgets.mjs`.

### 3.3 `tools/gates.r5.engine-gpu.mjs`

Exports `GATES` (12 rows, each with `lane: 'engine-gpu'` and a `wave`), `RT_LEDGER`, `RULINGS`, `QUIET`,
`sampleBox()`, `VRAM_CENSUS`, `POC_KIT`, `GPU_TIER_BAR`, `AA_BAR`, `LOOK_CROP`, `SHADOWED_IDS`,
`SHADOW_ID_SUFFIX`.

| id (pre-merge id) | wave | kind |
|---|---|---|
| `A-terrain-1024-probe-box`, `A-terrain-1024-probe` | W0a | runner, action (unchanged) |
| `A-rt-ledger-census` | W0a | action (`?rtTally=1`) |
| `A-rt-ledger` | **W0b** (ruling) | action |
| `A-gpu-tier-box`, `A-gpu-tier` | W0b | runner, action |
| `A22-msaa` (`A22-msaa@r5`) | W0b | action |
| `V20-aa-crop` (`V20-aa-crop@r5`) | W0b | visual |
| `A108-ao-periodicity` (`…@r5`) | W0b | action |
| `A109-ao-distance-fade` (`…@r5`) | W0b | action |
| `V33b-no-ao-lattice` (`…@r5`) | W0b | visual |
| **`V-gpu-tier-look`** (new) | W0b | visual |

## 4. How the gates run

Until gates-perf's registry is merged, `tools/gates.mjs` merges only `gates.round4.*.mjs`, so the file goes
in through `--extra` (one file per run; `scratchpad/r5/engine-gpu/combo.gates.mjs` re-exports this file
plus pipeline's for the one full run):

```
node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --lane engine-gpu
node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --only A-gpu-tier-box,A-gpu-tier
```

The five re-staged rows run as `<id>@r5` until `tools/gates.r5.carried.mjs` is in the tree (the Round-4
runner keeps the first of two equal ids); after the merge they take their real ids with no edit. On a tree
without the registry the Round-4 `A22-msaa` (samples ≥ 4) FAILS by design under SMAA-only (R25's row is
`A22-msaa@r5`). The box witness must run in the same invocation, before its target.

## 5. Gate results (port 5251, this tree)

Reports (`scratchpad/r5/engine-gpu/run/`): `report.F2.json` (the round's one full run: lane block + every
global item present + must-stay-green, 24 gates; the box got loud during it), `report.G1.json` and
`report.QJ1-0944.json`, `report.QJ2-0946.json` (QJ3 unjudged: load 3.0 and another Chrome at its start) (A-gpu-tier on quiet boxes), `report.L10.json` / `report.L11.json` (A-rt-ledger before and
with the `budgets.mjs` line), exploration reports `report.X20…X41.json` (gates in
`scratchpad/r5/engine-gpu/explore/decomp.gates.mjs`). Every run went through `run.sh` (Chrome slot, disk and
memory preflight) and, for anything timed, `qrun.sh`, which waits for load < 3 and 0 headless Chromes and
then samples every 2 s whether another headless Chrome appeared during the run (`run/<tag>.box`).

### 5.1 The engine-gpu W0b block

| gate | verdict | numbers |
|---|---|---|
| `A-gpu-tier-box` | PASS in G1 / QJ1 / QJ2 | load 1.34 / 2.75 / 2.85, 0 other headless Chromes at the sample |
| `A-gpu-tier` | **PASS** (judged, 3 runs) | shipped `high` @ 1.25 — vista **10.28 / 11.62 / 11.23 ms** ≤ 13; empty **4.83 / 4.87 / 4.85 ms** ≤ 7; fps 59.88 / 60.24 / 59.88 ≥ 58; p95 18.5 / 18.7 / 18.7 ≤ 20; null frames 0.16–0.22 ms; instability ≤ 1.35; docs row = live tier. Lever record (G1): Round-4 21.71 / 12.76 → DPR 1.25 18.02 / 13.04 → GTAO ¼ 17.20 / 9.81 → SMAA-only 20.14 / 5.11 → round-0 shipped 19.77 / 4.59 → fold 17.42 / 4.96 → cadence 17.33 / 4.83 → anisotropy 2 = shipped 11.41 / 4.86; NOT shipped anisotropy 4: 15.34 / 4.87 |
| `A-rt-ledger` | **PENDING** (one clause, gates-perf's file) | 127.27 MB ≤ 170 ✓, 342.45 MB ≤ 450 ✓ (textures 100.28, geometry 114.90), docs ✓, levers restored ✓, shipped tier @ 1.25 ✓, `tools/budgets.mjs` record ✗ outstanding; with the line (`L11`): PASS on every clause |
| `A-rt-ledger-census` (W0a row) | **PASS** | GL 127,271,712 B = ledger, 0 unattributed, 0 mismatches, docs and `RT_LEDGER` match |
| `A22-msaa` (`@r5`) | **PASS** | R25 path; AA fraction 0.317 (SMAA, now reading RGBA8) / 0.195 (none) / 0.375 (Round-4 MSAA ×4 + SMAA), gain 1.624 ≥ 1.5 |
| `V20-aa-crop` (`@r5`) | NEEDS-JUDGE | §5.3 |
| `A108-ao-periodicity` (`@r5`) | **PASS** | worst 0.135 (ultra @ 1, far 128 m, control 0.137); 0 fails; witness crop 1: stock 0.236 ≥ 0.15, shipped 0.099; witness crop 2 no longer separates (stock 0.096, shipped 0.101, off 0.105; it read 0.224 / 0.122 in round 0) — the gate needs one seeing crop and has it |
| `A109-ao-distance-fade` (`@r5`) | **PASS** | high: 4–6 m 0.0682 (n 3,037), past 150 m 0 (n 2,421), far band ratio 1.000; ultra: 0.0718, 0, 1.000 |
| `V33b-no-ao-lattice` (`@r5`) | NEEDS-JUDGE | §5.3 |
| `V-gpu-tier-look` (new) | NEEDS-JUDGE | §5.3 |

### 5.2 Global green list (the items that exist in this tree) and must-stay-green — F2

| gate | verdict | numbers |
|---|---|---|
| `A1-boot-clean` | PASS | `state=playing` |
| `A9-perf-budget` | PASS | 262 draws (round 0: 309), 57.9 fps / scene GPU 19.2 ms in F2, 58.0 / 17.74 and 58.8 / 18.59 in QJ1 / QJ2 (round 0's L6: 59.3 / 17.67) — every one of those runs had another lane's Chrome alive, so R26's quiet-box fps bar is not attributable here; at the edge, watch it on the orchestrator's quiet run |
| `A20b-no-system-errors` | PASS | 0 / 0, 357 frames |
| `A21-real-draw-calls` | **FAIL** (its baseline verdict, R33: carried-baseline `fail`) | draws 266 / 171 / 278 ≤ 350 PASS (round 0: 310 / 195 / 323); triangles 3.70 / 3.34 / 3.80 M PASS (round 0: 4.12 / 3.67 / 4.22); its Round-4 GPU term (≤ 20 ms, graded at the worse of the 1.25 cap and raw DPR 2) 62.35 / 84.34 / 65.77 ms FAIL — judged this time (null frame 0.24 ms, instability 1.08), unjudged PENDING at 111.55 ms raw DPR 2 in round 0; p95 / JS PENDING (box) |
| `A90-memory-stability` | PASS | heap −7.4 %, geometries +8, textures −28, objects −1,096 |
| `A90-memory-stability-expansion` | PASS | objects −1,059, non-machine growth 0 |
| `A90b-memory-attribution` | PASS | 0 offenders, 0 orphaned textures, heap +0.8 % after forced GC (this tree's Round-4 workload; R34's Tiller workload is instruments-core's) |
| `A90-rig-reclaim` | PASS | 30 cycles: geometries +9, textures 0; per live machine 0 / 0.38 |
| `A-ID-ip-assets-gone` | PASS | 19 GLBs, 0 IP hits (`aloy.glb` scheduled for hero-body's exit) |
| `A-assets-tracked` | PASS | 221 referenced, 0 ignored |
| `A-licence-manifest` | PENDING (pipeline's clauses: third-party SHA-256s, legacy sources, credits) | files-matched PASS |
| `A20-frame-loop-survives` | PASS | 44 frames after 3 throws |
| `A22b-fov-recompile` | PASS | 3 FOVs composited; grade defines unchanged |
| `A56-cascades` (carried, CSM check) | PASS | near texel 1.38 cm ≤ 2, `shadowMapSize` 2048, 3 cascades |

Not in this tree (other lanes' W0a/W0b files): `A90-abs`, `A-alloc-rate`, `A-vram-ledger`,
`A-no-horizon-terms-*`, `A-reach-all-sites`, `A-port-guard`, `A-carried-suite`. The W0a probe pair
(`A-terrain-1024-probe-box` / `-probe`) was not re-run this round (W0a gate, judged and ruled at W0a; the
engine changes do not touch the terrain build or nav).

### 5.3 Film, read by the lane against the criteria (advisory; R29 judges grade)

Sheets kept in `scratchpad/r5/engine-gpu/run/` (`V20-aa-crop@r5.png`, `V33b-no-ao-lattice@r5.png`,
`V-gpu-tier-look.png`), filmed in F2 on the final `engine.js`.

- **V20**: top-left (shipped, SMAA-only at 1.25, 4× nearest): the diagonal column tops carry 1–2 px ramps of
  intermediate values; top-right (same frame, no AA): hard two-colour stair-steps on the same edges;
  bottom-left (Round-4 MSAA ×4 + SMAA at 1.5): softer still, notably on the near-vertical left edge of the
  tall column, where SMAA-only keeps two or three visible steps. My reading: PASS (as round 0; A22's measured
  fraction 0.317 vs 0.316 then).
- **V33b**: rows 1–2 (high at quarter-res, ultra) at four bearings: no bars, bands, checker or dither; row 3
  (1:1 shelf wall across the pan): on and OFF indistinguishable at both tiers; row 4: the boulder-foot
  close-up, on slightly darker at the plant base, and the ×8 darkening maps show soft darkening around the
  plant and along the boulder's contact (high broader and smoother), no blocks, no outline against the sky.
  My reading: PASS — the folded AO still lands where the in-place blend put it.
- **V-gpu-tier-look** (`L13`, on the final code; three columns: Round-4 `high` | shipped levers with anisotropy as authored |
  shipped `high`): top row, the three full frames read as the same scene: same light, the Sounding Ring's
  ellipse shadow on the pan, grade, bloom on the sky and grass; the two shipped frames are slightly softer
  overall (DPR 1.25 against 1.5). Bottom row, the far ground: Round 4's crop shows the salt pan's light
  polygonal crust between the ring's legs; the middle crop (DPR 1.25, 8×) still shows it, a little softer;
  the right crop (shipped, 2×) shows the pan smoother, the crust mostly gone into faint horizontal streaks;
  the dune crest's ripples read in all three. My reading against the criterion: the right tile is on the FAIL
  line for the salt pan ("horizontal streaks where the bottom-middle shows crust texture"). I would not pass
  it myself; the trade is the orchestrator's (§6.1, §7).

## 6. Honest gaps

1. **The vista bar is bought with far-ground texture detail.** With every engine lever except the
   anisotropy cap the POC vista reads 16.2–17.8 ms; capped at 4× it reads 15.2 (clean run) and fails; at 2×
   it passes. The cost is filmed (`V-gpu-tier-look`) and, in my reading, visible on the salt pan at
   40–80 m. The real Pans at W1 must be ground-shader-bound per §4.3 (≤ 3 layers, triplanar on slopes only),
   roughly half the POC's fetches; `A-gpu-tier` re-runs there and records the 4× row each time, so `high`
   can go back to 4× when it fits.
2. **The GPU timer reads a clock state, not a cost** (`docs/ROUND5-ENGINE.md` §3.4, calibration). The same
   configuration read 10.04–13.62 ms per 2 s burst across the judged runs (medians 10.28–11.62) across clean runs, and removing work can raise the reading. The vista
   passes by a margin that one GPU clock step could eat. Nothing in the gate was changed for this; the
   orchestrator may want a capacity instrument (a ruling).
3. **`A-rt-ledger`'s `budgets.mjs` clause stays PENDING in this tree** (gates-perf's file); proved passing
   with the one line (`L11`).
4. **A21 FAILS its Round-4 GPU term** (raw DPR 2), as at baseline (R33 regression guard: not worse —
   62–84 ms now against 111.55 unjudged in round 0; draws and triangles down). gates-perf's re-cast A21
   (median GPU ≤ 14 ms at the `A-gpu-tier` tier) is not in this tree.
5. **Box quietness during runs.** Other lanes' gate Chromes start without taking a Chrome slot; my monitor
   caught one during G1 and during several exploration runs (`run/*.box`). The gate's own witness samples the
   box only at its start. Judged results above say which runs stayed quiet throughout.
6. **The post chain is not bit-identical to round 0** (§3.8 of the numbers doc): the fold and the RGBA8 SMAA
   input move 2–7 % of channels by one level and ≤ 0.03 % by more (SMAA edges flipping near threshold); the
   topology and the cadence alone move nothing on static frames.
7. **The POC is not shipped content** and the re-staged gates need `?poc=biome` and `window.__R5BIOME__`
   until `A-gpu-tier` re-stages on the W1 Pans (round 0 gap, unchanged).

## 7. For other lanes and the orchestrator

- **Orchestrator:** (a) decide whether the far-ground softening in `V-gpu-tier-look` is an acceptable price
  for the 13 ms vista on the POC, or whether W0b should exit with `maxAnisotropy: 4` and the vista term
  recorded red until W1 — the two are the only options the measurements leave; (b) apply or route
  gates-perf's one line (`scratchpad/r5/engine-gpu/budgets-rt-ledger.patch`); (c) when grading A-gpu-tier,
  read §3.4: run it ≥ 3 times on a box with no other gate Chrome alive for the whole run.
- **gates-perf:** add `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` to `tools/budgets.mjs` (leaf
  module, no cycle); `A-vram-ledger` can reuse `VRAM_CENSUS`. Consider making the Chrome-slot semaphore
  mandatory for every gate Chrome: unslotted Chromes are what made several of this round's timed runs
  unusable.
- **world-ground (W1):** the ground shader is the vista's cost (11 anisotropic fetches per pixel in the POC);
  §4.3's limits are what let `high` return to 4×.
- **world-sky (W1):** cascades ≥ 1 now render on alternate frames at `high` (`csmFarCadence`); ask
  `enableCSM` for what you want, `engine.csmMapSizes` says what you got. A camera cut shows one frame of the
  previous far-cascade map.
- **shell-ui (W2):** tier names unchanged; `high` is the default.
- **any lane appending a post pass:** append after SMAA as the studio pass does; the scene target is never a
  write target and `postTarget` is allocated when a pass needs it.

## 8. Process hygiene

- Every Chrome came from `tools/gates.mjs` on `--port 5251`, one at a time, through
  `scratchpad/r5/engine-gpu/run.sh` (machine-wide Chrome slot held only for the run; disk ≥ 3 GB and memory
  ≥ 25 % checked after taking it); timed runs through `qrun.sh` (quiet-box wait + in-run monitor).
- Vite on 5251 was started from the tree with `npx vite --port 5251 --strictPort` and killed at the end.
  At the end: 0 headless Chromes of this lane, 0 `cal-*-5251-*` profiles, no Chrome slot held, Vite on 5251
  killed, the exploration and judged-run loops stopped. One slip this round: an exploration film (`X42`) ran
  while the quiet-run loop's `Q1` was measuring, so for about 40 s this lane had two Chromes alive and `Q1`
  is discarded (it was unjudged anyway). Screenshots deleted from the tree (`shots/gates/` has no PNG); the
  three V sheets are kept in `scratchpad/r5/engine-gpu/run/` (≈ 3.3 MB). Scratch outside the tree ≈ 5 MB:
  `run/` (reports, logs, `*.box` monitor files), `explore/decomp.gates.mjs` (every exploration gate cited
  here), `budgets-proof/` (the A-rt-ledger proof root), `budgets-rt-ledger.patch`, `run.sh`, `qrun.sh`,
  `qjudged.sh`, `cleanloop.sh`. Free disk 36 GB throughout.
- Port 5173 was never touched. No git write was run.
