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
ctx.npcs.standingFeet()  // the same, for EVERY body on its feet (A97 reads this)
ctx.npcs.loopTravel      // the boot-time cycle-travel bake of every stageable loop
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

## 4d. FIX ROUND 3 (residue) — the three serious findings, measured

Judge r2 scored the lane 62 and left three majors. All three are closed; the
numbers below are the measured ones, and every run is on port 5218.

### (1) `A96-npc-animated` failed about half its runs — the pin detector and the
depenetration did not share a capsule

`_settle` resolves the body with `resolveCapsule(p, 0.30, 1.62 * scale)`. The pin
detector probed `_blockedAt(x, z, 0.36)`, which is `resolveCapsule(p, 0.36, 1.70)`
— **wider AND taller in both terms**, so it strictly contained the body. A person
walking a 0.33 m clearance therefore read as "inside geometry" while the resolve
never touched them; `inGeo` climbed half a second at a time, `_unstick` teleported
a healthy walker out of a gap they were walking through, and A96 fails on any
rescue.

Filmed before the fix, OLIN on the west lane at (19.5–19.9, 31.8–34.1): `inGeo`
0.5 → 1.0 → 1.5 over three seconds of walking, against **0.28 m** of actual
depenetration in 22 s. Two more probes of the same 60 s showed the same climb on
TEB at (19.7, 32.1).

Both callers now go through **`NpcSystem._resolveBody(n, p)`**, which owns
`BODY_R = 0.30` and `BODY_H = 1.62`; the detector asks it at the person's
post-resolve position, so the question is literally "am I still in contact after
the world had its say". Nothing else in the file may hard-code those numbers.

Two further causes of the same gate's other terms turned up while proving this,
and both are fixed (see §4e): a walker grinding on geometry, and a `goto` walker
re-attempting a mark it cannot reach.

**`A96-npc-animated`, seventeen consecutive completed runs in isolation on the
final code: 17 PASS**, plus the one inside the full suite. `unstickEvents` is
**0 in every run**. `worstPushedM` 0.05–0.81 m against the 1.5 m bar (it reached 2.17 m before this
round). `routeOwnersUnder8m` empty every time, `travellersOver8m` 5–8,
`npcsWithThreeClips` 13/13, `stuckLayers` and `rewound` empty every time. One
further run produced no verdict at all — its page died with three other lanes'
suites running on the same box — and is reported here rather than counted.

### (2) Permanent foot skate on working NPCs — `Push_Loop`, and a gate that could
not see it

Only `GAIT` slots drive the body, so any other base loop with real cycle travel
plays with the body held and the feet sliding. `Push_Loop` is that clip.
**Measured on this rig with the same integration the gaits get: 0.9507 m of
support-foot travel per 2.667 s cycle = 0.3565 m/s = 21.4 m of ground a minute,
with the lower foot never more than 0.0141 m off the floor — no air path at all.**
Two roster rows carried it (THOK's `work`, OLIN's `idleClip`), which is the
~40 m/min the judge measured. `A97-npc-no-skate` sampled `walkingFeet()` — walkers
only — so it could not see one metre of it.

Four things changed.

- **The bake covers the whole library.** `measureLoopTravel()` measures every slot
  this lane can stage, once per boot, on ONE throwaway skeleton (released at the
  end); `measureGaits()` is now the locomotion subset of that one bake. The
  measured library splits cleanly: `Jog_Fwd_Loop` 3.0324, `Walk_Formal_Loop`
  1.0152, `Walk_Loop` 0.9272, then **`Push_Loop` 0.3565**, then `Dance_Loop`
  0.0055 and everything this lane actually plays at **0.0018 or less**
  (`Interact`, `Idle_Loop`, `Idle_Talking_Loop`, `Idle_Torch_Loop`,
  `Crouch_Idle_Loop`, `Sword_Idle`, `Sitting_Idle_Loop`, `Sitting_Talking_Loop`
  all 0.0000; `PickUp_Table` 0.0009; `Punch_Jab` 0.0010; `Fixing_Kneeling` 0.0004;
  `Sitting_Enter` 0.0016 and `Sitting_Exit` 0.0018, the two largest). Every one of
  those also reports `lowFootMaxY` 0.0146-0.0152 — the rig's own floor offset,
  i.e. neither foot ever leaves the ground, which is what in-place means.
