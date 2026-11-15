// M1.6c the Brazier: the refusal within 60 m of a wary Plumb, the six strings, the forecast line, the four hours.
// Browser-free: node --test tools/gates/systems/brazier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refusedBy, dialogFor, brazierStrings, forecastLine, REST_HOURS, REFUSE_RADIUS, BRAZIERS } from '../../../src/game/brazier/rules.js';
import { loadText } from './lib.mjs';

const T = loadText().systems;
const cistern = BRAZIERS.find((b) => b.id === 'cistern');
const t1 = BRAZIERS.find((b) => b.id === 't1');
const at = (d, lamp) => ({ x: d, z: 0, lamp, kind: 'plumb' });

test('refused within 60 m of a wary or hostile Plumb; allowed beyond, or when it is calm or dark', () => {
  assert.equal(REFUSE_RADIUS, 60);
  assert.ok(refusedBy(0, 0, [at(59.9, 'wary')]));
  assert.ok(refusedBy(0, 0, [at(30, 'hostile')]));
  assert.equal(refusedBy(0, 0, [at(60.1, 'wary')]), null);
  assert.equal(refusedBy(0, 0, [at(10, 'calm')]), null);
  assert.equal(refusedBy(0, 0, [at(10, 'dark')]), null);
  const lit = new Set(['cistern']);
  const refused = dialogFor(T, cistern, { lit, x: 0, z: 0, machines: [at(40, 'wary')] });
  assert.equal(refused.mode, 'refused');
  assert.equal(refused.line, 'THE LAMPS ARE UP. NO REST HERE.');
  assert.equal(refused.rows.length, 0);
});

test('the dialog prints exactly the bible\'s six strings', () => {
  assert.deepEqual(brazierStrings(T), [
    'KINDLE', 'REST UNTIL DAWN', 'REST UNTIL GOLDEN', 'REST UNTIL DUSK', 'REST UNTIL NIGHT', 'THE LAMPS ARE UP. NO REST HERE.',
  ]);
  const lit = new Set(['cistern']);
  const d = dialogFor(T, cistern, { lit, x: 0, z: 0, machines: [], weather: { state: 'trade', windFrom: 45, speed: 5 } });
  assert.equal(d.mode, 'rest');
  assert.deepEqual(d.rows.map((r) => r.label), ['REST UNTIL DAWN', 'REST UNTIL GOLDEN', 'REST UNTIL DUSK', 'REST UNTIL NIGHT']);
  // the prompt is the bible row's own word, "REST UNTIL …"
  assert.equal(d.prompt, 'REST UNTIL …');
  const k = dialogFor(T, t1, { lit: new Set(), unlocked: new Set(['t1']), x: 0, z: 0, machines: [] });
  assert.equal(k.mode, 'kindle');
  assert.equal(k.prompt, 'KINDLE');
  assert.equal(dialogFor(T, t1, { lit: new Set(), unlocked: new Set(), x: 0, z: 0, machines: [] }).mode, 'locked');
});

test('the forecast line is one line in the bible\'s form; rest chooses the hour, not the weather', () => {
  assert.equal(forecastLine(T, REST_HOURS.dawn, { state: 'trade', windFrom: 45, speed: 5 }), 'TRADE · WIND 045 AT 5 m/s');
  assert.equal(forecastLine(T, REST_HOURS.dawn, { state: 'trade', windFrom: 45, speed: 5, calimaAt: 12 }), 'CALIMA BY NOON');
  assert.equal(forecastLine(T, REST_HOURS.golden, { state: 'trade', windFrom: 45, speed: 5, calimaAt: 12 }), 'TRADE · WIND 045 AT 5 m/s');
  assert.deepEqual(Object.keys(REST_HOURS), ['dawn', 'golden', 'dusk', 'night']);
  assert.ok(REST_HOURS.golden > 18 && REST_HOURS.golden < 19);
});
