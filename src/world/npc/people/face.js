import * as THREE from 'three';

/**
 * CALIMA · faces that are alive in dialogue (people; BUILD M1.5f; the same on Brea).
 *
 * No GLB carries a face rig (no jaw or eye joints, no morph targets), so one is built here, at load, from the shipped skin itself:
 *   - the eyes are the vertices on the skin's eye patch (the recipe's `r5Paint.layout.eyePatch`, the same rule
 *     tools/build/recipes/npc/faces.mjs reads); each eye's ball is a sphere fitted to them (the cornea dome left out);
 *   - the lids are the skin over each ball: per column across the eye, the opening is the band of the ball no skin covers;
 *   - the mouth is the lips' slit (the skin's open boundary under the nose) and its two corners.
 * From those, eleven relative morph targets on the near skin (FACE_TARGETS): a blink in two halves (the lids turn on the
 * ball's own axis; a straight line between open and shut would cut through the cornea), four jaw-and-lip shapes (AA open,
 * EE wide, OO round, FV the lower lip tucked), and the eyes' turn as exact rotation parts (sin and 1 - cos of yaw and pitch,
 * plus a vergence term), so any look inside the 25 deg cone is a true rotation of the ball about its centre.
 *
 * The world stands still while a dialogue card is open (main.js simulates only 'playing' and a few states), so a face is driven
 * from its own skin's onBeforeRender on real time, once a frame: blink every 3.2-5.8 s, the eyes on the other speaker inside
 * the cone with small saccades, the jaw and lips on the card's text at a reading cadence. A dark cavity (a small back-faced
 * ellipsoid on the Head joint) stands behind the lips while that face speaks, so a parted mouth is never a hole.
 *
 * ?shot films hold every face at rest (influences 0, cavity hidden) unless `faces.alive` is set: no accepted frame moves.
 */
export const FACE_TARGETS = ['blinkMid', 'blinkFull', 'jawAA', 'lipEE', 'lipOO', 'lipFV', 'yawS', 'yawC', 'pitchS', 'pitchC', 'verge'];
const T = Object.fromEntries(FACE_TARGETS.map((n, i) => [n, i]));
export const CONE = 25 * Math.PI / 180;
const D2R = Math.PI / 180;
/** Barycentric samples over a triangle (corners, edge middles, centre, inner points). */
const BARY = [[1, 0], [0, 1], [0, 0], [0.5, 0.5], [0.5, 0], [0, 0.5], [1 / 3, 1 / 3], [2 / 3, 1 / 6], [1 / 6, 2 / 3], [1 / 6, 1 / 6]];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ================================================================ the rig (pure: Node tests run it on the GLBs) */

/** Least-squares sphere through points (flat xyz array of the listed indices): { c: [x,y,z], R }. */
function fitSphere(P, list) {
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
  for (const i of list) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], r = [2 * x, 2 * y, 2 * z, 1], s = x * x + y * y + z * z;
    for (let p = 0; p < 4; p++) { b[p] += r[p] * s; for (let q = 0; q < 4; q++) A[p][q] += r[p] * r[q]; }
  }
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 4; i++) {
    let m = i;
    for (let k = i + 1; k < 4; k++) if (Math.abs(M[k][i]) > Math.abs(M[m][i])) m = k;
    [M[i], M[m]] = [M[m], M[i]];
    for (let k = 0; k < 4; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 5; j++) M[k][j] -= f * M[i][j]; }
  }
  const s = M.map((r, i) => r[4] / r[i]);
  const c = [s[0], s[1], s[2]];
  return { c, R: Math.sqrt(Math.max(1e-12, s[3] + c[0] * c[0] + c[1] * c[1] + c[2] * c[2])) };
}

/** The ball's radius toward a point (the dome's profile by angle off its axis). */
function ballR(E, x, y, z) {
  const dx = x - E.c[0], dy = y - E.c[1], dz = z - E.c[2], r = Math.hypot(dx, dy, dz) || 1e-9;
  const a = Math.acos(Math.max(-1, Math.min(1, (dx * E.axis[0] + dy * E.axis[1] + dz * E.axis[2]) / r))) / D2R;
  return E.prof[Math.min(45, Math.floor(a / 2))];
}

/** The skin's triangles (no eye-patch vertex): a flat index list. */
export function eyeTriangles(P, index, eye) {
  const out = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (eye[a] || eye[b] || eye[c]) continue;
    out.push(a, b, c);
  }
  return out;
}

/**
 * The eye's opening seen from the front: per 1 mm column across the ball, the band of angles (about its horizontal axis,
 * 0 straight ahead) where a ray from the ball's surface toward +z meets no skin triangle. { b0, b1 } the columns (mm) of the
 * run through the middle, `up`/`lo` column -> the band's top and bottom (rad, median over 5 columns), `openMm` the band's
 * height at the middle column. `P` may be a deformed copy (the tests cast it on a shut blink).
 */
