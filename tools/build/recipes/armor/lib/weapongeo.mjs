/**
 * CALIMA — armory: weapon geometry in authored metres (armory W1).
 * Plain arrays { pos, nrm, uv, idx, kind } merged by concatenation. `lathe`
 * maps u along the profile and v around, for the long cells of the weapon atlas.
 */
import { V } from './part.mjs';

export const G = () => ({ pos: [], nrm: [], uv: [], idx: [], bw: [] });
export function merge(a, b) {
  const o = a.pos.length / 3;
  for (const k of ['pos', 'nrm', 'uv', 'bw']) { const s = b[k]; for (let i = 0; i < s.length; i++) a[k].push(s[i]); }
  for (let i = 0; i < b.idx.length; i++) a.idx.push(b.idx[i] + o);
  return a;
}
/** Tag every vertex with [kind, s] (the held bow's vertex program reads it). */
export function tag(g, kind, sOf = () => 0) {
  g.bw = [];
  for (let i = 0; i < g.pos.length; i += 3) g.bw.push(kind, sOf(g.pos[i], g.pos[i + 1], g.pos[i + 2]));
  return g;
}
/** Lathe around +Y: profile [[r, y], ...]; u along it (uAlong) or around. */
export function lathe(profile, { sides = 8, rect, phase = 0, uAlong = true, cap0 = false, cap1 = false, uRange = null, vRange = null, ry = null } = {}) {
  const g = G();
  const n = profile.length;
  let len = 0; const acc = [0];
  for (let i = 1; i < n; i++) { len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]); acc.push(len); }
  const uR = uRange || [0, 1], vR = vRange || [0, 1];
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i];
    const pr = profile[Math.max(0, i - 1)], nx = profile[Math.min(n - 1, i + 1)];
    const dr = nx[0] - pr[0], dy = nx[1] - pr[1];
    const nl = Math.hypot(dr, dy) || 1;
    for (let k = 0; k <= sides; k++) {
      const th = (k / sides) * Math.PI * 2 + phase;
      const c = Math.cos(th), s = Math.sin(th);
      const rz = ry ? ry(y, th) : 1;
      g.pos.push(r * c, y, r * s * rz);
      g.nrm.push((dy / nl) * c, -dr / nl, (dy / nl) * s);
      const along = len ? acc[i] / len : 0, round = k / sides;
      const a = uR[0] + (uR[1] - uR[0]) * along, b = vR[0] + (vR[1] - vR[0]) * round;
      if (uAlong) g.uv.push(rect[0] + a * rect[2], rect[1] + b * rect[3]);
      else g.uv.push(rect[0] + b * rect[2], rect[1] + a * rect[3]);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * (sides + 1) + k, b = a + 1, c = a + sides + 1, d = c + 1;
    g.idx.push(a, c, b, b, c, d);
  }
  const addCap = (end, sign) => {
    const ci = g.pos.length / 3;
    g.pos.push(0, profile[end][1], 0); g.nrm.push(0, sign, 0); g.uv.push(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
    for (let k = 0; k < sides; k++) { const a = end * (sides + 1) + k; if (sign > 0) g.idx.push(a, a + 1, ci); else g.idx.push(a + 1, a, ci); }
  };
  if (cap0) addCap(0, -1);
  if (cap1) addCap(n - 1, 1);
  return g;
}
/** Apply a basis (columns X, Y, Z) + translation, in place. */
export function place(g, X, Y, Z, T = [0, 0, 0]) {
  for (let i = 0; i < g.pos.length; i += 3) {
    const [x, y, z] = [g.pos[i], g.pos[i + 1], g.pos[i + 2]];
    g.pos[i] = X[0] * x + Y[0] * y + Z[0] * z + T[0];
    g.pos[i + 1] = X[1] * x + Y[1] * y + Z[1] * z + T[1];
    g.pos[i + 2] = X[2] * x + Y[2] * y + Z[2] * z + T[2];
    const [a, b, c] = [g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]];
    g.nrm[i] = X[0] * a + Y[0] * b + Z[0] * c;
    g.nrm[i + 1] = X[1] * a + Y[1] * b + Z[1] * c;
    g.nrm[i + 2] = X[2] * a + Y[2] * b + Z[2] * c;
  }
  return g;
}
export function basisY(dir, zHint = [0, 0, 1]) {
  const Y = V.norm(dir);
  let X = V.norm(V.cross(Y, zHint));
  if (!Number.isFinite(X[0]) || V.len(V.cross(Y, zHint)) < 1e-6) X = [1, 0, 0];
  const Z = V.cross(X, Y);
  return [X, Y, Z];
}
/** Flat quad strip between two polylines, one normal per vertex given. */
export function ribbon(A, B, nA, rect, { uv = null } = {}) {
  const g = G();
  const n = A.length;
  for (let i = 0; i < n; i++) {
    g.pos.push(...A[i], ...B[i]);
    g.nrm.push(...nA[i], ...nA[i]);
    const u = uv ? uv(i / (n - 1)) : i / (n - 1);
    g.uv.push(rect[0] + u * rect[2], rect[1], rect[0] + u * rect[2], rect[1] + rect[3]);
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; g.idx.push(a, c, b, b, c, d); }
  return g;
}

