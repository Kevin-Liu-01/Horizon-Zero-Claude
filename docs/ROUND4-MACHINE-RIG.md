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

Refreshed on the first LOD tick and every 120 frames from `updateRigLOD()`,
off each geometry's own bounding box. `height` is deliberately NOT touched: it
is a gameplay quantity (LOD rings, shadow rings, corpse mass, eye heights).

#### 3.5.1 The bind box was NOT a conservative envelope — FIX ROUND 1

This section used to justify reading `geometry.boundingBox` with "a bind box is
a conservative envelope of every pose the skeleton can reach, which is the
right side to be wrong on for a broadphase". Measured on the live thunderjaw,
that is false and wrong-side:

| | X | Y | Z |
|---|---|---|---|
| `shell-hard` **bind** box | 1.11 | 2.34 | 1.40 m |
| socket span head-sensor → tail-tip | | | **9.1 m** |

A `SkinnedMesh`'s `geometry.boundingBox` is the BIND box; it belongs to the
mesh node and does not follow the skeleton, and this rig's bind pose is a
compact blob that the bones then spread into the machine. So the "conservative
envelope" was a 1.4 m box standing in for a 9 m body, and three separate
consumers were reading it:

* **`machine.size`**, published from here → the `ctx.hitHulls` broadphase
  sphere, i.e. arrows at a thunderjaw's tail rejected before any hull was
  tested;
* **`skinnedBounds()`**'s frustum sphere — its 2.2x pad on a 1.4 m bind sphere
  is nowhere near a 9 m machine, so a thunderjaw could be culled with its body
  on screen;
* **gate `A44-socket-integrity`**, whose hull is exactly this box. That is the
  whole of the judge's *"A44 still FAIL: head-sensor gap 2.95 m, heart 2.25 m,
  tail-tip 1.95 m vs a 0.10 m budget"* — and why the same gate read **0 m when
  DEAD**: `refreshPosedBounds()` already existed, and ran only from the corpse
  settle solver.

The fix is one line of scheduling: `refreshPosedBounds(machine, 256,
{ live: true })` at the top of `publishDrawnBounds()`, on this function's own
120-frame throttle. The live path differs from the corpse path in three ways,
each for a measured reason:

* it **skips** shared geometry instead of cloning it — a sculpt buffer is
  shared across every machine of its species and 24 clones is the memory the
  variety pool exists to avoid. The big skinned meshes a live machine draws are
  per-machine already (the kitbash shells, plus whatever `mergeByMaterial`
  merged) and bone-bolted components are unskinned, so their boxes are exact
  without help. A few shared skinned donor meshes do get skipped — the
  watcher's `Object_13` among them — and measurably cost nothing, because the
  per-machine meshes beside them already span the body;
* it **unions with the bind box**. The glinthawk's shells carry no usable skin
  weights and pose to a 0.02 x 0.03 x 0.01 m point; writing that would shrink
  its cull sphere to 2 cm and make the shell vanish. A live box's job is to
  cover what is drawn, so the conservative side is the correct side. The union
  is always against the ORIGINAL bind box, stashed once, or it would ratchet;
* it refreshes the bounding **sphere** too, since that is what the renderer
  culls against.

Result, all eight species, worst socket gap **2.95 m → 0.002 m**, and
`machine.size` on the thunderjaw 11.06 x 9.4 x 17.8 m where it had been
describing a 1.4 m blob.

#### 3.5.2 …and that is what `A48-cadence` was failing on too

The judge logged a second finding, *"A48 still FAIL for thunderjaw: cadenceHz
0.7 against a band of [1.27, 3.82] Hz"*, and proposed "a thunderjaw-specific
gait cadence table fix". No table was needed — it is the same bug. `A48` builds
its acceptance band with `cadenceBand(bodyLengthM)` from `measureBodyLength()`,
which measures the machine off the bounds above. With the bind blob standing in
for the body, the thunderjaw measured ~7 m and was graded against a band for a
machine half its size. Posed, it measures **15.8 m**, the band becomes
**[0.39, 1.18] Hz**, and the 0.7 Hz the rig was actually stepping at — which
was never wrong — sits inside it. `A48` passes for all seven walkers with an
empty offender list.

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

### 6.2.1 Components retire on the same rule — FIX ROUND 3

Judge finding, fix round 3: *"components are still distance-retired at LOD
tier 1 (>= 6 body heights) with their hit hulls left behind — and §6.2 asserts
the opposite"*. Both halves were true. The paragraph above described the MESH
trim only; the COMPONENT loop three lines below it in `updateRigLOD` was still
on the round-1 rule, `tearHp <= 20 || /antenna|plate|wire|cable/i`, at tier 1.
What that name regex deleted, per species:

