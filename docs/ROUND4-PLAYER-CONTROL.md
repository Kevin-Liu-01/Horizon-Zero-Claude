# ROUND 4 — lane `player-control` API

Owner files: `src/entities/player.js`, `src/core/input.js`.
Gates: `tools/gates.round4.player-control.mjs` (`node tools/gates.mjs --port 5204 --lane player-control`).

Aloy is a **kinematic capsule** on `ctx.collision` (docs/ROUND4-SPATIAL.md). Every number
below is published on `ctx.player` every frame unless the table says otherwise. Read them;
do not write them — the two exceptions are the call-in methods in §4.

---

## §0 Actions required from other lanes

These cannot be done inside `player-control` without breaking file ownership.

### core-platform — `src/main.js`
`main.js` never calls `installSpatial(ctx)`. Until it does, `player.js` installs it itself
— the `if (!ctx.collision) installSpatial(ctx)` block at the top of the `Player`
constructor (`src/entities/player.js`, ~lines 475-497, with the `queueMicrotask(() =>
this._orderSystems())` that follows it) — and reorders `game.systems` so collision seeds
before the first player tick. **Add `installSpatial(ctx)` to `main.js` and delete that
constructor block and `_orderSystems` from `player.js`.**

### core-platform — `tools/gates.config.mjs` (5 gates, none owned by this lane)
The sprint canon moved from the retired 8.2 m/s to **6.8 m/s** (`player-anim-15`, §5), and
player collision became real. Five gates that were green in Round 3 now measure against
stale literals or against camp geometry:

| gate | what breaks | change |
|---|---|---|
| `A3-sprint-speed` | sprints from spawn (18, 27) **uphill into a tent** at z ≈ 32.6 and welds to it — `contactKind 'tent'`, `moveSpeed 0` for 100+ consecutive frames, which is the A24 head-on contract working as designed. Measured 2.55–3.53 m/s (band 6–9.5); the tent, not the clock — a quiet box reads *lower*, because she spends more of the window standing on it | add the teleport-to-open-ground step `A13-no-skate` already uses. Secondarily, measure in `engine.simTime` the way `A28b-canon-speeds` does: a loaded box makes wall-clock read ~0.7× true speed |
| `A12-clip-driven` | same spawn-into-tent staging — with her pinned on the tent the dominant clip is `Idle_Loop` at 0.938 and `speed` 0.18 | add the same teleport. Verified: staged on open ground, `Sprint_Loop` dominant weight rises to 0.62 → 0.72 (bar > 0.6) |
| `A12`, `A13-no-skate`, `A19-secondary-motion`, `A28-run-cadence` | each asserts `speed > 7.5`, a literal written against the retired 8.2 canon | `> 6.4`. Every *physical* bar in them still passes at 6.8 — measured on this tree: A19 hair 16.62 ≥ 8, skirt 9.23 ≥ 4, after-stop hair 9.21 ≥ 6; A28 runW 2.75 spm / 0.19 flight, sprint 3.01 spm / 0.42 flight |

`A20b-no-system-errors` is **not** this lane and not a literal: it reports
`systemErrors []`, `hookErrors 0` on every run — it misses only `frames > 120`
(94–105 measured), i.e. the frame budget, not correctness.

### player-anim — `A28-run-cadence` needs the retime, not just the literal
`A28-run-cadence` stages itself (it teleports to (-60, -45)), so its sprint bars are real
measurements, and `s.stepsPerSec >= 3.0` sits exactly on the knife edge at the new canon:
measured **2.98 at 6.61 m/s** and **3.01 at 6.68 m/s** on consecutive runs of this tree.
The `speed > 7.5 → 6.4` edit is necessary but **not sufficient** — the gate will flake.

The cause is that `Sprint_Loop` is nominally 7.72 m/s and is now driven at 0.88×.
`player-anim` should retime it against `ctx.player.speeds.sprint` (§1) — that is the reason
`speeds` is published at all. **Do not lower the 3.0 bar**; the cadence is a real HZD
property and the clip, not the bar, is what moved.

(Its other five bars pass at the new canon: `runW {2.74 spm, 0.21 flight, 4.90 m/s}`,
`sprint {flightFrac 0.48}`.)

