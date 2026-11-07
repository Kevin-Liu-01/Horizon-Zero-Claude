/**
 * CALIMA · outfit merge + skeleton dispose (hero-body W0b; bible §3.9, §4.1;
 * plan E9; gate A-outfit-merge-dispose).
 *
 * An outfit set is ONE merged SkinnedMesh per material (built that way by its
 * recipe, so "merged at equip" is a bind, not a runtime geometry merge), bound
 * to the hero's bones by name. Equip also applies the set's hide bit to the
 * body (`HideMask`), which culls the body triangles fully covered by the set.
 * Unequip removes the mesh, disposes its Skeleton, and restores the body.
 * Equip/unequip x N returns geometries, textures and skeletons to baseline.
 */
import * as THREE from 'three';
import { bindPart, releasePart, HideMask, boneIndex } from './parts.js';
import { installCloth } from './clothShader.js';

/*
 * THE SASH TAILS' HANG (armory W1 fix round 1; judges: "the tails get no secondary motion"). The knot is tied behind
 * her left hip, 24 cm from dyn_sashEnd's bones (brea.mjs puts them at the front of the hip), so the tails ride their
 * own joint, `sash_swing`: a child of the pelvis standing AT the knot (the recipe's pivot), which this solve turns
 * every frame:
 *   - a quarter of her left thigh's swing about the hip joint (what the tails' skin took from the thigh before, so the
 *     stride still lifts them clear of the leg),
 *   - and a damped pendulum about the knot, two angles: OUT (the tails' ends away from her hip, along the hip's
 *     outward normal at the knot) and ALONG (round her, along the hip's tangent), driven by the pelvis's horizontal
 *     acceleration in character space: start, stop, turn and the stride's sway swing the tails and they settle.
 *     Clamped so they never swing in toward her (out -0.04..0.5 rad, along +-0.3), sub-stepped at <= 1/120 s.
 * The skin ramps from the pelvis at the knot to the joint down the tails (outfit-pan-1.mjs), so the cloth bends from
 * the knot. Per frame nothing allocates and no double crosses a call: every quaternion and vector is written in place.
 */
const SW = { omega2: 52, damp: 5.2, gain: 1.0, outMin: -0.04, outMax: 0.5, alongMax: 0.3, g: 9.81 };
const _sQ1 = new THREE.Quaternion(), _sQ2 = new THREE.Quaternion(), _sQ3 = new THREE.Quaternion();
const _sV = new THREE.Vector3();
const _SF = new Float64Array(12);    // pelvis world pos (3), velocity (3), accel char (3), scratch
const _SH = new Float64Array(1);

/** out = the turn by `angle` about the unit `axis`, into its fields. */
function _axisQ(out, axis, angle) {
  const s = Math.sin(angle * 0.5);
  out._x = axis.x * s; out._y = axis.y * s; out._z = axis.z * s; out._w = Math.cos(angle * 0.5);
}
/** out = slerp(identity, q, t) for small t, into its fields (nlerp: the thigh's turn is under 90 deg). */
function _partQ(out, q, t) {
  let x = q._x, y = q._y, z = q._z, w = q._w;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const a = 1 - t, nx = t * x, ny = t * y, nz = t * z, nw = a + t * w;
  const l = (nx * nx + ny * ny + nz * nz + nw * nw) ** 0.5;
  out._x = nx / l; out._y = ny / l; out._z = nz / l; out._w = nw / l;
}

export class SashSwing {
  /** `bone` the hero's sash_swing, `src` its source bone (bind), `thigh`/`thighSrc` likewise, `pelvis` the hero's. */
  constructor(player, bone, src, thigh, thighSrc, share, knot) {
    this.player = player; this.bone = bone; this.thigh = thigh; this.pelvis = bone.parent;
    this.bindPos = src.position.clone(); this.bindQ = src.quaternion.clone();
    this.thighBindInv = thighSrc.quaternion.clone().invert();
    this.share = share;
    // the hip's outward normal and tangent at the knot (character space, horizontal), and the axes that swing a
    // hanging tail along each, in the pelvis's frame at bind: axis = down x direction
    const nx0 = knot ? knot[0] : 0.63, nz0 = knot ? knot[2] + 0.02 : -0.78, nl = Math.hypot(nx0, nz0) || 1;
    this.nOut = new Float64Array([nx0 / nl, nz0 / nl]);
    this.tAlong = new Float64Array([-nz0 / nl, nx0 / nl]);
    const pQ = src.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.axOut = new THREE.Vector3(-this.nOut[1], 0, this.nOut[0]).applyQuaternion(pQ).normalize();
    this.axAlong = new THREE.Vector3(-this.tAlong[1], 0, this.tAlong[0]).applyQuaternion(pQ).normalize();
    this.th = 0; this.thV = 0; this.ph = 0; this.phV = 0;
    this.primed = false;
  }

