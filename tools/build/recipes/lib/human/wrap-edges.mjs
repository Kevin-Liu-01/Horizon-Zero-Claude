/**
 * CALIMA — M1.2c "every fold edge has thickness of 3 mm or more (no paper edges)": the wrap's paper-edge length.
 *
 *   node tools/build/recipes/lib/human/wrap-edges.mjs [public/models/hero/brea.glb]
 *
 * Bind pose, game metres. An OPEN edge is a cloth edge of Brea_HairWrap with one triangle on it (keys by position, so a UV seam is
 * not an edge). It is SEEN when, from its midpoint, one of 64 directions across it (not along it) escapes 0.15 m without meeting the
 * skin or the wrap. It is a PAPER edge when nothing lies over it within 3 mm outward from the head's centre (a hem turned under its
 * layer shows that step as a rolled face; a bare sheet edge has none). Excluded: the coil, lock, lash and lid-rim cells (y >= 256 of
 * the 512² atlas) and edges whose texels are cut out by the alpha mask (the frayed fringe: sampled from the atlas when it decodes, else
 * the fringe cell [128, 128, 128, 64] inclusive of its last row). The result is attributed to the wrap's parts through extras.r5Wrap.
 * Returns { openEdges, seenOpenEdges, seenLengthMm, paperEdges, paperLengthMm, byPartMm }.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { io } from './face.mjs';
import { TriGrid } from './skin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

export async function wrapEdges(file) {
  const THREE = await import('three');
  const doc = await (await io()).read(file);
  const root = doc.getRoot();
  const ex = root.getAsset().extras || {};
  const S = ex.r5Hero?.scale ?? 1;
  const world = new Map();
  const wm = (n) => { if (world.has(n)) return world.get(n); const p = n.listParents().find((q) => q.propertyType === 'Node'); const m = (p ? wm(p).clone() : new THREE.Matrix4()).multiply(new THREE.Matrix4().fromArray(n.getMatrix())); world.set(n, m); return m; };
  const skinned = (node) => {
    const prim = node.getMesh().listPrimitives()[0], skin = node.getSkin(), J = skin.listJoints(), ibm = skin.getInverseBindMatrices();
    const jm = J.map((j, k) => { const e = []; ibm.getElement(k, e); return wm(j).clone().multiply(new THREE.Matrix4().fromArray(e)); });
    const P = prim.getAttribute('POSITION'), JJ = prim.getAttribute('JOINTS_0'), WW = prim.getAttribute('WEIGHTS_0'), UV = prim.getAttribute('TEXCOORD_0');
    const n = P.getCount(), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const p = [], j = [], w = [], u = [], v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      P.getElement(i, p); JJ.getElement(i, j); WW.getElement(i, w); v.set(...p); acc.set(0, 0, 0);
      for (let k = 0; k < 4; k++) if (w[k]) { t.copy(v).applyMatrix4(jm[j[k]]); acc.addScaledVector(t, w[k]); }
      pos[i * 3] = acc.x * S; pos[i * 3 + 1] = acc.y * S; pos[i * 3 + 2] = acc.z * S;
      if (UV) { UV.getElement(i, u); uv[i * 2] = u[0]; uv[i * 2 + 1] = u[1]; }
    }
    return { pos, uv, idx: prim.getIndices().getArray(), mat: prim.getMaterial() };
  };
  const nodes = Object.fromEntries(root.listNodes().filter((n) => n.getMesh()).map((n) => [n.getName(), n]));
  const wrap = skinned(nodes.Brea_HairWrap), body = skinned(nodes.Brea_Skin);
  // the atlas alpha, when the image decodes (a raw build); a shipped KTX2 atlas falls back to the fringe cell
  let alpha = null, W = 512;
  try {
    const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
    const img = wrap.mat.getBaseColorTexture()?.getImage();
    if (img) { const { data, info } = await sharp(Buffer.from(img)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); alpha = { data, w: info.width, h: info.height }; W = info.width; }
  } catch { alpha = null; }
  const cut = wrap.mat.getAlphaCutoff?.() ?? 0.5;
  const opaqueAt = (u, v) => {
    if (alpha) { const x = Math.min(alpha.w - 1, Math.max(0, Math.floor(u * alpha.w))), y = Math.min(alpha.h - 1, Math.max(0, Math.floor(v * alpha.h))); return alpha.data[(y * alpha.w + x) * 4 + 3] >= cut * 255; }
    const x = u * 512, y = v * 512;
    return !(x >= 128 && x < 256 && y >= 128 && y <= 192);
  };
  const soup = [];
  for (const m of [wrap, body]) for (const i of m.idx) soup.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
  const grid = new TriGrid(new Float32Array(soup), 0.01);
  const cum = []; { let s = 0; for (const [k, v] of Object.entries(ex.r5Wrap?.parts || {})) { s += v; cum.push([s, k]); } }
  const partOf = (ti) => { for (const [s, k] of cum) if (ti < s) return k; return 'cards'; };
  const clothTri = (a, b, c) => (wrap.uv[a * 2 + 1] + wrap.uv[b * 2 + 1] + wrap.uv[c * 2 + 1]) / 3 * 512 < 256;
  const key = (i) => `${Math.round(wrap.pos[i * 3] * 1e5)},${Math.round(wrap.pos[i * 3 + 1] * 1e5)},${Math.round(wrap.pos[i * 3 + 2] * 1e5)}`;
  const edges = new Map(), I = wrap.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!clothTri(a, b, c)) continue;
    for (const [p, q, r] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const ka = key(p), kb = key(q); if (ka === kb) continue;
      const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const e = edges.get(k) || { n: 0, p, q, r, t }; e.n++; edges.set(k, e);
    }
  }
  const dirs = [];
  for (let i = 0; i < 64; i++) { const z = 1 - 2 * (i + 0.5) / 64, r = Math.sqrt(1 - z * z), ph = i * 2.399963; dirs.push([r * Math.cos(ph), r * Math.sin(ph), z]); }
  const P = (i) => [wrap.pos[i * 3], wrap.pos[i * 3 + 1], wrap.pos[i * 3 + 2]];
  let open = 0, seenN = 0, seenLen = 0, paper = 0, paperLen = 0;
  const byPart = {};
  for (const e of edges.values()) {
    if (e.n !== 1) continue;
    open++;
    // the edge's texels, a third of a texel inside its triangle at three points along it: all cut out = a fringe, not an edge
    let any = false;
    for (const f of [0.2, 0.5, 0.8]) {
      const u = wrap.uv[e.p * 2] * (1 - f) + wrap.uv[e.q * 2] * f, v = wrap.uv[e.p * 2 + 1] * (1 - f) + wrap.uv[e.q * 2 + 1] * f;
      const du = wrap.uv[e.r * 2] - u, dv = wrap.uv[e.r * 2 + 1] - v, dl = Math.hypot(du * W, dv * W) || 1;
      if (opaqueAt(u + du / dl * 0.35, v + dv / dl * 0.35)) { any = true; break; }
    }
    if (!any) continue;
    const A = P(e.p), B = P(e.q);
    const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], el = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    const ed = [(B[0] - A[0]) / el, (B[1] - A[1]) / el, (B[2] - A[2]) / el];
    let seen = false;
    for (const d of dirs) {
      if (Math.abs(d[0] * ed[0] + d[1] * ed[1] + d[2] * ed[2]) > 0.5) continue;
      if (grid.cast(m[0] + d[0] * 0.0004, m[1] + d[1] * 0.0004, m[2] + d[2] * 0.0004, d[0], d[1], d[2], 0.15, 0.00005) < 0) { seen = true; break; }
    }
    if (!seen) continue;
    seenN++; seenLen += el;
    const hc = [0, 1.672 * S, -0.012 * S], rd = m.map((v, k) => v - hc[k]), rl = Math.hypot(...rd), d = rd.map((v) => v / rl);
    const h = grid.cast(m[0] + d[0] * 0.0002, m[1] + d[1] * 0.0002, m[2] + d[2] * 0.0002, d[0], d[1], d[2], 0.012, 0.00005);
    const gap = h < 0 ? 0 : h + 0.0002;
    if (gap < 0.003) { paper++; paperLen += el; const pn = partOf(e.t / 3); byPart[pn] = (byPart[pn] || 0) + el * 1000; }
  }
  return { openEdges: open, seenOpenEdges: seenN, seenLengthMm: +(seenLen * 1000).toFixed(1), paperEdges: paper, paperLengthMm: +(paperLen * 1000).toFixed(1), byPartMm: Object.fromEntries(Object.entries(byPart).map(([k, v]) => [k, Math.round(v)])), alphaFrom: alpha ? 'atlas' : 'fringe-cell', bead: ex.r5Wrap?.bead ?? null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await wrapEdges(path.resolve(process.argv[2] || path.join(ROOT, 'public/models/hero/brea.glb')))));
}
