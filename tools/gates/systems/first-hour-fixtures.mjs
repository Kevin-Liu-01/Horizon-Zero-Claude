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
 *                owned, the line on walls 1-4, the Holds untrue; "The Scar" is recorded as done through 'seal-2'
 */
import { QuestSpine } from '../../../src/game/quest/spine.js';
import { makeRecord } from '../../../src/game/save/format.js';
import { SCAR_STAGES, SCAR_ID, ORO_KIT } from '../../../src/game/quest/scar-plan.js';
import { CISTERN, siteById } from '../../../src/world/island/sites.js';
import { heightAt } from '../../../src/world/island/recipe.js';
import { strings } from './lib.mjs';

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

const CISTERN_REST = { id: 'cistern', x: CISTERN.x + 0.6, y: 2.1, z: CISTERN.z - 0.7, yaw: 2.36, hour: 7 };

function sliceEnd() {
  return {
    hour: 9.399, weather: 'trade', place: 'SALTROW',
    quest: sliceDone(),
    satchel: { 'metal-shards': 30, 'ridge-wood': 2 },
    ammo: { hunter: 14, hardpoint: 4 },
    position: { x: -262.647, y: 4.885, z: 217.625, yaw: 0, pitch: 0, heading: 0 },
    vitals: { health: 100, maxHealth: 100, gourd: 2, maxGourd: 2 },
    triangles: ['T1-T2-T6'],
    braziers: { lit: ['cistern'], unlocked: ['t1'], lastRest: CISTERN_REST },
    tolerance: 'standard',
    loadout: { weapon: 'sabina-bow', activeAmmo: { 'sabina-bow': 'hunter' }, rung: 'scout', wear: 'pan-2', quick: ['sabina-bow', 'lance', null, null] },
  };
}

export function fixture(leg, { savedAt = 1_700_000_000_000 } = {}) {
  if (leg === 2) return makeRecord(sliceEnd(), { kind: 'named', reason: 'fixture-leg2', slot: 1, savedAt });
  if (leg === 3) {
    const nw = siteById('ninewalls');
    const s = sliceEnd();
    const through = SCAR_STAGES.map((x) => x.id);
    const x = nw.x + 8, z = nw.z + 40;   // the recipe's ground there, so the floor search starts on it
    return makeRecord({
      ...s, hour: 11.0, place: 'NINEWALLS',
      // south of the walls, on the Scar's side: B1 is about 70 m on
      position: { x, y: heightAt(x, z) + 0.05, z, yaw: 0, pitch: 0, heading: 0 },
      vitals: { health: 72, maxHealth: 100, gourd: 1, maxGourd: 2 },
      areas: {
        kit: { gaff: true, windwall: true, pots: { brine: 2, cinder: 1 }, given: ORO_KIT.map(([id, n]) => [id, n]) },
        walls: { cut: [], painted: ['wall-1', 'wall-2', 'wall-3', 'wall-4'] },
        regions: { holds: { true: false } },
        quests: { [SCAR_ID]: { done: true, through, at: 'seal-2' } },
      },
    }, { kind: 'checkpoint', reason: 'seal-2', slot: 1, savedAt });
  }
  throw new Error(`no fixture for leg ${leg} (leg 1 starts from New Game)`);
}
