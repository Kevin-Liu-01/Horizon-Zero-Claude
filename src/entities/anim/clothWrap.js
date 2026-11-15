/**
 * M1.2e round 2 — THE CLOTH WRAP PASS: the sash panels and the wrap's tails laid round the body, on the skinned cloth.
 *
 * The chain solver (`secondaryMotion.js _springs`) moves a panel's CENTRE LINE and treats the sheet either side of it
 * as a flat plate (`_sheetPush`). A sash panel is 0.12-0.28 m wide and curved round her hip, and in a stride, a crouch,
 * a roll or a climb the leg it hangs over (or, for the back panel, the leg behind it) comes up under the plate where
 * the centre line's test cannot see it: measured on the bench before this pass, panel vertices up to 0.061 m inside a
 * thigh in 161 of 180 crouch frames, 0.037 m in 29 of 180 run frames, and the back panel in the quiver in a slide.
 *
 * This pass runs after the solver (and after melee's last hair fix), on the cloth as the renderer will skin it: each
 * panel's and each tail's own vertices (the outfit's and the hair wrap's, weighted >= 0.3 to the chain), skinned on
 * the CPU from the bone matrices exactly as three's `SkinnedMesh.applyBoneTransform` does, against the body's
 * capsules at its inner radius plus a margin (the torso as four segments up the spine, thighs, shins), the stowed quiver (its own
 * vertices' axis) and the draw arm (right upper arm and forearm). Root to tip, link by link, the deepest vertex of a
 * link's own span that is inside a capsule turns that link about its joint, along the capsule's outward normal, by
 * the angle that brings it out (`delta / (w |r x n|)`, up to 0.35 rad a step, eight steps); the links below ride
 * the turn and are tested in their turn; two sweeps. The chain's particles are then put where the bones are, so the
 * next frame's integration starts from the cloth that was drawn (a contact, not a pop). The sheet is never moved
 * through the body to get out: a vertex is pushed along the normal of the capsule it is in.
 *
 * Margins: the legs 0.020 m over the grader's inner radius for the panels (thigh 0.082 m off the axis on this body,
 * the trousers stand at 0.096-0.105), the shins 0.025, the torso 0.006 (the panels hang from the belt on it), the
 * quiver and the draw arm 0.010; the tails 0.004 everywhere (they clear the body at rest; this only guards them).
 *
 * Cost: every link is first tested by its span's bounding sphere (bind, bone-local); a link clear of every capsule
 * costs one sphere test per capsule. No allocation per frame: every buffer is sized when the cloth is found.
 * The outfit and the hair wrap are looked for again every 30 frames (a swap rebinds them), without a closure.
 */
import * as THREE from 'three';

const _m = [];            // per set: the skinning matrices of the bones its vertices use (Matrix4, sized at init)
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3();
const _p = new THREE.Vector3(), _ax = new THREE.Vector3(), _bp = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _su = new THREE.Vector3(), _sv = new THREE.Vector3();
const _qp2 = new THREE.Quaternion(), _qb2 = new THREE.Quaternion(), _qpi = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
/** The least a span gathers toward its joint (the last resort, panels only). */
const GATHER_MIN = 0.6;
/** M1a r2 fix: the most a panel's root joint is lifted off the belt, out of a raised thigh (m). */
const ROOT_PUSH = 0.08;
/** The capsules near the span being solved (its bounding sphere against each, recomputed every step). */
const _near = new Int8Array(32);
let _nn = 0;
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
const _stack = [];

/** Grader-matching inner radius of a body capsule (tools/gates/hero-sweep/measure.mjs): the 20th percentile of the
 *  skin's own distance to the axis at bind (vertices weighted >= 0.9 to the segment's bones), less 5 mm. */
