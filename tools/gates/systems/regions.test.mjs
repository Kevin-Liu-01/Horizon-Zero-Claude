// Milestone 2 (area F, EN1 and EN2 in Node): the regions seam (src/core/regions.js). Which region a point is in on the
// island recipe's own biome field; enter / leave once per crossing with 20 m of hysteresis; the slice never comes near
// enough to the Holds to fetch their files; no boot row is a file of a region other than the Pans; a failed fetch
// retries and never throws. Browser-free: node --test tools/gates/systems/regions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, BOOT_REGION, HYSTERESIS_M, APPROACH_M, RegionMap, RegionTracker, RegionLoader } from '../../../src/core/regions.js';
import { SITES, TRIG, CISTERN, REST } from '../../../src/world/island/sites.js';
import { SPECS, ANIMS, TEXTURES } from '../../../src/core/assets.specs.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const map = new RegionMap().build();
const at = (id) => SITES.find((s) => s.id === id);
const en = (e, n) => ({ x: e, z: -n });   // ISLAND_SCALE is 1 at 1024 m

test('every biome has one region; the Pans, the Holds and (M3 wave 3c) the Malpais are built', () => {
  const biomes = REGIONS.map((r) => r.biome);
  assert.equal(new Set(biomes).size, biomes.length);
  assert.deepEqual(REGIONS.filter((r) => r.built).map((r) => r.id).sort(), ['holds', 'malpais', 'pans']);
  assert.equal(BOOT_REGION, 'pans');
});

test('places: the slice is in the Pans; Ninewalls, T2 and Benchmark 1 (both the bible\'s point and the code\'s) in the Holds', () => {
  for (const id of ['saltrow', 'salt-pans', 'the-glass', 'organ-shelf', 'sounding-ring', 'black-sand-beach']) assert.equal(map.regionAt(at(id).x, at(id).z), 'pans', id);
  assert.equal(map.regionAt(CISTERN.x, CISTERN.z), 'pans', 'cistern');
  assert.equal(map.regionAt(TRIG[0].x, TRIG[0].z), 'pans', 'T1');
  for (const [name, p] of [['ninewalls', at('ninewalls')], ['T2', TRIG[1]], ['B1 bible (12, -282)', en(12, -282)], ['bm-01 code (19, -243)', en(19, -243)]]) {
    assert.equal(map.regionAt(p.x, p.z), 'holds', name);
  }
});

