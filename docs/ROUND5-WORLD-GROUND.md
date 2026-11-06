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

The dykes are instanced (`pan-dykes`, one draw + its caster, ≈ 2,600 runs): each 1.1 m run is six angular
lava stones in two courses (three footings, three capstones breaking joint, 120 triangles, faceted: welded
normals made pillows of them at 1.5 m) that overlap the next run at both ends, so the runs butt into one
unbroken low wall ≈ 0.6 m wide and 0.3–0.45 m tall, dark basalt with salt on its top. From the rim a dyke is
a thin dark line; up close it is stacked stone. A cell is cut at the 0.5 contour of its baked interior (used
raw, the 0.48 m ramp drew zigzag teeth along every diagonal edge), and its floor is pan silt wherever it is not
crust, never dune sand with ripples. Past the cascades a one-lookup shadow keeps a dark band on the side of
every dyke away from the light, so the grid reads at any distance. The salt layer is read twice (rotated 37°,
0.61 of the scale, half each) so no single tile's repeat lines up along a 30 m cell.

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

### 2.8 The offing (`water.js`)

The camera's far plane (2,400 m, engine.js) cuts the sea plane short of the line where it meets the sky, and
the gap showed the sky dome's underside as a hard band over the water in every sea frame. A ring of open
water 2,250 m round the camera, from sea level up to eye height (one draw, placed in `onBeforeRender` from
the camera the frame is drawn with, drawn after the sky dome), continues the far sea to that line. What is
left at the line is a tonal step between the fog colour and the sky dome's horizon colour: world-sky's (§7).

### 2.9 GPU work this lane did (A-gpu-tier at the Pans vista)

Past 190 m the ground shader replaces every normal-map fetch with that layer's measured mean (faded in over
150–190 m, so no seam), past 240 m it drops the anti-tile seam's second sample; the sea skips eight surf
fetches past 130 m off the coast; the near marram hands over to the far tufts at 44 m (was 52) and the small
kinds stop where they fall under two pixels. The vista is still over its bar (§4); the rest of the frame is
the post chain, the shadows and the cascades (engine.js, no lane after W0b).

### 2.10 Allocation (R48 c)

`terrain.js` allocates 3.8 KB/frame against the W0b baseline's 601 KB/frame (the one-line `noise2D` fix and
the island recipe replacing the per-frame landform). `getHeight`/`heightFast` are written out, not calls;
uniform stores are skipped when the light has not moved (a uniform's `value` is a tagged field, so every
stored double is a heap number); the isles' haze and the gust are read a few times a second. What remains
is the double that `getHeight` hands back to a caller that is not inlined (§4, §6): for those callers
`terrain.heightInto(x, z, out, i)` writes the same read into an array and returns nothing new.

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
getHeight(x, z) → m            heightFast(x, z) → m        heightInto(x, z, out, i = 0) → out (out[i] = m)
getNormal(x, z, out?) → Vector3
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

## 4. Gates (port 5259, `nice -n 10`, one Chrome under the slot protocol)

Final full run `run-j` (66 rows, Nov 6 15:45–16:19 UTC, 1-min load 2.8–3.0): the lane block, the global
list and the films in one Chrome. The rows that changed after it are re-run in `run-k` (§4.3).

### 4.1 The world-ground W1 block

