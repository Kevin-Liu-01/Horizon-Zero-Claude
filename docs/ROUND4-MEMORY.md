# ROUND 4 — lane `memory-attribution` (port 5208)

Kevin's top priority for this round: **the app crashed on memory twice.** Two gates were
still red on that and neither could say why, because both fail on an AGGREGATE:

| gate | reading at 5207 | the one term that failed |
| --- | --- | --- |
| `A90-memory-stability` | heap −7 %, geo +18, **tex +24** (bar 8), objs −490 | `renderer.info.memory.textures` |
| `A90-memory-stability-expansion` | heap +24.9 % (bar 25), geo +35, tex +31, objs +280 | `populationAudit().overBudget` |
| `A90-rig-reclaim` | geo +1, tex +1 | — (PASS: the rig reclaim was already clean) |

`renderer.info.memory.textures` is a whole-process counter and `populationAudit().nodes`
is a whole-roster counter. Neither names a module, and the round-3 verdict shows what
that costs: it read "+1130 scene objects after 30 kills", concluded corpse reclaim was
leaking, and was wrong — the reclaim was complete and the defect was a missing ceiling.

So this lane's deliverable is not another number. It is an **attribution**, and then the
fixes the attribution names. Everything below is measured on port 5208 and reproducible
with the gate.

---

## 1. `A90b-memory-attribution` — the instrument

`tools/gates.round4.memory.mjs`. Gate-side only: every hook is installed from the gate's
own assert and removed in a `finally`. **No file under `src/` carries instrumentation.**

### 1.1 Three instruments, because one is not enough

**(a) ALLOCATION — who constructed it.** three r169 sets `this.isTexture = true` /
`isBufferGeometry` / `isMaterial` / `isObject3D` as the first statement of each
constructor body (`three.module.js:2031, 10556, 9167, 7223` — instance assignments, not
prototype flags). An accessor defined on the PROTOTYPE therefore intercepts construction
itself: the setter records the allocation, then re-defines the flag as an own data
property on the instance, so every later read is the plain own-property read three
expects. Each record is keyed by the first `/src/` frame **and line** on the allocating
stack — against the Vite dev server the gates run on, that is the owning module. Every
`dispose()` is credited back to the module that allocated the object being disposed.
`Object3D.prototype.add` / `remove` are wrapped the same way, on a 20 000-call budget
because unlike a constructor they ARE on the frame path.

The `via` column that appears next to each owner is the frame the record was taken FROM,
which for a prototype-setter hook is the concrete class under construction — `Bone.set`,
`_TorusGeometry.set`, `DataTexture.set`, `SpriteMaterial.set`. It is a second, free axis:
"3 150 objects from `(no-src-frame)` via `Bone.set`" says the bulk of the scene-graph churn
is skeleton bones cloned inside three, not anything `src/` wrote a line for.

The prototypes are found by walking up from a live instance to the proto that OWNS a
known method (`traverse` / `setAttribute` / `setValues` / `updateMatrix`), never by
`constructor.name` — Vite's dev transform renames the classes (`_Object3D`, `_Texture`,
measured on this port).

This is `combat-memory`'s `DOM_WATCH` technique (`docs/ROUND4-COMBAT-MEMORY.md`) moved
from `document.createElement` to the four THREE constructors.

**(b) UPLOAD — because the failing counter does not count constructions.**
`info.memory.textures` is incremented when three first uploads a texture to the GPU
(`three.module.js:24825`) and decremented on dispose (`:24500`). Measured here: ten kills
CONSTRUCTED 11 textures and moved that counter by **+25**. Two thirds of what
`A90-memory-stability` fails on was never allocated inside its window at all. So the gate
replaces `info.memory.textures` and `.geometries` with accessors for its duration and
counts uploads and frees **separately**. A number that can move for two opposite reasons
has to be split before anyone can act on it.

