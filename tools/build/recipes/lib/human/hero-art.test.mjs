/**
 * M1.2b / M1.2c gate rows on the SHIPPED Brea (public/models/hero/brea.glb), Node only (Tier 0's node --test):
 *
 *   A-wrap-fold-edges   M1.2c "every fold edge has thickness of 3 mm or more (no paper edges)": wrap-edges.mjs finds no cloth edge a
 *                       camera can see whose fold is thinner than 3 mm. The fringe is told from an edge by the wrap atlas's own alpha,
 *                       so the row refuses to grade without it: the shipped atlas is kept RGBA8 + Zstandard in its KTX2
 *                       (tools/build/pipeline/ktx2.mjs KEEP_RGBA8) and decodes to the raw build's texels; round 1 read the shipped file
 *                       without its alpha (45 mm against 132.6 mm on the raw build).
 *   A-ear-rim-round     M1.2b "no polygon edge visible on the ear rim at this distance": ear-rim.mjs's silhouette of each ear seen from
 *                       its side, every edge within half a pixel of the round rim through its vertices at F13's lens.
 *
 *   node --test tools/build/recipes/lib/human/hero-art.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapEdges } from './wrap-edges.mjs';
import { earRim } from './ear-rim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const BREA = path.join(ROOT, 'public/models/hero/brea.glb');

test('A-wrap-fold-edges: no seen wrap edge thinner than 3 mm, graded with the atlas alpha', async () => {
  const r = await wrapEdges(BREA);
  assert.notEqual(r.alphaFrom, 'fringe-cell', 'the wrap atlas alpha did not decode: the row cannot tell the fringe from an edge');
  assert.equal(r.paperEdges, 0, `paper edges: ${r.paperLengthMm} mm ${JSON.stringify(r.byPartMm)}`);
});

test('A-ear-rim-round: both ears\' side silhouettes within 0.5 px of round at F13', async () => {
  const r = await earRim(BREA);
  for (const side of ['left', 'right']) {
    assert.ok(r[side].silhouetteEdges > 20, `${side} ear: ${r[side].silhouetteEdges} silhouette edges (the ear box missed it)`);
    assert.equal(r[side].facetsOverHalfPx, 0, `${side} ear: largest facet ${r[side].facetPx} px at ${JSON.stringify(r[side].facetAt)}`);
  }
});
