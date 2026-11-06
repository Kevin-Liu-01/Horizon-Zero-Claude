# ROUND 5 — settlements (W1, the NPC half; R56, R57 c)

Every near-tier NPC is built like Brea. This is what was built, what it publishes, the gate results measured on port 5264,
my own reading of every frame, and what the frames still owe. Visual rows are the builder's reading only: R29's
independent judge grades them.

## 1. What was built

| item | where |
|---|---|
| Recipe: the cast | `tools/build/recipes/npc/build.mjs` (`node tools/build/build-assets.mjs --only settlements`; `R5_NPC_ONLY=salt-raker,atlas-pan` for a partial build; about 90 s for all nine, deterministic: a rebuild of an unchanged archetype is byte-identical) |
| One person, Brea's construction | `tools/build/recipes/npc/lib/human.mjs`: UBC body, per-archetype face field, paint, separate hair or headwrap with live dyn_ chains, layered outfit, tiers |
| The table | `lib/archetypes.mjs` (faces in game mm, age, tone, brow weight, head, clips, walk style), `lib/outfits.mjs` (MCO parts + faction pieces) |
| Procedural pieces | `lib/pieces.mjs`: palm hat, apron and bib, long skirt and tunic, capelet, cloak, belt, strap, basket, sack, rake, cane, lantern, hammer, goggles, guild chain, cuffs |
| Atlases | `lib/atlas.mjs`: 1024² faction atlas + 512² normal/ORM (neutral: hue is per vertex), the shared 512² hair + wrap atlas |
| Clip pack | `lib/clips.mjs`: 13 UAL2 clips native, 13 UAL1 clips baked per body offline by the kept Retargeter, stride tables |
| The kit | `lib/kit/`: a snapshot of character-art's `tools/build/recipes/lib/{face,skin,skin-human,hair,wrap,wrap-head}.mjs` at **46296b6** (its fix round 1, Nov 6), byte copies except two relative paths in `face.mjs` (see §7) |
| Runtime | `src/world/npc/people/{index,person,pose,bank,chains}.js`, installed from `src/world/camp.js` (3 lines; camp.js is this lane's file, §2); publishes `ctx.people` |
| Gates | `tools/gates.r5.settlements.mjs` (`nice -n 10 node tools/gates.mjs --port 5264 --lane settlements`) |
| Assets | `public/models/npc/*.glb` (9 archetypes, 3 atlases, the clip pack), licence rows `npc-people-bodies`, `npc-faction-atlases`, `npc-clips` |

The Round-4 crowd (`src/world/npc/npc.js`, `props/{settlement,npcs}.js`) stays until the W2 exit (plan §6). The new group
stands apart from it on neutral ground near REST (`ctx.people.stagePlace`, the flattest clear spot on a ring round REST_SITE).

### This session (Nov 6), on top of the previous builder's work

1. **The body folded over (runtime, major).** three's `PropertyMixer` writes a bone only when the clip's value CHANGED since
   its last write. The walk lean, the arm-swing gain, the held arm and the look-at were composed onto the bone's own value,
   so on any constant track (a walk whose spine is still, a held idle, a frozen person) they compounded every frame: the
   r2 frames show a porter lying horizontal in his walk and a raker bent double. The clip player of item 9 writes every bone
   on every update, so every overlay starts from the clip's value. This also explains the old `A-npc-fidelity` chain-travel
   readings of 1.4-1.7 m (now 0.44-0.63 m).
2. **Level eyes.** Measured off the pack, the library's idles and walks carry the head 11-15° down (Idle_Loop -12.7°,
   Walk_Loop -14.8°; R64 b says the same of Brea's idle). A per-clip carriage overlay (`LIFT` in `person.js`) brings idles,
   talks and walks back to level, split neck 40 % / head 60 %; work clips keep their gaze on the work.
3. **The kit refreshed to character-art's fix round 1**, and Brea's generic face fixes mirrored into every face: the nose
   lobule narrows to a defined tip ("the nose is a ball"), a soft hollow under the cheekbone (scaled by age, almost none on
   the adolescent), the ear keeps its source normals (no faceted ears), two-sided coil cards (no pinholes of sky through
   hair), the new collar lid, the nostril and back-light normal passes, the lash and hair-texture pinhole fills.
4. **Hair through cloth:** coil cards near a head band are kept only where everything a 2 cm card could lie on is clear of
   the band (the r1 adolescent showed coils poking through his band).
5. **The adolescent reads younger** from the face: open eyes (no lid droop), a smooth neck column (the source's corded adult
   neck smoothed), a light brow. Every archetype has its own brow weight (`browK`).
6. **Age folds read as folds:** the nasolabial and marionette lines were two thin dark strokes each side of an old mouth;
   they are wide, soft and lighter now.
7. **The Lantern-Keeper no longer wears Brea's colours:** her bodice was the same orchil Peasant bodice as Brea's; it is a
   worn charcoal now and the night cloak and hood carry the orchil.
8. **Aprons fold:** the raker's and the picker's aprons had 6 columns for 3.3 folds (aliased into a board); 11 columns now.
9. **No allocation per frame (A-alloc-rate).** The r3 run put this lane's owner row at 26.8 KB/frame against its 15.3 W0b
   baseline (the guard is binding at 1.1x). 9.8 KB/frame of it was three's `AnimationMixer`: `Interpolant.evaluate` boxes a
   double per track per update (about 40 B a track, 2.5 KB per person per update; measured again with V8's sampling heap profiler
   in node). `src/world/npc/people/pose.js` (`PosePlayer`) now plays the same clips from the same pack into a preallocated pose:
   a cached key per track, nlerp between keys, a cross-fade from a snapshot of the last pose, every bone written every update.
   Against three's mixer on the same clip it agrees to 1 - |q·q'| ≤ 7.5e-8 over 200 frames and through a 0.4 s cross-fade, and
   allocates 0 B per update. `Math.hypot` and `THREE.MathUtils.clamp` calls in the chain solve and the tier sort are inlined
   (a call boxes its number arguments). Writing every bone every update also retires the overlay-restore of item 1.
   r6 measured the owner row at 16.86 KB/frame (1.099x: under the bar) but 961.6 KB/s against 827.0 (1.163x: over, at a higher
   frame rate). The rest was `Matrix4.decompose` in the chain solve and the head overlays (its `determinant()` returns a boxed
   number: about 130 B per person per frame in node's sampling profiler), quaternion getters, a `slerp` with a number argument,
   and tick lengths passed as arguments. `rotOf` (pose.js) reads a world rotation straight off the matrix (agrees with
   `decompose` to 4e-8), the bend limit and the arm-swing gain are written inline, tick lengths and the wind ride in fields, and
   every chain class has one shape. In node the chain solve plus the pose player now allocate 0 B per tick (from about 140).
10. **The group stays once it stands.** It streamed out past 170 m, which changed the scene's object count in the middle of
   `A90-memory-stability-expansion`'s workload (-932 objects outside every machine root: the row demands exactly 0). At W1 it is
   one group of ten, hidden past 90 m (no draw); load and unload per settlement is W2's, with `A-settlement-dispose`.
11. **LOD1 keeps its silhouette.** Every vertex weighted to a `dyn_` or `prop_` joint (tails, aprons, sashes, tools, baskets)
   is locked in the LOD1 simplification (meshopt `vertex_lock`), and the skin gives back what that costs, so LOD1 stays ≤ 8 k
   (7.95–7.99 k). I also tried locking the long skirts and a denser 14 × 32 head shell (r7): the error moved to the shoulders
   and arms and three archetypes got worse (pit farmer 0.048 m), so that is reverted and the shipped build is r5's,
   byte-identical (the recipe is deterministic).
   r3 had the tube smith's apron at 16 triangles in LOD1 (153 near) and a 7.2 cm pop at the change. Chains no longer snap to
   bind when the near tier fades out: the solve stops and the cloth holds its pose, and a solve that restarts seeds from it.
12. **The licence row of the clip pack** named a source row that does not exist (`ual1-standard`); it is `ual1` (in the row and
   in the recipe's provenance).
13. **Gates:** `A97` measures a foot's height over the ground under it (the stage is the flattest place, not a floor);
   `A-npc-atlas-resident` and `A-npc-dispose` stand her facing the group, so the atlases are on the GPU when counted
   (before, the textures never uploaded and the counts proved nothing); the sheets hide grass, scatter props and the
   Round-4 camp while they film (labelled on the sheet), turn off the look-at, frame each head crop on the face's middle
   with the other body hidden, and frame V41 so both walkers are in view.

## 2. How a person is put together

- **Body.** `Superhero_Female` or `Superhero_Male`, uniform scale to the bible's height. The adolescent is male at 0.90 of an adult and wears a long loose tunic; no bone scale of any kind.
- **Male bodies through the kit.** The kit's numbers are in the female pack's frame. A male head is the same head 42.5 mm higher, so male geometry passes through the kit 42.5 mm down and comes back up. Chain and prop points are authored in that frame; the skeleton never moves.
- **Face.** Brea's refinements (alae, nose tip plane and lobule, mandible line, cheekbone hollow, ears, neck) plus the archetype's own vector at each of the seven landmarks, plus lid droop and jowls by age (open lids on the adolescent). Each archetype's `extras.r5Face` carries the vectors for `A-npc-face-delta`.
- **Paint.** `paintHumanSkin` with the person's tone, iris and brow weight, plus age layers (forehead lines, frown, eye bags, crow's feet, soft nasolabial and marionette folds, neck bands, sun spots), a beard (a coil field dissolving at its edge) or stubble, tar to the elbow, carmine to the elbow, burn scars. The forehead's olive cast from the source is corrected; the adolescent's head and neck drop 72 % of the source's adult muscle relief and his neck geometry is smoothed.
- **Hair and headwrap.** `woundHeadwrap` for scarf, wrap with topknot, rag and cap; a one-ribbon band with a knot for bare heads; two-sided coil cards over the scalp under a band; a hood from the MCO part plus an escaped lock on a chain.
- **Outfit.** MCO Peasant (Pan Houses) or Ranger (Crescent Holds) parts, simplified with locked borders, plus procedural pieces. Hue and contact shade ride in `COLOR_0` (u16), so one neutral atlas dresses every person of a faction. Body triangles under cloth go at build time (an inside-collar exemption keeps the neck), which pays for the cloth and gives the face the atlas.
- **Tools.** A tool hangs on a prop joint. The runtime collapses a joint it does not want (`scale` ~0), so a rake moves from back to hand with no draw and no allocation.
- **Motion.** One `PosePlayer` per person (`pose.js`, allocation-free) on the shared clip pack; a walk moves by the clip's own stride table (the planted foot is the fixed point); overlays after the mixer: the walk style's lean and arm-swing gain, a held arm (the porter's basket), the head's carriage (`LIFT`), and the look-at toward her within 5.5 m. The player writes every bone on every update, so no overlay compounds (§1, items 1 and 9). Live `dyn_` chains (hair tail, wrap sash, apron halves, sash ends, shawl ends, cloak halves, a medal, a seed bag) run a Verlet solve from the kept hero solver's physics on the near tier only, with leg capsules so an apron goes round a thigh.

### Tiers (measured from the GLBs of this build)

| tier | meshes | tris (all nine) | draws | distance |
|---|---|---|---|---|
| near | `Skin_L0` (body + eyes), `Hair_L0`, `Outfit_L0` | 15.9–18.9 k | 3 | the 6 nearest within 18 m |
| LOD1 | `Skin_L1`, `Outfit_L1` (wrap folded in as a 10 × 22 shell cast onto the cloth; tails, aprons, sashes and tools kept whole) | 7.95–7.99 k | 2 | 18–35 m |
| LOD2 | `Skin_L2`, `Outfit_L2` | 3.70–3.75 k | 2 | beyond; hidden past 90 m |
| caster | `Caster` (merged, about 2.0 k) | | 1 per cascade | the 4 nearest; no main pass |

The main-pass draw of `Caster` is skipped by a `drawRange.count = -1` set in `onBeforeRender` (three returns before `gl.drawElements`) and restored in `onAfterRender`; the shadow pass does not call those hooks. A tier change is a 0.32 s screen-door cross-fade from a pool of quantised fade materials. All of them share one compiled program, so a tier change compiles nothing. Chains freeze (back to bind) when the near tier fades out. The mixer runs every frame near, at 30 Hz on LOD1, 15 Hz on LOD2.

## 3. Published

```
ctx.people                                      src/world/npc/people/index.js
  .ready                                        true once the staged group stands
  .list : Person[]
  .archetypes : string[]                        the nine ids
  .spawn(id, { x, z, yaw, seed, height, script }) -> Promise<Person>
  .despawn(person)                              disposes collider, mixer + skeleton, releases archetype and atlases
  .stage({ ids, place, faction }) -> Promise<Person[]>   the group; default nine + a second raker
  .clearStage()
  .autoStage : boolean                          true: the group stands once she comes within 130 m of it, and stays (W1)
  .stagePlace : { x, z, r, y }                  the neutral place (flattest clear ring spot round REST_SITE)
  .findStage(opts)
  .tierAt(person, tier | null)                  force a tier for a gate
  .info() -> { count, draws, casters, tris, shadowDraws, atlases, archetypes, people: [...] }
  .bank : NpcBank                               residentAtlases(), entries, atlases, fadeU, casterMat
  .dispose()

Person
  .play(name, { fade, ts, loop, offset }) -> duration
  .current : { name, time, ts, loop, duration, getClip() }   the clip playing (pose.js)
  .pose : PosePlayer                            bind(clip), play(clip, opts), update(step), dispose()
  .walkTo(x, z, then)  .stopWalk()              walks by the clip's stride table
  .showProps(names | null)                      prop joints: prop_hand, prop_back, prop_hip, prop_shoulder, prop_lamp
  .look : boolean                               the look-at toward her (default true; sheets and cutscenes turn it off)
  .lift / .liftTarget                           the head's carriage (rad), set per clip from LIFT
  .info() -> { tier, draws, tris, casting, meshes }
  .chains : PersonChains                        .chains[i] { key, links, tip, tipPos }
  .frozen                                       stops the mixer and the walk
```

Scene child name: `people` (the draw ledger's `npcs` owner, `tools/gates/gates-perf.w0b.mjs`). W2 constructs `Settlements` in `main.js` and should move `installPeople` there.

GLB contract (`extras.r5Npc`): `{ id, n, name, faction, sex, age, adolescent, height, scale, footY, chains: [{ key, root, parent, links }], props, tiers, clips, armPose, layers, procedural, head }`. `extras.r5Face`: `{ landmarks: { k: { v: [x,y,z] mm, deltaMm } }, graded, scale, iou, eyeSocketMaxMm }`. Clip pack `extras.r5Clips`: `{ native, baked, gaits: { 'F|Walk_Loop': { dur, dist, frames, cum } }, pelvisScale }`.

## 4. Gates (port 5264, this tree)

Runs: r5 (Nov 6, 21:18-21:40 UTC, `--only` the lane block + the global list rows that exist here) on the shipped build, r6 (the
three instrument rows r5's Chrome wedged on), r7 and r8 (the allocation work; r8 is the shipped runtime: A1, A20b, A96, A97,
A-alloc-rate and V41 PASS / FAIL as in r5 there), offline checks in node where noted. r7 and r8 also measured a LOD1 experiment
that was reverted (§1 item 11); the fidelity numbers below are r5's, on the build that ships. Visual rows are my reading (§5); R29's judge grades them.

### The W1 block (R56, R57 c)

| gate | result | measured |
|---|---|---|
| **A-npc-fidelity** | **FAIL (6 of 9 archetypes pass every clause)** | every archetype: near tier 16.1–18.9 k tris (bar 15–20 k), 3 draws (≤ 4), face field ≥ 6 mm on 3–5 landmarks, skin 1024² + 512² normal, separate hair or headwrap mesh, 10–13 layered pieces with the faction atlas's normal + ORM, live chains whose tips travel 0.44–0.63 m against the head over 2.5 s of walk (Brea's knot tail 0.248 m in the same measure), a cross-fade with both tiers drawn and a clean end. **Silhouette jump at the 18 m change (≤ 0.02 m):** raker 0.016, matron 0.007, porter 0.009, caulker 0.006, keeper 0.010, follower 0.012 pass; **pit farmer 0.026 (across, y 1.75: the cap's crown), tube smith 0.025 (across, y 1.50: the rag knot), cochineal picker 0.033 (along, y 0.25: the skirt's back hem)** fail. r3 read 0.026 / 0.072 / 0.032 before LOD1 locked the tails, aprons and tools |
| A-npc-face-delta | PASS | every same-sex pair differs by ≥ 4 mm on ≥ 4 of the 7 graded landmarks (worst pair: raker / keeper, 4 of 7); every face is ≥ 6 mm from stock on ≥ 3 landmarks (3–5); eye sockets move ≤ 0.23 mm |
| A-npc-variety (W1 clauses) | PASS | 9 of 9 pairwise-distinct silhouettes (front-mask IoU 0.14–0.63, bar ≤ 0.85); every archetype wears 6–28 procedural faction pieces; near ≤ 3 draws / ≤ 18.9 k, LOD1 2 draws / 7.95–7.99 k, LOD2 3.70–3.75 k; casting: exactly the nearest 4 (14.0, 10.2, 12.3, 13.5 m) with all ten inside 35 m. PENDING W2: ≥ 10 archetypes (9 at W1), ≥ 8 archetypes in one Saltrow frame |
| A-npc-atlas-resident (W1 form) | PASS | Pan group → Holds group → Pan group: ≤ 1 faction atlas resident at every sample; textures 115 → 141 (stood) → 115 (left) → 137 → 115 → 141 → 115. The walk form (Saltrow → Ninewalls → Saltrow) is W2 |
| A-npc-dispose | PASS | spawn + despawn 20 × 3: textures 115 → 171 → 115, geometries 186 → 235 → 186, skeletons 44 → 64 → 44, every round; 0 archetypes and 0 atlases left |
| A96-npc-animated | PASS | 10 people, every clock advanced 60 s, 4–5 distinct clips each, 5 walkers over 16–22 m |
| A97-npc-no-skate | PASS | planted drift 0.065–0.077 m (bar 0.08) over 8–11 stance windows each, six walkers |
| A-npc-draws | PASS | the staged ten seen from its edge: 33 draws per frame (25 main, 8 shadow from the 4 casters), bar 44 |
| V-npc-vs-brea (+ 9 per archetype) | NEEDS-JUDGE | §5 |
| V41-npc-closeup | NEEDS-JUDGE | §5 |
| V-npc-builds | NEEDS-JUDGE | §5 |
| V-npc-clips-pan / -holds (lane extras) | NEEDS-JUDGE | §5 |
| A-npc-variety (≥ 10, Saltrow frame), the settlement-kit rows (A-settlement-*, A61, V35, V40, V45, A95, A97b, A99, A-lookout-call) | PENDING | W2 |

### The global green list (rows that exist in this tree)

| gate | result | measured |
|---|---|---|
| A1-boot-clean | PASS | state=playing |
| A20b-no-system-errors | PASS | 0 system errors, 359 frames |
| A9-perf-budget | PASS | quiet box (load 2.6, no other gate Chrome): median 59.9 fps, 241 draw calls |
| A21-real-draw-calls | FAIL (GPU term only) | quiet box: draws 248 / 183 / 275 (vista / herd / fight, bar 350) and triangles 3.66 / 3.87 / 3.93 M PASS; **medianGpuMs 19.5 / 32.7 / 20.5 against 14** FAIL; p95 frame and JS PENDING. The fight frame's 275 draws equal character-art's tree (no NPC in it: the group is hidden past 90 m); character-art read 21.7 / 29.4 / 20.6 ms and W0b main 22–23 / 43–45 / 22–26. Not attributable to this lane on this evidence; R58 b grades the timing at the W1 exit |
| A90-memory-stability | PASS | heap −3.2 %, geometries +14, textures −3, objects −35 |
| A90-memory-stability-expansion | PASS | objects outside every machine root **0** (r3: −932 before the group stopped streaming out), machine nodes +70 (population), heap −5.6 % |
| A90b-memory-attribution | PASS | 0 offenders |
| A90-rig-reclaim | PASS | geo +0, tex +0 over 30 cycles |
| A90-abs | PASS | r6 (r5's Chrome wedged in this row and took the next two with it; nothing in their output pointed at the page): post-GC JS heap 86.4 MB (ceiling 450), Chrome GPU-process footprint 1220.6 MB (ceiling 1500) at the staged fight after the A90 workload, with the group resident |
| **A-alloc-rate** | **FAIL (baseline guard, this lane's row)** | instrument PASS; scheduled absolute bars PASS; the binding guard (any owner > 1.1x its W0b baseline) fails on `settlements`: r3 26.8 KB/frame (1.75x), r6 16.86 KB/frame / 961.6 KB/s (1.10x / 1.16x), r7 17.5 / 1000 (1.14x / 1.21x), r8 18.3 / 1036 (1.19x / 1.25x) against 15.34 / 827.0. The new people's own functions fell r6 795 → r7 719 → r8 688 KB/s (graded peaks); the rest of the row is the Round-4 crowd (`npc.js`, `npcAnim.js`, about 700-740 KB/s), whose share moves from run to run. Also over in this run: world-sky (1.23x), progression, instruments-core: not this lane's. See §6 item 4 |
| A-vram-ledger | PASS | r6: textures 63.4 MB (bar 160), render targets 127.3 (170), geometry 79.3 (120), total 269.9 (450) |
| A-licence-manifest | PENDING | every clause PASS except third-party, PENDING only on another lane's row (`r5-poc-rock-scan`); this lane's `npc-clips` row now derives from `ual1` (r3: FAIL on `ual1-standard`) |
| A-ID-ip-assets-gone, A-assets-tracked, A-no-horizon-terms-player | PASS | r3 (no change since that touches them): 0 IP hits; 241 referenced, 0 missing; 1507 ≤ 1508 |
| A-no-horizon-terms-code | PASS | `node tools/lint/namecheck.mjs --code`: 1371 of 1371 (ratchet), 0 uncovered (re-run after the last code change) |
| A-port-guard | PENDING | a lane run has no sealed carried run to vouch for it (the orchestrator's row) |
| A-carried-suite | not run | it refuses an invocation that also runs carried rows, and grades sealed full carried runs: the orchestrator's 5270 row |
| A-reach-all-sites | absent | not in this tree (world-ground) |


## 5. The frames, read by me against their criteria and references (advisory; R29's judge grades)

Frames: `run-r5/shots/gates/` under this lane's scratch (1600 × 900). Brea in this tree is the W0b body.

- **V-npc-vs-brea (line-up) and the nine side-by-side sheets.** All ten in one frame, then each archetype at 2 m beside Brea
  in front, 3/4 and profile, with each head alone at the same lens. Every NPC has the kit's skin (pores, AO, tone zones, painted
  brows, wet eyes with a cornea dome, lashes), a face of its own (age folds on the matron and the keeper, beards dissolving at
  the edge on the caulker and the smith, the adolescent's open eyes), wound cloth or hair cards with live tails, and three to
  thirteen layered pieces. Against this tree's Brea none reads a tier below her; several read above (the W0b wrap is a flat
  paper band). **Weak next to the references (R54, R66):** the clothes are recoloured MCO bodies plus procedural sheets, and
  they look it at 2 m: the aprons are flat panels with little fold (the picker's carmine apron is the cheapest thing in V41,
  and in V41's third frame its dark back face shows through as a small diamond at the hip), the long skirts are smooth
  cones, the esparto boots read as pale suede, and the Peasant bodice is the same sculpted bodice Brea wears. None has the
  board's layered leather harness, buckles and soft cloth. The grey hair at the elders' temples is noisy at 2 m. The light is
  this tree's 11 h light, not R66's golden hour.
- **V41-npc-closeup.** Porter and picker walk side by side, upright, arms swinging fore-aft beside the body, the porter's
  basket held on his shoulder, feet planted (A97's 0.073 m on both). Different faces, outfits and builds. Reads natural; the
  picker's apron (above) is the weak part.
- **V-npc-builds.** The adolescent at 0.90 beside an adult of the same body: no LBS artefact at the neck, head or shoulders
  (uniform scale only). His face reads younger than the adult's (open eyes, full cheeks, a short nose and a small chin, a
  smooth neck, a light brow), but closer to eighteen than to fifteen. If the judge reads him as an adult, the bible's
  fallback (cut the variant) stands.
- **V-npc-clips-pan / -holds.** Every clip the W1 stage plays, per archetype, with its props: no T-pose, arms beside the body,
  tools in the hand (the rake in the harvest, the hammer in the chop, the cane in the walk), every walk upright since the
  overlay fix (r2 showed walks folded flat). Heads are level in idles and walks (`LIFT`), down at the work.

## 6. Still open, honestly

1. **`A-npc-fidelity` fails on three archetypes' silhouette jump at the 18 m change** (pit farmer 0.026 m at the cap's crown,
   tube smith 0.025 m at the rag knot, cochineal picker 0.033 m at the skirt's back hem; bar 0.02). LOD1 now locks every tail,
   apron, sash and tool, which took the smith from 0.072; what is left is the LOD1 head shell (a 10 × 22 ray-cast shell over the
   wound cloth) and the simplified skirt hem. Locking the skirts and a denser shell only moved the error to the shoulders
   (r7, reverted). The next step is a separate LOD1 budget per region (head, trunk, skirt) rather than one simplification over
   the whole outfit, and a measuring tool that poses the GLB offline so this does not cost a Chrome run per try. The
   cross-fade itself (0.32 s, both tiers drawn) is in place, and at 18 m a 2.5-3.3 cm step lasts the fade.
2. **The clothes are the weakest part of every frame** (§5): recoloured MCO bodies, flat apron panels, smooth skirt cones,
   pale boots, no leather harness or buckle work like Kevin's Nov 6 boards. This is where an NPC can still read cheap next
   to the new Brea once she merges. The next pass is a strap-and-buckle kit (procedural) and folded, layered aprons and skirts.
3. **The adolescent reads about eighteen, not fifteen.** The face does what the bible allows (no bone scale); if that is not
   enough for the judge, the bible's fallback (cut the variant) applies.
4. **`A-alloc-rate`'s baseline guard fails on this lane's row** (1.16-1.25x on KB/s across r6-r8). The W0b baseline (15.34
   KB/frame, 827 KB/s) was recorded with the Round-4 crowd alone; R56 then added ten Brea-fidelity people beside it. Their
   own allocation is down from about 1.4 MB/s through three's mixer (r3) to about 0.69 MB/s (r8, graded peaks per function):
   `pose.js` replaces the mixer, `rotOf` replaces `decompose`, the chain solve and overlays take no number arguments, and
   past 8 m the near tier ticks at 30 Hz. In node, V8's sampling profiler measures the pose player and the chain solve at
   0 B per tick; in the game's Chrome they still allocate (pose.update about 170 KB/s, person.update about 136 KB/s), so the
   game's V8 is not running them fully optimised and boxes numbers; I could not find which statements from outside the page.
   Two ways out, both the orchestrator's: re-record the settlements baseline for R56's people (they did not exist at W0b),
   or hold the row until W2, when the Round-4 crowd (`npc.js`, `npcAnim.js`, about 0.7 MB/s of this row) is deleted.
5. **Grey hair** at the elders' temples is a noisy coil texture at 2 m.
6. **Seated, rail and boat clips** (the keeper's `Sitting_Idle_Loop`, the follower's `Idle_Rail_Loop`, the caulker's
   `Fixing_Kneeling` boat) have nothing to sit on or lean on until W2 places them; the W1 stage plays `clips.stage` instead.
7. **LOD1 → LOD2 at 35 m** is cross-faded but not graded for pop.
8. **`A21`'s GPU term** fails on a quiet box (19.5 / 32.7 / 20.5 ms against 14), as it did on W0b main; nothing here points at
   this lane (the fight frame's draws equal character-art's tree), but this lane did not prove it either.
9. The CPU previewer I iterated faces on (`scratchpad/r5/settlements/preview.mjs`) is outside the tree; it is not a gate.

## 7. What another lane or the orchestrator must do

1. **The kit is a snapshot.** character-art's kit is not on main, and R58 says settlements builds on it. `tools/build/recipes/npc/lib/kit/` is a byte copy of character-art's committed 46296b6 (its fix round 1) except for two relative paths in `face.mjs`. Once character-art merges: delete `lib/kit/`, replace `./kit/` with `../../lib/` in `lib/*.mjs`, and rebuild (`node tools/build/build-assets.mjs --only settlements`). If the kit changed again, the frames change; character-art's uncommitted `wrap-head.mjs` work is not in this snapshot.
2. **`V-npc-vs-brea-*` must be re-filmed once character-art's Brea is on main.** In this tree she is still the W0b body (bowed idle, paper-edged wrap), which reads a tier below her own NPCs. The bar is against the new Brea. The orchestrator's merge run picks the rows up by name.
3. **`A-glb-budget` (pipeline's `tools/build/pipeline/w0b-checks.mjs`, `CLASSES.npc`)** still holds the pre-R56 row: 12 k tris, 2 draws, 65 bones, 0.4 MB. A file holds all its tiers, so R56 needs about `{ tris: 34000, draws: 8, bones: 120, bytes: 1.0 MB }` (measured: 29.7–33.1 k tris over all tiers, 8 meshes, 75–88 joints, 0.69–0.95 MB). Not this lane's file; the row fails until it moves. `npc-clips.glb` is named for the existing `clip-pack` class.
4. **hero-body (R64 b):** the NPC idles carried the same 11–15° bowed head as Brea's idle; the NPC fix is an overlay in this lane's `person.js` and does not touch `playerAnimator.js`.
5. **W2 (this lane).** Saltrow and Ninewalls placement, `A-settlement-*`, `A61`, `V35`, `V40`, `V45`, `A95`, `A97b`, `A99`, `A-lookout-call`, the ≥ 10-archetype and Saltrow-frame clauses of `A-npc-variety`, the walk-between-settlements form of `A-npc-atlas-resident`, the deletion of the Round-4 crowd, and `installPeople` moving from `camp.js` to `Settlements` in `main.js`.