export function opening(P, tris, E, K = 1) {
  const near = [];
  for (let t = 0; t < tris.length; t += 3) {
    let ok = false, front = false;
    for (let k = 0; k < 3; k++) {
      const v = tris[t + k];
      if (Math.abs(P[v * 3] - E.c[0]) < 0.034 * K && Math.abs(P[v * 3 + 1] - E.c[1]) < 0.034 * K) ok = true;
      if (P[v * 3 + 2] > E.c[2] - 0.004) front = true;
    }
    if (ok && front) near.push(tris[t], tris[t + 1], tris[t + 2]);
  }
  const covered = (px, py, pz) => {
    for (let t = 0; t < near.length; t += 3) {
      const a = near[t] * 3, b = near[t + 1] * 3, c = near[t + 2] * 3;
      const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-14) continue;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
      if (l1 < 0 || l1 > 1) continue;
      const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
      if (l2 < 0 || l1 + l2 > 1) continue;
      const z = l1 * P[a + 2] + l2 * P[b + 2] + (1 - l1 - l2) * P[c + 2];
      if (z > pz + 2e-5) return true;
    }
    return false;
  };
  const rawUp = new Map(), rawLo = new Map();
  const W = Math.floor(E.R * 1000) - 2;
  for (let b = -W; b <= W; b++) {
    const u = b / 1000, rr = Math.sqrt(Math.max(0, E.R * E.R - u * u));
    let best = null, run = null;
    for (let d = -65; d <= 66; d++) {
      let vis = false;
      if (d <= 65) {
        const th = d * D2R;
        const dx = u, dy = rr * Math.sin(th), dz = rr * Math.cos(th);
        const r = ballR(E, E.c[0] + dx, E.c[1] + dy, E.c[2] + dz) / E.R;
        vis = !covered(E.c[0] + dx * r, E.c[1] + dy * r, E.c[2] + dz * r);
      }
      if (vis) { if (!run) run = [d, d]; else run[1] = d; }
      else if (run) {
        const score = (run[0] <= 0 && run[1] >= 0 ? 100 : 0) + run[1] - run[0];
        if (!best || score > best.score) best = { lo: run[0], up: run[1], score };
        run = null;
      }
    }
    if (best && best.up - best.lo >= 4) { rawUp.set(b, best.up * D2R); rawLo.set(b, best.lo * D2R); }
  }
  const bins = [...rawUp.keys()].sort((a, c) => a - c);
  if (bins.length < 6) return { error: 'no opening found', cols: bins.length };
  let b0 = null, b1 = null;
  { let s = bins[0], p = bins[0], best = null;
    for (let k = 1; k <= bins.length; k++) {
      const v = bins[k];
      if (v === p + 1) { p = v; continue; }
      const score = (s <= 0 && p >= 0 ? 1000 : 0) + p - s;
      if (!best || score > best[2]) best = [s, p, score];
      s = v; p = v;
    }
    [b0, b1] = best; }
  const med = (m, b) => {
    const vals = [];
    for (let d = -2; d <= 2; d++) { const k = b + d; if (k >= b0 && k <= b1 && m.has(k)) vals.push(m.get(k)); }
    vals.sort((a, c) => a - c); return vals[vals.length >> 1];
  };
  const up = new Map(), lo = new Map();
  for (let b = b0; b <= b1; b++) { up.set(b, med(rawUp, b)); lo.set(b, med(rawLo, b)); }
  const mid = Math.round((b0 + b1) / 2), rr = Math.sqrt(E.R * E.R - (mid / 1000) ** 2);
  return { b0, b1, up, lo, mid, openMm: +((Math.sin(up.get(mid)) - Math.sin(lo.get(mid))) * rr * 1000).toFixed(2) };
}

/**
 * Build the face rig on one skin. All positions are in its bind frame, in metres, bind axes (+x the person's left, +y up,
 * +z forward); the origin does not matter.
 *   P      Float32Array n*3          positions
 *   index  the triangle index
 *   eye    Uint8Array n               1 on the eye patch
 *   head   Uint8Array n               1 where the Head joint carries the vertex (>= 0.5)
 * Returns { targets: Float32Array[n*3] per FACE_TARGETS, eyes: [{ c, R, pole, axis }, ...] (left, right), lids: {...},
 * mouth: { corners, stomion, slit, cavity: { c, r } }, stats } or { error }.
 */
