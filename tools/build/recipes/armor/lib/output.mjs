/**
 * CALIMA — armor recipes: one merged outfit primitive and the GLB it goes in
 * (armory W1). The doc already holds the 65-joint skin (+ any dyn_ chain a piece
 * skins to); the source meshes are replaced by ONE node with ONE primitive.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { io, writeSkinned, nodeByName } from '../../lib/face.mjs';
import { checkProvenance, GENERATOR } from '../../../lib/glb.mjs';
import { mergeParts } from './part.mjs';

/** Build the merged primitive. `tex` may be null: a variant that shares its set's sheet (material only). */
export function outfitDoc(doc, parts, { name, matName, tex = null, texPrefix = 'set', pieces = false, extra = null }) {
  const root = doc.getRoot();
  const m = mergeParts(parts.map((p) => (p.trim ? p : { ...p, uv: p.uvNew })));
  const buf = root.listBuffers()[0] || doc.createBuffer();
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(m.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  // sum-to-one weights, even after the 8-bit quantiser
  const wgt = new Float32Array(m.wgt);
  for (let i = 0; i < wgt.length; i += 4) { const s = wgt[i] + wgt[i + 1] + wgt[i + 2] + wgt[i + 3] || 1; wgt[i] /= s; wgt[i + 1] /= s; wgt[i + 2] /= s; wgt[i + 3] /= s; }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(m.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(m.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(m.jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', wgt))
    .setIndices(acc('SCALAR', new Uint32Array(m.idx)));
  if (pieces) prim.setAttribute('_PIECE', acc('SCALAR', new Uint8Array(m.piece)));
  if (extra) for (const [k, [type, arr]] of Object.entries(extra)) prim.setAttribute(k, acc(type, arr));
  for (const mat of root.listMaterials()) mat.dispose();
  for (const t of root.listTextures()) t.dispose();
  const mat = doc.createMaterial(matName).setDoubleSided(true).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(1).setRoughnessFactor(1);
  if (tex) {
    const T = (suffix, data) => doc.createTexture(`${texPrefix}-${suffix}`).setImage(data).setMimeType('image/webp').setURI(`${texPrefix}-${suffix}.webp`);
    mat.setBaseColorTexture(T('base', tex.base));
    mat.setNormalTexture(T('normal', tex.normal));
    mat.setMetallicRoughnessTexture(T('orm', tex.orm));
  }
  prim.setMaterial(mat);
  const skin = root.listSkins()[0];
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setSkin(skin).setExtras({ r5Outfit: true });
  nodeByName(doc, 'Armature').addChild(node);
  // drop the source mesh nodes (the grafts)
  for (const n of root.listNodes()) {
    if (n === node) continue;
    const me = n.getMesh();
    if (me) { me.dispose(); n.dispose(); }
  }
  for (const me of root.listMeshes()) if (me !== node.getMesh()) me.dispose();
  return { node, material: mat, stats: m.ranges };
}

export async function writeOutfit(doc, file, { recipe, sources, licence, r5Outfit, lean = false }) {
  if (!lean) return writeSkinned(doc, file, { provenance: { recipe, sources, licence }, extras: { r5Outfit } });
  // a geometry-only variant (<= 0.15 MB, plan §4.1): the same writer, a coarser quantiser
  const prov = checkProvenance({ recipe, sources, licence });
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: true }), unpartition());
  let tris = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) { verts += p.getAttribute('POSITION').getCount(); tris += p.getIndices().getCount() / 3; }
  await MeshoptEncoder.ready;
  await doc.transform(
    reorder({ encoder: MeshoptEncoder }),
    quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0|WEIGHTS_0)$/, quantizationVolume: 'scene', quantizePosition: 13, quantizeNormal: 8, quantizeTexcoord: 11, quantizeWeight: 8 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const stats = { tris, verts, materials: doc.getRoot().listMaterials().length, meshes: doc.getRoot().listMeshes().length, textures: doc.getRoot().listTextures().length, bones: doc.getRoot().listSkins().reduce((n, s) => n + s.listJoints().length, 0) };
  const asset = doc.getRoot().getAsset();
  asset.generator = GENERATOR;
  asset.extras = { r5Outfit, provenance: prov, r5Stats: stats };
  const bytes = await (await io()).writeBinary(doc);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return { bytes: bytes.byteLength, ...stats };
}
