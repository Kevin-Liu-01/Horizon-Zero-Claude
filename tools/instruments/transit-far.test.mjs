/**
 * THE TRANSIT'S FAR FORM (M2 wave 4, area C), browser-free:  node --test tools/instruments/transit-far.test.mjs
 *
 *   - the shipped GLB (public/models/instruments/transit-far.glb) is the recipe's (gen-transit.mjs rebuilt into a temp
 *     file is byte-identical: the recipe is deterministic and the file is not stale);
 *   - ONE mesh, one material, one draw, nothing emissive (no lamp, no glass glows: bible "nothing glows inside the body";
 *     the far form draws no lamp of its own), no skin;
 *   - 22.0 m +- 0.5 (BUILD M5.3) on a 14 m footprint (BIBLE 7.4 #12: 14 x 14 x 22), inside the colossal class cap and
 *     under 20 k triangles (a far form);
 *   - its gate (src/instruments/far/transit.js): drawn only inside 11:30-12:30 with the sun at least SUN_MIN_DEG up, on
 *     the sky's own sun (environment.js Environment.direction), and `show(true)` refused outside it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureTransform } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { CLASS_CAPS } from '../../src/instruments/lib/sizeclass.js';
import { inspectGlb } from '../tier0/lib/glb.mjs';

register(new URL('../gates/hero-sweep/vite-stub.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'public/models/instruments/transit-far.glb');

async function load(file) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureTransform]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(file);
}

test('the far form: one mesh, nothing emissive, 22 m on a 14 m footprint, the recipe\'s own bytes', async () => {
  const { build } = await import('../build/instruments/gen-transit.mjs');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'transit-far-')), 'transit-far.glb');
  const r = await build({ file: tmp });
  assert.ok(fs.readFileSync(tmp).equals(fs.readFileSync(FILE)), 'public/models/instruments/transit-far.glb is not the recipe\'s output (rebuild it)');
  const g = inspectGlb(fs.readFileSync(FILE));
  const doc = await load(FILE);
  const ex = doc.getRoot().getAsset().extras;
  const meshes = doc.getRoot().listMeshes(), mats = doc.getRoot().listMaterials();
  const emissive = mats.filter((m) => m.getEmissiveFactor().some((v) => v > 0));
  console.log(JSON.stringify({ tris: g.triangles, draws: g.draws, meshes: meshes.length, materials: mats.length, size: ex.r5Size, bytes: r.bytes, head: ex.r5Far.head }));
  assert.equal(meshes.length, 1, 'one mesh');
  assert.equal(mats.length, 1, 'one material');
  assert.equal(g.draws, 1, 'one draw');
  assert.equal(emissive.length, 0, `emissive materials: ${emissive.map((m) => m.getName())}`);
  assert.equal(doc.getRoot().listSkins().length, 0, 'no skin');
  assert.ok(Math.abs(ex.r5Size[1] - 22) <= 0.5, `height ${ex.r5Size[1]}`);
  assert.ok(ex.r5Size[0] <= 14.5 && ex.r5Size[2] <= 14.5 && Math.max(ex.r5Size[0], ex.r5Size[2]) >= 12, `footprint ${ex.r5Size[0]} x ${ex.r5Size[2]}`);
  assert.ok(g.triangles <= CLASS_CAPS.colossal.triangles && g.triangles <= 20000, `${g.triangles} triangles`);
});

test('the far form\'s gate: 11:30-12:30 with the sun >= SUN_MIN_DEG, on the sky\'s own sun', async () => {
  const { TransitFar, WINDOW, SUN_MIN_DEG } = await import('../../src/instruments/far/transit.js');
  const { Environment } = await import('../../src/world/environment.js');
  const env = { time: 12, sunDir: new THREE.Vector3() };
  let loads = 0;
  const ctx = { environment: env, terrain: { getHeight: () => 140 }, assets: { models: {}, loadExtra: () => { loads++; return new Promise(() => {}); } }, scene: null };
  const far = new TransitFar(ctx);
  const at = (h) => { env.time = h; Environment.direction(h, env.sunDir); return far.gate(); };
  const rows = [];
  for (const h of [6.5, 9, 10.5, 11.4, 11.5, 12, 12.5, 12.6, 15, 18.5]) { const g = at(h); rows.push([h, +g.sunDeg.toFixed(2), g.ok]); }
  console.log(JSON.stringify({ WINDOW, SUN_MIN_DEG, rows }));
  for (const [h, deg, ok] of rows) {
    const want = h >= WINDOW[0] && h <= WINDOW[1];
    assert.equal(ok, want, `hour ${h}: gate ${ok}`);
    if (ok) assert.ok(deg >= SUN_MIN_DEG, `drawn under a ${deg} deg sun`);
  }
  at(9); assert.equal(far.show(true), false); assert.equal(loads, 0, 'fetched outside the window');
  at(12); far.show(true); assert.equal(loads, 1, 'not fetched on the first show inside the window');
  assert.ok(Math.abs(far.head.y - (140 + 19.95)) < 1e-6, `head ${far.head.y}`);
});
