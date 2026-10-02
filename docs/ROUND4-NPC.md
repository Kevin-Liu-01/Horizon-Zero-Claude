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
                         //   (+ hipsStart / hipsEnd: pelvis height on its first
                         //   and last frame — what a sit or a stand measures, §4h)
ctx.npcs.signature(n)    // mesh + vertex-colour fingerprint of one NPC
ctx.npcs.crowdSpacing()  // { min, a, b, states } — the closest two people NOW
ctx.npcs.unstickCount()  // total rescues; A96/A97 fail the build on any
ctx.npcs.unstickTrace()  // last 16 rescues: { id, why, state, x, z, t }
ctx.npcs.talkHoldStats() // { frames, secs, id } the speaker animated while the card froze the world (§4g)
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

`ctx.npcs.talkTo(id)` stops the NPC, turns the head at once and the body by
STEPPING round to face the player (§4f), plays a talk gesture, emits `npc-talk`,
and then hands off:

- if `progression.NPCS[id]` exists (all thirteen today), it calls
  `progression.talkTo(id)` and the conversation card opens synchronously;
- otherwise it only emits, carrying that NPC's authored `lines`.

A conversation `progression` opens WITHOUT going through `talkTo` (VARL's own
`TALK · VARL` prompt) is picked up from `dialogue-open` and engages the speaker
the same way. While the card is open the speaker keeps turning and gesturing
even though the card has frozen the rest of the world (§4g).

A SEATED speaker (VALA, KARST on the fire ring) whom the player addresses from
more than 1.2 rad off their heading stands up (`Sitting_Exit`), steps round to
face her, talks on their feet, and goes back to the seat once the conversation
is over; from in front they stay seated and turn their head (§4h). While the
card is open the speaker's talk timer does not run down — in normal play too —
and a speaker's head follows the player all the way round.

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
bar to **0.093 m with 226 frames under it**, two walkers merged.

~~The arc it was meant to remove is worth 0.017–0.019 m of drift on a 0.08 m bar~~
— **WRONG, and corrected in fix round 4 (§4f).** That figure was A97's worst
window, and A97's sample could not contain a turn: it drops the player at
(22, 30) and sleeps 6 s before the first window opens, so every NPC near the
player had finished turning. A judge stood the player 1.6 m behind THOK and
measured the real cost: **0.30 m of planted-toe drift per 0.667 s stance window**
(3.8x the bar), 0.99 m of toe path, the body origin motionless. The rejection of
the foot pivot stands; the conclusion that the origin pivot was good enough does
not. §4f is what replaced it.

## 4f. FIX ROUND 4 (residue r1) — a standing body turns by STEPPING

Judge finding (major): *turn-to-face and yield-escape turns still skate the
planted feet on standing NPCs; the round-3 comment claims `turn()` fixed it, and
A97 cannot see it.* All of it was true. Filmed by the judge with the player
standing 1.6 m behind THOK (`work` / `interact`): `_look` turned him 3.142 rad in
about 2.2 s, body origin moved 0.000 m, planted left toe **0.295 / 0.304 /
0.304 m per 0.667 s stance window**, 0.99 m of toe path. `turn()` only pivoted
about the foot for a GAIT (`this._have && this.rootMotion`); over a stationary
loop it yawed about the origin. Reproduced on 5218 before touching anything, on a
kneeling THOK: **1.917 m of left-toe ground slide** in one 3.1 rad turn.

### What changed

**`NpcAnimator.turn(dYaw, goal)` steps a standing body round.** The pack has no
turn-in-place clip, and neither pivot is free over a stationary loop (the origin
pivot sweeps both toes; the toe pivot sweeps the other toe AND moves the origin,
which round 3 measured merging two walkers). So:

- the **body** yaws about its own origin — `_dodge` / `_separate` still see a body
  that is not moving, which is what the round-3 rejection was protecting;
- each **foot** is pinned — ankle position and heading — by a two-bone leg solve
  (`_solveLeg`: knee bend by the law of cosines about the leg's own hinge, then a
  minimal swing about the hip, foot heading re-applied about world up), written as
  local quaternions over the clip pose and refreshed before the foot lock reads
  the toes;
- a planted foot twisted `STEP_YAW` (0.45 rad) out of line with the body, or
  `STEP_POS` (0.07 m) from where the clip wants it, is **lifted** `STEP_LIFT`
  (0.065 m x body scale), carried to where the clip wants it under the heading the
  body will have when it lands (lead clamped toward — never past — the caller's
  goal), and put down, over `STEP_TIME` (0.36 s). The first and last 15 % of the
  swing are pure lift and pure descent, so **horizontal travel only happens with
  the foot off the ground**. While the turn runs the feet alternate like a gait;
- a planted foot twisted past `TWIST_MAX` (0.8 rad) holds the body turn back
  until the other foot lands (`heldRad` in the probe: 0.002–0.053 rad per π turn —
  the feet keep up);
- when the turn stops, a foot still out of line by more than 0.035 rad / 0.012 m
  takes one settling step, and the solve fades out over 0.15 s with the pins
  already on the clip's own feet;
- a pose with no honest step — kneeling (`Fixing_Kneeling`), seated — **does not
  turn at all** (`canStep`); the head still tracks.

