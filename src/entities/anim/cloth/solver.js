/**
 * CLOTH: the solver. One small XPBD particle solver for every piece of cloth: particle grids for sheets, strands as
 * grids one column wide. CPU, typed arrays, no allocation per frame, no three.js inside the solve.
 *
 * Per frame (`ClothSystem.update`):
 *   1. each root's frame (the pelvis for the sash panels, the head for the wrap's tail) is read; the motion since last
 *      frame is split into what the free particles are CARRIED with and what becomes LAG (the material's shares:
 *      linear, vertical, yaw), the root velocity fed in changing by at most `vFedMax` a frame; a root that jumps more
 *      than RESEAT_D re-seats the piece;
 *   2. the sleep test (every particle still relative to its root for SLEEP_T, still air, a still root): an asleep
 *      piece rides its root rigidly and costs one test;
 *   3. the air on every particle (aero.js), once a frame;
 *   4. n substeps of h = dt / n, n = round(dt / SUB_H) in [1, SUB_MAX] (1/240 s at 60 Hz: 4; 2 at 120 Hz, 8 at 30 Hz,
 *      so the cloth runs at the same speed whatever the frame rate, and the slate's fixed dt gives a fixed count):
 *        carry -> predict (gravity 9.81, the air, damping relative to the carried frame) -> pins on the root ->
 *        distance constraints (structural and shear at their compliance, bending as distances two apart, the tongues'
 *        minimum distance) -> long-range attachment (no particle further from its column's pin than its rest path x
 *        slack) -> colliders (tapered capsules, swept props, the ground; Coulomb friction; the body wins over the
 *        ground and a pinched particle's velocity is zeroed) -> v = (x - x') / h, capped at V_CAP;
 *   5. the timing goes to a preallocated ring buffer (no `performance.measure`).
 *
 * `reset()` is deterministic: every particle to its bind place on the root as it is now, velocities 0, then
 * RESET_SUBSTEPS substeps in still air with the root and the colliders held. No Math.random, no wall clock.
 */
import { SUB_H, SUB_MAX, V_CAP, SLEEP_V, SLEEP_T, SLEEP_WIND, SLEEP_ACC, RESET_SUBSTEPS, RESEAT_D } from './materials.js';
import { at, collideCapsule, collideGround, pushOut } from './colliders.js';
import { aeroForces } from './aero.js';

const G = 9.81;
/** Constraint, attachment and collider passes a substep. */
const ITERS = 2;
const _n = new Float64Array(3);

/** A root frame: position, rotation (quaternion x y z w), uniform scale; last frame's and this frame's. */
export function makeRoot(name) {
  return {
    name, p: new Float64Array(3), q: new Float64Array(4), s: 1, pp: new Float64Array(3), pq: new Float64Array(4), ps: 1,
    // this substep's interpolated frame
    ip: new Float64Array(3), iq: new Float64Array(4),
    vFed: new Float64Array(3), vPrev: new Float64Array(3), acc: 0, primed: false, jumped: false, yawD: 0,
    _fedFrame: -1, bone: null,
  };
}

