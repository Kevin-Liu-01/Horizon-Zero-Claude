# ROUND 4 — lane `npc`: the camp's people

Owner: `npc` (port 5218). Files: `src/world/npc/**` (all new), the NPC placement
section of `src/world/camp.js`, `tools/gates.round4.npc.mjs`,
`models-staging/npc/MANIFEST.md`.

Thirteen named Nora replace the six baked mannequins `world-props` posed into
the camp. Each runs its own `AnimationMixer` over the CC0 Quaternius clip
library, walks authored routes through the navgrid, sits on the fire logs,
works the racks and the wood pile, turns its head to look at the player, and
goes to bed at night. Nothing is retargeted and nothing was downloaded.

---

## 1. Why there is no retargeting

`public/anims/AnimationLibrary_Godot_Standard.gltf` (CC0) is loaded today only
for its 46 clips, which `anim-core`'s `ClipLibrary` bakes onto Aloy's 424-joint
rig. The same file also ships **the rig those clips were authored on** — a
53-joint humanoid skeleton with a clean T-pose bind, +Y up, +Z forward, 1.75 m
tall, feet at y ≈ 0, `bindMatrix` identity (all measured on 5218).

So the NPCs clone that skeleton and play the pack's clips **directly**. Zero
bake cost, zero retarget error, zero foot-slide introduced by a mapping. The
bodies are generated against the same bind space by `npcBody.js`; see
`models-staging/npc/MANIFEST.md` for the sourcing decision and the licence.

**Caveat worth knowing if you touch this pack:** `GLTFLoader` sanitises node
names, so `DEF-spine.001` arrives as `DEF-spine001` and `DEF-toe.L` as
`DEF-toeL`. `NpcRigSource._bindNames()` rewrites the lane's bone table to match.
Without it every skin weight silently lands on bone 0 and the whole crowd
renders as rigid T-poses.

## 2. `ctx.npcs` — the published surface

```js
ctx.npcs.list            // live records (see below)
ctx.npcs.count
ctx.npcs.groups          // the THREE.Group per NPC, in roster order
ctx.npcs.byId(id)        // Map#get
ctx.npcs.nearest(pos, maxDist = 6)     // record | null
ctx.npcs.roster          // the AUTHORED rows: { id, name, title, role, lines }
ctx.npcs.stations        // resolved work-station world positions
ctx.npcs.talkTo(id)      // -> boolean; see §3
ctx.npcs.landmarks()     // per-NPC hand/head landmarks (V35's probe)
ctx.npcs.walkingFeet()   // per-foot { id, name, planted, world, epoch, clip, state }
ctx.npcs.signature(n)    // mesh + vertex-colour fingerprint of one NPC
ctx.npcs.crowdSpacing()  // { min, a, b, states } — the closest two people NOW
ctx.npcs.unstickCount()  // total rescues; A96/A97 fail the build on any
ctx.npcs.unstickTrace()  // last 16 rescues: { id, why, state, x, z, t }
ctx.npcs.debug()         // the gate-facing snapshot
ctx.npcs.dispose()       // full teardown; see §7
```

A record is `{ id, name, title, role, body, variant, group, position, state,
anim, mesh, skeleton, byName, walked, hut, … }`. `state` is one of
`idle · walk · goto · work · errand · sit · sleep · talk`.

**Events**

| event | payload | when |
|---|---|---|
| `npc-crowd-ready` | `{ count, variants }` | once, at boot |
| `npc-talk` | `{ id, name, title, role, lines }` | every `talkTo()` |

## 3. For `progression` / `progression-expansion` — dialogue

`ctx.npcs.talkTo(id)` turns the NPC to face the player, plays a talk gesture,
emits `npc-talk`, and then hands off:

- if `progression.NPCS[id]` exists (today: `varl`), it calls
  `progression.talkTo(id)` and the existing dialogue panel opens unchanged;
- otherwise it only emits, carrying that NPC's authored `lines`.

