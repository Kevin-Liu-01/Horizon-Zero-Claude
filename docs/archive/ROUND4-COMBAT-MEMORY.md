# ROUND 4 — lane `combat-memory` (port 5208)

Owns the **memory paths** of `src/combat/particles.js`, `arrows.js`, `bow.js`, `combat.js`.
No gameplay behaviour changed in this lane; every entry below is an observation, a teardown hook,
or — in one case, §3.1 — a re-plumbing whose output was measured bit-identical to what it
replaced. The gameplay contract for the same files is `docs/ROUND4-COMBAT.md` — read that first,
this is the appendix about what combat *allocates*.

The lane exists because the app crashed. `A90-memory-stability` (core) proved the session grows
per machine death even after the full corpse lifecycle has run at distance: 30 kills → heap
+26.5 %, +76 geometries, +48 textures, +1121 scene objects. These APIs are how the half of that
number combat is answerable for is made falsifiable.

---

## 1. `ctx.combat` — memory surface

| entry point | returns | meaning |
|---|---|---|
| `memoryAudit()` | see §2 | one snapshot of everything combat owns, counted |
| `gpuFingerprint()` | `{geometries, materials, textures, hash}` | **cumulative** identity set: how many distinct GPU resources combat has *ever* referenced |
| `sharedAssets()` | `{geometries[], materials[], textures[]}` | the module-level singletons the projectile pools **and the seven weapon models** ride on, so a gate can put a `dispose` listener on each (§7) |
| `ownedResources()` | `{geometries[], materials[], textures[]}` | **every** GPU resource reachable from combat's roots, as objects. The instrument A95 uses to prove `dispose()` frees each one. Excludes `THREE.Sprite`'s process-wide quad (§7) |
| `clearFx()` | — | park every live transient effect. Does **not** deallocate and does **not** touch placed traps |
| `dispose()` | — | full teardown. **Teardown-only and single-shot** (see §5) |
| `arrows.releaseFrom(machine)` | `freed:number` | drop every pooled arrow riding `machine` |
| `arrows.releaseOrphans()` | `freed:number` | drop every arrow whose host is `_disposed` / unparented |
| `arrows.audit()` | `{max, idle, fly, stuck, riding, orphaned, detached, inScene, hosted, overdue, maxAge}` | `hosted` = pooled arrows that are **not** direct children of the scene; must be 0 (§3.1). `overdue` = live arrows past their own published deadline; must be 0 (§6.1) |
| `bombs.audit()` / `discs.audit()` | `{max, fly, inScene, overdue, maxAge}` | same `overdue` contract |
| `ARROW_FLY_LIFE` / `ARROW_STUCK_LIFE` / `BOMB_LIFE` / `OVERDUE_SLACK` | `12 / 10 / 10 / 1` s | exported from `arrows.js`: the self-recycle deadlines, published so a gate can assert against the pool's clock instead of wall time (§6.1) |
| `bombs.recycleAll()` / `discs.recycleAll()` / `arrows.recycleAll()` | — | park the whole pool |

`machine-ai` is the only lane with a reason to call one of these: **`combat.arrows.releaseFrom(m)`
from the corpse-reclaim path**. It is *not required* — combat already listens for the
`machine-disposed` event and additionally sweeps every 0.5 s (§3) — but calling it directly
releases on the same frame instead of within half a second.

---

## 2. `memoryAudit()` shape

```js
{
  sceneObjects,            // total objects combat has parented into the scene graph
  live,                    // transient FX in flight (see the scope note below)
  models, modelMeshes,     // weapon models built / meshes under them
  fingerprint: { geometries, materials, textures, hash },
  pools:  { sparks, trail, dirt, smoke, chips, decals, blastFx },   // each { max, live, objects }
  arrows: { max, idle, fly, stuck, riding, orphaned, detached, inScene, hosted },
  bombs:  { max, fly, inScene },
  discs:  { max, fly, inScene },
  traps:  { ropes, wires, pins, trips, liveRopes, liveWires, placing, roots, objects },
  melee:  { swings, hits, silent, crits, roots, objects, trailLive },
  dom:    { combat, document },        // node counts
  gpu:    { geometries, textures },    // renderer.info.memory passthrough
}
```

