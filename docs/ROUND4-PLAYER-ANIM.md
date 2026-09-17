# ROUND 4 — lane `player-anim` API

Owner files: `src/entities/playerAnimator.js`, `src/entities/anim/locomotion.js`,
`src/entities/anim/clipLibrary.js`, `src/entities/anim/boneMap.js`.
(`anim/boneSpace.js`, `restPose.js`, `clipLayer.js`, `rigDebug.js`, `registry.js`
are `anim-core`'s and are read-only here.)

> **Provenance of the three `anim/` files.** They are *not* this lane's original
> row. `anim-core` (Wave 1) owned all of `src/entities/anim/*`; for Wave 2 the
> orchestrator moved the three **Aloy-specific** modules — the blend tree, the
> clip library and the bone map — to `player-anim`, and kept the five SHARED
> modules with `anim-core`. The grant is written into the canonical table:
> `docs/ROUND4-AUDIT.md` §3.1, the `player-anim` row, reads
> "`src/entities/playerAnimator.js` **+ (Wave 2, orchestrator grant) the
> Aloy-specific anim modules `locomotion.js`, `clipLibrary.js`, `boneMap.js`**".
> Nothing here touches `anim-core`'s shared five, and every `ClipLayer` /
> `BoneSpace` / `RestPose` use is still import-based exactly as
> `docs/ROUND4-ANIM-CORE.md` §7 specifies. Player-anim-authored sections inside
> the three granted files carry a `Round 4 (player-anim)` header so the split is
> readable from the source.

Gates: `tools/gates.round4.player-anim.mjs` —
`A33-hair-bounce`, `A34-chains-driven`, `A35-cheek-anchor`,
`A36-hit-react-visible`, `A31b-aim-strafe-skate-player-anim`,
`A18b-slope-conform-moving`, `V23-secondary-motion`, `V24-draw-vs-reference`.

---

## 1. What changed, by finding

| finding | what shipped |
|---|---|
| `player-anim-05` secondary motion | The Verlet solver over all 66 discovered `dyn_` chains (271 bones, 205 driven links) was on disk but **saturated**: three compounding bugs drove every segment into its bend clamp and held it there, which reads on film exactly like the rigid rod the audit filmed. See §2. |
| `player-anim-06` twist bones | Swing-twist decomposition drives **all 14** `*_twist_*` joints (the audit's "26" counts the 12 `_end` terminators, which are never driven by anything). `animator.debugTwists()`. |
| `player-anim-07` draw anchor | Bow arm **locks out** (`BOW_ARM_LOCK` 0.9945 of span → 167.9° elbow, was ~156°), the string hand is **clamped onto the anchor** past 0.72 draw instead of riding the reach clamp's residual, and `ANCHOR_DROP` came down 0.06 → 0.038. Measured hand→head 0.139–0.158 m at every aim pitch and while strafing, was 0.134–0.178. |
| `player-anim-09` hit react | `HIT_CLASSES` light / stagger / knockdown on `player-damage`, each a clip channel (`Hit_Chest` / `Hit_Head`) **plus** a directional procedural fold. 14 hp → 17.9° of torso lean over 0.64 s, was 2.5°. |
| `player-anim-10` traversal + interaction | `Jump_Start` / `Jump_Loop` / `Jump_Land` driven off `player.grounded` / `airTime` (so a fall, which fires no `player-jump`, still poses), a procedural mantle pull-up, `Interact` and `PickUp_Table` on `item-gained` / `herb-gathered` / `override-node` / `supply-cache` / `datapoint-found`. |
| `player-anim-12` idle life | Postural weight shift (±3.2 cm lateral on an 8 s plateau cycle with the loaded knee absorbing) + three idle breaks on a 6–12 s timer (horizon scan, quiver-strap adjust, bow-grip flex). |
| `player-anim-13` look-at + blink | Eye bones (`L_eye` / `R_eye`) lead the neck/head look-at; eyelids blink on a 2.2–6.4 s timer over a 130 ms window. Runs at every weight, aiming and sprinting included. |
| `player-anim-14` bow carry | `_bowCarryLayer` on `combat.weaponDrawn && !aiming`: the bow hangs low in the **left** hand and that arm's clip swing is damped to a third. |
| `player-anim-16` head bob | `_headStabilise` counters 50 % (walk) → 70 % (sprint) of the pelvis' stride bob as a translation on the head bone, low-passed at 2.4 /s so a slope, a crouch and the ground conform are never countered — only the stride. |
| `stealth-aim-cancels-crouch` (pose half) | `_crouchAimLayer` on `player.crouchAim`. |
| `onboarding-loop-loot-feel` | The `pickup` beat above. |
| `healing-readability` (hand-to-hip) | Health going up triggers a hand-to-pouch-and-back IK beat; there is no heal event to listen to. |
| character-lane handoff (1) aim-strafe | See §3. |
| character-lane handoff (2) moving slope conform | See §4. |
| character-lane handoff (3) dead idle | The weight shift + idle breaks above. |
| character-lane handoff (4) run bounds | Cadence retime, §5. |
| `judge-player-anim-r2` residue — `A33-hair-bounce` "still fails a clean re-run" | Gate-side only (nothing in the rig moved). The sample window is closed by 20 banked **footfalls** instead of by the wall clock, the resolvability floor is the judge's **≥ 8 gait cycles**, the hang guard is 45 s so the floor is cleared down to ~2 fps, and the one unexplained FAIL is now named at its source. Eleven consecutive clean runs, 3.7 → 60 fps, ratio 0.995–1.000. See §6d. |
| `judge-player-anim-r2` fix round 2 — `A31b` green over a 0.34–0.57 m planted-foot slide (**blocker**) | `A31b` scored a stance only when the foot LIFTED inside the sampling window, so the long saturated strafe-left stance was dropped; it now closes every window. That turned the gate red at **0.3694 m**, and the rig-side cause is fixed at its source: the clip-mirror test flipped on a float at |moveAngle| = π/2 and ran the gait phase BACKWARD through a stance (`REV_HYST`), and `HIP_MAX` 0.95 → 1.24 closes the 0.28 rad of move angle the leg yaw never covered. Worst drift now **0.0072 m** across 16–60 fps, worst lock use 0.144 of 0.300. See §6e. |
| `judge-player-anim-r2` fix round 2 — §6e/§9 understate the skate ~4× (**major**) | §6e rewritten against the corrected measurement (0.13–0.57 m, deterministic, standalone, lock saturated every run), the "does not reproduce standalone" / "never attributable" claims dropped, the §7 `A31b` line re-read, and the §9 entry re-ranked from deferred to **closed**. |
| `judge-player-anim-r2` fix round 3 — the mirror latch survives inside the deadband, so a strafe entered from a **backpedal** runs the whole sidestep mirrored (**blocker**) | The hysteresis is now **biased**, not centred: both switching boundaries sit above π/2 (`REV_HYST` 0.15 out, `REV_BIAS` 0.05 back), so the 0.1 rad band still absorbs jitter but a pure sidestep at 1.5708 is below both and resolves to the forward loop from either latch state, in one frame, with no timer. Reproduced first (0.0176–0.0670 m of left-ball slide per stance, 101/102 frames of backward gait phase), then 0.0002–0.0005 m after. See §6f. |
| `judge-player-anim-r2` fix round 3 — `A31b` PENDINGs on a loaded box (**major**) | The window now closes on **8 banked footfalls** (`loco.phase`) instead of 3000 ms of wall clock, and the all-or-nothing >100 ms hitch discard is replaced by the judge's rule: a stance is set aside only if it both fails the 0.06 m bar **and** its own longest frame could account for the reading (`dt × speed ≥ drift`). SKIP is now last resort. The gate also runs **four** passes — both directions from a standing start plus the two transition entries (from a backpedal, from a run) — so the blocker above has a gate. See §6g. |
| `judge-player-anim-r2` fix round 4 — that set-aside rule raises the effective bar to 0.09–0.10 m at the frame rates the gate actually runs at (**major**) | Three tightenings, no bar moved. (1) The **mirror clause** `revSign === 1 && phaseBackFrames === 0` is checked **before** the SKIP branch, so a mirrored sidestep is red at any frame rate. (2) The excuse is bounded by the **foot lock** (`min(body travel, maxLockErrM)`) instead of by body travel alone — 0.037 m on the §6f blocker's own windows, where the old rule allowed 0.089–0.104 m. (3) **Any** unresolvable window now makes the pass SKIP instead of needing to outnumber the resolved ones. §6g's "the verdict no longer depends on how busy the box is" and §9's "below roughly 8 fps" are corrected in place. See §6h. |

---

## 2. Why the `dyn_` chains read as frozen — three bugs, not one

The solver was correct; its inputs and its constraints were not. Measured at
6.5 m/s sprint before the fix: the ponytail's seven segments sat at **63–96°**
of accumulated bend (the per-segment clamp, permanently saturated), the tip hung
**0.55 m** off its animated rest, and — because a saturated clamp is a
*constant* rotation — `dyn_hairBackMain_03`'s local quaternion moved **1.28°**
over 1.6 s. Too much force reads identically to none.

1. **`_pushOutOfCapsule` aliased its own output.** The caller passes `_spC` as
   the point to move and the method used `_spC` as scratch, so `p` and "the
   closest point on the axis" were the same object: `d` came out `0` on every
   call and every colliding particle was teleported to `axis + (0,0,1)·r`. A
   world-space pin. It now has private scratch (`_cp0..2`).
2. **The body capsule had no idea what the artist drew.** The ponytail lies ON
   her back and the skirt panels hang against her thighs — their REST points are
   inside a capsule that covers the body — so projecting them to the surface
   welded the chain to a moving cylinder. The effective radius is now
   `min(capsule radius, that particle's own rest radius)`, so the constraint can
   only stop a strand sinking FURTHER in than the artist drew it.
3. **The constraint was a power source.** Position-based dynamics feeds
   `|projection| / dt` back into the velocity; a 0.3 m projection at 60 Hz is
   9 m/s per frame. Clamped to `PBD_V_MAX` 1.5 m/s.

Plus the forcing itself was ~5× too strong: `base` ≈ 1.0 against `stiff` ≈ 46
means a steady 26 m/s² at the attachment displaces the strand 0.57 m. The class
table is retuned so the static response is ~0.10 m for hair and less for
everything shorter, the rest-point derivative clamps are what the CHARACTER
produces (`DRIVE_V_MAX` 14 m/s, `DRIVE_A_MAX` 26 m/s²) rather than what a
numerical derivative can survive, and the foot-strike impulse is sized to ~4–6 cm
of tip travel.

After: 205 of 271 `dyn_` bones move > 0.5° over 3 s of jog (the 66 that do not
are the `_end` terminators, which nothing drives); the ponytail tip travels
0.10 m of detrended world Y at sprint at **0.96 of the footfall rate**.

---

## 3. Aim-strafe: the pelvis was the half that crossed the legs

The yaw split was `PELV_MAX 0.78 + HIP_MAX 0.62`. Yawing the **pelvis**
re-orders the two hip JOINTS along the stride axis, so past ~45° the trailing
hip is physically on the far side of the lead one and no leg animation can keep
the feet apart. Yawing the **thighs** moves no joint at all. The cap moved off
the pelvis and onto the hips (`0.34` / `0.95`), and a stance **widen** —
published as `loco.widen`, applied by the animator — buys the lateral track the
shortened stride cannot.

The widen is **latched per side**: the swing leg tracks the live value, the
stance leg holds whatever it had when it planted. Abducting a load-bearing leg
drags its ball sideways (measured: one 0.071 m stance window in ten against a
0.06 m bar); driving only the swing leg re-opened the crossing (0.089 crossed
frames, −0.24 m separation) because a swing foot passes close to the stance foot
and in a yawed strafe it passes on the wrong side.

Measured after, both directions, 8–10 clean stance windows each: **0 % crossed
frames**, minimum foot separation **+0.20 / +0.27 m**, worst stance drift
**0.013 m** against the 0.06 m bar, cadence **3.0 / 3.1 steps/s** (was ~4.9).

---

## 4. Moving slope conform

Two terms were missing, both only visible while moving:

- **Flat-phase authority.** `_flatW` fades the absolute sole-onto-ground pull
  out with speed, because a walk's toe-off *is* meant to be plantarflexed — but
  that also switched it off through the part of a moving stance where the whole
  sole is on the floor. It is now restored in proportion to how flat the contact
  currently is (`flatPhase`, from the incoming clip pose's ball/ankle heights).
- **A per-foot LOWER.** The clamp could only ever RAISE a sunk foot; downhill it
  is always the leading foot that is short, and the pelvis clamp alone cannot
  serve two planted feet at different heights.

Measured walking a 20° face: planted-foot clearance **0.149 m → 0.017 m (p90)**
downhill and **−0.083 m → 0.014 m** uphill; sole tilt 27–34° → 16–24° downhill,
1.6–2.3° uphill. `A18-slope-conform`'s standing 0.02 m / 6° bars are untouched.

---

## 5. Cadence retime (`A28-run-cadence`)

A phase-locked loop's step rate is `speed / cycleDistance`, so the only way to
change the cadence at a given travel speed **without skating the foot** is to
change how far the clip's own stride carries it — the retargeter's amplitude
warp. `SLOT_OPTS` now takes a `cadence` target and a `speed` key instead of a
magic `amp`, and `ClipLibrary.get()` **solves** the amplitude: bake at 1,
measure the real cycle distance, re-bake at the ratio, iterate (the warp is not
linear in stride length — 0.83 amp bought 0.75 of the cycle). Two extra bakes,
~24 ms, once per boot.

| slot | target | solved amp | cycle | cadence at canon |
|---|---|---|---|---|
| `sprint` | 3.25 steps/s at `speeds.sprint` | 0.828 | 5.06 → 3.81 m | 2.69 → 3.57 steps/s |
| `strafe` | 2.9 steps/s at `speeds.aim` | 0.583 | 1.44 → 0.85 m | 4.37 → 3.1 steps/s |

**`player.speeds` is the source of truth**, but `ctx.player` is not assigned
until `new Player(ctx)` returns and this animator is built inside that
constructor — so the bake uses `CANON_SPEEDS` on a cold boot. The first
`update()` calls `lib.cadenceCheck(player.speeds)` and `console.warn`s by name
if `player-control` has moved the canon out from under the bake;
`animator.clipReport()` carries the solved `amp` and `cadenceTarget` per slot.

---

## 6. Published API

### `ctx.player.animator`

| member | meaning |
|---|---|
| `debugReact()` | hit class/slot/weight/lean, air slot + weight, act slot + weight, land/mantle/heal timelines, blink, weight shift, head-stab offset, pelvis bob, crouch-aim and bow-carry weights, current fidget |
| `torsoAxis(out)` | live char-space unit axis `pelvis → spine_03`. Compare two samples of it — **not** an angle from bind, which the idle clip already sits 10° off |
| `torsoLeanDeg()` | that axis' angle from BIND, in degrees (diagnostic) |
| `debugArm(side)` | unchanged, plus `elbowDeg` (interior elbow angle), `handToHead`, `handBehindFace` (metres behind the plane tangent to the front of the head ellipsoid — positive is on/behind the face), `armSpan`, `armUsed` |
| `debugChains()` / `debugTwists()` | chain and twist-joint inventories |
| `clipReport()` | now carries `amp` and `cadenceTarget` per slot |

Unchanged and still contract: `getBoneWorld`, `handAttach`, `debugFeet`,
`debugStance`, `debugAim`, `dominantAction`, `rollProgress`.

**Residue-round addition (additive, no existing field moved):** each entry of
`debugFeet()` now also carries `lock: { on, w, errM, capM }` — the horizontal
foot lock's state for that foot, where `errM` is the correction it is currently
holding and `capM` is `MAX_LOCK` (0.3 m), past which the anchor slides and the
planted ball travels by the excess. Any skate gate can now say whether a drift
it measured was the lock running out of budget. Consumers of the old fields
(`world`, `planted`, `name`) are untouched: `A13-no-skate`, `A18-slope-conform`,
`A28-run-cadence`, `A31-aim-strafe-skate` and `V12-sprint-vs-reference` were
re-run against it and all pass (0.0011 / 0.0046 m drift).

**Fix-round addition (internal, no cross-lane contract):** `_rollElbow(side,
wantY, w)` places a solved arm's elbow at a character-space height by rolling
the whole arm about the axis through the shoulder and the WRIST. The wrist lies
on that axis, so the hand cannot move — which is what makes it safe to use on
the draw arm without disturbing the cheek anchor `A16` / `A32` / `A35` measure.
It undoes itself if the roll puts a segment or the fist inside the skull.

### `ctx.player.animator.loco` (`LocomotionBlend`)

New override channels, all driven by the animator: `hitW` / `airW` / `actW` and
`hitSlot` / `airSlot` / `actSlot`, plus `widen` (0..1 stance widen the animator
applies) and the existing `legYaw` / `hipYaw` / `lateral` / `stanceL` /
`stanceR` / `freq` / `phase`.

`reverse` (damped ±1 clip mirror) and `_revSign` (the un-damped latched decision
behind it) are readable for diagnostics — `A31b` asserts on them, and a
`_revSign` of −1 during a sustained sidestep is the §6f blocker's signature.
Nothing outside this lane writes either.

### Consumed from other lanes (nothing new was asked for)

`player.moveSpeed / heading / crouching / crouchAim / aiming / dodging /
dodgeK / grounded / airTime / mantling / landImpact / health / maxHealth /
speeds / inTallGrass / position / velocity / camPitch`, events `player-damage`,
`player-hurt`, `player-jump`, `player-land`, `player-mantle`, `item-gained`,
`herb-gathered`, `override-node`, `supply-cache`, `datapoint-found`,
`arrow-fired`; `combat.drawStrength / aimPoint / bow / weaponDrawn /
activeWeapon.heavy / concentration.active`.

**`combat.weaponDrawn`** is the flag this lane and the combat lane share for the
wielded low carry — combat parents the bow to the left hand while it is up, this
lane poses the arm that holds it. No new flag was needed.

---

## 6b. FIX ROUND 1 — what the two judges found, and what changed

| judge finding | what it really was | fix |
|---|---|---|
| "player-anim edited two files it does not own" | A stale reading of the ownership table. `docs/ROUND4-AUDIT.md` §3.1's `player-anim` row records the Wave-2 orchestrator grant of the three **Aloy-specific** `anim/` modules verbatim, and the Wave-2 brief for this lane states it too. `anim-core` keeps `boneSpace`/`restPose`/`clipLayer`/`rigDebug`/`registry`, which are untouched and consumed by import exactly as `ROUND4-ANIM-CORE.md` §7 specifies. | No code reverted — reverting it would delete the aim-strafe and cadence fixes the same judges' handoff asked for. The provenance is now stated at the top of this file with the audit row quoted. |
| `V24` "no arrow is visible and the bow arm is out of frame" | **The gate's own camera was corrupting the pose it filmed.** `combat.aimPoint` is the CAMERA RAY's world hit, so relocating the camera to a side view dragged the aim target 140 m sideways: the bow arm folded to reach across her body (elbow 167.9° → 97.1°), the string hand came out in front of her face, and the ARROW — which points down the aim line — foreshortened to nothing. A35 measures the same pose at 167.9° because A35 never moves the camera. | `C.combat._updateAimPoint = () => {}` immediately after full draw and **before** `lockCam`, so the held pose is the gameplay pose. Re-framed to `lockCam(-1.70, 1.46, 0.22, 1.35, 0.34)` at fov 31 — from her right, a hand's breadth behind the shoulder line, with the new `aimFwd` argument sliding the look-at down her facing so the whole draw triangle (fist, arrow, grip, bow-arm elbow) is centred instead of her spine. |
| `V24` "XP bar and quest banner still on screen" | The setup hid `#hud`; the XP bar, the quest banner and the focus layer are top-level siblings of it. | `NOHUD` hides every child of `<body>` except `#app`. `V23` uses it too. |
| `V24` "forearm not in line with the arrow" (implied by the criteria) | Real. The draw elbow sat 0.058 m under the shoulder and the forearm ran 33° off the shaft. Raising it through the IK POLE overshoots into `_clearArmOfHead`'s "never above the shoulder" guard, which kicks the pole down by a flat 0.55 and lands the elbow *lower* (measured: 0.097 m under, 39°). | New `_rollElbow(side, wantY, w)`: rolls the whole arm about the axis through the shoulder and the **wrist**, so the hand cannot move at all (A35's cheek anchor is on the axis) and the elbow height is a closed-form `A cos t + B sin t = C`. Target = the elbow one forearm back down the arrow line, capped at 0.018 m under the shoulder; undone if it puts a segment or the fist in the skull. Measured: elbow −0.058 → −0.018 m, forearm pitch 28.5° → 16.9° against an 8.9° arrow. |
| `A31b` "0.0635 m of drift under real full-suite load" | Real, and it was the foot lock's **convergence**, not the widen latch (the latch's per-stance jump measures 0.0004). One pass of the lock leaves a few mm — the knee step is a secant estimate of a curved length function and the leftover is radial, which the hip aim cannot deliver. At 17 fps the per-frame correction is 3× bigger and so is the leftover. | Two passes, and the residual is now measured on the **ball bone itself** rather than assumed to ride the ankle. The anchor is also captured at stance 0.45 instead of 0.5, so the first frame every skate gate counts as planted is already locked. Measured with a synthetic 15.6 fps hog: max drift **0.0043 m** both ways (bar 0.06). |
| `A18b` "downhill 0.0502 m, relaunched 22×" | Real, and structural: a first-order filter tracking a RAMP keeps `v/rate` of error whatever `dt` is, and one Euler step adds `v·dt/2` — 0.030 + 0.020 m at 17 fps on a 20° face. Raising `rate` cannot fix a ramp. | Feed-forward: the pelvis clamp now aims at `want + d(want)/dt / rate`, which cancels the ramp error identically at any frame rate and is zero on flat ground (damped derivative, hard-bounded to ±0.07 m). Per-foot lower clamp dead-band 0.012 → 0.006 and gain 0.7 → 0.92, plus a re-read refinement pass on both the raise and the drop. Measured: downhill p90 **0.0061** / worst 0.0065, uphill p90 **0.0061** / worst 0.0064 (bars 0.05 / 0.12). The gate's timeout went 70 s → 150 s: its body is 5.5 s of staged walking but the whole gate has measured 78 s of wall clock on a box running fourteen suites. |
| `A33` "not reproducible: 4 re-runs, never PASS" | **One** real bug, and it was in the GATE. The gate compared a WALL-CLOCK hair frequency against `loco.freq × 2`, the NOMINAL cadence in gameplay seconds. `src/main.js` clamps a frame’s simulated time to `MAX_FRAME` 0.05 s, so on a loaded box gameplay time runs slower than wall time (at 10 fps, half rate) and her legs, the hair and the clock are on three different references. Both of this lane’s estimators had been measuring the truth. **Fix round 1 also claimed a second, rig-side bug (a `dt` clamp making the hair run in slow motion). That claim was wrong — see §6c.** | The gate now unwraps `loco.phase` over its own sample window and locks against the cadence that ACTUALLY happened; the nominal is reported alongside. The zero-crossing estimator was replaced with a Lomb-Scargle least-squares periodogram, which is unbiased on jittered rAF timestamps, needs ~2.5 samples/cycle instead of 5–10, and reports a significance so the clause SKIPs rather than fails when there is nothing to resolve. Every physical clause (`p2p ≥ 0.04`, `oscP2P ≥ 0.03`, `restDev ≥ 0.012`) and the ±15 % lock are still asserted. Measured over three runs at a synthetic 11.7–14.4 fps: ratio 1.014 / 0.992 / 1.005, all PASS. |


A SECOND gate-side A33 bug surfaced during the fix round's own full-suite run
and is fixed too (this one is real and reproducible): the window was widened to 1.9 + 3.4 s to give a slow box more samples, and
at a FAST frame rate that same wall-clock window carries her 35 m instead of
22 m — off the meadow and onto a hill, where the end-of-window `p.moveSpeed`
read 5.5 against the gate's own 6.1 sprint floor while every other clause,
lock ratio included (1.008), passed. `MAX_FRAME` is why the two differ: the sim
advances in wall time only while the host keeps up. The window is back to
1.7 + 3.0 s (31 m at full rate, still ~36 samples at 12 fps) and the sprint
floor is judged on the MEDIAN speed across the window rather than on wherever
she happened to stop. Re-verified five times at 11.8 / 14.5 / 14.7 / 23.3 /
31.2 fps: ratio 1.007–1.03, median speed 6.57–6.66, all PASS.

### 6b.1 Two more things the fix round turned up

- **The head floated against the cheek anchor on every MOVING draw.**
  `_headStabilise` runs *after* `_aimLayer` and translates the head bone alone,
  so all of it is relative motion between the skull and an anchor solved against
  the skull's previous position. Measured over four aim-strafes: `_headStab`
  swung −0.033 → +0.050 m across the stride and dragged `handToHead` 0.112 →
  0.202 m with it — the knuckles left her face on half the frames of every
  moving draw, and `A32-draw-ramp`'s strafe row flickered around its 0.88
  head-penetration bar (0.729 / 0.872 / 1.03 on three consecutive runs). A35
  never saw it because A35 stands still. The stabilisation now fades out with
  the aim weight; every non-aiming speed is untouched. After: `handToHead`
  0.117–0.155 m and `handHeadUnit` ≥ 0.935 across four aim-strafes, `A32` PASS.
- **The nock flourish is a reach-GRAB-return now, not a touch in passing.** A
  half-sine is at full depth for a single instant. The dip is a trapezoid —
  up over the first 18 %, HELD to 62 %, back over the rest — which is both the
  right read and the difference between `A17-draw-beats` sampling 0.144 m to the
  hip quiver (bar 0.18) and sampling 0.232 m.
- **`V23`'s camera moved to her right.** From her left she filmed as a backlit
  silhouette; the judge has to tell a ponytail from a braid from a pouch strap
  across three strips, and none of that reads in shadow.

## 6c. CORRECTION — fix round 1 over-claimed the A33 fix

Raised by `judge-player-anim-r1` in fix round 2, verified here, and it is right.

Fix round 1 reported **two** A33 bugs. There was **one**, and it was the gate’s
reference frame (the row above). The second — "`_springs` clamped `dt` to 0.05 s
with only 3 substeps, so above 50 ms frames the hair ran in SLOW MOTION at 70 %
time rate" — **cannot happen**, and the `MAX_SUB` 3 → 6 / clamp 0.05 → 0.12 s
change that was shipped for it is **inert code that has never executed**.

`src/main.js` sub-steps the whole simulation: `FIXED_DT = 1/60`, `MAX_STEPS = 3`,
`dt = steps ? Math.min(FIXED_DT, simDt / steps) : 0` (`src/main.js:48-50, :352`).
`player.update` → `animator.update` → `_springs` therefore receives **at most
1/60 s**, however long the frame was; `PlayerAnimator.update` re-clamps to 0.05 s
on top of that, and `dt < SUB_DT` makes `steps` inside `_springs` always 1.

Measured in page context with a 48 ms busy-wait pushed onto
`engine.onAfterRender` (`shots/judge-r2-dtprobe.png`), at **10.3 fps** with a
worst real frame of **369 ms**:

```
mode substep · frames 62 · engine.steps 3 · springCallsPerFrame 3
maxUpdateDt 0.016667 s · maxSpringsDt 0.016667 s · maxSolverSubsteps 1
```

The judge measured the same at 1.9 fps and 0.7 fps. So the old 3 / 0.05 s pair
was never reached either, and — because the hair and the legs advance on the
same `dt` in the same substep — no differential slow motion between them can
exist at all. The two numbers are **kept** (not deleted) purely as a guard for a
future caller that is not sub-stepped, e.g. a harness calling
`animator.update(realDt, t)` directly; the comment block above `MAX_SUB` in
`src/entities/playerAnimator.js` now says exactly that, and the `_springs` clamp
comment no longer claims the ceiling ever bound.

**A33’s fix is gate-side.** Weigh it as such: the physical clauses
(`p2p ≥ 0.04 m`, `oscP2P ≥ 0.03 m`, `restDev ≥ 0.012 m`) and the ±15 % footfall
lock all still have to pass, and the only thing that changed is what the lock is
measured against — the cadence that actually happened instead of a nominal one
in a different time base. Nothing in the rig was fixed for A33, and nothing in
the rig needed to be. (The three other rig-side fixes in §6b — the elbow roll,
the two-pass foot lock, the pelvis feed-forward, plus §6b.1’s head-stabilisation
fade and the flourish trapezoid — are unaffected by this correction; each moves
a number the judge can re-measure.)


### 6c.1 The roll's tail (`A27-timescale-safe`, found by this round's own full run)

`A27` asserts `after.rollWeight < 0.05` once the dodge has resolved. It read
**0.0672** and FAILED. Not flaky and not the timescale half — the exit crossfade
in `locomotion.js` ran at 9/s, so 0.283 s after `dodging` cleared the one-shot
still carried `e^-(9 × 0.283)` = 0.067 of the pose: a finished roll measurably
still on stage, and an asymptote that never actually reaches zero. The exit rate
is now 15/s with a snap to 0 below 0.012 (the ENTRY rate, 34/s, is untouched —
that one is the read). Re-measured: `rollWeight` **0** at `rollIntentHeldFor`
0.444 s, `stuck: []`, `A27-timescale-safe` **PASS**. `A2-dodge-displacement`
5.13 m, `A14-dodge-zero-dt`, `A12-clip-driven` (`Sprint_Loop` at weight 1.00)
and `A19-secondary-motion` all still PASS on the same tree.

## 6d. RESIDUE ROUND — `A33-hair-bounce` re-run reproducibility

`judge-player-anim-r2`'s last verdict left one serious finding: *"A33-hair-bounce
still fails a clean re-run (1 FAIL + 1 PENDING in 4 runs); §6b/§7 claim it is now
reproducible."* Its proposed fix was to raise the resolvability floor to ≥ 8 gait
cycles and ~6× `footHz` sampling **or** hold her on flat ground long enough.
Both halves are done, and the gate is the only file that moved — nothing in the
rig was touched, exactly as §6c says nothing needed to be.

**What made a re-run unreadable: a wall-clock window.** A fixed 5.5 s window buys
a number of gait cycles that depends on how busy the box is (13.7 footfalls at
14 fps here against 19.9 at 24 fps), so the judge's sixteen-lane box got windows
the estimator could not read and reported PENDING. The window is now closed by
the **gait**, not by the clock: it runs until `loco.phase` has banked
`FOOT_TARGET` = 20 footfalls, which is frame-rate invariant. Distance (46 m of a
50 m runway) and a 45 s hang guard are the only other bounds, and the floor the
judge asked for is asserted on top: **≥ 16 footfalls (8 gait cycles)**,
≥ 4 samples per footfall, peak ≥ 4× the scan's median power, significance ≥ 0.15.

`MAX_FRAME` is what makes the sampling half free: the sim advances at most
0.05 s per frame, so samples-per-footfall has a **floor of ~5.3 at any frame
rate below 20 fps** (measured 5.33 at 17 fps, 5.35 at 6.3 fps, 5.16 at 3.7 fps,
8.06 at 30 fps, 15.9 at 60 fps) — the bar is 4, and it is the wall clock, never
the sampler, that used to run out.

**Reproducibility, measured — eleven consecutive clean runs of the shipped
assert** under a synthetic `engine.onAfterRender` frame hog (the §6c probe
technique), spanning a 16× range of frame rate:

| fps | footfalls banked | samples/footfall | ratio [0.85–1.15] | contrast | verdict |
|---|---|---|---|---|---|
| 60.3 / 30.1 | 20.05 / 20.10 | 15.9 / 8.1 | 1.000 / 1.000 | 258 / 171 | PASS |
| 19.2 / 18.8 / 18.3 / 18.1 / 17.1 / 16.9 | 20.0–20.1 | 5.33–5.34 | 0.995–1.000 | 217–321 | PASS |
| 6.3 / 6.3 | 20.01 / 20.01 | 5.35 | 1.000 / 1.000 | 151 / 153 | PASS |
| 3.7 | 20.15 | 5.16 | 0.995 | 71 | PASS |

Zero FAIL, zero PENDING, no console errors. Two changes bought the bottom row:

- **The hang guard went 25 s → 45 s.** It is a guard, not a measurement bound,
  so it is sized off the assert's own 95 s budget. Footfalls banked per wall
  second are `fps × MAX_FRAME × footHz` = 0.19 × fps, so 45 s banks the full 20
  at 2.4 fps and still clears the 16-footfall floor at 1.9 fps. At 3.7 fps the
  old 25 s deadline cut the window at 17.6 footfalls (still a PASS, ratio
  0.995); the same run now banks 20.15 in 28.2 s, 35 m downrange.
- **The unexplained FAIL is named.** That run carried nothing but *"Cannot read
  properties of undefined (reading '9')"*. `9` is `idx × 3` for
  `dyn_hairBackMain_04`, which sits 4th in its chain — i.e. `chain.pos` was
  undefined at the deviation read: a chain that exists with no Verlet state
  allocated. It is still a **FAIL** (an unmeasurable deviation clause has not
  passed), but it now returns `{chainLinks, chainIndex, note}` instead of a
  bare message, and the whole assert stays inside the fix-round-4 try/catch that
  reports `threw` + `stack`. It has not recurred in any run since.

No clause was weakened for any of this: `p2p ≥ 0.04`, `oscP2P ≥ 0.03`,
`restDev ≥ 0.012`, `restDevMax ≤ 0.35`, median sprint > 6.1 m/s and the ±15 %
footfall lock are all still asserted, and the lock SKIPs — never passes — when
the window genuinely cannot be read.

## 6e. FIXED — the aim-strafe skate, and why the old measurement of it was wrong

**This section replaces an earlier one that got this wrong in both directions.**
It recorded the defect as 0.1154 / 0.1177 m, load-only, "does not reproduce
standalone", and "never attributable", and it reasoned from a peak
`maxLockErr` of 0.2583 against a 0.3 m cap that the anchor had *not* yet slid.
All four claims were artefacts of a hole in the gate, and
`judge-player-anim-r2` found the hole. Corrected below, then fixed.

### The hole in the gate (blocker)

`A31b` sampled for 3000 ms and scored a stance window only in the branch that
runs when the foot **lifts**. A window still open when the loop expired was
dropped on the floor. On aim-strafe-left the dropped stance is deterministically
the long, saturated one, so the gate's own numbers were a survey of the
*healthy* stances: the judge ran the gate's exact 3 s logic and measured eight
closed windows at ≤ 0.0014 m — a clean PASS — beside an open stance that had
already travelled **0.3433 m** with `lock.errM` pinned at `capM` 0.3000, and
**0.4469 m** when a 6 s window let that same stance close. Four further probes:
**0.3676 / 0.5706 / 0.4790 / 0.1277 m**, every one of them strafe-LEFT, every
one with the lock at exactly 0.3000, longest frame 41–49 ms (not a hitch).

`closeWin()` is now called both on lift and once after the sampling loop, so
the trailing stance is scored like any other. `isLast` survives as a
diagnostic; it is no longer the difference between measured and invisible.
With that one change and nothing else, the gate went red on this tree at
**0.3694 m** — and, importantly, on a window with `isLast: false`: once the long
stance is reachable at all it also shows up mid-run, so this was never only a
trailing-window artefact.

The real range is therefore **0.13–0.57 m, deterministic, standalone, no load
required, strafe-left, with the lock saturated at its cap on every run** — 3–5×
what the old section recorded, and not the "unattributable" number it called it.

### The cause: the master phase runs BACKWARD through a stance

`maxLockErr 0.2583` was never evidence the anchor had held; it was one sample
on the way to 0.3000. What drives it there is not the lock at all:

```
locomotion.js  let rev = 1;
               if (Math.abs(a) > Math.PI / 2) { rev = -1; a = ... }
```

A pure sidestep sits **exactly** on that boundary — measured moveAngle +1.5708
strafing left, −1.5708 strafing right — so which side of the test a frame lands
on is decided by the last bit of a float. Every flip sends `rev` from +1 to −1,
`this.reverse` is *damped* toward it, and while it crosses zero the master gait
phase stalls and then reverses. Filmed per frame on an aim-strafe-left, phase
and the right foot's lock error over eight consecutive frames:

```
phase   0.729  0.724  0.716  0.706  0.693  0.680  0.664  0.648  0.618  0.600
lockErr 0.059  0.104  0.150  0.168  0.184  0.199  0.211  0.222  0.232  0.248 -> 0.300
```

A planted foot stays planted because its clip travel cancels the character's
translation. A backward phase does not merely stop cancelling it, it **adds**
to it — which is why the error rate through that stance (~0.96 m/s) is most of
her 1.36 m/s travel, far more than any steady drift could produce, and why the
budget ran out in half a second.

### The second source: 0.28 rad of move angle the leg yaw never covered

An earlier round moved the strafe yaw cap off the pelvis (which reorders the hip
joints and crosses the legs) and onto the thighs (which do not). It also
lowered the total: `PELV_MAX + HIP_MAX` went 0.78 + 0.62 = 1.40 rad to
0.34 + 0.95 = **1.29** rad, against a sidestep's π/2 = 1.5708. The uncovered
0.28 rad aims the stance foot's clip travel 16° off the direction she actually
moves, a standing `speed · sin(0.28)` = **0.37 m/s** drift that the lock ate
silently — 0.176–0.190 m of a 0.3 m budget on a healthy stance, i.e. ~60 % of
the cap already spent before anything went wrong.

### What shipped

| file | change |
| --- | --- |
| `tools/gates.round4.player-anim.mjs` | `A31b`: `closeWin()` on lift **and** after the loop |
| `src/entities/anim/locomotion.js` | `REV_HYST = 0.15` rad deadband on the clip-mirror decision, latched in `this._revSign` |
| `src/entities/anim/locomotion.js` | `HIP_MAX` 0.95 → **1.24**, so `PELV_MAX + HIP_MAX ≥ π/2` |

The mirror exists only so the loop plays forward when she travels forward and
backward when she backpedals; at |a| ≈ π/2 the two are equally correct and the
choice is pure noise, so holding the previous one is strictly better. 0.15 rad
(8.6°) is orders of magnitude wider than the jitter and far narrower than any
real forward↔backpedal transition, which crosses by a radian or more. The
`HIP_MAX` raise spends the cap the module's own note already argues is the safe
one: a thigh yaw turns each leg's stride about its **own** hip joint and moves
no joint, so it cannot put the trailing foot on the far side of the lead one.
Below a 1.29 rad move angle neither clamp is active, so forward, diagonal and
backpedal gaits are untouched.

`MAX_LOCK` is deliberately **not** raised and no reach-aware cap was added. The
judge offered that as the remedy; it treats the symptom. Removing the demand
instead leaves the cap doing the job it was written for (stopping a hard pivot
from dragging the leg into a split) with the budget no longer near it.

### After: measured across 16–60 fps, both directions

A synthetic frame hog (a per-frame busy-wait) driving 4 s of aim-strafe each way
at four load levels, closing **every** window including the trailing one:

```
KeyA  60.3 fps  14 stances  maxDrift 0.0021  maxLockErr 0.117
KeyD  58.8 fps  13 stances  maxDrift 0.0060  maxLockErr 0.135
KeyA  34.5 fps  13 stances  maxDrift 0.0009  maxLockErr 0.111
KeyD  39.8 fps  13 stances  maxDrift 0.0072  maxLockErr 0.144
KeyA  24.5 fps  13 stances  maxDrift 0.0020  maxLockErr 0.111
KeyD  24.5 fps  13 stances  maxDrift 0.0034  maxLockErr 0.109
KeyA  16.3 fps  10 stances  maxDrift 0.0016  maxLockErr 0.105
KeyD  16.3 fps  10 stances  maxDrift 0.0052  maxLockErr 0.118
```

Worst drift **0.0072 m** against the 0.06 m bar (was 0.37–0.57 m); worst lock
use **0.144 of 0.300**, 48 % of budget where the failing runs were pinned at
100 %. The stance-width side improved with it: `minSepM` on strafe-left went
**0.094 → 0.255 m**.

**The `HIP_MAX` raise was A/B'd on film before it shipped.**
`shots/pa-r2f1-film-hip095.png` (0.95) and `shots/pa-r2f1-film-hip124.png`
(1.24), same staging, same 2.2 s into the same aim-strafe-left: the track is
the same width and the stance reads the same; the 1.24 pose simply points both
feet further along the travel line, which is what a sidestep does. The measured
half of the trade is the lock budget — worst use 0.190 of 0.300 at 0.95 versus
0.144 at 1.24 over the same eight-run load sweep, with drift 0.0079 → 0.0072 m.
Both pass; 1.24 ships because the budget it leaves is what the failing runs ran
out of.

**On film, at the judge's angle.** `shots/pa-r2f1-skate-film-fixed.png` — camera
nailed to world space so the ground is pixel-identical across the strip, cropped
on the planted right boot, three frames spanning one stance: the boot's contact
patch does not move (**0.0005 m** of world travel) while she travels 0.33 m
left. The boot rolls onto its toe, which is toe-off, not slide.

## 6f. FIXED — the mirror latch outlived the transition that set it

`judge-player-anim-r2` (**blocker**). §6e put a 0.15 rad deadband on the clip
mirror so a float at |moveAngle| = π/2 could not flip it. That fixed the jitter
and introduced a worse thing: the latch was re-applied **every frame**, so a
sign could live inside the deadband forever.

```js
const bound = Math.PI / 2 + (this._revSign < 0 ? -REV_HYST : REV_HYST);
let rev = Math.abs(a) > bound ? -1 : 1;
this._revSign = rev;
```

With the latch at −1 the boundary sits at π/2 − 0.15 = **1.4208**, and a pure
sidestep's |moveAngle| is **1.5708** — permanently on the mirrored side. So a
strafe entered straight out of a **backpedal** (aim held, `KeyS` released and
`KeyA` pressed the same frame) ran the *entire* sidestep with `rev = −1` and the
gait phase running backward, and the trailing (left) ball skated.

**Reproduced before anything was changed** (probe on port 5205, same staging and
the same planted + |above| < 0.05 m stance rule `A31b` uses):

```
control      (standing start -> KeyA)   revSign +1   phase backward   0/86 frames
                                        L drift 0.0001-0.0003 m · R 0.0006-0.0017
fromBackpedal (KeyS -> KeyA)            revSign -1   phase backward 101/102 frames
                                        L drift 0.0176 / 0.0477 / 0.0551 / 0.0560 / 0.0670 m
                                        R drift 0.0007-0.0019 m
```

Left-ball drift over the 0.06 m bar on the last window, the right foot clean —
the asymmetry a mirrored clip predicts. Unlike §6e this is **not** lock
saturation: `lock.errM` peaked at 0.037 of the 0.300 m cap, so the lock never
engaged; the anchor was simply being walked backwards under a planted foot.

### The fix: move BOTH boundaries above π/2

Hysteresis is still what stops jitter from flipping the mirror; the deadband
simply must not *contain* the sidestep angle. Both switching boundaries now sit
above π/2 — the hysteresis is biased, not centred:

```js
const REV_HYST = 0.15;   // +1 -> -1 when |a| > PI/2 + 0.15   (98.6 deg)
const REV_BIAS = 0.05;   // -1 -> +1 when |a| < PI/2 + 0.05   (92.9 deg)
const bound = Math.PI / 2 + (this._revSign < 0 ? REV_BIAS : REV_HYST);
const rev = Math.abs(a) > bound ? -1 : 1;
this._revSign = rev;
```

The band between them is 0.1 rad — far wider than any jitter — but a pure
sidestep at 1.5708 is **below both boundaries**, so it resolves to the forward
loop from either latch state, in one frame, with no timer and no memory of how
it was entered. Between π/2 and π/2 + 0.15 the two mirrors are equally good (the
stride is perpendicular either way), which is exactly what makes the bias free
to spend; a real backpedal is |a| ≈ π and nowhere near it.

**A time-based entry latch was tried first and measured worse.** Holding the
entry sign for 0.3 s after |a| reached a centred deadband still ran the gait
mirrored **0.94 s** into the sidestep (60 of 109 frames backward) and left a
0.0356 m stance in the transition; the biased boundary flips at 0.85 s, during
the redirect itself, which is where a forward/backpedal flip belongs. The
timer, and the `_revBandT` state it needed, are gone.

### After: every entry path, measured

```
sustained sidestep from a backpedal  revSign +1  phase backward 0/165
                                     L 0.0002-0.0005 m · R 0.0011-0.0021 m
sustained sidestep, standing start   revSign +1  phase backward 0/179
                                     L 0.0000-0.0004 m · R 0.0009-0.0018 m
backpedal (KeyS held)                revSign -1  phase backward 97/97   (the mirror still works)
strafe from a forward run            revSign +1  phase backward  0/92   L 0.0038 · R 0.0008 m
forward -> backpedal                 revSign -1  phase backward 90/90   (transition still crosses)
strafe -> backpedal                  revSign -1  phase backward 63/63   (the band EXIT still reaches -1)
```

**On film, at the judge's angle.** Camera nailed to world space, one stance,
the left ball's world path projected onto the frame as a trail (green = first
planted sample, yellow = last) against a 0.10 m world-space ruler:

