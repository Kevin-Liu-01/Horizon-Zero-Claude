# CALIMA — ROUND 5 lane `look-post` (W1) report

Lane `look-post` (port 5251, judge 5281; R66 i). Grant **G-post** over `src/core/engine.js` (post chain
only), new `src/core/look.js`, `src/core/look.grade.json`, `tools/look/**`, `tools/gates.r5.look-post.mjs`,
this report, and the W1-exit grants on `src/instruments/lamps.js` (≤ 25 lines) and `src/hero/sheets.js`
(≤ 10 lines). Spec: `docs/ROUND5-LOOK.md` §3.1 (L-00, L-01, L-02, L-07, L-14, L-16, L-18), §4, §5.1–5.3, §7.
References are cited `ext:<file>@<sha8>#<panel>` (ROUND5-LOOK §0.2); none is copied into the tree.

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

### 1.2 L-02 / L-14 — the grade (`src/core/look.grade.json`)

Display space after AgX, baked per **grade set** into a 32³ **half-float** RGBA LUT (look.js `gradeSet` →
`bakeLut`; RGBA8 texels carried up to ±0.5 LSB of rounding each, which trilinear filtering turned into a ripple with
the period of the texel crossings across smooth gradients, 5–30 px, and A108 read it as content periodicity):
split tone by luma (shadow tint weighted 1 − smoothstep(0.05, 0.45), highlight smoothstep(0.55, 0.95)), contrast
about a pivot, saturation by luma (shadow / mid / highlight), then LCh hue work (75–110° rotated toward amber
with less chroma, greens damped, Orchil violets lifted). Sets: `golden`, `noon`, `dusk` and **`calima`** (L-14:
shadow (1.04, 0.95, 0.98), saturation 0.95). The four LUTs are baked once at boot (CPU 4 × 384 KB half + decoded, ≈ 80 ms);
the GPU holds **two slots** (`CAL.lookLutA/B`, 2 × 256 KB) blended by `uLutMix`, refilled by one 256 KB upload
only when a slot's set changes (never per hour). Vignette 0.28 in the pass.

**Tuned against the frames, not the first numbers.** The first build used ROUND5-LOOK's numbers as written
(linear contrast 1.06 about 0.45, saturation by luma 0.92 / 1.05 / 0.85, the olive band's chroma × 0.85). On the
HDR dump of the look places (`tools/look/hdr-dump.gates.mjs` → `hdr-look.mjs`, the same eight frames through the
W0 output and through the look) it read flatter and greyer than the W0 output it replaces: p99 −6…−10 L\*, the
brightest tenth's chroma 43 → 33, the grass tan instead of amber, faces in shadow flat. Shipped instead:

| set | contrast (soft, about pivot) | sat by luma (shadow / mid / high) | shadow tint (range) | olive band | violets |
|---|---|---|---|---|---|
| golden | 1.25 @ 0.40 | 0.95 / 1.08 / 0.95 | (1.05, 0.92, 1.10) (0.05–0.50) | −12°, chroma × 0.95 | × 1.10 |
| noon | 1.15 @ 0.40 | 0.96 / 1.05 / 0.95 | (1.02, 0.96, 1.05) | −8°, × 0.95 | × 1.06 |
| dusk | 1.15 @ 0.40 | 0.92 / 1.06 / 0.95 | (1.03, 0.90, 1.14) (0.05–0.55) | −14°, × 0.90 | × 1.12 |
| calima | 1.06 @ 0.42 | 0.95 / 0.97 / 0.92 | (1.04, 0.95, 0.98) | −10°, × 0.90 | — |

The contrast is a **soft-shoulder curve** (slope `contrast` at the pivot, 0 and 1 fixed: h(t) = tk / (1 + (k−1)t)
on each side): a linear contrast above 1 clipped every value above pivot + (1 − pivot)/k to white, flattened the top
103 of 400 steps of the grey ramp, and made `invert` ill-posed on the plateau. The hour table `hourEv` carries
ROUND5-LOOK L-03's EV offsets (noon 0, 16:30 +0.10, 17:45 +0.15, 18:45 +0.25, 19:20 +0.40, 19:45 +0.70, night
+1.30; the morning mirrors them) and `setLookHour` applies them unless called with `{ ev: false }`.

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
  version                                  // bumps on every change a CPU copy must follow
  exposure, baseExposure, ev, setA, setB, lutMix, gradeMix, vignette, bloomScale, luts, sets
}
export function setsForHour(grade, h, weather = null, calimaWeight = null, out = { a, b, mix, ev })
export function agxLook(x, look, out), agxLookInv(y, look, out), calSigmoid(x), agxSigmoidInv(y),
       gradeSet(c, set, out), bakeLut(set, size = 32) -> { half: Uint16Array, f32: Float32Array, size },
       sampleLut(lut, size, c, out), toHalf(v), fromHalf(h),
       calibrateExposure(look), oetf(c), eotf(v), srgbToLab(c, out), labToSrgb(lab, out)
