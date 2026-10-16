# ROUND 5 — lane engine-gpu, W0a report (probes), after fix round 3

Port 5251, worktree `scratchpad/r5/engine-gpu/tree`, Oct 16 2026.

Plan sections this report follows: `docs/ROUND5-PLAN.md` §2 (row engine-gpu), §1.2 (the engine.js
grant: "render-target measurement hooks"), §3.1, §4.3–§4.4 and §9 (the engine-gpu block). The
measured numbers live in **`docs/ROUND5-ENGINE.md`**, the plan's engine document; this file is the
lane report.

W0a is **probes only** (orchestrator ruling): the 1024 m terrain + nav probe and the render-target
ledger measurements. The GPU tier decision (`A-gpu-tier`, `A22-msaa`, `A108`, `A109`, `V20`, `V33b`)
is the W0b exit and was not started.

## 0. Summary

1. **The render-target ledger now matches the GPU's allocation calls to the byte, and it was 3.15 MB
   short.** `PMREMGenerator.fromScene()` gives the environment target a 768 × 1024 DEPTH_COMPONENT24
   renderbuffer, and `environment.js` drops the target. The ledger now counts that target with its
   depth: **340.74 MB**, not 337.6. `A-rt-ledger-census` no longer re-derives bytes with the ledger's
   own arithmetic. It boots the page with `?rtTally=1`, records every GL allocation since the
   context's first call, and requires every live render-target allocation to belong to a ledger row
   with equal bytes. Two negative controls prove it: the fix-round-2 ledger FAILs it, and so does a
   ledger missing one cascade.
2. **The cheapest lever set no longer fits.** SMAA-only + CSM 3 × 1536² + RGBA8 SMAA is now
   **170.70 MB, 0.70 MB over** the 170 MB bar. The sets that fit are + GTAO ¼ (160.56 MB), CSM 1024²
   (157.25 MB) and 1024² + RGBA8 (139.25 MB). These are W0b decisions.
3. **The probe no longer grades the worker pool on its own authority.** Whether the 600 ms bar may grade
   a build path that is not in `src/` is now the orchestrator's ruling, `pool-terrain-build`. The gate
   reads it from a marker in the plan. Unruled, only the single-thread build can pass, and a
   pool-only pass is PENDING. Every decision is computed under both rulings, so one quiet run answers
   either way.
4. **A pool verdict now needs its own witness.** That witness is today's mesh built on a cold pool 3×
   before and 3× after the candidates, within 10 %. It caught two loud runs whose single-thread
   bracket read "stable" (1.32× and 1.285×).
5. **`RT_LEDGER` moved to a leaf module** (`tools/r5-probes/rt-ledger.mjs`, no imports). The
   fix-round-2 advice to re-export it from the lane gate file was wrong: it closed an import cycle that
   stops the gate runner loading any gate. That advice is withdrawn, the new path loads in both import
   orders, and the old one still fails as a control. "Recorded in budgets.mjs" now compares rows, not
   presence.
6. **A quiet box came, and the probe judged every term.** It came at 10:13, with load 1.49–2.67 and
   0 other headless Chromes; Q5p and Q6p judged every term.
   - Single-thread build: 1024 m and 860 m FAIL, 720 m PASS.
   - Cold pool (bit-identical, witness 1.02× / 1.03×): PASS at every size, 1024 m in 430.6–544.1 ms.
   - GPU delta: **+0.23 / +0.20 ms** PASS. Nav 43–44 ms PASS. Vertex buffers 20.77 MB PASS.
   - **The W1 size is therefore 1024 m if the orchestrator accepts `pool-terrain-build`, and 720 m if
     it rejects it.** Until it rules, the gate is PENDING and writes no size, as finding 3 asked.
7. **A9 has valid grades on the quiet box.** It PASSed 5 of 6 runs on its Round-4 bar of 45 fps:
   51.8 / 51.8 fps with this lane's `engine.js` and 52.2 / 52.1 fps with HEAD's (scene GPU 19.5–19.7 ms
   in all four), then 48.6. The one FAIL (41.4 fps, GPU 34.4 ms) came in a GPU slow state; the probe
   saw the same state in Q3p and Q4p. A21 FAILs on the quiet box on its own 20 ms GPU bar (§4.2).

## 1. Fix round 3, finding by finding

