# ROUND 4 — lane `world-ground` API contract

What `src/world/terrain.js`, `vegetation.js` and `water.js` publish for the other
lanes. Frozen unless this document says otherwise; the Round-3 surface
(`getHeight` / `getNormal` / `isInTallGrass` / `tallGrassDensity` / `WORLD_SIZE`
/ `PLAY_RADIUS = 330`) is unchanged and additive-only.

## terrain

```js
terrain.getHeight(x, z)            // analytic height, metres. THE authority.
terrain.getNormal(x, z, out?)      // unit normal from getHeight
terrain.heightFast(x, z)           // bilinear off the RENDER mesh grid (1.94 m
                                   // nodes) — ~40x cheaper, and it returns the
                                   // surface that is actually DRAWN. Scatter
                                   // passes and streamed grass use this.
terrain.slopeFast(x, z)            // |grad h| off the same grid (1.0 = 45 deg)
terrain.tallGrassDensity(x, z)     // 0..1 concealment field
terrain.isInTallGrass(x, z)        // tallGrassDensity > 0.45
terrain.surfaceAt(x, z)            // NEW — see below
Terrain.SURFACES                   // NEW — the closed list of surface names
```

### `terrain.surfaceAt(x, z)` — new, additive (audit `audio-04`, gate A58)

Returns one of `Terrain.SURFACES` for any point in the world. Consumers must
treat the list as closed and fall back on an unknown value rather than
switch-defaulting to silence.

| value | where it is |
|---|---|
| `grass` | the meadow — 69 % of the play disc |
| `dirt` | worn trails and the camp approach |
| `gravel` | the SE highland shelf and trail shoulders |
| `cobble` | the shingle bars in the river cut |
| `silt` | the dried bed either side of the ribbon |
| `water` | inside the river ribbon's waterline |
| `rock` | bare faces above the treeline and on the rim |

Measured on a 3 m grid over the play disc: all seven appear, each above the
gate's 200-sample floor. `audio` selects a footstep set from this; nothing else
should assume a value is present at a given coordinate.

### rim / boundary geometry

`PLAY_RADIUS` is still 330 and the escarpment across it is real geometry, not an
invisible wall (`camera-feel-12`): the rim lifts from `r = 276`, the boundary
face adds 22–36 m across 28 m of ground at `r = 324..352`, and the massif
crest measures 200–430 m above the valley floor. `terrain.cliffMeshes` (3
instanced buttress slabs) and `rim-scree` (talus fans + the apron at the foot of
the wall) are registered with `ctx.collision` on the first update that finds it.

## vegetation

```js
vegetation.group                   // everything scattered; hide it to A/B
vegetation.grassDensityAt(x, z)    // candidates/m^2 before slope + keepout
vegetation.countGrassNear(x, z, r) // live instance count inside a disc
vegetation.forceStream(x, z)       // synchronous re-scatter (~120 ms) — call
                                   // this after any teleport before measuring
vegetation.grassStats()            // { near, mid, far, caps, chunks, fade }
vegetation.treeStats()             // per-LOD tree counts
vegetation.windAt(x, z, t?)        // the same gust field the shader bends with
vegetation.displacers              // the four live uActors slots (read-only)
```

### actor displacers (`stealth-grass-interaction`)

Four world-space slots (`uActors[4]` — `xy` position, `z` radius, `w` strength)
shoulder the blades aside, and the slot's strength decays after the actor leaves
— that decay *is* the spring-back. **No lane has to call anything**: slot 0 is
always the player (radius tightens when crouched) and slots 1–3 track the three
nearest live machines inside 60 m of the camera, re-picked every frame with no
sort and no allocation. `vegetation.displacers` is exposed for gates and debug
only; treat it as read-only.

## water

```js
water.pools                        // [{ x, z, level, rx, rz }] — unchanged
                                   // contract (glinthawk flock, gate V8)
water.levelAt(x, z)                // surface height, or null off the water
water.depthAt(x, z)                // metres of standing water, 0 on dry ground
water.flowAt(x, z, out?)           // unit XZ downstream direction
```

`depthAt` is what `player-control` should wade against and what `audio` should
use for the water bed; the ribbon pinches shut on its own where the bed rises,
so `levelAt` returning `null` is the normal case across a ford.

## what this lane consumes

* `environment.fogParams` — the aerial-perspective contract. The terrain, the
  cliffs, the far ranges and the water ribbon all read `hzcFogHorizon`,
  `hzcFogZenith`, `hzcFogSun`, `hzcSunDir` and `hzcWeather` through
  `environment.registerMaterial()`, so the ground and the water reflect *this*
  sky at *this* hour and wet down in rain (`hzcWeather.x`).
