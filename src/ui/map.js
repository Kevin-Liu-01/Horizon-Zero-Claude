/**
 * THE SURVEY SHEET  —  lane `shell-ui` (bible §9.7, §8.4, §8.5; gates A-map-triangles,
 * V-map, A70, A70b)
 * ===========================================================================
 * Not a minimap: a page of the field book. Paper, a graticule, the coastline with its
 * waterlines and depth soundings offshore. That is ALL it shows at the start. Everything
 * else is earned: climb a trig pillar, sight two others, and the triangle between the
 * three opens: a cleaner wash of paper with the contours inked in (every 5 m, index
 * every 25 m), its place names in Chakra Petch, the Datum Line regions in vermilion.
 *
 * Layers, bottom to top:
 *   1. base sheet (baked)   paper, grain, graticule, coast, waterlines, soundings, cartouche
 *   2. revealed triangles   a wash, then the baked ink layer through a clip of the union
 *   3. Datum Line           vermilion, inside the surveyed area (`ctx.datum`, world-ground W2)
 *   4. sight lines + pillars
 *   5. sites                inside a surveyed triangle
 *   6. objectives           `progression.getMarkers()`, the same list the circle draws
 *   7. Flagged Instruments  `sighting.tags` only: the sheet is not a radar
 *   8. Brea, the waypoint
 *
 * COST. The bake runs once per session, time-sliced to 6 ms a frame (heightfield, then
 * marching squares row by row). Two baked canvases stay alive until `dispose()`; the
 * display canvas is released on unmount. `draw()` is a ~1 ms pass on open and on input.
 * Nothing here runs while the world is simulating except `track()`, every 0.35 s.
 *
 * PUBLISHED — `ctx.menus.map`
 *   revealTriangle(a, b, c) -> boolean     ids 'T1'..'T6'; persisted; emits `map-triangle-opened`
 *   triangles() -> [['T1','T2','T6'], ...]  setTriangles(list)     for the save (progression W3)
 *   event `triangle-revealed` { pillars: [a, b, c] }               the same reveal, for lanes without a handle
 *   setWaypoint(x, z, label) · clearWaypoint() · compassMarks()
 * State: localStorage `cal.map.v5` (fog + triangles).
 */

import { WORLD_SIZE, WORLD_HALF, PLAY_RADIUS } from '../world/terrain.js';
import * as ISLAND from '../world/island/sites.js';
import { fieldWord } from './tips.js';

const FOG_N = 72;                       // discovery cells per axis
const FOG_REVEAL_M = 95;                // how far her presence discovers a site
const BAKE_N = 320;                     // heightfield cells per axis
const MAP_PX = 1400;                    // canvas pixels per axis
const STORE_KEY = 'cal.map.v5';
const K = MAP_PX / 690;                 // canvas px per screen px at 1600x900: every drawn size is in screen px x K

const INK = '#26343F';
const PAPER = '#E2D3B0';
const COBALT = '#2C4F8A';
const VERMILION = '#D2452E';
const STAFF = '#F1EEE6';
const FONT_LABEL = '"Chakra Petch", "Arial Narrow", sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

/** Marker kinds you can travel TO. */
const TRAVELABLE = new Set(['settlement', 'camp', 'site', 'landmark', 'lookout', 'cache']);
/** How close to the rest point counts as "at the cistern". */
const REST_R = 7;

const ISLE = WORLD_SIZE / 1024;

/** Bible §8.4, used until world-ground's `sites.js` publishes the real table (W1). */
const BIBLE_TRIG = [
  ['T1', 'Organ Shelf', -187, -357], ['T2', 'Ninewalls Rise', 75, -267], ['T3', 'Rust Cone', 283, -101],
  ['T4', 'Cloudline Ridge', 64, 320], ['T5', 'Flank Crest', -133, 165], ['T6', 'West Rim', -75, 48],
];
const BIBLE_SITES = [
  ['saltrow', 'Saltrow', -267, -229], ['salt-pans', 'salt pans', -320, -293], ['the-glass', 'the Glass', -384, -176],
  ['organ-shelf', 'Organ Shelf', -219, -341], ['sounding-ring', 'Sounding Ring', -347, -320],
  ['black-sand-beach', 'black-sand beach', -187, -411], ['ninewalls', 'Ninewalls', -11, -213],
  ['the-boilers', 'the Boilers', -368, -59], ['roques', 'Roques', -43, 101], ['jameo', 'Jameo', 112, -160],
  ['kiln-yards', 'Kiln Yards', 219, -27], ['rust-cone', 'Rust Cone', 283, -101], ['hornito-field', 'hornito field', 272, -187],
  ['mistfold', 'Mistfold', 240, 261], ['fog-harp', 'Fog Harp', 176, 229], ['pinned-cliff', 'Pinned Cliff', -183, 103],
  ['leveler-muster', 'Leveler Muster', -283, 160], ['calibration-yard', 'Calibration Yard', 16, 37], ['the-fundamental', 'the Fundamental', 128, 144],
];
const SETTLEMENTS = new Set(['saltrow', 'ninewalls', 'mistfold']);
const BIBLE_SCAR = { a: [251, -43], b: [-91, -384] };

function pillarTable() {
  const rows = ISLAND.TRIG;
  if (Array.isArray(rows) && rows.length) return rows.map((t) => ({ id: t.id, name: t.name, x: t.x, z: t.z }));
  return BIBLE_TRIG.map(([id, name, e, n]) => ({ id, name, x: e * ISLE, z: -n * ISLE }));
}
function siteTable() {
  const rows = ISLAND.SITES;
  if (Array.isArray(rows) && rows.length) return rows.map((s) => ({ id: s.id, name: s.name, x: s.x, z: s.z }));
  return BIBLE_SITES.map(([id, name, e, n]) => ({ id, name, x: e * ISLE, z: -n * ISLE }));
}
function scarLine() {
  const s = ISLAND.SCAR;
  if (s?.a && s?.b && Number.isFinite(s.a.x)) return { a: { x: s.a.x, z: s.a.z }, b: { x: s.b.x, z: s.b.z } };
  return { a: { x: BIBLE_SCAR.a[0] * ISLE, z: -BIBLE_SCAR.a[1] * ISLE }, b: { x: BIBLE_SCAR.b[0] * ISLE, z: -BIBLE_SCAR.b[1] * ISLE } };
}

