/**
 * CALIMA — armor recipes: procedural garment pieces in RAW bind space (armory W1).
 *
 * Everything here hangs off a `Field` of the body (and of whatever layer is
 * under it), so a piece fits Brea rather than a stock mannequin: rings are read
 * from the surface under them, straps are projected onto it, and skin is
 * transferred from it. Bearings: 0 = +X (her left), PI/2 = +Z (front), measured
 * around a vertical axis. UVs of island pieces are metric (u = arc, v = metres
 * down the garment), so `packAtlas` gives them the same texel density as the
 * re-cut MCO islands; pieces with `trim: true` map straight into the trim band.
 */
import { Field, V, clamp, emptyPart, gridInto, mix, recomputeNormals, sstep } from './part.mjs';
import { noise3 } from '../../lib/face.mjs';

export const TAU = Math.PI * 2;

/** Radial profile at height y: `cols + 1` samples over [th0, th0 + span], filled and smoothed. */
export function ring(field, y, cols, { cx = 0, cz = -0.02, th0 = -Math.PI / 2, span = TAU, dy = 0.022, dth = null, keep = null, smooth = 2 } = {}) {
  const r = new Float64Array(cols + 1);
  const win = dth ?? Math.max(0.11, 1.4 * span / cols);
  for (let c = 0; c <= cols; c++) r[c] = field.radial(y, th0 + span * (c / cols), cx, cz, dy, win, keep);
  // fill holes from the nearest sampled neighbours
  for (let c = 0; c <= cols; c++) {
    if (r[c] > 0) continue;
    let a = c, b = c;
    while (a > 0 && r[a] === 0) a--;
    while (b < cols && r[b] === 0) b++;
    const ra = r[a], rb = r[b];
    r[c] = ra && rb ? mix(ra, rb, (c - a) / Math.max(1, b - a)) : (ra || rb || 0.12);
  }
  const closed = Math.abs(span - TAU) < 1e-6;
  for (let s = 0; s < smooth; s++) {
    const o = r.slice();
    for (let c = 0; c <= cols; c++) {
      const l = closed ? o[(c - 1 + cols) % cols] : o[Math.max(0, c - 1)];
      const n = closed ? o[(c + 1) % cols] : o[Math.min(cols, c + 1)];
      r[c] = (l + 2 * o[c] + n) / 4;
    }
    if (closed) r[cols] = r[0];
  }
  return r;
}

/** Deterministic drape ripple: a sum of cosines over bearing, 0-mean, amplitude ~1. */
export function ripple(th, seed, ks = [5, 8, 13]) {
  let s = 0, n = 0;
  ks.forEach((k, i) => {
    const ph = noise3(seed * 3.1, i * 7.7, 0.3) * TAU, a = 1 / (1 + i * 0.6);
    s += a * Math.cos(k * th + ph); n += a;
  });
  return s / n;
}

/** Flip a part's winding if its normals point into `center` (x, z axis, y free). */
export function orientOut(part, cx = 0, cz = -0.02, cy = null) {
  recomputeNormals(part);
  let s = 0;
  for (let i = 0; i < part.pos.length; i += 3) {
    const dx = part.pos[i] - cx, dz = part.pos[i + 2] - cz, dy = cy == null ? 0 : part.pos[i + 1] - cy;
    s += dx * part.nrm[i] + dz * part.nrm[i + 2] + dy * part.nrm[i + 1];
  }
  if (s < 0) {
    for (let t = 0; t < part.idx.length; t += 3) { const a = part.idx[t + 1]; part.idx[t + 1] = part.idx[t + 2]; part.idx[t + 2] = a; }
    recomputeNormals(part);
  }
  return part;
}

/**
 * The body of the over-smock, from under-bust to the girdle's top edge: cloth
 * HANGS, so going down the radius may fall only `fall` m per metre (no corset),
 * then gathers into the belt with a small blouse above it.
 */