* `ctx.collision` — the rim face, the buttress slabs and the talus are
  registered here; `world-props` registers its own.

## two traps in these files

1. **Card texture row order.** The baked card textures (`_bakeTuftTexture`,
   `_bakeConiferAtlas`, `_bakeImpostor`) are painted row 0 at the TOP of the
   tile, but a `DataTexture` uploads row 0 at `v = 0`, which is the BOTTOM of a
   card. Whether a bake needs `_texFromBuffers(..., flipRows = true)` therefore
   depends on the GEOMETRY it feeds: the grass card maps its bottom to
   `v = 0.02` and needs the flip; `_impostorGeometry` maps its bottom to
   `v = 1` and must NOT be flipped. Get this wrong and the grass is a plank or
   the tree stands on its head — both were filmed on the way to this build.
2. **Blade width is a world measurement.** A blade `w0` texels wide on an `N`
   texel tile is `cardWidth * w0 / N` metres in the world. Raising a card's
   scale multiplier widens its blades in the same proportion.

## one measured fact other lanes may need

`environment`'s solar arc keeps `fogParams.sunDir.z` **negative at every hour**
(the sun crosses the northern sky), so the south face of the north rim has
`N·L` between −0.28 and −0.74 all day and is lit by the 0.3 hemisphere alone.
This lane works around it in geometry — the massif is corrugated into spurs and
gullies so both a lit and a shaded flank exist at any sun angle — but any lane
that needs a *front-lit* north-facing subject should know the sun never gets
south of the camera.

---

## FIX ROUND 1 — what changed, and one cross-lane defect

### 1. The rim's "plaid / screen-door" grid is `core-platform`'s GTAO, not this lane

> **CORRECTED IN FIX ROUND 2 — READ THIS FIRST.** The table below is right about
> the artefact it names (the axis-aligned vertical-bar + horizontal-dash grid on
> the FAR massif: that is GTAO and the one-line engine.js change clears it), and
> it was **wrong to conclude "not in the terrain material"** in general. There
> were *three* separate artefacts stacked on the same pixels, and two of them
> were this lane's. The elimination run below was filmed at 350 m, where both of
> ours are below their fades, so it could not have falsified them. See
> **FIX ROUND 2** at the end of this document for what they actually were, how
> each was isolated, and what changed. Hand `core-platform` only the grid.

Four lanes filmed a regular vertical-bar + horizontal-dash grid laid over the
whole massif (`V33-rim`, `V30-golden-hour`, `V34-midground`, faintly
`V28-impact`). It is **not** in the terrain material, the vertex colours, the
strata, the masks, the shadow map or the mesh normals. Proven by elimination on
port 5210, each step re-filmed:

| test | plaid |
|---|---|
| plain `MeshStandardMaterial`, no vertex colours, no shadows | still there |
| unlit (black albedo + flat emissive) + fog | still there |
| `renderer.shadowMap.enabled = false` | still there |
| shading normals filtered to p99 **2.9°** between adjacent vertices | still there |
| ridged-noise crests rounded (no C1 corner in the height field) | still there |
| **`engine.composer.passes[1].blendIntensity = 0`** (the `GTAOPass`) | **gone** |

Reproduce in one line:

```
node tools/screenshot.mjs x --port 5210 --eval "$(cat tools/tmp/wg-rimcam.js);(()=>{__CTX__.engine.composer.passes[1].blendIntensity=0;for(let i=0;i<6;i++){__CTX__.engine._shadowCullClock=0;__CTX__.engine.render(0.05);}})()"
```

Diagnosis: `src/core/engine.js:397` configures GTAO with `radius: 0.55` **world**
metres and `screenSpaceRadius: false`, with no distance fade. At 350 m that
radius projects to ~1.4 px in the half-res AO buffer, so the pass is sampling
depth differences at or below the depth buffer's own quantisation and returning
its noise texture — which is a tiled pattern, hence a *regular* grid rather than
random speckle — and the Poisson denoise (`radius: 4`) cannot clean structure at
that scale. Ambient occlusion is a contact-scale effect; at 350 m the correct
value is "none".

**Fix belongs to `core-platform`** (`src/core/engine.js` is theirs, §3.1). One
line, either of:

* `screenSpaceRadius: true` in `updateGtaoMaterial`, or
* fade the AO out with view distance so it is gone by ~120 m.

