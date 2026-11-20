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
