/**
 * CLOTH: Brea's rig. Her three sash panels and the wrap's tail on the solver (solver.js), behind `?cloth=2`.
 *
 * GRIDS (brief 4.1): back panel 5 x 7, front-left 4 x 7, front-right 4 x 5, each with its top row pinned to the pelvis
 * under the belt; the wrap's tail 2 x 8, one column per torn tongue, its first row (the knot) pinned to the head, the
 * two columns bound tight across for the first three rows below it (the wrung root) and free below, where a
 * minimum distance keeps the tongues from crossing.
 *
 * The grids are built from the built meshes themselves, in the GLB's bind space (the panels as hangPanel lays them:
 * columns round her at a bearing, rows down; the tail along its chain's points, each tongue its own column), so no
 * asset is rebuilt for step 1: each particle gets a bone (`cl_<piece>_<col>_<row>`, under the armature root; the
 * pinned row's too, so a pin pushed off the belt by a thigh carries its cloth), the panel and tail vertices are
 * re-skinned on a copy of their geometry's skin attributes, bilinearly to the four particles of their cell, and the
 * meshes are re-bound to their
 * skeleton plus those bones. Each bone takes its particle's place and a frame built from its neighbours (the rows'
 * and the columns' differences), so a curled sheet is lit as one.
 *
 * THE KEPT CHAINS (brief 1.2 #5): the `dyn_panel*` and `dyn_wrapSash_*` bones stay in the skeleton, unskinned on the
 * cloth now, and are driven every frame from each piece's centre column at their old link places; the chain records
 * in `an._chains` keep their fields (pos, ax, az, vx, vz), so no row file reads anything new.
 *
 * Colliders: the hips across the hip joints, the torso up the spine in four segments, the thighs and shins tapered,
 * the head and neck, both upper arms, the draw forearm and hand, the stowed quiver from the kit's own vertices, the
 * four prop capsules (propCaps.js; the stow kit's `_stowCap` stands in for `stowLance` until the weapons lane writes
 * it), and the ground at her feet. The legs' and the torso's radii are the clothes' own surface (radiusProfile, the
 * 90th percentile), so the panels lie on the trousers, not in them.
 */
import * as THREE from 'three';
import { MATERIALS } from './materials.js';
import { realClock } from './mode.js';
import { ClothPiece, ClothSystem, makeRoot } from './solver.js';
import { makeCollider, setEnds, radiusProfile } from './colliders.js';
import { propCaps } from './propCaps.js';
import { clothMode } from './mode.js';

/** The flag (cloth/mode.js): 2 = this solver drives Brea's sash panels and wrap tail, and the people's strands. */
export { clothMode };

const _rigs = new WeakMap(), _modes = new WeakMap();
/** The animator's grid cloth: built on the first call under the flag (null with it off, or if the build failed).
 *  Kept in a WeakMap keyed by the animator, so no field is added to it (R48 c). */
export function clothRigOf(an) {
  let r = _rigs.get(an);
  if (r === undefined) {
    r = null;
    const m = _modes.has(an) ? _modes.get(an) : clothMode();
    if (m === 2) {
      const R = new BreaCloth(an);
      if (R.ok) r = R; else console.warn('[cloth] the grid solver is off:', R.err);
      if (!R.ok && globalThis.__CALIMA_CLOTH_DEBUG) throw new Error(R.err);
    }
    _rigs.set(an, r);
  }
  return r;
}
/** The rig if it has been built (no build). */
export function peekClothRig(an) { return _rigs.get(an) || null; }

/** Switch an animator's cloth at run time (the A/B clips): 2 builds the grid cloth on the next frame, 0 takes it off and
 *  gives the panels and the tail back to their chains (meshes, skeletons and chains as they were). */
export function setClothMode(an, m) {
  m = Number(m) || 0;
  const r = _rigs.get(an);
  _modes.set(an, m);
  if (m === 2) { if (!r) _rigs.delete(an); return m; }
  if (r) r.dispose();
  _rigs.set(an, null);
  return m;
}

/** The pieces this rig owns, by the old chain stem. */
export const OWNED = ['dyn_panelL', 'dyn_panelR', 'dyn_panelB', 'dyn_wrapSash'];

const PANELS = [
  { stem: 'dyn_panelB', name: 'panelB', C: 5, R: 7 },
  { stem: 'dyn_panelL', name: 'panelL', C: 4, R: 7 },
  { stem: 'dyn_panelR', name: 'panelR', C: 4, R: 5 },
];
const TAIL = { stem: 'dyn_wrapSash', name: 'wrapSash', C: 2, R: 8, wrung: 3, split: 0.47 };
/** hangPanel's cylinder centre (bind space z) */
const PANEL_CZ = -0.02;

const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _mb = new THREE.Matrix4();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _vs = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _qa = new Float64Array(4);

function boneWorld(bone, out) { return out.setFromMatrixPosition(bone.matrixWorld); }
/** a bone's world frame: position, rotation, uniform scale (no allocation) */
function decomp(bone, p, q) {
  bone.matrixWorld.decompose(_v1, _q1, _vs);
  p[0] = _v1.x; p[1] = _v1.y; p[2] = _v1.z; q[0] = _q1.x; q[1] = _q1.y; q[2] = _q1.z; q[3] = _q1.w;
  return _vs.x;
}

/** The grader's inner radius of a leg segment (measure.mjs: vertices weighted >= 0.9 to the segment's bones, 8-92 % along,
 *  the 20th percentile of their distance to the axis, less 5 mm). */
function innerLeg(skin, a, b, re) {
  const bn = skin.skeleton.bones.map((x) => x.name), g = skin.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const A = a.getWorldPosition(new THREE.Vector3()), B = b.getWorldPosition(new THREE.Vector3());
  const AB = B.clone().sub(A), l2 = AB.lengthSq() || 1e-9, v = new THREE.Vector3(), ds = [];
  for (let i = 0; i < si.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (re.test(bn[si.getComponent(i, k)] || '')) w += sw.getComponent(i, k);
    if (w < 0.9) continue;
    skin.getVertexPosition(i, v); skin.localToWorld(v);
    const t = v.clone().sub(A).dot(AB) / l2;
    if (t <= 0.08 || t >= 0.92) continue;
    ds.push(v.sub(A).addScaledVector(AB, -t).length());
  }
  ds.sort((x, y) => x - y);
  return ds.length ? ds[Math.floor(ds.length * 0.2)] - 0.005 : null;
}
/** ...and the torso's four segments up the spine (measure.mjs's buckets: each skin vertex to its nearest segment). */
function innerTorso(skin, bones) {
  const bn = skin.skeleton.bones.map((x) => x.name), g = skin.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const P = bones.map((x) => x.getWorldPosition(new THREE.Vector3()));
  const v = new THREE.Vector3(), d = new THREE.Vector3(), out = P.slice(1).map(() => []);
  for (let i = 0; i < si.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (/^(pelvis|spine_0[1-5])/.test(bn[si.getComponent(i, k)] || '')) w += sw.getComponent(i, k);
    if (w < 0.9) continue;
    skin.getVertexPosition(i, v); skin.localToWorld(v);
    let bs = -1, bd = 9, bt = 0;
    for (let k = 0; k + 1 < P.length; k++) {
      d.subVectors(P[k + 1], P[k]);
      const t = Math.max(0, Math.min(1, v.clone().sub(P[k]).dot(d) / (d.lengthSq() || 1e-9)));
      const e = v.clone().sub(P[k]).addScaledVector(d, -t).length();
      if (e < bd) { bd = e; bs = k; bt = t; }
    }
    if (bs >= 0 && bt > 0.08 && bt < 0.92) out[bs].push(bd);
  }
  return out.map((ds) => { ds.sort((x, y) => x - y); return ds.length ? ds[Math.floor(ds.length * 0.2)] - 0.005 : 0.08; });
}

