import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/**
 * `combat-weapon-models-neon`. HZD's tribal bows are WOOD, LEATHER, BONE and
 * a little salvaged metal — the only thing that glows on them is the sight
 * bead of the Sharpshot and the salvaged Thunderjaw hardware. The Round 3
 * models banded every limb in a 2.6-intensity emissive, which read as a neon
 * toy at any distance. The accent slot is now a MATERIAL choice per bow (bone,
 * leather wrap, bronze) and the three `*Glow` materials are kept only for the
 * machine-salvage parts that earn them.
 */
const woodDark = new THREE.MeshStandardMaterial({ color: 0x37291c, roughness: 0.62, metalness: 0.08 });
const woodPale = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.68, metalness: 0.05 });
const woodBlack = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.58, metalness: 0.1 });
const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x8f6a34, metalness: 0.72, roughness: 0.44 });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x5c6670, metalness: 0.85, roughness: 0.42 });
/** Sun-bleached bone: limb tips, nock guards, inlays. */
const boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc2a4, roughness: 0.72, metalness: 0.02 });
const boneDarkMat = new THREE.MeshStandardMaterial({ color: 0xa2947a, roughness: 0.78, metalness: 0.02 });
/** Dyed leather binding — the Nora red-brown. */
const wrapMat = new THREE.MeshStandardMaterial({ color: 0x7a3a24, roughness: 0.85, metalness: 0.02 });
const wrapDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a2a1c, roughness: 0.88, metalness: 0.02 });
/** Salvaged machine hardware — the ONLY emissive left on a tribal weapon. */
const tealGlow = new THREE.MeshStandardMaterial({
  color: 0x06222e, emissive: 0x43d6ff, emissiveIntensity: 1.5, roughness: 0.4,
});
const amberGlow = new THREE.MeshStandardMaterial({
  color: 0x2e1d06, emissive: 0xffb043, emissiveIntensity: 1.6, roughness: 0.4,
});
const iceGlow = new THREE.MeshStandardMaterial({
  color: 0x0a2030, emissive: 0x9fd8ff, emissiveIntensity: 1.4, roughness: 0.4,
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
const _rideL = new THREE.Vector3();
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

/* ------------------------- static-part baking ----------------------------
 * Weapons are now ALWAYS on screen (stowed across Aloy's back when not
 * wielded), so every static detail part is baked into ONE mesh per material
 * instead of one mesh per part — the hunter bow drops from ~13 draw calls
 * to 4 (+2 dynamic string segments).
 */

const _tq = new THREE.Quaternion();

/** Unit cylinder from a to b with radius r, baked into geometry space. */
function segGeo(a, b, r, radial = 5) {
  const g = new THREE.CylinderGeometry(1, 1, 1, radial, 1);
  _d.subVectors(b, a);
  const len = Math.max(1e-5, _d.length());
  g.scale(r, len, r);
  _tq.setFromUnitVectors(_Y, _d.multiplyScalar(1 / len));
  g.applyQuaternion(_tq);
  _mid.addVectors(a, b).multiplyScalar(0.5);
  g.translate(_mid.x, _mid.y, _mid.z);
  return g;
}

/**
 * Merge pre-transformed geometries into a single mesh.
 *
 * The SOURCE geometries are disposed the moment they have been merged. Seven
 * weapon models bake ~250 throwaway primitives between them, and every one of
 * them kept its position/normal/uv typed arrays alive for the whole session
 * because `mergeGeometries` copies out of them and nothing ever told them they
 * were finished. They are never uploaded, so this is pure JS heap — but it is
 * heap held by nothing, which is the definition this lane is cleaning up.
 *
 * `userData.ownGeo` marks the result as this model's own buffer (as opposed to
 * `unitCyl` or the shared arrow geometries) so teardown knows what it may free.
 */
function bakeMesh(mat, parts, shadow = false) {
  // length 0 still goes through mergeGeometries (an empty geometry), exactly
  // as before — a couple of the weapon builds hand it an empty accent list.
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (parts.length > 1) for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = shadow;
  mesh.userData.ownGeo = true;
  return mesh;
}

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

  /**
   * Teardown. Materials and the `unitCyl` / arrow geometries are shared module
   * singletons across all seven models, so only the buffers this model baked
   * for itself are freed here; `disposeArrowAssets()` (arrows.js) owns the
   * rest, and `Combat.dispose()` calls both in the right order.
   */
  dispose() {
    this.group.parent?.remove(this.group);
    this.model.traverse((o) => {
      if (o.isMesh && o.userData.ownGeo && o.geometry) o.geometry.dispose();
    });
  }

  /** Scene footprint of this model — constant for the life of the session. */
  audit() {
    let meshes = 0, own = 0;
    this.model.traverse((o) => { if (o.isMesh || o.isSprite) meshes++;
      if (o.userData.ownGeo) own++; });
    return { meshes, ownGeo: own, inScene: this.group.parent ? 1 : 0 };
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

    // --- static detail, baked per material (see bakeMesh note above)
    const bronzeParts = [];
    const accentParts = [];
    const ironParts = [];

    // riser: a leather-wrapped grip, not a bronze bar
    const wrapParts = [
      new THREE.CapsuleGeometry(0.031, 0.19 * Math.min(size, 1.15), 3, 8)
        .translate(0, 0, 0.035),
    ];
    // ...bound top and bottom with bone nock guards
    for (const y of [-0.115, 0.115]) {
      accentParts.push(
        new THREE.TorusGeometry(0.033, 0.008, 6, 14)
          .rotateX(Math.PI / 2)
          .translate(0, y * Math.min(size, 1.15), 0.035),
      );
    }
    // a couple of cross-lashings so the grip reads as bound leather up close
    for (const y of [-0.06, 0, 0.06]) {
      bronzeParts.push(
        new THREE.TorusGeometry(0.032, 0.004, 5, 12)
          .rotateX(Math.PI / 2)
          .translate(0, y * Math.min(size, 1.15), 0.035),
      );
    }

    // limb detail: bronze inlays mid-limb, glowing accents near tips
    const tangent = new THREE.Vector3();
    const addBand = (u, arr, r, h) => {
      const p = curve.getPointAt(u);
      curve.getTangentAt(u, tangent);
      const g = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
      g.scale(r, h, r);
      _tq.setFromUnitVectors(_Y, tangent);
      g.applyQuaternion(_tq);
      g.translate(p.x, p.y, p.z);
      arr.push(g);
    };
    addBand(0.20, accentParts, limbR + 0.004, 0.05);
    addBand(0.80, accentParts, limbR + 0.004, 0.05);
    addBand(0.30, bronzeParts, limbR + 0.002, 0.10);
    addBand(0.70, bronzeParts, limbR + 0.002, 0.10);
    addBand(0.045, bronzeParts, limbR, 0.055);
    addBand(0.955, bronzeParts, limbR, 0.055);

    // sharpshot scope: salvaged machine aperture + the one glowing sight bead
    const beadParts = [];
    if (opts.scope) {
      ironParts.push(
        new THREE.CylinderGeometry(1, 1, 1, 5, 1)
          .scale(0.011, 0.075, 0.011)
          .rotateX(0.5)
          .translate(0, 0.16 * size, 0.055),
        // faces +Z: a sight ring down the arrow line
        new THREE.TorusGeometry(0.036, 0.008, 8, 20)
          .translate(0, 0.19 * size, 0.085),
      );
      beadParts.push(
        new THREE.SphereGeometry(0.010, 8, 6).translate(0, 0.19 * size, 0.085),
      );
    }

    this.model.add(bakeMesh(opts.lashMat ?? boneDarkMat, bronzeParts));
    this.model.add(bakeMesh(accentMat, accentParts));
    this.model.add(bakeMesh(opts.wrapMat ?? wrapMat, wrapParts));
    if (ironParts.length) this.model.add(bakeMesh(ironMat, ironParts));
    if (beadParts.length) this.model.add(bakeMesh(opts.beadMat ?? amberGlow, beadParts));

    // --- string: two segments from the tips to the (pullable) nock point
    this._tipTop = pts[pts.length - 1].clone();
    this._tipBot = pts[0].clone();
    this.strTop = new THREE.Mesh(unitCyl, stringMat);
    this.strBot = new THREE.Mesh(unitCyl, stringMat);
    this.model.add(this.strTop, this.strBot);

    /**
     * --- nocked arrow visual.
     *
     * `docs/ROUND4-CHARACTER.md` §9.8, both findings, applied here:
     *   - the old `scale(1.6, 1.6, 1)` blew three 4.6 cm fletches into a 16 cm
     *     opaque white vane cluster sitting exactly on her cheek anchor — the
     *     largest object in every draw frame. Scale is now 1;
     *   - `ARROW_LEN` 0.78 against `pull` 0.465 left 0.315 m of shaft hanging
     *     in front of the riser at full draw. `makeArrow({ nock: true })`
     *     builds the SHORT variant sized to the pull, which is the change this
     *     lane can absorb without costing the animator any draw length.
     */
    this.nockArrow = makeArrow({ nock: true });
    this.model.add(this.nockArrow.group);
    /** World point the arrow tail should ride (the animator's string hand). */
    this._ride = null;

    this._finish();
  }

  /**
   * `combat.nockLanded` handoff: while the string hand is still travelling
   * from the hip quiver to the string, the ARROW rides the hand instead of
   * floating on a string that has not been touched yet. `p` is a world-space
   * point (or null to release). The geometric nock (`getNockWorld`) is NOT
   * changed by this — the animator IK targets that, and feeding it back would
   * close a loop (docs/ROUND4-CHARACTER.md §8.4).
   */
  setNockRide(p) {
    if (!p) { this._ride = null; return; }
    if (!this._ride) this._ride = new THREE.Vector3();
    this._ride.copy(p);
  }

  setDraw(draw, showArrow) {
    const nz = this.restZ - draw * this.pull;
    _nock.set(0, 0.018, nz);
    setSegment(this.strTop, this._tipTop, _nock, STRING_R);
    setSegment(this.strBot, _nock, this._tipBot, STRING_R);
    this.nockArrow.group.visible = showArrow;
    if (!showArrow) return;
    if (this._ride) {
      // world -> model local; the shaft keeps pointing +Z down the arrow line
      _rideL.copy(this._ride);
      this.model.updateWorldMatrix(true, false);
      this.model.worldToLocal(_rideL);
      // never let a bad bone transform throw the arrow across the map
      if (Number.isFinite(_rideL.x) && _rideL.lengthSq() < 4) {
        this.nockArrow.group.position.copy(_rideL);
        return;
      }
    }
    this.nockArrow.group.position.set(0, 0.018, nz);
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

    // handle + Y fork baked into one wood mesh; caps/rings baked per material
    const woodParts = [
      new THREE.CylinderGeometry(1, 1, 1, 5, 1)
        .scale(0.024, 0.34, 0.024)
        .translate(0, -0.08, 0),
    ];
    const bronzeParts = [];
    const amberParts = [];
    this._forkTips = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(0, 0.06, 0);
      const b = new THREE.Vector3(s * 0.155, 0.24, 0.05);
      woodParts.push(segGeo(a, b, 0.018));
      bronzeParts.push(new THREE.SphereGeometry(0.022, 8, 6).translate(b.x, b.y, b.z));
      amberParts.push(
        new THREE.TorusGeometry(0.03, 0.007, 6, 12)
          .rotateY(Math.PI / 2)
          .translate(b.x, b.y, b.z),
      );
      this._forkTips.push(b);
    }
    this.model.add(bakeMesh(woodPale, woodParts, true));
    this.model.add(bakeMesh(bronzeMat, bronzeParts));
    this.model.add(bakeMesh(amberGlow, amberParts));
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 3, 8), leatherMat);
    grip.position.set(0, -0.13, 0);
    this.model.add(grip);

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

    // barrel + rails + muzzle + hook (iron), shroud + drum + stock (black
    // composite), drum caps + core ring (glow) — one baked mesh per material
    const ironParts = [
      new THREE.CylinderGeometry(0.075, 0.09, 0.78, 10)
        .rotateX(Math.PI / 2).translate(0, 0.05, 0.25),
      new THREE.BoxGeometry(0.02, 0.05, 0.62).translate(-0.1, 0.05, 0.22),
      new THREE.BoxGeometry(0.02, 0.05, 0.62).translate(0.1, 0.05, 0.22),
      new THREE.TorusGeometry(0.085, 0.014, 8, 16).translate(0, 0.05, 0.64),
      new THREE.BoxGeometry(0.07, 0.16, 0.04).translate(0, -0.02, -0.27),
    ];
    const blackParts = [
      new THREE.CylinderGeometry(0.1, 0.105, 0.34, 10)
        .rotateX(Math.PI / 2).translate(0, 0.05, 0.1),
      new THREE.CylinderGeometry(0.085, 0.085, 0.16, 10)
        .rotateZ(Math.PI / 2).translate(0, -0.06, 0.16),
      new THREE.BoxGeometry(0.09, 0.12, 0.2).translate(0, 0.02, -0.16),
    ];
    const glowParts = [
      new THREE.TorusGeometry(0.055, 0.012, 6, 14)
        .rotateY(Math.PI / 2).translate(-0.082, -0.06, 0.16),
      new THREE.TorusGeometry(0.055, 0.012, 6, 14)
        .rotateY(Math.PI / 2).translate(0.082, -0.06, 0.16),
      new THREE.TorusGeometry(0.062, 0.011, 8, 16).translate(0, 0.05, 0.645),
    ];
    this.model.add(bakeMesh(ironMat, ironParts, true));
    this.model.add(bakeMesh(woodBlack, blackParts));
    this.model.add(bakeMesh(redGlow, glowParts));

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