* `shots/pa-r3-strafe-from-backpedal-before.png` — sticky latch: `revSign −1`,
  the trail walks **0.0557 m** off the touchdown point while she travels
  0.5167 m, over 22 planted frames.
* `shots/pa-r3-strafe-from-backpedal-fixed.png` — same entry, same angle:
  `revSign +1`, start and end dots on top of each other, **0.0002 m** of ball
  travel against 0.5163 m of body travel over 22 planted frames.

## 6g. FIXED — `A31b` could not resolve on a loaded box

`judge-player-anim-r2` (**major**). Two defects, both of them ones this lane had
already fixed elsewhere and not applied to its own gate.

**Wall clock.** The sampling window was a fixed 3000 ms, so the number of
stances it bought depended on how busy the box was — the same defect §6d fixed
for `A33` by banking footfalls. It now runs until the gait has banked
`FOOT_TARGET` = **8 footfalls** off `loco.phase` (≈ 4 stances per foot at any
frame rate, twice the 2-window floor). The 30 s wall clock and 900-frame bounds
that remain are hang guards, not measurement bounds: 8 footfalls is banked down
to ~2.2 fps.

**An all-or-nothing hitch discard.** `hitchMs` floored at 100 ms and any window
containing one slower frame was thrown away whole, which on a loaded box is
every window. Measured: quiet box PASS with 9 windows; the same box running this
lane's own 8-gate suite gave `R 0 windows / 5 hitched, L 0 / 6` and *SKIP*. A
SKIP does not fail a run, so with §6f live the gate was silent on exactly the
runs the audit's sixteen-lane working condition produces.

