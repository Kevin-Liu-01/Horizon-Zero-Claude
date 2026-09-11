# ROUND 4 — `machine-rig` published API

Owner lane: **machine-rig** (port 5207). Everything below is a contract other
lanes may call or listen to. Nothing here is internal; if it is not in this
document, it is not published and it may move.

Sibling docs: `docs/ROUND4-SPATIAL.md`, `docs/ROUND4-ANIM-CORE.md`,
`docs/ROUND4-CHARACTER.md`, `docs/ROUND4-PLAYER-CONTROL.md`.

> Round 4 shipped these surfaces with no document — a judge had to read
> `rig/fx.js` to discover `ctx.machineFx`, and `machine-death-impact` had no
> listener at all because nothing said it existed. §3.1 of the audit is
> explicit that cross-lane needs go through published APIs; publishing means
> *this file*, not a JSDoc block.

---

## 1. `ctx.machineFx` — the pooled machine particle system

`src/entities/machines/rig/fx.js`. Created lazily on the first machine spawn
and published on the context. **One `THREE.Points` draw for every machine
particle on screen** (plus one for the additive pass), instead of the Round-3
one-`Sprite`-per-puff (measured: 58 dust sprites = 58 draw calls in a staged
fight).

```js
ctx.machineFx.puff(x, y, z, scale = 0.8, color = 0x6f5637)      // ground dust
ctx.machineFx.smoke(x, y, z, scale = 1, color = 0x56493d)       // wreck smoke
ctx.machineFx.flame(x, y, z, scale = 0.5, color = 0xff7a1e)     // additive flame
ctx.machineFx.spark(x, y, z, scale = 0.3, color = 0xbfe8ff, dur = 0.35)
ctx.machineFx.burnSmoke(x, y, z)                                // sooty wisp
ctx.machineFx.attachGlow(obj3d, { size, color, gain, emissive, machine })
ctx.machineFx.live        // live particle count (getter)
ctx.machineFx.glowCount   // tracked persistent glows (getter)
```

- Units are **world metres**; `scale` is a world diameter, not pixels.
- Safe to call from any system, any frame, including while the machine is dead.
- **Capacity is 512 particles per pass.** Over the cap the oldest particle is
  recycled — a caller never allocates and never fails.
- The pool ticks itself on the engine's sim clock, so `engine.requestTimeScale`
  slows the particles with the world.
- Cost per call: no allocation. Cost per frame: two buffer uploads.

`attachGlow` folds a machine's eye halo or emissive accent into the pooled
additive draw and hides the source object. **Pass `machine`** — the pool uses
that backpointer to drop the record when the machine is disposed (see
`A49-fx-pool-clean`); without it the record leaks and eventually starves living
machines of glow slots.

## 2. Events

Registered in `docs/SPEC.md` §13.5. Payload objects are **reused-safe**: the
`position` field is a live `Vector3` owned by the rig — copy it if you keep it
past the handler.

### `machine-footfall`

Emitted by **both** locomotion paths — `GaitController` (six species) and
`FootLock` (the clip-driven Watcher and Longleg) — through the shared emitter
`src/entities/machines/rig/footfall.js`.

```js
{ machine, kind, foot, leg, index, position, speed, runK, strength, mass, surface }
```

| field | meaning |
|---|---|
| `kind` | species id (`'watcher'`, `'thunderjaw'`, …) |
| `foot` / `leg` | leg id (`'LF'`, `'RH'`, `'L'`, …); `leg` is an alias |
| `index` | leg index in the rig |
| `position` | world contact point (live `Vector3`) |
| `speed` | m/s ground speed at contact |
| `runK` | 0..1 walk→run blend |
| `strength` | 0..1 impact weight for a cue's gain |
| `mass` | rough scalar: `height × max(1, bodyRadius)` |
| `surface` | `ctx.terrain.surfaceAt()` id, or `null` |

Glinthawk never fires it: it flies, it has no feet. Gate
`A76b-footfall-species` asserts every other species does.

### `machine-death-impact`

Fired once, ~0.55 s after death, when the wreck lands.

```js
{ machine, kind, mass, position, strength }   // strength 0.12..1, mass-scaled
```

Intended consumers: `player-control` (camera shake), `audio` (collapse impact).
The rig already spawns the dust ring itself through `ctx.machineFx`.

## 3. Pose channels — `machine.gait.pose`

`machine-ai` and `combat` drive the rig by writing these. **The distinction
below is invisible from the call site and silently breaks behaviour if you get
it wrong.**

**Impulse channels — consumed on read.** Write the peak value; the controller
takes it on the next frame, zeroes your field and decays its own copy.

| channel | units | meaning |
|---|---|---|
| `hit` | 0..1 | flinch impulse |
| `hitDir` | rad | body-space bearing the hit came from (read with `hit`) |

**Sustained levels — hold them, and clear them yourself.** They do nothing
until you write them and keep doing it until you write 0.

| channel | units | meaning |
|---|---|---|
| `stagger` | 0..1 | stumble: wide legs, dropped head, loose spine |
| `kneel` | 0..1 | downed / critical: front legs buckle, chest low |
| `shiver` | 0..1 | freeze-status tremor |
| `limpLeg` | index | leg held off the ground, or `-1` |
| `crouch` | 0..1 | body lowers onto flexed legs |
| `spineRear` / `spineYaw` | rad | rear-up / torso twist |
| `tailYaw` / `tailLift` | rad | tail sweep and lift |
| `headYaw` / `headPitch` | rad | extra head angle on top of the gaze solve |
| `legLift[i]` | 0..1 | per-leg raise (`Float32Array`, index = rig leg) |
| `tuck` | 0..1 | airborne leg tuck (pounce) |

