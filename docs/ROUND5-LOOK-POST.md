# CALIMA — ROUND 5 lane `look-post` (W1) report

Lane `look-post` (port 5251, judge 5281; R66 i). Grant **G-post** over `src/core/engine.js` (post chain
only), new `src/core/look.js`, `src/core/look.grade.json`, `tools/look/**`, `tools/gates.r5.look-post.mjs`,
this report, and the W1-exit grants on `src/instruments/lamps.js` (≤ 25 lines) and `src/hero/sheets.js`
(≤ 10 lines). Spec: `docs/ROUND5-LOOK.md` §3.1 (L-00, L-01, L-02, L-07, L-14, L-16, L-18), §4, §5.1–5.3, §7.
References are cited `ext:<file>@<sha8>#<panel>` (ROUND5-LOOK §0.2); none is copied into the tree.

**Status after fix round 1 (Nov 12).** Every judge finding is addressed in code or routed with evidence (§0).
Fixed in this tree: the hour bridge no longer applies the L-03 EV and the W0 output is the W0 output at every hour
(exposure 0.94); the grade is re-balanced (no sepia fold, violet-rose shadows, greens kept, Brea's violet the most
saturated hue, no loss of top brightness against W0); A-look-bloom (c) was a gate bug (the probe disc was hidden by
the engine's small-mesh cull) and passes; A-look-suite (a) now hashes two boots of the build; the lamps.js re-solve
and the bloom threshold key on a coarse `look.solveVersion`; R48 (c)'s cull-pass churn and the shadow pass's
program-key churn are fixed; A-look-ledger and A-gpu-attrib implement every written clause and the box witness is
R45's. Still FAIL and needing the orchestrator: the palette and highlight bars (A-look-frame-stats, A-look-random,
V-look-highlights, V-look-random) on the W0 map and keys, and inherited A108 (the AgX tone map itself, measured:
§5.3). Quiet-box rows are PENDING by R45. Results of the fix-round run: §4.

## 0. Fix round 1 (Nov 12): what changed, by finding

Diagnostics run first (scratch `f1-b1`, one Chrome): the HDR dump of the look places, the shadow pass's
`getProgram` census, two-boot hashes of the look places, A-look-bloom, and A108 three ways (look, `?look=nolut`,
`?look=nodither`). Then the fix-round lane run `f1-b2` (§4). Every number below is from those runs or from node on
the HDR dump (`tools/look/hdr-look.mjs` and a scratch tuner over the same `look.js`).

| finding (judge) | what changed | measured |
|---|---|---|
| Hour bridge applies the L-03 EV; the W0 controls are not W0 | `_lookBridge` passes `withEv = false`; under ACES `_syncLook` sets exposure 0.94 exactly and never adopts an outside exposure write as EV (`engine.js` `_syncLook`, `_lookBridge`); the look places stage with `setLookHour(h, w, null, { ev: false })` so the gates show what play shows | ⟪b2:ev⟫ |
| V-look-grade, V-look-before-after, R54: sepia fold, brown shadows, darker top | grade v2 (`look.grade.json` v2, `look.js` `labStage`): no rotation of the amber band beyond −2°, olive band −6° only, greens untouched, Orchil violets ×1.3; an L\*a\*b\* stage that shifts shadows toward rose-violet, scales mid b\* ×0.82, desaturates the top band and opens the top with a monotone tone curve on L\* (§1.2) | HDR dump, same frames: p99 field 73.7 (W0 73.4, r4 66.4), vista 63.3 (59.9 / 57.6), aim 70.6 (69.5 / 63.7), noon 77.0 (77.4 / 68.1), close 60.3 (56.4 / 55.0); lo20 hue field 59.7 → 44.1, vista 52.8 → 13.3, close 22.6 → 331.7; violet max ≥ grass p90 (field 41.5 vs 41.4, aim 40.5 vs 40.5, close 43.0 vs 39.0; r4: 42.2 vs 55.3); share of chroma pixels in the largest 30° band 98.3 % → 91.7 % (field), 98.3 → 83.0 (vista); bars met on the dump 22/40 (r4 14/40) |
| A-look-bloom (c) inert, halo/core 1.00 | the gate's 0.12 m probe disc at 40 m (5 px) was HIDDEN by the engine's small-mesh cull (`sizeCullPx`; a MeshBasicMaterial does not count as a glow): r4's and the judge's runs had no lamp in frame at all. The probes opt out (`userData.noSizeCull`), like a real lamp core (emissive, glow threshold). The threshold stays display-keyed (L\* 94) | f1-b1: halo/core **5.63** (bar ≥ 2.5), hue Δ 6.8° (≤ 15); (a) brightest noon ground L\* 86.8, folded bloom 0; (d) 0 % / 0 %; (b) still no sun disc (L-06) |
| A-look-suite (a) is within-page, not two runs | (a) now hashes every place on two BOOTS of the build in one run: the gate's page, then a fresh same-origin iframe boot of the same URL (boot 1 held, 0 draws); a diff sheet marks every differing pixel. Two boot-dependent inputs found and frozen in the look staging: the presentation clock (`engine.wallTime`, which the sky, wind, grass sway and birds read) is snapped to the next multiple of 4096 s, and the hero is settled deterministically (clip phases zeroed, 60 sim steps of exactly 1/60 s) | f1-b1 before the settle: 8–11 % of pixels differed (Brea and the grass round her only), close 75 %; ⟪b2:suite⟫ |
| A-alloc-rate guard: instruments-core over after the lamps.js grant | `Look#solveVersion` bumps only when the exposure, a slot name or the grade mix moves, or the slot mix moves ≥ 1/16; lamps.js keys its re-solve on it (the same two lines of the grant, no new line: 17 added / 8 removed); the engine's display-keyed bloom threshold (48 evaluations of the look) is cached on it | node: `evaluate` allocates ≈ 50 B and `invert` ≈ 400 B per call (boxed double returns), so a re-solve costs ≈ 4 KB; the bridge's 1/64 steps no longer trigger it; ⟪b2:alloc⟫ |
| R48 (c) not closed | (1) the cull pass fills its caster pool and distances by index instead of `length = 0` + push (V8 dropped the backing store every pass), selects the nearest `budget` casters by bisection on distance instead of `sort` with a closure, and marks them in a byte array instead of a Set; (2) the shadow pass's program-key churn: three r169 renders every caster with one shared depth material whose `skinning` / `instancing` flip between consecutive casters, so `setProgram` re-derives the program (getParameters + cache key + join) 18 times a frame; skinned / instanced / batched casters now get a depth material shared by their kind (`engine._depthVariant`) | f1-b1 census: 18 `getProgram` per frame from MeshDepthMaterial, 2 from one transparent double-sided MeshBasicMaterial (three's two-pass double side); selection checked against sort in node (2000 random pools, 0 differences); ⟪b2:churn⟫ |
| A-look-ledger and A-gpu-attrib implement part of their bars | A-look-ledger: A21's W1-exit bars with every high item on (vista ≤ 17.0, herd ≤ 20.0, fight ≤ 17.0), shipped-mode `renderScale` median ≥ 0.95 (DRS restored for that read), the same bars on `low`, every enabled and landed item has a row (a tier knob the build reads during the run whose item registered no switch fails), 0 look draws outside post, render targets ≤ 170 MB and GPU bytes ≤ 450 MB with the look on; the pass bench for post items is recorded as a deviation for a ruling. A-gpu-attrib: every per-pass row is measured (shadow cascades, opaque, transparent + additive, GTAO, bloom, SMAA, shafts, overlay as skip-one marginals; the grade by its pass bench) and they must sum to the frame median within 10 % (no remainder row); every row ≥ 0.5 ms must name a fix owner in ROUND5-LOOK §4.2. The box witness is R45's (load < 3 and at most one gate Chrome, counted by profile) | ⟪b2:ledger⟫ |
| A108 fails under the look; the witness crop's +0.11 | measured three ways in one run (f1-b1): the full look, `?look=nolut` (AgX with no grade, no vignette, no dither) and `?look=nodither`: **all three fail the same way** (far108m control 0.26 / 0.261 / 0.261), so it is the AgX transform (L-01, mandated), not the LUT or the dither. The witness's +0.11 on "near dune grass": GTAO on reads 0.267 at lag (0, 6) and the stock (Round-4 defect) shader reads the **same** 0.26 at (0, 6): a 6-px row period that both shaders produce is real contact AO in the dune-ripple troughs, not the centre-sample lattice the witness guards (that lattice reads at lags like (5, −29)) | §5.3; needs a ruling |
| A-look-frame-stats, A-look-random, V-look-highlights, V-look-random FAIL on the W0 map | the grade moves every palette bar it can move without turning into a filter (22/40 on the dump against 14/40); the bars that remain are the light's (p99 ≥ 88–90, clip 0.2–5 %, spread ≥ 60, hi10 chroma: a sun disc, a bright sky, a sea) and the map's | needs a deferral ruling (§6) |

