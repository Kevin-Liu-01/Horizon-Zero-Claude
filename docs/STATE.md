# CALIMA — STATE

What is on `r5/int` and what is next. This file is regenerated at each integration run, not appended to.
Canon is in [`BIBLE.md`](BIBLE.md), the gate list in [`GATES.md`](GATES.md), open findings in
[`BACKLOG.md`](BACKLOG.md).

State as of **Nov 14 2026**, Milestone 0 (Reset), after step M0.9.

## Integrated on `r5/int`

`r5/int` continues the earlier preview branch (main plus four world and look lanes as of Nov 12) with seven more
lanes merged onto it.

| area | branch | on `r5/int` | what it brings |
|---|---|---|---|
| world-ground | `r5/w1-world-ground` | Nov 12 checkpoint; 7 newer commits not merged | the island terrain, ground materials, plants, water |
| world-sky | `r5/w1-world-sky` | Nov 12 checkpoint; 5 newer commits not merged | sky, clock, weather |
| world-props | `r5/w1-world-props` | Nov 12 checkpoint; 6 newer commits not merged | landmarks: the Sounding Ring, sea stacks, wind pumps, survey marks, the static Gauge |
| look-post | `r5/w1-look-post` | Nov 12 checkpoint; 21 newer commits not merged | tone mapping, grade, post |
| character-art | `r5/w1-character-art` | merged, current | Brea's body, face, skin and wrap |
| hero-body | `r5/w0b-hero-body` | merged, current | bow pose, cloth chains, stow kit; `playerAnimator.js` reconciled by hand with melee's |
| melee | `r5/w1-melee` | merged, current | the lance: lights, heavy, guard, Undercut |
| armory | `r5/w1-armory` | merged, current | Starter outfit, Pan II, Pan III, Ash I; Sabina Bow, Shepherd's Lance, stow kit |
| settlements | `r5/w1-settlements` | merged, current | nine people archetypes with clips and atlases |
| shell-ui | `r5/w1-shell-ui` | merged, current | the glass HUD, hub and Sighting card |
| instruments-a | `r5/w1-instruments-a` | merged, current | Peg, Plumb, Tiller |

`brea.glb` was rebuilt on `r5/int` so the integrated body and the armory's sleeveless cover agree.

## Removed from the tree (M0.3)

Five commits, each from an explicit path list, with `vite build` clean after each.

| step | what went |
|---|---|
| R0 | old documents, media, archived gates, staged-model manifests and third-party reference photographs (184 files, 28.1 MB) |
| R1 | proof-scene leftovers (3 files) |
| R2 | the eleven legacy enemy kinds: models, classes, rig tables and audio (38 files, 8.6 MB); 47 audio files renamed by role |
| R3 | the earlier prototype's story, crowd, place props, wildlife, laid devices, radial selector and skill tree (13 files, 10,794 lines) |
| R4a | gate rows, one-time tools and status reports whose subject is gone (23 files; carried rows 236 → 205, all 77 kept-stack rows still present) |
| M0.9 | the three `ROUND5-*` documents, replaced by the four files in this folder |

**Kept and reshaped rather than deleted:** `terrain.js`, `vegetation.js`, `water.js`, `environment.js` and
`props.js` (the movement stack reads the ground through them); the settlement host, now
`src/world/settlements/host.js`, which keeps the Brazier at REST and loads the people; `sighting.js`
(`SightingSystem`); `fieldbooks.js` with 24 stubs; `src/ui/quickslots.js` (key 1 bow, key 2 lance).

**Stand-ins in place:** one quest ("Raker's Morning", first two objectives), one named person (Ansel), Tolerance
as Loose / Standard / Fine, three bows under their BIBLE §8 names. Growth is inert until certifications are built.

## What the game is today

Brea on the island with the new body, outfit, bow and lance; three Instrument kinds; nine people archetypes; the
glass HUD. No quest spine beyond the stand-in, no settlements built on the island, none of the four features of
BIBLE §9 in code, one of eight armour rungs to its BIBLE look.

## Checks

| check | result |
|---|---|
| `vite build` | clean after every removal step (one chunk-size warning) |
| import graph from `src/main.js` | clean |
| licence manifest against files on disk; README credits | pass |
| gate registry loads in Node | 543 rows, 0 id conflicts; all 77 kept-stack rows present. **Four area gate files no longer load** since they quoted the retired documents (BACKLOG I14) |
| every model URL in `src/` exists on disk | pass |
| headless boot after the removals | **not run yet** (BACKLOG I10) |
| name lint | **not at 0** (BACKLOG I11); `public/` and `docs/` are at 0 |
| the 77 kept-stack rows on `r5/int` | **not run yet** (BACKLOG I6) |
| frame time | last lane measurements: 19–21 ms at a vista, 34–39 ms with a herd. No `r5/int` nightly yet |

