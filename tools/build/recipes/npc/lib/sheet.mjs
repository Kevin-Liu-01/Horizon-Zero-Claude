/**
 * CALIMA — a kit person's outfit on a sheet of its own (people; TECH §6 "cloth and leather: unique texels at no less than
 * 60 % of Brea's linear density at 3 m ... the same tiled weave, leather-grain and brass detail maps she uses").
 *
 * The kit's people wear the shared faction atlas: neutral swatches tiled under a vertex dye, so a garment reads as one
 * flat block of its colour (the wave-2 review of Tube Smith Oro). A person whose outfit names `sheet` keeps the kit's
 * geometry (the MCO parts and the procedural pieces, as built) and gets a 1024² sheet of its own instead:
 *
 *   1. every piece is unwrapped to a metric chart: an MCO part keeps its source charts; a procedural piece's own
 *      parameter grid is corrected per island to the metre (the 2x2 metric of its uv), a triangle the correction folds
 *      or stretches more than 3x is cut out flat on its own, and an island with no usable grid is projected on its two
 *      principal axes;
 *   2. the islands are packed at one texel density (armor/lib/atlas.mjs packAtlas, Brea's own packer);
 *   3. each texel is painted by the piece's painter from its bind position, normal, the distance to its island's edge,
 *      the distance and arc length along the nearest OPEN edge of the garment in 3-D (a hem, a cuff, a strap's edge:
 *      where cloth frays and leather burnishes, and where a stitch line or an embroidered border runs) and, on an MCO
 *      part, the source sheet's colour under it (its cloth, leather and metal told apart);
 *   4. paintAtlas adds the curvature pass and writes base 1024², normal + ORM 512² (ORM R the detail class
 *      src/hero/clothShader.js tiles: 1 weave, 0.66 knit, 0.33 grain, 0 none).
 *
 * The dye, the stain and the shade a piece carried as vertex colour move into the paint; COLOR_0 keeps the contact
 * shade alone (lib/human.mjs). Deterministic: no clocks, no Math.random.
 */
import { packAtlas, paintAtlas, loadRaw } from '../../armor/lib/atlas.mjs';
import { openEdges } from '../../armor/lib/smock.mjs';

/* ------------------------------------------------------------------ colour */

export const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const toSRGB = (v) => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
/** A hex dye times a linear shade, back in sRGB 0-255 (what the vertex dye and `shade` did to the neutral swatch). */
export const dyeRGB = (h, shade = 1) => hexRGB(h).map((c) => toSRGB(toLin(c) * shade));

/* ------------------------------------------------------------------ islands */

function islandsOf(g) {
  const n = g.pos.length / 3, par = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = find(g.idx[t]), b = find(g.idx[t + 1]);
    if (a !== b) par[b] = a;
    const c = find(g.idx[t + 2]), a2 = find(a);
    if (a2 !== c) par[c] = a2;
  }
  const map = new Map();
  for (let t = 0; t < g.idx.length; t += 3) { const r = find(g.idx[t]); if (!map.has(r)) map.set(r, []); map.get(r).push(t); }
  return [...map.values()];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossLen = (a, b) => Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);

/** The principal axes of a point set (power iteration on its covariance), largest first. */
function principal(pts) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j]; }
  const mulC = (v) => [C[0] * v[0] + C[1] * v[1] + C[2] * v[2], C[3] * v[0] + C[4] * v[1] + C[5] * v[2], C[6] * v[0] + C[7] * v[1] + C[8] * v[2]];
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  let e1 = nrm([0.577, 0.577, 0.577]);
  for (let k = 0; k < 40; k++) e1 = nrm(mulC(e1));
  let e2 = [0.3, -0.8, 0.52];
  for (let k = 0; k < 40; k++) { e2 = mulC(e2); const d = dot(e2, e1); e2 = nrm([e2[0] - d * e1[0], e2[1] - d * e1[1], e2[2] - d * e1[2]]); }
  return { c, e1, e2 };
}

/**
 * A piece re-charted to the metre. `keepSource` (an MCO part): its charts as they are, packAtlas scales and turns them.
 * Returns { geo (new arrays; triangles cut out flat carry vertices of their own), stats }.
 */
