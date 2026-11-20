/**
 * The hour-two run's FIXTURE SAVES (Milestone 3 §3.6, area E): legs 4, 5 and 6 run alone start from the record built
 * here; rule 13 also runs each leg from the HANDOFF save the leg before wrote (tools/gates/systems/hour-two.mjs
 * --handoff). Each is a real v6 record (src/game/save/format.js makeRecord), its quests real QuestSpine serialize()s.
 * Checked by node --test tools/gates/systems/hour-two-fixtures.test.mjs.
 *
 *   fixture(4)   the first hour's end, as leg 3 writes it after the Transit read (a fixture while the first hour is not
 *                28/28 chained): "The Scar" and "True Ground" walked to their ends on their own events, at the Malpais
 *                edge (src/game/hour2/plan.js PLACES.malpaisEdge) at 12:19 in the asked calima, the Ninewalls Brazier lit
 *                and rested at, the line off the walls, Oro's kit less the pots a fight spends
 *   fixture(5)   after "A Line Over the Glass": the Survey Kite owned, at the Sounding Ring in trade weather. The kite
 *                quest's record is not written yet (its spine lands in wave 2): `areas.hour2` carries the plan's stage ids
 *                as done, which the runtime does not read today
 *   fixture(6)   after "The Wrong Tide" and the fishing hut: rung 3 owned, the Hand Net held, at the fishing hut
 * Fixtures 5 and 6 carry what their legs leave as plain fields under `areas.hour2` until the quests' spines exist; the
 * save seam's owners map them when the fields land (wave 1 skeleton: each beat fails by name anyway).
 */
import { QuestSpine } from '../../../src/game/quest/spine.js';
import { makeRecord } from '../../../src/game/save/format.js';
import { TRUE_GROUND_ID, TRUE_GROUND_STAGES, TRUE_GROUND_REWARD, TRANSIT_CARD, ORO_KIT } from '../../../src/game/quest/scar-plan.js';
import { heightAt } from '../../../src/world/island/recipe.js';
import { PLACES, BEATS, GLASS_LINE_ID, WRONG_TIDE_ID } from '../../../src/game/hour2/plan.js';
import { scarDone, fixture as firstHour } from './first-hour-fixtures.mjs';
import { questStrings } from './lib.mjs';
import { CertRules, actsFromQuests } from '../../../src/game/certs/rules.js';

/** "The Scar" done and "True Ground" walked to its end on its own events (the read at the Malpais edge). */
export function trueGroundDone() {
  const q = scarDone();
  const tg = new QuestSpine({ strings: questStrings(TRUE_GROUND_ID), id: TRUE_GROUND_ID, stages: TRUE_GROUND_STAGES, reward: TRUE_GROUND_REWARD, triangles: {}, closingCard: null });
  tg.restore(q[TRUE_GROUND_ID]);
  const near = { near: () => true, aim: () => false, bearing: () => 0 };
  tg.update(0.1, near);   // 'scar': on the mark
  for (const [ev, e] of [['resurvey-done', { benchmark: 'bm-01', bearings: [77, 21, 300] }], ['line-faded', { walls: 4 }],
    ['rested', { brazier: 'ninewalls', hour: 12 }], ['region-enter', { region: 'malpais' }], ['sighted', { card: TRANSIT_CARD }]]) {
    tg.notify(ev, e);
    tg.update(0.1, near);
  }
  if (!tg.done) throw new Error(`fixture: "True Ground" stopped at ${tg.current()?.id}`);
  return { ...q, [TRUE_GROUND_ID]: tg.serialize() };
}

const WALLS_TRUE = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`wall-${i + 1}`, { state: 'whole', painted: false }]));
const at = (p, yaw = 0) => ({ x: p.x, y: heightAt(p.x, p.z) + 0.05, z: p.z, yaw, pitch: 0, heading: 0 });
const NINEWALLS_REST = { id: 'ninewalls', x: -11, y: heightAt(-11, 213) + 0.05, z: 213, yaw: 0, hour: 12 };
const doneThrough = (leg) => BEATS.filter((b) => b.leg < leg).map((b) => b.id);

function firstHourEnd() {
  const f3 = firstHour(3);   // leg 3's start: its satchel, loadout and tolerance carry on
  const quests = trueGroundDone();
  // the certifications as the live half writes them (src/game/certs/live.js): counted from the quests' own records
  const C = new CertRules();
  for (const a of actsFromQuests(f3.quest, quests[TRUE_GROUND_ID])) C.count(a.act, { at: a.at });
  return {
    ...f3, hour: 12.32, weather: 'calima', place: 'MALPAIS',
    position: at(PLACES.malpaisEdge, 2.3),
    vitals: { health: 84, maxHealth: 115, gourd: 1, maxGourd: 2 },   // BALLAST I (+15) at the re-survey
    braziers: { lit: ['cistern', 'ninewalls'], unlocked: ['t1', 'ninewalls'], lastRest: NINEWALLS_REST },
    areas: {
      kit: { gaff: true, windwall: true, pots: { brine: 1, cinder: 0 }, given: ORO_KIT.map(([id, n]) => [id, n]) },
      walls: WALLS_TRUE,
      regions: { holds: { true: true, hour: 11.6 } },
      quests,
      certs: { ...C.serialize(), crossCounted: true },
    },
  };
}

export function fixture(leg, { savedAt = 1_700_000_000_000 } = {}) {
  if (leg === 4) return makeRecord(firstHourEnd(), { kind: 'checkpoint', reason: `${TRUE_GROUND_ID}:quest:done`, slot: 1, savedAt });
  if (leg === 5) {
    const s = firstHourEnd();
    return makeRecord({
      ...s, hour: 15.5, weather: 'trade', place: 'SALTROW', position: at(PLACES.ring),
      areas: { ...s.areas, hour2: { quests: { [GLASS_LINE_ID]: { done: true, rewarded: true } }, done: doneThrough(5), kite: true, sonde: 'cut' } },
    }, { kind: 'checkpoint', reason: `${GLASS_LINE_ID}:quest:done`, slot: 1, savedAt });
  }
  if (leg === 6) {
    const s = firstHourEnd();
    return makeRecord({
      ...s, hour: 9.0, weather: 'trade', place: 'SALTROW', position: at(PLACES.fishingHut),
      loadout: { ...s.loadout, rung: 'reckoner' },
      areas: { ...s.areas, hour2: { quests: { [GLASS_LINE_ID]: { done: true, rewarded: true }, [WRONG_TIDE_ID]: { done: true, rewarded: true } }, done: doneThrough(6), kite: true, sonde: 'cut', nets: { 'hand-net': 1 }, rungs: ['reckoner'] } },
    }, { kind: 'checkpoint', reason: `${WRONG_TIDE_ID}:quest:done`, slot: 1, savedAt });
  }
  throw new Error(`no hour-two fixture for leg ${leg} (legs 4-6)`);
}
