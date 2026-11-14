/**
 * BUILD M1.5b — Guild Matron Ansel's measured lines, read off the shipped GLBs (node --test; no browser).
 *
 *   faces equal to Brea's (± 10 %), cloth at >= 60 % of her linear density (density.mjs), <= 30 k triangles and <= 4 draws
 *   at the near tier, her own 1024² head set and her own outfit sheet, and the counted construction: three or more cloth
 *   layers at the torso, straps with buckles, the embroidered band, the guild chain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { io, ROOT } from '../lib/human/face.mjs';
import { compare } from './density.mjs';

const FILE = path.join(ROOT, 'public/models/npc/guild-matron.glb');

test('Ansel: face density equal to Brea\'s, cloth at >= 60 % of hers', async () => {
  const c = await compare('guild-matron');
  assert.ok(Math.abs(c.ratio.face - 1) <= 0.1, `face ${c.ratio.face}`);
  assert.ok(Math.abs(c.ratio.faceUnique - 1) <= 0.1, `face (unique texels) ${c.ratio.faceUnique}`);
  assert.ok(c.ratio.outfit >= 0.6, `outfit ${c.ratio.outfit}`);
  assert.ok(c.ratio.outfitUnique >= 0.6, `outfit (unique texels) ${c.ratio.outfitUnique}`);
});

test('Ansel: near tier <= 30 k triangles, <= 4 draws; her own head set and outfit sheet', async () => {
  const doc = await (await io()).read(FILE);
  const tri = (name) => { const n = doc.getRoot().listNodes().find((x) => x.getName() === name); return n ? n.getMesh().listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0) : 0; };
  const L0 = ['Skin_L0', 'Hair_L0', 'Outfit_L0'];
  const prims = L0.reduce((s, n) => s + (doc.getRoot().listNodes().find((x) => x.getName() === n)?.getMesh().listPrimitives().length || 0), 0);
  assert.ok(prims <= 4, `draws ${prims}`);
  const total = L0.reduce((s, n) => s + tri(n), 0);
  assert.ok(total <= 30000, `triangles ${total}`);
  const mats = Object.fromEntries(doc.getRoot().listMaterials().map((m) => [m.getName(), m]));
  const skin = mats['MI_Npc_Skin_guild-matron'], outfit = mats.MI_Npc_Outfit;
  assert.deepEqual(skin.getBaseColorTexture().getSize(), [1024, 1024]);
  assert.ok(skin.getNormalTexture() && skin.getMetallicRoughnessTexture(), 'head set: normal + ORM');
  assert.deepEqual(outfit.getBaseColorTexture().getSize(), [1024, 1024]);
  assert.ok(outfit.getNormalTexture() && outfit.getMetallicRoughnessTexture(), 'outfit sheet: normal + ORM');
});

test('Ansel: three or more cloth layers at the torso, straps with buckles, embroidery, the chain', async () => {
  const doc = await (await io()).read(FILE);
  const ex = doc.getRoot().getAsset().extras.r5Npc;
  const slots = new Set(ex.outfitAtlas.slots);
  const torsoCloth = ['underyoke', 'smock', 'vest'].filter((s) => slots.has(s));
  assert.ok(torsoCloth.length >= 3, `torso layers ${torsoCloth}`);
  for (const s of ['girdle', 'buckle', 'tongue', 'keystrap', 'sashband', 'sash', 'vestband', 'chain', 'medal']) assert.ok(slots.has(s), `missing ${s}`);
});
