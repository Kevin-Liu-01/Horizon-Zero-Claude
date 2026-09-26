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
fall is keyed on `deathT` exponentially for exactly this reason.

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

* `A47c-corpse-mass` is still red. This lane moved behemoth (1.05 -> 0.67),
  tallneck (0.94 -> 0.62) and watcher (0.77 -> 0.72) under the bar and improved
  every expansion species against the fix-round-1 baseline (snapmaw 2.28 ->
  1.77, corruptor 4.46 -> 3.14, shellwalker 2.14 -> 1.69), but broadhead,
  grazer, snapmaw, shellwalker, corruptor, stormbird and redeye are still over
  0.75. The remaining mechanism is measured and recorded: the pose drives some
  head- or limb-bound geometry below the terrain and `CorpseGrounder` lifts the
  entire wreck by that much to put the lowest vertex back on the soil
  (`body.position.y` +0.8 to +2.3 m). The lever that closes it is per-species
  geometry, not another global angle.
* `A21-real-draw-calls` is a shared budget. This lane's contribution is
  negative: retiring the Stormbird's donor and the Redeye's 4-triangle scan
  plane removes three meshes per machine of those kinds.

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