So registering the other twelve is a data change on your side and needs no edit
here. Every non-Varl NPC already has a live `TALK · NAME` interactable following
it (Varl's is left to `progression`, which registers its own). The roster rows
(`ctx.npcs.roster`) carry `id`, `name`, `title`, `role` and `lines`.

`A99-dialogue` and `V45-dialogue-panel` are yours; this lane guarantees the
speaker exists, is reachable, and reacts.

## 4. For `world-props` — what camp.js now publishes

`_placeNpcs()` is the only part of `camp.js` this lane owns. The three fields
that file published keep their shapes:

| field | before | now |
|---|---|---|
| `camp.npc` | the Varl anchor `Object3D` | the Varl NPC's transform |
| `camp.npcs` | anchor array | live per-NPC transforms |
| `camp.npcLandmarks` | baked at build time | a **getter** — poses are animated |
| `camp._npcTime` | a shader uniform | a probe clock; writing `.value` scrubs every mixer |

`camp.update()` gained one guarded line: the crowd clock now carries
`driven: true`, so the per-frame wall-time write that drove the old vertex-shader
idle is skipped (it would reset thirteen mixers a frame). `V35-settlement`
passes against the new crowd unchanged.

## 4b. FIX ROUND 1 — what five judge findings changed

| finding | what was wrong | what it is now |
|---|---|---|
| both lookouts pinned in the palisade | `_route()`'s ring probe marched OUTWARD from the fire and stopped at the first blocker, which inside a settlement is always furniture at 4-9 m — so both "palisade patrols" collapsed onto the `max(5.5, …)` floor and resolved to an 18-node scribble at radius 3-8 m whose first five legs were 100 % blocked | the probe marches INWARD from `palisadeRadius(a) - inset`, drops a bearing it cannot clear within 4.5 m of nominal, and prunes the arc with a per-leg reachability test. `palisadeA` is 14 nodes at radius 16.0-16.5 and `palisadeB` 13 at 15.6-16.4; SONA walks 56 m a minute with **0.00 m** of depenetration |
| `A97` excluded exactly the frames the finding was about, and measured a tautology the rest of the time | it read the foot lock's carried pivot (algebraically invariant) and discarded every window in which `lockEpoch` moved — which is the set of frames the world was dragging the body | `walkingFeet()` publishes the toe bone's own `matrixWorld` as `raw`, and `lockReason` says WHY the epoch moved. Only `'base'` (a crossfade) and `'clamp'` are excluded; a shove is judged. Any `_unstick` during the probe fails the gate |
| a 13-26 mm hole at every wrist | the arm loft ended at bind x = 0.712 **uncapped** while the hand ellipsoid started at 0.730, and the hand/thumb radii were bare literals that did not scale with `P.armR` (0.84 to 1.22 across the builds) | a forearm-dominant wrist station at x = 0.742 carries the tube INTO the hand mass, the loft is capped, and the hand scales with the build. Measured overlap +0.0145 m, worst gap 0.0096 m, on all 13 in 6 clips. `V41` measures both terms on the skinned mesh |
| every NPC leaned 10-34 degrees off vertical | the posture lattice wrote up to 0.285 rad at the waist and 0.18 at the chest in BOTH axes, because the head's 0.6 m lever was the cheapest way to clear `V35-settlement` | `_stance` clamps the combined tilt to `LEAN_CAP` = 0.12 rad; measured procedural lean is now **0.7-3.2 degrees**. The separation is bought in the shoulder girdle and on height instead (§7) |
| two NPCs inside each other, a third never walked | `woodPile` and `rackB` were 0.42 m apart and both inside a solid block; NPC-vs-NPC depenetration was off; and `work` had no exit but an errand, so a gatherer who answered the station roll once never walked again | the two stations moved to open ground, stand-marks are proved clear AND reachable, a soft 1.2 cm/frame mutual repulsion separates movers, spawn marks are separated at `_place`, and a route-owner works a bounded shift (`workT`) and then goes back to its route. All six route-owners cover 8 m+; total crowd depenetration is **0.32 m per minute** across thirteen people (the audit measured 26.11 m per 30 s) |

Four new pieces of machinery came out of that, all in `src/world/npc/npc.js`:

- **the camp occupancy grid** (`_tickGrid` / `_localPath`) — 57x57 cells of 0.75 m
  stamped with the same 0.5 m capsule the people walk with, built once over
  seven frames, searched with a flat 8-neighbour BFS into preallocated typed
  arrays and string-pulled against the real capsule. `ctx.nav` is the valley's
  grid (2 m cells, 1.2 m agent) and around camp furniture it frequently has
  nothing to say about a gap a person walks through twice a minute — it handed
  one walker a five-node path 25 m out of camp between two points 2.6 m apart.
  Nav is still asked first, but its answer is now checked leg by leg against the
  body capsule (including the approach leg from where the walker actually
  stands) and rejected if it is a tour.
- **`_reachable` / `_legClear` / `LANE_R`** — a leg is judged by the capsule that
  will walk it, at lane width (body + 0.23 m), and the navgrid is consulted only
  when that fails.
- **`_unstick`** — nobody stays inside geometry: depenetration is integrated
  against a bleed, and a direct in-geometry test at body width fires after two
  seconds. It is a safety net, not a plan, and `A96`/`A97` FAIL the build if it
  ever has to run.
- **node blacklisting** — a give-up marks the node instead of handing the walker
  straight back to it, and a route that loses most of its nodes is abandoned for
  the authored `fallback`.

## 4c. FIX ROUND 2 — people do not walk through people

Round 1 fixed the *permanent* half of M5 (two workers standing inside each other
for a whole session) and left the *transient* half — and left it unmeasured,
which is why it passed 5/5. A judge sampled every frame of 90 sim s and found
**0.132 m** between two body centres, walkers passing bodily through seated
NPCs, and filmed OLIN standing inside a seated VALA. The cause was arithmetic:
the crowd push was capped at a flat **0.012 m per frame = 0.72 m/s**, against a
walk clip that travels **0.927 m/s**. It could slow an interpenetration; it could
never prevent one.

The answer is in two layers, and the order matters.

- **`_dodge` (velocity level, the plan).** Every frame a walker looks 2.3 m down
  its own facing. Anything roughly ahead and inside the lane gets **steered
  around** — a lateral bias handed to `_steer`, clamped by the body's own turn
  rate so the path bends rather than snaps. Anything on a real collision course
  is **waited for**: the gait comes off, the body stands, and the yield renews
  while the way is blocked, so it ends about a seventh of a second after it
  clears instead of flickering. Waiting costs no foot drift at all, which is the
  whole reason it is the primary mechanism and the push is not.

  Four rules earned their keep by being measured without them:
  - **Stop for a PREDICTED collision, not for a neighbour.** Two weaker
    predicates were tried and both were wrong. Stopping for anyone nearby had
    walkers in file stopping for each other the whole way (14.9 % of walking
    frames). Testing the closing speed along the line between the bodies was
    better, but still read the *current* offset as the miss distance, so two
    people walking side by side down the same lane kept stopping for each other
    and `V41-npc-closeup` measured the cost. The predicate is now the standard
    one: from both bodies' velocities, **how close will they actually come, and
    how soon** — under 0.70 m (0.92 m for a body that cannot step aside) within
    1.1 s. Same-direction file and side-by-side answer "no closer than now" and
    simply walk. The speeds are each gait's NOMINAL travel, not the clip playing
    now — reading the clip would have a yielding body measure itself as
    stationary, resume, and close again.
  - **Patience decays, it does not reset.** Zeroing the wait clock on every
    resume meant `YIELD_PATIENCE` was never reached, the detour never fired, and
    a walker blocked by someone standing on its path stuttered in place forever.
  - **Wait where you can stand.** Stopping inside a doorway parks a body
    somewhere the pin detector reads as stuck, and a second later `_unstick`
    teleports them — which both A96 and A97 fail the build on.
  - **A body that cannot step aside gets a wider berth**, and the pass a walker
    will accept beside it is wider than the one it accepts beside another mover.

  Widening the stop indiscriminately was tried and measured: the crowd spent
  **55 % of its walking frames waiting** and route travel fell from 80 m to 4 m
  in two minutes. Separation margin is bought on the backstop, not here.

- **`_separate` (positional, the backstop) — and why it is nearly powerless
  against a walker.** A character cannot be translated without its feet
  translating with it. Slide a body playing a walk clip and the planted foot goes
  along; that is skate, and `A97-npc-no-skate` measures it at 0.08 m per stance
  window. A stance window is about 40 frames, so **any sustained push above
  ~0.1 m/s fails that gate** — the first cut of this backstop ran at 0.5 m/s for
  a light brush and dragged one gatherer's planted foot **0.34 m** in a single
  window, on a box fast enough for a push and a stance to coincide.

  So the push is split in two. A body that is **walking** is corrected at
  `SEP_WALK` = 0.06 m/s, a rate that cannot skate. Everything else — idle,
  working, anything A97 does not measure — is corrected at metres per second
  scaled by this body's own step (so an NPC on the 1/6 s LOD budget is corrected
  six times as far per step, not a sixth as far), ramped by depth from 0.5 m/s at
  a brush to **2.2 m/s** inside a shoulder's width. The correction is **shared by
  weight**: a seated or sleeping body takes none of it, so the passer-by takes
  all of it, which is the judge's case exactly.

  When a walker is inside `SEP_HARD` (0.66 m) — too close to walk out of at a
  skate-safe rate — the answer is **not a harder shove**. It stops and **turns to
  face the way out**: `turn()` pivots the body about its planted foot by
  construction, so a turn of any size costs zero drift, and the walker walks
  itself clear the moment the yield lifts.

  `_separate` runs **before** the world's capsule resolve, so the invariant
  "nobody is ever inside geometry" holds every frame, and it reports itself to
  the animator with `shift()` so A97 *judges* those stance windows rather than
  hiding them. It is the shoved windows that carry A97's whole reported number.

