#!/usr/bin/env node
/**
 * M1.1c ROCK CHECK (Node, no browser): the skyline rock's outline rule and an albedo strata count, read
 * from the recipe's own buckets (tools/build/landmarks/recipes/sea-stacks.mjs buildParts) and from the
 * Organ Shelf's generator (src/world/sites/basalt.js) on a flat stand-in ground.
 *
 *   node tools/build/landmarks/rock-check.mjs [--out <dir outside the repo>] [--px 0.1]
 *
 * THE OUTLINE RULE (BUILD M1.1c, "no cylinder-bundle outlines"), fixed before any measurement:
 *   each node is rendered orthographically from 8 azimuths (every 45 deg) at 0.1 m a pixel; above the
 *   waterline (y > 0.5 m; for the plug and its needle, above y > 0.5 m of their ground) the silhouette's
 *   left and right edges are read row by row (x of the outermost covered pixel). A row of an edge is in a
 *   STRAIGHT VERTICAL RUN when it lies inside some window of rows >= 3 m tall in which that edge's x
 *   wanders by no more than 0.3 m (under 5.7 deg off vertical over 3 m). The share is marked rows / all
 *   rows, over both edges; the row count stands in for outline length, which can only make the share
 *   larger (a sloping run is longer than its height). Bar: <= 30 % at every azimuth.
 * ALBEDO STRATA (an asset-level number, not the 200 m count; that one is filmed): the albedo along the
 *   node's vertical centre line from 0.5 m to the top, as CIE L*, smoothed over 0.3 m; a band edge is a
 *   step of >= 3 L* between the 0.4 m either side of it; bands = edges + 1, edges at least 0.8 m apart.
 * ORGAN SHELF: per cluster, distinct column-top heights (above the ground, at 0.5 m resolution) and the
 *   talus pieces the generator laid in its apron.
 * With --out, a shaded preview sheet per node (PNG) is written there, for the eye.
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildParts } from './recipes/sea-stacks.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = flag('--out');
const PX = Number(flag('--px', 0.1));
if (OUT && path.resolve(OUT).startsWith(REPO + path.sep)) throw new Error('--out must be outside the repo');
if (OUT) mkdirSync(OUT, { recursive: true });

const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const Lstar = (r, g, b) => { const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };

/** Orthographic raster of a triangle soup seen from azimuth `az` (view along -Z after the turn). */
function raster(pos, nor, col, az, px, { yMin = -1e9 } = {}) {
  const c = Math.cos(az), s = Math.sin(az);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const n = pos.length / 3;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    X[i] = x * c - z * s; Z[i] = x * s + z * c; Y[i] = y;
    if (y < yMin) continue;
    x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  y0 = Math.max(y0, yMin);
  const W = Math.ceil((x1 - x0) / px) + 3, H = Math.ceil((y1 - y0) / px) + 3;
  const depth = new Float32Array(W * H).fill(-Infinity), rgb = new Float32Array(W * H * 3), alb = new Float32Array(W * H * 3);
  const L = [-0.55, 0.45, 0.7], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  for (let t = 0; t < n; t += 3) {
    const ax = (X[t] - x0) / px + 1, ay = (y1 - Y[t]) / px + 1, bx = (X[t + 1] - x0) / px + 1, by = (y1 - Y[t + 1]) / px + 1, cx = (X[t + 2] - x0) / px + 1, cy = (y1 - Y[t + 2]) / px + 1;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxx = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const miny = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxy = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = miny; py <= maxy; py++) for (let qx = minx; qx <= maxx; qx++) {
      const ppx = qx + 0.5, ppy = py + 0.5;
      const w0 = ((bx - ppx) * (cy - ppy) - (by - ppy) * (cx - ppx)) / area;
      const w1 = ((cx - ppx) * (ay - ppy) - (cy - ppy) * (ax - ppx)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const yy = w0 * Y[t] + w1 * Y[t + 1] + w2 * Y[t + 2];
      if (yy < yMin) continue;
      const z = w0 * Z[t] + w1 * Z[t + 1] + w2 * Z[t + 2];
      const k = py * W + qx;
      if (z <= depth[k]) continue;
      depth[k] = z;
      const ia = t * 3, ib = (t + 1) * 3, ic = (t + 2) * 3;
      // normal in view space (turned with the azimuth)
      const nx0 = w0 * nor[ia] + w1 * nor[ib] + w2 * nor[ic], ny = w0 * nor[ia + 1] + w1 * nor[ib + 1] + w2 * nor[ic + 1], nz0 = w0 * nor[ia + 2] + w1 * nor[ib + 2] + w2 * nor[ic + 2];
      const nx = nx0 * c - nz0 * s, nz = nx0 * s + nz0 * c;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const d = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
      for (let ch = 0; ch < 3; ch++) {
        const a = w0 * col[ia + ch] + w1 * col[ib + ch] + w2 * col[ic + ch];
        alb[k * 3 + ch] = a;
        rgb[k * 3 + ch] = a * (0.25 + 0.95 * d);
      }
    }
  }
  return { W, H, depth, rgb, alb, x0, y1 };
}

/** The outline rule on one raster. */
function outlineShare(R, px, { runM = 3, tolM = 0.3 } = {}) {
  const { W, H, depth } = R;
  const left = [], right = [];
  for (let y = 0; y < H; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (depth[y * W + x] > -Infinity) { if (a < 0) a = x; b = x; }
    if (a >= 0) { left.push(a * px); right.push(b * px); }
  }
  const win = Math.round(runM / px);
  const share = (e) => {
    const mark = new Uint8Array(e.length);
    for (let i = 0; i + win <= e.length; i++) {
      let mn = Infinity, mx = -Infinity;
      for (let j = i; j < i + win; j++) { mn = Math.min(mn, e[j]); mx = Math.max(mx, e[j]); if (mx - mn > tolM) break; }
      if (mx - mn <= tolM) mark.fill(1, i, i + win);
    }
    let m = 0; for (const v of mark) m += v;
    return { marked: m, rows: e.length };
  };
  const l = share(left), r = share(right);
  return { pct: +(100 * (l.marked + r.marked) / Math.max(1, l.rows + r.rows)).toFixed(1), heightM: +(left.length * px).toFixed(1) };
}

