// HR4 in Node (Milestone 2 area E, wave 3): TRUE GROUND after Benchmark 1 (src/game/quest/true-ground.js), on the
// regions seam's own map of the island recipe and the site clock's hours.
//   after B1: 0 correcting kinds spawn in the Holds over 24 site-clock hours; measuring kinds still do; `painted` is
//   false on every wall; B1 is a travel node; WALK THE LINE to it is refused while Flagged (or with a wary Instrument
//   within 60 m); the regions' truth round-trips through the save seam's 'regions' field.
// Browser-free: node --test tools/gates/systems/true-ground.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TrueGround, CORRECTING_CLASS } from '../../../src/game/quest/true-ground.js';
import { SiteClock, errorAt } from '../../../src/game/sites/clock.js';
import { RegionMap } from '../../../src/core/regions.js';
import { SaveFields } from '../../../src/game/save/fields.js';
import * as NW from '../../../src/world/settlements/ninewalls-layout.js';
import { BENCHMARKS } from '../../../src/world/sites/layout.js';
import { siteById, CISTERN } from '../../../src/world/island/sites.js';
import { ROOT } from './lib.mjs';

const map = new RegionMap().build();
const B1 = BENCHMARKS.find((b) => b.id === 'bm-01');

/** The kinds' own declared size classes, read from their files (the registry builds the same table in the page). */
const KINDS = ['peg', 'plumb', 'tiller', 'gauge', 'sickle', 'screed'];
const CLASS = Object.fromEntries(KINDS.map((k) => {
  const src = readFileSync(`${ROOT}src/instruments/kinds/${k}.js`, 'utf8');
  const m = /sizeClass:\s*'(small|medium|large)'/.exec(src);
  return [k, m ? m[1] : null];
}));

const mk = () => new TrueGround({ regionOf: (x, z) => map.regionAt(x, z), classOf: (k) => CLASS[k] ?? null });

test('the kinds declare their classes, and only the large one corrects', () => {
  assert.deepEqual(CLASS, { peg: 'small', plumb: 'small', tiller: 'medium', gauge: 'medium', sickle: 'medium', screed: 'large' });
  const T = mk();
  assert.deepEqual(KINDS.filter((k) => T.isCorrecting(k)), ['screed']);
  assert.equal(CORRECTING_CLASS, 'large');
});

test('Benchmark 1 and Ninewalls are in the Holds; the re-survey makes the Holds true and nothing else', () => {
  const T = mk();
  const nw = siteById('ninewalls');
  assert.equal(map.regionAt(B1.x, B1.z), 'holds');
  assert.equal(map.regionAt(nw.x, nw.z), 'holds');
  assert.equal(T.trueAt(nw.x, nw.z), false);
  assert.equal(T.makeTrue('holds', { benchmark: 'bm-01', hour: 11.2 }), true);
  assert.equal(T.makeTrue('holds', { benchmark: 'bm-01', hour: 11.3 }), false, 'once');
  assert.equal(T.trueAt(nw.x, nw.z), true);
  assert.equal(T.trueAt(CISTERN.x, CISTERN.z), false, 'the Pans stay in error');
  // the site clock reads it as its datum: the Holds out of error, Saltrow's cistern still in it
  assert.equal(errorAt(T.datum(), nw.x, nw.z), false);
  assert.equal(errorAt(T.datum(), CISTERN.x, CISTERN.z), true);
});

test('over 24 site-clock hours after B1: 0 correcting kinds spawn in the Holds, measuring kinds still do', () => {
  const T = mk();
  const clock = new SiteClock();
  // the Holds' spawn points: round Ninewalls, the herd's slope, the Scar and B1 (engine x, z)
  const nw = siteById('ninewalls');
  const pts = [{ x: nw.x + 90, z: nw.z }, { x: -100, z: 175 }, { x: B1.x + 20, z: B1.z + 10 }, { x: nw.x - 40, z: nw.z - 80 }].filter((p) => map.regionAt(p.x, p.z) === 'holds');
  assert.ok(pts.length >= 3, `${pts.length} Holds points`);
  const tally = (label) => {
    const n = {};
    // every 20 site-clock minutes each point asks the gate for each kind, as doctrine and site respawns ask encounterAllows
    for (let i = 0; i < 72; i++) {
      clock.advance(1 / 3);
      for (const p of pts) for (const k of KINDS) if (!T.refuses(k, p.x, p.z)) n[k] = (n[k] ?? 0) + 1;
    }
    return { label, n };
  };
  const before = tally('before');
  assert.ok(before.n.screed > 0, 'before B1 the Screed may come');
  T.makeTrue('holds', { benchmark: 'bm-01', hour: clock.hours });
  const r0 = T.refused;
  const after = tally('after');
  assert.equal(after.n.screed ?? 0, 0, 'no correcting kind on true ground');
  for (const k of ['peg', 'plumb', 'tiller']) assert.equal(after.n[k], before.n[k], `${k} still spawns`);
  assert.equal(T.refused - r0, 72 * pts.length, 'every Screed ask in 24 h was refused');
  assert.ok(clock.hours >= 48 - 1e-6);
  // outside the Holds a correcting kind is still let in
  assert.equal(T.refuses('screed', CISTERN.x, CISTERN.z), false);
});

test('the line comes off every wall: painted is false on all nine', () => {
  const pair = NW.wallsSave();
  pair.set(null);
  const painted0 = NW.WALLS.filter((w) => NW.wallState(w.id).painted).map((w) => w.id);
  assert.ok(painted0.length >= 1, `painted before: ${painted0.join(', ')}`);
  for (const w of NW.WALLS) NW.setPainted(w.id, false);
  assert.equal(NW.WALLS.filter((w) => NW.wallState(w.id).painted).length, 0);
  assert.equal(NW.WALLS.length, 9);
  // and it holds through the walls' save pair
  const rec = JSON.parse(JSON.stringify(pair.get()));
  pair.set(null);
  pair.set(rec);
  assert.equal(NW.WALLS.filter((w) => NW.wallState(w.id).painted).length, 0);
  pair.set(null);
});

test('B1 is a travel node; WALK THE LINE is refused while Flagged or with a wary Instrument near', () => {
  const T = mk();
  assert.deepEqual(T.nodes(), []);
  T.makeTrue('holds', { benchmark: 'bm-01', hour: 11 });
  assert.deepEqual(T.nodes(), ['bm-01']);
  assert.equal(T.walkRefused({ flagged: true }), 'flagged');
  assert.equal(T.walkRefused({ wary: true }), 'wary');
  assert.equal(T.walkRefused({}), null);
});

test('the regions\' truth round-trips through the save seam (a slice save has none: every region in error)', () => {
  const a = mk();
  a.makeTrue('holds', { benchmark: 'bm-01', hour: 11.25 });
  const F = new SaveFields();
  F.register('regions', { get: () => a.serialize(), set: (v) => a.restore(v) });
  const rec = JSON.parse(JSON.stringify(F.collect()));
  assert.deepEqual(rec, { regions: { holds: { true: true, hour: 11.25, benchmark: 'bm-01' } } });
  const b = mk();
  const G = new SaveFields();
  G.register('regions', { get: () => b.serialize(), set: (v) => b.restore(v) });
  G.apply(rec);
  assert.equal(b.isTrue('holds'), true);
  G.apply(null);
  assert.equal(b.isTrue('holds'), false);
});