const el = (tag, cls, parent, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Small deterministic hash for scatter (soundings, labels). */
const hash2 = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** One marching-squares cell at level L into `path`. x0,y0 + cell in canvas px. */
function isoCell(path, L, x0, y0, c, h00, h10, h11, h01) {
  const a = h00 > L, b = h10 > L, d = h11 > L, e = h01 > L;
  const idx = (a ? 1 : 0) | (b ? 2 : 0) | (d ? 4 : 0) | (e ? 8 : 0);
  if (idx === 0 || idx === 15) return false;
  const t = (p, q) => (L - p) / (q - p || 1e-6);
  const top = () => [x0 + c * t(h00, h10), y0];
  const right = () => [x0 + c, y0 + c * t(h10, h11)];
  const bottom = () => [x0 + c * t(h01, h11), y0 + c];
  const left = () => [x0, y0 + c * t(h00, h01)];
  const seg = (p, q) => { path.moveTo(p[0], p[1]); path.lineTo(q[0], q[1]); };
  switch (idx) {
    case 1: case 14: seg(left(), top()); break;
    case 2: case 13: seg(top(), right()); break;
    case 3: case 12: seg(left(), right()); break;
    case 4: case 11: seg(right(), bottom()); break;
    case 6: case 9: seg(top(), bottom()); break;
    case 7: case 8: seg(left(), bottom()); break;
    case 5: seg(left(), top()); seg(right(), bottom()); break;
    case 10: seg(top(), right()); seg(left(), bottom()); break;
    default: return false;
  }
  return true;
}

/* ========================================================================= */
/* the bake                                                                  */
/* ========================================================================= */

export class MapBake {
  constructor(ctx) {
    this.ctx = ctx;
    this.base = null;
    this.ink = null;
    this.ready = false;
    this.rows = 0;
    this.total = 1;
    this.anySea = false;
    this.seaLevel = 0;
    this._running = false;
    this._h = null;
  }

  /** Time-sliced so a first open never costs a visible hitch. */
  start(onProgress) {
    if (this.ready || this._running) return;
    const terrain = this.ctx.terrain;
    if (!terrain) return;
    this._running = true;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = MAP_PX; return c; };
    this.base = mk();
    this.ink = mk();
    this.total = (BAKE_N + 1) + BAKE_N;
    // the sheet is lettered in the two families: make sure they are in before the first stroke
    const fonts = document.fonts?.load
      ? Promise.all([`600 20px ${FONT_LABEL}`, `500 16px ${FONT_LABEL}`, `400 14px ${FONT_MONO}`, `italic 400 14px ${FONT_MONO}`, `500 14px ${FONT_MONO}`]
        .map((f) => document.fonts.load(f).catch(() => null)))
      : Promise.resolve();
    fonts.then(() => this._bakeSample(onProgress));
  }

  _bakeSample(onProgress) {
    const terrain = this.ctx.terrain;
    const N = BAKE_N, W = N + 1;
    const H = new Float32Array(W * W);
    this._h = H;
    const step = WORLD_SIZE / N;
    const h = (x, z) => (terrain.heightFast ? terrain.heightFast(x, z) : terrain.getHeight(x, z));
    let iz = 0, lo = Infinity, hi = -Infinity;
    const run = () => {
      const t0 = performance.now();
      while (iz < W && performance.now() - t0 < 6) {
        const z = -WORLD_HALF + iz * step;
        for (let ix = 0; ix < W; ix++) {
          const v = h(-WORLD_HALF + ix * step, z);
          H[iz * W + ix] = v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        iz++;
        this.rows++;
      }
      onProgress?.(this.progress);
      if (iz < W) { requestAnimationFrame(run); return; }
      this.seaLevel = this.ctx.water?.seaLevel ?? this.ctx.terrain?.water?.seaLevel ?? this.ctx.environment?.water?.seaLevel ?? 0;
      this.anySea = lo < this.seaLevel;
      this._lo = lo; this._hi = hi;
      this._paintBaseStatic();
      this._paintShade();
      this._bakeContours(onProgress);
    };
    requestAnimationFrame(run);
  }

  get progress() { return clamp(this.rows / this.total, 0, 1); }

  /** Paper, grain, foxing, graticule, margin numbers, cartouche, scale, north. */
  _paintBaseStatic() {
    const g = this.base.getContext('2d');
    g.fillStyle = PAPER;
    g.fillRect(0, 0, MAP_PX, MAP_PX);

    // grain: one small noise tile, tiled
    const tile = document.createElement('canvas');
    tile.width = tile.height = 192;
    const tg = tile.getContext('2d');
    const img = tg.createImageData(192, 192);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = hash2(i * 0.37, i * 0.11);
      img.data[i] = 96; img.data[i + 1] = 74; img.data[i + 2] = 44;
      img.data[i + 3] = n * 20;
    }
    tg.putImageData(img, 0, 0);
    g.fillStyle = g.createPattern(tile, 'repeat');
    g.fillRect(0, 0, MAP_PX, MAP_PX);
    // foxing + the edge of the page
    const fox = (cx, cy, r, a) => {
      const f = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      f.addColorStop(0, `rgba(137,96,44,${a})`);
      f.addColorStop(1, 'rgba(137,96,44,0)');
      g.fillStyle = f;
      g.fillRect(0, 0, MAP_PX, MAP_PX);
    };
    fox(MAP_PX * 0.14, MAP_PX * 0.1, MAP_PX * 0.2, 0.09);
    fox(MAP_PX * 0.88, MAP_PX * 0.82, MAP_PX * 0.24, 0.11);
    fox(MAP_PX * 0.62, MAP_PX * 0.3, MAP_PX * 0.1, 0.05);
    const edge = g.createRadialGradient(MAP_PX / 2, MAP_PX / 2, MAP_PX * 0.42, MAP_PX / 2, MAP_PX / 2, MAP_PX * 0.74);
    edge.addColorStop(0, 'rgba(110,82,44,0)');
    edge.addColorStop(1, 'rgba(110,82,44,0.22)');
    g.fillStyle = edge;
    g.fillRect(0, 0, MAP_PX, MAP_PX);

    // the graticule: every 100 m, heavier every 500 m
    const toPx = (w) => ((w + WORLD_HALF) / WORLD_SIZE) * MAP_PX;
    g.save();
    g.lineWidth = 0.6 * K;
    g.strokeStyle = 'rgba(44,79,138,0.16)';
    const from = Math.ceil(-WORLD_HALF / 100) * 100;
    for (let m = from; m <= WORLD_HALF; m += 100) {
      const p = toPx(m);
      g.globalAlpha = m % 500 === 0 ? 1.7 : 1;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, MAP_PX); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(MAP_PX, p); g.stroke();
    }
    g.globalAlpha = 1;
    // margin numbers, in Plex: eastings along the foot, northings up the left
    g.font = `400 ${9.5 * K}px ${FONT_MONO}`;
    g.fillStyle = 'rgba(38,52,63,0.62)';
    g.textBaseline = 'alphabetic';
    for (let m = from; m <= WORLD_HALF; m += 100) {
      const p = toPx(m);
      if (p < 24 * K || p > MAP_PX - 24 * K) continue;
      g.textAlign = 'left';
      g.fillText(String(m), p + 2 * K, MAP_PX - 3 * K);                      // E
      g.fillText(String(-m), 3 * K, p - 2 * K);                               // N (engine z = -N)
    }
    g.restore();

  }

  /** North and the cartouche, painted last, over the soundings. */
  _paintFurniture() {
    const g = this.base.getContext('2d');
    // north: a broad arrow, as the benchmarks are cut
    g.save();
    g.translate(MAP_PX - 30 * K, 40 * K);
    g.strokeStyle = INK; g.lineWidth = 1.6 * K; g.lineCap = 'square';
    g.beginPath();
    g.moveTo(0, 22 * K); g.lineTo(0, -8 * K);
    g.moveTo(0, -8 * K); g.lineTo(-7 * K, 8 * K);
    g.moveTo(0, -8 * K); g.lineTo(7 * K, 8 * K);
    g.stroke();
    g.font = `600 ${14 * K}px ${FONT_LABEL}`;
    g.fillStyle = INK; g.textAlign = 'center';
    g.fillText('N', 0, -13 * K);
    g.restore();

    // the cartouche
    const cw = 204 * K, ch = 72 * K, cx = 34 * K, cy = 12 * K;   // top left: open sea on Orchil
    g.save();
    g.fillStyle = 'rgba(226,211,176,0.94)';
    g.fillRect(cx, cy, cw, ch);
    g.strokeStyle = INK; g.lineWidth = 1 * K;
    g.strokeRect(cx, cy, cw, ch);
    g.strokeStyle = VERMILION; g.lineWidth = 0.8 * K;
    g.beginPath(); g.moveTo(cx + 9 * K, cy); g.lineTo(cx + 9 * K, cy + ch); g.moveTo(cx + 11.5 * K, cy); g.lineTo(cx + 11.5 * K, cy + ch); g.stroke();
    g.fillStyle = INK; g.textAlign = 'left';
    g.font = `600 ${21 * K}px ${FONT_LABEL}`;
    g.fillText('ORCHIL', cx + 19 * K, cy + 25 * K);
    g.font = `400 ${10.5 * K}px ${FONT_MONO}`;
    g.fillText('survey sheet, contours 5 m', cx + 19 * K, cy + 39 * K);
    // the scale: a little levelling staff, 0 to 200 m
    // ...as long as the scale fits the cartouche: a 720 m sheet draws 200 m wider than the box
    const barM = (200 / WORLD_SIZE) * MAP_PX > cw - 30 * K ? 100 : 200;
    const bw = (barM / WORLD_SIZE) * MAP_PX, bx = cx + 19 * K, by = cy + 49 * K, bh = 5 * K;
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? STAFF : VERMILION;
      g.fillRect(bx + (bw / 4) * i, by, bw / 4, bh);
    }
    g.strokeStyle = INK; g.lineWidth = 0.8 * K;
    g.strokeRect(bx, by, bw, bh);
    g.fillStyle = INK; g.font = `400 ${9.5 * K}px ${FONT_MONO}`;
    g.textAlign = 'left'; g.fillText('0', bx, by + bh + 10 * K);
    g.textAlign = 'right'; g.fillText(`${barM} m`, bx + bw, by + bh + 10 * K);
    g.restore();
  }

  /** Sepia relief for the inked layer: slope shaded from the north-west, low resolution, smoothed up. */
  _paintShade() {
    const N = BAKE_N, W = N + 1, H = this._h;
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = N;
    const tg = tmp.getContext('2d');
    const img = tg.createImageData(N, N);
    const sea = this.seaLevel;
    const step = WORLD_SIZE / N;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const i = iz * W + ix;
        const y = H[i];
        const o = (iz * N + ix) * 4;
        if (y <= sea) { img.data[o + 3] = 0; continue; }
        const dx = (H[i + 1] - y) / step, dz = (H[i + W] - y) / step;
        const lit = clamp((dx * 0.7 + dz * 0.7) * 0.9, -1, 1);
        // the shadow side darkens in sepia; the lit side stays paper
        img.data[o] = 88; img.data[o + 1] = 62; img.data[o + 2] = 36;
        img.data[o + 3] = lit > 0 ? lit * 96 : 0;
      }
    }
    tg.putImageData(img, 0, 0);
    const g = this.ink.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(tmp, 0, 0, MAP_PX, MAP_PX);
  }

  /** Marching squares, row by row: the coast + waterlines onto the base, the contours onto the ink. */
  _bakeContours(onProgress) {
    const N = BAKE_N, W = N + 1, H = this._h;
    const c = MAP_PX / N;
    const sea = this.seaLevel;
    const gi = this.ink.getContext('2d');
    const gb = this.base.getContext('2d');
    gi.lineCap = gb.lineCap = 'round';
    gi.lineJoin = gb.lineJoin = 'round';
    const WATERLINES = [[sea - 0.5, 0.5], [sea - 1.3, 0.34], [sea - 2.4, 0.22], [sea - 4, 0.14]];
    const labels = [];
    let iz = 0;
    const run = () => {
      const t0 = performance.now();
      while (iz < N && performance.now() - t0 < 6) {
        const minor = new Path2D(), index = new Path2D(), coast = new Path2D();
        const water = WATERLINES.map(() => new Path2D());
        for (let ix = 0; ix < N; ix++) {
          const i = iz * W + ix;
          const a = H[i], b = H[i + 1], d = H[i + W + 1], e = H[i + W];
          const lo = Math.min(a, b, d, e), hi = Math.max(a, b, d, e);
          const x = ix * c, y = iz * c;
          // the contour interval: 5 m, index every 25 m (bible §9.7)
          for (let L = Math.ceil(lo / 5) * 5; L <= hi; L += 5) {
            if (L <= sea) continue;
            const isIndex = L % 25 === 0;
            if (isoCell(isIndex ? index : minor, L, x, y, c, a, b, d, e) && isIndex && labels.length < 90
              && hash2(ix * 0.7, iz * 0.3 + L) < 0.012) {
              labels.push({ x: x + c / 2, y: y + c / 2, L, a: Math.atan2(e - a, b - a) });
            }
          }
          if (this.anySea && lo <= sea && hi >= sea) isoCell(coast, sea, x, y, c, a, b, d, e);
          if (this.anySea) {
            for (let k = 0; k < WATERLINES.length; k++) {
              const LL = WATERLINES[k][0];
              if (lo <= LL && hi >= LL) isoCell(water[k], LL, x, y, c, a, b, d, e);
            }
          }
        }
        gi.strokeStyle = 'rgba(38,52,63,0.40)';
        gi.lineWidth = 0.42 * K;
        gi.stroke(minor);
        gi.strokeStyle = 'rgba(38,52,63,0.80)';
        gi.lineWidth = 0.8 * K;
        gi.stroke(index);
        for (let k = 0; k < WATERLINES.length; k++) {
          gb.strokeStyle = `rgba(44,79,138,${WATERLINES[k][1]})`;
          gb.lineWidth = 0.5 * K;
          gb.stroke(water[k]);
        }
        gb.strokeStyle = INK;
        gb.lineWidth = 1.25 * K;
        gb.stroke(coast);
        iz++;
        this.rows++;
      }
      onProgress?.(this.progress);
      if (iz < N) { requestAnimationFrame(run); return; }
      this._finish(labels);
      onProgress?.(1);
    };
    requestAnimationFrame(run);
  }

  _finish(labels) {
    const gi = this.ink.getContext('2d');
    // index-contour heights, cut into the line
    const placed = [];
    gi.font = `500 ${9 * K}px ${FONT_MONO}`;
    gi.textAlign = 'center'; gi.textBaseline = 'middle';
    for (const l of labels) {
      if (placed.some((q) => Math.hypot(q.x - l.x, q.y - l.y) < 64 * K)) continue;
      placed.push(l);
      gi.save();
      gi.translate(l.x, l.y);
      let rot = l.a + Math.PI / 2;
      if (rot > Math.PI / 2) rot -= Math.PI;
      if (rot < -Math.PI / 2) rot += Math.PI;
      gi.rotate(rot);
      gi.globalCompositeOperation = 'destination-out';
      gi.fillRect(-11 * K, -5 * K, 22 * K, 10 * K);
      gi.globalCompositeOperation = 'source-over';
      gi.fillStyle = 'rgba(38,52,63,0.86)';
      gi.fillText(String(l.L), 0, 0);
      gi.restore();
    }

    const gb = this.base.getContext('2d');
    const H = this._h, W = BAKE_N + 1, sea = this.seaLevel;
    const toPx = (i) => (i / BAKE_N) * MAP_PX;
    if (this.anySea) {
      // depth soundings offshore, chart style: scattered italic numerals in cobalt
      gb.font = `italic 400 ${9.5 * K}px ${FONT_MONO}`;
      gb.textAlign = 'center'; gb.textBaseline = 'middle';
      gb.fillStyle = 'rgba(44,79,138,0.72)';
      const stride = Math.round(BAKE_N / 21);
      for (let iz = stride; iz < BAKE_N; iz += stride) {
        for (let ix = stride; ix < BAKE_N; ix += stride) {
          const jx = clamp(ix + Math.round((hash2(ix, iz) - 0.5) * stride * 0.7), 1, BAKE_N - 1);
          const jz = clamp(iz + Math.round((hash2(iz, ix) - 0.5) * stride * 0.7), 1, BAKE_N - 1);
          const d = sea - H[jz * W + jx];
          if (d < 1) continue;
          gb.fillText(String(Math.round(d)), toPx(jx), toPx(jz));
        }
      }
    } else {
      // no sea on this terrain: the sheet's neat line is the survey's limit
      gb.save();
      gb.strokeStyle = INK;
      gb.lineWidth = 1.1 * K;
      gb.setLineDash([9 * K, 5 * K]);
      gb.beginPath();
      gb.arc(MAP_PX / 2, MAP_PX / 2, (PLAY_RADIUS / WORLD_SIZE) * MAP_PX, 0, Math.PI * 2);
      gb.stroke();
      gb.restore();
    }
    this._paintFurniture();
    this._h = null;
    this._running = false;
    this.rows = this.total;
    this.ready = true;
  }

  dispose() {
    for (const c of [this.base, this.ink]) if (c) { c.width = 0; c.height = 0; }
    this.base = null; this.ink = null; this._h = null; this.ready = false; this.rows = 0;
  }
}

