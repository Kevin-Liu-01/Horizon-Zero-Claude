/**
 * NPC ROSTER, STATIONS AND ROUTES — lane `npc`.
 *
 * Authored against the settlement `world-props` built at (22, 30): palisade
 * radius 14–20.5 m, main gate on bearing 205°, six huts, and the working
 * dressing (drying racks, tanning frame, trough, spear stands, crates, wood
 * pile). Nothing here reaches into that lane's code — the positions are the
 * ones its own source publishes, and every point is re-cleared at spawn
 * against the live collider set (`NpcSystem._clearPoint`), so a prop that moves
 * by a metre moves the person standing at it instead of burying them in it.
 */

export const CAMP = { x: 22, z: 30 };

/** Work / rest stations. `seat` marks a log an NPC actually sits ON. */
export const STATIONS = {
  fire: { x: 22.0, z: 30.0, r: 2.4 },
  logA: { x: 20.2, z: 28.6, seat: true, seatUp: 0.30, face: [22, 30] },
  logB: { x: 23.9, z: 32.6, seat: true, seatUp: 0.30, face: [22, 30] },
  rackA: { x: 20.6, z: 36.6, r: 1.15 },
  /**
   * `standBearing` is in the same frame as `_place`: x += sin(a), z += cos(a).
   * rackB and woodPile are 0.42 m apart in the settlement, so their default
   * stands (both facing the fire) landed 0.50 m apart and put two workers
   * inside each other for a whole session. rackB's worker stands on the far
   * side of the rack instead — 1.5 m of clear air between the two of them.
   */
  /**
   * FIX ROUND 1 — moved from (27.6, 30.9). The authored spot is 0.42 m from the
   * wood pile, and the whole block x 25..30, z 29..32 is solid on a 0.5 m
   * occupancy map: the two workers assigned there stood inside each other for
   * 100 % of a filmed session and the gatherer could not leave for her route
   * without grinding through the pile. The rack stands in the open ground east
   * of it, where there is room for a person on either side of it.
   */
  rackB: { x: 30.0, z: 30.6, r: 1.15, standOff: 1.5 },
  /**
   * FIX ROUND 1 — moved from (12.2, 35.2). That authored spot is inside the
   * longhouse footprint: an occupancy map at 0.5 m resolution shows the only
   * clear pocket within 2 m of it, (12.5..13.0, 33.5), is an island with solid
   * rows on both sides, so the stitcher could reach his own workbench only by
   * grinding through a wall (2.4 m of depenetration per round trip, and 20.9 m
   * once the mark was pushed to the far side of it). The frame stands in the
   * open ground south-west of the fire instead, which is both walkable and
   * where a hide rack belongs — upwind of the cook fire.
   */
  tanFrame: { x: 16.6, z: 28.4, r: 1.2 },
  trough: { x: 24.4, z: 35.4, r: 1.1 },
  crates: { x: 25.4, z: 29.1, r: 1.3 },
  weaponRack: { x: 19.1, z: 31.9, r: 1.2 },
  woodPile: { x: 27.9, z: 31.2, r: 1.3 },
  totem: { x: 18.6, z: 37.2, r: 1.2 },
};

/**
 * Walking routes.
 *   `pts`  explicit polyline in world XZ
 *   `ring` [a0, a1] — a patrol along the INSIDE of the palisade, sampled from
 *          `camp.settlement.palisadeRadius(a)` at run time so the lookouts
 *          follow the wall the world-props lane actually built, wherever the
 *          knoll put it.
 *   `mode` 'loop' | 'pingpong'
 */