Measured over 120 sim s, every frame, worst pair named: **minimum centre
distance 0.617–0.773 m** across runs (was 0.031 m), **0 frames under the 0.55 m
bar**, 0 rescues, all six route-owners covering 72–113 m, yields at 6 % of
walking frames. `A96-npc-animated` now carries `minPairwiseSeparationM`,
`framesUnderSeparationBar` and a per-NPC `sepM` over the full 60 s so this cannot
regress quietly again; A97's worst drift is **0.029–0.035 m** against its 0.08 m
bar. Films: `shots/judge-npc-r2-sitter-pass.png` (the judge's own case — a walker
passing a rooted body at 0.887 m with a body-width of ground between them),
`shots/judge-npc-r2-overlap.png`.

**One gate bug fixed while proving this.** `V41-npc-closeup`'s own harness tore
the stage down and re-issued `play('walk')` on every sample frame; `play()`
clears the foot lock's anchor by design, so the lock skipped its root-motion step
on nearly every frame and the bodies barely moved. The take measured 5.3 m of
travel on a loaded box and 2.4 m on a fast one — an answer that depended on how
often a callback landed between engine updates rather than on the gait. `soloWalk`
is now idempotent: the same guarantee (the walk is the only thing on stage, every
frame), rebuilt only when it is not already true. Measured travel went to
**8.14–8.24 m** in 8 s, which is the gait's nominal 1.02 m/s and the first honest
reading this term has produced.

