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


## Wave 3: weapons round 2, cloth round 2, the glass shell, the slice (Nov 16 2026)

Four lanes worked in one tree on `r5/int`, each with a builder, a judge and one fix round:
- Weapons: hands on the grips (W1), the lance path (W4), interrupts (W10), V49 restated for the left-hand draw.
- Cloth: stretch, size, cost and the run on the grid solver, still behind `?cloth=2`.
- UI: M1.6g2 every menu dark glass, M1.6i the Character page.
- Systems: the slice run, M1.3e hit feel, M1.6l rung 2 (the Scout) as the quest's reward.

The review measured `r5/int` at **375c3ff** from clean detached worktrees on port 5270, using one Chrome slot. No
commit landed during the review.

**Verdict: NOT CLEAN.** Two things block it:
- **A kept row fails that passed at fac4167: A107-draw-arm-path.** In a bow draw from a sprint or a jog, the draw
  elbow, up at shoulder height, sits 0.10-0.22 m behind her head (bar 0.10). It failed in both runs at 375c3ff.
- **Tier 0 fails on the name lint:** one hit, a listed word in a string in `tools/ui/screens-probe.mjs` (since
  0123497).

Neither build lane met its exit, but both moved a long way. The slice run plays all 14 beats for the first time in a
review. No accepted frame changed outside cloth and weapon handling.

**Tier 0 at 375c3ff: FAIL, 9 of 10.**
- `vite build` OK (3.88 MB of code).
- **Name lint: 1 hit** (above).
- Licences: 225 files against 31 rows. Asset budgets clean. Import graph: 198 modules, 0 broken.
- Resident textures 61.42 MB of 175 MB. Shipped 51.78 MB (first-load cap 60 MB).
- 124 Node tests pass in 26 files.
- Boot: 3.8 s, 0 errors, 80.89 MB first load. Rendered-page name lint: 0.

**Frame Set at 375c3ff:** all 34 frames, 201 s of Chrome, 0 console errors. The simulation-time stagings froze at the
same frame counts as at fac4167.
- **No accepted frame changed outside cloth and weapon handling.** Every frame was compared with the fac4167 film (the
  same world) and with its anchor.
- **Cloth frames (F08-F10, F14, F15):** the same as their anchors. The game still ships the old cloth (flag off), so
  against the masked turnaround crops they are the same, not closer.
- **Weapon-handling frames:** F16 the same. F10's carry is unchanged (M1.2f still a 45 degree cross). **F19 is
  further on cloth:** at the heavy's contact the rear sash panel now streams out nearly level behind her. Her pose and
  the freeze frame are the same; the swing path changed in weapons round 2.
- **Closer:** F27 (the map in the glass hub, the island as a hillshade), F28 (Making in the glass hub), F29 (the
  Character page).
- F24 is still further than its anchor (the town block; unchanged since 6fa199d).
- The CONTINUE banner reads "CONTINUE · LEVEL 1" (`src/core/progression.js`, an old line). The game has no levels; the
  banner should name the save instead.

**Kept-stack rows at 375c3ff** (two sessions, every row reached): 80 rows. **77 pass** (69 action, 8 visual), **1
fails**, **2 pending** (A9: the box was not quiet, 59.9 fps and 130 draws; A76: no staged kind declares a size class).
- **Fails, passed before:** A107-draw-arm-path (above).
  - One row per Chrome run, clean worktrees: 0526400 pass (0.067 m), 1411107 pass twice, 4e74b78 fail twice, e5173d8
    fail, 375c3ff fail twice.
  - 4e74b78 is the cloth fix round's C8 commit. It changes only files under `src/entities/anim/cloth/` that do not run
    with the flag off, and no mechanism was found. The attribution is unproven; the failure is real.
- Key numbers: A16 knuckle to jaw 0.014 m, hook 0.008 m, launch 0 deg; A17 loose 0.075 m behind; A44b 0.054 m; A45c
  2.131 m/s (bar 3); A90 geometries 379 -> 378.
- **V49 (restated for the left-hand butt-first draw) passes on its new clauses.** Both elbows stay under the top of her
  head, no forearm crosses the back of the head, the lance leaves her back continuously, and the last tile has it in
  her right hand in the low guard, still jogging.
- A65 needed one runner retry (a screenshot timeout), then passed.

**Weapons rows** (Node handling bench at 375c3ff; case by case identical to the lane's 0908d3a).
- **Failing clauses: 189 in 26 cases.** Round 1 (c944133) had 368 in 24; on the same 24 cases, 163.
- **Now on the grips:**
  - The lance haft lies in both fists: palm 0.0005 m along the haft (was 0.055-0.063 m), fingertips 0.006 m, no joint
    inside.
  - The bow's palm faces its grip: 9.0 deg (bar 10; was 93).
- **The lance path:** the draw turns 131.8 deg (bar 140; was 146), the blade stays 0.126 m over the knee. Swap 1 to 2
  turns it 137.9 deg (was 171).
- **Still failing:**
  - The bow hand's wrist: 92 deg of deviation (bar 30). Its flexion reads 178.5 deg (bar 60; was 5.4), which the
    close clip does not show, so the measure may have flipped a sign.
  - The aim from stowed: the bow turns 126 deg in one step (bar 10).
  - At a jog: the swaps turn the lance 174 deg and the bow jumps 0.35-0.49 m at its grip or release.
  - A light swing from a sprint click has 1 step behind the head plane and 4 on it.
  - Times: bow unstow 0.433 s (band 0.30-0.40); swap 2 to 1 0.717 s (band 0.45-0.65).
  - **W10: 776 of 876 interrupt runs fail** (round 1: 784 of 848). Roll and strike fail in every run.

**Cloth rows** (Node cloth bench at 375c3ff, the grid solver, `?cloth=2`):
- **Pass:**
  - Stretch: 1.021 at a run and a sprint, 0 frames over 1.03 (was 1.38).
  - The run: no front hem ahead of the knee at a run or a sprint (was 32 % at a run); flutter 0.026-0.039 m.
  - Cost p95: 0.080 ms standing, 0.153 ms at a sprint (bar 0.18).
  - Repeatability: bit-identical digests; a nudge settles to 6.6e-6 m in 1 s.
- **Still failing:**
  - Asleep cost: 0.076 ms (bar 0.01); no piece ever sleeps standing (hem speed 0.006-0.019 m/s, bar 0.005).
  - Sprint mean cost: 0.134 ms (bar 0.12).
  - Run-stop: little or no swing past rest, and 1.1-2.5 s to settle (band 0.5-1.1).
  - Turn: 1.5 s to settle (bar 0.9). Landing: the back panel rises 1 deg in the fall (bar 10).
  - The tail sits at 26.7 deg at a sprint (band 30-65).
  - Clipping with the old wrap pass off: 55 frames (lane number).
- The flag stays off, and the old path stays in the tree.

**The slice run at 375c3ff: 14 of 14 beats, no death.** The run is driven by input from the real title.
- Wake, rake, read (Gauge 0.19 deg), tell, cane, make, mise.
- Cross: hp 100 -> 59 (it was 100 -> 14 at 6fa199d).
- Climb, and sight (T2 0.23 deg, T6 0.28 deg).
- Ditch: in cover 76 % and hidden 69 % of 5657 frames, peak suspicion 0.181, one drink.
- Topple in 4 shots. Pry with one Barbed arrow. Return. Reward: the Scout with Shrug.
- Live rows:
  - save-reload: PASS.
  - save-continue on top of T1: PASS, 0 m off.
  - save-continue at the end: **PASS**, 0.33 m off, and she stands up in the Scout.
  - Brazier refusal: PASS.
- The first session (with the frames, the rung-2 probe and the kit rows) never reached the title: the loading sheet
  stayed up for 150 s, twice. A `--run-only` session then ran clean.
- Kit rows: reed-peg and plumb-arrows fail. Steady, bearing, gauge-ballast, lance-pry, felling-blow, undercut and both
  hit-feel rows pass. Hit feel: the struck body moves 0.183 m and settles in 288 ms (arrow); 0.108 m, 102 ms (lance).

**Rung 2 (the Scout) at 375c3ff:**
- At 20 m its outline differs from the Starter's by 1 - IoU 0.069 / 0.061 / 0.046 (front, three-quarter, side).
- Shrug: the Flag lasts 3 s against 8 s.
- 0 head-wrap vertices show through the hat in play.
- The quest's reward puts it on, and CONTINUE keeps it.

**The glass shell:** every probed screen is #1E1A28 at 0.90: satchel, Field Log, Field Books, the four settings pages,
Extras, Field Manual, Credits, Settings from the title, and Character.
- The probe stopped at the dialogue step on its own bug, so the death card, the context-lost card and the unsupported
  page were not shot.
- The Field Log page's visible text does not carry "FIELD LOG".

**Clip review for the owner:** a second page sets round 1 (the first page's after clips) beside round 2 (375c3ff) for
12 weapons clips and 13 cloth clips. Stills of the glass screens and the Scout are on the same page. Each clip and
still has its measured rows and a line for accept, closer or wrong.

**Chrome used:** about 57 minutes over 13 launches. That is over the 15-minute cap: the review asked for the Frame Set,
two kept sessions, the slice, two clip sessions and the stills, and A107's bisect added seven short runs.

**Open, for the next round:**
- A107: a deterministic reproduction (sim time or Node) at 1411107 and 4e74b78, then the fix.
- Tier 0: the name lint hit in the screens probe.
- Weapons: the bow wrist (and its measure), the aim from stowed, the swaps at a jog, W10, the sprint click's
  behind-head step, the five lane page rows (A100, A101, A103, A106, A-stow-clearance) never re-run after ff3afb9.
- Cloth: sleep (C2, C10 asleep), run-stop and turn settle (C4, C5), the tail at a sprint, clipping with the old pass
  off (C1), the crowd cost. F19's rear panel at contact.
- UI: the screens probe's dialogue bug, the Field Log words, the CONTINUE banner's level, the ruling on A70's text.
- Systems: the kit's reed-peg and plumb-arrows rows; the slice session that never reached the title.

**Rulings after wave 3 (the orchestrator):**
- W1, the bow take: the stowed bow's diagonal makes an index-up take at waist height unreachable with a natural wrist. The take is a reverse grip at the small of the back, then a two-hand regrip in front of the hip on the way to the carry; W1's wrist bar is graded after the regrip, and the take is graded on palm contact and no joint inside the bow.
- W10, interrupts: the 0.06 m per step bar applies to a jump against the sequence's own planned motion (the rendered wrist against where the authored path puts it that step), not to the authored path's own speed; W7's draw band stands.
- A70-hub-tabs: the hub has eight tabs since the Character page (P); the row tests eight keys.
- main stays on 5170040 until A107 (a hand behind the head, the owner's bar) passes again.

## Wave 3 regressions run (Nov 16 2026)

A short regression run after the wave 3 review. Two lanes fixed named items in one tree on `r5/int`:
- Animation:
  - A107: the lance draw's right-hand re-solve undid the elbow bound.
  - W6: in the light swing from a sprint click, the left fist rode over her head.
  - F19's rear panel and W1 (the bow's reverse-grip take and regrip) were also named. They were not fixed.
- UI:
  - The Tier 0 name lint.
  - The screens probe's dialogue step and Field Log words.
  - The CONTINUE banner's level.
  - A70's eight tabs.

Commits: `45bb9ed`, `3f7356b`, `4c28601` (UI), `b286cdc`, `f2ad55f` (animation).

The review measured `r5/int` at **f2ad55f** from clean detached worktrees on port 5270, using one Chrome slot. No
commit landed during the review.

**Verdict: NOT CLEAN, on one item.** **F19** is still further than its anchor. At the heavy's contact the rear sash
panel streams out nearly level behind her. The frame at f2ad55f is pixel-identical to the frame at 375c3ff: the run
named it, and it is not fixed.

Everything else the run had to hold, holds:
- The kept stack has 0 failing rows.
- Tier 0 passes 10 of 10.
- No accepted frame changed.

**A107 passes again (3 of 3 page runs).** It was the condition for moving `main` off 5170040.

**Tier 0 at f2ad55f: PASS, 10 of 10.**
- `vite build` OK (3.88 MB of code).
- Name lint: 0 hits in 749 files.
- Licences: 225 files against 31 rows. Asset budgets clean. Import graph: 198 modules, 0 broken.
- Resident textures 61.42 MB of 175 MB. Shipped 51.78 MB (first-load cap 60 MB).
- 124 Node tests pass in 26 files.
- Boot: 3.7 s, 0 errors, 80.93 MB first load. Rendered-page name lint: 0.

**Frame Set at f2ad55f:** all 34 frames, 200 s of Chrome, 0 console errors. The simulation-time stagings froze at the
same frame counts as at 375c3ff (F15 194, F16 217, F17 217, F18 314, F19 187, F24 217, F25 217).
- **No accepted frame changed.** Each frame was compared with the 375c3ff film (the same world) and with its anchor.
  - The simulation-time frames are within the noise floor of 375c3ff: F15 0.09 %, F16 0.00 %, F17 0.11 %, F18 0.02 %,
    F19 0.00 % of pixels.
  - The wall-clock frames differ only by the grass, the reeds, the clouds and the idle. Their differences are the same
    size as between the fac4167 and 375c3ff films.
- **Further than the anchor:**
  - F19: the rear panel, as above. It has not changed since 375c3ff.
  - F24: the town block. It has not changed since 6fa199d.
- **The same as the anchor:** F02, F03, F05, F08, F09, F10, F11, F13, F14, F15, F16, F18, F20 (judged with the town),
  F23 (Plumb).
- **Cloth frames (F08-F10, F14, F15):** the same as their anchors. The game still ships the old cloth (flag off).
- **Weapon-handling frames:** F16 is the same as its anchor, and F10's carry is unchanged.
- **Closer than the anchor, as at 375c3ff:** F27, F28, F29 (the glass hub).

**Kept-stack rows at f2ad55f** (two sessions, every row reached): 80 rows. **79 pass** (71 action, 8 visual), **0
fail**, **1 pending** (A76: no staged kind declares a size class).
- **Changed since 375c3ff:**
  - A107-draw-arm-path FAIL -> PASS.
  - A9-perf-budget PENDING -> PASS: 59.9 fps median on a quiet box, 130 draw calls, scene GPU 19.74 ms.
- **A107 ran three times, once per Chrome run, all PASS.** "Behind" is the worst elbow behind the head plane in the
  band:

  | run | jog behind | sprint behind | elbow over the head (worst) | forearm off the back of the head (least) |
  |---|---|---|---|---|
  | 1 | 0.068 m | 0.046 m | -0.068 m | 0.199 m |
  | 2 | 0.066 m | 0.068 m | -0.015 m | 0.187 m |
  | 3 | 0.069 m | 0.060 m | -0.027 m | 0.214 m |

  The bar is 0.10 m. The bars for the other two columns are elbow at most head + 0.05 m and forearm at least 0.05 m.
- **A107's Node benches at f2ad55f** (re-run by the review):
  - The bench: 18 of 18 cycles pass.
  - `--page`: 14 of 14 stagings pass (worst 0.07 m).
- **Key numbers:**
  - A16: knuckle to jaw 0.014 m, hook 0.008 m, launch 0 deg.
  - A17: loose 0.076 m behind.
  - A44b: 0.054 m.
  - A90: geometries 379 -> 378.
  - A70: eight keys, P opens the Character page.
- **The visual rows:** V1, V2, V3, V4, V13, V21, V49 and V-traversal look the same as their 375c3ff shots.
  - V49 at the head: both elbows stay under the top of her head in all 12 tiles, and no forearm crosses the back of
    her head.
  - The last tiles show the low guard.

**Weapons rows** (the Node handling bench at f2ad55f, re-run by the review):
- **187 failing clauses in 26 cases** (375c3ff: 189 in 26).
- Two clauses no longer fail:
  - clickSprint: "1 behind-head and 4 head-plane steps".
  - clickJog: "0 behind-head and 1 head-plane steps".
- Every other clause of every case is the same, line for line.
- The rest of the wave 3 open list stands:
  - the bow wrist and its measure;
  - the aim from stowed;
  - the swaps at a jog;
  - W10;
  - the bow unstow and swap 2 to 1 times.
- W1's reverse-grip take and regrip, per the wave 3 ruling, was not started.

**Not measured in this review:**
- The cloth bench.
- The slice run.
- The clip pages.
- The screens probe: the UI lane ran it at 4c28601. Nothing it measures changed between 4c28601 and f2ad55f.
- The lane page rows outside the kept stack: A100-A106 and A-stow-clearance.
- The CONTINUE banner on screen. It is in the code at 3f7356b, but no run has pressed Continue.

**Chrome used:** about 30 minutes over 5 launches.
- Tier 0 boot: 10 s.
- The Frame Set: 200 s.
- Kept session 1: 9.7 min. Kept session 2: 15.3 min.
- Two single-row A107 runs: 35 s and 33 s.

That is over the 15-minute cap: the two kept sessions alone take about 25 minutes.

**Open, for the next round:**
- F19: the rear panel at the heavy's contact. Make it the same as its anchor and keep the round-2 lance path.
- W1: the reverse-grip take and the two-hand regrip.
- The remaining weapons clauses (above).
- The lane page rows A100-A106 and A-stow-clearance, never re-run since ff3afb9.
  - The animation lane's session with every row on a fresh page hung.
  - Run them on shared pages, in one session.
- UI: the dialogue shot does not show the dialogue. See the CONTINUE banner live.
- F24's town block (standing).

**Decision (the orchestrator):** Tier 0 passes 10 of 10 and the kept stack is 79 of 80 with 0 failing (A9 passes on a quiet box for the first time; A107 passes three runs of three). The one open frame, F19's sash panel at the heavy's contact, is a cloth-and-handling frame, which the owner's direction allows to change while that work goes on; it is carried as debt with its cause (the lead foot's step timing at the contact). main is fast-forwarded to r5/int.

## Wave 4: cloth on, weapons round 3, calima and night, slice audio, robustness (Nov 16 2026)

Five lanes worked in one tree on `r5/int`, each with a builder, a judge and one fix round:
- Cloth: the grid cloth turned on by default (4d11034); `?cloth=` no longer switches it (bbf9755) and `clothWrap.js`
  is deleted. Sleep, the free swing at a stop, a collision pass on the drawn sheet, the teleport fling, the tail's air.
- Weapons round 3: the bow's reverse-grip take at the small of the back and the two-hand regrip before the hip (the
  wave 3 ruling); the aim from stowed waits for the bow; the guard on the move; the click's urgent draw on its socket.