| row | result | measured |
|---|---|---|
| `A-terrain-api` | PASS | 9025 samples, bad 0, riverFactor max 0, shelf 0 |
| `A-world-size` | PASS | WORLD_SIZE 1024, node 1.941 m, build 428/498/332/334/328 ms (median 0.708 µs/vertex, pool ×4), single-thread 992 ms, byte-identical true, sites off 0 |
| `A-play-extent` | PASS | PLAY_RADIUS 490 (from size 490), clamp → r 490 |
| `A-play-extent-grep` | PASS | own 0; others src/entities/machines/strider.js, src/hero/sheets.js |
| `A-single-rest-saltrow` | PASS | cistern err 0.92 m, spawn 0 m, respawn 0 m, ring centred true |
| `A-reach-all-sites` | PASS | 25 sites, bad 0, routes off 0, nav 19.2 ms (N 493) |
| `A-island-boundary` | PASS | 16 bearings, deepest 0.92 m, under 0 |
| `A30b-fall-wade-edge` | PASS | {"safe":{"h":3,"fall":3,"health":100,"state":"playing"},"hurt":{"h":6,"fall":6,"health":75.2,"state":"playing" |
| `A-biomes` | PASS | six biomes, worst Σ error 0 |
| `A58-surface-api` | PASS | Pans surfaces 7: rock, sand, water, silt, shale, cobble, dirt |
| `A58b-surface-audio-world-ground` | PASS | 12 materials routed 12, unrouted 0 |
| `A59b-cover-honesty-world-ground` | PASS | under-planted 0.0199 (bar 0.04) of 956; measured 2.11 tufts/m² |
| `A59c-mask-coherence-world-ground` | PASS | mismatched 0/0, sensitivity red 1 |
| `A60-stealth-lanes` | PASS | 20 routes, below 25 %: 0, worst 0.362, median 0.74; named unplantable 4, flyers 4 |
| `A-layers-budget` | PASS | 1024² 3, 512² 2 |
| `A-scatter-draws` | PASS | 7 kinds, 69 calls in frame |
| `A-anti-tile` | FAIL | sand30 0.092, sand55 0.019, salt25 0.239, salt50 0.101 |
| `A-skirt-masked` | FAIL | worst step 0.0984 (bar 0.08), land sd 15.04 |
| `A-columns-normals` | PASS | 397 columns, worst 0° |
| `A-biome-stream-memory` | PASS | Δgeo 3, Δtex 0, heap -1.91 % |
| `A18-slope-conform-island` | PASS | {"rows":[{"band":10,"slopeDeg":10,"ballClearM":[0.0001,0],"soleTiltDeg":[0,0]},{"band":20,"slopeDeg":20,"ballClearM":[0.0001,0],"soleTiltDeg |
| `A18b-slope-conform-moving-island` | PASS | {"at":{"x":-200,"z":-10},"rows":[{"tag":"downhill","worstClearM":0.008,"p90ClearM":0.0062,"worstSoleTiltDeg":21.22,"p90SoleTiltDeg":14.15,"s |
| `A29-steep-face` | PASS | {"faceDeg":55.8,"samples":279,"onFace":279,"maxSpeedMs":2.6,"maxFootErrM":0,"climbedM":0,"climbsPerRep":[0,0,0,0,0,0,0,0],"airborneFrames":0 |
| `A29b-steep-face-moving` | PASS | {"filmSolid":true,"slopeBands":[8.2,10.4,15.6,23.1,31.3,36.8,43.8,52.1],"rows":16,"clearRows":16,"ghostedOnClearSlopes":0,"lensInsideHer":0, |
| `A-round4-gone-from-view` | PASS | groups hidden 5, shown 0, live colliders 0 |
| `A-poc-biome-removed` | PASS | {"hookInMain":false,"gone":{"textures":true,"tools":true,"models":false},"note":"public/models/r5-poc awaits its two generators (gen-tiller  |
| `A-gpu-tier-pans` | PENDING | GPU median 20.17 ms (bar 13), 59.8 fps, p95 17.8 ms, 70 calls, 2390186 tris |
| `A22-msaa-pans` | PASS | SMAA ramp 0.3074 vs off 0.1273 (×2.415) |
| `A108-ao-periodicity-pans` | FAIL | worst 0.132; 10 fails (first: high@1 far147m: CONTROL peaks 0.171 on a far crop: the defect region is unmeasurable) |
| `A109-ao-distance-fade-pans` | PASS | high: 5 m 0.0923, >150 m 0; ultra: 5 m 0.0929, >150 m 0 |
| `V-biome-vista-pans` | NEEDS-JUDGE | "" |
| `V-biome-vista-pans-calima` | NEEDS-JUDGE | "" |
| `V-biome-vista-glass` | NEEDS-JUDGE | "" |
| `V-biome-vista-rise` | NEEDS-JUDGE | "" |
| `V-biome-vista-surf` | NEEDS-JUDGE | "" |
| `V32-ground-detail` | NEEDS-JUDGE | "" |
| `V20-aa-crop-pans` | NEEDS-JUDGE | "" |
| `V33b-no-ao-lattice-pans` | NEEDS-JUDGE | "" |
| `V-gpu-tier-look-pans` | NEEDS-JUDGE | "" |
| `V33-rim` | PENDING | SKIP-replaced (world-ground): subject deleted with the old landform (plan §6) |
| `A62-rim-face-lit-world-ground` | PENDING | SKIP-replaced (world-ground): subject deleted with the old landform (plan §6) |
| `A63-bedding-planar-world-ground` | PENDING | SKIP-replaced (world-ground): subject deleted with the old landform (plan §6) |
| `A61-scree-seated-world-ground` | PENDING | SKIP-replaced (world-ground): subject deleted with the old landform (plan §6) |
| `A59-grass-coverage` | PENDING | SKIP-replaced (world-ground): subject deleted with the old landform (plan §6) |
| `V44-biomes` | PENDING | SKIP-replaced (world-ground): subject deleted with the old landform (plan §6) |

### 4.2 The global green list (items that exist at W1)

| row | result | measured |
|---|---|---|
| `A1-boot-clean` | PASS | state=playing |
| `A9-perf-budget` | not run | not run in the lane batch (quiet-box term, R45/R58 b) |
| `A20b-no-system-errors` | PASS | {"systemErrors":[],"hookErrors":0,"framesAdvanced":368,"quality":"high","stepMode":"substep"} |
| `A21-real-draw-calls` | FAIL | draws 77 / 120 / 110 (bar 350), tris 2.33 / 3.10 / 3.11 M (bar 6.5 M) PASS; median GPU vista 21.19, herd 20.10, staged fight 19.74 ms (bar 14) FAIL, p95 frame 18.4 / 30.8 / 18.1 ms; load 2.99, 0 other Chrome (the box was quiet enough for the row to grade it) |
| `A90-memory-stability` | PASS | {"kills":30,"workload":{"kills":30,"respawned":30,"respawnFailed":0,"kinds":{"tiller":30},"sources":{"role":30}},"before":{"heap":267670462, |
| `A90-memory-stability-expansion` | PASS | {"kills":30,"workload":{"kills":30,"respawned":30,"respawnFailed":0,"kinds":{"tiller":30},"sources":{"role":30}},"before":{"total":2653,"mac |
| `A90b-memory-attribution` | PASS | {"kills":30,"selfTest":{"ok":true,"texturesSeen":1,"geometriesSeen":1,"materialsSeen":1,"objectsSeen":1,"texturesDisposedSeen":1,"uploadCoun |
| `A90-rig-reclaim` | PASS | {"cycles":30,"roster":["tiller"],"budget":{"geometries":40,"textures":30,"perLiveGeo":1,"perLiveTex":1},"afterCycles":{"geoGrowth":0,"texGro |
| `A90-abs` | PASS | post-GC heap 76.98 MB (≤ 450), GPU process 1005 MB (≤ 1500), instrument PASS |
| `A-alloc-rate` | FAIL | instrument PASS; owner rows: terrain 3.8 KB/frame against its W0b baseline 601 (×0.006), world-ground 0.24 against 37.3 (×0.006); the run FAILs on other owners' baseline guards (engine.js 5.1 MB/s, hud.js, carry.js, playerAnimator.js); world-ground functions over 4 KB/s: getHeight 250, gridHeight 17, getNormal 12.5, slopeFast 11.3 KB/s (§2.10, §6) |
| `A-vram-ledger` | PASS | textures 104.4 MB (≤ 160), render targets 127.3 MB (≤ 170), geometry 23.2 MB (≤ 120), total 254.8 MB (≤ 450) |
| `A-ID-ip-assets-gone` | PASS | {"pass":true,"glbs":24,"filesThroughRows":225,"ipHits":[],"rowIpUnflagged":[],"noProvenance":[],"unreadable":[],"scheduledExceptions":[],"st |
| `A-licence-manifest` | PASS | {"summary":{"files-matched":"PASS","row-schema":"PASS","third-party":"PASS","legacy-source":"PASS","code-rows":"PASS","licence-texts":"PASS" |
| `A-assets-tracked` | PASS | {"referenced":229,"ignoredRefs":[],"missing":[],"deletedR30":["public/models/behemoth.glb","public/models/sawtooth.glb","public/models/thund |
| `A-no-horizon-terms-player` | PASS | PASS 1502 <= 1508 (W0b ratchet, plan §9 reading) |
| `A-no-horizon-terms-code` | PASS | {"filesScanned":263,"distinctPairs":831,"occurrences":10893,"total":1368,"ratchetTotal":1371,"byKind":{"engine":402,"guard":181,"scheduled": |
| `A-reach-all-sites` | PASS | 25 sites, bad 0, routes off 0, nav 19.2 ms (N 493) |
| `A-port-guard` | PENDING | refusals, cache, monitor PASS; PENDING because this is not a full --lane run |
| `A-carried-suite` | FAIL | refused by design inside a run that executes carried rows; graded by the orchestrator in its own invocation (R48 d, R53 b): PENDING-orchestrator |
| `V38-title` | NEEDS-JUDGE | filmed: the title frame is the Pans under the calima stand-in (brand's row; my reading §5) |

<!-- RUNK -->


## 5. My reading of the frames (advisory; the R29 judge grades)

Filmed at 1600×900 and read frame by frame against `reference/r5/gates-perf/salt-pans.jpg` and
`reference/r5/brand/salinas-de-janubio.jpg` (Janubio), the bible's El Golfo description and black-sand surf.

- **What now reads.** From the rim the salt grid reads at once: big pale evaporating ponds by the sea,
  fine crystalliser strips round the town, rust and pink cells among the white, dark dyke lines, the cones on
  the raking floor. The beach is black, the surf breaks in layered white lines with a turquoise wave face,
  and the backwash is a dark mirror with a thin lacy lip. The tuff ring is red, bedded, gullied and scored,
  with pale talus at its foot. The sister stratovolcano stands on the sea line NW (Janubio composition). Up
  close (V32) a pink cell is cracked wet pan silt mirroring the sky, the dyke is stacked angular basalt, the
  crust has grit and drag. The title frame is the Pans (salt grid, the Glass, the ring, the sister isle) in
  the calima stand-in: no Round-4 spire or prop anywhere.
- **What still looks weak next to the reference (honest).** (1) Every 07:00 / calima frame is the world-sky
  stand-in: a pink haze where the reference has a hard blue Atlantic, and a tonal step where the fog meets
  the sky. (2) The vista has no landmarks (Organ Shelf columns, the Ring, the wind pumps are world-props').
  (3) The Glass is a flat emerald sheet: it has a depth gradient, a bed and wind slicks, but no reflection of
  the crater wall, which is what makes El Golfo's lagoon. (4) The near white crust is still smoother and
  brighter than Janubio's trampled crust. (5) The sister isle is a soft grey cone with little shading.
  (6) Surf from the beach: at grazing angles the thin backwash still throws soft white sky blots.

## 6. Honest gaps (what is not done or not passing)

- **GPU at the Pans vista.** `A-gpu-tier-pans` 19.5–20.2 ms median (bar 13) and `A21`'s GPU term 19.7–21.2 ms
  (bar 14) on a box at load 2.6–3.0 with no other gate Chrome. Hiding the ground, water and flora together
  leaves 7.6 ms (post chain, sky, shadows); the island's ground + flora + sea add 10–12 ms and do not add up
  when hidden one at a time (shadow and AO passes share them). This lane's levers (§2.9) took the flora from
  ≈ 4.6 to ≈ 2.3 ms; the rest needs the §11 engine follow-up (per-pass costs of the cascades, GTAO and the
  depth/normal prepass on 0.9 M ground triangles at 1.94 m) or a ground mesh LOD, which is a W2 item here.
  These terms are graded on the orchestrator's quiet box (R58 b); I expect them to fail there too.
- **`A-alloc-rate` per-function bars (R48 c).** The terrain owner is 0.6 % of its W0b baseline, but
  `getHeight` still shows ≈ 190–250 KB/s against the 4 KB/s per-function bar: the double it returns is boxed
  for every caller that is not inlined (the callers are the kept movement, gait, collision and animator code).
  `heightInto(x, z, out, i)` is published for those callers; until they use it this row fails on my function.
- **`A108-ao-periodicity-pans`.** The re-hosted crops are content-limited on the real Pans (haze-flat far
  ground, periodic salt grid, dune crests); a survey of crops on the Holds' scored slopes got one far crop under
  the bar (0.148 / 0.082) and the rest content-limited. The instrument is engine-gpu's; its re-grade on the real
  Pans needs a crop survey on this island's content (R49), not done.
- **`A-anti-tile` salt25** (0.24, bar 0.15) and **`A-skirt-masked`** (0.098, bar 0.08) failed in `run-j`; both
  are fixed at the cause (§2.1 the field floor, §2.3 the map edge) and re-run in `run-k` (§4.3).
- **The look against the reference**, as §5 lists: the stand-in weather, no landmarks, the Glass without the
  crater's reflection, the near crust smoother than Janubio's, the soft grey sister isle.
- **`public/models/r5-poc/`** stays (not this lane's path, §7).

## 7. For other lanes and the orchestrator

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