| # | finding (judge) | what changed | evidence now |
|---|---|---|---|
| 1 | **blocker** — `A-terrain-1024-probe` PENDING in both judge runs; no W1 size written | No bar or rule moved. The probe now computes the decision under **both** `pool-terrain-build` rulings (`decision.byRuling`, finding 3). The lane's quiet waiter caught a window (10:13–10:27: 0 other headless Chromes, load 1.49–2.67) and ran the probe four times on the final files. | **Q5p and Q6p judged every term** (§4.1). `decision.byRuling` was identical in both: **accepted → 1024 m** (PLAY_RADIUS 490, MESH_SEGS 686, nav R 492); **rejected → 720 m** (PLAY_RADIUS 343, MESH_SEGS 482, nav R 345). The gate stays **PENDING** with `rulingNeeded: "pool-terrain-build: accepted -> 1024 m; rejected -> 720 m"`: unruled, a size is written only where both rulings agree. Q3p and Q4p agree on every term they judged. |
| 2 | **blocker** — `A-rt-ledger` FAILs its bar; which wave grades it is unruled | The lane still does not pick the wave. The gate now reads the ruling from the plan: a line `<!-- r5-ruling rt-ledger-bar=W0a -->` or `=W0b` sets its `wave`. With no marker it stays **W0a** (the W0a brief), reads FAIL as measured, and carries `rulingRequested`. The bar did not move. | L4 / L6: **FAIL** — RT **340.74 MB** (bar 170); staged fight **891.87 MB** (textures 422.12 + geometry 129.01 + RT 340.74; bar 450); docs ✓; `budgets.mjs` ✗ (gates-perf's file has no `RT_LEDGER`); levers restored ✓. Marker test (scratch copies of the plan): none → W0a; marker quoted inline in prose → W0a (ignored); marker on its own line → W0b. |
| 3 | **major** — the build term is graded on a 4-worker pool that does not exist in `src/`, binding W1 | **The gate no longer grades the pool unless the orchestrator accepts it.** The ruling is read from `<!-- r5-ruling pool-terrain-build=accepted -->` (or `=rejected`) on its own line in `docs/ROUND5-PLAN.md`. If accepted, the pool is graded when bit-identical. If rejected, the single-thread build is graded. **Unruled (today)**, the single-thread build can pass, a pool-only pass is PENDING (ruling), and red on both is red. Each size carries `serialTerm`, `poolTerm`, `termIfAccepted` and `termIfRejected`. The decision carries `byRuling` for both rulings, and writes a size unruled only where both agree. The `pool-terrain-build` condition binds a decision only when its build path is the pool. Proposed W1 text for each ruling is in `ROUND5-ENGINE.md` §2.6, including "timed cold inside the real boot". | L6: 1024 m single-thread 961.6–978.8 ms (`serialTerm` false, surviving drift); pool 440.4–562.2 ms (bit-identical, unjudged); build term **PENDING** with reasons: loud box, *"grading the pool build needs the orchestrator ruling pool-terrain-build"*. |
| 4 | **major** — the ledger misses the PMREM target's depth renderbuffer, and the census still passes | (1) `engine.js` remembers every `PMREMGenerator` output (`fromScene` / `fromEquirectangular` / `fromCubemap`) by its texture, holding the target only through a WeakRef. The ledger counts `scene.environment` as the producing **target**, colour + depth, while that object lives, and from the texture plus the recorded depth after its owner drops it. A texture a registered target owns is counted once, on the registered row (for when world-sky registers `env:pmrem`). (2) The env row is now 9,437,184 B in `docs/ROUND5-ENGINE.md` and `RT_LEDGER`; the total is 340.74 MB; the levers were re-measured live. (3) **The census recounts from the GL calls.** `?rtTally=1` makes `engine.js` wrap the WebGL2 prototype before the context exists. The census sizes every live attachment and renderbuffer with its own GL-format table and attributes each to a ledger row. It requires 0 unattributed bytes and every row equal to the byte. (4) A world-sky handoff is in `ROUND5-ENGINE.md` §1.5. | c1, L4, L6: census **PASS** — GL 340,743,360 B = ledger 340,743,360 B; 23 live framebuffers, 42 GL objects; 0 unattributed; 0 row mismatches; 0 unknown formats; 0 orphan calls. Env row: texture 6,291,456 + renderbuffer 3,145,728. Both env paths were exercised: c1 with the target alive, L6 after GC collected it. **Negative controls** (scratch, `controls/gates.control.mjs`): the fix-round-2 ledger (env = texture only) → **FAIL**, `env:environment` ledger 6,291,456 vs GL 9,437,184; a ledger omitting `shadow:csm[2]` → **FAIL**, 33,554,432 B unattributed (RGBA8 2048² texture + DEPTH24 2048² renderbuffer). |
| 5 | **major** — the probe still writes no W1 size; the pool straddles the bar; the CPU bracket does not witness the pool's cores | **Pool witness added**, and exercised on the quiet box (finding 1). Today's mesh is built on a cold pool 3× before and 3× after the candidates. A pool verdict needs the two medians within 10 %, on top of the quiet box and the single-thread bracket. Both witnesses now warm up until two consecutive builds agree within 10 % (at most 9 builds; recorded in `warmUp`). After one warm-up, both loud runs read their *before* builds slower than their *after* builds, and on a loud box warm-up and load cannot be told apart. | L4: single-thread bracket 1.058× "stable", **pool witness 1.32× → pool PENDING**. L5: 1.058× / **1.285×** → PENDING. L6, final files (steady warm-up): 1.047× / 1.01×, both stable; the terms are still PENDING on load 3.77 and 1 other Chrome. **Quiet box:** Q3p 1.029× / 1.099×, Q5p 1.03× / 1.02×, Q6p 1.028× / 1.03× (pool terms judged); **Q4p 1.028× / 1.125× → pool terms PENDING** while the single-thread terms were judged. That is the witness doing its job on a quiet box. |
| 6 | **major** — the recommended `RT_LEDGER` re-export in `budgets.mjs` creates an import cycle | `RT_LEDGER` lives in **`tools/r5-probes/rt-ledger.mjs`**, which has no imports. The lane file imports and re-exports it. The top-level `await import('./budgets.mjs')` is gone; the lane file reads `BUDGETS_MOD.RT_LEDGER` from its existing static import. The recommendation is corrected (§7) to `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';`. `recordedInBudgets` now compares `budgets.mjs`'s rows with the live ledger, owner by owner, within 1 %, as the docs clause does. | Scratch copies with that line appended (`cycle3/`), with my tree's `budgets.mjs` and with gates-perf's current one: budgets first → loads, 12 rows, 4 gates, the same frozen object. Lane file first → loads. Control: the old line (`from './gates.r5.engine-gpu.mjs'`) still throws `ReferenceError: Cannot access 'PERF_SCENARIOS' before initialization`. |

## 2. Deliverables

| item | file | status |
|---|---|---|
| render-target measurement hooks (grant: "render-target measurement hooks") | `src/core/engine.js` (+398 lines vs HEAD, additions only: fix round 1's ledger/registry/tracking + fix round 3's PMREM capture, env-with-depth row, row `target`/`texture`, `?rtTally=1` GL tally) | done |
| 1024 m terrain + nav probe: today's real build single-thread and on a cold worker pool, with a bit-exact equivalence check | `tools/r5-probes/terrain1024.js` (unchanged this round) | done |
| the measured ledger as a dependency-free module | `tools/r5-probes/rt-ledger.mjs` (new) | done |
| gate block, registered for `--lane engine-gpu` | `tools/gates.r5.engine-gpu.mjs` (4 rows: box witness, probe, census, ledger) | done |
| engine numbers (RT ledger, live levers, probe, GPU baseline) | `docs/ROUND5-ENGINE.md` | §1 and §2 updated |
| lane report | `docs/ROUND5-ENGINE-GPU.md` (this file) | done |
| RT bytes "recorded in tools/budgets.mjs" | gates-perf's file, not edited; the one-line re-export is in §7 | handoff |

No asset was created, so no provenance or `LICENSES.json` row is needed. No file outside the §2 row
and the §1.2 grant was edited. `tools/r5-probes/` holds only this lane's probe files.

## 3. Contracts published (exact signatures)

### 3.1 `src/core/engine.js` (on demand only; nothing runs per frame)

```js
engine.renderTargetLedger()
  // → { rows: Array<{ owner: string, name: string, width: number, height: number, samples: number,
  //        type: number, format: number, depth: 'texture'|'renderbuffer'|'none'|string,
  //        parts: { color: number, msaaColor: number, msaaDepth: number, depth: number },
  //        bytes: number, mb: number, allocated: boolean,
  //        target: THREE.RenderTarget|null, texture: THREE.Texture|null,     (new: for the census)
  //        pmrem?: 'fromScene'|'fromEquirectangular'|'fromCubemap'|null }>,  (new: env rows)
  //     bytes: number, mb: number, provisionedBytes: number,
  //     canvas: { width: number, height: number, bytes: number, mb: number },
  //     pixelRatio: number, quality: string, msaa: number, gtao: boolean, gtaoScale: number,
  //     bloom: boolean, smaa: boolean, tracking: boolean }
engine.registerRenderTarget(owner: string, rt: THREE.RenderTarget) → rt
  // held WEAKLY (WeakMap owner + WeakRef enumeration); survives setSize(); a disposed target reads
  // allocated:false (bytes not summed) until re-bound; never keeps a target alive; a texture a
  // registered target owns is never counted again as scene.environment / scene.background
engine.unregisterRenderTarget(rt: THREE.RenderTarget) → boolean        // the explicit exit
engine.trackRenderTargets(on: boolean) → boolean                       // measurement mode; off restores renderer.setRenderTarget
engine.glTally                                                         // (new) null, or with ?rtTally=1 the GL allocation tally
  // { tex: Set<info>, rb: Set<info>, fb: Set<info>, info: WeakMap<WebGLObject, info>, orphanCalls: number, since: number }
  // info = { kind: 'tex', obj, lv: Array<{ face, level, ifmt, fmt, type, w, h, d, bytes /* -1 = from format */ }>, deleted }
  //      | { kind: 'rb', obj, ifmt, w, h, samples, deleted } | { kind: 'fb', obj, att: { [attachmentEnum]: info|null }, deleted }
  // also window.__rtTally. Installed on WebGL2RenderingContext.prototype before THREE.WebGLRenderer is built.
```

Module side effect (engine.js import, once): `THREE.PMREMGenerator.prototype.fromScene /
fromEquirectangular / fromCubemap` are wrapped to remember their output target by texture (a WeakRef
plus `{ width, height, depthBuffer }`); return values and arguments are untouched.

Owners: `post:scene`, `post:pingA`, `post:pingB`, `post:<PassClass>.<prop>[i]` (found by scanning
every composer pass), `shadow:csm[i]`, `shadow:<light name|type>`, `env:environment` /
`env:background` (the PMREM target **with its depth**), registered owners, and `unregistered` (bound
while tracking but otherwise unknown; the census requires 0). **Any lane that owns a render target
outside the post chain and the lights calls `registerRenderTarget`**: world-sky's `CAL.lightShafts`
(`environment.js:1141`) and, once kept, its PMREM target (`env:pmrem`).

### 3.2 `tools/r5-probes/terrain1024.js` (dev-only, Vite-served, never bundled)

```js
PROBE      // { worldSize: 1024, spanFactor: 1.3, meshSegs: 686, playRadius: 490, navSpan: 2, maskN: 512, controlN: 64 }
FALLBACKS  // [{ worldSize: 860, playRadius: 412, meshSegs: 576 }, { worldSize: 720, playRadius: 343, meshSegs: 482 }]
SIZES      // [PROBE-as-size, ...FALLBACKS] in decision order
TODAY      // { worldSize: 720, span: 972, meshSegs: 500 } — the calibration mesh
SITES      // bible §8.4 land sites, { name, x: E, z: −N }
PARALLEL   // { workers: 4, rowsPerJob: 24, maskRowsPerJob: 64, inflightPerWorker: 2 }
loadTerrainAt() → Promise<{ mod, sink, patched: string, detailCfgs: object[], source: string }>
  // today's src/world/terrain.js as Vite serves it; MESH_SPAN/MESH_SEGS settable (mod.__probeMesh(span, segs));
  // _smoothField/_bakeDetail + 5 build methods timed on this copy only;
  // mod.__probeInternals = { THREE, Terrain, SS, RIM_IN, RIM_OUT, MASK_N, WORLD_SIZE, WORLD_HALF,
  //   smoothField, bakeDetail, bareTerrain() /* today's constructor minus its three build calls */ };
  // detailCfgs = the three `_bakeDetail(256, {...})` literals parsed from today's _buildMesh; throws if an anchor moved
realBuild(TL, { span: number, segs: number })
  // → { ms: { constructor, buildMesh, heights, smooth, vertexColors, normalsAndGeometry, masks, detail, cliffs, farRanges },
  //     vertices, span, segs, nodeSpacing, perSampleUs, perVertexUs, bytes, geometry, heightAt(x, z),
  //     outputs() → { geometry, H, HS, masks: DataTexture[3], detail: DataTexture[3] }, dispose() }
parallelBuild(TL, { span: number, segs: number, workers?: number = PARALLEL.workers }) → Promise<{
  //   ms: { geometryArrays, heights, smooth, colorsNormals, bakesWait, total, afterTerminate },
  //   vertices, span, segs, workers, workerBusyMs, jobs, geometry, outputs() (as realBuild), dispose() }>
  // the same passes on a COLD module-worker pool: spawned, imported and terminated inside the call
compareBuilds(a, b) → { equal: boolean, buffers: { [name]: { length, diffs, first } }, params: object[6], differing: string[] }
  // bit for bit (32-bit views) over position/normal/uv/color/index/H/HS/mask1-3/detail0-2 + 11 sampling params per texture
biomeWeights(x, z, out: Float32Array(6)) → out
islandHeight(x, z) → number                       // stand-in island (nav slopes/blockers only; NOT graded)
buildTerrain1024({ heightFn = islandHeight, worldSize = 1024, segs = 686, masks = true, sampleFrom = null } = {})
  // lean pass model, ungraded; → { geometry, maskTex, controlTex, grid, heightAt(x, z), ms, bytes, shape, dispose() }
loadNavAt(playRadius = 490) → Promise<{ Nav, R, N, source }>   // the frozen nav.js, 2 imports rebound
buildNav(Nav, { getHeight, collision, pools = [] }) → { nav, N, ms: { height, cost, stamp, total }, open, blocked, ready, dispose() }
```

Memory: `parallelBuild` keeps no worker past its return. The pool is terminated and both blob URLs
are revoked on the success path and on every failure path, every returned object has `dispose()`,
and nothing runs per frame. The worker source is a string inside this file (no new file).

### 3.3 `tools/r5-probes/rt-ledger.mjs` (new; no imports)

```js
export const RT_LEDGER  // frozen { measured: string, unit: 'bytes (1 MB = 1e6)', rows: { [owner]: bytes } }
```
The 12 owners of `ROUND5-ENGINE.md` §1.1, 340,743,360 B in total; the bloom chain is one row.
Import it from here only (it is the leaf that breaks the cycle).

### 3.4 `tools/gates.r5.engine-gpu.mjs`

Exports `GATES` (4 rows, `lane: 'engine-gpu'`, each with a `wave`), `RT_LEDGER` (re-exported from the
leaf), `RULINGS` (new: `{ poolTerrainBuild: 'accepted'|'rejected'|null, rtLedgerBar: 'W0a'|'W0b'|null,
source }`, read from plan markers), `VRAM_CENSUS`, `QUIET` and `sampleBox()`. No top-level `await`.

**Plan markers it reads** (one per ruling, on a line of its own, anywhere in `docs/ROUND5-PLAN.md`):
```
<!-- r5-ruling pool-terrain-build=accepted -->      (or =rejected)
<!-- r5-ruling rt-ledger-bar=W0b -->                (or =W0a)
```

**How it runs.** Until gates-perf's `A-gates-autodiscover` lands, `tools/gates.mjs` merges only
`gates.round4.*.mjs`, so the file goes in through the runner's existing `--extra` flag:

```
node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --lane engine-gpu
```

After discovery is merged, drop `--extra`: `node tools/gates.mjs --port 5251 --lane engine-gpu`. A
leftover `--extra` only logs "duplicate gate id … keeping the first". The census row carries
`params: 'rtTally=1'`, which the runner appends to the page URL.

**The box witness must run in the same invocation, before the probe.** `--lane engine-gpu` does
that; with `--only`, list both: `--only A-terrain-1024-probe-box,A-terrain-1024-probe`. The witness
rewrites the probe's `assert` on the gate object the runner passes to `check({ GATES })`. If a future
runner copied the objects, the probe would read "box not sampled" and every clock would stay
PENDING — never a false PASS.

## 4. Gate results (port 5251, this tree)

### 4.1 The engine-gpu block

Reports: `scratchpad/r5/engine-gpu/run/report.{c1,ctrl,L4,L5,L6,Q3p,Q4p,Q5p,Q6p}.json`. L4 used one
warm-up and L5 three. **L6 and Q3p–Q6p ran the final files.** The one exception is the 10:33 edit to
the `?rtTally=1` wrappers (§6.2), code those probe runs never execute. L4–L6 ran on a loud box;
Q3p–Q6p ran on a quiet one (0 other headless Chromes, load < 3).

| gate | wave | c1 / ctrl | L4 (load 4.86, 2 other Chromes) | L5 (5.11, 1) | **L6, final files (3.77, 1)** |
|---|---|---|---|---|---|
| `A-terrain-1024-probe-box` | W0a | — | **PENDING**: load, 2 other Chromes | **PENDING**: load, 1 | **PENDING**: load 3.77, 1 other Chrome |
| `A-terrain-1024-probe` | W0a | — | **PENDING**. 1024 m: single-thread 1019.7 (FAIL on any box); pool 616.1 (592.7 / 616.1 / 647.4), bit-identical, pool witness 1.32× (unstable). Vertex 20.77 MB PASS. Nav 38.0. GPU PENDING (+4.54, IQR 5.63). No size. | **PENDING**. Single-thread 1014.2; pool 536.9 (526.7 / 594.6 / 536.9); witness 1.285×. Nav 42.4. GPU PENDING (null frame 5.36 / 5.08). No size. | **PENDING**. Single-thread **976.7** (961.6–978.8, FAIL on any box); pool **464.5** (562.2 / 464.5 / 440.4), bit-identical over 12,891,333 values; brackets 1.047× / 1.01× (stable). Vertex 20.77 MB PASS. Nav **38.9** (62.7 / 38.9 / 33.7). GPU PENDING (+9.33, IQR 14.73, instability 1.71 / 2.67). Decision: no size; `byRuling` accepted → pending at 1024 m, rejected → pending at 860 m. |
| `A-rt-ledger-census` | W0a | c1 **PASS** (GL = ledger = 340,743,360 B; env target alive). ctrl: both controls **FAIL** as required | **PASS** | — | **PASS**: 23 targets, 22 allocated, 0 unregistered; GL recount 340,743,360 B, 0 unattributed, 0 mismatches; env 9,437,184 B via the dropped-target path (the target had been collected); docs + `RT_LEDGER` match; registration contract OK |
| `A-rt-ledger` | **W0a** (unruled) | — | **FAIL**: RT 340.74 > 170; staged fight 891.87 > 450; docs ✓; budgets ✗; restored ✓ | — | **FAIL**: same numbers; `rulingRequested` carried |

**The probe on the quiet box (final files):**

| run | box | brackets (single / pool) | 1024 m build: single · pool | GPU Δ (IQR) | nav 1024 | `A-terrain-1024-probe-box` / probe | `decision.byRuling` |
|---|---|---|---|---|---|---|---|
| Q3p | 2.33 / 0 | 1.029× / 1.099× | **FAIL** 960.9–968.7 · **PASS** 431.5–460.2 | unjudged (instability 2.72) | 41.9 PASS | **PASS** / PENDING | accepted → pending 1024 (GPU); rejected → pending 720 (GPU) |
| Q4p | 2.59 / 0 | 1.028× / **1.125×** | **FAIL** 979.2–986.7 · PENDING (witness) | unjudged (null frame 10.06) | 42.2 PASS | **PASS** / PENDING | accepted → pending 1024; rejected → pending 720 (GPU) |
| **Q5p** | 2.67 / 0 | 1.03× / 1.02× | **FAIL** 968.6–978.6 · **PASS** 430.6–461.1 | **+0.23 (0.77) PASS** | 44.1 PASS | **PASS** / PENDING (ruling) | **accepted → 1024 m; rejected → 720 m** |
| **Q6p** | 1.49 / 0 | 1.028× / 1.03× | **FAIL** 966.7–981.1 · **PASS** 510.3–544.1 | **+0.20 (0.57) PASS** | 43.2 PASS | **PASS** / PENDING (ruling) | **accepted → 1024 m; rejected → 720 m** |

860 m in Q5p/Q6p: single FAIL (714.7–736.9), pool PASS (342.8–579.1). 720 m: single PASS (533–538.7),
pool PASS (269.8–292). Vertex buffers 20.77 / 14.65 / 10.26 MB PASS. The probe's verdict stays
PENDING for one reason only, the unruled `pool-terrain-build`.

### 4.2 Global green list (the items that exist in this tree)

G2 ran after the `engine.js` change, on a loud box (load 4–5, 1 other lane's headless Chrome).
Report: `run/report.G2.json`. A1, A9 and A21 were then re-run on the quiet box (Q3a, Q5a), and A9 as
an attribution control with this lane's `engine.js` and with HEAD's, alternated (A9mine1/2,
A9head1/2).

| gate | verdict | numbers |
|---|---|---|
| `A1-boot-clean` | **PASS** (G2 and quiet Q3a) | `state=playing` |
| `A20b-no-system-errors` | **PASS** | 0 system errors, 0 hook errors, 206 frames |
| `A20-frame-loop-survives` | **PASS** | 44 frames after 3 throws; the system is called 100× after the throw |
| `A22b-fov-recompile` | **PASS** | 3 FOVs composited, 0 errors |
| `A90-memory-stability` | **PASS** | heap −2.4 %, geometries +10, textures −19, objects −527 |
| `A90-memory-stability-expansion` | **PASS** | objects −305, nonMachineGrowth 0, heap −6.2 % |
| `A90b-memory-attribution` | **PASS** | 0 offenders, 0 orphaned textures, heap −2.8 % after a forced GC |
| `A90-rig-reclaim` | **PASS** | 30 cycles: geometries +8, textures 0; per live machine 0 / 0.38; held-then-released 0 / 0 |
| `A21-real-draw-calls` | G2 (loud) **PENDING**; quiet Q3a **PENDING**; quiet Q5a **FAIL** | draws 319 / 211 / 340 (≤ 350) PASS; triangles 4.24 / 3.92 / 4.37 M PASS. Q5a: **medianGpuMs 78.7 / 100.45 / 83.23 ms against A21's 20 ms bar**, null frame 0.96 ms, burst instability 1.01–1.02, so A21 reads it as "the frame itself" → FAIL; p95 frame PENDING (null-frame p95 18.4 ms). A21 grades the worse of DPR 1.5 (today's `high` cap) and DPR 2. The spawn vista costs 50.06 ms of GPU at 1.5 and 78.7 at 2, against 19.4 ms at DPR 1 (A9, same minute). That is pixel count, the W0b DPR / tier decision. Attribution control: not run — after 10:28 free disk sat at 2.90 GiB, under the 3 GB launch floor. A9's alternated control (same vista, same `engine.js` pair, 0.1 ms apart) stands for it: outside `?rtTally=1` the only new `engine.js` code that runs is the PMREM wrap, once at boot. |
| `A9-perf-budget` | **quiet: PASS 5 of 6** (G2 loud: PENDING) | Quiet, Round-4 bar ≥ 45 fps, 319 draws in every run. **This lane's `engine.js`: 51.8 / 51.8 fps (scene GPU 19.53 / 19.63 ms); HEAD's `engine.js`: 52.2 / 52.1 fps (19.47 / 19.67 ms)**, alternated, so the change costs nothing measurable. Q5a 48.6 fps PASS. Q3a 41.4 fps (GPU 34.4 ms, null frame 0.55) **FAIL**, in the GPU slow state the probe also saw in Q3p and Q4p. Note: R26's re-cast bar is 58 fps; at 52 fps today's tier would not meet it. That is the W0b tier decision (DPR 1.25 measured 60 fps, `ROUND5-ENGINE.md` §3), and gates-perf's re-cast is not in this tree. |

Not in this tree yet (other lanes' W0a/W0b gates): `A90-abs`, `A-alloc-rate`, `A-vram-ledger`,
`A-ID-ip-assets-gone`, `A-licence-manifest`, `A-assets-tracked`, `A-no-horizon-terms-*`,
`A-reach-all-sites`, `A-port-guard`, `A-carried-suite`.

### 4.3 Film (read by the lane; this block has no V gate at W0a)

The judges cited no shot this round. The one change that could alter a frame is the PMREM wrap in
`engine.js`, so the lane re-filmed the fix-round-1 spawn vista with the same eval
(`film/evalA.js`): `film/shots/eg-vista-720-r3.png` against `eg-vista-720.png` (Oct 15).
- I read both. The camera, rim, sky band, camp, watchtower, palisade, HUD and player all match, and
  the environment lighting reads the same on the rim and the wall.
- Mean |Δ|: 2.83 on the sky/rim band, 7.5 on the camp, 32.8 on the ground right. The differences are
  the wind-animated grass (its sway phase and the tufts on the right slope) and the player's idle
  pose.
- For scale, fix round 1's 720 m vs 1024 m pair read 3.16 on the sky/rim.
- No frame shows a lighting or IBL change.

Fix rounds 1–2's shots (`eg-vista-720`, `eg-vista-1024real`, `eg-vista-1024pool`, the aerials) stand as filmed.

## 5. What the measurements mean

### 5.1 Render targets (W0b input)

**340.74 MB today.** MSAA costs 108 MB (72 MB colour plus 36 MB depth renderbuffers), the three 2048²
cascades 100.66 MB, the full-res HalfFloat SMAA targets 36 MB, and the environment 9.44 MB, of which
3.15 MB is a depth buffer needed only while PMREM renders. The bar is reachable only with SMAA-only
**and** smaller cascades, and the 1536² + RGBA8 set is now 0.70 MB over it. The sets that fit are
+ GTAO ¼ (+9.44 MB of margin), 1024² (+12.75) and 1024² + RGBA8 (+30.75). If world-sky drops the PMREM
depth (§7), every row gains 3.15 MB. CSM size is world-sky's argument to `engine.enableCSM`, and W0b
can cap it from the tier table inside `enableCSM` (engine grant).

### 5.2 The world size

- **Judged on a quiet box, twice:** today's single-thread terrain build is red at 1024 m (≈ 975 ms)
  and 860 m (≈ 720 ms) and green at 720 m (≈ 536 ms). The same passes on a cold 4-worker pool,
  bit-identical, are green at every size: 1024 m in 430.6–544.1 ms (on today's own mesh the cold
  pool ran 1.57–1.75× faster than the single thread). The 1024 m mesh costs +0.2 ms of GPU at the
  vista, and the navgrid takes 43–44 ms.
- So the W1 size is a policy question, and the gate leaves it to the orchestrator.
  - **Accept the pool:** world-ground ships a pool build, timed cold inside the real boot by
    `A-world-size`, and the world is 1024 m.
  - **Reject it:** the world is 720 m on today's single-thread code.
- 860 m is not an answer under either ruling: the pool passes at 1024 m, and the single thread fails
  at 860 m.

## 6. Honest gaps

1. **The quiet window was short and shared.** The waiter (10 s samples, `run/quiet.log`) saw 0 other
   headless Chromes with load < 3 from 10:13 to about 10:28. Other lanes' runs had held the box from
   09:28, and the window closed when free disk fell under 3 GiB. In it the lane ran 4 probes, 6 A9s
   and 2 A21s. Two probes (Q5p, Q6p) judged every term; Q3p and Q4p left the GPU or the pool
   unjudged. A second orchestrator run on 5270 would confirm the table; the lane cannot make it
   PASS without the ruling.
   **Even on a quiet CPU the GPU has slow states.** In Q3p the 1.5 s burst medians of an unchanged
   mesh swung between ≈ 19 and ≈ 51 ms; in Q4p they sat near 66 ms, after a 10.06 ms null frame. A9's
   one quiet FAIL (Q3a) fell in that state. The probe's GPU witnesses refuse such runs. A9's
   single-burst design does not, which is gates-perf's R26 re-cast to weigh.
2. **One last edit has no Chrome run.** At 10:33 the measurement-mode wrappers in `_installGlTally`
   were changed to take named parameters instead of handing `arguments` on, so a `?rtTally=1` page
   allocates nothing per GL call once warm. The GL calls still go through the same
   `orig.apply(this, arguments)` as in every Chrome-verified census (c1, L4, L6). The edit was
   verified by `scratchpad/r5/engine-gpu/node-lab/tally-test.mjs`, which extracts the function from
   `engine.js` and drives it with a fake WebGL2 prototype: PASS. It checks arity passthrough (9 / 6),
   the texImage2D, texStorage2D-cube and generateMipmap levels, the MSAA and depth renderbuffers, the
   attachments, deletes and 0 orphan calls. It was **not** re-run in Chrome: from 10:28 to 11:13
   free disk stayed at 2.84–2.90 GiB, under the launch floor. Outside `?rtTally=1` this code never
   runs. The first census on the final file is the judges' or the orchestrator's.
3. **The pool's advantage is wall clock, not CPU, and it needs free cores.** The 4 workers burned
   1.48–1.98 s of CPU for a 0.46–0.62 s 1024 m build (L4–L6), against ≈ 1.0 s on one thread. A boot
   doing other heavy work at the same time shares those cores; `A-world-size` must time the shipped
   path cold, inside the real boot (in the proposed W1 text).
4. **The census proves the ledger against the GL calls, not against the driver.** WebGL cannot query
   VRAM. The convention shared by ledger and census (RGB stored as 4 channels, DEPTH_COMPONENT24 = 4 B)
   is stated, not measured. The GPU-process footprint is `A90-abs` (gates-perf). The census's
   `?rtTally=1` mode holds every GL object that was not explicitly deleted, so in that page a dropped
   object is never reclaimed by GC. That makes it the conservative reading, and it is why the ledger
   counts the dropped PMREM depth too.
5. **The PMREM capture wraps a three prototype from `engine.js`.** It runs once per PMREM call at boot
   and changes no argument or return value; A1, A20b and the A90 family stayed green after it (G2). If
   world-sky keeps and registers the target, the wrap becomes redundant but harmless.
6. **`A-rt-ledger` is FAIL** on three clauses: render targets 340.74 > 170 MB; the staged-fight total
   891.87 > 450 MB, of which 422 MB is Round-4 textures that W0a–W2 delete; and no record in
   `tools/budgets.mjs`. Which wave grades it awaits the orchestrator's ruling.
7. **The graded build is today's code at the R5 vertex count**, not world-ground's R5 build;
   `A-world-size` grades that at W1. The nav stamp load uses today's 4,917 Round-4 colliders; the
   stand-in island puts 5 of 18 sites on > 45° cells.
8. **`loadNavAt`, `loadTerrainAt` and `parallelBuild` are dev-only.** They need Vite's transformed
   sources and refuse to run if an anchor moved.

## 7. For other lanes and the orchestrator

- **Orchestrator:**
  1. **Rule `pool-terrain-build`.** Put `<!-- r5-ruling pool-terrain-build=accepted -->` (or
     `=rejected`) on its own line in `docs/ROUND5-PLAN.md`. On the quiet-box measurements:
     - *accepted* → **1024 m** (PLAY_RADIUS 490, MESH_SEGS 686, nav R 492), and the gate PASSes. This
       binds world-ground to a pool build bit-identical to the single-thread one, timed cold inside
       the real boot (proposed W1 text in `ROUND5-ENGINE.md` §2.6).
     - *rejected* → **720 m** (PLAY_RADIUS 343, MESH_SEGS 482, nav R 345), and the gate reads FAIL at
       1024 m with the fallback written, which is the plan's "else" clause.
  2. **Confirm with one quiet run:** `node tools/gates.mjs --port 5270 --extra
     tools/gates.r5.engine-gpu.mjs --only A-terrain-1024-probe-box,A-terrain-1024-probe`, one Chrome
     on the box. The gate then writes the ruled size.
  3. **Rule which wave grades `A-rt-ledger`'s bar** (`<!-- r5-ruling rt-ledger-bar=W0b -->` or
     `=W0a`). Unruled, it is graded at W0a and reads FAIL.
  4. A9 (Round-4 bar) has valid quiet grades: 5 of 6 PASS. A21 FAILs on the quiet box on its 20 ms GPU
     bar. Both belong to the W0b tier decision and gates-perf's R26 re-cast.
  5. Rule how `A-reach-all-sites`' "nav build ≤ 150 ms" is graded at the W0 exits. Today's nav is
     220–237 ms at N 333.
  6. Put the binding W1 conditions of the ruled size (`ROUND5-ENGINE.md` §2.6) into the W1 brief,
     `A-world-size` and `A-reach-all-sites`.
- **gates-perf:**
  - record the ledger with one line in `tools/budgets.mjs`: **`export { RT_LEDGER } from
    './r5-probes/rt-ledger.mjs';`** (a leaf module, so no cycle). **Never** re-export it from
    `./gates.r5.engine-gpu.mjs`: that closes a cycle and the runner loads no gate. A-rt-ledger then
    compares the rows with the live ledger;
  - give A9's R26 re-cast the quiet-box witness (`QUIET`, `sampleBox`);
  - keep the runner passing the same gate objects to runner `check({ GATES })`, and keep honouring
    a gate's `params`;
  - `A-vram-ledger` can reuse `engine.renderTargetLedger()`, `VRAM_CENSUS` and the `?rtTally=1` tally.
- **world-sky (W1):** `environment.js:446–449` drops the PMREM target, so its 3.15 MB depth
  renderbuffer (and the 6.29 MB texture) can never be disposed. Either keep the target, register it
  (`engine.registerRenderTarget('env:pmrem', rt)`) and dispose it on rebuild or teardown; or render
  the room into a cube target, run `fromCubemap` (its output has no depth) and dispose the cube target,
  which saves the 3.15 MB for good. Also dispose the `RoomEnvironment` (it has `dispose()`), and
  register `CAL.lightShafts` (`sky:lightShafts`).
- **world-ground (W1):** the per-vertex budget of the chosen size; `getHeight` from the baked grid;
  `{ maxExpansions }` on long paths; drop `uv`; `riverFactor` → 0. The pool build is required only if
  the orchestrator accepts it, with `parallelBuild` / `compareBuilds` as the reference.
- My files do not overlap the other three W0a lanes' files (`engine.js` and `tools/r5-probes/` are
  mine alone), so the four branches merge in any order. The only shared read is `tools/budgets.mjs`,
  read tolerantly, now with no top-level await.