The legs joined the write-back cache of §6: `Idle_Loop` holds its legs on
near-constant tracks, so without it a solved leg would have stayed solved after
the solve let go.

**Every yaw write on a standing body goes through that door.**

- `_look` (turn to face a player within 2.55 m, or anyone the player is TALKING
  to, within 6 m) — `turn(…, want)`.
- The `SEP_HARD` escape turn during a yield — `turn(…, n.escape)`.
- `talkTo` **assigns no yaw** (it snapped `rotation.y` in one frame). The body is
  put in state `talk` and `_look` steps it round. ~~*Trade-off, stated plainly:*
  the conversation card (`src/ui/dialogue.js`) sets `ctx.state = 'dialogue'`,
  which freezes the simulation outside `?shot` mode, and progression's gates
  require `talkTo()` to open the card synchronously — so a person spoken to from
  directly behind, before `_look` has brought them round (it starts at 2.55 m,
  the TALK prompt appears at 2.6 m), finishes the turn when the card closes.~~
  **Withdrawn in fix round 5 (§4g):** a judge measured what that "trade-off"
  really cost — the speaker held the WHOLE conversation with their back to the
  player — and the speaker is now animated while the card has the world frozen.
  In shot mode (every gate and every judge film) they always stepped round while
  the card was up, which is why no gate saw it; `A97b-npc-talk-freeze` runs the
  same turn with the freeze in force.
- **Arrival snaps, same artefact, same cure.** `_startWork` assigned the heading
  to the station on arrival and `_goSit` to the fire: measured on 5218 before the
  change, three work arrivals in 90 s snapping **0.341, 0.506 and 0.649 rad** in
  one frame. `_faceFirst` now puts the arriving body in state `face` (standing,
  `idle`) and steps it round, then kneels / works / sits; a residual under
  `FACE_OK` (0.05 rad = 6 mm of toe) is kept. After the change: **0 standing-body
  yaw changes over the turn-rate bar in 2973 frames (90 s)**, one `face` event
  (OLIN, 0.131 rad, 1.09 s, 2 steps).

The false comments are corrected: `npc.js` `_look`, the escape turn, `_separate`'s
`SEP_HARD` note, `SEP_WALK`'s header, `GRIND_STOP`'s note, and the `turn()` doc
itself; §4e's "0.017–0.019 m on a 0.08 m bar" is struck through with the reason.

### A standing body that is SHOVED steps too

The new A97 turn phase is not what failed first — the OLD phase did, on the first
run of the new gate: BAST idle, a judged shove window of **0.2984 m**. Traced
frame by frame, and then on a copy of the round-3 build (commit 5f30beb) served
from a scratch directory on another port: a walker passing a stander inside
`SEP_R` (0.80 m) moves the stander at up to ~0.45 m/s, planted feet and all.
Same events on both builds at the same camp times: **NIL shoved 0.39–0.51 m by
OLIN, VARL 0.15–0.25 m by MARIS, DELVE 0.08–0.11 m by BAST, TEB 0.084 m by OLIN.**
It predates this round and it is the same artefact the finding is about — a
standing person's planted foot sliding — so it got the same cure:

- `NpcAnimator.shift()` on a body that can step **keeps the feet where they are**
  and lets the step machinery walk them after the body (faster swing,
  `STEP_TIME_SHOVED` = 0.26 s, landing lead from the shove's own velocity capped
  at 0.15 m, the foot on the side the body is going leads); `afterMove()`
  re-solves the legs after `_settle`, so the drawn frame and the probe have the
  planted feet on their pins rather than carried one frame's shove. The BODY
  still moves exactly as before, so the crowd's separation guarantee is
  untouched (A96 below).
- a body that cannot step (kneeling) is **rooted like a sitter** in the crowd
  backstop (`sepWeight`): it pushes, it is not pushed; the walker takes the whole
  correction at the skate-safe `SEP_WALK` and `_dodge` / `SEP_HARD` do the rest,
  exactly as they always have for sitters.

Measured over 60 s of camp time, player at (22, 30), same probe on both builds:
planted-toe windows over 0.05 m — **0 and 0** in two runs on this build, **1**
(VARL, 0.194 m) on the round-3 build, and 1, 2 and 4 on an intermediate build that
had the stepped turn but still carried a shoved body's feet; and a ground-contact
trace over every
standing toe, support or not — **0 windows over 0.04 m in 709 judged** on the
final code against **5 over 0.04 m in 654 (worst 0.169 m, VARL shoved by MARIS)**
on the round-3 build (commit 5f30beb, served from a scratch copy).

### Measured

- The judge's own staging, repeated on the final code (player 1.6 m behind a
  standing worker): THOK `work`/`interact` turned **2.969 rad in 6 steps**,
  planted windows **0.000–0.004 m**, toe path while on the ground **0.002 /
  0.019 m** (L/R) against the judge's 0.99 m of toe path, body origin moved
  **0.000 m**, max yaw step 0.054 rad/frame, toes lifted 0.083 m at mid-swing. The
  chords are unchanged (0.681 / 0.640 m) — the feet DO end up on the other side of
  the body; they get there through the air.
