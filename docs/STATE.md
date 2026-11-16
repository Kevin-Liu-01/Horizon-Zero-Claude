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

## M1a round 2 (Nov 15 2026)

Review run at **dee526d** on `r5/int`, filmed from a clean detached worktree: all 34 frames of Frame Set v2,
166 s of the gate browser, 0 console errors. The review page compares each Milestone 1a frame with the
2026-11-14 refilm at b4b46fb, which is still the anchor for every frame (none is accepted yet). Frame Set v2
re-staged F02, F03, F13, F14-F19 and F32 (`tools/frames/README.md`), so those frames are compared knowing the camera
moved.

**Tier 0 at dee526d:** PASS, 8 pass, 0 fail, 1 skipped (boot, not requested): `vite build` clean, name lint 0
listed-term hits in 627 files, licences 219 files against 29 rows, 0 assets over a cap, resident textures 53.42 MB
of 175 MB, shipped 42.49 MB, import graph clean, 37 Node tests pass. Nothing needed fixing.

**Kept-stack rows at dee526d** (two sessions, every row reached): 80 rows, 64 pass, 6 fail, 2 pending, 8 visual
(4 pass, 4 fail on the review lane's reading).

| row | result | number |
|---|---|---|
| A17-draw-beats | FAIL, regression since 471b07d | loose follow-through 0.0056 m (bar >= 0.05) |
| A32b-lookup-no-ghost | FAIL, regression since 471b07d | 1 of 26 hero materials left with depth writes off under an occluder (bar 0): the new shadow-proxy material is counted with her fade materials |
| A80-chrome-profile-hygiene | FAIL at dee526d, regression; **fixed in b8640ed** (PASS) | the runner's relaunch path moved past the row's static window |
| A32-draw-ramp | FAIL | index knuckle to the jaw-corner anchor 0.042-0.050 m at full draw in all 6 cells (bar 0.03); the hook stays within 0.014 m of the nock |
| A90-memory-stability | FAIL | +54 geometries over 30 kill/respawn cycles (bar 40), heap +2.2 % |
| A70-hub-tabs | FAIL (as before) | the K key shows the map tab, not the skills tab |
| V1, V3, V13, V-traversal | visual FAIL | V1 and V3: lens behind her with the legs cut, no arm swing or crouch readable; V13: the feet point opposite ways; V-traversal: the ledge panel does not frame her |
| A9-perf-budget | PENDING (box load 4.83) | 59.9 fps median, p95 17.3 ms, 106 draws |
| A76-footfalls | PENDING | no staged kind declares a size class |

Closed since round 1: A16-draw-anchor (knuckle to jaw 0.014 m, hook 0.0083 m in all 20 cells), A44 (0 m), A44b
(worst 0.078 m), A56, A71d and A107 (behind the head in the band at most 0.069 m, bar 0.10) now pass.

**Milestone 1a exit items still open** (numbers at the commit named; no world, sky or Instrument source changed
between fd97ff9 and dee526d):

| area | open | number |
|---|---|---|
| world (M1.1a) | F02 at 11 ms or less with the look off | 11.9 ms (89d1883), 10.8 ms (5507180) on the same geometry; needs a quiet-box run |
| world (M1.1b) | no crawl on the meadow in the walking clip | fails (aea853c) |
| world (M1.1c) | each silhouette layer 6 L* from its neighbour in F05 | gaps 23.9 / 10.3 / 0.4 / 6.1 (73a80b7); 5 layers, strata, outline and Organ rows pass |
| world (M1.1d) | 12 panels countable at 150 m; the fallen quadrant | not counted this round |
| world (M1.1e) | F04 against the material swatches; no repeat under 20 m | only black sand at 1 m matches; F04 mean luminance 33.5 % (dee526d); salt crust and meadow top-downs to re-read |
| world (M1.1j) | F32 frame bar | 96 draws, 0.80 M triangles pass (dee526d); timing not on a quiet box; field walls not visible |
| sky-look (M1.1f) | shadow hue 280-330 deg | F02 47.9 (fd97ff9) fail; F05 314.3 pass; needs a ruling for warm shaded ground |
| sky-look (M1.1g) | palette within 12 dE | F05 9.8 pass; F02 and F04 to re-read on the re-registered boxes |
| hero-art (M1.2b) | no pure-black pixel on the face | 0 / 12 / 1 px in F11 / F12 / F13 (dee526d; 0 / 0 / 0 at 970a991): regression |
| hero-art (M1.2b) | no polygon edge on the ear rim | 1 corner, 6 and 8 kinked runs (dee526d) |
| hero-art (M1.2c) | the tail a gathered cloth volume | still a stiff strip on film |
| armory (M1.2d) | five swatches within 10 dE | 4 of 5: boots 10.1 (dee526d; 2.0 at b7695e4): regression |
| armory (M1.2d) | all 14 pieces | left bracer cap missing |
| hero-anim (M1.2e) | 0 clipping frames | 1 crouch frame (dee526d) |
| hero-anim (M1.3b) | knuckle within 0.03 m at full draw | 0.042-0.050 m (A32); A16 passes |
| hero-anim (M1.3d, M1.3f) | Undercut; head-plane rows; A104 | fail |
| instruments (M1.4c) | A-weak40:plumb; topple row's gait clause; A90 | fail; topple 4.011 s, vial 0.30 m, 21,674 triangles pass |
| people (M1.5b) | embroidery at 3 m | not legible; density passes (face 1.051, outfit 1.057 of Brea's) |
| all (exit 5) | the frame bar in F02 and F23 | not measured on a quiet box this round |

Frames that moved most toward their targets since the refilm: F02 (the Ring, the pans and the sun now in frame,
warm light, soft cloud), F03 (a sunlit meadow instead of black sand) and F19 (the lance lunge readable head to boots
on the salt). Furthest from their targets: F04 (one milky crust, none of the other swatch materials), F05 (black
backlit slabs, no layered vista) and F20 (two small figures behind a foreground blade).

**Rulings taken during round 2** (the orchestrator, recorded so the rows can be graded):
- Shade hue: the 280-330 deg band in M1.1f contradicts the reference crops, which measure 39-50 deg on warm shaded ground by the same rule. The row is restated: shade hue within 15 deg of the crop's own shade hue, measured by the same rule; never cobalt (no shade pixel of hue 200-260 deg on skin or warm sand). Under this ruling F02's 47.9 deg passes; F05's 314.3 deg is graded against F05's own crop.
- F23 and F24 were re-framed after the freeze (789a0f8) so the Plumb reads at its size; ratified.
- The vial's weak point is a 0.10 m sphere; a shot that visibly misses the glass must not count.
- M1.2g "frame totals unchanged" means: Brea within 60 k triangles and 6 draws in F08, and no growth in the F02 and F23 GPU medians from her change, paired at a commit. Studio-frame totals are not a bar.

## M1a round 3 and the exit run (Nov 15 2026)

Round 3 was the last build round of Milestone 1a. The exit run measured `r5/int` at **ec694b7** from a clean
detached worktree. Its own commits add only `tools/perf/exit-bar.mjs` (04bed32, 7d4856e, 5d61cee, fb6d5f0), so every
number at those commits is ec694b7's game. Port 5270, one Chrome slot. The box was as quiet as it gets: the
1-minute load average sits beside every number.

**Tier 0 at ec694b7: PASS, 10 of 10.**
- `vite build` clean.
- Name lint: 0 listed-term hits in 630 files.
- Licences: 219 files against 29 rows.
- Assets: 0 over a cap.
- Resident textures: 53.42 MB of 175 MB.
- Shipped size: 42.52 MB.
- Import graph clean.
- 39 Node tests pass, 3 todo: Pan II, Pan III and Ash I were built against an older body.
- Boot: 2.9 s, 0 errors.
- Rendered-page name lint: 0.

**The frame bar (TECH §9.1)**, at 1600 × 900 CSS px, DPR 1.25, quality `high`, on an Apple M3 Pro with ANGLE Metal
and Chrome 151. Tool: `tools/perf/exit-bar.mjs`.

| line | F02 | F23 (Plumb) | F32 | bar | result |
|---|---|---|---|---|---|
| median GPU, M0.8 back-to-back readback (submit + GPU, 7 repetitions of 60 frames, vsync off) | 13.1 ms | 13.2 ms | 9.1 ms | ≤ 14 ms | PASS |
| p95 presented-frame interval over 30 s, vsync on | 17.5 / 17.6 / 17.1 ms | 17.5 / 17.7 ms | 17.6 ms | ≤ 16.7 ms | FAIL as written; see below |
| frames presented in 30 s; frames over 33 ms | 1799; 0 | 1798; 0 | 1799; 0 | | 59.97 fps, no dropped frame |
| main-thread JS per frame, p95 | 3.4 ms | 3.5 ms | 3.8 ms | ≤ 8.0 ms | PASS |
| draws; triangles | 91; 1.41 M | 92; 1.29 M | 96; 0.80 M | ≤ 350; ≤ 6.5 M | PASS |

The load average was 1.8–3.7 during the live windows and 2.3–2.9 during the GPU readings.

**The interval line cannot pass in this harness.** A full-size WebGL canvas that does nothing but clear, run in the
same headless Chrome, reads p95 17.8 ms over 30 s (1798 frames). Headless Chrome's presentation timestamps jitter by
about ±1 ms around 16.7 ms, so no page can read ≤ 16.7 ms at p95. The game presents 59.97 frames a second and drops
none. The line needs a ruling: grade the frame count and frames over 33 ms instead, or measure in a headed browser
on the display.

**Load and hitches**, on the built game served by `vite preview` (vsync on):
- Title interactive: 3.04 s cold, 2.85 and 2.63 s warm (bar ≤ 5 s): PASS.
- New Game to control: 0.41 s cold, 0.24 s warm (bar ≤ 8 s): PASS.
- First load: 41.05 MB in 212 requests (bar ≤ 60 MB): PASS. Tier 0's boot reads 70.76 MB because it boots the dev
  server's unbundled modules.
- 30 s of play right after New Game: 0 frames over 50 ms, 0 over 33 ms. The bar's 10-minute slice run is M1b.

**Frame Set at fb6d5f0:** all 34 frames, 164 s of Chrome, 0 console errors. Each frame is compared with the
2026-11-14 refilm at b4b46fb and with round 2 at dee526d. No frame is accepted yet.
- Moved toward its target since round 2:
  - F04: white crust, the black-sand dyke and a pink brine pond in one frame.
  - F05: the Organ reads as lit basalt, not black slabs.
  - F08–F10, F12, F13: the brass on both bracers; the wrap tail wrung at the root and torn into two tongues.
  - F20: larger figures; Ansel's orchil band and harness.
  - F30: the Brazier's streaks are gone.
- The same as round 2: every other frame.
- Furthest from its target:
  - F04: the crust reads as smooth plaster; the dyke stones are flat chips; palette 13.2.
  - F17: crust where the crop has meadow; the pale draw shoulder.
  - F05: no layered vista and no glitter path.

**Kept-stack rows at fb6d5f0** (two sessions, every row reached): 80 rows, **75 pass**
(69 action, 6 visual), **3 fail** (A70: K shows the map tab; visual V13: the feet point opposite ways in the strafe
step; visual V-traversal: the ledge panel frames no Brea), **2 pending** (A9: the gate browser lifts the 1-minute
load past 3, 59.9 fps; A76: no staged kind declares a size class). Closed since round 2: A17 (follow-through
0.086 m), A32b, A80, A32 (knuckle to jaw 0.014 m in every cell), A90 (+16 geometries over 30 cycles, bar 40), V1, V3.

**Milestone 1a exit, as measured.** Of the five exit conditions:
- **Condition 5** passes on GPU, CPU, load, first-load size and resident textures. The p95 interval line waits on
  the ruling above; the kept-stack rows are listed above.
- **Conditions 1–3** wait on frame acceptance, which no frame has.
- **Condition 4** (F32) fails only its LOD-seam line: 3 px, widest 4, against a 2 px bar.

Open frozen rows, with the numbers at the commit named:

| item | row | number |
|---|---|---|
| M1.1a | F02 GPU with the look off ≤ 11 ms | 12.0–12.2 ms (159b9fd), 11.5 ms (a000205); no world source changed after 49563ce, which was not measured whole |
| M1.1b | no crawl in the walking clip at 1 m/s | 12–30 m band 85.8 per mille against the reference's 69.5 (the variant shipped in 49563ce); sprint passes |
| M1.1e | F04 against the material swatches; 40 m top-downs | crust 25.6 ΔE at 1 m (159b9fd); the brine and Glass swatches fail (a000205); salt-crust top-down 0.540 (bar 0.3) |
| M1.1f | shade hue within 15° of the crop's, F05 | 15.3° against 41.2° (e02321c) |
| M1.1g | palette ≤ 12 ΔE, F04 | 13.2 (fb6d5f0); F02 8.3 and F05 11.4 pass |
| M1.1h | a landmark above her head in F03 | none in frame (fb6d5f0) |
| M1.1j | no LOD seam over 2 px in F32 | 3 px, widest 4 (a000205) |
| M1.2e | the panels stream downwind | a panel sways 0.046 m in the wind against 0.046 m still (e3d549b) |
| M1.2f | the lance steep with the bow beneath it (F10) | still a 45° cross (fb6d5f0) |
| M1.3b | the elbow row with the restated band | no valid page number since 349ac11; A16's elbow is −0.010 m in the aim frame (e3d549b) |
| M1.3d | A104, A105 | haft 0.108 m from the head and neck at the holster, forearm 0.049 m from the spine on the jog-heavy recover (bar 0.10; 349ac11); forearm or haft 0.142 m from the head axis while jogging (bar 0.16; e3d549b) |
| M1.3f | one blend in the sweep | unstow lance into a roll: 1 step with a hand behind the head (e3d549b) |
| M1.6g1 | HUD cover and surfaces | not measured this round |

Closed this round:
- **The round-2 blockers:**
  - Pure-black face pixels: 0 / 0 / 0 on face skin.
  - The boot swatch: 2.8 ΔE; all five swatches within 10.
  - A17: the loose follow-through 0.064 m.
  - A32b: 0 hero materials left with depth writes off.
  - The last cloth-clipping frame: 0 in every sweep row.
- The ear rim and the tail root (Node rows).
- The F05 layers, the Ring rows and line of sight.
- A-weak40 for the Plumb: 9 of 10 shots stop on the glass.
- The rivets: 27 of 30, marginal.
- Ansel's density, budget and layers.
- Brea's budgets: no GPU growth from her change, paired at 7d263d6 against 87dc149.

**Rulings after the exit run** (the orchestrator):
- The p95 frame-interval line of TECH §9.1 cannot be met in headless Chrome as written: a WebGL canvas that only clears reads p95 17.8 ms in the same harness. In headless runs the line is graded as "at least 1782 frames presented in 30 s and none over 33 ms"; the literal p95 line is taken in a headed browser on the display at the milestone exit. F02, F23 and F32 pass the headless form (1798-1799 frames, 0 over 33 ms).
- A9 stays pending inside a kept-stack run (the gate browser itself lifts the load) and is graded in the exit-bar session.
- main is fast-forwarded to r5/int at fb6d5f0: no frame is accepted yet, so none can have got worse, and every M1a frame is the same or closer than the M0 refilm.


## M1a debt and M1b wave 1 (Nov 15 2026)

Four lanes worked in one tree on `r5/int`: world (M1a debt), hero-anim (M1a debt), instruments (M1.4d the Peg,
M1.4e the Gauge, M1.4f) and systems (W1 writing, M1.6a the quest spine, M1.6f save v6, M1.6c the Brazier). Each lane
had a builder, a judge and one fix round. The review measured `r5/int` at **39f7533** from a clean detached worktree,
port 5270, one Chrome slot.

**Tier 0 at 39f7533: PASS, 10 of 10.**
- `vite build` clean.
- Name lint: 0 listed-term hits in 668 files.
- Licences, assets, import graph: clean.
- Resident textures: 53.42 MB of 175 MB. Shipped size: 42.92 MB.
- 56 Node tests pass, 3 todo (Pan II, Pan III and Ash I were built against an older body).
- Boot: 2.9 s, 0 errors. Rendered-page name lint: 0.

**Frame Set at 39f7533:** all 34 frames, 165 s of Chrome, 0 console errors. Sixteen frames are now compared with their
provisional anchors at fb6d5f0 (PROCESS §4 two-page rule, recorded in `tools/frames/accepted.json`); the rest with
the 2026-11-14 refilm.
- **Got further than the anchor (regressions):**
  - F05: a Brazier's cistern ring of plain box blocks stands in the foreground beside Brea.
  - F09: the front sash panel streams forward as a stiff point in the still studio (the new wind coupling).
- **The same as the anchor:** F02, F03, F08, F10, F11, F13-F16, F18-F20, F23 (Plumb), F24. The salt cells read
  darker with the new crust grain (3-4 points of mean luminance).
- **Moved toward the target:**
  - F04: the palette now passes (10.2 against the bar of 12; 13.2 before). The crust has grain, though it still
    reads blotchy, and the brine pond left the frame.
  - F32: the haze band along the ridge is gone.
  - F23 (Peg), F23 (Gauge), F25, F26: the new Peg and Gauge stand in their frames, and the Sighting card belongs to
    the live Gauge.
  - F30: Brea sits at a burning Brazier. The frame's right edge is crowded by an untextured wedge and box blocks.
- F02 8.2 and F05 11.4 still pass the palette line. Shade hue was not re-read in this round.

**Kept-stack rows at 39f7533** (two sessions, every row reached): 80 rows, **72 pass** (64 action, 8 visual),
**6 fail**, **2 pending** (A9 and A76, as before).
- Closed since the exit run: V13 (both feet now point the way she travels) and V-traversal (the ledge panel frames
  her).
- New failures since the exit run:
  - A71g: the field-note tracker never shows.
  - A65: the row still reads the version-5 save key, and the game now writes save v6.
  - A44b: the Peg's rack socket is 0.165 m off its drawn vertices (bar 0.10).
  - A78: the cast-state row picks the neutral Gauge, which has no attack state.
  - A90: +43 geometries over 30 cycles (bar 40; +16 at the exit run).
- Still failing: A70 (the K key shows the map tab).
- Key numbers:
  - A16: knuckle to jaw 0.014 m in every cell.
  - A107: behind the head in the band at most 0.066 m (bar 0.10).

**What landed this round:**
- **World:**
  - The F04 palette passes.
  - The F32 haze band is gone.
  - The violet meadow clumps are back.
  - The Organ is lighter (L* +1.8).
  - The Glass mirror is tinted toward emerald at a grazing look.
  - The meadow's far edge is softened.
- **Hero-anim:**
  - The roll blend, the hang pose and the Alidade raise keep both hands in front of the head. The dressed-rig bench
    reads 0 behind-head steps in 22 clips.
  - The crouched Undercut seats the haft in the left palm (bench).
  - V13 and V-traversal pass.
- **Instruments:**
  - The Peg is built on the shared hull kit (11/11 model checks). One lamp hit kills it (10 of 10).
  - The Gauge is a 5.5 m lighthouse on stilts on the same kit (13/13). It runs its tide clock and sluice, and its
    Sighting card reads TIDE 0.4 m.
- **Systems:**
  - The slice's writing is in place as plain data under `src/game/text/` (all 7 writing checks pass).
  - Raker's Morning runs in the live game.
  - Save v6 has three slots, silent checkpoints and the one death rule.
  - The Brazier works: kindle, sit, rest and the refusal near alert Instruments.
  - 17 Node rows pass.

**Still open, with the commit each number was taken at:**

| item | row | number |
|---|---|---|
| M1.1b | no crawl in the walking clip | 1.39x the reference in the 12-30 m band (bar 1.10x; 2be9311, meadow unchanged since) |
| M1.1e | F04 mean luminance >= 40 % | 31.5 % (39f7533); the brighter crust failed the palette, so the two lines need one answer |
| M1.1e | salt-crust top-down < 0.3 | not re-read after the grain change |
| M1.1j | no LOD seam over 2 px in F32 | 0 px between LOD levels; 3 px of sky in a notch between chunks: needs a ruling on what counts as a seam |
| M1.1a | F02 GPU with the look off <= 11 ms | not measured whole this round |
| M1.2e | the panels stream in the wind | the coupling now also moves them in the windless studio (F08, F09) |
| M1.2f | the lance steep with the bow beneath it (F10) | not attempted; still a 45° cross |
| M1.3d | A104, the Undercut row in the page | both fail (920c509) |
| M1.3h | rake, kindle, cane-cut clips | the clips do not exist yet |
| M1.4d | a swarm cuts a 1.0 m lane | 0 of 90 at 8d18c28; fixed in Node only (137b190), not yet filmed |
| M1.4e | the Gauge wades to 1.2 m | the Glass is 0.64 m deep at most: needs a ruling or a deeper Glass |
| M1.6a | the slice hour, input-driven | 10 of 14 beats (7ae0fd0) |
| M1.6f | save and continue in the live game | the reload hangs before the title (3 of 3 runs) |
| M1.6c | F30 | closer on silhouette and light; the finish is further: an untextured wedge at the right edge, box blocks, faceted stones |

## M1a regressions run (Nov 15 2026)

Three lanes fixed the regressions found at 39f7533: systems (the Brazier in F05, A71g, A65, save-and-continue),
hero-anim (the sash panels in the studio, A104, the Undercut), and instruments with world (A44b, A78, the Gauge's
wade, F32's crack). The review measured `r5/int` at **de57067** from a clean detached worktree, port 5270, one Chrome
slot.

**Verdict: NOT CLEAN.** Two accepted frames got further than their anchors (F15, F19), and one kept row fails that
passed at fb6d5f0 (A90-memory-stability). `main` stays on fb6d5f0.

**Tier 0 at de57067: PASS, 10 of 10.**
- `vite build` OK.
- Name lint: 0 listed-term hits in 668 files.
- Licences, assets, import graph: clean.
- Resident textures: 53.42 MB of 175 MB. Shipped size: 42.92 MB.
- 58 Node tests pass. The systems rows pass 19 of 19.
- Boot: 2.8 s, 0 errors. Rendered-page name lint: 0.

**Frame Set at de57067:** all 34 frames, 165 s of Chrome, 0 console errors. The sixteen accepted frames are compared
with their provisional anchors at fb6d5f0; the rest with the 2026-11-14 refilm.
- **Got further than the anchor (regressions):**
  - F15: the back sash panel stands out level behind her hip as a stiff blade while she runs. It already did so at
    39f7533, where the review missed it.
  - F19: in the lunge, the front sash panel shoots straight forward as a long, level strip.
- **Fixed since 39f7533:** F05 (no Brazier in the vista) and F09 (the front panel hangs again) are the same as their
  anchors.
- **The same as the anchor:** F02, F03, F05, F08, F09, F10, F11, F13, F14, F16, F18, F20, F23 (Plumb), F24. In the
  windless studio the wrap tail now hangs (F08, F10, F13), which is nearer the target. F03 shows its field note again.
- **Moved toward the target:**
  - F12: the tail hangs behind the jaw.
  - F30: the cistern is a dressed stone well behind the bowl. The bowl stands on smooth stones. The box blocks are
    gone. A pale wedge still fills the right edge.
- **Small change to watch:** the static Gauge on the horizon at Sluice 3 has been gone from F02 and F24 since
  39f7533. The living Gauge replaces it only when its keeper spawns.
- Palette: F02 8.2, F04 10.2, F05 11.4. All pass the bar of 12.
- F04 luminance (restated: within 5 points of the crop's own mean luminance). The crop reads 6.3 % and the frame
  31.5 %. The crop is mostly dark swatches, so the two lines pull apart. The palette line wins, and it passes.

**Kept-stack rows at de57067** (two sessions, every row reached): 80 rows. **76 pass** (68 action, 8 visual), **2
fail**, **2 pending** (A9 and A76, as before).
- Fixed since 39f7533:
  - A71g: the field note shows.
  - A65: restated to the save v6 key. It passed on the runner's retry.
  - A44b: worst 0.054 m (bar 0.10).
  - A78: restated to the Plumb. Attack is held for 1.03 s.
- **Still failing:**
  - A90-memory-stability: +43 geometries over 30 cycles (bar 40; +16 at fb6d5f0).
  - A70: the K key still shows the map tab, as it did at fb6d5f0.
- Key numbers:
  - A16: knuckle to jaw 0.014 m.
  - A107: behind the head in the band at most 0.070 m (bar 0.10).
  - A9 (pending, busy box): 59.9 fps, 116 draws.

**What landed this run:**
- **Systems:**
  - The Brazier and cistern are built art and stay out of every accepted frame.
  - The field note shows when play starts without New Game or Continue.
  - Continue loads the real save, and save-and-continue no longer hangs.
- **Hero-anim:**
  - The studio has no wind.
  - The Undercut and the melee self-clear rows pass (at c49cb19).
- **Instruments and world:**
  - The Peg's rack socket sits on the hull.
  - A78 is restated to the Plumb.
  - The Gauge wades 0.64 m into the Glass.
  - F32 shows no crack (0 px). The fix is a level landing on the Rust Cone's T3 ramp.
  - The frame set is now v3.

**Ruling (M1.2f):** the bible puts the bow on the opposite diagonal to the lance, so from behind they always cross; "bow beneath" means the bow lies under the lance (nearer her back), not steeper. M1.2f is graded as: lance in its 32-40 deg band, bow on the opposite diagonal beneath the lance, A-stow-clearance passing. F10 as accepted stands.

## M1a regressions run 2 (Nov 15 2026)

Two lanes fixed what was still open at de57067. Hero-anim worked on the sash panels in F15 and F19. Instruments and
world worked on A90, the Gauge's wade row, the Peg lamp row and the Sluice 3 Gauge on the horizon. The review measured
`r5/int` at **6511d94** from a clean detached worktree on port 5270, using one Chrome slot.

**Verdict: NOT CLEAN.** One accepted frame is still further from its anchor (F19). One kept row fails that passed
at fb6d5f0 (A90-memory-stability). `main` stays on fb6d5f0.

**Tier 0 at 6511d94: PASS, 10 of 10.**
- `vite build` OK.
- 58 Node tests pass. The import graph is clean.
- Boot: 2.9 s, 0 errors, 72.19 MB first load. Rendered-page name lint: 0.

**Frame Set at 6511d94:** all 34 frames, 165 s of Chrome, 0 console errors.
- **Still further than its anchor (regression):** F19. In the lunge, the front sash panel is thrown forward and
  down past her front knee as a broad fan. The anchor's panel curls down in front of the thigh. This is closer than
  at de57067, where the panel was a thin level strip, but it is still further than the anchor.
- **Fixed:** F15. The back panel hangs down and back while she runs, the same as the anchor.
- **The same as the anchor:** F02, F03, F05, F08, F09, F10, F11, F13, F14, F15, F16, F18, F20, F23 (Plumb), F24.
- **Small change:** the Sluice 3 Gauge is back on the horizon in F02 and F24. It is now the living Gauge standing at
  its post, which reads about half as tall as the old static tower.
- Every other frame is the same as at de57067.
- Palette: F02 8.2, F04 10.2, F05 11.4. All pass the bar of 12.
- F15 and F19 cannot yet be repeated. The filmer times the run and the lunge by the wall clock, so each film catches
  a different point in the stride or swing.

**Kept-stack rows at 6511d94** (two sessions, every row reached): 80 rows. **76 pass** (68 action, 8 visual), **2
fail**, **2 pending** (A9 and A76, as before). This is the same result as at de57067.
- **Failing:**
  - A90-memory-stability: +43 geometries over 30 cycles (bar 40; +16 at fb6d5f0).
  - A70: the K key shows the map tab, as it did at fb6d5f0.
- A65 passed only when the runner retried it, for the second review in a row.
- Key numbers:
  - A16: knuckle to jaw 0.014 m.
  - A107: behind the head in the band at most 0.070 m (bar 0.10).
  - A44b: worst 0.054 m (bar 0.10).
  - A9 (pending; the machine was busy): 59.9 fps, 116 draws.

**A90 is not a leak, by the instruments lane's attribution.** Of the 61 geometries first drawn during the row, 50 are
the Saltrow people's level-of-detail meshes. They first draw as Brea walks within 90 m of them. One geometry was
freed, and none sits outside the scene. The bisect named no commit, because commits that run the same game read
anywhere from +16 to +34, depending on how much of the world was drawn before the row began. The row needs a ruling:
either warm the world before counting, or upload those meshes at load.

**Rows outside the kept stack** (the hero-anim lane's numbers at 54ad1d3; the review did not re-run them):
- A104 fails. The forearm comes within 0.037 m of the spine in the holster case (bar 0.10). It passed at c49cb19.
- A-sweep-wind fails by 1.3 deg on its bearing at F02. It passed at de57067.
- A-stow-clearance and A-sweep-climb fail.

**What landed this run:**
- **Hero-anim:**
  - As her hips travel, the sash panels' standing wind tuning eases back to the air of the accepted frames.
  - A probe reads each panel's angle in the F15 run and the F19 lunge.
- **Instruments and world:**
  - The keeper Gauge searches the Glass on a 0.5 m grid and stands in its deepest water: 0.767 m, against the
    deepest 0.785 m. All seven Gauge rows pass.
  - The Peg probe holds the swarm member still before it aims. All five Peg rows pass, including 10 of 10 lamp kills.
  - The keeper Gauge stays at its post in frames without a crowd. This changed the filmer (`tools/frames/page.mjs`).

**Rulings after run 2:**
- A90-memory-stability counts from the end of one warm cycle: the attribution found 61 geometries drawn for the first time during the row (50 of them the Saltrow people's distance meshes as Brea walks within 90 m), none outside the scene. A first draw is not a leak. The row warms one full cycle, then counts 30; the bar (40) is unchanged. The people's distance meshes should also upload behind the loading sheet.
- F15 and F19 are staged on simulation time at a fixed clip phase, not the wall clock, so they repeat; their anchors are re-filmed at fb6d5f0 with the same staging before the comparison.

## M1a regressions run 3 (Nov 15 2026)

Two lanes worked on what was still open at 6511d94. Hero-anim worked on the sash panels in the lunge (F19), A104, the
sweep rows and A-stow-clearance. Engine staged F15 and F19 on simulation time, re-filmed their anchors at fb6d5f0 the
same way, and put A90 on its restated row. The review measured `r5/int` at **4175212** from a clean detached worktree
on port 5270, using one Chrome slot.

**Verdict: NOT CLEAN.** Two accepted frames are further than their anchors (F15, F18). One kept row failed in its
session that passed at fb6d5f0 (A45c-foot-continuity; it passed on two re-runs). `main` stays on fb6d5f0.

**Tier 0 at 4175212: PASS, 10 of 10.**
- `vite build` OK.
- 58 Node tests pass. The import graph is clean.
- Boot: 3.2 s, 0 errors, 72.22 MB first load. Rendered-page name lint: 0.

**Frame Set at 4175212:** all 34 frames, 170 s of Chrome, 0 console errors. F15 and F19 are staged on simulation
time and freeze at the same point as their re-filmed anchors (the run at gait phase 0.0271, the lunge at contact key
0.7143).
- **Further than its anchor (regressions):**
  - F15: while she runs, the front sash panel is thrown forward from the hip as a stiff, level strip, and the back
    panel flicks up behind. In the anchor the front panel trails down at about 45 deg to below the knee. Both are
    filmed at the same point of the same stride. The review filmed 6511d94 with the new filmer and saw the same, so
    the change came in with the sash wind work between fb6d5f0 and 6511d94. The earlier review's "F15 fixed" was one
    lucky wall-clock film.
  - F18: in the crouched aim-strafe, both boots now stand side by side and the front panel is flung out sideways. The
    anchor kneels with the near knee toward the lens, and the panel hangs to the ground. 6511d94 and 662fb68 filmed
    with the new filmer show the same pose, so the game did not change here; the filmer's new timing catches a
    different point of the 1.3 s wall-clock strafe. F18 needs simulation-time staging and a re-filmed anchor.
- **Fixed:** F19. The front panel goes forward and down ahead of her front knee, as in the anchor.
- **The same as the anchor:** F02, F03, F05, F08, F09, F10, F11, F13, F14, F16, F19, F20, F23 (Plumb), F24.
- **Small change:** in F21 a cloth strip on the man's head wrap now stands straight up to the rake head.
- Palette: F02 8.2, F04 10.2, F05 11.4. All pass the bar of 12.
- The engine lane's repeat test: three films of F15 and F19 at one commit differ on at most 0.6 % of the frame and
  3 % of her screen box (hair ribbons and panel tips). They are not pixel-identical.

**Kept-stack rows at 4175212** (two sessions, every row reached): 80 rows. **77 pass** (69 action, 8 visual), **2
fail**, **1 pending** (A76).
- **Fixed:** A90-memory-stability on its restated row (one warm cycle, then 30 counted): geometries -1 (bar +40),
  textures -2, heap +0.7 %. The warm cycle itself drew no new geometry; the people's meshes now upload behind the
  loading sheet.
- **A9-perf-budget passes** on a quiet box for the first time: median 59.9 fps, 116 draw calls.
- **Failing:**
  - A45c-foot-continuity: a Tiller's planted foot slid at 3.56 m/s in one frame (bar 3). Two re-runs passed at 2.99
    and 1.77 m/s. It read 0.16 at 6511d94 and 1.42 at fb6d5f0. The row is now near its bar.
  - A70: the K key shows the map tab, as it did at fb6d5f0.
- A65 passed only when the runner retried it, for the third review in a row.
- Key numbers:
  - A16: knuckle to jaw 0.014 m.
  - A107: behind the head in the band at most 0.067 m (bar 0.10).
  - A44b: worst 0.054 m (bar 0.10).

**Rows outside the kept stack** (the hero-anim lane's numbers at 0b01237; the review did not re-run them):
- A104 passes: the haft clears her head, neck and spine by 0.150 m in the second light swing (bar 0.12), and the
  forearm clears the spine by 0.120 m when holstering (bar 0.10). The haft's last guard now takes up to six passes.
- A-stow-clearance passes: the head box is covered 0 % at the median and 15.1 % at worst standing (bars 8 and 20 %).
- A-sweep-wind: its bearing clause passes in every run (194-203 deg, band 180-270), but the row fails 2 of 4 runs on
  its still-air sway clause.
- A-sweep-climb passes on fresh pages and failed once on a long shared page.

**What landed this run:**
- **Hero-anim:**
  - The sash panels' moving tuning only acts when she herself travels.
  - In a lance swing the panels fall a little harder and bend less.
  - The haft's last guard takes up to six passes.
- **Engine:**
  - The filmer stages F15 and F19 on simulation time. `film.mjs --repeat N` films a selection N times and reports the
    pixel difference.
  - The F15 and F19 anchors were re-filmed at fb6d5f0 with that staging; the old ones are kept as withdrawn.
  - A90 is restated (one warm cycle), and the people's meshes upload at load.

## M1a regressions run 4 (Nov 15 2026)

Two lanes worked on what was still open at 4175212. Hero-anim bisected the F15 sash panel and changed the panels'
moving tuning. Engine staged F16, F17 and F18 on simulation time and re-filmed the F16 and F18 anchors at fb6d5f0 the
same way. It also looked into F21 and A45c. The review measured `r5/int` at **705c2f2** from a clean detached worktree
on port 5270, using one Chrome slot. No commit landed during the review.

**Verdict: NOT CLEAN.** One accepted frame is further than its anchor: F15, on one panel. No kept row fails that
passed at fb6d5f0. `main` stays on fb6d5f0.

**Tier 0 at 705c2f2: PASS, 10 of 10.**
- `vite build` OK.
- 58 Node tests pass. The import graph is clean.
- Boot: 3.3 s, 0 errors, 72.23 MB first load. Rendered-page name lint: 0.

**Frame Set at 705c2f2:** all 34 frames, 184 s of Chrome, 0 console errors. F15 to F19 (and F24, F25) are staged on
simulation time. F18 freezes at gait phase 0.7576, the same as its re-filmed anchor.
- **Further than its anchor (regression):**
  - F15: the front sash panel is fixed. It trails down at about 40-45 deg to below the knee, as in the anchor. The
    back panel is not fixed. It is lifted back from the hip at about 40 deg below horizontal, and its broad hem turns
    out flat behind her by the lance head. In the anchor the back panel hangs nearly straight down along the thigh.
    The hero-anim lane filmed F15 at 4792804 in a short session (F14-F19 only), and there the back panel hangs. In the
    review's full session it lifts. So the simulation-time slate still lets what was filmed earlier reach the cloth.
- **Fixed:**
  - F18: the same as its re-filmed anchor. The near knee is down toward the lens, and the front panel hangs to the
    ground.
  - F16: the same as its re-filmed anchor. The back-panel flare seen at 4175212 is gone.
- **The same as the anchor:** F02, F03, F05, F08, F09, F10, F11, F13, F14, F16, F18, F19, F20, F23 (Plumb), F24.
  - F19 differs from 4175212 on 0.04 % of pixels.
  - Small change in F23 (Plumb): her back panel reads a darker violet.
- **Not fixed:** in F21 a cloth strip on the man's head wrap still stands up to the rake head.
- Palette: F02 8.2, F04 10.2, F05 11.4. All pass the bar of 12.
- The engine lane's repeat test (3 films at one commit; bar 0.6 % of the frame and 3 % of her box):
  - F18 repeats within 0.33 %.
  - F17 is borderline (about 2 %).
  - F16 does not repeat (about 6 %). On a session's first draw its front panel hangs, and on later draws it stands
    out.

**Kept-stack rows at 705c2f2** (two sessions, every row reached): 80 rows. **77 pass** (69 action, 8 visual), **1
fails**, **2 pending**.
- **Fixed:** A45c-foot-continuity passes. A Tiller's planted foot moved at most 1.513 m/s (bar 3). It read 3.56 at
  4175212.
- **Failing:** A70, as at fb6d5f0. The K key shows the map tab.
- **Pending:**
  - A9: the box was not quiet (load 4.5). It read a median 59.9 fps and 116 draw calls.
  - A76: no kind declares a size class.
  - Both were pending at fb6d5f0.
- A65 passed only when the runner retried it, for the fourth review in a row.
- Key numbers:
  - A90 (restated row): geometries 336 -> 335 over 30 cycles.
  - A45 stance drift: 0.046 m (bar 0.06).
  - A107: behind the head in the band at most 0.069 m (bar 0.10).
  - A44b: worst 0.054 m (bar 0.10).

**What landed this run:**
- **Hero-anim:**
  - The F15 bisect found the level front panel came in with the panel wind coupling change (1.2 -> 2.4 per second).
  - In motion, the sash panels again take the anchor's drag against her own travel, and they fall a little harder.
  - The lance swing keeps the tuning that fixed F19.
- **Engine:**
  - The filmer stages F16, F17 and F18 on simulation time.
  - Before a draw, the slate raises and lowers the bow once, settles for 1 s, and resets the ground conform.
  - F18 freezes at gait phase 0.75.
  - The F16 and F18 anchors were re-filmed at fb6d5f0 with that staging. The old ones are kept as withdrawn.

**Decision (the orchestrator, PROCESS §2.7):** after four regression runs the only open item is F15's back sash panel, which lifts in a full-set filming session and hangs in a short one at the same source (the cloth is chaotic under her stride and the slate does not yet reset its history). Every kept-stack row that passed at fb6d5f0 passes, and every other accepted frame is the same as its anchor. main is fast-forwarded to r5/int with F15's back panel carried as tracked debt (blocker for the next accepted-frame change, BACKLOG). Its fix: the simulation-time slate resets wind and flutter state and re-seats every cloth chain, then the back panel is tuned in the full session.

## M1b wave 2 (Nov 15 2026)

Five lanes worked in one tree on `r5/int`:
- F15 debt (engine and hero-anim): the simulation-time slate, the back sash panel.
- Settlements: M1.5a Saltrow and M1.5e the sighting kite.
- People: M1.5c the cast, M1.5f faces in dialogue, and the first part of M1.5d.
- Systems and combat: M1.6e reed cover, M1.6j the slice combat kit, and the slice run.
- UI: M1.6h the title and New Game, M1.6d the Making ledger and quick-make.

Each lane had a builder, a judge and one fix round. The review measured `r5/int` at **c455362** from a clean detached
worktree on port 5270, using one Chrome slot. No commit landed during the review.

**Verdict: NOT CLEAN.** Three things block it:
- Tier 0 fails on two checks.
- Six accepted frames are further than their anchors. In every one, the cause is the new town standing in or behind
  the frame.
- One kept row fails that passed at fb6d5f0: A16-draw-anchor, on its launch clause.

`main` stays on bb02a0f.

**Tier 0 at c455362: FAIL, 8 of 10.**
- `vite build` OK.
- **Name lint: 1 hit.** A listed term appears in a test name in `src/ui/quickmake.test.mjs` (since 9ce48f9).
- **Import graph: 1 broken rule.** `src/game/reeds/draw.js` imports three, and `src/game/` must not (since cff3f97).
- Licences, asset budgets and the import scan otherwise clean.
- Resident textures: 61.42 MB of 175 MB. Shipped size: 51.67 MB (first-load cap 60 MB).
- 98 Node tests pass in 21 files.
- Boot: 3.7 s, 0 errors, 78.88 MB first load. Rendered-page name lint: 0.

**Frame Set at c455362:** all 34 frames, 200 s of Chrome, 0 console errors. The simulation-time stagings froze at the
same frame counts as at 705c2f2.
- **Further than its anchor (regressions):** all six are caused by Saltrow standing where the frames look. Brea's
  figure, cloth and pose are the same as the anchors in every one.
  - F15, F16, F18, F19 (silhouette): lime-washed house fronts with basalt quoins and shutters now stand right
    behind her head, bow and lance. The anchors had the meadow slope and two salt cones there.
  - F24 (silhouette and finish): a flat, backlit block of houses covers the right third of the horizon, nearer than
    the Plumb, and hides the sea stack and the sun's glow on the water.
  - F20 (finish): the frame's place at the cistern is now the foot of the main street. Two faceted, untextured salt
    cones cut into both frame edges beside the figures. On silhouette F20 is closer: both figures now stand full
    length, with their legs visible.
- **Fixed:** F15's back sash panel now hangs along the thigh, as in the anchor, in the full-set session. At 705c2f2
  it lifted to about 40 deg.
- **The same as the anchor:** F02, F03, F05, F08, F09, F10, F11, F13, F14, F23 (Plumb). In F05 the town shows small
  in the far right distance; it is not further.
- **Moved toward the target:**
  - F01: the key-art title.
  - F07: the breakwater lantern, with the town's windows lit far off.
  - F21: three cast faces, and the head-wrap strip is gone.
  - F22: the main street replaces the stand-in.
  - F28: the dark glass Making ledger.
- **Mixed:** F31. She crouches inside a tall reed bed, which is closer. But the canes read as flat, straight strips
  with hard kinks that cross the whole frame, so the finish is further than at 705c2f2.
- Palette: F02 8.2, F04 10.2, F05 11.4. All pass the bar of 12.

**Ruling needed:** the town stands where the bible puts it, so these five background regressions will not go away by
a fix in one lane. The orchestrator rules on one of these:
- Re-film those anchors with the town.
- Re-stage F14-F19 and F24 so their lenses do not look at the town.
- Set a finish bar the town must meet before it stands in an accepted frame.

F20's salt cones need finish work either way.

**Kept-stack rows at c455362** (two sessions, every row reached): 80 rows. **77 pass** (69 action, 8 visual), **1
fails**, **2 pending** (A9 and A76, as at fb6d5f0).
- **Fails, passed before:** A16-draw-anchor.
  - The launch clause (at most 0.3 deg) fails in 5 of 20 cells, at 0.330-0.378 deg. Every cell read 0 at 705c2f2.
  - The cause is the bow's new sway from the slice combat kit: a loosed shot leaves turned by the breath.
  - Every other clause passes: knuckle to jaw 0.014 m, hook 0.008 m, elbow -0.010 m.
  - The fix is to measure the row on Steady (sway 0) or to restate the clause.
- **Fixed:** A70-hub-tabs passes. The K key holds the skills tab. It failed at fb6d5f0 and at 705c2f2.
- A65 passed on its first attempt.
- Key numbers:
  - A45c: 2.607 m/s (bar 3).
  - A107: at most -0.078 m (bar 0.10).
  - A44b: 0.054 m.
  - A90: geometries 379 -> 378.
  - A9 (pending, the box was not quiet): 59.9 fps, 130 draw calls (116 before the town).

**The slice run at c455362: 11 of 14 beats.** The run is driven by input from the real title. It reached wake, rake,
read, tell, cane, make, mise, cross, climb, sight and ditch, and stopped at topple. Pry and the return were not
reached.
- Brea died once at the Peg line. The death card's reload stood her up at the cistern, and she crossed on the second
  try.
- On the lee-ditch stalk she was in cover 95 % of the time and hidden 56 % (3886 frames). The Plumb's peak suspicion
  was 1.25.
- The topple found no stand from which the vial was unmasked (7 tried), so no shot was loosed.
- Save rows:
  - save-reload: PASS.
  - save-continue on top of T1: PASS, 0 m off. It was 2.2 m off before.
  - save-continue at the end: PASS.
  - death rule: PASS.
- **The live Brazier refusal row fails.** With a wary Plumb at 25 m the rule refuses, but the page that opens shows
  the rest rows.

**What landed this wave:**
- **F15 debt:**
  - The simulation-time slate clears every cloth chain's history and puts her state back to the constructor's
    before the clocks start.
  - The back panel falls harder at a run.
  - Two new film options: `--repeat-only` and `--state-probe`.
- **Settlements:**
  - Saltrow stands: 24 buildings in three lime washes, stepped rooflines, violet balconies, bougainvillea, two salt
    cones, the guild house and bell, the breakwater lantern, and lit windows from dusk.
  - Colliders and the nav grid.
  - The sighting kite.
  - A writer bug that dropped the window-spill attribute is fixed.
- **People:**
  - The slice's cast: the lantern keeper and seven Pan Houses people. No two faces are alike.
  - Faces come alive in dialogue: blinks, gaze, mouth shapes.
  - Daily routines for the crew and the lamp keeper, and the lookout's warning.
  - The head-wrap tail hangs.
- **Systems and combat:**
  - Reed cover. The gust, lull, meadow and lean rows each pass 10 of 10 (lane numbers).
  - The slice combat kit: Steady, sway, damage words, Pry, the Gauge's ballast rule, take a bearing.
  - Save-continue lands exactly on top of structures.
- **UI:**
  - The key-art title, New Game's Tolerance card, and a Loading sheet that closes on warm frames.
  - The Making ledger, and quick-make on a held slot.

**After the review:** the two Tier 0 failures are fixed on r5/int (5c8bdc9 renames a test title; 5dc520b moves the reed drawing to src/world/island/reedDraw.js). Tier 0 passes 10 of 10.

**Rulings (the orchestrator):**
- Saltrow stands where the bible puts it, so a frame whose only change is the town in its background is not a regression on silhouette. The animation-bar frames F14-F19 are judged on Brea (figure, cloth, pose); their anchors are re-filmed at the head with the town in them, as provisional anchors. F20 and F24 are judged with the town: it must meet their finish (no untextured or faceted salt cones, no flat backlit block) before they are re-anchored.
- A16-draw-anchor's launch clause is measured on Steady (sway 0): the row tests the draw rig, and the breath sway of the slice combat kit is graded by its own rows.

## M1b closing run (Nov 15 2026)

A short closing run before the budget pause. Three lanes fixed only what the wave-2 review named:
- Engine: A16-draw-anchor measured on Steady, and the animation-bar anchors re-filmed with the town (the ruling).
- Settlements and people: F20's salt cones, F24's backlit town, the crowd's violet, Ansel at her quest spot.
- Systems: the slice run's topple, the Brazier refusal page, the reed canes in F31.

The review measured `r5/int` at **6fa199d** from a clean detached worktree on port 5270, using one Chrome slot. No
commit landed during the review.

**Verdict: NOT CLEAN.** Two things block it:
- One accepted frame is still further than its anchor: **F24**. The town still stands as a flat block over the right
  third of the horizon, nearer than the Plumb, and hides the sea stack and the sun's glow on the water.
- The slice run still plays **11 of 14** beats and stops at the topple.

Everything else that blocked c455362 is fixed. No kept row fails. `main` stays on bb02a0f.

**Tier 0 at 6fa199d: PASS, 10 of 10.**
- `vite build` OK. Name lint 0 hits. Licences, asset budgets and the import graph clean.
- Resident textures: 61.42 MB of 175 MB. Shipped size: 51.69 MB (first-load cap 60 MB).
- 98 Node tests pass in 21 files.
- Boot: 3.8 s, 0 errors, 78.94 MB first load. Rendered-page name lint: 0.

**Frame Set at 6fa199d:** all 34 frames, 200 s of Chrome, 0 console errors. The simulation-time stagings froze at the
same frame counts as at c455362.
- **Further than its anchor (regression):** F24 (silhouette and finish). The walls now read pale lime instead of dull
  pink, but the block is still flat, with heavy regular quoins and no window detail.
- **No longer further:**
  - F20: the two salt cones are now round and wear the pans' own crust. They still cut both frame edges, and the
    light is still pushed orange-red. F20 is not yet re-anchored.
  - F15: Brea's figure, cloth and stride are the same as her anchor. Under the town ruling, the houses behind her are
    not a regression. Her anchor is not yet re-filmed with the town.
  - F16, F18, F19: the same as their new anchors, re-filmed with the town at b4d8df9.
- **The same as the anchor:** F02, F03, F05, F08, F09, F10, F11, F13, F14, F23 (Plumb).
- **Moved toward the target since c455362:**
  - F22: the salt cones wear the pans' crust.
  - F31: the reed canes taper on a slight curve and end in arching blade leaves and slim plumes. The flat, kinked
    strips are gone.
- Every other frame is the same as at c455362.
- Palette: F02 8.2, F04 10.2, F05 11.4. All pass the bar of 12.

**Kept-stack rows at 6fa199d** (two sessions, every row reached): 80 rows. **78 pass** (70 action, 8 visual), **0
fail**, **2 pending** (A9 and A76, as before).
- **Fixed:** A16-draw-anchor passes 20 of 20 cells. Each shot is loosed in Steady's hold (sway 0) and leaves at 0.000
  deg. Knuckle to jaw 0.014 m, hook 0.008 m, elbow -0.010 m.
- No row fails that passed before.
- Key numbers:
  - A45c: 2.114 m/s (bar 3).
  - A107: at most 0.062 m behind the band (bar 0.10).
  - A44b: 0.054 m.
  - A90: geometries 379 -> 378.
  - A9 (pending, the box was not quiet): 59.9 fps, 130 draw calls.

**The slice run at 6fa199d: 11 of 14 beats.** The run is driven by input from the real title. It reached wake, rake,
read, tell, cane, make, mise, cross, climb, sight and ditch, and stopped at topple. Pry and the return were not
reached.
- At the Peg line she lost 86 of 100 hp. She reached the topple at 14 hp and died at its first shot. The death card's
  reload stood her up at the cistern.
- On the second try the runner loosed 6 shots at the vial from 29-32 m. Each was solved with the vial first, on
  Steady. None hit. The Plumb's health did not change.
- In the systems lane's own run at de71979 the topple played (4 shots, 70 s) and the run reached 12. That did not
  reproduce here.
- Live rows:
  - Brazier refusal: **PASS**. With a wary or hostile Plumb at 25 m, the page shows only the refusal line.
  - save-reload: PASS.
  - save-continue on top of T1: PASS, 0 m off.
  - death rule: PASS.
  - save-continue at the end: **not reached**. The shared memory guard closed Chrome as the reload began.

**What landed:**
- **Engine:**
  - A16-draw-anchor's launch clause is measured on Steady (`launchSteady`, `notOnSteady`).
  - F16, F18 and F19 are re-anchored with the town.
  - `answers.mjs --reanchor` records a ruling's re-anchor from a clean film run.
- **Settlements:**
  - The salt cones are a 72-sided, 24-ring lathe dressed in the pans' crust.
  - House walls in shade take the sky's fill, and their indirect light falls off near the ground.
- **People:**
  - Ansel's robe fronts lose their violet ground: the crowd's violet ratio is 7.30x (bar 5x).
  - Ansel tallies between her idle beats. A quest card holds her in talk, and her loop goes on after it. Her longest
    stand is now 8.75 s (bar 90 s).
- **Systems:**
  - The topple's stand search.
  - The Brazier refusal page.
  - Carrizo canes with taper, curve, blade leaves and a plume. The reed rows still pass 10 of 10.

**Rulings needed:**
- F20: re-anchor it with the town now, or first move the cones off the frame edges and fix the light.
- F14 and F15: re-film their anchors at the head, on simulation time, in a quiet session.

**Decision (the orchestrator, PROCESS §2.7):** Tier 0 passes 10 of 10 and the kept stack is 78 of 80 with 0 failing (the best yet). The open items are F24's town block (the town is canon; its finish must reach F24 before re-anchoring), the slice run at 11 of 14 beats (the topple: aim and arrow flight disagree at the vial), Peg-line damage in the slice, and F14/F15 re-anchoring. None is a kept-row regression; main is fast-forwarded to r5/int with these carried as tracked debt. New build work pauses until the weekly budget resets.

## Weapon handling and cloth (Nov 16 2026)

The owner's direction of Nov 15 asked for much better weapon handling (grabbing, drawing, stowing, getting into position)
and much better cloth. Two lanes built it: weapons (steps 1 and 2 and one fix round) and cloth (steps 1 and 2 and
one fix round). The review measured `r5/int` at **fac4167** from a clean detached worktree on port 5270, using one
Chrome slot. No commit landed during the review.

**Verdict: NOT CLEAN.** Nothing regressed, but neither lane has met its own exit.
- Tier 0 passes 10 of 10. The kept stack is 78 of 80 with 0 failing, the same as at 6fa199d. No accepted frame
  changed outside weapon handling and cloth.
- Every weapons row W1-W11 still fails in at least one case. W10 fails in 784 of 848 interrupt runs.
- The new cloth is still behind `?cloth=2` and is off in the game. Its gate row C8 fails, and so do C2-C7, C10 and the
  crowd cost.

**Tier 0 at fac4167: PASS, 10 of 10.**
- `vite build` OK. Name lint 0 hits (733 files). Licences: 225 files against 31 rows.
- Asset budgets clean. Resident textures 61.42 MB of 175 MB. Shipped 51.76 MB.
- Import graph clean. 98 Node tests pass in 21 files.
- Boot: 3.9 s, 0 errors, 80.01 MB first load. Rendered-page name lint: 0.

**Frame Set at fac4167:** all 34 frames, 202 s of Chrome, 0 console errors.
- **No accepted frame changed outside weapon handling or cloth.** Every frame was compared with the closing run at
  6fa199d (the same world) and with its anchor. Two staging checks:
  - F02 was filmed once with her right forearm held out from her side.
  - A second F02 film at fac4167, and one at the pre-weapons commit, both show her arms hanging. The pose did not
    repeat, so it is not counted as a regression. F02 is staged on the wall clock.
- **Cloth frames (F08-F10, F14, F15):**
  - In the game (flag off) the cloth is unchanged, so these frames are the same as their anchors.
  - With `?cloth=2` (the cloth lane's own film at fac4167), none is closer to the turnaround. Against the masked
    turnaround crops:
    - F08 is further: the outer corner of the front-left panel folds out at the hip.
    - F09 and F10 are the same: the panels still hang as flat sheets.
    - F02 with the flag on: the back panel blows out sideways at waist height.
- **Weapon-handling frames (F10, F15, F16, F19):** the same as their anchors.
  - The carry on her back is unchanged, and M1.2f (lance steep, bow beneath) still fails as a 45 degree cross.
  - F19's guard leg now sits under the knee (the step 2 stance), with the lance level at contact.

**Kept-stack rows at fac4167** (two sessions, every row reached): 80 rows. **78 pass** (70 action, 8 visual), **0
fail**, **2 pending** (A9: the box was not quiet, 59.9 fps and 130 draws; A76: no staged kind declares a size class).
- No row fails that passed before.
- Key numbers:
  - A16: knuckle to jaw 0.014 m, hook 0.008 m.
  - A17: loose 0.090 m behind.
  - A107: at most 0.069 m behind the band (bar 0.10).
  - A44b: 0.054 m.
  - A45c: 0.
  - A90: geometries 379 -> 378.
- V13 was filmed again at the pre-weapons commit. The pose is identical there, so V13 is unchanged.
- **V49 needs a restatement.** Its text describes the old draw (the right hand up at the right shoulder). The new
  draw takes the lance butt-first with the left hand, as in BIBLE §5.2. None of V49's failure clauses occurs:
  - no elbow over or behind the head;
  - no teleport;
  - no second lance;
  - the stride carries on.

**Weapons rows** (Node handling bench at c944133; the weapons runtime is identical at fac4167, and four cases were
re-run there bit for bit). W0 is 0d3feb5.
- **Key 1:** it now takes the bow off her back (at W0 it raised nothing).
- **Swaps:** they are stow-then-draw, with 0 steps holding both weapons.
- **The lance draw:**
  - It is butt-first by the left hand, stood upright at her left side, then levelled into the guard. It no longer
    swings round over her shoulder.
  - Total turn 146 deg (bar 140). The blade dips 0.017 m under the knee.
- **Still failing:**
  - The bow hand's wrist deviation is 87 deg (bar 30), with the palm normal 93 deg off the grip (bar 10).
  - The lance hands sit 5.5-8 cm off their grips, with finger joints inside the haft.
  - Swap 1 to 2 turns the lance 171 deg.
  - The aim from stowed turns the bow 126 deg in one step.
  - W10: 784 of 848 interrupt runs fail.

**Cloth rows** (Node cloth bench at fac4167; today's cloth beside the new solver, `?cloth=2`):
- **At a run:** the front hem is ahead of the knee in 32 % of frames, against 95 % today (bar 2 %). At a sprint it is
  0 % (bar met).
- **Run-stop:** the overshoot is 0.02-0.17 m, against 0.16-0.59 m today.
- **Still failing:**
  - The edges stretch to 1.38 x rest (bar 1.03).
  - Turning, the panels lag 21-33 deg (band 8-25).
  - Landing, the panels rise 1-13 deg (bar at least 10).
  - Cost: hero cloth p95 0.24 ms standing and 0.37 ms at a sprint (bar 0.18). Asleep it is still 0.21 ms (bar 0.01).
  - With the crowd, the worst near person costs 0.059 ms (bar 0.02); all cloth together 0.248 ms (bar 0.30, passes).
- **C11 repeatability passes:** three stagings are bit-identical, and a nudge settles in 1 s.

**Clip review for the owner:** one page, before and after side by side for every weapons clip (11) and every cloth clip
(13), each with its measured rows and a line for accept, closer or wrong.
- Before is the game as at 6782b47, filmed today at 0d3feb5.
- After is fac4167. The weapons clips come from c944133, whose weapons runtime is the same. The cloth clips are filmed
  with the flag on.

**Chrome used:** about 43 minutes over seven sessions. That is over the 15-minute cap, because the review asked for
the Frame Set, two kept sessions and three clip sessions.

**Open, for the next round:**
- **Weapons:** the hands are not on the grips (W1); the lance path is over its turn bar (W4); interrupts (W10); the
  aim pop from stowed (W3/W8).
- **Cloth:** stretch, cost and the standing boards (C2, C3, C7, C10); C8 run; turn and landing (C5); clipping (C1, not
  re-measured here). The flag stays off until C8 passes.
- **Rows:** V49's written path to restate for the left-hand butt-first draw.


**Decision (the orchestrator):** no regression and the kept stack unchanged (78/80, 0 failing); the weapon handling at the head is better than at 6782b47 by every row (key 1 readies the bow; swaps are stow-then-draw with 0 steps holding both; the lance is drawn butt-first, 146 deg of turn against about 270 before), so main is fast-forwarded. The new cloth solver stays behind ?cloth=2 until C8 (stretch) and C10 (cost) pass. The open rows above are the next round.

