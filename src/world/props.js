import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  SimplexNoise, pathFactor, riverFactor,
  riverCenterX, riverHalfWidth,
} from './terrain.js';
import { bake, materials, disposeMaterials } from './props/kit.js';
import { buildMegastructures, SITES as MEGA_SITES } from './props/megastructures.js';
import { TallneckLandmark, buildLookout, TALLNECK, LOOKOUT } from './props/tallneck.js';
import { Rockworks } from './props/rockworks.js';
import { Activities } from './props/activities.js';
import { Places } from './props/places.js';
import { Fauna } from './fauna.js';

/**
 * Static world props, all baked at construction into a handful of merged
 * vertex-colored meshes (~5 draw calls total):
 *
 *  - river cobbles + pebble clusters strewn across the dried bed
 *  - bleached driftwood snagged along the channel
 *  - fallen logs + cut stumps around the groves
 *  - moss-topped boulders in the damp ground
 *  - three old-world ruin clusters (bent I-beams, shattered slabs, a
 *    half-buried hull arc) with rust/moss vertex coloring
 *  - a hunters' watchtower near the south trail fork
 *
 * Everything terrain-conforms via ctx.terrain.getHeight and stays clear of
 * the camp clearing, worn paths, and machine patrol zones
 * (spawns per machines/index.js: watchers r<=30, sawtooths r<=34 at their
 * anchors, behemoth (-160,90), thunderjaw (30,-220) r 42).
 */

const CAMP = { x: 22, z: 30 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function composeMat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    _v1.set(x, y, z),
    _q.setFromEuler(_e.set(rx, ry, rz)),
    _v2.set(sx, sy, sz),
  );
}

export class Props {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = mulberry32(0xBEEF01);
    this.noise = new SimplexNoise(4127);
    this.group = new THREE.Group();
    this.group.name = 'world-props';

    // merge buckets -> one mesh each
    this._wood = [];        // logs, stumps, driftwood, tower timber (casts shadow)
    this._cobble = [];      // river stones (no shadow — small + many)
    this._mossRock = [];    // mossy boulders (casts shadow)
    this._concrete = [];    // ruin slabs + rubble
    this._metal = [];       // ruin beams / hull (rusted metal)

    this._buildRiverRocks();
    this._buildDriftwood();
    this._buildDeadfall();
    this._buildMossBoulders();
    this._buildRuins();
    this._buildWatchtower();

    /* ---------------------- ROUND 4, lane world-props --------------------- */
    // The lookout gets its own buckets so it bakes into its own mesh: the
    // scene seed then registers it as kind 'tower' and the frustum can cull a
    // 14 m tower without dragging every log in the valley with it.
    this._lookoutWood = [];
    this._lookoutCloth = [];
    this.lookout = buildLookout(ctx, this._lookoutWood, this._lookoutCloth);

    this._bake();
    ctx.scene.add(this.group);

    // Megastructures go INTO the `world-props` group (one merged mesh per site
    // per material), so `installSpatial`'s scene seed BVHs each of them for
    // free — geometrically exact blocking + occluding + camera colliders.
    this.megaMeshes = buildMegastructures(ctx, this.group);
    this.landmarks = MEGA_SITES.map((s) => ({ ...s }));
    this.landmarks.push({ id: 'tallneck', name: 'Tallneck', x: TALLNECK.x, z: TALLNECK.z, height: TALLNECK.height, bearing: 'N' });
    this.landmarks.push({ id: 'lookout', name: 'Nora Lookout', x: LOOKOUT.x, z: LOOKOUT.z, height: LOOKOUT.height, bearing: 'NE' });

    // These two live in their own groups (the seed does not reach them) and
    // publish explicit collider descriptors instead.
    this.tallneck = new TallneckLandmark(ctx);
    this.rockworks = new Rockworks(ctx);
    this.ledges = this.rockworks.ledges;
    this.activities = new Activities(ctx, this);

    /**
     * `world-15` — three instanced wildlife species. Built here rather than in
     * `main.js` (core-platform's file) for the same reason `Props` registers
     * itself as a system: this lane owns both files and `Props` is already on
     * the system list, so ticking `Fauna` from here needs no cross-lane edit.
     * Published as `ctx.fauna` by its own constructor.
     */
    this.fauna = new Fauna(ctx);

    this.datapoints = this.activities.datapoints;
    this.trials = this.activities.trials;
    this.revealed = false;

    /**
     * ROUND 4 EXPANSION — the six new places (`src/world/props/places.js`).
     * Built LAST because it reads `activities` (the datapoint store widener),
     * `trials` (the arena's trial board) and `this.group` (its meshes go inside
     * `world-props` so `collision.seedWorld()` BVHs every one of them).
     */
    this.placeSystem = new Places(ctx, this);
    /** @type {object[]} `{ id, name, kind, position, radius, interactables }` */
    this.places = this.placeSystem.places;
    /** @type {object[]} anchors the `npc` lane fills at the new outpost */
    this.npcSlots = this.placeSystem.npcSlots;
    /** @type {object[]} rope bridges / plank walks over the dried channel */
    this.crossings = this.placeSystem.crossings ?? [];

    this._colliderIds = [];
    this._collidersDone = false;
    ctx.props = this;

