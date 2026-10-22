# CALIMA — ENGINE NUMBERS (lane engine-gpu)

The measured engine facts other lanes plan against. Owned by engine-gpu (plan §2); the lane report
is `docs/ROUND5-ENGINE-GPU.md`. Every number here comes from a gate in
`tools/gates.r5.engine-gpu.mjs` run on port 5251 (Oct 15 2026, Apple M3 Pro, Chrome for Testing,
ANGLE/Metal, headless, 1600×900 CSS px; fix rounds 2 and 3: Oct 16; W0b and its fix round 1: Oct 19); 1 MB = 10⁶ bytes, the unit of plan §4.4.

| section | status |
|---|---|
| 1. Render-target ledger (`A-rt-ledger-census`, `A-rt-ledger`) | **W0b fix round 1, graded (ruling `rt-ledger-bar=W0b`): 127.27 MB at the shipped tier, DPR 1.25** (bar ≤ 170; round 0: 154.27), recounted from the GL allocation calls and equal to the byte; staged-fight total **342.45 MB** (bar ≤ 450). The one clause left is the record in `tools/budgets.mjs` (gates-perf's file, one line; with it the gate passes every clause, §3.10). W0a's Round-4 tier ledger (340.74 MB) is §1.3 |
| 2. 1024 m terrain + nav probe (`A-terrain-1024-probe-box` + `A-terrain-1024-probe`) | **Judged on a quiet box (fix round 3: 4 quiet runs; Q5p and Q6p judged every term).** Single-thread build: 1024 m and 860 m FAIL, 720 m PASS. Pool build (bit-identical, own witness): PASS at every size. GPU delta +0.23 / +0.20 ms PASS; nav 43–44 ms PASS; vertex 20.77 MB PASS. **W1 size by ruling: `pool-terrain-build=accepted` → 1024 m; `=rejected` → 720 m.** The gate stays PENDING, and writes no size, until the orchestrator rules (§2.5). Conditions for W1 in §2.6. |
| 3. GPU tier (`A-gpu-tier`) | **W0b fix round 1: shipped `high` = DPR cap 1.25 + GTAO ¼ + SMAA-only + SMAA RGBA8 + far cascades 1024 + direct post topology + GTAO/bloom folded into the grade + far cascades on alternate frames + anisotropic filtering capped at 2×** (§3.1). `A-gpu-tier` **PASS in 3 judged runs**: Pans POC vista 10.28 / 11.62 / 11.23 ms ≤ 13, empty frame 4.83 / 4.87 / 4.85 ms ≤ 7, fps 59.88–60.24, p95 18.5–18.7 ms (§3.3; another lane's gate Chrome was alive during part of each run, §3.3). Render targets **PASS** (127.27 MB). The cap costs far-ground texture detail (filmed, `V-gpu-tier-look`, §3.1); the GPU timer reads a clock state on this machine (§3.4). A22 (R25), A108, A109 PASS; V20, V33b, V-gpu-tier-look filmed for the judge |
---

## 1. Render-target ledger

**W0b: graded at the shipped default tier** (`QUALITY_TIERS.high` after the W0b decision, §3: SMAA-only,
GTAO at quarter resolution, SMAA targets RGBA8, CSM cascades 2048 / 1024 / 1024, bloom capped at 1280 px
wide; fix round 1: the direct post topology, §3.1 — no resolve copy, `renderTarget2` holds the grade's RGBA8
output, `postTarget` released), **DPR 1.25** (a DPR-2 display under the tier's 1.25 cap: 2000 × 1125 device px), 1600 × 900, read
off the running build by `engine.renderTargetLedger()` on the spawn vista and then the staged fight
(`tools/budgets.mjs`). Bytes are what each allocation holds: colour × mips × faces, the multisampled colour
and depth renderbuffers (× samples) when a target is multisampled, the depth renderbuffer
(DEPTH_COMPONENT24 = 4 B) or depth texture; RGB is stored as 4 channels. W0a's ledger of the Round-4 tier
(340.74 MB) is kept in §1.3.

**How it is checked (fix round 3).** `A-rt-ledger-census` boots the page with `?rtTally=1`, which
makes `engine.js` wrap the WebGL2 prototype *before the renderer's context exists*. Every texture
level, renderbuffer storage, framebuffer attachment and explicit delete since boot is recorded as raw
call parameters. The census sizes them with its own table of GL internal formats (not the ledger's
three-enum arithmetic), takes every live attachment of every live framebuffer plus every live
renderbuffer, and attributes each GL object to a ledger row: through three's properties for a row
with a target, through the shared framebuffer for a texture-only row. It passes only when nothing is
unattributed and every row's GL bytes equal its ledger bytes, to the byte.

**The environment row** counts the PMREM target `fromScene` made *with its 768 × 1024 DEPTH_COMPONENT24
renderbuffer* (3,145,728 B), also after `environment.js` dropped the target object (fix-round-2 judge,
`J-eg-env-depth`; handoff to world-sky in §1.5).

A lane's registered target stays named through `setSize()` (three dispatches `dispose` there) with
its new bytes; the census walks one through 2×2 → 64×32 → 128×48 → dispose → unregister (fix round
1). A texture a registered target owns is counted once, on the registered row. Since W0b,
`registerRenderTarget` sweeps dead WeakRefs (collected or unregistered targets) before adding one (the
W0a judge's minor finding).

### 1.1 Per target at the shipped tier (`A-rt-ledger`; `RT_LEDGER` in the leaf module `tools/r5-probes/rt-ledger.mjs`)

<!-- rt-ledger:begin -->
| owner | target | device px | layout | bytes |
|---|---|---|---|---|
| `post:scene` | CAL.sceneTarget | 2000 × 1125 | RGBA16F 18.0 MB + depth texture (DEPTH24) 9.0 MB; no MSAA | 27,000,000 |
| `post:pingA` | CAL.postA | 2000 × 1125 | RGBA8 (the grade's tonemapped output, read by SMAA), no depth | 9,000,000 |
| `post:pingB` | CAL.postB | — | released in the direct topology; allocated only when a pass after the grade needs a write target (the studio pass), then RGBA16F 18.0 MB | 0 |
| `post:GTAOPass.gtaoRenderTarget` | GTAO (quarter res) | 500 × 281 | RGBA16F + depth24 renderbuffer | 1,686,000 |
| `post:GTAOPass.pdRenderTarget` | GTAO denoise | 500 × 281 | RGBA16F + depth24 renderbuffer | 1,686,000 |
| `post:UnrealBloomPass.bloom-chain` | bright + 5 H + 5 V mips | 640 × 360 … 40 × 23 | RGBA16F + depth24 renderbuffer each | 10,130,880 |
| `post:SMAAPass.edgesRT` | SMAA edges | 2000 × 1125 | RGBA8, no depth | 9,000,000 |
| `post:SMAAPass.weightsRT` | SMAA weights | 2000 × 1125 | RGBA8, no depth | 9,000,000 |
| `shadow:csm[0]` | CSM cascade 0 | 2048 × 2048 | RGBA8 packed depth + depth24 renderbuffer | 33,554,432 |
| `shadow:csm[1]` | CSM cascade 1 (capped) | 1024 × 1024 | RGBA8 packed depth + depth24 renderbuffer | 8,388,608 |
| `shadow:csm[2]` | CSM cascade 2 (capped) | 1024 × 1024 | RGBA8 packed depth + depth24 renderbuffer | 8,388,608 |
| `env:environment` | PMREM (cube-UV, `fromScene`) | 768 × 1024 | RGBA16F 6.29 MB + depth24 renderbuffer 3.15 MB | 9,437,184 |
<!-- rt-ledger:end -->

| | MB |
|---|---|
| **render targets, total** | **127.27** (127,271,712 B; bar ≤ 170: **+42.73 MB** of margin). W0b round 0: 154.27; W0a, Round-4 tier: 340.74 |
| canvas drawing buffer (not a three target; reported apart) | 18.0 (RGBA8 + depth24 at 2000 × 1125) |
| provisioned, not allocated (listed by the ledger, not summed) | 18.0 — `post:pingB` (`postTarget`, RGBA16F 2000 × 1125), released in the direct topology and allocated only while a pass after the grade needs a write target (the studio pass): then the total is 145.27 MB, still ≤ 170 (+24.73). The GTAO G-buffer is shrunk to 1 × 1 and never bound. (Fix round 1's table said 0 here; the ledger has always listed this 18 MB as provisioned — corrected Oct 22) |
| the sun's 2048² map (`environment.js:431`) | 0 — it is the no-CSM fallback only; with CSM the sun casts no shadow |

### 1.2 Where the plan's estimate went wrong

Three costs were not in the ≈ 150 MB estimate: the MSAA ×4 **depth** renderbuffer of the scene target
(36 MB; three allocates it per sample besides the depth texture), the **RGBA8 colour attachment** of
every r169 shadow map (three packs depth into RGBA; each 2048² map is 16.8 MB of colour + 16.8 MB of
depth, not 16.8 MB), and the two **HalfFloat SMAA** targets at full resolution (36 MB).

### 1.3 W0a: the Round-4 tier and its levers, every row measured live (fix round 3, env depth included)

`A-rt-ledger` applies each lever to the live staged frame and reads `engine.renderTargetLedger()`.
The levers are:
- MSAA samples → 0, then dispose
- CSM `shadow.mapSize` + `csm.shadowMapSize` → 1536 / 1024, then dispose
- SMAA edges/weights `texture.type` → UnsignedByte, then dispose
- `tier.gtaoScale` × 0.5
- DPR

It then restores everything and checks that the ledger returns to 340.74 MB (`leversRestored`, a
graded term). Every row is fix round 2's figure + 3.15 MB (the environment depth), to the 0.01 MB.

| configuration (DPR 1.25 unless stated) | RT MB, **measured live** | margin to the 170 MB bar | scene / shadow / SMAA / GTAO MB |
|---|---|---|---|
| shipped `high` | 340.74 | −170.74 | 135 / 100.66 / 36 / 13.51 |
| SMAA-only (MSAA 0) | 232.74 | −62.74 | 27 / 100.66 / 36 / 13.51 |
| CSM 3 × 1536² | 296.70 | −126.70 | 135 / 56.62 / 36 / 13.51 |
| CSM 3 × 1024² | 265.25 | −95.25 | 135 / 25.17 / 36 / 13.51 |
| SMAA targets RGBA8 | 322.74 | −152.74 | 135 / 100.66 / 18 / 13.51 |
| GTAO ¼ resolution | 330.60 | −160.60 | 135 / 100.66 / 36 / 3.37 |
| DPR 1.0 | 261.35 | −91.35 | 86.4 / 100.66 / 23.04 / 8.64 |
| DPR 1.5 (today's `high` cap) | 437.75 | −267.75 | 194.4 / 100.66 / 51.84 / 19.44 |
| SMAA-only + CSM 3 × 1536² + SMAA RGBA8 | **170.70** | **−0.70** (was +2.4 before the env depth was counted) | 27 / 56.62 / 18 / 13.51 |
| SMAA-only + CSM 3 × 1536² + SMAA RGBA8 + GTAO ¼ | 160.56 | +9.44 | 27 / 56.62 / 18 / 3.37 |
| SMAA-only + CSM 3 × 1024² | 157.25 | +12.75 | 27 / 25.17 / 36 / 13.51 |
| SMAA-only + CSM 3 × 1024² + SMAA RGBA8 | 139.25 | +30.75 | 27 / 25.17 / 18 / 13.51 |

**W0b input:** at DPR 1.25 the 170 MB bucket is reachable only with SMAA-only **and** smaller shadow
maps; MSAA alone is 108 MB of it, the three cascades 100.66 MB. With the environment depth counted,
the cheapest 1536² set (SMAA-only + 1536² + RGBA8 SMAA) is **0.70 MB over** the bar. The sets that
fit: + GTAO ¼ (+9.44 MB), 1024² cascades (+12.75), 1024² + RGBA8 SMAA (+30.75). world-sky dropping
the PMREM depth (§1.5) would give back 3.15 MB on every row.

Not graded yet: whether RGBA8 SMAA targets and 1024² cascades still look right. That is
`V20-aa-crop` and `V33b` at W0b.

The shadow-map size is a world-sky value passed to `engine.enableCSM`. A tier-table cap applied inside
`enableCSM` (engine grant) is the seam that does not touch world-sky's file.

### 1.4 GPU memory at the staged fight — W0a (Round-4 tier and content; W0b numbers in §3.2)

| bucket | MB | plan §4.4 bar |
|---|---|---|
| textures (136 uploaded, texel bytes × mips) | 422.12 | ≤ 160 |
| geometry (1,893 buffers) | 129.01 | ≤ 120 |
| render targets | 340.74 | ≤ 170 |
| **sum** | **891.87** | ≤ 450 |

The texture and geometry numbers are the Round-4 HZD content that W0a–W2 delete and replace; they
are recorded as the starting point, not as an engine finding. gates-perf's `A-vram-ledger` (W0b)
owns that census; the gate exports the arithmetic as `VRAM_CENSUS` for reuse.

### 1.5 The environment target (handoff to world-sky)

`environment.js:446–449` does `scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture`
and drops the target. That target holds the 6.29 MB texture **and** a 3.15 MB DEPTH_COMPONENT24
renderbuffer that is only needed while `fromScene` renders the cube faces. With the target object
gone there is no `dispose()` left to call, so three never deletes either (whether the browser
reclaims GL objects whose JS wrappers are garbage-collected is not something any gate here observes;
the ledger counts them, the conservative reading). world-sky (W1, `environment.js` is theirs):
1. keep the target `fromScene` returns, `engine.registerRenderTarget('env:pmrem', rt)`, and
   `rt.dispose()` when the environment is rebuilt or torn down (the ledger then counts it once, on
   the registered row);
2. or, to drop the 3.15 MB for good: render the room into a `WebGLCubeRenderTarget`, run
   `fromCubemap` (its output target has no depth buffer), and dispose the cube target.
The RoomEnvironment's own geometries and materials are not disposed either.

---

## 2. The 1024 m terrain + nav probe

`tools/r5-probes/terrain1024.js`, gates `A-terrain-1024-probe-box` + `A-terrain-1024-probe`.

> **Corrections on record.**
> - *Fix round 1:* the first round graded a lean re-implementation of the mesh passes on a cheap
>   stand-in recipe, which under-counted today's real `_buildMesh` 1.9–2.2×. "1024 m passes", "≈ 230 ms
>   of build headroom" and "a recipe of ≤ 0.8 µs per sample fits" were withdrawn.
> - *Fix round 2:* fix round 1 graded the build clock on a busy box. Its verdicts flipped on unchanged
>   code: the judge's run (load 5.62, 2 other Chromes) read 720 m at 619.2 / 639.2 / 656.7 ms (FAIL),
>   lane run 4 (load 4.39) read 541.4 / 544.1 / 540.9 (PASS), and today's own calibration build
>   drifted 575.7 → 785.5 ms. Withdrawn: "on a quiet box the rule will most likely produce 720 m",
>   and "1024 m and 860 m fail by a margin no contention explains" — 860 m's fastest single build
>   (718 ms) is only 1.20× the bar, inside the 1.36× drift seen on this box. Every build and nav
>   clock is now judged on a quiet box only (§2.1); on a loud box only a single-thread FAIL that
>   clears the bar × 1.37 survives, and that is 1024 m's single-thread build alone.
> - *Fix round 3:* withdrawn from fix round 2: "the plan rule then writes the W1 size itself" and "no
>   ruling … is needed to get a judged answer" — both assumed the bar may grade the pool, which is
>   not in `src/`; that is now the orchestrator's ruling `pool-terrain-build` (§2.1, §2.5). Corrected:
>   render targets 337.6 → **340.74 MB** (the PMREM depth renderbuffer, §1), and the cheapest
>   1536² lever set 167.6 MB / +2.4 MB → **170.70 MB / −0.70 MB** (§1.3). Withdrawn from the lane
>   report: re-exporting `RT_LEDGER` from the lane gate file into `tools/budgets.mjs` (an import
>   cycle that stops the gate runner loading any gate); it now lives in a leaf module.

### 2.1 What is measured

- **Build — today's `_buildMesh`, every pass, two ways, 3 runs each, interleaved S P S P S P per
  size, every timed build starting from a collected heap (`window.gc`).**
  - **serial**: today's real `Terrain` constructor (`realBuild`), fetched from `src/world/terrain.js`
    exactly as Vite serves it, only `MESH_SPAN` / `MESH_SEGS` made settable. Passes timed: heights,
    the filtered field, `_bakeVertexColors`, rim-widened normals + geometry, `_buildMasks`
    (3 × 512²), the three 256² detail bakes.
  - **pool** (`parallelBuild`, new this round): the same passes on **4 module workers spawned
    cold for each build** (worker spawn, module import and the module's path/stealth grids are
    inside the timed window) and terminated before the call returns. The workers import the same
    patched `terrain.js` and run **today's own functions** on the rows they are dealt: `getHeight`,
    `_vertexColor`, `_maskTexel`, `_bakeDetail` (configs read from today's source), and today's
    normals loop. The page thread builds the PlaneGeometry arrays and `_smoothField` and assembles.
    Jobs are dealt on demand (≤ 2 in flight per worker): the box's cores are not equal.
  - **Which build the 600 ms bar grades is the orchestrator's ruling `pool-terrain-build`** (fix
    round 3; the fix-round-2 judge: the pool is not in `src/`, so grading it binds world-ground to
    ship it). The gate reads the ruling from a marker in `docs/ROUND5-PLAN.md`
    (`<!-- r5-ruling pool-terrain-build=accepted -->` or `=rejected`):
    - *accepted*: the pool, counted only when `compareBuilds` finds its output bit-identical to
      the constructor's at that size (position, normal, uv, colour, index, H, HS, the three masks
      and the three detail bakes through 32-bit views — 12,891,333 values at 1024 m — plus 11
      sampling parameters of each texture); otherwise the single thread;
    - *rejected*: the single-thread build;
    - *unruled* (today): the single-thread build can pass; a build that passes only on the pool is
      **PENDING (ruling)**; red on both is red. The decision is computed under both rulings
      (`decision.byRuling`), so one quiet run answers either way.
  - If a span's per-sample height cost comes out below today's own, the shortfall × vertices is
    added back on either path, so the graded recipe never costs less per sample than today's.
  - Candidates: 1024 m (686 segs), 860 m (576), 720 m (482), all 1.94 m nodes, span 1.3 × size.
- **Vertex buffers:** the same real mesh (today's layout: position, normal, uv, colour).
- **Navgrid:** the frozen `src/core/nav.js` as Vite serves it, two imports rebound (`PLAY_RADIUS` →
  490 / 412 / 343, so R = 492 / 414 / 345; `riverFactor` → 0), `getHeight` bilinear off a baked
  grid of the stand-in island (`islandHeight`: slopes and blockers only), today's 4,917 Round-4
  colliders stamped. 3 builds per size. Today's analytic `getHeight` is measured beside it.
- **GPU (A9 delta):** the live 720 m mesh against the real 1024 m mesh on the live terrain mesh at
  the pinned spawn vista, DPR 1, 8 ABBA pairs of 1.5 s bursts, median of the per-pair deltas.
- **When a clock counts (QUIET, `tools/gates.r5.engine-gpu.mjs`).** Every clock above is judged
  only when `A-terrain-1024-probe-box` sampled, in node, ≤ 300 s before: 1-min load < 3 and 0 other
  headless Chromes. On top of that:
  - CPU clocks (build, nav): today's own mesh, built 3× before and 3× after every candidate on the
    same page, has its two medians within 10 %; a straddle of the bar is PENDING.
  - A pool clock also needs the **pool witness** (fix round 3): today's own mesh on a cold pool,
    3× before and 3× after the candidates, within 10 %. A single-thread bracket cannot see whether
    the pool kept its 4 cores (the fix-round-2 judge's run read "stable" while the pool ran ≈ 100 ms
    slow).
  - GPU: null frame < 3 ms before and after, burst instability ≤ 1.4 on both arms, ≥ 8 valid pairs,
    per-pair delta IQR < 1.5 ms.
  - Otherwise PENDING, pass or fail — except a **single-thread** CPU FAIL whose every run is over
    bar × 1.37 (the worst calibration drift measured on this box). A pool build is never failed on
    a loud box. No size is ever written from an unjudged term.

### 2.2 Build (port 5251, fix rounds 2 and 3)

Median **bold**, the 3 runs in brackets, ms. Bar 600.

<!-- probe-build-runs:begin -->
| run | box (load / other headless Chromes) | calibration: today's mesh before → after (single thread; **pool witness**, fix round 3) | **1024 m** @ 686 | 860 m @ 576 | 720 m @ 482 |
|---|---|---|---|---|---|
| h1 | 5.82 / 2 | 643.5 → 594.9 (1.082×) | pool **579.2** (730.1 / 579.2 / 557.7) · serial 1072.4 (996.1 / 1072.4 / 1081.7) | pool **634.1** (638.8 / 634.1 / 616.7) · serial 758.6 (759.9 / 758.6 / 735) | pool **398.3** (458.1 / 398.3 / 369.8) · serial 575.7 (575.7 / 568.7 / 634.6) |
| L1 | 4.83 / 2 | 622.2 → 599.8 (1.037×) | pool **568.6** (575.4 / 568.6 / 526.9) · serial 1040.6 (1054.9 / 1040.5 / 1040.6) | pool **471.1** (465.2 / 488.1 / 471.1) · serial 759.7 (761 / 756.8 / 759.7) | pool **421.5** (436.3 / 375 / 421.5) · serial 568.0 (569.4 / 565.7 / 568) |
| L2 | 3.43 / 2 | 622.4 → 599.1 (1.039×) | pool **551.4** (551.4 / 576 / 537.1) · serial 1060.5 (1061.3 / 1060.5 / 1050.8) | pool **467.4** (447.4 / 467.4 / 489.8) · serial 759.0 (757.2 / 759 / 772.2) | pool **376.8** (369.3 / 376.8 / 378.8) · serial 568.7 (568 / 568.7 / 569.9) |
| L3 (fix round 2 final) | 3.1 / 2 | 691.1 → 605.6 (1.141×, unstable) | pool **763.3** (796.4 / 747.2 / 763.3) · serial 1058.5 (1058.5 / 1033.1 / 1070.1) | pool **775.5** (843.2 / 528.8 / 775.5) · serial 773.3 (773.3 / 923.5 / 759) | pool **488** (488 / 530.3 / 481.4) · serial 595.5 (594.4 / 595.5 / 597.9) |
| L4 (fix round 3, 1 warm-up) | 4.86 / 2 | 600 → 567 (1.058×); **pool 514.6 → 389.9 (1.32×, unstable)** | pool **616.1** (592.7 / 616.1 / 647.4) · serial 1019.7 (1019.7 / 1031.5 / 1009.6) | pool **376.8** (376.4 / 428 / 376.8) · serial 725.4 (725.4 / 715.5 / 726.3) | pool **363.4** (363.4 / 398.9 / 313.4) · serial 553 (553 / 546.8 / 553.3) |
| L5 (3 warm-ups) | 5.11 / 1 | 606.7 → 573.7 (1.058×); **pool 498.1 → 387.6 (1.285×, unstable)** | pool **536.9** (526.7 / 594.6 / 536.9) · serial 1014.2 (1031.2 / 1014.1 / 1014.2) | pool **411.3** (411.3 / 408.2 / 425) · serial 728.7 (728.7 / 732.6 / 727.5) | pool **365.3** (365.3 / 355.9 / 369.1) · serial 550.1 (550.1 / 549.2 / 553.5) |
| **L6 (final files: warm-up until steady)** | 3.77 / 1 | 589.6 → 563.2 (1.047×); **pool 371.2 → 374.8 (1.01×, stable)** | pool **464.5** (562.2 / 464.5 / 440.4) · serial 976.7 (976.7 / 978.8 / 961.6) | pool **327.9** (324.7 / 360.8 / 327.9) · serial 708.7 (708.7 / 708 / 711) | pool **295.3** (295.3 / 276.2 / 321.9) · serial 529.8 (528.4 / 531 / 529.8) |
| **Q3p — QUIET BOX, judged (final files)** | **2.33 / 0** | 580.7 → 564.4 (**1.029×**, stable); **pool 347.7 → 382.0 (1.099×, stable)** | pool **448.0** (431.5 / 460.2 / 448) **PASS** · serial **964.3** (960.9 / 968.7 / 964.3) **FAIL** | pool **355.6** (377.1 / 322.2 / 355.6) **PASS** · serial **712.8** (712.8 / 715.6 / 711.4) **FAIL** | pool **274.5** (273.5 / 294.6 / 274.5) **PASS** · serial **531.7** (531.1 / 531.7 / 534.1) **PASS** |
| **Q4p — quiet** | **2.59 / 0** | 588.9 → 572.7 (1.028×, stable); **pool 371.2 → 329.9 (1.125×, UNSTABLE → pool terms PENDING)** | pool 481.7 (481.7 / 482.6 / 461.5) PENDING · serial **979.4** (979.2 / 986.7 / 979.4) **FAIL** | pool 383.7 (375.3 / 383.7 / 388.4) PENDING · serial **723.7** (726 / 723.7 / 723.7) **FAIL** | pool 331.0 (327.9 / 331.8 / 331) PENDING · serial **544.8** (543.2 / 546.9 / 544.8) **PASS** |
| **Q5p — quiet** | **2.67 / 0** | 583.7 → 566.9 (1.03×); **pool 332.2 → 325.7 (1.02×)**, both stable | pool **456.0** (430.6 / 456 / 461.1) **PASS** · serial **974.2** (968.6 / 974.2 / 978.6) **FAIL** | pool **359.2** (364.3 / 350.6 / 359.2) **PASS** · serial **719.6** (717.4 / 720.3 / 719.6) **FAIL** | pool **276.0** (276 / 279.4 / 272.2) **PASS** · serial **536.6** (535 / 536.6 / 538.7) **PASS** |
| **Q6p — quiet** | **1.49 / 0** | 583.5 → 567.5 (1.028×); **pool 336.7 → 327.0 (1.03×)**, both stable | pool **517.5** (517.5 / 544.1 / 510.3) **PASS** · serial **979.9** (966.7 / 981.1 / 979.9) **FAIL** | pool **366.9** (579.1 / 342.8 / 366.9) **PASS** · serial **723.7** (723.7 / 736.9 / 714.7) **FAIL** | pool **272.3** (272.3 / 292 / 269.8) **PASS** · serial **534.5** (533 / 534.5 / 536.3) **PASS** |
<!-- probe-build-runs:end -->

**The quiet-box verdicts agree in all four quiet runs (Q3p–Q6p, load 1.49–2.59, 0 other headless
Chromes, single-thread bracket 1.028–1.03×).** Single thread: 1024 m FAIL (960.9–986.7 ms), 860 m
FAIL (711.4–736.9), 720 m PASS (531.1–546.9). Pool, where its witness held (Q3p, Q5p, Q6p): PASS at
every size (1024 m 430.6–544.1 ms). In Q4p the pool witness read 1.125× and the pool terms stayed
PENDING.

Every pool build in every run was bit-identical to the constructor at its size (12,891,333 /
10,250,893 / 8,358,861 values). Graded runs include the per-sample add-back (≤ 6.3 ms, 720 m only).

**The pool witness (fix round 3)** caught what the single-thread bracket could not: in L4 and L5 the
single-thread bracket read 1.058× ("stable") while the pool's own before/after read 1.32× and 1.285×.
Both had the witnesses' *before* builds slower than their *after* builds, which is either box load or
warm-up. The final file warms each path until two consecutive builds agree within 10 % (L6: serial
675.9 / 629.4 / 577.4, pool 529.3 / 387.2 / 332.5 / 326.6) and records it, so the brackets measure
the box; in L6 both brackets were stable (1.047× and 1.01×). Only a quiet run judges anything.

h1 and L1 ran the pool without the interleave and the heap settle (each size's 3 serial builds ran
first, and the first pool build after them paid for their garbage: 730 / 639 / 458 ms); L2 and
L3 are fix round 2's final protocol; L4–L6 add the pool witness, L6 the steady warm-up.

**L3 shows how much the pool depends on free cores.** An instruments-core judge's full suite started
beside it: the sample read load 3.1, the calibration bracket drifted 1.14× (unstable), and the
1024 m pool read 747–796 ms while the single-thread build read its usual 1033–1070. The pool needs 4
free cores. That is why a pool build is never failed on a loud box, and why its 1024 m verdict
belongs to a quiet run.

**Verdicts on a loud box (h1–L6: load 3.1–5.8, 1–2 other headless Chromes):** every build term
is **PENDING** (the quiet-box verdicts are above and in §2.5). The 1024 m single-thread build is a **FAIL that survives drift** (every run is over
600 × 1.37 = 822 ms: 961.6–1082 ms in seven runs). In fix round 3 the 1024 m build term is PENDING
on two counts even where the pool's runs were all under 600 (L6: 440–562 ms): the box was loud, and
the pool may be graded only under the ruling `pool-terrain-build=accepted`.

Where the time goes (L2, ms):

| pass | serial 1024 m | pool 1024 m (wall clock) |
|---|---|---|
| heights (`getHeight` per vertex) | 417.6 | 279.0 to the last row, **spawn + module import included** |
| filtered field (`_smoothField`, page thread) | 10.9 | 12.4 |
| vertex colours (`_bakeVertexColors`) + rim-widened normals | 303.1 + ≈ 150 (normals + geometry 156.5) | 233.0 for both, in the workers |
| masks (3 × 512²) + detail bakes (3 × 256²) | 85.8 + 82.8 | in the workers, overlapped; 8.9 left to wait for |
| PlaneGeometry arrays | (inside normals + geometry) | 7.6, page thread, overlapped |
| **total** | **1060.5** | **551.4** (worker CPU 1709 ms over 4 workers, 69 jobs) |

| | vertex buffers (position + normal + uv + colour) | index (Uint32) |
|---|---|---|
| 1024 m | **20.77 MB** (5.66 + 5.66 + 3.78 + 5.66) ≤ 24 PASS | 11.29 MB |
| 860 m | 14.65 MB | 7.96 MB |
| 720 m | 10.26 MB | 5.58 MB |

Per-vertex, against the bar (600 ms ÷ vertices; "net" subtracts masks + detail, ≈ 166–169 ms):

| size | vertices | allowed µs/vertex all-in | net of fixed | pool, wall clock: L2 (L3) · L4 / L5 / L6 | single-thread: L2 (L3) · L4 / L5 / L6 |
|---|---|---|---|---|---|
| 1024 m | 471,969 | **1.27** | 0.91 | **1.17** (1.62) · 1.31 / 1.14 / **0.98** | 2.25 (2.24) · 2.16 / 2.15 / 2.07 |
| 860 m | 332,929 | 1.80 | 1.30 | 1.40 (2.33) · 1.13 / 1.24 / 0.98 | 2.28 (2.32) · 2.18 / 2.19 / 2.13 |
| 720 m | 233,289 | 2.57 | 1.86 | 1.62 (2.09) · 1.56 / 1.57 / 1.27 | 2.44 (2.55) · 2.37 / 2.36 / 2.27 |

Fix round 1's serial-only runs (loud box, for the record; none of these verdicts stands under the
quiet rule): 1024 m 972–1180 ms, 860 m 718–831, 720 m 533–631, today's own mesh 576–786.

Normals cost more per vertex at 1331 m than at 972 m because today's stencil widens towards the
rim (≈ 70 % of the bigger span is past the rim radius, 44 % today). The R5 island has no rim massif.

### 2.3 Navgrid (frozen nav.js)

| run | **R 492, N 493, grid** (3 builds) | R 414, N 415 | R 345, N 346 | N 493, today's analytic `getHeight` | N 415 analytic | N 346 analytic | N 493 stand-in analytic (0.35 µs) | N 493, no colliders | **today's nav, N 333, full rebuild** |
|---|---|---|---|---|---|---|---|---|---|
| h1 | **44.6** (47.7 / 44.6 / 39.7) | 44.5 | 43.1 | 357.5 | 334.5 | 330.1 | 219.0 | 9.6 | 235.8 |
| L1 | **43.8** (46.5 / 43.8 / 37.6) | 38.7 | 38.1 | 355.0 | 288.6 | 239.6 | 218.4 | 9.4 | 226.9 |
| L2 | **41.2** (45 / 41.2 / 36) | 36.6 | 36.5 | 348.2 | 296.0 | 236.7 | 215.6 | 9.2 | 227.4 |
| L3 | **43.3** (49.7 / 43.3 / 38.2) | 39.2 | 38.0 | 341.7 | 320.4 | 228.9 | 211.0 | 8.7 | 222.8 |
| L4 | **38.0** (42.2 / 38 / 32.7) | 32.8 | 32.9 | 335.8 | 268.6 | 230.7 | 203.5 | 8.6 | 219.6 |
| L5 | **42.4** (45.5 / 42.4 / 36.4) | 37.3 | 37.2 | 450.6 | 276.7 | 229.5 | 211.0 | 8.8 | 219.6 |
| L6 | **38.9** (62.7 / 38.9 / 33.7) | 34.2 | 34.2 | 441.1 | 268.2 | 225.0 | 204.3 | 8.8 | 227.4 |
| **Q3p (quiet, judged)** | **41.9** (64.7 / 41.9 / 36.8) **PASS** | 37.5 **PASS** | 37.2 **PASS** | 332.2 | 276.1 | 225.6 | 215.4 | 8.8 | 223.3 |
| **Q4p (quiet)** | **42.2** (66.9 / 42.2 / 36.7) **PASS** | 36.7 **PASS** | 36.6 **PASS** | 341.0 | 277.5 | 229.7 | 210.2 | 8.8 | 220.8 |
| **Q5p (quiet)** | **44.1** (67.3 / 44.1 / 39) **PASS** | 39.9 **PASS** | 39.3 **PASS** | 336.3 | 274.6 | 228.0 | 210.3 | 8.9 | 225.1 |
| **Q6p (quiet)** | **43.2** (45.4 / 43.2 / 38.1) **PASS** | 38.7 **PASS** | 38.6 **PASS** | 340.5 | 274.2 | 226.7 | 208.9 | 8.7 | 224.5 |

Bar ≤ 150 ms. On the loud box every nav term is PENDING by rule; all 3 runs at every size read
31–67 ms. Analytic `getHeight` is over the bar at every size, and today's own navgrid (N 333) is
over it already. The stamp phase (colliders → cells, `getHeight` per triangle) is ≈ 80 % of the
grid build.

Paths at R = 492 from Saltrow on the stand-in island: 10 of 18 land sites resolve at nav.js's default
A\* cap of 24,000 expansions, 13 uncapped (N² = 243,049); Jameo, Kiln Yards and Mistfold are
cap-limited; Roques, Rust Cone, Fog Harp, Calibration Yard and the Fundamental sit on > 45° cells of
the stand-in's caldera and cone (a property of the stand-in recipe).

### 2.4 GPU (A9 delta, real 1024 m mesh vs live 720 m mesh)

| run | box | null frame before / after (ms) | median GPU A 720 / B 1024 | per-pair Δ (ms) | median Δ | IQR | instability A / B | verdict |
|---|---|---|---|---|---|---|---|---|
| h1 | 5.82, 2 other | 4.59 / 7.25 | 77.5 / 74.71 | −1.08, 13.81, 0.76, 11.83, 3.35, −7.9, −10.32, −6.65 | −0.16 | 12.43 | 1.26 / 1.38 | PENDING: load, Chromes, null frame, IQR |
| L1 | 4.83, 2 | 6.94 / 4.42 | 90.8 / 82.84 | −17.34, −3.77, 11.27, 0.54, 0.42, 1.42, −31.42, −1.88 | −0.73 | 7.92 | 1.39 / 1.51 | PENDING: load, Chromes, null frame, instability, IQR |
| L2 | 3.43, 2 | 5.31 / 5.24 | 74.33 / 71.99 | 0.75, 0.73, 1.17, −3.65, −4.65, −0.1, −0.34, 4.35 | +0.32 | 2.02 | 1.32 / 1.23 | PENDING: load, Chromes, null frame, IQR |
| L3 | 3.1, 2 | 7.74 / 4.19 | 71.3 / 66.06 | 20, −4.9, −7.66, 25.57, 0.83, −24.82, −0.83, −5.51 | −2.87 | 11.67 | 1.47 / 1.55 | PENDING: load, Chromes, null frame, instability, IQR |
| L4 | 4.86, 2 | 0.54 / 0.5 | 45.04 / 50.02 | 0.45, 37.66, 4.04, −11.82, 5.04, 0.92, 5.67, 8.7 | +4.54 | 5.63 | 2.75 / 2.94 | PENDING: load, Chromes, instability, IQR |
| L5 | 5.11, 1 | 5.36 / 5.08 | 62.18 / 61.28 | −9.55, −3.13, −0.58, −1.47, 0.51, 0.63, 0.08, 0.41 | −0.25 | 2.32 | 1.20 / 1.14 | PENDING: load, Chrome, null frame, IQR |
| L6 | 3.77, 1 | 0.54 / 0.38 | 22.36 / 31.64 | 1.91, 15.68, 1.15, 5.57, 18.76, −8.32, 25.56, 13.09 | +9.33 | 14.73 | 1.71 / 2.67 | PENDING: load, Chrome, instability, IQR |
| **Q3p** | **2.33, 0 (quiet)** | 0.51 / 0.38 | 32.58 / 22.42 | −27.57, 1.07, 5.42, −9.74, −13.07, −9.2, −20.29, −7.64 | −9.47 | 9.41 | 2.72 / 2.26 | **PENDING: instability, IQR** (the box and null frame were quiet) |
| **Q4p** | 2.59, 0 (quiet) | **10.06** / 0.57 | 67.47 / 66.34 | 2.9, 45.17, −5.5, 5.76, 1.63, −2.38, 4.2, 1.65 | +2.28 | 3.96 | 3.88 / 1.25 | PENDING: null frame, instability, IQR |
| **Q5p** | **2.67, 0 (quiet)** | 0.91 / 0.79 | 19.12 / 19.27 | 0.45, −0.34, 0.36, 0.09, 0.99, −0.16, 2.18, −0.27 | **+0.23** | **0.77** | 1.23 / 1.20 | **PASS (judged)** |
| **Q6p** | **1.49, 0 (quiet)** | 0.63 / 0.77 | 18.94 / 19.26 | 1.93, 0.64, −0.02, 0.16, 0.72, 0.23, 0.13, −3.68 | **+0.20** | **0.57** | 1.23 / 1.10 | **PASS (judged)** |

**Judged twice on a quiet box: +0.23 ms (IQR 0.77) and +0.20 ms (IQR 0.57), both PASS against
+1.5.** The 1024 m mesh adds 0.43 M triangles at this vista and costs ≈ 0.2 ms of GPU. On a quiet
CPU the GPU still has slow states: in Q3p and Q4p the 1.5 s burst medians of an unchanged mesh swung
between ≈ 19 and ≈ 70 ms (Q4p's null frame read 10.06 ms before the pairs). The probe's GPU witnesses
(null frame, burst instability ≤ 1.4, IQR < 1.5) refused to judge those runs, as they should. The
unjudged medians of the loud runs (−2.87 … +9.33 ms, and the fix-round-1/2 judges' +1.66 / +1.79)
were the box, not the mesh. 317–319 draws in both arms;
the 1024 m mesh adds 0.44 M triangles at this vista.

### 2.5 Decision

**Quiet box, judged (Q5p and Q6p, final files; load 2.67 / 1.49, 0 other headless Chromes, every
witness stable).** Both runs give the same table:

| term | 1024 m | 860 m | 720 m |
|---|---|---|---|
| build, **single-thread** (today's `src/`) | **FAIL** (968.6–981.1) | **FAIL** (714.7–736.9) | **PASS** (533–538.7) |
| build, **pool** (bit-identical; witness 1.02× / 1.03×) | **PASS** (430.6–544.1) | **PASS** (342.8–579.1) | **PASS** (269.8–292) |
| vertex buffers ≤ 24 MB | PASS 20.77 | PASS 14.65 | PASS 10.26 |
| A9 GPU delta ≤ +1.5 ms | **PASS** +0.23 (IQR 0.77) / +0.20 (IQR 0.57) | PASS (implied by 1024) | PASS (implied by 1024) |
| nav ≤ 150 ms, getHeight off the grid | **PASS** 44.1 / 43.2 | PASS 39.9 / 38.7 | PASS 39.3 / 38.6 |
| navgrid N | PASS 493 | PASS 415 | PASS 346 |

**The W1 size, by ruling (`decision.byRuling`, identical in Q5p and Q6p):**

| `pool-terrain-build` | W1 size | PLAY_RADIUS | MESH_SEGS | nav R | binding conditions (§2.6) |
|---|---|---|---|---|---|
| **accepted** | **1024 m** | 490 | 686 | 492 | `getHeight-from-baked-grid`, `build-per-vertex-budget`, `pool-terrain-build` |
| **rejected** | **720 m** | 343 | 482 | 345 | `getHeight-from-baked-grid`, `build-per-vertex-budget` (1024 m and 860 m are red on the single-thread build term only) |

**The gate reads PENDING, and its `decision.worldSize` is null, until the orchestrator rules.**
Unruled, the 1024 m build term passes only on the pool, so it is PENDING (ruling). The two rulings
give different sizes, so no size is written. Once the plan carries
`<!-- r5-ruling pool-terrain-build=accepted -->` (or `=rejected`) on its own line, a quiet re-run
grades the same terms under that ruling. With Q5p/Q6p's measurements, *accepted* reads **PASS** and
writes 1024 m. *Rejected* reads **FAIL** at 1024 m (the single-thread build) and writes 720 m and
its PLAY_RADIUS: the plan's "else the fallback size … written into the report" clause. The other two quiet runs agree on every judged term.
Q3p left the GPU unjudged (burst instability 2.72). Q4p left the GPU and the pool unjudged (null frame
10.06 ms, pool witness 1.125×).

Loud-box runs (fix round 2 h1–L3, fix round 3 L4–L6: load 3.1–5.8, 1–2 other Chromes) judged
nothing, as the rule requires. Their ranges are in §2.2–§2.4.

### 2.6 The W1 conditions (world-ground; text for the orchestrator to put into the W1 brief, `A-world-size`, `A-reach-all-sites`)

1. **Binding: `terrain.getHeight` is served bilinear from the baked height grid.** Frozen nav.js calls
   `getHeight` once per cell and once per stamped collider triangle.
   - At N = 493 the grid takes 33–63 ms (fix round 3), 36–48 ms (fix round 2), 48–68 ms (fix round 1).
   - Today's analytic recipe (0.79–0.83 µs per call) takes 336–451 ms, the 0.35 µs stand-in
     204–218 ms. Both are over the 150 ms bar, at every size (analytic 860 m 268–335, 720 m 224–330).
   - **Today's own nav is already over the bar:** a full rebuild at N = 333 takes 220–237 ms.
     `A-reach-all-sites`' "nav build ≤ 150 ms" is red on today's code before any world change; the
     orchestrator rules how that clause is graded at the W0 exits.

   Proposed text: *"`terrain.getHeight(x, z)` returns the bilinear sample of the baked height grid
   (the grid `heightFast` reads); the analytic recipe is evaluated only by the bake. `A-world-size`
   and `A-reach-all-sites` measure the nav build with the shipped `getHeight`."*
2. **Binding: the build's per-vertex wall-clock budget** (§2.2): ≤ 1.27 µs/vertex all-in at 1024 m,
   1.80 at 860 m, 2.57 at 720 m. `A-world-size` re-grades "terrain build ≤ 600 ms" on
   world-ground's real build.
3. **The pool build — binding only if the orchestrator accepts it (`pool-terrain-build`).** Today's
   code meets the 1024 m budget only on the pool (unjudged wall clock: 1.14–1.31 µs/vertex in fix
   round 3's loud runs against 1.27) and misses it single-threaded on any box (2.16–2.25). The
   fix-round-2 judge's point stands: grading the pool grades an object that is not in `src/` and
   creates a cross-lane obligation, so the gate no longer does it on its own. Until the ruling, a
   pool-only pass is PENDING and the decision reports the size under both rulings. If accepted,
   proposed text: *"The terrain build runs its per-sample passes (heights, vertex colours, normals,
   masks, detail bakes) on a worker pool spawned for the build and terminated after it, producing
   output bit-identical to the single-thread build (reference: `parallelBuild` and `compareBuilds`
   in `tools/r5-probes/terrain1024.js`); or the single-thread build meets the per-vertex budget on
   its own. `A-world-size` times the shipped path cold, pool spawn included, inside the real boot."*
   What it needs from the terrain module, which today's module already satisfies: the per-sample
   functions are pure functions of (x, z) and module state built deterministically at import
   (`bareTerrain()`), and nothing in the build touches the DOM. If rejected: the single-thread
   per-vertex budget of the chosen size binds, and 1024 m is out on today's code.
4. **Long nav paths pass `{ maxExpansions }`.** nav.js is frozen and its default cap (24,000) is too
   small at N = 493.
5. **Drop the terrain `uv` attribute.** The shader never reads it; 3.78 MB at 1024 m.

---

## 3. The GPU tier (W0b decision; gates `A-gpu-tier`, `A-rt-ledger`, `A22-msaa`, `V20`, `A108`, `A109`, `V33b`, `V-gpu-tier-look`)

### 3.1 The decision (W0b, fix rounds 1 and 2)

The shipped default tier is `high` (`DEFAULT_TIER` in `src/core/engine.js`; the game boots it unless
`?q=` says otherwise, and the Pans POC asks for it by name). Round 0 of W0b put in the plan's three
levers and two render-target levers; the judges then measured the Pans vista at 16.05 / 17.27 ms against
the 13 ms bar. Fix round 1 added four more, all inside the engine grant (post chain, tier table); fix round 2
(Oct 22) split the anisotropy cap by texture role, because 2× on every texture took the salt pan's crust with it:

| lever | Round-4 `high` | shipped `high` | what it buys (measured, §3.2–§3.4) |
|---|---|---|---|
| DPR cap (plan lever 1) | 1.5 | **1.25** | pixel count ×0.69 |
| GTAO resolution (plan lever 2) | ½ per axis | **¼ per axis** (500 × 281 at DPR 1.25) | −10.1 MB; AO pass ×¼ |
| AA (plan lever 3, R25) | MSAA ×4 + SMAA | **SMAA only** | −108 MB of MSAA buffers and the resolve |
| SMAA edge / weight targets | RGBA16F | **RGBA8** | −18 MB |
| CSM cascade maps (cap in `enableCSM`) | 3 × 2048² | **2048 + 2 × 1024** | −50.3 MB; A56's near texel unchanged |
| **post topology** (fix round 1; follows MSAA 0) | resolve copy into a HalfFloat `renderTarget2`, ping-pong with `postTarget` | **direct**: the scene target is the composer's read buffer (no copy); `renderTarget2` holds only the grade's output as RGBA8; `postTarget` released until a pass after the grade needs it | −1 full-resolution HalfFloat pass; −27 MB; pixel-identical by itself (§3.8) |
| **`postFold`** (fix round 1) | GTAO's multiply and bloom's composite are two full-resolution in-place blends | **both done inside the grade pass** (the bright pass applies the AO it used to read) | −2 full-resolution read-modify-write passes; empty frame 6.3 → 4.85 ms |
| **`csmFarCadence`** (fix round 1) | every cascade every frame | **cascade 0 every frame; cascades 1 and 2 on alternate frames** | one 1024² shadow render per frame fewer; vista 49 → 41 draws |
| **`maxAnisotropy`** (fix round 1) / **`maxAnisotropyData`** (fix round 2) | as authored (the POC ground asks 8×) | **colour (sRGB) textures 2×, data textures (normal, rough / AO maps) 4×** | the lever that moves the vista, and the role split that keeps the far relief: §3.4 |

`ultra` keeps MSAA ×4 + SMAA HalfFloat, full-res GTAO, DPR cap 2, 3 × 2048, every cascade every frame and
anisotropy as authored. `medium` (2× / 2×) and `low` (1× / 1×) are SMAA-only, folded, cadence 2.

**What it costs the picture** (filmed for the judge in `V-gpu-tier-look`, fix round 2 layout: 1 Round 4's
`high` | 2 the shipped levers with anisotropy as authored | 3 NOT shipped: fix round 1's 2× on every texture |
4 the SHIPPED `high`; my reading in the lane report): everything but the far ground is the same picture (§3.8:
the topology and the cadence move 0 pixels on static frames; the fold and the RGBA8 SMAA input move 2–7 % of
channels by one level and ≤ 0.03 % by more, on near-threshold SMAA edges). The far ground is softer: DPR 1.25
against 1.5 (plan lever 1) costs some of the salt-pan crust's sharpness everywhere. Fix round 1's 2× on every
texture cost most of what was left (crop 3: the crust's polygon pattern becomes faint horizontal streaks, the
dune ripples nearly go); with the data textures at 4× (fix round 2, crop 4) the crust and the ripples stay, as a
softer version of crop 2 (§3.4).

<!-- gpu-tier:begin -->
Shipped default tier, as `A-gpu-tier` compares it with the live `QUALITY_TIERS.high` (before/after numbers
in §3.2–§3.4):

tier-row: `{"dprCap":1.25,"msaa":0,"gtao":true,"gtaoScale":0.25,"smaa":true,"smaaHalfFloat":false,"csmMapCaps":[2048,1024],"postFold":true,"csmFarCadence":2,"maxAnisotropy":2,"maxAnisotropyData":4}`

Before: Round-4 `high` `{"dprCap":1.5,"msaa":4,"gtao":true,"gtaoScale":0.5,"smaa":true,"smaaHalfFloat":true,"csmMapCaps":null,"postFold":false,"csmFarCadence":1,"maxAnisotropy":null,"maxAnisotropyData":null}`.
After: the row above.
<!-- gpu-tier:end -->

New engine API (engine grant: post / tiers / DPR):

```js
QUALITY_TIERS.<tier>.smaaHalfFloat: boolean      // false: SMAA edge + weight targets RGBA8
QUALITY_TIERS.<tier>.csmMapCaps: number[] | null // cascade i's map = min(requested, caps[min(i, last)])
QUALITY_TIERS.<tier>.postFold: boolean           // GTAO multiply + bloom composite inside the grade pass
QUALITY_TIERS.<tier>.csmFarCadence: number       // cascades >= 1 render when (frame + i) % n === 0; 1 = every frame
QUALITY_TIERS.<tier>.maxAnisotropy: number|null  // cap on COLOUR (sRGB) textures' anisotropic filtering; null = GPU max
QUALITY_TIERS.<tier>.maxAnisotropyData: number|null|undefined // cap on DATA textures (normal, rough/AO); undefined = colour cap
DEFAULT_TIER: 'high'                             // what a fresh boot uses
ROUND4_HIGH                                      // frozen Round-4 `high` row (before/after measurement only)
engine.applyTier(row, name = 'custom') → name    // setQuality's body: every lever, targets rebuilt in place
engine.csmMapSizes: number[] | null              // per-cascade map sizes in force
engine.postDirect: boolean                       // the direct topology is in force (scene target has no MSAA)
engine.anisotropyCap: number                     // the colour-texture cap in force
engine.anisotropyCapData: number                 // the data-texture cap in force
engine.tier                                      // a per-engine COPY of the row
engine.grade.uniforms.{tAO, uAOMix, tBloom, uBloomOn}   // the folded inputs, re-armed every frame by GTAO / bloom
```

How the levers are wired (all on demand or per frame without allocation):
- **Direct topology.** `engine.render()` seats `composer.readBuffer = sceneTarget`, `writeBuffer = renderTarget2`
  when the scene target has no samples; `ScenePass` skips its copy when the read buffer is the scene target.
  `composer.swapBuffers` is replaced by one that never hands the scene target out as a write buffer (it carries
  the depth texture GTAO and the studio pass sample), so after the grade's swap the pair is
  `renderTarget2 ↔ postTarget` as before. `_applyPostTopology()` runs on every tier change.
- **Fold.** `_postFold()` is true when the tier asks for it and the grade pass is enabled; otherwise GTAO and
  bloom blend in place exactly as in Round 4 (a probe that disables the grade still gets AO and bloom). The
  grade shader applies `src.rgb *= mix(1, ao.rgb, uAOMix); src.a *= ao.a` then `src.rgb += bloom.rgb ·
  bloom.a; src.a += bloom.a²` — GTAOBlendShader's DstColor×Zero blend and the CopyShader SrcAlpha×One blend,
  in that order. The patch anchors in three's high-pass shader are checked; if they move, folding is off.
- **Cadence.** `_csmUpdate()` sets `shadow.autoUpdate = false` on cascades ≥ 1 and `needsUpdate` on their
  frames; a cascade that skips keeps both its map and its shadow matrix from the frame it rendered (three
  updates both only when it renders), so receivers stay registered; a missing map renders at once.
- **Anisotropy, by role.** three clamps each texture's `anisotropy` by `capabilities.getMaxAnisotropy()` at
  upload (one global value). The engine answers that call with the HIGHER role cap (4×) and lowers the other
  role's textures (at `high`, the sRGB colour textures, to 2×) itself, with one `texParameterf` on the GL texture
  three made, under the conditions three applies anisotropy (mipmapped linear minification, non-nearest
  magnification), bound through three's state cache (`_anisoRoles`, top of `render()`): per frame one integer
  compare (the renderer's texture count) plus a version check of the tracked textures (three re-applies the
  global cap on every re-upload; the engine re-lowers it the next frame); a scene sweep (materials' texture
  slots and program uniforms, once per material) only when the texture count moves. On a cap change the scene's
  textures that ask for more than 1× are re-uploaded once. Verified on the GL side (`X-role2-check`: every POC
  texture's `TEXTURE_MAX_ANISOTROPY` equals its role cap through 2/4, 4/2, 2/2, 1/4, 4/4, after a forced
  re-upload, and back). Role rule: colour = `colorSpace === SRGBColorSpace`; data = every other texture.

### 3.2 Render targets, before → after (`A-rt-ledger`, measured live on the staged fight)

Each row applies the tier row with `engine.applyTier` on the same staged frame, DPR = min(2, cap), then
reads `engine.renderTargetLedger()`; the shipped tier is restored to the byte afterwards.

<!-- rt-levers:begin -->
| configuration | DPR | RT MB | margin to 170 | scene / shadow / SMAA / GTAO MB |
|---|---|---|---|---|
| Round-4 `high` | 1.5 | 437.75 | −267.75 | 194.4 / 100.66 / 51.84 / 19.44 |
| Round-4 `high` at the 1.25 cap | 1.25 | 340.74 | −170.74 | 135 / 100.66 / 36 / 13.51 |
| + SMAA-only (MSAA 0; direct topology: `renderTarget2` RGBA8, `postTarget` released) | 1.25 | 205.74 | −35.74 | 27 / 100.66 / 36 / 13.51 |
| + GTAO quarter-res | 1.25 | 195.60 | −25.60 | 27 / 100.66 / 36 / 3.37 |
| + SMAA targets RGBA8 | 1.25 | 177.60 | −7.60 | 27 / 100.66 / 18 / 3.37 |
| **+ far cascades capped = shipped `high`** (fold, cadence and anisotropy move no target) | 1.25 | **127.27** | **+42.73** | 27 / 50.33 / 18 / 3.37 |
| alternative: shipped with GTAO ½ | 1.25 | 137.41 | +32.59 | 27 / 50.33 / 18 / 13.51 |
| alternative: shipped with CSM 3 × 1536 | 1.25 | 133.56 | +36.44 | 27 / 56.62 / 18 / 3.37 |
<!-- rt-levers:end -->

Staged fight, shipped tier (`A-rt-ledger` second clause, the W0a census arithmetic): textures **100.28 MB**
(87 uploaded) + geometry **114.90 MB** (1,707 buffers) + render targets **127.27 MB** = **342.45 MB ≤ 450**
(W0b round 0: 369.45; W0a: 891.87). GL recount (`A-rt-ledger-census`): 127,271,712 B, equal to the ledger
to the byte, 21 live framebuffers, 39 GL objects, 0 unattributed.

### 3.3 The GPU and frame time (`A-gpu-tier`, Pans POC, quiet box only)

**Instrument (unchanged from round 0).** The Pans POC (`?poc=biome`) is hosted in a same-origin iframe the
size of the viewport after the game's own frame loop is stopped (one GPU client measured); the shipped tier
is applied with `engine.applyTier` and DPR = min(2, cap) = 1.25 (2000 × 1125 device px). Empty frame = sky +
the whole post chain (every other POC group hidden); vista = the POC's `vista` view. 4 rounds × (vista 2 s,
empty 2 s), GPU time from `EXT_disjoint_timer_query` (`engine.perfSnapshot`), frame intervals from the POC
loop's own `_recordFrame` ring. Judged only with the box witness quiet (load < 3, 0 other headless Chromes),
null frame < 3 ms before and after, burst instability ≤ 1.4. Bars unchanged: empty ≤ 7 ms, vista ≤ 13 ms,
median ≥ 58 fps, p95 ≤ 20 ms.

**Judged results, fix round 1 (shipped `high`, DPR 1.25):**

| run | box at start: load, other headless Chromes | other gate Chromes seen DURING the run (my 2 s monitor) | verdict | vista GPU, 4 bursts → median (bar 13) | empty median (bar 7) | median fps (≥ 58) | p95 ms (≤ 20) | null frame; instability | A9 in the same run |
|---|---|---|---|---|---|---|---|---|---|
| G1 | 1.34, 0 | 1 (load max 2.38) | PASS | 10.1 / 10.04 / 10.46 / 12.8 → **10.28** | 4.83 | 59.88 | 18.5 | 0.22 / 0.21; 1.275 / 1.012 | — |
| QJ1-0944 | 2.75, 0 | 1 (load max 4.54) | PASS | 10.07 / 12.78 / 13.62 / 10.46 → **11.62** | 4.87 | 60.24 | 18.7 | 0.21 / 0.16; 1.353 / 1.031 | 58 fps / 17.74 ms |
| QJ2-0946 | 2.85, 0 | 2 (load max 4.31) | PASS | 12.64 / 10.09 / 12.3 / 10.17 → **11.23** | 4.85 | 59.88 | 18.7 | 0.21 / 0.2; 1.253 / 1.008 | 58.8 fps / 18.59 ms |

Every judged run PASSES every term. Honest caveat: my in-run monitor saw another lane's gate Chrome alive at some point in every one of these runs (column 3); the gate's own witness samples the box only at its start. Another process on the GPU tends to raise the GPU clock and LOWER this timer's reading (§3.4), so these are not the strongest possible evidence; the clean exploration runs agree (X-sim9: 10.08–10.22 ms at the shipped levers; X-sim8: 11.91).

**Before → after, lever by lever** (the same page, 2 rounds of 1.5 s each, vista / empty GPU median ms;
run G1):

| configuration | DPR | RT MB | G1: vista / empty |
|---|---|---|---|
| Round-4 high (DPR 1.5, MSAA x4, GTAO 1/2, SMAA HalfFloat, CSM 3 x 2048, in-place GTAO + bloom blends, every cascade every frame, anisotropy as authored) | 1.5 | 437.75 | 21.71 / 12.76 (21.64 , 21.78) |
| lever 1: DPR cap 1.25 | 1.25 | 340.74 | 18.02 / 13.04 (17.9 , 18.14) |
| lever 2: + GTAO quarter-res | 1.25 | 330.6 | 17.2 / 9.81 (17.85 , 16.55) |
| lever 3: + SMAA-only (MSAA 0: the scene target is read directly, no resolve copy; grade output RGBA8) | 1.25 | 195.6 | 20.14 / 5.11 (15.65 , 24.62) |
| lever 4: + SMAA targets RGBA8, far cascades capped at 1024 (W0b fix round 0 = its shipped row) | 1.25 | 127.27 | 19.77 / 4.59 (20.11 , 19.42) |
| lever 5: + GTAO multiply and bloom composite folded into the grade pass | 1.25 | 127.27 | 17.42 / 4.96 (18.28 , 16.56) |
| lever 6: + far cascades rendered on alternate frames | 1.25 | 127.27 | 17.33 / 4.83 (16.92 , 17.73) |
| lever 7: + anisotropic filtering capped at 2 = shipped high | 1.25 | 127.27 | 11.41 / 4.86 (12.85 , 9.96) |
| NOT shipped: shipped row with the anisotropy cap at 4 | 1.25 | 127.27 | 15.34 / 4.87 (15.83 , 14.85) |

The chain is the record the plan asks for, not a grade: each row is two 1.5 s bursts and, as §3.4 shows, the
timer's reading for one configuration can move by several ms between bursts when the GPU changes clock
state. Read the rows that matter against the judged runs above: the shipped row reads like the judged runs
(10.18–11.41 in G1, QJ1, QJ2), and the anisotropy-4 row (NOT shipped) is over the bar in every judged run
(15.03–16.41; one unjudged run on a loud box read 12.77 — another process on the GPU raises the clock and
lowers the reading, §3.4).

### 3.4 What this GPU timer measures, and why the anisotropy cap (split by role) is the lever

**Calibration (`X-cal`, quiet box apart from one late Chrome).** An extra full-screen ALU pass of n loop
iterations inserted into the timed composer on the empty frame (2000 × 1125, RGBA8 target):

| n (ascending) | 0 | 2 | 4 | 8 | 14 | 18 | **22** | 27 | 33 | **40** | 48 | **58** | 70 | 85 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reading ms | 4.88 | 5.31 | 5.75 | 6.65 | 8.17 | 9.57 | **6.20** | 7.23 | 8.42 | **14.12** | 16.31 | **11.76** | 10.59 | 12.16 |
| n (descending) | 70 | 58 | 48 | 40 | 33 | 27 | 22 | 18 | 14 | 11 | 8 | 4 | 0 | |
| reading ms | 12.58 | 11.39 | 10.43 | 9.20 | 12.86 | 7.40 | 7.44 | 9.42 | 8.28 | 7.61 | 6.72 | 6.05 | 4.77 | |

48 extra tiny render passes (64 × 64) read 4.75 ms: pass count costs nothing. The reading is linear in the
work only inside one GPU clock state (0.22–0.26 ms per iteration), drops when the GPU's governor steps the
clock up (n = 22, 58), rises when it steps down (n = 40), and has hysteresis (n = 33 reads 8.42 going up,
12.86 coming down). At 60 Hz the governor keeps the clock as low as still meets the frame. So the bar reads:
*the frame fits in the clock state the governor picks, with ≤ 13 ms of the 16.7 ms used*. It also means
removing work can RAISE the reading: on the vista at anisotropy 2, hiding the vegetation read 15.44 ms
against 10.20 with it, in the same clean run (`X-sim9`). Each lever below was therefore judged on the
gate's own measurement, interleaved, on quiet boxes, never on one reading.

**The vista's cost is the POC ground's anisotropic texture fetches.** The ground material samples 11
textures per pixel (sand, salt and a triplanar rock evaluated everywhere, each with a normal map), all at 8×
anisotropic filtering, across a frame whose lower half is ground at grazing angles. Clean interleaved run
(`X-sim8`, 0 other Chromes, load ≤ 2.0, 4 bursts of 2 s each, all post-chain levers in):

| anisotropy (colour / normal maps) | 8 / 8 (as authored) | 4 / 4 | 3 / 3 | **2 / 2** | 4 / 2 | 8 / 2 | 4 / 1 |
|---|---|---|---|---|---|---|---|
| vista GPU median ms | 16.73 | 15.16 | 14.67 | **11.91** | 10.96 | 15.04 | 12.89 |

`X-sim9` (clean) read the shipped 2× vista at 10.08–10.22 in four bursts. With the post chain alone (fold,
direct topology, cadence) and 8× the vista stays at 16.2–17.8 ms in every run; nothing else the engine owns
reaches it (measured at 2×, same run: shadows off −0.3 ms, SMAA off +0.2, GTAO off −0.8).

**Where the crust lives, and the role split (fix round 2).** Filmed per role at DPR 1.25 on
`V-gpu-tier-look`'s crop (fix round 1: `X-film-role`, `X-film-role4`; fix round 2: `X-role-film` by setting
each texture's `anisotropy`, `X-role2-film` through the engine's tier row): the far salt crust and the dune
ripples are drawn by the ground's DATA textures (the normal + rough/AO packs) — colour 8× with data 1× loses
them; colour 2× or 1× with data 4× keeps them, close to 4× / 4×; 2× / 2× (fix round 1's shipped row) turns the
crust into horizontal streaks. And the colour fetches cost more than their count suggests: fix round 1's
`S11-1` (one other gate Chrome) read colour 2× / data 8× 16.14 ms but colour 1× / data 8× 13.73, colour 2× /
data 4× 12.02, 2× everywhere 11.05; `X-sim8` (clean) read colour 4× / data 2× at 10.96 against 4× / 4× at 15.16.
(Why sRGB fetches cost more is not measured here; a likely reason is per-tap sRGB decode.) So fix round 2 splits
the cap: `maxAnisotropy` (colour, sRGB) and `maxAnisotropyData` (everything else), shipped 2× / 4×. three clamps
globally, so the engine lowers the colour textures itself after three's upload (§3.1 "Anisotropy, by role";
fix round 1 had tried a per-texture hook on three's `Texture` and taken it out; this one sits on the GL texture
three made and three's state cache, and `X-role2-check` reads every POC texture's `TEXTURE_MAX_ANISOTROPY` back
through six cap changes and a forced re-upload).

<!-- XROLE -->

**At W1 this is re-graded on the real Pans** (`A-gpu-tier` re-runs at `gatePlaces.vistas.pans`, plan §6):
plan §4.3 holds world-ground's shader to ≤ 3 layers per pixel with triplanar on slopes only, about half the
POC's fetches. The chain's "4× / 4×" row is the number to watch: when the real Pans read it ≤ 13 ms, `high`
should go back to 4× on every texture.

### 3.5 Earlier baselines (W0a, game spawn vista, Round-4 content)

| DPR (Round-4 tier `high`, DRS off) | median GPU ms | p95 GPU ms | fps |
|---|---|---|---|
| 1.0 | 19.4 | 21.0 | 60 |
| 1.25 | 26.1 | 29.8 | 60 |
| 1.5 (Round-4 cap) | 48.4 | 49.4 | 48.7 |

W0a fix round 3, quiet box: A9 (DPR 1) 19.43–19.67 ms GPU, 48.6–52.2 fps; A21 `capped` (DPR 1.5)
50.06 ms; A21 `rawDpr2` 78.7 ms. Read with §3.4: those GPU readings are clock-state readings too.

### 3.6 GTAO at quarter resolution: the lattice fix generalised (A108, A109, V33b)

Round 4's fix fetched the centre depth at `floor(uv · depthSize − 0.25 · k)` (k = depth px per AO px):
k·i + 0.25 at k = 1 and k·i + 0.5 at k = 2, both mid-texel. At the shipped k = 4 that is k·i + 1.0, a
texel boundary, so float rounding picks 4i or 4i + 1. Because Round 4 rebuilds the position at whichever
texel it fetched, that is a one-depth-texel jitter of the sample point, not the Round-4 depth/position
mismatch — and the negative control confirms it: **A108 with Round 4's formula at the shipped tier reads
the same as with the new one** (worst peak 0.134 vs 0.135, every crop within 0.005;
`X-a108-r4-formula-control`). The texel is now taken from the AO texel's own index,
`floor((floor(uv · resolution) + 0.125) · k)`: the same texel as Round 4 at k = 1 (i) and k = 2 (2i),
mid-texel at k = 4 (4i + 0.5). A determinism change, not a defect fix; stated as such.

Round 0 made GTAO multiply its AO into the frame in place (one full-resolution pass instead of a copy and a
blend; pixel-identical on 6 frames, `X-gtao-inplace`). Fix round 1 folds even that blend into the grade pass
(§3.1, `postFold`); the AO texture, its resolution, its fade and the lattice fix are unchanged, and A108,
A109 and V33b re-ran on the folded chain (§3.9).

`A108` on the Pans POC (Round 4's instrument and rule: 256² device-px crops, high-passed 2-D
autocorrelation, strongest local peak at lags 2–32 px, bar 0.15, the GTAO-off control must be clean): crops
chosen by a survey of 135 positions × 4 frames × 4 configurations (`scratchpad/r5/engine-gpu/explore/crops.json`),
keeping those whose control is below the bar in all four; grass crops excluded as Round 4 excluded its
meadow (grass blades darkened by real contact AO read as vertical structure, not a screen-locked grid).
**Sensitivity witness:** with the 60–120 m fade the graded far crops carry almost no AO, so A108 also swaps
the stock three r169 centre sample (the Round-4 lattice itself) back in at the shipped tier, DPR 1, on two
near dune-grass crops, and requires it to raise a peak ≥ 0.15 there while the shipped shader stays under;
if it does not, the gate fails as blind.

`A109` on the POC (Round 4's instrument: view distance in the AO target's alpha for the read, occlusion =
mean(1 − ao) per distance bin, ≥ 500 texels per bin, 4–6 m occlusion ≥ 0.05): near bins from a 2 m-high
frame on a boulder in the dunes, far bins from the vista spot looking NE.

### 3.7 Anti-aliasing (A22 under R25, V20)

R25 grades A22 as "SMAA present and `V20-aa-crop` passes". A22 also MEASURES the AA on V20's own crop
(basalt-column tops against the sky, `AA_FRAME` in the gate file): on every pixel whose 3 × 3 neighbourhood
spans > 0.25 of luminance, t = (L − min) / (max − min); intermediate if 0.2 ≤ t ≤ 0.8. Fix round 2's final
engine (`F4`; SMAA reads the grade's RGBA8 output since fix round 1):

| frame (DPR from the tier on a DPR-2 display) | silhouette px | intermediate | fraction |
|---|---|---|---|
| shipped `high`: SMAA only, DPR 1.25 | 893 | 284 | **0.318** (fix round 1: 0.317; round 0: 0.316) |
| the same frame, SMAA off (no AA at all) | 941 | 185 | 0.197 |
| Round-4 `high`: MSAA ×4 + SMAA, DPR 1.5 | 1073 | 402 | 0.375 |

Bar: ≥ 0.20 and ≥ 1.5 × the no-AA frame (shipped: 1.617 ×).

### 3.8 The new post chain against Round 4's, pixel by pixel (`X-equiv2`, `X-cadence`)

Five POC frames at the shipped tier, DPR 1.25, each lever switched alone against Round 4's chain (resolve
copy into HalfFloat, in-place blends, every cascade every frame), anisotropy held equal on both sides (fix
round 1; the post chain is unchanged in fix round 2, whose only change is the anisotropy split, filmed in
`V-gpu-tier-look`); fraction of RGB channels that differ, and how many differ by more than 8 levels:

| change alone | vista | landmark | AA frame | near frame |
|---|---|---|---|---|
| direct topology (no copy, HalfFloat kept) | 0 | 0 | 0 | 0 |
| far-cascade cadence 2 (static frame) | 0 | 0 | 0 | 0 |
| fold (GTAO + bloom into the grade) | 1.0 %, 60 > 8 | 1.9 %, 108 > 8 | 0.4 %, 28 > 8 | 0.5 %, 7 > 8 |
| direct + RGBA8 grade target | 4.8 %, 719 > 8 | 5.5 %, 666 > 8 | 3.2 %, 356 > 8 | 2.2 %, 514 > 8 |
| shipped (all of them) | 5.7 %, 676 > 8 | 7.1 %, 697 > 8 | 3.6 %, 344 > 8 | 2.7 %, 517 > 8 |

(6.75 M channels per frame.) Almost every differing channel is off by 1 level (float instead of a HalfFloat
intermediate; 8-bit SMAA input); the few hundred larger ones are SMAA edges whose detect/blend decision flips
near its threshold. **Cadence under motion** (`X-cadence`): a 16-frame walk at 0.6 m and 1.5° per frame,
cadence 2 against cadence 1, frame by frame: 3–39 channels of 6.75 M differ, max 7 levels, none over 8.

### 3.9 The W0b gate block (port 5251, this tree; reports `scratchpad/r5/engine-gpu/run/report.{F2,G1,Q*}.json`)

| gate | verdict | numbers |
|---|---|---|
| `A-gpu-tier-box` + `A-gpu-tier` | **PASS** (judged runs in §3.3) | vista 10.28 / 11.62 / 11.23 ms ≤ 13; empty 4.83 / 4.87 / 4.85 ms ≤ 7; fps 59.88 / 60.24 / 59.88 ≥ 58; p95 18.5 / 18.7 / 18.7 ≤ 20; null frames 0.16–0.22 ms; instability ≤ 1.35; docs row = live tier |
| `A-rt-ledger` | **PENDING** on one clause | RT 127.27 MB ≤ 170 PASS; staged fight 342.45 MB ≤ 450 PASS; docs PASS; levers restored PASS; at the shipped tier and DPR 1.25 PASS; **`tools/budgets.mjs` has no `RT_LEDGER`** (gates-perf's file): outstanding. With that one line (run `L11`, against a copy of `budgets.mjs`): **PASS on every clause** |
| `A-rt-ledger-census` (W0a) | **PASS** | GL recount 127,271,712 B = ledger, 21 live framebuffers, 39 GL objects, 0 unattributed, 0 mismatches; docs and `RT_LEDGER` match; registration contract and weak hold PASS |
| `A22-msaa` (R25) | **PASS** | samples 0 = the tier's, SMAA present and enabled; measured AA 0.317 vs 0.195 off (1.624 ×) |
| `V20-aa-crop` | NEEDS-JUDGE | filmed (F2); lane reading in the lane report |
| `A108-ao-periodicity` | **PASS** | worst 0.135 (ultra @ 1, control 0.137), 0 fails; witness: stock sample 0.236 on the first witness crop, shipped 0.099; the second crop reads stock 0.096 / shipped 0.101 (the gate requires the stock sample to see the defect on at least one witness crop; it does) |
| `A109-ao-distance-fade` | **PASS** | high (AO 400 × 225): 4–6 m 0.0682, past 150 m 0, far band 1.000 of GTAO-off; ultra 0.0718, 0, 1.000 |
| `V33b-no-ao-lattice` | NEEDS-JUDGE | filmed (F2) on the folded chain; lane reading in the lane report |
| `V-gpu-tier-look` (new) | NEEDS-JUDGE | filmed (`L13`); lane reading in the lane report: the far salt crust softens |

Must stay green (F2, the round's one full run; the box got loud during it): `A20-frame-loop-survives` PASS,
`A22b-fov-recompile` PASS, `A56-cascades` PASS (near texel 1.38 cm, `shadowMapSize` 2048). Global items present
in this tree: A1, A9 (57.9 fps / 19.2 ms in F2; 58.0 and 58.8 fps in QJ1, QJ2), A20b, A90, A90-expansion,
A90b, A90-rig-reclaim, A-ID-ip-assets-gone, A-assets-tracked PASS; A-licence-manifest PENDING (pipeline's
clauses); A21 FAIL on its Round-4 GPU term (its baseline verdict; draws and triangles PASS) — lane report §5.2.

### 3.10 For the orchestrator

- No bar moved and no gate was loosened: the vista and empty-frame terms are measured exactly as in round 0;
  the lever record gained the four new levers and an anisotropy-4 row; `V-gpu-tier-look` was added so the
  judge sees what the tier costs the picture.
- **The timer is a clock-state reading on this machine (§3.4).** A frame whose work sits near a governor
  threshold can read on either side of the bar in different runs; the shipped tier's spread is in §3.3.
  If the orchestrator wants a capacity number instead, that is a new instrument (a fixed-clock or saturated
  measurement), a ruling, not something this lane changed.
- **`A-rt-ledger`'s last clause** is gates-perf's one line in `tools/budgets.mjs`
  (`export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';`). With it the gate passes every clause: proved by
  a run against a copy of `budgets.mjs` with that line (`scratchpad/r5/engine-gpu/budgets-proof/`,
  report `L11`), patch at `scratchpad/r5/engine-gpu/budgets-rt-ledger.patch`.
- **The trade is the orchestrator's to accept.** The two choices the measurements leave for W0b: ship
  `maxAnisotropy: 2` (the vista passes; the far salt crust softens, `V-gpu-tier-look`), or ship 4× and record
  the vista term red on the POC until the W1 re-grade. The tier row is one field either way.
- **W1:** re-grade on the real Pans and try `maxAnisotropy: 4` there (§3.4).
