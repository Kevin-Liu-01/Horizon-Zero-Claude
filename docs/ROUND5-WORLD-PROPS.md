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

## 6. What another lane or the orchestrator must do

- **Orchestrator — merge order.** Merge world-ground before world-props; then re-run `--lane world-props` on main.
  On this tree alone the props stand on the W0 stub map (bible coordinates in its sea) and the place rows
  report against the wrong map.
- **world-ground — static kinds and keepouts.** `vegetation._applyKeepouts` thins the flora only. Its static kinds
  (`rocks-*`, `pan-dykes`) ignore `ctx.props.keepouts`, so world-ground's basalt pavement stood inside T1's
  footprint (53 column stubs, 54 colliders) and blocked the climb. Until world-ground thins its static kinds
  itself, `Props._clearScatter()` zeroes those instances inside a keepout's hard radius once and hands their
  colliders back (the Round-4 clearings rule; report in `ctx.props.clearingReport`). When world-ground does it,
  the shim finds nothing and is a no-op; delete it then.
- **world-ground — the Ring's rise (R66 m).** `sites.js` `sounding-ring` height 0.5 → 6 and the 5–6 m grassed
  shingle rise are world-ground's; the Ring is set on the ground under its cradle at boot, so it rides up with
  the rise when that lands. Until then it stands on the storm-beach shingle at ≈ 0.3 m.
- **world-ground — surf at the stack feet (W-04).** `ctx.props.seaStacks` (7 `{x, z, r}`) is published for the
  sea shader's 8-entry circle-SDF surf. The stacks carry their own wave-washed skirt and a pale collar, but
  A-look-sea-skyline's "foam L* ≥ 75 at every visible foot" clause is the sea shader's to light.
- **world-sky — the glitter column (W-09)** for A-look-sea-skyline's "darker than the column by 25 L*" clause;
  two stacks are placed in the 280–295° column seen from T1.
- **shell-ui** — `ctx.props.gauge.readout()` for the Sighting card ("GAUGE · SLUICE 3 · TIDE 0.4 m");
  `ctx.props.landmarks` now carries 11 Organ Shelf cluster records with `map: false` (silhouettes for the gates,
  not map icons): the map should skip `map === false`.
- **progression (W3)** — the twelve benchmarks and their regions (`ctx.props.survey.benchmarks`), the
  `benchmark-resurveyed` and `trig-sighted` events (the triangle opens on the map), fast travel from a benchmark.
- **settlements (W2)** — Saltrow's three bible pumps are these three (`ctx.props.landmarkSet.records`, ids `pump-*`);
  settlements should not build a second set.
- **instruments-b (W2)** — the living Gauge replaces the static one: `ctx.props.gauge.dispose()` takes it out
  (and its colliders are unregistered by `Props.dispose`, or by unregistering `ref === gauge.body`).
- **pipeline row** — `landmark-sounding-ring-poc` in `LICENSES.json` still names
  `tools/build/landmarks/gen-sounding-ring.mjs` as its `source_url`; that generator now lives at
  `tools/build/landmarks/recipes/sounding-ring.mjs` and writes `public/models/landmarks/sounding-ring.glb`.
  `public/models/r5-poc/sounding-ring.glb` is no longer rebuilt by anything (world-ground deletes the `?poc=biome`
  closure at its W1 exit; pipeline drops the row then).
- **look-post** — `gatePlaces.look.*` is published (15 places); eleven are `stub: true` until filmed.

## 4. Gates — lane block (W1), port 5260, `nice -n 10`, one Chrome under the slot protocol

`tools/gates.r5.world-props.mjs` (18 rows; `node tools/gates.mjs --port 5260 --lane world-props` selects exactly them).
It shadows five carried rows by id (A98-sites, A98b-clearings, A61-colliders-registered, A24-player-blocked,
V34-midground), restated on the island at the plan's W1 bars. Numbers are from run **r5** (Nov 12 23:18–23:30 UTC,
quiet box: 1-min load 2.5, 0 other gate Chromes) on the overlay of §0; the visual rows were re-filmed in r6.