/* ------------------------------------------------------------- the lance */

export const LANCE = { length: 1.55, blade: 0.22, cap: 0.11, grip: 0.20, grip2: 0.55, r: 0.0145 };

/** Shepherd's Lance, local +Y from the butt (y 0) to the tip (y 1.55). `lod` 0 held, 1 stowed. */
export function lanceGeo(cell, { lod = 0 } = {}) {
  const g = G();
  const L = LANCE, r = L.r;
  const sides = lod ? 6 : 8;
  // the bob: a cast plumb bob, point down, a collar and a knop at its neck
  merge(g, lathe(lod
    ? [[0.0005, 0], [0.007, 0.006], [0.019, 0.018], [0.036, 0.040], [0.045, 0.060], [0.0445, 0.070], [0.038, 0.082], [0.027, 0.094], [0.021, 0.098], [0.0215, 0.102], [r + 0.0045, 0.105], [r + 0.0045, 0.112], [r + 0.0015, 0.116]]
    : [[0.0005, 0], [0.0035, 0.0028], [0.009, 0.008], [0.019, 0.018], [0.0285, 0.029], [0.0365, 0.041], [0.0425, 0.052], [0.0452, 0.062], [0.0444, 0.071], [0.0395, 0.08], [0.0315, 0.0885], [0.0245, 0.0945], [0.0208, 0.0985], [0.0218, 0.1015], [r + 0.0047, 0.1045], [r + 0.0047, 0.1115], [r + 0.0015, 0.116]],
    { sides: lod ? 10 : 14, rect: cell('bronzeCast'), uAlong: true }));
  const hr = (y) => r * (1.0 - 0.14 * Math.max(0, (y - 0.3) / 1.0));   // a shaved taper toward the head
  const haft = (y0, y1, name, uR, rows = 1, fat = 0) => {
    const prof = [];
    for (let i = 0; i <= rows; i++) { const y = y0 + (y1 - y0) * (i / rows); prof.push([hr(y) + fat, y]); }
    merge(g, lathe(prof, { sides, rect: cell(name), uRange: uR }));
  };
  const LL = L.length, g1 = L.grip * LL, g2 = L.grip2 * LL;
  haft(L.cap, g1 - 0.075, 'pine', [0, 0.14], 1);
  haft(g2 - 0.075 + 0, g1 + 0.075, 'pine', [0.14, 0.14], 0.0001 ? 1 : 1);
  haft(g1 + 0.075, g2 - 0.075, 'pine', [0.14, 0.55], 2);
  haft(g2 + 0.075, 1.0, 'pine', [0.55, 0.8], 1);
  haft(1.0, 1.274, 'graduated', [0, 1], lod ? 1 : 3);   // 3 bands: vermilion / white / vermilion, a ranging rod's
  // esparto wraps, a ridged cord: real relief
  const wrap = (cy, h = 0.075) => {
    const prof = [], rows = lod ? 4 : 10;
    for (let i = 0; i <= rows; i++) {
      const y = cy - h + (2 * h) * (i / rows);
      const bump = i === 0 || i === rows ? 0.0008 : (i % 2 ? 0.0028 : 0.0021);
      prof.push([hr(y) + bump, y]);
    }
    merge(g, lathe(prof, { sides, rect: cell('esparto'), uAlong: false, vRange: [0, 1] }));
  };
  wrap(g1); wrap(g2);
  // carmine binding below the socket, then the long cast socket running up into the midrib (the reference's own form)
  const lash = [];
  for (let i = 0; i <= (lod ? 2 : 5); i++) { const y = 1.272 + 0.0052 * i * (lod ? 2.5 : 1); lash.push([hr(y) + (i % 2 ? 0.0024 : 0.0013), y]); }
  merge(g, lathe(lash, { sides, rect: cell('carmine'), uAlong: false }));
  merge(g, lathe([[r * 0.86 + 0.0008, 1.296], [r * 0.86 + 0.0036, 1.2995], [r * 0.86 + 0.0036, 1.3055], [r * 0.86 + 0.0021, 1.309], [0.0118, 1.336], [0.0098, 1.362], [0.0078, 1.384], [0.0052, 1.402]],
    { sides: lod ? 6 : 10, rect: cell('bronzeCast') }));
  // the leaf: midrib, flat, ground bevel. Two faces x two halves x two strips, sharp edges
  const yb = 1.358, ln = L.blade - 0.008;   // wings from the socket's upper third to the point
  const stations = lod ? [0, 0.05, 0.11, 0.17, 1] : [0, 0.018, 0.042, 0.075, 0.11, 0.145, 0.176, 0.2, 1];
  const prof = stations.map((f) => {
    const y = f === 1 ? ln : f;
    const wid = f === 1 ? 0 : (0.0075 + 0.0215 * Math.pow(Math.sin(Math.min(1, y / 0.075) * Math.PI / 2), 0.8)) * (1 - Math.pow(Math.max(0, (y - 0.06) / (ln - 0.06)), 1.9));
    return [wid, y];
  });
  const mid = 0.0088, bevel = 0.72;
  const bladeRect = cell('bronzeBlade');
  for (const s of [1, -1]) for (const f of [1, -1]) {
    const A = [], B = [], C = [], n1 = [], n2 = [];
    for (const [w, y] of prof) {
      const yy = yb + y;
      A.push([0, yy, f * mid * Math.pow(1 - y / ln * 0.86, 1.15)]);
      B.push([s * w * bevel, yy, f * 0.0026 * (1 - 0.55 * (y / ln))]);
      C.push([s * w, yy, 0]);
      n1.push(V.norm([s * 0.3, 0.03, f * 1]));
      n2.push(V.norm([s * 0.62, 0.05, f * 1]));
    }
    const strip = (P, Q, nn, v0, v1) => {
      const q = G();
      P.forEach((p, i) => {
        q.pos.push(...p, ...Q[i]); q.nrm.push(...nn[i], ...nn[i]);
        const u = prof[i][1] / ln;
        q.uv.push(bladeRect[0] + u * bladeRect[2], bladeRect[1] + v0 * bladeRect[3], bladeRect[0] + u * bladeRect[2], bladeRect[1] + v1 * bladeRect[3]);
      });
      for (let i = 0; i < P.length - 1; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (s * f > 0) q.idx.push(a, b, c, b, d, c); else q.idx.push(a, c, b, b, c, d);
      }
      return q;
    };
    merge(g, strip(A, B, n1, 0.05, 0.62));
    merge(g, strip(B, C, n2, 0.66, 0.98));
  }
  return g;
}

