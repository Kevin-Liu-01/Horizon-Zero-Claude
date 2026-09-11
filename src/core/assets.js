import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Loads and normalizes all game models.
 *
 * Every model is wrapped in a Group so that, for the wrapper:
 *   - the model's feet sit at y = 0
 *   - it is scaled to real-world meters (spec table below)
 *   - its visual "forward" faces +Z (yaw-corrected per model)
 * Consumers clone via SkeletonUtils when they need independent skinned instances.
 */
const SPECS = {
  // yOffset: skirt tassels hang below the feet, so bbox-min grounding floats her
  aloy:       { url: '/models/aloy.glb',       targetHeight: 1.72, yaw: 0, yOffset: -0.055 },
  watcher:    { url: '/models/watcher.glb',    targetHeight: 2.1,  yaw: 0 },
  // canon scale: sawtooth "towers over Aloy", thunderjaw is 9m tall / 24m long
  sawtooth:   { url: '/models/sawtooth.glb',   targetHeight: 2.75, yaw: 0 },
  behemoth:   { url: '/models/behemoth.glb',   targetHeight: 4.5,  yaw: 0 },
  thunderjaw: { url: '/models/thunderjaw.glb', targetHeight: 9.4,  yaw: 0 },
  npc:        { url: '/models/npc.glb',        targetHeight: 1.8,  yaw: 0 },
};

// Animation packs: loaded raw (rest-pose skeleton + clips), never added to the
// scene. The clip library retargets them onto Aloy at boot (Round 4).
//   ual: Quaternius Universal Animation Library, CC0 — public/anims/LICENSE
const ANIMS = {
  ual: { url: '/anims/AnimationLibrary_Godot_Standard.gltf' },
};

/**
 * Per-mesh shadow policy (perf-tech-03). A shadow map costs one draw call per
 * caster, and these models are built from 10-45 separate meshes each — Aloy
 * alone was 45 shadow draws, a Thunderjaw 31 — while the buckles, straps, hair
 * cards and bolt heads contribute nothing to a silhouette that the body mesh
 * already casts. A mesh casts only if its own bounding sphere is a meaningful
 * fraction of the model's, and the largest few always cast so a model can never
 * lose its shape. Measured: 218 caster draws -> 119 for a staged eight-machine
 * fight, with no visible change to the shadows.
 */
export const SHADOW_POLICY = { minFraction: 0.15, alwaysLargest: 8 };

/** Apply SHADOW_POLICY to a normalized model root. Returns the caster count. */
export function applyShadowPolicy(root, policy = SHADOW_POLICY) {
  root.updateMatrixWorld(true);
  const _v = new THREE.Vector3();
  const entries = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const scale = _v.setFromMatrixColumn(o.matrixWorld, 0).length();
    entries.push({ o, r: (o.geometry.boundingSphere?.radius ?? 0) * scale });
  });
  if (!entries.length) return 0;
  entries.sort((a, b) => b.r - a.r);
  const modelR = entries[0].r || 1;
  let casters = 0;
  entries.forEach((e, i) => {
    const keep = i < policy.alwaysLargest || e.r >= policy.minFraction * modelR;
    e.o.castShadow = keep;
    e.o.userData.shadowRadius = e.r;
    if (keep) casters++;
  });
  return casters;
}

export class Assets {
  constructor() {
    this.models = {}; // name -> { root: Group, gltf, size: Vector3, spec }
    this.anims = {};  // name -> raw gltf { scene, animations }
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  async loadAll(onProgress = () => {}) {
    const names = Object.keys(SPECS);
    const animNames = Object.keys(ANIMS);
    const total = names.length + animNames.length;
    let done = 0;
    await Promise.all([
      ...names.map(async (name) => {
        const spec = SPECS[name];
        const gltf = await this.loader.loadAsync(spec.url);
        this.models[name] = this.normalize(name, gltf, spec);
        done += 1;
        onProgress(done / total, name);
      }),
      ...animNames.map(async (name) => {
        try {
          const gltf = await this.loader.loadAsync(ANIMS[name].url);
          gltf.scene.traverse((o) => { if (o.isMesh) o.visible = false; });
          this.anims[name] = gltf;
        } catch (err) {
          console.warn(`[assets] animation pack "${name}" failed to load — animator falls back to procedural`, err);
        }
        done += 1;
        onProgress(done / total, `${name} clips`);
      }),
    ]);
    return this.models;
  }

  /**
   * ROUND 4 (D8 / perf-tech-12) — additive model loading for lanes that own
   * their own species. `variety-assets.js` used to copy `_normalize` verbatim
   * together with a second GLTFLoader; that duplication is the contract debt
   * the frozen-file model cost us. Owners now call:
   *
   *   await ctx.assets.loadExtra({ scrapper: { url, targetHeight, yaw } }, {
   *     onEntry: (entry, name) => styleMachine(entry.root, STYLE[name]),
   *     onProgress: (p, name) => …,
   *   });
   *
   * Entries land in `assets.models[name]` with the exact same contract as
   * loadAll(): root > inner wrapper, feet at y = 0, real-world metres, visual
   * forward on +Z. Idempotent per name unless `force` is set.
   */
  async loadExtra(specs, { onProgress = () => {}, onEntry = null, force = false } = {}) {
    const names = Object.keys(specs).filter((n) => force || !this.models[n]);
    if (!names.length) return this.models;
    const total = names.length;
    let done = 0;
    await Promise.all(names.map(async (name) => {
      const spec = specs[name];
      const gltf = await this.loader.loadAsync(spec.url);
      const entry = this.normalize(name, gltf, spec);
      onEntry?.(entry, name, spec);
      this.models[name] = entry;
      done += 1;
      onProgress(done / total, name);
    }));
    return this.models;
  }

  /**
   * Public normalization contract (see the class doc). Kept as the single
   * implementation so no lane has to mirror it again.
   */
  normalize(name, gltf, spec) {
    const src = gltf.scene;
    src.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(src);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const scale = spec.targetHeight / (size.y || 1);

    // inner: recenters + scales the raw scene; outer: applies gameplay yaw
    const inner = new THREE.Group();
    inner.name = `${name}-inner`;
    inner.add(src);
    src.position.set(-center.x, -box.min.y + (spec.yOffset ?? 0) / scale, -center.z);
    inner.scale.setScalar(scale);
    inner.rotation.y = spec.yaw;

    const root = new THREE.Group();
    root.name = `${name}-root`;
    root.add(inner);

    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = true;
        if (o.material) {
          o.material.side = THREE.FrontSide; // double-sided kills perf on big models
        }
      }
    });

    const casters = applyShadowPolicy(root, spec.shadowPolicy ?? SHADOW_POLICY);

    const worldSize = size.clone().multiplyScalar(scale);
    return { root, gltf, size: worldSize, spec, animations: gltf.animations, shadowCasters: casters };
  }

  /** @deprecated back-compat alias — use normalize(). */
  _normalize(name, gltf, spec) { return this.normalize(name, gltf, spec); }

}