export const AGX_MIN_EV, AGX_MAX_EV, SH_XMAX, SH_YMAX, SH_A, SH_K, LOOK_DEFAULT, LOOK_EXPOSURE_NOMINAL
```

`src/core/engine.js` (G-post):

```js
engine.look                                // the live Look
engine.lookActive                          // getter: AgX in force (look.evaluate describes the screen)
engine.setLook(state)                      // -> engine.look; applied on the next rendered frame
engine.setLookHour(h, weather = null, calimaWeight = null, opts = null)   // world-sky: sets + hour EV ({ ev: false } keeps yours)
engine.setLookEnabled(on)                  // false = the Round-5 W0 output (ACES 0.94, W0 grade, W0 bloom)
engine.registerLookItem(id, { owner, estMs, title, set(on), get() })   // -> engine.lookItems (Map)
engine.gpuAttrib(on = true) / engine.gpuAttribTake()                   // L-18 raw timer segments
engine.benchPass(pass, n = 100)            // L-16: ms per pass render (readback fences); measurement only
engine.holdFrame(on = true)                // U-03: a held render() submits nothing
engine.disposeLook()                       // the two LUT slots
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
no EV). The first `setLookHour` call stands it down for good. It exists so the merged game shows the hour's
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
| A-look-tonemap (e, f) | see aliases | A-lamp-canon-distance PASS; A-brea-contrast PASS (5.85:1 salt, ΔE 22.8 sand, 27.6 % ≥ 3:1); A-weak40 every 13:00 clause PASS (calima clause PENDING world-sky); A-lamp-states colour, iris, beams PASS, wary rhythm FAIL in r3 (fixed in r4, §4.3); A-sighting-hue is shell-ui's row (not in this tree) |
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

R4_PLACEHOLDER

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

### 5.1 The palette bars are the light's, not the transform's

A-look-frame-stats, A-look-random and the likeness rows (V-look-grade, V-look-highlights, V-look-random) cannot pass
on the W0 map under the W0 keys whatever the grade does, and the grade must not be pushed into a colour filter to
fake them. Measured on the HDR dump of the places (the same HDR through both outputs):

| frame | W0 lo20 hue → CALIMA | mid b\* | p99 | what the panel has that the frame does not |
|---|---|---|---|---|
| field 16:30 | 77 → 60 | 22 → 27 | 73 → 68 | lavender sky (b\* < 0), rose mesas, a sun-side haze at L\* 90+ |
| vista 19:00 | 66 → 54 | 25 → 32 | 60 → 60 | the sun disc and the sea glint (p99 93, clip 3 %) |
| aim 17:45 | 76 → 59 | 30 → 34 | 70 → 66 | backlit haze, violet distance |
| dusk 19:45 | 72 → 54 | 13 → 22 | 30 → 37 | a violet dusk sky (2-MR mid b\* −5.6) |
| close 18:45 | 7 → 21 | 25 → 32 | 56 → 57 | sky catch-light, skin sheen (L-04, C-01…) |

The transform moves the shadows ≈ 15° toward rose and lifts crushed blacks; the mids stay yellow because the
frames are ochre ground under an orange fog with no blue-violet sky in them; the top stays low because the keys put
the brightest pixels at HDR 0.4–0.6, which AgX shows at L\* 65–70 (ACES at 75–81). **For world-sky (L-03):** under
AgX the sky dome and the sun need roughly +0.5…+1 EV of radiance against the ACES-era keys for the top of the frame
to read as bright as before (0.18 still shows at L\* 50; 1.0 shows at 82 against ACES's 93).

### 5.2 Places are stand-ins

`gatePlaces.look.*` is world-props' (day-1 stub, not started). The gates stage the stand-ins of
`tools/look/places.mjs` on the W0 map and say so in every detail. No Ring, cliff, sea or Pans in them: the likeness
rows can be graded on light and palette only until world-props, world-ground and world-sky land.

### 5.3 A108 under the look (must-stay-green, inherited)

A108 FAILs under the look and PASSES on the W0 output in the same run (`A108-ao-periodicity@look-post-w0`). GTAO adds
nothing (on − off ≤ +0.01 on every crop): the failure is the instrument's own content check — the far crop
`far108m` (the pan from 14 m) and the mid crops read GTAO-off control peaks of 0.26 (far) and 0.30–0.61 (mid) under
the look against 0.02–0.10 under ACES, so they are "content-limited" and the witness cannot see the stock defect over
the control. The cause is visible in V33b's frames: the dune ripples and grass rows, which ACES crushed into black,
read under AgX's toe as a regular pattern. r4 re-measures with the half-float LUT (§1.2). If it still fails, the
fix is a re-survey of A108's crops on the look (docs/ROUND5-ENGINE.md §3.6's procedure, engine-gpu's gate file:
**an orchestrator grant or ruling is needed**; this lane may not edit `tools/gates.r5.engine-gpu.mjs`).

