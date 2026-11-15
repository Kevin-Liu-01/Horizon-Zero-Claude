import * as THREE from 'three';
import { patchAerial } from '../island/aerial.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dequantiseRoot } from '../../core/assets.js';
import {
  RING, PUMPS, STACKS, ROQUES, site, fieldPoint, polar,
} from './layout.js';

/**
 * THE PANS' LANDMARKS (world-props W1): the Sounding Ring, the three wind
 * pumps, the six sea stacks and the arch, the Roque plug and its needle, from
 * the GLBs `tools/build/landmarks/recipes/**` writes to
 * `public/models/landmarks/`.
 *
 * Loaded asynchronously through the shared GLTFLoader (meshopt + quantisation,
 * `ctx.assets.loader`) the moment `Props` is built; `ready` resolves when every
 * mesh is in the scene. Each GLB node becomes ONE draw: an InstancedMesh when
 * the layout places it more than once (pumps, stacks), a Mesh otherwise. The
 * plug and its needle are merged into one mesh (one draw, one caster).
 *
 * Draws (main / caster): Ring 3 / 2 (hull, lamp, the fallen quadrant), pumps
 * 2 / 1, stacks + arch 4 / 0, Roques 1 / 1. M1.1d: the Ring's fallen quadrant
 * (three 30-deg pieces, the GLB's `ring-fallen` node) is laid at runtime on
 * salt crust on the side of the break (`_layFallen`). The stacks stand 520-900 m out with no collider; the Ring, the pumps
 * and the Roques register theirs (`colliders()`).
 *
 * Moving parts: the pump rotors turn with the wind (`update`, allocation-free:
 * three instance matrices composed from scratch objects).
 */

const URL = {
  ring: '/models/landmarks/sounding-ring.glb',
  pump: '/models/landmarks/wind-pump.glb',
  skyline: '/models/landmarks/sea-stacks.glb',
};

const D2R = Math.PI / 180;

