import * as THREE from 'three';
import { dequantiseRoot } from '../../core/assets.js';
import { TRIG, TRIG_TOP, SIGHT_PAIRS, BENCHMARKS } from './layout.js';

/**
 * THE SURVEY MARKS (world-props W1; bible §8.4-§8.5): the six trig pillars
 * at world-ground's `sites.js` TRIG coordinates and the twelve benchmark pads,
 * from `public/models/landmarks/survey-marks.glb` (one instanced draw each).
 *
 * A pillar is climbed by its three 1 m steps (`ClimbUp_1m`, hero-body's mantle
 * against the step colliders below) to the drum's deck at 3 m; the bronze
 * centring plate of the observing pillar is its top (TRIG_TOP, 4 m). Its steps
 * face the flattest ground round it. A benchmark pad sits on the flattest ground
 * within its search radius, its top 0.30 m proud of the highest corner.
 *
 * Interactables (registered once `ctx.interactables` exists; each carries
 * `place` = its site id, A98-sites):
 *   pillar   SIGHT (on the deck): emits `trig-sighted` { id, sighted: [ids] }
 *            with the pillars its sight rays reach; READ PLATE (at the foot):
 *            `trig-plate` { id, name, top }.
 *   bench    RE-SURVEY (hold 15 s, bible §8.5): `benchmark-resurveyed`
 *            { id, region } and `ctx.datum.setTrue(region)` when world-ground's
 *            W2 datum service exists; READ MARK: `benchmark-read` { id, region, y }.
 */

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class SurveyMarks {
  constructor(ctx, group) {
    this.ctx = ctx;
    this.group = group;
    this.pillars = [];
    this.benchmarks = [];
    this.meshes = {};
    this._owned = [];
    this._placePillars();
    this._placeBenchmarks();
    this.ready = this._load();
  }

  _h(x, z) { return this.ctx.terrain.getHeight(x, z); }

  /** Pillar records (positions are final before the GLB arrives, so gates and gatePlaces can read them). */
  _placePillars() {
    for (const t of TRIG) {
      const base = this._h(t.x, t.z);
      // steps toward the flattest ground: the bearing whose ground 4.5 m out is nearest the base
      let best = 0, bestD = Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const d = Math.abs(this._h(t.x + Math.sin(a) * 4.5, t.z + Math.cos(a) * 4.5) - base)
          + 0.5 * Math.abs(this._h(t.x + Math.sin(a) * 2.5, t.z + Math.cos(a) * 2.5) - base);
        if (d < bestD) { bestD = d; best = a; }
      }
      this.pillars.push({
        id: t.id, name: t.name, x: t.x, z: t.z, y: base, yaw: best, top: base + TRIG_TOP, deck: base + 3,
        stepsDir: { x: Math.sin(best), z: Math.cos(best) }, sighted: false,
      });
    }
  }

  _placeBenchmarks() {
    for (const b of BENCHMARKS) {
      let bx = b.x, bz = b.z, bs = Infinity;
      const step = b.r / 3;
      for (let j = -3; j <= 3; j++) {
        for (let i = -3; i <= 3; i++) {
          const x = b.x + i * step, z = b.z + j * step;
          const h = this._h(x, z);
          if (h < 0.5) continue;
          const s = Math.abs(this._h(x + 1.3, z) - this._h(x - 1.3, z)) + Math.abs(this._h(x, z + 1.3) - this._h(x, z - 1.3))
            + (i * i + j * j) * 0.004;
          if (s < bs) { bs = s; bx = x; bz = z; }
        }
      }
      const hs = [this._h(bx + 1.2, bz + 1.2), this._h(bx - 1.2, bz + 1.2), this._h(bx + 1.2, bz - 1.2), this._h(bx - 1.2, bz - 1.2), this._h(bx, bz)];
      const y = Math.max(...hs) - 0.08;
      this.benchmarks.push({ id: b.id, name: b.name, region: b.region, biome: b.biome, x: bx, z: bz, y, top: y + 0.3,
        slope: +(bs / 2.6).toFixed(3), resurveyed: false });
    }
  }

  async _load() {
    const L = this.ctx.assets?.loader;
    if (!L) throw new Error('world-props: ctx.assets.loader missing');
    const gltf = await L.loadAsync('/models/landmarks/survey-marks.glb');
    if (this.disposed) { gltf.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); return this; }
    dequantiseRoot(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    const nodes = {};
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.applyMatrix4(o.matrixWorld);
      o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere();
      o.material.side = THREE.FrontSide;
      if (o.geometry.attributes.color) o.material.vertexColors = true;
      nodes[o.name] = o;
    });
    this.info = gltf.parser?.json?.asset?.extras?.r5Trig || null;
    const tp = nodes['trig-pillar'], bm = nodes.benchmark;
    const ti = new THREE.InstancedMesh(tp.geometry, tp.material, this.pillars.length);
    ti.name = 'trig-pillar-landmark';
    ti.castShadow = true; ti.receiveShadow = true;
    this.pillars.forEach((p, i) => {
      _m.compose(_p.set(p.x, p.y, p.z), _q.setFromAxisAngle(UP, p.yaw), _s);
      ti.setMatrixAt(i, _m);
      p.object = ti; p.instanceId = i;
    });
    ti.instanceMatrix.needsUpdate = true; ti.computeBoundingSphere();
    const bi = new THREE.InstancedMesh(bm.geometry, bm.material, this.benchmarks.length);
    bi.name = 'benchmark-landmark';
    bi.castShadow = false; bi.receiveShadow = true;
    this.benchmarks.forEach((b, i) => {
      _m.compose(_p.set(b.x, b.y, b.z), _q.setFromAxisAngle(UP, (i * 1.37) % (Math.PI * 2)), _s);
      bi.setMatrixAt(i, _m);
      b.object = bi; b.instanceId = i;
    });
    bi.instanceMatrix.needsUpdate = true; bi.computeBoundingSphere();
    this.group.add(ti, bi);
    this.meshes.trig = ti; this.meshes.bench = bi;
    this._owned.push(tp.geometry, bm.geometry, tp.material);
    if (bm.material !== tp.material) this._owned.push(bm.material);
    for (const m of new Set([tp.material, bm.material])) for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) this._owned.push(v); }
    return this;
  }

  /**
   * Explicit colliders: the octagonal drum as two boxes, the three steps as boxes
   * (the mantle finds their 1 m edges), the observing pillar and the mast as
   * capsules; a benchmark is one box (its 0.30 m top is a step). Kinds 'landmark'
   * and 'prop' are the ones the player's floor search stands on (player.js
   * STANDABLE): a step's top is a floor, not only a wall.
   */
  colliders() {
    const out = [];
    const T = this.info || { drumR: 1.9, drumH: 3, headR: 0.34, top: 4, steps: [{ h: 1, z0: 4.3, z1: 5.5 }, { h: 2, z0: 3.1, z1: 4.3 }, { h: 3, z0: 1.55, z1: 3.1 }], stepHalfW: 0.95, mast: { x: -1.15, z: -0.75, h: 3.6 } };
    const ap = T.drumR * Math.cos(Math.PI / 8);
    for (const p of this.pillars) {
      const ref = this.meshes.trig || null;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const W = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
      for (const yawOff of [0, Math.PI / 4]) {
        out.push({ kind: 'landmark', ref, instanceId: p.instanceId, shape: { type: 'box', c: [p.x, p.y + T.drumH / 2 - 0.2, p.z], half: [ap, T.drumH / 2 + 0.2, ap], yaw: p.yaw + Math.PI / 8 + yawOff } });
      }
      for (const st of T.steps) {
        const [cx, cz] = W(0, (st.z0 + st.z1) / 2);
        out.push({ kind: 'landmark', ref, instanceId: p.instanceId, shape: { type: 'box', c: [cx, p.y + st.h / 2 - 0.25, cz], half: [T.stepHalfW, st.h / 2 + 0.25, (st.z1 - st.z0) / 2], yaw: p.yaw } });
      }
      out.push({ kind: 'landmark', ref, instanceId: p.instanceId, shape: { type: 'capsule', a: [p.x, p.y + T.drumH, p.z], b: [p.x, p.y + T.top - 0.3, p.z], radius: T.headR + 0.02 } });
      const [mx, mz] = W(T.mast.x, T.mast.z);
      out.push({ kind: 'landmark', ref, instanceId: p.instanceId, shape: { type: 'capsule', a: [mx, p.y + T.drumH, mz], b: [mx, p.y + T.drumH + T.mast.h - 0.6, mz], radius: 0.08 } });
    }
    for (const b of this.benchmarks) {
      out.push({ kind: 'prop', ref: this.meshes.bench || null, instanceId: b.instanceId,
        shape: { type: 'box', c: [b.x, b.y + (0.3 - 0.6) / 2, b.z], half: [1.2, 0.45, 1.2], yaw: 0 } });
    }
    return out;
  }

  /** Which pillars this pillar's sight rays reach (terrain + collider occlusion). */
  sightedFrom(id) {
    const me = this.pillars.find((p) => p.id === id);
    if (!me) return [];
    const C = this.ctx.collision;
    const out = [];
    for (const [a, b] of SIGHT_PAIRS) {
      if (a !== id && b !== id) continue;
      const other = this.pillars.find((p) => p.id === (a === id ? b : a));
      if (other && this.rayClear(me, other, C)) out.push(other.id);
    }
    return out;
  }

  /** A sight ray from plate to plate: clear of terrain (2 m march) and of every blocking collider but the pillars'. */
  rayClear(A, B, C = this.ctx.collision) {
    const ay = A.top + 0.25, by = B.top + 0.25;
    const dx = B.x - A.x, dy = by - ay, dz = B.z - A.z;
    const len = Math.hypot(dx, dy, dz);
    for (let t = 6; t < len - 6; t += 2) {
      const k = t / len;
      if (ay + dy * k < this._h(A.x + dx * k, A.z + dz * k)) return false;
    }
    if (C) {
      // every blocking collider except the two pillars' own (anything within 7 m of either end)
      const own = (c) => { const cx = (c.minx + c.maxx) / 2, cz = (c.minz + c.maxz) / 2; return Math.hypot(cx - A.x, cz - A.z) < 7 || Math.hypot(cx - B.x, cz - B.z) < 7; };
      const h = C.raycast(A.x + dx / len * 4, ay + dy / len * 4, A.z + dz / len * 4, dx / len, dy / len, dz / len, len - 8,
        { filter: (c) => c.blocking !== false && !own(c) });
      if (h && h.hit) return false;
    }
    return true;
  }

  /** Interactable entries for one place id (registered by Props). */
  entriesFor(placeId) {
    const ctx = this.ctx;
    const p = this.pillars.find((q) => q.id === placeId);
    if (p) {
      const foot = new THREE.Vector3(p.x + p.stepsDir.x * 6.2, p.y + 0.9, p.z + p.stepsDir.z * 6.2);
      return [
        { place: p.id, label: 'SIGHT', hold: 0.6, radius: 1.7, position: new THREE.Vector3(p.x, p.deck + 0.9, p.z),
          onInteract: () => {
            const sighted = this.sightedFrom(p.id);
            p.sighted = true;
            ctx.events?.emit?.('trig-sighted', { id: p.id, name: p.name, sighted });
          } },
        { place: p.id, label: 'READ PLATE', hold: 0.3, radius: 2.0, position: foot,
          onInteract: () => ctx.events?.emit?.('trig-plate', { id: p.id, name: p.name, top: +p.top.toFixed(2) }) },
      ];
    }
    const b = this.benchmarks.find((q) => q.id === placeId);
    if (b) {
      return [
        { place: b.id, label: 'RE-SURVEY', hold: 15, radius: 2.4, position: new THREE.Vector3(b.x, b.top + 0.6, b.z),
          onInteract: () => {
            b.resurveyed = true;
            try { ctx.datum?.setTrue?.(b.region); } catch (err) { console.warn('[world-props] datum.setTrue failed', err); }
            ctx.events?.emit?.('benchmark-resurveyed', { id: b.id, region: b.region });
          } },
        { place: b.id, label: 'READ MARK', hold: 0.3, radius: 2.4, position: new THREE.Vector3(b.x + 0.9, b.top + 0.9, b.z + 0.9),
          onInteract: () => ctx.events?.emit?.('benchmark-read', { id: b.id, region: b.region, y: +b.top.toFixed(2) }) },
      ];
    }
    return [];
  }

  dispose() {
    this.disposed = true;
    for (const m of Object.values(this.meshes)) m.removeFromParent();
    for (const o of this._owned) o.dispose?.();
    this._owned.length = 0;
    this.meshes = {};
  }
}
