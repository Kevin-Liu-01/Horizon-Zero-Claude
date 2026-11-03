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
  `saltPaste({ y(X), half(X), xMax })`, `scarSeam({ a, b })`, `inkDots({ dots, r, where })`.
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
- `coilTuft(points, joints, { count, along, width, uv })` a tuft on a dyn_ chain.
- `browLayer({ x0, x1, line(x), side, strokes, scar })` brows hair by hair (a paint layer).
- `lashCard(open, { side, joint, zAt, rect })` upper lash cards.

### The material contract
- Skin: opaque, 1024² base, 512² normal, 512² ORM used as both occlusion and metallic-roughness (R AO,
  G roughness, B metal 0).
- Hair + wrap: `alphaMode MASK` cutoff 0.5, double-sided, `COLOR_0` (u8 RGBA, linear: RGB contact shade,
  A multiplies the alpha cut), `metallicFactor 1` with the ORM's B channel (0 on cloth, 0.35 on hair, so
  near-black coils do not go grey in a strong sun).
