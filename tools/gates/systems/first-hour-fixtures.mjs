/**
 * The first-hour run's FIXTURE SAVES (Milestone 2 §3.6): a leg run alone starts from the record its fixture builds here,
 * so a lane can run leg 2 or leg 3 without replaying the legs before it. Each is a real v6 record (src/game/save/format.js
 * makeRecord), its quest a real QuestSpine serialize walked on the events the runtime sends (as quest-spine.test.mjs
 * walks it). Checked by node --test tools/gates/systems/first-hour-fixtures.test.mjs; written into the page's
 * localStorage by tools/gates/systems/first-hour.mjs.
 *
 *   fixture(2)   the slice's end: "Raker's Morning" done and rewarded (the Scout, salt), at Ansel's door in Saltrow at
 *                09:24 (the 72296aa slice run's save-continue read: hour 9.399, x -262.6, z 217.6), no `areas` (a slice
 *                save: every Milestone 2 field fresh, Q5)
 *   fixture(3)   after the Screed fight (a silent checkpoint, 'seal-2'): at Ninewalls' south gate at 11:00, Oro's kit
 *                owned, the line on walls 1-4, the Holds untrue; "The Scar" a real spine record walked to its end and
 *                "True Ground" begun at 'scar' (the record the 'seal-2' checkpoint writes: the stage after is entered first)
 * Wave 3: the slice's end carries the makings of one batch of Barbed arrows (cane x2, a feather, obsidian x2: combat's
 * 'hardpoint' recipe), which a Peg crossing leaves her with; leg 2's 'barbed' beat quick-makes them.
 */
import { QuestSpine } from '../../../src/game/quest/spine.js';
import { makeRecord } from '../../../src/game/save/format.js';
import { SCAR_STAGES, SCAR_ID, ORO_KIT, TRUE_GROUND_ID, TRUE_GROUND_STAGES, SCAR_REWARD, TRUE_GROUND_REWARD, FAIL_SOFT } from '../../../src/game/quest/scar-plan.js';
import { CISTERN, siteById } from '../../../src/world/island/sites.js';
import { heightAt } from '../../../src/world/island/recipe.js';
import { strings, questStrings } from './lib.mjs';

const RUN = [
  { at: 'pans' },
  ...Array.from({ length: 10 }, () => ({ ev: 'gathered', e: { source: 'rake', n: 1 } })),
  { at: 'gauge', aim: 'gauge', dt: 0.5 }, { dt: 0.5 },
  { aim: null, talk: 'ansel' }, { ev: 'scene-done', e: { scene: 'tell', exit: true } },
  ...Array.from({ length: 6 }, () => ({ ev: 'gathered', e: { source: 'cane', n: 1 } })),
  { ev: 'ammo-crafted', e: { ammo: 'hunter', n: 10 } },
  { talk: 'mise' }, { ev: 'scene-done', e: { scene: 'mise', exit: true } },
  { at: 'crossed' },
  { at: 't1', up: 3 },
  { aim: 'T2', dt: 0.6 }, { dt: 0.6 }, { aim: 'T6', dt: 0.6 }, { dt: 0.6 },
  { at: 'ditch', aim: null, up: 0 },
  { ev: 'plumb-hit' }, { ev: 'plumb-topple', e: { kind: 'plumb' } },
  { ev: 'part-torn', e: { kind: 'plumb', part: 'bob' } },
  { talk: 'ansel' }, { ev: 'scene-done', e: { scene: 'return', exit: true } },
];

/** "Raker's Morning" walked to its reward; returns the spine's serialize(). */
export function sliceDone() {
  const spine = new QuestSpine({ strings: strings() }).start();
  const w = { at: null, up: 0, aiming: null };
  const probe = { near: (a, r, up = 0) => w.at === a && w.up >= up, aim: (t) => w.aiming === t, bearing: (t) => ({ T2: 77, T6: 21 })[t] ?? 0 };
  for (const s of RUN) {
    if (s.at !== undefined) { w.at = s.at; w.up = s.up ?? 0; }
    if (s.aim !== undefined) w.aiming = s.aim;
    if (s.ev) spine.notify(s.ev, s.e || {});
    if (s.talk) spine.talk(s.talk);
    spine.update(s.dt ?? 0.1, probe);
  }
  if (!spine.done) throw new Error(`fixture: the slice's spine stopped at ${spine.current()?.id}`);
  return spine.serialize();
}

