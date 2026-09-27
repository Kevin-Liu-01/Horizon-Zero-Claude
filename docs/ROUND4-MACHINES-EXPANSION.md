# ROUND 4 — `machines-expansion`

Eight new machine species, their rigs, shells, gaits, death poses and LOD
chains, plus the rig-side disposal and cadence work the audit put in this lane.
This is the reference for every other lane that touches them: what exists, what
it is called, and the invariant a caller has to respect.

Owned files: `src/entities/machines/**` species files, `rig/*`, `autorig.js`,
`gait.js`, `parts.js`, `variety-assets.js`, `public/models/*`,
`tools/bake-rigs.mjs`, `tools/gates.round4.machines-expansion.mjs`, and NEW
rows only in `src/entities/machines/ai/tables.js`.

---

## 1. The species, and the chassis each one retired

| kind | class | file | donor | chassis retired |
| --- | --- | --- | --- | --- |
| `broadhead` | `Broadhead` | `broadhead.js` | Quaternius Bull (CC0) | strider |
| `grazer` | `Grazer` | `grazer.js` | Quaternius Deer (CC0) | strider |
| `snapmaw` | `Snapmaw` | `snapmaw.js` | BlackCaiman (CC-BY) | sawtooth |
| `ravager` | `Ravager` | `ravager.js` | Lion (CC-BY), **retired** | sawtooth |
| `shellwalker` | `ShellWalker` | `shellwalker.js` | Quaternius Spider (CC0), **retired** | behemoth |
| `corruptor` | `Corruptor` | `corruptor.js` | Scorpion (CC-BY) | sawtooth |
| `stormbird` | `Stormbird` | `stormbird.js` | Hawk (CC-BY), **retired** | glinthawk |
| `redeye` | `Redeye extends Watcher` | `redeye.js` | watcher.glb, 2nd load | watcher |

**Retired** means `hideSculpt(machine)`: the donor is not drawn, not a shadow
caster, not a hull and not aim geometry, and the authored shell IS the machine.
The reason is recorded per species in `rig/shells-expansion.js`; in every case it
is a measurement (the Lion bound 2,196 of 2,496 vertices to one joint; the baked
Hawk is a 21.6 x 18.4 m organic bird that the authored machine lived inside).

**There is no Tallneck.** `casting-v4` §2.8 puts it last and describes a
re-proportion job at a scale nothing else in the build uses. It is not shipped,
so it is also not cast in this lane's gates and `/models/tallneck.glb` is no
longer in `variety-assets.js` `SPECS` — it is not fetched, baked or held. The
`tallneck` KIND still exists in the world on `ai/doctrine.js`'s behemoth
chassis; that is machine-ai's file and machine-ai's call.

CC-BY credit lines for BlackCaiman, Lion, Scorpion and Hawk are in `README.md`.

## 2. The handover contract: `machines.registerKind`

`variety-assets.js` `registerExpansionSpecies(ctx)` calls
`ctx.machines.registerKind(kind, Cls)` for every entry of `EXPANSION_SPECIES`
whose sculpt loaded. Ordering is guaranteed, not hoped for:
`machines/index.js` spawns the expansion layout from `.then()` on the SAME
promise (`loadVarietyModels`), so registration lands before the first spawn and
no machine is ever built on a chassis whose species file is present. Site
respawns key off `kind`, so they pick up the real class too.

A consumer needs nothing from this file. `ctx.machines.spawn(kind, x, z)` and
every table keyed by `kind` behave identically before and after the handover;
only `machine.constructor` changes.

## 3. Published API

### `settleCorpseNow(machine)` — `rig/ground.js`

Runs 18 fixed steps of the species' own `onDeathPose` immediately, then restores
`machine._deathT` so the DRAWN crumple still plays from the start. Call it once,
from `_die()`. `ExpansionMachine._die()` already does.

*Invariant:* `onDeathPose` must be idempotent in death time — it is called with
monotonically increasing `deathT` and must land on the same pose whether it ran
eighteen times in one frame or once a frame for two seconds. The Stormbird's
fall is keyed on `deathT` exponentially for exactly this reason, and the
Longleg's Death clip steps on the death clock (not 1/60 s per call) for the
same one.

Since residue fix round 2 the grounder HOLDS what the settle converged on until
the replayed death clock passes the settle (`CorpseGrounder._replayUntil`),
easing the offset in with the collapse; it resumes solving from there. Every
species that calls it also runs its death clock through `deathDt(machine, dt)`
(`gait.js`: sim dt x `wallPerSim`, so the collapse finishes in wall seconds on
a page the sim cannot keep up with, and is unchanged when it can).

### GaitController options added in residue fix round 2 — `gait.js`

`standLift` / `highWalk` / `bellyMin` (m): a living body's pelvis lift standing,
extra lift in proportion to travel, and the lowest the pelvis may go relative
to rest (a belly comes down TO the soil, not into it). `layWreck` (bool): a
`sprawl` wreck lays its legs and tail along the ground (`_layToward`) instead
of folding and drooping them; bones it lays carry `userData.corpseLaid` and
`CorpseShape` leaves them to the pose. `layTailRoot` (rad): how far the tail
root may droop when laid. `CorpseGrounder.restOffset()` is the offset the
chassis will rest at, as of the last measurement.

### `disposeRig(machine)` — `rig/lod.js`

Releases everything the rig side of a machine allocated: every geometry it owns
(pooled geometries are skipped — see below), every material, every texture, the
LOD clones, the part meshes, the corpse debris **and the skeleton's bone
texture** (`Skeleton.computeBoneTexture` allocates one DataTexture per machine
and it is invisible to a teardown that walks materials and geometries; that was
the `A90` leak). Also removes the roots from the scene.

*Invariant:* after `disposeRig`, the machine's meshes must not be re-added or
re-rendered. `machine.disposeRig()` is the per-machine wrapper.

### `ownRigResource(machine, resource)` — `rig/lod.js`

Registers a geometry / material / texture as owned by this machine so
`disposeRig` will release it. Anything a lane allocates per machine and attaches
under `machine.root` should be registered here.

*Invariant:* never register a SHARED resource (a module-level geometry, an
asset-entry texture). `disposeRig` will free it under the next machine.

### `disposeGeometryPool()` / `geometryPoolStats()` — `rig/lod.js`

The per-species geometry pool: the first machine of a kind builds its fold
buffers, every later one borrows them. `geometryPoolStats()` returns the live
counts (used by `A90-rig-reclaim`); `disposeGeometryPool()` drops the pool
entirely, for a teardown between worlds.

*Invariant, and it surprises people:* **a pooled geometry's `dispose()` is a
deliberate no-op.** A machine that disposes its own meshes must not take the
shared buffer with it. If you need a per-machine buffer (the corpse solve
refreshes bounding boxes in place, for instance) set
`geometry.userData.perMachine = true` at build time — `buildShell` already does.

### `ExpansionMachine.attackPose(a)` / `clearAttackPose()` — `rig/expansion-base.js`

The species pose layer. `_updateAttack` calls `attackPose(this._attack)` every
frame AFTER the AI move's own `onUpdate`, so a species wins the frame for the
channels it writes and leaves every other channel to the generic builder.
`_cancelAttack` calls `clearAttackPose()`.