## 1. What was built

### 1.1 L-01 — AgX with the CALIMA look (`src/core/engine.js`, `src/core/look.js`)

- `renderer.toneMapping = AgXToneMapping`; the output pass compiles a `CAL_AGX` branch (never three's bare
  AgX): three r169's AgX (MIT: rec2020, inset, log2 −12.47393…+4.026069, 6th-order sigmoid, outset, pow 2.2,
  rec709), then the **CALIMA look**, an ASC-CDL in AgX space (slope 1.00/0.99/0.97, power 1.22, luma-preserving
  saturation 1.12; uniforms `uAgxSlope`, `uAgxLook`).
- **The CALIMA shoulder** (look.js `SH_*`, the same three constants are compile-time defines of the shader):
  three's AgX clamps the log encoding at +4.03 EV, so every exposed value above 16.3 was one flat grey at L\* 98.6:
  the sun disc, its corona and glints plateaued and nothing reached the display white, and A-look-tonemap (d)'s
  ramp to 32 could never be strictly increasing. Above the log range the sigmoid continues with an exponential
  shoulder (C1 at the join) up to 1.04, so the grey ramp is strictly increasing to ≈ 52 scene-linear and true
  highlights clip (the panels clip 0.3–3 %). Nothing at or below the AgX white moves.
- **Exposure**: calibrated at boot so 0.18 grey shows at L\* 50 through the look with three's OETF: **1.2668**
  (ROUND5-LOOK's ≈ 1.21 was the analyst's estimate; 1.21 puts 0.18 at L\* ≈ 48.9). 0.02 → L\* 9.9, 1.6 → 86.1.
- **CPU mirror** `engine.look` (`src/core/look.js`, no three, importable in node and in the page):
  `evaluate(rgb)` reproduces the pass at the screen centre (AgX + look + shoulder, OETF, both LUT slots,
  grade mix), `invert(rgb)` is exact (analytic inverse of every step, the LUT by fixed-point refinement, then
  Newton on the exact forward; a channel may go negative, because AgX's inset mixes channels and an emitter
  that must show a saturated token pre-compensates it).
- **Gamut-edge guard** in the grade: colours at Lab chroma ≥ 58 keep their chroma and hue (identity by 82).
  No scene colour lives there (panels and frames sit at chroma 18–55); the lamp tokens do, and without the guard
  the wary token #B5E61D fell outside what the output can show (ΔE 9.9 after invert).
- Ports by grant: `src/instruments/lamps.js` (17 lines added, 8 removed: `readOutputParams` reads `engine.look`
  when AgX is in force, `_solve` calls `look.invert` in place of the ACES branch, the per-frame change test and
  the signature include `look.version`, and the wary trough is re-solved for the ACES-era on-screen depth: under
  AgX the wary core sits in the shoulder, where the HDR trough 0.55 read as 0.88 of the peak on screen against
  0.84 under ACES, and A-lamp-states' rhythm term fell to rel. std 0.0375 against > 0.05; the trough is now
  solved so the screen reads 0.84 again, ≈ 0.46 in HDR) and `src/hero/sheets.js` (4 added, 1 removed:
  `screenPixels` tone-maps through `engine.look.toneMap` under AgX). Both keep their ACES branches for
  `setLookEnabled(false)`.
- **Output dither** (±0.5 LSB, a PCG-style integer hash of the pixel: no lattice, no time dependence, so shots
  stay bit-identical): AgX's gentler haze and sky gradients step in 8 bits every 5–30 px; the dither breaks the
  stairs into noise (sky banding). It did not change A108 (§5.3).
- **Diagnostic** `?look=w0` (on the page, or on the page hosting the Pans POC iframe) boots on the Round-5 W0
  output; the gate block carries `<id>@look-post-w0` twins of A108, A-weak40 and A-lamp-states for that reason.

### 1.2 L-02 / L-14 — the grade (`src/core/look.grade.json` v2)

Display space after AgX, baked per **grade set** into a 32³ **half-float** RGBA LUT (look.js `gradeSet` →
`bakeLut`; RGBA8 texels carried up to ±0.5 LSB of rounding each, which trilinear filtering turned into a ripple):
split tone by luma, a soft-shoulder contrast about a pivot, saturation by luma, LCh hue bands, then (fix round 1)
**the L\*a\*b\* stage** `lab` (look.js `labStage`): a monotone cubic tone curve on L\* (Fritsch–Carlson, slopes cached
per curve, so `look.invert` stays exact), a shadow shift of (a\*, b\*) toward rose-violet weighted below L\* 18–42, a
mid-band b\* scale on the warm hues, and a top-band chroma scale. The four LUTs are baked once at boot (≈ 110 ms in
node for all four); the GPU holds **two slots** (`CAL.lookLutA/B`, 2 × 256 KB) blended by `uLutMix`, refilled by
one 256 KB upload only when a slot's set changes. Vignette 0.28 in the pass.

**Why v2.** The r4 sets rotated every olive and yellow into one amber band and warmed every highlight: 98 % of the
chroma pixels of the field and vista frames sat in one 30° hue band, shadows read brown, and the judge read the
frames as a sepia filter beside 1-TR. v2 was tuned on the HDR dump of the look places (no hour EV, W0 keys), each
candidate read as a sheet beside the W0 output and the r4 sets and counted against the §7 bars:

| set | soft contrast | sat by luma | hue bands | lab: shadow (below L\* 18–42) | lab: mid b\* | lab: top band (L\* 64–90) |
|---|---|---|---|---|---|---|
| golden | 1.08 @ 0.42 | 0.92 / 1.00 / 0.88 | olive 88–118° −6°, × 0.96; amber 50–88° −2°, × 0.96; greens × 1.0; violets × 1.3 | (a, b) × 0.85 + (4, −9) | × 0.82 (a × 1.08) | chroma × 0.42, + (1.5, −2) |
| dusk | 1.08 @ 0.42 | same | the same bands, amber/olive × 0.91 | below L\* 25–55: × 0.8 + (5, −13) | × 0.6 | × 0.42, + (2, −3) |
| noon | 1.08 @ 0.42 | 0.95 / 1.08 / 0.95 | amber × 1.08 | × 0.9 + (2, −5) | × 1.0 | × 0.85, + (0.5, −1) |
| calima | 1.06 @ 0.42 (L-14 split tone kept: shadow (1.04, 0.95, 0.98), sat 0.95) | 0.95 / 0.97 / 0.92 | r4 bands | × 0.95 + (2, −4) | — | × 0.7, + (1, −1) |