/* ========================================================================= */
/* what she has walked (discovery)                                           */
/* ========================================================================= */

/**
 * Where she has been, on a 72² grid. It does not paint anything: the sheet opens by
 * triangles. It decides which sites she has found on foot and where fast travel goes.
 */
export class FogOfWar {
  constructor(store) {
    this.cells = new Uint8Array(FOG_N * FOG_N);
    this.seen = 0;
    this._store = store;
    this._load(store?.fog);
  }

  _load(raw) {
    try {
      if (!raw) return;
      const bits = atob(raw);
      if (bits.length !== this.cells.length) return;
      for (let i = 0; i < bits.length; i++) {
        this.cells[i] = bits.charCodeAt(i) ? 1 : 0;
        if (this.cells[i]) this.seen++;
      }
    } catch { /* first run, or storage off */ }
  }

  encode() {
    return btoa(String.fromCharCode.apply(null, this.cells));
  }

  save() { this._store?.save?.(); }

  clear() { this.cells.fill(0); this.seen = 0; this.save(); }

  /** Reveal a disc; returns how many cells this call opened. */
  reveal(x, z, radius = FOG_REVEAL_M) {
    const step = WORLD_SIZE / FOG_N;
    const ci = (x + WORLD_HALF) / step;
    const cz = (z + WORLD_HALF) / step;
    const r = radius / step;
    let opened = 0;
    const i0 = Math.max(0, Math.floor(ci - r)), i1 = Math.min(FOG_N - 1, Math.ceil(ci + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(FOG_N - 1, Math.ceil(cz + r));
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = i0; ix <= i1; ix++) {
        const dx = ix + 0.5 - ci, dz = iz + 0.5 - cz;
        if (dx * dx + dz * dz > r * r) continue;
        const o = iz * FOG_N + ix;
        if (!this.cells[o]) { this.cells[o] = 1; opened++; }
      }
    }
    if (opened) this.seen += opened;
    return opened;
  }

