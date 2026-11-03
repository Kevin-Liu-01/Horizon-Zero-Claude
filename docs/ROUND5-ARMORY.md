# ROUND 5 — lane `armory`, wave W1

Plan: `docs/ROUND5-PLAN.md` §2 (armory row), §1.2, §3.2, §4.1, §9 "armory (W1, W3)", rulings R16, R31, R38, R54. Port 5257.
Run the block with `nice -n 10 node tools/gates.mjs --port 5257 --lane armory` from a scratch cwd (auto-discovered, `tools/gates.r5.armory.mjs`).

## 1. What was built

### Pan Whites I, "Raker's Whites" (`tools/build/recipes/outfit-pan-1.mjs`, `armor/lib/**`)

The set every later variant inherits. It was re-cut, because the MCO bodice cannot be painted out of its problem: the cups and the under-bust ledge are in the mesh, so any re-texture reads as a stock corset.

- **The over-smock is lofted from what cloth touches** (`armor/lib/smock.mjs`). `radialTable` samples the body, collar and sleeve surfaces per (height, bearing); `drapeTable` takes each slice's convex hull (cloth bridges every hollow), runs a straight line from the collarbone to the bust's apex and limits the fall below it (it hangs at 0.34 m per metre; it does not cup back in). `draftSmock` cuts one ring sheet from the neckline to the belt, with metric UVs and the body's skin. Armholes are clipped against an ellipse triangle by triangle (`cutEllipse`), so the rim is a clean curve whatever the grid does.
- **Layers, inside out.** The MCO bodice survives only as the linen under-tunic's stand collar, seen in the neck opening. Then the orchil smock with a scooped, keyhole neck, like the Museo Egizio tunic; a linen cord tied at the keyhole; bias-bound neck and armhole edges with real thickness (`bindingAlong`, a little C of cloth); gathers into the belt; four skirt panels with slits, a turned hem and a hem lip; the under-tunic's hem below it, skinned by height so it moves with the skirt instead of shearing.
- **Hardware.** Girdle: round-barred brass buckle (`tubeInto`, `roundRect`), bar, prong, leather keeper, a pierced rounded tongue with a worn hole. Sling: a brass slider where it crosses her ribs. Salt pouch: a soft belly over a flat back with a gusset, a rounded flap, a bronze toggle, two belt loops. Sash: a creased band, a tied knot with two ears, two tails (one on `dyn_sashEnd`). A leather finger tab on the right hand's three string fingers (bible §3.9, it was missing at W0b), the ∴ on the back of the hand left bare.
- **Atlas.** Threads differ one by one along warp and weft; slubs thick for a few cm and thin again; fold height and fold shading are baked together from `hangFolds` (sharp in the valley, round on the crest); stitching is fine, tone on tone, and only where something is sewn; salt dries at hems and tide lines, broken and soft; dye fades on the shoulders. Boots: a flat esparto plait wound up the shin, each turn lapping the one below, a coiled rope sole with a pale whipping thread. Per-texel `crease` scales the curvature pass, so source normals no longer draw black lines. Trim gained `tongue`, `sash`, `bind` (appended to the sheet; Ash's sheet carries the same names).
- Tris 13,453 (cap 17.5 k), 0.50 MB (cap 0.8), density 431 px/m.

### Pan Whites II, III, Ash Wraps I (`armor/{pan-2,pan-3,ash-1}.mjs`)

Geometry on the new base. II: palm hat (two hidden meshes, head and back) + capelet with brass clasp. III: celadon scutes rigid on the clavicles, crusted shin guards, salt per vertex. Ash I: its own 1024² sheet, diagonal wrap skirt, cowl, chest wraps, rope belt. II and III are at 0.148 MB (cap 0.15): meshopt FILTER encoding, 12-bit positions, 8-bit joints, and the base's vertices cut from 9.6 k to 8.8 k.

### Sabina Bow, Shepherd's Lance, stow kit (`armor/lib/{weapongeo,weaponatlas}.mjs`, `weapons/*`, `armor/stowkit.mjs`)

- Bow: one mesh, one draw, on the shared atlas; `src/combat/bow.js` flexes the limbs, draws the string and carries the arrow in the vertex stage. The stave's arc is now 1.45 m (it was 1.41). **The arrow's shaft and head were lathed along +Y instead of +Z** (they stood upright while the vanes lay flat); fixed, found by reading the frame.
- Lance: the head re-cut to the bronze reference's own form: a long cast socket running up into a strong midrib, the leaf's wings from its upper third, patina rubbed through along the rib. The atlas cell is 8× denser across than along, so its noise now runs in the blade's metres (it had streaked into a feather).
- Stow kit: bracer shell conformed to the forearm (the skin came through it in a zigzag). The quiver hangs on a new `stow_quiver` joint (hero-body's handover "pin the quiver's tilt"): rigid on the pelvis it went 39–42° at a sprint against the bible's 20°.

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

GATE_TABLE_PLACEHOLDER
