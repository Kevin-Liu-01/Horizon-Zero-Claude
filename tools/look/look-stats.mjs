#!/usr/bin/env node
/**
 * tools/look/look-stats.mjs — the look's yardstick (lane look-post, L-00;
 * docs/ROUND5-LOOK.md §3.1 L-00, §7 A-look-suite / A-look-frame-stats).
 *
 *   node tools/look/look-stats.mjs <frame.png> [--exclude x0,y0,x1,y1;...] [--ref 1-TR] [--place field]
 *        frame statistics of a canvas-only PNG (the HUD is DOM and never in it), with the
 *        stored panel numbers and the A-look-frame-stats bars of the named place beside them
 *   node tools/look/look-stats.mjs --compare <before.png> <after.png> --ref 1-TR [--place field]
 *   node tools/look/look-stats.mjs --refs [--dir /Users/kevinliu/.calima-r5/direction] [--write]
 *        panel statistics of Kevin's Nov 6 references -> tools/look/refs.json (numbers only:
 *        stats + <= 8 L*a*b* swatches per panel; R66 a). The references are read where they
 *        live, outside the repo; nothing is copied, cropped to disk or stored as pixels.
 *   node tools/look/look-stats.mjs --selftest
 *        A-look-suite (b): a synthetic 6-patch image within +-0.5 L*a*b* and +-0.5 % per mask,
 *        and the fixture PNG's stats reproduced within +-0.3 per number (tools/look/fixture.json)
 *
 * The statistics are tools/look/stats-core.mjs (the gates call the same module in the page).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { frameStats, swatches, srgb8ToLab } from './stats-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REFS_FILE = path.join(HERE, 'refs.json');
export const DIRECTION_DIR = '/Users/kevinliu/.calima-r5/direction';

/**
 * THE PANELS (ROUND5-LOOK §0.2). Boxes and HUD exclusions in the reference image's own pixel
 * coordinates [x0, y0, x1, y1): the statistics describe the WORLD under the light, so the panels'
 * painted HUD cards, wordmarks and labels are not counted. Coordinates only; no pixel is stored.
 */
export const PANELS = {
  '1-TL': { file: 'kevin-nov6-keyart.jpg', sha8: '860d7e9f', box: [4, 4, 846, 383], exclude: [[60, 40, 455, 240]],
    what: 'key art: Brea 3/4 from behind, the Ring, spires, valley mist' },
  '1-TR': { file: 'kevin-nov6-keyart.jpg', sha8: '860d7e9f', box: [853, 2, 1670, 383],
    exclude: [[866, 33, 1043, 79], [1121, 0, 1491, 48], [1501, 78, 1659, 193], [1336, 225, 1374, 240], [861, 335, 976, 378], [1486, 335, 1666, 380]],
    what: 'our Sighting frame repainted: golden carpet, rose-violet mesas' },
  '1-MC': { file: 'kevin-nov6-keyart.jpg', sha8: '860d7e9f', box: [583, 390, 1095, 680], exclude: [],
    what: 'three face close-ups in sunset light' },
  '1-MR': { file: 'kevin-nov6-keyart.jpg', sha8: '860d7e9f', box: [1101, 390, 1670, 680], exclude: [],
    what: 'sunset coastal vista: sun, sea glitter, islets, the Ring' },
  '1-BL': { file: 'kevin-nov6-keyart.jpg', sha8: '860d7e9f', box: [2, 687, 494, 939], exclude: [[0, 895, 110, 941]],
    what: 'bow aim against machines, golden backlight' },
  '2-MR': { file: 'kevin-nov6-board.jpg', sha8: 'f2694e04', box: [1052, 449, 1528, 695],
    exclude: [[1046, 453, 1281, 538], [1241, 455, 1316, 473], [1371, 468, 1534, 633], [1056, 593, 1161, 693], [1176, 648, 1281, 693], [1326, 615, 1396, 638], [1466, 663, 1526, 693]],
    what: 'UI panel over a dusk meadow with violet flowers' },
  '2-BRc': { file: 'kevin-nov6-board.jpg', sha8: 'f2694e04', box: [1334, 737, 1418, 898], exclude: [],
    what: "BIOMES card 'The Calima': dust-storm light" },
};

