import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WIND_ROADS, POST_HEIGHT_M, postStreams } from '../../../game/kite/roads.js';

/**
 * THE LINE-POSTS OF A WIND ROAD (Milestone 3 wave 3c, area B; KF7, BIBLE §3.4: "Each is a 3 m cane post with a cloth
 * streamer"). Built from code (0 bytes shipped) for one road of src/game/kite/roads.js WIND_ROADS, each post snapped to the
 * page's ground where the data puts it. Wave 3c builds the Scar's seven (R4: a GLIDE road; its cloth streams downwind
 * whenever the kite may fly and hangs in calima and squall: roads.js postStreams).
 *
 *   const L = new LinePosts(ctx, 'scar')   built and added to ctx.scene; ctx.world.linePosts[road] = L.records
 *   L.update(t)                            the cloths follow the wind (environment.windAt), or hang
 *   L.dispose()
 *
 * Two draws for the road: the canes (each a 3 m bleached cane, a lashed cross-tie under its head and a stone foot) merged
 * into one mesh, and the cloths, one strip of 8 segments a post, re-laid on the CPU each frame (7 x 18 vertices). Neither
 * casts a shadow (a 0.05 m cane's shadow is under a pixel at any accepted lens). No collider: a 0.05 m cane is not a wall.
 */
const TONE = Object.freeze({ cane: '#b9a67c', node: '#8d7a55', lash: '#5b4a33', stone: '#3a3735', cloth: '#d8cdb0', band: '#8c4f63' });
/** m: the cane's radius at its foot and head, the cloth's length and width, the segments along it */
const CANE_R0 = 0.05, CANE_R1 = 0.032, CLOTH_L = 1.25, CLOTH_W = 0.2, SEG = 8;

const colour = (g, hex) => {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
};

/** One post's cane, at its own origin (its foot on the ground at y 0). */
function caneGeometry(seed) {
  const parts = [];
  const lean = 0.012 * Math.sin(seed * 2.1);
  const cane = new THREE.CylinderGeometry(CANE_R1, CANE_R0, POST_HEIGHT_M, 6, 3);
  cane.translate(0, POST_HEIGHT_M / 2, 0);
  cane.rotateZ(lean);
  parts.push(colour(cane, TONE.cane));
  // the cane's nodes: three darker rings
  for (const k of [0.3, 0.58, 0.83]) {
    const r = CANE_R0 + (CANE_R1 - CANE_R0) * k + 0.006;
    const n = new THREE.CylinderGeometry(r, r, 0.035, 6, 1);
    n.translate(0, POST_HEIGHT_M * k, 0); n.rotateZ(lean);
    parts.push(colour(n, TONE.node));
  }
  // the lashed cross-tie under the head (where the cloth is tied) and its lashing
  const tie = new THREE.BoxGeometry(0.34, 0.03, 0.03);
  tie.translate(0, POST_HEIGHT_M - 0.12, 0); tie.rotateZ(lean);
  parts.push(colour(tie, TONE.node));
  const lash = new THREE.CylinderGeometry(CANE_R1 + 0.012, CANE_R1 + 0.012, 0.07, 6, 1);
  lash.translate(0, POST_HEIGHT_M - 0.12, 0); lash.rotateZ(lean);
  parts.push(colour(lash, TONE.lash));
  // the foot: three stones piled round it
  for (let i = 0; i < 3; i++) {
    const a = seed * 1.7 + i * 2.1, s = new THREE.DodecahedronGeometry(0.13 + 0.03 * ((i + seed) % 2), 0);
    s.scale(1, 0.6, 1); s.translate(Math.cos(a) * 0.14, 0.04, Math.sin(a) * 0.14);
    parts.push(colour(s, TONE.stone));
  }
  return mergeGeometries(parts, false);
}