export function buildFaceRig(P0, index, eye, head) {
  const n = P0.length / 3;
  const targets = FACE_TARGETS.map(() => new Float32Array(n * 3));
  // the face's midline at x 0 (a quantised frame's origin need not be on it): the eyes' mean
  let x0 = 0, ne = 0;
  for (let i = 0; i < n; i++) if (eye[i]) { x0 += P0[i * 3]; ne++; }
  x0 = ne ? x0 / ne : 0;
  const P = Float32Array.from(P0);
  for (let i = 0; i < n; i++) P[i * 3] -= x0;
  // ---- the eyes
  const sides = [[], []];
  for (let i = 0; i < n; i++) if (eye[i]) sides[P[i * 3] > 0 ? 0 : 1].push(i);
  if (sides[0].length < 12 || sides[1].length < 12) return { error: `eye patch: ${sides[0].length}/${sides[1].length} vertices` };
  const eyes = sides.map((list) => {
    let fit = fitSphere(P, list);
    // the cornea dome stands proud of the ball: fit again without the front cap
    const back = list.filter((i) => {
      const dx = P[i * 3] - fit.c[0], dy = P[i * 3 + 1] - fit.c[1], dz = P[i * 3 + 2] - fit.c[2];
      return dz / Math.hypot(dx, dy, dz) < Math.cos(35 * D2R);
    });
    if (back.length >= 12) fit = fitSphere(P, back);
    let pole = list[0];
    for (const i of list) if (P[i * 3 + 2] > P[pole * 3 + 2]) pole = i;
    const ax = [P[pole * 3] - fit.c[0], P[pole * 3 + 1] - fit.c[1], P[pole * 3 + 2] - fit.c[2]];
    const al = Math.hypot(...ax);
    // the ball's radius by angle off its axis (2 deg bins): the dome a closing lid must clear. Sampled over the ball's own
    // triangles, not its vertices (a coarse ball leaves bins empty and the dome under-read: Mise's at 3288669)
    const prof = new Float32Array(46).fill(0);
    const inSide = new Set(list);
    const put = (x, y, z) => {
      const dx = x - fit.c[0], dy = y - fit.c[1], dz = z - fit.c[2], r = Math.hypot(dx, dy, dz);
      const a = Math.acos(Math.max(-1, Math.min(1, (dx * ax[0] + dy * ax[1] + dz * ax[2]) / (r * al)))) / D2R;
      const k = Math.min(45, Math.floor(a / 2));
      if (r > prof[k]) prof[k] = r;
    };
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      if (!inSide.has(a) || !inSide.has(b) || !inSide.has(c)) continue;
      for (const [wa, wb] of BARY) {
        const wc = 1 - wa - wb;
        put(P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc, P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc, P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc);
      }
    }
    for (const i of list) put(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    // an empty bin takes the larger of its nearest filled neighbours; nothing under the fitted ball
    for (let k = 0; k < 46; k++) {
      if (prof[k] > 0) continue;
      let lo = k - 1, hi = k + 1;
      while (lo >= 0 && !(prof[lo] > 0)) lo--;
      while (hi < 46 && !(prof[hi] > 0)) hi++;
      prof[k] = Math.max(lo >= 0 ? prof[lo] : 0, hi < 46 ? prof[hi] : 0);
    }
    for (let k = 0; k < 46; k++) if (prof[k] < fit.R) prof[k] = fit.R;
    return { c: fit.c, R: fit.R, pole, axis: ax.map((v) => v / al), prof, list };
  });
  const eyeY = (eyes[0].c[1] + eyes[1].c[1]) / 2, eyeZ = (eyes[0].c[2] + eyes[1].c[2]) / 2;
  const gap = Math.abs(eyes[0].c[0] - eyes[1].c[0]);
  const K = gap / 0.0692;   // proportion against the female pack's eyes

  // ---- eye turn: exact rotation parts per ball
  for (const [s, E] of eyes.entries()) {
    const sign = s === 0 ? -1 : 1;   // vergence turns each ball toward the nose
    for (const i of E.list) {
      const x = P[i * 3] - E.c[0], y = P[i * 3 + 1] - E.c[1], z = P[i * 3 + 2] - E.c[2], o = i * 3;
      targets[T.yawS][o] = z; targets[T.yawS][o + 2] = -x;
      targets[T.yawC][o] = -x; targets[T.yawC][o + 2] = -z;
      targets[T.pitchS][o + 1] = z; targets[T.pitchS][o + 2] = -y;
      targets[T.pitchC][o + 1] = -y; targets[T.pitchC][o + 2] = -z;
      targets[T.verge][o] = sign * z; targets[T.verge][o + 2] = -sign * x;
    }
  }

  // ---- lids: per eye, the opening is the band of the ball no skin covers, seen from the front (ray-cast per 1 mm column)
  const lids = [];
  const tris = eyeTriangles(P, index, eye);
  for (const E of eyes) {
    const op = opening(P, tris, E, K);
    if (op.error) { lids.push(op); continue; }
    const { b0, b1, up, lo } = op;
    const clampB = (u) => Math.min(b1, Math.max(b0, Math.round(u * 1000)));
    const thUp = (u) => up.get(clampB(u)), thLo = (u) => lo.get(clampB(u));
    const cand = [];
    for (let i = 0; i < n; i++) {
      if (eye[i] || !head[i]) continue;
      const u = P[i * 3] - E.c[0], y = P[i * 3 + 1] - E.c[1], z = P[i * 3 + 2] - E.c[2];
      if (Math.abs(u) > 0.028 * K || Math.abs(y) > 0.03 * K || z < -0.006) continue;
      cand.push(i);
    }
    let moved = 0, clamped = 0;
    for (const i of cand) {
      const u = P[i * 3] - E.c[0], y = P[i * 3 + 1] - E.c[1], z = P[i * 3 + 2] - E.c[2];
      const th = Math.atan2(y, z), rho = Math.hypot(y, z);
      const tu = thUp(u), tl = thLo(u), close = tl + 0.22 * (tu - tl), tm = (tu + tl) / 2;
      // across: full inside the corners, gone 6 mm past them
      const uu = u * 1000;
      const lat = uu < b0 ? 1 - smooth(0, 6, b0 - uu) : uu > b1 ? 1 - smooth(0, 6, uu - b1) : 1;
      if (lat <= 0) continue;
      let dth;
      // (the brows stay: nothing more than 11-19 mm over the ball's centre moves; ef3cdaf's shut lid pulled Ansel's brows down)
      if (th >= tm) dth = -(tu - close) * lat * (1 - smooth(tu + 10 * D2R, tu + 48 * D2R, th)) * (1 - smooth(0.011 * K, 0.019 * K, y));
      else dth = (close - tl) * lat * (1 - smooth(-(tl - 6 * D2R), -(tl - 30 * D2R), -th));
      if (Math.abs(dth) < 1e-5) continue;
      moved++;
      const exposed = Math.hypot(u, y, z) >= ballR(E, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) - 0.0003;
      for (const [ti, f] of [[T.blinkMid, 0.5], [T.blinkFull, 1]]) {
        const a = th + dth * f;
        let ny = Math.sin(a) * rho, nz = Math.cos(a) * rho, nx = u;
        if (exposed) {
          // held clear of the ball and its dome, never through them
          const need = ballR(E, nx + E.c[0], ny + E.c[1], nz + E.c[2]) + 0.00025, r = Math.hypot(nx, ny, nz);
          if (r < need) { const k = need / r; nx *= k; ny *= k; nz *= k; clamped++; }
        }
        const o = i * 3, D = targets[ti];
        D[o] = nx - u; D[o + 1] = ny - y; D[o + 2] = nz - z;
      }
    }
    const mid = Math.round((b0 + b1) / 2);
    lids.push({ cols: b1 - b0 + 1, corners: [b0, b1], mid, upDeg: +(thUp(mid / 1000) / D2R).toFixed(1), loDeg: +(thLo(mid / 1000) / D2R).toFixed(1),
      openMm: op.openMm, moved, clamped });
  }
  // ---- the mouth: the lips' slit is the open boundary under the nose
  const edges = new Map();
  const ix = index;
  const tri = ix.length / 3;
  for (let t = 0; t < tri; t++) for (let k = 0; k < 3; k++) {
    const a = ix[t * 3 + k], b = ix[t * 3 + (k + 1) % 3], key = a < b ? a * 4194304 + b : b * 4194304 + a;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  const slit = new Set();
  for (const [key, c] of edges) {
    if (c !== 1) continue;
    for (const v of [Math.floor(key / 4194304), key % 4194304]) {
      const x = P[v * 3], y = P[v * 3 + 1] - eyeY, z = P[v * 3 + 2] - eyeZ;
      if (!eye[v] && head[v] && Math.abs(x) < 0.034 * K && y < -0.045 * K && y > -0.11 * K && z > 0) slit.add(v);
    }
  }
  if (slit.size < 6) return { error: `lip slit: ${slit.size} boundary vertices`, eyes, lids };
  const S = [...slit];
  let st = S[0], cl = S[0], cr = S[0];
  for (const v of S) {
    if (Math.abs(P[v * 3]) < Math.abs(P[st * 3])) st = v;
    if (P[v * 3] > P[cl * 3]) cl = v;
    if (P[v * 3] < P[cr * 3]) cr = v;
  }
  const xc = (P[cl * 3] - P[cr * 3]) / 2;
  const sy = P[st * 3 + 1], sz = P[st * 3 + 2];
  const slitPts = S.map((v) => [Math.abs(P[v * 3]), P[v * 3 + 1]]).sort((a, b) => a[0] - b[0]);
  const ySlit = (ax) => {
    if (ax >= slitPts[slitPts.length - 1][0]) return slitPts[slitPts.length - 1][1];
    let best = slitPts[0], d = Infinity;
    for (const p of slitPts) { const e = Math.abs(p[0] - ax); if (e < d) { d = e; best = p; } }
    return best[1];
  };
  // a slit vertex is the lower lip's when its triangles lie below it
  const below = new Map();
  for (let t = 0; t < tri; t++) {
    const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2];
    if (!slit.has(a) && !slit.has(b) && !slit.has(c)) continue;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    for (const v of [a, b, c]) if (slit.has(v)) below.set(v, (below.get(v) || 0) + (cy < P[v * 3 + 1] ? 1 : -1));
  }
  // the jaw: its hinge in front of the ear; the mandible's lower border from the chin's foot to its angle
  const hinge = [0, sy + 0.029 * K, eyeZ - 0.072 * K];
  const menton = [sy - 0.047 * K, sz - 0.014 * K], gonion = [sy - 0.004 * K, eyeZ - 0.097 * K];   // (y, z)
  const bl = [gonion[0] - menton[0], gonion[1] - menton[1]], bL = Math.hypot(bl[0], bl[1]);
  const jawW = new Float32Array(n), lipW = new Float32Array(n);
  let lowerN = 0;
  for (let i = 0; i < n; i++) {
    if (eye[i] || !head[i]) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ax = Math.abs(x);
    if (ax > 0.08 * K || z < hinge[2] - 0.012 * K || y > sy + 0.03 * K || y < sy - 0.09 * K) continue;
    let lowSide;
    if (slit.has(i)) lowSide = (below.get(i) || 0) > 0 ? 1 : 0;
    else lowSide = y < ySlit(Math.min(ax, xc)) ? 1 : 0;
    const lateral = 1 - smooth(0.004 * K, 0.026 * K, ax - xc);   // past the corners the cheek takes a gradient instead
    const soft = 1 - smooth(-0.012 * K, 0.004 * K, y - ySlit(xc));
    let w = ax < xc - 0.002 ? lowSide : lowSide * lateral + soft * (1 - lateral);
    if (slit.has(i) && ax >= xc - 0.0025) w = 0.5;   // the corners are both lips'
    if (w <= 0) continue;
    // under the mandible's border the neck stays; behind the angle the ear does
    const dY = y - menton[0], dZ = z - menton[1];
    const under = (bl[1] * dY - bl[0] * dZ) / bL;   // > 0 below the border line, toward the neck
    w *= 1 - smooth(0, 0.024 * K, under);
    w *= smooth(gonion[1] - 0.006 * K, gonion[1] + 0.022 * K, z);
    if (w <= 0.001) continue;
    jawW[i] = w;
    if (w > 0.5) lowerN++;
  }
  // the lips: within reach of the slit, front of the face
  for (let i = 0; i < n; i++) {
    if (eye[i] || !head[i]) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const ex = Math.abs(x) / (xc + 0.008 * K), ey = (y - ySlit(Math.min(Math.abs(x), xc))) / (0.014 * K), ez = (sz - z) / (0.026 * K);
    const d = ex * ex + ey * ey + Math.max(0, ez) * Math.max(0, ez);
    if (d < 1) lipW[i] = 1 - d;
  }
  const rot = (D, i, ang, w) => {
    const y = P[i * 3 + 1] - hinge[1], z = P[i * 3 + 2] - hinge[2];
    const c = Math.cos(ang), s = Math.sin(ang);
    // opening turns the chin down and back: about +x, the face's front going down
    D[i * 3 + 1] += w * (y * c - z * s - y);
    D[i * 3 + 2] += w * (y * s + z * c - z);
  };
  for (let i = 0; i < n; i++) {
    const w = jawW[i], l = lipW[i];
    if (!w && !l) continue;
    const x = P[i * 3], y = P[i * 3 + 1], ax = Math.abs(x), sgn = Math.sign(x) || 1;
    const upper = l > 0 && w < 0.5 ? 1 : 0;
    const corner = Math.exp(-((ax - xc) ** 2 + (y - ySlit(xc)) ** 2) / (2 * (0.007 * K) ** 2));
    const centre = Math.exp(-(x * x) / (2 * (0.012 * K) ** 2));
    // AA: the jaw open 5.5 deg (about 10 mm between the lips), the upper lip lifts a touch at its middle
    if (w) rot(targets[T.jawAA], i, 5.5 * D2R, w);
    if (upper) targets[T.jawAA][i * 3 + 1] += 0.0009 * K * l * centre;
    // EE: the jaw 2.5 deg, the corners drawn out and back, the upper lip up a little
    if (w) rot(targets[T.lipEE], i, 2.5 * D2R, w);
    targets[T.lipEE][i * 3] += sgn * 0.0028 * K * corner;
    targets[T.lipEE][i * 3 + 2] -= 0.0014 * K * corner;
    if (upper) targets[T.lipEE][i * 3 + 1] += 0.0005 * K * l * centre;
    // OO: the jaw 3.5 deg, the lips drawn in toward the middle and pushed forward
    if (w) rot(targets[T.lipOO], i, 3.5 * D2R, w);
    targets[T.lipOO][i * 3] -= x * 0.3 * l;
    targets[T.lipOO][i * 3 + 2] += 0.0032 * K * l * (0.4 + 0.6 * centre);
    // FV: the lower lip up and in under the upper teeth
    if (w) rot(targets[T.lipFV], i, 1 * D2R, w);
    if (!upper && l) { targets[T.lipFV][i * 3 + 1] += 0.0016 * K * l * w; targets[T.lipFV][i * 3 + 2] -= 0.0022 * K * l * w; }
  }
  const mouth = {
    stomion: st, corners: [cl, cr], xc, slitN: S.length, lowerN,
    cavity: { c: [0, sy - 0.003 * K, sz - 0.022 * K], r: [xc * 0.85, 0.012 * K, 0.019 * K] },
    // the measured pair: a lower-lip vertex at the middle and the upper lip above it
    lowerLip: S.filter((v) => (below.get(v) || 0) > 0).sort((a, b) => Math.abs(P[a * 3]) - Math.abs(P[b * 3]))[0] ?? -1,
    upperLip: S.filter((v) => (below.get(v) || 0) <= 0).sort((a, b) => Math.abs(P[a * 3]) - Math.abs(P[b * 3]))[0] ?? -1,
  };
  return {
    targets, eyes: eyes.map((E) => ({ c: [E.c[0] + x0, E.c[1], E.c[2]], R: E.R, pole: E.pole, axis: E.axis, prof: E.prof, n: E.list.length })), lids,
    mouth: { ...mouth, cavity: { ...mouth.cavity, c: [mouth.cavity.c[0] + x0, mouth.cavity.c[1], mouth.cavity.c[2]] } },
    stats: { n, eyeGapMm: +(gap * 1000).toFixed(2), K: +K.toFixed(3), x0Mm: +(x0 * 1000).toFixed(2) },
  };
}

