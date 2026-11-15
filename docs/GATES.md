# CALIMA — GATES

The rows that gate work on `r5/int`, and when each one runs. This file is frozen at the start of each milestone
and changes only at a freeze. Findings outside it go to [`BACKLOG.md`](BACKLOG.md).

Current freeze: **Milestone 0 (Reset)**.

## 1. Three tiers

| tier | what | when | blocks |
|---|---|---|---|
| **0 — machine checks** | build; one headless boot with no console errors; name lint at 0; licence manifest against the files on disk; path-ownership check; asset budgets, summed resident texture memory and shipped size, all read from files; import graph; `node --test` for pure logic. **No frame timing.** | every merge to `r5/int` | the merge |
| **1 — frames and behaviour** | the Frame Set (§4); each area's frozen behaviour rows, at most 12 per area; **and the 77 kept-stack rows (§3) whenever a merge touches the kept stack** | frames and area rows after each merge batch; kept-stack rows *before* such a merge lands | acceptance of the area's milestone item; for the kept-stack rows, the merge itself |
| **2 — engineering** | frame time in the three timed frames (F02, F25, F32); the crash family; page-wide allocation; video memory; LOD pops; clipping matrices; the kept-stack rows again, whatever was touched | nightly on a quiet machine, and at each milestone exit | nightly: a frame more than 10 % slower than the last nightly opens a blocker on the merge that caused it. Milestone exit: the absolute frame bar |

**The frame bar** (milestone exits only): 95 of 100 frame intervals inside 16.7 ms, CPU and GPU together, and a
median GPU frame of 14 ms or less, at 1600 × 900 (DPR 1.25) on the reference laptop. A merge is never held to the
absolute bar; it must only not be more than 10 % slower than the last nightly number.

**The kept stack** is `src/entities/**`, `src/hero/**`, `src/core/collision.js`, `src/core/input.js` and the
three.js version.

**The content rules of [`BIBLE.md`](BIBLE.md) §19 are checked at every tier.** A breach is a blocker whatever
else a row says.

## 2. Freeze rules

1. The row list and the Frame Set are frozen at the start of each milestone in this file.
2. A judge grades only frozen rows. Anything else it notices goes to `BACKLOG.md` with a severity.
3. Three things may enter mid-milestone: a regression of something that already passed; a breach of a hard rule
   (content rules, licence, an animation bar of BIBLE §5.2, a crash); a change of direction.
4. Bars neither loosen nor tighten mid-milestone.
5. Severity words: **blocker** (hard rule, crash, regression) · **major** (a frozen row fails) · **note** (backlog).

**Order of work inside an area.** Blockout frame → look accepted → behaviour rows → Tier 2 budgets.

**Running rows.** Rows that need a browser run through the one shared gate browser, one session per build, with
an explicit row list and an explicit port. Lints, licence, budgets, static checks and logic tests run in Node.

## 3. The kept-stack rows (77, plus climb, slide and mantle)

These guard the rig, the movement stack, the bow pose, the camera, save and the crash family. They are staged on
the island (named places, Instruments by role) or on the gate turntable (`tools/gates/turntable.mjs`); none needs
the photo studio. The list, the stage of each row and the re-staged versions of the rows that used to drive
the studio or a deleted host live in `tools/gates/kept-stack.mjs`. Run them, and only them, with

```
node tools/gates.mjs --port <p> --kept-stack [--only <ids>]
```

In that run the runner takes the studio out of every page before the row starts and fails any row that reads
`ctx.studio`. Rows whose only problem was where they stood carry a staging patch there (`PATCHED`): the row's
own assert with its staging lines swapped, applied by exact text, so a later edit that moves those lines turns the
row red instead of running the old staging. The re-staged rows (four on the turntable, A22 on the island) keep their ids and bars and replace the
registered rows only in this run: the
full carried suite (`tools/gates.r5.carried.mjs`, studio and all) stays runnable until the engine upgrade (M0.7) and
the animator split (M1.3a) have both passed against it. After that (R4b) the carried file is cut to exactly these
rows and the studio is deleted.

### A. Carried rows (51)