- World and sky (M1.1i): the calima's own air and a night grade set; F07's breakwater lamp and the town's windows; the
  F24 town finish (roof huts, quoins, wash); the Organ's near gain.
- Audio (M1.6k): the slice bank (77 counted cues, six buses, the cue director, the theme), live rows, the walk through
  the game's own audio graph.
- Robustness (M1.6m): context loss and restore, the pad, hold-or-toggle and the sliders, the colour-vision check, the
  `medium` and `low` tiers.

The review measured `r5/int` at **9f8bc85** from clean detached worktrees on port 5270, using one Chrome slot.
Commits from the next wave began landing on `r5/int` during the review (from 21:09 UTC); none of them is measured here.

**Verdict: NOT CLEAN.**
- **Accepted frames changed outside cloth and weapon handling.** The Organ's near gain (3058d33) turned the basalt
  columns pale in F14 and rust-coloured in F23-plumb (further on material in both). F05 changed the same way; its
  Organ was the world lane's own row, and the light is judged slightly closer, but it needs a word or a re-anchor. The
  town finish (9a52361) changed the town behind F15, F16, F18, F19, F20 and F24 (judged on the figures under the town
  ruling).
- **The slice is not steady: 1 of 2 runs reached the reward.** Run 1 died at the start of the return after a
  19-arrow topple (4 at 375c3ff) and the driver then stuck 5.7 m short of the quest giver: 13 of 14. Run 2 played
  14 of 14.
- A9-perf-budget could not be graded (the shared box was not quiet in either of two runs).

What holds: Tier 0 10 of 10; no kept row fails; A107 and V49 pass; the audio passes on the live game; tiers, the pad
and the colour-vision check pass.

**Tier 0 at 9f8bc85: PASS, 10 of 10.**
- `vite build` OK (3.92 MB of code). Name lint: 0 hits in 775 files.
- Licences: 231 files against 31 rows. Asset budgets clean. Import graph: 200 modules, 0 broken.
- Resident textures 61.42 MB of 175 MB. Shipped 53.14 MB (first-load cap 60 MB).
- 142 Node tests pass in 29 files. Boot: 3.8 s, 0 errors, 82.95 MB first load. Rendered-page name lint: 0.

**Frame Set at 9f8bc85:** all 34 frames, 201 s of Chrome, 0 console errors. The simulation-time stagings froze at the
same frame counts as before (F15 194, F16 217, F17 217, F18 314, F19 187, F24 217, F25 217).
- Further outside the cloth: F14 and F23-plumb (the Organ). Changed: F05 (the Organ and the town).
- Cloth frames (F08-F10, F13, F14): the cloth now hangs plumb and straighter; against the masked turnaround crops the
  same, not closer (still flat sheets without folds or a ragged hem).
- F19: closer than round 2 (the rear panel no longer streams out level at the contact); about the same as its anchor.
- F06: closer (the island inside the dust). F07: closer to its written target (mean luminance 5.0 %, about 25 lit
  window blobs, the lamp a pool on its deck).

**Kept-stack rows at 9f8bc85** (two sessions, every row reached): 80 rows. **78 pass** (70 action, 8 visual), **0
fail**, **2 pending** (A9: load 3.9 and 3.55 on a shared box; A76: no staged kind declares a size class).
- A16: knuckle to jaw 0.014 m, hook 0.008 m, launch 0 deg. A17: loose 0.083 m behind.
- A107: 0.063 m behind the head at a sprint, -0.015 m at a jog (bar 0.10). A90: geometries 383 -> 382.
- V49: both elbows under the top of her head in all 12 tiles, no forearm behind the head, the low guard last.

**Weapons** (Node handling bench at 9f8bc85): 139 failing clauses in 25 of 26 cases; behind-head steps 0.
- Done: the reverse-grip take and the two-hand regrip; the aim from stowed no longer jumps.
- Slower than round 2: bow unstow 0.483 s (band 0.30-0.40); swap 1 to 2 0.817 s (round 2: 0.650, in band); RMB from
  stowed to loosable 1.40 s against 0.867 s (bar: no later than the baseline).