- **`IN_PLACE_MAX = 0.05 m/s`, and `play()` enforces it.** A non-gait base loop
  that does not measure in place is refused and `idle` is played instead, with one
  console warning. `once()` refuses the same way. So a future edit dropping a
  travelling clip back into a pool cannot re-introduce the artefact quietly.
- **The two rows moved off it.** THOK works `fixing` (`Fixing_Kneeling`, 0.0004 m/s
  — he kneels over the wood pile) and OLIN rests on `pickup`/`interact`.
- **`A97` samples working NPCs.** `ctx.npcs.standingFeet()` returns the feet of
  every NPC standing on them — `walk`, `goto`, `work`, `idle`, `errand`, `talk`
  (sit and sleep are excluded: that body is not on its feet). Two more changes
  were needed to make that a real measurement: a stance window is closed and
  judged after **half a measured walk cycle (0.6667 s, read from the bake)**,
  because an in-place loop never swaps the support foot and every worker's window
  used to be dropped unopened at the end of the probe; and the pass now REQUIRES
  non-walking windows in the sample (`workWindows ≥ 10`, `workNpcs ≥ 2`) so the
  gate cannot go blind again. It also reads `ctx.npcs.loopTravel` back and fails
  if any non-gait loop on stage measures over the in-place bar.

Two real defects surfaced the moment the gate could see workers, and both are
this lane's:

- **A one-shot fired on the layer that was already the base loop collapsed the
  stage to the BIND POSE.** `ClipLayer.playOnce` sets the layer's weight to 0 and
  then fades its `restore` to 0 — and when `restore` IS that layer (the work pools
  overlap `idleClip` by design) the second fade overwrites the first and nothing
  is left on stage. `ClipLayerSet` only normalizes when the override weights sum
  above 1e-6, so every bone blended toward bind: a T-pose flash on every work
  beat. Measured as **0.325 m of planted toe in a single frame** on OLIN, 0.193 m
  on THOK, 0.173 m on TEB. `NpcAnimator.once()` refuses a one-shot of the current
  base loop, and `NpcSystem._pickBeat()` draws a beat that is a real change.
- **Two one-shots at weight 1 at once served a 50/50 mush of two clips.**
  `playOnce` does not clear other one-shots the way `play()` clears other base
  loops, and `Fixing_Kneeling` runs 5.2 s against a 4–7 s beat timer. Filmed on
  TEB: `fixing:1.00(1s)` and `interact:1.00(1s)` together for four seconds, a
  half-kneel whose "planted" rear foot lifted 0.134 m while the support choice
  still called it planted, and **0.224 m of planted-toe travel in 0.35 s**. The
  incoming beat now owns the stage (the older one-shot is faded out, without
  `cancel()` — see §4e) and `_workBeat` will not start a beat while one is live.

**`A97-npc-no-skate`, six consecutive runs in isolation on the final code:
6 PASS.** Worst stance drift **0.0173 / 0.0173 / 0.0174 / 0.0174 / 0.0185 / 0.0348 m**
against the 0.08 m bar, with **82–119 working windows sampled per run** across
7–11 people, zero `_unstick` events, and `loopsOverInPlaceBar` empty every time.
The worst CLEAN (unshoved) window is **0.0173–0.0185 m** in every run; three of
the five runs had no crowd-shove window at all, and the worst shove that did land
was 0.0348 m — the `_separate` backstop, which the gate JUDGES rather than
excludes.

