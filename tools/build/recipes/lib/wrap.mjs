/**
 * CALIMA — wrapped cloth (character-art, W1; R54, R56). Real wound-cloth geometry for
 * headwraps, hoods and bound knots: every turn of the cloth is a ribbon on the surface
 * of a measured head form, with a pillow section, a rolled hem, long tension creases
 * and an overlap onto the turn below it. Node only, deterministic.
 *
 * API (docs/ROUND5-CHARACTER-ART.md §3)
 *   headForm(soup, { center, lift })     radial map of a head: form.R(dx,dy,dz)
 *   ellipsoidForm(center, r, axis, egg)  the same API for a bun or a knot
 *   ribbon(form, opts)                   one turn of cloth (a small circle on the form)
 *   crownCap(form, opts)                 the gathered cloth under the turns
 *   cordRing(center, axis, R, r, opts)   a binding cord
 *   clothTail(points, joints, opts)      the free end on a dyn_ chain: both faces, gathered
 *                                        at the root, frayed at the tip
 *   WRAP_ATLAS, paintClothPanel(...)     the 512² atlas regions and the cloth painter
 *   vertexAO(geo, grid, opts)            per-vertex contact shadow into COLOR_0
 */
import { noise3, hex, smooth, polyline, v3 } from './face.mjs';
import { TriGrid, bakeAOPoints, pnoise2 } from './skin.mjs';

const { sub, add, mul, dot, cross, norm } = v3;
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

/** Mulberry32: the deterministic stream every generator here draws from. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* =================================================================== forms */

/**
 * The radial surface of a head from `center` (az = atan2(x, z), el = asin(y)), read by
 * rays from outside inwards. `lift(dir)` adds the hair and padding the cloth rides on.
 */
export function headForm(soup, { center = [0, 1.672, -0.012], azN = 144, elN = 72, blur = 2, lift = () => 0.004 } = {}) {
  const grid = new TriGrid(soup, 0.016);
  const map = new Float32Array(azN * elN);
  const dirOf = (i, j) => {
    const az = (i / azN) * TAU - Math.PI, el = ((j + 0.5) / elN) * Math.PI - Math.PI / 2;
    return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  };
  const far = 0.32;
  for (let j = 0; j < elN; j++) for (let i = 0; i < azN; i++) {
    const d = dirOf(i, j);
    const t = grid.cast(center[0] + d[0] * far, center[1] + d[1] * far, center[2] + d[2] * far, -d[0], -d[1], -d[2], far, 0.0001);
    map[j * azN + i] = t >= 0 ? far - t : 0;
  }
  // holes (a ray that met nothing) take the mean of their neighbours
  for (let pass = 0; pass < 6; pass++) for (let j = 0; j < elN; j++) for (let i = 0; i < azN; i++) {
    if (map[j * azN + i] > 0) continue;
    let s = 0, n = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jj = j + b; if (jj < 0 || jj >= elN) continue;
      const v = map[jj * azN + ((i + a + azN) % azN)]; if (v > 0) { s += v; n++; }
    }
    if (n) map[j * azN + i] = s / n;
  }
  // smooth (the cloth does not read the skin's small forms)
  const kern = [];
  for (let k = -blur * 2; k <= blur * 2; k++) kern.push(Math.exp(-0.5 * (k * k) / (blur * blur)));
  const tmp = new Float32Array(map.length), sm = new Float32Array(map.length);
  for (let j = 0; j < elN; j++) for (let i = 0; i < azN; i++) { let s = 0, w = 0; for (let k = -blur * 2; k <= blur * 2; k++) { s += map[j * azN + ((i + k + azN) % azN)] * kern[k + blur * 2]; w += kern[k + blur * 2]; } tmp[j * azN + i] = s / w; }
  for (let j = 0; j < elN; j++) for (let i = 0; i < azN; i++) { let s = 0, w = 0; for (let k = -blur * 2; k <= blur * 2; k++) { const jj = Math.max(0, Math.min(elN - 1, j + k)); s += tmp[jj * azN + i] * kern[k + blur * 2]; w += kern[k + blur * 2]; } sm[j * azN + i] = s / w; }
  const R = (dx, dy, dz) => {
    const az = Math.atan2(dx, dz), el = Math.asin(Math.max(-1, Math.min(1, dy)));
    const fi = ((az + Math.PI) / TAU) * azN, fj = ((el + Math.PI / 2) / Math.PI) * elN - 0.5;
    const i0 = Math.floor(fi), j0 = Math.max(0, Math.min(elN - 1, Math.floor(fj)));
    const i1 = (i0 + 1) % azN, j1 = Math.min(elN - 1, j0 + 1);
    const fx = fi - i0, fy = Math.max(0, Math.min(1, fj - j0));
    const ii = ((i0 % azN) + azN) % azN;
    const base = (sm[j0 * azN + ii] * (1 - fx) + sm[j0 * azN + i1] * fx) * (1 - fy) + (sm[j1 * azN + ii] * (1 - fx) + sm[j1 * azN + i1] * fx) * fy;
    return base + lift(dx, dy, dz);
  };
  return { center, R, raw: sm, azN, elN };
}