| id | stage |
|---|---|
| `A1-boot-clean` | island |
| `A2-dodge-displacement` | island |
| `A4-draw-strength` | island |
| `A5-arrow-fired-event` | island |
| `A6-machine-foot-plant` | island |
| `A9-perf-budget` | island — re-timed to the frame bar of §1 |
| `A18-slope-conform` | island |
| `A18b-slope-conform-moving` | island |
| `A20-frame-loop-survives` | island |
| `A20b-no-system-errors` | island |
| `A22-msaa` | island: the shipped tier's AA chain measured on Brea against the sky (the lane row needed the deleted Pans POC host) |
| `A22b-fov-recompile` | turntable: the lens holds the spawn-vista view and changes only the FOV |
| `A25b-nav-and-occlusion` | island: the sightlines use the nearest trunk-shaped occluders to her (the valley's trees are gone) |
| `A28-jump-arc` | island |
| `A28b-canon-speeds` | island: runs along a flat 28 m lane, not from a flat point up a grade |
| `A29b-slope-no-ghost` | island |
| `A30-dodge-window` | island |
| `A32b-lookup-no-ghost` | island |
| `A43-corpse-lifecycle` | island: the carried row (staged by role); instruments-core's shadow no longer applies |
| `A44-socket-integrity` | island |
| `A44b-socket-vertex-integrity` | island |
| `A45-no-skate-per-species` | island — re-keyed by Instrument role |
| `A45b-stance-report-integrity` | island |
| `A45c-foot-continuity` | island: planted Instrument feet read through `debugFeet()` (the handle rig it read ran only on the deleted legacy kinds) |
| `A46-ground-truth` | island |
| `A47-corpse-grounded` | island |
| `A47b-corpse-posed` | island |
| `A48-cadence` | island |
| `A50-hulls-visible` | island |
| `A50b-aim-on-drawn-geometry` | island |
| `A53-conc-not-on-sprint` | island |
| `A56-cascades` | island |
| `A58b-surface-audio-world-ground` | island |
| `A59b-cover-honesty-world-ground` | island |
| `A59c-mask-coherence-world-ground` | island |
| `A60-stealth-lanes` | island |
| `A68-no-softlock` | island |
| `A70-hub-tabs` | island |
| `A70c-title-flow` | title screen |
| `A71d-conc-veil` | island |
| `A71g-tracker-live` | island |
| `A72-settings-persist` | island |
| `A72b-accessibility` | island: the palette clause reads `--cal-c-staff`, a token the palettes re-point |
| `A73d-ui-bus` | island |
| `A74-3d` | island |
| `A78-cast-states` | turntable: the hold is `forceState` plus the pinned perception fields; no panel |
| `A79-time-authority` | turntable: the freeze is the engine time authority's top source |
| `A79e-pose-overlay-frozen` | turntable: a lens at her face drives the animator's own look-at; with the world frozen no bone the animator names may walk (eyes and lids once the rig has them; M0.11) |
| `A79-runner-verdict-line` | node (runner row, no page) |
| `A80-chrome-profile-hygiene` | node (runner row, no page) |
| `A81-canon-speed-bands` | node (runner row, no page) |

### B. Re-staged rows: rig, bow pose, camera, save, crash family (26)

| id | stage |
|---|---|
| `A3-sprint-speed` | island |
| `A11-idle-alive` | island |
| `A15-foot-flat` | island |
| `A16-draw-anchor` | island |
| `A17-draw-beats` | island |
| `A107-draw-arm-path` | island |
| `A28-run-cadence` | island |
| `A31-aim-strafe-skate` | island |
| `A31-crouch-aim` | island |
| `A31b-aim-strafe-skate-player-anim` | island |
| `A32-draw-ramp` | island |
| `A25c-camera-vs-machine` | island |
| `A61-colliders-registered` | island |
| `A65-save-restore` | island |
| `A76-footfalls` | island |
| `A78-loop-reclaim` | island |
| `A90-memory-stability` | island |
| `A90-rig-reclaim` | island: the carried row (staged by role); instruments-core's shadow no longer applies |
| `A90b-memory-attribution` | island: the carried row; its allocation sweep no longer names the absent studio as a root |
| `V1-sprint-frame` | island |
| `V2-idle-frame` | turntable: open ground, reeds hidden, a front three-quarter lens, frozen after 2.5 s of idle |
| `V3-crouch-stalk` | island |
| `V4-aim-anchor` | island: the aim on open ground with the reeds hidden |
| `V13-aim-strafe` | island |
| `V21-camera-cover` | island: the shot stands at the nearest trunk-shaped camera collider to her (the valley's trees are gone) |
| `V49-draw-from-jog` | island |

### C. Climb, slide and mantle (added to list B by id at M0.12)

| id | what | stage |
|---|---|---|
| `A-climb-1m` | mantle a 1.0 m ledge from a walk and a jog, and the trig-pillar steps | island |
| `A-slide` | a slide starts on cinder steeper than 28 deg and not on a 35 deg non-cinder face | island |
| `V-traversal` | ledge climb (pull frame), a cinder slide and a stepped climb, side views | island |

### D. Restated at the M1a freeze

Six rows measured something the build no longer has, or a target the canon has since replaced. Each keeps its id
and is restated below; every bar not named here is unchanged. The restatements live in `tools/gates/kept-stack.mjs`
(`RESTATED`) and replace the registered row of the same id in **every** run of `tools/gates.mjs`, kept stack or not.
Four are exact-text swaps on the registered row's own assert, so an edit that moves the swapped lines turns the row
red instead of running the old bar; two are whole rows.

| id | was | now | why |
|---|---|---|---|
| `A16-draw-anchor` | at full draw in each of its 20 cells (four pitches, both clamps, strafing, crouched): wrist ≤ 0.09 m and middle knuckle and fingertip ≤ 0.06 m from the nock; elbow not above the shoulder (aim frame, and character height at pitch 0); arm clear of the head (≥ 0.98); arrow within 0.3° of the crosshair ray | the same cells and instant: the string hand's **index knuckle within 0.03 m of the jaw-corner anchor**; the string's nocking point within 0.03 m of the string fingers' hook (index and middle first joints, midway); **elbow at shoulder height or behind** (aim frame −0.03 to +0.05 m of the shoulder, and ≥ 0.05 m behind the wrist along the arrow); **no hand vertex inside the wrap volume**; no hand or forearm point behind the head; arm clear of the head (≥ 0.98) and the launch clause unchanged. The wrist, knuckle and fingertip distances to the nock and the old elbow reads are still reported | The bow pose of BIBLE §13 puts the draw hand at the cheek: the string sits in a hook of the fingers and the knuckle on the jaw-corner anchor, which holds the wrist 0.09–0.12 m from the nock by design. The row measured that geometry against the old anchor (it failed only on the wrist distance, crouched). Measured with the aim rig's own function (`tools/gates/aim-rig/measure.mjs`). The elbow band is the rig's: it replaces "not above the shoulder (≤ 0)" with "level (−0.03 to +0.05 m) and back" |
| `A32-draw-ramp` | through the draw ramp (draw 0.05–0.9) and at full draw, the wrist ≤ 0.09 m from the nock; at full draw the hand joint ≥ 0.88 of the head ellipsoid's radius (not inside the skull) | the string fingers' hook ≤ 0.03 m from the nocking point at the current draw on every step of the ramp and of the full draw; at full draw the index knuckle ≤ 0.03 m from the jaw-corner anchor; from draw 0.05 on, 0 hand vertices inside the wrap and 0 hand or forearm points behind the head. The hand joint's head-ellipsoid reading is reported | The same hook: the string travels in the fingers, not at the wrist; a hand resting on the cheek is graded by the wrap volume and the anchor, not by the hand joint's depth in an ellipsoid |
| `A-draw-elbow-level` (area row, restated with them) | among its clauses: middle knuckle and fingertip ≤ 0.06 m from the nock; at the no-strafe pitches the wrist within 0.03 m of the level draw's height over the head joint and of its place in the head's frame | middle knuckle and fingertip replaced by the index knuckle ≤ 0.03 m from the jaw-corner anchor and the string ≤ 0.03 m from the fingers' hook, and 0 hand vertices in the wrap, at every row; the wrist-at-the-level-place clauses are reported (the anchor is a fixed point on the head, graded at every pitch). Every elbow, chest, behind-the-head, loose, per-step and crouch clause is unchanged | The same hook |
| `A70-hub-tabs` | each of the seven hub keys opens its tab, the K tab (skills) included, with a panel or a rendered body | as before for M, J, I, O, N and the comma; for K: the hub stays open on the skills tab for 38 frames after the key, with no console error, no menu warning and no page error | The Skills screen of BIBLE §18 (the certification net) does not exist yet and the canon has no skill tree; the old row asked for a screen that is not there. What must hold now is that K neither bounces the hub to the map nor throws |
| `A56-cascades` | three cascades, near texel ≤ 2 cm, casters culled beyond 120 m, and the old valley's grass and bush meshes (`grass-chunk*`, `bushes-*`) casting | the cascade, texel and cull clauses unchanged; the plant clause names the island's plants: the three meadow rings (`meadow-blades`, `meadow-clumps`, `meadow-cards`) and the flora kinds (`marram-near`, `glasswort`, `lavender`) are all present and **none of them casts**, and the field's dyke stones (`pan-dykes`) cast | The valley meshes are gone; on the island grass never casts by the engine's shadow-caster rule (each plant mesh is built with `castShadow = false`), and the dyke stones are the low casters near the ground |
| `A71d-conc-veil` | a desaturating, cool-tinted veil element (`#cal-veil`) ramps in on Steady and out after | Steady while aiming (Shift): a hairline breath meter (≤ 4 px) 20–120 px under the reticle is visible while it is held, drains with the gauge (within 0.06) by more than 0.08 over 2.6 s, and is released after; no veil element, no full-screen overlay, no filter on the game canvas | The shipped HUD shows Steady as a hairline breath meter and has no veil by design. This is the HUD lane's own replacement row (it never ran: its file does not load), under the kept id |

`A44`, `A44b`, `A107` and every other kept row are unchanged.

**A measurement re-registered with the Frame Set (M1a round 2; not a bar change).** M1.1g's F02 palette line reads
five named regions of the frame against the same-named regions of its crop (`tools/look/m11-accept.mjs`). Its frame
boxes were placed for Frame Set v1's F02 camera; v2 re-staged F02 (the pans with the Ring in frame), so the boxes no
longer covered what they are named for (the sun-side sky box 25 deg from the sun, the sky-away box on the cloud above
it, the shade box on the sunlit pans). They are re-registered by content: the two sky boxes keep the crop box's offset
from the crop's sun, scaled by the image width; haze is the horizon haze over the sea; foreground is the lit meadow;
shade is the Ring rise's slope on the side away from the sun. The crop boxes, the ΔE2000 rule and the ≤ 12 bar are
unchanged, and `--f02 v1` still reads the old boxes.

## 4. The Frame Set (Milestone 1)

Each frame has a fixed camera, hour, weather and state. A frame is judged by comparison: is today's frame closer
to its target than the last accepted frame, on four points (silhouette and proportion; material and surface;
light and colour; finish)? An accepted frame becomes the anchor, and a later run that is further on any point is
a regression. A frame with a written target is accepted when every count and measure in the target is met.

The machine-readable set is `tools/frames/frameset.json`: version 2 at the M1a freeze re-staged F02, F03, F13,
F14–F19 (and their bar clips) and F32; each change and its reason is in `tools/frames/README.md`. A re-staged frame
is compared with its anchor knowing the camera moved: the review page labels it.

| frame | subject | in |
|---|---|---|
| F01 | title screen | M1b |
| F02 | **the Pans at golden hour: the hero frame**, plus a 10 s walking clip | M1a |
| F03 | exploration with the HUD, Brea from behind | M1a |
| F04 | the Pans at noon, salt and black sand | M1a |
| F05 | sea skyline at dusk: stacks, the Ring, glitter path | M1a |
| F06 | calima at noon | M1b |
| F07 | Saltrow at night, lamps | M1b |
| F08–F10 | Brea front, side, back at 2.5 m, flat light | M1a |
| F11–F13 | Brea's face: front, three-quarter, profile | M0.11, then M1a |
| F14 | idle | M1a |
| F15 | run, side-on, mid-stride | M1a |
| F16 | full draw, side-on | M1a |
| F17 | full draw, over the shoulder | M1a |
| F18 | crouch-moving aim | M1a |
| F19 | lance heavy at contact | M1a |
| F20 | Ansel beside Brea at 3 m | M1a |
| F21 | three NPC faces | M1b |
| F22 | a Saltrow street at golden hour | M1b |
| F23 | the Instruments with Brea at 6 m, scored kind by kind: Plumb in M1a; Peg and Gauge in M1b | M1a, M1b |
| F24 | the Plumb in the meadow, Brea aiming | M1a |
| F25 | the Plumb toppling on the dyke with its Peg swarm rushing (timed) | M1b |
| F26 | Sighting on the Gauge | M1b |
| F27 | map | M1b |
| F28 | Making ledger | M1b |
| F29 | Character page | M1b |
| F30 | resting at the Brazier at dusk | M1b |
| F31 | Reed cover by the Glass | M1b |
| F32 | aerial, from a debug camera at 120 m over T1 looking NE across the whole island (timed) | M1a |

**Written targets.**

- **F07.** At 21:00 from the breakwater: at least 14 lit windows and the breakwater lamp; no pixel of sky brighter
  than the brightest window; walls readable as white by lamp spill within 6 m of a window and falling to
  silhouette beyond; frame mean luminance 4–9 %.
- **F22.** From the ramp looking up the main street at 18:40: at least 9 buildings in three lime-wash tones,
  4 violet balconies, 2 bougainvillea, 2 salt cones, 5 people at work, the guild bell; warm sun on the left faces
  and violet-rose shadow on the right; no two adjacent buildings with the same roofline height.
- **F25.** Brea in the foreground third with the bow raised; the Plumb mid-topple, legs splayed, bob swinging; at
  least four Pegs in the frame; the vermilion line on the dyke behind; low sun.
- **F31.** Brea crouched in pale carrizo at the Glass rim with a calm Plumb 15 m beyond; the canes taller than her
  and leaning SW; her violet visible through no more than a third of the stems; water in the lower third.
- **F32.** Measured only: draws ≤ 350, triangles ≤ 6.5 M, the frame bar of §1, no chunk of missing terrain, no LOD
  seam wider than 2 px.

Later milestones add frames at their freeze: the first Screed fight, each armour rung on the turntable, the kite
in flight, the Kiln and Transit scale frames, and each biome's vista.
