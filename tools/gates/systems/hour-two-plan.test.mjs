// Milestone 3 wave 1 (area E, HT0): hour two's plan (src/game/hour2/plan.js). 27 beats in three legs in the brief's
// order, each with a game-time budget (rule 13) and the needs it fails by; every need probes something in the page;
// row 0's arithmetic (the legs' walks on the built jog and clock; the test flight from T1's top at 5:1) is printed.
// Browser-free: node --test tools/gates/systems/hour-two-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, LEGS, NEEDS, PLACES, HOUR2_QUESTS, beatsOfLeg, legClock, testFlight } from '../../../src/game/hour2/plan.js';
import { heightAt } from '../../../src/world/island/recipe.js';
import { RegionMap } from '../../../src/core/regions.js';

const ORDER = {
  4: ['weather-clears', 'walk-the-line', 'ansel-kite', 'wreck', 'cane-cord', 'rebuild', 'tether', 'launch', 'fly', 'kite-given'],
  5: ['gauge-tide', 'find-b2', 'resurvey-b2', 'clock-returns', 'rung-3', 'hand-net'],
  6: ['oro-yards', 'climb', 'plugged', 'quench-1', 'quench-2', 'quench-3', 'quench-4', 'yards-quiet', 'tube-rest', 'scar-flight', 'rung-7-held'],
};

test('27 beats, legs 4-6, in the brief\'s order (M3-BRIEFS §3.6), ids unique', () => {
  assert.equal(BEATS.length, 27);
  assert.deepEqual([...LEGS], [4, 5, 6]);
  for (const leg of LEGS) assert.deepEqual(beatsOfLeg(leg).map((b) => b.id), ORDER[leg]);
  assert.equal(new Set(BEATS.map((b) => b.id)).size, 27);
});

test('every beat: a game-time budget, an event, needs that exist, a place, a quest of hour two or none', () => {
  for (const b of BEATS) {
    assert.ok(b.budgetS > 0 && b.budgetS <= 600, `${b.id} budget`);
    assert.ok(typeof b.event === 'string' && b.event, `${b.id} event`);
    assert.ok(b.needs.length >= 1, `${b.id} needs`);
    for (const n of b.needs) assert.ok(NEEDS[n], `${b.id}: need '${n}' is not in NEEDS`);
    assert.ok(PLACES[b.place], `${b.id}: place '${b.place}'`);
    assert.ok(b.quest === null || HOUR2_QUESTS.includes(b.quest), `${b.id} quest`);
    if (b.quest) assert.equal(b.needs[0] === `quest:${b.quest}` || b.needs.includes(`quest:${b.quest}`), true, `${b.id} needs its quest`);
  }
  for (const [id, n] of Object.entries(NEEDS)) { assert.ok(n.what && n.probe, id); assert.doesNotThrow(() => new Function('C', 'P', 'M', 'E', `return (${n.probe});`), id); }
});

test('the beats with danger name their hp rows (rule 22): tether, each wellhead, the walk out', () => {
  const d = BEATS.filter((b) => b.danger).map((b) => b.danger);
  for (const want of ['tether', 'wellhead-1', 'wellhead-2', 'wellhead-3', 'wellhead-4', 'walk-out']) assert.ok(d.includes(want), want);
});

test('row 0: places by region; the legs\' walks and budgets on the built jog and clock; the test flight at 5:1', () => {
  const map = new RegionMap().build();
  const where = Object.fromEntries(Object.entries(PLACES).map(([k, p]) => [k, map.regionAt(p.x, p.z)]));
  console.log(`  places: ${Object.entries(where).map(([k, r]) => `${k} ${r}`).join(', ')}`);
  assert.equal(where.malpaisEdge, 'malpais');
  assert.equal(where.kilnYards, 'malpais');
  assert.equal(where.tubeShelter, 'malpais');
  assert.equal(where.guildStud, 'pans');
  assert.equal(where.b2, 'pans');
  for (const leg of LEGS) {
    const c = legClock(leg);
    console.log(`  leg ${leg}: ${c.metres} m walked (straight lines, a lower bound) = ${c.walkS} s at a jog = ${c.walkGameH} game h; beat budgets ${c.budgetS} s = ${c.budgetGameH} game h`);
    assert.ok(c.metres > 0);
  }
  const f = testFlight(heightAt);
  console.log(`  test flight: T1's top ${f.launchM} m, the Ring's ground ${f.landM} m: ${f.dropM} m of drop reaches ${f.stillAirReachM} m at 5:1 in still air against ${f.runM} m (needs ${f.needsDropM} m): ${f.closesInStillAir ? 'closes' : 'does NOT close without lift or wind'}`);
  assert.equal(typeof f.closesInStillAir, 'boolean');
});
