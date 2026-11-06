# ROUND 5 — lane world-ground, W1 report (the island and the Pans)

Port 5259, worktree `~/.calima-r5/trees/world-ground`, Nov 3–6 2026. Plan sections this follows:
`docs/ROUND5-PLAN.md` §2 (row world-ground), §1.2 (`extent.js`/`sites.js` hand-over, the `?poc=biome`
removal grant), §3.1 (W1 exit), §3.2 (contracts), §4 (budgets), §6 (delete rows), §8.3 (R48, R49, R54–R58),
§9 (the world-ground block and the global list). Numbers and the gate table are in §4.

<!-- STATUS -->

## 1. What this lane built

| deliverable | where | notes |
|---|---|---|
| Whole-island heightfield and masks at blockout (1024 m, 1.94 m nodes) | `src/world/island/recipe.js`, `bake.js` | pure functions, same code on the page, in the worker pool and in node (`tools/build/ground/island-check.mjs`) |
| Worker-pool build, byte-identical to the single-thread build | `src/world/island/pool.js`, `bake.worker.js` | plan §8.3 pool-terrain-build; `?terrainpool=0` forces the single-thread path |
| Extents and REST at Saltrow | `src/world/island/extent.js`, `sites.js` | `PLAY_RADIUS` 490, every `EXTENT` offset follows, `REST` is Brea's cistern |
| Terrain API on the baked grid | `src/world/terrain.js` | `A-terrain-api`; `riverFactor` still exported, returns 0 |
| The Pans at full fidelity | `recipe.js` (salt field, Glass, red tuff ring, Organ Shelf table, storm beach, dunes), `groundShader.js`, `water.js`, `vegetation.js`, `scatter.js` | see §2 |
| Five procedural ground layers | `tools/build/ground/gen-ground-layers.mjs` → `public/textures/ground/*` | project-original (R41), all `LICENSES.json` rows through `tools/licences/add.mjs` |
| Skyline map: long soft terrain shadows at any hour | `bake.js` `bakeSkyline`, `groundShader.js` `gSkylineVis` | see §2.5 |
| Sister isles on the horizon | `terrain.js` `_buildSkirt`, `_updateIsles` | see §2.6 |
| R48 owner bar | `terrain.js` `noise2D` | the destructured `[i1, j1]` is two integers now |
| POC closure | `src/main.js` block removed, `public/textures/r5-poc/**`, `tools/r5-poc/poc-biome.js` deleted | `public/models/r5-poc/*` is not this lane's path (§7) |

## 2. How the Pans are made

### 2.1 The salt field (`recipe.js`, `bake.js`, `groundShader.js`, `scatter.js`, `vegetation.js`)

Fifteen rows of hand-laid cells in a frame `SALT_FIELD` (`sites.js`), cut in a straight (U, W) frame and
warped into the world so rows fan slightly and cross walls lean: never a ruled brick pattern. The five sea
rows are the big evaporating ponds (18–42 m); from v 39 inland the crystallisers run in long narrow strips
4–6 m deep and 8–19 m long, as Janubio's do, so from the rim the far field is a fine grain of white, pink and
rust lines. The field wraps round Saltrow's ellipse (settlements builds into it at W2). 94 cells, 141 wall
runs, 2.7 km of dyke. A cell has a fill on the salt-pan ladder (`PAN`: brine, pink, white, cream, rust, mud),
with fill odds running from sea water by the shore to rust crystallisers by the town. The bake writes one 512²
texture over `PAN_BOX` (0.48 m a texel): crust, brine, hue, cell interior, at cell scale only; the crust's
fine grain (1–3 m) is the shader's, from two rotated lookups of the periodic noise texture, because baked at
0.48 m a texel it read as a lattice. The cells' floors are planed flat, and a 42 m apron lets the country fall
to them without a scarp.

The dykes are instanced (`pan-dykes`, one draw + its caster): each 1.7 m run is two courses of flat lava
slabs (a footing course and capstones breaking joint, 120 triangles) that overlap the next run at both ends,
so the runs butt into one unbroken low wall, ≈ 0.6 m wide and 0.3–0.45 m tall, dark basalt with salt on its
top. From the rim a dyke is a thin dark line; up close it is laid stone. Past the cascades a one-lookup shadow
keeps a dark band on the side of every dyke away from the light, so the grid reads at any distance.

### 2.2 The red tuff ring and the Glass

`craterField` is an ellipse in plan (long E-W), open to the sea: pale talus fans at the foot, a stratified
cliff with V gullies and benches that dip seaward, a dark flat cap, a long back. The tint bakes the beds per
vertex (bible Rust Red and its kin), and every real slope on the island is scored down its fall line in the
shader (rills, one lookup in a frame rotated to the slope), so no hill reads as a smooth tinted hump from
300 m. `glassD` warps the lagoon's outline into bays and points. The Glass's waterline is the mesh's own
intersection with its water plane, so it is crisp at any range; its emerald holds at any viewing angle (the
sky is a sheen on it, 0.62 of a mirror).