/* ------------------------- ropecaster / tripcaster ------------------------ */

/**
 * Shared chassis for the two "caster" weapons (`combat-roster-missing`): a
 * shouldered stock, a heavy horizontal bow-arm bolted across the front, and a
 * spool/rack under the barrel. `spoolMat` and `railMat` are the difference
 * between them; both draw in 4 baked meshes.
 */
class CasterWeapon extends WeaponModel {
  constructor(opts = {}) {
    super();
    this.group.name = opts.name ?? 'caster';
    this.model.rotation.z = 0;
    this.model.position.set(0.01, -0.07, 0.02);
    this.pull = opts.pull ?? 0.16;
    this.restZ = opts.restZ ?? 0.28;

    const wood = [
      // stock / body
      new THREE.BoxGeometry(0.075, 0.10, 0.52).translate(0, 0.02, 0.12),
      // shoulder brace
      new THREE.BoxGeometry(0.065, 0.15, 0.11).translate(0, -0.02, -0.19),
    ];
    const iron = [
      // barrel channel
      new THREE.CylinderGeometry(0.026, 0.03, 0.46, 8)
        .rotateX(Math.PI / 2).translate(0, 0.075, 0.24),
      // trigger guard
      new THREE.TorusGeometry(0.036, 0.008, 6, 12)
        .rotateY(Math.PI / 2).translate(0, -0.075, 0.02),
    ];
    const bone = [];
    const accent = [];

    // the cross bow-arm: two swept limbs, tips carry the cord
    this._tips = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(s * 0.035, 0.075, 0.34);
      const b = new THREE.Vector3(s * 0.30, 0.055, 0.30);
      iron.push(segGeo(a, b, 0.014, 6));
      bone.push(new THREE.SphereGeometry(0.021, 8, 6).translate(b.x, b.y, b.z));
      this._tips.push(b);
    }

