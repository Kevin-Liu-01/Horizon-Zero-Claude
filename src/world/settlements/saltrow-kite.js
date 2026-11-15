import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KITE } from './saltrow-layout.js';

/**
 * THE SIGHTING KITE (BUILD M1.5e; bible §11 slice 0:00, "A Pan Houses sighting kite flies over Saltrow"): a prop on
 * a line, not the player's Survey Kite (Milestone 3). A two-cell box kite of split carrizo cane and undyed sailcloth,
 * its leading (upper) cell orchil-dyed (bible: the Survey Kite's own make), on a line from a stake on the ridge above
 * the town's upper left (./saltrow-layout.js KITE). It flies in the morning in the trade (`KITE.hours`); calima and
 * squalls ground it (bible §2.3), and it is down by night.
 *
 *   const kite = new SightingKite(ctx, parent)   builds at once (no fetch)
 *   kite.update(dt)          sway on the wind, the line follows; shown only in its hours and weather
 *   kite.flying              whether it is up now
 *   kite.position            the kite's centre now (a Vector3; read only)
 *   kite.dispose()
 *
 * DRAWS: 2 while flying (the kite, merged, vertex-coloured; the line, 24 points), 0 when down (the group is hidden).
 * No shadow: it is 20 m up. Zero allocation per frame (the line's buffer is rewritten in place).
 */
const CANE = 0x9a7a4c, CLOTH = 0xe6dcc4, ORCHIL = 0x5e3a72, LINE = 0x2b2622;
const N_LINE = 24;
const _p = new THREE.Vector3();

function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.index) return geo.toNonIndexed();
  return geo;
}

/** The kite in its own frame: +y up the kite's long axis, +z downwind (the cells' open ends face the wind). */
function kiteGeometry() {
  const { h, w, cell } = KITE.size;
  const parts = [];
  const half = w / Math.SQRT2;                        // a diamond to the wind: corners on +-x and +-z
  const corners = [[half, 0], [0, half], [-half, 0], [0, -half]];
  // four longerons, corner to corner, the full height
  for (const [x, z] of corners) {
    const g = new THREE.CylinderGeometry(0.018, 0.018, h, 5, 1, true);
    g.translate(x, 0, z);
    parts.push(tint(g, CANE));
  }
  // two cross spars per cell, holding the diamond open
  for (const y of [h / 2 - cell / 2, -h / 2 + cell / 2]) {
    for (const rot of [0, Math.PI / 2]) {
      const g = new THREE.CylinderGeometry(0.012, 0.012, half * 2, 4, 1, true);
      g.rotateZ(Math.PI / 2); g.rotateY(rot); g.translate(0, y, 0);
      parts.push(tint(g, CANE));
    }
  }
  // the cells: a band of cloth round the four longerons at each end, open to the wind
  const band = (y, hex) => {
    const g = new THREE.CylinderGeometry(half, half, cell, 4, 1, true);   // a 4-sided open prism, corners on the axes
    g.translate(0, y, 0);
    parts.push(tint(g, hex));
  };
  band(h / 2 - cell / 2, ORCHIL);
  band(-h / 2 + cell / 2, CLOTH);
  for (let i = 0; i < parts.length; i++) {
    const g = parts[i];
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  }
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return geo;
}

export class SightingKite {
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'saltrow-kite';
    parent.add(this.group);
    this.t = 0;
    this.flying = false;
    const H = (x, z) => ctx.terrain?.getHeight?.(x, z) ?? 0;
    this.anchor = new THREE.Vector3(KITE.anchor.x, H(KITE.anchor.x, KITE.anchor.z) + 0.6, KITE.anchor.z);
    this.base = new THREE.Vector3(KITE.x, KITE.y, KITE.z);
    this.position = this.base.clone();

    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
    this.mat.name = 'CAL.saltrow-kite';
    this.kite = new THREE.Mesh(kiteGeometry(), this.mat);
    this.kite.name = 'saltrow-kite-body';
    this.kite.castShadow = false; this.kite.receiveShadow = false;
    this.kite.geometry.computeBoundingSphere();

    const lp = new Float32Array(N_LINE * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: 0.85 });
    this.lineMat.name = 'CAL.saltrow-kite-line';
    this.line = new THREE.Line(lg, this.lineMat);
    this.line.name = 'saltrow-kite-line';
    this.line.frustumCulled = false;
    this.group.add(this.kite, this.line);
    // the wind it flies in: the trade toward 225 (environment.wind), the kite's open cells face it
    this.windYaw = Math.atan2(-Math.SQRT1_2, Math.SQRT1_2);
    this.stats = { tris: this.kite.geometry.attributes.position.count / 3, draws: 2, lineM: +this.anchor.distanceTo(this.base).toFixed(1) };
    this.update(0);
  }

  _up() {
    const env = this.ctx.environment;
    if (!env) return true;
    const h = env.time ?? 9;
    const w = env.weather || 'trade';
    return h >= KITE.hours[0] && h <= KITE.hours[1] && w !== 'calima' && w !== 'squall';
  }

  update(dt = 0) {
    const up = this._up();
    this.flying = up;
    this.group.visible = up;
    if (!up) return;
    this.t += dt || 0;
    const t = this.t;
    // sway on the line: a slow figure of eight across the wind, a bob, a little roll
    const lat = 1.3 * Math.sin(t * 0.37) + 0.4 * Math.sin(t * 0.91 + 1.1);
    const bob = 0.7 * Math.sin(t * 0.74 + 0.6) + 0.25 * Math.sin(t * 1.63);
    const cx = Math.cos(this.windYaw), cz = -Math.sin(this.windYaw);   // across the wind
    this.position.set(this.base.x + cx * lat, this.base.y + bob, this.base.z + cz * lat);
    const k = this.kite;
    k.position.copy(this.position);
    // stand the long axis up, leaning back off the wind 28 deg; the diamond's corner into the wind; roll with the sway
    k.rotation.set(0, 0, 0);
    k.rotation.order = 'YXZ';
    k.rotation.y = this.windYaw;
    k.rotation.x = 0.49;
    k.rotation.z = 0.12 * Math.sin(t * 0.37 + 0.4);
    k.updateMatrix();
    // the line: from the stake to the bridle (the kite's front, 0.35 under its middle), with a sag
    const a = this.anchor;
    _p.set(0, -0.35, -0.3).applyEuler(k.rotation).add(this.position);
    const len = a.distanceTo(_p), sag = 0.035 * len;
    const arr = this.line.geometry.attributes.position.array;
    for (let i = 0; i < N_LINE; i++) {
      const u = i / (N_LINE - 1);
      arr[i * 3] = a.x + (_p.x - a.x) * u;
      arr[i * 3 + 1] = a.y + (_p.y - a.y) * u - sag * 4 * u * (1 - u);
      arr[i * 3 + 2] = a.z + (_p.z - a.z) * u;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.kite.geometry.dispose();
    this.line.geometry.dispose();
    this.mat.dispose();
    this.lineMat.dispose();
    this.group.removeFromParent();
  }
}