**Scope, stated exactly.** `sceneObjects` and `fingerprint` cover *every* file under
`src/combat/` — particles, arrows, bow, weapons, **traps and melee included** (74 rope / wire /
preview meshes and the swing trail + spear, enumerated by `Combat._trapRoots()` /
`_meleeRoots()`). `live` deliberately means **transient FX only**: particles, scorches, blast
rings, arrows, bombs, discs. A placed rope or an armed tripwire is durable gameplay state with
its own timer, so it is reported under `traps` and bounded by `sceneObjects`, never folded into
`live`. The only combat thing outside `sceneObjects` is the HUD, which is counted under `dom`.

**Why a cumulative fingerprint.** An arrow swaps its head/fletch/glow material as the ammo type
changes, so a snapshot of what combat references *right now* moves between a hunter arrow and a
freeze arrow with nothing having been allocated. The set only ever grows, so the claim is the
honest one: after a warm-up that has touched every weapon and every ammo type, combat must never
reference a geometry, material or texture it has not already referenced. One `new THREE.Mesh` on
an impact path moves the count; a type swap cannot.

**Cost.** `memoryAudit()` traverses ~148 roots and is a *diagnostic*, not a frame call. Nothing
in the game loop calls it.

---

## 3. Arrows and corpses — what actually happens

**Fix round 2 rewrote this section. The previous version overstated the bug and its
measurement did not reproduce; a judge reproduced the opposite and was right.**

### 3.1 `_ride()` — a stuck arrow is never a child of the machine

A hit used to call `machine.root.attach(arrow.group)`. That put a pooled arrow *inside another
lane's scene subtree*, and `ai/sites.js` `dispose()` (sites.js:118-123) traverses `m.root` and
calls `dispose()` on **every geometry and every material it finds** before it emits
`machine-disposed` (sites.js:145). Combat's module-level singletons were therefore inside that
traverse. Measured on port 5208, one wreck reclaimed with 8 riders:

| shared resource | `dispose` events fired by one reclaim |
|---|---|
| shaft / head / fins geometries (`arrowAssets().geometries`) | **24** |
| shaft / head / fletch / glow / flame materials | **40** |
| `THREE.Sprite`'s process-wide quad geometry | **17** (16 of them the riders' flame+glow sprites) |

— while 28 pooled arrows and every bow's nocked arrow were still drawing with them. No handshake
can prevent this: `m._disposed` is set at the top of the **same synchronous call** as the
traverse, so neither the `machine-disposed` listener nor the 0.5 s sweep can run early enough.

`arrows.js` `_ride(a, machine)` fixes it structurally. The arrow group stays a direct child of
`ctx.scene` for its whole life; `a.ride` is a `Matrix4` holding the offset it keeps in the host
root's local space — exactly what `attach()` would have baked in — and `_followHost(a)`
re-composes `position`/`quaternion`/`scale` from `hostWorld * a.ride` every frame, with
module-level scratch matrices and zero per-frame allocation.

**The visual is bit-identical, measured, not asserted.** `attach()` parented to the *root*, not
to a bone, so the arrow only ever followed the root transform. Running both mechanisms side by
side on the same wreck — three arrows riding, three truly parented — and then translating the
host 4.5 m, raising it 0.7 m and yawing it 0.8 rad, the arrow-in-host-space matrix changed by
`0` for both arms (max abs element delta, all 16 elements). The host's world matrix is
re-composed fresh in `_hostWorld()` rather than read from `root.matrixWorld` (which the renderer
only refreshes at draw time), so there is no frame of lag either; machines update before combat
in `main.js`'s `_add()` order.