/** An egg on `axis`: rAxis along it, r across, `egg` > 0 draws the top in, the base out. */
export function ellipsoidForm(center, { r, rAxis, axis = [0, 1, 0], egg = 0, bump = 0, seed = 1 } = {}) {
  const up = norm(axis);
  return {
    center,
    R: (dx, dy, dz) => {
      const c = dx * up[0] + dy * up[1] + dz * up[2];
      const s = Math.sqrt(Math.max(0, 1 - c * c));
      const rr = r * (1 - egg * c);
      const base = 1 / Math.sqrt((s * s) / (rr * rr) + (c * c) / (rAxis * rAxis));
      return base + (bump ? bump * (noise3(dx * 3 + seed, dy * 3, dz * 3) - 0.5) : 0);
    },
  };
}

/* ================================================================= ribbons */

function pushV(g, p, n, u, v, joint, c = null) {
  g.pos.push(p[0], p[1], p[2]); g.nrm.push(n[0], n[1], n[2]); g.uv.push(u, v);
  g.jnt.push(joint, 0, 0, 0); g.wgt.push(1, 0, 0, 0);
  if (c !== null) g.col?.push(c, c, c, 1);
}

/**
 * One turn of cloth: a small circle on `form`. `n` is the circle's axis, `o0` its height
 * in radians above the plane through the form's centre, `w` half the cloth's width in
 * radians. `rowsT` are the across rows in [-1, 1] (a tighter spacing near the hems).
 * The section is a pillow with a rolled hem, carrying `creases` long tension folds that
 * wander along the turn. UVs run along the turn at `pxPerM`, restarting inside the
 * panel's U period so a repeating strip of atlas covers any length.
 *   uv: { rect: [x, y, w, h] px, period px, W atlas px, pxPerM, v: [bottom, top] in 0..1 of rect }
 */
