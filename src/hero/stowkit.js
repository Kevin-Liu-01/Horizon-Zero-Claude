/**
 * CALIMA · the merged stow kit (hero-body W0b; bible §3.6 "everything stowed is
 * one merged mesh, one draw ... a per-vertex `pieceId` + uniform bitmask
 * collapses the drawn weapon's stowed copy (still one draw)"; plan E9).
 *
 * The kit GLB (tools/build/recipes/weapons/kit-v0.mjs) is ONE skinned mesh
 * whose vertices carry `_piece` (1 lance, 2 bow, 4 quiver + arrows, 8 bracer,
 * 16 alidade). The material's vertex stage collapses every vertex whose piece
 * bit is set in `uKitHide` to its bone's origin (degenerate triangles: nothing
 * rasterises), so hiding a piece never adds or removes a draw.
 *
 * The hook is carried on `material.userData` (`vertexHook`, `cacheKey`), which
 * the Player's fade-dither clone composes, so the mask survives the fade.
 */
import * as THREE from 'three';
import { bindPart, releasePart, boneIndex } from './parts.js';
import { LanceCarry } from './carry.js';

export const PIECE = { lance: 1, bow: 2, quiver: 4, bracer: 8, alidade: 16 };
/** The lance's carry socket joint (kit recipe `LANCE_SOCKET`), a child of `spine_02` at the identity. */
export const LANCE_SOCKET = 'stow_lance';
const LANCE_SOCKET_PARENT = 'spine_02';
/**
 * The quiver's hanger (armory W1; hero-body's handover "pin the quiver's tilt to the
 * trunk"): a child of `pelvis` at the identity. Rigid on the pelvis the tube went from
 * 10-12 deg at idle to 39-42 deg at a sprint (bible: 20). A quiver hangs from its belt
 * band, so this bone turns it back toward the bind attitude about that band.
 */
export const QUIVER_SOCKET = 'stow_quiver';
const QUIVER_SOCKET_PARENT = 'pelvis';
const QUIVER_HOLD = 1.0;              // how much of the pelvis's turn the strap takes out at full speed
const _qA = new THREE.Quaternion(), _qB = new THREE.Quaternion(), _qC = new THREE.Quaternion(), _qId = new THREE.Quaternion();
const _vA = new THREE.Vector3();
const _qS = new THREE.Quaternion(), _qD = new THREE.Quaternion();
const QUIVER_LANCE_SWING = 0.52;       // radians: the right elbow, lance in hand, pushes the mouth back past upright
const QUIVER_LANCE_ROLL = 0.3;         // ... and its foot, coming forward, out past her thigh (fix round 1: 0.22 -> 0.3, the heavy's stride met it)
const QUIVER_SWING_RATE = 7;           // per second, toward that hold

const _W1 = new Float64Array(1);
/** Fix round 1: the gap the quiver keeps from her right arm and shin (m, axis to axis), and its largest push (rad). */
const QUIVER_CLEAR = 0.115, QUIVER_PUSH_MAX = 0.45;
const _mQ = new THREE.Matrix4();
const _pA = new THREE.Vector3(), _pB = new THREE.Vector3(), _pC = new THREE.Vector3(), _pT = new THREE.Vector3(), _pF = new THREE.Vector3(), _vB = new THREE.Vector3();
/** _QS: [gap, push x, push y, lever, tube point x, y, z, push z] of the worst approach this frame. */
const _QS = new Float64Array(8);
/**
 * The closest approach of segment [a0,a1] (a limb) to [b0,b1] (the tube from its band), into `QS` when it beats the
 * gap held there: the gap, the unit push (limb -> tube), the lever (band to the tube's point) and the tube's point.
 */
