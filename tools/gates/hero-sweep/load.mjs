/**
 * M1.2e / M1.2f / M1.3c / M1.3f (hero-anim) — Brea dressed, in Node, no browser.
 *
 * `aim-rig/load.mjs` builds her real animator on the bare body. This adds what she wears in the game: the Starter
 * outfit (`outfit-pan-1.glb`, with its sash-tail joint) and the stow kit (`stowkit-v0.glb`: the stowed lance, bow,
 * quiver and the bracer), installed by the game's own `HeroRig` (`src/hero/index.js`), so the cloth chains, the
 * carry solve and the outfit's vertices are the game's. Textures are stripped, as in `aim-rig/load.mjs`.
 *
 * It is the offline bench of the sweep rows (`hero-sweep/bench.mjs`); the gates run in the page.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { register } from 'module';
import { loadBrea, makeRig } from '../aim-rig/load.mjs';

register(new URL('./vite-stub.mjs', import.meta.url));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PUB = path.join(ROOT, 'public');

function stripGlb(file) {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  delete j.images; delete j.textures; delete j.samplers;
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (/Texture$/.test(k) && o[k] && typeof o[k] === 'object' && 'index' in o[k]) delete o[k];
      else walk(o[k]);
    }
  };
  for (const m of j.materials || []) walk(m);
  const drop = (a) => (a || []).filter((x) => x !== 'KHR_texture_basisu');
  if (j.extensionsRequired) j.extensionsRequired = drop(j.extensionsRequired);
  if (j.extensionsUsed) j.extensionsUsed = drop(j.extensionsUsed);
  let js = Buffer.from(JSON.stringify(j), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const rest = b.subarray(20 + jl);
  const out = Buffer.alloc(20 + js.length + rest.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(js.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
  js.copy(out, 20); rest.copy(out, 20 + js.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const parse = (data) => new Promise((res, rej) => loader.parse(data, '', res, rej));

/** `src/core/assets.js` normalize() for a part row (feet at 0, scaled to the row's height). */
function normalizePart(name, gltf, spec) {
  const src = gltf.scene;
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const scale = spec.targetHeight / (size.y || 1);
  const inner = new THREE.Group(); inner.name = `${name}-inner`; inner.add(src);
  src.position.set(-center.x, -box.min.y, -center.z);
  inner.scale.setScalar(scale); inner.rotation.y = spec.yaw ?? 0;
  const root = new THREE.Group(); root.name = `${name}-root`; root.add(inner);
  return { root, gltf, spec, animations: gltf.animations, extras: gltf.parser?.json?.asset?.extras || {} };
}

/** Brea's assets plus the outfit and the stow kit rows, as `ctx.assets.models` holds them. */
export async function loadDressed({ outfitFile = null } = {}) {
  const quiet = [console.log, console.table, console.warn];
  console.log = () => {}; console.table = () => {}; console.warn = () => {};
  try {
    await MeshoptDecoder.ready;
    const A = await loadBrea();
    const { SPECS } = await import(path.join(ROOT, 'src/core/assets.specs.js'));
    const parts = {};
    for (const row of ['heroOutfitPan1', 'heroStowKit']) {
      const spec = SPECS[row];
      const file = row === 'heroOutfitPan1' && outfitFile ? outfitFile : path.join(PUB, spec.url);
      parts[row] = normalizePart(row, await parse(stripGlb(file)), spec);
    }
    return { ...A, parts };
  } finally { [console.log, console.table, console.warn] = quiet; }
}

/**
 * A fresh dressed rig: `aim-rig/load.mjs makeRig`, then the game's `HeroRig` installed on the clone (outfit
 * equipped, stow kit attached). `R.hero` is the HeroRig; call `R.hero.update(dt)` after the animator each step.
 */
export async function makeDressedRig(assets, opts = {}) {
  const quiet = [console.log, console.table, console.warn];
  console.log = () => {}; console.table = () => {}; console.warn = () => {};
  try {
    const R = await makeRig(assets, opts);
    R.ctx.assets.models.heroOutfitPan1 = assets.parts.heroOutfitPan1;
    R.ctx.assets.models.heroStowKit = assets.parts.heroStowKit;
    R.player.ctx = R.ctx;
    R.player._collectMaterials = () => {};
    R.ctx.environment = null;
    const { installHero } = await import(path.join(ROOT, 'src/hero/index.js'));
    R.hero = installHero(R.player);
    R.player.hero = R.hero;
    return R;
  } finally { [console.log, console.table, console.warn] = quiet; }
}
export { THREE };
