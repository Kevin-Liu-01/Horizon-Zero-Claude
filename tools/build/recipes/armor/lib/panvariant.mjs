/**
 * CALIMA — armor recipes: a Pan Whites variant is variant I's parts + ≤ 3 pieces,
 * on variant I's sheet (bible §4.1: "a variant = piece toggles + tint/mask composite
 * + ≤ 3 added pieces"). The GLB carries geometry only; `extras.r5Outfit.sharedAtlas`
 * tells src/hero/outfit.js whose maps to use, so a variant costs ≤ 0.15 MB and no
 * extra GPU texture.
 */
import path from 'node:path';
import { ROOT } from '../../lib/face.mjs';
import { panBase, panLayout, panFinish, PAN_SET, PAN_FIT } from '../../outfit-pan-1.mjs';
import { outfitDoc, writeOutfit } from './output.mjs';
import { recomputeNormals } from './part.mjs';
import { romFit } from './romfit.mjs';
import { bakeVertexAO } from './vertexao.mjs';

export async function panVariant({ out = ROOT, file, recipe, variant, name, add, pieces = [], salt = null, baseOpt = { cut: 'long' } }) {
  // (C-06: the rungs above the Starter wear the set's long skirt and under-tunic; the sheet is packed from the union of
  // every Pan cloth piece, `sheetParts`, so their uvs land on Pan I's painted atlas)
  const base = await panBase(baseOpt);
  const { doc, parts, trim, W, H } = base;
  const layout = await panLayout(base.sheetParts, trim, W, H);
  const added = await add(base);
  for (const p of added) { if (!p.keepNormals) recomputeNormals(p); }
  const all = [...parts, ...added];
  let extra = null;
  if (salt) {
    const arr = [];
    for (const p of all) { const n = p.pos.length / 3; for (let i = 0; i < n; i++) arr.push(Math.round(255 * Math.min(1, Math.max(0, salt(p, p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]))))); }
    extra = { _SALT: ['SCALAR', new Uint8Array(arr)] };
  }
  romFit(all, base, PAN_FIT);
  const hide = panFinish(base, all);
  extra = { ...(extra || {}), _AO: ['SCALAR', bakeVertexAO(all, { body: base.bodyPart })] };
  const hasPieces = added.some((p) => p.pieceBit);
  const { material } = outfitDoc(doc, all, { name: `Outfit_${variant.replace('-', '_')}`, matName: `MI_${variant}`, tex: null, pieces: hasPieces, extra });
  void material;
  // normalised salt in the file, so the shader reads 0..1
  if (salt) {
    for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) pr.getAttribute('_SALT')?.setNormalized(true);
  }
  for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) pr.getAttribute('_AO')?.setNormalized(true);
  return writeOutfit(doc, path.join(out, file), {
    lean: true, recipe, sources: ['mco-fantasy-standard', 'ubc-standard', 'brea-generated'], licence: 'CC0-1.0',
    r5Outfit: { ...PAN_SET, variant, name, density: +layout.D.toFixed(1), detailRep: +((W / layout.D) / 0.026).toFixed(1), sharedAtlas: 'heroOutfitPan1', pieces, hasPieces, hasSalt: !!salt, hasAo: true, cut: baseOpt.cut || 'starter', hide: { count: hide.count, tris: hide.tris, covered: hide.covered, rle: hide.rle } },
  });
}
