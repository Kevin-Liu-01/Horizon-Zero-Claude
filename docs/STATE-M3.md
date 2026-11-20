# Milestone 3 state (branch r5/m3)

Milestone 3 works on its own branch until Milestone 2 exits; this file joins docs/STATE.md then.

## Milestone 3 wave 1: the grey blockout (Nov 20 2026)

Wave 1 of Milestone 3 ran on its own branch, `r5/m3`, branched from `r5/int` at ddc31c1, beside the Milestone 2 fix
wave and exit run. Milestone 2 has not exited. The defaults of the M3 brief's open questions apply: wave 1 starts now
on its own paths (Q2); the four new Instruments are shown as grey silhouettes first (Q3); two Kilns stand at the Yards
with one awake (Q4).

Four lanes worked in the one tree: A (the Malpais and the Kiln Yards), B (the Survey Kite), C (the Kiln, Spindle, Davit
and Sonde), and E+F (hour two's runner, regions, the region hitch). Each had one builder turn, one judge and one fix
round. Nothing was pushed, and nothing reached `main` or `r5/int`.

The review was taken at **2336356** in a clean detached worktree with its own Vite cache, in one Chrome session of 13.4
minutes. Every number below names its commit.

**Verdict: NOT CLEAN.** Nothing regressed, but the wave-1 exit is not met (see "Open" below).

### Gates at 2336356

- **Tier 0: PASS.**
  - Node checks: 8 of 8, with 380 tests passing and 0 failing in 70 files. Five rows are todo; each is a failing bar
    waiting on a ruling.
  - Boot ready in 4.3 s with 0 errors. Rendered-page name lint: 0.
  - First load: 55.9 MB of 60, with 0 Malpais bytes. `public/` is 59.38 MB. Texture ledger: 137.33 MB of 175.
- **`vite build`: green**, 4.33 MB of code.
- **Kept rows the wave touches: 9 of 9 pass.**
  - The rows: A1, A20b, A3 (6.75 m/s), A28 (peak 1.50 m), A46 (worst 0.024 m), A61 (2,757 colliders), A65,
    A-climb-1m and A-slide.
  - They were chosen for the code the wave touched: the player's flight seam, the ground hook in
    `recipe.heightAt`, the Malpais colliders and the save field.
  - A65 passed on the runner's retry. Its first try timed out on a screenshot, which is the known flake (D10).
- **The slice: 14 of 14**, stopped at the reward, after 295 s of Chrome.
- **Accepted frames: no change from Milestone 3.**
  - F08, F11, F13, F14 and F19 match the film at e18e8a3 to within 0.001 % of their pixels.
  - Every other accepted frame is within its own repeat noise, except F09, F10 and F16. Against ddc31c1 those three
    differ only in her figure's outline or a sash panel.
  - The same differences appear between films of commits with no hero or cloth change (ddc31c1 against e18e8a3 and
    a45b567), so they are cloth state between sessions.
  - Ground the blockout moved outside a computed mask: 0 in every frame (a45b567).
- **Differences inherited from `r5/int` (ddc31c1), not from M3.** The owner should still see them:
  - F03's tutorial card;
  - Saltrow in F05;
  - F20 now stands in Saltrow's street;
  - the head turn in F08, F11 and F13 (Q1).

### Area A: the Malpais and the Kiln Yards (Node at 2336356 unless named)

- **The seams:** `src/world/sites/kilnyards-layout.js` (the wellheads seam) and `src/world/island/lift.js` (`liftAt`
  from the island's slope and aspect).
- **The blockout:** `src/world/sites/malpais*.js`, plus a hook in `recipe.heightAt` for the apron and the tube
  shelter's trench. It is built from code at boot (652 triangles; the Yards' far form is 2,984 triangles and 2 draws).
- **MP0, recorded:**
  - **Rust Cone:** its top is 145 m above the sea, read as an elevation (60.5 m over the saddle toward the Yards).
  - **The apron:** 48 x 20 m at 143 m.
  - **B5 and B6:** snapped 7.37 m and 16 m onto ground that can be stood on.
  - **The tube shelter:** placed at (179.2, -16.8), since the bible gives no place.
  - **The way to the Yards:** walked in from the west along the 143 m contour. The Scar does not climb to them.
- **MP5: PASS.**
  - Two tower stubs (26 m and 22.5 m), 4 flue stacks and 3 pipe racks.
  - Four wellheads in the mesh and four in the data, 0 m apart.
- **MP9: PASS** on the walks: 0 holes on 7 of 7, and 11 of 11 goals on the Yards' walk grid.
  - Ninewalls to the Yards is 304.2 m, 60.8 s at a jog.
  - The slow-ground half (aa at x0.8) is unmeasured: locomotion does not read `groundSpeedAt` yet.
- **MP10 at 2336356:** F56 drew 71 calls and 0.36 M triangles; F57 drew 70 calls and 0.49 M. The GPU medians, at
  a45b567: F57 9.1 ms and F56 7.5 ms.
- **MP11: PASS.** 0 bytes are shipped, and 0 are in the first load.
- **A-trig-pillars: PASS.** The nearest sight ray passes 2.54 m clear.
- **A-world-size: FAIL**, the same at e18e8a3, before area A. The pooled terrain bake is not byte-identical to the
  single-thread bake.
- **F56 is not staged.** From the Scar's upper end no bearing shows the Malpais ground: at best 7 % of the frame.
- **F57:** the stacks and wellheads can be counted. The stubs still read as heavy blockout.
- **F58:** six cones and B6's post can be seen.

### Area B: the Survey Kite (Node at 2336356)

- **The seams:** the flight state on the player (`player.flight`, `player.kite`) and the flight law in
  `src/game/kite/flight.js`, which steps on area A's `liftAt`.
- **The kite:** a grey box-frame kite (`src/entities/anim/kite/greyKite.js`), 464 triangles and 1 draw, on the hang.
  The hang's bar now stands 0.32 m in front of the clothed chest (`hangPose.js`, the smallest change).
- **KF0, recorded:**
  - **T1 to the Ring:** 164.22 m. Holding the track the glide is 5.62:1, so it needs 29.22 m of height. A legal launch
    (a jump off the pillar, 14.78 m) has 9.25 m.
    - She lands 81 m from the Ring's centre.
    - Area A's lift rows agree on the landing. They read 31.7 m "needed" because they measure to the Ring's near rim.
  - **The Scar:** a drop of 99.8 m against the 74.7 m a downwind glide needs.
  - **60 m over the Pans:** reachable from T3, T4, T5 or T6. F51 is a glide off T2 at 20 s, 57.4 m up.
- **Passing rows:**
  - **KF1, the static hang:** wrists 0.327 m in front of the head plane and 0.114 m under the head bone, elbows
    0.049 m under the shoulders, the bar at 0.25 of sternum-to-chin.
  - **KF2:** still air 5:1, downwind 6.47:1, upwind 3.53:1.
  - **KF3.**
  - **KF4:** the open takes 500 ms and the fold 350 ms.
  - **KF5:** grounded in calima and squall, 0 of 10. It is brought down within 5 s from up to 80 m.
  - **KF6:** 0 damage at 3 m/s or less. She ends at or inside the 1.1 m contour.
  - **KF7:** the post counts. The caldera road streams 6 of 6.
  - **KF8.**
  - **KF9:** the budget.
- **Failing, each waiting on a ruling:**
  - KF5 from 200 m: 10.0 s against 5 s, and 13.1 s from 275 m.
  - KF7, the Organ Shelf road: 0 of 5 posts stream. No face of the shelf near T1 reaches the law's 25 deg (the steepest
    is 23 deg).
  - KF7, the Scar road: 0 of 7 posts stream. It runs straight downwind.
