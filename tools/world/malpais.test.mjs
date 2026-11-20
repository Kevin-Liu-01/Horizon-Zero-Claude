/**
 * node --test tools/world/malpais.test.mjs — the Malpais and the Kiln Yards at blockout (M3 wave 1, area A): the
 * wellheads seam (src/world/sites/kilnyards-layout.js), the layout's room and counts (MP5), the ground's footprint
 * (malpais-ground.js), Rust Cone's top (MP3), the zones (MP9's data half).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../../src/world/sites/kilnyards-layout.js';
import * as M from '../../src/world/sites/malpais-layout.js';
import { malpaisHeight } from '../../src/world/sites/malpais-ground.js';
import { ensureMacro, heightAt } from '../../src/world/island/recipe.js';
import { buildKilnYards, kilnLayout } from '../../src/world/island/kilnyards.js';
import { siteById } from '../../src/world/island/sites.js';
import { ZONE_SPEED, malpaisZoneAt, groundSpeedAt } from '../../src/world/sites/malpais-zones.js';

test('four wellheads, hot, nothing plugged, on a new game', () => {
  K.resetWellheads();
  assert.equal(K.WELLHEADS.length, 4);
  assert.deepEqual(K.hotWellheads(), ['wh-1', 'wh-2', 'wh-3', 'wh-4']);
  for (const w of K.wellheads()) { assert.equal(w.state, 'hot'); assert.equal(w.plugged, null); }
  assert.equal(K.allQuenched(), false);
});

test('a Kiln plugs into a hot wellhead only; Brine quenches it and unplugs it; it never heats again', () => {
  K.resetWellheads();
  const seen = [];
  const off = K.onWellheadChange((id) => seen.push(id));
  assert.equal(K.plugIn('wh-2', 'kiln'), true);
  assert.equal(K.plugIn('wh-2', 'kiln'), false, 'one hose a head');
  assert.equal(K.wellheadState('wh-2').plugged, 'kiln');
  assert.equal(K.setQuenched('wh-2'), true);
  assert.deepEqual(K.wellheadState('wh-2'), { id: 'wh-2', state: 'quenched', plugged: null });
  assert.equal(K.plugIn('wh-2', 'kiln'), false, 'a quenched head is never chosen');
  assert.equal(K.setQuenched('wh-2'), false);
  assert.deepEqual(seen, ['wh-2', 'wh-2']);
  off();
  for (const id of ['wh-1', 'wh-3', 'wh-4']) K.setQuenched(id);
  assert.equal(K.quenchedCount(), 4);
  assert.equal(K.allQuenched(), true);
  assert.equal(K.wellheadState('nope'), null);
});

test('the save pair round-trips the state; null is a new game; a plugged kind is not carried', () => {
  K.resetWellheads();
  K.setQuenched('wh-1'); K.plugIn('wh-3', 'kiln');
  const S = K.wellheadsSave();
  const v = JSON.parse(JSON.stringify(S.get()));
  K.resetWellheads();
  S.set(v);
  assert.equal(K.wellheadState('wh-1').state, 'quenched');
  assert.equal(K.wellheadState('wh-3').state, 'hot');
  assert.equal(K.wellheadState('wh-3').plugged, null);
  S.set(null);
  assert.equal(K.quenchedCount(), 0);
  S.set({ 'wh-4': { state: 'molten' } });
  assert.equal(K.wellheadState('wh-4').state, 'hot', 'an unknown state is refused');
});

test('nearestWellhead within QUENCH_R', () => {
  K.resetWellheads();
  const w = K.WELLHEADS[0];
  assert.equal(K.nearestWellhead(w.x + 2, w.z, K.QUENCH_R).id, w.id);
  assert.equal(K.nearestWellhead(w.x + 4, w.z + 2, K.QUENCH_R), null);
});

test('each wellhead keeps a Kiln room (5.0 x 3.4 m) on the apron, clear of the others, the heads and the rack posts', () => {
  const rects = K.WELLHEADS.map((w) => { const q = K.apronUV(w.kilnStand.e, w.kilnStand.n); return { u0: q.u - 2.5, u1: q.u + 2.5, v0: q.v - 1.7, v1: q.v + 1.7 }; });
  for (const r of rects) {
    assert.ok(r.u0 >= -K.APRON.halfLen + 0.5 && r.u1 <= K.APRON.halfLen - 0.5 && r.v0 >= -K.APRON.halfWid + 0.5 && r.v1 <= K.APRON.halfWid - 0.5);
    for (const s of rects) if (s !== r) assert.ok(!(r.u0 < s.u1 && s.u0 < r.u1 && r.v0 < s.v1 && s.v0 < r.v1));
    for (const w of K.WELLHEADS) { const q = K.apronUV(w.e, w.n); assert.ok(!(q.u > r.u0 - w.r && q.u < r.u1 + w.r && q.v > r.v0 - w.r && q.v < r.v1 + w.r)); }
    for (const p of K.rackPosts()) { const q = K.apronUV(p.x, -p.z); assert.ok(!(q.u > r.u0 - 0.8 && q.u < r.u1 + 0.8 && q.v > r.v0 - 0.8 && q.v < r.v1 + 0.8), p.id); }
  }
});

test('MP5: two stubs of 22-28 m, 3-5 stacks, racks, four wellheads; the far form reads the seam within 0.1 m', () => {
  ensureMacro();
  const ky = siteById('kiln-yards');
  const far = buildKilnYards({ x: ky.x, z: ky.z, ground: heightAt });
  assert.equal(far.counts.towers, 2);
  for (const t of K.YARDS.towers) assert.ok(t.h >= 22 && t.h <= 28);
  assert.ok(far.counts.stacks >= 3 && far.counts.stacks <= 5);
  assert.ok(far.counts.racks >= 1);
  assert.equal(far.counts.wellheads, 4);
  const L = kilnLayout(ky.x, ky.z);
  L.wells.forEach((w, i) => assert.ok(Math.hypot(ky.x + w.dx - K.WELLHEADS[i].x, ky.z + w.dz - K.WELLHEADS[i].z) <= 0.1));
  far.dispose();
});

test('the blockout changes the ground only inside its footprint, and levels the apron at its height', () => {
  const F = M.FOOTPRINT;
  for (const [e, n] of [[F.e0 - 0.5, -20], [F.e1 + 0.5, -20], [200, F.n0 - 0.5], [200, F.n1 + 0.5], [-200, 300]]) {
    const h = 17.123456789;
    assert.equal(malpaisHeight(e, n, h), h, `${e}, ${n}`);
  }
  ensureMacro();
  for (const [u, v] of [[0, 0], [-20, -8], [20, 8], [K.APRON.halfLen - 0.5, -K.APRON.halfWid + 0.5]]) {
    const p = K.apronPoint(u, v);
    assert.ok(Math.abs(heightAt(p.e, -p.n) - K.APRON.h) < 1e-6);
  }
  // the tube's floor under its crust
  const T = M.TUBE_SHELTER, p = K.apronPoint(T.u, T.v0 + 15);
  assert.ok(Math.abs(heightAt(p.e, -p.n) - M.tubeFloor(T.v0 + 15)) < 1e-6);
});

test('MP3: Rust Cone\'s top at 145 +-3, T3 on it', () => {
  ensureMacro();
  const top = heightAt(M.RUST_CONE.x, M.RUST_CONE.z);
  assert.ok(Math.abs(top - 145) <= 3, `top ${top}`);
});

test('the zones: aa slows her to 0.8, pahoehoe and cinder do not; off the Malpais nothing does', () => {
  assert.equal(ZONE_SPEED.aa, 0.8);
  let aa = null, pah = null;
  for (let x = 150; x <= 330 && (!aa || !pah); x += 4) for (let z = -60; z <= 230; z += 4) {
    const zn = malpaisZoneAt(x, z);
    if (!aa && zn.zone === 'aa' && zn.malpais > 0.99 && zn.pahoehoe === 0 && zn.cinder === 0) aa = { x, z };
    if (!pah && zn.zone === 'pahoehoe' && zn.malpais > 0.99 && zn.pahoehoe === 1) pah = { x, z };
  }
  assert.ok(aa && pah);
  assert.ok(Math.abs(groundSpeedAt(aa.x, aa.z) - 0.8) < 0.005, `aa ${groundSpeedAt(aa.x, aa.z)}`);
  assert.equal(groundSpeedAt(pah.x, pah.z), 1);
  assert.equal(groundSpeedAt(-200, 300), 1);
});
