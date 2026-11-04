# ROUND 5 — lane world-ground, W1 report (the island and the Pans)

Port 5259, worktree `~/.calima-r5/trees/world-ground`, Nov 3 2026. Plan sections this follows:
`docs/ROUND5-PLAN.md` §2 (row world-ground), §1.2 (`extent.js`/`sites.js` hand-over, the `?poc=biome`
removal grant), §3.1 (W1 exit), §3.2 (contracts), §4 (budgets), §6 (delete rows), §8.3 (R48, R54),
§9 (the world-ground block and the global list). Numbers and the gate table are in §6.

## 1. What this lane built

| deliverable | where | notes |
|---|---|---|
| Whole-island heightfield and masks at blockout (1024 m, 1.94 m nodes) | `src/world/island/recipe.js`, `bake.js` | pure functions, same code on the page, in the worker pool and in node (`tools/build/ground/island-check.mjs`) |
| Worker-pool build, byte-identical to the single-thread build | `src/world/island/pool.js`, `bake.worker.js` | plan §8.3 pool-terrain-build; `?terrainpool=0` forces the single-thread path |
| Extents and REST at Saltrow | `src/world/island/extent.js`, `sites.js` | `PLAY_RADIUS` 490, every `EXTENT` offset follows, `REST` is Brea's cistern |
| Terrain API on the baked grid | `src/world/terrain.js` | `A-terrain-api`; `riverFactor` still exported, returns 0 |
| The Pans at full fidelity | `recipe.js` (salt field, Glass, red tuff ring, Organ Shelf table, storm beach, dunes), `groundShader.js`, `water.js`, `vegetation.js`, `scatter.js` | see §2 |
| Five procedural ground layers | `tools/build/ground/gen-ground-layers.mjs` → `public/textures/ground/*` | project-original (R41), all `LICENSES.json` rows through `tools/licences/add.mjs` |
| Skyline map: long soft terrain shadows at any hour | `bake.js` `bakeSkyline`, `groundShader.js` `gSkylineVis` | new; see §2.5 |
| R48 owner bar | `terrain.js` `noise2D` | the destructured `[i1, j1]` is two integers now |
| POC closure | `src/main.js` block removed, `public/textures/r5-poc/**`, `tools/r5-poc/poc-biome.js` deleted | `public/models/r5-poc/*` stays until its two generators are re-pointed by their owners (§5) |

## 2. How the Pans are made

### 2.1 The salt field (`recipe.js`, `bake.js`, `groundShader.js`)

Ten rows of hand-laid cells in a frame `SALT_FIELD` (`sites.js`), cut in a straight (U, W) frame and
warped into the world so rows fan slightly and cross walls lean: never a ruled brick pattern. A cell has
a fill on the salt-pan ladder (`PAN`: brine, pink, white, cream, rust, mud), with fill odds running from
sea water by the shore to rust crystallisers by the town. The bake writes one 512² texture over `PAN_BOX`
(0.48 m a texel): crust, brine, hue, cell interior. The cells' floors are planed flat, and a 42 m apron
lets the country fall to them without a scarp. The stone itself is instanced (`pan-dykes`, ≈ 1,200 runs
of six welded stones), and past the cascades a one-lookup shadow keeps a dark band on the side of every
dyke away from the light, so the grid reads at any distance.

### 2.2 The red tuff ring and the Glass

`craterField` is an ellipse in plan (long E-W), open to the sea: pale talus fans at the foot, a stratified
cliff with V gullies and benches that dip seaward, a dark flat cap, a long back. The tint bakes the beds per
vertex (bible Rust Red and its kin). `glassD` warps the lagoon's outline into bays and points. The Glass's
waterline is the mesh's own intersection with its water plane, so it is crisp at any range.

### 2.3 The sea (`water.js`)

One plane, one shader, one draw. All surf is authored in shore coordinates: `off`, metres seaward from the
baked coast distance (¼ m steps), and `sA`, metres along the shore from the bearing round the island. Three
trains of fronts break in sections with their own gaps, trail lace, lie as a thinning carpet on the shallows
and end in a bright swash lip. The foam network is sampled in (`sA`, `off`), so its filaments lie along the
coast. Out at sea the normals are three analytic swell trains, each anti-aliased by its own `fwidth`.

### 2.4 Scatter (`scatter.js`, `vegetation.js`)

Eight kinds, one draw each (+3 for a caster): marram near/far, glasswort, sea-lavender, broken basalt
boulders, hex-packed basalt pavements, dyke runs, salt heaps/windrows/cones. Nothing grows in a cell.
Plants use their authored up-biased normal and are never flipped for the back face (that painted them black).

### 2.5 Long shadows without a caster (`bakeSkyline`, `gSkylineVis`)

The cascades end at 120 m and the heightfield does not cast. The bake stores the terrain's skyline toward
eight bearings (2 RGBA8 at 512², 2.8 MB with mips, ≈ 100 ms in the pool); each frame sets the light's bearing as
weights over the eight channels. Ground, rock and plants read it with two texture lookups, so the crater, the
rise and the dunes throw long soft shadows at any hour, for sun and moon, at no CPU cost. In calima the
strength drops to the bible's 0.45.
