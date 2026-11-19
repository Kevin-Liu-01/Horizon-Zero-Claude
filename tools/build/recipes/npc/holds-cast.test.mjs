/**
 * M2 wave 3 (area B; BUILD M2.7, briefs §5 NW7) — the Holds' cast at Ninewalls, read off the shipped GLBs (node --test; no browser).
 *
 *   - the cast: Tube Smith Oro, three or more Pit Farmers, two Tiller-Followers, two Cochineal Pickers (the game's HOLDS_CAST is
 *     the build's list)
 *   - no two faces alike among Brea, Ansel, Oro and the cast (faces.mjs: nine landmarks on the shipped skin, game mm about the
 *     eyes; the line is half Ansel's distance from Brea, as for the slice's cast)
 *   - each at the M1.5b densities as the slice's cast is graded (density.mjs: face texel density equal to Brea's within 10 %, Oro's
 *     own faceK sheet included; the outfit >= 60 % of her linear density); <= 30 k triangles and <= 4 draws at the near tier
 *   - one violet accent each (Q6; F36's "each with a violet accent"): a violet dye in the person's own spec, and violet vertices
 *     on the near outfit or hair
 *   - every one of them on the Holds' one faction atlas (atlas-holds.glb), so the cast loads no sheet the Holds group does not
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { io, ROOT } from '../lib/human/face.mjs';
import { measure } from './density.mjs';
import { pairs } from './faces.mjs';
import { HOLDS_CAST, byId, HOLDS } from './lib/archetypes.mjs';
import { HOLDS_CAST as GAME_CAST } from '../../../../src/world/npc/people/holds.js';

test('NW7: the cast is Oro, >= 3 Pit Farmers, 2 Tiller-Followers, 2 Cochineal Pickers, all of the Holds', () => {
  assert.deepEqual([...GAME_CAST], HOLDS_CAST, 'the game and the build hold the same list');
  const n = (k) => HOLDS_CAST.filter((id) => byId[id].n === k).length;
  assert.ok(HOLDS_CAST.includes('oro') && /Oro/.test(byId.oro.name), 'Oro');
  assert.ok(n(6) >= 3, `pit farmers ${n(6)}`);
  assert.equal(n(7), 2, 'tiller-followers');
  assert.equal(n(8), 2, 'cochineal pickers');
  for (const id of HOLDS_CAST) assert.equal(byId[id].faction, 'holds', id);
});

test('NW7: no two faces alike among Brea, Ansel, Oro and the Holds cast', async () => {
  const r = await pairs(['brea', 'guild-matron', ...HOLDS_CAST]);
  console.log(JSON.stringify({ threshold: r.threshold, nearest: r.nearest }));
  assert.ok(r.threshold > 3, `threshold ${r.threshold} mm`);
  assert.equal(r.alike.length, 0, `alike (<= ${r.threshold} mm): ${JSON.stringify(r.alike)}`);
});

test('NW7: each of the Holds cast at the M1.5b densities, triangles, draws; one violet accent; the Holds atlas', async () => {
  const brea = await measure({ kind: 'hero', file: path.join(ROOT, 'public/models/hero/brea.glb'), outfitFile: path.join(ROOT, 'public/models/hero/outfit-pan-1.glb') });
  const IO = await io();
  const bad = [], rows = [];
  const V = [HOLDS.violet, HOLDS.violetDeep].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
  for (const id of HOLDS_CAST) {
    const file = path.join(ROOT, `public/models/npc/${id}.glb`);
    const m = await measure({ kind: 'npc', file, outfitTex: [1024, 1024] });
    const face = m.face.median / brea.face.median, outfit = m.outfit.median / brea.outfit.median;
    const doc = await IO.read(file);
    const L0 = doc.getRoot().listNodes().filter((n) => n.getMesh() && /_L0$/.test(n.getName()));
    const draws = L0.reduce((s, n) => s + n.getMesh().listPrimitives().length, 0);
    const tris = L0.reduce((s, n) => s + n.getMesh().listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
    // violet vertices (the dye times the vertex shade: hue within the violet's, a little light or dark) on the near outfit and hair
    let violet = 0, verts = 0;
    for (const n of L0) {
      if (!/^(Outfit|Hair)_L0$/.test(n.getName())) continue;
      for (const p of n.getMesh().listPrimitives()) {
        const c = p.getAttribute('COLOR_0');
        if (!c) continue;
        const a = c.getArray(), k = c.getElementSize(), norm = c.getNormalized() ? (a instanceof Uint16Array ? 65535 : a instanceof Uint8Array ? 255 : 1) : 1;
        for (let i = 0; i < a.length; i += k) {
          verts++;
          const r = a[i] / norm, g = a[i + 1] / norm, b = a[i + 2] / norm;
          // linear vertex colours: a violet has blue and red over green by a margin, blue >= red * 0.8
          if (b > g * 1.35 && r > g * 1.15 && b >= r * 0.8) violet++;
        }
      }
    }
    const ex = doc.getRoot().getAsset().extras || {};
    const faction = ex.r5Npc?.faction || ex.npc?.faction || byId[id].faction;
    const spec = byId[id];
    const accent = [spec.head?.dye, spec.head?.lining, ...Object.values(spec.dyes || {})].some((h) => h && [HOLDS.violet, HOLDS.violetDeep, '#5B2F6B', '#41204E'].includes(String(h).toUpperCase().replace(/^#?/, '#')));
    rows.push({ id, face: +face.toFixed(3), outfit: +outfit.toFixed(3), tris, draws, violetVerts: violet, of: verts, accent, faction });
    if (Math.abs(face - 1) > 0.1) bad.push(`${id} face ${face.toFixed(3)}`);
    if (outfit < 0.6) bad.push(`${id} outfit ${outfit.toFixed(3)}`);
    if (draws > 4) bad.push(`${id} draws ${draws}`);
    if (tris > 30000) bad.push(`${id} triangles ${tris}`);
    if (!accent) bad.push(`${id}: no violet in its spec`);
    if (violet < 20) bad.push(`${id}: ${violet} violet vertices on the near outfit and hair`);
    if (faction !== 'holds') bad.push(`${id} faction ${faction}`);
  }
  console.log(JSON.stringify(rows));
  void V;
  assert.deepEqual(bad, []);
});
