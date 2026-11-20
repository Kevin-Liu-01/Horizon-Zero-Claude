// @ts-check
/**
 * M3 area B (M3.1, KF7), THE WIND ROADS: the old Fogcatcher line-posts that mark chained ridge lift for the Survey Kite.
 * BIBLE §3.4: "Organ Shelf rim: 5 posts. The Scar's north lip: 7. The caldera's windward wall: 6. Each is a 3 m cane
 * post with a cloth streamer." BIBLE §12: their cloth streams when the lift is on.
 *
 * Plain data in the bible's frame (E, N); `x`, `z` are the engine frame (x = E, z = -N; ISLAND_SCALE is 1 at 1024 m,
 * which `src/world/island/extent.js` owns: the world lane snaps and scales them when it builds the meshes). Heights are
 * not stored: a post stands on the ground where it is placed (the world lane snaps it).
 *
 * BLOCKOUT VALUES (wave 1). The Organ Shelf's five stand on the shelf's north rim, east to west toward the Sounding Ring
 * (the shelf's steep faces look N, NW, W and S; by area A's lift law, src/world/island/lift.js at f6d3eb7, none of
 * them lifts in the trade: 0 of 5 stream, sent for a ruling, KF0 (a)); the Scar's seven stand 15 m off its north-west
 * lip, evenly from 0.10 to 0.90 of its length (the Scar runs on bearing 225, straight downwind, so its lip makes no
 * lift by the one law: brief §1, KF0 (b)); the caldera's six on the caldera's outer north-east flank, the wall that
 * faces the wind, each on a cell area A's law lifts (the caldera is not built: blockout ground).
 */

/** @typedef {'organ-shelf' | 'scar' | 'caldera'} RoadId */
/** @typedef {{ id: string, road: RoadId, i: number, e: number, n: number, x: number, z: number, heightM: number }} LinePost */

/** m: every post */
export const POST_HEIGHT_M = 3;

/** @param {RoadId} road @param {[number, number][]} en @returns {LinePost[]} */
const posts = (road, en) => en.map(([e, n], i) => Object.freeze({ id: `${road}-${i + 1}`, road, i, e, n, x: e, z: -n, heightM: POST_HEIGHT_M }));

/** The Scar's line (sites.js SCAR, bible (251, -43) -> (-91, -384)), its north-west lip 15 m off the centre line. */
const SCAR_A = [251, -43], SCAR_B = [-91, -384], SCAR_LIP_M = 15;
const scarLip = (/** @type {number} */ k) => {
  const de = SCAR_B[0] - SCAR_A[0], dn = SCAR_B[1] - SCAR_A[1], L = Math.hypot(de, dn);
  // the north-west side: the normal (-dn, de)/L points to the line's right going SW, i.e. north-west
  const ne = -dn / L, nn = de / L;
  const side = ne < 0 && nn > 0 ? 1 : -1;
  return /** @type {[number, number]} */ ([+(SCAR_A[0] + de * k + side * ne * SCAR_LIP_M).toFixed(1), +(SCAR_A[1] + dn * k + side * nn * SCAR_LIP_M).toFixed(1)]);
};

/** @type {Readonly<Record<RoadId, readonly LinePost[]>>} */
export const WIND_ROADS = Object.freeze({
  // east to west along the shelf's north rim, toward the Sounding Ring
  'organ-shelf': Object.freeze(posts('organ-shelf', [[-156, -316], [-172, -316], [-184, -328], [-196, -340], [-208, -344]])),
  // from the Kiln Yards' end down toward Saltrow (downwind)
  scar: Object.freeze(posts('scar', [0.10, 0.233, 0.367, 0.5, 0.633, 0.767, 0.9].map(scarLip))),
  // the caldera's outer north-east flank, north-west to south-east
  caldera: Object.freeze(posts('caldera', [[80, 202], [96, 194], [104, 194], [120, 194], [136, 194], [152, 186]])),
});

/** The counts the bible gives. */
export const ROAD_COUNTS = Object.freeze({ 'organ-shelf': 5, scar: 7, caldera: 6 });

/** Every post, in road order. @type {readonly LinePost[]} */
export const LINE_POSTS = Object.freeze([...WIND_ROADS['organ-shelf'], ...WIND_ROADS.scar, ...WIND_ROADS.caldera]);

/**
 * Does a post's cloth stream? Iff the lift is on at its top (KF7). `groundAt` snaps the post; `liftAt` is the seam.
 * @param {LinePost} post
 * @param {(x: number, y: number, z: number) => number} liftAt
 * @param {(x: number, z: number) => number} groundAt
 * @param {boolean} [flyable] false in calima and squall: no cloth streams for the kite then
 */
export function streams(post, liftAt, groundAt, flyable = true) {
  if (!flyable) return false;
  return liftAt(post.x, groundAt(post.x, post.z) + post.heightM, post.z) > 0;
}