### 2.3 The sea (`water.js`)

One plane, one shader, one draw. All surf is authored in shore coordinates: `off`, metres seaward from the
baked coast distance (¼ m steps), and `sA`, metres along the shore from the bearing round the island. Three
trains of fronts break in sections with their own gaps; behind a crest the foam is marbling, not a sheet (its
cover stays under ≈ 0.4, where the lace lets only its bright filaments through), the spent bores lie on the
shallows as thinning streaks, and the swash ends in a bright lip. A pixel with no cover has no foam (the lace
alone never speckles open water). Past 130 m off the coast the surf terms are skipped outright (eight texture
fetches a pixel). Out at sea the normals are three analytic swell trains, each anti-aliased by its own `fwidth`.

### 2.4 Scatter (`scatter.js`, `vegetation.js`)

Eight kinds, one draw each (+ a caster for rocks, columns, dykes, salt): marram near/far, glasswort,
sea-lavender, broken basalt boulders, hex-packed basalt pavements, dyke runs, salt heaps/windrows/cones.
Nothing grows in a cell. Plants use their authored up-biased normal and are never flipped for the back face.
The runtime route-cover stamp only raises cover where the marram scatter can stand, with a margin under every
limit of `marramDensity` (the cover is read bilinearly between texels): `A59b`.

### 2.5 Long shadows without a caster (`bakeSkyline`, `gSkylineVis`)

The cascades end at 120 m and the heightfield does not cast. The bake stores the terrain's skyline toward
eight bearings (2 RGBA8 at 512², 2.8 MB with mips, ≈ 100 ms in the pool); each frame sets the light's bearing as
weights over the eight channels. Ground, rock and plants read it with two texture lookups, so the crater, the
rise and the dunes throw long soft shadows at any hour, for sun and moon, at no CPU cost. In calima the
strength drops to the bible's 0.45.

### 2.6 The sister isles (`terrain.js`)

Bible §8.1: a NW stratovolcano and a long low WSW isle, one merged draw. They ride with the camera at 0.8
(the near-still parallax of land 10 km off) so every vertex stays inside the far plane (2,400 m) and the sky
dome (1,900 m): placed at 2 km they were cut by the far plane and fogged to the sky colour, which left pale
ghost edges across the sky. Their haze is their own: each frame one visibility is set from world-sky's
transmittance over 300 m (`fogParams.transmittance`), so clear air shows a blue-grey silhouette and calima
all but hides it; the colour fades to the fog's horizon colour (`calFogHorizon`).

### 2.7 Black sand

The sand layer is basalt-black; the macro read (wind streaks, ash patches, scrub as tone past the plants'
range) lifts it by at most ×1.4, the dry-sand sky sheen is 0.04 (it was 0.085 and painted dunes tan against a
low sun), the storm-beach cobbles and the pan silt are darkened (×0.5, ×0.78) so no grey beach band runs along
the coast. Wet sand in the swash is dark and mirrors the sky.

## 3. APIs and contracts published (exact signatures)

`src/world/island/extent.js` (plain data, no imports; owned by world-ground from W1, §3.2):

```js
export const WORLD_SIZE = 1024;            // the one number the 860 / 720 m fallbacks change
export const WORLD_HALF = WORLD_SIZE / 2;
export const ISLAND_SCALE = WORLD_SIZE / 1024;
export const PLAY_RADIUS = Math.round(490 * ISLAND_SCALE);          // 490
export const MESH_SPAN = WORLD_SIZE * 1.3;  export const MESH_SEGS = Math.round(686 * ISLAND_SCALE);
export const EXTENT = { navSpan: 2, edgeSoft: -18, navOuter: -6, machineRim: -12, gatherRim: -15,
  routeRim: -12, searchRim: -20, anchorRim: -34, fleeRim: -45 };   // each kept-code extent = PLAY_RADIUS + offset
```

`routeRim` is −12, not the W0 literal's −20: the Sounding Ring stands at r 472, and −20 pulled its patrol
6 m off the request (`A-reach-all-sites` holds the patrol within 5 m). Every other offset is the W0 value.

`src/world/island/sites.js` (frozen data, imports only `extent.js`; safe in workers and node):

