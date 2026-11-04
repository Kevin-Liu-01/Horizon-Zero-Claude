/**
 * CALIMA — procedural faction pieces (settlements; bible §6.2: hats, yokes, aprons, shawls, masks,
 * baskets, each <= 1.5 k tris). Everything is authored in the pack's FEMALE bind frame (+Y up, +Z
 * forward, +X her left, T-pose, metres); a male recipe's geometry is shifted to meet it and back
 * (lib/human.mjs). Returns kit buckets. Node only, deterministic.
 *
 * A piece is one of three things on the skeleton:
 *   rigid   every vertex 100 % on a joint (a hat on Head, a tool on a prop joint)
 *   surface weights copied from the nearest body vertex (a capelet on the shoulders, a strap)
 *   hanging weights by height on the trunk, then down a dyn_ chain (an apron's flap, a cloak)
 */
import { v3, smooth, polyline, noise3 } from './kit/face.mjs';
import { fixWinding } from './kit/wrap.mjs';
import { emptyGeo, blendSkin, recomputeGeoNormals } from './geo.mjs';

const { sub, add, mul, dot, cross, norm } = v3;
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;

/**
 * A parametric surface. `at(u, v)` -> [x,y,z]; `out(p, u, v)` the side the normal should face.
 * `uv(u, v, p)` -> [U, V] in atlas space; `skin(p, u, v)` -> { j, w }.
 */
export function surface({ rows, cols, at, out, uv, skin, closeU = false }) {
  const g = emptyGeo();
  const cn = closeU ? cols + 1 : cols + 1;
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let c = 0; c < cn; c++) {
      const u = c / cols;
      const p = at(closeU && c === cols ? 0 : u, v);
      g.pos.push(p[0], p[1], p[2]);
      const q = uv(u, v, p);
      g.uv.push(q[0], q[1]);
      const s = skin(p, u, v);
      g.jnt.push(...s.j); g.wgt.push(...s.w);
      g.nrm.push(0, 0, 0);
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * cn + c, b = a + 1, d = a + cn, e = d + 1;
    g.idx.push(a, d, b, b, d, e);
  }
  recomputeGeoNormals(g);
  // orient: the summed normal against `out`
  let sgn = 0;
  for (let r = 0; r <= rows; r++) for (let c = 0; c < cn; c++) {
    const i = r * cn + c;
    const p = [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]];
    const o = out(p, c / cols, r / rows);
    sgn += dot([g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]], o);
  }
  if (sgn < 0) for (let i = 0; i < g.nrm.length; i++) g.nrm[i] = -g.nrm[i];
  fixWinding(g);
  return g;
}

/** The same sheet seen from behind: inset along the normal, flipped, darker. */
export function backFace(g, { inset = 0.0015, shade = 0.55 } = {}) {
  const b = emptyGeo();
  const n = g.pos.length / 3;
  for (let i = 0; i < n; i++) {
    b.pos.push(g.pos[i * 3] - g.nrm[i * 3] * inset, g.pos[i * 3 + 1] - g.nrm[i * 3 + 1] * inset, g.pos[i * 3 + 2] - g.nrm[i * 3 + 2] * inset);
    b.nrm.push(-g.nrm[i * 3], -g.nrm[i * 3 + 1], -g.nrm[i * 3 + 2]);
    b.uv.push(g.uv[i * 2], g.uv[i * 2 + 1]);
    b.jnt.push(g.jnt[i * 4], g.jnt[i * 4 + 1], g.jnt[i * 4 + 2], g.jnt[i * 4 + 3]);
    b.wgt.push(g.wgt[i * 4], g.wgt[i * 4 + 1], g.wgt[i * 4 + 2], g.wgt[i * 4 + 3]);
    b.col.push(shade, shade, shade, 1);
  }
  for (let t = 0; t < g.idx.length; t += 3) b.idx.push(g.idx[t], g.idx[t + 2], g.idx[t + 1]);
  return b;
}

