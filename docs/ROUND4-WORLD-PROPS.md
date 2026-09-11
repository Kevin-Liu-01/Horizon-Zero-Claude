# ROUND 4 — `world-props`: landmarks, settlement, activity sites, wildlife

Owner: `world-props` (port 5211).
Files: `src/world/props.js`, `src/world/camp.js`, `src/world/fauna.js` (new),
`src/world/props/*.js` (new, this lane's directory).

This document is the **contract**. Everything below is a `ctx` surface or an event another
lane may read; nothing here requires an edit to another lane's file.

---

## 1. `ctx.props` — landmarks, ledges, activity sites

`Props` is constructed inside `Vegetation` and registers **itself** on `game.systems`
(idempotent), so it ticks without a `main.js` edit.

```js
ctx.props.landmarks        // [{ id, name, x, z, height, bearing }]  8 entries
ctx.props.sites()          // [{ kind, id, x, z, name, done }]  datapoints/caches/override/hunting
ctx.props.datapoints       // [{ id, x, z, y, title, text, index, found }]  12 entries
ctx.props.trials           // [{ id, name, text, complete }]  3 entries
ctx.props.revealed         // true once the Tallneck override node is used
ctx.props.ledges           // climbable grab edges, see §2
ctx.props.ledgeNear(x, y, z, maxDist = 2.5)   // nearest ledge record | null
ctx.props.megaMeshes       // the merged megastructure meshes (frustum-cullable units)
ctx.props.tallneck         // { base, neckTop, landing, disc, colliders() }
ctx.props.rockworks        // { ledges, colliders(), hollowMouth }
ctx.props.fauna            // === ctx.fauna, see §5
ctx.props.colliderCount    // primitives this lane handed to ctx.collision
```

### Landmarks (`world-11`)

| id | name | x, z | height | bearing from camp |
|---|---|---|---|---|
| `span` | The Span (collapsed viaduct) | -102, 165 | 30 m | NW |
| `core` | The Core (sheared tower) | 235, 105 | 52 m | E |
| `hangar` | The Hangar (stripped rib cage) | 85, -198 | 33 m | S |
| `mast` | The Relay Mast (+ felled twin) | -250, 15 | 46 m | W |
| `pylons` | The Pylon Line (3 towers, 1 down) | -155, -182 | 31 m | SW |
| `stack` | The Cooling Stack (torn flank) | -198, -28 | 34 m | W |
| `tanks` | The Tank Farm (4 riveted tanks, 1 down) | -34, -196 | 26 m | S |
| `dish` | The Ground Station (22 m reflector) | -205, 30 | 28 m | W |
| `gantry` | The Container Yard (portal crane) | 185, 5 | 30 m | E |
| `tallneck` | Tallneck (26 m disc, slow sweep) | -25, 220 | 46 m | N |
| `lookout` | Nora Lookout (timber watch-post) | 52, 66 | 14.2 m | NE |

**Four of these exist because V34's number passed while its picture did not.**
`stack` came first: the mast is 250 m out and under a degree wide, and a ridge
60–120 m west hides anything shorter than 27 m at 200 m, so the west fan scored zero.
Then the contact sheet was read rather than the JSON, and three more holes showed:

* **south** passed on 24 rays, every one of them at the extreme right edge of the
  frame (the pylons, bearing 214°); the hangar answers at 154°, the extreme left.
  The middle of the south vista was a bald meadow → `tanks`.
* **west** had the mast at dead centre (269°) and it may as well not have been there —
  a lattice tower's members are 26 cm across and the haze eats them → `dish`, a
  single curved 22 m surface that holds an edge against the sky.
* **east** was green on `rockworks-stacks` — a **cliff**. The audit asks for "a man-made
  or landmark silhouette", and the only built thing in that frame was the 14 m lookout
  at 85 m → `gantry`.

Worst-bearing landmark rays went **24 → 62** with all four bearings now answered by a
built structure. The same read produced the concrete palette change in `kit.js`
(`paintConcrete` was near-white under this sun and dissolved into the rim at 200 m).

---

## 2. Verticality — `world-16`, the `world-props` half

Three real landforms the heightfield cannot express (one height per x,z means no
overhang): **the Stacks** (13 m cliff band, 3 benches, 96/120), **the Arch** (19 m span
you can walk under, 188/-118), **the Hollow** (cave mouth, -166/118). All three are
meshes in their own group and are registered as `cliff` / `arch` / `cave` colliders —
blocking, occluding, camera.

`player-control` owns traversal, so this lane publishes **data**:

```js
ctx.props.ledges  // [{ id, x, y, z, nx, nz, width, topY, from:{x,y,z}, to:{x,y,z} }]
ctx.props.ledgeNear(x, y, z, maxDist)   // allocation-free, nearest edge segment
```

`y` is the grab height, `(nx,nz)` the outward face normal, `topY` the stand height on
top, `from`/`to` the two ends of the edge so a mantle can pick the nearest point along
it. 6 ledges today (3 cliff benches, 2 arch piers, 1 hollow shelf).

---

## 3. Activity sites — `ctx.interactables`, events

Registered through the existing `ctx.interactables` registry (E-hold prompt, loot popup,
Focus glow all work unmodified). Registration is deferred to the first frame that finds
`ctx.interactables`, because `Props` is built before it.

| site | label | n | event |
|---|---|---|---|
| — (owned by `focus-items`) | `DATAPOINT` | 12 of 24 | `datapoint-collected` → `datapoint-found` |
| `cache` | `SUPPLY CACHE` | 6 | `supply-cache` `{id, loot}` |
| `override` | `OVERRIDE` | 1 | `override-node` `{id, x, z, reveals:[...]}` |
| `hunting-ground` | `HUNTING GROUND` | 1 | `hunting-ground` `{id, trials}` |
| `carcass` | `SKIN` | live | `fauna-killed` / `fauna-looted` (§5) |

Every entry carries `entry.site`, so `focus-items` can branch on it without string
matching a label. `progression` is called optionally throughout
(`ctx.progression?.award?.({xp, reason, id})`, `?.discover?.(id)`) — nothing breaks if
that module is absent.

**Datapoints belong to `focus-items`, not to this lane** (FIX ROUND 1). This lane used to
register twelve `DATAPOINT` interactables of its own with its own mote mesh and its own
event, beside the twelve `src/items/datapoints.js` ships — 24 pickups of the same kind, of
which only half could ever reach the Notebook, which counts `datapoint-collected`. The
twelve now go through the hook that module publishes for exactly this purpose:

```js
ctx.items.datapoints.place({ id, title, category, author, body:[text], x, z, y })
```

so there is one system, one pedestal InstancedMesh, one Focus reveal pass and one Notebook
of **24**. What this lane still owns at those sites is the half-buried rusted casing; the
record's pedestal is placed 0.98 m off it on a golden-angle bearing so the two do not
interpenetrate. `activities.motes` is hidden the moment all twelve are adopted — it and the
local `interactables` entry are the fallback for a build with no `focus-items`.

- `datapoint-found` `{id, title, text, index, total, found}` is still raised, now for **all
  24** records (this lane re-raises it off `datapoint-collected`), so
  `playerAnimator.js`'s interact beat fires on every one instead of on half of them. 25 XP
  per record is awarded here, once per id, because nothing else in the build awards it.
- `override-node.reveals` is `activities.revealList()` — the whole unified set.
- `focus-items` sized its pedestal InstancedMeshes for its own twelve plus eight spare
  slots and `place()` returns `null` rather than growing. This lane needs twelve, so
  `Activities._ensureStoreCapacity()` widens those two meshes from the outside (same
  geometry, material, parent and flags; only capacity changes), guarded so that it becomes
  a no-op the day `focus-items` widens the reservation itself. **If that lane ever changes
  `_buildMeshes` to reserve 12+, delete `_ensureStoreCapacity` — nothing else depends on
  it.**

---

## 4. `ctx.camp` — the settlement (`world-12`)

```js
ctx.camp.firePosition     // Vector3 (unchanged) — progression's REST & SAVE anchor
ctx.camp.npc              // the Varl anchor Object3D (unchanged contract)
ctx.camp.npcs             // 6 anchors, .userData.npc = { id, name, pose, ... }
ctx.camp.npcLandmarks     // per-NPC pose probes (gate V35 compares these)
ctx.camp.huts             // [{ id, x, z, baseY, roofY, kind }]  6 structures
ctx.camp.structures       // huts + the two Round-2 tents, 8 entries
ctx.camp.gate             // { x, z, a, r, topY } — the main gate + its walkway
ctx.camp.palisadePosts    // 496
ctx.camp.brazierLights    // [{ light, base, y, phase }]  2 shadow-free PointLights
ctx.camp.settlement.palisadeRadius(a)   // wall radius at bearing a (radians)
ctx.camp.settlement.gateAt(a)           // the gate record at bearing a, or null
await ctx.camp.restAtFire(toHour = 6.2) // rest: progression.rest, else env.rest + heal
```

**Campfire.** `progression` registers its own `REST & SAVE` entry on `firePosition`;
`camp._ensureCampfire()` only registers one when, four frames in, the live registry has
no `REST` entry within 4.5 m — so whichever module boots first wins and the player never
sees two prompts. In the shipped build progression always wins, and its `onInteract` only
**opens** the campfire panel: the sleep happens later, when `ui/quests.js`'s
`REST UNTIL DAWN` button calls `progression.rest(6.2)` directly.

Event: `camp-rest` `{hour}`, raised **after the clock has moved**, on every path.
`Camp._hookProgressionRest()` wraps `progression.rest` once (a published method on a
published module, wrapped from this lane's file — no edit to another lane's file), falling
back to progression's `banner` `RESTED` event if `rest` is ever absent. That is the fix for
a Round-1 judge finding: the emit used to live inside `Camp.restAtFire()`, which the
shipped build never calls, so a documented event fired for nobody. **Gate
`A61b-camp-rest-event` now drives the real DOM button and asserts exactly one
`camp-rest`** — one, so a future fix cannot pass by emitting twice.

**NPC idles, and the honest limit.** `public/models/npc.glb` has **0 bones, 0 skinned
meshes, 0 animations** (measured on port 5211) — it is a static mannequin, so `anim-core`
has nothing to write to and D3 forbids importing a new non-commercial humanoid. The six
idles are therefore (a) per-NPC **vertex poses** from a small arm/head/spine joint rig
applied at build time, and (b) a **GPU idle layer** — per-vertex `aIdle`/`aIdleW` plus one
shared `uNpcTime` uniform — that sways, breathes and swings all six independently out of
**one merged mesh per material**. Six characters therefore cost exactly what the single
Round-2 mannequin cost. If a skinned humanoid ever lands, swap `props/npcs.js` for a
`ClipLayerSet`; the roster and anchors do not change.

**Collision.** Every settlement mesh lives under `hunter-camp`, which
`collision.seedWorld()` already walks per mesh into triangle-exact `MeshBVH` colliders.
The palisade therefore blocks and occludes for free, and its two gate openings are real
holes. Hanging cloth (`camp-banners`) and ground decals (`camp-paths`) own their own
`raycast`, which is the signal the seeder uses to skip them — a door curtain is not a
door.

---

## 5. `ctx.fauna` — wildlife (`world-15`)

Three species, one `InstancedMesh` each (36 animals, 3 draws + 3 shadow draws). Gait is a
vertex-shader layer keyed on per-instance phase/amplitude, so a herd runs out of one mesh
and a standing animal's legs are still.

```js
ctx.fauna.census()                    // { boar, fox, grouse, *-dead, total, kills }
ctx.fauna.nearest(x, z, maxDist)      // nearest LIVE animal | null
ctx.fauna.hitscan(ox,oy,oz, dx,dy,dz, far)   // shared record { hit, animal, distance, x,y,z } | null
ctx.fauna.damageAt(x, y, z, radius, amount, opts)  // -> animal | null
ctx.fauna.damage(animal, amount, opts)             // -> true when it died
```

| species | n | flee radius | flee speed | loot |
|---|---|---|---|---|
| `boar` | 12 | 13 m | 7.2 m/s | `boar-hide`, `fatty-meat` ×2, `bone` |
| `fox` | 8 | 19 m | 9.4 m/s | `fox-pelt`, `lean-meat` |
| `grouse` | 16 | 10 m | 6.6 m/s | `bird-feather` ×3, `lean-meat`, `bone` |

Crouching halves the distance at which an animal notices you. A hit spooks every animal
within 25–32 m. A carcass registers a `SKIN` interactable; once looted it fades and the
species restocks.

**Animals stay out of the stealth grass, and that is a visibility fix, not a mood.**
A boar stands 0.9 m at the bristle ridge; `world-ground`'s tall grass is taller. A herd
grazing in a stealth band is 36 animals rendering every frame that nobody can see, hunt
or loot — measured on port 5211, the nearest boar to the camp was invisible at 18 m.
`_standable(x, z, openOnly)` now rejects `terrain.tallGrassDensity > 0.3` for the first
18 of 32 spawn tries, and `_roamHeading` samples three candidate headings and walks the
one whose 7 m lookahead is thinnest. Both run at spawn / on a graze→walk transition, not
per frame. Grazers crop short sward in the open anyway, so the truthful placement and
the legible one are the same placement.

**Fixed here:** the boar's `PALE` constant was the string `'#9a8straight'` — mangled, and
therefore unparseable by `THREE.Color`, which warns once and leaves the colour WHITE.
The boar's belly, saddle and whole snout were rendering pure white. A `console.warn` is
not an error and no gate samples an animal's pixels, which is why it survived a round.

**Also fixed: the boar was a balloon.** Shot from four metres with the player model
hidden, it had no head. The trunk ran to `z = 0.65` while the head sat at `z = 0.66`
with a 0.22 m radius, so head, snout, tusks and ears were all INSIDE the body sphere,
and the front/rear taper was 24 % — invisible at any range. The trunk now peaks in width
at the shoulder (`f = 0.72`) and necks down on both sides; the head is stretched 1.45x
along z at `z = 0.72` so it stands 0.48 m proud of the neck, a jowl ties the two
together, and the snout carries the profile to `z = 1.33` — a 1.9 m adult sow with a
readable hump, bristle ridge and tusks.

Events: `fauna-alerted` `{species, id, x, z}`, `fauna-killed`
`{species, name, id, x, y, z, loot, source}`, `fauna-looted` `{species, id}`.

### Request to `combat`

`ctx.hitHulls` only carries the machine roster, so arrows cannot hit an animal through
the shipped path. Rather than edit `src/combat/**`, this module **reads**
`ctx.combat.arrows.list` (never writes it) and sweeps each flying arrow's segment for the
frame against the animal capsules; `arrow-hit` and `melee-hit` are also handled as a
backstop. The clean version, whenever `combat` wants it, is one line in `sweepSegment`:

```js
const f = ctx.fauna?.hitscan(a.x, a.y, a.z, dir.x, dir.y, dir.z, len);
if (f && f.distance < out.dist) { out.dist = f.distance; out.animal = f.animal; }
```

### Request to `audio`

`playAt('fauna/<species>/death', pos, opts)` is called on a kill and returns `false`
today (no such set in the bank). Sets worth having: `fauna/boar/death`,
`fauna/fox/death`, `fauna/grouse/death`, plus `fauna/<species>/alert` for the bolt.

---

## 6. Gates

`tools/gates.round4.world-props.mjs` — the audit's three (`A61-colliders-registered`,
`V34-midground`, `V35-settlement`) plus two added in FIX ROUND 1 to hold the two defects
a judge found, neither of which any gate was watching: `A61b-camp-rest-event` and
`A61c-datapoints-unified`. All five ids are this lane's own (checked against every
registered id in `tools/gates.config.mjs` and `tools/gates.round4.*.mjs`; none collide, so
none needed a `-world-props` suffix). All five are **action** gates: they still write a
labelled frame for the eye, but the verdict is a measurement (identity-matched collider
registry + swept-capsule palisade probe; a 1775-ray fan per bearing with prop **and**
terrain occlusion; a dusk frame rendered twice with the braziers extinguished and diffed;
a real DOM click on the campfire button; pickup identity against the record store).