**(c) REACHABILITY — the permanent-leak detector.** A texture that is uploaded and no
longer reachable from anything the app owns can never be disposed: three holds its GPU
memory until context loss and the counter never comes back down. The sweep walks the
scene, every donor model in `assets.models`, every machine's `_rigOwned` set and
`_lodChain`, `combat.ownedResources()`, every render target it can find, and every
subsystem three levels deep; it remembers where each texture was LAST SEEN and reports
the ones that have fallen out of all of them. `lastHolder` is the actionable half.

### 1.2 Teeth

The gate FAILS with `verdict: 'instrument-dead'` and reports nothing else unless, before
the measured window, the instrument sees its own control allocations: one texture, one
geometry, one material, one `Object3D`, one drive of three's upload counter, and three
disposals. A detector whose hooks silently came off must never report a clean table.

```
selfTest {"ok":true,"texturesSeen":1,"geometriesSeen":1,"materialsSeen":1,
          "objectsSeen":1,"texturesDisposedSeen":1,"uploadCounterSeen":1,"missing":[]}
```

### 1.3 The instrument's own bug, and the fix

The first cut classified **seven** correctly-reclaimed bone textures as
`collected-while-uploaded`. A texture that was disposed and THEN garbage collected is
indistinguishable from one collected without being disposed, once the object is gone —
`WeakSet`-by-identity cannot answer for an object that no longer exists. Disposal is now
tracked **by texture id**, which survives the object (`disposedTexIds`). An isolated
spawn → render → kill → dispose probe across eight species confirmed the reclaim was
clean all along (§2.1), which is what made the misclassification visible.

Stated plainly because it matters for how these tables are read: **the first version of
this instrument produced a false accusation.** It is the reason §1.2 exists.

### 1.4 No per-frame allocation

One `Error` per TRACKED ALLOCATION, never per frame, with `Error.stackTraceLimit` clamped
to 16 while installed. `Object3D.prototype.add` is the one hook on the frame path and it
runs on a hard budget that the report declares (`sampling.unattributed`). Samples are
`WeakRef`s behind a 24 000 cap, so the instrument can neither retain what it measures nor
grow without bound. Census walks are three on-demand snapshots, never in the loop.

---

## 2. The attribution table — before

30 kills, a Watcher spawned after each, the player walking between them, then the corpse
lifecycle at distance. Port 5208.

### 2.1 Textures

| owner | created | disposed | uploaded & held | via |
| --- | --- | --- | --- | --- |
| `/src/core/engine.js:195` | 30 | 20 | 11 | `DataTexture.set` ← `Skeleton.computeBoneTexture` |
| `(allocated before the window)` | 0 | 6 | 0 | |

**Only 30 textures were constructed in the whole window, every one of them a skeleton
bone texture built lazily by the renderer.** The counter moved +22 (49 uploads, 26
frees). The upload instrument then split the difference:

```
uploadWhen: { lateUploads: 18, lateByHolder: { "live-machine-root": 18 },
              newUploads: 9,  newByHolder: { "live-machine-root [boneTexture]": 9 } }
```

**18 of the ~22 were first-time uploads of textures that already existed at boot** —
donor maps on machines that nothing had drawn yet. `A90-memory-stability` was failing its
"textures ≤ +8" bar mostly on *the world being seen for the first time*.

That is also exactly why `A90-rig-reclaim` reads +1 on the same machinery: it runs a
warm-up cycle per species before it measures, so its baseline is already uploaded. Two
gates, the same build, different answers, and the difference was the baseline.

An isolated probe (spawn → render 1.4 s → kill → `sites.dispose`) across watcher,
strider, sawtooth, longleg, broadhead, snapmaw, scrapper and glinthawk:

| kind | skeletons | Δtex on spawn | Δtex on dispose | net | every boneTexture freed |
| --- | --- | --- | --- | --- | --- |
| watcher | 1 | +11 | 0 | +11 (first-ever donor upload) | yes |
| strider / sawtooth / longleg / broadhead / scrapper / glinthawk | 1–2 | +1 | −1 | **0** | yes |
| snapmaw | 2 | +2 | −1 | +1 | yes |

