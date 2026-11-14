/**
 * Ground layer files → raw RGBA (world-ground W1). A decoded WebP goes through a 2D canvas,
 * so alpha is stored at 128..255 (tools/build/ground/gen-ground-layers.mjs) and the RGB
 * under it survives premultiplication to within a level. Works on the page and in a worker.
 */
export const LAYER_FILES = Object.freeze({
  big: Object.freeze(['sand', 'salt', 'basalt']),       // 1024², sampler2DArray tA1 / tN1
  small: Object.freeze(['mud', 'pebble']),              // 512²,  sampler2DArray tA2 / tN2
});
export const LAYER_SIZE = Object.freeze({ big: 1024, small: 512 });
/**
 * What ships (M0.10): one KTX2 texture array per size and part, layers in LAYER_FILES order, mips included.
 * `_a` is ETC1S (colour; sRGB data the shader decodes), `_n` UASTC. Built by tools/build/pipeline/ktx2.mjs from
 * the WebP pairs tools/build/ground/gen-ground-layers.mjs writes; loaded by src/core/assets.js (`TEXTURES` rows).
 */
export const layerArrayPath = (group, part) => `public/textures/ground/${group}_${part}.ktx2`;
export const layerArrayUrl = (group, part) => `/textures/ground/${group}_${part}.ktx2`;

export async function decodeLayer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ground layer ${url}: HTTP ${res.status}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const w = bmp.width, h = bmp.height;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const c2 = cv.getContext('2d', { willReadFrequently: true });
  c2.drawImage(bmp, 0, 0);
  const out = new Uint8Array(c2.getImageData(0, 0, w, h).data.buffer);
  bmp.close?.();
  return out;
}
