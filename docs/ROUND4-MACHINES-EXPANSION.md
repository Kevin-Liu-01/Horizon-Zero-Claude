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
