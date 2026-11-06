import * as THREE from 'three';

/**
 * CALIMA · live dyn_ chains on a near-tier person (settlements; R56; gate A-npc-fidelity). The same physics
 * as the kept hero solver (`playerAnimator._springs`: an inextensible Verlet chain in world space,
 * pulled to its animated rest, thrown by what the attachment does, dragged by the air), cut down to
 * what a person who walks needs. Everything is preallocated at build; a frame allocates nothing.
 *
 * A chain's bones are authored +Y along the chain (lib/face.mjs addChain).
 */
const CLASSES = {
  hair: { k: 95, damp: 0.965, grav: 0.3, air: 0.55, maxAng: 0.95 },
  cloth: { k: 48, damp: 0.955, grav: 0.34, air: 2.6, maxAng: 0.9 },
  wrap: { k: 30, damp: 0.955, grav: 0.3, air: 4.4, maxAng: 1.2, rootK: 8 },
  gear: { k: 110, damp: 0.93, grav: 0.2, air: 0, maxAng: 0.5 },
  // an apron is heavy and tied: the legs move it, the wind hardly does. A cloak is long and hangs from the shoulders
  apron: { k: 62, damp: 0.945, grav: 0.55, air: 0.5, maxAng: 0.55 },
  cloak: { k: 22, damp: 0.955, grav: 0.7, air: 1.1, maxAng: 0.7 },
};
/** A strip's tail on a head and a wrapped tail behave the same. */
const klass = (key) => {
  if (key === 'hairLock') return CLASSES.hair;
  if (key === 'hairTail' || key === 'wrapSash') return CLASSES.wrap;
  if (/medal|bag/.test(key)) return CLASSES.gear;
  if (/^apron/.test(key)) return CLASSES.apron;
  if (/^cloak/.test(key)) return CLASSES.cloak;
  return CLASSES.cloth;
};