export function smockBody(part, surf, skin, { yTop = 1.215, yBelt = 1.095, rBeltY = 1.06, rows = 8, cols = 72, off = 0.006, beltOff = 0.012, blouse = 0.011, fall = 0.38, seed = 1, topOff = 0.008, keep = null, density = 1 } = {}) {
  const th0 = -Math.PI / 2;
  const cz = -0.02;
  const belt = ring(surf, rBeltY, cols, { keep });
  const prof = [];
  let prev = null;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows, y = mix(yTop, yBelt, t);
    const base = ring(surf, y, cols, { keep, smooth: 1, dth: 0.13 });
    const cur = new Float64Array(cols + 1);
    for (let c = 0; c <= cols; c++) {
      let v = base[c] + (r === 0 ? 0.0015 : r === 1 ? 0.003 : r === 2 ? 0.0045 : off);
      if (prev) v = Math.max(v, prev[c] - fall * (yTop - yBelt) / rows);
      const toBelt = belt[c] + beltOff + blouse * Math.sin(Math.PI * sstep(0.45, 1, t));
      v = mix(v, Math.max(toBelt, belt[c] + beltOff), sstep(0.55, 1, t));
      cur[c] = v;
    }
    prev = cur;
    prof.push(cur);
  }
  const arc = (c) => (c / cols) * TAU * 0.145;
  gridInto(part, rows, cols, (_a, _b, r, c) => {
    const t = r / rows, y = mix(yTop, yBelt, t);
    const th = th0 + TAU * (c % cols) / cols;
    // folds: long soft ones from the bust, tight gathers just above the belt
    const a = 0.0034 * sstep(0, 0.35, t) * (1 - sstep(0.8, 1, t) * 0.55) * ripple(th, seed, [6, 9])
      + 0.0028 * sstep(0.55, 1, t) * ripple(th, seed + 3, [14, 19, 23]);
    const rad = prof[r][c] + a;
    const p = [Math.cos(th) * rad, y, cz + Math.sin(th) * rad];
    const s = skin.skin(p[0], p[1], p[2], 4);
    return { p, uv: [arc(c), yTop - y], j: s.j, w: s.w };
  });
  part.density = density;
  orientOut(part);
  return part;
}

/**
 * Skirt panels below the belt, each its own island: `slits` are bearings where
 * the skirt opens. Panels follow pelvis near the belt and their thigh toward the
 * hem, each panel its own side, so the legs never stretch a panel across them.
 */
export function skirtPanels(mk, surf, joints, { yTop = 1.025, yHem = 0.74, off = 0.008, flare = 0.14, slits, rows = 6, colsPer = 16, ripA = 0.007, seed = 3, density = 1, overlap = 0.05, thighW = 0.92, keep = null, slot = 'skirt', hem = null, floorY = null, ringDth = null } = {}) {
  const cz = -0.02;
  const n = slits.length;
  const made = [];
  for (let i = 0; i < n; i++) {
    let a0 = slits[i], a1 = slits[(i + 1) % n];
    if (a1 <= a0) a1 += TAU;
    const start = a0 - overlap, span = (a1 - a0) + 2 * overlap;
    // cloth falls: once a row is out over the hip it never comes back in below it
    const profs = [];
    let prev = null;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, y = mix(yTop, yHem, t);
      const raw = ring(surf, floorY != null ? Math.max(y, floorY) : y, colsPer, { th0: start, span, keep, dy: 0.03, smooth: 3, dth: ringDth });
      const cur = new Float64Array(colsPer + 1);
      for (let c = 0; c <= colsPer; c++) {
        cur[c] = raw[c] + off;
        if (prev) cur[c] = Math.max(cur[c], prev[c] + flare * (yTop - yHem) / rows);
      }
      profs.push(cur);
      prev = cur;
    }
    const part = mk(slot);
    const mid = start + span / 2;
    const side = Math.cos(mid) >= 0 ? 'l' : 'r';
    gridInto(part, rows, colsPer, (_a, _b, r, c) => {
      const t = r / rows;
      const th = start + span * (c / colsPer);
      const hemY = hem ? hem(th, yHem) : yHem;
      const y = mix(yTop, hemY, t);
      const rad = profs[r][c] + ripA * sstep(0.05, 0.9, t) * ripple(th, seed + i, [7, 11, 17]);
      const p = [Math.cos(th) * rad, y, cz + Math.sin(th) * rad];
      const w = thighW * sstep(0.02, 0.85, t);
      const thigh = joints[`thigh_${side}`], pel = joints.pelvis;
      return { p, uv: [(c / colsPer) * span * 0.2, yTop - y], j: [pel, thigh, 0, 0], w: [1 - w, w, 0, 0] };
    });
    part.density = density;
    orientOut(part);
    made.push(part);
  }
  return made;
}

