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

/**
 * "The Scar" (0:21-0:45): the walk to the Holds and the Screed on Ninewalls. Leg 2 of the first-hour run.
 * Wave 3 (behaviour): each stage names what it plays (scenes, Brea's turns, cards) and what the runtime stands up for
 * it (`spawn`: the herd and the second Plumb on the terrace, Oro at the tube mouth, the Screed on the walls), as
 * plan.js does for "Raker's Morning". Every word is in src/game/text/quests/the-scar.json under these ids.
 */
export const SCAR_STAGES = Object.freeze([
  // the walk from Saltrow to the Holds (256 m, about 60 m of climb); the herd and the Plumb stand up as she goes
  { id: 'walk', type: 'event', event: 'region-enter', where: { region: 'holds' }, anchor: 'ninewalls-rise',
    turns: { start: 'walk-out', done: 'holds-seen' } },
  // a Tiller herd cores up the slope between her and the second Plumb: its hulls are moving cover
  { id: 'herd', type: 'event', event: 'herd-lee', where: { inShadow: true }, anchor: 'barranco', spawn: 'herd',
    turns: { start: 'herd-seen', done: 'in-the-lee' }, timed: [{ after: 14, turn: 'herd-bearing' }] },
  // the second Plumb, painting the pit walls from the terrace above Ninewalls
  { id: 'plumb-2', type: 'kill', kind: 'plumb', mode: 'topple', count: 1, anchor: 'terrace',
    turns: { done: 'plumb-2-down' }, sighting: 'plumb' },
  // Barbed arrows made from Peg pins
  // (the Barbed arrow's ammo id is combat's 'hardpoint': src/combat/weapons.js AMMO)
  { id: 'barbed', type: 'gather', ammo: 'hardpoint', count: 1, anchor: null, turns: { done: 'barbed-made' } },
  // Oro hands over the gaff, the Windwall, two Brine Pots and one Cinder Pot
  { id: 'oro', type: 'talk', npc: 'oro', scene: 'hand-over', anchor: 'oro', gives: ORO_KIT, spawn: 'oro',
    turns: { start: 'find-oro' } },
  // the Screed (3.8 m) stalled once on a wall
  { id: 'stall', type: 'event', event: 'screed-stalled', anchor: 'ninewalls', spawn: 'screed',
    turns: { start: 'wall-trick', done: 'stalled' } },
  // the first ram seal off (either seal: the Screed's parts are sealL and sealR)
  { id: 'seal-1', type: 'event', event: 'seal-off', anchor: 'ninewalls', turns: { done: 'one-seal' } },
  // the second ram seal off; a silent checkpoint after the fight (the save leg 3 starts from); Oro's line
  { id: 'seal-2', type: 'event', event: 'seal-off', anchor: 'ninewalls', checkpoint: true,
    scenes: { done: 'stood-down' } },
].map((s) => Object.freeze({ checkpoint: true, ...s })));

/** The fail-soft branch (HR2): the Screed cuts the third wall and the quest continues to 'seal-2'. */
export const FAIL_SOFT = Object.freeze({
  event: 'wall-cut', wall: 3, where: Object.freeze({ wall: 3 }), from: Object.freeze(['stall', 'seal-1', 'seal-2']),
  continuesTo: 'seal-2', turn: 'wall-cut',
});

/** What "The Scar" pays (bible 11.2): salt x60; Oro's kit is hers to keep; the Ninewalls counter opens. */
export const SCAR_REWARD = Object.freeze({ items: Object.freeze([['metal-shards', 60]]), opens: 'ninewalls-counter' });

/** "True Ground" (0:45-0:55): the re-survey, the rest, calima at noon and the Transit. Leg 3. */
export const TRUE_GROUND_STAGES = Object.freeze([
  // follow the Scar's straight line to Benchmark 1
  { id: 'scar', type: 'goto', anchor: 'b1', radius: 6, turns: { start: 'scar-line', done: 'on-the-mark' } },
  // hold the Alidade on the mark 15 s and take three bearings while Instruments come to look
  { id: 'survey', type: 'hold', benchmark: 'bm-01', s: 15, bearings: 3, anchor: 'b1', spawn: 'lookers',
    cards: ['resurvey'], turns: { done: 'true' } },
  // Ninewalls becomes true ground: the line fades from the walls and the Screeds stand down
  { id: 'fade', type: 'event', event: 'line-faded', anchor: 'ninewalls', turns: { done: 'line-gone' } },
  // kindle the Ninewalls Brazier and rest; the dialog pre-selects noon
  { id: 'rest-noon', type: 'rest', brazier: 'ninewalls', hour: 12, anchor: 'ninewalls-brazier' },
  // calima at noon over the Holds; cross to the Malpais edge
  { id: 'calima-cross', type: 'event', event: 'region-enter', where: { region: 'malpais' }, anchor: 'malpais-edge' },
  // read the far form in haze
  { id: 'read-transit', type: 'read', card: TRANSIT_CARD, window: [11.5, 12.5], anchor: 'malpais-edge', sighting: 'transit' },
].map((s) => Object.freeze({ checkpoint: true, ...s })));

/** What "True Ground" pays (bible 11.2): the travel node at Benchmark 1; the hour-2 quests open. */
export const TRUE_GROUND_REWARD = Object.freeze({ items: Object.freeze([]), node: 'bm-01' });

/**
 * THE RE-SURVEY AT BENCHMARK 1 (HR3; bible 11.2 0:45, 8.5): the three marks B1 bears on (HR0 at f6d3567: T1, T2 and the
 * Sounding Ring stand with their tops clear of the ground and the walls from B1's eye, trade weather; the Roque too).
 * The rule itself is src/game/resurvey/rules.js; the live half src/game/resurvey/live.js.
 */
export const RESURVEY = Object.freeze({
  benchmark: 'bm-01', marks: Object.freeze(['T1', 'T2', 'sounding-ring']), holdS: 15, onDeg: 3, bearingDeg: 2.5,
  hitDamage: 10, padR: 2.4,
  /** Instruments come to look: at least `lookers` leave their stations within `leaveS` and are within `nearM` by `arriveS` */
  lookers: 2, leaveS: 5, nearM: 20, arriveS: 12,
});

/** The fourteen new beats of the first-hour run, in order (legs 2 and 3). */
export const NEW_BEATS = Object.freeze([...SCAR_STAGES.map((s) => s.id), ...TRUE_GROUND_STAGES.map((s) => s.id)]);
