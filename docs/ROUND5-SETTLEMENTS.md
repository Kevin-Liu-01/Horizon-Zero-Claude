# ROUND 5 — settlements (W1, the NPC half; R56, R57 c)

Every near-tier NPC is built like Brea. This is what was built, what it publishes, and what the frames still owe.
Numbers and gate results are in §4 and are filled from the last run on port 5264.

## 1. What was built

| item | where |
|---|---|
| Recipe: the cast | `tools/build/recipes/npc/build.mjs` (`node tools/build/build-assets.mjs --only settlements`; `R5_NPC_ONLY=salt-raker,atlas-pan` for a partial build; about 90 s for all nine) |
| One person, Brea's construction | `tools/build/recipes/npc/lib/human.mjs`: UBC body, per-archetype face field, paint, separate hair or headwrap with live dyn_ chains, layered outfit, tiers |
| The table | `lib/archetypes.mjs` (faces in game mm, age, tone, head, clips, walk style), `lib/outfits.mjs` (MCO parts + faction pieces) |
| Procedural pieces | `lib/pieces.mjs`: palm hat, apron and bib, long skirt and tunic, capelet, cloak, belt, strap, basket, sack, rake, cane, lantern, hammer, goggles, guild chain, cuffs |
| Atlases | `lib/atlas.mjs`: 1024² faction atlas + 512² normal/ORM (neutral: hue is per vertex), the shared 512² hair + wrap atlas |
| Clip pack | `lib/clips.mjs`: 13 UAL2 clips native, 13 UAL1 clips baked per body offline by the kept Retargeter, stride tables |
| The kit | `lib/kit/`: a snapshot of character-art's `lib/{face,skin,skin-human,hair,wrap,wrap-head}.mjs` at ecc9ea5 (see §6) |
| Runtime | `src/world/npc/people/{index,person,bank,chains}.js`, installed from `src/world/camp.js`; publishes `ctx.people` |
| Gates | `tools/gates.r5.settlements.mjs` (`nice -n 10 node tools/gates.mjs --port 5264 --lane settlements`) |
| Assets | `public/models/npc/*.glb`, licence rows `npc-people-bodies`, `npc-faction-atlases`, `npc-clips` |

The Round-4 crowd (`src/world/npc/npc.js`, `camp.js`, `props/{settlement,npcs}.js`) stays until the W2 exit (plan §6). The new group stands apart from it on neutral ground.

## 2. How a person is put together

- **Body.** `Superhero_Female` or `Superhero_Male`, uniform scale to the bible's height. The adolescent is male at 0.90 of an adult and wears a long loose tunic; no bone scale of any kind.
- **Male bodies through the kit.** The kit's numbers are in the female pack's frame. A male head is the same head 42.5 mm higher, so male geometry passes through the kit 42.5 mm down and comes back up. Chain and prop points are authored in that frame; the skeleton never moves.
- **Face.** Brea's refinements (alae, nose tip plane, mandible line, ears, neck) plus the archetype's own vector at each of the seven landmarks, plus lid droop and jowls by age. Each archetype's `extras.r5Face` carries the vectors for `A-npc-face-delta`.
- **Paint.** `paintHumanSkin` with the person's tone and iris, plus age layers (forehead lines, frown, eye bags, crow's feet, marionette lines, neck bands, sun spots), a beard (a coil field dissolving at its edge) or stubble, tar to the elbow, carmine to the elbow, burn scars. The forehead's olive cast from the source is corrected; the adolescent's head and neck drop 72 % of the source's adult muscle relief.
- **Hair and headwrap.** `woundHeadwrap` for scarf, wrap with topknot, rag and cap; a one-ribbon band with a knot for bare heads; coil cards over the whole scalp under a band; a hood from the MCO part plus an escaped lock on a chain.
- **Outfit.** MCO Peasant (Pan Houses) or Ranger (Crescent Holds) parts, simplified with locked borders, plus procedural pieces. Hue and contact shade ride in `COLOR_0` (u16), so one neutral atlas dresses every person of a faction. Body triangles under cloth go at build time, which pays for the cloth and gives the face the atlas.
- **Tools.** A tool hangs on a prop joint. The runtime collapses a joint it does not want (`scale` ~0), so a rake moves from back to hand with no draw and no allocation.

### Tiers

