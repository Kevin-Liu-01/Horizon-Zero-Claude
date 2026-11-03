# ROUND 5 — character-art (W1; R54, R56, R58)

Brea's close-up, rebuilt in the recipe, and the kit settlements builds NPCs on (R56, R57 c). Budgets did not move.

## 1. What was built

All of it is procedural, in `tools/build/recipes/brea.mjs` and `tools/build/recipes/lib/{face,skin,skin-human,hair,wrap,wrap-head}.mjs`,
from the CC0 UBC sources only. Nothing was downloaded.

| brief | now |
|---|---|
| blocky paper band, torn alpha, no folds | Wound cloth on the measured head form (`woundHeadwrap`): a base turn, two crossing turns, a gathered crown, a wound topknot with a carmine cord binding, a wrap knot. Each ribbon has a pillow section, a rolled hem, long tension folds and a fold + weave normal. Hems tuck into the layer under them (FrontSide rendering would otherwise show the sky through a lifted edge). The alpha edge is a worn hem, not a comb; the panel's outer texels stay out of bilinear reach, so no hairline runs along a hem |
| dark helmet shell | The shell is gone (a coverage guide only). Coil cards at the nape with a broken outline; close coils painted into the skin atlas at the temple and above the ear, which dissolve through the coil field and carry a metal mask so a strong sun does not turn them grey. The knot tail is now a cloth end with a frayed fringe on the same `dyn_hairKnotTail` chain |
| blunt, oversized nose; weak jaw | Tip lifted and pulled back, bridge straightened, alae and side walls slimmed; chin, mandible and neck reshaped; 260 silhouette edges refined along the jaw. The face field also tucks the ears and rounds the lobes, and adds a slight asymmetry (a dry mouth corner) |
| flat skin | Ray-cast AO (head, wrap and collar occlude) baked into albedo and ORM, convexity shading, seamless tone across UV seams, colour zones, pores in height and ORM, creases. The source's superhero make-up is off the lids. A small hero fill through the emissive slot (same image, no new map or draw) keeps the shadow side's form on dark skin |
| flat salt stripe | A finger-wiped chalky stroke: fat through the middle, thin and broken at its edges and ends, overlapping on the bridge, with a slight crackle only where it dried thick, and real relief in the normal |
| ∴ as three white blobs | Three small dark ink dots on the back of the right hand |
| eyes without depth | 160 px procedural eye patch: fibred iris, limbal ring, catch-lights on the visible iris, sclera that shades to the corners and under the lid, cornea bulge and low roughness. `eyeOpening` now uses two grids, which put the lash cards and the painted lid line on the true margin (they floated 3 mm up on the lid before). Brows are a soft mass with combed hairs |
| (found in the first live frame) | A hole through the neck inside the collar: the outfit's hide mask culled the neck. The mask now never hides a vertex inside the collar's opening |

The wrap tail's root is gathered and rolled into a half tube, so its stiff first third no longer reads as a flat plate; its chain rig and points are hero-body's and are untouched.

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
  `saltPaste({ y(X), half(X), xMax, salt, thick, cell })` (a finger-wiped chalky stroke: fat in the middle, thin
  at its edges, a slight crackle only where it dried thick), `scarSeam({ a, b })`, `inkDots({ dots, r, where })`.
- `eyeOpening(skinGrid, eyeCentre, { eyeR, ballGrid })`: pass `ballGrid` (a TriGrid of the eye mesh alone, `skinGrid` being the
  skin alone): a lid can lie within a hair of the ball, and without two grids the opening reads 3 mm too tall, which floats the
  lash card and the painted lid line up onto the lid.
- `paintEye(N, { span, iris, amber, rIris, rPupil, lidY }) -> { base, normal, orm }`, `blit(dst, W, patch, pw, ph, x, y)`,
  `webp(buf, W, { to, quality, channels, alphaQuality })`.

### `lib/wrap.mjs`
- `headForm(headSoup, { center, lift(dx,dy,dz), blur }) -> form`, `ellipsoidForm(center, { r, rAxis, axis, egg }) -> form`.
- `ribbon(form, { n, o0, w, warp(s), along, rowsT, lift, pillow, hemDrop, creases, creaseAmp, seed, joint, uv:{ rect, period, W, pxPerM, v:[a,b] } })`:
  one turn of cloth, a small circle on the form. `crownCap(form, opts)`, `cordRing(c, axis, R, r, opts)`,
  `clothTail(points, joints, { along, across, width(u), side, curl, twist, gather, fold, uvFront, uvBack, uvEnd })`.