Every set shares the tone curve L\* 6 → 7.5, 15 → 17, 30 → 32, 45 → 49.5, 60 → 68.5, 72 → 82, 85 → 92.5, 95 → 98: it
lifts the toe a little and opens the top that AgX + the look's power 1.22 hold 6–10 L\* under the ACES-era frames
(A-look-tonemap is graded at grade mix 0, so 0.18 → L\* 50 is untouched). Round trip through the new grade: ≤ 0.25/255
on 512 shown values per set pair; the four lamp tokens 0/255 (the gamut-edge guard); the grey ramp stays strictly
increasing. A sun at 4× its colour shows peach-white (#FEF3EF golden, #FFF2E4 noon), never lemon.

The hour table `hourEv` carries ROUND5-LOOK L-03's EV offsets; `setLookHour` applies them unless called with
`{ ev: false }`. **They are world-sky's** (L-03): neither the bridge nor the look places apply them (fix round 1).

### 1.3 L-07 — bloom retune

Strength 0.48, radius 0.72, mip factors [0.55, 0.65, 0.85, 1.05, 1.25], tint (1.00, 0.97, 0.93);
`look.bloomScale` multiplies the strength per weather (world-sky: calima ×1.25, overcast ×0.6).
**The threshold is keyed to display brightness** (`look.hdrForLstar`): bloom starts at the grey that shows at
L\* 94 at the hour's exposure (≈ 3.3 scene-linear at EV 0 on the golden set), with ROUND5-LOOK's knee kept in
proportion (0.35 / 1.30 of the threshold).
ROUND5-LOOK's 1.30 / 0.35 were ACES-scale numbers: under the CALIMA look HDR 1.30 shows at L\* ≈ 84, so
sunlit cloth, rock and salt at L\* 85–92 (A-look-bloom a, V-look-glow) and the calm lamp ring (#F2EAD3 needs HDR
luminance 2.47 under AgX) would all glow; measured in r2, the calm ring's own bloom brightened the lamp drum
face to 0.40 and A-weak40's glass-vs-face contrast fell to 2.02:1. The lamp cores still clear the threshold by
CORE_OVER (the lamp system re-solves on any threshold change). The W0 values are kept as `LOOK_W0.bloom`.

**Fix round 1.** A-look-bloom (c) failed in r4 and in the judge's run with halo/core 1.00 because the gate's probe disc
(0.12 m at 40 m, 5 px across) was hidden by the engine's small-mesh cull; with the probe kept the solved hostile core
(lamps.coreHdr: (24.2, −1.9, 3.2), Rec. 601 luma 6.5 against the threshold 3.23 at 17:45) blooms to 5.63× its radius
at a hue 6.8° from the token. The threshold stays keyed to L\* 94: lowering it adds nothing to a lamp (the core is
solved to clear it by CORE_OVER) and would light diffuse ground (A-look-bloom a). The threshold is re-solved only on a
`look.solveVersion` change (it runs the look 48 times).

### 1.4 L-16 / L-18 — the ledger and the attribution tools

- `QUALITY_TIERS.<tier>.look` rows (`LOOK_ROWS`, ROUND5-LOOK §4.4) and `LOOK_RULE2` (the two items `high` takes
  only after A-look-ledger clears them: L-12 hero-near contact, C-07 hero shadow). The engine copies the row per
  engine (`engine.tier.look`), so a gate or the A/B tool flips an item without editing the table.
- `engine.registerLookItem(id, { owner, estMs, title, set(on), get() })` and `engine.lookItems`: the ledger's
  switches. look-post registers L-01, L-02, L-07.
- `tools/look/ab-time.mjs` (node driver) + `tools/look/ab-time-page.mjs` (page): per A21 scenario, every item
  estimated ≥ 0.10 ms A/B'd alone on the whole frame and the rest as one group, 4 interleaved rounds; an item that
  registers a `bench` (a post item whose cost lives in one pass: L-01, L-02, L-07) is A/B'd on that pass alone
  (`engine.benchPass(pass, n)`: n renders between two 1-pixel readback fences), because a whole-frame A/B at 18–20 ms is
  ±1–3 ms of noise on this machine (r3: the same look group read +2.87 / +1.60 / +0.15 ms). Rows ≤ 0.45 ms, draws
  ≤ 350. A runner row (`A-look-ledger-box`) samples the box in node right before the run and hands it to the gate.
- `tools/look/gpu-attrib.mjs` + `tools/look/gpu-attrib-page.mjs`: the build first (git SHA, tree, dirty count),
  then per A21 scenario the frame median, **per-pass skip-one marginals on the A21 whole-frame timer** (shadow maps,
  GTAO, bloom, SMAA, the grade's LUT stage, transparent + additive meshes; remainder = the opaque scene and AgX) with
  an all-off interaction test for the 10 % sum rule, per-owner hide-one marginals over gates-perf's `DRAW_OWNERS`,
  the all-hidden floor and the interaction residual. `engine.gpuAttrib(on)` (consecutive timer-query segments with a
  zero-vertex sentinel at the head of the transparent list) is kept and reported raw: on ANGLE/Metal its per-query
  times are not usable (§5.4). `A-gpu-attrib-box` samples the box.

**Fix round 1: every written clause.** `abTime` (ab-time-page.mjs) now also grades, per A21 scenario: the frame
median with every high item on against A21's exit bar (`A21_EXIT_BARS.W1`: vista 17.0, herd 20.0, staged fight
17.0 ms; `W2`: 14.0); the shipped-mode `renderScale` median over 120 frames with dynamic resolution restored for that
read (`opts.dynamicResolution` is false under `?shot`) against 0.95; the look's draws (every post item on minus off)
= 0; render targets ≤ 170 MB and the GPU bytes with the look on ≤ 450 MB (`gpuBytes`: the render-target ledger plus
a scene walk of texture and geometry bytes, a lower bound of A-vram-ledger's census, which needs a hook before the
context); then `low`'s frame against the same bars; and **every enabled item has a row**: `engine.tier.look` is
proxied during the run, a knob the build reads is an item that has landed (`LOOK_KNOB_ITEMS` maps knob → item), and a
landed item with no registered switch fails (R66 h). The pass bench for post items is listed in `deviations` for a
ruling. `perPassSkip` (gpu-attrib-page.mjs) measures every row (no remainder): shadow cascades (maps not
re-rendered), opaque scene (the view draws only the transparent and additive meshes through a spare layer while the
shadow pass sees every caster), transparent + additive, GTAO, bloom, SMAA, shafts and overlay (the `onAfterRender`
hooks, outside A21's timer), and the grade by its pass bench; the rows must sum to the frame median within 10 %, and
every row ≥ 0.5 ms must name a fix owner from ROUND5-LOOK §4.2 (`FIX_OWNERS_42`, `fixOwnerFor`) — bloom, SMAA, the
grade and overlays have no §4.2 row, so one of them at ≥ 0.5 ms fails until the orchestrator adds it. The box
witness (`boxSample`) is R45's: load < 3 and at most one gate Chrome alive (distinct `--user-data-dir` of headless
Chrome processes).

### 1.5 G-post — per-cascade layer masks (`enableCSM`, 15 lines) and U-03 `holdFrame`

`CAL_LAYER.CASTER_ONLY` (30) / `CAL_LAYER.CASCADE0_ONLY` (29). three r169 tests shadow casters against the
MAIN camera's layers, so `enableCSM` wraps `shadowMap.render` once (mask | CASTER_ONLY while shadows render,
restored after) and each cascade's `shadow.updateMatrices` (cascade 0 adds CASCADE0_ONLY, the far cascades drop
it). The main camera always enables CASCADE0_ONLY. `engine.holdFrame(on)`: a held `render()` submits nothing
(a WebGL canvas that is not drawn keeps its last frame); the first frame after `holdFrame(true)` and any resize
still render.