| row | result | measured |
|---|---|---|
| A-gate-places-published | **PASS** | all 11 required keys + 7 vistas (one per biome + pansRise) + 3 landmark stations + 15 look places; 34 rows on valid terrain (h > −0.05, wading ≤ 1.2 m), 0 bad |
| A98-sites | **PASS** | 20 places (6 trig, 12 benchmarks, the Gauge, the Ring), each ≥ 2 interactables; 40/40 fired entries raised their event; pure landmarks named (pumps, stacks, arch, Roques, Organ clusters, crater) |
| A-trig-pillars | **PASS** | 6/6 at sites.js ±0.000 m (records and instance matrices); 10/10 sight rays clear of terrain (min clearance 2.35 m, T3–T6) and of every collider; deck reached by synthesized input in 2.02–2.72 s (bar ≤ 3), 3 mantles each, still on the deck 0.6 s later |
| A-landmark-bearing | **PASS** | from Saltrow, all 8 sectors: N trig T5 14.1 px @ 416 m · NE Roque plug 102.7 px @ 330 m · E trig T2 15.3 px @ 344 m · SE Organ cluster 7 57.8 px @ 156 m · S stack-4 133 px @ 284 m · SW stack-1 77.6 px @ 189 m · W stack-3 114 px @ 362 m · NW red crater 178 px @ 189 m (occlusion-tested; N and E are the thinnest, a 7.4 m pillar + mast on a crest) |
| A61-colliders-registered | **PASS** | 2,079 colliders (bar ≥ 600); world-props 176/176 collidable instances covered (100 %); offshore stacks 0 colliders |
| A24-player-blocked | **PASS** | sprint (peak 6.9 m/s) into an 11 m Organ column: min distance to axis 0.905 m (bar ≥ 0.45), 0.20 m/s at contact (bar < 1), the contact is that column |
| A98b-clearings | **PASS** | 19 keepouts; 0 scatter instances drawn and 0 world-ground rock colliders inside any hard radius (9,448 scanned); 0 blocked capsule sweeps; consumer `vegetation._applyKeepouts` + this lane's static-scatter shim (§6) |
| A-place-draws | **PASS** | per landmark ≤ 3 main + ≤ 2 casters (Ring 2/1, pumps 2/0–1, skyline 4 kinds/0, Roques 1/0–1, trig 1, benchmarks 1, Organ 1, crater 2, Gauge 3 incl. the jet FX/1); worst frame world-props share 17 draws (look.pansSunset; bar ≤ 45) |
| A-site-dispose | **PASS** | 3 load/unload cycles of the landmark set, survey marks, Gauge and basalt: geometries 88 → 74, textures 124 → 119, colliders 2,308 → 2,079 every cycle (= baseline) |
| V34-midground | **PASS** | station (−296, 326): N pump-reservoir 74 px + red crater 146 px · E Organ clusters 5–9 (12–49 px) · S stack-4 207 px · W sea arch 94 px |
| A-look-landmark-scale | **PASS** | Ring 148 px from look.pansInland, 164 px from T1's deck; 88 % of its box is background; 81 % of its silhouette above the sea line; tilt 20°; 34.0 m / 22.0 m; 27 distinct Organ column tops from 150 m; rotors 85 / 67 / 43 px from the field centre; 140/40/40 met on the 4 filmed look frames |
| A-look-sea-skyline | **PENDING** | own clauses pass: 5 stacks ≥ 24 px, height CV 0.264, nearest 540 m (bar ≥ 510), 0 colliders, 4 draws 0 casters, `seaStacks` published. Dependent: no stack measurably darker than a glitter column (world-sky W-09 not merged) and foot L* 22–58 (bar ≥ 75; world-ground's sea-shader surf) |
| A-look-spires | **PENDING** | own clauses pass at 18:45 and 07:00: plug 107 px, needle 50 px, both above the rim line (tops at y 111 / 169 vs rim 210 / 215), 3.05:1 / 3.04:1; 8.6 k tris, 1 draw + 1 caster. The +0.45 ms clause is look-post's quiet-box A/B |
| A-place-names | **PASS** (runner) | 107 place strings and ids: 0 named lint hits, 0 /spire/i |
| V-landmark-sheet, V-look-ring, V-look-sea-skyline, V-look-spires | NEEDS-JUDGE | filmed; my reading is in §5 |

**Global green list items run in this tree (same r5 run):** A1-boot-clean PASS · A20b-no-system-errors PASS ·
A9-perf-budget PASS (88 draws, 59.9 fps median, p95 18 ms) · A90-memory-stability PASS · A90b-memory-attribution
PASS · A-vram-ledger PASS · A-ID-ip-assets-gone PASS (29 GLBs) · A-licence-manifest PENDING (files-matched PASS;
the pending clause is pre-existing third-party SHA rows) · A-assets-tracked PASS (runner) ·
A-no-horizon-terms-code PASS (1,334 ≤ 1,371, 0 over cap; runner) ·
**A-no-horizon-terms-player FAIL** — its count passes (1,481 ≤ 1,508) but brand's `CONTENT_MODULES` list in
`tools/gates.r5.brand.mjs` dynamic-imports `/src/world/props/places.js` and `/src/world/props/megastructures.js`,
which plan §6 deletes at this lane's exit; the two 404s are console errors and the runner fails the row. Fix: drop the
two paths from that list (brand's file; an orchestrator change) ·
**A-alloc-rate FAIL (not this lane)** — the baseline-guard offenders are playerAnimator (1.32×), frozen control,
frozen UI engines, audio, progression, instruments-core and the frame loop. This lane's two rows: **fauna 10.27 KB/frame
= 0.59× its W0b baseline (17.30)**, **world-props 0.48 KB/frame = 0.13× (3.58)**. Per function (R67: reported, graded
at the W1-exit global run after the gap-F investigation): fauna `_step` 441 KB/s, `_standable` 189, `update` 84,
`hitscan` 29, `_writeInstance` 5, `angleTo` 5; world-props `landmarks.update` 14, `gauge.update` 7 — all still over the
absolute 4 KB/s bar ·
**A21-real-draw-calls FAIL (not this lane)** — draws 90 / 135 / 120 and triangles pass; median GPU 19.7 / 17.7 / 20.7 ms
vs 14 at tier high, the same as world-ground's report before these props (19.7–21.2): the W1-exit engine/world item.
Not run here: A90-abs, A90-rig-reclaim, A90-memory-stability-expansion, A-port-guard, A-carried-suite (orchestrator's
sealed run), A-reach-all-sites (world-ground's row, not in this tree).