/* ================================================================ text cadence */

const RATE = 13.5;   // characters a second, spaces counted (a measured reading pace for these cards)
/** One character's mouth: [AA, EE, OO, FV]; m/b/p shut the lips (all 0). */
function shapeOf(ch) {
  const c = ch.toLowerCase();
  if (c === 'a') return [0.85, 0.1, 0, 0];
  if (c === 'e' || c === 'i' || c === 'y') return [0.3, 0.7, 0, 0];
  if (c === 'o') return [0.35, 0, 0.8, 0];
  if (c === 'u' || c === 'w') return [0.15, 0, 0.9, 0];
  if (c === 'f' || c === 'v') return [0.05, 0, 0, 0.9];
  if (c === 'm' || c === 'b' || c === 'p') return [0, 0, 0, 0];
  if (/[0-9]/.test(c)) return [0.55, 0.25, 0.1, 0];
  if (/[a-z]/.test(c)) return [0.28, 0.18, 0, 0];
  return null;
}

/**
 * A card's text as a mouth track: keys { t, w: [AA, EE, OO, FV] } at the reading cadence, a short close at each space, a
 * pause at a comma (0.22 s) and a longer one at a full stop, question or exclamation (0.4 s). `duration` is when it stops.
 */
export function speechTrack(text) {
  const keys = [];
  let t = 0.08;
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') { keys.push({ t, w: [0.08, 0.04, 0, 0] }); t += 1 / RATE; continue; }
    if (ch === ',' || ch === ';' || ch === ':' || ch === '—' || ch === '-') { keys.push({ t, w: [0, 0, 0, 0] }); t += ch === '-' ? 0.04 : 0.22; continue; }
    if (ch === '.' || ch === '?' || ch === '!') {
      keys.push({ t, w: [0, 0, 0, 0] });
      // "0.4" is a number, not a stop
      t += /[0-9]/.test(s[i + 1] || '') ? 0.05 : 0.4;
      continue;
    }
    const w = shapeOf(ch);
    if (!w) continue;
    keys.push({ t, w });
    t += 1 / RATE;
  }
  keys.push({ t, w: [0, 0, 0, 0] });
  return { keys, duration: t };
}

