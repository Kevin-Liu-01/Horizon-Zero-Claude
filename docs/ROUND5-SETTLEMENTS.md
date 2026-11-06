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
| The kit | `lib/kit/`: a snapshot of character-art's `tools/build/recipes/lib/{face,skin,skin-human,hair,wrap,wrap-head}.mjs` at **46296b6** (its fix round 1, Nov 6), byte copies except two relative paths in `face.mjs` (see §6) |
| Runtime | `src/world/npc/people/{index,person,bank,chains}.js`, installed from `src/world/camp.js` (3 lines; camp.js is this lane's file, §2); publishes `ctx.people` |
| Gates | `tools/gates.r5.settlements.mjs` (`nice -n 10 node tools/gates.mjs --port 5264 --lane settlements`) |
| Assets | `public/models/npc/*.glb` (9 archetypes, 3 atlases, the clip pack), licence rows `npc-people-bodies`, `npc-faction-atlases`, `npc-clips` |

The Round-4 crowd (`src/world/npc/npc.js`, `props/{settlement,npcs}.js`) stays until the W2 exit (plan §6). The new group
stands apart from it on neutral ground near REST (`ctx.people.stagePlace`, the flattest clear spot on a ring round REST_SITE).

### This session (Nov 6), on top of the previous builder's work

1. **The body folded over (runtime, major).** three's `PropertyMixer` writes a bone only when the clip's value CHANGED since
   its last write. The walk lean, the arm-swing gain, the held arm and the look-at were composed onto the bone's own value,
   so on any constant track (a walk whose spine is still, a held idle, a frozen person) they compounded every frame: the
   r2 frames show a porter lying horizontal in his walk and a raker bent double. `Person` now puts its overlay bones back to
   what the mixer last left them before each mixer update (a preallocated `Float32Array`, no allocation). This also explains
   the old `A-npc-fidelity` chain-travel readings of 1.4-1.7 m.
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
9. **Gates:** `A97` measures a foot's height over the ground under it (the stage is the flattest place, not a floor);
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
- **Motion.** One mixer per person on the shared clip pack; a walk moves by the clip's own stride table (the planted foot is the fixed point); overlays after the mixer: the walk style's lean and arm-swing gain, a held arm (the porter's basket), the head's carriage (`LIFT`), and the look-at toward her within 5.5 m. Each overlay is undone before the next mixer update (§1, item 1). Live `dyn_` chains (hair tail, wrap sash, apron halves, sash ends, shawl ends, cloak halves, a medal, a seed bag) run a Verlet solve from the kept hero solver's physics on the near tier only, with leg capsules so an apron goes round a thigh.

### Tiers (measured from the GLBs of this build)

| tier | meshes | tris (all nine) | draws | distance |
|---|---|---|---|---|
| near | `Skin_L0` (body + eyes), `Hair_L0`, `Outfit_L0` | 15.9–18.9 k | 3 | the 6 nearest within 18 m |
| LOD1 | `Skin_L1`, `Outfit_L1` (wrap folded in as a shell cast onto the cloth) | 7.95 k | 2 | 18–35 m |
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
  .autoStage : boolean                          true: the group streams in at 130 m from her, out (atlases and all) at 170 m
  .stagePlace : { x, z, r, y }                  the neutral place (flattest clear ring spot round REST_SITE)
  .findStage(opts)
  .tierAt(person, tier | null)                  force a tier for a gate
  .info() -> { count, draws, casters, tris, shadowDraws, atlases, archetypes, people: [...] }
  .bank : NpcBank                               residentAtlases(), entries, atlases, fadeU, casterMat
  .dispose()

Person
  .play(name, { fade, ts, loop, offset }) -> duration
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

@@GATES@@
