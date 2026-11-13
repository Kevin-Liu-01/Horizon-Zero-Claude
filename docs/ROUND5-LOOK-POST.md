# CALIMA — ROUND 5 lane `look-post` (W1) report

Lane `look-post` (port 5251, judge 5281; R66 i). Grant **G-post** over `src/core/engine.js` (post chain
only), new `src/core/look.js`, `src/core/look.grade.json`, `tools/look/**`, `tools/gates.r5.look-post.mjs`,
this report, and the W1-exit grants on `src/instruments/lamps.js` (≤ 25 lines) and `src/hero/sheets.js`
(≤ 10 lines). Spec: `docs/ROUND5-LOOK.md` §3.1 (L-00, L-01, L-02, L-07, L-14, L-16, L-18), §4, §5.1–5.3, §7.
References are cited `ext:<file>@<sha8>#<panel>` (ROUND5-LOOK §0.2); none is copied into the tree.

**Status after fix round 2 (Nov 13).** Fixed and measured in this tree:
- **A-look-suite (a) PASSES.** It is bit-identical across two boots of one run and across two consecutive runs. Six
  history-dependent inputs are rebuilt in the look staging.
- **A-look-bloom PASSES every clause.** Clause (b) is graded on L-06's planted sun at +6.6 L\* at 6 sun radii. The
  bright-pass limit removes R68's white block: clipped reach 3.85 sun radii, against 10.39 without the limit.
- **Grade v3 replaces v2's rose-brown filter.** Gold, fire and sun glow keep their chroma: the probes sit at 0.9–1.0 ×
  W0. The shadows are rose without going maroon, and the frames are as chromatic as W0's.
- **The close-up is re-staged** so the sun keys Brea's face (crush 0.22 %).
- **A108's attribution is corrected.** The period is the dune ripples, present with GTAO off.

Still FAIL against this lane:
- **A-look-frame-stats** at 19/40 and **A-look-random**: the light-limited clauses (§5.1, ruling asked).
- **A108@look-post**: the crop survey under AgX (§5.3, ruling asked).
- **A-look-ledger**: A21's W1-exit bars (§4.6 rule 2, orchestrator).
- **A-gpu-attrib**: the sum rule on this GPU (§5.4).

No ruling has been granted for any of these. Results: §4.

## 0. Fix round 2 (Nov 13): what changed, by finding

Runs (scratch `/private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/look-post/f2/`):
**f2-b1** (08:04–08:25 UTC: diagnostics, the v2 HDR dump, grade v3 first cut filmed), **f2-b2** (09:27–09:50: close-lighting
sweep, per-owner suite diagnosis after the cache fix, bloom-limit sweep), **f2-b3** (09:56–10:49: the lane block, its aliases and
the global list, 55 rows, plus the bloom-parameter sweep and the uniform diff), **f2-b4** (12:34–12:52: the rows the fixes touched,
A-look-suite in two consecutive invocations `b4` / `b4s`) and **f2-b5** (13:04–13:19: the final grade and bloom, A-look-suite in two
consecutive invocations `b5` / `b5s`). Offline: `f2/tune2.mjs` (the
grade on the v2 HDR dump), `f2/rtv.mjs` / `f2/rtq.mjs` (invert round trip, 2048–4096 random targets per slot pair, 3 seeds).

