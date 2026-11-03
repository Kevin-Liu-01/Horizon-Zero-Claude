# ROUND 5 — character-art (W1; R54, R56, R58)

Brea's close-up, rebuilt in the recipe, and the kit settlements builds NPCs on. WIP: the API below
is published early for settlements (R56, R57 c); the gate table is filled in at the lane's exit.

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
  G roughness, B metal 0). The emissive slot points at the same base image with a small factor (`paintHumanSkin({ fill })`,
  default [0.05, 0.036, 0.03]; the wrap [0.03, 0.03, 0.03]): the hero fill, in place of a subsurface pass, so a shadow side keeps
  its form on dark skin. No new map, no new draw. WebP normals are 4:2:0, so keep pore relief bold enough to survive it, and do not
  print it into the albedo as well, or it reads as freckles or stubble.
- Hair + wrap: `alphaMode MASK` cutoff 0.5, FrontSide at runtime (`src/core/assets.js` forces every model's material to it, whatever the glTF says: geometry must carry both faces of anything seen from both sides, and `fixWinding` must have run), `COLOR_0` (u8 RGBA, linear: RGB contact shade,
  A multiplies the alpha cut), `metallicFactor 1` with the ORM's B channel (0 on cloth, 0.35 on hair, so
  near-black coils do not go grey in a strong sun). The ORM is a third 512² map; §4.4's "hair 512²" counted one.
