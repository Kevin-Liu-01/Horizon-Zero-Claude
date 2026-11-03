/**
 * CALIMA — human head construction helpers (character-art, W1; R54, R56): the mesh cuts that pay
 * for the cloth, the eye patch UVs, the brow guides, the hairline shape and the scalp cards.
 * Everything Brea's recipe does that an NPC recipe does the same way. Node only, deterministic.
 * API: docs/ROUND5-CHARACTER-ART.md §3.
 */
import { MeshoptSimplifier } from 'meshoptimizer';
import { noise3, smooth } from './face.mjs';
import { uvIslands, TriGrid, triSoup } from './skin.mjs';
import { rng, WRAP_ATLAS } from './wrap.mjs';
import { scatterAnchors, coilCards } from './hair.mjs';

/** The texel density a human body wants (against the source layout): the face first, hidden body last. */
export function humanDensity(s) {
  const c = [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2];
  if (s.max[1] > 1.72 && s.max[2] > 0.09) return 1.92;                     // the face
  if (s.min[1] > 1.45 && s.max[1] > 1.70) return 1.5;                      // skull sides + ears
  if (s.min[1] > 1.56 && s.max[1] < 1.6) return 0.7;                       // the mouth bag
  if (s.min[1] > 1.42) return 1.05;                                         // the neck
  if (Math.abs(c[0]) > 0.6) return c[0] < 0 ? 1.34 : 1.12;                  // hands: the right (∴) hand a little denser
  if (Math.abs(c[0]) > 0.12 && c[1] > 1.3) return 0.66;                     // arms (bare from the elbow)
  return 0.34;                                                              // covered body
}

export function vertexWeightOf(prim, set) {
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const out = new Float32Array(J.getCount()); const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  for (let i = 0; i < J.getCount(); i++) {
    J.getElement(i, j); W.getElement(i, w);
    let s = 0; for (let k = 0; k < 4; k++) if (set.has(j[k])) s += w[k];
    out[i] = s;
  }
  return out;
}
export function eyeCentres(prim) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  const Lc = [0, 0, 0, 0], Rc = [0, 0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); const T = p[0] > 0 ? Lc : Rc; T[0] += p[0]; T[1] += p[1]; T[2] += p[2]; T[3]++; }
  return [Lc, Rc].map((c) => [c[0] / c[3], c[1] / c[3], c[2] / c[3]]);
}
export function eyeFrontZ(prim) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  let z = -9;
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); z = Math.max(z, p[2]); }
  return z;
}
export function movedMask(prim, before) {
  const a = prim.getAttribute('POSITION').getArray();
  const m = new Uint8Array(a.length / 3);
  for (let i = 0; i < m.length; i++) {
    m[i] = Math.abs(a[i * 3] - before[i * 3]) + Math.abs(a[i * 3 + 1] - before[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - before[i * 3 + 2]) > 1e-6 ? 1 : 0;
  }
  return m;
}

export function primFromGeo(doc, g) {
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(g.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(g.jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(g.wgt)))
    .setAttribute('COLOR_0', (() => { const n = g.col.length, c = new Uint8Array(n); for (let i = 0; i < n; i++) c[i] = Math.max(0, Math.min(255, Math.round(g.col[i] * 255))); return doc.createAccessor().setType('VEC4').setArray(c).setNormalized(true).setBuffer(buf); })())
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)));
}

/**
 * Her hairline over the stock shell's coverage: a tapered sideburn in front of the ear, clear
 * of the ear itself, and a nape that comes to a soft low point instead of a shaved block.
 */
export function hairShape(X, Y, Z) {
  const ax = Math.abs(X);
  const wob = (noise3(X * 90, Y * 90, Z * 90) - 0.5) * 0.009;
  // the sideburn: from under the wrap down in front of the ear, tapering to a point
  const t = smooth(1.654, 1.705, Y);
  const zf = -0.001 + t * 0.026 + wob, zb = -0.008 - t * 0.016 + wob * 0.8;
  const burn = 0.62 * (1 - smooth(zf - 0.008, zf + 0.004, Z)) * smooth(zb - 0.006, zb + 0.005, Z) * smooth(1.652, 1.682, Y);
  // behind the ear and down to the nape, whose low edge comes to a soft point
  const yLow = 1.572 + 0.036 * smooth(0.0, 0.058, ax) + 0.012 * smooth(0.05, 0.075, ax) + wob;
  // its front edge leaves the back of the ear and sweeps down and back
  const zBehind = -0.052 - 0.030 * smooth(1.668, 1.585, Y) + wob;
  const behind = (1 - smooth(zBehind - 0.006, zBehind + 0.001, Z)) * smooth(yLow - 0.003, yLow + 0.004, Y);
  // above the ear, a low band joining the two under the cloth
  const over = smooth(1.684, 1.694, Y) * smooth(-0.056, -0.05, Z) * (1 - smooth(zf - 0.006, zf + 0.004, Z));
  const onEar = ax > 0.0715 && Z > -0.052 && Z < 0.006 && Y < 1.688 ? 0 : 1;
  return Math.max(burn, behind, over) * onEar;
}