### 1.6 L-00 — the yardstick

- `tools/look/stats-core.mjs` (pure JS; node and page): CIELAB D65 frame statistics with the definitions
  written at the top of the file (percentiles, chroma, lo20 / mid (p40–p60) / hi10, clip = largest channel
  ≥ 254, crush ≤ 6, five row bands with std and |∂L\*/∂x|, gold / violet / strong-violet masks, depth bins).
- `tools/look/look-stats.mjs` (node + sharp): frames, `--compare`, `--refs` (panel statistics from the
  references where they live, numbers only), `--selftest` (A-look-suite b).
- `tools/look/refs.json` (8.9 KB): 7 panels (1-TL, 1-TR, 1-MC, 1-MR, 1-BL, 2-MR, 2-BRc), stats + ≤ 8 L\*a\*b\*
  swatches each, HUD cards and wordmarks excluded by rectangle. With these definitions every A-look-frame-stats
  bar holds on its own panel except two of 1-TR's (§5).
- `tools/look/places.mjs`: the look-place contract and the W1 **stand-ins** (§5).

- **Two-boot reproducibility (fix round 1, A-look-suite a).** `SUITE_SHOTS` stages and hashes the five places; it
  runs in the gate's page and again in a fresh same-origin iframe boot of the same URL (boot 1 held: `holdFrame`,
  time scale 0; the iframe's renderer loses its context and the iframe is removed after). The look staging freezes
  the two boot-dependent inputs the diff sheet showed: `engine.wallTime` (sky, wind, grass sway, birds) is snapped
  to the next multiple of 4096 s, and the hero is settled deterministically (`mixer.setTime(0)`, then 60 sim steps of
  exactly 1/60 s whatever the frame time; `stageLook(name, { settle: false })` skips it).

### 1.7 R48 (c) — the engine's two allocation hot spots (fix round 1)

