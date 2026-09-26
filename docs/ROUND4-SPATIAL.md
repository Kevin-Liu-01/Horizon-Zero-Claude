# ROUND 4 — `spatial` lane: collision, navigation, hit hulls

Owner: `spatial`. Files: `src/core/collision.js`, `src/core/nav.js`, `src/core/hitHulls.js`
(all new). New dependency: `three-mesh-bvh@0.9.14` (peer `three >= 0.159`, we ship r169).

This lane publishes three `ctx` services and edits **nothing** else. Everything below is
what the other lanes call. Findings closed: `perf-tech-01`, `perf-tech-13`,
`machine-ai-01` (broadphase + navgrid), `machine-ai-04`, `machine-ai-13` (query side),
`camera-feel-03`, `camera-feel-09`.

---

## 0. Bring-up — `core-platform` action required

`main.js` is owned by `core-platform`. Two lines, immediately after `ctx.machines`:

```js
import { installSpatial } from './core/collision.js';
// ...
ctx.machines = this._add(new Machines(ctx));
installSpatial(ctx);            // creates ctx.collision / ctx.nav / ctx.hitHulls
```

`installSpatial(ctx, opts?)` builds the static collider set immediately (~47 ms: 867
blocking/occluding colliders + 560 query-only canopy volumes + BVHs, so
`count()` reads 1427 static, 1451 once the 24 live machine capsules are
synced), pushes itself onto `game.systems`, and then does the rest lazily —
the 2 m navgrid is time-sliced over ~15 frames and machine hit hulls are extracted one
machine per frame. Call it while the loading bar is still up and none of that is visible.

If `core-platform` prefers `this._add(...)`, `installSpatial` returns
`{ collision, nav, hitHulls, system }`; register `system` yourself and it will not
double-register. Until the two lines land, every `spatial` gate brings the lane up itself
via a dynamic import (see `tools/gates.round4.spatial.mjs`).

**Gate merge**: this lane's gates live in `tools/gates.round4.spatial.mjs` exporting
`GATES` in the same shape as `tools/gates.config.mjs`. `core-platform` merges
`tools/gates.round4.*.mjs` into the runner.

---

## 1. `ctx.collision` — static world, spatial hash, occluders

Every collider is a **capsule**, **sphere**, **yaw-box**, or a **three-mesh-bvh
`MeshBVH`** over a static mesh, bucketed into a uniform 8 m XZ grid. Queries walk only
the cells they touch and allocate nothing.

### What is already registered (seeded from the scene at install)

Every collider carries **three independent flags**, and they are not the same
question: `blocking` (does it stop a capsule), `occluder` (does it break a machine's
line of sight), `camera` (must the lens stay out of it). `camera` defaults to
`blocking` — pass it explicitly whenever the two differ.

| kind | n | shape | blocking | occluder | camera |
|---|---|---|---|---|---|
| `tree` | 560 | vertical trunk capsule, r from the geometry base ring × instance scale, 7 m tall | yes | yes | yes |
| `rock` | 300 | sphere from the instance bounding sphere | only when world r ≥ 0.6 m | same | same |
| `ruin` | 3 | `MeshBVH` on the merged `world-props` meshes | yes | yes | yes |
| `tent` | 4 | `MeshBVH` on the `hunter-camp` meshes | yes | yes | yes |
| `canopy` | 560 | sphere over the foliage mass, **query-only** | no | no | no |
| `machine` | live roster | horizontal capsule, dynamic, `bodyRadius + 0.55` | yes | no | **no** |
| `machine-cam` | live roster | the same axis at the true `bodyRadius` | **no** | no | **yes** |

Machines carry **two** capsules on purpose — see §2 "Machine colliders and the
standoff". The gameplay one is padded so walking into a machine cannot shove it; the
lens must not inherit that pad, so it gets its own unpadded capsule and the padded one
is `camera: false`. Both go dark when the machine dies (a wreck is walkable and the lens
may sit inside it while you loot).

`canopy` volumes block nothing and occlude nothing — they exist so
`player-control` / `world-ground` can ask "is the lens inside foliage?" and fade
it, which is the correct fix for standing under a pine (no boom length can get a
chase camera outside a 2.5 m skirt). Query them with
`sphereQuery(x, y, z, r, out, (c) => c.kind === 'canopy')`.

Skipped on purpose: grass/bush/flower instances, `gather-nodes` (you step over herbs),
anything whose world AABB is under 0.3 m tall (ground decals, coal glow), and any mesh
whose material has `depthWrite:false` (FX shells).

### API

```js
ctx.collision.register({ kind, object|shape, blocking, occluder, dynamic, ref }) // -> id | id[]
ctx.collision.unregister(id | id[])
ctx.collision.count(kind?)            // A61's number
ctx.collision.census()                // { tree: 560, rock: 300, ... }
```

`object` may be a `Mesh` (one BVH collider) or an `InstancedMesh` (one collider per
instance, sharing the BVH). `shape` is an explicit primitive:

```js
{ type: 'capsule', a: [x,y,z], b: [x,y,z], radius }
{ type: 'sphere',  c: [x,y,z], radius }
{ type: 'box',     c: [x,y,z], half: [hx,hy,hz], yaw }
```

**`world-props`**: register your megastructures, Tallneck, lookout, palisade and huts
here as you build them — `register()` is additive and idempotent per call, so the seed
above and your registrations coexist. Prefer explicit `shape` primitives for anything
you can describe with one; they are ~40× cheaper to query than a triangle BVH.

### Queries

