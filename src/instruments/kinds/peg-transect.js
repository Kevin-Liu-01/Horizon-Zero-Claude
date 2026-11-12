import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HOT } from '../lib/hot.js';
import { hexToRgb, srgbToLinear } from '../lib/color.js';

/**
 * PEG TRANSECTS (instruments-a W1; bible §7.4 #1 "swarms of 3-6 hammer transect
 * pegs in straight lines between Plumbs. A live transect is a dashed line of
 * glowing peg-heads (instanced, 1 draw); crossing one within 20 m of a Plumb
 * raises it to wary"; E11; gate `A-transect`; ROUND5-LOOK F-4: "Pegs cut transect
 * lanes through reed"). A helper module of the Peg kind (no default export).
 *
 * ONE DRAW. Every peg of every Peg is one instance of one InstancedMesh: a survey
 * peg (vermilion head, staff-white shank, vermilion band, steel point) whose head
 * glows in the calm lamp token (a lamp colour, never the vermilion: survey
 * vermilion is flat ink, never emissive — R66 c). Built on the first peg, disposed
 * (geometry, material, mesh) when the last Peg and the last peg are gone, so a
 * site dispose returns the geometry count to its baseline.
 *
 * THE LINE. Each Peg drives a peg every `TRANSECT.spacing` metres it walks on its
 * straight route; consecutive pegs of one Peg (<= `segMax` apart) form a transect
 * segment. Once per frame the player's step is tested against every segment;
 * a crossing raises every live Plumb within `crossR` of the crossing point to
 * wary (suspicious, looking at the crossing). Each new segment asks the terrain to
 * cut cover along it (`ctx.terrain.cutCover([x0, z0, x1, z1], w)`, world-ground's
 * F-4 contract, called only when it exists).
 *
 * Per frame: allocation-free (preallocated typed arrays; one Matrix4 scratch).
 */
export const TRANSECT = Object.freeze({
  spacing: 2.6, cap: 384, perOwner: 36, segMax: 6.5, crossR: 20, cutW: 1.0,
  height: 0.46, sink: 0.12, headR: 0.03, glow: 2.4,
});

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function pegGeometry() {
  const H = TRANSECT.height, r = 0.016;
  const parts = [];
  const add = (g, y0, col, glow) => {
    g.translate(0, y0, 0);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3), w = new Float32Array(n);
    const lin = hexToRgb(col).map(srgbToLinear);
    for (let i = 0; i < n; i++) { c[i * 3] = lin[0]; c[i * 3 + 1] = lin[1]; c[i * 3 + 2] = lin[2]; w[i] = glow; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(w, 1));
    if (g.index) { const ng = g.toNonIndexed(); g.dispose(); parts.push(ng); } else parts.push(g);
  };
  add(new THREE.CylinderGeometry(0.0015, r, 0.08, 6), 0.04, '#B9B5AD', 0);                         // steel point
  add(new THREE.CylinderGeometry(r, r, H - 0.16, 6), 0.08 + (H - 0.16) / 2, '#F1EEE6', 0);         // shank, staff white
  add(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.05, 6), H * 0.55, '#D2452E', 0);            // band, vermilion ink
  add(new THREE.CylinderGeometry(TRANSECT.headR * 0.8, TRANSECT.headR, 0.05, 8), H - 0.055, '#D2452E', 0);   // head collar
  add(new THREE.CylinderGeometry(TRANSECT.headR * 0.55, TRANSECT.headR * 0.8, 0.035, 8), H - 0.012, '#F2EAD3', 1);   // the lit cap
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

export class TransectSystem {
  constructor(machines) {
    this.machines = machines;
    this.ctx = machines.ctx;
    const N = TRANSECT.cap;
    this.px = new Float32Array(N); this.pz = new Float32Array(N);
    this.prev = new Int32Array(N).fill(-1);    // previous peg of the same owner (a segment), -1 none
    this.used = new Uint8Array(N);
    this.owner = new Array(N).fill(null);
    this.free = [];
    for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.rings = new Map();                    // owner -> { ring: Int32Array(perOwner), n, head, last }
    this.mesh = null;
    this.live = 0;
    this.crossings = 0;
    this.raised = 0;
    this.cuts = 0;
    this.lpx = 0.5; this.lpz = 0.5; this.lpOk = 0;
    this.frame = -1;
    this.draws = 0;
    this.drawTotal = 0;
  }

