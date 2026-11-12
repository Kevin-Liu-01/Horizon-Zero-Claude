# ROUND 5 — lane world-props, W1 report

Lane world-props (port 5260). Plan §2 W1 row: the Sounding Ring, the Organ Shelf clusters, the wind pumps,
the red crater, all six trig pillars and twelve benchmark pads, `ctx.props.gatePlaces`, the static
scripted Gauge; R66 (m) adds six offshore stacks, a sea arch and one Roque plug; R48 (c) the `fauna.js`
allocation bar. The Round-4 props are removed from the island (plan §6).

(Sections 1–8 are filled in below; gate numbers are from the runs named in §5.)

## 0. How this was built and graded (read first)

**The island is world-ground's, and it is not on main yet.** This tree (branch `r5/w1-world-props`) still
carries the W0 stub `src/world/island/sites.js` (no `TRIG`, no `SALT_FIELD`, `PLAY_RADIUS` 330) and the
Round-4 terrain. Every W1 deliverable here stands on world-ground's W1 island (bible §8.4 coordinates at
1024 m, the Pans at r 300-480). So all development and every gate run used a **scratch overlay**: a
symlink mirror of this tree in which only world-ground's own files — `src/world/{terrain,vegetation,water}.js`,
`src/world/island/**`, `public/textures/ground/**` — are replaced by a snapshot of world-ground's tree at
its checkpoint **0083ab8** (`git archive`, read-only). Vite ran from that overlay on port 5260
(`nice -n 10 npx vite --port 5260 --strictPort --config <scratch>/overlay/vite.overlay.mjs`,
`resolve.preserveSymlinks`), so every module identity is this tree's; nothing of world-ground's was
copied into this tree. On this tree alone (stub island) the code boots without errors (the layout falls
back to the bible table) but the props stand where the stub map has sea: **merge world-props after
world-ground**, then re-run this block on main.

## 1. What was built (W1)