    /**
     * `Props` is constructed by `Vegetation` (world-ground's file), which does
     * not tick it, and `main.js` belongs to `core-platform`. From Round 4 this
     * lane has moving parts — the Tallneck disc, the datapoint motes, the
     * one-shot collider and interactable registration — so it registers itself
     * as a system the same way `installSpatial` does. Idempotent: a later
     * `_add(props)` from main.js would find it already present.
     */
    const sys = ctx.game && ctx.game.systems;
    if (Array.isArray(sys) && !sys.includes(this)) sys.push(this);
  }

  /* --------------------------- published API ----------------------------- */

  /**
   * Every site in the valley as `{ kind, id, x, z, name, done }` — map,
   * notebook, `machine-ai` patrol weighting, `progression` discovery.
   *
   * From the Round 4 expansion this is activity sites PLUS the six new places,
   * and a place record carries two extra fields the activity records do not:
   * `position` (a live `THREE.Vector3`) and `radius` (the metres at which
   * entering it fires `place-discovered`). `place: true` marks them, so a
   * consumer that only wants the old set can filter on it.
   */
  sites() { return [...this.activities.sites(), ...this.placeSystem.sites()]; }

  /** The new place whose radius contains (x, z), or null. Allocation-free. */
  placeAt(x, z) { return this.placeSystem.placeAt(x, z); }

  /**
   * Nearest climbable ledge record to a point, or null (`world-16`).
   *
   * The expansion adds two more edges (the Glowfall shelf and the Fallen
   * Watcher's brow plate) in `places.js`, so this searches both tables rather
   * than only the rockworks one — same record shape, same contract.
   */
  ledgeNear(x, y, z, maxDist = 2.5) {
    const a = this.rockworks.ledgeNear(x, y, z, maxDist);
    let best = a, bestD = a
      ? (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z) + (a.y - y) * (a.y - y)
      : maxDist * maxDist;
    const extra = this.placeSystem ? this.placeSystem.ledges : null;
    if (extra) {
      for (let i = 0; i < extra.length; i++) {
        const L = extra[i];
        const ax = L.from.x, az = L.from.z, bx = L.to.x, bz = L.to.z;
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz || 1;
        let t = ((x - ax) * dx + (z - az) * dz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t, pz = az + dz * t;
        const d = (px - x) * (px - x) + (pz - z) * (pz - z) + (L.y - y) * (L.y - y);
        if (d < bestD) { bestD = d; best = L; }
      }
    }
    return best;
  }

  /**
   * Hand every collider this lane owns to `spatial`. `installSpatial` runs
   * inside `new Player()`, which is constructed AFTER `Vegetation` (and so
   * after `Props`), so this cannot happen in the constructor. It runs once,
   * on the first frame that finds `ctx.collision`.
   *
   * The `world-props` group is seeded by `collision.seedWorld()` already, so
   * only the Tallneck, the rockworks and the activity sites — each in its own
   * group, none of them reached by the seed — are registered here. `register()` also stamps the navgrid, so machines path around a
   * 46 m landmark without any further call (docs/ROUND4-SPATIAL.md §5).
   */
  registerColliders() {
    const C = this.ctx.collision;
    if (this._collidersDone || !C) return 0;
    this._collidersDone = true;
    const descs = [...this.tallneck.colliders(), ...this.rockworks.colliders(), ...this.activities.colliders()];
    for (const d of descs) {
      const id = C.register(d);
      if (Array.isArray(id)) this._colliderIds.push(...id);
      else if (id >= 0) this._colliderIds.push(id);
    }
    this.colliderCount = this._colliderIds.length;
    return this.colliderCount;
  }

  _groundY(x, z) { return this.ctx.terrain.getHeight(x, z); }

  /** Uniform-tint painter with per-vertex jitter. */
  _tinted(geo, matrix, color, jitter = 0.06) {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      const j = 1 + (this.rng() * 2 - 1) * jitter;
      arr[i * 3] = _c.r * j; arr[i * 3 + 1] = _c.g * j; arr[i * 3 + 2] = _c.b * j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (matrix) geo.applyMatrix4(matrix);
    return geo;
  }

  _tube(list, a, b, r0, r1, color, radial = 6, jitter = 0.07) {
    const len = _v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).length();
    const geo = new THREE.CylinderGeometry(r1, r0, len, radial);
    _q.setFromUnitVectors(UP, _v1.normalize());
    const m = new THREE.Matrix4().compose(
      _v2.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
      _q, new THREE.Vector3(1, 1, 1),
    );
    list.push(this._tinted(geo, m, color, jitter));
  }

  /* --------------------------- river cobbles ---------------------------- */

  _cobbleGeo(seed, rounded = 0.16) {
    const rng = mulberry32(seed);
    const n = new SimplexNoise(seed * 3 + 7);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = 0.9 + rounded * n.fbm(v.x * 1.4 + seed, v.y * 1.3 - v.z, 2);
      v.multiplyScalar(d);
      v.y *= 0.72;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  _buildRiverRocks() {
    const rng = this.rng;
    const protos = [this._cobbleGeo(5), this._cobbleGeo(19, 0.24), this._cobbleGeo(33, 0.1)];
    const shades = ['#7d8084', '#8f8878', '#6e7276', '#93908a'];
    let count = 0;
    for (let z = -238; z <= 238 && count < 300; z += 3.4) {
      const cx = riverCenterX(z);
      if (Math.hypot(cx, z) > 250) continue;
      const hw = riverHalfWidth(z);
      // cluster gate: stones gather in drifts, not evenly sprinkled
      const gate = this.noise.fbm(cx * 0.02, z * 0.02, 2);
      if (gate < -0.05) continue;
      const nHere = 1 + (rng() * (2.5 + gate * 4)) | 0;
      for (let k = 0; k < nHere; k++) {
        const x = cx + (rng() - 0.5) * 2 * hw * 0.72;
        const zz = z + (rng() - 0.5) * 3.2;
        if (riverFactor(x, zz) < 0.25) continue;
        const y = this._groundY(x, zz);
        const big = rng();
        const s = 0.12 + big * big * 0.55 + (rng() < 0.06 ? 0.45 : 0);
        const geo = protos[(rng() * 3) | 0].clone();
        this._tinted(geo, composeMat(
          x, y + s * 0.22, zz,
          rng() * 0.7, rng() * Math.PI * 2, rng() * 0.7,
          s * (0.85 + rng() * 0.4), s * (0.62 + rng() * 0.3), s * (0.85 + rng() * 0.4),
        ), shades[(rng() * shades.length) | 0], 0.09);
        this._cobble.push(geo);
        count++;
        // occasional tight pebble spill around a parent stone
        if (rng() < 0.22) {
          const nP = 3 + (rng() * 4 | 0);
          for (let p2 = 0; p2 < nP; p2++) {
            const a = rng() * Math.PI * 2;
            const px = x + Math.cos(a) * s * (1.6 + rng());
            const pz = zz + Math.sin(a) * s * (1.6 + rng());
            if (riverFactor(px, pz) < 0.2) continue;
            const ps = 0.05 + rng() * 0.09;
            const pg = protos[(rng() * 3) | 0].clone();
            this._tinted(pg, composeMat(
              px, this._groundY(px, pz) + ps * 0.3, pz,
              rng() * 2, rng() * 6.28, rng() * 2, ps, ps * 0.7, ps,
            ), shades[(rng() * shades.length) | 0], 0.11);
            this._cobble.push(pg);
            count++;
          }
        }
      }
    }
    this.cobbleCount = count;
  }

  /* ----------------------------- driftwood ------------------------------ */

  _driftGeo(seed) {
    const rng = mulberry32(seed);
    const L = 2.4 + rng() * 1.8;
    const r0 = 0.09 + rng() * 0.07;
    const geo = new THREE.CylinderGeometry(r0 * 0.35, r0, L, 7, 6);
    geo.rotateZ(Math.PI / 2); // lie along X
    const p = geo.attributes.position;
    const bend = (rng() - 0.5) * 0.5;
    for (let i = 0; i < p.count; i++) {
      const f = p.getX(i) / L + 0.5;
      p.setZ(i, p.getZ(i) + Math.sin(f * Math.PI) * bend);
      p.setY(i, p.getY(i) + Math.sin(f * 6.28 + seed) * 0.02);
    }
    geo.computeVertexNormals();
    // bleached silver-gray wood with darker weather streaks
    const n = p.count;
    const arr = new Float32Array(n * 3);
    const cA = new THREE.Color('#b7aa90');
    const cB = new THREE.Color('#8a7f6b');
    for (let i = 0; i < n; i++) {
      const streak = Math.abs(Math.sin(p.getX(i) * 9 + p.getY(i) * 14 + seed));
      _c.copy(cA).lerp(cB, streak * 0.7 + (rng() - 0.5) * 0.1);
      arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    // a snapped branch stub
    const stub = new THREE.CylinderGeometry(0.02, 0.045, 0.5, 5);
    this._tinted(stub, composeMat((rng() - 0.5) * L * 0.5, 0.14, 0, 0.9, 0, 0.7 + rng()), '#a3977e', 0.08);
    return mergeGeometries([geo.toNonIndexed(), stub.toNonIndexed()]);
  }

  _buildDriftwood() {
    const rng = this.rng;
    let placed = 0;
    for (let i = 0; i < 60 && placed < 13; i++) {
      const z = -225 + rng() * 450;
      const cx = riverCenterX(z);
      if (Math.hypot(cx, z) > 242) continue;
      const hw = riverHalfWidth(z);
      // snag on the bed edges / gravel bars
      const x = cx + (rng() < 0.5 ? -1 : 1) * hw * (0.35 + rng() * 0.5);
      if (riverFactor(x, z) < 0.2) continue;
      const y = this._groundY(x, z);
      const g = this._driftGeo(1000 + i);
      g.applyMatrix4(composeMat(
        x, y + 0.05, z,
        (rng() - 0.5) * 0.14,
        rng() * Math.PI * 2,
        (rng() - 0.5) * 0.14,
        0.85 + rng() * 0.5,
      ));
      this._wood.push(g);
      placed++;
    }
  }

  /* -------------------------- logs and stumps ---------------------------- */

  _logGeo(seed) {
    const rng = mulberry32(seed);
    const L = 2.6 + rng() * 1.8;
    const r = 0.15 + rng() * 0.09;
    const geo = new THREE.CylinderGeometry(r * 0.8, r, L, 8, 4);
    geo.rotateZ(Math.PI / 2); // along X, caps at ±L/2
    const p = geo.attributes.position;
    const n = p.count;
    const arr = new Float32Array(n * 3);
    const cBark = new THREE.Color('#4f3d29');
    const cMoss = new THREE.Color('#4e6323');
    const cCut = new THREE.Color('#9c8054');
    for (let i = 0; i < n; i++) {
      const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
      const isCap = Math.abs(Math.abs(lx) - L / 2) < 0.01;
      if (isCap) {
        const rd = Math.hypot(ly, lz) / r;
        _c.copy(cCut).multiplyScalar(0.7 + 0.3 * Math.abs(Math.sin(rd * 9)));
      } else {
        _c.copy(cBark).multiplyScalar(0.85 + rng() * 0.3);
        // moss carpet on the upper side
        const upness = ly / r;
        if (upness > 0.25) _c.lerp(cMoss, (upness - 0.25) * 1.05 * (0.5 + 0.5 * Math.sin(lx * 3 + seed)));
      }
      arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return { geo, L, r };
  }

  _stumpGeo(seed) {
    const rng = mulberry32(seed);
    const h = 0.32 + rng() * 0.4;
    const r = 0.22 + rng() * 0.16;
    const geo = new THREE.CylinderGeometry(r, r * 1.3, h, 9, 2);
    geo.translate(0, h / 2, 0);
    const p = geo.attributes.position;
    const arr = new Float32Array(p.count * 3);
    const cBark = new THREE.Color('#55402c');
    const cCut = new THREE.Color('#a08457');
    const cRing = new THREE.Color('#6b4f30');
    for (let i = 0; i < p.count; i++) {
      const isTop = p.getY(i) > h - 0.01;
      if (isTop) {
        const rd = Math.hypot(p.getX(i), p.getZ(i)) / r;
        _c.copy(cCut).lerp(cRing, 0.5 + 0.5 * Math.sin(rd * 14 + seed));
      } else {
        _c.copy(cBark).multiplyScalar(0.82 + rng() * 0.3);
      }
      arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  _buildDeadfall() {
    const rng = this.rng;
    const forest = new SimplexNoise(777); // the vegetation grove field
    const terrain = this.ctx.terrain;
    let logs = 0, stumps = 0;
    for (let a = 0; a < 4000 && (logs < 16 || stumps < 20); a++) {
      const r = Math.sqrt(rng()) * 315;
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (forest.fbm(x * 0.006, z * 0.006, 3) < 0.03) continue; // grove ground
      if (riverFactor(x, z) > 0.1 || pathFactor(x, z) > 0.3) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 15) continue;
      const h = terrain.getHeight(x, z);
      if (h > 30) continue;
      const gx = (terrain.getHeight(x + 0.8, z) - h) / 0.8;
      const gz = (terrain.getHeight(x, z + 0.8) - h) / 0.8;
      if (gx * gx + gz * gz > 0.3) continue;

      if (rng() < 0.45 && logs < 16) {
        const { geo, L } = this._logGeo(3000 + logs);
        const yaw = rng() * Math.PI * 2;
        // settle both ends onto the ground
        const dx = Math.cos(yaw) * L / 2, dz = -Math.sin(yaw) * L / 2;
        const hA = terrain.getHeight(x - dx, z - dz);
        const hB = terrain.getHeight(x + dx, z + dz);
        const pitch = Math.atan2(hB - hA, L);
        geo.applyMatrix4(composeMat(
          x, (hA + hB) / 2 + 0.1, z,
          0, yaw, pitch, 1,
        ));
        this._wood.push(geo);
        logs++;
      } else if (stumps < 20) {
        const geo = this._stumpGeo(4000 + stumps);
        geo.applyMatrix4(composeMat(x, h - 0.04, z, (rng() - 0.5) * 0.12, rng() * 6.28, (rng() - 0.5) * 0.12));
        this._wood.push(geo);
        stumps++;
      }
    }
  }

  /* --------------------------- mossy boulders ---------------------------- */

  _mossBoulderGeo(seed) {
    const rng = mulberry32(seed);
    const n = new SimplexNoise(seed * 31 + 5);
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = 0.7
        + 0.36 * (n.fbm(v.x * 1.3 + seed, v.y * 1.2 - v.z * 0.8, 3) * 0.5 + 0.5)
        + 0.08 * n.noise2D(v.x * 3.2 - v.z * 2.5, v.y * 3.1 + seed);
      v.multiplyScalar(d);
      v.y *= 0.78;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const arr = new Float32Array(p.count * 3);
    const cRock = new THREE.Color('#6c675c');
    const cDirt = new THREE.Color('#6a4c28');
    const cMoss = new THREE.Color('#4c6127');
    const cMoss2 = new THREE.Color('#66702c');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      _c.copy(cRock).lerp(cDirt, THREE.MathUtils.clamp(0.6 - y * 1.1, 0, 0.85));
      // moss cushions grow across the sky-facing surfaces
      const up = nor.getY(i);
      if (up > 0.35 && y > -0.1) {
        const patch = n.fbm(p.getX(i) * 2.1 + 9, p.getZ(i) * 2.1 - 4, 2) * 0.5 + 0.5;
        _c2.copy(cMoss).lerp(cMoss2, patch);
        _c.lerp(_c2, THREE.MathUtils.clamp((up - 0.35) * 1.7, 0, 1) * (0.35 + 0.65 * patch));
      }
      const j = (this.rng() - 0.5) * 0.06;
      arr[i * 3] = _c.r + j; arr[i * 3 + 1] = _c.g + j; arr[i * 3 + 2] = _c.b + j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  _buildMossBoulders() {
    const rng = this.rng;
    const forest = new SimplexNoise(777);
    const terrain = this.ctx.terrain;
    const protos = [this._mossBoulderGeo(51), this._mossBoulderGeo(77)];
    let placed = 0;
    for (let a = 0; a < 3000 && placed < 44; a++) {
      const r = Math.sqrt(rng()) * 320;
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      // damp spots: riverbanks and shaded grove floors
      const nearRiver = riverFactor(x, z);
      const inGrove = forest.fbm(x * 0.006, z * 0.006, 3) > 0.08;
      const onBank = nearRiver > 0.02 && nearRiver < 0.45;
      if (!inGrove && !onBank) continue;
      if (nearRiver > 0.45 || pathFactor(x, z) > 0.3) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 14) continue;
      const h = terrain.getHeight(x, z);
      if (h > 28) continue;
      const gx = (terrain.getHeight(x + 0.8, z) - h) / 0.8;
      const gz = (terrain.getHeight(x, z + 0.8) - h) / 0.8;
      if (gx * gx + gz * gz > 0.5) continue;

      const s = 0.6 + rng() * rng() * 1.7;
      const g = protos[(rng() * 2) | 0].clone();
      g.applyMatrix4(composeMat(
        x, h - s * 0.34, z,
        (rng() - 0.5) * 0.2, rng() * Math.PI * 2, (rng() - 0.5) * 0.2,
        s * (0.9 + rng() * 0.3), s * (0.8 + rng() * 0.4), s * (0.9 + rng() * 0.3),
      ));
      this._mossRock.push(g);
      placed++;
    }
    this.mossBoulderCount = placed;
  }

  /* ------------------------------- ruins --------------------------------- */

  /** Rust painter: streaked oxide with brighter worn edges + moss at the base. */
  _paintRust(geo, seed, mossBelow = 0.6) {
    const p = geo.attributes.position;
    const arr = new Float32Array(p.count * 3);
    const cRust = new THREE.Color('#4a2917');
    const cRust2 = new THREE.Color('#7d4526');
    const cWorn = new THREE.Color('#a8875a');
    const cMoss = new THREE.Color('#495c28');
    const rng = mulberry32(seed);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), ly = p.getY(i), lz = p.getZ(i);
      const streak = this.noise.fbm(lx * 1.1 + seed, ly * 2.6 - lz * 0.9, 2) * 0.5 + 0.5;
      _c.copy(cRust).lerp(cRust2, streak);
      if (rng() < 0.1) _c.lerp(cWorn, 0.5 + rng() * 0.4); // scoured glints
      if (ly < mossBelow) {
        _c.lerp(cMoss, THREE.MathUtils.clamp((mossBelow - ly) * 0.8, 0, 0.55) * (0.4 + 0.6 * streak));
      }
      const j = (rng() - 0.5) * 0.08;
      arr[i * 3] = _c.r + j; arr[i * 3 + 1] = _c.g + j; arr[i * 3 + 2] = _c.b + j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  _paintConcrete(geo, seed) {
    const p = geo.attributes.position;
    const arr = new Float32Array(p.count * 3);
    const cA = new THREE.Color('#8d897d');
    const cB = new THREE.Color('#6f6b60');
    const cMoss = new THREE.Color('#556238');
    const rng = mulberry32(seed);
    for (let i = 0; i < p.count; i++) {
      const stain = this.noise.fbm(p.getX(i) * 0.9 + seed, p.getY(i) * 1.3 + p.getZ(i), 2) * 0.5 + 0.5;
      _c.copy(cA).lerp(cB, stain);
      if (p.getY(i) < 0.35) _c.lerp(cMoss, (0.35 - p.getY(i)) * 0.8);
      const j = (rng() - 0.5) * 0.07;
      arr[i * 3] = _c.r + j; arr[i * 3 + 1] = _c.g + j; arr[i * 3 + 2] = _c.b + j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  /** I-beam profile along local Y, length L. */
  _iBeam(L, w = 0.34, fl = 0.3, th = 0.05) {
    const web = new THREE.BoxGeometry(th, L, w - th * 2);
    const f1 = new THREE.BoxGeometry(fl, L, th).translate(0, 0, w / 2 - th / 2);
    const f2 = new THREE.BoxGeometry(fl, L, th).translate(0, 0, -w / 2 + th / 2);
    return mergeGeometries([web, f1, f2]);
  }

  /** Shattered slab: box with jagged broken edge + protruding rebar. */
  _slab(seed, W = 3.2, T = 0.35, D = 2.2) {
    const rng = mulberry32(seed);
    const geo = new THREE.BoxGeometry(W, T, D, 6, 1, 4);
    const p = geo.attributes.position;
    // crush one edge into a jagged break
    for (let i = 0; i < p.count; i++) {
      const fx = p.getX(i) / W + 0.5;
      if (fx > 0.8) {
        const jag = (Math.sin(p.getZ(i) * 7.1 + seed) * 0.5 + 0.5) * 0.5 + rng() * 0.1;
        p.setX(i, p.getX(i) - jag * (fx - 0.8) * 3.5);
      }
    }
    geo.computeVertexNormals();
    this._paintConcrete(geo, seed);
    const parts = [geo.toNonIndexed()];
    // rebar sprouting from the broken edge
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.CylinderGeometry(0.022, 0.022, 0.55 + rng() * 0.3, 5);
      bar.rotateZ(Math.PI / 2 + (rng() - 0.5) * 0.8);
      bar.rotateY((rng() - 0.5) * 0.6);
      bar.translate(W * 0.42, (rng() - 0.5) * T, (rng() - 0.5) * D * 0.7);
      this._paintRust(bar, seed + i, -9);
      parts.push(bar.toNonIndexed());
    }
    return mergeGeometries(parts);
  }

  _ruinBeam(cluster, seed, x, z, yaw, tilt, L, kink = 0.5) {
    // ground-anchored beam with a bend partway up — reads as impact-warped
    const y = this._groundY(x, z);
    const L1 = L * kink, L2 = L * (1 - kink);
    const b1 = this._iBeam(L1);
    b1.translate(0, L1 / 2 - 0.45, 0);
    b1.rotateZ(tilt);
    b1.rotateY(yaw);
    this._paintRust(b1, seed, 0.75);
    b1.applyMatrix4(composeMat(x, y, z));
    cluster.push(b1.toNonIndexed());
    // second segment continues from the joint, bent further over
    const b2 = this._iBeam(L2);
    b2.translate(0, L2 / 2, 0);
    b2.rotateZ(tilt + 0.3 + (mulberry32(seed)() - 0.5) * 0.2);
    b2.rotateY(yaw + 0.15);
    this._paintRust(b2, seed + 5, 0.2);
    // joint position: top of segment 1
    const top = new THREE.Vector3(0, L1 - 0.45, 0)
      .applyEuler(_e.set(0, yaw, tilt, 'YXZ'));
    b2.applyMatrix4(composeMat(x + top.x, y + top.y, z + top.z));
    cluster.push(b2.toNonIndexed());
  }

  _rubble(cluster, seed, cx, cz, n, spread) {
    const rng = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * spread;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const s = 0.2 + rng() * 0.5;
      const g = new THREE.BoxGeometry(s * (0.7 + rng() * 0.8), s * (0.5 + rng() * 0.5), s * (0.7 + rng() * 0.8));
      this._paintConcrete(g, seed + i * 3);
      g.applyMatrix4(composeMat(
        x, this._groundY(x, z) + s * 0.14, z,
        rng() * 0.9, rng() * Math.PI * 2, rng() * 0.9,
      ));
      cluster.push(g.toNonIndexed());
    }
  }

  _buildRuins() {
    const rng = this.rng;

    // --- Cluster A (-150, -55): collapsed frame west of the river
    {
      const beams = [], conc = [];
      this._ruinBeam(beams, 21, -150, -55, 0.7, 0.42, 6.4, 0.55);
      this._ruinBeam(beams, 37, -147.4, -52.2, 2.4, 0.62, 4.6, 0.6);
      this._ruinBeam(beams, 53, -152.8, -57.6, 4.1, 0.30, 5.2, 0.5);
      const s1 = this._slab(61);
      s1.applyMatrix4(composeMat(-146.4, this._groundY(-146.4, -57.8) + 0.35, -57.8, 0.12, 0.6, 0.42));
      conc.push(s1);
      const s2 = this._slab(77, 2.7, 0.32, 2.0);
      s2.applyMatrix4(composeMat(-148.9, this._groundY(-148.9, -59.4) + 0.1, -59.4, 0.03, 2.1, 0.06));
      conc.push(s2);
      this._rubble(conc, 91, -149, -56.5, 7, 4.2);
      this._metal.push(...beams);
      this._concrete.push(...conc);
    }

    // --- Cluster B (135, -35): half-buried hull arc in the east meadow
    {
      const y0 = this._groundY(135, -35);
      // full arch: theta spans over the crown so BOTH rims dive underground
      const shell = new THREE.CylinderGeometry(4.1, 4.1, 6.8, 20, 2, true, -0.4, Math.PI + 0.8);
      shell.rotateZ(Math.PI / 2);       // axis along X -> an arch tunnel
      shell.scale(1, 0.85, 1);
      this._paintRust(shell, 111, 1.4);
      shell.applyMatrix4(composeMat(135, y0 - 0.85, -35, 0.12, 0.55, 0.05));
      this._metal.push(shell.toNonIndexed());
      // exposed ribs: raised bands riding the same arch
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.CylinderGeometry(4.24, 4.24, 0.15, 20, 1, true, -0.4, Math.PI + 0.8);
        rib.translate(0, (i - 1) * 2.4, 0);
        rib.rotateZ(Math.PI / 2);
        rib.scale(1, 0.87, 1);
        this._paintRust(rib, 120 + i, 0.5);
        rib.applyMatrix4(composeMat(135, y0 - 0.85, -35, 0.12, 0.55, 0.05));
        this._metal.push(rib.toNonIndexed());
      }
      this._ruinBeam(this._metal, 131, 139.5, -31.5, 3.6, 0.5, 4.4, 0.6);
      const s3 = this._slab(141, 2.6, 0.3, 1.9);
      s3.applyMatrix4(composeMat(131.2, this._groundY(131.2, -38.6) + 0.12, -38.6, 0.05, 1.2, 0.1));
      this._concrete.push(s3);
      this._rubble(this._concrete, 151, 136, -37.5, 5, 3.6);
    }

    // --- Cluster C (-45, 185): sheared slabs in the north meadow
    {
      const s4 = this._slab(161, 3.6, 0.4, 2.5);
      s4.applyMatrix4(composeMat(-45, this._groundY(-45, 185) + 0.9, 185, 0.02, 0.3, 0.62));
      const s5 = this._slab(171, 3.2, 0.36, 2.3);
      s5.applyMatrix4(composeMat(-43.2, this._groundY(-43.2, 187.1) + 0.14, 187.1, 0.04, 2.5, 0.05));
      this._concrete.push(s4, s5);
      this._ruinBeam(this._metal, 181, -47.8, 183.2, 1.9, 0.56, 5.0, 0.55);
      this._ruinBeam(this._metal, 191, -42.0, 182.4, 5.0, 0.36, 3.8, 0.6);
      this._rubble(this._concrete, 201, -44.5, 185.5, 6, 4.0);
    }
  }

  /* ---------------------------- watchtower ------------------------------- */

  _buildWatchtower() {
    const X = 33, Z = -14; // beside the south trail, clear of the fork
    const H = 5.4;
    const wood = '#5b4630';
    const dark = '#4a3826';
    const legs = [[-1.15, -1.15], [1.15, -1.15], [1.15, 1.15], [-1.15, 1.15]];
    const topY = [];
    for (const [lx, lz] of legs) {
      const gx = X + lx, gz = Z + lz;
      const gy = this._groundY(gx, gz);
      topY.push(gy + H);
      this._tube(this._wood, [gx, gy - 0.25, gz], [X + lx * 0.6, gy + H, Z + lz * 0.6], 0.085, 0.065, wood);
    }
    const platY = Math.min(...topY) - 0.35;
    // X-braces on each face
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
      const ay = this._groundY(X + ax, Z + az), by = this._groundY(X + bx, Z + bz);
      this._tube(this._wood, [X + ax * 0.93, ay + 0.5, Z + az * 0.93], [X + bx * 0.72, by + H * 0.62, Z + bz * 0.72], 0.038, 0.032, dark);
      this._tube(this._wood, [X + bx * 0.93, by + 0.5, Z + bz * 0.93], [X + ax * 0.72, ay + H * 0.62, Z + az * 0.72], 0.038, 0.032, dark);
    }
    // platform planks
    for (let i = 0; i < 6; i++) {
      const off = (i - 2.5) * 0.34;
      const plank = new THREE.BoxGeometry(2.0, 0.06, 0.3);
      this._wood.push(this._tinted(plank,
        composeMat(X, platY + (i % 2) * 0.012, Z + off, 0, 0.02 * (i % 3 - 1), 0), i % 2 ? '#6a5138' : '#5f4931', 0.08));
    }
    // rim beams + railing
    for (const s of [-1, 1]) {
      this._tube(this._wood, [X - 1.05, platY - 0.06, Z + s * 1.02], [X + 1.05, platY - 0.06, Z + s * 1.02], 0.05, 0.05, dark);
      this._tube(this._wood, [X + s * 1.02, platY - 0.06, Z - 1.05], [X + s * 1.02, platY - 0.06, Z + 1.05], 0.05, 0.05, dark);
    }
    for (const [px, pz] of [[-0.95, -0.95], [0.95, -0.95], [0.95, 0.95], [-0.95, 0.95], [0, -0.98], [-0.98, 0]]) {
      this._tube(this._wood, [X + px, platY, Z + pz], [X + px, platY + 0.78, Z + pz], 0.026, 0.022, wood);
    }
    this._tube(this._wood, [X - 0.98, platY + 0.78, Z - 0.98], [X + 0.98, platY + 0.78, Z - 0.98], 0.022, 0.022, dark);
    this._tube(this._wood, [X - 0.98, platY + 0.78, Z - 0.98], [X - 0.98, platY + 0.78, Z + 0.98], 0.022, 0.022, dark);
    this._tube(this._wood, [X + 0.98, platY + 0.78, Z - 0.98], [X + 0.98, platY + 0.78, Z + 0.98], 0.022, 0.022, dark);
    // hide canopy on two poles over the back half
    this._tube(this._wood, [X - 0.9, platY, Z + 0.9], [X - 0.75, platY + 1.65, Z + 0.75], 0.03, 0.024, wood);
    this._tube(this._wood, [X + 0.9, platY, Z + 0.9], [X + 0.75, platY + 1.65, Z + 0.75], 0.03, 0.024, wood);
    {
      const hide = new THREE.BoxGeometry(2.15, 0.03, 1.5, 6, 1, 4);
      const p = hide.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const fx = p.getX(i) / 2.15 + 0.5, fz = p.getZ(i) / 1.5 + 0.5;
        p.setY(i, p.getY(i) - Math.sin(fx * Math.PI) * Math.sin(fz * Math.PI) * 0.16);
      }
      hide.computeVertexNormals();
      const n = p.count;
      const arr = new Float32Array(n * 3);
      const pal = ['#a86f44', '#7c4a2b', '#96613c'].map((c) => new THREE.Color(c));
      for (let i = 0; i < n; i++) {
        const fx = Math.min(2, (p.getX(i) / 2.15 + 0.5) * 3 | 0);
        const fz = Math.min(1, (p.getZ(i) / 1.5 + 0.5) * 2 | 0);
        _c.copy(pal[(fx * 3 + fz * 5) % 3]).multiplyScalar(0.8 + this.rng() * 0.3);
        arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
      }
      hide.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      hide.applyMatrix4(composeMat(X, platY + 1.52, Z + 0.7, 0.28, 0, 0));
      this._wood.push(hide);
    }
    // ladder on the trail-facing side
    const lgy = this._groundY(X, Z - 1.3);
    for (const s of [-1, 1]) {
      this._tube(this._wood, [X + s * 0.28, lgy - 0.1, Z - 1.45], [X + s * 0.24, platY + 0.05, Z - 0.95], 0.032, 0.028, wood);
    }
    for (let i = 0; i < 6; i++) {
      const f = (i + 0.5) / 6;
      const ry = lgy - 0.1 + (platY + 0.15 - lgy) * f;
      const rz = Z - 1.45 + 0.5 * f;
      this._tube(this._wood, [X - 0.27, ry, rz], [X + 0.27, ry, rz], 0.02, 0.02, dark);
    }
  }

  /* -------------------------------- bake --------------------------------- */

  _bake() {
    const make = (geos, mat, { shadow = true, name }) => {
      if (!geos.length) return null;
      const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      // merge on the shared attribute set (position/normal/uv/color)
      const merged = mergeGeometries(flat.map((g) => {
        const keep = new THREE.BufferGeometry();
        for (const nm of ['position', 'normal', 'uv', 'color']) {
          const a = g.getAttribute(nm);
          if (a) keep.setAttribute(nm, a);
        }
        return keep;
      }), false);
      for (const g of geos) g.dispose();
      if (!merged) return null;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.name = name;
      this.group.add(mesh);
      return mesh;
    };

    // wood + concrete share one rough matte material — saves a color and a
    // shadow draw with zero visible difference (colors are all per-vertex)
    make([...this._wood, ...this._concrete], new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0,
    }), { name: 'props-matte' });
    // cobbles + moss boulders share one flat-shaded stone mesh/draw
    make([...this._cobble, ...this._mossRock], new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0, flatShading: true,
    }), { name: 'props-stone' });
    make(this._metal, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.62, metalness: 0.55,
      side: THREE.DoubleSide, // hull shell + ribs are open surfaces
    }), { name: 'props-ruin-metal' });
    this._wood = this._cobble = this._mossRock = this._concrete = this._metal = null;

    // ROUND 4 — the lookout as its own pair of meshes (kind 'tower').
    const mats = materials();
    const lw = bake(this._lookoutWood, mats.matte, { name: 'props-lookout-timber' });
    const lc = bake(this._lookoutCloth, mats.hide, { name: 'props-lookout-hide' });
    for (const m of [lw, lc]) if (m) this.group.add(m);
    this._lookoutWood = this._lookoutCloth = null;
  }

  update(dt, t) {
    this.registerColliders();
    this.tallneck.update(dt, t);
    this.activities.update(dt, t);
    this.placeSystem.update(dt, t);
    this.fauna.update(dt, t);
    this.revealed = this.activities.revealed;
  }

  /**
   * MEMORY RULE (the app crashed on memory this round). Nothing in the shipped
   * build tears the world down today, but every runtime object this lane
   * creates must HAVE a path back — a leak you cannot release is a leak whether
   * or not anything currently calls this.
   *
   * Geometry and materials are disposed, the groups are detached, the collider
   * ids this lane handed to `spatial` are handed back, and the shared kit
   * materials are released last (they are module singletons: releasing them
   * before a group that still draws with them would paint black).
   */
  dispose() {
    const C = this.ctx.collision;
    if (C && this._colliderIds.length) C.unregister(this._colliderIds);
    this._colliderIds.length = 0;
    this._collidersDone = false;

    this.placeSystem?.dispose?.();
    this.fauna?.dispose?.();

    const seen = new Set();
    for (const g of [this.group, this.tallneck?.group, this.rockworks?.group, this.activities?.group]) {
      if (!g) continue;
      g.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) if (!seen.has(m)) { seen.add(m); m.dispose(); }
        if (o.isInstancedMesh) o.dispose();
      });
      if (g.parent) g.parent.remove(g);
      g.clear();
    }
    disposeMaterials();

    const sys = this.ctx.game && this.ctx.game.systems;
    if (Array.isArray(sys)) {
      const i = sys.indexOf(this);
      if (i >= 0) sys.splice(i, 1);
    }
    if (this.ctx.props === this) this.ctx.props = null;
  }
}
