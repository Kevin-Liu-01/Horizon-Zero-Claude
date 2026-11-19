import * as THREE from 'three';
import * as L from './ninewalls-layout.js';
import { wallsGeometry, townGeometry, kitMaterial } from './ninewalls-kit.js';
import { ninewallsNatural } from './ninewalls-ground.js';
import { saveFieldsOf } from '../../game/save/fields.js';

/**
 * NINEWALLS (M2 wave 2, area B; BUILD M2.2): the village on its terraces, from the walls' data (./ninewalls-layout.js)
 * and the kit (./ninewalls-kit.js): the nine drystone crescent walls, each the riser between two terraces, the Datum
 * Line a band of flat vermilion ink on the painted walls; the sixteen drystone dwellings sunk in the lapilli under
 * their pumice-and-lime roofs; the dragon tree; the lava-tube mouth with its forge; the counter; the cistern; the
 * Brazier's plinth; the third wall's niche and its salt cache; the Guild notice board; the walk in's kerb. One
 * material, two draws (the walls; everything else), both casting.
 *
 *   nw.group                 'ninewalls' in the scene (its own group: the Brazier system hides the host's)
 *   nw.walls                 the layout seam (WALLS, wallState, setWallCut, setPainted, resetWalls, wallsSave, ...)
 *   nw.road                  the walk in's centreline (L.ROAD: [x, z, h], the Pans' edge to the cistern's lane)
 *   nw.update(dt, t)         colliders and the occluders register once the world can take them
 *   nw.stats                 { tris, draws, colliders, occluders, rebuilds, wallTris, townTris, tips, kerb }
 *   nw.dispose()
 *
 * A wall's state change (cut, or the line painted or cleared) rebuilds the walls' mesh and their colliders and
 * occluders on the next update. The walls' state rides the save as the 'walls' field (src/game/save/fields.js).
 * Built at boot; it moves behind region-enter('holds') with the people (wave 3, NW11).
 */

/** She is near the village (m outside its outer wall): the walls join the sight occluders. */
const NEAR_M = 150;

export class Ninewalls {
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.walls = L;
    this.group = new THREE.Group();
    this.group.name = 'ninewalls';
    parent.add(this.group);
    this.stats = { tris: 0, draws: 0, colliders: 0, occluders: 0, rebuilds: 0 };
    this._ground = (x, z) => ctx.terrain.getHeight(x, z);
    this._colliderIds = [];
    this._collidersDone = false;
    this._occluderSlots = [];
    this._sight = null;
    this._dirty = false;
    this.road = L.ROAD;
    this.material = kitMaterial(ctx.environment);
    this._buildWalls();
    this._buildTown();
    this._unlisten = L.onWallChange(() => { this._dirty = true; });
    try { this._unsave = saveFieldsOf(ctx).register('walls', L.wallsSave()); } catch (e) { console.warn('[ninewalls] the walls field did not register', e?.message || e); }
    // the occluders (src/instruments/lib/sight.js, loaded on demand): only while she is within NEAR_M of the village,
    // so the Pans' Instruments never test the Holds' pieces (on the ground as it stands a wall is ~90 of them)
    this._near = false;
    import('../../instruments/lib/sight.js').then((m) => { this._sight = m; }).catch(() => {});
  }

  _buildWalls() {
    const soup = wallsGeometry(this._ground, (id) => L.wallState(id));
    const geo = soup.geometry();
    this.stats.wallTris = soup.tris;
    if (this.wallMesh) { this.wallMesh.geometry.dispose(); this.wallMesh.geometry = geo; }
    else {
      this.wallMesh = new THREE.Mesh(geo, this.material);
      this.wallMesh.name = 'ninewalls-walls';
      this.wallMesh.castShadow = true; this.wallMesh.receiveShadow = true;
      this.group.add(this.wallMesh);
    }
    this._count();
  }

  _buildTown() {
    const natural = (x, z) => { const h = ninewallsNatural(x, z); return Number.isFinite(h) && h !== 0 ? h : this._ground(x, z); };
    const { soup, tips, kerb } = townGeometry(this._ground, natural);
    this.townMesh = new THREE.Mesh(soup.geometry(), this.material);
    this.townMesh.name = 'ninewalls-town';
    this.townMesh.castShadow = true; this.townMesh.receiveShadow = true;
    this.group.add(this.townMesh);
    Object.assign(this.stats, { townTris: soup.tris, tips, kerb });
    this._count();
  }

  _count() {
    let tris = 0, draws = 0;
    for (const m of [this.wallMesh, this.townMesh]) if (m) { tris += m.geometry.attributes.position.count / 3; draws++; }
    this.stats.tris = tris; this.stats.draws = draws;
  }

  _registerColliders() {
    const C = this.ctx.collision;
    if (!C) return;
    if (this._colliderIds.length && C.unregister) C.unregister(this._colliderIds);
    this._colliderIds.length = 0;
    for (const d of L.ninewallsColliders(this._ground)) {
      const id = C.register({ kind: d.kind, shape: d.shape, ref: d.wall ? this.wallMesh : this.townMesh });
      if (Array.isArray(id)) this._colliderIds.push(...id); else if (id >= 0) this._colliderIds.push(id);
    }
    this.stats.colliders = this._colliderIds.length;
    this._collidersDone = true;
  }

  _registerOccluders() {
    const S = this._sight;
    if (!S) return;
    S.clearOccluders('ninewalls:');
    this._occluderSlots = [];
    for (const o of L.wallOccluders(this._ground)) this._occluderSlots.push(S.setOccluder(o.slot, o.shape));
    this.stats.occluders = this._occluderSlots.length;
  }

  update() {
    if (!this._collidersDone && this.ctx.collision) this._registerColliders();
    const P = this.ctx.player?.position;
    if (P && this._sight) {
      const d = Math.hypot(P.x - L.CENTRE.x, P.z - L.CENTRE.z) - L.OUTER_R;
      if (!this._near && d < NEAR_M) { this._near = true; this._registerOccluders(); }
      else if (this._near && d > NEAR_M + 40) { this._near = false; this._sight.clearOccluders('ninewalls:'); this._occluderSlots = []; this.stats.occluders = 0; }
    }
    if (this._dirty) {
      this._dirty = false;
      this.stats.rebuilds++;
      this._buildWalls();
      this._registerColliders();
      if (this._near) this._registerOccluders();
    }
  }

  dispose() {
    this._unlisten?.();
    this._unsave?.();
    this._sight?.clearOccluders?.('ninewalls:');
    const C = this.ctx.collision;
    if (C?.unregister && this._colliderIds.length) C.unregister(this._colliderIds);
    this._colliderIds.length = 0;
    for (const m of [this.wallMesh, this.townMesh]) m?.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
