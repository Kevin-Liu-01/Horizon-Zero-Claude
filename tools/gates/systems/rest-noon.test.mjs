/**
 * HR5's rules, the rest at Ninewalls (Milestone 2 wave 4, area E): node --test tools/gates/systems/rest-noon.test.mjs
 * The dialog offers REST UNTIL NOON, pre-selected (first), for this one rest only; every other rest keeps the bible's
 * four; the refusal within 60 m of a wary Instrument stands for this rest too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dialogFor, BRAZIERS, NOON, NOON_WAKE, REST_ORDER } from '../../../src/game/brazier/rules.js';

const T = JSON.parse(readFileSync(new URL('../../../src/game/text/ui/systems.json', import.meta.url), 'utf8'));
const nw = BRAZIERS.find((b) => b.id === 'ninewalls');

test('the Ninewalls Brazier exists, locked until the quest unlocks it', () => {
  assert.ok(nw && nw.locked && !nw.litAtStart);
  assert.equal(dialogFor(T, nw, { lit: new Set(), unlocked: new Set(), x: 0, z: 0, machines: [] }).mode, 'locked');
  assert.equal(dialogFor(T, nw, { lit: new Set(), unlocked: new Set(['ninewalls']), x: 0, z: 0, machines: [] }).mode, 'kindle');
});

test('this one rest pre-selects noon; without the quest asking, the four', () => {
  const st = { lit: new Set(['ninewalls']), unlocked: new Set(['ninewalls']), x: 0, z: 0, machines: [], weather: { state: 'trade', calimaAt: 12 } };
  const d = dialogFor(T, nw, { ...st, noon: true });
  assert.equal(d.mode, 'rest'); assert.equal(d.preselect, NOON);
  assert.equal(d.rows[0].id, NOON); assert.equal(d.rows[0].label, 'REST UNTIL NOON'); assert.equal(d.rows[0].hour, NOON_WAKE);
  // HR6 (fix wave): she wakes inside the Transit's window (11:30-12:30), at its start; the noon row forecasts the calima
  assert.ok(NOON_WAKE >= 11.5 && NOON_WAKE < 12, `wakes at ${NOON_WAKE}`);
  assert.equal(d.rows[0].forecast, 'CALIMA BY NOON', 'the noon row forecasts the calima (at fa45e47 it read TRADE)');
  assert.deepEqual(d.rows.slice(1).map((r) => r.id), REST_ORDER);
  assert.equal(d.rows[1].forecast, 'CALIMA BY NOON', 'the dawn row forecasts the calima');
  const d4 = dialogFor(T, nw, st);
  assert.deepEqual(d4.rows.map((r) => r.id), REST_ORDER);
  assert.equal(d4.preselect, undefined);
});

test('refused within 60 m of a wary Instrument, noon or not', () => {
  const st = { lit: new Set(['ninewalls']), unlocked: new Set(['ninewalls']), x: 0, z: 0, noon: true, machines: [{ x: 40, z: 30, lamp: 'wary', kind: 'peg' }] };
  const d = dialogFor(T, nw, st);
  assert.equal(d.mode, 'refused'); assert.equal(d.line, 'THE LAMPS ARE UP. NO REST HERE.'); assert.equal(d.rows.length, 0);
  assert.equal(dialogFor(T, nw, { ...st, machines: [{ x: 50, z: 40, lamp: 'wary', kind: 'peg' }] }).mode, 'rest', '64 m off');
});