  get fraction() { return this.seen / this.cells.length; }

  /** Has the player ever been near enough to this spot to have seen it? */
  seenAt(x, z) {
    const step = WORLD_SIZE / FOG_N;
    const ix = Math.floor((x + WORLD_HALF) / step);
    const iz = Math.floor((z + WORLD_HALF) / step);
    if (ix < 0 || iz < 0 || ix >= FOG_N || iz >= FOG_N) return false;
    return !!this.cells[iz * FOG_N + ix];
  }
}

/* ========================================================================= */
/* the sheet                                                                 */
/* ========================================================================= */

/** Legend + side-panel marks, drawn with the same geometry the canvas uses. */
const LEGEND = [
  ['settlement', 'SETTLEMENT'],
  ['site', 'SITE'],
  ['benchmark', 'BENCHMARK'],
  ['pillar', 'TRIG PILLAR'],
  ['position', 'POSITION'],
  ['objective', 'OBJECTIVE'],
  ['machine', 'FLAGGED INSTRUMENT'],
  ['datum', 'DATUM LINE'],
];
const legendSvg = (k) => {
  const s = (d, x = '') => `<svg viewBox="0 0 16 14" aria-hidden="true"><path d="${d}" ${x}/></svg>`;
  const ink = 'fill="#26343F"', line = 'fill="none" stroke="#26343F" stroke-width="1.5"';
  if (k === 'settlement') return s('M3 2h10v10H3Z', ink);
  if (k === 'site') return s('M8 2.500a4.500 4.500 0 1 1 0 9 4.500 4.500 0 0 1 0-9Z', line);
  if (k === 'benchmark') return s('M8 2 13 12H3Z', ink);
  if (k === 'pillar') return s('M8 13V2M8 2 3.500 10M8 2l4.500 8', line);
  if (k === 'position') return s('M8 1 13.500 13 8 9.500 2.500 13Z', 'fill="#D2452E" stroke="#26343F" stroke-width="0.8" stroke-linejoin="miter"');
  if (k === 'objective') return s('M8 13V2M8 13 3.500 5M8 13l4.500-8', 'fill="none" stroke="#D2452E" stroke-width="1.8"');
  if (k === 'machine') return s('M8 1.500 14.500 7 8 12.500 1.500 7Z', 'fill="#2B2C30" stroke="#26343F" stroke-width="1"');
  return s('M1 7h14', 'fill="none" stroke="#D2452E" stroke-width="2.4"');
};

export class WorldMap {
  constructor(ctx, menus) {
    this.ctx = ctx;
    this.menus = menus;
    this.bake = new MapBake(ctx);
    this._loadStore();
    this.fog = new FogOfWar(this._storeApi);
    this.pillars = pillarTable();
    this._pillarById = new Map(this.pillars.map((p) => [p.id, p]));
    this._labelBoxes = [];      // x0,y0,x1,y1 of everything lettered on the sheet this draw
    this.waypoint = null;
    this.root = null;
    this.canvas = null;
    this._hover = null;
    this._selected = null;      // the site the side panel is offering to travel to
    this._sinceReveal = 0;
    this._pendingSave = false;
    this._travels = 0;
    this._lastPainted = null;
    ctx.events?.on?.('triangle-revealed', (e) => {
      const p = e?.pillars;
      if (Array.isArray(p) && p.length === 3) this.revealTriangle(p[0], p[1], p[2]);
    });
  }

  /* -------------------------------------------------------------- state */