`arrows.audit().hosted` is the invariant this buys and is asserted at **0** by A92: a pooled
arrow must be a direct child of the scene at all times, riding or not.

### 3.2 The handshake, and its true bound

A stuck arrow **self-recycles at `age > 10` over a 0.35 s taper** (`arrows.js` `update()`), i.e.
~10.35 s after it lands. The corpse lifecycle's *fastest* route to `dispose()` is freeze at
`SITE.freeze` 10 s plus a 12 s dissolve — ~22 s after death — and `maxWrecks` only accelerates
the **oldest** wreck (`victim.age = max(age, SITE.fadeStart)`, sites.js:68-71). So in wall-clock
terms **the normal reclaim never finds a rider**: the pool has already let go. The earlier
claim here — "28 pooled arrows could pin 28 disposed machines", plus a "+13 s" retention
measurement — was wrong on both counts and is withdrawn.

What the handshake actually covers is **out-of-band removal**, which is reachable and is in the
shipped code:

* `src/core/save.js:426` — `_applyRoster()` calls `sites.dispose(m)` on **live** machines that
  the loaded save does not contain. A load one second after a shot disposes a machine with
  fresh riders, with no 10 s of grace anywhere in it.
* any future route that takes a root out of the scene without the lifecycle (species teardown,
  region unload).

Three belts, unchanged in substance:

1. `arrows.stuckTo` records the host; `releaseOrphans()` recycles any arrow whose host is
   `_disposed`, root-less or unparented.
2. That runs on **`machine-disposed`** (emitted by `machine-ai`, payload `{kind, site}` — no
   machine handle, so the listener re-checks every stuck arrow rather than matching identity).
3. A 0.5 s sweep in the arrow update, for removals that emit nothing.

Plus `MAX_STUCK_PER_MACHINE = 8`: the oldest rider is recycled, so a quiver emptied into one
machine cannot park more than eight arrows.

`machine-ai` still needs to do nothing. `combat.arrows.releaseFrom(m)` is available if a lane
wants the same-frame release instead of the event.

## 4. Events

**None published, none consumed but one.** The lane *listens* for `machine-disposed`
(machine-ai). It emits nothing new — a memory pass that needed a new event to be correct would
be a design smell, and every other lane's contract with combat is unchanged.

---

## 5. `dispose()` — teardown only

`Combat.dispose()` releases every GPU resource combat owns: the five particle pools, the decal
pool (its scorch texture is lazily created and **ref-counted**, `acquireDecalTexture` /
`releaseDecalTexture` in `particles.js`), blast FX, the arrow / bomb / disc pools, the seven
weapon models, the trajectory line and land ring, the module-level arrow assets
(`disposeArrowAssets()`), the module-level weapon assets (`disposeWeaponAssets()`), and — because
`Traps` and `Melee` have no `dispose()` of their own and their files belong to the gameplay lane —
their roots too, through the same root list the audit and the fingerprint use, so the three can
never disagree about what "everything combat owns" means. If either class later grows a real
`dispose()` it is called first and this becomes a harmless second pass.

It is **single-shot and terminal**: it disposes module-level geometries and materials shared by
the weapon models and the spear, and sets `_disposed`, after which `Combat.update()` early-returns
and `memoryAudit()` reports zero everywhere. There is one `Combat` per session and nothing in the
game calls this; it exists because a system whose objects can only ever be *added* to the scene is
a system that can only ever be leaked, and because the gate proving the pools are bounded needs
the other end of the contract to exist.

### 5.1 The promise was false until fix round 1 — measured, and now gated

The paragraph above was written before anything tested it, and a judge measured it off by half:
of the resources reachable from `_ownedRoots()`, **57 of 112 geometries and 31 of 81 materials
survived `dispose()`**, while `renderer.info.memory.geometries` moved by only −11. Three causes,
all in this lane's files, all fixed:

| # | what leaked | count | cause | fix |
|---|---|---|---|---|
| 1 | bomb / disc projectile visuals | 42 geo + 14 mat | `makeBombVisual()` allocated a `Cylinder`/`Torus`/`Sphere` (or `Icosahedron`/2×`Torus`) **and a fresh `SpriteMaterial` per projectile**, in no shared-asset list; `BombPool.dispose()` only unparented the groups | the six part geometries and the two glow materials are module singletons in `arrows.js`, listed in `arrowAssets()`; `BombPool.dispose()` calls `disposeOwnedUnder()` for anything a projectile still allocates for itself |
| 2 | weapon-model buffers | 15 geo | `WeaponModel.dispose()` freed only meshes tagged `userData.ownGeo` by `bakeMesh()` — but five of seven models build meshes inline (the Recurve's `TubeGeometry` limbs, the Sling's `CapsuleGeometry` grip and `SphereGeometry` pouch, the Launcher's load disc), so it walked straight past them | it now asks *"is this shared?"* instead of *"was this tagged?"*: `disposeOwnedUnder(this.model, SHARED_SET)`. A tag can be forgotten by the next part somebody adds; a shared-set test cannot |
| 3 | `bow.js` module singletons | 15 mat + `unitCyl` | `WeaponModel.dispose()`'s own docstring said "`disposeArrowAssets()` owns the rest". It never did — not one bow material was in `arrowAssets()` | `weaponAssets()` / `disposeWeaponAssets()` exist in `bow.js` and are called from `Combat.dispose()`; `sharedAssets()` is now the union of both manifests |

**After:** 69 geometries, 100 materials, 4 textures tracked — **0 leaked**, all 148 roots detached,
`sceneObjects 148 → 0`, `live 54 → 0`. Gated by **A95** (§6).

The fix also removes 42 geometries and 12 materials from *boot*, since fourteen projectiles no
longer build private copies of six identical shapes.

### 5.2 `dispose()` used to throw inside the renderer

It also logged `TypeError: Cannot read properties of undefined (reading 'isReady')`, from three's
own `checkMaterialsReady` timer. `engine.js` `warmUp()` races `renderer.compileAsync(scene, camera)`
against a 20 s timeout; when the timeout wins the promise is abandoned but three's poll is **not**
cancelled — it re-arms a 10 ms `setTimeout` forever, reading
`properties.get(material).currentProgram` for every material it was handed. The first dispose of
one of those materials removes that property and the next tick throws, from inside a timer where
no `try/catch` of ours can see it and where the gate runner records a console error and fails.

`Combat._guardMaterialDisposal()` parks a satisfied stub program on each combat material as it
disposes: the abandoned poll reads "ready", drops the material, and once every straggler has gone
the same way it **resolves and stops polling**. Safe because the material is disposed — nothing
will render with it again. This is the same shim `machine-rig` needed for machine despawn
(`rig/lod.js` `guardMaterialDisposal`), written locally rather than imported across lanes. **The
real fix is a cancellable compile in `engine.js`** and remains a cross-lane request against
`core-platform`. A95 asserts the console stays clean for 2.5 s after teardown — ~250 turns of that
poll's timer.

---

## 6. Gates

`tools/gates.round4.combat-memory.mjs`. Ids A91–A95 were unregistered when the lane opened (the
highest in the merged suite was A90), so there is no `-lane` suffix and nothing collides.

| id | claim |
|---|---|
| `A91-combat-fx-bounded` | 60 shots across all eight ammo types add **zero** combat geometries, textures and scene objects; every pool stays inside its cap; the FX layer drains to zero on `clearFx()` |
| `A92-arrow-corpse-release` | three phases. **C (negative control, runs first)** re-parents live riders into `m.root` — the pre-fix shape — and requires combat's `dispose` listeners to FIRE (24 geometry + 40 material events), so a blind instrument fails the gate instead of passing everywhere. **A** kills a machine and runs the shipped lifecycle through `sites.advance(95, 1)` with the riders ~1 s old (`ridingAtDeath 8`): the wreck disposes, `riding/orphaned/detached/hosted/stray` all 0, and **zero** dispose events on combat's shared assets. **B** repeats it through the out-of-band `sites.dispose()` route (`save.js:426`) |
| `A93-combat-dom-bounded` | 60 shots + 10 kills allocate **zero DOM out of `src/combat/`** — proven by source attribution on every `createElement` in the window, not by a document-wide count — combat's overlay stays at an exactly constant node count, nothing combat makes is connected outside it, and every node the document *does* gain is attributed to the module that made it (§6.2) |
| `A94-combat-memory-return` | 60 shots + 10 kills: every combat-owned count (pools, arrows, traps, melee, DOM) returns to baseline within 30 s; global renderer/heap residue is reported and attributed rather than absorbed |
| `A95-combat-teardown` | `dispose()` fires a `dispose` event on **every** geometry, material and texture `ownedResources()` reaches — a per-resource listener, not a counter — detaches all 148 roots, drains `live` and `sceneObjects` to 0, and logs nothing for 2.5 s afterwards (§5.1, §5.2) |

### 6.1 No term in A91 or A94 is measured against wall time

The first cut of A91 asserted "nothing is live after a 20 s wait". That is a statement about the
*box*, not about the code, and it was caught being one: A91 passed alone with `liveTransient 0`
and failed inside the full suite with `liveTransient 5`.

The second cut excluded the decals (which age on combat's FX clock, step `min(0.05, realDt)`, so
below 20 fps they age slower than the wall) and kept asserting the rest at zero — with a comment
claiming "neither half has a clock in it". **That was false of the half it kept**, and a judge
measured it: `combat.js:904` feeds `arrows.update()` the *scaled, sub-stepped* `dt`, not the
`realDt` the decals get on line 789. Instrumented under suite load: arrow clock `wall 10.02 s /
dtSum 6.22 s = 0.62×`, decal clock `0.90×`. An arrow's 10 s taper therefore needs ~16 s of real
time, and the projectile term was *more* load-dependent than the decal term that had been removed
for exactly that reason.

**What is asserted now** (`overdue === 0`): no live projectile may be past its **own published
deadline** — `ARROW_FLY_LIFE 12` / `ARROW_STUCK_LIFE 10` / `BOMB_LIFE 10`, plus `OVERDUE_SLACK 1`,
all exported from `arrows.js` so the gate and the pool cannot drift. `liveTransient` and
`maxProjectileAge` are still *reported* in every detail, so the residue stays visible; they are
simply no longer load-bearing. The decals keep their two-stage form (inside their cap however many
are still fading, then drained to zero on command), and A94 got the identical edit — it was green
only because its wait was 30 s where A91's was 20 s, which is not a property of the code.

**Both directions measured** (port 5208, `shots/probe-clock.png`, `shots/probe-teeth.png`):

| scenario | arrow clock | `liveTransient === 0` (old) | `overdue === 0` (new) |
|---|---|---|---|
| 60 shots, arrow clock throttled to 0.34×, 20 s wall wait | `9.99 s dt / 29.04 s wall` | **26 — FAIL** | `0` — PASS (`maxAge 8.35`, under the 10 s deadline) |
| 10 shots, `_recycle()` disabled for stuck arrows (an injected retention) | normal | 10 — FAIL | **10 — FAIL** at t+12 s, still 10 at t+22 s |

So the new term ignores a slow box and still catches the failure the old one existed to catch.
`clearFx()` drained to `live 0` / `sceneObjects 148` in both runs.

### 6.2 A93 measures combat's DOM at the source, not the document's node count

Same disease as §6.1, different counter. A93's last term was `dDocumentNodes <= 8` — the delta of
`document.querySelectorAll('*').length` across the run. A judge re-ran the lane suite and it
failed at `+9`; across four samples of the identical workload on the same box the term ranged
from **-16 to +11**, a 27-node swing, with no combat code changing in between. The cause is in the
gate's own failing screenshot: the ten kills award XP, the XP levels the player, and a
"6 SKILL POINTS" callout plus whatever the HUD's pooled toast/quest DOM is holding at the final
snapshot are counted by `querySelectorAll('*')`. **That is `progression` and `shell-hud`'s node
lifecycle.** No tolerance on a shared counter can separate it from combat's, and widening the band
would only have made the gate quieter, not truer.

**What is asserted now.** `watchDom()` wraps `document.createElement` / `createElementNS` for the
duration of the window and tags every element with the first `/src/…` frame on the creating stack
— under the Vite dev server the gates run against, that is the owning module. Combat is then held
to facts no other lane can move:

- `combatCreated === 0` — no file under `src/combat/` allocated a single element during 60 shots,
  all eight ammo types, and 10 kills. A warm-up *outside* the window absorbs the one-time lazy
  builds (a weapon model and its canvas-built textures are made on first select), so a *per-shot*
  allocation still lands inside the window and still fails.
- `combatStray === 0` — nothing combat created is connected outside `#hzc-cfx`.
- `dCombatNodes === 0` — the overlay's own node count, unchanged from the old gate. It was never
  the flaky half.

This is strictly **stronger** about combat than `dDoc <= 8` ever was: it also catches a node combat
allocates and throws away, which no return-to-baseline count can see. The document as a whole is
still reported — decomposed per top-level container, per creating module, and split into
created-by-`createElement` vs parser-built (`innerHTML` never passes through `createElement`, so
those are attributed by where they live) — and its only assertion is a `DOC_CEILING` of 250, a
gross-runaway backstop far outside the measured cross-lane band.

**The instrument is self-tested every run, before the window.** A throwaway `CombatFeedback` is
constructed (combat code, so a combat frame is on the stack) and appended to the body; the control
watcher must see it as both created-by-combat and stray, or `instrumentOk` is false and the gate
fails. A gate whose detector quietly died would otherwise report zeroes forever.

**Measured, seven consecutive runs** — five isolated, one lane suite, one mixed slice that runs
A93 alongside the progression / shell-hud gates whose DOM was the noise (port 5208):

| run | `combatCreated` | `combatStray` | `dCombatNodes` | `instrumentControl` | `dDocumentNodes` | old `dDoc <= 8` |
|---|---|---|---|---|---|---|
| probe (pre-fix shape) | 0 | 0 | 0 | — | **+17** | **FAIL** |
| isolated 1 | 0 | 0 | 0 | 1 created / 1 stray | -19 | pass |
| isolated 2 | 0 | 0 | 0 | 1 / 1 | -17 | pass |
| isolated 3 | 0 | 0 | 0 | 1 / 1 | -1 | pass |
| isolated 4 | 0 | 0 | 0 | 1 / 1 | -11 | pass |
| isolated 5 | 0 | 0 | 0 | 1 / 1 | -6 | pass |
| lane suite (5/5) | 0 | 0 | 0 | 1 / 1 | +3 | pass |
| mixed slice with `A64-xp-loop`, `A66-quest-objectives`, `A71e`, `A71g` (5/5) | 0 | 0 | 0 | 1 / 1 | +3 | pass |

A clean run's document churn attributes as `/src/ui/hud.js` 72-102 elements created and
`/src/ui/quests.js` 46-47, of which 12-33 are still connected at the end — a pooled high-water
mark in two other lanes' files. **Zero from `src/combat/` in every sample.**

**Negative control** (`shots/probe-dom-negctl.png`), three windows in one page:

| window | `combatCreated` | `combatStray` | gate verdict |
|---|---|---|---|
| 6 shots, clean | 0 | — | **pass** |
| combat creates a node mid-window and keeps it connected | 1 | `/src/combat/feedback.js:div @ div#hzc-cfx-negctl-a` | **FAIL** |
| combat creates a node mid-window and discards it (invisible to any node-count delta) | 1 | — | **FAIL** |

**What these gates deliberately do not claim.** `renderer.info.memory` is a whole-process
counter: a kill also runs machine death FX, part tear-off, corpse fade and a site respawn, all in
`machine-ai` / `machine-rig` files. A91 makes its zero-growth claim on a combat-only workload; A94
runs the mandated 60-shots-plus-10-kills loop, asserts the combat-owned terms exactly, and
*reports* the global deltas so the residue stays visible and attributable.

What they do not claim about *other lanes'* residue is inventoried in §7.

---

## 7. Known non-combat residue, measured

Two things this lane cannot fix from inside `src/combat/`. Both are recorded here with numbers so
the orchestrator can route a one-line change rather than re-derive them.

### 7.1 `sites.dispose()` frees geometries and materials it does not own

`src/entities/machines/ai/sites.js:118-123` traverses `m.root` and calls `dispose()` on every
geometry and material under it, *before* `safeEmit(ctx, 'machine-disposed', …)` on line 145.
Combat no longer puts anything in that subtree (§3.1), so combat's own assets are now safe —
`A92` asserts **0** dispose events across a full reclaim, against a control that shows **24 + 40**
on the pre-fix shape.

What remains is not combat's but hits combat anyway: the wreck's **own** sprite (the eye glow)
is inside the traverse, and `THREE.Sprite` has **one module-level quad geometry shared by every
Sprite in the application**. So each reclaim still fires exactly **1** dispose on a buffer that
every arrow glow, every flame, and every other lane's sprite draws from (A92 reports it as
`combatAssetDisposals.sprite: 1`; it was 17 before the fix). Three re-uploads from the RAM copy
on the next frame, so this is churn, not corruption — but it is churn on every kill, forever.

