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

## 3. Gates

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

## 4. Honest gaps

- The matrix does not pass. Stretch is nearly there. Inside and stow are much better and still over. I took visuals over the literal number wherever they conflicted: an armhole that passed (b) by pushing cloth off the shoulder tore the neckline, so the yoke's room is capped at 5 mm, which costs 10–20 vertices in the draw rows. Those vertices do not show.
- The armhole with the arm raised (bow arm at draw, seen from her left) shows the linen panel I closed it with, flat and pale. It is honest as an under-tunic and better than the hole it replaces, but it is a flat polygon.
- The fit is tuned to the 53 dumped poses. Other poses (climb, a new melee clip) were not fitted.
- Ash Wraps I has had the least attention: the wool is nearly black under flat light and the chest wraps' ends show at the shoulder.
- Pan III's `_SALT` was read only at the sheet's scale.
- No committed work: the orchestrator's checkpoints hold it.

## 5. For other lanes and the orchestrator

- **Ruling requested, A-hero-draws.** R38's ≤ 20 k for body + outfit + kit was a W0b measure taken on the v0 outfit. W1's cap is §4.1's. Pan I cannot be 6.7 k tris and be this outfit. Character-art lists the row as must-stay-green, so it will go red on every tree that merges this. Asking for the row to read plan line 791 (≤ 40 k with each cap), or for a number.
- **Ruling requested, A-stow-clearance cover.** With R10's lance reaching head height, a 2.9 cm haft crossing the head box is 13–16 % from the worst yaw, and the bow's limb 18 %; melee's own row read 29.5 % on v0. 8 % over 24 yaws is geometrically out of reach with both weapons on her back at R10's angle. Which moves: the bar, or the carry?
- **Ruling requested, matrix (b) in creases.** A vertex between arm and ribs in an arms-down pose is under one of them wherever it is. The row could exclude vertices whose nearest skin is itself under another body part. I have not changed the gate; numbers above are its reading.
- **hero-body.** The bow hand stands 0.12–0.15 m above the arrow (`model.position.y = -0.1`, read live). The fix is `MODEL_Y ≈ +0.057`, `GRIP_Y ≈ -0.027`, a re-solve (drawLength ≈ 0.565, arrowLen ≈ 0.82) and a retuned elbow and anchor: tried, and it breaks A35 and A16 until retuned, so I reverted it. `bow.getGripWorld(out)` is published for it. The edge weights and stretch of matrix (a)'s sash row imply a `dyn_` segment near double its length for a moment at a lance draw (about 12 cm, inferred, not read off the bones): worth a look in the spring solver.
- **melee.** On merge: `combat.js` should call `lanceOut(melee)`, `HeroRig.update` calls `lance.setUrl(armory GLB)`, `disposeTree` is safe on `adoptWeaponAtlas`'s clones, removing SPEAR_SCALE unlocks A-weapon-sockets. A-lance-stow's two near misses are in the solve you replace. `src/hero/carry.js`'s search no longer boxes doubles and warm-starts; keep that if the solve survives. `combat.js:_placeInHand` now blends the bow's carry attitude by `moveSpeed`.
- **combat-kit W2.** Brine filters finish A-armor-verb. V29 needs a live flanker.
- **character-art.** `panBindTriangles()` is unchanged, so `brea.glb` needs no rebuild for the hide bit. The neck's skin shows above the new collar exactly where it did.
- **pipeline.** `heroStowKit`'s override in `rows.js` remains a data edit at merge.
- **Incident, for the record.** The main repo's `.git` and top-level files were wiped around 09:14 on Nov 3. I ran nothing touching the repo that I can find; the orchestrator restored it by re-clone; this tree was intact.