/**
 * A-look-frame-stats bars per look place (ROUND5-LOOK §7, verbatim). `ref` is the panel each is
 * graded against. A bar is [lo, hi] (null = open); `hueIn` is [lo, hi] in degrees, wrapping.
 */
export const LOOK_BARS = {
  field: { ref: '1-TR', bars: {
    'lo20.hue': [35, 58], 'lo20.L': [20, 30], 'hi10.hue': [62, 80], 'hi10.chroma': [null, 18], 'mid.b': [8, 18],
    chroma: [22, 29], spread: [62, null], 'L.p99': [88, null], clip: [0.2, 3] } },
  vista: { ref: '1-MR', bars: {
    'lo20.a': [8, null], 'lo20.b': [null, 10], 'mid.a': [12, 22], 'mid.b': [5, 15], chroma: [18, 27], spread: [60, null],
    'L.p99': [90, null], clip: [1, 5], crush: [null, 1.5], topBottom: [1.8, null], 'bands.0.stdL': [null, 12] } },
  aim: { ref: '1-BL', bars: {
    'lo20.a': [8, null], 'lo20.b': [null, 8], 'hi10.hue': [55, 75], 'hi10.chroma': [null, 16], 'mid.b': [null, 14],
    chroma: [16, 25], spread: [66, null], 'L.p99': [90, null], clip: [0.5, 4] } },
  close: { ref: '1-MC', bars: {
    'lo20.a': [10, null], 'lo20.b': [null, 6], 'lo20.L': [9, 16], 'hi10.hue': [40, 65], 'mid.a': [20, null], 'mid.b': [null, 8], crush: [null, 3] } },
  dusk: { ref: '2-MR', bars: {
    'mid.b': [null, -4], 'mid.a': [5, 15], 'lo20.hue': { hueIn: [320, 20] }, chroma: [12, 20] } },
};

export const pick = (o, key) => key.split('.').reduce((v, k) => (v == null ? v : v[k]), o);

/** Grade one stats object against a place's bars -> { pass, rows: [{ key, value, bar, ok }] }. */
export function gradeBars(stats, place) {
  const B = LOOK_BARS[place];
  if (!B) return { pass: null, rows: [] };
  const rows = [];
  for (const [key, bar] of Object.entries(B.bars)) {
    const v = pick(stats, key);
    let ok;
    if (bar && bar.hueIn) { const [lo, hi] = bar.hueIn; ok = v != null && (lo <= hi ? v >= lo && v <= hi : v >= lo || v <= hi); }
    else ok = v != null && (bar[0] == null || v >= bar[0]) && (bar[1] == null || v <= bar[1]);
    rows.push({ key, value: v, bar, ok });
  }
  return { pass: rows.every((r) => r.ok), rows };
}