export const ROUTES = {
  gateRun: { pts: [[21.2, 27.4], [19.4, 23.4], [17.8, 19.6], [16.4, 16.6]], mode: 'pingpong' },
  /**
   * FIX ROUND 1 — THESE TWO LANES WERE AUTHORED THROUGH THE FURNITURE.
   *
   * `westLane` ran (14.2, 30.0) straight into the longhouse and `eastLane`
   * (27.4, 31.6) into the wood pile and the drying rack. Every node was then
   * dragged toward the fire by `_clearPoint`'s escape pull, so both "lanes"
   * collapsed into three-node scribbles at radius 2-3 m in the middle of the
   * plaza — which is where AURA spent her session being shoved (18.0 m of
   * depenetration in 60 s) and why `westLane` resolved to nothing at all.
   *
   * Re-authored against a 1 m occupancy map of the settlement measured on port
   * 5218 (`NpcSystem._blockedAt`, the same 0.55 m capsule the people use): the
   * open south-west quarter for the west loop, and the perimeter band around
   * hut-south and hut-east for the east run. Every node and every leg is clear
   * on that map, and `_validateRoute` + `_proveRoute` re-check both at run time.
   */
  westLane: {
    pts: [[18.0, 25.0], [14.0, 23.0], [11.0, 20.5], [14.5, 18.5], [19.0, 20.0], [20.0, 23.5]],
    mode: 'loop',
  },
  eastLane: {
    pts: [[25.5, 27.5], [26.0, 22.0], [33.0, 22.0], [35.0, 27.0], [34.5, 32.0], [33.0, 36.5], [28.5, 39.5]],
    mode: 'pingpong',
  },
  /**
   * `fallback` is the route a lookout is handed when its arc cannot be made
   * walkable here (`NpcSystem._fallbackRoute` / `_abandonRoute`). Both targets
   * are authored interior polylines that measured 47.6 m of ground travel with
   * 0.0 m of depenetration, so a patrol that loses its wall still patrols.
   */
  palisadeA: { ring: [0.25, 2.35], inset: 4.3, mode: 'pingpong', fallback: 'eastLane' },
  /**
   * The south-west arc [3.30, 5.60] was re-authored to [4.95, 6.55] in fix
   * round 1: the longhouse (radius 12.3) and hut-west (15.2) eat bearings
   * 4.18-4.97 of the patrol lane, so that arc could only be walked as a radial
   * zigzag between radius 16 and radius 7.6 — which is where the second lookout
   * kept being shoved. The new arc runs the clear west-to-north quarter and
   * meets `palisadeA` at north; the gate approach in between is `gateRun`'s.
   */
  palisadeB: { ring: [4.95, 6.55], inset: 4.3, mode: 'pingpong', fallback: 'westLane' },
};

/**
 * THE CAMP, 13 PEOPLE.
 *
 * `body` picks a build from `npcBody.BODIES` — six distinct silhouettes across
 * the roster, which is what `A95-npc-roster` counts. `role` picks the
 * behaviour plan in `npc.js`. `lines` is published on `ctx.npcs` so the
 * progression lane can hang real dialogue on anyone here without this lane
 * knowing about quests.
 */
/**
 * `idleClip` is the loop this person falls back to when it has nothing to do —
 * the smith leans on his push, the lookout drops into a crouch, the trader
 * talks with her hands. Thirteen people all playing `Idle_Loop` is what makes
 * a crowd read as one actor thirteen times, and it is what `V35-settlement`
 * measures pairwise.
 *
 * `scale` is a per-person multiplier ON TOP of the build's own. Two hunters of
 * the same build are not the same height, and the crowd reads flatter when they
 * are — it also gives `V35-settlement`'s pairwise landmark test real separation
 * on the head as well as the hands. Chosen so no two of the thirteen land
 * within 3 cm of each other: 1.56 m to 1.93 m across the roster.
 */