```js
export const SITES        // [{ id, name, e, n, x, z, h, biome, land }] bible §8.4, engine x = e·S, z = −n·S
export const siteById = (id) => site | null;
export const CISTERN      // { e: -284, n: -247, x, z }  Brea's cistern at Saltrow
export const REST         // { x: CISTERN.x + 0.6, z: CISTERN.z - 0.7 }  the only spawn / respawn / rest constant
export const REST_SITE    // { x, z, r: 25 }  the Instrument no-spawn ring
export const TRIG, TRIG_TOP = 4, SIGHT_PAIRS  // the six pillars, the ten rays that must stay open
export const SCAR         // { a: {x, z}, b: {x, z}, width: 25 }  the Screed Scar (W2)
export const TUBES        // { 'ninewalls-jameo' | 'malpais-tube' | 'the-boilers': [{x, z}...] }  (§3.2 W1-exit stub)
export const SALT_FIELD   // the field's frame { e, n, x, z, ue, un, ve, vn, uMin, uMax, vMin, vMax }
export const GROUND       // named ground for ctx.props.gatePlaces (world-props adopts any row as is)
```

`src/world/terrain.js` — `ctx.terrain` (`A-terrain-api`, frozen names):

```js
getHeight(x, z) → m            heightFast(x, z) → m        getNormal(x, z, out?) → Vector3
slopeFast(x, z) → |∇h|         surfaceAt(x, z) → one of Terrain.SURFACES
materialAt(x, z) → one of Terrain.MATERIALS             biomeAt(x, z) → one of Terrain.BIOMES
biomeWeights(x, z, out?) → { pans, holds, malpais, cloudline, flank, caldera }  (Σ = 1)
tallGrassDensity(x, z) → 0..1  isInTallGrass(x, z) → bool (> 0.45)
trench(id) → [{x, z}...] | null                 // §3.2: tube polylines, published W1, carved W3
water → IslandWater (also ctx.water, environment.water)
static SURFACES, MATERIALS, SURFACE_EMIT, SURFACE_AUDIO, BIOMES
export stampStealthDisc(x, z, r), stealthField(x, z), WORLD_SIZE, WORLD_HALF, PLAY_RADIUS
export riverFactor(x, z) → 0   // still exported: frozen nav.js imports it
```

`src/world/water.js` — `ctx.water`:

```js
levelAt(x, z) → m | null       depthAt(x, z) → m (0 off the water)      flowAt(x, z, out?) → {x, y, z} unit shoreward
pools → [{ x, z, level, rx, rz, kind }]   // the Glass first (the wading contract), then the coastal wading ring
seaLevel, glassLevel, tick(dt, t), dispose()
export class RiverWater { constructor(ctx) { return ctx.water; } }  // alias until world-sky drops the import
```

Consumed from other lanes: `ctx.props.gatePlaces` (world-props W1). Until it merges, `vegetation.js` sets
`gatePlaces = { ...GROUND, __fallback: true }` when world-props has not published one, so every gate stages on
measured ground; world-props can adopt or replace any row. `ctx.environment.fogParams` (world-sky's aerial
contract) for the isles and the mirrors.

<!-- GATES -->

## 6. For other lanes and the orchestrator

- **world-sky** (W1): the 07:00 and calima frames are filmed under stand-ins (`clear`, `overcast`), named on
  the frame. Two things only that lane can do: (1) the scene fog's horizon colour is not the sky dome's
  horizon colour, so the far sea meets the sky in a hard tonal step even now that the geometric gap is
  closed (§2.8); (2) `environment.js` still does `new RiverWater(ctx)`; once that import goes (`A-no-river`)
  delete the alias class at the end of `water.js` (one line, world-ground). The isles and the mirrors read
  `fogParams.horizon`, `fogParams.zenith`, `fogParams.transmittance()`: keep those names.
- **world-props** (W1): `ctx.props.gatePlaces` may adopt `GROUND` from `sites.js` row for row (every row is
  measured on this bake); the Organ Shelf table (`SHELF_LOBES`, top ≈ 9.4 m), the Sounding Ring's beach
  (r 472) and the salt field's frame (`SALT_FIELD`) are where the landmarks stand. The vistas are filmed
  without the landmarks (named on the frame); V-biome-vista-pans's "Organ Shelf and Ring read" clause is
  PENDING on that merge.
- **`public/models/r5-poc/`** is not this lane's path (§2 row: `public/textures/r5-poc/**`, deleted). Its two
  files are outputs of `tools/build/landmarks/gen-sounding-ring.mjs` and `tools/build/instruments/gen-tiller.mjs`
  and are listed in pipeline's `A-assets-tracked` mustTrack and in `LICENSES.json`. Deleting them needs their
  owners to re-point the outputs (world-props, instruments-a) and pipeline to drop the two rows.
- **settlements** (W2): Saltrow's ellipse in the field frame (u 2 ± 54, v 84 ± 34) is kept clear of cells;
  `REST` is the cistern at (−284, 247).
- **brand**: V38's vista clause can be graded now: the title camera stands on REST, so the title frame is
  the Pans (salt grid, the Glass, the tuff ring, the sister isle) under the calima stand-in; no Round-4 spire
  or prop is in it (`A-round4-gone-from-view`).
- **engine follow-up (§11)**: the Pans vista's GPU time (§4), and A108 on real content (§4).