export class LinePosts {
  /** @param {any} ctx @param {'organ-shelf' | 'scar' | 'caldera'} road */
  constructor(ctx, road = 'scar') {
    this.ctx = ctx;
    this.road = road;
    const posts = WIND_ROADS[road];
    if (!posts) throw new Error(`no wind road '${road}'`);
    const T = ctx.terrain;
    this.records = posts.map((p) => Object.freeze({ id: p.id, road, i: p.i, x: p.x, z: p.z, y: T ? T.getHeight(p.x, p.z) : 0, heightM: p.heightM }));
    // the canes, one merged mesh in world space
    const canes = this.records.map((r, i) => { const g = caneGeometry(i + 1); g.translate(r.x, r.y, r.z); return g; });
    const geo = mergeGeometries(canes, false);
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = `line-posts-${road}`;
    this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    // the cloths: a strip of SEG segments a post (two rows of SEG + 1 vertices), indexed, re-laid each frame
    const nV = this.records.length * (SEG + 1) * 2;
    const pos = new Float32Array(nV * 3), col = new Float32Array(nV * 3), idx = [];
    const cl = new THREE.Color(TONE.cloth), bd = new THREE.Color(TONE.band);
    for (let p = 0; p < this.records.length; p++) {
      for (let s = 0; s <= SEG; s++) {
        for (let e = 0; e < 2; e++) {
          const v = (p * (SEG + 1) + s) * 2 + e, c = s >= SEG - 1 ? bd : cl;   // a faded band at the tail
          col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
        }
        if (s < SEG) { const a = (p * (SEG + 1) + s) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    cg.setIndex(idx);
    this.clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    this.cloth = new THREE.Mesh(cg, this.clothMat);
    this.cloth.name = `line-posts-${road}-cloth`;
    this.cloth.castShadow = false; this.cloth.receiveShadow = false;
    this.group = new THREE.Group();
    this.group.name = `line-road-${road}`;
    this.group.add(this.mesh, this.cloth);
    ctx.scene?.add?.(this.group);
    ctx.world = ctx.world || {};
    ctx.world.linePosts = { ...(ctx.world.linePosts || {}), [road]: this.records };
    this.streaming = null;
    this._w = { x: 0, z: 0 };
    this.update(0);
    cg.computeBoundingSphere();
    // the cloth's bound: the posts' sphere grown by the cloth's reach
    cg.boundingSphere = geo.boundingSphere.clone(); cg.boundingSphere.radius += CLOTH_L + 0.5;
  }

  /** The cloths: streaming downwind (their road's rule, roads.js postStreams) with a flutter, or hanging. @param {number} t s */
  update(t) {
    const env = this.ctx.environment, w = this._w;
    const flyable = typeof env?.flyable === 'function' ? env.flyable() : true;
    const pos = this.cloth.geometry.attributes.position, a = pos.array;
    let streaming = 0;
    for (let p = 0; p < this.records.length; p++) {
      const r = this.records[p];
      const on = postStreams(r, () => 0, () => r.y, flyable);
      let ms = 0;
      if (env?.windAt) ms = env.windAt(r.x, r.z, w); else { w.x = -Math.SQRT1_2 * 5.5; w.z = Math.SQRT1_2 * 5.5; ms = 5.5; }
      const L = Math.hypot(w.x, w.z) || 1, dx = w.x / L, dz = w.z / L;
      // across the wind, level: the strip's width
      const ax = -dz, az = dx;
      const k = on ? Math.min(1, 0.35 + ms / 8) : 0;   // how far it lifts off the hang
      if (on) streaming++;
      const top = r.y + POST_HEIGHT_M - 0.1;
      for (let s = 0; s <= SEG; s++) {
        const u = s / SEG, ph = t * 7.5 + p * 1.3 - u * 5;
        const flut = on ? Math.sin(ph) * 0.09 * u : 0;
        // streaming: out along the wind, sagging a little toward the tail; hanging: straight down beside the cane
        const along = CLOTH_L * u * k, down = CLOTH_L * u * (1 - k) + 0.12 * u * u * k;
        const cx = r.x + dx * along + ax * flut, cz = r.z + dz * along + az * flut, cy = top - down + (on ? Math.cos(ph) * 0.04 * u : 0);
        const half = CLOTH_W * 0.5 * (1 - 0.35 * u);
        for (let e = 0; e < 2; e++) {
          const v = (p * (SEG + 1) + s) * 2 + e, sg = e ? 1 : -1;
          // the width stands upright when streaming (a flag), level across the cane when it hangs
          a[v * 3] = cx + (on ? 0 : ax * half * sg);
          a[v * 3 + 1] = cy + (on ? half * sg : 0);
          a[v * 3 + 2] = cz + (on ? 0 : az * half * sg);
        }
      }
    }
    pos.needsUpdate = true;
    this.cloth.geometry.computeVertexNormals();
    this.streaming = streaming;
  }

  dispose() {
    this.group.removeFromParent();
    this.mesh.geometry.dispose(); this.cloth.geometry.dispose(); this.mat.dispose(); this.clothMat.dispose();
  }
}
