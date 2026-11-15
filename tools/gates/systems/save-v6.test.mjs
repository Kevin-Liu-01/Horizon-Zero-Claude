// M1.6f save v6: the round-trip, three slots, silent checkpoints, the one death rule, older saves refused and
// left in storage. Browser-free: node --test tools/gates/systems/save-v6.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, REQUIRED, makeRecord, classify, deathRecord, olderSaves, slotKey } from '../../../src/game/save/format.js';
import { SaveStore, MemoryStorage } from '../../../src/game/save/store.js';
import { QuestSpine } from '../../../src/game/quest/spine.js';
import { strings, loadText } from './lib.mjs';

const CISTERN = { id: 'cistern', x: -244.2, y: 2.1, z: 212.6, yaw: 2.36, hour: 7 };

function state(over = {}) {
  const spine = new QuestSpine({ strings: strings() }).start();
  spine.update(0.1, { near: (a) => a === 'pans', aim: () => false });
  for (let i = 0; i < 3; i++) spine.notify('gathered', { source: 'rake', n: 1 });
  return {
    hour: 9.25, weather: 'trade', place: 'SALTROW',
    quest: spine.serialize(),
    satchel: { 'metal-shards': 23, 'ridge-wood': 2 },
    ammo: { hunter: 12, hardpoint: 6 },
    position: { x: -262.5, y: 1.4, z: 245.1, yaw: 1.2, pitch: -0.1, heading: 1.1 },
    vitals: { health: 61, maxHealth: 100, gourd: 1, maxGourd: 2 },
    triangles: ['T1-T2-T6'],
    braziers: { lit: ['cistern'], lastRest: CISTERN },
    tolerance: 'fine',
    loadout: { weapon: 'sabina-bow', activeAmmo: { 'sabina-bow': 'hunter' }, rung: 'starter', quick: ['sabina-bow', 'lance', null, null] },
    ...over,
  };
}

test('save, quit, continue: the record round-trips whole, at the same hour', () => {
  const mem = new MemoryStorage();
  const s = state();
  const rec = makeRecord(s, { kind: 'named', reason: 'brazier', slot: 2, savedAt: 1000 });
  assert.equal(rec.v, VERSION);
  for (const k of REQUIRED) assert.ok(k in rec, k);
  const store = new SaveStore(mem);
  assert.equal(store.write(rec).ok, true);
  // "quit": a new store over the same storage, as a fresh page would build
  const back = new SaveStore(mem).read(2, 'named');
  assert.deepEqual(back, rec);
  assert.equal(back.hour, 9.25);
  assert.deepEqual(makeRecord(back, { kind: back.kind, reason: back.reason, slot: back.slot, savedAt: back.savedAt }), rec);
  // the quest stage survives into a live spine
  const spine = new QuestSpine({ strings: strings() });
  spine.restore(back.quest);
  assert.equal(spine.current().id, 'rake');
  assert.equal(spine.st.rake.n, 3);
});

test('three slots are independent; Continue picks the active slot, else the newest', () => {
  const store = new SaveStore(new MemoryStorage());
  store.write(makeRecord(state({ hour: 8 }), { slot: 1, savedAt: 10 }));
  store.write(makeRecord(state({ hour: 12 }), { slot: 3, savedAt: 30 }));
  assert.equal(store.slots().length, 3);
  assert.equal(store.read(1).hour, 8);
  assert.equal(store.read(2), null);
  assert.equal(store.read(3).hour, 12);
  store.setActive(2);
  assert.equal(store.continueSlot(), 3);
  store.setActive(1);
  assert.equal(store.continueSlot(), 1);
  store.erase(1);
  assert.equal(store.read(1), null);
  assert.equal(store.read(3).hour, 12);
  assert.throws(() => slotKey(1, 'other'));
});