```
[PASS] A61-colliders-registered  total 3684 · 41 candidate meshes, 0 unregistered
                                 trees 1520/1520 · rocks 300/300 · palisade 55/55 sealed · both gates open
[PASS] V34-midground             yaw 0: 77 rays (span) · yaw 90: 64 (stacks) · yaw 180: 84 (tanks)
                                 yaw 270: 72 (dish) · worst 64, bar 20
[PASS] V35-settlement            8 structures, 6 roofed huts, 473 posts, 6 NPCs
                                 min pose delta 0.359 · 19 023 brazier-lit px (peak +227) · idle delta 5.18
[PASS] A61b-camp-rest-event      1 REST entry (progression's, adopted) · clicked REST UNTIL DAWN
                                 hour 21.5 -> 6.2 · hp 40 -> 100 · camp-rest: 1 from the UI, 1 from restAtFire()
[PASS] A61c-datapoints-unified   24 pickups = 24 store records · 0 strays · 0 local fallbacks
                                 this lane 12/12 in the store · mote mesh hidden · notebook 0 -> 1/24
5 gates: 5 pass
```

`A61b` asserts **exactly one** `camp-rest`, from both the UI button and `restAtFire()`, so
neither a dead emit nor a double emit can pass. It snapshots and restores `localStorage`,
because resting writes a real save and a gate must not hand one to whatever runs next. It
waits on the **event**, not on a stopwatch: `environment.rest` fades over ~2 s of wall
clock, and its first draft's fixed 2.8 s sleep passed alone and failed inside the full
suite (clock read mid-fade, then the control rest started on top of the one still in
flight and counted its late event twice). Re-verified green three times standalone and
once against six busy cores — 24 s to 50 s of real time for the same assertions.
`A61c` matches every `DATAPOINT` interactable against the store **by record identity**, not
by label, so a second datapoint system cannot come back wearing the same name.

