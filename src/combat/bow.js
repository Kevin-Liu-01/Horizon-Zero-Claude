import * as THREE from 'three';
import { makeArrow, setArrowType, makeBombVisual } from './arrows.js';

/**
 * Procedural weapon models (spec v2 roster). Local space contract, shared by
 * every model: grip at origin, projectile flies along +Z, string/pouch pulls
 * along -Z (archer side). Each model exposes the surface the animator and
 * combat rely on: { group, model, pull, restZ, setDraw(d, showAmmo),
 * setArrowType(id), getNockWorld(d, out) }.
 *
 * `group` gets parented to the hand attach node; combat orients it in world
 * space every frame while wielded, so bone axes never matter.
 */

const woodDark = new THREE.MeshStandardMaterial({ color: 0x37291c, roughness: 0.55, metalness: 0.2 });
const woodPale = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.6, metalness: 0.12 });
const woodBlack = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.5, metalness: 0.25 });
const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x9c6a2e, metalness: 0.85, roughness: 0.32 });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x5c6670, metalness: 0.9, roughness: 0.38 });
const tealGlow = new THREE.MeshStandardMaterial({
  color: 0x06222e, emissive: 0x43d6ff, emissiveIntensity: 2.6, roughness: 0.4,
});
const amberGlow = new THREE.MeshStandardMaterial({
  color: 0x2e1d06, emissive: 0xffb043, emissiveIntensity: 2.4, roughness: 0.4,
});
const iceGlow = new THREE.MeshStandardMaterial({
  color: 0x0a2030, emissive: 0x9fd8ff, emissiveIntensity: 2.6, roughness: 0.4,
});
const redGlow = new THREE.MeshStandardMaterial({
  color: 0x2e0a06, emissive: 0xff4a22, emissiveIntensity: 2.6, roughness: 0.4,
});
// bright + faintly emissive so strings read over-shoulder at golden hour
const stringMat = new THREE.MeshStandardMaterial({
  color: 0xf3ead6, roughness: 0.55, emissive: 0x9a9078, emissiveIntensity: 0.6,
});
const leatherMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8, metalness: 0.05 });

const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
const STRING_R = 0.007;

const _mid = new THREE.Vector3();
const _d = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _nock = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const _s2 = new THREE.Vector3();

function setSegment(mesh, a, b, r) {
  _mid.addVectors(a, b).multiplyScalar(0.5);
  _d.subVectors(b, a);
  const len = Math.max(1e-5, _d.length());
  mesh.position.copy(_mid);
  mesh.scale.set(r, len, r);
  mesh.quaternion.setFromUnitVectors(_Y, _d.multiplyScalar(1 / len));
}

const NOOP = () => {};

/* --------------------------- shared base class --------------------------- */

class WeaponModel {
  constructor() {
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.model.rotation.z = 0.22; // HZD-style cant so bows never read edge-on
    this.model.position.y = -0.1; // grip sits in the palm
    this.group.add(this.model);
    this.restZ = 0.055;
    this.pull = 0.52;
  }

  _finish() {
    this.model.traverse((o) => { o.raycast = NOOP; });
    this.setDraw(0, true);
  }

  setDraw(_draw, _showAmmo) {}
  setArrowType(_type) {}

  /**
   * World position of the string nock / pouch / muzzle for a given draw 0..1.
   * Robust when the model is hidden or mid scale-in — falls back to a
   * unit-scale reconstruction at the hand attach point.
   */
  getNockWorld(draw, out) {
    this._nockLocal(draw, out);
    this.model.updateWorldMatrix(true, false);
    _s2.setFromMatrixScale(this.model.matrixWorld);
    if (this.group.visible && Math.min(_s2.x, _s2.y, _s2.z) > 0.5) {
      return this.model.localToWorld(out);
    }
    out.applyMatrix4(this.model.matrix);        // model offset + cant -> group
    out.applyQuaternion(this.group.quaternion); // group aim -> hand space
    const parent = this.group.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.matrixWorld.decompose(_p2, _q2, _s2);
      out.applyQuaternion(_q2).add(_p2);
    }
    return out;
  }

  _nockLocal(draw, out) {
    out.set(0, 0.018, this.restZ - draw * this.pull);
    return out;
  }
}

/* ------------------------------ recurve bows ----------------------------- */

/**
 * Parameterized recurve. opts:
 *   size (limb scale), curveK (recurve depth), limbR, bodyMat, accentMat,
 *   scope (sharpshot aperture bead), pull, name
 */