The rig reclaim was never the leak.

### 2.2 Scene objects

Zero. Every module's `attached` (still in the scene, not under a machine on the roster)
is **0**, and `detachedRetained` peaks at 7. Everything that remains is under a live
machine root — population, not leak, which is the distinction the expansion gate's
`nonMachineGrowth === 0` was already making and the round-3 verdict was not.

### 2.3 The container census — where the real retainers were

The generic half of the instrument counts every `Array` / `Map` / `Set` one and two
levels inside each subsystem, plus the event bus per type. Over the same 30 kills:

| container | Δ | verdict |
| --- | --- | --- |
| **`engine.csm.shaders`** | **+267** | LEAK — fixed, §3.1 |
| **`engine._csmMaterials`** | **+267** | LEAK — fixed, §3.1 |
| `audio._recent` | +239 | capped at 256, filling — not a leak |
| `progression.siteTuning` | +49 | LEAK — **handoff**, §5 |
| `progression.clearedSites` | +45 | grows with pending sites — **handoff**, §5 |
| `machines.squads.wrecks` | +12 | capped at 12 — not a leak |
| `machines.sites.sites` | +11 | one site per explicit spawn, never per respawn — expected |
| **`audio._machineLoops`** | **+7** | LEAK — fixed, §3.2 |
| `audio._loopChains` | +8 | capped at 8 — but 7 of 8 were stuck busy, §3.2 |
| `menus._log` | +3 | unbounded audit trail — fixed, §3.4 |
| `hud._tipSeen`, `audio._cueCounts`, `bank._cursor`, `music.transitions`, `nav._raw`, `npcs._routes` | +2…+12 | bounded by a fixed key set or an explicit cap |

### 2.4 The same census, after the fixes

Straight out of `A90b-memory-attribution`'s `containerDelta` on the same workload, run as
a registered gate rather than a probe:

| container | Δ before | Δ after |
| --- | --- | --- |
| `engine.csm.shaders` | **+267** | **−118** |
| `engine._csmMaterials` | **+267** | **−118** |
| `environment.csm.shaders` (same object) | +267 | −118 |
| `audio._machineLoops` | **+7** | **absent from the delta — 0** |
| `progression.siteTuning` | +49 | +52 — **still there, handoff §5** |
| `progression.clearedSites` | +45 | +48 — **still there, handoff §5** |

The two containers this lane could reach now SHRINK across a kill loop, which is the
right shape: machines die, their materials dispose, and the cascade bookkeeping lets go.

---

## 3. The fixes

### 3.1 `engine.csm.shaders` / `engine._csmMaterials` — 267 disposed materials retained

`src/core/engine.js`, `csmSetupMaterial()` / new `csmForgetMaterial()`.

`three/examples/jsm/csm/CSM.js` keeps `this.shaders = new Map()` **keyed by material**
(`CSM.js:46, :278, :282`), and this engine kept `_csmMaterials = new Set()` of the same
materials. Two strong containers, neither with a removal path.
`environment.js _registerScene()` re-traverses the scene on a timer and registers every
material it has not seen, so every machine that spawns puts ~9 materials into both — and
a machine that dies takes none of them out. `sites.dispose()` disposes the material and
the Map goes on holding it, with its maps, its uniforms and its cached shader object.

**+267 over 30 kills, monotonic, against a live scene whose material count was flat.** The
largest single retainer the attribution found, and unbounded in a normal session, not
just under a gate's workload.

The fix is the line upstream is missing: a material that disposes drops out of both.
`Material.dispose()` dispatches a `dispose` event, so the listener costs nothing per frame
and cannot be forgotten by a caller.

After: **`engine.csm.shaders` −118** over the same workload, measured by the gate (it now
shrinks as machines die).

### 3.2 `audio._machineLoops` — 7 dead machines retained, and 7 of 8 loop chains stuck