**Crossfades are excluded, and the exclusion is printed.** Two clips with
different stances put the planted foot in different places, so the foot moves
because the animation moved it — that is the same thing round 1's
`lockReason === 'base'` exclusion was for, and it only ever caught base-loop
swaps. `NpcAnimator.blending` is true while any layer's fade is running (held one
frame past the end, because the pose still changes on the frame a fade reaches
zero — measured at 0.063 m with the stage reading `idle:1.00`), and A97 excludes
those windows, counts them (`excludedCrossfade` 45–60 per run) and reports
`maxDriftDuringCrossfadeM` (0.41–0.62 m) so the exclusion can never be a quiet
one. The 0.08 m bar is unchanged.

### (3) NPCs walking through each other — verified closed, with the distribution

Round 2's `_dodge` / `_separate` holds. `A96-npc-animated` samples
`crowdSpacing()` **every frame of the 60 s** and now publishes a 10 cm histogram
and the 1st percentile as well as the minimum.

Across the ten consecutive runs above: **minimum pairwise separation
0.620–0.659 m** against the 0.55 m bar, **`framesUnderSeparationBar` = 0 in all
ten**, 1st percentile in the 0.6–0.7 m bucket in all ten. A representative
histogram over 1484 frames: 0.6–0.7 m ×104, 0.7–0.8 ×59, 0.8–0.9 ×138,
0.9–1.0 ×126, 1.0–1.1 ×64, 1.1–1.2 ×102, 1.2–1.3 ×58, 1.3 m+ ×710 — i.e. the
crowd spends half its time with more than 1.3 m between its closest pair and
never comes within a body's width of merging. The closest pair is always two
movers passing (`bast/delve`, `teb/olin`) or a walker passing a seated body
(`karst/maris`), which is what the backstop is for.

## 4e. FIX ROUND 3 — the four smaller things that had to change with them