export function unwrap(g, { keepSource = false } = {}) {
  const n = g.pos.length / 3, hasCol = g.col && g.col.length === n * 4;
  const out = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], col: [], idx: [] };
  const stats = { islands: 0, affine: 0, pca: 0, cut: 0 };
  const cutAt = [];                              // where in out.idx each triangle cut flat begins
  const first = new Int32Array(n).fill(-1);      // each source vertex's first copy
  const P = (i) => [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]];
  const emit = (i, u, v) => {
    if (first[i] < 0) first[i] = out.pos.length / 3;
    out.pos.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); out.nrm.push(g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]);
    for (let k = 0; k < 4; k++) { out.jnt.push(g.jnt[i * 4 + k]); out.wgt.push(g.wgt[i * 4 + k]); out.col.push(hasCol ? g.col[i * 4 + k] : 1); }
    out.uv.push(u, v);
    return out.pos.length / 3 - 1;
  };
  if (keepSource) {
    for (let i = 0; i < n; i++) emit(i, g.uv[i * 2], g.uv[i * 2 + 1]);
    out.idx = g.idx.slice();
    stats.islands = islandsOf(g).length;
    return { geo: out, stats, first, cutAt };
  }
  for (const tris of islandsOf(g)) {
    stats.islands++;
    // the island's metric: the area-weighted mean of JᵀJ, J the uv -> bind-space Jacobian of each triangle
    let Ga = 0, Gb = 0, Gd = 0, Wt = 0, A3 = 0;
    for (const t of tris) {
      const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
      const e1 = sub(P(b), P(a)), e2 = sub(P(c), P(a));
      const area = crossLen(e1, e2) / 2;
      A3 += area;
      const du1 = g.uv[b * 2] - g.uv[a * 2], dv1 = g.uv[b * 2 + 1] - g.uv[a * 2 + 1], du2 = g.uv[c * 2] - g.uv[a * 2], dv2 = g.uv[c * 2 + 1] - g.uv[a * 2 + 1];
      const det = du1 * dv2 - du2 * dv1;
      if (Math.abs(det) < 1e-14 || area < 1e-12) continue;
      const j0 = [(e1[0] * dv2 - e2[0] * dv1) / det, (e1[1] * dv2 - e2[1] * dv1) / det, (e1[2] * dv2 - e2[2] * dv1) / det];
      const j1 = [(-e1[0] * du2 + e2[0] * du1) / det, (-e1[1] * du2 + e2[1] * du1) / det, (-e1[2] * du2 + e2[2] * du1) / det];
      const ga = dot(j0, j0), gb = dot(j0, j1), gd = dot(j1, j1);
      if (!Number.isFinite(ga + gb + gd) || ga + gd > 1e8) continue;
      Ga += ga * area; Gb += gb * area; Gd += gd * area; Wt += area;
    }
    let M = null;
    if (Wt > 0.5 * A3 && A3 > 0) {
      const a = Ga / Wt, b = Gb / Wt, d = Gd / Wt, s = Math.sqrt(Math.max(0, a * d - b * b)), tr = Math.sqrt(a + d + 2 * s);
      if (s > 1e-12 && tr > 0) M = [(a + s) / tr, b / tr, (d + s) / tr];      // sqrt of an SPD 2x2: (G + sI) / sqrt(tr G + 2s)
    }
    const map = new Map();
    const vOf = (i, U) => { if (map.has(i)) return map.get(i); const k = emit(i, U(i)[0], U(i)[1]); map.set(i, k); return k; };
    let mode = 'pca';
    if (M) {
      const U = (i) => { const u = g.uv[i * 2], v = g.uv[i * 2 + 1]; return [M[0] * u + M[1] * v, M[1] * u + M[2] * v]; };
      // which triangles the corrected grid keeps: the majority orientation, within 3x of the island's metre
      const sgnA = [], bad = new Set();
      let pos = 0, neg = 0;
      for (const t of tris) {
        const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
        const [ua, va] = U(a), [ub, vb] = U(b), [uc, vc] = U(c);
        const s2 = ((ub - ua) * (vc - va) - (uc - ua) * (vb - va)) / 2;
        const area = crossLen(sub(P(b), P(a)), sub(P(c), P(a))) / 2;
        sgnA.push([t, s2, area]);
        if (s2 > 0) pos += area; else neg += area;
      }
      const sg = pos >= neg ? 1 : -1;
      let badArea = 0;
      for (const [t, s2, area] of sgnA) {
        const r = Math.abs(s2) / Math.max(area, 1e-14);
        if (Math.sign(s2) !== sg || r < 1 / 3 || r > 3) { bad.add(t); badArea += area; }
      }
      if (badArea <= 0.25 * A3) {
        mode = 'affine';
        for (const t of tris) {
          if (bad.has(t)) continue;
          out.idx.push(vOf(g.idx[t], U), vOf(g.idx[t + 1], U), vOf(g.idx[t + 2], U));
        }
        // each cut triangle laid flat on its own, at its true size
        for (const t of bad) {
          const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
          const e1 = sub(P(b), P(a)), e2 = sub(P(c), P(a)), l1 = Math.hypot(...e1) || 1e-6;
          const x = dot(e2, e1) / l1, y = crossLen(e1, e2) / l1;
          cutAt.push(out.idx.length);
          out.idx.push(emit(a, 0, 0), emit(b, l1, 0), emit(c, x, Math.max(y, 1e-5)));
          stats.cut++;
        }
      }
    }
    if (mode === 'pca') {
      const vs = [...new Set(tris.flatMap((t) => [g.idx[t], g.idx[t + 1], g.idx[t + 2]]))];
      const { c, e1, e2 } = principal(vs.map(P));
      const U = (i) => { const d = sub(P(i), c); return [dot(d, e1), dot(d, e2)]; };
      for (const t of tris) out.idx.push(vOf(g.idx[t], U), vOf(g.idx[t + 1], U), vOf(g.idx[t + 2], U));
      stats.pca++;
    } else stats.affine++;
  }
  return { geo: out, stats, first, cutAt };
}