`src/audio/audio.js`, the throttled servo sweep in `update()`.

`_machineLoops` is a `Map` keyed by the MACHINE OBJECT, and the only thing that removed an
entry was `_syncServoLoop`, which is driven by `machines.list`. A machine that leaves that
list — the corpse lifecycle's `sites.dispose()`, or an eviction by the population budget —
is never visited again, so its entry, its `LoopEmitter` and its reserved chain stay put and
the Map holds the whole dead `Machine` (root, materials, skeleton, AI) for the session.
`machine-killed` covered the ordinary kill; nothing covered a disposal, which is every
kill once the wreck is reclaimed.

This is also an audible bug: the chain pool is 8, and seven of them were permanently
reserved, so a long session stops humming.

Swept off the CACHED loop array with a reused scratch list — no iterator, no closure, no
allocation — at 1.6 Hz. After: `audio._machineLoops` Δ **0**.

### 3.3 `engine.warmUp()` now warms GPU RESOURCES, not just programs

`src/core/engine.js`, new `warmUpTextures()`.

`compileAsync` builds programs. It does not upload textures: three uploads a texture the
first time a draw call binds it, and that is where `info.memory.textures++` happens. So
the counter climbed for minutes after boot as the player walked into parts of the world
nobody had drawn — the 18 late uploads of §2.1 — and every one of those frames paid for
its upload on the frame, the same class of hitch `warmUp()` exists to remove for shaders.

`warmUpTextures()` walks the scene, calls `renderer.initTexture()` on every texture a
material references, and builds each skeleton's bone texture up front
(`Skeleton.computeBoneTexture`, ~6 KB for a 70-bone rig) so a machine walking into view
does not allocate on the frame either. Idempotent, so the deferred re-run after the
variety models land costs only the traversal.

Measured timeline after the change:

| moment | `info.memory.textures` | skinned meshes with a bone texture |
| --- | --- | --- |
| `__READY__` | 124 (was 91) | — |
| `warm-up-complete`, +580 ms | 167 | 141 of 141 (was 47 of 141) |
| +4 s | 167 — flat | 141 |

The counter is now honest from the first frame. `lateUploads` went **18 → 0**.

### 3.4 `menus._log` — unbounded audit trail

`src/ui/menu.js`. `audit()` only ever publishes `slice(-16)`; the array itself grew
forever. Capped at 64.

### 3.5 The population ceiling is now a ceiling — `A90-memory-stability-expansion`

`src/entities/machines/index.js`, `update()`.

`_recycleForBudget` ran in exactly one place: the top of `spawn()`. That makes it a check
on the way IN, and there are two ways the population goes over budget without a `spawn()`
call to catch it:

1. `sites.update()` respawns a site on its own clock — it calls `_spawnCls` directly, so
   nodes arrive with no `spawn()` on the stack.
2. A spawn that WAS checked could not find a victim. The eviction rule is deliberately
   conservative — never the authored roster, never inside 35 m, and inside 120 m only if
   the machine is calm and off camera — so during a fight, with the player standing in the
   middle of everything he has just alerted, nothing qualifies and the overshoot is simply
   kept. Nothing ever looked again.

**Which of the two was it? Both terms are honest — with numbers.** At 5207 the failing run
ended with the roster SHRUNK 39 → 29 and its node count GROWN 2428 → 2708 against a 2568
budget, `recycled: 10`, `wrecks: 0`, `nonMachineGrowth: 0`. Nothing was holding a dead
machine's nodes: `wrecks: 0` and `orphanRoots: 0` say the reclaim finished. The roster
really did shrink AND really did cost more, because the loop replaces mixed 62-node
machines (grazer, broadhead, strider…) with 110-node Watchers. A smaller roster can cost
more nodes, which is precisely why the ceiling is counted in NODES — and why it has to be
re-checked over time rather than at the door.