| machine | component | tearHp | what it is | gone from |
|---------|-----------|--------|------------|-----------|
| thunderjaw | `heart-plate` | 55 | CANON weak point | 56 m |
| thunderjaw | `head-plate` | 55 | CANON weak point | 56 m |
| thunderjaw | `armor-plate-1..2` | 50 | armour | 56 m |
| sawtooth | `hip-plate-r/l` | 30 | armour | **16.5 m** |
| watcher | `antenna` | 18 | cosmetic | **12.6 m** |

and in every case the hit hull stayed behind: `A50-hulls-visible` counted 22
sawtooth, 81 behemoth and 83 thunderjaw hulls on components nobody could see.

The rule is now the same structural test, in the two quantities a component
actually has, and **no name is read**:

* **`tearHp` says what it IS.** A `weak` point, an `elemental` payload and a
  `linkedAttack` component are never eligible at any size; above
  `PART_TRIM_TEARHP` (20) a component is armour, and armour is silhouette.
  Measured across the roster that one term does the whole discrimination the
  regex was reaching for: the only components that fall through it are the four
  cosmetic masts — `antenna` (18), `antenna-1..3` (14), `alarm-antenna` (20).
* **Measured screen size, in PIXELS, at the tier's own near edge.** A
  body-height FRACTION was the obvious second term and it is the wrong one: it
  is a constant, so it means the same thing at 14 body heights and at 400, and
  no value of it is both "invisible at the far tier" and "not deleting
  something you can see at the near one". `partPixels` projects the measured
  world size through the LIVE camera at `TIER_MIN_H[tier] * H`; a component may
  go only below `PART_TRIM_PX` (8 px).

`PART_TRIM_TIER` is 2, so the loop cannot fire inside 14 body heights at all.
Measured with the camera parked at 3 / 8 / 20 / 60 body heights on every
species (`updateRigLOD` re-tiered at each stop):

| tier | distance | components retired |
|------|----------|--------------------|
| 0 | < 6 H | none |
| 1 | < 14 H | none |
| 2 | < 40 H | **none** — a sawtooth antenna is 0.31 H, i.e. 19 px at 14 H |
| 3 | >= 40 H | sawtooth `antenna-1/2/3`, longleg `alarm-antenna` |

`heart-plate`, `head-plate`, `armor-plate-1..2` and `hip-plate-r/l` are drawn
at every distance on every species. `A50-hulls-visible` now reports
`ofWhichLodHiddenParts` 9 / 0 / 0 for sawtooth / behemoth / thunderjaw, against
22 / 81 / 83 before, and the 9 are the three sawtooth masts at tier 3.

**What it costs.** A Sawtooth at 16.5 m keeps hip armour and three antennae it
used to delete, so `A21`'s machine draws in the staged fight went **73 -> 75**
before the atlas below gave 5 back. That is the trade the finding asked for.

`pinFullLOD(machine, pin = true)` (exported from `rig/lod.js`) lifts every
distance retirement and holds the machine at tier 0 through `machine._lodPin`.
A staged still composes its cast at 60 m and has to grade the silhouette the
player sees at 12 m; setting `_lodTier = -1` only means "recompute next tick",
and a frozen machine has no next tick.

### 6.2.2 `A21-real-draw-calls` — the atlas lever, taken and measured

**The table this section used to carry was stale and is deleted.** It claimed
"watcher 19 meshes / 8 materials / 126 draws" and a staged fight at 412-418
draws; re-measured on 5207 by wrapping `renderer.renderBufferDirect` in the
gate's own staged-fight composition, the watcher draws **2 body meshes** (the
runtime's `skinRigidAttachments` + `mergeByMaterial` already fold its nine
`Main_Body_Texture` primitives into `Object_11-x9`) and the fight is **363-382
against a 350 budget, i.e. 32 over, of which machines are 73**. The honest
ledger, one draw per row per instance in frame:

| machine | draws | what they are |
|---------|-------|---------------|
| behemoth | 17 | **10 donor meshes, one per material** + 2 shell + 5 component |
| thunderjaw | 12 | 2 shell + 10 component |
| longleg | 11 | 2 shell + 8 component + 1 |
| sawtooth | 8 | 2 shell + 6 component |
| glinthawk | 7 | 3 instances x 2 shell + 1 |
| strider | 6 | 6 instances x 1 mesh |
| watcher | 5 | 2 body + 3 component |
| scrapper | 5 | 3 shell + 2 |
| machine-fx | 2 | the pooled glow system |

