/**
 * THE PINE WINDWALL ON HER LEFT FOREARM (Milestone 2 area D, wave 3; the verbs' rules are src/combat/windwall.js
 * WindwallState, stepped here on sim time). Installed on PlayerAnimator (installMethods); it runs after the gaff layer
 * and owns her LEFT arm while the Windwall is up, being planted or lifted.
 *
 * The Windwall never leaves her forearm on the way up: the held copy (src/combat/windwall.js HeldWindwall) takes the
 * stowed copy's exact place on `lowerarm_l` (the kit's own bind placement, `extras.r5OroKit.stow.windwall`: the rivet
 * over the back of the wrist, the slats along the forearm), the stowed piece folds the same step, and the fan opens on
 * the forearm as the arm comes up across her front. Its face is the back of her forearm, so the fan opens in the plane
 * the forearm's back faces, from the elbow's side over the top.
 *
 * THE GUARD. The upper arm down at her side, the forearm level across the bottom of her ribs (the wrist in front of her
 * right ribs), its back turned out: the fan opens from the elbow down and round under the forearm (the recipe's SWEEP),
 * so its crescent hangs in front of her body from the forearm to her hips, its top the forearm's line, under her
 * shoulders, and nothing behind her head (Kevin's bars: a hand, forearm or the fan never above a shoulder joint or
 * behind the head plane). THE BASH drives the guard forward and her hips with it. THE PLANT crouches and sets the fan
 * upright on its chord on the ground in front of her (src/combat/windwall.js plantShape; combat puts the occluder in);
 * the arm comes back bare. THE PICK-UP reverses it.
 */
import * as THREE from 'three';
import { ease } from './handling.js';
import { WINDWALL, WINDWALL_FAN } from '../../combat/windwall.js';

const RAW_TO_GAME = 0.969;   // the kit's bind units (kit-oro.mjs)
const Y_UP = new THREE.Vector3(0, 1, 0);

/** The guard: the wrist off her left shoulder (char, +x her left), the elbow's pole, the fan's face (the forearm's back). */
export const GUARD = {
  fromShoulder: new THREE.Vector3(-0.18, -0.21, 0.22),
  pole: new THREE.Vector3(0.10, -1.0, 0.20).normalize(),
  face: new THREE.Vector3(0.0, 0.05, 1.0).normalize(),
};
/** After the plant the arm comes back up bare over this long (s), the crouch with it. */
const PLANT_BACK = 0.3;
/** The bash: the guard driven this far forward (m) at its peak, the hips with it. */
const BASH_DRIVE = 0.14, BASH_HIPS = 0.08;
/** The plant: she crouches this far (pelvis, m) and sets the fan's foot this far in front of her (m) on the ground. */
const PLANT_DROP = 0.32;

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _me = { x: 0, y: 0, z: 0, heading: 0 };

export class WindwallLayer {
  _wwState() {
    return this._wwS || (this._wwS = { w: 0, local: null, pdy: 0, pdz: 0, simT: 0, faceErrDeg: null, phase: 'stowed', planted: null });
  }

  /** The handling record for the rows. */
  wwInfo(out = {}) {
    const S = this._wwState(), ww = this.ctx.combat?.windwall;
    out.phase = ww?.phase ?? 'none'; out.open = ww?.open ?? 0; out.w = S.w; out.pdy = S.pdy; out.pdz = S.pdz; out.faceErrDeg = S.faceErrDeg;
    return out;
  }

