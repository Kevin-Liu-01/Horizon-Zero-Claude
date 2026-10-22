# Round 4 — Character: mocap clip base + procedural overlays

Aloy's animation is no longer synthesised bone-by-bone. A CC0 motion library is
retargeted onto her rig at boot and played through a `THREE.AnimationMixer`;
everything the old procedural animator did that still earns its place now runs
as an *additive overlay on top of the clip pose*.

Owner files: `src/entities/playerAnimator.js`, `src/entities/anim/**`,
`src/entities/player.js`, `public/anims/**`, gates A12/A13/V12.

---

## 1. Architecture

```
assets.js ──► public/anims/AnimationLibrary_Godot_Standard.gltf   (CC0, 46 clips)
                    │  loaded raw, meshes hidden, never added to the scene
                    ▼
ClipLibrary.shared(assets)          src/entities/anim/clipLibrary.js
  · SkeletonUtils.clone(aloy.root) — a private rig; the player model is untouched
  · Retargeter (retargeter.js, promoted from src/spikes/retarget/)
        char-space bake, 52 bone pairs, A-pose→T-pose rest correction,
        3→5 spine spread, hip scale 1.029, root motion stripped,
        per-clip ground shift, contact tracks recorded during the bake
  · analyzeGait()  — nominal speed / cycle distance / phase offset /
                     per-frame stance bits / per-frame phase warp
  ▼  8 clips, ~90 ms, once per boot (cached module-level)
LocomotionBlend                      src/entities/anim/locomotion.js
  · one AnimationAction per slot on the player's mixer
  · writes weights + scrubs .time from ONE shared phase every frame
  ▼
PlayerAnimator.update()              src/entities/playerAnimator.js
  1. restore the pure clip pose on clip-driven bones; reset non-clip bones to bind
  2. loco.update(dt, state) → mixer.update(dt)          ← BASE
  3. overlays MULTIPLY onto the posed local quaternions ← ADDITIVE
  4. ground conform + foot lock, then dyn_ springs
  (combat reads bone transforms after this, unchanged)
```

**Why the pose is built this way.** The old animator reset every bone to `bindQ`
each frame and rebuilt the pose from scratch, so a clip base was impossible. The
reset is gone: bones the mixer writes keep a per-frame copy of the *pure* clip
pose (`e.clipQ`) which is restored before `mixer.update` — three's
`PropertyMixer` skips `setValue` when a blended value is unchanged from the last
frame (held roll/death frames), which would otherwise leave the previous frame's
overlay in place for this frame's overlay to stack onto. Only bones no clip
touches (`spine_02/04`, `neck_02`, the `dyn_` chains) are reset to bind.

Two rotation conventions coexist: `_rot` / `_rotQ` rotate about a character-space
axis using the bone's **bind** char orientation (cheap, exact for small additive
offsets — leans, banks, breathing); `_rotL` / `_rotQL` use the bone's **live**
orientation from the current clip pose (exact absolute solves — arm IK, look-at,
leg yaw, the foot lock). `_ikArm` and `_charOf` read live joint positions, so the
aim layer lands on the cheek whatever the legs are doing underneath.

---

## 2. Clip → state map (measured, not assumed)

`animator.clipReport()` prints this at boot. Nominal speed = **total backward
travel of the contact ball bone ÷ total contact time**, i.e. the speed at which
the character must move for a stance to end exactly where it began.

| slot | clip | dur (s) | nominal (m/s) | cycle (m) | contact duty | phase off | used at |
|---|---|---|---|---|---|---|---|
| idle | `Idle_Loop` | 2.500 | — | — | — | — | speed ≈ 0 |
| walk | `Walk_Loop` | 1.333 | **1.172** | 1.563 | 0.87 | 0.00 | 0 → 6.2, hold-Alt walk (1.5), aim-move (1.8) |
| jog | `Jog_Fwd_Loop` | 0.917 | **6.161** | 5.648 | 0.26 | 0.96 | run (4.6, blended 31 % walk) |
| sprint | `Sprint_Loop` | 0.667 | **7.721** | 5.147 | 0.30 | 0.84 | sprint (8.2, timeScale 1.06) |
| crouchIdle | `Crouch_Idle_Loop` | 2.917 | — | — | — | — | crouched, speed ≈ 0 |
| crouchFwd | `Crouch_Fwd_Loop` | 2.000 | **0.764** | 1.528 | 0.82 | 0.00 | crouch-walk (1.5) |
| roll | `Roll_RM` | 1.458 | — (4.99 m root) | — | — | — | dodge, scrubbed by `player.dodgeK` |
| death | `Death01` | 2.375 | — | — | — | — | `ctx.state === 'dead'`, scrubbed by `_dieT` |

Blend tree: `final = base·(1−dodgeW)·(1−deadW) + roll·dodgeW·(1−deadW) + death·deadW`,
`base = stand·(1−crouchW) + crouch·crouchW`, `stand` piecewise-linear over the
nominal speeds. Weights are damped (≈0.15–0.20 s crossfades) and normalised to
sum to 1 so the mixer never blends toward bind.