function skinMeshes(model) {
  let outfit = null, caster = null, wrap = null, skin = null, kit = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const part = o.userData?.heroPart || '';
    if (o.name === 'Caster' || o.material?.name === 'hero-caster') { if (part.indexOf('outfit') >= 0) caster = o; }
    else if (!outfit && part.indexOf('outfit') >= 0) outfit = o;
    else if (!kit && part.indexOf('stowkit') >= 0) kit = o;
    else if (!wrap && o.name.indexOf('HairWrap') >= 0) wrap = o;
    else if (!skin && o.geometry.getAttribute('_hidemask')) skin = o;
  });
  return { outfit, caster, wrap, skin, kit };
}

/** vertices of `mesh` with any weight on a bone whose name starts with `stem`: [{ i, w (their sum), g (geometry pos) }] */
function clothVerts(mesh, stem) {
  if (!mesh) return [];
  const bn = mesh.skeleton.bones.map((b) => b.name), si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const pos = mesh.geometry.attributes.position, out = [];
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if ((bn[si.getComponent(i, k)] || '').startsWith(stem)) w += sw.getComponent(i, k);
    if (w > 1e-4) out.push({ i, w, g: new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix) });
  }
  return out;
}

/** The matrix taking bind space to world, rigid with bone `name` of `mesh`'s skeleton, now. */
function rigidWith(mesh, name, out) {
  const k = mesh.skeleton.bones.findIndex((b) => b.name === name);
  return out.multiplyMatrices(mesh.skeleton.bones[k].matrixWorld, mesh.skeleton.boneInverses[k]);
}

export class BreaCloth {
  constructor(an) {
    this.an = an; this.model = an.model;
    this.sys = new ClothSystem();
    // (the timing clock: the bench hands its own, as its performance.now is the sim clock)
    this.sys.clock = realClock();
    this.ok = false; this.err = null;
    this.pieces = []; this.bones = []; this.adapters = [];
    try { this._build(); this.ok = true; } catch (e) { this.err = String(e && e.stack || e); this.ok = false; }
  }

  _build() {
    const an = this.an, model = this.model, b = an.b;
    model.updateMatrixWorld(true);
    const M = this.meshes = skinMeshes(model);
    if (!M.outfit || !M.wrap || !b.pelvis || !b.head) throw new Error('cloth: no outfit, wrap, pelvis or head');
    const S = this.sys;
    const pelvis = b.pelvis.bone, head = b.head.bone;
    const armRoot = pelvis.parent;
    this.armRoot = armRoot;
    /* (step 2) BUILT IN THE BIND POSE: the inner radii (innerTorso, innerLeg), the radius profiles, the quiver's end
     * vertices, her forward in each root and the particles' bind frames were read off the pose the rig happened to be
     * built in (the animator's first frame), so a rig first built at a sprint differed from one built standing (C11's
     * reset after a history: torso inner radius 0.0914 against 0.0916, a tail 2 mm apart after the settle). The skin's
     * skeleton is put in its bind pose for the build and given back after it; the reset then reads the live pose */
    const bindSk = M.skin?.skeleton, saved = bindSk ? bindSk.bones.map((x) => [x, x.position.clone(), x.quaternion.clone(), x.scale.clone()]) : [];
    if (bindSk) { bindSk.pose(); model.updateMatrixWorld(true); M.kit?.skeleton?.update(); }
    try { this._buildPosed(M, S, pelvis, head, model); }
    finally {
      for (const [x, p, q, sc] of saved) { x.position.copy(p); x.quaternion.copy(q); x.scale.copy(sc); }
      model.updateMatrixWorld(true); M.kit?.skeleton?.update();
    }
    // first frame: settled (the deterministic reset), every bone at its particle
    this.ok = true;
    this.reset(0);
  }

  _buildPosed(M, S, pelvis, head, model) {
    // ---- roots
    const rootP = this.rootP = S.addRoot(makeRoot('pelvis')), rootH = this.rootH = S.addRoot(makeRoot('head'));
    rootP.bone = pelvis; rootH.bone = head;
    for (const r of [rootP, rootH]) { r.s = decomp(r.bone, r.p, r.q); r.pp.set(r.p); r.pq.set(r.q); r.ps = r.s; r.primed = true; }
    // her forward, in each root's own frame (for the carried yaw)
    const fwdOf = (bone) => {
      _v1.set(0, 0, 1).transformDirection(model.matrixWorld);
      bone.getWorldQuaternion(_q1).invert();
      _v1.applyQuaternion(_q1).normalize();
      return new Float64Array([_v1.x, _v1.y, _v1.z]);
    };
    // ---- colliders
    this._buildColliders(M);
    // ---- pieces
    for (const spec of PANELS) this._buildPanel(spec, M, rootP, fwdOf(pelvis));
    this._buildTail(TAIL, M, rootH, fwdOf(head));
    // ---- re-skin and re-bind
    this._rebind();
    // ---- the kept chains: driven from the centre columns
    this._buildAdapters();
  }

