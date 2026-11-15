/**
 * SECONDARY MOTION: the hair and cloth spring chains (PBD, wind, body capsules), the twist bones and
 * their debug reads.
 *
 * M1.3a: these members of `PlayerAnimator` were moved here from `src/entities/playerAnimator.js` verbatim
 * (byte for byte, with the comments above each) and are installed onto `PlayerAnimator.prototype` by that
 * file (`installMethods`); `this` is the animator, as before. This class is a carrier and is never constructed.
 */
import * as THREE from 'three';
import {
  DRIVE_A_MAX, DRIVE_V_MAX, DYN_CLASSES, DYN_FALLBACK, DYN_WIND, KEY, MAX_SUB, PBD_V_MAX, Q_IDENT, RESEAT_D2,
  SUB_DT, _cp0, _cp1, _cp2, _shL, _shN, _shP, _shQ, _shQ2, _shX, _hcB, _hcC, _hcD1, _hcD2, _hcD3, _hcP, _hcP2, _hcQ, _hcQ2, _hcU, _spA, _spAcc,
  _spB, _spC, _spD, _spE, _spMq, _spNum, _spQ, _spQ2, _spQ3, _twA, _twQ, clamp,
} from './playerCommon.js';

/** M1.2e round 2: the largest share of a thigh's swing a front panel's root takes (rad; `_panelFollow`). */
const PF_MAX = 70 * Math.PI / 180;
/** M1.2e round 2: the most a panel link's rest turns toward hanging from the link above it (rad; `_panelDrape`). */
const PANEL_DRAPE = 0.45;
const _pdQ = new THREE.Quaternion(), _pdI = new THREE.Quaternion();

export class SecondaryMotion {
  /**
   * The chain a gate stages by class (`chainOf('hair')` = the knot tail on
   * Brea, the profile's `hairChain`): the chain's bones, root first, or null.
   */
  chainOf(cls) {
    if (cls === 'hair' && this._hairChainRoot) {
      const c = this._chains.find((x) => x.links[0].name === this._hairChainRoot);
      if (c) return c.links.map((l) => l.bone);
    }
    let best = null;
    for (const c of this._chains) if (c.cls.name === cls && (!best || c.links.length > best.links.length)) best = c;
    return best ? best.links.map((l) => l.bone) : null;
  }

  /* ----------------------- dyn_ chain spring-dampers ---------------------- */

  /**
   * Discover every dyn_ chain by walking the skeleton: a chain starts at a
   * dyn_ bone whose parent is not one, and runs down its descendants. A branch
   * starts a NEW chain at the fork, so no bone is ever driven twice in a frame.
   * (The Round-4 hand-written list covered 8 of the rig's ~40 chains; the
   * quiver, pouches, necklace, leg dangles and front locks were never simulated
   * at all and measured 0.00 deg of motion at full sprint.)
   */
  _buildChains(makeEntry) {
    const isDyn = (o) => !!o && o.isBone && o.name.startsWith('dyn_');
    const usable = (o) => isDyn(o) && !o.name.includes('_end');
    const emit = (path) => {
      const links = path.map((b) => makeEntry(b.name)).filter(Boolean);
      if (links.length < 1) return;
      const root = path[0].name;
      // R5 fix round 1: a rig profile may class its chains by name
      // (`chainClasses: { gear: '^dyn_alidadeCord' }`) ahead of the Round-4
      // regexes — Brea's alidade cord is GEAR (A19's gear probe), not cloth
      const pcc = this.model?.userData?.rigProfile?.chainClasses;
      let cls0 = null;
      if (pcc) for (const k in pcc) if (new RegExp(pcc[k]).test(root)) { cls0 = DYN_CLASSES.find((c) => c.name === k) || null; break; }
      if (!cls0) cls0 = DYN_CLASSES.find((c) => c.re.test(root)) || DYN_FALLBACK;
      // R5: a body may retune a class (profile `tune.dynClass[name]`), merged
      // over the Round-4 row once at build time
      const ov = this.model?.userData?.rigProfile?.tune?.dynClass?.[cls0.name];
      const cls = ov ? { ...cls0, ...ov } : cls0;
      // deterministic per-chain phase so neighbouring strands never move in
      // lockstep (a hash of the name, not Math.random: shots must repeat)
      let h = 0;
      for (let i = 0; i < root.length; i++) h = (h * 31 + root.charCodeAt(i)) & 0x7fffffff;
      // right-side chains get the opposite lateral kick from a foot plant
      const side = /_r_|_r$|_r[0-9]/.test(root) ? -1 : 1;
      this._chains.push({
        cls, links, side, seed: (h % 1000) / 1000 * Math.PI * 2, flX: 0,
        // published summary scalars (gate A33-rig-finite reads these): the
        // tip's world-plane offset from its animated rest and its velocity.
        ax: 0, az: 0, vx: 0, vz: 0,
      });
    };
    const walk = (bone, path) => {
      const next = path.concat(bone);
      const kids = bone.children.filter(usable);
      if (!kids.length) { emit(next); return; }
      walk(kids[0], next);                      // the chain continues
      for (let i = 1; i < kids.length; i++) walk(kids[i], []); // forks branch off
    };
    for (const name in this.bones) {
      const b = this.bones[name];
      if (!usable(b) || isDyn(b.parent)) continue;
      walk(b, []);
    }
  }

  /**
   * Allocate the Verlet solver state for every discovered chain, ONCE.
   *
   * A chain of N driven bones is N+1 particles: the head of each link plus a
   * tip taken from the `_end` bone the rig terminates every chain with. The
   * segment lengths are measured off the bind pose in WORLD units, and the
   * solver is inextensible (the rebuild pass below re-imposes them every
   * frame), so a strand can never stretch however hard the body throws it.
   *
   * Nothing here allocates per frame: every array is sized at boot.
   */
  _initChainSolver() {
    this.model.updateMatrixWorld(true);
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    for (const c of this._chains) {
      const N = c.links.length;
      const last = c.links[N - 1].bone;
      // the tip: the rig ends every dyn_ chain in an `_end` bone, which is
      // exactly the geometry we need and is never itself driven
      const tipBone = last.children.find((o) => o.isBone) || null;
      c.tipOff = new THREE.Vector3();
      if (tipBone) {
        c.tipOff.copy(tipBone.position);
      } else {
        // no terminator: continue along the last bone's own offset direction
        c.tipOff.copy(last.position).applyQuaternion(_spQ.copy(last.quaternion).invert());
        if (c.tipOff.lengthSq() < 1e-10) c.tipOff.set(0, 0.05, 0);
      }
      const n = N + 1;
      c.n = n; c.N = N;
      c.pos = new Float32Array(n * 3);
      c.vel = new Float32Array(n * 3);
      c.anim = new Float32Array(n * 3);
      c.animPrev = new Float32Array(n * 3);
      c.animVel = new Float32Array(n * 3);
      c.seg = new Float32Array(N);
      c.wq = new Float32Array(N * 4);   // animated world quats, root -> tip
      c.acc = new Float32Array(n * 3);  // rest-point acceleration (world)
      c.seeded = false;
      for (let j = 0; j < N; j++) {
        A.setFromMatrixPosition(c.links[j].bone.matrixWorld);
        if (j + 1 < N) B.setFromMatrixPosition(c.links[j + 1].bone.matrixWorld);
        else B.copy(c.tipOff).applyMatrix4(last.matrixWorld);
        c.seg[j] = Math.max(1e-3, A.distanceTo(B));
      }
      // M1.2e fix 1: a sash panel is a SHEET, not a strand. Its links carry the sheet's normal (out of the body: her
      // forward for the front panels, her back for the back one) and its lateral axis in each bone's own frame, from
      // the bind pose, where every panel hangs flat in her frontal plane; and the sheet's half-width (outfit-pan-1:
      // front-left 0.09-0.10 m either side of its chain, front-right 0.06-0.08, back 0.12-0.14). `_sheetPush` reads them.
      if (c.cls.name === 'panel') {
        const nm = c.links[0].name, back = /panelB/.test(nm);
        c.shW = /panelL/.test(nm) ? 0.10 : /panelR/.test(nm) ? 0.08 : 0.135;
        c.shN = new Float32Array(N * 3); c.shL = new Float32Array(N * 3);
        const mq = this.model.getWorldQuaternion(new THREE.Quaternion());
        const bq = new THREE.Quaternion(), v = new THREE.Vector3();
        for (let j = 0; j < N; j++) {
          c.links[j].bone.getWorldQuaternion(bq).invert();
          v.set(0, 0, back ? -1 : 1).applyQuaternion(mq).applyQuaternion(bq);
          c.shN[j * 3] = v.x; c.shN[j * 3 + 1] = v.y; c.shN[j * 3 + 2] = v.z;
          v.set(1, 0, 0).applyQuaternion(mq).applyQuaternion(bq);
          c.shL[j * 3] = v.x; c.shL[j * 3 + 1] = v.y; c.shL[j * 3 + 2] = v.z;
        }
      }
    }
  }

