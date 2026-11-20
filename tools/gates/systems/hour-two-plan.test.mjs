// Milestone 3 wave 1 (area E, HT0): hour two's plan (src/game/hour2/plan.js). 27 beats in three legs in the brief's
// order, each with a game-time budget (rule 13) and the needs it fails by; every need probes something in the page;
// row 0's arithmetic (the legs' walks on the built jog and clock; the test flight from T1's top at 5:1) is printed.
// Browser-free: node --test tools/gates/systems/hour-two-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEATS, LEGS, NEEDS, PLACES, HOUR2_QUESTS, beatsOfLeg, legClock, testFlight, exitPairS, gaugeTide, trigSight, LEG_CAP_S, BOOT_S, BRIEF_EST_S } from '../../../src/game/hour2/plan.js';
import { TRIG, TRIG_TOP } from '../../../src/world/island/sites.js';
import { TrueGround } from '../../../src/game/quest/true-ground.js';
import { fixture } from './hour-two-fixtures.mjs';
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

// ---- row 0, fix round 1: what the wave-1 record left out (the judge's HT0 line)

/** The Gauge's tide clock, read from the kind's own source (gauge.js imports the look's JSON, which Node cannot load bare). */
function gaugeClock() {
  const src = readFileSync(new URL('../../../src/instruments/kinds/gauge.js', import.meta.url), 'utf8');
  const blk = /export const CLOCK = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(src)?.[1];
  assert.ok(blk, 'gauge.js CLOCK');
  const C = {};
  for (const k of ['period', 'mean', 'amp', 'openAt', 'leaveAt', 'returnAt']) { const m = new RegExp(`\\b${k}:\\s*([0-9.]+)`).exec(blk); assert.ok(m, k); C[k] = Number(m[1]); }
  return { CLOCK: C, OPEN_PHASE: Math.acos((C.mean - C.openAt) / C.amp) / (2 * Math.PI) };
}

test('row 0: every leg\'s beat budgets fit the runner\'s cap with a boot, and cover its walks and flights; the brief\'s estimates and the exit\'s pairs printed', () => {
  for (const leg of LEGS) {
    const c = legClock(leg);
    console.log(`  leg ${leg}: budgets ${c.budgetS} s (+ boot ${BOOT_S} s, cap ${LEG_CAP_S} s): ${c.fitsCap ? 'fits' : 'OVER'}; moving ${c.moveS} s (walks ${c.walkS} s at a jog, flights ${c.flyS} s at 7.5 m/s); the brief's estimate ${BRIEF_EST_S[leg]} s: ${c.budgetS <= BRIEF_EST_S[leg] ? 'within' : `over by ${c.budgetS - BRIEF_EST_S[leg]} s`}`);
    assert.ok(c.fitsCap, `leg ${leg}: ${c.budgetS} + ${BOOT_S} > ${LEG_CAP_S}`);
    assert.ok(c.budgetS > c.moveS, `leg ${leg}: budgets ${c.budgetS} s under the moving time ${c.moveS} s`);
  }
  for (const [a, b] of [[4, 5], [5, 6]]) { const p = exitPairS(a, b); console.log(`  exit launch legs ${a}+${b} at their budgets: ${p.s} s ${p.fits ? 'fits' : 'does NOT fit'} 900 s`); }
});

test('row 0: leg 5 follows the Gauge through one tide: its leave and return from its spawn bound gauge-tide and the three beats after', () => {
  const { CLOCK, OPEN_PHASE } = gaugeClock();
  const g = gaugeTide(CLOCK, OPEN_PHASE);
  console.log(`  the Gauge: period ${g.periodS} s; spawned at phase ${g.openPhase}; leaves for the Glass ${g.spawnToLeaveS} s after its spawn, back at Sluice 3 ${g.spawnToReturnS} s after (away ${g.awayS} s)`);
  const by = Object.fromEntries(beatsOfLeg(5).map((b) => [b.id, b.budgetS]));
  // R8 (wired at M3 wave 2b, src/game/hour2/route.js): the cistern Brazier's rest carries the Gauge's tide clock to its
  // leave, so 'gauge-tide' is the walk, the rest and the walk (60 s) and needs that rest; its wave-1 wait is kept as wave1S
  const gt = beatsOfLeg(5).find((b) => b.id === 'gauge-tide');
  if (gt.needs.includes('brazier:tide-rest')) assert.ok(gt.wave1S >= g.spawnToLeaveS, `gauge-tide's wave-1 wait ${gt.wave1S} s < ${g.spawnToLeaveS} s to its leave`);
  else assert.ok(by['gauge-tide'] >= g.spawnToLeaveS, `gauge-tide ${by['gauge-tide']} s < ${g.spawnToLeaveS} s to its leave`);
  assert.ok(by['find-b2'] + by['resurvey-b2'] + by['clock-returns'] >= g.awayS, 'the three beats while it is away');
});

test('row 0: WALK THE LINE at 0:55 (leg 4\'s start): the first hour\'s record makes B1 a travel node; the stud is not one', () => {
  const rec = fixture(4);
  const T = new TrueGround().restore(rec.areas.regions);
  const nodes = T.nodes();
  console.log(`  travel nodes at 0:55: [${nodes.join(', ')}]; refused while Flagged or with a wary Instrument within 60 m (the page reads canWalk at leg 4's start); the guild-house stud is not a node (TrueGround.nodes() lists re-surveyed benchmarks)`);
  assert.deepEqual(nodes, ['bm-01']);
  assert.equal(T.walkRefused({ flagged: false, wary: false }), null);
  assert.equal(T.walkRefused({ flagged: false, wary: true }), 'wary');
});

test('row 0: T3 (Rust Cone) is in sight on hour two\'s path; it closes nothing yet', () => {
  const T3 = TRIG.find((t) => t.id === 'T3');
  const seen = [];
  for (const b of BEATS) {
    const r = trigSight(heightAt, T3, TRIG_TOP, PLACES[b.place]);
    if (r.clear) seen.push(`${b.leg}:${b.id} ${r.distM} m (clear by ${r.minClearM} m)`);
  }
  console.log(`  T3 in a clear line from her eye at: ${seen.join('; ')}`);
  assert.ok(seen.some((s) => s.startsWith('4:weather-clears')), 'from the Malpais edge at 0:55');
  assert.ok(seen.some((s) => s.startsWith('6:')), 'from the Kiln Yards');
});