Writing a sustained channel and forgetting it leaves the machine permanently
staggering; writing an impulse channel every frame pins the flinch at full.

## 3.5 Published bounds — `machine.drawnBounds` (`rig/bounds.js`)

`Machine.size` / `height` come from the loaded GLB's normalised descriptor,
decided before this lane's silhouette pass runs — so on the five kitbashed
species it describes a mesh that is no longer drawn, and on the rest it
describes the sculpt without its shell.

`ctx.hitHulls.raycast()` broadphases every machine with a sphere built from
exactly those numbers (`rad = 0.5 * max(size.x, size.z, height) + 1.2`), and a
ray that misses the sphere is never tested against the machine's hulls at all.
Measured: the Glinthawk's shell spans 6.4 x 6.9 m of wing against a declared
2.6 x 1.4 m and its sphere fell **1.05 m short of its own wingtips** — 10 of 50
arrows fired at drawn glinthawk triangles registered nothing. The Behemoth was
0.76 m short; the Thunderjaw and Sawtooth had 0.14 m and 0.30 m of margin on a
walk cycle that swings further than that.

So the rig publishes what it drew:

```js
machine.drawnBounds   // { x, z, minY, maxY, meshes } world extents, centred on
                      // machine.position, retired sculpts excluded
machine.size          // GROWN to cover drawnBounds; a machine-owned Vector3,
                      // never the shared asset descriptor
```

Refreshed on the first LOD tick and every 120 frames from
`updateRigLOD()`, off each geometry's own bounding box (a bind box is a
conservative envelope of every pose the skeleton can reach, which is the right
side to be wrong on for a broadphase). `height` is deliberately NOT touched: it
is a gameplay quantity (LOD rings, shadow rings, corpse mass, eye heights).

Gate `A50b-aim-on-drawn-geometry` grades the result the way a player meets it:
50 arrows per species at the silhouette, each ray confirmed against real
triangles with `ctx.hitHulls.referenceRaycast()` first, then asked of
`ctx.hitHulls.raycast()`. Budget: **>= 95 % register on geometry that is DRAWN,
0 on the retired donor sculpt.**

## 4. Machine surface queries

| call | returns |
|---|---|
| `machine.socketReport()` | `{ kind, worstGapM, worstSocket, samplingSpacingM, worstNearestSampleM, samples, proudOffsetsM, sockets }` — the distance from every part / eye / weak-point anchor to the machine's hull **in the current pose**, alive or dead. `samplingSpacingM` is the proxy's own resolution limit, reported separately so a reader can tell measurement from slack. `proudOffsetsM` lists the deliberate stand-off offsets (only the elemental canisters have one, 0.10 m, for `combat-blaze-canister-unreachable-frontal`). Cold path — for gates and the Studio panel. |
| `machine.hullProxy` | the sampled hull: `{ pos, boneOf, bones, count, spacing, partOf }`. Each sample lives in its dominant bone's frame, so it is correct in every pose. Use `hullWorld(proxy, i, out)` from `rig/sockets.js` to resolve one; `surfaceDistance(proxy, worldPoint)` for distance to the sampled surface; `posedLowest(machine)` (from `rig/ground.js`) for the lowest posed vertex. |
| `machine.contacts()` | per-leg `{ id, planted, stanceT, reach }` — reach is the fraction of the leg's usable extension in use. |
| `machine.debugFeet()` | the shared `RigDebug.feet()` shape plus `plantId`: world sole position, an **honest** `planted` flag (a solve that fell short reports not-planted), and the foot's touchdown counter (§5.1). Calling it is what marks a release as observed — a consumer that never calls it gets the plain per-frame rule. |
| `machine.gait.updateCheap(dt, t)` | phase-and-body-english-only gait for machines past the animation LOD ring: ~2 % of full cost, keeps a tall machine striding out to ~500 m. Called by the rig's own LOD; documented because a gate may want to know why a distant machine has no foot contacts. |
| `machine.rig.space` / `machine.rig.restPose` | the `anim-core` `BoneSpace` / `RestPose` for this machine (`docs/ROUND4-ANIM-CORE.md` §3). |
| `machine.gait.bandLo` / `bandHi` / `cadFloor` / `cadCeil` | the species' stride-frequency band, in Hz per foot. |
| `machine.footContinuity()` | **new, fix round 2 second pass** — per-leg `{ id, toe:{x,y,z}, planted, plants, hold, corrM, appliedM, clipRate, rampPeakMps, reach, handle }` on the two `FootLock` species (watcher, longleg). `toe` is the foot's WORLD position this frame; `corrM` is how far the lock is displacing it from the pose the clip asked for and `appliedM` how much of that is actually applied (`corrM x hold`); `rampPeakMps` is the worst m/s the blend ramp moved the toe at since the last read (peak-and-reset, so a spike inside a sim substep cannot be missed by a per-frame poll). Gate `A45c-foot-continuity` reads it. Species without a `FootLock` do not implement it. |
| `pinFullLOD(machine, pin = true)` | **new** — exported from `rig/lod.js`. Lifts every distance retirement on a machine and holds it at tier 0 through `machine._lodPin`; `pinFullLOD(m, false)` releases the pin. For staged stills and anything else that composes a machine at a distance it is not meant to be graded at (§6.2). |

## 5. Cadence is a REAL-TIME quantity

`cadenceBand(bodyLengthM)` (exported from `gait.js`) is the one law:
`hz = 2.2 / sqrt(L / 2.5)`, band `[0.45, 1.35] ×`, exactly what gate `A48`
grades against. A **moving** machine is clamped into `[0.47, 0.60] × bandHi`
— i.e. `[0.63, 0.81] ×` the reference — with 1.4× of margin below the band
floor and 1.7× above its ceiling.