/* --------------------------------------------------------------- the bow */

export const BOW = { length: 1.45, brace: 0.16, tipK: 0.13, tipC: 0.06 };

/** The stave's centre line: t in [-1, 1], y up, z toward the target (+) / archer (-). */
export function stave(t) {
  const a = Math.abs(t);
  const half = (BOW.length / 2) * 1.0267;       // nock groove to nock groove along the back = BOW.length (bible: 1.45 m)
  const y = t * half * (1 - 0.05 * a * a);
  const z = -BOW.brace * Math.pow(a, 1.9) + 0.022 * Math.pow(a, 6);
  // wind-twisted: a small S out of the plane, zero at the grip and the tips
  const x = 0.013 * Math.sin(Math.PI * t) * Math.sin(Math.PI * a * 0.9 + 0.3);
  return [x, y, z];
}
export const BOW_TIP = (() => { const p = stave(1); return { y: p[1] + 0.035, z: p[2] }; })();

/**
 * Sabina Bow, local: +Y along the stave, grip at the origin, string side -Z.
 * `string`: 'live' (kind 1 verts with s), 'rest' (static, tagged 0).
 * Vertex tags: kind 0 stave s = t (the limbs flex in the vertex program).
 */
export function bowGeo(cell, { lod = 0 } = {}) {
  const g = G();
  const rows = lod ? 9 : 16, sides = lod ? 6 : 8;
  const juniper = cell('juniper');
  const out = G();
  const secW = (t) => { const a = Math.abs(t); return (a < 0.09 ? 0.0165 : 0.0165 + 0.0085 * Math.sin(Math.min(1, (a - 0.09) / 0.25) * Math.PI / 2)) * (1 - 0.62 * Math.pow(a, 2.6)); };
  const secD = (t) => { const a = Math.abs(t); return (a < 0.09 ? 0.0175 : 0.0175 - 0.0035 * Math.min(1, (a - 0.09) / 0.25)) * (1 - 0.58 * Math.pow(a, 2.2)); };
  const twist = (t) => 0.42 * Math.sin(t * 2.2 + 0.4);
  for (let r = 0; r <= rows * 2; r++) {
    const t = -1 + r / rows;
    const p = stave(t);
    const p2 = stave(Math.min(1, t + 0.01)), p1 = stave(Math.max(-1, t - 0.01));
    const T = V.norm(V.sub(p2, p1));
    const X0 = V.norm(V.cross(T, [0, 0, 1]));
    const Z0 = V.cross(X0, T);
    const tw = twist(t), cw = Math.cos(tw), sw = Math.sin(tw);
    const X = [X0[0] * cw + Z0[0] * sw, X0[1] * cw + Z0[1] * sw, X0[2] * cw + Z0[2] * sw];
    const Z = [Z0[0] * cw - X0[0] * sw, Z0[1] * cw - X0[1] * sw, Z0[2] * cw - X0[2] * sw];
    // bumps of the living wood
    const lump = 1 + 0.08 * Math.sin(t * 13.1 + 1.2) * Math.sin(t * 5.3);
    const w = secW(t) * lump, d = secD(t) * lump;
    for (let k = 0; k <= sides; k++) {
      const th = (k / sides) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      // D-section: the back (+Z, sapwood) flatter than the belly
      const zz = (s > 0 ? 0.62 : 1) * d * s;
      out.pos.push(p[0] + X[0] * w * c + Z[0] * zz, p[1] + X[1] * w * c + Z[1] * zz, p[2] + X[2] * w * c + Z[2] * zz);
      const nx = c / w, nz = s / ((s > 0 ? 0.62 : 1) * d);
      const n = V.norm([X[0] * nx + Z[0] * nz, X[1] * nx + Z[1] * nz, X[2] * nx + Z[2] * nz]);
      out.nrm.push(...n);
      // v 0.25 = back, 0.75 = belly (the heart stripe)
      out.uv.push(juniper[0] + (0.5 + t * 0.5) * juniper[2], juniper[1] + (k / sides) * juniper[3]);
    }
  }
  const cc = sides + 1;
  for (let r = 0; r < rows * 2; r++) for (let k = 0; k < sides; k++) {
    const a = r * cc + k, b = a + 1, c = a + cc, d = c + 1;
    out.idx.push(a, b, c, b, d, c);
  }
  merge(g, tag(out, 0, (x, y) => stStave(y)));
  // the esparto grip: a thick cord wrap, carmine binding either side
  const grip = (y0, y1, name, n, base) => {
    const prof = [];
    for (let i = 0; i <= n; i++) {
      const y = y0 + (y1 - y0) * (i / n);
      const bump = i === 0 || i === n ? 0.0004 : (i % 2 ? 0.0031 : 0.0024);
      prof.push([base + bump, y]);
    }
    return tag(lathe(prof, { sides, rect: cell(name), uAlong: false, ry: () => 1.06 }), 0, (x, y) => stStave(y));
  };
  const gh = 0.058;
  merge(g, grip(-gh, gh, 'esparto', lod ? 6 : 14, 0.0178));
  merge(g, grip(gh, gh + 0.016, 'carmine', lod ? 2 : 4, 0.0178));
  merge(g, grip(-gh - 0.016, -gh, 'carmine', lod ? 2 : 4, 0.0178));
  // limb lashings near the tips
  for (const sgn of [1, -1]) {
    const q = stave(sgn * 0.86);
    const ln = lathe([[0.0098, -0.014], [0.0118, -0.008], [0.0104, -0.002], [0.0118, 0.004], [0.0098, 0.012]], { sides, rect: cell('carmine'), uAlong: false });
    const dir = V.norm(V.sub(stave(sgn * 0.9), stave(sgn * 0.82)));
    const [X, Y, Z] = basisY(dir, [0, 0, 1]);
    place(ln, X, Y, Z, q);
    merge(g, tag(ln, 0, (x, y) => stStave(y)));
    // horn nock: grooved, tapering past the tip
    const tip = stave(sgn);
    const dirT = V.norm(V.sub(stave(sgn), stave(sgn * 0.96)));
    const [X2, Y2, Z2] = basisY(dirT, [0, 0, 1]);
    const nk = lathe([[0.0098, -0.03], [0.0108, -0.018], [0.0102, -0.006], [0.0074, -0.002], [0.0072, 0.006], [0.0098, 0.012], [0.0078, 0.026], [0.0012, 0.04]], { sides: lod ? 6 : 8, rect: cell('horn'), uAlong: true });
    place(nk, X2, Y2, Z2, tip);
    merge(g, tag(nk, 0, (x, y) => stStave(y)));
  }
  return g;
}
const stStave = (y) => Math.max(-1, Math.min(1, y / (BOW.length / 2 * 0.95)));

