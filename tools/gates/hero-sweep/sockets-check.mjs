/**
 * M1a weapons step 1 (ruling 10): `src/hero/sockets.js` against the BUILT weapon meshes, in Node. Each socket's point
 * must lie within 2 mm of the centreline of the stave or haft at its height (the centreline taken as the centroid of
 * the mesh's own vertex ring nearest that height, interpolated between the two rings around it).
 *
 *   node tools/gates/hero-sweep/sockets-check.mjs        prints one line a socket and exits 1 on a miss
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SOCKETS } from '../../../src/hero/sockets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const strip = (b) => {
  const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl));
  delete j.images; delete j.textures; delete j.samplers;
  for (const m of j.materials || []) { for (const o of [m, m.pbrMetallicRoughness || {}]) for (const k of Object.keys(o)) if (/Texture$/.test(k)) delete o[k]; }
  for (const k of ['extensionsRequired', 'extensionsUsed']) if (j[k]) j[k] = j[k].filter((x) => x !== 'KHR_texture_basisu');
  let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const rest = b.subarray(20 + jl); const out = Buffer.alloc(20 + js.length + rest.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8); out.writeUInt32LE(js.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
  js.copy(out, 20); rest.copy(out, 20 + js.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
};
await MeshoptDecoder.ready;
const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
const load = async (f) => { const g = await new Promise((res, rej) => L.parse(strip(readFileSync(path.join(ROOT, 'public/models/armory', f))), '', res, rej)); let m = null; g.scene.traverse((o) => { if (!m && o.isMesh) m = o; }); return m; };

/** ring centroids by y (the stave's kind-0 vertices for the bow, every vertex for the lance), sorted: a ring is a run
 *  of vertices whose heights lie within 8 mm of the one before (the stave's rings are skewed along it) */
function rings(mesh) {
  const pos = mesh.geometry.getAttribute('position'), bw = mesh.geometry.getAttribute('_bw');
  const v = [];
  for (let i = 0; i < pos.count; i++) if (!bw || Math.round(bw.getX(i)) === 0) v.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  v.sort((a, b) => a[1] - b[1]);
  const out = [];
  let cur = [];
  /* (the ring's centre is the middle of its extent, not its mean: a ring's seam vertex is doubled) */
  const mid = (a) => (Math.min(...a) + Math.max(...a)) / 2;
  const flush = () => { if (cur.length >= 3) out.push({ y: cur.reduce((s, p) => s + p[1], 0) / cur.length, x: mid(cur.map((p) => p[0])), z: mid(cur.map((p) => p[2])) }); cur = []; };
  for (const p of v) { if (cur.length && p[1] - cur[cur.length - 1][1] > 0.008) flush(); cur.push(p); }
  flush();
  return out;
}
function centre(R, y) {
  let lo = R[0], hi = R[R.length - 1];
  for (const r of R) { if (r.y <= y && r.y >= lo.y) lo = r; if (r.y >= y && r.y <= hi.y) hi = r; }
  const k = hi.y > lo.y ? (y - lo.y) / (hi.y - lo.y) : 0;
  return { x: lo.x + (hi.x - lo.x) * k, z: lo.z + (hi.z - lo.z) * k, lo: lo.y, hi: hi.y };
}
let bad = 0;
for (const [kind, file, names] of [['bow', 'bow-sabina.glb', ['grip', 'limb']], ['lance', 'lance-shepherd.glb', ['butt', 'grip', 'fore']]]) {
  const R = rings(await load(file));
  for (const n of names) {
    const s = SOCKETS[kind][n], c = centre(R, s.p[1]);
    const d = Math.hypot(s.p[0] - c.x, s.p[2] - c.z);
    const ok = d <= 0.002;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${kind}.${n} at y ${s.p[1]}: ${(d * 1000).toFixed(2)} mm off the centreline (${c.x.toFixed(4)}, ${c.z.toFixed(4)}; rings ${c.lo.toFixed(4)}..${c.hi.toFixed(4)})`);
  }
}
process.exit(bad ? 1 : 0);