/** The track's shape at time `t` (linear between keys); writes into `out` (length 4). */
export function trackAt(track, t, out) {
  const K = track.keys;
  out[0] = out[1] = out[2] = out[3] = 0;
  if (!K.length || t < 0 || t >= track.duration) return out;
  let lo = 0, hi = K.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (K[m].t <= t) lo = m; else hi = m; }
  const a = K[lo], b = K[hi], f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  for (let k = 0; k < 4; k++) out[k] = a.w[k] + (b.w[k] - a.w[k]) * f;
  return out;
}

/* ================================================================ install on a live skin */

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

/** The eye patch rule of faces.mjs on a three geometry: its uv through the base map's transform, inside any patch. */
function eyeMaskOf(geo, map, patches, head) {
  const uv = geo.getAttribute('uv'), n = geo.getAttribute('position').count, out = new Uint8Array(n);
  if (!uv || !patches.length) return out;
  const ox = map?.offset?.x ?? 0, oy = map?.offset?.y ?? 0, sx = map?.repeat?.x ?? 1, sy = map?.repeat?.y ?? 1;
  for (let i = 0; i < n; i++) {
    if (!head[i]) continue;
    const u = ox + uv.getX(i) * sx, v = oy + uv.getY(i) * sy;
    for (const e of patches) if (u >= e.x && u <= e.x + e.w && v >= e.y && v <= e.y + e.h) { out[i] = 1; break; }
  }
  return out;
}