- W10: 681 of 988 interrupt runs fail. W11: head yaw up to 13.7 deg (bar 3).
- Lane page rows at 9f8bc85: A100 (the dodge's holster), A103 (the blade short of the hull) and A-draw-elbow-level
  fail; A101, A102, A104, A105, A106, A-stow-clearance and A-heavy-two-hand pass.

**Cloth** (Node cloth bench at 9f8bc85, the game's cloth):
- Pass: standing rest and sleep (asleep at 1.02 s, free columns within 3.1 deg, tail 11.0 deg); the tail at a sprint
  (59.3 deg, band 30-65); the back panel at a sprint (38.7 deg); fronts never ahead of the knee; repeatability; the
  all-asleep cost (0.008 ms).
- Fail: crouch and sit rest (13-25 deg from plumb); the run-stop (1.9 s to settle, little overshoot); the turn (1.5 s);
  the landing; wind headings; stretch over every clip (worst 1.080); cost (0.19 ms mean, bar 0.12, now timing the
  whole cloth frame); clipping (5 frames in Node; the page rows crouch 1, roll 2, climb 1).

**World and sky (M1.1i):** F06 visibility 165 m rendered (band 120-180), the fog model 151 m; the sun a 2 deg disc with
no bloom past 2 deg; sight ranges x0.5 in the calima. F07 mean luminance 5.0 % (band 4-9).

**Audio (M1.6k):** every line passes. 77 counted cues; 77 of 77 audible at range (offline model); the walk through the
game's own audio graph -17.3 LUFS and -2.3 dBTP; chirps 20 of 20 on three kinds; the gust heard 1.00 s before cover
opens (median of 6); bank 3.53 MB. No one has listened yet.

**Robustness (M1.6m):**
- Pass: the restore (playing 0.89 s after it, 1.08 dE2000 from the frame before the loss); tiers (F02 GPU+submit
  high 12.9 ms, medium 12.6, low 10.2; both boot clean); the pad and its right stick; the colour-vision check.
- Fail: the reload after a context that never comes back draws a black world under the HUD in this run (it drew at
  e885a00); the FOV slider row (asked 80, read 77.6).
- Not re-run: the slice on a pad.

**The slice at 9f8bc85:** run 1 13 of 14 (death at the return, then stuck); run 2 14 of 14 (cross hp 100 -> 68, topple
in 5 arrows, return 20.4 s, the Scout given; save-continue at the end 0.324 m off).

**Chrome used:** about 74 minutes over 14 launches (cap 15): the Frame Set, two kept sessions, the lane rows, two
slice runs, the weapons and cloth clips, the reach rows, the screens probe, the audio rows, the weather probe and an
A9 retry.

**Open, for the next round:**
- The Organ's near gain: keep it out of F14 and F23-plumb (or re-anchor them by decision); F05 and the town re-tone
  need a decision on their anchors.
- The slice's steadiness: the long topple (the slower raise from stowed is a suspect) and the return driver stuck
  after a death.
- Weapons: W7 times (the aim from stowed, the swaps, the bow unstow), W10, W11, A100, A103, A-draw-elbow-level.
- Cloth: crouch and sit rest, run-stop and turn settle, the landing, wind, stretch in the roll, climb and blends, cost,
  clipping in the page rows; A-tail-legible and A-wrap-clear at the head.
- Robustness: the black world after the never-restored reload; the FOV slider.

**After the review (the orchestrator):** the Organ's near gain (3058d33) turned the columns pale in F14 and rust in F23-plumb, accepted frames outside the weather's scope; it is off at 25b1603 (ORGAN_LIGHT.w 0), and F05 keeps the earlier albedo gain. main is moved to the reviewed commit 9f8bc85 plus that change (b422167 on main); the kept stack at 9f8bc85 is 78/80 with 0 failing. Open: the slice reached the reward in 1 of 2 runs (the topple took 19 arrows in one), the weapons times regressed (aim from stowed 1.40 s), cloth cost and settle rows, A-sweep-wind needs restating for the new cloth, the FOV slider row.

## Wave 5 and the M1b exit run (Nov 16-17 2026)

Wave 5 had two build lanes in one tree on `r5/int`, each with a builder, a judge and fix rounds:
- People and verbs: M1.5d (a 0.5 m walk grid for people built from the island bake, routines that walk it, the
  lookout's warning once per Instrument, short routines for the quest givers) and M1.3h (the salt rake, the cane cut
  and the kindle on Brea, with a Node bench and a row each).
- Systems: M1.6n the site clock (`src/game/sites/clock.js`, `refill.js`), the kit's shots that lead the target's own
  motion, the vial-range row, and the slice run three times.
A planning lane wrote the Milestone 2 briefs (outside the repo).

Then the exit run (M1.8b) measured `r5/int` at **701b366** from one clean detached worktree on port 5270, one Chrome
at a time. Its two commits change no game code: `cddc56f` adds a presented-frame recorder to the slice run
(`tools/gates/systems/slice-hour.mjs`) and `701b366` rewords a comment in `src/entities/anim/sliceVerbs.js` that held a
listed word (Tier 0 failed on it at cddc56f).

**Verdict: M1b does not exit yet.**

| # | exit condition | result at 701b366 |
|---|---|---|
| 1 | the slice run plays every beat in order, input-driven, no listed word | passes as written, **not steady**: 14/14, 14/14, 8/14 in three runs |
| 2 | the M1b frames accepted; the M1a frames not regressed | awaiting the owner; **F25 and F31 fail their written targets**; no M1a frame regressed |
| 3 | the frame bar, crash family, texture, load and audio budgets | **fails**: GPU over 14 ms in F23 (Gauge) and F25; hitches over 50 ms in the slice |
| 4 | the owner plays it on 5173 | awaiting the owner |

**Tier 0 at 701b366: PASS, 10 of 10.**
- `vite build` OK (3.96 MB of code). Name lint 0 hits in 782 files.
- Licences 231 files against 31 rows. Asset budgets clean. Import graph 204 modules, 0 broken.
- Resident textures 61.42 MB of 175 MB. Shipped 53.17 MB (`public/` 49.22 MB + code 3.96 MB; cap 110 MB).
- 156 Node tests pass in 30 files. Boot 3.7 s, 0 errors. Rendered-page name lint 0.

**The frame bar (TECH §9.1)** at 1600 x 900 CSS px, DPR 1.25, quality `high`, headless Chrome 151 on ANGLE Metal.
Tool: `tools/perf/exit-bar.mjs`. The 1-minute load average was 2.0-2.9.

| line | F02 | F23 Plumb | F23 Peg | F23 Gauge | F25 | bar | result |
|---|---|---|---|---|---|---|---|
| median GPU, back-to-back readback (7 x 60 frames) | 13.0 | 13.1 | 12.8 | **14.2** | **15.0** | <= 14 ms | FAIL in two |
| frames presented in 30 s; over 33 ms | 1801; 0 | 1801; 0 | 1800; 0 | 1800; 0 | 1799; 0 | >= 1782; 0 | PASS |
| p95 presented interval (headless) | 16.9 | 17.0 | 17.0 | 17.0 | 17.0 | <= 16.7 ms headed | not measurable headless (an empty page reads 17.6) |
| main-thread JS per frame, p95 | 3.7 | 3.6 | 3.7 | 3.7 | 4.1 | <= 8.0 ms | PASS |
| draws; triangles | 101; 1.62 M | 99; 1.30 M | 102; 1.31 M | 147; 1.48 M | 132; 1.36 M | <= 350; <= 6.5 M | PASS |

- Load (the built game): title interactive 4.22 s cold, 4.12 and 3.99 s warm (bar 5 s; 2.6-3.0 s at the M1a exit).
  New Game to control 0.42 s cold, 0.24 and 0.23 s warm. First load 50.15 MB in 227 requests (bar 60 MB).
- **Hitches in the slice run** (the new recorder: every presented interval while the game is playing, the runner's own
  screenshots counted apart): 364 s of play over three runs; frames over 50 ms 2, 2 and 4 (bar 0); over 33 ms 4, 5
  and 13; worst 100 ms. Every run has a 92-100 ms frame about 2 s after the loading sheet closes; runs 1 and 2 have
  an 85-92 ms frame as the quest's reward is given; run 3 has nine 42-66 ms frames in the Peg fight. The window
  reached 6.1 minutes of play, not the bar's 10.

**Frame Set at 701b366:** all 34 frames, 200 s of Chrome, 0 console errors. The simulation-time stagings froze at the
same frame counts as before (F15 194, F16 217, F17 217, F18 314, F19 187, F24 217, F25 217).
- **No accepted frame changed for the worse.** The wave 4 regression is gone: with the Organ's near gain off
  (25b1603) the basalt columns in F14 and F23 (Plumb) are dark again, as their anchors; F05 is back to its anchor.
- The salt cone that 951aa5c moved off the home Brazier has left the backgrounds of F01, F15, F16, F18, F19 and F29,
  and the right edge of F30 (closer on finish).
- Every other frame matches the 9f8bc85 film within the cloth, the idle and the wind.

**Kept-stack rows at 701b366** (two sessions, every row reached): 80 rows, **79 pass** (71 action, 8 visual judged against their 9f8bc85 shots: the same poses), **0 fail**, **1 pending** (A76: no staged kind declares a size class).
- A9-perf-budget passes on a quiet box (load 2.25): 59.9 fps median, 130 draw calls, scene GPU 21.44 ms.
- A16 every cell within its bars; A17 loose 0.090 m behind, hand to quiver 0.132 m; A107 at a sprint -0.006 m behind the band, at a jog -0.049 m (bar 0.10); A90 geometries 383 -> 382, heap -5 %; A65 every check (after one runner retry: a screenshot timeout); A45c 2.649 m/s (bar 3); A44b 0.054 m. V49: both elbows under the top of her head in all 12 tiles, no forearm behind the head, the low guard last.

**The slice at 701b366, three runs (`--run-only`):**

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| beats | 14 of 14 | 14 of 14 | 8 of 14: died 14 s into the climb |
| cross | 49.6 s, hp 100 -> 68 | 69.7 s, hp -> 58 (one drink) | 60.3 s, hp -> 8 (two drinks) |
| ditch | hidden 69 % of 5674 frames | hidden 63 % of 7343 frames | - |
| topple | 33.9 s, 12 arrows | 29.7 s, 6 arrows | - |
| reward | the Scout with Shrug | the Scout with Shrug | - |
| save rows | reload, T1, continue: PASS | PASS | reload, continue: PASS |

- In run 3 the driver did not play the death on the climb's approach: it stopped there. In run 1 the first six vial
  shots left from 19.6-19.8 m and all missed; the hits came from 13.4 m in.
- The site-clock row passes in runs 1 and 2 (the dyke Plumb does not return; the control Plumb does after 13 h).

**Wave 5 rows at 701b366:**
- M1.3h, Node bench: rake, Alidade, sit, kindle and cane cut each 0 behind-head and 0 head-plane steps; both palms within
  0.0139 m of the rake's haft; the Alidade wrist 0.102 m in front of the face; the seated gear 0.142 m over the ground
  and 1.55 m from the cistern lip. Stills re-filmed at 701b366.
- M1.5d, routine log (two in-game hours): each person changes activity 4 to 28 times; the longest stand outside work
  32.75 s; 0 path legs through collision in 86; 0 bind-pose samples; the lookout warns within 0.27 s at 80 m in 10 of
  10 trials.
- M1.6n: the site-clock Node tests pass; the live row as above.

**Not measured in this run:** the weapons and cloth benches and clips (no weapons or cloth source changed since
9f8bc85), the audio rows and the reach rows (no audio, UI or input source changed since 9f8bc85), F22's and F07's
written counts, M1.6b's line rows, the kit rows (the game at ae86348, where the systems lane ran them, equals 701b366).

**Chrome used:** about 50 minutes over 10 launches (cap 15): Tier 0's boots 0.3 min, the exit bar 6.3, the Frame Set
3.3, the verbs and F22 probe 0.7, three slice runs 13.9, two kept sessions 9.7 and 15.3.

**Open, for the owner's play and the fix list (M1.8c):**
- The opening shot: a townsperson stands in the camera at New Game at the cistern (since before wave 5).
- The hitches after the loading sheet, at the reward and in the Peg fight.
- GPU in F23 (Gauge) and F25.
- The slice's steadiness at the Peg cross; the driver's death on the climb.
- M1.3e's settle (arrow and lance); M1.6m's never-restored reload and FOV slider.
- F25's topple state; F31's violet through the stems.
- Carried: weapons times and interrupts, cloth settle, rest and cost.

---

**Decision (the orchestrator):** no accepted frame regressed and the kept stack is 79/80 with 0 failing; r5/int is merged into main. Milestone 1b does not exit until the owner plays the slice and answers the open pages; the failing items (hit-feel settle, the post-loading hitch, the lost-context reload, the FOV slider, F25 and F31 targets, slice reliability 2 of 3) lead the next wave.

## Wave 6: the M1b exit fixes and their check (Nov 17 2026)

Wave 6 had two fix lanes in one tree on `r5/int`, each working on the failing items of the M1b exit run:
- Systems: slice reliability (the driver plays a death anywhere; vial arrows only on a still glass from 12-15 m;
  careful play at the Peg line; a body shot to turn an unaware Plumb; the climb's approach falls back to the nav grid),
  M1.3e's settle (hit feel owns the gait's flinch envelope on the real clock), F25's staged topple (held at the end of
  its fall) and F31's carrizo foot (a dense layer of pale stems under the canes, its own violet probe).
- Engine and UI: the FOV slider holds (combat's hip ease targets the player's own FOV); the Scout's programs are
  linked and each armour set drawn once behind the boot sheet; `engine.warmUp` compiles the variant the scene pass
  draws; the ground's chunks draw after the other solids (renderOrder 0.1); the slice recorder counts frames under the
  Loading sheet apart and names the scripts behind each frame over 33 ms; `tools/perf/hitch-probe.mjs`.

Then the check lane measured `r5/int` at **7474b9f** from clean detached worktrees on port 5270, one Chrome at a
time. It changed no repo file.

**Verdict: CLEAN.** Every kept row run passes, no accepted frame is further, the slice played 14/14 twice.

**Tier 0 at 7474b9f: PASS, 10 of 10.**
- `vite build` OK (3.96 MB of code). Name lint 0 hits in 784 files.
- Licences 231 files against 31 rows. Asset budgets clean. Import graph 204 modules, 0 broken.
- Resident textures 61.42 MB of 175 MB. Shipped 53.18 MB (`public/` 49.22 MB + code 3.96 MB; cap 110 MB).
- 157 Node tests pass in 30 files. Boot 3.8 s, 0 errors. Rendered-page name lint 0.

**Kept-stack rows at 7474b9f** (one session, 28 rows, plus A9 again on a quiet box): **28 pass, 0 fail.**
- Rows: A1, A5, A6, A9, A16, A20, A20b, A22, A22b, A25c, A45, A45b, A45c, A46, A50, A56, A59b, A59c, A60, A65, A70c,
  A72, A72b, A78-loop-reclaim, A90-memory-stability, A90-rig-reclaim, A90b, A107 (the rows that exercise the boot,
  the warm-up, the FOV, settings, the machines' gait, the ground draw order, the reed cover and memory).
- A9: PENDING in the session (1-minute load 3.99), then PASS alone on a quiet box (load 1.95): 59.9 fps median,
  130 draw calls, scene GPU 18.07 ms (21.44 at 701b366).
- A16: knuckle to the jaw anchor 0.014 m and hook to nock 0.008 m in all 20 cells.
- A107: behind the head band at a jog 0.057 m, at a sprint 0.016 m (bar 0.10; at 701b366 -0.049 and -0.006).
- A90: geometries 399 -> 398, heap -4.8 %. A65 passed after one runner retry. A22b every FOV composited.
- The runner reports three gate files that fail to load in a detached worktree (`gates.r5.brand`, `gates.r5.gates-perf`,
  `gates.r5.shell-ui`: they read planning docs that are no longer in the tree). This was the same at 701b366; none of
  the rows above comes from them.

**The frame bar (TECH §9.1)** at 1600 x 900 CSS px, DPR 1.25, quality `high`, headless Chrome on ANGLE Metal.
Tool: `tools/perf/exit-bar.mjs`, phases load, live and GPU. The 1-minute load average was 1.7-2.9.

| line | F02 | F23 Gauge | F25 | bar | result |
|---|---|---|---|---|---|
| median GPU, back-to-back readback (7 x 60 frames) | 10.3 (13.0) | 13.2 (14.2) | 13.4 (15.0) | <= 14 ms | **PASS in all three** |
| frames over 33 / 50 ms in 30 s live | 0 / 0 | 0 / 0 | 0 / 0 | 0 | PASS |
| p95 presented interval (headless) | 17.0 | 17.1 | 17.2 | <= 16.7 ms headed | not measurable headless (an empty page reads 17.9) |
| main-thread JS per frame, p95 | 3.7 | 3.7 | 4.0 | <= 8.0 ms | PASS |
| draws; triangles | 101; 1.62 M | 148; 1.59 M | 132; 1.36 M | <= 350; <= 6.5 M | PASS |

(In brackets: 701b366.)
- Load (the built game): title interactive 4.15 s cold, 4.02 and 3.92 s warm (bar 5 s). New Game to control 0.355 s
  cold, 0.198 and 0.181 s warm. First load 50.23 MB in 228 requests (bar 60 MB).
- The 30 s after New Game: 3601 frames presented, worst 10.4 ms, 0 over 33 or 50 ms.

**The slice at 7474b9f, two runs (`--run-only`):**

| | run 1 | run 2 |
|---|---|---|
| beats | 14 of 14 | 14 of 14 |
| Peg cross | 48.7 s, hp 100 -> 63 (one kite) | 44.2 s, hp 100 -> 85 (one kite) |
| ditch | hidden 63 % of 4483 frames | hidden 56 % of 3879 frames |
| topple | 77.6 s, 5 vial arrows loosed (6 shots held: the line was blocked) | 18.5 s, 3 vial arrows |
| lowest hp | 49 (in the topple; she drank) | 78 |
| reward | the Scout with Shrug | the Scout with Shrug |
| save rows, site clock | reload, T1, continue, site clock: PASS | PASS |
| frames over 33 / 50 ms in play | 0 / 0 (worst 32.4 ms) | 0 / 0 (worst 25.1 ms) |

- No death in either run. Under the Loading sheets, 10 frames each, counted apart (worst 158-167 ms at New Game).

**Frames at 7474b9f** (F02, F05, F14, F23 Plumb, F25, F31; 0 console errors):
- F02, F05, F14: the same as their anchors and as 701b366, within the cloth, the wind and the clouds. The camera FOV is
  unchanged in every frame (the FOV fix does not touch the stagings).
- F23 (Plumb): the first film caught the idle's quiver-strap break (her right arm out at the shoulder, the
  wall-clock staging); three repeats at 7474b9f and three at 965f449 all match the anchor (arms down). Same.
- F25: the Plumb is now down at the end of its fall, legs splayed and its lamp hostile, foreshortened away from the
  lens; four Pegs in frame; Brea at full draw in the foreground. Closer to its written target than 701b366 (upright);
  the vermilion line on the dyke is still absent (the dyke does not exist yet).
- F31: her violet shows through 0.318 of the stems (bar 0.333): PASS. The written target's water in the lower third is
  now hidden behind the stems, and the stems near the lens read as flat pale cards (one wide blade crosses her back).
  Closer on the violet clause, further on the water and on the look of the stems; not accepted.

**Chrome used:** about 33 minutes over 9 launches (cap 15): Tier 0's boot 0.2, the kept rows 15.3, the exit bar 4.6,
two slice runs 10.4, the frames 0.7, the F23 repeats 1.4, A9 alone 0.5.

---

**Decision (the orchestrator):** the check is CLEAN at 7474b9f; main is fast-forwarded to r5/int. Milestone 1b now waits only on the owner (playing the slice on 5173 and answering the pages) and the look items in the backlog (F31's near stems and hidden water, F25's dyke line).

## Milestone 2 wave 0: the debt before content (Nov 19 2026)

Wave 0 had four lanes in one tree on `r5/int`, each on a debt item of the Milestone 2 briefs. No commit was pushed.

- **Engine (D1, D10).** `tools/perf/attrib.mjs --probe d1` splits the back-to-back frame along what M0.8 left
  unattributed: draws and triangles per scene child and per cascade, GPU ms of the costliest children, each cascade,
  the post chain and the 1/64-pixel frame (paired on/off toggles), and the Holds' fight load as stand-in geometry at
  its caps (`--standins`). The tool takes the Chrome slot itself and waits for a calm machine. `tools/perf/holds-budget.mjs`
  turns a d1 run into each frame's split and the fight-frame budget. **The ground's shader is the largest single
  cost**: the terrain alone is about 6 ms of the 12.75-13.45 ms fight frames.

  | frame (commit) | GPU, back-to-back | per-pixel | main-view geometry | shadow maps | floor | post | terrain alone |
  |---|---|---|---|---|---|---|---|
  | F25 (001e349) | 12.75 ms | 7.8 | 3.5 | 0.4 | 1.4 | 1.35 | 6.05 ms (24 draws, 95 k tris) |
  | F23 Gauge (72296aa) | 13.45 ms | 8.3 | 3.7 | 0.0 | 1.3 | 2.15 | 6.25 ms |
  | F02 (001e349) | 10.2 ms | 5.4 | 3.4 | 0.4 | 1.3 | 1.9 | 1.85 ms |
  | F32 (001e349) | 9.25 ms | 5.3 | 1.5 | 0.5 | 1.2 | 1.55 | 3.85 ms |

  "Back-to-back" includes 1.4-2.1 ms of CPU submit. At the caps the Holds' fight load measured 1.35 ms (class by
  class, about ±1 ms on a loaded machine) against 1.6 ms left under 14 ms; the written budget trims it to 1.1 ms to
  keep 0.5 ms of headroom. Draws, not GPU time, are the tighter limit. F14 (the idle) is now staged on simulation
  time (`page.mjs` `SIM_IDLE`), and F14 and F15 were re-anchored at a0b2aa7 on simulation time.
- **Weapons (D2).** The quick draw: RMB with the bow on her back sends the string hand to the quiver at the request
  while the bow hand takes the bow; aim from stowed is 0.867 s again. The lance's haft fist keeps its full wrap and
  the guard's elbow bar holds through the first steps of a stow on the move. W6 and W9 pass for both weapons in every
  bench case. **W1 (9 clauses) and W2 (6 clauses) still fail**; the handling bench is at 114 failing clauses in 25 of
  26 cases (139 at 1d2de89).
- **Cloth (D3).** The old sash-panel and wrap-tail chain path is deleted (the grid cloth owns those chains). The quiver
  collider uses this frame's quiver pose, and the Node sweep's clip frames go from 5 to 0. The drawing pass costs
  0.064 ms (was 0.108). The wind row (A-sweep-wind) is restated for the grid cloth (`docs/GATES.md` §3 D; every band
  unchanged). **D3 is not closed**: C10, C4, C5 and the landing still fail; in the page A-sweep-climb has 1 clipping
  frame and the restated wind row fails one clause.
- **Instruments (D5, D6).** Every kind declares a size class (Peg and Plumb small, Tiller and Gauge medium), with the
  per-class caps and the encounter rule in `src/instruments/lib/sizeclass.js`; doctrine spawns and site respawns ask
  `encounterAllows` first. When the reticle's ray strikes no hull, the aim takes the depth of the machine the arrow
  would pass (`core/hitHulls.js` `nearPath`): a careful vial shot from 13-20 m now hits 16 of 18 (0 of 12 from 15-20 m
  before). A hit near the Plumb's bob swings the pendulum away from the blow. **A76 stays pending** (no kind is in a
  third weight class) and hit-feel-lance still fails 3 of 4 runs.

Then the check lane measured `r5/int` at **72296aa** from one clean detached worktree (0 tracked files changed) on
port 5270, one Chrome at a time. It changed no repo file.

