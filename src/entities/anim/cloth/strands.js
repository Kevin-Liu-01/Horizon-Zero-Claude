/**
 * CLOTH: the people's strands (cloth lane, step 2). A person's dyn_ chains (src/world/npc/people/chains.js: the wrap
 * and hair tails, the sash ends, the shawl ends, the aprons and the cloaks; Ansel's sash and wrap tail) on the same XPBD
 * solver as Brea's cloth (solver.js), at lower particle counts: each chain is one column of particles (its links' joints
 * and its tip), the first pinned to the chain's parent bone; a LEFT/RIGHT pair hung from the same bone with the same
 * number of links (apronL/apronR, cloakL/cloakR, shawlEndL/shawlEndR) is one two-column sheet, bound across by its rows
 * (so an apron bends as a sheet, not as two ribbons). Gear (a bag, a medal) and hair locks stay on the spring chain.
 *
 * Nothing is re-skinned: the solver's particles are written back into the chain's own `pos` array and the chain's own
 * `_write` turns its links (the bend limit kept), so the person's meshes, the tier fade, the reseat in tools/frames/page.mjs
 * (links to bindQ, `seeded` false) and the wrap-tail test's reads (`pos`, `tipPos`) see the same fields.
 *
 * Materials (materials.js): the tails, sash and shawl ends coarse linen; the aprons leather; the cloaks felt. Colliders:
 * the thighs and shins, the torso (pelvis to the upper spine) and the head, at a person's own scale; the ground at the
 * lower foot. Per-frame cost: one ClothSystem per near person, 7-30 particles at 3 substeps. No allocation per frame.
 */
import * as THREE from 'three';
import { MATERIALS } from './materials.js';
import { realClock } from './mode.js';
import { ClothPiece, ClothSystem, makeRoot } from './solver.js';
import { makeCollider, setEnds } from './colliders.js';

/** which chains go on the solver, and as what */
const CLASS = (key) => {
  if (/^(hairTail|wrapSash|sashEnd|sashSwing|shawlEnd[LR])$/.test(key)) return { mat: 'coarseLinen', width: 0.08, kind: 'tail' };
  if (/^apron[LR]$/.test(key)) return { mat: 'leather', width: 0.16, kind: 'apron' };
  if (/^cloak[LR]$/.test(key)) return { mat: 'felt', width: 0.2, kind: 'cloak' };
  return null;
};
/** collider radii at scale 1 (m) */
const RAD = { thigh: [0.085, 0.07], shin: [0.06, 0.048], torso: [0.13, 0.13], head: [0.095, 0.095] };

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pp = new Float64Array(3), _pq = new Float64Array(4);

function decomp(bone, p, q) {
  bone.matrixWorld.decompose(_v, _q, _s);
  p[0] = _v.x; p[1] = _v.y; p[2] = _v.z; q[0] = _q.x; q[1] = _q.y; q[2] = _q.z; q[3] = _q.w;
  return _s.x;
}

export class StrandCloth {
  /**
   * @param chains PersonChains's records (links, tip, N, key)
   * @param bones name -> Bone of this person
   * @param S the person's world scale
   */
  constructor(chains, bones, S = 1) {
    this.sys = new ClothSystem();
    this.sys.clock = realClock();
    this.S = S;
    this.owned = new Set();
    this.groups = [];          // { P, cols: [chain, ...] }
    this.feet = [bones.foot_l, bones.foot_r].filter(Boolean);
    this._buildColliders(bones);
    // roots by bone name
    const roots = new Map();
    const rootOf = (bone) => {
      if (!roots.has(bone)) { const r = this.sys.addRoot(makeRoot(bone.name)); r.bone = bone; r.s = S; roots.set(bone, r); }
      return roots.get(bone);
    };
    const used = new Set();
    for (const c of chains) {
      if (used.has(c)) continue;
      const cl = CLASS(c.key);
      if (!cl || !c.links.length || !c.tip) continue;
      // a pair: the same stem, L and R, the same parent and link count
      let cols = [c];
      const m = /^(.*)([LR])$/.exec(c.key);
      if (m) {
        const o = chains.find((d) => d !== c && !used.has(d) && d.key === m[1] + (m[2] === 'L' ? 'R' : 'L') && d.N === c.N && d.links[0].parent === c.links[0].parent && d.tip);
        if (o) cols = m[2] === 'L' ? [c, o] : [o, c];
      }
      for (const k of cols) used.add(k);
      this._buildPiece(cols, cl, rootOf(c.links[0].parent));
      for (const k of cols) { this.owned.add(k); k.strand = true; }
    }
    this.ok = this.groups.length > 0;
    this.primed = false;
  }