export function ribbon(form, { n, o0, w, along = 32, s0 = 0, s1 = TAU, rowsT = [-1, -0.93, -0.66, -0.3, 0.1, 0.5, 0.82, 1], warp = null, lift = 0.003, pillow = 0.0022, hemDrop = 0.0035, hemDropUp = null, creases = 3, creaseAmp = 0.0011, wander = 0.04, seed = 1, joint = 0, uv, flip = false }) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] };
  const axis = norm(n);
  const fwd = Math.abs(axis[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
  const e1 = norm(sub(fwd, mul(axis, dot(fwd, axis))));
  const e2 = cross(axis, e1);
  const R = rng(seed * 2654435761);
  const folds = [];
  for (let k = 0; k < creases; k++) folds.push({ c: -0.6 + 1.2 * R(), a: 0.1 + 0.28 * R(), m: 1 + Math.floor(R() * 3), ph: R() * TAU, s: 0.14 + 0.2 * R(), amp: creaseAmp * (0.55 + 0.75 * R()) * (R() < 0.3 ? 1 : -1), m2: 2 + Math.floor(R() * 4), ph2: R() * TAU });
  const closed = Math.abs(s1 - s0 - TAU) < 1e-6;
  const rows = rowsT.length;
  const P = [];
  const c = form.center;
  const point = (s, t) => {
    const wob = wander * Math.sin(s * 2 + seed) + wander * 0.5 * Math.sin(s * 5 + seed * 2.1);
    const o = o0 + wob + (warp ? warp(s) : 0) + t * w * (1 + 0.06 * Math.sin(s * 3 + seed * 3.3));
    const co = Math.cos(o), so = Math.sin(o), cs = Math.cos(s), ss = Math.sin(s);
    const d = [co * (cs * e1[0] + ss * e2[0]) + so * axis[0], co * (cs * e1[1] + ss * e2[1]) + so * axis[1], co * (cs * e1[2] + ss * e2[2]) + so * axis[2]];
    let off = lift;
    const at = Math.abs(t);
    off += pillow * (1 - at * at * at * at);                                   // the pillow
    off += 0.00075 * smooth(0.62, 0.86, at) * (1 - smooth(0.88, 0.97, at));   // the rolled hem stands proud
    off -= (t > 0 && hemDropUp !== null ? hemDropUp : hemDrop) * smooth(0.93, 1.0, at);   // and turns under
    for (const f of folds) {
      const x = (t - f.c - f.a * Math.sin(f.m * s + f.ph)) / f.s;
      if (x > -2.2 && x < 2.2) off += f.amp * Math.exp(-x * x) * (0.55 + 0.45 * Math.sin(f.m2 * s + f.ph2));
    }
    off += 0.0009 * (noise3(d[0] * 9 + seed, d[1] * 9, d[2] * 9) - 0.5);
    const r = form.R(d[0], d[1], d[2]) + off;
    return [c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r];
  };
  for (let j = 0; j <= along; j++) {
    const s = s0 + ((s1 - s0) * j) / along;
    for (let i = 0; i < rows; i++) P.push(point(s, rowsT[i]));
  }
  const at = (j, i) => P[j * rows + i];
  const normalAt = (j, i) => {
    const jm = closed ? (j - 1 + along) % along : Math.max(0, j - 1), jp = closed ? (j + 1) % along : Math.min(along, j + 1);
    const im = Math.max(0, i - 1), ip = Math.min(rows - 1, i + 1);
    const a = cross(sub(at(jp, i), at(jm, i)), sub(at(j, ip), at(j, im)));
    return norm(a);
  };
  // emit columns, restarting U inside the period
  const { rect, period, W, pxPerM, v: vr } = uv;
  const lenAt = new Float32Array(along + 1);
  for (let j = 1; j <= along; j++) { const a = at(j - 1, rows >> 1), b = at(j, rows >> 1); lenAt[j] = lenAt[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
  const uStart = R() * period;
  const emitCol = (j, uPx) => {
    for (let i = 0; i < rows; i++) {
      const t = rowsT[i];
      // the panel's outermost texels stay out of reach: bilinear there reads the next panel's alpha, a hairline along the hem
      const vv = 0.014 + 0.972 * mix(vr[0], vr[1], (t + 1) / 2);
      // the turned-under hem rows take the outer row's normal: a worn thread is lit like its cloth
      const nn = normalAt(j, i === 0 ? 1 : i === rows - 1 ? rows - 2 : i);
      pushV(g, at(j, i), nn, (rect[0] + uPx) / W, (rect[1] + vv * rect[3]) / W, joint);
    }
  };
  let base = 0, col = 0, offs = 0;
  emitCol(0, uStart);
  for (let j = 1; j <= along; j++) {
    const u = uStart + lenAt[j] * pxPerM - offs;
    emitCol(j, u);
    const a = col * rows, b = (col + 1) * rows;
    for (let i = 0; i < rows - 1; i++) {
      const p0 = a + i, p1 = b + i, p2 = a + i + 1, p3 = b + i + 1;
      if (flip) g.idx.push(p0, p2, p1, p1, p2, p3); else g.idx.push(p0, p1, p2, p1, p3, p2);
    }
    col++;
    if (u > period && j < along) { offs += period; emitCol(j, u - period); col++; }
  }
  void base;
  g.rows = rows;
  return g;
}

/** The gathered cloth under the turns: a dome on the form from `elMin` to the pole, with creases converging on the crown. */
export function crownCap(form, { elMin = 0.3, rings = 4, seg = 20, lift = 0.0012, joint = 0, uv, gather = 0.0014, tiltAxis = [0, 1, 0] } = {}) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] };
  const axis = norm(tiltAxis);
  const fwd = [0, 0, 1];
  const e1 = norm(sub(fwd, mul(axis, dot(fwd, axis)))), e2 = cross(axis, e1);
  const c = form.center;
  const P = (a, e) => {
    const d = add(mul(axis, Math.sin(e)), add(mul(e1, Math.cos(e) * Math.cos(a)), mul(e2, Math.cos(e) * Math.sin(a))));
    const r = form.R(d[0], d[1], d[2]) + lift + gather * Math.sin(a * 11) * (0.3 + 0.7 * smooth(elMin, Math.PI / 2, e));
    return add(c, mul(d, r));
  };
  const { rect, W } = uv;
  for (let k = 0; k <= seg; k++) {
    for (let i = 0; i <= rings; i++) {
      const a = (k / seg) * TAU, e = mix(elMin, Math.PI / 2 - 0.03, i / rings);
      const p = P(a, e);
      const n = norm(cross(sub(P(a + 0.08, e), P(a - 0.08, e)), sub(P(a, e + 0.05), P(a, e - 0.05))));
      pushV(g, p, n, (rect[0] + (k / seg) * rect[2]) / W, (rect[1] + (0.16 + 0.68 * i / rings) * rect[3]) / W, joint);
    }
  }
  const col = rings + 1;
  for (let k = 0; k < seg; k++) for (let i = 0; i < rings; i++) {
    const a = k * col + i, b = (k + 1) * col + i;
    g.idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return g;
}

/** A small cord ring (a binding), rigid on one joint. */
export function cordRing(center, axis, R, r, { seg = 14, sides = 4, joint = 0, uvRect = [0, 0, 1, 1], W = 512, wob = 0.05 } = {}) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] };
  const up = norm(axis);
  const e1 = norm(cross(up, Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(up, e1);
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * TAU;
    const rr = R * (1 + wob * Math.sin(a * 3 + 1));
    const m = add(center, add(mul(e1, Math.cos(a) * rr), mul(e2, Math.sin(a) * rr)));
    const out = norm(sub(m, center));
    for (let s = 0; s <= sides; s++) {
      const b = (s / sides) * TAU;
      const n = add(mul(out, Math.cos(b)), mul(up, Math.sin(b)));
      pushV(g, add(m, mul(n, r)), n, (uvRect[0] + (k / seg) * uvRect[2]) / W, (uvRect[1] + (s / sides) * uvRect[3]) / W, joint);
    }
  }
  const col = sides + 1;
  for (let k = 0; k < seg; k++) for (let s = 0; s < sides; s++) {
    const a = k * col + s, b = (k + 1) * col + s;
    g.idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return g;
}

/**
 * The free end of a wrap on a dyn_ chain. Same width, side vector, cup and twist rules as
 * `stripAlong` (A-tail-legible grades the silhouette), but with a real section: long folds
 * across it, gathered to `gather` of its width at the knot, both faces (violet out, lining
 * in), and the last `fray` of its length mapped to a frayed end cell.
 *   uvFront / uvBack: { rect, period, W, pxPerM, v:[a,b] }, uvEnd: [x, y, w, h] px
 */
export function clothTail(P, joints, { along = 16, across = 4, width = () => 0.09, side = [1, 0, 0], thick = 0.004, curl = 0.1, twist = 0, gather = 0.62, gatherTo = 0.16, roll = 0, fold = 0.006, uvFront, uvBack, uvEnd = null, fray = 0.08, seed = 7 } = {}) {
  const g = { pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] };
  const pl = polyline(P);
  const R = rng(seed * 40503);
  const waves = [];
  for (let k = 0; k < 3; k++) waves.push({ f: 1.2 + k * 1.1 + R(), ph: R() * TAU, m: 1.5 + R() * 2.5, ph2: R() * TAU, a: fold * (1 - k * 0.22) });
  for (const [uvx, sgn] of [[uvFront, 1], [uvBack, -1]]) {
    const pts = [];
    const frames = [];
    for (let a = 0; a <= along; a++) {
      const u = a / along;
      const { p, t, seg, f } = pl.at(u);
      let sd = norm(sub(side, mul(t, dot(side, t))));
      if (twist) { const n0 = norm(cross(sd, t)), a2 = twist * u; sd = norm(add(mul(sd, Math.cos(a2)), mul(n0, Math.sin(a2)))); }
      const nrm = norm(cross(sd, t));
      const rootK = 1 - smooth(gatherTo * 0.55, gatherTo, u);        // 1 at the knot, 0 on the free strip
      const hw = width(u) * 0.5 * (gather + (1 - gather) * smooth(gatherTo * 0.5, gatherTo, u));
      const weights = chainW(joints, seg, f);
      for (let k = 0; k <= across; k++) {
        const x = (k / across) * 2 - 1;
        // the root is gathered and rolled into a half tube (`roll`), its pleats running along it; the free strip is flat, with folds
        const cup = (curl + roll * rootK) * (1 - x * x) * hw;
        let w = 0;
        for (const q of waves) w += q.a * Math.sin(x * q.f * Math.PI + q.ph + u * q.m) * (0.5 + 0.5 * Math.sin(u * q.m * 2 + q.ph2));
        const pleat = rootK * hw * 0.2 * Math.sin(x * 7.3 + u * 9 + 1.1);
        const off = sgn * thick * 0.5 + cup + pleat + w * (0.45 + 0.55 * smooth(0, 0.25, 1 - Math.abs(x)));
        pts.push(add(add(p, mul(sd, x * hw)), mul(nrm, off)));
        frames.push({ u, x, sd, t, nrm, weights });
      }
    }
    const rows = across + 1;
    const base = g.pos.length / 3;
    const at = (a, k) => pts[a * rows + k];
    // emit with a U restart
    const { rect, period, W, pxPerM, v: vr } = uvx;
    let col = 0;
    let uAcc = R() * period * 0.5;
    const emit = (a, uPx, end) => {
      for (let k = 0; k < rows; k++) {
        const fr = frames[a * rows + k];
        const am = Math.max(0, a - 1), ap = Math.min(along, a + 1), km = Math.max(0, k - 1), kp = Math.min(across, k + 1);
        let n = norm(cross(sub(at(a, kp), at(a, km)), sub(at(ap, k), at(am, k))));
        if (dot(n, fr.nrm) * sgn < 0) n = mul(n, -1);
        let uu, vv;
        if (end && uvEnd) {
          // the end cell: across = its U, along = its V
          uu = (uvEnd[0] + (k / across) * uvEnd[2]) / W;
          vv = (uvEnd[1] + end.v * uvEnd[3]) / W;
        } else {
          uu = (rect[0] + uPx) / W;
          vv = (rect[1] + (0.014 + 0.972 * mix(vr[0], vr[1], k / across)) * rect[3]) / W;
        }
        g.pos.push(...at(a, k)); g.nrm.push(...n); g.uv.push(uu, vv); g.jnt.push(...fr.weights.j); g.wgt.push(...fr.weights.w);
      }
    };
    const quad = () => {
      const c0 = base + col * rows, c1 = base + (col + 1) * rows;
      for (let k = 0; k < across; k++) {
        const i0 = c0 + k, i1 = i0 + 1, i2 = c1 + k, i3 = i2 + 1;
        if (sgn > 0) g.idx.push(i0, i2, i1, i1, i2, i3); else g.idx.push(i0, i1, i2, i1, i3, i2);
      }
      col++;
    };
    const lastPlain = Math.max(1, Math.floor(along * (1 - fray)));
    emit(0, uAcc, null);
    for (let a = 1; a <= along; a++) {
      const seg = Math.hypot(...sub(at(a, rows >> 1), at(a - 1, rows >> 1)));
      if (a <= lastPlain || !uvEnd) {
        uAcc += seg * pxPerM;
        emit(a, uAcc, null);
        quad();
        if (uAcc > period && a < along) { uAcc -= period; emit(a, uAcc, null); col++; }
      } else {
        if (a === lastPlain + 1) { emit(a - 1, 0, { v: 0 }); col++; }
        emit(a, 0, { v: (a - lastPlain) / (along - lastPlain) });
        quad();
      }
    }
  }
  return g;
}