function qrot(q, x, y, z, out, o) {
  // out[o..o+2] = q * (x, y, z)
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  out[o] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[o + 1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[o + 2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
}

function nlerpQ(a, b, f, out) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1, g = 1 - f;
  let x = a[0] * g + b[0] * f * s, y = a[1] * g + b[1] * f * s, z = a[2] * g + b[2] * f * s, w = a[3] * g + b[3] * f * s;
  d = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  out[0] = x / d; out[1] = y / d; out[2] = z / d; out[3] = w / d;
}

/** The yaw (rad, about world up) of a frame's `fwd` axis (root-local) under rotation q. */
function yawOf(q, fwd) {
  qrot(q, fwd[0], fwd[1], fwd[2], _n, 0);
  return Math.atan2(_n[0], _n[2]);
}

/**
 * A piece: `C` columns x `R` rows of particles, index c + r * C (row 0 at the root). Built from the particles' world
 * places in the current pose (`X`, Float64Array 3n) and their root as it is now; `pinned` marks the particles that ride
 * the root; `cons` the distance constraints `[i, j, alpha, kind]` (kind 0 equal, 1 at least the rest) at their
 * built length; `lraPin[i]` the pin a particle may not stray from (or -1); `mass[i]` kg; `area[i]` m2 for the air.
 */
export class ClothPiece {
  constructor({ name, mat, C, R, X, Q0 = null, root, pinned, cons, lraPin, mass, area, mask, off, offPerCollider = null, ground = true }) {
    const n = C * R;
    this.name = name; this.mat = mat; this.C = C; this.R = R; this.n = n; this.root = root; this.mask = mask;
    this.off = off; this.offC = offPerCollider; this.ground = ground;
    this.x = new Float64Array(n * 3); this.xp = new Float64Array(n * 3); this.v = new Float64Array(n * 3);
    this.f = new Float64Array(n * 3); this.nrm = new Float64Array(n * 3);
    this.q0 = new Float64Array(n * 3);         // bind place on the root (root-local, unscaled)
    this.qs = new Float64Array(n * 3);         // asleep: the place on the root it sleeps at
    this.ql = new Float64Array(n * 3);         // last frame's place in the root's frame (the sleep clock)
    this.relV = 0;
    this.w = new Float64Array(n); this.m = new Float64Array(n); this.area = new Float64Array(n);
    this.contact = new Uint8Array(n); this.pinch = new Uint8Array(n);
    // root-local bind places: given (`Q0`, then X is the canonical grid, Q0 x the root's scale, and every length below
    // is a function of the assets only: the same bits whatever pose the rig was built in), or q0 = R^-1 (X - p) / s
    if (Q0) this.q0.set(Q0);
    else {
      const iq = [-root.q[0], -root.q[1], -root.q[2], root.q[3]];
      for (let i = 0; i < n; i++) { const k = i * 3; qrot(iq, (X[k] - root.p[0]) / root.s, (X[k + 1] - root.p[1]) / root.s, (X[k + 2] - root.p[2]) / root.s, this.q0, k); }
    }
    for (let i = 0; i < n; i++) { this.w[i] = pinned[i] ? 0 : 1 / mass[i]; this.m[i] = mass[i]; this.area[i] = area[i]; }
    this.placeOnRoot(root.p, root.q, root.s, true);
    this.xp.set(this.x);
    const nc = cons.length;
    this.ci = new Int32Array(nc * 2); this.cr = new Float64Array(nc); this.ca = new Float64Array(nc); this.ck = new Uint8Array(nc);
    for (let c = 0; c < nc; c++) {
      const [i, j, alpha, kind] = cons[c];
      this.ci[c * 2] = i; this.ci[c * 2 + 1] = j; this.ca[c] = alpha; this.ck[c] = kind || 0;
      this.cr[c] = Math.hypot(X[i * 3] - X[j * 3], X[i * 3 + 1] - X[j * 3 + 1], X[i * 3 + 2] - X[j * 3 + 2]);
    }
    this.nc = nc;
    // long-range attachment: the rest path from the column's pin, down the column
    this.lraPin = new Int32Array(n).fill(-1); this.lraMax = new Float64Array(n);
    for (let i = 0; i < n; i++) if (lraPin[i] >= 0) {
      const c = i % C;
      let path = 0;
      for (let r = 1; r <= Math.floor(i / C); r++) {
        const a = c + (r - 1) * C, b = c + r * C;
        path += Math.hypot(X[a * 3] - X[b * 3], X[a * 3 + 1] - X[b * 3 + 1], X[a * 3 + 2] - X[b * 3 + 2]);
      }
      // (a pin other than the column's own: the straight distance at bind plus the path past the root row)
      const p = lraPin[i];
      const straight = Math.hypot(X[p * 3] - X[i * 3], X[p * 3 + 1] - X[i * 3 + 1], X[p * 3 + 2] - X[i * 3 + 2]);
      this.lraPin[i] = p; this.lraMax[i] = Math.max(path, straight) * mat.slack;
    }
    this.asleep = false; this.stillT = 0; this.sleeps = 0; this.wakes = 0;
    this.restScale = 1;
    // (declared here, set by the rig: one shape for every piece)
    this._act = null; this.fwd = new Float64Array([0, 0, 1]); this.lee = 0; this.stem = ''; this.kind = '';
    this.pinMask = 0; this.hard = 0.015;
    this.boneOf = null; this.bones = null; this.f0 = null; this.verts = null;
  }

  /** The pins and (when `all`) every particle to their bind place on the root's frame at substep fraction f. */
  placeOnRoot(rp, rq, rs, all, dst) {
    const n = this.n, q0 = all === 2 ? this.qs : this.q0, x = dst || this.x;
    for (let i = 0; i < n; i++) {
      if (!all && this.w[i] !== 0) continue;
      const k = i * 3;
      qrot(rq, q0[k] * rs, q0[k + 1] * rs, q0[k + 2] * rs, x, k);
      x[k] += rp[0]; x[k + 1] += rp[1]; x[k + 2] += rp[2];
    }
  }

  /** Normals from the grid neighbours (into nrm). */
  normals() {
    const C = this.C, R = this.R, x = this.x, N = this.nrm;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = c + r * C, k = i * 3;
      const u0 = (r > 0 ? r - 1 : r) * C + c, u1 = (r < R - 1 ? r + 1 : r) * C + c;
      const s0 = r * C + (c > 0 ? c - 1 : c), s1 = r * C + (c < C - 1 ? c + 1 : c);
      const dx = x[u1 * 3] - x[u0 * 3], dy = x[u1 * 3 + 1] - x[u0 * 3 + 1], dz = x[u1 * 3 + 2] - x[u0 * 3 + 2];
      const ax = x[s1 * 3] - x[s0 * 3], ay = x[s1 * 3 + 1] - x[s0 * 3 + 1], az = x[s1 * 3 + 2] - x[s0 * 3 + 2];
      let nx = ay * dz - az * dy, ny = az * dx - ax * dz, nz = ax * dy - ay * dx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 0; nz = 1; }
      N[k] = nx; N[k + 1] = ny; N[k + 2] = nz;
    }
  }
}