| item | where | what it is |
|---|---|---|
| **Sounding Ring** | `tools/build/landmarks/recipes/sounding-ring.mjs` (moved from `tools/build/landmarks/gen-sounding-ring.mjs` under the §1.2 grant) → `public/models/landmarks/sounding-ring.glb` (231 KB, 20.8 k tris, 2 draws) | Rebuilt to W-05: outer ring **34 m** across (2.0 × 1.6 m glazed section on bronze flanges, rivets, oxblood code bars), standing **20° off vertical** (was 68° and sunk 3 m), broken through its upper-left quadrant with five fallen panels and shards in the shingle; the **22 m** inner gimbal ring hung on two trunnions and turned 52°; the dim lantern core on a graduated spindle (calm-white emissive); three cable stays to basalt anchors; a three-course dressed basalt cradle. Face turned to bearing 100 (T1's deck and the black-sand beach see it open); both faces glazed (bone / pale celadon), graphite inside. |
| **Organ Shelf** | `src/world/sites/basalt.js` (generated at boot, 1 merged draw, ≈ 30 k tris) | Eleven hex-column clusters (`layout.js ORGAN`) along the Shelf's flow front and table: 341 columns 0.6–1.4 m across, hex-packed with a dark joint, the tallest at each cluster's back stepping down to its face in 0.55 m-quantised risers (2–14 m), cross-joints every 1.9–3.7 m, chamfered and tilted tops, salt/lichen treads, a wet foot. One box collider per column, kind `landmark` (the player stands on them: natural stairs). |
| **wind pumps** | `recipes/wind-pump.mjs` → `wind-pump.glb` (70 KB) | Three multi-blade pumps (`layout.js PUMPS`, salt-field frame): lime-washed cistern + trough + spout, 9.6 m four-leg lattice tower with girts, X bracing, ladder, railed deck, gear head, pump rod, **6.0 m 18-blade rotor** on two rims, tail vane. Rotors turn with `environment.wind` (allocation-free instance update). 2 draws (tower, rotor), colliders: cistern + trough boxes, four leg capsules. |
| **red crater** | `src/world/sites/basalt.js` | world-ground's tuff ring is the landform; world-props adds its rock: **150 red-tuff blocks** (instanced, bedded, W-03 tuff palette) on the talus apron and benches of the high wall, and **6 bedded buttress outcrops** at the cliff foot (merged). Registered as the `red-crater` landmark (record at the high wall). |
| **trig pillars ×6** | `recipes/survey-marks.mjs` → `survey-marks.glb` node `trig-pillar`; `src/world/sites/survey.js` | At `sites.js TRIG` exactly (0.000 m error). Lime-washed octagonal drum 3.0 m × 3.8 m, coped, one survey-vermilion band (flat ink), three 1 m stone steps toward the flattest ground, the 1 m observing pillar with the bronze forced-centring plate (= `TRIG_TOP` 4 m), a 3.6 m signal mast with crossed vermilion/white vanes. Box/capsule colliders (kind `landmark`, so the step tops are floors). Interactables SIGHT (deck: `trig-sighted { id, sighted }`, the pillars its rays reach) and READ PLATE. |
| **benchmarks ×12** | node `benchmark`; `survey.js` | Two per biome (`layout.js BENCHMARKS`, a region each), each set on the flattest ground within its search radius, 0.30 m proud with a 1.8 m skirt; bronze bench disc with the broad arrow, tripod sockets, a banded staff post. Interactables RE-SURVEY (hold 15 s: `benchmark-resurveyed { id, region }` + `ctx.datum.setTrue(region)` when the W2 datum service exists) and READ MARK. |
| **static scripted Gauge** | `recipes/gauge-static.mjs` → `gauge-static.glb` (64 KB); `src/world/sites/gauge.js` | The bible's lighthouse on stilts at Sluice 3 (the brine cell on the field's seaward side): float drum with verdigris waterline band and oxblood band, four long stilts with knee seals and pads, ballast tanks, brine pump, graduated 0–6 m staff with sliding float ring, bronze sluice + leaf, one calm lamp. The first time Brea comes within 26 m it opens Sluice 3 (leaf swings up over 1.2 s, brine jet, float ring to the 0.4 m mark) and emits `gauge-sluice { id, sluice: 3, tide: 0.4, open: true }`. 2 draws (merged hull with a `part` attribute animated in the vertex shader, same patch on the shadow depth material; lamp). |
| **sea stacks ×6 + sea arch** | `recipes/sea-stacks.mjs` → `sea-stacks.glb` nodes `stack-a/b/c`, `sea-arch` | W-04: stratified stacks of 1.5–6 m beds on ONE lobed plan per stack (buttresses run top to bottom), a wave-cut notch, windward fins, a caprock on stack-a, a ragged foam collar; mostly basalt greys with the odd tuff/ochre bed. Six instances 20–48 m tall (height CV 0.26) at 540–860 m on bearings 212–292 plus the 31 m arch at 700 m on 236 — all beyond `PLAY_RADIUS + 20` with no colliders; two of them sit in the 280–295° glitter column seen from T1. 4 draws, 0 casters. `ctx.props.seaStacks = [{x, z, r}]` (7 feet) is published for world-ground's sea-shader surf. |
| **Roque plug + needle** | same GLB, nodes `roque-plug`, `roque-needle`; merged at runtime (1 draw, 1 caster) | R66 m: a **58 m** fluted volcanic plug (lobed columnar-jointed drums, buttress shoulders, a broken crown of column stubs, talus) and its **28 m** needle, on the caldera rim's south-west shoulder at (−28, 1) / (−40, −14): chosen by an offline search on world-ground's bake as the rim ground the Pans see whole (≈ 55 m clear above the rim line from the beach), ≥ 17 m off every sight ray. Mesh collider. |
| **`ctx.props.gatePlaces`** | `src/world/sites/gatePlaces.js` | The §3.2 contract (§3 below). |
| Round-4 props removed | `src/world/props.js` rewritten; `src/world/props/{tallneck,megastructures,rockworks,places,clearings}.js` deleted | The river rocks, driftwood, deadfall, moss boulders, ruins, watchtower and lookout, the megastructures, the Tallneck, the rockworks and the six Round-4 places are gone (plan §6 W1-exit row). world-ground's `_retireRound4Props` now finds no `megaMeshes` and is a no-op, as its comment intends. Kept: `props/activities.js` (Round-4 records/caches, migrated by progression W3), `props/kit.js`, `fauna.js`, and settlements' `props/{settlement,npcs}.js`. |
| **fauna.js (R48 c)** | `src/world/fauna.js` | The per-frame body split into small monomorphic `_step` / `_stepDead`; every per-frame record field exists from creation with its final representation (`threatD/X/Z`, `respawn`); `Math.hypot` out of the frame path; the pools' `Object.keys` array cached; the Round-4 `300 * 300` radial literal replaced by `PLAY_RADIUS + EXTENT.gatherRim`. Graded by `A-alloc-rate` (§5). |

## 2. Files