**Verdict: NOT CLEAN, on one flaky kept row.** A45c-foot-continuity failed in its session (a Tiller's planted foot read
3.545 m/s, bar 3) and passed on both re-runs alone. Every other kept row passes or is pending as before, no accepted
frame is further, and the slice played 14/14.

**Tier 0 at 72296aa: PASS, 10 of 10.**
- `vite build` OK (3.96 MB of code). Name lint 0 hits in 787 files.
- Licences 231 files against 31 rows. Asset budgets clean (now graded per size class: Peg 10030 of 25000 triangles,
  Plumb 21002 of 25000, Tiller 26480 of 50000, Gauge 19704 of 50000). Import graph 205 modules, 0 broken.
- Resident textures 61.42 MB of 175 MB. Shipped 53.18 MB (`public/` 49.22 MB + code 3.96 MB; cap 110 MB).
- 171 Node tests pass in 32 files (two outfit-fit cases skipped, as before). Boot 3.8 s, 0 errors. Rendered-page name
  lint 0.

**Kept-stack rows at 72296aa** (two sessions, every row reached, then two short re-runs): 80 rows, **69 pass** in
session (71 after the re-runs), **8 visual** judged against their 701b366 shots (the same poses), **1 fails** in
session (A45c), **2 pending** in session (A9 on load, A76).
- **A45c-foot-continuity:** in session, a Tiller (alert, 6 m/s) planted foot moved 0.0489 m in one rendered frame
  of 13.8 ms wall time: 3.545 m/s (bar 3; the per-frame bar of 0.12 m passes). At 701b366 the same row read 0.044 m in
  a 16.6 ms frame, 2.649 m/s. Two re-runs alone at 72296aa: 0 m/s, 0 slips over 2 cm, the Tiller alert at 6 m/s
  both times. No gait or machine-motion source changed in wave 0 (the Tiller's file only gains its size class). The
  row divides one simulation step by the wall-clock frame, so a short frame reads fast; it is the flake the backlog
  already names.
- A9-perf-budget: PENDING in session (1-minute load 3.33), then PASS twice on a quiet box (load 2.55 and 2.72):
  59.9 fps median, 130 draw calls, scene GPU 20.82 and 17.98 ms.
- A76-footfalls: PENDING. The kinds now declare their classes, which the footfall weights read as two (light,
  medium); the row needs three.
- A16: knuckle to the jaw anchor 0.014 m, hook to nock 0.0083 m. A17: hand to quiver 0.035 m (0.132 at 701b366; the
  quick draw), loose 0.075 m behind. A107: behind the head band at a jog 0.069 m, at a sprint 0.063 m (bar 0.10; 0.057
  and 0.016 at 7474b9f). A44b 0.054 m (bar 0.1). A3 6.75 m/s.
- A90: geometries 399 -> 398, textures -3, heap -1.1 %. A90-rig-reclaim and A90b 0 growth, 0 offenders.
- A3 and A65 passed on the runner's retry (A3: a 90 s wait timed out; A65: a screenshot timeout).
- Visual rows (V1, V2, V3, V4, V13, V21, V49, V-traversal): the same poses as at 701b366. V49: in all 12 tiles both
  elbows stay under the top of her head and no forearm crosses behind it. V-traversal: the ledge-climb's sash panels
  now hang instead of one panel standing out level across the thigh.
- The runner still reports three gate files that do not load in a detached worktree (`gates.r5.brand`,
  `gates.r5.gates-perf`, `gates.r5.shell-ui`); none of the kept rows comes from them.

**The slice at 72296aa, one run (`--run-only`):**

| | run |
|---|---|
| beats | 14 of 14, in order, stopped at the reward (quest done) |
| Peg cross | 61.4 s, hp 100 -> 53, one drink to 93; three kites |
| ditch | hidden 56 % of 3907 frames, the Plumb never suspicious |
| topple | 15.0 s; vial arrows from 13.3 and 11.3 m, then the bob from 9.6 m |
| lowest hp | 53 (in the cross) |
| reward | the Scout with Shrug |
| save rows, site clock | reload, T1, continue, site clock: PASS |
| frames over 33 / 50 ms in play | 0 / 0 (worst 33.3 ms) in 78 s and 9267 frames |

- No death. Under the Loading sheets, 10 frames each, counted apart (worst 158 ms at New Game). The opening shot still
  has a townsperson standing in the camera at New Game.

**Frames at 72296aa** (the 16 accepted frames, one film, 0 console errors; then F08, F09 and F10 three times each):
- **No accepted frame is further than its anchor.**
- F14 and F15 match their new simulation-time anchors (0.01 % and 0.14 % of pixels over 10 of 255).
- F16, F18, F19: the same poses as their anchors; only the grid cloth's panels differ.
- F08: the first film caught the idle's quiver-strap break (her right arm out at the shoulder, the wall-clock
  staging); all three repeats match the anchor (arms down). Same.
- F02, F03, F05, F09, F10, F11, F13, F20, F23 (Plumb), F24: the same as their anchors and as 701b366, within the
  cloth, the hair wrap, the wind and the clouds.

**Chrome used:** about 36 minutes over 8 launches: Tier 0's boot 0.2, kept session 1 8.4, kept session 2 17.8 (over
the 15-minute cap: A90's 30 cycles alone are 5.3 minutes), the A9 and A45c re-runs 1.6, the frames 1.8, the slice 5.9,
the repeats 0.7.

---

**Ruling (the orchestrator):** A45c-foot-continuity divides one simulation step's slip by the wall-clock frame, so a short frame reads fast (0.0489 m in a 13.8 ms frame = 3.5 m/s, the same step that read 2.6 m/s in a 16.6 ms frame); it is restated to grade the slip per simulation step (<= 0.05 m) beside its per-frame 0.12 m bar. With that, the check is clean and main is fast-forwarded.

## Milestone 2 wave 1: the blockout (Nov 19 2026)

Wave 1 had four lanes in one tree on `r5/int`. No commit was pushed.

- **Seams first.** Each owner committed its seam empty but typed before any lane built against it:
  - `src/core/regions.js`, `src/game/save/fields.js` and `src/game/quest/scar-plan.js` (engine, systems);
  - `src/instruments/lib/sight.js` (instruments);
  - `src/world/settlements/ninewalls-layout.js` (settlements);
  - `tools/frames/stagings/<lane>.mjs`, merged by `tools/frames/stagings/index.mjs`.
- **Area A (world).**
  - The Holds at blockout: `src/world/holds/blockout.js` holds the Screed Scar, Benchmark 1 on the Scar's line at the bible's (12, -282), the Plumb's bench above Ninewalls, the herd's slope and the barranco.
  - Tools: HG0 and HG1 in `tools/world/holds-rows.mjs`, and the skyline masks in `tools/world/skyline-masks.mjs`.
  - Lenses: F33, F33-scar and F33-trig.
- **Area B (settlements).**
  - Ninewalls' nine walls exist as data (`ninewalls-layout.js`) and as grey boxes (`src/world/settlements/ninewalls.js`, 2 draws), with 16 sunk dwellings, the tree, the tube mouth, the counter and the cistern.
  - NW0 and NW3's data half are in `tools/build/settlements/ninewalls-rows.mjs`. Frames F34-F37.
- **Area C (instruments).**
  - The Tiller herd never flees, with a new follower law. IN0 is in `tools/instruments/in0-geometry.mjs`.
  - The Screed's and the Sickle's rules are in Node (`screed-rules.js`, `sickle-rules.js`).
  - The Screed, the Sickle and the Tiller's skirted default form exist as grey kinds with no role claimed. The Tiller that plays keeps its M1 body.
  - A45c and A76 were restated (`docs/GATES.md` §3 D). Frames F23-tiller, F23-sickle, F23-screed.
- **Areas E and F (engine, systems).**
  - Region loading (`engine.attachRegions`, ticked with Brea's position).
  - HR0 in `tools/gates/systems/hr0-geometry.mjs`.
  - The first-hour runner as a skeleton (`tools/gates/systems/first-hour.mjs`, three legs, fixtures in `first-hour-fixtures.mjs`).
  - F44 at blockout.

Then the review lane measured `r5/int` at **f6d3567** from one clean detached worktree (0 tracked files changed) on
port 5270, one Chrome at a time. It changed no repo file.

**Verdict: NOT CLEAN, on five accepted frames changed outside any skyline mask.** F14, F15, F16, F18 and F19 now show
Ninewalls' grey walls and dwellings on their skyline. None of the five is in the mask list (F02, F05, F17, F24, F25, F32
and the T1 beat's lens). Everything else holds:
- every kept row passes;
- no other accepted frame is further;
- the slice played 14/14;
- the first-hour skeleton fails its 14 new beats by name.

**Tier 0 at f6d3567: PASS, 10 of 10.**
- `vite build` OK (4.01 MB of code). It is also green at all 31 wave 1 commits (fd4c7a8..f6d3567).
- Name lint 0 hits in 828 files.
- Licences: 234 files against 32 rows. Asset budgets: 45 GLBs, 0 over a cap. Import graph 211 modules, 0 broken.
- Resident textures 61.42 MB of 175 MB. Shipped 53.29 MB (`public/` 49.28 MB + code 4.01 MB; cap 110 MB).
- 204 Node tests pass in 40 files. Boot 3.8 s, 0 errors. Rendered-page name lint 0.

**Kept-stack rows at f6d3567** (two sessions, every row reached, then A9 alone): 80 rows. **72 action rows pass**, the
**8 visual rows** show the same poses as at 72296aa, **0 fail** and **0 pending**.
- **A76-footfalls passes for the first time.** It reads three weight classes: the Screed routes to the heavy set, the Sickle and the blockout Tiller to the medium set.
- A45c-foot-continuity (restated): worst planted slip 0.0267 m per simulation step (bar 0.05), 1.6 m/s reported, not graded.
- A9-perf-budget was PENDING in session (1-minute load 3.21). Alone on a quiet box (load 2.37) it passed: 59.9 fps median, 130 draw calls, scene GPU 21.27 ms.
- A65 passed on the runner's retry (a screenshot timeout).
- A90b: heap +7.4 %, 0 offenders.
- A3 6.75 m/s. A17 hand to quiver 0.046 m, loose 0.088 m behind.
- V49: in all 12 tiles both elbows stay under the top of her head and no forearm crosses behind it. V1 and V3 now show Ninewalls on the skyline.
- The runner still reports three gate files that do not load in a detached worktree (`gates.r5.brand`, `gates.r5.gates-perf`, `gates.r5.shell-ui`). None of the kept rows comes from them.

**The slice at f6d3567** (first-hour leg 1, `slice-hour.mjs --run-only`): **14 of 14**, stopped at the reward.

| | run |
|---|---|
| Peg cross | 47.1 s, hp 100 -> 95 |
| ditch | hidden 63 % of 4495 frames |
| topple | 47 s, 3 vial arrows |
| lowest hp | 45 (at the return); two drinks |
| reward | the Scout with Shrug |
| save rows, site clock | PASS |
| frames over 33 / 50 ms in play | 0 / 0 in 120 s and 14,205 frames (worst 33.4 ms) |

**The first-hour skeleton at f6d3567** (`first-hour.mjs --legs 1,2,3`): **14 of 28 beats.**
- Leg 1: 14/14. Leg 2: 0/8. Leg 3: 0/6. Every new beat fails by name: its quest is not wired yet, then the first missing piece.
- Leg 2, from its fixture save: the regions seam fired approach Holds at 15.2 s, then leave Pans and enter Holds at 31.7 s, once each. 0 frames over 33 ms in 5590. The walk to Ninewalls timed out 62 m short at 48.8 s.
- Leg 3: walked to Benchmark 1 and raised the Alidade.

**Frames at f6d3567** (the Frame Set and the 11 lane frames, `--lanes --repeat 2`, 90 of 90 filmed, 0 console errors):
- **F14, F15, F16, F18, F19 changed on the skyline.** The hillside above the salt cell now carries Ninewalls' walls and dwellings. The sim-time stagings froze at their usual frame counts (91, 194, 217, 314, 187); 0.8-2.9 % of pixels differ from the 72296aa film.
- Inside her figure only the cloth and the carried lance differ, most in F18. That is the allowed class, but no cloth or hero source changed and her state digests moved.
- Every other accepted frame matches its anchor and the 72296aa film within the cloth, the wind, the grass and the clouds. That is F02, F03, F05, F08, F09, F10, F11, F13, F20, F23 (Plumb) and F24.
- Repeat 2 is not usable as a noise floor in this session: the orbit frames' lens stood 0.75 m off, and the title menu stayed up into F26's and F03's second shots.
- The blockout frames are on the owner's page (not accepted, grey): F33, F33-scar, F33-trig, F34, F35, F36, F32, F23-tiller, F23-sickle, F23-screed and F44, plus a regions map.
- F37 has no Oro yet, and F36 has no people.

**The Node rows at f6d3567:**
- HG1 passes in the recipe and the bake: 25 m wide within 0.55 m at 10 stations; centreline within 0.18 m of a straight line; berms 0.7-1.2 m; B1 0.49 m off the line.
- HR0 now passes, because Benchmark 1 is at the bible's point. The tops of T1, T2, the Sounding Ring and the Roque plug all clear from B1's eye; T2 by only 0.5 m.
- NW0 passes on level ground and fails on the island's ground.
- HG0 and IN0 are recorded. Their open questions are the rulings below.

**Rulings the blockout asks for (row 0, before any art):**
1. T1 stands 35.8 m east-south-east of the bible's point (the bible gives T1 the Organ Shelf's own point).
2. The Scar crosses the slope at up to 46° of cross-fall. A level floor would cut or fill up to 13 m, so the blockout planes it with the cross-fall.
3. The Jameo stands inside the Scar's berm band (15.3 m off its centreline).
4. Ninewalls sits on a hillside: under the village the slope is median 27.7°, max 46°.
   - The nine walls need terraces (each crescent a riser) or a re-graded pad.
   - NW0 (a): the Screed's run fits between the outer walls (clear gaps 6.6 and 6.8 m), but only across 22° of side slope.
5. 52.6 % of the Holds' land is inside the bible's 20-90 m (p95 117 m).
6. The herd file's gap band: centre spacing or clear space. It is built as clear space: 5.0 m open, 4.0 m closed.
7. The Tiller that plays is the M1 body, and its 1.30 m belly is no cover. The skirted default exists only as a grey kind.

**Chrome used:** about 41 minutes over 6 launches:
- Tier 0's boot 0.2 min.
- The frames 8.9.
- Kept session 1 9.4, kept session 2 15.2.
- The first hour 6.9.
- A9 alone 0.2.

---

