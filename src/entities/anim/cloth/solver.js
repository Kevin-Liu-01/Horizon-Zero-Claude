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
import { SUB_H, SUB_MAX, V_CAP, SLEEP_D, SLEEP_T, SLEEP_WIND, SLEEP_ACC, SLEEP_RV, SLEEP_YAW, SLEEP_EMA, SLEEP_BLEND, SLEEP_TILT, SLEEP_PEN, RESET_SUBSTEPS, RESEAT_D } from './materials.js';
import { at, collideCapsule, collideGround, pushOut } from './colliders.js';
import { aeroForces } from './aero.js';

const G = 9.81;
/** (fix round 1) Asleep, the ride again once the root has moved RIDE_D (m) or turned acos(RIDE_COS) x 2 from its last. */
const RIDE_D = 0.002, RIDE_COS = Math.cos(0.25 * Math.PI / 360);
/** The most root vertical acceleration (m/s2) the carried share's gravity takes in one frame (a landing from 1.2 m: 290). */
const AY_MAX = 400;
/** Constraint, attachment and collider passes a substep (step 2: the colliders in every pass; with them only in the last,
 *  the last distance pass undid a thigh's push and the cloth stretched 1.4-1.5 x at a run). */
const ITERS = 2;
/** The strain limit after the colliders (x rest; C3/C8's bar is 1.03) and its sweeps. */
const STRAIN = 1.02, STRAIN_ITERS = 2, STRAIN_POST = 2, HARD_ROUNDS = 2;
const _n = new Float64Array(3);