Until then every distant-terrain vista in the game carries it.

### 2. `terrain.mesh` shading normals are filtered, and the rim's are filtered hard

`computeVertexNormals()` is gone. The mesh now carries an analytic normal built
from central differences at several baselines, weighted `w_k = k`, with the
stencil widening from **1 node (1.94 m) in the meadow to ~30 nodes (58 m) on the
crest** (`1 + round(rimN * 30)`). Rationale is in the code; the short version is
that the massif is genuinely crinkly at the metre scale and from the camp one
mesh quad is a few pixels, so an unfiltered normal shades as noise. Adjacent
vertex normals in the boundary band went from **5.9° / 19° / 46°** (median /
p90 / p99) to **1.4° / 2.3° / 2.9°**.

Consumers: nothing reads the mesh normal attribute; `terrain.getNormal()` is
unchanged and is still the analytic gameplay normal.

### 3. `_ridged()` takes an optional `eps0` that rounds the crest

`1 - |noise|` has a corner at every zero crossing — infinite frequency, which a
1.94 m grid turns into grid-aligned Nyquist content. `sqrt(n*n + eps)` rounds it
over a fixed world width (`eps *= 4.2` per octave keeps that width constant as
frequency doubles). The rim's `spur` uses `0.008`, `teeth` uses `0.030` and
dropped to 2 octaves with its amplitude raised to compensate. Silhouette and
relief are unchanged.

### 4. The boundary escarpment is lit (`world-06`, `camera-feel-12`)

Two changes, both keeping the wall the player walks into intact:

* the buttress/gully corrugation now extends **inward** across `r = 272..348`
  with a **one-sided** amplitude (`max(flute, 0)`), so it can only ADD. Every
  bearing keeps its full escarpment — a signed gully could have flattened it —
  and every bearing gains a spur with an east and a west flank, one of which is
  lit at any hour of the solar arc.
* rim rock gets a **hemisphere fill** applied after the lighting chunks
  (`hzcSkyFill`, `r > 238`, scaled down where `N·L` is already high so the
  massif keeps a sun face and a shade face). It uses `hzcFogHorizon` /
  `hzcFogZenith`, so it is graded with the rest of the frame.

Measured from `(0, -300)` facing the wall, against the lit meadow at the same
hour: **1.06 / 0.85 / 0.78** at 08:00 / 12:00 / 17:00. It was RGB 16/12/8
against a meadow at 153. Gate `A62-rim-face-lit-world-ground` holds this.

### 5. Talus fans are seated, not dropped

`_screeGeometry` is now a **unit** cone, so the instance scale sets a real angle
of repose (`sy = s * repose`, repose 0.40–0.66) instead of a 30–66 m pancake a
metre thick. `_seatScree()` tilts each fan onto the local slope normal (capped
at 34°, the repose angle), then seats it against **the geometry's own base-ring
vertices** — rotated, and sampled with `getHeight`, not `heightFast`; both
shortcuts were worth over a metre. Sites whose footprint fall exceeds the fan's
own thickness are rejected. Radii are capped at 11 m (apron) / 15 m (slab feet),
and there are 837 of them instead of 440.

Worst base-ring gap over every fan: **−0.20 m** (median −0.20, none above 0.6).
It was median 4.1 m with 411 fans over 1 m and a worst of 42.8 m. Gate
`A61-scree-seated-world-ground` holds this.

### 6. Strata read as bedding, not as a contour map or a quilt

* `bvar` was `thash()` of two `floor()`ed values — hard horizontal edges from
  `floor(bp)` and hard vertical ones from `floor(sector)`, i.e. a literal plaid.
  It is a continuous `tnoise` on the same pair now.
* `sector` was an xz-only lookup, so on a near-vertical face it collapsed into a
  full-height stripe. `vWPos.y` is folded in.
* the bands were keyed off `vWPos.y` alone — level lines, and a level line on a
  conical peak is a **contour line**, which is why the massif filmed as wood
  veneer. Beds now **dip** (`vWPos.y + dot(vWPos.xz, dipDir) * 0.44`).
* the `2.31×` harmonic and then the bands themselves fade out on `fwidth(bp)`,
  so a sub-pixel band becomes a flat rock tint instead of moiré, and contrast
  eases off past 380 m.
* every gate keyed on the interpolated normal (`steep`, the triplanar blend) is
  widened by `fwidth`, so per-pixel normal jitter can no longer be quantised
  into a visible step.

### 7. Frame budget

