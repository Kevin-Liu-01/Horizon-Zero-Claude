import * as THREE from 'three';
import { Activities } from './props/activities.js';
import { disposeMaterials } from './props/kit.js';
import { Fauna } from './fauna.js';
import { Landmarks } from './sites/landmarks.js';
import { SurveyMarks } from './sites/survey.js';
import { StaticGauge } from './sites/gauge.js';
import { buildOrganShelf, buildCraterRock } from './sites/basalt.js';
import { buildGatePlaces } from './sites/gatePlaces.js';
import { site, CRATER, SITES_OK } from './sites/layout.js';

/**
 * WORLD PROPS — Round 5 (lane world-props, plan §2; W1 the Pans' slice).
 *
 * What stands on the island that is not ground, plants or settlements:
 *
 *   landmarks   the Sounding Ring (34 m, 20 deg off vertical), the three salt-
 *               field wind pumps (rotors turning), six offshore sea stacks and a
 *               sea arch (520-900 m out), the Roque plug + needle on the caldera's
 *               west rim                                        sites/landmarks.js
 *   basalt      the Organ Shelf's eleven hex-column clusters and the red
 *               crater's tuff blocks and bedded buttresses         sites/basalt.js
 *   survey      the six trig pillars (sites.js TRIG) and twelve benchmark pads,
 *               each with two interactables                        sites/survey.js
 *   gauge       the static scripted Gauge that opens Sluice 3      sites/gauge.js
 *   gatePlaces  the place contract every gate stages by (§3.2)  sites/gatePlaces.js
 *   activities  the Round-4 records/caches (progression W3 migrates them)
 *   fauna       the kept fauna system (world-props W3 re-picks the species)
 *
 * The Round-4 valley content (river rocks, driftwood, deadfall, ruins, the
 * watchtower and lookout, the megastructures, the Tallneck, the rockworks and
 * the six Round-4 places) is deleted with this file's rewrite (plan §6).
 *
 * BOOT. `Props` is constructed by world-ground's `Vegetation` (after the
 * terrain, before the player and `installSpatial`). The basalt, the place
 * records and `gatePlaces` are built synchronously; the GLB landmarks load
 * asynchronously (`ready`). Colliders and interactables are handed over on the
 * first frame that finds `ctx.collision` / `ctx.interactables` AND the GLBs.
 *
 * Published on ctx.props:
 *   gatePlaces                       the place table (sites/gatePlaces.js)
 *   ready: Promise<Props>            resolves when every landmark mesh is in
 *   landmarks: [{ id, name, kind, x, z, y, height, ... }]   (ui/map.js, gates)
 *   places: [{ id, name, kind, position, radius, x, z, interactables }]
 *   sites() -> [{ kind, id, x, z, name, done, place? }]       (progression, map)
 *   placeAt(x, z) -> place | null    allocation-free
 *   keepouts: [{ id, x, z, hard, soft, grass }]   ground world-ground's scatter clears
 *   seaStacks: [{ x, z, r }]         stack feet for the sea shader's surf (world-ground)
 *   gauge: StaticGauge               readout(), open(), state
 *   survey: { pillars, benchmarks }  sightedFrom(id), rayClear(a, b)
 *   colliderCount, registerColliders(), dispose()
 */
export class Props {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'world-props';
    this.island = SITES_OK;
    const T = ctx.terrain;

    // basalt + tuff (synchronous, generated)
    this.organ = buildOrganShelf(T);
    this.group.add(this.organ.mesh);
    this.crater = buildCraterRock(T);
    this.group.add(this.crater.blocks, this.crater.buttresses);

    // GLB landmarks, survey marks, the Gauge (asynchronous)
    this.landmarkSet = new Landmarks(ctx, this.group);
    this.survey = new SurveyMarks(ctx, this.group);
    this.gauge = new StaticGauge(ctx, this.group);

    // kept Round-4 systems (their own groups)
    this.activities = new Activities(ctx, this);
    this.fauna = new Fauna(ctx);
    this.datapoints = this.activities.datapoints;
    this.trials = this.activities.trials;
    this.revealed = false;

    this.places = this._buildPlaces();
    this._placeById = new Map(this.places.map((p) => [p.id, p]));
    this.keepouts = this._buildKeepouts();
    this.clearingReport = { trees: 0, colliders: 0, skipped: [], note: 'world-ground thins its scatter from ctx.props.keepouts' };
    this.npcSlots = [];
    this.crossings = [];
    this.gatePlaces = buildGatePlaces(ctx, this);

