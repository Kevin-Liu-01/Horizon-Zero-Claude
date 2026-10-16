/**
 * CALIMA asset pipeline — Bucket[] -> GLB with @gltf-transform (no
 * GLTFExporter: it needs FileReader/Blob paths that node does not ship).
 * Promoted from the Round-5 proof (tools/r5-poc/lib/glb.mjs, pipeline W0a).
 *
 * What the promotion adds (plan §10.1, §9 pipeline):
 *   - `opts.provenance` is REQUIRED and is written to
 *     `asset.extras.provenance = { generator, recipe, sources, licence }`;
 *     `licence` must be one of LICENCES below (A-ID-ip-assets-gone).
 *   - `asset.extras.r5Stats` = { tris, verts, materials, meshes, textures,
 *     bones } measured after weld, before compression (A-glb-budget).
 *   - a bucket may carry `uv1` (a second UV set for the shared decal atlas).
 *   - `opts.reference(doc)` is called after weld/dedup/reorder and BEFORE
 *     quantisation: vertex order is final there, so a float snapshot taken
 *     in that hook is the exact source a dequantised load is measured
 *     against (A-loader-fixes).
 *   - determinism: no timestamps, no random ids; same inputs, same bytes
 *     (A-build-deterministic).
 *
 * One node + one mesh per bucket. The hull bucket uses the shared 8x1
 * palette PNG as its metallicRoughness texture (NEAREST, no mips); a bucket
 * flagged `emissive` gets a flat emissive material with no maps, which is
 * exactly what `Machine._collectEmissive` wires into the eye-state system.
 */
import { Document, NodeIO, Logger } from '@gltf-transform/core';
import { weld, dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { paletteBytes, PALETTE_W } from './hs.mjs';
import * as THREE from 'three';

/** Licences a shipped GLB may declare (plan §0 rule 9, §10.1). */
export const LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'project-original'];

export const GENERATOR = 'CALIMA tools/build';

export async function paletteTexturePNG() {
  return sharp(Buffer.from(paletteBytes()), { raw: { width: PALETTE_W, height: 1, channels: 4 } })
    .png({ compressionLevel: 9 }).toBuffer();
}

/** Validate and normalise a provenance block; throws on anything not shippable. */
export function checkProvenance(p) {
  if (!p || typeof p !== 'object') throw new Error('writeGLB: opts.provenance is required');
  if (!LICENCES.includes(p.licence)) throw new Error(`writeGLB: provenance.licence "${p.licence}" not in ${LICENCES.join(', ')}`);
  if (!p.recipe) throw new Error('writeGLB: provenance.recipe is required (the recipe file path)');
  return {
    generator: p.generator || GENERATOR,
    recipe: p.recipe,
    sources: Array.isArray(p.sources) ? [...p.sources] : [],
    licence: p.licence,
  };
}

/**
 * @param {Array<{bucket, material: {name, emissive?:[r,g,b], baseColor?:[r,g,b,a], extras?}}>} parts
 * @param {object} opts { file, provenance, extras, compress, reference(doc) }
 */
export async function writeGLB(parts, opts) {
  const provenance = checkProvenance(opts.provenance);
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  const buffer = doc.createBuffer();
  const scene = doc.createScene('scene');
  const png = await paletteTexturePNG();
  let palette = null;
  for (const { bucket, material: M } of parts) {
    if (!bucket.pos.length) continue;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(bucket.pos)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normalize(new Float32Array(bucket.nor))).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(bucket.uv)).setBuffer(buffer))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(bucket.col)).setBuffer(buffer));
    if (bucket.uv1 && bucket.uv1.length === (bucket.pos.length / 3) * 2) {
      prim.setAttribute('TEXCOORD_1', doc.createAccessor().setType('VEC2').setArray(new Float32Array(bucket.uv1)).setBuffer(buffer));
    }
    // generator-authored bone ownership (custom attribute -> three '_bone')
    if (bucket.labels) {
      prim.setAttribute('_BONE', doc.createAccessor().setType('SCALAR').setArray(Uint8Array.from(bucket.labels)).setBuffer(buffer));
    }
    const mat = doc.createMaterial(M.name)
      .setBaseColorFactor(M.baseColor || [1, 1, 1, 1])
      .setDoubleSided(false);
    if (M.emissive) {
      mat.setEmissiveFactor(M.emissive).setMetallicFactor(0).setRoughnessFactor(0.4);
    } else {
      if (!palette) {
        palette = doc.createTexture('r5-palette').setImage(png).setMimeType('image/png');
      }
      mat.setMetallicFactor(1).setRoughnessFactor(1).setMetallicRoughnessTexture(palette);
      const info = mat.getMetallicRoughnessTextureInfo();
      info.setMagFilter(9728).setMinFilter(9728).setWrapS(33071).setWrapT(33071); // NEAREST, CLAMP
    }
    if (M.extras) mat.setExtras(M.extras);
    prim.setMaterial(mat);
    const mesh = doc.createMesh(bucket.name).addPrimitive(prim);
    scene.addChild(doc.createNode(bucket.name).setMesh(mesh));
  }
  // index + weld identical vertices (flat soup -> indexed), drop unused
  await doc.transform(weld(), dedup(), prune());
  // stats after weld, before compression
  let tris = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      verts += p.getAttribute('POSITION').getCount();
      tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    }
  }
  let reference = null;
  if (opts.compress !== false) {
    await MeshoptEncoder.ready;
    await doc.transform(reorder({ encoder: MeshoptEncoder }));
    // vertex order is final from here on: quantize rescales, it never reorders
    if (opts.reference) reference = opts.reference(doc);
    await doc.transform(
      // _BONE stays an exact integer label; everything else quantises
      quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0|TEXCOORD_1|COLOR_0)$/, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8 }),
    );
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  } else if (opts.reference) {
    reference = opts.reference(doc);
  }
  const stats = {
    tris, verts,
    materials: doc.getRoot().listMaterials().length,
    meshes: doc.getRoot().listMeshes().length,
    textures: doc.getRoot().listTextures().length,
    bones: doc.getRoot().listSkins().reduce((n, s) => n + s.listJoints().length, 0),
  };
  const asset = doc.getRoot().getAsset();
  asset.generator = GENERATOR;
  asset.extras = { ...(opts.extras || {}), provenance, r5Stats: stats };
  const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  if (opts.file) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(opts.file), { recursive: true });
    writeFileSync(opts.file, bytes);
  }
  return { bytes: bytes.byteLength, ...stats, reference };
}

/**
 * Float snapshot of every mesh's POSITION in scene space, keyed by mesh name.
 * Call it from `opts.reference` (node transforms are identity there).
 */
export function snapshotPositions(doc, decimals = 6) {
  const out = {};
  const k = 10 ** decimals;
  for (const mesh of doc.getRoot().listMeshes()) {
    const p = mesh.listPrimitives()[0]?.getAttribute('POSITION');
    if (!p) continue;
    const arr = p.getArray();
    out[mesh.getName()] = Array.from(arr, (v) => Math.round(v * k) / k);
  }
  return out;
}

function normalize(a) {
  for (let i = 0; i < a.length; i += 3) {
    const l = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1;
    a[i] /= l; a[i + 1] /= l; a[i + 2] /= l;
  }
  return a;
}

export { THREE };
