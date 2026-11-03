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
| Horizon map: long soft terrain shadows at any hour | `bake.js` `bakeHorizon`, `groundShader.js` `gHorizonVis` | new; see §2.5 |
| R48 owner bar | `terrain.js` `noise2D` | the destructured `[i1, j1]` is two integers now |
| POC closure | `src/main.js` block removed, `public/textures/r5-poc/**`, `tools/r5-poc/poc-biome.js` deleted | `public/models/r5-poc/*` stays until its two generators are re-pointed by their owners (§5) |
