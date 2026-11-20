/**
 * "A LINE OVER THE GLASS" (Ansel; the Survey Kite), THE PLAN (Milestone 3 wave 3, area B; BUILD M3.1, HT2). Pure data and
 * rules: no THREE, no DOM, no ctx, so Node walks it (tools/gates/kite/glass-line.test.mjs). The live quest is
 * ./glass-line.js; every word is src/game/text/quests/glass-line.json (W3).
 *
 * The stages are leg 4's beats of the hour-two run (./plan.js BEATS, leg 4, quest 'glass-line'), in the run's order, so
 * the runner reads `ctx.quests['glass-line'].report().reached` by the beat's own id:
 *   walk-the-line  on the guild-house stud, after WALK THE LINE to Benchmark 1 (the travel is the first hour's seam)
 *   ansel-kite     Ansel's scene 'kite' (TALK at Ansel)
 *   wreck          sailcloth cut from the wreck on the black beach ('gathered' { source: 'wreck', item: 'sailcloth' })
 *   cane-cord      cane x8 and cord x4 ('gathered' { source: 'cane-cord', n }: 12 in all)
 *   rebuild        the kite rebuilt at the guild house ('kite-rebuilt'): from here she carries it
 *   tether         the moored Sonde's tether cut at the Sounding Ring ('sonde-cut' { sonde: 'ring' })
 *   launch         the kite opened off T1's top ('kite:open' { from: 'T1' }, src/hero/kiteFlight.js)
 *   fly            down on the marked field below the Shelf ('kite:land' { field: true }; R3: the test flight is a glide
 *                  test to TEST_FLIGHT.field, src/game/kite/roads.js), at 3 m/s or less (the law's safe landing)
 *   kite-given     Ansel's scene 'kite-back'; the reward is the Survey Kite and nothing else
 * HT2: stages advance only on their events, in order; the Sonde's tether is cut BEFORE the flight: a kite opened while the
 * Sonde is still moored at the Ring is Flagged (`flightFlagged`), every time.
 */
import { GLASS_LINE_ID, PLACES } from './plan.js';

export { GLASS_LINE_ID };

/** What the quest pays: the Survey Kite, and nothing else (HT2). */
export const GLASS_LINE_REWARD = Object.freeze({ items: Object.freeze([['survey-kite', 1]]), item: 'survey-kite' });

/** cane x8 and cord x4 (BIBLE 11.3), counted together by the stage */
export const CANE_N = 8, CORD_N = 4;

/** The stages (QuestSpine's shape; each a checkpoint). Anchors are ./plan.js PLACES (engine x, z). */
export const GLASS_LINE_STAGES = Object.freeze([
  { id: 'walk-the-line', type: 'goto', anchor: 'guild-stud', radius: 8, turns: { done: 'line-walked' } },
  { id: 'ansel-kite', type: 'talk', npc: 'ansel', scene: 'kite', anchor: 'ansel' },
  { id: 'wreck', type: 'event', event: 'gathered', where: { source: 'wreck', item: 'sailcloth' }, anchor: 'wreck', turns: { start: 'wreck-seen', done: 'cloth-cut' } },
  { id: 'cane-cord', type: 'gather', source: 'cane-cord', count: CANE_N + CORD_N, anchor: 'wreck', turns: { done: 'canes-cut' } },
  { id: 'rebuild', type: 'event', event: 'kite-rebuilt', anchor: 'guild-stud', turns: { done: 'rebuilt' } },
  { id: 'tether', type: 'event', event: 'sonde-cut', where: { sonde: 'ring' }, anchor: 'sonde', turns: { start: 'sonde-seen', done: 'tether-cut' } },
  { id: 'launch', type: 'event', event: 'kite:open', where: { from: 'T1' }, anchor: 't1', turns: { start: 't1-top' } },
  { id: 'fly', type: 'event', event: 'kite:land', where: { field: true, safe: true }, anchor: 'field', turns: { done: 'landed' } },
  { id: 'kite-given', type: 'talk', npc: 'ansel', scene: 'kite-back', anchor: 'ansel' },
].map((s) => Object.freeze({ checkpoint: true, ...s })));

/** The stage the kite is in her hands from (she flies it for the test; the reward makes it hers). */
export const CARRIED_FROM = 'rebuild';

/** Where each anchor stands (engine x, z): the run's places; the field is R3's (src/game/kite/roads.js TEST_FLIGHT). */
export function anchorsOf(field) {
  return Object.freeze({
    'guild-stud': PLACES.guildStud, ansel: PLACES.ansel, wreck: PLACES.wreck, sonde: PLACES.sonde, t1: PLACES.t1,
    field: Object.freeze({ x: field.x, z: field.z }),
  });
}

/** Offered (the spine starts) once "True Ground" is done: hour two begins (HT2; the order of M3-BRIEFS §1). */
export const offered = (tg) => !!(tg && (tg.done === true || tg.report?.().done === true));

/**
 * HT2: a kite opened while the Sonde is moored at the Ring is Flagged. `spine` is the quest's spine (its 'tether' stage
 * done means the Sonde was cut); `moored` is the live Sonde's own word when there is one.
 */
export function flightFlagged(spine, moored = null) {
  if (moored != null) return !!moored;
  return spine?.st?.tether?.state !== 'done';
}

/** A landing the 'fly' stage takes: on the marked field at the law's safe speed (<= 3 m/s, 0 damage). */
export function landingEvent(land, safeVs = 3) {
  return { ...land, field: !!land.field, safe: (land.vs ?? Infinity) <= safeVs && !(land.damage > 0) };
}