function chainW(joints, seg, f) {
  const n = joints.length;
  const a = joints[Math.min(seg, n - 1)], b = joints[Math.min(seg + 1, n - 1)];
  const wb = seg + 1 >= n ? 0 : f;
  return { j: [a, b, 0, 0], w: [1 - wb, wb, 0, 0] };
}

/* ================================================================== bake */

/**
 * Make every triangle's winding agree with its vertex normals. A double-sided material flips
 * the shading normal of a back face, so a card wound against its normals is lit from the wrong
 * side: a near-black coil card under a sun at its back reads grey.
 */
export function fixWinding(g) {
  for (let t = 0; t < g.idx.length; t += 3) {
    const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2];
    const ax = g.pos[a * 3], ay = g.pos[a * 3 + 1], az = g.pos[a * 3 + 2];
    const e1 = [g.pos[b * 3] - ax, g.pos[b * 3 + 1] - ay, g.pos[b * 3 + 2] - az];
    const e2 = [g.pos[c * 3] - ax, g.pos[c * 3 + 1] - ay, g.pos[c * 3 + 2] - az];
    const n = cross(e1, e2);
    const m = [g.nrm[a * 3] + g.nrm[b * 3] + g.nrm[c * 3], g.nrm[a * 3 + 1] + g.nrm[b * 3 + 1] + g.nrm[c * 3 + 1], g.nrm[a * 3 + 2] + g.nrm[b * 3 + 2] + g.nrm[c * 3 + 2]];
    if (dot(n, m) < 0) { g.idx[t + 1] = c; g.idx[t + 2] = b; }
  }
  return g;
}

