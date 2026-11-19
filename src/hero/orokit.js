/**
 * CALIMA · Oro's kit on her (Milestone 2 area D, wave 2; bible §5.2 carry, §14 0:35 "Find Oro at the tube mouth (he
 * hands over the Boat Gaff, Pine Windwall, two Brine Pots, one Cinder Pot)").
 *
 * The stowed copies are ONE skinned mesh (`public/models/armory/kit-oro.glb`, tools/build/recipes/weapons/kit-oro.mjs),
 * a deferred row loaded at the hand-over (never a boot cost; nothing of it exists before), bound to her bones by name,
 * one draw, on the shared weapon atlas. Its `_piece` bits collapse what she does not own or holds in her hand, as the
 * main stow kit's do (stowkit.js `installPieceMask`: the piece's vertices fold to a point, still one draw).
 *
 *   const oro = new HeroOroKit(player)        HeroRig makes one; nothing loads
 *   await oro.grant({ gaff, windwall, pots })  the hand-over: loads the row once, binds it, shows what is owned
 *   oro.setHeld(bits)                          collapse the stowed copy of what is in her hands (ORO_PIECE)
 *   oro.solve(dt)                              per frame after the animator: the gaff's hanger
 *   oro.gaffStow(out)                          the stowed gaff's butt, grip and beak, world (the draw's take)
 *   oro.info() / oro.dispose()
 *
 * THE GAFF'S HANGER. The gaff hangs from the back of her belt by a strap (KT0 moved it there from the left rear hip:
 * kit-oro.mjs), so it swings: rigid on the pelvis, a hung haft stood 0.27 m out behind her at a sprint (the pelvis
 * pitches forward), the bench measured. `stow_gaff` is a
 * bone under `pelvis` at the identity; each frame it turns the haft about its top (the belt) back toward the line it
 * hangs on at her idle in character space (`HOLD` of the pelvis's lean), through a damped spring so it lags and settles
 * as a hung tool does, and the right thigh and calf shove its low end out where they come within `CLEAR` of it.
 * No allocation per frame.
 */
import * as THREE from 'three';
import { bindPart, releasePart, boneIndex } from './parts.js';
import { installPieceMask } from './stowkit.js';
import { adoptWeaponAtlas } from './weaponAtlas.js';

export const ORO_ROW = { heroOroKit: { url: '/models/armory/kit-oro.glb', targetHeight: 1.72, yaw: 0 } };
/** Piece bits of the kit's `_piece` attribute (kit-oro.mjs ORO_PIECE). */
export const ORO_PIECE = Object.freeze({ gaff: 1, windwall: 2, potBrine1: 4, potBrine2: 8, potCinder: 16 });
export const GAFF_SOCKET = 'stow_gaff';
const GAFF_SOCKET_PARENT = 'pelvis';
/** How much of the pelvis's lean the hanger takes out (1 = the haft keeps its idle line in character space). */
const HOLD = 0.85;
/** The hanger's spring: natural frequency (rad/s) and damping ratio (a hung tool: a quick, slightly lively settle). */
const SPRING_W = 15, SPRING_Z = 0.55;
/** The gap the stowed haft keeps from her right thigh and calf, axis to axis (m), and the largest turn a shove makes. */
const CLEAR = 0.12, SHOVE_MAX = 0.6;
/**
 * The line the gaff hangs on at her idle, character space (her +x left, +y up, +z forward): KT0's mount
 * (tools/gates/hero-sweep/kt0-gaff-mount.mjs `rearRight`, butt (-0.04, 1.04, -0.20) to beak end (-0.15, 0.46, -0.17)).
 */
const REST_C = new THREE.Vector3(-0.11, -0.58, 0.03).normalize();
const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4();
const _qT = new THREE.Quaternion(), _vT = new THREE.Vector3(), _vT2 = new THREE.Vector3();

const _qA = new THREE.Quaternion(), _qB = new THREE.Quaternion(), _qC = new THREE.Quaternion(), _qD = new THREE.Quaternion();
const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vC = new THREE.Vector3(), _vD = new THREE.Vector3();
const _pA = new THREE.Vector3(), _pB = new THREE.Vector3(), _pC = new THREE.Vector3();
const _mI = new THREE.Matrix4();