class RecurveBow extends WeaponModel {
  constructor(opts = {}) {
    super();
    const size = opts.size ?? 1;
    const curveK = opts.curveK ?? 1;
    const limbR = (opts.limbR ?? 0.022) * Math.sqrt(size);
    const bodyMat = opts.bodyMat ?? woodDark;
    const accentMat = opts.accentMat ?? tealGlow;
    this.group.name = opts.name ?? 'bow';
    this.pull = opts.pull ?? 0.52;

    // --- limbs: mirrored recurve spline
    const half = [
      [0.00, 0.030],
      [0.09, 0.055],
      [0.24, 0.135 * curveK],
      [0.44, 0.100 * curveK],
      [0.62, -0.030 * curveK],
      [0.74, 0.060], // hooked tip
    ];
    const pts = [];
    for (let i = half.length - 1; i >= 1; i--) {
      pts.push(new THREE.Vector3(0, -half[i][0] * size, half[i][1]));
    }
    for (let i = 0; i < half.length; i++) {
      pts.push(new THREE.Vector3(0, half[i][0] * size, half[i][1]));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
    const limbs = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, limbR, 7), bodyMat);
    limbs.castShadow = true;
    this.model.add(limbs);

    // --- riser / grip
    const riser = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.03, 0.2 * Math.min(size, 1.15), 3, 8), bronzeMat,
    );
    riser.position.set(0, 0, 0.035);
    riser.castShadow = true;
    this.model.add(riser);
    for (const y of [-0.115, 0.115]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.007, 6, 14), accentMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, y * Math.min(size, 1.15), 0.035);
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
    addBand(0.20, accentMat, limbR + 0.004, 0.05);
    addBand(0.80, accentMat, limbR + 0.004, 0.05);
    addBand(0.30, bronzeMat, limbR + 0.002, 0.10);
    addBand(0.70, bronzeMat, limbR + 0.002, 0.10);
    addBand(0.045, bronzeMat, limbR, 0.055);
    addBand(0.955, bronzeMat, limbR, 0.055);

    // --- sharpshot scope: aperture ring + glowing sight bead above the grip
    if (opts.scope) {
      const mount = new THREE.Mesh(unitCyl, ironMat);
      mount.scale.set(0.011, 0.075, 0.011);
      mount.position.set(0, 0.16 * size, 0.055);
      mount.rotation.x = 0.5;
      this.model.add(mount);
      const aperture = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 8, 20), ironMat);
      aperture.position.set(0, 0.19 * size, 0.085);
      this.model.add(aperture); // faces +Z: a sight ring down the arrow line
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), accentMat);
      bead.position.set(0, 0.19 * size, 0.085);
      this.model.add(bead);
    }

    // --- string: two segments from the tips to the (pullable) nock point
    this._tipTop = pts[pts.length - 1].clone();
    this._tipBot = pts[0].clone();
    this.strTop = new THREE.Mesh(unitCyl, stringMat);
    this.strBot = new THREE.Mesh(unitCyl, stringMat);
    this.model.add(this.strTop, this.strBot);

    // --- nocked arrow visual (cross-section fattened so it reads on screen)
    this.nockArrow = makeArrow();
    this.nockArrow.group.scale.set(1.6, 1.6, 1);
    this.model.add(this.nockArrow.group);

    this._finish();
  }

  setDraw(draw, showArrow) {
    const nz = this.restZ - draw * this.pull;
    _nock.set(0, 0.018, nz);
    setSegment(this.strTop, this._tipTop, _nock, STRING_R);
    setSegment(this.strBot, _nock, this._tipBot, STRING_R);
    this.nockArrow.group.visible = showArrow;
    if (showArrow) this.nockArrow.group.position.set(0, 0.018, nz);
  }

  setArrowType(type) {
    setArrowType(this.nockArrow, type);
  }
}

/* ------------------------------- blast sling ------------------------------ */

/**
 * Y-frame sling: two wood prongs, elastic cords to a leather pouch that
 * carries the bomb. Drawing pulls the pouch back along -Z.
 */
