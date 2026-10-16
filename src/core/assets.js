import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SPECS as CORE_SPECS, ANIMS as CORE_ANIMS, DELETED } from './assets.specs.js';

/**
 * Loads and normalizes all game models.
 *
 * Every model is wrapped in a Group so that, for the wrapper:
 *   - the model's feet sit at y = 0
 *   - it is scaled to real-world meters (row `targetHeight`)
 *   - its visual "forward" faces +Z (row `yaw`)
 * Consumers clone via SkeletonUtils when they need independent skinned instances.
 *
 * ROUND 5 (pipeline lane, W0a). The row table is DATA: `src/core/assets.specs.js`
 * plus the optional `BOOT_SPECS` export of `src/entities/machines/legacy.js`.
 * This file names no row, so adding or deleting a row and its file needs no
 * code edit (`A-specs-data-driven`). R30 rows (`DELETED`): a file this lane
 * deleted is never fetched; a file whose deletion belongs to instruments-core
 * (with the class that reads it) is loaded only while that class is still in
 * the tree. Every R30 kind that is gone is listed in `assets.skipped` as
 * `SKIP-legacy-deleted`. There is no placeholder body of any kind.
 */

/**
 * Optional legacy rows (instruments-core's `machines/legacy.js`, W0a collapse).
 * `import.meta.glob` resolves to `{}` when the file does not exist, so this
 * module works whether or not that collapse has merged. LAZY: the loader is a
 * function, called inside `loadAll` — by then `machines/index.js` has already
 * evaluated legacy.js, so this returns the same module instance, and boot
 * module order (and any import cycle) is exactly what it was.
 *   BOOT_SPECS    boot-critical rows, loaded by `loadAll` (none today)
 *   LEGACY_SPECS  deferred rows legacy.js loads itself through `loadExtra`;
 *                 listed in `assets.deferredSpecs` for tools, never fetched here
 */
const LEGACY_MODULES = import.meta.glob('../entities/machines/legacy.js');

/**
 * R30 presence test: the machine class files in this tree. The glob is lazy
 * (nothing is imported); only its keys are read. An R30 row with a `reader`
 * (instruments-core's deletion: the GLB and its class go in one change, plan
 * §6) is served while that class is here and is gone once it is not, so the
 * body and the class that builds it always exist together, in any merge order.
 */
const LIVE_CLASS_FILES = import.meta.glob('../entities/machines/*.js');

/** True while an R30 row's file is still served in this tree (its reader class is present). */
export function r30Live(row) {
  return !!row?.row && !!row.reader && row.owner !== 'pipeline'
    && !!LIVE_CLASS_FILES[`../${String(row.reader).replace(/^src\//, '')}`];
}

/** url -> DELETED row, so a deferred `loadExtra` row naming an R30 file follows the same rule. */
const DELETED_URLS = new Map(Object.values(DELETED).map((r) => [`/${r.file.replace(/^public\//, '')}`, r]));

/** Drop every row whose name or url is an R30 file that is gone from this tree. */
function withoutDeleted(rows) {
  const out = { ...rows };
  for (const [name, r] of Object.entries(DELETED)) if (!r30Live(r)) delete out[name];
  for (const [name, row] of Object.entries(out)) {
    const r = DELETED_URLS.get(row?.url);
    if (r && !r30Live(r)) delete out[name];
  }
  return out;
}

/** The R30 rows still served in this tree (name -> boot row): their reader classes are present. */
function liveR30Rows() {
  const out = {};
  for (const [name, r] of Object.entries(DELETED)) if (r30Live(r)) out[name] = { ...r.row };
  return out;
}

/**
 * The core boot rows: assets.specs.js `SPECS` plus the R30 rows still served
 * here, minus every R30 file that is gone. `ctx.assets.specs` adds legacy
 * BOOT_SPECS at loadAll.
 */
export const SPECS = withoutDeleted({ ...liveR30Rows(), ...CORE_SPECS });
export const ANIMS = { ...CORE_ANIMS };
export { DELETED };

