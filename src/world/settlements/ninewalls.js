import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as L from './ninewalls-layout.js';
import { saveFieldsOf } from '../../game/save/fields.js';

/**
 * NINEWALLS AT BLOCKOUT (M2 wave 1, area B; BUILD M2.2). Grey boxes from ./ninewalls-layout.js and nothing else: the
 * nine crescent walls (one merged mesh, the Datum Line as a flat vermilion band in its vertex colour on the painted
 * walls), the sixteen dwellings, the dragon tree, the tube mouth, the counter, the cistern and the third wall's niche
 * (a second merged mesh). No art: the kit and the people are wave 2 and 3.
 *
 *   nw.group                 'ninewalls' in the scene (its own group: the Brazier system hides the host's)
 *   nw.walls                 the layout seam (WALLS, wallState, setWallCut, setPainted, resetWalls, wallsSave, ...)
 *   nw.update(dt, t)         colliders and the occluders register once the world can take them
 *   nw.stats                 { tris, draws, colliders, occluders, rebuilds }
 *   nw.dispose()
 *
 * A wall's state change (cut, or the line painted or cleared) rebuilds the wall mesh and that wall's colliders and
 * occluders on the next update. The walls' state rides the save as the 'walls' field (src/game/save/fields.js).
 * Built at boot for the blockout (about 6 k triangles, 2 draws); it moves behind region-enter('holds') with the kit.
 */

const GREY_WALL = new THREE.Color(0x8f8a82), GREY_TOP = new THREE.Color(0xa29d94), LINE = new THREE.Color(0xc8401e);
const GREY_HOUSE = new THREE.Color(0xb4afa5), GREY_ROOF = new THREE.Color(0xd2cdc2), GREY_TREE = new THREE.Color(0x6d6a63);
const GREY_DARK = new THREE.Color(0x26241f), GREY_KERB = new THREE.Color(0x9c978e);

/** She is near the village (m outside its outer wall): the walls join the sight occluders. */
const NEAR_M = 150;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

/** A box geometry at (x, y, z), turned by ry about y, coloured. */
function box(w, h, d, x, y, z, ry, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1)));
  return paint(g, color);
}
function cyl(rt, rb, h, x, y, z, color, seg = 10) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  g.translate(x, y, z);
  return paint(g, color);
}
function paint(g, color) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (g.index) return g.toNonIndexed();
  return g;
}

/**
 * One wall as a ribbon along its stations: each face in rows foot | line foot | line top | top (the line rows carry
 * the vermilion when painted), the top, and the two ends. Non-indexed, flat colours per row.
 */