- **A grind comes off the gait at once (`GRIND_STOP` = 0.035 m).** A body held
  against geometry still consumes the walk clip at full rate, so the planted foot
  is dragged by every centimetre of depenetration. Round 2 metered that on the
  0.9 s progress window and answered with a sidestep, which keeps the gait ON —
  the walker ground through two detour attempts before it stood up, up to 2.7 s.
  Filmed on AURA at (32.36, 24.03): **0.46 m of depenetration in 0.76 s**, her
  group position frozen, **0.43 m of planted-toe drag in one stance window**.
  Contact over 0.035 m (a little over one frame of `_settle`'s 0.03 m cap) now
  drops the gait for 0.3 s, plans the sidestep from a standing body, and feeds the
  same blocked ladder the window does — `_blockedStep()`, extracted so a trip and
  a slow window escalate together. A window that contained a trip does not clear
  the ladder, or a walker fighting one corner resets it forever.
- **A pinched leg is walked around (`_laneDetour`).** `_validateRoute` fixed a
  lane-blocked sample with `_clearPoint`, which resolves the BODY capsule and
  pulls toward the camp centre — where a leg threads a gap narrower than the lane
  it hands back a point that is still lane-blocked, and the loop simply skipped
  it. `eastLane` had exactly that at **(29.0–29.5, 22.0): lane-blocked at 0.78 m,
  clear at 0.55 m and at 0.30 m** — AURA walked the line cleanly until anything
  nudged her off it, then ground on the tree (1.95 m and 2.17 m of depenetration
  in a minute, twice A96's shove bar). The fixer now steps perpendicular to the
  leg until the whole lane is clear and the point is reachable from the plaza. All
  five live routes now scan **0 lane-blocked samples** end to end (`palisadeA` 34.3 m,
  `palisadeB` 24.0 m, `eastLane` 33.4 m with the inserted node at (29.5, 21.0),
  `westLane` 23.3 m, `gateRun` 11.8 m), and all nine station stand-marks are clear
  at lane width as well as body width.
- **A `goto` that gives up puts the destination down for half a minute
  (`stationHoldT`).** A route walker blacklists the node it failed on; a `goto`
  has no node, so `_replan` sent a worker straight back to the same mark. A body
  in a pocket it cannot walk out of therefore repeated walk → contact → yield →
  detour → give up → idle every 3–4 s for a whole minute: filmed on MARIS at
  (24.6–24.8, 33.5), **twenty seconds, twelve attempts, total position change
  0.15 m**, and on OLIN at (19.0, 31.2). Each attempt cost about 0.05 m of
  depenetration (measured at the 0.05 m grind trip of the time; it is 0.035 m
  now), which is how a run reached the 1.5 m shove bar without a single NPC ever
  being stuck. The station is left alone for 25–40 s and the person works
  or walks where they are. `goto` also gives up one rung earlier than a route
  walker: a second sidestep toward one fixed mark is the first one mirrored.
- **A base loop REPEATS, even when the clip is one-shot-shaped.** Half this lane's
  rest and work loops are gestures — `Interact`, `PickUp_Table`, `Fixing_Kneeling`
  — and they were staged as a play-once that clamped on its last frame, so a
  worker "working" was a person frozen mid-reach for five seconds. That is a still
  pose where Kevin asked for idle movement, and it also tripped a false health
  report: `ClipLayer.stuck()` reads a NON-LOOPING layer that still carries weight
  with a target of 0 as "weight held after restore", which is the exact shape of
  crossfading OUT of one of them — A96 fails the build on a `stuck()` report and
  sampled one on OLIN's `interact` mid-fade. `play()` now puts the layer into
  `LoopRepeat` (un-pausing an action three parked at its clamped last frame), so
  a pick-up repeats every 0.8 s and a repair every 5.2 s, the flag the detector
  reads is TRUE, and those slots also pick up the per-person `phaseFrac` seeding
  the looping clips already had. One-shots are untouched — `playOnce` sets
  `LoopOnce` itself and owns the layer until it hands the stage back. Measured
  after: A97 worst 0.0186 m (no wrap pop at the loop seam), V40 8 distinct
  activities, A96 `stuckLayers` empty in 17 consecutive runs.
- **A stale one-shot is faded, not `cancel()`ed.** `ClipLayer.cancel` clears the
  one-shot flag and schedules the fade, and a NON-LOOPING layer with weight still
  up and target 0 is precisely what `ClipLayer.stuck()` calls "weight held after
  restore". Every beat clip in this lane is non-looping, so a cancel left a false
  `stuck()` report standing for the length of the fade — and A96 fails the build
  on one. It cost a run out of ten before it was found. Leaving the flag set keeps
  the layer's own timeline responsible for the clean exit, which is what `play()`
  already does with a live one-shot.

**One thing was tried, measured and REJECTED.** `turn()` pivots the body about the
planted foot, but only while a gait is on stage; a yaw applied over a stationary
loop rotates about the body origin and sweeps the toe around a ~0.12 m arc.
Extending the pivot to stationary loops looks obviously right and is wrong:
pivoting about the foot MOVES THE BODY ORIGIN, and `_dodge` predicts closest
approach from each body's NOMINAL GAIT SPEED, so a yielding body turning at
2.4 rad/s about a foot 0.12 m away travels 0.29 m/s while reading as stationary.
Measured: A96's pairwise separation went from 0.656 m with **0** frames under the
bar to **0.093 m with 226 frames under it**, two walkers merged. The arc it was
meant to remove is worth 0.017–0.019 m of drift on a 0.08 m bar, so the body
origin stays put for a stationary loop. `NpcSystem._look` still routes its facing
turn through `turn()` — behaviour unchanged, but there is now one door.

## 5. The no-skate contract

An NPC's translation is **derived from its animation**, not corrected after it:

1. find the support foot (lower toe, 1.5 cm hysteresis);
2. read how far it moved backward in character space this step;
3. move the body forward by exactly that.

The planted foot is the fixed point of the update, so it cannot drift. Turning
rotates the body **around** the planted foot rather than around its own origin —
while a GAIT is on stage. Over a stationary loop the body origin is the pivot
instead, deliberately: see §4e for the measurement that says why.
Speed is the clip's own (`Walk_Loop` measures 0.927 m/s, `Walk_Formal_Loop`
1.015, `Jog_Fwd_Loop` 3.032) times `action.timeScale` times the NPC's scale —
and because the rate scales the foot's velocity too, slowing an NPC down cannot
introduce skate either.

A fourth rule joined them in round 3: **a base loop that is not a gait has to
measure in place**, because only a gait drives the body. `measureLoopTravel()`
bakes the cycle travel of every slot this lane can stage and `play()` refuses
anything over `IN_PLACE_MAX` (0.05 m/s) — see §4d for the clip that failed it.

`A97-npc-no-skate` measures the toe bone's own world position — not the lock's
carried pivot, which is invariant by construction and can only ever report zero —
on WALKING AND WORKING NPCs (`standingFeet()`). Five consecutive runs: maximum
stance drift **0.0173-0.0348 m** across six runs against the 0.08 m bar,
82-119 working windows per run, zero `_unstick` events.

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
  `ctx.npcs`. Re-measured on the round-3 code: scene objects **−716**, NPC
  colliders **13 → 0**, interactables **−12**, textures **−13** (the skeletons'
  bone textures), `ctx.npcs` null, no `npc-crowd` group, zero console errors.
  Geometries read **−8**, not −13, and that is the instrument rather than a
  leak: `renderer.info.memory.geometries` counts geometries that have been
  DRAWN (docs/ROUND4-MEMORY.md §6.4), and five of the thirteen bodies were
  outside the draw distance when the probe ran. The crowd is built once at boot
  and never respawns, so it contributes nothing to `A90-memory-stability`'s
  growth window; the round-3 cycle-travel bake runs once on ONE throwaway
  skeleton that is released, and the update loop still allocates nothing per
  frame (the new crossfade scan reads the layer set's own array, not a Map
  iterator).
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

Round 3 added measurement, never tolerance. No bar moved. A96 gained a 10 cm
histogram of the crowd's closest pair plus its 1st percentile and `unstickTrace`;
A97 gained the working half of the crowd, a stance window taken from the gait
bake, a required minimum of working windows so it cannot go blind again, a
readback of `loopTravel` against `IN_PLACE_MAX`, and `excludedCrossfade` /
`maxDriftDuringCrossfadeM` so the one class of window it excludes is printed with
its worst number.

All five together in one run on the final code (port 5218): `A95-npc-roster`
PASS 14.3 s, `A96-npc-animated` PASS 89.9 s, `A97-npc-no-skate` PASS 38.9 s,
`V40-settlement-life` PASS 29.9 s, `V41-npc-closeup` PASS 21.2 s.

Latest full-lane state (port 5218): `A95-npc-roster` PASS (13 NPCs, 13 distinct
signatures, 6 builds, 13 unique skeletons); `A96-npc-animated` **17/17 PASS in
isolation** and once inside the full suite; `A97-npc-no-skate` **6/6 PASS in
isolation** and once inside the full suite;
`V40-settlement-life` PASS (13 NPCs in frame, 8 distinct activities across 7
clips at 19:24 — `idleTalk`, `walk`, `fixing`, `sitTalk`, `interact`, `idle`,
`swordIdle`); `V41-npc-closeup` PASS (SONA 1.843 m tall build vs BAST 1.778 m
broad build, knee swing 1.245 / 1.257 rad, arm drop 0.540 / 0.426 m, 8.18 / 8.24 m
travelled in 8 s = the gait's nominal 1.02 m/s, worst wrist gap 0.0082 m, maximum
procedural lean 3.4 degrees).

`A90-memory-stability` PASS (30 kills, heap **-8.3 %**, geometries +34, textures
-19, scene objects -580), `A90-memory-stability-expansion` PASS (nonMachineGrowth
**0**, orphan machine roots 0, heap -6.1 %) and `A90-rig-reclaim` PASS
(geometries +4 against a budget of 40) on the final code: the crowd is
still built once at boot and never respawns, the boot-time cycle bake runs on one
throwaway skeleton that is released, and the update loop still allocates nothing
per frame (the crossfade scan reads the layer set's own array rather than a Map
iterator).