/** Brow centre lines from the stock brow cards (raw, after the field), flattened 40 % (bible §3.5). */
export function browLines(prim) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  const out = {};
  for (const side of [1, -1]) {
    const bins = new Map();
    let meanY = 0, cnt = 0;
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, p);
      if (Math.sign(p[0]) !== side) continue;
      const k = Math.round(p[0] / 0.004);
      const b = bins.get(k) || { y0: 9, y1: -9, s: 0, n: 0 };
      b.y0 = Math.min(b.y0, p[1]); b.y1 = Math.max(b.y1, p[1]); b.s += p[1]; b.n++;
      bins.set(k, b); meanY += p[1]; cnt++;
    }
    meanY /= cnt;
    const keys = [...bins.keys()].sort((a, b) => a - b);
    const pts = keys.map((k) => { const b = bins.get(k); const cy = b.s / b.n; return { x: k * 0.004, y: cy + (meanY + 0.002 - cy) * 0.74, half: (b.y1 - b.y0) * 0.5 * 1.08 }; });
    const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
    // the painted brow stops short of the stock card's long outer tail
    const inner = side > 0 ? x0 : x1, outer = side > 0 ? x1 : x0;
    const cut = outer + (inner - outer) * 0.13;
    out[side] = {
      x0: side > 0 ? x0 : cut, x1: side > 0 ? cut : x1,
      line: (x) => {
        const f = Math.max(0, Math.min(pts.length - 1.0001, (x - x0) / (x1 - x0) * (pts.length - 1)));
        const i = Math.floor(f), t = f - i;
        return { y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, half: Math.max(0.0014, (pts[i].half + (pts[i + 1].half - pts[i].half) * t) * 0.6) };
      },
    };
  }
  return out;
}

/** The eyeball gets a planar projection along +Z into its patch, a hair converged, so the iris sits in the patch centre. */
export function remapEyeUV(prim, eyes, rect) {
  const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'), p = [0, 0, 0];
  const arr = new Float32Array(UV.getCount() * 2);
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p);
    const e = p[0] > 0 ? eyes[0] : eyes[1];
    const conv = p[0] > 0 ? -0.00045 : 0.00045;
    arr[i * 2] = rect.x + (0.5 + (p[0] - e[0] + conv) / EYE_SPAN) * rect.w;
    arr[i * 2 + 1] = rect.y + (0.5 - (p[1] - e[1]) / EYE_SPAN) * rect.h;
  }
  UV.setArray(arr);
}
/** The metres the eye patch spans. */
export const EYE_SPAN = 0.0345;

/** Drop skull triangles the wrap fully covers (ears stay). Returns the count. */
export function cullUnderWrap(prim, covers, isEar) {
  const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), p = [0, 0, 0];
  const c = new Uint8Array(P.getCount());
  for (let i = 0; i < c.length; i++) { P.getElement(i, p); c[i] = (p[1] > 1.6 && !isEar(p) && covers(p)) ? 1 : 0; }
  const keep = [];
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) { if (c[idx[t]] && c[idx[t + 1]] && c[idx[t + 2]]) { n++; continue; } keep.push(idx[t], idx[t + 1], idx[t + 2]); }
  prim.getIndices().setArray(new Uint32Array(keep));
  return n;
}

/** The back half of each eyeball is inside the skull. */
export function cullEyeBacks(prim, eyes) {
  const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), p = [0, 0, 0];
  const zc = eyes[0][2] - 0.002;
  const back = new Uint8Array(P.getCount());
  for (let i = 0; i < back.length; i++) { P.getElement(i, p); back[i] = p[2] < zc ? 1 : 0; }
  const keep = [];
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) { if (back[idx[t]] && back[idx[t + 1]] && back[idx[t + 2]]) { n++; continue; } keep.push(idx[t], idx[t + 1], idx[t + 2]); }
  prim.getIndices().setArray(new Uint32Array(keep));
  compactPrim(prim);
  return n;
}