  update(dt) {
    const b = this.bone, P = this.pelvis, model = this.player.model;
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    // the pelvis's world acceleration, in character space (the model's rotation, transposed)
    P.updateWorldMatrix(true, false);
    const pe = P.matrixWorld.elements, me = model.matrixWorld.elements, F = _SF;
    const px = pe[12], py = pe[13], pz = pe[14];
    if (!this.primed) { F[0] = px; F[1] = py; F[2] = pz; F[3] = 0; F[4] = 0; F[5] = 0; this.primed = true; }
    const vx = (px - F[0]) / dt, vy = (py - F[1]) / dt, vz = (pz - F[2]) / dt;
    let ax = (vx - F[3]) / dt, ay = (vy - F[4]) / dt, az = (vz - F[5]) / dt;
    F[0] = px; F[1] = py; F[2] = pz; F[3] = vx; F[4] = vy; F[5] = vz;
    // (a teleport or a hitch is not a swing)
    const a2 = ax * ax + ay * ay + az * az;
    if (a2 > 900) { ax = 0; ay = 0; az = 0; }
    const sx = (me[0] * me[0] + me[1] * me[1] + me[2] * me[2]) ** 0.5 || 1;
    const cx = (me[0] * ax + me[1] * ay + me[2] * az) / sx, cz = (me[8] * ax + me[9] * ay + me[10] * az) / sx;
    void ay;
    // the pendulum (small angles): the frame's pseudo-force (-a) along the hip's outward normal and its tangent
    let th = this.th, thV = this.thV, ph = this.ph, phV = this.phV;
    const fo = -(cx * this.nOut[0] + cz * this.nOut[1]), fa = -(cx * this.tAlong[0] + cz * this.tAlong[1]);
    const tT = SW.gain * fo / SW.g, tP = SW.gain * fa / SW.g;
    const n = dt > 1 / 120 ? 2 : 1, h = dt / n;
    for (let i = 0; i < n; i++) {
      thV += (-SW.omega2 * (th - tT) - SW.damp * thV) * h; th += thV * h;
      phV += (-SW.omega2 * (ph - tP) - SW.damp * phV) * h; ph += phV * h;
      if (th < SW.outMin) { th = SW.outMin; if (thV < 0) thV = 0; } else if (th > SW.outMax) { th = SW.outMax; if (thV > 0) thV = 0; }
      if (ph < -SW.alongMax) { ph = -SW.alongMax; if (phV < 0) phV = 0; } else if (ph > SW.alongMax) { ph = SW.alongMax; if (phV > 0) phV = 0; }
    }
    this.th = th; this.thV = thV; this.ph = ph; this.phV = phV;
    // the thigh's share, about the hip joint: D = q_thigh * q_thigh_bind^-1 (pelvis frame)
    _sQ1.copy(this.thigh.quaternion).multiply(this.thighBindInv);
    _SH[0] = this.share;
    _partQ(_sQ2, _sQ1, _SH[0]);
    const hp = this.thigh.position;
    _sV.copy(this.bindPos).sub(hp).applyQuaternion(_sQ2).add(hp);
    b.position.copy(_sV);
    // then the pendulum about the knot
    _axisQ(_sQ1, this.axOut, th);
    _axisQ(_sQ3, this.axAlong, ph);
    _sQ1.multiply(_sQ3).multiply(_sQ2).multiply(this.bindQ);
    const Q = b.quaternion;
    Q._x = _sQ1._x; Q._y = _sQ1._y; Q._z = _sQ1._z; Q._w = _sQ1._w;
    b.updateMatrix();
    b.matrixWorld.multiplyMatrices(P.matrixWorld, b.matrix);
  }
}

export class HeroOutfit {
  constructor(player) {
    this.player = player;
    this.ctx = player.ctx;
    this.meshes = [];
    this.row = null;
    this.set = null;
    this.body = null;
    player.model.traverse((o) => {
      if (!this.body && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) this.body = new HideMask(o);
    });
  }

  /** Equip the outfit loaded under `ctx.assets.models[row]`. Returns info(). */
  equip(row) {
    const entry = this.ctx.assets?.models?.[row];
    if (!entry) throw new Error(`[hero] no outfit row "${row}" loaded`);
    if (this.row === row) return this.info();
    if (this.row) this.unequip();
    const meta = entry.extras?.r5Outfit || {};
    this._prepare(entry, meta);
    this._ensureSockets(entry);
    // the two hero casters (plan §4.1, <= 2 x 3 cascades): body skin + outfit
    this.meshes = bindPart(this.player.model, entry.root, `outfit:${row}`, { castShadow: true });
    this._initSwing(entry, meta);
    this.set = meta.set || row;
    this.variant = meta.variant || row;
    this.row = row;
    this.hasPieces = !!meta.hasPieces;
    this.body?.apply(meta.hideBit || 0);
    this.player._collectMaterials?.();
    return this.info();
  }

