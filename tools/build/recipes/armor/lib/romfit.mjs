/**
 * CALIMA — fit a skinned outfit to a range of motion (armory W1).
 *
 * The weights a garment gets from the body are right in bind and wrong at the end
 * of a sprint: an edge whose two ends follow different bones opens, a sleeve that
 * lies 1 cm off the arm goes inside it when the elbow bends. Both are read here
 * off the poses the game plays (armor/rom-poses.json, bone matrices dumped from the
 * running animator), and both are fixed the way a rigger would:
 *
 *   relax  the two ends of an edge that opens too far are blended toward each other's
 *          weights, only there, a little at a time, so the correction spreads no further
 *          than it has to;
 *   ease   where a vertex goes under the skin in some pose, the cloth gets that much
 *          room in bind, along the body's normal. The room is a soft field and every
 *          layer in it moves together, so nothing changes its order (a strap stays on
 *          the cloth); stiff little pieces move as one.
 *
 * It runs last, after the atlas is laid out: it moves no UV and adds no vertex.
 */
import { readFileSync } from 'node:fs';

const ROM = () => JSON.parse(readFileSync(new URL('../rom-poses.json', import.meta.url), 'utf8'));

const key3 = (x, y, z) => ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);

function mul4x3(a, b, off) { // a: 12 numbers (affine, column major, no bottom row) * b: 16 at off
  const o = new Float64Array(12);
  for (let c = 0; c < 4; c++) {
    const b0 = b[off + c * 4], b1 = b[off + c * 4 + 1], b2 = b[off + c * 4 + 2], b3 = b[off + c * 4 + 3];
    o[c * 3] = a[0] * b0 + a[3] * b1 + a[6] * b2 + a[9] * b3;
    o[c * 3 + 1] = a[1] * b0 + a[4] * b1 + a[7] * b2 + a[10] * b3;
    o[c * 3 + 2] = a[2] * b0 + a[5] * b1 + a[8] * b2 + a[11] * b3;
  }
  return o;
}

function posed(part, M, out) {
  const { pos, jnt, wgt } = part;
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt[i * 4 + k];
      if (w <= 0) continue;
      const m = M[jnt[i * 4 + k]];
      if (!m) continue;
      ox += w * (m[0] * x + m[3] * y + m[6] * z + m[9]);
      oy += w * (m[1] * x + m[4] * y + m[7] * z + m[10]);
      oz += w * (m[2] * x + m[5] * y + m[8] * z + m[11]);
    }
    out[i * 3] = ox; out[i * 3 + 1] = oy; out[i * 3 + 2] = oz;
  }
  return out;
}

function vertexNormals(P, idx, n, N = new Float64Array(n * 3)) {
  N.fill(0);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
    N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
    N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
  return N;
}

/** Nearest-three signed height over a posed surface: the measure the matrix gate reads. */
class Grid {
  constructor(P, N, n, cell = 0.05) {
    this.P = P; this.N = N; this.cell = cell; this.m = new Map();
    for (let i = 0; i < n; i++) {
      const k = key3(Math.floor(P[i * 3] / cell), Math.floor(P[i * 3 + 1] / cell), Math.floor(P[i * 3 + 2] / cell));
      let a = this.m.get(k);
      if (!a) { a = []; this.m.set(k, a); }
      a.push(i);
    }
  }

  height(x, y, z) {
    const { cell, P, N, m } = this;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let d0 = 1e9, d1 = 1e9, d2 = 1e9, i0 = -1, i1 = -1, i2 = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const L = m.get(key3(cx + a, cy + b, cz + c));
      if (!L) continue;
      for (let q = 0; q < L.length; q++) {
        const i = L[q];
        const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2;
        if (d < d2) {
          if (d < d0) { d2 = d1; i2 = i1; d1 = d0; i1 = i0; d0 = d; i0 = i; }
          else if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
          else { d2 = d; i2 = i; }
        }
      }
    }
    if (i0 < 0) return null;
    let h = 0, f = 0;
    for (const [d, i] of [[d0, i0], [d1, i1], [d2, i2]]) {
      if (i < 0) continue;
      const w = 1 / (d + 1e-5);
      h += ((x - P[i * 3]) * N[i * 3] + (y - P[i * 3 + 1]) * N[i * 3 + 1] + (z - P[i * 3 + 2]) * N[i * 3 + 2]) * w;
      f += w;
    }
    return { h: h / f, dist: Math.sqrt(d0), i: i0 };
  }
}