Judge fix round 3: *"take one of the two levers §6.2 already names — a
texture-atlas bake for the watcher and behemoth donors, or the plate-shell
kitbash for the watcher"*. **The atlas lever was taken**, because it is the one
that changes no geometry and no silhouette: `atlasMaterials()` in
`tools/bake-rigs.mjs`, run as
`node tools/bake-rigs.mjs --only behemoth,watcher --atlas --write --apply`.

What it does and what it refuses to do:

* packs each eligible material's maps into one grid atlas per SLOT (base /
  metallic-roughness / normal / emissive, the same cell layout in each so one
  UV addresses all of them), rewrites `TEXCOORD_0` into the cell and repoints
  every primitive at one merged material. The runtime's own `mergeByMaterial`
  then collapses the meshes with no new runtime code;
* a material is eligible only if **every** primitive using it fits ONE unit UV
  tile after a single INTEGER shift. These sculpts are authored `REPEAT` and
  some of them tile — the watcher's Main Body spans `u ∈ [-1.00, 0.75]` — and
  wrapping per-vertex would smear any triangle that straddles a tile boundary
  across the whole atlas. All-or-nothing per material: splitting one material's
  primitives between atlased and not would ADD a draw;
* `baseColorFactor` / `metallic` / `roughness` / `emissiveFactor` are baked
  into the cell as a pixel multiply, so one merged material renders what ten
  donor materials rendered;
* **everything a material carries that has no pixel to hide in goes into the
  group KEY**, not into the merge: alphaMode, doubleSided, alphaCutoff,
  normalScale, occlusionStrength and every material EXTENSION. Materials that
  disagree are never merged, and the merged material copies member 0's
  extensions. This is not academic — the first pass folded three watcher
  materials and would have repainted them, because `Headplate_Frill` is
  `KHR_materials_specular specularColorFactor [1,1,1]` and `Headlights` is
  `[0,0,0]`, and three.js reads that extension. The ONE extension the atlas
  does fold is `KHR_materials_emissive_strength`, a scalar on a channel the
  atlas already owns: the merged material carries the group MAXIMUM and each
  cell is scaled to its own share;
* cells are inset by a gutter filled with edge-copy, so no mip level fetches a
  neighbour's texels across a seam. `mr` is packed at half the base cell (a
  low-frequency mask), base and normal at the donor's own density.

Measured result:

| donor | prims | materials | textures | atlas | draws / instance | file bytes |
|-------|-------|-----------|----------|-------|------------------|------------|
| behemoth | 10 → **1** | 10 → **1** | 26 → 4 | 2x5, 23.6 Mpx (was ~26 Mpx in 25 maps) | 12 → **3** | 2.57 → **2.36 MB** |
| watcher | 17 | 6 → 6 | 18 → 18 | **none** | 2 body, unchanged | 1.83 MB, byte-identical |

**VRAM and PAYLOAD are two numbers, and this row used to report only one.**
Fix round 1, judge finding *"Atlas bake grows behemoth.glb 45 % on disk
(2.57 → 3.73 MB), undisclosed, and §6.2.2 claims the fold is free"* — which was
correct, and the surrounding prose's "so the fold costs no VRAM at all" was
true of VRAM and silent about bytes. Stated separately now:

* **VRAM** 23.86 → **23.63 Mpx** (25 donor maps → 4 atlases)
* **payload** 2,572,620 → **2,358,528 bytes** (2.57 → 2.36 MB, −8 %)

(Sizes in this section are decimal MB, matching `wc -c` / `stat`, which is how
the finding was reported. The tool's own ledger prints MiB, so it shows the
same file as `2.45 -> 2.25 MB`.)

The 45 % regression was one flag — `lossless: slot === 'normal'` in
`atlasMaterials()`. It took the normal slot from 0.13 MB to 1.64 MB, 12.6x, and
bought nothing: the donor's own normal maps are already LOSSY webp, so the
lossless re-encode was spending 1.5 MB perfectly preserving the donor codec's
artefacts. Measured sweep on the whole file, against HEAD's 2.57 MB:

| normal-slot encode | file | normal slot |
|--------------------|------|-------------|
| `lossless` | 3.73 MB (+45 %) | 1.64 MB |
| `nearLossless` | 3.49 MB (+36 %) | 1.41 MB |
| **`quality: 95`** | **2.36 MB (−8 %)** | **0.28 MB** |
| `quality: 92` | 2.25 MB (−13 %) | 0.23 MB |
| `quality: 88` | 2.18 MB (−15 %) | — |