```js
ctx.collision.moveCapsule(pos, prev, velocity, radius, height, dt, opts?)
// THE character-vs-world step. Swept substepping + depenetration + the
// contact brake, in one call. This is what player-control calls — see §4.

ctx.collision.resolveCapsule(pos, radius, height, opts?)
// the depenetration primitive underneath it. Pushes `pos` (feet) out of every
// blocking collider; mutates pos. One pass, NOT swept — on its own it tunnels
// at low frame rates, so prefer moveCapsule for anything that moves fast.
// returns the SHARED record { hit, depth, nx, ny, nz, collider } — copy what you keep.
// opts: { axis: 'xz' | 'xyz' (default 'xz'), passes (default 3), filter(collider) }

ctx.collision.capsuleCast(from, to, radius, height, opts?)
// swept: { hit, t, x, y, z, nx, ny, nz, collider, distance }

ctx.collision.segmentCast(a, b, opts?)      // nearest surface a->b
ctx.collision.raycast(ox,oy,oz, dx,dy,dz, far, opts?)  // same, unit direction
// opts: { radius (inflate for a sphere-cast), occluderOnly, filter }

ctx.collision.sphereQuery(x, y, z, r, out?, filter?)   // colliders overlapping
ctx.collision.occluded(a, b, opts?)          // bool — machine LOS, see §2
ctx.collision.cameraBoom(pivot, desired, out?, radius?) // see §4
```

**Y policy.** The terrain heightfield still owns vertical motion, so `resolveCapsule`
pushes in XZ by default, and mesh triangles whose *world* normal is within ~44° of
vertical (floors, tent roofs, ground decals) are ignored. Pass `{ axis: 'xyz' }` when
`player-control` gets real gravity and wants to stand on a ledge.

Measured: `resolveCapsule` 1.3 µs, `occluded` over a 56 m segment 6.3 µs, `raycast`
against a merged ruin BVH ~4 µs.

---

## 2. For `machine-ai`

### Occlusion (`machine-ai-04`, `stealth-los-terrain-only`)

`Machine._hasLOS(target)` currently samples only the heightfield. Add the prop layer:

```js
_hasLOS(target) {
  // ... existing 3-sample terrain march, unchanged ...
  const C = this.ctx.collision;
  if (C) {
    _eye.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    _tgt.set(target.x, target.y + 1.2, target.z);
    if (C.occluded(_eye, _tgt)) return false;
  }
  return true;
}
```

`occluded()` tests trunk capsules, big-rock spheres and the ruin/camp BVHs, and skips
knee-high scatter. One call per machine per perception tick is well inside budget
(6.3 µs at 56 m; the current roster is 24 machines). Pass `{ mesh: false }` to skip the
triangle colliders if you ever need it cheaper.

### Navigation (`machine-ai-01`)

```js
ctx.nav.ready                       // false while the grid is still building
ctx.nav.path(from, to, out?, opts?) // [Vector3, ...] (string-pulled) | null
ctx.nav.steer(pos, dir, out?, opts?)// unit XZ direction, whiskers applied.
                                    // Omit `out` and you get a SHARED vector
                                    // (no per-frame alloc) — copy to keep.
                                    // Passing the same vector as `dir` and
                                    // `out` is supported (see below).
ctx.nav.blockedAt(x, z) / costAt(x, z)
ctx.nav.flowField(target, radius=60)// { dirAt(x, z, out) } — cached, for herds/packs
ctx.nav.buildNow()                  // force the time-sliced build (tests/teleports)
ctx.nav.audit()                     // { ready, cells, blocked, open, buildMs, ... }
```

Grid: 2 m cells over a 332 m radius (333×333 = 110,889 cells). `cost === 0` is
impassable; 1..250 is terrain cost from slope, river silt and standing water. Cells are
blocked by slope > 45°, the r > 324 m rim, pool footprints, and every static blocking
collider stamped with a 1.2 m agent pad (merged prop meshes are stamped **per triangle**,
and only where the surface stands ≥ 0.6 m clear of the ground, so river cobbles and floor
slabs stay walkable). 79,505 cells open, 71.7 % of the grid.

Recommended use in the engage/patrol layer:

```js
// long haul: repath when lastKnown moves > 6 m or every ~1.5 s, never per frame
if (!this._path || this._repathT <= 0) {
  this._path = ctx.nav.path(this.position, this.lastKnown) || null;
  this._node = 0; this._repathT = 1.5;
}
// per frame: follow the current leg, then let the whiskers dodge what the grid missed
_want.subVectors(this._path[this._node], this.position).setY(0);
ctx.nav.steer(this.position, _want, _want, { radius: this.bodyRadius, look: 6 });
this._moveToward(this.position.x + _want.x, this.position.z + _want.z, speed, dt);
```

A 200 m path costs 0.3–1.4 ms, so budget one repath per machine per second, staggered.
`steer()` costs ~7 raycasts (~20 µs) and is safe per frame. The grid is built for a
1.2 m agent; a Thunderjaw (`bodyRadius` 4) should rely on `steer({ radius: 4 })` for the
final clearance, and a Scrapper (0.7) will simply have a slightly conservative grid.

### Machine colliders and the standoff

`installSpatial` registers **two** dynamic capsules per living machine each frame on the
same axis `position ± heading·standoffHalfLen`:

| kind | radius | role |
|---|---|---|
| `machine` | `bodyRadius + 0.55` | blocks the player; `camera: false` |
| `machine-cam` | `bodyRadius` | camera only; `blocking: false` |