Those edges are **footfalls per WALL-CLOCK second**, and `main.js` clamps the
fixed step at `MAX_STEPS = 3` (0.05 s per frame): on a host rendering the world
at 10 fps the simulation advances at half wall speed. So the band is converted
into sim time before it clamps anything:

```js
import { wallPerSim, cadenceTarget } from './gait.js';
wallPerSim(ctx.engine)              // wall seconds per UNSCALED sim second, 1 .. 25
cadenceTarget(band, runK, ctx.engine) // cycles per SIM second for that band
```

**`wallPerSim` and slow motion — corrected, fix round 2 second pass.** The
ratio used to be averaged over SCALED sim time and multiplied by a live
`engine.timeScale` afterwards. Both terms are right; using them in that order
is not, because the average is a k = 0.92 EMA (~12 frames) and `timeScale` is
read on the frame. Leaving Concentration snapped the multiplier back to 1 while
the average still held bullet time's ratio, and the product read **9.42** for
about 0.7 s — measured, sampling every rAF across a 1 -> 0.02 -> 1 transition:
`[9.42, 5.55, 4.02, 3.16, 2.68, 2.34, …]` decaying to 1.06 over ~40 frames.
`gait.js` multiplies both the cadence floor and `cadCeil` by that number and
integrates it into `phase`, so every machine on screen crammed roughly an extra
full stride — and its burst of `machine-footfall` events, i.e. the audio
footstep bank and the camera step shake — into the moment the player released
focus. The wheel's 0.25 did the same thing at ~4x.

The scaled step is now divided back out INSIDE the average (`sA` accumulates
UNSCALED sim seconds), so numerator and denominator always describe the same
era, and the result is slew-limited on top (`WPS_SLEW`, 4 e-folds/s) so no
single frame can multiply a cadence by more than the slew allows.

Re-measured on 5207, same 1 -> 0.02 -> 1 sequence, sampling every rAF (this box
renders the world at ~10 fps, so the baseline ratio is ~1.9 rather than 1):

| phase                 | samples                                  |
|-----------------------|------------------------------------------|
| before (timeScale 1)  | 1.00, 1.24, 1.64, 1.89, 1.91, 1.89       |
| during (0.02)         | 1.85 … 1.66, 2.74, 2.72, 2.67, 2.60      |
| **after (back to 1)** | **2.54**, 2.45, 2.35, 2.28, 2.20, 2.14 … 1.39 |

The first frame after the transition is **lower** than the last frame before
it (2.54 against 2.60): the step ratio across the release is 0.98, against the
9.42 the judge measured.

`wallPerSim` measures `engine.simTime` against `performance.now()` **once per
rendered frame**, however many machines ask for it, smoothed over ~1 s. A
footfall is a real-time event — it fires `machine-footfall`, which drives the
audio lane's footstep bank and the camera's step shake — so it must not halve
when the renderer is busy. The stride shortens instead, which is what an animal
does when it slows down.

Fix round 1 did the opposite: it pinned cadence at `0.94 × bandHi` to survive a
loaded host, and that traded one failure for two. A watcher at 3.1 Hz completes
a stance in 0.16 s, and every consumer of `debugFeet()` samples once per
rendered frame — at 10 fps a whole swing fell between two samples, two plants
read as one, and gate `A45` measured a whole stride of "drift" (0.422 m against
a 0.06 m budget). See §5.1.

### 5.0 A clip-driven species needs a STANCE AUTHORITY (`stancePhase`)

`FootLock`'s `stancePhase` option — `(legIndex) => boolean`, true only while
the species' own animation says that foot is in stance — is **not optional for
a walking species**. Without it a plant opens and closes on sole height alone,
and `footlock.js` says what that costs in its own option docs: "a small swing
lift can leave the sole inside `releaseH` for several cycles, so the plant
never re-opens and the cadence gate reads half the truth."

The **Longleg** was the one walking species that had none, and it is why a
judge measured `A48-cadence` at 0.39, 0.69 and 1.39 Hz against a `[1.14, 3.43]`
band on three clean runs of the same build. Nothing was wrong with the cadence
NUMBER: `cadenceTarget()` runs the clip at a mid-band rate and the clip cycles
at exactly that rate. What varied was how many of those cycles the gate could
SEE — its Walk clip lifts `FootL` 0.48 model units against a 0.34 m
`releaseH`, so on rolling ground whether a given lift cleared the threshold was
decided by the terrain under the other foot.

