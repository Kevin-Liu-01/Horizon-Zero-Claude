/**
 * CALIMA · the held bow of the W0 loadout, bound for measurement (hero-body
 * W0b; gate A-hero-draws: "the real W0 loadout (merged outfit, merged stow
 * kit, v0 lance/quiver/bracer, Sabina blockout)").
 *
 * Combat's bow (`src/combat/bow.js`, armory from W1) still builds the
 * procedural Round-4 bow — 9 meshes, 9 draws. Until armory loads the Sabina
 * GLB in bow.js (W1, plan §2), the W0 held bow is measured by binding the v0
 * Sabina blockout to the node combat holds its bow on, with combat's model
 * hidden while the preview is bound. Dev/gate surface: nothing in the game
 * calls it, and `dispose()` returns every geometry, material and texture it
 * loaded and puts combat's bow back as it was.
 */
export const SABINA_URL = '/models/hero/kit/bow-sabina-v0.glb';

export async function holdPreview(player, url = SABINA_URL) {
  const ctx = player.ctx;
  const loader = ctx.assets?.loader;
  if (!loader) throw new Error('[hero] holdPreview: no asset loader');
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  const cmb = ctx.combat;
  const node = cmb?._bowNode || player.animator?.handAttach?.('l') || player.model;
  // combat re-sets its bow GROUP's visibility every frame (holster window,
  // aim), so the preview hides the procedural meshes under every bow group
  const hiddenMeshes = [];
  for (const m of Object.values(cmb?._models || {})) {
    m?.group?.traverse?.((o) => { if (o.isMesh && o.visible) { o.visible = false; hiddenMeshes.push(o); } });
  }
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.heroPart = 'held';
    o.castShadow = false;
    o.frustumCulled = false;
    meshes.push(o);
  });
  node.add(root);
  root.updateMatrixWorld(true);
  let done = false;
  return {
    root, meshes, url,
    tris: meshes.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0),
    dispose() {
      if (done) return;
      done = true;
      root.parent?.remove(root);
      const mats = new Set(), texs = new Set();
      for (const m of meshes) {
        m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          if (!mat) continue;
          mats.add(mat);
          for (const k of Object.keys(mat)) if (mat[k]?.isTexture) texs.add(mat[k]);
        }
      }
      for (const t of texs) t.dispose();
      for (const mat of mats) mat.dispose();
      for (const o of hiddenMeshes) o.visible = true;
    },
  };
}