/** The string, tip to tip, at brace; `live` tags s = -1 .. 0 .. 1 (kind 1). */
export function stringGeo(cell, { lod = 0, live = true } = {}) {
  const g = G();
  const rect = cell('string');
  const tip = stave(1);
  const rows = lod ? 2 : 10;
  const sides = lod ? 3 : 4;
  const R = 0.0016, RS = 0.0026;   // serving at the nocking point
  for (let r = 0; r <= rows * 2; r++) {
    const s = -1 + r / rows;
    const y = s * (tip[1] + 0.006);
    const rad = Math.abs(s) < 0.07 ? RS : R;
    for (let k = 0; k <= sides; k++) {
      const th = (k / sides) * Math.PI * 2;
      g.pos.push(Math.cos(th) * rad, y, tip[2] + Math.sin(th) * rad);
      g.nrm.push(Math.cos(th), 0, Math.sin(th));
      g.uv.push(rect[0] + (0.5 + s * 0.5) * rect[2], rect[1] + (k / sides) * rect[3]);
      g.bw.push(live ? 1 : 0, s);
    }
  }
  const cc = sides + 1;
  for (let r = 0; r < rows * 2; r++) for (let k = 0; k < sides; k++) {
    const a = r * cc + k, b = a + 1, c = a + cc, d = c + 1;
    g.idx.push(a, b, c, b, d, c);
  }
  return g;
}