function weldOf(part) {
  const { pos } = part;
  const n = pos.length / 3, ids = new Map(), weld = new Int32Array(n), members = [];
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    let o = ids.get(k);
    if (o == null) { o = members.length; ids.set(k, o); members.push([]); }
    weld[i] = o; members[o].push(i);
  }
  return { weld, members };
}

function edgesOf(part, weld) {
  const seen = new Set(), E = [];
  const { idx } = part;
  const M = idx.length * 3 + 8;
  for (let t = 0; t < idx.length; t += 3) {
    for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
      const wa = weld[a], wb = weld[b];
      if (wa === wb) continue;
      const k = wa < wb ? wa * M + wb : wb * M + wa;
      if (seen.has(k)) continue;
      seen.add(k);
      E.push(a, b);
    }
  }
  return E;
}

/**
 * @param parts every part of the finished outfit (mutated: pos, jnt, wgt)
 * @param base  { doc, bodyPart }
 * @returns a small report, per pass
 */
export function romFit(parts, base, {
  target = 1.46, targetShort = 1.34, shortL = 0.012, relaxIts = 14,
  easeIts = 6, deepTo = -0.0022, slack = 0.0014, radius = 0.032, maxPush = 0.014, giveUp = 0.016,
  skip = new Set(['hat']), stiff = new Set(['buckle', 'tongue', 'slider', 'clasp', 'tab', 'scutes']), rom = null,
} = {}) {
  const R = rom || ROM();
  const skin = base.doc.getRoot().listSkins()[0];
  const jn = skin.listJoints().map((j) => j.getName());
  const ibm = skin.getInverseBindMatrices().getArray();
  const nameIdx = new Map(R.names.map((n, i) => [n, i]));
  const S = R.scale ?? 1;
  const poses = R.poses.map((p) => jn.map((n, j) => {
    const i = nameIdx.get(n);
    return i == null ? null : mul4x3(p.rows[i], ibm, j * 16);
  }));
  const soft = parts.filter((p) => !skip.has(p.slot) && p.pos.length);
  const info = soft.map((p) => {
    const { weld, members } = weldOf(p);
    const n = p.pos.length / 3;
    return { p, weld, members, n, E: edgesOf(p, weld), Q: new Float64Array(n * 3) };
  });

  // ---- relax
  const relax = (its) => {
    let worst = 0, last = 0;
    for (let it = 0; it < its; it++) {
      worst = 0; last = 0;
      for (const f of info) {
        const { p, E, members, weld, Q } = f;
        const pos = p.pos;
        const m = E.length / 2;
        const sMax = new Float64Array(m), L = new Float64Array(m);
        for (let e = 0; e < m; e++) { const a = E[e * 2], b = E[e * 2 + 1]; L[e] = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]) * S; }
        for (const M of poses) {
          posed(p, M, Q);
          for (let e = 0; e < m; e++) {
            if (L[e] <= 0.0018) continue;
            const a = E[e * 2], b = E[e * 2 + 1];
            const s = Math.hypot(Q[a * 3] - Q[b * 3], Q[a * 3 + 1] - Q[b * 3 + 1], Q[a * 3 + 2] - Q[b * 3 + 2]) / L[e];
            if (s > sMax[e]) sMax[e] = s;
          }
        }
        const moves = new Map();
        for (let e = 0; e < m; e++) {
          if (sMax[e] > worst) worst = sMax[e];
          const t = L[e] < shortL ? targetShort : target;
          if (sMax[e] <= t) continue;
          last++;
          const a = weld[E[e * 2]], b = weld[E[e * 2 + 1]];
          const k = Math.min(0.5, 0.08 + 0.7 * (sMax[e] - t) / (sMax[e] - 1));
          (moves.get(a) || moves.set(a, []).get(a)).push(b, k);
          (moves.get(b) || moves.set(b, []).get(b)).push(a, k);
        }
        if (!moves.size) continue;
        const W = new Map();
        const wOf = (o) => {
          let w = W.get(o);
          if (w) return w;
          w = new Map();
          const i = members[o][0];
          for (let c = 0; c < 4; c++) if (p.wgt[i * 4 + c] > 0) w.set(p.jnt[i * 4 + c], (w.get(p.jnt[i * 4 + c]) || 0) + p.wgt[i * 4 + c]);
          W.set(o, w);
          return w;
        };
        const out = [];
        for (const [o, list] of moves) {
          const self = wOf(o);
          const sum = new Map();
          let kTot = 0;
          for (let q = 0; q < list.length; q += 2) {
            const k = list[q + 1];
            kTot += k;
            for (const [j, v] of wOf(list[q])) sum.set(j, (sum.get(j) || 0) + v * k);
          }
          const K = Math.min(0.6, kTot);
          const nw = new Map();
          for (const [j, v] of self) nw.set(j, v * (1 - K));
          for (const [j, v] of sum) nw.set(j, (nw.get(j) || 0) + (v / kTot) * K);
          out.push([o, nw]);
        }
        for (const [o, nw] of out) {
          const top = [...nw.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, 4);
          const s = top.reduce((a2, e2) => a2 + e2[1], 0) || 1;
          for (const i of members[o]) for (let c = 0; c < 4; c++) { p.jnt[i * 4 + c] = top[c] ? top[c][0] : 0; p.wgt[i * 4 + c] = top[c] ? top[c][1] / s : 0; }
        }
      }
      if (!last) break;
    }
    return { worst: +worst.toFixed(3), over: last };
  };

  // ---- ease
  const body = base.bodyPart;
  const bn = body.pos.length / 3;
  const BQ = new Float64Array(bn * 3), BN = new Float64Array(bn * 3);
  const bind3 = new Float64Array(body.pos);
  const bindN = vertexNormals(bind3, body.idx, bn);
  const bindG = new Grid(bind3, bindN, bn, 0.06);
  const pushed = new Map(info.map((f) => [f.p, new Float64Array(f.n)]));
  const ease = () => {
    const pts = new Map();
    const cell = radius;
    let count = 0, worstCount = 0;
    const need = info.map((f) => new Float64Array(f.n));
    for (const M of poses) {
      posed(body, M, BQ);
      vertexNormals(BQ, body.idx, bn, BN);
      const G = new Grid(BQ, BN, bn);
      let c = 0;
      info.forEach((f, fi) => {
        posed(f.p, M, f.Q);
        for (let i = 0; i < f.n; i++) {
          const q = G.height(f.Q[i * 3], f.Q[i * 3 + 1], f.Q[i * 3 + 2]);
          if (q && q.dist < 0.05 && q.h < deepTo) { c++; const d = deepTo - q.h + slack; if (d > need[fi][i]) need[fi][i] = d; }
        }
      });
      if (c > worstCount) worstCount = c;
    }
    info.forEach((f, fi) => {
      for (let i = 0; i < f.n; i++) {
        if (!need[fi][i]) continue;
        // deeper than cloth can ease: a crease two limbs share. Puffing the sleeve would not get it out
        if (need[fi][i] > giveUp) continue;
        count++;
        const k = key3(Math.floor(f.p.pos[i * 3] / cell), Math.floor(f.p.pos[i * 3 + 1] / cell), Math.floor(f.p.pos[i * 3 + 2] / cell));
        let a = pts.get(k);
        if (!a) { a = []; pts.set(k, a); }
        a.push(f.p.pos[i * 3], f.p.pos[i * 3 + 1], f.p.pos[i * 3 + 2], need[fi][i]);
      }
    });
    if (!count) return { verts: 0, worstPose: 0 };
    for (const f of info) {
      const pos = f.p.pos, P = pushed.get(f.p);
      const off = new Float64Array(f.n);
      for (let i = 0; i < f.n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
        let o = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const L = pts.get(key3(cx + a, cy + b, cz + c));
          if (!L) continue;
          for (let q = 0; q < L.length; q += 4) {
            const d2 = (L[q] - x) ** 2 + (L[q + 1] - y) ** 2 + (L[q + 2] - z) ** 2;
            if (d2 >= radius * radius) continue;
            const t = 1 - d2 / (radius * radius);
            const v = L[q + 3] * t * t;
            if (v > o) o = v;
          }
        }
        off[i] = Math.min(o, maxPush - P[i]);
      }
      if (stiff.has(f.p.slot)) {
        // one body: the mean of what it was asked to move
        let s = 0;
        for (let i = 0; i < f.n; i++) s += off[i];
        off.fill(s / f.n);
      }
      for (let i = 0; i < f.n; i++) {
        if (off[i] <= 0) continue;
        const q = bindG.height(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        if (!q) continue;
        pos[i * 3] += bindN[q.i * 3] * off[i];
        pos[i * 3 + 1] += bindN[q.i * 3 + 1] * off[i];
        pos[i * 3 + 2] += bindN[q.i * 3 + 2] * off[i];
        P[i] += off[i];
      }
    }
    return { verts: count, worstPose: worstCount };
  };

  const log = [];
  log.push(['relax', relax(relaxIts)]);
  for (let i = 0; i < easeIts; i++) log.push(['ease', ease()]);
  log.push(['relax', relax(relaxIts)]);
  log.push(['ease', ease()]);
  log.push(['relax', relax(6)]);
  return log;
}