/** "The Scar" walked to its end on its own events, and "True Ground" begun: their serialize() as the save seam carries them. */
export function scarDone() {
  const mk = (id, stages, reward, extra = {}) => new QuestSpine({ strings: questStrings(id), id, stages, reward, triangles: {}, closingCard: null, ...extra });
  const tg = mk(TRUE_GROUND_ID, TRUE_GROUND_STAGES, TRUE_GROUND_REWARD);
  const scar = new QuestSpine({ strings: questStrings(SCAR_ID), id: SCAR_ID, stages: SCAR_STAGES, reward: SCAR_REWARD, triangles: {}, closingCard: null, failSoft: FAIL_SOFT,
    hooks: { done: () => tg.start() } }).start();
  const probe = { near: () => false, aim: () => false, bearing: () => 0 };
  for (const [ev, e] of [['region-enter', { region: 'holds' }], ['herd-lee', { inShadow: true }], ['plumb-topple', { kind: 'plumb' }],
    ['ammo-crafted', { ammo: 'hardpoint', n: 6 }], ['talk', 'oro'], ['scene-done', { scene: 'hand-over', exit: true }],
    ['screed-stalled', {}], ['seal-off', { seal: 'sealL' }], ['seal-off', { seal: 'sealR' }]]) {
    if (ev === 'talk') scar.talk(e); else scar.notify(ev, e);
    scar.update(0.1, probe);
  }
  if (!scar.done || !tg.started) throw new Error(`fixture: "The Scar" stopped at ${scar.current()?.id}`);
  return { [SCAR_ID]: scar.serialize(), [TRUE_GROUND_ID]: tg.serialize() };
}

/**
 * (M2 fix wave) "The Scar" walked through `through` (stage ids, in order) on its own events and waiting at the stage after:
 * a mid-leg record, as the checkpoint at that stage's start writes it (every stage of the Scar is a checkpoint). Only the
 * walk and the herd for now: fixture(2, { from: 'plumb-2' }).
 */
export function scarThrough(through) {
  const scar = new QuestSpine({ strings: questStrings(SCAR_ID), id: SCAR_ID, stages: SCAR_STAGES, reward: SCAR_REWARD, triangles: {}, closingCard: null, failSoft: FAIL_SOFT }).start();
  const probe = { near: () => false, aim: () => false, bearing: () => 0 };
  const EV = { walk: [['region-enter', { region: 'holds' }]], herd: [['herd-lee', { inShadow: true }]], 'plumb-2': [['plumb-topple', { kind: 'plumb' }]],
    barbed: [['ammo-crafted', { ammo: 'hardpoint', n: 6 }]], oro: [['talk', 'oro'], ['scene-done', { scene: 'hand-over', exit: true }]] };
  for (const id of through) {
    const evs = EV[id];
    if (!evs) throw new Error(`fixture: no event to walk '${id}'`);
    for (const [ev, e] of evs) { if (ev === 'talk') scar.talk(e); else scar.notify(ev, e); scar.update(0.1, probe); }
  }
  const at = scar.current()?.id;
  if (at !== SCAR_STAGES[through.length]?.id) throw new Error(`fixture: "The Scar" is at ${at}, not ${SCAR_STAGES[through.length]?.id}`);
  const tg = new QuestSpine({ strings: questStrings(TRUE_GROUND_ID), id: TRUE_GROUND_ID, stages: TRUE_GROUND_STAGES, reward: TRUE_GROUND_REWARD, triangles: {}, closingCard: null });
  return { [SCAR_ID]: scar.serialize(), [TRUE_GROUND_ID]: tg.serialize() };
}

/**
 * Where a mid-leg record stands: at 'plumb-2', where the herd beat leaves her (exit run 2 at fa45e47: x -69.0, z 155.0);
 * (M2 fix wave 2) at 'stall', by Oro at the tube mouth with his kit owned (hour.js grants it on load when 'oro' is done)
 */