**Rulings after the blockout (the orchestrator; the owner can override any):**
1. T1 stays where the game builds it (-187, -357), 35.8 m from the bible's point: the slice and its frames are built and accepted there. The bible's point is updated to the built one.
2. The Scar is planed, not levelled: its floor keeps the side slope's tilt where the cross-fall is 29-46 deg.
3. The Jameo keeps its height; the Scar's berm and apron are moved or broken so the Jameo's skylight pit clears them by at least 3 m.
4. Ninewalls stands on terraces, each crescent wall a riser; NW0's pad clause is restated to the terraces.
5. The Holds' height band follows the built terrain (p95 117 m); the bible's 20-90 m is restated.
6. The herd file's gap is clear space, stern to bow (as built in IN1).
7. The Tiller that plays becomes the corrected form in wave 2 (art), so the herd gives cover.
8. Ninewalls on the skyline of F14, F15, F16, F18 and F19 is the blockout by design: those five join the skyline masks and are re-anchored once (the town ruling's pattern); Brea's figure, cloth and pose are still judged against the anchors.
With these, main is fast-forwarded.


## Milestone 2 wave 3: behaviour (Nov 19 2026)

Wave 3 had four lanes in one tree on `r5/int`: C (instruments), D (kit, hero-anim, ui), E (systems, writing) and B
(people), plus the engine's fight-frame work. No commit was pushed.

- **Area C (instruments).**
  - IN3: an Instrument's sightline stops at the sight occluders: a hull, the Windwall and the walls.
  - The Screed fights only on Ninewalls' walls, within 160 m.
  - The herd reports its lee (`herd-lee`).
  - The Sickle's pack circles her and attacks in turn.
  - A45c holds again. The cause was in the Tiller's art (a 0.6 m thigh on a 1.95 m shin); the art was fixed, not the gait.
  - Page rows A-moving-cover and A-screed-fight. Frames F38 and F39.
- **Area D (kit).**
  - The rules in Node: the pots, the statuses, the Windwall's verbs and the gaff's.
  - The verbs performed by the body: the gaff's three lights and the hook-rip; the Windwall's guard, bash and plant; the pots cast, fly and land.
  - Oro's kit in play, the Kit Rack (quick slot 4 is the pots), and F as the pot cast.
  - Frames F40-F43.
- **Area E (systems, writing).**
  - W2 as plain data.
  - "The Scar" and "True Ground" wired after "Raker's Morning" (`src/game/hour.js`).
  - The re-survey (`src/game/resurvey/`) and true ground.
  - The runner drives the herd beat and the re-survey. F44 staged.
- **Area B (people).**
  - Eight Holds people at Ninewalls, Oro among them, with routines, shelter from the Screed, the youths trailing the herd and the Holds lookout rule.
  - The walk grid is built while the title is up.
  - F36 restaged three times.
- **Engine.**
  - The Holds' ground term in its own program, chosen per triangle.
  - The crater's beds on the crater alone.
  - HG4 tuning. `attrib.mjs` takes `hide:<child>` toggles.

Then the review lane measured `r5/int` at **aba90a3** from one clean detached worktree (0 tracked files changed) on
port 5270, one Chrome at a time. It changed no repo file.

**Verdict: NOT CLEAN.** Four things block:
1. **Two accepted frames changed outside every mask and outside her figure: F15 and F19.**
   - The big cone's flank behind the town has lost its striped beds.
   - The change is 2.7 % and 2.1 % of the pixels outside the mask and her box; at the wave 2 review it was 0.003 % and 0.002 %.
   - A two-film bisect puts it at 11f4adb ("the crater's beds on the crater alone"). 44f3923 matches the wave 2 film (0.12 %), and 11f4adb matches aba90a3 (0.15 %).
   - Intended, but not covered by a ruling.
2. **A-moving-cover (IN3 on the page) fails.** 2 of 4 lee walks were seen, in two runs. The Node twin passes: 0 of 10 seen, and 10 of 10 out of the shadow seen within 4 s.
3. **The first hour plays 19 of 28 beats.**
   - Leg 2 has 2 frames over 50 ms (worst 74.7 ms) in 14,300.
   - Leg 3 has one frame of 374.7 ms.
   - In a second run of leg 3, the three Pegs that come to look killed her during the re-survey: hp 0 at 13.4 s of arc.
4. **The Windwall bench passes 3 of 8.** The closed fan rises 0.023-0.067 m above her shoulders, behind her head plane, for 2-7 point-steps of the raise (guard, guardRelease, guardJog, guardCrouch, guardThenStowGaff). The gaff passes KT1 in 19 of 19 cases, but W3 fails in 3: the wrist jumps 0.097-0.141 m in one step.

**Tier 0 at aba90a3: PASS, 10 of 10.**
- `vite build` OK (4.22 MB of code), and green at all 37 wave 3 commits (9e51a01..aba90a3).
- Name lint 0 hits in 897 files. Licences: 242 files against 33 rows. Asset budgets: 53 GLBs, 0 over a cap. Import graph 232 modules, 0 broken.
- 257 Node tests pass in 51 files. Boot 4.1 s, 0 errors. Rendered-page name lint 0.
- **Resident textures 119.33 MB** of 175 (61.42 MB at f6d3567). People alone are 91 MB, against a plan line of 39.
- Shipped 56.94 MB, against the 60 MB first-load cap.

**Kept-stack rows at aba90a3** (two sessions): 80 rows. **72 action rows pass**, the **8 visual rows** show the same
poses as at the wave 2 review, **0 fail**.
- A45c-foot-continuity: worst planted step 0.027 m (bar 0.05).
- A9-perf-budget: 59.9 fps median, 133 draws, scene GPU 18.75 ms, load 2.66.
- A45 0.049 m, A46 0.059 m, A3 6.75 m/s.
- A65 passed on the runner's retry (a screenshot timeout).
- V49: in all 12 tiles both elbows stay under the top of her head.

**The slice at aba90a3** (`slice-hour.mjs --run-only`): **14 of 14**, stopped at the reward.

| | run |
|---|---|
| Peg cross | 40.5 s, hp 100 -> 95 |
| ditch | hidden 70 % of 5887 frames |
| topple | 25.2 s, 2 arrows |
| lowest hp | 85; two drinks |
| reward | the Scout with Shrug |
| save rows, site clock | PASS |
| frames over 33 / 50 ms in play | 0 / 0 in 105 s and 12,370 frames (worst 32.7 ms) |

**The first hour at aba90a3** (`first-hour.mjs --legs 1,2,3`, legs from fixtures, not chained): **19 of 28.**
- **Leg 1:** 14/14, lowest hp 65, 0 frames over 33 ms in 17,008.
- **Leg 2:** 2/8.
  - walk: 101.1 s, ending 3.5 m from Ninewalls; it entered the Holds at 31.9 s.
  - herd: 126.3 s, hp 86.
  - plumb-2, barbed, oro, stall, seal-1, seal-2 fail by name: no topple driver, no Barbed arrow, no Screed on the walls.
- **Leg 3:** 3/6.
  - scar, survey and fade pass. The arc ran 15 s; T1 249.2°, 0.03° off; the line came off 1.2 s later. hp fell 72 to 43.
  - rest-noon, calima-cross and read-transit are wave 4's.

**The lane page rows at aba90a3:**
- A-herd-ripple PASS: the lamps flash down the file in 0.55 s, and the gaps are 3.95 and 4.0 m at 4 s.
- A-screed-fight PASS twice: one charge, heading deviation 0°, a 3.048 s stall on wall-1, both seals off, 0 cuts, the blade dropped.
- A-moving-cover FAIL: 2 of 4 lee walks seen.

**Node benches at aba90a3:**
- pot-bench 7/7: the left hand stays at least 0.211 m under her shoulders.
- moving-cover: lee 0/10 seen, open 10/10.
- W2 writing 7/7: 38 cards of at most 3 lines; 251 lines, the widest 54 characters.
- gaff-bench 16/19. windwall-bench 3/8.

**The Holds' budget in the fight frame** (`attrib.mjs --probe d1 --pairs 8`, load 1.7-3.6):
- **F25:** 13.80 ms, 144 draws, 1.46 M triangles.
  - Base without the slice's Instruments and Saltrow: 12.40 ms.
  - 1.10 ms is left under 13.5, and the stand-ins at the caps cost 1.35 ms: **it does not fit, by 0.25 ms**.
  - 0.69 M drawn triangles fit (0.82 of the caps' load).
- **F39:** void.
  - The first reading was 11.2 ms and the last 35.0 ms; with everything hidden it read 32 ms.
  - Another session's process held a CPU core through the second half.

**Frames at aba90a3** (the Frame Set and the lane frames, `--lanes`, 58 of 58 filmed, 0 console errors):
- **F15 and F19: the cone's flank changed** (above).
- **Every other accepted frame matches** the wave 2 film within the cloth, the wind and the grass: F02, F03, F05, F08, F09, F10, F11, F13, F14, F16, F18, F20, F23-plumb and F24.
- **The lane frames:**
  - F38, F39, F40, F40-front, F41, F42, F42-light and F43 are new.
  - F40-open is further: the fan opens downward now and is cut off at the frame's foot.
  - F42's Sickle is lost in the high meadow.
  - F36 shows one person at work, against a target of 5.
  - F44 has its stand-ins: no planted Windwall.

**Chrome used:** about 70 minutes over 14 launches.
- Tier 0's boot 0.2 min, the frames 5.0, kept session 1 9.8, kept session 2 15.3.
- The slice 5.0, the first hour 9.3, attrib 15.3.
- The lane rows, the clips and the bisect about 12.

---

**Rulings this review asks for:**
1. **The cone's flank.** Either it re-anchors F15 and F19 once, the town ruling's pattern (the beds were a banding across the whole cone, and the plain flank reads as cinder), or engine puts the beds back outside the crater.
2. **The herd as cover.**
   - The page row fails, and the game's herd beat by input ends with her beside the terrace Plumb, not behind a hull.
   - The beat passes on `herd-lee` alone.
   - Instruments to make the page row pass; systems to have the beat require her inside a hull's shadow from the Plumb.
3. **The re-survey's danger.** The Pegs that come to look can kill her during the 15 s hold. Either the Windwall is planted in the beat (F44's stand-in), or the Pegs' damage in the hold is capped.

**Rulings after the wave-3 review (the orchestrator):**
- The crater's bedding now draws on the crater alone (11f4adb); the grey flank above the Holds lost bands that read as wood grain. That is closer to the references by design: F03, F15, F16 and F19 are re-anchored once (Brea unchanged), and F25 and F32 take it inside their masks.
- main stays where it is: the Windwall's closed fan rises above her shoulders and behind her head plane in 2-7 steps of the raise, which breaks the owner's bar (never an arm or a held thing behind the head), and the herd-as-cover page row fails 2 of 4. Both are fixed before the next merge.


## Milestone 2 wave 4 and the exit run (Nov 19 2026)

## Milestone 2 wave 4 and the exit run (Nov 19 2026)

Wave 4 ("the hour") had three lanes in one tree on `r5/int`: areas A+F (world, sky-look), C (instruments) and E
(systems, writing), with polish lanes for cloth, hero-anim, people and settlements beside them. No commit was pushed.

- **Areas A+F.**
  - Calima at noon over the Holds: in calima the dust is a deep layer (fog height falloff 1/1600 m).
  - The cloud shadows read one scrolling texture, fetched once a fragment, in a phase that keeps every accepted lens in sun.
  - The weather seam's ask: `askWeather`, `clearAsk`, `asks`; `setWeather` emits `weather`; `sunAltitudeDeg`.
  - The Malpais as two cold lavas (aa and pahoehoe), with cinder bands and lichen crust.
  - The Kiln Yards' far form: two tower stubs, four stacks, three pipe racks, three wellheads.
  - F45 and F45-trade staged; the regions seam walked along the hour's walks in Node.
- **Area C.**
  - IN2: a calm herd ignores her unless she stands on its line.
  - The Transit's far form, published as `ctx.transitFar`: one mesh, no behaviour, drawn only from 11:30 to 12:30 with the sun at least 45 deg up.
  - The live Screed levels the reed under its blade. F45-transit staged.
- **Area E.**
  - The Ninewalls Brazier, with REST UNTIL NOON pre-selected for that one rest. Calima asked for at noon. The Malpais edge from the regions map. The Transit read through the Alidade.
  - The first certification award, the Ninewalls counter and the TRADE screen, the Guild Notice board, save fields `certs` and `counter`.
  - The runner drives every beat by input; `--chain` carries the save leg to leg.

Then the exit run measured `r5/int` at **fa45e47** (8dcab5a's game and one tool commit: `tools/perf/exit-bar.mjs` stages
the lane frames) from one clean detached worktree (0 tracked files changed) on port 5270, one Chrome at a time.
Other lanes were still filming during it; it waited for the slot when they held it. It committed one fix (b66f3dd).

**Verdict: Milestone 2 does not exit.**

| # | exit condition | result at fa45e47 |
|---|---|---|
| 1 | `A-first-hour` plays its 28 beats in order, input-driven, no death, three runs | **FAIL**: 16/28 chained, 21/28 and 17/28 with each leg from its fixture |
| 2 | the M2 frames accepted; the accepted frames not regressed | awaiting the owner; no accepted frame regressed; F44 and F36 fail their written targets |
| 3 | resident textures <= 175 MB with two peoples and two biomes | PASS: 137.33 MB (the ledger, every shipped texture) |
| 4 | `public/` <= 165 MB | PASS: 55.19 MB |
| 5 | the frame bar in the fight frame | PASS in the headless form (F39: GPU 11.4 ms, 1799 frames in 30 s, 0 over 33 ms) |

**Tier 0 at fa45e47: FAIL, 9 of 10.**
- The import graph found `src/game/quest/transit-far.js` importing three. The rule is that `src/game/` never imports three.
- The file was the systems stand-in for the Transit's far form. It was never built, because the registry always publishes `ctx.transitFar`.
- b66f3dd removes it. `src/game/hour.js` now returns no far form when none is published, and the beat fails by name.
- **Tier 0 at b66f3dd: PASS, 10 of 10.**
  - `vite build` OK, 4.27 MB of code. Name lint 0 hits in 923 files.
  - Licences: 243 files against 34 rows. Asset budgets: 54 GLBs, 0 over a cap.
  - 274 Node tests pass in 57 files. Boot 4.2 s, 0 errors.
  - Texture ledger 137.33 MB of 175. Shipped 59.45 MB (`public/` 55.19 MB).

**The frame bar (TECH §9.1)** at 1600 x 900 CSS px, DPR 1.25, quality `high`, headless Chrome 151 on ANGLE Metal.
Tool: `tools/perf/exit-bar.mjs`. The 1-minute load average was 2.4-3.5.

| line | F02 | F25 | F33 | F39 | bar | result |
|---|---|---|---|---|---|---|
| median GPU, back-to-back readback (7 x 60 frames) | 9.9 | 13.1 | 11.9 | 11.4 | <= 14 ms | PASS |
| frames presented in 30 s; over 33 ms | 1798; 0 | 1797; 0 | 1800; 0 | 1799; 0 | >= 1782; 0 | PASS |
| p95 presented interval (headless) | 17.6 | 17.4 | 17.5 | 17.4 | <= 16.7 ms headed | not measurable headless (an empty page reads 18.0) |
| main-thread JS per frame, p95 | 4.0 | 4.3 | 4.0 | 3.8 | <= 8.0 ms | PASS |
| draws; triangles | 102; 1.62 M | 145; 1.47 M | 118; 1.22 M | 116; 1.06 M | <= 350; <= 6.5 M | PASS |

- F39's staging is the Screed, one Sickle and Brea. IN11's cost case (three Sickles and five people) was not measured.
- **Load (the built game):**
  - Title interactive 4.53 s cold, 4.32 and 4.17 s warm (bar 5 s).
  - New Game to control 0.36 s cold, 0.20 s warm.
  - First load 49.73 MB in 254 requests (bar 60 MB).
- **Hitches in the first hour: FAIL.** No run reached 10 minutes of play.
  - Run 1, 7.7 minutes: 21 frames over 33 ms and 1 over 50 ms (75.0 ms, on the walk into the Holds).
  - Run 2, 8.5 minutes: 19 over 33 ms and 6 over 50 ms (worst 115.8 ms; 2 in leg 2, 4 in leg 3).
  - The slice alone: 0 and 0 in 105 s.

**Kept-stack rows at fa45e47** (two sessions): 80 rows. **71 action rows pass**, the **8 visual rows** show the same
poses as at the wave 3 review (the sash's new folds aside), **0 fail**.
- **1 pending: A9-perf-budget, on the quiet-box rule.**
  - Load at the row: 4.24. Measured: 59.9 fps median, 133 draws, scene GPU 19.24 ms.
  - A re-run alone got no Chrome: another lane held the slot.

**The slice at fa45e47:** 14 of 14, stopped at the reward.
- Cross 38.5 s, hp 100 -> 97. Topple 12.2 s. Lowest hp 85.
- 0 frames over 33 or 50 ms in 105 s and 12,543 frames.
- Save rows and the site clock: PASS.
- Leg 1 of each first-hour run was also 14/14.

**The first hour at fa45e47** (`first-hour.mjs`, three runs):

| leg | run 1 (chained) | run 2 (fixtures) | run 3 (fixtures, screencast) |
|---|---|---|---|
| 1 | 14/14 | 14/14 | 14/14 |
| 2 | 2/8: dies at plumb-2 (Plumb 75, Peg 22 hp) | 2/8: dies at plumb-2 (Tiller 64, Plumb 42 hp) | 2/8: dies at plumb-2 |
| 3 | 0/6: started from leg 2's death; the walk to B1 timed out 62.9 m short | 5/6: only read-transit fails | 1/6: Pegs kill her at 3.03 s of the re-survey's arc |

- **Leg 2: walk and herd pass in every run.**
  - Ninewalls is reached 3.5 m off, entering the Holds at 31 s.
  - Barbed, oro, stall, seal-1 and seal-2 were never reached by input.
- **Leg 3, run 2.**
  - The re-survey closed: a 15.0 s arc. Bearings T1 249.2 (0.033 deg off), T2 76.6 (0.34), the Sounding Ring 263.8 (0.155). hp 72 -> 38.
  - The line left the walls 1.2 s later. REST UNTIL NOON was pre-selected. Calima was asked for at 12:00 and arrived.
  - **read-transit failed.** She reached the edge at 12:51, after the beat's window closed at 12:30, so the far form was not drawn and no card showed.
  - The Alidade was 0.41 deg off at 109 m.
- **The rest dialog prints "CALIMA BY NOON" on the DAWN row.** The NOON row reads TRADE.

**Lane rows at fa45e47:**
- A-herd-ripple PASS: the flashes run nearest-first in 0.548 s; gaps 3.95 and 4.01 m at 4 s; 0 deg of bearing change.
- **A-moving-cover PASS**, in one run: 0 of 4 lee walks seen, 4 of 4 open walks seen within 4 s.
- A-screed-fight PASS: one charge, 0 deg of deviation, a 2.996 s stall on wall-1, both seals off, 0 walls cut.

**Node benches at b66f3dd:**
- moving-cover: lee 0/10 seen, open 10/10.
- herd-bearing: beside the bearing 0/10 react, on it 10/10; the bearing held within 0 deg over 120 m.
- pot-bench 7/7.
- **gaff-bench 16/19.** W3 fails in 3 cases: the right wrist moves 0.097-0.141 m in one step.
- **windwall-bench 3/8.** In 5 cases the closed fan rises 0.023-0.067 m above her shoulders and behind her head plane, for 2-7 point-steps. This is unchanged since the wave 3 review.
- **The handling bench:**
  - Bow and lance: 111 failing clauses in 25 of 26 cases.
  - The gaff in the loop: 21 failing clauses in 6 of 6 cases.
- A107: 18 cycles, 0 fail.
- People cloth: worst person 0.012 ms (bar 0.02).
- W2 writing: every row passes.
- calima-rows: EN3 visibility 155-169 m PASS; **EN4's sun 47.6-49.8 deg in the window FAIL** (the brief asks over 60 deg).

**Frames at fa45e47** (the Frame Set and the lane frames, `--lanes`, 62 of 62 filmed, 0 console errors):
- **Every accepted frame matches the wave 3 review film** within the wind, the grass and the cloth (sixteen frames).
- **The lane frames:**
  - F44 has the three pips and the arc. The Alidade is not up at her face, and no planted Windwall can be read.
  - F36 shows about three people at work, against a target of five.
  - F42's Sickle is still lost in the high meadow.
  - In calima, the Kiln Yards' far form reads as flat pale shapes, brighter than the dust (F45, F45-transit).
  - No sun disc reads in F45.

**Chrome used:** about 81 minutes over 13 launches, one at a time.
- Tier 0 0.4 min, the Frame Set 5.3, the exit bar 5.3.
- Kept session 1 9.7, kept session 2 15.3.
- The slice 4.9; the first-hour runs 13.2, 12.5 and 10.5.
- The lane rows 1.8, clips 2.0, Tier 0 at b66f3dd 0.3.

---

**Rulings this run asks for:**
1. **EN4, the sun at the Transit.** The built sky never stands above 50 deg, and the far form is gated at 45 deg. Either the bar becomes 45 deg, or the sky changes, which moves every accepted frame.
2. **The beat's window.** The walk from the Ninewalls Brazier to the Malpais edge costs about 0.85 game hours. Either the noon rest wakes her near 11:30, or the window widens.
3. **The Windwall fan.** It still rises above her shoulders and behind her head plane, which breaks the owner's bar. main stays held until the windwall bench passes.

## Polish run 1: people, Ninewalls, weapons, cloth (Nov 19 2026)

## The polish run beside M2 wave 4 (Nov 19 2026)

Four polish lanes worked in the one tree on `r5/int` beside wave 4: people, settlements, hero-anim (weapon handling)
and cloth. No commit was pushed.

- **People (550d7d2, 0ff1202, 447a27c).**
  - Oro and the other seven Holds people each have a 1024² outfit texture of their own instead of the shared Holds atlas. The build unwraps, packs and paints each piece: wool, leather and iron, fray, stitching, burns, soot, ash dust, the gold-ochre tick line and the crescents.
  - Oro has one painter per garment, and the other seven are painted by dye.
  - Oro's head set matches Brea's and Ansel's density. His outfit is at 0.856 of Brea's linear texel density (median; bar 0.60). He has 4 cloth layers on a ray into the chest, bib straps with buckles, the apron, tongs, and a pocket holding a chisel and a file.
  - The other seven's outfit normal and ORM maps are at 256² (Oro's stay at 512²).
  - Open: at close range the other seven's dyed wool still reads as flat blocks.
- **Settlements (fa37ef4, 2723593).** The settlements change touched one file, `src/world/settlements/ninewalls-kit.js`.
  - The drystone is coursed: wavy beds 0.24 m apart, and stones of varied length with leaning end joints and chipped edges.
  - The joints are mortarless and open into dark voids, with one parallax step up close. Past a few pixels per stone the wall is drawn flat at its mean tone.
  - The houses have dressed quoins and lime door surrounds; five of the 16 houses are plastered.
  - The forge and the counter are rebuilt.
  - The kit is still one material in 2 draws, at about 42.5k triangles (budget 110k).
  - Open: no frame films the forge or the counter close, and the village's cost inside the Holds' budget is not yet separated from the load noise.
- **Hero-anim, weapon handling round 4 (e584aeb, 5f8087a, 80a2b76, 0b60522).**
  - The lance's pull takes the right fist round her front, which removes a 0.28 m one-step wrist jump.
  - The gaff and the bow are never in her hands together. A bow stow that ends in a lance draw no longer pops 0.466 m.
  - In the bow unstow's last two phases the bow wrist is kept inside 27° of deviation and 55° of flexion.
  - New close clips `hPull` and `hGaffBow`.
  - The handling bench is at 111 failing clauses in 25 of 26 cases (114 at aba90a3). The gaff-against-bow cases fail 21 clauses in 6 of 6.
- **Cloth round 6 (edb2d93, 95a1ed0).**
  - Each sash panel is laid at twice the columns and hangs in broad folds: 9, 7 and 16 mm deep (front-left, front-right, back).
  - The hem roll is thicker, and the painted valleys match the folds.
  - The front-right panel swings free at 1.3 m/s.
  - New `people-cloth-bench.mjs` (the Holds people's cloth in Node), clips `cHolds` and `cOro`, and rows `C-holds-cost` and `C-oro-apron`.
  - Open: C4, C5, the landing and C10 still fail.

Then the check lane measured `r5/int` at **2723593** from one clean detached worktree (0 tracked files changed). It
used port 5278: wave 4's runs held 5270 throughout. One Chrome ran at a time. It changed no repo file.

**Verdict: CLEAN on the merge bar.** Tier 0 passes 10 of 10. `vite build` is green at all 32 commits since aba90a3.
Every kept row run passes. No accepted frame changed outside the cloth. The slice plays 14 of 14.
Two cloth regressions and two lane rows that failed before this run stay open (below).

**Tier 0 at 2723593: PASS, 10 of 10** (the Node checks with the build, then the boot).
- `vite build` OK (4.27 MB of code), and green at all 32 commits from 1130696 to 2723593.
- Name lint 0 hits in 923 files. Licences: 243 files against 34 rows. Asset budgets: 54 GLBs, 0 over a cap.
- Import graph 239 modules, 0 broken. 274 Node tests pass in 57 files. Boot 4.2 s, 0 errors. Rendered-page name lint 0.
- **Resident textures 137.33 MB** of 175 (119.33 at aba90a3). People alone are 109 MB, against a plan line of 39.
- **Shipped 59.45 MB, against the 60 MB first-load cap: 0.55 MB of headroom.** People's models and clips are 27.69 MB (plan line 14).

**Kept-stack rows at 2723593** (one session; `--kept-stack --only` with the touched rows):
- **All pass:** A1, A16, A17, A32, A107, A90-memory-stability, A90-rig-reclaim and A90b. V49 shows the same poses as at the wave 3 review.
- A16: knuckle to the jaw anchor 0.014 m, hook to nock 0.0083 m.
- A17: hand to quiver 0.040 m, loose 0.090 m behind.
- A32: ramp nock-to-hand at most 0.024 m, 0 wrap or behind-head steps.
- A107: in the behind-the-head band 0.059 m at a jog and 0.070 m at a sprint (bar 0.10).
- A90: 30 cycles, heap +1.5 %, geometries -1, textures -1. A90-rig-reclaim and A90b: 0 growth, 0 offenders.
- V49: in all 12 tiles both elbows stay under the top of her head. Only the sash panels differ.

**The lane page rows at 2723593:**
- **Pass:** A102, A104, A105 and A106.
- **A100 FAIL, as before.** In the dodge the stowed lance tilts 34.8-86.9° and its blade runs -0.49 to 0.81 m over the shoulder.
- **A103 FAIL, as before.** On the first swing the blade stops 0.522 m short of the hull. All 12 real-input swings across the four kinds land.
- **A101 FAIL.** The ready guard's tip stands 0.564 and 0.552 m high in two runs (canon 0.35-0.55). At aba90a3 it is 0.584 m and at 95a1ed0 0.558 m, so it failed before this run.
- **A-sweep-wind: 2 of 3 runs pass.** The failing run read the F15 front-right panel's bend at 4.8° (bar 5: "a board"). The row also fails at aba90a3 (0.8°) and at 95a1ed0 (4.2°), one run each. This is the flake the backlog already names, not a new failure.
- **The sweep in the page:** crouch, sit, mantle, slide, unstowBow, stowBow and blendLanceToBow pass.
  - **A-sweep-roll fails:** in 2 frames the front-right panel is 5.2 cm into the torso. The cloth lane read 0 frames at 8a0d72d and 1 at 95a1ed0.
  - **A-sweep-climb fails:** in 1 frame the front-right panel is 1.0 cm into the draw forearm.
- **The sweep in Node:** 22 clips, 0 behind-head steps, 0 head-plane steps, 0 clipping frames.

**Node benches at 2723593:**
- Handling bench: 111 failing clauses in 25 of 26 cases, and the gaff in the loop 21 in 6 of 6 (the lane's numbers confirmed).
- People's cloth: the worst person costs 0.0164 ms a step (Lantern Keeper; bar 0.02), and Oro 0.0143 ms: PASS.

**The slice at 2723593** (`slice-hour.mjs --run-only`): **14 of 14**, stopped at the reward.

| | run |
|---|---|
| Peg cross | 44.3 s |
| ditch | 49.1 s |
| topple | 12.4 s |
| lowest hp | 80; two drinks |
| reward | the Scout with Shrug |
| save rows, site clock | PASS |
| frames over 33 / 50 ms in play | 0 / 0 in 81 s and 9,466 frames (worst 25.1 ms) |

**Frames at 2723593** (F08-F10, F15, F19 and F34-F37 in one film, 0 console errors):
- **F08, F09, F10:** her pose matches the anchors. The sash panels now hang in folds; the back panel in F10 reads as draped cloth. Closer than the 2026-11-14 refilm (as the anchors are). In F08 the front-right panel shows a dark notch at mid-height.
- **F15:** the same stride as the anchor and as aba90a3 (1.07 % of pixels differ, almost all in her panels). The front-right panel stands a little proud of the thigh.
- **F19:** the same as aba90a3 (0.68 %), and 0.01 % from the wave 4 exit film.
- **F34 and F35:** the Line is on the walls before True Ground and gone after it. At this range the walls take the new flat far path at their mean tone. The haze differs with wave 4's calima.
- **F36 (closer):** the cistern and the walls read as coursed stones with depth, not crazy paving. About 4 people are at work in frame (target 5; one at the wave 3 review).
  - Frame cost: 16.7 ms median, 18.6 ms p95.
  - 121 draws and 0.87 M triangles.
- **F37 (closer):** Oro's apron, bib straps and sash carry texture and wear. Behind them the drystone and a plastered house have dressed quoins.
  - His lower right leg and foot read pale against the dark wool of the left.
  - The forge's coal bed reads as a flat orange slab at this range.

**Chrome used:** about 29 minutes over 6 launches.
- Tier 0's boot 0.3 min, the frames 1.0, the kept and lane rows 16.5, the sweep rows 2.5.
- The A101 and A-sweep-wind runs at three commits 3.7, the slice 4.6.

---

**Open after this check:**
1. The sash panel's clipping in the roll (2 frames, 5.2 cm into the torso) and the climb (1 frame). Both are on the front-right panel that now swings free.
2. The shipped size has 0.55 MB of headroom under the 60 MB first-load cap. Resident textures are 137 MB, with people at 109 MB against a plan line of 39 MB.
3. A101's ready-guard tip height sits on the 0.55 m edge (0.552-0.584 m over three commits).
4. A100 and A103 (the dodge's holster, the blade short of the hull) fail as before.
5. A-sweep-wind's F15 front-right bend is a flake (2 of 3 at 2723593, failing once each at aba90a3 and 95a1ed0).

**Rulings (the orchestrator):** EN4's sun-altitude bar is the built sky's noon peak (>= 45 deg); the sky is not raised. main is held until the Windwall raise keeps the fan in front of her and below the top of her head (the owner's bar).

## The M2 fix wave and exit run 2 (Nov 19 2026)

The fix wave had four lanes in one tree on `r5/int`: area D with hero-anim (the kit), area E (the hour), areas A+F
(sky, world, engine hitches) and area B (Ninewalls people). No commit was pushed.

- **Area D.** The Windwall's raise follows the arm: the fan stays shut until the arm is 0.4 of the way up and across
  her front, and folds before the arm comes down (02b692b). The gaff's wrist step is paced (ed871c6). The bow and the
  lance keep her head on her line and bound each elbow's swivel to 16 deg a step while a weapon is handled
  (cc89130, eefedde, 7423c27).
- **Area E.** The terrace Plumb reads from 9-14 m, waits 1.8 s before its first blow and stands still in its band;
  the lookers strike one at a time; the noon rest wakes her at 11:30; a continued save at plumb-2 or a seal stage
  stands its machines up again (5fb4925, 0f3e810, 6844217). The Transit's far form moved to 26 deg from the read
  point, clear of the Kiln Yards (34032ed). The runner gained herd-safe topple stands and `--from plumb-2`.
- **Areas A+F.** The walk grid labels its connected regions once per build, so a route to an unreachable cell is
  answered at once (b689974; the herd-beat hitches). The calima disc is drawn on the camera's own ray (94f7cc8). The
  Kiln Yards take the far-form air and the capped trade deck like the ground (d174a23). F45's lens pitch is -8.
- **Area B.** F36 restaged at the cistern with five people held in their work clips; `F39-people` added for IN11
  (788741e to 02f7125).

Then the exit run measured `r5/int` at **02f7125** from one clean detached worktree (0 tracked files changed) on port
5270, one Chrome at a time, with no lane running. It made no commit.

**Verdict: Milestone 2 does not exit.**

| # | exit condition | result at 02f7125 |
|---|---|---|
| 1 | `A-first-hour` plays its 28 beats in order, input-driven, no death, three runs | **FAIL**: 16/28 in all three chained runs |
| 2 | the M2 frames accepted; the accepted frames not regressed | awaiting the owner; F08, F11 and F13 show her head a few degrees off; F44 fails its written target |
| 3 | resident textures <= 175 MB with two peoples and two biomes | PASS: 137.33 MB (the ledger) |
| 4 | `public/` <= 165 MB | PASS: 55.19 MB |
| 5 | the frame bar in the fight frame | PASS in the headless form (F39: GPU 11.4 ms, 1798 frames in 30 s, 0 over 33 ms) |

**Tier 0: PASS, 10 of 10.**
- `vite build` OK, 4.28 MB of code. Name lint 0 hits in 926 files.
- Licences: 243 files against 34 rows. Asset budgets: 54 GLBs, 0 over a cap.
- Import graph 239 modules, 0 broken. 278 Node tests pass in 58 files. Boot 4.1 s, 0 errors.
- Texture ledger 137.33 MB of 175. Shipped 59.46 MB (`public/` 55.19 MB).

**The frame bar (TECH §9.1)** at 1600 x 900 CSS px, DPR 1.25, quality `high`, headless Chrome on ANGLE Metal.
Tool: `tools/perf/exit-bar.mjs`. The 1-minute load average was 2.5-3.5.

| line | F02 | F25 | F33 | F39 | F39-people | bar | result |
|---|---|---|---|---|---|---|---|
| median GPU, back-to-back readback (7 x 60 frames) | 9.9 | 13.1 | 11.1 | 11.4 | 11.4 | <= 14 ms | PASS |
| frames presented in 30 s; over 33 ms | 1799; 0 | 1798; 0 | 1798; 0 | 1798; 0 | 1799; 0 | >= 1782; 0 | PASS |
| p95 presented interval (headless) | 17.5 | 17.4 | 17.4 | 17.7 | 17.5 | <= 16.7 ms headed | not measurable headless (an empty page reads 18.0) |
| main-thread JS per frame, p95 | 4.0 | 4.3 | 4.0 | 4.0 | 4.1 | <= 8.0 ms | PASS |
| draws; triangles | 100; 1.62 M | 145; 1.47 M | 118; 1.22 M | 117; 1.06 M | 116; 1.06 M | <= 350; <= 6.5 M | PASS |

- F39-people draws the same as F39: the five people shelter outside its lens. IN11 is not measured as written.
- **Load (the built game):**
  - Title interactive 4.59 s cold, 4.43 and 4.22 s warm (bar 5 s).
  - New Game to control 0.38 s cold, 0.20 and 0.21 s warm.
  - First load 49.74 MB in 254 requests (bar 60 MB). The 30 s after New Game: 0 frames over 33 ms.
- **Hitches in the first hour: FAIL.** No run reached 10 minutes of play: the chained runs stop after about
  4.5 minutes.
  - Run 1: 6 frames over 33 ms and 1 over 50 ms (75.0 ms).
  - Run 2: 6 and 1 (74.6 ms).
  - Run 3 (screencast on, not graded): 7 and 1 (75.0 ms).
  - In every run the 50 ms frame and 5-6 of the 33 ms frames fall in leg 2's walk into the Holds (about 99 s). The
    herd-beat stretch of 34-44 ms frames seen at fa45e47 is gone.

**Kept-stack rows** (three sessions): 80 rows. **72 action rows pass, 0 fail, 0 pending.**
- A9-perf-budget passed alone on a quiet box: 59.9 fps median, load 2.96, 133 draws.
- The 8 visual rows show the same poses as at fa45e47, except one film of V3-crouch-stalk: a violet sash panel
  stretched about 1.5 m from her hip. Eight re-runs straight after (02f7125 twice, then b66f3dd, 02b692b, ed871c6,
  cc89130, eefedde and 7423c27) did not show it. It is intermittent.

**The slice:** 14 of 14, stopped at the reward.
- Cross 58.4 s, lowest hp 75 under the kites. Topple 22.8 s with 2 arrows. End hp 78.
- 1 frame over 33 ms (34.2 ms, at the ditch) and 0 over 50 ms in 84 s.
- Save rows and the site clock: PASS. Leg 1 of each first-hour run was also 14/14.

**The first hour** (`first-hour.mjs --chain`, three runs):

| leg | run 1 | run 2 | run 3 (screencast) |
|---|---|---|---|
| 1 | 14/14 | 14/14 | 14/14 |
| 2 | 2/8: stops at plumb-2, hp 98 | 2/8: stops at plumb-2, hp 98 | 2/8: stops at plumb-2, hp 100 |
| 3 | 0/6: starts at the `herd` checkpoint | 0/6 | 0/6 |

- **Why leg 2 stops.** The runner's terrace topple found 0 stands clear of the herd in three scans of 144 points,
  2.5 s apart, and gave up after about 10 s. She was not hurt and did not die; the Plumb never struck.
- **Two extra runs (not the row), legs from their fixtures:**
  - Leg 2: 5/8. plumb-2 passed on the third scan (the first two also found 0 stands): 5 arrows, hp 100 -> 65,
    all from the Sightline. Barbed passed, and Oro's hand-over was reached by input for the first time. stall, seal-1
    and seal-2 fail by name: the runner does not drive the Screed fight.
  - Leg 3: **6/6 for the first time.**
    - The re-survey closed: a 15.0 s arc. Bearings T1 249.2 (0.037 deg off), T2 76.6 (0.24), the Sounding Ring
      263.8 (0.156). Three Pegs came to look; one hit of 5.
    - REST UNTIL NOON was pre-selected and she woke at 11:30. Calima was asked for at 11:30 and arrived.
    - She reached the Malpais edge at 12:17. The Alidade was 0.05 deg off the far form at 111.1 m, and the stage was
      reached at 12:19. The card itself was not on screen when it was read: the shot shows the quest banner.
  - Leg 2 from `--from plumb-2`: plumb-2 passed (3 arrows, Sightline 30 hp), then barbed and oro. While it waited at
    the stall, two Tiller tramples of 20 hp took her to 22.
- **The rest dialog:** the NOON row now reads CALIMA BY NOON. The DAWN row also reads CALIMA BY NOON.

**Lane rows (not kept):**
- A-herd-ripple PASS: flashes nearest-first in 0.551 s; gaps 3.95 and 4.01 m at 4 s.
- A-moving-cover PASS: 0 of 4 lee walks seen, 4 of 4 open walks seen within 4 s.
- A-screed-fight PASS: one charge, 0 deg of deviation, a 2.997 s stall on wall-1, both seals off.
- A102, A104 and A105 PASS.
- **A100 FAIL, as before.** In the dodge the stowed lance tilts 34.5-87.9 deg.
- **A101 FAIL.** In light-1 the left palm is 0.050 m off the haft (new). The guard tip is at 0.558 m (canon 0.35-0.55),
  as before.
- **A103 FAIL.** The blade stops 0.613 m short of the hull (0.522 m at the polish run).
- **A106 FAIL.** A drawn left fist is 0.077 m inside a Plumb's shin on 1 frame. It passed at the polish run.

**Node benches at 02f7125:**
- **windwall-bench 8/8** (3/8 at b66f3dd). gaff-bench 19/19. pot-bench 7/7. A107: 18 cycles, 0 fail.
- The handling bench: bow and lance 95 failing clauses in 25 of 26 cases (111). The gaff in the loop: 15 in 6 of 6 (21).
- moving-cover: lee 0/10 seen, open 10/10. herd-bearing: beside 0/10, on it 10/10, held within 0 deg over 120 m.
- calima-rows: EN3 visibility 154.7-168.7 m PASS. EN4 47.6-49.8 deg in the window PASS (the >= 45 deg ruling).
- People cloth: worst person 0.0118 ms (bar 0.02). W2 writing: every row passes. `tools/gates/systems` 110/110.

**Frames** (the Frame Set and the lane frames, 63 of 63 filmed, 0 console errors):
- **Accepted frames:** 13 of 16 match the fa45e47 film within wind, grass and cloth. In F08, F11 and F13 her head is
  turned a few degrees, from the fix wave's head-on-her-line change.
- **F36:** five people at work. The written target is met.
- **F45-transit:** the Transit's far form stands clear, left of the Kiln Yards. The Yards are fogged with the ground,
  and the far form's legs are paler than the dust.
- **F45:** the lens still looks into the slope. No sun disc is in frame.
- **F44:** unchanged: the Alidade is not up at her face, and no planted Windwall can be read.
- **F42:** unchanged: the Sickle is lost in the meadow.

**Chrome used:** about 90 minutes over 23 launches, one at a time.

---

**What the next wave needs:**
1. **The runner's terrace topple.** From the slice's save it finds no stand clear of the herd. It needs to wait for
   the herd to pass or walk to a new place, not give up after three scans. This is a tool fix: from the fixtures the
   beat passes.
2. **The Screed fight driven by input in `first-hour.mjs`** (stall, seal-1, seal-2). Without it, 28/28 cannot be read.
3. **The 75 ms frame on the walk into the Holds.** Every run has it.
4. **A106 again.** It fails again: one frame of a fist 0.077 m inside a Plumb's shin.
5. **The head turn in F08, F11 and F13.** The owner rules: keep the new head, or restore the old one in idle and
   portraits.
6. **The Transit card on screen at the read**, and the DAWN row's forecast.

## Polish run 2: people's wool, the M2 frames, far forms, the first hour's sound (Nov 20 2026)

Three polish lanes worked in the one tree on `r5/int` beside the M2 fix wave 2: people (area B), frames and far forms,
and audio. A planning lane wrote the Milestone 3 briefs (private). No commit was pushed.

- **People (33852a6, 38f2a93, 85f6042).**
  - The seven Holds people wear three dye families by trade and age: undyed fleece and black wool, madder rust (the
    first youth's tunic, the first farmer's vest) and the pickers' cochineal. Pale oatmeal pieces that read as the
    Pans' linen (the pickers' aprons, the youths' tunics, the kit's sleeves) are fleece now; the palm hats are dark felt.
    Each person keeps one violet accent.
  - Oro's waist sash carries a row of gold crescents, horns up, about 2.8 cm across with a dark rim. No text, no numerals.
  - The lane's look probe (`tools/build/recipes/npc/holds-look-probe-page.mjs`) reads linen as CIE L* >= 60 with
    chroma <= 40, and each figure's 90th-percentile L*.
- **Frames and far forms (665de98, 42265b5).**
  - The Sickle has a value split: a dark upper hull over a bone belly. Its vertex counts rose (17,605 -> 17,770 and
    5,001 -> 5,061).
  - The Transit's far form is drawn in the dust: its legs are no paler than the air around them.
  - F44, F45, F39-people and F42 are re-staged toward their written targets; the lane's frame reads are
    `tools/frames/stagings/look-probe-page.js` (`film.mjs --probe`).
  - F45 now stands on the Malpais shelf 59 m north of the Kiln Yards, looking over the rim; F45-trade keeps the old
    lens for HG6.
- **Audio (7c3e22f, a776025).** 45 new counted cues, all synthesized in the repo (CC0): the region zones on the
  regions seam with crossfades (the Pans, the Holds, Ninewalls, the Scar, the Malpais edge), calima at noon, the Holds'
  work, Oro's forge, the Kit Rack, the Windwall, the gaff, the pots, the Tiller, the Screed and the re-survey's
  Alidade. `src/audio/m2` (recipes, cues, mix rules, director); the offline walk `tools/gates/audio/hour-walk.mjs`;
  the live row `A-audio-hour-live` in `tools/gates/audio/live-rows.mjs`.

Then the check lane measured `r5/int` at **2944784** from one clean detached worktree (0 tracked files changed) on
port 5273, one Chrome at a time, beside the fix wave's lanes (load average 3-5). It changed no repo file.

**Verdict: one regression.** Tier 0 fails on the shipped ledger. Every kept row the polish touched passes, the
accepted frames are the same, and the lanes' numbers reproduce.

**Tier 0 at 2944784: FAIL, 8 pass and 1 fail** (the Node checks, then the boot run on its own).
- **shipped-ledger FAIL: 60.94 MB** (`public/` 56.62 MB in 306 files + built code 4.31 MB) against the 60 MB
  first-load cap. It was 59.46 MB at 02f7125. The audio commit 7c3e22f adds 1.50 MB (`public/audio` 3.54 -> 5.04 MB,
  162 -> 225 files) and alone takes the total over the cap.
- `vite build` OK (4.31 MB of code). Name lint 0 hits in 999 files. Licences: 306 files against 34 rows. Asset budgets:
  54 GLBs, 0 over a cap. Texture ledger 137.33 MB of 175.
- Import graph 241 modules, 0 broken. 286 Node tests pass in 60 files. Boot 4.3 s, 0 errors. Rendered-page name lint 0.

**Kept-stack rows at 2944784** (one session; `--kept-stack --only` with the rows the polish touched): **13 of 13 pass.**
- A1, A20b, A6, A44, A44b (worst 0.081 m), A50 (1,483 hulls, 0 from retired geometry), A50b, A58b, A72, A73d, A74
  (300 m attenuates to 0.0053), A76 (54 live footfalls over 4 kinds) and A78.
- The per-species rows cover the Gauge, the Peg, the Plumb and the Tiller. No kept row covers the Sickle.

**The audio at 2944784:**
- The audio lane's live rows: 4 of 4 pass.
  - `A-audio-hour-live`: 63 bank rows decoded. The crossings fire leave Pans, enter Holds, leave Holds, enter Pans.
    Inside Ninewalls its bed is 0.999 and the Pans' 0.001; back home the Pans' is 0.997. Under calima the trade wind
    drops 0.189 -> 0.033 and a far one-shot at 100 m plays at x0.336. 18 of 18 event cues played, 0 silent.
  - `A-audio-walk-graph`: the slice walk in Chrome -17.37 LUFS. `A-audio-gust-live`: lead median 1.00 s.
- The first-hour walk (offline model: the slice walk, then legs 2-3, 440 s): **-19.18 LUFS, -2.40 dBTP** (bar -18 +-2,
  <= -1). ffmpeg's ebur128 on the same render reads -19.2 LUFS and -2.4 dBTP. Legs 2-3 alone: -19.80 LUFS, -3.13 dBTP.
- 45 of 45 new cues audible at their range in the model (the thinnest: `screed/idle` 4.0 dB at 60 m, `screed/step`
  4.2 dB at 80 m, `tiller/step` 4.4 dB at 40 m; bar 3 dB).
- 45 new counted cues in 63 files; 122 counted in all. `public/audio` 5.04 MB (bar 12 MB; plan line 8 MB).
- This is a script of the hour's events mixed by the game's tables, not a capture of play. The trample tell's 1 s lead
  holds only while she stands still.

**People at 2944784:**
- The 20 m line-up, village hidden: the 8 Holds people's 90th-percentile L* is 35.1-47.9 and the 4 Pans' 60.4-69.7.
  Linen-pixel share: Holds at most 4.4 %, Pans at least 6.1 %. Brea's violet is 39.8x any other figure's (bar 5x).
- By mean colour, 10 of 12 classify right. The Holds youth in madder rust reads nearer the Pans.
- Oro at 2 m: the crescents are about 20.9 device px across, with 849 gold pixels in the waist crop.
- People's cloth (Node): worst person 0.0134 ms (bar 0.02), Oro 0.0109 ms.

**Frames at 2944784** (11 frames in two films, 0 console errors; against the exit run 2 film at 02f7125):
- **F02, F03 (accepted): the same.** Only her idle and the wrap tail differ (wall-clock idle).
  - F02 differs from the exit film in 14.0 % of pixels and from its anchor in 22.7 % (the exit film: 20.9 %).
  - F03 differs from the exit film in 17.4 % and from its anchor in 40.7 % (38.6 %).
- **F25: the same** (0.1 % of pixels outside her).
- **F45 (closer):** the calima disc is in frame (centre 201.5 against 166.6 at 5-8 deg, 20.9 % contrast).
  - The Yards stand dark in the dust: 132,514 px at luminance 120.9 against 154.5 behind.
  - Visibility 169.4 m (band 120-180).
- **F45-transit (closer):** the far form's legs read 158.7 against 165.7 behind and 162 around, so they are not paler.
  The Yards are fogged with the ground.
- **F42 (closer):** the Sickle reads against the meadow: luminance 90.4 against 105.4, chroma 77.8 against 127.6.
  She holds the gaff at the ready, not the hook-rip.
- **F44 (closer):** the Alidade is at her face (tube 0.015 m from her eye).
  - The planted Windwall reads at her feet: 23,348 px at 95.4 against 125.4.
  - It stands on the line to a Peg in frame (0.0 m off the line).
  - The lens looks down the slope to the coast, not along the Scar's line. She stands pressed against the benchmark
    house, and her sash panels stand out level in the wind.
- **F39-people:** the five sheltering people are in its lens, so IN11 can be read as written. The lens is an aerial
  112 m over Ninewalls, and the fight is a speck.
  - **IN11: PASS, with 0.5 ms to spare** (`tools/perf/exit-bar.mjs`, live and gpu phases). GPU median 13.5 ms (bar 14),
    0 frames over 33 ms, main-thread JS p95 3.9 ms, 131 draws and 1.06 M triangles. F39 beside it reads 11.4 ms.
- **F36 (closer):** no linen-pale piece is left on the five (linen share 0.0-0.9 % each). In the cistern's shade they
  read dark and close in value to the basalt.
- **F37:** the same at its range. Oro's right shin still reads paler than the left.
- **F23-sickle:** the same at its range.

**Chrome used:** about 7.6 minutes over 5 launches: the boot 0.2, the rows 3.3, the two films 1.5, the IN11 read 2.6. Most of the session waited for the slot.

---

**Open after this check:**
1. **The shipped ledger: 60.94 MB against the 60 MB first-load cap** (the audio, 7c3e22f). Fewer or shorter files,
   streaming the hour's audio after the title, or a ruling on the cap.
2. No kept row covers the Sickle's hulls and sockets. Its geometry changed in 665de98.
3. F44's lens cannot stand on her right, so the frame does not look along the Scar's line. F42 does not show the hook-rip.
4. F39-people frames the people at the cost of the fight. It is a cost frame now, not a look frame.
5. The audio has a model's loudness only. A capture of real play and a listen are still owed.

## Polish run 3: the first-load cap, the M2 frames (Nov 20 2026)

Two polish lanes worked in the one tree on `r5/int` beside the M2 fix wave 2: audio + size (the first-load cap) and
frames + Oro. Two skeptics then tried to refute the size fix; one refuted it, and the size lane fixed what they found.
No commit was pushed. Every number below was taken at the named commit from a clean detached worktree.

**Why.** The polish-2 check at 2944784 found Tier 0's shipped ledger over the first-load cap (60.94 MB of 60), after
the M2 audio added 1.50 MB. The ledger counted every file as first load. The rule for this run: do not raise the cap and
do not just drop files from the count; make the game defer what it can, make the ledger count what really loads first,
and prove it with a row in the built game.

### The first-load cap

- **The first hour's sound loads after control (c997201, 8940788).**
  - Each audio manifest row has a load phase (`load: 'late'` in `src/audio/m2/cues.js`). Every first-hour row is late
    except the Kit Rack's three UI clicks, which she can need the moment she has control.
  - `src/audio/manifest.js` exports `DEFERRED_FILES` from that same field. `SampleBank.load()` fetches the boot rows
    only; `loadLate()` fetches the rest once play has started, ranking the place she is in and its beds first.
    `bank.lateAudit()` logs every ask for a late set against its decode.
  - At c997201 the late bank waited 0.3 s of the clamped frame clock and started 0.86-1.03 s after control. At 8940788
    it waits 3 frames of play.
  - The shipped ledger (`tools/tier0/budgets.mjs`) reads the deferred set through `budgets.json` `shipped.deferred`
    from the game's own module. It keeps no file list of its own, and a deferred file missing from disk fails it.
  - New row **`P-boot-transfer`** (`tools/perf/boot-transfer.mjs`): the built game with the cache off, from page load
    to control, for New Game and for Continues at Holds saves. It lists every file fetched before control and every
    shipped file that was not.
- **Two skeptics.** One found the fix honest (one deferred list shared by the game and the ledger; nothing else fetches
  audio; no audio file changed). The other **refuted** it: a Continue at `seal-1` or `seal-2` re-spawns the Screed
  beside her and it charges on its first step, before any late row can load, so the charge's tell was silent. No row
  covered those saves.
- **The fixes (c0dbe85, 20679b6, a26ac81, 04ca02f, f0e9c14, 0fac189).**
  - **Every tell loads before control** (c0dbe85). The Screed's charge and the trample's wind-up are boot rows
    (+28.9 KB). `late-bank.test.mjs` holds every `tell` row and every wind-up in the attack table to the boot set.
    The late bank fetches a machine kind within 160 m of her first.
  - **The boot row clicks as a player does** (mouse clicks, not DOM clicks) and adds a Continue at `seal-1`.
  - **One unit for one cap** (20679b6). The ledger graded 60 MiB and the boot row 60e6 bytes. Both now grade decimal
    MB, the stricter reading. In that unit the ledger at c0dbe85 read 62.38 MB, over the cap.
  - **The ledger counts what a New Game really fetches first.** The Holds people that the game spawns by distance
    (`HOLDS_CAST` less the archetypes staged at boot: oro, pit-farmer-2, pit-farmer-3, tiller-follower-2,
    cochineal-picker-2; 6.49 MB) are read from the game's own lists as a second kind of deferral (`region`). The boot
    row proves New Game fetches none of them before control. To let Node read those lists, the three id lists moved to
    `src/world/npc/people/ids.js`, and `index.js` re-exports them under the same names. This is the smallest change in
    the people lane's path; no value changed.
  - **The total cap is back at M1** (110 MB). c997201 had moved `budgets.json` `exit` to M2 (165 MB); that switch is
    for the M2 exit.
  - **The charge was still silent at a26ac81, for two more reasons** (04ca02f, f0e9c14):
    - The first hour's sound director only bound its listeners once the whole boot bank had decoded.
    - The boot bank only started at the first click, because the title's key handler consumes its keys in the capture
      phase. `GameAudio` now arms on pointerdown and keydown in the capture phase, so the boot bank loads from the
      title's first key, tells first, and the director binds at once.
    - With the boot bank in before control, the 3-frame count fell 7-14 ms before the row's control frame, and New
      Game asked for four late beds before it. The count is now of animation frames from the game-start event.
  - The boot row's fourth page in one browser stuck on the title for 180 s (at 20679b6 and 04ca02f). Each case now has
    its own browser; the cause was not found.
  - `A-audio-slice-live` had been failing since about c997201 (it read 220 of 224 rows the moment the boot bank was
    in). It now waits for the late bank (0fac189).

**Acceptance.**
- **Shipped ledger: PASS, 55.88 MB first load against 60** (decimal MB; the boot set plus the built code). The total is
  63.91 MB against the M1 cap of 110 MB. The margin is 4.12 MB.
- **`P-boot-transfer` at f0e9c14: PASS** (run `20261120T063517Z-f0e9c14-boot-transfer`):

  | case | fetched before control | files | deferred before control | frames over 33 ms after control |
  |---|---|---|---|---|
  | New Game | 49.82 MB | 265 | 0 | 0 (worst 10.3 ms) |
  | Continue at `stall` | 51.50 MB | 270 | 0 from the late bank | 1 (50.9 ms) |
  | Continue at `plumb-2` | 51.34 MB | 267 | 0 from the late bank | 0 (worst 17.7 ms) |
  | Continue at `seal-1` | 51.50 MB | 270 | 0 from the late bank | 1 (41.7 ms) |

  - New Game: 0 sets asked for before they decoded. The late bank was done 0.31 s after control; its lead over the
    earliest she can sprint to each place is 15.8 s (the Holds) to 42.3 s (the Malpais edge).
  - `seal-1`: the Screed's charge is heard. No tell and no one-shot was missed in any case.
  - A Continue inside the Holds still asks for the Holds' and Ninewalls' beds and the forge fire 0.02-0.32 s before
    they land. These are fade-in loops; they are reported, not graded.
  - The two Continue frames over 33 ms are not attributed.
- **Sound rows at 0fac189: 7 of 7 pass** (run `20261120T070246Z-0fac189-audio-live-final`). `A-audio-hour-live`
  (late bank 58 of 58, 1.458 MB, 0 missed), `A-audio-slice-live`, `A-audio-gust-live`, `A-audio-walk-graph`, and the
  kept rows A58b, A73d and A76.
- **Tier 0 10/10** (8940788, and by the lane's report at f0e9c14 or earlier). **Slice 14/14** at 8940788 and f0e9c14.
  Between f0e9c14 and 0fac189 only `tools/gates/audio/live-rows.mjs` changed; Tier 0 and the boot row were not re-run
  at 0fac189.
- **Shrinking the audio: measured, not shipped.** The stereo ambience beds at 64 kb/s instead of 96 would save 0.70 MB
  in all, 0.37 MB of it from the first load. Against the source by 1/3-octave bands, the long-term worst band moves
  from 0.69 to 1.16 dB, and the frame p95 from 0.66-1.22 to 1.02-1.87 dB. Not recommended for the music. Run
  `20261120T0320Z-c997201-audio-shrink`.

### The frames and Oro (59c0775, 7827ece, 8572260, ae301bb)

F44, F42 and F39-look were filmed at 8572260 in two takes; F37, F02, F03 and F25 at 7827ece. 0 console errors. The
comparison is with the polish-2 check film at 2944784.

- **F44: PASS, closer** (80.4 % of pixels changed; the two takes differ in 0.4 %).
  - She stands 6.9 m down the Scar's line from the benchmark, at (7.2, 287.0), still facing 249. The lens is 0.9 m
    over its ground behind her right shoulder, clear of the benchmark block, looking along 225, 21 deg down.
  - The Alidade is at her face (tube 0.015 m from her eye, weight 1.0).
  - The planted Windwall reads: 16,064 px at luminance 52.6 against 114.1 behind.
  - The Peg is on her line: 0.1 m off it, 19.0 m out, 1,399 px.
  - Her feet are in frame (her box to y 857 of 900; at 18 deg down they were cut off). The Scar runs to the sea.
  - Seen from behind her, the Alidade at her eye is hidden by her head and the bow.
- **F42: PASS with a caveat, closer** (69.5 % changed).
  - The hook-rip is held mid-pull: phase P, k 0.496, t 0.399 of 0.40.
  - The Sickle has no tearable parts, so the staging hooks its hub bearing (its weak point between the blades). The
    tip is 0.03 m off the hub horizontally but 0.16-0.23 m above it, so it reads at the hub's nose, not in it.
  - The hull stands 2.07 m from her.
  - The pull does not read as made by her body: she stands upright with the haft low.
  - The two takes differ in 52-55 % of pixels (the Sickle's legs stand differently, and the grass): the staging does
    not freeze the same picture twice.
- **F39-look (new): FAIL on the fight.**
  - All five people are in the lens at 36-92 px tall, which is readable.
  - The Screed is 19 px on the skyline and one Sickle 9 px. Brea is not drawn because wall-1 hides her. The first
    lens (7827ece) was worse: people 14-44 px, the Screed 35 px in the corner, Brea 6 px.
  - A sightline search over the walls' and houses' colliders found no lens that shows both well. The game shelters the
    people 73-86 m from the fight, and the fight is outside wall-1, 30-35 m above them.
  - From this lens, 16 m over the south-west doors, the near house and the well show their bases as hanging wedges
    where the slope falls away, and read as floating.
  - F39-people stays the cost frame for IN11.
- **Oro's shin (F37): PASS, closer** (10.7 % changed, 6.9 % outside her).
  - The pale piece was the knee patch on his left leg (screen right, so the reviews' "right"). It was #6E675C, twice
    the trousers' value; it is now #2C2926.
  - In F37 the knee band's luminance went from 67.5 to 41.0, the shin below it 38.5, his other shin 24.8 (in the
    apron's shadow). `oro-sheet.test` and `holds-cast.test` pass 5/5.
  - `public/models/npc/oro.glb` takes only the rebuilt outfit base image (1,429,068 -> 1,428,716 bytes). A full
    rebuild here re-encodes his other five images from WebP to KTX2 (1.43 -> 2.59 MB) and rebuilds the other Holds
    GLBs; this commit does not take that.
- **F02, F03 (accepted) and F25: the same.**
  - F02: 9.6 % changed (5.3 % outside the sky mask and her); against the anchor 23.8 % (polish 2: 22.7 %).
  - F03: 12.2 % (6.5 % outside her); against the anchor 39.5 % (40.7 %). F25: 0.6 % (0.03 % outside her).
  - Only her idle and her cloth differ (wall clock).
- **Kept rows at 8572260:** A1-boot-clean and A20b-no-system-errors pass. No kept row covers the stagings.

---

**Open after this run:**
1. **F39-look:** no lens shows both the sheltering people and the fight. It needs the people staged nearer the fight
   or a ruling that the frame is two frames. Its lens shows the near houses' and the well's bases floating over the
   slope.
2. **F42:** the hook sits on the hub's nose, not in a part (the Sickle has no tearable parts); the pull is not made
   by her body; two takes differ in more than half their pixels.
3. **F44:** the Alidade at her eye is hidden from the lens behind her.
4. **A Continue inside the Holds** asks for its beds and the forge fire 0.02-0.32 s before they land (loops, not
   graded). Its first frames after control hold one frame over 33 ms (50.9 ms at `stall`, 41.7 ms at `seal-1`),
   not attributed.
5. **The ledger's margin is 4.12 MB.** A full rebuild of Oro's model would add about 1.16 MB (WebP -> KTX2). The
   64 kb/s beds (0.37 MB of first load) are measured and held back.
6. Tier 0 and the boot row were not re-run at the final commit 0fac189 (only a live-row tool changed after f0e9c14).
7. The boot row's stuck fourth page (one browser, four cases) is worked around, not explained.
8. Still open from polish 2: no kept row covers the Sickle's hulls and sockets.