  /**
   * The held fan's place on `lowerarm_l` (bone-local, once): the stowed copy's bind placement carried into the bone's
   * frame through the kit's own skin (boneInverse x bindMatrix), the held mesh (metres) scaled into bind units.
   */
  _wwLocal() {
    const S = this._wwState();
    if (S.local) return S.local;
    // the fit to what is drawn first (the stowed piece's own skinned vertices); the recipe's placement only without it
    const fit = this._wwFit();
    if (fit) { S.local = fit; return fit; }
    const K = this._oroKit, m = K?.meshes?.[0];
    const st = K?.entry?.extras?.r5OroKit?.stow?.windwall;
    if (!m?.skeleton || !st) return null;
    const bi = m.skeleton.bones.findIndex((b) => b.name === 'lowerarm_l');
    if (bi < 0) return null;
    const ax = new THREE.Vector3(...st.along).normalize(), fc = new THREE.Vector3(...st.face).normalize();
    const X = new THREE.Vector3().crossVectors(ax, fc);
    const B = new THREE.Matrix4().makeBasis(X, ax, fc).setPosition(...st.pivot);
    B.multiply(new THREE.Matrix4().makeScale(1 / RAW_TO_GAME, 1 / RAW_TO_GAME, 1 / RAW_TO_GAME));
    // the kit's positions are quantized (meshopt): its skin's inverse binds carry the dequantization, which the recipe's
    // bind-space placement has not got. It is read back off the kit's own joint at rest (its bind): Dq = joint x IBM.
    const root = K.entry.root;
    let src = null, sb = null;
    root.updateMatrixWorld(true);
    root.traverse((o) => { if (!src && o.isSkinnedMesh) src = o; });
    const sbi = src ? src.skeleton.bones.findIndex((x) => x.name === 'lowerarm_l') : -1;
    if (sbi < 0) return null;
    sb = src.skeleton.bones[sbi];
    const Dq = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(sb.matrixWorld).multiply(src.skeleton.boneInverses[sbi]);
    const L = new THREE.Matrix4().copy(m.matrixWorld).multiply(m.bindMatrixInverse);
    // (the bound mesh's own frame under her armature: the bone's world is read through it, then taken back out)
    const bw = m.skeleton.bones[bi]; bw.updateWorldMatrix(true, false);
    L.multiply(bw.matrixWorld).multiply(m.skeleton.boneInverses[bi]).multiply(m.bindMatrix).multiply(Dq.invert()).multiply(B);
    L.premultiply(new THREE.Matrix4().copy(bw.matrixWorld).invert());
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    L.decompose(pos, q, sc);
    S.local = { pos, q, sc, bone: m.skeleton.bones[bi] };
    return S.local;
  }