export class ClothSystem {
  constructor() {
    this.pieces = []; this.roots = []; this.colliders = []; this.groundY = 0; this.groundOn = true;
    this.wind = { x: 0, z: 0 };
    this.ring = new Float64Array(600); this.ringN = 0; this.ringI = 0;
    this.clock = null;
    this.frames = 0; this.subTotal = 0;
    this.lastSub = 0;
  }

  addRoot(r) { this.roots.push(r); return r; }
  addPiece(p) { this.pieces.push(p); return p; }
  addCollider(c) { this.colliders.push(c); return c; }

  /** Root `r` is now at p (3), q (4), s: called once a frame before `update`. */
  static setRoot(r, px, py, pz, q, s, dt) {
    if (r.primed) { r.pp.set(r.p); r.pq.set(r.q); r.ps = r.s; }
    r.p[0] = px; r.p[1] = py; r.p[2] = pz; r.q[0] = q[0]; r.q[1] = q[1]; r.q[2] = q[2]; r.q[3] = q[3]; r.s = s;
    r.jumped = false;
    if (!r.primed) { r.pp.set(r.p); r.pq.set(r.q); r.ps = s; r.primed = true; r.vFed.fill(0); r.vPrev.fill(0); return; }
    const dx = r.p[0] - r.pp[0], dy = r.p[1] - r.pp[1], dz = r.p[2] - r.pp[2];
    if (dx * dx + dy * dy + dz * dz > RESEAT_D * RESEAT_D) { r.jumped = true; r.vFed.fill(0); r.vPrev.fill(0); return; }
    const k = dt > 0 ? 1 / dt : 0;
    const vx = dx * k, vy = dy * k, vz = dz * k;
    r.acc = r.acc * 0.8 + 0.2 * Math.sqrt((vx - r.vPrev[0]) ** 2 + (vy - r.vPrev[1]) ** 2 + (vz - r.vPrev[2]) ** 2) * k;
    r.vPrev[0] = vx; r.vPrev[1] = vy; r.vPrev[2] = vz;
  }