The 0.55 m pad is deliberate: `Machines.update()` shoves a machine away from the player
below `bodyRadius + 0.6`, so keeping the player's 0.4 m capsule out at
`bodyRadius + 0.95` means a sprinting player never triggers that shove even after a
dropped frame — the machine stays put and the player is the one who stops (gate A25:
machine displacement 0.000 m). If `machine-ai` later wants machines to shove the player
deliberately (a charge, a tail sweep), do it as an explicit impulse rather than by
lowering the pad. Set `installSpatial(ctx, { collision: { machineColliders: false } })`
to turn the registration off.

**The pad is a gameplay standoff, not geometry, and it is kept out of the lens
volume.** Until Fix Round 2 the padded capsule was also a camera collider (because
`camera` defaults to `blocking`), which pushed the boom back 0.55 m before the metal:
measured on port 5202, a 4.20 m boom read 1.33 m at 2 m clear of a Watcher's hull where
the silhouette justifies 1.88 m, and near a Thunderjaw it hit the 0.45 m floor early.
`machine-cam` fixes that; gate **A25c-camera-vs-machine** pins both halves (the lens is
still pushed out of a machine, and it is pushed out *at* the metal), and reports
`padWasCosting` = 0.55 m for both species.

### The melee approach term (lane `player-melee`, Round 4)

*Recorded here because the ownership grant that allows it requires it:
`docs/ROUND4-AUDIT.md` §4, "Grant extended again Sep 25 (round 4)". The code is
`Collision._meleePad` and `Collision._meleeStandoff` in `src/core/collision.js`; the
term is owned by `player-melee`, not by this lane.*

**What it is.** While `ctx.combat.melee` has the spear drawn AND has selected a machine
as its approach target (`melee._scanApproach`, the same ±50° wedge the hit resolve uses),
**that one machine's** blocking capsule is reduced:

| term | normally | melee target |
|---|---|---|
| pad on the radius | `machinePad` 0.55 | `APPROACH_PAD` 0.32 |
| standoff half-length | `m.standoffHalfLen` | `max(0.35 · L, L − 1.02)` |

> **FIX PASS 1 (Sep 25) — the pad was 0.20 and that was a bug, not a floor.** See
> "Why the floors are what they are" below and gate `A106-melee-approach-immovable`:
> at 0.20 the collider's own radius and the machine manager's push radius were the
> *same number*, so a walking player with the spear drawn shoved a frozen Watcher
> **2.38 m** across the field (0.000 m holstered). The pad is 0.32 now — the equality
> plus a 0.12 m loaded-box frame of travel — and the 0.12 m of reach is handed back on
> the same axis by the segment cut (0.66 → 0.78), plus a further 0.24 m of the same end
> cap (→ 1.02) so the blade lands on beats whose tip is not aimed straight down the
> midline. On a Watcher the cut now floors at `0.35 · L` = 0.5465 m and she stands
> **2.15 m** from the centre with **0.85 m** of daylight to the `bodyRadius` shell.

Every other machine, and every machine at every other time, is untouched — `machinePad`
for general movement is **unchanged**, which is the condition the grant sets.

> **FIX PASS 2 (Sep 25) — and "untouched" was true of the TIME and false of the FIELD.**
> Round 4 and fix pass 1 wrote the shortened half-length straight into
> `m.standoffHalfLen`, and this section said "every machine at every other time is
> untouched", which is exactly the claim a judge checked. **Three consumers read that
> same field as the machine's real geometry, and none of them wants a melee approach term
> in it:**
>
> | reader | expression | with the spear holstered | with it drawn (before the fix) |
> |---|---|---|---|
> | `strider.js:298` | `bodyRadius + standoffHalfLen + 0.8` — charge hit test, and `damagePlayer(24, reach + 0.8)` | 2.287 m | **2.003 m** |
> | `behemoth.js:251` | `bodyRadius + standoffHalfLen + 0.9` — the same, snout half-length | 5.800 m | **4.780 m** |
> | `melee.js:1576` | `MELEE.silent.range + standoffHalfLen + 1.0` — the Silent Strike prompt radius | 3.437 m | 3.153 m |
>
> i.e. **drawing the spear shrank the charge that was about to hit her.** The term is now
> published as its own field, `m.meleeStandoffHalfLen`, and read by exactly ONE consumer —
> `machines/index.js`'s push loop, which *has* to agree with the player capsule or A25
> breaks (`const L = m.meleeStandoffHalfLen ?? m.standoffHalfLen ?? 0`). The machine's own
> `standoffHalfLen` is never written. The one-line read in `machines/index.js` is the only
> edit this term makes outside `collision.js`, and it is flagged as a cross-lane touch in
> `docs/ROUND4-PLAYER-MELEE.md` §0fp2.
>
> **There is no pad that avoids needing the manager to agree**, and the arithmetic says
> so rather than the author: she stands at `L' + bodyRadius + pad + 0.40` from the centre,
> so her distance from the manager's FRONT sphere (still at the uncut `L`) is
> `bodyRadius + pad + 0.40 − MELEE_L_CUT`, and keeping that outside `bodyRadius + 0.6`
> would need `pad ≥ 0.20 + 1.02 = 1.22 m`, more than twice `machinePad`.
>
> **Gated**, so it cannot regress silently: `A106-melee-approach-immovable` grew a second
> clause (`reachRows`) that reads a Strider's and a Behemoth's charge reach holstered, then
> again with the term demonstrably live, and fails unless they are bit-identical. On this
> build: Strider `chargeReachDeltaM` **0.000000** (2.287111 → 2.287111) with the term
> cutting 0.2841 m; Behemoth **0.000000** (5.800000 → 5.800000) with the term cutting
> 1.02 m; `standoffDeltaM` 0.000000 on both. The row is void unless `termLive` and
> `termCutM > 0.01`, so it cannot pass by the term never firing.

