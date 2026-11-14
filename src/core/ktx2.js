import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
  read, KHR_SUPERCOMPRESSION_NONE, KHR_SUPERCOMPRESSION_ZSTD,
  KHR_DF_TRANSFER_SRGB, VK_FORMAT_R8G8B8A8_SRGB, VK_FORMAT_R8G8B8A8_UNORM,
} from 'three/examples/jsm/libs/ktx-parse.module.js';
import { ZSTDDecoder } from 'three/examples/jsm/libs/zstddec.module.js';
import transcoderJs from 'three/examples/jsm/libs/basis/basis_transcoder.js?raw';
import transcoderWasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';

/**
 * KTX2 textures (M0.10). Every texture the game ships is KTX2 (tools/build/pipeline/ktx2.mjs): UASTC or ETC1S
 * Basis Universal, transcoded in workers to what this GPU samples natively (ASTC 4x4 or ETC2 on Apple GPUs,
 * BC7 / BC1-3 elsewhere), or uncompressed RGBA8 for exact-data tables.
 *
 * ONE loader per page (three warns about more): the engine calls `configureKTX2(renderer)` as soon as its
 * renderer exists, before anything is loaded; `src/core/assets.js` hands `ktx2Loader()` to its GLTFLoader and
 * loads its texture rows through `loadKTX2()`.
 *
 * The Basis transcoder is bundled with the code (its JS as text, its wasm as a hashed asset), so it is fetched
 * from the same origin in dev and in a build and never from public/.
 */

let _loader = null;
let _renderer = null;
let _jsUrl = null;

/** Create the page's KTX2 loader for this renderer (idempotent per renderer). */
export function configureKTX2(renderer) {
  if (_loader && _renderer === renderer) return _loader;
  if (_loader) _loader.dispose();
  if (!_jsUrl) _jsUrl = URL.createObjectURL(new Blob([transcoderJs], { type: 'text/javascript' }));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.endsWith('basis_transcoder.js')) return _jsUrl;
    if (url.endsWith('basis_transcoder.wasm')) return transcoderWasmUrl;
    return url;
  });
  _loader = new KTX2Loader(manager).setTranscoderPath('basis/').setWorkerLimit(2).detectSupport(renderer);
  _renderer = renderer;
  return _loader;
}

/** The page's KTX2 loader, or null before the engine has a renderer. */
export function ktx2Loader() { return _loader; }

/** What the transcoder will target on this GPU (for ledgers and logs). */
export function ktx2Targets() {
  const c = _loader?.workerConfig;
  if (!c) return null;
  return { uastc: c.astcSupported ? 'ASTC 4x4' : c.bptcSupported ? 'BC7' : c.etc2Supported ? 'ETC2' : c.dxtSupported ? 'BC3' : 'RGBA8',
    etc1s: c.etc2Supported ? 'ETC2' : c.bptcSupported ? 'BC7' : c.dxtSupported ? 'BC1/BC3' : 'RGBA8' };
}

let _zstd = null;
async function zstd() {
  if (!_zstd) _zstd = (async () => { const z = new ZSTDDecoder(); await z.init(); return z; })();
  return _zstd;
}

/**
 * An uncompressed RGBA8 KTX2 ARRAY: three's KTX2Loader builds raw files as a 2D DataTexture (it ignores the layer
 * count), so arrays of raw RGBA8 are built here, with every mip level the file carries. Used by the uncompressed
 * reference build the M0.10 A/B renders against; the shipped arrays are Basis and go through the loader.
 */
async function rawArray(container) {
  const { pixelWidth: w, pixelHeight: h, layerCount: n } = container;
  const mipmaps = [];
  for (let l = 0; l < container.levels.length; l++) {
    const lv = container.levels[l];
    let data = lv.levelData;
    if (container.supercompressionScheme === KHR_SUPERCOMPRESSION_ZSTD) data = (await zstd()).decode(data, lv.uncompressedByteLength);
    else if (container.supercompressionScheme !== KHR_SUPERCOMPRESSION_NONE) throw new Error('KTX2: unsupported supercompression');
    mipmaps.push({ data: new Uint8Array(data), width: Math.max(1, w >> l), height: Math.max(1, h >> l), depth: n });
  }
  const t = new THREE.DataArrayTexture(mipmaps[0].data, w, h, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  if (mipmaps.length > 1) { t.mipmaps = mipmaps; t.generateMipmaps = false; t.minFilter = THREE.LinearMipmapLinearFilter; } else t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.colorSpace = container.dataFormatDescriptor[0].transferFunction === KHR_DF_TRANSFER_SRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Load one KTX2 file as a texture.
 * @param {string} url
 * @param {{ colorSpace?: 'none'|'srgb'|'file', wrap?: 'repeat'|'clamp', anisotropy?: number }} [opts]
 *   colorSpace 'none': sample the texels as stored (a shader that decodes sRGB itself); 'file' (default): as tagged
 */
export async function loadKTX2(url, { colorSpace = 'file', wrap = 'clamp', anisotropy = 1 } = {}) {
  if (!_loader) throw new Error('[ktx2] configureKTX2(renderer) has not run');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[ktx2] ${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = read(new Uint8Array(buf));
  const raw = head.vkFormat === VK_FORMAT_R8G8B8A8_SRGB || head.vkFormat === VK_FORMAT_R8G8B8A8_UNORM;
  const tex = raw && head.layerCount > 1 ? await rawArray(head) : await _loader._createTexture(buf);
  if (colorSpace === 'none') tex.colorSpace = THREE.NoColorSpace;
  else if (colorSpace === 'srgb') tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = wrap === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = anisotropy;
  tex.flipY = false;
  tex.name = url.split('/').pop() || url;
  tex.needsUpdate = true;
  return tex;
}

/** GPU bytes of a texture as uploaded (compressed formats by their block size, mips included). */
export function textureBytes(t) {
  const img = t.image || {};
  const layers = t.isCompressedArrayTexture || t.isDataArrayTexture ? (img.depth || 1) : t.isCubeTexture ? 6 : 1;
  const bpp = BPP[t.format] ?? 4;
  const mips = t.mipmaps?.length ? t.mipmaps.map((m) => [m.width, m.height])
    : (() => { const o = []; let w = img.width || 0, h = img.height || 0; const all = t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter;
      for (;;) { o.push([w, h]); if (!all || (w <= 1 && h <= 1)) break; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); } return o; })();
  let s = 0;
  for (const [w, h] of mips) s += (t.isCompressedTexture ? Math.ceil(w / 4) * Math.ceil(h / 4) * 16 * bpp : w * h * bpp);
  return s * layers;
}
// bytes per pixel for raw formats; per 4x4 block for compressed, as a multiple of 16 bytes
const BPP = {
  [THREE.RGBAFormat]: 4, [THREE.RGFormat]: 2, [THREE.RedFormat]: 1,
  [THREE.RGBA_ASTC_4x4_Format]: 1, [THREE.RGBA_BPTC_Format]: 1, [THREE.RGBA_S3TC_DXT5_Format]: 1,
  [THREE.RGBA_S3TC_DXT1_Format]: 0.5, [THREE.RGB_S3TC_DXT1_Format]: 0.5, [THREE.RGBA_ETC2_EAC_Format]: 1,
  [THREE.RGB_ETC2_Format]: 0.5, [THREE.RGB_ETC1_Format]: 0.5,
};