A long frame can only ever **inflate** a drift reading, never deflate one, and
the inflation is bounded by how far she travels in that frame. So the filter is
now applied only where it can change a verdict: every stance with ≥ 3 samples is
scored and reported, and a window is set aside as *unresolvable* only when it
**both** fails the 0.06 m bar **and** its own longest frame could account for the
whole reading (`dt × speed ≥ drift`). SKIP is the last resort — fewer than 2
resolved windows, or more unresolvable than resolved.

That rule is not a loophole: the §6f slide is 0.0703 m in a window whose longest
frame is 39 ms (0.0525 m of travel), so it is **not** explainable and it fails
the gate.

**The gate now runs four passes, not two.** Both `run()` calls used to clear the
keys, re-stage and press one key, so every pass entered from a standing start —
where the latch is always +1. `entry` now stages `stand` (unchanged), `back`
(backpedal → strafe) and `fwd` (run → strafe), aim pressed before the entry move
and never released. Both directions get a standing start and a transition.
`revSign`, `reverse`, `phaseBackFrames`, `footfalls`, `fps` and per-pass
`unresolved[]` are reported so a future failure carries its own cause.

**Regression-checked against the bug it exists to catch.** With the latch made
sticky again (`REV_DWELL` raised, nothing else touched), the gate goes red and
names the pass:

```
R-stand  rev  1  back  0/69  win 9  unres 0  maxDrift 0.0044
L-stand  rev  1  back  0/81  win 9  unres 0  maxDrift 0.0022
L-back   rev -1  back 82/83  win 9  unres 0  maxDrift 0.0703   <- worst frame 39 ms
R-fwd    rev  1  back  0/61  win 9  unres 0  maxDrift 0.0036      could explain 0.0525
failing: [ 'L-back' ]
```

**And it resolves under load.** Inside the lane's own 8-gate suite — the run the
judge saw report `R 0 windows / 5 hitched, L 0 / 6, SKIP` — with two of the four
passes at 22–24 fps:

```
R-stand  fps 23.8  8.02 footfalls  8 windows  0 unresolvable  maxDrift 0.0027
L-stand  fps 30.6  8.04 footfalls  9 windows  0 unresolvable  maxDrift 0.0025
L-back   fps 22.6  8.00 footfalls  9 windows  0 unresolvable  maxDrift 0.0018
R-fwd    fps 51.7  8.05 footfalls  8 windows  0 unresolvable  maxDrift 0.0063
```

Every pass banks its 8 footfalls whatever the frame rate buys, and no window is
discarded.

> **CORRECTION (fix round 8).** This paragraph used to end "…so the verdict no
> longer depends on how busy the box is." That was true of the *sampling* — the
> footfall window is genuinely frame-rate-invariant — and **false of the
> verdict**, for exactly the runs that matter: the set-aside rule below scaled
> its excuse with the frame time, so a slide *grazing* the 0.06 m bar was
> excused on any loaded box. §6h is the fix; read it before trusting the
> sentence this one replaced.