So: not a retention bug, a ceiling that was only enforced on entry. The budget check now
also runs from `update()`, throttled to 2 s. `_recycleForBudget` returns 0 immediately
when the population is under budget — which is every frame of a normal session, since at
boot `nodes === bootNodes` and the budget is `bootNodes + headroom` — so the steady-state
cost is one `_machineNodes()` traversal every two seconds and no behaviour change at all.
Wrecks are never evicted (`if (!m.alive …) continue`) and the authored roster is never
evicted (`site.id <= _bootSiteId`), so `A43-corpse-lifecycle` and the doctrine gates are
untouched by it.

---

## 4. Heap — was the +24.9 % real?

**No. It was never measured.** Every heap gate in this repo is written as
`if (window.gc) window.gc();` before it samples `performance.memory`, and `window.gc`
only exists behind `--js-flags=--expose-gc`, which `tools/gates.mjs` never passed. The
guard silently skipped, no collection ran, and the number each gate reported as "the heap
after a forced GC" was the heap INCLUDING everything the workload had just made garbage.
Two of those gates print `'n/a (enable --enable-precise-memory-info)'` in their own detail
string — the previous round asking for this flag and unable to reach the runner.

`tools/gates.mjs` `LAUNCH_ARGS` now passes `--js-flags=--expose-gc` and
`--enable-precise-memory-info`. Neither flag changes what the build does; they change only
what the runner is allowed to observe.

With two forced GCs and a beat between them, across the same 30-kill workload:

| run | heap Δ |
| --- | --- |
| before the fixes, GC forced | **−0.3 %** |
| after §3.1/§3.2, GC forced | **−5.4 %** |
| after §3.3 as well, GC forced | **−3.7 %** |

The heap is flat-to-falling across the workload. The +24.9 % was uncollected garbage
being read as growth.

---

## 5. Handoffs — findings in files this lane may not edit

### 5.1 `progression-expansion` (port 5213) — `src/core/progression.js`

**`this.siteTuning` (progression.js:863) grows once per `machine-disposed` and is never
pruned per site.** `_tuneSiteRespawn(siteId)` (progression.js:1856) does
`this.siteTuning.set(siteId, {...pol, at, kind})` on every disposal; the only removals are
the wholesale `this.siteTuning.clear()` at :2337 and :2998 (reset / load). The
`machine-respawned` handler at :2559 deletes from `clearedSites` but **not** from
`siteTuning`, so the entry for a site that has already repopulated stays for the session.

* measured: **+49 entries over 30 kills** (`A90b-memory-attribution` container census,
  port 5208), against `clearedSites` +45 on the same run.
* per-entry cost is small (one plain object of 4–5 fields), so this is a slow leak, not a
  crash cause — but it is monotonic in a metric that tracks kills, and nothing bounds it.
* proposed dispose path: in the existing `on('machine-respawned', ({ site }) => …)`
  handler at progression.js:2558, add `this.siteTuning.delete(site)` next to the
  `clearedSites.delete(site)` that is already there. The tuning is only read while a site
  is pending, so nothing else needs to change. (If the ledger is wanted for the world map
  after a respawn, cap it instead — but it is currently written and never read back after
  the respawn lands.)

No other live-lane file (`src/combat/melee.js`, `src/entities/playerAnimator.js`,
`src/entities/anim/*`, `src/world/props.js`, `props/**`, `camp.js`, `fauna.js`,
`terrain.js`, `vegetation.js`, `water.js`, `save.js`, `ui/quests.js`, `skills.js`,
`dialogue.js`) appears as a grower in the census. `camp._restHookedOn.*` and
`camp.crowd._routes` in the table are aliases of `progression` and `npcs` respectively,
not camp's own state; `npcs._routes` is a route cache keyed by route NAME and is bounded
by the named routes.

---

## 6. Results

### 6.1 The two red gates, at their CODED bars — no bar moved, no tolerance added

First clean run after the fixes, port 5208 (`shots/gates/report.p5208.json`):

