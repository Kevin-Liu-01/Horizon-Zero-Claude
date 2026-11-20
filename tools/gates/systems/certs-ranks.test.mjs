// Milestone 3 wave 1 (area E, HT6's seam): the COUNTED ACTS seam (src/game/certs/rules.js COUNTED_EVENTS, actsOfEvent,
// CountedActs). Every rank of Transect, Bearing and Ballast is reached by seam events alone (12 ranks, 12 tests); ten
// kills move 0 counters; the reed carries its remainder; a lamp darkened by a kill and a vial under 30 m count nothing.
// Browser-free: node --test tools/gates/systems/certs-ranks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CERTS, ACTS, RANK_AT, COUNTED_EVENTS, REED_M, VIAL_M, actsOfEvent, CountedActs } from '../../../src/game/certs/rules.js';

test('the seam names the nine events of the brief, and every act it counts is one of ACTS', () => {
  assert.deepEqual([...COUNTED_EVENTS], ['transect:crossed', 'undercut', 'reed:metres', 'triangle', 'lamp:dark', 'vial:30m', 'resurvey', 'pry', 'made']);
  const sample = {
    'transect:crossed': { transect: 'peg-line', unseen: true }, undercut: { kind: 'tiller', part: 'ram' }, 'reed:metres': { m: REED_M },
    triangle: { id: 'T1-T2-T6' }, 'lamp:dark': { kind: 'plumb' }, 'vial:30m': { kind: 'plumb', m: VIAL_M }, resurvey: { benchmark: 'bm-02' },
    pry: { kind: 'plumb', part: 'bob' }, made: { item: 'brine-pot' },
  };
  for (const name of COUNTED_EVENTS) {
    const acts = actsOfEvent(name, sample[name], {});
    assert.ok(acts.length >= 1, `${name} counts an act`);
    for (const a of acts) assert.ok(a.act in ACTS, `${name} -> ${a.act}`);
  }
});

test('ten kills move 0 counters (no kill name is a seam event)', () => {
  const C = new CountedActs();
  for (let i = 0; i < 10; i++) {
    for (const n of ['machine-killed', 'kill', 'machine-destroyed', 'plumb-topple']) assert.deepEqual(C.emit(n, { kind: 'peg', killed: true }), []);
  }
  assert.deepEqual(C.rules.counts(), { transect: 0, bearing: 0, ballast: 0 });
});

test('what counts nothing: crossed while seen or Flagged, a lamp dark by a kill, a vial under 30 m, an arrow made', () => {
  assert.deepEqual(actsOfEvent('transect:crossed', { transect: 't', unseen: false }), []);
  assert.deepEqual(actsOfEvent('transect:crossed', { transect: 't', unseen: true, flagged: true }), []);
  assert.deepEqual(actsOfEvent('lamp:dark', { kind: 'plumb', killed: true }), []);
  assert.deepEqual(actsOfEvent('vial:30m', { kind: 'plumb', m: VIAL_M - 0.1 }), []);
  assert.deepEqual(actsOfEvent('made', { item: 'hardpoint' }), []);
});

test('the reed counts one act per 25 m hidden, carrying the remainder across emits', () => {
  const C = new CountedActs();
  for (let i = 0; i < 9; i++) C.emit('reed:metres', { m: 10 });   // 90 m
  assert.equal(C.rules.of('transect').n, Math.floor(90 / REED_M));
  assert.ok(Math.abs(C.carry.reed - (90 % REED_M)) < 1e-9);
});

// one event per cert that counts one act each time
const ONE = {
  transect: (i) => ['transect:crossed', { transect: `t${i}`, unseen: true }],
  bearing: (i) => ['triangle', { id: `tri-${i}` }],
  ballast: (i) => ['pry', { kind: 'plumb', part: `p${i}` }],
};

for (const cert of CERTS) {
  for (let rank = 1; rank <= RANK_AT.length; rank++) {
    test(`${cert} ${['I', 'II', 'III', 'IV'][rank - 1]}: granted by seam events alone at ${RANK_AT[rank - 1]} acts, not one before`, () => {
      const C = new CountedActs();
      const at = RANK_AT[rank - 1];
      for (let i = 0; i < at - 1; i++) C.emit(...ONE[cert](i));
      assert.equal(C.rules.of(cert).rank, rank - 1);
      const g = C.emit(...ONE[cert](at - 1));
      assert.equal(C.rules.of(cert).rank, rank);
      assert.ok(g.some((x) => x.cert === cert && x.rank === rank));
      for (const other of CERTS.filter((k) => k !== cert)) assert.equal(C.rules.of(other).n, 0, `${other} untouched`);
    });
  }
}
