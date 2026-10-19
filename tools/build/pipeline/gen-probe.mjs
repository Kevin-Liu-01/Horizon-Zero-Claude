/**
 * CALIMA pipeline fixture — the "datum probe" (project-original, pipeline lane).
 *
 * A 0.6 m survey stake: a hexagonal bisque plinth, a bronze post and a lamp
 * bead. It is never placed in the world. It exists to exercise the shared
 * loader on a real generated asset:
 *   - quantised (KHR_mesh_quantization) + meshopt (EXT_meshopt_compression),
 *   - a `_BONE` generator-label stream (1-byte, interleaved by meshopt),
 *   - a TEXCOORD_1 decal set,
 *   - a lamp material (must never cast a shadow),
 *   - `asset.extras.provenance` + `asset.extras.r5Size`.
 * `probe.ref.json` (next to this file) is the float snapshot of every mesh's
 * positions taken after reorder and before quantisation, i.e. the exact
 * source `A-loader-fixes` measures the dequantised load against.
 *
 *   node tools/build/pipeline/gen-probe.mjs [--out <dir>]   (default: repo root)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bucket, lathe, strut, ball, V, THREE } from '../lib/hs.mjs';
import { writeGLB, snapshotPositions } from '../lib/glb.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
export const LANE = 'pipeline';
export const RECIPE = 'tools/build/pipeline/gen-probe.mjs';
export const OUTPUTS = ['public/models/pipeline/probe.glb', 'tools/build/pipeline/probe.ref.json'];

function labelled(bucket, label) {
  const n = bucket.pos.length / 3;
  bucket.labels = new Array(n).fill(label);
  // planar decal set over the probe's footprint (x, z in [-0.2, 0.2] -> [0, 1])
  bucket.uv1 = [];
  for (let i = 0; i < bucket.pos.length; i += 3) {
    bucket.uv1.push(THREE.MathUtils.clamp(bucket.pos[i] / 0.4 + 0.5, 0, 1),
      THREE.MathUtils.clamp(bucket.pos[i + 2] / 0.4 + 0.5, 0, 1));
  }
  return bucket;
}

export async function build({ out = ROOT } = {}) {
  const plinth = new Bucket('probe-plinth');
  lathe(plinth, [
    { r: 0.0, h: 0.0 }, { r: 0.18, h: 0.0 }, { r: 0.18, h: 0.05 }, { r: 0.15, h: 0.08 },
    { r: 0.06, h: 0.09 }, { r: 0.0, h: 0.09 },
  ], null, { segs: 6, surf: 'bisque', tone: 0xd8cdb6, crease: 30 });
  const post = new Bucket('probe-post');
  strut(post, V(0, 0.08, 0), V(0, 0.52, 0), 0.028, 0.022, { surf: 'bronze', tone: 0xb07a3c, sides: 10 });
  const lamp = new Bucket('probe-lamp');
  ball(lamp, V(0, 0.55, 0), 0.045, { surf: 'lamp', tone: 0xf2ead3, w: 14, h: 10 });

  const glbFile = path.join(out, OUTPUTS[0]);
  const refFile = path.join(out, OUTPUTS[1]);
  const res = await writeGLB([
    { bucket: labelled(plinth, 0), material: { name: 'probe-bisque' } },
    { bucket: labelled(post, 1), material: { name: 'probe-bronze' } },
    { bucket: labelled(lamp, 2), material: { name: 'probe-lamp', emissive: [0.95, 0.92, 0.83] } },
  ], {
    file: glbFile,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    reference: (doc) => snapshotPositions(doc),
  });
  mkdirSync(path.dirname(refFile), { recursive: true });
  writeFileSync(refFile, `${JSON.stringify({ recipe: RECIPE, space: 'gltf scene (identity node transforms before quantisation)', meshes: res.reference })}\n`);
  return { files: [glbFile, refFile], bytes: res.bytes, tris: res.tris, verts: res.verts, materials: res.materials, meshes: res.meshes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const r = await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT });
  console.log(JSON.stringify({ ...r, files: r.files.map((f) => path.relative(process.cwd(), f)) }));
}