    this._colliderIds = [];
    this._collidersDone = false;
    this._interactablesDone = false;
    this.colliderCount = 0;
    this.loadError = null;
    this.ready = Promise.all([this.landmarkSet.ready, this.survey.ready, this.gauge.ready])
      .then(() => { this.loaded = true; this.seaStacks = this.landmarkSet.stacks.map((s) => ({ x: s.x, z: s.z, r: s.foot })); return this; })
      .catch((err) => { this.loadError = String(err?.message || err); console.error('[world-props] landmark load failed', err); return this; });
    this.loaded = false;
    this.seaStacks = [];

    ctx.scene.add(this.group);
    ctx.props = this;
    const sys = ctx.game && ctx.game.systems;
    if (Array.isArray(sys) && !sys.includes(this)) sys.push(this);
  }

  /* --------------------------------------------------------- published API */

  /** Every landmark record (GLB set once loaded + the generated ones + survey + gauge). */
  get landmarks() {
    const out = this._lmCache;
    if (out && this._lmCacheLoaded === this.loaded) return out;
    const L = [];
    for (const r of this.landmarkSet.records) L.push(r);
    const shelf = site('organ-shelf');
    if (shelf) L.push({ id: 'organ-shelf', name: 'Organ Shelf', kind: 'landmark', x: shelf.x, z: shelf.z, height: 14, object: this.organ.mesh });
    // each column cluster is its own silhouette (the tallest column, from the cluster's lowest ground)
    for (const c of this.organ.clusterRecs) L.push({ id: c.id, name: 'Organ Shelf columns', kind: 'landmark', x: c.x, z: c.z, y: c.y, height: c.height, object: this.organ.mesh, map: false });
    L.push({ id: CRATER.id, name: 'red crater', kind: 'landmark', x: CRATER.landmark.x, z: CRATER.landmark.z, height: 41, terrain: true,
      object: this.crater.buttresses });
    for (const p of this.survey.pillars) L.push({ id: `trig-${p.id}`, name: `trig pillar ${p.id}`, kind: 'trig', x: p.x, z: p.z, y: p.y, height: 7.4, object: p.object, instanceId: p.instanceId });
    L.push({ id: this.gauge.id, name: 'Gauge (Sluice 3)', kind: 'instrument', x: this.gauge.x, z: this.gauge.z, y: this.gauge.y, height: 12.4, object: this.gauge.root });
    this._lmCache = L; this._lmCacheLoaded = this.loaded;
    return L;
  }

  _buildPlaces() {
    const out = [];
    const add = (id, name, kind, x, z, radius, y = null) => {
      out.push({ id, name, kind, x, z, radius, position: new THREE.Vector3(x, y ?? this.ctx.terrain.getHeight(x, z), z), interactables: [], done: false });
    };
    for (const p of this.survey.pillars) add(p.id, `Trig ${p.id} · ${p.name}`, 'trig', p.x, p.z, 14, p.y);
    for (const b of this.survey.benchmarks) add(b.id, b.name, 'benchmark', b.x, b.z, 10, b.y);
    add(this.gauge.id, 'Gauge at Sluice 3', 'gauge', this.gauge.x, this.gauge.z, 28, this.gauge.y);
    const ring = site('sounding-ring');
    if (ring) add('sounding-ring', 'Sounding Ring', 'landmark', ring.x, ring.z, 30);
    return out;
  }

  /** Ground the scatter should keep clear: every pillar, pad, pump, the Gauge's cell edge, the Ring's cradle. */
  _buildKeepouts() {
    const K = [];
    for (const p of this.survey.pillars) K.push({ id: p.id, x: p.x, z: p.z, hard: 7, soft: 10, grass: 6 });
    for (const b of this.survey.benchmarks) K.push({ id: b.id, x: b.x, z: b.z, hard: 3.5, soft: 5, grass: 3 });
    const ring = site('sounding-ring');
    if (ring) K.push({ id: 'sounding-ring', x: ring.x, z: ring.z, hard: 9, soft: 22, grass: 14 });
    return K;
  }

  sites() {
    const out = this.activities.sites();
    for (const p of this.places) out.push({ kind: p.kind, id: p.id, x: p.x, z: p.z, name: p.name, done: p.done, place: true });
    return out;                                // landmarks are their own list (ctx.props.landmarks; the map reads both)
  }

  /** The place whose radius contains (x, z), or null. Allocation-free. */
  placeAt(x, z) {
    const P = this.places;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz <= p.radius * p.radius) return p;
    }
    return null;
  }

  /** No ledge table this round: climbing reads the colliders (hero-body's mantle). */
  ledgeNear() { return null; }

  /** Hand every collider this lane owns to `spatial`, once, after the GLBs. */
  registerColliders() {
    const C = this.ctx.collision;
    if (this._collidersDone || !C || !this.loaded) return 0;
    this._collidersDone = true;
    const descs = [];
    // Organ Shelf: one box per column (A24; the mantle climbs the risers)
    for (const c of this.organ.columns) {
      const ap = c.r * 0.866;
      descs.push({ kind: 'basalt', ref: this.organ.mesh, shape: { type: 'box', c: [c.x, (c.y0 + c.y1) / 2, c.z], half: [ap, (c.y1 - c.y0) / 2, ap], yaw: -c.rot } });
    }
    descs.push({ kind: 'rock', object: this.crater.blocks, blocking: true, occluder: true });
    descs.push({ kind: 'rock', object: this.crater.buttresses, blocking: true, occluder: true });
    descs.push(...this.landmarkSet.colliders(), ...this.survey.colliders(), ...this.gauge.colliders(), ...this.activities.colliders());
    for (const d of descs) {
      const id = C.register(d);
      if (Array.isArray(id)) this._colliderIds.push(...id);
      else if (id >= 0) this._colliderIds.push(id);
    }
    this.colliderCount = this._colliderIds.length;
    return this.colliderCount;
  }

  _registerInteractables() {
    const I = this.ctx.interactables;
    if (this._interactablesDone || !I || !this.loaded) return;
    this._interactablesDone = true;
    const ctx = this.ctx;
    for (const p of this.places) {
      let list = this.survey.entriesFor(p.id);
      if (p.kind === 'gauge') {
        const g = this.gauge;
        list = [
          { place: p.id, label: 'READ STAFF', hold: 0.3, radius: 4.5, position: new THREE.Vector3(g.x, g.y + 1.2, g.z),
            onInteract: () => ctx.events?.emit?.('gauge-read', { id: g.id, ...g.readout() }) },
          { place: p.id, label: 'SLUICE 3', hold: 0.8, radius: 4.5, position: new THREE.Vector3(g.x + 1.4, g.y + 1.0, g.z + 1.4),
            onInteract: () => { if (!g.open()) ctx.events?.emit?.('gauge-sluice', { id: g.id, sluice: g.sluice, tide: g.tide, open: true, already: true }); } },
        ];
      } else if (p.id === 'sounding-ring') {
        const R = this.landmarkSet.ring;
        const fx = R ? Math.sin(R.yaw) * 9 : 0, fz = R ? Math.cos(R.yaw) * 9 : 0;
        list = [
          { place: p.id, label: 'READ THE BAND', hold: 0.4, radius: 3.0, position: new THREE.Vector3(p.x + fx, p.position.y + 1.2, p.z + fz),
            onInteract: () => ctx.events?.emit?.('ring-read', { id: p.id }) },
          { place: p.id, label: 'LISTEN', hold: 1.2, radius: 3.0, position: new THREE.Vector3(p.x + fx * 0.6, p.position.y + 1.2, p.z + fz * 0.6),
            onInteract: () => ctx.events?.emit?.('ring-sounded', { id: p.id }) },
        ];
      }
      for (const e of list) {
        const prev = e.onInteract;
        e.onInteract = (...a) => { p.done = true; return prev?.(...a); };
        I.register(e);
        p.interactables.push(e);
      }
    }
  }

  /**
   * STOP-GAP until world-ground's static kinds honour `keepouts` (its `_applyKeepouts` thins the flora
   * only): the static scatter instances (`rocks-*`, `pan-dykes`) standing inside a keepout's hard radius
   * are scaled to zero and their colliders handed back, once, with a report (`clearingReport`). It is the
   * Round-4 clearings shim's rule: a clearing that is drawn but still collides, or collides but is not
   * drawn, is a bug, and a cull that silently does nothing is a FAIL (A98b).
   */
  _clearScatter() {
    const C = this.ctx.collision, veg = this.ctx.vegetation?.group;
    if (this._scatterCleared || !C || !veg) return;
    this._scatterCleared = true;
    const K = this.keepouts, rep = { instances: 0, colliders: 0, byMesh: {}, skipped: [] };
    const inHard = (x, z) => { for (let i = 0; i < K.length; i++) { const k = K[i], dx = x - k.x, dz = z - k.z; if (dx * dx + dz * dz < k.hard * k.hard) return true; } return false; };
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
    veg.updateWorldMatrix(true, true);
    for (const im of veg.children) {
      if (!im.isInstancedMesh || !/^(rocks-|pan-dykes)/.test(im.name || '')) continue;
      const hits = [];
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, M);
        P.setFromMatrixPosition(M).applyMatrix4(im.matrixWorld);
        if (!inHard(P.x, P.z)) continue;
        M.decompose(P, Q, S); M.compose(P, Q, S.set(0, 0, 0)); im.setMatrixAt(i, M);
        P.applyMatrix4(im.matrixWorld);
        hits.push([P.x, P.z]);
      }
      if (!hits.length) continue;
      im.instanceMatrix.needsUpdate = true;
      const dead = [];
      for (const c of C.colliders) {
        if (c.ref !== im && c.node !== im) continue;
        const cx = c.type === 'sphere' || c.type === 'box' ? c.cx : (c.minx + c.maxx) / 2, cz = c.type === 'sphere' || c.type === 'box' ? c.cz : (c.minz + c.maxz) / 2;
        if (hits.some(([x, z]) => Math.abs(x - cx) < 0.6 && Math.abs(z - cz) < 0.6)) dead.push(c.id);
      }
      if (dead.length) C.unregister(dead);
      rep.instances += hits.length; rep.colliders += dead.length;
      rep.byMesh[im.name] = { instances: hits.length, colliders: dead.length };
    }
    this.clearingReport = { trees: rep.instances, colliders: rep.colliders, instances: rep.instances, byMesh: rep.byMesh, skipped: rep.skipped,
      note: 'world-props zeroes world-ground static scatter inside keepout hard radii until world-ground thins its static kinds itself' };
  }

  update(dt, t) {
    if (this.loaded) {
      if (!this._scatterCleared) this._clearScatter();
      if (!this._collidersDone) this.registerColliders();
      if (!this._interactablesDone) this._registerInteractables();
      this.landmarkSet.update(dt, t);
      this.gauge.update(dt, t);
    }
    this.activities.update(dt, t);
    this.fauna.update(dt, t);
    this.revealed = this.activities.revealed;
  }

  /**
   * MEMORY RULE: every runtime object this lane creates has a path back.
   * Colliders handed to spatial are handed back; interactables unregistered;
   * GLB geometry/materials/textures, the generated basalt and tuff, the fauna
   * and the activities are disposed; the system entry is removed.
   */
  dispose() {
    const C = this.ctx.collision;
    if (C && this._colliderIds.length) C.unregister(this._colliderIds);
    this._colliderIds.length = 0;
    this._collidersDone = false;
    const I = this.ctx.interactables;
    for (const p of this.places) { for (const e of p.interactables) I?.unregister?.(e); p.interactables.length = 0; }
    this._interactablesDone = false;
    this.landmarkSet.dispose();
    this.survey.dispose();
    this.gauge.dispose();
    this.organ.mesh.geometry.dispose(); this.organ.mesh.material.dispose();
    this.crater.blocks.dispose(); this.crater.geo.dispose(); this.crater.bgeo.dispose(); this.crater.mat.dispose();
    this.fauna?.dispose?.();
    const ag = this.activities?.group;
    if (ag) {
      const seen = new Set();
      ag.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) if (!seen.has(m)) { seen.add(m); m.dispose(); }
        if (o.isInstancedMesh) o.dispose();
      });
      ag.removeFromParent(); ag.clear();
    }
    disposeMaterials();                       // the kit's shared materials go after every group drawing with them
    this.group.removeFromParent();
    this.group.clear();
    const sys = this.ctx.game && this.ctx.game.systems;
    if (Array.isArray(sys)) { const i = sys.indexOf(this); if (i >= 0) sys.splice(i, 1); }
    if (this.ctx.props === this) this.ctx.props = null;
  }
}