export const twoSided = (g, opts) => {
  const b = backFace(g, opts);
  const o = emptyGeo();
  const base = g.pos.length / 3;
  for (const k of ['pos', 'nrm', 'uv', 'jnt', 'wgt']) o[k] = g[k].concat(b[k]);
  const na = g.col?.length === base * 4 ? g.col : new Array(base * 4).fill(1);
  o.col = na.concat(b.col);
  o.idx = g.idx.concat(b.idx.map((i) => i + base));
  return o;
};

export const rigid = (j) => () => ({ j: [j, 0, 0, 0], w: [1, 0, 0, 0] });

/** A rectangle of the atlas as a UV fn over (u, v). */
export const rectUV = (R, { flipV = false } = {}) => (u, v) => [R[0] + u * R[2], R[1] + (flipV ? 1 - v : v) * R[3]];

/** A lathe about a point, axis `axis` (unit), profile [[r, h], ...] from one pole to the other. */
export function lathe({ c, axis = [0, 1, 0], prof, seg = 16, uv, skin, rowsPerSpan = 1, ripple = null }) {
  const a = norm(axis);
  const e1 = norm(cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const e2 = cross(a, e1);
  const rows = (prof.length - 1) * rowsPerSpan;
  const at = (u, v) => {
    const f = v * (prof.length - 1), i = Math.min(prof.length - 2, Math.floor(f)), t = f - i;
    let r = mix(prof[i][0], prof[i + 1][0], t);
    const h = mix(prof[i][1], prof[i + 1][1], t);
    const th = u * TAU;
    if (ripple) r += ripple(th, v);
    return add(add(c, mul(a, h)), add(mul(e1, Math.cos(th) * r), mul(e2, Math.sin(th) * r)));
  };
  const out = (p) => { const d = sub(p, c); const ax = dot(d, a); const rad = sub(d, mul(a, ax)); return norm(add(rad, mul(a, ax * 0.3))); };
  return surface({ rows, cols: seg, at, out, uv, skin, closeU: true });
}

/** A tube along a polyline; `r(u)` the radius; capped at both ends with a fan. */
export function tube(points, { r = () => 0.01, ring = 6, along = null, uv = () => [0, 0], skin, side = null, cap = true }) {
  const pl = polyline(points);
  const rows = along ?? Math.max(1, points.length - 1);
  const g = emptyGeo();
  const up0 = side || (Math.abs(pl.at(0).t[1]) > 0.8 ? [1, 0, 0] : [0, 1, 0]);
  for (let a = 0; a <= rows; a++) {
    const u = a / rows;
    const { p, t } = pl.at(u);
    const s = norm(sub(up0, mul(t, dot(up0, t)))), b = cross(t, s);
    for (let k = 0; k <= ring; k++) {
      const th = (k % ring) / ring * TAU;
      const n = add(mul(s, Math.cos(th)), mul(b, Math.sin(th)));
      const q = add(p, mul(n, r(u)));
      g.pos.push(...q); g.nrm.push(...n);
      const c = uv(k / ring, u, q);
      g.uv.push(c[0], c[1]);
      const sk = skin(q, u, k / ring);
      g.jnt.push(...sk.j); g.wgt.push(...sk.w);
    }
  }
  for (let a = 0; a < rows; a++) for (let k = 0; k < ring; k++) {
    const i0 = a * (ring + 1) + k, i1 = i0 + 1, i2 = i0 + ring + 1, i3 = i2 + 1;
    g.idx.push(i0, i2, i1, i1, i2, i3);
  }
  if (cap) {
    for (const [u, row, sgn] of [[0, 0, -1], [1, rows, 1]]) {
      const { p, t } = pl.at(u);
      const base = g.pos.length / 3;
      g.pos.push(...p); g.nrm.push(...mul(t, sgn));
      const c = uv(0.5, u, p); g.uv.push(c[0], c[1]);
      const sk = skin(p, u, 0.5); g.jnt.push(...sk.j); g.wgt.push(...sk.w);
      for (let k = 0; k < ring; k++) { const q = row * (ring + 1) + k; g.idx.push(q, q + 1, base); }
    }
  }
  fixWinding(g);
  return g;
}

/* ================================================================ skinning by height */

/** Weights on the trunk at a bind height (pelvis -> spine_01 -> spine_02 -> spine_03). */
export function trunkSkin(J) {
  const stops = [[0.98, J.pelvis], [1.11, J.spine_01], [1.24, J.spine_02], [1.38, J.spine_03]];
  return (y) => {
    if (y <= stops[0][0]) return { j: [stops[0][1], 0, 0, 0], w: [1, 0, 0, 0] };
    for (let i = 0; i < stops.length - 1; i++) {
      if (y < stops[i + 1][0]) { const t = (y - stops[i][0]) / (stops[i + 1][0] - stops[i][0]); return { j: [stops[i][1], stops[i + 1][1], 0, 0], w: [1 - t, t, 0, 0] }; }
    }
    return { j: [stops[3][1], 0, 0, 0], w: [1, 0, 0, 0] };
  };
}

/** Weights down a chain of driven joints at arc fraction t. */
export function chainSkin(joints, t) {
  const n = joints.length, f = Math.max(0, Math.min(0.9999, t)) * n, i = Math.floor(f), k = f - i;
  return { j: [joints[i], joints[Math.min(n - 1, i + 1)], 0, 0], w: [1 - k, k, 0, 0] };
}

/* ========================================================================== cloth on a body */

/**
 * A sheet hanging off the body on one side (`side` +1 front, -1 back). Cast from outside onto
 * `grid`; down each column the cloth can only fall away from what it already touched, the way
 * cloth hangs, and it is smoothed across so it never clings between the legs.
 */
export function hangingSheet({ grid, rows = 10, cols = 8, y0, y1, halfW, side = 1, lift = 0.01, far = 0.5, foldAmp = 0.006, foldN = 3.3, seed = 1, uv, skin, flareZ = 0, hemWave = 0, cling = 0.07 }) {
  const Z = new Float32Array((rows + 1) * (cols + 1));
  const X = (u, v) => (u * 2 - 1) * halfW(v);
  const Y = (u, v) => mix(y0, y1, v) + hemWave * v * v * Math.sin(u * 9 + seed);
  for (let c = 0; c <= cols; c++) {
    let prev = -Infinity;
    for (let r = 0; r <= rows; r++) {
      const u = c / cols, v = r / rows;
      let z = -far;
      for (const off of [-0.5, -0.17, 0.17, 0.5]) {
        const t = grid.cast(X(u, v), Y(u, v) + off * (y1 - y0) / rows, side * far, 0, 0, -side, far * 2, 0.0001);
        if (t >= 0) z = Math.max(z, far - t);
      }
      // falls no faster than `cling` per metre
      if (prev > -Infinity) z = Math.max(z, prev - cling * (Math.abs(y1 - y0) / rows));
      prev = z;
      Z[r * (cols + 1) + c] = z;
    }
  }
  // no column may be a valley: pull each to the shape of its neighbours
  for (let pass = 0; pass < 3; pass++) {
    const src = Z.slice();
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const l = src[r * (cols + 1) + Math.max(0, c - 1)], m = src[r * (cols + 1) + c], h = src[r * (cols + 1) + Math.min(cols, c + 1)];
      Z[r * (cols + 1) + c] = Math.max(m, (l + h) * 0.5 - 0.004);
    }
  }
  const at = (u, v) => {
    const r = Math.round(v * rows), c = Math.round(u * cols);
    const z0 = Z[r * (cols + 1) + c];
    const wave = foldAmp * smooth(0.12, 0.9, v) * Math.sin(u * foldN * TAU + seed + 1.3 * v) + 0.4 * foldAmp * smooth(0.3, 1, v) * Math.sin(u * foldN * 2.3 * TAU + seed * 2 + 2 * v);
    const roll = -0.018 * Math.pow(Math.abs(u * 2 - 1), 3);
    return [X(u, v), Y(u, v), side * (z0 + lift + wave + roll + flareZ * v)];
  };
  return surface({ rows, cols, at, out: () => [0, 0.1, side], uv, skin });
}

