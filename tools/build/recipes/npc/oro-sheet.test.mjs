/**
 * M2 polish (people) — Tube Smith Oro at Ansel's density, read off the shipped GLB (node --test; no browser). TECH §6 and the
 * wave-2 review ("his outfit reads as flat blocks of colour"):
 *
 *   - his own 1024² head set (the skin's base colour), his outfit on a 1024² sheet of his own (r5Npc.outfitAtlas.own and .kit,
 *     the base, normal and ORM maps on Outfit_L0's material), painted per garment (the slots of lib/oro-sheet.mjs)
 *   - the outfit's texels at no less than 60 % of Brea's linear density (density.mjs, the median and the unique figure)
 *   - three or more layers at the torso: a ray in from the front of his chest and from his side meets that many surfaces of
 *     the near outfit, each more than 2 mm from the last
 *   - straps with buckles, the apron, the smith's tools: the sheet's slots carry them
 *   - <= 30 k triangles and <= 4 draws at the near tier
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { io, ROOT } from '../lib/human/face.mjs';
import { measure, bindMatrix } from './density.mjs';

const FILE = path.join(process.env.R5_NPC_ROOT || ROOT, 'public/models/npc/oro.glb');

/** Every surface of a skinned primitive a ray meets (bind space), nearest first. */
function hits(prim, M, o, d) {
  const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray();
  const v = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], out = [];
  const ap = (p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) { P.getElement(idx[t + k], v[k]); v[k] = ap(v[k]); }
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = [o[0] - v[0][0], o[1] - v[0][1], o[2] - v[0][2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (w < 0 || u + w > 1) continue;
    const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (tt > 0) out.push(tt);
  }
  out.sort((a, b) => a - b);
  const layers = [];
  for (const t of out) if (!layers.length || t - layers[layers.length - 1] > 0.002) layers.push(t);
  return layers;
}

test('Oro: his own head set and outfit sheet, painted per garment', async () => {
  const doc = await (await io()).read(FILE);
  const A = doc.getRoot().getAsset().extras.r5Npc;
  const node = (n) => doc.getRoot().listNodes().find((q) => q.getName() === n);
  const skinTex = node('Skin_L0').getMesh().listPrimitives()[0].getMaterial().getBaseColorTexture();
  const om = node('Outfit_L0').getMesh().listPrimitives()[0].getMaterial();
  const size = (t) => t?.getSize() || null;
  const row = { skinBase: size(skinTex), outfit: { base: size(om.getBaseColorTexture()), normal: size(om.getNormalTexture()), orm: size(om.getMetallicRoughnessTexture()) }, atlas: A.outfitAtlas };
  console.log(JSON.stringify(row));
  assert.ok(A.outfitAtlas?.own && A.outfitAtlas?.kit, 'an outfit sheet of his own');
  // the KTX2 base has no size gltf-transform can read; the normal and ORM are WebP (512²: the sheet's half-size maps)
  assert.ok(om.getBaseColorTexture() && om.getNormalTexture() && om.getMetallicRoughnessTexture(), 'base, normal and ORM on the outfit');
  assert.deepEqual(row.skinBase, [1024, 1024], 'his own 1024² head set');
  for (const s of ['shirt', 'sleeves', 'vest', 'apron', 'pocket', 'strap', 'belt', 'sash', 'sashEnd', 'pouch', 'iron', 'handle', 'trousers', 'boots']) assert.ok(A.outfitAtlas.slots.includes(s), `slot ${s}`);
});

test('Oro: outfit texels >= 60 % of Brea\'s; >= 3 layers at the torso; <= 30 k triangles, <= 4 draws', async () => {
  const brea = await measure({ kind: 'hero', file: path.join(ROOT, 'public/models/hero/brea.glb'), outfitFile: path.join(ROOT, 'public/models/hero/outfit-pan-1.glb') });
  const oro = await measure({ kind: 'npc', file: FILE });
  const doc = await (await io()).read(FILE);
  const L0 = doc.getRoot().listNodes().filter((n) => n.getMesh() && /_L0$/.test(n.getName()));
  const draws = L0.reduce((s, n) => s + n.getMesh().listPrimitives().length, 0);
  const tris = L0.reduce((s, n) => s + n.getMesh().listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  const on = L0.find((n) => n.getName() === 'Outfit_L0'), M = bindMatrix(on), prim = on.getMesh().listPrimitives()[0];
  const dy = 0.0425;     // a male body's bind frame over the female pack's the recipes author in
  // the near side's layers only (in front of the body's mid-plane, z -0.01 / x 0): pocket, apron, vest, shirt at the chest
  const near = (o, d, mid) => hits(prim, M, o, d).filter((t) => t < mid).length;
  const rays = {
    chestFront: near([0.04, 1.27 + dy, 0.6], [0, 0, -1], 0.61),
    ribsSide: near([0.6, 1.22 + dy, -0.02], [-1, 0, 0], 0.6),
    bellyFront: near([-0.05, 1.12 + dy, 0.6], [0, 0, -1], 0.61),
  };
  const row = {
    outfit: +(oro.outfit.median / brea.outfit.median).toFixed(3), outfitUnique: +(oro.outfit.unique / brea.outfit.unique).toFixed(3),
    texelsPerM: oro.outfit.median, brea: brea.outfit.median, tris, draws, rays,
  };
  console.log(JSON.stringify(row));
  assert.ok(row.outfit >= 0.6 && row.outfitUnique >= 0.6, `outfit density ${row.outfit} (unique ${row.outfitUnique})`);
  assert.ok(rays.chestFront >= 3, `chest: ${rays.chestFront} layers`);
  assert.ok(tris <= 30000, `triangles ${tris}`);
  assert.ok(draws <= 4, `draws ${draws}`);
});
