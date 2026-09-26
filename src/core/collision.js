/**
 * Static collision world + spatial hash + occlusion queries.  (Round 4, lane `spatial`.)
 *
 * Findings closed here: perf-tech-13 (no collision world), camera-feel-09
 * (player has no collision), camera-feel-03 (camera has no world collision),
 * machine-ai-04 (LOS ignores props) and the broadphase half of machine-ai-01.
 *
 * CONTRACT (see docs/ROUND4-SPATIAL.md for the integration note):
 *   ctx.collision.register({ kind, object | shape, blocking, occluder, dynamic })
 *   ctx.collision.resolveCapsule(pos, radius, height, opts)   -> depenetration
 *   ctx.collision.moveCapsule(pos, prev, vel, r, h, dt, opts) -> swept char move
 *   ctx.collision.capsuleCast(from, to, radius, height, opts) -> swept blocker
 *   ctx.collision.segmentCast(a, b, opts)                     -> nearest surface
 *   ctx.collision.sphereQuery(x, y, z, r, out)                -> colliders
 *   ctx.collision.occluded(a, b)                              -> machine LOS
 *   ctx.collision.cameraBoom(pivot, desired, out, radius)     -> whisker boom
 *   ctx.collision.count(kind?)                                -> registry size
 *
 * Representation: every collider is a capsule, sphere, yaw-box or a
 * three-mesh-bvh `MeshBVH` over a static mesh.  Colliders are bucketed into a
 * uniform 8 m XZ grid; every query walks only the cells it touches.  Nothing
 * in the hot paths allocates.
 *
 * Y policy: the terrain heightfield already owns vertical motion, so
 * `resolveCapsule` pushes in XZ by default (`axis:'xz'`) and mesh triangles
 * whose world normal is within ~44 deg of vertical (floors, tent roofs,
 * ground decals) are ignored.  Pass `axis:'xyz'` for a full 3D push.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Nav } from './nav.js';
import { HitHulls } from './hitHulls.js';

/**
 * Re-exported for gates and page-context probes only. `page.evaluate` code is
 * not transformed by vite, so a bare `import('three')` cannot resolve there;
 * gate A23 needs a real `Raycaster` to measure the skinned-mesh baseline it
 * is replacing, independently of whatever `combat` currently does. Runtime
 * code should keep importing `three` directly.
 */
export { THREE };

const CELL = 8;                 // uniform grid cell, meters
const GRID_OFF = 512;

/* ---------------------------- contact response ---------------------------
 * `moveCapsule` has to be DETERMINISTIC (gate A24, and the feel it stands
 * for).  The first cut bled the tangential velocity with
 * `exp(-mu * headOn^2 * dt)` and recomputed `headOn` from the LIVE contact
 * normal every substep, so as the normal rotated around a trunk the brake
 * released itself: whether Aloy stopped dead or glanced off and re-accelerated
 * to sprint came down to sub-frame contact geometry, i.e. to frame timing.
 * Measured 4 failures in 10 runs.
 *
 * The model now has no history-dependent term:
 *   1. strip the into-surface component of the velocity (unchanged);
 *   2. `headOn` = how squarely the INPUT presses into the surface, peak-held
 *      for CONTACT_LATCH seconds so one rotated normal cannot un-brake a
 *      head-on approach mid-slide;
 *   3. cap the remaining speed at `wantSpeed * sqrt(1 - headOn^2) * WALL_DRAG`
 *      — only the along-wall part of the input can carry speed.  Head-on the
 *      cap is 0 (she stops and stays stopped while W is held); at 45 deg it is
 *      0.65 of what she asked for (she slides, which is correct);
 *   4. approach that cap at a bounded deceleration, so the stop is a couple of
 *      frames rather than a snap, and is identical at 20 fps and 144 fps.
 */
const CONTACT_DECEL = 140;      // m/s^2 bleed toward the along-wall cap
const CONTACT_LATCH = 0.15;     // s peak-hold on `headOn`
const WALL_DRAG = 0.92;         // scrape cost applied to the along-wall cap
const MAX_SUBSTEPS = 8;         // swept substeps per moveCapsule call
const gkey = (ix, iz) => (((ix + GRID_OFF) << 10) | (iz + GRID_OFF));
const cellOf = (v) => Math.floor(v / CELL);

// ---- module scratch (never allocate inside a query) ----
const _v = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _tn = new THREE.Vector3();
const _pivotS = new THREE.Vector3();
const _sideS = new THREE.Vector3();
const _dirS = new THREE.Vector3();
const _boomS = new THREE.Vector3();
/**
 * The smallest melee approach pad that still leaves a machine immovable (A25).
 *
 * FIX PASS 1 (round 4): 0.20 -> 0.32, because 0.20 was the EQUALITY and not a
 * floor. `machines/index.js` pushes a machine whenever the player's POSITION
 * is within `bodyRadius + 0.6` of a standoff sphere, while this collider holds
 * her POSITION at `bodyRadius + pad + 0.4` from the standoff SEGMENT: the push
 * therefore fires iff `pad < 0.20`, and at `pad === 0.20` the two are the same
 * number. That is a STATIC equilibrium, not a bound. The manager runs against
 * her position AFTER she has moved, and a walking player penetrates by up to a
 * frame of travel before the swept solve pushes her back out — so on a loaded
 * box every forward frame fired a push and they integrated. Measured by the
 * round-4 film judge: spear drawn, 4 s of KeyW into a frozen Watcher parked
 * 5 m ahead moved the MACHINE 2.38 m (0.057 m on the worst single frame),
 * against 0.000 m with the spear holstered. `machinePad`'s own comment says
 * what the margin is for — "clears the manager's bodyRadius + 0.6 standoff by
 * a frame of sprint travel" — and 0.12 m is that frame (5.5 m/s at 45 fps,
 * the box's loaded frame time). The 0.12 m of reach it costs is handed
 * straight back through `MELEE_L_CUT`, which is the SAME distance on the same
 * axis, so nothing about how close she gets to the machine changes.
 *
 * Gated by `A106-melee-approach-immovable` (spear drawn, machine frozen, 3 s
 * of KeyW: machine displacement 0.000 m while the term is live).
 */
const MELEE_PAD_FLOOR = 0.32;
/**
 * How much of the melee target's standoff SEGMENT the approach term removes,
 * in metres. See `Collision._meleeStandoff`: it is the end cap of a capsule
 * built from a machine's animated bounding box, which on every quadruped in
 * this roster is about a metre of empty air in front of the sculpt. Absolute
 * rather than proportional so a Thunderjaw loses the same centimetre of cap a
 * Watcher does instead of a third of its body.
 *
 * FIX PASS 1 (round 4), TWICE OVER: 0.66 -> 1.02. 0.12 m of it pays back the
 * pad (below); the other 0.24 m is the rest of the end cap, and it is what
 * makes the blade land on a beat whose tip is not aimed dead down the centre
 * line. Measured with the pad at 0.32 and the cut at 0.78: light-1's contact
 * tip (char 0.15, 1.05, 1.86) read +0.23 m short of the nearest hull surface
 * while light-2's (-0.43, 1.13, 1.72) read -0.02 m INSIDE it — a Watcher's idle
 * hull is not symmetric about her aim, so a reach budget that only works for a
 * thrust down the midline is not a reach budget. On a Watcher the cut now lands
 * on `MELEE_L_FLOOR` (0.5465 m of 1.5615), she stands 2.17 m from the centre
 * instead of 2.40, and `playerToShell` — the exact bound A103 gates — is still
 * 0.87 m of daylight.
 *
 * Earlier note (0.66 -> 0.78): `MELEE_PAD_FLOOR` went up by 0.12 m to
 * restore the anti-shove margin A25 depends on, and her standing distance from
 * a machine centre head-on is `standoffHalfLen' + bodyRadius + pad + 0.4` —
 * the pad and the segment cut are the same axis, so moving 0.12 m from one to
 * the other leaves the distance, and therefore the blade's reach, exactly
 * where it was. Proven rather than argued: A103 publishes `playerToMachine`
 * (2.402 m on a Watcher before and after) and `tipToHullAtHit`.
 */
const MELEE_L_CUT = 1.02;
/**
 * ...and the floor under it: the melee standoff segment never drops below this
 * fraction of the machine's own. The cut is an absolute number tuned on the
 * quadruped that needed it, and on a small machine whose whole standoff is
 * shorter than the cut it would collapse the capsule to a sphere about the
 * centre and let her stand beside a flank. A third of the segment always
 * survives.
 */