```
[PASS] A90-memory-stability            heap +1.4 %  geo +33  tex -18  objs -431
                                       (bars: heap < 25 %, geo <= 40, tex <= 8, objs <= 60)
[PASS] A90-memory-stability-expansion  objGrowth -541  nonMachineGrowth 0  orphanRoots 0
                                       heap +0.9 %  populationAudit.overBudget false  failures []
[PASS] A90-rig-reclaim                 geo +1  tex 0   (unchanged by this lane's work)
```

The texture term went from **+24 against a bar of 8** to **-18**: `warmUpTextures()`
moved the first-draw uploads behind the loading bar, so what A90 now measures across its
window is only what the workload itself allocates and frees — and the workload gives back
more than it takes, because the roster shrinks under the population ceiling.

The expansion gate's `overBudget` went false with `recycled: 19` (was 10) and
`nodes 1887 <= budget 2568` (was 2708 > 2568): the periodic ceiling re-check reclaimed the
surplus once the player left, which the door-only check could never do.

### 6.2 Five consecutive runs of each, same tree, same box

`GATES=... N=5` over `node tools/gates.mjs --port 5208 --only <the three gates>`; each
run boots a fresh page, and the box was carrying the other fifteen lanes' suites
throughout.

**`A90-memory-stability`** — bars: heap < 25 %, geometries <= +40, textures <= +8,
scene objects <= +60.

| run | verdict | heap % | geo | tex | objs | ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | −0.3 | +33 | −18 | −430 | 312 721 |
| 2 | PASS | −6.1 | +15 | −18 | −429 | 317 250 |
| 3 | PASS | −8.3 | +34 | −18 | −431 | 314 268 |
| 4 | PASS | −6.4 | +33 | −18 | −431 | 314 312 |
| 5 | PASS | −5.6 | +15 | −19 | −580 | 327 124 |
| | **5/5** | −8.3 … −0.3 (mean −5.3) | **+15 … +34** (mean 26) | −19 … −18 | −580 … −429 | |

**`A90-memory-stability-expansion`** — bars: scene objects <= +600,
`nonMachineGrowth === 0`, `orphanMachineRoots === 0`, heap < 25 %, population not over
its node budget.

| run | verdict | objGrowth | nonMachine | orphanRoots | heap % | nodes / budget | recycled | roster |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | −1311 | 0 | 0 | +0.8 | 1117 / 2568 | 26 | 17 |
| 2 | PASS | +9 | 0 | 0 | −1.6 | 2437 / 2568 | 14 | 29 |
| 3 | PASS | −101 | 0 | 0 | −2.6 | 2327 / 2568 | 15 | 28 |
| 4 | PASS | −1311 | 0 | 0 | −1.8 | 1117 / 2568 | 26 | 17 |
| 5 | PASS | −541 | 0 | 0 | −5.6 | 1887 / 2568 | 19 | 24 |
| | **5/5** | −1311 … +9 | always 0 | always 0 | −5.6 … +0.8 | never over | 14–26 | 17–29 |

**`A90b-memory-attribution`** — bars: zero unreachable GPU textures, and no owner holding
> 4 textures / > 20 geometries / > 20 objects that nothing can reach.

| run | verdict | offenders | unreachable textures | late uploads | Δtex | Δgeo | heap % | `csm.shaders` Δ | `_machineLoops` Δ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | 0 | 0 | 0 | −22 | +14 | −2.1 | −118 | 0 |
| 2 | PASS | 0 | 0 | 0 | −20 | +20 | −2.9 | −102 | 0 |
| 3 | PASS | 0 | 0 | 0 | −21 | +18 | −6.8 | −110 | 0 |
| 4 | PASS | 0 | 0 | 0 | −23 | +4 | −5.3 | −126 | 0 |
| 5 | PASS | 0 | 0 | 0 | −24 | +12 | −10.0 | −134 | 0 |