The gate's timeout is 185 s for the four passes (was 90 s for two); no bar,
clause or filter was weakened.

## 6h. FIXED — the set-aside rule's excuse grew with the frame time

`judge-player-anim-r2` (**major**), against §6g's own rule: a window that fails
the drift bar is set aside as unresolvable when its longest frame could account
for the reading, `(maxDt/1000) × speed ≥ drift`. `speed` is the aim-strafe's
1.32–1.36 m/s, so the excuse covers the whole 0.06 m bar at **44 ms — about
22 fps** — and keeps growing below that. Measured on this box, a **passing**
lane run at 14.5–15.4 fps:

| pass | fps | longest frame | old excuse (body travel) | new excuse (lock-bounded) |
| --- | --- | --- | --- | --- |
| R-stand | 15.2 | 89 ms | **0.1162 m** | 0.0686 m |
| L-stand | 15.4 | 66 ms | **0.0895 m** | 0.0361 m |
| L-back | 14.5 | 77 ms | **0.1022 m** | 0.0392 m |
| R-fwd | 15.3 | 107 ms | **0.1423 m** | 0.1262 m |

The §6f blocker's own slides were 0.0176–0.0670 m. Every one of them is below
three of those four old excuses, so the gate written to catch it would have
filed it `unresolved` and — since unresolvable windows only stopped a pass when
they *outnumbered* the resolved ones, and nothing in the verdict printed them —
**read PASS**. Three changes, all tightening:

1. **The mirror clause, checked first and unskippable.** Every clause this gate
   had was a drift measurement, and a drift measurement can always be argued
   with. The failure mode has a second signature no frame time can fake: a
   sidestep on the mirrored clip runs the master gait phase **backward**. All
   four passes are sustained sidesteps and all four settle to `+1` by design
   (§6f), so `revSign === 1 && phaseBackFrames === 0` is a binary. It is
   evaluated **before** the SKIP branch, so a mirrored run is red whatever its
   windows did.
2. **The excuse is bounded by the foot lock, not by body travel.** The ball
   rides `anchor + IK residual`; the anchor does not move until the correction
   saturates `MAX_LOCK` (`_footLock`). While the lock is unsaturated the ball
   cannot travel further than the correction it was holding — `lock.errM`,
   which `debugFeet()` already publishes — so `explainM = min(body travel,
   maxLockErrM)`, and body travel alone only once `errM` pins at `capM` and the
   anchor really is sliding. Against §6f's blocker (`errM` peaked at 0.037 of
   the 0.300 cap while the left ball slid 0.067 m) that is 0.037 < 0.067 **at
   any frame rate**.
3. **An unresolvable window is visible.** Every set-aside window is by
   construction over the bar, so any of them means the pass did not settle the
   question: the run is yellow (SKIP), not green. It used to take
   `unresolvable > resolved`.

**Regression, measured.** With the §6f latch made sticky again (`REV_BIAS`
back to −0.15) the gate goes **red** and names it, on both signals at once:

```
[FAIL] A31b-aim-strafe-skate-player-anim
  L-back  rev -1  back 95/96  drifts 0.002 0.0154 0.0664 0.0855 0.0612 …
          maxDrift 0.0855  windows 9  unresolvable 0
          worst: lockErr 0.0409  body travel 0.0581  -> could explain 0.0409
  failing: ['L-back']
  note: MIRRORED: L-back rev -1, 95/96 frames of backward gait phase
```

**The pair, on film, at one camera.** With the sticky latch back in
(`shots/pa-r4-strafe-from-backpedal-blocker.png`, 48 fps, quiet box): `revSign
-1`, **143 / 144 backward gait-phase frames**, and the left ball walking
0.0560 / 0.0479 / 0.0519 / **0.0645** m per stance — the inset shows the six
samples strung out across two thirds of the 0.10 m ruler. The lock held only
0.037 m of its 0.300 m cap on that stance, so the new excuse is 0.0366 m and
every one of those slides is a real FAIL; the old excuse was 0.0487 m *at
48 fps* and would already have swallowed two of the four, and at the 15 fps the
suite actually runs it would have been ~0.12 m and swallowed all four.

