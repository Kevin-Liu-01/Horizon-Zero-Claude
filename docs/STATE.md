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