const MID = Object.freeze({
  'plumb-2': Object.freeze({ through: ['walk', 'herd'], x: -69.0, z: 155.0, hour: 10.2 }),
  stall: Object.freeze({ through: ['walk', 'herd', 'plumb-2', 'barbed', 'oro'], x: 3.0, z: 206.5, hour: 10.6, kit: true }),
});

/** The nine walls as the walls seam saves them (ninewalls-layout.js wallsSave: { [id]: { state, painted } }). */
const WALLS_LINE_ON_1_4 = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`wall-${i + 1}`, { state: 'whole', painted: i < 4 }]));

const CISTERN_REST = { id: 'cistern', x: CISTERN.x + 0.6, y: 2.1, z: CISTERN.z - 0.7, yaw: 2.36, hour: 7 };

function sliceEnd() {
  return {
    hour: 9.399, weather: 'trade', place: 'SALTROW',
    quest: sliceDone(),
    satchel: { 'metal-shards': 30, 'ridge-wood': 2, feather: 1, obsidian: 2 },
    ammo: { hunter: 14, hardpoint: 4 },
    position: { x: -262.647, y: 4.885, z: 217.625, yaw: 0, pitch: 0, heading: 0 },
    vitals: { health: 100, maxHealth: 100, gourd: 2, maxGourd: 2 },
    triangles: ['T1-T2-T6'],
    braziers: { lit: ['cistern'], unlocked: ['t1'], lastRest: CISTERN_REST },
    tolerance: 'standard',
    loadout: { weapon: 'sabina-bow', activeAmmo: { 'sabina-bow': 'hunter' }, rung: 'scout', wear: 'pan-2', quick: ['sabina-bow', 'lance', null, null] },
  };
}

export function fixture(leg, { savedAt = 1_700_000_000_000, from = null } = {}) {
  if (leg === 2 && from) {
    const m = MID[from];
    if (!m) throw new Error(`no mid-leg fixture from '${from}' (have: ${Object.keys(MID).join(', ')})`);
    const s = sliceEnd();
    return makeRecord({
      ...s, hour: m.hour, place: 'NINEWALLS',
      position: { x: m.x, y: heightAt(m.x, m.z) + 0.05, z: m.z, yaw: 0, pitch: 0, heading: 0 },
      ...(m.kit ? { ammo: { hunter: 14, hardpoint: 10 } } : {}),
      areas: { quests: scarThrough(m.through), ...(m.kit ? { kit: { gaff: true, windwall: true, pots: { brine: 2, cinder: 1 }, given: ORO_KIT.map(([id, n]) => [id, n]) }, walls: WALLS_LINE_ON_1_4 } : {}) },
    }, { kind: 'checkpoint', reason: `the-scar:stage:${from}`, slot: 1, savedAt });
  }
  if (leg === 2) return makeRecord(sliceEnd(), { kind: 'named', reason: 'fixture-leg2', slot: 1, savedAt });
  if (leg === 3) {
    const nw = siteById('ninewalls');
    const s = sliceEnd();
    const x = nw.x + 8, z = nw.z + 40;   // the recipe's ground there, so the floor search starts on it
    return makeRecord({
      ...s, hour: 11.0, place: 'NINEWALLS',
      // south of the walls, on the Scar's side: B1 is about 70 m on
      position: { x, y: heightAt(x, z) + 0.05, z, yaw: 0, pitch: 0, heading: 0 },
      vitals: { health: 72, maxHealth: 100, gourd: 1, maxGourd: 2 },
      areas: {
        kit: { gaff: true, windwall: true, pots: { brine: 2, cinder: 1 }, given: ORO_KIT.map(([id, n]) => [id, n]) },
        walls: WALLS_LINE_ON_1_4,
        regions: {},
        quests: scarDone(),
      },
    }, { kind: 'checkpoint', reason: 'seal-2', slot: 1, savedAt });
  }
  throw new Error(`no fixture for leg ${leg} (leg 1 starts from New Game)`);
}
