// Milestone 3 §3.6 (area E, HT1's legs alone and HT5's first rows): the fixture saves legs 4, 5 and 6 start from are
// real v6 records the game reads (classify 'ok'), round-trip exactly through the store, and stand where the legs
// begin; leg 4's is the first hour's end (both M2 quests done, at the Malpais edge in the asked calima).
// Browser-free: node --test tools/gates/systems/hour-two-fixtures.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './hour-two-fixtures.mjs';
import { classify, makeRecord, VERSION } from '../../../src/game/save/format.js';
import { SaveStore, MemoryStorage } from '../../../src/game/save/store.js';
import { RegionMap } from '../../../src/core/regions.js';
import { CertRules } from '../../../src/game/certs/rules.js';

const map = new RegionMap().build();

for (const leg of [4, 5, 6]) {
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

test('leg 4 starts where the first hour ends: both M2 quests done, in the Malpais at 12:19 in calima, BALLAST I and BEARING I held', () => {
  const r = fixture(4);
  assert.equal(r.areas.quests['the-scar'].done, true);
  assert.equal(r.areas.quests['true-ground'].done, true);
  assert.deepEqual(r.areas.quests['true-ground'].order.map((o) => o.id), ['scar', 'survey', 'fade', 'rest-noon', 'calima-cross', 'read-transit']);
  assert.equal(map.regionAt(r.position.x, r.position.z), 'malpais');
  assert.ok(map.depth('malpais', r.position.x, r.position.z) > 10, 'past the seam\'s enter band');
  assert.equal(r.weather, 'calima');
  assert.ok(r.hour > 12 && r.hour < 12.5);
  const C = new CertRules();
  assert.equal(C.restore(r.areas.certs), true);
  assert.deepEqual(C.ranks(), { transect: 0, bearing: 1, ballast: 1 });
  assert.equal(r.vitals.maxHealth, 115, 'Ballast I\'s +15 carried in the vitals, as a live record carries it');
  assert.ok(Object.values(r.areas.walls).every((w) => !w.painted), 'the line is off the walls');
});

test('legs 5 and 6 carry hour two\'s state in the hour2 field (kept by the save seam), in the Pans in trade weather', () => {
  const r5 = fixture(5), r6 = fixture(6);
  assert.equal(r5.areas.hour2.kite, true);
  assert.equal(r5.areas.hour2.sonde, 'cut');
  assert.equal(r5.areas.hour2.done.length, 10);
  assert.equal(r6.areas.hour2.done.length, 16);
  assert.equal(r6.loadout.rung, 'reckoner');
  assert.deepEqual(r6.areas.hour2.nets, { 'hand-net': 1 });
  for (const r of [r5, r6]) { assert.equal(r.weather, 'trade'); assert.equal(map.regionAt(r.position.x, r.position.z), 'pans'); }
});

test('(HT5, wave 1) a save from before M3 loads: the first hour\'s records carry no hour2 field and stay valid; hour2 survives a write and read', async () => {
  const { fixture: firstHour } = await import('./first-hour-fixtures.mjs');
  const { SaveFields } = await import('../../../src/game/save/fields.js');
  for (const leg of [2, 3]) {
    const r = firstHour(leg);
    assert.equal(classify(JSON.stringify(r)), 'ok');
    assert.equal(r.areas?.hour2 ?? null, null);
    const F = new SaveFields();
    let got = 'unset';
    F.register('hour2', { get: () => null, set: (v) => { got = v; } });
    F.apply(r.areas);
    assert.equal(got, null, `leg ${leg}: hour2 starts fresh`);
  }
  const r5 = fixture(5);
  const st = new SaveStore(new MemoryStorage());
  st.write(r5);
  assert.deepEqual(st.read(1, r5.kind).areas.hour2, r5.areas.hour2);
});