Same-run A/B in the meadow at `(-40, -60)`, `tools/tmp/wg-perf.js`. **Read the
box's load first**: this A/B swings by 2-3x with what else is running, so the
absolute millisecond figures in any single report are only comparable within
one run. On a quiet box the whole frame is now **18.5-19.0 ms** against a
**16.7 ms vsync floor**, with vegetation costing **~2.0 ms** and the terrain
mesh + far ranges **~1.8 ms** above it (three consecutive runs: 19.0/17.1/16.9,
18.5/16.8/-, 18.7/16.6/16.8). Under the same contention the judge measured at
(38.9 ms frame) the two systems now read 17.1 and 10.3 ms against their 22.3 and
16.9. What is load-independent is what was actually cut:

* grass: `D_MEADOW` 6.6 → 5.4, `D_STEALTH` 4.2 → 4.0, `MID.cand` 1.5 → 1.0,
  near-tier fade window 46–62 m → **34–48 m** (a card past its window collapses
  to a degenerate point, so shrinking the window is nearly free), near card
  scale +12 % so coverage does not follow the density down. Near/mid instances
  528k → 331k.
* terrain: the micro (0.55 m) and gravel (2.35 m) triplanar fetches are now
  **skipped**, not just faded, once their distance weight is zero — they were
  costing two fetches per pixel across the whole far half of every frame — and
  the two cliff planes are gated at 0.02 instead of 0.004, so the meadow, which
  is within 8° of flat almost everywhere, pays for one plane.

A59 still passes with room: meadow 7.2–8.9 tufts/m² against a floor of 4,
stealth 8.25 against 6, bare ground **0.090** against a ceiling of 0.25 (it was
0.149 — the coverage went *up* while the cost went down).

---

## FIX ROUND 2 — the "wood veneer" was mine, and so was the basket weave

Two judges filmed a **wood-grain / fingerprint contour map** over the whole
massif and a **diagonal basket weave** on the boundary escarpment, and fix round
1's report attributed both to `core-platform`'s GTAO. That attribution was
wrong. There were **three** artefacts on the same pixels:

| artefact | where it shows | owner |
|---|---|---|
| axis-aligned vertical bars + horizontal dashes | far massif, 300 m+ | `core-platform` (GTAO), **still open** |
| wood-grain contour swirl | the whole rim, 100–900 m | **this lane** — fixed below |
| diagonal burlap / basket weave | escarpment, 40–150 m | **this lane** — fixed below |

### How the veneer was pinned down

Isolated at the V33 gate camera, one variable per frame, **with the composer
bypassed entirely** so nothing in post could be blamed
(`window.__WG_DIRECT__` in `tools/tmp/wg-r2-cam.js`):

