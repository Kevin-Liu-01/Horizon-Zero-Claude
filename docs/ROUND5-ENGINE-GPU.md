# ROUND 5 — lane engine-gpu, W0b report (the GPU tier decision) — fix round 4

Port 5251, worktree `~/.calima-r5/trees/engine-gpu` (the orchestrator moved it there on Oct 22; the
scratchpad path `scratchpad/r5/engine-gpu/tree` is a symlink to it), Oct 22 2026.

Plan sections this report follows: `docs/ROUND5-PLAN.md` §2 (row engine-gpu), §1.2 (the engine.js
grant: post chain / tier table / DPR; render-target measurement hooks), §3.1 (W0b exit: "GPU tier
chosen and render targets measured"), §4.3–§4.4, §8.3 (`rt-ledger-bar=W0b`) and §9 (the engine-gpu block
and the global green list). The measured numbers live in **`docs/ROUND5-ENGINE.md`** (§1 the ledger at
the shipped tier, §3 the tier decision); this file is the lane report. Fix round 2's report is in git at
`6e75e7c`, fix round 1's at `59e0b48` (the orchestrator's checkpoints), round 0's at `9921470`, W0a's at
`5fd2849`.

## 0. Fix round 4: A108's random witness, and A-gpu-tier's quiet-box timing

Port 5251, this tree, Oct 22–23 (local evening of Oct 22; run stamps are UTC Oct 23). The two judge
findings, what was done and what came of it:

