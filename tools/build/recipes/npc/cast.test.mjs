/**
 * BUILD M1.5c — the slice's cast, read off the shipped GLBs (node --test; no browser).
 *
 *   - no two faces alike: every pair among Brea, Ansel and the cast is more than half Ansel's distance from Brea apart
 *     (faces.mjs: nine landmarks on the shipped skin, game mm about the eyes)
 *   - each near NPC meets the M1.5b densities (density.mjs): face texel density equal to Brea's (± 10 %), outfit >= 60 % of her
 *     linear density; <= 30 k triangles and <= 4 draws at the near tier; a 1024² head set of their own
 *   - the cast is archetypes 1, 3, 4 and 5 of the Pan Houses, Mise among them, 6-8 unnamed
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { io, ROOT } from '../lib/human/face.mjs';
import { measure } from './density.mjs';
import { pairs } from './faces.mjs';
import { CAST, byId } from './lib/archetypes.mjs';

test('the cast: Mise and 6-8 unnamed Pan Houses people of archetypes 1, 3, 4, 5', () => {
  assert.ok(CAST.includes('lantern-keeper') && /Mise/.test(byId['lantern-keeper'].name), 'Mise');
  const unnamed = CAST.filter((id) => id !== 'lantern-keeper');
  assert.ok(unnamed.length >= 6 && unnamed.length <= 8, `unnamed ${unnamed.length}`);
  for (const id of CAST) { const a = byId[id]; assert.equal(a.faction, 'pan', id); assert.ok([1, 3, 4, 5].includes(a.n), `${id} archetype ${a.n}`); }
  for (const n of [1, 3, 4, 5]) assert.ok(CAST.some((id) => byId[id].n === n), `archetype ${n}`);
});

test('no two faces alike among Brea, Ansel and the cast', async () => {
  const r = await pairs(['brea', 'guild-matron', ...CAST]);
  assert.ok(r.threshold > 3, `threshold ${r.threshold} mm`);
  assert.equal(r.alike.length, 0, `alike (<= ${r.threshold} mm): ${JSON.stringify(r.alike)}`);
});

test('each cast member at the M1.5b densities, triangles and draws', async () => {
  const brea = await measure({ kind: 'hero', file: path.join(ROOT, 'public/models/hero/brea.glb'), outfitFile: path.join(ROOT, 'public/models/hero/outfit-pan-1.glb') });
  const IO = await io();
  const bad = [];
  for (const id of CAST) {
    const file = path.join(ROOT, `public/models/npc/${id}.glb`);
    const m = await measure({ kind: 'npc', file, outfitTex: [1024, 1024] });
    const face = m.face.median / brea.face.median, outfit = m.outfit.median / brea.outfit.median, outfitU = m.outfit.unique / brea.outfit.unique;
    if (Math.abs(face - 1) > 0.1) bad.push(`${id} face ${face.toFixed(3)}`);
    if (outfit < 0.6 || outfitU < 0.6) bad.push(`${id} outfit ${outfit.toFixed(3)} unique ${outfitU.toFixed(3)}`);
    const doc = await IO.read(file);
    const L0 = doc.getRoot().listNodes().filter((n) => n.getMesh() && /_L0$/.test(n.getName()));
    const draws = L0.reduce((s, n) => s + n.getMesh().listPrimitives().length, 0);
    const tris = L0.reduce((s, n) => s + n.getMesh().listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
    if (draws > 4) bad.push(`${id} draws ${draws}`);
    if (tris > 30000) bad.push(`${id} triangles ${tris}`);
    const skin = doc.getRoot().listMaterials().find((x) => x.getName() === `MI_Npc_Skin_${id}`);
    if (!skin || skin.getBaseColorTexture()?.getSize()?.[0] !== 1024 || !skin.getNormalTexture()) bad.push(`${id} head set`);
    // every vertex and normal finite (a NaN normal is a black frame once the bloom spreads it: F21 at 3288669)
    for (const n of doc.getRoot().listNodes()) for (const pr of n.getMesh()?.listPrimitives() || []) for (const a of ['POSITION', 'NORMAL']) {
      const arr = pr.getAttribute(a)?.getArray();
      if (arr && arr.some((v) => !Number.isFinite(v))) bad.push(`${id} ${n.getName()} ${a} not finite`);
      // a quantised writer stores a NaN normal as a zero vector, which the shader's normalize turns back into NaN
      if (arr && a === 'NORMAL') {
        let mx = 0, zero = 0;
        for (let i = 0; i < arr.length; i += 3) mx = Math.max(mx, Math.hypot(arr[i], arr[i + 1], arr[i + 2]));
        for (let i = 0; i < arr.length; i += 3) if (Math.hypot(arr[i], arr[i + 1], arr[i + 2]) < 0.1 * mx) zero++;
        if (zero) bad.push(`${id} ${n.getName()} ${zero} zero normals`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