**On film**, the same entry the clauses are about, taken while the rest of the
suite was running (13–32 fps, longest frame 96–109 ms — the judge's regime):
`shots/pa-r4-strafe-from-backpedal-verify.png`. Overlaid on the frame: the
sidestep entered from a backpedal with aim never released, `revSign +1`,
**0 / 97 backward gait-phase frames**, the five left-ball stances at 0.0013 /
0.0003 / 0.0003 / 0.0002 / 0.0001 m against the 0.06 m bar, and an inset that
redraws one stance's six samples in world XZ at 0.10 m = 200 px — 0.0001 m is a
fifth of a pixel, so all six dots land on one another. The same overlay prints
both excuses for that stance side by side: **0.0987 m** of body travel in its
longest frame (what the old rule would have allowed) against **0.0678 m** of
lock budget actually held (what the new one allows).

Three windows over the bar, **none of them excused** (the old rule's 0.0581 m
of body travel covered the 0.0664 and 0.0612 m ones outright, and at the
judge's cited 67–78 ms frames it would have covered all three). R-stand,
L-stand and R-fwd stayed green in the same run, so the gate still separates the
mirrored entry from the three that are fine.

**The SKIP path was exercised too**, with a throwaway copy of the gate whose
bar is dropped to 1 mm (`--extra`, id `ZZ-probe-unresolvable`) so ordinary
2 mm stances go over a bar the 0.04–0.10 m lock budget dwarfs — the exact shape
of an unresolvable window. Verdict: **PENDING**, `R-stand resolved 5 /
unresolvable 4 (worst 0.0029 m, lock 0.0899 m)`. Under the old rule 4 > 5 is
false and that run read PASS.

## 7. Gate output (`node tools/gates.mjs --port 5205 --lane player-anim`)

Every action gate in the §4 block passes, with the margin the fix round was
about (bars in brackets). The numbers below are from the FIX ROUND 2 tree — the
one where `A31b` scores the trailing stance and the strafe no longer reverses
its own gait phase (§6e); the `A33` block is the residue round's and is
unchanged by it:

```
[PASS] A33-hair-bounce      sampleHz 45.2 · worldYp2p 1.400 · detrendedYp2p 0.127
                            hairHz 3.75 vs MEASURED footfall 3.75 -> ratio 1.000 [0.85-1.15]
                            20.05 footfalls [>=16] · 12.1 samples/footfall [>=4]
                            peak contrast 202.5 [>=4] · significance 0.619 [>=0.15]
                            median sprint 6.82 m/s [>6.1] · 43.4 m of runway [<46]
                            restDeviationP2P 0.169 [>=0.012] / max 0.173 [<=0.35]
[PASS] A34-chains-driven    205/271 dyn_ bones > 0.5 deg [180] · 66 chains · nonFinite 0
[PASS] A35-cheek-anchor     up/level/down at full draw: handToHead 0.145-0.156 m [0.10-0.16],
                            behindFace +0.058..+0.065 [>0], bowElbow 167.93-167.94 deg [165-172]
[PASS] A36-hit-react-visible  peak lean 18.18 deg [12], decay 0.603 s [>0.45],
                            dominant = hitChest, 100 -> 86 hp
[PASS] A31b-aim-strafe-skate-player-anim  FOUR passes (fix round 4, 6h) —
                            the whole lane suite was running, so 14.5-15.4 fps:
                            R-stand  15.2 fps  8.09 ff  9 win  0 unresolvable
                                     maxDrift 0.0022 m [0.06]  rev +1  back 0/…
                            L-stand  15.4 fps  8.08 ff  9 win  0 unresolvable
                                     maxDrift 0.0016 m         rev +1  back 0
                            L-back   14.5 fps  8.13 ff  9 win  0 unresolvable
                                     maxDrift 0.0015 m         rev +1  back 0
                            R-fwd    15.3 fps  8.08 ff  9 win  0 unresolvable
                                     maxDrift 0.0043 m         rev +1  back 0
                            crossedFrac 0 on all four [<=0.02]; 3.0-3.1 steps/s
                            worst window's excuse, lock-bounded [6h.2]:
                                     0.0686 / 0.0361 / 0.0392 / 0.1262 m
                                     (body travel alone: 0.1162 / 0.0895 /
                                      0.1022 / 0.1423 — what the old rule allowed)
                            (every window scored — 6e; window closed by footfalls
                             — 6g; mirror clause first, excuse bounded by the
                             foot lock, unresolvable windows visible — 6h)
[PASS] A18b-slope-conform-moving  downhill p90 clear 0.0060 m [0.05] / worst 0.0067 [0.12],
                            uphill p90 0.0036 · p90 sole tilt 6.0 / 1.9 deg [22]
[NEEDS-JUDGE] V23-secondary-motion
[NEEDS-JUDGE] V24-draw-vs-reference

8 gates: 6 pass, 2 need judging
```

**FIX ROUND 4, full suite on port 5205** (the suite is 187 gates now; six lanes
added gates since fix round 3's 181). The runner was killed by the harness one
gate from the end, so the tally below is counted from its own per-gate lines
and the last gate (`A61c-datapoints-unified`, another lane's) was re-run on its
own — it passes:

```
186 of 187 gates ran: 140 pass, 12 fail, 3 pending, 31 need judging
+ A61c-datapoints-unified   PASS (re-run alone)
```

**Five of those twelve FAILs are contention artefacts, not regressions**, and
all five pass when re-run on a quiet box — `A20b-no-system-errors` was failing
while reporting `systemErrors: []` and `hookErrors: 0` (92 frames advanced
under load, 232 on the re-run), and `A19-secondary-motion` was reading
`afterStopRangeDeg` 0 on every chain:

```
node tools/gates.mjs --port 5205 --only A10-loot-single-render,A19-secondary-motion,\
  A20b-no-system-errors,A47b-corpse-posed,A60-stealth-lanes,A61c-datapoints-unified
6 gates: 6 pass
```

That leaves the standing seven: `A90-memory-stability`, `A17-draw-beats`,
`A48-cadence`, `A47c-corpse-mass`, `A31b-no-ghost-without-occluder`,
`A23-aim-cost`, `A23b-hull-fidelity`, with `A9-perf-budget`,
`A21-real-draw-calls` and `A31-aim-strafe-skate` pending — **the same count as
fix round 3, and every one of them another lane's**. `A21` and `A23` swapped
FAIL↔PENDING between the two runs; both are load-sensitive and neither is
this lane's. Nothing in fix round 4 can have moved any of them: the round
changed `tools/gates.round4.player-anim.mjs` and this document and **no runtime
file at all** (`src/entities/anim/locomotion.js` is byte-identical to the fix
round 3 tree — `git diff` against it is empty).

All seven FAILs and all three PENDINGs belong to other lanes and to the standing
set — `A90-memory-stability`, `A17-draw-beats`, `A21-real-draw-calls`,
`A48-cadence`, `A47c-corpse-mass`, `A31b-no-ghost-without-occluder`,
`A23b-hull-fidelity`; PENDING `A9-perf-budget`, `A13-no-skate`, `A23-aim-cost`.
**No new FAIL, and this lane's six action gates all PASS inside that run** —
`A31b` among them with 9 scored windows and 0 unresolvable on every one of its
four passes. So do every cross-lane consumer of the foot lock and the gait
phase: `A12-clip-driven`, `A18-slope-conform`, `A28-run-cadence` (2.94 steps/s
at run), and the animator lane's own `A31-aim-strafe-skate` at **0.0044 m**,
7 windows, 0 hitched.

**FIX ROUND 2, full suite on port 5205** (two other lanes running their own
suites on the same box throughout):

```
185 gates: 146 pass, 8 fail, 0 pending, 31 need judging
```

All eight FAILs belong to other lanes and to the standing set —
`A90-memory-stability`, `A9-perf-budget`, `A17-draw-beats`,
`A21-real-draw-calls`, `A47c-corpse-mass`, `A31b-no-ghost-without-occluder`,
`A23-aim-cost`, `A23b-hull-fidelity` (the perf/draw-call three are budget gates
measured with three suites sharing one GPU). **This lane's six action gates all
PASS inside that run**, `A31b` among them at maxDrift **0.0065 / 0.0019 m** with
`maxLockErr` 0.132 / 0.037 of the 0.3 m cap and 10 + 10 scored windows. So do
every cross-lane consumer of the foot lock and the gait phase: `A12-clip-driven`
(`Sprint_Loop` dominant at 1.00), **`A13-no-skate` 0.0009 m** (it was in the
standing FAIL set for the previous three runs), `A18-slope-conform`,
`A28-run-cadence` (2.94 / 3.59 steps/s), `A31-aim-strafe-skate` 0.0049 m.

**Residue round, full suite on port 5205, three times back to back** (the runs
the old §6e reasoned from — kept for comparison):

```
run 1: 181 gates: 139 pass, 9 fail, 2 pending, 31 need judging
run 2: 185 gates: 142 pass, 9 fail, 3 pending, 31 need judging
run 3: 185 gates: 142 pass, 11 fail, 1 pending, 31 need judging
```

In those three, every FAIL belongs to another lane and to the standing set
(`A90-memory-stability`, `A17-draw-beats`, `A21-real-draw-calls`,
`A44-socket-integrity`, `A48-cadence`, `A47c-corpse-mass`, `A23b-hull-fidelity`,
plus `A13-no-skate`, `A20b-no-system-errors`, `A47b-corpse-posed`,
`A23-aim-cost` and `A31b-no-ghost-without-occluder` — several of them lanes
mid-edit while these ran) except this lane's
`A31b-aim-strafe-skate-player-anim`, which failed in runs 1 and 2 and **passed
in run 3** (0.0057 / 0.0017 m); it is §6e. This lane's other five action gates
passed in all three. `A33-hair-bounce` in particular passed every full run —
ratio **0.995** at 21.8 fps (20.1 footfalls), **1.000** at 44.1 fps, **1.000**
at 42.6 fps — which is the residue finding's actual subject: the gate is now
readable under exactly the load that used to make it report PENDING.

**A cross-lane note on the full suite.** In the fix-round-2 full run
(`140 gates: 87 pass, 20 fail`), `A34` / `A35` / `A36` / `A31b` / `A18b` all
printed FAIL with `failing: []` and every clause inside the bar. The cause is
not in the detail the runner prints: `tools/gates.mjs:489-491` turns any console
error into an action-gate FAIL, and `shots/gates/report.json` shows all five
carrying the same one —
`THREE.WebGLProgram: Shader Error … ERROR: 0:1633: 'nJit' : redefinition`, the
terrain material, mid-edit on `world-ground`'s side while the suite ran.
`src/world/terrain.js` declares `nJit` exactly once now, and re-run on the
current tree all six lane gates PASS (block above). Nothing was changed here for
it.

A clean full run on the repaired tree — **`140 gates: 98 pass, 10 fail, 4
pending, 28 need judging`** — has this lane's whole §4 block green inside it
(`A33-hair-bounce` ratio 1.033, `A34` 205/271, `A35` 0.147–0.159 m,
`A36` 16.9° / 0.615 s, `A31b` 0.0029 m, `A18b` p90 0.0060 m) together with
`A2` `A3` `A11` `A12` `A15` `A16` `A18` `A19` `A26` `A27` `A28-run-cadence`
`A32-draw-ramp` `A33-rig-finite`. The ten FAILs are
`A10-loot-single-render`, `A13-no-skate`, `A17-draw-beats`,
`A21-real-draw-calls`, `A20b-no-system-errors`, `A47-corpse-grounded`,
`A47c-corpse-mass`, `A48-cadence`, `A76-footfalls`, `A23b-hull-fidelity` —
none of them this lane's, and `A13` is the one worth naming: it read
`drifts [0.0012, 0.0013, 0, 0.0023, 0.0782]` with **4 of its 5 windows flagged
`hitched`**, i.e. four clean windows at ≤ 2.3 mm and one window the gate itself
knows the host stalled through. `A31b`, which filters hitches at the travel
speed it is measuring, read 0.0029 m on the same tree in the same run.

Under a **synthetic 12-16 fps load** (a 48 ms busy-wait pushed onto
`engine.onAfterRender`, which is what a concurrent full-suite run does to this
box), three repeats each:

```
A33   ratio 1.014 / 0.992 / 1.005   at 14.4 / 13.3 / 11.7 fps
A31b  maxDrift 0.0043 / 0.0024 m    at 15.6 fps (medDt 64 ms)
A18b  downhill p90 0.0076 / worst 0.0117 · uphill p90 0.027   at 15.6 fps
```

## 8. Verified regressions (nothing this lane touched went backwards)

From a full-suite run on port 5205 after the work landed:
`A2` displacement 6.01 · `A3` sprint 6.72 m/s · `A11` idle path 432 mm ·
**`A12` `Sprint_Loop` dominant at weight 1.00** (was 0.62–0.72 — the cadence
retime dropped its nominal speed below the canon, so the sprint node no longer
shares with jog) · **`A13` worst stance drift 0.0017 m** (was 0.0153 — the
retime did not cost no-skate, it improved it) · `A15` 1.95° / 1.98° ·
`A16` nock→hand 0.058 m · `A18` unchanged · **`A19` PASS** (was FAIL: hair 0.03°,
skirt 0.00° — the frozen-chain regression this lane was handed) ·
**`A33-rig-finite` PASS** (was a 30 s assert timeout).

Cross-lane, same tree: **`A28-run-cadence` PASS** — plain-W 2.92 steps/s /
0.19 flight / 1.67 m stride, sprint **3.58 steps/s** (was 2.97 against a 3.0
bar, the single clause that failed it) · **`A32-draw-ramp` PASS**, ramp
nock→hand 0.0375 m and `minHandHeadUnit` 0.96 (both better than before the
anchor clamp) · `A26-one-convention` and `A27-timescale-safe` PASS, so the new
`hitChest`/`hitHead`/`jump*`/`interact`/`pickup` layers are wired through
`ClipLayer` with intents the stuck detector can falsify ·
**`A31-aim-strafe-skate` now PASSES** rather than reporting SKIP — the
fix round's foot-lock refinement gave it eight and five clean stance windows
with `maxStanceDriftM` **0.0066 m** against its own 0.06 m bar, where before it
could not assemble two unhitched windows at 1.35 m/s. (Under a full-suite run it
can still SKIP on hitches, or hit its own 30 s assert timeout — its body is
~9 s of staged walking and this box was relaunching the browser 24 times in one
suite. Both are the host, not the measurement: run alone it passes.)

**Read that `A31` PASS as weaker than `A31b`'s, and not as a second
witness.** `tools/gates.config.mjs:992-995` scores a stance window only in its
`} else if (w) {` branch — the same hole `judge-player-anim-r2` found in `A31b`
(§6e) — so the stance still open when its 2600 ms loop expires is discarded, and
on aim-strafe-left that is the long one. Its hitch filter is also a flat 45 ms,
written for an 8 m/s sprint; at the 1.35 m/s aim-strafe a 45 ms frame moves her
0.06 m, i.e. the whole bar, so on a loaded box it discards nearly every window
and reports SKIP (the judge measured `L: windows 0, hitched 7 -> SKIP`). It is
the `animator` lane's gate and **nothing here touched it**; it is recorded so
that lane can close both, and until it does `A31b-aim-strafe-skate-player-anim`
is the only gate in the repo that actually measures Aloy's strafe-left plant.

## 9. Known gaps

- **CLOSED — the aim-strafe skate** (§6e). This used to be the top entry here,
  recorded as a deferrable 0.1154 / 0.1177 m that "does not reproduce
  standalone". It was neither: `A31b` was dropping the one stance that skated,
  and the real figure was **0.13–0.57 m, deterministic, standalone,
  strafe-left, with the foot lock pinned at its 0.3 m cap on every run**. Cause
  was a float-boundary flip of the clip-mirror test at |moveAngle| = π/2 that
  ran the master gait phase BACKWARD through a stance, plus 0.28 rad of move
  angle the leg-yaw caps never covered. Both fixed in
  `src/entities/anim/locomotion.js` (`REV_HYST`, `HIP_MAX`); the gate now scores
  every window. Worst drift across 16–60 fps and both directions is now
  **0.0072 m** against a 0.06 m bar, worst lock use 0.144 of 0.300.
  **Fix round 3 closed the other half of it** (§6f): the `REV_HYST` deadband was
  a persistent latch, so a strafe entered out of a **backpedal** ran the whole
  sidestep mirrored (0.0176–0.0670 m of left-ball slide per stance) and `A31b`
  could not see it, because both of its passes started from a stand. The
  hysteresis is now biased above π/2 and the gate runs the transition entries
  too.
- **The FIRST stance after any change of travel direction can still skate**, and
  it always could — this is the redirect, not the mirror. Sampling from the
  frame the key is pressed (no settle), the stance that is planted while the
  velocity swings reads 0.05–0.45 m with the foot lock pinned at its 0.3 m cap,
  on a standing start and a run→strafe as well as a backpedal→strafe, and it
  varies run to run with which foot happens to be down. No clip can cancel a
  travel direction that rotates under a planted foot; closing it needs either a
  plant-and-turn beat for lateral entries (the animator has one for >120°
  reversals only) or a shorter velocity-redirect time from `player-control`.
  Every gate in this lane, `A31b` included, measures the settled gait, so this
  is unmeasured by them — recorded here rather than left to be rediscovered.
- **`A31b`'s unresolvable-window rule still has a floor — but it is a LOCK
  budget now, not a frame rate** (§6h). ~~Below roughly 8 fps a genuine slide up
  to the bar would be filed unresolvable rather than failed.~~ **That figure was
  wrong by about 3× and the judge was right to say so**: the old excuse was
  body travel in the longest frame, which reaches the 0.06 m bar at 44 ms
  (~22 fps) and measured 0.0895–0.1423 m on a passing 15 fps run. The excuse is
  now `min(body travel, maxLockErrM)`, so it is bounded by what the foot lock
  was actually holding rather than by how busy the box is, and it collapses to
  0.037–0.04 m on the §6f blocker's own windows. What remains: on a stance
  where the lock legitimately holds a large correction (measured up to 0.126 m
  mid-stance on a healthy build) a slide of that size could still be set aside
  — but a set-aside window now makes the pass **SKIP rather than pass** (§6h.3)
  and `unresolved[]` prints its drift, longest frame, body travel, lock error
  and saturation, so no such window can read green. The one clause that is
  bounded by neither is the mirror check (`revSign`/`phaseBackFrames`), which
  no frame rate can excuse.
- **`A31-aim-strafe-skate` has the same window hole `A31b` just closed, and a
  hitch filter that cannot work at strafe speed** — `tools/gates.config.mjs`
  (`animator` lane, not editable from here). It scores a stance only when the
  foot lifts inside its 2600 ms loop, so the trailing stance is dropped, and its
  45 ms hitch bar is 0.06 m of travel at 1.35 m/s, so a loaded box discards
  every window and it SKIPs. It also enters the strafe only from a standing
  start, so the §6f mirror latch is invisible to it. Published here for that
  lane; see §8. **`A31b` no longer shares any of the three** — §6g banks
  footfalls, narrows the hitch discard to windows the hitch could actually
  explain, and runs the transition entries.
- **A real aim-strafe clip set is still missing** (this is the pack, not a bug).
  The sidestep remains a yawed, retimed `Walk_Loop`; it now tracks the travel
  line because the yaw covers the full π/2 and the phase runs monotonically, but
  a genuine side-step clip would carry a real weight shift and a lead/trail foot
  relationship that no amount of yaw can synthesise. Asset work, not code.
- **`A17-draw-beats` is frame-rate fragile, not broken.** Its `frames >= 8`
  clause counts rAF samples inside a **wall-clock** 700 ms window. Two changes
  on this side: `QUIVER_T` 0.28 → 0.34 s (HZD's reach beat is 0.25–0.35 s,
  and the dip to the hip quiver deepened from 0.154 m to well inside the 0.18 m
  bar), and the beat now advances by at most 1/9 of its window per frame, so it
  always renders **nine** frames however slow the host is — above ~24 fps the
  cap never binds and the beat is exactly the 0.34 s it was. What neither can
  fix is the window: measured during a concurrent full-suite run, a single rAF
  fired inside the whole 700 ms (≈1.4 fps, sixteen lanes on one GPU), so *no*
  animation can put eight frames in it. The gate lives in
  `tools/gates.config.mjs` (`core-platform`); its literal was not touched.
  **Fix round:** its OTHER clause is now clear with margin. The trapezoid dip
  (§6b.1) measured `minHandToQuiverM` **0.144 m** against the 0.18 m bar on the
  run that sampled the beat at all, where the half-sine read 0.220–0.238. What
  remains is purely `flourishFrames`, and that number is the host's frame count
  inside a 700 ms wall-clock window, not a property of the animation: because
  the beat's nine-frame floor already spans more than 700 ms below ~13 fps, the
  clause reads exactly "did this box render 8 frames in 0.7 s". Observed 0–6 on
  a loaded box, 8+ on a quiet one. This gate was failing for the same reason
  before the fix round; nothing here regressed it.
- **`A3-sprint-speed` and `A12-clip-driven` fail on staging, not on animation**
  — they measure 1.38 and 0.16 m/s because, unlike `A13`, they never teleport
  her off the spawn point. `docs/ROUND4-PLAYER-CONTROL.md` §0 already routes
  that fix to `core-platform`; both are in `gates.config.mjs`.
- **Downhill sole tilt is 16–24°** through a walking stance on a 20° face. That
  is largely the clip: descending, you land heel-first on a surface that is
  falling away. A true 4-way slope-adapted walk set would fix it; the conform
  cannot without deleting the clip's own ankle roll.
- **No strafe or backpedal clips exist in the pack.** `Strafe_Loop` is still a
  retimed, amplitude-warped `Walk_Loop` yawed onto the travel line. It no longer
  crosses or shuffles, but a baked 4-way aim set is the real fix.
- **The mantle is procedural** (reach → pull → plant); the pack has no clip.
- `Hit_Head` is used for the knockdown class rather than for headshots
  specifically — nothing publishes a hit location.