| test | veneer |
|---|---|
| vertex `color` attribute overwritten with a constant (`flatvc`) | still there |
| normal buffer replaced with an analytic normal from a 39 m filtered heightfield | still there |
| geometry terracing `ta = 0` | still there |
| `renderer.shadowMap.enabled = false` | still there |
| GTAO blended out | still there (the *grid* went) |
| `renderer.render(scene, camera)` — no composer at all | still there, **stronger** |
| plain `MeshStandardMaterial` (this lane's shader removed) | **gone** |
| shader kept, only the strata block's mix set to `0.0` | **gone** |

Shots: `shots/wg-r2-gate-direct.png` (veneer), `-direct-flatvc.png`,
`-direct-nostrata.png` (clean), `wg-r2c-gate-nogtao.png` (fixed).

### What was actually wrong

`sin(phase + noise(p))` is the textbook procedural **wood** shader, and the
strata block was running three copies of it:

1. `dipA = sector * 6.28318` where `sector` was a function of **position**. The
   bedding "plane" therefore had an azimuth that spun a full turn every ~80 m,
   applied through `dot(vWPos.xz, dir) * 0.44` — a lever arm reaching 176 m at
   the rim. A plane whose normal rotates as you walk along it is not a plane;
   its iso-surfaces spiral. Measured over the rim band (10 395 samples), the
   bed-height field climbed by a **median 2.44 m and a p99 of 12.0 m per metre
   walked sideways**, so beds 20–40 m thick cycled in under 2 m of ground —
   sub-pixel at 350 m.
2. `+ tnoise(vWPos.xz * 0.019 + vWPos.y * 0.011) * 1.7` — a 1.7-radian phase
   warp at a 53 m wavelength. That is the grain generator itself.
3. `mix(0.16, 0.34, sector)` — a band **frequency** varying continuously across
   one face is a chirp, and a chirp beats against itself into interference rings.

Rewritten: one attitude per **sector of the ring** (looked up on the bearing, so
it is constant along any radial line), a **radial** dip whose lever arm
`(r − 340)` is bounded by the band width, a gentle fold (1.1 rad over 290 m)
instead of a phase scramble, a bed thickness constant within a face, ~40 % of
the old albedo contrast, and a distance fade starting at 220 m instead of 380 m.
Field gradient after: **median 0.261, p99 0.395, max 0.410** — a plane, by
definition, which is what `A63-bedding-planar-world-ground` now asserts. The
second sector de-phasing offset moved from a radian offset on the band phase to
a metre offset inside the bed height, purely so the JS mirror the gate measures
is exact rather than approximate (the conversion between the two runs through
the bed frequency, which varies by sector). Same picture on screen.

### The basket weave

Separate artefact, same lane. At 60 m and grazing incidence one pixel spans
~0.2 m of the escarpment, so the 0.55 m grit lattice was **beating against the
pixel grid** and the 2.35 m gravel lattice was repeating ~25 times across the
visible face — and a texture repeated 25 times in one view reads as a grid
however good it is. Two changes, both in `TERRAIN_COLOR`:

* **texel-footprint fades.** `fpW = max(length(dFdx(vWPos)), length(dFdy(vWPos)))`
  folds distance, field of view and incidence into one number, and each tier is
  faded out between ~12 and ~4 pixels per tile. The macro tier gained the same
  treatment and eases to a flat 0.5 rather than popping. This also *saves*
  fetches on exactly the pixels that were paying for noise.
* **tile stretch on rock faces**: 0.55 / 2.35 / 9.5 m underfoot,
  1.9 / 8.2 / 33 m on a vertical face, keyed on the interpolated normal (which
  varies over tens of metres, so the stretch itself cannot band) and eased back
  to 1× inside 9 m — a cliff you are standing under is showing you one tile, not
  twenty-five, so there is no repeat to break and the fine grain is what makes
  it read as rock. Full stretch by 34 m, well inside the 40–150 m band the weave
  lives in. This is the judge's own proof turned into a fix: the same frame with
  the tiers set ~11× coarser filmed as organic stone speckle.

Before / after: `shots/judge-world-ground-r1-scree-nogtao.png` →
`shots/wg-r2c-scree-nogtao.png`.

### Also in this round

* Vertex pass 2's rim tints now read a **filtered** heightfield (`_smoothField`,
  a ~39 m triangle kernel), not a wider finite-difference stencil: the rim is
  terraced into 13–23 m benches on purpose, so any slope- or height-keyed tint
  crossed its ramp once per bench. The sun-face tint is a linear ramp through
  zero instead of two saturating smoothsteps, the slope splat is faded out on
  the rim (the rim block already lerps 86 % to rock), and the snowline's 14 m /
  50 m wobble — which crossed a 26 m ramp four times per 100 m and drew the
  brightest lines on the massif — is one octave down at 0.64 the amplitude, with
  a ramp that widens on steep ground. Rim vertex-luminance high-pass residual
  (radius 15.5 m) fell from **66 % of the local mean at p95 to 14 %**; the meadow
  reads 12 %.

### Published this round

* `terrain.setStrataStrength(k)` — bedding-band strength 0..1 (ships at 1). The
  only way to measure the bedding term is to render the frame with and without
  it and difference; A63 does exactly that so the gate cannot be passed by
  deleting the beds.
* `terrain.beddingAt(x, y, z) -> { bh, thick }` and the module exports
  `BEDDING` / `beddingField()` — the JS mirror of the shader's bedding
  coordinate, kept next to it, so a gate can bound the field itself. Statistical
  mirror, not bit-exact (`fract(sin(x))` at float vs double).

### Gates

`A63-bedding-planar-world-ground` is new (A63 is taken by `progression`, so it
carries the lane suffix). It bounds the bedding field's horizontal gradient over
the rim band and requires the beds to still render:

| | old strata | shipped | gate |
|---|---|---|---|
| bed-height gradient, median | 2.442 | **0.261** | — |
| ...p99 | 12.023 | **0.395** | — |
| ...max | 15.778 | **0.410** | ≤ 0.9 |
| bed thickness | — | 19.4–32.5 m | 16–40 m |
| rendered bed contrast (rms / peak) | — | 0.025 / 0.355 | ≥ 0.006 / ≥ 0.05 |

Reproduce the old numbers with `tools/tmp/wg-r2-bedgrad.js`, which scores both
formulae side by side on the live terrain.

