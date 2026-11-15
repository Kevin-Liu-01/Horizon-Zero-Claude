import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dequantiseRoot } from '../../core/assets.js';
import {
  BUILDINGS, CONES, HARBOUR, BREAKWATER_LAMP, BREAKWATER_LENS, GUILD_STUD, STREET, CREW, placeOf, streetPoint, townColliders,
} from './saltrow-layout.js';
import { SightingKite } from './saltrow-kite.js';

/**
 * SALTROW (BUILD M1.5a): the Pan Houses town, from the kit `tools/build/settlements/recipes/saltrow-kit.mjs` writes
 * (`public/models/settlements/saltrow-kit.glb`) and the layout in ./saltrow-layout.js.
 *
 *   const town = new Saltrow(ctx, parentGroup)   loads, seats and merges; `ready` resolves when it stands
 *   town.update(dt)            the windows' night glow follows the sun; colliders register once the world can take them
 *   town.buildings             [{ id, kind, x, y, z, yaw, w, d, h, tone }]
 *   town.lamps                 [{ id, kind, x, y, z }] the breakwater lamp and the guild-house lantern
 *   town.litWindows            how many window panes glow at night (the kit's count)
 *   town.stud                  the guild-house datum stud { x, y, z } (BUILD M1.6b: the home travel node)
 *   town.crew                  the people at work in the street [{ id, task, clip, person }] (M1.5a; M1.5d's routines
 *                              take them over): the slice's unnamed cast, spawned once through ctx.people
 *   town.kite                  the sighting kite (M1.5e, ./saltrow-kite.js)
 *   town.colliderCount         colliders registered (a box per block and roof block, a capsule per cone, the mole)
 *   town.dispose()
 *
 * DRAWS: the whole town is two meshes. Every building, the salt cones, the ramp and the breakwater are merged in the
 * world frame into ONE vertex-coloured mesh on the kit's one material (palette roughness/metal, KTX2), which casts and
 * takes shadows; every window pane and lamp glass is ONE more mesh (no shadow). 2 draws + 1 shadow caster.
 *
 * COLLIDERS: ./saltrow-layout.js townColliders (collision's box yaw turns the other way from three's rotation.y: at
 * 5210b31-dbb27a6 they took +yaw and stood 2 x yaw, 72 deg, off their walls).
 *
 * NIGHT: a pane's vertex colour is its room's glow (black = a dark room); `uGlow` scales it from dusk (sun under 8 deg)
 * to full at night. The walls carry the kit's baked window spill (TEXCOORD_1.x, renamed `aSpill`): at night each
 * wall vertex near a lit window adds its own lime colour x warm x spill to its emission, so walls read white within a
 * few metres of a window and fall to silhouette beyond (F07's written target).
 */
const URL = '/models/settlements/saltrow-kit.glb';
const WARM = new THREE.Color(1.0, 0.62, 0.32);

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Every attribute as plain Float32 (the merge needs one layout), uv1 -> aSpill. */
function plain(geo) {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    if (a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) {
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent ? a.getComponent(i, k) : a.array[i * a.itemSize + k];
      geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
    }
  }
  const uv1 = geo.attributes.uv1;
  const n = geo.attributes.position.count;
  const sp = new Float32Array(n);
  if (uv1) for (let i = 0; i < n; i++) sp[i] = uv1.getX(i);
  geo.setAttribute('aSpill', new THREE.BufferAttribute(sp, 1));
  geo.deleteAttribute('uv1');
  if (!geo.attributes.color) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (geo.attributes.color.itemSize === 4) {
    const c4 = geo.attributes.color, c3 = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c3[i * 3] = c4.getX(i); c3[i * 3 + 1] = c4.getY(i); c3[i * 3 + 2] = c4.getZ(i); }
    geo.setAttribute('color', new THREE.BufferAttribute(c3, 3));
  }
  for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color', 'aSpill'].includes(name)) geo.deleteAttribute(name);
  return geo;
}