  _buildColliders(bones) {
    const S = this.S, sys = this.sys;
    this.bits = {};
    let bit = 1;
    const add = (name, a, b, r, up = 0) => {
      if (!a || (!b && !up)) return;
      const C = makeCollider(name, bit, r[0] * S, r[1] * S);
      C.boneA = a; C.boneB = b; C.up = up * S;
      // (the inner surface, for the last substep's hard pass and the edge pass: three quarters of the outer)
      C.ri0 = C.r0 * 0.75; C.ri1 = C.r1 * 0.75;
      this.bits[name] = bit; bit <<= 1;
      sys.addCollider(C);
    };
    add('thighL', bones.thigh_l, bones.calf_l, RAD.thigh);
    add('thighR', bones.thigh_r, bones.calf_r, RAD.thigh);
    add('shinL', bones.calf_l, bones.foot_l, RAD.shin);
    add('shinR', bones.calf_r, bones.foot_r, RAD.shin);
    add('torso', bones.pelvis, bones.spine_03 || bones.spine_02, RAD.torso);
    add('head', bones.Head, null, RAD.head, 0.16);
  }

  /** the chain's joints (links' origins and the tip) in the root bone's own space, unscaled, from the bind (local) pose */
  _bindPlaces(c, root) {
    const out = [];
    _m.identity();
    let b = c.links[0];
    // (the links' parent IS the root: compose the local matrices down the chain)
    const nodes = c.links.concat([c.tip]);
    for (let i = 0; i < nodes.length; i++) {
      b = nodes[i];
      b.updateMatrix();
      _m.multiply(i === 0 ? _m2.compose(b.position, c.bindQ[0], b.scale) : _m2.compose(b.position, i < c.N ? c.bindQ[i] : b.quaternion, b.scale));
      out.push(new THREE.Vector3().setFromMatrixPosition(_m));
    }
    void root;
    return out;
  }