New on `ctx.npcs`: `crowdSpacing()` → `{ min, a, b, states }` and
`unstickTrace()` → the last 16 rescues with the detector that fired.

## 5. The no-skate contract

An NPC's translation is **derived from its animation**, not corrected after it:

1. find the support foot (lower toe, 1.5 cm hysteresis);
2. read how far it moved backward in character space this step;
3. move the body forward by exactly that.

The planted foot is the fixed point of the update, so it cannot drift. Turning
rotates the body **around** the planted foot rather than around its own origin.
Speed is the clip's own (`Walk_Loop` measures 0.927 m/s, `Walk_Formal_Loop`
1.015, `Jog_Fwd_Loop` 3.032) times `action.timeScale` times the NPC's scale —
and because the rate scales the foot's velocity too, slowing an NPC down cannot
introduce skate either.

`A97-npc-no-skate` measures the toe bone's own world position — not the lock's
carried pivot, which is invariant by construction and can only ever report zero.
Latest run: **0.0195 m** of maximum stance drift over 66 judged windows across
five walking NPCs, zero of them shoved, zero `_unstick` events.

Two things can still move a body against the animation, and both are handled:
`anim.lockEpoch` is bumped whenever the lock re-anchors (a base-loop change, a
clamped delta, a shove out of a prop), and `_watchProgress` treats a sustained
shove as blockage even at full forward speed, so an NPC grinding along a wall
stops walking instead of dragging its feet along it.

