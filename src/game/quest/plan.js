/**
 * RAKER'S MORNING — the beat logic (BIBLE 11.2, 0:00 to the reward; BUILD M1.6a). Logic only: every word the
 * player reads is in `src/game/text/quests/rakers-morning.json` and is looked up by the stage, scene, card and
 * turn ids named here. Stage ids and order are the text's own (15 stages); this table adds what each one waits
 * for and what it plays.
 *
 * Objective types (bible: talk, goto, sight, kill, gather, survey):
 *   talk    { npc, scene }          the scene with that speaker is played to its end (or its exit station)
 *   goto    { anchor, radius, up? } Brea within `radius` m of the anchor (and `up` m above its ground, for a climb)
 *   sight   { target }              the Alidade is up and held on the target for `hold` s
 *   kill    { kind, mode, count }   mode 'kill' (machine-killed), 'topple' (plumb-topple), 'pry' (part-torn: bob)
 *   gather  { item | ammo, count }  item-gained of that item, or ammo-crafted of that ammo
 *   survey  { pillars }             from the pillar top, the Alidade held on each named pillar for `hold` s
 *
 * Each stage may name:
 *   anchor    where its marker stands (the runtime resolves anchors to world positions)
 *   cards     tutorial card ids shown one at a time when the stage starts (text/cards/tutorial.json)
 *   turns     { start, done } Brea's field turns (text breaAlone `on` ids)
 *   scenes    { start, done } scenes played when the stage starts or ends
 *   with      a stage that runs alongside this one (the optional lamp count runs with the crossing)
 *   optional  never blocks; closed with its count when the stage it runs with ends
 *   flagVariant  the stage's log reads `logFlagged` if Brea was Flagged during it
 *   checkpoint   a silent checkpoint is written when the stage completes (BIBLE 17: "a completed quest stage")
 */
export const QUEST_ID = 'rakers-morning';

export const STAGES = Object.freeze([
  { id: 'wake', type: 'goto', anchor: 'pans', radius: 9,
    turns: { start: 'wake' }, cards: [], scenes: { done: 'pan' }, timed: [{ after: 6, turn: 'kite-overhead' }] },
  { id: 'rake', type: 'gather', item: 'metal-shards', count: 10, anchor: 'pans', source: 'rake',
    cards: ['salt'], scenes: { done: 'pan-done' } },
  { id: 'read', type: 'sight', target: 'gauge', hold: 0.8, anchor: 'gauge',
    cards: ['alidade', 'lamp'], scenes: { start: 'flood' }, turns: { done: 'gauge-seen' }, sighting: 'gauge' },
  { id: 'tell', type: 'talk', npc: 'ansel', scene: 'tell', anchor: 'ansel' },
  { id: 'cane', type: 'gather', item: 'ridge-wood', count: 6, anchor: 'cane', source: 'cane',
    scenes: { start: 'cane' }, turns: { done: 'cane-cut' } },
  { id: 'make', type: 'gather', ammo: 'hunter', count: 1, anchor: null, cards: ['make'] },
  { id: 'mise', type: 'talk', npc: 'mise', scene: 'mise', anchor: 'mise' },
  { id: 'cross', type: 'goto', anchor: 'crossed', radius: 14, with: 'lamps', flagVariant: true,
    cards: ['transect', 'reeds', 'steady', 'flagged'], turns: { start: 'transect-seen' },
    spawn: 'transect', timed: [{ after: 25, turn: 'meadow' }] },
  { id: 'lamps', type: 'kill', kind: 'peg', mode: 'kill', count: 9, optional: true, anchor: 'transect' },
  { id: 'climb', type: 'goto', anchor: 't1', radius: 3.2, up: 2.6, cards: ['pillar'], turns: { done: 't1-top' } },
  { id: 'sight', type: 'survey', pillars: ['T2', 'T6'], hold: 1.0, anchor: 't1',
    turns: { done: 'triangle' }, after: { turn: 'skyline', delay: 4 }, triangle: 'T1-T2-T6' },
  { id: 'ditch', type: 'goto', anchor: 'ditch', radius: 8, spawn: 'plumb',
    turns: { start: 'plumb-seen', done: 'ditch' }, timed: [{ after: 5, turn: 'line-seen' }, { after: 10, turn: 'line-seen-2' }],
    cards: ['weak'] },
  { id: 'topple', type: 'kill', kind: 'plumb', mode: 'topple', count: 1, anchor: 'station',
    turns: { done: 'toppled' }, cards: ['pry'], sighting: 'plumb' },
  { id: 'pry', type: 'kill', kind: 'plumb', mode: 'pry', count: 1, anchor: 'station', turns: { done: 'bob-pried' } },
  { id: 'return', type: 'talk', npc: 'ansel', scene: 'return', anchor: 'ansel-home' },
].map((s) => Object.freeze({ checkpoint: true, ...s })));

/** What the quest pays (BIBLE 11.2): rung 2 and salt x30; the Brazier at T1 can then be kindled. */
export const REWARD = Object.freeze({ rung: 'scout', items: Object.freeze([['metal-shards', 30]]), unlockBrazier: 't1' });

/** Event-driven field turns that are not tied to a stage start or end. */
export const TURN_EVENTS = Object.freeze({
  'peg-lamp-out': 'first Peg killed during the crossing',
  flagged: 'the first Flag of the run',
  'crossed-unseen': 'the crossing ends with no Flag',
  'vial-hit': 'the first arrow on the Plumb',
  chime: 'plumb-chime',
  'plumb-dark': 'the Plumb lamp darkened',
  'reed-enter': 'cover reported by the world (stub: not wired until M1.6e)',
});

/** Survey: the triangle T1 closes and the pillars it sights (BIBLE 3.4, 11.2). */
export const TRIANGLES = Object.freeze({ 'T1-T2-T6': Object.freeze(['T1', 'T2', 'T6']) });