- **F51's cost at blockout:** median GPU 12.3 ms against the 14 ms bar, with 127 draws and 1.49 M triangles. This is
  the M0.8 back-to-back readback at 2336356, taken by the kite lane; the review read its record.
- **F52:** filmed side-on at about 4.6 m. The hips still keep the idle's turn.

### Area C: the Kiln, Spindle, Davit and Sonde (Node at 2336356)

- **The seams:** Clouded in `src/combat/status.js`, and `reseat(part)` on the hit-parts seam in
  `src/instruments/lib/kindkit.js`.
- **The forms and rules:** `src/instruments/kinds/{kiln,spindle,davit,sonde}/{form,rules,cues}.js`. They are not
  registered in the game and add nothing to the first load.
- **Rows: 10 of 10 pass.**
  - **IK1:** heights 5.50 / 3.80 / 4.20 / 3.00 m and triangles 2,932 / 2,336 / 3,536 / 1,156, read from the grey
    recipe's GLBs.
  - **IK2:** the door's stagger lasts 2.017 s. Brine on the hot door springs it 10 of 10 times, a cold door or anywhere
    else 0 of 10. The damage ratio is exactly 1, through `Machine#takeDamage`.
  - **IK3:** the Kiln stands 556.6 s plugged and turns 0 while plugged. It chooses a quenched wellhead 0 of 479 times.
    With all four quenched, 0 Kilns spawn in 24 site-clock hours.
  - **IK4:** 167 volleys, all of three shells. The shortest shadow and whistle lead is 1.418 s. 0 shells land in a
    ring or on a person.
  - **IK5:** frontal arrows deflect 10 of 10, from behind 0 of 10. Dust exposes the hub bearing for 2.017 s. The
    thrust reaches 9.0 m.
  - **IK6:** the re-seat takes 3.983 s.
  - **IK7:** the tether runs 17.95 m. A cut Sonde drifts within 1.33 deg of downwind and crashes by 50.9 s.
  - **IK8:** every state change carries a cue id, with 0 direct file plays. 35 ids wait for audio.
  - **Clouded.**