| finding (judge) | what changed | measured (final unless marked) |
|---|---|---|
| **A-look-frame-stats / A-look-random fail broadly; the toe removal deepened the darks** (blocker, judge-gate-f1) | Grade v3 (§1.2) re-cuts the grade-owned terms: shadow hue and chroma (rose below L\* 6–26, warm darks kept), mid b\*/a\* (the a\* × 1.12 gone, the yellow-olive mids turned −8° with chroma kept), hi10 (near-neutrals only), Brea's violet. The toe stays identity (R68: "neither lifts black on its own"); the close-up's lo20 came from its lighting, fixed by staging (next rows). Tuned on a new **v2 HDR dump** that includes GTAO and bloom (the v1 dump had read the darks 5–8 L\* too light) | f2-b5: field **3/9** (lo20 hue 44.9 ✓, mid b\* 22.5, lo20 L\* 9.8), vista **7/11**, aim 2/9, close **4/7** (lo20 a\* 12.6 ✓, b\* 3.6 ✓, crush 0.22 ✓, hi10 hue 43.6 ✓; lo20 L\* 7.5 vs 9–16, mid a\* 19.5 vs ≥ 20, mid b\* 21.6), dusk **3/4** — **19/40** (judge-gate-f1 read 18/40 with the toe removal, r4 14/40); A-look-random 0/12. Still FAIL: the light-limited clauses (p99, clip, spread, hi10 chroma on gold, field lo20 L\* 20–30) need a ruling (§5.1, §6); I have none, so the row stays FAIL |
| **R54: a rose-brown filter, muddier than W0** (judge-gate-f1) and **R54: a pink filter that drains fire, gold grass and sun glow** (judge-eng-r1) | the v2 top band (chroma × 0.42 on every highlight) → near-neutrals only (`cRange` 10–22); warm highlights get back × 1.22 chroma (`warm`); the tone lift fades with chroma (`toneC`) and out-of-gamut colours are gamut-mapped at their own hue (no more lemon); mid a\* × 1.12 dropped; the mid turn limited to hues 60–100° (orange cloth and firelit ground untouched); the shadow shift limited to near-neutral darks (`cRange` 20–40; f2-b1 showed the dusk set turning the campfire's pool of light magenta); saturation by luma no longer drops the top | HDR probes through the output at 17:45, W0 / v2 / v3: dim fire C 45 / 25 / 45; sunlit grass C 43 / 26 / 39; mid grass C 39 / 30 / 37; orange shirt hue 49 / 41 / 47; firelit ground at dusk hue 57 / 33 / 48; #FFC070 C 51 / 23 / 37 at its own hue. Films f2-b5: frame chroma CALIMA ≥ W0 on every look place (field 24.5 vs 21.9, vista 26.4 vs 23.7, aim 27.9 vs 25.6), p99 within −2.1…−0.5 L\* of W0 (field 64.4 vs 66.5); grass orange-gold, shadows rose, not maroon (§4.2) |
| **Close-up crushes Brea's face** (judge-gate-f1) | The close stand-in had her face turned 120° from the sun on a spot (openGround) that is in the cliffs' shadow at 18:45: f2-b2's sweep found her face dark at all 6 headings there. The stand-in now stands on the vista rise with `heroRel` −175 (her nose 55° off the sun, the lens 35° off her nose on the same side, so the sun keys the 3/4 face). Noon stays neutral: the hour table blends to the `noon` set, now with W0's hues (amber +3° back toward straw, no mid turn) | f2-b5 close: crush **0.22 %** (was 3.7–7 %), lo20 L\* 7.5 (was 3.1–4.6; bar 9–16), face lit warm with a readable shadow side (film §4.2); noon CALIMA vs W0: lo20 hue 84 vs 88, mid b\* 32.4 vs 31.2, p99 74.0 vs 76.5 (f2-b3) |
| **A108 still fails; the toe attribution does not hold** (judge-gate-f1, judge-eng-r1) | Attribution corrected (§5.3): the 4-px row period at `ultra@2 mid46m` is the pan's **dune ripples**, present with GTAO **off** (control 0.334 in f2-b1), crushed out of sight by ACES's toe; GTAO adds energy only round grass tufts' feet (crop films) | f2-b3: A108@look-post FAIL (high@1.25 far108m control 0.267, ultra@2 3 crops content-limited, witness blind); `-w0` PASS (worst 0.135). Ruling asked (§6.1); none granted, so it stays a FAIL against this lane |
| **A-look-suite (a) not bit-identical across boots / across runs** (judge-gate-f1, judge-eng-r1) | Diagnosed with `X-suite-diag` (per-owner solo hashes and a boot-to-boot diff of all 167 numeric uniforms, in the page and in a fresh iframe boot). Six history-dependent inputs are now rebuilt from the frozen lens in `stageLook` (§1.6): time-budgeted grass refill, small-mesh-cull hysteresis, far-cascade cadence, the environment's cloud-shadow drift (set at staging start and again at the freeze), transient unnamed sprites, plus a warm pass | **f2-b5 PASS**: all five places bit-identical across the two boots of one run, and the boot-1 hashes identical in two consecutive invocations (`b5` and `b5s`: field 67eff1b8…, vista d4ebaae3…, aim 8f229614…, close 11220477…, dusk 4d5fedc5…) |
| **A-look-bloom (b): no sun to measure** (judge-gate-f1) | (b) plants L-06's disc when the frame has none (scene HDR 0.24 at the sun pixel on the stand-in): radius 0.5°, sunCol × 40, limb 0.6, at the sun's bearing, drawn last; a second "hot" probe at 40 × the threshold is graded for the white block only. Bloom radius 0.72 → 0.3 (three's `lerpBloomFactor` mirrors the mip factors by `radius`, so 0.72 had weighted the two smallest mips and the sun lifted the sky only +3.2 L\* at 6 radii) | **f2-b5 PASS** (a, b, c, d): (b) lift at 6 radii **+6.6 L\*** (bar ≥ 6), monotonic to 30; (c) halo/core **9.1**, hue Δ −1.4°; (a) folded bloom 0 on lit noon ground; (d) 0 % / 0 %. Graded again on world-sky's real sun at the next integration run (§6) |
| **A-look-ledger misses A21's W1-exit bars** (judge-gate-f1) | No lane code can close it (§4.6 rule 2 is the orchestrator's). The look items stay behind `QUALITY_TIERS.<tier>.look` (`look.agx` / `look.grade` / `look.bloomRetune`) | f2-b3 (quiet box, load 2.91): vista 18.16 / herd 19.17 / fight 19.84 ms against 17 / 20 / 17; low 18.15 / 21.02 / 17.72; items L-01 +0.052, L-02 +0.029, L-07 +0.003 ms (pass bench); 0 look draws outside post; RT 106.6 MB, GPU 241.6 MB; renderScale 1.00. FAIL against this lane until the orchestrator decides |
| **R68 sun white blob unfixed, no owner after the exit** (judge-eng-r1) | The bright-pass limit is built (`_bloomFold`, `uBrightMax = clampK × threshold`, `LOOK_BLOOM.clampK` 4.5, just above L-06's own sun at 4.4 ×) and graded in A-look-bloom (b): a white block is a clipped reach > 4 sun radii or a diagonal/axis reach > 1.2. Ownership: §6 asks that world-sky's W2 G-post allowance name L-07 | f2-b5, hot sun (40 × threshold): clipped reach **3.85** sun radii with the limit against **10.39** without, squareness 1.14 vs 1.23; L-06 sun 3.30 radii, squareness 1.13 (the disc alone 0.92). Remaining: the widest bloom mip still draws a faint square edge round the glow (§5.5) |


## 0b. Fix round 1 (Nov 12): what changed, by finding

Diagnostics run first (scratch `f1-b1`, one Chrome): the HDR dump of the look places, the shadow pass's
`getProgram` census, two-boot hashes of the look places, A-look-bloom, and A108 three ways (look, `?look=nolut`,
`?look=nodither`). Then the fix-round lane run `f1-b2` (§4). Every number below is from those runs or from node on
the HDR dump (`tools/look/hdr-look.mjs` and a scratch tuner over the same `look.js`).

| finding (judge) | what changed | measured |
|---|---|---|
| Hour bridge applies the L-03 EV; the W0 controls are not W0 | `_lookBridge` passes `withEv = false`; under ACES `_syncLook` sets exposure 0.94 exactly and never adopts an outside exposure write as EV (`engine.js` `_syncLook`, `_lookBridge`); the look places stage with `setLookHour(h, w, null, { ev: false })` so the gates show what play shows | f1-b3 film: the W0 column is ACES 0.94 at every hour (field 16:30 W0 p99 66.5; the judge's W0 column read 68.6 with the leaked +0.10 EV); f1-b3's churn diagnostic over 300 frames of the vista and the fight: `look.version` and `solveVersion` unchanged |
| V-look-grade, V-look-before-after, R54: sepia fold, brown shadows, darker top | grade v2 (`look.grade.json` v2, `look.js` `labStage`): the amber band rotated only −3° (a\* ×1.12 in the mids, b\* ×0.8), the olive band −6°, greens untouched, Orchil violets ×1.55; an L\*a\*b\* stage that shifts shadows toward rose, desaturates the top band and opens the top with a monotone tone curve on L\* (§1.2) | f1-b3 films, W0 → CALIMA on the same frames: lo20 hue field 71° → 32°, vista 61° → 11°, aim 71° → 35°, close 34° → 349°, dusk 55° → 328°; p99 field 66.5 → 68.2, vista 60.0 → 63.5, aim 64.7 → 66.7, close 55.3 → 59.3, dusk 29.8 → 37.6, noon 76.5 → 76.3; on the HDR dump violet max ≥ grass p90 (field 46.8 vs 42.0, aim 45.2 vs 41.6, close 47.3 vs 39.8; r4 42.2 vs 55.3) and the share of chroma pixels in one 30° band 98.3 % → 93.0 % (field), 98.3 % → 86.6 % (vista); A-look-frame-stats 18/40 bars (r4 14/40) |
| A-look-bloom (c) inert, halo/core 1.00 | the gate's 0.12 m probe disc at 40 m (5 px) was HIDDEN by the engine's small-mesh cull (`sizeCullPx`; a MeshBasicMaterial does not count as a glow): r4's and the judge's runs had no lamp in frame at all. The probes opt out (`userData.noSizeCull`), like a real lamp core (emissive, glow threshold). The threshold stays display-keyed (L\* 94) | f1-b1: halo/core **5.63** (bar ≥ 2.5), hue Δ 6.8° (≤ 15); (a) brightest noon ground L\* 86.8, folded bloom 0; (d) 0 % / 0 %; (b) still no sun disc (L-06) |
| A-look-suite (a) is within-page, not two runs | (a) now hashes every place on two BOOTS of the build in one run: the gate's page, then a fresh same-origin iframe boot of the same URL (boot 1 held, 0 draws); a diff sheet marks every differing pixel. The boot-dependent inputs found run by run and frozen in the look staging: the presentation clock (`engine.wallTime`), the hero's idle phases (settled with a seeded `Math.random` over 120 fixed 1/60 s steps), the free-roaming agents (hidden while staged) and the vegetation's history-dependent tree LOD sort (forced at the place) | f1-b1 before the settle: 8–11 % of pixels differed (Brea and the grass round her only), close 75 %; f1-b2 (clock snapped, first settle): Brea still differed (8–10 %, close 61 %); f1-b3 (her idle phases reset, Math.random seeded for the settle): **dusk bit-identical across boots**, the other four 0.01–0.41 % of pixels at ≤ 44/255; f1-b4 (free-roaming agents hidden): unchanged (0.013–0.409 %), so not the agents; the remaining pixels sat on distant trees: vegetation re-sorts tree LOD bands only after the lens has moved 'TREE_RESORT_DIST', so the bands followed each boot's camera history. The sort is now forced at the settled place and the grass rings re-scattered there (`vegetation.forceStream`). f1-b5 with the tree sort forced: **unchanged** (field 1831 px = 0.127 %, vista 187 = 0.013 %, aim 5846 = 0.406 %, close 1040 = 0.072 %, max 10–44/255; dusk identical). Across f1-b3, b4 and b5 the residual is the same size in the same boxes whatever was frozen, so it is systematic between the two boots of one run (the gate page and its iframe), not history: not yet attributed. Next diagnosis (one Chrome run): hide each draw owner in both boots and re-hash, and compare boot 1 across two separate runs (the spec's literal 'two consecutive runs') |
| A-alloc-rate guard: instruments-core over after the lamps.js grant | `Look#solveVersion` bumps only when the exposure, a slot name or the grade mix moves, or the slot mix moves ≥ 1/16; lamps.js keys its re-solve on it (the same two lines of the grant, no new line: 17 added / 8 removed); the engine's display-keyed bloom threshold (48 evaluations of the look) is cached on it | node: `evaluate` allocates ≈ 50 B and `invert` ≈ 400 B per call (boxed double returns), so a re-solve costs ≈ 4 KB; the bridge's 1/64 steps no longer trigger it; f1-b3: instruments-core **1.00×** (0.07 vs 0.07 KB/frame, 3.88 vs 3.98 KB/s); the lamp system ran 0 re-solves over 300 frames of the vista and of the fight |
| (found in this round) A-lamp-states wary rhythm fell under grade v2 | f1-b2: the display-keyed bloom key followed the grade's opened top down to HDR 1.68 and bloomed the wary core through its trough (rel. std 0.032); the key is now read on the AgX curve before the grade (`hdrForLstar(Ls, false)`: HDR 4.16 golden at EV 0), and the wary trough is solved for 0.76 of the peak on screen instead of 0.84 (the gate measures 0.64× of `look.evaluate`'s prediction: haze and bloom) — inside the grant's existing lines (17 added / 8 removed, unchanged) | f1-b3 0.039 → **f1-b4 0.062 PASS** (W0 twin 0.067); every other A-lamp-states check PASS; A-weak40's 13:00 clauses PASS; A-look-bloom (c) 8.33× |
| R48 (c) not closed | (1) the cull pass fills its caster pool and distances by index instead of `length = 0` + push (V8 dropped the backing store every pass), selects the nearest `budget` casters by bisection on distance instead of `sort` with a closure, and marks them in a byte array instead of a Set; (2) the shadow pass's program-key churn: three r169 renders every caster with one shared depth material whose `skinning` / `instancing` flip between consecutive casters, so `setProgram` re-derives the program (getParameters + cache key + join) 18 times a frame; skinned / instanced / batched casters now get a depth material shared by their kind (`engine._depthVariant`) | f1-b1 census: 18 `getProgram` per frame from MeshDepthMaterial, 2 from one transparent double-sided MeshBasicMaterial (three's two-pass double side); selection checked against sort in node (2000 random pools, 0 differences); f1-b3: `getProgram` per frame **20 → 2** on the vista and the fight (the remaining 2 are one transparent double-sided material, §1.7); `join` under ScenePass.render 1103 KB/s (judge) → 270–377 KB/s, getParameters / getProgramCacheKeyParameters out of the top list; `_cullVisit` 231–341 → 67–185 KB/s (what is left is first-sight work on newly streamed meshes: bounding spheres, userData flags); engine owner **0.558×** of its W0b baseline (120.7 vs 216.2 KB/frame; r4 0.71×) |
| A-look-ledger and A-gpu-attrib implement part of their bars | A-look-ledger: A21's W1-exit bars with every high item on (vista ≤ 17.0, herd ≤ 20.0, fight ≤ 17.0), shipped-mode `renderScale` median ≥ 0.95 (DRS restored for that read), the same bars on `low`, every enabled and landed item has a row (a tier knob the build reads during the run whose item registered no switch fails), 0 look draws outside post, render targets ≤ 170 MB and GPU bytes ≤ 450 MB with the look on; the pass bench for post items is recorded as a deviation for a ruling. A-gpu-attrib: every per-pass row is measured (shadow cascades, opaque, transparent + additive, GTAO, bloom, SMAA, shafts, overlay as skip-one marginals; the grade by its pass bench) and they must sum to the frame median within 10 % (no remainder row); every row ≥ 0.5 ms must name a fix owner in ROUND5-LOOK §4.2. The box witness is R45's (load < 3 and at most one gate Chrome, counted by profile) | f1-b2 and f1-b3 (quiet box by R45 both times): the post items cost L-01 +0.055, L-02 +0.028, L-07 ±0.005 ms per pass (≤ 0.45); RT 106.6 MB, GPU bytes 241.6 MB, shipped renderScale 1.00, every landed item has a row; it FAILs A21's W1-exit bars with every high item on (f1-b3: vista 17.94, herd 19.12, fight 19.45 ms against 17 / 20 / 17), which §4.6 rule 2 turns into an orchestrator decision (§6) |
| A108 fails under the look; the witness crop's +0.11 | measured three ways in one run (f1-b1): the full look, `?look=nolut` (AgX with no grade, no vignette, no dither) and `?look=nodither`: **all three fail the same way** (far108m control 0.26 / 0.261 / 0.261), so it is the AgX transform (L-01, mandated), not the LUT or the dither. The witness's +0.11 on "near dune grass": GTAO on reads 0.267 at lag (0, 6) and the stock (Round-4 defect) shader reads the **same** 0.26 at (0, 6): a 6-px row period that both shaders produce is real contact AO in the dune-ripple troughs, not the centre-sample lattice the witness guards (that lattice reads at lags like (5, −29)) | §5.3; needs a ruling |
| R68 (merged into this tree during the round; integration frames a1): haze stacks up, a milky Pans vista | read a1's V-biome-vista-pans and V-look-before-after beside my own: on the integration build the look places have lavender skies, a sun and p99 86–95, and the CALIMA column reads within −4…0 L\* of W0 at the top; the Pans vista is milky. The grade's tone curve no longer lifts the toe (identity below L\* 15; it put 6 at 6.8 and 15 at 16.4): the grade keeps the shadow tint, the aerial term owns distance (R68). **Made after the last Chrome run; not re-run here** (round trip ≤ 0.37/255, ramp strictly increasing, tokens 0/255 in node); the a1 sun blob: §6 | graded on the next integration frames (R68 a) |
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

### 1.2 L-02 / L-14 — the grade (`src/core/look.grade.json` v3)

Display space after AgX, baked per **grade set** into a 32³ **half-float** RGBA LUT (look.js `gradeSet` →
`bakeLut`; RGBA8 texels carried up to ±0.5 LSB of rounding each, which trilinear filtering turned into a ripple):
split tone by luma, a soft-shoulder contrast about a pivot, saturation by luma, LCh hue bands, then **the L\*a\*b\*
stage** `lab` (look.js `labStage`). The four LUTs are baked once at boot; the GPU holds **two slots** (`CAL.lookLutA/B`,
2 × 256 KB) blended by `uLutMix`, refilled by one 256 KB upload only when a slot's set changes. Vignette 0.28 in the pass.

**The L\*a\*b\* stage after fix round 2** (every term is per set in `look.grade.json`):
- `tone` — a monotone cubic on L\* (Fritsch–Carlson): identity below L\* 15 (R68: the toe is not lifted), 30 → 30.6,
  45 → 48.6, 60 → 67.5, 72 → 81, 85 → 92.5, 95 → 98. **`toneC` [15, 45, 0.5]** (new): the lift fades with chroma — full
  for near-neutrals (sky, cloud, salt), half for saturated colours. sRGB holds little chroma for orange at L\* 90, so
  lifting a gold highlight 82 → 90 had cost it half its chroma.
- `shadow` — below L\* 8–30 (golden) or 12–45 (dusk), (a\*, b\*) × `chroma` + `shift`; **`cRange` [20, 40]** (new):
  near-neutral warm darks only, so firelit ground, skin and cloth in shade keep their own hue. Blues and violets are
  outside the gate's 20–100° hue window: they keep the whole shift, so the stage stays invertible near the sRGB floor.
- `mid` — the warm mids (L\* 22–72, hue 35–100°): b\* × `b`, then **`rotate`** (new): golden −8°, dusk −6° toward
  orange, with the chroma kept (1-TR's mid hue is 49°). The v2 a\* × 1.12 is gone.
- `high` — the top band (L\* 64–90): chroma × `chroma` + `shift`, **limited to near-neutrals by `cRange` [10, 22]**
  (new; sky and cloud tops go cream, gold keeps its chroma), and **`warm`** [40, 95, 15, 1.22, 50, 78] (new): warm hues
  above L\* 50–78 get back × 1.22 of the chroma AgX's path to white takes (sunlit gold, fire, sun glow).
- **Gamut mapping** (new, look.js `labInGamut`): a colour the stage moves out of sRGB loses chroma at its own L\* and
  hue (14-step bisection) instead of a per-channel clamp, which had turned lifted oranges lemon (#FFC070 hue 74 → 86).

| set | soft contrast | sat by luma | hue bands | lab: shadow | lab: mid | lab: top band |
|---|---|---|---|---|---|---|
| golden | 1.08 @ 0.42 | 0.95 / 1.00 / 1.00 | olive 88–118° −8°, × 1.0; amber 50–88° −2°, × 1.04; greens × 1.0; violets × 1.7 | L\* 8–30: × 0.9 + (6.5, −4), cRange 20–40 | b × 0.95, −8° | near-neutral × 0.6 + (0.5, −1.5); warm × 1.22 |
| dusk | 1.08 @ 0.42 | 0.95 / 1.00 / 1.00 | the same bands, amber / olive × 0.97 | L\* 12–45: × 0.85 + (6, −9), cRange 20–40 | b × 0.8, −6° | near-neutral × 0.6 + (1.5, −2.5); warm × 1.22 |
| noon | 1.08 @ 0.42 | 0.95 / 1.08 / 0.95 | olive 0°; amber +3° (back toward straw), × 1.0; violets × 1.7 | L\* 8–30: + (1.5, −2.5), cRange 20–40 | — | near-neutral × 0.85 + (0, −0.5) |
| calima | 1.06 @ 0.42 (L-14 split tone kept) | 0.95 / 0.97 / 0.92 | r4 bands | × 0.95 + (2, −4) | — | near-neutral × 0.7 + (1, −1) |

**Why v3** (fix round 2, judges' R54 findings). v2 read as a rose-brown filter, muddier than W0: its top band took
chroma × 0.42 from every highlight, the mid a\* × 1.12 turned yellows salmon, the lifted oranges were clamped lemon,
and the shadow shift turned firelit ground pink and the dusk camp magenta. Through the output at 17:45 (HDR probes,
`f2/tune2.mjs`; W0 → v2 → v3): dim fire C 45 → 25 → 45, hue 82 → 61 → 67; sunlit grass C 43 → 26 → 39; mid grass
39 → 30 → 37; firelit ground at dusk hue 57 → 33 → 46, C 47 → 33 → 39; the golden-set display probes #FFC070 C 51 → 23
→ 37 and #FFB060 C 56 → 31 → 42 at their own hue. v3 was tuned on the **v2 HDR dump** (tools/look/hdr-dump.gates.mjs:
what the output pass tone-maps, GTAO and bloom folded in, every other device pixel of the staged look places — its
statistics match the gate's to 0–0.6 L\* in the darkest fifth, where the v1 dump without AO read 5–8 L\* too light).

**Invert.** Grade v3 lifts violet chroma × 1.7, where the grade's local gain passes 2 and `look.invert`'s undamped
fixed-point step oscillated: with 2048 random targets per slot pair and 3 seeds, 1–5 of them missed by > 1/255 (and the
committed v2 already missed 2–4 of 4096 at 5–68/255; the gate's 512 never drew one). The step is now damped (× 0.5
after 4 iterations, up to 40): **0 misses** in 3 × 4 × 2048 targets, worst 0.5/255; the lamp tokens 0/255; ≈ 13 µs a call.

The hour table `hourEv` carries ROUND5-LOOK L-03's EV offsets; `setLookHour` applies them unless called with
`{ ev: false }`. **They are world-sky's** (L-03): neither the bridge nor the look places apply them (fix round 1).

### 1.3 L-07 — bloom retune

Strength 0.48, radius **0.3** (fix round 2; was 0.72), mip factors [0.55, 0.65, 0.85, 1.05, 1.25], tint (1.00, 0.97, 0.93), bright-pass limit 4.5 × the threshold (fix round 2);
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

**Fix round 2 — the bright-pass limit (R68 b, the a1 sun blob).** The folded bloom's bright pass now limits its
output to `uBrightMax` in luminance, hue kept (`_bloomFold` adds three lines after three's own `gl_FragColor = mix(...)`
anchor; `engine.bloomClampReady` says the anchor was found). Under the L-07 bloom `uBrightMax = clampK × threshold`
(`LOOK_BLOOM.clampK` 4.5: just above L-06's own sun, sunCol × 40 = 4.4 × the threshold); under the W0 bloom there is no limit (1e9), so `?look=w0` is unchanged.
`engine._bloomClampK` overrides it for diagnostics (0 = off). A lamp core (1.25–2 × the threshold) is untouched; a sun
at 40 × the threshold stops saturating the low mips. Measured on the planted sun (A-look-bloom b): f2-b2 (radius 0.72, limit 8 ×) lift +3.2 L\* at 6 radii, FAIL; f2-b3 parameter
sweep on the L-06 sun at 6 radii: 0.48 / 0.72 → +3.2, 0.48 / 0.3 → **+6.7**, 0.7 / 0.4 → +10.8 (clipped reach 3.3–4.0);
f2-b5 shipped (strength 0.48, radius 0.3, limit 4.5 ×): **+6.6**, clipped reach 3.30 sun radii, hot sun 3.85 vs 10.39
without the limit. Radius 0.3 keeps strength 0.48, so nothing else gets brighter: the lamp halo (c) is 9.1 × its core and
A-lamp-states passes (f2-b5).

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
  the boot-dependent inputs the diff sheets showed, one run at a time: `engine.wallTime` (sky, wind, grass sway,
  birds) is snapped to the next multiple of 4096 s; the hero is settled deterministically (her idle's breath, shift,
  blink and fidget phases reset, `mixer.setTime(0)`, `Math.random` a seeded generator for the 120 sim steps of exactly
  1/60 s, restored after; `stageLook(name, { settle: false })` skips it); free-roaming agents (machines, NPC crowds,
  fauna, pooled VFX) are hidden while a place is staged (`{ agents: true }` keeps them); and the vegetation's tree LOD
  sort, which otherwise follows the lens's history, is forced at the settled place with the grass rings re-scattered
  there (`vegetation.forceStream`).

- **Fix round 2: history-free staging** (`stageLook`, A-look-suite a). f2-b1's per-owner diagnosis (`X-suite-diag`: every
  place staged twice per boot, then each top-level scene owner rendered alone and hashed, in this page and in a fresh
  iframe boot) showed that the same place staged twice in ONE boot hashed differently, and that terrain, grass,
  props, water and the hero differed between boots on their own. Rebuilt from the frozen lens at every capture now:
  (1) the grass pools (they refill on a 4–12 ms per-frame time budget after the lens moves 2 m) are filled
  synchronously at the lens; (2) every mesh the engine's small-mesh cull holds hidden by hysteresis is un-hidden and
  the cull pass re-runs once at the frozen lens; (3) every shadow cascade is redrawn at the place (far-cascade cadence
  1 while staged, restored by `unstage`); then f2-b3's boot-to-boot diff of all 167 numeric uniforms found one more:
  (4) the environment's `calCloudDrift` (cloud shadows on every lit surface) integrates wind × dt from boot, so it
  starts every staging at 0 and is restored by `unstage`; (5) unnamed top-level Sprites (transient markers) are hidden
  with the agents. A warm pass (every place staged once before the shots) also runs in each boot.
  `stageLook(name, { heroRel })` overrides the hero's heading; `LOOK_PRELUDE` is exported for tooling rows.

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
  a frame): its owner sets `forceSinglePass = true` (§6, `datapoint-slates`, `src/items/datapoints.js:271`: progression's file).

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
engine.bloomClampReady                     // fix round 2: the bright-pass limit is installed (three's high-pass anchor found)
engine._bloomClampK                        // diagnostic override of LOOK_BLOOM.clampK (0 = no limit; null = shipped); call _syncLook(true)
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

## 4. Gate results (port 5251, this tree)

Fix round 2 runs: **f2-b1 … f2-b5** (§0; scratch `.../scratchpad/r5/look-post/f2/`). Fix round 1 runs (scratch
`/private/tmp/claude-501/-Users-kevinliu-Horizon-Zero-Claude/db31a0fa-9701-46f4-8234-5158425c1e49/scratchpad/r5/look-post/`):
**f1-b1** (19:30 UTC, diagnostics), **f1-b2** (21:37–22:24, the lane block, its aliases and the global list, 55 rows, grade
v2 first cut "c6"), **f1-b3** (23:37–23:56, the rows the last changes touch: grade v2 final "c8", the ungraded bloom key,
the depth-variant key, the hero settle). r2–r4 are in this file's git history.

### 4.1 The look-post block (final: f2-b5 unless marked)

| row | result | measured (run) |
|---|---|---|
| A-look-suite-files (b, c, f) | **PASS** (f2-b3) | self-test and fixture within bars; refs.json numbers only; 0 reference SHA-256 matches in the tree |
| A-look-tonemap (a–d) | **PASS** | 0.02 → L\* 9.92, 0.18 → 50.21, 1.6 → 86.12; GPU vs evaluate ≤ 0.541/255; invert round trip 0.028/255; tokens 0/255; skews 4.76° …; ramp strictly increasing |
| A-look-suite (a, d, e) | **PASS** | (a) all five places bit-identical across two boots in one run AND across two consecutive invocations (b5 / b5s: identical boot-1 and boot-2 hashes); (d) depth bins; (e) WebGL canvas |
| A-look-frame-stats | FAIL (light-limited clauses, §5.1; ruling asked) | 19/40: field 3/9, vista 7/11, aim 2/9, close 4/7, dusk 3/4 (§0); LUT texels = look.js within 0.562/255; look on at medium and low |
| A-look-random | FAIL (§5.1) | f2-b4: 0/12 (best poses 2–3/9: p99 52–69, clip 0, the W0 keys' sky) |
| A-look-bloom (a–d) | **PASS** | (a) noon ground folded bloom 0; (b) planted L-06 sun +6.6 L\* at 6 radii, monotonic, clipped reach 3.30 radii (hot sun 3.85 vs 10.39 unlimited), squareness 1.13 / 1.14; (c) halo/core 9.1, hue Δ −1.4°; (d) 0 % / 0 % |
| A-csm-layer-masks | **PASS** (f2-b3) | CASTER_ONLY 0 view draws, cascades [0, 1, 2]; CASCADE0_ONLY cascade [0] |
| A-hold-frame | **PASS** (f2-b3) | held frames 0 draws (10/10), resumed frame 0 % different |
| A-gpu-attrib (+ box) | FAIL (f2-b3, box quiet by R45, load 2.18) | skip-one rows sum 30.7 / 24.5 / 28.3 ms against frames 18.7 / 20.0 / 18.8 (vista / herd / fight): the marginals are superadditive on this GPU (bloom skip-one 6.2–7.4 ms against 0.23 ms in its own readback-fenced pass bench); bloom ≥ 0.5 ms has no §4.2 fix owner. The row needs the orchestrator's quiet-box W1-exit run (R45) and a §4.2 owner for bloom; the per-pass method is the open question (§5.4) |
| A-look-ledger (+ box) | FAIL (f2-b3, quiet) | items +0.052 / +0.029 / +0.003 ms; A21's W1-exit bars missed with every high item on (vista 18.16, fight 19.84 > 17; herd 19.17 ✓); §4.6 rule 2 is the orchestrator's |

### 4.2 Reading the films (f2-b5, 1600 × 900, beside the panels and a1)

Read beside ext:kevin-nov6-keyart.jpg@860d7e9f#1-TR, #1-MR, #1-TL, #1-BL, #1-MC, ext:kevin-nov6-board.jpg@f2694e04#2-MR and the
a1 integration frames (R68 a). Films: `f2/b5/shots/gates/V-look-*.png`, `X-look-play-fire.png`.
- **V-look-before-after (1/2).** Field 16:30: CALIMA is orange-gold where W0 is mustard; its shadows are rose-amber
  (lo20 hue 45°, W0 71° olive) and the pines stay green; chroma 24.5 vs 21.9, p99 64.4 vs 66.5. Not muddier than W0 now:
  the grass keeps its gold, and the sunlit back grass in aim is cream-gold rather than v2's salmon. Vista 19:00: both
  are the W0 keys' salmon fog; CALIMA's shadows rose (18° vs 61°). Aim 17:45: as field (chroma 27.9 vs 25.6). Beside
  1-TR the frames still lack its light: a bright lavender sky, sun haze and receding layers (world-sky / world-props).
- **V-look-before-after (2/2).** Close 18:45 (re-staged, §0): Brea's face is keyed warm by the low sun from beyond
  the lens, with a readable shadow side on the far cheek; no crushed face (crush 0.22 %). This is 1-MC's lighting
  idea at the stand-in's level; the skin itself (sheen, catch-light) is character-art's. Dusk 19:45: violet-rose,
  not brown (lo20 335°). Noon: neutral, the same straw yellow as W0.
- **V-look-grade.** (1) rock and cloth shadows rose, not olive or brown; (2) the grass amber-gold; (3) Brea's violet
  is vivid but she stands with her back to us in shade, and the red wrap tail (hero-body's asset colour) is the
  most saturated thing in the field frame; (4) no crushed black.
- **V-look-highlights.** The planted L-06 sun reads peach-white with an orange glow, never lemon. With the limit, a
  sun at 40 × the threshold no longer blooms into R68's white block (clipped reach 3.85 radii against 10.39 without
  the limit, filmed side by side). A faint square edge to the outer glow is still visible (§5.5).
- **V-look-glow.** The hostile (magenta) and calm (cream) discs carry soft halos; nothing diffuse glows at noon.
- **Play frame (`X-look-play-fire`, not a graded row).** At 19:54 the camp under CALIMA is warm with an orange fire
  pool, no longer magenta (f2-b1). At 17:45 the CALIMA frame is still rosier than W0, and the fire core reads
  peach-white where W0 has it yellow-white. That is AgX's path to white on the hottest fire pixels; the grade gives the
  dim fire and the glow their chroma back (C 45 / 18, the same as W0). I read it as warmer-pink than the
  panels' firelight and flag it for the judge (§5.5).

### 4.3 Inherited and global rows (f2-b3, 09:56–10:47 UTC, this tree with grade v3 first cut; f2-b4 where marked)

| row | result | note |
|---|---|---|
| A-gpu-tier(-box)@look-post | **PASS** (f2-b4) / FAIL (f2-b3) | f2-b3 (quiet box, load 2.16): f2-b4 (quiet box, load 2.21): POC vista **12.71** ms (≤ 13), empty 5.20 (≤ 7), 59.9 fps, p95 18.4 ms. f2-b3 read vista 13.20 (samples 13.05 / 13.33 / 13.07 / 16.10, instability 1.23) on the same chain; f1-b2 12.55. The row sits ≈ 0.3 ms under its bar with ±0.3 ms run to run; the look's own passes cost ≈ 0.09 ms (A-look-ledger) |
| A-rt-ledger@look-post | **PASS** | 127.27 MB (≤ 170) |
| A22-msaa@look-post | **PASS** | SMAA-only path |
| A109-ao-distance-fade@look-post | **PASS** | |
| A108-ao-periodicity@look-post / -w0 | FAIL / **PASS** | f2-b3: `ultra@2 mid46m` no longer the worst (the control holds the ripples); fails: high@1.25 far108m control 0.267 (content), ultra@2 3 crops content-limited, witness blind. §5.3: the dune ripples under AgX, ruling asked |
| V20, V33b, V-gpu-tier-look @look-post | NEEDS-JUDGE (filmed f2-b3) | |
| A-lamp-canon-distance@look-post | **PASS** | min ΔE 24.7 across 28 tokens |
| A-lamp-states@look-post / -w0 | **PASS** / **PASS** | f2-b3 and f2-b4 (grade v3, bloom radius 0.3) |
| A-weak40@look-post / -w0 | PENDING / PENDING | every 13:00 clause PASSES; the calima clause awaits world-sky (R46) |
| A-brea-contrast@look-post | **PASS** | salt 6.18:1, sand ΔE 21.8, 23.9 % ≥ 3:1 |
| A1-boot-clean, A20b, A22b-fov-recompile | **PASS** | |
| A9-perf-budget | **PASS** | 241 draws, 59.9 fps, p95 18.2 ms, scene GPU 19.32 ms (quiet box, load 1.99) |
| A21-real-draw-calls | FAIL (GPU term, quiet box) | draws 248 / 183 / 275, triangles 3.66 / 3.87 / 3.94 M PASS; GPU vista 19.33, herd 37.38, fight 20.53 ms against 14 (load 1.91, quiet: f1-b2 read the same 19.39 / 37.31 / 20.54 as PENDING on a busy box). Not this lane's frame: the look's passes are ≈ 0.09 ms of it (§4.6 rule 2, §6) |
| A90-memory-stability, -expansion, A90b, A90-rig-reclaim, A90-abs | **PASS** | A90-abs heap control 0.996×, GPU control 1.02× |
| A-alloc-rate | FAIL (baseline guard; R67: lane judges grade the guard) | engine **0.557×** of its W0b baseline (120.4 vs 216.2 KB/frame); offenders: world-sky 1.126× (3.04 vs 2.70 KB/frame; `environment.js` untouched by this lane: 1.019× f1-b2, 0.974× f1-b3, 1.19× the judge's run — the same row swings ±15 % run to run) and instruments-core 1.143× per frame (0.08 vs 0.07 KB/frame: one hundredth of a KB of rounding; per second 1.075×). No lane file of mine allocates per frame: the grade's new terms are LUT-bake work at boot and the lamps re-solve only on `look.solveVersion` |
| A-vram-ledger | **PASS** | |
| A-no-horizon-terms-code / -player | **PASS** | 1371 = ratchet; 1503 ≤ 1508 |
| A-ID-ip-assets-gone, A-assets-tracked | **PASS** | |
| A-licence-manifest | PENDING | third-party clause (pipeline's re-fetch rows; no asset added by this lane) |
| A-port-guard | PENDING | "not a full lane run" |
| A-carried-suite | not run in the mixed list (R48 d: its own invocation, orchestrator) | |

## 5. Honest gaps

### 5.1 The light-limited palette clauses (ruling asked; graded FAIL until then)

The grade-owned terms were re-cut in fix round 2 (§0, §1.2). What stays out of reach on the stand-in map is the light:
under the W0 keys the stand-ins have a dim pink-grey sky, no sun disc and no sea, so the frame's brightest tenth is
sunlit grass, p99 sits at 58–66 and nothing clips. The same transform on the integration build (R68's a1 frames,
`/Users/kevinliu/.calima-r5/int/frames/a1/V-look-before-after.png`, tiles measured with `tools/look/stats-core.mjs`)
reads very differently, because there the top of the frame is world-sky's sky and sun:

| frame (CALIMA column) | p99 | clip % | hi10 chroma | spread | bars met |
|---|---|---|---|---|---|
| a1 field (16:30, the Pans) | 85.7 | 0 | 8.9 | 69.7 | 2/9 (the Pans' black sand: lo20 hue 349, mid b\* 6.9, chroma 11.2) |
| a1 vista (19:00) | 95.4 | 6.4 | 14.8 | 74.4 | **10/11** |
| a1 aim (17:45) | 88.9 | 0.02 | 13.5 | 75.6 | 5/9 |
| stand-in field, f2-b5 | 64.4 | 0 | 30.9 | 51.4 | 3/9 |

So p99, clip, spread and hi10 chroma follow the sky and the sun; the grade cannot make them without blowing out or
desaturating the gold the judges asked to keep (v2 tried the latter: hi10 × 0.42, and read as a filter). Field's lo20
L\* 20–30 is 1-TR's haze-lifted valley shade; lifting it in the grade is the stacked haze R68 forbids ("neither lifts
black on its own"). These clauses wait for the ruling of §6 (graded on the integration frames).

### 5.2 Places are stand-ins

`gatePlaces.look.*` is world-props' (day-1 stub, not started). The gates stage the stand-ins of
`tools/look/places.mjs` on the W0 map and say so in every detail. No Ring, cliff, sea or Pans in them: the likeness
rows can be graded on light and palette only until world-props, world-ground and world-sky land.

### 5.3 A108 under the look (must-stay-green, inherited) — measured, needs a ruling

A108 FAILs under the look and PASSES on the W0 output (`@look-post-w0`) in the same run. **Fix round 2 corrects
fix round 1's attribution of `ultra@2 mid46m`**: it is not the grade's toe (the judge measured 0.304 with the toe
removed), and it is not GTAO. f2-b1 filmed the crop (diagnostic `X-a108-crops`, the same POC page, `ultra` at DPR 2,
"the pan from 14 m", crop [0.1, 0.6], 256 × 256 device px) with GTAO off and on, through the look and through `?look=w0`:

| output | GTAO off (the control) | GTAO on | where GTAO changes the crop (|on − off| × 8) |
|---|---|---|---|
| the look (AgX + grade) | **0.334 @ (0, 4)** | 0.293 @ (0, 4) | only round the grass tufts' feet (real contact AO) |
| `?look=w0` (ACES) | 0.119 @ (2, −19) | 0.129 @ (2, −14) | the same tufts |

The 4-px row period is **the dune ripples** — wind ripples in the pan's sand, rows 4 device px apart at 46 m from 14 m
up — and it is there with GTAO **off**. ACES's toe crushes the dark sand between the ripple crests (L\* 25–35 on
screen), so the ripples' contrast never reached A108's 0.15; AgX shows that sand (the spec's "no crushed blacks") and
the ripples become the crop's strongest period. The control itself moves between runs (0.341 f1-b1, 0.14 f1-b2/b3 and
the judge's run, 0.334 f2-b1) because the crop also holds grass tufts, which the survey excluded ("no grass in them")
and which the POC now scatters there: the more grass in the crop, the weaker the normalised ripple peak. GTAO adds
energy only at the tufts' feet (contact AO), never a screen-locked lattice; the witness crop's +0.11 is the same
story (stock and shipped GTAO read the same 0.26 at (0, 6)). Crops: `f2/b1/shots/gates/X-a108-crops.png`, `-w0.png`.

So A108 under AgX is a **crop-survey** question: the far and mid crops chosen under ACES (Round 4, ROUND5-ENGINE §3.6)
are content-limited under AgX (ultra@2: mid47m 0.62 and mid41m 0.60 controls, and now mid46m), and three
content-limited crops fail the configuration as "unmeasured". The lane cannot change the row (engine-gpu's file, and
no bar moves). **Options for the orchestrator** (any one): (1) measure A108's AO term on a fixed display transform
(`?look=w0`, which the twin runs and passes); (2) a grant to re-survey A108's crops and witness under the look
(ROUND5-ENGINE §3.6's procedure, grass-free crops); (3) measure on scene-linear luminance (the HDR scene target, before
the output pass). Until one lands, A108@look-post stays a FAIL against this lane.

### 5.4 Quiet-box and per-pass timing on ANGLE/Metal

The segment timer queries the spec planned for L-18 do not work on this machine's ANGLE/Metal (per-query times
land on the first query of a command buffer even with a flush). L-18 per-pass rows are therefore skip-one marginals on
the whole-frame timer that A21 itself reads, with an all-off interaction test for the 10 % sum rule. The raw segment
timings are still reported (`segmentTimersRaw`) for when the platform can time them. L-16 A/Bs post items on their
own pass (`engine.benchPass`, 1-pixel readback fences; gl.finish does not wait on ANGLE/Metal) because a whole-frame A/B at 18–20 ms frames is ±1–3 ms of noise.

### 5.5 Not done this wave

- **The bloom's square outer edge.** three's UnrealBloom samples its widest mip (50 × 28 texels at 1600 × 900) bilinearly,
  so a very bright source draws a faint square outline at the edge of its glow. The limit removed the white block, but
  this edge is still visible on the planted suns (V-look-highlights). The fix is a B-spline (4-tap bicubic) upsample of
  mips 3–4 in the composite; it is not built in this round (it needs a Chrome run to prove it compiles and keeps (b) and
  (c)). Owner: L-07 / the G-post holder.
- **AgX's path to white on fire cores.** The hottest fire pixels read peach-white under AgX where ACES made them
  yellow-white, and the 17:45 play frame is rosier than W0 (§4.2). The grade restores the dim fire's and the glow's
  chroma, but not the core's: its hue there is AgX's. A next step, if the judge reads it as a defect, is a warm-hue
  bias in the CALIMA look's shoulder (`look.slope`), measured against the lamp tokens.

- U-03 is the engine half only (`holdFrame`); shell-ui wires it in W2.
- L-14's calima set exists and is gated (A-look-tonemap b); the calima weather is world-sky's, so it is never shown
  in play yet.
- three's own uniform-upload allocation inside `ScenePass.render` (`setValueV3f` / `setValueM4`, ≈ 4.3 MB/s) scales
  with draws and distinct materials; it is not an engine policy and is not changed here (§1.7).

## 6. What other lanes and the orchestrator must do

- **Orchestrator — rulings asked (open since fix round 1; fix round 2 adds evidence; none has been granted, so every
  row below stays a FAIL against this lane until one is).**
  1. **A108** (§5.3, corrected attribution): the `ultra@2` row period is the pan's dune ripples, present with GTAO
     off and crushed out of sight by ACES's toe; the crops are content-limited under AgX. One of: (1) measure A108's AO
     term on `?look=w0` (the twin passes); (2) a grant to re-survey its crops and witness under the look (grass-free
     crops); (3) measure on scene-linear luminance.
  2. **The light-limited palette clauses** of A-look-frame-stats and A-look-random (p99 ≥ 88–90, clip, p95 − p5,
     field lo20 L\* 20–30, field/aim hi10 chroma ≤ 16–18) and V-look-highlights' sea glints: the stand-in map under the
     W0 keys has no bright sky, no sun disc and no sea (§5.1, with the a1 integration numbers). I ask for them to be
     graded on the integration frames (R68 a) once world-sky's keys and world-props' places land. The grade-owned
     clauses are fixed or measured in §0 and graded now.
  3. **A-look-ledger's pass bench** for post items (unchanged ask).
  4. **gates-perf's A-alloc-rate owner table**: map `/src/core/look.js` to the engine row (unchanged ask).
  5. **A-look-bloom (b) on the integration frames**: the stand-in has no sun; (b) is graded here on L-06's disc planted
     at the sun's bearing (§1.3). Grade it again on world-sky's real disc (calSun) in the next integration run, and
     tune `LOOK_BLOOM.clampK` against a1's sun with world-sky there (the limit is the knob).
- **Orchestrator — merge.** With the bridge EV fixed, `look.agx: false` on `high` is the Round-5 W0 output exactly
  (ACES 0.94 at every hour). Grade v2 no longer loses top brightness against W0 on the look places (f1-b3 at full resolution: p99
  −0.2 (noon) … +7.8 (dusk) L\* against W0) and reads warm-light / violet-rose-shadow instead of sepia; I recommend merging it on, and
  the R54 judge's films (§4.2) decide. **§4.6 rule 2 cuts across that:** A-look-ledger (quiet box by R45 in f1-b2
  and f1-b3) shows A21 missing its W1-exit bars with every high item on (fight 19.45 > 17, vista 17.94 > 17 in f1-b3)
  while the look's own items cost ≈ 0.09 ms; read literally, L-01/L-02 stay off on `high` at the W1 exit
  (FAIL-deferred) until A21 is recovered (W-01, I-04, L-10). That is the orchestrator's call at the W1-exit global run;
  `look.agx: false` / `look.grade: false` on `high` is the switch, and the look stays on at every other tier.
- **Orchestrator — the W1-exit global run.** L-18 then L-16: `cd <scratch> && nice -n 10 node <tree>/tools/look/gpu-attrib.mjs --port 5270`,
  then `.../tools/look/ab-time.mjs --port 5270`; each runs its gate with its box row and prints the §4.2 / §4.3 table.
  The W0 / nolut / nodither twins (lane `look-post-diag`) are diagnostic and need not run in the global list.
- **world-sky + orchestrator (R68 b, the a1 sun blob).** Fixed in L-07 (§1.3): the bright-pass limit is built and
  measured on a planted sun; the W0 bloom (`?look=w0`, the left column of the before/after films) keeps no limit, so
  a1's W0 column will still show the block. **Ownership after the W1 exit:** L-07's bloom terms (`LOOK_BLOOM`, the
  limit, `_bloomFold`) are in `src/core/engine.js` under G-post, which passes to world-sky in W2 (plan §1.2); world-sky's
  W2 allowance should name L-07 explicitly so the knob has an owner.
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
  re-derivations a frame on the vista and the fight): set `forceSinglePass = true` (`datapoint-slates`, `src/items/datapoints.js:271`: progression's file).
- **shell-ui (W2).** `engine.holdFrame(on)` for full-screen menus; refit `CALIMA_DISC` through `engine.look`.
- **hero-body (observation, r4).** In the close stand-in Brea's idle once showed her left arm raised behind her head
  (V-look-before-after-2, r4). Not reproduced in fix round 1: in f1-b2 and f1-b3 the close frame shows the head wrap's tail behind her head, no arm (the hero is now settled at a reset idle phase before the shot).

## 7. Files (this lane)

`src/core/engine.js` (G-post: the output pass, look sync, bloom parameters, layer masks, `holdFrame`, the
`?look=` diagnostics, and R48 (c)'s cull-pass and shadow depth-variant fixes), `src/core/look.js` (new),
`src/core/look.grade.json` (new, v3), `src/instruments/lamps.js` (grant: 17 added / 8 removed lines, unchanged in
count by fix rounds 1 and 2), `src/hero/sheets.js` (grant: 4 / 1), `tools/gates.r5.look-post.mjs` (new),
`tools/look/{stats-core,look-stats,places,three,gpu-attrib,gpu-attrib-page,ab-time,ab-time-page,hdr-look}.mjs`,
`tools/look/hdr-dump.gates.mjs` (tooling, `--extra` only; v2 in fix round 2: GTAO and bloom folded in, 800 × 450 per place,
rows X-look-hdr-dump-1..4), `tools/look/places.mjs` (fix round 2: the close stand-in on the vista rise with `heroRel`), `tools/look/{refs.json,fixture.json,fixture.png}` (numbers; a
procedural 320×180 fixture, project-original, not under `public/`), this report. No asset under `public/`, so no
`LICENSES.json` row. Lint `namecheck --code` PASS (1371 = ratchet). Fix round 2 touched `src/core/engine.js` (the bright-pass limit, `LOOK_BLOOM`
radius / clampK), `src/core/look.js` (the L\*a\*b\* stage terms, gamut mapping, the damped invert), `src/core/look.grade.json`
(v3), `tools/gates.r5.look-post.mjs` (history-free staging, the planted sun and the white-block measure, the highlight
film, `LOOK_PRELUDE` export), `tools/look/places.mjs`, `tools/look/hdr-dump.gates.mjs` and this report; lamps.js and
sheets.js are unchanged.