### spatial — `src/core/collision.js`
Delete the two demo shims `attachPlayer()` and `attachCamera()` (your own §4 says "delete
these when you integrate") and read `player.contact` / `player.contactKind` /
`player.contactHeadOn` instead. `attachPlayer`'s second `moveCapsule` pass **cannot** see a
contact: it rewinds to `prev` and re-resolves an already-depenetrated position, so it always
reports clear. Until it is deleted, `player.js` republishes its real contact into
`collision.playerHook`.

### spatial — `tools/gates.round4.spatial.mjs`: A24 / A25 are load-fragile
Both gates pass through the shipped controller on a quiet box (A24 twice, A25 five of six)
and both fail on a box running several lanes' suites at once. Neither failure is a
controller defect — probed directly, she stands off the Watcher at exactly
`capsuleR 1.45 + 0.40 = 1.85 m`, registers 70 consecutive `contactKind 'machine'` frames,
and the machine moves `0.000 m`:

* `A24-player-blocked` fails **only** on `peak > 5`. `peak` is a wall-clock bucket speed, so
  at the 6.8 canon it reads 5.95–6.50 idle and **4.93** under load. Every other bar is
  exact and load-independent (standoff 0.400, speedAtContact 0.00, penetration 0.000).
  Measure `peak` in `engine.simTime`, or lower it — the bar was written for 8.2 m/s.
* `A25-machine-immovable` fails by never staging: the failing runs report
  `minBodyAxisDistM 7.73` out of a 9 m start, i.e. she never set off. Passing runs are
  bit-identical (`contactDist 1.78`, `penetration 0.000`, `machineDisplacement 0.000`).
  Its 3200 ms wall-clock run window needs to be a settle-then-measure loop.

### combat — `src/entities/combat.js` (or wherever `cam.fov` is written)
Combat re-damps `ctx.camera.fov` to 55 every frame, which fights the sprint FOV (it lands
59.5 instead of 60). Read **`player.fovBase + player.fovBias`** as the base and add your own
offset to it. For weapon kick call **`player.addRecoil(pitch, yaw)`** — never write
`player.camPitch` / `player.camYaw`; recoil is a separate spring-back channel applied to the
lens only, so it can never accumulate into the player's aim.

---

## §1 `ctx.player` — published fields

### Animator contract (names and meaning unchanged from Round 3)

| field | unit | meaning |
|---|---|---|
| `moveSpeed` | m/s | distance she actually **covered** last frame ÷ dt. Blocked by a trunk ⇒ 0, not 6.8 |
| `heading` | rad | facing yaw (not camera yaw) |
| `crouching` | bool | crouch **toggle** state; survives aiming |
| `aiming` | bool | RMB / LT held, and not dodging or mantling |
| `dodging` | bool | a roll is in progress |
| `dodgeK` | 0..1 | roll progress — scrub `Roll_RM` with this |
| `inTallGrass` | bool | stealth grass |
| `health` / `maxHealth` | hp | 0..100 |

### Ground & slope (for the conform overlay)

| field | unit | meaning |
|---|---|---|
| `groundY` | m | exact surface height under her **this frame**. While `grounded`, `position.y === groundY` — the ground is *tracked*, not damped, so a conform never chases a lagging pelvis |
| `groundNormal` | Vector3 | surface normal at her feet, unit |
| `slopeDeg` | deg | angle of `groundNormal` from vertical |
| `sliding` | bool | grounded and `slopeDeg > 50` — she cannot hold the face |
| `grounded` | bool | on the surface (false during a jump, a fall or a mantle) |
| `airTime` | s | seconds since she left the ground; 0 while grounded |
| `speeds` | m/s | `{ walk 1.5, crouch 1.4, crouchAim 1.05, aim 1.35, jog 5.0, sprint 6.8 }` — **the one source of truth for clip retiming.** Never copy a literal |

### Jump, fall, mantle, water, edge

| field | unit | meaning |
|---|---|---|
| `lastJump` | — | `{ apex, air, fall, landErr }` of the most recent landing, in **sim** seconds/metres. `null` before the first landing |
| `landImpact` | 0..1 | landing severity, decays at 3.2 /s — the hard-landing cue |
| `fallHeight` | m | metres fallen on the last landing. > 4 hurts, > 9 is lethal |
| `mantling` | bool | a ledge pull-up is playing (0.42 s) |
| `waterDepth` / `wading` | m / bool | pool depth at her feet; wading below 0.12 m is free |
| `edgeK` | 0..1 | soft world edge, 0 at r = 312 m, 1 at r = 330 m |

### Combat / stealth

| field | unit | meaning |
|---|---|---|
| `crouchAim` | bool | `crouching && aiming` — the crouched-aim pose |
| `invulnerable` | bool | getter: inside the dodge i-frame window |
| `iFrameK` | 0..1 | position inside that window, 0 when not invulnerable |
| `iFrames` | s | `[0.12, 0.40]` — the window, in absolute seconds from the roll start |
| `recoil` | rad | `{ pitch, yaw }` — the current spring-back offset. **Applied to the lens only** |

### Contact (replaces `collision.attachPlayer`)

| field | meaning |
|---|---|
| `contact` | the collider she touched this frame, or `null` |
| `contactKind` | its `kind` string (`'tree'`, `'rock'`, `'tent'`, `'machine'`, `'ruin'`, …) |
| `contactHeadOn` | 0..1 squareness of the press; 1 = straight into the face, and speed goes to 0 |

### Camera

| field | unit | meaning |
|---|---|---|
| `camYaw` / `camPitch` | rad | orbit. Pitch clamp `[-1.15, +1.02]` = **65.9° of forward look-up** |
| `camDist` | m | boom length **asked for** (after the crouch/aim and look-up rules) |
| `boomLength` | m | boom length **after** the 12-sample collision sweep |
| `boomCut` | m | `camDist - boomLength` — everything the *world* took away, ground included. Diagnostic only; **nothing fades off this** |
| `terrainCut` | m | the part of `boomCut` the **ground** explains. Never fades her — a hillside is not an occluder (see §7) |
| `solidCut` | m | `camDist - solidReach` — what a **collider** took. This, and only this, drives the fade (§8) |
| `solidReach` | m | boom length a **collider** allows, measured independently of the boom sweep (§8) |
| `camRelief` | rad | how far the ground behind her is pushing the **boom** up right now, 0 on the flat, ≤ `ROT_MAX` (0.95). It rotates about her chest, so the lens gap is untouched — and it no longer moves the **view** (§10) |
| `camBoomElev` | rad | the elevation the boom is actually swept at = requested pitch + `camRelief`. The VIEW is aimed at the requested pitch, not at this (§10) |
| `camLift` | m | how far the ground is raising the **orbit centre** right now, 0 on the flat, ≤ 1.6. It translates — the boom keeps both its length and its axis (§9) |
| `camOrbit` | vec3 | the lifted orbit centre the boom is swept from = `camPivot + (0, camLift, 0)` (§9) |
| `camDistFlat` | m | the boom the camera wanted before local terrain shortened it — the fade's "was this shortening intentional?" reference (§9) |
| `lensGap` | m | lens-to-pivot distance this frame. Below `LENS_NEAR` (1.05) **and** below `camDist − LENS_SLACK` (the boom the camera chose, less 0.18 m of placement slop) she dissolves whatever cut the boom; below `LENS_JAM` (0.80) she dissolves regardless (§9) |
| `camElev` / `camElevWant` | rad | delivered / requested forward elevation, + = looking up (§9) |
| `camAimBudget` | rad | the most look-down the ground may take from the requested shot this frame: `AIM_MAX` (0.80) level or down, `clamp(elevReq × (1 − AIM_KEEP), AIM_FLOOR, AIM_UP_MAX)` = `clamp(elevReq × 0.75, 0.12, 0.45)` on a look-up (§9) |
| `camHijack` / `camHijackMax` | rad | how far the framing actually rotated the view toward her, and its ceiling (§9). Toward the pivot on an un-swung rig; toward her upper body as `camSwing` grows (§11) or, at a deep look-up, as `camRelief` grows (§13). **Slew-limited** (§12): changes by at most `HIJACK_RATE` (49°/s since §13; 57°/s before) and 2.5° per update; while **aiming** it pays back only the part of the offset past `AIM_FRAME` (0.8) of the half-frame. Includes the run offset (`camRunYaw`/`camRunPitch`, §13), the sum capped at `camHijackMax` |
| `camSwing` | rad | how far the ground has swung the boom about the vertical through the pivot, + = shoulder side. 0 on open ground, below `SWING_UP_MIN` of the look-up, and while aiming (§11, §13) |
| `camDolly` | 0..1.3 | at a deep look-up, the fraction of the head-to-lens line the lens keeps: < 1 = pulled toward her head because the ground asked (her head keeps its place in frame), > 1 = stepped out from her body; 1 on open ground (§13) |
| `camHeadDrop` | m | how far the rig follows her stance down at a deep look-up (her head below its flat-ground height, past 0.03 m, ≤ 0.20 m); 0 on flat ground (§13) |
| `camRunYaw` / `camRunPitch` | rad | the run framing's view turn toward her head actually applied (× `camRunK`): right / up in the requested axis' tangent plane, pitch ≤ 0 (never up past the request) (§13) |
| `camTurnAhead` | rad | while running at a deep look-up, how much turn is still ahead of her rendered facing (to the stick direction) — the orbit prices it (§13) |
| `camRunK` | 0..1 | how much of the **run framing** is applied (§12): `smoothstep(up, LEAN_UP_IN, LEAN_UP_FULL) × runK`, 0 standing, aiming or below `LEAN_UP_IN` |
| `camLean` | m | horizontal distance the run framing has moved the rig (head orbit + clearance), 0 when `camRunK` is 0 (§12; was the forward lean of §11) |
| `camOrbitPsi` | rad | the run framing's orbit angle about her head, 0 = straight behind her head in the view, + = shoulder side (§12) |
| `camArmOut` | m | how far along the orbit the clearance solve has moved the lens off the base angle (§12; was the fixed `ARM_OUT` step of §11) |
| `camPivot` | Vector3 | smoothed orbit centre (includes the shoulder offset, the look-up lift and the run framing's translation) |
| `pivotHeight` | m | base pivot height: 1.45 standing, 1.06 crouched |
| `fade` | 0..1 | her dither coverage; 1 = solid |
| `fovBase` / `fovBias` | deg | settings FOV, and the sprint widening on top of it. **Combat: read these** |

---

## §2 Events (`ctx.events`)

| event | payload | fires |
|---|---|---|
| `player-jump` | `{ v0 }` | on takeoff (`v0` = 8.124 m/s, a 1.5 m apex) |
| `player-land` | `{ fall, vy, hard }` | on touchdown; `hard` when `fall > 4` |
| `player-mantle` | `{ rise }` | a ledge pull-up starts |
| `player-splash` | `{ depth, entering, speed }` | crossing the wading threshold, both ways |
| `player-edge` | `{ k, active }` | entering / leaving the soft world edge |
| `player-crouch` | `{ crouching }` | the toggle flips |
| `player-dodge` | — | a roll starts |
| `player-evaded` | `{ amount, from }` | damage was negated by i-frames |
| `player-hurt` | `{ health, max }` | damage landed |
| `player-died` / `player-respawn` | — | death and respawn |

Consumed: `player-damage` `{ amount, from }` — the way other lanes deal damage to her.

---

## §3 `ctx.input` (`src/core/input.js`)

| member | meaning |
|---|---|
| `poll(realDt)` | pumps the Gamepad API. Called once a frame by `Player`; do not call it again |
| `now` | seconds, monotonic, advanced by `poll` — the clock the press buffer uses |
| `move` | `{ x, y }` analog move intent, WASD **merged with** the left stick |
| `gamepad` | `{ connected, id, index, axes{lx,ly,rx,ry}, look{x,y}, move{x,y}, buttons:Set, lt, rt }` |
| `lookDelta(out, realDt)` | mouse + right stick, already scaled by sensitivity and invert-Y |
| `binds` / `bind(action, code)` / `codeFor(action)` / `actionDown(action)` | the action layer: ask for `'sprint'`, not `'ShiftLeft'`. `settings.binds` overrides by name |
| `pressedWithin(code, s)` / `consume(code)` | the press buffer — a dodge pressed 0.25 s early still fires, then is consumed so it cannot fire twice |
| `keys` / `isDown(code)` / `mouse` / `mouseDown(b)` / `onDown` / `onUp` | unchanged Round 3 surface |

Default actions: `forward KeyW · back KeyS · left KeyA · right KeyD · jump Space ·
dodge ControlLeft · sprint ShiftLeft · walk AltLeft · crouch KeyC · heal KeyQ ·
interact KeyE · focus KeyV`.

**Gamepad** is mapped onto the *same* code path: a pad button adds/removes its mapped
`KeyboardEvent.code` in `keys` and fires the same `onDown`/`onUp`, and LT/RT drive
`mouse.buttons` — so every existing `isDown(...)` / `mouseDown(2)` consumer works on a
controller with no change. A = jump, B = dodge, X = interact, Y = focus, LB = heal,
RB = wheel, L3 = sprint, R3 = crouch, LT = aim, RT = draw/fire.

### `ctx.settings` (defaults installed by `Player`)

`sensitivity 1 · padSensitivity 1 · invertY false · fov 55 · cameraShake 1 ·
cameraSmoothing 1 · padDeadzone 0.16` (plus optional `binds`). A settings screen binds
sliders straight to these; nothing needs to be told about a change.

---

## §4 Call-in methods

| method | use |
|---|---|
| `addRecoil(pitch = 0.035, yaw = 0)` | weapon kick. Springs back at k = 21 and is applied to the lens only |
| `addShake(amount)` | 0..1 impact shake — smooth deterministic noise, not per-frame random |
| `setCrouch(bool)` / `toggleCrouch()` | drive the crouch toggle from a menu or a scripted beat |
| `jump()` | scripted jump |
| `takeDamage(amount, from)` | prefer the `player-damage` event |

---

## §5 Tuning constants, and the finding each closes

| constant | value | finding |
|---|---|---|
| `GRAVITY` / `JUMP_APEX` | 22 m/s² / 1.5 m | camera-feel-01. Velocity-Verlet, so the apex is 1.5 m at 20 Hz and at 144 Hz |
| `SLIDE_DEG` | 50° | camera-feel-02 |
| `FALL_SAFE` / `FALL_LETHAL` | 4 m / 9 m | camera-feel-11 |
| `SPEEDS` | see §1 | player-anim-15, stealth-crouch-input-and-speed |
| `IFRAME_IN` / `IFRAME_OUT` / `DODGE_BUFFER` / `DODGE_CANCEL` | 0.12 / 0.40 / 0.25 / 0.55 s | dodge-iframes |
| `CAM_DIST` / `CAM_DIST_AIM` / `CAM_DIST_CROUCH` | 2.8 / 1.75 / 2.55 m | camera-feel-07, V22 |
| `PIVOT_H` / `PIVOT_H_CROUCH` | 1.45 / 1.06 m | camera-feel-07, A31 |
| `PITCH_UP` / `PITCH_DOWN` | −1.15 / +1.02 rad | camera-feel-06, A32 |
| `LENS_FLOOR` / `LOOKUP_LIFT` / `LOOKUP_LIFT_IN` / `BOOM_MIN` | 0.70 m / 0.45 m / 0.15 / 0.9 m | camera-feel-06 — see §6, §10 |
| `PIVOT_CROUCH_MAX` | 1.2 m | A31 — the crouch pivot ceiling, enforced on the target (`_lookLift`) and on the delivered pivot (`_capCrouchPivot`) — see §11 |
| `LEAN_UP_IN` / `LEAN_UP_FULL` / `LEAN_REST` / `LEAN_K` / `RUN_IN` / `RUN_FULL` | 0.45 / 0.85 of the look-up / 0.10 m / 25 / 1.8 / 3.2 m/s | the **run framing** weight and head follow — see §12 (`LEAN_DROP_K`, `LEAN_MAX`, `ARM_OUT`, `ARM_K` of §11 are gone) |
| `RUN_FLOOR_DROP` | 0.10 m | lens floor while running at a deep look-up (0.70 → 0.60) — see §12 |
| `ORBIT_N` / `ORBIT_DA` / `ORBIT_A0` / `ORBIT_PMAX` / `ORBIT_NR` / `ORBIT_DR` / `ORBIT_RMIN` | 37 / 5° / −90° / 90° / 6 rings / 0.10 m / 0.5 m | the run framing's **orbit candidates** — see §12, §13 (29 / −70° / 46° / 4 / 0.08 before) |
| `ORBIT_CLR` / `ORBIT_PASS` / `ORBIT_WIN` / `ORBIT_TAIL` / `ORBIT_BAND` | 0.22 m / 0.18 m / 42 frames / 20° / 0.6 m | its **clearance** envelope and rules — see §12 |
| `ORBIT_XMAX` / `ORBIT_YMAX` / `ORBIT_CLRK` / `ORBIT_EDGEK` / `ORBIT_RCOST` / `ORBIT_HIDK` / `ORBIT_HYST` | 0.62 / 0.65 NDC / 8 / 4 / 0.06 / 3.0 per stride-fraction / 0.20 | its **framing score** — see §12, §13 (`ORBIT_HIDK` was a flat 0.5) |
| `ORBIT_HID_MAX` / `ORBIT_HIDK_NOW` / `ORBIT_HID_LIFT` / `ORBIT_HID_PAD` / `ORBIT_CROWN` | 0.10 / 0.6 / 0.05 m / 0.03 m / 0.13 m | the **hidden-head** test and price — see §13 (`ORBIT_CROWN` was 0.08) |
| `ORBIT_TURN_IN` / `ORBIT_HIST_YAW` / `ORBIT_PASS_TURN` / `ORBIT_RATE_R_OUT` | 0.12 rad / 0.35 rad / 0.24 m / 4 m/s | **turns** out of a run — see §13 |
| `RUN_YAW_MAX` / `RUN_YAW_K` | 0.40 rad (norm) / 1.0 per rad | the run framing's **view turn** toward her head — see §13 |
| `ORBIT_RATE` / `ORBIT_RATE_R` | 5 rad/s / 1 m/s | how fast the orbit may move — see §12 |
| `ORBIT_CAPS` / `ORBIT_CLOTH` / `ORBIT_CLOTH_R` / `ORBIT_HAIR` / `ORBIT_HAIR_R` / `ORBIT_SKIN_GEAR` / `ORBIT_RIGID_GAP` | 22 bone capsules / `dyn_(skirt\|legFlap\|hipFlap\|hipSash)` / 0.13 m / `dyn_(hairBack\|frontLock)` / 0.09 m / `dyn_(quiver\|arrow)` skin points (20) / every vertex within 0.06 m of a sample (`ORBIT_RIGID_GAP`) | its **proxy of her body** — see §12, §13 (cloth 0.10 m, no hair, no quiver, 16 stride samples per mesh before) |
| `SWING_UP_MIN` / `SWING_MAX` / `SWING_STEPS` / `SWING_HYST` / `SWING_FRAME` / `SWING_FRAME_OK` / `SWING_COST` / `SWING_HOLD_SLACK` / `SWING_BODY` / `FRAME_TGT_BELOW` / `SWING_TGT_FULL` | 0.55 of the look-up / 1.75 rad / 20 / 0.08 m / 0.90 / 0.55 / 0.20 per rad / 0.10 / 0.52 m / 0.15 m / 0.35 rad | the **ground yaw swing** — see §11 |
| `SWING_RATE` / `SWING_RATE_AIM` / `SWING_LEAD` / `SWING_MARGIN` | 1.5 / 1.2 rad/s / 0.12 s / 0.15 m | the swing's turn rate (3 rad/s in §12), the look-ahead its rotation/lift are solved for, and the clearance a swing candidate must keep — see §12, §13 |
| `SWING_CLR` / `SWING_CLR_HOLD` | 0.22 / 0.05 m | a swing candidate's clearance from her **body proxy** (the held side may give back 0.05) — see §13 |
| `ROT_UP_IN` | 0.45 of the look-up | where the deep-look-up contract starts (`_deepK`, full at `SWING_UP_MIN`): rotations must keep her framed, no lift, the dolly replaces the boom march — see §13 |
| `DOLLY_HEAD` / `DOLLY_GAP` / `DOLLY_STEPS` / `DOLLY_REL` / `DOLLY_BODY_MIN` / `DOLLY_OUT_CLR` / `DOLLY_OUT_STEP` / `DOLLY_OUT_STEPS` / `DOLLY_OUT_RATE` | 0.55 m / 0.90 m / 12 / 4 /s / 0.16 m / 0.26 m / 0.05 / 6 / 20 /s | the **deep-look-up dolly** — see §13 |
| `HEAD_REST` / `HEAD_DEAD` / `HEAD_FOLLOW_MAX` | 1.36 / 0.03 / 0.20 m | the **stance follow** — see §13 |
| `HIJACK_STEP` / `HIJACK_RATE` / `AIM_FRAME` | 2.5° per update / 0.85 rad/s / 0.8 of the half-frame | the hijack **slew limit** (1.0 rad/s in §12) and the **aim comfort** zone — see §12, §13 |
| `FRAME_LOW_UP` | 0.35 of the half-frame | the lift's framing allowance while **looking up** (`FRAME_LOW` stays 0.70 level/down) — see §12 |
| `BOOM_CLEAR` / `RELIEF_MAX` | 0.45 m / 0.80 rad | camera-feel-03 — see §7 |
| `ROT_MAX` / `ROT_FRAME` / `ROT_MARGIN` / `ROT_STEPS` / `PITCH_B_MAX` | 0.95 rad / 0.95 of the half-frame / 0.04 m / 10 / 1.40 rad | the **ground boom rotation** — see §10 |
| `LIFT_MAX` / `FRAME_LOW` / `LIFT_MARGIN` / `LIFT_MICRO` / `PREDICT` | 1.6 m / 0.70 of the half-frame / 0.40 m / 0.12 m / 0.14 s | the orbit lift and its caps — see §9, §10 |
| `PIVOT_LEAD_MAX` | 0.45 m | the pivot damp velocity lead — see §10 |
| `AIM_MAX` / `AIM_UP_MAX` / `AIM_FLOOR` / `AIM_KEEP` | 0.80 / 0.45 / 0.12 rad / 0.25 | the ground aim budget — see §9 |
| `LENS_GND` / `BOOM_GND` | 0.45 / 0.55 m | the boom's floor against the ground *behind* her — see §9 |
| `FADE_PROBE` / `FADE_FULL` / `FADE_MIN` | 1.6 / 1.45 m / 0.06 | the occluder fade window — see §8 |
| `LENS_NEAR` / `LENS_JAM` / `LENS_HARD` / `LENS_SLACK` | 1.05 / 0.80 / 0.50 / 0.18 m | the two-arm lens-proximity fade — see §9 |
| `EDGE_SOFT` / `WORLD_R` | 312 / 330 m | camera-feel-12 |
| `FOV_BASE` / `FOV_SPRINT` | 55 / 60 | camera-feel-16 |

---

## §6 The look-up camera (why there are three constants for it)

A third-person orbit that pitches **up** swings the lens **down**. At the aim boom that put
the lens 0.48 m above the grass by 42° of look-up, and by 49° `cameraBoom`'s own terrain
march was cutting the boom 1.34 → 0.94 m with **zero occluders in a 1 m sphere**. The fade
then fired on the *result* (`boomLength < 1.45`), so tracking a flyer pulsed her opacity
1.00 / 0.44 / 0.72 / 0.52 — and `depthWrite` went off with it, showing hair, skirt, quiver
and arrow through one another.

Fixed at the source, in three parts (the live VALUES of both constants are §5's — §10
raised them; this section keeps only the mechanism, so each constant has one value in this
document):

1. **`LOOKUP_LIFT`** raises the orbit centre as she looks up, so the boom swings around her
   crown rather than her sternum.
2. **`LENS_FLOOR`** clamps the boom length so the lens can never sink below her feet +
   `LENS_FLOOR` — a margin over `cameraBoom`'s own 0.45 m terrain clearance, so the terrain
   march never fires on flat ground and the boom is only ever cut by a real collider.
   Measured by `A32b-lookup-no-ghost`: `fade == 1.000` at **every** pitch from 0° to 66°,
   aiming and free (24 clear samples, 0 ghosted), boom monotonic in pitch, and the lens
   never under the 0.5 m `lensAboveFeet` bar through a pitch transient.
3. **Subtracting the intentional shortening** replaced the absolute-length fade test, so a
   boom that was shortened on purpose never ghosts her. Fade also *ramps in* over the first
   0.25 m of cut, so a 2 cm graze cannot step the opacity. (That subtraction was originally
   `boomCut`; §7 splits it again into `terrainCut` + `solidCut`, and it is `solidCut` that
   the fade reads today. `boomCut` remains published as a diagnostic.)

The fade itself is a **4×4 Bayer discard in the opaque pass**, not alpha blending: depth is
still written, so the depth test resolves the nearest surface and a half-faded Aloy shows a
steady screen-door silhouette, never her interior. It is driven by one uniform (`uFadeK`),
so a fade costs no shader recompiles and never touches `transparent` / `depthWrite`.
`_collectMaterials` is re-entrant and re-scans at 1 Hz (and the instant a fade begins) so
the bow, arrow and quiver — parented onto her bones *after* the constructor by the combat
lane — dissolve with her instead of staying solid across the frame.

Consequence for other lanes: anything parented under `ctx.player.model` is adopted into the
fade set within a second and gets `customProgramCacheKey() === 'aloy-fade-dither'`. If a
lane needs a mesh under her model to stay solid, put it in the scene root instead.

§6 fixed the *flat-ground look-up* case only. The general case — terrain — is §7.

---

## §7 The slope camera: `camRelief`, and why a hillside never fades her

§6's `boomCut` rule counted **every** metre the world took off the boom as an occlusion.
On flat ground that is right. On a hill it is not: descending any slope points the boom
**up-hill**, the ground behind her rises into it, and `cameraBoom`'s terrain march
correctly cuts the boom. Measured on the A29 face at (118, 220): boom 2.80 → **0.53 m**
with `sphereQuery(lens, 1 m, occluder) === 0` — no collider anywhere near — and the fade
read that as a wall and dithered her to its **0.06** floor for the whole on-face portion of
the descent, 9 frames out of 10. The numeric half of A29 (speed, foot error) never looks at
`fade`, so the suite reported PASS over an Aloy who was a screen door.

Two things were wrong, and both are fixed here.

**1. A chase camera answers a hill by rising over it, not by jamming into her back.**
`_reliefFor` bisects (5 steps, 0.02 rad) for the smallest extra look-down that keeps
`RELIEF_TARGET` = 1.9 m of boom clear of the ground, capped at `RELIEF_MAX` = 0.80 rad
(46°) so the hill can never take the camera off her. It is damped asymmetrically — attack
k = 22 (the constraint is geometric; a slow attack *is* the lens in her skull), release
k = 4.5 — and it is scaled by `1 - up`, so a deliberate steep look-up is never overridden
by the ground. The relief target is computed from the **un-relieved** base pitch every
frame, so there is no feedback loop between "camera rose" and "ground is clear" and the
value cannot oscillate. On the 56° face the boom now holds 1.47–2.80 m at 21–26° of relief;
on ordinary rolling terrain the relief is 0 and the early-out costs one 6-sample march.

**2. The fade now asks *what* cut the boom, not *how much*.**
`_terrainReach` is a deliberate line-for-line **replica** of the terrain half of
`ctx.collision.cameraBoom` — 3 marches at `i/3` of the running length, 0.4 m back-off,
0.45 m floor. Replicating rather than approximating is the whole point: with no occluder
present it returns exactly what `cameraBoom` will return, so `terrainReach - boomLength`
is 0 to the bit and a hillside can never be booked as an occlusion. (A first attempt used a
finer, stricter march, read 1.47 m where `cameraBoom` read 1.07, and still ghosted her to
0.77 on the same face.) The split:

```
boomCut    = camDist      - boomLength      what the world took   (diagnostic)
terrainCut = camDist      - terrainReach    what the GROUND took  (never fades)
solidCut   = terrainReach - boomLength      what a COLLIDER took  (fades)
```

Errors land on the safe side: a wall may fade her a frame late, a hillside can never
dissolve her at all. The one remaining ground arm is a pocket the 46° relief could not
clear — it engages only once `boomLength < 1.0 m` (the lens genuinely inside her head) and
bottoms out at **0.55**, a visible, solid-reading Aloy, not the 0.06 screen door a wall gets.

`A29b-slope-no-ghost` locks it: 8 slope bands (6°→56°) found on the real heightfield × 2
headings (descending, traversing), asserting on every occluder-free row that `fade` and the
applied dither uniform are both 1.000, that the lens never comes within 1.2 m of the pivot,
and that `solidCut` is 0 — i.e. that no hill was ever *booked* as an occluder, however hard
it cut the boom. A32b still owns the flat-ground pitch sweep and the real-occluder case.

Two smaller pieces fell out of chasing this and are worth knowing about:

* **A teleport re-seeds the camera.** `_snapToGround` now clears `_pivotSeeded` (and resets
  the fade and the relief) whenever she lands more than 3 m in XZ from the smoothed pivot.
  Without it, a respawn leaves the boom a 200 m line across the world for the ~0.3 s the
  pivot damp takes to catch up, `cameraBoom` cuts it on every collider along the way, and
  she arrives dissolved with another 0.2 s of dither recovery to sit through. A mantle also
  routes through `_snapToGround` and moves her about a metre, so the 3 m threshold keeps the
  lens from snapping at the end of every vault.
* **A seeded camera is settled.** On the frame the pivot is seeded the relief is *assigned*,
  not damped, so a steep arrival does not spend its first frames on the un-relieved boom.

`A29-slope-limit` was also **strengthened** rather than left alone: it now samples `fade`,
the applied dither uniform and `solidCut` on every on-face frame and fails if she ghosted
on any frame with nothing near the lens. It previously asserted speed and foot error over
an Aloy who was a screen door, and passed — a numeric gate that never looks at the pixels
it is staging can certify a broken shot.

Known gaps in this: her **shadow** does not dither (the shadow pass uses three's own depth
material, which is not cloned), so a dissolving Aloy still casts a solid shadow; and the
`discard` costs her draw calls early-Z at all times, since a shader that can discard is
never early-Z eligible. Both are small at her screen footprint and neither is worth a
second program variant, which would trade them for a compile hitch on the frame the fade
starts.

---

## §8 Round-4 follow-up: the camera-cover ghost, closed at the root

The film round after Wave 1 still caught the shot §6 and §7 were written to fix: *"Aloy
dissolves to near-invisible (fade 0.44–0.72) on an ordinary hillside the moment she looks
up — with NO occluder between camera and character (`solidCut` 0)."* §7's split was right
about the diagnosis and wrong about the closure: it left a **second, independent ground arm**
on the fade that fired on `boomLength < 1.0` and bottomed at 0.55, and that arm — not the
`solidCut` rule — is what was dithering her. Measured on the A29b bands before this change,
with `occ === 0` and `solidCut === 0` on every row:

```
slope 46.4 deg, camPitch  0.00 -> fade 0.550, boom 0.48
slope 46.4 deg, camPitch -0.51 -> fade 0.550, boom 0.45
slope 54.4 deg, camPitch -0.51 -> fade 0.550, boom 0.45
```

### The fade now reads one input, and that input cannot see the ground

```
solidReach = _solidReach(bDir, askLen)   // collider-only cast, mode:'camera'
solidCut   = askLen - solidReach         // the ONLY thing that fades her
terrainCut = askLen - _terrainReachDir() // what the GROUND took (diagnostic)
boomCut    = askLen - boomLength         // what the world took  (diagnostic)
```

`_solidReach` is a centre ray plus a 4-whisker ring at the camera radius through
`ctx.collision.raycast(..., { mode: 'camera' })`, which tests the registered collider set
and **nothing else** — it cannot sample the heightfield. Terrain proximity, look-up pitch
and slope geometry are therefore *structurally incapable* of fading her rather than merely
subtracted out, which is the difference between this cut and §7's. It costs 5 casts and
only runs on frames where `boomLength < FADE_PROBE` (1.6 m), i.e. never on an open boom.

### What the ground does instead: `camLift`

`_terrainLift` solves, in closed form over the same three marches `cameraBoom` will run,
the smallest **vertical rise of the boom's far end** that keeps the segment clear; the boom
is then **re-extended to `camDist` along the lifted axis**, so the ground may only ever
*aim* the boom, never set its length. Published as `camLift` (m).

Two things about it are load-bearing and were each a bug first:

1. **Re-extension.** A vertical lift opposes the downward component of a look-up boom, so
   translating the lens up quietly *shortened* it: on the 56.5° A29 face at `camPitch -1.1`
   a 1.22 m boom became **0.63 m** — the lens inside her skull and Aloy off the bottom of
   the frame (`shots/pcf-worst-a29-p11.png`). She was no longer ghosted there; she was
   simply gone, which is the same film failure wearing a different hat. Pinning `askLen`
   to `camDist` holds the 210-row slope × pitch sweep at a 1.23 m minimum boom.
   `max(camDist, rawLen)` was tried and is worse (0.57 m): a lengthened boom reaches
   further into the hill than the lift was solved for and `cameraBoom` cuts it right back.
2. **Iteration.** Re-extending pulls the far end back down and a rotated boom samples
   different ground, so the solve repeats on the axis it just produced (≤ 4 passes, 3
   height samples each). On open ground pass 1 finds nothing and breaks — the common case
   costs 3 samples.

`camRelief` (§7) is unchanged and still does the gentle case by rotating; `camLift` picks up
what `RELIEF_MAX` (46°) and the deliberate `(1 - up)` look-up scaling cannot.

### Gate

`A31b-no-ghost-without-occluder` stages the four shots the finding names and reads the
**dither uniform actually bound on her materials**, not the `fade` field that feeds it:

| staging | measured |
|---|---|
| hillside look-up, A29 face (118, 220), `camPitch -0.5` | opacity **1.000**, boom 1.87, lift 1.29, `solidCut` 0 |
| valley-floor look-up, lowest clear flat spot, `camPitch -0.5` | opacity **1.000**, boom 1.84, lift 0 |
| sprinting downhill, camera behind, real input | opacity **1.000**, boom 2.75 |
| trunk between lens and Aloy (1.0 m gap) | opacity **0.467**, boom 0.97, `solidCut` 1.83 |

Bars: ≥ 0.98 on the three clear stagings (and `solidCut === 0`, and nothing `transparent`
or `depthWrite:false`), < 0.8 on the trunk — so a fade that is simply switched off fails it
too. The film it captures is the hillside look-up, held by a self-retiring pin, and the
captured frame is itself asserted solid (`filmSolid`).

`A29b-slope-no-ghost` improved on the same change without being touched: its
`minBoomOnClearSlopes` / `minLensGapM` went from a jam near the 0.45 m floor to **2.80 m**.

---

## §9 Fix round 1: the ground may move the camera, never aim it, and a lens inside her always dissolves

Two judge findings against §8, both major, both real:

1. **The lift was re-aiming the player's camera by up to 111°, sign flipped.** §8's lift
   raised the boom's *far end* and re-extended — which is a **rotation** — and `cam.lookAt`
   aimed along that rotated axis. Its four-pass loop *added* each pass's residual to a
   running total instead of solving for the minimum, so it overshot ≈2.5×. Measured on the
   A29 face: `camPitch -0.5` (+28.6° of requested look-up) delivered **−30.6°**, and
   `camPitch -1.1` (+63.0°) delivered **−48.1°** — you asked for sky and got dirt.
2. **Terrain still collapsed the boom to the 0.45 m floor during real motion**, and with
   terrain removed from the fade she rendered **absent** (near-plane clipped) at opacity
   1.000 instead of dithered.

### The lift translates; it cannot rotate

`_orbitLiftFor` is now one exact closed form: lifting the **orbit centre** lifts both ends,
so sample *i* moves up by exactly `L` and its XZ — and the ground height under it — does not
move at all. `L = max_i (H_i + BOOM_CLEAR - (py + dy*s_i))`. One pass, three height samples,
no `/k`, no iteration, and the boom axis is `dir` to the bit. The camera is swept from
`camOrbit`; `camPivot` still means *where she is*.

Three caps, each closing a measured failure:

| cap | why |
|---|---|
| `LIFT_MAX` 1.6 m | absolute |
| framing (`FRAME_LOW` 0.70 of the half-frame) | a lift drops her in frame. This is an **angle**, solved by bisection on `_framingAngle`; the first cut priced it linearly as `tan(hijack)*boom + FRAME_LOW*half-height` and that model is wrong at a short boom — it granted a 1.25 m lift on a 1.6 m boom and filmed her entirely below the bottom edge (highest vertex at NDC y **−1.13**) |
| `LIFT_MARGIN` 0.40 m, proportional | `cameraBoom` sweeps a 0.3 m **sphere** with a whisker ring; the three centre marches modelled here never see the up-slope whisker, so solving to the bit put the binding sample on the sweep's own comparison boundary and it cut a 1.38 m boom to 0.98 m with the full lift applied. Proportional (`min(0.40, need*0.9)`) and micro-lifts under 0.12 m are dropped: a flat margin for a 5 cm need is a net loss, because a lift always walks the lens *toward* her first |

The solve is best-effort, never a refusal: a partial lift still buys lens gap (an earlier cut
returned "infeasible" and the caller used 0 — 0.836 m wanted, 0.715 m allowed, **0 m taken**).
`PREDICT` runs it a second time at the pivot she will have in 0.14 s and the damp attacks at
45 (was 22), because a 6.8 m/s sprint outran the old ramp.

A `LENS_SAFE` **forbidden band** — refusing any lift whose gap would dip below the safe
distance — was written and then measured out again. Refusing the lift does not keep the gap;
it hands the boom to `cameraBoom`'s terrain march, which cuts it to the 0.45 m floor. On a
42.9° face at `camPitch -0.5` the band refused a 0.40 m lift to protect a 0.09 m dip and the
boom fell 1.15 → 0.45 m: gap **0.45** instead of **1.05**. Clearing the ground is worth more
than the dip every time, and what is left of the dip is what arm B of the fade is for.

### The ground aim budget

Everything the ground may do to the *direction* the camera faces — relief (§7) and the
framing hijack — is spent out of one budget:

```
elevReq   = -pitch                                        // + = looking up
aimBudget = elevReq > 0 ? clamp(elevReq * (1 - AIM_KEEP), 0.12, AIM_UP_MAX)
                        : AIM_MAX (0.80)                  // level or down: unchanged
relief   = 0 on a look-up (RELIEF_SHARE_UP 0) — framing gets the whole budget
hijack   ≤ aimBudget - relief
```

**The contract: the ground may take at most `camAimBudget` radians of look-down from the shot
you asked for — at most 25.8°, and never more than ¾ of a look-up, so at least a quarter of
it always survives and the sign can never flip.** Over a 124-row slope × heading × pitch
sweep (7 bands 9°–54°, 3 headings, 6 pitches to the clamp) the budget is never exceeded:
`overBudget 0`, `maxAimLoss 25.8°`.

Half was tried first and is too tight to film: on a 39.6° face it leaves nothing for the
framing, the lift the ground needs then puts her under the bottom edge, and the captured
frame is empty (`shots/pcf-r1-hill396.png`). A quarter kept still closes what the judge round
actually caught — a +28.6° request delivered as −30.6° — because the sign was the bug.

The view axis is `-dir` **slerped** toward her chest by at most `hijackMax`. With no lift and
no cut the two directions are identical to the bit, which is why every flat-ground gate
(A32's reticle servo included) is untouched.

### Boom length vs the ground behind her

`LENS_FLOOR` measures headroom against her *feet*, which is a lie on a slope. The boom now
also marches its own ray from `camPivot` for the last of eight candidate lengths whose lens
clears local ground by `LENS_GND` (0.45 — the same clearance `cameraBoom` uses) **given the
lift that length can actually take**, down to `BOOM_GND` 0.55 when the hill leaves nothing
else. Two things about it were bugs first:

* it is a **march**, not the two-pass estimate the first cut used — an estimate that samples
  the ground at its own previous answer is a feedback loop and it limit-cycled (the same
  staging settled at 0.55 m over 40 frames and 1.47 m over 60);
* the framing cap is priced **at each candidate**, not once at the flat length. The cap scales
  with the boom, so a cap solved at 1.84 m (1.11 m of lift) over-promised what 1.38 m could
  take (0.83 m): the march kept the length, the lift could not hold it, `cameraBoom` cut it to
  0.98 m and she dithered to 0.79 on a 39.6° face.

The pivot block was moved **above** this so the march runs from the origin `cameraBoom` is
actually swept from — her 0.3 m shoulder offset is 0.45 m of ground height on a 56° face. And
the distance springs are now **seeded** on the frame the pivot is seeded, like the relief and
the lift: carrying the previous boom into a teleport left a ~0.4 s transient in which the
arrival's boom was still 2.8 m, the ground cut it, and arm B dithered her for the length of
the spring.

### The fade: two arms, one contract

```
FADE  iff  A solid collider cuts the boom               (solidCut, §8 — unchanged)
      or   B lensGap < LENS_NEAR (1.05) and lensGap < camDist - LENS_SLACK (0.18)
      or   C lensGap < LENS_JAM  (0.80)                 — absolute, whatever the cause
```

Arm **B** is "the world crushed the boom the camera chose". The reference is `camDist`, which
already contains the slope-aware floor below — a boom this lane shortened *on purpose*, with a
lift solved to hold the lens off the ground, is a decision, not an occlusion, and A32b measures
exactly that on open ground. `LENS_SLACK` is 0.18 because `cameraBoom` places the lens with its
own back-off, so `gap` and `boomLength` differ by up to ~0.1 m with nothing wrong.

Arm **C** reads **no cause at all**: no camera decision makes a lens 0.45 m from her chest
anything but inside her head, and the judge round's evidence was exactly that — 0.45 m, opacity
1.000, rendered absent.

Terrain proximity, look-up pitch and slope geometry still cannot fade her *as such*: over the
124-row sweep, **`ghostWithoutJamOrOccluder` is 0** — every fade is explained by a real occluder
or a lens genuinely inside her.

### Gate

`A31b-no-ghost-without-occluder` was rebuilt around what the judge round proved it could not
see. Five stagings, and three new classes of bar:

| staging | judged on |
|---|---|
| **hillside look-up** — steepest *standable* face (26–40°, well inside `SLIDE_DEG` 50), clear of colliders **and of tall grass**, `camPitch -0.5` | opacity ≥ 0.98, `minLensGap` ≥ 1.20, aim within budget, `solidCut` 0, **on screen** |
| **valley-floor look-up**, lowest clear flat spot, `camPitch -0.5` | same |
| **sprint downhill**, real input, unpinned | same |
| **sprint uphill into the rising face**, `camPitch -0.25`, unpinned | same — the moving case the damp used to lag |
| **trunk occluder** (1.0 m gap) | opacity < 0.8, `solidCut` > 0.5 |
| *A29 face (56.5°), `camPitch -0.5`* | the **contract**, not opacity — see below |

New bars: `minLensGapM` over **every** sampled frame (not just the worst-opacity one — the
0.45 m sprint jam passed the old gate at opacity 1.000); `onScreen` from the projected
silhouette (the lift can otherwise buy a perfect opacity row by pushing her under the bottom
edge); and `aimLossDeg ≤ camAimBudget + 2` with no sign flip on any clear staging.

**The A29 face row is judged on the contract rather than on opacity, and that is deliberate.**
At 56.5° — past the slide limit — there is no lens 1.2 m from her chest that is both outside
the mountain and inside the frame; the numbers say so (the boom would need ≈2.3 m of lift and
that is ≈62° off-axis). The shipped build "passed" that bar only by re-aiming her camera 59°,
and forcing the lift instead films her below the bottom edge. So the row now asserts what is
actually achievable and actually matters: the aim is still delivered, the hill is still never
booked as an occluder, she is never a blended draw, and **if she dissolves at all the lens
really is inside her** (`lensGap < 1.05`). The film moved with it — it is the ordinary
hillside the finding names.

Measured, on the stagings the gate runs:

| staging | opacity | lens gap | aim asked → delivered |
|---|---|---|---|
| hillside look-up, 34.3° face, `camPitch -0.5` | **1.000** | 1.84 m | +28.6° → **+28.6°** |
| valley-floor look-up, `camPitch -0.5` | **1.000** | 1.84 m | +28.6° → **+28.6°** |
| sprint downhill, unpinned | **1.000** | 2.80 m | −3.4° → −4.0° |
| sprint uphill into the face, unpinned | **1.000** | 2.74 m | +14.3° → **+14.2°** |
| A29 face 56.5°, `camPitch -0.5` | 0.40 (dithered) | 0.62 m | +28.6° → **+7.2°** (budget 21.5°) |
| trunk occluder, 1.0 m gap | **0.488** | 0.99 m | — |

### Known gaps (fix round 1 — the two ghosting gaps are closed by §10)

* **Tall grass between lens and Aloy** is not a camera collider and does not fade, so a
  staging inside it is unjudgeable on film. A31b's hillside search skips grass rather than
  filming through it; the fade itself is the vegetation lane's to extend.
* Her shadow still does not dither (pre-existing: three's depth material is not cloned).

---

## §10 Fix round 2: the ground rotates the boom, it does not lift it — and the damp no longer lags

The judge round reproduced the original finding at the pitches fix round 1 did not stage:
sprinting a 28.5° face at `camPitch -1.15`, **50 of 56 frames dithered, minimum applied
opacity 0.068, `maxSolidCut` 0, nothing within 14 m**. A 126-row static sweep found 24
ghosted rows down to opacity 0.06 with `solidCut` 0 on every one. Reproduced here on an
84-row slope × heading × pitch sweep of the shipped build: **11 ghosted, minimum lens gap
0.53 m, minimum opacity 0.063**.

### Root cause: the lift moves the lens and leaves her chest behind

There are exactly three things the ground can do to a boom — **shorten** it, **translate**
it (`camLift`), or **rotate** it about the pivot. Fix round 1 used the first two. Both
destroy the lens-to-chest gap, and on a look-up boom the lift destroys it fastest:

    gap(L)² = d² + 2·d·L·dy + L²          dy = sin(boom elevation) < 0 on a look-up

is a parabola that **dips to `d·√(1−dy²)`** at `L = −d·dy` — the lift walks the lens
straight through her. Measured on a 46.7° face at the clamp: `camLift` 0.92 on a 1.22 m
boom, gap **0.53 m**, opacity 0.063 — and the fade was right, the lens really was in her ribs.

A **rotation** about the pivot moves the lens along a sphere centred on her chest, so it
changes the gap by exactly nothing. It is now the primary lever.

### `_groundRotFor` scans, because clearance is not monotonic in elevation

Swinging the boom up a face of angle `a` walks the lens **into** the hill until
`−pitchB == 90° − a` and back out afterwards. A bisection lands in that trough and reports
"infeasible" on ground that clears 20° later, so the solver scans `ROT_STEPS` candidates over
`[0, cap]` and returns the smallest that clears — or, when none does, the one with the most
clearance. Each candidate is priced at the length **it** would get (`_lenAtElev`: a rotated
boom is allowed to be longer) and with the orbit lift **it** would actually be given
(`_orbitLiftFor`'s raw need, the `LIFT_MICRO` refusal included, capped by the framing ceiling
and by `_liftGapCap`). Crediting the lift *ceiling* instead let 17.3° and 23.7° faces "clear"
on a lift the solver then declined; `cameraBoom` backed the boom off 1.40 → 1.00 m and the
gap fade dithered her to 0.91.

Pricing the lift first is also what keeps gentle ground alone: a lift costs no aim at all, so
the shot the player asked for is delivered untouched wherever a lift can clear. Pricing
rotation first cost 19° of a 28.6° look-up on an **8°** slope.

The cost of a rotation is **framing** — she sits `camRelief` off the view axis — and that is
budgeted: `camHijackMax` of it is paid back by re-aiming the view toward her chest, and
`ROT_FRAME` (0.95) of the half-frame absorbs the rest. `ROT_MAX` caps it absolutely.

### The view axis is the request, full stop

`dir` (the boom) and the look direction are now different vectors. The look is
`-(yaw, pitch)` — the player's request — rotated toward her chest by at most `camHijackMax`;
the ground never enters it. That is what makes the rotation free: before this, every metre of
ground clearance was paid out of the player's aim, so relief had to be switched off during a
look-up (`* (1 - up)`) and the ground was left with only the lift. On flat ground the two
vectors are identical to the bit, which is why every flat gate is untouched.

### `_liftGapCap`: the lift may not spend the gap

Closed form — the smaller root of `L² + 2·d·dy·L + (d² − G²) = 0`, and no cap at all when the
dip never reaches `G`. At a shallow look-up the lift is still free (and still the cheaper
answer, since it costs no aim); at the clamp its cap collapses to ~0.02 m and rotation takes
over.

### `LOOKUP_LIFT` 0.28 → 0.45, and its curve

The **pivot** raise is the one lever that moves the lens *and* the framing target *and* the
gap reference together, so it buys clearance with no cost anywhere. It is now 0.45 m at a
full look-up, with a `LOOKUP_LIFT_IN` dead zone (A31's crouch pivot bar) and a linear ramp: a
curve steeper than `sin` makes the boom floor `(pivotH + lift − LENS_FLOOR)/sin(pitch)` grow
with pitch and breaks A32b's boom-monotonic bar (`up²` at 0.45 measures 1.390 m at 60° and
1.401 m at 66° — non-monotonic — while linear measures 1.432 → 1.401). `LENS_FLOOR` went
0.62 → 0.70 with it, restoring the head-room a slope behind her eats: at 8.2° and
`camPitch -0.8` the old 0.17 m of margin was down to 0.013 m and the rotation was firing for
it — 25.7° of hijack on an 8° slope.

### The pivot damp was lagging, and at the clamp that is the whole frame

A first-order damp of rate `k` chasing a target moving at `v` settles a constant `v/k`
**behind** it: 0.34 m at a 6.9 m/s sprint. At a 2.8 m boom nobody notices; at the pitch clamp
the boom is 1.31 m and 0.34 m is **15° of framing**. Measured on a 22.3° face at
`camPitch -1.15`, as the fraction of her vertices inside the frame:

> **Retracted in fix round 3 (§11).** The judge round re-measured this table and the two
> sprint rows — the whole claimed recovery — did not reproduce; §11 publishes what A31b's own
> estimator returns on the fix-round-2 build (sprinting uphill **0.129**, sprinting downhill
> **0.199**, the flat control sprinting **0.155**), and why. The damp-lead fix below is real
> (0.043 m residual lag, judge-measured); the framing loss was her lean, not the damp.

| staging | before | after (as claimed in fix round 2 — does not reproduce, see §11) |
|---|---|---|
| pinned, uphill | 0.404 | 0.388 |
| sprinting uphill | **0.100** | ~~0.387~~ |
| sprinting downhill | **0.019** | ~~0.35~~ |
| flat-ground control, same pitch | 0.392 | 0.392 |

…with `camLift` 0, `camRelief` 0 and the same 1.31 m boom on every row, i.e. nothing the
ground did. The fix leads the damp target by `v/k` per axis, cancelling the steady-state term
and leaving every transient damped exactly as before. The **vertical** rate is measured off
the target rather than read from `velocity.y`: the controller snaps her to the surface while
grounded and zeroes it, so a 6.9 m/s descent of a 13° slope reports `vy 0` while the pivot
target is really falling at 1.6 m/s (a standing +0.15 m of Y lag). `leadY` is zero in the
air, so a jump arc still arrives filtered — camera-feel-08's actual job.

### Sweep, before and after (84 rows: 7 slope bands × 3 headings × 4 pitches, zero occluders)

| | shipped build | fix round 2 |
|---|---|---|
| ghosted rows (opacity < 0.98) | **11 / 83** | **0 / 84** |
| minimum lens gap | 0.53 m | **1.20 m** |
| minimum opacity | 0.063 | **1.000** |
| maximum aim loss | 25.8° (= budget) | 25.8° (= budget) |

### Gate

`A31b-no-ghost-without-occluder` gained the **pitch axis** the judge asked for: the hillside
staging runs at `-0.5`, `-0.8` and the `-1.15` clamp, and both sprints run at the clamp as
well (plus an uphill sprint at `-0.8`) — **nine** judged clear stagings, up from four. Two
measurement bugs in the gate itself were fixed at the same time, both of which had been
scoring frames wrong:

* `silhouette()` projected vertices **behind** the lens. `Vector3.project` divides by `w`,
  and `w < 0` mirrors the point through the origin: at the clamp her feet are behind the lens
  and the helper reported `ndcTop 2045.94 / ndcBottom −6053.70` for a frame that plainly had
  her in it. Vertices behind the lens are now skipped, and `inFront`/`behind` are reported.
* `onScreen` tested `|minX| < 9` — an artifact detector, not a visibility test; one vertex a
  few centimetres past the near plane projects to `|x| ≈ 20` while she fills half the frame.
  It now measures **directly**: `onFrac`, the fraction of her vertices inside the NDC box,
  must be ≥ 0.12, alongside the unchanged crown bar. (Superseded by §11: the bar is now
  relative to a flat-ground control, with 0.12 kept as its floor.)

### Two more defects the new stagings exposed

* **The lift's framing cap could not see the rotation.** `_framingAngle` measures her chest
  against the **boom** axis, but the frame is centred on the **requested** axis, so once a
  rotation had been taken its framing cost was invisible to the lift's ceiling. On the A29
  face the lift was priced at 35.3° off-axis and granted `LIFT_MAX`, while the rotation had
  already spent 14.3° — 49.6° in total, 28.1° after the hijack, and her crown filmed at
  NDC −0.98. `_frameCapAt` now takes the limit as an argument and every caller passes what is
  actually left: `camHijackMax + FRAME_LOW·halfFov − camRelief`.
* **The gate read framing off one frame.** The gait and the run bob swing `onFrac` from 0.04
  to 0.35 four frames apart on a single downhill sprint, so a last-frame sample is noise.
  A31b now samples every 4th judged frame and bars the **median** (reporting min and last
  alongside it).

### Known gaps

* *(Superseded by §11 — booked as its own gate, `A31c-clamp-framing`, and fixed.)* At the
  **pitch clamp** (65.9°) the boom is 1.31–1.46 m by design (`LENS_FLOOR` plus the
  look-up shortening), which is shorter than she is tall, so she fills the bottom of the frame
  and her legs leave it. That is not the ground: the **flat-ground control at the same pitch**
  measures the same 1.31 m boom, the same 1.31 m gap and `onFrac` 0.392, and A32b films it.
  On a slope the median is 0.20–0.38. Framing her fully at the clamp needs a lens ≥ 2 m from
  her chest, which needs a pivot 2.5 m above her feet, and the alternative — flattening the
  boom and aiming up from it — costs the delivered elevation A32 requires (≥ 60°). The
  remaining spread over flat ground is her body's **slope conform tilt and gait phase**, not
  the camera: boom, gap and delivered aim are identical to the flat control on every row.
* **Tall grass between lens and Aloy** is not a camera collider and does not fade, so a
  staging inside it is unjudgeable on film. A31b's hillside search skips grass rather than
  filming through it; the fade itself is the vegetation lane's to extend.
* The **A29 face (56.5°, past the 50° slide limit)** takes the full rotation (47.6°) and still
  ends with a 0.92 m gap and opacity 0.76. There is no lens 1.2 m from her chest on that face
  that is both outside the mountain and inside the frame; the row is judged on the contract
  (aim delivered, hill not booked as an occluder, no blending, and a dissolve only ever
  explained by the lens genuinely being inside her).
* Her shadow still does not dither (pre-existing: three's depth material is not cloned).

---

## §11 Fix round 3 (residue, `player-control-r2`): the clamp framing is its own finding

The fix-round-2 verdict (docs/ROUND4-WAVE2.md, `player-control-followup`) left two majors
and one minor. Each is answered below with what was measured, not what was intended.

### Finding 1 — the crouch-pivot guard is live, and A31 has the pitch axis

*Judge: "A31's `camera pivot ≤ 1.2 m` bar is violated while crouch-aiming at any look-up;
the guard that enforces it is dead code."*

* `_updateCamera` calls `this._lookLift(up)`; the raw `LOOKUP_LIFT * up * up` line is gone,
  so the `LOOKUP_LIFT_IN` dead zone and the crouch clamp are both on the live path.
* **`_capCrouchPivot`** caps the *delivered* pivot as well as the target. The damp leads its
  target by `v/k` (§10), so a target pinned exactly on the bar was delivered above it while
  the look-up was moving: 1.2139 / 1.2162 / 1.2176 m on slow / normal / flick look-ups.
  `PIVOT_CROUCH_MAX` (1.2) is the one constant both places read. Standing is untouched.
* **A31** now stages the pitch axis two ways, both through the real look path: four
  `mouse.dy` sweeps (−40 / −120 / −400 / −900 per frame, every frame sampled, all reaching
  the 65.9° clamp), and the judge's literal stagings — `camPitch` −0.5 / −0.8 / −1.15 held 40
  frames from a settled pitch 0. **Max pivot above her feet: 1.2000 m on every row.** A
  standing sweep is the control that proves the clamp is crouch-only (1.95 m standing).
* **A32b** re-measures `camDist` over 48° → 66° **directly** while aiming, as asked — the
  linear lift is not assumed monotonic: **1.391 → 1.314 → 1.203 → 1.065 m**, asserted
  non-increasing with 1 mm of float slack (`camDistMonotonic48to66`), separately from the old
  +0.02-per-step boom check.

### Finding 2(a) — §10's framing table, re-measured with the gate's own estimator

*Judge: "§10's framing recovery table does not reproduce."* It does not. A31b's estimator
(median of 20 samples over a 56-frame window after a 16-frame settle, fraction of her
vertices inside the NDC box, in front of the lens) on the **fix-round-2 build**, 22.3° face
at (−148, 61), `camPitch −1.15`:

| staging | §10 claimed | fix-round-2 build, measured | judge's probes | fix round 3 |
|---|---|---|---|---|
| sprinting uphill (`sprint-uphill-clamp`) | 0.387 | **0.129** | 0.136, 0.14 | **0.305** |
| sprinting downhill (`sprint-downhill-clamp`) | 0.35 | **0.199** | 0.19, 0.286 | **0.444** |
| flat control, pinned (`flat-clamp-pinned`) | 0.392 | 0.386 | — | 0.388 |
| flat control, sprinting (`flat-clamp-sprint`) | not staged | **0.155** | 0.098, 0.118 | **0.410** |

The pinned rows reproduced; both sprint "recoveries" did not. §10's damp-lead fix is real
(0.043 m of residual lag, judge-measured) — the frame was being lost to something else, and
the flat control losing her just as badly is what located it.

### Finding 2(b) — the control itself lost her: root cause, fix, and its own gate

*Judge: "add a flat-ground sprint-at-clamp control row to A31b and require every slope row
to be within a stated margin of that control … if the control itself films as this one
does, book the clamp framing as an open finding (its own gate id)."*

**The control row and the relative bar.** A31b stages `flat-clamp-pinned` and
`flat-clamp-sprint` in the same run, at the same pitch and gait as the slope rows, and every
slope row must keep **`FRAME_KEEP` = 0.45** of its control's median (`max(0.12, 0.45 × ctrl)`
— the old absolute 0.12 is kept as a floor, so no row is judged more leniently than before).

**The control filmed as the judge's did** — her bow and nothing else, `onFrac` 0.155,
`camLift` 0, `camRelief` 0. Measured cause: her **lean**. At the clamp the lens hangs
0.53 m behind her feet, 0.70 m up, so what decides whether she is in the picture is the
elevation of her head from the lens. Pinned, `head_0104` is 0.10 m ahead of her root at
1.45 m (52° up); sprinting it is **0.43 m ahead at 1.25 m (31° up)** — under the bottom edge
of a 60° frame centred on 66° (36°). The ground did nothing.

**Fix — the lean follow.** At a deep look-up (`LEAN_UP_IN`..`LEAN_UP_FULL` of it), while
she runs (`RUN_IN` → jog speed), the orbit centre follows her head forward along her facing
by the head's lead beyond her standing lead (`LEAN_REST`) plus `LEAN_DROP_K` = cot 50° per
metre it has dropped — i.e. it holds her head at its standing elevation from the lens. It is
a translation of the whole rig: lens gap, boom length and the delivered aim are untouched.
Standing still, or below `LEAN_UP_IN`, it is exactly zero, so the pinned control and every
level-pitch gate (V22, A29b, A35's −0.4/0/0.75 stagings) are unchanged to the bit.

**Fix — the arm clearance.** The same staging put the lens in her right arm's swing: her fist
came within **0.05 m** of the lens every stride (a frame of knuckles, near-plane clipped —
`shots/pc2-nearfreeze.png`), 0.014 m once the rig moved forward. While she runs at a deep
look-up the shoulder offset steps out by `ARM_OUT` (0.26 m); aiming, walking or standing it
is untouched.

**Booked as its own gate: `A31c-clamp-framing`** — flat ground, pitch clamp, pinned / jog /
sprint; head in frame on ≥ 90 % of samples, jog and sprint keep ≥ 0.75 of the pinned median,
pinned ≥ 0.25, no vertex of her within 0.15 m of the lens, opacity ≥ 0.98. On the
fix-round-2 build it **fails** on exactly the defect: head in frame **0 %** jogging and
sprinting, `onFrac` 0.137 / 0.154, fist 0.05 m from the lens. Now: head in frame **100 %**
on all three rows over three consecutive runs, `onFrac` 0.38 / 0.36–0.37 / 0.40–0.41,
nearest vertex ≥ 0.21 m.

### The world moved under A31b — the 38.4° hillside, and the ground yaw swing

The world-ground expansion re-shaped the massif, and A31b's search ("the steepest clear
face in 26–40°") now lands on a **38.4°** face at (−30, −273) (it was 34.3°). On the
fix-round-2 build the hillside look-ups there filmed a mountain with her bow tips in the
bottom row: **`onFrac` 0.008 at −0.8 and 0.004 at the clamp** — A31b has been red in every
suite since. Both of the solver's levers were doing their job and both *raise* the lens (the
pitch rotation swings it up, the lift translates it up): at −0.8 it cleared the hill with
10.4° of rotation and a 1.02 m lift, lens at her head height, and a raised lens looking up
puts her under the bottom edge.

**Fix — the ground yaw swing (`_groundSwingFor`).** The third rigid move: rotate the boom
about the vertical through the pivot. Along the contour the ground is level with her feet,
so the lens can stay LOW — where it frames her — and still clear; like the pitch rotation it
moves the lens on a sphere about the pivot, so it costs no lens gap. Its contract:

* asked only at ≥ `SWING_UP_MIN` of the look-up, and only when the un-swung, un-rotated,
  un-lifted boom does **not** clear — on open ground it returns 0 after three height samples;
* candidates must clear **on their own** (no rotation, no lift). Pricing swing + rotation +
  lift combinations was built and measured first: the best rig jumped between her two sides
  from one solve to the next, through the un-swung boom in the hill (opacity 0.79, gap
  0.94 m). Swing-only candidates vary smoothly and never did;
* the lens keeps `SWING_BODY` (0.52 m) off the vertical through her head — a swing across
  her back otherwise parks it at her hip (0.26 m, a frame of her armpit that the lens-gap bar,
  measured to a pivot 1.9 m up, could not see);
* her upper body must sit within `SWING_FRAME` of the frame once the view is hijacked; on a
  swung rig the hijack aims at **her upper body** rather than the pivot (`_hijackTgt`,
  blended in over `SWING_TGT_FULL`), and it is still capped at `camAimBudget`;
* the side it is on is held while that side has an answer (`SWING_HOLD_SLACK`), so a
  stride across a crease cannot toggle the camera between her shoulders.

Cost: 20 candidates × 3 height samples, **0.07 ms** per `_updateCamera` on the swung
hillside (0.02 ms flat), no allocation. At −0.5 the boom's horizontal reach (1.6 m) takes
her off the side of the frame on any clearing swing, so the framing test rejects them all
and −0.5 runs the pitch-rotation/lift path exactly as before.

| 38.4° hillside, pinned | fix-round-2 build | fix round 3 |
|---|---|---|
| `camPitch −0.5` | 0.224 (lift 1.19) | 0.22–0.29 (unchanged path) |
| `camPitch −0.8` | **0.008** (rot 10.4°, lift 1.02) | **0.52** (swing −75°, opacity 1, gap 1.45 m) |
| `camPitch −1.15` | **0.004** (rot 21°, lift 0.54) | **0.35–0.37** (swing +55..70°, opacity 1, gap 1.31 m) |

Moving: sprinting down the same face at −0.8 / −1.15, and backing up it, stay at opacity
1.000 with a lens gap ≥ 1.27 m on every frame.

### Gate

Lane run on port 5204 (`node tools/gates.mjs --port 5204 --lane player-control`):
**12 / 12 PASS** — A28, A28b, A29, A30, A30b, A31, A32, V22, A29b, A32b, A31b,
`A31c-clamp-framing` (new id; nothing else registers it). A31b: 11 judged clear stagings,
0 ghosted, 0 lens-in-her, 0 aim hijacks, 0 off-screen, worst frame ratio 0.74 against
`FRAME_KEEP` 0.45.

Full suite on 5204 (`node tools/gates.mjs --port 5204`): **239 gates: 187 pass, 8 fail,
4 pending, 40 need judging**; all 12 player-control gates PASS. The 8 FAILs are other
lanes' and none touches the camera: A17-draw-beats, A48-cadence (broadhead), A81 (npc
literal), A47c (snapmaw/corruptor), A50b (shellwalker hulls), A23 / A23b (spatial), A76
(glinthawk footfall routing) — each also red in the player-melee lane's full suite on the
same tree or flaky under load (A76b / A90 / A96 / A97b failed once and passed on an
isolated re-run).

### Known gaps

* **Aiming at the clamp** (the A32 staging: aim zoom fov 44, 1.02 m aim boom, 0.52 m
  shoulder) films the bow and arrow at the left edge with `onFrac` 0.074 pinned / 0.165
  walking — her head sits just off the bottom-left corner. A32's contract there is reticle
  reach (met, 65.7°), and aim framing was not in this finding, so it is recorded here with
  its number rather than tuned under a finding that did not ask for it.
* The **hillside −0.5** row (the unchanged lift path) has A31b's thinnest margin:
  0.22–0.29 against a bar of 0.17–0.20, because the pinned flat control itself reads
  0.38–0.44 run to run (her idle pose).
* At every deep look-up her **stowed bow and spear** sit 0.15–0.25 m from the lens and
  dominate the upper half of the frame; that is the gear's mount, not the camera.
* The far-terrain "grid" visible in these films is core-platform's GTAO (already routed,
  docs/ROUND4-WAVE2.md `world-ground`).

---

## §12 Residue fix round 1 (`player-control-r2`, judge round r0): four majors

The r0 verdict on §11 left four majors. Each is answered below with what was measured on this
tree, port 5204, and the gate that now holds it.

### Finding 1 — a yaw pan across the hillside lurched the view and ghosted her

*Judge: "15-22 deg one-frame view lurches and ghosting with no occluder (opacity 0.75)."*
Reproduced first (38.4° face, pinned, `camPitch -0.8`, 0.005 rad/frame): 23.2° view step, opacity
0.746, lens gap 0.89 m. Three causes, three fixes:

* **The swing turned too fast.** It damped at 14/s toward a target that flips sides when a pan
  carries the held side past `SWING_MAX`, so the lens crossed 100+° of her in a handful of
  frames. It now turns at most `SWING_RATE` (3 rad/s, the judge's number).
* **The ground was solved where the boom was going, not where it was.** The pitch rotation was
  solved at the swing's *target*; a crossing through the un-swung boom (which is in the hill) was
  handed no rotation, so `cameraBoom` cut the boom. The rotation and the lift are now solved at the
  swing the boom actually has **and** `SWING_LEAD` (0.12 s) ahead along its path; during a
  transit the rotation is priced without counting on the (damped, gap-capped) lift; a releasing
  rotation may only come down to the rotation that clears on its own. Separately, a *settled*
  swing at −30° was cut from 1.56 m to 1.16 m by `cameraBoom`'s whisker ring, which a swung boom
  running along the slope exposes up-slope — swing candidates now need `SWING_MARGIN` (0.15 m).
* **Nothing bounded the view.** The hijack is now an offset in the requested axis' own tangent
  plane and may change by at most `HIJACK_RATE` (57°/s; 2.5° per update). The rate is what binds a
  *rendered* frame: the loop sub-steps a slow frame, and a per-update cap alone let a 40 ms frame
  move the view 4.3° past the input (measured). The delivered view therefore moves by the player's
  input plus at most one step, whatever the ground solve does underneath.

| hillside pan (A31b rows) | judge (r0 build) | now |
|---|---|---|
| −0.8, 0.005 rad/frame | 22.49°/frame, opacity 0.746, gap 0.89 | 1.13°, 1.000, 1.45 m |
| −0.8, 0.02 | 17.35°, 0.772, 0.90 | 1.44°, 1.000, 1.45 m |
| −0.8 aiming, 0.005 | —, 0.768 | 1.08°, 1.000, 1.39 m |
| clamp, 0.005 / 0.02 | —, 0.876 (from +1.0) | 1.22° / 1.44°, 1.000, 1.31 m |
| clamp aiming, 0.005 / 0.02 | — | 0 / 1.08°, 1.000, 1.01 m (bar 0.96: the flat aim boom) |

Film: `shots/pcf1-final-hill-yawpan-0.8.png` (mid-crossing, swing +49°, solid).

### Finding 2 — the run framing only worked running away from the lens

*Judge: "lean follow and arm clearance only work for the run direction A31c stages, and A31c's
head-in-frame check ignores the horizontal edge."* Confirmed, and one measurement error found on
the way: **53 of the rig's 69 meshes are hidden** — the five spare weapons are all parented to
`hand_l_014` and toggled invisible — and both A31c's nearest-vertex bar and A31b's `onFrac` counted
them (about half of every sample set, all of it in her left fist). The 0.011 m sprint-left reading
was partly a hidden ropecaster. A31b / A31c now count only meshes whose whole ancestor chain is
visible (`VISIBLE` in the gate file; V22 and A29b keep the old helper — their bars are extents).

The lean follow (along her heading) and the fixed `ARM_OUT` are **gone**. In their place
(`_runFraming`, `_orbitStep`):

* **Head orbit.** The lens sits on a horizontal circle about her head, following its lead in
  both axes; radius and base angle are the pinned rig's, so a standing look-up is unchanged.
* **Clearance, measured on her.** Bone capsules for her body and limbs (fingertips included), one
  capsule per segment of every cloth chain that hangs where the lens goes (`dyn_skirt*`,
  `dyn_legFlap*`, `dyn_hipFlap*`, `dyn_hipSash*` — a sprint flares the right skirt panel 0.3 m out
  behind her hip), and vertex samples of every *visible* rigid mesh (stowed bow, quiver). 29 angles
  × 4 radii, each keeping its worst clearance over the last stride (42 frames). The lens takes the
  candidate whose projected head sits nearest the pinned framing, penalised for clearance under
  0.22 m, for a head past NDC 0.62 / 0.65, and for a sight line to her crown through her own
  shoulders; it never parks in or sweeps across her trailing legs.
* **Lower lens while running** (0.70 → 0.60 m). 0.52 was measured too and buys more clearance,
  but leaves `cameraBoom` 5 cm over its terrain clearance: the ground solvers engaged on 2 cm
  bumps of "flat" ground.
* **Ramp to full at 3.2 m/s** (`RUN_FULL`), not jog speed: a run up a 22° face accelerates for a
  second with a run's lean already in it (A31b's `sprint-uphill-clamp` fell to 0.46 of its control).

Cost while active: 0.09 ms for the run framing, 0.11 ms for the whole `_updateCamera` (2000-call
loops); nothing when she is not running at a deep look-up.

| flat, clamp (A31c) | judge (r0 build) | now (3 runs) |
|---|---|---|
| jog away | head x median −0.81, min −0.98 | −0.62..−0.64, min −0.72; nearest 0.26–0.28 m |
| sprint away | x −0.77..−0.85, min −1.07; nearest 0.115 m | −0.65..−0.72, min −0.80; nearest 0.18–0.31 m |
| sprint right | x −0.89, min −1.09 | −0.42..−0.43; nearest 0.43 m |
| sprint toward | y median −0.86, min −1.00 | y −0.5..−0.6; nearest 0.44 m |
| sprint left | nearest 0.011 m | x +0.13..+0.15; nearest 0.30–0.40 m |

Films: `shots/pcf1-final-clamp-{away,right,left,toward,jogright}.png`.

### Finding 3 — A31b judged its −0.5 rows against the clamp control

*Judge: "against a flat control at -0.5 it fails, and its film misses its own criteria."* Both
true. A31b now stages **one flat control per pitch and gait it uses** (pinned −0.5 / −0.8 /
−1.15, sprint 0.06 / −0.25 / −0.8 / −1.15) and judges every row against the control at its own
pitch and gait; the title says so. Measured this run: pinned controls 0.872 / 0.753 / 0.614,
sprint 0.999 / 0.994 / 0.855 / 0.689.

The −0.5 hillside itself is fixed, not booked: the lift was priced against her *chest* with
`FRAME_LOW` 0.70 of the half-frame, which on a look-up leaves her body under the bottom edge.
Looking up, the allowance is now `FRAME_LOW_UP` 0.35, so the boom march takes less lift (1.19 →
0.97 m). Her crown moves from NDC −0.63 to −0.04..−0.18; `onFrac` 0.62–0.72 against its own
control 0.872 (ratio 0.72–0.81, bar 0.45); the film passes its own solid/in-frame test. The
delivered elevation is still 7.2° of 28.6° — the aim budget spent, by design — and from that spot
the bowl's far wall fills everything above her: there is no sky at 7° there
(`shots/pcf1-final-hill-0.5.png`).

### Finding 4 — the crouch pivot cap took the crouch-aim look-up

*Judge: "cuts crouch-aim look-up to 51.6 deg; A32's 16 m Glinthawk is no longer
reticle-reachable while crouched."* Reproduced (51.6°, 16 m target at NDC y 0.179). A31's 1.2 m and
A32's 60° do not conflict: the 14° the ground rotation lifts the 0.9 m boom by is *placement*, and
the hijack was paying it back out of the aim. **While aiming**, the hijack now pays back only the
part of the offset past `AIM_FRAME` (0.8) of the half-frame — 14° is inside the frame, so it costs
framing, not aim. Crouch-aim at the clamp: **65.7°** delivered, pivot 1.200 m, hijack 0°, both
targets on the reticle. A32 now runs the same sweep and servo crouched (`crouchAim` in its detail).

### Gate

Lane run on 5204 (`node tools/gates.mjs --port 5204 --lane player-control`): **12 / 12 PASS** on
the final build, plus A31c alone twice more (both PASS); the run before the last tuning change
(`RUN_FULL`) was also 12 / 12. No gate id added; A31b and A31c gained
rows and bars, A32 a crouch row. Nothing was loosened: the visible-mesh estimator is the only
change to an existing measurement, and it is stated above.

### Known gaps

* **Sprinting straight away at the clamp** is the tight direction: her forward-leaning torso,
  right skirt panel and right arm fill every lens position low enough to keep her in a 66° look-up
  frame, so the orbit settles 40–45° to her right. The bars hold (head x −0.65..−0.72, nearest
  0.18–0.31 m), and the film shows her upper back and the back of her head with the stowed bow and
  spear dominant — better than the r0 film (crown in a corner) but not a hero shot.
* **Turns out of a sprint away** (A31c `diagnostics`, not judged): the lens has to get round her
  trailing legs, and the head swings across the frame while it does (x up to 0.64–0.75); nearest
  vertex 0.32–0.61 m in the two final runs, but earlier cuts of this solver read as low as 0.02 m
  on the away→away-left turn, so it is the case to re-film first. The steady diagonals are clean
  (0.31–0.51 m; head in frame 0.80–1.00 on toward-left).
* **Aiming at the clamp** (standing or crouched) still frames the bow and sky, not her —
  unchanged from §11; the contract there is reticle reach.
