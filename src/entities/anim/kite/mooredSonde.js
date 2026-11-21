import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SONDE_PARTS, SONDE_ROSTER } from '../../../instruments/kinds/sonde/form.js';

/**
 * THE MOORED SONDE, A STAND-IN (Milestone 3 wave 3b, area B), for "A Line Over the Glass" (src/game/hour2/glass-line.js)
 * and its 'tether' stage; the mesh lives here because src/game/ never imports three. Until area C's Sonde stands at the
 * Sounding Ring as a kind (`machines.canSpawn('sonde')`), the quest moors this: area C's own form
 * (src/instruments/kinds/sonde/form.js SONDE_PARTS, its blockout parts, read and built here from code: 0 bytes shipped)
 * hanging on its 18 m line over an iron mooring stake, 22 m off the Ring on bearing 060 (MOORING in
 * src/game/hour2/glass-line-plan.js: the Ring's tilted face overhangs its foot, and a walk to its centre stops under it).
 * It is not an Instrument: no brain, no sight, no hit parts; the quest's prompt at the stake cuts the line (the stage's
 * own event), and the hull rises and drifts downwind out of sight, then is gone.
 *
 *   const s = new MooredSonde(ctx, { x, z })   built and added to ctx.scene
 *   s.update(dt)                               the hull rides its line (a slow bob and sway), or drifts once cut
 *   s.cut()                                    the line parts here; true the first time
 *   s.dispose()
 *
 * The lamp is the calm token (#F2EAD3, unlit, so it reads as its token); the enamel, gunmetal and brass are the surfaced
 * Instruments' (area C). One material with vertex colours for the hull and the stake, the lamp and the line their own.
 */
const TONE = Object.freeze({
  enamel: '#d9d4c7', joint: '#3b3f44', brass: '#a8843f', stake: '#2f3236',
});
const LAMP_CALM = '#F2EAD3';
/** the wind's bearing (it comes FROM 045: the trade) and the line's lean off the vertical (rad) */
const FROM_DEG = 45, LEAN = 0.35;
/** m of rise and drift a second once the line is cut; s until the hull is taken out of the world */
const RISE_MS = 1.4, DRIFT_MS = 3.5, GONE_S = 30;

const _up = new THREE.Vector3(0, 1, 0);

