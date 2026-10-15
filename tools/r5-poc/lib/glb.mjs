/**
 * ROUND 5 PIPELINE PROOF — Bucket[] -> GLB, with @gltf-transform (no
 * GLTFExporter: it needs FileReader/Blob paths that node does not ship).
 *
 * One node + one mesh per bucket. The hull bucket uses the shared 8x1
 * palette PNG as its metallicRoughness texture (NEAREST, no mips); a bucket
 * flagged `emissive` gets a flat emissive material with no maps, which is
 * exactly what `Machine._collectEmissive` wires into the eye-state system.
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { weld, dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { paletteBytes, PALETTE_W } from './hs.mjs';
import * as THREE from 'three';

export async function paletteTexturePNG() {
  return sharp(Buffer.from(paletteBytes()), { raw: { width: PALETTE_W, height: 1, channels: 4 } })
    .png({ compressionLevel: 9 }).toBuffer();
}

/**
 * @param {Array<{bucket, material: {name, emissive?:[r,g,b], baseColor?:[r,g,b,a], extras?}}>} parts
 * @param {object} opts { file, extras, weld:boolean }
 */
export async function writeGLB(parts, opts) {
  const doc = new Document();
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
  if (opts.compress !== false) {
    await MeshoptEncoder.ready;
    await doc.transform(
      reorder({ encoder: MeshoptEncoder }),
      // _BONE stays an exact integer label; everything else quantises
      quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0|COLOR_0)$/, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8 }),
    );
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  }
  const asset = doc.getRoot().getAsset();
  asset.generator = 'r5-poc hard-surface generator';
  if (opts.extras) asset.extras = opts.extras;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  if (opts.file) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(opts.file), { recursive: true });
    writeFileSync(opts.file, bytes);
  }
  return { bytes: bytes.byteLength, tris, verts, materials: doc.getRoot().listMaterials().length,
    meshes: doc.getRoot().listMeshes().length, textures: doc.getRoot().listTextures().length };
}

function normalize(a) {
  for (let i = 0; i < a.length; i += 3) {
    const l = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1;
    a[i] /= l; a[i + 1] /= l; a[i + 2] /= l;
  }
  return a;
}

export { THREE };