/** Per-vertex contact shadow against `grid`; writes g.col as linear RGBA (a warm, not grey, darkening). */
export function vertexAO(g, grid, { rays = 40, maxD = 0.035, floor = 0.32, tint = [1, 0.94, 1], alpha = null } = {}) {
  const ao = bakeAOPoints(g.pos, g.nrm, grid, { rays, maxD, lift: 0.002 });
  const n = g.pos.length / 3;
  g.col = g.col || new Array(n * 4);
  for (let i = 0; i < n; i++) {
    const k = mix(floor, 1, Math.min(1, ao[i] * 1.12));
    g.col[i * 4] = k * tint[0]; g.col[i * 4 + 1] = k * tint[1]; g.col[i * 4 + 2] = k * tint[2];
    g.col[i * 4 + 3] = alpha ? alpha(i) : 1;
  }
  // a ribbon's hem rows turn under, so they are always occluded: they read their neighbour instead
  if (g.rows) {
    const R = g.rows, cols = n / R;
    for (let c = 0; c < cols; c++) for (const [e, nb] of [[0, 2], [1, 2], [R - 1, R - 3], [R - 2, R - 3]]) {
      const a = (c * R + e) * 4, b = (c * R + nb) * 4;
      for (let k = 0; k < 3; k++) g.col[a + k] = Math.max(g.col[a + k], g.col[b + k] * 0.92);
    }
  }
  return g;
}

