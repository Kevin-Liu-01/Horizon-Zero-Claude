// M3.7's ranks that hour two can reach, counted by the counted-acts seam's events alone (Milestone 3 wave 3, area E; the
// brief's HT6 and HT8). The first hour's acts, then hour two's (./hour-two.js: the three quests' own, then what the
// ground offers besides), fed to CountedActs: each rank hour two grants is named with the event that granted it; ten
// kills between them move nothing; health's ceiling rises only through Ballast; and the live half (./live.js) counts the
// seam's events it adopted at wave 3 once each, never twice beside its M2 listeners.
// Browser-free: node --test src/game/certs/hour-two-ranks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CERTS, PERKS, RANK_AT, CountedActs, actsOfEvent, COUNTED_EVENTS } from './rules.js';
import { FIRST_HOUR_SEAM, HOUR2_FASTEST, HOUR2_OPTIONAL } from './hour-two.js';
import { Certifications } from './live.js';

const play = (events, C = new CountedActs()) => {
  const grants = [];
  for (const [name, e] of events) for (const g of C.emit(name, e)) grants.push({ ...g, by: name, leg: e.leg, why: e.why ?? null });
  return { C, grants };
};

test('every hour-two act is a seam event that counts, and none is a kill', () => {
  for (const [name, e] of [...FIRST_HOUR_SEAM, ...HOUR2_FASTEST, ...HOUR2_OPTIONAL]) {
    assert.ok(COUNTED_EVENTS.includes(name), name);
    assert.ok(actsOfEvent(name, e, { reed: 0 }).length >= 1, `${name} ${JSON.stringify(e)} counts`);
    assert.ok(!e.killed, 'no kill');
  }
});

test('the first hour ends on BALLAST I and BEARING I, Transect at 1 act (the hour-two fixtures\' record)', () => {
  const { C } = play(FIRST_HOUR_SEAM);
  assert.deepEqual(C.rules.ranks(), { transect: 0, bearing: 1, ballast: 1 });
  assert.deepEqual(C.rules.counts(), { transect: 1, bearing: 2, ballast: 2 });
});

test('the fastest hour two (the quests\' acts only) grants TRANSECT I (leg 4) and BALLAST II (leg 5); Bearing stays at I', () => {
  const { C, grants } = play([...FIRST_HOUR_SEAM, ...HOUR2_FASTEST]);
  const h2 = grants.filter((g) => g.leg >= 4).map((g) => `${g.cert} ${g.rank} by ${g.by} (leg ${g.leg})`);
  assert.deepEqual(h2, ['transect 1 by transect:crossed (leg 4)', 'ballast 2 by pry (leg 5)']);
  assert.deepEqual(C.rules.ranks(), { transect: 1, bearing: 1, ballast: 2 });
  assert.deepEqual(C.rules.counts(), { transect: 4, bearing: 3, ballast: 6 });
});

test('with what hour two\'s ground offers besides: TRANSECT III, BEARING II and BALLAST II are reachable; no rank IV', () => {
  const { C, grants } = play([...FIRST_HOUR_SEAM, ...HOUR2_FASTEST, ...HOUR2_OPTIONAL]);
  const h2 = grants.filter((g) => g.leg >= 4);
  assert.ok(h2.some((g) => g.cert === 'transect' && g.rank === 2), 'TRANSECT II');
  assert.ok(h2.some((g) => g.cert === 'bearing' && g.rank === 2), 'BEARING II');
  assert.ok(h2.some((g) => g.cert === 'ballast' && g.rank === 2), 'BALLAST II');
  assert.ok(h2.some((g) => g.cert === 'transect' && g.rank === 3), 'TRANSECT III (Lane Walker) at the ninth Transect act');
  assert.deepEqual(C.rules.ranks(), { transect: 3, bearing: 2, ballast: 2 });
  for (const k of CERTS) assert.ok(C.rules.of(k).n < RANK_AT[3], `${k}: no rank IV in hour two (${RANK_AT[3]} acts)`);
  // the counts, for the record
  assert.deepEqual(C.rules.counts(), { transect: 9, bearing: 6, ballast: 8 });
});