  /* ------------------------------------------------------------------ colliders */
  _buildColliders(M) {
    const an = this.an, b = an.b, S = this.sys, model = this.model;
    const bones = an.bones || {};
    const by = (n) => bones[n] || null;
    const spine = [b.pelvis.bone, by('spine_01') || b.spine1?.bone, by('spine_02') || b.spine2?.bone, by('spine_03') || b.spine3?.bone, b.neck1?.bone || b.head.bone].filter(Boolean);
    const meshes = [M.skin, M.outfit];
    const bits = this.bits = {};
    let bit = 1;
    const add = (name, a, bb, r0, r1, src) => { const C = makeCollider(name, bit, r0, r1, src); bits[name] = bit; bit <<= 1; S.addCollider(C); C.boneA = a; C.boneB = bb; return C; };
    const W = (bone) => boneWorld(bone, new THREE.Vector3());
    /* the torso up the spine, the hips, the legs: the radii of the clothes' surface where the cloth meets it. A round
     * capsule cannot take the hips' oval, so these are set from the measured spread (radiusProfile: Brea's skin and the
     * Starter's trousers, percentiles 20/50/80/95 printed by tools/gates/hero-sweep/cloth-bench.mjs --radii): the
     * trousers stand 0.096-0.105 m off the thigh's axis, 0.067-0.072 off the shin's, the skin of the lower torso
     * 0.104-0.121 (p50-p80); the grader's inner radii are under all of these (thigh 0.062, shin 0.023) */
    const RAD = { torso0: [0.120, 0.115], torso1: [0.115, 0.115], torso2: [0.125, 0.13], torso3: [0.13, 0.11], hips: [0.115, 0.115],
      thighL: [0.105, 0.094], thighR: [0.105, 0.094], shinL: [0.074, 0.064], shinR: [0.074, 0.064] };
    this.radii = {};
    for (let k = 0; k + 1 < spine.length; k++) {
      this.radii['torso' + k] = radiusProfile(meshes, W(spine[k]), W(spine[k + 1]), /^(pelvis|spine_0[1-5]|neck_01)$/, 0.80, THREE.Vector3);
      const r = RAD['torso' + k] || [0.12, 0.12];
      add('torso' + k, spine[k], spine[k + 1], r[0], r[1]);
    }
    add('hips', b.thighL.bone, b.thighR.bone, RAD.hips[0], RAD.hips[1]);
    // the grader's inner radii (tools/gates/hero-sweep/measure.mjs: the skin's 20th percentile less 5 mm), the HARD pass's
    for (const [k, r] of innerTorso(M.skin, spine).entries()) { const C = this.sys.colliders.find((c) => c.name === 'torso' + k); if (C) { C.ri0 = C.ri1 = Math.round(r * 1e4) / 1e4; } }
    const legs = [
      ['thighL', b.thighL.bone, b.calfL.bone, /^thigh_.*l$|^thigh_l$/],
      ['thighR', b.thighR.bone, b.calfR.bone, /^thigh_.*r$|^thigh_r$/],
      ['shinL', b.calfL.bone, b.footL.bone, /^calf_.*l$|^calf_l$/],
      ['shinR', b.calfR.bone, b.footR.bone, /^calf_.*r$|^calf_r$/],
    ];
    for (const [name, a, bb, re] of legs) {
      this.radii[name] = radiusProfile(meshes, W(a), W(bb), re, 0.90, THREE.Vector3);
      const C = add(name, a, bb, RAD[name][0], RAD[name][1]);
      const ri = innerLeg(M.skin, a, bb, re);
      if (ri != null) C.ri0 = C.ri1 = Math.round(ri * 1e4) / 1e4;
    }
    // the head (a capsule from the neck's top to the crown) and the neck
    {
      const hp = W(b.head.bone), up = new THREE.Vector3(0, 1, 0).transformDirection(model.matrixWorld);
      const [rh] = radiusProfile([M.skin], hp, hp.clone().addScaledVector(up, 0.2), /^head$/, 0.5, THREE.Vector3);
      const rq = rh != null ? Math.round(rh * 1e4) / 1e4 : 0.085;
      const C = add('head', b.head.bone, null, rq, rq);
      C.headUp = 0.12;
      if (b.neck1?.bone) add('neck', b.neck1.bone, b.head.bone, 0.055, 0.055);
    }
    // the arms: both upper arms; the draw (right) forearm and hand
    if (b.upArmL && b.loArmL) add('upArmL', b.upArmL.bone, b.loArmL.bone, 0.05, 0.042);
    if (b.upArmR && b.loArmR) add('upArmR', b.upArmR.bone, b.loArmR.bone, 0.05, 0.042);
    if (b.loArmR && b.handR) add('foreArmR', b.loArmR.bone, b.handR.bone, 0.04, 0.032);
    // (the draw arm's inner radii are the grader's own: 0.040 upper arm, 0.032 forearm)
    { const u = this.sys.colliders.find((c) => c.name === 'upArmR'), f = this.sys.colliders.find((c) => c.name === 'foreArmR'); if (u) u.ri0 = u.ri1 = 0.040; if (f) f.ri0 = f.ri1 = 0.032; }
    if (b.handR) {
      const tip = by('middle_03_r') || by('middle_02_r');
      if (tip) add('handR', b.handR.bone, tip, 0.035, 0.03);
    }
    if (b.loArmL && b.handL) add('foreArmL', b.loArmL.bone, b.handL.bone, 0.04, 0.032);
    // the stowed quiver: its own vertices (the stow kit piece bit 4), the two farthest apart its ends, the median
    // distance to that axis its radius (as the grader and clothWrap.js find it)
    const kit = M.kit;
    if (kit && kit.geometry.getAttribute('_piece')) {
      const P = kit.geometry.getAttribute('_piece'), idx = [], v = new THREE.Vector3();
      for (let i = 0; i < P.count; i += 3) if ((Math.round(P.getX(i)) & 4) !== 0) idx.push(i);
      if (idx.length > 8) {
        const atv = (i) => { kit.getVertexPosition(i, v); kit.localToWorld(v); return v.clone(); };
        const p0 = atv(idx[0]); let ia = idx[0], d = -1;
        for (const i of idx) { const e = atv(i).distanceTo(p0); if (e > d) { d = e; ia = i; } }
        const pa = atv(ia); let ib = ia; d = -1;
        for (const i of idx) { const e = atv(i).distanceTo(pa); if (e > d) { d = e; ib = i; } }
        const pb = atv(ib), AB = pb.clone().sub(pa), l2 = AB.lengthSq() || 1e-9, ds = [];
        for (const i of idx) { const q = atv(i), t = Math.max(0, Math.min(1, q.clone().sub(pa).dot(AB) / l2)); ds.push(q.sub(pa).addScaledVector(AB, -t).length()); }
        ds.sort((x, y) => x - y);
        const r = Math.round(ds[Math.floor(ds.length / 2)] * 1e4) / 1e4;   // (to 0.1 mm: read on the build pose)
        const C = add('quiver', null, null, r, r);
        C.kitIdx = [ia, ib]; C.kit = kit; C.ri0 = C.ri1 = Math.max(0, r - 0.004);   // (the grader's: its radius less 4 mm)
      }
    }
    // the four prop capsules (swept)
    for (const s of propCaps(this.an).list) { const C = add(s.name, null, null, 0.02, 0.02); C.prop = s; C.swept = true; C.on = false; }
    this.groundBit = 0;
  }

  _updateColliders(dt) {
    const S = this.sys, model = this.model, an = this.an;
    const P = propCaps(an);
    // (until the weapons lane writes stowLance, the stow kit's `_stowCap` stands in for it)
    const SC = an._stowCap;
    for (const C of S.colliders) {
      if (C.prop) {
        const s = C.prop;
        if (C.name === 'stowLance' && !s.set && SC) {
          C.on = !!SC.on;
          if (C.on) { C.r0 = C.r1 = SC.r; setEnds(C, SC.a.x, SC.a.y, SC.a.z, SC.b.x, SC.b.y, SC.b.z, dt); }
          continue;
        }
        C.on = !!s.on;
        if (C.on) { C.r0 = C.r1 = s.r; setEnds(C, s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z, dt); }
        continue;
      }
      if (C.kitIdx) {
        C.kit.getVertexPosition(C.kitIdx[0], _v1); C.kit.localToWorld(_v1);
        C.kit.getVertexPosition(C.kitIdx[1], _v2); C.kit.localToWorld(_v2);
        C.on = C.kit.visible !== false && C.kit.parent != null;
        setEnds(C, _v1.x, _v1.y, _v1.z, _v2.x, _v2.y, _v2.z, dt);
        continue;
      }
      boneWorld(C.boneA, _v1);
      if (C.boneB) boneWorld(C.boneB, _v2);
      else {
        // the head: from the head joint up its own axis
        _v2.set(0, 1, 0).applyQuaternion(C.boneA.getWorldQuaternion(_q2)).multiplyScalar(C.headUp).add(_v1);
      }
      setEnds(C, _v1.x, _v1.y, _v1.z, _v2.x, _v2.y, _v2.z, dt);
    }
    // the ground: her feet's
    S.groundY = model.position.y + (this.an.ctx?.player?.position ? 0 : 0);
    S.groundOn = this.an.ctx?.player?.grounded !== false;
  }

