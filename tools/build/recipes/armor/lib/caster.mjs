/**
 * CALIMA — armor recipes: the hero's shadow proxy for a set (M1.2g, M1a fix round 1).
 *
 *   shadowCaster(parts, body, { target, inset, slots }) -> { pos, jnt, wgt, idx, tris }
 *
 * M1.2g's "frame totals unchanged" failed at +49 % (F08 96,835 triangles against 64,802 at b4b46fb): Brea's skin and her outfit
 * each cast in two shadow passes, so her ~28 k cast triangles were drawn twice more. One proxy now casts for both, as the
 * people's `Caster` does (npc/lib/human.mjs): her body and the set's large pieces welded by position, simplified by edge
 * collapse to `target` triangles, then pulled IN along its normals by `inset` (a proxy that stood outside her would shadow her
 * own lit side; one a few millimetres inside leaves every lit face lit and still throws her outline on the ground and her arms'
 * shadows on her). Its skin is the source vertices' own (collapse keeps original vertices). Deterministic, Node only.
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

export const CASTER_SLOTS = new Set(['smock', 'binds', 'peplum', 'trousers', 'boots', 'panel', 'scarf', 'case', 'sashband', 'girdle', 'belt2', 'glove', 'armwrap', 'harness']);

export async function shadowCaster(parts, body, { target = 3000, inset = 0.006, slots = CASTER_SLOTS, weld = 0.004 } = {}) {
  const S = await simplifier();
  const pos = [], jnt = [], wgt = [], idx = [];
  const key = new Map();
  const q = (v) => Math.round(v / weld);
  const add = (P) => {
    const n = P.pos.length / 3, map = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${q(P.pos[i * 3])},${q(P.pos[i * 3 + 1])},${q(P.pos[i * 3 + 2])}`;
      let v = key.get(k);
      if (v === undefined) {
        v = pos.length / 3; key.set(k, v);
        pos.push(P.pos[i * 3], P.pos[i * 3 + 1], P.pos[i * 3 + 2]);
        for (let c = 0; c < 4; c++) { jnt.push(P.jnt[i * 4 + c]); wgt.push(P.wgt[i * 4 + c]); }
      }
      map[i] = v;
    }
    for (let t = 0; t < P.idx.length; t += 3) {
      const a = map[P.idx[t]], b = map[P.idx[t + 1]], c = map[P.idx[t + 2]];
      if (a !== b && b !== c && a !== c) idx.push(a, b, c);
    }
  };
  add(body);
  for (const P of parts) if (slots.has(P.slot) && P.idx.length) add(P);
  const P32 = new Float32Array(pos);
  let I = new Uint32Array(idx);
  // an absolute error ceiling: 2.5 cm (her own scale is 1.8 m), relaxed until the target is met, then sloppy if it must
  const ext = S.getScale ? S.getScale(P32, 3) : 1.8;
  let err = 0.025 / ext, out = I;
  for (let k = 0; k < 8; k++) {
    [out] = S.simplify(I, P32, 3, target * 3, err, []);
    if (out.length / 3 <= target * 1.05) break;
    err *= 1.6;
  }
  if (out.length / 3 > target * 1.25 && S.simplifySloppy) [out] = S.simplifySloppy(out, P32, 3, null, target * 3, err);
  // compact
  const used = new Int32Array(pos.length / 3).fill(-1), o = { pos: [], jnt: [], wgt: [], idx: [] };
  for (const v of out) if (used[v] < 0) { used[v] = o.pos.length / 3; o.pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); for (let c = 0; c < 4; c++) { o.jnt.push(jnt[v * 4 + c]); o.wgt.push(wgt[v * 4 + c]); } }
  for (const v of out) o.idx.push(used[v]);
  // area-weighted normals, then in by `inset`
  const nv = o.pos.length / 3, N = new Float64Array(nv * 3);
  for (let t = 0; t < o.idx.length; t += 3) {
    const a = o.idx[t], b = o.idx[t + 1], c = o.idx[t + 2];
    const e1 = [0, 1, 2].map((k) => o.pos[b * 3 + k] - o.pos[a * 3 + k]), e2 = [0, 1, 2].map((k) => o.pos[c * 3 + k] - o.pos[a * 3 + k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[v * 3 + k] += n[k];
  }
  for (let v = 0; v < nv; v++) {
    const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) o.pos[v * 3 + k] -= (N[v * 3 + k] / l) * inset;
  }
  o.tris = o.idx.length / 3;
  return o;
}

/** Add the proxy to a set's document as the skinned mesh `Caster` (no uv, no normal; its own material, never drawn lit). */
export function addCasterNode(doc, caster, { nodeByName }) {
  const root = doc.getRoot();
  const buf = root.listBuffers()[0] || doc.createBuffer();
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const w = new Float32Array(caster.wgt);
  for (let i = 0; i < w.length; i += 4) { const s = w[i] + w[i + 1] + w[i + 2] + w[i + 3] || 1; for (let c = 0; c < 4; c++) w[i + c] /= s; }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(caster.pos)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint8Array(caster.jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', w))
    .setIndices(acc('SCALAR', new Uint32Array(caster.idx)))
    .setMaterial(doc.createMaterial('MI_Hero_Caster').setBaseColorFactor([0, 0, 0, 1]));
  const node = doc.createNode('Caster').setMesh(doc.createMesh('Caster').addPrimitive(prim)).setSkin(root.listSkins()[0]).setExtras({ r5Caster: true });
  nodeByName(doc, 'Armature').addChild(node);
  return node;
}
