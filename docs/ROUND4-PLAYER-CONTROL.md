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
(`_installSpatialShim`, `src/entities/player.js`) and reorders `game.systems` so collision
seeds before the first player tick. **Add `installSpatial(ctx)` to `main.js` and delete
that block from `player.js`.**

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
| `lensGap` | m | lens-to-chest distance this frame. Below `LENS_NEAR` (1.05) **and** below `camDistFlat`, she dissolves whatever cut the boom (§9) |
| `camElev` / `camElevWant` | rad | delivered / requested forward elevation, + = looking up (§9) |
| `camAimBudget` | rad | the most look-down the ground may take from the requested shot this frame: `AIM_MAX` (0.80) level or down, `clamp(elevReq/2, 0.12, 0.45)` on a look-up (§9) |
| `camHijack` / `camHijackMax` | rad | how far the framing actually rotated the view toward her, and its ceiling (§9) |
| `camPivot` | Vector3 | smoothed orbit centre (includes the shoulder offset and the look-up lift) |
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

Fixed at the source, in three parts:

1. **`LOOKUP_LIFT`** raises the orbit centre by up to 0.28 m as she looks up, so the boom
   swings around her crown rather than her sternum.
2. **`LENS_FLOOR`** clamps the boom length so the lens can never sink below
   `groundY + 0.62` — a 17 cm margin over `cameraBoom`'s own 0.45 m terrain clearance, so
   the terrain march never fires on flat ground and the boom is only ever cut by a real
   collider. Measured by `A32b-lookup-no-ghost`: `fade == 1.000` at **every** pitch from 0°
   to 66°, aiming and free (24 clear samples, 0 ghosted), boom monotonic in pitch, lens
   height 0.62 m at steady state and never under 0.586 m through a pitch transient.
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

| staging | before | after |
|---|---|---|
| pinned, uphill | 0.404 | 0.388 |
| sprinting uphill | **0.100** | **0.387** |
| sprinting downhill | **0.019** | **0.35** |
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
  must be ≥ 0.12, alongside the unchanged crown bar.

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

* At the **pitch clamp** (65.9°) the boom is 1.31–1.46 m by design (`LENS_FLOOR` plus the
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
