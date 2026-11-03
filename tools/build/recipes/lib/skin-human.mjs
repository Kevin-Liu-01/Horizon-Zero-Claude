/**
 * CALIMA — human head construction helpers (character-art, W1; R54, R56): the mesh cuts that pay
 * for the cloth, the eye patch UVs, the brow guides, the hairline shape and the scalp cards.
 * Everything Brea's recipe does that an NPC recipe does the same way. Node only, deterministic.
 * API: docs/ROUND5-CHARACTER-ART.md §3.
 */
import { MeshoptSimplifier } from 'meshoptimizer';
import { noise3, smooth, positionMap } from './face.mjs';
import {
  uvIslands, TriGrid, triSoup, bakeAOTexels, blurMasked, convexity, scalarMap, seamlessTone, paintSkinAtlas, decodeStockSkin, webp, blit, paintEye,
  pores, colourZones, creases, smoothSkin, eyeSocketClean, lipTone, lidLines,
} from './skin.mjs';
import { rng, WRAP_ATLAS } from './wrap.mjs';
import { scatterAnchors, coilCards, coilField, coilSampler, hairCoverage, hairlineLayer, browLayer } from './hair.mjs';

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
  const burn = 0.92 * (1 - smooth(zf - 0.008, zf + 0.004, Z)) * smooth(zb - 0.006, zb + 0.005, Z) * smooth(1.646, 1.676, Y);
  // behind the ear and down to the nape, whose low edge comes to a soft point
  const yLow = 1.572 + 0.036 * smooth(0.0, 0.058, ax) + 0.012 * smooth(0.05, 0.075, ax) + wob;
  // its front edge leaves the back of the ear and sweeps down and back
  const zBehind = -0.052 - 0.030 * smooth(1.668, 1.585, Y) + wob;
  const behind = (1 - smooth(zBehind - 0.006, zBehind + 0.001, Z)) * smooth(yLow - 0.003, yLow + 0.004, Y);
  // above the ear, a low band joining the two under the cloth
  const over = smooth(1.664, 1.676, Y + wob * 0.6) * smooth(-0.056, -0.05, Z) * (1 - smooth(zf - 0.006, zf + 0.004, Z));
  const onEar = ax > 0.0715 && Z > -0.052 && Z < 0.006 && Y < 1.671 ? 0 : 1;
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
    const pts = keys.map((k) => { const b = bins.get(k); const cy = b.s / b.n; return { x: k * 0.004, y: cy + (meanY + 0.0038 - cy) * 0.74, half: (b.y1 - b.y0) * 0.5 * 1.08 }; });
    const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
    // the painted brow stops short of the stock card's long outer tail
    const inner = side > 0 ? x0 : x1, outer = side > 0 ? x1 : x0;
    const cut = outer + (inner - outer) * 0.13;
    out[side] = {
      x0: side > 0 ? x0 : cut, x1: side > 0 ? cut : x1,
      line: (x) => {
        const f = Math.max(0, Math.min(pts.length - 1.0001, (x - x0) / (x1 - x0) * (pts.length - 1)));
        const i = Math.floor(f), t = f - i;
        return { y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, half: Math.max(0.0014, (pts[i].half + (pts[i + 1].half - pts[i].half) * t) * 0.54) };
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
    const target = Math.floor(g.length * 0.5 / 3) * 3;
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
      if (wrapped.lowEdge(q) < 0.018 - i * 0.002) { found = { p: q, n: d, az, el, scale: 0.46 + R0() * 0.22 }; break; }
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

/**
 * The face layers every human gets, in paint order: the source's strokes smoothed, the make-up
 * off the eyes, the lips toned, the colour zones, pores, squint creases, the nasolabial fold.
 */
export function faceLayers({ L, eyes, cheek }) {
  const noseT = L.noseTip;
  const faceZone = (T) => (T.Y > 1.45 && Math.abs(T.X) < 0.1 ? 1 : 0);
  const notFeature = (T) => {
    // smooth the source's strokes on the open skin, not on the lips or inside the nostrils
    const lip = Math.hypot((T.X) / 0.032, (T.Y - (L.upperLip[1] - 0.011)) / 0.02);
    const nostril = Math.hypot(T.X / 0.024, (T.Y - (noseT[1] - 0.012)) / 0.012);
    return faceZone(T) * smooth(0.95, 1.3, lip) * smooth(0.9, 1.25, nostril);
  };
  // the inside of a nostril is dark: it faces down and back, and the sun must not find pink there
  const nostrils = (T) => {
    if (Math.abs(T.X) > 0.02 || T.Y > noseT[1] + 0.004 || T.Y < noseT[1] - 0.026 || T.Z < noseT[2] - 0.05) return;
    const k = smooth(-0.15, -0.65, T.ny);
    if (k <= 0) return;
    const m = 1 - 0.68 * k;
    T.r *= m; T.g *= m * 0.96; T.b *= m * 0.96;
    T.ao *= 1 - 0.5 * k;
  };
  return [
    smoothSkin({ zone: notFeature }),
    nostrils,
    eyeSocketClean({ eyes }),
    lipTone({ center: [0, L.upperLip[1] - 0.011, L.upperLip[2] - 0.006], r: [0.036, 0.024, 0.03] }),
    colourZones([
      { at: [0, 1.70, 0.08], s: [0.05, 0.024, 0.05], gain: [1.03, 1.03, 0.98], rough: -0.12 },           // the forehead, warm and yellow, a soft sheen
      { at: cheek, s: [0.024, 0.02, 0.03], gain: [1.05, 0.98, 0.95], rough: -0.16 },                     // the cheek, red through
      { at: [-cheek[0], cheek[1], cheek[2]], s: [0.024, 0.02, 0.03], gain: [1.05, 0.98, 0.95], rough: -0.16 },
      { at: noseT, s: [0.014, 0.02, 0.02], gain: [1.0, 1.01, 1.02], rough: -0.16 },                       // the nose, sun-reddened and oily
      { at: L.noseBridge, s: [0.012, 0.022, 0.02], gain: [1.02, 1.0, 0.98], rough: -0.14 },
      { at: [0, L.chin[1] + 0.024, L.chin[2]], s: [0.04, 0.02, 0.03], gain: [0.95, 0.94, 0.96] },         // the muzzle, cooler and greyer
      { at: L.chin, s: [0.018, 0.012, 0.016], gain: [1.05, 0.97, 0.94], rough: -0.1 },
      { at: [0.074, 1.635, -0.03], s: [0.016, 0.03, 0.028], gain: [1.05, 0.96, 0.93] },                     // the ears
      { at: [-0.074, 1.635, -0.03], s: [0.016, 0.03, 0.028], gain: [1.05, 0.96, 0.93] },
      { at: [eyes[0][0], eyes[0][1] - 0.0145, eyes[0][2] + 0.008], s: [0.017, 0.0065, 0.02], gain: [0.93, 0.9, 0.91] },   // under the eyes
      { at: [eyes[1][0], eyes[1][1] - 0.0145, eyes[1][2] + 0.008], s: [0.017, 0.0065, 0.02], gain: [0.93, 0.9, 0.91] },
      { at: [0, 1.50, 0.03], s: [0.05, 0.03, 0.06], gain: [0.94, 0.93, 0.93] },                           // under the jaw
    ]),
    pores({ depth: 0.00009, poreFreq: 820, zone: (T) => (T.Y > 1.42 && Math.abs(T.X) < 0.2 ? 1 : Math.abs(T.X) > 0.4 ? 0.6 : 0.4) }),
    creases([
      // sun creases at the outer eye corners: she squints for a living
      ...[1, -1].flatMap((sx) => {
        const e = eyes[sx > 0 ? 0 : 1];
        const z = e[2] - 0.006;
        return [
          { pts: [[e[0] + sx * 0.0225, e[1] + 0.0025, z - 0.002], [e[0] + sx * 0.0305, e[1] + 0.0065, z - 0.012]], w: 0.0009, depth: 0.00016, dark: 0.13 },
          { pts: [[e[0] + sx * 0.0235, e[1] - 0.0005, z - 0.002], [e[0] + sx * 0.0325, e[1] + 0.0005, z - 0.014]], w: 0.001, depth: 0.00018, dark: 0.15 },
          { pts: [[e[0] + sx * 0.0225, e[1] - 0.004, z - 0.002], [e[0] + sx * 0.0305, e[1] - 0.0065, z - 0.012]], w: 0.0009, depth: 0.00016, dark: 0.12 },
        ];
      }),
      // the fold from the wing of the nose toward the mouth corner
      ...[1, -1].map((sx) => ({ pts: [[sx * 0.0215, noseT[1] - 0.006, noseT[2] - 0.034], [sx * 0.0315, noseT[1] - 0.024, noseT[2] - 0.044], [sx * 0.0375, noseT[1] - 0.041, noseT[2] - 0.050]], w: 0.0026, depth: 0.00022, dark: 0.1 })),
      // two soft lines across the neck
      { pts: [[-0.05, 1.525, 0.035], [0, 1.519, 0.062], [0.05, 1.525, 0.035]], w: 0.0022, depth: 0.00016, dark: 0.08 },
    ]),
  ];
}

/**
 * A human skin atlas (1024² base, 512² normal + ORM), composited from the stock layout, the baked
 * form (ray-cast AO against skin + `occluders` + collar) and the layers of lib/skin.mjs +
 * lib/hair.mjs, with the eye patch blitted in. `marks` are the character's own layers (a salt
 * line, a scar, a tattoo), painted last. `collar` = flat triangles of the outfit near the neck.
 */
export async function paintHumanSkin({ bodyPrim, skinMat, layout, eyeR, EYE_PX, L, eyes, brows, shellGrid, occluders, collar = [], opens, marks = [], scar = null, tone = '#8A5A3C', iris = '#3B2A20', amber = '#5E3A20', hairColor = '#15110F', hairShape: shape = hairShape, names = 'human', fill = [0.05, 0.036, 0.03] }) {
  const W = 1024, AOW = 512;
  const baseTex = skinMat.getBaseColorTexture(), nTex = skinMat.getNormalTexture(), rTex = skinMat.getMetallicRoughnessTexture();
  const stock = await decodeStockSkin(baseTex.getImage(), nTex.getImage(), rTex.getImage());
  // the AO: skin (head, neck, shoulders), wrap, collar
  const pan = collar;
  const soup = [];
  triSoup(bodyPrim, null, soup);
  const headOnly = soup.filter((_, i) => true);
  for (let i = 0; i < occluders.length; i++) headOnly.push(occluders[i]);
  for (let t = 0; t + 8 < pan.length; t += 9) if (pan[t + 1] > 1.3 && pan[t + 4] > 1.3 && pan[t + 7] > 1.3 && Math.abs(pan[t]) < 0.3) headOnly.push(pan[t], pan[t + 1], pan[t + 2], pan[t + 3], pan[t + 4], pan[t + 5], pan[t + 6], pan[t + 7], pan[t + 8]);
  const grid = new TriGrid(new Float32Array(headOnly), 0.012);
  const pmA = positionMap(bodyPrim, AOW, AOW);
  const valid = (i) => !Number.isNaN(pmA.pos[i * 3]);
  const headTexel = (i) => { const o = i * 3; return pmA.pos[o + 1] > 1.40 && Math.abs(pmA.pos[o]) < 0.26; };
  const rawAO = bakeAOTexels(pmA, grid, { rays: 48, maxD: 0.07, lift: 0.0014, want: headTexel });
  const ao = blurMasked(rawAO, AOW, AOW, valid, 3);
  // the convexity, broad
  const convMap = scalarMap(bodyPrim, convexity(bodyPrim), W, W, 0);
  // the coil field (the same drawing the cards use)
  const coilF = coilField(192, 192, { count: 340, seed: 21 });
  const sampler = coilSampler(coilF, 0.058);
  // the hair coverage, blurred: a texel array over the 1024 layout
  const pm = positionMap(bodyPrim, W, W);
  const headish = (i) => pm.pos[i * 3 + 1] > 1.52 && Math.abs(pm.pos[i * 3]) < 0.1;
  const validT = (i) => !Number.isNaN(pm.pos[i * 3]);
  const rawCov = hairCoverage(pm, shellGrid, { W, want: headish, maxD: 0.03 });
  const cov = blurMasked(rawCov, W, W, validT, 5);
  const cheek = [L.cheekL[0] - 0.004, L.cheekL[1] - 0.004, L.cheekL[2] + 0.004];
  const layers = [
    ...faceLayers({ L, eyes, cheek }),
    hairlineLayer({
      sampler, hair: hairColor,
      coverage: (T) => {
        if (T.Y < 1.52 || Math.abs(T.X) > 0.1) return 0;
        return cov[T.y * W + T.x] * shape(T.X, T.Y, T.Z);
      },
      flowUV: (T, uv) => { uv[0] = Math.atan2(T.X, -T.Z + 0.001) * 0.09; uv[1] = T.Y; },
    }),
    lidLines({ open: opens[0], side: 1 }),
    lidLines({ open: opens[1], side: -1 }),
    browLayer({ x0: brows[1].x0, x1: brows[1].x1, line: brows[1].line, side: 1, seed: 17, scar, hair: hairColor }),
    browLayer({ x0: brows[-1].x1, x1: brows[-1].x0, line: brows[-1].line, side: -1, seed: 19, hair: hairColor }),
    ...marks,
  ];
  const toneMaps = seamlessTone(bodyPrim, layout.islands, layout.islandOf, stock, W);
  // the tone actually painted at the mid-cheek: the zones, grain and form all moved it, so the
  // first pass measures it and the second lands on `tone`
  const cheekMean = (P) => {
    let acc = [0, 0, 0], n = 0;
    for (let i = 0; i < W * W; i++) {
      const o = i * 3;
      if (!P.filled[i] || Number.isNaN(pm.pos[o])) continue;
      if (Math.hypot(pm.pos[o] - cheek[0], pm.pos[o + 1] - cheek[1], pm.pos[o + 2] - cheek[2]) >= 0.014) continue;
      acc[0] += P.base[o]; acc[1] += P.base[o + 1]; acc[2] += P.base[o + 2]; n++;
    }
    return acc.map((v) => v / Math.max(1, n));
  };
  const args = { prim: bodyPrim, islands: layout.islands, stock, W, tone, toneAt: cheek, ao, aoW: AOW, conv: convMap, layers, pm, toneMaps };
  const first = await paintSkinAtlas(args);
  const want = [parseInt(tone.slice(1, 3), 16), parseInt(tone.slice(3, 5), 16), parseInt(tone.slice(5, 7), 16)];
  const m0 = cheekMean(first);
  const painted = await paintSkinAtlas({ ...args, toneK: want.map((t, k) => t / Math.max(1, m0[k])) });
  painted.stats.cheekPainted = '#' + cheekMean(painted).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  // the eye patch
  const eyeP = paintEye(EYE_PX, { span: EYE_SPAN, iris, amber });
  const ex = Math.round(eyeR.x * W), ey = Math.round(eyeR.y * W);
  blit(painted.base, W, eyeP.base, EYE_PX, EYE_PX, ex, ey);
  blit(painted.normal, W, eyeP.normal, EYE_PX, EYE_PX, ex, ey);
  blit(painted.orm, W, eyeP.orm, EYE_PX, EYE_PX, ex, ey);
  baseTex.setImage(await webp(painted.base, W, { quality: 96 })).setMimeType('image/webp').setURI(`${names}-skin-base.webp`);
  nTex.setImage(await webp(painted.normal, W, { to: 512, quality: 96, kernel: 'lanczos3' })).setMimeType('image/webp').setURI(`${names}-skin-normal.webp`);
  rTex.setImage(await webp(painted.orm, W, { to: 512, quality: 90, kernel: 'mitchell' })).setMimeType('image/webp').setURI(`${names}-skin-orm.webp`);
  skinMat.setRoughnessFactor(1).setMetallicFactor(0).setDoubleSided(false);
  skinMat.setOcclusionTexture(rTex);
  skinMat.setOcclusionStrength(1);
  // the hero fill: light that went into the skin comes back out of it (no subsurface pass here), so the
  // shadow side keeps its form instead of going to a black mask. Same image, no new map, no new draw
  skinMat.setEmissiveTexture(baseTex).setEmissiveFactor(fill);
  return { stats: painted.stats };
}

