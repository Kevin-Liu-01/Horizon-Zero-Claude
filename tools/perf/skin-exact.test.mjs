/**
 * C5 (engine lane): rig/ground.js `skinVertex` and `skinVertexPlanned` (a wreck's: its vertices' plans and their kept
 * skinned positions) are three's `SkinnedMesh.applyBoneTransform`, bit for bit, and cheaper. Random skinned meshes
 * (float and normalized-uint8 weights, 1-4 influences, a posed hierarchy of bones, a bind matrix off the identity):
 * every vertex compared as doubles (Object.is on x, y and z) over passes where the bones move, stand still, the body
 * moves under them, and the geometry is cloned (a corpse's own copy); then the three are timed.
 *
 *   node --test tools/perf/skin-exact.test.mjs        (or: node tools/perf/skin-exact.test.mjs --bench)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { skinVertex, skinVertexPlanned, skinWorldPlanned, skinBatch, skinPass, skinCheck, posedLowest, posedStats, refreshPosedBounds, CorpseShape } from '../../src/entities/machines/rig/ground.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function makeMesh(seed, nVerts, nBones, normalized) {
  const R = rng(seed);
  const bones = [];
  for (let b = 0; b < nBones; b++) {
    const bone = new THREE.Bone();
    bone.position.set(R() - 0.5, R() * 0.6, R() - 0.5);
    bone.quaternion.setFromEuler(new THREE.Euler(R() - 0.5, R() * 2, R() - 0.5));
    if (b > 0) bones[Math.floor(R() * b)].add(bone);
    bones.push(bone);
  }
  const root = new THREE.Group();
  root.position.set(R() * 40 - 20, R() * 5, R() * 40 - 20);
  root.rotation.y = R() * 6;
  const pos = new Float32Array(nVerts * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = (R() - 0.5) * 3;
  const si = new Uint16Array(nVerts * 4);
  const sw = normalized ? new Uint8Array(nVerts * 4) : new Float32Array(nVerts * 4);
  for (let i = 0; i < nVerts; i++) {
    const k = 1 + Math.floor(R() * 4);
    let sum = 0; const ws = [0, 0, 0, 0];
    for (let c = 0; c < k; c++) { ws[c] = R() + 0.05; sum += ws[c]; }
    for (let c = 0; c < 4; c++) {
      si[i * 4 + c] = Math.floor(R() * nBones);
      sw[i * 4 + c] = normalized ? Math.round((ws[c] / sum) * 255) : ws[c] / sum;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, normalized));
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
  mesh.position.set(R() * 0.3, R() * 0.2, R() * 0.3);
  mesh.rotation.x = R() * 0.4;
  root.add(mesh);
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  // pose it away from the bind
  for (const b of bones) { b.rotation.x += R() - 0.5; b.rotation.z += R() - 0.5; b.position.y += R() * 0.2; }
  root.position.y += 0.37;
  root.updateMatrixWorld(true);
  return mesh;
}

const CASES = [[1, 4000, 24, false], [2, 4000, 60, true], [3, 1500, 7, false], [4, 3000, 33, true]];

test('skinVertex is applyBoneTransform, bit for bit', () => {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const [seed, n, nb, norm] of CASES) {
    const o = makeMesh(seed, n, nb, norm);
    const P = o.geometry.attributes.position;
    for (let pass = 0; pass < 2; pass++) {
      skinPass();
      let diff = 0;
      for (let i = 0; i < P.count; i++) {
        a.fromBufferAttribute(P, i); o.applyBoneTransform(i, a);
        b.fromBufferAttribute(P, i); skinVertex(o, i, b);
        if (!Object.is(a.x, b.x) || !Object.is(a.y, b.y) || !Object.is(a.z, b.z)) diff++;
        skinVertexPlanned(o, i, b);
        if (!Object.is(a.x, b.x) || !Object.is(a.y, b.y) || !Object.is(a.z, b.z)) diff++;
      }
      assert.equal(diff, 0, `case ${seed} pass ${pass}: ${diff} of ${P.count} vertices differ`);
      // move the bones: the next pass must see them
      for (const bone of o.skeleton.bones) bone.rotation.y += 0.13;
      o.parent.updateMatrixWorld(true);
    }
  }
});

test('the planned skin keeps a pose, and only while nothing moved', () => {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const o = makeMesh(11, 2500, 30, true);
  const check = (what) => {
    skinPass();
    const P = o.geometry.attributes.position;
    let diff = 0;
    for (let r = 0; r < 2; r++) for (let i = 0; i < P.count; i += 1 + r) {   // twice: the second read is the kept one
      a.fromBufferAttribute(P, i); o.applyBoneTransform(i, a);
      skinVertexPlanned(o, i, b);
      if (!Object.is(a.x, b.x) || !Object.is(a.y, b.y) || !Object.is(a.z, b.z)) diff++;
      a.applyMatrix4(o.matrixWorld);
      skinWorldPlanned(o, i, b);
      if (!Object.is(a.x, b.x) || !Object.is(a.y, b.y) || !Object.is(a.z, b.z)) diff++;
    }
    assert.equal(diff, 0, `${what}: ${diff} differ`);
  };
  check('first');
  check('nothing moved');
  o.skeleton.bones[3].rotation.z += 0.2; o.parent.updateMatrixWorld(true); check('one bone moved');
  o.parent.position.y -= 0.31; o.parent.updateMatrixWorld(true); check('the body moved');
  o.position.x += 0.05; o.updateMatrixWorld(true); check('the mesh moved, not its bones');
  o.geometry = o.geometry.clone(); check('the geometry cloned');
  const P = o.geometry.attributes.position; P.setY(7, P.getY(7) + 0.5); P.needsUpdate = true; check('a vertex edited');
  // posedLowest over the planned path, against three's
  o.skeleton.bones[1].rotation.x -= 0.4; o.parent.updateMatrixWorld(true);
  const m = { root: o.parent };
  const low = posedLowest(m, 4000);
  let y = Infinity;
  for (let i = 0; i < P.count; i++) { a.fromBufferAttribute(P, i); o.applyBoneTransform(i, a); a.applyMatrix4(o.matrixWorld); if (a.y < y) y = a.y; }
  assert.ok(Object.is(low.y, y), `posedLowest ${low.y} vs ${y}`);
});

test('refreshPosedBounds (a wreck) reads the minima three gives', () => {
  const o = makeMesh(21, 3000, 20, true);
  const m = { root: o.parent };
  for (let r = 0; r < 3; r++) {
    o.skeleton.bones[2].rotation.y += 0.3; o.parent.updateMatrixWorld(true);
    refreshPosedBounds(m, 1000);
    const P = o.geometry.attributes.position, step = Math.max(1, Math.floor(P.count / 1000)), a = new THREE.Vector3();
    let mny = Infinity, wmin = Infinity;
    for (let i = 0; i < P.count; i += step) { a.fromBufferAttribute(P, i); o.applyBoneTransform(i, a); if (a.y < mny) mny = a.y; a.applyMatrix4(o.matrixWorld); if (a.y < wmin) wmin = a.y; }
    // the box is shrunk about its centre to land its world floor on wmin (k), so compare the unshrunk input: re-run
    // the same loop through the planned path and read the same minima
    let mny2 = Infinity, wmin2 = Infinity; const b = new THREE.Vector3();
    skinPass();
    for (let i = 0; i < P.count; i += step) { skinVertexPlanned(o, i, b); if (b.y < mny2) mny2 = b.y; skinWorldPlanned(o, i, b); if (b.y < wmin2) wmin2 = b.y; }
    assert.ok(Object.is(mny, mny2) && Object.is(wmin, wmin2), `round ${r}: ${mny} ${mny2} ${wmin} ${wmin2}`);
  }
});

test('skinBatch (strided and by index, local and world) is three, bit for bit, new pose and kept', () => {
  const o = makeMesh(31, 3000, 25, true), P = o.geometry.attributes.position, a = new THREE.Vector3();
  const idx = Uint32Array.from({ length: 900 }, (_, k) => (k * 7) % P.count);
  for (let r = 0; r < 4; r++) {
    if (r % 2 === 0) { o.skeleton.bones[4].rotation.z += 0.21; o.parent.position.x += 0.1; o.parent.updateMatrixWorld(true); }
    skinPass();
    for (const [ix, start, step, cnt] of [[null, 0, 3, Math.ceil(P.count / 3)], [idx, 100, 1, 700]]) {
      const Lc = new Float64Array(cnt * 3), Wc = new Float64Array(cnt * 3);
      assert.ok(skinBatch(o, ix, start, step, cnt, Lc, Wc));
      let diff = 0;
      for (let k = 0; k < cnt; k++) {
        const i = ix ? ix[start + k] : start + k * step;
        a.fromBufferAttribute(P, i); o.applyBoneTransform(i, a);
        if (!Object.is(a.x, Lc[k * 3]) || !Object.is(a.y, Lc[k * 3 + 1]) || !Object.is(a.z, Lc[k * 3 + 2])) diff++;
        a.applyMatrix4(o.matrixWorld);
        if (!Object.is(a.x, Wc[k * 3]) || !Object.is(a.y, Wc[k * 3 + 1]) || !Object.is(a.z, Wc[k * 3 + 2])) diff++;
      }
      assert.equal(diff, 0, `round ${r} ${ix ? 'idx' : 'strided'}: ${diff} differ`);
    }
  }
});

test('the corpse loops under skinCheck: every sample three\'s', () => {
  const o = makeMesh(41, 4000, 18, false);
  const m = { root: o.parent, ctx: { terrain: { getHeight: () => 0 } } };
  const sh = new CorpseShape(m, (b) => o.skeleton.bones.indexOf(b) < 3);
  sh.build();
  skinCheck.on = true; skinCheck.n = 0; skinCheck.diff = 0;
  try {
    for (let r = 0; r < 3; r++) {
      o.skeleton.bones[5].rotation.x += 0.3; o.parent.updateMatrixWorld(true);
      refreshPosedBounds(m, 1500); sh.skin(); posedLowest(m, 4000); posedStats(m, 900);
    }
  } finally { skinCheck.on = false; }
  assert.ok(skinCheck.n > 20000, `checked ${skinCheck.n}`);
  assert.equal(skinCheck.diff, 0);
});

test('a stale pass is not used after skinPass()', () => {
  const o = makeMesh(9, 200, 12, false);
  const P = o.geometry.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3();
  skinPass(); b.fromBufferAttribute(P, 5); skinVertex(o, 5, b);
  o.skeleton.bones[0].rotation.x += 0.5; o.parent.updateMatrixWorld(true);
  skinPass(); b.fromBufferAttribute(P, 5); skinVertex(o, 5, b);
  a.fromBufferAttribute(P, 5); o.applyBoneTransform(5, a);
  assert.ok(Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z));
});

if (process.argv.includes('--bench')) {
  const o = makeMesh(2, 4000, 40, true), P = o.geometry.attributes.position, v = new THREE.Vector3();
  const time = (f) => { const t = performance.now(); for (let r = 0; r < 60; r++) f(); return (performance.now() - t) / 60; };
  for (let w = 0; w < 3; w++) {
    const t3 = time(() => { for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); o.applyBoneTransform(i, v); } });
    const tf = time(() => { skinPass(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); skinVertex(o, i, v); } });
    // a new pose every pass (the settle's case: each measurement follows a new death pose)
    const tp = time(() => { o.skeleton.bones[0].rotation.y += 1e-3; o.parent.updateMatrixWorld(true); skinPass(); for (let i = 0; i < P.count; i++) skinVertexPlanned(o, i, v); });
    const tk = time(() => { skinPass(); for (let i = 0; i < P.count; i++) skinVertexPlanned(o, i, v); });
    const tw = time(() => { skinPass(); for (let i = 0; i < P.count; i++) skinWorldPlanned(o, i, v); });
    const t3w = time(() => { for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); } });
    console.log(`  world: three ${t3w.toFixed(3)} ms, kept ${tw.toFixed(3)} (x${(t3w / tw).toFixed(2)})`);
    console.log(`4000 samples: three ${t3.toFixed(3)} ms, skinVertex ${tf.toFixed(3)} (x${(t3 / tf).toFixed(2)}), planned ${tp.toFixed(3)} (x${(t3 / tp).toFixed(2)}), kept ${tk.toFixed(3)} (x${(t3 / tk).toFixed(2)})`);
  }
}