/** Read legacy.js's optional row exports: `{ boot, deferred }` (both `{}` when absent). */
export async function legacyRows() {
  const boot = {}, deferred = {};
  for (const load of Object.values(LEGACY_MODULES)) {
    const mod = await load();
    if (mod?.BOOT_SPECS && typeof mod.BOOT_SPECS === 'object') Object.assign(boot, mod.BOOT_SPECS);
    if (mod?.LEGACY_SPECS && typeof mod.LEGACY_SPECS === 'object') Object.assign(deferred, mod.LEGACY_SPECS);
  }
  return { boot: withoutDeleted(boot), deferred: withoutDeleted(deferred) };
}

/** Material names that never hold a shadow-caster slot (lamps, lenses). */
const DEFAULT_NO_SHADOW = /\b(lamp|sensor|lens)\b/i;

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

const _v = new THREE.Vector3();

/** Apply SHADOW_POLICY to a normalized model root. Returns the caster count. */
export function applyShadowPolicy(root, policy = SHADOW_POLICY) {
  root.updateMatrixWorld(true);
  const entries = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.userData.noShadow) { o.castShadow = false; return; }
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

/**
 * SHARED LOADER FIX 1 — read any attribute component through the accessor,
 * never through `.array`. EXT_meshopt_compression streams arrive INTERLEAVED:
 * a 1-byte attribute's backing array is 4x its vertex count (stride 4), and
 * KHR_mesh_quantization stores normalised Int8/Int16. `getComponent` handles
 * both (offset, stride and denormalisation).
 */
export function readAttribute(attr, out = null) {
  const n = attr.count * attr.itemSize;
  const f = out && out.length >= n ? out : new Float32Array(n);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) f[i * attr.itemSize + c] = attr.getComponent(i, c);
  }
  return f;
}

/** True when an attribute is not already a plain, non-normalised Float32 stream. */
export function isQuantised(attr) {
  return !!attr && (attr.normalized || attr.isInterleavedBufferAttribute || !(attr.array instanceof Float32Array));
}

/**
 * SHARED LOADER FIX 2 — dequantise once per row on load. `rig/lod.js`
 * `unifySkin` re-bakes meshes with `setXYZ`; on a NORMALISED Int16 position
 * that clamps every vertex outside the node's [-1, 1] box (measured in the
 * Round-5 proof: lenses smeared 4.4 m down the body). Plain Float32 streams
 * make every downstream pass safe. Integer generator labels (`_bone`) and
 * skin streams are left as they are; labels are lifted to
 * `geometry.userData.r5Labels` through `getX` first.
 * Returns the number of attributes expanded.
 */
export function dequantiseRoot(root) {
  let expanded = 0;
  const seen = new Set();
  root.traverse((o) => {
    const geo = o.isMesh ? o.geometry : null;
    if (!geo || seen.has(geo)) return;
    seen.add(geo);
    const labels = geo.attributes._bone;
    if (labels && !geo.userData.r5Labels) {
      const out = new Uint8Array(labels.count);
      for (let i = 0; i < labels.count; i++) out[i] = labels.getX(i);
      geo.userData.r5Labels = out;
    }
    let here = 0;
    for (const name of Object.keys(geo.attributes)) {
      if (name === '_bone' || name.startsWith('skin')) continue;
      const a = geo.attributes[name];
      if (!isQuantised(a)) continue;
      geo.setAttribute(name, new THREE.BufferAttribute(readAttribute(a), a.itemSize));
      here++;
    }
    if (here) { geo.computeBoundingBox(); geo.computeBoundingSphere(); expanded += here; }
  });
  return expanded;
}

/**
 * SHARED LOADER FIX 3 — provenance read. Generated GLBs carry
 * `asset.extras.provenance = { generator, recipe, sources, licence }` and may
 * carry rig extras (`r5Rig`, `r5BoneOrder`, `r5Sockets`). Legacy files carry
 * their Round-1 optimiser block. Both land on the entry, unmodified.
 */
