/**
 * HOUR TWO, R8: LEG 5 AND THE EXIT'S TWO-LEG PAIRING UNDER 900 s BY ROUTE (Milestone 3 wave 2, area E; the orchestrator's
 * ruling R8: "Leg 5 and the exit's two-leg pairing keep their 900 s bar: shorten the route (a nearer Brazier, a road)
 * rather than the bar; propose with numbers"). Pure data and arithmetic, no THREE, no DOM: Node reads it
 * (src/game/hour2/route.test.mjs). WIRED at M3 wave 2b (area C): plan.js's BEATS carry these budgets (each beat keeps its
 * wave-1 budget as `wave1S`), the hut's and the Brazier's places, leg 5's and 6's walks and leg 6's travel, and the two
 * new needs the runner fails the beats by until their owners build them ('brazier:tide-rest', 'travel:b2-node'). This
 * file stays the proposal's record and its arithmetic. (Was: "A PROPOSAL: nothing here is wired; plan.js's BEATS keep
 * their wave-1 budgets until the owners of the three changes below land them, and the runner reads plan.js.")
 *
 * Why the bar fails today (plan.js at wave 1): leg 5's budgets are 515 s, 275 of them the wait for the Gauge's tide to
 * turn (gauge.js CLOCK: it spawns at phase 0.108 and leaves for the Glass 265 s later, back 415 s after its spawn), so
 * legs 4+5 come to 1,009 s and legs 5+6 to 1,129 s with their two boots, against 900.
 *
 * The route, in three changes (each names the area that owns it):
 *   1. A NEARER BRAZIER (leg 5's 'gauge-tide'). The cistern's Brazier, Brea's own, stands 40 m from the guild-house stud
 *      where leg 4 ends and 73 m from Sluice 3. Its rest dialog offers the Gauge's turn of the tide as a stop (as it offers
 *      dawn and noon); the keeper's tide clock is carried through the rest as the site clock is, so she wakes a walk
 *      before it leaves. The beat is the walk to the Brazier, the rest and the walk to the Gauge, not 265 s of waiting:
 *      275 -> 60 s. (instruments: gauge.js reads the rest; systems: braziers' rows; writing: the row's words, W3.)
 *   2. THE FISHING HUT ON THE GLASS'S SHORE (leg 5's 'hand-net'). The bible gives the hut no place; wave 1 put it on the
 *      black beach's dry head, 193 m from the stud and 288 m from Oro. On the Glass's shore, 40 m from Benchmark 2 toward
 *      the stud, it is 84 m from the stud: 50 -> 40 s. (world, area A: it places the hut at wave 2.)
 *   3. A ROAD (leg 6's 'oro-yards'). Benchmark 2 is re-surveyed in leg 5, so it is a WALK THE LINE node from then on
 *      (TrueGround.nodes() lists every re-surveyed benchmark); leg 6 walks 40 m from the hut to B2, walks the line to B1,
 *      and B1 is 76 m from Oro: 288 m on foot become 116 m and one travel. 72 -> 52 s. (systems: the travel node; nothing
 *      new to build if B2 is reconciled as the bible's B2, plan.js NEEDS 'bm:b2'.)
 * Leg 5's other beats keep their budgets; 'clock-returns' and the two before it still cover the Gauge's 150 s away.
 */
import { REST } from '../../world/island/sites.js';
import { PLACES, BEATS, BOOT_S, EXIT_LAUNCH_S, JOG_MS, HUT_FROM_B2_M, beatsOfLeg } from './plan.js';

const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const r1 = (v) => Math.round(v * 10) / 10;

/** The hut's place: on the line from B2 to the stud, 40 m from B2 (engine x, z): plan.js PLACES.fishingHut since R8 is wired. */
export { HUT_FROM_B2_M };
export const HUT_R8 = PLACES.fishingHut;
/** The cistern's Brazier (the home Brazier stands at REST's seat): plan.js PLACES.brazier. */
export const BRAZIER_R8 = Object.freeze({ id: 'cistern', x: REST.x, z: REST.z });
/** What a rest costs on the clock of the run (the dialog, the fade out and in, standing up), seconds (*). */
export const REST_S = 12;
/** What WALK THE LINE costs (the card, the fade, the arrival), seconds (*; leg 4's walk-the-line beat holds the same). */
export const TRAVEL_S = 6;
/** What a beat keeps over its own walking and acts, seconds (rule 13's room to wait or re-place), at least. */
export const MARGIN_S = 10;