/**
 * Build the rig on a skinned mesh's geometry (once per geometry: an archetype's people share it) and put the targets on it as
 * relative morph attributes. `eyePatch` the GLB's asset extras r5Paint.layout.eyePatch (one rect or a list).
 * Returns the geometry's rig record (geometry.userData.faceRig) or null with `geometry.userData.faceRigError`.
 */
export function installFaceGeometry(mesh, eyePatch) {
  const geo = mesh.geometry;
  if (geo.userData.faceRig) return geo.userData.faceRig;
  if (geo.userData.faceRigError) return null;
  const fail = (e) => { geo.userData.faceRigError = e; return null; };
  const bones = mesh.skeleton?.bones || [];
  const hi = bones.findIndex((b) => b.name === 'Head');
  if (hi < 0) return fail('no Head joint');
  if (geo.morphAttributes?.position?.length) return fail('already has morph targets');
  const pos = geo.getAttribute('position'), n = pos.count;
  const si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
  if (!si || !sw) return fail('not skinned');
  const head = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
    if (w >= 0.5) head[i] = 1;
  }
  // the quantised positions' uniform scale: the Head joint's inverse bind carries it (the joint itself is rigid, unit scale)
  const ibm = mesh.skeleton.boneInverses[hi];
  const e = ibm.elements;
  const s = (Math.hypot(e[0], e[1], e[2]) + Math.hypot(e[4], e[5], e[6]) + Math.hypot(e[8], e[9], e[10])) / 3;
  if (!(s > 0)) return fail('no scale');
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { P[i * 3] = pos.getX(i) * s; P[i * 3 + 1] = pos.getY(i) * s; P[i * 3 + 2] = pos.getZ(i) * s; }
  const patches = [].concat(eyePatch || []);
  const eye = eyeMaskOf(geo, mesh.material?.map, patches, head);
  const idx = geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  // the hide mask (Brea) reorders the index in place: the authored order, if kept, is the same triangles
  const rig = buildFaceRig(P, idx, eye, head);
  if (rig.error) return fail(rig.error);
  geo.morphAttributes.position = rig.targets.map((D, k) => {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < a.length; i++) a[i] = D[i] / s;
    const attr = new THREE.BufferAttribute(a, 3);
    attr.name = FACE_TARGETS[k];
    return attr;
  });
  geo.morphTargetsRelative = true;
  // head-local (the Head joint's frame) of a point given in the rig's frame: q = p / s through inverse bind x bind matrix
  _m.multiplyMatrices(ibm, mesh.bindMatrix);
  const toHead = (p) => _v.set(p[0] / s, p[1] / s, p[2] / s).applyMatrix4(_m).toArray();
  const dirHead = (d) => _v.set(d[0], d[1], d[2]).transformDirection(_m).toArray();
  const rec = {
    s, headIndex: hi, n,
    eyes: rig.eyes.map((E) => ({ ...E, cHead: toHead(E.c) })),
    lids: rig.lids, mouth: { ...rig.mouth, cavityHead: toHead(rig.mouth.cavity.c) },
    axes: { x: dirHead([1, 0, 0]), y: dirHead([0, 1, 0]), z: dirHead([0, 0, 1]) },
    stats: rig.stats,
  };
  geo.userData.faceRig = rec;
  mesh.updateMorphTargets();
  return rec;
}

