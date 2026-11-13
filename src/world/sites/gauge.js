import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dequantiseRoot } from '../../core/assets.js';
import { GAUGE, fieldPoint } from './layout.js';
import { yawToBearing } from './landmarks.js';

/**
 * THE STATIC SCRIPTED GAUGE (world-props W1; plan §2, bible §8.9 beat 0:05 and
 * its E19 fallback: "the static scripted Gauge opens Sluice 3 when Brea
 * arrives"). It stands in the brine cell at Sluice 3 on its stilts and does one
 * thing: the first time Brea comes within `GAUGE.trigger` m it opens the
 * sluice (the leaf swings up over 1.2 s, a brine jet runs into the cell), its
 * float ring rides up the staff to the tide mark, and it emits
 *   `gauge-sluice` { id, sluice: 3, tide: 0.4, open: true }.
 * The Sighting overlay (shell-ui) reads `readout()`:
 *   { kind: 'GAUGE', sluice: 3, tide: 0.4, text: 'GAUGE · SLUICE 3 · TIDE 0.4 m' }.
 * instruments-b's living Gauge (W2) replaces it; `dispose()` takes it out.
 *
 * Draws: 2 (hull, lamp) + 1 caster. The recipe's three hull nodes (body, float
 * ring, sluice leaf) are merged into one mesh with a `part` attribute; the
 * vertex shader slides part 1 up the staff and swings part 2 about its hinge
 * (uniforms; the same patch on the shadow depth material). No per-frame
 * allocation: two uniform writes.
 */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

const PATCH_PARS = /* glsl */`
attribute float part;
uniform float uGaugeFloat;
uniform float uGaugeGate;
uniform vec3 uGaugeHinge;
`;
const PATCH_MAIN = /* glsl */`
#include <begin_vertex>
if (part > 1.5) {
  vec3 q = transformed - uGaugeHinge;
  float c = cos(uGaugeGate), s = sin(uGaugeGate);
  q = vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
  transformed = q + uGaugeHinge;
} else if (part > 0.5) {
  transformed.y += uGaugeFloat;
}
`;

export class StaticGauge {
  constructor(ctx, group) {
    this.ctx = ctx;
    this.group = group;
    const p = fieldPoint(GAUGE.u, GAUGE.v);
    this.id = GAUGE.id;
    this.x = p.x; this.z = p.z;
    this.y = ctx.terrain.getHeight(p.x, p.z) - 0.05;
    this.yaw = yawToBearing(GAUGE.nozzleBearing) - Math.PI / 2;   // recipe nozzle on +X
    this.sluice = GAUGE.sluice;
    this.tide = GAUGE.tide;
    this.state = 'closed';
    this.openK = 0;
    this.uniforms = { uGaugeFloat: { value: 0 }, uGaugeGate: { value: 0 }, uGaugeHinge: { value: new THREE.Vector3() } };
    this._owned = [];
    this._readout = Object.freeze({ kind: 'GAUGE', sluice: GAUGE.sluice, tide: GAUGE.tide, text: `GAUGE · SLUICE ${GAUGE.sluice} · TIDE ${GAUGE.tide} m` });
    this.ready = this._load();
  }

  readout() { return this._readout; }