**Why it exists.** Measured on port 5205: a Watcher's blocking capsule is
`standoffHalfLen` 1.5615 swept either side of the centre and inflated by `bodyRadius`
0.9, so with `machinePad` 0.55 and the player's own 0.4 m radius she is held **3.41 m**
from its centre head-on. Her spear's blade tip at the contact key was **1.80 m** ahead of
her root (measured off the posed rig — the arm is at full extension at contact, and
authoring the wrist goal further forward buys nothing, the IK simply falls short). The
blade therefore finished **0.32–0.98 m short of the nearest hull surface on every landed
hit**, while `reference/spear-light-strike.jpg` — the still the lane is judged against —
has the blade *on* the machine's head.

The 1.5615 m half-length is not the machine. It is
`max(size.x, size.z) · 0.5 − bodyRadius` off the **animated** bounding box, which for a
Watcher is 4.92 m: the box that contains its legs at full spread. The capsule's end cap
is about a metre of empty air in front of the sculpt, and that cap is the whole reach
shortfall. The term eats the cap.

**Why the floors are what they are.**

* **`APPROACH_PAD` 0.32 m.** `Machines.update()` shoves a machine whenever the player's
  *position* is within `bodyRadius + 0.6` of a standoff sphere, while this capsule holds
  her position at `bodyRadius + pad + 0.4` from the segment. The shove therefore fires
  iff `pad < 0.6 − 0.4 = 0.20`, for every machine, independently of its `bodyRadius`.
  **Round 4 shipped the pad AT 0.20 and described that as the floor. It is the equality,
  which is not a margin:** the manager runs against her position *after* the move, a
  walking player penetrates the swept capsule by up to one frame of travel before the
  solve pushes her back out, and the push then fires on every forward frame and
  integrates. Measured by the round-4 film judge — spear drawn, 4 s of KeyW into a frozen
  Watcher 5 m ahead — the **machine** moved 2.382 m and 2.355 m, worst single-frame push
  0.0568 m, against 0.000 m with the spear holstered. 0.32 is the equality plus 0.12 m,
  one frame of loaded-box travel (5.5 m/s at 45 fps), which is the same margin
  `machinePad`'s own comment claims for the general case. Gated: the melee lane's
  `A106-melee-approach-immovable` walks her into a frozen machine with the spear drawn and
  with it holstered and asserts 0.000 m of machine displacement on both, with
  `approachFrames > 0` so the drawn row cannot pass by the term never engaging. Measured
  on this build: Watcher 0.0000 m / 0.0000 m, Strider 0.0000 m / 0.0000 m.
* **The segment is published as `m.meleeStandoffHalfLen`, and the manager's push loop is
  its only reader (fix pass 2).** `Machines.update` reads a field on the machine, not this
  collider. If only the collider shrank, every melee approach would shove the machine —
  precisely the failure `machinePad` exists to prevent, and no pad avoids it (see the
  arithmetic above). So the manager reads
  `m.meleeStandoffHalfLen ?? m.standoffHalfLen ?? 0` and everything that reads the
  machine's GEOMETRY — strider/behemoth charge reach, the Silent Strike prompt radius —
  keeps `standoffHalfLen`, which this term never writes. Nothing is cached and nothing has
  to be restored: the machine's own value is read fresh every frame and the published term
  is simply withdrawn (`null`) on the frame the machine stops being the melee target, or
  on the frame it dies.
* **`max(0.35 · L, …)`.** The cut is absolute, tuned on the quadruped that needed it; on
  a machine whose whole standoff is shorter than the cut it would collapse the capsule to
  a sphere about the centre and let the player stand beside a flank. A third of the
  segment always survives. **Fix pass 1: the cut is 1.02 m**, which on a Watcher means the
  floor is what binds (0.5465 m of 1.5615). 0.12 m of the increase pays the pad back; the
  other 0.24 m is the rest of the same end cap, and the measurement that asked for it is
  that with the cut at 0.78 m light-1's contact tip (char 0.15, 1.05, 1.86) read **+0.23 m
  short** of the nearest hull surface while light-2's (−0.43, 1.13, 1.72) read **−0.02 m
  inside** it: a Watcher's idle hull is not symmetric about her aim, so a reach budget that
  only works for a thrust down the midline is not a reach budget.

**The bound, measured rather than claimed.** Gate `A103-melee-contact-sync` publishes two
numbers at the instant the blade lands:

* `playerToShell` — her capsule against the machine's own `bodyRadius` shell, the surface
  `machinePad` stands off from. **0.85–0.99 m** across every run on the fix-pass-1 build
  (1.09–1.42 m before the segment cut grew). This is the clause the gate fails on; it is
  exact, not sampled.
* `playerToHullAtHit` — her capsule against the live 295-capsule hit hull, sampled along
  her own axis. **0.05–0.24 m**. A hit hull is not the sculpt: it is a set of generously
  inflated damage volumes whose *limb* capsules sweep, and on a quadruped those are what
  is nearest a player standing at spear range. It is gated at −0.10 m and reported every
  run so the range is visible.

With the term in, `A103`'s reach clause (blade tip to nearest hull surface at the hit
frame ≤ 0.15 m) reads **−0.040 to −0.123 m** on all FOUR beats — light 1, 2, 3 and the
heavy, which fix pass 1 added as a fourth row after the film judge showed the heavy alone
was stopping 0.08–0.23 m short and was ungated. The blade lands *inside* the hull, which is
what the reference still shows. (The lane
then gave 0.089 m of blade back: `melee.js SPEAR_SCALE` 0.86 → 0.80, a 1.48 m haft, because
the reach the term bought was what had been forcing the spear to stay longer than the stowed
carry wanted it to be. The readings above are with the shorter haft.)

