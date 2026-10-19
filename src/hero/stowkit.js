/**
 * CALIMA · the merged stow kit (hero-body W0b; bible §3.6 "everything stowed is
 * one merged mesh, one draw ... a per-vertex `pieceId` + uniform bitmask
 * collapses the drawn weapon's stowed copy (still one draw)"; plan E9).
 *
 * The kit GLB (tools/build/recipes/weapons/kit-v0.mjs) is ONE skinned mesh
 * whose vertices carry `_piece` (1 lance, 2 bow, 4 quiver + arrows, 8 bracer,
 * 16 alidade). The material's vertex stage collapses every vertex whose piece
 * bit is set in `uKitHide` to its bone's origin (degenerate triangles: nothing
 * rasterises), so hiding a piece never adds or removes a draw.
 *
 * The hook is carried on `material.userData` (`vertexHook`, `cacheKey`), which
 * the Player's fade-dither clone composes, so the mask survives the fade.
 */
import { bindPart, releasePart } from './parts.js';

export const PIECE = { lance: 1, bow: 2, quiver: 4, bracer: 8, alidade: 16 };

/** Install the piece mask on a (source) material, once. Returns the shared uniform. */
export function installPieceMask(material) {
  if (material.userData.kitHide) return material.userData.kitHide;
  const u = { value: 0 };
  material.userData.kitHide = u;
  material.userData.cacheKey = 'hero-kit-piece';
  material.userData.vertexHook = (shader) => {
    shader.uniforms.uKitHide = u;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _piece;\nuniform float uKitHide;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  if ( ( int( _piece + 0.5 ) & int( uKitHide + 0.5 ) ) != 0 ) transformed = vec3( 0.0 );`);
  };
  material.onBeforeCompile = material.userData.vertexHook;
  material.customProgramCacheKey = () => 'hero-kit-piece';
  material.needsUpdate = true;
  return u;
}

export class HeroStowKit {
  /**
   * @param {object} player   the live Player (model, ctx)
   * @param {object} entry    `ctx.assets.models.heroStowKit`
   */
  constructor(player, entry) {
    this.player = player;
    this.entry = entry;
    this.meshes = [];
    this.hidden = 0;
    this.u = null;
    this.attached = false;
  }

  attach() {
    if (this.attached || !this.entry) return this;
    this.meshes = bindPart(this.player.model, this.entry.root, 'stowkit', { castShadow: false });
    for (const m of this.meshes) this.u = installPieceMask(m.material);
    this.attached = true;
    this.setHidden(this.hidden);
    return this;
  }

  /** Bitmask of pieces to collapse (PIECE.*). */
  setHidden(bits) {
    this.hidden = bits | 0;
    if (this.u) this.u.value = this.hidden;
  }

  detach() {
    if (!this.attached) return { skeletons: 0 };
    const r = releasePart(this.meshes, this.player);
    this.meshes = [];
    this.attached = false;
    return r;
  }

  info() {
    let tris = 0;
    for (const m of this.meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    return { attached: this.attached, meshes: this.meshes.length, tris, hidden: this.hidden, extras: this.entry?.extras?.r5StowKit ?? null };
  }
}
