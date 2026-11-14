/**
 * CALIMA — armor recipes: one merged outfit primitive and the GLB it goes in
 * (armory W1). The doc already holds the 65-joint skin (+ any dyn_ chain a piece
 * skins to); the source meshes are replaced by ONE node with ONE primitive.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { io, writeSkinned, nodeByName, m4, matToQuat } from '../../lib/human/face.mjs';
import { checkProvenance, GENERATOR } from '../../../lib/glb.mjs';
import { mergeParts } from './part.mjs';
import { SETTINGS, ktxBin, readGlb, relayoutBin, writeGlb } from '../../../pipeline/ktx2.mjs';

/**
 * M1.2d (the M0 debt of A-armory-budget): a set's BASE COLOUR ships as ETC1S (BasisLZ, the top quality level), not
 * UASTC. Measured on the Starter's 1024² atlas: UASTC (quality 2, zstd 18) is 803 KB alone, over the whole set's 0.8 MB
 * cap with nothing else in the file, and RDO only takes it to 561 KB (lambda 4); ETC1S is 176 KB at a mean ΔE76 of 2.0
 * (p95 5.8) against the painted sheet, read at 2.5 m (F08-F10) through the cloth shader's own weave detail. Normal and
 * ORM stay UASTC (the pipeline's step converts them; an image that is already KTX2 it leaves alone). Same tool, same
 * flags as tools/build/pipeline/ktx2.mjs (box mips, clamp, sRGB), so the bytes are deterministic.
 */
export async function preencodeEtc1s(file, names) {
  const { json, bin } = readGlb(readFileSync(file));
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'calima-etc1s-'));
  const replace = new Map(), rows = [];
  try {
    for (const [ii, img] of (json.images || []).entries()) {
      if (!names.includes(img.name) || img.mimeType === 'image/ktx2' || img.bufferView == null) continue;
      const bv = json.bufferViews[img.bufferView];
      const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      const png = path.join(tmp, `i${ii}.png`), out = path.join(tmp, `i${ii}.ktx2`);
      await sharp(bytes).removeAlpha().png({ compressionLevel: 1 }).toFile(png);
      execFileSync(ktxBin(), ['create', '--format', 'R8G8B8_SRGB', '--assign-tf', 'srgb', '--assign-primaries', 'bt709', '--testrun',
        ...SETTINGS.mips, '--mipmap-wrap', 'clamp', ...SETTINGS.etc1s, png, out], { stdio: ['ignore', 'pipe', 'pipe'] });
      const k = readFileSync(out);
      replace.set(img.bufferView, k);
      img.mimeType = 'image/ktx2';
      rows.push({ image: img.name, before: bytes.length, after: k.length });
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  if (!replace.size) return rows;
  for (const t of json.textures || []) {
    if (t.source == null || json.images[t.source]?.mimeType !== 'image/ktx2') continue;
    t.extensions = { ...(t.extensions || {}), KHR_texture_basisu: { source: t.source } };
    delete t.source;
  }
  for (const k of ['extensionsUsed', 'extensionsRequired']) json[k] = [...new Set([...(json[k] || []), 'KHR_texture_basisu'])];
  writeFileSync(file, writeGlb(json, relayoutBin(json, bin, replace)));
  return rows;
}

/**
 * A joint at the identity under `parentName` (its inverse bind = the parent's): a socket the runtime poses (armory W1
 * fix round 1: `sash_swing`, the sash tails' hang, src/hero/outfit.js). Returns its joint index. Idempotent.
 */
export function addSocketJoint(doc, name, parentName, at = null) {
  const skin = doc.getRoot().listSkins()[0];
  const have = skin.listJoints().findIndex((j) => j.getName() === name);
  if (have >= 0) return have;
  const parent = skin.listJoints().find((j) => j.getName() === parentName);
  const pi = skin.listJoints().indexOf(parent);
  const ibmAcc = skin.getInverseBindMatrices();
  const ibm = Array.from(ibmAcc.getArray());
  const node = doc.createNode(name);
  parent.addChild(node);
  if (at) {
    // a pivot: the joint stands at `at` (bind space) with the bind space's axes, so turning it turns about that point
    const W = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, at[0], at[1], at[2], 1];
    const L = m4.mul(m4.inv(Array.from(parent.getWorldMatrix())), W);
    node.setTranslation([L[12], L[13], L[14]]).setRotation(matToQuat(L));
    skin.addJoint(node);
    ibm.push(...m4.inv(W));
  } else {
    skin.addJoint(node);
    ibm.push(...ibm.slice(pi * 16, pi * 16 + 16));
  }
  ibmAcc.setArray(new Float32Array(ibm));
  return skin.listJoints().length - 1;
}

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
    .setAttribute('JOINTS_0', acc('VEC4', new Uint8Array(m.jnt)))
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

/** The shortest decimal that reads back to x's float32 (the value a Float32Array or the GPU holds). */
function f32Text(x) {
  const f = Math.fround(x);
  if (f === 0) return 0;
  for (let p = 1; p <= 9; p++) { const v = Number(f.toPrecision(p)); if (Math.fround(v) === f) return v; }
  return f;
}

export async function writeOutfit(doc, file, { recipe, sources, licence, r5Outfit, lean = false, etc1s = null }) {
  if (!lean) {
    const st = await writeSkinned(doc, file, { provenance: { recipe, sources, licence }, extras: { r5Outfit } });
    if (etc1s) st.etc1s = await preencodeEtc1s(file, etc1s);
    return st;
  }
  // a geometry-only variant (<= 0.15 MB, plan §4.1): the same writer, a coarser quantiser
  const prov = checkProvenance({ recipe, sources, licence });
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: true }), unpartition());
  let tris = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) { verts += p.getAttribute('POSITION').getCount(); tris += p.getIndices().getCount() / 3; }
  await MeshoptEncoder.ready;
  await doc.transform(
    reorder({ encoder: MeshoptEncoder }),
    quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0|WEIGHTS_0)$/, quantizationVolume: 'scene', quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 11, quantizeWeight: 8 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const stats = { tris, verts, materials: doc.getRoot().listMaterials().length, meshes: doc.getRoot().listMeshes().length, textures: doc.getRoot().listTextures().length, bones: doc.getRoot().listSkins().reduce((n, s) => n + s.listJoints().length, 0) };
  // (M0.7, r5/int: Pan III came out 1 KB over its 0.15 MB cap against the integrated body.) A joint's TRS is float32
  // data written as float64 text ("0.0711912140250206"): write each as the shortest decimal that reads back to the
  // SAME float32, so the skeleton is unchanged at float32 precision (what the GPU skins with) and the JSON is lighter
  for (const n of doc.getRoot().listNodes()) {
    n.setTranslation(n.getTranslation().map(f32Text)).setRotation(n.getRotation().map(f32Text)).setScale(n.getScale().map(f32Text));
  }
  const asset = doc.getRoot().getAsset();
  asset.generator = GENERATOR;
  asset.extras = { r5Outfit, provenance: prov, r5Stats: stats };
  const bytes = await (await io()).writeBinary(doc);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return { bytes: bytes.byteLength, ...stats };
}