/* ================================================================= atlas */

/**
 * The hair + wrap atlas (512²), px rects [x, y, w, h]. Cloth panels repeat in U with the
 * given period; their last (w - period) columns repeat the first, so a ribbon's quad can
 * run over the seam without a vertex split per quad.
 */
export const WRAP_ATLAS = {
  W: 512,
  clothA: { rect: [0, 0, 256, 128], period: 192 },      // orchil cloth, long folds, carmine selvedge
  clothB: { rect: [256, 0, 256, 128], period: 192 },    // the same dye, tight gathers (crown, bun, knot)
  lining: { rect: [0, 128, 128, 64], period: 96 },      // cochineal carmine (tail lining, binding)
  frayEnd: { rect: [128, 128, 128, 64] },               // the tail's frayed end
  tailA: { rect: [256, 128, 256, 64], period: 192 },    // the tail's outer face, a wider, softer fold set
  knotFold: { rect: [0, 192, 256, 64], period: 192 },   // short radial creases: knot + binding pulls
  coilTile: { rect: [0, 256, 256, 256], period: 192 },  // short coils, repeating both ways
  coilFringe: { rect: [256, 256, 256, 128] },           // short coil tufts for cards: dense roots, loose tips
  lockTile: { rect: [256, 384, 128, 128], period: 96 }, // the knot tail's locks
  lashes: { rect: [384, 384, 128, 32] },                // upper lash cards
  spare: { rect: [384, 416, 128, 96] },
};

/** Periodic crease set for a cloth panel. */
function creaseSet(seed, count, { sigma = [0.03, 0.09], amp = [0.0003, 0.0009], wander = 1 } = {}) {
  const R = rng(seed * 2246822519);
  const out = [];
  for (let k = 0; k < count; k++) out.push({ c: 0.08 + 0.84 * R(), a: (0.02 + 0.09 * R()) * wander, k: 1 + Math.floor(R() * 3), ph: R(), s: mix(sigma[0], sigma[1], R()), amp: mix(amp[0], amp[1], R()) * (R() < 0.34 ? 1 : -1), k2: 1 + Math.floor(R() * 2), ph2: R() });
  return out;
}

/**
 * Paint one cloth panel into the RGBA / normal / ORM buffers (W-square, RGBA and two RGB).
 * `dye` hex, `dye2`/`dye3` the hand-dyed drift; `mmU`/`mmV` the physical size of a texel.
 * Plain weave (warp period 3 px, weft 4 px, per-thread slub), long tension creases, drag
 * folds, a soft frayed selvedge in the alpha at both V edges, optionally a selvedge stripe.
 */