  /* ------------------------------------------------------------------ panels */
  _buildPanel(spec, M, root, fwd) {
    const { stem, name, C, R } = spec;
    const mat = MATERIALS.lined;
    const main = clothVerts(M.outfit, stem);
    if (main.length < 8) throw new Error(`cloth: ${stem} has ${main.length} vertices`);
    // param (th, y, rad) in bind space
    const par = (g) => ({ th: Math.atan2(g.z - PANEL_CZ, g.x), y: g.y, rad: Math.hypot(g.x, g.z - PANEL_CZ) });
    const mp = main.map((v) => par(v.g));
    let yTop = -9, yBot = 9;
    for (const p of mp) { if (p.y > yTop) yTop = p.y; if (p.y < yBot) yBot = p.y; }
    // the bearing range at height y, fitted from the vertices (min and max per height band, a line in y)
    const NB = 12, lo = new Array(NB).fill(9), hi = new Array(NB).fill(-9), yb = new Array(NB).fill(0), cnt = new Array(NB).fill(0);
    for (const p of mp) { const k = Math.min(NB - 1, Math.floor((yTop - p.y) / (yTop - yBot + 1e-9) * NB)); lo[k] = Math.min(lo[k], p.th); hi[k] = Math.max(hi[k], p.th); yb[k] += p.y; cnt[k]++; }
    const fit = (arr) => {
      let n = 0, sy = 0, sv = 0, syy = 0, syv = 0;
      for (let k = 0; k < NB; k++) if (cnt[k]) { const y = yb[k] / cnt[k]; n++; sy += y; sv += arr[k]; syy += y * y; syv += y * arr[k]; }
      const den = n * syy - sy * sy, a = den !== 0 ? (n * syv - sy * sv) / den : 0, c = (sv - a * sy) / n;
      return (y) => a * y + c;
    };
    const thLo = fit(lo), thHi = fit(hi);
    const st = (p) => ({ s: (p.th - thLo(p.y)) / (thHi(p.y) - thLo(p.y)), t: (yTop - p.y) / (yTop - yBot) });
    // grid nodes in bind space: on the cylinder at (th, y), the radius the kernel mean of the vertices' near (s, t)
    const n = C * R, G = new Float64Array(n * 3);
    const sts = mp.map(st);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const s = c / (C - 1), t = r / (R - 1), y = yTop + (yBot - yTop) * t;
      const th = thLo(y) + (thHi(y) - thLo(y)) * s;
      let ws = 0, rs = 0;
      const ss = 0.6 / (C - 1), tt = 0.6 / (R - 1);
      for (let k = 0; k < mp.length; k++) {
        const e = ((sts[k].s - s) / ss) ** 2 + ((sts[k].t - t) / tt) ** 2;
        if (e > 9) continue;
        const w = Math.exp(-0.5 * e); ws += w; rs += w * mp[k].rad;
      }
      const rad = ws > 0 ? rs / ws : 0.2;
      const i = c + r * C;
      G[i * 3] = Math.cos(th) * rad; G[i * 3 + 1] = y; G[i * 3 + 2] = PANEL_CZ + Math.sin(th) * rad;
    }
    // the grid on its root (root-local, from the assets only) and canonical (x the root's scale) for every length
    const { Q0, X, Xw } = this._rootLocal(M.outfit, root, G, n);
    const pinned = new Uint8Array(n), lraPin = new Int32Array(n).fill(-1), mass = new Float64Array(n), area = new Float64Array(n);
    const I = (c, r) => c + r * C, D = (i, j) => Math.hypot(X[i * 3] - X[j * 3], X[i * 3 + 1] - X[j * 3 + 1], X[i * 3 + 2] - X[j * 3 + 2]);
    for (let c = 0; c < C; c++) pinned[I(c, 0)] = 1;
    for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) lraPin[I(c, r)] = I(c, 0);
    for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
      const a = D(I(c, r), I(c + 1, r)) * D(I(c, r), I(c, r + 1)) / 4;
      for (const i of [I(c, r), I(c + 1, r), I(c, r + 1), I(c + 1, r + 1)]) area[i] += a;
    }
    for (let i = 0; i < n; i++) mass[i] = mat.areal * area[i] * (Math.floor(i / C) === R - 1 ? mat.hem : 1);
    const cons = [];
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C; c++) cons.push([I(c, r), I(c, r + 1), 0, 0]);
      for (let c = 0; c < C - 1; c++) cons.push([I(c, r + 1), I(c + 1, r + 1), 0, 0]);
      for (let c = 0; c < C - 1; c++) { cons.push([I(c, r), I(c + 1, r + 1), mat.shear, 0]); cons.push([I(c + 1, r), I(c, r + 1), mat.shear, 0]); }
    }
    for (let r = 0; r < R - 2; r++) for (let c = 0; c < C; c++) cons.push([I(c, r), I(c, r + 2), mat.bendAlong, 0]);
    for (let r = 1; r < R; r++) for (let c = 0; c < C - 2; c++) cons.push([I(c, r), I(c + 2, r), mat.bendAcross, 0]);
    const S = this.sys, cols = S.colliders, bits = this.bits;
    // (step 2: the upper torso too: in a roll or a climb the chest comes down onto the thighs, over the panels)
    const mask = ['torso0', 'torso1', 'torso2', 'torso3', 'hips', 'thighL', 'thighR', 'shinL', 'shinR', 'upArmL', 'upArmR', 'foreArmR', 'foreArmL', 'handR', 'quiver', 'stowLance', 'stowBow', 'heldLance', 'heldBow'].reduce((m, k) => m | (bits[k] || 0), 0);
    // stand-off: the chord sag across a cell over the thigh, plus 4 mm, plus the particle's own 6 mm
    const off = 0.010;
    const P = new ClothPiece({ name, mat, C, R, X, Q0, root, pinned, cons, lraPin, mass, area, mask, off, offPerCollider: this._offFit(X, pinned, mask, off, root) });
    P.fwd = fwd; P.stem = stem; P.kind = 'panel'; P.lee = 0.17; P.edges = true;
    P.pinMask = (bits.thighL || 0) | (bits.thighR || 0);
    // (the hard pass's margin: a cell's chord sag on the inner thigh, 0.12 m along a row over a 0.078 m radius, 0.028 m
    //  (a sit, a crouch: the columns lie across the thigh), + 2 mm; under the trousers' own surface, 0.096-0.105 m)
    P.hard = 0.030;
    // the vertices' cell weights (main mesh and caster)
    P.bindG = G; P.yTop = yTop; P.yBot = yBot; P.thLo = thLo; P.thHi = thHi;
    P.verts = [];
    for (const mesh of [M.outfit, M.caster]) {
      if (!mesh) continue;
      for (const v of clothVerts(mesh, stem)) { const p = par(v.g), q = st(p); P.verts.push({ mesh, i: v.i, s: q.s, t: q.t }); }
    }
    S.addPiece(P); this.pieces.push(P);
  }

  /** The bind grid `G` (the mesh's bind space) on the root bone: root-local places Q0 = (root's inverse bind) x
   *  bindMatrix x G, the canonical grid X = Q0 x the root's scale (to 1e-6), and the world places now (Xw). */
  _rootLocal(mesh, root, G, n) {
    const k = mesh.skeleton.bones.findIndex((b) => b.name === root.bone.name);
    _m1.multiplyMatrices(mesh.skeleton.boneInverses[k], mesh.bindMatrix);
    const sQ = Math.round(root.s * 1e6) / 1e6;
    const Q0 = new Float64Array(n * 3), X = new Float64Array(n * 3), Xw = new Float64Array(n * 3);
    const Wm = rigidWith(mesh, root.bone.name, new THREE.Matrix4());
    for (let i = 0; i < n; i++) {
      _v1.set(G[i * 3], G[i * 3 + 1], G[i * 3 + 2]).applyMatrix4(_m1);
      Q0[i * 3] = _v1.x; Q0[i * 3 + 1] = _v1.y; Q0[i * 3 + 2] = _v1.z;
      X[i * 3] = _v1.x * sQ; X[i * 3 + 1] = _v1.y * sQ; X[i * 3 + 2] = _v1.z * sQ;
      _v1.set(G[i * 3], G[i * 3 + 1], G[i * 3 + 2]).applyMatrix4(Wm);
      Xw[i * 3] = _v1.x; Xw[i * 3 + 1] = _v1.y; Xw[i * 3 + 2] = _v1.z;
    }
    return { Q0, X, Xw };
  }

  /** Per collider, the stand-off a piece uses: `off`, or less where its bind grid already sits closer (the knot, the belt). */
  _offFit(X, pinned, mask, off, root, inner = false) {
    /* (read in the BIND pose, on the root: every body collider's ends where the skeleton's own bind puts them in the
     *  root bone's frame, x the root's scale like the canonical grid X; so the fit is a function of the assets only,
     *  never of the pose the rig happens to be built in. The quiver and the props are not fitted) */
    const S = this.sys, cols = S.colliders, o = new Float64Array(cols.length).fill(off);
    const sk = this.meshes.skin.skeleton, bi = (bone) => sk.boneInverses[sk.bones.indexOf(bone)];
    const rInv = bi(root.bone), sQ = Math.round(root.s * 1e6) / 1e6;
    const bindLocal = (bone, out, up = 0) => {
      _m2.copy(bi(bone)).invert();
      out.set(0, up, 0).applyMatrix4(_m2).applyMatrix4(rInv).multiplyScalar(sQ);
      return out;
    };
    for (let c = 0; c < cols.length; c++) {
      const K = cols[c];
      if (!(mask & K.bit) || K.prop || K.kitIdx || !K.boneA || bi(K.boneA) == null) continue;
      if (inner && !(K.ri0 > 0)) continue;
      const k0 = inner ? K.ri0 : K.r0, k1 = inner ? K.ri1 : K.r1;
      bindLocal(K.boneA, _v1);
      if (K.boneB) bindLocal(K.boneB, _v2); else bindLocal(K.boneA, _v2, K.headUp);
      let clr = 9;
      for (let i = 0; i < pinned.length; i++) {
        if (pinned[i]) continue;
        const ax = _v1.x, ay = _v1.y, az = _v1.z, dx = _v2.x - ax, dy = _v2.y - ay, dz = _v2.z - az;
        const px = X[i * 3] - ax, py = X[i * 3 + 1] - ay, pz = X[i * 3 + 2] - az, l2 = dx * dx + dy * dy + dz * dz;
        let t = l2 > 1e-12 ? (px * dx + py * dy + pz * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(px - dx * t, py - dy * t, pz - dz * t) - (k0 + (k1 - k0) * t);
        if (d < clr) clr = d;
      }
      if (clr < off + 0.002) o[c] = Math.floor((clr - 0.002) * 1000) / 1000;
    }
    return o;
  }

  /* ------------------------------------------------------------------ the tail */
  _buildTail(spec, M, root, fwd) {
    const { stem, name, C, R, wrung, split } = spec;
    const mat = MATERIALS.coarseLinen, wrap = M.wrap, an = this.an;
    const verts = clothVerts(wrap, stem);
    if (verts.length < 8) throw new Error(`cloth: ${stem} has ${verts.length} vertices`);
    // the chain's points in bind space: the link bones' bind places (inverse of their inverse bind)
    const bones = wrap.skeleton.bones, inv = wrap.skeleton.boneInverses;
    const names = [];
    for (let k = 1; k <= 7; k++) names.push(`${stem}_0${k}`);
    names.push(`${stem}_end`);
    const CP = names.map((nm) => { const k = bones.findIndex((b) => b.name === nm); return new THREE.Vector3().setFromMatrixPosition(_m1.copy(inv[k]).invert()); });
    const L = [0]; for (let k = 1; k < CP.length; k++) L.push(L[k - 1] + CP[k].distanceTo(CP[k - 1]));
    const tot = L[L.length - 1];
    // each vertex: arc parameter u along the chain, and its offset off the chain
    const proj = (g) => {
      let best = 9, bu = 0, bk = 0, bt = 0;
      for (let k = 0; k + 1 < CP.length; k++) {
        _v1.subVectors(CP[k + 1], CP[k]); const l2 = _v1.lengthSq();
        let t = _v2.subVectors(g, CP[k]).dot(_v1) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = _v3.copy(CP[k]).addScaledVector(_v1, t).distanceTo(g);
        if (d < best) { best = d; bk = k; bt = t; bu = (L[k] + t * (L[k + 1] - L[k])) / tot; }
      }
      // (past the end bone: the last segment carried on)
      if (bk === CP.length - 2 && bt >= 1) { _v1.subVectors(CP[bk + 1], CP[bk]); const ex = _v2.subVectors(g, CP[bk + 1]).dot(_v1.normalize()); if (ex > 0) bu = 1 + ex / tot; }
      _v1.copy(CP[bk]).lerp(CP[bk + 1], bt);
      return { u: bu, k: bk, off: new THREE.Vector3().subVectors(g, _v1) };
    };
    const P0 = verts.map((v) => ({ ...v, ...proj(v.g) }));
    // the strip's across axis per segment: the principal direction of the offsets, kept one way along the tail
    const side = [];
    for (let k = 0; k + 1 < CP.length; k++) {
      const dir = _v1.subVectors(CP[k + 1], CP[k]).normalize().clone();
      let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
      for (const p of P0) {
        if (p.k !== k) continue;
        const o = p.off.clone().addScaledVector(dir, -p.off.dot(dir));
        cxx += o.x * o.x; cxy += o.x * o.y; cxz += o.x * o.z; cyy += o.y * o.y; cyz += o.y * o.z; czz += o.z * o.z;
      }
      // power iteration
      let e = new THREE.Vector3(1, 0.3, 0.2);
      if (side.length) e.copy(side[side.length - 1]);
      for (let it = 0; it < 30; it++) { e = new THREE.Vector3(cxx * e.x + cxy * e.y + cxz * e.z, cxy * e.x + cyy * e.y + cyz * e.z, cxz * e.x + cyz * e.y + czz * e.z); const l = e.length(); if (l < 1e-12) { e.set(1, 0, 0); break; } e.divideScalar(l); }
      e.addScaledVector(dir, -e.dot(dir)).normalize();
      if (side.length && e.dot(side[side.length - 1]) < 0) e.negate();
      side.push(e);
    }
    for (const p of P0) p.l = p.off.dot(side[Math.min(p.k, side.length - 1)]);
    // each tongue's own length (the right one is short) and its rows' places
    const uEnd = [0, 0];
    for (const p of P0) if (p.u > split + 0.05) { const c = p.l < 0 ? 0 : 1; if (p.u > uEnd[c]) uEnd[c] = p.u; }
    for (let c = 0; c < 2; c++) if (uEnd[c] <= split + 0.05) uEnd[c] = 1;
    const U = L.map((x) => x / tot);
    const uOf = (c, j) => (U[j] <= split ? U[j] : split + (U[j] - split) * (uEnd[c] - split) / (1 - split));
    const n = C * R, G = new Float64Array(n * 3), lMean = new Float64Array(n);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const u = uOf(c, r), sp = (r > 0 ? uOf(c, r) - uOf(c, r - 1) : uOf(c, 1) - uOf(c, 0));
      let ws = 0; const acc = new THREE.Vector3(); let ls = 0;
      for (const p of P0) {
        if ((p.l < 0 ? 0 : 1) !== c) continue;
        const e = ((p.u - u) / (0.5 * sp)) ** 2;
        if (e > 9) continue;
        const w = Math.exp(-0.5 * e); ws += w; acc.addScaledVector(p.g, w); ls += w * p.l;
      }
      const i = c + r * C;
      if (ws > 1e-6) { acc.divideScalar(ws); lMean[i] = ls / ws; }
      else {
        // (no cloth there: the chain's point at u, half a width to the tongue's side)
        let k = 0; while (k + 2 < U.length && U[k + 1] < u) k++;
        const f = Math.min(1, Math.max(0, (u - U[k]) / (U[k + 1] - U[k])));
        acc.copy(CP[k]).lerp(CP[k + 1], f).addScaledVector(side[Math.min(k, side.length - 1)], c ? 0.02 : -0.02); lMean[i] = c ? 0.02 : -0.02;
      }
      G[i * 3] = acc.x; G[i * 3 + 1] = acc.y; G[i * 3 + 2] = acc.z;
    }
    // the knot row: both pinned at the chain's first point, a hair either side
    for (let c = 0; c < C; c++) { const i = c; G[i * 3] = CP[0].x + side[0].x * lMean[C + c] * 0.6; G[i * 3 + 1] = CP[0].y + side[0].y * lMean[C + c] * 0.6; G[i * 3 + 2] = CP[0].z + side[0].z * lMean[C + c] * 0.6; }
    const { Q0, X, Xw } = this._rootLocal(wrap, root, G, n);
    const pinned = new Uint8Array(n), lraPin = new Int32Array(n).fill(-1), mass = new Float64Array(n), area = new Float64Array(n);
    const I = (c, r) => c + r * C, D = (i, j) => Math.hypot(X[i * 3] - X[j * 3], X[i * 3 + 1] - X[j * 3 + 1], X[i * 3 + 2] - X[j * 3 + 2]);
    for (let c = 0; c < C; c++) pinned[I(c, 0)] = 1;
    for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) lraPin[I(c, r)] = I(c, 0);
    // area: each tongue a strip of half the tail's width (0.045 m) per row
    for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) { const i = I(c, r); area[i] = 0.045 * 0.5 * (D(i, I(c, r - 1)) + (r + 1 < R ? D(i, I(c, r + 1)) : 0)); }
    for (let i = 0; i < n; i++) mass[i] = Math.max(1e-4, mat.areal * area[i]);
    const cons = [];
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C; c++) cons.push([I(c, r), I(c, r + 1), 0, 0]);
      if (r + 1 <= wrung) { cons.push([I(0, r + 1), I(1, r + 1), 0, 0]); cons.push([I(0, r), I(1, r + 1), mat.shear, 0]); cons.push([I(1, r), I(0, r + 1), mat.shear, 0]); }
      else cons.push([I(0, r + 1), I(1, r + 1), 0, 1]);     // the tongues: at least their bind distance apart
    }
    for (let r = 0; r < R - 2; r++) for (let c = 0; c < C; c++) cons.push([I(c, r), I(c, r + 2), mat.bendAlong, 0]);
    const bits = this.bits;
    const mask = ['torso1', 'torso2', 'torso3', 'neck', 'head', 'upArmL', 'upArmR', 'foreArmR', 'handR', 'foreArmL', 'quiver', 'stowLance', 'stowBow', 'heldLance', 'heldBow'].reduce((m, k) => m | (bits[k] || 0), 0);
    // (step 2: 0.028, was 0.020: the strip turned edge-on to the back in a crouch put its edge, 0.045 m off its two
    //  particles, inside the grader's torso)
    const off = 0.028;
    const P = new ClothPiece({ name, mat, C, R, X, Q0, root, pinned, cons, lraPin, mass, area, mask, off, offPerCollider: this._offFit(X, pinned, mask, off, root), ground: false });
    // (the tongues' minimum: a little under their bind distance, so the pair never crosses but may close)
    for (let c = 0; c < P.nc; c++) if (P.ck[c] === 1) P.cr[c] *= 0.7;
    P.fwd = fwd; P.stem = stem; P.kind = 'tail'; P.lee = 0;
    // (step 2: 0.65 of the air: with the heavier damping the tail stood at 59-60 deg in 5.5 m/s from her front, band 25-50)
    P.airK = 0.65;   // (the head is narrower than the tail's swing: no lee)
    // (the tail's strip is 0.09 m wide and cupped about the two particles of a row: its edges stand 0.02 m off them)
    // (step 2: 0.052, was 0.030: the strip's cupped edge, or the strip turned edge-on, still met the grader's torso by
    //  1.6-5 mm standing and in a crouch)
    P.hard = 0.052;
    // (...but never more than the bind grid's own clearance from an inner surface, less 2 mm, collider by collider: the
    //  wrung root sits close over the nape, and a hard pass wider than that pushed it out every frame against its
    //  constraints, a buzz that never slept)
    P.hardC = this._offFit(X, pinned, mask, P.hard, root, true);
    P.verts = [];
    // vertex weights: rows from the vertex's u on its column's row table; across bilinear in the wrung root, its own
    // tongue below the split
    const rowOf = (c, u) => { let j = 0; while (j + 2 < R && uOf(c, j + 1) < u) j++; const f = (u - uOf(c, j)) / (uOf(c, j + 1) - uOf(c, j)); return j + Math.max(0, Math.min(1, f)); };
    for (const p of P0) {
      const c = p.l < 0 ? 0 : 1;
      const tRow = rowOf(c, p.u);
      // across: in the root, from the left column's mean offset to the right's; below, the tongue's own
      const j0 = Math.min(R - 1, Math.floor(tRow));
      const l0 = lMean[I(0, j0)], l1 = lMean[I(1, j0)];
      const sAcross = l1 - l0 > 1e-4 ? Math.max(0, Math.min(1, (p.l - l0) / (l1 - l0))) : 0.5;
      const blend = Math.max(0, Math.min(1, (p.u - split) / 0.08));
      const s = sAcross * (1 - blend) + c * blend;
      P.verts.push({ mesh: wrap, i: p.i, s, t: tRow / (R - 1), wCloth: p.w });
    }
    this.sys.addPiece(P); this.pieces.push(P);
  }

  /* ------------------------------------------------------------------ bones and the re-skin */
  _rebind() {
    const arm = this.armRoot;
    // a bone per free particle, with its bind frame
    for (const P of this.pieces) {
      P.boneOf = new Int32Array(P.n).fill(-1);
      P.bones = [];
      P.f0 = new Float64Array(P.n * 4);     // the bind frame's inverse rotation (quaternion), per particle
      this._frames(P, P.f0, true);
      // (every particle a bone, the pinned row's too: a pin pushed off the belt by a thigh carries its cloth with it)
      for (let i = 0; i < P.n; i++) {
        const c = i % P.C, r = Math.floor(i / P.C);
        const bone = new THREE.Bone();
        bone.name = `cl_${P.name}_${c}_${r}`;
        bone.matrixAutoUpdate = true;
        arm.add(bone);
        P.boneOf[i] = P.bones.length;
        P.bones.push(bone);
        this.bones.push(bone);
      }
    }
    this._writeBones(true);
    // the meshes to re-skin, grouped by their skeleton
    const groups = new Map();
    for (const P of this.pieces) for (const v of P.verts) {
      const sk = v.mesh.skeleton;
      if (!groups.has(sk)) groups.set(sk, { sk, meshes: new Set(), pieces: new Set() });
      groups.get(sk).meshes.add(v.mesh); groups.get(sk).pieces.add(P);
    }
    // every mesh in the model on such a skeleton is re-bound (a mesh that shares it but has no cloth keeps its skin)
    const all = [];
    this.model.traverse((o) => { if (o.isSkinnedMesh) all.push(o); });
    this.rebound = [];
    for (const g of groups.values()) {
      const bones = g.sk.bones.slice(), invs = g.sk.boneInverses.map((m) => m.clone());
      const idxOf = new Map();
      for (const P of g.pieces) {
        for (const bone of P.bones) {
          idxOf.set(bone, bones.length);
          bones.push(bone);
          // inverse: W_c0^-1 x (root bone world x its inverse bind): at build, the bone reproduces the rigid bind place
          const rootName = P.root.bone.name;
          const k = g.sk.bones.findIndex((b) => b.name === rootName);
          const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(_m1.multiplyMatrices(g.sk.bones[k].matrixWorld, g.sk.boneInverses[k]));
          invs.push(inv);
        }
      }
      const skel = new THREE.Skeleton(bones, invs);
      const users = all.filter((m) => m.skeleton === g.sk);
      // the skin attributes, re-written per mesh on a copy (the source geometry is the assets', shared)
      for (const mesh of users) {
        const geo = mesh.geometry, si0 = geo.attributes.skinIndex, sw0 = geo.attributes.skinWeight;
        const si = new THREE.BufferAttribute(new Uint16Array(si0.count * 4), 4), sw = new THREE.BufferAttribute(new Float32Array(sw0.count * 4), 4);
        for (let i = 0; i < si0.count; i++) for (let k = 0; k < 4; k++) { si.setComponent(i, k, si0.getComponent(i, k)); sw.setComponent(i, k, sw0.getComponent(i, k)); }
        let touched = 0;
        for (const P of g.pieces) for (const v of P.verts) {
          if (v.mesh !== mesh) continue;
          this._skinVertex(P, v, g.sk, idxOf, si0, sw0, si, sw);
          touched++;
        }
        if (!touched && mesh !== [...g.meshes][0]) { /* a sharer with no cloth: same attributes, new skeleton */ }
        const ng = new THREE.BufferGeometry();
        for (const k in geo.attributes) ng.setAttribute(k, k === 'skinIndex' ? si : k === 'skinWeight' ? sw : geo.attributes[k]);
        ng.setIndex(geo.index); for (const gr of geo.groups) ng.addGroup(gr.start, gr.count, gr.materialIndex);
        ng.drawRange = geo.drawRange; ng.boundingBox = geo.boundingBox; ng.boundingSphere = geo.boundingSphere;
        ng.name = geo.name; ng.userData = geo.userData;
        for (const k in geo.morphAttributes) ng.morphAttributes[k] = geo.morphAttributes[k];
        this.rebound.push({ mesh, geo0: geo, skel0: g.sk, geo: ng });
        mesh.geometry = ng;
        mesh.bind(skel, mesh.bindMatrix);
      }
    }
  }

  _skinVertex(P, v, sk0, idxOf, si0, sw0, si, sw) {
    const C = P.C, R = P.R;
    let s = Math.max(0, Math.min(1, v.s)) * (C - 1), t = Math.max(0, Math.min(1, v.t)) * (R - 1);
    let c0 = Math.min(C - 2, Math.floor(s)), r0 = Math.min(R - 2, Math.floor(t));
    if (C === 1) c0 = 0;
    const fs = s - c0, ft = t - r0;
    const rootIdx = sk0.bones.findIndex((b) => b.name === P.root.bone.name);
    const inf = new Map();
    const addW = (bi, w) => { if (w > 1e-6) inf.set(bi, (inf.get(bi) || 0) + w); };
    // the vertex's weight off the old chain stays where it was (a knot's on the head)
    let wc = 0;
    const bn = sk0.bones;
    for (let k = 0; k < 4; k++) {
      const b = si0.getComponent(v.i, k), w = sw0.getComponent(v.i, k);
      if ((bn[b]?.name || '').startsWith(P.stem)) wc += w; else addW(b, w);
    }
    const corner = (c, r, w) => {
      const i = c + r * C;
      if (P.boneOf[i] < 0) addW(rootIdx, w * wc);
      else addW(idxOf.get(P.bones[P.boneOf[i]]), w * wc);
    };
    corner(c0, r0, (1 - fs) * (1 - ft)); corner(c0 + 1, r0, fs * (1 - ft)); corner(c0, r0 + 1, (1 - fs) * ft); corner(c0 + 1, r0 + 1, fs * ft);
    const list = [...inf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let tot = 0; for (const [, w] of list) tot += w;
    for (let k = 0; k < 4; k++) {
      const e = list[k];
      si.setComponent(v.i, k, e ? e[0] : 0); sw.setComponent(v.i, k, e ? e[1] / tot : 0);
    }
  }

  /** Each particle's frame from its neighbours (rows down, columns across) as a quaternion; `inv` stores its inverse. */
  _frames(P, out, inv) {
    const C = P.C, R = P.R, x = P.x;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = c + r * C;
      const u0 = (r > 0 ? r - 1 : r) * C + c, u1 = (r < R - 1 ? r + 1 : r) * C + c;
      const s0 = r * C + (c > 0 ? c - 1 : c), s1 = r * C + (c < C - 1 ? c + 1 : c);
      // Y up the cloth, X across, Z = X x Y
      _v1.set(x[u0 * 3] - x[u1 * 3], x[u0 * 3 + 1] - x[u1 * 3 + 1], x[u0 * 3 + 2] - x[u1 * 3 + 2]).normalize();
      _v2.set(x[s1 * 3] - x[s0 * 3], x[s1 * 3 + 1] - x[s0 * 3 + 1], x[s1 * 3 + 2] - x[s0 * 3 + 2]);
      _v2.addScaledVector(_v1, -_v2.dot(_v1));
      if (_v2.lengthSq() < 1e-12) _v2.set(1, 0, 0).addScaledVector(_v1, -_v1.x);
      _v2.normalize();
      _v3.crossVectors(_v2, _v1);
      _mb.makeBasis(_v2, _v1, _v3);
      _q1.setFromRotationMatrix(_mb);
      if (inv) _q1.invert();
      out[i * 4] = _q1.x; out[i * 4 + 1] = _q1.y; out[i * 4 + 2] = _q1.z; out[i * 4 + 3] = _q1.w;
    }
  }

  /** Every cl_ bone to its particle: position, the frame turn from bind, the root's scale. */
  _writeBones() {
    const arm = this.armRoot;
    _m2.copy(arm.matrixWorld).invert();
    arm.matrixWorld.decompose(_v1, _q2, _vs);
    const ps = _vs.x;
    _q2.invert();                      // the armature's world rotation, inverse
    const fr = this._fr || (this._fr = new Float64Array(64 * 4));
    for (const P of this.pieces) {
      this._frames(P, fr, false);
      const s = P.root.s / ps;
      for (let i = 0; i < P.n; i++) {
        const bi = P.boneOf ? P.boneOf[i] : -1;
        if (bi < 0) continue;
        const bone = P.bones[bi];
        _v1.set(P.x[i * 3], P.x[i * 3 + 1], P.x[i * 3 + 2]).applyMatrix4(_m2);
        bone.position.copy(_v1);
        _q1.set(fr[i * 4], fr[i * 4 + 1], fr[i * 4 + 2], fr[i * 4 + 3]);
        _qa[0] = P.f0[i * 4]; _qa[1] = P.f0[i * 4 + 1]; _qa[2] = P.f0[i * 4 + 2]; _qa[3] = P.f0[i * 4 + 3];
        bone.quaternion.copy(_q2).multiply(_q1).multiply(_q.set(_qa[0], _qa[1], _qa[2], _qa[3]));
        bone.scale.set(s, s, s);
        bone.matrix.compose(bone.position, bone.quaternion, bone.scale);
        bone.matrixWorld.multiplyMatrices(arm.matrixWorld, bone.matrix);
      }
    }
  }

  /* ------------------------------------------------------------------ the kept chains */
  _buildAdapters() {
    const an = this.an;
    for (const P of this.pieces) {
      const ch = (an._chains || []).find((c) => c.links[0].name === P.stem + '_01');
      if (!ch) continue;
      ch.clothOwned = true;
      // each link's place (and the tip's) as a grid parameter: the centre column, at the link's bind place
      const mesh = P.kind === 'tail' ? this.meshes.wrap : this.meshes.outfit;
      const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses;
      const names = ch.links.map((l) => l.name).concat([P.stem + '_end']);
      const ts = [];
      for (const nm of names) {
        const k = bones.findIndex((b) => b.name === nm);
        if (k < 0) { ts.push(1); continue; }
        _v1.setFromMatrixPosition(_m1.copy(inv[k]).invert());
        if (P.kind === 'panel') ts.push(Math.max(0, Math.min(1, (P.yTop - _v1.y) / (P.yTop - P.yBot))));
        else ts.push(names.indexOf(nm) / (names.length - 1));
      }
      this.adapters.push({ P, ch, ts });
    }
  }

  /** The grid's place at (s, t) into `out` (bilinear in the particles). */
  _sample(P, s, t, out) {
    const C = P.C, R = P.R, x = P.x;
    const ss = Math.max(0, Math.min(1, s)) * (C - 1), tt = Math.max(0, Math.min(1, t)) * (R - 1);
    const c0 = Math.min(C - 2, Math.floor(ss)), r0 = Math.min(R - 2, Math.floor(tt)), fs = ss - c0, ft = tt - r0;
    const a = c0 + r0 * C, b = a + 1, c = a + C, d = c + 1;
    for (let k = 0; k < 3; k++) out.setComponent(k, (x[a * 3 + k] * (1 - fs) + x[b * 3 + k] * fs) * (1 - ft) + (x[c * 3 + k] * (1 - fs) + x[d * 3 + k] * fs) * ft);
    return out;
  }

  _driveChains() {
    for (const A of this.adapters) {
      const { P, ch, ts } = A, L = ch.links, N = L.length;
      // particle places of the links and the tip, into the chain's own arrays
      for (let j = 0; j <= N; j++) {
        this._sample(P, 0.5, ts[j], _v1);
        ch.pos[j * 3] = _v1.x; ch.pos[j * 3 + 1] = _v1.y; ch.pos[j * 3 + 2] = _v1.z;
      }
      ch.vel.fill(0); ch.ax = 0; ch.az = 0; ch.vx = 0; ch.vz = 0;
      // each link turned (swing only) so it points at the next one, root first, from its bind rotation on its parent;
      // the parent's world rotation carried down the chain (no ancestor walk)
      const root = L[0].bone.parent;
      root.matrixWorld.decompose(_v3, _qw, _vs);
      for (let j = 0; j < N; j++) {
        const e = L[j], bone = e.bone, par = bone.parent;
        // this link's world place (its bind place on its parent) and its bind direction under the parent's turn
        _v3.copy(bone.position).applyMatrix4(par.matrixWorld);
        _q1.copy(_qw).multiply(e.bindQ);                                   // W = Wp L
        _vs.copy(j + 1 < N ? L[j + 1].bone.position : ch.tipOff).applyQuaternion(_q1).normalize();
        _v2.set(ch.pos[(j + 1) * 3] - _v3.x, ch.pos[(j + 1) * 3 + 1] - _v3.y, ch.pos[(j + 1) * 3 + 2] - _v3.z);
        const l = _v2.length();
        bone.quaternion.copy(e.bindQ);
        if (l > 1e-6) {
          _v2.multiplyScalar(1 / l);
          _q2.setFromUnitVectors(_vs, _v2);                                // T (world)
          _q.copy(_qw).invert().multiply(_q2).multiply(_qw);               // Wp^-1 T Wp
          bone.quaternion.premultiply(_q);
          _q1.premultiply(_q2);                                            // W' = T W
        }
        bone.updateMatrix();
        bone.matrixWorld.multiplyMatrices(par.matrixWorld, bone.matrix);
        _qw.copy(_q1);
      }
    }
  }

  /* ------------------------------------------------------------------ per frame */
  /** Read the roots and the colliders, the wind, step, write the bones and the kept chains. */
  update(dt, t, wind) {
    if (!this.ok) return;
    const S = this.sys;
    propCaps(this.an).dt = dt;
    for (const r of S.roots) { decomp(r.bone, _pp, _pq); ClothSystem.setRoot(r, _pp[0], _pp[1], _pp[2], _pq, _vs.x, dt); }
    this._updateColliders(dt);
    S.wind.x = Number.isFinite(wind?.x) ? wind.x : 0; S.wind.z = Number.isFinite(wind?.z) ? wind.z : 0;
    S.update(dt, t);
    this._writeBones();
    this._driveChains();
  }

  /** The deterministic reset (the sim-time slate): roots and colliders read now, the settle, the bones written. */
  reset(t = 0) {
    if (!this.ok) return;
    const S = this.sys;
    this.model.updateMatrixWorld(true);
    // (the quiver's capsule is read off the kit's skinned vertices, i.e. its skeleton's bone matrices, which the render
    //  brings up to date: a reset brings them up to date itself, so it reads the pose it is given, not last frame's)
    this.meshes.kit?.skeleton?.update();
    for (const r of S.roots) { decomp(r.bone, _pp, _pq); r.primed = false; ClothSystem.setRoot(r, _pp[0], _pp[1], _pp[2], _pq, _vs.x, 1 / 60); }
    this._updateColliders(1 / 60);
    S.reset(t);
    this._writeBones();
    this._driveChains();
  }

  digest() { return this.ok ? this.sys.digest() : null; }

  /** Undo the re-skin: every mesh back on its own geometry and skeleton, the cl_ bones removed, the chains given back. */
  dispose() {
    for (const R of this.rebound || []) { R.mesh.geometry = R.geo0; R.mesh.bind(R.skel0, R.mesh.bindMatrix); R.geo.dispose?.(); }
    this.rebound = [];
    for (const b of this.bones) b.removeFromParent();
    this.bones = [];
    for (const A of this.adapters) { A.ch.clothOwned = false; A.ch.seeded = false; }
    this.adapters = [];
    this.ok = false;
  }

  info() {
    return {
      ok: this.ok, err: this.err, pieces: this.pieces.map((P) => ({ name: P.name, C: P.C, R: P.R, n: P.n, bones: P.bones?.length || 0, verts: P.verts?.length || 0, asleep: P.asleep, sleeps: P.sleeps, wakes: P.wakes })),
      colliders: this.sys.colliders.map((C) => ({ name: C.name, r0: +C.r0.toFixed(4), r1: +C.r1.toFixed(4), on: C.on })),
      bones: this.bones.length, sub: this.sys.lastSub, timing: this.sys.timing(), digest: this.digest(),
    };
  }
}
const _pp = new Float64Array(3), _pq = new Float64Array(4);
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion();