  /**
   * The held fan's place on `lowerarm_l` fitted to the stowed copy AS IT IS DRAWN (M2 wave 3: at 8d5ec5b the recipe's
   * bind placement put the held fan at half size below her wrist in the page while it sat right in Node): the stowed
   * piece's skinned vertices in the bone's frame against the held mesh's own vertices closed the same way (the fan at
   * `WINDWALL_FAN.closed`, as the vertex program does), matched by their centroids, their principal axes (signs by
   * each axis's third moment) and their spread. Pose-independent (both are rigid on the forearm); once.
   */
  _wwFit() {
    const K = this._oroKit, m = K?.meshes?.[0], prop = this.ctx.combat?.windwall?.prop;
    if (!m?.skeleton || !prop?.u) return null;
    const P = m.geometry.getAttribute('_piece');
    const bone = m.skeleton.bones.find((b) => b.name === 'lowerarm_l');
    if (!P || !bone) return null;
    this.model.updateMatrixWorld(true);
    m.skeleton.update();
    const binv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const A = [], v = new THREE.Vector3();
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      if ((Math.round(P.getX(i)) & 2) === 0) continue;
      m.getVertexPosition(i, v); m.localToWorld(v); v.applyMatrix4(binv);
      A.push(v.x, v.y, v.z);
    }
    // the held mesh in its group's frame, closed as the vertex program closes it
    const g = prop.group, Bp = [];
    const k = -(WINDWALL_FAN.spreadDeg * Math.PI / 180) / (WINDWALL_FAN.slats - 1) * WINDWALL_FAN.closed;
    g.updateMatrixWorld(true);
    const gInv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    g.traverse((o) => {
      if (!o.isMesh) return;
      const ps = o.geometry.getAttribute('position'), sl = o.geometry.getAttribute('_slat');
      const M = new THREE.Matrix4().copy(gInv).multiply(o.matrixWorld);
      for (let i = 0; i < ps.count; i++) {
        let x = ps.getX(i), y = ps.getY(i);
        const a = (sl ? sl.getX(i) : 0) * k, c = Math.cos(a), sn = Math.sin(a);
        const xr = c * x - sn * y, yr = sn * x + c * y;
        v.set(xr, yr, ps.getZ(i)).applyMatrix4(M);
        Bp.push(v.x, v.y, v.z);
      }
    });
    if (A.length < 30 || Bp.length < 30) return null;
    const fa = frameOf(A), fb = frameOf(Bp);
    // the scale is known, not fitted (the two LODs spread their vertices differently): the held mesh is in metres of
    // her model's space; the bone's own scale against her model's is taken out (as the gaff's hand-to-prop map does)
    const e = bone.matrixWorld.elements, me = this.model.matrixWorld.elements;
    const sc = Math.hypot(me[0], me[1], me[2]) / (Math.hypot(e[0], e[1], e[2]) || 1);
    // rotation: held axes -> stowed axes
    const Ra = new THREE.Matrix4().makeBasis(fa.ax[0], fa.ax[1], fa.ax[2]);
    const Rb = new THREE.Matrix4().makeBasis(fb.ax[0], fb.ax[1], fb.ax[2]);
    const R = Ra.multiply(Rb.transpose());
    const q = new THREE.Quaternion().setFromRotationMatrix(R);
    const p = fb.c.clone().multiplyScalar(sc).applyQuaternion(q).negate().add(fa.c);
    return { pos: p, q, sc: new THREE.Vector3(sc, sc, sc), bone, fit: { n: [A.length / 3, Bp.length / 3], scale: +sc.toFixed(4), spreadK: +Math.sqrt(fa.spread / fb.spread / (sc * sc)).toFixed(3) } };
  }

  /** The held fan on her forearm at the stowed copy's place (or hidden). */
  _wwShow(prop, on) {
    const g = prop?.group;
    if (!g) return;
    const L = this._wwLocal();
    if (!on || !L || !prop.u) { if (g.visible && g.parent === L?.bone) g.visible = false; return; }
    if (g.parent !== L.bone) L.bone.add(g);
    g.position.copy(L.pos); g.quaternion.copy(L.q); g.scale.copy(L.sc);
    g.visible = true;
  }

  /**
   * Each step after the gaff layer. Returns the arm weight it took. `pdy`/`pdz` (the bash's drive, the plant's crouch)
   * are read by the animator into the pelvis offset.
   */
  _wwLayer(dt) {
    const S = this._wwState();
    S.pdy = 0; S.pdz = 0;
    const ww = this.ctx.combat?.windwall, K = this._oroKit, b = this.b;
    if (!ww?.owned || !K?.attached || !b.handL || !b.upArmL || !b.loArmL) { S.w = 0; return 0; }
    const p = this.ctx.player;
    _me.x = p?.position?.x ?? 0; _me.y = p?.position?.y ?? 0; _me.z = p?.position?.z ?? 0; _me.heading = p?.heading ?? 0;
    const was = ww.phase;
    const ev = ww.step(dt, _me);
    S.phase = ww.phase;
    if (ev) { try { ww.onEvent?.(ev, ww); } catch (e) { console.warn('[windwall] event', e); } }
    const prop = ww.prop;
    // the arm's weight by phase
    let w = 0, drive = 0, drop = 0;
    const W = WINDWALL;
    switch (ww.phase) {
      case 'opening': w = ease(Math.min(1, ww.t / W.openS)); break;
      case 'guard': w = 1; break;
      case 'bash': { w = 1; const u = Math.min(1, ww.t / W.bashS); drive = Math.sin(Math.PI * Math.min(1, u / 0.7)) * (u < 0.7 ? 1 : 0); break; }
      case 'planting': { w = 1; drop = ease(Math.min(1, ww.t / (W.plantS * 0.7))); break; }
      case 'closing': w = 1 - ease(Math.min(1, ww.t / W.closeS)); break;
      default: w = 0;
    }
    if (ww.phase === 'planted' && ww.t < PLANT_BACK) { const k = ease(ww.t / PLANT_BACK); w = 1 - k; drop = 1 - k; }
    S.w = w;
    // the held copy on her forearm, the stowed one folded, while it is off the stowed place; planted, it stands on the
    // ground where she set it (a child of the scene) and her forearm is bare
    const up = ww.phase !== 'stowed' && ww.phase !== 'planted';
    K.setHeld?.((K.held & ~2) | (up || ww.phase === 'planted' ? 2 : 0));
    if (ev === 'planted' && ww.plantedAt) this._wwPlantProp(prop, ww.plantedAt);
    if (ww.phase !== 'planted') this._wwShow(prop, up);
    prop?.setOpen?.(ww.open);
    if (w < 1e-3) return 0;
    // ---- the body: the bash's hips, the plant's crouch
    S.pdz = BASH_HIPS * drive;
    S.pdy = -PLANT_DROP * drop;
    // ---- the arm: the guard off the shoulder; the bash drives it forward; the plant takes it down to the ground
    this._charOf(b.upArmL.bone, _v1);
    _v2.copy(_v1).add(GUARD.fromShoulder);
    _v2.z += BASH_DRIVE * drive;
    if (drop > 0) { _v2.y -= 0.22 * drop; _v2.z += 0.12 * drop; }
    this._ikArm('l', _v2, GUARD.pole, w, null);
    // the forearm's back onto the guard's face: twist the forearm about its own line (the hand rides it)
    this._wwTwist(GUARD.face, w);
    return w;
  }

  /**
   * The planted fan in the world: open, its chord stood upright on the ground `WINDWALL.plantAhead` in front of where
   * she knelt, its face square to her heading (src/combat/windwall.js plantShape is its cover). A child of the scene.
   */
  _wwPlantProp(prop, at) {
    const g = prop?.group, scene = this.ctx.scene;
    if (!g || !scene) return;
    const T = WINDWALL_FAN, L = 0.47, k = -(T.spreadDeg * Math.PI / 180) / (T.slats - 1);
    // the open tips in the group's plane, then the turn about +Z that stands the chord (slat 0's tip to slat 8's) upright
    const tip = (s) => [-Math.sin(s * k) * L, Math.cos(s * k) * L];
    const a = tip(0), c = tip(T.slats - 1);
    const roll = -Math.PI / 2 - Math.atan2(c[1] - a[1], c[0] - a[0]);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    let minY = 0, midX = 0;
    for (let s = 0; s < T.slats; s++) { const [x, y] = tip(s); const ry = sr * x + cr * y; if (ry < minY) minY = ry; }
    { const ax = cr * a[0] - sr * a[1], cx = cr * c[0] - sr * c[1]; midX = (ax + cx) / 2; }
    scene.add(g);
    g.quaternion.setFromAxisAngle(Y_UP, at.heading);
    g.quaternion.multiply(_q1.setFromAxisAngle(_v1.set(0, 0, 1), roll));
    g.scale.setScalar(1);
    const fx = Math.sin(at.heading), fz = Math.cos(at.heading), rx = Math.cos(at.heading), rz = -Math.sin(at.heading);
    const gy = this.ctx.terrain?.getHeight?.(at.x + fx * WINDWALL.plantAhead, at.z + fz * WINDWALL.plantAhead) ?? at.y;
    g.position.set(at.x + fx * WINDWALL.plantAhead - rx * midX, gy - minY, at.z + fz * WINDWALL.plantAhead - rz * midX);
    g.visible = true;
    prop.setOpen?.(1);
  }

  /** Twist the left forearm about its line so its back (the fan's face) turns toward `face` (char), by weight `w`. */
  _wwTwist(face, w) {
    const S = this._wwState(), L = this._wwLocal(), b = this.b;
    if (!L) return;
    const el = this._charOf(b.loArmL.bone, _v1), wr = this._charOf(b.handL.bone, _v2);
    const axis = _v3.subVectors(wr, el).normalize();
    // the fan's face now: the held group's +Z through the bone's live char orientation
    this._liveW(b.loArmL.bone, _q1);
    const f = _v4.set(0, 0, 1).applyQuaternion(L.q).applyQuaternion(_q1);
    f.addScaledVector(axis, -f.dot(axis));
    const t = new THREE.Vector3().copy(face).addScaledVector(axis, -face.dot(axis));
    if (f.lengthSq() < 1e-8 || t.lengthSq() < 1e-8) return;
    f.normalize(); t.normalize();
    let a = Math.acos(Math.max(-1, Math.min(1, f.dot(t))));
    if (new THREE.Vector3().crossVectors(f, t).dot(axis) < 0) a = -a;
    _q2.setFromAxisAngle(axis, a * w);
    this.space.rotCharQ(b.loArmL, _q2, false);
    // what is left: the face after the twist against the guard's whole face (the twist cannot take out the part of the
    // face along the forearm's own line)
    this._liveW(b.loArmL.bone, _q1);
    const f2 = _v4.set(0, 0, 1).applyQuaternion(L.q).applyQuaternion(_q1).normalize();
    S.faceErrDeg = +(Math.acos(Math.max(-1, Math.min(1, f2.dot(face)))) * 180 / Math.PI).toFixed(1);
  }
}