- **`A97-npc-no-skate` 10/10 PASS in isolation on the final code**, with the new
  turn phase in every run. Turn phase: two approach turns and one talk turn per
  run, each **2.80–3.41 rad in 6–14 steps** (the 14 is VARL being spoken to from
  behind while MARIS walked past and the crowd backstop moved him 0.456 m — he
  turned AND stepped after the shove, worst stance window 0.0022 m); stance drift
  WHILE TURNING worst **0.0031–0.0183 m** per run, ground-contact slide (both
  toes) worst **0.0055–0.0177 m**, 13–24 judged turn windows and 19–29 contact
  windows per run, `talkToSyncYawChangeRad` **0** in all ten. The crowd probe
  alongside it: worst stance drift **0.0047–0.0287 m**, 99–150 working and 62–110
  walking windows per run, **zero `_unstick`**, crossfades excluded and printed
  (41–60 per run). Bar 0.08 m, unchanged. (An earlier block of eight on the same
  code before the per-subject hitch calibration below: 6 PASS, 2 blind FAIL with
  0 and 2 turn windows judged — every subject had turned π.)
- **`A96-npc-animated` 10/10 PASS in isolation on the final code** — the stepping
  moves no body, and rooting kneelers did not cost the crowd its spacing:
  minimum pairwise separation **0.616–0.660 m** (bar 0.55), `framesUnderSeparationBar`
  **0** in all ten, 1st percentile in the 0.6–0.7 m bucket in all ten; over 13,339
  sampled frames: 0.6–0.7 ×652, 0.7–0.8 ×919, 0.8–0.9 ×647, 0.9–1.0 ×1321,
  1.0–1.1 ×1588, 1.1–1.2 ×1097, 1.2–1.3 ×584, 1.3 m+ ×6531, nothing under 0.6.
  `unstickEvents` 0, `worstPushedM` 0.04–0.60 (bar 1.5), travellers 6–7, 13/13
  with three clips, no stuck layers. (A previous block of ten, before the last
  engage-on-shove fix: 10/10, 0.599–0.662 m.)
- Found while verifying and fixed before the final blocks: the first time the
  crowd shoved a body that had never turned, `afterMove` re-solved its ankles to
  a never-written target height — one frame with the feet pulled to the floor.
  `_engageHere` now seeds the targets and the body height from that frame's own
  matrices; first-frame toe heights read 0.013–0.015 m (the rig's floor offset).
- Arrival snaps after the change, 90 s of camp time: **0** standing-body yaw
  changes over the turn-rate bar in 3251 frames; one `face` arrival (OLIN,
  0.120 rad, 1.09 s).
- Film: `shots/npc-r4-stepturn-trail.png` (top-down, the judge's framing; red =
  left toe on the ground, blue = right toe on the ground): discrete footprints —
  four per foot round the circle — where the judge's frame had a continuous red
  and blue ring. `shots/npc-r4-stepturn-mid.png`: THOK frozen mid-step, near boot
  clear of the ground with its shadow under it, far foot planted.
  `shots/npc-r4-shove-step.png`: BAST (idle) frozen mid-step while DELVE walks
  past at 0.84 m.

## 4g. FIX ROUND 5 (residue r2) — the speaker is not frozen with the world

Judge finding (major): *live (non-shot) play — an NPC spoken to from behind or
the side holds the whole conversation with their back to Aloy.* True, and caused
by §4f. `talkTo` stopped snapping the heading in fix round 4 and left the turn to
`_look`; but the conversation card (`src/ui/dialogue.js`) parks `ctx.state` on
`'dialogue'`, and main.js's `live` test excludes that state unless the page is
under `?shot` — so in a real session no system ticks while the card is up, and
the turn (and the `idleTalk` / `interact` crossfade) stood still. The judge's
probe (`--noshotmode`, arrive from behind, stop at 2.5 m, hold 0.35 s, talk):
NIL at **2.862 rad** of heading error when the card opened and at every 0.5 s
sample for 3 s, simulation time during the card **0**, crouched mid-crossfade
with his back to the camera. Round 3 (the snap) read 0 for the whole card. Every
gate and every judge film runs under `?shot`, where the world keeps simulating
behind the card, which is why A97, V45 and A99 were all green.

Reproduced on 5218 before changing anything, with the freeze in force: THOK
**2.641 rad** at the card and at every sample for 4 s, sim time 0, 0 steps.

### What changed (`src/world/npc/npc.js`)

**`_holdSpeaker` — the person the card belongs to keeps living while the card
has the world frozen.** Registered on `engine.onAfterRender` (the engine's
published per-frame hook, which runs whether or not the simulation did); main.js
was not edited. `update()` stamps the frame it ran on (`_simFrame`), so on any
frame main.js DID tick this system — normal play, every `?shot` page — the hook
is one comparison and returns. Only when `ctx.state === 'dialogue'` AND the
system was not ticked does it run, and then for exactly one body,
`progression.dialogue.npc`, on the engine's real clock (`engine.wallTime`, which
main.js advances — clamped to its 50 ms frame ceiling — even while frozen):

- `_look` — the stepped turn to face the player (§4f, unchanged: 1.4 rad/s,
  feet held and stepped) and the head;
- `anim.update` — the mixer (`idleTalk`, the `interact` gesture over it, their
  crossfades), the step machinery and the foot lock;
- `_settle(n, dt, false)` — ground and world collision only. The crowd push is
  NOT run: everyone else is frozen, and a push from a body that is not moving
  would only shove the speaker;
- `afterMove`, the collider and the TALK prompt, exactly as `update` does.