export function paintClothPanel(buf, { rect, period, W = 512, dye, dye2, dye3, seed = 1, creases = 6, sigma, amp, mmU = 0.65, mmV = 0.47, fringe = 3, stripe = null, stripeAt = 9, rough = 0.93, shadeK = 1, foldK = 1.5, weave = 1, creaseWander = 1, drag = 1 } = {}) {
  const [x0, y0, w, h] = rect;
  const P = period || w;
  const D = hex(dye), D2 = hex(dye2 || dye), D3 = hex(dye3 || dye);
  const S = stripe ? hex(stripe) : null;
  const list = creaseSet(seed, creases, { sigma, amp, wander: creaseWander });
  const heightAt = (px, py) => {
    const u = px / P, v = py / h;
    let f = 0;
    for (const c of list) {
      const x = (v - c.c - c.a * Math.sin(TAU * (c.k * u + c.ph))) / c.s;
      if (x > -2.6 && x < 2.6) f += c.amp * Math.exp(-x * x) * (0.72 + 0.28 * Math.sin(TAU * (c.k2 * u + c.ph2)));
    }
    // drag folds: short diagonals where the cloth was pulled round the skull
    const ws = Math.sin(TAU * (2 * u + v * 0.7 + seed * 0.13));
    const dd = Math.sin(TAU * (3 * u + v * 1.6 + 0.22 * ws + seed * 0.37)) * 0.55 + Math.sin(TAU * (5 * u - v * 2.3 + 0.3 * ws + seed * 0.71)) * 0.45;
    f += dd * 0.00017 * drag;
    return f * foldK;
  };
  // the fold height, once, for the whole panel (periodic in U)
  const H = new Float32Array(P * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < P; x++) H[y * P + x] = heightAt(x, y);
  const hAt = (x, y) => H[Math.max(0, Math.min(h - 1, y)) * P + ((x % P) + P) % P];
  let minH = 1e9, maxH = -1e9;
  for (const v of H) { minH = Math.min(minH, v); maxH = Math.max(maxH, v); }
  const R = rng(seed * 3266489917);
  const warpTone = new Float32Array(P), weftTone = new Float32Array(h), warpEnd = new Float32Array(P), warpEnd2 = new Float32Array(P);
  // periodic thread tones: every warp thread (2 px) and weft thread (3 px) has its own weight
  const WP = 2, WF = 3;
  const nWarp = Math.floor(P / WP);
  const tones = []; for (let i = 0; i < nWarp; i++) tones.push(R());
  const ends = []; for (let i = 0; i < nWarp; i++) ends.push(R());
  const ends2 = []; for (let i = 0; i < nWarp; i++) ends2.push(R());
  for (let x = 0; x < P; x++) { const i = Math.floor(x / WP) % nWarp; warpTone[x] = tones[i]; warpEnd[x] = ends[i]; warpEnd2[x] = ends2[i]; }
  for (let y = 0; y < h; y++) weftTone[y] = rng(seed + Math.floor(y / WF) * 7)();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x % P;
    const f = hAt(px, y);
    const lift = (f - minH) / Math.max(1e-6, maxH - minH);
    // weave
    const wx = px % WP, wy = y % WF;
    const over = ((Math.floor(px / WP) + Math.floor(y / WF)) & 1) === 0;
    const warpRound = 1 - Math.abs(wx - 0.5) * 0.6, weftRound = 1 - Math.abs(wy - 1) * 0.5;
    const thread = over ? warpRound : weftRound;
    const tt = over ? warpTone[px] : weftTone[y];
    const weaveH = (over ? 1 : 0.55) * thread * 0.00011;
    const drift = pnoise2(px / P * 5, y / h * 3 + seed, 5, 1000), drift2 = pnoise2(px / P * 11 + 3, y / h * 7, 11, 1000);
    let r = mix(D[0], D2[0], smooth(0.3, 0.75, drift)), g = mix(D[1], D2[1], smooth(0.3, 0.75, drift)), b = mix(D[2], D2[2], smooth(0.3, 0.75, drift));
    r = mix(r, D3[0], smooth(0.55, 0.9, drift2) * 0.55); g = mix(g, D3[1], smooth(0.55, 0.9, drift2) * 0.55); b = mix(b, D3[2], smooth(0.55, 0.9, drift2) * 0.55);
    const shade = (0.8 + 0.22 * lift * shadeK + (1 - shadeK) * 0.2) * (1 + weave * (0.1 * thread - 0.07)) * (1 + weave * (0.1 * tt - 0.05));
    r *= shade; g *= shade; b *= shade;
    // hems: slightly darker and denser, then the stripe
    const dEdge = Math.min(y, h - 1 - y);
    if (S && h - 1 - y >= stripeAt - 1 && h - 1 - y <= stripeAt + 1) {
      const breakK = 0.45 + 0.55 * warpTone[px];
      r = mix(r, S[0] * shade, breakK); g = mix(g, S[1] * shade, breakK); b = mix(b, S[2] * shade, breakK);
    }
    const hemK = 1 - 0.18 * (1 - smooth(fringe, fringe + 5, dEdge));
    r *= hemK; g *= hemK; b *= hemK;
    // the woven alpha edge: a hem worn soft, not a comb. The edge wanders slowly (the hand-cut hem),
    // and only a loose thread here and there stands a single texel proud of it
    let alpha = 1;
    if (fringe > 0) {
      const lim = y < h / 2 ? warpEnd[px] : warpEnd2[px];
      const wander2 = pnoise2(px / P * 11, y < h / 2 ? 0.5 : 7.5, 11, 1000), wander3 = pnoise2(px / P * 37, y < h / 2 ? 2.5 : 5.5, 37, 1000);
      const stray = lim > 0.965 ? 0.45 : 0;
      const reach = fringe * (0.3 + 0.5 * wander2 + 0.2 * wander3) - stray;
      if (dEdge < reach) alpha = 0;
    }
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = clampB(r); buf.base[o + 1] = clampB(g); buf.base[o + 2] = clampB(b); buf.base[o + 3] = alpha > 0.5 ? 255 : alpha > 0 ? 110 : 2;
    // normal: fold slope + weave, in metres
    const dx = (hAt(px + 1, y) - hAt(px - 1, y)) / (2 * mmU * 1e-3), dy = (hAt(px, y + 1) - hAt(px, y - 1)) / (2 * mmV * 1e-3);
    const wxs = (over ? -1 : 0.2) * (wx - 0.5) * 0.3 * weave, wys = (over ? 0.2 : -1) * (wy - 1) * 0.16 * weave;
    const nx = -dx + wxs, ny = dy + wys, nl = Math.hypot(nx, ny, 1);
    const q = ((y0 + y) * W + x0 + x) * 3;
    buf.normal[q] = clampB((nx / nl * 0.5 + 0.5) * 255); buf.normal[q + 1] = clampB((ny / nl * 0.5 + 0.5) * 255); buf.normal[q + 2] = clampB((1 / nl * 0.5 + 0.5) * 255);
    buf.orm[q] = clampB((0.55 + 0.45 * lift) * 255); buf.orm[q + 1] = clampB((rough - 0.05 * thread) * 255); buf.orm[q + 2] = 0;
    void weaveH;
  }
}

