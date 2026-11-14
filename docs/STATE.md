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

## Next, in order

1. Boot `r5/int` in the gate browser and close BACKLOG I10.
2. Merge the newer checkpoints of world-ground, world-sky, world-props and look-post (BACKLOG I7).
3. M0.4 Frame Set tooling, then M0.5 the baseline run of F01–F32.
4. M0.6 Tier 0 checks as Node scripts, with the name lint and its allow-list; bring the lint to 0.
5. M0.12 re-stage the 77 kept-stack rows on the turntable and the island; run them.
6. M0.7 the three.js upgrade, against the full carried gate file before and after.
7. M0.8 frame-cost attribution on F02, F23 and F32.
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