const MELEE_L_FLOOR = 0.35;

/* scratch pair for the per-frame machine sync — never escapes _syncMachines */
const _pair = [null, null];
const _bDir = new THREE.Vector3();   // cameraBoom-private basis: _stepCamera
const _bU = new THREE.Vector3();     // passes _pivotS in as the pivot, so the
const _bV = new THREE.Vector3();     // boom must never touch that scratch
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _box = new THREE.Box3();
const _ray = new THREE.Ray();
const _t0 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _identity = new THREE.Matrix4();
const _sweep = new THREE.Vector3();   // capsuleCast probe; _v is taken
const _CAMOPT = { mode: 'camera' };

const _res = {
  hit: false, depth: 0, nx: 0, ny: 0, nz: 0, collider: null,
  x: 0, y: 0, z: 0,
};
const _cast = {
  hit: false, t: 0, distance: 0, x: 0, y: 0, z: 0,
  nx: 0, ny: 0, nz: 0, collider: null,
};
const _move = {
  hit: false, contacts: 0, substeps: 1, speed: 0, travelled: 0,
  headOn: 0, nx: 0, ny: 0, nz: 0, collider: null,
};
const _hookOpts = { wish: null, state: null };  // attachPlayer shim; no per-frame alloc

let _nextId = 1;

/** Squared distance from point p to segment ab, plus the closest point. */
function closestOnSegment(px, py, pz, ax, ay, az, bx, by, bz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  out.x = ax + abx * t; out.y = ay + aby * t; out.z = az + abz * t;
  out.t = t;
  return out;
}
const _seg = { x: 0, y: 0, z: 0, t: 0 };
const _seg2 = { x: 0, y: 0, z: 0, t: 0 };

/** Ray/segment vs sphere. Returns entry t in [0,far] or -1. */
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, far) {
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

/**
 * Ray vs capsule (segment ab, radius r). Returns entry t or -1.
 * Cylinder body first, then the two end caps.
 */
function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r, far) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const ocx = ox - ax, ocy = oy - ay, ocz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  if (baba < 1e-12) return raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r, far);
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
      if (y > 0 && y < baba) return t;
    }
  }
  // caps
  const ta = raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r, far);
  const tb = raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r, far);
  if (ta < 0) return tb;
  if (tb < 0) return ta;
  return ta < tb ? ta : tb;
}

