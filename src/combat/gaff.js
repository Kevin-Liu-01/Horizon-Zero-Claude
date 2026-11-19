/**
 * CALIMA · the Boat Gaff in combat's hands (Milestone 2 area D, wave 2: the gaff as a weapon she can draw, carry and
 * stow; its verbs, the three lights and the hook-rip, are wave 3). Bible §8.1: "Boat Gaff (Oro, 0:35): fast combo;
 * hook-rip pulls a component off small and medium Instruments"; §12 quick slot 3.
 *
 *   const gaff = ensureGaff(ctx)        the one gaff state, published as ctx.combat.gaff (made on first use)
 *   gaff.owned                          false until the hand-over (hero.grantOroKit)
 *   gaff.draw() / gaff.stow()           ask for it in her right hand / back on its hanger
 *   gaff.want                           what was last asked (the animator's gaffLayer runs the hands to it)
 *   gaff.prop                           the held mesh (HeldGaff): butt at its group's origin, +Z along the haft to the
 *                                       beak, the hook toward the group's +Y (the layer parents it to her right hand)
 *
 * Combat asks; it never moves a hand (M2 seams: "Props in the hands"). The right hand is the gaff's, so a draw waits for
 * the lance to be back on her back, and the lance's draw (key 2) waits for the gaff to be back on its hanger
 * (`after`, read by quickslots.js).
 */
import * as THREE from 'three';
import { adoptWeaponAtlas } from '../hero/weaponAtlas.js';

export const HELD_GAFF_URL = '/models/armory/gaff-boat.glb';

/** The held gaff: the GLB under one Group (butt at the origin, +Z along the haft to the beak, the hook on +Y). */
export class HeldGaff {
  constructor(ctx, url = HELD_GAFF_URL) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'held-gaff';
    this.group.visible = false;
    this.inner = null;
    this.sockets = null;
    this.length = 0.625;
    this.ready = this._load(url);
  }

  async _load(url) {
    const loader = this.ctx.assets?.loader;
    if (!loader) return this;
    let gltf;
    try { gltf = await loader.loadAsync(url); } catch (e) { console.warn('[gaff] held gaff did not load', e); return this; }
    const root = gltf.scene;
    // the GLB is authored along +Y with its hook on +Z: lay +Y onto the group's +Z (the hook onto -Y, then turned to +Y)
    const inner = new THREE.Group();
    inner.name = 'held-gaff-inner';
    inner.add(root);
    inner.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    // after +Y -> +Z the GLB's +Z (the hook) is on -Y: a half turn about +Z puts it on +Y
    inner.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
    const sockets = {};
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
      if (!o.isMesh && o !== root && o.parent && o.parent.isMesh) sockets[o.name] = o.position.clone();
    });
    this.sockets = sockets;
    if (sockets.tip) this.length = sockets.tip.y;
    adoptWeaponAtlas(root);
    this.inner = inner;
    this.group.add(inner);
    return this;
  }

  /** The grip socket's distance from the butt along the haft (m). */
  get gripY() { return this.sockets?.grip?.y ?? 0.098; }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
    this.inner = null;
  }
}

export class GaffWeapon {
  constructor(ctx) {
    this.ctx = ctx;
    this.owned = false;
    this.want = false;
    this.after = null;        // 'lance' | 'bow' | null: what the stow hands the right hand to once it is home
    this.prop = null;
    this.requests = 0;
  }

  /** The hand-over: she owns it from now (the held mesh loads now, once). */
  grant() {
    this.owned = true;
    if (!this.prop) this.prop = new HeldGaff(this.ctx);
    return this.prop.ready;
  }

  /** Ask for it in her right hand (the lance goes back first: the layer waits for it). */
  draw() {
    if (!this.owned) return false;
    this.after = null;
    const melee = this.ctx.combat?.melee;
    if (melee && melee.stance !== 'holstered') melee.holsterLance?.(true);
    if (!this.want) this.requests++;
    this.want = true;
    return true;
  }

  /** Ask for it back on its hanger; `after` names what the right hand takes next. */
  stow(after = null) {
    this.after = after;
    if (this.want) this.requests++;
    this.want = false;
    return true;
  }

  /** The animator's report: is it in her hand (owner handR), and is its sequence idle? */
  get inHand() { return !!this.ctx.player?.animator?.gaffInHand?.(); }
}

/** The one gaff state of this game, as ctx.combat.gaff (or on ctx when there is no combat yet). */
export function ensureGaff(ctx) {
  const host = ctx.combat || ctx;
  if (!host.gaff) host.gaff = new GaffWeapon(ctx);
  return host.gaff;
}
