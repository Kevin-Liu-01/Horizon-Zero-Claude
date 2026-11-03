/**
 * ISLAND EXTENT — the world size, the playable radius and every boundary derived
 * from them (Round 5, plan §3.2, bible §8.1).
 *
 * Owned by world-ground from W1. The world square is one number: the orchestrator's
 * ruling (plan §8.3, "World size = 1024 m") sets it, and `A-world-size` times the real
 * cold boot; if that run exceeds the bar on 3 of 5 runs the fallback is 860 m (then
 * 720 m) by changing WORLD_SIZE here and nowhere else. `sites.js` and the landform
 * recipe are authored in metres at 1024 m and scale with ISLAND_SCALE.
 *
 * Each kept-code extent is `PLAY_RADIUS + EXTENT.<name>`; the offsets are the Round-4
 * literals minus 330 (A-extent-refactor), so they keep their margins at any size:
 *
 *   name          offset  where
 *   navSpan         +2    core/nav.js R      (half-span of the 2 m navgrid)
 *   edgeSoft       -18    entities/player.js EDGE_SOFT (steer + taper start)
 *   navOuter        -6    core/nav.js OUTER  (hard edge of walkable cells)
 *   machineRim     -12    machines/machine.js WORLD_LIMIT (root clamp)
 *   gatherRim      -15    items/gather.js    (no gather node beyond)
 *   routeRim       -20    machines/index.js _route (patrol waypoint clamp)
 *   searchRim      -20    machines/ai/search.js (search candidate cut)
 *   anchorRim      -34    machines/ai/doctrine.js siteAnchor (site clamp)
 *   fleeRim        -45    machines/ai/squad.js stepFlee (flee turns tangential)
 *
 * Plain data, no imports: safe from any module, worker or node.
 */
export const WORLD_SIZE = 1024;
export const WORLD_HALF = WORLD_SIZE / 2;

/** Every coordinate in sites.js + recipe.js is authored at 1024 m and multiplied by this. */
export const ISLAND_SCALE = WORLD_SIZE / 1024;

/** ≈ 490 m at 1024 m; ×0.84 / ×0.70 at the 860 / 720 m fallbacks (bible §8.1). */
export const PLAY_RADIUS = Math.round(490 * ISLAND_SCALE);

/** The render mesh: span 1.3 × the world square at 1.94 m nodes (A-world-size ≤ 1.95 m). */
export const MESH_SPAN = WORLD_SIZE * 1.3;
export const MESH_SEGS = Math.round(686 * ISLAND_SCALE);

export const EXTENT = Object.freeze({
  navSpan: 2,
  edgeSoft: -18,
  navOuter: -6,
  machineRim: -12,
  gatherRim: -15,
  routeRim: -20,
  searchRim: -20,
  anchorRim: -34,
  fleeRim: -45,
});
