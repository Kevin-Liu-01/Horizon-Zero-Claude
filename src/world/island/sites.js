/**
 * ISLAND SITES — the one place the rest point lives (Round 5, plan §3.2).
 *
 * W0-day1 STUB (lane brand): TODAY'S VALUES, lifted verbatim from the copies
 * the mechanical pass replaced (player spawn/respawn, map + title, props,
 * terrain, vegetation, gather, NPC waypoints, machine manager + base, doctrine,
 * progression's campfire fallback, fauna, the camp/settlement content files).
 * Nothing in `src/` carries the numbers any more; it imports them from here.
 *
 * Owned by world-ground from W1, which moves both to Brea's cistern at Saltrow
 * (gates `A-single-rest`, `A-reach-all-sites`).
 *
 *   REST       where the player spawns and where "respawn at camp" puts her
 *              (the old player.js CAMP_POS / menu + map CAMP)
 *   REST_SITE  the settlement that rest point belongs to: its centre (the old
 *              camp at the campfire) and `r`, the radius of the Instrument
 *              no-spawn ring (machines/index.js + machine.js keep out of it)
 *
 * Plain frozen data, no imports: safe to import from any module, node or page.
 */
export const REST = Object.freeze({ x: 18, z: 26 });

export const REST_SITE = Object.freeze({ x: 22, z: 30, r: 25 });
