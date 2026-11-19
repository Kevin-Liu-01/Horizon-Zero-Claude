/**
 * THE QUEST STAGES SEAM for the rest of the first hour (Milestone 2, the shared seams). Owner: systems. Every area
 * listens; nobody else writes a stage or a string. Logic only, as `plan.js` is for "Raker's Morning": every word the
 * player reads will be in `src/game/text/quests/<quest>.json` under these stage ids (writing, W2), and the spine
 * refuses a stage that has no text, so these tables are not handed to a QuestSpine until the text lands.
 *
 * WAVE 1 (the blockout): ids, order, objective types and the EVENTS each stage waits for, so the areas emit the right
 * names from day 0. Nothing here is wired into the runtime yet. The first-hour runner
 * (tools/gates/systems/first-hour.mjs) names its beats by these ids and fails each one by name until it plays.
 *
 * Objective types beyond plan.js (talk, goto, sight, kill, gather, survey):
 *   event    { event, where? }      one ctx.events emit of that name (and payload match `where`)
 *   hold     { benchmark, s }       the re-survey: the Alidade held on the mark for `s` seconds of sim time (HR3)
 *   rest     { brazier, hour }      a rest at that Brazier with the dialog's hour pre-selected (HR5)
 *   read     { card }               Sighting on a far form reads exactly that card (HR6)
 *
 * EVENTS (payloads plain; the emitting area is named, every one goes through ctx.events):
 *   region-enter / region-leave {region}                  engine (src/core/regions.js via engine.attachRegions)
 *   herd-lee {inShadow: bool, plumb}                      instruments (the herd as moving cover)
 *   kit-given {items: [[id, n], ...]}                     combat (Oro's hand-over: gaff, windwall, brine x2, cinder x1)
 *   screed-stalled {wall}                                 instruments (the charge stopped on a wall)
 *   seal-off {seal: 'ram-1' | 'ram-2'}                    instruments (a hit part's state 'off')
 *   wall-cut {wall}                                       settlements (the fail-soft branch writes `cut`)
 *   resurvey-done {benchmark, bearings: [deg, deg, deg]}  systems (HR3)
 *   line-faded {walls: n}                                 settlements (true ground clears `painted`)
 *   rested {brazier, hour}                                systems (the Braziers)
 *   weather {state}                                       sky-look (environment.setWeather)
 *   sighted {card}                                        ui (the Sighting card's text)
 */

export const SCAR_ID = 'the-scar';
export const TRUE_GROUND_ID = 'true-ground';

/** The events this file names (a caller's emit of any other name for these beats is a bug the runner reports). */
export const EVENTS = Object.freeze([
  'region-enter', 'region-leave', 'herd-lee', 'kit-given', 'screed-stalled', 'seal-off', 'wall-cut',
  'resurvey-done', 'line-faded', 'rested', 'weather', 'sighted',
]);

/** Oro's hand-over, exactly (HR2). */
export const ORO_KIT = Object.freeze([['gaff', 1], ['windwall', 1], ['brine-pot', 2], ['cinder-pot', 1]]);

/** The Transit card, exactly (HR6). The separator is U+00B7. */
export const TRANSIT_CARD = 'TRANSIT · BASELINE · STATION 1 OF 9';

/** "The Scar" (0:21-0:45): the walk to the Holds and the Screed on Ninewalls. Leg 2 of the first-hour run. */
export const SCAR_STAGES = Object.freeze([
  // the walk from Saltrow to the Holds (256 m, about 60 m of climb)
  { id: 'walk', type: 'event', event: 'region-enter', where: { region: 'holds' }, anchor: 'ninewalls-rise' },
  // a Tiller herd cores up the slope between her and the second Plumb: its hulls are moving cover
  { id: 'herd', type: 'event', event: 'herd-lee', where: { inShadow: true }, anchor: 'barranco' },
  // the second Plumb, painting the pit walls from the terrace above Ninewalls
  { id: 'plumb-2', type: 'kill', kind: 'plumb', mode: 'topple', count: 1, anchor: 'terrace' },
  // Barbed arrows made from Peg pins
  { id: 'barbed', type: 'gather', ammo: 'barbed', count: 1, anchor: null },
  // Oro hands over the gaff, the Windwall, two Brine Pots and one Cinder Pot
  { id: 'oro', type: 'talk', npc: 'oro', scene: 'hand-over', anchor: 'oro', gives: ORO_KIT },
  // the Screed (3.8 m) stalled once on a wall
  { id: 'stall', type: 'event', event: 'screed-stalled', anchor: 'ninewalls' },
  // the first ram seal off
  { id: 'seal-1', type: 'event', event: 'seal-off', where: { seal: 'ram-1' }, anchor: 'ninewalls' },
  // the second ram seal off; a silent checkpoint after the fight (the save leg 3 starts from)
  { id: 'seal-2', type: 'event', event: 'seal-off', where: { seal: 'ram-2' }, anchor: 'ninewalls', checkpoint: true },
].map((s) => Object.freeze(s)));

/** The fail-soft branch (HR2): the Screed cuts the third wall and the quest continues to 'seal-2'. */
export const FAIL_SOFT = Object.freeze({ event: 'wall-cut', wall: 3, continuesTo: 'seal-2' });

/** "True Ground" (0:45-0:55): the re-survey, the rest, calima at noon and the Transit. Leg 3. */
export const TRUE_GROUND_STAGES = Object.freeze([
  // follow the Scar's straight line to Benchmark 1
  { id: 'scar', type: 'goto', anchor: 'b1', radius: 6 },
  // hold the Alidade on the mark 15 s and take three bearings while Instruments come to look
  { id: 'survey', type: 'hold', benchmark: 'bm-01', s: 15, bearings: 3, anchor: 'b1' },
  // Ninewalls becomes true ground: the line fades from the walls and the Screeds stand down
  { id: 'fade', type: 'event', event: 'line-faded', anchor: 'ninewalls' },
  // kindle the Ninewalls Brazier and rest; the dialog pre-selects noon
  { id: 'rest-noon', type: 'rest', brazier: 'ninewalls', hour: 12, anchor: 'ninewalls-brazier' },
  // calima at noon over the Holds; cross to the Malpais edge
  { id: 'calima-cross', type: 'event', event: 'region-enter', where: { region: 'malpais' }, anchor: 'malpais-edge' },
  // read the far form in haze
  { id: 'read-transit', type: 'read', card: TRANSIT_CARD, window: [11.5, 12.5], anchor: 'malpais-edge' },
].map((s) => Object.freeze(s)));

/** The fourteen new beats of the first-hour run, in order (legs 2 and 3). */
export const NEW_BEATS = Object.freeze([...SCAR_STAGES.map((s) => s.id), ...TRUE_GROUND_STAGES.map((s) => s.id)]);