function wallGeometry(w, ground, state, painted) {
  const st = L.stations(w, 1.25), top = L.topOf(w, state), pos = [], col = [];
  const lo = w.lineH - w.lineW / 2, hi = w.lineH + w.lineW / 2;
  const rows = [[-0.35, lo, GREY_WALL], [lo, hi, painted ? LINE : GREY_WALL], [hi, top, GREY_WALL]].filter(([a, b]) => b > a + 1e-3);
  const pt = (s, side) => { const d = L.dirOf(s.b), o = side * w.t / 2; return { x: s.x + d.x * o, z: s.z + d.z * o }; };
  const foot = st.map((s) => ground(s.x, s.z));
  const quad = (a, b, c, d, color) => {
    for (const v of [a, b, c, a, c, d]) { pos.push(v[0], v[1], v[2]); col.push(color.r, color.g, color.b); }
  };
  for (let i = 0; i < st.length - 1; i++) {
    for (const side of [1, -1]) {
      const p0 = pt(st[i], side), p1 = pt(st[i + 1], side), g0 = foot[i], g1 = foot[i + 1];
      for (const [a, b, color] of rows) {
        const v00 = [p0.x, g0 + a, p0.z], v10 = [p1.x, g1 + a, p1.z], v11 = [p1.x, g1 + b, p1.z], v01 = [p0.x, g0 + b, p0.z];
        // outward winding: the outer face (side +1, away from the centre) and the inner face (side -1)
        if (side > 0) quad(v10, v00, v01, v11, color); else quad(v00, v10, v11, v01, color);
      }
    }
    const o0 = pt(st[i], 1), o1 = pt(st[i + 1], 1), i0 = pt(st[i], -1), i1 = pt(st[i + 1], -1);
    quad([i0.x, foot[i] + top, i0.z], [i1.x, foot[i + 1] + top, i1.z], [o1.x, foot[i + 1] + top, o1.z], [o0.x, foot[i] + top, o0.z], GREY_TOP);
  }
  for (const [k, sgn] of [[0, -1], [st.length - 1, 1]]) {
    const o = pt(st[k], 1), n = pt(st[k], -1), g = foot[k];
    for (const [a, b, color] of rows) {
      const q = [[o.x, g + a, o.z], [n.x, g + a, n.z], [n.x, g + b, n.z], [o.x, g + b, o.z]];
      if (sgn < 0) quad(q[0], q[1], q[2], q[3], color); else quad(q[1], q[0], q[3], q[2], color);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

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
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
    this.material.name = 'ninewalls-blockout';
    ctx.environment?.registerMaterial?.(this.material);
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
    const geos = L.WALLS.map((w) => { const s = L.wallState(w.id); return wallGeometry(w, this._ground, s.state, s.painted); });
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    geo.computeBoundingSphere();
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
    const G = this._ground, parts = [];
    for (const d of L.DWELLINGS) {
      const p = L.dwellingPlace(d), g = G(p.x, p.z);
      // its foot at the lowest corner's ground less the sunk floor, its roof at the centre's ground plus h
      const c = Math.cos(p.ry), s = Math.sin(p.ry);
      let gmin = g;
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = p.x + c * lx * d.w / 2 + s * lz * d.d / 2, z = p.z - s * lx * d.w / 2 + c * lz * d.d / 2;
        gmin = Math.min(gmin, G(x, z));
      }
      const y0 = gmin - d.sink, y1 = g + d.h - 0.16;
      parts.push(box(d.w, y1 - y0, d.d, p.x, (y0 + y1) / 2, p.z, p.ry, GREY_HOUSE));
      parts.push(box(d.w + 0.3, 0.16, d.d + 0.3, p.x, y1 + 0.08, p.z, p.ry, GREY_ROOF));
      // the door: a dark slot in the front, toward the tree
      parts.push(box(0.9, 1.5, 0.08, p.x + s * (d.d / 2 + 0.01), g - 0.2 + 0.75, p.z + c * (d.d / 2 + 0.01), p.ry, GREY_DARK));
    }
    const T = L.PLACES.tree, gt = G(T.x, T.z);
    parts.push(cyl(T.trunkR * 0.8, T.trunkR, T.crown, T.x, gt + T.crown / 2, T.z, GREY_TREE, 9));
    parts.push(cyl(T.canopyR, T.canopyR * 0.75, T.top - T.crown, T.x, gt + (T.crown + T.top) / 2, T.z, GREY_TREE, 12));
    const M = L.PLACES.tubeMouth, tg = L.tangentOf(M.b), rd = L.dirOf(M.b), gm = G(M.x, M.z), ry = -M.b * Math.PI / 180;
    for (const sg of [-1, 1]) {
      const x = M.x + tg.x * sg * (M.w / 2 + 0.4), z = M.z + tg.z * sg * (M.w / 2 + 0.4);
      parts.push(box(0.8, M.h + 0.6, M.depth, x, G(x, z) + (M.h + 0.6) / 2 - 0.3, z, ry, GREY_KERB));
    }
    parts.push(box(M.w + 1.6, 0.7, M.depth, M.x, gm + M.h + 0.35, M.z, ry, GREY_KERB));
    parts.push(box(M.w, M.h, 0.1, M.x + rd.x * (M.depth / 2 - 0.05), gm + M.h / 2, M.z + rd.z * (M.depth / 2 - 0.05), ry, GREY_DARK));
    const K = L.PLACES.counter, gk = G(K.x, K.z);
    parts.push(box(K.w, K.h, K.d, K.x, gk + K.h / 2, K.z, -K.b * Math.PI / 180, GREY_KERB));
    const C = L.PLACES.cistern, gc = G(C.x, C.z);
    parts.push(cyl(C.r, C.r, C.h + 0.3, C.x, gc + (C.h - 0.3) / 2, C.z, GREY_KERB, 16));
    parts.push(cyl(C.r - 0.3, C.r - 0.3, 0.02, C.x, gc + C.h + 0.01, C.z, GREY_DARK, 16));
    const B = L.PLACES.brazier, gb = G(B.x, B.z);
    parts.push(box(0.7, 0.8, 0.7, B.x, gb + 0.4, B.z, 0, GREY_KERB));
    const N = L.PLACES.niche, gn = G(N.x, N.z);
    parts.push(box(N.w, N.h, 0.06, N.x, gn + N.sill + N.h / 2, N.z, -N.b * Math.PI / 180, GREY_DARK));
    const geo = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.townMesh = new THREE.Mesh(geo, this.material);
    this.townMesh.name = 'ninewalls-town';
    this.townMesh.castShadow = true; this.townMesh.receiveShadow = true;
    this.group.add(this.townMesh);
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