### 5.4 Quiet-box and per-pass timing on ANGLE/Metal

The segment timer queries the spec planned for L-18 do not work on this machine's ANGLE/Metal (per-query times
land on the first query of a command buffer even with a flush). L-18 per-pass rows are therefore skip-one marginals on
the whole-frame timer that A21 itself reads, with an all-off interaction test for the 10 % sum rule. The raw segment
timings are still reported (`segmentTimersRaw`) for when the platform can time them. L-16 A/Bs post items on their
own pass (`engine.benchPass`, 1-pixel readback fences; gl.finish does not wait on ANGLE/Metal) because a whole-frame A/B at 18–20 ms frames is ±1–3 ms of noise.

### 5.5 Not done this wave

- R48(c): the engine row is at 0.71× of its W0b allocation baseline (the cull visit is hoisted), but
  `ScenePass.render` still allocates ≈ 8.7 MB/s inside three's `renderer.render` (the "program-key churn") and the
  caster pool re-grows after `length = 0` every 0.1 s (≈ 0.46 MB/s). Not fixed: both need a profile-guided change to
  the cull and the render path that this wave's G-post scope does not cover; the orchestrator sets engine.js's
  absolute alloc bars (R53) and decides.
- U-03 is the engine half only (`holdFrame`); shell-ui wires it in W2.
- L-14's calima set exists and is gated (A-look-tonemap b); the calima weather is world-sky's, so it is never shown
  in play yet.


## 6. What other lanes and the orchestrator must do

- **Orchestrator.** (1) Decide A108 (§5.3): a ruling or a grant to re-survey its crops on the look. (2) The
  look items sit behind `QUALITY_TIERS.<tier>.look` (`agx`, `grade`, `lut`, `bloomRetune`): if Kevin's 5173 should
  not show the CALIMA look before world-sky's keys land, set `agx: false` on `high` at the merge (that is the W0
  output, bit for bit). My recommendation is to merge it on: the shadows and faces read better and the palette moves
  the right way; the darker top is world-sky's to raise with the keys (§5.1). (3) L-18 then L-16 in the W1-exit
  global run: `cd <scratch> && nice -n 10 node <tree>/tools/look/gpu-attrib.mjs --port 5270`, then
  `.../tools/look/ab-time.mjs --port 5270` (each runs its gate with its box row and prints the §4.2 / §4.3 tables).
  (4) ROUND5-LOOK L-07's threshold numbers (1.30 / 0.35) and L-02's grade numbers changed for measured reasons
  (§1.2, §1.3); the doc should carry the shipped values. (5) The W0 twins (`<id>@look-post-w0`, lane
  `look-post-diag`) are diagnostic and need not run in the global list.
- **world-sky.** Call `engine.setLookHour(hour, weather, calimaWeight)` when the hour or weather moves (it applies
  the hour EV unless `{ ev: false }`), `engine.setLook({ bloomScale })` per weather, and register L-04/L-05/L-06/L-09
  with `engine.registerLookItem`. Re-key L-03 against AgX (§5.1). In W2 (G-post passes to you): the
  `onAfterScene` hook for L-08 (note: A21's timer wraps `composer.render` only, so the post-SMAA shafts pass is
  outside A21 today), L-12, L-17, the L-14 dusk set (a `dusk` set exists; tune it, do not add a slot).
- **world-props.** Publish `ctx.props.gatePlaces.look.*` in the `tools/look/places.mjs` record shape.
- **instruments-a / world-ground (I-04, W-01).** `CAL_LAYER` per §2; keep hit proxies on layer 0.
- **shell-ui (W2).** `engine.holdFrame(on)` for full-screen menus; refit `CALIMA_DISC` through `engine.look`.
- **hero-body (observation).** In the close stand-in (18:45, sim frozen at timeScale 0 after the place settles),
  Brea's idle shows her left arm raised behind her head (V-look-before-after-2, row 1). Kevin's bar is never an arm
  behind the head; if this is a real idle pose and not a frozen transition, it is hero-body's.

