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
  sawtooth:   { url: '/models/sawtooth.glb',   targetHeight: 2.4,  yaw: 0 },
  behemoth:   { url: '/models/behemoth.glb',   targetHeight: 4.5,  yaw: 0 },
  thunderjaw: { url: '/models/thunderjaw.glb', targetHeight: 7.5,  yaw: 0 },
  npc:        { url: '/models/npc.glb',        targetHeight: 1.8,  yaw: 0 },
};

export class Assets {
  constructor() {
    this.models = {}; // name -> { root: Group, gltf, size: Vector3, spec }
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  async loadAll(onProgress = () => {}) {
    const names = Object.keys(SPECS);
    let done = 0;
    await Promise.all(names.map(async (name) => {
      const spec = SPECS[name];
      const gltf = await this.loader.loadAsync(spec.url);
      this.models[name] = this._normalize(name, gltf, spec);
      done += 1;
      onProgress(done / names.length, name);
    }));
    return this.models;
  }

  _normalize(name, gltf, spec) {
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

    const worldSize = size.clone().multiplyScalar(scale);
    return { root, gltf, size: worldSize, spec, animations: gltf.animations };
  }
}