function partGeometry(p) {
  let g;
  if (p.type === 'box') {
    g = new THREE.BoxGeometry(p.s[0], p.s[1], p.s[2]);
    g.translate(p.c[0], p.c[1], p.c[2]);
  } else if (p.type === 'cyl') {
    // r at the axis' negative end, r2 at its positive end (form.js)
    g = new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.h, 18, 1);
    if (p.axis === 'z') g.rotateX(Math.PI / 2);
    else if (p.axis === 'x') g.rotateZ(-Math.PI / 2);
    g.translate(p.c[0], p.c[1], p.c[2]);
  } else if (p.type === 'strut') {
    const a = new THREE.Vector3(...p.a), b = new THREE.Vector3(...p.b), d = b.clone().sub(a), L = Math.max(1e-3, d.length());
    g = new THREE.CylinderGeometry(p.r, p.r, L, 6, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    g.translate(m.x, m.y, m.z);
  } else return null;
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(TONE[p.tone] || TONE.enamel);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

/** The hull from area C's parts (the lamp apart, so it keeps its token). */
function buildHull() {
  const geos = [];
  let lamp = null;
  for (const p of SONDE_PARTS) {
    if (p.lamp) { lamp = p; continue; }
    const g = partGeometry(p);
    if (g) geos.push(g);
  }
  return { geo: mergeGeometries(geos, false), lamp };
}

/** The stake: an iron post with a brass ring at its head (1.3 m). */
function buildStake() {
  const parts = [
    { type: 'cyl', c: [0, 0.6, 0], r: 0.07, h: 1.3, axis: 'y', tone: 'stake' },
    { type: 'cyl', c: [0, 1.22, 0], r: 0.11, h: 0.06, axis: 'y', tone: 'brass' },
    { type: 'box', c: [0, 0.04, 0], s: [0.5, 0.08, 0.5], tone: 'stake' },
  ];
  return mergeGeometries(parts.map(partGeometry), false);
}

export class MooredSonde {
  constructor(ctx, at) {
    this.ctx = ctx;
    const gy = ctx.terrain?.getHeight?.(at.x, at.z) ?? 0;
    this.at = { x: at.x, y: gy, z: at.z };
    this.free = false;
    this.t = 0;
    this.freeT = 0;
    this.gone = false;
    const mat = (this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.15 }));
    const group = (this.group = new THREE.Group());
    group.name = 'glass-line-sonde-standin';
    const stake = new THREE.Mesh(buildStake(), mat);
    stake.position.set(at.x, gy, at.z);
    stake.castShadow = true; stake.receiveShadow = true;
    group.add(stake);
    const { geo, lamp } = buildHull();
    const hull = (this.hull = new THREE.Group());
    const hm = new THREE.Mesh(geo, mat);
    hm.castShadow = true;
    hull.add(hm);
    if (lamp) {
      const lg = new THREE.CylinderGeometry(lamp.r, lamp.r, lamp.h, 14, 1);
      lg.translate(lamp.c[0], lamp.c[1], lamp.c[2]);
      this.lampMat = new THREE.MeshBasicMaterial({ color: LAMP_CALM, toneMapped: false });
      hull.add(new THREE.Mesh(lg, this.lampMat));
    }
    group.add(hull);
    // the line: a thin cylinder from the keel ring to the stake's ring, laid every frame
    this.lineMat = new THREE.MeshStandardMaterial({ color: TONE.joint, roughness: 0.8 });
    const lineGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1);
    lineGeo.translate(0, 0.5, 0);
    this.line = new THREE.Mesh(lineGeo, this.lineMat);
    group.add(this.line);
    // the keel ring in the hull's frame, and where the hull rides: downwind of the stake on its leaning line
    const keel = SONDE_PARTS.find((p) => p.name === 'keelRing');
    this.keel = new THREE.Vector3(...(keel ? keel.c : [0, 0.25, 0.3]));
    const from = FROM_DEG * Math.PI / 180, L = SONDE_ROSTER.tetherM ?? 18;
    this.down = { x: -Math.sin(from), z: Math.cos(from) };   // toward 225 (engine x = E, z = -N)
    this.ride = { x: at.x + this.down.x * L * Math.sin(LEAN), y: gy + 1.25 + L * Math.cos(LEAN), z: at.z + this.down.z * L * Math.sin(LEAN) };
    this.yaw = Math.atan2(Math.sin(from), -Math.cos(from));  // the nose into the wind (body +z toward 045)
    this.pos = new THREE.Vector3(this.ride.x, this.ride.y, this.ride.z);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._q = new THREE.Quaternion();
    ctx.scene?.add(group);
    this.update(0);
  }

  /** The line parts at the stake. True the first time. */
  cut() {
    if (this.free) return false;
    this.free = true;
    this.freeT = 0;
    this.line.visible = false;
    return true;
  }

  update(dt) {
    if (this.gone) return;
    this.t += dt;
    const h = this.hull;
    if (!this.free) {
      // the hull rides its line: a slow bob and a little sway about the wind
      this.pos.set(this.ride.x, this.ride.y + Math.sin(this.t * 0.7) * 0.18, this.ride.z);
      h.rotation.set(Math.sin(this.t * 0.45) * 0.03, this.yaw + Math.sin(this.t * 0.31) * 0.05, Math.sin(this.t * 0.53) * 0.025);
    } else {
      this.freeT += dt;
      this.pos.x += this.down.x * DRIFT_MS * dt; this.pos.z += this.down.z * DRIFT_MS * dt;
      this.pos.y += RISE_MS * dt;
      h.rotation.z = Math.sin(this.freeT * 0.9) * 0.08;
      if (this.freeT > GONE_S) { this.dispose(); return; }
    }
    // the hull hangs from its keel ring: the ring sits on the line's end
    h.position.copy(this.pos).sub(this._a.copy(this.keel).applyEuler(h.rotation));
    if (!this.free) {
      const a = this._a.copy(this.keel).applyEuler(h.rotation).add(h.position);
      const b = this._b.set(this.at.x, this.at.y + 1.24, this.at.z);
      const d = a.sub(b), L = d.length();
      this.line.position.copy(b);
      this.line.quaternion.copy(this._q.setFromUnitVectors(_up, d.normalize()));
      this.line.scale.set(1, L, 1);
    }
  }

  dispose() {
    if (this.gone) return;
    this.gone = true;
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.mat.dispose(); this.lineMat.dispose(); this.lampMat?.dispose();
  }
}