async function loadRgba(file, box = null) {
  const sharp = (await import('sharp')).default;
  let img = sharp(file).removeAlpha().ensureAlpha();
  if (box) img = img.extract({ left: box[0], top: box[1], width: box[2] - box[0], height: box[3] - box[1] });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Every panel's statistics from the references, where they live (numbers only). */
export async function computeRefs(dir = DIRECTION_DIR) {
  const out = { about: 'Panel statistics of Kevin\'s Nov 6 references (ROUND5-LOOK §0.2), computed by tools/look/look-stats.mjs --refs. Numbers only (R66 a): CIELAB D65 statistics and <= 8 swatches per panel; no pixels. Definitions: tools/look/stats-core.mjs.',
    generated: new Date().toISOString().slice(0, 10), panels: {} };
  const seen = new Map();
  for (const [id, P] of Object.entries(PANELS)) {
    const f = path.join(dir, P.file);
    if (!existsSync(f)) { out.panels[id] = { missing: P.file }; continue; }
    if (!seen.has(f)) seen.set(f, sha256(f));
    const sha = seen.get(f);
    if (!sha.startsWith(P.sha8)) { out.panels[id] = { shaMismatch: sha.slice(0, 8), want: P.sha8 }; continue; }
    const { rgba, width, height } = await loadRgba(f, P.box);
    const ex = P.exclude.map(([x0, y0, x1, y1]) => [x0 - P.box[0], y0 - P.box[1], x1 - P.box[0], y1 - P.box[1]]);
    const st = frameStats(rgba, width, height, { exclude: ex });
    out.panels[id] = { cite: `ext:${P.file}@${P.sha8}#${id}`, what: P.what, size: [width, height], stats: st,
      swatches: swatches(rgba, width, height, 8, { exclude: ex, step: 2 }) };
  }
  return out;
}

export function loadRefs() {
  try { return JSON.parse(readFileSync(REFS_FILE, 'utf8')); } catch { return null; }
}

/** A-look-suite (b): the synthetic 6-patch image and the fixture. */
export async function selftest() {
  const W = 300, H = 200;
  const patches = [[230, 190, 120], [70, 50, 90], [160, 120, 60], [30, 30, 34], [200, 160, 210], [120, 140, 90]];
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = patches[Math.floor(x / 100) + 3 * Math.floor(y / 100)];
    const i = (y * W + x) * 4; rgba[i] = p[0]; rgba[i + 1] = p[1]; rgba[i + 2] = p[2]; rgba[i + 3] = 255;
  }
  const st = frameStats(rgba, W, H);
  // expected, computed independently: each patch's L*a*b* by the colour lib of instruments-core
  const C = await import(pathToFileURL(path.join(HERE, '../../src/instruments/lib/color.js')).href);
  const labs = patches.map((p) => C.rgbToLab(p.map((v) => v / 255)));
  const Ls = labs.map((l) => l[0]).sort((a, b) => a - b);
  const meanC = labs.reduce((s, l) => s + Math.hypot(l[1], l[2]), 0) / 6;
  const hue = (l) => { let h = Math.atan2(l[2], l[1]) * 180 / Math.PI; return h < 0 ? h + 360 : h; };
  const maskShare = (pred) => 100 * labs.filter(pred).length / 6;
  const gold = maskShare((l) => Math.hypot(l[1], l[2]) >= 25 && l[0] >= 30 && hue(l) >= 50 && hue(l) <= 95);
  const vio = maskShare((l) => Math.hypot(l[1], l[2]) >= 10 && hue(l) >= 280 && hue(l) <= 345);
  const rows = [
    ['L.p50', st.L.p50, Ls[Math.round(0.5 * 5)], 0.5],
    ['L.p5', st.L.p5, Ls[0], 0.5],
    ['L.p95', st.L.p95, Ls[5], 0.5],
    ['chroma', st.chroma, meanC, 0.5],
    ['gold%', st.gold, gold, 0.5],
    ['violet%', st.violet, vio, 0.5],
  ];
  // per-patch L*a*b* through the core's own converter
  const lab = [0, 0, 0];
  patches.forEach((p, k) => {
    srgb8ToLab(p[0], p[1], p[2], lab);
    for (let c = 0; c < 3; c++) rows.push([`patch${k}.${'Lab'[c]}`, lab[c], labs[k][c], 0.5]);
  });
  const synth = rows.map(([key, got, want, tol]) => ({ key, got: +got.toFixed(3), want: +want.toFixed(3), ok: Math.abs(got - want) <= tol }));
  // the fixture: a stored PNG's stats reproduced within +-0.3 per number
  let fixture = { skipped: 'no tools/look/fixture.json' };
  const fx = path.join(HERE, 'fixture.json');
  if (existsSync(fx)) {
    const F = JSON.parse(readFileSync(fx, 'utf8'));
    const img = path.join(HERE, F.png);
    const { rgba: r2, width, height } = await loadRgba(img);
    const now = frameStats(r2, width, height);
    const bad = [];
    const walk = (a, b, pre) => {
      for (const k of Object.keys(b)) {
        if (typeof b[k] === 'number') { if (!(Math.abs((a?.[k] ?? NaN) - b[k]) <= 0.3)) bad.push({ key: pre + k, got: a?.[k], want: b[k] }); }
        else if (b[k] && typeof b[k] === 'object') walk(a?.[k], b[k], pre + k + '.');
      }
    };
    walk(now, F.stats, '');
    fixture = { png: F.png, numbers: JSON.stringify(F.stats).match(/-?\d+(\.\d+)?/g).length, bad, ok: bad.length === 0 };
  }
  return { pass: synth.every((r) => r.ok) && fixture.ok !== false, synth, fixture };
}