| tier | meshes | tris (all nine) | draws | distance |
|---|---|---|---|---|
| near | `Skin_L0` (body + eyes), `Hair_L0`, `Outfit_L0` | 15.1–17.0 k | 3 | the 6 nearest within 18 m |
| LOD1 | `Skin_L1`, `Outfit_L1` (wrap folded in as a shell cast onto the cloth) | 6.8–7.7 k | 2 | 18–35 m |
| LOD2 | `Skin_L2`, `Outfit_L2` | 3.7–3.8 k | 2 | beyond; hidden past 90 m |
| caster | `Caster` (merged, about 1.8 k) | | 1 per cascade | the 4 nearest; no main pass |

The main-pass draw of `Caster` is skipped by a `drawRange.count = -1` set in `onBeforeRender` (three returns before `gl.drawElements`) and restored in `onAfterRender`; the shadow pass does not call those hooks. A tier change is a 0.32 s screen-door cross-fade from a pool of quantised fade materials. All of them share one compiled program, so a tier change compiles nothing.

## 3. Published

```
ctx.people                                      src/world/npc/people/index.js
  .ready                                        true once the staged group stands
  .list : Person[]
  .archetypes : string[]                        the nine ids
  .spawn(id, { x, z, yaw, seed, height, script }) -> Promise<Person>
  .despawn(person)                              disposes mixer + skeleton, releases archetype and atlases
  .stage({ ids, place, faction }) -> Promise<Person[]>   the group; default nine + a second raker
  .clearStage()
  .stagePlace : { x, z, r, y }                  the neutral place (flattest clear ring spot round REST_SITE)
  .findStage(opts)
  .tierAt(person, tier | null)                  force a tier for a gate
  .info() -> { count, draws, casters, tris, shadowDraws, atlases, archetypes, people: [...] }
  .bank : NpcBank                               residentAtlases(), entries, atlases
  .dispose()

Person
  .play(name, { fade, ts, loop, offset }) -> duration
  .walkTo(x, z, then)  .stopWalk()              walks by the clip's stride table
  .showProps(names | null)                      prop joints: prop_hand, prop_back, prop_hip, prop_shoulder, prop_lamp
  .info() -> { tier, draws, tris, casting, meshes }
  .chains : PersonChains                        .chains[i] { key, links, tip, tipPos }
  .frozen                                       stops the mixer and the walk
```

Scene child name: `people` (the draw ledger's `npcs` owner, `tools/gates/gates-perf.w0b.mjs`). W2 constructs `Settlements` in `main.js` and should move `installPeople` there.

GLB contract (`extras.r5Npc`): `{ id, n, name, faction, sex, age, adolescent, height, scale, footY, chains: [{ key, root, parent, links }], props, tiers, clips, layers, procedural, head }`. `extras.r5Face`: `{ landmarks: { k: { v: [x,y,z] mm, deltaMm } }, graded, scale, iou, eyeSocketMaxMm }`. Clip pack `extras.r5Clips`: `{ native, baked, gaits: { 'F|Walk_Loop': { dur, dist, frames, cum } }, pelvisScale }`.

@@GATES@@

## 6. What another lane or the orchestrator must do

1. **The kit is a snapshot.** character-art's kit was not on main when this lane ran, and R58 says settlements builds on it. `tools/build/recipes/npc/lib/kit/` is a byte copy at ecc9ea5 except for two relative paths in `face.mjs`. Once character-art merges: delete `lib/kit/`, replace `./kit/` with `../../lib/` in `lib/*.mjs`, and rebuild. If the kit changed, the frames change.
2. **`V-npc-vs-brea-*` must be re-filmed once character-art's Brea is on main.** In this tree she is still the W0b body, which reads a tier below her own NPCs. The bar is against the new Brea.
3. **`A-glb-budget` (pipeline's `tools/build/pipeline/w0b-checks.mjs`, `CLASSES.npc`)** still holds the pre-R56 row: 12 k tris, 2 draws, 65 bones, 0.4 MB. A file holds all its tiers, so R56 needs about `{ tris: 34000, draws: 8, bones: 120, bytes: 1.2 MB }`. Not my file; the row fails until it moves. `npc-clips.glb` is named for the existing `clip-pack` class.
4. **W2.** Saltrow and Ninewalls placement, `A-settlement-*`, `A61`, `V35`, `V40`, `V45`, `A95`, `A97b`, `A99`, `A-lookout-call`, the walk-between-settlements form of `A-npc-atlas-resident`, the deletion of the Round-4 crowd.