    // spool / magazine under the barrel — the weapon's signature silhouette
    if (opts.spool) {
      accent.push(
        new THREE.CylinderGeometry(0.072, 0.072, 0.075, 12)
          .rotateZ(Math.PI / 2).translate(0, -0.045, 0.20),
        new THREE.TorusGeometry(0.072, 0.009, 6, 14)
          .rotateY(Math.PI / 2).translate(-0.038, -0.045, 0.20),
        new THREE.TorusGeometry(0.072, 0.009, 6, 14)
          .rotateY(Math.PI / 2).translate(0.038, -0.045, 0.20),
      );
    } else {
      // tripcaster: a rack of wire canisters
      for (let i = 0; i < 3; i++) {
        accent.push(new THREE.CylinderGeometry(0.021, 0.021, 0.10, 7)
          .rotateZ(Math.PI / 2).translate(0, -0.045, 0.10 + i * 0.075));
      }
    }

    this.model.add(bakeMesh(woodPale, wood, true));
    this.model.add(bakeMesh(ironMat, iron, true));
    this.model.add(bakeMesh(boneMat, bone));
    this.model.add(bakeMesh(opts.accentMat ?? wrapMat, accent));

    // cord across the bow-arm tips, pulled by `setDraw`
    this.cordL = new THREE.Mesh(unitCyl, stringMat);
    this.cordR = new THREE.Mesh(unitCyl, stringMat);
    this.model.add(this.cordL, this.cordR);

