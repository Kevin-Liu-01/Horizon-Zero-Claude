/**
 * CALIMA · outfit merge + skeleton dispose (hero-body W0b; bible §3.9, §4.1;
 * plan E9; gate A-outfit-merge-dispose).
 *
 * An outfit set is ONE merged SkinnedMesh per material (built that way by its
 * recipe, so "merged at equip" is a bind, not a runtime geometry merge), bound
 * to the hero's bones by name. Equip also applies the set's hide bit to the
 * body (`HideMask`), which culls the body triangles fully covered by the set.
 * Unequip removes the mesh, disposes its Skeleton, and restores the body.
 * Equip/unequip x N returns geometries, textures and skeletons to baseline.
 */
import { bindPart, releasePart, HideMask } from './parts.js';

export class HeroOutfit {
  constructor(player) {
    this.player = player;
    this.ctx = player.ctx;
    this.meshes = [];
    this.row = null;
    this.set = null;
    this.body = null;
    player.model.traverse((o) => {
      if (!this.body && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) this.body = new HideMask(o);
    });
  }

  /** Equip the outfit loaded under `ctx.assets.models[row]`. Returns info(). */
  equip(row) {
    const entry = this.ctx.assets?.models?.[row];
    if (!entry) throw new Error(`[hero] no outfit row "${row}" loaded`);
    if (this.row === row) return this.info();
    if (this.row) this.unequip();
    // the two hero casters (plan §4.1, <= 2 x 3 cascades): body skin + outfit
    this.meshes = bindPart(this.player.model, entry.root, `outfit:${row}`, { castShadow: true });
    const meta = entry.extras?.r5Outfit || {};
    this.set = meta.set || row;
    this.row = row;
    this.body?.apply(meta.hideBit || 0);
    this.player._collectMaterials?.();
    return this.info();
  }

  unequip() {
    if (!this.row) return { skeletons: 0 };
    const r = releasePart(this.meshes, this.player);
    this.meshes = [];
    this.body?.apply(0);
    this.row = null;
    this.set = null;
    return r;
  }

  info() {
    let tris = 0;
    for (const m of this.meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    return {
      row: this.row, set: this.set, meshes: this.meshes.length, tris,
      bodyVisibleTris: this.body ? this.body.visibleTris() : null,
      bodyHiddenTris: this.body ? this.body.hiddenTris : 0,
    };
  }
}