/** The tail's frayed end cell: V runs root to tip; threads loosen and end at their own length. */
export function paintFrayEnd(buf, { rect, W = 512, dye, seed = 3, rough = 0.92, stripe = null } = {}) {
  const [x0, y0, w, h] = rect;
  const D = hex(dye);
  const S = stripe ? hex(stripe) : null;
  const R = rng(seed * 7919);
  const nThreads = Math.floor(w / 2);
  const ends = []; for (let i = 0; i < nThreads; i++) ends.push(0.48 + 0.52 * R());
  const tones = []; for (let i = 0; i < nThreads; i++) tones.push(R());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y / h, ti = Math.min(nThreads - 1, Math.floor(x / 2));
    const wx = x % 2;
    const over = ((ti + Math.floor(y / 3)) & 1) === 0;
    const weaveOn = v < 0.46;                                  // the weft stops; only warp threads run on
    const on = v < ends[ti] && (weaveOn || wx === 1 || tones[ti] > 0.72);
    const thread = wx === 1 ? 1 : 0.8;
    let k = (0.82 + 0.3 * tones[ti]) * thread * (over ? 1.02 : 0.92) * (1 - 0.2 * smooth(0.45, 1, v));
    let r = D[0] * k, g = D[1] * k, b = D[2] * k;
    if (S && Math.abs(x - w * 0.5) > w * 0.5 - 4) { r = S[0] * k; g = S[1] * k; b = S[2] * k; }
    const o = ((y0 + y) * W + x0 + x) * 4;
    buf.base[o] = clampB(r); buf.base[o + 1] = clampB(g); buf.base[o + 2] = clampB(b); buf.base[o + 3] = on ? 255 : 2;
    const q = ((y0 + y) * W + x0 + x) * 3;
    const nx = (wx - 0.5) * 0.3, nl = Math.hypot(nx, 1);
    buf.normal[q] = clampB((nx / nl * 0.5 + 0.5) * 255); buf.normal[q + 1] = 128; buf.normal[q + 2] = clampB((1 / nl * 0.5 + 0.5) * 255);
    buf.orm[q] = 255; buf.orm[q + 1] = clampB(rough * 255); buf.orm[q + 2] = 0;
  }
}

const clampB = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