test('ten kills between hour two\'s acts move 0 counters', () => {
  const kills = Array.from({ length: 10 }, (_, i) => ['machine-killed', { kind: ['peg', 'plumb', 'kiln', 'spindle', 'sonde'][i % 5], killed: true, leg: 6 }]);
  const a = play([...FIRST_HOUR_SEAM, ...HOUR2_FASTEST]).C.rules.counts();
  const b = play([...FIRST_HOUR_SEAM, ...kills, ...HOUR2_FASTEST, ...kills]).C.rules.counts();
  assert.deepEqual(b, a);
  // a lamp darkened by a kill and an Undercut that kills (combat's payload: no part) count nothing
  assert.deepEqual(actsOfEvent('lamp:dark', { kind: 'kiln', killed: true }), []);
  assert.deepEqual(actsOfEvent('undercut', { machine: {}, killed: true, damage: 900 }), []);
});

test('health\'s ceiling rises only through Ballast (no Transect or Bearing rank carries maxHealth)', () => {
  for (const k of CERTS) for (const p of PERKS[k]) if (k !== 'ballast') assert.equal(p.maxHealth, undefined, `${k}`);
  assert.ok(PERKS.ballast.some((p) => p.maxHealth > 0));
});

/** The live half on a plain ctx: an events bus, no player, no DOM. */
function liveRig() {
  const fns = new Map();
  const events = { on: (n, f) => { if (!fns.has(n)) fns.set(n, []); fns.get(n).push(f); }, emit: (n, e) => { for (const f of fns.get(n) || []) f(e); } };
  const ctx = { events, player: null };
  const text = { certs: { transect: { name: 'TRANSECT', perks: [] }, bearing: { name: 'BEARING', perks: [] }, ballast: { name: 'BALLAST', perks: [] } }, ranks: ['I', 'II', 'III', 'IV'], acts: {}, count: '{n} / {of}', head: '' };
  return { ctx, C: new Certifications(ctx, { text }) };
}

test('the live half counts the seam events it adopted once each, and never twice beside its M2 listeners', () => {
  const { ctx, C } = liveRig();
  ctx.events.emit('transect:crossed', { transect: 'pans-beach', unseen: true });
  ctx.events.emit('transect:crossed', { transect: 'x', unseen: false });
  ctx.events.emit('reed:metres', { m: 30 });
  ctx.events.emit('reed:metres', { m: 20 });   // 50 m: two acts
  assert.equal(C.of('transect').n, 3);
  // a Plumb's lamp and vial are the M2 listeners' ('plumb-dark', 'arrow-hit'): the seam's twin of each counts nothing here
  ctx.events.emit('lamp:dark', { kind: 'plumb' });
  ctx.events.emit('vial:30m', { kind: 'plumb', m: 40 });
  assert.equal(C.of('bearing').n, 0);
  ctx.events.emit('plumb-dark', {});
  assert.equal(C.of('bearing').n, 1);
  // another kind's lamp darkened counts once
  ctx.events.emit('lamp:dark', { kind: 'sonde' });
  assert.equal(C.of('bearing').n, 2);
  // combat's own Undercut (no part) and Pry ('pry' {machine, part}: the M2 'part-torn' counts the Pry) count nothing here
  ctx.events.emit('undercut', { machine: {}, killed: false, damage: 40 });
  ctx.events.emit('pry', { machine: {}, part: 'bob', torn: true });
  assert.equal(C.of('ballast').n, 0);
  // kills, never
  for (let i = 0; i < 10; i++) ctx.events.emit('machine-killed', { machine: { kind: 'peg' } });
  assert.deepEqual(C.rules.counts(), { transect: 3, bearing: 2, ballast: 0 });
  assert.equal(C.rules.ranks().transect, 1);
});
