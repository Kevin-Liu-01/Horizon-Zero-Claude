// Milestone 2 §3.6 (area E, HR1's legs alone): the fixture saves legs 2 and 3 start from are real v6 records that the
// game reads (classify 'ok'), round-trip exactly through the store, and stand where the legs begin.
// Browser-free: node --test tools/gates/systems/first-hour-fixtures.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './first-hour-fixtures.mjs';
import { classify, makeRecord, VERSION } from '../../../src/game/save/format.js';
import { SaveStore, MemoryStorage } from '../../../src/game/save/store.js';
import { RegionMap } from '../../../src/core/regions.js';
import { ORO_KIT } from '../../../src/game/quest/scar-plan.js';

const map = new RegionMap().build();

for (const leg of [2, 3]) {
  test(`leg ${leg}'s fixture is a v${VERSION} record the game reads and round-trips`, () => {
    const rec = fixture(leg);
    assert.equal(classify(JSON.stringify(rec)), 'ok');
    const st = new SaveStore(new MemoryStorage());
    assert.equal(st.write(rec).ok, true);
    const back = st.read(1, rec.kind);
    assert.deepEqual(back, rec);
    assert.deepEqual(makeRecord(back, { kind: back.kind, reason: back.reason, slot: back.slot, savedAt: back.savedAt }), rec);
  });
}

test('leg 2 starts where the slice ends: the quest done and rewarded, the Scout owned, in the Pans, no Milestone 2 field', () => {
  const r = fixture(2);
  assert.equal(r.quest.done, true);
  assert.equal(r.quest.rewarded, true);
  assert.equal(r.loadout.rung, 'scout');
  assert.equal(r.areas, null);
  assert.equal(map.regionAt(r.position.x, r.position.z), 'pans');
});

test('leg 3 starts after the fight: Oro\'s kit owned exactly, the line on four walls, in the Holds, a checkpoint', () => {
  const r = fixture(3);
  assert.equal(r.kind, 'checkpoint');
  assert.equal(r.reason, 'seal-2');
  assert.deepEqual(r.areas.kit.given, ORO_KIT.map(([id, n]) => [id, n]));
  assert.deepEqual(Object.entries(r.areas.walls).filter(([, w]) => w.painted).map(([id]) => id), ['wall-1', 'wall-2', 'wall-3', 'wall-4']);
  assert.equal(map.regionAt(r.position.x, r.position.z), 'holds');
  // wave 3: real spine records, "The Scar" done through 'seal-2' and "True Ground" waiting at 'scar'
  assert.equal(r.areas.quests['the-scar'].done, true);
  assert.deepEqual(r.areas.quests['the-scar'].order.map((o) => o.id), ['walk', 'herd', 'plumb-2', 'barbed', 'oro', 'stall', 'seal-1', 'seal-2']);
  assert.equal(r.areas.quests['true-ground'].started, true);
  assert.equal(r.areas.quests['true-ground'].idx, 0);
});

test('(fix wave) the mid-leg record at plumb-2: "The Scar" walked through walk and herd, waiting at plumb-2, in the Holds', () => {
  const r = fixture(2, { from: 'plumb-2' });
  assert.equal(classify(JSON.stringify(r)), 'ok');
  const st = new SaveStore(new MemoryStorage());
  assert.equal(st.write(r).ok, true);
  assert.deepEqual(st.read(1, r.kind), r);
  const q = r.areas.quests['the-scar'];
  assert.deepEqual(q.order.map((o) => o.id), ['walk', 'herd']);
  assert.equal(q.done, false);
  assert.equal(map.regionAt(r.position.x, r.position.z), 'holds');
});