## Engine: three r187 (M0.7), the frame cost (M0.8), the turntable page (M0.13)

Written Nov 14 2026, the day of the choice.

**M0.7: `r5/int` is on three r187** (0.187.0, from the npm registry, sha512 checked). Not r181, not r169: r187
was clean on the first day of its three-day box.

- **Shader patches assert.** `src/core/shaderPatchAudit.js` watches every `replace()` on shader text inside an
  `onBeforeCompile` hook and logs a console error (which fails boot and every gate) for any site that never
  changed its string; the engine's own post anchors (`gtaoPatched`, `postFoldReady`, `bloomClampReady`,
  `bloomRoundReady`) are asserted the same way. r169 and r187: 71 sites, 0 that never applied, the four post
  flags true, boot with 0 console errors.
- **What changed in code.** The bloom, GTAO and SMAA passes the engine re-plumbs stay at r169, vendored in
  `src/core/vendor/three-r169/` (r187 rewrote the bloom blur and made the others' fields private; moving them is
  a look change of its own, BACKLOG I15). The CSM addon is r187's own (its lighting chunk tracks r187's core; it
  did not move, so nothing is vendored); its frustum needs `{ webGL: true }`. Shadows are `PCFShadowMap`, which
  from r182 is the native-depth hardware-filtered soft shadow (`PCFSoftShadowMap` is removed). `THREE.Clock` is
  replaced by a small frame clock (deprecated from r183). The built-in cascaded sun light is not adopted.
- **Kept-stack rows, before and after** (r169 and r187 interleaved in chunks of 10 on the same tree and Chrome):
  r169 65 pass, 6 fail, 1 pending, 8 visual; r187 64 pass, 6 fail, 2 pending, 8 visual. The same six rows fail
  on both (A44b, A56, A70, A71d, A107, A90). The one difference is A9: 59.9 fps on both, graded PENDING when the
  1-minute load average was over 3; re-run on both, PENDING on both at 60.2 / 59.9 fps for the same reason.
- **The rest of the carried file** (128 rows): r169 59 pass, 27 fail, 14 pending, 28 visual; r187 61 pass,
  24 fail, 15 pending, 28 visual. No row passes on r169 and fails on r187. A105 and A106 fail on r169 and pass
  on r187 in this run; A21 FAIL (r169) / PENDING (r187, loud box) at GPU medians 21.04 / 20.97 ms vista,
  23.6 / 22.5 herd, 20.8 / 20.4 staged fight.
- **Lamp colours.** Tokens unchanged: calm `#F2EAD3` 24.7, wary `#B5E61D` 27.8, hostile `#FF2D8C` 26.6 ΔE2000
  from the nearest excluded colour; glass `#D6F0EE` 21.1. Rendered at 15 m on r187 (A-lamp-states): calm
  `#f4ecd7` 25.2, wary `#b9e828` 27.6, hostile `#ff2c8b` 26.5, dark `#3a3935` 41.2; within ΔE 0.2-0.87 of each
  token, the same as r169. (One r187 run read the dark glass at ΔE 3.28 from its token; the re-run read 0.33.)
  A-lamp-canon-distance fails on both versions for one default in the old machine shell file (BACKLOG I17).
- **Frame Set.** All 34 frames filmed on both, 0 console errors. Mean ΔE2000 r169 → r187 per frame 0.06-7.2;
  two boots of the same version differ by 0.05-3.6 on the same frames, because Brea's idle phase, cloth, grass
  wind and cloud drift are not frozen at the same instant. Read by eye, the differences are those motions and a
  slightly different shading of the ripple sand under low sun; no material, colour or grade change.
- **Heap:** JS heap at A90's start 261 MB (r169) → 280 MB (r187).

**M0.8: the frame cost.** Measured on r187 at 1600 × 900, DPR 1.25 (2000 × 1125), quality `high`, frozen staged
frames, Apple M3 Pro, ANGLE Metal, Chrome 151. Method: headless Chrome holds rAF at vsync, so EXT timer queries
read the GPU at whatever clock fills 16.7 ms; the split is therefore taken from the frame rendered back to back
and synchronised with a 1-pixel readback (GPU busy, no vsync), by paired skip-one per class (8 pairs).
Vsync-off launch flags were tried and give the timer queries almost no results on ANGLE Metal.

