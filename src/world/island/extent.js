/**
 * ISLAND EXTENT — the playable radius and every boundary derived from it
 * (Round 5, plan §3.2).
 *
 * W0-day1 STUB (lane brand): TODAY'S VALUES. Each kept-code extent that used to
 * be a bare literal is now `PLAY_RADIUS + EXTENT.<name>`; the offsets below
 * reproduce the old numbers exactly (gate `A-extent-refactor`):
 *
 *   name          offset  old literal  where
 *   navSpan         +2      332        core/nav.js R      (half-span of the 2 m navgrid)
 *   edgeSoft       -18      312        entities/player.js EDGE_SOFT (steer + taper start)
 *   navOuter        -6      324        core/nav.js OUTER  (hard edge of walkable cells)
 *   machineRim     -12      318        machines/machine.js WORLD_LIMIT (root clamp)
 *   gatherRim      -15      315        items/gather.js    (no gather node beyond)
 *   routeRim       -20      310        machines/index.js _route (patrol waypoint clamp)
 *   searchRim      -20      310        machines/ai/search.js (search candidate cut)
 *   anchorRim      -34      296        machines/ai/doctrine.js siteAnchor (site clamp)
 *   fleeRim        -45      285        machines/ai/squad.js stepFlee (flee turns tangential)
 *
 * `entities/player.js` WORLD_R is PLAY_RADIUS itself (the terrain contract),
 * and `world/terrain.js` re-exports PLAY_RADIUS from here.
 *
 * Owned by world-ground from W1, which derives PLAY_RADIUS from WORLD_SIZE
 * (≈ 490 m at 1024 m); the offsets keep their margins (`A-reach-all-sites`).
 */
export const PLAY_RADIUS = 330;

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
