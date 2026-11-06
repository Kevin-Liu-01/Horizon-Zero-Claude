/**
 * CALIMA — armory W1: the sash's knot and tails as cloth (Pan Whites I; bible §3.9 "undyed linen,
 * left-hip knot + dyn_sashEnd"). They were two flat 3-column strips and a ball: at the left hip, in
 * every side and back view, they read as planks. Now:
 *
 *   sashTail(P, joints, opts)   a hanging tail on a smooth path: two faces a thread apart with real
 *                               edges, lengthwise pleats gathered at the knot and easing out down
 *                               the tail, a slight twist, the end cut on the bias
 *   sashKnot(c, frame, opts)    the knot: the band wrapped round itself (a pillowed ring) and two ears
 *                               (flat loops of the band), every face of it cloth
 *
 * Both return { pos, nrm, uv, jnt, wgt, idx } (face.mjs's geo shape), uv inside `rect` (the sash
 * trim cell: u along the cloth, v across it, so the cell's rolled hems run down the tails' edges).
 * Node only, deterministic.
 */
import { V } from './part.mjs';

const TAU = Math.PI * 2;
const geo = () => ({ pos: [], nrm: [], uv: [], jnt: [], wgt: [], idx: [] });

/** Catmull-Rom through P at u in [0, 1]: { p, t, seg, f } (seg / f index P's spans for the chain's weights). */
function curve(P) {
  const n = P.length - 1;
  const at = (u) => {
    const x = Math.min(0.999999, Math.max(0, u)) * n, i = Math.floor(x), f = x - i;
    const p0 = P[Math.max(0, i - 1)], a = P[i], b = P[i + 1], p3 = P[Math.min(n, i + 2)];
    const f2 = f * f, f3 = f2 * f;
    const p = [0, 1, 2].map((c) => 0.5 * (2 * a[c] + (-p0[c] + b[c]) * f + (2 * p0[c] - 5 * a[c] + 4 * b[c] - p3[c]) * f2 + (-p0[c] + 3 * a[c] - 3 * b[c] + p3[c]) * f3));
    const t = V.norm([0, 1, 2].map((c) => 0.5 * ((-p0[c] + b[c]) + 2 * (2 * p0[c] - 5 * a[c] + 4 * b[c] - p3[c]) * f + 3 * (-p0[c] + 3 * a[c] - 3 * b[c] + p3[c]) * f2)));
    return { p, t, seg: i, f };
  };
  return { at };
}

/** Area-weighted vertex normals, oriented to agree with `hint(i)` where given. */
function normals(g) {
  const n = g.pos.length / 3, N = new Float64Array(n * 3);
  for (let t = 0; t < g.idx.length; t += 3) {
    const [a, b, c] = [g.idx[t], g.idx[t + 1], g.idx[t + 2]];
    const A = g.pos.slice(a * 3, a * 3 + 3), B = g.pos.slice(b * 3, b * 3 + 3), C = g.pos.slice(c * 3, c * 3 + 3);
    const cr = V.cross(V.sub(B, A), V.sub(C, A));
    for (const q of [a, b, c]) { N[q * 3] += cr[0]; N[q * 3 + 1] += cr[1]; N[q * 3 + 2] += cr[2]; }
  }
  for (let i = 0; i < n; i++) { const v = V.norm([N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]); g.nrm[i * 3] = v[0]; g.nrm[i * 3 + 1] = v[1]; g.nrm[i * 3 + 2] = v[2]; }
}

function quad(g, a, b, c, d, flip) { if (flip) g.idx.push(a, c, b, b, c, d); else g.idx.push(a, b, c, b, d, c); }

/**
 * A hanging tail. `P` its path (>= 3 points, top first), `joints` the chain it rides (one per span of P,
 * the last repeated), `side` her tangent at the knot, `out` away from the skirt.
 */
export function sashTail(P, joints, { along = 10, across = 6, width = () => 0.05, thick = 0.0032, pleats = 2, pleat = (u) => 0.007 * (1 - u) ** 1.5, twist = 0.35, endCut = 0.014, side, out, rect, uLen = 0.5, u0 = 0 } = {}) {
  const g = geo(), C = curve(P);
  const rows = [];
  for (let a = 0; a <= along; a++) {
    const u = a / along;
    const { p, t, seg, f } = C.at(u);
    let sd = V.norm(V.sub(side, V.mul(t, V.dot(side, t))));
    let nn = V.norm(V.cross(sd, t));
    if (V.dot(nn, out) < 0) nn = V.mul(nn, -1);
    // a quarter of a turn's twist down the tail: the cloth turns as it hangs
    const tw = twist * u * u, c = Math.cos(tw), s = Math.sin(tw);
    const sd2 = V.add(V.mul(sd, c), V.mul(nn, s)), nn2 = V.add(V.mul(nn, c), V.mul(sd, -s));
    const hw = width(u) * 0.5;
    const j0 = joints[Math.min(seg, joints.length - 1)], j1 = joints[Math.min(seg + 1, joints.length - 1)];
    const wb = seg + 1 >= joints.length ? 0 : f;
    const row = [];
    for (let k = 0; k <= across; k++) {
      const x = (k / across) * 2 - 1;
      // the pleats: lengthwise folds, gathered at the knot, easing out; the edges curl a little toward her
      // (outward only: a valley never dips back toward the skirt it hangs over)
      const pl = pleat(u) * (0.5 + 0.5 * Math.cos(Math.PI * pleats * x));
      const curl = -0.08 * hw * x * x * x * x;
      // the end cut on the bias
      const cut = a === along ? endCut * x : 0;
      const q = V.add(V.add(V.add(p, V.mul(sd2, x * hw)), V.mul(nn2, pl + curl)), V.mul(t, cut));
      row.push({ q, n: nn2, uv: [rect[0] + rect[2] * (u0 + u * uLen), rect[1] + rect[3] * (0.04 + 0.92 * (k / across))], j: [j0, j1, 0, 0], w: [1 - wb, wb, 0, 0] });
    }
    rows.push(row);
  }
  // two faces a thread apart, their long edges and the cut end closed: the cloth has an edge
  const face = (sgn) => {
    const base = g.pos.length / 3;
    for (const row of rows) for (const v of row) {
      g.pos.push(...V.add(v.q, V.mul(v.n, sgn * thick * 0.5))); g.nrm.push(0, 0, 0); g.uv.push(...v.uv); g.jnt.push(...v.j); g.wgt.push(...v.w);
    }
    return base;
  };
  const F = face(1), B = face(-1), W = across + 1;
  for (let a = 0; a < along; a++) for (let k = 0; k < across; k++) {
    const i = a * W + k;
    quad(g, F + i, F + i + 1, F + i + W, F + i + W + 1, false);
    quad(g, B + i, B + i + 1, B + i + W, B + i + W + 1, true);
  }
  for (let a = 0; a < along; a++) {
    for (const k of [0, across]) {
      const i = a * W + k;
      quad(g, F + i, F + i + W, B + i, B + i + W, k === 0);
    }
  }
  for (let k = 0; k < across; k++) { const i = along * W + k; quad(g, F + i, F + i + 1, B + i, B + i + 1, true); }
  normals(g);
  return g;
}