- **Row 0:**
  - The coupling stands 3.13-3.14 m from its wellhead at all four stands.
  - From 15, 20 and 30 m, 60 of 60 bow shots reach the tether.
  - The Sonde's mooring at the Ring is inside five accepted lenses (F02, F05, F09, F13, F24), so it must be masked by
    its swept volume.
  - Q4's default fails the encounter rule: two Kilns on one apron are at most 30 m apart.
- **The line-up page** was filmed at 2336356: six views, 0 console errors.

### Areas E and F: hour two, regions, the hitch (2336356 unless named)

- **The seams:** counted acts (`COUNTED_EVENTS`, `CountedActs` in `src/game/certs/rules.js`; 12 ranks from seam events
  alone, and 10 kills move 0 counters), `malpais` in `src/core/regions.js` (approached at 60 m on foot and 150 m in
  flight), and the save seam's `hour2` field. The runtime binds the regions tracker's mode to the flight seam.
- **HT0, at 29a32d6:** all 27 hour-two beats fail by name, from their fixtures and chained. Row 0 is recorded.
  - WALK THE LINE is offered at the start of hour two.
  - T3 is in sight from the Malpais edge and from the Yards.
  - The Gauge's tide is 600 s a period: 265 s to leave and 415 s to return.
  - The exit's two-leg launches do not fit 900 s: legs 4+5 come to 1,009 s and legs 5+6 to 1,129 s.
- **EF1 `A-region-hitch`: PASS at 29a32d6.** Holds to Malpais and Pans to Holds, each at a jog and at 10 m/s: 0 frames
  over 33 ms, and the worst is 31.8 ms.
  - The stand-in loader registers, compiles and waits before it adds.
  - The game's own region loader does not do this yet.
- **EF2, residency per place: PASS as the game runs today.** The worst place is 153.33 MiB of 175.
  - With the plan's lines added, the Kiln Yards and 60 m over the Pans come to 180.33 MiB: FAIL, until a region's
    files leave on its depart.
  - The Pan Houses atlases do not unload yet (NW11).
- **EF5:** computed masks exist for every accepted frame and the lane frames (a45b567).

### Open (why the wave-1 exit is not met)

1. EF4, the subject check before the shutter (rule 17), is not built.
2. The weather seam's `flyable()` is not committed. The flight law carries its own grounded rule.
3. The Sonde's swept-volume mask row is not written.
4. F56 is not staged on the Malpais ground.
5. Two seams of brief §3.2 have no file, because their owners were not in this wave: props in the hands (`heldNet`,
   `kiteBar`) and fauna.

### Rulings owed

