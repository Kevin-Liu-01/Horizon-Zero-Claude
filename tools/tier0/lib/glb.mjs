// @ts-check
/**
 * Read what Tier 0 budgets need from a GLB without three.js (pure; takes bytes):
 * triangles and draws as instanced by the scene's nodes, and every image with its size.
 */
import { createHash } from 'node:crypto';

/** @typedef {{ index: number, mime: string, width: number, height: number, bytes: number, sha1: string, compressed: boolean }} ImageInfo */
/** @typedef {{ triangles: number, draws: number, byLod: Record<string, { triangles: number, draws: number }>, meshes: number, skins: number, nodesWithMesh: number, images: ImageInfo[], extensions: string[] }} GlbInfo */

/**
 * @param {Uint8Array} buf
 * @returns {{ json: any, bin: Uint8Array|null }}
 */
export function readGlbChunks(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  const length = dv.getUint32(8, true);
  let off = 12;
  let json = null;
  /** @type {Uint8Array|null} */
  let bin = null;
  while (off + 8 <= Math.min(length, buf.byteLength)) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

/**
 * Pixel size of an encoded image (PNG, JPEG, WebP, KTX2), or null.
 * @param {Uint8Array} b
 * @returns {{ width: number, height: number, mime: string } | null}
 */
export function imageSize(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: dv.getUint32(16), height: dv.getUint32(20), mime: 'image/png' };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
      const segLen = dv.getUint16(o + 2);
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: dv.getUint16(o + 5), width: dv.getUint16(o + 7), mime: 'image/jpeg' };
      }
      o += 2 + segLen;
    }
    return null;
  }
  if (b.length >= 30 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
    const fmt = String.fromCharCode(...b.subarray(12, 16));
    if (fmt === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff, mime: 'image/webp' };
    if (fmt === 'VP8L') {
      const bits = dv.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, mime: 'image/webp' };
    }
    if (fmt === 'VP8X') {
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { width: w, height: h, mime: 'image/webp' };
    }
    return null;
  }
  const KTX2 = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 32 && KTX2.every((x, k) => b[k] === x)) {
    return { width: dv.getUint32(20, true), height: dv.getUint32(24, true), mime: 'image/ktx2' };
  }
  return null;
}

/**
 * LOD level from a node or mesh name: `Skin_L1`, `Body_LOD2`, `hull.lod1` -> 1, 2, 1; anything else 0.
 * Triangles and draws are reported for LOD 0 (what the near tier draws); the rest go to `byLod`.
 * @param {string} name
 */
export function lodOf(name) {
  const m = /(?:[_.\-]L|[_.\-]?LOD)(\d+)$/i.exec(name);
  return m ? Number(m[1]) : 0;
}

/**
 * @param {Uint8Array} buf  whole .glb file
 * @returns {GlbInfo}
 */
export function inspectGlb(buf) {
  const { json, bin } = readGlbChunks(buf);
  const acc = json.accessors || [];
  const meshes = json.meshes || [];
  const nodes = json.nodes || [];
  /** @param {any} mesh */
  const meshCost = (mesh) => {
    let tris = 0;
    for (const p of mesh.primitives || []) {
      const mode = p.mode ?? 4;
      const count = p.indices != null ? acc[p.indices]?.count ?? 0 : acc[p.attributes?.POSITION]?.count ?? 0;
      if (mode === 4) tris += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) tris += Math.max(0, count - 2);
    }
    return { tris, draws: (mesh.primitives || []).length };
  };
  let triangles = 0;
  let draws = 0;
  let nodesWithMesh = 0;
  /** @type {Record<string, { triangles: number, draws: number }>} */
  const byLod = {};
  for (const n of nodes) {
    if (n.mesh == null || !meshes[n.mesh]) continue;
    const c = meshCost(meshes[n.mesh]);
    const lod = String(lodOf(n.name || meshes[n.mesh].name || ''));
    byLod[lod] = byLod[lod] || { triangles: 0, draws: 0 };
    byLod[lod].triangles += c.tris; byLod[lod].draws += c.draws;
    if (lod !== '0') continue;
    triangles += c.tris; draws += c.draws; nodesWithMesh++;
  }
  if (!nodesWithMesh) for (const m of meshes) { const c = meshCost(m); triangles += c.tris; draws += c.draws; }
  /** @type {ImageInfo[]} */
  const images = [];
  (json.images || []).forEach((/** @type {any} */ img, /** @type {number} */ index) => {
    /** @type {Uint8Array|null} */
    let bytes = null;
    if (img.bufferView != null && bin) {
      const bv = json.bufferViews[img.bufferView];
      bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    } else if (typeof img.uri === 'string' && img.uri.startsWith('data:')) {
      bytes = new Uint8Array(Buffer.from(img.uri.slice(img.uri.indexOf(',') + 1), 'base64'));
    }
    if (!bytes) { images.push({ index, mime: img.mimeType || 'external', width: 0, height: 0, bytes: 0, sha1: `external:${img.uri}`, compressed: false }); return; }
    const sz = imageSize(bytes);
    images.push({
      index, mime: sz?.mime || img.mimeType || 'unknown', width: sz?.width || 0, height: sz?.height || 0,
      bytes: bytes.length, sha1: createHash('sha1').update(bytes).digest('hex'), compressed: sz?.mime === 'image/ktx2',
    });
  });
  return {
    triangles, draws, byLod, meshes: meshes.length, skins: (json.skins || []).length, nodesWithMesh, images,
    extensions: json.extensionsUsed || [],
  };
}

/**
 * Resident GPU bytes for one texture with a full mip chain: RGBA8 when it ships as PNG/JPEG/WebP
 * (the browser decodes it to 32 bits per pixel), 8 bits per pixel when it ships as KTX2
 * (UASTC; ETC1S transcodes to BC7/ASTC at the same 8 bpp on this target). TECH §9.3's own rule.
 * @param {{ width: number, height: number, compressed: boolean }} t
 */
export function residentBytes(t) {
  const bpp = t.compressed ? 1 : 4;
  return Math.round(t.width * t.height * bpp * 4 / 3);
}