/** Hands at a game's density: the palm and back islands simplified with their borders locked (the fingers keep their silhouette). */
export async function simplifyHands(prim) {
  await MeshoptSimplifier.ready;
  const { islands, islandOf } = uvIslands(prim);
  const pos = Float32Array.from(prim.getAttribute('POSITION').getArray());
  const idx = prim.getIndices().getArray();
  const groups = new Map();
  const rest = [];
  for (let t = 0; t < idx.length; t += 3) {
    const s = islands[islandOf[idx[t]]];
    const isHand = Math.abs((s.min[0] + s.max[0]) / 2) > 0.6 && s.tris > 100;
    if (isHand) { let g = groups.get(s.id); if (!g) { g = []; groups.set(s.id, g); } g.push(idx[t], idx[t + 1], idx[t + 2]); } else rest.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  let cut = 0;
  const ids = [...groups.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const g = groups.get(id);
    const target = Math.floor(g.length * 0.64 / 3) * 3;
    const [out] = MeshoptSimplifier.simplify(Uint32Array.from(g), pos, 3, target, 0.012, ['LockBorder']);
    cut += (g.length - out.length) / 3;
    for (let i = 0; i < out.length; i++) rest.push(out[i]);
  }
  prim.getIndices().setArray(new Uint32Array(rest));
  return cut;
}

/** Remove vertices no triangle references (every attribute, keeping order). */
export function compactPrim(prim) {
  const idx = prim.getIndices().getArray();
  const n = prim.getAttribute('POSITION').getCount();
  const remap = new Int32Array(n).fill(-1);
  let m = 0;
  for (let i = 0; i < idx.length; i++) if (remap[idx[i]] < 0) remap[idx[i]] = 0;
  for (let i = 0; i < n; i++) if (remap[i] === 0) remap[i] = m++;
  if (m === n) return;
  for (const sem of prim.listSemantics()) {
    const A = prim.getAttribute(sem), s = A.getElementSize(), src = A.getArray();
    const dst = new src.constructor(m * s);
    for (let i = 0; i < n; i++) if (remap[i] >= 0) for (let k = 0; k < s; k++) dst[remap[i] * s + k] = src[i * s + k];
    A.setArray(dst);
  }
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = remap[idx[i]];
  prim.getIndices().setArray(out);
}
/** Coil cards on the scalp below the wrap, around the ears and down the nape. */
export function scalpCards({ bodyPrim, headW, shellGrid, wrapped, skinJ, skinW, hairShape: shape = hairShape, temples = true }) {
  const A = WRAP_ATLAS;
  const P = bodyPrim.getAttribute('POSITION');
  const verts = [];
  { const p = [0, 0, 0]; for (let i = 0; i < P.getCount(); i++) { if (headW[i] < 0.2) continue; P.getElement(i, p); if (p[1] > 1.5) verts.push([p[0], p[1], p[2], i]); } }
  const soup = triSoup(bodyPrim, (a, b, c) => headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5);
  const grid = new TriGrid(new Float32Array(soup), 0.016);
  const center = [0, 1.66, -0.02];
  const keep = (p, d) => {
    // under the stock shell, below the wrap's low edge (by a tuck), not on the ear
    const hit = shellGrid.cast(p[0] - d[0] * 0.002, p[1] - d[1] * 0.002, p[2] - d[2] * 0.002, d[0], d[1], d[2], 0.03, 0.0001);
    if (hit < 0) return false;
    if (shape(p[0], p[1] - 0.002, p[2]) < 0.6) return false;
    if (p[2] > -0.05) return false;                                 // in front of the ear the coils are painted
    return wrapped.lowEdge(p) < 0.10;
  };
  const anchors = scatterAnchors(grid, { center, step: 0.118, seed: 5, keep, elMin: -1.2, elMax: 0.75 });
  // a few coils escape under the hem at the temples: the wrap sits on hair, not on a mannequin
  const R0 = rng(77);
  const far = 0.3;
  if (temples) for (const side of [1, -1]) for (let i = 0; i < 9; i++) {
    const az = side * (0.62 + i * 0.105 + (R0() - 0.5) * 0.06);
    let found = null;
    for (let el = 0.5; el > -0.3; el -= 0.012) {
      const d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const t = grid.cast(center[0] + d[0] * far, center[1] + d[1] * far, center[2] + d[2] * far, -d[0], -d[1], -d[2], far, 0.0001);
      if (t < 0) continue;
      const q = [center[0] + d[0] * (far - t), center[1] + d[1] * (far - t), center[2] + d[2] * (far - t)];
      if (wrapped.lowEdge(q) < 0.018 - i * 0.002) { found = { p: q, n: d, az, el, scale: 0.62 + R0() * 0.25 }; break; }
    }
    if (found && Math.abs(found.p[0]) < 0.0735) anchors.push(found);
  }
  const skinOf = (p) => {
    let best = null, bd = 9;
    for (const v of verts) { const d = (v[0] - p[0]) ** 2 + (v[1] - p[1]) ** 2 + (v[2] - p[2]) ** 2; if (d < bd) { bd = d; best = v[3]; } }
    const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    skinJ.getElement(best, j); skinW.getElement(best, w);
    return { j: j.slice(), w: w.slice() };
  };
  const flow = (a, R) => {
    const x = a.p[0], z = a.p[2];
    const f = [Math.sign(x) * 0.12 + (R() - 0.5) * 0.7, -1, (z > -0.01 ? -0.85 : -0.2) + (R() - 0.5) * 0.7];
    return f;
  };
  return coilCards(anchors, { flow, skinOf, rect: A.coilFringe.rect, W: A.W, length: [0.012, 0.02], width: [0.011, 0.018], liftTip: [0.0016, 0.0042] });
}