  /** One frame of sim time `dt` (s) at sim clock `t` (s). */
  update(dt, t) {
    const t0 = this.clock ? this.clock() : 0;
    if (!(dt > 0)) dt = 1 / 60;
    let n = Math.round(dt / SUB_H);
    n = n < 1 ? 1 : n > SUB_MAX ? SUB_MAX : n;
    const h = dt / n;
    this.lastSub = n;
    const P = this.pieces;
    const ws = Math.sqrt(this.wind.x * this.wind.x + this.wind.z * this.wind.z);
    for (let pi = 0; pi < P.length; pi++) {
      const p = P[pi], r = p.root;
      if (r.jumped) { this._seat(p); continue; }
      // ---- sleep
      if (p.asleep) {
        if (ws >= SLEEP_WIND || r.acc >= SLEEP_ACC || this._propNear(p)) { p.asleep = false; p.wakes++; p.stillT = 0; }
        else { p.placeOnRoot(r.p, r.q, r.s, 2); p.xp.set(p.x); continue; }
      }
      this._stepPiece(p, dt, t, n, h);
      // the sleep clock: every particle still RELATIVE TO ITS ROOT (its place in the root's frame moved under SLEEP_V
      // this frame: an idle's sway carries the cloth, it does not keep it awake), still air, a calm root
      let vmax = 0;
      const q = r.q, ql = p.ql, x = p.x;
      const iqx = -q[0], iqy = -q[1], iqz = -q[2], iqw = q[3], is = 1 / r.s;
      _iq[0] = iqx; _iq[1] = iqy; _iq[2] = iqz; _iq[3] = iqw;
      for (let i = 0; i < p.n; i++) {
        const k = i * 3;
        qrot(_iq, (x[k] - r.p[0]) * is, (x[k + 1] - r.p[1]) * is, (x[k + 2] - r.p[2]) * is, _n, 0);
        if (p.w[i] !== 0) { const a = (_n[0] - ql[k]) ** 2 + (_n[1] - ql[k + 1]) ** 2 + (_n[2] - ql[k + 2]) ** 2; if (a > vmax) vmax = a; }
        ql[k] = _n[0]; ql[k + 1] = _n[1]; ql[k + 2] = _n[2];
      }
      p.relV = Math.sqrt(vmax) / dt;
      if (p.relV < SLEEP_V && ws < SLEEP_WIND && r.acc < SLEEP_ACC) {
        p.stillT += dt;
        if (p.stillT >= SLEEP_T) this._sleep(p);
      } else p.stillT = 0;
    }
    this.frames++; this.subTotal += n;
    if (this.clock) { const ms = this.clock() - t0; this.ring[this.ringI] = ms; this.ringI = (this.ringI + 1) % this.ring.length; if (this.ringN < this.ring.length) this.ringN++; }
  }

  /** A prop capsule moving inside a sleeping piece's reach wakes it. */
  _propNear(p) {
    const C = this.colliders;
    for (let c = 0; c < C.length; c++) {
      const K = C[c];
      if (!K.on || !K.swept || !(p.mask & K.bit)) continue;
      const s = Math.max(Math.abs(K.va[0]), Math.abs(K.va[1]), Math.abs(K.va[2]), Math.abs(K.vb[0]), Math.abs(K.vb[1]), Math.abs(K.vb[2]));
      if (s < 0.05) continue;
      const k = 0; // the piece's first pin as its place
      const dx = K.cx - p.x[k], dy = K.cy - p.x[k + 1], dz = K.cz - p.x[k + 2];
      if (dx * dx + dy * dy + dz * dz < (K.cr + 0.8) ** 2) return true;
    }
    return false;
  }

  _sleep(p) {
    // the place on the root each particle sleeps at (root-local, unscaled)
    const r = p.root, iq = _iq;
    iq[0] = -r.q[0]; iq[1] = -r.q[1]; iq[2] = -r.q[2]; iq[3] = r.q[3];
    for (let i = 0; i < p.n; i++) {
      const k = i * 3;
      qrot(iq, (p.x[k] - r.p[0]) / r.s, (p.x[k + 1] - r.p[1]) / r.s, (p.x[k + 2] - r.p[2]) / r.s, p.qs, k);
    }
    p.v.fill(0); p.asleep = true; p.sleeps++;
  }

  _seat(p) {
    const r = p.root;
    p.placeOnRoot(r.p, r.q, r.s, true);
    p.xp.set(p.x); p.v.fill(0); p.asleep = false; p.stillT = 0;
  }