/* ------------------------------------------------------------------ open edges */

/**
 * The garment's open edges in 3-D (hems, cuffs, a strap's sides; not the uv seams between islands), sampled every
 * 1.5 mm with their arc length. `near(x, y, z)` -> { d (m), s (m along the run), run, tx, ty, tz } within R, or null.
 */
export function edgeField(g, { R = 0.03, step = 0.0015 } = {}) {
  const runs = openEdges(g);
  const C = R, pts = [], cells = new Map();
  const key = (ix, iy, iz) => ((ix + 400) * 1024 + (iy + 400)) * 1024 + (iz + 400);
  runs.forEach((run, ri) => {
    if (run.length < 2) return;
    let s = 0;
    for (let k = 0; k + 1 < run.length; k++) {
      const a = run[k].p, b = run[k + 1].p, d = sub(b, a), L = Math.hypot(...d);
      if (L < 1e-7) continue;
      const m = Math.max(1, Math.ceil(L / step));
      for (let q = 0; q < m; q++) {
        const f = q / m, p = [a[0] + d[0] * f, a[1] + d[1] * f, a[2] + d[2] * f];
        const i = pts.length;
        pts.push({ p, s: s + L * f, run: ri, t: [d[0] / L, d[1] / L, d[2] / L] });
        const kk = key(Math.floor(p[0] / C), Math.floor(p[1] / C), Math.floor(p[2] / C));
        if (!cells.has(kk)) cells.set(kk, []);
        cells.get(kk).push(i);
      }
      s += L;
    }
  });
  const res = { d: 0, s: 0, run: 0, tx: 0, ty: 0, tz: 0 };
  return {
    count: pts.length, runs: runs.length,
    near(x, y, z) {
      const ix = Math.floor(x / C), iy = Math.floor(y / C), iz = Math.floor(z / C);
      let best = R * R, bi = -1;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const L = cells.get(key(ix + a, iy + b, iz + c));
        if (!L) continue;
        for (const i of L) { const p = pts[i].p, dx = p[0] - x, dy = p[1] - y, dz = p[2] - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < best) { best = d2; bi = i; } }
      }
      if (bi < 0) return null;
      const q = pts[bi];
      res.d = Math.sqrt(best); res.s = q.s; res.run = q.run; res.tx = q.t[0]; res.ty = q.t[1]; res.tz = q.t[2];
      return res;
    },
  };
}

/* ------------------------------------------------------------------ the sheet */