/** A band hugging the surface around the torso at height y; maps into a trim rect (u along). */
export function beltRing(part, surf, skin, { y = 1.06, h = 0.07, off = 0.013, cols = 64, rect, lip = 0.004, thick = 0.006, keep = null, tilt = 0, dy = 0.01 } = {}) {
  const th0 = -Math.PI / 2;
  const cz = -0.02;
  // profile of the widest of the belt's rows, so it reads as one stiff strap
  const rows = [
    [-0.5, -lip * 0.5], [-0.5, thick * 0.7], [-0.38, thick], [0, thick], [0.38, thick], [0.5, thick * 0.7], [0.5, -lip * 0.5],
  ];
  // stiff: one straight line between its two edges, read from the surface UNDER the belt
  const rTop = ring(surf, y + h / 2, cols, { keep, dy, dth: 0.16, smooth: 3 }), rBot = ring(surf, y - h / 2, cols, { keep, dy, dth: 0.16, smooth: 3 });
  gridInto(part, rows.length - 1, cols, (_a, _b, r, c) => {
    const [f, o] = rows[r];
    const th = th0 + TAU * (c % cols) / cols;
    const rad = mix(rBot[c], rTop[c], f + 0.5) + off + o;
    const yy = y + f * h + tilt * Math.sin(th);
    const p = [Math.cos(th) * rad, yy, cz + Math.sin(th) * rad];
    const s = skin.skin(p[0], y, p[2], 4);
    const v = 1 - (f + 0.5);
    return { p, uv: [rect[0] + rect[2] * (c / cols), rect[1] + rect[3] * clamp(v)], j: s.j, w: s.w };
  });
  orientOut(part);
  return part;
}

/**
 * A strap / cloth band laid over a surface along a 3-D polyline: each sample is
 * projected to `margin` above the surface, side = path x surface normal.
 * `rect` maps u across the strap, v along it (repeating every `tile` metres).
 */