It does not run `_brain`: nobody else moves, and the speaker's talk timer does not
run down while they are being spoken to (it resumes when the card closes). The
update lands after the frame is drawn, so the next frame shows it — one frame of
latency on a two-second turn.

**Every conversation, not only the ones `talkTo` opens.** VARL's `TALK · VARL`
prompt belongs to `progression` and calls `progression.talkTo('varl')` directly,
so VARL never went through `talkTo` at all. `talkTo`'s body is now
`_engageTalk(n)`, and a `dialogue-open` that did not come through `talkTo`
(`_inTalkTo` guards the re-entrant case) engages the speaker the same way.

**Memory.** One closure and one event subscription, made once at construction;
`dispose()` splices the hook out of `engine.onAfterRender` and unsubscribes. The
hold allocates nothing per frame (`_hold` is preallocated; the stepping and the
leg solve were already allocation-free). **Corrected in §4h:** it did allocate —
two small objects per speaker-frame inherited from the crowd update
(`_lockFeet`'s result, `_resolveBody`'s options); both are reused since.
`ctx.npcs.talkHoldStats()` publishes
`{ frames, secs, id }` so a probe can see the hold did the work.

### The gate: `A97b-npc-talk-freeze`

The judge asked for a variant of the talk turn with the freeze in force. A97's
turn probe was lifted verbatim into one shared page-context helper
(`TURN_PROBE` in `tools/gates.round4.npc.mjs`) so A97's turn phase and A97b run
the same windows and cannot drift apart; it gained a `'talk-live'` mode. A97b
puts the player 1.6 m directly behind a standing person, removes `shot` from
main.js's own `URLSearchParams` (`ctx.params` IS that object) for exactly the
life of the card — main.js then freezes the world as it does in a real session —
calls `talkTo`, and holds the card at least 3 s and until the talk gesture has
handed the stage back. `shot` is restored in a `finally`, before the card
closes. It asserts:

- the freeze was really in force: simulation time during the card **0**, every
  other person unmoved, `ctx.state === 'dialogue'` and the card open every frame;
- `talkTo` itself changed the heading by 0 (no snap);
- the heading error came down to **≤ 0.35 rad while the card was open**, within
  3.0 s of the speaker's own clock, and STAYED ≤ 0.35 until the card closed;
- the talk gesture ran: the `idleTalk` layer, taken off the stage by `interact`,
  came back to full weight while the card was open (a frozen mixer does neither);
- A97's bar on the feet while they turn: stance windows ≥ 3 judged, worst
  ≤ 0.08 m, ground-contact slide ≤ 0.08 m.

Proved to catch the finding: the same gate run with the hold taken off the render
hook (the pre-fix behaviour, emulated in-page) **FAILS** — heading error 3.142 rad
at every sample, `facedWhileCardOpen`, `stayedFacing` and `talkGestureRan` false,
sim time 0.

### Measured

- **`A97b-npc-talk-freeze` 10/10 PASS in isolation** (port 5218). Speaker THOK
  (`work` / `interact`) every run, heading error **3.142 rad** at the card →
  **0.000** at close; faced (≤ 0.35) after **2.04–2.11 s** of the speaker's clock
  (2.07–3.20 s of wall on a box running 14–22 fps); worst error after facing
  0.305–0.347 rad (the first sample under the bar); talk gesture handed back at
  1.95–3.00 s; **6 steps**, body origin moved **0.000 m**; stance drift while
  turning **0.0000–0.0027 m** (4 windows each), ground-contact slide
  **0.0122–0.0207 m** (5–7 windows) against 0.08; simulation time during the card
  **0**, others moved **0.0000 m** in all ten.
- The judge's own probe, true non-shot page (`__GAME__.start(false)`, no `shot`
  param at all): THOK 2.647 rad at the card → **0.006 rad** after 1.67 s, held for
  the rest of the 4 s sample; 6 steps, heldRad 0.005, sim time 0, 143 hold frames.
- VARL through `progression`'s own prompt path (`progression.talkTo('varl')`,
  freeze in force, from directly behind): 3.142 → 0.234 → **0.000 rad** in about
  2 s, 6 steps, state `talk`.
- A seated speaker (KARST on the fire logs): body yaw unchanged (seated — no
  honest step, as before — **the film judge's r1 major; superseded by §4h**), `sitIdle` → `sitTalk` crossfade completed and the
  pose animating through the card, sim time 0.
- **`A97-npc-no-skate` 5/5 PASS in isolation** on this code (its turn phase now
  runs from the shared `TURN_PROBE`): crowd worst stance drift 0.0066–0.0642 m
  (the 0.0642 is one clean 0.74 s idle window on BAST in run 2 — the crowd probe
  opens no conversation, so no line of this round runs in it), 76–116 working
  and 68–94 walking windows, 0 rescues; turn phase stance drift 0.0044–0.0064 m,
  ground contact 0.0051–0.0535 m, 12–18 turn windows, 6–7 steps per π,
  `talkToSyncYawChangeRad` 0 in all five. Bar 0.08 m, unchanged.
- Film, true non-shot page, the judge's staging (player arrives from behind,
  stops at 2.5 m, holds 0.35 s, talks), camera on a clear 3/4 line chosen by
  raycast: `shots/npc-r5-talk-live-front-mid.png` (card open 0.9 s, THOK side-on
  mid-turn, 2 steps, error 1.395 rad), `shots/npc-r5-talk-live-front.png` (card
  open 3.2 s, THOK facing Aloy, error 0.000, 6 steps) and
  `shots/npc-r5-talk-live-compare.png` (those two beside the same frame with the
  hold taken off the render hook: his back to Aloy at 2.722 rad). The judge's own
  over-the-shoulder framing, `shots/npc-r5-talk-live.png`, reads 0.057 → 0 rad
  by 2 s but Aloy's quiver and bow cover THOK from that camera.