export const ROSTER = [
  {
    id: 'varl', name: 'VARL', title: 'Hunter of the Valley', body: 'lean', role: 'talker',
    hairStyle: 'braid', hair: '#3a2718', skin: '#c69873', cloth1: '#4a6b58', cloth2: '#b58a3a', leather: '#463020',
    accent: '#7d2f2f', fur: '#cdbda2', feather: true,
    outfit: { ruff: true, pauldron: 'left', sash: 'left' },
    idleClip: ['idleTalk', 'interact'], gear: ['spear'], station: 'fire', standOff: 2.1, standBearing: 0.9,
    lines: ['Still breathing. The valley has not taken you yet.', 'Sit, or trade, or go be useful.'],
  },
  {
    id: 'sona', name: 'SONA', title: 'War-Chief', body: 'tall', role: 'lookout',
    hairStyle: 'topknot', hair: '#1d1310', skin: '#ab7d57', cloth1: '#3d4f66', cloth2: '#cdbda2', leather: '#2e2218',
    accent: '#b58a3a', fur: '#e2d6bf',
    outfit: { pauldron: 'right', cloak: true, bootsHigh: true },
    idleClip: ['idle', 'swordIdle'], gear: ['spear', 'quiver'], route: 'palisadeA', speed: 1.02,
    lines: ['Eyes on the ridge. The Watchers walk it at dusk.'],
  },
  {
    id: 'teb', name: 'TEB', title: 'Stitcher', body: 'stocky', role: 'worker',
    hairStyle: 'short', hair: '#5a3d22', beard: true, skin: '#dcb595', cloth1: '#a8763c', cloth2: '#7d2f2f', leather: '#573d24', accent: '#4a6b58', fur: '#9b8c74',
    outfit: { apron: true, wraps: true, skirt: false },
    idleClip: ['fixing', 'pickup'], gear: ['tools'], station: 'tanFrame', standOff: 1.35, errand: 'rackA',
    lines: ['Hide takes a week to soften. Patience is the craft.'],
  },
  {
    id: 'bast', name: 'BAST', title: 'Hunter', body: 'broad', role: 'hunter',
    hairStyle: 'short', hair: '#1d1310', skin: '#8e6244', cloth1: '#7d2f2f', cloth2: '#cdbda2', leather: '#463020', accent: '#b58a3a', fur: '#cdbda2',
    outfit: { ruff: true, bootsHigh: true },
    idleClip: ['crouchIdle', 'swordIdle'], gear: ['bow', 'quiver'], route: 'gateRun', speed: 1.06,
    lines: ['The gate stays watched. That is the whole of it.'],
  },
  {
    id: 'vala', name: 'VALA', title: 'Storyteller', body: 'slight', role: 'sitter',
    hairStyle: 'long', hair: '#7a3218', skin: '#e6c1a2', cloth1: '#6b5a8c', cloth2: '#b58a3a', leather: '#573d24',
    accent: '#2f5d6b', fur: '#e2d6bf', feather: true,
    outfit: { skirtLong: true, ruff: true },
    gear: [], station: 'logA', sitTalk: true,
    lines: ['Sit. The fire is better with a story on it.'],
  },
  {
    id: 'karst', name: 'KARST', title: 'Elder', body: 'elder', role: 'sitter',
    hairStyle: 'bald', headband: true, hair: '#c9c2b4', beard: true, skin: '#9a6c4c',
    cloth1: '#2f5d6b', cloth2: '#9b8c74', leather: '#3a2c1e', accent: '#cdbda2', fur: '#cdbda2',
    outfit: { cloak: true, skirtLong: true, ruff: true },
    gear: ['staff'], station: 'logB',
    lines: ['I have seen the metal beasts change. They learn. So must we.'],
  },
  {
    id: 'maris', name: 'MARIS', title: 'Trader', body: 'stocky', role: 'worker',
    hairStyle: 'bun', hair: '#3a2718', skin: '#c69873', cloth1: '#96502f', cloth2: '#3d4f66', leather: '#2e2218',
    accent: '#b58a3a', fur: '#9b8c74',
    outfit: { hood: true, sash: 'right' },
    scale: 1.052, idleClip: ['idleTalk', 'pickup'], gear: ['pack'], station: 'crates', standOff: 1.45, errand: 'trough', talkable: true,
    lines: ['Shards for arrows, arrows for shards. Everyone eats.'],
  },
  {
    id: 'olin', name: 'OLIN', title: 'Gatherer', body: 'slight', role: 'gatherer',
    hairStyle: 'braid', hair: '#8b7048', skin: '#dcb595', cloth1: '#5b7a4a', cloth2: '#a8763c', leather: '#463020', accent: '#7d2f2f', fur: '#cdbda2',
    outfit: { wraps: true },
    scale: 1.055, idleClip: ['push', 'interact'], gear: ['basket'], route: 'westLane', station: 'rackA', speed: 0.92,
    lines: ['Berries by the west wall, if the birds leave any.'],
  },
  {
    id: 'thok', name: 'THOK', title: 'Smith', body: 'broad', role: 'worker',
    hairStyle: 'bald', hair: '#1d1310', beard: true, skin: '#8e6244', cloth1: '#3a2c1e', cloth2: '#96502f', leather: '#2e2218', accent: '#b58a3a', fur: '#7e7260',
    outfit: { apron: true, skirt: false, pauldron: 'left' },
    scale: 0.98, idleClip: ['push', 'fixing'], gear: ['hammer'], station: 'woodPile', standOff: 1.4, work: 'push',
    lines: ['Bring me metal shards and I will bring you arrowheads.'],
  },
  {
    id: 'renn', name: 'RENN', title: 'Lookout', body: 'lean', role: 'lookout',
    hairStyle: 'short', hair: '#5a3d22', skin: '#e6c1a2', cloth1: '#4a6b58', cloth2: '#3d4f66', leather: '#3a2c1e', accent: '#cdbda2', fur: '#e2d6bf',
    outfit: { hood: true, bootsHigh: true },
    scale: 0.968, idleClip: ['crouchIdle', 'swordIdle'], gear: ['spear'], route: 'palisadeB', speed: 0.98,
    lines: ['Nothing on the south line. Yet.'],
  },
  {
    id: 'delve', name: 'DELVE', title: 'Hunter', body: 'tall', role: 'hunter',
    hairStyle: 'long', hair: '#1d1310', skin: '#ab7d57', cloth1: '#3d4f66', cloth2: '#7d2f2f', leather: '#463020', accent: '#b58a3a', fur: '#cdbda2',
    outfit: { ruff: true, wraps: true },
    scale: 0.955, idleClip: ['idle', 'crouchIdle'], gear: ['bow', 'quiver'], route: 'gateRun', reverse: true, speed: 1.0,
    lines: ['Two Striders on the west meadow. Easy shards, hard shots.'],
  },
  {
    id: 'aura', name: 'AURA', title: 'Gatherer', body: 'lean', role: 'gatherer',
    hairStyle: 'bun', hair: '#7a3218', skin: '#c69873', cloth1: '#b58a3a', cloth2: '#4a6b58', leather: '#573d24', accent: '#2f5d6b', fur: '#9b8c74',
    outfit: { skirtLong: true },
    scale: 1.076, idleClip: ['pickup', 'idleTalk'], gear: ['basket'], route: 'eastLane', station: 'rackB',
    standOff: 1.5, speed: 0.95,
    lines: ['The racks will be full before the light goes.'],
  },
  {
    id: 'nil', name: 'NIL', title: 'Hunter', body: 'stocky', role: 'worker',
    hairStyle: 'short', hair: '#8b7048', skin: '#dcb595', cloth1: '#96502f', cloth2: '#5b7a4a', leather: '#2e2218', accent: '#cdbda2', fur: '#cdbda2',
    outfit: { pauldron: 'right', wraps: true },
    scale: 0.958, idleClip: ['swordIdle', 'crouchIdle'], gear: ['spear'], station: 'weaponRack', standOff: 1.3, work: 'jab',
    lines: ['A spear you have not sharpened is a stick.'],
  },
];

/** Roles that own a walking route and should be moving most of the day. */
export const WALKING_ROLES = new Set(['hunter', 'lookout', 'gatherer']);