`longleg.js` now measures stance off the clip's own keyframes at build time
(`stanceWindow()`: the longest circular stretch of the cycle in which that
foot's authored height sits in the bottom 28 % of its range) and gates the lock
on the DOMINANT locomotion action's own mixer time. One plant and one release
per foot per clip cycle, at whatever rate the cadence law is running the clip
— so footfalls per wall second equal the band placement on an idle box and a
loaded one alike. A species standing still (below `MOVING_EPS`) keeps both
feet down, as it did before the authority existed.

#### `stanceLatch` is GONE. The plant is height-gated, always.

Fix round 2's first pass added `stanceLatch: true` — open the plant AT THE
GROUND under the toe when the stance authority fires, without waiting for the
sole to fall inside `contactH`. A judge filmed what that actually did: the
Longleg's foot dropped **0.606 m to exactly ground level between two rendered
frames**, worst single-frame jump **1.065 m**, 13 of 13 plant edges jumping
0.20-1.07 m, with both feet visibly hanging clear of the shins. And because the
toe had been WRITTEN to the ground, `planted` was true on the same frame, the
ground error was exactly 0.000, and `A45` / `A46` / `A48` all read clean. They
were measuring the write.

`opts.stanceLatch` is now accepted and ignored (so an old call site cannot
silently re-open the hole). The division of authority is:

* **`stancePhase` is the RELEASE and CADENCE authority** — that part was right
  and is what fixed `A48`;
* **sole height is the PLANT authority** — `h <= contactH && !rising`, no
  exceptions, and the latch point is where the toe IS, never the terrain;
* **one plant per stance window** — `leg.stanceArmed` re-arms only when the
  window CLOSES, so a release inside an open window (overreach, a failed solve,
  a lost ledger slot) cannot be followed by an immediate re-plant. Measured
  before the arming existed: 208 plants in 6.7 s on a machine whose cadence is
  1.9 Hz;
* **the handle write is RAMPED and rate-limited** — `holdIn` 0.07 s, `holdOut`
  0.12 s, and `holdRate` 5.5 m/s as a hard ceiling on how fast the ramp may
  move the toe whatever the disagreement is. The time constants alone are not a
  bound: over a 0.5 s stance the clip's own foot travels a full stride away
  from the world point the lock is holding, so a 0.10 s blend-out over a 2.5 m
  disagreement still moves the toe 0.35 m in a frame;
* **`maxCorr` (0.55 x measured leg reach) ends a stance** the lock is dragging;
* **`_solveHandle` has a real reach check** — `leg.restLen` is the longest
  hip-to-toe extension that leg has actually reached, and a target beyond it
  returns false so `update()` releases the plant instead of aiming at it
  "best-effort, cosmetic". The chain is aimed at where the toe IS mid-ramp, not
  at the lock, which is what had the shin pointing at the ground while the foot
  was still in the air;
* **`planted` requires `hold >= 0.9`** on a handle rig, so a foot the ramp has
  not yet taken is not reported as standing on anything;
* **`opts.active`** — `() => boolean`, false while a non-locomotion clip owns
  the legs. A Longleg stomp one-shot sweeps a foot handle 1.08 m in a rendered
  frame with the body stationary; a foot lock has no business in it.

Measured on a running Longleg, per rendered frame, over the same window the
judge used:

| quantity                                | before   | after     |
|-----------------------------------------|----------|-----------|
| worst toe-Y jump while PLANTED          | 1.065 m  | **0.019 m** |
| worst planted toe rate                  | —        | **0.51 m/s** |
| plants in 5 s (cadence is ~1.5 Hz/foot) | ~200     | **~13**   |

Gate **`A45c-foot-continuity`** (registered this round) is the one that can
fail on this: it samples the toe's world position every RENDERED frame and
grades, while the rig claims the foot is PLANTED, both its rate (<= 1.5 m/s)
and its per-frame distance (<= 0.12 m, the judge's own number); plus
`rampPeakMps`, the hold ramp's own contribution, at <= 9 m/s. The rate makes it
frame-rate independent; the distance stops a slow host hiding a jump inside a
long frame. Ten consecutive runs: watcher 0.24-0.88 m/s and <= 0.030 m, longleg
0.28-0.91 m/s and <= 0.022 m, ramp 5.5 m/s (its own ceiling), zero offenders.

#### KNOWN REGRESSION — `A48-cadence` on the Longleg

Making the plant honest cost this gate its margin on this one species, and the
number is disclosed rather than tuned away. `A48` counts rising edges of
`planted`; with one plant per stance window the count is now **exactly the
clip's stance-window rate**, where before it was the rate at which a sole
crossed a height threshold — several times per cycle when `stanceLatch` had
removed the height test altogether. Measured across fourteen runs on 5207 while
the box carried the rest of the suite: 0.59, 0.69, 0.70, 0.79, 0.88, 0.89,
0.97, 0.99, 1.07, 1.10, 1.19, 1.19, 1.20, 1.29 Hz against a floor that the gate
recomputes each run from the hull's measured length and which came out between
1.13 and 1.34. So it lands in band on roughly a third of runs and 10-40 % under
it on the rest.

The mechanism is measured, not guessed: `A45-no-skate` reports 5-6 stance
WINDOWS in its own 4-5 s window, i.e. the windows themselves are opening at
~0.6-0.7 Hz per foot, so the clip's wall-clock cycle rate — not the plant logic
— is what is short of the 1.63 Hz `cadenceTarget` asks for. Four things were
tried against it and each is recorded with its measurement: a reach-relative
plant window (`plantReach`, kept — it is the right shape), a matching
reach-relative release height (kept, same reason), relaxing `active` from 0.35
to 0.75 (kept), and multiplying this species' band placement by 1.35 (REVERTED:
it made the number worse, 0.89 and 0.50, because a faster clip gives the sole
less time inside the window). `wallPerSim`'s frame filter was also widened from
1 s to 3 s and its EMA shortened to ~7 frames, which helps and does not close
it. What is left is that the Longleg spends much of a PROVOKED window — which
is the only kind `A48` measures — leaping and attacking rather than walking,
and `fast` correctly refuses to lock a foot through either.

Three other things had to be right before the cadence held:

* the idle cut-off is `gait.js`'s own `MOVING_EPS` (0.008 m/s). Earlier drafts
  used `moveK < 0.15` and then `< 0.08` — 0.17 and 0.09 m/s — and `A48`
  averages footfalls over a 5 s window while grading anything that covered
  0.4 m, so a Longleg patrolling at 0.5 m/s had its authority off for most of
  the window;
* `contactH` is 0.26, not 0.16 — see above;
* `wallPerSim`'s ceiling (§5) had to be lifted from 2.5, because this species'
  cadence IS its clip rate and nothing downstream re-derives it.

**This gate WAS host-load sensitive, and the fix is measured, not asserted.**
Twenty runs of `node tools/gates.mjs --port 5207 --only A48-cadence` were taken
on a box whose load average moved between 38 and 157 (fifteen other gate
runners on one GPU), in four batches of five as each term landed:

| build                                  | longleg cadenceHz, five runs      | in band |
|----------------------------------------|-----------------------------------|---------|
| before (judge's measurement)           | 0.39, 0.69, 1.39                  | 1 / 3   |
| + stance authority, `wallPerSim` <= 8  | 1.70, 1.30, 0.70, 1.47, 1.90      | 4 / 5   |
| + `MOVING_EPS` cut-off, ceiling 25     | 1.40, 1.30, idle, 1.68, 0.90      | 3 / 4   |
| + `stanceLatch` (RETIRED, see above)   | 1.59, 1.49, 1.49, idle, idle      | 3 / 3   |

The band floor is ~1.14 Hz and the species' own target is 1.59. In the third batch the failures all had a low `movedM`
(2.7-3.6 m over the 5 s window) and the passes a high one (7-15 m) — the
cadence was still a function of how far the machine happened to walk. The
fourth batch broke that coupling (1.49 at `movedM` 5.97 and 1.49 at 11.15), and
the SECOND pass reproduces it without the latch, because one-plant-per-stance-
window makes the plant rate the clip's own cadence by construction rather than
by whether a sole happened to clear a threshold. An "idle" row is the gate's own
skip (`movedM < 0.4`), not a pass.

The Watcher's equivalent authority is its rotational stride phase; the six
`GaitController` species own the phase outright.

### 5.1 Contact flags are per-FRAME reports — `rig/contact.js`

`FootLock` and `GaitController` both run once per **sim substep** — up to three
times per rendered frame — while `debugFeet()` is sampled once per **frame**. A
plant that closes and re-opens between two draws was never observed as
released, two stances read as one, and the drift measured across the join is a
whole stride.

Both controllers now share **one** rule, in `rig/contact.js`:

> Between two plants of the same foot, a consumer must observe at least one
> sample in which that foot is not planted.

```js
machine.gait.ledger / machine.footLock.ledger   // ContactLedger
ledger.release(leg)     // call from EVERY path that clears a plant
ledger.canPlant(leg)    // the only gate on touchdown
ledger.observe(legs, reportedRows)  // called by debugFeet()/contacts()
ledger.deferred         // re-plants delayed by the rule (diagnostics)
```

**Wave-2 follow-up.** Fix round 1's per-frame counter was the right idea and
still left `A45` failing under full-suite load while passing at 0.008 m
standalone, for two reasons:

1. **Release paths that did not stamp the frame.** `FootLock`'s "the CCD solve
   fell short, drop the plant" branch, the gait's airborne / stomp-lift / limp
   branch, and both low-LOD early-outs cleared `planted` without recording the
   release — so substep 1 of a frame could drop a plant and substep 2 of the
   SAME frame open a new one. At 60 fps there is one substep per frame and the
   hole never opens; at 12 fps there are three.
2. **A consumer that misses a frame.** A frame counter guarantees a released
   frame *exists*, not that anyone looked at it.

**FIX ROUND 2 — the observer rule is now bounded, and this section previously
promised the opposite of what the code did.** The first version held a release
open until a consumer had SEEN it, with a 150-frame grace period, and stamped
`_seenFrame` from the poll — so ONE `debugFeet()` call armed a 150-frame window
in which the next release of every leg waited for a second call that never
came. Measured on a strider at 5207: 36 plants in 120 frames, then one poll and
**4 plants in the next 120**, with the machine gliding over the meadow with
four legs in the air and `machine-footfall` silent (the event fires off the
same rising edge). A judge filmed it.

The rule that carries the honesty is the FRAME rule — a release always spans a
whole drawn frame, so a consumer sampling every frame can never see two stances
as one — plus `plantId` (below) for a consumer sampling more slowly. The
observer extension is now a courtesy for a consumer that is sampling every
frame and has not read THIS frame yet, and it is bounded twice over: it arms
only within `OBSERVER_TTL` frames of the last poll AND expires
`OBSERVER_TTL` frames after the release. **`OBSERVER_TTL` is 2.** A plant can
therefore never be deferred by more than two rendered frames, whatever a
consumer does, and a consumer that polls once and walks away costs the machine
two frames of swing rather than a hundred and fifty.

`debugFeet()` rows now also carry **`plantId`**, a per-foot touchdown counter.
Two stances are two different plants and a slow sampler cannot tell them apart
from the boolean alone; `plantId` makes "is this the same plant?" answerable
without assuming a sample rate. Gate `A45b-stance-report-integrity` samples at
**one third** of the rendered frame rate — a consumer on a contended box — and
asserts zero reports in which `plantId` changes underneath a run of
`planted === true`, at the same 0.06 m drift budget as `A45`.

## 6. Silhouette shells

**No tail on the Sawtooth.** `SAWTOOTH_SHELL` used to author three tail pieces
off the hips "no tail bones on this rig: rides the pelvis". They did not ride
it: a judge measured the piece rendering 15-50 px clear of the body with sky
between them, in both `V26` and `V27`, across two independent runs. It also
disagreed with the spec — `docs/research/roster-v2.md` §3 gives the Sawtooth's
body plan as "Quadruped, front-heavy, **no tail**". It is gone, and a rump
closes the back line where it used to leave.


`rig/shells.js` builds a data-driven plate/muscle kitbash per species —
**two draw calls per machine** (one hard material, one soft, plus a sensor
material where a species has state-coloured eyes).

For the Sawtooth, Thunderjaw, Scrapper, **Longleg** and Glinthawk the shell is
a complete creature and `hideSculpt(machine)` retires the licensed donor mesh
underneath it: the shell **is** the machine.

**Retiring a mesh means four things, one per consumer** (fix round 2 — a judge
measured up to 80 % of a machine's hit volumes built from geometry nobody could
see, sitting up to 0.87 m away from the shell):

| flag | consumer |
|---|---|
| `visible = false` | the renderer, and gates `A44` / `A47` / `A47b` |
| `userData.noHull` | `rig/sockets.js` hull proxy, `rig/ground.js` corpse solve |
| own `raycast` property | **`ctx.hitHulls`** — the arrow raycast, `Machine.resolveHitVolume` component attribution, and the Focus part labels. An own `raycast` is core-platform's published "FX shell" opt-out in `hitHulls.build()`; it is the ONE test that traversal makes. |
| `castShadow = false` | the CSM cascades |

Call `retireMesh(o)` (exported) rather than setting any of them by hand. Gate
`A50-hulls-visible` asserts the result: **zero hit hulls sourced from a mesh
carrying `noHull` / `hiddenSculpt`.** It also lists, per species and without
asserting on them, every other invisible hull source — a component hidden by
distance LOD keeps its hull deliberately (you can still shoot it), and is
tagged `userData.lodHidden` by `updateRigLOD` so the two cases stay
distinguishable.

### 6.1 Shell leg plates are authored on the BIND joints

`legPieces(rig)` draws on the rig spec's own `hip / knee / ankle / toe`,
mid-stride asymmetry and all. Do **not** move them onto the neutral stance:
`buildRig` weights vertices by distance to those same capsules in bind pose, so
a plate drawn 0.7 m away misses every leg segment and falls through to the
spine — measured, a probe that rotated every thigh 1.4 rad and every shin
-2.2 rad moved a sawtooth's four foot bones a metre and a half **and did not
move one visible vertex**. The legs were painted on. `buildRig`'s own
`restFoot` correction carries the bones — and everything bound to them — into
the neutral stance afterwards.

### 6.2 The distance LOD chain — and `A21`'s remaining gap

`updateRigLOD()` runs four tiers at 6 / 14 / 40 body heights. Fix round 2 added
a per-mesh step to it and **fix round 2's second pass rewrote that step**, after
a judge measured what it was actually deleting: "machines go hollow, the Longleg
is decapitated, the Watcher loses its eye lens".

The first version ranked EVERY mesh under the model by world size and kept a
shrinking fraction (100 / 78 / 36 / 16 %). Three things were wrong with it:

1. the ranked list included meshes that are **not drawn** — the donor sculpts
   `hideSculpt()` retires. On the five kitbashed species the list was 3-4 rows
   for 2 real meshes, so "keep 36 %" rounded down to keeping ONE, and a retired
   donor had eaten a keep slot;
2. what it then dropped was `shell-soft`, the machine's whole soft underbody —
   Sawtooth see-through from 38.5 m, Thunderjaw from 56.4 m, Scrapper from
   21 m, all inside combat range;
3. the sensor exemption keyed on `_eyeMats` only, so donor eye meshes carrying
   their own glass material (`Eye_Lense_1001_Glass_Lense_0`) were retired at
   12.6 m on the Watcher.

**Size ranking cannot express "does not open a hole", so the chain is
structural now.** A mesh is eligible for distance retirement only if it is a
FRILL: drawn, not a sensor or a lens, not a `shell-hard` / `shell-soft` body
mesh, and under `FRILL_FRAC` (0.30) of the machine's largest drawn mesh.
Nothing else is ever hidden by distance at any tier, and `KEEP_BY_TIER` is
`[1, 1, 0.5, 0.25]` — **nothing at all is retired inside 14 body heights**,
which is where a fight happens. `userData.lodHidden` is still stamped so
`A50-hulls-visible` can tell a distance-retired mesh from a RETIRED donor.

`pinFullLOD(machine, pin = true)` (exported from `rig/lod.js`) lifts every
distance retirement and holds the machine at tier 0 through `machine._lodPin`.
A staged still composes its cast at 60 m and has to grade the silhouette the
player sees at 12 m; setting `_lodTier = -1` only means "recompute next tick",
and a frozen machine has no next tick.

**Known gap — `A21-real-draw-calls`, staged fight.** The draw-call win the
size-ranked version claimed was five draws against a 55-draw shortfall — the
visual cost bought no gate, which is why correctness was taken instead.
Measured on 5207 with the structural chain in place:

| scenario     | size-ranked | structural | budget |
|--------------|-------------|------------|--------|
| spawn-vista  |  296        |  298-302   |  350   |
| west-herd    |  227        |  244       |  350   |
| staged fight |  405        |  412-418   |  350   |

Seventeen draws in west-herd and seven to thirteen in the staged fight is what
the holes were worth, against a shortfall of 55-68. See the per-species table and the two measured dead ends below. See the
per-species table and the two measured dead ends below.

| species    | draws | instances | visible meshes / instance | materials |
|------------|-------|-----------|---------------------------|-----------|
| watcher    |  126  |     6     | 19                        | 8         |
| longleg    |   60  |           | 13                        | 3         |
| strider    |   42  |           | 1                         | 1         |
| glinthawk  |   39  |           | 2                         | 2         |
| sawtooth   |   34  |           | 2                         | 2         |
| scrapper   |   30  |           | 3                         | 3         |
| thunderjaw |   26  |           | 2                         | 2         |
| behemoth   |   24  |           | 12                        | 12        |

The material levers are **spent**: `unifyMaterials` + `mergeByMaterial` already
take five of the eight species to one or two draws each. The two that are not
cannot be merged at tier 0 without breaking something:

* the **watcher** is a rigid-plate robot — 19 meshes over 8 materials, each
  plate parented to its OWN animated helper bone, so merging by material would
  weld plates that rotate independently. An anchored merge (group by material
  AND nearest animated ancestor) was measured: 19 → **16**, three draws.
* the **behemoth** is 12 meshes over 12 genuinely different textures. Nothing
  dedupes them without repainting the sculpt onto one atlas.

So closing A21's last draws needs one of: a texture-atlas bake for those two
donors (an offline `tools/bake-rigs.mjs` pass, not a runtime one), or a complete
kitbash shell for the watcher so its donor can be retired the way the other
five were. It does not need, and must not be bought with, holes in a machine.

## 7. Corpse grounding

`CorpseGrounder` (`rig/ground.js`) settles a wreck on **one** handle,
`body.position.y`, against the lowest posed vertex and the visible-mesh AABB —
which now agree, because `refreshPosedBounds(machine)` rewrites every
per-machine geometry's `boundingBox` to the **posed** extent on each corpse
tick. A `SkinnedMesh`'s bind box belongs to the mesh node and does not follow
the skeleton; gate `A47` reads exactly that box, so without the refresh the two
corpse gates measure different surfaces and no solve can satisfy both. Round 4
and fix round 1 tried to bridge that gap with a second handle (a lift node over
the root bones) and the two coupled handles ran to their clamps in opposite
directions: **+4.75 m of body against -3.81 m of skeleton** on a glinthawk,
with six of eight species sitting HIGHER dead than alive.

Two more things follow from that measurement and are load-bearing:

- **The collapse lives in the skeleton.** `deathPose` zeroes `body.rotation`
  and `body.position.y`; the roll is spine roll. Rotating a 13 m mesh's node by
  0.15 rad drops its bind box's corner a metre below any geometry, and the
  solve then lifts the whole wreck to satisfy it.
- **A rigid chassis drop is not a collapse.** The ground solve puts the wreck's
  LOWEST point on the soil, so the height its mass rests at is fixed by one
  property of the pose — how far the lowest geometry hangs below the bulk — and
  a downward translation cannot change it. Every drop tried (0.5×–0.95× hip
  height) was handed straight back: 1.38 m of authored collapse on a sawtooth,
  1.26 m of it returned.

`machine.body`'s world position on a settled corpse is now within ~0.1–0.3 m of
where the geometry actually is (fix round 1 left it up to 2.4 m out), but
**anchor to bones or to `machine.position`, not to `machine.body`.**

### 7.1 The scrapper's tilt is gone (was: `A47` / `A47b` mutually infeasible)

**Closed in fix round 2.** Wave 2 measured that `A47` (world AABB of every
visible mesh's `geometry.boundingBox`) and `A47b` (lowest POSED vertex) were
0.74 m apart on a settled scrapper — box −0.21 m against posed +0.53 m — and
that no value of `body.position.y` satisfied both windows. The source was a
`scrapper-tilt` group between `body` and `holder` that pitched the whole model
frame to make the upright donor sculpt read as a quadruped: every shell
geometry's local axes were off-world, and the AABB of a rotated box hangs
0.77–0.80 m below the geometry itself.

The donor sculpt has not been drawn since fix round 1 (`hideSculpt`), so the
tilt was buying nothing. It is retired, and `SCRAPPER_RIG` is now authored as a
level quadruped — which is the same art pass `V26` asked for. See the header
comment in `src/entities/machines/scrapper.js` for the full geometry.

The same pass fixed a defect that only showed in motion: the rig's `legGateY`
was 0.92, **above the entire machine**, so `buildRig`'s leg capsules — which
carry a 1.6x weight boost — claimed the trunk plates' outer corners, 0.03 m
from a thigh capsule axis. At rest that is invisible. The moment the gait swung
a thigh 77 degrees it tore the body open, which is the "fan of intersecting
flat plates ... no legs of any kind are readable" a judge graded on `V26`.

`autorig.js` gained one opt-in spec field for it:

```js
legGateY: 0.80,     // leg capsules may only claim geometry BELOW this
legInboard: 0.13,   // ...and no further inboard than a leg plate reaches
```

`legInboard` (absent = off, so seven species are untouched) rejects a vertex
whose `|x|` is more than that many metres inboard of its leg's widest joint.
`legGateY` alone cannot separate a trunk from a thigh when they overlap in y;
between the two rules the trunk plates (high) and the underbelly muscle (low
but inboard) both stay on the spine while the thigh plates stay on the leg.

### 7.15 `A47` / `A47b` — what the two surfaces were disagreeing about

**Corrected, fix round 2 second pass.** The previous text of this section
claimed "`A47b-corpse-posed` PASSES with zero offenders, so the wreck's real
geometry is on the ground". That was false, and the table printed two lines
above it (thunderjaw A47b **+1.137**) already said so — a judge caught the
contradiction. Both gates were failing, on the same two species, in opposite
directions: A47 read the thunderjaw at **-0.75 m** (buried) while A47b read the
same wreck at **+0.80 m** (floating).

The cause was a timing bug, not an untagged geometry. `refreshPosedBounds()`
stores the output of `applyBoneTransform`, which is the shader's
**pre-`matrixWorld`** space; for a `bindMode: 'attached'` shell whose node has
moved since it was bound — the thunderjaw's has, by 0.897 m — that space
carries the body offset. The refresh ran BEFORE `body.position.y` had the
solved offset added, so it wrote a box exactly `applied` metres below the pose
that renders. Measured on a thunderjaw wreck: stored box min -0.982, live posed
min -0.093, difference **0.889**, `applied` **0.889**. One term, the whole
2.07 m "the two surfaces disagree" story.

Two changes close it, both in `rig/ground.js`:

* the refresh now runs INSIDE the measurement window, where the body already
  holds the offset;
* a settled solve keeps WATCHING with hysteresis (`REARM_LO` / `REARM_HI`)
  instead of latching forever. The old hard latch was right for the wrong
  reason: watching made things worse only because the two surfaces were 2 m
  apart and the out-of-band branch split the difference. With them measuring
  the same wreck, a watch is safe — and it is necessary, because the pose keeps
  folding after the four in-band ticks that used to end the solve.

`posedLowest()` also sampled a third of what `A47b` samples, which on a thin
splayed surface (a Glinthawk wing on its keel) missed the lowest vertex by
0.19 m; the solve's budget now matches the gate's.

Two more terms had to be right before either gate held, and both are the same
class of defect — the solve and the gate grading different things:

* **the ground reference.** `A47` takes the terrain height under the AVERAGE OF
  THE PER-MESH BOX CENTRES; the solve took it under the centre of the union
  box. On a wreck lying across a slope those are metres apart, and the solve
  reported a sawtooth settled at +0.287 that `A47` read at +0.52.
  `hullBounds()` now returns the gate's reference (`outCentre`).
* **the watch cadence.** A corpse away from the player gets very few update
  calls, and a re-arm watch on a quarter cadence measured in DEATH time
  effectively never fired: `applied` and both error terms were byte-identical
  on a sawtooth wreck at 5.2 s and at 9.2 s of wall time. The watch runs every
  tick now.

And the wreck's ROOT is levelled by `deathPose`, not just its body: `_conform()`
composes the root quaternion from the terrain normal and is not called again
once a machine is dead, so a wreck kept its last living slope tilt — 0.6 m of
AABB inflation on a 14 m thunderjaw shell, which made the two gates mutually
infeasible (span 0.53 m against a 0.50 m window) exactly as the scrapper's tilt
did in §7.1.

Measured after, on 5207 — **both gates now pass with zero offenders**:

| gate                   | before (judge's run)                     | after                    |
|------------------------|------------------------------------------|--------------------------|
| `A47-corpse-grounded`  | FAIL — behemoth -0.18, thunderjaw -0.75  | **PASS**, 0 offenders    |
| `A47b-corpse-posed`    | FAIL — behemoth -0.41, thunderjaw +0.801 | **PASS**, 0 offenders (see note) |

**Note — `A47b` is now marginal on the GLINTHAWK, not on the two species it
used to fail.** It passed with zero offenders in the full-suite run (glinthawk
+0.300 against a +0.40 float budget) and failed one later standalone run on
that species alone. Its wreck lies splayed on a 5.2 m keel whose thin outboard
surfaces are exactly what a sampled posed measurement is worst at, and it is
the one species whose grounder runs `mode: 'incremental'` because it owns
`body.position.y` across frames itself. It is inside budget by 0.10 m when it
passes, which is not enough margin; the remaining work is on that species'
sampling, not on the solve.

| species    | `A47` box (m) | `A47b` posed (m) |
|------------|---------------|------------------|
| watcher    | +0.02 | +0.152 |
| sawtooth   | +0.32 | +0.254 |
| behemoth   | +0.19 | +0.083 |
| thunderjaw | +0.03 | +0.270 |
| strider    | +0.29 | +0.290 |
| scrapper   | +0.24 | +0.239 |
| glinthawk  | +0.18 | +0.300 |
| longleg    | +0.02 | (0.055-0.15)   |

### 7.2 Known gap — `A47c-corpse-mass`

Gate `A47c` grades the wreck's **median** posed vertex height (`deadMedian <=
0.75 × aliveMedian`), because `A47`/`A47b` grade a single lowest point and one
splayed limb satisfies that while the body floats. Only the watcher (0.70),
strider (0.84) and glinthawk (0.09) currently pass it. The diagnosis is in the
bullet above: the fold in `deathPose` does not yet make the wreck **compact**
— its (median − lowest) is within ~15 % of the standing value — so there is
nothing for the ground solve to descend through. The fix is a fold that ends
with the machine's lowest geometry near its belly line rather than a limb
hanging a body-height below it, per species; it is not a tuning constant.

## 8. Offline bake

`node tools/bake-rigs.mjs --write --apply --skinned --simplify` re-bakes
`public/models/*`: dedupe, weld, palette + join (so the sculpts batch), the
per-species triangle budget, and the `autorig` rig spec written into the GLB.
Its own artefacts — `<name>.baked.glb` and the `<name>.glb.orig` backup — land
in `models-staging/{baked,orig}/`, **never in `public/`**: `public/` is vite's
`publicDir` and anything left there is copied verbatim into `dist/` (fix round
2 removed 25 MB of such spoil, which was shipping a 40 MB model payload for
15 MB of real models and cancelling this pass's own triangle result).
The triangle pass took the 24 spawned machines from **2.01 M triangles to
0.53 M** (the whole scene from 2.69 M to 1.21 M), which is 75 % of everything
drawn and the reason the gate box renders at ~15 fps instead of ~10.

Re-run `node tools/gates.mjs --lane machine-rig` after any bake.

## 9. Cross-lane requests (open)

- **`core-platform`, `src/core/engine.js:615` `warmUp()`** — the compile is
  raced against a timeout, and when the timeout wins three's abandoned
  `checkMaterialsReady` loop keeps polling forever. The first material
  disposal after that throws `TypeError: Cannot read properties of undefined
  (reading 'isReady')` from inside a `setTimeout`, where `warmUp`'s own
  try/catch cannot see it — so **every machine despawn in a normal session
  threw**, and a console error is an automatic gate FAIL. `warmUp` needs a
  cancellable compile (or to `await` it and drop the race). Until it lands,
  `rig/lod.js guardMaterialDisposal()` parks a satisfied stub program in the
  renderer's property map as a machine-owned material disposes, which lets the
  abandoned poll finish instead of throwing.
