/**
 * Per-bone machine hit hulls + BVH raycast.  (Round 4, lane `spatial`.)
 *
 * Closes perf-tech-01 and the query half of machine-ai-13. Aiming currently
 * runs `Raycaster.intersectObject(machine.root, true)` every frame; against a
 * 190k-triangle Thunderjaw that is a ~210 ms frame (4 fps). This replaces the
 * triangle soup with bone-anchored capsules derived from the skin weights,
 * indexed in a small refittable AABB BVH.
 *
 * CONTRACT (docs/ROUND4-SPATIAL.md):
 *   ctx.hitHulls.build(machine)               -> hull set (idempotent)
 *   ctx.hitHulls.raycast(ray, opts?)          -> shared hit record | null
 *   ctx.hitHulls.raycastMachine(m, ray, far?) -> shared hit record | null
 *   ctx.hitHulls.hulls(machine)               -> [{ name, part, a, b, r }, ...]
 *   ctx.hitHulls.debugHulls(machine)          -> wireframe capsules in the scene
 *
 * The hit record is drop-in for `Machine.takeDamage`: `object` is a real node
 * inside the machine subtree, so the existing `userData.part` walk-up finds
 * the component that was struck, and `point` still feeds the weak-point
 * sphere test.
 *
 * Hull derivation, per skinned mesh: every vertex is assigned to its dominant
 * bone, transformed into that bone's BIND space, and the per-bone AABB becomes
 * a capsule along its longest local axis. Unskinned meshes (most of the
 * Thunderjaw is plate geometry parented to the body) and every attached part
 * holder get one capsule from their local bounding box. Nothing is skinned at
 * query time — two endpoint transforms per hull per refresh, and a refresh
 * only happens for machines a ray actually reaches.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _seg = { x: 0, y: 0, z: 0 };

const _hit = {
  hit: false, machine: null, hull: null, part: null, object: null,
  distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0,
  point: new THREE.Vector3(), normal: new THREE.Vector3(), name: '',
};

const _stack = new Int32Array(96);
const MAXCELLS = 200;                // default cells per bone; see HitHulls opts
// A few centimetres of skin on every capsule. Cell-fitted capsules meet at
// their shared face, and a grazing ray can thread the seam or clip a silhouette
// triangle the sampled vertices did not span. Halving `minCell` doubles the
// number of those seams, and the measured coverage gaps tracked it up (0-1 of
// 121 cross-checked rays at 0.45 m cells, 1-4 at 0.25 m), so the skin moved
// with it. 5 cm against a median surface error of 0.09-0.39 m is noise on the
// accuracy and the difference between closing a seam and threading it.
const HULL_SKIN = 0.05;
const _plan = new Int32Array(3);
let _cellMin = new Float32Array(MAXCELLS * 3);
let _cellMax = new Float32Array(MAXCELLS * 3);
let _cellCnt = new Uint32Array(MAXCELLS);
function ensureCells(n) {
  if (_cellCnt.length >= n) return;
  _cellMin = new Float32Array(n * 3);
  _cellMax = new Float32Array(n * 3);
  _cellCnt = new Uint32Array(n);
}

function closestOnSeg(px, py, pz, ax, ay, az, bx, by, bz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  out.x = ax + abx * t; out.y = ay + aby * t; out.z = az + abz * t;
  return out;
}

function raySphereT(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, far) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  let t = -b - Math.sqrt(disc);
  if (t < 0) t = 0;
  return t <= far ? t : -1;
}

function rayCapsuleT(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r, far) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const ocx = ox - ax, ocy = oy - ay, ocz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  if (baba < 1e-12) return raySphereT(ox, oy, oz, dx, dy, dz, ax, ay, az, r, far);
  const bard = bax * dx + bay * dy + baz * dz;
  const baoc = bax * ocx + bay * ocy + baz * ocz;
  const k2 = baba - bard * bard;
  const k1 = baba * (ocx * dx + ocy * dy + ocz * dz) - baoc * bard;
  const k0 = baba * (ocx * ocx + ocy * ocy + ocz * ocz - r * r) - baoc * baoc;
  const h = k1 * k1 - k2 * k0;
  if (h >= 0 && Math.abs(k2) > 1e-9) {
    const sq = Math.sqrt(h);
    let t = (-k1 - sq) / k2;
    if (t < 0) t = (-k1 + sq) / k2 >= 0 ? 0 : t;
    if (t >= 0 && t <= far) {
      const y = baoc + t * bard;
      if (y > -1e-4 && y < baba + 1e-4) return t;
    }
  }
  const ta = raySphereT(ox, oy, oz, dx, dy, dz, ax, ay, az, r, far);
  const tb = raySphereT(ox, oy, oz, dx, dy, dz, bx, by, bz, r, far);
  if (ta < 0) return tb;
  if (tb < 0) return ta;
  return ta < tb ? ta : tb;
}

/** Refittable AABB BVH over a fixed set of capsules (median split, depth-first). */
class HullBVH {
  constructor(n) {
    const cap = Math.max(1, n * 2);
    this.bounds = new Float32Array(cap * 6);
    this.left = new Int32Array(cap).fill(-1);
    this.right = new Int32Array(cap).fill(-1);
    this.start = new Int32Array(cap);
    this.count = new Int32Array(cap);
    this.order = new Int32Array(Math.max(1, n));
    this.nodes = 0;
    this._sort = [];
  }

  build(hulls) {
    const n = hulls.length;
    this.nodes = 0;
    for (let i = 0; i < n; i++) this.order[i] = i;
    if (n === 0) return;
    this._split(hulls, 0, n);
  }