  /**
   * M1.2e fix 1 — THE PANEL AS A SHEET AGAINST THE LEGS. The panel's chain is its centre line; its cloth spans
   * `shW` either side of it. Pushing the centre line's particles radially out of a thigh (the strand rule) slid the
   * chain round to the INSIDE of a striding thigh, 0.106 m off its axis, and left the sheet's outer half through
   * the leg: measured, a vertex of the left panel 0.0615 m deep in the left thigh at a jog (run, bench, 150 of 180
   * frames). A flat sheet clears a cylinder only by standing off it along the sheet's own normal: the child particle
   * (and the segment's middle, at twice the lever) is moved along the link's normal until the sheet's cross-section
   * through it is outside every body capsule (the legs at their radius, the torso at 0.10 m), then put back on its
   * parent's sphere; three passes.
   * `_spC` is the child, `_spB` the link's reference direction, `_spAcc` the chain's accumulated swing. No allocation.
   */
  _sheetPush(c, j, pos, i0, caps) {
    const k = j * 3, sg = c.seg[j], W = c.shW;
    _shQ._x = c.wq[j * 4]; _shQ._y = c.wq[j * 4 + 1]; _shQ._z = c.wq[j * 4 + 2]; _shQ._w = c.wq[j * 4 + 3];
    _shQ.premultiply(_spAcc);
    for (let it = 0; it < 3; it++) {
      _shX.set(_spC.x - pos[i0], _spC.y - pos[i0 + 1], _spC.z - pos[i0 + 2]);
      const len = _shX.length();
      if (len < 1e-6) return;
      _shX.multiplyScalar(1 / len);
      _shQ2.setFromUnitVectors(_spB, _shX).multiply(_shQ);
      _shN.set(c.shN[k], c.shN[k + 1], c.shN[k + 2]).applyQuaternion(_shQ2);
      _shL.set(c.shL[k], c.shL[k + 1], c.shL[k + 2]).applyQuaternion(_shQ2);
      let push = 0;
      for (let q = 0; q < 5; q++) {
        const cap = caps[q];
        // (the torso at 0.10 m, its belly and seat: the strand rule's 0.155 m with the rest rule stays for it above)
        let r = q === 0 ? 0.10 : cap.r;
        _cp0.subVectors(cap.b, cap.a);
        const l2 = _cp0.lengthSq();
        // a parent already inside this leg's cross-section (a deep crouch brings the thigh up under the belt, where the
        // root is fixed): the child may not sink deeper than its parent, and is not thrown out past it (that folded the
        // long panel up over her belly)
        {
          _cp1.set(pos[i0] - cap.a.x, pos[i0 + 1] - cap.a.y, pos[i0 + 2] - cap.a.z);
          let t = l2 > 1e-9 ? _cp1.dot(_cp0) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          _cp1.x -= _cp0.x * t; _cp1.y -= _cp0.y * t; _cp1.z -= _cp0.z * t;
          const sp = _cp1.dot(_shN), lp = _cp1.dot(_shL);
          if (sp < r && sp > -r && Math.abs(lp) < W + Math.sqrt(r * r - sp * sp)) r = sp > 0 ? sp : 0;
        }
        if (r <= 0) continue;
        for (let m = 0; m < 2; m++) {
          const f = m === 0 ? 1 : 0.5;
          _shP.x = pos[i0] + (_spC.x - pos[i0]) * f; _shP.y = pos[i0 + 1] + (_spC.y - pos[i0 + 1]) * f; _shP.z = pos[i0 + 2] + (_spC.z - pos[i0 + 2]) * f;
          _cp1.subVectors(_shP, cap.a);
          let t = l2 > 1e-9 ? _cp1.dot(_cp0) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          _cp1.x -= _cp0.x * t; _cp1.y -= _cp0.y * t; _cp1.z -= _cp0.z * t;   // axis -> sample
          const s = _cp1.dot(_shN);
          if (s >= r || s <= -r) continue;
          const l = _cp1.dot(_shL), half = Math.sqrt(r * r - s * s);
          if (l >= W + half || l <= -W - half) continue;
          const need = (r - s) / f;
          if (need > push) push = need;
        }
      }
      if (push <= 0) break;
      _spC.addScaledVector(_shN, Math.min(push, 0.5 * sg) + 1e-4);
      _shX.set(_spC.x - pos[i0], _spC.y - pos[i0 + 1], _spC.z - pos[i0 + 2]);
      const l3 = _shX.length();
      if (l3 < 1e-6) return;
      _spC.x = pos[i0] + _shX.x * sg / l3; _spC.y = pos[i0 + 1] + _shX.y * sg / l3; _spC.z = pos[i0 + 2] + _shX.z * sg / l3;
    }
    // the class's bend limit again (the push may not fold the sheet over its parent: a back panel's hem lifted up its
    // own back against a calf behind her, standing, before this)
    _shX.set(_spC.x - pos[i0], _spC.y - pos[i0 + 1], _spC.z - pos[i0 + 2]).normalize();
    const lim = c.cls.maxAng * 1.6, dot = _shX.dot(_spB);
    if (dot < Math.cos(lim)) {
      _shQ2.setFromUnitVectors(_spB, _shX);
      const full = 2 * Math.acos(Math.min(1, Math.abs(_shQ2.w)));
      if (_shQ2.w < 0) { _shQ2.x = -_shQ2.x; _shQ2.y = -_shQ2.y; _shQ2.z = -_shQ2.z; _shQ2.w = -_shQ2.w; }
      _shQ2.slerp(Q_IDENT, full > 1e-6 ? 1 - lim / full : 1);
      _shX.copy(_spB).applyQuaternion(_shQ2).normalize();
      _spC.x = pos[i0] + _shX.x * sg; _spC.y = pos[i0 + 1] + _shX.y * sg; _spC.z = pos[i0 + 2] + _shX.z * sg;
    }
  }

  /**
   * Swing-twist redistribution targets (player-anim-06).
   *
   * The rig carries 26 `*_twist_*` joints and Round 3 drove none of them, so
   * every wrist roll and shoulder roll candy-wrapped the skin at one joint.
   * A twist bone is a child of a limb bone; it must carry a FRACTION of a
   * roll about the limb's own long axis:
   *
   *   distal set  (lowerarm_twist, calf_twist) follow the NEXT joint's roll
   *               (the hand / the foot), weighted by how far down the limb
   *               they sit: at the wrist, all of it; at the elbow, none.
   *   proximal set (upperarm_twist, thigh_twist) COUNTER their own bone's
   *               roll by (1 - t): they inherit the full parent rotation, and
   *               undoing it near the shoulder is what keeps the deltoid from
   *               winding up.
   *
   * Axes are captured at bind, in each bone's OWN local frame, so the rotation
   * follows the limb wherever the clip puts it (a char-space axis would only
   * be right at bind).
   */
  _buildTwists(makeEntry, invModelM, invModelQ) {
    const P = (bone) => new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(invModelM);
    const WQ = (bone) => bone.getWorldQuaternion(new THREE.Quaternion());
    const SPECS = [
      // [twist prefix, limb bone (source of the frame), distal joint, mode]
      ['lowerarm_twist_01_l_', this.KEY.loArmL, this.KEY.handL, 'distal'],
      ['lowerarm_twist_02_l_', this.KEY.loArmL, this.KEY.handL, 'distal'],
      ['lowerarm_twist_01_r_', this.KEY.loArmR, this.KEY.handR, 'distal'],
      ['lowerarm_twist_02_r_', this.KEY.loArmR, this.KEY.handR, 'distal'],
      ['upperarm_twist_01_l_', this.KEY.upArmL, this.KEY.loArmL, 'proximal'],
      ['upperarm_twist_02_l_', this.KEY.upArmL, this.KEY.loArmL, 'proximal'],
      ['upperarm_twist_01_r_', this.KEY.upArmR, this.KEY.loArmR, 'proximal'],
      ['upperarm_twist_02_r_', this.KEY.upArmR, this.KEY.loArmR, 'proximal'],
      ['calf_twist_01_l_', this.KEY.calfL, this.KEY.footL, 'distal'],
      ['calf_twist_02_l_', this.KEY.calfL, this.KEY.footL, 'distal'],
      ['calf_twist_01_r_', this.KEY.calfR, this.KEY.footR, 'distal'],
      ['calf_twist_02_r_', this.KEY.calfR, this.KEY.footR, 'distal'],
      ['thigh_twist_01_l_', this.KEY.thighL, this.KEY.calfL, 'proximal'],
      ['thigh_twist_01_r_', this.KEY.thighR, this.KEY.calfR, 'proximal'],
    ];
    for (const [prefix, limbName, jointName, mode] of SPECS) {
      const name = this._findName(prefix);
      const tw = makeEntry(name);
      const limb = this._entries[limbName] || makeEntry(limbName);
      const joint = this._entries[jointName] || makeEntry(jointName);
      if (!tw || !limb || !joint) continue;
      // limb axis in CHAR space at bind, then into each bone's own frame
      const a = P(limb.bone), b = P(joint.bone);
      const len = a.distanceTo(b);
      if (len < 1e-4) continue;
      const dir = b.sub(a).divideScalar(len);           // char space, unit
      const t = clamp(P(tw.bone).distanceTo(a) / len, 0, 1);
      const src = mode === 'distal' ? joint : limb;
      const srcAxis = dir.clone().applyQuaternion(WQ(src.bone).premultiply(invModelQ).invert());
      const twAxis = dir.clone().applyQuaternion(WQ(tw.bone).premultiply(invModelQ).invert());
      this._twists.push({
        name: tw.name, e: tw, src,
        srcAxis: srcAxis.normalize(), axis: twAxis.normalize(),
        gain: mode === 'distal' ? t : -(1 - t),
        mode, t: +t.toFixed(3), angle: 0,
      });
    }
  }