/** M1a round 3 (M1.1c, island/aerial.js): the stacks stand in the distance-graded air; once per material. */
function aerialOn(mat) {
  if (!mat || mat.userData.calAerial) return;
  mat.userData.calAerial = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer);
    patchAerial(shader);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}|cal-aerial`;
  mat.needsUpdate = true;
}
/** Yaw that turns a recipe's local +Z to a compass bearing (engine: x = E, z = -N). */
export const yawToBearing = (bearingDeg) => Math.PI - bearingDeg * D2R;

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(0, 0, 1);
const _box = new THREE.Box3();

/** name -> { geometry (baked to the scene frame, Float32), material, extras } for one loaded GLB. */
function nodesOf(gltf) {
  dequantiseRoot(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  const out = {};
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox(); g.computeBoundingSphere();
    const m = o.material;
    if (m) { m.side = THREE.FrontSide; if (g.attributes.color) m.vertexColors = true; }
    out[o.name] = { geometry: g, material: m };
  });
  return { nodes: out, extras: gltf.parser?.json?.asset?.extras || {} };
}

export class Landmarks {
  constructor(ctx, group) {
    this.ctx = ctx;
    this.group = group;
    this.records = [];          // published landmark records (see Props.landmarks)
    this.meshes = {};           // name -> Mesh / InstancedMesh
    this.pumpInfo = null;
    this._owned = { geo: new Set(), mat: new Set(), tex: new Set() };
    this._spin = 0;
    this.stats = { loadMs: 0 };
    this.ready = this._load();
  }

  _own(geo, mat) {
    if (geo) this._owned.geo.add(geo);
    const ms = Array.isArray(mat) ? mat : (mat ? [mat] : []);
    for (const m of ms) {
      this._owned.mat.add(m);
      for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) this._owned.tex.add(v); }
    }
  }

  async _load() {
    const t0 = performance.now();
    const L = this.ctx.assets?.loader;
    if (!L) throw new Error('world-props: ctx.assets.loader missing');
    const [ring, pump, sky] = await Promise.all([URL.ring, URL.pump, URL.skyline].map((u) => L.loadAsync(u)));
    if (this.disposed) { for (const g of [ring, pump, sky]) g.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); return this; }
    this._buildRing(nodesOf(ring));
    this._buildPumps(nodesOf(pump));
    this._buildSkyline(nodesOf(sky));
    this.stats.loadMs = +(performance.now() - t0).toFixed(1);
    return this;
  }

  _terrainY(x, z) { return this.ctx.terrain.getHeight(x, z); }

  /* ------------------------------------------------------------- the Ring */
  _buildRing({ nodes, extras }) {
    const s = site(RING.site);
    const info = extras.r5Ring || {};
    const g = new THREE.Group();
    g.name = 'sounding-ring-landmark';
    // set the cradle on the shingle: the lowest ground under the cradle's footprint
    const yaw = yawToBearing(RING.faceBearing);
    const fz = info.footZ ?? 5.8;
    const fx = Math.sin(yaw) * fz, fzw = Math.cos(yaw) * fz;
    const y = Math.min(this._terrainY(s.x + fx, s.z + fzw), this._terrainY(s.x, s.z));
    g.position.set(s.x, y, s.z);
    g.rotation.y = yaw;
    for (const [name, n] of Object.entries(nodes)) {
      if (name === 'ring-fallen') continue;          // laid in the salt below, in world space
      const mesh = new THREE.Mesh(n.geometry, n.material);
      mesh.name = name;
      const lamp = /lamp/.test(name);
      mesh.castShadow = !lamp;
      mesh.receiveShadow = !lamp;
      g.add(mesh);
      this._own(n.geometry, n.material);
      this.meshes[name] = mesh;
    }
    this.group.add(g);
    g.updateMatrixWorld(true);
    this.ring = { group: g, info, x: s.x, z: s.z, y, yaw };
    if (nodes['ring-fallen']) this._layFallen(nodes['ring-fallen'], s, yaw, info);
    this.records.push({ id: 'sounding-ring', name: 'Sounding Ring', kind: 'landmark', x: s.x, z: s.z, y, height: 32.8,
      object: g, design: { tiltDeg: info.tiltDeg, outerDiameter: info.outerDiameter, innerDiameter: info.innerDiameter } });
  }

  /**
   * M1.1d: the fallen quadrant, three 30-deg pieces lying in the salt. The break is on the ring's local -X
   * side (upper left from its face), so the pieces are laid on salt ground on that side: candidates on a
   * 2 m grid 16-80 m from the ring, kept when the ground under the piece's middle and both its ends
   * (+-4 m along it) is salt crust; the three nearest to the fall line, at least 8 m apart. One
   * InstancedMesh (one draw); a low box collider each.
   */
  _layFallen(n, s, yaw, info) {
    const T = this.ctx.terrain;
    const salt = (x, z) => T?.materialAt ? T.materialAt(x, z) === 'salt' : false;
    const dx = -Math.cos(yaw), dz = Math.sin(yaw);               // the ring's local -X in the world
    const cand = [];
    for (let j = -40; j <= 40; j++) for (let i = -40; i <= 40; i++) {
      const x = s.x + i * 2, z = s.z + j * 2, d = Math.hypot(x - s.x, z - s.z);
      if (d < 16 || d > 80) continue;
      if (!salt(x, z)) continue;
      const along = ((x - s.x) * dx + (z - s.z) * dz) / d;      // 1 on the fall line
      cand.push({ x, z, d, score: d * (1.6 - along) });
    }
    cand.sort((a, b) => a.score - b.score);
    const R = (() => { let a = 0x51a7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const placed = [];
    for (const c of cand) {
      if (placed.length >= (info.fallenPieces || 3)) break;
      if (placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 8)) continue;
      const py = R() * Math.PI * 2;
      const ax = Math.cos(py) * 4, az = -Math.sin(py) * 4;
      if (!salt(c.x + ax, c.z + az) || !salt(c.x - ax, c.z - az)) continue;
      placed.push({ x: c.x, z: c.z, yaw: py, tilt: (R() - 0.5) * 0.12 });
    }
    if (!placed.length) return;
    const im = new THREE.InstancedMesh(n.geometry, n.material, placed.length);
    im.name = 'sounding-ring-landmark-fallen';
    im.castShadow = true; im.receiveShadow = true;
    this._own(n.geometry, n.material);
    placed.forEach((p, i) => {
      p.y = Math.min(T.getHeight(p.x, p.z), T.getHeight(p.x + Math.cos(p.yaw) * 4, p.z - Math.sin(p.yaw) * 4), T.getHeight(p.x - Math.cos(p.yaw) * 4, p.z + Math.sin(p.yaw) * 4)) - 0.3;
      _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(new THREE.Euler(p.tilt, p.yaw, p.tilt * 0.5, 'YXZ')), _s.set(1, 1, 1));
      im.setMatrixAt(i, _m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    this.group.add(im);
    this.meshes.ringFallen = im;
    this.ring.fallen = placed;
  }

  /* ------------------------------------------------------------ the pumps */
  _buildPumps({ nodes, extras }) {
    const info = extras.r5Pump || { hub: [0, 10.55, 0.95], towerH: 9.6, rotorR: 3 };
    const tower = nodes['pump-tower'], rotor = nodes['pump-rotor'];
    const n = PUMPS.length;
    const ti = new THREE.InstancedMesh(tower.geometry, tower.material, n);
    const ri = new THREE.InstancedMesh(rotor.geometry, rotor.material, n);
    ti.name = 'wind-pump-landmark-tower';
    ri.name = 'wind-pump-landmark-rotor';
    ti.castShadow = true; ti.receiveShadow = true;
    ri.castShadow = false; ri.receiveShadow = true;
    this._own(tower.geometry, tower.material); this._own(rotor.geometry, rotor.material);
    this.pumpBase = [];
    for (let i = 0; i < n; i++) {
      const P = PUMPS[i];
      const p = fieldPoint(P.u, P.v);
      const y = this._terrainY(p.x, p.z) - 0.05;
      const yaw = yawToBearing(P.yawBearing);
      _m.compose(_p.set(p.x, y, p.z), _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), _s.set(1, 1, 1));
      ti.setMatrixAt(i, _m);
      // the rotor's base matrix: tower frame * hub offset (spin is applied each frame about local +Z)
      const base = _m.clone().multiply(_m2.makeTranslation(info.hub[0], info.hub[1], info.hub[2]));
      this.pumpBase.push(base);
      ri.setMatrixAt(i, base);
      this.records.push({ id: P.id, name: 'wind pump', kind: 'landmark', x: p.x, z: p.z, y, height: 13.6, object: ti, instanceId: i,
        hub: new THREE.Vector3(...info.hub).applyMatrix4(base.clone().multiply(_m2.makeTranslation(-info.hub[0], -info.hub[1], -info.hub[2]))) });
    }
    ti.instanceMatrix.needsUpdate = true; ri.instanceMatrix.needsUpdate = true;
    ti.computeBoundingSphere(); ri.computeBoundingSphere();
    this.group.add(ti, ri);
    this.meshes.pumpTower = ti; this.meshes.pumpRotor = ri;
    this.pumpInfo = info;
    this._rotorPhase = PUMPS.map((_, i) => i * 1.7);
  }

  /* ---------------------------------------------- stacks, arch, the Roques */
  _buildSkyline({ nodes, extras }) {
    const design = extras.r5Design || {};
    const byKind = {};
    for (const s of STACKS) (byKind[s.kind] ||= []).push(s);
    this.stacks = [];
    for (const [kind, list] of Object.entries(byKind)) {
      const n = nodes[kind];
      if (!n) continue;
      const im = new THREE.InstancedMesh(n.geometry, n.material, list.length);
      im.name = `skyline-landmark-${kind}`;
      aerialOn(n.material);
      im.castShadow = false;
      im.receiveShadow = true;
      this._own(n.geometry, n.material);
      list.forEach((s, i) => {
        const p = polar(s.bearing, s.range);
        const k = s.height / (design[kind] || s.height);
        _m.compose(_p.set(p.x, 0, p.z), _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw), _s.set(k, k, k));
        im.setMatrixAt(i, _m);
        const rec = { id: s.id, name: kind === 'sea-arch' ? 'sea arch' : 'sea stack', kind: 'landmark', x: p.x, z: p.z, y: 0, height: s.height,
          object: im, instanceId: i, foot: (kind === 'sea-arch' ? 9 : 8.5) * k, offshore: true, range: s.range, bearing: s.bearing };
        this.stacks.push(rec);
        this.records.push(rec);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
      this.meshes[kind] = im;
    }
    // the plug and its needle: merged into one draw (both static, on land)
    const parts = [];
    let material = null;
    for (const r of ROQUES) {
      const n = nodes[r.kind];
      if (!n) continue;
      const k = r.height / (design[r.kind] || r.height);
      const y = this._terrainY(r.x, r.z) - 1.5;
      _m.compose(_p.set(r.x, y, r.z), _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r.yaw), _s.set(k, k, k));
      const g = n.geometry.clone().applyMatrix4(_m);
      parts.push(g);
      this.records.push({ id: r.id, name: r.kind === 'roque-plug' ? 'Roque plug' : 'Roque needle', kind: 'landmark', x: r.x, z: r.z, y, height: r.height,
        base: (r.kind === 'roque-plug' ? 9.5 : 4.6) * k });
      material = n.material;
    }
    if (parts.length) {
      const merged = mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g), false);
      for (const g of parts) g.dispose();
      merged.computeBoundingBox(); merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'roques-landmark';
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes.roques = mesh;
      this._own(merged, material);
      for (const r of this.records) if (r.id.startsWith('roque')) r.object = mesh;
    }
    // the loaded-but-unused node geometries (plug/needle sources) are freed now
    for (const r of ROQUES) nodes[r.kind]?.geometry?.dispose();
  }

  /** Collider descriptors (registered by Props once ctx.collision exists). */
  colliders() {
    const out = [];
    const M = this.meshes;
    if (M['ring-hull']) out.push({ kind: 'landmark', object: M['ring-hull'], blocking: true, occluder: true });
    for (const p of this.ring?.fallen || []) {
      out.push({ kind: 'landmark', ref: M.ringFallen, shape: { type: 'box', c: [p.x, p.y + 0.9, p.z], half: [4.2, 0.6, 1.2], yaw: p.yaw } });
    }
    if (M.pumpTower) {
      // the cistern is a box; the lattice is four leg capsules (the player walks between them, not through)
      for (let i = 0; i < PUMPS.length; i++) {
        M.pumpTower.getMatrixAt(i, _m);
        _p.setFromMatrixPosition(_m);
        const yaw = Math.atan2(_m.elements[8], _m.elements[10]);
        out.push({ kind: 'landmark', ref: M.pumpTower, shape: { type: 'box', c: [_p.x, _p.y + 0.35, _p.z], half: [1.95, 0.75, 1.95], yaw } });
        out.push({ kind: 'landmark', ref: M.pumpTower, shape: { type: 'box', c: [_p.x + Math.cos(yaw) * 2.75, _p.y + 0.32, _p.z - Math.sin(yaw) * 2.75], half: [0.8, 0.35, 0.5], yaw } });
        for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
          const lx = sx * 1.55, lz = sz * 1.55, tx = sx * 0.42, tz = sz * 0.42;
          const c = Math.cos(yaw), s = Math.sin(yaw);
          out.push({ kind: 'landmark', ref: M.pumpTower, shape: { type: 'capsule',
            a: [_p.x + lx * c + lz * s, _p.y + 0.9, _p.z - lx * s + lz * c],
            b: [_p.x + tx * c + tz * s, _p.y + 10.4, _p.z - tx * s + tz * c], radius: 0.12 } });
        }
      }
    }
    if (M.roques) out.push({ kind: 'landmark', object: M.roques, blocking: true, occluder: true });
    return out;
  }

  /** Pump rotors turn with the wind: ~0.6-1.8 rad/s. Allocation-free. */
  update(dt, t) {
    const ri = this.meshes.pumpRotor;
    if (!ri || !this.pumpBase) return;
    // the live wind record (strength ~0.85 in the trade, 2.35 in a storm) -> m/s
    const W = this.ctx.environment?.wind;
    const speed = W ? (W.strength + W.gust) * 6 : 5;
    this._spin += dt * (0.45 + Math.min(10, speed) * 0.14);
    for (let i = 0; i < this.pumpBase.length; i++) {
      _m.copy(this.pumpBase[i]).multiply(_m2.makeRotationAxis(_ax, this._spin + this._rotorPhase[i]));
      ri.setMatrixAt(i, _m);
    }
    ri.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    for (const m of Object.values(this.meshes)) m.removeFromParent();
    this.ring?.group?.removeFromParent();
    for (const g of this._owned.geo) g.dispose();
    for (const t of this._owned.tex) t.dispose();
    for (const m of this._owned.mat) m.dispose();
    this._owned = { geo: new Set(), mat: new Set(), tex: new Set() };
    this.meshes = {};
    this.records.length = 0;
  }
}