  _buildPiece(cols, cl, root) {
    const S = this.S, mat = MATERIALS[cl.mat], C = cols.length, R = cols[0].N + 1, n = C * R;
    const Q0 = new Float64Array(n * 3), X = new Float64Array(n * 3);
    for (let c = 0; c < C; c++) {
      const pl = this._bindPlaces(cols[c], root);
      for (let r = 0; r < R; r++) {
        const i = c + r * C;
        Q0[i * 3] = pl[r].x; Q0[i * 3 + 1] = pl[r].y; Q0[i * 3 + 2] = pl[r].z;
        X[i * 3] = pl[r].x * S; X[i * 3 + 1] = pl[r].y * S; X[i * 3 + 2] = pl[r].z * S;
      }
    }
    const I = (c, r) => c + r * C, D = (i, j) => Math.hypot(X[i * 3] - X[j * 3], X[i * 3 + 1] - X[j * 3 + 1], X[i * 3 + 2] - X[j * 3 + 2]);
    const pinned = new Uint8Array(n), lraPin = new Int32Array(n).fill(-1), mass = new Float64Array(n), area = new Float64Array(n);
    for (let c = 0; c < C; c++) pinned[I(c, 0)] = 1;
    for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) lraPin[I(c, r)] = I(c, 0);
    // area: each column a strip of its width along its links (a pair: half the gap each side, at least the strip's width)
    const wOf = C === 2 ? Math.max(cl.width * S, D(I(0, 0), I(1, 0))) / 2 : cl.width * S;
    for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) {
      const i = I(c, r);
      area[i] = wOf * 0.5 * (D(i, I(c, r - 1)) + (r + 1 < R ? D(i, I(c, r + 1)) : 0));
    }
    for (let i = 0; i < n; i++) mass[i] = Math.max(1e-4, mat.areal * area[i] * (Math.floor(i / C) === R - 1 ? mat.hem : 1));
    const cons = [];
    for (let r = 0; r < R - 1; r++) for (let c = 0; c < C; c++) cons.push([I(c, r), I(c, r + 1), 0, 0]);
    for (let r = 0; r < R - 2; r++) for (let c = 0; c < C; c++) cons.push([I(c, r), I(c, r + 2), mat.bendAlong, 0]);
    if (C === 2) for (let r = 1; r < R; r++) {
      cons.push([I(0, r), I(1, r), mat.bendAcross, 0]);
      cons.push([I(0, r - 1), I(1, r), mat.shear, 0]); cons.push([I(1, r - 1), I(0, r), mat.shear, 0]);
    }
    const b = this.bits, rootName = root.bone.name;
    const mask = (/^Head$/i.test(rootName) ? ['torso', 'head'] : ['thighL', 'thighR', 'shinL', 'shinR', 'torso']).reduce((m, k) => m | (b[k] || 0), 0);
    // (the root frame here: identity until the first update seats it)
    root.p.fill(0); root.q[0] = 0; root.q[1] = 0; root.q[2] = 0; root.q[3] = 1;
    const P = new ClothPiece({ name: cols.map((k) => k.key).join('+'), mat, C, R, X, Q0, root, pinned, cons, lraPin, mass, area, mask, off: 0.012 * S, ground: !/^Head$/i.test(rootName) });
    P.kind = cl.kind; P.stem = cols[0].key; P.lee = 0;
    // (a long link's chord cuts a leg its two particles clear: the edge pass for the sheets hung over the legs)
    P.hard = 0.01 * S; P.edges = cl.kind !== 'tail';
    // her forward in the root's space: the root bone's +Z (the rigs' bones are authored +Y along the bone)
    P.fwd[0] = 0; P.fwd[1] = 0; P.fwd[2] = 1;
    this.sys.addPiece(P);
    this.groups.push({ P, cols });
  }

  /** the colliders and the ground from the bones as they are now (world matrices current) */
  _colliders(dt) {
    for (const K of this.sys.colliders) {
      _v.setFromMatrixPosition(K.boneA.matrixWorld);
      if (K.boneB) _v2.setFromMatrixPosition(K.boneB.matrixWorld);
      else _v2.set(0, 1, 0).applyQuaternion(K.boneA.getWorldQuaternion(_q)).multiplyScalar(K.up).add(_v);
      setEnds(K, _v.x, _v.y, _v.z, _v2.x, _v2.y, _v2.z, dt);
    }
    let gy = Infinity;
    for (const f of this.feet) { const y = f.matrixWorld.elements[13]; if (y < gy) gy = y; }
    this.sys.groundY = Number.isFinite(gy) ? gy - 0.06 * this.S : -1e9;
  }

  /** every chain's particles from its links' current world places (a held pose: no jump when a solve restarts) */
  seed() {
    for (const r of this.sys.roots) { decomp(r.bone, _pp, _pq); r.primed = false; ClothSystem.setRoot(r, _pp[0], _pp[1], _pp[2], _pq, this.S, 1 / 60); }
    this._colliders(1 / 60);
    for (const C of this.sys.colliders) { C.pa.set(C.a); C.pb.set(C.b); C.va.fill(0); C.vb.fill(0); C.mv = 0; C.stamp++; }
    for (const { P, cols } of this.groups) {
      for (let c = 0; c < cols.length; c++) {
        const k = cols[c];
        for (let r = 0; r < P.R; r++) {
          const b = r < k.N ? k.links[r] : k.tip;
          b.updateWorldMatrix(false, false);
          const e = b.matrixWorld.elements, i = (c + r * P.C) * 3;
          P.x[i] = e[12]; P.x[i + 1] = e[13]; P.x[i + 2] = e[14];
        }
      }
      P.xp.set(P.x); P.v.fill(0); P.asleep = false; P.stillT = 0; P.contact.fill(0); P.pinch.fill(0);
    }
    this.primed = true;
  }

  /** The deterministic settle (the sim-time slate): seated on the bind places of the roots as they are now, 2 s in still air. */
  reset(t = 0) {
    for (const r of this.sys.roots) { decomp(r.bone, _pp, _pq); r.primed = false; ClothSystem.setRoot(r, _pp[0], _pp[1], _pp[2], _pq, this.S, 1 / 60); }
    this._colliders(1 / 60);
    this.sys.reset(t);
    this.primed = true;
  }

  /** One tick: roots, colliders, wind, the solve, then the particles into the chains' `pos` (the caller writes the links). */
  update(dt, t, wx, wz) {
    if (!this.ok || !(dt > 0)) return;
    if (!this.primed) this.seed();
    const S = this.sys;
    for (const r of S.roots) { decomp(r.bone, _pp, _pq); ClothSystem.setRoot(r, _pp[0], _pp[1], _pp[2], _pq, this.S, dt); }
    this._colliders(dt);
    S.wind.x = wx; S.wind.z = wz;
    S.update(dt, t);
    for (const { P, cols } of this.groups) {
      for (let c = 0; c < cols.length; c++) {
        const pos = cols[c].pos;
        for (let r = 0; r < P.R; r++) { const i = (c + r * P.C) * 3, o = r * 3; pos[o] = P.x[i]; pos[o + 1] = P.x[i + 1]; pos[o + 2] = P.x[i + 2]; }
      }
    }
  }

  info() {
    return { pieces: this.groups.map(({ P }) => ({ name: P.name, C: P.C, R: P.R, mat: Object.keys(MATERIALS).find((k) => MATERIALS[k] === P.mat), asleep: P.asleep })), particles: this.groups.reduce((a, g) => a + g.P.n, 0), timing: this.sys.timing() };
  }

  digest() { return this.sys.digest(); }
}