- `vertexAO(geo, grid, { rays, maxD, floor })` writes COLOR_0 contact shadow; `fixWinding(geo)` (always,
  before joining: a double-sided material flips a back face's normal).
- `WRAP_ATLAS` (512² regions), `paintClothPanel(buf, { rect, period, dye, dye2, dye3, seed, creases, stripe, ... })`,
  `paintFrayEnd(buf, opts)`; `buf = { base: RGBA, normal: RGB, orm: RGB }` at 512².

### `lib/hair.mjs`
- `coilField(W, H, opts)`, `coilSampler(field, periodM)`, `paintCoilTile`, `paintCoilFringe`, `paintLashes`.
- `hairCoverage(pm, shellGrid, { W, want })`, `hairlineLayer({ coverage(T), sampler, flowUV(T, uv) })`:
  close hair painted into the skin atlas, dissolving through the coils at its edge.
- `scatterAnchors(grid, { center, step, keep(p, d) })`, `coilCards(anchors, { flow(a, R), skinOf(p), rect, length, width, liftTip })`.
- `coilTuft(points, joints, { count, along, width, uv })` a tuft on a dyn_ chain (kept for NPCs; Brea's knot tail is cloth now).
- `browLayer({ x0, x1, line(x), side, strokes, scar, mass })` a soft mass with hairs combed over it, herringbone, tapering to the tail (a paint layer).
- `lashCard(open, { side, joint, zAt, rect })` upper lash cards.

### `lib/wrap-head.mjs` (a whole headwrap from a spec)
- `woundHeadwrap({ headSoup, joint, center, lift(dx,dy,dz), base: { tiltDeg, warpDeg, lowDeg, w }, turns: [{ phiDeg, tauDeg, oDeg, w, lift, hemDrop, hemDropUp, seed, along, flip }], bun: { c, axis, r, topY } | null, knot: [x,y,z] | null, tail: { points, joints, width(u), side, curl, twist, gather, gatherTo, roll, fold, along, across } | null, tail2: { points, joints, width(u), side, curl, twist, gather, fold, along, across } | null, tuft: { points, joints, count, along, width, side } | null })`
  `-> { geo, parts, covers(p), lowEdge(p), soup, center }`. Spec for Brea: `tools/build/recipes/brea.mjs`. `gatherTo` + `roll`: the
  tail's root is gathered and rolled into a half tube up to that fraction of its length, so a stiff root never reads as a flat plate.
  `tail2` is the other end of the knot, a narrow cloth end. Each crossing turn's upper hem tucks down to the layer under it (`hemDropUp`,
  default lift + 2 mm): models render FrontSide, so a hem left in the air is a slit you can see the sky through.
- `paintWrapAtlas(doc, material, { deep, violet, dark, mid, stripe, lining: [a, b, c] })`: paints the standard
  512² atlas (cloth in those dyes, the coil tile, fringe, lock tile, lashes) and sets the material
  (`MASK` 0.5, double-sided, metallic-roughness from a new ORM). A faction wrap is new dye hexes.
- `joinGeos(list)` joins buckets with `fixWinding` + a default COLOR_0; `rising(phi, tau)`, `rotAbout`, `DEG`.

### `lib/skin-human.mjs` (what every human recipe does the same way; call order = brea.mjs `build`)
1. Field: `findLandmarks` -> bumps -> `faceField` -> `applyField` (face.mjs) -> `recomputeNormals` -> `refineEdges(prim, { want, minLen, maxEdges })`
   (the jaw silhouette) -> `smoothNormals`.
2. `woundHeadwrap(...)` or your own hair, then `cullUnderWrap(prim, covers, isEar)`, `cullEyeBacks(eyesPrim, eyes)`,
   `simplifyHands(prim)`, `compactPrim(prim)`: these are what pay for the cloth (≈ 1.7 k tris).
3. `relayoutSkinUV(prim, { density: humanDensity, reserve: [{ id: 'eye', w, h }], pad: 0.009, elastic: 0.7 })`, `remapEyeUV(eyesPrim, eyes, rect)`.
4. `eyeOpening(skinGrid, eye, { eyeR, ballGrid })` per eye, `lashCard(open, { side, joint, zAt, rect })`.
5. `paintHumanSkin({ bodyPrim, skinMat, layout, eyeR, EYE_PX, L, eyes, brows: browLines(browPrim), shellGrid, occluders: wrapped.soup, collar: outfitTris, opens, marks: [...], scar, tone, iris, amber, hairColor, hairShape, names }) -> { stats }`.
6. `scalpCards({ bodyPrim, headW, shellGrid, wrapped, skinJ, skinW, hairShape, temples })`, `primFromGeo(doc, joinGeos([...]))`.
- `faceLayers({ L, eyes, cheek })` the standard layers; `hairShape(X, Y, Z)` the default hairline (pass your own for
  another head); `vertexWeightOf`, `eyeCentres`, `eyeFrontZ`, `movedMask`, `compactPrim`, `primFromGeo`, `EYE_SPAN`.
- A skin tone other than Brea's: `tone` (`#rrggbb` at the mid-cheek). The source layout and the stock tone stay; all paint is 3-D.
- The landmarks' rigid sockets and the eye mesh are unchanged from W0b. The `_HIDEMASK` rule changed in one way: a body vertex
  inside the collar's opening (`insideCollar`, brea.mjs) is never hidden, or the neck ends in a hole you can see the ground through.

### The material contract
- Skin: opaque, 1024² base, 512² normal, 512² ORM used as both occlusion and metallic-roughness (R AO,
  G roughness, B metal: 0 on skin, 0.7 on painted hair, metallic factor 1). The emissive slot points at the same base image with a small factor (`paintHumanSkin({ fill })`,
  default [0.05, 0.036, 0.03]; the wrap [0.03, 0.03, 0.03]): the hero fill, in place of a subsurface pass, so a shadow side keeps
  its form on dark skin. No new map, no new draw. WebP normals are 4:2:0, so keep pore relief bold enough to survive it, and do not
  print it into the albedo as well, or it reads as freckles or stubble.
- Hair + wrap: `alphaMode MASK` cutoff 0.5, FrontSide at runtime (`src/core/assets.js` forces every model's material to it, whatever the glTF says: geometry must carry both faces of anything seen from both sides, and `fixWinding` must have run), `COLOR_0` (u8 RGBA, linear: RGB contact shade,
  A multiplies the alpha cut), `metallicFactor 1` with the ORM's B channel (0 on cloth, 0.35 on hair, so
  near-black coils do not go grey in a strong sun). The ORM is a third 512² map; §4.4's "hair 512²" counted one.