  _build() {
    const geo = pegGeometry();
    const lin = hexToRgb('#F2EAD3').map(srgbToLinear);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0, name: 'peg-transects' });
    const gk = TRANSECT.glow;
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * vec3(${(lin[0] * gk).toFixed(4)}, ${(lin[1] * gk).toFixed(4)}, ${(lin[2] * gk).toFixed(4)});`);
    };
    mat.customProgramCacheKey = () => 'cal-peg-transects-v1';
    const mesh = new THREE.InstancedMesh(geo, mat, TRANSECT.cap);
    mesh.name = 'peg-transects';
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.noSizeCull = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.raycast = () => {};
    mesh.onBeforeRender = () => { this.draws++; this.drawTotal++; };
    for (let i = 0; i < TRANSECT.cap; i++) mesh.setMatrixAt(i, ZERO);
    this.ctx.scene?.add(mesh);
    this.mesh = mesh;
  }

  /** Drive one peg for `owner` at (x, z). Returns the slot. */
  add(owner, x, z) {
    if (!this.mesh) this._build();
    let rec = this.rings.get(owner);
    if (!rec) { rec = { ring: new Int32Array(TRANSECT.perOwner).fill(-1), n: 0, head: -1, last: -1 }; this.rings.set(owner, rec); }
    // the owner's oldest peg goes when its line is full
    if (rec.n >= TRANSECT.perOwner) {
      const oldest = rec.ring[(rec.head + 1) % TRANSECT.perOwner];
      this._freeSlot(oldest);
      rec.n--;
    }
    if (!this.free.length) return -1;
    const i = this.free.pop();
    const T = HOT.terrain || this.ctx.terrain;
    const y = T && T.getHeight ? T.getHeight(x, z) : 0;
    this.px[i] = x; this.pz[i] = z;
    this.used[i] = 1; this.owner[i] = owner;
    const prev = rec.last;
    const dx = prev >= 0 ? x - this.px[prev] : 0, dz = prev >= 0 ? z - this.pz[prev] : 0;
    this.prev[i] = prev >= 0 && this.used[prev] && dx * dx + dz * dz <= TRANSECT.segMax * TRANSECT.segMax ? prev : -1;
    rec.head = (rec.head + 1) % TRANSECT.perOwner;
    rec.ring[rec.head] = i;
    rec.n++;
    rec.last = i;
    // a slight lean and spin: hand-driven, not stamped
    const h = Math.sin(i * 12.9898) * 43758.5453;
    const f = h - Math.floor(h);
    _q.setFromAxisAngle(_up, f * 6.283);
    _p.set(x, y - TRANSECT.sink, z);
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    if (i >= this.mesh.count) this.mesh.count = i + 1;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.live++;
    // F-4: the line cuts the reed (world-ground's contract, when it exists)
    if (this.prev[i] >= 0 && T && typeof T.cutCover === 'function') {
      try { T.cutCover([this.px[prev], this.pz[prev], x, z], TRANSECT.cutW); this.cuts++; } catch (e) { /* contract not live */ }
    }
    return i;
  }

  _freeSlot(i) {
    if (i < 0 || !this.used[i]) return;
    this.used[i] = 0;
    this.owner[i] = null;
    for (let k = 0; k < TRANSECT.cap; k++) if (this.prev[k] === i) this.prev[k] = -1;
    this.prev[i] = -1;
    this.mesh?.setMatrixAt(i, ZERO);
    if (this.mesh) this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(i);
    this.live--;
  }

  /** Remove every peg an owner drove (its machine left the world). Disposes the draw when nothing is left. */
  release(owner) {
    const rec = this.rings.get(owner);
    if (rec) {
      for (let k = 0; k < rec.ring.length; k++) this._freeSlot(rec.ring[k]);
      this.rings.delete(owner);
    }
    if (this.live <= 0 && this.rings.size === 0) this.dispose();
  }

  /** Once per frame (the first live Peg's update): does her step cross a live segment? */
  update() {
    const f = HOT.frame;
    if (f === this.frame) return;
    this.frame = f;
    this.draws = 0;
    if (HOT.pOk !== 1 || this.live < 2) { this.lpOk = 0; return; }
    const q = HOT.ppos, x1 = q.x, z1 = q.z;
    if (this.lpOk === 1) {
      const x0 = this.lpx, z0 = this.lpz;
      const ddx = x1 - x0, ddz = z1 - z0;
      if (ddx * ddx + ddz * ddz > 1e-8) {
        const N = this.mesh ? this.mesh.count : 0;
        for (let i = 0; i < N; i++) {
          const j = this.prev[i];
          if (j < 0 || !this.used[i]) continue;
          const ax = this.px[j], az = this.pz[j], bx = this.px[i], bz = this.pz[i];
          // segment-segment intersection (her step vs the line)
          const ex = bx - ax, ez = bz - az;
          const den = ddx * ez - ddz * ex;
          if (den > -1e-9 && den < 1e-9) continue;
          const t = ((ax - x0) * ez - (az - z0) * ex) / den;
          const u = ((ax - x0) * ddz - (az - z0) * ddx) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          this.crossings++;
          this._raise(x0 + ddx * t, z0 + ddz * t);
          break;
        }
      }
    }
    this.lpx = x1; this.lpz = z1; this.lpOk = 1;
  }

  /** Every live Plumb within TRANSECT.crossR of the crossing turns wary toward it. */
  _raise(x, z) {
    const list = this.machines.list;
    const r2 = TRANSECT.crossR * TRANSECT.crossR;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.kind !== 'plumb' || !m.alive || m._disposed) continue;
      const dx = m.position.x - x, dz = m.position.z - z;
      if (dx * dx + dz * dz > r2) continue;
      if (m.state === 'patrol' || m.state === 'return') {
        const c = m.perceptCfg;
        if (m.suspicion < c.susEnter + 0.05) m.suspicion = c.susEnter + 0.05;
        m._unseenT = 0;
        m.lastKnown.set(x, m.position.y, z);
        m.setState('suspicious');
        this.raised++;
      }
    }
    this.machines.ctx.events?.emit?.('transect-crossed', { x, z });
  }

  audit() {
    return { live: this.live, owners: this.rings.size, drawn: !!this.mesh, count: this.mesh ? this.mesh.count : 0,
      crossings: this.crossings, raised: this.raised, cuts: this.cuts, draws: this.draws };
  }

  dispose() {
    if (!this.mesh) return;
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    this.mesh = null;
    this.live = 0;
    this.used.fill(0);
    this.prev.fill(-1);
    this.owner.fill(null);
    this.free.length = 0;
    for (let i = TRANSECT.cap - 1; i >= 0; i--) this.free.push(i);
  }
}

/** The manager's one transect system (built on first use). */
export function transectsOf(machines) {
  if (!machines) return null;
  if (!machines.transects) machines.transects = new TransectSystem(machines);
  return machines.transects;
}
