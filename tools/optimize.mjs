import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, prune, weld, simplify, quantize, meshopt, textureCompress,
  metalRough, resample, flatten, join,
} from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'fs';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
mkdirSync('public/models', { recursive: true });

const JOBS = [
  {
    in: 'aloy_-_fortnite.glb', out: 'public/models/aloy.glb',
    textureSize: 1024, simplifyRatio: null, // skinned, already low-poly
  },
  {
    in: 'redeye_watcher_rig__horizon_zero_dawn.glb', out: 'public/models/watcher.glb',
    textureSize: 1024, simplifyRatio: null, specGloss: true,
  },
  {
    in: 'sawtooth_from_horizon_zero_dawn.glb', out: 'public/models/sawtooth.glb',
    textureSize: null, simplifyRatio: 0.5, joinStatic: true,
  },
  {
    in: 'thunderjaw_from_horizon_zero_dawn.glb', out: 'public/models/thunderjaw.glb',
    textureSize: null, simplifyRatio: 0.5, joinStatic: true,
  },
  {
    in: 'behemoth_from_horizon_zero_dawn.glb', out: 'public/models/behemoth.glb',
    textureSize: 1024, simplifyRatio: 0.12, joinStatic: true,
  },
  {
    in: 'horizon_zero_dawn_character_fanart.glb', out: 'public/models/npc.glb',
    textureSize: 1024, simplifyRatio: null,
  },
];

const only = process.argv[2];

for (const job of JOBS) {
  if (only && !job.in.includes(only)) continue;
  const t0 = Date.now();
  console.log(`\n--- ${job.in} -> ${job.out}`);
  const doc = await io.read(job.in);

  const transforms = [dedup(), prune()];

  if (job.specGloss) transforms.push(metalRough());
  if (job.joinStatic) transforms.push(flatten(), join());

  transforms.push(weld());

  if (job.simplifyRatio) {
    transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio: job.simplifyRatio, error: 0.001 }));
  }

  if (job.textureSize) {
    transforms.push(textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      quality: 82,
      resize: [job.textureSize, job.textureSize],
    }));
  }

  transforms.push(
    prune(),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  await doc.transform(...transforms);
  await io.write(job.out, doc);
  const inMB = (statSync(job.in).size / 1e6).toFixed(1);
  const outMB = (statSync(job.out).size / 1e6).toFixed(1);
  console.log(`    ${inMB}MB -> ${outMB}MB  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
console.log('\nDone.');