### ROUTED TO `core-platform` — the GTAO grid on every distant vista

This is the one serious Wave-2 residue against `world-ground`, and the judge's
own verdict is that it is **not a world-ground defect**: "Route to core-platform:
in `src/core/engine.js`'s GTAOPass setup (~line 397–399), either set
`screenSpaceRadius: true` or otherwise scale/fade the world-space AO radius with
camera distance." Nothing in `terrain.js` / `vegetation.js` / `water.js` can
reach it, and reaching into `engine.gtao` from this lane at runtime would be the
same violation as editing the file. So this round the lane changed **no code**
and instead produced the diagnosis, the measurement and a verified one-line fix.

**Repro** (any build, quality `high`, where `tier.gtao` is on):
`shots/gates/V33-rim.png` and `shots/wg-r3-v33-asis.png` — a screen-locked
rectangular lattice, cells ≈ 55 px, laid over the whole massif and over the
aerial-haze band in front of the treeline. It is faint but present in ordinary
gameplay framing too (`shots/wg-r3-boot.png`, distant wall top-left).

**Cause.** `_attachGtaoDepth()` calls `g.setGBuffer(this.depthTexture, undefined)`
— no normal buffer — so the pass runs with `NORMAL_VECTOR_TYPE: 0` and
reconstructs its normals from depth. The depth attachment is a
`THREE.UnsignedIntType` `DepthTexture` on a `near = 0.1 / far = 2400` camera, so
at the 300–430 m rim one depth step is ≈ 7 cm, while the AO radius — 0.55 **world**
metres with `screenSpaceRadius: false` — subtends ≈ 1.4 px at that range (0.7 px
at `gtaoScale: 0.5`). The horizon search therefore reads the depth buffer's own
quantisation terraces instead of the surface, and the terraces are screen-locked,
which is why the artefact is a grid and not a feature of the rock.

**Measured** (`shots/wg-r3-aoprobe.png` run; probe kept at
`tools/tmp/wg-r3-aoprobe.js`). Luma difference of the real framebuffer, GTAO on
vs GTAO off, over the massif band of the V33 frame and over a 2 m-eye camp
ground shot:

| | far band (the massif) | near ground (camp, 2 m eye) |
|---|---|---|
| shipped (`screenSpaceRadius: false`, `radius: 0.55`) | rms **0.0623**, peak 0.285 | rms 0.0234, peak 0.366 |
| `screenSpaceRadius: true`, `radius: 0.25` | rms **0.0015**, peak 0.190 | rms 0.0158, peak 0.319 |

The far term collapses by **41×** — the grid is gone, and AO correctly stops
contributing at 350 m — while the near term keeps **68 %** of its shipped
strength, so this is not "turn AO off"; tune `radius` up if that 68 % is not
enough. Film for the same three states, all at V33's camera and hour:
`shots/wg-r3-v33-asis.png` (grid) · `shots/wg-r3-v33-nogtao.png` (control) ·
`shots/wg-r3-v33-ssr.png` (**fix**, indistinguishable from the control on the
wall). Both fixed frames keep the strata, talus and haze V33 asks for. Matched
1.6x crops of the same 500x420 px window, for the lattice at pixel scale:
`shots/wg-r3-crop-asis.png` -> `shots/wg-r3-crop-ssr.png`.

**The fix, for `core-platform` to apply in its own file** —
`src/core/engine.js:397–399`:

```js
this.gtao.updateGtaoMaterial({
  radius: 0.25, distanceExponent: 1.6, thickness: 0.7,
  scale: 1.0, samples: 9, distanceFallOff: 1.0, screenSpaceRadius: true,
});
```

Secondary levers, if screen-space radius is unwanted: raise `camera.near` (the
quantisation scales linearly with it — 0.1 → 0.5 buys 5×), give the pass a real
normal target, or fade `blendIntensity` to 0 between ~80 and ~150 m.

**Not guarded by a gate on purpose.** A gate that asserted the far-AO rms is
below ~0.01 would FAIL on today's build, and this lane may not ship a failing
gate for another lane's defect. `A63-bedding-planar-world-ground` already blends
GTAO out for its own measurement and says so in its comment; when the fix lands,
that bypass can be deleted and the number above becomes the natural bar.

---

## WAVE 4 — `world-ground-expansion`: biomes inside the 330 m disc

Five authored regions on top of the meadow, plus the surfaces and the landform
that make them real. Everything below is **additive**; the Round-3/Round-4
surface (`getHeight` / `getNormal` / `isInTallGrass` / `tallGrassDensity` /
`WORLD_SIZE` / `PLAY_RADIUS` / `surfaceAt`) is unchanged.

