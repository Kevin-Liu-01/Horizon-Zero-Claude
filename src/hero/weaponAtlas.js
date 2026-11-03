/**
 * CALIMA · the shared weapon atlas at runtime (armory W1; bible §5.1 "one shared
 * 1024² weapon atlas"; plan §4.4 "weapon + Instrument decal atlases").
 *
 * The merged stow kit (`heroStowKit`, always resident) carries the atlas maps; the
 * held weapon GLBs ship without textures and render with those same Texture objects,
 * so every weapon she owns costs one set of GPU textures. The kit's entry owns the
 * maps: a held material made here is disposed by its weapon, its maps never.
 *
 *   armoryAssets(ctx)          register the live assets (Combat constructor), once
 *   weaponEntry(rowName)       the loaded row, or null
 *   heldMaterial(name)         a MeshStandardMaterial on the atlas maps (caller disposes)
 */
import * as THREE from 'three';

let ASSETS = null;

export function armoryAssets(ctx) { ASSETS = ctx?.assets ?? ASSETS; return ASSETS; }
export function weaponEntry(row) { return ASSETS?.models?.[row] ?? null; }

function atlasSource() {
  let mat = null;
  ASSETS?.models?.heroStowKit?.root?.traverse((o) => { if (!mat && o.isMesh && o.material?.map) mat = o.material; });
  return mat;
}

/**
 * A held weapon GLB loaded by someone else (melee's `createHeldLance`) ships without
 * textures: point its meshes at the atlas. Idempotent, cold path. Works on the mesh's
 * current material, source or the Player's fade clone.
 */
export function adoptWeaponAtlas(root) {
  const src = atlasSource();
  if (!src || !root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m || m.map || !/Armory_Atlas/.test(m.name || '')) return;
    // clones of the kit's textures: same image, same GPU texture (three shares it by source), but the
    // holder's own dispose path (lanceStow.js `disposeTree`) frees its clone, never the kit's atlas
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) { const t = src[k]?.clone?.(); if (t) t.needsUpdate = true; m[k] = t ?? null; }
    m.normalScale.copy(src.normalScale);
    m.color?.setRGB(1, 1, 1);
    m.needsUpdate = true;
    n++;
  });
  return n;
}

/** A fresh material on the atlas; null when the kit row is missing (the no-kit boot path). */
export function heldMaterial(name = 'MI_Armory_Held') {
  const src = atlasSource();
  if (!src) return null;
  const m = new THREE.MeshStandardMaterial({
    map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, metalnessMap: src.metalnessMap,
    roughness: 1, metalness: 1,
  });
  m.normalScale.copy(src.normalScale);
  m.name = name;
  return m;
}