/** Bilinear read of a raw RGB source at uv (wrapping). */
function sample(src, u, v, out) {
  u -= Math.floor(u); v -= Math.floor(v);
  const x = u * src.w - 0.5, y = v * src.h - 0.5;
  const x0 = (Math.floor(x) + src.w) % src.w, y0 = (Math.floor(y) + src.h) % src.h, x1 = (x0 + 1) % src.w, y1 = (y0 + 1) % src.h;
  const fx = x - Math.floor(x), fy = y - Math.floor(y);
  for (let k = 0; k < 3; k++) {
    const a = src.data[(y0 * src.w + x0) * src.c + k], b = src.data[(y0 * src.w + x1) * src.c + k];
    const c = src.data[(y1 * src.w + x0) * src.c + k], d = src.data[(y1 * src.w + x1) * src.c + k];
    out[k] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  return out;
}

/**
 * Pack and paint `pieces` (lib/human.mjs's list: { geo, slot, dye, stain, shade, mco, ... }) on a sheet of their own.
 * `painters[slot](t, o, piece)` paints one texel (armor/lib/atlas.mjs's contract, plus t.edge() and on an MCO part
 * t.src, the source sheet's sRGB colour under the texel); `painters.default` takes any slot without one.
 * Rewrites each piece's geo (its uv on the sheet). Returns { tex, D, detailRep, trimV, slots, stats }.
 */
export async function paintSheet(pieces, { painters, density = {}, maps = 512, W = 1024, H = 1024, srcBase = null, srcNormal = null, detailTile = 0.026, log = () => {}, curv = { crease: 1, ridge: 0.7 }, salt = [205, 200, 190], q = { base: 95, normal: 88, orm: 84 } } = {}) {
  const parts = [];
  const tot = { islands: 0, affine: 0, pca: 0, cut: 0 };
  pieces.forEach((pc, k) => {
    if (!pc.geo.idx.length) return;
    // a two-sided sheet (`twin`: its first `twin` vertices the front, the rest the back face in the same order): the back
    // takes the front's charts, so it costs no texels of its own
    let src = pc.geo, back = null;
    if (pc.twin) {
      const nF = pc.twin, F = { ...src, idx: [] }, B = [];
      for (let t = 0; t < src.idx.length; t += 3) (src.idx[t] < nF ? F.idx : B).push(src.idx[t], src.idx[t + 1], src.idx[t + 2]);
      src = F; back = B;
    }
    const { geo, stats, first, cutAt } = unwrap(src, { keepSource: !!pc.mco });
    for (const key of Object.keys(tot)) tot[key] += stats[key];
    if (back) pc._back = { idx: back, first, nF: pc.twin, from: pc.geo };
    pc.geo = geo;
    const dk = pc.density ?? density[pc.slot] ?? density[pc.part] ?? 1;
    // the triangles cut flat (a tube's seam, a cap's fan: small, and each an island of its own) at a third of the piece's density,
    // packed as a part of their own on the same vertices, so the sheet is not spent on their padding
    const isCut = new Set(cutAt), main = [], cut = [];
    for (let t = 0; t < geo.idx.length; t += 3) (isCut.has(t) ? cut : main).push(geo.idx[t], geo.idx[t + 1], geo.idx[t + 2]);
    const part = { slot: `p${k}`, pos: geo.pos, nrm: geo.nrm, uv: geo.uv, idx: main, piece: pc, density: dk, nScale: pc.mco ? 1 : 0, mco: !!pc.mco };
    parts.push(part);
    if (cut.length) { part.cutPart = { slot: `p${k}`, pos: geo.pos, nrm: geo.nrm, uv: geo.uv, idx: cut, piece: pc, density: dk * 0.35, nScale: 0, mco: false, isCutPart: true, owner: part }; parts.push(part.cutPart); }
  });
  const layout = packAtlas(parts, { W, H, pad: 3, trimH: 0 });
  // what each part's painter is handed beside the texel
  const wrapped = {};
  const src = [0, 0, 0];
  // an MCO part's source colour by class (its greens the cloth, pale greys the metal, the rest leather), each class's mean
  // luminance over its vertices: a painter shades by the source's folds against it
  const classOf = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx > 150 && mx - mn < 55 ? 'metal' : c[1] > c[0] * 1.05 && c[1] > c[2] ? 'cloth' : 'leather'; };
  const lumOf = (c) => 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];
  for (const part of parts) {
    if (!part.mco || !srcBase) continue;
    const acc = { cloth: [0, 0], leather: [0, 0], metal: [0, 0] }, c = [0, 0, 0];
    for (let i = 0; i < part.uv.length / 2; i++) { sample(srcBase, part.uv[i * 2], part.uv[i * 2 + 1], c); const k = classOf(c); acc[k][0] += lumOf(c); acc[k][1]++; }
    part.srcMean = Object.fromEntries(Object.entries(acc).map(([k, [s, n]]) => [k, n ? s / n : 100]));
  }
  for (const part of parts) {
    const pc = part.piece, fn = painters[pc.slot] || painters.default;
    let edges = null;
    const edgeOf = () => (edges ||= edgeField(pc.geo));
    wrapped[part.slot] = (t, o) => {
      t.piece = pc;
      t.edge = () => edgeOf().near(t.X, t.Y, t.Z);
      t.src = null; t.srcMean = part.srcMean || null;
      if (part.mco && srcBase) {
        // the texel back to the source chart: packAtlas's island transform, inverted
        const I = t.isl, k = layout.D * I.density;
        const x = (t.x + 0.5 - I.x) / k + I.u0, y = (t.y + 0.5 - I.y) / k + I.v0;
        const a = (I.c * x + I.s * y) / I.scale, b = (-I.s * x + I.c * y) / I.scale;
        t.src = sample(srcBase, a, b, src);
      }
      fn(t, o, pc);
    };
  }
  // an MCO part's own normal map, under the island's turn (paintAtlas reads part.srcUV: the source uv)
  const tex = await paintAtlas(parts, layout, { painters: wrapped, srcNormal, salt, curv, q });
  // (`maps`: the normal and ORM at another size than paintAtlas's 512², re-encoded from its full-size raw maps: the Holds cast's
  // at 256², a quarter of the resident bytes, where the base colour carries the look; Oro's at 512²)
  if (maps !== 512) {
    const { default: sharp } = await import('sharp');
    const enc = (raw, quality) => sharp(raw, { raw: { width: W, height: H, channels: 3 } }).resize(maps, maps, { kernel: 'lanczos3' }).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    tex.normal = await enc(tex.raw.normal, q.normal ?? 88);
    tex.orm = await enc(tex.raw.orm, q.orm ?? 84);
  }
  for (const part of parts) {
    if (part.isCutPart) continue;
    const uv = part.uvNew;
    if (part.cutPart) { const C = part.cutPart; for (const i of C.idx) { uv[i * 2] = C.uvNew[i * 2]; uv[i * 2 + 1] = C.uvNew[i * 2 + 1]; } }
    part.piece.geo.uv = uv;
    part.piece.geo.idx = part.piece.geo.idx;      // (main and cut triangles both, as unwrapped)
  }
  // the back faces, on their fronts' texels
  for (const part of parts) {
    const pc = part.piece, B = pc._back;
    if (!B || part.isCutPart) continue;
    const g = pc.geo, S = B.from, hasCol = S.col && S.col.length === S.pos.length / 3 * 4, map = new Map();
    const vOf = (i) => {
      if (map.has(i)) return map.get(i);
      const f = B.first[i - B.nF];
      const k = g.pos.length / 3;
      g.pos.push(S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2]); g.nrm.push(S.nrm[i * 3], S.nrm[i * 3 + 1], S.nrm[i * 3 + 2]);
      for (let c = 0; c < 4; c++) { g.jnt.push(S.jnt[i * 4 + c]); g.wgt.push(S.wgt[i * 4 + c]); g.col.push(hasCol ? S.col[i * 4 + c] : 1); }
      g.uv.push(f >= 0 ? g.uv[f * 2] : 0, f >= 0 ? g.uv[f * 2 + 1] : 0);
      map.set(i, k);
      return k;
    };
    for (const i of B.idx) g.idx.push(vOf(i));
    delete pc._back;
  }
  // (a look at the sheet while it is painted: R5_SHEET_DUMP=<dir> writes its three maps as PNG; never a build output)
  if (process.env.R5_SHEET_DUMP) {
    const { default: sharp } = await import('sharp');
    const dir = process.env.R5_SHEET_DUMP;
    for (const k of ['base', 'normal', 'orm']) await sharp(tex.raw[k], { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${dir}/sheet-${k}.png`);
  }
  log(`  sheet: ${parts.length} parts, ${layout.islands.length} islands (${tot.affine} affine, ${tot.pca} projected, ${tot.cut} triangles cut flat), ${layout.D.toFixed(1)} texels per bind metre`);
  return {
    tex, D: layout.D, trimV: 1, slots: [...new Set(pieces.map((p) => p.slot || 'default'))],
    detailRep: +((W / layout.D) / detailTile).toFixed(1), stats: { ...tot, parts: parts.length, packed: layout.islands.length },
  };
}

export async function loadSource(file, size = 1024) { return loadRaw(file, size); }