function innerRadius(skin, a, b, re) {
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

/** The torso's segments up the spine (`bones`, pelvis first): each one's inner radius from the torso skin (weighted
 *  >= 0.9 to the pelvis and spine) NEAREST to it, interior points only, the 20th percentile less 5 mm. */
function torsoRadii(skin, bones) {
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

export class ClothWrap {
  /** Find the cloth (outfit panels, wrap tail, knot tail), the body capsules and the quiver; once per cloth build. */
  _cwScan() {
    // a closure-free walk of the model for the four meshes the pass reads
    let outfit = null, wrap = null, skin = null, kit = null;
    _stack.length = 0; _stack.push(this.model);
    while (_stack.length) {
      const o = _stack.pop();
      if (o.isSkinnedMesh) {
        const part = o.userData?.heroPart || '';
        // (M1a r2 fix: not the set's shadow Caster, which carries the outfit's heroPart too: the pass found it first
        //  and wrapped its 11-16 panel vertices while the drawn panels went through her, bench crouch 148 / 180 frames)
        if (o.name === 'Caster' || o.material?.name === 'hero-caster') { /* the shadow proxy: never drawn */ }
        else if (!outfit && part.indexOf('outfit') >= 0) outfit = o;
        else if (!kit && part.indexOf('stowkit') >= 0) kit = o;
        else if (!wrap && o.name.indexOf('HairWrap') >= 0) wrap = o;
        else if (!skin && o.geometry.getAttribute('_hidemask')) skin = o;
      }
      const ch = o.children;
      for (let i = 0; i < ch.length; i++) _stack.push(ch[i]);
    }
    const W = this._cw;
    if (W && W.outfit === outfit && W.wrap === wrap && W.skin === skin && W.kit === kit) return W;
    this._cw = this._cwBuild(outfit, wrap, skin, kit);
    return this._cw;
  }

  _cwBuild(outfit, wrap, skin, kit) {
    const W = { outfit, wrap, skin, kit, sets: [], caps: [], quiver: null, ok: false, t: 0, stats: { frames: 0, pushes: 0, left: 0, deepLeft: 0 } };
    if (!skin || !this.b?.pelvis || !this.b.thighL || !this.b.calfL || !this.b.footL) return W;
    this.model.updateMatrixWorld(true);
    const b = this.b, neck = b.neck1?.bone || b.head?.bone;
    // the torso up her spine (pelvis -> spine_01 -> spine_02 -> spine_03 -> neck), each segment at the inner radius of
    // the torso skin nearest to it: the sweep's own body (tools/gates/hero-sweep/measure.mjs)
    const byName = (n) => this.bones?.[n] || null;
    const spine = [b.pelvis.bone, byName('spine_01') || b.spine1?.bone, byName('spine_02') || b.spine2?.bone, byName('spine_03') || b.spine3?.bone, neck].filter(Boolean);
    for (const [k, r] of torsoRadii(skin, spine).entries()) {
      // (M1a r2 fix: margins 0.012 / 0.004 -> 0.016 / 0.008: the grader finds its own torso radii, up to 2.5 mm over
      //  these on the segment under the chest, and the tails and hems were graded 0.5-0.8 mm inside it)
      W.caps.push({ name: 'torso' + k, a: spine[k], b: spine[k + 1], A: new THREE.Vector3(), B: new THREE.Vector3(), r0: r, rP: r + 0.016, rT: r + 0.008 });
    }
    const capDef = [
      // [name, a, b, bone regex for the inner radius, margin panels, margin tails]
      ['thighL', b.thighL.bone, b.calfL.bone, /^thigh_.*l$|^thigh_l$/, 0.020, 0.004],
      ['thighR', b.thighR.bone, b.calfR.bone, /^thigh_.*r$|^thigh_r$/, 0.020, 0.004],
      ['shinL', b.calfL.bone, b.footL.bone, /^calf_.*l$|^calf_l$/, 0.025, 0.004],
      ['shinR', b.calfR.bone, b.footR.bone, /^calf_.*r$|^calf_r$/, 0.025, 0.004],
    ];
    for (const [name, a, bb, re, mP, mT] of capDef) {
      const r = innerRadius(skin, a, bb, re);
      if (r == null) continue;
      W.caps.push({ name, a, b: bb, A: new THREE.Vector3(), B: new THREE.Vector3(), r0: r, rP: r + mP, rT: r + mT });
    }
    // the draw arm (the grader's 0.040 / 0.032 m)
    if (b.upArmR && b.loArmR && b.handR) {
      W.caps.push({ name: 'upArmR', a: b.upArmR.bone, b: b.loArmR.bone, A: new THREE.Vector3(), B: new THREE.Vector3(), r0: 0.040, rP: 0.056, rT: 0.046 });
      W.caps.push({ name: 'foreArmR', a: b.loArmR.bone, b: b.handR.bone, A: new THREE.Vector3(), B: new THREE.Vector3(), r0: 0.032, rP: 0.048, rT: 0.038 });
    }
    // the stowed quiver: its own vertices (stow kit piece bit 4); the two farthest apart at bind are its ends, the
    // median distance to that axis its radius (as the grader finds it), the ends drawn in by 0.7 of the radius
    if (kit && kit.geometry.getAttribute('_piece')) {
      const P = kit.geometry.getAttribute('_piece'), idx = [], v = new THREE.Vector3();
      for (let i = 0; i < P.count; i += 3) if ((Math.round(P.getX(i)) & 4) !== 0) idx.push(i);
      if (idx.length > 8) {
        const at = (i) => { kit.getVertexPosition(i, v); kit.localToWorld(v); return v.clone(); };
        const p0 = at(idx[0]); let ia = idx[0], d = -1;
        for (const i of idx) { const e = at(i).distanceTo(p0); if (e > d) { d = e; ia = i; } }
        const pa = at(ia); let ib = ia; d = -1;
        for (const i of idx) { const e = at(i).distanceTo(pa); if (e > d) { d = e; ib = i; } }
        const pb = at(ib), AB = pb.clone().sub(pa), l2 = AB.lengthSq() || 1e-9, ds = [];
        for (const i of idx) { const q = at(i), t = Math.max(0, Math.min(1, q.clone().sub(pa).dot(AB) / l2)); ds.push(q.sub(pa).addScaledVector(AB, -t).length()); }
        ds.sort((x, y) => x - y);
        const r = ds[Math.floor(ds.length / 2)];
        W.quiver = { ia, ib, r };
        // (0.015 over it for the panels: the stow kit swings the quiver after this pass, in the same step)
        W.caps.push({ name: 'quiver', a: null, b: null, A: new THREE.Vector3(), B: new THREE.Vector3(), r0: r - 0.004, rP: r + 0.015, rT: r + 0.006 });
      }
    }
    const chains = this._chains || [];
    const addSet = (mesh, stem, minW, tail) => {
      if (!mesh) return;
      const chain = chains.find((c) => c.links[0].name === stem + '_01');
      if (!chain) return;
      const bones = mesh.skeleton.bones, names = bones.map((x) => x.name);
      const linkOf = new Map();
      chain.links.forEach((l, j) => linkOf.set(l.name, j));
      const endName = stem + '_end';
      const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
      const rows = [];
      for (let i = 0; i < pos.count; i++) {
        let tot = 0, best = -1, bw = 0;
        for (let k = 0; k < 4; k++) {
          const n = names[si.getComponent(i, k)] || '', w = sw.getComponent(i, k);
          let j = linkOf.get(n);
          if (j === undefined && n === endName) j = chain.N - 1;
          if (j === undefined) continue;
          tot += w; if (w > bw) { bw = w; best = j; }
        }
        if (tot < minW || best < 0) continue;
        rows.push({ i, j: best });
      }
      if (!rows.length) return;
      rows.sort((p, q) => p.j - q.j);
      const nV = rows.length;
      const ub = [], ubOf = new Map();
      const S = {
        mesh, stem, chain, tail, n: nV,
        vi: new Int32Array(nV), base: new Float32Array(nV * 3), bi: new Uint8Array(nV * 4), bw: new Float32Array(nV * 4), dom: new Float32Array(nV),
        gStart: new Int32Array(chain.N + 1), sph: new Float32Array(chain.N * 4), ub, mats: null,
      };
      const v = new THREE.Vector3();
      rows.forEach((row, k) => {
        S.vi[k] = row.i;
        v.fromBufferAttribute(pos, row.i).applyMatrix4(mesh.bindMatrix);
        S.base[k * 3] = v.x; S.base[k * 3 + 1] = v.y; S.base[k * 3 + 2] = v.z;
        for (let s = 0; s < 4; s++) {
          const bix = si.getComponent(row.i, s);
          let u = ubOf.get(bix);
          if (u === undefined) { u = ub.length; ub.push(bix); ubOf.set(bix, u); }
          S.bi[k * 4 + s] = u; S.bw[k * 4 + s] = sw.getComponent(row.i, s);
          const n = names[bix] || '';
          const j = linkOf.get(n) ?? (n === endName ? chain.N - 1 : -1);
          if (j === row.j) S.dom[k] += sw.getComponent(row.i, s);
        }
      });
      for (let j = 0, k = 0; j <= chain.N; j++) { while (k < nV && rows[k].j < j) k++; S.gStart[j] = k; }
      S.ubBones = ub.map((x) => bones[x]);
      S.ubInv = ub.map((x) => mesh.skeleton.boneInverses[x]);
      S.mats = ub.map(() => new THREE.Matrix4());
      S.tmp = new Float32Array(nV * 3);
      // each link's span: a bounding sphere in the link bone's own frame, from the bind pose
      mesh.updateMatrixWorld(true);
      this._cwMats(S);
      for (let j = 0; j < chain.N; j++) {
        const bone = chain.links[j].bone, inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
        const k0 = S.gStart[j], k1 = S.gStart[j + 1];
        if (k1 <= k0) { S.sph[j * 4 + 3] = -1; continue; }
        const box = new THREE.Box3();
        for (let k = k0; k < k1; k++) { this._cwSkin(S, k, v); box.expandByPoint(v.applyMatrix4(inv)); }
        const c = box.getCenter(new THREE.Vector3());
        let rr = 0;
        for (let k = k0; k < k1; k++) { this._cwSkin(S, k, v); rr = Math.max(rr, v.applyMatrix4(inv).distanceTo(c)); }
        S.sph[j * 4] = c.x; S.sph[j * 4 + 1] = c.y; S.sph[j * 4 + 2] = c.z; S.sph[j * 4 + 3] = rr + 0.02;
      }
      // (M1a r2 fix: the root joint's own place on the belt, so the root push below is undone every step)
      if (!tail && !chain.links[0]._cwP0) chain.links[0]._cwP0 = chain.links[0].bone.position.clone();
      W.sets.push(S);
    };
    addSet(outfit, 'dyn_panelL', 0.3, false);
    addSet(outfit, 'dyn_panelR', 0.3, false);
    addSet(outfit, 'dyn_panelB', 0.3, false);
    addSet(wrap, 'dyn_wrapSash', 0.3, true);
    addSet(wrap, 'dyn_hairKnotTail', 0.3, true);
    W.ok = W.sets.length > 0;
    return W;
  }

  /** The set's skinning matrices now (bone world x bone inverse). */
  _cwMats(S) {
    for (let u = 0; u < S.mats.length; u++) S.mats[u].multiplyMatrices(S.ubBones[u].matrixWorld, S.ubInv[u]);
  }

  /** Vertex k of set S, skinned (world), into `out`. */
  _cwSkin(S, k, out) {
    const bx = S.base[k * 3], by = S.base[k * 3 + 1], bz = S.base[k * 3 + 2];
    let x = 0, y = 0, z = 0;
    for (let s = 0; s < 4; s++) {
      const w = S.bw[k * 4 + s];
      if (w === 0) continue;
      const e = S.mats[S.bi[k * 4 + s]].elements;
      x += w * (e[0] * bx + e[4] * by + e[8] * bz + e[12]);
      y += w * (e[1] * bx + e[5] * by + e[9] * bz + e[13]);
      z += w * (e[2] * bx + e[6] * by + e[10] * bz + e[14]);
    }
    return out.set(x, y, z);
  }

  /** Point p against capsule C at radius r: depth (> 0 inside), the outward normal in `_n`. */
  _cwDepth(p, C, r) {
    _ab.subVectors(C.B, C.A);
    const l2 = _ab.lengthSq();
    _ap.subVectors(p, C.A);
    let t = l2 > 1e-10 ? _ap.dot(_ab) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    _ap.addScaledVector(_ab, -t);
    const d = _ap.length();
    if (d >= r) return 0;
    if (d > 1e-6) _n.copy(_ap).multiplyScalar(1 / d); else _n.set(0, 1, 0);
    return r - d;
  }

  /** The deepest vertex of span j inside any capsule at the grader's radius plus 1 mm (> 0: still inside her). */
  _cwSpanDeep(S, j, caps) {
    let mx = 0;
    this._cwNear(S, j, caps, 0.001);
    if (!_nn) return 0;
    for (let k = S.gStart[j]; k < S.gStart[j + 1]; k++) {
      this._cwSkin(S, k, _x);
      for (let m = 0; m < _nn; m++) { const q = _near[m]; const d = this._cwDepth(_x, caps[q], caps[q].r0 + 0.001); if (d > mx) mx = d; }
    }
    return mx;
  }

  /** The capsules span j's bounding sphere (bind, in its bone's frame, 0.04 m slack) meets at the pass radius, into
   *  `_near` / `_nn`; `hard` > 0 grades at the grader's radius plus `hard` instead. */
  _cwNear(S, j, caps, hard = 0) {
    const bone = S.chain.links[j].bone;
    _y.set(S.sph[j * 4], S.sph[j * 4 + 1], S.sph[j * 4 + 2]).applyMatrix4(bone.matrixWorld);
    const R = S.sph[j * 4 + 3] + 0.04;
    _nn = 0;
    for (let q = 0; q < caps.length && _nn < 32; q++) {
      const r = hard > 0 ? caps[q].r0 + hard : S.tail ? caps[q].rT : caps[q].rP;
      if (this._cwDepth(_y, caps[q], r + R) > 0) _near[_nn++] = q;
    }
    return _nn;
  }

  /** Set S's vertices from span j down (every other one) at the pass radius: the deepest, plus a hundredth of the
   *  total (so of two ways out as deep, the one with less cloth inside wins). */
  _cwPen(S, j, caps) {
    let sum = 0, mx = 0;
    for (let k = S.gStart[j]; k < S.n; k += 2) {
      this._cwSkin(S, k, _x);
      for (let q = 0; q < caps.length; q++) { const d = this._cwDepth(_x, caps[q], S.tail ? caps[q].rT : caps[q].rP); sum += d; if (d > mx) mx = d; }
    }
    return mx + 0.01 * sum;
  }

  /**
   * A link stalled in a crease: 32 turns about its joint (8 directions square to the link, 0.2 / 0.45 / 0.8 / 1.3 rad),
   * each graded by the deepest vertex of its span and every span below it; the least wins if it beats where it is. No
   * allocation. Returns whether it turned the link.
   */
  _cwSearch(S, j, bone, caps) {
    _qs.copy(bone.quaternion);
    const base = this._cwPen(S, j, caps);
    _y.setFromMatrixPosition(bone.matrixWorld);
    const ch = S.chain;
    if (j + 1 < ch.N) _r.setFromMatrixPosition(ch.links[j + 1].bone.matrixWorld); else _r.copy(ch.tipOff).applyMatrix4(bone.matrixWorld);
    _r.sub(_y).normalize();
    _su.set(0, 1, 0).cross(_r); if (_su.lengthSq() < 1e-6) _su.set(1, 0, 0).cross(_r);
    _su.normalize(); _sv.crossVectors(_r, _su).normalize();
    bone.parent.getWorldQuaternion(_qpi);
    _qp.copy(_qpi).invert();
    let best = base, bq = -1;
    for (let a = 0; a < 8; a++) {
      const ca = Math.cos(a * Math.PI / 4), sa = Math.sin(a * Math.PI / 4);
      for (let m = 0; m < 4; m++) {
        const th = m === 0 ? 0.2 : m === 1 ? 0.45 : m === 2 ? 0.8 : 1.3;
        _ax.set(_su.x * ca + _sv.x * sa, _su.y * ca + _sv.y * sa, _su.z * ca + _sv.z * sa).applyQuaternion(_qp);
        _q.setFromAxisAngle(_ax, th);
        bone.quaternion.copy(_qs).premultiply(_q);
        bone.updateMatrixWorld(true); this._cwMats(S);
        // (a small cost of turning, the nearest way out; and for a panel a cost of pointing up: cloth falls)
        let pen = this._cwPen(S, j, caps) + 0.001 * th;
        if (!S.tail) { _p.copy(_r).applyQuaternion(_q2.setFromAxisAngle(_bp.copy(_ax).applyQuaternion(_qpi), th)); if (_p.y > 0) pen += 0.02 * _p.y; }
        if (pen < best) { best = pen; bq = a * 4 + m; _qb.copy(bone.quaternion); }
      }
    }
    if (bq < 0) { bone.quaternion.copy(_qs); bone.updateMatrixWorld(true); this._cwMats(S); return false; }
    bone.quaternion.copy(_qb); bone.updateMatrixWorld(true);
    return true;
  }

  /**
   * Per frame, after the chains: every cloth vertex of every link outside every capsule, or as far out as eight
   * turns of its link can bring it. Publishes `clothWrapInfo()` (pushes this frame, vertices left inside, deepest).
   */
  _clothWrap() {
    if (this._cwOff) return;
    this._cwT = (this._cwT | 0) + 1;
    if (!this._cw || this._cwT % 30 === 0) this._cwScan();
    const W = this._cw;
    if (!W?.ok) return;
    /* M1a r2 fix: the layers above write bone quaternions, not world matrices, and in the page the matrices are the
     * last render's (the player moved the model and every layer re-posed the skeleton since): the capsules and the
     * cloth were tested where they were a frame ago (bench, page order: 38 clipping frames in a jog, 148 in a crouch,
     * against 0 with fresh matrices). The whole character's world matrices first, once. */
    this.model.updateMatrixWorld(true);
    const caps = W.caps;
    for (let q = 0; q < caps.length; q++) {
      const C = caps[q];
      if (C.a) { C.A.setFromMatrixPosition(C.a.matrixWorld); C.B.setFromMatrixPosition(C.b.matrixWorld); }
      else if (W.quiver && W.kit) {
        W.kit.getVertexPosition(W.quiver.ia, C.A); W.kit.localToWorld(C.A);
        W.kit.getVertexPosition(W.quiver.ib, C.B); W.kit.localToWorld(C.B);
        _ab.subVectors(C.B, C.A); const L = _ab.length();
        if (L > 1e-6) { _ab.multiplyScalar(W.quiver.r * 0.7 / L); C.A.add(_ab); C.B.sub(_ab); }
      }
    }
    let pushes = 0, left = 0, deepLeft = 0, gathers = 0, gatherMin = 1, shortMax = 0, rootPush = 0;
    for (let si = 0; si < W.sets.length; si++) {
      const S = W.sets[si], ch = S.chain, N = ch.N;
      let touched = false;
      // (the solver wrote the chain's quaternions, not its matrices: the renderer derives them; this pass reads them)
      ch.links[0].bone.updateMatrixWorld(true);
      /* M1a r2 fix: A PANEL'S ROOT JOINT OUT OF THE BODY FIRST. In a deep crouch or a climb the raised thigh comes up
       * through the belt where a front panel hangs (bench, crouch: the right panel's root joint 0.02 m off the thigh's
       * axis, inside its 0.062 m inner radius), and no turn of a link about a joint that is inside her gets its cloth
       * out: the pass folded the panel up across her belly into the chest instead. The root is lifted out along the
       * capsules' normals to the pass radius plus 0.01 m (at most `ROOT_PUSH` m), the belt riding up over the thigh;
       * `_panelFollow` puts it back on the belt at the start of every step. */
      if (!S.tail && ch.links[0]._cwP0) {
        const rb = ch.links[0].bone;
        _x.setFromMatrixPosition(rb.matrixWorld);
        _p.set(0, 0, 0);
        for (let pass = 0; pass < 3; pass++) {
          let moved = false;
          _bp.copy(_x).add(_p);
          for (let q = 0; q < caps.length; q++) {
            if (caps[q].name === 'quiver') continue;
            const d = this._cwDepth(_bp, caps[q], caps[q].rP + 0.01);
            if (d > 0) { _p.addScaledVector(_n, d); _bp.addScaledVector(_n, d); moved = true; }
          }
          if (!moved) break;
        }
        const L = _p.length();
        if (L > 1e-5) {
          if (L > ROOT_PUSH) _p.multiplyScalar(ROOT_PUSH / L);
          _bp.copy(_x).add(_p);
          rb.position.copy(rb.parent.worldToLocal(_bp));
          rb.updateMatrixWorld(true);
          rootPush = rootPush > L ? rootPush : L;
        }
      }
      for (let sweep = 0; sweep < 3; sweep++) {
        let any = false;
        this._cwMats(S);
        for (let j = 0; j < N; j++) {
          const k0 = S.gStart[j], k1 = S.gStart[j + 1];
          if (k1 <= k0 || S.sph[j * 4 + 3] < 0) continue;
          const bone = ch.links[j].bone;
          // the span's bounding sphere against every capsule first
          _y.set(S.sph[j * 4], S.sph[j * 4 + 1], S.sph[j * 4 + 2]).applyMatrix4(bone.matrixWorld);
          let near = false;
          for (let q = 0; q < caps.length && !near; q++) if (this._cwDepth(_y, caps[q], (S.tail ? caps[q].rT : caps[q].rP) + S.sph[j * 4 + 3]) > 0) near = true;
          if (!near) continue;
          let searched = false, cap = 0.35, prevDeep = Infinity, bestDeep = Infinity;
          for (let it = 0; it < 12; it++) {
            // every vertex of this span inside a capsule wants to move out along that capsule's normal by its depth;
            // the turn of the link about its joint that does that best for all of them at once (damped least squares
            // on the rotation vector: each row w (r x n), r the vertex off the joint, w its weight on this link), so
            // a crease between two capsules (the belly and a raised thigh) turns the sheet sideways out of both
            // instead of handing it back and forth between them
            this._cwNear(S, j, caps);
            _y.setFromMatrixPosition(bone.matrixWorld);
            let a00 = 0, a01 = 0, a02 = 0, a11 = 0, a12 = 0, a22 = 0, b0 = 0, b1 = 0, b2 = 0, deep = 0;
            for (let k = k0; k < k1 && _nn; k++) {
              this._cwSkin(S, k, _x);
              for (let m = 0; m < _nn; m++) {
                const q = _near[m];
                const dd = this._cwDepth(_x, caps[q], S.tail ? caps[q].rT : caps[q].rP);
                if (dd <= 0) continue;
                if (dd > deep) deep = dd;
                const w = S.dom[k] > 0.25 ? S.dom[k] : 0.25;
                _r.subVectors(_x, _y);
                _ax.crossVectors(_r, _n).multiplyScalar(w);
                const t = dd + 0.002;
                a00 += _ax.x * _ax.x; a01 += _ax.x * _ax.y; a02 += _ax.x * _ax.z;
                a11 += _ax.y * _ax.y; a12 += _ax.y * _ax.z; a22 += _ax.z * _ax.z;
                b0 += _ax.x * t; b1 += _ax.y * t; b2 += _ax.z * t;
              }
            }
            if (this._cwDbg) this._cwDbg.push(`${S.stem.slice(4)} sweep ${sweep} link ${j} it ${it} deep ${deep.toFixed(4)}`);
            if (deep <= 0) break;
            any = true;
            // a step that made the deepest worse is taken back and the next one is half as long; the best kept
            if (deep < bestDeep) { bestDeep = deep; _qb2.copy(bone.quaternion); }
            if (deep > prevDeep + 1e-4 && it < 11) { bone.quaternion.copy(_qp2); bone.updateMatrixWorld(true); this._cwMats(S); cap *= 0.5; prevDeep = Infinity; continue; }
            prevDeep = deep; _qp2.copy(bone.quaternion);
            // stalled in a crease (a turn cannot lower it any more): look round the link's joint once for the way out
            if (it >= 5 && deep > 0.004 && !searched) { searched = true; if (this._cwSearch(S, j, bone, caps)) { this._cwMats(S); pushes++; touched = true; prevDeep = Infinity; cap = 0.35; continue; } }
            if (it === 11) {
              if (bestDeep < deep) { bone.quaternion.copy(_qb2); bone.updateMatrixWorld(true); this._cwMats(S); }
              // still caught (a hem between her legs, under her): the way out is the link above swinging, looked for
              // with this span's depth in its grade; the next sweep goes on from there
              if (j > 0 && (bestDeep < deep ? bestDeep : deep) > 0.004 && this._cwSearch(S, j - 1, ch.links[j - 1].bone, caps)) { this._cwMats(S); pushes++; }
              break;
            }
            // damped toward the turn that would let the link hang (its own direction toward world down): where
            // two capsules leave a choice, the cloth leaves the crease downward, as it would fall
            const lam = 1e-5 + 0.05 * (a00 + a11 + a22) / 3;
            a00 += lam; a11 += lam; a22 += lam;
            if (!S.tail) {
              if (j + 1 < N) _r.setFromMatrixPosition(ch.links[j + 1].bone.matrixWorld);
              else _r.copy(ch.tipOff).applyMatrix4(bone.matrixWorld);
              _r.sub(_y).normalize();
              _n.set(_r.z, 0, -_r.x);                    // d x (0, -1, 0)
              const sn = _n.length();
              if (sn > 1e-4) {
                const ang = Math.atan2(sn, -_r.y), g = (ang < 0.3 ? ang : 0.3) / sn;
                b0 += lam * _n.x * g; b1 += lam * _n.y * g; b2 += lam * _n.z * g;
              }
            }
            const c00 = a11 * a22 - a12 * a12, c01 = a02 * a12 - a01 * a22, c02 = a01 * a12 - a02 * a11;
            const det = a00 * c00 + a01 * c01 + a02 * c02;
            if (!(Math.abs(det) > 1e-14)) break;
            const c11 = a00 * a22 - a02 * a02, c12 = a01 * a02 - a00 * a12, c22 = a00 * a11 - a01 * a01;
            _ax.set((c00 * b0 + c01 * b1 + c02 * b2) / det, (c01 * b0 + c11 * b1 + c12 * b2) / det, (c02 * b0 + c12 * b1 + c22 * b2) / det);
            let th = _ax.length();
            if (th < 1e-5) break;
            _ax.multiplyScalar(1 / th);
            th = th > cap ? cap : th;
            // world axis into the parent's frame: the local turn is the parent-conjugated one
            bone.parent.getWorldQuaternion(_qp).invert();
            _ax.applyQuaternion(_qp);
            _q.setFromAxisAngle(_ax, th);
            bone.quaternion.premultiply(_q);
            bone.updateMatrixWorld(true);
            this._cwMats(S);
            pushes++; touched = true;
          }
        }
        if (!any) break;
      }
      // the last resort (panels only, rare): a span still inside the body after the sweeps GATHERS toward its joint,
      // the cloth bunched up the way a panel caught between a thigh and the belly bunches: the link scaled by s
      // (0.6 <= s < 1) about its joint, its child given 1/s back so only this span shortens (by 1 - s of its length),
      // the whole panel never by more than 15 % (`shortMax`).
      // `_panelFollow` puts every panel bone's scale back to 1 at the start of the next step.
      if (touched && !S.tail) {
        let Ltot = 0, short = 0;
        for (let j = 0; j < N; j++) Ltot += ch.seg[j];
        for (let j = 0; j < N; j++) {
          const k0 = S.gStart[j], k1 = S.gStart[j + 1];
          if (k1 <= k0) continue;
          if (this._cwSpanDeep(S, j, caps) <= 0) continue;
          const bone = ch.links[j].bone, kid = j + 1 < N ? ch.links[j + 1].bone : null;
          // (never more than 15 % off the whole panel's length: M1.2e's allowance)
          const floor = Math.max(GATHER_MIN, 1 - (0.15 - short) * Ltot / ch.seg[j]);
          if (floor >= 0.999) continue;
          let lo = floor, hi = 1, ok = -1;
          for (let b = 0; b < 5; b++) {
            const sc = b === 0 ? lo : (lo + hi) / 2;
            bone.scale.setScalar(sc); if (kid) kid.scale.setScalar(1 / sc);
            bone.updateMatrixWorld(true); this._cwMats(S);
            if (this._cwSpanDeep(S, j, caps) <= 0) { ok = sc; lo = sc; } else if (b === 0) break; else hi = sc;
          }
          const sc = ok > 0 ? ok : floor;
          bone.scale.setScalar(sc); if (kid) kid.scale.setScalar(1 / sc);
          bone.updateMatrixWorld(true); this._cwMats(S);
          short += (1 - sc) * ch.seg[j] / Ltot;
          gathers++; if (sc < gatherMin) gatherMin = sc;
          if (short > shortMax) shortMax = short;
        }
      }
      // what is still inside after both sweeps (the published guard; the gate rows grade the real thing)
      if (touched) {
        this._cwMats(S);
        for (let j = 0; j < N; j++) {
          if (!this._cwNear(S, j, caps, 1e-6)) continue;
          for (let k = S.gStart[j]; k < S.gStart[j + 1]; k++) {
            this._cwSkin(S, k, _x);
            for (let m = 0; m < _nn; m++) {
              const q = _near[m], dd = this._cwDepth(_x, caps[q], caps[q].r0);
              if (dd > 0) { left++; if (dd > deepLeft) deepLeft = dd; break; }
            }
          }
        }
        // the chain's particles where its bones now are: the next step integrates from the cloth that was drawn
        const c = ch, P = c.pos;
        for (let j = 1; j < N; j++) { _x.setFromMatrixPosition(c.links[j].bone.matrixWorld); P[j * 3] = _x.x; P[j * 3 + 1] = _x.y; P[j * 3 + 2] = _x.z; }
        _x.copy(c.tipOff).applyMatrix4(c.links[N - 1].bone.matrixWorld);
        P[N * 3] = _x.x; P[N * 3 + 1] = _x.y; P[N * 3 + 2] = _x.z;
      }
    }
    const st = W.stats;
    st.rootPush = +rootPush.toFixed(4); if (!(st.rootPushMax >= rootPush)) st.rootPushMax = +rootPush.toFixed(4);
    if (left) st.leftFrames = (st.leftFrames | 0) + 1;
    st.frames++; st.pushes = pushes; st.left = left; st.deepLeft = deepLeft; st.gathers = gathers; st.gatherMin = gatherMin; st.shortMax = shortMax; if (!(st.shortMaxEver >= shortMax)) st.shortMaxEver = shortMax;
    if (gathers) { st.gatherFrames = (st.gatherFrames | 0) + 1; if (!(st.gatherMinEver <= gatherMin)) st.gatherMinEver = gatherMin; }
  }

  /** The wrap pass's last frame (gates and benches): sets, capsules and their radii, pushes, vertices left inside. */
  clothWrapInfo() {
    const W = this._cw;
    if (!W) return null;
    return {
      ok: W.ok, sets: W.sets.map((s) => ({ stem: s.stem, verts: s.n, links: s.chain.N })),
      caps: W.caps.map((c) => ({ name: c.name, r0: +c.r0.toFixed(4), panel: +c.rP.toFixed(4), tail: +c.rT.toFixed(4) })),
      ...W.stats,
    };
  }
}