| finding | what was done | result |
|---|---|---|
| **A108 failed 2 of 4 runs on unchanged code** (major). The witness clause failed: the stock sample on witness crop 1 read 0.103, the shipped shader's value, instead of 0.24. three r169's `GTAOPass` builds its denoise noise with `new SimplexNoise()` on `Math.random` | **The engine seeds that texture** (engine grant, post chain). Right after `new GTAOPass(...)`, `engine.setGtaoNoiseSeed(GTAO_NOISE_SEED)` disposes three's texture and installs `makeGtaoDenoiseNoise(0xCA11A)`. That is three's generator with a mulberry32 RNG: the same bytes as `generateNoise` when it gets the same RNG (node check, 4 seeds, 0 differing bytes), and the same size, format, wrap and filter. It is assigned to both `gtao.pdNoiseTexture` and `pdMaterial.uniforms.tNoise`. **A108 gained a determinism clause:** the installed texture must carry the shipped seed, must be the one the denoise samples, and must hash equal to a fresh build. No bar moved, no crop or witness was changed, and witness crop 2 (which never separates) was not dropped | **A108 PASS 5 of 5 runs, each a fresh Chrome and a fresh page load** (`W1`–`W5`), plus the suite run `T2` and the final-files check `F1` (7 of 7). Every run's detail is **byte-identical**: worst graded 0.135, witness crop 1 stock **0.239@5,-29** / shipped 0.102 / off 0.114, noise hash `a698df06` (`docs/ROUND5-ENGINE.md` §3.6) |
| (cause, shown) | Surveys `S1` (`explore/seeds.gates.mjs`) and `W1` (`explore/why.gates.mjs`, run with A108 in one invocation) | The witness verdict follows the texture's content. Of three's own `Math.random` textures, the witness saw 23 of 30 (the judge's probe: 5 of 8). Of seeded textures it saw 35 of 40, including 0xCA11A, which was set before any measurement. 9 captured textures re-installed from their bytes repeated their verdict exactly. The graded crops do not depend on the noise: across 16 seeds each configuration's worst peak moved by ≤ 0.001. No other candidate of 64 crops separates by a usable margin (one dune crop clears the bar by 0.000–0.004), so none was added (`docs/ROUND5-ENGINE.md` §3.6) |
| **A-gpu-tier PENDING: the judge never got a quiet box** (blocker; now ruled by **R45**: graded at the orchestrator's quiet global run, provided the lane's code is unchanged since its builder's timed runs) | This round changed `engine.js` (the noise texture), so the R45 proviso needed new timed runs on this code. `chain-q.sh` → `qrun.sh` → `run.sh` with `QUIET=1`: the slot is taken only at an instant with load < 3 and 0 headless Chromes. The first attempt waits up to 60 min and then runs anyway (loud, unjudged, for the numbers); later attempts run only if quiet (`QSTRICT`) | **PENDING-quiet-box under R45.** `Q1` took the slot at a quiet instant (02:06:55Z: load 2.13, 0 headless Chromes). Another lane's judge then launched a Chrome before the gate's own witness sample (1 other Chrome), and the vista instability was 1.51 > 1.4, so `Q1` is unjudged. Its readings on this code are all under their bars: vista bursts 10.52 / 12.33 / 15.89 / 13.30 → **12.82 ms** ≤ 13; empty **4.80** ≤ 7; **60.24 fps**; p95 **18.7 ms**; null frame 0.18 / 0.17 ms; RT 127.27 MB. The shipped row of its lever record reads 12.55 / 4.81. `Q2` (40 min, 1,167 samples, 9 quiet) and `Q3` (45 min, 1,313 samples, 0 quiet) never got a quiet instant with a free slot, so neither ran. **The change costs nothing measurable** (`N1`, `X-noise-ab`: interleaved on one page, 6 rounds × 2 s, loud box). Vista GPU median: 22.15 ms with the shipped seeded texture, 22.39 with three's `Math.random` texture, 22.49 with another seed; the three arms move together burst by burst. The orchestrator's three quiet runs (R45) are the grade |

What the noise change costs: nothing measurable by construction. The texture is the same 64 × 64 RGBA8
`DataTexture` (16 KB, not a render target, so the ledger is unchanged: `A-rt-ledger-census` `T2` 127,271,712 B
= ledger). It is sampled the same way, once per AO texel, and only its texel values differ. The constructor
builds it once; nothing runs per frame. three's original is disposed before its first upload, and the new
one is disposed by `GTAOPass.dispose()` like the stock one.

Re-filmed on this engine (`T2`): `V20-aa-crop`, `V33b-no-ao-lattice`, `V-gpu-tier-look`. My reading is in
§5.3: all three PASS, as before.

## 0.1 Fix round 3: the `A-rt-ledger` blocker, run on the merged gate side

**The finding.** `A-rt-ledger` was PENDING at the W0b exit: every lane clause passed, but
`recordedInBudgets` read `null` because `tools/budgets.mjs` (gates-perf's file, plan §2) had no
`RT_LEDGER`. The judge offered two fixes: merge gates-perf's `budgets.mjs` and re-run
`--only A-rt-ledger-census,A-rt-ledger` on the merged tree, or an R38-style ruling.

**What this lane can and cannot do.** Both fixes belong to the orchestrator. `tools/budgets.mjs` is
gates-perf's file, no §1.2 grant lets engine-gpu touch it (rule 1), and lanes run no git merge (rule 7).
Editing that file in this tree, even for one run, would be the cross-lane edit rule 1 forbids. The gate is
not loosened either. In this tree the clause still reads `null` (PENDING) until the line is really there
(run `T1` below).

**What was done.** The orchestrator would grade on the merged tree, so I rebuilt that tree's gate side and ran the
lane on it, on port 5251, against this tree's Vite:

1. **The line exists and is committed.** `r5/w0a-gates-perf` at `a2fba7c`, `tools/budgets.mjs:141`:
   `export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';` (with R34's self-contained `STAGE_PRELUDE`).
2. **The merge is clean for this lane.** Since the merge base `a953355`, the two branches share one changed file,
   `docs/ROUND5-PLAN.md`, which is the orchestrator's own and synced from main on both. This lane changed
   `src/core/engine.js`, `tools/gates.r5.engine-gpu.mjs`, `tools/r5-probes/rt-ledger.mjs` and the two docs.
   gates-perf changed nothing under `src/`.
3. **The merged gate side, built read-only.** `scratchpad/r5/engine-gpu/merged/` = `git archive
   r5/w0a-gates-perf` (a read of the branch; no ref, index or worktree touched) plus this lane's five files
   and main's `docs/ROUND5-PLAN.md` copied over. `node_modules` is a symlink to main's, as in the tree. It has
   no `.git`, so only this lane's rows and `A-vram-ledger` were run there; pipeline's git-reading rows were
   not. The page under test is this tree's, served by
   `npx vite --port 5251 --strictPort` from the tree. gates-perf changes nothing the game page loads
   (it deletes labs, spike pages, `public/anims-*` and HZD reference stills), so the page is the merged page.
4. **Registration is proven on the real registry.** With no `--extra`, gates-perf's `gates.config.mjs`
   discovers `tools/gates.r5.engine-gpu.mjs` by pattern (lane files: brand, engine-gpu, gates-perf,
   instruments-core, pipeline). `--lane engine-gpu` yields this lane's 12 rows. The five re-staged rows take their real
   ids (`A22-msaa`, `V20-aa-crop`, `A108-ao-periodicity`, `A109-ao-distance-fade`, `V33b-no-ao-lattice`) and
   shadow the carried rows.
5. **The runs, merged gate side** (`run-merged.sh`/`qrun-merged.sh`, the same slot and preflight discipline
   as `run.sh`):
   - **`M1`**: `node tools/gates.mjs --port 5251 --lane engine-gpu --only A-rt-ledger-census,A-rt-ledger`.
     **Both PASS.** `A-rt-ledger` passes all six clauses: `atShippedTier`, `rtTotal` (127.27 MB ≤ 170),
     `sumAtStagedFight` (342.46 MB ≤ 450), `recordedInDocs`, **`recordedInBudgets: true`** and `leversRestored`.
     The staged fight is gates-perf's R34 role-staged `staged-fight`: 8 × `tiller` (herd), with the seven R28/R30
     fallbacks named; textures 100.29 MB (92), geometry 114.90 MB, RTs 127.27 MB. The census recounts
     127,271,712 B from the GL calls, equal to the ledger to the byte.
   - **`M2`**: the rest of the non-timed block plus gates-perf's own `A-vram-ledger` as an independent
     cross-check. All PASS or filmed (§5.1). **`A-vram-ledger` PASS:** its own GL census counts render targets
     at **127,271,712 B (127.27 MB, 39 GL objects), the same byte count as this lane's ledger**, under the
     ≤ 170 cap. Textures 105.46 MB, geometry 79.52 MB, total 312.25 MB ≤ 450.
   - **`M3`, `M5`**: the timed pair `A-gpu-tier-box` + `A-gpu-tier`, set to start only at a quiet instant
     (load < 3, 0 headless Chromes). **Neither started.** In 52 + 40 min of 2-s samples (`run/M3-wait.box`,
     `run/M5-wait.box`), another lane's gate Chrome was alive at every sample. gates-perf ran its carried suite
     twice and hero-body and brand ran their gates. I stopped both rather than time the GPU on a loud box
     (fix round 2's `G6` shows what that does). `A-gpu-tier` stands on fix round 2's three judged runs, on the same
     engine and gate code (§5.1).
   - **`M4`**: `V-gpu-tier-look` alone, re-filmed on the merged gate side (no timing term).

**What the orchestrator does to close it.** Either merge `r5/w0a-gates-perf` (with or before this lane)
and run `node tools/gates.mjs --port 5270 --lane engine-gpu --only A-rt-ledger-census,A-rt-ledger` on main,
which reproduces `M1`, or rule that `recordedInBudgets` is a cross-lane PENDING graded at gates-perf's
exit. There is no third route inside this lane's files that does not loosen the gate.

### 0.2 What fix round 2 changed, and why

The machine rebooted between fix round 1 and this session: every scratch file of fix round 1 (reports,
films, the budgets patch, the run scripts, the exploration gates) was gone, and so were the two untracked
read-only symlinks the Pans POC boots from. Fix round 1's numbers stay in git; everything graded below was
re-run on this code, in this tree, on Oct 22.

| finding | what was done | result now |
|---|---|---|
| **Fix round 1's own film failed its own criterion** (`V-gpu-tier-look`: with the anisotropy cap at 2× on every texture, the salt pan's crust became faint horizontal streaks — fix round 1's report said "I would not pass it myself") | Re-filmed per texture ROLE on the gate's crop (`X-role-film`, `X-role2-film`): the crust and the dune ripples are drawn by the DATA textures (the normal + rough/AO packs). **The cap is now split by role** (engine grant, tier table): `maxAnisotropy` caps colour (sRGB) textures, new `maxAnisotropyData` caps data textures. Shipped `high` (and `medium`): **colour 1×, data 4×** — 2× / 4× keeps the crust as well but straddles a GPU clock step (interleaved `X-role2-sim`: 2× / 4× 12.05 ms with a 19.18 burst, 1× / 4× 9.91, 2× / 2× 10.11, 4× / 4× 17.57; `docs/ROUND5-ENGINE.md` §3.4). Mechanism verified on the GL side (`X-role2-check`) | `V-gpu-tier-look` crop 4 (shipped) shows the crust and the ripples as a softer crop 2 (8×); crop 3 (fix round 1's 2× / 2×) shows the streaks (§5.3). A-gpu-tier on the new row: §5.1 |
| `V-gpu-tier-look` was three columns of squashed tiles | Four configurations (Round-4 `high` / shipped levers at 8× / the alternative NOT shipped / SHIPPED), full frames at 16:9, crops at their native aspect ×1.07–1.28 nearest | filmed on the final row in `G2` |
| The POC did not boot in the re-created tree (`A22`, `A108`, `A109` failed "did not boot within 90 s" in `F3`) | Re-created the two gitignored, untracked, read-only symlinks to main's files (`public/models/r5-poc/sounding-ring.glb`, `models-staging/quaternius-animatedmech/Mike.gltf`), as in round 0 | `P1`, `F4`, `P2`: PASS |
| `docs/ROUND5-ENGINE.md` §1.1 said "provisioned, never allocated: 0" | The ledger has always listed `post:pingB` (`postTarget`, 18 MB RGBA16F) as provisioned-not-allocated in the direct topology. Corrected: allocated only while a pass after the grade (the studio pass) needs it, then 145.27 MB, still ≤ 170 | doc fixed |
| `A-rt-ledger`'s `tools/budgets.mjs` clause (gates-perf's file) | Unchanged situation; the patch and the proof were re-made | PENDING on that clause in this tree; **PASS on every clause with the line** (`L12`) |

## 1. Deliverables

| item | file | status |
|---|---|---|
| the GPU tier decision: shipped `high` = DPR cap 1.25 + GTAO ¼ + SMAA-only + SMAA RGBA8 + far cascades 1024 (round 0) + direct post topology + post fold + far-cascade cadence 2 (fix round 1) + **anisotropy colour 1× / data 4×** (fix round 2) | `src/core/engine.js` (tier table, `applyTier`, `_applyAnisotropyCap`, `_anisoRoles`, `_anisoMat`, `_anisoTex`, `_anisoSet`; fix round 1's `_applyPostTopology`, `_postFold`, `_bloomFold`, `_gtaoInPlace`, `_csmUpdate`, `ScenePass`, `OutputGradeShader`) | done |
| `A-gpu-tier` as a measured exit gate, before/after per lever | `tools/gates.r5.engine-gpu.mjs` (`A-gpu-tier-box` + `A-gpu-tier`); the lever record now ends with the shipped split and three NOT-shipped rows (2× / 2×, 2× / 4×, 4× / 4×) | **PASS, 3 judged runs** on fix round 2's engine (`G3`, `G4`, `G7`: vista 11.78 / 12.34 / 12.35 ms). On this round's engine: **PENDING-quiet-box (R45)**. `Q1` read every clock under its bar (vista 12.82 ms) but was unjudged, and no quiet instant came in 85 more minutes — §0, §5.1 |
| what the tier costs the picture, filmed | `V-gpu-tier-look` (re-laid out, four configurations) | re-filmed on this engine (`T2`), NEEDS-JUDGE; lane reading PASS (§5.3) |
| `A-rt-ledger` graded (ruling `rt-ledger-bar=W0b`) | same file; `tools/r5-probes/rt-ledger.mjs` (unchanged: re-verified to the byte) | 127.27 MB ≤ 170, 342.45 MB ≤ 450. In this tree it is PENDING only on gates-perf's `budgets.mjs` line, which **R44** rules cross-lane (`T2`, `T1`). **On the merged gate side, with gates-perf's committed line, it passes every clause** (`M1`: 342.46 MB at R34's role-staged fight). The orchestrator re-runs it on main after both merges (R44, §0.1) |
| GTAO lattice fix intact (A108 / A109 / V33b) on the folded chain; **A108 reproducible (fix round 4): GTAO's denoise noise seeded** | `engine.js` (`GTAO_NOISE_SEED`, `makeGtaoDenoiseNoise`, `setGtaoNoiseSeed`); A108 gained the determinism clause | **A108 PASS 5 of 5 fresh boots** (`W1`–`W5`, + `T2`), byte-identical detail; A109 PASS (`T2`); V33b re-filmed (`T2`) |
| AA under R25 (A22, V20) | gates unchanged | A22 PASS (`T2`: 0.310 vs 0.189 off, 1.639 ×), V20 re-filmed (`T2`) |
| W0a judge's minor: sweep dead WeakRefs in `registerRenderTarget` | `engine.js` (round 0, unchanged) | done (census registration contract PASS) |
| `docs/ROUND5-ENGINE.md` W0b section | §1 (ledger), §3 (decision, before/after, the timer calibration, the role split, equivalence, gate table) | done |
| lane report | this file | done |

No asset was created (no provenance or `LICENSES.json` row needed). Files edited in fix round 4: only this lane's
§2 row (`src/core/engine.js` under its grant — the denoise-noise seed; `tools/gates.r5.engine-gpu.mjs` — A108's
determinism clause, its title and comments; `docs/ROUND5-ENGINE.md`; this file). Two untracked, gitignored, read-only symlinks to main's files keep the POC booting (see §0.2).

## 2. The decision in one table (details: `docs/ROUND5-ENGINE.md` §3.1)

| | Round-4 `high` | shipped `high` (W0b fix round 2) |
|---|---|---|
| DPR cap | 1.5 | **1.25** |
| AA | MSAA ×4 + SMAA (HalfFloat targets) | **SMAA only, RGBA8 targets** (R25) |
| GTAO | ½ res, in-place blend | **¼ res, multiplied in the grade pass** |
| bloom composite | full-res additive blend | **added in the grade pass** |
| post topology | resolve copy, HalfFloat ping-pong | **direct; `renderTarget2` RGBA8; `postTarget` released** |
| CSM | 3 × 2048, every frame | **2048 + 2 × 1024; cascades 1/2 alternate frames** |
| anisotropic filtering | as authored (POC ground 8×; the game's terrain detail and grass cards 4×) | **colour (sRGB) textures 1× (trilinear), data textures (normal, rough/AO) 4×** |
| render targets, DPR 1.25 | 340.74 MB (437.75 at its 1.5 cap) | **127.27 MB** |
| staged fight, textures + geometry + RTs | 891.87 MB (W0a content) | **342.45 MB** |
| Pans vista / empty-frame GPU (gate reading) | 21.43 / 13.30 ms (`G3` lever record) | **11.78 / 4.75 (`G3`), 12.34 / 4.80 (`G4`), 12.35 / 4.32 (`G7`)**, judged |

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
// fix round 4 (A108 determinism):
export const GTAO_NOISE_SEED = 0xCA11A                     // the shipped seed of GTAO's denoise noise
export function makeGtaoDenoiseNoise(seed: number, size = 64) → THREE.DataTexture
                                      // three r169 GTAOPass.generateNoise(size) with a mulberry32-seeded simplex:
                                      // same bytes for the same RNG, same size / RGBA8 / repeat / nearest;
                                      // name 'CAL.gtaoDenoiseNoise', userData.seed
engine.setGtaoNoiseSeed(seed: number) → void   // installs makeGtaoDenoiseNoise(seed) as gtao.pdNoiseTexture and the
                                      // denoise's tNoise, disposes the texture it replaces; the constructor calls it
                                      // with GTAO_NOISE_SEED; a probe that tries other seeds restores it. Not per frame
engine.gtaoNoiseSeed: number | null   // the seed installed (null only while a probe has installed an unseeded texture)
```

Behaviour other lanes rely on: `composer.renderTarget1 === engine.sceneTarget`; `engine.depthTexture` is
never bound as a write target; the studio pass appended after SMAA still gets a write target (`postTarget`,
allocated on demand); `setGrade(false)` keeps the tonemap and the folded AO/bloom; disabling the grade pass
brings back Round 4's in-place blends. **New in fix round 2:** `renderer.capabilities.getMaxAnisotropy()`
answers the HIGHER of the two role caps (4 at `high`); a lane that sets `texture.anisotropy` from it gets 4,
and the engine lowers that texture to its role's cap after three uploads it (colour textures: 1). A lane that
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

Until gates-perf's registry is merged, `tools/gates.mjs` in this tree merges only `gates.round4.*.mjs`. The file
goes in through `--extra`, one file per run. The runner pushes it onto the same list it imports the
`gates.round4.*` files from, so the rows get the same `GATES` merge and the same `--lane` and `--only` handling:

```
node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --lane engine-gpu
node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --only A-gpu-tier-box,A-gpu-tier
```

After gates-perf merges, no flag is needed. The registry finds the file by pattern, and that was proven on its
committed runner in fix round 3 (`M1`–`M3`, §0.1):

```
node tools/gates.mjs --port 5251 --lane engine-gpu
```

For a run that also needs another lane's rows, one combiner module re-exports both `GATES` arrays
(`scratchpad/r5/engine-gpu/combo.gates.mjs`: this file + `gates.r5.pipeline.mjs`). The five re-staged rows
run as `<id>@r5` until `tools/gates.r5.carried.mjs` is in the tree; after the merge they take their real ids
with no edit. On a tree without the registry the Round-4 `A22-msaa` (samples ≥ 4) FAILS by design under
SMAA-only (R25's row is `A22-msaa@r5`). The box witness must run in the same invocation, before its target.
The POC needs the two read-only symlinks of §0.2 in a fresh tree.

## 5. Gate results (port 5251, this tree's page, Oct 22–23)

**Fix round 4 runs** (on the seeded-noise engine; reports in `scratchpad/r5/engine-gpu/run/`):
- `report.S1.json`: exploration `X-seed-witness` + `X-seed-graded` (`explore/seeds.gates.mjs`): 64 witness candidates
  × 22 noise textures, and A108's graded crops × 16 seeds at every GTAO configuration.
- `report.W1.json`: `A108-ao-periodicity@r5` (its own fresh page, first in the run), then the diagnostic `X-seed-why`
  (`explore/why.gates.mjs`, through the combiner `explore/a108why.gates.mjs`).
- `report.W2.json`–`report.W5.json`: `A108-ao-periodicity@r5` alone, each in a fresh Chrome
  (`--extra tools/gates.r5.engine-gpu.mjs --only A108-ao-periodicity@r5`).
- `report.T2.json`: **the round's one suite run** (`--extra combo.gates.mjs`, 22 gates): the global items present
  in this tree, must-stay-green, and the lane's non-timed block. It films `V20`, `V33b` and `V-gpu-tier-look`.
- `report.Q1.json`: the timed pair `A-gpu-tier-box` + `A-gpu-tier` (`chain-q.sh`; box samples in `run/Q1.box`). `Q2`
  and `Q3` (`chain-q.sh`, `chain-q2.sh`, quiet-only) never ran; their samples are in `run/Q2.box` and `run/Q3.box`.
- `report.N1.json`: exploration `X-noise-ab` (`explore/noiseab.gates.mjs`), the interleaved GPU cost of the noise texture.
- `report.F1.json`: the final files (after comment-only edits): `A108` (byte-identical to `W1`), `A-rt-ledger-census`
  PASS, `A-rt-ledger` every binding clause PASS (R44 clause PENDING).

**Fix round 3 runs** (no engine or gate code changed since fix round 2's checkpoint `acdff2c`, only these
docs):
- `report.M1.json`: the merged gate side, `A-rt-ledger-census` + `A-rt-ledger`.
- `report.M2.json`: merged, the non-timed rows plus `A-vram-ledger`; films `V20` and `V33b`.
- `report.M4.json`: merged, `V-gpu-tier-look` re-filmed.
- `M3` and `M5`: quiet-only attempts at the timed pair. Neither started, because the box was never quiet (§0.1).
- `report.T1.json`: this tree with `--extra combo.gates.mjs`. The round's one global-list run, plus
  must-stay-green and the ledger pair as this tree reads it.

Fix round 2's reports, also in `scratchpad/r5/engine-gpu/run/`: `report.F3.json` (lane block + global items, on fix round 1's
engine; the POC rows failed to boot, see §0.2), `report.P1.json` (the POC rows re-run, fix round 1's engine),
`report.F4.json` (**the round's full run on the split mechanism**: lane block without the timed pair + every
global item present + must-stay-green, 22 gates; the colour cap was 2× then), `report.P2.json` (**the lane's
non-timed block + A1, A9, A20b on the final row, colour 1× / data 4×**), `report.L12.json` (A-rt-ledger with
the `budgets.mjs` line), `report.G*.json` (A-gpu-tier; `G2` also films `V-gpu-tier-look` on the final row),
exploration `report.X1.json` / `X2.json` (`explore/role.gates.mjs`, `explore/role2.gates.mjs`; the interleaved
role comparison also ran inside `G1` and `G2`). Between `F4` and the final row only the tier table's numbers
changed (`high` and `medium` colour cap 2 → 1), not the mechanism. Every run went through `run.sh` (the machine-wide
Chrome slot of PLAN §0 rule 8, disk ≥ 3 GB and memory ≥ 25 % checked after taking it); timed runs through
`qrun.sh` (`G1`, `G2`: waited for load < 3 and 0 headless Chromes, then took the slot; from `G3` on the slot is
taken only AT such an instant, so the gate's witness samples that box; load and headless Chromes every 2 s into
`run/<tag>.box`).

### 5.1 The engine-gpu W0b block

| gate | verdict | numbers |
|---|---|---|
| `A-gpu-tier-box` | PASS in `G3`, `G4`, `G7` (fix round 2's engine); fix round 4: PENDING in `Q1` (1 other headless Chrome at the sample) | load 1.63 / 2.18 / 2.34, 0 other headless Chromes at the sample (`run.sh` takes the slot only at such an instant); `Q1`: load 2.03, 1 other Chrome |
| `A-gpu-tier` | **Fix round 4: PENDING-quiet-box under R45** (`Q1` unjudged, every clock under its bar: vista 12.82, empty 4.80, 60.24 fps, p95 18.7; `Q2`, `Q3` found no quiet instant in 85 min; §0). The engine changed only in the denoise noise's texel values, and `X-noise-ab` shows no GPU difference. Before that: **PASS** (judged, final row colour 1× / data 4×; fix round 2's `G3`, `G4`, `G7`) | vista **11.78 / 12.34 / 12.35 ms** ≤ 13; empty **4.75 / 4.80 / 4.32 ms** ≤ 7; fps 60.24 / 59.88 / 59.88 ≥ 58; p95 18.7 / 18.9 / 18.6 ≤ 20; null frames 0.16–0.18 ms; instability ≤ 1.32; docs row = live tier; RT 127.27 MB at 1.25. Another lane's gate Chrome appeared during `G3` at ~70 s (after the shipped bursts), during `G4` at ~37 s and during `G7` at ~31 s (during part of them); `docs/ROUND5-ENGINE.md` §3.3. Unjudged this round: `G1` (the 2× / 4× row, loud from ~20 s), `G2` (final row, started loud after a 2 h wait), `G5` (final row, load 3.23 at the witness sample; every clock under its bar: vista 12.00, empty 4.78), `G6` (final row, another lane's Chrome from 9 s, before the witness sample; **vista read 17.70, over the bar**, under that contention). Lever record (`G3`): Round-4 21.43 / 13.30 → … → shipped 9.32 / 4.73; NOT shipped 2× / 2× 10.59, 2× / 4× 13.64, 4× / 4× 15.03 (vista) |
| `A-gpu-tier` role comparison (exploration, interleaved, `G1`: `X-role2-sim`) | — | colour / data: 1× / 4× **9.91**, 2× / 2× 10.11, 2× / 4× 12.05 (one burst 19.18), 4× / 4× 17.57 |
| `A-rt-ledger` | **merged gate side: PASS on every clause (`M1`)**. This tree: every binding clause PASS; the one clause in gates-perf's file PENDING, cross-lane under **R44** (`T2`, `T1`) | `M1`: 127.27 MB ≤ 170 ✓; staged fight 342.46 MB ≤ 450 ✓ (R34's role-staged fight, 8 × `tiller` with the R28/R30 fallbacks named; textures 100.29, geometry 114.90); docs ✓; **`tools/budgets.mjs` record ✓** (gates-perf's committed line); levers restored ✓; shipped tier @ 1.25 ✓. `T1`: the same terms with `recordedInBudgets: null`. Fix round 2: `F4`, `P2` PENDING, `L12` PASS against a patched copy |
| `A-rt-ledger-census` (W0a row) | **PASS** (`T2`; `M1`, `T1`, `F3`, `F4`, `P2`) | GL 127,271,712 B = ledger, 0 unattributed, 0 mismatches, docs and `RT_LEDGER` match |
| `A-vram-ledger` (gates-perf's gate, run as a cross-check) | **PASS** (`M2`) | its own GL census: render targets **127,271,712 B**, the ledger's byte count, under the ≤ 170 MB cap; textures 105.46 MB ≤ 160, geometry 79.52 MB ≤ 120, total 312.25 MB ≤ 450 at DPR 1.25, tier `high` |
| `A22-msaa` | **PASS** (`T2`; `M2`, `P1`, `F4`, `P2`) | R25 path; `T2`: 0.310 / 0.189 / 0.377, gain 1.639; `M2`: AA fraction 0.310 (SMAA) / 0.189 (none) / 0.378 (Round-4 MSAA ×4 + SMAA), gain 1.64 ≥ 1.5 (`P2`: 0.312 / 0.189, 1.647) |
| `V20-aa-crop` | NEEDS-JUDGE (`T2`; `M2`) | §5.3 |
| `A108-ao-periodicity` | **PASS 5 of 5 fresh boots** (fix round 4: `W1`–`W5`; also `T2`; before: `M2`, `P1`, `F4`, `P2`) | worst 0.135 (ultra @ 1, far 128 m, control 0.137); 0 fails; witness crop 1: stock **0.239@5,-29** ≥ 0.15, shipped 0.102, off 0.114 (crop 2 does not separate: 0.128 / 0.126 / 0.103); denoise noise: seed 0xCA11A, sampled, hash `a698df06` = fresh build. The six runs' details are byte-identical (`docs/ROUND5-ENGINE.md` §3.6) |
| `A109-ao-distance-fade` | **PASS** (`T2`; `M2`, `P1`, `F4`, `P2`) | high: 4–6 m 0.0682 (n 3,037), past 150 m 0 (n 2,421), far band ratio 1.000; ultra: 0.0718, 0, 1.000 |
| `V33b-no-ao-lattice` | NEEDS-JUDGE (`T2`; `M2`) | §5.3 |
| `V-gpu-tier-look` | NEEDS-JUDGE (`T2`; `M4`, `G2`) | §5.3 |

### 5.2 Global green list (the items that exist in this tree) and must-stay-green: `T2` (fix round 4, the round's one suite run on the seeded-noise engine; 22 gates with the lane block: 15 pass, 4 pending, 3 need judging), fix round 3's `T1` for comparison

| gate | verdict | numbers |
|---|---|---|
| `A1-boot-clean` | PASS (`T2`; `T1`) | `state=playing` |
| `A9-perf-budget` | **PENDING on a loud box (`T2`)**; PASS in `T1` | 262 draws PASS; 37.5 fps / scene GPU 57.08 ms NOT attributable: the null frame (nothing drawn) took 7.69 ms of GPU, i.e. another GPU client. `T1` read 55.7 fps and passed; fix round 2: 50.9 (`F4`), 48.0 (`P2`). Under **R45** the fps term is graded at the orchestrator's quiet global run |
| `A20b-no-system-errors` | PASS (`T2`; `T1`) | 0 system errors, 0 hook errors, 358 frames |
| `A21-real-draw-calls` | **PENDING on a loud box (`T2`)**; its W0-day1 baseline verdict is FAIL on the Round-4 GPU term (R33 b: listed, not graded, must not get worse) | draws 266 / 171 / 279 ≤ 350 PASS; triangles 3.70 / 3.34 / 3.80 M PASS; GPU and p95 terms unattributable (null frame 3.06 ms, GPU instability 2.86 ×). Readings for the record: median GPU at raw DPR 2 91.5 / 121.5 / 64.4 ms (`T1`: 88.4 / 119.2 / 94.5; `F4`: 96.6 / 129.7 / 83.4), at the capped 1.25 33.3 / 68.6 / 20.9 (`T1`: 52.0 / 63.7 / 55.3). Under R45 its GPU and p95 terms are graded at the quiet global run |
| `A90-memory-stability` | PASS (`T2`; `T1`) | heap −11.7 %, geometries +9, textures −28, objects −1,096 (`T1`: −8 %, +8, −28, −1,096) |
| `A90-memory-stability-expansion` | PASS (`T2`; `T1`) | objects −1,059, non-machine growth 0, 0 orphan roots |
| `A90b-memory-attribution` | PASS (`T2`; `T1`) | 0 offenders, 0 orphaned textures, heap −6.9 % after forced GC; 0 late or new texture uploads. This is this tree's Round-4 workload; R34's Tiller workload is instruments-core's |
| `A90-rig-reclaim` | PASS (`T2`; `T1`) | 30 cycles: geometries +5, textures 0; per live machine 0 / 0.5 |
| `A-ID-ip-assets-gone` | PASS (`T2`; `T1`) | 19 GLBs, 217 files through rows, 0 IP hits (`aloy.glb` scheduled for hero-body's exit) |
| `A-assets-tracked` | PASS (`T2`; `T1`) | 221 referenced, 0 ignored, 0 missing |
| `A-licence-manifest` | PENDING (`T2`, `T1`; pipeline's clauses: third-party, legacy source, credits; R42) | files-matched PASS (217 files), row schema, code rows, licence texts, size PASS |
| `A20-frame-loop-survives` | PASS (`T2`; `T1`) | 44 frames after 3 throws |
| `A22b-fov-recompile` | PASS (`T2`; `T1`) | every FOV composited a real frame, 0 errors |
| `A56-cascades` (carried, CSM check) | PASS (`T2`; `T1`) | near texel 1.38 cm ≤ 2, `shadowMapSize` 2048, 3 cascades |

Not in this tree (other lanes' files): `A90-abs`, `A-alloc-rate`, `A-vram-ledger`, `A-no-horizon-terms-*`,
`A-reach-all-sites`, `A-port-guard`, `A-carried-suite`. Of these, `A-vram-ledger` was run on the merged gate
side as a cross-check (`M2`, §5.1). The W0a probe pair was not re-run: it is a W0a gate, judged and ruled at W0a,
and nothing here touches the terrain build or nav.

### 5.3 Film, read by the lane against the criteria (advisory; R29 judges grade)

**Fix round 4 (`T2`, the seeded-noise engine; sheets `scratchpad/r5/engine-gpu/run/T2/V20-aa-crop@r5.png`,
`run/T2/V33b-no-ao-lattice@r5.png`, `run/T2/V-gpu-tier-look.png`).** I read each sheet whole, then the cited
parts magnified ×2 nearest (V33b row 4 and row 1, V-gpu-tier-look crops 2 / 3 / 4 on the pan):
- **V33b**: rows 1–2 (high at ¼ res, ultra) at N / E / S / W show no bars, bands, checker or dither on the
  shelf walls, the hills, the haze band, the sky edge or the bright S bearing over the water; the sand ripples
  are the dune normal map and run with the dunes, not with the screen. Row 3: the far shelf wall's columns
  on and OFF are indistinguishable at both tiers. Row 4: the ×8 darkening maps show soft contact darkening
  under the boulder's lower edge and at the grass bases, open sand white. The high tile is broader and
  carries the fine grain of the denoise at ¼ resolution; there are no blocks, no stair-stepped halo and no
  outline against the sky. The ultra tile is sharper. Reading: **PASS**, the same as `P2` and `M2`.
- **V20**: the shipped tile (top-left) has 1–2 px intermediate tones along the column tops' diagonals and
  the shelf edges. The no-AA tile (top-right) has hard two-tone stair-steps on the same edges, plainest on
  the tall column's left side, where the shipped tile keeps two or three softened steps. Round 4
  (bottom-left) is the softest. The locator puts the crop on the column crown against the sky. A22 measures
  the same frame at 0.310 vs 0.189. Reading: **PASS**.
- **V-gpu-tier-look**: the four full frames are the same scene, light and grade. At ×2 on the pan: crop 2
  (shipped levers, 8×) shows the polygonal crust cell by cell; **crop 4 (SHIPPED, colour 1× / data 4×)
  shows the same cells, a shade softer, plus the dune ripples**; crop 3 (NOT shipped, 2× / 2×) turns the
  pan into horizontal streaks with no cells and weakens the ripples. Reading: **PASS**, unchanged from `M4`.

Earlier sheets, filmed on the final row: `scratchpad/r5/engine-gpu/run/P2/V20-aa-crop@r5.png`,
`run/P2/V33b-no-ao-lattice@r5.png`, `run/G2/V-gpu-tier-look.png`; the exploration crops in `run/X1/`,
`run/X2/`. (`F4` filmed all three on the 2× / 4× row and read the same; superseded sheets were deleted.)

- **V-gpu-tier-look** (`G2`): top band, frames 1, 2 and 4 are the same scene — same light, the ring's ellipse
  shadow on the pan, grade, bloom on the sky; 2 and 4 are a little softer than 1 (DPR 1.25 against 1.5).
  Crops, magnified: crop 1 (Round 4) shows the salt pan's light polygonal crust crisply and the dune ripples
  in front; crop 2 (shipped levers, 8×) the same, softer; **crop 4 (SHIPPED, colour 1× / data 4×) still shows
  the polygonal crust across the pan and the ripples on the dune — a softer crop 2, no streaks**; crop 3 (NOT
  shipped: fix round 1's 2× / 2×) shows what fix round 1 shipped: the crust gone into faint horizontal
  streaks, the ripples nearly gone. My reading: PASS (fix round 1's shipped row would have failed it).
- **Fix round 3, `M2`** (merged gate side, real ids): **V20**: same reading as below. The shipped tile
  (top-left) has 1–2 px intermediate tones along the column tops' diagonals and the shelf edges. The no-AA tile
  (top-right) has hard two-tone stair-steps on the same edges, plainest on the column tops and the tall column's
  left side. Round 4 (bottom-left) is the softest, and the locator (bottom-right) puts the crop box on the
  column crown against the sky. Reading: PASS. **V33b**: rows 1–2 (high ¼-res, ultra) at N/E/S/W show no
  bars, bands, checker or dither, including the bright S bearing over the water. In row 3, on and OFF are
  indistinguishable at both tiers on the shelf wall. In row 4, the ×8 darkening maps show soft contact darkening
  under the shelf lip and at the grass bases (high broader and grainier), white open sand, no blocks.
  Reading: PASS. **V-gpu-tier-look** (`M4`, re-filmed on its own because the box was never quiet for the
  timed pair; the film has no timing term): the four full frames are the same scene, light and grade. I also
  compared crops 2, 3 and 4 at a further ×2 nearest. Crop 2 (shipped levers, 8×) and **crop 4 (SHIPPED,
  colour 1× / data 4×) both show the salt pan's polygonal crust cell by cell** across the lower half of the
  crop, crop 4 a shade softer toward the far edge. **Crop 3 (NOT shipped, 2× / 2×) turns the same ground into
  horizontal streaks with no cells.** Reading: PASS. Sheet: `run/M4/V-gpu-tier-look.png`.
- **V20** (`P2`; `P1`, `F4` the same): top-left (shipped, SMAA-only at 1.25, 4× nearest): the column tops and sides carry 1–2 px
  ramps between rock and sky; top-right (no AA): hard two-colour stair-steps on the same edges, clearest on the
  tall column's left side; bottom-left (Round-4 MSAA ×4 + SMAA at 1.5): the softest, and the shipped tile keeps
  two or three visible steps on that near-vertical edge where Round 4 has none. My reading: PASS.
- **V33b** (`P2`; `P1`, `F4` the same): rows 1–2 (high at quarter-res, ultra) at four bearings: no bars, bands, checker or
  dither; row 3 (1:1 shelf wall across the pan): on and OFF indistinguishable at both tiers; row 4: the ×8
  darkening maps show soft darkening along the boulder's contact with the sand and at the grass bases (high
  broader and grainier, ultra sharper), white open ground, no blocks, no outline against the sky. My reading:
  PASS.

## 6. Honest gaps

0. **A108's witness depends on the denoise noise, and the seed pins it (fix round 4).** For about one noise
   texture in five to eight (seeded: 5 of 40; three's `Math.random`: 7 of 30), the Poisson denoise hides the
   stock-shader lattice on witness crop 1 completely, and no other crop on the POC replaces it. The shipped
   seed is one of the seeing ones. The witness is therefore a proof for the pipeline the engine ships, not
   for every possible noise texture. Anything that changes that texture or the denoise has to re-run A108:
   `GTAO_NOISE_SEED`, `makeGtaoDenoiseNoise`, `updatePdMaterial`'s radius / rings / samples, or the GTAO
   resolution. If the witness goes blind, the gate fails by name and does not pass silently. The W1 Pans,
   which re-stage A108 on real content, should pick witness crops that see the defect for any seed.
1. **Colour textures get no anisotropic filtering at `high` (1×, trilinear).** On the POC that is invisible
   at the gate's crop because the far relief is in the normal maps, but any albedo-borne detail seen at a
   grazing angle (painted lines, text, the Round-4 grass cards' sRGB atlas, 4× in Round 4) is blurrier along
   the view direction than in Round 4. 2× / 4× was the better picture and the riskier bar (§0.2).
2. **The split is tuned on the POC.** The crust lives in the POC ground's normal maps; the real Pans at W1
   (world-ground, plan §4.3: ≤ 3 layers, triplanar on slopes only) are about half the POC's fetches, and
   `A-gpu-tier` re-runs there (plan §6). The lever record carries the 4× / 4× row each time so `high` can go
   back to 4× on everything when it fits.
3. **The GPU timer reads a clock state, not a cost** (`docs/ROUND5-ENGINE.md` §3.4, calibration). One
   configuration reads several ms apart between 2 s bursts; another process on the GPU can lower the reading
   (a clock step up) or raise it past the bar (two clients time-slicing: `G6` read the final row's vista at
   17.70 with another lane's Chrome alive from 9 s). The judged margin is 0.65–1.22 ms (`G3`, `G4`, `G7`). Nothing in
   the gate was changed for this; a capacity instrument would be a ruling.
4. **`A-rt-ledger`'s `budgets.mjs` clause stays PENDING in this tree** (`T1`), because the line lives in
   gates-perf's file. On the merged gate side, with gates-perf's committed line and R34 staging, the gate
   passes every clause (`M1`), and gates-perf's own `A-vram-ledger` counts the same 127,271,712 B (`M2`).
   It turns green on the tree that has both lanes, which only the orchestrator can make (§0.1).
5. **A21's GPU term** fails at baseline (R33: listed, not graded); this tree reads it unattributable on a loud
   box (`F4`) or FAIL (`F3`, 83–134 ms at raw DPR 2); draws and triangles PASS.
6. **Box quietness.** Six lanes and their judges share one GPU; other lanes' gate Chromes start between the
   slot holders. The gate's own witness samples the box only at its start; `run/<tag>.box` says what my
   monitor saw during each timed run.
7. **The role rule is the colour space.** A colour texture authored in a linear colour space (a float/HDR
   albedo) is treated as data (gets the 4× cap). None exists today. A texture swapped onto a material without
   any texture being uploaded or disposed that frame is lowered at the next texture-count change.
8. **The POC is not shipped content** and the re-staged gates need `?poc=biome`, `window.__R5BIOME__` and the two
   symlinks of §0.2 until `A-gpu-tier` re-stages on the W1 Pans (round 0 gap, unchanged).
9. **No judged `A-gpu-tier` run on this round's engine (fix round 4).** The only timed run on the
   seeded-noise engine (`Q1`) is unjudged. Every clock read under its bar, but the vista read 12.82 ms
   against the 13 ms bar, closer than fix round 2's judged 11.78–12.35. Its third burst (15.89) overlapped
   another lane's Chrome. R45's proviso ("code unchanged since the builder's timed runs") is met by `Q1`
   only as an unjudged run. The interleaved `X-noise-ab` shows the texel-value change costs nothing, but it
   ran on a loud box. If the orchestrator's quiet runs read the vista over 13 ms, R45 gives this lane a
   targeted fix round.

## 7. For other lanes and the orchestrator

- **Orchestrator:** (a) fix round 1 left you a trade (2× and a soft salt pan, or 4× and a red vista); fix
  round 2 replaces it with the role split — read §5.1 and `V-gpu-tier-look` crops 3 vs 4; (b) **`A-rt-ledger`
  under R44:** after merging `r5/w0a-gates-perf` (its `tools/budgets.mjs:141` carries the line), run
  `node tools/gates.mjs --port 5270 --lane engine-gpu --only A-rt-ledger-census,A-rt-ledger` on main, which
  reproduces `M1`. Merge order does not matter for this lane: the only file both branches changed is
  `docs/ROUND5-PLAN.md`; (c) **`A-gpu-tier` under R45:** run it 3 times on a box with no other gate Chrome alive
  for the whole run (`docs/ROUND5-ENGINE.md` §3.4). This round changed `engine.js` (the denoise noise only), so
  the R45 proviso rests on this round's timed runs, `Q*` in §0; (d) a fresh tree needs the two POC symlinks of
  §0.2 (gitignored, untracked) or the POC rows fail to boot; (e) **A108 is now deterministic:** expect the
  byte-identical detail of §5.1 on main (worst 0.135, witness 0.239 / 0.102 / 0.114, noise hash `a698df06`).
  A different reading means the noise or the denoise changed (§6 item 0).
- **gates-perf:** the `RT_LEDGER` re-export is already committed on your branch (`budgets.mjs:141`, verified
  in `M1` with no import cycle). Keep it through your exit. Your `A-vram-ledger` already agrees with the ledger
  to the byte (`M2`).
- **world-ground (W1):** the ground shader is the vista's cost; keep relief in the normal maps (data textures
  get 4× at `high`) and expect albedo at 1× (trilinear) on the POC's evidence; the W1 re-grade can raise it. §4.3's limits are what let `high` return to 4× everywhere.
- **world-sky (W1):** cascades ≥ 1 render on alternate frames at `high` (`csmFarCadence`); ask `enableCSM`
  for what you want, `engine.csmMapSizes` says what you got. A camera cut shows one frame of the previous
  far-cascade map.
- **shell-ui (W2):** tier names unchanged; `high` is the default.
- **any lane touching GTAO** (`engine.gtao`): the denoise noise is the engine's seeded texture; replacing
  `gtao.pdNoiseTexture`, calling three's `generateNoise()`, or changing `updatePdMaterial` makes A108 fail its
  determinism clause or can blind its witness. Use `engine.setGtaoNoiseSeed(GTAO_NOISE_SEED)` to restore.
- **any lane appending a post pass:** append after SMAA as the studio pass does; the scene target is never a
  write target and `postTarget` (18 MB) is allocated when a pass needs it.

## 8. Process hygiene

- Every Chrome came from `tools/gates.mjs` on `--port 5251`, one at a time, through
  `scratchpad/r5/engine-gpu/run.sh`: the machine-wide Chrome slot of PLAN §0 rule 8 held only for the run,
  disk ≥ 3 GB and memory ≥ 25 % checked before and after taking it. Timed runs (`qrun.sh` → `run.sh` with
  `QUIET=1`) take the slot only at an instant with load < 3 (2.5 for `G6`, `G7`) and no headless Chrome alive,
  never holding a slot while waiting, and sample load and headless Chromes every 2 s (`run/<tag>.box`).
- Runs in fix round 4: `S1` (exploration), `W1` (A108 + diagnostic), `W2`–`W5` (A108 alone), `T2` (the one
  suite run), `Q1` (timed), `N1` (exploration) and `F1` (final check). `Q2` and `Q3` were quiet-only attempts
  that never started a Chrome (§0). `run.sh` now polls for a free slot every 4 s
  (was 30 s), and it has a `QSTRICT` mode in which a quiet-only attempt gives up at its deadline and does not run
  on a loud box.
- Runs in fix round 3: `M1`, `M2`, `M4` and `T1`. `T1` is the one suite run. `M3` and `M5`, the quiet-only
  attempts at the timed pair, never started a Chrome (§0.1). The `M` runs used
  `run-merged.sh`/`qrun-merged.sh`: the same slot, preflight and quiet rules as `run.sh`/`qrun.sh`, with gates-perf's
  committed runner from the read-only merged gate side (§0.1) against this tree's Vite on 5251. That runner also took its
  own semaphore ticket.
- Runs in fix round 2: `F3`, `P1`, `X1`, `X2`, `L12`, `F4`, `G1`, `G2`, `P2`, `G3`, `G4`, `G5`, `G6`, `G7` (14).
  `F4` was the one full suite on the split mechanism. `F3` re-ran the evidence on fix round 1's engine after the
  reboot.
- Vite on 5251 was started from the tree with `npx vite --port 5251 --strictPort` and killed at the end. At the
  end: 0 headless Chromes on 5251, 0 `cal-*-5251-*` profiles, no Chrome slot held, no loop of this lane left
  running. Port 5173 was never touched. No git write was run (the WIP commits on this branch are the
  orchestrator's checkpoints).
- Screenshots: no PNG is left in the tree (`shots/gates/` holds only the runner's report files). Kept in scratch:
  fix round 3's sheets (`run/M2/`, `run/M4/`), fix round 2's (`run/P2/`, `run/G2/`) and the exploration crops
  (`run/X1/`, `run/X2/`). The action-gate frames were deleted once read.
- Scratch is ≈ 57 MB. `merged/` (48 MB, the read-only merged gate side of §0.1, kept so `M1` can be reproduced:
  `cd merged && node tools/gates.mjs --port 5251 --lane engine-gpu --only A-rt-ledger-census,A-rt-ledger` with
  the tree's Vite on 5251) can be deleted after the gates-perf merge. The rest is reports, logs, `*.box`, the run
  scripts, `combo.gates.mjs`, `explore/` and fix round 2's superseded `budgets-proof/` and
  `budgets-rt-ledger.patch`. The judge scratch was deleted. Free disk ≈ 45 GB at the end.