class BlastSling extends WeaponModel {
  constructor() {
    super();
    this.group.name = 'blast-sling';
    this.model.rotation.z = 0; // sling reads best upright
    this.pull = 0.4;
    this.restZ = 0.02;
    // pouch line sits at local y≈0.018 so the animator's string-hand math
    // (nock = hand + bow-up*0.018 + model offset) lands ON the pouch
    const POUCH_Y = 0.018;

    // handle down through the palm, fork rising above it
    const handle = new THREE.Mesh(unitCyl, woodPale);
    handle.scale.set(0.024, 0.34, 0.024);
    handle.position.set(0, -0.08, 0);
    handle.castShadow = true;
    this.model.add(handle);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 3, 8), leatherMat);
    grip.position.set(0, -0.13, 0);
    this.model.add(grip);

    // Y fork in X so the cords straddle the flight line; tips above the pouch
    this._forkTips = [];
    for (const s of [-1, 1]) {
      const prong = new THREE.Mesh(unitCyl, woodPale);
      const a = new THREE.Vector3(0, 0.06, 0);
      const b = new THREE.Vector3(s * 0.155, 0.24, 0.05);
      setSegment(prong, a, b, 0.018);
      prong.castShadow = true;
      this.model.add(prong);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), bronzeMat);
      cap.position.copy(b);
      this.model.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12), amberGlow);
      ring.position.copy(b);
      ring.rotation.y = Math.PI / 2;
      this.model.add(ring);
      this._forkTips.push(b);
    }

    // cords + pouch (hangs between/below the fork tips)
    this.cordL = new THREE.Mesh(unitCyl, stringMat);
    this.cordR = new THREE.Mesh(unitCyl, stringMat);
    this.model.add(this.cordL, this.cordR);
    this.pouch = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 7), leatherMat);
    this.pouch.scale.set(1, 0.72, 1.15);
    this.model.add(this.pouch);

    // bomb sits in the pouch while "nocked"
    this.bombVis = makeBombVisual('blast-bomb');
    this.bombVis.group.scale.setScalar(0.9);
    this.model.add(this.bombVis.group);

    this._pouchY = POUCH_Y;
    this._finish();
  }

  _nockLocal(draw, out) {
    out.set(0, this._pouchY ?? 0.018, this.restZ - draw * this.pull);
    return out;
  }

  setDraw(draw, showAmmo) {
    _nock.set(0, this._pouchY ?? 0.018, this.restZ - draw * this.pull - 0.04);
    setSegment(this.cordL, this._forkTips[0], _nock, STRING_R * 1.4);
    setSegment(this.cordR, this._forkTips[1], _nock, STRING_R * 1.4);
    this.pouch.position.copy(_nock);
    this.bombVis.group.visible = !!showAmmo;
    if (showAmmo) {
      this.bombVis.group.position.set(_nock.x, _nock.y + 0.012, _nock.z + 0.045);
    }
  }
}

/* ------------------------------ disc launcher ----------------------------- */

/** Chunky torn-off Thunderjaw disc launcher: barrel, drum, glowing core. */
class DiscLauncher extends WeaponModel {
  constructor() {
    super();
    this.group.name = 'disc-launcher';
    this.model.rotation.z = 0;
    this.model.position.set(0.02, -0.06, 0.05);
    this.pull = 0;
    this.restZ = 0.6;

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.09, 0.78, 10).rotateX(Math.PI / 2), ironMat,
    );
    barrel.position.set(0, 0.05, 0.25);
    barrel.castShadow = true;
    this.model.add(barrel);

    const shroudGeo = new THREE.CylinderGeometry(0.1, 0.105, 0.34, 10).rotateX(Math.PI / 2);
    const shroud = new THREE.Mesh(shroudGeo, woodBlack);
    shroud.position.set(0, 0.05, 0.1);
    shroud.castShadow = true;
    this.model.add(shroud);

    // side rails
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.62), ironMat);
      rail.position.set(s * 0.1, 0.05, 0.22);
      this.model.add(rail);
    }

    // ammo drum under the barrel
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.16, 10).rotateZ(Math.PI / 2), woodBlack,
    );
    drum.position.set(0, -0.06, 0.16);
    this.model.add(drum);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 14), redGlow);
      cap.position.set(s * 0.082, -0.06, 0.16);
      cap.rotation.y = Math.PI / 2;
      this.model.add(cap);
    }

    // muzzle ring + core glow
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 8, 16), ironMat);
    muzzle.position.set(0, 0.05, 0.64);
    this.model.add(muzzle);
    this.coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.011, 8, 16), redGlow);
    this.coreRing.position.set(0, 0.05, 0.645);
    this.model.add(this.coreRing);

    // rear grip block + shoulder hook
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.2), woodBlack);
    stock.position.set(0, 0.02, -0.16);
    this.model.add(stock);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.04), ironMat);
    hook.position.set(0, -0.02, -0.27);
    this.model.add(hook);

    // the disc peeking out of the muzzle while loaded
    this.discVis = makeBombVisual('disc');
    this.discVis.group.position.set(0, 0.05, 0.6);
    this.model.add(this.discVis.group);

    this._finish();
  }

  _nockLocal(_draw, out) {
    out.set(0, 0.05, 0.7); // muzzle
    return out;
  }

  setDraw(_draw, showAmmo) {
    this.discVis.group.visible = !!showAmmo;
  }
}

/* -------------------------------- factory -------------------------------- */

export function buildWeaponModel(id) {
  switch (id) {
    case 'sharpshot-bow':
      return new RecurveBow({
        name: id, size: 1.32, curveK: 1.05, limbR: 0.02,
        bodyMat: woodBlack, accentMat: amberGlow, scope: true, pull: 0.6,
      });
    case 'war-bow':
      return new RecurveBow({
        name: id, size: 0.74, curveK: 1.45, limbR: 0.024,
        bodyMat: woodPale, accentMat: iceGlow, pull: 0.44,
      });
    case 'blast-sling':
      return new BlastSling();
    case 'disc-launcher':
      return new DiscLauncher();
    case 'hunter-bow':
    default:
      return new RecurveBow({ name: 'hunter-bow' });
  }
}

/** Legacy export (round-1 name) — the hunter bow. */
export class Bow extends RecurveBow {
  constructor() { super({ name: 'bow' }); }
}
