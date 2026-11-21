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

## Milestone 3 wave 2b: wave 2's open look and kite items (Nov 20 2026)

Wave 2b of Milestone 3 ran on `r5/m3` from 3077689 (wave 2's head), beside the Milestone 2 exit run. Milestone 2 has
not exited. The defaults of the M3 brief's open questions and the orchestrator's provisional rulings R1-R9 still
apply. Three lanes worked in the one tree: A (the Malpais and the Kiln Yards), B (the Survey Kite) and C (the Sonde's
lamp, R8 wired, the last two seams). Nothing was pushed, and nothing reached `main` or `r5/int`.

The commits: area C 70d7c61, 39069c5, 65e5e65; area A a0ab47e, d6d482e, dde7982, 75f62d6; area B 857a2c7, 9e6c1b4.

The review was taken at **75f62d6** in a clean detached worktree on port 5280. The lance rows were also run at
3077689, in a second clean worktree, as their base. Chrome was shared with the Milestone 2 exit run, so the review used
four short sessions, about 16 minutes in all. Every number below names its commit.

**Verdict: NOT CLEAN.** No accepted frame moved, and nothing regressed. These are still open: the Yards' stack steam,
the aa tile repeat, the steam's cost per source, F56's warm light (a ruling), and KF1's reach to the back mount (a
ruling).

### Gates at 75f62d6

- **Tier 0: PASS.**
  - Node checks: 8 of 8, with 425 tests passing and 0 failing in 76 files.
  - Boot: ready in 4.3 s with 0 errors. Rendered-page name lint: 0.
  - First load: 55.97 MB of 60. `public/` is 60.95 MB. Texture ledger: 140 MB of 175.
- **`vite build`: green**, 4.4 MB of code.
- **Kept rows the wave touches: 3 of 3 pass.** A1, A20b and A-stow-clearance.
  - A-stow-clearance: sprint leg gap 0.106 m; the roll's mount beside the stowed kit.
- **Lane page rows outside the kept stack (D3 debt): A100, A101 and A103 fail at 75f62d6 and at 3077689 alike.**
  Which clause fails moves from run to run on both commits.

  | row | 75f62d6 | 3077689 |
  |---|---|---|
  | A100 | stowed lance tilt 34.9-85.0 deg in the dodge | 34.9-88.5 deg |
  | A101 | left palm 0.052 m off the haft in light-2; guard tip 0.544 m (passes) | guard tip 0.578 m |
  | A103 | blade 0.633 m short; no tip in the ground uphill | blade 0.516 m short; tip 0.047 m into the ground uphill |

  The kite's code does not run in a melee swing. A103's 0.633 m is the widest reading recorded. Earlier readings:
  0.507, 0.517, 0.522 and 0.613 m.
- **Rows the review did not re-run on the page:** A102 and A104-A107. Area B passed them at 9e6c1b4 in a clean tree,
  and the hero and kite code is the same at 75f62d6: the diff 9e6c1b4..75f62d6 under `src/entities`, `src/hero`,
  `src/game` and `src/core` is empty. A107 alone takes 1,394 s of Chrome.
- **The slice: 14 of 14**, stopped at the reward. It used 326 s of Chrome, logged 0 console errors, and its lowest
  health was 84.
- **Accepted frames: no change.**
  - All 16 were filmed at 75f62d6 and compared with wave 2's review film (9d1acc3), outside the computed masks
    (a45b567).
  - F08, F11 and F13: 0 px. F14: 98 px. F19: 19 px. F15, F16, F18, F09, F10 and F24: under their same-session
    repeats.
  - F02 (7.9 %), F03 (3.6 %), F05 (2.5 %), F20 (17.2 %) and F23-plumb (25.2 %) differ by less than the repeat floors
    wave 1's film set for them (61, 46, 36, 27 and 50 %). The differences are her cloth, grass and cloud drift.
  - F02, F03 and F05 stay closer to their references than the 2026-11-14 refilm.
- **Subject checks:** 30 of 31 frames filmed.
  - F45 is refused as at wave 2: tower-b 10 % in the safe area, Brea 59 %.
  - F56, F57 and F58 pass.

### Area A: the Malpais and the Kiln Yards (75f62d6)

