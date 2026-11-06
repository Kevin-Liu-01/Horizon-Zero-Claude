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
- Ports by grant: `src/instruments/lamps.js` (18 lines added, 7 removed: `readOutputParams` reads `engine.look`
  when AgX is in force, `_solve` calls `look.invert` in place of the ACES branch, the per-frame change test and
  the signature include `look.version`, and the wary trough is re-solved for the ACES-era on-screen depth: under
  AgX the wary core sits in the shoulder, where the HDR trough 0.55 read as 0.88 of the peak on screen against
  0.84 under ACES, and A-lamp-states' rhythm term fell to rel. std 0.0375 against > 0.05; the trough is now
  solved so the screen reads 0.84 again, ≈ 0.46 in HDR) and `src/hero/sheets.js` (4 added, 1 removed:
  `screenPixels` tone-maps through `engine.look.toneMap` under AgX). Both keep their ACES branches for
  `setLookEnabled(false)`.
- **Output dither** (±0.5 LSB, a PCG-style integer hash of the pixel: no lattice, no time dependence, so shots
  stay bit-identical): AgX's gentler haze and sky gradients step in 8 bits every 5–30 px; the dither breaks the
  stairs (and A108's autocorrelation then reads content, not quantisation stairs).
- **Diagnostic** `?look=w0` (on the page, or on the page hosting the Pans POC iframe) boots on the Round-5 W0
  output; the gate block carries `<id>@look-post-w0` twins of A108, A-weak40 and A-lamp-states for that reason.

### 1.2 L-02 / L-14 — the grade (`src/core/look.grade.json`)

Display space after AgX, baked per **grade set** into a 32³ RGBA8 LUT (look.js `gradeSet` → `bakeLut`):
split tone by luma (shadow tint weighted 1 − smoothstep(0.05, 0.45), highlight smoothstep(0.55, 0.95)), contrast
about a pivot, saturation by luma (shadow / mid / highlight), then LCh hue work (75–110° rotated toward amber
with less chroma, greens damped, Orchil violets lifted). Sets: `golden`, `noon`, `dusk` and **`calima`** (L-14:
shadow (1.04, 0.95, 0.98), saturation 0.95). The four LUTs are baked once at boot (CPU 4 × 128 KB, ≈ 60 ms);
the GPU holds **two slots** (`CAL.lookLutA/B`, 2 × 128 KB) blended by `uLutMix`, refilled by one 128 KB upload
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
L\* 93 and is full by L\* 96, at the hour's exposure (≈ 2.8 / 5.4 scene-linear at EV 0 on the golden set).
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
  estimated ≥ 0.10 ms A/B'd alone and the rest as one group, 4 interleaved rounds, rows ≤ 0.45 ms, draws ≤ 350.
- `tools/look/gpu-attrib.mjs` + `tools/look/gpu-attrib-page.mjs`: `engine.gpuAttrib(on)` cuts the frame into
  consecutive timer-query segments (scene:pre, scene:shadow, scene:opaque, scene:transparent via a zero-vertex
  sentinel, then each composer pass and each onAfterRender hook); per-owner hide-one marginals over gates-perf's
  `DRAW_OWNERS`, the all-hidden floor and the interaction residual; the build (git SHA, tree, dirty count) first.

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
  version                                  // bumps on every change a CPU copy must follow
  exposure, baseExposure, ev, setA, setB, lutMix, gradeMix, vignette, bloomScale, luts, sets
}
export function setsForHour(grade, h, weather = null, calimaWeight = null, out = { a, b, mix })
export function agxLook(x, look, out), agxLookInv(y, look, out), calSigmoid(x), agxSigmoidInv(y),
       gradeSet(c, set, out), bakeLut(set, size = 32), sampleLut(data, size, c, out),
       calibrateExposure(look), oetf(c), eotf(v), srgbToLab(c, out), labToSrgb(lab, out)
export const AGX_MIN_EV, AGX_MAX_EV, SH_XMAX, SH_YMAX, SH_A, SH_K, LOOK_DEFAULT, LOOK_EXPOSURE_NOMINAL
```

`src/core/engine.js` (G-post):

```js
engine.look                                // the live Look
engine.lookActive                          // getter: AgX in force (look.evaluate describes the screen)
engine.setLook(state)                      // -> engine.look; applied on the next rendered frame
engine.setLookHour(h, weather = null, calimaWeight = null)   // world-sky: the sets for an hour / a weather
engine.setLookEnabled(on)                  // false = the Round-5 W0 output (ACES 0.94, W0 grade, W0 bloom)
engine.registerLookItem(id, { owner, estMs, title, set(on), get() })   // -> engine.lookItems (Map)
engine.gpuAttrib(on = true) / engine.gpuAttribTake()                   // L-18 per-pass segments
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

GATE_TABLE_PLACEHOLDER

## 5. Honest gaps

GAPS_PLACEHOLDER

## 6. What other lanes and the orchestrator must do

ACTIONS_PLACEHOLDER