function fmtBars(stats, place) {
  const g = gradeBars(stats, place);
  return g.rows.map((r) => `  ${r.ok ? 'ok  ' : 'MISS'} ${r.key.padEnd(14)} ${String(r.value).padStart(7)}   bar ${JSON.stringify(r.bar)}`).join('\n')
    + `\n  -> ${g.pass ? 'PASS' : 'FAIL'} (${g.rows.filter((r) => r.ok).length}/${g.rows.length})`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const has = (k) => args.includes(k);
  if (has('--selftest')) {
    const r = await selftest();
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.pass ? 0 : 1);
  } else if (has('--refs')) {
    const refs = await computeRefs(flag('--dir', DIRECTION_DIR));
    const text = JSON.stringify(refs);
    if (has('--write')) { writeFileSync(REFS_FILE, text + '\n'); console.log(`wrote ${REFS_FILE} (${text.length} bytes)`); }
    for (const [id, p] of Object.entries(refs.panels)) {
      const s = p.stats;
      if (!s) { console.log(id, JSON.stringify(p)); continue; }
      console.log(`${id}  lo20 L${s.lo20.L} hue ${s.lo20.hue} (a ${s.lo20.a} b ${s.lo20.b})  mid a ${s.mid.a} b ${s.mid.b}  hi10 hue ${s.hi10.hue} C ${s.hi10.chroma}  chroma ${s.chroma}  p95-p5 ${s.spread}  p99 ${s.L.p99}  clip ${s.clip}%  crush ${s.crush}%  gold ${s.gold}%  violet ${s.violet}%  top/bottom ${s.topBottom}`);
    }
    for (const [place, B] of Object.entries(LOOK_BARS)) {
      const s = refs.panels[B.ref]?.stats;
      if (s) console.log(`\n${place} bars on its own panel ${B.ref}:\n${fmtBars(s, place)}`);
    }
  } else {
    const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--compare'));
    const ex = (flag('--exclude', '') || '').split(';').filter(Boolean).map((r) => r.split(',').map(Number));
    const place = flag('--place');
    const ref = flag('--ref') || (place && LOOK_BARS[place]?.ref);
    const refs = loadRefs();
    for (const f of files) {
      const { rgba, width, height } = await loadRgba(f);
      const s = frameStats(rgba, width, height, { exclude: ex });
      if (has('--json')) { console.log(JSON.stringify({ file: f, stats: s })); continue; }
      console.log(`\n${f} (${width}x${height})`);
      console.log(`  lo20 L${s.lo20.L} hue ${s.lo20.hue} (a ${s.lo20.a} b ${s.lo20.b})  mid a ${s.mid.a} b ${s.mid.b} hue ${s.mid.hue}  hi10 L${s.hi10.L} hue ${s.hi10.hue} C ${s.hi10.chroma}`);
      console.log(`  chroma ${s.chroma}  p5 ${s.L.p5} p50 ${s.L.p50} p95 ${s.L.p95} p99 ${s.L.p99} spread ${s.spread}  clip ${s.clip}%  crush ${s.crush}%  gold ${s.gold}%  violet ${s.violet}% (strong ${s.strongViolet}%)  top/bottom ${s.topBottom}`);
      if (place) console.log(fmtBars(s, place));
      const R = ref && refs?.panels?.[ref]?.stats;
      if (R) console.log(`  ${ref}: lo20 L${R.lo20.L} hue ${R.lo20.hue}  mid a ${R.mid.a} b ${R.mid.b}  hi10 hue ${R.hi10.hue} C ${R.hi10.chroma}  chroma ${R.chroma}  spread ${R.spread}  p99 ${R.L.p99}  clip ${R.clip}%  violet ${R.violet}%`);
    }
  }
}