- **MP4, steam.**
  - 11 plumes in 2 instanced draws, carried by the wind seam, lit, and 0 emissive.
  - In frame: 6 of 11 plumes in F56, and 4 of 4 steaming hornitos in F58. PASS.
  - **The Yards' stacks: FAIL.** In F57 the probe reads the stack plumes visible and in the frustum, but none shows
    against the sky. The cause is not found.
  - **Cost: not met as written.**
    - All plumes together cost 1.45 ms in F56 (IQR 0.35-1.7), 0.65 ms in F57 and 0.15 ms in F58. That is the
      paired toggle of the M0.8 readback, 3 pairs.
    - Spread over 11 sources this averages 0.13 ms. Most of it is the two vents 34-40 m from the lens, and no
      single source was measured.
- **MP2, tile repeat** (autocorrelation peak, bar 0.35). The review read these again in Node from area A's top-down
  captures at 75f62d6.
  - Pahoehoe 0.196, PASS.
  - Scree 0.332, PASS.
  - **aa 0.353, FAIL.** The aa peak and the scree peak both sit at 9.06 m north-south. The cause is not found.
- **R9, the tube shelter at the hornito field: PASS.**
  - A 22 m pahoehoe tube, mouth at (306, -198).
  - At least 1.5 m from every hornito's foot, and 79 m or more from the Holds' ground.
  - MP9: 0 holes on 8 of 8 walks.
- **MP6:** the shelter's Brazier, the Peg nest and the salt cache are data and grey markers only. UNMEASURED.
- **F58, written target:**
  - 7 of 7 hornitos and 4 of 4 steaming: PASS.
  - The unlit Brazier and the dormant nest: not built.
- **F57:**
  - tower-b is 85.7 % unoccluded.
  - The fallen tiles lie on the ground.
  - The dark lost-tile patches are gone.
- **MP10, from area A's attribution at 75f62d6 in a clean tree:**
  - Median GPU: F56 11 ms, F57 10.2 ms, F58 10.7 ms.
  - Draws: 81, 95 and 86.
  - **Terrain alone in F56: 4.5 ms (IQR 4.25-4.7) against 6, PASS.** At 9d1acc3 it was 5.75-8.05 ms.
  - F58's terrain reads 6.3 ms (IQR 4.15-6.3). F58 is not in MP10's bar, but it sits on the line.
  - F56's end-of-run sample reads 17.8 ms, the same pattern as wave 2.
- **EF1 `A-region-hitch` at 75f62d6** (area A, clean tree): 0 frames over 33 ms.
  - Jog: 11,485 frames, worst 26.2 ms.
  - Flight: 8,451 frames, worst 25.0 ms.
