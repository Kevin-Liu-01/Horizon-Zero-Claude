/**
 * A browser-free PREVIEW of a generated Instrument (instruments, M2 wave 2): a small software rasteriser over the
 * generator's own triangle buckets (z-buffer, sun + sky Lambert on the vertex colours, the lamp system's iris drawn
 * as a calm disc at the lamp anchor), three views side by side, with a 1.70 m figure-height bar for scale. It is a
 * check of form, proportion and part placement before any Chrome is used; it is not the game's look.
 *
 *   node tools/instruments/preview.mjs <tiller|sickle|screed> <out.png>
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GEN = { tiller: 'gen-tiller.mjs', sickle: 'gen-sickle.mjs', screed: 'gen-screed.mjs' };

function render(tris, { W, H, yaw, pitch, lamps, dist, target, fov = 32 }) {
  const img = new Float32Array(W * H * 3), zb = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) { const v = 0.32 + 0.18 * (1 - Math.floor(i / W) / H); img[i * 3] = v * 0.95; img[i * 3 + 1] = v * 0.93; img[i * 3 + 2] = v; }
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const sun = norm([0.45, 0.8, 0.55]);
  const proj = (x, y, z) => {
    x -= target[0]; y -= target[1]; z -= target[2];
    const x1 = cy * x - sy * z, z1 = sy * x + cy * z;          // yaw about y
    const y2 = cp * y - sp * z1, z2 = sp * y + cp * z1;        // pitch about x
    const d = dist - z2;
    return [W / 2 + (x1 * f / d) * (H / 2), H / 2 - (y2 * f / d) * (H / 2), d];
  };
  for (const t of tris) {
    const a = proj(...t.p[0]), b = proj(...t.p[1]), c = proj(...t.p[2]);
    if (a[2] <= 0.1 || b[2] <= 0.1 || c[2] <= 0.1) continue;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (area >= 0) continue;   // back face (screen y is down)
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2], k = y * W + x;
      if (z >= zb[k]) continue;
      zb[k] = z;
      const n = norm([0, 1, 2].map((j) => w0 * t.n[0][j] + w1 * t.n[1][j] + w2 * t.n[2][j]));
      const lam = Math.max(0, dot(n, sun)), sky = 0.35 + 0.25 * n[1];
      for (let j = 0; j < 3; j++) img[k * 3 + j] = (w0 * t.c[0][j] + w1 * t.c[1][j] + w2 * t.c[2][j]) * (lam * 1.1 + sky) + (t.emit ? t.emit[j] : 0);
    }
  }
  for (const L of lamps) {
    const p = proj(...L.at), r = Math.max(2, (L.r * f / p[2]) * (H / 2));
    for (let y = Math.floor(p[1] - r); y <= p[1] + r; y++) for (let x = Math.floor(p[0] - r); x <= p[0] + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if ((x - p[0]) ** 2 + (y - p[1]) ** 2 > r * r || zb[k] < p[2] - 0.05) continue;
      img[k * 3] = 1.0; img[k * 3 + 1] = 0.85; img[k * 3 + 2] = 0.62;
    }
  }
  return img;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

function trisOf(b, emit = null) {
  const out = [];
  for (let i = 0; i < b.pos.length; i += 9) {
    const p = [0, 1, 2].map((k) => [b.pos[i + k * 3], b.pos[i + k * 3 + 1], b.pos[i + k * 3 + 2]]);
    const n = [0, 1, 2].map((k) => [b.nor[i + k * 3], b.nor[i + k * 3 + 1], b.nor[i + k * 3 + 2]]);
    const c = [0, 1, 2].map((k) => [b.col[i + k * 3], b.col[i + k * 3 + 1], b.col[i + k * 3 + 2]]);
    out.push({ p, n, c, emit });
  }
  return out;
}

const kind = process.argv[2], OUT = process.argv[3];
if (!GEN[kind] || !OUT) { console.error('usage: node tools/instruments/preview.mjs <tiller|sickle|screed> <out.png>'); process.exit(2); }
const mod = await import(pathToFileURL(path.join(ROOT, 'tools/build/instruments', GEN[kind])).href);
const r = await mod.build({ out: path.dirname(path.resolve(OUT)), file: path.resolve(OUT + '.glb'), preview: true });
const B = r._buckets;
let tris = [];
for (const b of B.hull) tris = tris.concat(trisOf(b));
for (const b of B.glass || []) tris = tris.concat(trisOf(b, [0.55, 0.75, 0.74]));
const size = B.size, h = size.y;
// Brea's height bar beside it
const bar = { pos: [], nor: [], col: [] };
const bx = size.x / 2 + 0.6;
for (const [a, b2, c] of [[[bx, 0, 0], [bx + 0.3, 0, 0], [bx + 0.3, 1.7, 0]], [[bx, 0, 0], [bx + 0.3, 1.7, 0], [bx, 1.7, 0]]]) {
  for (const q of [a, b2, c]) { bar.pos.push(...q); bar.nor.push(0, 0, 1); bar.col.push(0.42, 0.18, 0.5); }
}
tris = tris.concat(trisOf(bar));
const W = 560, Hh = 460, lamps = B.lamps || [];
const target = [0, h * 0.48, 0];
const dist = Math.max(size.z, h * 1.6) * Number(process.env.PREVIEW_DIST || 1.7);
// PREVIEW_YAWS="a,b,c" (radians) picks the three bearings; default three-quarter front, side, rear three-quarter
const yaws = (process.env.PREVIEW_YAWS || '-0.65,-1.5708,2.54').split(',').map(Number);
const pitches = [0.12, 0.02, 0.32];
const views = yaws.slice(0, 3).map((yaw, i) => render(tris, { W, H: Hh, yaw, pitch: pitches[i], lamps, dist, target }));
const buf = Buffer.alloc(W * 3 * Hh * 3);
views.forEach((img, vi) => {
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 3, o = (y * W * 3 + vi * W + x) * 3;
    for (let j = 0; j < 3; j++) { const v = Math.max(0, img[k + j]); buf[o + j] = Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
  }
});
await sharp(buf, { raw: { width: W * 3, height: Hh, channels: 3 } }).png().toFile(OUT);
delete r._buckets;
console.log(JSON.stringify(r));