/** Closest distance between segments a0-a1 and b0-b1, and the point on b (into `onB`). */
function segSeg(a0, a1, b0, b1, onB) {
  const ux = a1.x - a0.x, uy = a1.y - a0.y, uz = a1.z - a0.z, vx = b1.x - b0.x, vy = b1.y - b0.y, vz = b1.z - b0.z;
  const wx = a0.x - b0.x, wy = a0.y - b0.y, wz = a0.z - b0.z;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz, D = a * c - b * b;
  let s = 0;
  if (D > 1e-12) { s = (b * e - c * d) / D; if (s < 0) s = 0; else if (s > 1) s = 1; }
  let t = c > 1e-12 ? (b * s + e) / c : 0;
  if (t < 0) { t = 0; if (a > 1e-12) { s = -d / a; if (s < 0) s = 0; else if (s > 1) s = 1; } } else if (t > 1) { t = 1; if (a > 1e-12) { s = (b - d) / a; if (s < 0) s = 0; else if (s > 1) s = 1; } }
  const px = a0.x + ux * s, py = a0.y + uy * s, pz = a0.z + uz * s;
  onB.set(b0.x + vx * t, b0.y + vy * t, b0.z + vz * t);
  return Math.hypot(onB.x - px, onB.y - py, onB.z - pz);
}

export class HeroOroKit {
  constructor(player) {
    this.player = player;
    this.ctx = player.ctx;
    this.entry = null;
    this.meshes = [];
    this.u = null;
    this.attached = false;
    this.owned = { gaff: false, windwall: false, pots: 0 };
    this.held = 0;
    this.socket = null;
    this._g = null;            // the gaff's hanger state (pelvis frame)
    this.tiltK = 0;            // the take's tilt (gaffLayer.js): 0 hung, 1 on the take's frame, held by the hand's reach
    this.takeAxis = new THREE.Vector3(0, -1, 0);   // the take's frame, character space: the haft (butt -> beak)...
    this.takeHook = new THREE.Vector3(0, 0, -1);   // ...and the hook's side (gaffLayer.js sets both)
    this.follow = null;        // the held gaff's mesh while it is in her hand (gaffLayer.js): the hanger follows it unseen,
                               // so the stowed copy is exactly where the held one is at the release

    this._loading = null;
  }

  /** What is collapsed: everything not owned, and what is in her hands. */
  _bits() {
    const o = this.owned;
    let hide = 0;
    if (!o.gaff) hide |= ORO_PIECE.gaff;
    if (!o.windwall) hide |= ORO_PIECE.windwall;
    const pots = o.pots | 0;
    if (pots < 1) hide |= ORO_PIECE.potBrine1;
    if (pots < 2) hide |= ORO_PIECE.potBrine2;
    if (pots < 3) hide |= ORO_PIECE.potCinder;
    return hide | this.held;
  }

  _apply() { if (this.u) this.u.value = this._bits(); }

  /** The hand-over (or a save carrying it): load the row once, bind it, show what is owned. Resolves to this. */
  async grant({ gaff = true, windwall = true, pots = 3 } = {}) {
    this.owned = { gaff: !!gaff, windwall: !!windwall, pots: Math.max(0, Math.min(3, pots | 0)) };
    if (!this.entry) {
      const assets = this.ctx.assets;
      if (!assets?.loadExtra) return this;
      this._loading ??= assets.loadExtra({ ...ORO_ROW });
      await this._loading;
      this.entry = assets.models.heroOroKit ?? null;
    }
    if (this.entry && !this.attached) this.attach();
    this._apply();
    return this;
  }

  _ensureSocket() {
    if (this.socket) return this.socket;
    const bones = boneIndex(this.player.model);
    let sock = bones.get(GAFF_SOCKET) || null;
    if (!sock) {
      const par = bones.get(GAFF_SOCKET_PARENT);
      if (!par) return null;
      sock = new THREE.Bone();
      sock.name = GAFF_SOCKET;
      par.add(sock);
    }
    this.socket = sock;
    return sock;
  }

  attach() {
    if (this.attached || !this.entry) return this;
    // the hanger rests at the identity while the kit binds (its bind is the pelvis's)
    const sock = this._ensureSocket();
    if (!sock) return this;
    sock.position.set(0, 0, 0); sock.quaternion.identity(); sock.updateMatrixWorld(true);
    adoptWeaponAtlas(this.entry.root);
    this.meshes = bindPart(this.player.model, this.entry.root, 'kit-oro', { castShadow: false });
    for (const m of this.meshes) {
      this.u = installPieceMask(m.material);
      m.userData.orbitGear = true;
    }
    this.attached = true;
    this._initGaff();
    this._apply();
    this.player._collectMaterials?.();
    return this;
  }