- Teardown with the card up and the speaker mid-step: `ctx.npcs.dispose()` takes
  the hook out of `engine.onAfterRender` (3 → 2) and the `dialogue-open`
  subscription (1 → 0), `ctx.npcs` null; frames kept rendering with the card
  still open, then a VARL conversation opened with no crowd listening — no system
  errors, no console errors.

## 4h. POLISH (film judge r1, 70) — a seated speaker stands up to talk

Judge finding (major): *seated speakers (VALA, KARST) talk with their back or
shoulder to Aloy for the whole conversation, and their head does not track her.*
True on 5e0a9b3: `_engageTalk`'s seated branch only swapped to `sitTalk`, `_look`
left `sit` out of `facingPlayer`, and `NpcAnimator._look` dropped any target more
than 1.45 rad off the nose to idle drift. A97b could not see it — `pickSubject`
only picks standing people.

**ORCHESTRATOR RULING Sep 26** (docs/ROUND4-AUDIT.md §4 "npc"): a seated speaker
whose bearing error to Aloy exceeds ~1.2 rad at `talkTo` sit-exits, turns with the
stepped turn + head tracking, talks standing, and returns to the seat when
`talkT` runs out; A97b gains the seated case. Applied as written.

### What changed

`src/world/npc/npc.js`
- **`_engageTalk`, seated branch** — bearing error over `STAND_TO_TALK` (1.2 rad):
  `NpcAnimator.standUp('idleTalk')`, state `talk`, `talkT` 5.5 s. `_look` then
  steps them round (the existing stepped turn, unchanged) the moment the exit
  has left the stage (`canStep`). Under 1.2 rad they stay seated on `sitTalk`
  and turn their head, which reaches that far on its own. Nothing here needs
  `_brain`: the exit hands the stage to `idleTalk` on the mixer's own clock, so
  the conversation hold (`_holdSpeaker`, §4g) runs the whole stand-up under the
  dialogue freeze.
- **Back to the seat** — `talkT` runs out → `_replan` → `_goSit` (a sitter's
  existing path): `_faceFirst` steps them round to the fire and they sit. Two
  things in that path had to change for it to work with the player still
  standing there: a sitter turning back to the seat (`face`, `faceThen: 'sit'`)
  no longer waits for the player to leave — it used to hold until `faceT` ran
  out and then ASSIGN the rest of the turn in one frame — and while turning back
  it is rooted in the crowd like a sitter (a passer-by shoved KARST 0.50 m off
  his seat in that turn in one gate run).
- **The talk timer does not run down while the speaker's card is open**, in
  normal play as well (`_isSpeaker`). Under the freeze nothing ticked anyway;
  under `?shot` a seated speaker would otherwise sit back down, and a standing
  one walk off to work, in the middle of the conversation. `_tickSit` likewise
  does not swap loops or get up to leave while its card is open.
- **A person in a conversation holds their ground** (`SEP_W('talk')` 0.45 → 0,
  and `_dodge` gives them a sitter's berth). Measured before: KARST, stood up
  to talk by the fire, shoved 0.98 m by a passer-by mid-conversation (A97b
  normal play), then walked back to a seat 0.68 m off his mark.
- **The seat drop moves with the pelvis.** `_seat` used to measure the pelvis on
  the first frame after `_goSit` — still standing — hit its −0.30 m clamp and
  write it straight into `yOffset`, so every sit began with a STANDING body
  sinking 0.30 m into the ground over a few frames, and every sit-leave popped
  a seated one 0.30 m up. The number is kept (both sitters have always been
  drawn at −0.30: the fire-ring logs `_seat` was written for are not in the
  settlement any more), computed from the boot-time bake before the sit, and
  `_settle` blends it by `NpcAnimator.hipsK` — 0 seated, 1 standing, read off the
  live pelvis against the clips' own pelvis heights.
- **Feet on the ground while seated** (`NpcAnimator.seatDrop`). That −0.30 m drop
  had both sitters' toes 0.29 m under the ground for as long as they sat (film:
  `shots/npc-seat-before.png`, shins cut off at the dirt). The animator now
  raises each ankle back by the drop and the two-bone leg solve folds the knee:
  they sit low with their knees up and their boots on the ground
  (`shots/npc-seat-after.png`). The stepped solve adds the drop to its own
  targets and hands the legs straight to this solve when it releases.
- `_resolveBody`'s options are a frozen module constant (minor, below).

`src/world/npc/npcAnim.js`
- **`standUp(base)`** stages `Sitting_Exit` over `base` with its last frame HELD
  one fade length. Measured on the rig: the exit steps the right foot back
  0.39 m (ankle lifted 0.07 m) between 0.67 s and 1.0 s, but a one-shot starts
  handing the stage back one fade before its clip ends — the old sit-leave
  (onDone at 0.7 s) crossfaded out of the frame just before that step and slid
  the still-forward right foot 0.43 m along the ground in 0.3 s. Held, the
  hand-back starts from the finished stance, which is the standing loops' own.
  The sitter's own leave-the-seat beat uses the same call.