/** The proposed budgets (only the beats that change), each with the walks and acts it covers. */
export const R8_BEATS = Object.freeze({
  'gauge-tide': Object.freeze({ from: 275, to: 60, owner: 'instruments (gauge.js), systems (braziers), writing (W3)',
    walks: Object.freeze([['guildStud', 'brazier'], ['brazier', 'gauge']]), actsS: REST_S }),
  'hand-net': Object.freeze({ from: 50, to: 40, owner: 'world (area A places the hut)',
    walks: Object.freeze([['guildStud', 'hut']]), actsS: 5 }),
  'oro-yards': Object.freeze({ from: 72, to: 52, owner: 'systems (B2 a travel node)',
    walks: Object.freeze([['hut', 'b2'], ['b1', 'oro']]), actsS: TRAVEL_S + 12 }),
});

const PL = Object.freeze({ ...PLACES, hut: HUT_R8, brazier: BRAZIER_R8 });

/** Each changed beat: its walking (m, s at a jog), its acts, its new budget and what is left over. */
export function r8Beats() {
  return Object.fromEntries(Object.entries(R8_BEATS).map(([id, b]) => {
    const m = b.walks.reduce((s, [a, c]) => s + d(PL[a], PL[c]), 0), need = m / JOG_MS + b.actsS;
    return [id, { ...b, metres: r1(m), walkS: r1(m / JOG_MS), needS: r1(need), spareS: r1(b.to - need), fits: b.to >= need + MARGIN_S }];
  }));
}

/** A leg's beat budgets, wave 1 (each wired beat's `wave1S`) or with R8 (plan.js's budgets, as wired). */
export function legBudget(leg, { r8 = false } = {}) {
  return beatsOfLeg(leg).reduce((s, b) => s + (r8 ? b.budgetS : (b.wave1S ?? b.budgetS)), 0);
}

/** Is R8 wired? Each changed beat's plan budget is R8's `to` and its `wave1S` R8's `from`; no other beat moved. */
export function r8Wired() {
  const off = [];
  for (const b of BEATS) {
    const r = R8_BEATS[b.id];
    if (r ? b.budgetS !== r.to || b.wave1S !== r.from : b.wave1S != null) off.push(b.id);
  }
  const hut = PLACES.fishingHut, b2 = PLACES.b2;
  return { ok: !off.length && Math.abs(d(hut, b2) - HUT_FROM_B2_M) < 0.1 && PLACES.brazier?.x === REST.x && PLACES.brazier?.z === REST.z, off };
}

/** An exit launch of two legs (their budgets and two boots) against EXIT_LAUNCH_S. */
export function pairS(a, b, opts = {}) {
  const s = legBudget(a, opts) + legBudget(b, opts) + 2 * BOOT_S;
  return { legs: [a, b], s, fits: s <= EXIT_LAUNCH_S, spareS: EXIT_LAUNCH_S - s };
}

/** The whole proposal's numbers: per-leg budgets before and after, both pairs, the changed beats. */
export function r8Report() {
  const legs = Object.fromEntries([4, 5, 6].map((l) => [l, { wave1: legBudget(l), r8: legBudget(l, { r8: true }) }]));
  return {
    legs, beats: r8Beats(), hut: HUT_R8, brazier: BRAZIER_R8,
    pairs: { wave1: [pairS(4, 5), pairS(5, 6)], r8: [pairS(4, 5, { r8: true }), pairS(5, 6, { r8: true })] },
    leg5: { wave1: legs[5].wave1 + BOOT_S, r8: legs[5].r8 + BOOT_S, bar: EXIT_LAUNCH_S },
    beatsTotal: BEATS.length,
  };
}