/* ================================================================ one live face */

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _mw = new THREE.Matrix4();
let _cavityGeo = null;

/** A seeded random stream (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Face {
  /**
   * @param mesh   the near skin (morph targets installed by installFaceGeometry)
   * @param opts   { seed, director, name }
   */
  constructor(mesh, { seed = 1, director = null, name = '' } = {}) {
    this.mesh = mesh;
    this.rig = mesh.geometry.userData.faceRig;
    this.name = name;
    this.director = director;
    this.rand = rng(seed * 7919 + 13);
    this.head = mesh.skeleton.bones[this.rig.headIndex];
    this.inf = mesh.morphTargetInfluences;
    this.alive = true;
    this.blinkIn = 0.6 + this.rand() * 2.4;
    this.blinkT = -1;
    this.blinks = 0;
    this.sacT = 0.5 + this.rand();
    this.sac = [0, 0];
    this.wander = [0, 0];
    this.wanderT = 1 + this.rand() * 2;
    this.yaw = 0; this.pitch = 0; this.verge = 0;
    this.target = null;       // a Vector3 the eyes are on (world), or null
    this.wantY = 0;           // the target's yaw from the head's forward (rad), last frame
    this.speech = null;       // { track, t0 }
    this.mouth = [0, 0, 0, 0];
    this._shape = [0, 0, 0, 0];
    this._last = 0;
    this._frame = -1;
    this.cavity = null;
    this._prevOBR = mesh.onBeforeRender;
    const self = this;
    mesh.onBeforeRender = function faceTick(r, s, cam, g, m, grp) {
      self._prevOBR?.call(this, r, s, cam, g, m, grp);
      self.tick();
    };
  }

  /** The eyes' midpoint in the world now (the other speaker's head, for a gaze). */
  eyesWorld(out) {
    const E = this.rig.eyes;
    _mw.copy(this.head.matrixWorld);
    _a.fromArray(E[0].cHead).applyMatrix4(_mw);
    _b.fromArray(E[1].cHead).applyMatrix4(_mw);
    return out.copy(_a).add(_b).multiplyScalar(0.5);
  }

  /** The face's axes in the world now: x her left, y up, z forward (from the bind axes through the Head joint). */
  axesWorld(x, y, z) {
    const A = this.rig.axes;
    x.fromArray(A.x).transformDirection(this.head.matrixWorld);
    y.fromArray(A.y).transformDirection(this.head.matrixWorld);
    z.fromArray(A.z).transformDirection(this.head.matrixWorld);
  }

  say(text) {
    this.speech = { track: speechTrack(text), t0: performance.now() / 1000, text };
    this._showCavity(true);
  }

  hush() { this.speech = null; }

  _showCavity(on) {
    if (on && !this.cavity) {
      const R = this.rig.mouth.cavity.r, s = this.rig.s;
      if (!_cavityGeo) _cavityGeo = new THREE.SphereGeometry(1, 14, 10);
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a0d0c, side: THREE.BackSide });
      const m = new THREE.Mesh(_cavityGeo, mat);
      m.name = 'face-cavity';
      m.castShadow = false; m.receiveShadow = false;
      // the radii are in the rig's metres; the Head joint's frame is metric too
      m.scale.set(R[0], R[1], R[2]);
      m.position.fromArray(this.rig.mouth.cavityHead);
      // the bind axes in the Head frame
      const A = this.rig.axes;
      _m2.makeBasis(_a.fromArray(A.x), _b.fromArray(A.y), _c.fromArray(A.z));
      m.quaternion.setFromRotationMatrix(_m2);
      m.userData.noSizeCull = true;
      void s;
      this.head.add(m);
      this.cavity = m;
    }
    if (this.cavity) this.cavity.visible = on;
  }

  /** Rest: every influence 0, the cavity hidden. */
  rest() {
    const I = this.inf;
    for (let k = 0; k < I.length; k++) I[k] = 0;
    if (this.cavity) this.cavity.visible = false;
  }

  /** Once a frame, from the skin's onBeforeRender (real time: the world is stopped while a card is open). */
  tick() {
    const D = this.director;
    const frame = D?.frame?.() ?? -1;
    if (frame >= 0 && frame === this._frame) return;
    this._frame = frame;
    const now = performance.now() / 1000;
    const dt = this._last ? Math.min(0.1, Math.max(0, now - this._last)) : 0;
    this._last = now;
    D?.beforeFace?.(this, frame);
    if (!this.alive || (D && !D.live())) { this.rest(); return; }
    this.update(dt, now);
  }

  update(dt, now) {
    const I = this.inf, R = this.rand;
    // ---- blink: every 3.2-5.8 s; shut in 75 ms, held 35 ms, open in 130 ms
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinks++; this.blinkIn = 3.2 + R() * 2.6; }
    let b = 0;
    if (this.blinkT >= 0) {
      const t = (this.blinkT += dt);
      if (t < 0.075) b = smooth(0, 0.075, t);
      else if (t < 0.11) b = 1;
      else if (t < 0.24) b = 1 - smooth(0.11, 0.24, t);
      else { this.blinkT = -1; b = 0; }
    }
    // ---- gaze: on the target inside the cone, or a slow wander; saccades on top
    this.sacT -= dt;
    if (this.sacT <= 0) {
      this.sacT = 0.7 + R() * 1.6;
      const a = R() * Math.PI * 2, m = (0.35 + R() * 0.7) * D2R;
      this.sac[0] = Math.cos(a) * m; this.sac[1] = Math.sin(a) * m * 0.7;
    }
    let wantY = 0, wantP = 0, verge = 0;
    if (this.target) {
      this.eyesWorld(_d);
      this.axesWorld(_a, _b, _c);
      const dx = this.target.x - _d.x, dy = this.target.y - _d.y, dz = this.target.z - _d.z;
      const fx = dx * _a.x + dy * _a.y + dz * _a.z, fy = dx * _b.x + dy * _b.y + dz * _b.z, fz = dx * _c.x + dy * _c.y + dz * _c.z;
      const L = Math.hypot(fx, fy, fz) || 1;
      wantY = Math.atan2(fx, fz);
      wantP = Math.atan2(fy, Math.hypot(fx, fz));
      verge = Math.atan2(this.rig.stats.eyeGapMm / 2000, L);
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 1.5 + R() * 2.5; this.wander[0] = (R() * 2 - 1) * 6 * D2R; this.wander[1] = (R() * 2 - 1) * 3 * D2R; }
      wantY = this.wander[0]; wantP = this.wander[1];
    }
    wantY += this.sac[0]; wantP += this.sac[1];
    // where the target is from the head now (the person's head look reads this: past the cone the head turns to it)
    this.wantY = this.target ? wantY : 0;
    // inside the 25 deg cone
    const off = Math.hypot(wantY, wantP);
    if (off > CONE) { wantY *= CONE / off; wantP *= CONE / off; }
    this.cone = off;
    // a saccade: 90 % of the way in about 45 ms
    const k = 1 - Math.exp(-dt / 0.02);
    this.yaw += (wantY - this.yaw) * k;
    this.pitch += (wantP - this.pitch) * k;
    this.verge += (verge - this.verge) * k;
    I[T.yawS] = Math.sin(this.yaw); I[T.yawC] = 1 - Math.cos(this.yaw);
    I[T.pitchS] = Math.sin(this.pitch); I[T.pitchC] = 1 - Math.cos(this.pitch);
    I[T.verge] = Math.sin(this.verge);
    // the upper lid follows the eye down (half-closed is ~half the opening)
    const follow = Math.min(0.7, Math.max(0, -this.pitch / (16 * D2R)) * 0.6);
    const lid = Math.max(b, follow * 0.5);
    I[T.blinkMid] = lid < 0.5 ? lid * 2 : 2 - lid * 2;
    I[T.blinkFull] = lid < 0.5 ? 0 : lid * 2 - 1;
    // ---- the mouth on the text
    const S = this.speech, sh = this._shape;
    let speaking = false;
    if (S) {
      const t = now - S.t0;
      trackAt(S.track, t, sh);
      speaking = t < S.track.duration;
      if (t > S.track.duration + 0.6) this.speech = null;
    } else { sh[0] = sh[1] = sh[2] = sh[3] = 0; }
    const km = 1 - Math.exp(-dt / 0.045);
    const M = this.mouth;
    for (let j = 0; j < 4; j++) M[j] += (sh[j] - M[j]) * km;
    I[T.jawAA] = M[0]; I[T.lipEE] = M[1]; I[T.lipOO] = M[2]; I[T.lipFV] = M[3];
    this.speaking = speaking;
    if (this.cavity) this.cavity.visible = !!this.speech || M[0] + M[1] + M[2] > 0.02;
  }

  dispose() {
    this.mesh.onBeforeRender = this._prevOBR || (() => {});
    if (this.cavity) { this.cavity.removeFromParent(); this.cavity.material.dispose(); this.cavity = null; }
  }
}