95 ships: one lossy generation on already-lossy maps, with enough headroom over
the colour slots' 92 that the gradient banding a normal map is sensitive to
does not appear, and still under HEAD's payload. `NORMAL_Q` in
`tools/bake-rigs.mjs` carries the table.

**No gate measures model bytes**, which is why a 45 % regression shipped
silently while `perf-tech-14 assets over budget` sits in audit §2 as a MAJOR on
this lane. The tool now prints the whole-file `before -> after MB (±%)` on the
per-machine headline line, next to the triangle and material counts, instead of
only inside the atlas sub-ledger where it read as a texture statistic.

The behemoth is the win: **10 draws to 1**, and the film is strictly better —
with ten separate meshes the engine's screen-space size cull was dropping the
leg and interior meshes at staging distance, so the machine read as a stack of
bare plates; as one mesh it draws all of itself (`shots/r2-beh-BEFORE2.png` vs
`shots/r2-beh-FINAL.png`, same frame, same hour, same camera).

**The watcher is NOT atlasable, and the tool says so rather than guessing.**
Its six materials are refused for two independent reasons, both printed by the
bake: `Main_Body_Texture` and `Eye_texture` tile outside one UV square
(`u ∈ [-1.00, 0.75]` on the Main Body), and each of the remaining four sits
ALONE in its `KHR_materials_specular` compatibility group. `public/models/
watcher.glb` is therefore left exactly as it was — the bake is a no-op on it
and re-writing it would have been a model change for nothing. The watcher's
donor is also no longer the 19-mesh problem §6.2 described: the runtime already
draws it in **2** meshes. Its remaining lever is the other one the judge named,
the plate-shell kitbash, and that is now worth at most 2 draws an instance.

**What is still open.** `A21` re-run on 5207 after both fix-round-3 changes,
against the same gate before them:

| scenario | before | after | budget |
|----------|--------|-------|--------|
| spawn-vista | 302 | 302 | 350 |
| west-herd | 180 | **209** | 350 |
| staged fight | 382 (over 32) | **382 (over 32)** | 350 |

and world-wide `batchCeiling.machineDrawsNow` **268 -> 259**, behemoth
`perInstanceNow` **24 -> 15**. The two fix-round-3 changes pull against each
other in the fight and net out flat: the atlas gives 9 draws back on the
behemoth and §6.2.1 spends them keeping components a Sawtooth at 16.5 m used to
delete. west-herd's +29 is the same trade at 34 m — six Striders and two
Watchers at 16-17 body heights now draw the blaze canisters and lenses the old
tier-1 rule deleted at 28 m — and it sits 141 draws inside budget.

The atlas also improved the spatial lane's `A23b-hull-fidelity`, which fails
for its own reasons on both sides of the change: A/B'd on 5207, `worstGap`
37 -> 28, `worstGapRatePct` 30.6 -> 23.1, and `pooledProudP90M` 1.21 -> **0.47**
against a 1.15 bar, because the behemoth's 1653 hulls over ten meshes became
1072 over one.

The shortfall is now exactly located, and it is **not** the donors: it is
**68 component meshes across one of each species**, because every part factory
emits one mesh per material (`canisterMesh` = emissive core + metal cage,
`radarMesh` = 3) and §6.2.1 forbids retiring any of them inside 14 body
heights, which is the whole of the staged fight (9-17 m). Closing `A21` from
here means ONE draw per component — folding each part group's accent emissive
into its base mesh, the way `plateMesh` already folds its under-frame into
vertex colours. That is a `parts.js` rework, not an LOD tweak; it is out of
scope for a residue round, and it is the lane's next `A21` lever and the only
one left that costs no silhouette.

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
splayed limb satisfies that while the body floats. In the shipping pose only
the watcher (0.45), longleg (0.71) and glinthawk (0.10) pass; sawtooth (1.02),
behemoth (1.41), thunderjaw (1.22), strider (0.87) and scrapper (1.23) do not.

**FIX ROUND 1 attempted this and REVERTED. The measurements are the useful
output; recording them so the next pass does not re-buy them.**

The governing arithmetic is this, and it rules out most of the obvious fixes:
`CorpseGrounder` lands the wreck's LOWEST vertex on the soil, so the height of
the mass above ground is `median − lowest` — a property of the pose's vertical
DISTRIBUTION alone. **No rigid translation can change it.** Measured: 2.69 m of
solved chassis descent on the thunderjaw moved its dead median 5.72 → 5.60 m,
because once the belly is the lowest point, lowering the pelvis lowers the legs
with it and the grounder hands the whole thing straight back.

