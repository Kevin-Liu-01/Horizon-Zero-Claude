// Milestone 3 debt D9 (area F, EF2): residency per place, in Node, from the regions seam's data
// (tools/perf/region-hitch-resident.mjs). The always set plus every region's files adds up to the texture ledger's
// total (nothing counted twice or dropped); the Holds' people are read from the game's own HOLDS_CAST; the Malpais is
// held at its stand-in line until it has files; the four places of the M3 exit are each reported with both sums.
// Browser-free: node --test tools/perf/region-hitch-resident.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { residentLedger, CAP_MB } from './region-hitch-resident.mjs';
import { readAssets, runTextureLedger } from '../tier0/budgets.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = readAssets(REPO);
const L = await residentLedger({ root: REPO, assets });

test('the always set and the regions\' files add up to the texture ledger (stand-ins apart)', async () => {
  const T = await runTextureLedger({ root: REPO, assets });
  const files = L.alwaysMb + Object.values(L.regions).reduce((s, r) => s + (r.standIn ? 0 : r.mb), 0);
  assert.ok(Math.abs(files - T.details.totalMb) < 0.05, `${files} vs ${T.details.totalMb}`);
});

test('the Holds carry their cast (HOLDS_CAST less the boot archetypes); the Malpais its stand-in line until it has files', () => {
  assert.equal(L.regions.holds.cast, 5);
  assert.ok(L.regions.holds.mb > 0);
  if (L.regions.malpais.files === 1) assert.equal(L.regions.malpais.standIn, 16);
  assert.deepEqual(L.regions.malpais.approach, { walk: 60, flight: 150 });
});

test('four places, each with its region and both sums; the Yards are in the Malpais, the flight is over the Pans', () => {
  assert.deepEqual(L.places.map((p) => p.id), ['saltrow', 'ninewalls', 'kiln-yards', 'flight-pans']);
  const by = Object.fromEntries(L.places.map((p) => [p.id, p]));
  assert.equal(by.saltrow.region, 'pans');
  assert.equal(by.ninewalls.region, 'holds');
  assert.equal(by['kiln-yards'].region, 'malpais');
  assert.equal(by['flight-pans'].region, 'pans');
  assert.equal(by['flight-pans'].mode, 'flight');
  for (const p of L.places) {
    assert.ok(p.byRegion > 0 && p.today >= p.byRegion && p.withPlan >= p.today);
    assert.equal(p.top5.length, 5);
    console.log(`  ${p.id}: by region ${p.byRegion}, today ${p.today}, with the plan lines ${p.withPlan} (cap ${CAP_MB})`);
  }
});