export function strapAlong(part, surf, skin, ctrl, { width = 0.026, margin = 0.006, segs = 24, cols = 3, rect, tile = 0.3, crown = 0.0018, smooth = 3, widthAt = null, rigid = null } = {}) {
  // resample the polyline
  const L = [0];
  for (let i = 1; i < ctrl.length; i++) L.push(L[i - 1] + V.len(V.sub(ctrl[i], ctrl[i - 1])));
  const total = L[L.length - 1];
  const P = [];
  for (let s = 0; s <= segs; s++) {
    const d = total * s / segs;
    let i = 1; while (i < ctrl.length - 1 && L[i] < d) i++;
    P.push(V.lerp(ctrl[i - 1], ctrl[i], (d - L[i - 1]) / (L[i] - L[i - 1] || 1)));
  }
  const nearN = (q) => {
    const near = surf.nearest(q[0], q[1], q[2], 6);
    let nx = 0, ny = 0, nz = 0, h = 0, f = 0;
    for (const { p, d } of near) { const w = 1 / (d * d + 1e-4); nx += p.nx * w; ny += p.ny * w; nz += p.nz * w; h += ((q[0] - p.x) * p.nx + (q[1] - p.y) * p.ny + (q[2] - p.z) * p.nz) * w; f += w; }
    return { n: V.norm([nx, ny, nz]), h: h / f };
  };
  const norms = [];
  for (let it = 0; it < 3; it++) {
    for (let s = 0; s <= segs; s++) {
      const { n, h } = nearN(P[s]);
      P[s] = V.add(P[s], V.mul(n, margin - h));
      norms[s] = n;
    }
    for (let k = 0; k < smooth; k++) {
      const O = P.map((q) => q.slice());
      for (let s = 1; s < segs; s++) P[s] = [0, 1, 2].map((a) => (O[s - 1][a] + 2 * O[s][a] + O[s + 1][a]) / 4);
    }
  }
  let acc = 0;
  const base = part.pos.length / 3;
  for (let s = 0; s <= segs; s++) {
    if (s > 0) acc += V.len(V.sub(P[s], P[s - 1]));
    const tan = V.norm(V.sub(P[Math.min(segs, s + 1)], P[Math.max(0, s - 1)]));
    const n = norms[s];
    const side = V.norm(V.cross(tan, n));
    const up = V.norm(V.cross(side, tan));
    const w = (widthAt ? widthAt(s / segs) : 1) * width;
    for (let c = 0; c <= cols; c++) {
      const f = c / cols - 0.5;
      const lift = crown * (1 - 4 * f * f);
      const q = [P[s][0] + side[0] * w * f + up[0] * lift, P[s][1] + side[1] * w * f + up[1] * lift, P[s][2] + side[2] * w * f + up[2] * lift];
      part.pos.push(q[0], q[1], q[2]);
      part.nrm.push(up[0], up[1], up[2]);
      // strip cells run along x: u along the strap (mirrored at the tile, so it never smears), v across
      if (rect) { const f = acc / tile, tri = Math.abs((f % 2) - 1); part.uv.push(rect[0] + rect[2] * tri, rect[1] + rect[3] * (c / cols)); }
      else part.uv.push(c / cols * w, acc);
      const sk = rigid ? rigid(q) : skin.skin(q[0], q[1], q[2], 4);
      part.jnt.push(...sk.j); part.wgt.push(...sk.w);
    }
  }
  const cc = cols + 1;
  for (let s = 0; s < segs; s++) for (let c = 0; c < cols; c++) {
    const a = base + s * cc + c, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, d, b, b, d, e);
  }
  return part;
}

/** A closed ring around a limb at height y (shin straps, puttee bands), hugging the surface. */
export function limbStrap(part, surf, skin, { cx, cz, y, h = 0.024, off = 0.004, cols = 16, rect, tilt = 0.0, tiltTh = 0, keep = null, thick = 0.004 } = {}) {
  const rows = [[-0.5, 0], [-0.32, thick], [0.32, thick], [0.5, 0]];
  const th0 = -Math.PI / 2;
  const profs = rows.map(([f]) => ring(surf, y + f * h, cols, { cx, cz, keep, dy: 0.04 }));
  // a strap cinches: flaps and folds stick out past it, it does not follow them
  for (let k = 0; k < profs.length; k++) {
    const p = profs[k], o = p.slice();
    for (let c = 0; c < cols; c++) p[c] = Math.min(o[(c - 1 + cols) % cols], o[c], o[(c + 1) % cols]);
    p[cols] = p[0];
  }
  const base = part.pos.length / 3;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c <= cols; c++) {
    const th = th0 + TAU * (c % cols) / cols;
    const rad = profs[r][c % cols] + off + rows[r][1];
    const yy = y + rows[r][0] * h + tilt * Math.cos(th - tiltTh);
    const p = [cx + Math.cos(th) * rad, yy, cz + Math.sin(th) * rad];
    const s = skin.skin(p[0], p[1], p[2], 4);
    part.pos.push(...p); part.nrm.push(0, 1, 0);
    part.uv.push(rect[0] + rect[2] * (c / cols), rect[1] + rect[3] * (r / (rows.length - 1)));
    part.jnt.push(...s.j); part.wgt.push(...s.w);
  }
  const cc = cols + 1;
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < cols; c++) {
    const a = base + r * cc + c, b = a + 1, d = a + cc, e = d + 1;
    // winding: bearing increases, y decreases per row index -> outward
    part.idx.push(a, b, d, b, e, d);
  }
  return part;
}