const SUB_DT = 1 / 45;
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _s = new THREE.Vector3();
const _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _y = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class PersonChains {
  /** @param bones name -> Bone of this person. @param rows extras.r5Npc.chains */
  constructor(bones, rows, { worldScale = 1 } = {}) {
    this.chains = [];
    for (const row of rows) {
      const links = [];
      let b = bones[row.root];
      while (b && b.name.startsWith('dyn_') && !b.name.endsWith('_end')) {
        links.push(b);
        b = b.children.find((c) => c.isBone && c.name.startsWith('dyn_')) || null;
      }
      if (!links.length) continue;
      const tip = b;
      const N = links.length;
      const c = {
        key: row.key, cls: klass(row.key), links, tip, N,
        seg: new Float32Array(N), rest: new Float32Array((N + 1) * 3), pos: new Float32Array((N + 1) * 3), prev: new Float32Array((N + 1) * 3),
        bindQ: links.map((l) => l.quaternion.clone()), seeded: false, seed: hash(row.key), tipPos: new THREE.Vector3(), hangs: row.parent === 'pelvis' || /^cloak/.test(row.key),
      };
      for (let i = 0; i < N; i++) {
        const child = i + 1 < N ? links[i + 1] : tip;
        c.seg[i] = (child ? child.position.length() : 0.05) * worldScale;
      }
      this.chains.push(c);
    }
    this.acc = 0;
    this.t = 0;
    this.active = false;
    // the legs a hanging cloth must go round: thigh -> knee -> ankle of each side, world, once per update
    this.legBones = ['thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'].map((n) => bones[n] || null);
    this.legPos = new Float32Array(18);
    this.legR = 0.082 * worldScale;
  }

  /**
   * Off the near tier the solve stops and the cloth holds the pose it had (A-npc-fidelity: frozen). Snapping it back to bind at
   * the end of the 18 m cross-fade was a second pop; holding it is none. Coming back near, the solve starts from the held pose.
   */
  freeze() {
    if (!this.active) return;
    this.active = false;
    for (const c of this.chains) c.seeded = false;
  }

  /** The particles from the links' current world positions (a held pose), so a solve that restarts does not jump. */
  _seed(c) {
    for (let i = 0; i <= c.N; i++) {
      const b = i < c.N ? c.links[i] : c.tip;
      if (!b) { const o = i * 3; c.pos[o] = c.rest[o]; c.pos[o + 1] = c.rest[o + 1]; c.pos[o + 2] = c.rest[o + 2]; continue; }
      b.updateWorldMatrix(false, false);
      const e = b.matrixWorld.elements, o = i * 3;
      c.pos[o] = e[12]; c.pos[o + 1] = e[13]; c.pos[o + 2] = e[14];
    }
    c.prev.set(c.pos);
    c.seeded = true;
  }

  /**
   * After the mixer, with the person's world matrices current up to the chain roots.
   * `wind` { x, z, gust, flutter } (m/s, the hero animator's) or null.
   */
  update(dt, wind) {
    this.active = true;
    this.acc += Math.min(dt, 0.05);
    let steps = 0;
    while (this.acc >= SUB_DT && steps < 3) { this.acc -= SUB_DT; steps++; }
    this.t += dt;
    for (let i = 0; i < 6; i++) { const b = this.legBones[i]; if (!b) continue; const e = b.matrixWorld.elements; this.legPos[i * 3] = e[12]; this.legPos[i * 3 + 1] = e[13]; this.legPos[i * 3 + 2] = e[14]; }
    for (const c of this.chains) {
      this._rest(c);
      if (!c.seeded) this._seed(c);
      for (let s = 0; s < steps; s++) this._step(c, SUB_DT, wind);
      this._write(c);
    }
  }

  /** The animated rest: bind offsets from the chain's first link's current world frame. */
  _rest(c) {
    const first = c.links[0];
    const parent = first.parent;
    parent.matrixWorld.decompose(_p, _qp, _s);
    // the link's bind local, walked down the chain with no solve
    _q.copy(first.position).applyQuaternion(_qp).multiply(_s).add(_p);
    _qw.copy(_qp);
    c.rest[0] = _q.x; c.rest[1] = _q.y; c.rest[2] = _q.z;
    for (let i = 0; i < c.N; i++) {
      _qw.multiply(c.bindQ[i]);
      _y.copy(UP).applyQuaternion(_qw).multiplyScalar(c.seg[i]);
      _q.add(_y);
      c.rest[(i + 1) * 3] = _q.x; c.rest[(i + 1) * 3 + 1] = _q.y; c.rest[(i + 1) * 3 + 2] = _q.z;
    }
  }

  _step(c, dt, wind) {
    const { cls, pos, prev, rest, seg, N } = c;
    const n = N + 1;
    const windX = wind ? wind.x : 0, windZ = wind ? wind.z : 0;
    // slow gusts and a flutter across the wind, per chain; the same shape as the hero's air
    const gust = 1 + 0.35 * Math.sin(this.t * 0.73 + c.seed) * Math.sin(this.t * 0.31 + c.seed * 2);
    const fl = 0.32 * Math.sin(this.t * 6.1 + c.seed * 3) + 0.2 * Math.sin(this.t * 11.7 + c.seed);
    const dt2 = dt * dt;
    for (let i = 1; i < n; i++) {
      const o = i * 3;
      const depth = i / N;
      const k = cls.k * (1 + (cls.rootK || 0) * (1 - i / n) * (1 - i / n));
      const x = pos[o], y = pos[o + 1], z = pos[o + 2];
      const vx = (x - prev[o]) * cls.damp, vy = (y - prev[o + 1]) * cls.damp, vz = (z - prev[o + 2]) * cls.damp;
      let ax = (rest[o] - x) * k, ay = (rest[o + 1] - y) * k - 9.81 * cls.grav, az = (rest[o + 2] - z) * k;
      if (cls.air > 0 && (windX || windZ)) {
        const ux = windX * gust - windZ * fl, uz = windZ * gust + windX * fl;
        ax += cls.air * depth * (ux - vx / dt); az += cls.air * depth * (uz - vz / dt);
      }
      prev[o] = x; prev[o + 1] = y; prev[o + 2] = z;
      pos[o] = x + vx + ax * dt2; pos[o + 1] = y + vy + ay * dt2; pos[o + 2] = z + vz + az * dt2;
    }
    pos[0] = rest[0]; pos[1] = rest[1]; pos[2] = rest[2];
    if (c.hangs) this._pushOffLegs(c);
    // inextensible, root to tip
    for (let i = 0; i < N; i++) {
      const a = i * 3, b = a + 3;
      let dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
      // (Math.sqrt, not Math.hypot: hypot is a call that boxes its arguments, A-alloc-rate)
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l < 1e-6) { dx = rest[b] - rest[a]; dy = rest[b + 1] - rest[a + 1]; dz = rest[b + 2] - rest[a + 2]; const q = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= q; dy /= q; dz /= q; } else { dx /= l; dy /= l; dz /= l; }
      pos[b] = pos[a] + dx * seg[i]; pos[b + 1] = pos[a + 1] + dy * seg[i]; pos[b + 2] = pos[a + 2] + dz * seg[i];
    }
  }

  /** A particle inside a leg capsule goes to its surface, straight out from the bone (a thigh lifts an apron, it does not pierce it). */
  _pushOffLegs(c) {
    const L = this.legPos, r = this.legR, pos = c.pos;
    for (let i = 1; i <= c.N; i++) {
      const o = i * 3;
      for (let s = 0; s < 4; s++) {
        const a = (s < 2 ? s : s + 1) * 3, b = a + 3;
        const ax = L[a], ay = L[a + 1], az = L[a + 2], bx = L[b] - ax, by = L[b + 1] - ay, bz = L[b + 2] - az;
        const px = pos[o] - ax, py = pos[o + 1] - ay, pz = pos[o + 2] - az;
        let t = (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz || 1);
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < r && d > 1e-5) { const k = r / d; pos[o] = ax + bx * t + dx * k; pos[o + 1] = ay + by * t + dy * k; pos[o + 2] = az + bz * t + dz * k; }
      }
    }
  }

  /** Bone rotations from the particles: each link turned from its animated direction onto its segment, limited. */
  _write(c) {
    const first = c.links[0];
    first.parent.matrixWorld.decompose(_p, _qp, _s);
    const pos = c.pos;
    for (let i = 0; i < c.N; i++) {
      _qw.copy(_qp).multiply(c.bindQ[i]);
      _y.copy(UP).applyQuaternion(_qw);
      _d.set(pos[(i + 1) * 3] - pos[i * 3], pos[(i + 1) * 3 + 1] - pos[i * 3 + 1], pos[(i + 1) * 3 + 2] - pos[i * 3 + 2]);
      const l = _d.length();
      if (l > 1e-5) {
        _d.multiplyScalar(1 / l);
        _qr.setFromUnitVectors(_y, _d);
        // the bend limit, relative to the parent's achieved rotation
        const w = _qr.w > 1 ? 1 : _qr.w < -1 ? -1 : _qr.w, ang = 2 * Math.acos(w < 0 ? -w : w);
        if (ang > c.cls.maxAng) { _qi.identity(); _qr.copy(_qi.slerp(_qr, c.cls.maxAng / ang)); }
        _qw.premultiply(_qr);
      }
      // local = parentWorld^-1 * world
      c.links[i].quaternion.copy(_qi.copy(_qp).invert()).multiply(_qw);
      _qp.copy(_qw);
    }
    c.tipPos.set(pos[c.N * 3], pos[c.N * 3 + 1], pos[c.N * 3 + 2]);
  }
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; return (h % 1000) / 1000 * Math.PI * 2; }