/** A root frame: position, rotation (quaternion x y z w), uniform scale; last frame's and this frame's. */
export function makeRoot(name) {
  return {
    name, p: new Float64Array(3), q: new Float64Array(4), s: 1, pp: new Float64Array(3), pq: new Float64Array(4), ps: 1,
    // this substep's interpolated frame
    ip: new Float64Array(3), iq: new Float64Array(4),
    vFed: new Float64Array(3), vPrev: new Float64Array(3), acc: 0, ay: 0, primed: false, jumped: false, yawD: 0,
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
    this.qs = new Float64Array(n * 3);         // asleep: the place on the root it sleeps at (root-local, unscaled)
    /* (round 5, SLEEP THROUGH THE IDLE) the LEVEL frame: the pins' centroid on the root, turned by the root's yaw only.
     * An idle sways her pelvis 2-5 deg/s and 2-5 cm/s; the hanging cloth stays near plumb and lags the belt by a
     * centimetre, so in the root's frame (or any frame on her) it never stands still (0.02-0.15 m/s) and nothing slept.
     * The sleep clock reads each particle's place in the level frame against its own running mean (`qe`, SLEEP_EMA):
     * a piece whose every particle stays within SLEEP_D of its mean for SLEEP_T sleeps at the mean (`qk`), and asleep it
     * rides the level frame (rows 2 down: they stay plumb while the pelvis tilts) or the root (the row under the pins) */
    this.qe = new Float64Array(n * 3);         // the running mean of each particle's place in the level frame
    this.qk = new Float64Array(n * 3);         // asleep: the place in the level frame it sleeps at
    this.qi = new Float64Array(n * 3);         // asleep: its place in the level frame as it fell asleep (the blend's start)
    this.pc0 = new Float64Array(3);            // the pins' centroid, root-local (unscaled)
    this.rowW = new Float64Array(R);           // a row's share of the level frame asleep (the rest rides the root)
    this.pw = new Float64Array(n);             // asleep: each particle's share of the level frame (0 where it lay on her)
    this.qSleep = new Float64Array(4);         // the root's turn as the piece fell asleep
    this.near = null; this.nearPen = null; this.nearN = 0;          // asleep: (particle, collider) pairs within reach of each other
    this.sleepAge = 0; this.qeOk = false; this.dev = 0; this.wakeWhy = 0; this.wakeI = -1; this.wakeC = -1;
    this.relV = 0;
    this.w = new Float64Array(n); this.m = new Float64Array(n); this.area = new Float64Array(n);
    this.contact = new Uint8Array(n); this.pinch = new Uint8Array(n); this.ct = new Uint8Array(n);
    /** per particle, the deepest the rendered mesh lies INSIDE the grid's surface near it at bind (m: the mesh's own folds,
     *  their valleys): the colliders hold the particle that much further off, so the valley, not the grid, meets the body */
    this.pIn = new Float64Array(n); this.cells = false; this.teth = null;
    /** (round 5) the drawing's own offset per particle (rig.js _vertexPass): the bones stand there, the particle does not */
    this.ro = new Float64Array(n * 3);
    /** the BACKSTOP (round 4): a front panel never passes behind the plane through its root square to the root's
     *  forward, `backstop` m in front of it (scaled with the root); -1e9: off. Her legs stand between the panels and the
     *  back: with the air of her own travel pressing a front panel back, it slipped round a thigh's inside and was caught
     *  behind it (a sprint, the hem 0.15 m behind her root, the chord 40 deg back) */
    this.backstop = -1e9;
    /** the share of her travel this piece meets as air, over its material's `air` (round 4; -1: the material's) */
    this.air = -1;
    /** its yaw share over its material's (round 5; -1: the material's) */
    this.yawS = -1;
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
    { let np = 0; for (let i = 0; i < n; i++) if (this.w[i] === 0) { np++; for (let a = 0; a < 3; a++) this.pc0[a] += this.q0[i * 3 + a]; }
      if (np) for (let a = 0; a < 3; a++) this.pc0[a] /= np;
      let r0 = 0; while (r0 < R) { let free = false; for (let c = 0; c < C; c++) if (this.w[c + r0 * C] !== 0) free = true; if (free) break; r0++; }
      for (let r = 0; r < R; r++) this.rowW[r] = r < r0 ? 0 : r === r0 ? 0.5 : 1; }
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
    /** the root's scale the canonical lengths were built at (0: lengths are taken as they are) */
    this.sQ = 0;
    // (declared here, set by the rig: one shape for every piece)
    this._act = null; this.fwd = new Float64Array([0, 0, 1]); this.lee = 0; this.stem = ''; this.kind = '';
    this.pinMask = 0; this.hard = 0.015; this.hardC = null; this.edges = false; this.edgesLegs = false; this.airK = 1; this.plumbCos = -2; this.rode = true; this.rideP = new Float64Array(3); this.rideQ = new Float64Array(4); this.cd = null; this.edge = null; this.aMax = null;
    this.boneOf = null; this.bones = null; this.f0 = null; this.verts = null;
    // (round 3, cost: every field the rig and the solver set later, declared here: one shape for every piece)
    this.bindG = null; this.yTop = 0; this.yBot = 0; this.thLo = null; this.thHi = null;
    this.pl = null; this.pc = null; this.hardHits = 0; this.qlOk = false; this.sAl = null; this.sAc = null; this.sRs = null; this.sEd = null;
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
    /** (round 5) the caller times the whole frame (BreaCloth.update: roots, colliders, the solve, the bones, the rendered
     *  sheet's pass and the kept chains) and puts it in the ring itself */
    this.ringOuter = false;
    /** (fix round 1) whether the colliders were read this frame, and the reader to call when they were not */
    this.collFresh = true; this.lazyColl = null;
    this.lastSub = 0;
    /** constraint, attachment and collider passes a substep, and whether the colliders run in every pass (else the last) */
    this.iters = ITERS; this.collideEvery = true;
    /** the strain limit (x rest) after the colliders, and its sweeps (0: off) */
    /** the substep (s): SUB_H unless a caller sets another */
    this.subH = SUB_H;
    this.strain = STRAIN; this.strainIters = STRAIN_ITERS; this.strainPost = STRAIN_POST; this.hardRounds = HARD_ROUNDS; this.endStrain = true;
  }

  addRoot(r) { this.roots.push(r); return r; }
  addPiece(p) { this.pieces.push(p); return p; }
  addCollider(c) { this.colliders.push(c); return c; }

  /** Root `r` is now at p (3), q (4), s: called once a frame before `update`. */
  static setRoot(r, px, py, pz, q, s, dt) {
    if (r.primed) { r.pp.set(r.p); r.pq.set(r.q); r.ps = r.s; }
    r.p[0] = px; r.p[1] = py; r.p[2] = pz; r.q[0] = q[0]; r.q[1] = q[1]; r.q[2] = q[2]; r.q[3] = q[3]; r.s = s;
    r.jumped = false;
    if (!r.primed) { r.pp.set(r.p); r.pq.set(r.q); r.ps = s; r.primed = true; r.vFed.fill(0); r.vPrev.fill(0); r.ay = 0; return; }
    const dx = r.p[0] - r.pp[0], dy = r.p[1] - r.pp[1], dz = r.p[2] - r.pp[2];
    if (dx * dx + dy * dy + dz * dz > RESEAT_D * RESEAT_D) { r.jumped = true; r.vFed.fill(0); r.vPrev.fill(0); r.ay = 0; return; }
    const k = dt > 0 ? 1 / dt : 0;
    const vx = dx * k, vy = dy * k, vz = dz * k;
    r.acc = r.acc * 0.8 + 0.2 * Math.sqrt((vx - r.vPrev[0]) ** 2 + (vy - r.vPrev[1]) ** 2 + (vz - r.vPrev[2]) ** 2) * k;
    // (the root's vertical acceleration this frame, for the carried share's gravity: clamped, a guard against a re-seat)
    { let a = (vy - r.vPrev[1]) * k; a = a > AY_MAX ? AY_MAX : a < -AY_MAX ? -AY_MAX : a; r.ay = a; }
    r.vPrev[0] = vx; r.vPrev[1] = vy; r.vPrev[2] = vz;
    // (round 5: the turn about world up this frame, for the sleep's calm test: the twist of q pq^-1 about y)
    { const a = r.q, b = r.pq, bx = -b[0], by = -b[1], bz = -b[2], bw = b[3];
      const y = a[3] * by + a[1] * bw + a[2] * bx - a[0] * bz, w = a[3] * bw - a[0] * bx - a[1] * by - a[2] * bz;
      let d = 2 * Math.atan2(y, w); if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; r.yawD = d; }
  }

  /** One frame of sim time `dt` (s) at sim clock `t` (s). */
  update(dt, t) {
    const t0 = this.clock ? this.clock() : 0;
    if (!(dt > 0)) dt = 1 / 60;
    let n = Math.round(dt / this.subH);
    n = n < 1 ? 1 : n > SUB_MAX ? SUB_MAX : n;
    const h = dt / n;
    this.lastSub = n;
    const P = this.pieces;
    const ws = Math.sqrt(this.wind.x * this.wind.x + this.wind.z * this.wind.z);
    for (let pi = 0; pi < P.length; pi++) {
      const p = P[pi], r = p.root;
      if (r.jumped) { this._seat(p); continue; }
      // ---- sleep (round 5: the level frame, see ClothPiece.qe)
      const calm = ws < SLEEP_WIND && r.acc < SLEEP_ACC && r.vPrev[0] * r.vPrev[0] + r.vPrev[1] * r.vPrev[1] + r.vPrev[2] * r.vPrev[2] < SLEEP_RV * SLEEP_RV && Math.abs(r.yawD) < SLEEP_YAW * dt;
      if (p.asleep) {
        let why = !calm ? 1 : this._propNear(p) ? 2 : this._tilted(p) ? 3 : 0;
        if (why) this._fresh();
        if (!why) {
          // (fix round 1, cost: asleep, the ride runs only when the root has moved RIDE_D or turned RIDE_COS from where
          //  it last rode (and through the sleep's blend); between, the particles stay and the bones ride the armature.
          //  An idle's sway moves the pelvis 0.3-0.8 mm a frame: the ride every 3-6 frames)
          p.rode = p.sleepAge < SLEEP_BLEND || this._rideDue(p);
          if (p.rode) this._ride(p, dt); else p.sleepAge += dt;
          // (and the body's last word on the frames it rode, and every third frame between)
          if ((p.rode || this.frames % 3 === 0) && (this._fresh(), this._legsIn(p))) why = 4; else continue;
        }
        p.wakeWhy = why; this._wake(p);
      }
      this._fresh();
      this._stepPiece(p, dt, t, n, h);
      if (!calm) { p.stillT = 0; p.qeOk = false; continue; }
      this._levelFrame(p);
      const x = p.x, qe = p.qe, w = p.w, lc = _lf[3], ls = _lf[4], is = 1 / r.s;
      const a = 1 - Math.exp(-dt / SLEEP_EMA);
      let dmax = 0;
      for (let i = 0; i < p.n; i++) {
        if (w[i] === 0) continue;
        const k = i * 3, ex = x[k] - _lf[0], ey = x[k + 1] - _lf[1], ez = x[k + 2] - _lf[2];
        // (into the level frame: the inverse of the yaw turn, unscaled)
        const ux = (ex * lc - ez * ls) * is, uy = ey * is, uz = (ex * ls + ez * lc) * is;
        if (!p.qeOk) { qe[k] = ux; qe[k + 1] = uy; qe[k + 2] = uz; continue; }
        const dx = ux - qe[k], dy = uy - qe[k + 1], dz = uz - qe[k + 2];
        qe[k] += a * dx; qe[k + 1] += a * dy; qe[k + 2] += a * dz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > dmax) dmax = d2;
      }
      if (!p.qeOk) { p.qeOk = true; p.stillT = 0; continue; }
      p.dev = Math.sqrt(dmax) * r.s;
      if (p.dev < SLEEP_D) { p.stillT += dt; if (p.stillT >= SLEEP_T && this._plumb(p)) this._sleep(p); }
      else p.stillT = 0;
    }
    this.frames++; this.subTotal += n;
    if (this.clock && !this.ringOuter) this.ringPut(this.clock() - t0);
  }

  /** (fix round 1) May the piece sleep where it hangs? Every column's chord (its pin to its hem particle) within
   *  `p.plumbCos` of world down, unless a particle of that column lies on a collider (a panel over a crouched thigh, the
   *  tail on her back). At 5ce3a19 a run-stop's panels slowed under the sleep's 0.01 m drift while still flared 30-35 deg
   *  out of plumb and slept there (the judge's run-stop clip, frames 210-270 identical). */
  _plumb(p) {
    const cmin = p.plumbCos;
    if (!(cmin > -1)) return true;
    const x = p.x, C = p.C, R = p.R, ct = p.contact, kt = p.ct, pc = p.pc;
    for (let c = 0; c < C; c++) {
      const a = c * 3, b = (c + (R - 1) * C) * 3;
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l < 1e-6 || -dy / l >= cmin) continue;
      // (on a collider now, within the material's kick hold, or with a collider within reach this frame (its list,
      //  PL_MARGIN): a panel that hangs over a crouched thigh at its stand-off is not pushed every substep)
      let lean = false;
      for (let r = 1; r < R; r++) { const i = c + r * C; if (ct[i] || kt[i] > 0 || (pc && pc[i] > 0)) { lean = true; break; } }
      if (!lean) return false;
    }
    return true;
  }

  /** One frame's time (ms) into the ring. */
  ringPut(ms) {
    this.ring[this.ringI] = ms; this.ringI = (this.ringI + 1) % this.ring.length; if (this.ringN < this.ring.length) this.ringN++;
  }

  /** A prop capsule moving inside a sleeping piece's reach wakes it. */
  _propNear(p) {
    const C = this.colliders;
    for (let c = 0; c < C.length; c++) {
      const K = C[c];
      if (!K.on || !K.swept || !(p.mask & K.bit)) continue;
      // (round 5: its ends' speed against the root's: the stowed lance and bow ride her back through an idle's sway)
      const rv = p.root.vPrev;
      const s = Math.max(Math.abs(K.va[0] - rv[0]), Math.abs(K.va[1] - rv[1]), Math.abs(K.va[2] - rv[2]), Math.abs(K.vb[0] - rv[0]), Math.abs(K.vb[1] - rv[1]), Math.abs(K.vb[2] - rv[2]));
      if (s < 0.15) continue;
      const k = 0; // the piece's first pin as its place
      const dx = K.cx - p.x[k], dy = K.cy - p.x[k + 1], dz = K.cz - p.x[k + 2];
      if (dx * dx + dy * dy + dz * dz < (K.cr + 0.8) ** 2) return true;
    }
    return false;
  }

  /** The piece's level frame now into _lf: origin (the pins' centroid on the root, world), cos and sin of the root's yaw. */
  _levelFrame(p) {
    const r = p.root, c = p.pc0;
    qrot(r.q, c[0] * r.s, c[1] * r.s, c[2] * r.s, _lf, 0);
    _lf[0] += r.p[0]; _lf[1] += r.p[1]; _lf[2] += r.p[2];
    const y = yawOf(r.q, p.fwd);
    _lf[3] = Math.cos(y); _lf[4] = Math.sin(y);
  }

  /** Asleep: every free particle at its sleep place, rows under the pins' own row in the level frame (plumb while the
   *  pelvis tilts), the row under the pins half on the root; the pins on the root. Costs two turns a particle. */
  _ride(p, dt) {
    const r = p.root;
    p.placeOnRoot(r.p, r.q, r.s, false);
    this._levelFrame(p);
    p.sleepAge += dt;
    const f = p.sleepAge >= SLEEP_BLEND ? 1 : p.sleepAge / SLEEP_BLEND;
    const x = p.x, qk = p.qk, qi = p.qi, qs = p.qs, w = p.w, pw = p.pw, lc = _lf[3], ls = _lf[4], s = r.s;
    for (let i = 0; i < p.n; i++) {
      if (w[i] === 0) continue;
      const k = i * 3, wr = pw[i];
      let ux = qk[k], uy = qk[k + 1], uz = qk[k + 2];
      if (f < 1) { ux = qi[k] + (ux - qi[k]) * f; uy = qi[k + 1] + (uy - qi[k + 1]) * f; uz = qi[k + 2] + (uz - qi[k + 2]) * f; }
      const lx = _lf[0] + (ux * lc + uz * ls) * s, ly = _lf[1] + uy * s, lz = _lf[2] + (-ux * ls + uz * lc) * s;
      if (wr >= 1) { x[k] = lx; x[k + 1] = ly; x[k + 2] = lz; continue; }
      qrot(r.q, qs[k] * s, qs[k + 1] * s, qs[k + 2] * s, x, k);
      x[k] = (x[k] + r.p[0]) * (1 - wr) + lx * wr; x[k + 1] = (x[k + 1] + r.p[1]) * (1 - wr) + ly * wr; x[k + 2] = (x[k + 2] + r.p[2]) * (1 - wr) + lz * wr;
    }
    p.xp.set(x);
    p.rideP.set(r.p); p.rideQ.set(r.q);
  }

  /** The body's colliders read this frame (the rig hands a reader when it put that off: every piece asleep). */
  _fresh() { if (!this.collFresh) { this.collFresh = true; if (this.lazyColl) this.lazyColl(); } }

  /** Asleep: has the root moved far enough from where the piece last rode it to ride again? (records the new place) */
  _rideDue(p) {
    const r = p.root, a = p.rideP, b = p.rideQ;
    const dx = r.p[0] - a[0], dy = r.p[1] - a[1], dz = r.p[2] - a[2];
    const dq = Math.abs(r.q[0] * b[0] + r.q[1] * b[1] + r.q[2] * b[2] + r.q[3] * b[3]);
    if (dx * dx + dy * dy + dz * dz < RIDE_D * RIDE_D && dq > RIDE_COS) return false;
    return true;
  }

  /** The root has turned more than SLEEP_TILT off the up it slept with (a slow bend: no acceleration wakes it). */
  _tilted(p) {
    const r = p.root;
    qrot(r.q, 0, 1, 0, _n, 0); const ax = _n[0], ay = _n[1], az = _n[2];
    qrot(p.qSleep, 0, 1, 0, _n, 0);
    return ax * _n[0] + ay * _n[1] + az * _n[2] < SLEEP_TILT;
  }

  /** Asleep, the body still has the last word: a sleeping particle a body collider has come into (the idle's weight shift
   *  under a front panel, her back under the tail) is put back on the soft surface, positions only (the ride rebuilds it
   *  next frame); one it has come more than SLEEP_PEN into wakes the piece. */
  _legsIn(p) {
    const N = p.near, C = this.colliders, x = p.x;
    for (let k = 0; k < p.nearN; k++) {
      const i = N[k * 2], K = C[N[k * 2 + 1]];
      if (!K.on) continue;
      const q = i * 3, ax = K.a[0], ay = K.a[1], az = K.a[2], dx = K.b[0] - ax, dy = K.b[1] - ay, dz = K.b[2] - az;
      const px = x[q] - ax, py = x[q + 1] - ay, pz = x[q + 2] - az, l2 = dx * dx + dy * dy + dz * dz;
      let t = l2 > 1e-12 ? (px * dx + py * dy + pz * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - dx * t, ey = py - dy * t, ez = pz - dz * t, rr = K.r0 + (K.r1 - K.r0) * t + (p.offC ? p.offC[N[k * 2 + 1]] : p.off);
      // (against the depth it slept at: awake, the strain limit can hold a particle a centimetre or two inside the soft
      //  surface, over a crouched thigh)
      const r2 = rr - p.nearPen[k], d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= r2 * r2 || d2 < 1e-14) continue;
      const d = Math.sqrt(d2);
      if (r2 - d > SLEEP_PEN) { p.wakeI = i; p.wakeC = N[k * 2 + 1]; return true; }
      const f = (r2 - d) / d;
      x[q] += ex * f; x[q + 1] += ey * f; x[q + 2] += ez * f;
      p.rode = true;
    }
    return false;
  }

  _wake(p) {
    p.asleep = false; p.wakes++; p.stillT = 0; p.qeOk = false;
    // (the velocity it wakes with: the root's, as the asleep cloth rode it)
    const r = p.root, v = p.v;
    for (let i = 0; i < p.n; i++) { const k = i * 3; v[k] = r.vPrev[0]; v[k + 1] = r.vPrev[1]; v[k + 2] = r.vPrev[2]; }
  }

  _sleep(p) {
    // the place each particle sleeps at: its running mean in the level frame (qk), and the same place on the root (qs)
    const r = p.root, iq = _iq, x = p.x, qk = p.qk, qi = p.qi, lc = _lf[3], ls = _lf[4], s = r.s, is = 1 / s;
    iq[0] = -r.q[0]; iq[1] = -r.q[1]; iq[2] = -r.q[2]; iq[3] = r.q[3];
    qk.set(p.qe);
    for (let i = 0; i < p.n; i++) {
      const k = i * 3;
      const ex = x[k] - _lf[0], ey = x[k + 1] - _lf[1], ez = x[k + 2] - _lf[2];
      qi[k] = (ex * lc - ez * ls) * is; qi[k + 1] = ey * is; qi[k + 2] = (ex * ls + ez * lc) * is;
      if (p.w[i] === 0) { qk[k] = qi[k]; qk[k + 1] = qi[k + 1]; qk[k + 2] = qi[k + 2]; }
      const ux = qk[k], uy = qk[k + 1], uz = qk[k + 2];
      const wx = _lf[0] + (ux * lc + uz * ls) * s - r.p[0], wy = _lf[1] + uy * s - r.p[1], wz = _lf[2] + (-ux * ls + uz * lc) * s - r.p[2];
      qrot(iq, wx * is, wy * is, wz * is, p.qs, k);
    }
    p.qSleep.set(r.q);
    // (a particle lying on her, a front panel over a crouched thigh, rides the root: it lies where the body is, not plumb)
    for (let i = 0; i < p.n; i++) p.pw[i] = p.contact[i] ? 0 : p.rowW[(i / p.C) | 0];
    // the (particle, collider) pairs a knee could bring together: within the piece's lists last frame
    const KM = PL_K, pl = p.pl, pc = p.pc;
    if (!p.near) { p.near = new Int32Array(p.n * KM * 2); p.nearPen = new Float64Array(p.n * KM); }
    let m = 0;
    if (pl) for (let i = 0; i < p.n; i++) {
      if (p.w[i] === 0) continue;
      for (let a = 0; a < pc[i]; a++) {
        const c = pl[i * KM + a], K = this.colliders[c];
        if (K.swept) continue;
        p.near[m * 2] = i; p.near[m * 2 + 1] = c;
        // its depth into the soft surface as it falls asleep (at the sleep place: qs on the root now)
        qrot(r.q, p.qs[i * 3] * s, p.qs[i * 3 + 1] * s, p.qs[i * 3 + 2] * s, _n, 0);
        const ax = K.a[0], ay = K.a[1], az = K.a[2], dx = K.b[0] - ax, dy = K.b[1] - ay, dz = K.b[2] - az;
        const px = _n[0] + r.p[0] - ax, py = _n[1] + r.p[1] - ay, pz = _n[2] + r.p[2] - az, l2 = dx * dx + dy * dy + dz * dz;
        let t = l2 > 1e-12 ? (px * dx + py * dy + pz * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(px - dx * t, py - dy * t, pz - dz * t), rr = K.r0 + (K.r1 - K.r0) * t + (p.offC ? p.offC[c] : p.off);
        p.nearPen[m] = rr > d ? rr - d : 0;
        m++;
      }
    }
    p.nearN = m;
    p.v.fill(0); p.asleep = true; p.sleeps++; p.sleepAge = 0;
  }

  _seat(p) {
    const r = p.root;
    p.placeOnRoot(r.p, r.q, r.s, true);
    p.xp.set(p.x); p.v.fill(0); p.asleep = false; p.stillT = 0; p.qeOk = false;
  }

  _stepPiece(p, dt, t, n, h) {
    const r = p.root, mat = p.mat, sh = mat.share;
    /* (round 3, the SIZE: every rest length (structural, shear, bending, the attachment, the strain limit) follows the root's
     * scale now over the scale it was built at. The rig is built in the skin's bind pose (8b28266), where her armature's
     * world scale is 1.069; in the game it is 0.969. The pins ride the root at its scale now, but the lengths were the bind
     * pose's: every panel and the tail 10.3 % too long and too wide for the body they hung on (rows 8-11 % wider than the
     * belt they hang from, the hems lower than the asset puts them) */
    if (p.sQ > 0) p.restScale = r.s / p.sQ;
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
    const cyaw = (1 - (p.yawS >= 0 ? p.yawS : sh.yaw)) * yaw / n, cs = Math.cos(cyaw), sn = Math.sin(cyaw);
    const rfx = sh.lin * r.vFed[0], rfy = sh.vert * r.vFed[1], rfz = sh.lin * r.vFed[2];
    // ---- the air, once a frame
    p.normals();
    // (her own travel as air: v holds the lag part of it already; `mat.air` more of the fed root velocity is met as wind)
    const air = p.air >= 0 ? p.air : mat.air;
    // (round 5, the FALL's air: the carried share of her vertical travel moves the particles by position, so it was never
    //  in their velocity and never met as air: in a 1.2 m drop the panels rose 1-4 deg (C5, bar 10). It is met in full)
    aeroForces(p, this.wind.x - air * r.vFed[0], this.wind.z - air * r.vFed[2], t, -(1 - sh.vert) * r.vFed[1]);
    const damp = Math.exp(-mat.kd * h);
    // (round 2, the FALL: the carried share of her vertical travel moves the particles by position, so its acceleration
    //  never reached them, but gravity did in full: in a fall the cloth sank relative to her at (1 - vert) g / kd, the
    //  opposite of cloth in a fall. The particles' own gravity takes the carried share of her vertical acceleration:
    //  in free fall they keep with her, on landing they carry their whole fall's momentum on into the overshoot)
    const gEff = G + (1 - sh.vert) * r.ay;
    const C = this.colliders, mask = p.mask, offC = p.offC;
    // the piece's colliders this frame (by the cull: the collider's swept sphere against the piece's bound)
    let bx0 = 9e9, bx1 = -9e9, by0 = 9e9, by1 = -9e9, bz0 = 9e9, bz1 = -9e9;
    for (let i = 0; i < N; i++) { const q = i * 3; if (x[q] < bx0) bx0 = x[q]; if (x[q] > bx1) bx1 = x[q]; if (x[q + 1] < by0) by0 = x[q + 1]; if (x[q + 1] > by1) by1 = x[q + 1]; if (x[q + 2] < bz0) bz0 = x[q + 2]; if (x[q + 2] > bz1) bz1 = x[q + 2]; }
    const pcx = (bx0 + bx1) / 2 + cx * n, pcy = (by0 + by1) / 2 + cy * n, pcz = (bz0 + bz1) / 2 + cz * n;
    const pr = Math.sqrt((bx1 - bx0) ** 2 + (by1 - by0) ** 2 + (bz1 - bz0) ** 2) / 2 + 0.06 + Math.sqrt(dx * dx + dy * dy + dz * dz);
    const act = p._act && p._act.length > C.length ? p._act : (p._act = new Int32Array(C.length + 1));
    let na = 0;
    for (let c = 0; c < C.length; c++) {
      const K = C[c];
      if (!K.on || !(mask & K.bit)) continue;
      const ex = K.cx - pcx, ey = K.cy - pcy, ez = K.cz - pcz, rr = K.cr + pr;
      if (ex * ex + ey * ey + ez * ez > rr * rr) continue;
      act[na++] = c;
    }
    // ...and per particle, the colliders it can meet this frame: within the collider's larger radius, the piece's most
    // stand-off, its sweep and the frame's travel of both (the collider's ends and the particle) of either of its
    // frame's segments. A particle meets 0-3 colliders, not the piece's 10-17: the substeps test only those
    const KMAX = PL_K, pl = p.pl || (p.pl = new Int32Array(N * KMAX)), pc = p.pc || (p.pc = new Uint8Array(N));
    for (let i = 0; i < N; i++) {
      pc[i] = 0;
      if (w[i] === 0) continue;
      const q = i * 3, px = x[q], py = x[q + 1], pz = x[q + 2];
      const pv = Math.sqrt(v[q] * v[q] + v[q + 1] * v[q + 1] + v[q + 2] * v[q + 2]) * dt + Math.sqrt(dx * dx + dy * dy + dz * dz);
      let k = 0;
      for (let a2 = 0; a2 < na && k < KMAX; a2++) {
        const K = C[act[a2]];
        // (round 3, cost: first the collider's swept bounding sphere, then this frame's segment with the frame's travel
        //  of its ends added (2 mv), not both frames' segments: half the per-particle tests, and most fail the sphere)
        const m = (K.r0 > K.r1 ? K.r0 : K.r1) + PL_MARGIN + pv + 2 * K.mv;
        const ex = px - K.cx, ey = py - K.cy, ez = pz - K.cz, er = K.cr + PL_MARGIN + pv;
        if (ex * ex + ey * ey + ez * ez > er * er) continue;
        if (segD2(K.a, K.b, px, py, pz) < m * m) pl[i * KMAX + k++] = act[a2];
      }
      pc[i] = k;
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
        let vx = v[q] + h * p.f[q] * im, vy = v[q + 1] + h * (p.f[q + 1] * im - gEff), vz = v[q + 2] + h * p.f[q + 2] * im;
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
      const hardNow = s === n - 1;
      // ---- ITERS passes of the distance constraints (XPBD; lambda starts at 0 each pass; after the first, the stiff ones
      //      only) and the long-range attachment, the colliders in the last (the stretch bar, 1.03, is not met by one
      //      Gauss-Seidel pass when a thigh pushes a row)
      const ih2 = 1 / (h * h);
      const ci = p.ci, cr = p.cr, ca = p.ca, ck = p.ck, nc = p.nc, sc = p.restScale;
      for (let a2 = 0; a2 < na; a2++) at(C[act[a2]], f1, h);
      const mu = mat.mu;
      const IT = this.iters;
      for (let it = 0; it < IT; it++) {
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
      // ---- the EDGES (step 2; the frame's last substep, the last pass, before the particles' own): two particles either
      //      side of a shin or a thigh are each outside it, but the sheet drawn between them cuts through it (a back
      //      panel's hem folded round the shin in a crouch). Each structural edge against its ends' inner surfaces: where
      //      the edge's closest point to the axis is inside `ri + hard / 2`, both ends go out along that normal, by their
      //      share of the deficit; the particle pass after it still has the last word on every particle
      // (round 2: a front panel's edges against the LEGS on every substep (`edgesLegs`), the rest on the frame's last: on
      //  the last alone, the belt row over a crouched thigh was thrown out by up to 1 / 0.15 x the deficit each frame and the
      //  substeps between let it back, a buzz at the kick limit with her held still that never slept; every collider on
      //  every substep put the back panel inside her torso through a slide and a panel into the quiver through the mantle,
      //  and the back panel's leg edges on every substep put it into the right thigh through the roll)
      // ---- the TETHERS (round 3): a front panel's knee row to the front of its own thigh, a soft one-sided attachment
      if (p.teth) this._tether(p, C, r, h);
      if (it === IT - 1 && p.edges && (hardNow || p.edgesLegs)) this._edges(p, C, pl, pc, KMAX, !hardNow);
      // ---- colliders (every pass: the constraints and the body agree before the velocity is read): the ground first, then the body (the body wins), a pinched particle stops
      if (it === IT - 1 || this.collideEvery) for (let i = 0; i < N; i++) {
        if (w[i] === 0) continue;
        let g = 0, bdy = 0;
        if (gOn) g = collideGround(gy, x, xp, i, p.off, mu);
        const px = x[i * 3], py = x[i * 3 + 1], pz = x[i * 3 + 2];
        const o = i * KMAX, nk = pc[i];
        for (let a2 = 0; a2 < nk; a2++) {
          const c = pl[o + a2], B = C[c].box;
          if (px < B[0] || px > B[3] || py < B[1] || py > B[4] || pz < B[2] || pz > B[5]) continue;
          bdy += collideCapsule(C[c], x, xp, i, offC ? offC[c] : p.off, mu, h, _n);
        }
        p.contact[i] = g > 0 || bdy > 0 ? 1 : 0; p.pinch[i] = 0;
        // pinched between a body collider and the ground: the body wins (it went last), the particle stops
        if (g > 0 && bdy > 0) p.pinch[i] = 1;
      }
      }
      if (p.backstop > -1e8) this._backstop(p, r);
      // ---- the STRAIN LIMIT (round 3): after the colliders, every structural edge back to at most `strain` x its rest.
      //      The colliders have the last word in each pass above, and a thigh or the hips under a panel pushed its
      //      particles apart along the row (C8: edges at 1.38 x rest in 967 of 1440 run frames at 5170040, the across
      //      edges of the front-left panel over the thigh; the columns' paths 1.07-1.12). The pass moves particles along
      //      their edges only, by millimetres, inside the soft surface's stand-off: the hard pass below still has the
      //      last word on the inner surface
      if (this.strain > 0 && this.strainIters > 0) this._strain(p, this.strain, this.strainIters);
      // ---- the HARD pass (the frame's last substep): the body's inner surface (the grader's inner radius plus the chord
      //      sag of a cell and 4 mm, `ri0`/`ri1`), twice round, no friction: where two outer surfaces overlap (a thigh
      //      tucked to the belly) the outer pass cannot hold both, and the cloth must still never be inside her (only
      //      inside the collider's box: the inner surface is inside the outer one; the frame's last substep only: what
      //      is drawn is the cloth at the end of the frame, the outer pass holds the substeps between)
      // (round 3: the hard pass and the strain limit take turns, `hardRounds` hard passes with a strain limit after each
      //  (`endStrain`: after the last too). Node bench, two starts: hard, strain, hard, strain: the edges 1.024 / 1.028 x
      //  rest at a run / sprint, 0 of 960 frames over 1.03, the Node sweep's clip frames 69 (5170040: 214); one round
      //  1.031 / 1.032; three rounds ending on the hard pass 1.033 / 1.184, 321 clip frames)
      if (hardNow) for (let hr = 0; hr < this.hardRounds; hr++) {
        // (round 5: the cells first, then the particles: a cell's push moves its free corners by up to 4x the cell centre's
        //  deficit, and after the particle pass it put the back panel's lower rows 4-5 cm inside a thigh through the roll)
        let hit = p.cells ? this._cells(p, C, pl, pc, KMAX) : 0;
        hit += this._hard(p, C, pl, pc, KMAX);
        if (!hit) break;
        if ((hr < this.hardRounds - 1 || this.endStrain) && this.strainPost > 0) this._strain(p, this.strain, this.strainPost);
      }
      // ---- velocity
      const ih = 1 / h, vRel0 = mat.vRel || 0, vFall0 = mat.vFall || vRel0, vSw = mat.vSwing || 0, ct = p.ct, ctN = mat.kickHold || 0;
      for (let i = 0; i < N; i++) {
        const q = i * 3;
        if (p.pinch[i]) { v[q] = rfx; v[q + 1] = 0; v[q + 2] = rfz; continue; }
        // (round 5, the SWING: the kick limit holds a particle a collider has touched in the last `kickHold` substeps (a
        //  knee's shove); a free one swings up to `vSwing`. At vRel for every particle a panel trailing 0.2-0.4 m behind
        //  her at a sprint came back at 0.3 m/s when she stopped, 1.3-2.5 s, and never passed its rest)
        let vRel = vRel0, vFall = vFall0;
        if (vSw > 0) { if (p.contact[i]) ct[i] = ctN; else if (ct[i] > 0) ct[i]--; if (ct[i] === 0) { vRel = vSw; vFall = vSw > vFall0 ? vSw : vFall0; } }
        let vx = (x[q] - xp[q]) * ih, vy = (x[q + 1] - xp[q + 1]) * ih, vz = (x[q + 2] - xp[q + 2]) * ih;
        const s2 = vx * vx + vy * vy + vz * vz;
        if (s2 > V_CAP * V_CAP) { const f = V_CAP / Math.sqrt(s2); vx *= f; vy *= f; vz *= f; }
        // the KICK limit: a heavy sheet's speed relative to the frame it is carried in stays under `mat.vRel` (m/s), so a
        // knee that shoves a panel moves it (the position is the collider's) without flinging it on past the leg
        // (round 4: the FALL is not a kick. Its downward part relative to the frame is held to `mat.vFall` on its own (the
        //  material's vRel if it names none, as before): at 0.3 m/s a lined panel a rising thigh had lifted took a second
        //  or more to come down, the hem rode on ahead of the knee through a run's stride (C8) and settled in 2+ s (C4))
        if (vRel > 0) {
          const ex = vx - rfx, ez = vz - rfz;
          let ey = vy - rfy, fy = 0;
          if (ey < 0 && vFall > vRel) { fy = ey < -vFall ? -vFall : ey; ey = 0; }
          const e2 = ex * ex + ey * ey + ez * ez;
          if (e2 > vRel * vRel) { const f = vRel / Math.sqrt(e2); vx = rfx + ex * f; vy = rfy + ey * f + fy; vz = rfz + ez * f; }
          else vy = rfy + ey + fy;
        }
        v[q] = vx; v[q + 1] = vy; v[q + 2] = vz;
      }
    }
  }

  /** The tethers: each listed particle no further than `slack` from its anchor on a collider's FRONT (a point at fraction
   *  u down the axis, `a` m toward her forward and `b` m to her side of it, both measured on the bind pose), pulled back
   *  softly (XPBD, compliance `alpha` m/N, its lambda from 0 each pass) when it is. Her forward is the root's forward
   *  at this substep, made square to the collider's axis. */
  _tether(p, C, r, h) {
    const T = p.teth, x = p.x, w = p.w, ih2 = 1 / (h * h);
    qrot(r.iq, p.fwd[0], p.fwd[1], p.fwd[2], _n, 0);
    const fx0 = _n[0], fy0 = _n[1], fz0 = _n[2];
    for (let k = 0; k < T.n; k++) {
      const i = T.idx[k];
      if (w[i] === 0) continue;
      const K = C[T.col[k]];
      const dx = K.ib[0] - K.ia[0], dy = K.ib[1] - K.ia[1], dz = K.ib[2] - K.ia[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-6) continue;
      const ax = dx / L, ay = dy / L, az = dz / L;
      // front: her forward square to the axis; side: axis x front
      const fd = fx0 * ax + fy0 * ay + fz0 * az;
      let fx = fx0 - fd * ax, fy = fy0 - fd * ay, fz = fz0 - fd * az;
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (fl < 1e-6) continue;
      fx /= fl; fy /= fl; fz /= fl;
      const sx = ay * fz - az * fy, sy = az * fx - ax * fz, sz = ax * fy - ay * fx;
      const u = T.u[k], a = T.a[k], b = T.b[k];
      const px = K.ia[0] + dx * u + fx * a + sx * b, py = K.ia[1] + dy * u + fy * a + sy * b, pz = K.ia[2] + dz * u + fz * a + sz * b;
      const q = i * 3, ex = x[q] - px, ey = x[q + 1] - py, ez = x[q + 2] - pz;
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez), Cc = d - T.slack;
      if (Cc <= 0) continue;
      const dl = Cc / (w[i] + T.alpha * ih2) * w[i];
      x[q] -= ex / d * dl; x[q + 1] -= ey / d * dl; x[q + 2] -= ez / d * dl;
    }
  }

  /** The backstop (see ClothPiece): every free particle of the piece in front of the root's frontal plane. */
  _backstop(p, r) {
    // (level: her forward in the ground's plane. The pelvis pitches forward 10-20 deg at a run, and a plane square to its
    //  own forward let a hem 0.6 m under it lie 0.1-0.2 m behind her; off where the pelvis is far from upright, a roll)
    qrot(r.iq, 0, 1, 0, _n, 0);
    if (_n[1] < 0.6) return;
    qrot(r.iq, p.fwd[0], p.fwd[1], p.fwd[2], _n, 0);
    const hl = Math.sqrt(_n[0] * _n[0] + _n[2] * _n[2]);
    if (hl < 1e-3) return;
    const nx = _n[0] / hl, ny = 0, nz = _n[2] / hl, ox = r.ip[0], oy = r.ip[1], oz = r.ip[2], d0 = p.backstop * (p.restScale || 1);
    const x = p.x, w = p.w, N = p.n;
    for (let i = 0; i < N; i++) {
      if (w[i] === 0) continue;
      const q = i * 3, d = (x[q] - ox) * nx + (x[q + 1] - oy) * ny + (x[q + 2] - oz) * nz;
      if (d >= d0) continue;
      const e = d0 - d;
      x[q] += nx * e; x[q + 1] += ny * e; x[q + 2] += nz * e;
    }
  }

  /** The hard pass: every free particle out of the inner surfaces of its colliders (see `_stepPiece`); the count pushed. */
  _hard(p, C, pl, pc, KMAX) {
    const x = p.x, w = p.w, N = p.n, hardC = p.hardC, offC = p.offC, pIn = p.pIn;
    let hit = 0;
    for (let i = 0; i < N; i++) {
      if (w[i] === 0) continue;
      const o = i * KMAX, nk = pc[i];
      let bdy = 0, any = 0;
      // (the second time round only if the first pushed: round 3, cost)
      // (round 5: up to HARD_SWEEPS times round while the last pushed: a particle in the crease of a tucked thigh and her
      //  belly (the roll, the climb) is inside two inner surfaces, and out of one along its normal is into the other;
      //  two sweeps left the back panel 4-5 cm inside the thigh through the roll)
      for (let sw = 0; sw < HARD_SWEEPS && (sw === 0 || bdy > 0); sw++) { bdy = 0; for (let a2 = 0; a2 < nk; a2++) {
        const c = pl[o + a2], K = C[c];
        if (!(K.ri0 > 0)) continue;
        const B = K.box, qx = x[i * 3], qy = x[i * 3 + 1], qz = x[i * 3 + 2];
        if (qx < B[0] || qx > B[3] || qy < B[1] || qy > B[4] || qz < B[2] || qz > B[5]) continue;
        // (never outside the soft surface: a hard pass wider than the outer pass pushed a particle out on the last
        //  substep that the substeps between let back in, a buzz that never slept: the tail on the quiver, 0.074 m
        //  hard against 0.058 soft)
        // (round 3: + the particle's fold depth, so the mesh's valley clears the inner surface, as far as the soft surface
        //  allows: never past it, or the rest pose would bulge and the substeps between buzz)
        let ho = (hardC ? hardC[c] : p.hard) + pIn[i];
        const lim = (K.r0 - K.ri0 < K.r1 - K.ri1 ? K.r0 - K.ri0 : K.r1 - K.ri1) + (offC ? offC[c] : p.off) - 0.001;
        if (ho > lim) ho = lim;
        bdy += pushOut(K, x, i, ho, true);
      } any += bdy; }
      if (any > 0) { p.contact[i] = 1; hit++; }
    }
    p.hardHits = hit;
    return hit;
  }

  /** The CELL pass (round 3): each grid cell's centre (the mean of its four corners) against the inner surfaces of its
   *  first free corner's colliders, at half the hard margin plus its corners' mean inward fold depth. The rendered sheet
   *  is the bilinear surface between the particles: four corners each outside a shin can still have the cell between them
   *  through it (the back panel's hem round the calf in a crouch, 2 cm in with every particle 5 cm out). The four corners
   *  go out along the centre's normal by the deficit; the count pushed. */
  _cells(p, C, pl, pc, KMAX) {
    const x = p.x, w = p.w, Cc = p.C, R = p.R, pIn = p.pIn, hh = p.hard * 0.5;
    let moved = 0;
    for (let r = 0; r + 1 < R; r++) for (let c = 0; c + 1 < Cc; c++) {
      const a = c + r * Cc, b = a + 1, d = a + Cc, e = d + 1;
      const nf = (w[a] !== 0) + (w[b] !== 0) + (w[d] !== 0) + (w[e] !== 0);
      if (nf === 0) continue;
      const src = w[d] !== 0 ? d : w[e] !== 0 ? e : w[a] !== 0 ? a : b, o = src * KMAX, nk = pc[src];
      if (!nk) continue;
      const mx = (x[a * 3] + x[b * 3] + x[d * 3] + x[e * 3]) * 0.25, my = (x[a * 3 + 1] + x[b * 3 + 1] + x[d * 3 + 1] + x[e * 3 + 1]) * 0.25, mz = (x[a * 3 + 2] + x[b * 3 + 2] + x[d * 3 + 2] + x[e * 3 + 2]) * 0.25;
      const fold = (pIn[a] + pIn[b] + pIn[d] + pIn[e]) * 0.25;
      for (let a2 = 0; a2 < nk; a2++) {
        const K = C[pl[o + a2]];
        if (!(K.ri0 > 0)) continue;
        const ax = K.ia[0], ay = K.ia[1], az = K.ia[2], dx = K.ib[0] - ax, dy = K.ib[1] - ay, dz = K.ib[2] - az;
        const px = mx - ax, py = my - ay, pz = mz - az, l2 = dx * dx + dy * dy + dz * dz;
        let t = l2 > 1e-12 ? (px * dx + py * dy + pz * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        let nx = px - dx * t, ny = py - dy * t, nz = pz - dz * t;
        let m = hh + fold;
        const lim = (K.r0 - K.ri0 < K.r1 - K.ri1 ? K.r0 - K.ri0 : K.r1 - K.ri1) + (p.offC ? p.offC[pl[o + a2]] : p.off) - 0.001;
        if (m > lim) m = lim;
        const dd = Math.sqrt(nx * nx + ny * ny + nz * nz), Rr = K.ri0 + (K.ri1 - K.ri0) * t + m;
        if (dd >= Rr || dd < 1e-7) continue;
        nx /= dd; ny /= dd; nz /= dd;
        // each free corner out by the whole deficit over the free share (the centre moves by the deficit)
        const f = (Rr - dd) * 4 / nf;
        if (w[a] !== 0) { x[a * 3] += nx * f; x[a * 3 + 1] += ny * f; x[a * 3 + 2] += nz * f; }
        if (w[b] !== 0) { x[b * 3] += nx * f; x[b * 3 + 1] += ny * f; x[b * 3 + 2] += nz * f; }
        if (w[d] !== 0) { x[d * 3] += nx * f; x[d * 3 + 1] += ny * f; x[d * 3 + 2] += nz * f; }
        if (w[e] !== 0) { x[e * 3] += nx * f; x[e * 3 + 1] += ny * f; x[e * 3 + 2] += nz * f; }
        moved++;
      }
    }
    return moved;
  }

  /** The strain limit, top down from the pins, row by row (`iters` rounds): each row's ALONG edges first, the lower end
   *  taken all the way back to `lim` x rest from the one above it (the row above is settled, so one sweep satisfies every
   *  column: a Gauss-Seidel sweep over the whole sheet left 1.035-1.06 after eight rounds), then the row's ACROSS edges
   *  shortened symmetrically, twice (ending on the along edges, the front-left hem's outer across edges stood at 1.034-1.038
   *  in 20 of 1440 sprint frames, six starts). Only shortens: a slack edge is the bending pass's. */
  _strain(p, lim, iters) {
    const x = p.x, w = p.w, cr = p.cr, sc = p.restScale * lim;
    if (!p.sAl) this._strainIndex(p);
    const AL = p.sAl, AC = p.sAc, RS = p.sRs, R = p.R;
    for (let it = 0; it < iters; it++) {
      for (let r = 1; r < R; r++) {
        for (let pass = 0; pass < 2; pass++) {
          for (let k = RS[r * 2]; k < RS[r * 2 + 2]; k += 3) {
            const e = AL[k], up = AL[k + 1], lo = AL[k + 2];
            if (w[lo] === 0) continue;
            const a = lo * 3, b = up * 3;
            const ex = x[a] - x[b], ey = x[a + 1] - x[b + 1], ez = x[a + 2] - x[b + 2];
            const d2 = ex * ex + ey * ey + ez * ez, L = cr[e] * sc;
            if (d2 <= L * L) continue;
            const f = L / Math.sqrt(d2);
            x[a] = x[b] + ex * f; x[a + 1] = x[b + 1] + ey * f; x[a + 2] = x[b + 2] + ez * f;
          }
          for (let k = RS[r * 2 + 1]; k < RS[r * 2 + 3]; k += 3) {
            const e = AC[k], i = AC[k + 1], j = AC[k + 2], wi = w[i], wj = w[j], ws = wi + wj;
            if (ws === 0) continue;
            const a = i * 3, b = j * 3;
            const ex = x[a] - x[b], ey = x[a + 1] - x[b + 1], ez = x[a + 2] - x[b + 2];
            const d2 = ex * ex + ey * ey + ez * ez, L = cr[e] * sc;
            if (d2 <= L * L) continue;
            const d = Math.sqrt(d2), f = (d - L) / (d * ws);
            x[a] -= ex * f * wi; x[a + 1] -= ey * f * wi; x[a + 2] -= ez * f * wi;
            x[b] += ex * f * wj; x[b + 1] += ey * f * wj; x[b + 2] += ez * f * wj;
          }
        }
      }
    }
  }

  /** The strain pass's edge lists, by row: along (edge, upper, lower) and across (edge, i, j), with each row's starts. */
  _strainIndex(p) {
    const C = p.C, R = p.R, al = [], ac = [], rs = new Int32Array(R * 2 + 2);
    const byRowA = Array.from({ length: R }, () => []), byRowC = Array.from({ length: R }, () => []);
    for (let e = 0; e < p.nc; e++) {
      if (p.ca[e] !== 0 || p.ck[e] !== 0) continue;
      const i = p.ci[e * 2], j = p.ci[e * 2 + 1], ri = Math.floor(i / C), rj = Math.floor(j / C);
      if (ri === rj) byRowC[ri].push(e, i, j);
      else if (Math.abs(ri - rj) === 1) { const up = ri < rj ? i : j, lo = ri < rj ? j : i; byRowA[Math.max(ri, rj)].push(e, up, lo); }
    }
    // starts: rs[2r] the row's along list in `al`, rs[2r + 1] its across list in `ac`
    for (let r = 0; r < R; r++) { rs[r * 2] = al.length; al.push(...byRowA[r]); rs[r * 2 + 1] = ac.length; ac.push(...byRowC[r]); }
    rs[R * 2] = al.length; rs[R * 2 + 1] = ac.length;
    p.sAl = Int32Array.from(al); p.sAc = Int32Array.from(ac); p.sRs = rs;
  }

  _edges(p, C, pl, pc, KMAX, legsOnly = false) {
    const x = p.x, w = p.w, ci = p.ci, hh = p.hard * 0.5;
    // (round 3, cost: the structural edges' list, built once)
    if (!p.sEd) { const l = []; for (let e = 0; e < p.nc; e++) if (p.ca[e] === 0 && p.ck[e] === 0) l.push(e); p.sEd = Int32Array.from(l); }
    const SE = p.sEd;
    let moved = 0;
    for (let k = 0; k < SE.length; k++) {
      const e = SE[k];
      const i = ci[e * 2], j = ci[e * 2 + 1], wi = w[i], wj = w[j];
      if (wi + wj === 0) continue;
      // the colliders of the free end (or either), inner surfaces only
      const src = wi !== 0 ? i : j, o = src * KMAX, nk = pc[src];
      for (let a2 = 0; a2 < nk; a2++) {
        const K = C[pl[o + a2]];
        if (!(K.ri0 > 0) || (legsOnly && !K.leg)) continue;
        // closest points: edge P(s) = xi + s (xj - xi), axis Q(t) = ia + t (ib - ia)
        const a = i * 3, b = j * 3;
        const d1x = x[b] - x[a], d1y = x[b + 1] - x[a + 1], d1z = x[b + 2] - x[a + 2];
        const d2x = K.ib[0] - K.ia[0], d2y = K.ib[1] - K.ia[1], d2z = K.ib[2] - K.ia[2];
        const rx = x[a] - K.ia[0], ry = x[a + 1] - K.ia[1], rz = x[a + 2] - K.ia[2];
        const A = d1x * d1x + d1y * d1y + d1z * d1z, E = d2x * d2x + d2y * d2y + d2z * d2z, F = d2x * rx + d2y * ry + d2z * rz;
        if (A < 1e-12 || E < 1e-12) continue;
        // (round 3, cost: the edge's midpoint further from the axis than the reach plus half the edge cannot meet it)
        {
          const mx = rx + d1x * 0.5, my = ry + d1y * 0.5, mz = rz + d1z * 0.5;
          let tm = (mx * d2x + my * d2y + mz * d2z) / E; tm = tm < 0 ? 0 : tm > 1 ? 1 : tm;
          const ex = mx - d2x * tm, ey = my - d2y * tm, ez = mz - d2z * tm, reach = (K.ri0 > K.ri1 ? K.ri0 : K.ri1) + hh + 0.045;
          if (ex * ex + ey * ey + ez * ez > reach * reach + A * 0.25 + reach * Math.sqrt(A)) continue;
        }
        const Cc = d1x * rx + d1y * ry + d1z * rz, B = d1x * d2x + d1y * d2y + d1z * d2z, den = A * E - B * B;
        let sP = den > 1e-12 ? (B * F - Cc * E) / den : 0;
        sP = sP < 0 ? 0 : sP > 1 ? 1 : sP;
        let tQ = (B * sP + F) / E;
        if (tQ < 0) { tQ = 0; sP = -Cc / A; sP = sP < 0 ? 0 : sP > 1 ? 1 : sP; } else if (tQ > 1) { tQ = 1; sP = (B - Cc) / A; sP = sP < 0 ? 0 : sP > 1 ? 1 : sP; }
        // only the inside of the edge: its ends are the particle pass's
        if (sP < 0.15 || sP > 0.85) continue;
        let nx = rx + d1x * sP - d2x * tQ, ny = ry + d1y * sP - d2y * tQ, nz = rz + d1z * sP - d2z * tQ;
        let m = hh + (p.pIn[i] > p.pIn[j] ? p.pIn[i] : p.pIn[j]);
        const lim = (K.r0 - K.ri0 < K.r1 - K.ri1 ? K.r0 - K.ri0 : K.r1 - K.ri1) + (p.offC ? p.offC[pl[o + a2]] : p.off) - 0.001;
        if (m > lim) m = lim;
        const d = Math.sqrt(nx * nx + ny * ny + nz * nz), R = K.ri0 + (K.ri1 - K.ri0) * tQ + m;
        if (d >= R || d < 1e-7) continue;
        nx /= d; ny /= d; nz /= d;
        // move the edge's point out by the deficit: each end by its barycentric share, over the weights (Mueller's split)
        const g0 = (1 - sP) * wi, g1 = sP * wj, den2 = (1 - sP) * g0 + sP * g1;
        if (den2 < 1e-12) continue;
        const lam = (R - d) / den2;
        x[a] += nx * lam * g0; x[a + 1] += ny * lam * g0; x[a + 2] += nz * lam * g0;
        x[b] += nx * lam * g1; x[b + 1] += ny * lam * g1; x[b + 2] += nz * lam * g1;
        moved++;
      }
    }
    return moved;
  }

  /**
   * Deterministic reset: every particle to its bind place on its root as the root is NOW, velocities 0, the fed root
   * velocity 0, then RESET_SUBSTEPS substeps (at 1/240 s) in still air with the roots and colliders held where they are.
   */
  reset(t = 0) {
    const wx = this.wind.x, wz = this.wind.z;
    this.wind.x = 0; this.wind.z = 0;
    for (const r of this.roots) { r.pp.set(r.p); r.pq.set(r.q); r.ps = r.s; r.vFed.fill(0); r.vPrev.fill(0); r.acc = 0; r.ay = 0; r.jumped = false; }
    for (const C of this.colliders) { C.pa.set(C.a); C.pb.set(C.b); C.va.fill(0); C.vb.fill(0); C.mv = 0; C.stamp++; }
    for (const p of this.pieces) { this._seat(p); p.contact.fill(0); p.pinch.fill(0); p.ct.fill(0); p.ro.fill(0); p.asleep = false; p.stillT = 0; }
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
const _iq = new Float64Array(4), _lf = new Float64Array(5);
/** Per-particle collider lists: at most PL_K a particle, within the collider's radius + PL_MARGIN (the most stand-off a
 *  piece uses, 0.03, the hard margin, and a little) + the frame's travel. */
const PL_K = 16, PL_MARGIN = 0.06;
/** The hard pass's most sweeps round a particle's colliders (round 5; was 2). */
const HARD_SWEEPS = 6;
/** squared distance from point p to segment a-b (Float64Array 3 each) */
function segD2(a, b, px, py, pz) {
  const ax = a[0], ay = a[1], az = a[2], dx = b[0] - ax, dy = b[1] - ay, dz = b[2] - az;
  const qx = px - ax, qy = py - ay, qz = pz - az, l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 1e-12 ? (qx * dx + qy * dy + qz * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = qx - dx * t, ey = qy - dy * t, ez = qz - dz * t;
  return ex * ex + ey * ey + ez * ez;
}