---

## 3. For `combat` — hit hulls (`perf-tech-01`)

The shipped aim path is `Raycaster.intersectObject(machine.root, true)` per frame per
candidate machine. Measured in this repo, against the Thunderjaw's single
188,630-triangle skinned mesh: **124–370 ms per ray**. That is the 4 fps.

```js
ctx.hitHulls.raycast(ray, opts?)         // nearest hull across the roster
ctx.hitHulls.raycastMachine(m, ray, far?, opts?)   // one machine
ctx.hitHulls.build(machine)              // idempotent; also amortised 1/frame
ctx.hitHulls.warmExact(machine)          // pre-build the exact-refinement BVHs
ctx.hitHulls.hulls(machine)              // descriptors, for the Focus part list
ctx.hitHulls.debugHulls(machine)         // wireframe capsules in the scene
ctx.hitHulls.audit()                     // { sets, hulls, queries, tests, ... }
```

`ray` is anything with `{ origin, direction }` (a `THREE.Ray`, `Raycaster.ray`, or a
plain object); the direction must be unit. `opts`:
`{ far, machines, includeDead, ignore, exact }`.

The returned record is **shared** — copy anything you keep:

```js
{ hit, machine, hull, part, object, name,
  distance, x, y, z, nx, ny, nz, point (Vector3), normal (Vector3) }
```

`object` is a real node inside the machine subtree (the part holder when a component was
struck), so it is drop-in for `Machine.takeDamage({ point, object, ... })` — the existing
`userData.part` walk-up resolves the component, and `point` still feeds the weak-point
sphere test. `name` is the bone or mesh name plus a cell index, which is what
`focus-items` needs for `ui-10` part labels.

### The swap `combat` should make

```js
// src/combat/combat.js  _updateAimPoint(): keep the terrain march, then replace the
// whole `for (const m of machines) { ... intersectObject ... }` block AND the
// AIM_MAGNET fallback with one call
const h = ctx.hitHulls.raycast(_ray, { far: best });
if (h) { this.aimPoint.copy(h.point); return; }
this.aimPoint.copy(cam.position).addScaledVector(_camDir, best);
```

**The magnet is no longer needed — but be precise about why.** The hull silhouette is
*wider* than the sculpt, not equal to it, and that is what absorbs the neck-gap misses
`AIM_MAGNET` was papering over. Measured by gate **A23b-hull-fidelity**, which fires a
121-ray fan per species in the machine's own heading frame and cross-checks **every one
of them** against a real skinned-mesh raycast (~970 reference rays a run, 47 s):

| quantity | measured | bar | what it means |
|---|---|---|---|
| median surface error | 0.14–0.51 m per species | ≤ 0.5 m (0.6 m over 10 m span) | where a hull hit lands vs the sculpt |
| **proud**, p90 pooled over ~480 rays | **0.69–0.82 m** | ≤ 1.15 m | the capsule skin sits *in front of* the metal by this much |
| proud, worst single ray | up to 3.1 m (Thunderjaw tail) | — | grazing tangents on the longest bones |
| coverage gaps (sculpt hit, hull missed) | 0–2 of 121 per species | ≤ 4.9 % | the direction that loses you a shot |
| hull hits with **no sculpt** behind them | ~150 of 970 | — | ~15–20 % of a fan that straddles the silhouette by design |
| …of those, distance **outside** the machine's own world AABB | **0.00 m** at the p90, max 0.10 m | p90 ≤ 0.3 m, max ≤ 1.15 m | they thread gaps between plates and limbs; none is off the machine |

The honest claim is therefore **"tighter than the magnet"**, not "a little proud": a
hull hit can sit up to ~0.8 m (p90) in front of the metal, against 1.15 m of
unconditional snap-to-body-centre that ships today, and every over-covering ray still
lands inside the volume the machine occupies. Every sculpt hit is matched: 0–2 of 121
rays per species miss.

**`{ exact: true }` cannot refine a skinned species.** The refinement re-tests the
winning capsule's own mesh with a triangle BVH, and `_exactT` (src/core/hitHulls.js)
only accepts an **unskinned** node — refitting a skinned BVH per frame is the cost this
module exists to avoid. So on the Watcher, Sawtooth, Behemoth, Thunderjaw, Strider,
Scrapper, Glinthawk and Longleg *bodies*, an impact point is capsule-accurate (the p90
above) and there is no way to pull it back onto the true surface; only detachable
component meshes and other unskinned props refine. If `combat` needs a decal exactly on
the metal, push the point back along the hit normal by the p90 for that species, or ask
`machine-rig` for per-part unskinned proxies.

**Cost**: one full-roster query is 1.7–6.6 µs plus a refresh of whichever machine the
ray reaches (hull counts, after the Fix Round 2 cell refinement: Glinthawk 47, Strider
73, Watcher 103, Scrapper 118, Longleg 164, Sawtooth 433, Thunderjaw 1507, Behemoth
1609). Extraction is ~250 ms across all eight species, amortised one machine per frame. Keep it to **one query per frame** for the aim ray. For the
impact resolve (once per arrow, not per frame) pass `{ exact: true }`: that re-tests the
winning capsule's own unskinned mesh with a triangle BVH and returns the true surface.
Call `ctx.hitHulls.warmExact(machine)` once (e.g. on first engagement) so the BVH build
does not land inside a combat frame. Skinned hulls stay capsule-accurate by design —
refitting a skinned BVH every frame is exactly the cost this module exists to avoid.