/**
 * A long skirt about the pelvis: radial casts keep it clear of the body, an A-line keeps it clear
 * of the walking legs, pleats keep it cloth. Weighted on the pelvis, the lower rows part on the
 * thighs by side, so the hem follows the stride.
 */
export function skirt({ grid, J, y0 = 1.08, y1 = 0.1, rHem = 0.31, rows = 9, seg = 26, lift = 0.012, pleats = 7, amp = 0.012, uv, seed = 3, follow = 0.42, rFloor = 0.15, cz = -0.012, rMax = 0.4 }) {
  const far = 0.7;
  const R = new Float32Array((rows + 1) * seg);
  for (let s = 0; s < seg; s++) {
    const th = s / seg * TAU, dx = Math.sin(th), dz = Math.cos(th);
    let prev = 0;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows, y = mix(y0, y1, v);
      const t = grid.cast(dx * far, y, cz + dz * far, -dx, 0, -dz, far, 0.0001);
      const surf = Math.min(rMax, t >= 0 ? far - t : 0);
      const line = mix(rFloor, rHem, Math.pow(v, 0.85));
      const q = Math.max(surf + lift, line * (0.9 + 0.1 * Math.abs(dx)), prev - 0.004);
      R[r * seg + s] = q;
      prev = q;
    }
  }
  const at = (u, v) => {
    const c = Math.min(seg - 1, Math.round(u * seg)) % seg, r = Math.round(v * rows);
    const th = u * TAU;
    const pl = amp * smooth(0.08, 0.7, v) * (Math.sin(th * pleats + seed) + 0.5 * Math.sin(th * (pleats * 2 + 1) + seed * 3));
    const rad = R[r * seg + c] + pl;
    return [Math.sin(th) * rad, mix(y0, y1, v) + 0.012 * v * Math.sin(th * 3 + seed), cz + Math.cos(th) * rad];
  };
  const skin = (p, u, v) => {
    const a = Math.sin(u * TAU);
    const m = follow * smooth(0.1, 1, v);
    const l = m * smooth(-0.7, 0.7, a), rr = m * (1 - smooth(-0.7, 0.7, a));
    return { j: [J.pelvis, J.thigh_l, J.thigh_r, 0], w: [1 - l - rr, l, rr, 0] };
  };
  const g = surface({ rows, cols: seg, at, closeU: true, out: (p) => norm([p[0], 0.05, p[2] - cz]), uv, skin });
  return twoSided(g, { inset: 0.004, shade: 0.42 });
}