*Invariant:* `attackPose` writes `this.gait.pose.*` only, never bone transforms —
`gait.update()` opens with `rest.restore()` and would wipe them. Write bones
AFTER `gait.update()` in `animate()` (the Shell-Walker's arm-claws do).
`clearAttackPose` must zero every channel `attackPose` can write.

### `buildShell(machine, builder, { rig, tint, sensorColor })` — `rig/shells.js`

`tint` multiplies the family plate palette per machine (the Corruptor's matte
black) without forking the shell material. `sensorColor` picks the emissive the
state system drives (the Redeye's red calm).

### `machine.disposeRig()`

Per-machine wrapper over `disposeRig`. `machines.sites.dispose(m)` calls it.

## 4. The rig side

* `rig/rigs-expansion.js` — `EXPANSION_RIGS`, merged into `autorig.RIGS`. Every
  joint is **measured in the running game**, not copied from the casting doc.
  The file opens with why every species is `autorig` + `GaitController` rather
  than mixer-driven, and what that costs.
* `rig/shells-expansion.js` — one builder per species. Pieces are authored in
  BODY space against the matching rig spec, so `autorig`'s capsule weighting
  binds each plate to the bone it is drawn on.
* `autorig.js` publishes `rig.headReach` and `rig.headRestY` (body metres) so
  `deathPose` can derive a neck droop whose vertical drop cannot exceed the
  height the head starts at. A fixed angle drove a Snapmaw's snout 1.10 m and a
  Corruptor's head capsule 3.07 m through the terrain, and `CorpseGrounder`
  lifted the whole wreck by that much.
* `variety-assets.js` `STYLE[kind].underbody` — a species that KEEPS its donor
  ramps onto the dark underbody palette instead of the chassis one, so the
  authored white-grey plate has something to read against. Without it the Bull's
  hide came out at `0xd0d5da` and the shell's plate at `0xd2d7dc`, and the
  machine filmed as a uniformly cream cow.

## 5. Cadence

`gait.js` `CadenceLoop` publishes:

* `cadCeilK(loop)` — the band-ceiling credit, conditional on measured
  under-delivery.
* `loop.noteCeil(bound)` / `loop.satFrac` — the fraction of MOVING frames on
  which the band ceiling, rather than the dynamics, decided the commanded
  cadence. `A48b-cadence-headroom-expansion` grades it. This exists because the
  previous round hard-clamped the command at 0.98x the bar `A48-cadence`
  measures, which made the gate unable to detect the condition it exists to
  catch; the clamp is gone and the saturation is measured instead.
* The footfall ledger is latched **after** the IK solve, at the end of
  `GaitController.update`. Latching before the solve made `_honestContact` (a
  world-position test) read every planted foot as airborne, which starved the
  integrator.

## 6. Gates

`tools/gates.round4.machines-expansion.mjs`:

| id | kind | what it grades |
| --- | --- | --- |
| `A44c-lineup-expansion` | action | batch A stages, draws, repairs and fits the frame |
| `A44c-lineup-expansion-b` | action | the same for batch B, on its own page |
| `A90-rig-reclaim` | action | 30 spawn/kill/dispose cycles grow geo <= +40, tex <= +30; a LIVE machine costs <= 1 of each |
| `A48b-cadence-headroom-expansion` | action | the band ceiling is not the binding constraint on most frames |
| `V26a` / `V26b` | visual | silhouette, batch A / batch B, at a 3/4 yaw |
| `V27a` / `V27b` | visual | attack wind-up, batch A / batch B |

The per-species foot, socket and variety gates (`A44`, `A45`, `A46`, `A47`,
`A48`, `A41c`, `A76b`) are NOT redefined here: every one of them discovers its
cast by walking `__CTX__.machines.list`, so a new species is covered the moment
it exists. Forking the bar is the one thing a gate file must not do.

`repairCast` (in this lane's gate file) re-fits a staged cast from its POSED
skeleton, pins the result at UPDATE time (not `onAfterRender`, which lands after
the shutter) and re-derives the honesty report from the frame that will actually
be captured. A machine under 12 % of the frame on either axis is reported as a
speck and fails the staging gate.

## 7. Stride table

`A48-cadence` derives each species' legal footfall band from its MEASURED body
length, and delivered cadence is travel speed over stride. Every expansion
stride is solved from that band (`runRef / ceiling`, plus ~8 % margin) rather
than picked; the numbers are in each species file next to the value.

| kind | measured L (m) | band (Hz) | walk / run stride (m) |
| --- | --- | --- | --- |
| broadhead | 5.3 | 0.68 - 2.03 | 1.75 / 4.55 |
| grazer | 3.8 | 0.81 - 2.42 | 1.75 / 4.25 |
| ravager | 6.0 | 0.64 - 1.91 | 2.35 / 5.30 |
| snapmaw | 7.9 | 0.56 - 1.67 | 1.95 / 4.85 |
| shellwalker | 7.8 | 0.56 - 1.68 | 2.05 / 3.85 |
| corruptor | 10.4 | 0.49 - 1.46 | 2.35 / 3.75 |
| stormbird (grounded) | 18.5 | 0.36 - 1.09 | 4.60 / 8.90 |

The Stormbird reports no walking feet while it can still fly (`flyCruise > 0`),
which is the Glinthawk's exemption applied through the doctrine's own grounding
rule rather than through a gate opt-out — see `stormbird.js` `debugFeet()`.

## 8. Known gaps

Current as of residue fix round 2 (§12); the history of each is in §9-§12.

* `A47c-corpse-mass` is red on two species: **Snapmaw 0.95-1.05** (median
  1.01) and **Corruptor 0.74-0.83** (median 0.77), bar 0.75; the Stormbird
  sits at the bar (0.70-0.75, over it in 1 of 5). The cause this section used
  to give — "both rest their bellies on the soil alive, so the wreck is as low
  as the living body" — was wrong: the wrecks sat 0.13-0.20 m ABOVE the
  living bodies, from four causes measured and fixed in §12.3. What is left
  is the Snapmaw's reference pose (it BASKS, belly on the soil, by canon) and
  the Corruptor's tail root skinned to its abdomen. A sprawler ruling is
  requested (§12.3).
* `A47-corpse-grounded` 4 of 5 at load 22-33: the Thunderjaw where its slide
  ends on ground whose two gate references differ by > 0.3 m (a pair 0.53 m
  wide against a 0.50 m shared window), and machine-rig's Glinthawk (§12.2).
* `A48-cadence` is flaky (3 of 5 on the final code): patrol waits inside the
  5-s wall window (machine-ai), a flyer's takeoff read from the last sample
  (machine-rig's gate), and an escorting Ravager whose touchdowns run out of
  reach (half fixed, §12.4). Walking cadence is 1.29-1.54x the floor.
* `A50b-aim-on-drawn-geometry` reads 94 % on the Watcher and Redeye in some
  runs: core-platform's screen-size cull hides their small eye / head-frill
  meshes at the gate's range while the hit hulls built from them stay live
  (§11.14).
* `A44-socket-integrity` has read the Longleg's `dead:head` at 0.13-0.15
  under full-suite load (0.000 in isolation).
* The Watcher's eye and antenna parts are not folded (they draw themselves)
  and cost two geometries per living Watcher.

---

## 9. Fix round 2 — the six findings, and what closed each one

### 9.1 Cadence-ceiling hard clamp in `watcher.js` / `longleg.js` (major)

The `Math.min(0.98, 0.88 * cadCeilK(loop))` wrapper is gone from both files
(`watcher.js` ~517, `longleg.js` ~687). Both now use the plain
`0.88 * cadCeilK(loop)` form `gait.js` uses, both call `loop.noteCeil(raw > hi)`,
and `A48b-cadence-headroom-expansion` was widened to read `machine._cadLoop` as
well as `gait.cadLoop` — the two clip-driven species were invisible to it, which
is how a cap keyed to the gate's own bar could sit in those files for a round
reading green. Measured after: `watcher 673 moving frames / 0 ceiling-bound`,
`longleg 633 / 0`, `redeye 673 / 0`, `stormbird 673 / 0`.

Removing the cap immediately exposed what it had been hiding, which is the point
of removing it. Probed on a charging Longleg: `observedPlants` delta **0** for
ten consecutive half-second samples at 4.0 m/s, `rateHz` 0.00, `debt` pinned,
`trim` at its ceiling and the commanded rate at **4.5 Hz** against a 2.86 Hz
band top — commanding faster was publishing fewer footfalls. `cadCeilK` now
carries an **anti-windup** term (`CadenceLoop.stallT`, `CEIL_STALL = 0.9 s`): a
loop that has commanded a walk for nearly a second and been handed no plant at
all has a dead sensor, and gets the plain band ceiling. It is keyed to the
loop's own telemetry, never to a gate's bar, and is strictly tighter than the
form it replaces.

### 9.2 `Stormbird.debugFeet()` defined twice (blocker)

The stale second definition (the pre-fix `flyCruise`-keyed body that was silently
winning) is deleted. The surviving method is keyed on `_airborne` — where the
machine **is** — instead of `flyCruise`, which is what it is *capable* of, so a
perched Stormbird reports its feet and `A45`/`A46`/`A48` grade its strut like any
other walker's. What makes that safe is a behaviour change rather than a report
change: `GROUND_DWELL = 16 s` commits a landed bird to the ground for longer than
the five-second window those gates measure, so a sample that opens grounded
closes grounded. Its cadence floor was raised (`cadFloorK: 1.45`) after the first
honest measurement of it came in at 0.30 Hz against a 0.36 Hz band floor.

### 9.3 V26b — no countable nacelles, wings are flat planks (blocker)

Reproduced on my own frame before touching anything (`shots/mx-r2-sb-before.png`)
and fixed at three separate causes:

1. **The wing was three disjoint rectangles** — axis-aligned `box` panels at
   y 3.21 / 4.00 / 4.72 with air between them. Every panel is now a `seg` from
   knot to knot, so one continuous swept surface carries the sweep and dihedral.
2. **The nacelles were 0.55 m across.** `prim0`'s `cyl` is
   `CylinderGeometry(0.5, 0.5, 1).scale(s)` — `s[0]` is the **diameter** — so
   they were 0.28 m-radius tubes half-buried in a 3.4 m-chord plank. They are
   0.92–1.30 m across, hung 0.30 m clear **below** the wing on visible pylons,
   with a bright intake lip and an emissive exhaust.
3. **There was no keel.** The body is a 4.55 m keeled fuselage with a breast
   block, a keel plate and a deep fin.

The dihedral is 28°, and that number is measured: `V26b` re-centres each machine
on the camera, so the lens sits at wing height and a near-horizontal wing films
edge-on — the first rebuild filmed as a spar with three pods and no wing
(`shots/mx-r2-v26b.png`). The root was also moved 0.7 m outboard, 0.6 m back and
0.45 m shorter in chord after `shots/mx-r2-v26b2-head.png` showed the machine
hiding its own head behind its near wing. Final frames:
`shots/mx-r2-v26b4.png`, crop `shots/mx-r2-v26b4-sb.png`.

### 9.4 Plate and hide 3 % apart in the graded frame (major)

Reproduced with a method that leaves nothing to argue: the Broadhead is staged
alone through `V26a`'s own `stageCast`/`repairCast` and filmed three times —
machine hidden, **shell** hidden, **donor** hidden — and each frame differenced
against the background so only drawn machine pixels are averaged.

| | hide luminance | plate luminance | separation |
|---|---|---|---|
| before | 101.3 (119, 99, 76) | 155.4 (171, 153, 131) | **1.53x** |
| after  | 64.3 (78, 62, 47)   | 157.2 (172, 155, 134) | **2.44x** |

Both surfaces came out **warm**, which is the tell: they were reflecting the
same key. The miss was never the albedo — `shellMaterials` builds the plate at
`metalness: 1` and `styleMachine` was forcing every donor to `metalness >= 0.55`,
so a 0.44-against-0.84 albedo gap was swamped by a specular term they shared. An
`underbody` donor is now **matte** (0.10 / 0.90) as well as darker
(`UNDER_CHASSIS` 0x68727d -> 0x4a5158), and the `if (m.map)` branch tints rather
than whitening, which is the bypass the judge named. Gate
`V26c-plate-contrast-expansion` now measures exactly this in-engine every run
(`gl.readPixels` on three renders of the staged frame) and fails under 1.9x:
**broadhead 2.91x, grazer 5.00x, snapmaw 5.16x**.

The missing back line was the second half. `spinePieces()` *was* being called on
both species — which is why nothing showed: it draws along the rig spec's spine
joints, and on these donors those are the animal's own spine at y 1.38–1.42
while the **drawn back** measures y 1.95–2.00 (sampled off the donor's position
buffer at half-metre z slices). A 0.5 m plate centred inside a 1.1 m animal is
invisible by construction. `backPlates()` authors the line against the measured
surface instead, and the one flat flank slab ("a billboard standing 0.04 m proud
of the hide") is three fitted lens plates placed off the measured per-slice
half-width.

### 9.5 `A47c-corpse-mass` red on 7 of 8, wrecks floating (major)

Diagnosed by bucketing a dead wreck's posed vertices by dominant bone. The
Corruptor's `rig_head` carries **514 samples spanning 2.58 m** — the scorpion's
claw arms bind to that chain, not a skull — so `rig.headReach` (a *spec*
distance, neck joint to head tip) under-reported the real rotation radius by 3x
and the "budget" let a 3.4 m limb swing **1.74 m underground**, whereupon
`CorpseGrounder` lifted the entire machine to put it back on the soil.

Three changes, all measured:

* `GaitController._chainReach()` measures the real radius — the farthest vertex
  a chain owns, from the chain root's origin, sampled once per machine in the
  rest pose and cached. Corruptor: head chain **4.00 m**, tail chain 3.27 m.
* For `sprawl` the whole **forward** chain is one envelope (`fwdBudget`): capping
  neck and head alone was not enough, because the claws hang off a chain the
  spine loop was pitching 0.17 rad and the pelvis drop was lowering 0.40 m on
  top of that. Nothing was individually wrong and the sum was 1.74 m.
* `sprawl` legs splay flat (0.12 -> 1.15) and the chassis may now **descend**
  past the authored drop (`_chassisFloor`), because it is the one class whose
  lowest surface is its own chassis. The tail is laid down about the machine's
  world lateral axis to its own measured budget instead of a nominal 0.10 rad
  that did nothing to an arch.

The envelope clamp is deliberately **`sprawl`-only**: applied to every class it
made the quadrupeds worse (broadhead 1.16 -> 1.31, grazer 1.06 -> 1.11), because
a Broadhead's measured head chain includes its horns and the shorter droop left
its head higher. A horn tip a few centimetres into the soil is inside the
-0.10 m budget `A47`/`A47b` grade; a 3.4 m claw 1.7 m under is what floats a
wreck.

`A47c` dead/alive median, judge's baseline vs two runs of this build:

| species | judge | run 1 | run 2 |
|---|---|---|---|
| corruptor | 3.55 | 2.47 | 2.28 |
| snapmaw | 1.99 | 1.63 | 1.45 |
| shellwalker | 1.85 | 1.10 | 1.06 |
| broadhead | 1.16 | 1.21 | 1.04 |
| stormbird | 1.11 | 0.93 | 0.91 |
| grazer | 1.06 | 1.08 | 0.90 |
| redeye | 0.84 | 0.84 | **0.75** |
| ravager | 0.46 | **0.44** | **0.42** |

`A47-corpse-grounded` stays green on all 17 species (worst penetration/float
0.15 m against a 0.10/0.40 budget). The gate is still red and §8's statement
stands for the Corruptor: a machine whose ALIVE median is 0.73 m needs a dead
median of 0.55 m, i.e. a wreck flatter than its own 0.86 m hull is thick.

### 9.6 Shadow-caster range cut from 2.15 to 1.65 body heights (major)

Reverted, and replaced with something strictly better than the 2.15 it reverts
to. `updateRigLOD` now uses two rings:

* **near** `max(H * 2.15, 12 m)` — every caster on the machine casts. A Watcher
  keeps its full shadow to 12 m instead of 3.5; a Thunderjaw to 20.
* **far** `max(H * 6, 40 m)` — only the **prime** caster (the largest drawn mesh,
  resolved once and cached as `machine._shadowPrime`) casts, so a machine still
  reads as standing on the ground for one draw instead of five to nine.

Nothing loses a shadow it had under 2.15, and beyond the near ring this is
cheaper than 2.15 was. `PART_TRIM_TIER` is back to 2 for the same reason: at
tier 1 a Broadhead's canisters retired at 9.7 m, which is the range a player
lines a tear arrow up at.

---

## 10. Fix round 3 (residue) — the seven findings, one by one

Every number below was measured on this tree at port 5207. No gate bar was
moved, no tolerance was added, and no gate file was edited.

### 10.1 `A48b-cadence-headroom-expansion`: `cadFloorK` inverted the Stormbird's own cadence window — CLOSED, 5/5

**Reproduced before touching anything.** A page-context probe over every gaited
species (`shots/mx-r3-probe1.png`) printed `bandLo / bandHi / cadFloor / cadCeil`
for all fifteen. Exactly one is inverted:

| species | body L (m) | `band.floor` | `cadFloorK` | `cadFloor` | `cadCeil` | inverted |
| --- | --- | --- | --- | --- | --- | --- |
| **stormbird** | 15.58 | 0.559 | **1.45** | **0.811** | **0.714** | **YES** |
| sawtooth | 4.46 | 1.045 | 1 | 1.045 | 1.334 | no |
| corruptor | 9.02 | 0.735 | 1 | 0.735 | 0.938 | no |
| thunderjaw | 14.43 | 0.581 | 1 | 0.581 | 0.742 | no |
| *(11 others)* | | | 1 | | | no |

`THREE.MathUtils.clamp(v, min, max)` is `max(min, min(max, v))`, so an inverted
pair does not throw — it silently returns the MINIMUM. The Stormbird was
therefore commanded at 0.811 Hz, a set point its own band forbids it to
deliver; the loop could never retire the debt, `trim` wound to `TRIM_HI`, and
`raw > 0.88 * bandHi` on essentially every moving frame. Measured: **0.90**
(597 ceiling-bound of 663 moving frames) against a 0.25 bar.

**Fix, part 1** — the invariant is asserted where the window is built
(`gait.js`, `this.cadFloor`): `band.floor * cadFloorK` is clamped to `cadCeil`
and the species' request is kept on the object as `cadFloorWanted` so the clamp
is visible rather than silent. Measured after: **0.90 → 0.276.** Better, still
red.

**Fix, part 2** — the remaining 0.276 was a SECOND floor on the same clamp.
`const floor = max(cadFloor, engaged ? hz * ENGAGED_CADENCE_FLOOR : 0)` and
`hz` is `CADENCE_RUN / sizeK`, a different law from `cadCeil = 0.60 * bandHi`.
The first is above the second for **every** species on the roster:

| species | engaged run floor `hzRun * 0.85` | `cadCeil` |
| --- | --- | --- |
| stormbird | 0.851 | 0.714 |
| sawtooth | 1.591 | 1.334 |
| thunderjaw | 0.884 | 0.742 |
| broadhead | 1.647 | 1.381 |

So the floor that is applied is now capped by the ceiling that is applied. Both
halves can only ever LOWER a commanded cadence, so nothing that was inside its
band can be pushed out by them — and the two species that were sitting on the
band's upper edge moved back toward the middle (ravager 1.79 of a 1.88 top).

**Result — `A48b` run 5x in isolation, all PASS:**

| run | stormbird | redeye | longleg | watcher | thunderjaw | behemoth | grazer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **0.000** | 0.031 | 0.006 | 0 | 0 | 0 | 0 |
| 2 | **0.000** | 0.032 | 0.000 | 0 | 0 | 0 | 0 |
| 3 | **0.000** | 0.008 | 0.001 | 0 | 0 | 0 | 0 |
| 4 | **0.000** | 0.045 | 0.000 | 0 | 0 | 0 | 0 |
| 5 | **0.000** | 0.027 | 0.005 | 0 | 0 | 0 | 0 |

`A48-cadence` after the change: 15 species measured, 0 offenders, stormbird
0.70 Hz inside a [0.37, 1.10] band (it also now reports feet, i.e. it was
genuinely grounded and strutting).

### 10.2 The two-ring shadow rule was inert — CLOSED at the rule, with a NEW finding behind it

**Reproduced with a probe that stages every species 3.3-5.5 m from the lens,
i.e. deep inside the 12 m near ring** (`shots/mx-r3-probe2.png`):

| species | `_shadowCasters` | `_shadowPrime` | any DRAWN mesh casting |
| --- | --- | --- | --- |
| snapmaw, ravager, corruptor, strider | **0 entries** | null | yes, by accident |
| shellwalker, sawtooth | 1, and it is **`visible: false`** | hidden donor | **NO** |
| broadhead, grazer, stormbird, redeye, watcher | 1-2, visible | ok | yes |

Two causes, both named by the judge and both real:

1. **The caster set was taken from `machine.model`.** `buildShell` parents a
   shell piece under `machine.model` *or under the bone that owns it*
   (`rig/shells.js`, the `b.bone` branch), so on a bone-parented shell the whole
   drawn machine is invisible to a `model` traversal and the set came back
   empty. And on a `hideSculpt` species the largest thing under `model` is the
   RETIRED donor, so `alwaysLargest` handed the machine's entire shadow to a
   mesh that is not drawn.
2. **The block sat behind `updateRigLOD`'s tier early-out.** The rings are
   metres (12 m / 40 m); the tiers are body heights (6 H / 14 H / 40 H). For
   every machine shorter than 5.6 m the near ring falls INSIDE tier 1, so a
   player can walk a machine's whole shadow range without the tier ever
   changing.

**Fix.** `machineShadowPolicy` now ranks the DRAWN machine (`machine.root`,
skipping retired sculpt, FX and component meshes) and publishes
`_shadowCasters` / `_shadowPrime` itself, so the policy and the rings can never
disagree; `invalidateShadowCasters()` is called from `buildShell` and
`hideSculpt` as well as from `foldMachineMeshes`, which is what catches the
Redeye's shell (built after `super()` has already folded the Watcher); and
`applyShadowRings()` runs BEFORE the tier early-out, every frame, at a cost of
two compares and — only when the ring state changes — one property write per
caster. **The 2.15 near ring is untouched and stays untouched.**

Writes go through `setCaster()`, which respects `engine.js`'s own caster-budget
protocol (`userData.__shadowCulled` / `__shadowBase`) instead of writing
`castShadow` into a field the engine is about to overwrite from a stale stash.

**Result, all 17 species, three distances** (`shots/mx-r3-probe3.png`):

| ring | distance | drawn casters | a hidden mesh ever picked |
| --- | --- | --- | --- |
| near (state 2) | 2.5-5.5 m | **>= 1 on all 17** | **0 on all 17** |
| far (state 1) | ~16 m | 1 (the prime) on all 17 | 0 |
| out (state 0) | ~58 m | 0 | 0 |

`_shadowPrime` is a VISIBLE mesh on all 17 (it was a hidden donor on 2).
`A21-real-draw-calls` moved the right way with it: staged-fight machine shadow
draws 0 -> 3 and the frozen total 391 -> 379, because the engine's caster pool
was already saturated so the machines displace props rather than add to them.

**NEW FINDING, owner `core-platform` (`src/core/engine.js`, not this lane's
file).** The rule is correct and a machine at 9 m still casts nothing.
Measured with four machines pinned 9.3-10.4 m from the lens
(`shots/mx-r3-shadow-close3.png`, and the frame shows no ground shadow under
any of them):

```
sawtooth  dist 9.4  ring 2  prime shell-hard  visible true
          castShadow false   __shadowCulled true   __shadowBase true
grazer    dist 9.3  ring 2  ... identical
snapmaw   dist 10.4 ring 2  ... identical
engine.activeShadowCasters = 110  (saturated)
```

`__shadowBase: true` is this lane's rule saying "cast"; `__shadowCulled: true`
is the engine's global budget vetoing it. `_cullShadows` ranks by
`max(0, dist - radius)` and truncates at `shadowCasterBudget / cascades`, and
its own comment records that "ties are common because `dist - radius` clamps to
0 for anything the camera is standing inside" — so terrain, grass chunks and
camp structures fill all 110 slots at rank 0 and a 2 m machine at 9.4 m, which
ranks at 6.2, never gets one. No change in this lane can reach that.

### 10.3 `A47c-corpse-mass` — NOT CLOSED, and the two offered levers are now measured to be wrong

The mechanism is attributed per BONE for the first time. Each wreck's posed
vertices bucketed by dominant bone (`shots/mx-r3-probeB.png`): the DEEPEST
bucket is always a forward-chain bucket whose lowest vertex is on the soil while
its own median is 1.2-2.6 m up.

| species | deepest bucket | its min | its median | wreck median | grounder lift |
| --- | --- | --- | --- | --- | --- |
| broadhead | `shell-hard::rig_head` | 0.07 | 1.22 | 1.50 | 0.787 |
| grazer | `shell-hard::rig_neck` | 0.04 | 1.26 | 1.60 | 0.857 |
| shellwalker | `shell-hard::rig_head` | 0.11 | 1.42 | 1.50 | 0.691 |
| corruptor | `Geo_Scorpion::rig_head` | 0.13 | 1.46 | 1.80 | 1.275 |
| snapmaw | `BlackCaiman_mesh::rig_chest` | 0.02 | 0.43 | 0.84 | 0.641 |
| redeye | `Object_11-x9::R_HeadPlate_helper_029` | 0.04 | 0.41 | 1.49 | — |

i.e. **the wreck is standing on its own snout**, and `CorpseGrounder`'s lift is
exactly the penetration the pose authored, applied to the whole machine.

**The "raise the snout" lever was BUILT, MEASURED and REMOVED.** A closed loop
(`_settleFwd`) that took the forward droop back until the deepest posed vertex
cleared the soil:

| species | before | with the loop | verdict |
| --- | --- | --- | --- |
| redeye | 0.90 | **0.71** | closed |
| tallneck | 0.84 | **0.65** | closed |
| longleg | 0.53 | **0.26** | improved |
| corruptor | 2.47 | 2.21 | still red |
| snapmaw | 1.70 | 1.50 | still red |
| **behemoth** | **0.68** | **0.91** | **REGRESSED** |
| **thunderjaw** (`A47b` float) | 0.15 budget 0.40 | **1.27-1.50 m** | **REGRESSED, green gate turned red** |
| **longleg** (`A47` float) | green | **0.50 m** | **REGRESSED** |

Re-cast as a hill-climb on the gate's own quantity — posed median plus the lift
the pose is about to earn — it correctly declined every step on all six target
species and returned the shipped numbers (broadhead 1.20, corruptor 2.47,
shellwalker 1.08, grazer 1.08). So it was removed rather than shipped inert, and
the tree is bit-for-bit the pose that was there before.

The reason is geometric and it is the same reason §9.5's clamp failed: **raising
the head does not lower the body, it only changes WHICH vertex is lowest.** The
grounder parks the wreck on whatever that turns out to be, so a metre of snout
droop is replaced by a knee at the same height. What closes this gate is making
the BULK the lowest surface — per-species shell geometry (a chassis that
flattens, a plate that folds, a limb that separates) — which is what §8 said and
what this round's evidence now says with the bone named. The measurement table
above is the hand-off.

### 10.4 `A21-real-draw-calls` — NOT CLOSED; improved 403 -> 398, and the machine term is all tear targets

Measured on this box, staged-fight, applied DPR 1.5 / DPR 2, deterministic
counter:

| | baseline | after this round |
| --- | --- | --- |
| staged-fight draw calls (DPR 2) | 403 | **398** |
| frozen composition | 391 | **379** |
| machines, main pass | 81 | **79** |
| machines, shadow pass | **0** | **3** |
| over budget (350) | 53 | **48** |

The frame's full ledger, staged-fight: main `machines 79, props 44,
vegetation 43, other 22, player 16, terrainSky 13, unnamedRoots 9`; shadow
`props 48, vegetation 33, other 23, player 15, terrainSky 9, machines 3`;
post 22. Machines are **79 of 379**.

**Why the machine term cannot fall much further without a fidelity cut.** The
staged cast is eight machines at 9-17 m. Enumerated draw by draw
(`shots/mx-r3-probeC.png`): 56 machine draws for the cast, of which **38 are
component meshes** — thunderjaw 13, sawtooth 7, behemoth 5, longleg 5, scrapper
3, watcher 2, strider 2, glinthawk 1. Every one of those components was then
checked against its own table (`shots/mx-r3-probeD.png`): **all of them have a
`tearHp` and a loot row.** They are the things the player shoots off. Retiring
them at 9-17 m is exactly the regression the judge reverted when
`PART_TRIM_TIER` was dropped to 1 ("a Broadhead's canisters retired at 9.7 m,
which is the range a player lines a tear arrow up at").

They also cannot be batched: each component carries its own
`MeshStandardMaterial` whose emissive intensity is randomised per instance
(thunderjaw alone: 16 drawn meshes, **11 distinct material signatures**), and
`mergeByMaterial` keys on `material.uuid`. The gate's own `batchCeiling` agrees:
a perfect BatchedMesh pass saves 65 draws world-wide, and the deficit is 48 in
one frame.

Closing A21 therefore needs the other buckets — props 44+48, vegetation 43+33,
player 16+15, other 22+23, unnamedRoots 9 — or a per-species art pass that
reduces component COUNT. Neither is this lane's to do inside a residue round.

### 10.5 `A48-cadence` flaky on the Longleg — NOT CLOSED, and every value that fixes it breaks `A48b`

The Longleg has no `GaitController` (`longleg.js` drives its own clip rate), so
nothing in §10.1 can reach it: its command floor is the single line
`band.lo * 1.38`, and 1.38 was sized against an assumed 0.9 delivery ratio.

**The ratio is measured now.** Six consecutive `A48-cadence` runs on one build,
one box, nothing changed between them — delivered Hz over the floor that line
commands:

| run | band floor | commanded floor (1.38x) | delivered | ratio |
| --- | --- | --- | --- | --- |
| 1 | 0.98 | 1.35 | 1.60 | 1.18 |
| 2 | 0.86 | 1.19 | 1.79 | 1.50 |
| 3 | 0.92 | 1.27 | **0.80** | **0.63** |
| 4 | 0.98 | 1.35 | 1.69 | 1.25 |
| 5 | 0.96 | 1.32 | **0.79** | **0.60** |
| 6 | 0.98 | 1.35 | 1.99 | 1.47 |

The loss is not a constant 0.9 — it is **0.60 to 1.50**, and at 1.38 the two low
samples land at 0.87x and 0.82x the band FLOOR. That is the one-in-three failure,
and it is a 2.5x spread in the quantity a feed-forward coefficient is supposed to
cancel.

**Two fixes were built, measured, and both were reverted.**

1. **Coefficient 1.38 -> 1.95** (covers the worst sample with margin). Result:
   this species' `A48b-cadence-headroom-expansion` fraction went from **0.000 to
   0.582** — 455 ceiling-bound frames of 782. The reason is arithmetic: the
   floor and the ceiling are both multiples of `band.lo`, because `0.88 *
   band.hi` IS `2.64 * band.lo`. The ceiling binds whenever `floorCoef * trim >
   2.64` — a trim of 1.91 at 1.38, only 1.35 at 1.95.
2. **...plus `trimHi` 2.2 -> 1.35**, which closes that by construction
   (1.95 x 1.35 = 2.633 < 2.64) and did: `A48b` came back **3/3 PASS with every
   species at exactly 0.000, the Longleg included.** But it removed the
   integrator authority the floor raise had not replaced, and `A48` delivered
   **0.59 and 0.70 Hz** — worse than the flake it was meant to fix.

So the tree ships the shipped values. `git diff` on `longleg.js` is
comment-only. Trading a green gate for a red one is not a fix, and neither is a
coefficient that only works on a quiet box.

**What the numbers actually say, for whoever picks this up.** The delivery loss
is not a constant to be cancelled — it is a function of host load through
`wallPerSim`, which is why one coefficient cannot track it. The honest fix is on
the measurement side: `rig/contact.js`'s `latch` publishes the stance window a
consumer can SEE, and on this species that window falls between drawn frames.
Make the published window survive a slow frame (hold the plant until a consumer
has observed it, which the ledger already does for the gait path) and the
compensation factor stops being needed at all. That is a change to the
clip-driven contact path, not to a number in this file.

**And `A48` is flaky well beyond the Longleg.** The same six runs, every
offender:

| run | offenders | detail |
| --- | --- | --- |
| 1 | thunderjaw | 1.20 against a [0.39, 1.17] band — OVER |
| 2 | — | clean |
| 3 | longleg | 0.80 against [0.92, 2.75] |
| 4 | stormbird | 0.00 — no plants published in the window at all |
| 5 | longleg | 0.79 against [0.96, 2.88] |
| 6 | ravager | 0.55 against [0.68, 2.04] |

Four different species in six runs, in both directions, on a box running three
other lanes' suites at load average 4-9. The ravager's delivered cadence spans
**0.55 to 2.79 Hz** across this round while nothing about its command changed by
more than 16 %. A 5x spread is not a command problem: `A48` measures footfalls
per WALL second and `wallPerSim` is a host-load term, which the file's own
60-line note says.

### 10.6 `A90-rig-reclaim` — the held geometry is NAMED; it is not a leak

The memory lane's question was: "what allocates exactly 4 geometries and never
releases them? Four is the count to grep for."

**Answer, by registration census.** A geometry is registered with the GL backend
exactly while it carries `WebGLGeometries`' own `dispose` listener — which is
readable by traversal, with no hooking, and is the same event that moves
`renderer.info.memory.geometries`. Running the gate's warm phase, its 30 cycles
and then its 8-Watcher hold/release bracket six times on one page
(`shots/mx-r3-probe9.png`):

| iter | raw geo for 8 | what registered | survivors |
| --- | --- | --- | --- |
| 0 | 0 | — | 0 |
| 1 | 2 | `part`/Mesh v328, `part`/Mesh v155 | 0 |
| 2 | 4 | the same two, x2 machines | 0 |
| 3 | **8** | the same two, x4 machines | 0 |
| 4 | 4 | the same two, x2 machines | 0 |
| 5 | 2 | the same two, x1 machine | 0 |

and, on the iteration that reproduced the failing fingerprint exactly
(`perLiveGeo 1.13`, `heldThenReleased 4`), the four survivors are:

```
Eye001_Eye_texture_0                       344 v   rigPooled
Eye_Lense_1001_Glass_Lense_0                20 v   rigPooled
Eye_Camera001_Lense_-_Blue_Cameras_0        20 v   rigPooled
Headplate_Frill_001_Headplate_Frill__0-x4 2136 v   rigPooled
```

**All four are SPECIES-POOLED** (`rig/lod.js` `_geoPool`), so their `dispose()`
is a deliberate no-op and retaining them is the design, not a leak — which is
why `heldThenReleased` reads 4 and why it is 4 to the digit on every failing
run. The variable term is different geometry: the per-machine `part-eye` and
`part-antenna` component meshes (328 and 155 vertices), which **survivors = 0**
proves are released every time.

Two build fixes landed against it, both real improvements rather than
measurement changes:

* **The LOD tier is resolved at fold time** (`foldMachineMeshes`), before the
  machine can be rendered. `attachRigRuntime` left `_lodTier = -1` and nothing
  applied a tier until the first `animate()`, but a machine spawned mid-frame
  can be DRAWN before that update runs — and on that one frame every component
  is still visible. Two GL geometry registrations per machine the player at
  49 m cannot see.
* **The frill ranking is now a property of the species, not of the size cull.**
  `trimSet()` excluded any mesh with `visible === false` and no `lodHidden`
  flag — but `engine.js`'s screen-space cull sets exactly that, at about 10 Hz,
  so the list length (and therefore which third of the frills
  `KEEP_BY_TIER[tier]` keeps) depended on when the list was first built. That is
  the mechanism by which a later Watcher draws a pooled frill an earlier one had
  dropped. `__sizeCulled` is now excluded from the test.

**Result — `A90-rig-reclaim` run 6x in isolation after the two fixes, all PASS,
and the fingerprint is gone:**

| run | `perLiveGeo` (bar 1.0) | `perLiveTex` | `heldThenReleased.geo` | `afterCycles.geo` (bar 40) |
| --- | --- | --- | --- | --- |
| 1 | 0.75 | 0.38 | **0** | 1 |
| 2 | 0.50 | 0.38 | **0** | 6 |
| 3 | 0.38 | 0.38 | **0** | 5 |
| 4 | 0.50 | 0.38 | **0** | 5 |
| 5 | 0.50 | 0.50 | **0** | 1 |
| 6 | 0.38 | 0.38 | **0** | 1 |

Before: 1 / 2 / 4 / 6 / 9 / 9 raw for 8 machines, `heldThenReleased` 4 on every
failure and 0 otherwise. After: `heldThenReleased` is **0 on all six** — the
pooled frills are registered by the first Watcher of the session and never
again inside anyone's measurement window — and the per-live term is 3-6 raw,
i.e. the per-machine component meshes alone, every one of which is released.

### 10.7 The 0.98 cadence-rate clamp — CONFIRMED GONE

`grep -n "0\.98" src/entities/machines/{watcher,longleg,gait}.js` returns only
prose: `watcher.js:527` and `longleg.js:678` are the comments recording the
removal, `longleg.js:41`/`:693`/`:833` are unrelated measurements (a 0.987 m
socket gap, a 1.38 x 0.9 ratio), `gait.js:364`/`:843`/`:850` are the same
history, and `gait.js:1131`/`:1288` are `(l1 + l2) * 0.985`, the IK reach
margin. Both files use the plain `band.hi * wps * 0.88 * cadCeilK(loop)` form
and both call `loop.noteCeil(raw > hi)`. `A48b` grades both paths and read
watcher 0 / longleg 0.000-0.006 on five consecutive runs.

### 10.8 `V26a` / `V26b` / `V27a` / `V27b` re-shot and READ against `casting-v4.md`

All four were re-shot on this build and read frame by frame, with crops where
the full frame is not decisive. `V26c-plate-contrast-expansion` re-measured
in-engine at the same time and PASSES: broadhead hide 45.3 / plate 131.9 =
**2.91x**, grazer and snapmaw above it, against a 1.9x bar.

**`V26a` (broadhead, grazer, ravager, snapmaw, redeye).**

* **BROADHEAD** — wide horns that sweep out past the body and curve forward and
  up: present. Dorsal plate rail, orange canisters, pale plate over a dark
  hide: present, with real value separation. **Reads.**
* **GRAZER** — flat rotor blades around an antler hub: present and countable.
  Two dorsal canister rows: present. Taller-headed quadruped: yes. **Reads.**
* **RAVAGER** — read on the crop, not the full frame, and the crop changed the
  verdict: the cannon rail is clearly on the back (two pale rails above the
  spine), the head sits level with the dorsal rail at the shoulder rather than
  below the back line, the sensor is lit, and the plate/underbody separation is
  real (cream plate, brown inner surfaces). **Marginal pass** — the body and
  legs are chunky enough that it reads as a heavy predator rather than
  specifically as a cat.
* **SNAPMAW** — long low sprawl, a countable pale scute ridge down spine and
  tail, cyan eye, plate over dark hide: all present on the crop. The knees
  outboard of the hips are NOT readable — no leg is visible in this pose at
  all. And **it is staged as a speck**: measured off the frame with a chroma
  mask, the Snapmaw occupies x[989..1220] and **6.6 % of the frame height**
  (6 305 machine pixels), against this lane's own 12 % speck rule. A long, low
  body defeats the fit `repairCast` uses. **FAIL on staging**, and the same
  machine is smaller still in `V27a`.
* **REDEYE** — Watcher body: yes (the donor is literally `Redeye_Watcher_-_Pose`,
  a tall biped with reverse-jointed legs). RED sensor: yes, unmistakable.
  **FAILS the material criterion**: the machine is uniformly dark brown-black
  with no white-grey plate anywhere, and the body reads as a tangle of small
  panels rather than assembled armour. The cause is measurable — its authored
  shell's prime mesh has a 0.44 m bounding radius against the donor's 2.66 m
  (`shots/mx-r3-probe3.png`), so the donor is 6x the shell and sets the colour.
  `V26c` does not cover it because it grades only the three donor-KEEPING
  species with an `underbody` ramp.

**`V26b` (shell-walker, stormbird, corruptor).**

* **SHELL-WALKER** — six legs countable, two arm-claws held clear of the ground,
  flat cargo platform with a canister over a boxy carapace. **Reads.**
* **STORMBIRD** — wings swept up and back, **three engine nacelles countable**
  along the near wing, keeled body, tail fan. **Reads** — this is the §9.3
  rebuild holding up.
* **CORRUPTOR** — matte black and visibly darker than the other two, tail arched
  up over the back. **Reads**, though the forward claw arms and the glowing core
  are not separable at the staged size.

**`V27a` (broadhead, grazer, ravager, snapmaw).** Limb work is present in three
of four, which is what the criteria ask: the Broadhead drops its head and horns
forward and down with the forelegs gathered; the Grazer rears its antlers back
and up off braced hind legs; the Ravager coils into a coiled crouch with a lit
chest cannon. The **SNAPMAW is again a speck** and its pose cannot be read at
all, which the criteria call a FAIL in their own words ("a machine rendered as a
speck is a FAIL, not an absence").

**`V27b` (shell-walker, stormbird, corruptor).** Limb work in all three: the
Shell-Walker draws both arm-claws up and forward over a gathered stance, the
Stormbird sweeps its wings, the Corruptor coils its tail over its back and
throws a claw out. **Passes** its "at least two of three" bar.

**Two visual findings survive this round and are recorded rather than fixed**,
because both are per-species art and neither is one of the seven residue
findings: the Snapmaw's staging size in `V26a`/`V27a`, and the Redeye's missing
plate-over-dark read.

### 10.9 The named must-not-regress gates, measured at their CODED bars

Run at the end of the round on port 5207, one command, no bar touched:

| gate | verdict | the numbers | bar |
| --- | --- | --- | --- |
| `A90-memory-stability` | **PASS** | geo **+34**, tex **-19**, heap **-6.4 %**, objects **-619** | geo <= 40, tex <= 30 |
| `A90-memory-stability-expansion` | **PASS** | objects **-431**, nonMachine **0**, geo +21, tex -18, heap -3.3 %, `overBudget: false` | population ceiling |
| `A90-rig-reclaim` | **PASS** | afterCycles **0 / 0**, perLive **0.50 / 0.50**, held **0** | 40 / 30 / 1.0 / 1.0 |
| `A9-perf-budget` | FAIL | drawCalls **361** (fps term unattributable, null-frame 49.9 fps) | 350 |
| `A21-real-draw-calls` | FAIL | staged-fight **400** (frozen 380; machines 81 main + 3 shadow) | 350 |

The three A90 gates were the ones this round was told not to regress and all
three are green; the two draw-call gates were red before this round and are red
after it, 3 calls and 5 calls better respectively than the baseline this lane
measured on the same box (403 / 366).

Every runtime object this round added has a dispose path: the caster ranking's
scratch array (`machine._casterScratch`) and its cached pick
(`machine._shadowPrime`) are released in `disposeRig` beside `_shadowCasters`,
the ranking allocates only on a REBUILD (construction, a fold, a shell added,
a retire) and never per frame, and `applyShadowRings` does two compares and at
most one property write per caster per frame with no allocation at all.

### 10.10 The full suite on 5207 — every FAIL, with an owner

`node tools/gates.mjs --port 5207`, one run, end of round:
**237 gates: 175 pass, 19 fail, 3 pending, 40 need judging.** The runner
reported `browser relaunched 1x during this run (shared-GPU contention)` and
left 0 of its own Chrome profiles on disk.

| gate | owner | this lane's reading |
| --- | --- | --- |
| `A21-real-draw-calls` | core-platform | shared; §10.4. 400 of 350 staged-fight, machines 81 of 380 |
| `A44-socket-integrity` | machine-rig (this lane) | **load flake** — one point of 48 (`longleg dead:head` 0.148). Re-run twice in isolation: worst gap **0** and **0.07** against a 0.10 budget, PASS both |
| `A44b-socket-vertex-integrity` | machine-rig (this lane) | **pre-existing, reproducible.** worst 0.412 m on `ravager part:cannon`, then corruptor 0.328, snapmaw 0.125, tallneck 0.051. Identical 0.412 appears in a suite log from **15:48 today, before any edit in this round** — it is not a residue finding and was not touched |
| `A47b-corpse-posed` | machine-rig (this lane) | pre-existing: `thunderjaw` floats 0.89-1.70 m against a 0.40 budget, in every run this round including the untouched tree |
| `A47c-corpse-mass` | machine-rig (this lane) | §10.3, NOT closed; 9 offenders |
| `A48-cadence` | machine-rig (this lane) | §10.5, NOT closed; flaky across four different species in both directions |
| `A41c-sustained-variety` | machine-ai | PASSED at 420 s earlier in the same session on this tree; load flake |
| `A40-expansion`, `A41c-expansion` | machine-ai-expansion | not this lane |
| `A40-lost-contact` | machine-ai | not this lane |
| `A90b-memory-attribution` | memory-attribution | not this lane |
| `A23-aim-cost`, `A23b-hull-fidelity` | spatial | not this lane |
| `A5-arrow-fired-event`, `A51-nock-gap` | combat | not this lane |
| `A17-draw-beats` | animator | not this lane |
| `A73e-melee-traps` | audio | not this lane |
| `A81-canon-speed-bands` | core-platform-followup2 | not this lane |
| `A31b-no-ghost-without-occluder` | player-control | not this lane |
| `X-lost` | runner | a gate whose page was lost to the browser relaunch |

**A note on this box, because it decides how several of these read.** Three
other lanes were running their own suites on 5205 / 5206 / 5218 throughout, at
load average 4-9, and every lane's edits reload every other lane's dev server
(Vite watches the whole repo — this lane's log shows page reloads triggered by
`src/world/npc/npc.js`). Two of this round's runs died outright, one with
`ERR_CONNECTION_REFUSED` when the dev server was replaced underneath it. Gates
that measure wall-clock quantities (`A48`, `A9`, `A21`'s clock terms) are not
reproducible under that, which is why every number this lane claims as CLOSED
was re-run in isolation and is quoted as a run table rather than as a single
result.


---

## 11. Fix round 1 on the residue — the judges' ten findings, one by one

Measured at port 5207 on a box that three to five other lanes were loading
throughout (load average 7-35; each run's load is quoted where it matters).
No gate bar was moved and no tolerance was added. One gate was made STRICTER
(§11.2, the judge asked for it); one gate gained a species (§11.3, likewise).

### 11.1 `V27a` / `V26a`: the Snapmaw was a speck (blocker) — CLOSED

`repairCast` dealt every machine an EQUAL slot, and a slot is a width: the
Snapmaw's silhouette at the 3/4 yaw is 2.2x as wide as it is tall, so filling a
fifth of the frame's width made it 6.7 % of its height. The fit now gives each
machine the slot PITCH its own silhouette needs to stand `H_MIN` tall (0.28
NDC = 14 % of the frame, i.e. the 12 % speck bar plus margin) and shares what is
left among the others; nobody is shrunk below `H_MIN`. The fit and the report
both measure PROJECTED POSED VERTICES now, not the 8 corners of a world AABB
(which overstated the rotated Snapmaw's width by a quarter).

| batch A, post-repair | frame width | frame height |
| --- | --- | --- |
| broadhead | 13.8 % | 15.5 % |
| grazer | 15.8 % | 38.4 % |
| ravager | 15.8 % | 21.8 % |
| **snapmaw** | 30.8 % | **13.9 %** (was 6.7 %) |
| redeye | 13.8 % | 32.2 % |

Batch B: shell-walker 30.3 x 22.6 %, stormbird 31.3 x 32.6 %, corruptor
30.3 x 22.8 %. `V27a` re-shot: the Snapmaw reads at full size with its head
reared and jaws open (`shots/gates/V27a-attack-pose.png`), no speck banner.

### 11.2 `A44c-lineup-expansion` graded half its documented bar (major) — CLOSED

`w < 0.12 || h < 0.12` compared NDC extents (full frame = 2.0) against 0.12,
i.e. 6 % of the frame, while §6 and the gate's own comment say 12 %. It now
tests the fraction of the frame (`w / 2 < 0.12 || h / 2 < 0.12`) on the
projected posed vertices, reports every machine's frame fraction, and both
batches PASS at the real bar (numbers in §11.1). Before this round's fit, the
same corrected test would have failed the Snapmaw at 6.7 %.

### 11.3 `V26a`: the Redeye had no plate-over-dark read (blocker) — CLOSED

Two causes, both measured: the shell was three pieces with a 0.44 m bounding
radius against the donor's 2.66 m, and the donor came through `styleMachine`
at metalness 0.55 over a near-black albedo atlas (the texture dumped and read:
its "plates" are bronze specular, not white). Now:

* `REDEYE_SHELL` is a real armour set — a seven-plate crown ridge, a brow plate
  and swept cheek guards on the carapace front, two staggered rows of flank
  scales per side with a dark seam, thigh armour, eye-pod cheeks and chin, and
  the red dorsal strip — authored in body space on the bones that carry each
  part of the donor (measured per bone group and 0.4 m z-slice), and folded to
  ONE skinned draw (`foldMachineMeshes(this, { pool: 'redeye-shell' })`).
* `STYLE.redeye.underbody` puts the donor on the same matte dark underbody
  every other donor-keeping species uses.
* `V26c-plate-contrast-expansion` grades the Redeye now: **plate 117.9 / hide
  48.2 = 2.45x** (bar 1.9x) on the first measurement and **2.61x** on the final
  code; broadhead 2.95x, grazer 5.33x, snapmaw 5.97x.

### 11.4 `A21-real-draw-calls` (blocker) — drawCalls term CLOSED: 398 -> 344

The judge's recipe, plus the rest of what the machine term turned out to be:

1. **Component fold** (`rig/components.js`). Every component mesh stays in the
   scene graph as a PROXY — visible, raycastable, hull-bearing, LOD-trimmed,
   torn off as debris; everything that reads a part reads it unchanged — and
   only its material's `visible` is cleared, the one flag the renderer checks.
   The machine draws them all itself, with a per-vertex `cmpSlot` and a
   per-slot uniform: the proxy's CURRENT transform (bones, spring chains, the
   Ravager's aiming cannon, the Thunderjaw's elevating launchers and spinning
   radar fin all follow exactly) and its material's colour, emission x
   intensity, metalness and roughness (so the eye-state system, the canister
   pulse, frost and the death fade drive it unchanged). A torn, trimmed,
   size-culled or hidden component writes a zero matrix — the torn/hidden mask.
   On a machine with an authored SHELL the components ride the shell's own
   draw: the shell's buffer is swapped for a combined one only inside
   `renderer.render` (scene `onBeforeRender`/`onAfterRender`), so hulls, the
   corpse solve and every gate read the shell exactly as built and no hull ever
   grows over a component. A shell-less machine (Watcher, Strider) gets one
   separate component mesh (`raycast` own no-op, `noHull`, `noShadow`).
2. **Eye cores** (`Machine.addEye`'s unlit spheres, two per Sawtooth,
   Behemoth, Strider, Thunderjaw) fold as unlit slots.
3. **Donor tones**: flat, unmapped, non-emissive donor materials that differ
   only in albedo merge with their colour baked per vertex (the Broadhead's
   three underbody tones: 3 draws -> 1).
4. **Far link**: at >= 40 body heights, and only when the LARGEST folded
   component projects under 8 px at the machine's real distance, the component
   draw stops; the proxies keep their hulls, so a shot still tears.
5. **The Watcher's headlight quad** (`Object_13`, the 4.8 m emissive plane the
   Redeye already retired as floating slabs) is retired on every Watcher.
6. **Spark bursts** (`Machine._sparkBurst`, a `THREE.Points` + geometry +
   material per hit, 0-5 per frame in the staged fight) join the pooled hot
   pass, with the same launch velocities and a new per-particle gravity.

| | before | after |
| --- | --- | --- |
| staged-fight draw calls (graded, worse of DPR 1.5/2) | 398 | **344**, 339, 342 (budget 350) |
| staged-fight machine draws, main pass | 80 | **26** |
| spawn-vista | 335 | 318-322 |
| west-herd | 233 | 217 |
| `A9-perf-budget` drawCalls | 361 | **319** (callsOk true) |

`A21` itself reads PENDING, not PASS: its three clock terms are declared
unattributable by the gate on this box (null frame p95 18.9 ms, burst
instability 3.69x) — core-platform's instrument, not a machine term. Shadow
casters were not touched: the 2.15-body-height near ring is intact.

### 11.5 `A48b-cadence-headroom-expansion` under load (blocker) — CLOSED, 9/9

The Longleg's loop closed over `ledger.observedPlants` — the stances a
once-per-frame sample happened to catch. Measured at 12.5 fps: 20 real stances,
6 visible; another run 31 and 0. The loop read that as under-delivery, wound
its trim to 1.4-1.7, drove the clip to ~5 cycles per SIM second, shortened every
stance further — positive feedback into the ceiling `A48b` grades. The judge's
remedy is what landed: `rig/contact.js` counts `stanceWraps` — one per foot per
stance window the phase authority opens, sampled per substep — and the clip
driven loops (Longleg, and the Watcher/Redeye with it) close over that. Five
consecutive runs at load average 6.5-8.3, and four more on the final code:
**every species 0.000 in all nine**, the Longleg included (it was 0.843 /
0.929 / 0.902 / 0.621 / 0.043 on the judge's HEAD).

### 11.6 `A48-cadence` flaky on the Longleg (major) — 14 of 16 in band; NOT closed by the gate

The measurement side, as the judge asked: a stance that opens AND closes
between two drawn frames is now REPORTED for exactly one frame, at the position
its foot was genuinely planted at and under its own `plantId`, and its end is
recorded as a release on the next frame so it cannot merge with the next
stance (`rig/footlock.js` `reportPending`, `rig/contact.js` `latch`). The
Longleg's hold ramp is 0.035 s (its plant opens where the clip already put the
foot, so the ramp's teleport guard `holdRate` still bounds it).

Sixteen gate runs across the round's code states, at load average 3-36 (the
box was NOT quiet — four to five other lanes' suites were running): the
Longleg is in band in **14 of 16** — 1.69, 0.80, 1.68, 1.60, 1.79, 1.28 (first
six), 1.59, 1.39, 1.60, 1.78, 1.30, 1.49, 1.88, 1.89, 1.90, 0.79 Hz against a
~0.97 floor. Both misses are windows in which it travelled only 1.26 m and
2.24 m in 5 s — the shape the instrument shows for a patrol wait inside the
window (§11.9; two of the three instrumented Longleg misses were exactly
that, the third a window the page drew at 3.8 fps — 20 frames in 5 s). The
previous round's six runs read 1.18, 1.50, 0.63, 1.25, 0.60, 1.47. The judge
asked for this to be closed, and by the gate it is NOT closed: a standing
machine takes no steps, and the gate grades a window that is mostly standing.
`A45`, `A45b` (0 merged reports at 1/3 frame rate), `A45c` and `A46` all PASS
with the pending report on.

### 11.7 Wrecks killed beyond 40 m cast no shadow (major) — CLOSED

`Machine.update()` returns before `animate()` for a dead machine, so the rings
froze on the frame of death. `rig/lod.js` `applyWreckShadow()` now runs from
`CorpseGrounder.update()` (every species' death path) until the wreck is
frozen, with a floor of ring 1: the prime caster is on at any range and stays
on when the wreck freezes; the engine's distance cull retires far ones.
Measured: a Shell-Walker killed at 55 m (alive ring 0) walked up to at 12 m
reads ring 1, prime `shell-hard`, casting; the same for Broadhead, Sawtooth and
Grazer killed at 55 m and viewed from 5 m (ring 2).
`shots/mx-r4-wreck-shadow.png` films the far-killed and near-killed wrecks side
by side.

### 11.8 `A47c-corpse-mass` (two majors) — 15 of 17 species closed IN EVERY RUN; Snapmaw and Corruptor NOT closed

The judge's recipe, as written, is what landed (`rig/ground.js` `CorpseShape`,
opt-in per species through a chassis predicate — every `GaitController`
species and the Watcher/Redeye):

1. **The lift comes from the chassis.** Every sampled vertex is classified at
   death by its dominant bone: chassis (pelvis/spine/chest and everything
   above them) or chain (legs, neck, head, tail, wings, claws). The body offset
   is solved from the chassis samples only.
2. **Chains are bent onto the soil, root to tip, and never lift the body.**
   Per chain joint, the lowest sample of its subtree; if it is through the
   soil the joint is rotated in the vertical plane through that sample until
   it rests 3.5 cm above it, capped per tick (0.3 rad, so a limb folds rather
   than snaps) and per joint (1.8 rad). A chain left floating gives bend back.
   A point the joint cannot lift — the girth of a thigh under a hip on the
   soil — is not bent for.
3. **The global floor is still guarded**: the lowest posed vertex, sampled at
   the corpse gates' own density (never thinner than 1 600 samples a mesh),
   may not go below -0.03 m, so `A47b` cannot be broken by the new solve.
4. **The death pose lets the limbs fall** (chassis mode only): legs rest near
   their own direction instead of being folded to the sky, a biped rolls onto
   its side instead of its back, a sprawler does not roll, and head and tail
   droop toward WORLD down (the rig root carries each model's yaw fix, so a
   signed local angle lifted the Thunderjaw's tail). A long wreck slews onto
   the slope contour as it falls.
5. **A wreck lies on the flank it lies flat on.** Rolled each way on fresh
   pages, three species measured a flank that props the chassis: the Behemoth
   chassis (+1: 0.58-0.64, -1: 0.90-1.04), the Stormbird (-1: dead median
   2.41 m, 0.70-0.71; +1: 2.64-2.65 m, 0.78) and the Broadhead (-1: 0.66-0.68;
   +1: 0.71-0.76). The side coin was the whole of their run-to-run spread — the
   Stormbird read 0.70 / 0.72 / 0.77 / 0.72 / 0.79 on five runs of the same
   code. A species that measures this names its flank (`machine.wreckSide`,
   read by `GaitController.deathPose` in chassis mode); the rest keep the coin.

**`A47c`, the six runs on the final code, ratio per run (bar 0.75):**

| species | runs | worst |
| --- | --- | --- |
| watcher | 0.42 0.37 0.37 0.36 0.42 0.43 | 0.43 |
| sawtooth | 0.58 0.51 0.51 0.51 0.52 0.56 | 0.58 |
| behemoth | 0.67 0.64 0.68 0.63 0.67 0.67 | 0.68 |
| thunderjaw | 0.55 0.55 0.53 0.55 0.56 0.56 | 0.56 |
| strider | 0.67 0.68 0.56 0.68 0.54 0.53 | 0.68 |
| scrapper | 0.70 0.60 0.49 0.55 0.68 0.50 | 0.70 |
| glinthawk | 0.08 0.09 0.09 0.08 0.09 0.09 | 0.09 |
| longleg | 0.39 0.59 0.59 0.26 0.23 0.43 | 0.59 |
| broadhead | 0.66 0.67 0.56 0.66 0.56 0.55 | 0.67 |
| redeye | 0.53 0.54 0.48 0.54 0.48 0.49 | 0.54 |
| grazer | 0.34 0.35 0.30 0.35 0.31 0.28 | 0.35 |
| ravager | 0.30 0.28 0.28 0.29 0.29 0.29 | 0.30 |
| shellwalker | 0.55 0.54 0.54 0.54 0.53 0.52 | 0.55 |
| stormbird | 0.72 0.70 0.72 0.70 0.72 0.72 | 0.72 |
| tallneck | 0.63 0.63 0.60 0.64 0.60 0.60 | 0.64 |
| **snapmaw** | 1.16 1.17 1.04 1.17 1.04 1.06 | **1.17** |
| **corruptor** | 1.30 1.28 1.12 1.27 1.15 1.14 | **1.30** |

Of the six this lane's own species the finding named (corruptor, snapmaw,
broadhead, shellwalker, grazer, redeye), four are closed with margin in every
run. The judge's HEAD list also named behemoth, thunderjaw, stormbird and
watcher: all four are closed in every run. `A47c` itself stays red on the two.

> **CORRECTED in §12.3 (residue fix round 2).** The cause given in the next
> paragraph is contradicted by measurement: on flat ground both wrecks'
> medians sat 0.13-0.20 m ABOVE their living medians, which "as low as the
> living body" cannot produce. The real causes — the chassis parked at the
> top of its band, living bodies sunk into the terrain, a tail arched by the
> root-first bend, legs folded up beside the body — are measured and fixed
> there. The paragraph is kept as the record of what was believed.

**Why the Snapmaw and the Corruptor are not, measured rather than argued.** Both
rest their bellies ON THE SOIL WHEN ALIVE — the chassis's lowest vertex reads
-0.06 m (Snapmaw) and -0.05 m (Corruptor) standing — so the median of a living
one is already the median of a body lying flat (alive medians 0.51-0.57 m and
0.61-0.68 m). With every limb, the head and the tail laid on the ground the
wreck reaches its own standing height, not a quarter below it. Three further
levers were built and measured and did NOT help: removing the sprawler roll
(1.60 -> 1.02 Corruptor, kept), a belly-up "dead bug" roll (Snapmaw 1.29,
Corruptor 1.26 — the dark donor body is the bulk, and it ends up on top;
reverted), and part drop (the components on these two are 3-8 % of the
samples and sit near the median already). What would close them is a flatter
wreck than the living body — a shell that physically folds (the scute ridge
and carapace plates hinged on their own bones) — per-species rig work, and
the hand-off this lane records.

**`A47b-corpse-posed`: 9 of 9 PASS since the corpse changes landed** (the
Thunderjaw floated 0.89-1.70 m in every run of the previous round).

### 11.9 `A48-cadence` — the remaining misses, instrumented, and three real defects found by it

Instrumented copy of the gate (`A48`'s own loop, species order and
`PROVOKE`, plus a 0.5 s bucket log per species of state, travel, plants and
airborne frames), six runs, next to 16 runs of the gate itself. **No miss is
a stride out of band.** Every machine the instrument measured was still in
`patrol` — the provoke never alerted one inside its 2.2 s — and the misses are:

1. **A patrol wait inside the window** (Longleg 2 of 16 gate runs, Corruptor
   2, Shell-Walker 1; machine-rig's Scrapper 1). `Machine._statePatrol` holds
   1.2-3.6 s of SIM time at every waypoint, and at the 8-18 fps these runs drew
   the sim runs at 0.5-0.65 of the wall clock, so that wait is 2-7 s of the
   gate's 5-s WALL window. Bucket log of a failing Longleg window (0.79 Hz):
   six buckets standing (0 plants, speed 0.0), then four walking at 1-2 plants
   per 0.5 s bucket — **1.0-2.0 Hz while it walks**, inside its 0.97-2.91 band,
   averaged with three seconds of a machine that is not walking. The same shape
   for the Corruptor (0.30 Hz: eight buckets standing, two walking). What would
   change the number is patrol timing (machine-ai) or the gate grading moving
   frames (machine-rig); this lane changed neither.
2. **A takeoff inside the window** (Stormbird 2 of 16; its other two misses
   were 1.19 Hz over a 1.09 ceiling — defect (c) below). `A48` takes the foot
   count from its LAST sample, so a bird that lifts off during the window
   reads 0.00 Hz. The instrument showed WHY it kept happening — defect (b).
3. **Near-threshold singles**: Redeye 0.50 / 0.60 Hz once each (covering 7.9-
   18.6 m with no foot in contact on 69-85 % of frames — a charge, not
   reproduced in six instrumented runs, where it read 1.19-1.40 Hz), Ravager
   0.65 against a 0.67 floor once.

The three defects the instrument found, all in `stormbird.js`, all fixed:

* **(a) It walked its patrol at flight cruise speed.** `walkSpeed: 8` /
  `runSpeed: 16` are AIR speeds and every state reads them flying or not. A
  perched bird patrolled at **8.0 m/s on foot with no foot in contact on 75 %
  of drawn frames**. On the ground it now uses `GROUND_WALK` 2.4 m/s and
  `GROUND_RUN` 9 m/s (the `runRef` its run stride was solved for); in the air,
  what it had.
* **(b) Its perch clock stopped while it was far away.** The ground hold and
  the takeoff decision ran in `animate()`, which `Machine.update` skips for a
  `lowLOD` machine — so the 16 s hold only counted down while the player stood
  near the bird. Across the gate's sequence that meant a bird that landed at
  the start carried its hold, frozen, for ~100 s and ran it out during the only
  seconds the player was near it — its own window — in 2 of 3 instrumented runs
  (hold 0 at 102.5 s / 103.0 s, airborne at 103.4 s / 103.8 s). The perch cycle
  now runs from `update()`, on the sim clock, at every distance.
* **(c) Its cadence band was a furled body's.** `measureBodyLength` ran with the
  wings folded (15.58 m, band top 1.19 Hz); `A48` measures the largest extent in
  the window, which with the wings open is the span — 17.1-19.1 m in every run,
  band top 1.07-1.14 Hz. A grounded run read 1.19 Hz against a 1.09 ceiling.
  The gait now sizes the band from the 19.1 m span, so its ceiling sits under
  the gate's at every wing state.

After (a)-(c), three gate runs: the Stormbird was airborne at the gate's
check in all three ("no feet" — not graded, as the Glinthawk), and no
Stormbird row failed. **`A48` across the 16 gate runs of this round: 7 PASS.**
It is not closed, and the lane does not claim it is; the table above is what
fails and why.

### 11.10 `A47-corpse-grounded` — red on the first full suite of this round, CLOSED

The first full suite read `A47` red on two species, both on slopes, both
because this round's corpse solve let the posed reference win wherever the
two ground references disagree:

* **Thunderjaw** +1.83 m. It spawns on the riser south of its flats — a 10 m
  terrace scarp, 33-45 degrees under its footprint, terrain normal y 0.69-0.75
  where it stands (measured; heights at x = 30: 7.8 m at z = -228, 1.9 m at
  -220, -2.5 m at -212). No position of a LEVEL wreck satisfies a slope like
  that: both corpse gates take the ground under a centre, and under a 16 m
  wreck on a 45-degree bank the centre and the lowest point are metres apart.
  The previous round hung it in the air to satisfy `A47` (`A47b` +0.89-1.70);
  the first pass of this round laid it on the posed reference and `A47` read
  the difference.
* **Longleg** +0.43 m on a shelf bench: `A47b` +0.02, `A47` +0.43 — a pair
  0.41 m wide, parked with its low surface on `BAND_LO`.

Three changes in `rig/ground.js`:

1. **A wreck slides off ground friction cannot hold it on.** At death the
   terrain under the footprint is fitted with a plane (two rings of eight,
   radius from the body length). Steeper than 30 degrees — static friction of
   steel on turf, mu_s ~0.58 — and the wreck lets go; it is then run down the
   fall line as a sliding block, `v^2 += 2 g (sin a - 0.36 cos a) ds` per half
   metre along the slope it is actually crossing, until kinetic friction has
   taken back the speed the bank gave it — past the foot, not at it (stopping
   where the slope first eased left the uphill half on the toe: `A47` +0.75).
   The run is a function of death time, eased over the collapse (0.2-1.6 s), so
   `settleCorpseNow` lands it where the drawn crumple will; a clip-driven
   species' tilted root is slerped onto the ground it arrives on, and the loot
   beacon moves with the wreck. On ground a wreck can rest on, nothing moves.
   Measured on the Thunderjaw killed where it spawns: a 12.5 m run to
   (31.2, -207.1), rest slope 5 degrees, `A47` **+0.10**, `A47b` **+0.07**.
   Filmed: `shots/mx-r5-thunderjaw-alive-on-riser.png` (alive on the bank)
   and `shots/mx-r5-thunderjaw-wreck-at-foot.png` (the wreck on the flat at
   the foot of it, the loot beacon standing out of it).
2. **A pair that fits both windows is centred in them.** Where the two
   references disagree by more than 0.26 m but by no more than both windows
   can hold (0.50 m), the low surface is placed at equal margin from the
   penetration bar and the float bar, in both solve modes. Only a pair too
   wide to fit at all keeps "burial is never traded away". For the Longleg's
   0.41 m pair: -0.055 / +0.355 instead of +0.02 / +0.43.
3. **The solve takes its ground where the gates take theirs.** The merged
   component draw (§11.4) is a visible mesh, and `A47`/`A47b` average every
   visible mesh into their centre; the solve skipped it (`noHull`), so on a
   shell-less species the two centres drifted apart and a Longleg the solve had
   balanced read `A47` +0.53. It now counts toward the centre — never toward
   the lowest point.

Nine corpse runs since (1) landed: **`A47` 8 of 9** (the miss: that Longleg
+0.53, before (3)), **3 of 3 after (3)**; Thunderjaw -0.01 / -0.01 / +0.18 /
-0.01 / +0.16 / -0.01; Longleg +0.04 / +0.37 / +0.04 / +0.31 / +0.04.
`A47b` 9 of 9.

### 11.11 `A44b-socket-vertex-integrity` — the far machines' components were never snapped — CLOSED

Recorded for two rounds as "pre-existing, reproducible": Ravager
`part:cannon` 0.26-0.41, Corruptor `spike-launcher` / `grenade-launcher`
0.247, Snapmaw `freeze-sac` 0.125. Probed in the running game, every one of
those machines was `lowLOD` with `_doctrineSnapped` unset, while every
expansion machine near the player read 0.003. `Machine.update` skips
`animate()` altogether while a machine is `lowLOD`, and the re-snap of the
components `installDoctrine` authors after the constructor lived in
`animate()`. It now runs from a microtask queued in the constructor (the
doctrine installs synchronously right after it returns, so this is the first
moment every component exists), keyed on the part count, and is re-checked
from `update()`; the Redeye (a Watcher subclass) does the same. Probed after:
Ravager, Corruptor and Snapmaw on the far side of the map read **0.003** on
every part. **`A44b` 3 of 3 PASS: worst 0.029, 0.029, 0.019** over 246
sockets. `A44-socket-integrity` PASS, worst 0.07.

### 11.12 Memory: one component buffer per species, not per machine

`A90-memory-stability` was the gate this lane had to keep "no worse", and
the component fold (§11.4) had made it worse: on the same box, three runs
before the fold read geometry growth +41 / +42 / +40 (1 PASS), three after it
+44 / +44 / +41 and the round's first full suite +45 (0 PASS). Instrumented on
the gate's own loop — every geometry the renderer uploaded after the loop
began, tagged at upload, listed at the end with the scene path of the mesh
holding it — **12 of the 62 buffers still alive after the lifecycle were the
separate-mode component buffer, one per living Watcher** (the loop spawns a
Watcher every 5 s). Nothing in that buffer is per-instance except the bind
it was baked with, and the shader already applies `bindInv` per slot, so a
second machine of the species draws the first one's buffer exactly as long as
it uses the first one's `bindInv` — which it now does. The buffer goes
through the species geometry pool (`rig/lod.js` `poolGeometry`, now
exported), keyed on the slots' own content.

| | before the pool | after |
| --- | --- | --- |
| instrumented loop: component buffers alive at the end | 12 | **1** |
| instrumented loop: tracked buffers alive at the end | 62 | **52** |
| instrumented loop: geometry growth (same 173 start) | +49 | **+39** |
| `A90-memory-stability` (bar +40) | +44 / +44 / +41 / +45, FAIL | **+17 / +16, PASS** |
| `A90-memory-stability-expansion` | PASS | **PASS**, +35 geo, 0 non-machine nodes |
| `A90-rig-reclaim` (bars +40, 1.0 per live Watcher) | PASS | **PASS**, +4, 0.50 per live Watcher |

(The two gate runs started at 193-194 uploaded geometries rather than 173 —
the variety cast had finished loading before the gate's first sample — which
flatters their growth; the instrumented run started at 173 like every run
before the pool and is the like-for-like comparison: -10.)

### 11.13 The named must-not-regress gates, final code

| gate | before this round | now |
| --- | --- | --- |
| `A90-memory-stability` | +41 / +42 / +40 (1 of 3 PASS) | +17 / +16, PASS (§11.12) |
| `A90-memory-stability-expansion` | PASS | PASS |
| `A90-rig-reclaim` | PASS, 0.38-0.88 per live Watcher | PASS, +4, 0.50 per live Watcher |
| `A9-perf-budget` | drawCalls 361 | **319**, callsOk; fps term PENDING (null frame 6.5 ms GPU) |
| `A21-real-draw-calls` | 398 | **339-344** PASS on the draw term; PENDING on the clock terms |
| `A45` / `A45b` / `A45c` / `A46` | PASS | PASS (worst drift 0.001-0.012 m, ground error 0.054-0.060 m) |
| `A44c` A and B, `V26c` | PASS | PASS |

Every runtime object this round added has a dispose path: the pooled
component buffer is released by `disposeGeometryPool` (per-machine material
and slot uniforms by `disposeComponents` from `disposeRig`), the slide plan is
plain data on the grounder and dies with the wreck, and the doctrine re-snap
allocates nothing after the hull proxy it already built. No per-frame
allocation was added: `_slideStep`, `_perch` and the snap check are
allocation-free; the only allocations are at death (two quaternions for a
clip-driven species that slides) and at fold time.

### 11.14 The full suite on 5207 — every FAIL, with an owner

`node tools/gates.mjs --port 5207`, one run on the final code, 08:10-10:02:
**237 gates: 183 pass, 11 fail, 3 pending, 40 need judging** (last round's
closing run: 175 / 19 / 3 / 40). The runner left 0 of its own Chrome
profiles on disk. Four to five other lanes' suites were running on the same
box throughout.

| gate | owner | reading |
| --- | --- | --- |
| `A47c-corpse-mass` | machine-rig gate; Snapmaw/Corruptor this lane, Scrapper machine-rig | Snapmaw 1.19 and Corruptor 1.25: §11.8, NOT closed. Scrapper 0.75: machine-rig's species, a death-pose coin flip (0.48-0.87 across 15 runs, 3 over the bar; its roll side and yaw twist were measured in all four combinations and give no clean rule, so it was left) |
| `A44-socket-integrity` | machine-rig gate, this lane's Longleg | `longleg dead:head` 0.134 — the same load flake the last round recorded (0.148). Re-run in isolation three times after the suite: **PASS x3, Longleg dead:head 0.000** |
| `A50b-aim-on-drawn-geometry` | machine-rig gate; cause core-platform | Watcher / Redeye 94 % (bar 95 %): 3 of 50 arrows on `Eye_Lense_1001_Glass_Lense_0` / `Headplate_Frill-x4`, meshes `src/core/engine.js`'s screen-size cull hides (`__sizeCulled`) at the gate's range while their hit hulls stay live. Failed identically in the previous round's suite (21:25, same ghost names) and passed in its closing suite. Opting them out (`noSizeCull`) would add up to three draws per Watcher in view against a staged fight at 345 of 350, so it was not done |
| `A21-real-draw-calls` | core-platform (shared) | this lane's term PASSES: draw calls **345** of 350 (was 398), triangles PASS. The gate FAILS on `medianGpuMs` 109-146 ms (budget 20) — the whole frame on a GPU shared with five headless Chromes; the null frame read 0.67 ms, so the gate called it attributable this run (it read PENDING in every earlier run this round) |
| `A12-clip-driven`, `A17-draw-beats` | animator | not this lane |
| `A31b-no-ghost-without-occluder` | player-control | not this lane |
| `A69-death-choice` | shell-menus | not this lane (`Cannot read properties of null (reading 'click')`) |
| `A75c-suspicion-scan` | audio | not this lane |
| `A81-canon-speed-bands` | core-platform-followup2 | not this lane |
| `A23b-hull-fidelity` | spatial | not this lane; red in every suite since the previous round (worst gap 22-28) |

PENDING: `A9-perf-budget` (core: draws 319 inside budget, fps not
attributable), `A13-no-skate` (animator), `A23-aim-cost` (spatial).

This lane's gates and the ones it was asked to keep, in the same run: `A47`,
`A47b`, `A48`, `A48b`, `A44b`, `A44c` A/B, `V26c`, `A45`, `A45b`, `A45c`,
`A46`, `A90-memory-stability` (+36 geometries from the 173 start that every
earlier run had), `A90-memory-stability-expansion`, `A90-rig-reclaim` and
`A90b-memory-attribution` all PASS. `V26a` / `V26b` / `V27a` / `V27b` /
`V26` / `V27` were re-shot by this run (`shots/gates/`, 09:22-09:28) and read:
all five batch-A machines at readable size, the Snapmaw full length and the
Redeye's grey plates over its dark donor; the Shell-Walker, the Stormbird
with six countable nacelles and the Corruptor; the four batch-A windups with
the limbs doing the work (horns down, rotors up, cannon over the back, jaws
open) and batch B's legs, wing and tail in the move.

---

## 12. Fix round 2 on the residue — the judges' six findings

Measured on port 5207 while four to five other lanes ran suites on the same
box (load average 6-41; each batch's load is quoted). No gate bar was moved
and no gate was edited this round.

### 12.1 A Stormbird alarmed while perched never took off (blocker) — FIXED

The 8 s ground hold armed on every calm-to-alarmed change of a grounded bird
(§11.9's "run before it flies") re-armed on every `alert`/`return` flicker,
so an alarmed perched bird never left the ground and fought a flyer's
doctrine on its feet. The re-arm is deleted; only the `GROUND_DWELL` (16 s)
commitment after a TOUCHDOWN remains (`stormbird.js` `_perch`). Probe (judge
p4b, bird set down with 6 s of hold and the player 16 m in front, its leash
anchor moved with it — the judge's probe teleported it 150 m from home, which
leashes any machine into `alert`/`return` flicker on its own): hold 6.0 ->
0.0 on the sim clock, grounded `attack` until the attack in progress
finished, airborne 3 s later, climbing to 14-15 m and fighting from there
(`shots/mx6-stormbird-alarm-{1s,5s,9s,15s}-cur.png`; the 15 s frame shows it
in the air with its nacelles lit).

Behind it, one thing the removal exposed: `A48` read the Stormbird at
**1.40 Hz against a 1.11 Hz ceiling** in one of five runs, airborne on 49 % of
the window's frames — a takeoff and a landing inside the five seconds. The
gait keeps running while the legs are tucked, and at cruise speed its cadence
loop commands a walk the tucked legs can never plant, so the debt integrates
to its cap for the whole flight and is paid out as a burst of short fast
steps on touchdown. The Stormbird's loop is emptied on the wing
(`stormbird.js`). A GENERIC form of the same idea — every GaitController loop
fed "not walking" while its legs are tucked — was built and then REVERTED on
measurement: reproducing `A48`'s species order (Broadhead, Redeye, Grazer,
then the Ravager, which escorts the Grazer herd), the Ravager on patrol read
2.95 / 3.3 / 3.05 / 3.4 Hz with it and 1.7 / 1.9 / 1.3 Hz without, its feet
reporting three plants per commanded step.
A takeoff inside the window still reads 0.00 Hz, because `A48` takes the
foot count from its LAST sample; that is `A48`'s to fix (machine-rig).

### 12.2 `A47-corpse-grounded` regressed (major) — 4 of 5 at load 22-33

Three causes, all fixed:

1. **Five GaitController species had no `settleCorpseNow`** (Sawtooth,
   Strider, Scrapper, Thunderjaw, Behemoth). Added to each `_die()`.
2. **The settle was thrown away on the first replayed frame.**
   `CorpseGrounder.update` set `_lastT` back to the rewound death time, so the
   solve resumed at once and chased the replayed collapse from scratch
   (traced on a Corruptor: a 0.11 / 0.22 m two-tick limit cycle for 3 s). The
   grounder now holds the settled offset until death time passes the settle
   (`_replayUntil`), easing it in with the collapse (`foldA`'s curve), and
   `settleCorpseNow` finds the gait-owned grounder as well as `_grounder`.
3. **The death clock ran on the sim clock**, which a loaded page runs at
   1/2-1/25 of the wall: 9-10 frames in the gates' 5 s put every wreck a third
   of the way into its collapse (Behemoth -0.82, Thunderjaw mid-slide). The
   collapse now advances by sim dt x `wallPerSim` (`gait.js` `deathDt`) —
   exactly 1 when the sim keeps up, pause-safe, real-time when it does not.
   Same reason footfalls are real-time.

And the two the judge named:

* **The box floor is held on every tick** (`rig/ground.js`), bending or not.
  A chain that hunts between bend and give-back is "bent" on every tick, so
  the floor `A47` grades was never held — the Behemoth's -0.11/-0.13.
* **The Longleg's Death clip stepped 1/60 s per call**, so the eighteen settle
  steps moved it 0.3 s while the solve ran 3.24 s of death time: the offset
  converged on a Longleg still standing, then froze while the clip collapsed
  under it (+0.52 m). The clip now steps on the death clock, the settle lands
  the solve on its last frame, and the Death one-shot is restarted to replay
  (a finished LoopOnce action is PAUSED on its last frame; setting its time
  alone froze the wreck on frame 0).

Three more things the replay hold exposed, found by `A44` reading the
Longleg's `dead:head` at 0.18-0.21 in 2 of 3 isolated runs, all fixed:

* **A tick left pending by the settle measured the replay's standing first
  frame** and wrote its boxes; nothing is measured during the replay now.
* **The settle did not write the body-node death roll** that
  `Machine._updateDeath` writes before `onDeathPose` (the Longleg's 0.35 rad);
  settled without it and drawn with it, the wreck sat 0.23 m off the ground
  it was solved onto. `settleCorpseNow` writes the same roll, pitch, twist
  and sink per step, and refreshes the boxes from the pose it ended on.
* **A dead Longleg kept walking.** Idle/Walk/Run are externally weighted, so
  `onStateChange('dead')`'s fade never reached them: a Longleg killed
  mid-stride kept Walk at weight 1.00, looping over the Death clip, its dead
  head bobbing 0.3 m on the walk's period. The owner releases them on the
  death clock now. After the three: `A44` 3 of 3 PASS (worst 0.000, 0.031,
  0.006), `A44b` 3 of 3.

**`A47`, five clean runs, load 22-33 (bars -0.10 / +0.40):**

| species | runs | |
| --- | --- | --- |
| behemoth | -0.03 -0.03 -0.03 -0.03 -0.03 | was -0.11/-0.13 in 5 of 9 |
| longleg | +0.02 +0.02 +0.02 +0.03 +0.02 | was +0.52/+0.54 |
| thunderjaw | -0.03 **-0.21** -0.01 +0.17 -0.03 | 1 of 5 out |
| glinthawk (machine-rig's) | +0.04 **-0.23** +0.34 -0.03 +0.13 | own death path, untouched |
| every other species | -0.03 ... +0.11 | 5 of 5 in |

`A47` **4 of 5 PASS**; `A47b` **5 of 5 PASS**. The run that failed failed on
the Thunderjaw and the Glinthawk together: the Thunderjaw's posed floor read
+0.32 against a box floor of -0.21, a pair 0.53 m wide — wider than the two
gates' shared 0.50 m window, which happens where its slide ends on ground
whose mesh-box-centre reference and posed-centre reference differ by more
than 0.3 m. No offset satisfies both gates there; it is recorded, not closed.

### 12.3 `A47c-corpse-mass` (blocker + major) — 14 of 17 in every run; Snapmaw and Corruptor NOT closed, Stormbird at the bar in 1 of 5; ruling requested

The cause §8/§11.8 gave ("both rest their bellies on the soil alive, so the
wreck is as low as the living body") is WRONG. Measured per bone on flat
ground, the wrecks' medians were 0.13-0.20 m ABOVE the living ones, from four
causes, each measured and each fixed:

| cause | measured before | lever |
| --- | --- | --- |
| the chassis solve stopped at the TOP of its band | dC 0.079-0.080 on every wreck | aim at 0.015 (`CHASSIS_AIM`), window [0, 0.04] |
| living bodies sank into the terrain (both donors are sculpted lying down) | Corruptor belly 0.14-0.17 m under flat ground standing; Snapmaw 0.06 basking | `standLift` 0.26 m (Corruptor stands on its legs), `highWalk` 0.16 m (the Snapmaw's high walk), `bellyMin` (a crouch or bask comes down TO the soil, not into it) |
| a tail arched by the root-first corpse bend | Snapmaw `rig_tail2` 0.59 -> 0.98 m dead; Corruptor sting 1.9 m up | tail laid along the ground joint by joint (`_layToward`); laid joints are the pose's, not the bend's |
| legs folded up beside the body | Snapmaw feet 0.29-0.32 m dead vs 0.13-0.23 alive; Corruptor shins 0.82-0.84 m | legs laid hip -> knee -> ankle -> toe onto the ground (`layWreck`, opt-in: Snapmaw, Corruptor, Shell-Walker) |

Two details the lay needed, both measured: it targets the ground the wreck
will REST on (`restOffset()`, the offset at measurement time plus the chassis
error) — laid against the current offset, a leg propping a lifted body
reached down for the soil and the floor guard lifted the body further for it
(the Corruptor ran away to 1.39 m); and downhill it lies level with the
centre (`_layGround`), because both corpse gates measure every vertex against
the ground under the wreck's CENTRE. The Corruptor's tail ROOT does not droop
(`layTailRoot: 0`): `RIGS.corruptor` starts the tail at z -1.45, inside the
abdomen, so `rig_tail1` is skinned to the rear of the body (body y 0-1.1) and
any droop swings that belly through the soil.

**`A47c`, five clean runs, load 22-33 (bar <= 0.75):**

| species | runs | median | last round |
| --- | --- | --- | --- |
| snapmaw | 1.02 1.01 0.95 1.01 1.05 | 1.01 | 1.04-1.17 |
| corruptor | 0.83 0.74 0.78 0.75 0.77 | 0.77 | 1.12-1.30 |
| stormbird | 0.75 0.71 0.74 0.70 0.72 | 0.72 | 0.70-0.72 |
| shellwalker | 0.50 0.50 0.48 0.50 0.51 | 0.50 | 0.52-0.55 |
| sawtooth / scrapper / thunderjaw / broadhead / tallneck | 0.48-0.50 / 0.43-0.62 / 0.42-0.53 / 0.53-0.64 / 0.57-0.65 | | 0.51-0.58 / 0.49-0.70 / 0.53-0.56 / 0.55-0.67 / 0.60-0.64 |
| every other species | 0.07-0.68 in every run | | |

The chassis aim lowered every chassis-mode wreck; nothing else got worse
except the Stormbird, which sits at the bar in 1 of 5 runs (it dies where it
stands, and on a slope its wreck's two gate references differ, so the box
floor that `A47` needs lifts it). On flat ground: Stormbird 0.663-0.667,
Corruptor 0.751, Snapmaw 1.00.

**What is left, and why a ruling is asked for rather than a further lever.**
The Snapmaw's `A47c` reference pose is BASKING — `casting-v4` §2.3 and the
doctrine hold a calm Snapmaw motionless on its belly, and the gate's first
living Snapmaw is always one of the basking pair (alive median 0.525-0.584 in
every run, belly on the soil). A crocodile lying on its belly and a dead
crocodile lying on its belly are the same height: after all four levers the
wreck lies flat (chassis at 0.02, legs and tail on the ground, head down) and
reads 0.95-1.05 of the basking body. 28 % of the gate's samples on this
species are the lens, the freeze sac and the head's eye rigid meshes, which
ride on top of the snout and back at 0.8-1.0 m alive and dead. The
Corruptor's remaining mass is its tail: the tail root is skinned to the
abdomen (above), so the tail can only come down from `rig_tail2`, and a hump
at 2.1 m stays. Closing either needs per-species rig work (re-rooting the
Corruptor's tail behind the abdomen; a Snapmaw reference pose that is not a
bask) or a ruling on what `A47c` means for a machine whose living rest pose
is lying down. **Requested from the orchestrator: a sprawler ruling for
`A47c`** (Snapmaw, and the Corruptor at 0.74-0.83).

### 12.4 `A48-cadence` flaky (blocker + major) — 3 of 5 on the final code; NOT closed; owners named

The judge's remedy for this lane: walk cadence at least 1.15x the band floor
on the Redeye and the Ravager. Measured on a forced patrol leg with perception
off (so the machine walks the whole window), `A48`'s own count and `L`:

| species | delivered while walking | gate floor | x floor | controller floor x floor |
| --- | --- | --- | --- | --- |
| redeye | 1.19 / 1.29 / 1.29 Hz | 0.92 / 0.98 / 0.95 | 1.29 / 1.31 / 1.36 | 1.35-1.44 |
| ravager | 0.94 / 0.88 / 0.99 Hz | 0.62 / 0.65 / 0.65 | 1.51 / 1.34 / 1.51 | 1.42-1.49 |
| watcher (ref.) | 1.27-1.38 Hz | 0.87-0.90 | 1.44-1.54 | 1.48-1.52 |

Both are already above 1.15x while they walk — the commanded floor is 0.47 of
the band TOP, i.e. 1.41x the gate's floor — so no stride was changed. The
misses the judge read (Redeye 0.89 vs 0.95, Ravager 0.54 vs 0.61) are
windows that were partly standing.

`A48` across the round, by code state:

| code state | runs | PASS | offenders |
| --- | --- | --- | --- |
| before the reach-swing fix (load 6-13) | 5 | 2 | Longleg x2 (0.30 Hz after 0.96 m, 0.70 after 2.42 m: patrol waits), Stormbird (landing burst, fixed §12.1) |
| same, quiet box (load 3-5) | 5 | 0 | Ravager x4 (2.05-2.89 Hz, OVER the ceiling), Behemoth, Grazer, Tallneck, Stormbird — the escort flicker below |
| full suite | 1 | 0 | Ravager 1.99 over 1.87 |
| **final code** (load 3-4) | 5 | **3** | Longleg 0.90 vs 1.02 after 4.0 m and Shell-Walker 0.53 vs 0.58 after 2.5 m (one run; windows partly standing), Stormbird 0.00 after a takeoff (one run) |

No reading over a ceiling in the five final runs (Ravager 1.10-1.45 Hz).
`A48b-cadence-headroom-expansion`: PASS in every run this round (11), every
species 0.000.

What would close `A48`, and whose it is: a patrol wait inside the 5 s WALL
window (the wait is sim time — machine-ai's `_statePatrol`), and a flyer's
takeoff read as 0 Hz because the foot count is taken from the last sample
(machine-rig's gate: grade moving frames, or drop windows where
`debugFeet().length` changes).

**One more, found this round and only half fixed: the escorting Ravager's
plant flicker.** In `A48`'s own order the Ravager is measured right after the
Grazer, whose herd it escorts, and it spends its window walking the escort
route at 2.4 m/s. Instrumented (0.25 s buckets), its commanded phase sits at
the loop's floor (0.69-0.74 Hz, trim pinned at 0.55) while its feet report 3-7
touchdowns per bucket — the gate reads 1.3-3.4 Hz, the loop reads the same
flicker as over-delivery and slows the phase further, which lengthens the
stride. The full suite of this round read it at 1.99 against a 1.87 ceiling.
Sizing its band from the longest extent `A48` measures (6.5 m) was tried and
reverted — it made the stride longer and the flicker worse (2.24-3.6 Hz in 4
of 5 runs). Instrumented further, two mechanisms stack. (1) THE REACH GUARD AND
THE RE-SYNC FOUGHT: the guard throws a stance foot that has run out of leg
into swing by moving only that leg's clock, and the next line's re-sync pulled
the clock straight back across `duty` into stance — plant, out of reach,
swing, plant, once per drawn frame. FIXED (`gait.js`: a reach-swung leg
finishes its swing; the re-sync may only pull it forward until its clock
wraps). Same escort order, three runs each: 2.95 / 3.3 / 3.05 / 3.4 Hz before,
1.15 / 1.4 / 2.0 after; `A45`, `A45b`, `A45c`, `A46`, `A76b`, `A48b` PASS with
it. (2) NOT FIXED: while escorting, every touchdown still runs out of reach
within a few frames (46 plants, 42 reach breaks in 5 s, at any commanded
cadence from 0.74 to 1.02 Hz — a stride floor at the gait's own walk stride
was tried and reverted, it changed nothing), so each leg plants about twice a
cycle and the loop still reads it as over-delivery. The landing target is
clamped to 0.90 of the leg's reach and the guard breaks at 0.926, 2.6 % of
margin; why the escort route eats it (heading vs travel, or slope) is the
next thing to measure, and the loop closing over stance windows
(`stanceWraps`, as the Longleg's and the Watcher's do) instead of reported
contacts is the fix it points at for the loop's half.

### 12.5 Memory and the named must-not-regress gates

| gate | now | before this round |
| --- | --- | --- |
| `A90-memory-stability` | PASS: geometries +36 from the 173 start, textures -19, heap -6.4 %; in the full suite +18 from 194, heap -8.1 % | PASS, +36 |
| `A90-memory-stability-expansion` | PASS: +23 geometries (+25 in the suite), 0 non-machine nodes, 0 orphans | PASS |
| `A90-rig-reclaim` | **6 of 6 PASS in isolation** (per live Watcher 0.25-0.75, 30-cycle growth +1..+5) and PASS in the full suite (0.13, +5); FAIL once in a combined memory batch at 1.25 / held 4 — §10.6's fingerprint: the species-POOLED Watcher eye and frill buffers first drawn inside the hold bracket and retained by design | PASS |
| `A9-perf-budget` | PENDING: draw calls 319 (callsOk), fps not attributable (null frame 6.1 ms GPU) | PENDING, 319 |
| `A21-real-draw-calls` | PENDING: draw calls 319 / 217 / 344 of 350, triangles PASS; clock terms not attributable | 345 PASS on draws |

Runtime objects this round added, and where they go: the corpse-shape arrays
of the five GaitController species are now built at death instead of on the
first corpse tick (the same arrays, on the grounder, dying with the wreck);
`rig.tailR` is one short array per rig built with the rig. Nothing per frame:
`_layToward`, `_layGround`, `restOffset()`, `deathDt()` and the Stormbird's
airborne loop reset use module scratch vectors and scalar stores only.

### 12.6 Films, re-shot by the full suite and read against `casting-v4.md`

`shots/gates/V26a-silhouette.png`, `V26b-silhouette.png`, `V27a-attack-pose.png`,
`V27b-attack-pose.png`, `V26-silhouette.png`, `V27-attack-pose.png` (15:13-15:18,
this round's suite). V26a: Broadhead horns over four legs, Grazer's rotor
antlers over two orange canister rows, the Ravager's cannon rail on its back,
the Snapmaw long and low with its knees outboard and its scute row, the Redeye's
grey plates over the dark donor with the red sensor lit. V26b: the Shell-Walker's
legs, raised arm-claws and cargo crate; the Stormbird's spread wing with its
engine nacelles; the Corruptor matte black, tail arched over its back, now
standing on its legs (`standLift`) instead of lying in the soil. V27a: horns
down, rotors up, the Ravager coiled, the Snapmaw reared with its jaws open.
V27b: arm-claws raised, wing swept, tail in the strike. Also filmed this round:
`shots/mx6-sprawl-{alive,dead}-final.png` (Snapmaw and Corruptor alive and
dead on the meadow — the Snapmaw's tail and legs lie on the ground dead, the
Corruptor's tail comes down from its second joint), and
`shots/mx6-stormbird-alarm-{1s,5s,9s,15s}-cur.png` (§12.1).

### 12.7 The full suite on 5207 — every FAIL, with an owner

`node tools/gates.mjs --port 5207`, 14:12-15:45, load 3-24: **238 gates: 188 pass,
9 fail, 1 pending, 40 need judging** (last round's closing run: 183 / 11 / 3 /
40). The runner left 0 of its own Chrome profiles on disk. The only code change
after it is §12.4's reach-swing fix in `gait.js`, re-run on its own: `A45`,
`A45b`, `A45c`, `A46`, `A76b`, `A48b` PASS.

| gate | owner | reading |
| --- | --- | --- |
| `A47c-corpse-mass` | this lane | Snapmaw 0.89 (ruling requested, §12.3); Corruptor 0.72 and Stormbird 0.73 passed in this run |
| `A48-cadence` | this lane + machine-ai + machine-rig | Ravager 1.99 against 1.87 (the escort flicker, §12.4); patrol waits and takeoffs are the other owners' |
| `A9-perf-budget` | core-platform (fps term) | draw calls 319, in budget (this lane's term); fps 42.6 against 45, attributable this run (null frame 59 fps) |
| `A13-no-skate`, `A17-draw-beats` | animator | not this lane |
| `A31b-no-ghost-without-occluder` | player-control | not this lane |
| `A81-canon-speed-bands` | core-platform-followup2 | not this lane |
| `A23-aim-cost`, `A23b-hull-fidelity` | spatial | not this lane |

PENDING: `A21-real-draw-calls` (core-platform clock terms; draw calls
319 / 217 / 344 of 350 and triangles PASS). This lane's and the must-not-regress
gates in the same run: `A44`, `A44b`, `A44c` A/B, `A45`, `A45b`, `A45c`, `A46`,
`A47`, `A47b`, `A48b`, `A50`, `A50b`, `A76b`, `V26c`, `A90-memory-stability`,
`A90-memory-stability-expansion`, `A90-rig-reclaim`, `A90b` all PASS.