function _segPush(a0, a1, b0, b1, QS) {
  const ux = a1.x - a0.x, uy = a1.y - a0.y, uz = a1.z - a0.z, vx = b1.x - b0.x, vy = b1.y - b0.y, vz = b1.z - b0.z;
  const wx = a0.x - b0.x, wy = a0.y - b0.y, wz = a0.z - b0.z;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz, D = a * c - b * b;
  let s = 0;
  if (D > 1e-12) { s = (b * e - c * d) / D; if (s < 0) s = 0; else if (s > 1) s = 1; }
  let t = 0;
  if (c > 1e-12) t = (b * s + e) / c;
  if (t < 0) { t = 0; if (a > 1e-12) { s = -d / a; if (s < 0) s = 0; else if (s > 1) s = 1; } } else if (t > 1) { t = 1; if (a > 1e-12) { s = (b - d) / a; if (s < 0) s = 0; else if (s > 1) s = 1; } }
  const qx = b0.x + vx * t, qy = b0.y + vy * t, qz = b0.z + vz * t;
  let dx = qx - (a0.x + ux * s), dy = qy - (a0.y + uy * s), dz = qz - (a0.z + uz * s);
  const g = (dx * dx + dy * dy + dz * dz) ** 0.5;
  if (!(g < QS[0])) return;
  // the push, square to the tube (sliding along it opens nothing)
  const vl = c > 1e-12 ? (dx * vx + dy * vy + dz * vz) / c : 0;
  dx -= vx * vl; dy -= vy * vl; dz -= vz * vl;
  const pl = (dx * dx + dy * dy + dz * dz) ** 0.5;
  if (pl < 1e-6) return;
  QS[0] = g; QS[1] = dx / pl; QS[2] = dy / pl; QS[7] = dz / pl;
  QS[3] = t * (c ** 0.5); QS[4] = qx; QS[5] = qy; QS[6] = qz;
}
/** out = slerp(identity, q, t), into its fields (three.js's Quaternion.slerp from the identity). */
function _slerpFromId(out, q, t) {
  let x = q._x, y = q._y, z = q._z, w = q._w;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }           // the short way round
  if (t <= 0) { out._x = 0; out._y = 0; out._z = 0; out._w = 1; return; }
  if (t >= 1) { out._x = x; out._y = y; out._z = z; out._w = w; return; }
  if (w >= 1) { out._x = 0; out._y = 0; out._z = 0; out._w = 1; return; }
  const s2 = 1 - w * w;
  if (s2 <= 1e-12) {
    // (near the identity: lerp and renormalise)
    const a = 1 - t, nx = t * x, ny = t * y, nz = t * z, nw = a + t * w;
    const l = (nx * nx + ny * ny + nz * nz + nw * nw) ** 0.5;
    out._x = nx / l; out._y = ny / l; out._z = nz / l; out._w = nw / l;
    return;
  }
  _W1[0] = w;                                  // (through a typed slot: a phi feeding a Math call boxes in V8's mid tier)
  const sinH = s2 ** 0.5, half = Math.acos(_W1[0]);   // = atan2(sinH, w), w in (0, 1)
  const ra = Math.sin((1 - t) * half) / sinH, rb = Math.sin(t * half) / sinH;
  out._x = x * rb; out._y = y * rb; out._z = z * rb; out._w = ra + w * rb;
}
/** out = the turn by `angle` about the unit `axis`, into its fields (Quaternion.setFromAxisAngle). */
function _axisAngle(out, axis, angle) {
  const s = Math.sin(angle / 2);
  out._x = axis.x * s; out._y = axis.y * s; out._z = axis.z * s; out._w = Math.cos(angle / 2);
}