/** Ray vs axis-aligned-in-yaw box; cheap slab test in the box's local frame. */
function rayBox(ox, oy, oz, dx, dy, dz, col, far) {
  const c = Math.cos(-col.yaw), s = Math.sin(-col.yaw);
  const rx = ox - col.cx, rz = oz - col.cz;
  const lx = rx * c - rz * s, lz = rx * s + rz * c;
  const ly = oy - col.cy;
  const ldx = dx * c - dz * s, ldz = dx * s + dz * c, ldy = dy;
  let tmin = 0, tmax = far;
  const h = [col.hx, col.hy, col.hz];
  const o = [lx, ly, lz], d = [ldx, ldy, ldz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (Math.abs(o[i]) > h[i]) return -1; continue; }
    const inv = 1 / d[i];
    let t1 = (-h[i] - o[i]) * inv, t2 = (h[i] - o[i]) * inv;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

export class Collision {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.colliders = [];          // dense array, holes marked dead
    this.byId = new Map();
    this.grid = new Map();        // cellKey -> array of colliders
    this.dynamic = [];            // machines etc. — linear scan, not gridded

    this.playerHook = null;
    this.cameraHook = null;
    this.machineHook = opts.machineColliders !== false;
    this.machinePad = opts.machinePad ?? 0.55; // see docs/ROUND4-SPATIAL.md

    this._stamp = 0;
    this._out = [];
    this.stats = { queries: 0, resolves: 0, casts: 0, occl: 0 };
    // shared brake latch for the single-character case; a caller with more
    // than one capsule passes its own `{ latch: 0, latchT: 0 }` via opts.state
    this._moveState = { latch: 0, latchT: 0, lastX: NaN, lastZ: NaN };
    this._sharedBVH = new Map(); // geometry.uuid -> MeshBVH (instanced reuse)
  }

  /* ------------------------------ registry ------------------------------ */

  /**
   * Register a static (or dynamic) collider.
   *   { kind, object, shape, blocking, occluder, dynamic, ref }
   * `object` may be a Mesh (triangle BVH) or an InstancedMesh (one collider
   * per instance sharing the BVH). `shape` is an explicit primitive:
   *   { type:'capsule', a:[x,y,z], b:[x,y,z], radius }
   *   { type:'sphere',  c:[x,y,z], radius }
   *   { type:'box',     c:[x,y,z], half:[hx,hy,hz], yaw }
   * Returns the collider id, or an array of ids for an InstancedMesh.
   */
  register(desc = {}) {
    if (desc.object && desc.object.isInstancedMesh) return this._registerInstanced(desc);
    const col = this._make(desc);
    if (!col) return -1;
    this._add(col);
    return col.id;
  }

  /** Shared collider header — no geometry resolved yet. */
  _base(desc) {
    const kind = desc.kind || 'prop';
    return {
      id: _nextId++, kind,
      blocking: desc.blocking !== false,
      occluder: desc.occluder !== false,
      // what the camera boom must not sit inside — defaults to whatever
      // blocks the player, plus tree canopies, which block neither
      camera: desc.camera !== undefined ? !!desc.camera : desc.blocking !== false,
      dynamic: !!desc.dynamic,
      ref: desc.ref ?? desc.object ?? null,
      dead: false, cells: null, _s: -1,
      minx: 0, miny: 0, minz: 0, maxx: 0, maxy: 0, maxz: 0,
    };
  }

  _make(desc) {
    const base = this._base(desc);
    const s = desc.shape;
    if (s && s.type === 'capsule') {
      base.type = 'capsule';
      base.ax = s.a[0]; base.ay = s.a[1]; base.az = s.a[2];
      base.bx = s.b[0]; base.by = s.b[1]; base.bz = s.b[2];
      base.r = s.radius;
      base.vertical = Math.abs(base.ax - base.bx) < 1e-3 && Math.abs(base.az - base.bz) < 1e-3;
    } else if (s && s.type === 'sphere') {
      base.type = 'sphere';
      base.cx = s.c[0]; base.cy = s.c[1]; base.cz = s.c[2];
      base.r = s.radius;
    } else if (s && s.type === 'box') {
      base.type = 'box';
      base.cx = s.c[0]; base.cy = s.c[1]; base.cz = s.c[2];
      base.hx = s.half[0]; base.hy = s.half[1]; base.hz = s.half[2];
      base.yaw = s.yaw ?? 0;
      base.r = Math.hypot(base.hx, base.hy, base.hz);
    } else if (desc.object && desc.object.isMesh) {
      const o = desc.object;
      const geo = o.geometry;
      if (!geo || !geo.attributes.position) return null;
      base.type = 'mesh';
      base.bvh = this._bvhFor(geo);
      base.node = o;
      base.mat = new THREE.Matrix4().copy(desc.matrix || o.matrixWorld);
      base.inv = new THREE.Matrix4().copy(base.mat).invert();
      base.nmat = new THREE.Matrix3().getNormalMatrix(base.mat);
      base.scale = Math.max(
        Math.hypot(base.mat.elements[0], base.mat.elements[1], base.mat.elements[2]),
        Math.hypot(base.mat.elements[4], base.mat.elements[5], base.mat.elements[6]),
        Math.hypot(base.mat.elements[8], base.mat.elements[9], base.mat.elements[10]),
      ) || 1;
    } else {
      return null;
    }
    this._bounds(base);
    return base;
  }

  _bvhFor(geo) {
    let bvh = this._sharedBVH.get(geo.uuid);
    if (!bvh) {
      bvh = new MeshBVH(geo, { maxLeafTris: 12 });
      this._sharedBVH.set(geo.uuid, bvh);
    }
    return bvh;
  }

  _registerInstanced(desc) {
    const im = desc.object;
    im.updateWorldMatrix(true, false);
    const geo = im.geometry;
    const bvh = this._bvhFor(geo);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const ids = [];
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, _mat);
      _mat.premultiply(im.matrixWorld);
      const col = this._base(desc);
      col.type = 'mesh';
      col.bvh = bvh;
      col.node = im;
      col.instanceId = i;
      col.mat = new THREE.Matrix4().copy(_mat);
      col.inv = new THREE.Matrix4().copy(_mat).invert();
      col.nmat = new THREE.Matrix3().getNormalMatrix(col.mat);
      _mat.decompose(_pos, _quat, _scl);
      col.scale = Math.max(_scl.x, _scl.y, _scl.z) || 1;
      this._bounds(col);
      this._add(col);
      ids.push(col.id);
    }
    return ids;
  }

  _bounds(col) {
    if (col.type === 'capsule') {
      col.minx = Math.min(col.ax, col.bx) - col.r; col.maxx = Math.max(col.ax, col.bx) + col.r;
      col.miny = Math.min(col.ay, col.by) - col.r; col.maxy = Math.max(col.ay, col.by) + col.r;
      col.minz = Math.min(col.az, col.bz) - col.r; col.maxz = Math.max(col.az, col.bz) + col.r;
    } else if (col.type === 'sphere') {
      col.minx = col.cx - col.r; col.maxx = col.cx + col.r;
      col.miny = col.cy - col.r; col.maxy = col.cy + col.r;
      col.minz = col.cz - col.r; col.maxz = col.cz + col.r;
    } else if (col.type === 'box') {
      const R = Math.hypot(col.hx, col.hz);
      col.minx = col.cx - R; col.maxx = col.cx + R;
      col.miny = col.cy - col.hy; col.maxy = col.cy + col.hy;
      col.minz = col.cz - R; col.maxz = col.cz + R;
    } else {
      const geo = col.node.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      _box.copy(geo.boundingBox).applyMatrix4(col.mat);
      col.minx = _box.min.x; col.miny = _box.min.y; col.minz = _box.min.z;
      col.maxx = _box.max.x; col.maxy = _box.max.y; col.maxz = _box.max.z;
    }
  }

  _add(col) {
    this.colliders.push(col);
    this.byId.set(col.id, col);
    if (col.dynamic) { this.dynamic.push(col); return; }
    const cells = [];
    const span = Math.max(col.maxx - col.minx, col.maxz - col.minz);
    if (col.type === 'mesh' && span > 16) {
      // world-spanning merged meshes (props, camp): index the cells their
      // triangles ACTUALLY touch, or every query in the valley would have to
      // shapecast them
      for (const k of this._meshCells(col)) cells.push(k);
    } else {
      const x0 = cellOf(col.minx), x1 = cellOf(col.maxx);
      const z0 = cellOf(col.minz), z1 = cellOf(col.maxz);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) cells.push(gkey(ix, iz));
      }
    }
    for (const k of cells) {
      let bucket = this.grid.get(k);
      if (!bucket) { bucket = []; this.grid.set(k, bucket); }
      bucket.push(col);
    }
    col.cells = cells;
    /* FIX ROUND 2 — registration alone updates the navgrid. §5 tells
     * world-props to "register everything you place", and before this the nav
     * grid latched `ready` after one pass, so anything registered afterwards
     * (every Wave 2 megastructure) was invisible to machine pathing forever.
     * Nav decides for itself whether the collider is stampable and whether it
     * can do it inline or must queue a rebuild. */
    const nav = this.ctx.nav;
    if (nav && nav.onColliderAdded) nav.onColliderAdded(col);
  }

  /** 8 m grid cells a merged mesh's triangles actually occupy. */
  _meshCells(col) {
    const set = new Set();
    this.forEachTriangle(col, (ax, ay, az, bx, by, bz, cx2, cy2, cz2) => {
      const x0 = cellOf(Math.min(ax, bx, cx2)), x1 = cellOf(Math.max(ax, bx, cx2));
      const z0 = cellOf(Math.min(az, bz, cz2)), z1 = cellOf(Math.max(az, bz, cz2));
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) set.add(gkey(ix, iz));
      }
    });
    return set;
  }

  /** Walk a mesh collider's world-space triangles. Used by seeding and nav. */
  forEachTriangle(col, fn, from = 0, limit = Infinity) {
    const geo = col.node.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    const identity = col.mat.equals(_identity);
    let done = 0;
    let i = from;
    for (; i < n && done < limit; i += 3, done++) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      _t0.fromBufferAttribute(pos, i0);
      _t1.fromBufferAttribute(pos, i1);
      _t2.fromBufferAttribute(pos, i2);
      if (!identity) {
        _t0.applyMatrix4(col.mat); _t1.applyMatrix4(col.mat); _t2.applyMatrix4(col.mat);
      }
      fn(_t0.x, _t0.y, _t0.z, _t1.x, _t1.y, _t1.z, _t2.x, _t2.y, _t2.z);
    }
    return i >= n ? -1 : i; // -1 when finished, else the resume cursor
  }

  unregister(id) {
    const ids = Array.isArray(id) ? id : [id];
    const nav = this.ctx.nav;
    for (const i of ids) {
      const col = this.byId.get(i);
      if (!col) continue;
      // removing a blocker cannot be undone by stamping (cells are shared
      // between colliders), so nav queues a recost + restamp — coalesced, so
      // unregistering 400 instances costs one rebuild, not 400
      if (nav && nav.markDirty && col.blocking && !col.dynamic) nav.markDirty();
      col.dead = true;
      this.byId.delete(i);
      if (col.cells) {
        for (const k of col.cells) {
          const b = this.grid.get(k);
          if (!b) continue;
          const j = b.indexOf(col);
          if (j >= 0) b.splice(j, 1);
        }
      }
      let j = this.colliders.indexOf(col);
      if (j >= 0) this.colliders.splice(j, 1);
      j = this.dynamic.indexOf(col);
      if (j >= 0) this.dynamic.splice(j, 1);
    }
  }

  /** Registered collider count, optionally filtered by `kind`. */
  count(kind) {
    if (!kind) return this.colliders.length;
    let n = 0;
    for (const c of this.colliders) if (c.kind === kind) n++;
    return n;
  }

  /** Per-kind census (debug / gate detail). */
  census() {
    const out = {};
    for (const c of this.colliders) out[c.kind] = (out[c.kind] ?? 0) + 1;
    return out;
  }

  /* ------------------------------ broadphase ---------------------------- */

  /** Colliders whose AABB overlaps the sphere. Fills and returns `out`. */
  sphereQuery(x, y, z, r, out = this._out, filter = null) {
    out.length = 0;
    this.stats.queries++;
    const s = ++this._stamp;
    const x0 = cellOf(x - r), x1 = cellOf(x + r);
    const z0 = cellOf(z - r), z1 = cellOf(z + r);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const b = this.grid.get(gkey(ix, iz));
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const c = b[i];
          if (c._s === s || c.dead) continue;
          c._s = s;
          if (x + r < c.minx || x - r > c.maxx) continue;
          if (y + r < c.miny || y - r > c.maxy) continue;
          if (z + r < c.minz || z - r > c.maxz) continue;
          if (filter && !filter(c)) continue;
          out.push(c);
        }
      }
    }
    for (let i = 0; i < this.dynamic.length; i++) {
      const c = this.dynamic[i];
      if (c.dead) continue;
      if (x + r < c.minx || x - r > c.maxx) continue;
      if (y + r < c.miny || y - r > c.maxy) continue;
      if (z + r < c.minz || z - r > c.maxz) continue;
      if (filter && !filter(c)) continue;
      out.push(c);
    }
    return out;
  }

  /* ------------------------------ resolution ---------------------------- */

  /**
   * Push a vertical capsule (feet at `pos`, given radius/height) out of every
   * blocking collider. Mutates `pos`. Returns the shared result record
   * { hit, depth, nx, ny, nz, collider } — copy anything you keep.
   */
  resolveCapsule(pos, radius = 0.4, height = 1.8, opts = null) {
    const axis = (opts && opts.axis) || 'xz';
    const passes = (opts && opts.passes) || 3;
    _res.hit = false; _res.depth = 0; _res.nx = 0; _res.ny = 0; _res.nz = 0;
    _res.collider = null;
    this.stats.resolves++;

    const half = Math.max(radius, height * 0.5);
    for (let pass = 0; pass < passes; pass++) {
      const list = this.sphereQuery(pos.x, pos.y + height * 0.5, pos.z,
        radius + half, this._out, null);
      let moved = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.blocking) continue;
        if (opts && opts.filter && !opts.filter(c)) continue;
        const d = this._pushOut(c, pos, radius, height, axis);
        if (d > 0) {
          moved += d;
          if (d > _res.depth) {
            _res.depth = d; _res.collider = c;
            _res.nx = this._lastNx; _res.ny = this._lastNy; _res.nz = this._lastNz;
          }
          _res.hit = true;
        }
      }
      if (moved < 1e-4) break;
    }
    return _res;
  }

  /** Depenetrate `pos` from a single collider; returns the push depth. */
  _pushOut(c, pos, radius, height, axis) {
    const ay = pos.y + radius, by = pos.y + Math.max(height - radius, radius);
    let nx = 0, ny = 0, nz = 0, depth = 0;

    if (c.type === 'capsule') {
      if (c.vertical) {
        // fast path: two vertical capsules — pure XZ circle test with a
        // Y-overlap gate so short stumps do not block a jump-height capsule
        if (by < c.ay || ay > c.by) return 0;
        const dx = pos.x - c.ax, dz = pos.z - c.az;
        const d = Math.hypot(dx, dz);
        const rr = radius + c.r;
        if (d >= rr) return 0;
        if (d < 1e-4) { nx = 1; nz = 0; } else { nx = dx / d; nz = dz / d; }
        depth = rr - d;
      } else {
        // general: closest points between the two segments (iterated once —
        // good enough for a kinematic push, and allocation free)
        closestOnSegment(pos.x, (ay + by) * 0.5, pos.z, c.ax, c.ay, c.az, c.bx, c.by, c.bz, _seg);
        closestOnSegment(_seg.x, _seg.y, _seg.z, pos.x, ay, pos.z, pos.x, by, pos.z, _seg2);
        closestOnSegment(_seg2.x, _seg2.y, _seg2.z, c.ax, c.ay, c.az, c.bx, c.by, c.bz, _seg);
        const dx = _seg2.x - _seg.x, dy = _seg2.y - _seg.y, dz = _seg2.z - _seg.z;
        const d = Math.hypot(dx, dy, dz);
        const rr = radius + c.r;
        if (d >= rr) return 0;
        if (d < 1e-4) { nx = 1; ny = 0; nz = 0; } else { nx = dx / d; ny = dy / d; nz = dz / d; }
        depth = rr - d;
      }
    } else if (c.type === 'sphere') {
      closestOnSegment(c.cx, c.cy, c.cz, pos.x, ay, pos.z, pos.x, by, pos.z, _seg);
      const dx = _seg.x - c.cx, dy = _seg.y - c.cy, dz = _seg.z - c.cz;
      const d = Math.hypot(dx, dy, dz);
      const rr = radius + c.r;
      if (d >= rr) return 0;
      if (d < 1e-4) { nx = 1; ny = 0; nz = 0; } else { nx = dx / d; ny = dy / d; nz = dz / d; }
      depth = rr - d;
    } else if (c.type === 'box') {
      if (by < c.miny || ay > c.maxy) return 0;
      const cs = Math.cos(-c.yaw), sn = Math.sin(-c.yaw);
      const rx = pos.x - c.cx, rz = pos.z - c.cz;
      let lx = rx * cs - rz * sn, lz = rx * sn + rz * cs;
      const qx = Math.max(-c.hx, Math.min(c.hx, lx));
      const qz = Math.max(-c.hz, Math.min(c.hz, lz));
      let dx = lx - qx, dz = lz - qz;
      let d = Math.hypot(dx, dz);
      if (d >= radius) return 0;
      if (d < 1e-4) {
        // deep inside: eject along the shallowest local axis
        const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
        if (px < pz) { dx = Math.sign(lx) || 1; dz = 0; d = 0; depth = radius + px; }
        else { dx = 0; dz = Math.sign(lz) || 1; d = 0; depth = radius + pz; }
      } else {
        dx /= d; dz /= d; depth = radius - d;
      }
      const cw = Math.cos(c.yaw), sw = Math.sin(c.yaw);
      nx = dx * cw - dz * sw; nz = dx * sw + dz * cw;
      ny = 0;
    } else {
      depth = this._meshPush(c, pos, radius, ay, by, axis);
      nx = this._lastNx; ny = this._lastNy; nz = this._lastNz;
    }

    if (depth <= 1e-5) return 0;
    if (axis === 'xz') {
      ny = 0;
      const h = Math.hypot(nx, nz);
      if (h < 1e-5) return 0;
      nx /= h; nz /= h;
    } else {
      const h = Math.hypot(nx, ny, nz) || 1;
      nx /= h; ny /= h; nz /= h;
    }
    pos.x += nx * depth;
    pos.z += nz * depth;
    if (axis !== 'xz') pos.y += ny * depth;
    this._lastNx = nx; this._lastNy = ny; this._lastNz = nz;
    return depth;
  }

  /**
   * Sphere-sample a capsule against a triangle BVH. Three samples along the
   * segment is plenty for a 1.8 m character and keeps the cost flat.
   */
  _meshPush(c, pos, radius, ay, by, axis) {
    const lr = radius / c.scale;
    let best = 0;
    this._lastNx = 0; this._lastNy = 0; this._lastNz = 0;
    for (let s = 0; s < 3; s++) {
      const y = ay + (by - ay) * (s * 0.5);
      _lp.set(pos.x, y, pos.z).applyMatrix4(c.inv);
      let bestD2 = lr * lr;
      let found = false;
      c.bvh.shapecast({
        intersectsBounds: (box) => box.distanceToPoint(_lp) <= lr,
        intersectsTriangle: (tri) => {
          tri.closestPointToPoint(_lp, _cp);
          const d2 = _cp.distanceToSquared(_lp);
          if (d2 >= bestD2) return false;
          if (axis === 'xz') {
            tri.getNormal(_tn);
            _tn.applyMatrix3(c.nmat).normalize();
            if (Math.abs(_tn.y) > 0.72) return false; // floor / roof / decal
          }
          bestD2 = d2; _bp.copy(_cp); found = true;
          return false;
        },
      });
      if (!found) continue;
      _bp.applyMatrix4(c.mat);
      _v.set(pos.x - _bp.x, y - _bp.y, pos.z - _bp.z);
      const d = _v.length();
      const depth = radius - d;
      if (depth > best) {
        best = depth;
        if (d > 1e-4) { _v.multiplyScalar(1 / d); } else { _v.set(1, 0, 0); }
        this._lastNx = _v.x; this._lastNy = _v.y; this._lastNz = _v.z;
      }
    }
    return best;
  }

  /* -------------------------------- casts ------------------------------- */

  /**
   * Nearest blocking surface along the segment a->b.
   * Returns the shared record { hit, t, distance, x,y,z, nx,ny,nz, collider }.
   */
  segmentCast(a, b, opts = null) {
    _v.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const far = _v.length();
    if (far < 1e-6) { _cast.hit = false; return _cast; }
    _v.multiplyScalar(1 / far);
    return this.raycast(a.x, a.y, a.z, _v.x, _v.y, _v.z, far, opts);
  }

  /** Nearest blocking surface along a ray. Direction must be normalized. */
  raycast(ox, oy, oz, dx, dy, dz, far, opts = null) {
    _cast.hit = false; _cast.t = far; _cast.collider = null;
    this.stats.casts++;
    const inflate = (opts && opts.radius) || 0;
    const filter = opts && opts.filter;
    const mode = (opts && opts.mode) || 'blocking';
    const midx = ox + dx * far * 0.5, midy = oy + dy * far * 0.5, midz = oz + dz * far * 0.5;
    const list = this.sphereQuery(midx, midy, midz, far * 0.5 + inflate + 0.5, this._out, filter);
    let bestT = far;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (mode === 'camera') { if (!c.camera) continue; }
      else if (mode === 'occluder') { if (!c.occluder) continue; }
      else if (!c.blocking) continue;
      let t = -1;
      if (c.type === 'capsule') {
        t = rayCapsule(ox, oy, oz, dx, dy, dz, c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r + inflate, bestT);
      } else if (c.type === 'sphere') {
        t = raySphere(ox, oy, oz, dx, dy, dz, c.cx, c.cy, c.cz, c.r + inflate, bestT);
      } else if (c.type === 'box') {
        t = rayBox(ox, oy, oz, dx, dy, dz, c, bestT);
      } else {
        _ray.origin.set(ox, oy, oz);
        _ray.direction.set(dx, dy, dz);
        _ray.applyMatrix4(c.inv);
        const lf = bestT / c.scale;
        const hit = c.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, lf);
        if (hit) t = hit.distance * c.scale;
      }
      if (t >= 0 && t < bestT) {
        bestT = t;
        _cast.hit = true; _cast.t = t; _cast.distance = t; _cast.collider = c;
        _cast.x = ox + dx * t; _cast.y = oy + dy * t; _cast.z = oz + dz * t;
        this._surfaceNormal(c, _cast);
      }
    }
    return _cast;
  }

  _surfaceNormal(c, out) {
    if (c.type === 'sphere') {
      _v.set(out.x - c.cx, out.y - c.cy, out.z - c.cz).normalize();
    } else if (c.type === 'capsule') {
      closestOnSegment(out.x, out.y, out.z, c.ax, c.ay, c.az, c.bx, c.by, c.bz, _seg);
      _v.set(out.x - _seg.x, out.y - _seg.y, out.z - _seg.z).normalize();
    } else if (c.type === 'box') {
      _v.set(out.x - c.cx, 0, out.z - c.cz).normalize();
    } else {
      _v.set(out.x - (c.minx + c.maxx) * 0.5, 0, out.z - (c.minz + c.maxz) * 0.5).normalize();
    }
    out.nx = _v.x; out.ny = _v.y; out.nz = _v.z;
  }

  /**
   * Swept capsule. Substeps at 3/4 radius and returns the first blocked
   * fraction (`t`), the safe stop position and the contact normal.
   */
  capsuleCast(from, to, radius = 0.4, height = 1.8, opts = null) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    _cast.hit = false; _cast.t = 1; _cast.collider = null;
    _cast.x = to.x; _cast.y = to.y; _cast.z = to.z;
    if (dist < 1e-6) return _cast;
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.75)));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      _sweep.set(from.x + dx * k, from.y + dy * k, from.z + dz * k);
      const beforeX = _sweep.x, beforeZ = _sweep.z;
      const r = this.resolveCapsule(_sweep, radius, height, opts);
      if (r.hit && Math.hypot(_sweep.x - beforeX, _sweep.z - beforeZ) > 1e-5) {
        const kk = (i - 1) / steps;
        _cast.hit = true; _cast.t = kk;
        _cast.x = from.x + dx * kk; _cast.y = from.y + dy * kk; _cast.z = from.z + dz * kk;
        _cast.nx = r.nx; _cast.ny = r.ny; _cast.nz = r.nz;
        _cast.collider = r.collider;
        _cast.distance = dist * kk;
        return _cast;
      }
    }
    return _cast;
  }

  /* --------------------------- character move --------------------------- */

  /**
   * The whole character-vs-world contact step in one call: swept substepping,
   * depenetration, and the deterministic contact brake.  This is what
   * `player-control` should call — NOT a bare `resolveCapsule`.
   *
   * A single depenetration pass per frame is not enough: `Player.update()`
   * applies a whole frame of motion in one shot, so at 20 fps a sprint is a
   * 0.41 m jump that can pass most of the way through a 0.41 m trunk before
   * anything ever sees it.  This rewinds to `prev`, re-walks the move in
   * `radius/2` substeps and resolves each one, so the controller behaves the
   * same at 20 fps as at 144.  (It used to live inside the `attachPlayer`
   * demo shim; the shim now calls this, so what the docs hand player-control
   * and what the gates measure are literally the same code path.)
   *
   * @param {THREE.Vector3} pos   feet position AFTER the caller integrated
   *                              this frame's motion.  Mutated in place.
   * @param {THREE.Vector3} prev  position at the end of the PREVIOUS call;
   *                              mutated to the resolved position on return.
   *                              Seed it with the spawn position (or leave it
   *                              non-finite and the first call seeds it).
   * @param {THREE.Vector3} velocity  caller's velocity; mutated on contact.
   * @param {number} radius   capsule radius (Aloy: 0.4)
   * @param {number} height   capsule height (Aloy: 1.8)
   * @param {number} dt       this frame's delta seconds
   * @param {object} [opts]   { wish, state, axis, filter, maxSteps }
   *   `wish`  unit XZ input direction (`player._wishDir()`).  Omit and the
   *           squareness of the press is inferred from the velocity, which is
   *           less stable once she is sliding.
   *   `state` caller-owned object carrying the brake latch across frames.
   *           Omit for the single-player case and the shared one is used.
   * @returns the SHARED record
   *   { hit, contacts, substeps, speed, travelled, headOn, nx, ny, nz, collider }
   *   `speed` is the distance she ACTUALLY covered / dt — the honest value for
   *   `player.moveSpeed`, which currently reports the velocity she wanted.
   */
  moveCapsule(pos, prev, velocity, radius = 0.4, height = 1.8, dt = 1 / 60, opts = null) {
    const st = (opts && opts.state) || this._moveState;
    const maxSteps = (opts && opts.maxSteps) || MAX_SUBSTEPS;
    const filterOpts = opts && (opts.axis || opts.filter) ? opts : null;

    _move.hit = false; _move.contacts = 0; _move.substeps = 1;
    _move.headOn = 0; _move.nx = 0; _move.ny = 0; _move.nz = 0;
    _move.collider = null;

    if (!prev || !Number.isFinite(prev.x)) {
      if (prev) { prev.x = pos.x; prev.y = pos.y; prev.z = pos.z; }
      st.lastX = pos.x; st.lastZ = pos.z;
      _move.speed = 0; _move.travelled = 0;
      return _move;
    }

    // peak-hold release on the brake latch
    st.latchT -= dt;
    if (st.latchT <= 0) { st.latch = 0; st.latchT = 0; }

    let wx = 0, wz = 0, haveWish = false;
    if (opts && opts.wish) {
      wx = opts.wish.x; wz = opts.wish.z;
      const wl = Math.hypot(wx, wz);
      if (wl > 1e-4) { wx /= wl; wz /= wl; haveWish = true; }
    }

    const startX = prev.x, startZ = prev.z;
    let remX = pos.x - startX, remZ = pos.z - startZ;
    const dist = Math.hypot(remX, remZ);
    const steps = dist > radius * 0.5
      ? Math.min(maxSteps, Math.ceil(dist / (radius * 0.5))) : 1;
    _move.substeps = steps;
    pos.x = startX; pos.z = startZ;      // always rewind; the loop re-applies

    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      const left = steps - i;
      const sx = remX / left, sz = remZ / left;
      pos.x += sx; pos.z += sz;
      remX -= sx; remZ -= sz;
      const r = this.resolveCapsule(pos, radius, height, filterOpts);
      if (!r.hit) continue;
      _move.hit = true; _move.contacts++;
      _move.nx = r.nx; _move.ny = r.ny; _move.nz = r.nz; _move.collider = r.collider;

      const vn = velocity.x * r.nx + velocity.z * r.nz;
      if (vn >= 0) continue;                    // already moving away
      const wantSpeed = Math.hypot(velocity.x, velocity.z);

      // 1. strip the into-surface component
      velocity.x -= r.nx * vn; velocity.z -= r.nz * vn;

      // 2. squareness of the PRESS, peak-held (see CONTACT_* above)
      let headOn = haveWish
        ? Math.max(0, -(wx * r.nx + wz * r.nz))
        : Math.min(1, -vn / Math.max(wantSpeed, 1e-6));
      if (headOn >= st.latch) { st.latch = headOn; st.latchT = CONTACT_LATCH; }
      else headOn = st.latch;
      if (headOn > _move.headOn) _move.headOn = headOn;

      // 3. only the along-wall part of the input can carry speed
      const cap = wantSpeed * Math.sqrt(Math.max(0, 1 - headOn * headOn)) * WALL_DRAG;

      // 4. approach it at a bounded deceleration (frame-rate independent)
      const sp = Math.hypot(velocity.x, velocity.z);
      if (sp > cap) {
        const target = Math.max(cap, sp - CONTACT_DECEL * sdt);
        const k = target / Math.max(sp, 1e-6);
        velocity.x *= k; velocity.z *= k;
      }

      // whatever is left of this frame follows the corrected velocity
      const rest = ((left - 1) / steps) * dt;
      remX = velocity.x * rest; remZ = velocity.z * rest;
    }

    const travelled = Math.hypot(pos.x - startX, pos.z - startZ);
    _move.travelled = travelled;
    _move.speed = dt > 1e-5 ? travelled / dt : 0;
    prev.x = pos.x; prev.y = pos.y; prev.z = pos.z;
    st.lastX = pos.x; st.lastZ = pos.z;
    return _move;
  }

  /* ------------------------------ occlusion ----------------------------- */

  /**
   * Machine line-of-sight: is the segment a->b broken by a registered
   * occluder (trunk capsules, rock/ruin spheres, camp/tower meshes)?
   * Terrain occlusion stays where it is — this is the prop layer only.
   */
  occluded(a, b, opts = null) {
    this.stats.occl++;
    _v.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const far = _v.length();
    if (far < 1e-4) return false;
    _v.multiplyScalar(1 / far);
    const skipMesh = opts && opts.mesh === false;
    const list = this.sphereQuery(
      (a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5, far * 0.5 + 0.5,
      this._out, null,
    );
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.occluder) continue;
      let t = -1;
      if (c.type === 'capsule') {
        t = rayCapsule(a.x, a.y, a.z, _v.x, _v.y, _v.z, c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r, far);
      } else if (c.type === 'sphere') {
        t = raySphere(a.x, a.y, a.z, _v.x, _v.y, _v.z, c.cx, c.cy, c.cz, c.r, far);
      } else if (c.type === 'box') {
        t = rayBox(a.x, a.y, a.z, _v.x, _v.y, _v.z, c, far);
      } else if (!skipMesh) {
        _ray.origin.copy(a);
        _ray.direction.copy(_v);
        _ray.applyMatrix4(c.inv);
        const hit = c.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, far / c.scale);
        if (hit) t = hit.distance * c.scale;
      }
      if (t >= 0 && t < far) return true;
    }
    return false;
  }

  /* ---------------------------- camera boom ----------------------------- */

  /**
   * Whisker boom sweep: shortens `desired` until the camera sphere is clear of
   * the world and above the terrain. 12 samples (centre ray + 8 whiskers +
   * 3 terrain marches). Writes and returns `out`.
   */
  cameraBoom(pivot, desired, out = _boomS, radius = 0.3) {
    out.copy(desired);
    _bDir.subVectors(desired, pivot);
    const dist = _bDir.length();
    if (dist < 1e-4) return out;
    _bDir.multiplyScalar(1 / dist);

    // basis perpendicular to the boom for the whisker ring
    _bU.set(-_bDir.z, 0, _bDir.x);
    if (_bU.lengthSq() < 1e-6) _bU.set(1, 0, 0);
    _bU.normalize();
    _bV.crossVectors(_bDir, _bU).normalize();

    let best = dist;
    const near = 0.12;
    for (let i = 0; i < 9; i++) {
      let ox = pivot.x, oy = pivot.y, oz = pivot.z;
      if (i > 0) {
        const a = ((i - 1) / 8) * Math.PI * 2;
        const ca = Math.cos(a) * radius, sa = Math.sin(a) * radius;
        ox += _bU.x * ca + _bV.x * sa;
        oy += _bU.y * ca + _bV.y * sa;
        oz += _bU.z * ca + _bV.z * sa;
      }
      const r = this.raycast(ox, oy, oz, _bDir.x, _bDir.y, _bDir.z, best, _CAMOPT);
      if (r.hit && r.t - near < best) best = Math.max(0.45, r.t - near);
    }

    // terrain: 3 marches along the shortened boom, then lift clear
    const terr = this.ctx.terrain;
    if (terr) {
      for (let i = 1; i <= 3; i++) {
        const k = (i / 3) * best;
        const x = pivot.x + _bDir.x * k, y = pivot.y + _bDir.y * k, z = pivot.z + _bDir.z * k;
        if (y < terr.getHeight(x, z) + radius + 0.15) {
          const shorter = Math.max(0.45, k - 0.4);
          if (shorter < best) best = shorter;
        }
      }
    }
    out.copy(pivot).addScaledVector(_bDir, best);
    if (terr) {
      const g = terr.getHeight(out.x, out.z) + radius + 0.15;
      if (out.y < g) out.y = g;
    }
    this.lastBoom = best;
    return out;
  }

  /* ------------------------------- seeding ------------------------------ */

  /**
   * Build the static world from what the other lanes already put in the
   * scene. Idempotent: world-props may re-register its own instances later
   * with `register()` and simply add to the registry.
   */
  seedWorld() {
    const ctx = this.ctx;
    const t0 = performance.now();
    const veg = ctx.vegetation && ctx.vegetation.group;
    if (veg) {
      for (const c of veg.children) {
        if (!c.isInstancedMesh) continue;
        if (/^pines-/.test(c.name)) this._seedTrees(c);
        else if (/^rocks-/.test(c.name)) this._seedRocks(c);
      }
    }
    for (const name of ['world-props', 'hunter-camp']) {
      const g = ctx.scene && ctx.scene.getObjectByName(name);
      if (!g) continue;
      const kind = name === 'hunter-camp' ? 'tent' : 'ruin';
      g.updateWorldMatrix(true, true);
      g.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh) return;
        if (Object.prototype.hasOwnProperty.call(o, 'raycast')) return; // FX shell
        const geo = o.geometry;
        if (!geo || !geo.attributes.position) return;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        _box.copy(bb).applyMatrix4(o.matrixWorld);
        // ground decals / coal glow / flat sheets: nothing to walk into
        if (_box.max.y - _box.min.y < 0.3) return;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        if (mat && mat.depthWrite === false) return;
        const nm = o.name || '';
        const k = /tower|timber/i.test(nm) ? 'tower'
          : /ruin|metal|concrete/i.test(nm) ? 'ruin' : kind;
        this.register({ kind: k, object: o, blocking: true, occluder: true });
      });
    }
    this.seedMs = +(performance.now() - t0).toFixed(1);
    return this.count();
  }

  _seedTrees(im) {
    im.updateWorldMatrix(true, false);
    const geo = im.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const baseR = this._trunkRadius(geo);
    const canopy = this._canopy(geo);
    const top = geo.boundingBox.max.y;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, _mat);
      _mat.premultiply(im.matrixWorld);
      _mat.decompose(_pos, _quat, _scl);
      const s = Math.max(_scl.x, _scl.z);
      // a 6 m capsule covers the player, the camera boom and machine eyes;
      // 0.24 m floor keeps thin birches from being ghosts
      const r = Math.max(0.24, baseR * s * 0.95);
      const y0 = _pos.y + geo.boundingBox.min.y * _scl.y;
      const trunkId = this.register({
        kind: 'tree',
        shape: {
          type: 'capsule',
          a: [_pos.x, y0, _pos.z],
          b: [_pos.x, y0 + Math.min(top * _scl.y, 7), _pos.z],
          radius: r,
        },
        ref: im, blocking: true, occluder: true, camera: true,
      });
      // remember the canopy spread on the trunk itself: 0 means a bare snag,
      // which is the only kind of trunk a chase camera can stand clear of
      this.byId.get(trunkId).canopy = canopy ? canopy.r * s : 0;
      // Canopy volume, registered for QUERIES ONLY (blocking/occluder/camera
      // all off). A pine skirt is ~2.5 m wide from ~2 m up, so no boom length
      // can put a chase camera outside it while she stands under the tree —
      // making it a camera collider just whiplashes the boom to its 0.45 m
      // floor near every trunk. The right treatment is fading the foliage,
      // which belongs to world-ground / player-control; this gives them the
      // volume to test against:
      //   collision.sphereQuery(cam.x, cam.y, cam.z, 0, out, c => c.kind === 'canopy')
      if (canopy) {
        this.register({
          kind: 'canopy',
          shape: {
            type: 'sphere',
            c: [_pos.x, y0 + canopy.cy * _scl.y, _pos.z],
            radius: canopy.r * s * 0.85,
          },
          ref: im, blocking: false, occluder: false, camera: false,
        });
      }
    }
  }

  /** Canopy centre height and spread of a tree geometry, in local units. */
  _canopy(geo) {
    const p = geo.attributes.position;
    const top = geo.boundingBox.max.y, bot = geo.boundingBox.min.y;
    const y0 = bot + (top - bot) * 0.35;
    let r = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < y0) continue;
      const rr = Math.hypot(p.getX(i), p.getZ(i));
      if (rr > r) r = rr;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    if (!(r > 0.8) || lo > hi) return null;   // bare snags have no canopy
    return { r, cy: (lo + hi) * 0.5 };
  }

  /** Widest point of the base ring — the trunk, before the canopy starts. */
  _trunkRadius(geo) {
    const p = geo.attributes.position;
    const y0 = geo.boundingBox.min.y;
    let r = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > y0 + 0.15) continue;
      const rr = Math.hypot(p.getX(i), p.getZ(i));
      if (rr > r) r = rr;
    }
    return Math.min(Math.max(r, 0.16), 0.62);
  }

  _seedRocks(im) {
    im.updateWorldMatrix(true, false);
    const geo = im.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const br = geo.boundingSphere.radius;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, _mat);
      _mat.premultiply(im.matrixWorld);
      _mat.decompose(_pos, _quat, _scl);
      const s = Math.max(_scl.x, _scl.z);
      const r = br * s * 0.82;
      // ankle-height scatter is stepped over, not walked into
      const solid = r >= 0.6;
      this.register({
        kind: 'rock',
        shape: { type: 'sphere', c: [_pos.x, _pos.y + r * 0.35, _pos.z], radius: r },
        ref: im, blocking: solid, occluder: solid,
      });
    }
  }

  /* ------------------------- dynamic machine hulls ---------------------- */

  /**
   * Machines get TWO capsules, and the difference between them matters.
   *
   *   kind 'machine'      blocking, camera:FALSE — radius bodyRadius + 0.55
   *   kind 'machine-cam'  camera only            — radius bodyRadius
   *
   * FIX ROUND 2 (judge: "standoff capsules are camera colliders using the
   * +0.55 m player pad"). `machinePad` exists for ONE reason: to clear the
   * machine manager's own `bodyRadius + 0.6` push so walking into a machine
   * stops the player instead of shoving the machine (A25). It is a gameplay
   * standoff, not geometry — the sculpt is not 0.55 m wider than it looks.
   * Because `camera` defaulted to `blocking`, that pad was inflating the lens
   * volume too: measured on port 5202, a 4.20 m boom collapsed to 0.89 m at
   * 3 m from a Watcher and to the 0.45 m floor near a Thunderjaw, 0.55 m
   * earlier than the silhouette justifies, and player-control was about to
   * inherit that in Wave 1 with no warning. Splitting the two roles keeps the
   * lens out of the machine (which is right) without the gameplay pad.
   */
  _syncMachines() {
    const list = this.ctx.machines && this.ctx.machines.list;
    if (!list) return;
    if (!this._machineMap) this._machineMap = new Map();
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      let rec = this._machineMap.get(m);
      if (!m.alive) {
        // a wreck is never a melee approach target: withdraw the published
        // term before anything else, so a machine that dies mid-swing does not
        // keep the shortened segment for the rest of the session
        if (rec && rec.meleeCut) { m.meleeStandoffHalfLen = null; rec.meleeCut = false; }
        // wrecks are lower and smaller: keep them as a low bump, not a wall,
        // and let the lens sit inside one so looting a corpse is filmable
        if (rec && rec.body.blocking) {
          rec.body.blocking = false; rec.body.occluder = false;
          rec.cam.camera = false;
        }
        continue;
      }
      if (!rec) {
        const shape = { type: 'capsule', a: [0, 0, 0], b: [0, 0, 0], radius: 1 };
        // `meleeCut` records whether this machine currently carries a published
        // melee approach term, so it is withdrawn exactly once (see
        // `_meleeStandoff`). The machine's own half-length is never written.
        const body = this.byId.get(this.register({
          kind: 'machine', dynamic: true, ref: m, occluder: false, camera: false, shape,
        }));
        const cam = this.byId.get(this.register({
          kind: 'machine-cam', dynamic: true, ref: m,
          blocking: false, occluder: false, camera: true, shape,
        }));
        rec = { body, cam, meleeCut: false };
        this._machineMap.set(m, rec);
      }
      const L = this._meleeStandoff(m, rec);
      const fx = Math.sin(m.heading || 0), fz = Math.cos(m.heading || 0);
      const r0 = m.bodyRadius || 1;
      const top = m.position.y + Math.max(0.6, (m.height || 2) * 0.75);
      // unrolled on purpose: `for (const c of [rec.body, rec.cam])` would
      // allocate an array per machine per frame in the hot sync loop
      _pair[0] = rec.body; _pair[1] = rec.cam;
      for (let k = 0; k < 2; k++) {
        const col = _pair[k];
        col.ax = m.position.x - fx * L; col.az = m.position.z - fz * L;
        col.bx = m.position.x + fx * L; col.bz = m.position.z + fz * L;
        col.ay = m.position.y + 0.15;
        col.by = top;
        col.vertical = L < 1e-3;
      }
      // clears the manager's own `bodyRadius + 0.6` standoff by a frame of
      // sprint travel, so machines are never shoved by walking into them
      rec.body.r = r0 + this._meleePad(m);
      // the real silhouette — no gameplay pad in the lens volume
      rec.cam.r = r0;
      this._bounds(rec.body);
      this._bounds(rec.cam);
    }
  }

  /**
   * THE MELEE APPROACH TERM (lane `player-melee`, grant extended Sep 25 —
   * `docs/ROUND4-AUDIT.md`, "Grant extended again"; recorded in
   * `docs/ROUND4-SPATIAL.md` §7 as that grant requires).
   *
   * THE PROBLEM IT EXISTS FOR. `machinePad` is a GAMEPLAY standoff, not
   * geometry: it keeps a walking player from shoving a machine (A25) by
   * clearing the machine manager's own `bodyRadius + 0.6` push. It is applied
   * to every machine in every state, including the one Aloy is trying to hit
   * with a 1.59 m spear. Measured on a Watcher: `standoffHalfLen` 1.5615 +
   * `bodyRadius` 0.9 + `machinePad` 0.55 + her own 0.4 m capsule radius holds
   * her 3.41 m from its centre head-on, while the contact pose puts her blade
   * tip 1.87 m ahead of her root. The blade finished 0.32-0.58 m short of the
   * nearest hull surface on every landed hit (gate A103's `bestD`), and
   * `reference/spear-light-strike.jpg` — the shot the whole lane is judged
   * against — has the blade ON the machine's head.
   *
   * WHAT IT DOES. While `combat.melee` has the spear drawn AND has that
   * machine selected as its approach target (`melee._scanApproach`, the same
   * wedge the hit resolve uses), that ONE machine's blocking capsule drops its
   * pad to `MELEE_PAD`. Every other machine, and every machine at every other
   * time, keeps `machinePad` unchanged — this is not a change to general
   * movement.
   *
   * WHY IT CANNOT INTERPENETRATE ANYTHING. The pad is a term ON TOP of the
   * machine's own `bodyRadius`, and `MELEE_PAD` is >= 0: her capsule can never
   * cross the machine's shell, only stand against it.
   *
   * WHY 0.32 AND NOT 0, AND WHY NOT 0.20 EITHER (fix pass 1). The floor is set
   * by A25-machine-immovable, and its EQUALITY point is exact rather than
   * tuned: `machines/index.js` pushes a machine away whenever the player's
   * POSITION is within `bodyRadius + 0.6` of a standoff sphere, while this
   * capsule holds her POSITION at `bodyRadius + pad + 0.4` (her own radius)
   * from the standoff segment. The push therefore fires iff `pad < 0.20`, for
   * every machine, independently of its `bodyRadius`.
   *
   * Round 4 shipped the pad AT 0.20 and called that a floor. It is not: the
   * manager runs against her position after the move, a walking player
   * penetrates the capsule by up to one frame of travel before the swept solve
   * pushes her out, and the push then fires on every forward frame and
   * integrates — the film judge measured 2.38 m of MACHINE displacement under
   * 4 s of KeyW with the spear drawn (0.000 m holstered). `MELEE_PAD_FLOOR` is
   * 0.32 now: the equality plus a 0.12 m frame of loaded-box travel, which is
   * the same margin `machinePad`'s own comment claims for the general case.
   * The reach it costs is returned on the same axis by `MELEE_L_CUT`.
   */
  /**
   * THE OTHER HALF OF THE MELEE APPROACH TERM: the standoff SEGMENT.
   *
   * The pad alone is not enough and the measurement says why. A Watcher's
   * blocking capsule is `standoffHalfLen` 1.5615 swept either side of its
   * centre, inflated by `bodyRadius` 0.9; its ACTUAL hit hull, at the height
   * a spear contacts (about 1.0 m up), starts 0.5 m from the centre and ends
   * 1.65 m out. The 1.5615 m half-length is not the machine, it is
   * `max(size.x, size.z) * 0.5 - bodyRadius` off the ANIMATED bounding box —
   * 4.92 m for a Watcher, i.e. the box that contains its legs at full spread.
   * So the capsule's END CAP is ~1 m of empty air in front of the sculpt, and
   * that cap is the whole reach shortfall: with the pad at its floor she still
   * stands 3.06 m from the centre while the blade reaches 1.80 m (measured off
   * the posed rig, not assumed — the arm is at full extension at contact and
   * authoring the hand further forward buys nothing, the IK simply falls
   * short).
   *
   * So the melee target's standoff segment is shortened by a fixed
   * `MELEE_L_CUT`, which eats the cap and nothing else.
   *
   * THE MANAGER HAS TO AGREE WITH THE COLLIDER, AND THAT IS NOT OPTIONAL.
   * `machines/index.js` runs its own hard standoff — it pushes a machine away
   * whenever the player's POSITION is within `bodyRadius + 0.6` of a sphere at
   * +-(half-length) — and that loop reads a field on the machine, not this
   * collider. If only the collider shrank, every melee approach would SHOVE
   * the machine, which is precisely the failure `machinePad` exists to prevent
   * (A25). The arithmetic says there is no pad that avoids it: she stands at
   * `L' + bodyRadius + pad + 0.40` from the centre, so her distance from the
   * manager's FRONT sphere (at the uncut `L`) is `bodyRadius + pad + 0.40 −
   * MELEE_L_CUT`, and keeping that outside `bodyRadius + 0.6` would need
   * `pad >= 0.20 + MELEE_L_CUT` = 1.22 m, more than twice `machinePad`. The
   * manager must see the shortened length.
   *
   * IT IS PUBLISHED AS ITS OWN FIELD, NOT WRITTEN OVER THE MACHINE'S OWN
   * GEOMETRY (fix pass 2). Round 4 and fix pass 1 wrote `want` straight into
   * `m.standoffHalfLen` and the doc claimed "every machine at every other time
   * is untouched", which was true of the TIME and false of the FIELD: three
   * other consumers read that same number as geometry, and none of them wants
   * a melee approach term in it —
   *
   *   `strider.js`  `reach = bodyRadius + standoffHalfLen + 0.8` (charge hit
   *                 test and `damagePlayer` radius): measured 2.287 -> 2.003 m
   *                 the moment she drew the spear;
   *   `behemoth.js` `reach = bodyRadius + standoffHalfLen + 0.9`: 5.80 -> 4.78 m;
   *   `melee.js`    the Silent Strike prompt radius.
   *
   * i.e. drawing the spear shrank the charge that was about to hit her. So the
   * shortened segment is published as `m.meleeStandoffHalfLen` and exactly ONE
   * consumer reads it — the manager's push loop, which has to agree with this
   * collider or A25 breaks (`machines/index.js`: `m.meleeStandoffHalfLen ??
   * m.standoffHalfLen`). Everything else keeps the machine's real half-length.
   * `A106-melee-approach-immovable` measures both halves: the machine still
   * moves 0.000 m under a drawn-spear walk-in, AND a Strider's and a Behemoth's
   * charge reach are identical drawn and holstered.
   *
   * NO INTERPENETRATION, AND IT IS MEASURED RATHER THAN CLAIMED: gate A103
   * publishes `playerToHullAtHit`, the distance from her own capsule to the
   * nearest hit-hull surface at the instant the blade lands, and fails the row
   * if it is not positive. On a Watcher it reads ~0.36 m.
   */
  _meleeStandoff(m, rec) {
    const mel = this.ctx.combat && this.ctx.combat.melee;
    // `typeof`, not `>= 0`: null coerces to 0 and would read as a valid pad
    const on = !!(mel && mel.approachMachine === m && typeof mel.approachPad === 'number');
    /* The machine's own half-length is read fresh every frame and never
     * written, so there is no cached base to go stale and nothing to restore
     * if melee is torn down mid-frame — the published term simply stops being
     * published. `rec` is still passed for the wreck path's `meleeCut` flag. */
    const base = m.standoffHalfLen || 0;
    if (!on) {
      if (rec.meleeCut) { m.meleeStandoffHalfLen = null; rec.meleeCut = false; }
      return base;
    }
    rec.meleeCut = true;
    const want = Math.max(base * MELEE_L_FLOOR, base - MELEE_L_CUT);
    m.meleeStandoffHalfLen = want;
    return want;
  }

  _meleePad(m) {
    const mel = this.ctx.combat && this.ctx.combat.melee;
    if (!mel || mel.approachMachine !== m) return this.machinePad;
    const want = mel.approachPad;
    if (typeof want !== 'number') return this.machinePad;
    return Math.min(this.machinePad, Math.max(MELEE_PAD_FLOOR, want));
  }

  /* --------------------------- opt-in demo shims ------------------------ */
  /* player-control replaces both with direct calls inside player.js — these
     exist so the spatial lane can prove A24/A25/V21 before Wave 1 lands.   */

  attachPlayer(opts = {}) {
    this.playerHook = {
      radius: opts.radius ?? 0.4,
      height: opts.height ?? 1.8,
      prev: new THREE.Vector3(NaN, NaN, NaN),
      state: { latch: 0, latchT: 0, lastX: NaN, lastZ: NaN },
      blocked: false, contacts: 0, headOn: 0, speed: 0,
      // what she is touching this frame (null when clear). A24 asserts on it
      // so a machine wandering into the corridor FAILS the gate loudly
      // instead of silently changing the answer; player-control can use the
      // same field to pick a scrape sound per surface kind.
      collider: null, kind: null,
    };
    return this.playerHook;
  }

  detachPlayer() { this.playerHook = null; }

  attachCamera(opts = {}) {
    this.cameraHook = { radius: opts.radius ?? 0.3 };
    return this.cameraHook;
  }

  detachCamera() { this.cameraHook = null; }

  _stepPlayer(dt) {
    const h = this.playerHook;
    const p = this.ctx.player;
    if (!h || !p) return;

    // Exactly the call docs/ROUND4-SPATIAL.md hands player-control. Nothing
    // extra happens in the shim: what the gates measure IS the published API.
    _hookOpts.wish = p._wishDir ? p._wishDir() : null;
    _hookOpts.state = h.state;
    const r = this.moveCapsule(p.position, h.prev, p.velocity,
      h.radius, h.height, dt, _hookOpts);

    h.blocked = r.hit;
    h.headOn = r.headOn;
    h.speed = r.speed;
    h.collider = r.hit ? r.collider : null;
    h.kind = r.hit && r.collider ? r.collider.kind : null;
    if (r.hit) h.contacts++;
    // report the speed she actually travelled, not the speed she wanted
    if (dt > 1e-5) p.moveSpeed = r.speed;
  }

  _stepCamera() {
    const h = this.cameraHook;
    const p = this.ctx.player;
    const cam = this.ctx.camera;
    if (!h || !p || !cam) return;
    const pivotH = p.crouching ? 1.1 : 1.55;
    const shoulder = p.aiming ? 0.55 : 0.32;
    _pivotS.set(p.position.x, p.position.y + pivotH, p.position.z);
    _sideS.set(Math.cos(p.camYaw), 0, -Math.sin(p.camYaw));
    _pivotS.addScaledVector(_sideS, shoulder);
    this.cameraBoom(_pivotS, cam.position, _boomS, h.radius);
    cam.position.copy(_boomS);
    _dirS.set(
      Math.sin(p.camYaw) * Math.cos(p.camPitch),
      Math.sin(p.camPitch),
      Math.cos(p.camYaw) * Math.cos(p.camPitch),
    );
    cam.lookAt(
      _pivotS.x - _dirS.x,
      _pivotS.y + 0.15 - _dirS.y * 0.2,
      _pivotS.z - _dirS.z,
    );
  }

  update(dt) {
    if (this.machineHook) this._syncMachines();
    if (this.playerHook) this._stepPlayer(dt);
    if (this.cameraHook) this._stepCamera();
  }
}

/**
 * Bring up the whole spatial lane on an existing ctx and register it as a
 * game system. core-platform should call this from `main.js` right after
 * `ctx.machines`; until then a page-context probe can call it directly.
 */
export function installSpatial(ctx, opts = {}) {
  if (ctx.collision) return ctx.spatial;
  const collision = new Collision(ctx, opts.collision);
  const nav = new Nav(ctx, collision, opts.nav);
  const hitHulls = new HitHulls(ctx, opts.hitHulls);
  ctx.collision = collision;
  ctx.nav = nav;
  ctx.hitHulls = hitHulls;
  collision.seedWorld();
  const system = {
    name: 'spatial',
    update(dt, t) {
      collision.update(dt, t);
      nav.update(dt, t);
      hitHulls.update(dt, t);
    },
  };
  if (ctx.game && Array.isArray(ctx.game.systems)) ctx.game.systems.push(system);
  ctx.spatial = { collision, nav, hitHulls, system };
  return ctx.spatial;
}