    // what is loaded, riding the cord
    this.load = new THREE.Mesh(
      opts.spool
        ? new THREE.CylinderGeometry(0.024, 0.024, 0.13, 8).rotateX(Math.PI / 2)
        : new THREE.BoxGeometry(0.035, 0.035, 0.16),
      opts.spool ? boneDarkMat : (opts.accentMat ?? wrapMat),
    );
    this.model.add(this.load);
    this._finish();
  }

  _nockLocal(draw, out) {
    out.set(0, 0.075, this.restZ - draw * this.pull);
    return out;
  }

  setDraw(draw, showAmmo) {
    _nock.set(0, 0.075, this.restZ - draw * this.pull);
    setSegment(this.cordL, this._tips[0], _nock, STRING_R * 1.6);
    setSegment(this.cordR, this._tips[1], _nock, STRING_R * 1.6);
    this.load.visible = !!showAmmo;
    if (showAmmo) this.load.position.set(_nock.x, _nock.y, _nock.z + 0.07);
  }
}

class Ropecaster extends CasterWeapon {
  constructor() {
    super({ name: 'ropecaster', spool: true, accentMat: wrapMat, pull: 0.2, restZ: 0.30 });
  }
}
class Tripcaster extends CasterWeapon {
  constructor() {
    super({ name: 'tripcaster', spool: false, accentMat: bronzeMat, pull: 0.12, restZ: 0.26 });
  }
}