**The tightest margin in the whole set is `A90`'s geometry term: +34 against a bar of
+40, and it swings +15…+34 run to run.** Everything else clears by a wide margin or is
negative. That term is not a leak — §2 attributes the whole geometry delta to live
machines' merged part meshes and it is disposed with them — but it is the one number in
this lane that could go red on an unlucky run, and it is the one to watch. The variance
tracks how many machines the population ceiling happened to recycle during the loop
(roster 17–29 across the five expansion runs), which is also why `objGrowth` swings
−1311…+9 without any of it being retention.

---

## 7. Honest gaps

* **`A90b`'s cadence is not `A90`'s.** A90 spends 150 s on its kill loop and 150 s of wall
  clock waiting out the corpse lifecycle. A90b runs the same thirty kills at a tighter
  cadence and drives the lifecycle through `sites.advance()` — the hook
  `A43-corpse-lifecycle` and `A90-memory-stability-expansion` already use — so a diagnostic
  that every lane's suite now runs costs ~100 s instead of ~330 s. A90 remains the bar;
  A90b is the microscope. Their counters are cross-checked in §6 and agree in sign and
  rough magnitude, but a defect that only appears at A90's slower cadence would be caught
  by A90 and missed by A90b.
* **The geometry bar is the weakest of the three.** Raw `undisposed` over-counts badly
  for geometries: `shells.js` / `parts.js` build primitive geometries purely to feed
  `mergeGeometries` and then drop them — 510 of them in one run — and those are never
  uploaded, so they cost no GPU memory and disposing them would be meaningless. A90b
  therefore blames an owner only on `heldUnreachable` (allocated in the window, never
  disposed, and no longer findable by the reachability sweep). That is the right SHAPE,
  but the sweep is a whitelist of the places this repo keeps resources, so a module that
  invents a new off-graph cache the sweep does not know about would have its live
  contents counted as unreachable — a false accusation in the other direction. The exact
  term would be per-owner attribution of `renderer.info.memory.geometries`, and three
  exposes no per-geometry upload flag to hang that on the way `__webglInit` does for
  textures.
* **`heldUnreachable` is why the raw per-owner numbers in §2 look alarming and are not.**
  The same run ends with 8 undisposed bone textures and 27 undisposed merged part
  geometries — every one of them belonging to a machine that is ALIVE at the end. A bar
  on raw `undisposed` calls a population a leak, which is precisely the round-3
  misattribution. Both quantities are reported side by side so nobody has to take the
  gate's word for which is which.
* **`Object3D` has no `dispose()`**, so "leaked object" is defined here as *reachable AND
  (in the scene but not under a machine on the roster, OR detached and still held)*. A
  module that keeps a live machine alive forever would show as population, not as a leak;
  that case is `populationAudit()`'s, and it is now enforced (§3.5).
* **Bone-texture creation at warm-up costs ~900 KB of VRAM up front** (141 skeletons,
  ~6 KB each) that was previously spread over the session. That is a deliberate trade: the
  memory was always going to be spent, and paying for it behind the loading bar is what
  makes the counter honest and removes the first-draw hitch.
* **The `via` column depends on Vite's dev build.** Against a minified production bundle
  the first `/src/` frame does not exist and every owner would read `(no-src-frame)`. This
  is a dev-server instrument by construction, like `DOM_WATCH` before it.

---

## 8. Reproducing any number in this document

```
node tools/gates.mjs --port 5208 --only A90b-memory-attribution      # the attribution table
node tools/gates.mjs --port 5208 --only A90-memory-stability         # the core bar (~5.5 min)
node tools/gates.mjs --port 5208 --only A90-memory-stability-expansion
```

`A90b`'s `detail` carries every table quoted above: `byOwner.{textures,geometries,
materials,objects}`, `containerDelta`, `gpuFlux`, `uploadWhen`, `orphanedTextures`,
`textureHolderDelta`, `sceneGraphCalls` and `sampling` (which declares whether any
allocation went untagged). The reports are written to `shots/gates/report.p5208.json`.
