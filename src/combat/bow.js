import * as THREE from 'three';
import { makeArrow, setArrowType } from './arrows.js';

/**
 * Procedural recurve bow. Local space: grip at origin, limbs along ±Y,
 * arrow flies along +Z, string on the -Z (archer) side.
 * `group` gets parented to the hand attach node; combat orients it in world
 * space every frame while aiming, so bone axes never matter.
 */

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x37291c, roughness: 0.55, metalness: 0.2 });
const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x9c6a2e, metalness: 0.85, roughness: 0.32 });
const accentMat = new THREE.MeshStandardMaterial({
  color: 0x06222e, emissive: 0x43d6ff, emissiveIntensity: 2.6, roughness: 0.4,
});
const stringMat = new THREE.MeshStandardMaterial({ color: 0xd8d0be, roughness: 0.9 });

const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 5, 1);

const _mid = new THREE.Vector3();
const _d = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _nock = new THREE.Vector3();

function setSegment(mesh, a, b, r) {
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _d.subVectors(b, a);
  const len = Math.max(1e-5, _d.length());
  mesh.position.copy(_mid);
  mesh.scale.set(r, len, r);
  mesh.quaternion.setFromUnitVectors(_Y, _d.multiplyScalar(1 / len));
}

export class Bow {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'bow';
    this.model = new THREE.Group();
    this.model.rotation.z = 0.14; // slight HZD-style cant
    this.group.add(this.model);

    // --- limbs: mirrored recurve spline
    const half = [
      [0.00, 0.030],
      [0.09, 0.055],
      [0.24, 0.135],
      [0.44, 0.100],
      [0.62, -0.030],
      [0.74, 0.060], // hooked tip
    ];
    const pts = [];
    for (let i = half.length - 1; i >= 1; i--) pts.push(new THREE.Vector3(0, -half[i][0], half[i][1]));
    for (let i = 0; i < half.length; i++) pts.push(new THREE.Vector3(0, half[i][0], half[i][1]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
    const limbs = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.019, 7), bodyMat);
    limbs.castShadow = true;
    this.model.add(limbs);

    // --- riser / grip
    const riser = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 3, 8), bronzeMat);
    riser.position.set(0, 0, 0.035);
    riser.castShadow = true;
    this.model.add(riser);
    for (const y of [-0.115, 0.115]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.007, 6, 14), accentMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, y, 0.035);
      this.model.add(ring);
    }

    // --- limb detail: bronze inlays mid-limb, glowing accents near tips
    const tangent = new THREE.Vector3();
    const addBand = (u, mat, r, h) => {
      const p = curve.getPointAt(u);
      curve.getTangentAt(u, tangent);
      const band = new THREE.Mesh(unitCyl, mat);
      band.position.copy(p);
      band.scale.set(r, h, r);
      band.quaternion.setFromUnitVectors(_Y, tangent);
      this.model.add(band);
    };
    addBand(0.20, accentMat, 0.026, 0.05);
    addBand(0.80, accentMat, 0.026, 0.05);
    addBand(0.30, bronzeMat, 0.024, 0.10);
    addBand(0.70, bronzeMat, 0.024, 0.10);
    addBand(0.045, bronzeMat, 0.022, 0.055);
    addBand(0.955, bronzeMat, 0.022, 0.055);

    // --- string: two segments from the tips to the (pullable) nock point
    this._tipTop = pts[pts.length - 1].clone();
    this._tipBot = pts[0].clone();
    this.strTop = new THREE.Mesh(unitCyl, stringMat);
    this.strBot = new THREE.Mesh(unitCyl, stringMat);
    this.model.add(this.strTop, this.strBot);

    // --- nocked arrow visual
    this.nockArrow = makeArrow();
    this.model.add(this.nockArrow.group);

    this.restZ = 0.055;
    this.pull = 0.52;

    this.model.traverse((o) => { o.raycast = () => {}; });
    this.setDraw(0, true);
  }

  /** draw 0..1; showArrow toggles the nocked arrow visual. */
  setDraw(draw, showArrow) {
    const nz = this.restZ - draw * this.pull;
    _nock.set(0, 0.018, nz);
    setSegment(this.strTop, this._tipTop, _nock, 0.0042);
    setSegment(this.strBot, _nock, this._tipBot, 0.0042);
    this.nockArrow.group.visible = showArrow;
    if (showArrow) this.nockArrow.group.position.set(0, 0.018, nz);
  }

  setArrowType(type) {
    setArrowType(this.nockArrow, type);
  }

  /** World position of the nock (arrow tail) for a given draw. */
  getNockWorld(draw, out) {
    out.set(0, 0.018, this.restZ - draw * this.pull);
    this.model.updateWorldMatrix(true, false);
    return this.model.localToWorld(out);
  }
}