  /**
   * Extract the twist (roll about `srcAxis`) of a source bone's live local
   * rotation relative to its bind, and apply `gain` of it to the twist joint
   * about its own axis. Swing-twist decomposition: project the quaternion's
   * vector part onto the axis and renormalise — the classic Dobrowolski split.
   */
  _twistLayer() {
    const T = this._twists;
    for (let i = 0; i < T.length; i++) {
      const w = T[i];
      // delta from bind, in the source bone's own local frame
      _twQ.copy(w.src.bindQ).invert().multiply(w.src.bone.quaternion);
      const ax = w.srcAxis;
      const d = _twQ.x * ax.x + _twQ.y * ax.y + _twQ.z * ax.z;
      _twA.set(ax.x * d, ax.y * d, ax.z * d);
      const l = Math.hypot(_twA.x, _twA.y, _twA.z, _twQ.w);
      if (l < 1e-6) { w.angle = 0; continue; }
      // twist quaternion (w, axis*d) normalised -> signed angle about the axis
      let ang = 2 * Math.atan2(d / l, _twQ.w / l);
      if (ang > Math.PI) ang -= Math.PI * 2; else if (ang < -Math.PI) ang += Math.PI * 2;
      ang = clamp(ang * w.gain, -1.4, 1.4);
      w.angle = ang;
      if (Math.abs(ang) < 1e-4) continue;
      _twQ.setFromAxisAngle(w.axis, ang);
      w.e.bone.quaternion.multiply(_twQ);
    }
  }

  /** Twist-joint diagnostics (gate A34b-twist-joints). */
  debugTwists() {
    return this._twists.map((w) => ({
      name: w.name, mode: w.mode, t: w.t,
      gain: +w.gain.toFixed(3), deg: +(w.angle * 180 / Math.PI).toFixed(2),
    }));
  }

  /** Chain-solver diagnostics (gates A33-hair-bounce / A34-chains-driven). */
  debugChains() {
    let links = 0, particles = 0, bad = 0;
    for (const c of this._chains) {
      links += c.N; particles += c.n;
      for (let i = 0; i < c.n * 3; i++) if (!Number.isFinite(c.pos[i])) { bad++; break; }
    }
    return {
      chains: this._chains.length, links, particles, nonFinite: bad,
      classes: DYN_CLASSES.map((k) => ({
        name: k.name, chains: this._chains.filter((c) => c.cls === k).length,
      })),
    };
  }