1. Rust Cone's 145 m as an elevation.
2. F56's lens: move it 87 m south, or keep the Scar.
3. The T1 test flight is 20 m short with no lift on the Organ Shelf. Move the road, reshape the rim, or change the
   flight.
4. The Scar road is a downwind run, not a ridge.
5. KF5 above 80 m: 5 s plus (height - 80 m) / 24 m/s.
6. F51 at 57.4 m against 60, or a later freeze or another launch.
7. Q4: a plugged, still Kiln does not count, or the Yards have one Kiln.
8. Leg 5 against the Gauge's clock, and the exit's two-leg pairing.

## Milestone 3 wave 2: first look (Nov 20 2026)

Wave 2 of Milestone 3 ran on `r5/m3` from 034a602 (wave 1's blockout, with `r5/int` merged at 0c0ca36), beside the
Milestone 2 fix wave and exit run. Milestone 2 has not exited. The defaults of the M3 brief's open questions still
apply, and the orchestrator's provisional rulings R1-R8 were applied, each restated in the brief's wording with the
old text kept.

Four lanes worked in the one tree: A (the Malpais and the Kiln Yards), B (the Survey Kite), C (the four new
Instruments, forms only) and E+F (the subject checks, `flyable()`, the region loader, R8). Each had one builder
turn, one judge and one fix round. Nothing was pushed, and nothing reached `main` or `r5/int`.

The review was taken at **9d1acc3** in a clean detached worktree on port 5280. Chrome was shared with the Milestone 2
exit run, so the work ran in separate short sessions. Every number below names its commit.

**Verdict: NOT CLEAN.** No accepted frame moved. One kept row fails (A90b; see "Kept rows"), and the wave's look
items are not met.

### Gates at 9d1acc3

- **Tier 0: PASS.**
  - Node checks: 8 of 8, with 417 tests passing and 0 failing in 75 files.
  - Boot ready in 4.3 s with 0 errors. Rendered-page name lint: 0.
  - First load: 55.95 MB of 60, with 0 Malpais bytes. `public/` is 60.95 MB. Texture ledger: 140 MB of 175.
  - The boot's own transfer reads 90.03 MB in 649 requests. That is the dev server's unbundled transfer and is not
    the first-load ledger; no earlier boot recorded it to compare.
- **`vite build`: green**, 4.38 MB of code.
- **Kept rows the wave touches: 11 of 12 pass.**
  - Passing: A1, A20b, A3 (6.75 m/s), A28 (peak 1.50 m), A44 (worst gap 0 m), A44b (0.081 m of 0.1), A46 (worst
    0.048 m of 0.08), A61 (2,720 colliders), A65 (on the runner's retry after a browser relaunch: the known flake),
    A-climb-1m and A-slide.
  - **A90b-memory-attribution FAILS** at 9d1acc3: two owners hold objects off the scene after the corpse
    lifecycle, `src/entities/machines/machine.js:965` (36 objects) and `src/entities/machines/autorig.js:341`
    (27 skinned meshes), against a bar of 20. Heap +16.3 %; 0 orphaned textures. At 034a602, the wave's base, it fails the same way (32 and 24 held, heap +14.6 %), so it is inherited and not from wave 2. Whether it came in with the `r5/int` merge or with wave 1 was not bisected.
  - They were chosen for the code the wave touched: `src/hero/sockets.js` (the `kiteBar` row), the hang's move
    into `src/entities/anim/kite/`, the terrain's per-chunk ground program, the region loader in
    `src/core/engine.js`, and the Holds' cast tied to residency. A90-memory-stability and A100-A107 were not run.
- **The slice:** **14 of 14**, stopped at the reward, after 283 s of Chrome with 0 console errors and lowest health 88.
- **Accepted frames: no change.**
  - All 16 were filmed at 9d1acc3 and compared with the wave-1 review's film (2336356) outside the computed
    masks (a45b567). Each differs by less than its own repeat noise (F08 4 px, F11 0, F13 0, F14 98, F19 3; F09,
    F10, F15, F16, F18 and F24 under their same-session repeats).
  - F02, F03 and F05 match their anchors and are closer to their references than the 2026-11-14 refilm.
- **Subject checks (rule 17) on the M3 and EF4 frames:** 27 frames were filmed and 3 refused.
  - F58: the tube shelter's mouth is behind the lens.
  - F45: tower-b is 10 % in the safe area (the floor is 60 %), and Brea 59 % (the floor is 70 %). The near form
    now stands where its lens is.
  - F39-look: the Screed is 35 px against 60, the Sickles 12-15 px against 25, Brea 15 px against 40.

### Wave 1's exit items

1. **EF4, the subject check before the shutter: built.** 70 of 70 stagings declare subjects. The filmer refuses a
   failing frame and keeps a diagnosis picture (`--diagnose-unstaged`).
2. **`flyable()` on the weather seam: built.** It is false in calima and squall, and while a fade out of either
   still has the larger part of the sky. The flight law asks the seam (606 fade steps agree; 200 of them refuse).
3. **The Sonde's swept-volume mask: written, not proven.**
   - Geometry: in the six accepted lenses that see the mooring, all 2,684 projected Sonde vertices are inside the
     mask (radius 22.43 m about the shackle).
   - Pixels: 0 of 16 frames pass strictly, and 13 of 16 within their noise. F08, F11 and F13 change 53-570 px
     outside the mask, more than their repeats do (13-141 px). The Sonde is not in the game yet, so no accepted
     frame changes today. (ad2c01a; the mask files are unchanged since.)
4. **F56 on the Malpais ground: PASS.** At the ruled lens, (250, -130) facing 160 and pitched -20, Malpais ground is
   51 % of the frame and 5 of 7 hornitos pass.
5. **The props-in-hands and fauna seams:** `kiteBar` is typed in `src/hero/sockets.js`; `heldNet` and fauna are
   still not written (their owners were not in this wave).

### Area A: the Malpais and the Kiln Yards

- **Built on approach: PASS.** The Malpais is fetched, built in 5 ms slices, registered, compiled off the frame,
  then added. It is released on depart. `A-region-hitch` at 036b486 (real build): jog 11,245 frames, 0 over 33 ms,
  worst 18.6 ms; flight 8,453 frames, 0 over 33 ms, worst 25.2 ms. It was not re-run after 1c707aa's look changes.
- **MP1, cold ground: PASS.** The ground term and the rock write no emissive. Every layer texel is at most linear
  0.30. At night, in F56's lens, the brightest ground pixel sampled is 75 of 255 against 219 in the sky.
- **MP2, two lavas: aa, pahoehoe and cinder bands are present in F56.** The 20 m tile-repeat measure is
  UNMEASURED.
- **MP3, Rust Cone: the top at 145 m (R1).** Its scree reads red, at a median hue of 8.6 deg (the band is 5-25).
  The slide on its scree is UNMEASURED.
- **MP4, steam: FAIL.** No steam source is built.
- **MP5, the Yards: PASS.** 2 stubs (26 and 22.5 m), 4 stacks, 3 racks and 4 wellheads, in the data and the mesh
  within 0 m. F57's subject check passes.
- **MP6, the shelter: UNMEASURED.** F58 cannot be staged from its lens.
- **MP7, looks against the masked crops:**
  - F56 is further from its crop. Half the frame is Rust Cone's saturated red face up close, there is no steam,
    and the light is warm.
  - F57 is closer on material, the same on silhouette and light. Its tiles show dark patches, and loose planks
    float beside the towers (also in F45).
- **MP8, computed masks: PASS** (see the accepted frames).
- **MP9: PASS.** 0 holes on 7 walks. The slow-ground half is UNMEASURED.
- **MP10, at 1c707aa:**
  - F56 drew 73 calls and 0.53 M triangles; F57 drew 95 calls and 0.77 M.
  - Median GPU: F56 10.8-12.6 ms, F57 9.6-10.6 ms. F56's end-of-run sample read 17.7-19.3 ms.
  - Terrain alone in F56: 5.75-8.05 ms against 6. **FAIL on one pass.**
- **MP11: PASS.** 1.58 MB shipped in 2 KTX2 files; about 7.03 MiB resident; 0 in the first load.

### Area B: the Survey Kite (Node at 9d1acc3)

- **The rows:** 26 PASS, 1 FAIL, 9 UNMEASURED, 3 RECORDED, 2 RULED; `flight-law.test.mjs` 29 of 29.
- **The mesh:** two box cells of cane, 2,172 triangles, 1 draw, vertex colours (0 bytes shipped). It furls to a
  0.95 x 0.12 m roll on a back mount 0.024 m or more clear of the stowed kit.
- **The arm bars: PASS.** 0 of 1,485 graded steps (open, glide, banks, fold, landing, the R5 reef, a fold at 3 m and
  the fall after it) have a wrist behind the head plane or over head height, or an elbow over its shoulder. The
  hand-back on the ground passes too (0 of 324 steps).
- **KF4, the palm bar: FAIL.** The palm is up to 0.064 m off the bar in the glide (2 of 1,364 steps) and 0.056 m in
  the reef (22 of 592), against a bar of 0.010 m.
- **The rulings:**
  - R3: the test flight lands on the marked field 10 of 10.
  - R4: both glide roads reach their last post 10 of 10; the caldera's posts stream 6 of 6.
  - R5: the fold comes on the first step. She is down in 4.91 s from 80 m, 9.9 s from 200 m and 13.0 s from 275 m.
- **On the page:**
  - F51 is staged: wrists 0.34 m in front of the head and 0.13 m under the head bone, elbows 0.11 m under the
    shoulders.
  - F52 passes its subject check, but its lens looks from behind her, not side-on.
  - The open and fold clips show the roll moving between the back mount and her hands with no hand carrying it,
    and the half-furled frame crossing her face at 0.30 of the fold.
- **Not done:** the hero-anim rule (rule 16) was not run by area B. This review's film of F08-F19 shows no change,
  but A100-A107 were not run.

### Area C: the four Instruments, forms only (Node at 9d1acc3)

- **The rows: 12 of 12 PASS.** IK1, IK1-never, IK1-read, Q4-R7, IK2-IK7, IK8-cues and Clouded.
- **The second grey line-up**, filmed at ad2c01a (the forms are unchanged at 9d1acc3):
  - The Kiln's lamp is low by the firebox door, and its stack is a bottle kiln's.
  - The Spindle's ring lies level about an upright spindle. It now reads as a "T" from the front and side.
  - The Davit's arm is a straight lattice derrick.
  - The Sonde has two pointed ends and upright fans.
- **Lamps:** the token exactly (dE 0) in calm, wary and hostile, from the front and three-quarter views. In the
  Sonde's own view, 6.5 against a bar of 3.
- **R7:** over 40 fights, at most one Kiln was awake and 0 steps broke the encounter rule (734,386 did before the
  ruling).

### Areas E and F: the subject checks, regions, flyable, R8

- **EF1: PASS.** Holds to Malpais on the real build at 036b486 (above). Pans to Holds at 79da069: 0 over 33 ms. The
  jog's one 35.3 ms frame at deb74cc is named as a compile, and the bar allows one.
- **EF2: PASS** at 9d1acc3, with the plan lines: Saltrow 112.33, Ninewalls 164.33, the Yards 128.33 and 60 m over
  the Pans 112.33 MiB, against 175. With nothing unloaded it would be 180.33.
- **EF3: PASS.** First load 55.95 MB.
- **EF4: built.** 3 refusals at 9d1acc3 (above).
- **R8, a proposal with numbers:** leg 5 290 s (327 with its boot), legs 4+5 784 s, legs 5+6 884 s, against 900. It
  is not wired: `plan.js` keeps the old budgets until the beats' owners land the route.

### Open

1. A90b fails at 9d1acc3 (see "Kept rows").
2. F58 and F45 need new lenses; F39-look's fight is too small in its lens.
3. F56 reads further from its crop: Rust Cone's face fills half the frame, there is no steam, and the light is warm.
4. No steam (MP4); the shelter (MP6); the scree slide and the slow aa (MP3, MP9).
5. KF4's palm bar; the roll's hand-off to and from the back mount; F52's lens is not side-on; rule 16 for the kite.
6. The Sonde mask's pixel proof (3 frames over their noise).
7. The Spindle's "T" reading, for the owner.
8. The region hitch was not re-run after 1c707aa's look changes; F56's terrain cost was 8.05 ms in one pass (bar 6).