test('the one death rule: stand up at the last-rested Brazier with everything since kept', () => {
  const store = new SaveStore(new MemoryStorage());
  // rested at the cistern at 07:00 ...
  const named = makeRecord(state({ hour: 7, satchel: { 'metal-shards': 20 }, triangles: [] }), { kind: 'named', reason: 'brazier', savedAt: 100 });
  store.write(named);
  // ... then a checkpoint far away: the triangle closed and ten salt raked
  const far = { x: -150.1, y: 13.5, z: 285.7, yaw: 0.4, pitch: 0, heading: 0.4 };
  const cp = makeRecord(state({ hour: 8.4, position: far, satchel: { 'metal-shards': 30 }, triangles: ['T1-T2-T6'] }),
    { kind: 'checkpoint', reason: 'stage:sight', savedAt: 200 });
  store.write(cp);
  const d = store.forDeath(1, { hour: 8.6 });
  assert.equal(d.position.x, CISTERN.x);
  assert.equal(d.position.z, CISTERN.z);
  assert.deepEqual(d.triangles, ['T1-T2-T6'], 'the checkpointed triangle is kept');
  assert.equal(d.satchel['metal-shards'], 30, 'the checkpointed satchel is kept');
  assert.equal(d.vitals.health, d.vitals.maxHealth);
  assert.equal(d.hour, 8.6, 'death is not a rest: the hour is the hour she fell');
  // with only a named save, she stands at that Brazier with the named save's world
  const d2 = deathRecord(named, null);
  assert.equal(d2.position.x, CISTERN.x);
  assert.deepEqual(d2.triangles, []);
  assert.equal(deathRecord(null, null), null);
});

test('a v5 save shows OLDER SAVE, is not read, and is still in storage afterwards', () => {
  const mem = new MemoryStorage();
  const v5 = JSON.stringify({ v: 5, savedAt: 1, reason: 'brazier', prog: {} });
  mem.setItem('cal.save.v5', v5);
  mem.setItem('cal.checkpoint.v5', v5);
  mem.setItem('cal.binds.v5', '{}');
  mem.setItem('cal.meta.v5', '{"hasSave":true}');
  const store = new SaveStore(mem);
  assert.equal(classify(v5), 'older');
  assert.deepEqual(store.older(), ['cal.checkpoint.v5', 'cal.save.v5']);
  assert.deepEqual(olderSaves(mem), ['cal.checkpoint.v5', 'cal.save.v5']);
  assert.equal(store.continueSlot(), null, 'Continue has nothing to load');
  // the title's words
  assert.equal(loadText().systems.save.older, 'OLDER SAVE · NOT READABLE BY THIS BUILD');
  // a new game in every slot and an erase leave the old record exactly where it was
  for (let n = 1; n <= 3; n++) store.write(makeRecord(state(), { slot: n, savedAt: n }));
  store.erase(2);
  assert.equal(mem.getItem('cal.save.v5'), v5);
  assert.equal(mem.getItem('cal.checkpoint.v5'), v5);
  // a v5 record copied into a v6 key is refused too, not read as v6
  mem.setItem(slotKey(1, 'named'), v5);
  assert.equal(store.read(1, 'named'), null);
  assert.equal(store.status(1, 'named'), 'older');
});

test('a damaged or newer record is refused without a throw', () => {
  assert.equal(classify('{not json'), 'corrupt');
  assert.equal(classify(JSON.stringify({ v: 7 })), 'corrupt');
  assert.equal(classify(JSON.stringify({ v: 6 })), 'corrupt');
  assert.equal(classify(null), 'none');
  const store = new SaveStore({ getItem() { throw new Error('locked'); }, setItem() { throw new Error('locked'); }, removeItem() {}, key() { return null; }, length: 0 });
  assert.equal(store.read(1), null);
  const res = store.write(makeRecord(state(), { slot: 1 }));
  assert.equal(res.ok, false);
});

test('a stage checkpoint restores onto the NEXT stage, live, not the finished one (systems-1b fix: died at the ditch, wedged on sight)', () => {
  const recs = [];
  const sp = new QuestSpine({ strings: strings(), hooks: { checkpoint: (r) => recs.push([r, JSON.parse(JSON.stringify(sp.serialize()))]) } });
  sp.start();
  const w = { near: (a) => a === 'pans', aim: () => false, bearing: () => 0 };
  sp.update(0.1, w);                       // wake done -> rake entered, then the checkpoint
  const [reason, rec] = recs.at(-1);
  assert.equal(reason, 'stage:wake');
  const back = new QuestSpine({ strings: strings(), hooks: {} });
  back.restore(rec);
  assert.equal(back.current().id, 'rake');
  assert.equal(back.st.rake.state, 'active');
  // an older record written the old way (the finished stage still current) steps on too
  const old = JSON.parse(JSON.stringify(rec));
  old.idx = 0;
  const back2 = new QuestSpine({ strings: strings(), hooks: {} });
  back2.restore(old);
  assert.equal(back2.current().id, 'rake');
  assert.equal(back2.st.rake.state, 'active');
});