function walk(a, b, tr, step = 0.5) {
  const L = Math.hypot(b.x - a.x, b.z - a.z), ev = [];
  for (let s = 0; s <= L; s += step) {
    const k = s / L;
    for (const e of tr.update(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) ev.push({ ...e, s });
  }
  return { ev, L };
}

test('the walk from the cistern to Ninewalls: one leave and one enter; back again: one each; the switch points 20 m apart', () => {
  const a = { x: CISTERN.x, z: CISTERN.z }, b = at('ninewalls');
  const tr = new RegionTracker(map);
  const out = walk(a, b, tr).ev.filter((e) => e.type === 'enter' || e.type === 'leave');
  assert.deepEqual(out.map((e) => `${e.type}:${e.region}`), ['enter:pans', 'leave:pans', 'enter:holds']);
  const back = walk(b, a, tr);
  const bk = back.ev.filter((e) => e.type === 'enter' || e.type === 'leave');
  assert.deepEqual(bk.map((e) => `${e.type}:${e.region}`), ['leave:holds', 'enter:pans']);
  const sOut = out[2].s, sBack = back.L - bk[1].s;   // both measured from the cistern
  const gap = sOut - sBack;
  console.log(`  crossing: enter the Holds ${sOut.toFixed(1)} m from the cistern, back into the Pans at ${sBack.toFixed(1)} m: ${gap.toFixed(1)} m apart (bar ${HYSTERESIS_M})`);
  assert.ok(Math.abs(gap - HYSTERESIS_M) <= 4, `switch points ${gap.toFixed(1)} m apart`);
});

test('jitter on the border inside the band fires nothing', () => {
  const a = { x: CISTERN.x, z: CISTERN.z }, b = at('ninewalls');
  const tr = new RegionTracker(map);
  // find the border along the line
  let border = null;
  for (let k = 0; k <= 1; k += 0.001) { const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k; if (map.regionAt(x, z) === 'holds') { border = k; break; } }
  assert.ok(border != null);
  const L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
  const bx = a.x + (b.x - a.x) * border, bz = a.z + (b.z - a.z) * border;
  tr.update(bx - ux * 30, bz - uz * 30);
  let n = 0;
  for (let i = 0; i < 2000; i++) { const o = Math.sin(i * 0.37) * 8; n += tr.update(bx + ux * o, bz + uz * o).filter((e) => e.type === 'enter' || e.type === 'leave').length; }
  assert.equal(n, 0);
});

test(`the slice never approaches the Holds (no Holds file fetched before the walk; APPROACH_M ${APPROACH_M})`, () => {
  const places = [['cistern', CISTERN], ['rest', REST], ['T1', TRIG[0]], ...['saltrow', 'salt-pans', 'the-glass', 'organ-shelf', 'sounding-ring', 'black-sand-beach'].map((id) => [id, at(id)])];
  for (const [name, p] of places) {
    const d = map.depth('holds', p.x, p.z);
    console.log(`  ${name.padEnd(17)} ${(-d).toFixed(1)} m from the Holds`);
    assert.ok(d < -APPROACH_M, `${name} is ${(-d).toFixed(1)} m from the Holds`);
  }
});

test('the first load carries no file of a region other than the Pans (EN2, read from the boot rows and public/)', () => {
  const prefixes = REGIONS.filter((r) => r.id !== BOOT_REGION).flatMap((r) => r.files.map((f) => ({ region: r.id, f })));
  const rows = [...Object.entries(SPECS), ...Object.entries(ANIMS), ...Object.entries(TEXTURES)];
  for (const [name, row] of rows) {
    const urls = typeof row === 'string' ? [row] : Object.values(row || {}).filter((v) => typeof v === 'string' && v.startsWith('/'));
    for (const u of urls) for (const { region, f } of prefixes) assert.ok(!u.replace(/^\//, '').startsWith(f), `boot row ${name} (${u}) is a ${region} file`);
  }
  // the region rows themselves are deferred rows, never boot rows
  for (const r of REGIONS) for (const name of Object.keys(r.assets)) assert.ok(!(name in SPECS), `${r.id} row ${name} is a boot row`);
  let files = 0;
  for (const { f } of prefixes) {
    const d = path.join(REPO, 'public', f);
    if (existsSync(d) && statSync(d).isDirectory()) files += readdirSync(d, { recursive: true }).length;
  }
  console.log(`  ${prefixes.length} region path prefixes; ${files} files under them in public/ today`);
});

test('the loader: approach fetches, a failure retries on its backoff and never throws, depart unloads', async () => {
  let t = 0, calls = 0, fail = 2, unloaded = 0;
  const fakeMap = new RegionMap({ classify: (x) => (x < 0 ? 'pans' : 'holds'), size: 400, cell: 4 }).build();
  // (M3 fix round 1, area F) the tracker pinned at M2's 90 m, so this walk is M2's own: the Holds' M3 approach (60 m on
  // foot, regions.js data) is tested in tools/perf/region-hitch.test.mjs
  const tr = new RegionTracker(fakeMap, { approach: APPROACH_M });
  // the real Holds has no rows yet: the loader is handed one through its assetsOf
  const ld = new RegionLoader(tr, {
    now: () => t,
    assetsOf: (r) => (r.id === 'holds' ? { probeRow: { url: '/models/holds/probe.glb' } } : {}),
    load: async (r, rows) => { calls++; assert.equal(r.id, 'holds'); assert.ok(rows.probeRow); if (fail-- > 0) throw new Error('offline'); },
    unload: () => { unloaded++; },
  });
  tr.update(-150, 0);                 // in the Pans, 150 m from the Holds
  assert.ok(!tr.near.has('holds'));
  tr.update(-80, 0);                  // within 90 m: approach
  assert.ok(tr.near.has('holds'));
  await new Promise((r) => setImmediate(r));
  assert.equal(ld.status().holds.state, 'failed');
  ld.tick(); assert.equal(calls, 1, 'no retry before the backoff');
  t = 1000; ld.tick(); await new Promise((r) => setImmediate(r));
  assert.equal(calls, 2); assert.equal(ld.status().holds.state, 'failed');
  t = 3000; ld.tick(); await new Promise((r) => setImmediate(r));
  assert.equal(calls, 3); assert.equal(ld.status().holds.state, 'resident');
  tr.update(-190, 0);                  // past the approach plus the band: depart
  assert.ok(!tr.near.has('holds'));
  assert.equal(unloaded, 1);
  // a region with no rows is resident at once and never calls load
  const tr2 = new RegionTracker(fakeMap); const ld2 = new RegionLoader(tr2, { load: () => { throw new Error('never'); } });
  tr2.update(10, 0);
  assert.equal(ld2.status().holds.state, 'resident');
});