What is actually wrong is visible in one number: the wrecks die STANDING, and
the leg fold is what holds them up. `deathPose` tucks the legs (thigh +1.3 rad,
knee −2.0 rad), which lifts the feet clear of the ground **on purpose** so the
chassis has somewhere to descend to — but per the paragraph above that descent
buys nothing, and alive those same leg vertices span ground-to-hip and pull the
median DOWN, while curled into the air at 2.7-3.4 m they push it UP. Thunderjaw
median 4.34 m alive against 5.60 m dead, feet above its own back.

Four levers were built and measured against that:

| lever | result |
|-------|--------|
| solved chassis DESCENT (signed `_chassisLift`, tip-clearance budgeted) | median −0.12 m. The loop had a real bug — it measured before `CorpseGrounder` re-applied its offset, so three species read a 0.41 m penetration that was really 0.41 m of float and refused to move — but fixing that only let it run to its cap for no gain |
| body-node roll (`_deathRoll` 1.15 rad through `body.rotation.z`) | **worse.** A posed box is tight in the mesh's OWN space; the roll is on a node above it, and the world AABB of a rotated box is not the AABB of rotated geometry. The grounder chased the phantom corner and parked the thunderjaw **1.53 m in the air**. This vindicates the original "the collapse lives in the SKELETON" decision, which fix round 1 had assumed the posed-box work made obsolete |
| spine roll at `_deathRoll` magnitude, about the machine's WORLD forward axis | real: sawtooth 1.02 → 0.69. The old roll was `rotZ` (local), and after `rest.restore()`'s neutral-stance correction a spine bone's local z is not the body's roll axis — the same lesson the leg splay records. 1.15 rad down the chain had left the thunderjaw's torso essentially upright |
| FK leg SPLAY instead of the tuck (thigh out to near-horizontal) | numbers flat, and **a visual regression** — the wreck reads as a splayed star with limbs in the air (`shots/r2f-wreck-saw.png` vs the tuck, `shots/r2f-wreck-saw2.png`) |

Best combined state reached **3 offenders, worst ratio 1.24** (from 5 / 1.44),
but the same diff cost `A47-corpse-grounded` (thunderjaw float) and
`A47b-corpse-posed` (glinthawk) — both of which pass today — so it was reverted
whole rather than trading two green gates for a still-red one.

**What the next pass needs.** Not a tuning constant and not a splay: an
authored per-species lie-down, where the chain ends with the torso's long axis
horizontal and the limbs folded beside the body rather than under or above it,
validated against `A47`/`A47b` on every frame of the settle. Given D1(b) keeps
the 424-joint rig and extends clips, the cheapest honest version is a real
death CLIP per species rather than more FK in `deathPose`.

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

### 8.1 `--atlas` — the texture-atlas pass (fix round 3)

`node tools/bake-rigs.mjs --only behemoth,watcher --atlas --write --apply`

`palette()` folds materials that carry NO texture; `--atlas` is the pass for
the ones that do, and it is the lever `A21` was waiting on (§6.2.2 has the
measured result and the eligibility rules). Two things to know before running
it anywhere else:

* it is **skin-safe** — it writes `TEXCOORD_0` and material pointers only, and
  touches no position, joint or weight — so unlike `join`/`palette` it is NOT
  gated behind `--skinned`;
* it **refuses** a material whose primitives tile outside one UV square, and
  prints why (`not atlased  Main_Body_Texture: UVs tile outside one unit
  square`). A refusal is the pass working: wrapping per-vertex would smear a
  boundary triangle across the whole atlas.

`--atlas-cell` (default 1024) sets the base cell; metallic-roughness is packed
at half of it, and the normal slot is encoded at `NORMAL_Q` (95) rather than
losslessly — see §6.2.2 for the measured sweep and the 45 %-payload regression
that constant exists to prevent. Re-run `A44b/A47b/A50/A50b/V26/V27` after an
atlas bake — it changes what a machine's meshes ARE, which is what those five
measure.

**The bake is idempotent and re-reads the LIVE model**, not the donor: a second
`--atlas` run on an already-atlased file reports `only 1 material in its
compatibility group` and does nothing. To re-bake with different settings,
restore the pre-atlas model first (`git checkout HEAD -- public/models/<name>.glb`)
or a second atlas would be layered on the first. **Watch the payload column**
on the headline line — it is the only place model bytes are reported, since no
gate measures them.

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
