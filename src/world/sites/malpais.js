import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchAerial, patchDeck } from '../island/aerial.js';
import { YARDS_WALK, yardsColliders } from './kilnyards-layout.js';
import { HORNITOS, TUBE_SHELTER, malpaisColliders, tubeBoxes } from './malpais-layout.js';

/**
 * THE MALPAIS AT BLOCKOUT, ON THE PAGE (Milestone 3 wave 1, area A; BUILD M3.2, the world half of M3.3). Grey forms
 * and the blockers for what ./malpais-layout.js and ./kilnyards-layout.js hold as data:
 *   - the hornito field's seven spatter cones (grey truncated cones);
 *   - the tube shelter: its two walls, its back and its crust in four lengths (the trench itself is the island
 *     recipe's, ./malpais-ground.js), and two small markers on the floor (the dormant nest, the salt cache);
 *   - the colliders of the Yards (towers, stacks, wellheads, rack posts: yardsColliders) and of the Malpais (the
 *     hornitos, the tube's walls; the crust a camera collider only), registered once the collision world exists;
 *   - the Yards' walk grid (YARDS_WALK) on ctx.nav, for area C's kinds and the hour-two runner.
 * The plant's own forms are the far form's (src/world/island/kilnyards.js), read from the same layout. One material,
 * one draw; no light, nothing emissive (BIBLE §3.3: zero emissive terrain; the wellheads' caps are the far form's).
 *
 *   const m = new MalpaisBlockout(ctx, parent, ground, { hornitos })    ground(x, z): the drawn terrain (terrain.getHeight)
 * M3 wave 2: built on the Malpais' approach by ./malpais-region.js (never at boot), with the hornitos left to the rock.
 *   m.update()            colliders and the walk grid, once each, when the world can take them
 *   m.stats               { tris, draws, colliders, walkGrid }
 *   m.dispose()
 */
const GREY = new THREE.Color(0x4a4744), GREY_DARK = new THREE.Color(0x34322f);

function paint(geo, c) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

export function malpaisGeometry(ground, { hornitos = true } = {}) {
  const parts = [];
  if (hornitos) for (const h of HORNITOS) {
    const g = ground(h.x, h.z);
    const geo = new THREE.CylinderGeometry(h.r * 0.3, h.r, h.h + 0.5, 12, 2, false);
    geo.translate(h.x, g - 0.5 + (h.h + 0.5) / 2, h.z);
    parts.push(paint(geo.toNonIndexed(), GREY));
  }
  for (const b of tubeBoxes(ground)) {
    const geo = new THREE.BoxGeometry(b.half[0] * 2, b.half[1] * 2, b.half[2] * 2);
    geo.rotateY(-b.yaw);
    geo.translate(b.x, b.y, b.z);
    parts.push(paint(geo.toNonIndexed(), b.blocking ? GREY_DARK : GREY));
  }
  for (const [p, r, hh] of [[TUBE_SHELTER.nest, 0.9, 0.7], [TUBE_SHELTER.cache, 0.35, 0.5]]) {
    const geo = new THREE.CylinderGeometry(r * 0.7, r, hh, 8);
    geo.translate(p.x, ground(p.x, p.z) + hh / 2, p.z);
    parts.push(paint(geo.toNonIndexed(), GREY_DARK));
  }
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export class MalpaisBlockout {
  /** `hornitos: false` (M3 wave 2): the hornitos are drawn as spatter by ./malpais-rocks.js; their colliders stay here */
  constructor(ctx, parent, ground, { hornitos = true } = {}) {
    this.ctx = ctx;
    this._ground = ground;
    this.stats = { tris: 0, draws: 0, colliders: 0, walkGrid: false };
    this._colliderIds = null;
    const geo = malpaisGeometry(ground, { hornitos });
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    mat.name = 'malpais-blockout';
    // the island's far air on it, as on the ground and the Yards' far form (island/aerial.js)
    mat.onBeforeCompile = (shader) => { patchAerial(shader); patchDeck(shader); };
    mat.customProgramCacheKey = () => 'cal-malpais-blockout';
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'malpais-blockout';
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group = new THREE.Group();
    this.group.name = 'malpais';
    this.group.add(this.mesh);
    parent.add(this.group);
    ctx.environment?.registerMaterial?.(mat);
    this.stats.tris = geo.attributes.position.count / 3;
    this.stats.draws = 1;
  }

  /** The static blockers of the Yards and the Malpais, in collision.register's shape (for Node rows too). */
  colliders() { return [...yardsColliders(this._ground), ...malpaisColliders(this._ground)]; }

  update() {
    const C = this.ctx.collision;
    if (!this._colliderIds && C) {
      this._colliderIds = [];
      for (const d of this.colliders()) {
        const id = C.register({ kind: d.kind, shape: d.shape, blocking: d.blocking !== false, camera: d.camera ?? (d.blocking !== false), occluder: true, ref: this.mesh });
        if (Array.isArray(id)) this._colliderIds.push(...id); else if (id >= 0) this._colliderIds.push(id);
      }
      this.stats.colliders = this._colliderIds.length;
    }
    const N = this.ctx.nav;
    if (!this.stats.walkGrid && N?.addWalkGrid && this._colliderIds) {
      if (!N.walkGrid?.(YARDS_WALK.box.id)) N.addWalkGrid(YARDS_WALK.box, { discs: YARDS_WALK.discs, radius: YARDS_WALK.radius });
      this.stats.walkGrid = true;
    }
  }

  dispose() {
    if (this._colliderIds?.length && this.ctx.collision?.unregister) this.ctx.collision.unregister(this._colliderIds);
    this.mesh.geometry.dispose(); this.material.dispose(); this.group.parent?.remove(this.group);
  }
}
