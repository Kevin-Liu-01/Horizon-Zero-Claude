# CALIMA — ROUND 5 · lane `world-sky` (W1)

Port 5261 (judge 5291). Tree `~/.calima-r5/trees/world-sky`, branch `r5/w1-world-sky`.
Owns `src/world/environment.js` (§1.2: full, system kept, values replaced), `tools/build/recipes/sky/**`,
`public/textures/sky/**`, `tools/gates.r5.world-sky.mjs`, this report. W2 extension (R66 i) and W4 per-biome
tuning are later rounds.

The previous builder of this lane left no lane work (one WIP checkpoint, 538e0db, touched only
`docs/ROUND5-PLAN.md`); everything below was built in this run (Nov 12).

## 1. What was built

`src/world/environment.js` is rewritten on the Round-4 `world-light` skeleton (cascades, fog chunk patch,
material registry, grass-caster policy, rest hook, rain, birds, shafts are kept). New or replaced:

| item | what | where |
|---|---|---|
| **Hour keys** (bible §2.4 as amended by R66 k = LOOK L-03) | 16 keyed rows: 05:30, 07:00, 12:00, 18:45, 19:45, 23:00 from the bible, 09:30 / 16:30 / 17:45 / 19:20 from L-03, the 05:24 and 19:54 hand-over troughs (sunI 0.10), night rows. Each row: sun colour + intensity, hemisphere (warm ground bounce only, 0.12–0.14), sky-IBL intensity (0.30–0.45 by day, 0.12 at night), sky top / mid / low band, fog low / high / sun, cloud-sea colour, aerial density, valley-mist density, EV offset (noon 0, 16:30 +0.10, 17:45 +0.15, 18:45 +0.25, 19:20 +0.40, 19:45 +0.70, night +1.30) | `KEYS` |
| **Sun path** (L-11) | bearing 70 + f × 220°, noon in the south at 12:45 (Orchil is at 28° N), elevation 50·sin(πf). Was a northern arc. | `Environment.direction` |
| **Golden-weighted clock** (L-11, Kevin's Q1) | `env.clock = 'golden'` (default) or `'even'`: rate ×2.5 below −4°, ×0.5 at 2–22°, ×1 otherwise, blended over 2°, normalised so the day stays 1800 s. Simulated: 32.6 % of real time golden, 18.2 % night. | `clockRate`, `goldenRate`, `GOLDEN_NORM` |
| **Start hours** | a New Game boots at 07:00; `?shot` (gates, look places) at 17:45; `?time=` and `?clock=even` honoured | `Environment.HOURS` |
| **Weather** (bible §2.3) | `trade`, `calima`, `fogbank`, `squall`; Round-4 names alias (`clear`→trade, `rain`/`storm`→squall); `overcast` kept as a hidden legacy record because the orchestrator's kind-block beam row stages it. Fade 0 snaps. | `WEATHER`, `setWeather` |
| **Calima** (L-14) | fog Calima Ochre #C98B4E ×4, sky flattened to #B9875C / #D2A274, the cloud field hidden, a soft 1° coral disc solved on the CPU so it *shows* as #F2A27E through the output chain (engine.look.invert when look-post publishes it, else a CPU mirror of the ACES grade by full-Jacobian Newton), shadow strength 0.45, extinction (1.0, 0.97, 0.90), HG g 0.80, EV +0.15, bloom ×1.25 with a lower threshold, cloud shadows off, 600 ochre dust motes drifting downwind | `_applyTime`, `_updateDisc`, sky shader |
| **perceptionScale** | trade 1.0, calima 0.5, fogbank 0.5 inside the bank (camera below 140–170 m), squall 0.8; night 0.7; the smaller applies; cross-fades with the weather | `perceptionScale` getter |
| **Per-biome fog and exposure** (bible §9.3), all six biomes | weights from `terrain.biomeWeights` at the camera (CALIMA names; the Round-4 names map meadow→pans, marsh→flank, forest→cloudline, ash→malpais, scree→holds, snow→caldera until world-ground's island lands). Fog colour as a tint relative to the Pans' fog (so the hour keys hold exactly in the Pans), density × (Cloudline ×3 below 150 m only), EV, bloom threshold. Fog eases over 0.6 s, EV is rate-limited to ≤ 0.04 per update, a > 50 m jump is a cut and snaps. | `BIOMES`, `_mixAt`, `gradeAt`, `_updateBiome` |
| **Exposure** | `renderer.toneMappingExposure = base × 2^EV`, EV = hour + biome + weather; base is whatever the engine set at boot (0.94 today; look-post's AgX base when it lands) | `exposureEV`, `exposureBase` |
| **Aerial perspective v2** (L-05) | the fog chunk rewritten: main exponential height layer (H 140 m) + valley-mist layer (H 14 m over the floor, broken by a 120 m noise drifting downwind) + the cloud-sea slab, per-channel extinction (trade (0.82, 1.00, 1.32)), two normalised Henyey-Greenstein lobes (g 0.72 × 0.9, g 0.20 × 0.25) replacing `pow(sd, 7)`, opacity capped at 0.92. CPU mirror `fogParams.transmittance(dist, camY, fragY)` and `fogTransmittance(a, b)` | `patchShaderChunks`, `_buildFogContract` |
| **Cloud sea** (bible §2.3, §9.4) | optical depth of the ray's length inside a 105–150 m slab on the windward (NE, bearing 045) half of the island, broken at 260 m, coloured by the hour's cloud-sea key (#F6D2B0 at 07:00), thickest at dawn. No planes, 0 extra draws. | fog chunk, `SEA_CLOUD` |
| **Sky** (L-03, L-06, L-10, bible §9.4) | drawn last (renderOrder 1000, z = w, LEQUAL); a 256² baked tiling noise (four 5-octave fbm fields, built at boot in ≈ 10 ms, no file) replaces the six procedural fbm calls; trade stratocumulus as four slices of one noise field from a 1000 m flat base to 1600 m, drifting SW with the wind and hazed with distance; L-06 sun: 0.5° disc at ×40 HDR with limb darkening 0.6, corona lobes pow 900 × 1.6 and pow 64 × 0.35, a haze glow growing with fog density, occluded by cloud; at and below the sea line the dome hands over to exactly the fog's in-scatter (same terms), so the far sea meets the sky with no tonal step (world-ground's §7 item 1) | `_buildSky` |
| **Sky-captured IBL** (L-04) | the dome alone in its own scene, rendered by six cube cameras into a HalfFloat cube (128², 64² on low, 256² on ultra), one face per frame, PMREM into one pre-allocated target on the seventh; rebakes every 0.1 game hours or on a 0.05 weather move; synchronous under `?shot` on every `setTime`/`setWeather`. Published as `scene.environment` named `CAL.skyIBL`. RoomEnvironment and its 256 PMREM are gone. Registered in the engine's RT ledger as `env:skyCube`, `env:pmrem`, `env:pmremPingPong` | `_buildIBL`, `_bakeIBL`, `_stepIBL` |
| **Reflection probe** (W-08, the world-sky half) | `skyCube` is the probe; `reflect.add(obj)` puts a mesh on layer 6, after which the cube re-centres on the camera on a 25 m move and draws those meshes over the dome (shadow maps not re-rendered). Nothing is on the layer yet: world-ground decides what goes in (≤ 10 draws) and samples it | `reflect` |
| **Far ridges out** (L-15) | the three Round-4 snow-capped ridge rings are deleted (`environment.ridges = null`); the horizon is the sea and world-ground's sister isles | — |
| **RiverWater removed** | no import, no instance; `environment.water` is `ctx.water` (world-ground's IslandWater) or null | — |
| **Contracts** | `windAt`, `calSunCol`, `calSunRad`, `borrowLight`, F-1 fire rule, lamp-canon pooled lights (calm #F2EAD3 / wary #B5E61D / hostile #FF2D8C; the Round-4 cyan is gone) | §3 |
| **Ambient air** (P-09) | one Points draw: 170 pollen/salt glints (off at night and in calima), 600 calima dust motes in a 44 m box riding the wind, 240 ember slots (weight 0 until world-props' W3 emitters); alpha × (0.4 + 2.2·pow(view·sun, 4)) | `_buildMotes` |
| **dispose()** | removes and disposes every mesh, material, texture, render target, the PMREM generator, the shaft quads; unhooks `onAfterRender` and `scene.onBeforeRender`; unregisters the RT ledger rows | `dispose` |

No asset file is added (the noise is generated at boot), so no `public/LICENSES.json` row is needed.

## 2. Gates

(filled in from the runs below)

## 3. Published API (exact signatures)

```
environment.time                       number, 0–24 (get/set)
environment.setTime(h: number): number
environment.clock                      'golden' | 'even'
environment.clockRate(h?: number): number            game hours per real second
environment.dayLengthSeconds           1800
environment.timeFrozen                 boolean (true under ?shot)
environment.weather                    'trade' | 'calima' | 'fogbank' | 'squall' | 'overcast' (legacy)
environment.setWeather(name: string, fadeSeconds = 2.5): string   (0 snaps; aliases clear/rain/storm)
environment.weatherStates              ['trade', 'calima', 'fogbank', 'squall']
environment.states                     { [name]: weatherRecord }
environment.weatherParams              the cross-faded record (sunMul, densMul, calima, fogbank, perception, …)
environment.perceptionScale            number 0..1
environment.windAt(x: number, z: number, out?: {x, z, y?}): number   m/s; out gets the velocity
environment.wind                       { x, z, strength, gust }   (Round-4 foliage units, blowing toward 225)
environment.phase                      'night' | 'dawn' | 'day' | 'dusk'
environment.sunDir / moonDir / lightDir  THREE.Vector3 (toward the body)
environment.nightFactor                number 0..1
environment.biome / biomeMix           dominant id / { pans, holds, malpais, cloudline, flank, caldera }
environment.gradeAt(x, z, y = 0, out?): { biome, mix, fogTint: [r,g,b], dens, ev, bloom }
environment.biomeFogTint               THREE.Color (live, eased)
environment.exposureEV / exposureBase  number / number
environment.skyKeys                    { top, low, mid, fog }   live THREE.Color, pre-grade, linear
environment.fogParams                  { density, heightFalloff, heightRef, inscatterStrength, mist, cloudSea,
                                         ext, horizon, zenith, sun, sunDir, uniforms,
                                         transmittance(dist, camY = 4, fragY = camY): number, register(m) }
environment.fogTransmittance(a: {x,y,z}, b: {x,y,z}): number
environment.uniforms (= .u)            calFogA/B/C/D/E/G, calFogExt, calFogHorizon/Zenith/Sun, calCloudSeaCol,
                                       calSunDir, calCamPos, calViewInv, calCloudA, calCloudDrift, calWeather,
                                       calSunCol (direct light, linear × intensity), calSunRad (disc radiance × 40 × visibility)
environment.registerMaterial(mat): mat
environment.skyIBL                     THREE.Texture 'CAL.skyIBL' (= scene.environment)
environment.skyCube                    THREE.CubeTexture 'CAL.skyCube' (the probe, W-08)
environment.reflect                    { layer: 6, count, center, add(obj), remove(obj) }
environment.borrowLight(ms = 90): THREE.PointLight | null
environment.fireLight / fireSource     the pooled fire light / the Object3D it follows (null → the camp fire)
environment.eyeLights                  two pooled PointLights (lamp canon colours)
environment.rest(opts: number | { toHour?, hours?, seconds? }): Promise<number>
environment.debugInfo(): object
environment.dispose(): void
Environment.direction(hour: number, out: Vector3): Vector3
Environment.HOURS                      { newGame: 7, title: 17.75, shot: 17.75 }
Environment.KEYS / CALIMA / BIOMES     the tables
```

Events on `ctx.events`: `time-phase`, `weather-changed { weather, fadeSeconds }`, `rest-start`, `rest-end`,
`thunder` (legacy; no bible state sets lightning).

## 4. Honest gaps (what is not done, and what still looks weak)

- **Everything is filmed on the W0 map.** world-ground's island is not on main, so every frame here is the
  Round-4 valley: its snow-capped rim massif fills the upper third of most frames (the white "hanging" shapes
  are that terrain's snow line, not cloud), there is no sea, no sister isle, no salt. The light is tuned for
  the Pans' row (black sand, white crust) but has never been seen on them. The look must be re-filmed on the
  island after both lanes merge; I expect the Pans' −0.3 EV and the 12:00 haze to need a second pass there.
- **The clouds are W1-grade.** Four slices of one noise field give flat bases and heaped tops that drift SW,
  but they are small, pale puffs, not the towering lit cumulus of the key art; L-09 (the baked cumulus band)
  is W2 work. At night the moonlit cloud is still a little bright.
- **The cloud sea** reads as cloud from the rim stand-in (lumpy top, lit heaps, no plane), but from 205 m over
  the old valley it is a broad peach sheet; on the island it sits on the NE slopes only, which I have not seen.
- **Exposure.** The keyed EV is applied through `renderer.toneMappingExposure` on the ACES chain. look-post's
  AgX + grade (L-01/L-02) will change every number the eye sees; A-hour-keys is graded on the pre-grade
  uniforms and holds. The calima disc is solved against the live chain each time the exposure moves (it uses
  `engine.look.invert` the moment look-post publishes it).
- **L-03 numbers I did not keep:** the sky IBL runs at 0.85–1.05 and the hemisphere at 0.15–0.80, not
  L-03's 0.30–0.45 and 0.10–0.14. At L-03's values every surface turned from the sun filmed black (run 1:
  A55 shadow luminance 0.008); with the sky lighting the ground at the radiance it shows, A55 reads 0.39.
  A-look-keyfill (look-post's staging) has not been run here.
- **Not built this run (LOOK W1 items):** A-look-aerial-layers / A-look-golden-air / A-look-sun / A-play-motes
  gate rows (they need `gatePlaces.look.*` from world-props and look-post's `look-stats.mjs`); the title key
  (U-08) beyond `Environment.HOURS` (the title hour itself is menu.js, shell-ui's).
- **The 0:55 beat.** A golden clock alone cannot put "calima at noon" at 0:55: 55 real minutes from 07:00 is
  1.8 days at 1800 s/day (the row reports 02:00). The first-hour script (progression W3) must set or rest the
  clock; A-look-sunpath-dwell reports it PENDING.
- **Title hour conflict.** R66 (j) says the title stands at 17:45; the bible's Nov 6 amendment list says 18:40.
  `Environment.HOURS.title` is 17.75 per R66 (j); menu.js still uses its own `TITLE_HOUR = 17`.
- **R4 shaft pass.** The post-SMAA screen-space shafts are kept (L-08 moves them into HDR in W2); in calima
  they run at 0.35 so they do not wash the coral disc (L-14's ×1.8 belongs to the W2 gather).
- **GPU timing** of the IBL faces / PMREM, the noise-vs-fbm A/B and the cloud-sea cost are reported as CPU
  submit times only; the quiet-box timing is the orchestrator's (R45, LOOK L-16/L-18).

## 5. For other lanes and the orchestrator

- **world-ground:** (1) delete the `RiverWater` alias class at the end of `water.js` (environment.js no longer
  imports it; `A-no-river` passes); (2) the W-08 probe is `environment.skyCube` (sky-only until you call
  `environment.reflect.add(mesh)` on ≤ 10 draws of terrain LOD2 / landmark LOD1; it then re-centres on the
  camera on 25 m moves); (3) sea glitter: `environment.uniforms.calSunRad` (disc radiance × 40 × visibility)
  and `calSunCol` (direct light × intensity), both linear; (4) the cloud sea is in the shared fog chunk, so
  any registered material gets it; it sits on the windward half along bearing 045 (dot(xz, (0.707, −0.707))
  > −60 m ramping to 140 m), 105–150 m with a ± 22 m heaped top; (5) `fogParams.horizon`, `.zenith`,
  `.transmittance()` keep their names; `transmittance` now includes the valley mist; (6) `environment.ridges`
  is null (your `ridges.visible` line is a no-op); (7) biome weights are read with your CALIMA names first.
- **orchestrator:** (1) merge order: RiverWater is gone from this branch, so on the W0 map the old river is
  gone too; carried rows staged on that river (V8 water feature, the wading rows) lose their subject until
  world-ground's island merges: merge world-ground first or together; (2) `A-kind-block-file`'s / `A-weak40`'s
  calima clause can now run (`weatherStates` includes 'calima'; `overcast` is kept as a hidden state with
  densMul 1.85 for the beam row; `clear` aliases to trade); (3) the 0:55 arithmetic above; (4) the title-hour
  conflict above.
- **look-post:** `environment.exposureEV` / `exposureBase` are published; this lane multiplies
  `renderer.toneMappingExposure` by 2^EV over the base it read at construction and nudges
  `engine.bloom.threshold` (biome / calima) and `.strength` (weather ×) relative to the tier's values, writing
  only on change. When `engine.look.invert(rgb)` exists the calima disc uses it.
- **shell-ui:** with live calima, menu.js's CSS stand-in and disc billboard switch themselves off at the title
  (its own `setWeather('calima') === 'calima'` test); V38 / U-08 frames should be re-filmed.
- **character-art / hero-body / traversal:** `environment.windAt(x, z, out)` (m/s, trade 5.5 with gusts, lulls
  < 2 m/s at dawn and dusk, toward 225) for the wrap tail and the kite; `V-brea-closeup-calima` can be filmed.
- **melee / combat-kit:** `environment.borrowLight(ms)` lends eyeLights[1] (returns null while lent).
- **settlements (W2):** set `environment.fireSource = brazierObject3D` and the pooled fire light follows it
  under the F-1 rule.
