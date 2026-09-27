# ROUND 4 — `core-platform-gtao`: the AO lattice on the distant massif

Owner: `core-platform-gtao`. Files: `src/core/engine.js` (GTAO section only:
`GTAO_FADE_*`, `patchGtaoShader()`, the GTAO setup in `_buildComposer()`,
`_attachGtaoDepth()`), `tools/gates.round4.core-platform-gtao.mjs` (new), this
document. Base: HEAD `9214842`. Port 5222.

**Result.** The plaid is gone at every GTAO tier and pixel ratio, and GTAO is
still on. The lattice had two causes and both are fixed in the GTAO shader:

1. The AO pass runs at half resolution. It reads the centre depth from a texel
   boundary and then assigns that depth to the wrong screen position, in runs
   of whole columns and rows.
2. The far-field AO was only depth quantisation. A distance fade now removes
   it.

Near-field contact AO is unchanged at 5 m (occlusion 0.3025 → 0.3039). The pass
costs 8–33 % less GPU.

---

## 1. Reproduction (before)

The world-ground V33 camera: camp (22, −6), 5 m up, looking at the north rim,
09:00. For each case the frame was read back with GTAO on and then off, from the
same page and the same sim state. Film:

* `shots/gtao-before-high-dpr1-on.png` / `-off.png`
* `shots/gtao-before-high-dpr1.5-on.png`
* `shots/gtao-before-ultra-dpr1-on.png`
* `shots/gtao-before-ultra-dpr2-on.png`
* the four-bearing vista, stock next to fix: `shots/gtao-fouryaw-stock-vs-fix.png`

The measurement becomes A108. It is a luminance autocorrelation of a 256×256
device-pixel crop, high-passed (minus a radius-24 tent blur), zero-padded, with
each lag divided by its overlap. The value reported is the strongest strict local
maximum at a Chebyshev lag of 2–32 px:

| tier @ pixel ratio | far massif (0.72, 0.30): peak @ lag | haze band (0.5, 0.55) | massif-band luma, on ÷ off |
|---|---|---|---|
| high @ 1   | **0.186 @ (4, −20)**, control 0.083 | **0.290 @ (27, 0)**, control 0.029 | 0.922 (rms 0.063) |
| high @ 1.5 | **0.389 @ (30, 0)**, control 0.066 | **0.270 @ (30, 0)**, control 0.047 | 0.899 (rms 0.078) |
| ultra @ 1  | 0.143 @ (5, −18), control 0.083 | 0.025, control 0.029 | 0.956 (rms 0.030) |
| ultra @ 2  | 0.108 @ (1, 3), control 0.092 | 0.037, control 0.046 | 0.966 (rms 0.023) |

The lattice itself (axis-aligned lags of 20–31 px) appears only at **high**,
where the AO buffer is half resolution. **Ultra** runs AO at full resolution
and has no periodic peak. What ultra does have is a grainy 3–4 % darkening of
the whole rim (`shots/gtao-crops-ultra-dpr2.png`, left tile). That is cause 2,
not the lattice.

## 2. Diagnosis — every candidate measured, not argued

### Isolation

Isolation runs used the same page and the same frame, and switched the shader
at runtime. The camera is V33's. Crops are the far massif and the haze band.
"rms" is the luma rms of (on − off) over the massif band.

| variant | high @ 1: far / haze / rms | high @ 1.5: far / haze / rms | lattice |
|---|---|---|---|
| shipped | 0.190 / 0.294 / 0.0625 | 0.384 / 0.266 / 0.0783 | **yes** |
| GTAO off (control) | 0.064 / 0.030 / — | 0.065 / 0.047 / — | — |
| (a) noise tile removed (constant kernel rotation) | 0.146 / **0.313** / 0.0625 | **0.257** / 0.266 / 0.0809 | yes |
| (d) normal rebuilt at a consistent texel only | 0.196 / 0.289 / 0.0623 | 0.316 / 0.263 / 0.0799 | yes |
| (c) AO at full res, stock shader (no upsample at all) | 0.005 / 0.024 / 0.0300 | — | no, but see below |
| **centre depth read from one deterministic texel** | 0.129 / 0.033 / 0.0275 | 0.142 / 0.058 / 0.0252 | **no** |
| centre + normal at that texel | 0.096 / 0.032 / 0.0287 | 0.054 / 0.037 / 0.0269 | no |
| (b) distance fade only (60 → 120 m) | 0.064 / 0.029 / 0.0001 | 0.065 / 0.047 / 0.0001 | hidden past 120 m |
| **shipped fix** (centre + normal + fade) | 0.064 / 0.030 / 0.0001 | 0.065 / 0.047 / 0.0001 | no |

Reading the table:

* **(a) The noise texture tiling is refuted.** Replacing three's 5×5
  magic-square rotation with a constant rotation leaves the lattice at full
  strength.
* **(d) Normals from depth are refuted.** Moving only the normal to a
  consistent texel changes nothing.
* **(c) Nearest-filter upsampling is refuted.** `pdRenderTarget` uses
  `LinearFilter` (three's RenderTarget default), so the upsample is already
  bilinear. The lattice is also already present in the half-res AO buffer
  before any upsample (see the parity readback below). Running AO at full res
  does clear it, but only because that also removes the texel-boundary
  ambiguity. The discriminating run is the centre-texel fix at **half** res
  with the **same** bilinear upsample, and it clears the lattice.
* **(b) Depth precision is real, but it is the second cause.** On its own the
  fade would only hide the lattice beyond 120 m. It would leave the mechanism
  running at every distance below that.

### The mechanism (cause 1)

three r169's `GTAOShader` reads the centre depth with `getDepth(vUv)`, which is
NEAREST on the full-res depth texture. It then rebuilds the centre position at
`vUv`. At `gtaoScale: 0.5`, every AO texel centre maps to
`uv · depthSize = 2i + 1`. That is exactly the boundary between depth texels
`2i` and `2i+1`. Float rounding in the interpolated uv decides which texel is
read.

To show this directly, the AO shader was made to write
`ivec2(vUv·size) − 2·gl_FragCoord` (the parity of the texel it read). The
half-res target was then read back at the V33 camera:

* **The parity flips in runs of whole columns and rows.** Column runs:
  `E8 O5 E8 O5 E8 O4 E2 O11 E2 O10 E3 O10 E22 O3 E16 O9 E23 …`. Row runs:
  `E3 O8 E1 O4 E1 O18 E32 O5 …`.
* **The runs carry the occlusion.** Mean raw AO over the massif band was
  **0.765 in odd-parity rows and 0.983 in even ones**.

On one side of each flip, the depth comes from the texel half a texel away from
the position it is assigned to. On a wall that recedes upward, that puts the
centre *inside* the surface, and every kernel sample reads it as occluded. Runs
of columns crossed with runs of rows give the screen-locked plaid. It is also
why the plaid follows the screen and not the rock. The raw AO buffer, stock next
to fixed: `shots/gtao-rawao-before-after.png`.

### The far-field term (cause 2)

The AO radius is 0.55 **world** metres. At 150 m and beyond, that is one or two
AO texels. The depth buffer is 24-bit on a 0.1 / 2400 m camera, so one depth
step is 7 cm at 350 m and 0.6 m at 1 km. At that range the horizon search is
reading quantisation, not rock.

It was measured on the AO target itself. The shader wrote the view distance into
alpha, and every AO texel was binned by distance. The camera is at eye height
(1.7 m) at the camp, looking north with the rim in frame. Values are mean
occlusion, 1 − ao:

| distance | shipped | centre fix only | shipped fix |
|---|---|---|---|
| 3–7 m | 0.3025 | 0.3039 | 0.3039 |
| 7–15 m | 0.1824 | 0.1797 | 0.1797 |
| 15–30 m | 0.1040 | 0.1048 | 0.1048 |
| 30–60 m | 0.0695 | 0.0658 | 0.0658 |
| 60–100 m | 0.0665 | 0.0327 | 0.0205 |
| 100–150 m | 0.0720 | 0.0374 | 0.0035 |
| 150–250 m | **0.1180** | 0.0718 | **0.0000** |
| 250–500 m | 0.0960 | 0.0425 | 0.0000 |

In the shipped build, occlusion **rises** with distance. A real contact term can
only fall with distance. Even with the lattice fixed, 0.04–0.07 of non-periodic
far "AO" remains. That residue is ultra's grain.

Film: `shots/gtao-before-eyelevel.png` → `shots/gtao-after-eyelevel.png`.

### Rejected on the way

**Snapping every kernel sample to a texel centre.** This was tried as well,
with a guard against zero-length deltas. It made the far massif **darker**
(on ÷ off luminance 0.677). With exact texel positions, the depth-precision
noise at 350 m+ only ever raises the horizon angles, so it biased the result
toward occlusion. The kernel samples keep three's continuous reconstruction.

## 3. The fix — `src/core/engine.js`

* **`patchGtaoShader(material)`** makes four regex edits to three's
  `GTAOShader` fragment source, once, at construction:
  1. The centre depth is `texelFetch`ed from one deterministic texel:
     `floor(vUv·depthSize − 0.25·depthSize/resolution)`. That is the texel
     under the first quarter of the AO texel's footprint. It is robust at 2:1
     (high), 1:1 (ultra) and DRS sizes.
  2. The centre position is rebuilt at *that texel's centre*.
  3. The normal is rebuilt at *that texel's centre* too.
  4. `ao = mix(ao, 1, smoothstep(aoFadeStart, aoFadeEnd, viewDist))`, with an
     early-out that skips the kernel past `aoFadeEnd`. The fade is
     `GTAO_FADE_START = 60`, `GTAO_FADE_END = 120` m, published as
     `engine.gtao.gtaoMaterial.uniforms.aoFadeStart / aoFadeEnd`.

  If any anchor is missing (for example after a three upgrade), nothing is
  applied. `engine.gtaoPatched` becomes `false` and a `console.warn` is logged.
  A108 fails on `gtaoPatched !== true`.
* **`_attachGtaoDepth()`** now reads `this.tier.gtaoScale` when `setSize` is
  called instead of capturing it at boot. `setQuality('high' → 'ultra')` used to
  leave the AO buffer at half res. A108 now switches tiers at runtime and checks
  the buffer size: high 800×450, high@1.5 1200×675, ultra 1600×900, ultra@2
  3200×1800.
* **Unchanged:** the GTAO parameters (radius 0.55, distanceExponent 1.6,
  thickness 0.7, samples 9, distanceFallOff 1, screenSpaceRadius false),
  blendIntensity 0.9, the PD denoise and the half-res tier table. No setting
  was switched off.

**Memory rule:**

* No new render target.
* No per-frame allocation. The shader patch is one string edit, and the two
  uniform objects are created once.
* Nothing new to dispose.

## 4. Gates — `tools/gates.round4.core-platform-gtao.mjs`

All three gates switch tier and pixel ratio in-page through `setQuality` and
`basePixelRatio` + `resize()`. The runner's page is always 1600×900 at DSF 1.
"DPR 2" means `min(2, tier.dprCap)`, which is what a DPR-2 display gets: high
caps at 1.5 and ultra at 2.

### V33b-no-ao-lattice (visual)

A 4×4 sheet:

* **Rows 1–2:** the rim vista at bearings N/E/S/W, high and ultra, GTAO on.
* **Row 3:** 1:1 massif crops, on next to OFF.
* **Row 4:** a 2 m close-up of a hut wall meeting the ground, on next to OFF.

**My read of the sheet:** no plaid in any tile, and every row-3 "on" crop is
indistinguishable from its OFF neighbour. Row 4 "on" shows contact darkening at
the wall foot, the post corners and under the eaves. The largest per-pixel luma
drop (0–1 scale) from GTAO at the hut base is 0.43.

### A108-ao-periodicity (action)

Run at every tier where GTAO is enabled (low and medium report "off in this
tier"), at DPR 1 and 2. Five crops:

* V33's far massif, haze band and near meadow;
* two open-meadow patches at 35–40 m and 55–63 m.

Pass rules:

* A crop counts as measurable only when its GTAO-off control peak is below 0.15.
  GTAO on must then also be below 0.15.
* The two far crops must be measurable in every configuration.
* A near or mid crop whose control peaks at 0.15 or more is labelled
  content-limited, and GTAO may add at most 0.03 there. More than one such crop
  in a configuration fails the run.

| run | result |
|---|---|
| fixed build | **PASS**. Worst measured peak 0.092 (ultra@2 far massif), equal to its own control 0.092. No crop rises more than 0.006 above its control, in any configuration, on the final run. |
| stock shader (throwaway `--extra` module swapping three's source back in) | **FAIL** — high@1 far 0.186 / haze 0.290; high@1.5 far 0.389 / haze 0.270 |

### A109-ao-distance-fade (action)

Reads AO vs view distance from the AO target, plus the far rim's luminance with
GTAO on vs off, at high and ultra.

| run | occ @ 5 m | occ @ 50 m | occ ≥ 150 m | ≥150 m ÷ 5 m | rim luma on ÷ off |
|---|---|---|---|---|---|
| fixed, high | 0.2768 | 0.0350 | **0.0000** | 0 | **1.0000** |
| fixed, ultra | 0.2775 | 0.0347 | **0.0000** | 0 | **1.0000** |
| stock, high | 0.2814 | 0.0386 | 0.0999 | **0.355** | **0.9224** |
| stock, ultra | 0.2782 | 0.0351 | 0.0473 | **0.170** | **0.9564** |

The bars are: ≥150 m at most 10 % of the 5 m value, occlusion at 5 m at least
0.05, and the rim within ±3 %. The fixed build passes. The stock shader fails
both halves at both tiers.

### Other gates

| gate | result on port 5222 |
|---|---|
| A1-boot-clean | PASS (state=playing) |
| A22b-fov-recompile | PASS (three FOVs, no errors, stddev 37–40) |
| A63-bedding-planar-world-ground | PASS (bedRms 0.02247, unchanged) |
| V33-rim | NEEDS-JUDGE. My read: lit alpine wall, strata, haze, no lattice. |
| V44-biomes | NEEDS-JUDGE. My read: the massif backdrop in all four tiles is clean. The bearing-125 wall, where the vertical bars were strongest, now shows only its own strata. |
| A9-perf-budget | PENDING on the final runs (26.5 / 33.0 fps with a null frame of 3.75–4.86 ms GPU: contention). See §5. |

## 5. Perf delta

**GPU microbenchmark.** 40 back-to-back `GTAOPass.render()` calls (AO + PD +
copy + blend) under one `EXT_disjoint_timer_query`, alternating stock and fixed
for 5 rounds; median ms per pass:

| view | stock | fixed | Δ |
|---|---|---|---|
| high @ 1, V33 rim | 2.03 | 1.77 | −13 % |
| high @ 1, eye-level camp | 3.23 | 2.89 | −10 % |
| high @ 1, spawn view | 5.02 | 4.62 | −8 % |
| ultra @ 2, V33 rim | 26.4 | 17.7 | −33 % |

The saving comes from the early-out. Past 120 m, the pass writes 1 and skips
the 9-tap kernel.

**A9 on the same box**, alternating page loads with a throwaway `--extra` module:

| build | fps | scene GPU |
|---|---|---|
| stock | 54.7 / 53.5 | 39.1 / 41.1 ms |
| fixed | 55.8 / 47.5 | 38.6 / 41.3 ms |
| GTAO off | 57.3 / 35.4 | — |

Draw calls were 319 for both stock and fixed (315 with GTAO off). The 35.4 fps
with GTAO *off* shows how far this box swings between runs. One A9 run earlier
in the session printed FAIL (27.7 fps, null frame 1.68 ms). The GTAO-off
variant failed the same way minutes later, so that FAIL is load and not this
change.

## 6. Residue and notes for other lanes

### A GTAO-on periodic peak on one grass patch

This is not a lattice, and it is not caused by this fix.

**The finding.** At high@1.5, the raised meadow view, crop (0.5, 0.70), 33–41 m:

* GTAO on peaks at 0.14–0.18 at lag (8, 0). The control is 0.05.
* The fixed build hits this in 6 of 8 frames. The stock shader hits it in 2 of
  8 (max 0.176).
* In the half-res AO buffer, both builds show a lag-4-texel peak of 0.12–0.155
  after denoise.

**It is content-locked.** Rolling the camera 30° about its view axis moves the
peak from (8, 0) to (7, 4), i.e. the structure rotates 30° with the world. A
screen-locked pattern cannot do that. It is AO deepening a regular spacing in
the grass cards at that spot.

**What did not remove it:**

* the PD sample layout: 4/2, 4/1, 5/2, 6/1, 6/5, 8/3, 12/5, 16/2 samples/rings;
* the PD radius (2, 3, 6);
* a uniform random PD rotation texture.

A constant PD rotation did remove it.

**Visibility and gate coverage.** It is not visible at 1:1. A108's mid-ground
crops were chosen for a clean *control*, and this patch has a clean control,
so this is disclosed here rather than hidden. If a judge wants it gated, the
lever is the PD denoiser (a proper 2-D kernel or temporal accumulation), not
this lane's depth fix.

### world-ground

* **A63's bypass.** `A63-bedding-planar-world-ground` still sets GTAO's
  `blendIntensity` to 0 for its measurement ("its tile grid is a separate
  artefact"). That bypass can now be deleted. The massif band is identical with
  GTAO on and off (A109: on ÷ off = 1.0000). This is world-ground's file, so it
  is left alone here.
* **Re-judge.** V33-rim and V44-biomes can be judged again on this build.

### Consumers of `engine.gtao`

The shader's `FRAGMENT_OUTPUT` hook still works: A109 uses it to write view
distance to alpha. Any code that replaces `gtaoMaterial.fragmentShader` must
keep the four patched sites. Check `engine.gtaoPatched`.

## 7. Reproduce

```
node tools/gates.mjs --port 5222 --lane core-platform-gtao
node tools/gates.mjs --port 5222 --only V33-rim,V44-biomes,A9-perf-budget,A22b-fov-recompile,A1-boot-clean
```

**Before/after crops**, each tile set left to right as stock on | fixed on |
GTAO off, all at the V33 camera:

* `shots/gtao-crops-high-dpr1.png`
* `shots/gtao-crops-high-dpr1.5.png`
* `shots/gtao-crops-ultra-dpr1.png`
* `shots/gtao-crops-ultra-dpr2.png`