- **`sitDown(seatLoop)`** is `_goSit`'s staging tracked as a transit, with a
  0.05 s fade on `Sitting_Enter`: that clip starts in `Idle_Loop`'s own pose
  (feet, pelvis, head within 3 mm) and steps the right foot forward 0.05–0.48 s
  in; a 0.25 s crossfade held the lifting toe down under the idle's weight while
  it moved (0.066 m of toe drag within 3 cm of the ground, measured). That left
  the clip's own scuff — its right toe travels 0.054 m forward before it is 3 cm
  up — which A97b's no-exclusion planted-foot term read as 0.03–0.077 m depending
  on where the frames fell (eight runs at 0.05 s, three over 0.073 against the
  0.08 bar). So **`_liftFirst`** holds each toe where it stood as the sit began
  until the clip lifts it (the whole foot translated so the toe stays put and the
  heel rises as authored; the hold fades between 2 and 4.5 cm of toe height,
  first 0.4 s of the sit only): the same term now reads ≤ 0.024 m.
- **`lookWide`** (set by `NpcSystem._look` for anyone in state `talk` or whose
  card is open): the head no longer gives up past 1.45 rad; the look reaches
  1.9 rad, the neck and head keeping their 1.25 and the upper spine taking the
  rest. Dead behind (within 0.14 rad of pi) the look keeps its side
  (`lookSide`) and `_look` turns the body toward that side — before, the head
  swung from +1.9 to −1.9 rad across the chest in 0.3 s as the body started
  round the other way. While a reachable target is tracked, the body's own yaw
  since last frame is taken out of the look, so the eyes hold their world
  bearing while the body turns under them (the ease had trailed by ~0.3 rad).