**Phase lock, not per-clip timeScale.** One master phase `u ∈ [0,1)` advances at
`speed / blendedCycleDistance`; each action's time is
`((u + phaseOffset_i) mod 1) · duration_i`. Per-clip
`timeScale = speed/nominalSpeed_i` is the same thing for a single clip, but a
shared phase means a walk↔jog crossfade never double-steps and the stance foot
survives the fade (Spike C's `syncPhase` finding).

Game speeds were re-tuned in `player.js` to sit near the clips' own cadence —
`WALK_SPEED 1.5` (new: hold **Alt** to stroll), `CROUCH_SPEED 1.5` (down from
2.1, which drove the crouch loop at 3.1× and read as a scuttle), `AIM_SPEED 1.35`
(fix round: see §8), `RUN_SPEED 4.6`, `SPRINT_SPEED 8.2` (A3 gate).

---

## 3. Feet that do not skate

Three independent mechanisms, each measured:

1. **Honest nominal speed.** A least-squares slope over the stance window
   measures *mid-stance velocity*, which reads ~10 % slow on `Sprint_Loop`
   (its contact foot accelerates through contact) — contact travel ÷ contact
   time is the quantity that actually zeroes drift. Stance frames are gated by
   height AND by the foot being the lower of the two AND by the foot travelling
   backwards: `Crouch_Fwd_Loop`'s swing foot skims 5 cm off the floor, passed a
   pure height test, and cancelled the real stance foot out of the estimate
   (0.415 m/s measured vs 0.764 true).
2. **Per-frame phase warp** (`gait.warp`, baked). `Sprint_Loop`'s contact foot
   swings 6.3 → 9.5 → 7.0 m/s inside one 0.1 s contact, so a constant rate holds
   the foot only on average. The master phase rate is scaled by
   `nominalSpeed / stanceVel(u)` (clamped 0.55–1.7, box-smoothed, damped).
3. **Horizontal foot lock** (`PlayerAnimator._footLock`). On the frame a foot is
   flagged planted its ball's world XZ is captured; for the rest of that stance
   the leg is (a) *lengthened or shortened* by flexing the knee about its own
   current bend axis — a horizontal correction on an extended leg is mostly
   RADIAL and a rigid hip rotation cannot deliver it — then (b) rotated rigidly
   about the hip so the ankle sits over the anchor, then (c) the ankle bone is
   counter-rotated so the sole keeps the orientation the clip and the slope pitch
   gave it. Past `MAX_LOCK` (0.30 m) the anchor SLIDES to the limit rather than
   the lock releasing — a release would snap the leg back to the clip pose in one
   frame — and on lift the correction unwinds over 0.12 s. So it can neither drag
   the leg into a split nor pop. Deliberately *not* a full 2-bone leg IK: that
   re-plants the knee on the solver's plane and pops it away from the clip's own
   knee direction.

Measured stance-window XZ drift (bounding-box diagonal, flat meadow):

| state | before | after |
|---|---|---|
| sprint 8.2 m/s | 0.186 m | **0.003 – 0.009 m** (A13, 3 consecutive runs) |
| run 4.6 m/s | 0.039 m | **0.0003 m** |
| crouch 1.5 m/s | 0.379 m | **0.002 m** |
| walk 1.5 m/s | 0.012 m | **0.001 m** |

The ground conform also changed in two ways. A foot's clearance is now the
LOWER of its ball and its ankle contact point (heel strike leaves the ball 8 cm
up while the heel is already down — measuring the ball alone dropped the hips
8 cm on every step), and both rest heights are measured off the bind pose rather
than hardcoded: `assets.js` grounds Aloy with a −55 mm `yOffset` so the skirt
tassels do not float her, which leaves `ball_l` at **y = −0.007**, not 0. The
hardcoded `BALL_REST = 0.005` had her standing 12 mm off the floor.

---

## 4. Procedural code: kept, changed, removed

**Removed**
- The per-frame reset of every bone to `bindQ` (the clip base owns the pose).
- The old speed-driven leg/arm swing cycle, the walk/run/crouch pose synthesis,
  the sprint arm-pump and the procedural crouch — all replaced by clips.
- The `stanceSlope` least-squares gait estimator (replaced, see §3).

**Kept, now layered on the clip pose**
- `_aimLayer` — torso blade + spine pitch, head-glued cheek anchor (offset
  expressed in the head's bind frame, rotated by the head's live delta), reach
  clamp applied *before* the arrow line is derived, head keep-out ellipsoid,
  string-hand nock riding at every draw length, quiver flourish, loose
  follow-through, draw-hold tremble, breathing sway. All of the draw geometry
  was rebuilt in the fix round — see §8.
- `_ikArm` — 2-bone arm IK, now reading LIVE joint positions and orientations
  from the clip pose instead of bind, so aim-walking layers correctly.
- `_lookLayer` — neck 35 % / head 65 % absolute look-at toward the camera view,
  pulled toward the nearest machine within 14 m, faded when the camera stares
  into her face.
- `_springs` — the eight `dyn_` hair/cloth spring-damper chains, unchanged.
- Plant-and-turn, stop-settle, banked turns, accel lean, tall-grass crouch sink,
  winded breathing, hit react, weary slump — all now small additive offsets.
- `_deathFallback` — kept but only used when the `Death01` clip is absent.

**Added**
- `_footLock` (see §3).
- A bounded flatten on `Roll_RM`: its hips peak ~0.28 m above standing, which
  read as a swan dive rather than a tap-dodge; 60 % of the rise above the bind
  hip height (capped at 0.24 m) is subtracted from the pelvis while the roll
  weight is up, leaving the tuck, shoulder roll and recovery alone.

**Fallback.** If the clip pack fails to load, `ClipLibrary.shared` returns null,
the animator logs a warning and `_fallbackBase` restores a bind-pose + arm-IK
stance so the game still runs (and A12 reports SKIP rather than FAIL).

---

## 5. Gates

Added to `tools/gates.config.mjs` (nothing existing was weakened):

- **A12-clip-driven** — `animator.mixer` exists and advanced, ≥1 scheduled
  action carries weight, and `Sprint_Loop` is the dominant action with weight
  > 0.6 at > 7.5 m/s. (Gait actions carry `timeScale 0` because the blend
  scrubs their `.time`, so `isScheduled()` — not `isRunning()` — is the
  predicate for "the mixer is evaluating this action".)
- **A13-no-skate** — teleports to the flat meadow at (−60, −45), sprints, and
  measures the XZ bounding-box diagonal of every stance window (≥4 samples,
  foot clip-flagged planted AND within 3 cm of terrain). Bar: ≤ 0.06 m. Windows
  that span a dropped frame (>45 ms between rAF samples, which moves her 0.4 m
  and swamps the measurement) are counted and discarded, and the gate reports
  SKIP rather than PASS if fewer than two clean windows survive.
- **V12-sprint-vs-reference** — deterministic side profile on her right, camera
  locked 3.6 m out at chest height, frozen on the first clip-flagged contact
  frame so the judge never gets a random point of the flight phase. Written
  criteria cover foot contact, lean, opposing arm swing, stride and trailing
  hair.

Added in the fix round:

- **A14-dodge-zero-dt** — starts a roll and drives it while flipping
  `engine.timeScale` between 0 and 1 every frame, so roughly half the ticks
  arrive with `dt === 0`. Asserts `player.position`, `player.velocity`,
  `moveSpeed` and the camera position all stay finite and the roll still covers
  ground. This is the regression test for §8.1.
- **A15-foot-flat** — samples every frame for 2.2 s idle and 1.4 s in the aim
  stance and requires each foot's live pitch (ankle → ball) to stay within 5° of
  its BIND pitch, i.e. the sole lies the way it does in the bind pose.
- **A16-draw-anchor** — at camPitch 0 / +0.75 / −0.4 / −0.55 and while
  aim-strafing left and right, at full draw: `bow.getNockWorld(draw)` within
  0.09 m of the `hand_r` bone, `lowerarm_r.y ≤ upperarm_r.y` (draw elbow at or
  below the shoulder) and both draw-arm segments outside the head ellipsoid.
- **A17-draw-beats** — the nock flourish's string hand must pass within 0.18 m
  of the hip quiver, and the loose must carry the hand ≥0.05 m rearward inside
  its first 0.26 s.
- **V13-aim-strafe** — locked front view of an aiming side-step, with written
  criteria on foot direction, crossing and toe-dragging.

Full-suite result: see `shots/gates/report.md`.

---

## 6. Film

`shots/char-*.png` — idle front/side, idle feet close-up, walk side, jog side,
sprint side/back/front-3⁄4, crouch side, walk→sprint crossfade at t+0.1 s,
dodge mid-roll, aim-strafe left/right and aim-backpedal from a locked front
camera plus the chase cam, full draw from her right at camPitch −0.4 / 0 / +0.75
and from behind her right shoulder, planted feet on a slope, stowed bow from
behind. `shots/gates/V12-sprint-vs-reference.png` and
`shots/gates/V13-aim-strafe.png` are the judged frames.

---

## 7. Known gaps

- **The pack has no strafe or backpedal loops.** (`Round 4 notes` claimed it
  does; the 46-clip manifest does not.) Aim-strafing is a yawed forward walk
  (§8.3): pelvis ≤31°, hips ≤29°, reverse phase playback for the backpedal.
  The legs no longer cross or splay, but the redirect is ~30° short of a true
  90° side-step, so the foot lock slides its anchor ~0.1–0.2 m per stance on a
  hard lateral strafe. A baked 4-way aim set is the real fix.
- **`Jog_Fwd_Loop` is a 6.16 m/s run, not a jog.** At the 4.6 m/s run speed the
  blend is 69 % jog / 31 % walk. The feet stay planted (0.0003 m drift) but the
  cadence is long-strided; a genuine 4–5 m/s mid-run clip would fix it.
- **`Sprint_Loop` has a 70 % flight phase**, so a random sprint screenshot often
  catches both feet in the air. That is the clip, not the conform — the gate
  freezes on a contact frame for exactly this reason.
- **No bow-draw clip** in the pack (`Pistol_Aim_*` were the closest stand-ins and
  read worse); the draw remains the procedural `_aimLayer`.
- `Hit_Chest` / `Hit_Head` / `Jump_Start|Loop|Land` / `Interact` /
  `PickUp_Table` are baked-ready but not wired — hits still use the procedural
  react and there is no jump in the movement model.
- Fixed in the fix round (§8.2): the ankles are within ~2° of their bind pitch
  at rest and both soles are flat on the terrain.
- `stanceJitter` on `Sprint_Loop` is 0.34 (the two feet disagree by 34 % on
  contact speed) — the source loop is asymmetric. The shared phase averages it,
  the foot lock absorbs the rest.

---

## 8. Fix round — what three film judges found, and what changed

Every finding below was reproduced numerically before it was touched, and each
now has an assertion gate so it cannot silently come back.

### 8.1 Blocker — the dodge roll divided by `dt` and NaN'd the player forever

`player.js` turned the roll's root-motion curve into a velocity
(`(prog − prevProg) / dt * DODGE_DIST`) and re-integrated it. The main loop is a
fixed-timestep accumulator: when a frame does not fill a 1/60 step it calls
`_tick(0, wallTime)` — **`dt` exactly 0** — which is roughly half of all frames
on a 120 Hz display, and *every* frame while `engine.timeScale === 0` (the V12
gate does that itself). On such a frame the numerator is also 0, so `v = 0/0 =
NaN`, `velocity` went NaN, `position` went NaN, and nothing ever re-sanitised
it: black world, DOM HUD still alive, unrecoverable.

Fixed by **integrating the curve directly** — `position += dodgeDir * (prog −
prevProg) * DODGE_DIST` — with `velocity` kept only as a read-only mirror for
HUD/FX consumers (`dt > 1e-5 ? step/dt : 0`). A NaN backstop after the terrain
stick restores `_lastGoodPos` and logs once, so no future divide can brick a
run. Gate: **A14-dodge-zero-dt**.

### 8.2 Major — she stood on her toes (and floated 5 cm above the ground)

Measured live idle ankle pitch was 28.8° / 29.1° against a bind pitch of 18.9° —
about 10° of permanent plantarflexion, heels ~4 cm off the floor, in the pose
the player sees most. Three separate causes, all fixed:

1. **The retarget baked the source's rest ankle onto Aloy.** `boneMap.js`
   `AIM_RULES` had no rule for `DEF-foot.L/R`, so they fell to the default "aim
   the bone at its first mapped descendant", which rotates Aloy's bind ankle
   onto the Quaternius rest ankle. They are now `null` (identity): Aloy's own
   bind ankle IS the rest, and the source's per-frame delta drives it. Live idle
   pitch dropped to ~20.5° (bind 18.9°).
2. **The archer stance lifted the rear heel.** `_aimLayer` flexes the right hip
   0.12 rad and knee 0.14 rad, which the ankle inherits — 15° of extra toe-down
   on the foot the player stares at while aiming. Each foot now gets the exact
   counter-pitch.
3. **A general flat-foot conform.** `_groundConform` now measures each planted
   foot's live pitch and rotates the ankle back to `bindPitch + slopePitch`
   (clamped ±0.35 rad, applied in the LIVE frame), faded out with speed
   (`1 − smoothstep(speed, 0.5, 2.0)`) because a walk's toe-off and a sprint's
   push-off *are* meant to be plantarflexed. This also absorbs the tall-grass
   sink and any future clip that retargets slightly toe-down.

While measuring this, the pelvis clamp turned out to **converge on half the
correction**: `cL`/`cR` are read from a pose that already carries `this._grnd`,
but `want` was computed as if they were raw (`-max(c)`), so the fixed point was
`g = −c_raw/2` and she hovered ~5 cm with one foot planted and the other in the
air. `want` is now `this._grnd − max(cL, cR)`. Both soles now sit at 0.000 m.
Gate: **A15-foot-flat**.

### 8.3 Major — aim-strafe splayed, crossed and moonwalked

The pack has no strafe clips, so lateral travel was a forward walk with the
**pelvis yawed up to 66°**. At that angle the pelvis yaw re-orders the two hips
along the stride axis: measured mid-strafe, the RIGHT ball sat 0.5 m to her
LEFT, i.e. the legs were literally crossed, and each foot pointed a different
way (61.6° vs 73.4°).

The yaw is now **split**: the pelvis takes at most 31° (torso counter-twist stays
human) and the remainder — up to 29° — is hip rotation applied to both thighs,
which redirects each leg's stride without moving the hip joints at all, so the
trailing foot cannot end up on the far side of the lead one. A lateral pelvis
shift (5.5 cm toward travel) sells the weight transfer, and `AIM_SPEED` came
down to 1.35 m/s (a combat side-step, not a walk). Measured after: both feet
point within 12° of each other and toward the travel direction; no crossing at
either strafe direction. Backpedal was already reverse phase playback and reads
correctly once the yaw stops fighting it. Gate: **V13-aim-strafe**.

### 8.4 Blocker — the string hand was never on the string

At full draw the nock was **0.41–0.53 m** from the `hand_r` bone: both hands
floated out at the bow, the draw elbow pointed forward and *above* the shoulder,
and the rendered string was pulled by nothing. Root cause was a **scratch-vector
collision**, not tuning: `_aimLayer` built the hand→nock offset into the shared
module scratch `_v3`, and the Round-4 rewrite of `_ikArm` (to read live joints)
started writing `_v3` internally — so the left-arm solve overwrote the 0.465 m
nock offset with a unit forearm direction, and the right-hand target landed
1.44 m from a 0.50 m arm.

Fixed at the root: `_ikArm` now has its **own private scratch set**
(`_ik1..._ik5`, `_ikQ...`) and can no longer touch anything the aim layer holds
across the call, and the nock offset lives in its own dedicated `_nockOff`.

That alone was not enough to make the pose *read*, so the draw geometry was
rebuilt:

- **The anchor was 9 cm too low.** The head BONE sits at the base of the skull
  (measured off the render: bone y 1.40, chin 1.32, crown 1.56), and the anchor
  offset was `(−0.065, −0.09, +0.145)` in the head frame — under her chin, on
  her throat. It is now `(−0.115, +0.005, +0.105)`: level with the head bone and
  far enough out on her right cheek that the hand clears the hair braid (at
  −0.085 the numbers were identical but the hand rendered *inside* the braid).
- **The head guard was a sphere in the wrong place.** A 0.21 m sphere about the
  head bone swallowed the cheek anchor itself and shoved the hand 21 cm down;
  a sphere small enough to allow the anchor let the wrist sink into the jaw. It
  is now an **ellipsoid** fitted to the skull (`HEAD_R` 0.105 × 0.135 × 0.115
  about head-bone + 0.05 y), and points are pushed out along the ellipsoid
  normal.
- **The draw has to be geometrically possible.** The grip must sit one full draw
  (`bow.pull` 0.52 → 0.465 m at the nock) ahead of a cheek anchor that is ~0.63 m
  from the bow shoulder — against ~0.49 m of arm. Real archers close that gap by
  blading the shoulder girdle; the chest blade at full draw went from 0.35 rad to
  0.82 rad and the clavicles now protract (L 0.40, R 0.32 rad), carrying the bow shoulder
  ~9 cm forward and the draw shoulder the same distance back.
- **The reach clamp now slides along the aim ray**, solving for the smallest
  slide that puts the grip inside the reach sphere, instead of pulling the grip
  toward the shoulder — so the string hand stays on the line through the cheek
  (a fraction past the jaw at most) rather than swinging out sideways.
- **The aim ray starts where combat reads it.** `_dA` used to be built from a
  guessed grip ("0.45 m ahead of the chest"), which left ~4 cm between the
  animator's nock line and the rendered string. It now starts from last frame's
  achieved grip in world space. (Reading the bow group's own orientation back
  instead is a direct feedback loop and diverges — measured: it threw the nock
  0.43–0.99 m off within a second.)

Measured at full draw, all three aim pitches plus both strafe directions:
nock→`hand_r` **0.068–0.075 m** (the ~7 cm is the wrist behind the fingers that
hook the string), draw elbow 1.6–9.0 cm *below* the shoulder, bow arm at 0.493 m
of its 0.501 m reach. Gate: **A16-draw-anchor**.

### 8.5 Major — the draw forearm lay across her face aiming uphill

The old guard clamped the hand POINT out of the skull; the upper arm and the
forearm are *segments*, and at camPitch −0.4 the bracer swept horizontally
across her eyes. `_clearArmOfHead` now tests both segments against the head
ellipsoid (exactly, by mapping the segment into the ellipsoid's unit-sphere
space) **and** enforces archery form — the draw elbow must never sit above the
shoulder — pushing the IK pole further down and back and re-solving, up to four
times. Measured normalised clearance ≥ 1.0 at every pitch tested, elbow below
the shoulder at all of them. Gated inside **A16**.

### 8.6 Major — the nock flourish and the loose had no visible beat

Both were downstream of 8.4, and the flourish also ran for **0.13 s** (eight
frames — HZD's reach is 0.25–0.35 s) with only a 0.6 lerp toward the quiver. The
window is now 0.28 s with a 0.92 lerp, and the hip quiver point is a named
constant. Measured: the string hand passes within **0.053 m** of the hip quiver
during the flourish, and the loose carries it **0.19 m** rearward along −aim
while it holds at the anchor. Gate: **A17-draw-beats**.

---

## 9. Second fix round — what three film judges found, and what changed

Eight findings: four locomotion, four aim. Two of the aim findings live in
`src/combat/` (another lane's files) and are reported at the end with the exact
patch rather than edited here. Every other finding is fixed, measured, filmed
and gated. Six new gates (`A18`, `A19`, `A28`, `A31`, `A32`, `A33`) and one new
visual (`V14`) exist specifically so none of these can come back unnoticed.

Two of the eight had already been closed by the time this round started and are
recorded here with their current numbers because they are now *gated*, which
they were not before: the frozen `dyn_` chains (§9.1) and the bounding run
(§9.2). The rest were live.

### 9.1 Major — every dyn_ chain was frozen at all speeds (now gated)

The chains discover themselves off the skeleton (66 of them, not the 8 the
Round-4 hand list covered) and are driven by the attachment point's vertical
ACCELERATION, by local JERK rather than local velocity, and by a one-frame
impulse on each foot-plant edge. A velocity-proportional term parks a spring at
a constant lean and reads as frozen no matter how large it is; only the
oscillating and impulsive terms are motion.

Measured over 2.2 s of 8.2 m/s sprint, local-quaternion range:
`dyn_hairBackMain_03` **17.7°**, `dyn_skirtA_02_l` **9.5°**, `dyn_quiverMain`
**5.2°** (judged values: 0.09 / 0.00 / 0.00). In the 400 ms after a hard stop
the hair still carries **15.2°** of follow-through. Gate **A19-secondary-motion**
asserts ≥ 8° / ≥ 4° / ≥ 1.5° at sprint and ≥ 6° of continued hair motion after
the stop. Film: `char-sprint-back.png`, `char-hardstop-back.png`.

### 9.2 Major — plain-W run bounded instead of running (now gated)

`Jog_Fwd_Loop` is baked at nominalSpeed 3.29 m/s / cycleDist 3.01 m, and at
`RUN_SPEED` 4.6 the blend is 70 % jog / 30 % sprint for a blended cycle of
3.64 m. Measured: **2.66 steps/s (160 spm), 1.73 m stride, 0.19 flight
fraction** (judged: 126 spm, 2.20 m, 0.55). Gate **A28-run-cadence** covers
plain W *and* sprint — A12/A13 only ever drove W+Shift, which is why this gait,
the one the player spends the whole game in, went unwatched.

The gate asserts the cadence the clips are actually driven at (the locomotion
phase rate, 2 steps per gait cycle, median over the window) and reports the
foot-plant edge count beside it. Edge counting alone is worth ±0.4 steps/s
because the blended stance weight chatters across 0.5.

### 9.3 Major — no lateral ground conform: she levitated on every cross-slope

**The real bug, and it was not "add a roll axis".** The conform solved ONE
scalar — the fore-aft grade along the heading — which is ~0 by construction when
she stands across the fall line, so both soles were held world-level while the
ground fell away diagonally beneath them: +0.098 m of float at 25°, scaling
linearly to 0.104 m at 32°. Adding a second scalar for the bank was still wrong,
and measurably so: her feet toe out ~15°, so banking about the *character's*
forward axis leaves the sole's own long axis crossed and the downhill toe still
2.8 cm high at 20°.

`_groundConform` now solves the axis-free statement instead — **the sole's
NORMAL points along the terrain normal**:

- `soleUp` = the bind char +Y carried by the foot's live delta from bind, so on
  flat ground the target is +Y and the whole thing reduces exactly to the old
  flat-foot rule (the sole lies the way it does at bind) with no axis to get
  wrong;
- (a) a RELATIVE tilt onto the surface, weighted by the clip's stance bit,
  applied at every speed so a sprint's toe-off survives and only the plane it
  pushes off changes;
- (b) an ABSOLUTE pull of the sole onto that surface faded out by speed, which
  is what stops the retarget residue and the archer stance's knee flex from
  standing her on her toes at rest.

Both are applied with `_rotQL` (the bone's LIVE char orientation), so the
correction is exact rather than the small-angle approximation `_rot` gives.

Measured standing ACROSS the fall line, ball clearance and sole-plane error:

| slope | ball clearance L/R | sole tilt error L/R |
|---|---|---|
| 10° | +0.0007 / −0.0008 m | 0.56° / 0.35° |
| 20° | −0.0006 / 0.0000 m | 0.67° / 0.42° |
| 30° | +0.0002 / 0.0000 m | 0.14° / 2.23° |

(judged: +0.0178/+0.0146 at 6.5°, +0.0976/+0.0777 at 25°.) Facing uphill and
downhill are unchanged and still ≤ 0.001 m. Gate **A18-slope-conform** picks one
spot per 10/20/30° band deterministically — it scans a fixed grid and takes the
first surface whose normal is consistent within 6° at ±0.6 m, so a ridge or a
crease never decides the result — stands across the fall line and asserts
|clearance| ≤ 0.02 m and sole tilt ≤ 6°. `debugStance()` gained
`soleTiltErrDeg`, which is the axis-free version of the flat-foot probe A15 uses
and catches exactly what a pitch-only measurement cannot see. Visual gate
**V14-slope-contour**. Film: `char-slope-contour.png`, `char-slope-crossfeet.png`,
`char-slope-walk.png`.

### 9.4 Major — aim-strafe skated 0.15–0.18 m per stance (now gated)

Aim-strafe no longer yaws a forward walk: a real `Strafe_Loop` drives it
(dominant weight 1.00 at `AIM_SPEED` 1.35 in both directions). Measured stance
drift with the same window algorithm A13 uses: **0.0007 m right, 0.0010 m left**
across 21 clean stance windows, against a 0.06 m bar. Gate
**A31-aim-strafe-skate** covers both directions — A13 only ever drove
W+ShiftLeft, so the dominant combat locomotion in the game was ungated. Film:
`char-aimstrafe-feet.png`, `char-aimstrafe-chase.png`.

### 9.5 Major — the string pulled back with nothing on it for 0.28 s of EVERY draw

`_quiverT` was reset on the DRAW edge, and the flourish window is 0.28 s, so for
the first 0.28 s of every shot the string hand travelled to her hip while combat
was already bending the string — measured nock→hand **0.63 m** at drawS 0.18.

The reach for an arrow is a beat of the **aim raise**, not of the draw, and
after a shot it belongs to the follow-through. Both of those edges happen while
the string is slack, which is the entire point:

- `_quiverT = 0` on the rising edge of `p.aiming`;
- and again once `_looseT ≥ 0.4` when a shot has been fired and she is still
  aiming (`_reNock`), so the re-nock rides the follow-through;
- plus a hard rule so the timing can never be defeated by a player who presses
  RMB and LMB together: the flourish weight is multiplied by
  `1 − smoothstep(drawS, 0.02, 0.14)`, snatching the hand onto the string over
  ~70 ms rather than holding it at her hip while the string bends.

Measured worst nock→hand across the WHOLE ramp (0.05 < drawS < 0.9), at every
aim pitch the game allows plus a strafe: **0.026–0.046 m**. Gate
**A32-draw-ramp**; **A17-draw-beats** now also asserts that `drawStrength` stays
≤ 0.02 for every frame the flourish is running. Film: `char-flourish-150.png`
(hand at the hip, string slack), `char-draw-t150.png` (150 ms into the draw,
hand already on the string at the cheek).

### 9.6 Major — the drawing hand and bracer sat inside her head

hand_r → head was 0.095–0.105 m at full draw and normalised to **0.94 of the
head-ellipsoid radius**: the wrist was inside the skull and the braid rendered
through the glove. `debugArm().headClear` could not see it because it tests only
the two arm SEGMENTS.

Three changes, and the third is the one that mattered:

1. `ANCHOR_OFF` moved from `(−0.115, 0.005, 0.105)` to `(−0.086, −0.024, 0.118)`
   — the old x was 3 cm PROUD of a skull whose half-width is ~0.085 (the hand
   floated off her face), and the old y/z put it beside the ear, which is
   exactly where the hair mass is. It now sits on the cheek at mouth height.
2. The hand is included in the guard: `_clearArmOfHead` tests `hand_r` against
   the ellipsoid at `HAND_IN` (0.90 — the anchor is *meant* to touch her face,
   so 1.0 is wrong), `_pushOutOfHead` takes that radius scale, and `debugArm()`
   reports `handHeadUnit`.
3. **The reach deficit was what pushed the hand behind her ear.** The draw is a
   triangle: bow shoulder → grip is the arm (0.493 m, fixed), anchor → grip is
   one draw length (0.465 m, the bow's). It closes only if the anchor is close
   enough to the shoulder — the largest draw an anchor can carry is
   `Lmax = −u·d + sqrt((u·d)² − |u|² + reach²)`, `u = anchor − shoulder`. With
   the anchor up on the cheekbone that was 0.40 m against 0.52 m needed, and the
   old code spent the whole 0.12 m deficit sliding the draw line BACKWARDS along
   the aim ray, which is precisely the direction that buries the hand in the
   hair.

   It is now spent, in order, on things that cost less:
   - 0.05 m of it was never real: the grip carried a `+0.05 · aim` nudge on top
     of `anchor − nockOffset`, five centimetres of pure draw-length cost that
     the reach clamp then paid back as slide. Removed.
   - the chest blade opens further with the draw (0.62 → 0.80 rad) and the
     clavicle protracts further (0.40 → 0.62 rad); both carry the bow shoulder
     around toward the arrow line, which is the only lever that shortens
     shoulder→grip without shortening the draw.
   - whatever is left slides the ANCHOR down the jaw, bisected to the least
     drop that closes the triangle and capped at `ANCHOR_DROP` 0.06 m. An
     under-chin anchor is real archery form (Olympic recurve uses it) and it
     keeps the hand ON her face.
   - only then does the old ray slide run, on the residue.

   A fourth clamp was needed for the same reason on the other arm: at a steep
   up-aim the low-draw ready hold sat 0.60 m from the RIGHT shoulder against
   0.49 m of arm, and the string hand fell 0.09 m short of its own nock for the
   first frames of the draw. The grip now slides back for whichever arm needs it.

Measured at full draw: slide **0.120 → 0** at level and down-aim (0.03–0.05 m at
the extreme up-aims), nock→anchor **0.079 → 0.035 m**, `handHeadUnit`
**0.94 → 1.17–1.42** and never below 0.90 anywhere on the ramp, hand→head
0.112–0.132 m. Gates **A32-draw-ramp** (adds `minHandHeadUnit ≥ 0.88`) and the
existing **A16**. Film: `char-draw-side-zoom.png` — the glove and bracer are on
the jaw, the braid falls clearly behind them, and her eye is sighting down the
shaft.

Related fix found while measuring: the animator demanded a **2 m** aim point
before it would use combat's aim ray, and aiming steeply down (camPitch 1.05,
the game's own limit) the crosshair hits the ground ~1.5 m away — so the
animator silently fell back to the raw camera ray while combat kept pointing the
bow at the near hit, and the rendered nock drifted **0.29 m** off the string
hand. Threshold is now 0.5 m, short enough to cover the whole pitch range and
long enough that the grip-feedback gain stays well under 1. Gated as the
`down105` row of A32.

### 9.7 Blocker found on film — one NaN deleted her hair, skirt and boots

Not in the judges' list; found while shooting §9.3. On some teleport/heading
sequences the `dyn_` spring chains went **non-finite**, and the result on screen
is not a glitch — a NaN bone matrix collapses every vertex it skins, so Aloy
rendered as a bald mannequin with no skirt, no boot fur and no pouches, with one
strand floating beside her. Once a chain's state is NaN the integrator has no
path back, so it never recovered.

`_springs` now sanitises its six upstream drives (phase, frequency, local
velocity, jerk, yaw rate, wall clock) and re-seats any chain whose state has
already gone bad, for a handful of comparisons a frame. Gate
**A33-rig-finite** walks a stress run — teleport onto the steepest surface on
the map, two 90° heading slams, sprint, hard camera turn, stop, dodge roll, aim,
full draw, loose — and asserts every frame that all 424 bone quaternions and
positions, all 66 chain states and the animator's own scalars stay finite.

### 9.8 Out of lane — the two findings in `src/combat/`

Both are one-constant changes in files this lane does not own
(`src/combat/bow.js`, `src/combat/arrows.js`). They are real and they are what
the draw film still shows; the weapons lane should apply them:

- **`src/combat/bow.js:246`** — `this.nockArrow.group.scale.set(1.6, 1.6, 1)`
  scales `finsGeo` (three 0.0026 × 0.046 × 0.115 m fins offset 0.078 m up the
  shaft) into a ~0.16 m opaque white vane cluster sitting exactly at the anchor.
  It is the largest object in every draw frame — see `char-draw-side-zoom.png`,
  where it covers her mouth and chin. Drop it to ~1.0–1.15, or shrink `finsGeo`
  to ~0.03 × 0.075 m.
- **`src/combat/bow.js:101`** — `this.pull = 0.52` against
  `ARROW_LEN = 0.78` (`src/combat/arrows.js:4`) leaves 0.315 m of shaft in front
  of the riser at full draw. Raising `pull` toward 0.65–0.70 costs the animator
  another ~0.15 m of draw length it does not have (see §9.6 — the triangle is
  already closed on the anchor drop); **shortening the nocked-arrow visual to
  match the 0.465 m pull is the change this lane can absorb for free.**

### 9.9 A13's sampling window (measurement fix, not a threshold change)

A13 skipped itself ("fewer than 2 clean stance windows") on any run under
60 fps. At sprint one foot is in contact for ~66 ms — `contactDuty` 0.3 of a
0.6 s cycle — which is 3–4 rAF samples, and the gate demanded 4-frame windows
inside a 1600 ms sample. It now samples for 2600 ms and accepts 3-frame windows;
at 8.2 m/s three frames still span ~55 ms of stance and 0.45 m of travel, so it
is a real skate measurement. **The 0.06 m drift threshold is unchanged**, and
the gate now collects 8–9 windows instead of 0–6: measured worst drift
**0.0085–0.0097 m**. A15 got the same class of fix — it sampled the frame
immediately after its own teleport, before the animator had run once at the new
position, and read ~12° of pitch error that is not in the render; two frames of
settle, same 5° bar, steady state 1.95°.

### 9.10 Film

Twenty-nine shots, all refilmed after every fix, vegetation hidden (waist-high
meadow grass hides exactly the legs these shots are about) and the player
model's `frustumCulled` cleared for the duration (Aloy's sub-meshes carry
bind-pose bounding spheres, so a tight film camera culls the hair and skirt
cards even though they are `visible`):

`char-{idle-front,idle-side,idle-feet,walk-side,jog-side,run46-side,run46-float,
sprint-side,sprint-back,sprint-front34,hardstop-back,crouch-side,
transition-walk-sprint,dodge-mid,slope-contour,slope-crossfeet,slope-walk,
stow-back,aimstrafe-feet,aimstrafe-chase,draw-side-level,draw-side-down,
draw-side-up,draw-side-zoom,draw-back34,draw-front,draw-chase,flourish-150,
flourish-240,draw-t150}.png`

### 9.11 Known gaps

- At 30° the sole solve occasionally lands 8–12° off on a *ridge* (two feet on
  strongly different normals, 0.25 m apart); on any locally consistent surface
  it is ≤ 2.2°. A18 selects consistent surfaces deliberately rather than
  pretending the ridge case is solved.
- At the two extreme up-aims (camPitch −0.4/−0.55) and while aim-strafing, the
  reach solve falls back to the radial pull-in (`slide: −1`) — the aim ray never
  enters the bow arm's reach sphere. nock→hand stays 0.068 m and the head
  clearance stays ≥ 1.29, so it reads correctly; the bow is simply not exactly
  on the animator's ray at those extremes (combat orients it independently).
- The NaN in §9.7 is guarded, not root-caused: it was not reproducible from the
  teleport, heading slam, camYaw slam or the blocking terrain scan in isolation.
  A33 is the net that catches it if it returns.