  _loadStore() {
    this._triangles = [];
    let saved = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) saved = raw[0] === '{' ? JSON.parse(raw) : { fog: raw };
    } catch { /* first run, or storage off */ }
    if (Array.isArray(saved?.tri)) this._triangles = saved.tri.filter((t) => Array.isArray(t) && t.length === 3);
    this._storeApi = { fog: saved?.fog ?? null, save: () => this._save() };
  }

  _save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ fog: this.fog.encode(), tri: this._triangles }));
    } catch { /* storage off */ }
  }

  /** A pillar triple, sorted, so T1-T2-T6 and T6-T2-T1 are one triangle. */
  _key(a, b, c) { return [a, b, c].map(String).sort().join('|'); }

  /** Published. Open the triangle between three trig pillars. True if it newly opened. */
  revealTriangle(a, b, c) {
    const ids = [a, b, c].map(String);
    if (ids.some((id) => !this._pillarById.has(id)) || new Set(ids).size !== 3) return false;
    const key = this._key(...ids);
    if (this._triangles.some((t) => this._key(...t) === key)) return false;
    this._triangles.push(ids.slice().sort());
    this._save();
    this.menus?._emit?.('map-triangle-opened', { pillars: ids });
    this.draw();
    return true;
  }

  /** The opened triangles, as sorted id triples (what a save stores). */
  triangles() { return this._triangles.map((t) => t.slice()); }

  /** Restore from a save. */
  setTriangles(list) {
    this._triangles = (Array.isArray(list) ? list : [])
      .filter((t) => Array.isArray(t) && t.length === 3 && t.every((id) => this._pillarById.has(String(id))))
      .map((t) => t.map(String).sort());
    this._save();
    this.draw();
  }

  /** Geometric area of the opened triangles, m² (no overlap correction: they share edges only). */
  triangleArea(t) {
    const [a, b, c] = t.map((id) => this._pillarById.get(String(id)));
    return Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
  }

  _inTriangles(x, z) {
    for (const t of this._triangles) {
      const a = this._pillarById.get(t[0]), b = this._pillarById.get(t[1]), c = this._pillarById.get(t[2]);
      if (!a || !b || !c) continue;
      const s1 = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
      const s2 = (c.x - b.x) * (z - b.z) - (c.z - b.z) * (x - b.x);
      const s3 = (a.x - c.x) * (z - c.z) - (a.z - c.z) * (x - c.x);
      if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ lifecycle */

  /** Called from the menus system's update, only while the world is live. */
  track(dt) {
    const p = this.ctx.player;
    if (!p) return;
    this._sinceReveal += dt;
    if (this._sinceReveal < 0.35) return;
    this._sinceReveal = 0;
    if (this.fog.reveal(p.position.x, p.position.z)) this._pendingSave = true;
    if (this._pendingSave && Math.random() < 0.08) { this._save(); this._pendingSave = false; }
  }

  mount(host) {
    this.root = el('div', 'mn-map', host);
    const frame = el('div', 'mn-map-frame', this.root);
    this.canvas = el('canvas', 'mn-map-canvas', frame);
    this.canvas.width = this.canvas.height = MAP_PX;
    this._tip = el('div', 'mn-map-tip', frame);
    this._tip.style.display = 'none';

    const side = el('aside', 'mn-map-side', this.root);
    this._stats = el('div', 'mn-map-stats', side);
    this._wpBox = el('div', 'mn-map-wp', side);
    this._stations = el('table', 'mn-map-stations', side);
    this._legend = el('div', 'mn-map-legend', side);
    for (const [key, label] of LEGEND) {
      const row = el('div', 'mn-map-leg-row', this._legend);
      el('span', 'mn-map-leg-icon', row, legendSvg(key));
      el('span', 'mn-map-leg-text', row, label);
    }
    el('div', 'mn-set-note', side,
      'Climb a trig pillar and sight two others: the triangle between the three opens on this sheet. Click for a waypoint; right-click clears it. From the cistern you can travel to a surveyed site you have walked.');

    this.canvas.addEventListener('mousemove', (e) => this._onHover(e));
    this.canvas.addEventListener('mouseleave', () => { this._hover = null; this._tip.style.display = 'none'; this.draw(); });
    this.canvas.addEventListener('click', (e) => this._onClick(e));
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.clearWaypoint(); });

    if (!this.bake.ready) this.bake.start(() => this.draw());
    const p = this.ctx.player;
    if (p) this.fog.reveal(p.position.x, p.position.z);
    this.draw();
    return this.root;
  }

  unmount() {
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0; }
    this.root?.remove();
    this.root = null; this.canvas = null;
  }

  /* ------------------------------------------------------- coordinate math */

  worldToMap(x, z) {
    return {
      x: ((x + WORLD_HALF) / WORLD_SIZE) * MAP_PX,
      y: ((z + WORLD_HALF) / WORLD_SIZE) * MAP_PX,
    };
  }

  mapToWorld(px, py) {
    return {
      x: (px / MAP_PX) * WORLD_SIZE - WORLD_HALF,
      z: (py / MAP_PX) * WORLD_SIZE - WORLD_HALF,
    };
  }

  _eventToMap(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      px: ((e.clientX - r.left) / r.width) * MAP_PX,
      py: ((e.clientY - r.top) / r.height) * MAP_PX,
    };
  }

  /* -------------------------------------------------------------- markers */

  markers() {
    const out = [];
    const ctx = this.ctx;
    const rest = ISLAND.REST;
    out.push({ kind: 'settlement', x: rest.x, z: rest.z, name: 'The Cistern', done: false });

    for (const s of siteTable()) {
      out.push({ kind: SETTLEMENTS.has(s.id) ? 'settlement' : 'site', x: s.x, z: s.z, name: s.name, done: false });
    }
    // `sites.js` is the sheet's gazetteer (bible §8.4). The Round-4 props' landmarks and activity
    // marks stay off it: their names are retired words until world-props and progression replace them.

    try {
      for (const m of (ctx.progression?.getMarkers?.() || [])) {
        out.push({ kind: 'quest', x: m.x, z: m.z, name: fieldWord(m.label || 'Objective'), done: false, tracked: m.tracked });
      }
    } catch { /* progression may be mid-refresh */ }

    // only what the alidade has Flagged, never a live radar of the roster
    const tags = ctx.sighting?.tags;
    if (tags && typeof tags.forEach === 'function') {
      tags.forEach((_v, m) => {
        const mm = m?.position ? m : _v;
        if (mm?.position && mm.alive !== false) {
          out.push({ kind: 'machine', x: mm.position.x, z: mm.position.z, name: fieldWord(mm.displayName || mm.kind || 'Instrument'), done: false, m: mm });
        }
      });
    }
    return out;
  }

  /**
   * What the sheet draws: her objectives, her Flags, and the sites inside a surveyed
   * triangle. Before the first triangle that is nothing but the coastline (bible §9.7);
   * a site she has only walked past rides the circle (`compassMarks`), not the sheet.
   */
  visibleMarkers() {
    return this.markers().filter((m) => m.kind === 'quest' || m.kind === 'machine'
      || this._inTriangles(m.x, m.z));
  }

  /**
   * Discovered sites for the theodolite circle: nearest first, capped. Sampled at 1 Hz
   * by the HUD, so it may allocate.
   */
  compassMarks() {
    const p = this.ctx.player;
    if (!p) return [];
    const rows = [];
    for (const m of this.markers()) {
      if (m.kind === 'quest' || m.kind === 'machine') continue;
      if (!this.fog.seenAt(m.x, m.z) && !this._inTriangles(m.x, m.z)) continue;
      const d = Math.hypot(m.x - p.position.x, m.z - p.position.z);
      if (d < 12 || d > 420) continue;
      rows.push({ x: m.x, z: m.z, kind: m.kind, d, shape: m.kind === 'settlement' || m.kind === 'benchmark' ? m.kind : 'site' });
    }
    rows.sort((a, b) => a.d - b.d);
    return rows.slice(0, 8);
  }

  /* ---------------------------------------------------------------- paint */

  _tracePath(g, t) {
    const a = this._pillarById.get(t[0]), b = this._pillarById.get(t[1]), c = this._pillarById.get(t[2]);
    if (!a || !b || !c) return;
    const pa = this.worldToMap(a.x, a.z), pb = this.worldToMap(b.x, b.z), pc = this.worldToMap(c.x, c.z);
    // one winding for every triangle, so the union clips under 'nonzero'
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    g.moveTo(pa.x, pa.y);
    if (cross >= 0) { g.lineTo(pb.x, pb.y); g.lineTo(pc.x, pc.y); }
    else { g.lineTo(pc.x, pc.y); g.lineTo(pb.x, pb.y); }
    g.closePath();
  }

  /** @param opts.washOnly  paint only the triangles' wash + ink: what `A-map-triangles` measures against the geometry */
  draw(opts = null) {
    const g = this.canvas?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, MAP_PX, MAP_PX);
    this._labelBoxes.length = 0;

    if (!this.bake.base) {
      g.fillStyle = PAPER;
      g.fillRect(0, 0, MAP_PX, MAP_PX);
      this._paintSide([]);
      return;
    }
    // 1: the base sheet; it fills in as the bake streams
    g.drawImage(this.bake.base, 0, 0);
    if (!this.bake.ready) {
      g.fillStyle = 'rgba(226,211,176,0.82)';
      g.fillRect(0, MAP_PX * this.bake.progress, MAP_PX, MAP_PX);
    }

    const painted = { ink: false, triangles: this._triangles.length, sites: 0, pillars: 0, datum: 0 };
    // 2: the opened triangles: a cleaner wash of paper, then the inked land, through one clip
    if (this._triangles.length && this.bake.ready) {
      g.save();
      g.beginPath();
      for (const t of this._triangles) this._tracePath(g, t);
      g.clip('nonzero');
      g.fillStyle = 'rgba(241,238,230,0.42)';
      g.fillRect(0, 0, MAP_PX, MAP_PX);
      g.drawImage(this.bake.ink, 0, 0);
      painted.ink = true;
      // 3: the Datum Line in vermilion, only where the survey has reached
      painted.datum = opts?.washOnly ? 0 : this._drawDatum(g);
      g.restore();
      if (opts?.washOnly) { this._lastPainted = painted; return; }

      // 4: sight lines and the pillars that made them
      g.save();
      g.strokeStyle = INK;
      g.lineWidth = 0.9 * K;
      g.setLineDash([6 * K, 4 * K]);
      g.beginPath();
      for (const t of this._triangles) this._tracePath(g, t);
      g.stroke();
      g.restore();
      const seen = new Set(this._triangles.flat());
      for (const id of seen) {
        const q = this._pillarById.get(id);
        if (q) { this._drawPillar(g, q); painted.pillars++; }
      }
    }

    // 5-7: sites, objectives, Flags
    const her = this.ctx.player;
    this._herPt = her ? this.worldToMap(her.position.x, her.position.z) : null;
    this._herYaw = her?.camYaw ?? 0;
    this._gaveWay = 0;
    const marks = this.bake.ready ? this.visibleMarkers() : [];
    // every glyph claims its ground first, so no name can land on a mark
    for (const m of marks) { const pt = this.worldToMap(m.x, m.z); this._claim(pt.x - 8 * K, pt.y - 8 * K, pt.x + 8 * K, pt.y + 8 * K); }
    // settlements are named first: a site gives way to them
    const named = marks.slice().sort((a, b) => (a.kind === 'settlement' ? 0 : 1) - (b.kind === 'settlement' ? 0 : 1));
    for (const m of named) { this._drawMarker(g, m); painted.sites += (m.kind !== 'quest' && m.kind !== 'machine') ? 1 : 0; }
    this._lastPainted = painted;

    // 8: Brea: a broad arrow on her heading
    const p = this.ctx.player;
    if (p) {
      const pt = this.worldToMap(p.position.x, p.position.z);
      const yaw = p.camYaw ?? 0;
      g.save();
      g.translate(pt.x, pt.y);
      g.rotate(-yaw);   // world +Z maps to screen +Y and she looks along (-sin yaw, -cos yaw); the tip is drawn at local -Y
      // a solid dart, not the objective's open arrow: the two never read alike, whatever her heading
      g.lineJoin = 'miter';
      g.beginPath();
      g.moveTo(0, -11 * K); g.lineTo(7 * K, 7 * K); g.lineTo(0, 2.5 * K); g.lineTo(-7 * K, 7 * K); g.closePath();
      g.strokeStyle = PAPER; g.lineWidth = 3 * K; g.stroke();
      g.fillStyle = VERMILION; g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.8 * K; g.stroke();
      g.restore();
      // her station: an ink point on a paper ring, where she stands
      g.beginPath(); g.arc(pt.x, pt.y, 2.2 * K, 0, Math.PI * 2);
      g.fillStyle = INK; g.fill();
      g.lineWidth = 1.2 * K; g.strokeStyle = PAPER; g.stroke();
    }

    // the waypoint: a cobalt survey cross
    if (this.waypoint) {
      const w = this.worldToMap(this.waypoint.x, this.waypoint.z);
      g.save();
      g.strokeStyle = COBALT;
      g.lineWidth = 1.5 * K;
      g.strokeRect(w.x - 6 * K, w.y - 6 * K, 12 * K, 12 * K);
      g.beginPath();
      g.moveTo(w.x, w.y - 13 * K); g.lineTo(w.x, w.y - 3 * K);
      g.moveTo(w.x, w.y + 3 * K); g.lineTo(w.x, w.y + 13 * K);
      g.moveTo(w.x - 13 * K, w.y); g.lineTo(w.x - 3 * K, w.y);
      g.moveTo(w.x + 3 * K, w.y); g.lineTo(w.x + 13 * K, w.y);
      g.stroke();
      g.restore();
    }

    // hover
    if (this._hover) {
      g.save();
      g.strokeStyle = VERMILION;
      g.lineWidth = 1.2 * K;
      const h = this.worldToMap(this._hover.x, this._hover.z);
      g.strokeRect(h.x - 10 * K, h.y - 10 * K, 20 * K, 20 * K);
      g.restore();
    }

    this._paintSide(marks);
  }

  /** Vermilion on the sheet: the regions still in error (`ctx.datum`, W2), else the Screed Scar itself. */
  _drawDatum(g) {
    let n = 0;
    g.save();
    g.strokeStyle = VERMILION;
    g.fillStyle = 'rgba(210,69,46,0.13)';
    g.lineWidth = 1.9 * K;
    const regions = this.ctx.datum?.regions?.();
    if (Array.isArray(regions) && regions.length) {
      for (const r of regions) {
        if (r.true || this.ctx.datum.regionTrue?.(r.id)) continue;
        const c = this.worldToMap(r.x, r.z);
        const rad = ((r.r ?? 60) / WORLD_SIZE) * MAP_PX;
        g.beginPath(); g.arc(c.x, c.y, rad, 0, Math.PI * 2); g.fill(); g.stroke();
        n++;
      }
    } else {
      const s = scarLine();
      const a = this.worldToMap(s.a.x, s.a.z), b = this.worldToMap(s.b.x, s.b.z);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      n = 1;
    }
    g.restore();
    return n;
  }

  /** A word on the sheet: Chakra Petch caps with a paper halo, so it breaks the contours under it. */
  _letter(g, text, x, y, size = 11, weight = 600, align = 'left', fill = INK, track = 0.06) {
    g.font = `${weight} ${size * K}px ${FONT_LABEL}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = `${(track * size * K).toFixed(2)}px`;
    g.lineJoin = 'round';
    g.lineWidth = 3.2 * K;
    g.strokeStyle = 'rgba(232,221,192,0.94)';
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }

  _claim(x0, y0, x1, y1) { this._labelBoxes.push(x0, y0, x1, y1); }

  _free(x0, y0, x1, y1) {
    const b = this._labelBoxes;
    if (x0 < 26 * K || y0 < 4 * K || x1 > MAP_PX - 4 * K || y1 > MAP_PX - 14 * K) return false;
    for (let i = 0; i < b.length; i += 4) {
      if (x0 < b[i + 2] && x1 > b[i] && y0 < b[i + 3] && y1 > b[i + 1]) return false;
    }
    return true;
  }

  /**
   * A name beside its mark, on whichever side is free: right, left, above, below. A name
   * with no free side stays off the sheet and reads on hover, rather than lying on another.
   */
  _name(g, text, pt, off, size = 11, weight = 600, fill = INK, must = false) {
    g.font = `${weight} ${size * K}px ${FONT_LABEL}`;
    if ('letterSpacing' in g) g.letterSpacing = `${(0.06 * size * K).toFixed(2)}px`;
    const w = g.measureText(text).width + 2 * K;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    const h = (size + 3) * K;
    const tries = [
      [pt.x + off, pt.y, 'left', pt.x + off, pt.y - h / 2, pt.x + off + w, pt.y + h / 2],
      [pt.x - off, pt.y, 'right', pt.x - off - w, pt.y - h / 2, pt.x - off, pt.y + h / 2],
      [pt.x, pt.y - off - h / 2, 'center', pt.x - w / 2, pt.y - off - h, pt.x + w / 2, pt.y - off],
      [pt.x, pt.y + off + h / 2, 'center', pt.x - w / 2, pt.y + off, pt.x + w / 2, pt.y + off + h],
    ];
    for (const t of tries) {
      if (!this._free(t[3], t[4], t[5], t[6])) continue;
      this._claim(t[3], t[4], t[5], t[6]);
      this._letter(g, text, t[0], t[1], size, weight, t[2], fill);
      return true;
    }
    if (must) { this._letter(g, text, tries[0][0], tries[0][1], size, weight, 'left', fill); return true; }
    return false;
  }

  _drawPillar(g, q) {
    const pt = this.worldToMap(q.x, q.z);
    g.save();
    g.lineCap = 'square';
    g.strokeStyle = 'rgba(232,221,192,0.94)'; g.lineWidth = 4 * K;
    g.beginPath(); g.moveTo(pt.x, pt.y + 7 * K); g.lineTo(pt.x, pt.y - 7 * K); g.moveTo(pt.x - 5 * K, pt.y + 2 * K); g.lineTo(pt.x, pt.y - 7 * K); g.lineTo(pt.x + 5 * K, pt.y + 2 * K); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 1.8 * K;
    g.beginPath(); g.moveTo(pt.x, pt.y + 7 * K); g.lineTo(pt.x, pt.y - 7 * K); g.moveTo(pt.x - 5 * K, pt.y + 2 * K); g.lineTo(pt.x, pt.y - 7 * K); g.lineTo(pt.x + 5 * K, pt.y + 2 * K); g.stroke();
    this._claim(pt.x - 8 * K, pt.y - 9 * K, pt.x + 8 * K, pt.y + 9 * K);
    this._name(g, q.id, { x: pt.x, y: pt.y - 6 * K }, 12 * K, 11, 700, INK, true);
    g.restore();
  }

  _drawMarker(g, m) {
    const pt = this.worldToMap(m.x, m.z);
    g.save();
    const r = 4.5 * K;
    // where she stands her dart is wider than the mark: its name keeps a clear gap from her
    const her = this._herPt, herOn = her && Math.hypot(pt.x - her.x, pt.y - her.y) < 8 * K ? 5 * K : 0;
    if (m.kind === 'settlement') {
      g.strokeStyle = 'rgba(232,221,192,0.94)'; g.lineWidth = 2.4 * K;
      g.strokeRect(pt.x - r, pt.y - r, r * 2, r * 2);
      g.fillStyle = m.done ? 'rgba(38,52,63,0.5)' : INK;
      g.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
      this._name(g, String(m.name).toUpperCase(), pt, r + 5 * K + herOn, 12.5, 700, INK, true);
    } else if (m.kind === 'quest') {
      // on her own spot an objective steps aside on a leader, square to her arrow, so both read
      let x = pt.x, y = pt.y;
      if (her && Math.hypot(x - her.x, y - her.y) < 24 * K) {
        const c = Math.cos(this._herYaw), s = Math.sin(this._herYaw);
        const side = c >= 0 ? 1 : -1;       // the side of her arrow that faces the sheet's right
        x = her.x + c * side * 30 * K;
        y = her.y - s * side * 30 * K;
        this._gaveWay++;
        g.strokeStyle = INK; g.lineWidth = 1 * K;
        g.beginPath(); g.moveTo(her.x, her.y); g.lineTo(x, y); g.stroke();
      }
      g.lineCap = 'square';
      g.strokeStyle = PAPER; g.lineWidth = 4.2 * K;
      g.beginPath(); g.moveTo(x, y + 9 * K); g.lineTo(x, y - 9 * K); g.moveTo(x - 6 * K, y); g.lineTo(x, y + 9 * K); g.lineTo(x + 6 * K, y); g.stroke();
      g.strokeStyle = VERMILION; g.lineWidth = 2 * K;
      g.beginPath(); g.moveTo(x, y + 9 * K); g.lineTo(x, y - 9 * K); g.moveTo(x - 6 * K, y); g.lineTo(x, y + 9 * K); g.lineTo(x + 6 * K, y); g.stroke();
      if (m.tracked) { g.lineWidth = 1 * K; g.strokeStyle = VERMILION; g.strokeRect(x - 12 * K, y - 12 * K, 24 * K, 24 * K); }
    } else if (m.kind === 'machine') {
      const s = m.m?.lampState ?? 'calm';
      const col = { calm: '#F2EAD3', wary: '#B5E61D', hostile: '#FF2D8C', dark: '#3B3A36' }[s] ?? '#F2EAD3';
      const ap = { calm: 1, wary: 0.5, hostile: 0.2, dark: 0 }[s] ?? 1;
      const d = 7 * K;
      g.beginPath(); g.moveTo(pt.x, pt.y - d); g.lineTo(pt.x + d, pt.y); g.lineTo(pt.x, pt.y + d); g.lineTo(pt.x - d, pt.y); g.closePath();
      g.fillStyle = '#2B2C30'; g.fill();
      g.strokeStyle = INK; g.lineWidth = 1 * K; g.stroke();
      if (ap > 0) { g.beginPath(); g.arc(pt.x, pt.y, d * 0.55 * ap + 0.5, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
      this._name(g, String(m.name).toUpperCase(), pt, d + 4 * K, 11, 600, INK, true);
    } else if (m.kind === 'benchmark') {
      g.beginPath(); g.moveTo(pt.x, pt.y - r); g.lineTo(pt.x + r, pt.y + r); g.lineTo(pt.x - r, pt.y + r); g.closePath();
      g.fillStyle = INK; g.fill();
      this._name(g, String(m.name).toUpperCase(), pt, r + 5 * K, 11);
    } else {
      g.beginPath(); g.arc(pt.x, pt.y, r * 0.86, 0, Math.PI * 2);
      g.lineWidth = 3.4 * K; g.strokeStyle = 'rgba(232,221,192,0.94)'; g.stroke();
      g.lineWidth = 1.5 * K; g.strokeStyle = m.done ? 'rgba(38,52,63,0.5)' : INK; g.stroke();
      this._name(g, String(m.name).toUpperCase(), pt, r + 4 * K + herOn, 11, 500);
    }
    g.restore();
  }

  _paintSide(marks) {
    if (!this._stats) return;
    const p = this.ctx.player;
    const E = p ? Math.round(p.position.x) : 0, N = p ? Math.round(-p.position.z) : 0;
    const pad = (v) => (v < 0 ? '-' : '') + String(Math.abs(v)).padStart(3, '0');
    this._stats.innerHTML =
      `<div><b>${String(this._triangles.length).padStart(2, '0')}</b><span>TRIANGLES</span></div>`
      + `<div><b>${String(marks.filter((m) => m.kind !== 'machine' && m.kind !== 'quest').length).padStart(2, '0')}</b><span>SITES FOUND</span></div>`
      + `<div><b>${pad(E)}</b><span>EASTING</span></div>`
      + `<div><b>${pad(N)}</b><span>NORTHING</span></div>`;
    // the trig stations, as a surveyor's table: a pillar reads only once a triangle has used it
    const used = new Set(this._triangles.flat());
    this._stations.innerHTML = '<thead><tr><th>STN</th><th>STATION</th><th>E</th><th>N</th></tr></thead><tbody>'
      + this.pillars.map((q) => (used.has(q.id)
        ? `<tr><td>${q.id}</td><td class="n">${String(q.name).toUpperCase()}</td><td>${pad(Math.round(q.x))}</td><td>${pad(Math.round(-q.z))}</td></tr>`
        : `<tr class="unread"><td>${q.id}</td><td class="n">not yet sighted</td><td></td><td></td></tr>`)).join('')
      + '</tbody>';
    this._paintWaypointBox();
  }

  _paintWaypointBox() {
    if (!this._wpBox) return;
    const sel = this._selected;
    const gate = sel ? this.canFastTravel(sel) : null;
    const travel = sel
      ? `<div class="mn-map-wp-site"><b>${String(sel.name).toUpperCase()}</b></div>`
        + `<button class="mn-btn small${gate.ok ? ' primary' : ' off'}" id="mn-wp-travel"`
        + `${gate.ok ? '' : ' disabled'}>${gate.ok ? 'TRAVEL' : gate.reason}</button>`
      : '';
    if (!this.waypoint) {
      this._wpBox.innerHTML = `<div class="mn-map-wp-empty">NO WAYPOINT</div>${travel}`;
    } else {
      const d = this.distanceToWaypoint();
      this._wpBox.innerHTML =
        `<div class="mn-map-wp-live"><span class="mn-map-wp-dot"></span>`
        + `<b>WAYPOINT</b><i>${d == null ? '---' : `${Math.round(d)} m`}</i></div>`
        + `${travel}`
        + '<button class="mn-btn small" id="mn-wp-clear">CLEAR WAYPOINT</button>';
      this._wpBox.querySelector('#mn-wp-clear')?.addEventListener('click', () => this.clearWaypoint());
    }
    this._wpBox.querySelector('#mn-wp-travel')?.addEventListener('click', () => this.fastTravel());
  }

  /* ------------------------------------------------------------ interaction */

  _nearestMarker(world, tolerance = 16) {
    let best = null, bestD = Infinity;
    // only what is on the sheet can be picked
    for (const m of this.visibleMarkers()) {
      const d = Math.hypot(m.x - world.x, m.z - world.z);
      if (d < bestD) { bestD = d; best = m; }
    }
    const tolWorld = ((tolerance * K) / MAP_PX) * WORLD_SIZE;
    return bestD <= tolWorld ? best : null;
  }

  _onHover(e) {
    const { px, py } = this._eventToMap(e);
    const world = this.mapToWorld(px, py);
    const near = this._nearestMarker(world);
    this._hover = near;
    if (near) {
      const q = this.worldToMap(near.x, near.z);
      this._tip.style.display = 'block';
      this._tip.style.left = `${(q.x / MAP_PX) * 100}%`;
      this._tip.style.top = `${(q.y / MAP_PX) * 100}%`;
      const dist = this.ctx.player
        ? Math.hypot(near.x - this.ctx.player.position.x, near.z - this.ctx.player.position.z) : null;
      this._tip.innerHTML = `<b>${String(near.name).toUpperCase()}</b>`
        + (dist != null ? `<i>${Math.round(dist)} m</i>` : '')
        + (near.done ? '<u>VISITED</u>' : '');
    } else {
      this._tip.style.display = 'none';
    }
    this.draw();
  }

  _onClick(e) {
    const { px, py } = this._eventToMap(e);
    const world = this.mapToWorld(px, py);
    const near = this._nearestMarker(world);
    const target = near || world;
    this._selected = near && TRAVELABLE.has(near.kind) ? near : null;
    this.setWaypoint(target.x, target.z, near ? String(near.name) : 'Waypoint');
  }

  /* ----------------------------------------------------------- fast travel */

  /**
   * Travel is free from the rest point, to somewhere she has actually been, when
   * nothing is hunting her; the reason it is refused is always printed. (Re-surveyed
   * benchmarks become nodes with progression, W3.)
   */
  canFastTravel(site = this._selected) {
    if (!site) return { ok: false, reason: 'SELECT A DISCOVERED SITE' };
    if (!TRAVELABLE.has(site.kind)) return { ok: false, reason: 'NOT A TRAVEL POINT' };
    if (!this.fog.seenAt(site.x, site.z)) return { ok: false, reason: 'UNDISCOVERED: WALK THERE FIRST' };
    const p = this.ctx.player;
    if (!p) return { ok: false, reason: 'NO PLAYER' };
    const fire = this.ctx.camp?.firePosition ?? ISLAND.REST;
    const dFire = fire ? Math.hypot(p.position.x - fire.x, p.position.z - fire.z) : Infinity;
    if (dFire > REST_R) return { ok: false, reason: 'REST AT THE CISTERN TO TRAVEL' };
    if (Math.hypot(site.x - p.position.x, site.z - p.position.z) < 25) {
      return { ok: false, reason: 'ALREADY HERE' };
    }
    const hunted = (this.ctx.machines?.list || []).some((m) => m.alive !== false
      && (m.state === 'alert' || m.state === 'attack')
      && Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) < 60);
    if (hunted) return { ok: false, reason: 'NOT WITH AN INSTRUMENT ON YOU' };
    return { ok: true, reason: 'TRAVEL' };
  }

  fastTravel(site = this._selected) {
    const gate = this.canFastTravel(site);
    if (!gate.ok) return gate;
    const p = this.ctx.player;
    const from = { x: p.position.x, z: p.position.z };
    p.position.set(site.x, p.position.y, site.z);
    p.velocity?.set?.(0, 0, 0);
    p._snapToGround?.();
    this.fog.reveal(site.x, site.z);
    this._travels++;
    this.menus?._emit?.('fast-travel', { from, to: { x: site.x, z: site.z }, site: site.name });
    // an autosave on arrival, through the owning lane's published writer
    try { this.ctx.progression?.checkpoint?.('fast-travel'); } catch { /* no save lane */ }
    this.menus?.closeHub?.();
    return { ok: true, to: site.name };
  }

  /* -------------------------------------------------------------- waypoint */

  setWaypoint(x, z, label = 'Waypoint') {
    const y = this.ctx.terrain?.getHeight?.(x, z) ?? 0;
    this.waypoint = { x, y, z, label };
    this.menus?._emit?.('waypoint-set', { x, y, z, label, distance: this.distanceToWaypoint() });
    this.menus?._emit?.('ui-confirm', { source: 'map' });
    this.ctx.hud?.setWaypoint?.(this.waypoint);
    this.draw();
    return this.waypoint;
  }

  clearWaypoint() {
    if (!this.waypoint) return;
    this.waypoint = null;
    this.menus?._emit?.('waypoint-cleared', {});
    this.ctx.hud?.setWaypoint?.(null);
    this.draw();
  }

  distanceToWaypoint() {
    const p = this.ctx.player;
    if (!p || !this.waypoint) return null;
    return Math.hypot(this.waypoint.x - p.position.x, this.waypoint.z - p.position.z);
  }

  bearingToWaypoint() {
    const p = this.ctx.player;
    if (!p || !this.waypoint) return null;
    return Math.atan2(this.waypoint.x - p.position.x, this.waypoint.z - p.position.z);
  }

  audit() {
    return {
      baked: this.bake.ready,
      bakeRows: this.bake.rows,
      anySea: this.bake.anySea,
      fogFraction: +this.fog.fraction.toFixed(3),
      markers: this.markers().length,
      triangles: this.triangles(),
      painted: this._lastPainted,
      gaveWay: this._gaveWay ?? 0,
      waypoint: this.waypoint ? { ...this.waypoint, distance: this.distanceToWaypoint() } : null,
      selected: this._selected ? { kind: this._selected.kind, name: this._selected.name } : null,
      travel: this._selected ? this.canFastTravel(this._selected) : null,
      travels: this._travels,
      canvas: this.canvas ? { w: this.canvas.width, h: this.canvas.height, onScreen: !!this.canvas.offsetParent } : null,
    };
  }

  dispose() { this.unmount(); this.bake.dispose(); }
}

/**
 * The waypoint on the circle belongs to the HUD now (`ctx.hud.setWaypoint`). This keeps
 * the Round-4 audit shape A70 reads, and draws nothing.
 */
export class WaypointBeacon {
  constructor(ctx, map) { this.ctx = ctx; this.map = map; this.visible = false; }
  get delegated() { return typeof this.ctx.hud?.setWaypoint === 'function'; }
  update() {}
  audit() { return { delegated: this.delegated, visible: false, text: null, opacity: 0, rect: null }; }
  dispose() {}
}
