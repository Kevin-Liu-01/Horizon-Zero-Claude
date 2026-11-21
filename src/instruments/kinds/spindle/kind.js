import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { liveKindClass } from '../kiln/live-kind.js';
import { SpindleRing, SPINDLE_RULES } from './rules.js';
import { SPINDLE_PARTS, SPINDLE_ROSTER, SPINDLE_RING, SPINDLE_LAMP } from './form.js';

/**
 * THE SPINDLE AS A LIVE KIND, IN ITS GREY FORM (Milestone 3 wave 3c, area C; BUILD M3.4, IK5). The owner has not ruled
 * on its ring (the "T" reading from the front, docs/STATE-M3.md wave 2's open list), so it has no surfaces yet: it is
 * the accepted grey form (./form.js SPINDLE_PARTS) built from code (0 bytes shipped), in the line-up's greys, with its
 * level ring spinning about the hub (SpindleRing: full speed 1.2 turns a second, stopped while Dust holds it).
 *
 * At the Yards it is the encounter's escort (./../kiln/yards.js puts the encounter's SpindleEscort pose on it: 6-9 m off
 * the awake Kiln, toward her when she is near). Its lamp: wary while it escorts, hostile while it sees her, calm when
 * the Yards are quiet.
 */
export const SPINDLE_ID = 'spindle';

const GREY = Object.freeze({ hull: 0x9b9893, joint: 0x5f5d5a, brass: 0x8c867b });
const UP = new THREE.Vector3(0, 1, 0);

function partGeometry(p) {
  let g = null;
  if (p.type === 'box') { g = new THREE.BoxGeometry(p.s[0], p.s[1], p.s[2]); g.translate(p.c[0], p.c[1], p.c[2]); }
  else if (p.type === 'cyl') {
    g = new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.h, 18, 1);
    if (p.axis === 'z') g.rotateX(Math.PI / 2); else if (p.axis === 'x') g.rotateZ(-Math.PI / 2);
    g.translate(p.c[0], p.c[1], p.c[2]);
  } else if (p.type === 'strut') {
    const a = new THREE.Vector3(...p.a), b = new THREE.Vector3(...p.b), d = b.clone().sub(a), L = Math.max(1e-3, d.length());
    g = new THREE.CylinderGeometry(p.r, p.r, L, 10, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z);
  } else if (p.type === 'torus') {
    g = new THREE.TorusGeometry(p.R, p.tube, 8, 48);
    if (p.axis === 'y') g.rotateX(Math.PI / 2); else if (p.axis === 'x') g.rotateY(Math.PI / 2);
    g.translate(p.c[0], p.c[1], p.c[2]);
  }
  if (!g) return null;
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  const c = new THREE.Color(GREY[p.tone] ?? GREY.hull), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** The grey Spindle as an asset entry ({ root, size, extras }: the normaliser's contract, built here). */
export function buildGreySpindle() {
  const body = [], ring = [];
  for (const p of SPINDLE_PARTS) {
    if (p.lamp) continue;
    const g = partGeometry(p);
    if (!g) continue;
    (p.name === 'ring' || /^spoke/.test(p.name) ? ring : body).push(g);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 });
  mat.name = 'spindle-grey';
  const src = new THREE.Group(); src.name = 'spindle-grey';
  const hull = new THREE.Mesh(mergeGeometries(body, false), mat); hull.name = 'spindle-hull';
  // the ring and its spokes spin about the hub's axis: their own node, its origin on the axis
  const rg = mergeGeometries(ring, false); rg.translate(-SPINDLE_RING.c[0], -SPINDLE_RING.c[1], -SPINDLE_RING.c[2]);
  const ringMesh = new THREE.Mesh(rg, mat); ringMesh.name = 'ring';
  ringMesh.position.set(SPINDLE_RING.c[0], SPINDLE_RING.c[1], SPINDLE_RING.c[2]);
  for (const m of [hull, ringMesh]) { m.castShadow = true; m.receiveShadow = true; }
  src.add(hull, ringMesh);
  for (const g of [...body, ...ring]) g.dispose();
  const inner = new THREE.Group(); inner.name = 'spindle-inner'; inner.add(src);
  const root = new THREE.Group(); root.name = 'spindle-root'; root.add(inner);
  return {
    root, size: new THREE.Vector3(SPINDLE_ROSTER.W, SPINDLE_ROSTER.H, SPINDLE_ROSTER.L), spec: { url: null, targetHeight: SPINDLE_ROSTER.H },
    extras: { r5Sockets: { lamp: SPINDLE_LAMP.at, lampR: SPINDLE_LAMP.r, lampShape: 'disc', lampAxis: [0, 0, 1] }, r5Tools: {}, grey: true },
    provenance: null, shadowCasters: [],
  };
}

const Base = liveKindClass({ id: SPINDLE_ID, displayName: 'Spindle', bodyRadius: 0.9, maxHealth: 700 });

export class SpindleLive extends Base {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, opts);
    this.ringRules = new SpindleRing();
    this.ringNode = this.nodes.ring || null;
  }

  /** Dust on it (the status seam: Clouded): the ring stops and the bearing is exposed (IK5). */
  onStatus(id, seconds) { this.ringRules.onStatus(id, seconds); return super.onStatus?.(id, seconds); }

  animateKind(dt) {
    this.ringRules.step(dt);
    this.ringRules.events.length = 0;
    if (this.ringNode) this.ringNode.rotation.y = this.ringRules.angle;
  }
}

export const SPINDLE_KIND = Object.freeze({ id: SPINDLE_ID, Cls: SpindleLive, sizeClass: SPINDLE_ROSTER.cls, height: SPINDLE_ROSTER.H, build: buildGreySpindle });
export { SPINDLE_RULES };
