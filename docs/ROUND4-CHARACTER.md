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
2.1, which drove the crouch loop at 3.1× and read as a scuttle), `AIM_SPEED 1.8`
(down from 2.4, which dragged a quarter of the run clip into the aim walk),
`RUN_SPEED 4.6`, `SPRINT_SPEED 8.2` (A3 gate).

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
  clamp applied *before* the arrow line is derived, head-sphere guard (0.21 m,
  covers the hair mass), string-hand nock riding at every draw length, quiver
  flourish, loose follow-through, draw-hold tremble, breathing sway.
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

Full-suite result: see `shots/gates/report.md`.

---

## 6. Film

`shots/char-*.png` — idle front/side, idle feet close-up, walk side, jog side,
sprint side/back/front-3⁄4, crouch side, walk→sprint crossfade at t+0.1 s,
dodge mid-roll, aim-strafe from the chase cam and from the side, full draw from
her right at camPitch −0.4 / 0 / +0.75, planted feet on a slope, stowed bow from
behind. `shots/gates/V12-sprint-vs-reference.png` is the reference comparison.

---

## 7. Known gaps

- **The pack has no strafe or backpedal loops.** (`Round 4 notes` claimed it
  does; the 46-clip manifest does not.) Aim-strafing is solved procedurally —
  the legs yaw up to 66° toward the travel direction and the spine counters so
  the chest stays on target, with reverse phase playback for the backpedal. It
  reads correctly from the chase camera; from a hard side view the legs look
  crossed on a wide strafe.
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
- The retargeted `Idle_Loop` leaves the ankles slightly toe-down; the soles
  touch, but a close-up shows the heels a few mm high.
- `stanceJitter` on `Sprint_Loop` is 0.34 (the two feet disagree by 34 % on
  contact speed) — the source loop is asymmetric. The shared phase averages it,
  the foot lock absorbs the rest.
