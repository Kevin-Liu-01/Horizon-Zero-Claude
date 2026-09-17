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
| `sharedAssets()` | `{geometries[], materials[], textures[]}` | the module-level singletons the projectile pools ride on, so a gate can put a `dispose` listener on each (§7) |
| `clearFx()` | — | park every live transient effect. Does **not** deallocate and does **not** touch placed traps |
| `dispose()` | — | full teardown. **Teardown-only and single-shot** (see §5) |
| `arrows.releaseFrom(machine)` | `freed:number` | drop every pooled arrow riding `machine` |
| `arrows.releaseOrphans()` | `freed:number` | drop every arrow whose host is `_disposed` / unparented |
| `arrows.audit()` | `{max, idle, fly, stuck, riding, orphaned, detached, inScene, hosted}` | `hosted` = pooled arrows that are **not** direct children of the scene; must be 0 (§3.1) |
| `bombs.audit()` / `discs.audit()` | `{max, fly, inScene}` | |
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
(`disposeArrowAssets()`), and — because `Traps` and `Melee` have no `dispose()` of their own and
their files belong to the gameplay lane — their roots too, through the same root list the audit
and the fingerprint use, so the three can never disagree about what "everything combat owns"
means. If either class later grows a real `dispose()` it is called first and this becomes a
harmless second pass.

It is **single-shot and terminal**: it disposes module-level geometries and materials shared by
the weapon models and the spear, and sets `_disposed`, after which `Combat.update()` early-returns
and `memoryAudit()` is meaningless. There is one `Combat` per session and nothing in the game
calls this; it exists because a system whose objects can only ever be *added* to the scene is a
system that can only ever be leaked, and because the gate proving the pools are bounded needs the
other end of the contract to exist.

---

## 6. Gates

`tools/gates.round4.combat-memory.mjs`. Ids A91–A94 were unregistered when the lane opened (the
highest in the merged suite was A90), so there is no `-lane` suffix and nothing collides.

| id | claim |
|---|---|
| `A91-combat-fx-bounded` | 60 shots across all eight ammo types add **zero** combat geometries, textures and scene objects; every pool stays inside its cap; the FX layer drains to zero on `clearFx()` |
| `A92-arrow-corpse-release` | three phases. **C (negative control, runs first)** re-parents live riders into `m.root` — the pre-fix shape — and requires combat's `dispose` listeners to FIRE (24 geometry + 40 material events), so a blind instrument fails the gate instead of passing everywhere. **A** kills a machine and runs the shipped lifecycle through `sites.advance(95, 1)` with the riders ~1 s old (`ridingAtDeath 8`): the wreck disposes, `riding/orphaned/detached/hosted/stray` all 0, and **zero** dispose events on combat's shared assets. **B** repeats it through the out-of-band `sites.dispose()` route (`save.js:426`) |
| `A93-combat-dom-bounded` | 60 shots + 10 kills leave combat's overlay at an **exactly constant** node count and the document back at baseline |
| `A94-combat-memory-return` | 60 shots + 10 kills: every combat-owned count (pools, arrows, traps, melee, DOM) returns to baseline within 30 s; global renderer/heap residue is reported and attributed rather than absorbed |

**The decal clock, and why two of these assert in two stages.** Decals age on combat's FX clock,
whose step is `Math.min(0.05, realDt)`, so below 20 fps the decal clock runs *slower* than the
wall clock: a 16 s scorch needs 16 s of wall time on an idle box and up to 32 s at 10 fps.
Asserting "nothing is live after a 20 s wait" therefore made the result depend on machine load.
A91 and A94 now assert the two halves that are actually about memory and have no clock in them —
everything that is not a decal has expired, the decals are inside their hard cap however many are
still fading, and then the whole FX layer drains to zero **on command**. That is strictly more
than the old form tested.

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

### 7.2 A reclaimed wreck leaks one `boneTexture`

`sites.js` `dispose()` never calls `o.skeleton.dispose()`, so each reclaimed wreck keeps one
`boneTexture` uploaded (6 kills → textures 102; disposing those 6 skeletons by hand → 96). That
is `A90-memory-stability`'s `texGrowth 48`. Also a one-line fix in a file this lane does not own.

**A90 trend on port 5208**, for reference: heap `+26.5 %` (audit baseline) → `+11.2 %` (fix round
1) → `A94` this round measures `heapGrowthPct 2.8` over its own 60-shot/10-kill loop with every
combat-owned term at 0.
