/**
 * HR11, the first award (Milestone 2 wave 4, area E): node --test tools/gates/systems/certs.test.mjs
 * The certifications count survey acts and never kills (src/game/certs/rules.js); the re-survey moves Ballast and
 * Bearing; in the first hour's order (the slice's Pry and triangle, then the re-survey) BALLAST I and BEARING I are the
 * first ranks granted, at the re-survey; the live half's card reads `CERT RANK · PERK`; the award card's shapes are
 * 44 px circles and 1 px rules with no polygon (read from src/ui/award.js's own drawing).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CertRules, ACTS, RANK_AT, actsFromQuests } from '../../../src/game/certs/rules.js';
import { Certifications } from '../../../src/game/certs/live.js';
import { sliceDone } from './first-hour-fixtures.mjs';
const TEXT = JSON.parse(readFileSync(new URL('../../../src/game/text/ui/certs.json', import.meta.url), 'utf8'));

const bus = () => { const L = {}; return { on: (n, f) => ((L[n] ||= []).push(f), () => {}), emit: (n, e) => { for (const f of (L[n] || [])) f(e); }, L }; };

test('a row with 10 kills: no counter moves (kills are not a survey act)', () => {
  const C = new CertRules();
  for (let i = 0; i < 10; i++) assert.deepEqual(C.count('kill'), []);
  for (let i = 0; i < 10; i++) assert.deepEqual(C.count('machine-killed'), []);
  assert.deepEqual(C.counts(), { transect: 0, bearing: 0, ballast: 0 });
  // and live: ten 'machine-killed' on the bus
  const ev = bus(), ctx = { events: ev, player: { maxHealth: 100, health: 100 } };
  const L = new Certifications(ctx, { text: TEXT });
  for (let i = 0; i < 10; i++) ev.emit('machine-killed', { machine: { kind: i % 2 ? 'peg' : 'plumb' } });
  assert.deepEqual(L.report().counts, { transect: 0, bearing: 0, ballast: 0 });
  assert.equal(ev.L['machine-killed'], undefined, 'the certifications never listen for a kill');
  assert.ok(!Object.keys(ACTS).some((a) => /kill/i.test(a)), 'no act is a kill');
});

test('the re-survey moves Ballast and Bearing, and in the hour\'s order it is the first award (BALLAST I, BEARING I)', () => {
  const ev = bus(), ctx = { events: ev, player: { maxHealth: 100, health: 80, maxGourd: 2 } };
  const L = new Certifications(ctx, { text: TEXT });
  const granted = [];
  ev.on('certification-granted', (e) => granted.push(e));
  // the slice: the bob Pried (part-torn and machine-damaged both report it: one act), the triangle closed
  const plumb = { kind: 'plumb' };
  ev.emit('part-torn', { machine: plumb, part: { name: 'bob' } });
  ev.emit('machine-damaged', { machine: plumb, tornPart: { name: 'bob' } });
  ev.emit('triangle-closed', { id: 'T1-T2-T6' });
  assert.deepEqual(L.report().counts, { transect: 0, bearing: 1, ballast: 1 });
  assert.equal(granted.length, 0, 'nothing granted in the slice');
  const before = { ...L.report().counts };
  // the re-survey at Benchmark 1 (hour.js _resurveyed sends both)
  ev.emit('resurvey-done', { benchmark: 'bm-01', bearings: [214, 71, 300] });
  ev.emit('benchmark-resurveyed', { id: 'bm-01', region: 'ninewalls' });
  const after = L.report().counts;
  assert.ok(after.ballast > before.ballast && after.bearing > before.bearing, `moved ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  assert.deepEqual(granted.map((g) => `${g.cert} ${g.rank}`).sort(), ['ballast 1', 'bearing 1']);
  assert.deepEqual(granted.map((g) => g.card.line).sort(), ['BALLAST I · +15 HEALTH', 'BEARING I · LONG BREATH']);
  assert.equal(ctx.player.maxHealth, 115, 'Ballast I: +15 to her health\'s ceiling');
  assert.equal(L.perks.steadyS, 5, 'Bearing I publishes Long Breath (Steady 5 s) for combat');
  assert.equal(RANK_AT[0], 2);
});

test('a slice save carried forward (no certifications field) is counted from its quests: the re-survey still grants both', () => {
  const rm = sliceDone();
  const acts = actsFromQuests(rm, null);
  assert.ok(acts.some((a) => a.act === 'pried') && acts.some((a) => a.act === 'triangle'), JSON.stringify(acts));
  const ev = bus(), ctx = { events: ev, player: { maxHealth: 100, health: 100 } };
  const L = new Certifications(ctx, { text: TEXT });
  L._derive = true;
  L.afterRestore(rm, null);
  assert.deepEqual(L.report().granted, [], 'counted quietly');
  const g = [];
  ev.on('certification-granted', (e) => g.push(e.card.line));
  ev.emit('resurvey-done', { benchmark: 'bm-01' }); ev.emit('benchmark-resurveyed', { id: 'bm-01' });
  assert.deepEqual(g.sort(), ['BALLAST I · +15 HEALTH', 'BEARING I · LONG BREATH']);
});

test('save round trip: the counts, the ranks and the log', () => {
  const A = new CertRules();
  A.count('benchmark'); A.count('pried'); A.count('triangle');
  const B = new CertRules();
  assert.ok(B.restore(JSON.parse(JSON.stringify(A.serialize()))));
  assert.deepEqual(B.counts(), A.counts());
  assert.deepEqual(B.ranks(), A.ranks());
});

test('the award card is 44 px circles and 1 px rules, never a hexagon (src/ui/award.js as written)', () => {
  const src = readFileSync(new URL('../../../src/ui/award.js', import.meta.url), 'utf8');
  assert.match(src, /const R = 22;/, 'circle radius 22 (44 px)');
  assert.match(src, /<circle class="aw-node"[^`]*r="\$\{R - 0\.5\}"/, 'the nodes are circles of R (stroke inside: 44 px across)');
  assert.match(src, /<line [^`]*stroke-width="1"/, 'the rules are 1 px');
  assert.doesNotMatch(src.replace(/\/\*\*[\s\S]*?\*\//g, ''), /<polygon|<polyline|hexagon/i, 'no polygon in the drawing');
});