## 6. The trap in layering procedural motion over clips

`THREE.PropertyMixer.apply()` writes a bone into the scene graph **only when its
accumulated value changed since the last apply**. A clip track that has gone
constant therefore stops touching that bone entirely — and any procedural
rotation written on top of it is never cleared again, so it accumulates every
frame.

`Walk_Loop` holds `DEF-spine.001` still. Measured on 5218: mixer delta on that
bone exactly **0.0000 rad per frame** against 0.2091 on `DEF-spine.003`, and the
posture bias winding SONA's head from 1.56 m above her own feet down to 0.33 m
and back, several times a second — while her clip, her weights, her mixer clock,
her knee swing and her foot lock all read perfectly correct.

`NpcAnimator` therefore keeps a **write-back cache**: every bone it poses
procedurally (spine, clavicles, upper arms, neck, head) is restored to its pure
clip value before `mixer.update` and re-cached after it. Two quaternion copies
per biased bone per frame, no allocation. Anything else layering additive
rotation over a clip in this repo wants the same guard — or anim-core's
`RestPose.snapshotClip()` / `applyClip()`, which is the same idea generalised.

## 7. Budget and teardown

- **Draw calls.** One `SkinnedMesh` per NPC — body, clothes, hair, spear, bow
  and basket in one buffer with vertex colours. Measured at the spawn vista:
  **20 draws** for the visible crowd, and **2** from anywhere in the valley that
  is not the camp (bodies are not drawn past 70 m; only the nearest four cast a
  shadow, and only inside 30 m). The mixers keep running either way.
- **Simulation.** Full rate inside 70 m, 24 Hz to 140 m, 6 Hz beyond. No
  per-frame allocation anywhere in the update.
- **Memory.** `dispose()` releases every geometry, material, skeleton, mixer,
  collider and interactable, removes the scene group and the system, and nulls
  `ctx.npcs`. Measured: geometries −13, textures −13 (the skeletons' bone
  textures), interactables −12, colliders −13, systems −1, zero errors. The
  crowd is built once at boot and never respawns, so it contributes nothing to
  `A90-memory-stability`'s growth window.
- **Posture.** Every person carries a cell of a 4x4 SHOULDER GIRDLE lattice —
  clavicle raise x clavicle protraction — plus a hashed elbow/upper-arm bias, a
  spine lean clamped to 0.12 rad, and their own place in every loop's cycle
  (`phaseFrac`, a thirteenth each, so two people in the same clip are never in
  the same pose). The index into the lattice is the person's RANK BY HEIGHT, so
  the pairs that share a clavicle cell are four places apart in height and
  `V35-settlement`'s head landmark — reported in character metres, so it scales
  with the person — separates those on its own.

  That gate reads the MINIMUM over all 78 pairs, so "varied" is not enough; two
  independent guarantees are. Measured across five consecutive runs: **0.160,
  0.164, 0.184, 0.184, 0.185 m** against a 0.12 m bar, with a maximum procedural
  spine lean of 3.2 degrees. The first cut bought the same number on the spine
  alone and cost thirteen people their posture to do it.

## 8. Gates

`tools/gates.round4.npc.mjs` registers the audit's §4 ids unchanged —
`A95-npc-roster`, `A96-npc-animated`, `A97-npc-no-skate`, `V40-settlement-life`,
`V41-npc-closeup`. (`A95-combat-teardown` is a different id and does not
collide.) V40 and V41 are the audit's two visual bars, filmed **and** measured:
the NPCs in frame are counted by projecting them through the live camera, and
"different things" is the clip each is actually playing.