  _stepPiece(p, dt, t, n, h) {
    const r = p.root, mat = p.mat, sh = mat.share;
    const x = p.x, xp = p.xp, v = p.v, w = p.w, N = p.n;
    // ---- the root's motion this frame: what is carried, what is lag
    const dx = r.p[0] - r.pp[0], dy = r.p[1] - r.pp[1], dz = r.p[2] - r.pp[2];
    const k = 1 / dt;
    // the fed velocity follows the root's at most vFedMax a frame
    {
      let ex = dx * k - r.vFed[0], ey = dy * k - r.vFed[1], ez = dz * k - r.vFed[2];
      const e = Math.sqrt(ex * ex + ey * ey + ez * ez), m = mat.vFedMax;
      if (e > m) { ex *= m / e; ey *= m / e; ez *= m / e; }
      // (one root, several pieces: the first piece of a root this frame moves the fed velocity)
      if (r._fedFrame !== this.frames) { r._fedFrame = this.frames; r.vFed[0] += ex; r.vFed[1] += ey; r.vFed[2] += ez; }
    }
    const cx = (dx - sh.lin * r.vFed[0] * dt) / n, cy = (dy - sh.vert * r.vFed[1] * dt) / n, cz = (dz - sh.lin * r.vFed[2] * dt) / n;
    let yaw = yawOf(r.q, p.fwd) - yawOf(r.pq, p.fwd);
    if (yaw > Math.PI) yaw -= 2 * Math.PI; else if (yaw < -Math.PI) yaw += 2 * Math.PI;
    const cyaw = (1 - sh.yaw) * yaw / n, cs = Math.cos(cyaw), sn = Math.sin(cyaw);
    const rfx = sh.lin * r.vFed[0], rfy = sh.vert * r.vFed[1], rfz = sh.lin * r.vFed[2];
    // ---- the air, once a frame
    p.normals();
    // (her own travel as air: v holds the lag part of it already; `mat.air` more of the fed root velocity is met as wind)
    aeroForces(p, this.wind.x - mat.air * r.vFed[0], this.wind.z - mat.air * r.vFed[2], t);
    const damp = Math.exp(-mat.kd * h);
    const C = this.colliders, mask = p.mask, offC = p.offC;
    // the piece's colliders this frame (by the cull: the collider's swept sphere against the piece's bound)
    let bx0 = 9e9, bx1 = -9e9, by0 = 9e9, by1 = -9e9, bz0 = 9e9, bz1 = -9e9;
    for (let i = 0; i < N; i++) { const q = i * 3; if (x[q] < bx0) bx0 = x[q]; if (x[q] > bx1) bx1 = x[q]; if (x[q + 1] < by0) by0 = x[q + 1]; if (x[q + 1] > by1) by1 = x[q + 1]; if (x[q + 2] < bz0) bz0 = x[q + 2]; if (x[q + 2] > bz1) bz1 = x[q + 2]; }
    const pcx = (bx0 + bx1) / 2 + cx * n, pcy = (by0 + by1) / 2 + cy * n, pcz = (bz0 + bz1) / 2 + cz * n;
    const pr = Math.sqrt((bx1 - bx0) ** 2 + (by1 - by0) ** 2 + (bz1 - bz0) ** 2) / 2 + 0.06 + Math.sqrt(dx * dx + dy * dy + dz * dz);
    const act = p._act || (p._act = new Int32Array(C.length + 1));
    let na = 0;
    for (let c = 0; c < C.length; c++) {
      const K = C[c];
      if (!K.on || !(mask & K.bit)) continue;
      const ex = K.cx - pcx, ey = K.cy - pcy, ez = K.cz - pcz, rr = K.cr + pr;
      if (ex * ex + ey * ey + ez * ez > rr * rr) continue;
      act[na++] = c;
    }
    const gy = this.groundY, gOn = this.groundOn && p.ground;
    for (let s = 0; s < n; s++) {
      const f1 = (s + 1) / n;
      // the root at the end of this substep
      for (let a = 0; a < 3; a++) r.ip[a] = r.pp[a] + (r.p[a] - r.pp[a]) * f1;
      nlerpQ(r.pq, r.q, f1, r.iq);
      const rs = r.ps + (r.s - r.ps) * f1;
      // the pivot of the carried turn: the root at the start of the substep
      const f0 = s / n, ox = r.pp[0] + dx * f0, oz = r.pp[2] + dz * f0;
      for (let i = 0; i < N; i++) {
        if (w[i] === 0) continue;
        const q = i * 3;
        // ---- carry (position only: the carried part never becomes velocity), the turn about the root's vertical
        if (cyaw !== 0) {
          const lx = x[q] - ox, lz = x[q + 2] - oz;
          x[q] = ox + lx * cs + lz * sn; x[q + 2] = oz - lx * sn + lz * cs;
          const vx = v[q] - rfx, vz = v[q + 2] - rfz;
          v[q] = rfx + vx * cs + vz * sn; v[q + 2] = rfz - vx * sn + vz * cs;
        }
        x[q] += cx; x[q + 1] += cy; x[q + 2] += cz;
        // ---- predict
        const im = w[i];
        let vx = v[q] + h * p.f[q] * im, vy = v[q + 1] + h * (p.f[q + 1] * im - G), vz = v[q + 2] + h * p.f[q + 2] * im;
        vx = rfx + (vx - rfx) * damp; vy = rfy + (vy - rfy) * damp; vz = rfz + (vz - rfz) * damp;
        v[q] = vx; v[q + 1] = vy; v[q + 2] = vz;
        xp[q] = x[q]; xp[q + 1] = x[q + 1]; xp[q + 2] = x[q + 2];
        x[q] += h * vx; x[q + 1] += h * vy; x[q + 2] += h * vz;
      }
      // ---- pins
      for (let i = 0; i < N; i++) {
        if (w[i] !== 0) continue;
        const q = i * 3;
        xp[q] = x[q]; xp[q + 1] = x[q + 1]; xp[q + 2] = x[q + 2];
      }
      p.placeOnRoot(r.ip, r.iq, rs, false);
      // the pinned row rides over a thigh that comes up under the belt (a crouch, a climb): pins out of the colliders in
      // `pinMask` at their outer radius, kinematically (cloth.md 5: the pin row slides on the belt, it never shrinks)
      if (p.pinMask) {
        for (let a2 = 0; a2 < na; a2++) { const K = C[act[a2]]; if (K.bit & p.pinMask) at(K, f1, h); }
        for (let i = 0; i < N; i++) {
          if (w[i] !== 0) continue;
          for (let a2 = 0; a2 < na; a2++) { const c = act[a2]; if (!(C[c].bit & p.pinMask)) continue; pushOut(C[c], x, i, 0.004, false); }
        }
      }
      // ---- ITERS passes of the distance constraints (XPBD; lambda starts at 0 each pass; after the first, the stiff ones
      //      only) and the long-range attachment, the colliders in the last (the stretch bar, 1.03, is not met by one
      //      Gauss-Seidel pass when a thigh pushes a row)
      const ih2 = 1 / (h * h);
      const ci = p.ci, cr = p.cr, ca = p.ca, ck = p.ck, nc = p.nc, sc = p.restScale;
      for (let a2 = 0; a2 < na; a2++) at(C[act[a2]], f1, h);
      const mu = mat.mu;
      for (let it = 0; it < ITERS; it++) {
      for (let c = 0; c < nc; c++) {
        // (the later passes: the stiff ones only, structural and the tongues' minimum)
        if (it > 0 && ca[c] !== 0) continue;
        const i = ci[c * 2], j = ci[c * 2 + 1], wi = w[i], wj = w[j], ws2 = wi + wj;
        if (ws2 === 0) continue;
        const a = i * 3, b = j * 3;
        const ex = x[a] - x[b], ey = x[a + 1] - x[b + 1], ez = x[a + 2] - x[b + 2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (d < 1e-9) continue;
        const C0 = d - cr[c] * sc;
        if (ck[c] === 1 && C0 >= 0) continue;
        const dl = -C0 / (ws2 + ca[c] * ih2);
        const gx = ex / d * dl, gy2 = ey / d * dl, gz = ez / d * dl;
        x[a] += gx * wi; x[a + 1] += gy2 * wi; x[a + 2] += gz * wi;
        x[b] -= gx * wj; x[b + 1] -= gy2 * wj; x[b + 2] -= gz * wj;
      }
      // ---- long-range attachment
      const lp = p.lraPin, lm = p.lraMax;
      for (let i = 0; i < N; i++) {
        const pn = lp[i];
        if (pn < 0) continue;
        const a = i * 3, b = pn * 3;
        const ex = x[a] - x[b], ey = x[a + 1] - x[b + 1], ez = x[a + 2] - x[b + 2];
        const d2 = ex * ex + ey * ey + ez * ez, m = lm[i] * sc;
        if (d2 <= m * m) continue;
        const d = Math.sqrt(d2), f = m / d;
        x[a] = x[b] + ex * f; x[a + 1] = x[b + 1] + ey * f; x[a + 2] = x[b + 2] + ez * f;
      }
      // ---- colliders (the last pass only): the ground first, then the body (the body wins), a pinched particle stops
      if (it === ITERS - 1) for (let i = 0; i < N; i++) {
        if (w[i] === 0) continue;
        let g = 0, bdy = 0;
        if (gOn) g = collideGround(gy, x, xp, i, p.off, mu);
        const px = x[i * 3], py = x[i * 3 + 1], pz = x[i * 3 + 2];
        for (let a2 = 0; a2 < na; a2++) {
          const c = act[a2], B = C[c].box;
          if (px < B[0] || px > B[3] || py < B[1] || py > B[4] || pz < B[2] || pz > B[5]) continue;
          bdy += collideCapsule(C[c], x, xp, i, offC ? offC[c] : p.off, mu, h, _n);
        }
        // the HARD pass: the body's inner surface (the grader's inner radius plus the chord sag of a cell and 4 mm,
        // `ri0`/`ri1`), twice round, no friction: where two outer surfaces overlap (a thigh tucked to the belly) the
        // outer pass cannot hold both, and the cloth must still never be inside her
        for (let sw = 0; sw < 2; sw++) for (let a2 = 0; a2 < na; a2++) {
          const c = act[a2], K = C[c];
          if (!(K.ri0 > 0)) continue;
          bdy += pushOut(K, x, i, p.hard, true);
        }
        p.contact[i] = g > 0 || bdy > 0 ? 1 : 0; p.pinch[i] = 0;
        // pinched between a body collider and the ground: the body wins (it went last), the particle stops
        if (g > 0 && bdy > 0) p.pinch[i] = 1;
      }
      }
      // ---- velocity
      const ih = 1 / h;
      for (let i = 0; i < N; i++) {
        const q = i * 3;
        if (p.pinch[i]) { v[q] = rfx; v[q + 1] = 0; v[q + 2] = rfz; continue; }
        let vx = (x[q] - xp[q]) * ih, vy = (x[q + 1] - xp[q + 1]) * ih, vz = (x[q + 2] - xp[q + 2]) * ih;
        const s2 = vx * vx + vy * vy + vz * vz;
        if (s2 > V_CAP * V_CAP) { const f = V_CAP / Math.sqrt(s2); vx *= f; vy *= f; vz *= f; }
        v[q] = vx; v[q + 1] = vy; v[q + 2] = vz;
      }
    }
  }

  /**
   * Deterministic reset: every particle to its bind place on its root as the root is NOW, velocities 0, the fed root
   * velocity 0, then RESET_SUBSTEPS substeps (at 1/240 s) in still air with the roots and colliders held where they are.
   */
  reset(t = 0) {
    const wx = this.wind.x, wz = this.wind.z;
    this.wind.x = 0; this.wind.z = 0;
    for (const r of this.roots) { r.pp.set(r.p); r.pq.set(r.q); r.ps = r.s; r.vFed.fill(0); r.vPrev.fill(0); r.acc = 0; r.jumped = false; }
    for (const C of this.colliders) { C.pa.set(C.a); C.pb.set(C.b); C.va.fill(0); C.vb.fill(0); }
    for (const p of this.pieces) { this._seat(p); p.contact.fill(0); p.pinch.fill(0); p.asleep = false; p.stillT = 0; }
    const per = 4, frames = Math.ceil(RESET_SUBSTEPS / per);
    for (let f = 0; f < frames; f++) for (const p of this.pieces) this._stepPiece(p, per * SUB_H, t, per, SUB_H);
    for (const p of this.pieces) { p.v.fill(0); p.xp.set(p.x); p.stillT = 0; }
    this.wind.x = wx; this.wind.z = wz;
  }

  /** FNV-1a over every particle's position bits: equal digests are bit-identical cloth. */
  digest() {
    let h = 0x811c9dc5 >>> 0;
    for (const p of this.pieces) {
      const u = new Uint32Array(p.x.buffer, p.x.byteOffset, p.x.length * 2);
      for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    }
    return h.toString(16).padStart(8, '0');
  }

  /** The ring buffer's timings: mean, p95, max (ms) over the last `ringN` frames. */
  timing() {
    const n = this.ringN;
    if (!n) return null;
    const a = Array.from(this.ring.subarray(0, n)).sort((x, y) => x - y);
    let s = 0; for (const x of a) s += x;
    return { n, mean: s / n, p50: a[Math.floor(n * 0.5)], p95: a[Math.min(n - 1, Math.floor(n * 0.95))], max: a[n - 1] };
  }
}
const _iq = new Float64Array(4);