/**
 * The knot at `c` (the band's top on the hip): `frame` = { side, up, out } (her tangent, up, away from her).
 * A wrapped ring of the band round the tails' top, pillowed, and two flat ears out to either side.
 */
export function sashKnot(c, { side, up, out }, { joint, rect, ringW = 0.034, rx = 0.03, rz = 0.017, ear = 0.036, earW = 0.024 } = {}) {
  const g = geo();
  const push = (q, uv) => { g.pos.push(...q); g.nrm.push(0, 0, 0); g.uv.push(...uv); g.jnt.push(joint, 0, 0, 0); g.wgt.push(1, 0, 0, 0); return g.pos.length / 3 - 1; };
  // the wrap: a ring round `up`, its section a pillow (fuller in the middle of its width)
  const SEG = 14, ROWS = 4;
  const base = g.pos.length / 3;
  for (let r = 0; r <= ROWS; r++) {
    const v = r / ROWS, hy = (v - 0.5) * ringW, pil = 1 - 0.28 * (2 * v - 1) ** 2;
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * TAU;
      const q = V.add(V.add(V.add(c, V.mul(up, hy)), V.mul(side, Math.cos(a) * rx * pil)), V.mul(out, Math.sin(a) * rz * pil + rz * 0.35));
      push(q, [rect[0] + rect[2] * (0.62 + 0.3 * (s / SEG)), rect[1] + rect[3] * (0.08 + 0.84 * v)]);
    }
  }
  for (let r = 0; r < ROWS; r++) for (let s = 0; s < SEG; s++) {
    const i = base + r * (SEG + 1) + s;
    quad(g, i, i + 1, i + SEG + 1, i + SEG + 2, true);
  }
  // the ears: a flat loop of the band each side, up and out from the wrap, its width facing out
  for (const sg of [-1, 1]) {
    const N = 12, eb = g.pos.length / 3;
    const dir = V.norm(V.add(V.mul(side, sg), V.mul(up, 0.55)));
    const perp = V.norm(V.cross(dir, out));
    for (let s = 0; s <= N; s++) {
      const a = (s / N) * Math.PI;                       // half a loop: from under the wrap out and back
      const along = Math.sin(a) * ear, lift = (1 - Math.cos(a)) * 0.5 * 0.016 - 0.008;
      const ctr = V.add(V.add(V.add(c, V.mul(dir, rx * 0.6 + along)), V.mul(perp, lift)), V.mul(out, rz * 0.55));
      const w = earW * (0.75 + 0.25 * Math.sin(a));
      for (const k of [-1, 0, 1]) {
        // a loop of cloth is puffed open, not a blade: its middle stands 6 mm off its edges
        const q = V.add(V.add(ctr, V.mul(out, k * w * 0.5)), V.mul(perp, 0.006 * (1 - k * k) * Math.sin(a)));
        push(q, [rect[0] + rect[2] * (0.08 + 0.4 * (s / N)), rect[1] + rect[3] * (0.5 + 0.44 * k)]);
      }
    }
    for (let s = 0; s < N; s++) for (let k = 0; k < 2; k++) { const i = eb + s * 3 + k; quad(g, i, i + 1, i + 3, i + 4, sg > 0); }
    // its other face, a thread inside
    const eb2 = g.pos.length / 3;
    for (let i = 0; i < (N + 1) * 3; i++) { const k = (i % 3) - 1, s2 = Math.floor(i / 3); push(V.add(g.pos.slice((eb + i) * 3, (eb + i) * 3 + 3), V.mul(perp, -0.0028 - 0.012 * (1 - k * k) * Math.sin((s2 / N) * Math.PI))), g.uv.slice((eb + i) * 2, (eb + i) * 2 + 2)); }
    for (let s = 0; s < N; s++) for (let k = 0; k < 2; k++) { const i = eb2 + s * 3 + k; quad(g, i, i + 1, i + 3, i + 4, sg < 0); }
  }
  normals(g);
  return g;
}