  _split(hulls, start, count) {
    const node = this.nodes++;
    this.start[node] = start;
    this.count[node] = count;
    this.left[node] = -1;
    this.right[node] = -1;
    if (count <= 4) return node;

    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = start; i < start + count; i++) {
      const h = hulls[this.order[i]];
      const cx = (h.wax + h.wbx) * 0.5, cy = (h.way + h.wby) * 0.5, cz = (h.waz + h.wbz) * 0.5;
      if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx;
      if (cy < mny) mny = cy; if (cy > mxy) mxy = cy;
      if (cz < mnz) mnz = cz; if (cz > mxz) mxz = cz;
    }
    const ex = mxx - mnx, ey = mxy - mny, ez = mxz - mnz;
    const axis = ex > ey ? (ex > ez ? 0 : 2) : (ey > ez ? 1 : 2);
    const tmp = this._sort;
    tmp.length = 0;
    for (let i = start; i < start + count; i++) tmp.push(this.order[i]);
    tmp.sort((i, j) => {
      const a = hulls[i], b = hulls[j];
      const ca = axis === 0 ? a.wax + a.wbx : axis === 1 ? a.way + a.wby : a.waz + a.wbz;
      const cb = axis === 0 ? b.wax + b.wbx : axis === 1 ? b.way + b.wby : b.waz + b.wbz;
      return ca - cb;
    });
    for (let i = 0; i < tmp.length; i++) this.order[start + i] = tmp[i];

    const mid = count >> 1;
    this.left[node] = this._split(hulls, start, mid);
    this.right[node] = this._split(hulls, start + mid, count - mid);
    return node;
  }

  /** Children always have higher indices than their parent, so sweep backwards. */
  refit(hulls) {
    for (let node = this.nodes - 1; node >= 0; node--) {
      const o = node * 6;
      let mnx = Infinity, mny = Infinity, mnz = Infinity;
      let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      if (this.left[node] === -1) {
        const s = this.start[node], c = this.count[node];
        for (let i = s; i < s + c; i++) {
          const h = hulls[this.order[i]];
          if (h.minx < mnx) mnx = h.minx; if (h.maxx > mxx) mxx = h.maxx;
          if (h.miny < mny) mny = h.miny; if (h.maxy > mxy) mxy = h.maxy;
          if (h.minz < mnz) mnz = h.minz; if (h.maxz > mxz) mxz = h.maxz;
        }
      } else {
        for (let k = 0; k < 2; k++) {
          const c = k === 0 ? this.left[node] : this.right[node];
          if (c < 0) continue;
          const co = c * 6;
          if (this.bounds[co] < mnx) mnx = this.bounds[co];
          if (this.bounds[co + 1] < mny) mny = this.bounds[co + 1];
          if (this.bounds[co + 2] < mnz) mnz = this.bounds[co + 2];
          if (this.bounds[co + 3] > mxx) mxx = this.bounds[co + 3];
          if (this.bounds[co + 4] > mxy) mxy = this.bounds[co + 4];
          if (this.bounds[co + 5] > mxz) mxz = this.bounds[co + 5];
        }
      }
      this.bounds[o] = mnx; this.bounds[o + 1] = mny; this.bounds[o + 2] = mnz;
      this.bounds[o + 3] = mxx; this.bounds[o + 4] = mxy; this.bounds[o + 5] = mxz;
    }
  }
}

