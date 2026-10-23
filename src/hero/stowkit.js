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
import * as THREE from 'three';
import { bindPart, releasePart, boneIndex } from './parts.js';
import { LanceCarry } from './carry.js';

export const PIECE = { lance: 1, bow: 2, quiver: 4, bracer: 8, alidade: 16 };
/** The lance's carry socket joint (kit recipe `LANCE_SOCKET`), a child of `spine_02` at the identity. */
export const LANCE_SOCKET = 'stow_lance';
const LANCE_SOCKET_PARENT = 'spine_02';

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
    this.socket = null;
    this.carry = null;
  }

  /**
   * The lance's carry socket on the hero skeleton: created once (a Bone under
   * spine_02 at the identity, so its bind equals the kit joint's) and kept
   * across detach / attach; removed by `dispose()`.
   */
  _ensureSocket() {
    if (this.socket) return this.socket;
    const bones = boneIndex(this.player.model);
    let sock = bones.get(LANCE_SOCKET) || null;
    if (!sock) {
      const par = bones.get(LANCE_SOCKET_PARENT);
      if (!par) return null;
      sock = new THREE.Bone();
      sock.name = LANCE_SOCKET;
      par.add(sock);
    }
    this.socket = sock;
    return sock;
  }

  attach() {
    if (this.attached || !this.entry) return this;
    const needsSocket = (() => { let n = false; this.entry.root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton.bones.some((b) => b.name === LANCE_SOCKET)) n = true; }); return n; })();
    if (needsSocket) this._ensureSocket();
    this.meshes = bindPart(this.player.model, this.entry.root, 'stowkit', { castShadow: false });
    for (const m of this.meshes) {
      this.u = installPieceMask(m.material);
      m.userData.orbitGear = true;        // the camera's body-clearance proxy samples it (player.js)
    }
    this.attached = true;
    this.setHidden(this.hidden);
    if (needsSocket && !this.carry) this._initCarry();
    return this;
  }

  /**
   * The carry solve's bind data, once, at the FIRST attach (Player
   * constructor: the skeleton is still in its bind pose — the animator does
   * not exist yet): the lance's butt and tip are the lowest / highest lance
   * vertices of the skinned kit.
   */
  _initCarry() {
    const m = this.meshes[0];
    if (!m || !this.socket) return;
    const g = m.geometry, P = g.getAttribute('_piece'), pos = g.getAttribute('position');
    if (!P) return;
    let lo = -1, hi = -1;
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & PIECE.lance) === 0) continue;
      if (lo < 0 || pos.getY(i) < pos.getY(lo)) lo = i;
      if (hi < 0 || pos.getY(i) > pos.getY(hi)) hi = i;
    }
    if (lo < 0) return;
    this.player.model.updateMatrixWorld(true);
    const bw = new THREE.Vector3(), tw = new THREE.Vector3();
    m.getVertexPosition(lo, bw); m.localToWorld(bw);
    m.getVertexPosition(hi, tw); m.localToWorld(tw);
    const B = boneIndex(this.player.model);
    this.carry = new LanceCarry(this.player, this.socket, bw, tw, {
      pelvis: B.get('pelvis'), neck: B.get('neck_01'), spine2: B.get('spine_02'), spine3: B.get('spine_03'),
    });
  }

  /**
   * Per frame (HeroRig.update, after the animator): pose the lance socket by
   * the carry solve. Off while the stowed lance is collapsed (drawn).
   */
  solve(an, dt) {
    const SC = an?._stowCap;
    if (SC) SC.on = false;
    if (!this.carry || !this.attached || !an?.skull) return;
    if (this.hidden & PIECE.lance) { if (this.carry.out.active) this.carry.reset(); return; }
    const aimW = an.aimWeight ?? 0;
    this.carry.update(an, aimW, aimW > 0.05, dt, this.player.ctx?.camera || null);
    // fix round 5: hand the solved shaft to the spring solver (world), so no
    // dyn_ chain — the wrap tail, the knot tail — passes through the lance
    if (SC) {
      const m = this.player.model.matrixWorld;
      SC.a.copy(this.carry.butt).applyMatrix4(m);
      SC.b.copy(this.carry.tip).applyMatrix4(m);
      SC.on = true;
    }
  }

  /** The carry solve's last report (gate A-lance-stow), or null. */
  carryInfo() {
    if (!this.carry) return null;
    const c = this.carry, o = c.out;
    return { ...o, butt: c.butt.toArray(), tip: c.tip.toArray(), len: c.len, alpha0: c.alpha0 * 180 / Math.PI };
  }

  /** Remove the socket bone too (HeroRig.dispose). */
  dispose() {
    const r = this.detach();
    if (this.socket) { this.socket.removeFromParent(); this.socket = null; }
    this.carry = null;
    return r;
  }

  /** Bitmask of pieces to collapse (PIECE.*). */
  setHidden(bits) {
    this.hidden = bits | 0;
    if (this.u) this.u.value = this.hidden;
  }

  detach() {
    const SC = this.player?.animator?._stowCap;
    if (SC) SC.on = false;                    // fix round 5: no stale lance capsule in the spring solver
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
