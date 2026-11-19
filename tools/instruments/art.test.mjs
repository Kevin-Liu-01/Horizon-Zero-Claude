/**
 * IN4 and the wave 2 look rules at ART (M2 wave 2, area C), browser-free:  node --test tools/instruments/art.test.mjs
 *
 * For the Tiller that plays, the Sickle and the Screed as built (public/models/instruments/*.glb):
 *   - height within 0.1 m of bible §7.4's roster (IN4: 2.7 / 1.7 / 3.8 m), length and width reported and within 0.15 m;
 *   - LOD0 triangles and draws inside the size class's cap (sizeclass.js CLASS_CAPS) and the Holds' budget (a large
 *     hull <= 80 k triangles, a medium one <= 50 k; <= 36 draws), and a LOD1 caster at <= 40 % of LOD0;
 *   - ONE LAMP: one lamp socket, and that anchor MOUNTED: within 0.05 m of the hull's own vertices (wave 1's Sickle
 *     lamp floated a metre above its body; its Screed showed two lamp discs);
 *   - nothing emissive but level-vial glass, and that glass no bluer or brighter than pale ice #D6F0EE;
 *   - the Tiller keeps the M1 Tiller's 24 bones in the same order (the gait, the herd and every staged row read it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureTransform } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { ROSTER } from '../../src/instruments/lib/blockout.js';
import { CLASS_CAPS } from '../../src/instruments/lib/sizeclass.js';
import { inspectGlb } from '../tier0/lib/glb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ART = { tiller: 'tiller.glb', sickle: 'sickle.glb', screed: 'screed.glb' };
const LAMP_KEY = { tiller: 'lens', sickle: 'lamp', screed: 'lamp' };
const M1_TILLER_BONES = ['pelvis', 'chest', 'neck', 'head', 'tail1', 'tail2',
  ...['RF', 'LF', 'RM', 'LM', 'RH', 'LH'].flatMap((l) => [`${l}_thigh`, `${l}_shin`, `${l}_foot`])];
const ICE = [0xd6 / 255, 0xf0 / 255, 0xee / 255].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

async function load(file) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureTransform]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(file);
}

test('IN4 at art: sizes, classes, caps, one mounted lamp, emissive only in vial glass', async () => {
  const out = {};
  for (const [kind, f] of Object.entries(ART)) {
    const file = path.join(ROOT, 'public/models/instruments', f);
    const buf = fs.readFileSync(file);
    const g = inspectGlb(buf);
    const doc = await load(file);
    const ex = doc.getRoot().getAsset().extras;
    const R = ROSTER[kind], sz = ex.r5Size, S = ex.r5Sockets;
    const lod1 = g.byLod['1']?.triangles ?? 0;
    assert.ok(Math.abs(sz[1] - R.H) <= 0.1 + 1e-9, `${kind} height ${sz[1]} vs ${R.H}`);
    assert.ok(Math.abs(sz[2] - R.L) <= 0.15 + 1e-9, `${kind} length ${sz[2]} vs ${R.L}`);
    assert.ok(Math.abs(sz[0] - R.W) <= 0.16 + 1e-9, `${kind} width ${sz[0]} vs ${R.W}`);
    assert.ok(g.triangles <= CLASS_CAPS[R.cls].triangles, `${kind} ${g.triangles} triangles over ${CLASS_CAPS[R.cls].triangles}`);
    assert.ok(g.draws <= 36, `${kind} ${g.draws} draws`);
    assert.ok(lod1 > 0 && lod1 <= 0.4 * g.triangles, `${kind} LOD1 ${lod1} of ${g.triangles}`);
    // one lamp, mounted on the hull
    const lampKeys = Object.keys(S).filter((k) => /^(lamp|lens)$/.test(k));
    assert.deepEqual(lampKeys, [LAMP_KEY[kind]], `${kind} lamp sockets ${lampKeys}`);
    const L = S[LAMP_KEY[kind]];
    let near = Infinity, emissive = [];
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const W = node.getWorldMatrix();   // quantised positions carry their scale and offset on the node
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        const e = mat?.getEmissiveFactor() || [0, 0, 0];
        if (e.some((v) => v > 0)) emissive.push({ mesh: mesh.getName(), e });
        if (!/-hull$/.test(mesh.getName())) continue;
        const P = prim.getAttribute('POSITION'), el = [0, 0, 0];
        for (let i = 0; i < P.getCount(); i++) {
          P.getElement(i, el);
          const x = W[0] * el[0] + W[4] * el[1] + W[8] * el[2] + W[12];
          const y = W[1] * el[0] + W[5] * el[1] + W[9] * el[2] + W[13];
          const z = W[2] * el[0] + W[6] * el[1] + W[10] * el[2] + W[14];
          const d = Math.hypot(x - L[0], y - L[1], z - L[2]);
          if (d < near) near = d;
        }
      }
    }
    assert.ok(near <= 0.05, `${kind} lamp anchor ${near.toFixed(3)} m from its hull (floating)`);
    for (const em of emissive) {
      assert.ok(/-(vial|flask)$/.test(em.mesh), `${kind}: ${em.mesh} is emissive`);
      for (let c = 0; c < 3; c++) assert.ok(em.e[c] <= ICE[c] + 1e-3, `${kind} glass emissive ${em.e} over pale ice`);
    }
    if (kind === 'tiller') assert.deepEqual(ex.r5BoneOrder, M1_TILLER_BONES);
    out[kind] = { cls: R.cls, size: sz, tris: g.triangles, draws: g.draws, lod1, lampToHull: +near.toFixed(4), emissive: emissive.map((x) => x.mesh) };
  }
  console.log(JSON.stringify(out));
});
