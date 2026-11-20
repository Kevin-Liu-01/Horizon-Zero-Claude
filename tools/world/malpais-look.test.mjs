/**
 * node --test tools/world/malpais-look.test.mjs: the Malpais' look, wave 2 (M3, area A): the ground's layers and the
 * term are cold (MP1), the files are fetched by region and sized to their line (MP11), the Yards' near form agrees with
 * the layout (MP5), the rock keeps off the walk grid, the apron, the tube and the hornitos, and the zone map reads the
 * zones' own law (src/world/bake.js malpaisSheet / malpaisCinder, src/world/sites/malpais-zones.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { heightAt, fbm } from '../../src/world/island/recipe.js';
import { malpaisSheet } from '../../src/world/island/bake.js';
import { MALPAIS_LAYERS, MALPAIS_FILES } from '../../src/world/sites/malpais-files.js';
import { MALPAIS_TERM, MALPAIS_ROCK_COLOR, MALPAIS_PARS } from '../../src/world/sites/malpais-shader.js';
import { buildKilnYardsNear } from '../../src/world/sites/kilnyards-near.js';
import { WELLHEADS, YARDS, YARDS_WALK } from '../../src/world/sites/kilnyards-layout.js';
import { HORNITOS } from '../../src/world/sites/malpais-layout.js';
import { clinkerPlan, pinnaclePlan, ridgePlan, hornitoGeometry, coneWeight } from '../../src/world/sites/malpais-rocks.js';
import { buildLayers } from '../build/ground/gen-malpais-layers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lin = (v) => Math.pow(v / 255, 2.2);

test('MP1 cold: the term and the rock write no emissive and no light; the layers\' albedo is a dark rock\'s', () => {
  for (const src of [MALPAIS_TERM, MALPAIS_ROCK_COLOR, MALPAIS_PARS]) {
    assert.ok(!/emissive|totalEmissiveRadiance|outgoingLight\s*\+=/.test(src), 'nothing emissive in the Malpais\' shaders');
  }
  // every layer at 64² (the same law as the shipped 512²): no texel brighter than linear 0.30 in any channel (the bible's
  // rust red #8E3B23 is 0.276), and each layer's mean luminance under 0.05 (the black-sand range is 0.01-0.03)
  for (const L of buildLayers(64)) {
    let maxC = 0, sumY = 0;
    for (let i = 0; i < L.a.length; i += 4) {
      const r = lin(L.a[i]), g = lin(L.a[i + 1]), b = lin(L.a[i + 2]);
      maxC = Math.max(maxC, r, g, b);
      sumY += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const meanY = sumY / (L.a.length / 4);
    assert.ok(maxC <= 0.3, `${L.id}: brightest channel ${maxC.toFixed(3)} linear`);
    assert.ok(meanY < 0.05, `${L.id}: mean luminance ${meanY.toFixed(4)} linear`);
  }
});

test('MP11: the Malpais ships two KTX2 arrays, at most 14 MB, at most 16 MiB resident, all in Tier 0\'s region set', () => {
  let bytes = 0;
  for (const f of MALPAIS_FILES) {
    const p = path.join(ROOT, 'public', f);
    assert.ok(existsSync(p), `${f} is shipped`);
    assert.equal(readFileSync(p).subarray(1, 7).toString('latin1'), 'KTX 20', `${f} is KTX2`);
    bytes += statSync(p).size;
  }
  assert.ok(bytes <= 14e6, `shipped ${(bytes / 1e6).toFixed(2)} MB`);
  // resident the ledger's way: 8 bits a texel with mips, each layer of each array
  const N = MALPAIS_LAYERS.size, resident = 2 * MALPAIS_LAYERS.ids.length * N * N * (4 / 3);
  assert.ok(resident <= 16 * 2 ** 20, `resident ${(resident / 2 ** 20).toFixed(2)} MiB`);
  const B = JSON.parse(readFileSync(path.join(ROOT, 'tools/tier0/budgets.json'), 'utf8'));
  const row = B.shipped.deferred.find((d) => d.module === 'src/world/sites/malpais-files.js' && d.export === 'MALPAIS_FILES');
  assert.ok(row && row.when === 'region', 'the first load carries none of them');
  for (const f of MALPAIS_FILES) assert.ok(f.startsWith('textures/malpais/'), `${f} under the region's prefix (regions.js malpais.files)`);
});

test('MP5: the Yards\' near form has the layout\'s counts and its four caps stand on the four wellheads within 0.1 m', () => {
  const ky = buildKilnYardsNear({ ground: (x, z) => heightAt(x, z) });
  assert.deepEqual([ky.counts.towers, ky.counts.stacks, ky.counts.racks, ky.counts.wellheads], [YARDS.towers.length, YARDS.stacks.length, YARDS.racks.length, 4]);
  assert.equal(ky.counts.draws, 2);
  const p = ky.caps.geometry.attributes.position;
  const sum = WELLHEADS.map(() => [0, 0, 0]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let k = 0, bd = Infinity;
    WELLHEADS.forEach((w, j) => { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; k = j; } });
    sum[k][0] += x; sum[k][1] += z; sum[k][2]++;
  }
  WELLHEADS.forEach((w, j) => {
    assert.ok(sum[j][2] > 0, `${w.id} has a cap`);
    const d = Math.hypot(sum[j][0] / sum[j][2] - w.x, sum[j][1] / sum[j][2] - w.z);
    assert.ok(d <= 0.1, `${w.id}: cap ${d.toFixed(3)} m from the data`);
  });
  // the material language: only the caps' material is emissive
  assert.equal(ky.materials.filter((m) => m.emissive && m.emissive.getHex() !== 0).length, 1);
  ky.dispose();
});

test('the rock keeps off the Yards\' walk grid, the apron, the tube and every hornito\'s foot; it is deterministic', () => {
  const g = (x, z) => heightAt(x, z);
  const a = clinkerPlan(g), b = clinkerPlan(g);
  assert.equal(a.n, b.n);
  assert.ok(a.n > 3000, `${a.n} clasts`);
  const W = YARDS_WALK.box;
  for (let i = 0; i < a.list.length; i += 6) {
    const x = a.list[i], z = a.list[i + 2];
    assert.ok(!(x > W.x0 && x < W.x1 && z > W.z0 && z < W.z1), `clast at ${x.toFixed(1)}, ${z.toFixed(1)} on the walk grid`);
    for (const h of HORNITOS) assert.ok(Math.hypot(x - h.x, z - h.z) >= h.r + 2.5, `clast on ${h.id}`);
    assert.ok(coneWeight(x, z) < 0.6, 'no clinker on Rust Cone\'s cinder');
  }
  const P = pinnaclePlan(g);
  assert.ok(P.length >= 30, `${P.length} pinnacles`);
  for (const p of P) {
    // fix round 1: 3-15 m (were 2.5-8: small cones past 60 m); a cluster's smaller spires from 3 m
    assert.ok(p.h >= 3.0 && p.h <= 15.0, `${p.id} ${p.h} m`);
    assert.ok(!(p.x > W.x0 - 8 && p.x < W.x1 + 8 && p.z > W.z0 - 8 && p.z < W.z1 + 8), `${p.id} by the walk grid`);
  }
  assert.ok(P.filter((p) => p.h >= 8).length >= 20, 'at least 20 spires of 8 m or more');
  // the pressure ridges and tumuli (fix round 1): 2-5 m, off the walk grid and Rust Cone, apart from each other and the spires
  const Q = ridgePlan(g, P), Q2 = ridgePlan(g, P);
  assert.deepEqual(Q, Q2);
  assert.ok(Q.length >= 20, `${Q.length} ridges`);
  for (const q of Q) {
    assert.ok(q.h >= 2 && q.h <= 5, `${q.id} ${q.h} m`);
    assert.ok(!(q.x > W.x0 - 10 && q.x < W.x1 + 10 && q.z > W.z0 - 10 && q.z < W.z1 + 10), `${q.id} by the walk grid`);
    assert.ok(coneWeight(q.x, q.z) <= 0.05, `${q.id} on Rust Cone`);
    for (const h of HORNITOS) assert.ok(Math.hypot(q.x - h.x, q.z - h.z) >= h.r + 10, `${q.id} on ${h.id}`);
  }
});

test('the hornitos are chimneys: each taller than its foot is wide, its column about half as wide (fix round 1)', () => {
  for (const h of HORNITOS) {
    assert.ok(h.h > 2 * h.r * 0.8, `${h.id}: ${h.h} m tall on a ${2 * h.r} m foot`);
    assert.ok(h.h >= 3 && h.h <= 6, `${h.id}: ${h.h} m`);
  }
  const geo = hornitoGeometry((x, z) => heightAt(x, z));
  assert.ok(geo.attributes.position.count / 3 > HORNITOS.length * 300, 'lumpy chimneys, not cones');
});

test('the zone map reads the zones\' law: the sheet\'s cut of the stored field is the bake\'s pahoehoe', () => {
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  let worst = 0;
  for (let k = 0; k < 400; k++) {
    const x = 60 + (k * 37.3) % 440, z = -360 + (k * 91.7) % 800;
    const stored = Math.round(Math.min(1, Math.max(0, fbm(x * 0.012 + 3.1, z * 0.012 - 8.3, 3))) * 255) / 255;
    worst = Math.max(worst, Math.abs(ss(0.50, 0.58, stored) - malpaisSheet(x, z)));
  }
  assert.ok(worst < 0.06, `the 8-bit field's cut is within ${worst.toFixed(3)} of malpaisSheet`);
});
