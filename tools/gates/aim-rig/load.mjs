/**
 * M1.3b (hero-anim) — Brea's real animator in Node, no browser.
 *
 * Loads `brea.glb` and the two clip packs the way the game's asset loader does (meshopt decoded, the model
 * normalised to its row's target height), with every texture stripped from the glTF JSON first (the KTX2
 * textures need a GPU transcoder and nothing here draws), attaches the rig profile, clones her the way
 * `player.js` does and builds the real `PlayerAnimator` on that clone. The caller drives a player stub.
 *
 * It is the aim rig's offline bench (`tools/gates/aim-rig/bench.mjs`): every cell of the stance x move x yaw
 * matrix is stepped here before a browser is spent on it. It is not a gate: the gates run in the page.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// FileLoader reads data: URIs through fetch and reports progress with the DOM's ProgressEvent
globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, o = {}) { this.type = type; Object.assign(this, o); } };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PUB = path.join(ROOT, 'public');

/** glTF JSON with every texture, image and sampler removed (and the materials' references to them). */
function stripTextures(j) {
  delete j.images; delete j.textures; delete j.samplers;
  for (const m of j.materials || []) {
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        if (/Texture$/.test(k) && o[k] && typeof o[k] === 'object' && 'index' in o[k]) delete o[k];
        else walk(o[k]);
      }
    };
    walk(m);
  }
  const drop = (a) => (a || []).filter((x) => x !== 'KHR_texture_basisu');
  if (j.extensionsRequired) j.extensionsRequired = drop(j.extensionsRequired);
  if (j.extensionsUsed) j.extensionsUsed = drop(j.extensionsUsed);
  return j;
}

function glbStripped(file) {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const j = stripTextures(JSON.parse(b.subarray(20, 20 + jl).toString('utf8')));
  let js = Buffer.from(JSON.stringify(j), 'utf8');
  const pad = (4 - (js.length % 4)) % 4;
  js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const rest = b.subarray(20 + jl);
  const out = Buffer.alloc(12 + 8 + js.length + rest.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(js.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
  js.copy(out, 20); rest.copy(out, 20 + js.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

function gltfInline(file) {
  const j = stripTextures(JSON.parse(readFileSync(file, 'utf8')));
  for (const bf of j.buffers || []) {
    if (bf.uri && !bf.uri.startsWith('data:')) {
      bf.uri = 'data:application/octet-stream;base64,' + readFileSync(path.join(path.dirname(file), bf.uri)).toString('base64');
    }
  }
  return JSON.stringify(j);
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const parse = (data) => new Promise((res, rej) => loader.parse(data, '', res, rej));

/** `src/core/assets.js` normalize(), the parts an animator can see (feet at 0, scaled, yawed). */
function normalize(name, gltf, spec) {
  const src = gltf.scene;
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const scale = spec.targetHeight / (size.y || 1);
  const inner = new THREE.Group(); inner.name = `${name}-inner`; inner.add(src);
  src.position.set(-center.x, -box.min.y, -center.z);
  inner.scale.setScalar(scale); inner.rotation.y = spec.yaw ?? 0;
  const root = new THREE.Group(); root.name = `${name}-root`; root.add(inner);
  return { root, gltf, size: size.clone().multiplyScalar(scale), spec, animations: gltf.animations, extras: gltf.parser?.json?.asset?.extras || {} };
}

export async function loadBrea() {
  await MeshoptDecoder.ready;
  const { SPECS } = await import(path.join(ROOT, 'src/core/assets.specs.js'));
  const heroG = await parse(glbStripped(path.join(PUB, 'models/hero/brea.glb')));
  const hero = normalize('hero', heroG, SPECS.hero);
  const ual = await parse(gltfInline(path.join(PUB, 'anims/AnimationLibrary_Godot_Standard.gltf')));
  const heroUal2 = await parse(glbStripped(path.join(PUB, 'models/hero/brea-clips-ual2.glb')));
  const { attachRigProfile } = await import(path.join(ROOT, 'src/entities/anim/rigs/index.js'));
  attachRigProfile(hero.root);
  return { hero, ual, heroUal2 };
}

/** A fresh model + animator on a player stub. `opts.Animator` swaps the class under test. */
export async function makeRig(assets, opts = {}) {
  const { PlayerAnimator } = opts.Animator ? { PlayerAnimator: opts.Animator }
    : await import(path.join(ROOT, 'src/entities/playerAnimator.js'));
  const model = skeletonClone(assets.hero.root);
  model.name = 'player';
  const scene = new THREE.Scene(); scene.add(model);
  const listeners = {};
  const events = { on: (k, f) => { (listeners[k] ||= []).push(f); }, off() {}, emit: (k, e) => { for (const f of listeners[k] || []) f(e); } };
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000);
  scene.add(camera);
  const player = {
    position: new THREE.Vector3(), velocity: new THREE.Vector3(), heading: 0, camYaw: Math.PI, camPitch: 0,
    aiming: false, crouching: false, dodging: false, grounded: true, mantling: false, sliding: false, riding: null,
    moveSpeed: 0, health: 100, groundNormal: new THREE.Vector3(0, 1, 0), model, hero: null, drawStrength: 0,
  };
  const combat = {
    drawStrength: 0, aimPoint: new THREE.Vector3(), weaponDrawn: 'bow', activeWeapon: null, steady: { active: false },
    melee: null, bow: null,
  };
  const ctx = { player, combat, camera, events, scene, state: 'play', assets: { models: { hero: assets.hero }, anims: { ual: assets.ual, heroUal2: assets.heroUal2 } } };
  const an = new PlayerAnimator(ctx, model);
  player.animator = an;
  return { ctx, model, an, player, combat, camera, events, scene };
}
export { THREE };
