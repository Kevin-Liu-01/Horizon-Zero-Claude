// decode the X-look-hdr-dump screenshot (RGBE: mantissa block + exponent block, 8 frames of 400x225) and render
// each frame through (a) the W0 output (ACES 0.94 + W0 grade, lamps.js outputForward) and (b) the CALIMA look
// (src/core/look.js with optional overrides): side-by-side sheet + stats.
// usage: node hdr-look.mjs <dump.png> <out-prefix> [set] [ev]   env GOV='{...golden overrides}' LOOKOV='{...look}'
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const T = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(T + '/package.json')('sharp');
const Lamps = await import(T + '/src/instruments/lamps.js');
const L = await import(T + '/src/core/look.js');
const S = await import(T + '/tools/look/stats-core.mjs');
const grade = JSON.parse(readFileSync(T + '/src/core/look.grade.json', 'utf8'));
if (process.env.GOV) for (const k of Object.keys(grade.sets)) Object.assign(grade.sets[k], JSON.parse(process.env.GOV));
if (process.env.LOOKOV) Object.assign(grade.look, JSON.parse(process.env.LOOKOV));
const [,, dump, prefix, setName = 'golden', ev = '0'] = process.argv;
const look = new L.Look(grade); look.set({ a: setName, b: setName, ev: +ev });
const P = { exposure: 0.94, aces: true, contrast: 1.07, saturation: 1.06, mix: 1, lift: [0.004, 0.006, 0.012], shadow: [0.94, 0.97, 1.08], highlight: [1.045, 1.005, 0.955], bloomThr: 1.08 };
const { data, info } = await sharp(dump).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = 400, H = 225, CH = info.channels;
const names = ['field', 'vista', 'aim', 'dusk', 'field17-back', 'vista18-side', 'noon', 'close'];
const tiles = [];
const fmt = (s) => `lo20 L${s.lo20.L} h${s.lo20.hue} a${s.lo20.a} b${s.lo20.b} | mid a${s.mid.a} b${s.mid.b} | hi10 h${s.hi10.hue} C${s.hi10.chroma} | C ${s.chroma} spread ${s.spread} p99 ${s.L.p99} clip ${s.clip} crush ${s.crush} vio ${s.violet}`;
for (let k = 0; k < 8; k++) {
  const ox = (k % 2) * 800, oy = Math.floor(k / 2) * 225;
  const a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4);
  let nonzero = 0; const t = [0, 0, 0], o = [0, 0, 0], x = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const mi = ((oy + y) * info.width + ox + xx) * CH, ei = ((oy + y) * info.width + ox + 400 + xx) * CH;
    const E = data[ei];
    const s = E ? Math.pow(2, E - 128) / 256 : 0;
    x[0] = (data[mi] + 0.5) * s; x[1] = (data[mi + 1] + 0.5) * s; x[2] = (data[mi + 2] + 0.5) * s;
    if (!E) { x[0] = x[1] = x[2] = 0; } else nonzero++;
    const di = (y * W + xx) * 4;
    Lamps.outputForward(x, P, t); look.evaluate(x, o);
    for (let c = 0; c < 3; c++) { a[di + c] = Math.round(t[c] * 255); b[di + c] = Math.round(o[c] * 255); }
    a[di + 3] = b[di + 3] = 255;
  }
  if (!nonzero) continue;
  console.log(`#${k} ${names[k]}\n  W0     ${fmt(S.frameStats(a, W, H))}\n  CALIMA ${fmt(S.frameStats(b, W, H))}`);
  tiles.push({ a, b, k });
}
const sheetW = 800, sheetH = 225 * tiles.length;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
tiles.forEach((tl, r) => { for (let y = 0; y < H; y++) { Buffer.from(tl.a.buffer).copy(sheet, ((r * H + y) * sheetW) * 4, y * W * 4, (y + 1) * W * 4); Buffer.from(tl.b.buffer).copy(sheet, ((r * H + y) * sheetW + 400) * 4, y * W * 4, (y + 1) * W * 4); } });
await sharp(sheet, { raw: { width: sheetW, height: sheetH, channels: 4 } }).png().toFile(prefix + '-sheet.png');
console.log('wrote', prefix + '-sheet.png');