  /**
   * Joints a set skins to that Brea's skeleton does not have (fix round 1: `sash_swing`, the tails' hang): created
   * once under their source parent with the source's bind transform, kept across swaps (a swap rebinds to them),
   * removed by `dispose()`. Never a dyn_ chain: those are the animator's.
   */
  _ensureSockets(entry) {
    const hero = boneIndex(this.player.model);
    let src = null;
    entry.root.traverse((o) => { if (!src && o.isSkinnedMesh) src = o; });
    if (!src) return;
    this._made = this._made || [];
    for (const b of src.skeleton.bones) {
      if (hero.has(b.name) || /^dyn_/.test(b.name)) continue;
      const par = b.parent && hero.get(b.parent.name);
      if (!par) continue;
      const nb = new THREE.Bone();
      nb.name = b.name;
      nb.position.copy(b.position); nb.quaternion.copy(b.quaternion); nb.scale.copy(b.scale);
      par.add(nb);
      hero.set(b.name, nb);
      this._made.push(nb);
    }
  }

  /** The tails' hang for a set that carries one (`r5Outfit.sashSwing`). */
  _initSwing(entry, meta) {
    this.swing = null;
    const S = meta.sashSwing;
    if (!S?.joint) return;
    const hero = boneIndex(this.player.model);
    let src = null;
    entry.root.traverse((o) => { if (!src && o.isSkinnedMesh) src = o; });
    const sb = src?.skeleton.bones.find((b) => b.name === S.joint), st = src?.skeleton.bones.find((b) => b.name === 'thigh_l');
    const hb = hero.get(S.joint), ht = hero.get('thigh_l');
    if (!sb || !st || !hb || !ht || hb.parent !== ht.parent) return;
    entry.root.updateMatrixWorld(true);
    this.swing = new SashSwing(this.player, hb, sb, ht, st, S.thighShare ?? 0.25, S.knot);
  }

  /** Per frame (HeroRig.update): the tails' hang. */
  update(dt) {
    if (this.swing) this.swing.update(dt);
  }

  /** Unequip, and remove the joints this created (HeroRig.dispose). */
  dispose() {
    const r = this.unequip();
    for (const b of this._made || []) b.removeFromParent();
    this._made = [];
    return r;
  }

  unequip() {
    this.swing = null;
    if (!this.row) return { skeletons: 0 };
    const r = releasePart(this.meshes, this.player);
    this.meshes = [];
    this.body?.apply(0);
    this.row = null;
    this.set = null;
    this.variant = null;
    this.hasPieces = false;
    return r;
  }

  /**
   * The set's material, once per row: a variant that shares its set's sheet takes the
   * sheet's Texture objects (bible §4.1: three variants, one atlas), and every outfit
   * gets the cloth shading (src/hero/clothShader.js).
   */
  _prepare(entry, meta) {
    entry.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const mat = o.material;
      if (meta.sharedAtlas && !mat.map) {
        let src = null;
        this.ctx.assets?.models?.[meta.sharedAtlas]?.root?.traverse((q) => { if (!src && q.isSkinnedMesh) src = q.material; });
        if (src) {
          mat.map = src.map; mat.normalMap = src.normalMap; mat.roughnessMap = src.roughnessMap; mat.metalnessMap = src.metalnessMap;
          mat.normalScale.copy(src.normalScale);
          mat.needsUpdate = true;
          entry.sharedMaps = true;       // the maps are the sheet owner's: never disposed with this row
        }
      }
      installCloth(mat, { rep: meta.detailRep ?? 60, pieces: !!meta.hasPieces, salt: !!meta.hasSalt, ao: !!meta.hasAo });
    });
  }

  /** PIECE-mask bits to hide on the outfit (Guild Whites' hat, head or back). */
  setPieces(bits) {
    if (!this.hasPieces) return;
    for (const m of this.meshes) {
      const u = m.material?.userData?.clothU || this._srcClothU(m);
      if (u) u.uHidePiece.value = bits;
    }
  }

  _srcClothU() {
    let u = null;
    this.ctx.assets?.models?.[this.row]?.root?.traverse((o) => { if (!u && o.isSkinnedMesh) u = o.material?.userData?.clothU || null; });
    return u;
  }

  info() {
    let tris = 0;
    for (const m of this.meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    return {
      row: this.row, set: this.set, variant: this.variant ?? null, meshes: this.meshes.length, tris,
      bodyVisibleTris: this.body ? this.body.visibleTris() : null,
      bodyHiddenTris: this.body ? this.body.hiddenTris : 0,
    };
  }
}