### new terrain API

```js
Terrain.BIOMES                 // ['meadow','forest','snow','marsh','ash','scree']
terrain.biomeAt(x, z)          // the dominant biome id at a point
terrain.biomeWeights(x, z, out?)  // { meadow, forest, snow, marsh, ash, scree }
terrain.snowAt(x, z)           // 0..1 snow dusting on the north bench

// module-level, for consumers that do not hold the instance
import {
  forestFactor, snowFactor, marshFactor, ashFactor, screeFactor,
  northBenchFactor, biomeWeights, biomeAt, biomeSuppress, trailSuppress,
  stampStealthDisc, MARSH_LEVEL,
} from './terrain.js';
```

`biomeWeights` reuses one shared object unless you pass `out` — the grass
scatter calls it ~470 k times per stream and must not allocate. Every factor
early-outs on a bounding test, so a meadow point costs five comparisons.

| biome | where | ground | what grows |
|---|---|---|---|
| `forest` | NE, ellipse at (150,-120) r≈100×98 | needle duff, `surfaceAt → dirt` under closed canopy | closed conifer stand (3–6.5 m spacing), fern understory, 25 ground-mist pockets in the hollows |
| `snow` | N bench, (-26,-256) r≈138×50, lifted 13–22 m | `surfaceAt → snow`, dusting thickest on the lee half | bleached bent grass, silvered dead snags, erratic boulders |
| `marsh` | around the largest pool, (-107,54) r≈52 | `surfaceAt → mud`, wet/low-roughness | reeds (own scale + blue-green tint), reed clumps standing in the water |
| `ash` | the cauldron burn scar, (175,-195) r≈46 | `surfaceAt → ash`, charcoal under a pale bloom | standing charcoal snags only, leaning where they fell |
| `scree` | the SE shelf benches | `surfaceAt → gravel` / `rock` | clustered talus blocks, wiry tussock |

### two rules every consumer of these fields obeys

1. **Biomes never touch `tallGrassDensity`.** The concealment field is the
   machine-route contract (A60); a biome that could thin it could silently take
   a patrol lane's cover away. The biome pass is material + scatter only.
2. **Surface weights are cover- and trail-suppressed** (`biomeSuppress`): snow,
   ash and scree lie BETWEEN the grass lanes and beside the paths. The marsh is
   the exception and uses `trailSuppress` (trails only) — what you stand in at
   the water's edge is mud whether or not a stealth patch grows out of it.

### landform changes inside `getHeight`

* **north bench** — a terraced shelf 13–22 m above the meadow at r≈206…306, N.
  Its approach ramp is deliberately ~30°, not 45°: steeper than that is above
  the grass scatter's slope cutoff and above a character controller's step
  limit, and it filmed as a bare dark wall.
* **marsh pan** — an annulus around the largest pool planed to
  `MARSH_LEVEL - 0.33`, with the slack pool at the heart left deep. Shin-deep
  wading (`water.depthAt ≈ 0.27–0.35`) over ~30 m.
* **burn dish** — a 1.35 m blast bowl under the ash scar.

### water

`water.levelAt / depthAt / flowAt / pools` are unchanged in contract. Two
internal changes serve the marsh: the waterline march limit is
`hw * 1.18 + 34 * marshFactor` (the pan is four times the cut's half-width, and
the march is still the authority on where the waterline is), and the surface is
pinned to `MARSH_LEVEL` across the flat — a marsh has a water table, not a
thalweg, and the thalweg solve tilted it by 0.11 m across dead-flat ground.

### `terrain._ensureRouteCover()` — A60 after the Wave-4 roster

The authored stealth discs come from this file's mirror of the Round-3 spawn
table. `machines-expansion` added nine kinds whose sites live in `machine-ai`'s
`SPAWN_PLAN`, and `world-props` can then move them onto a published POI — so a
second static mirror here would be wrong the moment either lane edits a number.
That is exactly what A60 caught: **seven live routes with 0–7 % of their length
in cover.**

Terrain now walks the LIVE routes (`ctx.machines.list[].route`) once, on the
first update after the roster is up, measures each one, and stamps cover arcs
over ~60 % of the perimeter of any route under the bar (`stampStealthDisc`,
additive — it can only raise the field). It then calls
`vegetation.invalidate()` so the pooled tiers re-scatter under their normal
per-frame budget instead of a 120 ms `forceStream` hitch.