export class HitHulls {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.sets = new Map();
    this.frame = 0;
    this.budget = opts.budget ?? 4;           // machines refreshed per frame (soft)
    /* Extraction budget. Measured on the live roster with the machines frozen
     * (see tools/gates.round4.spatial.mjs A23b, and the sweep in the Fix
     * Round 2 report): this triple gives a median surface error of 0.14-0.32 m
     * per species, 0-2 coverage gaps in 121 cross-checked rays, 1-6 us a
     * query, and ~250 ms of one-off extraction across all eight species.
     *
     * `minCell` is the lever that matters and it was too coarse at 0.45 m.
     * `_cellPlan` stops subdividing once the largest cell side is under
     * `minCell * 2`, so on the Thunderjaw — whose whole 12.9 m body is ONE
     * skinned mesh over 13 bones — the 200-cell cap never bound and the cells
     * stayed ~0.9 m wide, which is what put its capsule skin a median 0.47 m
     * proud of the sculpt. Halving minCell halves the cell, and the sweep on
     * that species reads: 0.45 m -> 0.47 m error at 5.0 us and 980 hulls;
     * 0.25 -> 0.29 m at 1.7 us and 1505; 0.18 -> 0.30 m at 1.1 us and 2213;
     * 0.12 -> 0.30 m at 0.8 us and 2919. Accuracy stops improving at 0.25 and
     * only the hull count grows. Queries get FASTER as cells tighten (the BVH
     * prunes better), and the cost is build time: 7 ms -> 13 ms for the
     * Thunderjaw, amortised one machine per frame.
     * Raising maxScan to 24k buys nothing (0.53 -> 0.54 m on the same sweep). */
    this.maxScan = opts.maxScan ?? 12000;      // vertices sampled per mesh
    this.maxCells = opts.maxCells ?? 400;      // capsules per bone / per mesh
    this.minCell = opts.minCell ?? 0.25;       // finest cell, world metres
    this.stats = { built: 0, refreshes: 0, frameRefreshes: 0, tests: 0, queries: 0 };
    // candidate pool — raycast must not allocate
    this._candM = [];
    this._candS = [];
    this._candT = [];
    this._n = 0;
  }

  /* -------------------------------- build -------------------------------- */

  build(machine) {
    if (!machine || !machine.root) return null;
    const cached = this.sets.get(machine);
    if (cached && cached.parts === machine.parts.length) return cached;
    const hulls = [];
    const bones = [];
    const boneKey = new Map();

    machine.root.updateWorldMatrix(true, true);
    machine.root.traverse((o) => {
      if (Object.prototype.hasOwnProperty.call(o, 'raycast')) return; // FX shell
      if (o.isSprite || o.isPoints || o.isLine) return;
      if (o.isSkinnedMesh) this._fromSkinned(o, hulls, bones, boneKey);
      else if (o.isMesh) this._fromMesh(o, hulls);
    });

    const set = {
      machine, hulls, bones, bvh: new HullBVH(hulls.length),
      frame: -1, parts: machine.parts.length,
    };
    this.sets.set(machine, set);
    this._refresh(set, true);
    set.bvh.build(hulls);
    set.bvh.refit(hulls);
    this.stats.built++;
    return set;
  }

  _partOf(o) {
    let n = o;
    while (n) {
      if (n.userData && n.userData.part) return n.userData.part;
      n = n.parent;
    }
    return null;
  }

  /**
   * FIX ROUND 2 — shrink each capsule from the CIRCUMRADIUS of its cell box
   * down to the real farthest vertex in that cell.
   *
   * `_capsuleFromBox` sizes the radius as `0.5 * hypot(offAxis1, offAxis2)`,
   * the radius of the sphere that contains the cell box's CORNERS. Machine
   * shells are rounded, so those corners hold no geometry: the capsule ends up
   * up to sqrt(2) wider than the metal. A judge measured the consequence — the
   * hull surface sitting a median 0.19-0.48 m and up to 2.9 m proud of the
   * sculpt, with 18-46 % of hull hits landing on air beside the machine.
   *
   * Distance to a segment is convex, so its maximum over a triangle is at a
   * vertex: a capsule that contains every sampled vertex of a cell contains
   * every triangle whose vertices are in that cell — exactly the enclosure the
   * box radius provided, with none of the corner slack. The radius is only
   * ever LOWERED here (`want < rec.lr`), so a cell whose measurement wants
   * more keeps the old value and this pass can never open a coverage gap the
   * box fit did not already have.
   *
   * `visit` walks the same sampled vertices the binning pass did, calling
   * `hit(cellIndex, x, y, z)` in the same local space the cells were built in.
   */
  _tighten(recOf, count, visit) {
    const rad = this._radScratch && this._radScratch.length >= count
      ? this._radScratch : (this._radScratch = new Float32Array(Math.max(count, 256)));
    rad.fill(0, 0, count);
    visit((k, x, y, z) => {
      const rec = recOf[k];
      if (!rec) return;
      const abx = rec.lbx - rec.lax, aby = rec.lby - rec.lay, abz = rec.lbz - rec.laz;
      const apx = x - rec.lax, apy = y - rec.lay, apz = z - rec.laz;
      const len2 = abx * abx + aby * aby + abz * abz;
      let t = len2 > 1e-12 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const d = Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
      if (d > rad[k]) rad[k] = d;
    });
    for (let k = 0; k < count; k++) {
      const rec = recOf[k];
      if (!rec || rad[k] <= 0) continue;
      // 2 % + 5 mm covers the vertices `stride` skipped on a dense mesh
      const want = rad[k] * 1.02 + 0.005;
      if (want >= rec.lr) continue;
      rec.lr = want;
      /* Re-derive the SEGMENT for the smaller radius. `_capsuleFromBox` insets
       * each end by r, so dropping r without re-insetting would leave the two
       * ends of the cell covered by a cap that is now too small — measured as
       * new coverage gaps on the Thunderjaw (0 -> 3 of 61 rays) the first time
       * this pass shipped. A longer segment can only DECREASE distance to it,
       * so every vertex measured above is still inside. */
      if (rec.half !== undefined) {
        const d = Math.max(0, rec.half - Math.min(want, rec.half));
        rec.lax = rec.cx; rec.lay = rec.cy; rec.laz = rec.cz;
        rec.lbx = rec.cx; rec.lby = rec.cy; rec.lbz = rec.cz;
        if (rec.axis === 0) { rec.lax = rec.cx - d; rec.lbx = rec.cx + d; }
        else if (rec.axis === 1) { rec.lay = rec.cy - d; rec.lby = rec.cy + d; }
        else { rec.laz = rec.cz - d; rec.lbz = rec.cz + d; }
      }
    }
  }

  /** Capsule from a local AABB: segment along the longest axis, inset by r. */
  _capsuleFromBox(minx, miny, minz, maxx, maxy, maxz, rec) {
    const ex = maxx - minx, ey = maxy - miny, ez = maxz - minz;
    const cx = (minx + maxx) * 0.5, cy = (miny + maxy) * 0.5, cz = (minz + maxz) * 0.5;
    const axis = ex > ey ? (ex > ez ? 0 : 2) : (ey > ez ? 1 : 2);
    const half = (axis === 0 ? ex : axis === 1 ? ey : ez) * 0.5;
    const o1 = axis === 0 ? ey : ex;
    const o2 = axis === 2 ? ey : ez;
    let r = 0.5 * Math.hypot(o1, o2);   // fully encloses the cell: shrinking
                                        // this opens gaps the sculpt would hit
    if (!(r > 0)) r = Math.max(0.01, half * 0.35);
    const d = Math.max(0, half - Math.min(r, half));
    rec.lax = cx; rec.lay = cy; rec.laz = cz;
    rec.lbx = cx; rec.lby = cy; rec.lbz = cz;
    if (axis === 0) { rec.lax = cx - d; rec.lbx = cx + d; }
    else if (axis === 1) { rec.lay = cy - d; rec.lby = cy + d; }
    else { rec.laz = cz - d; rec.lbz = cz + d; }
    rec.lr = r;
    // kept so `_tighten` can re-derive the segment when it lowers the radius:
    // the inset is `half - r`, so a smaller r means a LONGER segment
    rec.cx = cx; rec.cy = cy; rec.cz = cz; rec.axis = axis; rec.half = half;
    return rec;
  }

  _blank(src, node, boneSlot, object, part, name) {
    return {
      src, node, bone: boneSlot, object, part, name,
      lax: 0, lay: 0, laz: 0, lbx: 0, lby: 0, lbz: 0, lr: 0,
      wax: 0, way: 0, waz: 0, wbx: 0, wby: 0, wbz: 0, wr: 0,
      minx: 0, miny: 0, minz: 0, maxx: 0, maxy: 0, maxz: 0,
      off: false,
    };
  }

  /**
   * Cell plan for a point cloud: how many slices along each local axis.
   * One capsule per non-empty cell, so a long bone becomes a chain and a
   * broad one (a Thunderjaw torso is a single 188k-triangle skinned mesh on
   * 13 bones) becomes a cluster that hugs the shell instead of one sausage.
   */
  _cellPlan(ex, ey, ez, scale, out) {
    const minCell = this.minCell / (scale || 1);
    const cap = this.maxCells;
    out[0] = 1; out[1] = 1; out[2] = 1;
    const e = [ex, ey, ez];
    for (let guard = 0; guard < 512; guard++) {
      if (out[0] * out[1] * out[2] >= cap) break;
      let a = -1, biggest = minCell * 2;
      for (let i = 0; i < 3; i++) {
        const cs = e[i] / out[i];
        if (cs > biggest) { biggest = cs; a = i; }
      }
      if (a < 0) break;
      const next = out[a] + 1;
      if (next * (a === 0 ? out[1] * out[2] : a === 1 ? out[0] * out[2] : out[0] * out[1]) > cap) break;
      out[a] = next;
    }
    return out;
  }

  _cellIndex(px, py, pz, mnx, mny, mnz, sx, sy, sz, nx, ny, nz) {
    let ix = sx > 0 ? Math.floor((px - mnx) / sx) : 0;
    let iy = sy > 0 ? Math.floor((py - mny) / sy) : 0;
    let iz = sz > 0 ? Math.floor((pz - mnz) / sz) : 0;
    if (ix < 0) ix = 0; else if (ix >= nx) ix = nx - 1;
    if (iy < 0) iy = 0; else if (iy >= ny) iy = ny - 1;
    if (iz < 0) iz = 0; else if (iz >= nz) iz = nz - 1;
    return (iz * ny + iy) * nx + ix;
  }

  _worldScaleOf(node) {
    const e = node.matrixWorld.elements;
    return Math.max(
      Math.hypot(e[0], e[1], e[2]),
      Math.hypot(e[4], e[5], e[6]),
      Math.hypot(e[8], e[9], e[10]),
    ) || 1;
  }

  _fromMesh(o, hulls) {
    const geo = o.geometry;
    const pos = geo && geo.attributes.position;
    if (!pos) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const part = this._partOf(o);
    const name = o.name || 'mesh';
    const ex = bb.max.x - bb.min.x, ey = bb.max.y - bb.min.y, ez = bb.max.z - bb.min.z;
    const plan = this._cellPlan(ex, ey, ez, this._worldScaleOf(o), _plan);
    const nx = plan[0], ny = plan[1], nz = plan[2];
    const cells = nx * ny * nz;
    if (cells === 1 || pos.count < 24) {
      const rec = this._blank('node', o, -1, o, part, name);
      this._capsuleFromBox(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, rec);
      if (rec.lr > 0) {
        hulls.push(rec);
        const one = [rec];
        const st = Math.max(1, Math.ceil(pos.count / this.maxScan));
        this._tighten(one, 1, (hit) => {
          for (let i = 0; i < pos.count; i += st) hit(0, pos.getX(i), pos.getY(i), pos.getZ(i));
        });
      }
      return;
    }
    const sx = ex / nx, sy = ey / ny, sz = ez / nz;
    ensureCells(cells);
    _cellMin.fill(Infinity, 0, cells * 3);
    _cellMax.fill(-Infinity, 0, cells * 3);
    _cellCnt.fill(0, 0, cells);
    const stride = Math.max(1, Math.ceil(pos.count / this.maxScan));
    for (let i = 0; i < pos.count; i += stride) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = this._cellIndex(x, y, z, bb.min.x, bb.min.y, bb.min.z, sx, sy, sz, nx, ny, nz);
      const b = k * 3;
      if (x < _cellMin[b]) _cellMin[b] = x; if (x > _cellMax[b]) _cellMax[b] = x;
      if (y < _cellMin[b + 1]) _cellMin[b + 1] = y; if (y > _cellMax[b + 1]) _cellMax[b + 1] = y;
      if (z < _cellMin[b + 2]) _cellMin[b + 2] = z; if (z > _cellMax[b + 2]) _cellMax[b + 2] = z;
      _cellCnt[k]++;
    }
    const recOf = new Array(cells).fill(null);
    for (let k = 0; k < cells; k++) {
      if (_cellCnt[k] < 1) continue;
      const b = k * 3;
      const rec = this._blank('node', o, -1, o, part, `${name}#${k}`);
      this._capsuleFromBox(_cellMin[b], _cellMin[b + 1], _cellMin[b + 2],
        _cellMax[b], _cellMax[b + 1], _cellMax[b + 2], rec);
      if (rec.lr > 0) { hulls.push(rec); recOf[k] = rec; }
    }
    this._tighten(recOf, cells, (hit) => {
      for (let i = 0; i < pos.count; i += stride) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        hit(this._cellIndex(x, y, z, bb.min.x, bb.min.y, bb.min.z, sx, sy, sz, nx, ny, nz), x, y, z);
      }
    });
  }

  _fromSkinned(sk, hulls, bones, boneKey) {
    const geo = sk.geometry;
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const skel = sk.skeleton;
    if (!pos || !si || !sw || !skel || !skel.boneInverses) {
      this._fromMesh(sk, hulls);
      return;
    }
    const nb = skel.bones.length;
    const mn = new Float32Array(nb * 3).fill(Infinity);
    const mx = new Float32Array(nb * 3).fill(-Infinity);
    const cnt = new Uint32Array(nb);
    const bind = sk.bindMatrix;
    const stride = Math.max(1, Math.ceil(pos.count / this.maxScan));
    const scale = this._worldScaleOf(sk);

    // pass 1: per-bone bind-space AABB
    for (let i = 0; i < pos.count; i += stride) {
      let bi = si.getX(i), bw = sw.getX(i);
      let v = sw.getY(i); if (v > bw) { bw = v; bi = si.getY(i); }
      v = sw.getZ(i); if (v > bw) { bw = v; bi = si.getZ(i); }
      v = sw.getW(i); if (v > bw) { bw = v; bi = si.getW(i); }
      if (bw < 0.18 || bi < 0 || bi >= nb) continue;
      const invB = skel.boneInverses[bi];
      if (!invB) continue;
      _p.fromBufferAttribute(pos, i).applyMatrix4(bind).applyMatrix4(invB);
      const o = bi * 3;
      if (_p.x < mn[o]) mn[o] = _p.x; if (_p.x > mx[o]) mx[o] = _p.x;
      if (_p.y < mn[o + 1]) mn[o + 1] = _p.y; if (_p.y > mx[o + 1]) mx[o + 1] = _p.y;
      if (_p.z < mn[o + 2]) mn[o + 2] = _p.z; if (_p.z > mx[o + 2]) mx[o + 2] = _p.z;
      cnt[bi]++;
    }

    // plan the per-bone cell grids
    const nxs = new Uint16Array(nb), nys = new Uint16Array(nb), nzs = new Uint16Array(nb);
    const base = new Int32Array(nb);
    let total = 0;
    for (let bi = 0; bi < nb; bi++) {
      if (cnt[bi] < 3) continue;
      const o = bi * 3;
      const ex = mx[o] - mn[o], ey = mx[o + 1] - mn[o + 1], ez = mx[o + 2] - mn[o + 2];
      if (cnt[bi] < 24) { nxs[bi] = 1; nys[bi] = 1; nzs[bi] = 1; }
      else {
        this._cellPlan(ex, ey, ez, scale, _plan);
        nxs[bi] = _plan[0]; nys[bi] = _plan[1]; nzs[bi] = _plan[2];
      }
      base[bi] = total;
      total += nxs[bi] * nys[bi] * nzs[bi];
    }
    const cMin = new Float32Array(total * 3).fill(Infinity);
    const cMax = new Float32Array(total * 3).fill(-Infinity);
    const cCnt = new Uint32Array(total);

    // pass 2: bin every vertex into its bone's cell grid
    for (let i = 0; i < pos.count; i += stride) {
      let bi = si.getX(i), bw = sw.getX(i);
      let v = sw.getY(i); if (v > bw) { bw = v; bi = si.getY(i); }
      v = sw.getZ(i); if (v > bw) { bw = v; bi = si.getZ(i); }
      v = sw.getW(i); if (v > bw) { bw = v; bi = si.getW(i); }
      if (bw < 0.18 || bi < 0 || bi >= nb || cnt[bi] < 3) continue;
      const invB = skel.boneInverses[bi];
      if (!invB) continue;
      _p.fromBufferAttribute(pos, i).applyMatrix4(bind).applyMatrix4(invB);
      const o = bi * 3;
      const nx = nxs[bi], ny = nys[bi], nz = nzs[bi];
      const k = base[bi] + this._cellIndex(_p.x, _p.y, _p.z, mn[o], mn[o + 1], mn[o + 2],
        (mx[o] - mn[o]) / nx, (mx[o + 1] - mn[o + 1]) / ny, (mx[o + 2] - mn[o + 2]) / nz,
        nx, ny, nz);
      const b = k * 3;
      if (_p.x < cMin[b]) cMin[b] = _p.x; if (_p.x > cMax[b]) cMax[b] = _p.x;
      if (_p.y < cMin[b + 1]) cMin[b + 1] = _p.y; if (_p.y > cMax[b + 1]) cMax[b + 1] = _p.y;
      if (_p.z < cMin[b + 2]) cMin[b + 2] = _p.z; if (_p.z > cMax[b + 2]) cMax[b + 2] = _p.z;
      cCnt[k]++;
    }

    const part = this._partOf(sk);
    const recOf = new Array(total).fill(null);
    let made = 0;
    for (let bi = 0; bi < nb; bi++) {
      if (cnt[bi] < 3) continue;
      const bone = skel.bones[bi];
      if (!bone) continue;
      let slot = boneKey.get(bone);
      if (slot === undefined) {
        slot = bones.length;
        bones.push({ sk, bone, mat: new THREE.Matrix4(), scale: 1 });
        boneKey.set(bone, slot);
      }
      const cells = nxs[bi] * nys[bi] * nzs[bi];
      const nm = bone.name || `bone_${bi}`;
      for (let k = 0; k < cells; k++) {
        const gi = base[bi] + k;
        if (cCnt[gi] < 1) continue;
        const b = gi * 3;
        const rec = this._blank('bone', sk, slot, sk, part, cells > 1 ? `${nm}#${k}` : nm);
        this._capsuleFromBox(cMin[b], cMin[b + 1], cMin[b + 2],
          cMax[b], cMax[b + 1], cMax[b + 2], rec);
        if (rec.lr > 0) { hulls.push(rec); recOf[gi] = rec; made++; }
      }
    }
    // pass 3: tighten every capsule onto its own bind-space point cloud
    if (made) {
      this._tighten(recOf, total, (hit) => {
        for (let i = 0; i < pos.count; i += stride) {
          let bi = si.getX(i), bw = sw.getX(i);
          let v = sw.getY(i); if (v > bw) { bw = v; bi = si.getY(i); }
          v = sw.getZ(i); if (v > bw) { bw = v; bi = si.getZ(i); }
          v = sw.getW(i); if (v > bw) { bw = v; bi = si.getW(i); }
          if (bw < 0.18 || bi < 0 || bi >= nb || cnt[bi] < 3) continue;
          const invB = skel.boneInverses[bi];
          if (!invB) continue;
          _p.fromBufferAttribute(pos, i).applyMatrix4(bind).applyMatrix4(invB);
          const o = bi * 3;
          const nx = nxs[bi], ny = nys[bi], nz = nzs[bi];
          hit(base[bi] + this._cellIndex(_p.x, _p.y, _p.z, mn[o], mn[o + 1], mn[o + 2],
            (mx[o] - mn[o]) / nx, (mx[o + 1] - mn[o + 1]) / ny, (mx[o + 2] - mn[o + 2]) / nz,
            nx, ny, nz), _p.x, _p.y, _p.z);
        }
      });
    }
    if (!made) this._fromMesh(sk, hulls); // degenerate rig: fall back to the box
  }

  /* ------------------------------- refresh ------------------------------- */

  _refresh(set, force = false) {
    if (!force && set.frame === this.frame) return;
    set.frame = this.frame;
    this.stats.refreshes++;
    this.stats.frameRefreshes++;
    set.machine.root.updateMatrixWorld(true);

    for (let i = 0; i < set.bones.length; i++) {
      const rec = set.bones[i];
      // world = skinnedMesh.matrixWorld * bindMatrixInverse * bone.matrixWorld
      rec.mat.multiplyMatrices(rec.sk.matrixWorld, rec.sk.bindMatrixInverse);
      rec.mat.multiply(rec.bone.matrixWorld);
      const e = rec.mat.elements;
      rec.scale = Math.max(
        Math.hypot(e[0], e[1], e[2]),
        Math.hypot(e[4], e[5], e[6]),
        Math.hypot(e[8], e[9], e[10]),
      ) || 1;
    }

    const hulls = set.hulls;
    for (let i = 0; i < hulls.length; i++) {
      const h = hulls[i];
      h.off = !!(h.part && h.part.attached === false);
      let mat, scale;
      if (h.src === 'bone') {
        const rec = set.bones[h.bone];
        mat = rec.mat; scale = rec.scale;
      } else {
        mat = h.node.matrixWorld;
        const e = mat.elements;
        scale = Math.max(
          Math.hypot(e[0], e[1], e[2]),
          Math.hypot(e[4], e[5], e[6]),
          Math.hypot(e[8], e[9], e[10]),
        ) || 1;
      }
      _a.set(h.lax, h.lay, h.laz).applyMatrix4(mat);
      _b.set(h.lbx, h.lby, h.lbz).applyMatrix4(mat);
      h.wax = _a.x; h.way = _a.y; h.waz = _a.z;
      h.wbx = _b.x; h.wby = _b.y; h.wbz = _b.z;
      h.wr = h.lr * scale + HULL_SKIN;
      h.minx = Math.min(h.wax, h.wbx) - h.wr; h.maxx = Math.max(h.wax, h.wbx) + h.wr;
      h.miny = Math.min(h.way, h.wby) - h.wr; h.maxy = Math.max(h.way, h.wby) + h.wr;
      h.minz = Math.min(h.waz, h.wbz) - h.wr; h.maxz = Math.max(h.waz, h.wbz) + h.wr;
    }
    if (!force) set.bvh.refit(hulls);
  }

  /* -------------------------------- query -------------------------------- */

  /**
   * Nearest hull along a ray. `ray` is anything with {origin, direction}
   * (THREE.Ray, Raycaster.ray, or a plain object); direction must be unit.
   * opts: { far, machines, includeDead, ignore }
   * Returns the SHARED hit record (copy what you keep) or null.
   */
  raycast(ray, opts = null) {
    const list = (opts && opts.machines)
      || (this.ctx.machines && this.ctx.machines.list) || [];
    const far = (opts && opts.far) || 1e6;
    const includeDead = !!(opts && opts.includeDead);
    const ignore = opts && opts.ignore;
    const o = ray.origin, d = ray.direction;
    this.stats.queries++;

    let n = 0;
    const cm = this._candM, cs = this._candS, ct = this._candT;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || !m.root) continue;
      if (!includeDead && m.alive === false) continue;
      if (ignore === m) continue;
      const set = this.sets.get(m) || this.build(m);
      if (!set || !set.hulls.length) continue;
      const cy = m.position.y + (m.height || 2) * 0.5;
      const sx = m.size ? m.size.x : 2, sz = m.size ? m.size.z : 2;
      const rad = 0.5 * Math.max(sx, sz, m.height || 2) + 1.2;
      const t = raySphereT(o.x, o.y, o.z, d.x, d.y, d.z, m.position.x, cy, m.position.z, rad, far);
      if (t < 0) continue;
      cm[n] = m; cs[n] = set; ct[n] = t; n++;
    }
    if (!n) return null;
    // insertion sort by entry distance (n is tiny; no allocation)
    for (let i = 1; i < n; i++) {
      const km = cm[i], ks = cs[i], kt = ct[i];
      let j = i - 1;
      while (j >= 0 && ct[j] > kt) { cm[j + 1] = cm[j]; cs[j + 1] = cs[j]; ct[j + 1] = ct[j]; j--; }
      cm[j + 1] = km; cs[j + 1] = ks; ct[j + 1] = kt;
    }

    const exact = !!(opts && opts.exact);
    let best = far, bestHull = null, bestSet = null;
    for (let i = 0; i < n; i++) {
      if (ct[i] >= best) break;              // every remaining machine is farther
      this._refresh(cs[i]);
      const h = this._query(cs[i], o, d, best, exact);
      if (h) { best = this._lastT; bestHull = h; bestSet = cs[i]; }
    }
    if (!bestHull) return null;
    return this._fill(bestSet, bestHull, o, d, best);
  }

  /** Single-machine query — the cheap path for arrow flight and melee. */
  raycastMachine(machine, ray, far = 1e6, opts = null) {
    const set = this.sets.get(machine) || this.build(machine);
    if (!set || !set.hulls.length) return null;
    this._refresh(set);
    const h = this._query(set, ray.origin, ray.direction, far, !!(opts && opts.exact));
    if (!h) return null;
    return this._fill(set, h, ray.origin, ray.direction, this._lastT);
  }

  /**
   * Hull query with optional exact refinement. Capsules are deliberately a
   * little proud of the sculpt, which is right for a per-frame aim ray and
   * wrong for an impact point; `exact` re-tests the winning capsule's own
   * UNSKINNED mesh with a triangle BVH and keeps searching until the nearest
   * confirmed surface wins. Skinned hulls stay capsule-accurate (refitting a
   * skinned BVH every frame is exactly the cost this module exists to avoid).
   */
  _query(set, o, d, far, exact) {
    if (!exact) {
      const h = this._traverse(set, o, d, far, null);
      return h;
    }
    const excl = this._excl || (this._excl = []);
    excl.length = 0;
    let acceptedT = far, accepted = null;
    for (let iter = 0; iter < 5; iter++) {
      const h = this._traverse(set, o, d, acceptedT, excl);
      if (!h) break;
      const t = this._lastT;
      if (h.src !== 'node') { acceptedT = t; accepted = h; break; }
      excl.push(h);
      const t2 = this._exactT(h.node, o, d, far);
      if (t2 != null && t2 < acceptedT) { acceptedT = t2; accepted = h; }
    }
    this._lastT = acceptedT;
    return accepted;
  }

  /** Triangle-exact distance along the ray for one unskinned mesh, or null. */
  _exactT(node, o, d, far) {
    const geo = node.geometry;
    if (!geo || !geo.attributes.position) return null;
    const tri = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    if (tri > 60000) return null;                       // not worth a BVH
    if (!this._bvh) this._bvh = new Map();
    let bvh = this._bvh.get(geo.uuid);
    if (bvh === undefined) {
      bvh = new MeshBVH(geo, { maxLeafTris: 12 });
      this._bvh.set(geo.uuid, bvh);
    }
    if (!this._inv) { this._inv = new THREE.Matrix4(); this._lray = new THREE.Ray(); }
    this._inv.copy(node.matrixWorld).invert();
    this._lray.origin.set(o.x, o.y, o.z);
    this._lray.direction.set(d.x, d.y, d.z);
    this._lray.applyMatrix4(this._inv);
    const e = node.matrixWorld.elements;
    const scale = Math.max(
      Math.hypot(e[0], e[1], e[2]),
      Math.hypot(e[4], e[5], e[6]),
      Math.hypot(e[8], e[9], e[10]),
    ) || 1;
    this._lray.direction.normalize();
    const hit = bvh.raycastFirst(this._lray, THREE.DoubleSide, 0, far / scale);
    return hit ? hit.distance * scale : null;
  }

  /** Pre-build the exact BVHs for a machine (avoids a mid-fight hitch). */
  warmExact(machine) {
    const set = this.sets.get(machine) || this.build(machine);
    if (!set) return 0;
    const seen = new Set();
    let n = 0;
    for (const h of set.hulls) {
      if (h.src !== 'node' || seen.has(h.node.geometry.uuid)) continue;
      seen.add(h.node.geometry.uuid);
      this._exactT(h.node, _a.set(0, 1e6, 0), _b.set(0, -1, 0), 1);
      n++;
    }
    return n;
  }

  _fill(set, hull, o, d, t) {
    _hit.hit = true;
    _hit.machine = set.machine;
    _hit.hull = hull;
    _hit.part = hull.part && hull.part.attached ? hull.part : null;
    _hit.object = _hit.part ? _hit.part.mesh : hull.object;
    _hit.name = hull.name;
    _hit.distance = t;
    _hit.x = o.x + d.x * t; _hit.y = o.y + d.y * t; _hit.z = o.z + d.z * t;
    _hit.point.set(_hit.x, _hit.y, _hit.z);
    closestOnSeg(_hit.x, _hit.y, _hit.z,
      hull.wax, hull.way, hull.waz, hull.wbx, hull.wby, hull.wbz, _seg);
    _hit.normal.set(_hit.x - _seg.x, _hit.y - _seg.y, _hit.z - _seg.z);
    if (_hit.normal.lengthSq() < 1e-8) _hit.normal.set(-d.x, -d.y, -d.z);
    _hit.normal.normalize();
    _hit.nx = _hit.normal.x; _hit.ny = _hit.normal.y; _hit.nz = _hit.normal.z;
    return _hit;
  }

  _traverse(set, o, d, far, excl) {
    const bvh = set.bvh;
    const hulls = set.hulls;
    if (!bvh.nodes) return null;
    const invx = 1 / (d.x || 1e-12), invy = 1 / (d.y || 1e-12), invz = 1 / (d.z || 1e-12);
    let sp = 0;
    _stack[sp++] = 0;
    let bestT = far, best = null;
    while (sp > 0) {
      const node = _stack[--sp];
      const b = node * 6;
      let t0 = (bvh.bounds[b] - o.x) * invx, t1 = (bvh.bounds[b + 3] - o.x) * invx;
      let tmin = t0 < t1 ? t0 : t1, tmax = t0 < t1 ? t1 : t0;
      t0 = (bvh.bounds[b + 1] - o.y) * invy; t1 = (bvh.bounds[b + 4] - o.y) * invy;
      if ((t0 < t1 ? t0 : t1) > tmin) tmin = t0 < t1 ? t0 : t1;
      if ((t0 < t1 ? t1 : t0) < tmax) tmax = t0 < t1 ? t1 : t0;
      t0 = (bvh.bounds[b + 2] - o.z) * invz; t1 = (bvh.bounds[b + 5] - o.z) * invz;
      if ((t0 < t1 ? t0 : t1) > tmin) tmin = t0 < t1 ? t0 : t1;
      if ((t0 < t1 ? t1 : t0) < tmax) tmax = t0 < t1 ? t1 : t0;
      if (tmax < 0 || tmin > tmax || tmin > bestT) continue;
      if (bvh.left[node] === -1) {
        const s = bvh.start[node], c = bvh.count[node];
        for (let i = s; i < s + c; i++) {
          const h = hulls[bvh.order[i]];
          if (h.off) continue;
          if (excl && excl.indexOf(h) >= 0) continue;
          this.stats.tests++;
          const t = rayCapsuleT(o.x, o.y, o.z, d.x, d.y, d.z,
            h.wax, h.way, h.waz, h.wbx, h.wby, h.wbz, h.wr, bestT);
          if (t >= 0 && t < bestT) { bestT = t; best = h; }
        }
      } else if (sp < 92) {
        _stack[sp++] = bvh.left[node];
        _stack[sp++] = bvh.right[node];
      }
    }
    this._lastT = bestT;
    return best;
  }

  /* -------------------------------- misc --------------------------------- */

  hulls(machine) {
    const set = this.sets.get(machine) || this.build(machine);
    if (!set) return [];
    this._refresh(set);
    return set.hulls.map((h) => ({
      name: h.name, part: h.part ? h.part.name : null, r: +h.wr.toFixed(3),
      a: [+h.wax.toFixed(3), +h.way.toFixed(3), +h.waz.toFixed(3)],
      b: [+h.wbx.toFixed(3), +h.wby.toFixed(3), +h.wbz.toFixed(3)],
    }));
  }

  /** Drop wireframe capsules into the scene for a screenshot. */
  debugHulls(machine, color = 0x30ff9e) {
    const set = this.sets.get(machine) || this.build(machine);
    if (!set) return null;
    this._refresh(set);
    const g = new THREE.Group();
    g.name = 'hit-hulls-debug';
    const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, toneMapped: false });
    for (const h of set.hulls) {
      if (h.off) continue;
      const len = Math.hypot(h.wbx - h.wax, h.wby - h.way, h.wbz - h.waz);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(h.wr, len, 3, 8), mat);
      mesh.position.set((h.wax + h.wbx) / 2, (h.way + h.wby) / 2, (h.waz + h.wbz) / 2);
      if (len > 1e-4) {
        _a.set(h.wbx - h.wax, h.wby - h.way, h.wbz - h.waz).normalize();
        mesh.quaternion.setFromUnitVectors(_up, _a);
      }
      mesh.raycast = () => {};
      g.add(mesh);
    }
    this.ctx.scene.add(g);
    return g;
  }

  /**
   * The OLD path: a full triangle raycast against the machine subtree.
   * Kept only so gates can measure the speed-up and check that the hull set
   * agrees with the mesh. Never call this from gameplay code.
   */
  referenceRaycast(machine, ray, far = 1e6) {
    if (!this._rc) {
      this._rc = new THREE.Raycaster();
      this._rc.camera = this.ctx.camera;
    }
    const rc = this._rc;
    rc.camera = this.ctx.camera;
    rc.set(ray.origin, ray.direction);
    rc.near = 0;
    rc.far = far;
    const hits = rc.intersectObject(machine.root, true);
    return hits.length ? hits[0] : null;
  }

  dispose(machine) { this.sets.delete(machine); }

  update() {
    this.frame++;
    this.stats.frameRefreshes = 0;
    // amortised warm-up: one machine per frame, so the first shot at a fresh
    // species never pays a 10-25 ms extraction inside a combat frame
    const roster = this.ctx.machines && this.ctx.machines.list;
    if (roster) {
      for (let i = 0; i < roster.length; i++) {
        if (this.sets.has(roster[i])) continue;
        this.build(roster[i]);
        break;
      }
    }
    if ((this.frame & 255) === 0 && this.ctx.machines) {
      const live = new Set(this.ctx.machines.list);
      for (const m of this.sets.keys()) if (!live.has(m)) this.sets.delete(m);
    }
  }

  audit() {
    let hulls = 0;
    for (const s of this.sets.values()) hulls += s.hulls.length;
    return { sets: this.sets.size, hulls, ...this.stats };
  }
}