  async _load() {
    const L = this.ctx.assets?.loader;
    if (!L) throw new Error('world-props: ctx.assets.loader missing');
    const gltf = await L.loadAsync('/models/landmarks/gauge-static.glb');
    if (this.disposed) { gltf.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); return this; }
    dequantiseRoot(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    const info = gltf.parser?.json?.asset?.extras?.r5Gauge || { hinge: [1.7, 1.15, 0], drumY: 5.3 };
    this.info = info;
    this.uniforms.uGaugeHinge.value.set(info.hinge[0] + 0.23, info.hinge[1] + 0.35, info.hinge[2]);
    const parts = [], tagged = [];
    let hullMat = null, lampMesh = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      g.applyMatrix4(o.matrixWorld);
      if (o.name === 'gauge-lamp') { lampMesh = o; return; }
      hullMat = o.material;
      const id = o.name === 'gauge-float' ? 1 : o.name === 'gauge-gate' ? 2 : 0;
      if (id === 1) g.translate(0, info.mast0 ?? 6.25, 0);                             // ring at the staff's foot
      if (id === 2) g.translate(info.hinge[0] + 0.23, info.hinge[1] + 0.35, info.hinge[2]);   // leaf on the box's outer face
      const ng = g.index ? g.toNonIndexed() : g;
      ng.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count).fill(id), 1));
      for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'color', 'uv', 'part'].includes(k)) ng.deleteAttribute(k);
      parts.push(ng);
      tagged.push(g);
    });
    const merged = mergeGeometries(parts, false);
    for (const g of new Set([...parts, ...tagged])) g.dispose();
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    hullMat.side = THREE.FrontSide;
    hullMat.vertexColors = true;
    const U = this.uniforms;
    const patch = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${PATCH_PARS}`)
        .replace('#include <begin_vertex>', PATCH_MAIN);
    };
    hullMat.onBeforeCompile = patch;
    hullMat.customProgramCacheKey = () => 'cal-gauge-static';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = patch;
    depth.customProgramCacheKey = () => 'cal-gauge-static-depth';
    const body = new THREE.Mesh(merged, hullMat);
    body.name = 'gauge-static-body';
    body.castShadow = true; body.receiveShadow = true;
    body.customDepthMaterial = depth;
    const root = new THREE.Group();
    root.name = 'gauge-static-instrument';
    root.position.set(this.x, this.y, this.z);
    root.rotation.y = this.yaw;
    root.add(body);
    if (lampMesh) {
      lampMesh.removeFromParent();
      lampMesh.position.set(0, 0, 0); lampMesh.rotation.set(0, 0, 0); lampMesh.scale.set(1, 1, 1);
      lampMesh.castShadow = false;
      lampMesh.name = 'gauge-static-lamp';
      root.add(lampMesh);
      this._owned.push(lampMesh.geometry, lampMesh.material);
    }
    // the brine jet: a thin cone out of the nozzle, additive, shown while the sluice runs
    const jetGeo = new THREE.ConeGeometry(0.32, 2.6, 12, 1, true);
    jetGeo.rotateZ(Math.PI / 2); jetGeo.translate(2.05 + 1.3, 0.95, 0);
    const jetMat = new THREE.MeshBasicMaterial({ color: 0xbde6e3, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const jet = new THREE.Mesh(jetGeo, jetMat);
    jet.name = 'gauge-static-jet';
    jet.visible = false;
    jet.raycast = () => {};                     // an FX shell: never a collider (collision.seedWorld's rule)
    root.add(jet);
    this.group.add(root);
    root.updateMatrixWorld(true);
    this.root = root; this.body = body; this.jet = jet;
    this._owned.push(merged, hullMat, depth, jetGeo, jetMat);
    for (const k of Object.keys(hullMat)) { const v = hullMat[k]; if (v && v.isTexture) this._owned.push(v); }
    return this;
  }

  /** Stilts as capsules, the drum as a sphere (blocking, occluding). */
  colliders() {
    if (!this.root) return [];
    const out = [];
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const W = (lx, ly, lz) => [this.x + lx * c + lz * s, this.y + ly, this.z - lx * s + lz * c];
    for (const [fx, fz] of (this.info.feet || [[1.95, 1.95], [-1.95, 1.95], [-1.95, -1.95], [1.95, -1.95]])) {
      out.push({ kind: 'instrument-static', ref: this.body, shape: { type: 'capsule', a: W(fx, 0.2, fz), b: W(fx * 0.5, 4.6, fz * 0.5), radius: 0.16 } });
    }
    out.push({ kind: 'instrument-static', ref: this.body, shape: { type: 'sphere', c: W(0, this.info.drumY ?? 5.3, 0), radius: 1.6 } });
    return out;
  }

  /** Open the sluice (the beat-0:05 script). Idempotent. */
  open() {
    if (this.state !== 'closed') return false;
    this.state = 'opening';
    this.ctx.events?.emit?.('gauge-sluice', { id: this.id, sluice: this.sluice, tide: this.tide, open: true });
    return true;
  }

  update(dt) {
    if (!this.root) return;
    const P = this.ctx.player?.position;
    if (this.state === 'closed' && P) {
      const dx = P.x - this.x, dz = P.z - this.z;
      if (dx * dx + dz * dz < GAUGE.trigger * GAUGE.trigger) this.open();
    }
    if (this.state === 'opening' || this.state === 'open') {
      this.openK = Math.min(1, this.openK + dt / 1.2);
      if (this.openK >= 1) this.state = 'open';
      const k = this.openK * this.openK * (3 - 2 * this.openK);
      this.uniforms.uGaugeGate.value = k * 1.15;
      this.uniforms.uGaugeFloat.value = k * this.tide;                // the ring rides up to the tide mark on the staff
      const jet = this.jet;
      jet.visible = this.openK > 0.35;
      jet.material.opacity = 0.32 * Math.min(1, (this.openK - 0.35) / 0.4) * (0.85 + 0.15 * Math.sin(performance.now() * 0.02));
    }
  }

  dispose() {
    this.disposed = true;
    this.root?.removeFromParent();
    for (const o of this._owned) o.dispose?.();
    this._owned.length = 0;
    this.root = null;
  }
}
