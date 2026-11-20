/**
 * THE CERTIFICATIONS IN HOUR TWO (Milestone 3 wave 3, area E: M3.7's ranks that hour two can reach; the brief's HT6).
 * Pure data: the counted-acts seam's events (./rules.js COUNTED_EVENTS) that hour two's ground and quests give, in the
 * order a player meets them, and where each comes from. node --test src/game/certs/hour-two-ranks.test.mjs feeds them
 * to `CountedActs` after the first hour's own acts and reads which ranks are granted, and by which event.
 *
 *   FIRST_HOUR_SEAM   the first hour's acts as seam events (what the hour-two fixtures carry: actsFromQuests of a
 *                     finished "True Ground": the bob Pried, the triangle, the Peg line crossed unseen, Benchmark 1)
 *   HOUR2_FASTEST     only what the three quests make her do (the scripted fastest hour two, HT8's play)
 *   HOUR2_OPTIONAL    what hour two's ground offers besides (each named with its place): reeds on the walks in the Pans,
 *                     the Pans' Peg transects, a Plumb's vial from 30 m, a Dust Pot made, the Kiln's canisters Pried
 * Kills are not here and could not be: no kill is a seam event (`actsOfEvent` refuses every other name).
 */

/** The first hour's acts (src/game/certs/rules.js actsFromQuests on a finished "True Ground") as seam events. */
export const FIRST_HOUR_SEAM = Object.freeze([
  ['pry', { kind: 'plumb', part: 'bob', leg: 1 }],
  ['triangle', { id: 'T1-T2-T6', leg: 1 }],
  ['transect:crossed', { transect: 'peg-line', unseen: true, leg: 1 }],
  ['resurvey', { benchmark: 'bm-01', leg: 3 }],
]);

/** What the three hour-two quests count, by leg (HT8's scripted fastest hour two). */
export const HOUR2_FASTEST = Object.freeze([
  // leg 4, "A Line Over the Glass": the walk from the stud to the wreck crosses the Pans' Peg transect; the cane for the
  // kite is cut in the reed beds by the ditch, walked hidden (2 x 25 m)
  ['transect:crossed', { transect: 'pans-beach', unseen: true, leg: 4, why: 'the stud to the black beach crosses the Pans\' Peg transect' }],
  ['reed:metres', { m: 50, leg: 4, why: 'cane x8 cut in the ditch\'s reeds' }],
  // leg 5, "The Wrong Tide": Benchmark 2 re-surveyed (Ballast and Bearing); the Gauge's three float scutes Pried, never
  // by killing it (BIBLE 8.4 rung 3)
  ['resurvey', { benchmark: 'bm-b2', leg: 5, why: 'Benchmark 2 in the Glass' }],
  ['pry', { kind: 'gauge', part: 'float-1', leg: 5, why: 'a float scute for rung 3' }],
  ['pry', { kind: 'gauge', part: 'float-2', leg: 5, why: 'a float scute for rung 3' }],
  ['pry', { kind: 'gauge', part: 'float-3', leg: 5, why: 'a float scute for rung 3' }],
  // leg 6, "The Kiln Yards": quenching is not a survey act; the Yards count nothing by themselves
]);

/** What hour two's ground offers besides the quests (each act is a seam event an owner emits; none is a kill). */
export const HOUR2_OPTIONAL = Object.freeze([
  ['reed:metres', { m: 75, leg: 4, why: 'the walk to the Sounding Ring through the Pans\' rush, hidden' }],
  ['transect:crossed', { transect: 'ring-rise', unseen: true, leg: 4, why: 'the Ring\'s rise transect' }],
  ['vial:30m', { kind: 'plumb', m: 31, leg: 4, why: 'a Plumb\'s vial on the Pans from 31 m' }],
  ['lamp:dark', { kind: 'sonde', leg: 4, why: 'the cut Sonde\'s lamp darkened, not killed' }],
  ['triangle', { id: 'T1-T2-T3', leg: 6, why: 'T3 sighted from the Malpais edge (row 0: in sight)' }],
  ['made', { item: 'dust-pot', leg: 6, why: 'a Dust Pot made for the Spindle (pumice x3)' }],
  ['pry', { kind: 'kiln', part: 'canister-1', leg: 6, why: 'a Kiln canister Pried in the door\'s stagger' }],
  ['transect:crossed', { transect: 'yards-apron', unseen: true, leg: 6, why: 'the Yards\' shelf walked out of the awake Kiln\'s eye' }],
]);