| | F02 vista | F23 Plumb | F32 aerial |
|---|---|---|---|
| frame, timer query under vsync | 17.7-22.4 ms | 17.6-20.8 ms | 18.6-21.1 ms |
| frame, back to back with readback | 19.5 ms | 19.2 ms | 18.9 ms |
| opaque geometry | 5.4 ms | 5.6 ms | 6.8 ms |
| alpha-tested (alpha test, coverage or a discard) | ≈ 0 (−0.4) | ≈ 0 (−1.2) | ≈ 0 |
| transparent and additive | ≈ 0 | ≈ 0 | ≈ 0 |
| shadow maps | ≈ 0 (−1.5) | ≈ 0 (0.2) | ≈ 0 (−0.8) |
| post (GTAO, bloom, SMAA) | 1.7 ms | ≈ 0 | ≈ 0 |
| floor (grade pass, clears, present) | 2.1 ms | 2.5 ms | 2.2 ms |
| CPU main thread, live, median / p95 | 2.4 / 3.4 ms | 2.2 / 3.5 ms | 2.1 / 3.6 ms |
| render submission (CPU) median | 1.5 ms | 1.5 ms | 1.2 ms |
| unlit swap saves | 4.3 ms (24 %) | 3.3 ms (24 %) | 1.5 ms (11 %) |
| half resolution (¼ of the pixels) | 14.4 → 12.2 ms | 13.4 → 15.7 ms | 14.5 → 13.7 ms |
| alpha-tested layers per covered pixel (screen covered) | 1.44 (4.4 %) | 1.41 (2.2 %) | 0 |
| all opaque layers per pixel | 1.45 | 1.29 | 1.04 |

Paired differences scatter by ±2-5 ms on this machine with other work running (the "≈ 0" rows have
interquartile ranges that straddle 0), so only the opaque row and the floor are resolved; about 10 ms of each
frame is not attributed by these probes.
**Fragment-bound: no** at the bar's resolution: a quarter of the pixels saves 0-2 ms (A21's DPR-2 pass, 2.6 ×
the pixels, does double the frame, so pixel cost grows above it). **Depth pre-pass: no** (1.41-1.44 alpha-tested
layers per covered pixel against 2.5, and no measurable alpha-tested time against 3 ms; nothing in the scene
uses alpha test; the discards are Brea's fade dither, her wrap, the outfit, the stow kit and the lamp discs).
The unexplained part points at geometry and vertex work (2.2-2.8 M triangles, the instanced wind-blown reeds and
blades, three shadow cascades); one Metal System Trace (TECH §8) is the next probe; it is a large download and waits for a yes.
Tools: `tools/perf/attrib.mjs` and `tools/perf/attrib-page.mjs`.

**M0.13: the single-asset turntable page is not exempt from the one-Chrome rule.** `tools/turntable/` (one GLB,
room light, AgX, no world), measured by `tools/turntable/measure.mjs` in its own 1024 × 1024 headless Chrome beside
a running gate Chrome, 5 minutes, reloading every 30 s: resident 0.58-0.85 GB RSS, 0.62-0.67 GB physical
footprint (under the 1.5 GB line). The guard was not quiet: on this 18 GB Mac free memory fell to 40 % (median
50 %) and the pressure level reached 2 in 8 of 56 readings; in the 90 s before it started, the gate Chrome alone
held free memory at a 55 % median (minimum 45 %) and pressure level 1. Q10.4 (a second machine) is raised now.

## Next, in order

1. Boot `r5/int` in the gate browser and close BACKLOG I10.
2. Merge the newer checkpoints of world-ground, world-sky, world-props and look-post (BACKLOG I7).
3. M0.4 Frame Set tooling, then M0.5 the baseline run of F01–F32.
4. M0.6 Tier 0 checks as Node scripts, with the name lint and its allow-list; bring the lint to 0.
5. M0.12 re-stage the 77 kept-stack rows on the turntable and the island; run them.
6. M0.7 the three.js upgrade: done (r187, above).
7. M0.8 frame-cost attribution on F02, F23 and F32: done (above); a Metal System Trace once the download is agreed.
8. M0.10 compressed textures in the build. M0.11 the face test on F11–F13. M0.13 the single-asset turntable
   measurement. M0.14 rebuild Brea and the clip pack from source.
9. Then Milestone 1a: the Pans at golden hour, walkable.

## Milestones

| | what it delivers |
|---|---|
| **M0 Reset** | one integrated branch; the earlier prototype removed; a baseline Frame Set; compressed textures; the engine upgraded under guard; the frame cost explained |
| **M1a The look** | the Pans at golden hour, walkable; Brea to her turnaround; the animation bars; one finished Instrument (the Plumb); one finished person (Ansel); the glass HUD |
| **M1b The slice** | Saltrow and the first twenty-five minutes: "Raker's Morning" from the Brazier to the Scout rung |
| **M2 The first hour** | Ninewalls and the Crescent Holds, the first Screed, the Tiller herd, the first re-survey, calima at noon |
| **M3 Hour two** | the Survey Kite, the Malpaís and Kiln Yards, four more Instruments |
| **M4 North and west** | the Cloudline, Mistfold and the Fog Harp, the Drowned Flank, the Dredge |
| **M5 The end** | the Caldera, the Calibration Yard, the Transit, the Fundamental |
