import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectGlb, imageSize, residentBytes, lodOf } from '../lib/glb.mjs';
import { lineOf } from '../budgets.mjs';

/** A minimal GLB: one node -> one mesh with two indexed triangle primitives, one embedded PNG header. */
function makeGlb() {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 1024);
  new DataView(png.buffer).setUint32(20, 512);
  const bin = new Uint8Array(24 + 4 * 0);
  bin.set(png, 0);
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 24 }],
    images: [{ bufferView: 0, mimeType: 'image/png' }],
    accessors: [{ count: 300 }, { count: 600 }, { count: 30 }],
    meshes: [
      { name: 'Body', primitives: [{ attributes: { POSITION: 2 }, indices: 0 }, { attributes: { POSITION: 2 }, indices: 1 }] },
      { name: 'Body_L1', primitives: [{ attributes: { POSITION: 2 }, indices: 0 }] },
    ],
    nodes: [{ mesh: 0, name: 'Body' }, { mesh: 1, name: 'Body_L1' }, { mesh: 0, name: 'Twin' }],
  };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (js.length % 4)) % 4;
  js = new Uint8Array([...js, ...new Array(pad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(js, 20);
  const o = 20 + js.length;
  dv.setUint32(o, bin.length, true); dv.setUint32(o + 4, 0x004e4942, true); out.set(bin, o + 8);
  return out;
}

test('inspectGlb counts LOD 0 triangles and draws per node instance, and reads image sizes', () => {
  const g = inspectGlb(makeGlb());
  assert.equal(g.triangles, 2 * (100 + 200));
  assert.equal(g.draws, 4);
  assert.deepEqual(g.byLod['1'], { triangles: 100, draws: 1 });
  assert.equal(g.images.length, 1);
  assert.equal(g.images[0].width, 1024);
  assert.equal(g.images[0].height, 512);
  assert.equal(g.images[0].compressed, false);
});

test('lodOf reads common LOD suffixes', () => {
  assert.equal(lodOf('Skin_L0'), 0);
  assert.equal(lodOf('Skin_L2'), 2);
  assert.equal(lodOf('hull_LOD1'), 1);
  assert.equal(lodOf('Caster'), 0);
  assert.equal(lodOf('LEVEL'), 0);
});

test('imageSize: WebP lossy / lossless / extended and KTX2 headers', () => {
  const vp8 = new Uint8Array(30);
  vp8.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  vp8.set([...'WEBPVP8 '].map((c) => c.charCodeAt(0)), 8);
  new DataView(vp8.buffer).setUint16(26, 640, true);
  new DataView(vp8.buffer).setUint16(28, 480, true);
  assert.deepEqual(imageSize(vp8), { width: 640, height: 480, mime: 'image/webp' });
  const vp8x = new Uint8Array(30);
  vp8x.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  vp8x.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
  vp8x.set([2047 & 255, 2047 >> 8, 0, 1023 & 255, 1023 >> 8, 0], 24);
  assert.deepEqual(imageSize(vp8x), { width: 2048, height: 1024, mime: 'image/webp' });
  const vp8l = new Uint8Array(30);
  vp8l.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  vp8l.set([...'WEBPVP8L'].map((c) => c.charCodeAt(0)), 8);
  new DataView(vp8l.buffer).setUint32(21, (511) | (255 << 14), true);
  assert.deepEqual(imageSize(vp8l), { width: 512, height: 256, mime: 'image/webp' });
  const ktx = new Uint8Array(32);
  ktx.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(ktx.buffer).setUint32(20, 2048, true);
  new DataView(ktx.buffer).setUint32(24, 2048, true);
  assert.deepEqual(imageSize(ktx), { width: 2048, height: 2048, mime: 'image/ktx2' });
  assert.equal(imageSize(new Uint8Array(40)), null);
});

test('residentBytes follows the ledger rule: RGBA8 + mips, or 8 bpp + mips for KTX2', () => {
  // 2048² RGBA8 with mips is 22.4 MB (decimal); 8 bpp compressed is 5.6 MB.
  assert.equal(Math.round(residentBytes({ width: 2048, height: 2048, compressed: false }) / 1e5) / 10, 22.4);
  assert.equal(Math.round(residentBytes({ width: 2048, height: 2048, compressed: true }) / 1e5) / 10, 5.6);
});

test('lineOf picks the first matching ledger line, honours excludes, and falls back to the last', () => {
  const lines = [
    { id: 'a', prefixes: ['public/models/npc/'], excludePrefixes: ['public/models/npc/atlas-'] },
    { id: 'b', prefixes: ['public/models/npc/atlas-'] },
    { id: 'rest', prefixes: [''] },
  ];
  assert.equal(lineOf('public/models/npc/body.glb', lines), 'a');
  assert.equal(lineOf('public/models/npc/atlas-x.glb', lines), 'b');
  assert.equal(lineOf('public/audio/x.ogg', lines), 'rest');
});
