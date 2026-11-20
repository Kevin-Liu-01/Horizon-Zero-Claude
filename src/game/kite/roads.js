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
 * BLOCKOUT VALUES (wave 1). The Organ Shelf's five stood on the shelf's north rim, east to west toward the Sounding Ring
 * (the shelf's steep faces look N, NW, W and S; by area A's lift law, src/world/island/lift.js at f6d3eb7, none of
 * them lifts in the trade: 0 of 5 stream, sent for a ruling, KF0 (a)); the Scar's seven stand 15 m off its north-west
 * lip, evenly from 0.10 to 0.90 of its length (the Scar runs on bearing 225, straight downwind, so its lip makes no
 * lift by the one law: brief §1, KF0 (b)); the caldera's six on the caldera's outer north-east flank, the wall that
 * faces the wind, each on a cell area A's law lifts (the caldera is not built: blockout ground).
 *
 * WAVE 2, THE ORCHESTRATOR'S RULINGS (provisional until the owner answers):
 *   R3  the T1 test flight is a GLIDE TEST: open at T1, glide, land on a marked field within reach below (the law's own
 *       glide from T1's built height); it does not need the Ring's rise. The field is `TEST_FLIGHT.field`: centred where
 *       the law lands her holding the track from T1 toward the Ring in the steady trade (83 m off, ground 0.6 m, dry,
 *       flat within 0.12 m over its 12 m radius).
 *   R4  the Scar road and the Organ Shelf road are GLIDE roads: their posts mark a downwind line, not lift; KF7 for them
 *       reads "a glide along the posts from the road's launch reaches its last post". The caldera keeps its lift road.
 *       One lift law; no terrain cut to make lift. Each road's launch is a trig pillar's top (BIBLE §12: "Trig pillar
 *       tops are launch points"): the Organ Shelf's is T1, the Scar's T3 on Rust Cone (the Scar's own head has no drop
 *       a legal open can be taken from). The Organ Shelf's five now stand 4 m south of the test flight's line, from T1
 *       off the shelf's west rim down to the field's near edge (12, 27, 42, 56 and 70 m from T1): posts 1 and 2 on the
 *       shelf and its rim, 3-5 on the pans (the bible's "Organ Shelf rim: 5 posts" read as the road that leaves it).
 *       A glide road's cloth streams downwind whenever the kite may fly (it marks the line; it says nothing of lift),
 *       and hangs in calima and squall.
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
  // (wave 1: [[-156, -316], [-172, -316], [-184, -328], [-196, -340], [-208, -344]], the north rim; R4 moved them)
  // from T1 west-north-west down the test flight's line to the field's near edge, 4 m to the line's south
  'organ-shelf': Object.freeze(posts('organ-shelf', [[-199.6, -358.2], [-214.2, -354.8], [-228.8, -351.4], [-242.5, -348.3], [-256.1, -345.2]])),
  // from the Kiln Yards' end down toward Saltrow (downwind)
  scar: Object.freeze(posts('scar', [0.10, 0.233, 0.367, 0.5, 0.633, 0.767, 0.9].map(scarLip))),
  // the caldera's outer north-east flank, north-west to south-east
  caldera: Object.freeze(posts('caldera', [[80, 202], [96, 194], [104, 194], [120, 194], [136, 194], [152, 186]])),
});

/** R4: what a road's posts mark. A glide road's line is flown from its launch; a lift road's cloth streams on lift. */
export const ROAD_KIND = Object.freeze({ 'organ-shelf': 'glide', scar: 'glide', caldera: 'lift' });

/** R4: each road's launch, a trig pillar's top (sites.js TRIG; BIBLE §12). The caldera's is the lift itself (wave 3). */
export const ROAD_LAUNCH = Object.freeze({ 'organ-shelf': 'T1', scar: 'T3', caldera: null });

/** m: a glide passes a post when her ground track comes within this of it (the posts stand off the line) */
export const POST_PASS_M = 8;

/**
 * R3, THE TEST FLIGHT ("A Line Over the Glass"): a glide test from T1's top to a marked field below. `field` is in the
 * bible's frame (E, N) with its radius; `bearing` is the track from T1 to its centre (toward the Sounding Ring, 283 deg).
 * The world lane marks it (wave 3); the quest's `fly` beat lands inside it at <= 3 m/s.
 */
export const TEST_FLIGHT = Object.freeze({
  from: 'T1',
  field: Object.freeze({ e: -268.0, n: -338.3, x: -268.0, z: 338.3, r: 12 }),
  bearing: 283,
});

/** The counts the bible gives. */
export const ROAD_COUNTS = Object.freeze({ 'organ-shelf': 5, scar: 7, caldera: 6 });

/** Every post, in road order. @type {readonly LinePost[]} */
export const LINE_POSTS = Object.freeze([...WIND_ROADS['organ-shelf'], ...WIND_ROADS.scar, ...WIND_ROADS.caldera]);

/**
 * Does a post's cloth stream? On a lift road iff the lift is on at its top (KF7); on a glide road (R4) whenever the kite
 * may fly. `groundAt` snaps the post; `liftAt` is the seam.
 * @param {LinePost} post
 * @param {(x: number, y: number, z: number) => number} liftAt
 * @param {(x: number, z: number) => number} groundAt
 * @param {boolean} [flyable] false in calima and squall
 */
export function postStreams(post, liftAt, groundAt, flyable = true) {
  if (!flyable) return false;
  return ROAD_KIND[post.road] === 'glide' ? true : streams(post, liftAt, groundAt, flyable);
}

/**
 * Does the LIFT stream a post's cloth? Iff the lift is on at its top (KF7's lift rule). `groundAt` snaps the post.
 * @param {LinePost} post
 * @param {(x: number, y: number, z: number) => number} liftAt
 * @param {(x: number, z: number) => number} groundAt
 * @param {boolean} [flyable] false in calima and squall: no cloth streams for the kite then
 */
export function streams(post, liftAt, groundAt, flyable = true) {
  if (!flyable) return false;
  return liftAt(post.x, groundAt(post.x, post.z) + post.heightM, post.z) > 0;
}
