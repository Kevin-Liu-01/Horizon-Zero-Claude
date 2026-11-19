/**
 * HR10, trade and notices (Milestone 2 wave 4, area E): node --test tools/gates/systems/trade.test.mjs
 * The Ninewalls counter (src/game/trade/counter.js) opens on "The Scar"'s reward; the TRADE screen's words are exactly
 * BIBLE 18's (TRADE · GIVE · TAKE) and the notice cards' GUILD NOTICE · TAKE · untimed; prices in salt only; untimed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CounterRules, SALT } from '../../../src/game/trade/counter.js';
import { SCAR_REWARD } from '../../../src/game/quest/scar-plan.js';

const T = JSON.parse(readFileSync(new URL('../../../src/game/text/ui/trade.json', import.meta.url), 'utf8'));
const N = JSON.parse(readFileSync(new URL('../../../src/game/text/notices/ninewalls.json', import.meta.url), 'utf8'));
const inv = (o = {}) => { const c = new Map(Object.entries(o)); return { count: (id) => c.get(id) ?? 0, add: (id, n) => c.set(id, (c.get(id) ?? 0) + n), take: (id, n) => c.set(id, (c.get(id) ?? 0) - n), c }; };

test('the counter opens on "The Scar"\'s reward', () => {
  assert.equal(SCAR_REWARD.opens, 'ninewalls-counter');
  const hour = readFileSync(new URL('../../../src/game/hour.js', import.meta.url), 'utf8');
  assert.match(hour, /on\('counter-opened', \(e\) => \{ if \(e\.id === 'ninewalls-counter'\) this\.counter\.open\(\); \}\)/);
});

test('the TRADE screen carries exactly BIBLE 18\'s words; the verb is TRADE, never buy, sell or purchase', () => {
  const R = new CounterRules({ text: T });
  assert.deepEqual(R.words(), ['TRADE', 'GIVE', 'TAKE']);
  const all = JSON.stringify(T).toUpperCase() + readFileSync(new URL('../../../src/ui/trade.js', import.meta.url), 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').toUpperCase();
  for (const w of ['BUY', 'SELL', 'PURCHASE', 'SHOP', 'STORE']) assert.ok(!new RegExp(`\\b${w}\\b`).test(all.replace(/"ABOUT":"[^"]*"/, '')), `no '${w}' on the screen`);
  assert.equal(N.head, 'GUILD NOTICE'); assert.equal(N.verb, 'TAKE');
  assert.ok(N.notices.every((n) => n.term === 'untimed'), 'every notice untimed');
  assert.ok(N.notices.every((n) => n.body.length <= 3), 'at most three lines a card');
});

test('prices in salt only: TAKE spends salt, GIVE pays salt, nothing else moves; a trade that cannot be made changes nothing', () => {
  const R = new CounterRules({ text: T });
  for (const s of [...R.stock(), ...R.takes(inv())]) assert.ok(Number.isInteger(s.price) && s.price > 0 && s.price <= 200, `${s.id} priced ${s.price}`);
  assert.ok([...T.stock, ...T.takes].every((s) => ['common', 'guild', 'old-work'].includes(s.grade)), 'one of the three trade grades');
  const I = inv({ [SALT]: 10, 'machine-core': 1 });
  const r1 = R.take(I, 'obsidian');
  assert.ok(r1.ok); assert.equal(I.count(SALT), 4); assert.equal(I.count('obsidian'), 1);
  const r2 = R.take(I, 'blaze');
  assert.deepEqual(r2, { ok: false, why: 'salt' }); assert.equal(I.count(SALT), 4); assert.equal(I.count('blaze'), 0);
  const r3 = R.give(I, 'machine-core');
  assert.ok(r3.ok); assert.equal(I.count(SALT), 29); assert.equal(I.count('machine-core'), 0);
  assert.deepEqual(R.give(I, 'machine-core'), { ok: false, why: 'none-held' });
  assert.deepEqual([...I.c.keys()].sort(), ['machine-core', 'metal-shards', 'obsidian']);
});

test('untimed: the stock has no clock; a round trip keeps what was taken', () => {
  const src = readFileSync(new URL('../../../src/game/trade/counter.js', import.meta.url), 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /setTimeout|setInterval|restock|hours|clock/i);
  const R = new CounterRules({ text: T }); const I = inv({ [SALT]: 100 });
  R.take(I, 'wire'); R.take(I, 'wire');
  const R2 = new CounterRules({ text: T }); R2.restore(JSON.parse(JSON.stringify(R.serialize())));
  assert.equal(R2.stock().find((s) => s.id === 'wire').qty, T.stock.find((s) => s.id === 'wire').qty - 2);
});
