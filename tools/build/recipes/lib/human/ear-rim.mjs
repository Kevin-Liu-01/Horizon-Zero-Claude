/**
 * CALIMA — M1.2b "no polygon edge visible on the ear rim at this distance": the ear's side-view silhouette, measured on the mesh.
 *
 *   node tools/build/recipes/lib/human/ear-rim.mjs [public/models/hero/brea.glb]
 *
 * Bind pose, game metres. The ear is Brea_Skin's triangles wholly outside |x| > 0.0735 (the head's side) between y 1.585 and
 * 1.705 and z -0.07 and 0.02 (brea.mjs's raw ear box, times the asset's scale). Seen along x from its own side, a silhouette edge is one whose two triangles face opposite ways
 * along x, or an edge of the ear region that is not on its cut against the head. Silhouette edges are joined into chains, and a
 * STRAIGHT RUN is a stretch of a chain whose edges turn less than 6 deg each, in projection (z, y); a CORNER is a turn of more
 * than 35 deg between two edges both longer than 1.2 mm. At the F13 lens (about 1 px per mm on the ear) a straight run past 3 mm
 * reads as a polygon edge. Returns, per ear, { silhouetteEdges, longestStraightMm, runsOver3mm, corners, meanEdgeMm }.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from './face.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

export async function earRim(file) {
  const THREE = await import('three');
  const doc = await (await io()).read(file);
  const root = doc.getRoot();
  const S = root.getAsset().extras?.r5Hero?.scale ?? 1;
  const node = root.listNodes().find((n) => n.getName() === 'Brea_Skin');
  const world = new Map();
  const wm = (n) => { if (world.has(n)) return world.get(n); const p = n.listParents().find((q) => q.propertyType === 'Node'); const m = (p ? wm(p).clone() : new THREE.Matrix4()).multiply(new THREE.Matrix4().fromArray(n.getMatrix())); world.set(n, m); return m; };
  const prim = node.getMesh().listPrimitives()[0], skin = node.getSkin(), J = skin.listJoints(), ibm = skin.getInverseBindMatrices();
  const jm = J.map((j, k) => { const e = []; ibm.getElement(k, e); return wm(j).clone().multiply(new THREE.Matrix4().fromArray(e)); });
  const P = prim.getAttribute('POSITION'), JJ = prim.getAttribute('JOINTS_0'), WW = prim.getAttribute('WEIGHTS_0');
  const n = P.getCount(), pos = new Float32Array(n * 3);
  const p = [], j = [], w = [], v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    P.getElement(i, p); JJ.getElement(i, j); WW.getElement(i, w); v.set(...p); acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) if (w[k]) { t.copy(v).applyMatrix4(jm[j[k]]); acc.addScaledVector(t, w[k]); }
    pos[i * 3] = acc.x * S; pos[i * 3 + 1] = acc.y * S; pos[i * 3 + 2] = acc.z * S;
  }
  const I = prim.getIndices().getArray();
  const CUT = 0.0735 * S, Y0 = 1.585 * S, Y1 = 1.705 * S, Z0 = -0.07 * S, Z1 = 0.02 * S;
  const out = {};
  for (const side of [1, -1]) {
    const inEar = (i) => side * pos[i * 3] > CUT && pos[i * 3 + 1] > Y0 && pos[i * 3 + 1] < Y1 && pos[i * 3 + 2] > Z0 && pos[i * 3 + 2] < Z1;
    const key = (i) => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    const E = new Map();
    for (let q = 0; q < I.length; q += 3) {
      const a = I[q], b = I[q + 1], c = I[q + 2];
      if (!inEar(a) || !inEar(b) || !inEar(c)) continue;
      const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], B = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], C = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
      const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      const facing = side * nx > 0;
      for (const [x, y] of [[a, b], [b, c], [c, a]]) {
        const kx = key(x), ky = key(y); if (kx === ky) continue;
        const id = kx < ky ? kx + '|' + ky : ky + '|' + kx;
        const e = E.get(id) || { f: [], x, y, kx, ky }; e.f.push(facing); E.set(id, e);
      }
    }
    const sil = [];
    for (const e of E.values()) {
      const nearCut = side * pos[e.x * 3] < CUT + 0.002 && side * pos[e.y * 3] < CUT + 0.002;
      if (e.f.length === 1 ? !nearCut : e.f.length === 2 && e.f[0] !== e.f[1]) sil.push(e);
    }
    // chains: walk silhouette edges through vertices of degree 2
    const adj = new Map();
    for (const e of sil) for (const k of [e.kx, e.ky]) { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(e); }
    const P2 = (i) => [pos[i * 3 + 2], pos[i * 3 + 1]];
    const used = new Set();
    let longest = 0, over3 = 0, corners = 0, total = 0;
    for (const e0 of sil) {
      if (used.has(e0)) continue;
      // go back to a chain end (or round a loop)
      let e = e0, k = e0.kx;
      for (let g = 0; g < sil.length; g++) { const nx = (adj.get(k) || []).filter((q) => q !== e); if (nx.length !== 1 || nx[0] === e0) break; e = nx[0]; k = e.kx === k ? e.ky : e.kx; }
      // walk forward from there, collecting points
      const pts = []; let cur = e, kk = k;
      pts.push(P2(cur.kx === kk ? cur.x : cur.y));
      while (cur && !used.has(cur)) {
        used.add(cur);
        const far = cur.kx === kk ? cur.y : cur.x; pts.push(P2(far)); kk = cur.kx === kk ? cur.ky : cur.kx;
        const nx = (adj.get(kk) || []).filter((q) => !used.has(q));
        cur = nx.length === 1 ? nx[0] : null;
      }
      let run = 0;
      for (let q = 1; q < pts.length; q++) {
        const L = Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]); total += L;
        if (q === 1) { run = L; continue; }
        const a1 = Math.atan2(pts[q - 1][1] - pts[q - 2][1], pts[q - 1][0] - pts[q - 2][0]), a2 = Math.atan2(pts[q][1] - pts[q - 1][1], pts[q][0] - pts[q - 1][0]);
        let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
        const Lp = Math.hypot(pts[q - 1][0] - pts[q - 2][0], pts[q - 1][1] - pts[q - 2][1]);
        if (d > 35 * Math.PI / 180 && L > 0.0012 && Lp > 0.0012) corners++;
        if (d < 6 * Math.PI / 180) run += L; else { if (run > 0.003) over3++; longest = Math.max(longest, run); run = L; }
      }
      if (run > 0.003) over3++; longest = Math.max(longest, run);
    }
    out[side > 0 ? 'left' : 'right'] = { silhouetteEdges: sil.length, longestStraightMm: +(longest * 1000).toFixed(2), runsOver3mm: over3, corners, meanEdgeMm: +((total / Math.max(1, sil.length)) * 1000).toFixed(2) };
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await earRim(path.resolve(process.argv[2] || path.join(ROOT, 'public/models/hero/brea.glb')))));
}
