// R8 (the orchestrator's M3 ruling): leg 5 and the exit's two-leg pairing under 900 s by ROUTE, with numbers.
// Browser-free: node --test src/game/hour2/route.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { r8Report, r8Beats, legBudget, pairS, r8Wired, HUT_R8, BRAZIER_R8, MARGIN_S, REST_S } from './route.js';
import { PLACES, NEEDS, JOG_MS, beatsOfLeg, gaugeTide, exitPairS, legClock } from './plan.js';

/** The Gauge's tide clock, read from the kind's own source (gauge.js imports JSON Node cannot load bare). */
function gaugeClock() {
  const src = readFileSync(new URL('../../instruments/kinds/gauge.js', import.meta.url), 'utf8');
  const blk = /export const CLOCK = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(src)?.[1];
  const C = {};
  for (const k of ['period', 'mean', 'amp', 'openAt', 'leaveAt', 'returnAt']) C[k] = Number(new RegExp(`\\b${k}:\\s*([0-9.]+)`).exec(blk)[1]);
  return { CLOCK: C, OPEN_PHASE: Math.acos((C.mean - C.openAt) / C.amp) / (2 * Math.PI) };
}

const R = r8Report();

test('wave 1 as it stands: both pairs over 900 s (the record HT0 wrote)', () => {
  const [p45, p56] = R.pairs.wave1;
  console.log(`  wave 1: leg 5 ${R.legs[5].wave1} s of budgets (+ boot ${R.leg5.wave1 - R.legs[5].wave1} s); legs 4+5 ${p45.s} s, legs 5+6 ${p56.s} s against 900`);
  assert.equal(p45.s, 1009);
  assert.equal(p56.s, 1129);
  assert.ok(!p45.fits && !p56.fits);
});

test('R8: each changed beat covers its own walks at a jog and its acts with room to spare', () => {
  for (const [id, b] of Object.entries(r8Beats())) {
    console.log(`  ${id}: ${b.from} -> ${b.to} s; walks ${b.metres} m = ${b.walkS} s at a jog, acts ${b.actsS} s, spare ${b.spareS} s (${b.owner})`);
    assert.ok(b.fits, `${id}: ${b.to} s < ${b.needS} + ${MARGIN_S} s`);
  }
  console.log(`  the hut at (${HUT_R8.x}, ${HUT_R8.z}): ${Math.hypot(HUT_R8.x - PLACES.b2.x, HUT_R8.z - PLACES.b2.z).toFixed(1)} m from B2, ${Math.hypot(HUT_R8.x - PLACES.guildStud.x, HUT_R8.z - PLACES.guildStud.z).toFixed(1)} m from the stud`);
});

test('R8: leg 5 and both two-leg pairings fit 900 s; leg 5 still follows the Gauge through its whole time away', () => {
  const [p45, p56] = R.pairs.r8;
  console.log(`  R8: leg 5 ${R.legs[5].r8} s (+ boot: ${R.leg5.r8} s); leg 6 ${R.legs[6].r8} s; legs 4+5 ${p45.s} s (spare ${p45.spareS}), legs 5+6 ${p56.s} s (spare ${p56.spareS}) against 900`);
  assert.ok(R.leg5.r8 <= 900);
  assert.ok(p45.fits && p56.fits);
  const { CLOCK, OPEN_PHASE } = gaugeClock();
  const g = gaugeTide(CLOCK, OPEN_PHASE);
  const by = Object.fromEntries(beatsOfLeg(5).map((b) => [b.id, b.budgetS]));
  assert.ok(by['find-b2'] + by['resurvey-b2'] + by['clock-returns'] >= g.awayS, 'the three beats still cover the Gauge\'s time away');
  assert.equal(legBudget(4, { r8: true }), legBudget(4), 'leg 4 is not touched');
  assert.deepEqual(pairS(5, 6, { r8: true }).legs, [5, 6]);
});

test('R8 is WIRED (M3 wave 2b): plan.js carries the three budgets (the wave-1 budgets kept as wave1S), the hut and the Brazier; the exit pairs read 784 and 884 s from plan.js itself', () => {
  const w = r8Wired();
  assert.ok(w.ok, `not wired: ${w.off.join(', ')}`);
  const by = Object.fromEntries(beatsOfLeg(5).concat(beatsOfLeg(6)).map((b) => [b.id, b]));
  assert.equal(by['gauge-tide'].budgetS, 60); assert.equal(by['gauge-tide'].wave1S, 275);
  assert.equal(by['hand-net'].budgetS, 40); assert.equal(by['hand-net'].wave1S, 50);
  assert.equal(by['oro-yards'].budgetS, 52); assert.equal(by['oro-yards'].wave1S, 72);
  assert.deepEqual(PLACES.fishingHut, HUT_R8);
  const p45 = exitPairS(4, 5), p56 = exitPairS(5, 6);
  const leg5 = beatsOfLeg(5).reduce((s, b) => s + b.budgetS, 0);
  console.log(`  plan.js: leg 5 ${leg5} s (+ boot ${leg5 + 37} s); legs 4+5 ${p45.s} s, legs 5+6 ${p56.s} s against 900`);
  assert.equal(leg5, 290);
  assert.equal(p45.s, 784); assert.equal(p56.s, 884);
  assert.ok(p45.fits && p56.fits);
  for (const l of [5, 6]) { const c = legClock(l); console.log(`  leg ${l}: walks ${c.metres} m = ${c.moveS} s moving${c.travels.length ? `, travels ${c.travels.map((t) => `${t.from}->${t.to} (${t.m} m not walked)`).join(', ')}` : ''}; budgets ${c.budgetS} s`); assert.ok(c.budgetS > c.moveS); }
});

test('R8 wired: each changed beat names the piece it waits for, so the runner fails it by that name until it is built', () => {
  const by = Object.fromEntries(beatsOfLeg(5).concat(beatsOfLeg(6)).map((b) => [b.id, b]));
  assert.ok(by['gauge-tide'].needs.includes('brazier:tide-rest'));
  assert.ok(by['hand-net'].needs.includes('site:fishing-hut'));
  assert.ok(by['oro-yards'].needs.includes('travel:b2-node'));
  for (const id of ['brazier:tide-rest', 'travel:b2-node']) {
    assert.ok(NEEDS[id]?.what?.startsWith('R8:'), id);
    // the page today: no tideFor on the Braziers, no B2 node; the probe answers false (never throws) on an empty ctx
    const f = new Function('C', 'P', 'M', 'E', `return (${NEEDS[id].probe});`);
    assert.equal(!!f({ braziers: { noonFor: () => false } }, {}, {}, {}), false, id);
  }
});

test('R8 wired: leg 5 starts where its fixture stands (the Sounding Ring), not the stud R8 measured from: gauge-tide still covers the walk by the Brazier and the rest', () => {
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const m = d(PLACES.ring, BRAZIER_R8) + d(BRAZIER_R8, PLACES.gauge), need = m / JOG_MS + REST_S;
  const b = beatsOfLeg(5).find((x) => x.id === 'gauge-tide');
  console.log(`  from the Ring: ${m.toFixed(1)} m = ${(m / JOG_MS).toFixed(1)} s at a jog + the rest ${REST_S} s = ${need.toFixed(1)} s of ${b.budgetS} (spare ${(b.budgetS - need).toFixed(1)}, margin ${MARGIN_S})`);
  assert.ok(b.budgetS >= need + MARGIN_S);
});