## 8. Process hygiene

- Every Chrome came from `tools/gates.mjs` or `tools/screenshot.mjs` on `--port 5251`, one at a time,
  each after a preflight:
  - ≥ 3 GiB disk free, read by `df -k`, stricter than 3 GB;
  - ≥ 25 % memory free;
  - < 2 headless Chromes machine-wide, the semaphore's limit, kept by hand until gates-perf's lands.

  The quiet runs also required 0 other headless Chromes and load < 3. After 10:28 the disk floor
  held every launch.
- The A9 attribution control swapped `src/core/engine.js` for HEAD's for the two HEAD runs only, from
  a script whose exit trap restored the lane's copy. The SHA-1 was checked after every swap and at
  the end: `57b3ba28…` is the final file.
- Vite on 5251 was started from the tree with `npx vite --port 5251 --strictPort` and killed at the
  end. Every gate run reported "this run leaves 0 of its own" profiles.
- Scratch is `scratchpad/r5/engine-gpu/{run,film,controls,cycle3,node-lab}`. The tree's ignored
  `shots/gates/` holds 508 MB of gate screenshots: 31.6 MB from this lane's runs and ≈ 470 MB from
  another agent's full-suite run in this tree at 07:43. The lane did not delete them. The
  orchestrator may clear them to give the disk back.
- Port 5173 was never touched.