/**
 * A capelet: from the neck out over the shoulders and down the chest and back, a ring of rows lying
 * on the surface. Seen in the bind T-pose the sides stop at the shoulder tip.
 */
export function capelet({ grid, skinNear, c = [0, 1.33, -0.015], rows = 7, seg = 30, lift = 0.008, phi0 = 62, phiFB = -24, phiSide = 26, uv, amp = 0.004, seed = 5, rMax = 0.36 }) {
  const far = 0.8, DEG = Math.PI / 180;
  const pts = [];
  for (let r = 0; r <= rows; r++) for (let s = 0; s < seg; s++) {
    const th = s / seg * TAU, side = Math.sin(th) ** 2;
    const ph = mix(phi0, mix(phiFB, phiSide, side), r / rows) * DEG;
    const d = [Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)];
    const t = grid.cast(c[0] + d[0] * far, c[1] + d[1] * far, c[2] + d[2] * far, -d[0], -d[1], -d[2], far, 0.0001);
    const rad = Math.min(rMax, t >= 0 ? far - t : (r ? 0.2 : 0.09));
    pts.push({ th, d, rad });
  }
  // smooth the radius across (a dent in the armpit must not print)
  for (let pass = 0; pass < 2; pass++) {
    const src = pts.map((q) => q.rad);
    for (let r = 0; r <= rows; r++) for (let s = 0; s < seg; s++) {
      const a = src[r * seg + ((s + seg - 1) % seg)], b = src[r * seg + s], e = src[r * seg + ((s + 1) % seg)];
      pts[r * seg + s].rad = Math.max(b, (a + e) * 0.5);
    }
  }
  const at = (u, v) => {
    const s = Math.min(seg - 1, Math.round(u * seg)) % seg, r = Math.round(v * rows);
    const q = pts[r * seg + s];
    const wave = amp * smooth(0.2, 1, v) * Math.sin(q.th * 8 + seed + v * 2);
    return add(c, mul(q.d, q.rad + lift + wave + 0.006 * v));
  };
  return surface({ rows, cols: seg, at, closeU: true, out: (p) => norm(sub(p, c)), uv, skin: (p) => skinNear(p) });
}

