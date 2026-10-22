# ROUND 5 — lane engine-gpu, W0b report (the GPU tier decision) — fix round 2

Port 5251, worktree `~/.calima-r5/trees/engine-gpu` (the orchestrator moved it there on Oct 22; the
scratchpad path `scratchpad/r5/engine-gpu/tree` is a symlink to it), Oct 22 2026.

Plan sections this report follows: `docs/ROUND5-PLAN.md` §2 (row engine-gpu), §1.2 (the engine.js
grant: post chain / tier table / DPR; render-target measurement hooks), §3.1 (W0b exit: "GPU tier
chosen and render targets measured"), §4.3–§4.4, §8.3 (`rt-ledger-bar=W0b`) and §9 (the engine-gpu block
and the global green list). The measured numbers live in **`docs/ROUND5-ENGINE.md`** (§1 the ledger at
the shipped tier, §3 the tier decision); this file is the lane report. Fix round 1's report is in git at
`59e0b48` (the orchestrator's checkpoint), round 0's at `9921470`, W0a's at `5fd2849`.

## 0. What fix round 2 changed, and why

The machine rebooted between fix round 1 and this session: every scratch file of fix round 1 (reports,
films, the budgets patch, the run scripts, the exploration gates) was gone, and so were the two untracked
read-only symlinks the Pans POC boots from. Fix round 1's numbers stay in git; everything graded below was
re-run on this code, in this tree, on Oct 22.

| finding | what was done | result now |
|---|---|---|
| **Fix round 1's own film failed its own criterion** (`V-gpu-tier-look`: with the anisotropy cap at 2× on every texture, the salt pan's crust became faint horizontal streaks — fix round 1's report said "I would not pass it myself") | Re-filmed per texture ROLE on the gate's crop (`X-role-film`, `X-role2-film`): the crust and the dune ripples are drawn by the DATA textures (the normal + rough/AO packs). **The cap is now split by role** (engine grant, tier table): `maxAnisotropy` caps colour (sRGB) textures, new `maxAnisotropyData` caps data textures. Shipped `high`: **colour 2×, data 4×**. Mechanism verified on the GL side (`X-role2-check`) | `V-gpu-tier-look` crop 4 (shipped) shows the crust and the ripples as a softer crop 2 (8×); crop 3 (fix round 1's 2× / 2×) shows the streaks (§5.3). A-gpu-tier on the new row: §5.1 |
| `V-gpu-tier-look` was three columns of squashed tiles | Four configurations (Round-4 `high` / shipped levers at 8× / the alternative NOT shipped / SHIPPED), full frames at 16:9, crops at their native aspect ×1.07–1.28 nearest | filmed in `F4` |
| The POC did not boot in the re-created tree (`A22`, `A108`, `A109` failed "did not boot within 90 s" in `F3`) | Re-created the two gitignored, untracked, read-only symlinks to main's files (`public/models/r5-poc/sounding-ring.glb`, `models-staging/quaternius-animatedmech/Mike.gltf`), as in round 0 | `P1`, `F4`: PASS |
| `docs/ROUND5-ENGINE.md` §1.1 said "provisioned, never allocated: 0" | The ledger has always listed `post:pingB` (`postTarget`, 18 MB RGBA16F) as provisioned-not-allocated in the direct topology. Corrected: allocated only while a pass after the grade (the studio pass) needs it, then 145.27 MB, still ≤ 170 | doc fixed |
| `A-rt-ledger`'s `tools/budgets.mjs` clause (gates-perf's file) | Unchanged situation; the patch and the proof were re-made | PENDING on that clause in this tree; **PASS on every clause with the line** (`L12`) |

## 1. Deliverables

| item | file | status |
|---|---|---|
| the GPU tier decision: shipped `high` = DPR cap 1.25 + GTAO ¼ + SMAA-only + SMAA RGBA8 + far cascades 1024 (round 0) + direct post topology + post fold + far-cascade cadence 2 (fix round 1) + **anisotropy colour 2× / data 4×** (fix round 2) | `src/core/engine.js` (tier table, `applyTier`, `_applyAnisotropyCap`, `_anisoRoles`, `_anisoMat`, `_anisoTex`, `_anisoSet`; fix round 1's `_applyPostTopology`, `_postFold`, `_bloomFold`, `_gtaoInPlace`, `_csmUpdate`, `ScenePass`, `OutputGradeShader`) | done |
| `A-gpu-tier` as a measured exit gate, before/after per lever | `tools/gates.r5.engine-gpu.mjs` (`A-gpu-tier-box` + `A-gpu-tier`); the lever record now ends with the shipped split and two NOT-shipped rows (2× / 2×, 4× / 4×) | §5.1 |
| what the tier costs the picture, filmed | `V-gpu-tier-look` (re-laid out, four configurations) | filmed (`F4`), NEEDS-JUDGE; lane reading PASS (§5.3) |
| `A-rt-ledger` graded (ruling `rt-ledger-bar=W0b`) | same file; `tools/r5-probes/rt-ledger.mjs` (unchanged: re-verified to the byte) | 127.27 MB ≤ 170, 342.45 MB ≤ 450; PENDING only on gates-perf's `budgets.mjs` line; PASS with it (`L12`) |
| GTAO lattice fix intact (A108 / A109 / V33b) on the folded chain | `engine.js`; gates unchanged | A108 PASS, A109 PASS, V33b filmed |
| AA under R25 (A22, V20) | gates unchanged | A22 PASS (0.318 vs 0.197), V20 filmed |
| W0a judge's minor: sweep dead WeakRefs in `registerRenderTarget` | `engine.js` (round 0, unchanged) | done (census registration contract PASS) |
| `docs/ROUND5-ENGINE.md` W0b section | §1 (ledger), §3 (decision, before/after, the timer calibration, the role split, equivalence, gate table) | done |
| lane report | this file | done |

No asset was created (no provenance or `LICENSES.json` row needed). Files edited this round: only this lane's
§2 row (`src/core/engine.js` under its grant, `tools/gates.r5.engine-gpu.mjs`, `docs/ROUND5-ENGINE.md`, this
file). Two untracked, gitignored, read-only symlinks to main's files keep the POC booting (see §0).

## 2. The decision in one table (details: `docs/ROUND5-ENGINE.md` §3.1)

| | Round-4 `high` | shipped `high` (W0b fix round 2) |
|---|---|---|
| DPR cap | 1.5 | **1.25** |
| AA | MSAA ×4 + SMAA (HalfFloat targets) | **SMAA only, RGBA8 targets** (R25) |
| GTAO | ½ res, in-place blend | **¼ res, multiplied in the grade pass** |
| bloom composite | full-res additive blend | **added in the grade pass** |
| post topology | resolve copy, HalfFloat ping-pong | **direct; `renderTarget2` RGBA8; `postTarget` released** |
| CSM | 3 × 2048, every frame | **2048 + 2 × 1024; cascades 1/2 alternate frames** |
| anisotropic filtering | as authored (POC ground 8×) | **colour (sRGB) textures 2×, data textures (normal, rough/AO) 4×** |
| render targets, DPR 1.25 | 340.74 MB (437.75 at its 1.5 cap) | **127.27 MB** |
| staged fight, textures + geometry + RTs | 891.87 MB (W0a content) | **342.45 MB** |
| Pans vista / empty-frame GPU (gate reading) | 21.6 / 12.8 ms | §5.1 |

## 3. Contracts published (exact signatures)

### 3.1 `src/core/engine.js`

```js
export const QUALITY_TIERS            // rows carry, besides Round 4's fields:
  // smaaHalfFloat: boolean           false → SMAA edge + weight targets RGBA8 (UnsignedByteType)
  // csmMapCaps: number[] | null      cascade i map = min(requested, caps[min(i, caps.length - 1)]); null = uncapped
  // postFold: boolean                GTAO multiply + bloom composite inside the grade pass (false = Round 4's in-place blends)
  // csmFarCadence: number            cascade i >= 1 renders when (frame + i) % n === 0; 1 = every frame
  // maxAnisotropy: number | null     cap on COLOUR textures' anisotropic filtering (colorSpace === SRGBColorSpace); null = GPU max
  // maxAnisotropyData: number | null | undefined   cap on DATA textures (every other colorSpace: normal, rough/AO, masks);
  //                                  undefined = the colour cap; null = GPU max          (fix round 2)
export const DEFAULT_TIER = 'high'
export const ROUND4_HIGH              // frozen Round-4 `high` row (postFold false, cadence 1, anisotropy uncapped)
engine.applyTier(row: object, name = 'custom') → string   // every lever, incl. topology and anisotropy re-apply
engine.setQuality(name) → string      // unchanged signature
engine.tier                           // per-engine COPY of the row
engine.csmMapSizes: number[] | null
engine.postDirect: boolean            // direct topology in force (scene target has no MSAA samples)
engine.anisotropyCap: number          // the colour-texture cap in force
engine.anisotropyCapData: number      // the data-texture cap in force (fix round 2)
engine.grade.uniforms.tAO / uAOMix / tBloom / uBloomOn   // folded inputs; zeroed each frame, re-armed by GTAO / bloom
engine.enableCSM(opts)                // unchanged; tier caps applied after the cascades are built
engine._csmUpdate()                   // per frame, no allocation: texel snapping per cascade + the far-cascade cadence
engine.registerRenderTarget(owner, rt) → rt   // unchanged; sweeps dead WeakRefs before adding
```

Behaviour other lanes rely on: `composer.renderTarget1 === engine.sceneTarget`; `engine.depthTexture` is
never bound as a write target; the studio pass appended after SMAA still gets a write target (`postTarget`,
allocated on demand); `setGrade(false)` keeps the tonemap and the folded AO/bloom; disabling the grade pass
brings back Round 4's in-place blends. **New in fix round 2:** `renderer.capabilities.getMaxAnisotropy()`
answers the HIGHER of the two role caps (4 at `high`); a lane that sets `texture.anisotropy` from it gets 4,
and the engine lowers that texture to its role's cap after three uploads it (colour textures: 2). A lane that
swaps a material's texture to one already uploaded elsewhere is swept on the next texture-count change.

### 3.2 `tools/r5-probes/rt-ledger.mjs`

`export const RT_LEDGER` — frozen `{ measured, unit: 'bytes (1 MB = 1e6)', rows: { [owner]: bytes } }`,
12 rows (`post:pingB` = 0: released), 127,271,712 B, equal to the GL recount (`A-rt-ledger-census`, `F3`,
`F4`). Unchanged this round. gates-perf records it with
`export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` in `tools/budgets.mjs`.

### 3.3 `tools/gates.r5.engine-gpu.mjs`

Exports `GATES` (12 rows, each with `lane: 'engine-gpu'` and a `wave`), `RT_LEDGER`, `RULINGS`, `QUIET`,
`sampleBox()`, `VRAM_CENSUS`, `POC_KIT` (its sheet helper gained `putRect` and `box`), `GPU_TIER_BAR`,
`AA_BAR`, `LOOK_CROP`, `SHADOWED_IDS`, `SHADOW_ID_SUFFIX`.

| id (pre-merge id) | wave | kind |
|---|---|---|
| `A-terrain-1024-probe-box`, `A-terrain-1024-probe` | W0a | runner, action (unchanged, not re-run) |
| `A-rt-ledger-census` | W0a | action (`?rtTally=1`) |
| `A-rt-ledger` | **W0b** (ruling) | action |
| `A-gpu-tier-box`, `A-gpu-tier` | W0b | runner, action (`levers()` now records `maxAnisotropyData`) |
| `A22-msaa` (`A22-msaa@r5`) | W0b | action |
| `V20-aa-crop` (`V20-aa-crop@r5`) | W0b | visual |
| `A108-ao-periodicity` (`…@r5`) | W0b | action |
| `A109-ao-distance-fade` (`…@r5`) | W0b | action |
| `V33b-no-ao-lattice` (`…@r5`) | W0b | visual |
| `V-gpu-tier-look` | W0b | visual (re-laid out) |

## 4. How the gates run

Until gates-perf's registry is merged, `tools/gates.mjs` merges only `gates.round4.*.mjs`, so the file goes
in through `--extra` (one file per run — the runner pushes it onto the same list it imports and merges the
`gates.round4.*` files from, so the rows get the same `GATES` merge, `--lane` and `--only` handling):

```
node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --lane engine-gpu
node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --only A-gpu-tier-box,A-gpu-tier
```

For a run that also needs another lane's rows, one combiner module re-exports both `GATES` arrays
(`scratchpad/r5/engine-gpu/combo.gates.mjs`: this file + `gates.r5.pipeline.mjs`). The five re-staged rows
run as `<id>@r5` until `tools/gates.r5.carried.mjs` is in the tree; after the merge they take their real ids
with no edit. On a tree without the registry the Round-4 `A22-msaa` (samples ≥ 4) FAILS by design under
SMAA-only (R25's row is `A22-msaa@r5`). The box witness must run in the same invocation, before its target.
The POC needs the two read-only symlinks of §0 in a fresh tree.

## 5. Gate results (port 5251, this tree, Oct 22)

Reports in `scratchpad/r5/engine-gpu/run/`: `report.F3.json` (lane block + global items, on fix round 1's
engine; the POC rows failed to boot, see §0), `report.P1.json` (the POC rows re-run, fix round 1's engine),
`report.F4.json` (**the round's run on the final engine**: lane block without the timed pair + every
global item present + must-stay-green, 22 gates), `report.L12.json` (A-rt-ledger with the `budgets.mjs`
line), `report.G*.json` (A-gpu-tier, quiet box), exploration `report.X1.json` / `report.X2.json`
(`explore/role.gates.mjs`, `explore/role2.gates.mjs`). Every run went through `run.sh` (the machine-wide
Chrome slot of PLAN §0 rule 8, disk ≥ 3 GB and memory ≥ 25 % checked after taking it); timed runs through
`qrun.sh` (waits for load < 3 and 0 headless Chromes, then samples load and headless Chromes every 2 s into
`run/<tag>.box`).

### 5.1 The engine-gpu W0b block

<!-- G-RUNS -->

| gate | verdict | numbers |
|---|---|---|
| `A-rt-ledger` | **PENDING** (one clause, gates-perf's file) | 127.27 MB ≤ 170 ✓, 342.45 MB ≤ 450 ✓ (textures 100.28, geometry 114.90), docs ✓, levers restored ✓, shipped tier @ 1.25 ✓, `tools/budgets.mjs` record ✗ outstanding (`F4`); with the line (`L12`, proof root `scratchpad/r5/engine-gpu/budgets-proof/`): **PASS on every clause** |
| `A-rt-ledger-census` (W0a row) | **PASS** (`F3`, `F4`) | GL 127,271,712 B = ledger, 0 unattributed, 0 mismatches, docs and `RT_LEDGER` match |
| `A22-msaa` (`@r5`) | **PASS** (`P1`, `F4`) | R25 path; AA fraction 0.318 (SMAA) / 0.197 (none) / 0.375 (Round-4 MSAA ×4 + SMAA), gain 1.617 ≥ 1.5 |
| `V20-aa-crop` (`@r5`) | NEEDS-JUDGE | §5.3 |
| `A108-ao-periodicity` (`@r5`) | **PASS** (`P1`, `F4`) | worst 0.135 (ultra @ 1, far 128 m, control 0.137); 0 fails; witness crop 1: stock 0.238 ≥ 0.15, shipped 0.099 (crop 2 does not separate: stock 0.127, shipped 0.124; the gate needs one seeing crop) |
| `A109-ao-distance-fade` (`@r5`) | **PASS** (`P1`, `F4`) | high: 4–6 m 0.0682 (n 3,037), past 150 m 0 (n 2,421), far band ratio 1.000; ultra: 0.0718, 0, 1.000 |
| `V33b-no-ao-lattice` (`@r5`) | NEEDS-JUDGE | §5.3 |
| `V-gpu-tier-look` | NEEDS-JUDGE | §5.3 |

### 5.2 Global green list (the items that exist in this tree) and must-stay-green — `F4`, final engine

| gate | verdict | numbers |
|---|---|---|
| `A1-boot-clean` | PASS | `state=playing` |
| `A9-perf-budget` | PASS (Round-4 bar ≥ 45 fps) | 262 draws, 50.9 fps, scene GPU 18.35 ms — loud box (another lane's Chrome alive), so R26's 58-fps quiet-box bar is not attributable here (`F3`: 54.3 fps) |
| `A20b-no-system-errors` | PASS | 0 / 0, 353 frames |
| `A21-real-draw-calls` | PENDING (its baseline verdict is FAIL, R33: listed, not graded) | draws 266 / 171 / 279 ≤ 350 PASS; triangles 3.70 / 3.34 / 3.82 M PASS; GPU 96.6 / 129.7 / 83.4 ms at raw DPR 2, p95, JS: unattributable on this box (`F3`: GPU term FAIL at 102 / 134 / 106 ms) |
| `A90-memory-stability` | PASS | heap −6.5 %, geometries +9, textures −28, objects −1,096 |
| `A90-memory-stability-expansion` | PASS | objects −1,059, non-machine growth 0 |
| `A90b-memory-attribution` | PASS | 0 offenders, 0 orphaned textures (this tree's Round-4 workload; R34's Tiller workload is instruments-core's) |
| `A90-rig-reclaim` | PASS | 30 cycles: geometries +5, textures 0; per live machine 0.13 / 0.38 |
| `A-ID-ip-assets-gone` | PASS | 19 GLBs, 0 IP hits (`aloy.glb` scheduled for hero-body's exit) |
| `A-assets-tracked` | PASS | 221 referenced, 0 ignored |
| `A-licence-manifest` | PENDING (pipeline's clauses: third-party SHA-256s, legacy sources, credits) | files-matched PASS |
| `A20-frame-loop-survives` | PASS | 44 frames after 3 throws |
| `A22b-fov-recompile` | PASS | 3 FOVs composited |
| `A56-cascades` (carried, CSM check) | PASS | near texel 1.38 cm ≤ 2, `shadowMapSize` 2048, 3 cascades |

Not in this tree (other lanes' files): `A90-abs`, `A-alloc-rate`, `A-vram-ledger`, `A-no-horizon-terms-*`,
`A-reach-all-sites`, `A-port-guard`, `A-carried-suite`. The W0a probe pair was not re-run (W0a gate, judged
and ruled at W0a; nothing here touches the terrain build or nav).

### 5.3 Film, read by the lane against the criteria (advisory; R29 judges grade)

Sheets in `scratchpad/r5/engine-gpu/run/F4/` (`V20-aa-crop@r5.png`, `V33b-no-ao-lattice@r5.png`,
`V-gpu-tier-look.png`), filmed on the final `engine.js`; the exploration crops in `run/X1/`, `run/X2/`.

- **V-gpu-tier-look** (`F4`): top band, frames 1, 2 and 4 are the same scene — same light, the ring's ellipse
  shadow on the pan, grade, bloom on the sky; 2 and 4 are a little softer than 1 (DPR 1.25 against 1.5).
  Crops, magnified: crop 1 (Round 4) shows the salt pan's light polygonal crust crisply and the dune ripples
  in front; crop 2 (shipped levers, 8×) the same, softer; **crop 4 (SHIPPED, colour 2× / data 4×) still shows
  the polygonal crust across the pan and the ripples on the dune — a softer crop 2, no streaks**; crop 3 (NOT
  shipped: fix round 1's 2× / 2×) shows what fix round 1 shipped: the crust gone into faint horizontal
  streaks, the ripples nearly gone. My reading: PASS (fix round 1's shipped row would have failed it).
- **V20** (`F4`, `P1`): top-left (shipped, SMAA-only at 1.25, 4× nearest): the column tops and sides carry 1–2 px
  ramps between rock and sky; top-right (no AA): hard two-colour stair-steps on the same edges, clearest on the
  tall column's left side; bottom-left (Round-4 MSAA ×4 + SMAA at 1.5): the softest, and the shipped tile keeps
  two or three visible steps on that near-vertical edge where Round 4 has none. My reading: PASS.
- **V33b** (`F4`, `P1`): rows 1–2 (high at quarter-res, ultra) at four bearings: no bars, bands, checker or
  dither; row 3 (1:1 shelf wall across the pan): on and OFF indistinguishable at both tiers; row 4: the ×8
  darkening maps show soft darkening along the boulder's contact with the sand and at the grass bases (high
  broader and grainier, ultra sharper), white open ground, no blocks, no outline against the sky. My reading:
  PASS.

## 6. Honest gaps

1. **The split is tuned on the POC.** The crust lives in the POC ground's normal maps; the real Pans at W1
   (world-ground, plan §4.3: ≤ 3 layers, triplanar on slopes only) are about half the POC's fetches, and
   `A-gpu-tier` re-runs there (plan §6). The lever record carries the 4× / 4× row each time so `high` can go
   back to 4× on everything when it fits.
2. **The GPU timer reads a clock state, not a cost** (`docs/ROUND5-ENGINE.md` §3.4, calibration). One
   configuration reads several ms apart between 2 s bursts; another process on the GPU raises the clock and
   LOWERS the reading. Nothing in the gate was changed for this; a capacity instrument would be a ruling.
3. **`A-rt-ledger`'s `budgets.mjs` clause stays PENDING in this tree** (gates-perf's file); proved passing
   with the one line (`L12`).
4. **A21's GPU term** fails at baseline (R33: listed, not graded); this tree reads it unattributable on a loud
   box (`F4`) or FAIL (`F3`, 83–134 ms at raw DPR 2); draws and triangles PASS.
5. **Box quietness.** Six lanes and their judges share one GPU; other lanes' gate Chromes start between the
   slot holders. The gate's own witness samples the box only at its start; `run/<tag>.box` says what my
   monitor saw during each timed run.
6. **The role rule is the colour space.** A colour texture authored in a linear colour space (a float/HDR
   albedo) is treated as data (gets the 4× cap). None exists today. A texture swapped onto a material without
   any texture being uploaded or disposed that frame is lowered at the next texture-count change.
7. **The POC is not shipped content** and the re-staged gates need `?poc=biome`, `window.__R5BIOME__` and the two
   symlinks of §0 until `A-gpu-tier` re-stages on the W1 Pans (round 0 gap, unchanged).

## 7. For other lanes and the orchestrator

- **Orchestrator:** (a) fix round 1 left you a trade (2× and a soft salt pan, or 4× and a red vista); fix
  round 2 replaces it with the role split — read §5.1 and `V-gpu-tier-look` crops 3 vs 4; (b) apply or route
  gates-perf's one line (`scratchpad/r5/engine-gpu/budgets-rt-ledger.patch`); (c) when grading A-gpu-tier,
  read `docs/ROUND5-ENGINE.md` §3.4: run it ≥ 3 times on a box with no other gate Chrome alive for the whole
  run; (d) a fresh tree needs the two POC symlinks of §0 (gitignored, untracked) or the POC rows fail to boot.
- **gates-perf:** add `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` to `tools/budgets.mjs` (leaf
  module, no cycle); `A-vram-ledger` can reuse `VRAM_CENSUS`.
- **world-ground (W1):** the ground shader is the vista's cost; keep relief in the normal maps (data textures
  get 4× at `high`) and expect albedo at 2×. §4.3's limits are what let `high` return to 4× everywhere.
- **world-sky (W1):** cascades ≥ 1 render on alternate frames at `high` (`csmFarCadence`); ask `enableCSM`
  for what you want, `engine.csmMapSizes` says what you got. A camera cut shows one frame of the previous
  far-cascade map.
- **shell-ui (W2):** tier names unchanged; `high` is the default.
- **any lane appending a post pass:** append after SMAA as the studio pass does; the scene target is never a
  write target and `postTarget` (18 MB) is allocated when a pass needs it.

## 8. Process hygiene

<!-- HYGIENE -->