### One honest limit

No bar was moved and no existing gate was edited; the two FIX-ROUND-1 ids are additions.
`V34`'s bar is still `>= 20` landmark rays per bearing — it was not raised to match the
measured 64, because the bar's job is to catch a REGRESSION on the thinnest bearing, and a
bar set at today's best number fails the first time a tree grows in front of something.

---

## 7. What this lane costs, measured — for `core` and `world-ground`

`A9-perf-budget` is red on this tree. It is **not** red because of anything added here,
and the numbers are worth publishing because no other lane can see them from inside its
own module. All measured at the default spawn (camera 8 m from the fire), port 5211:

| set hidden | triangles drawn | draw calls |
|---|---|---|
| nothing (baseline) | 5 266 398 | 297 |
| this lane's six groups | 2 976 580 | 175 |
| `vegetation` | 3 165 138 | 221 |
| both | 876 756 | 100 |

`renderer.info.render.triangles` accumulates **every pass**, shadow cascades included, so
the ~3.4x between static geometry and drawn triangles is the CSM cascade count. Static
totals: `vegetation` 2611k, `terrain` 535k, **`hunter-camp` 492k**, `world-props` 130k,
`world-fauna` 31k, `world-activities` 3k.

**The three landmarks added this session are 0.34 % of the frame** — 18 064 of 5.27 M
drawn triangles and 5 of 297 calls. Hiding them and showing them again moved the frame
rate 12.7 → 15.5 → 16.1 fps, i.e. the wrong way, i.e. below the noise floor.

**Where this lane's cost actually is: the six NPCs are 445k of the camp's 492k static
triangles — 74k per background villager.** `public/models/npc.glb` is a hero-detail
character (Accessories 25k, material 15k, Clothes 14k, Body 8.5k, Drapes 4.7k, Hair 4.4k,
Innereye 2.1k, each x6), and D3 kitbashing means there is no decimated LOD to swap to.
Cutting it needs either a build-time decimation pass in `tools/` or an authored low-poly
villager — both above this lane's line, both worth doing. Nothing was cut here on the
guess, because every candidate sub-mesh is visible on a standing NPC at conversation
range and `V35` is the gate that would have hidden the damage rather than caught it.

**One caveat for whoever acts on `A9`.** Its fps half is a wall clock on a box running
sixteen lanes. Inside a SINGLE page, same scene and same camera, five consecutive 2.2 s
samples read 11.6, 0.1, 29.6, 49.8 and 36.8 fps. The gate's own PENDING guard (null frame
≥ vsync ⇒ blame the scene) sampled a quiet moment and so returned FAIL. The triangle and
draw-call counts above are counters, not clocks, and are the numbers to act on.