  /**
   * The gaff's two ends in the pelvis's frame and the line it hangs on at rest, off the skinned kit with the hanger at
   * the identity. The rest line is read in CHARACTER space from the recipe's mount (`extras.r5OroKit.stow.gaff`): the
   * haft's direction at her idle, which the hanger holds.
   */
  _initGaff() {
    const m = this.meshes[0], sock = this.socket;
    if (!m || !sock) return;
    const P = m.geometry.getAttribute('_piece'), pos = m.geometry.getAttribute('position');
    if (!P) return;
    const model = this.player.model;
    model.updateMatrixWorld(true);
    m.skeleton.update();
    const par = sock.parent;
    // the ends: the gaff's farthest-apart pair of vertices (its butt knob and its beak)
    let a = -1, ay = -1e9, b = -1, by = 1e9;
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & ORO_PIECE.gaff) === 0) continue;
      m.getVertexPosition(i, _vA); m.localToWorld(_vA);
      if (_vA.y > ay) { ay = _vA.y; a = i; }
      if (_vA.y < by) { by = _vA.y; b = i; }
    }
    if (a < 0) return;
    m.getVertexPosition(a, _vA); m.localToWorld(_vA);
    m.getVertexPosition(b, _vB); m.localToWorld(_vB);
    const top = par.worldToLocal(_vA.clone()), low = par.worldToLocal(_vB.clone());
    // the hook's side: from the haft's line to the gaff's vertex farthest off it (the hook's outer curve), pelvis frame
    const ax = low.clone().sub(top).normalize(), hook = new THREE.Vector3();
    let far = -1;
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & ORO_PIECE.gaff) === 0) continue;
      m.getVertexPosition(i, _vC); m.localToWorld(_vC); par.worldToLocal(_vC);
      _vC.sub(top); _vC.addScaledVector(ax, -_vC.dot(ax));
      // (the frog's tab stands off the haft too, near the top: only the head's end counts)
      const along = _vA.copy(_vC).length();
      if (along > far && m.getVertexPosition(i, _vD) && par.worldToLocal(m.localToWorld(_vD)).sub(top).dot(ax) > 0.45) { far = along; hook.copy(_vC); }
    }
    hook.normalize();
    this._g = {
      top, low, len: top.distanceTo(low), restC: REST_C, fresh: true, hook,
      // the hanger's state: its turn (pelvis frame) and the spring's angular velocity (axis * rad/s, pelvis frame)
      q: new THREE.Quaternion(), w: new THREE.Vector3(), shove: 0, off: new THREE.Vector3(),
    };
  }

  /** Collapse the stowed copies of what is in her hands (ORO_PIECE bits). */
  setHeld(bits) {
    const b = bits | 0;
    if (b === this.held) return;
    this.held = b;
    this._apply();
  }

  /**
   * Per frame, after the animator (HeroRig.update): the hanger turns the haft about its top toward the rest line
   * (HOLD of the lean taken out), sprung, and the left leg shoves its low end clear.
   */
  solve(dt = 1 / 60) {
    const G = this._g, sock = this.socket;
    if (!this.attached || !G || !sock) return;
    if (!(dt > 0)) dt = 0;
    const model = this.player.model, par = sock.parent;
    par.updateWorldMatrix(true, false);
    // in her hand: the hanger takes the held gaff's pose (unseen: the stowed copy is folded), offset and all
    if ((this.held & ORO_PIECE.gaff) && this.follow) { this._followHeld(this.follow, par); return; }
    // the rest line, from character space into the pelvis's frame, and the haft's line with the pelvis as it is
    model.getWorldQuaternion(_qA);
    par.getWorldQuaternion(_qB);
    _qC.copy(_qB).invert().multiply(_qA);                         // character -> pelvis
    _vA.copy(G.restC).applyQuaternion(_qC);                       // the rest line, pelvis frame
    _vB.copy(G.low).sub(G.top).normalize();                       // the haft as built (the hanger at the identity), pelvis frame
    // the target turn: HOLD of the way from the built line to the rest line; crouched, the haft folds with her pelvis
    // instead (held upright it would stand in her calves, which come up behind her: the quiver's rule, stowkit.js)
    const an = this.player.animator;
    let crouch = an ? an._crouchW : 0;
    if (!(crouch > 0)) crouch = 0; else if (crouch > 1) crouch = 1;
    _qA.setFromUnitVectors(_vB, _vA);
    _qB.identity().slerp(_qA, HOLD * (1 - crouch));
    // (the first frame after the bind: hang at the target, no swing in)
    if (G.fresh) { G.fresh = false; G.q.copy(_qB); G.w.set(0, 0, 0); }
    // the take's tilt (the hand's reach holds the gaff on TAKE_C): straight onto it, no spring, while the hand has it
    const tk = this.tiltK > 0 ? (this.tiltK > 1 ? 1 : this.tiltK) : 0;
    if (tk > 0) this._takeTarget(_qB, model, par, tk);
    // the spring toward the target: the error as an axis-angle (pelvis frame)
    _qC.copy(G.q).invert().premultiply(_qB);                      // target * current^-1
    if (_qC.w < 0) { _qC.x = -_qC.x; _qC.y = -_qC.y; _qC.z = -_qC.z; _qC.w = -_qC.w; }
    const s = Math.sqrt(Math.max(0, 1 - _qC.w * _qC.w));
    const ang = 2 * Math.atan2(s, _qC.w);
    if (s > 1e-6) _vC.set(_qC.x / s, _qC.y / s, _qC.z / s).multiplyScalar(ang); else _vC.set(0, 0, 0);
    // semi-implicit: w += (W^2 err - 2 Z W w) dt, in sub-steps of at most 1/120 s
    let left = dt;
    while (left > 1e-6) {
      const h = left > 1 / 120 ? 1 / 120 : left; left -= h;
      G.w.x += (SPRING_W * SPRING_W * _vC.x - 2 * SPRING_Z * SPRING_W * G.w.x) * h;
      G.w.y += (SPRING_W * SPRING_W * _vC.y - 2 * SPRING_Z * SPRING_W * G.w.y) * h;
      G.w.z += (SPRING_W * SPRING_W * _vC.z - 2 * SPRING_Z * SPRING_W * G.w.z) * h;
      const wl = G.w.length();
      if (wl > 1e-9) { _qA.setFromAxisAngle(_vD.copy(G.w).multiplyScalar(1 / wl), wl * h); G.q.premultiply(_qA); }
    }
    G.q.normalize();
    if (tk >= 0.999) { G.q.copy(_qB); G.w.set(0, 0, 0); }
    else if (tk > 0) G.q.slerp(_qB, tk);
    // the leg's shove, over the hung line (not through the spring: a stride comes faster than the hang settles): the low
    // end out, square to the haft, away from the thigh and calf (pelvis frame)
    _qB.copy(G.q);
    // (not while the hand holds it on the take's frame: the hand's frame is the gaff's)
    if (this.owned.gaff && !(this.held & ORO_PIECE.gaff) && tk < 0.999) this._shove(_qB, dt);
    // about the top: p' = q p + t, t = top - q top (plus what is left of the held gaff's offset at its release, easing out)
    sock.quaternion.copy(_qB);
    _vA.copy(G.top).applyQuaternion(_qB);
    sock.position.copy(G.top).sub(_vA);
    if (G.off.lengthSq() > 1e-10) { G.off.multiplyScalar(Math.max(0, 1 - dt * 8)); sock.position.add(G.off); }
    sock.updateWorldMatrix(false, false);
  }

  /** The hanger onto the held gaff (`mesh`: the GLB's node, +Y the haft from its butt, +Z the hook), pelvis frame. */
  _followHeld(mesh, par) {
    const G = this._g, sock = this.socket;
    mesh.updateWorldMatrix(true, false);
    _mI.copy(par.matrixWorld).invert();
    _vA.set(0, 0, 0).applyMatrix4(mesh.matrixWorld).applyMatrix4(_mI);                 // the butt
    _vB.set(0, 1, 0).applyMatrix4(mesh.matrixWorld).applyMatrix4(_mI).sub(_vA).normalize();   // the haft
    _vC.set(0, 0, 1).applyMatrix4(mesh.matrixWorld).applyMatrix4(_mI).sub(_vA.clone ? _vA : _vA);
    _vC.set(0, 0, 1).applyMatrix4(mesh.matrixWorld).applyMatrix4(_mI);
    _vC.sub(_vA); _vC.addScaledVector(_vB, -_vC.dot(_vB)).normalize();               // the hook
    _vD.crossVectors(_vB, _vC);
    _mB.makeBasis(_vD, _vB, _vC);
    // the built frame (pelvis frame, the hanger at the identity)
    _pA.copy(G.low).sub(G.top).normalize();
    _pB.copy(G.hook).addScaledVector(_pA, -G.hook.dot(_pA)).normalize();
    _pC.crossVectors(_pA, _pB);
    _mA.makeBasis(_pC, _pA, _pB);
    _mB.multiply(_mA.transpose());
    G.q.setFromRotationMatrix(_mB); G.w.set(0, 0, 0); G.fresh = false; G.shove = 0;
    sock.quaternion.copy(G.q);
    // p' = q p + t with the top onto the held butt: t = butt - q top; its part off the hung pivot is the offset
    _pA.copy(G.top).applyQuaternion(G.q);
    sock.position.copy(_vA).sub(_pA);
    G.off.copy(sock.position).sub(_pB.copy(G.top).sub(_pA));
    sock.updateWorldMatrix(false, false);
  }

  /**
   * THE TAKE (gaffLayer.js): as the right hand reaches back for it, the gaff swings on its strap about the belt into the
   * frame the hand closes on with a straight wrist (`takeAxis`, `takeHook`, character space; a haft hanging plumb lies
   * along her reaching forearm and would need 60+ deg of the wrist, W1's bar is 30). `qT` (pelvis frame) moves `k` of
   * the way onto the turn that takes the built frame (haft, hook) onto it.
   */
  _takeTarget(qT, model, par, k) {
    const G = this._g;
    par.getWorldQuaternion(_qC).invert().multiply(model.getWorldQuaternion(_qD));       // character -> pelvis
    // the built frame (the hanger at the identity), pelvis frame: Y the haft, Z the hook, X = Y x Z
    _vA.copy(G.low).sub(G.top).normalize();
    _vC.copy(G.hook).addScaledVector(_vA, -G.hook.dot(_vA)).normalize();
    _vD.crossVectors(_vA, _vC);
    _mA.makeBasis(_vD, _vA, _vC);
    // the take's frame in the pelvis's
    _vA.copy(this.takeAxis).applyQuaternion(_qC).normalize();
    _vC.copy(this.takeHook).applyQuaternion(_qC);
    _vC.addScaledVector(_vA, -_vC.dot(_vA)).normalize();
    _vD.crossVectors(_vA, _vC);
    _mB.makeBasis(_vD, _vA, _vC);
    _mB.multiply(_mA.transpose());
    _qA.setFromRotationMatrix(_mB);
    if (k >= 0.999) qT.copy(_qA); else qT.slerp(_qA, k);
  }

  /** Turn the target `qT` (pelvis frame) further so the low end keeps CLEAR from the right thigh and calf. */
  _shove(qT, dt) {
    const an = this.player.animator, b = an?.b, G = this._g, par = this.socket.parent;
    if (!b?.thighR || !b?.calfR || !b?.footR) return;
    b.footR.bone.updateWorldMatrix(true, false);
    _mI.copy(par.matrixWorld).invert();
    const pe = par.matrixWorld.elements, sc = Math.hypot(pe[0], pe[1], pe[2]) || 1;
    const clear = CLEAR / sc;
    _pA.setFromMatrixPosition(b.thighR.bone.matrixWorld).applyMatrix4(_mI);
    _pB.setFromMatrixPosition(b.calfR.bone.matrixWorld).applyMatrix4(_mI);
    _pC.setFromMatrixPosition(b.footR.bone.matrixWorld).applyMatrix4(_mI);
    // the haft under the target turn: top fixed, low end turned
    _vA.copy(G.low).sub(G.top).applyQuaternion(qT).add(G.top);
    let gap = segSeg(_pA, _pB, G.top, _vA, _vB);
    const g2 = segSeg(_pB, _pC, G.top, _vA, _vC);
    let seg0 = _pA, seg1 = _pB;
    if (g2 < gap) { gap = g2; _vB.copy(_vC); seg0 = _pB; seg1 = _pC; }
    let want = 0;
    if (gap < clear) want = clear - gap;
    // ease in fast, out slowly
    G.shove += (want - G.shove) * Math.min(1, dt * (want > G.shove ? 40 : 6));
    if (G.shove < 1e-5) return;
    // push direction: from the leg's nearest point to the haft's, square to the haft
    const ux = seg1.x - seg0.x, uy = seg1.y - seg0.y, uz = seg1.z - seg0.z, ul = ux * ux + uy * uy + uz * uz || 1;
    let t = ((_vB.x - seg0.x) * ux + (_vB.y - seg0.y) * uy + (_vB.z - seg0.z) * uz) / ul;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    _vC.set(_vB.x - (seg0.x + ux * t), _vB.y - (seg0.y + uy * t), _vB.z - (seg0.z + uz * t));
    if (_vC.lengthSq() < 1e-10) return;
    _vC.normalize();
    // the turn about the top that moves the contact point by `shove` along the push (small angle), capped
    const lever = _vB.distanceTo(G.top) || 1;
    let ang = G.shove / lever;
    if (ang > SHOVE_MAX) ang = SHOVE_MAX;
    _vD.copy(_vB).sub(G.top).normalize();
    _vA.crossVectors(_vD, _vC);
    if (_vA.lengthSq() < 1e-10) return;
    _vA.normalize();
    _qA.setFromAxisAngle(_vA, ang);
    qT.premultiply(_qA);
  }

  /** The stowed gaff, world: its butt (the hand's take), grip and beak; `out` = { butt, grip, tip } Vector3s. */
  gaffStow(out) {
    const G = this._g, sock = this.socket;
    if (!G || !sock || !this.attached) return null;
    sock.updateWorldMatrix(true, false);
    const par = sock.parent;
    out.butt.copy(G.top).applyQuaternion(sock.quaternion).add(sock.position).applyMatrix4(par.matrixWorld);
    out.tip.copy(G.low).applyQuaternion(sock.quaternion).add(sock.position).applyMatrix4(par.matrixWorld);
    if (out.grip) out.grip.copy(out.butt).lerp(out.tip, 0.098 / 0.625);
    return out;
  }

  /**
   * The stowed gaff as the hanger holds it on the take's frame (tilt 1, whatever it shows now): world butt, beak, grip
   * and the hook's side in character space (`out.hookC`). The hand aims for this; the visible copy swings to it.
   */
  gaffTake(out, model = this.player.model) {
    const G = this._g, sock = this.socket;
    if (!G || !sock || !this.attached) return null;
    const par = sock.parent;
    par.updateWorldMatrix(true, false);
    _qT.identity();
    this._takeTarget(_qT, model, par, 1);
    _vT.copy(G.top).applyQuaternion(_qT);
    _vT2.copy(G.top).sub(_vT);                                   // the socket's position on the hung pivot
    out.butt.copy(G.top).applyQuaternion(_qT).add(_vT2).applyMatrix4(par.matrixWorld);
    out.tip.copy(G.low).applyQuaternion(_qT).add(_vT2).applyMatrix4(par.matrixWorld);
    if (out.grip) out.grip.copy(out.butt).lerp(out.tip, 0.098 / 0.625);
    if (out.hookC) { par.getWorldQuaternion(_qA).multiply(_qT); model.getWorldQuaternion(_qB).invert(); out.hookC.copy(G.hook).applyQuaternion(_qA.premultiply(_qB)); }
    return out;
  }

  /** The stowed gaff's hook side, character space (unit), into `out`. */
  gaffHookChar(out, model = this.player.model) {
    const G = this._g, sock = this.socket;
    if (!G || !sock) return out;
    sock.parent.getWorldQuaternion(_qA);
    _qA.multiply(sock.quaternion);
    model.getWorldQuaternion(_qB).invert();
    return out.copy(G.hook).applyQuaternion(_qA.premultiply(_qB));
  }

  info() {
    let tris = 0;
    for (const m of this.meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    return { attached: this.attached, tris, owned: { ...this.owned }, held: this.held, hidden: this._bits(), extras: this.entry?.extras?.r5OroKit ?? null };
  }

  dispose() {
    const r = this.attached ? releasePart(this.meshes, this.player) : { skeletons: 0 };
    this.meshes = []; this.attached = false; this.u = null;
    if (this.socket) { this.socket.removeFromParent(); this.socket = null; }
    if (this.entry) { this.ctx.assets?.unload?.('heroOroKit'); this.entry = null; }
    this._g = null;
    return r;
  }
}