/** A ring on the surface at one height, a belt or a band with a little thickness. */
export function ring({ grid, y, h = 0.04, seg = 28, lift = 0.006, c = [0, 0, -0.012], uv, skin, tilt = 0, thick = 0.003, rows = 2 }) {
  const far = 0.7;
  const R = [];
  for (let s = 0; s < seg; s++) {
    const th = s / seg * TAU, dx = Math.sin(th), dz = Math.cos(th);
    const y0 = y + tilt * dz;
    const t0 = grid.cast(dx * far, y0 + h * 0.5, c[2] + dz * far, -dx, 0, -dz, far, 0.0001);
    const t1 = grid.cast(dx * far, y0 - h * 0.5, c[2] + dz * far, -dx, 0, -dz, far, 0.0001);
    R.push(Math.max(t0 >= 0 ? far - t0 : 0.08, t1 >= 0 ? far - t1 : 0.08));
  }
  const at = (u, v) => {
    const s = Math.min(seg - 1, Math.round(u * seg)) % seg;
    const th = u * TAU, dz = Math.cos(th);
    const rr = R[s] + lift + thick * Math.sin(v * Math.PI);
    return [Math.sin(th) * rr, y + tilt * dz + (0.5 - v) * h, c[2] + dz * rr];
  };
  return surface({ rows, cols: seg, at, closeU: true, out: (p) => norm([p[0], 0, p[2] - c[2]]), uv, skin });
}