Arrows and `_pointBlankHit` can use `raycastMachine(m, ray, far)` for a single-machine
segment test instead of `intersectObject`.

---

## 4. For `player-control` — capsule, boom, and two shims to delete

### Collision (`camera-feel-09`)

Call **`moveCapsule`**, not a bare `resolveCapsule`. Add one field to the player
(`this._prevPos = new THREE.Vector3(NaN, NaN, NaN)` — a non-finite seed tells the first
call to seed itself), then inside `Player.update()`, after
`this.position.x/z += velocity * dt` and after the terrain height damp:

```js
_opts.wish = this._wishDir();                 // module scratch, not a literal
const r = ctx.collision.moveCapsule(
  this.position, this._prevPos, this.velocity, 0.4, 1.8, dt, _opts);
this.moveSpeed = r.speed;   // distance she ACTUALLY covered / dt
```

That is the whole integration. `moveCapsule` owns three things you would otherwise have
to reimplement, and **A24 measures this exact call** — the demo shim in §"Delete these
two" does nothing but call it:

1. **Swept substepping.** `Player.update()` applies a whole frame of motion in one shot,
   so at 20 fps a sprint is a 0.41 m jump that can cross a 0.41 m trunk before a single
   depenetration pass ever sees it. `moveCapsule` rewinds to `prev` and re-walks the move
   in `radius/2` substeps, resolving each — so she behaves the same at 20 fps as at 144.
   A bare `resolveCapsule` per frame does **not** do this and will tunnel as frame time
   grows.
2. **Depenetration**, per substep.
3. **The contact brake**, which is deterministic by construction: the into-surface
   velocity component is stripped, the squareness of the *input* press (`headOn`) is
   peak-held for 0.15 s so a rotating normal cannot un-brake a head-on approach
   mid-slide, and the remaining speed is capped at `wantSpeed · √(1−headOn²) · 0.92`,
   approached at a bounded 140 m/s². Head-on the cap is 0 (she stops and stays stopped
   while W is held); at 45° it is 0.65 of what she asked for (she slides, which is
   correct).

Gate A24 with exactly this call, 10+ consecutive runs: minimum distance to the trunk axis
**0.831 m** (trunk r 0.43, so a 0.400 m standoff), speed in the 0.4 s after contact
**0.00 m/s**, penetration past the contact point **0.000 m** — identical to three decimal
places every run.

`r` is the SHARED record `{ hit, contacts, substeps, speed, travelled, headOn, nx, ny,
nz, collider }`; copy anything you keep. `r.collider.kind` is the surface she is scraping
(`'tree'`, `'rock'`, `'ruin'`…) if you want a per-material scrape sound.

For jump/mantle, pass `{ axis: 'xyz' }` and use `capsuleCast(from, to, r, h)` to sweep the
move before applying it.

### Camera (`camera-feel-03`)

In `Player._updateCamera()`, replace the `minY` terrain clamp with:

```js
this.ctx.collision.cameraBoom(pivot, desired, this._camPos, 0.3);
// then the existing shake + cam.position.copy(this._camPos) + cam.lookAt(...)
```

`cameraBoom` fires a centre ray plus an 8-whisker ring of radius `radius` along the boom,
then marches the shortened boom against the heightfield three times and lifts it clear —
12 samples, ~25 µs. It never returns a boom shorter than 0.45 m. `collision.lastBoom`
holds the resulting length if you want to fade Aloy out at very short booms.

It tests only colliders whose `camera` flag is set (§1). Machines are included, through
their unpadded `machine-cam` capsule — the lens is pushed out of a machine at the metal,
not 0.55 m before it — and canopies are not, so standing under a pine is a
foliage-fade problem for you rather than a boom problem. Expect the boom to shorten hard
near a Behemoth or Thunderjaw: those really are 6–9 m wide and the lens really is inside
them, so `lastBoom` will sit near the 0.45 m floor and the fade is what saves the shot.

### Delete these two when you integrate

`collision.attachPlayer(opts)` and `collision.attachCamera(opts)` are opt-in demo shims
that run the two snippets above from the spatial system's own `update()` (which runs
after `player.update()`). They exist only so this lane could prove A24/A25/V21 before
Wave 1.

The shims call `moveCapsule` and `cameraBoom` and add nothing else, so what the docs hand
you and what the gates measure are literally the same code path — that was **not** true
in the first cut, where the shim substepped and the documented snippet did not, and
following the doc would have tunnelled at low frame rates while A24 stayed green.
`attachPlayer` also overwrites `player.moveSpeed` with the distance she actually
travelled — that is the honest value and worth keeping, but it belongs in `player.js`,
not here. Call `detachPlayer()` / `detachCamera()` once the real calls land.

---

## 5. For `world-props`

Register everything you place, and gate A61 (`ctx.collision.count() >= 800`) is already
satisfied by the seed alone (867 blocking/occluding, 1427 registered including the
query-only canopies; `census()` breaks it down per kind). Use the semantic `kind` so
`census()` stays readable:
`'ruin'`, `'tower'`, `'tent'`, `'landmark'`, `'fauna'`. Register wildlife as
`{ dynamic: true }` capsules and move `col.ax/az/bx/bz` yourself each frame, or leave
them out — they should not block the player.