export class Saltrow {
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'saltrow';
    parent.add(this.group);
    this.buildings = [];
    this.lamps = [];
    this.litWindows = 0;
    this.stud = null;
    this.loaded = false;
    this._collidersDone = false;
    this._colliderIds = [];
    this.uGlow = { value: 0 };
    this.uSpill = { value: new THREE.Color(0, 0, 0) };
    this.stats = { loadMs: 0, tris: 0, draws: 0 };
    this.crew = [];
    this._crewAsked = false;
    this.kite = new SightingKite(ctx, this.group);
    this.ready = this._load().catch((e) => { console.warn('[saltrow] the town did not load', e); return this; });
  }

  _h(x, z) { return this.ctx.terrain.getHeight(x, z); }

  async _load() {
    const t0 = performance.now();
    const L = this.ctx.assets?.loader;
    if (!L) throw new Error('saltrow: ctx.assets.loader missing');
    const gltf = await L.loadAsync(URL);
    if (this.disposed) { gltf.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); return this; }
    dequantiseRoot(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    const nodes = {};
    let kitMat = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      nodes[o.name] = plain(g);
      o.geometry.dispose();
      if (!kitMat) kitMat = o.material;
      else if (o.material !== kitMat) o.material.dispose?.();
    });
    const extras = gltf.parser?.json?.asset?.extras?.r5Saltrow || {};
    this.litWindows = extras.litWindows ?? 0;

    const body = [], glass = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    const take = (name, list, m) => { const g = nodes[name]; if (g) list.push(g.clone().applyMatrix4(m)); };

    for (const b of BUILDINGS) {
      const p = placeOf(b);
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      // seat on the street: the ground just in front of the door; the back and sides go into the slope or stand on
      // the basalt plinth
      const fx = p.x + sy * (b.d / 2 + 0.4), fz = p.z + cy * (b.d / 2 + 0.4);
      const y = this._h(fx, fz) + 0.04;
      M.compose(P.set(p.x, y, p.z), Q.setFromAxisAngle(Y, p.yaw), S.set(1, 1, 1));
      take(`b-${b.id}-body`, body, M);
      take(`b-${b.id}-flora`, body, M);
      take(`b-${b.id}-glass`, glass, M);
      this.buildings.push({ id: b.id, kind: b.kind, x: p.x, y, z: p.z, yaw: p.yaw, w: b.w, d: b.d, h: b.h, tone: b.tone, step: b.step });
      if (b.kind === 'guild') {
        const lx = 1.55, lz = b.d / 2 + 0.42;
        this.lamps.push({ id: 'guild-lantern', kind: 'lantern', x: p.x + cy * lx + sy * lz, y: y + 2.89, z: p.z - sy * lx + cy * lz });
        this.stud = { x: GUILD_STUD.x, y: y + 0.36, z: GUILD_STUD.z };
      }
    }
    CONES.forEach((c, i) => {
      M.compose(P.set(c.x, this._h(c.x, c.z) - 0.06, c.z), Q.setFromAxisAngle(Y, i * 2.1 + 0.4), S.set(c.r, c.h, c.r));
      take('cone', body, M);
    });
    const yawOf = (bearing) => Math.PI - bearing * Math.PI / 180;
    {
      const r = HARBOUR.ramp;
      M.compose(P.set(r.x, Math.max(0.3, this._h(r.x, r.z)), r.z), Q.setFromAxisAngle(Y, yawOf(r.bearing)), S.set(1, 1, 1));
      take('ramp', body, M);
      const b = HARBOUR.breakwater;
      const by = Math.max(0, this._h(b.x, b.z));
      M.compose(P.set(b.x, by, b.z), Q.setFromAxisAngle(Y, yawOf(b.bearing)), S.set(1, 1, 1));
      take('breakwater', body, M);
      take('breakwater-glass', glass, M);
      this.lamps.push({ id: 'breakwater-lamp', kind: 'breakwater', x: BREAKWATER_LAMP.x, y: by + (extras.lamp?.y ?? 4.6), z: BREAKWATER_LAMP.z });
      this.breakwater = { x: b.x, y: by, z: b.z, yaw: yawOf(b.bearing), length: b.length, width: b.width };
    }
    for (const g of Object.values(nodes)) g.dispose();

    const bodyGeo = mergeGeometries(body, false);
    const glassGeo = mergeGeometries(glass, false);
    for (const g of [...body, ...glass]) g.dispose();
    if (!bodyGeo || !glassGeo) throw new Error('saltrow: merge failed (attribute layouts differ)');
    bodyGeo.computeBoundingSphere(); glassGeo.computeBoundingSphere();

    this.bodyMat = this._bodyMaterial(kitMat);
    this.glassMat = this._glassMaterial();
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.name = 'saltrow-town';
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.glass = new THREE.Mesh(glassGeo, this.glassMat);
    this.glass.name = 'saltrow-glass';
    this.glass.castShadow = false; this.glass.receiveShadow = false;
    this.group.add(this.body, this.glass);
    this.stats.tris = (bodyGeo.index ? bodyGeo.index.count : bodyGeo.attributes.position.count) / 3
      + (glassGeo.index ? glassGeo.index.count : glassGeo.attributes.position.count) / 3;
    this.stats.draws = 2;
    this.stats.loadMs = +(performance.now() - t0).toFixed(1);
    this.loaded = true;
    this.update(0);
    return this;
  }

  /** The kit's material (palette maps, vertex colour) with the night spill added to its emission. */
  _bodyMaterial(src) {
    const m = src || new THREE.MeshStandardMaterial();
    m.vertexColors = true;
    m.side = THREE.FrontSide;
    m.name = 'CAL.saltrow';
    const U = { uSpill: this.uSpill };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSpill;\nvarying float vSpill;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpill = aSpill;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSpill;\nvarying float vSpill;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * uSpill * vSpill;');
    };
    m.customProgramCacheKey = () => 'cal-saltrow-body';
    m.needsUpdate = true;
    return m;
  }

  /** Window glass: dark and glossy by day; by night each pane glows its own baked colour. */
  _glassMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: 0x1b2023, roughness: 0.16, metalness: 0.0, vertexColors: true });
    m.name = 'CAL.saltrow-glass';
    const U = { uGlow: this.uGlow };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;')
        .replace('#include <color_fragment>', '')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vColor.rgb * uGlow;');
    };
    m.customProgramCacheKey = () => 'cal-saltrow-glass';
    return m;
  }

  /** Hand the town's colliders to `collision` once (./saltrow-layout.js townColliders: a box per block and roof block, the roofs floors). */
  _registerColliders() {
    const C = this.ctx.collision;
    if (this._collidersDone || !C || !this.loaded) return;
    this._collidersDone = true;
    for (const d of townColliders({ buildings: this.buildings, breakwater: this.breakwater, ground: (x, z) => this._h(x, z) })) {
      const id = C.register({ ...d, ref: this.body });
      if (Array.isArray(id)) this._colliderIds.push(...id); else if (id >= 0) this._colliderIds.push(id);
    }
    this.colliderCount = this._colliderIds.length;
  }

  /**
   * The people at work (CREW in the layout): spawned once, when the town stands and the people system can take them,
   * each at its spot facing its work, its work clip held (`_beatEnd` Infinity keeps the people system's idle beats
   * off them; M1.5d's routines replace this). They stay for the session (the A90 family: nothing outside a machine
   * root may come and go in the middle of a workload).
   */
  _stageCrew() {
    const P = this.ctx.people;
    if (this._crewAsked || !P?.spawn) return;
    this._crewAsked = true;
    CREW.forEach((c, i) => {
      const at = streetPoint(c.s, c.r), f = streetPoint(c.face.s, c.face.r);
      const yaw = Math.atan2(f.x - at.x, f.z - at.z);
      P.spawn(c.id, { x: at.x, z: at.z, yaw, seed: 211 + i * 29 }).then((p) => {
        if (this.disposed) { P.despawn?.(p); return; }
        let clip = c.clip, d = p.play(clip, { fade: 0, offset: (i * 0.31) % 1 });
        if (!d && c.alt) { clip = c.alt; d = p.play(clip, { fade: 0, offset: (i * 0.31) % 1 }); }
        if (P._propsFor && p.showProps) p.showProps(P._propsFor(p, clip));
        p._beatT = 0; p._beatEnd = Infinity;
        this.crew.push({ id: c.id, task: c.task, clip: d ? clip : null, person: p, x: at.x, z: at.z });
      }).catch((e) => { this.crew.push({ id: c.id, task: c.task, clip: null, person: null, error: String(e?.message || e) }); });
    });
  }

  /** The breakwater and the street's foot as named places for the frames (F07 stands on the breakwater). */
  _publishPlaces() {
    const GP = this.ctx.props?.gatePlaces;
    if (!GP || this._placesDone) return;
    this._placesDone = true;
    const L = BREAKWATER_LENS;
    if (!GP.breakwater) GP.breakwater = { x: L.x, z: L.z, y: (this.breakwater?.y ?? 0) + 1.3, bearing: L.bearing, yaw: -L.bearing * Math.PI / 180, note: 'Saltrow: on the breakwater deck 10 m out, looking up at the town (M1.5a)' };
    if (!GP.saltrowRamp) GP.saltrowRamp = { x: HARBOUR.ramp.x, z: HARBOUR.ramp.z, bearing: (HARBOUR.ramp.bearing + 180) % 360, note: 'Saltrow: the boat ramp top (M1.5a)' };
  }

  update(dt = 0) {
    this.kite?.update(dt);
    if (!this.loaded) return;
    if (!this._collidersDone) this._registerColliders();
    if (!this._crewAsked) this._stageCrew();
    if (!this._placesDone) this._publishPlaces();
    const env = this.ctx.environment;
    const sy = env?.sunDir ? env.sunDir.y : 0.5;
    // warm windows from dusk: none above 8 deg of sun, all lit by the time it is 3 deg under
    const k = ss(0.14, -0.05, sy);
    this.uGlow.value = 3.4 * k;
    this.uSpill.value.copy(WARM).multiplyScalar(0.62 * k);
  }

  dispose() {
    this.disposed = true;
    for (const c of this.crew) if (c.person) this.ctx.people?.despawn?.(c.person);
    this.crew.length = 0;
    this.kite?.dispose();
    const C = this.ctx.collision;
    if (C?.unregister && this._colliderIds.length) C.unregister(this._colliderIds);
    this._colliderIds.length = 0;
    for (const m of [this.body, this.glass]) {
      if (!m) continue;
      m.geometry.dispose();
      const mat = m.material;
      for (const k of Object.keys(mat)) { const v = mat[k]; if (v && v.isTexture) v.dispose(); }
      mat.dispose();
    }
    this.group.removeFromParent();
  }
}

/** The street's foot, for the frames and the map: where the main street leaves the pans. */
export const SALTROW_STREET = STREET;