- The bake (`measureLoopTravel`) also records each clip's pelvis height on its
  first and last frame (`hipsStart` / `hipsEnd`); the last frame is read on its
  own, because at t = duration a repeating action has wrapped to its first
  (the first cut read `Sitting_Exit`'s END as seated and the seat drop popped).
  Travel numbers are untouched.
- `_lockFeet` returns one reused record (minor, below).

### The gate: `A97b-npc-talk-freeze` gains the seated case

Recorded in the gate header. The standing case is unchanged. Added: both seated
speakers, from BEHIND (pi) and from the SIDE (+pi/2 under the freeze, −pi/2 in
normal play), in the frozen-world state (`talk-live`) and in normal play
(`talk`, `?shot`, the world running behind the card) — eight conversations,
player 1.8 m away, through the same `TURN_PROBE` (a named-subject mode; the
standing path is textually unchanged). Each must: stand up (`Sitting_Exit` at
full weight, state `talk`); face her (≤ 0.35 rad) while the card is open within
3.0 s + the stand-up (1.0 s clip + 0.3 s hold + 0.3 s hand-back, read from the
bake: 4.6 s) of the speaker's own clock, and stay facing to the close; keep the
drawn head bone within 0.35 rad of her, or of the most a 1.9 rad look reaches,
every frame from 1 s on; run the talk gesture; show the freeze in force
(`talk-live`: sim time 0, nobody else moved); keep A97's stance and contact
windows ≤ 0.08 m while on their feet, AND the planted foot ≤ 0.08 m through the
stand-up, turn, return and sit-down with NO crossfade exclusion (the any-toe
contact term over that span is reported: the pack's own sit clips begin and end
their steps with a few cm of toe scuff); and after the card, be back on the seat
— settled, ≤ 0.7 m from the mark (`_goSit`'s own rule), ≤ 0.1 rad from the seat
heading, the seat drop restored — with no heading change over 0.1 rad in one
frame on the way.

**Proved to catch the finding:** the same gate on the pre-fix tree (HEAD df66655 via
`git archive` — the npc files as committed in 5e0a9b3 — with only the new gate
file copied in, on scratch port 5238) FAILS all eight
seated runs — body error 3.142 / 1.571 rad at the card and at the close, never
faced, head error 2.97–3.13 rad from behind and 1.07–1.56 from the side
(`headTracked` false in 7 of 8; KARST's side run tracked at 1.37 rad, inside the
old 1.45 reach, and still never faced), `stoodUp` and `talkGestureRan` false in
all eight. The standing case passes there, as it should.

### Measured

__MEASURED__

### Film (Aloy's chase camera, read)

`shots/npc-seat-r1-vala-live-behind.png`, `npc-seat-r1-karst-live-behind.png`
(freeze in force, from behind) and `npc-seat-r1-vala-play-side.png`,
`npc-seat-r1-karst-play-side.png` (normal play, from the side): ten frames each,
cropped round the speaker. Before `talkTo` the speaker sits with their back
(or shoulder) to Aloy; 0.3 s the head is already coming round as `Sitting_Exit`
lifts them; 1.1 s up, looking at her over the shoulder with the chest turned;
1.8–3.4 s stepping round, face on her; 4.2 s squared up and talking. After the
card they turn back to the fire, sit (`Sitting_Enter`) and are seated with their
back to her again. `shots/npc-seat-before.png` / `npc-seat-after.png`: the
seated pose before and after the seat-foot solve.

### The r1 film judge's minors

- **Allocation claims** — CLOSED. `_lockFeet` returns one reused record per
  animator, `_resolveBody` passes a frozen constant; the claims in npc.js, §4g
  and §7 are corrected. Per-frame paths of both files re-read for literals: the
  only allocations left are event-rate (beat pools, route legs).
- **Planted feet slide in the crossfades a conversation triggers** — the seated
  transitions are fixed (the stand-up hold; the sit fade) and A97b judges them
  with no crossfade exclusion. The general case (gait → stand, kneel → stand at
  `talkTo`, and A97's crossfade exclusion) is NOT closed: owner npc, next round.
- **The `[E] TALK` prompt stays on screen during a live conversation** — out of
  lane (`src/items/interactables.js` clears it only in `update`, which does not
  tick under the freeze; visible again in the KARST films as "TALK · KARST").
  Owner: items/interactables or shell-hud.

## 5. The no-skate contract

An NPC's translation is **derived from its animation**, not corrected after it:

1. find the support foot (lower toe, 1.5 cm hysteresis);
2. read how far it moved backward in character space this step;
3. move the body forward by exactly that.

The planted foot is the fixed point of the update, so it cannot drift. Turning
rotates the body **around** the planted foot rather than around its own origin —
while a GAIT is on stage, because the other foot is in the air. A STANDING body
has no foot in the air, so (fix round 4, §4f) its body yaws about its own origin
— the crowd logic sees nothing move — and its FEET STEP: held where they stand
by a two-bone leg solve, lifted and put down again round it. A standing body the
world or the crowd shoves steps after the shove the same way.
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
  per-frame allocation in the update. (Corrected in npc polish, §4h: until then
  this line was not true — a judge found two small objects per NPC per frame,
  `NpcAnimator._lockFeet`'s fresh `{ x, z }` result and `_resolveBody`'s fresh
  options record, 26 a frame across the crowd. Both are reused now. What does
  allocate is event-rate, not frame-rate: a beat pool when a fidget or work
  beat fires, a route leg when one is planned.)
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
  skeleton that is released, and the update loop allocates nothing per frame
  (the crossfade scan reads the layer set's own array, not a Map iterator; see
  the Simulation line for the two objects this claim missed until §4h).
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

Round 4 (residue r1) added a TURN PHASE to `A97-npc-no-skate`, as the judge
asked, at the unchanged 0.08 m bar. After the 22 s crowd probe the player is
walked round BEHIND standing people one at a time (state `work`/`idle`/`errand`,
able to step, no beat or replan due inside the turn): two are turned by the
player standing there (`_look`), a third is spoken to (`talkTo`) from behind. Each
one's stance windows are judged while they turn, with the same windows and
exclusions as the crowd probe, and one new term is judged with them:
**ground contact** — ANY toe within 3 cm of the body's floor, support or not, may
not slide more than the same 0.08 m per window (a turn that pivots about one toe
passes the stance window and fails this). The phase requires two approach turns
and one talk turn of at least 2.5 rad each, at least 8 judged turn windows, and
that the `talkTo()` call itself leaves the heading untouched
(`talkToSyncYawChangeRad` = 0). A dropped frame is the crowd probe's rule (45 ms
or 2.5x the median gap) taken on the 40 frames just before each subject: in two
runs out of eighteen the box slowed after the crowd probe calibrated at the
45 ms floor, every later frame read as a hitch and the phase judged 0 and 2
windows — a blind FAIL with every subject having turned π in 6–7 steps. The
0.08 m bar and the 8-window floor are unchanged.

All five together in one run on the final code (port 5218): `A95-npc-roster`
PASS 14.3 s, `A96-npc-animated` PASS 89.9 s, `A97-npc-no-skate` PASS 38.9 s,
`V40-settlement-life` PASS 29.9 s, `V41-npc-closeup` PASS 21.2 s.

Fix round 4 final state (port 5218): `A95-npc-roster` PASS (13 NPCs, 13 distinct
signatures, 6 builds); `A96-npc-animated` **10/10**; `A97-npc-no-skate` **10/10**
with the turn phase; `V40-settlement-life` PASS (13 in frame, 7 distinct
activities at 19:24 — three walkers in stride, a seated talker at the fire, a
kneeling repair, a raised weapon, an idle talker; read at 2x); `V41-npc-closeup`
PASS (SONA 1.845 m vs BAST 1.781 m, knee swing 1.282 / 1.278 rad, 8.23 / 8.29 m
in 8 s, max lean 3.1°). Neighbours that read this lane: `V35-settlement` PASS
(min pose delta 0.181 m), `A99-dialogue` PASS, `A66-quest-objectives-expansion`
PASS and `A65-save-restore-expansion` PASS (both call `talkTo()` and close the
card synchronously), `V45-dialogue-panel` NEEDS-JUDGE — read: AURA stands above
the card facing the camera. Memory: `A90-memory-stability-expansion` PASS (nonMachineGrowth 0, orphan roots
0), `A90-rig-reclaim` PASS (geo +1, tex 0). `A90-memory-stability` PASSED in
isolation on this code (heap −4.4 %, geometries +27, textures −18, objects −445)
and then FAILED its geometry term later the same morning — +45 inside the full
suite, +44 / +44 / +41 in isolation — every time from the LOW baseline mode
(`before.geo` 173; ROUND4-MEMORY.md §6.4: the counter counts first DRAWS and the
baseline is bimodal at 173/174 vs 200). Attributed side by side, at the same time
on the same box: the identical tree with only `src/world/npc/**` put back to the
round-3 commit read **+41 / +42 / +40** (`after.geo` 214 / 215 / 213 against this
code's 217 / 217 / 214) — FAIL, FAIL, PASS-at-the-bar. The stepped turn creates no
geometry and the NPCs' draw-distance rule is unchanged; the term moved with the
rest of the working tree (other lanes' uncommitted `rig/lod.js` merge and
`rig/components.js` work was on disk throughout), not with this lane.
`ctx.npcs.dispose()` with two people mid-step: objects −716, textures −13,
colliders 13 → 0, interactables −12, `ctx.npcs` null, no console errors. The
stepped turn allocates nothing per frame (module scratch vectors, the landing
maths are methods rather than closures), and `NpcAnimator.dispose()` now drops the
leg records and the write-back cache.

Full suite on port 5218 on the final code, run to completion: **237 gates — 180
PASS, 13 FAIL, 4 PENDING, 40 NEEDS-JUDGE**; all five of this lane's gates PASS
inside it (A96 0.656 m min separation, A97 turn phase 0.0025 m stance / 0.0046 m
contact, V40 8 activities) and no FAIL is this lane's.

Round 5 (residue r2) added `A97b-npc-talk-freeze` (§4g): the talk turn with the
dialogue freeze in force, through the same turn probe A97 uses (`TURN_PROBE`, one
page-context helper for both, so the two cannot drift). No existing bar moved;
A97's turn phase is textually the same code, run from the shared constant.

Fix round 5 final state (port 5218): `A97b-npc-talk-freeze` **10/10** in isolation
(and FAIL on the pre-fix behaviour, emulated in-page); `A97-npc-no-skate` **5/5**;
`A95-npc-roster` PASS (13 NPCs, 13 signatures, 6 builds); `V40-settlement-life`
PASS (13 in frame, 8 activities at 19:24 — walkers in stride, two seated talkers
at the fire, two kneeling repairs, a pick-up, a raised weapon, idle talkers; read
at 2x); `V41-npc-closeup` PASS (SONA 1.840 m vs BAST 1.764 m, knee swing 1.263 /
1.243 rad, 8.21 / 8.25 m in 8 s, max lean 3.2°). Memory, on this code:
`A90-memory-stability` PASS (30 kills, heap −5.5 %, geometries +33 from the low
173 baseline, textures −20, objects −722), `A90-memory-stability-expansion` PASS
(nonMachineGrowth 0, orphan roots 0, heap −10.7 %), `A90-rig-reclaim` PASS (geo 0,
tex 0); `A9-perf-budget` PENDING (319 draw calls, under 350; fps 16.6 not
attributable — null-frame GPU 7.21 ms on this box); `A21-real-draw-calls` PENDING
(draw calls 319 / 217 / 346 and triangles PASS; GPU / frame-time terms not
attributable under contention).

Full suite on port 5218 on the final code, run to completion under heavy
contention (load average up to 113): **238 gates — 178 PASS, 17 FAIL, 3 PENDING,
40 NEEDS-JUDGE**. Every gate of this lane PASSES inside it — `A95-npc-roster`,
`A96-npc-animated` (min separation 0.629 m, 0 frames under the bar, 0 rescues),
`A97-npc-no-skate` (crowd 0.0098 m, turn 0.0023 m, contact 0.0041 m),
`A97b-npc-talk-freeze` (THOK 3.142 → 0 rad, faced after 2.1 s, sim 0, feet 0 /
0.009 m), `V40`, `V41` — and so do the neighbours that call `talkTo`:
`A99-dialogue`, `A65-save-restore(-expansion)`, `A66-quest-objectives(-expansion)`,
`V35-settlement`; `V45-dialogue-panel` NEEDS-JUDGE, read: AURA stands above the
card facing the camera. `A90-memory-stability` PASS inside the suite too (geo
+16 from the 194 baseline, heap −5.8 %). None of the 17 FAILs is this lane's.
Five of them passed when re-run alone right after (A4-draw-strength,
A27-timescale-safe, A32-draw-ramp, A69-death-choice, A75c-suspicion-scan); the
rest, by owner: animator A17-draw-beats; core-platform A20b-no-system-errors
(systemErrors and hook errors both empty — it fails on `framesAdvanced` 91 / 103
< 120 frames on this box, alone as well); core-platform-followup2
A81-canon-speed-bands; machine-rig A44-socket-integrity, A47-corpse-grounded,
A47c-corpse-mass, A48-cadence, A50b-aim-on-drawn-geometry; machine-ai-expansion
A41c-expansion (protocol timeout after 909 s at the load peak); player-control
A31b-no-ghost-without-occluder; spatial A23-aim-cost, A23b-hull-fidelity.
PENDING: A9-perf-budget (core), A21-real-draw-calls (core-platform),
A31-aim-strafe-skate (animator).

Round-3 full-lane state (port 5218): `A95-npc-roster` PASS (13 NPCs, 13 distinct
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