/** A box with bevelled silhouette (hex section along z-face): pouch bodies, buckle bars. */
export function boxInto(part, center, half, basis, rect, joint) {
  const [X, Y, Z] = basis;
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]],
  ];
  const world = (a) => [
    center[0] + X[0] * a[0] * half[0] + Y[0] * a[1] * half[1] + Z[0] * a[2] * half[2],
    center[1] + X[1] * a[0] * half[0] + Y[1] * a[1] * half[1] + Z[1] * a[2] * half[2],
    center[2] + X[2] * a[0] * half[0] + Y[2] * a[1] * half[1] + Z[2] * a[2] * half[2],
  ];
  const dir = (a) => V.norm([X[0] * a[0] + Y[0] * a[1] + Z[0] * a[2], X[1] * a[0] + Y[1] * a[1] + Z[1] * a[2], X[2] * a[0] + Y[2] * a[1] + Z[2] * a[2]]);
  for (const [n, u, v] of faces) {
    const o = part.pos.length / 3;
    const nw = dir(n);
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const q = world([n[0] + u[0] * s + v[0] * t, n[1] + u[1] * s + v[1] * t, n[2] + u[2] * s + v[2] * t]);
      part.pos.push(...q); part.nrm.push(...nw);
      part.uv.push(rect[0] + rect[2] * (s + 1) / 2, rect[1] + rect[3] * (t + 1) / 2);
      part.jnt.push(joint, 0, 0, 0); part.wgt.push(1, 0, 0, 0);
    }
    part.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  return part;
}

/**
 * A cloth or plate draped between two loops of points: rows from `inner` to `outer`
 * (same length), each sample pushed `margin` above `surf` (three relaxations), so
 * it lies over whatever is there. `uvOf(r, c)` gives the uv, `skinOf(p)` the skin.
 */
export function drapeInto(part, surf, inner, outer, { rows = 4, margin = 0.008, uvOf, skinOf, closed = false, marginAt = null } = {}) {
  const cols = inner.length - 1;
  const base = part.pos.length / 3;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      let p = V.lerp(inner[c], outer[c], t);
      for (let it = 0; it < 3; it++) {
        const near = surf.nearest(p[0], p[1], p[2], 5);
        let nx = 0, ny = 0, nz = 0, h = 0, f = 0;
        for (const { p: q, d } of near) { const w = 1 / (d * d + 1e-4); nx += q.nx * w; ny += q.ny * w; nz += q.nz * w; h += ((p[0] - q.x) * q.nx + (p[1] - q.y) * q.ny + (p[2] - q.z) * q.nz) * w; f += w; }
        const n = V.norm([nx, ny, nz]);
        const m = marginAt ? marginAt(t, c / cols) : margin;
        const lift = m - h / f;
        if (lift > 0) p = V.add(p, V.mul(n, lift));
      }
      const uv = uvOf(t, c / cols);
      const sk = skinOf(p);
      part.pos.push(p[0], p[1], p[2]); part.nrm.push(0, 1, 0); part.uv.push(uv[0], uv[1]);
      part.jnt.push(...sk.j); part.wgt.push(...sk.w);
    }
  }
  const cc = cols + 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = base + r * cc + c, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, d, b, b, d, e);
  }
  void closed;
  return part;
}

/** Skin of a rigid piece: every vertex on one joint. */
export const rigid = (j) => () => ({ j: [j, 0, 0, 0], w: [1, 0, 0, 0] });

export { emptyPart };
export const fieldOf = (parts, cell) => new Field(parts, cell);
