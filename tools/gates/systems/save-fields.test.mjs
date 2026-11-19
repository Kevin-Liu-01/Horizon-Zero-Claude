// Milestone 2 (area E, HR7 in Node, the save seam): each area's { get, set } pair (src/game/save/fields.js) rides in a
// v6 record's optional `areas`; the round trip through the store is exact; a slice record (no `areas`) carries forward
// with every Milestone 2 field fresh (Q5's default); unknown and doubled field ids are refused.
// Browser-free: node --test tools/gates/systems/save-fields.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA_FIELDS, SaveFields, normaliseAreas } from '../../../src/game/save/fields.js';
import { makeRecord, classify, parse } from '../../../src/game/save/format.js';
import { SaveStore, MemoryStorage } from '../../../src/game/save/store.js';

const base = () => ({
  hour: 10.5, weather: 'trade', place: 'NINEWALLS', quest: null, satchel: { 'metal-shards': 4 }, ammo: { hunter: 6 },
  position: { x: -11, y: 71, z: 213 }, vitals: { health: 80, maxHealth: 100 }, triangles: ['T1-T2-T6'],
  braziers: { lit: ['cistern'], lastRest: null }, tolerance: 'standard', loadout: { rung: 'scout' },
});

function areas() {
  const live = {
    walls: { 'wall-3': { state: 'cut', painted: true }, 'wall-1': { state: 'whole', painted: false } },
    benchmarks: { 'bm-01': { surveyed: true, hour: 11.25 } },
    kit: { gaff: true, windwall: true, pots: { brine: 2, cinder: 1 } },
    regions: { holds: { true: true, hour: 11.25 } },
  };
  const F = new SaveFields();
  const got = {};
  for (const id of Object.keys(live)) F.register(id, { get: () => live[id], set: (v) => { got[id] = v; } });
  return { F, live, got };
}

test('the field ids are fixed; an unknown or a doubled id is refused', () => {
  assert.deepEqual(Object.keys(AREA_FIELDS).sort(), ['benchmarks', 'certs', 'counter', 'kit', 'quests', 'regions', 'walls']);
  const F = new SaveFields();
  assert.throws(() => F.register('holds-walls', { get() {}, set() {} }), /not one of/);
  F.register('walls', { get: () => 1, set() {} });
  assert.throws(() => F.register('walls', { get: () => 1, set() {} }), /twice/);
  assert.throws(() => F.register('kit', { get: () => 1 }), /needs/);
});

test('round trip: collect -> record -> store -> read -> apply hands each area exactly its state', () => {
  const { F, live, got } = areas();
  const st = new SaveStore(new MemoryStorage());
  const rec = makeRecord({ ...base(), areas: F.collect() }, { kind: 'checkpoint', reason: 'seal-2', savedAt: 1000 });
  assert.equal(st.write(rec).ok, true);
  const back = st.read(1, 'checkpoint');
  assert.ok(back);
  assert.deepEqual(back.areas, normaliseAreas(live));
  F.apply(back.areas);
  assert.deepEqual(got, live);
  // JSON-stable: build(read(write(build(s)))) deep-equals build(s)
  assert.deepEqual(makeRecord({ ...base(), areas: back.areas }, { kind: 'checkpoint', reason: 'seal-2', savedAt: 1000 }), rec);
});

test('a slice record (no areas) is still readable and carries forward with every field fresh (Q5)', () => {
  const slice = makeRecord(base(), { savedAt: 5 });
  assert.equal(slice.areas, null);
  const raw = JSON.stringify(slice);
  assert.equal(classify(raw), 'ok');
  // a record written before this field existed has no `areas` key at all
  const old = JSON.parse(raw); delete old.areas;
  assert.equal(classify(JSON.stringify(old)), 'ok');
  const { F, got } = areas();
  F.apply(parse(JSON.stringify(old)).areas);
  assert.deepEqual(got, { walls: null, benchmarks: null, kit: null, regions: null });
});

test('a getter or setter that throws never breaks a save', () => {
  const F = new SaveFields();
  F.register('kit', { get: () => { throw new Error('boom'); }, set: () => { throw new Error('boom'); } });
  const warn = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(F.collect(), { kit: null });
    assert.doesNotThrow(() => F.apply({ kit: { gaff: true } }));
  } finally { console.warn = warn; }
  assert.equal(normaliseAreas({ kit: null, junk: 1 }) && Object.keys(normaliseAreas({ kit: null, junk: 1 })).join(), 'kit');
});