/** Install the piece mask on a (source) material, once. Returns the shared uniform. */
export function installPieceMask(material) {
  if (material.userData.kitHide) return material.userData.kitHide;
  const u = { value: 0 };
  material.userData.kitHide = u;
  material.userData.cacheKey = 'hero-kit-piece';
  material.userData.vertexHook = (shader) => {
    shader.uniforms.uKitHide = u;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _piece;\nuniform float uKitHide;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  if ( ( int( _piece + 0.5 ) & int( uKitHide + 0.5 ) ) != 0 ) transformed = vec3( 0.0 );`);
  };
  material.onBeforeCompile = material.userData.vertexHook;
  material.customProgramCacheKey = () => 'hero-kit-piece';
  material.needsUpdate = true;
  return u;
}

export class HeroStowKit {
  /**
   * @param {object} player   the live Player (model, ctx)
   * @param {object} entry    `ctx.assets.models.heroStowKit`
   */
  constructor(player, entry) {
    this.player = player;
    this.entry = entry;
    this.meshes = [];
    this.hidden = 0;
    this._quiverSwing = 0;
    this.u = null;
    this.attached = false;
    this.socket = null;
    this.carry = null;
  }

  /**
   * The lance's carry socket on the hero skeleton: created once (a Bone under
   * spine_02 at the identity, so its bind equals the kit joint's) and kept
   * across detach / attach; removed by `dispose()`.
   */
  _ensureSocket() {
    if (this.socket) return this.socket;
    const bones = boneIndex(this.player.model);
    let sock = bones.get(LANCE_SOCKET) || null;
    if (!sock) {
      const par = bones.get(LANCE_SOCKET_PARENT);
      if (!par) return null;
      sock = new THREE.Bone();
      sock.name = LANCE_SOCKET;
      par.add(sock);
    }
    this.socket = sock;
    return sock;
  }

  /** The quiver's hanger, as the lance's socket: created once, kept across detach / attach. */
  _ensureQuiverSocket() {
    if (this.quiverSocket) return this.quiverSocket;
    const bones = boneIndex(this.player.model);
    let sock = bones.get(QUIVER_SOCKET) || null;
    if (!sock) {
      const par = bones.get(QUIVER_SOCKET_PARENT);
      if (!par) return null;
      sock = new THREE.Bone();
      sock.name = QUIVER_SOCKET;
      par.add(sock);
    }
    this.quiverSocket = sock;
    return sock;
  }

  /** The hang point in the pelvis's frame and the pelvis's bind attitude (Player constructor: still in bind). */
  _initQuiver() {
    const sock = this.quiverSocket, m = this.meshes[0];
    if (!sock || !m || this._quiverHang) return;
    const P = m.geometry.getAttribute('_piece'), pos = m.geometry.getAttribute('position');
    if (!P) return;
    // the tube's foot and the arrows' top, off the skinned kit: the recipe says how far up that span its band sits
    let lo = -1, hi = -1;
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & PIECE.quiver) === 0) continue;
      if (lo < 0 || pos.getY(i) < pos.getY(lo)) lo = i;
      if (hi < 0 || pos.getY(i) > pos.getY(hi)) hi = i;
    }
    if (lo < 0) return;
    const model = this.player.model, par = sock.parent;
    model.updateMatrixWorld(true);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    m.getVertexPosition(lo, a); m.localToWorld(a);
    m.getVertexPosition(hi, b); m.localToWorld(b);
    this._quiverFoot = par.worldToLocal(a.clone());
    this._quiverTop = par.worldToLocal(b.clone());
    this._qAx = new THREE.Vector3(1, 0, 0); this._qPush = 0;
    this._quiverHang = par.worldToLocal(a.lerp(b, this.entry?.extras?.r5StowKit?.stow?.quiver?.hangK ?? 0.65));
    const Qm = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    this._pelvisBindQ = par.getWorldQuaternion(new THREE.Quaternion()).premultiply(Qm);
  }

  /**
   * Per frame, no allocation: turn the hanger back by QUIVER_HOLD of what the pelvis turned, about the band.
   * (A-alloc-rate: three.js is called only with objects; the slerp and the axis turns are written into the
   * quaternions' own fields, because a double handed to a call boxes in V8's mid tier. A bone's Euler `rotation`
   * is not re-derived: nothing reads it.)
   */
  _solveQuiver(dt = 0) {
    const sock = this.quiverSocket, h = this._quiverHang, bind = this._pelvisBindQ;
    if (!sock || !h || !bind) return;
    const par = sock.parent, model = this.player.model;
    par.getWorldQuaternion(_qA);                       // pelvis, world
    model.getWorldQuaternion(_qB).invert();
    _qA.premultiply(_qB);                              // pelvis, character space
    // the turn from bind, seen in the pelvis's frame: P = B * D  ->  D = B^-1 * P
    _qC.copy(bind).invert().multiply(_qA);
    _qB.copy(_qC).invert();                            // undo it
    // crouched, the pelvis's tilt is what lifts the foot off the ground: let her fold over it
    const an = this.player.animator;
    let crouch = 0;
    if (an) { crouch = an._crouchW; if (!(crouch > 0)) crouch = 0; else if (crouch > 1) crouch = 1; }
    let hold = this.quiverHold;
    if (!(hold >= 0)) hold = QUIVER_HOLD;
    _slerpFromId(sock.quaternion, _qB, hold * (1 - crouch));
    // lance in hand she leads with that hip, and the elbow would stand in the arrows: it shoves the mouth back
    const swingTo = (this.hidden & PIECE.lance) ? 1 : 0;
    let k = dt * QUIVER_SWING_RATE;
    if (!(k > 0)) k = 0; else if (k > 1) k = 1;
    this._quiverSwing += (swingTo - this._quiverSwing) * k;
    if (this._quiverSwing > 0.001) {
      _vA.set(1, 0, 0).applyQuaternion(_qD.copy(bind).invert());   // character X, in the pelvis's bind frame
      _axisAngle(_qS, _vA, -QUIVER_LANCE_SWING * this._quiverSwing);
      sock.quaternion.multiply(_qS);
      _vA.set(0, 0, 1).applyQuaternion(_qD);                        // character Z, likewise
      _axisAngle(_qS, _vA, -QUIVER_LANCE_ROLL * this._quiverSwing);
      sock.quaternion.multiply(_qS);
    }
    // FIX ROUND 1 (judges: "the quiver into the right sleeve at a sprint, into the shin in the heavy"): her right arm
    // pushes the quiver's upper half away where it comes within QUIVER_CLEAR of it, and her right shin its lower
    // half, as a strap-hung tube is pushed: a turn about the band, eased in fast and out slowly
    if (an?.b?.loArmR && this._quiverTop) this._pushQuiver(an, sock, h, dt);
    // about the band: p' = q p + t, with t = h - q h
    _vA.copy(h).applyQuaternion(sock.quaternion);
    sock.position.copy(h).sub(_vA);
    sock.updateWorldMatrix(false, false);
  }

  /**
   * The arm's and the shin's push on the quiver (fix round 1), in the pelvis's frame: the closest approach of the
   * right upper arm + forearm to the tube from the band up, and of the right shin to the tube from the band down. A
   * gap under QUIVER_CLEAR turns the tube about the band by what it takes to open it (capped), along the shortest
   * way out; `sock.quaternion` takes that turn after the hold. No allocation: module scratch and typed slots only.
   */
  _pushQuiver(an, sock, h, dt) {
    const par = sock.parent;
    _mQ.copy(par.matrixWorld).invert();
    const b = an.b;
    b.handR.bone.updateWorldMatrix(true, false);       // (the arm's chain, posed this frame)
    _pA.setFromMatrixPosition(b.upArmR.bone.matrixWorld).applyMatrix4(_mQ);
    _pB.setFromMatrixPosition(b.loArmR.bone.matrixWorld).applyMatrix4(_mQ);
    _pC.setFromMatrixPosition(b.handR.bone.matrixWorld).applyMatrix4(_mQ);
    // the tube's top and foot now (the hold already in sock.quaternion), about the band
    _pT.copy(this._quiverTop).sub(h).applyQuaternion(sock.quaternion).add(h);
    _pF.copy(this._quiverFoot).sub(h).applyQuaternion(sock.quaternion).add(h);
    const QS = _QS;
    QS[0] = 9; QS[3] = 0;
    // upper half vs the arm (two segments), lower half vs the shin
    _segPush(_pA, _pB, h, _pT, QS);
    _segPush(_pB, _pC, h, _pT, QS);
    if (b.calfR && b.footR) {
      b.footR.bone.updateWorldMatrix(true, false);
      _pA.setFromMatrixPosition(b.calfR.bone.matrixWorld).applyMatrix4(_mQ);
      _pB.setFromMatrixPosition(b.footR.bone.matrixWorld).applyMatrix4(_mQ);
      _segPush(_pA, _pB, h, _pF, QS);
    }
    // the turn that opens the worst gap: about axis = tube x push, by (clear - gap) / lever
    let want = 0;
    if (QS[0] < QUIVER_CLEAR) {
      want = (QUIVER_CLEAR - QS[0]) / (QS[3] > 0.05 ? QS[3] : 0.05);
      if (want > QUIVER_PUSH_MAX) want = QUIVER_PUSH_MAX;
      // axis = (point on the tube - h) x (push direction): turning the tube point along the push
      const tx = QS[4] - h.x, ty = QS[5] - h.y, tz = QS[6] - h.z, px = QS[1], py = QS[2], pz = QS[7];
      let ax = ty * pz - tz * py, ay = tz * px - tx * pz, az = tx * py - ty * px;
      const al = (ax * ax + ay * ay + az * az) ** 0.5;
      if (al > 1e-6) { ax /= al; ay /= al; az /= al; const k = 0.5; this._qAx.x += (ax - this._qAx.x) * k; this._qAx.y += (ay - this._qAx.y) * k; this._qAx.z += (az - this._qAx.z) * k; }
    }
    let k = dt * (want > this._qPush ? 24 : 5);
    if (!(k > 0)) k = 0; else if (k > 1) k = 1;
    this._qPush += (want - this._qPush) * k;
    if (this._qPush > 0.002) {
      _vB.copy(this._qAx);
      const l = (_vB.x * _vB.x + _vB.y * _vB.y + _vB.z * _vB.z) ** 0.5;
      if (l > 1e-6) {
        _vB.x /= l; _vB.y /= l; _vB.z /= l;
        _axisAngle(_qS, _vB, this._qPush);
        sock.quaternion.premultiply(_qS);
      }
    }
  }

  attach() {
    if (this.attached || !this.entry) return this;
    const needsQuiverSocket = (() => { let n = false; this.entry.root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton.bones.some((b) => b.name === QUIVER_SOCKET)) n = true; }); return n; })();
    if (needsQuiverSocket) this._ensureQuiverSocket();
    const needsSocket = (() => { let n = false; this.entry.root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton.bones.some((b) => b.name === LANCE_SOCKET)) n = true; }); return n; })();
    if (needsSocket) this._ensureSocket();
    this.meshes = bindPart(this.player.model, this.entry.root, 'stowkit', { castShadow: false });
    for (const m of this.meshes) {
      this.u = installPieceMask(m.material);
      m.userData.orbitGear = true;        // the camera's body-clearance proxy samples it (player.js)
    }
    this.attached = true;
    this.setHidden(this.hidden);
    if (needsSocket && !this.carry) this._initCarry();
    if (needsQuiverSocket) this._initQuiver();
    return this;
  }

  /**
   * The carry solve's bind data, once, at the FIRST attach (Player
   * constructor: the skeleton is still in its bind pose — the animator does
   * not exist yet): the lance's butt and tip are the lowest / highest lance
   * vertices of the skinned kit.
   */
  _initCarry() {
    const m = this.meshes[0];
    if (!m || !this.socket) return;
    const g = m.geometry, P = g.getAttribute('_piece'), pos = g.getAttribute('position');
    if (!P) return;
    let lo = -1, hi = -1;
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & PIECE.lance) === 0) continue;
      if (lo < 0 || pos.getY(i) < pos.getY(lo)) lo = i;
      if (hi < 0 || pos.getY(i) > pos.getY(hi)) hi = i;
    }
    if (lo < 0) return;
    this.player.model.updateMatrixWorld(true);
    const bw = new THREE.Vector3(), tw = new THREE.Vector3();
    m.getVertexPosition(lo, bw); m.localToWorld(bw);
    m.getVertexPosition(hi, tw); m.localToWorld(tw);
    const B = boneIndex(this.player.model);
    this.carry = new LanceCarry(this.player, this.socket, bw, tw, {
      pelvis: B.get('pelvis'), neck: B.get('neck_01'), spine2: B.get('spine_02'), spine3: B.get('spine_03'),
    });
  }

  /**
   * Per frame (HeroRig.update, after the animator): pose the lance socket by
   * the carry solve. Off while the stowed lance is collapsed (drawn).
   */
  solve(an, dt) {
    const SC = an?._stowCap;
    if (SC) SC.on = false;
    if (this.attached && this.quiverSocket) this._solveQuiver(dt);
    if (!this.carry || !this.attached || !an?.skull) return;
    if (this.hidden & PIECE.lance) { if (this.carry.out.active) this.carry.reset(); return; }
    const aimW = an.aimWeight ?? 0;
    this.carry.update(an, aimW, aimW > 0.05, dt, this.player.ctx?.camera || null);
    // fix round 5: hand the solved shaft to the spring solver (world), so no
    // dyn_ chain — the wrap tail, the knot tail — passes through the lance
    if (SC) {
      const m = this.player.model.matrixWorld;
      SC.a.copy(this.carry.butt).applyMatrix4(m);
      SC.b.copy(this.carry.tip).applyMatrix4(m);
      SC.on = true;
    }
  }

  /** The carry solve's last report (gate A-lance-stow), or null. */
  carryInfo() {
    if (!this.carry) return null;
    const c = this.carry, o = c.out;
    const nul = (v) => (v === v ? v : null);      // (the solve writes NaN for "not measured this frame")
    return { ...o, armGap: nul(o.armGap), camGap: nul(o.camGap), tailGap: nul(o.tailGap), butt: c.butt.toArray(), tip: c.tip.toArray(), len: c.len, alpha0: c.alpha0 * 180 / Math.PI };
  }

  /** Remove the socket bone too (HeroRig.dispose). */
  dispose() {
    const r = this.detach();
    if (this.socket) { this.socket.removeFromParent(); this.socket = null; }
    if (this.quiverSocket) { this.quiverSocket.removeFromParent(); this.quiverSocket = null; }
    this._quiverHang = null; this._pelvisBindQ = null; this._quiverTop = null; this._quiverFoot = null;
    this.carry = null;
    return r;
  }

  /** Bitmask of pieces to collapse (PIECE.*). */
  setHidden(bits) {
    this.hidden = bits | 0;
    if (this.u) this.u.value = this.hidden;
  }

  detach() {
    const SC = this.player?.animator?._stowCap;
    if (SC) SC.on = false;                    // fix round 5: no stale lance capsule in the spring solver
    if (!this.attached) return { skeletons: 0 };
    const r = releasePart(this.meshes, this.player);
    this.meshes = [];
    this.attached = false;
    return r;
  }

  info() {
    let tris = 0;
    for (const m of this.meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    return { attached: this.attached, meshes: this.meshes.length, tris, hidden: this.hidden, extras: this.entry?.extras?.r5StowKit ?? null };
  }
}