New: `src/world/sites/{layout,landmarks,basalt,survey,gauge,gatePlaces}.js`,
`tools/build/landmarks/recipes/{sounding-ring,wind-pump,survey-marks,sea-stacks,gauge-static}.mjs`,
`tools/build/landmarks/recipes/lib/rock.mjs`, `public/models/landmarks/*.glb` (5 files, 0.83 MB),
`tools/gates.r5.world-props.mjs`, `reference/r5/world-props/MANIFEST.md`, this report.
Changed: `src/world/props.js` (rewritten), `src/world/fauna.js`, `public/LICENSES.json` (one row,
`landmarks-world-props`, through `tools/licences/add.mjs`). Moved (grant): `tools/build/landmarks/gen-sounding-ring.mjs`
→ `recipes/sounding-ring.mjs`. Deleted: `src/world/props/{tallneck,megastructures,rockworks,places,clearings}.js`.
All five recipes are deterministic (`npm run build:assets -- --only world-props`: 5 recipes, ≈ 0.5 s, 0 failed).

## 3. Contracts published (exact signatures)

`ctx.props` (an instance of `Props`, `src/world/props.js`):

```js
ctx.props.gatePlaces          // object, built synchronously in the constructor (the §3.2 stub and the real table are the same object)
ctx.props.ready               // Promise<Props>: every GLB landmark is in the scene
ctx.props.loaded              // boolean
ctx.props.landmarks           // getter -> [{ id, name, kind: 'landmark'|'trig'|'instrument', x, z, y?, height, object?, instanceId?, offshore?, map? }]
ctx.props.places              // [{ id, name, kind: 'trig'|'benchmark'|'gauge'|'landmark', x, z, radius, position: Vector3, interactables: [entry], done }]
ctx.props.sites()             // -> [...activities.sites(), { kind, id, x, z, name, done, place: true }]  (landmarks are their own list)
ctx.props.placeAt(x, z)       // -> place | null   (allocation-free)
ctx.props.keepouts            // [{ id, x, z, hard, soft, grass }]  (19: 6 pillars, 12 pads, the Ring's cradle)
ctx.props.seaStacks           // [{ x, z, r }] after ready (7 stack/arch feet; for world-ground's sea-shader surf)
ctx.props.survey              // { pillars: [{ id, name, x, z, y, top, deck, yaw, stepsDir, sighted }], benchmarks: [{ id, name, region, biome, x, z, y, top, resurveyed }],
                              //   sightedFrom(id) -> [ids], rayClear(A, B) -> boolean }
ctx.props.gauge               // { id, x, z, y, state: 'closed'|'opening'|'open', sluice: 3, tide: 0.4, open() -> boolean,
                              //   readout() -> { kind: 'GAUGE', sluice: 3, tide: 0.4, text: 'GAUGE · SLUICE 3 · TIDE 0.4 m' } }
ctx.props.organ               // { mesh, columns: [{ x, z, r, y0, y1, rot, cluster }], clusters, clusterRecs }
ctx.props.colliderCount, registerColliders(), clearingReport, dispose()
ctx.props.ledgeNear()         // -> null (climbing reads colliders)
```

Events: `trig-sighted {id, name, sighted}`, `trig-plate {id, name, top}`, `benchmark-resurveyed {id, region}`,
`benchmark-read {id, region, y}`, `gauge-sluice {id, sluice, tide, open, already?}`, `gauge-read {id, kind, sluice, tide, text}`,
`ring-read {id}`, `ring-sounded {id}`.

`gatePlaces` keys: every row of world-ground's `sites.js GROUND` as measured on its bake, plus `rest`,
`vistas.{pans, pansRise, holds, malpais, cloudline, flank, caldera}` (each `{x, z, y, eye, yaw, bearing, pitch, fov, look:{x,y,z}}`),
`landmarks.{saltrow, ninewalls, calibrationYard}` (A-landmark-bearing's stations), `kilnYardFight`, `midgroundVista`
(V34: (−296, 326), `yawOffsetDeg`), `basaltColumn` (A24), `trig.{T1..T6}`, `ring`, `gauge`, and
`look.{field, vista, aim, close, dusk, pansInland, pansSunset, meadow, beach, title, saltrowDusk, craterWall, steepFace, reed, brazier}`
(each `{x, z, y, eye, yaw, bearing, pitch, fov, look, hour, weather, note, pose?, stub?}`; `stub: true` on the eleven not yet
filmed and graded by a world-props row). Diagnostics: `__source: 'world-props'`, `__island`, `__stacks`, `__roques`, `__field`.