**Registration alone updates the navgrid — you do not have to do anything else.**
`register()` tells `ctx.nav` about every new static blocking collider, and the navgrid
stamps it immediately (a heavy mesh — over 20k triangles — schedules a rebuild instead).
`unregister()` marks the grid dirty and the next `update()` rebuilds it, coalesced, so
removing 400 instances costs one rebuild rather than 400. Until Fix Round 2 this was not
true: the grid latched `ready` after one pass and nothing ever re-stamped, so a
megastructure placed in Wave 2 would have been found by `sphereQuery` and invisible to
`nav.path()` forever. Gate **A25b-nav-and-occlusion** now stages exactly this workflow.

If you rebuild vegetation or props geometry wholesale, call `ctx.collision.seedWorld()`
again after the rebuild (it is additive, so `unregister()` the old ids first) and then:

```js
ctx.nav.rebuild()            // time-sliced recost + restamp; path() stays live
ctx.nav.rebuildNow()         // synchronous (24-35 ms); returns the ms it took
ctx.nav.rebuild({ full: true })  // also re-samples terrain heights (~100 ms)
ctx.nav.markDirty()          // "rebuild when you next get a frame"
ctx.nav.stampCollider(col)   // one collider into the live grid, right now
ctx.nav.rebuilding           // true while a rebuild is in flight
```

A rebuild computes into a spare buffer and swaps on completion, so `nav.path()` keeps
answering from the current grid for the ~15 frames it takes and never returns `null`
mid-rebuild.

---

## 6. Known gaps / next

- The navgrid is single-radius (1.2 m agent). Big machines need `steer({ radius })` for
  final clearance. A per-size grid tier is cheap to add if `machine-ai` finds it matters.
- `resolveCapsule` is XZ-only until `player-control` needs vertical; `capsuleCast`
  substeps at 3/4 radius rather than solving a true sweep.
- Hit hulls do not refit for torn parts' debris — a detached part's hulls are switched
  off (`hull.off`) rather than re-anchored to the debris body.
- **Hull fidelity is median-good, tail-coarse on the big two.** Gate A23b cross-checks
  121 rays per species against a real skinned-mesh raycast: median surface error is
  0.14–0.51 m, and the pooled p90 proudness is 0.69–0.82 m, but single grazing rays on
  the Behemoth and Thunderjaw still read 1.8–3.1 m, because each is one skinned mesh
  over 13-ish bones, so a bone cell spans metres of sculpt. The Thunderjaw is the one
  species still near its bar (median 0.34–0.51 m against 0.6 m) and it is the one a
  re-rig would help most. Two consequences for
  `combat`: use `{ exact: true }` on the *impact* resolve (not the aim ray) where the
  struck node is unskinned, and do not build a tight weak-point test on hull `distance`
  alone for those two species until `machine-rig` re-rigs them (`machine-rig-01`), after
  which the cells subdivide for free.
- **Exact refinement covers unskinned meshes only** — every machine *body* is skinned,
  so on those an impact point cannot be pulled back onto the true surface at all. See
  §3.
- **The hull silhouette is deliberately wider than the sculpt.** ~15–20 % of a
  silhouette-straddling fan's rays hit a hull with no sculpt behind them. All of them
  land inside the machine's own world AABB (p90 0.00 m, max 0.10 m outside over ~150
  samples), so
  they are gaps between plates rather than phantom hulls, but a caller that needs
  "did this ray touch metal" rather than "did it touch the machine" must confirm with
  `{ exact: true }` on an unskinned node.
- The camera boom does not fade Aloy at very short booms; `collision.lastBoom` is
  published so `player-control` can.

## 7. Reading the gates — measurement notes

### A23-aim-cost — what PASS and PENDING mean

**`integrated: false` in the detail means the shipped aim path has not changed yet.**
`combat._updateAimPoint` still runs `_ray.intersectObject(m.root, true)` per candidate
machine (`src/combat/combat.js:726`, and again at :869 for `_pointBlankHit`), and
`main.js` does not import this lane at all. The
gate performs the §3 swap in page context and measures that. So a PASS here means *the
replacement is proven*, **not** *the game now aims at 60 fps*. `perf-tech-01` is not
closed until (a) `core-platform` adds the two lines in §0 and (b) `combat` makes the §3
swap; then `integrated` flips to `true` on its own, the gate times the shipped function
instead of its stand-in, and the page-context patch can be deleted.

The baseline is measured **by the gate**, with its own `THREE.Raycaster` over the skinned
meshes — not by restoring `combat`'s current function. That way `baselineP95ms > 60`
stays a real anti-trivial guard after combat integrates, instead of collapsing to the
hull path's own ~18 ms and failing for the wrong reason.

**The assertion is split, and the split matters.** The §4 bar `p95 <= 20 ms` is an
*absolute* frame-time budget, and rAF deltas are the presentation interval — vsync-locked.
Measured on this box with the game idle and no aim ray at all, over 65 probes across
seven runs: median **17.5–18.9 ms**, p95 **19.5–38.7 ms**. So:

- **Asserted always**: `aimRayUsNorm < 400` and `baselineP95ms > 60`, plus
  `marginalP95ms <= 3` whenever the box is measurable. A real regression in this lane is
  `marginal` climbing while `idle` stays flat, or the normalised ray cost climbing, and
  both fail on a loaded box exactly as on a quiet one.