- **MP7, looks against the masked crops** (four points, against wave 2's film):
  - **F56:** silhouette closer, material closer, light the same, finish the same.
    - The spire fields stand up from the plain, and Rust Cone's face is down to about 15 % of the frame.
    - The sea and the warm sunset sky (the bible's Malpais fog) still fill the upper half, and the sun's disc is in
      the frame.
    - Rows of yellow rings mark the far plain about 200 m out.
    - The Malpais ground is 41 % of the frame (51 % at 9d1acc3).
  - **F57:** silhouette the same, material closer, light the same, finish closer. There is no stack steam.
  - **F58** (wave 2's frame was refused): silhouette closer, material the same, light the same (the lens faces the
    sun), finish further. The tube is a faceted blockout arch, and the hornitos are small behind the spires.

### Area B: the Survey Kite (Node at 75f62d6; page at 9e6c1b4, the same code)

- **The rows:** 30 PASS, 0 FAIL, 9 UNMEASURED, 4 RECORDED, 2 RULED (`tools/gates/kite/rows.mjs`).
  `flight-law.test.mjs`: 29 of 29.
- **The roll is carried by her hand:**
  - 0 steps move the roll without a hand on it.
  - The take pulls the roll at most 0.004 m off its mount.
- **The fold stays off her face:** 0 kite vertices in the column in front of her face. The nearest is 0.026 m.
- **KF4, palms on the bar: PASS.** 2,506 hand-steps, the most 0.006 m off (bar 0.010). The kite is now placed from
  her solved palms.
- **The law's times:** the open 0.6 s, the fold 0.39 s, the landing 0.55 s, all inside KF4's bars. The largest wrist
  step is 0.078 m (bar 0.08).
- **The arm bars, Node:** 0 of 2,360 steps fail on the M1.3f sweep's read.
- **KF1 as written:** 855 wrist-steps are behind a head plane, all at least 0.301 m under the head. This is the reach
  to the back mount. **A ruling is owed.**
- **The arm bars on the page:** 68 clip shots, 0 fails, and the highest elbow is -0.053 m. The review looked at 40 of
  the 68 shots:
  - no hand or arm is behind or above her head;
  - the hand carries the roll round her hip;
  - at the fold's 0.30 the roll is at her belly.
- **F52:** a profile, and its subject check passes.
  - Wrists 0.350 m in front of the head and 0.138-0.141 m under it.
  - Elbows 0.103-0.105 m under the shoulders.
- **On the page:**
  - At the end of the open and the start of the fold, the kite pitches forward. It reads as a flat box about 2 m in
    front of her.
  - In the held glide her head bows over a bar at chin height, and her legs stand as if on the ground (the page holds
    her in the air).
  - From behind, the furled roll covers the stowed bow.

### Area C (65e5e65; nothing on the page changes at 75f62d6)

- **The Sonde's lamp: PASS.** It is now an upright lantern at the gondola's port bow, dE 0 to its token in calm, wary
  and hostile in its own view. At 9d1acc3 it read 6.53 dE from calm.
  - Only the lamp's own box changed in each line-up view.
  - IK1, IK1-never and IK1-read pass.
  - The swept volume is unchanged (r 22.43 m).
- **R8 wired into `src/game/hour2/plan.js`: PASS.**
  - gauge-tide 60 s, hand-net 40 s, oro-yards 52 s, each keeping its old budget as `wave1S`.
  - Leg 5 is 290 s (327 with its boot); legs 4+5 are 784 s and legs 5+6 884 s, against 900.
  - The fishing hut stands at (-341.5, 190.7).
  - The runner at 65e5e65: 0 of 27 beats pass, as expected while the beats are unbuilt. Each names the first piece
    it is missing, with 0 console errors.
- **The seams: PASS.** `SOCKETS.heldNet` (typed, empty) and `src/world/fauna/index.js` (typed, empty).
  `seams.test.mjs` passes 3 of 3.
- **Instruments rows at 75f62d6: 12 of 12 PASS**, the same as wave 2.

### Open

1. The Yards' stack steam does not show over the sky in F57.
2. MP2: aa 0.353 against 0.35, with a 9.06 m peak shared with the scree.
3. MP4's cost per source, unmeasured. The two near vents carry most of F56's 1.45 ms.
4. F56's warm light: the Malpais fog tint is the bible's value and a kept gate, so cooling it needs a ruling.
5. KF1's literal head-plane clause against the reach to the back mount: a ruling.
6. MP6: the Brazier prop, the Peg nest and the salt cache are not built. The tube reads as blockout.
7. F45 needs a new lens.
8. A100, A101 and A103 (D3) fail at 75f62d6 and at its base.
9. The forward-pitched fold reads as a slab, and the roll covers the stowed bow from behind.
10. F58's terrain is at 6.3 ms.

## Milestone 3 wave 3: surfaces, flight on the page, the Yards quest (Nov 21 2026)

Wave 3 of Milestone 3 ran on `r5/m3` from 1141fb4 (wave 2b's head with `main` 4da6dbf merged), beside the Milestone 2
exit run. Milestone 2 has not exited. The defaults of the M3 brief's open questions and the orchestrator's provisional
rulings R1-R11 still apply. Four lanes worked in the one tree: A (the Malpais and the Kiln Yards), B (the Survey Kite),
C (the Kiln, the Davit and the Sonde) and E (hour two). Each had one builder turn; there was no judge or fix round.
Nothing was pushed, and nothing reached `main` or `r5/int`.

The commits: area E 472f4fc, 3f3c32e, 167e56c; area B 011e42c, 0ed2839, f9778c9, 9cb3f18, a562422; area C 9d06e4a,
ba28cde; area A 55126d7, 8e5c647, a1359f9, 7b06488, 4c14e00.

The review was taken at **4c14e00** in a clean detached worktree on port 5280. The accepted frames were also filmed at
1141fb4 (the wave's base) in a second clean worktree, and F08, F11, F13 and F14 at seven commits between them, each in a clean worktree. Chrome was shared with the Milestone 2 exit
run, so the review held the one Chrome slot in eight short sessions and released it between them. Every number
below names its commit.

**Verdict: NOT CLEAN.** No accepted frame moved, no kept row failed, and the slice is 14 of 14. Two Tier 0 checks now fail (a listed term in a comment; three new models with no size class), both new in this wave. Open: the Yards' stack steam, the steam's cost per plume, the rings on F56's far plain, the kite's caldera lift on the page, and both hour-two quests by input.

### Gates at 4c14e00

- **Tier 0: FAIL on two checks.**
  - **name-lint: 1 hit.** A listed term in a code comment, `src/world/sites/malpais-region.js:280` (from 8e5c647). The
    rendered page's name lint is 0.
  - **asset-budgets: 3 GLBs have no size class.** `public/models/instruments/{kiln,davit,sonde}.glb` are not in
    `tools/tier0/budgets.json` `instruments.classOf`. With the brief's classes added (kiln large, davit medium, sonde
    small; tried in the review's worktree and put back) the check passes: 22,546 of 80,000, 19,056 of 50,000 and
    13,744 of 25,000 triangles.
  - Passing: the build (4.48 MB of code); licences (311 files, 36 rows); the texture ledger (140 MB of 175); the
    import graph (0 broken); node --test 455 passing and 0 failing in 82 files.
  - First load: 56.83 MB of 60 (55.97 MB at 75f62d6). The rise is mostly the three new GLBs (0.77 MB), which the
    ledger counts in the boot set because no deferred list names them; the game itself does not load them yet. The
    margin is 3.17 MB.
  - Boot: ready in 4.5 s with 0 errors. Rendered-page name lint: 0.
- **`vite build`: green**, 4.48 MB of code.
- **Kept rows the wave touches: 12 of 12 pass.** A1, A20b, A3 (6.75 m/s), A28 (peak 1.50 m), A44 (worst gap 0 m), A44b
  (0.081 m of 0.1), A46 (worst 0.032 m of 0.08), A61 (2,720 colliders), A65 (on the runner's retry after a browser
  relaunch: the known flake), A-climb-1m, A-slide and A-stow-clearance (sprint leg gap 0.100 m). They were chosen for
  the code the wave touched: `src/entities/player.js` (the kite pilot, Space's first ask, the flight branch), the
  kite's mount, `src/game/runtime.js` (the hour-two hub), the hour-two save field and the Malpais' tube and props.
  `A-region-hitch` was not re-run (the Malpais build changed: the tube, the Brazier prop and the steam material).
- **The slice: 14 of 14**, stopped at the reward, after 287 s of Chrome with 0 console errors and lowest health 95.
- **Accepted frames:** **no change.**
  - All 16 were filmed at 4c14e00 and at 1141fb4 (the wave's base) in this review and compared outside the computed
    masks (a45b567): F08 10 px, F11 1, F13 3, F19 23, F14 16-117 (its own noise), F15 98, F16 1,681; F09, F10, F18 and
    F24 under their same-session repeats; F02, F03, F05, F20 and F23-plumb differ by cloth, grass and cloud drift only,
    under their repeat floors.
  - The review's first film at 4c14e00 showed a shimmer on the stowed lance's binding in F08, F11, F13 and F14
    (202-4,238 px). Films at 011e42c, 3f3c32e, 0ed2839, f9778c9, 9cb3f18, 167e56c, a1359f9, 7b06488 and ba28cde, and a
    second film of 4c14e00 in a fresh session, all match the base (at most 10 px). It was that session, not the code.
  - F19 differs from wave 2b's film (75f62d6) by 3.6 % (a pose phase), and the same at 1141fb4: it came in with the
    `r5/int` merge before the wave, not from wave 3.
  - F02, F03 and F05 look as at wave 2b and stay closer to their references than the 2026-11-14 refilm.
- **Subject checks:** F51, F52, F56, F57 and F58 pass. F45 is refused as before (tower-b 10 % in the safe area). F53,
  F54 and F55 have no staging yet.

### Area A: the Malpais and the Kiln Yards (4c14e00)

- **MP4, the Yards' stack steam over F57's sky: FAIL.** The steam changes 32,714 sky pixels, darker by 6.3 luma on
  average (darkest -47.3), all in the top 16 % of the frame. No plume is seen leaving a stack mouth; it reads as a
  darker cloud at the frame's top edge. At 7b06488 it was 25,329 pixels, +4.5 luma.
- **MP4, cost per source: FAIL** (bar 0.15 ms each). Area A's probe times each plume alone on the GPU (24 back-to-back
  draws of the steam only, median of 3 alternated pairs, an upper bound since nothing occludes a puff):
  - F56: hornito-2 0.28 ms, vent-5 0.23 ms, hornito-4 0.19 ms; the rest 0.02-0.10 ms; all together 0.72 ms.
  - F57: stack-4 1.62 ms, stack-20 0.18 ms; all together 1.42 ms.
  - F58: hornito-2 1.28 ms, hornito-1 0.69 ms, hornito-5 0.63 ms, hornito-4 0.59 ms; all together 1.57 ms.
  - The near, screen-filling plumes carry the cost.
- **MP2, tile repeat: PASS** (autocorrelation peak, bar 0.35, from the probe's top-down captures in this review's
  film): aa 0.253 at its true square (280, 230), pahoehoe 0.221, scree 0.325, the old cone-flank square 0.269. The old
  shared 9.06 m peak was the scree's patchwork read on Rust Cone, where wave 2b's "aa" square lay.
- **R11, F56 at 09:30:** the sun stands at bearing 126, 36 deg up, 56 deg left of the lens: out of the frame. A pale
  disc still sits on the horizon in F56 and F58 (most likely the moon, which runs the sun's arc 12.4 h behind; not
  confirmed).
- **The yellow rings on F56's far plain: found, not removed.** They are the Holds' pit-cups
  (`groundShader.js` HOLDS_TERM, the Holds' ground 130-260 m out), not the Malpais' ridge relief.
- **MP6, the tube shelter:** the tube is one welded grid in aa rock, a low rounded hump with a crust lip over its mouth;
  the settlements' Brazier stands unlit 4 m inside it. The Peg nest and the salt cache are not built. UNMEASURED as a
  row.
- **MP1:** 0 emissive Malpais materials; the only emissive materials in F56-F58 are the wellheads' caps and two
  far-field lamps. The night frame shows no ground brighter than the sky.
- **MP10, from this review's film:** F56 92 draws and 0.58 M triangles; F57 97 and 0.79 M; F58 96 and 0.67 M. GPU
  time was not re-measured.
- **MP7, looks against the masked crops, anchored on wave 2b's film:**
  - **F56:** silhouette the same, material the same, light closer (the sunset orange is gone; the sky is still paler
    than the crop's smoke), finish the same (the rings and the disc).
  - **F57:** silhouette, material, light and finish the same. No stack steam reads.
  - **F58:** silhouette closer, material closer, light closer, finish the same (an even, smooth culvert; the Brazier
    too small to read).

### Area B: the Survey Kite (Node at 4c14e00; page at 4c14e00)

- **The rows (`tools/gates/kite/rows.mjs`):** 35 PASS, 0 FAIL, 9 UNMEASURED, 4 RECORDED, 3 RULED.
  `flight-law.test.mjs` 29 of 29.
- **R10, KF1 restated (the old text kept as RULED): PASS.** In Node, 0 wrist-steps behind a head plane at or above the
  shoulder joints; every one is at least 0.19 m under them, at hip height. The arm-behind-head sweep fails 0 of 2,360.
- **The look items: PASS in Node.**
  - The kite is never flat and open at once: 0 of 1,470 steps tilted over 60 deg while more than half open.
  - The held glide: the head 8 deg under the horizontal (wave 2b: 51-54); the bar 0.133 m under the head bone.
  - The legs hang: feet pointed 58 and 47 deg (wave 2b: 8 and 8).
  - From straight behind, the furled roll hides 1.9 % of the bow (wave 2b: 13.6 %). From the page's rear lenses it
    still lies across the bow's middle.
  - KF0d: the roll clears the stowed kit by at least 0.002 m on every step of the open, fold and landing.
- **Flight on the page, by input (`tools/gates/kite/flight-page.mjs`):**
  - Launch from T1: PASS. Open at 0.465 s airborne, 4.35 m clear.
  - Glide with a bank each way: PASS (bank +1, then -1).
  - Land: PASS. On the marked field, 1 m/s down, 0 damage, 9.14 s after the open.
  - Fold at 3 m: PASS. Folded at 3.03 m over the ground, hp 100.
  - The owner's bars on every frame: 0 bad of 900 flying frames off T1 and 0 of 199 in the fold. 107 frames have a
    wrist behind a plane, none at or above the shoulders (lowest margin 0.227 m).
  - Frame time in the flight: median 16.7 ms, 1 frame over 33 ms (35.4 ms), 0 over 50.
  - **The caldera's lift: FAIL.** Off the rim the open was refused as too low (0.67 s airborne, 2.3 m clear); no later
    press opened it; she fell to the wall and lost 24 hp. The climb was not measured.
- **"A Line Over the Glass" in Node: PASS** (`glass-line.test.mjs` 5 of 5): 10 of 10 plays to the end, the stages in
  order on their own events, Flagged 10 of 10 while the Sonde is moored, the save round trip.
- **Playable by input as leg 4:** **FAIL: 6 of 10 beats** by input in the hour-two runner at 4c14e00
  (from leg 4's fixture, 399 s, 0 console errors, 1 frame over 50 ms at 51 ms).
  - PASS: weather-clears, walk-the-line, ansel-kite, wreck, cane-cord, rebuild.
  - FAIL: tether (not built: the Sonde moored at the Ring with a tether to cut); launch and kite-given (not built: the
    Survey Kite as an item); fly (driven, not reached: the stage stayed at 'tether').

### Area C: the Kiln, the Davit and the Sonde (4c14e00)

- **Surfaces on the accepted forms:** white enamel plates over gunmetal, brass hoops and rivets, pale-ice glass, one
  lamp each; the Kiln's fire behind its iron door; the shared 256 atlas and an 8 x 4 palette.
  - Triangles (Tier 0, LOD0): Kiln 22,546 of 80,000; Davit 19,056 of 50,000; Sonde 13,744 of 25,000. The art page's
    own labels read 27,790, 24,106 and 17,664 (another count; still under the caps).
  - Lamps: dE 0 to their tokens calm, wary and hostile on every turntable; the Kiln at a wellhead reads 0-2.65.
  - The never list: nothing emissive but pale-ice glass and the Kiln's fire, which sits 0.125 m behind the shut door;
    no red lamp. `art.test.mjs`, rows and seams 16 of 16; IK1-IK8 and Clouded pass at 4c14e00.
  - The look against the Instruments line-up crop (masked): the language is right (enamel, brass, rivets), but it reads
    clean and chunky, not weathered and slender. The fire behind the open door reads as a flat salmon panel.
- **Behaviour on the page (`tools/gates/instruments/m3/film-art.mjs`), all PASS:**
  - The Kiln plugged 128.5 s (bar 120), turned 0 rad while plugged.
  - It wakes: awake 1.517 s after the wake; the lamp calm, then wary, then hostile.
  - It shells: 3 shells at 31.1 m; shadow and whistle at least 1.428 s ahead of impact (bar 1.2).
  - Brine on the hot door: sprung, a stagger of 2.016 s, damage x1 in the window; a cold door and its back do nothing.
  - The Davit re-seats the Kiln's hose in 3.983 s (bar 4.0 +-0.3) after a 9.7 s walk; plates 3 to 2.
  - The Sonde sees a gliding Brea at 79.94 m against 39.96 m on foot: x2.001 (bar x2.0 +-0.05).
- **Not measured:** GPU time and memory for the three kinds (IK10, IK11).

### Area E: hour two (4c14e00)

- **"The Kiln Yards" in Node: PASS** (`kiln-yards.test.mjs` 10 of 10): offered only after "True Ground"; stages advance
  only on their own events; Brine quenches at 3 m only while a Kiln is plugged into the head or after; Q4 and R7 (never
  two awake through four quenches); four quenched, 0 Kiln spawns over 24 site-clock hours; rung 7 held at Oro's; 10
  scripted plays reach `yards-quiet`; the save round trip.
- **W3: PASS** (`writing-w3.test.mjs` 6 of 6): three quests, 8 Field Books (11-18), three cards; no card over 3 lines,
  no line over 58 characters; Nesra's first mention once, by Ansel, in the kite quest.
- **M3.7's ranks: PASS** (`hour-two-ranks.test.mjs` 7 of 7): every hour-two act a counted seam event, 10 kills move 0
  counters, health rises only through Ballast.
- **Playable by input as leg 6:** **FAIL: 0 of 11 beats** by input at 4c14e00 (from leg 6's fixture, the leg capped at
  420 s, 455 s of Chrome, 0 console errors, 0 frames over 33 ms).
  - oro-yards: not built (Benchmark 2 in the Glass); climb: not built (the Malpais as a region); plugged and quench-1:
    not built (the four wellheads seam). The other seven were not run inside the cap.
  - The beat pictures show her walk stopped against Ninewalls' outer wall from 'climb' on, as area E's own runs did.
    Some of the named needs (the wellheads seam, the Malpais region) exist in the code, so the runner's need checks
    may read them before the region is built; not confirmed.

### Open

1. Tier 0: the listed term in `src/world/sites/malpais-region.js:280`; the size classes for the Kiln, Davit and Sonde in
   `tools/tier0/budgets.json` (kiln large, davit medium, sonde small).
2. The Yards' stack steam does not read over F57's sky.
3. MP4's cost per plume: up to 1.62 ms (stack-4 in F57) and 1.28 ms (hornito-2 in F58), against 0.15 ms.
4. The rings on F56's far plain (the Holds' pit-cups) are not removed; a pale disc stands on the horizon in F56 and F58.
5. MP6: the Peg nest and the salt cache are not built; the tube reads as an even culvert.
6. The kite's caldera lift on the page: the open was refused off the rim and she fell (24 hp).
7. Leg 4 by input: the moored Sonde at the Ring and the Survey Kite as an item are missing.
8. Leg 6 by input: 0 of 11; the walk stops at Ninewalls' outer wall.
9. The three new models count in the first load (56.83 MB of 60) because no deferred list names them; IK11 wants the
   Sonde's set fetched when the kite quest is given.
10. The new kinds read clean and chunky against the line-up crop; the Kiln's fire behind the open door reads as a flat
    panel; the Davit's round front lamp may read as an eye (for the owner).
11. Not run: `A-region-hitch` after the Malpais' changes; IK10 and IK11; KF10 and KF11.
12. F45 still needs a new lens; F53-F55 are not staged.

## Milestone 3 wave 3b (Nov 21 2026, lean, no review)

Two lanes on `r5/m3`, measured by each lane from clean detached worktrees; no review agent ran.

- **The kite (e55ccb0, 7d5d0dd, 1dd8ecd).**
  - The caldera launch is one the open rule allows: it opened with 3.15 m clear (bar 3.0) and climbed 24.89 m in lift over 25.9 s, hp 100, 0 bad arm-bar frames of 4,189.
  - "A Line Over the Glass" plays 10 of 10 beats by input from its fixture (was 6 of 10). The Survey Kite is an item; a moored Sonde stand-in stands at MOORING. Worst frame 42.2 ms, 1 over 33, 0 over 50.
  - Open: the caldera flight's home leg never lands (128 m up after 40 s); the T1 open's bearing comes from her jump velocity (320.8 against the 283 track).
- **Hour two leg 6 (184e706).** "The Kiln Yards" plays 8 of 11 beats by input from its fixture (was 0 of 11): long walks routed round Ninewalls on the game's colliders at 1 m cells; the Malpais and the wellheads read where they live. At most one Kiln awake; hp 84.
  - Fail by name: tube-rest (the tube shelter's Brazier is not a rest Brazier), scar-flight (the Scar's seven line-posts are not built), rung-7-held (no driver).
  - Over budget: oro-yards 119.4 s (no Benchmark 2 shortcut), climb 95.2 s, quench-3 and quench-4 just over 42 s.
- **Look notes for the next review:** a large pink faceted flap on her wrap in two leg-6 shots, and red-brown flat panels in front of the lens in two leg-4 shots; neither identified.
- Tier 0 Node checks at 1dd8ecd: 8 of 8.