  /**
   * Refresh the body collision capsules the chains bounce off. Three segments
   * — torso (pelvis -> head), and one per thigh — cover everything the hair,
   * the skirt and the pouches can actually reach. Live bone positions, so a
   * crouch or a roll moves them.
   */
  _bodyCapsules() {
    const b = this.b, C = this._caps || (this._caps = [
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.155 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.105 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.105 },
      // M1.2e: the shins (knee -> ankle), for the long sash panels that hang below the knee: the booted, wrapped
      // shin is 0.05-0.06 m round its axis
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.068 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.068 },
    ]);
    if (b.pelvis) C[0].a.setFromMatrixPosition(b.pelvis.bone.matrixWorld);
    if (b.head) C[0].b.setFromMatrixPosition(b.head.bone.matrixWorld);
    if (b.thighL) C[1].a.setFromMatrixPosition(b.thighL.bone.matrixWorld);
    if (b.calfL) C[1].b.setFromMatrixPosition(b.calfL.bone.matrixWorld);
    if (b.thighR) C[2].a.setFromMatrixPosition(b.thighR.bone.matrixWorld);
    if (b.calfR) C[2].b.setFromMatrixPosition(b.calfR.bone.matrixWorld);
    C[3].a.copy(C[1].b); C[4].a.copy(C[2].b);
    if (b.footL) C[3].b.setFromMatrixPosition(b.footL.bone.matrixWorld); else C[3].b.copy(C[3].a);
    if (b.footR) C[4].b.setFromMatrixPosition(b.footR.bone.matrixWorld); else C[4].b.copy(C[4].a);
    return C;
  }

  /**
   * Push a world point out of capsule `cap`, but never further out than the
   * point's own ANIMATED REST already sits.
   *
   * The rest pose is the artist's: the ponytail lies ON her back, the skirt
   * panels hang against her thighs, the pouches sit on the belt — every one of
   * those rest points is inside a capsule that covers the body. Projecting
   * them to the surface unconditionally (what the first drop did) welds the
   * whole chain to a moving cylinder: measured, it held the ponytail 0.39 m
   * off the spine axis with its segments pinned at the bend clamp, which is
   * the "rigid rod" the audit filmed. Using `min(capsule radius, rest radius)`
   * as the effective radius means the constraint can only stop a strand
   * SINKING FURTHER INTO the body than the artist drew it, which is the only
   * thing it was ever there to do.
   *
   * `rest` is the point's animated rest position (may be null to fall back to
   * the plain capsule).
   */
  /** Distance from point p to segment ab (scratch-free: uses _cp0/_cp1). */
  _segDist(p, a, b) {
    _cp0.subVectors(b, a);
    const l2 = _cp0.lengthSq();
    _cp1.subVectors(p, a);
    let t = l2 > 1e-9 ? _cp1.dot(_cp0) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return _cp1.addScaledVector(_cp0, -t).length();
  }

  /** W0b targeted fix 2: a point's distance to the nearer of the M10 capsule's `n` axis segments (clobbers _cp0 / _cp1). */
  /** `_segDist` / `_hcMinAxis` with the result in `_spNum[0]`: `_springs` must not
   *  box a double per link (R48 c: the function's bar is 4 KB/s). */
  _segDistN(p, a, b) {
    _cp0.subVectors(b, a);
    const l2 = _cp0.x * _cp0.x + _cp0.y * _cp0.y + _cp0.z * _cp0.z;
    _cp1.subVectors(p, a);
    let t = l2 > 1e-9 ? (_cp1.x * _cp0.x + _cp1.y * _cp0.y + _cp1.z * _cp0.z) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    _cp1.x -= _cp0.x * t; _cp1.y -= _cp0.y * t; _cp1.z -= _cp0.z * t;
    _spNum[0] = Math.sqrt(_cp1.x * _cp1.x + _cp1.y * _cp1.y + _cp1.z * _cp1.z);
  }

  _hcMinAxisN(p, H, n) {
    let d = Infinity;
    for (let q = 0; q < n; q++) {
      this._segDistN(p, H.caps[q].a, H.caps[q].b);
      const e = _spNum[0];
      if (e < d) d = e;
    }
    _spNum[0] = d;
  }

  _hcMinAxis(p, H, n) {
    let d = Infinity;
    for (let q = 0; q < n; q++) { const e = this._segDist(p, H.caps[q].a, H.caps[q].b); if (e < d) d = e; }
    return d;
  }

  /**
   * W0b targeted fix 4: the least distance of segment [p0, p1] to the M10
   * capsule's `n` axis segments (closest points between two segments, closed
   * form). Leaves the nearest points in `_hcP` (on [p0, p1]) / `_hcQ` (on the axis)
   * and the parameter along [p0, p1] in `this._hcS`. No allocation.
   */
  _hcSegMin(p0, p1, H, n) {
    let best = Infinity;
    _hcD1.subVectors(p1, p0);
    const a = _hcD1.lengthSq();
    for (let q = 0; q < n; q++) {
      const A = H.caps[q].a, B = H.caps[q].b;
      _hcD2.subVectors(B, A);
      _hcD3.subVectors(p0, A);
      const e = _hcD2.lengthSq(), f = _hcD2.dot(_hcD3);
      let s = 0, t = 0;
      if (a < 1e-10) { t = e > 1e-10 ? clamp(f / e, 0, 1) : 0; }
      else {
        const c0 = _hcD1.dot(_hcD3);
        if (e < 1e-10) s = clamp(-c0 / a, 0, 1);
        else {
          const b0 = _hcD1.dot(_hcD2), den = a * e - b0 * b0;
          s = den > 1e-10 ? clamp((b0 * f - c0 * e) / den, 0, 1) : 0;
          t = (b0 * s + f) / e;
          if (t < 0) { t = 0; s = clamp(-c0 / a, 0, 1); }
          else if (t > 1) { t = 1; s = clamp((b0 - c0) / a, 0, 1); }
        }
      }
      _hcP2.copy(p0).addScaledVector(_hcD1, s);
      _hcQ2.copy(A).addScaledVector(_hcD2, t);
      const d = _hcP2.distanceTo(_hcQ2);
      if (d < best) { best = d; _hcP.copy(_hcP2); _hcQ.copy(_hcQ2); this._hcS = s; }
    }
    return best;
  }

  _pushOutOfCapsule(p, cap, rest) {
    // PRIVATE scratch only. The caller passes `_spC` as `p`, and the first
    // drop of this method wrote its working vectors into `_spC` — so `p` and
    // the "closest point on the axis" were THE SAME OBJECT, `d` came out 0 on
    // every single call, and every colliding particle was teleported to
    // `axis + (0,0,1) * r`. That is a world-space pin, which is why the chains
    // read as welded to the body no matter what the spring did.
    _cp0.subVectors(cap.b, cap.a);
    const l2 = _cp0.lengthSq();
    let r = cap.r;
    if (rest) {
      _cp1.subVectors(rest, cap.a);
      let tr = l2 > 1e-9 ? _cp1.dot(_cp0) / l2 : 0;
      tr = tr < 0 ? 0 : tr > 1 ? 1 : tr;
      const dr = _cp1.addScaledVector(_cp0, -tr).length() - 0.004; // 4 mm slack
      if (dr < r) r = dr > 0 ? dr : 0;
    }
    if (r <= 0) return false;
    _cp1.subVectors(p, cap.a);
    let t = l2 > 1e-9 ? _cp1.dot(_cp0) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    _cp2.copy(cap.a).addScaledVector(_cp0, t);   // closest point on the axis
    _cp1.subVectors(p, _cp2);
    const d = _cp1.length();
    if (d >= r) return false;
    if (d < 1e-5) _cp1.set(0, 0, 1); else _cp1.divideScalar(d);
    p.copy(_cp2).addScaledVector(_cp1, r);
    return true;
  }

  /**
   * M1.2e — THE SASH PANELS FOLLOW THE LEGS (`panel` chains: brea.mjs CHAINS.panelL / panelR / panelB). A panel's rest
   * is hung from the pelvis, but the armory's panels were skinned three quarters to the thigh under them (0.75 left,
   * 0.70 right, 0.42 back, split by side), and that is what kept a crouched or striding thigh out of them: a rest that
   * only rides the pelvis hangs straight down THROUGH a crouched thigh (measured: the right panel's second joint
   * 0.015 m off the thigh's axis), and no collision pass can lift a whole panel out of a leg that has come up under it.
   * So each panel's first link takes that same share of its thigh's swing about the pelvis (the back panel the mean of
   * both thighs'), before the solver reads the rest: the authored hang. The chain then adds the air, the inertia and
   * the legs' push on top. Bind values, no allocation.
   */
  _panelFollow() {
    const P = this._panelRoots || (this._panelRoots = this._chains.filter((c) => c.cls.name === 'panel').map((c) => {
      const n = c.links[0].name;
      return { c, e: c.links[0], side: /panelL/.test(n) ? 'l' : /panelR/.test(n) ? 'r' : 'c', share: /panelL/.test(n) ? 0.75 : /panelR/.test(n) ? 0.70 : 0.42 };
    }));
    if (!P.length) return;
    // (M1.2e round 2: the wrap pass's gather of last frame undone: every panel bone back at scale 1)
    for (let i = 0; i < P.length; i++) { const L = P[i].c.links; for (let j = 0; j < L.length; j++) L[j].bone.scale.set(1, 1, 1); if (L[0]._cwP0) L[0].bone.position.copy(L[0]._cwP0); }
    const tl = this.b.thighL, tr = this.b.thighR, pel = this.b.pelvis;
    if (!tl || !tr || !pel || !this.b.calfL || !this.b.calfR) return;
    /* M1.2e fix 1: the thighs' SWING only (bind direction -> current direction in the pelvis's frame, no twist). The
     * whole turn handed the panels each thigh's twist and spread too: the short right panel lay sideways across her
     * lap in the sit (its hem 0.32 m to her left), the long left one folded up over her belly in the crouch (its hem
     * at 1.01 m, the belt at 0.51). And the share now grows with the thigh's FLEXION (0.75 / 0.70 standing, 1.0 from
     * 60 deg): a raised thigh carries the panel on it instead of rising through it; the back panel takes the swing of
     * the thigh that is further BEHIND her (0.85 of it; a forward thigh draws it 0.3), not the mean of both, which
     * swung it forward into the thigh that was back. */
    const F = this._pfFwd || (this._pfFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(pel.invW).normalize());
    const fl = this._pfSwing(tl, this.b.calfL, F, _spQ2), fr = this._pfSwing(tr, this.b.calfR, F, _spQ3);
    // (the share's ramp: smoothstep over 20-60 deg of flexion)
    let kl = (fl - 0.35) / 0.70, kr = (fr - 0.35) / 0.70;
    kl = kl <= 0 ? 0 : kl >= 1 ? 1 : kl * kl * (3 - 2 * kl); kr = kr <= 0 ? 0 : kr >= 1 ? 1 : kr * kr * (3 - 2 * kr);
    for (let i = 0; i < P.length; i++) {
      const r = P[i];
      let share;
      if (r.side === 'l') { _spQ.copy(_spQ2); share = r.share + (1 - r.share) * kl; }
      else if (r.side === 'r') { _spQ.copy(_spQ3); share = r.share + (1 - r.share) * kr; }
      else {
        // 0.3 of the mean swing, turning to 0.85 of the further-back thigh's as it goes 0-12 deg behind the bind
        const back = fl < fr ? fl : fr;
        _shQ.copy(_spQ2).slerp(_spQ3, 0.5);
        if (_shQ._w < 0) { _shQ._x = -_shQ._x; _shQ._y = -_shQ._y; _shQ._z = -_shQ._z; _shQ._w = -_shQ._w; }
        _shQ.slerp(Q_IDENT, 1.0);
        _shQ2.copy(fl < fr ? _spQ2 : _spQ3);
        if (_shQ2._w < 0) { _shQ2._x = -_shQ2._x; _shQ2._y = -_shQ2._y; _shQ2._z = -_shQ2._z; _shQ2._w = -_shQ2._w; }
        _shQ2.slerp(Q_IDENT, 0.15);
        const wb = back >= 0 ? 0 : back <= -0.08 ? 1 : -back / 0.08;
        _spQ.copy(_shQ).slerp(_shQ2, wb);
        share = 1;
      }
      if (_spQ._w < 0) { _spQ._x = -_spQ._x; _spQ._y = -_spQ._y; _spQ._z = -_spQ._z; _spQ._w = -_spQ._w; }
      if (share < 1) _spQ.slerp(Q_IDENT, 1 - share);
      /* M1.2e round 2: a front panel rides its thigh's swing up to 70 deg, no further. Past that (the ledge climb's knee
       * to the chest, the roll's tuck, the crouch's deepest) the thigh rises into her belly and a panel laid along it
       * is laid into the crease between them, which no turn of the cloth can get out of (bench: 0.06-0.08 m inside the
       * belly, the wrap pass stalled at 0.02); the cloth slides off the thigh's top and hangs over its front instead. */
      if (r.side !== 'c') {
        const full = 2 * Math.acos(Math.min(1, _spQ._w));
        if (full > PF_MAX) _spQ.slerp(Q_IDENT, 1 - PF_MAX / full);
      }
      r.e.bone.quaternion.copy(r.e.bindQ).premultiply(_spQ);
      if (r.side !== 'c') this._panelDrape(r.c);
    }
  }

  /**
   * M1.2e round 2 — THE FRONT PANELS' REST DRAPES. Below its root, each link's rest turns toward hanging (world down) by up
   * to `PANEL_DRAPE` rad from the link above it: a panel laid forward along a raised thigh (the crouch, the sit, the
   * climb) falls over the knee instead of standing out past it as a straight board, and in a roll it hangs toward
   * the ground. (Not the back panel: hung straight down in a crouch or a slide its hem goes into the ground under her;
   * it keeps riding the thigh that is further back.) Hanging already (standing, walking, running), its rest is unchanged: the turn toward down is the
   * angle the link is off down, which is about 0 there. The solver then adds the air, the inertia and the legs on
   * top of this rest. No allocation.
   */
  _panelDrape(c) {
    const N = c.N;
    if (N < 2) return;
    const root = c.links[0].bone;
    root.parent.getWorldQuaternion(_shQ);
    _shQ.multiply(root.quaternion);                     // the root link's world rotation
    for (let j = 1; j < N; j++) {
      const e = c.links[j], bone = e.bone;
      bone.quaternion.copy(e.bindQ);
      // this link's direction in its own frame (to the next joint, or the tip), then in the world
      if (j + 1 < N) _shX.copy(c.links[j + 1].bone.position); else _shX.copy(c.tipOff);
      if (_shX.lengthSq() < 1e-10) { _shQ.multiply(bone.quaternion); continue; }
      _shX.normalize();
      _shQ2.copy(_shQ).multiply(bone.quaternion);
      _shN.copy(_shX).applyQuaternion(_shQ2);
      const ang = Math.acos(Math.max(-1, Math.min(1, -_shN.y)));
      if (ang > 0.02) {
        _shL.set(_shN.z, 0, -_shN.x);                   // d x (0, -1, 0)
        if (_shL.lengthSq() > 1e-10) {
          _shL.normalize();
          const t = ang < PANEL_DRAPE ? ang : PANEL_DRAPE;
          // the world turn conjugated into the parent link's frame
          _shP.copy(_shL).applyQuaternion(_pdI.copy(_shQ).invert());
          _pdQ.setFromAxisAngle(_shP, t);
          bone.quaternion.premultiply(_pdQ);
        }
      }
      _shQ.multiply(bone.quaternion);
    }
  }

  /** M1.2e fix 1: a thigh's swing from bind in the pelvis's frame (into `out`, no twist) and its flexion (rad, + forward
   *  of the bind direction about her lateral axis; `F` her forward in the pelvis's frame). No allocation. */
  _pfSwing(t, calf, F, out) {
    _shX.copy(calf.bindP).normalize();
    _shP.copy(_shX).applyQuaternion(t.bindQ);
    _shN.copy(_shX).applyQuaternion(t.bone.quaternion);
    out.setFromUnitVectors(_shP, _shN);
    const fw = _shN.dot(F) - _shP.dot(F) * _shN.dot(_shP);
    return Math.atan2(fw, _shN.dot(_shP));
  }

  /**
   * R5 fix round 4 — set the world wind the cloth chains feel (published for
   * world-sky's weather; default the NE trade wind, bible §2.2).
   *   fromBearing  rad, the compass bearing the wind blows FROM (0 = north,
   *                PI/2 = east; world north is -Z, east +X)
   *   speed        m/s;  gust, flutter  0..1 (optional, kept when omitted)
   * No allocation: writes `this.wind` in place.
   */
  setWind(fromBearing, speed, gust, flutter) {
    const W = this.wind;
    // air moves TOWARD fromBearing + PI: direction (sin b, -cos b) for bearing b
    const to = fromBearing + Math.PI;
    W.x = Math.sin(to) * speed; W.z = -Math.cos(to) * speed;
    if (gust != null) W.gust = gust;
    if (flutter != null) W.flutter = flutter;
    return W;
  }

  /**
   * Secondary motion: an inextensible VERLET chain per dyn_ group, solved in
   * WORLD space (271 bones, 66 chains, ~205 driven links).
   *
   * Why world space and why relative damping. A chain hanging off a moving
   * character is a base-excited pendulum, and the whole readable effect — the
   * ponytail trailing on a sprint, the skirt flicking on a foot plant, the
   * quiver settling after a hard stop — is the ATTACHMENT's acceleration, not
   * the character's velocity. Round 4's spring drove each chain with a single
   * angular DOF forced by a velocity term, which is a DC input: it parks a
   * spring at a fixed lean, which is exactly how every strand read as frozen.
   * Here each particle integrates
   *
   *     a = -w^2*(p - rest) - 2*z*w*(v - vRest) - aBase + g
   *
   * in the non-inertial frame of its own animated rest point, so a constant
   * run speed produces NO lag (correct: the hair is being carried), while the
   * pelvis bob (~25 m/s^2 at a sprint's step rate), a hard stop, a turn and a
   * landing all appear as aBase and throw the chain.
   *
   * The rebuild pass is one root->tip sweep that does four things at once:
   * imposes the bind segment length, clamps the bend to the class limit
   * RELATIVE to the parent's achieved rotation (so a bent parent does not
   * force the child straight), collides against the body capsules, and emits
   * the world rotation each bone needs. Because the accumulated rotation is
   * carried down the sweep, no bone matrix is recomputed inside the loop.
   */
  /**
   * A bone's world rotation off its matrix, with no `updateWorldMatrix` walk and no
   * `decompose` (melee W1, R48 c): `_springs` opens with `model.updateMatrixWorld(true)`,
   * so a parent that is not itself a simulated strand is current here, and a strand's
   * own parent keeps three's path (it was rewritten by the chain before this one).
   */
  _springParentQ(bone, out) {
    if (bone.name.charCodeAt(0) === 100 && bone.name.startsWith('dyn_')) { bone.getWorldQuaternion(out); return; }
    const e = bone.matrixWorld.elements, m = _spMq.elements;
    const sx = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
    const sy = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
    const sz = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
    const det = e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5]);
    const ix = (det < 0 ? -1 : 1) / sx, iy = 1 / sy, iz = 1 / sz;
    m[0] = e[0] * ix; m[1] = e[1] * ix; m[2] = e[2] * ix;
    m[4] = e[4] * iy; m[5] = e[5] * iy; m[6] = e[6] * iy;
    m[8] = e[8] * iz; m[9] = e[9] * iz; m[10] = e[10] * iz;
    out.setFromRotationMatrix(_spMq);
  }

  /**
   * Every branch of the solver, once, before anyone is looking (melee W1, R48 c).
   * The solver is optimised while she stands; a branch that first runs at her first
   * sprint or step throws the optimised code away ("insufficient type feedback") and
   * the next seconds run in the baseline tier, where every double is a HeapNumber:
   * measured 0.76 KB/frame standing, 28 KB/frame in the first sprint. So the strides
   * are rehearsed at boot and the chains re-seated on their rest pose. No allocation.
   */
  _warmSprings(t, ph) {
    const SC = this._stowCap, scOn = SC ? SC.on : false;
    const sL0 = this._stL, sR0 = this._stR, pL0 = this._prevStL, pR0 = this._prevStR;
    for (let i = 0; i < 48; i++) {
      const v = (i % 4) * 2.3;
      this._stL = i % 2; this._stR = 1 - (i % 2);
      if (SC) SC.on = i % 3 === 0;
      this._springs(1 / 60, t + i / 60, ph, v, Math.min(1, v), Math.min(1, v / 5));
    }
    if (SC) SC.on = scOn;
    this._stL = sL0; this._stR = sR0; this._prevStL = pL0; this._prevStR = pR0;
    for (let i = 0; i < this._chains.length; i++) this._chains[i].seeded = false;
  }

  _springs(dt, t, ph, speed, moveW, runW) {
    // Sanitise, then integrate. Every force below multiplies into a quaternion
    // the skinned mesh reads, so ONE non-finite input does not produce a
    // glitch: a NaN bone matrix collapses every vertex it skins and Brea
    // renders as a bald mannequin with no skirt and no pouches. Gate A33.
    // The 0.05 s ceiling is a guard, not a working limit: main.js sub-steps the
    // sim, so this is handed at most FIXED_DT (1/60 s) however long the frame
    // was — measured 0.016666 s at 10.3 fps and at 0.7 fps. Neither this clamp
    // nor the MAX_SUB loop below can bind under the current loop; see the note
    // above MAX_SUB. Sanitising still matters: every force below multiplies
    // into a quaternion the skinned mesh reads.
    dt = Number.isFinite(dt) ? (dt < 1 / 480 ? 1 / 480 : dt > 0.05 ? 0.05 : dt) : 1 / 60;
    t = Number.isFinite(t) ? t : 0;
    speed = Number.isFinite(speed) ? speed : 0;
    moveW = Number.isFinite(moveW) ? moveW : 0;
    if (!Number.isFinite(this._lvz)) { this._lvz = 0; this._prevLvz = 0; }
    if (!Number.isFinite(this._lvx)) { this._lvx = 0; this._prevLvx = 0; }
    if (!Number.isFinite(this._jerkZ)) this._jerkZ = 0;
    if (!Number.isFinite(this._jerkX)) this._jerkX = 0;
    if (!Number.isFinite(this._yawRate)) this._yawRate = 0;

    // one traversal puts every bone matrix on this frame's pose; the render
    // pass re-derives only what we rotate below
    this.model.updateMatrixWorld(true);
    const caps = this._bodyCapsules();
    // M10: the draw hand + forearm capsule (two segments: forearm, hand to the
    // middle fingertip). Every dyn_ particle of every class is pushed out of it
    // at full radius, whatever its rest — the wrap tail and knot tail can never
    // lie through the hand that draws the string.
    const H = this._handCol;
    let hcN = 0;
    if (H && H.a && H.b) {
      H.caps[0].a.setFromMatrixPosition(H.a.matrixWorld);
      H.caps[0].b.setFromMatrixPosition(H.b.matrixWorld);
      H.caps[1].a.copy(H.caps[0].b);
      if (H.c) H.caps[1].b.setFromMatrixPosition(H.c.matrixWorld); else H.caps[1].b.copy(H.caps[0].b);
      hcN = 2;
      H.active = true; H.pushes = 0; H.minAxis = Infinity; H.segMin = Infinity; H.ticks++;
    }
    const SC = this._stowCap;

    // per-foot plant edges -> the flick that runs up a strand once per step.
    // Sized so the impulse alone is worth ~4-6 cm of tip travel on the
    // ponytail (dv / w, w ~ 9.4 rad/s): this is the beat gate A33-hair-bounce
    // locks to the footfall cadence, and at the first drop's 1.07 m/s it
    // slammed every segment into the bend clamp on every single step.
    const kick = 0.10 + 0.028 * speed;
    const sL = (this._stL > 0.5 && this._prevStL <= 0.5) ? kick : 0;
    const sR = (this._stR > 0.5 && this._prevStR <= 0.5) ? kick : 0;
    this._prevStL = this._stL; this._prevStR = this._stR;
    this._strikeL = sL; this._strikeR = sR;
    const strike = sL + sR;
    // her lateral axis in world, for the side of the kick
    const hh = this.ctx.player?.heading ?? 0;
    const rx = Math.cos(hh), rz = -Math.sin(hh);
    const lat = (sL - sR) * 0.45;

    const steps = dt > SUB_DT ? Math.min(MAX_SUB, Math.ceil(dt / SUB_DT)) : 1;
    const sdt = dt / steps;
    const invDt = 1 / dt;

    // fix round 4: the air this frame — the world wind swelling in slow gusts
    // (three incommensurate sines on the sim clock: deterministic, shots repeat)
    const W0 = this.wind;
    const gust = 1 + (W0.gust || 0) * (0.55 * Math.sin(0.83 * t) + 0.3 * Math.sin(1.97 * t + 1.3) + 0.15 * Math.sin(4.1 * t + 0.7));
    const windX = (Number.isFinite(W0.x) ? W0.x : 0) * gust, windZ = (Number.isFinite(W0.z) ? W0.z : 0) * gust;
    const windS = Math.sqrt(windX * windX + windZ * windZ);
    const wux = windS > 1e-6 ? windX / windS : 0, wuz = windS > 1e-6 ? windZ / windS : 0;

    for (let ci = 0; ci < this._chains.length; ci++) {
      const c = this._chains[ci];
      const N = c.N, n = c.n, cls = c.cls;
      const pos = c.pos, vel = c.vel, anim = c.anim, aPrev = c.animPrev, aVel = c.animVel;

      /* ---- 1. animated rest pose: positions (matrices) + world quats ---- */
      const rootBone = c.links[0].bone;
      if (rootBone.parent) this._springParentQ(rootBone.parent, _spQ); else _spQ.identity();
      for (let j = 0; j < N; j++) {
        const bone = c.links[j].bone;
        _spQ.multiply(bone.quaternion);              // Wanim[j] = Wanim[j-1] * L
        c.wq[j * 4] = _spQ._x; c.wq[j * 4 + 1] = _spQ._y;
        c.wq[j * 4 + 2] = _spQ._z; c.wq[j * 4 + 3] = _spQ._w;
        _spA.setFromMatrixPosition(bone.matrixWorld);
        anim[j * 3] = _spA.x; anim[j * 3 + 1] = _spA.y; anim[j * 3 + 2] = _spA.z;
      }
      _spA.copy(c.tipOff).applyMatrix4(c.links[N - 1].bone.matrixWorld);
      anim[N * 3] = _spA.x; anim[N * 3 + 1] = _spA.y; anim[N * 3 + 2] = _spA.z;

      /* ---- 2. seed / re-seat (boot, teleport, or a state that went bad) ---- */
      let reseat = !c.seeded;
      if (!reseat) {
        const dx = anim[0] - aPrev[0], dy = anim[1] - aPrev[1], dz = anim[2] - aPrev[2];
        if (dx * dx + dy * dy + dz * dz > RESEAT_D2) reseat = true;
        else if (!(Number.isFinite(pos[3]) && Number.isFinite(vel[3]))) reseat = true;
      }
      if (reseat) {
        pos.set(anim); aPrev.set(anim);
        vel.fill(0); aVel.fill(0);
        c.seeded = true;
      }

      /* ---- 3. rest-point velocity + acceleration (the non-inertial term) ---- */
      // clamped: at 3 fps under full GPU contention the numerical derivative
      // of a teleporting rest point is meaningless, and an unclamped spike
      // would throw the chain to its angular limit for a second
      for (let i = 0; i < n * 3; i++) {
        const v = (anim[i] - aPrev[i]) * invDt;
        const a = (v - aVel[i]) * invDt;
        aPrev[i] = anim[i];
        aVel[i] = v > DRIVE_V_MAX ? DRIVE_V_MAX : v < -DRIVE_V_MAX ? -DRIVE_V_MAX : v;
        c.acc[i] = a > DRIVE_A_MAX ? DRIVE_A_MAX : a < -DRIVE_A_MAX ? -DRIVE_A_MAX : a;
      }
      const aB = c.acc;

      /* ---- 4. foot-strike impulse (one frame, deeper links get more) ---- */
      if (cls.strike > 0) {     // (with no strike this adds zero: no branch that first runs at her first step)
        for (let j = 1; j < n; j++) {
          const w = (0.4 + 0.6 * (j / N)) * cls.strike;
          vel[j * 3] += rx * lat * w;
          vel[j * 3 + 1] -= strike * w;
          vel[j * 3 + 2] += rz * lat * w;
        }
      }

      /* ---- 5. integrate the free particles ---- */
      const k = cls.stiff, dmp = cls.drag, gy = -9.81 * cls.grav, bg = cls.base;
      // fix round 4: the air (see `DYN_CLASSES` 'wrap'): this chain's flutter
      // across the gusting wind, and the wrapped root's stiffness profile
      const cw = cls.wind ?? DYN_WIND[cls.name] ?? 0, rk = cls.rootK ?? 0, airY = cls.airY ? 1 : 0;
      // W0b targeted fix (`runFl`, the wrap only): running, she meets her own
      // air, and a cloth strip in a faster flow flaps harder AND faster — the
      // flutter's amplitude and its phase rate grow with her speed (x1 at a
      // walk, x(1 + runFl) at a sprint). The extra phase is accumulated per
      // chain (`flX`), so the wave never jumps; standing it adds nothing and
      // the idle's tail is the trade wind's alone
      const rfk = (speed - 1) / 5.8;
      const rf = cls.runFl > 0 ? cls.runFl * (rfk < 0 ? 0 : rfk > 1 ? 1 : rfk) : 0;
      c.flX += dt * rf;
      const tf = t + c.flX;
      const flA = cw > 0 ? (this.wind.flutter || 0) * windS * (1 + rf) : 0, sd = c.seed;
      for (let s = 0; s < steps; s++) {
        for (let j = 1; j < n; j++) {
          const i0 = j * 3;
          const dj = j / N, kj = rk > 0 ? k * (1 + rk * (1 - dj) * (1 - dj)) : k;
          const wj = cw * dj;
          // the flutter: a wave running DOWN the strand (phase lags with depth),
          // across the wind horizontally and a little vertically
          let fl = 0, fv = 0;
          if (flA > 0) {
            fl = flA * (0.65 * Math.sin(5.3 * tf + sd - 0.9 * j) + 0.35 * Math.sin(8.7 * tf + 2.1 * sd - 1.4 * j));
            fv = 0.35 * flA * Math.sin(6.1 * tf + 1.7 * sd - 0.9 * j);
          }
          for (let a = 0; a < 3; a++) {
            const i = i0 + a;
            let acc = -kj * (pos[i] - anim[i]) - dmp * (vel[i] - aVel[i]) - aB[i] * bg
              + (a === 1 ? gy : 0);
            if (wj > 0) {
              if (a === 0) acc += wj * (windX - wuz * fl - vel[i]);
              else if (a === 2) acc += wj * (windZ + wux * fl - vel[i]);
              else acc += wj * (fv - airY * vel[i]);   // airY: the air resists the strip's vertical flap too
            }
            vel[i] += acc * sdt;
            pos[i] += vel[i] * sdt;
          }
        }
      }

      /* ---- 6. rebuild root->tip: length, bend limit, collision, rotation ---- */
      pos[0] = anim[0]; pos[1] = anim[1]; pos[2] = anim[2];
      _spAcc.set(0, 0, 0, 1);
      const maxAng = cls.maxAng, cosMax = Math.cos(maxAng);
      for (let j = 0; j < N; j++) {
        const i0 = j * 3, i1 = i0 + 3;
        // animated direction of this segment, carried by the parent's rotation
        {
          const bx = anim[i1] - anim[i0], by = anim[i1 + 1] - anim[i0 + 1], bz = anim[i1 + 2] - anim[i0 + 2];
          const b2 = bx * bx + by * by + bz * bz;
          if (b2 < 1e-12) { _spB.x = 0; _spB.y = -1; _spB.z = 0; } else {
            const bi = 1 / Math.sqrt(b2);
            _spB.x = bx * bi; _spB.y = by * bi; _spB.z = bz * bi;
          }
        }
        _spB.applyQuaternion(_spAcc);                      // reference direction
        // where the free integration wants the child
        {
          const ax = pos[i1] - pos[i0], ay = pos[i1 + 1] - pos[i0 + 1], az = pos[i1 + 2] - pos[i0 + 2];
          const a2 = ax * ax + ay * ay + az * az;
          if (a2 < 1e-12) { _spA.x = _spB.x; _spA.y = _spB.y; _spA.z = _spB.z; } else {
            const ai = 1 / Math.sqrt(a2);
            _spA.x = ax * ai; _spA.y = ay * ai; _spA.z = az * ai;
          }
        }
        // bend limit, relative to the parent's achieved rotation
        const dot = _spA.x * _spB.x + _spA.y * _spB.y + _spA.z * _spB.z;
        if (dot < cosMax) {
          if (dot < -0.9999) _spA.copy(_spB);
          else {
            _spQ2.setFromUnitVectors(_spB, _spA);
            if (_spQ2.w < 0) { _spQ2.x = -_spQ2.x; _spQ2.y = -_spQ2.y; _spQ2.z = -_spQ2.z; _spQ2.w = -_spQ2.w; }
            const full = 2 * Math.acos(Math.min(1, Math.abs(_spQ2.w)));
            _spQ3.copy(_spQ2).slerp(Q_IDENT, full > 1e-6 ? 1 - maxAng / full : 1);
            _spA.copy(_spB).applyQuaternion(_spQ3).normalize();
          }
        }
        // place the child at the bind segment length, then bounce it off the body
        { const sg = c.seg[j]; _spC.x = pos[i0] + _spA.x * sg; _spC.y = pos[i0 + 1] + _spA.y * sg; _spC.z = pos[i0 + 2] + _spA.z * sg; }
        if (cls.collide) {
          const nc = cls.collide === 3 ? 5 : cls.collide === 2 ? 3 : 1;
          // the child's ANIMATED rest, so a capsule can only stop a strand
          // sinking further in than the artist drew it (see _pushOutOfCapsule)
          _spE.x = anim[i1]; _spE.y = anim[i1 + 1]; _spE.z = anim[i1 + 2];
          // (M1.2e, `collide: 3`, the sash panels: the legs at full radius — the panel's rest rides the pelvis, so a
          // striding thigh moves under the rest and the rest rule would let it through)
          // (M1.2e fix 1: a panel's legs are the sheet test below, not the strand's radial push)
          for (let q = 0; q < nc; q++) { if (c.shN && q > 0) break; this._pushOutOfCapsule(_spC, caps[q], cls.collide === 3 && q > 0 ? null : _spE); }
          {
            const ax = _spC.x - pos[i0], ay = _spC.y - pos[i0 + 1], az = _spC.z - pos[i0 + 2];
            const a2 = ax * ax + ay * ay + az * az;
            if (a2 < 1e-12) { _spA.x = _spB.x; _spA.y = _spB.y; _spA.z = _spB.z; } else {
              const ai = 1 / Math.sqrt(a2);
              _spA.x = ax * ai; _spA.y = ay * ai; _spA.z = az * ai;
            }
          }
          { const sg = c.seg[j]; _spC.x = pos[i0] + _spA.x * sg; _spC.y = pos[i0 + 1] + _spA.y * sg; _spC.z = pos[i0 + 2] + _spA.z * sg; }
          // M1.2e fix 1: the wrap tail off the draw arm's UPPER arm too (the hand capsule below is the forearm and the
          // hand): in the trade wind the tail streams across her right shoulder, standing (bench: 37 of 120 stand
          // frames, a tail vertex within 0.04 m of the right upper arm's axis). Two passes, each back on the sphere.
          if (cls.name === 'wrap' && this.b.upArmR && this.b.loArmR) {
            const U = this._uaCap || (this._uaCap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.085 });
            U.a.setFromMatrixPosition(this.b.upArmR.bone.matrixWorld); U.b.setFromMatrixPosition(this.b.loArmR.bone.matrixWorld);
            for (let it = 0; it < 2; it++) {
              if (!this._pushOutOfCapsule(_spC, U, null)) break;
              _spA.set(_spC.x - pos[i0], _spC.y - pos[i0 + 1], _spC.z - pos[i0 + 2]);
              if (_spA.lengthSq() < 1e-12) _spA.copy(_spB); else _spA.normalize();
              const sg = c.seg[j]; _spC.x = pos[i0] + _spA.x * sg; _spC.y = pos[i0 + 1] + _spA.y * sg; _spC.z = pos[i0 + 2] + _spA.z * sg;
            }
          }
          if (c.shN) {
            this._sheetPush(c, j, pos, i0, caps);
            _spA.set(_spC.x - pos[i0], _spC.y - pos[i0 + 1], _spC.z - pos[i0 + 2]);
            if (_spA.lengthSq() < 1e-12) _spA.copy(_spB); else _spA.normalize();
          }
        }
        // (M1.2e fix 1: not the sash panels, which lie on the thighs under her hands: seated, the draw hand's capsule
        // on her lap levered the short right panel up and across to her left hip, into her belly)
        if (hcN && !c.shN) {
          // push out, put the particle back at its segment length, and repeat:
          // one pass re-projected a strand whose parent sits near the capsule
          // straight back inside it (the sternum cord under a hand crossing
          // the chest, A-wrap-clear: 0.024 m from the axis). Four passes walk
          // it round its parent's sphere to the outside.
          let inside = false;
          for (let it = 0; it < 4; it++) {
            let hit = false;
            for (let q = 0; q < hcN; q++) hit = this._pushOutOfCapsule(_spC, H.caps[q], null) || hit;
            if (!hit) { inside = false; break; }
            inside = true;
            if (it === 0) H.pushes++;
            {
              const ax = _spC.x - pos[i0], ay = _spC.y - pos[i0 + 1], az = _spC.z - pos[i0 + 2];
              const a2 = ax * ax + ay * ay + az * az;
              if (a2 < 1e-12) { _spA.x = _spB.x; _spA.y = _spB.y; _spA.z = _spB.z; } else {
                const ai = 1 / Math.sqrt(a2);
                _spA.x = ax * ai; _spA.y = ay * ai; _spA.z = az * ai;
              }
            }
            { const sg = c.seg[j]; _spC.x = pos[i0] + _spA.x * sg; _spC.y = pos[i0 + 1] + _spA.y * sg; _spC.z = pos[i0 + 2] + _spA.z * sg; }
          }
          if (inside) {
            // still in after four passes: the best place on the parent's
            // sphere. W0b targeted fix 2: the old fallback hung the particle
            // straight away from the NEARER segment only, which can lay it
            // against the other one where forearm and hand meet at the wrist;
            // the candidates are now straight away from each segment's
            // nearest point and from their mean, and the one farthest from
            // BOTH axes wins (where the passes left it, if that is farther)
            _spE.x = pos[i0]; _spE.y = pos[i0 + 1]; _spE.z = pos[i0 + 2];
            this._hcMinAxisN(_spC, H, hcN);
            let bestD = _spNum[0];
            _hcB.copy(_spC);
            _spD.x = 0; _spD.y = 0; _spD.z = 0;
            for (let q = 0; q <= hcN; q++) {
              if (q < hcN) {
                this._segDistN(_spE, H.caps[q].a, H.caps[q].b);   // leaves parent - axis point in _cp1
                if (_cp1.x * _cp1.x + _cp1.y * _cp1.y + _cp1.z * _cp1.z < 1e-10) continue;
                _hcU.copy(_cp1).normalize();
                _spD.add(_hcU);
              } else {
                if (_spD.x * _spD.x + _spD.y * _spD.y + _spD.z * _spD.z < 1e-10) continue;
                _hcU.copy(_spD).normalize();
              }
              { const sg = c.seg[j]; _hcC.x = _spE.x + _hcU.x * sg; _hcC.y = _spE.y + _hcU.y * sg; _hcC.z = _spE.z + _hcU.z * sg; }
              this._hcMinAxisN(_hcC, H, hcN);
              const dc = _spNum[0];
              if (dc > bestD) { bestD = dc; _hcB.copy(_hcC); }
            }
            _spC.copy(_hcB);
            {
              const ax = _spC.x - _spE.x, ay = _spC.y - _spE.y, az = _spC.z - _spE.z;
              const a2 = ax * ax + ay * ay + az * az;
              if (a2 < 1e-12) { _spA.x = _spB.x; _spA.y = _spB.y; _spA.z = _spB.z; } else {
                const ai = 1 / Math.sqrt(a2);
                _spA.x = ax * ai; _spA.y = ay * ai; _spA.z = az * ai;
              }
            }
          }
          /* W0b targeted fix 4 (r2 gate judge: a strand's SEGMENT between two
           * clear particles came 0.0494 m from the capsule surface, every
           * particle >= 0.0550): the segment parent -> child against the capsule
           * axes, closed form. Nearer than `segR` (0.087 axis = 0.052 m off a
           * 0.035 hand), the child is turned out on its parent's sphere; a move of
           * the child moves the nearest segment point by its parameter along the
           * segment. A chain's first link hangs off a fixed root, whose keep-out
           * is the arm's (`_clearArmOfRoots`): it is reported, not pushed. */
          _spE.set(pos[i0], pos[i0 + 1], pos[i0 + 2]);
          if (j > 0) {
            for (let it = 0; it < 3; it++) {
              const ds = this._hcSegMin(_spE, _spC, H, hcN);   // leaves the nearest points in _hcP / _hcQ, the parameter in _hcS
              if (ds >= H.segR) break;
              _spA.subVectors(_hcP, _hcQ);
              if (_spA.lengthSq() < 1e-10) break;
              _spA.normalize();
              _spC.addScaledVector(_spA, (H.segR - ds + 1e-4) / Math.max(0.3, this._hcS));
              _spA.subVectors(_spC, _spE);
              if (_spA.lengthSq() < 1e-12) { _spA.copy(_spB); break; }
              _spA.normalize();
              _spC.copy(_spE).addScaledVector(_spA, c.seg[j]);
            }
          }
          for (let q = 0; q < hcN; q++) {
            this._segDistN(_spC, H.caps[q].a, H.caps[q].b);
            const d = _spNum[0];
            if (d < H.minAxis) { H.minAxis = d; H.minCi = ci; H.minJ = j + 1; }
            if (d < H.minSinceRead) { H.minSinceRead = d; H.minCiSR = ci; H.minJSR = j + 1; }
          }
          const dSeg = this._hcSegMin(_spE, _spC, H, hcN);
          if (j === 0) { if (dSeg < H.rootSegSinceRead) H.rootSegSinceRead = dSeg; }
          else {
            if (dSeg < H.segMin) H.segMin = dSeg;
            if (dSeg < H.segSinceRead) { H.segSinceRead = dSeg; H.segCiSR = ci; H.segJSR = j + 1; }
          }
          // (the bend limit's direction for the write-back below)
          _spA.subVectors(_spC, _spE);
          if (_spA.lengthSq() < 1e-12) _spA.copy(_spB); else _spA.normalize();
        }
        // R5 fix round 5: the STOWED LANCE's shaft (`_stowCap`, written by the
        // hero's carry solve each frame — last frame's pose) is a capsule too:
        // the wrap tail now flies out at head height and, at a leaned-back up
        // aim on a slow frame clock, swung to 0.009 m of the shaft (A-lance-stow
        // under a loaded clock, run f5rep1; A100 wants >= 0.06). Two passes,
        // each put back at its segment length.
        if (SC.on) {
          for (let it = 0; it < 2; it++) {
            if (!this._pushOutOfCapsule(_spC, SC, null)) break;
            {
              const ax = _spC.x - pos[i0], ay = _spC.y - pos[i0 + 1], az = _spC.z - pos[i0 + 2];
              const a2 = ax * ax + ay * ay + az * az;
              if (a2 < 1e-12) { _spA.x = _spB.x; _spA.y = _spB.y; _spA.z = _spB.z; } else {
                const ai = 1 / Math.sqrt(a2);
                _spA.x = ax * ai; _spA.y = ay * ai; _spA.z = az * ai;
              }
            }
            { const sg = c.seg[j]; _spC.x = pos[i0] + _spA.x * sg; _spC.y = pos[i0 + 1] + _spA.y * sg; _spC.z = pos[i0 + 2] + _spA.z * sg; }
          }
        }
        // Constraint velocity correction (position-based dynamics), CLAMPED.
        // Un-clamped this is `|projection| / dt`: a 0.3 m projection at 60 Hz
        // hands the particle 9 m/s, the next frame's projection is larger
        // still, and the chain saturates its bend limit and stays there. The
        // clamp keeps the constraint able to absorb a real impact without ever
        // being a power source.
        const pvx = (_spC.x - pos[i1]) * invDt * 0.5, pvy = (_spC.y - pos[i1 + 1]) * invDt * 0.5, pvz = (_spC.z - pos[i1 + 2]) * invDt * 0.5;
        const cvx = pvx < -PBD_V_MAX ? -PBD_V_MAX : pvx > PBD_V_MAX ? PBD_V_MAX : pvx;
        const cvy = pvy < -PBD_V_MAX ? -PBD_V_MAX : pvy > PBD_V_MAX ? PBD_V_MAX : pvy;
        const cvz = pvz < -PBD_V_MAX ? -PBD_V_MAX : pvz > PBD_V_MAX ? PBD_V_MAX : pvz;
        vel[i1] += cvx; vel[i1 + 1] += cvy; vel[i1 + 2] += cvz;
        pos[i1] = _spC.x; pos[i1 + 1] = _spC.y; pos[i1 + 2] = _spC.z;

        // ---- write back: rotate the bone from its reference to the solved dir
        _spQ2.setFromUnitVectors(_spB, _spA);
        if (Math.abs(_spQ2._w) < 0.999999) {
          // the bone's ACTUAL world orientation right now = qAcc * Wanim[j]
          _spQ._x = c.wq[j * 4]; _spQ._y = c.wq[j * 4 + 1]; _spQ._z = c.wq[j * 4 + 2]; _spQ._w = c.wq[j * 4 + 3];
          _spQ.premultiply(_spAcc);
          _spQ3.copy(_spQ).invert().multiply(_spQ2).multiply(_spQ);
          c.links[j].bone.quaternion.multiply(_spQ3);
        }
        _spAcc.premultiply(_spQ2);
      }

      /* ---- 7. published summary scalars (A33-rig-finite reads these) ---- */
      const iT = N * 3;
      c.ax = pos[iT] - anim[iT];
      c.az = pos[iT + 2] - anim[iT + 2];
      c.vx = vel[iT] - aVel[iT];
      c.vz = vel[iT + 2] - aVel[iT + 2];
      if (!(Number.isFinite(c.ax) && Number.isFinite(c.az)
            && Number.isFinite(c.vx) && Number.isFinite(c.vz))) {
        pos.set(anim); vel.fill(0);
        c.ax = 0; c.az = 0; c.vx = 0; c.vz = 0;
      }
    }
  }
}