/** A strap: a polyline pushed onto the surface, as a flat band. */
export function strap(points, { grid, width = 0.03, lift = 0.005, uv, skinNear, along = 18, normalAt = null }) {
  const pl = polyline(points);
  const g = emptyGeo();
  for (let a = 0; a <= along; a++) {
    const u = a / along;
    const { p, t } = pl.at(u);
    const n0 = normalAt ? normalAt(p) : norm([p[0], 0.2, p[2]]);
    const hit = grid.cast(p[0] + n0[0] * 0.3, p[1] + n0[1] * 0.3, p[2] + n0[2] * 0.3, -n0[0], -n0[1], -n0[2], 0.6, 0.0001);
    const q = hit >= 0 ? add(p, mul(n0, 0.3 - hit)) : p;
    const s = norm(cross(t, n0));
    const n = norm(cross(s, t));
    for (let k = 0; k <= 1; k++) {
      const x = k ? 0.5 : -0.5;
      const r = add(add(q, mul(n, lift)), mul(s, x * width));
      g.pos.push(...r); g.nrm.push(...n);
      const c = uv(k, u); g.uv.push(c[0], c[1]);
      const sk = skinNear(r); g.jnt.push(...sk.j); g.wgt.push(...sk.w);
    }
  }
  for (let a = 0; a < along; a++) { const i = a * 2; g.idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  fixWinding(g);
  return g;
}

/* ============================================================================= rigid pieces */

/** A wide palm hat: plaited, a peaked crown and a brim that droops at its rim. */
export function palmHat({ c = [0, 1.752, -0.012], tilt = [0.02, 1, -0.1], rBrim = 0.235, crownH = 0.095, joint, uv }) {
  const skin = rigid(joint);
  const prof = [[0.004, crownH + 0.006], [0.03, crownH], [0.07, crownH * 0.55], [0.1, crownH * 0.12], [0.112, 0.0], [0.16, -0.012], [0.21, -0.026], [rBrim, -0.046], [rBrim + 0.006, -0.052]];
  const a = norm(tilt);
  const top = lathe({ c, axis: a, prof, seg: 24, uv: (u, v, p) => { const d = sub(p, c); const k = 0.5 / (rBrim * 1.08); return uv([0.5 + d[0] * k, 0.5 + d[2] * k]); }, skin, ripple: (th, v) => 0.004 * smooth(0.55, 1, v) * Math.sin(th * 7 + 1) });
  const under = lathe({ c: sub(c, mul(a, 0.004)), axis: a, prof: [[rBrim + 0.005, -0.054], [0.17, -0.02], [0.112, -0.006], [0.09, -0.004]], seg: 24, uv: (u, v, p) => { const d = sub(p, c); const k = 0.5 / (rBrim * 1.08); return uv([0.5 + d[0] * k, 0.5 + d[2] * k]); }, skin });
  for (let i = 0; i < under.nrm.length; i++) under.nrm[i] = -under.nrm[i];
  fixWinding(under);
  under.col = []; for (let i = 0; i < under.pos.length / 3; i++) under.col.push(0.55, 0.52, 0.48, 1);
  return [top, under];
}

/** A wicker basket; `fill` a salt cone or a heap in the top. */
export function basket({ c, axis = [0, 1, 0], rBot = 0.13, rTop = 0.19, h = 0.28, joint, uvWicker, uvRim, uvFill = null, fillH = 0.07, seg = 16, skin = null }) {
  const sk = skin || rigid(joint);
  const a = norm(axis);
  const body = lathe({ c, axis: a, prof: [[0.002, -0.002], [rBot * 0.8, 0], [rBot, 0.015], [mix(rBot, rTop, 0.45), h * 0.45], [mix(rBot, rTop, 0.8), h * 0.8], [rTop, h]], seg, skin: sk, uv: (u, v) => uvWicker([(u * 3) % 1, v]) });
  const rim = lathe({ c: add(c, mul(a, h)), axis: a, prof: [[rTop - 0.012, -0.006], [rTop + 0.01, -0.008], [rTop + 0.012, 0.006], [rTop - 0.012, 0.01]], seg, skin: sk, uv: (u, v) => uvRim([(u * 4) % 1, v]) });
  const inner = lathe({ c: add(c, mul(a, h)), axis: a, prof: [[rTop - 0.012, 0.009], [rTop * 0.5, -0.05], [0.002, -0.06]], seg, skin: sk, uv: (u, v) => uvWicker([(u * 2) % 1, v]) });
  inner.col = []; for (let i = 0; i < inner.pos.length / 3; i++) inner.col.push(0.3, 0.28, 0.26, 1);
  const parts = [body, rim, inner];
  if (uvFill) {
    const fill = lathe({ c: add(c, mul(a, h - 0.006)), axis: a, prof: [[rTop - 0.012, 0.004], [rTop * 0.7, fillH * 0.55], [rTop * 0.32, fillH * 0.92], [0.004, fillH]], seg, skin: sk, uv: (u, v, p) => { const d = sub(p, c); return uvFill([0.5 + d[0] * 2.2, 0.5 + d[2] * 2.2]); }, ripple: (th, v) => 0.006 * Math.sin(th * 5 + v * 3) });
    parts.push(fill);
  }
  return parts;
}

/** A rod with a head: rake, cane, staff, mallet, hammer. All rigid, along `dir` from `at`. */
export function rake({ at, dir, joint, uvWood, uvTooth, L = 1.65, head = 0.42, teeth = 7 }) {
  const d = norm(dir), sk = rigid(joint);
  const side0 = norm(cross(d, [0, 0, 1]));
  const up = cross(side0, d);
  const parts = [tube([sub(at, mul(d, 0.42)), add(at, mul(d, L - 0.42))], { r: () => 0.012, ring: 6, along: 2, skin: sk, uv: (u, v) => uvWood([u, v]) })];
  const hc = add(at, mul(d, L - 0.42));
  parts.push(tube([add(hc, mul(side0, -head / 2)), add(hc, mul(side0, head / 2))], { r: () => 0.016, ring: 5, along: 1, skin: sk, uv: (u, v) => uvWood([u, v]), side: d }));
  for (let i = 0; i < teeth; i++) {
    const s = (i / (teeth - 1) - 0.5) * head * 0.94;
    const b = add(hc, mul(side0, s));
    parts.push(tube([b, add(b, add(mul(d, 0.02), mul(up, 0.07)))], { r: (u) => 0.0065 * (1 - 0.5 * u), ring: 4, along: 1, skin: sk, uv: (u, v) => uvTooth([u, v]) }));
  }
  return parts;
}

export function cane({ at, dir, joint, uvWood, uvTip, L = 1.02, handle = 0.1 }) {
  const d = norm(dir), sk = rigid(joint);
  const parts = [tube([sub(at, mul(d, handle)), add(at, mul(d, L))], { r: (u) => 0.0125 - 0.0035 * u, ring: 6, along: 3, skin: sk, uv: (u, v) => uvWood([u, v]) })];
  parts.push(tube([add(at, mul(d, L - 0.04)), add(at, mul(d, L + 0.004))], { r: () => 0.0115, ring: 6, along: 1, skin: sk, uv: (u, v) => uvTip([u, v]) }));
  return parts;
}

export function lantern({ at, joint, uvBrass, uvGlass, axis = [0, -1, 0] }) {
  const a = norm(axis), sk = rigid(joint);
  const c = add(at, mul(a, 0.1));
  const body = lathe({ c, axis: mul(a, -1), prof: [[0.002, -0.095], [0.05, -0.09], [0.055, -0.07], [0.05, -0.066]], seg: 10, skin: sk, uv: (u, v) => uvBrass([u, v]) });
  const glass = lathe({ c, axis: mul(a, -1), prof: [[0.05, -0.066], [0.058, -0.02], [0.05, 0.03]], seg: 10, skin: sk, uv: (u, v) => uvGlass([u, v]) });
  const top = lathe({ c, axis: mul(a, -1), prof: [[0.05, 0.03], [0.056, 0.036], [0.024, 0.07], [0.004, 0.09]], seg: 10, skin: sk, uv: (u, v) => uvBrass([u, v]) });
  const bail = tube([at, add(at, mul(a, 0.022)), add(c, mul(a, -0.09))], { r: () => 0.0028, ring: 4, along: 2, skin: sk, uv: (u, v) => uvBrass([u, v]) });
  return [body, glass, top, bail];
}

export function hammer({ at, dir, joint, uvWood, uvHead, L = 0.34, headW = 0.12, headH = 0.05 }) {
  const d = norm(dir), sk = rigid(joint);
  const side0 = norm(cross(d, [0, 0, 1]));
  const hc = add(at, mul(d, L * 0.72));
  return [
    tube([sub(at, mul(d, L * 0.28)), add(at, mul(d, L * 0.74))], { r: () => 0.0125, ring: 6, along: 2, skin: sk, uv: (u, v) => uvWood([u, v]) }),
    tube([add(hc, mul(side0, -headW * 0.5)), add(hc, mul(side0, headW * 0.5))], { r: (u) => headH * 0.5 * (0.86 + 0.14 * Math.sin(u * Math.PI)), ring: 6, along: 3, skin: sk, uv: (u, v) => uvHead([u, v]) }),
  ];
}

/** Mica goggles pushed up on the forehead: two discs in brass rims and a strap round the head. */
export function goggles({ joint, y = 1.72, z = 0.082, dx = 0.034, uvBrass, uvMica, tilt = 0.5 }) {
  const sk = rigid(joint);
  const parts = [];
  const a = norm([0, Math.sin(tilt), Math.cos(tilt)]);
  for (const s of [1, -1]) {
    const c = [s * dx, y, z];
    parts.push(lathe({ c, axis: a, prof: [[0.0215, -0.003], [0.0235, -0.012], [0.0235, 0.008], [0.0195, 0.011], [0.0185, 0.004]], seg: 10, skin: sk, uv: (u, v) => uvBrass([u, v]) }));
    parts.push(lathe({ c: add(c, mul(a, 0.004)), axis: a, prof: [[0.0188, 0], [0.012, 0.0024], [0.001, 0.0034]], seg: 10, skin: sk, uv: (u, v) => uvMica([u, v]) }));
  }
  parts.push(tube([[dx - 0.012, y + 0.002, z + 0.001], [-dx + 0.012, y + 0.002, z + 0.001]], { r: () => 0.004, ring: 4, along: 1, skin: sk, uv: (u, v) => uvBrass([u, v]) }));
  return parts;
}

/** A chain of brass links round the neck: a thick tube with beaded radius, and a hanging medallion on its own chain. */
export function guildChain({ grid, skinNear, y = 1.38, uv, medalJoints, medalAt, seg = 44 }) {
  const pts = [];
  for (let s = 0; s <= seg; s++) {
    const th = s / seg * TAU, dx = Math.sin(th), dz = Math.cos(th);
    // it lies lower at the chest than on the nape
    const yy = y + 0.075 * smooth(-0.2, -0.95, dz) - 0.07 * smooth(0.2, 0.95, dz);
    const t = grid.cast(dx * 0.5, yy, -0.015 + dz * 0.5, -dx, 0, -dz, 0.5, 0.0001);
    const r = t >= 0 ? 0.5 - t : 0.11;
    pts.push([dx * (r + 0.009), yy, -0.015 + dz * (r + 0.009)]);
  }
  const chain = tube(pts, { r: (u) => 0.0048 + 0.0018 * Math.sin(u * seg * TAU * 0.5), ring: 5, along: seg * 2, skin: (p) => skinNear(p), uv: (u, v) => uv([u, (v * 8) % 1]), cap: false });
  const medal = lathe({ c: medalAt, axis: [0, 0.2, 1], prof: [[0.03, -0.004], [0.034, 0], [0.032, 0.005], [0.018, 0.0075], [0.001, 0.009]], seg: 12, skin: () => ({ j: [medalJoints[0], 0, 0, 0], w: [1, 0, 0, 0] }), uv: (u, v, p) => uv([0.5 + (p[0] - medalAt[0]) * 12, 0.5 + (p[1] - medalAt[1]) * 12]) });
  return [chain, medal];
}

/** An ellipsoid sack on a chain or a joint. */
export function sack({ c, r = [0.08, 0.1, 0.05], uv, skin, seg = 12, rows = 8 }) {
  const at = (u, v) => {
    const th = u * TAU, ph = v * Math.PI;
    const k = 1 + 0.05 * Math.sin(th * 3 + 1) * Math.sin(ph) + 0.03 * noise3(th, ph, 5);
    return [c[0] + Math.sin(ph) * Math.cos(th) * r[0] * k, c[1] + Math.cos(ph) * r[1] * (1 - 0.12 * Math.cos(ph)), c[2] + Math.sin(ph) * Math.sin(th) * r[2] * k];
  };
  return surface({ rows, cols: seg, at, closeU: true, out: (p) => norm(sub(p, c)), uv: (u, v) => uv([(u * 2) % 1, v]), skin });
}

/** A rolled cuff at a sleeve's cut edge (x = xCut on side sgn), skinned like the edge. */
export function cuff({ geo, sgn, xCut, uv }) {
  const n = geo.pos.length / 3;
  const ring0 = [];
  for (let i = 0; i < n; i++) if (Math.sign(geo.pos[i * 3]) === sgn && Math.abs(geo.pos[i * 3]) > xCut - 0.018) ring0.push(i);
  if (!ring0.length) return null;
  let cx = 0, cy = 0, cz = 0;
  for (const i of ring0) { cx += geo.pos[i * 3]; cy += geo.pos[i * 3 + 1]; cz += geo.pos[i * 3 + 2]; }
  cx /= ring0.length; cy /= ring0.length; cz /= ring0.length;
  let rad = 0;
  for (const i of ring0) rad = Math.max(rad, Math.hypot(geo.pos[i * 3 + 1] - cy, geo.pos[i * 3 + 2] - cz));
  const j = geo.jnt.slice(ring0[0] * 4, ring0[0] * 4 + 4), w = geo.wgt.slice(ring0[0] * 4, ring0[0] * 4 + 4);
  const at = (u, v) => {
    const a = v * Math.PI, off = -sgn * 0.016 * (1 - Math.cos(a)) * 0.5, rr = rad + 0.003 + 0.009 * Math.sin(a), th = u * TAU;
    return [cx + off, cy + Math.cos(th) * rr, cz + Math.sin(th) * rr];
  };
  return surface({ rows: 3, cols: 14, at, closeU: true, out: (p) => norm([0, p[1] - cy, p[2] - cz]), uv: (u, v) => uv([u, v]), skin: () => ({ j, w }) });
}

export { blendSkin };