The one-line fixes, either of which removes it, both in `sites.js` and neither in this lane:
emit `machine-disposed` *before* the traverse, or skip objects whose geometry/material is not in
the machine's own asset set (the function already computes exactly such a set — `protectedGeos()`
— for the shared species buffers).

**Why neither `renderer.info.memory` nor `gpuFingerprint()` can detect any of this**, measured:
`info.memory.geometries` moved by `-10` with the bug and `-10` without it (a second `dispose()`
of an already-freed geometry does not decrement twice, and three re-uploads within a frame), and
`gpuFingerprint()` moved by `0/0/0` either way — it is a cumulative set of *references*, and an
arrow still references the geometry that was just freed underneath it. A `dispose` listener on
`combat.sharedAssets()` is the only instrument that sees it, which is what A92 uses.

Same reason `ownedResources()` (and therefore **A95**) skips `o.isSprite` geometries: that quad is
shared with every other lane and is not combat's to free, so combat's teardown must leave it alone
and a gate must not demand a `dispose` on it.

### 7.2 A reclaimed wreck leaks one `boneTexture`

`sites.js` `dispose()` never calls `o.skeleton.dispose()`, so each reclaimed wreck keeps one
`boneTexture` uploaded (6 kills → textures 102; disposing those 6 skeletons by hand → 96). That
is `A90-memory-stability`'s `texGrowth 48`. Also a one-line fix in a file this lane does not own.

**A90 trend on port 5208**, for reference: heap `+26.5 %` (audit baseline) → `+11.2 %` → `A94`
now measures `heapGrowthPct 0.8` over its own 60-shot/10-kill loop with every combat-owned term
at 0 (`dSceneObjects 0`, `overdueAfter 0`, `liveAfterClearFx 0`, `orphaned 0`, `detached 0`,
`dCombatDom 0`, `poolOverCap []`).