/** Centroid, principal axes (largest first; each signed by its third moment; right-handed) and the mean square spread. */
function frameOf(arr) {
  const n = arr.length / 3, c = new THREE.Vector3();
  for (let i = 0; i < arr.length; i += 3) { c.x += arr[i]; c.y += arr[i + 1]; c.z += arr[i + 2]; }
  c.multiplyScalar(1 / n);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < arr.length; i += 3) {
    const d = [arr[i] - c.x, arr[i + 1] - c.y, arr[i + 2] - c.z];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) C[r][q] += d[r] * d[q] / n;
  }
  const { vals, vecs } = jacobi3(C);
  const order = [0, 1, 2].sort((a, b) => vals[b] - vals[a]);
  const ax = order.map((j) => new THREE.Vector3(vecs[0][j], vecs[1][j], vecs[2][j]).normalize());
  for (let a = 0; a < 2; a++) {
    let m3 = 0;
    for (let i = 0; i < arr.length; i += 3) { const t = (arr[i] - c.x) * ax[a].x + (arr[i + 1] - c.y) * ax[a].y + (arr[i + 2] - c.z) * ax[a].z; m3 += t * t * t; }
    if (m3 < 0) ax[a].negate();
  }
  ax[2] = new THREE.Vector3().crossVectors(ax[0], ax[1]).normalize();
  return { c, ax, spread: vals[0] + vals[1] + vals[2] };
}

/** Eigen-decomposition of a symmetric 3x3 (cyclic Jacobi): vals, vecs (columns). */
function jacobi3(A0) {
  const A = A0.map((r) => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) off += A[p][q] * A[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(A[p][q]) < 1e-30) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { vals: [A[0][0], A[1][1], A[2][2]], vecs: V };
}
