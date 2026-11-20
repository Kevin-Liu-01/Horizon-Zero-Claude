// Milestone 3, the wind and lift seam (M3 briefs §3.2; area F's EF6): `environment.flyable()`, false in calima and
// squall. Pure halves only (the Environment needs a renderer): the exported law and the method on a stand-in `this`,
// through a cross-fade built from the environment's own weather records.
// Browser-free: node --test src/world/environment.flyable.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Environment, flyableIn, GROUNDING_WEATHER, GROUNDED_WEIGHT } from './environment.js';
import { flyableIn as flightFlyableIn, GROUNDING_WEATHER as FLIGHT_GROUNDING } from '../game/kite/flight.js';

const WEATHER = Object.getOwnPropertyDescriptor(Environment.prototype, 'states').get.call({});
const STATES = Object.getOwnPropertyDescriptor(Environment.prototype, 'weatherStates').get.call({});
const flyable = (weather, w) => Environment.prototype.flyable.call({ weather, w });
const mix = (a, b, k) => Object.fromEntries(Object.keys(a).map((key) => [key, a[key] + ((b[key] ?? a[key]) - a[key]) * k]));

test('the method exists on the seam and answers a boolean', () => {
  assert.equal(typeof Environment.prototype.flyable, 'function');
  for (const s of STATES) assert.equal(typeof flyable(s, WEATHER[s]), 'boolean');
});

test('false in calima and squall, true in trade and fogbank (BIBLE §3.2, §16), settled skies', () => {
  const got = Object.fromEntries(STATES.map((s) => [s, flyable(s, WEATHER[s])]));
  console.log(`  flyable, settled: ${JSON.stringify(got)}`);
  assert.deepEqual(got, { trade: true, calima: false, fogbank: true, squall: false });
  assert.deepEqual([...GROUNDING_WEATHER], ['calima', 'squall']);
});

test('aliases as setWeather takes them: rain and storm are a squall, clear is trade; no state reads as trade', () => {
  assert.equal(flyableIn('rain'), false);
  assert.equal(flyableIn('storm'), false);
  assert.equal(flyableIn('clear'), true);
  assert.equal(flyableIn(null), true);
  assert.equal(flyableIn(undefined), true);
});

test('grounded the moment calima or a squall is SET, at any point of its fade in (KF5 ruling: the fold within 1 s)', () => {
  for (const to of ['calima', 'squall']) {
    for (const k of [0, 0.01, 0.25, 0.5, 1]) assert.equal(flyable(to, mix(WEATHER.trade, WEATHER[to], k)), false, `${to} at fade ${k}`);
  }
});

test('a fade OUT of calima or a squall keeps the kite down while the dust or the rain is the larger part of the sky', () => {
  const rows = [];
  for (const from of ['calima', 'squall']) {
    let firstFly = null;
    for (let i = 0; i <= 100; i++) {
      const k = i / 100, w = mix(WEATHER[from], WEATHER.trade, k);
      const f = flyable('trade', w);
      if (f && firstFly == null) firstFly = k;
      if (!f) assert.ok(w.calima > GROUNDED_WEIGHT.calima || w.rain > GROUNDED_WEIGHT.rain, `${from} k ${k}`);
    }
    rows.push(`${from} -> trade flies from fade ${firstFly}`);
    assert.equal(firstFly, 0.5, from);
  }
  console.log(`  ${rows.join('; ')}`);
});

test('the flight law\'s own grounded rule agrees with the seam on every state (rule 21: one law)', () => {
  assert.deepEqual([...FLIGHT_GROUNDING], [...GROUNDING_WEATHER]);
  for (const s of [...STATES, 'clear', 'rain', 'storm']) assert.equal(flightFlyableIn(s === 'rain' || s === 'storm' ? 'squall' : s === 'clear' ? 'trade' : s), flyableIn(s), s);
});

test('(fix round 1) the flight law asks the seam through every fade in and out, and canOpen refuses on the same frames', async () => {
  const { canOpen } = await import('../game/kite/flight.js');
  let n = 0, refusedFade = 0;
  for (const [from, to] of [['trade', 'calima'], ['trade', 'squall'], ['calima', 'trade'], ['squall', 'trade'], ['calima', 'fogbank'], ['squall', 'fogbank']]) {
    for (let i = 0; i <= 100; i++) {
      const w = mix(WEATHER[from], WEATHER[to], i / 100);
      const seam = flyable(to, w);
      assert.equal(flightFlyableIn(to, w), seam, `${from} -> ${to} at ${i} %`);
      const o = canOpen({ airborneS: 1, clearM: 10, weather: to, w });
      assert.equal(o.ok, seam, `canOpen ${from} -> ${to} at ${i} %`);
      if (!seam) { assert.equal(o.why, 'weather'); assert.ok(typeof o.note === 'string' && o.note.length > 0); if (!GROUNDING_WEATHER.includes(to)) refusedFade++; }
      n++;
    }
  }
  console.log(`  ${n} fade steps agree; ${refusedFade} of them refused in a fade OUT (the seam's GROUNDED_WEIGHT rule)`);
  assert.ok(refusedFade > 0);
});