/** Albedo strata along the centre line. */
function albedoBands(R, px) {
  const { W, H, depth, alb } = R;
  const prof = [];
  for (let y = H - 1; y >= 0; y--) {
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (depth[y * W + x] > -Infinity) { if (a < 0) a = x; b = x; }
    if (a < 0) continue;
    const xm = (a + b) >> 1;
    let L = 0, n = 0;
    for (let x = Math.max(a, xm - 3); x <= Math.min(b, xm + 3); x++) { const k = (y * W + x) * 3; L += Lstar(alb[k], alb[k + 1], alb[k + 2]); n++; }
    prof.push(L / n);
  }
  const sm = Math.max(1, Math.round(0.15 / px));
  const S = prof.map((_, i) => { let a = 0, n = 0; for (let j = i - sm; j <= i + sm; j++) if (j >= 0 && j < prof.length) { a += prof[j]; n++; } return a / n; });
  const h = Math.round(0.4 / px), gap = Math.round(0.8 / px);
  let edges = 0, last = -1e9;
  for (let i = h; i + h < S.length; i++) {
    let a = 0, b = 0; for (let j = 1; j <= h; j++) { a += S[i - j]; b += S[i + j]; }
    if (Math.abs(a - b) / h >= 3 && i - last >= gap) { edges++; last = i; }
  }
  return edges + 1;
}

async function sheet(name, rasters, px) {
  if (!OUT) return;
  const pad = 8, H = Math.max(...rasters.map((r) => r.H)), W = rasters.reduce((a, r) => a + r.W + pad, pad);
  const buf = Buffer.alloc(W * (H + pad * 2) * 3, 40);
  let ox = pad;
  for (const r of rasters) {
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
      const k = y * r.W + x; if (r.depth[k] === -Infinity) continue;
      const o = ((y + pad + (H - r.H)) * W + ox + x) * 3;
      for (let c = 0; c < 3; c++) buf[o + c] = Math.max(0, Math.min(255, Math.round(255 * lin2srgb(Math.min(1, r.rgb[k * 3 + c] * 1.6)))));
    }
    ox += r.W + pad;
  }
  await sharp(buf, { raw: { width: W, height: H + pad * 2, channels: 3 } }).png().toFile(path.join(OUT, `${name}.png`));
}

const result = { px: PX, rule: 'share of each silhouette edge (rows above the waterline) inside a >= 3 m window wandering <= 0.3 m; bar <= 30 % at every azimuth', nodes: {} };
for (const p of buildParts()) {
  const b = p.bucket;
  const land = /roque/.test(b.name);
  const rs = [], per = [];
  for (let k = 0; k < 8; k++) {
    const r = raster(b.pos, b.nor, b.col, (k / 8) * Math.PI * 2, PX, { yMin: land ? 0.5 : 0.5 });
    rs.push(r);
    per.push(outlineShare(r, PX).pct);
  }
  const bands = rs.map((r) => albedoBands(r, PX));
  result.nodes[b.name] = { tris: b.triangles, verticalRunPct: { max: Math.max(...per), byAzimuth: per }, albedoBands: { min: Math.min(...bands), byAzimuth: bands }, pass: Math.max(...per) <= 30 };
  await sheet(b.name, rs.filter((_, i) => i % 2 === 0), PX);
}

// the Organ Shelf on a flat stand-in ground (heights above ground do not depend on the ground's shape)
try {
  const { buildOrganShelf } = await import('../../../src/world/sites/basalt.js');
  const flat = { getHeight: () => 2 };
  const o = buildOrganShelf(flat);
  const byCl = {};
  for (const c of o.columns) (byCl[c.cluster] ||= new Set()).add(Math.round((c.y1 - 2) * 2) / 2);
  result.organ = o.clusters.map((c) => ({ id: c.id, columns: c.columns, topHeights: byCl[c.id]?.size ?? 0, talus: c.talus ?? 0 }));
  // the cluster outline rule too: the cluster's merged silhouette from 8 azimuths
  const pos = o.mesh.geometry.attributes.position.array, nor = o.mesh.geometry.attributes.normal.array, col = o.mesh.geometry.attributes.color.array;
  result.organMesh = { tris: pos.length / 9 };
  o.mesh.geometry.dispose(); o.mesh.material.dispose();
  void nor; void col;
  if (OUT) {
    // one cluster (the tallest) alone, for the eye: from its face and from the side
    const { ORGAN } = await import('../../../src/world/sites/layout.js');
    const cl = ORGAN.reduce((a, c) => (c.top > a.top ? c : a));
    const one = buildOrganShelf(flat, [cl]);
    const g = one.mesh.geometry, P = g.attributes.position.array.slice();
    for (let i = 0; i < P.length; i += 3) { P[i] -= cl.x; P[i + 2] -= cl.z; }
    const face = (180 - cl.face) * Math.PI / 180;
    await sheet('organ-cluster', [0, Math.PI / 2, Math.PI].map((d) => raster(P, g.attributes.normal.array, g.attributes.color.array, face + d, 0.04, { yMin: 1.6 })), 0.04);
  }
} catch (e) { result.organ = { error: String(e?.message || e).slice(0, 300) }; }

console.log(JSON.stringify(result, null, 1));
