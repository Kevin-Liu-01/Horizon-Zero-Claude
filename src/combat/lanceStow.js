/**
 * CALIMA · the lance between the back and the hands (melee W1, plan §1.2): the
 * one surface other lanes read about it, so `combat.js` (armory W1, W3;
 * combat-kit W2) does not reach into `melee.js`.
 *
 *   lanceOut(melee) -> boolean              the lance is physically in her right hand
 *                                           (`combat.js`: the bow stays on her back; R8)
 *   lanceObjects(melee, out) -> out         the held prop's scene objects (memory counts)
 *   createHeldLance(ctx, url?) -> HeldLance the held prop, loaded from a weapon GLB
 *
 * The stowed copy is NOT here: it is the stow kit's skinned piece on the R10
 * diagonal (`src/hero/stowkit.js`, `src/hero/carry.js`); the kit collapses it on
 * the frame a draw starts and `meleeLayer` poses this prop on the same line.
 *
 * A HeldLance is the held GLB under one Group whose contract is the layer's:
 * butt at the origin, +Z along the haft to the tip. A weapon GLB is authored
 * along +Y (bible §5.2, `tools/build/recipes/weapons/`) with socket nodes `butt`,
 * `grip`, `grip2`, `tip`; length and the two hand marks are read off those nodes,
 * so a lance variant is data (armory W1 final, W3 variants: `setUrl`).
 */
import * as THREE from 'three';

/** The default held lance; armory points this at its final Shepherd's Lance. */
export const HELD_LANCE_URL = '/models/hero/kit/lance-shepherd-v0.glb';
/** Authored marks (bible §5.3), used until a GLB says otherwise. */
const DEFAULTS = { length: 1.55, grip: 0.20, grip2: 0.55 };

export function lanceOut(melee) { return !!melee && !!melee.lanceInHand; }

export function lanceObjects(melee, out) {
  const g = melee?.lance?.group;
  if (g) out.push(g);
  return out;
}

class HeldLance {
  constructor(ctx, url) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'held-lance';
    this.group.visible = false;
    this.length = DEFAULTS.length;
    this.grip = DEFAULTS.grip;
    this.grip2 = DEFAULTS.grip2;
    this.url = null;
    this.inner = null;
    this.onChange = null;
    this.ready = this.setUrl(url);
  }

  /** Load a lance variant; resolves once it replaces the one in her hand. */
  async setUrl(url) {
    if (url === this.url && this.inner) return this;
    this.url = url;
    const loader = this.ctx.assets?.loader;
    if (!loader) return this;
    let gltf = null;
    try { gltf = await loader.loadAsync(url); } catch (err) {
      console.warn(`[lance] ${url} failed to load`, err);
      return this;
    }
    if (url !== this.url || this._disposed) { disposeTree(gltf.scene); return this; }
    this._releaseInner();
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const y = (name) => { const n = root.getObjectByName(name); return n ? n.getWorldPosition(new THREE.Vector3()).y : null; };
    const b = y('butt') ?? 0, t = y('tip');
    if (t != null && t - b > 0.2) {
      this.length = t - b;
      const g1 = y('grip'), g2 = y('grip2');
      this.grip = g1 != null ? (g1 - b) / this.length : DEFAULTS.grip;
      this.grip2 = g2 != null ? (g2 - b) / this.length : DEFAULTS.grip2;
    }
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;             // plan §4.1: Brea's two casters are skin and outfit
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.raycast = () => {};
      o.userData.heroPart = 'held';
    });
    const inner = new THREE.Group();
    inner.name = 'held-lance-model';
    inner.rotation.x = Math.PI / 2;     // GLB +Y -> the layer's +Z
    inner.position.z = -b;
    inner.add(root);
    this.group.add(inner);
    this.inner = inner;
    this.onChange?.(this);
    return this;
  }

  _releaseInner() {
    if (!this.inner) return;
    this.inner.removeFromParent();
    disposeTree(this.inner);
    this.inner = null;
  }

  dispose() {
    this._disposed = true;
    this._releaseInner();
    this.group.removeFromParent();
    this.onChange = null;
  }
}

function disposeTree(root) {
  const mats = new Set(), texs = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      mats.add(m);
      for (const k of Object.keys(m)) if (m[k]?.isTexture) texs.add(m[k]);
    }
  });
  for (const t of texs) t.dispose();
  for (const m of mats) m.dispose();
}

export function createHeldLance(ctx, url = HELD_LANCE_URL) { return new HeldLance(ctx, url); }
