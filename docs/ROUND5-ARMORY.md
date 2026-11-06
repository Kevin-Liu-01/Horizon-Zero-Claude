# ROUND 5 — lane `armory`, wave W1

Plan: `docs/ROUND5-PLAN.md` §2 (armory row), §1.2, §3.2, §4.1, §9 "armory (W1, W3)", rulings R16, R31, R38, R54, R62. Port 5257.
Run the block with `nice -n 10 node tools/gates.mjs --port 5257 --lane armory` from a scratch cwd (auto-discovered, `tools/gates.r5.armory.mjs`).

## 0. Relaunch, Nov 6 (this pass)

The W1 builder that wrote sections 1–5 below stopped on Nov 3. This pass read that work, kept it, verified it, and went after what it left open and what the orchestrator's carry-over named: "the alidade cord at the collar and the smock read a tier below the new wrap" and "alloc row carry.js:601/256 still over 4 KB/s". Nothing here is committed by me (the orchestrator checkpoints the tree).

**Offline preview tools (scratch only, not in the tree).** Chrome was held by other lanes for most of this pass (one slot machine-wide), so I wrote three node probes that read the built GLBs and the recipe's own parts: a bind-pose rasteriser (albedo times lambert, any GLB, hidden piece bits, a shared atlas, unskinned props), a posed one that skins the recipe's parts (after `romFit`) with the 53 dumped ROM poses, and an estimate of the matrix's clause (b) in those poses (`matrix.js`'s logic and R62 c's exclusion, on the UBC body the recipe fits to, not Brea's). They have no normal maps, no mips and no hide mask, so they over-state texel-scale lines and show body skin the game culls. They are right about shape, layering and the direction of a pattern. Every visual change below was looked at in them before it went in. The in-engine frames are in section 3.

### 0.1 Pan Whites I