export function readAssetExtras(gltf) {
  const ex = gltf?.parser?.json?.asset?.extras;
  return ex && typeof ex === 'object' ? ex : {};
}

/** Free everything a normalized entry owns (geometry, materials, textures, skeletons). */
export function disposeObjectTree(root) {
  const geos = new Set(), mats = new Set(), texs = new Set(), skels = new Set();
  root?.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.isSkinnedMesh && o.skeleton) skels.add(o.skeleton);
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of ms) {
      mats.add(m);
      for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) texs.add(v); }
    }
  });
  for (const g of geos) g.dispose();
  for (const t of texs) t.dispose();
  for (const m of mats) m.dispose();
  for (const s of skels) s.dispose();
  return { geometries: geos.size, materials: mats.size, textures: texs.size, skeletons: skels.size };
}

export class Assets {
  constructor() {
    this.models = {}; // name -> { root: Group, gltf, size: Vector3, spec, provenance, extras }
    this.anims = {};  // name -> raw gltf { scene, animations }
    /** The merged boot rows (`assets.specs` contract; `specs.hero` is the hero body row). */
    this.specs = { ...SPECS };
    /** Deferred rows other modules load through `loadExtra` (legacy.js `LEGACY_SPECS`), for tools. */
    this.deferredSpecs = {};
    /**
     * Rows that did not become models: `{ name, status, note }`, status
     * `SKIP-legacy-deleted` (R30: the file is gone from this tree) or
     * `SKIP-load-failed`. Gates read R30 through `legacyDeleted(kind)` to
     * report SKIP-legacy-deleted with the named note.
     */
    this.skipped = [];
    /**
     * R30 state (set by loadAll): `deleted` — kinds whose file is gone
     * (SKIP-legacy-deleted); `pending` — kinds whose file is still served
     * because the class that reads it is still in this tree (their deletion
     * is instruments-core's, file and class together: plan §6). A pending
     * kind is a real body, loaded from its real file, never a placeholder.
     */
    this.r30 = { deleted: [], pending: [] };
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  async loadAll(onProgress = () => {}) {
    try {
      const legacy = await legacyRows();
      Object.assign(this.specs, legacy.boot);
      this.deferredSpecs = legacy.deferred;
    } catch (err) {
      console.warn('[assets] legacy rows unreadable — core rows only', err);
    }
    const specs = this.specs;
    const names = Object.keys(specs);
    const animNames = Object.keys(ANIMS);
    const total = names.length + animNames.length;
    let done = 0;
    this._noteDeleted();
    await Promise.all([
      ...names.map(async (name) => {
        const spec = specs[name];
        try {
          const gltf = await this.loader.loadAsync(spec.url);
          this.models[name] = this.normalize(name, gltf, spec);
        } catch (err) {
          if (spec.required) console.error(`[assets] required row "${name}" failed to load (${spec.url})`, err);
          else console.warn(`[assets] row "${name}" failed to load (${spec.url}) — skipped`, err);
          this.skipped.push({ name, status: 'SKIP-load-failed', note: String(err?.message || err) });
        }
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
   * R30 bookkeeping. A row whose file is gone from this tree is recorded as
   * SKIP-legacy-deleted (never fetched). A row whose file is still served —
   * its reader class is still here, because the file and the class leave
   * together in instruments-core's change (plan §6) — is an ordinary boot row
   * (already in `specs`) and is listed in `r30.pending` with its owner.
   */
  _noteDeleted() {
    for (const [name, row] of Object.entries(DELETED)) {
      if (r30Live(row)) { this.r30.pending.push(name); continue; }
      this.r30.deleted.push(name);
      this.skipped.push({ name, status: 'SKIP-legacy-deleted',
        note: `${row.file} deleted at W0a (${row.ruling}: ${row.why}; deleted by ${row.owner}, plan §6)` });
    }
  }

  /**
   * R30 contract for gates and tools: the SKIP-legacy-deleted record of a
   * deleted kind (by machine `kind` or `modelKind`), or null. A gate whose
   * subject answers here reports `SKIP-legacy-deleted (R30)` with
   * `record.note`.
   */
  legacyDeleted(kind) {
    if (!kind) return null;
    return this.skipped.find((s) => s.name === kind && s.status === 'SKIP-legacy-deleted') || null;
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
   * forward on +Z. Idempotent per name unless `force` is set. Round 5: the row
   * shape is the one documented in `assets.specs.js` (`dequantise`,
   * `noShadow`), and `force` disposes the entry it replaces.
   */
  async loadExtra(specs, { onProgress = () => {}, onEntry = null, force = false } = {}) {
    const names = Object.keys(specs).filter((n) => force || !this.models[n]);
    if (!names.length) return this.models;
    const total = names.length;
    let done = 0;
    await Promise.all(names.map(async (name) => {
      const spec = specs[name];
      const deleted = DELETED_URLS.get(spec.url);
      if (deleted && !r30Live(deleted)) {
        // R30, file gone from this tree: never fetched (a 404 is a console
        // error, and the SPA fallback would hand GLTFLoader index.html). The
        // row is skipped, the batch goes on.
        this.skipped.push({ name, status: 'SKIP-legacy-deleted', note: `${spec.url} deleted at W0a (${deleted.ruling}: ${deleted.why}; deleted by ${deleted.owner}, plan §6)` });
      } else {
        try {
          const gltf = await this.loader.loadAsync(spec.url);
          const entry = this.normalize(name, gltf, spec);
          onEntry?.(entry, name, spec);
          if (force && this.models[name] && this.models[name] !== entry) this.unload(name);
          this.models[name] = entry;
        } catch (err) {
          // one bad row no longer rejects every other row of the batch
          console.warn(`[assets] loadExtra row "${name}" failed (${spec.url}) — skipped`, err);
          this.skipped.push({ name, status: 'SKIP-load-failed', note: String(err?.message || err) });
        }
      }
      done += 1;
      onProgress(done / total, name);
    }));
    return this.models;
  }

  /**
   * Dispose one entry and forget it (GPU buffers, materials, textures and
   * skeletons of the SHARED source — clones made with SkeletonUtils own
   * their own skeletons and must dispose those themselves). Returns counts.
   */
  unload(name) {
    const entry = this.models[name];
    if (!entry) return null;
    delete this.models[name];
    entry.root?.removeFromParent();
    return disposeObjectTree(entry.root);
  }

  /**
   * Public normalization contract (see the class doc). Kept as the single
   * implementation so no lane has to mirror it again.
   */
  normalize(name, gltf, spec) {
    const src = gltf.scene;
    const extras = readAssetExtras(gltf);
    const dequantised = spec.dequantise ? dequantiseRoot(src) : 0;
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
    inner.rotation.y = spec.yaw ?? 0;

    const root = new THREE.Group();
    root.name = `${name}-root`;
    root.add(inner);

    // lamps and lenses never hold a caster slot: an explicit row pattern, or
    // the default one on generated (provenance-carrying) assets only, so the
    // kept Round-4 files cast exactly as before
    const noShadow = spec.noShadow ? new RegExp(spec.noShadow, 'i')
      : (extras.provenance ? DEFAULT_NO_SHADOW : null);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = true;
        if (o.material) {
          o.material.side = THREE.FrontSide; // double-sided kills perf on big models
        }
        if (noShadow) {
          const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          if (ms.some((m) => noShadow.test(m.name || '') || m.userData?.noShadow)) {
            o.userData.noShadow = true;
            o.castShadow = false;
          }
        }
      }
    });

    const casters = applyShadowPolicy(root, spec.shadowPolicy ?? SHADOW_POLICY);

    const worldSize = size.clone().multiplyScalar(scale);
    return {
      root, gltf, size: worldSize, spec, animations: gltf.animations, shadowCasters: casters,
      provenance: extras.provenance ?? null, extras, dequantised,
    };
  }

  /** @deprecated back-compat alias — use normalize(). */
  _normalize(name, gltf, spec) { return this.normalize(name, gltf, spec); }

}