- **The cull pass** (`_cullPass`): the caster pool and its distances are filled by index (`C.n`) and the tail nulled,
  never truncated (`length = 0` dropped V8's backing store, so every pass re-grew both arrays); the `budget` nearest
  casters inside the cut are chosen by a 36-step bisection on the distance with ties admitted in pool order (the same
  set as the old sort: 2000 random pools in node, 0 differences), with no comparator closure and no TimSort work
  array; the keep set is a byte array that grows only with the pool.
- **The shadow pass's program-key churn** (`_depthVariant`): three r169 renders casters with one shared
  `MeshDepthMaterial` unless a mesh carries `customDepthMaterial`; its `setProgram` re-derives the program whenever
  `skinning`, `instancing`, `batching` or the morph count differs from the previous caster (18 times a frame on the
  vista and the staged fight). Skinned, instanced and batched casters get a depth material shared by their kind (key
  skinned 1 + instanced 2 + batched 4 + 8 × morph count; RGBA depth packing as three's), assigned in the cull visit at
  10 Hz; a caster whose material alpha-tests, alpha-maps, displaces or clips its shadow keeps three's per-material
  variant. Disposed by `disposeLook()`.
- Not engine-fixable: three's uniform uploads (`setValueV3f` / `setValueM4`, ≈ 4.3 MB/s of the 8.7 MB/s; a
  WebGL call with a non-Smi double argument boxes it) scale with draws and distinct materials; and a transparent
  double-sided `MeshBasicMaterial` that three renders in two passes bumps its own version twice a frame (2 `getProgram`
  a frame): its owner sets `forceSinglePass = true` (§6, ⟪b2:owner407⟫).

## 2. Published APIs and contracts (exact signatures)

`src/core/look.js` (no three, no DOM; node, page and game import the same module):

```js
export class Look {
  constructor(grade)                       // grade = parsed src/core/look.grade.json
  evaluate(rgb, out = [0,0,0])             // HDR linear -> display sRGB 0..1 at the screen centre (what the pass draws)
  invert(rgb, out = [0,0,0])               // display sRGB 0..1 -> HDR linear (may hold a negative channel)
  toneMap(rgb, out = [0,0,0])              // HDR linear -> display LINEAR 0..1 (AgX + look + shoulder; no OETF, no grade)
  set({ ev, a, b, mix, gradeMix, bloomScale })   // returns a bitmask of LUT slots that changed
  setSlots(a, b, mix, ev)                  // allocation-free per-hour form; returns whether anything changed
  hdrForLstar(Ls)                          // the HDR grey that shows at display L* Ls through the look in force
  version                                  // bumps on every change (the pass's uniforms follow it)
  solveVersion                             // bumps when a CPU copy that solves THROUGH the look must re-solve: exposure / EV,
                                           // a slot name, the grade mix, or the slot mix moved >= SOLVE_MIX_STEP (1/16)
  _bump(solve)                             // version++, and solveVersion++ when `solve` or the mix step is crossed
  exposure, baseExposure, ev, setA, setB, lutMix, gradeMix, vignette, bloomScale, luts, sets
}
export function setsForHour(grade, h, weather = null, calimaWeight = null, out = { a, b, mix, ev })
export function agxLook(x, look, out), agxLookInv(y, look, out), calSigmoid(x), agxSigmoidInv(y),
       gradeSet(c, set, out), bakeLut(set, size = 32) -> { half: Uint16Array, f32: Float32Array, size },
       sampleLut(lut, size, c, out), toHalf(v), fromHalf(h),
       calibrateExposure(look), oetf(c), eotf(v), srgbToLab(c, out), labToSrgb(lab, out)
export const AGX_MIN_EV, AGX_MAX_EV, SH_XMAX, SH_YMAX, SH_A, SH_K, LOOK_DEFAULT, LOOK_EXPOSURE_NOMINAL, SOLVE_MIX_STEP
// grade set (look.grade.json v2) fields: shadowTint, shadowRange, highlightTint, highlightRange, contrast, pivot, satLuma,
// satRange, hue[{ from, to, feather, rotate, chroma, minChroma }], edgeChroma, and lab { tone: [[L, L'], ...],
// shadow: { range, shift: [da, db], chroma }, mid: { range: [4], hue: [h0, h1, feather], b, a }, high: { range, chroma, shift } }
```

`src/core/engine.js` (G-post):

```js
engine.look                                // the live Look
engine.lookActive                          // getter: AgX in force (look.evaluate describes the screen)
engine.setLook(state)                      // -> engine.look; applied on the next rendered frame
engine.setLookHour(h, weather = null, calimaWeight = null, opts = null)   // world-sky: sets + hour EV ({ ev: false } keeps yours)
engine.setLookEnabled(on)                  // false = the Round-5 W0 output (ACES 0.94 at every hour, no EV; W0 grade, W0 bloom)
?look=w0 | nolut | nodither (comma list)   // diagnostics on this page or the page hosting it: W0 output / AgX without the
                                           // grade stage / no output dither (A108's twins @look-post-<v>, lane look-post-diag)
engine.registerLookItem(id, { owner, estMs, title, set(on), get() })   // -> engine.lookItems (Map)
engine.gpuAttrib(on = true) / engine.gpuAttribTake()                   // L-18 raw timer segments
engine.benchPass(pass, n = 100)            // L-16: ms per pass render (readback fences); measurement only
engine.holdFrame(on = true)                // U-03: a held render() submits nothing
engine.disposeLook()                       // the two LUT slots, the bench target, the shadow depth variants
engine._depthVariant(mesh)                 // R48 (c): a skinned / instanced / batched caster's shared depth material (cull pass)
export const QUALITY_TIERS[tier].look, LOOK_ROWS, LOOK_RULE2, LOOK_W0, LOOK_BLOOM,
             CAL_LAYER = { CASTER_ONLY: 30, CASCADE0_ONLY: 29 }
renderer.calLook                           // the engine (src/hero/sheets.js reaches engine.look through its renderer)
```

**What other lanes do with it**
- **world-sky (W1)**: when the hour or the weather moves, call `engine.setLookHour(hour, weather, calimaWeight)`
  (allocation-free) and `engine.setLook({ ev })` for the L-03 EV offsets and `engine.setLook({ bloomScale })` per
  weather (calima 1.25, overcast 0.6). Until that call lands the game runs the `golden` set at every hour with
  EV 0. Register L-04/L-05/L-06/L-09 switches with `engine.registerLookItem` so A-look-ledger can time them.
  Read `engine.tier.look.{skyIbl, aerial, shafts, cumulus}` for the tier knobs. Never write
  `renderer.toneMappingExposure` directly (the engine adopts such a write as an EV offset, but `setLook({ ev })`
  is the contract).
- **instruments-a / world-ground (I-04, W-01 (4))**: put an LOD1 caster proxy on `CAL_LAYER.CASTER_ONLY` alone
  (`mesh.layers.set(CAL_LAYER.CASTER_ONLY)`), and a small kind's meshes on `CAL_LAYER.CASCADE0_ONLY` alone to keep
  them out of the far cascades. A mesh that leaves layer 0 is invisible to a default `THREE.Raycaster`: keep hit
  proxies on layer 0, or enable the layer on the raycaster.
- **every look item's owner**: `engine.registerLookItem(id, …)` with a cheap runtime switch; items ≥ 0.10 ms are
  A/B'd alone.
- **shell-ui (W2)**: `engine.holdFrame(true)` when a full-screen menu opens, `false` when it closes (U-03);
  refit `CALIMA_DISC` (`src/ui/menu.js`) through `engine.look.evaluate` (L-01).
- **world-props (W1 day 1)**: publish `ctx.props.gatePlaces.look.{field, vista, aim, close, dusk, …}` with the
  record of `tools/look/places.mjs` (`x, z, hour, sunRel, pitch, weather, cam, dist`); the gates switch from the
  stand-ins automatically.

**The hour bridge (W1 only).** Until world-sky's first `engine.setLookHour` call, `engine._lookBridge()` reads
`window.__CTX__.environment` (time, weather) every 30 frames and picks the grade sets itself (allocation-free,
**no EV**: fix round 1 — r4 applied the L-03 hour EV here, so nights ran at +1.30 EV on the W0 keys). The first `setLookHour` call stands it down for good. It exists so the merged game shows the hour's
grade (noon set at noon, dusk set after 19:45) before world-sky wires the contract; world-sky should delete
nothing, only call `setLookHour`.

## 3. Panel statistics (`tools/look/refs.json`, numbers only)

Computed by `node tools/look/look-stats.mjs --refs` from the references where they live; HUD cards and wordmarks
excluded by rectangle (`PANELS` in look-stats.mjs). Hue in degrees (CIELAB D65), clip = largest channel ≥ 254.

| panel | lo20 L\* | lo20 hue | lo20 a\* | lo20 b\* | mid a\* | mid b\* | hi10 hue | hi10 C | chroma | p95−p5 | p99 | clip % | crush % | gold % | violet % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1-TL | 15.7 | 25.1 | 15.7 | 7.4 | 13.3 | 9.1 | 62.5 | 14.5 | 20.1 | 76.7 | 93.5 | 1.87 | 0.01 | 13.35 | 22 |
| 1-TR | 25.3 | 51.9 | 17.5 | 22.3 | 15.2 | 17.8 | 1.5 | 8.7 | 28.1 | 58.9 | 88.5 | 0.31 | 0 | 35.75 | 13.32 |
| 1-MC | 11.1 | 1.9 | 16.7 | 0.5 | 26.4 | 1.2 | 51.6 | 19.3 | 28.4 | 64.5 | 84.6 | 0.43 | 0.02 | 14.53 | 37.81 |
| 1-MR | 22 | 33.7 | 11.3 | 7.6 | 18.2 | 10 | 68.4 | 33.1 | 23 | 66.4 | 92.8 | 2.98 | 0 | 17.97 | 6.41 |
| 1-BL | 14.6 | 6 | 13.8 | 1.5 | 16 | 7.7 | 62.1 | 10.9 | 18.2 | 77.2 | 94.9 | 2.41 | 0 | 8.14 | 18.58 |
| 2-MR | 11.5 | 346.5 | 7.6 | −1.8 | 9.7 | −5.6 | 354.3 | 15.6 | 15.9 | 42.8 | 61.8 | 0.02 | 0 | 0.93 | 52.87 |
| 2-BRc | 21.5 | 14.8 | 12.8 | 3.4 | 22.2 | 21.7 | 69.2 | 40.1 | 30.4 | 62.8 | 86.3 | 1.87 | 0 | 38.89 | 1.43 |

**Calibration of the definitions against ROUND5-LOOK §7's bars.** Every A-look-frame-stats bar holds on its own
panel (vista 11/11 on 1-MR, aim 9/9 on 1-BL, close 7/7 on 1-MC, dusk 4/4 on 2-MR) except two of field's on 1-TR:
`hi10.hue` (1-TR's brightest tenth is the pale sky, hue 1.5 at chroma 8.7, against the bar 62–80) and `p95−p5`
(58.9 against ≥ 62). The bars are not moved (no bar moves); this is recorded so the judge knows that look.field
can meet them only with a warmer, higher-contrast sky than the panel's own (a question for the orchestrator).
The clip threshold (largest channel ≥ 254) was chosen because it is the one at which every panel sits inside its
own clip bar (at ≥ 250, 1-MR reads 7.6 % against 1–5 %).

## 4. Gate results (port 5251, this tree; `node tools/gates.mjs --port 5251 --lane look-post`)

Runs: r2 (Nov 6 21:50–22:11 UTC), r3 (23:30–00:14), r4 (the fixes below; §4.3). Scratch:
`/private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/look-post/{r2,r3,r4,film-r3}`.
Every visual row was filmed at 1600×900 and read by me against its panels (§4.2); the R29 judge grades them.

### 4.1 The look-post block (W1)

| row | r3 | measured |
|---|---|---|
| A-look-suite-files (b, c, f) | **PASS** | synthetic 6 patches all within ±0.5; fixture 77 numbers within ±0.3; refs.json 8 904 B, no data URI / base64 run / pixel key; 650 files scanned, 0 SHA-256 matches with the 4 reference images |
| A-look-tonemap (a–d) | **PASS** | (a) 0.02 → L\* 9.92, 0.18 → 50.21, 1.6 → 86.12 at exposure 1.2668; (b) GPU vs `look.evaluate` worst 0.002/255 at mix 0, 0.511/255 golden+calima 50 %, 0.519/255 dusk+noon 25 % (the ±0.5 LSB dither included); invert round trip 0.02/255 over 512 shown values; the four lamp tokens 0/255; (c) skew #FFB070×4 4.76°, #F08A5A×3 4.47°, #FF2D8C×6 2.07°, Orchil #6B3F73×4 2.06°; (d) 64-step ramp 0.001–32 strictly increasing |
| A-look-tonemap (e, f) | see aliases | A-lamp-canon-distance PASS; A-brea-contrast PASS (5.85:1 salt, ΔE 22.8 sand, 27.6 % ≥ 3:1); A-weak40 every 13:00 clause PASS (calima clause PENDING world-sky); A-lamp-states colour, iris, beams PASS in r3, wary rhythm FAIL in r3 → **PASS in r4** (§4.3); A-sighting-hue is shell-ui's row (not in this tree) |
| A-look-suite (a, d, e) | **PASS** | five places identical SHA-256 on two consecutive captures (field after 2 pairs: streaming), depth bins 30 → 29.1 m, 120 → 116.4, 400 → 388, 900 → 873, all in their bins; capture = WebGL canvas |
| A-look-frame-stats | FAIL | every LUT texel = look.js within 0.5/255 (all four sets); look on at low and medium; places (stand-ins on the W0 map): field 3/9, vista 5/11, aim 2/9, close 2/7, dusk 2/4 — see §5.1 |
| A-look-random | FAIL | 0/12 meet look.field's bars (lo20 hue 50–61, mid b\* 29–35, p99 53–64) |
| A-look-bloom | FAIL (r3) | (a) brightest noon ground L\* 86.7 → folded bloom 0 ✓; (d) energy 0 % field and vista ✓; (b) no sun in the vista stand-in (L-06 is world-sky's: profile on = off); (c) halo / core 2.50 with the first threshold mapping (r4 re-measures, §4.3) |
| A-csm-layer-masks | **PASS** | CASTER_ONLY: 0 view draws, cascades [0, 1, 2]; CASCADE0_ONLY: 8 view draws, cascade [0]; layer 0: both; camera mask restored after the shadow pass |
| A-hold-frame | **PASS** | held frames 0 draws (10/10); resumed frame within 0.47 % of the held one |
| A-gpu-attrib (+ box) | FAIL (r3, quiet box, load 1.98) | per-pass timer segments unusable on ANGLE/Metal (opaque 99–159 ms, grade and SMAA 0, also with a flush); re-built as skip-one marginals (r4, §4.3); owners and floor below |
| A-look-ledger (+ box) | FAIL (r3) | whole-frame A/B of the look group: vista +2.87, herd +1.6, fight +0.15 ms at ±1–3 ms frame noise; re-built as pass benches for post items (r4, §4.3) |
| V-look-before-after (1/2, 2/2), V-look-grade, V-look-highlights, V-look-glow, V-look-random | NEEDS-JUDGE | read in §4.2 |

### 4.2 Reading the films (r3; panels 1-TR, 1-MR, 1-TL, 1-MC, 1-BL, 2-MR, 5-1)

- **V-look-before-after** (field 16:30, vista 19:00, aim 17:45 behind Brea; close 18:45; dusk 19:45; noon):
  the CALIMA column turns the W0 output's olive-mustard grass amber, moves the darkest fifth from hue 71–88° to
  49–57° (toward 1-TR's 52° and the rose band), lifts crushed shadows (crush 0.5–4.6 % → 0–1 %: Brea's face and the
  wrap read in the close-up, as in 1-MC) and keeps Brea's violet the most saturated hue. It is darker at the top
  (p99 −2…−8 L\*) and the sky stays the W0 keys' orange-pink haze, so no frame looks like 1-TR or 1-MR yet: no
  lavender zenith, no rose distance layers, no sun disc, no sea. That is the light (world-sky L-03/L-04/L-05/L-06),
  the ground and the map (world-ground, world-props), not the transform; the noon frame (noon set) reads tan where
  W0 read lemon.
- **V-look-glow**: the hostile and calm lamp discs at the lamp system's solved HDR read as their tokens with a soft
  halo; sunlit cloth, rock and grass at noon do not glow.
- **V-look-highlights**: FAIL as filmed: the vista stand-in at 19:00 has no sun disc or sea (L-06, world-ground).
- **V-look-random**: twelve frames, one warm orange-amber haze; consistent, but monotone beside 1-TR and 1-MR
  (no depth layering, no violet).
- **V33b / V20 / V-gpu-tier-look** on the Pans POC under the look: no screen-locked lattice, AO reads as contact;
  the dune ripples read more clearly (the toe lifts what ACES crushed), which is what A108 trips on (§5.3).

### 4.3 r4: the fixes, re-measured

r4 (Nov 7 02:11–02:52 UTC; box load 4.0–4.7, so the quiet-box rows are PENDING by their own box rows):

| row | r4 | measured |
|---|---|---|
| A-look-tonemap | **PASS** | as r3; with the half-float LUT: GPU vs evaluate worst 0.53/255 (dither included), invert round trip 0.109/255, tokens 0/255 |
| A-look-suite | **PASS** | five places bit-identical; depth bins as r3 |
| A-look-frame-stats | FAIL (§5.1) | LUT texels within 0.5/255 of look.js on all four sets (half-float); places as r3 |
| A-look-bloom | FAIL | threshold now display-keyed: HDR 2.90 (17:45) / 3.54 (noon) = L\* 94, knee 0.78 / 0.95; (a) and (d) PASS; (b) no sun disc (L-06); (c) measured from the edge of a 2.5× ring disc the halo/core read 2.50 = the bar by construction (a tie the float compare lost): the row now measures the core alone (changed after r4, not re-run) |
| A-lamp-states@look-post | **PASS** | every check: colour ΔE calm/wary/hostile/dark within 3 (wary 1.63), iris ratios, cores above bloom (threshold 3.54), rhythm calm steady / wary 0.98 Hz rel. std **0.053** (r3 0.038) / hostile 4 Hz, dark sputter, beams |
| A-weak40@look-post | PENDING | every 13:00 clause PASSES (r2 FAIL 2.02:1 before the display-keyed threshold); calima clause awaits world-sky |
| A-brea-contrast@look-post | **PASS** | salt 5.84:1, sand ΔE 22.8, 27.4 % ≥ 3:1 |
| A22-msaa@look-post | **PASS** | |
| A108@look-post / -w0 | FAIL / **PASS** | unchanged by the half-float LUT and the dither: content-limited under the look (§5.3) |
| A1-boot-clean, A20b | **PASS** | |
| A-gpu-attrib (+ box) | PENDING-quiet-box (load 4.7) | build 858e4b7 (this tree). Skip-one rows on a busy box (ms): vista 18.7 = shadow 1.2, GTAO 0.57, bloom 5.68, SMAA 0.02, grade LUT 0.39, transparent 0.95, remainder 9.88; herd 21.4 = 2.84 / 2.39 / 7.72 / 0.93 / 1.20 / 1.18, remainder 5.1; fight 20.3 = −1.04 / 0.99 / 9.22 / 2.76 / 1.23 / 2.12, remainder 4.97. All-off removes 5.4 / 8.4 / 8.1 against row sums 8.8 / 16.3 / 15.3: the 10 % rule does not hold on a loaded box (±1–3 ms per median); the quiet run decides. Owners (hide-one, vista): settlement 3.46, landmarks 3.05, terrain-sky-sea 1.03, the rest negative (noise); floor with every owner hidden 3.5–3.6 ms. The bloom rows (5.7–9.2 ms) are the first thing to confirm on the quiet box: if they hold, bloom is the largest post cost and the first fix (§4.2 of ROUND5-LOOK needs a row) |
| A-look-ledger (+ box) | PENDING-quiet-box (load 4.0) | the pass bench read 0.002–0.03 ms per pass on/off: gl.finish does not fence the GPU on ANGLE/Metal, so the bench timed submission only; it now fences with a 1-pixel readPixels (changed after r4, not re-run). The whole-frame instrument is unchanged |
| A-vram-ledger | **PASS** | |
| A-alloc-rate | FAIL (baseline guard, two owners) | engine 0.71× of its W0b baseline (152.98 vs 216.24 KB/frame); instruments-core 0.10 vs 0.07 KB/frame (lamps.js re-solves when the look moves; `invert` is allocation-free now and the hour bridge quantised, the 30 B/frame residual is unattributed below the profiler's listing floor); world-sky 3.33 vs 2.70 KB/frame with its file unchanged (`_updateNightLights` 0.6 → 1.19 KB/frame between r3 and r4 on the same code: the guard's run-to-run noise is of the same order). Re-read on the quiet box |


### 4.4 Inherited and global rows (r3)

| row | result | note |
|---|---|---|
| A-gpu-tier(-box)@look-post | PENDING (r2: load 6.27) | vista 12.49 ms, empty 5.12 ms, 59.9 fps, p95 18.6 ms on the POC (bars 13 / 7 / 58 / 20): passes on numbers, graded on the quiet box |
| A-rt-ledger@look-post | PASS | 127.27 MB of render targets (≤ 170); the LUT slots are textures (0.5 MB) |
| A22-msaa@look-post | PASS | SMAA fraction 0.336, gain 1.59× over off |
| A108-ao-periodicity@look-post | FAIL | content-limited crops under the look (far108m control 0.261; mid47m 0.299–0.615); the `-w0` twin PASSES in the same run (worst 0.135) — §5.3 |
| A109-ao-distance-fade@look-post | PASS | far/near 0, far luminance on = off |
| V20, V33b, V-gpu-tier-look @look-post | NEEDS-JUDGE | filmed |
| A1-boot-clean, A20b, A20, A22b-fov-recompile | PASS | |
| A9-perf-budget | PASS | 241 draws, 59.9 fps median, p95 18.1 ms, scene GPU 20.0 ms (quiet box, load 2.89) |
| A21-real-draw-calls | FAIL (GPU term) | draws 248 / 183 / 275, tris 3.66 / 3.87 / 3.93 M PASS; median GPU vista 19.59, herd 33.87, fight 20.50 ms against 14 (quiet box): the Nov 6 numbers to the tenth, so the look does not move A21; **the herd's 33.9 ms is this build (the W0 valley map in the look-post tree, main + look-post)**, not world-ground's island (20.10) |
| A90-memory-stability, -expansion, A90b, A90-rig-reclaim, A90-abs | PASS | A90-abs heap and GPU controls 1.003× / 1.066× |
| A-alloc-rate | FAIL (baseline guard) | instruments-core 0.08 vs 0.07 KB/frame (+14 %, lamps.js re-solving through `look.invert` as the clock moved the look); engine 0.71× of its W0b baseline. Fixed for r4: `invert` allocation-free, the hour bridge quantised (§4.3) |
| A-vram-ledger | PASS | |
| A-no-horizon-terms-code / -player | PASS | 1371 = ratchet; 1503 ≤ 1508 |
| A-ID-ip-assets-gone, A-assets-tracked | PASS | |
| A-licence-manifest | PENDING | third-party clause PENDING (pipeline's re-fetch rows; no asset added by this lane) |
| A-port-guard | PENDING | refusals PASS; "not a full lane run" (r2's FAIL was this lane's import-time `pgrep`/`git`, removed) |
| A-carried-suite | PENDING-orchestrator | R48 d |
| A-reach-all-sites | not registered in this tree | |


## 5. Honest gaps

### 5.1 The palette bars are the light's, not the transform's (deferral requested)

A-look-frame-stats, A-look-random and the likeness rows (V-look-grade criterion 3 aside, V-look-highlights,
V-look-random) cannot all pass on the W0 map under the W0 keys whatever the grade does, and the grade must not be
pushed into a colour filter to fake them. Measured on the HDR dump of the places (the same HDR through the W0 output
and through grade v2; no hour EV):

| frame | lo20 hue W0 → v2 | mid b\* | p99 | bars met (v2) | what the panel has that the frame does not |
|---|---|---|---|---|---|
| field 16:30 (1-TR) | 77 → 44 | 22.2 → 18.8 | 73.4 → 73.7 | 4/9 | lavender sky (hi10 C 8.7), sun-side haze at L\* 90+, clip 0.3 % |
| vista 19:00 (1-MR) | 66 → 13 | 24.8 → 21.1 | 59.9 → 63.3 | 7/11 | the sun disc and the sea glint (p99 93, clip 3 %) |
| aim 17:45 (1-BL) | 76 → 39 | 29.6 → 23.9 | 69.5 → 70.6 | 3/9 | backlit haze, violet distance, p99 90 |
| dusk 19:45 (2-MR) | 73 → 323 | 13.4 → 2.7 | 30.1 → 38.0 | 3/4 | a violet dusk sky (mid b\* −5.6) |
| close 18:45 (1-MC) | 8 → 332 | 24.7 → 20.6 | 56.4 → 60.3 | 5/7 | sky catch-light, skin sheen (L-04, C-01…) |

The bars still missed are the top of the frame (p99 ≥ 88–90, clip 0.2–5 %, p95 − p5 ≥ 60–66, hi10 chroma ≤ 16–18) and
the yellow of mid-tones under an orange fog: that is a sun disc (L-06), a bright lavender sky and its IBL (L-03, L-04),
rose-violet aerial distance (L-05) and a sea (world-ground), on the real places (world-props). **For world-sky
(L-03):** under AgX the sky dome and the sun need roughly +0.5…+1 EV of radiance against the ACES-era keys for the top
of the frame to read as bright as before (0.18 shows at L\* 50; 1.0 at 82 against ACES's 93). **For the orchestrator:**
the rows are look-post's to build and world-sky's / world-props' to light and stage; I ask for a ruling that grades
their palette and highlight clauses after world-sky's L-03/L-04/L-06 keys and world-props' `gatePlaces.look` land (as
R38/R58 did for weather-dependent clauses), with the LUT-texel clause and the tier clause graded now.

### 5.2 Places are stand-ins

`gatePlaces.look.*` is world-props' (day-1 stub, not started). The gates stage the stand-ins of
`tools/look/places.mjs` on the W0 map and say so in every detail. No Ring, cliff, sea or Pans in them: the likeness
rows can be graded on light and palette only until world-props, world-ground and world-sky land.

### 5.3 A108 under the look (must-stay-green, inherited) — measured, needs a ruling

A108 FAILs under the look and PASSES on the W0 output (`@look-post-w0`) in the same run. Fix round 1 isolated the
cause in one Chrome run (f1-b1, the same build, the three variants back to back):

| variant | high@1.25 far108m control | content-limited crops | witness |
|---|---|---|---|
| the look (AgX + grade + dither) | 0.26 @ (22, −1) | ultra@1: 2, ultra@2: 3 | blind |
| `?look=nolut` (AgX alone: no grade, no vignette, no dither) | 0.261 | high@1: 2, high@1.25: 3, … | blind |
| `?look=nodither` | 0.261 | ultra@2: 3 | blind |
| `?look=w0` (r4 and ⟪b2:a108w0⟫) | 0.098 | 0 | sees (stock 0.239 at (5, −29) vs shipped 0.102) |

So the LUT and the dither are not the cause (without the grade it is slightly worse); the **AgX transform itself**
(L-01, which ROUND5-LOOK mandates) shows texture in the sunlit pan and the dune ripples that ACES compressed, and
A108's normalised autocorrelation, which is contrast-invariant but not tone-curve-invariant, reads it as content
periodicity in its GTAO-off controls. GTAO adds nothing on the graded crops (on − off ≤ +0.01 everywhere except the
witness). **The witness crop's +0.11** ("near dune grass from the vista spot": off 0.156, shipped 0.267 at lag (0, 6)):
the stock shader reads the same 0.26 at the same lag (0, 6), so it is not the centre-sample lattice the witness exists
to catch (that defect reads at lags like (5, −29) and separates stock from shipped); a 6-px row period produced by
both shaders is real contact AO in the dune-ripple troughs, which the AgX toe makes visible (under ACES the same crop
reads shipped 0.126 / stock 0.128 at (2, 18): also equal).

What the lane cannot do: change L-01's toe to hide terrain texture (that would undo the spec's "no crushed blacks"
and Brea's readable face), or edit `tools/gates.r5.engine-gpu.mjs`. **Options for the orchestrator** (any one):
(1) a ruling that A108 measures the AO term on a fixed display transform (`?look=w0`, which its twin already runs):
the defect it guards lives in GTAO's centre-depth fetch, not in the display transform; (2) a grant to re-survey
A108's crops and witness on the look (ROUND5-ENGINE §3.6's procedure); (3) a grant to measure A108 on scene-linear
luminance (the scene target before the output pass).

### 5.4 Quiet-box and per-pass timing on ANGLE/Metal

The segment timer queries the spec planned for L-18 do not work on this machine's ANGLE/Metal (per-query times
land on the first query of a command buffer even with a flush). L-18 per-pass rows are therefore skip-one marginals on
the whole-frame timer that A21 itself reads, with an all-off interaction test for the 10 % sum rule. The raw segment
timings are still reported (`segmentTimersRaw`) for when the platform can time them. L-16 A/Bs post items on their
own pass (`engine.benchPass`, 1-pixel readback fences; gl.finish does not wait on ANGLE/Metal) because a whole-frame A/B at 18–20 ms frames is ±1–3 ms of noise.

### 5.5 Not done this wave

- U-03 is the engine half only (`holdFrame`); shell-ui wires it in W2.
- L-14's calima set exists and is gated (A-look-tonemap b); the calima weather is world-sky's, so it is never shown
  in play yet.
- three's own uniform-upload allocation inside `ScenePass.render` (`setValueV3f` / `setValueM4`, ≈ 4.3 MB/s) scales
  with draws and distinct materials; it is not an engine policy and is not changed here (§1.7).

## 6. What other lanes and the orchestrator must do

- **Orchestrator — rulings asked (fix round 1).**
  1. **A108** (§5.3): one of (1) measure A108 on a fixed display transform (`?look=w0`, its twin already runs and
     passes), (2) a grant to re-survey its crops and witness on the look, (3) a grant to measure on scene-linear
     luminance. The cause is the mandated AgX transform, measured three ways in one run.
  2. **Palette and highlight clauses** of A-look-frame-stats, A-look-random, V-look-highlights and V-look-random
     (§5.1): graded after world-sky's L-03/L-04/L-06 keys and world-props' `gatePlaces.look` land; the LUT-texel and
     tier clauses graded now.
  3. **A-look-ledger's pass bench** for post items (L-01, L-02, L-07; `deviations` in the row's detail) in place of
     "on A21 frames": a whole-frame A/B at 18–20 ms is ±1–3 ms of noise on this machine.
  4. **gates-perf's A-alloc-rate owner table** lists `/src/core/look.js` as unowned: map it to the engine row (G-post,
     look-post now, world-sky in W2).
  5. **world-sky's A-alloc-rate row** (judge: 3.22 vs 2.70 KB/frame with `environment.js` unchanged): a main-tree
     control in the same session needs the main tree served, which the lane rules forbid here (Vite only from this
     tree, never 5173). ⟪b2:worldsky⟫
- **Orchestrator — merge.** With the bridge EV fixed, `look.agx: false` on `high` is the Round-5 W0 output exactly
  (ACES 0.94 at every hour). Grade v2 no longer loses top brightness against W0 on the look places (p99 within −0.4…+8
  L\* of W0 on the dump) and reads warm-light / violet-rose-shadow instead of sepia; I recommend merging it on, and
  the R54 judge's films (§4.2) decide.
- **Orchestrator — the W1-exit global run.** L-18 then L-16: `cd <scratch> && nice -n 10 node <tree>/tools/look/gpu-attrib.mjs --port 5270`,
  then `.../tools/look/ab-time.mjs --port 5270`; each runs its gate with its box row and prints the §4.2 / §4.3 table.
  The W0 / nolut / nodither twins (lane `look-post-diag`) are diagnostic and need not run in the global list.
- **ROUND5-LOOK owners.** L-07's threshold (1.30 / 0.35) and L-02's numbers changed for measured reasons (§1.2, §1.3);
  the spec should carry the shipped values.
- **world-sky.** Call `engine.setLookHour(hour, weather, calimaWeight)` when the hour or weather moves (it applies
  the L-03 hour EV unless `{ ev: false }`; the bridge never does), `engine.setLook({ bloomScale })` per weather, and
  register L-04/L-05/L-06/L-09 with `engine.registerLookItem`. Re-key L-03 against AgX (§5.1). In W2 (G-post passes to
  you): the `onAfterScene` hook for L-08 (A21's timer wraps `composer.render` only, so the post-SMAA shafts pass is
  outside A21 today), L-12, L-17, the L-14 dusk set (a `dusk` set exists; tune it, do not add a slot).
- **world-props.** Publish `ctx.props.gatePlaces.look.*` in the `tools/look/places.mjs` record shape.
- **instruments-a / world-ground (I-04, W-01).** `CAL_LAYER` per §2; keep hit proxies on layer 0. A caster that
  needs its own shadow material sets `customDepthMaterial` itself; the engine only assigns the shared depth variants
  to skinned / instanced / batched casters that have none.
- **instruments-a (lamps.js in W1).** Your tree also edits `src/instruments/lamps.js`: this lane's grant lines are
  `readOutputParams` (`P.look`, `P.lookVer = … solveVersion`), `paramSig`'s look terms, `_solve`'s `look.invert`
  branch and the wary trough re-solve (`PULSE_LIVE`, `screenLum`), and `update()`'s change test (`lv = … solveVersion`).
  Keep them on merge.
- **The owner of the transparent double-sided `MeshBasicMaterial`** that three renders in two passes (2 program
  re-derivations a frame on the vista and the fight): set `forceSinglePass = true` (⟪b2:owner407⟫).
- **shell-ui (W2).** `engine.holdFrame(on)` for full-screen menus; refit `CALIMA_DISC` through `engine.look`.
- **hero-body (observation, r4).** In the close stand-in Brea's idle once showed her left arm raised behind her head
  (V-look-before-after-2, r4). ⟪b2:arm⟫

## 7. Files (this lane)

`src/core/engine.js` (G-post: the output pass, look sync, bloom parameters, layer masks, `holdFrame`, the
`?look=` diagnostics, and R48 (c)'s cull-pass and shadow depth-variant fixes), `src/core/look.js` (new),
`src/core/look.grade.json` (new, v2), `src/instruments/lamps.js` (grant: 17 added / 8 removed lines, unchanged in
count by fix round 1), `src/hero/sheets.js` (grant: 4 / 1), `tools/gates.r5.look-post.mjs` (new),
`tools/look/{stats-core,look-stats,places,three,gpu-attrib,gpu-attrib-page,ab-time,ab-time-page,hdr-look}.mjs`,
`tools/look/hdr-dump.gates.mjs` (tooling, `--extra` only), `tools/look/{refs.json,fixture.json,fixture.png}` (numbers; a
procedural 320×180 fixture, project-original, not under `public/`), this report. No asset under `public/`, so no
`LICENSES.json` row. Lint `namecheck --code` PASS (1371 = ratchet).