| What a close look found | Cause | Change |
|---|---|---|
| The skirt's folds ran diagonally, fanning out from her left side | `hangFolds` scaled the bearing by height (`th * mix(6.6, 3.0, d)`), so a fold at a fixed noise coordinate moved sideways 1.8 rad from belt to hem | Each layer keeps one bearing frequency (3.4, 7.4, 16); the fine gathers fade with depth and the deep folds take over. Every fold hangs straight down |
| The skirt's folds were painted, not modelled (Nov 3 reading) | 4 x 20 columns and a 1.2 cm ripple unrelated to the painted folds | The folds are geometry, on the painter's own field: 4 panels x 10 rows x 34 columns (2,992 tris, the 3 k piece cap), 2.6 cm crest to valley at the hem, none under the sash band, outward-biased. The map's fold term is cut to 40 %; it keeps the crease and the valley's shade |
| Rings round her bust under a low light | The smock's `v` started at 0 on the neckline, so every weft thread and slub the painters lay along `v` ran parallel to the scooped neck | `v` starts at the neckline's height under a level line: the weft runs level, as woven. (The drape's body floor is also smoothed down its height before it clamps the cloth: that floor was a 5 mm staircase) |
| The painted gathers crossed the modelled ones | The mesh is cut with `ripple(th, 4, [13, 17, 21])`, the painter used another noise | The painter shades the mesh's own ripples (deeper, 5.5 mm) and adds only a finer crush |
| The esparto on her shins read as stacked rope | One round crown per turn, chevrons at 12 % | A flat plait (pleita): flat across with rounded edges, strands at 45 degrees from either edge meeting at the middle, each strand its own grass, a groove between strands. The boots' texel density is up 1.15 x (470 px/m) |
| The sash knot and tails were planks | Two 3-column strips and a ball, a marbled crease texture | `armor/lib/sash.mjs`: a wrapped, pillowed ring and two puffed ears; tails on a Catmull-Rom path, two faces a thread apart with real edges and a bias-cut end, lengthwise pleats gathered at the knot, a slight twist. The cell is unbleached, softer creases, rolled hems, no stripes |
| At full draw a band of skin opened under the girdle, and the smock's hem rode out of it | The girdle and the sash band shared 4 mm; the smock's hem 7 mm | The sash band's skin blends from the skirt's at its foot to the girdle's at its top (`beltRing` `skinY: [yBot, yTop]`); the girdle is 8 mm deeper at its lower edge and 3.5 mm further out; the band sits tucked under it; the smock's hem goes 1.6 cm further under the girdle. In the 53 poses every one laps except the top of a dodge and a jump (1.0 cm, smock over girdle) and the up-draw (1.4 cm at one bearing, girdle over band) |
| The armhole's linen panel was one flat pale polygon | One UV point, normals sideways | Its rim normals lean into the hole (it shades like cloth falling away) and its texels span the linen's creases |
| The sash read flat and pale in sun (Nov 3 reading) | One bright tone, shallow creases | Unbleached, a shade under the sleeves; deeper creases with shaded valleys; rolled hems |
| A plaid read where weft slubs crossed the new vertical folds | The hem's dust blots were stretched across (fbm 9 : 3) and the smock's slubs had been raised | Dust blots round; slub and thread back to 0.08 / 0.07, the warp streaks along the drop kept |

**A baked contact shadow per vertex** (`armor/lib/vertexao.mjs`, all four outfits). The V-pan-closeup criterion asks for "the girdle over the smock with a contact shadow"; the atlas can only paint shade where its painter knows something lies. After the fit, 28 rays from each vertex over its normal's hemisphere, 5.5 cm reach, against every layer and the body (a hat copy shades only itself), then a little smoothing along the mesh. The cloth shader (`clothShader.js`, `ao` when the GLB says `hasAo`) takes all of the bounce light and half of the sun by it: the side under the arm, inside the collar, along the strap's edges, under the girdle, between folds and inside the skirt sit down into the layer below. +8 KB a set (Pan II is 0.147 MB of its 0.15).

Atlas packer (`armor/lib/atlas.mjs`): the skyline packer now tries four orders (tallest, widest, largest, longest side) and keeps the densest, and among equally low places takes the one that buries least sky. With the denser boots the sheet's density is 409 px/m (was 431 with the boots at 0.98 x).

Tris 12,813 (cap 17.5 k), 0.522 MB (cap 0.8).

### 0.2 Variants, stow kit, weapons

- **Pan II, the hat on her back.** With the lance out the bow stays stowed, and the strung bow's grip (0.34 m behind her spine) stood 39 mm through the brim. The hat now has a third copy (`_PIECE` 128): lance out, the hat rides over the stowed bow (bind-pose probe: 2.8 cm clear of the stave); bow in hand, it lies close in where the bow was (0.12 m off the stowed lance, as before). `loadout.update` picks the copy (the bits are the copies hidden: 64 | 128 at rest, 32 | 128 lance out, 32 | 64 bow in hand or aiming). 0 extra draws; +224 tris; 0.147 MB with the contact shadow (cap 0.15).
- **Pan III's scutes** stood out as claws at their outer corners and read bottle green: they are a little shorter round the shoulder with their outer corners rounded back, and the celadon cell is the pale jade glaze it names (its crazing finer).
- **Ash I.** Its skirt had taken Pan I's new modelled folds through `panBase` (deep folds on its own 16 columns: the rust under-layer came through them in patches); it keeps its own soft drape now (`fold: null`). Black and charcoal lifted to dyed wool's albedo (#232126 read as a hole under flat light), a fine pale nap, and each chest wrap is one band from the hip up the back, over the shoulder and down the front (the two cut ends showed at the shoulder). Its cowl's loose turn stands a little higher off the tops of her shoulders.
- **The alidade's neck cord** (the orchestrator's "a tier below the new wrap"): it was a square tube on an 11-point polygon. Catmull-Rom through the same points, a hexagonal section, a three-ply twist on the cell (mirrored every 9 mm); the brass tube 12-sided.
- **The weapon atlas** used a third of its 1024² sheet. Every cell is now 1.6 x larger on the same sheet (no new texture, the same VRAM): the painters see their own sizes, sampled 1.6 x finer, heights turn to normals at the matching density. The stave is 706 px/m along. The grip's esparto wrap read as a black-and-yellow coil spring: a shade between turns now, two plies, a helix.

### 0.3 Runtime

- **Allocation (A-alloc-rate, armory's row, 4 KB/s per function from W1).** See 0.5. `carry.js`'s per-frame path is rewritten without changing its answer (run side by side on 3,000 mock frames, the original and the rewrite agree to 1e-13 m; the axis change in the next bullets is a deliberate change made after that check); `stowkit.js` (`_solveQuiver`), `combat.js` (`update`, `_placeInHand`, `_updateAimPoint`, `_updateTimeScale`), `arrows.js` (`sweepSegment`, `_stepFly`) and `bow.js` (`SabinaBow.setDraw`) follow the same rules.
- **The aim march** (`combat._updateAimPoint`) reads the ground at whole metres (Smi coordinates cost a call nothing), reads exactly within 0.5 m of the ground, and refines the bracket by two steps of regula falsi. On a rolling test field, 17,000 rays against the old 3 m / 7-bisection march: 0 rays change their crossing, 1.6 cm mean difference (along the camera ray), 2.4 exact reads a frame (it was up to 146 heap numbers a frame aimed at the sky). Its hull options object is reused.
- **An arrow in flight** (`arrows.js` `sweepSegment`, `_stepFly`): the hull raycast's options object is reused, and the terrain march reads the ground at whole metres at both ends of the frame's segment first; the exact 0.3 m walk and its bisection run only when either end is within 1.5 m of the ground (as before when they do).
- **The Sabina's per-frame uniforms** are one `vec4` (`uBow`: flex, string z, nocking y, arrow on): a number written into a three.js uniform's `value` slot is a fresh heap number each frame. The shader reads them through `#define`s; nothing else changed.
- **The carry solve's blade and butt** are measured on A-lance-stow's own axes now: the blade right of the spine along her level shoulder line (it was the spine's lateral, which a bladed up-draw turns), and a new butt-left term along her level hip line (the strapped search had none; crouch-walk put the butt 1.3–1.7 cm right of centre on two runs in three).
- `HeroStowKit.carryInfo()` gives the gates `null` for `armGap`, `camGap`, `tailGap` when they were not measured (the solve keeps NaN in its own fields so they never hold a boxed double).
- Pan II's third hat copy: `loadout.update` and `matrix.js` know it (section 0.2).

### 0.4 Gates

- `A-stow-clearance@armory` and `A-variant-motion-rerun:*` read R62 (b): the cover clause is the median over the 24 yaws of each sweep (standing, moving; the larger is graded) ≤ 8 % and the worst yaw ≤ 20 %.
- `A-variant-swap-matrix` (b) reads R62 (c) in `src/hero/matrix.js`: a vertex whose nearest skin is itself more than 4 mm inside another body part (a limb segment or the trunk, by heaviest bone, within 3 cm) is excluded and counted (`creaseExcluded`); the 0.5 % is of the rest, and 0 in the head stands.
- `matrix.js` no longer measures an outfit piece the outfit is hiding (Pan II's hat copies not worn): a collapsed vertex cannot clip or be clipped.

### 0.5 What allocated, and the rules that came out of it

Nothing in `carry.js` called `new`, and the gate read 727 KB/s in `_viol` alone. Per-frame functions in a game page sit in V8's mid tier (Maglev) for a long time (Chrome delays TurboFan in efficiency mode), and Maglev boxes a double into a fresh heap number where TurboFan would not. Measured offline with V8's own sampling heap profiler (the gate's method: `samplingInterval` 2048, minor-GC objects included) on a mock rig, `--no-turbofan` reproduces the gate's shape: the original `carry.js` read `segSeg` 3.8 MB/s, `_viol` 3.6 MB/s, `_camGap` 2.2 MB/s, `_placeS` 325 KB/s, `update` 125 KB/s; the rewrite reads 0 in every function except `update` (1.5 KB/s: the terrain read's two coordinates, every other frame), in Maglev and in TurboFan. Each rule below was probed on its own (200,000 calls, Maglev only):

| pattern | B per call |
|---|---|
| `Math.sqrt(x)` / `x ** 0.5` | 32 / 0 |
| `Math.min(1, Math.max(-1, x))` / a ternary | 42 / 0 |
| `Math.atan2`, `Math.hypot` (hypot boxes in TurboFan too) | 48 |
| a ternary clamp feeding `Math.acos` / the clamp through a `Float64Array` slot | 16 / 0 |
| a loop variable started at `Infinity` / at `1e9` | 22 / 0 |
| `Number.isNaN(x)` / `x !== x` | 16 / 0 |
| a double field passed to 5 calls / read once into a local first | 80 / 16 |
| `Math.floor(x + 0.5) \| 0` passed to a call (a Smi) | 0 |
| `Math.acos`, `sin`, `cos`, `exp`, `abs`, `floor`, `**` | 0 |

Plus, outside Maglev: a number written into a three.js uniform's `value` slot is a fresh heap number every time (that slot holds objects elsewhere, so its field is tagged); a `Vector4`'s fields take the write in place.

**In the engine none of this moved the numbers** (r2, §3 and §4). carry.js `update` read 799 KB/s and `_viol` 620 KB/s, against 598 and 727 on Nov 3. These rules describe Maglev, and the page does not behave as if these functions run there. §4 says what is not known.

### 0.6 The first in-engine pass (Nov 6, run r2), and what it changed

The block ran in Chrome for the first time since the relaunch at 13:35 UTC. Two things it showed were not visible offline. To read them I wrote two more scratch probes. They use **Brea's own skinned body** from `brea.glb`, posed by the ROM dump, where the earlier probes used the UBC proxy the recipes fit to.

For Ash I at full draw, the Brea-body probe reads matrix (b) at 0.71 % / 0.80 %. The engine read 0.70 % / 0.76 %, so the probe predicts it. The UBC probe had read 0.69 % / 0.78 % for Ash, but for Pan I it under-read idle by a factor of 3.

| What the engine showed | Cause | Change |
|---|---|---|
| The carried bow's stave was 1.5 cm into the outfit at idle and 2.9–4.7 cm at a sprint (all four variants). In V-bow-carry it runs through the white tails | The sash knot and tails hung at the side of her left hip, where `_bowCarryLayer` holds the bow. 38 of 40 sampled offenders in the lance's light attack (1.77 %), and half of Pan I's idle penetration (0.61 %), were the knot | The knot is tied **behind** the left hip (turned 1.35 rad from the chain bones' bearing, was 0.62). Both tails ride the pelvis and take at most a quarter of the thigh, evenly down their length. They no longer ride `dyn_sashEnd`, because its bones stand at the front of the hip (brea.mjs) and a tail 24 cm from its pivot would swing off its knot. In r3, half the thigh over the lower half stretched the tails' short edges 1.7–2.4x in a sprint; on Brea's body the quarter ramp reads ≤ 1.22 in every ROM pose, against 1.44–1.81 for the half. Offline on the ROM poses: the held stave goes from −4.6 cm worst to −1.45 cm, 0 at idle. The knot's body penetration goes from 81 vertices (jump-1) and 7 (light) to 0 in every pose |
| Pan II, lance in hand: the stowed bow was 24 mm into the back hat's brim in the light attack (7 mm standing) | Her twist | The over-the-bow hat copy sits 28 mm further out |
| Pan III at full draw: the inner scute came within 2.6 cm of her head (bar 3) | The tiles start 0.13 m out | 6 mm further out |
| The close-up's "sash knot, tails" panel | — | Re-aimed at the knot's new place (`sheets.js`) |

Two attempts were measured and not shipped:

- **A cowl-only ease for Ash.** The roll alone gets 4 cm of room. Brea-body (b) at draw goes from 0.71 / 0.80 % to 0.40 / 0.50 %, but the roll lumps up over the front of her right shoulder.
- **An armhole binding on every rim point.** It removes the purple hook over each shoulder in the close-up, but adds 0.1 points of penetration at full draw (Pan I draw0 0.40 → 0.50 %).

Both are in §4.


## 1. What was built (Nov 3; section 0 says what changed since)

### Pan Whites I, "Raker's Whites" (`tools/build/recipes/outfit-pan-1.mjs`, `armor/lib/**`)

The set every later variant inherits. It was re-cut, because the MCO bodice cannot be painted out of its problem: the cups and the under-bust ledge are in the mesh, so any re-texture reads as a stock corset.

- **The over-smock is lofted from what cloth touches** (`armor/lib/smock.mjs`). `radialTable` samples the body, collar and sleeve surfaces per (height, bearing); `drapeTable` takes each slice's convex hull (cloth bridges every hollow), runs a straight line from the collarbone to the bust's apex and limits the fall below it (it hangs at 0.34 m per metre; it does not cup back in). `draftSmock` cuts one ring sheet from the neckline to the belt, with metric UVs and the body's skin. Armholes are clipped against an ellipse triangle by triangle (`cutEllipse`), so the rim is a clean curve whatever the grid does.
- **Layers, inside out.** The MCO bodice survives only as the linen under-tunic's stand collar, seen in the neck opening. Then the orchil smock with a scooped, keyhole neck, like the Museo Egizio tunic; a linen cord tied at the keyhole; bias-bound neck and armhole edges with real thickness (`bindingAlong`, a little C of cloth); gathers into the belt; four skirt panels with slits, a turned hem and a hem lip; the under-tunic's hem below it, skinned by height so it moves with the skirt instead of shearing.
- **Hardware.** Girdle: round-barred brass buckle (`tubeInto`, `roundRect`), bar, prong, leather keeper, a pierced rounded tongue with a worn hole. Sling: a brass slider where it crosses her ribs. Salt pouch: a soft belly over a flat back with a gusset, a rounded flap, a bronze toggle, two belt loops. Sash: a creased band, a tied knot with two ears, two tails (one on `dyn_sashEnd`). A leather finger tab on the right hand's three string fingers (bible §3.9, it was missing at W0b), the ∴ on the back of the hand left bare.
- **Atlas.** Threads differ one by one along warp and weft; slubs thick for a few cm and thin again; fold height and fold shading are baked together from `hangFolds` (sharp in the valley, round on the crest); stitching is fine, tone on tone, and only where something is sewn; salt dries at hems and tide lines, broken and soft; dye fades on the shoulders. Boots: a flat esparto plait wound up the shin, each turn lapping the one below, a coiled rope sole with a pale whipping thread. Per-texel `crease` scales the curvature pass, so source normals no longer draw black lines. Trim gained `tongue`, `sash`, `bind` (appended to the sheet; Ash's sheet carries the same names).
- **Fit to the range of motion** (`armor/lib/romfit.mjs`, `armor/rom-poses.json`). The weights a garment takes from the body are right in bind and wrong at the end of a stride, so the last step of every outfit recipe reads the poses the game plays (bone matrices dumped from the running animator): `relax` blends the two ends of any edge that opens past 1.46 toward each other, only there; `ease` gives cloth that goes under the skin in some pose exactly that much room in bind, along that pose's skin normal brought back through the vertex's own bones, in a soft field every layer moves with (cap 14 mm; deeper than that is a crease two limbs share, and puffing the sleeve would not get it out). It runs after the atlas is laid out: no UV moves, no vertex is added, the variants stay on Pan I's sheet. Re-dump `rom-poses.json` (probe in section 4) when the clips change.
- **What never shows is gone.** The sleeves' inner end low under the arm, the trousers above the skirt's yoke and inside the boots, the under-tunic behind the neck, the boot top behind the knee; coarser mesh in the crease under the arm. Those vertices sat inside her in every arms-down pose.
- The pouch moved to the small of her back: at the hip it stood in the arm's swing and on the thigh's lift. It reads better from the chase camera too. Its bag rides on the skirt's skin, its loops on the belt.
- Tris 10,579 (cap 17.5 k), 0.451 MB (cap 0.8), density 431 px/m.

### Pan Whites II, III, Ash Wraps I (`armor/{pan-2,pan-3,ash-1}.mjs`)

Geometry on the new base. II: palm hat (two hidden meshes, head and back) + capelet with brass clasp. III: three celadon scutes rigid on each clavicle, crusted shin guards, salt per vertex. Ash I: its own 1024² sheet, diagonal wrap skirt, cowl, chest wraps, rope belt. II and III are at 0.122 and 0.121 MB (cap 0.15): meshopt FILTER encoding, 12-bit positions, 8-bit joints, the base's vertices cut to 6.9 k.

### Sabina Bow, Shepherd's Lance, stow kit (`armor/lib/{weapongeo,weaponatlas}.mjs`, `weapons/*`, `armor/stowkit.mjs`)

- Bow: one mesh, one draw, on the shared atlas; `src/combat/bow.js` flexes the limbs, draws the string and carries the arrow in the vertex stage. The stave's arc is now 1.45 m (it was 1.41). **The arrow's shaft and head were lathed along +Y instead of +Z** (they stood upright while the vanes lay flat); fixed, found by reading the frame.
- Lance: the head re-cut to the bronze reference's own form: a long cast socket running up into a strong midrib, the leaf's wings from its upper third, patina rubbed through along the rib. The atlas cell is 8× denser across than along, so its noise now runs in the blade's metres (it had streaked into a feather).
- Stow kit: bracer shell conformed to the forearm (the skin came through it in a zigzag). The quiver hangs on a new `stow_quiver` joint (hero-body's handover "pin the quiver's tilt"): rigid on the pelvis it went 39–42° at a sprint against the bible's 20°. With the lance in hand she leads with that hip and the elbow stood in the arrows, so the mouth swings back 30° while the lance is out (`_solveQuiver`, no allocation).

### Runtime (`src/hero/**`, `src/combat/{bow,weapons,arrows,combat}.js`)

`loadout.js` (armor + weapon variants, perks through published hooks, deferred rows unloaded on swap), `clothShader.js` (weave and grain detail by the ORM atlas's class channel, cloth rim, salt, hat pieces), `weaponAtlas.js`, `matrix.js` and `sheets.js` (gate modules, never bundled).

## 2. Contracts published

```
player.hero.loadout.equipArmor(id: 'pan-1'|'pan-2'|'pan-3'|'ash-1') -> Promise<info>
player.hero.loadout.unequipArmor() -> Promise<info>
player.hero.loadout.info() -> { armorId, perk, row, pendingHooks: string[], resident: string[] }
player.hero.loadout.save() -> { armor }          // what A65 persists; progression wires it at W3
player.hero.loadout.restore({ armor }) -> Promise
player.hero.kit.setHidden(bits)                  // PIECE { lance 1, bow 2, quiver 4, bracer 8, alidade 16 }
player.hero.outfit.setPieces(bits)               // 32 hat on head, 64 hat on back
player.hero.info() -> { draws, tris, casters, skeletons, meshes[], outfit, kit, lanceOut, bowOut }
import { heldMaterial, weaponEntry, adoptWeaponAtlas, armoryAssets } from 'src/hero/weaponAtlas.js'
buildWeaponModel(id, { bow: rigProfile.bow })    // bow.js; the default bow is the Sabina, `bow.sockets.{grip,nock,string_top,string_bottom,stow,tip}` (mesh space)
buildSpear({ propScale = 0.8 })                  // bow.js; until melee's lanceStow.js replaces it
```

Recipes: `panBindTriangles()` (brea.mjs, kit-v0) is unchanged and still returns the as-cut MCO pieces, so `brea.glb`'s hide bit needs no rebuild. `panBase(opt)` returns `{ doc, trim, parts, joints, body, bodyPart, clothField, skinOf, W, H, TRIM_H, J, drape }`; `clothField` no longer contains the body (straps must lie on the cloth). Slots renamed: `yoke` + `smockbody` → `smock`, new `underyoke`, `binds`, `slider`, `tie`, `tab`.

```
romFit(parts, base, { capAt, target, maxPush, ... }) -> log     // armor/lib/romfit.mjs; last step of every outfit recipe, after the atlas is laid out
PAN_FIT                                                          // outfit-pan-1.mjs: the Pan cut's limits (the yoke takes little room)
bow.getGripWorld(out: THREE.Vector3) -> out                      // bow.js: the stave's grip, world; published for hero-body's solve
player.hero.kit.quiverHold                                       // override of how much of the pelvis's turn the strap takes out (gates)
```

`armor/rom-poses.json` is the fit's input: 53 poses (idle, 12 sprint frames with each weapon, jog, crouch, dodge, jump, three draws, melee). Regenerate with `armor/lib/rom-dump.gates.mjs` + `armor/lib/rom-dump.mjs` when the clips change; crouch, dodge and jump relax weights only, they get no room.

### New or changed this pass

```
player.hero.outfit.setPieces(bits)          // bits HIDDEN: 32 hat on head, 64 hat on back over the stowed bow, 128 hat on back close in (Pan II)
player.hero.kit.carryInfo() -> { ..., armGap, camGap, tailGap }   // null when not measured this frame (the solve keeps NaN internally)
CARRY_BOUNDS.buttLeft                        // carry.js: the butt left of the pelvis along her level hip line (0.02 m; A-lance-stow: > 0)
SabinaBow.U.uBow: Vector4                    // bow.js: (flex, string z, nocking y, arrow on); replaces uFlex / uStrZ / uNockY / uArrowOn
```

Recipes (armory's own libraries):

```
sashTail(P, joints, { along, across, width(u), thick, pleats, pleat(u), twist, endCut, side, out, rect, uLen, u0 }) -> geo   // armor/lib/sash.mjs
sashKnot(c, { side, up, out }, { joint, rect, ringW, rx, rz, ear, earW }) -> geo                                            // armor/lib/sash.mjs
skirtPanels(mk, surf, joints, { ..., fold(th, y, t, panel) })   // garment.mjs: modelled folds (null: the old drape ripple); variants pass fold: null for their own skirt
beltRing(part, surf, skin, { ..., skinY: y | [yBot, yTop] })    // garment.mjs: read the skin at another height, or blend it down the band
hangFolds(t, { belt, hem, seed })                               // outfit-pan-1.mjs: fixed bearing frequency per layer (folds hang straight)
WEAPON_TRIM_SCALE = 1.6                                          // weaponatlas.mjs: every weapon cell 1.6 x larger on the same 1024² sheet
bakeVertexAO(parts, { body, reach, rays, strength }) -> Uint8Array   // armor/lib/vertexao.mjs: the `_AO` attribute; r5Outfit.hasAo turns it on in clothShader.js
installCloth(material, { rep, pieces, salt, ao })                // clothShader.js: `ao` reads `_ao`
```


## 3. Gates (Nov 6)

All runs used port 5257, the tree `trees/armory`, a 1600 x 900 window, and the R53 rules: one slot machine-wide, `nice -n 10`, machine checks before every launch, and 35 s between runs. A visual row prints NEEDS-JUDGE. Where a row says "read", that is my own reading of the frame; the independent judge has not seen these frames.

The runs:

- `r2` held one slot from 13:35 to 14:09 UTC and ran on the build that was in the tree then. List 1 was allocation, matrix, stow, lance stow and draws. List 2 was the rest of the block plus the carried rows. List 3 was the global list.
- `r3` is the rerun after the sash, hat and scute changes (§0.6). It covers the matrix, the stow and motion rows, the budget and the five visual rows those changes touch: 13 rows at 15:07–15:14 UTC. `r4` (the matrix, two motion rows and two visual rows) ran at 15:23–15:27 UTC, after the tails' weights changed (§0.6); its assets are the ones in the tree.

### Block (§9 armory W1)

| Row | Result | Measured |
|---|---|---|
| A-armory-budget | PASS | outfit-pan-1 0.529 MB (cap 0.8), ash-1 0.357 (0.8), pan-2 0.147 (0.15), pan-3 0.144 (0.15), stowkit 0.197 (0.6), bow 0.059 (0.15), lance 0.044 (0.15) |
| A-gear-draws (R38's held clause) | **PASS** | All four variants: stowed is 4 draws / 2 casters; bow at full draw is 5 / 2 (+1,524 tris, the Sabina, zero extra); lance in hand is 5 / 2 (+1,244). Totals are 25,990–29,116 tris. This is the R38 held-weapon clause, graded here at my exit |
| A-weapon-sockets | PENDING | Every armory clause passes: the bow is 1.458 m measured (1.45 declared), the lance 1.55 m, all sockets are present, and the pull is 0.582. The 0.80 prop scale is melee.js (melee W1, M9) |
| A-outfit-swap-memory | PASS | pan-2 → pan-3 → ash-1 → pan-1 → pan-3 → ash-1. geo 158 → 158, tex 115 → 115, skeletons 2 → 2 |
| A-weapon-swap-memory | PASS | geo 160 / tex 116 / mats 29, unchanged over the swaps |
| A-variant-swap-matrix | **FAIL** | See the clause table below |
| A-stow-clearance@armory (R62 b) | PASS | dCalf 0.056 m (quiver), crouch low 0.096 m. Cover: median of the 24 yaws 0.000, worst yaw 0.175 (bow, yaw 8) (r2). r3: 0.056 / 0.095, cover worst 0.179 |
| A-variant-motion-rerun:pan-1 / pan-2 / pan-3 / ash-1 | PASS ×4 | Stow dCalf 0.057, cover median 0, worst 0.176 / 0.191. Arms: min lateral 0.227–0.229 m. Alidade cord ≥ 0.086 m. r3/r4: all four PASS. In r3 Ash's arms clause read a pelvis bob of 0.100 (bar 0.08; the other three read 0.074–0.079). r4 read it at 0.077 on the same animation; the outfit has no hand in the pelvis |
| A-armor-verb | PENDING | ashStep (jog 47 → 0 noise, sprint 23) and shrug (8.0 → 3.0) pass. The two Brine filters are combat-kit W2 |
| A-no-move-mods | PASS | Canon speeds on all four, no mods. Dodge 4.16–4.24 m, jump apex 1.5 m |
| A-weapon-role | PENDING | Until W3 (only the bow and the lance exist) |
| A4 / A5 / A51 / A52 @armory | PASS / PASS / PASS / PENDING | Draw strength 0.98; hunter arrow at draw 1; nock gap 1.1 s (sim 1.1, expected 1.07); A52 is SKIP-legacy (R30, no sentry yet) |
| V-pan-closeup | NEEDS-JUDGE | Read below |
| V-variant-sheet | NEEDS-JUDGE | Read below |
| V-weapon-sheet | NEEDS-JUDGE | Read below |
| V-gear-in-hand | NEEDS-JUDGE | Read below |
| V-bow-carry | NEEDS-JUDGE | Read below |
| V29-wielded-carry@armory | NOT STAGED | SKIP-legacy (R30): no flanker until instruments-b W2 |

**A-variant-swap-matrix, clause by clause** (32 rows: four variants × eight poses):

| Clause (bar) | r2 (before §0.6) | r4 (the tree) |
|---|---|---|
| (a) edge stretch ≤ 1.6, weights sum 1 | 1.92: Pan III lance idle, left ankle esparto. r3 then read 2.43 (the tails, half on the thigh) | **1.544** in every row; weight error 0 |
| (b) inside ≤ 0.5 % (R62 c excluded) | worst 2.24 % (Pan III light-1, the knot); 10 rows over | worst **0.77 %** (Ash draw −0.55); 13 rows over, at 0.51–0.77 % |
| (b) head | 0 | 0 |
| (c) stowed kit ≥ −0.5 cm | −4.63 cm: Pan I heavy, quiver into the right shin. Pan II hat over the bow −2.36 | −3.18 cm: Ash sprint, quiver mouth into the right sleeve. Pan II hat −1.09 |
| (c) held weapon ≥ −0.5 cm | −4.71 cm: Ash sprint, the stave through the knot and tails | **−1.35 cm**: Ash sprint, the stave against the tails behind the hip at the end of the back swing. Pan II −0.90, Pan III −0.56; Pan I −0.31 passes |
| (d) piece ≥ 3 cm from the draw hand and the head | Pan III head 2.6 cm | Pan III head **3.0** (passes; the bar fails only below 0.03), hand ≥ 3.7 |
| (e) Pan II back hat ≥ 3 cm from the lance | 11.7 cm | 11.9 cm |

Rows over 0.5 % in r4: Pan I sprint-lance 0.62, draw −0.55 0.53, light-1 0.55. Pan II light-1 0.60. Pan III draws 0.68 / 0.62, light-1 0.55, heavy 0.51. Ash idle-bow 0.63, sprint-bow 0.52, draws 0.71 / 0.77, light-1 0.57.

Each row samples one moment of the pose, and the noise between runs is about ±0.15 points on the same assets. Ash's bow idle read 0.29 % in r2, 0.26 % in r3 and 0.63 % in r4. So "rows over" moves with the draw of the sample; the worst value and the held and stretch clauses moved because of the change.

### Carried rows my files touch

| Row | Result | Measured |
|---|---|---|
| A-lance-stow | PASS | No fails. Idle 38.3–38.7°, butt left ≥ 0.204 m. Jog/sprint/crouch butt left ≥ 0.083 m. Blade right of the spine ≥ 0.443 m. Tail gap ≥ 0.132 m |
| A-hero-draws | FAIL (not mine) | Live at full draw: 5 draws / 2 casters / 28,112 tris, so the held clause's own numbers pass. It fails on hero-body's `heroTris <= 20000` term (26,588). R62 (a) retired that term for §9's ≤ 40 k with each §4.1 cap |
| A16-draw-anchor, A35-cheek-anchor | PASS, PASS | Nock to hand 0.065–0.071 m; the elbow sits perpendicular to the arrow at every pitch. Hand to head joint 0.108–0.111 m |
| A-tail-legible | FAIL (hero-body / character-art) | 3 of 24 gust moments fail, down from 8 on Nov 3. SIDE views reach 3 px against 4 |
| A100-spear-holster, A101-spear-grip | FAIL (R47) | These are staged on the Round-4 spear and SKIP-replaced until melee's W1. The armory kit draws the stowed lance, so the legacy spear the rows read is hidden |
| V-brea-one-glance | NEEDS-JUDGE | All five cues read at 64 px in all five views (r2, r3) |

### Global list on my port (r2 list 3)

| Row | Result | Measured |
|---|---|---|
| A1-boot-clean | PASS | state=playing |
| A9-perf-budget | PASS | 59.9 fps median on a quiet box (load 2.99), 241 draw calls |
| A20b-no-system-errors | PASS | 0 system errors, 0 hook errors, 362 frames |
| A21-real-draw-calls | PENDING | Draw calls (250 / 176 / 270 of 350) and triangles (3.7–4.0 M of 6.5 M) pass. The GPU ms terms are PENDING on a loud box (load 3.33) |
| A90-memory-stability | PASS | Heap +0.9 % over 30 kills, geo +17, tex −3 |
| A90-memory-stability-expansion, A90b-memory-attribution, A90-rig-reclaim, A90-abs, A-vram-ledger | PASS | Controls in band (heap 0.989x, GPU 1.052x) |
| A-alloc-rate | FAIL (not on armory's row) | The binding bar here is the baseline guard. It fails on world-sky (1.22x) and instruments-core (1.14x). **Armory's owner row is 1,897 KB/s against a 6,274 baseline (0.30x).** Armory's per-function 4 KB/s bar is scheduled "from the W1 exit" and graded at the orchestrator's global run. It would fail today: carry.js `update` 799 KB/s, `_viol` 620, `_pose` 229, `_m4inv` 82, `_placeS` 63, `_camGap` 57, `_report` 42; combat.js `update` 33, `_updateAimPoint` 30, `_pollWeaponPickups` 25; bow.js `setDraw` 10; `_placeInHand` 8; `_tailGap` 7.5; `_solveQuiver` 6. See §4 |
| A-ID-ip-assets-gone, A-assets-tracked, A-port-guard | PASS | 30 GLBs, 0 IP hits; 234 refs, 0 missing; 0 connections to :5173 |
| A-licence-manifest | PENDING | Every clause passes except `third-party`, which is PENDING (wave W1) |
| A-no-horizon-terms-player, A-no-horizon-terms-code | PASS | 1503 ≤ 1508; 1371 ≤ 1371 |

### Reading the frames (1600 x 900, r2 then r3)

These are my readings, frame by frame, against the criteria and the reference crops in the same frame. They are not the judge's.

- **V-pan-closeup (r3, r4).**
  - What reads as itself without labels:
    - The linen sleeves and collar show a visible weave.
    - The violet smock shows dye variation and warp streaks.
    - The dark oiled leather girdle has a stitched edge, with a brass buckle, keeper and tongue.
    - The unbleached sash band sits under the girdle, and the girdle casts a contact shadow on it.
    - The esparto plait on the shins and soles reads as plait, not rope.
  - Layer order reads: sling over smock over band, girdle over band.
  - Beside the references: the linen holds up. The belt is plainer than the brass-fitted reference, by design. The plait reads paler and yellower than the espadrille.
  - The sash panel now shows the knot (a wrapped ring and two ears) and two creased tails with cut ends, behind the hip. The ears read thin, like wire loops, and the knot hangs about 6 cm under the band with nothing visibly joining them.
  - **Defect (R54, MAJOR in a close-up):** the armhole binding stands off the cloth as a thin purple hook over each shoulder (torso and back panels), with small purple tabs along the armhole on the sleeve. Cause and the measured cost of the fix are in §4.
- **V-variant-sheet (r2, r3).**
  - At full size, the four read apart: Pan II's wide hat and capelet, Pan III's pale jade scutes and white salt hems, Ash's dark wool with a rust under-layer and broad wraps.
  - At 20 m (75 px), Pan II (hat) and Ash (value, shape of the wraps) read apart by shape. **Pan III against Pan I is weak**: at that size only a paler hem and two small pale shoulder marks separate them.
  - No fur, no red hip sash (the sash is unbleached), no braids. The scutes sit on the clavicle.
- **V-weapon-sheet (r2).**
  - Silhouettes are per spec:
    - The bow at brace and at full draw is a long self-bow.
    - The grip is esparto with carmine lashings, with horn nocks.
    - The lance has a leaf blade with a midrib, a socket and lash.
    - The bob-shaped butt cap reads.
    - The vermilion and white graduations read.
  - It stands beside the self-bow and bronze-blade references without looking a tier below. The grip crop's label is cut by its panel ("carmi…").
- **V-gear-in-hand (r2, r3).**
  - At full draw, from three sides:
    - The limbs are visibly flexed.
    - The string runs tip to nock to tip, and the arrow lies on the bow hand's side.
    - The draw hand is at the cheek outside the hair, the elbow is level, and the bow arm is clear of the chest.
    - No arm goes behind the head.
  - The lance is held in both hands, blade forward. From behind, the raised bow arm's sleeve reads as a pale tube.
- **V-bow-carry (r2 → r3/r4).**
  - In r2 the stave ran through the sash's white tails at her left hip at every step of the jog.
  - In r3/r4 the tails hang behind the hip and the stave passes the skirt clean. The bow is low in the left hand, top limb forward.
- **V-brea-one-glance (r2, r3).** All five cues read at 64 px in FRONT, BACK and 3/4: violet wrap and topknot, wrap tail left-rear, crescent bracer, lance diagonal with the bob butt, cane quiver. In SIDE (her left) the tails now show at the back of the hip.
- **V29-wielded-carry@armory.** Not staged: there is no flanker until W2.



### The Nov 3 numbers (superseded by the tables above)

<details><summary>Nov 3 gate tables</summary>

Port 5257, tree `trees/armory`, 1600x900, run under the R53 rules. Numbers are from the last run that graded each row (runs `r12`, `r13`, `r14`, `r15` in my scratch, Nov 4 02:00–04:10 UTC; assets rebuilt before `r13`, Pan III again before `r15`). A visual row prints NEEDS-JUDGE; "read" below is my own reading of the frame, the independent judge has not seen them.

### Block (§9 armory W1)

| Row | Result | Measured |
|---|---|---|
| A-armory-budget | PASS | outfit-pan-1 0.451 MB, ash-1 0.325 (cap 0.8); pan-2 0.122, pan-3 0.121 (cap 0.15); stowkit 0.125, bow 0.059, lance 0.044 |
| A-gear-draws (R38's held clause) | PASS | stowed 4 draws / 2 casters; bow at full draw 5 draws / 2 casters, held 1,524 tris, drawing adds 0 stray mesh; 25,350 tris total (≤ 40 k) |
| A-weapon-sockets | PENDING | armory's clauses pass: bow arc 1.458 m (1.45), chord 1.414, lance 1.55, every socket present, pull 0.582 / restZ 0.055. The held lance's prop scale 0.8 is melee's M9 |
| A-outfit-swap-memory | PASS | 158 geo / 115 tex / 2 skeletons before and after every swap |
| A-weapon-swap-memory | PASS | 160 geo / 116 tex / 29 materials, flat |
| **A-variant-swap-matrix** | **FAIL** | see below |
| **A-stow-clearance@armory** | **FAIL** (one clause) | dCalf 0.057 (≥ 0.05) PASS; crouched 0.094 above ground (≥ 0.05) PASS; head cover 0.181 at yaw 8, the bow (≤ 0.08) FAIL |
| **A-variant-motion-rerun:{pan-1,pan-2,pan-3,ash-1}** | **FAIL** (same clause) | stow as above, 0.179–0.189 cover. Run arms pass: wrist off midline 0.228, fore-aft 0.56, below the shoulder by 0.012, bob per stride 0.074–0.077 (ash-1 0.095 in that run, A-run-arms' 0.08; the armor does not touch the pelvis, the row reads noise at its margin). Wrap clear 0.089 (≥ 0.05) |
| A-armor-verb | PENDING by design | ashStep: base jog 47, jog 0, sprint 23. Shrug 8.0 → 3.0. Brine filters are combat-kit W2 |
| A-no-move-mods | PASS | canon speeds under all four, dodge 4.16–4.24 m, jump apex 1.5 m, air 0.75 s |
| A-weapon-role | PENDING until W3 | |
| A4 / A5 / A51 @armory | PASS | draw 0.97–1.0, arrow fired, nock gap 1.10 s (1.07) |
| A52 @armory, V29 @armory | PENDING / film | R30: no live flanker or sentry. V-bow-carry stands in for V29 |

A-variant-swap-matrix, 32 rows (armor × pose × weapon, run `r15`), against where the last pass began (`r8`):

| Clause | Bar | Before the fit | Now | Reading |
|---|---|---|---|---|
| (a) stretch | ≤ 1.6 | 2.18, most rows over | 31 of 32 rows ≤ 1.553; pan-2 light 2.003 (14 edges, left ankle) | FAIL by one row, and which row moves from run to run: `r13` had pan-2 idle-lance 1.793 (the sash's spring chain) and ash-1 sprint-lance 1.677; `r9` pan-3 idle-lance 2.6. I read these as one-frame transients of a joint (foot, spring chain) because the same edges pass in the same pose on other runs and variants. I inferred that from the edges; I did not measure the bones |
| (b) inside the body | ≤ 0.5 % of vertices > 4 mm | 1.69 % | 1.21 % worst; pan-1 worst 1.08 %; 15 of 32 rows pass | FAIL. Most of what is left clusters where two body surfaces overlap in the pose itself: arm on ribs, back of the knee, inside of the elbow. Offline counts by zone, not a proof for every vertex |
| (b') head | 0 | 0 | 0 | PASS |
| (c) stow vs outfit | ≤ 5 mm | −49 mm, 360 verts | −39 mm worst; 26 of 32 rows clean | FAIL: pan-2's back hat against the stowed bow with the lance out (−39 mm, ≤ 10 verts), the pumping elbow at the arrows (ash-1 sprint, −34 mm, 114 verts), the quiver's foot at a hem at a heavy (−12 mm, ≤ 6) |
| (c) held vs outfit | ≤ 5 mm | −46 mm | −11 mm worst; 27 of 32 clean | FAIL: the stave where it leaves her fist, against the hip at a sprint (≤ 5 verts) |
| (d) pieces to draw hand / head | ≥ 0.03 | 0.036 / 0.030 | 0.035 / 0.031 | PASS |
| (d) hat to lance | ≥ 0.03 | 0.11 | 0.12 | PASS |

### Carried rows my files touch

| Row | Result | Measured |
|---|---|---|
| A16-draw-anchor, A35-cheek-anchor, A-draw-elbow-level, A-lmax-solve | PASS | hand to Head 0.108–0.111, bow elbow 168°, lmax 0.532 |
| A-run-arms | PASS | 0.229 / fore-aft 0.56 |
| A-outfit-merge-dispose, A-brea-contrast | PASS | 6,008 hidden body tris; salt contrast 5.73 |
| **A-hero-draws** | **FAIL (needs a ruling)** | its held clause is the code's: 5 draws, 2 casters, 1,524 held. It fails on `heroTris <= 20000`, R38's W0b measure: Pan I is 23,826 (body 9,864, outfit 10,579, kit 3,383). Plan line 791 and §4.1 for W1: ≤ 40 k with each cap met (outfit cap 17.5 k), which holds. See section 5 |
| **A-lance-stow** | **FAIL** by a hair | draw 0.75: blade −0.154 m right of the spine (bar 0.15); crouch-walk's butt −0.013 to −0.017 past her centre on `r12`, `r13`, clean on `r15`. Every other pose passes. Carry solve, not recipe: the stowed lance's geometry only moved 1.5 cm off her back. Melee's `lanceStow.js` replaces this solve |
| **A-tail-legible** | **FAIL** | 8 of 24 gust moments at SIDE views: reach 3 px against 4, 20–26 tail px. Hero-body / character-art row; the bow's upper limb is the neighbour it is read against |
| A100, A101 | FAIL | R47: staged on the Round-4 spear, SKIP-replaced until melee's W1 |
| V-brea-one-glance | film | |

### Global list on my port (bars graded at the orchestrator's 5270 run, R45, R48)

| Row | Result | Measured |
|---|---|---|
| A1-boot-clean, A20b-no-system-errors | PASS | 0 system errors |
| A9-perf-budget | PASS | 241 draws, 59.9 fps, p95 18.1 ms |
| A21-real-draw-calls | FAIL (GPU term) | draws 250 / 176 / 270 (≤ 350), tris 3.7–4.0 M, median GPU 19.5 / 38.7 / 20.6 ms against 14. Not hero: the hero is 25 k of 4 M. R45 says the timing is the orchestrator's |
| A90-memory-stability, -expansion, A90b, A90-rig-reclaim, A90-abs, A-vram-ledger | PASS | |
| A-alloc-rate | instrument PASS; baseline guard FAIL on other owners (`world-sky` 1.23×, `instruments-core` 1.14×, `studio`); armory's row is 0.25× its baseline, and over its absolute bar | see below |
| A-ID-ip-assets-gone, A-assets-tracked, A-no-horizon-terms-code / -player | PASS | ratchet 1503 ≤ 1508; namecheck --code 1371 ≤ 1371 |
| A-licence-manifest | PENDING | only `r5-poc-rock-scan`'s re-fetch, not this lane; `armory-armor-w1` now records the MCO archive |
| A-port-guard | PENDING | not a full lane run; refusals pass |
| A-carried-suite | PENDING-orchestrator | R48 d, R53 b: no sealed full carried run of this build on 5257; run alone, as it asks |
| A-reach-all-sites | does not exist in this tree yet | |

**A-alloc-rate, armory's row (R48).** 6,531 KB/s → 1,571 KB/s (26.8 KB per frame in sprint-and-draw), against ≤ 4 KB/s per function from this exit. So it does not meet its bar. It was nearly all `src/hero/carry.js`, whose search evaluates some 300 lance poses every frame. Doubles now cross calls through typed slots, the grid runs every eighth frame with the pattern search warm-started between, and terrain height is read once a frame (which also takes load off `terrain.js`). Still over, with file:line:

| Function | KB/s |
|---|---|
| `_viol` carry.js:601 | 727 |
| `update` carry.js:256 | 598 |
| `_camGap` carry.js:691 | 63 |
| `_placeS` carry.js:233 | 60 |
| `update` combat.js:766 | 37 |
| `_pollWeaponPickups` combat.js:2351 | 23 |
| `_updateAimPoint` combat.js:1214, `_report` carry.js:407 | 16 each |
| `_solveQuiver` stowkit.js:136, `_pose`, `_placeInHand`, `setDraw`, `_place`, `update` combat.js:274, `_tailGap`, `_dir` | 5–9 each |

`_viol` and `update` still allocate per evaluation: their arithmetic has no call or literal left that I can find, so I suspect they run below the optimizing tier in the sampled window. I did not get that proven. Melee's `lanceStow.js` replaces this solve, which may settle it.

Recipe determinism: `build-assets --only armory --out` twice gives identical bytes, and they equal the files in the tree.

### What I read in the frames

- **V-pan-closeup.** Holds beside the references in the torso, the collar, the belt, the pouch: fine weave, a real keyhole with a bound edge and a tied cord, a stand collar in a different cloth, a buckle with depth, stitching only where something is sewn. Weakest beside the references: the skirt's folds are painted more than modelled, and the esparto wrap on the shin is rope-like, not plait. The sash, in sun, reads flatter and paler than everything around it.
- **V-gear-in-hand.** Full draw from her right is the best frame of the set. From behind (lower middle) the extended left sleeve reads as a slab end-on. Lance in hand reads well, the quiver swung clear.
- **V-bow-carry.** The trail carry reads; the stave stays off her legs.
- **V-brea-one-glance.** All five cues read at 64 px in FRONT, BACK and 3/4. In the SIDE views the wrap tail is hard to pick out against the stowed bow's upper limb, which is what A-tail-legible measures.
- **Kevin's bars.** Draw hand at the cheek, outside the hair; elbow level; bow arm clear of the chest; arms beside the body at a run (A-run-arms). Still wrong: the bow hand stands above the arrow (section 5, hero-body).
- **V-variant-sheet.** The four read apart at 20 m by shape: hat and capelet, scutes and pale salt, wool cowl with a rust hem. Ash's cowl was a flat disc standing off her chest until this pass; it now falls against her.
- **V-weapon-sheet.** Bow and lance hold; the bob and the grip wrap are the strongest parts, the stave's grain the weakest.

</details>

## 4. Honest gaps (Nov 6)

- **A-variant-swap-matrix stays red** (the clause table is in §3). What is left:
  - the held stave against the tails at the end of a sprint's back swing (Ash −1.35 cm, Pan II −0.90 cm), which is the carry hand below;
  - the quiver against her right side at a sprint and in the heavy attack (`stowkit._solveQuiver`);
  - (b) at 0.51–0.77 % on 13 rows that move ±0.15 points from run to run. The real offenders are Ash's cowl and Pan III's scutes at full draw, and the sleeves and cuffs at a sprint with the lance.
- **The held bow at a sprint is melee's carry hand.** At idle the left hand's joint is 1.4 cm inside the skirt. `_bowCarryLayer` (playerAnimator.js, melee's) aims the grip at (0.245, 0.94 + breath, 0.135) and keeps a third of the arm's swing. No orientation of the bow clears it: I searched the carry Euler over the whole plausible range on the ROM poses, and the best result left 0.7 cm at idle (old knot) and 1.5 cm at a sprint. The request is in §5.
- **Allocation.** The rewrite of carry.js did not move the in-engine numbers:

  | Function | Nov 3 | Nov 6 |
  |---|---|---|
  | `update` | 598 KB/s | 799 KB/s |
  | `_viol` | 727 KB/s | 620 KB/s |

  Armory's owner row is 1,897 KB/s (1,571 on Nov 3), which is 0.30x its baseline. The offline model (Maglev, the gate's own profiler) said the rewrite allocates nothing per frame, so that model is wrong for this page. Page-wide allocation is 45–62 MB/s, and terrain's `noise2D` alone is 10.5 MB/s. That pattern looks like unoptimised (baseline-tier) code, where every double operation boxes. I have no in-browser evidence of the tier: the harness exposes none and I had no slot to instrument one. The per-function 4 KB/s bar "from the W1 exit" will fail at the orchestrator's global run on carry.js, combat.js, bow.js and stowkit.js. §5 has the request.
- **Ash I at full draw** reads 0.70 % / 0.76 % in-engine: the cowl rides spine_03 while her shoulders ride the clavicles. The cowl-only ease (§0.6) fixes the number and spoils the roll's shape. Not shipped.
- **Pan III at full draw** reads 0.89 % / 0.91 %. The scutes are rigid on the clavicles and the deltoid rises into them. Not addressed.
- **Pan III, lance idle** read an edge stretch of 1.92 at the left ankle in r2 and r3, and 1.526 in r4 on the same boots. That is the sampled moment of the stance, not a fix.
- **The quiver goes into her right shin in the lance's heavy attack** (Pan I 4.6 cm, Ash 1.2 cm). This is `stowkit._solveQuiver`. Not addressed.
- **The armhole binding** over each shoulder is a 12-gon: every 2nd rim point over the top, every 4th under the arm. In the close-up it stands off the cloth as a thin purple hook over each shoulder, and there are small tabs on the sleeve. Binding every point fixes the look and costs 0.1 points of matrix (b) at full draw (§0.6). Not shipped.
- **The sash end no longer rides `dyn_sashEnd`.** The bones stand at the front of the left hip and the knot is now behind it (§0.6). The tails follow the pelvis and a quarter of the thigh, so they get no secondary motion.
- **The skirt's slits** open at a sprint, as slits do. From the front the trousers show through. From behind, the under-tunic hangs a few cm lower on the side whose leg is back (it did before this pass too).
- **Pan II's hat on her back** is a 0.42 m disc, now 28 mm further out. From the front its right half shows beside her neck.
- **The bracer's bronze crescent** stands 8 cm off the forearm (bible §3.1 cue 3, kept as designed).
- **A-hero-draws' 20 k term** (hero-body's gate file; R62 a retired it) is not mine to change. It is in §5.


### Still open from Nov 3
- The armhole with the arm raised (bow arm at draw, seen from her left) shows the linen panel I closed it with, flat and pale. It is honest as an under-tunic and better than the hole it replaces, but it is a flat polygon.
- The fit is tuned to the 53 dumped poses. Other poses (climb, a new melee clip) were not fitted.
- Ash Wraps I has had the least attention: the wool is nearly black under flat light and the chest wraps' ends show at the shoulder.
- Pan III's `_SALT` was read only at the sheet's scale.
- No committed work: the orchestrator's checkpoints hold it.

## 5. For other lanes and the orchestrator (Nov 6)

- **R62 answered my three questions; two rows that read them are not mine.** (a) `A-hero-draws` (`tools/gates.r5.hero-body.mjs`, hero-body's file) still tests `heroTris <= 20000`; R62 (a) retired that for §9's ≤ 40 k with each §4.1 cap. Pan I is now 12,813 tris, so the row stays red on any tree carrying this outfit until hero-body (or the orchestrator) edits that one clause. (b) and (c) are in my own rows (`A-stow-clearance@armory`, `A-variant-motion-rerun:*`, `src/hero/matrix.js`).
- **hero-body.** The bow hand stands 0.12–0.15 m above the arrow (Nov 3 measure, unchanged: `MODEL_Y`/`GRIP_Y` in `bow.js` and the draw solve's anchor must move together; `bow.getGripWorld(out)` is published). The Sabina's draw uniforms are now one `vec4` (`uBow`); if your probes read `U.uFlex` and friends, read `U.uBow.value.{x,y,z,w}`. The carry solve now measures the blade along her level shoulder line and keeps the butt left of her pelvis along her level hip line (A-lance-stow's own axes).
- **character-art: the sash chain.** `dyn_sashEnd` hangs at the front of the left hip (brea.mjs). The knot is now behind the hip (§0.6), clear of the bow hand, and the tails ride the pelvis and the thigh. If the chain should drive them again, its four points belong behind the hip, around (0.13, 0.99, −0.17) at bind. The recipe already reads them from `CHAINS.sashEnd`.
- **character-art.** `panBindTriangles()` is unchanged (no `brea.glb` rebuild for the hide bit). The sash knot sits where it did. The UBC body the outfit recipe fits to is not Brea's sculpt; if Brea's torso volume moves, re-run `armor/rom-poses.json`'s fit (the recipes rebuild in 25 s).
- **melee: the bow carry grip.** The carried Sabina is A-variant-swap-matrix's held clause, and it fails on the hand, not the bow. `_bowCarryLayer` aims the left hand at (0.245, 0.94, 0.135) in character space. At idle that puts the hand joint 1.4 cm inside Pan I's skirt, and at a sprint the damped swing brings it back against the skirt with 1.5 cm left after every orientation of the bow I could search. About 3 cm more abduction (x ≈ 0.275) and less back swing would clear it. Check with A-variant-swap-matrix's `heldDeep` (bar −0.005).
- **melee.** On merge: `combat.js` should call `lanceOut(melee)`, `HeroRig.update` calls `lance.setUrl(armory GLB)` (already wired, `src/hero/index.js`), removing the 0.8 prop scale unlocks A-weapon-sockets. The stowed lance's carry solve stays armory's (`src/hero/carry.js`), and its per-frame path is allocation-free now: keep it that way if you touch the stow.
- **world-ground.** `combat._updateAimPoint` reads `terrain.getHeight` at whole-metre (Smi) coordinates on its march and exactly near the ground. If the island's `getHeight` grows a vector or typed-array entry point, the remaining exact reads (about 2.4 a frame while aiming) could use it and box nothing.
- **combat-kit W2.** Brine filters finish A-armor-verb. V29 needs a live flanker.
- **orchestrator: allocation.** Armory's W1 per-function bar (4 KB/s) cannot be read off this page as it stands. carry.js measures 600–800 KB/s per function with no `new` in it, and the page as a whole allocates 45–62 MB/s (terrain `noise2D` 10.5 MB/s). The gate's offline method (Maglev, the same profiler) reads the rewrite at ~1.5 KB/s. Before W1 grades it, the tier the page's per-frame functions actually run in needs to be measured (one instrumented run). See §4.
- **orchestrator.** Recipe determinism holds (`build-assets --only armory --out` twice: identical bytes, equal to the tree). Pan II is 0.147 MB of its 0.15 cap with the contact shadow.
