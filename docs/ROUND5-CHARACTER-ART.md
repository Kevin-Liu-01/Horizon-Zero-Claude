# ROUND 5 — character-art (W1; R54, R56, R58)

Brea's close-up, rebuilt in the recipe, and the kit settlements builds NPCs on (R56, R57 c). Budgets did not move.

## 1. What was built

All of it is procedural, in `tools/build/recipes/brea.mjs` and `tools/build/recipes/lib/{face,skin,skin-human,hair,wrap,wrap-head}.mjs`,
from the CC0 UBC sources only. Nothing was downloaded.

| brief | now |
|---|---|
| blocky paper band, torn alpha, no folds | Wound cloth on the measured head form (`woundHeadwrap`): a base turn, two crossing turns, a gathered crown, a wound topknot with a seated carmine binding, a wrap knot. Each layer lies on the ones under it (`clothStack`, a radial height field of everything wound so far) and sends both hems under them, so no hem stands in the air and two turns meet on the upper one's hem. Whatever a later layer wholly covers is dropped (`cullCovered`, about 1 k tris), which pays for a closed shell inside the head wrap, the bun and the knot: models render FrontSide and the skull is culled, so a lifted hem used to be a slit straight through her head |
| dark helmet shell | Coil cards at the nape and temples with a broken outline, with real value now (crowns of dark warm brown over the bible's near-black, little metal). Close coils painted at BOTH temples under the real hem (`hairBandUnderHem`, which reads the wrap's `hemGap`), so the two sides match whatever the turns do. The knot tail is a frayed cloth end on the same `dyn_hairKnotTail` chain |
| blunt, oversized nose; weak jaw | Tip lifted, narrowed and given a plane, alae in, bridge straightened; the cheekbone comes up and forward rather than out and the jaw angle down rather than out, so the face reads longer and not wide; the far cheek's outline and the ear's rim are refined and smoothed (`refineEdges`, `smoothPositions`). Fix round 1 (R54 "wide and flat", "a ball nose"): the lobule narrows to a defined tip and the alar lobules slim (across only, so the profile and its IoU do not move); the jaw angle now comes down and 1.3 mm IN (its 6 mm delta kept), the mandible's line 0.9 mm in; a soft hollow under each cheekbone (3.4 mm), so the bone reads as a lit plane over a shaded fall to the jaw |
| faceted ears (fix round 1) | The source's normal map was baked against the stock ear's own vertex normals; on the moved, re-split and softened ear it printed flat planes across the helix and the concha. The ear's normals are no longer softened, and the map's relief goes in at half (`ears` layer, `T.nflat` 0.5): the folds read, the planes do not |
| black nostrils, pale shard, lit lines in a back light (fix round 1) | The game's sun shadow samples 3.5 cm out along the vertex normal (`environment.js` `normalBias 0.035`), so anything facing a sun that a few millimetres of her own skin hides from it lit up anyway. `leanInwardNormals` now ends with three ray passes on the mid-face: a deep fold shades by its bent normal (the way out of it, 96 rays, 3 cm); the nose's underside takes the light the upper lip throws up into it (a forward lean, safe in a back light); and for 36 back suns (azimuth 100..260 deg, up to 52 deg high) a vertex that faces one its own skin shuts it off from turns away from it by the least projection. The nostrils are graded dark brown round a dark slit, the columella no longer a pale shard between two black holes, and the alar groove, lip corners and lower lids stay dark with the sun behind her |
| concentric rings on the topknot's crown (fix round 1) | The crown cap's radial pleats reach down to 31 deg on the bun (was 46), 10 pleats over 4 rings: the turns' edges under it are culled, so from above and behind the crown reads as gathered pleats |
| flat skin | Ray-cast AO (head, wrap and collar occlude) baked into albedo and ORM, convexity shading, seamless tone across UV seams, colour zones, pores in height and ORM, creases. A hero fill through the emissive slot (same image, no new map or draw), which follows the scene's ambient (R59 c: full by day, 7.5 % at 01:00) |
| flat salt stripe | A finger-wiped stroke of uneven width, cracked over its whole length in the albedo as well as the height (full sun clips the paste, so a crack in the normal alone vanished on the lit cheek), with a painted light top edge, a shaded bottom edge and a contact line on the skin |
| scar | 3 cm, down from under the wrap and THROUGH the left brow, out of its lower edge. The hairs and the soft mass part over the brow's full height. A sunk pale channel with raised, darker lips, so it has relief |
| ∴ as three white blobs | Three small dark ink dots on the back of the right hand |
| eyes without depth | 160 px procedural eye patch: fibred iris, limbal ring, catch-lights, sclera that goes warm and low to the corners with a wet line. A cornea dome in the geometry (`corneaDome`), so the iris and a wet form read from the side. Lash cards on the true margin, thin at the outer corner, so from the side they are hair and not a slab |
| (backlit) | What faces into the head is near-black in the albedo with its normal bent or leaned out of any sun behind her (`leanInwardNormals`, `inward`, `nostrils`, including the source's normal inside the nostril through `T.nflat`): the shadow pass renders back faces, so those walls had no caster in front of them and burned white |
| (collar) | A closed dark skirt under the outfit (`appendCollarSkirt`, 120 tris), so a look down the collar never meets the ground through her |
| wrap tail | The root starts inside the knot and is a closed gathered roll, reading from both faces, opening to the flat strip. The inner face is mostly orchil with a carmine centre (`facing`), so carmine stays the accent the bible's 6 % asks for. The chain rig and points are hero-body's and are untouched |

## 2. Gates (`tools/gates.r5.character-art.mjs`; `node tools/gates.mjs --port 5266 --lane character-art`)

Runs on port 5266, Nov 3, final build `brea.glb` 589,120 bytes. Visual rows are the builder's own reading (R29: the independent judge grades them).

| gate | result | measured |
|---|---|---|
| **A-brea-budget** | PASS | 9,804 tris live (skin 6,252 + hair/wrap 3,552; ≤ 10 k), 2 draws, 1 skeleton, skin 1024² + 512² normal + 512² ORM, hair/wrap 512² x 3, 589,120 bytes (≤ 0.7 MB); alpha cut 0.5, per-vertex shadow, face normal energy 2.51 (≥ 0.6), AO range 35..255 (≥ 90) |
| A-face-delta | PASS | ≥ 6 mm on 5 of 7 (bridge 7.88, cheek 6.38, jaw 6.63, chin 6.75, brow 7.39; tip 4.46 and upper lip 1.57 are below it on purpose: the blunt tip came from pushing it out), eye socket 0.211 mm, profile IoU 0.8909 (≤ 0.92) |
| A-human-bind | PASS | 52 / 52 pairs, hipScale 0.994 |
| A-hero-draws | PASS | hero 4 draws, 2 casters, 19,860 tris (body 9,804, outfit 7,876, kit 2,180) |
| A33-hair-bounce | PASS | `dyn_hairKnotTail_04`: detrended 0.077 m (≥ 0.04), 3.73 Hz vs footfall 3.73 Hz |
| A-tail-legible | PASS, 3 of 4 runs | 0 of 24 failing moments in r1, r5, r6. r4 had 1 of 24 (reach 3 in both side views at +4.20 s). This is hero-body's open tail-margin finding (known flake about 3.5 % per run); it owns the fix |
| A-wrap-clear | PASS | min clearance 0.055 m (≥ 0.05) |
| A-brea-contrast | PASS | salt 6.03:1, sand ΔE 21.5, 22.7 % of pixels at 3:1 |
| A-outfit-merge-dispose | PASS | geometries 152 → 152, textures 115 → 115, skeletons 3 → 3 |
| A90b-memory-attribution | PASS | 0 offenders |
| A90-memory-stability | PASS | heap -1.2 %, geometries +17, textures -3, objects -33 |
| A1, A20b, A-assets-tracked, A-build-deterministic, A-no-horizon-terms-player / -code, A-alloc-rate and A-vram-ledger (instruments) | PASS | namecheck `--code` 1365 of 1365 |
| A-licence-manifest | PENDING | third-party PENDING on another lane's row (`r5-poc-rock-scan`: `archive_sha256`, `retrieved`); every other term PASS |
| A-port-guard | PENDING | a lane run has no sealed carried run: the orchestrator's row |
| A-ID-ip-assets-gone | FAIL in this tree | The scan passes (`ipHits` 0). Only a negative control fails; main's 2b4c9b6 fixes that control, and this tree has not merged it yet. Not this lane's content |
| A21-real-draw-calls | FAIL, timing term only | Draws 275 of 350, triangles 3.93 M of 6.5 M pass. medianGpuMs 21.7 / 29.4 / 20.6 (vista / herd / fight) against 14. W0b's runs on main read 22-23 / 43-45 / 22-26 on a loud box, so nothing here points at this lane, though the boxes differ. R58 grades the timing at the W1 exit |
| V-brea-closeup (day) | reads well | Front, 3/4, profile on her left, sun on her left front |
| V-brea-closeup-dusk | reads well | The best of the set: warm key, the shadow side keeps its form |
| V-brea-closeup-calima | reads, on a stand-in | `overcast`, because this tree has no calima state; re-film when world-sky lands. Skin is a little dark and dull in flat light |
| V-brea-closeup-detail | reads well | Paste, eyes and hem hold at 0.3 m. The nape panel is half hidden by the wrap tail in the wind |
| V-brea-face, V-brea-one-glance, V23-secondary-motion, V22-chase-framing | green to my reading | V22 PASS on its action term (fill 0.677). 5 of 5 silhouette cues; both cloth ends move |

Staging, which a judge should know: the close-up rows take their camera from the face's own axes (read off the live skin), because the idle carries the head bowed; the sun is on her left, the side of the scar; the stow kit is hidden so the lance does not cross the lens.

Offline previewing: a CPU renderer of the GLB is how most of this was iterated, because the Chrome slot was often busy. It lived in scratch and is not part of the tree.

Before and after sheets: `reference/r5/character-art/` (`brea-face-before-w0b.jpg`, `brea-closeup-before-relaunch.jpg`, `brea-closeup-*.jpg`, `brea-face-after.jpg`).

### Still weak, next to the reference

1. It reads as a strong stylised game heroine, not as the photo. There is no subsurface pass, so the terminator is a hard line on the nose in low sun.
2. At 3x zoom the jaw and the bun outline still show a few polygon corners, and two crossing turns intersect with a small step at the selvedge.
3. The wrap tail's lining is a broad carmine strip in the front view when the wind brings it round. It is cloth now, but it is the least finished part of the head.
4. Her right temple shows almost no hair, because the hem sits lower on that side.
5. The hands are correct but plain.

### What others need to do

- **hero-body:** the idle carries her head visibly bowed in every close frame (about 15° by eye, not measured); levelling it would help every dialogue-range shot. The tail-margin finding stays yours. `CHAINS.wrapSash` and `CHAINS.hairKnotTail` were not touched, and the chain names and landmarks are unchanged. The knot tail is cloth now (`tail2`), still on `dyn_hairKnotTail`. `reference/r5/hero/brea-face-sheet.png` is now stale; it is in your folder.
- **armory:** the alidade neck cord is thick, white and low-poly at the collar in V-brea-face, and it is the cheapest thing near the new head. The flat pink-violet smock now reads a tier below the wrap.
- **settlements:** §3 is current. Leave `scalpCards`' `temples` false (the default now), pass both grids to `eyeOpening`, and give the hide mask an inside-collar exemption.
- **world-sky:** when the calima state lands, re-film `V-brea-closeup-calima`; the gate picks it up by name.
- **orchestrator:** merge main into this tree (the IP control). An independent judge is needed for the V rows. `src/core/assets.js:420` forces every model to FrontSide; the cloth is built for that, and the look clause of A-brea-budget says so.

## 3. API (reusable: `tools/build/recipes/lib/**`, Node only, deterministic, no clocks or `Math.random`)

### `lib/face.mjs` (kept from hero-body, one addition)
- `smoothNormals(prim, { iters, weight(p) })` softens vertex normals, welded by position; `weight` 0
  keeps a crease (lips, lids, nostrils). Do this after `recomputeNormals`.
- `smoothPositions(prim, { iters, weight(p), lambda, mu })` Taubin smoothing of positions, welded: rounds an ear's facets and
  a cheek's outline without shrinking them. Recompute the normals after it.

### `lib/skin.mjs`
- `relayoutSkinUV(prim, { density(island), reserve:[{id,w,h}], pad, elastic }) -> { islands, islandOf, reserved, shrink }`
  re-packs UV islands by a per-island scale (uniform scale + translate, so tangent normals stay
  valid). `island = { min, max, uv, tris, s, ox, oy }`; old uv = (new uv - ox/oy) / s.
- `decodeStockSkin(baseImg, normalImg, roughImg) -> stock`, `seamlessTone(prim, islands, islandOf, stock, W) -> [r,g,b]`
  (the source's broad colour welded across UV seams).
- `TriGrid(soup, cell).cast(ox,oy,oz, dx,dy,dz, maxT, minT)`, `triSoup(prim, keep?, out?)`,
  `bakeAOTexels(pm, grid, { rays, maxD, lift, want })`, `bakeAOPoints(pts, nrms, grid, opts)`,
  `blurMasked(src, W, H, valid, radius)`, `convexity(prim)`, `scalarMap(prim, values, W, H, fill)`.
- `paintSkinAtlas({ prim, islands, stock, W, tone, toneAt, ao, aoW, conv, layers, pm, toneMaps, formK, baseRough }) -> { base, normal, orm, filled, stats }`
  (RGB buffers at W; resize normal + ORM with `webp(buf, W, { to: 512 })`). A layer is `(T) => void`;
  `T` holds the bind position (`X,Y,Z`), normal (`nx,ny,nz`), atlas `x,y`, `r,g,b` (0..255), `h` (height, m),
  `rough`, `ao`, the source `sr,sg,sb` and its soft copy `br,bg,bb`.
- Layers: `smoothSkin({ zone })`, `eyeSocketClean({ eyes })`, `lipTone({ center, r, gain })`,
  `colourZones([{ at, s, gain, rough }])`, `pores({ zone, depth })`, `creases([{ pts, w, depth, dark }])`,
  `lidLines({ open, side })` (`open = eyeOpening(faceGrid, eyeCentre, { eyeR })`),
  `saltPaste({ y(X), half(X), xMax, salt, thick, cell })` (a finger-wiped chalky stroke of uneven width: fat in the middle, thin
  at its edges, cracked over its whole length in the ALBEDO as well as the height, because full sun clips the paste and a crack that
  lives only in the normal vanishes on the lit cheek), `scarSeam({ a, b, color, rim, w, depth })` (a sunk pale channel with raised
  darker lips), `inkDots({ dots, r, where })`.
- `eyeOpening(skinGrid, eyeCentre, { eyeR, ballGrid })`: pass `ballGrid` (a TriGrid of the eye mesh alone, `skinGrid` being the
  skin alone): a lid can lie within a hair of the ball, and without two grids the opening reads 3 mm too tall, which floats the
  lash card and the painted lid line up onto the lid.
- `paintEye(N, { span, iris, amber, rIris, rPupil, lidY }) -> { base, normal, orm }`, `blit(dst, W, patch, pw, ph, x, y)`,
  `webp(buf, W, { to, quality, channels, alphaQuality })`.

### `lib/wrap.mjs`
- `headForm(headSoup, { center, lift(dx,dy,dz), blur }) -> form`, `ellipsoidForm(center, { r, rAxis, axis, egg }) -> form`.
- `clothStack(form, { azN, elN, skin(dx,dy,dz) }) -> { topAt, clothAt, skinAt, bridged(d, spread), add(g), coveredAt }`: what is already
  wound on a form, as a radial height field. Give every layer the same stack, in order.
- `ribbon(form, { n, o0, w, warp(s), along, rowsT, lift, pillow, creases, creaseAmp, seed, joint, stack, bridge, hemSink, hemStart, hemDive, clearSkin, uv:{ rect, period, W, pxPerM, v:[a,b] } })`:
  one turn of cloth, a small circle on the form. With a `stack`, `lift` is the clearance ABOVE WHAT IS UNDER IT (about 1 mm, not an absolute
  height), `bridge` the angle over which it rides across a step in the layers under it, and both hems go `hemSink` under the cloth below
  them, so no hem stands in the air and two turns meet on the upper one's hem. Exposes `g.radiusAt(dx,dy,dz)` (null where it does not reach).
- `crownCap(form, { elMin, rings, seg, lift, gather, pleats, hem, uvRadial, stack, tiltAxis, uv })`: `uvRadial` runs the panel's creases up to the crown as
  pleats, never round it in rings. `cordRing(c, axis, R, r, opts)` is kept; a seated binding is a narrow `ribbon` with rows `[-1, 0, 1]` on the stack.
- `underShell(form, { axis, oMin(s), seg, rings, at(dx,dy,dz), joint, uv, W, cloth })`: a closed low-poly shell. `cloth: true` maps a panel on it where it can be seen.
- `cullCovered(g, depth(p), margin)`: drops every triangle wholly under what covers it; `compactGeo(g)` (lib/wrap-head.mjs) then drops the vertices. This is what pays for the shells.
- `clothTail(points, joints, { along, across, width(u), side, curl, twist, gather, gatherTo, roll, fold, rootBack, uvFront, uvBack, uvEnd })`: `roll` bulges the root's
  two faces apart into a closed rope that reads from both sides under FrontSide, `rootBack` starts the cloth that far inside the knot, and the faces meet at the selvedges.
- `vertexAO(geo, grid, { rays, maxD, floor })` writes COLOR_0 contact shadow; `fixWinding(geo)` (always,
  before joining: a double-sided material flips a back face's normal).
- `WRAP_ATLAS` (512² regions), `paintClothPanel(buf, { rect, period, dye, dye2, dye3, seed, creases, stripe, ... })`,
  `paintFrayEnd(buf, opts)`; `buf = { base: RGBA, normal: RGB, orm: RGB }` at 512².

### `lib/hair.mjs`
- `coilField(W, H, opts)`, `coilSampler(field, periodM)`, `paintCoilTile`, `paintCoilFringe`, `paintLashes`.
- `hairCoverage(pm, shellGrid, { W, want })`, `hairlineLayer({ coverage(T), sampler, flowUV(T, uv) })`:
  close hair painted into the skin atlas, dissolving through the coils at its edge. Coil crowns carry a dark warm brown over the bible's near-black, with a small metalness:
  more metal than that and the diffuse goes with it, and the nape reads as a black shell.
- `scatterAnchors(grid, { center, step, keep(p, d) })`, `coilCards(anchors, { flow(a, R), skinOf(p), rect, length, width, liftTip })`.
- `coilTuft(points, joints, { count, along, width, uv })` a tuft on a dyn_ chain (kept for NPCs; Brea's knot tail is cloth now).
- `browLayer({ x0, x1, line(x), side, strokes, scar, mass })` a soft mass with hairs combed over it, herringbone, tapering to the tail (a paint layer).
- `lashCard(open, { side, joint, zAt, rect })` upper lash cards.

### `lib/wrap-head.mjs` (a whole headwrap from a spec)
- `woundHeadwrap({ headSoup, skin(dx,dy,dz), joint, center, lift(dx,dy,dz), base: { tiltDeg, warpDeg, lowDeg, w, lift }, turns: [{ phiDeg, tauDeg, oDeg, w, lift, pillow, bridge, creaseAmp, seed, along, flip }], bun: { c, axis, r, rAxis, topY } | null, knot: [x,y,z] | null, tail: { points, joints, width(u), side, curl, twist, gather, gatherTo, roll, fold, rootBack, along, across } | null, tail2: { points, joints, width(u), side, curl, twist, gather, fold, rootBack, along, across } | null, tuft: { points, joints, count, along, width, side } | null, shell: { seg, rings } | null })`
  `-> { geo, parts, culled, covers(p), lowEdge(p), hemGap(p, max), stack, form, soup, center }`. Spec for Brea: `tools/build/recipes/brea.mjs`.
  **Breaking for an NPC spec written against the first version:** `hemDrop`, `hemDropUp` and `lowTuck` are gone, and a turn's `lift` is now about 0.0009 (the clearance over what is under it).
  `skin(d)` is a cast from inside the head, ears included: where the hems go under (`null` from it falls back to the form). The wrap closes itself: the head, the bun and the knot each hold a closed shell.
  `hemGap(p, max)`: metres of bare skin between a head point and the first hem above it (0 under the cloth, Infinity past `max`): hair and shade that follow the real hem.
- `paintWrapAtlas(doc, material, { deep, violet, dark, mid, stripe, lining: [a, b, c], facing })`: paints the standard
  512² atlas (cloth in those dyes, the coil tile, fringe, lock tile, lashes) and sets the material
  (`MASK` 0.5, double-sided, metallic-roughness from a new ORM). A faction wrap is new dye hexes. `facing` (0.3) is how much of the lining's width
  the outer dye turns back over at each selvedge; the binding reads the carmine centre.
- `joinGeos(list)` joins buckets with `fixWinding` + a default COLOR_0; `compactGeo(g)`, `rising(phi, tau)`, `rotAbout`, `DEG`.

### `lib/skin-human.mjs` (what every human recipe does the same way; call order = brea.mjs `build`)
1. Field: `findLandmarks` -> bumps -> `faceField` -> `applyField` (face.mjs) -> `recomputeNormals` -> `refineEdges(prim, { want, minLen, maxEdges })`
   (the jaw, the far cheek's outline, the ear's rim) -> `smoothPositions` (ear, cheek) -> `recomputeNormals` -> `smoothNormals`.
   `corneaDome(eyesPrim, eyes, sphereZ, { height, r0, r1 })` after any socket measure: from the side the iris and a wet form read.
2. `woundHeadwrap(...)` or your own hair, then `cullUnderWrap(prim, covers, isEar)`, `cullEyeBacks(eyesPrim, eyes)`,
   `simplifyHands(prim)`, `compactPrim(prim)`: these are what pay for the cloth.
3. `relayoutSkinUV(prim, { density: humanDensity, reserve: [{ id: 'eye', w, h }], pad: 0.009, elastic: 0.7 })`, `remapEyeUV(eyesPrim, eyes, rect)`.
4. `eyeOpening(skinGrid, eye, { eyeR, ballGrid })` per eye, `lashCard(open, { side, joint, zAt, rect })`.
5. `paintHumanSkin({ bodyPrim, skinMat, layout, eyeR, EYE_PX, L, eyes, brows: browLines(browPrim), shellGrid, occluders: wrapped.soup, collar: outfitTris, opens, marks: [...], scar, tone, iris, amber, hairColor, hairShape, hairBand, names, fill }) -> { stats }`.
   `hairBand = hairBandUnderHem(wrapped.hemGap, { center, az0, az1, azEnd, width, max })`: close coils at BOTH temples under the real hem, clear of the ear.
6. `leanInwardNormals(bodyPrim, eyesPrim, { L, eyes }) -> bent` AFTER the paint: what faces into the head stays out of a sun behind her (the shadow pass renders back faces), and
   (fix round 1) three ray passes on the mid-face (from under the lower lip to just over the eyes, |x| < 0.052): bent normals in deep folds (open < 0.62 of 96 rays within 3 cm),
   a forward lean of the nose's underside, and a least-turn projection away from every back sun (azimuth 100..260 deg, 4..52 deg high) that her own skin shuts off. The
   reason is the game's shadow `normalBias` (0.035 m): a surface a few millimetres of skin hide from the sun is lit unless its normal turns away. Any human head needs it.
7. `scalpCards({ bodyPrim, headW, shellGrid, wrapped, skinJ, skinW, hairShape, temples })` (`temples: true` for a wrapped head), `primFromGeo(doc, joinGeos([...]))`.
- `faceLayers({ L, eyes, cheek })` the standard layers; `hairShape(X, Y, Z)` the default hairline (pass your own for
  another head); `vertexWeightOf`, `eyeCentres`, `eyeFrontZ`, `movedMask`, `compactPrim`, `primFromGeo`, `EYE_SPAN`.
- A skin tone other than Brea's: `tone` (`#rrggbb` at the mid-cheek). The source layout and the stock tone stay; all paint is 3-D.
- The landmarks' rigid sockets are unchanged from W0b (the cornea dome is applied after that measure). The `_HIDEMASK` rule changed in one way: a body vertex
  inside and under the collar's opening (`insideCollar`, brea.mjs: y > 1.355, |x| < 0.145) is never hidden, or a look down the collar meets the ground through her.

### The material contract
- Skin: opaque, 1024² base, 512² normal, 512² ORM used as both occlusion and metallic-roughness (R AO,
  G roughness, B metal: 0 on skin, 0.7 on painted hair, metallic factor 1). The emissive slot points at the same base image with a factor (`paintHumanSkin({ fill })`,
  default [0.15, 0.108, 0.09]; the wrap [0.09, 0.09, 0.09]): the hero fill, in place of a subsurface pass, so a shadow side keeps
  its form on dark skin. No new map, no new draw. ACES crushes the darks hard (an input of 0.02 comes out at 0.003), which is why the factor is this size. `src/hero/index.js` scales
  `emissiveIntensity` every frame by the scene's ambient against noon's (R59 c: 7.5 % at 01:00), allocation-free; an NPC needs the same line. WebP normals are 4:2:0, so keep pore relief bold enough to survive it, and do not
  print it into the albedo as well, or it reads as freckles or stubble.
- Hair + wrap: `alphaMode MASK` cutoff 0.5, FrontSide at runtime (`src/core/assets.js` forces every model's material to it, whatever the glTF says: geometry must carry both faces of anything seen from both sides, and `fixWinding` must have run), `COLOR_0` (u8 RGBA, linear: RGB contact shade,
  A multiplies the alpha cut), `metallicFactor 1` with the ORM's B channel (0 on cloth, 0.19 on hair, so
  near-black coils do not go grey in a strong sun, and keep their diffuse in the shade). The ORM is a third 512² map; §4.4's "hair 512²" counted one.
