/**
 * CALIMA — armor recipes: the outfit's triangle budget (M1.2g, armory M1a round 2).
 *
 *   decimateParts(parts, opts) -> { before, after, per: { slot: [before, after] } }
 *
 * Every part is simplified in place by edge collapse (meshoptimizer `simplifyWithAttributes`, its normals as attributes so
 * a fold's shading survives), to an ABSOLUTE geometric error in metres: `error` for cloth and leather, `per[slot]` where a
 * piece needs its own (small hard pieces: buckles, the plate, rivets). Open edges are locked (`LockBorder`): every hem,
 * rolled edge, cut rim and torn tooth keeps every vertex, so silhouettes and the armholes' rims do not move; attribute seams
 * (a uv seam's twin vertices) collapse together, so no crack opens. Vertices are only removed, never moved: what remains has
 * the same position, normal, uv and skin it had. Unused vertices are then dropped from every per-vertex array a part
 * carries (pos, nrm, uv, srcUV, uvNew, jnt, wgt).
 *
 * `cull(part, tri)` (optional) drops whole triangles first: geometry no camera sees (the trousers inside the boot shafts).
 *
 * What the error means on screen: F08 frames Brea at 2.5 m with a 42 deg lens on 900 px, about 2.1 mm a pixel. An error of
 * 1.5 mm is under a pixel there; on the face frames (0.8 m) the pieces in shot are the scarf and the top's neckline, whose
 * rims are locked.
 * Deterministic (no clocks, no randomness): the same parts give the same triangles.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
let _S = null;
async function simplifier() {
  if (_S) return _S;
  const mod = await import(pathToFileURL(createRequire(path.join(ROOT, 'package.json')).resolve('meshoptimizer')).href);
  await mod.MeshoptSimplifier.ready;
  _S = mod.MeshoptSimplifier;
  return _S;
}

/** Per-vertex arrays a part may carry, with their element sizes. */
const PER_VERTEX = { pos: 3, nrm: 3, uv: 2, srcUV: 2, uvNew: 2, jnt: 4, wgt: 4 };

/** Drop vertices no triangle uses, from every per-vertex array the part has. */
export function compactAll(part) {
  const n = part.pos.length / 3;
  const map = new Int32Array(n).fill(-1);
  const order = [];
  for (let i = 0; i < part.idx.length; i++) {
    const v = part.idx[i];
    if (map[v] < 0) { map[v] = order.length; order.push(v); }
    part.idx[i] = map[v];
  }
  for (const [k, w] of Object.entries(PER_VERTEX)) {
    const a = part[k];
    if (!a || a.length !== n * w) continue;
    const out = new Array(order.length * w);
    for (let j = 0; j < order.length; j++) for (let c = 0; c < w; c++) out[j * w + c] = a[order[j] * w + c];
    part[k] = out;
  }
  return part;
}

export async function decimateParts(parts, { error = 0.0015, per = {}, skip = new Set(), cull = null, normalWeight = 0.25 } = {}) {
  const S = await simplifier();
  const rep = { before: 0, after: 0, per: {} };
  for (const p of parts) {
    const t0 = p.idx.length / 3;
    rep.before += t0;
    if (cull) {
      const keep = [];
      for (let t = 0; t < p.idx.length; t += 3) if (!cull(p, [p.idx[t], p.idx[t + 1], p.idx[t + 2]])) keep.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]);
      p.idx = keep;
    }
    const err = per[p.slot] ?? error;
    if (!skip.has(p.slot) && err > 0 && p.idx.length >= 9) {
      const [out] = S.simplifyWithAttributes(new Uint32Array(p.idx), new Float32Array(p.pos), 3, new Float32Array(p.nrm), 3,
        [normalWeight, normalWeight, normalWeight], null, 0, err, ['LockBorder', 'ErrorAbsolute']);
      p.idx = Array.from(out);
    }
    compactAll(p);
    const t1 = p.idx.length / 3;
    rep.after += t1;
    const r = rep.per[p.slot] || [0, 0];
    r[0] += t0; r[1] += t1;
    rep.per[p.slot] = r;
  }
  return rep;
}