One field change came with it: the riparian damping on the stealth term used to
remove 88 % of the cover inside the channel, which is right for the bare silt
bed and wrong at a pool — the two Snapmaw routes bask IN the water and measured
0 % and 4 % however many discs were stamped. The damping now scales with the
strength of the authored disc, so a pool collar grows reeds and a bare bed stays
bare (V32 films exactly that ground, unchanged). `vegetation.grassDensityAt`
relaxes its own river damping on the same term by the same amount, so the field
never claims cover the scatter did not plant.

**After: 0 routes below the bar, worst 0.47, median 0.81.**

### vegetation

```js
vegetation.invalidate()        // mark every pooled chunk stale (budgeted refill)
vegetation.dispose()           // full teardown (memory rule)
vegetation.biomeTreeCount      // trees planted by the biome pass
vegetation.fogPocketCount      // forest mist pockets
vegetation.screeRockCount      // talus blocks
terrain.dispose() / water.dispose()
```

**The tree scatter is two passes, and pass 1 is byte-identical to Round 3** —
same seed, same dart sampling, same branch order, same number of `rng()` rolls
per candidate, same 1520 budget. The scatter is a stochastic dart throw, so
consuming one extra random number at the top re-rolls the whole valley: the
first cut of this lane did exactly that and two pines landed 12 m in front of
V33's camera, turning an alpine wall into a hedge. Candidates that fall inside a
biome are still rolled and still reserved in the spacing grid, but are planted
by pass 2 (own stream, 680 trees) with the right species for that ground.

Spacing is now a 12 m uniform grid rather than a linear scan of everything
placed so far — that is what pays for the denser stand.

### cost

Boot ~+120 ms (one extra 512² RGBA mask, the biome scatter passes, the mist
bake). One extra draw call (`forest-mist`); the biome trees, talus and reeds all
feed meshes that already existed. No per-frame allocation was added: the mist
drifts on the shared `uTime` uniform and the biome weights object is reused.

### one cross-lane need this pass creates: `audio` owes `ash` a footstep set

`Terrain.SURFACES` gained `mud` and `ash`. `audio`'s `SURFACE_SET` already
aliases `mud → foot/silt` (and `scree`, `stone`, `shale`, `ice`, `sand`…), but
it has no entry for `ash`, so `A76-footfalls` now reports
`surfacesFallingBackToGrass: ["ash"]` and fails on its own no-fallback bar.
Walking a burn scar should not sound like a meadow.

**One line, in `audio`'s file, not this one** (`src/audio/audio.js`,
`SURFACE_SET`):

```js
  ash: 'foot/dirt', cinder: 'foot/dirt',   // soft, dusty, no grit — nearest set
```

or a recorded `foot/ash` set if the bank has room for one. This lane cannot
make that edit (§3.1 ownership) and will not rename the surface to dodge it:
`ash` is a named deliverable of the expansion brief and of `A58-surface-api`.

#### the contract is now published from this side: `Terrain.SURFACE_AUDIO`

Leaving the fix as a sentence in a report means the next surface this lane
invents breaks `A76` again, silently, and is found by whoever next reads a
footstep. So the routing is published as data beside the vocabulary that needs
it:

```js
Terrain.SURFACE_AUDIO   // { grass:'foot/grass', … ash:'foot/dirt', … }
```

Every name in `Terrain.SURFACES` has an entry — that is what
`A58b-surface-audio-world-ground` asserts, in this lane's own gate file, so a
new surface with no foley route goes red **in `world-ground`'s run, at the
moment the surface is invented**, rather than three lanes later in `audio`'s.
The values are only the nearest set in today's bank; `audio` owns the sound and
may override any of them.

`audio`'s one-line adoption then covers every future surface too:

```js
const SURFACE_SET = { …, ...(Terrain.SURFACE_AUDIO || {}) };
```

**`A76-footfalls` stays RED until `audio` makes that edit**, and this lane
reports it as an outstanding cross-lane debt rather than as a pass.
`A58b` deliberately does **not** re-assert `A76`'s bar: duplicating another
lane's failing bar in my own file would either weaken it or double-count it.

One harness note worth keeping: under the gate harness the sample bank reports
`{loaded:false, size:0}` and footsteps run procedurally, which is why `A76` can
watch `foot/grass` play with nothing on disk. `A58b` therefore only asks
`bank.has()` when the bank is genuinely up, and otherwise checks that every
route is a well-formed set name — an empty bank answers "no" to every set and
would have made the gate a permanent red that said nothing about this lane.