- **Asserted when the box can evaluate it**: `p95 <= 20`, admitted by two conditions —
  the idle scene must leave at least the lane's own 3 ms allowance under the bar
  (`idleP95 <= 17`), *and* the **lane-off control** must fit the bar. The control is the
  same idle frames measured with the whole spatial system spliced out of
  `ctx.game.systems`: collision, nav and hit hulls not running at all. It answers the
  causal question — could this scene make the budget without us? — and it is reported as
  `laneOffIdleP95ms` in every run. When either condition fails the gate returns
  **PENDING** (which `gates.mjs` does not count as a failure) naming both numbers,
  rather than a false FAIL. `vsyncFloorMs` is reported so the vsync floor stays visible.

  The second condition earned its place in a full-suite run: the box quietened until
  `idleP95` landed on exactly 20.0 ms, the bar was evaluated, and the aiming p95 came in
  at 21.4 ms — a FAIL. In the same run the lane-off control measured **21.3 ms**. The
  scene could not hold 20 ms p95 with none of this lane's code running, and the aim ray
  costs 0.17 ms; failing the lane there would have been a false FAIL of exactly the kind
  the Round 1 split removed. "Idle sitting on the bar" is not headroom.

**The gate hunts for a quiet window before it gives up on the bar** (Fix Round 2). A
judge reported, correctly, that the only spatial gate carrying a frame-time bar had never
once evaluated it: with three lanes' vite servers and three Chromes on one box at load
average 12–16, `idleP95` read 21.9–46.8 ms on every run and the absolute assertion was
skipped every time. Load here moves on a timescale of seconds, so A23 now takes up to
eight cheap 450 ms idle probes looking for a second that fits the bar, then spends a full
4.5 s paired sample — up to three such cycles, stopping at the first sample whose idle
frames fit, keeping the quietest otherwise. `scoutIdleP95Ms` and `idleP95PerAttemptMs`
record what it saw. Nothing is relaxed; this only buys the measurement a fair window.
**If you are re-running this gate to judge it, run it alone** — no sibling lane's gates,
no other Chrome. Be warned that on the machine this was built on, "alone" was not enough:
`ps` during these runs shows **AdobeIPCBroker at 95 %, Adobe Desktop Service at 80 % and
Creative Cloud at 70 % of a core, continuously** — about 2.7 cores of background load
that no lane owns and that serialising the lanes does not remove. Bare-scene control
measured on that box with this lane **never installed**: 32–104 ms p95 over four bursts.
That is the honest reason the absolute bar has not yet been evaluated here, and it is why
`laneOffIdleP95ms` is now part of the gate rather than a footnote.

The PENDING ceiling is 20 ms — the bar itself — and not the 15 ms first proposed:
15 ms sits *below* the 60 Hz vsync floor, so it could never be satisfied and A23 would be
permanently PENDING with the §4 bar never evaluated. 20 ms triggers PENDING on exactly
the observed pathology ("the idle scene was already over the bar") and evaluates the bar
in every other case, which is strictly more checking, not less.

**`aimRayUs` is normalised by box speed.** It is wall clock, so when the whole machine
runs 2.2× slower the *same* work reads 2.2× more expensive — measured 187 µs at a 16.6 ms
vsync floor and 512 µs at a 36.4 ms one, which produced a FAIL for a lane that had not
changed. `boxScale = max(1, vsyncFloor / 16.7)` is how much slower than a 60 Hz box this
one is, and `aimRayUsNorm = aimRayUs / boxScale` is the asserted quantity. Because
`boxScale >= 1`, this can only ever make a *quiet* box's reading harsher; it can never let
a loaded box pass something a quiet box would fail. Normalised, the steady-state aim ray
measures **104–198 µs** across every run at box scales from 1.0 to 2.3.

**`idle` and `hull` are sampled interleaved**, in five alternating 400 ms bursts with RMB
held in both phases (the OFF phase is a no-op `_updateAimPoint`, not "not aiming"). The
first cut sampled each once, seconds apart; because load on this box drifts over seconds,
that made the *difference* noisier than the quantity it measures — `marginalP95ms` swung
**−8 to +12 ms** across runs while the aim ray itself never left **0.19–0.29 ms**, and
produced two FAILs in five runs on a lane that had not changed. Paired sampling put it
back inside ±3 ms.

### A24-player-blocked — it was staging, not the contact model

A24 failed 4 runs in 10 in review, with `speedAtContactMs` scattered over 0.40–1.40.
Tracing every contact found two causes, both in the gate, neither in `moveCapsule`:

1. **A wandering machine.** A machine capsule was barging into the corridor and shoving
   her off the trunk axis; once off-axis her input is no longer head-on to the trunk
   normal, so she correctly slides around and re-accelerates to ~8 m/s. Whether that
   landed inside the measurement window depended on where the machine had walked to.
   §4 stages "sprint 12 m into the nearest pine trunk" — a machine walking into the shot
   is a *different* test, and that one is A25. The roster is now frozen for the run (the
   idiom A25 already used), the chosen trunk must have no machine within 30 m, and the
   gate **asserts** `contactKind === 'tree' && otherContacts === 0`, so a machine getting
   involved fails the gate loudly instead of silently changing the answer.
2. **A sampling artifact.** The speed trail buckets 80 ms of travel at a time, and the
   window was cut on each bucket's *end*, so the bucket straddling the contact frame —
   up to 80 ms of pre-contact sprint at 8.4 m/s — counted as an "after contact" sample
   and dragged a 5-sample mean to ~1.7 m/s while she was in fact standing still. The
   window is now cut on each bucket's *start*, so every sample is entirely post-contact.

`speedAtContactMs` remains the **mean** over the 0.4 s after contact — the strict reading
of §4, not the more forgiving minimum — and the 1 m/s bar is unchanged.
`minSpeedAfterContactMs` is reported next to it so a future slide-and-recover regime
would be legible rather than invisible. Result after both fixes, 6 consecutive runs:
`speedAtContactMs 0.00`, `penetrationPastContactM 0.000`, `standoffM 0.400`, identical
every run.