/* ---------------------------------- spear --------------------------------- */

/**
 * Aloy's spear (`combat-melee-missing`). Ash haft, leather grip wraps, bone
 * ferrules and a salvaged machine blade with the override prongs at the base.
 * Local space: butt at origin, blade along +Z, total ~1.85 m.
 *
 * Returned as `{ group, model, length, blade }` — `melee.js` parents `group`
 * to the right-hand attach and animates `model`.
 */
export function buildSpear() {
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  const L = 1.85;

  const wood = [
    new THREE.CylinderGeometry(0.014, 0.017, L * 0.76, 6, 1)
      .rotateX(Math.PI / 2).translate(0, 0, L * 0.38),
  ];
  const wraps = [];
  for (const z of [0.16, 0.30, 0.44]) {
    wraps.push(new THREE.CylinderGeometry(0.021, 0.021, 0.075, 7, 1)
      .rotateX(Math.PI / 2).translate(0, 0, z));
  }
  const bone = [
    // butt cap
    new THREE.SphereGeometry(0.021, 8, 6).translate(0, 0, 0.012),
    // ferrule under the head
    new THREE.CylinderGeometry(0.023, 0.019, 0.09, 8, 1)
      .rotateX(Math.PI / 2).translate(0, 0, L * 0.755),
  ];
  const iron = [
    // leaf blade: two tapered wedges back to back
    new THREE.ConeGeometry(0.042, 0.30, 4)
      .rotateX(Math.PI / 2).translate(0, 0, L * 0.925),
    new THREE.ConeGeometry(0.042, 0.10, 4)
      .rotateX(-Math.PI / 2).translate(0, 0, L * 0.80),
  ];
  // override prongs — the machine hardware lashed to the haft
  const prong = [];
  for (const s of [-1, 1]) {
    prong.push(new THREE.BoxGeometry(0.012, 0.05, 0.16)
      .translate(s * 0.036, 0, L * 0.735));
  }
  const glow = [
    new THREE.TorusGeometry(0.026, 0.006, 6, 14).translate(0, 0, L * 0.70),
  ];

  model.add(bakeMesh(woodPale, wood, true));
  model.add(bakeMesh(wrapDarkMat, wraps));
  model.add(bakeMesh(boneMat, bone));
  const blade = bakeMesh(ironMat, iron, true);
  model.add(blade);
  model.add(bakeMesh(bronzeMat, prong));
  model.add(bakeMesh(tealGlow, glow));

  model.traverse((o) => { o.raycast = NOOP; });
  return { group, model, length: L, blade };
}

/* -------------------------------- factory -------------------------------- */

export function buildWeaponModel(id) {
  switch (id) {
    case 'sharpshot-bow':
      // long, black-ash, bone-tipped, one amber sight bead
      return new RecurveBow({
        name: id, size: 1.32, curveK: 1.05, limbR: 0.02,
        bodyMat: woodBlack, accentMat: boneMat, wrapMat: wrapDarkMat,
        lashMat: bronzeMat, beadMat: amberGlow, scope: true, pull: 0.6,
      });
    case 'war-bow':
      // short, thick, heavily bound — bone limb caps, no glow at all
      return new RecurveBow({
        name: id, size: 0.74, curveK: 1.45, limbR: 0.024,
        bodyMat: woodPale, accentMat: boneDarkMat, wrapMat: wrapMat,
        lashMat: boneMat, pull: 0.44,
      });
    case 'blast-sling':
      return new BlastSling();
    case 'ropecaster':
      return new Ropecaster();
    case 'tripcaster':
      return new Tripcaster();
    case 'disc-launcher':
      return new DiscLauncher();
    case 'hunter-bow':
    default:
      // the Nora starter: dark ash, red leather grip, bone nock guards
      return new RecurveBow({
        name: 'hunter-bow', accentMat: boneMat,
        wrapMat: wrapMat, lashMat: boneDarkMat,
      });
  }
}

/** Legacy export (round-1 name) — the hunter bow. */
export class Bow extends RecurveBow {
  constructor() { super({ name: 'bow' }); }
}