/**
 * The nocked arrow, nock at the origin, flying +Z, length `len` (pull + 0.20).
 * Tags: kind 2 shaft and nock, 3 head (tinted per ammo), 4 fletching (tinted).
 */
export function arrowGeo(cell, len = 0.782) {
  const g = G();
  // lathe's axis is +Y: the arrow lies along +Z, nock at the origin, flying +Z
  const toZ = (q) => place(q, [1, 0, 0], [0, 0, 1], [0, -1, 0]);
  const shaft = toZ(lathe([[0.0034, 0], [0.0036, 0.02], [0.0036, len - 0.05], [0.0032, len - 0.04]], { sides: 6, rect: cell('shaft') }));
  merge(g, tag(shaft, 2));
  const nk = toZ(lathe([[0.0026, -0.006], [0.0044, 0.0], [0.0042, 0.012]], { sides: 6, rect: cell('horn') }));
  merge(g, tag(nk, 2));
  const head = toZ(lathe([[0.0034, len - 0.05], [0.0056, len - 0.046], [0.0052, len - 0.038], [0.0105, len - 0.03], [0.0078, len - 0.012], [0.0004, len]], { sides: 4, rect: cell('bronzeCast'), ry: (y) => (y > len - 0.035 ? 0.34 : 1) }));
  merge(g, tag(head, 3));
  // three gull vanes, cock feather black; a real curved edge
  const fl = [[0.0, 0.002], [0.05, 0.010], [0.085, 0.0115], [0.105, 0.0095], [0.118, 0.0035]];
  const y0 = 0.018;
  [0, 1, 2].forEach((i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const rx = [Math.cos(a), Math.sin(a), 0];
    const r0 = 0.0033;
    const n = [Math.sin(a), -Math.cos(a), 0];
    const vane = G();
    const rect = cell(i === 0 ? 'fletchB' : 'fletchW');
    fl.forEach(([l, h], k) => {
      const z = y0 + l;
      vane.pos.push(rx[0] * r0, rx[1] * r0, z, rx[0] * (r0 + h), rx[1] * (r0 + h), z - 0.012 * (h / 0.0115));
      vane.nrm.push(...n, ...n);
      const u = l / 0.118;
      vane.uv.push(rect[0] + u * rect[2], rect[1], rect[0] + u * rect[2], rect[1] + rect[3]);
      void k;
    });
    for (let k = 0; k < fl.length - 1; k++) { const p = k * 2; vane.idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3, p, p + 1, p + 2, p + 1, p + 3, p + 2); }
    merge(g, tag(vane, 4));
  });
  return g;
}
