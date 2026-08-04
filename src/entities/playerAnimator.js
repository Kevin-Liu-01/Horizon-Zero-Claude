import * as THREE from 'three';

/**
 * Procedural skeleton animation for the Aloy rig (the GLB ships zero clips).
 *
 * Technique: every posed bone stores its bind-pose local quaternion plus its
 * bind-pose orientation in CHARACTER space (model root space, +Z forward).
 * Each frame the pose is rebuilt from bind (never accumulated) and layers add
 * rotations expressed about character-space axes; the char->bone-local
 * conversion  L(R) = Wbind^-1 * R * Wbind  makes the mirrored L/R bone frames
 * of this Fortnite-style rig a non-issue.
 *
 * Layers (in order): base stance (kills the A-pose), idle breathe/weight-shift,
 * locomotion (stride frequency tied to moveSpeed), crouch, aim/draw overlay
 * (2-bone IK-ish arms), dodge tuck-roll, hit react, death slump, then
 * spring-damper secondary motion on hair/skirt dyn_ chains.
 */

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Q_IDENT = new THREE.Quaternion();

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _dA = new THREE.Vector3();   // aim direction (char space)
const _anch = new THREE.Vector3(); // draw anchor (cheek)
const _sh = new THREE.Vector3();   // live shoulder position
const _grip = new THREE.Vector3(); // bow grip / nock scratch
const _pole = new THREE.Vector3(); // IK elbow pole
const _hand = new THREE.Vector3(); // achieved IK hand position
const _nrm = new THREE.Vector3();  // terrain normal
const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();

// ball-bone center sits at sole level at bind
const BALL_REST = 0.005;

const { damp, clamp, smoothstep } = THREE.MathUtils;

const KEY = {
  pelvis: 'pelvis_05',
  spine1: 'spine_01_06', spine2: 'spine_02_07', spine3: 'spine_03_08',
  spine4: 'spine_04_09', spine5: 'spine_05_010',
  neck1: 'neck_01_0102', neck2: 'neck_02_0103', head: 'head_0104',
  clavL: 'clavicle_l_011', clavR: 'clavicle_r_042',
  upArmL: 'upperarm_l_012', upArmR: 'upperarm_r_043',
  loArmL: 'lowerarm_l_013', loArmR: 'lowerarm_r_044',
  handL: 'hand_l_014', handR: 'hand_r_045',
  thighL: 'thigh_l_0185', thighR: 'thigh_r_0211',
  calfL: 'calf_l_0186', calfR: 'calf_r_0212',
  footL: 'foot_l_0189', footR: 'foot_r_0215',
  ballL: 'ball_l_0190', ballR: 'ball_r_0216',
};

const FINGER_SEGS = ['01', '02', '03'];
const FINGERS = ['index', 'middle', 'ring', 'pinky'];

// dyn_ chain link names (exact rig names)
const CHAIN_DEFS = [
  { links: ['dyn_hairBackMain_01_0145', 'dyn_hairBackMain_02_0146', 'dyn_hairBackMain_03_0147', 'dyn_hairBackMain_04_0148', 'dyn_hairBackMain_05_0149', 'dyn_hairBackMain_06_0150'], k: 42, c: 7.5, accel: 0.055, gait: 0.11, max: 0.42, seed: 0.0 },
  { links: ['dyn_hairBackBraid_01_l_0151', 'dyn_hairBackBraid_02_l_0152', 'dyn_hairBackBraid_03_l_0153', 'dyn_hairBackBraid_04_l_0154'], k: 50, c: 8, accel: 0.05, gait: 0.09, max: 0.4, seed: 1.7 },
  { links: ['dyn_hairBackBraid_01_r_0155', 'dyn_hairBackBraid_02_r_0156', 'dyn_hairBackBraid_03_r_0157', 'dyn_hairBackBraid_04_r_0158'], k: 48, c: 8, accel: 0.05, gait: 0.09, max: 0.4, seed: 3.9 },
  { links: ['dyn_skirtBack_01_0243', 'dyn_skirtBack_02_0244', 'dyn_skirtBack_03_0245', 'dyn_skirtBack_04_0246'], k: 70, c: 10, accel: 0.04, gait: 0.06, max: 0.3, seed: 2.4 },
  { links: ['dyn_skirtA_01_l_0201', 'dyn_skirtA_02_l_0202', 'dyn_skirtA_03_l_0203'], k: 80, c: 11, accel: 0.03, gait: 0.05, max: 0.26, seed: 0.9 },
  { links: ['dyn_skirtA_01_r_0235', 'dyn_skirtA_02_r_0236', 'dyn_skirtA_03_r_0237'], k: 80, c: 11, accel: 0.03, gait: 0.05, max: 0.26, seed: 4.6 },
  { links: ['dyn_skirtB_01_l_0205', 'dyn_skirtB_02_l_0206', 'dyn_skirtB_03_l_0207'], k: 85, c: 11, accel: 0.028, gait: 0.05, max: 0.24, seed: 5.8 },
  { links: ['dyn_skirtB_01_r_0239', 'dyn_skirtB_02_r_0220', 'dyn_skirtB_03_r_0241'], k: 85, c: 11, accel: 0.028, gait: 0.05, max: 0.24, seed: 2.9 },
];
const CHAIN_W = [0.5, 0.34, 0.24, 0.17, 0.12, 0.09];

export class PlayerAnimator {
  constructor(ctx, model) {
    this.ctx = ctx;
    this.model = model;
    this.bones = {};
    model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });

    model.updateMatrixWorld(true);
    const invModelQ = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const invModelM = _m4.copy(model.matrixWorld).invert().clone();

    // entry: bone + bind local quat/pos + bind char-space quat (and inverse)
    this._entries = {};
    const makeEntry = (name) => {
      const bone = this.bones[name];
      if (!bone) return null;
      const W = new THREE.Quaternion();
      bone.getWorldQuaternion(W).premultiply(invModelQ);
      const e = {
        bone,
        bindQ: bone.quaternion.clone(),
        bindP: bone.position.clone(),
        W,
        invW: W.clone().invert(),
      };
      this._entries[name] = e;
      return e;
    };

    this.b = {};
    for (const [short, name] of Object.entries(KEY)) this.b[short] = makeEntry(name);

    // fingers: reset + curl by local Z (rig curls fingers about local +Z on both hands)
    this._fingerL = [];
    this._fingerR = [];
    const collectFingers = (side, list) => {
      for (const f of FINGERS) {
        for (const seg of FINGER_SEGS) {
          const e = makeEntry(this._findName(`${f}_${seg}_${side}_`));
          if (e) list.push(e);
        }
      }
      for (const seg of FINGER_SEGS) {
        const e = makeEntry(this._findName(`thumb_${seg}_${side}_`));
        if (e) { e.isThumb = true; list.push(e); }
      }
    };
    collectFingers('l', this._fingerL);
    collectFingers('r', this._fingerR);

    // dyn spring chains
    this._chains = [];
    for (const def of CHAIN_DEFS) {
      const links = def.links.map((n) => makeEntry(n)).filter(Boolean);
      if (links.length) {
        this._chains.push({ ...def, links, ax: 0, az: 0, vx: 0, vz: 0 });
      }
    }

    this._posed = Object.values(this._entries);

    // char-space bind joint positions (for arm IK) — model is at identity here
    this._charPos = {};
    for (const short of ['upArmL', 'loArmL', 'handL', 'upArmR', 'loArmR', 'handR']) {
      const e = this.b[short];
      if (e) {
        this._charPos[short] = e.bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(invModelM);
      }
    }
    const dir = (a, b) => this._charPos[b].clone().sub(this._charPos[a]).normalize();
    const len = (a, b) => this._charPos[b].distanceTo(this._charPos[a]);
    this._dirUpL = dir('upArmL', 'loArmL');
    this._dirLoL = dir('loArmL', 'handL');
    this._dirUpR = dir('upArmR', 'loArmR');
    this._dirLoR = dir('loArmR', 'handR');
    this._lenUpR = len('upArmR', 'loArmR');
    this._lenLoR = len('loArmR', 'handR');
    this._lenUpL = len('upArmL', 'loArmL');
    this._lenLoL = len('loArmL', 'handL');
    // how far the A-pose arms sit from vertical (for the arms-down stance layer)
    this._armDropL = Math.acos(clamp(-this._dirUpL.y, -1, 1));
    this._armDropR = Math.acos(clamp(-this._dirUpR.y, -1, 1));

    // pelvis translation basis: char-space offset -> pelvis-parent local
    const pelvisParent = this.b.pelvis.bone.parent;
    pelvisParent.updateWorldMatrix(true, false);
    this._pelvisM3 = new THREE.Matrix3().setFromMatrix4(
      _m4.copy(pelvisParent.matrixWorld).invert(),
    );

    // animation state
    this._phase = Math.random() * Math.PI * 2;
    this._moveW = 0; this._runW = 0; this._crouchW = 0; this._aimW = 0;
    this._dodgeW = 0; this._deadW = 0; this._drawS = 0;
    this._dodgeT = 1;
    this._wasDodging = false;
    this._hit = 0;
    this._prevVel = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this._prevHeading = 0;
    this._yawRate = 0;
    this._grnd = 0;            // ground-conform pelvis offset (damped)
    this._lvx = 0; this._lvz = 0;   // local (char-space) velocity, damped
    this._mx = 0; this._mz = 1;     // local move direction, damped
    this._qTorso = new THREE.Quaternion();
    this._boneWorldCache = {};

    ctx.events?.on('player-hurt', () => { this._hit = 1; });
  }

  /* ---------------------------- contract API ---------------------------- */

  getBoneWorld(name, out) {
    let bone = this.bones[name] ?? this._boneWorldCache[name];
    if (!bone) {
      const full = this._findName(name);
      bone = full ? this.bones[full] : null;
      if (bone) this._boneWorldCache[name] = bone;
    }
    if (!bone || !out) return null;
    bone.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(bone.matrixWorld);
  }

  handAttach(side) {
    const s = String(side || 'r').toLowerCase()[0];
    return s === 'l' ? this.bones[KEY.handL] : this.bones[KEY.handR];
  }

  /* ------------------------------ helpers ------------------------------- */

  _findName(prefix) {
    if (this.bones[prefix]) return prefix;
    let best = null;
    for (const n in this.bones) {
      if (n.startsWith(prefix) && !n.includes('_end') && !n.includes('_Base')) {
        if (!best || n.length < best.length) best = n;
      }
    }
    return best;
  }

  // rotate bone about a character-space axis (converted to its local frame)
  _rot(e, axis, angle) {
    if (!e || angle === 0) return;
    _q1.setFromAxisAngle(axis, angle);
    _q2.copy(e.invW).multiply(_q1).multiply(e.W);
    e.bone.quaternion.multiply(_q2);
  }

  // torso variant: also tracks accumulated torso rotation for arm targeting
  _rotT(e, axis, angle) {
    if (!e || angle === 0) return;
    _q1.setFromAxisAngle(axis, angle);
    this._qTorso.multiply(_q1);
    _q2.copy(e.invW).multiply(_q1).multiply(e.W);
    e.bone.quaternion.multiply(_q2);
  }

  // apply an arbitrary char-space quaternion rotation
  _rotQ(e, q) {
    if (!e) return;
    _q2.copy(e.invW).multiply(q).multiply(e.W);
    e.bone.quaternion.multiply(_q2);
  }

  /* ------------------------------- update -------------------------------- */

  update(dt, t) {
    const p = this.ctx.player;
    if (!p || dt <= 0) return;
    dt = Math.min(dt, 0.05);

    /* ---- read state, smooth layer weights ---- */
    const speed = p.moveSpeed ?? 0;
    const draw = this.ctx.combat?.drawStrength ?? p.drawStrength ?? 0;
    const dead = this.ctx.state === 'dead';

    this._moveW = damp(this._moveW, smoothstep(speed, 0.18, 1.1), 12, dt);
    this._runW = damp(this._runW, smoothstep(speed, 4.9, 7.9), 9, dt);
    this._crouchW = damp(this._crouchW, p.crouching ? 1 : 0, 10, dt);
    this._aimW = damp(this._aimW, p.aiming && !dead ? 1 : 0, 13, dt);
    this._deadW = damp(this._deadW, dead ? 1 : 0, dead ? 5 : 10, dt);
    this._drawS = damp(this._drawS, clamp(draw, 0, 1), 16, dt);
    this._hit = damp(this._hit, 0, 9, dt);

    if (p.dodging && !this._wasDodging) this._dodgeT = 0;
    this._wasDodging = p.dodging;
    if (p.dodging) this._dodgeT = Math.min(this._dodgeT + dt / 0.42, 1);
    this._dodgeW = damp(this._dodgeW, p.dodging ? 1 : 0, p.dodging ? 30 : 12, dt);

    const moveW = this._moveW * (1 - this._deadW);
    const runW = this._runW;
    const crouchW = this._crouchW * (1 - this._deadW);
    const aimW = this._aimW * (1 - this._dodgeW) * (1 - this._deadW);
    const dodgeW = this._dodgeW;
    const idleW = (1 - moveW) * (1 - this._deadW);

    /* ---- gait phase: stride frequency tied to speed (no foot skating) ---- */
    const stepLen = clamp(0.5 + 0.3 * speed, 0.6, 1.92);
    const cadence = speed > 0.05 ? speed / (2 * stepLen) : 0;
    this._phase += Math.PI * 2 * cadence * dt;
    const ph = this._phase;
    const cph = Math.cos(ph), sph = Math.sin(ph);

    /* ---- character-space acceleration (smoothed) + yaw rate ---- */
    _v1.copy(p.velocity ?? _v1.set(0, 0, 0)).sub(this._prevVel).divideScalar(dt);
    this._prevVel.copy(p.velocity ?? _v1);
    _v1.applyAxisAngle(Y_AXIS, -(p.heading ?? 0));
    if (_v1.lengthSq() > 144) _v1.setLength(12);
    this._accel.x = damp(this._accel.x, _v1.x, 7, dt);
    this._accel.z = damp(this._accel.z, _v1.z, 7, dt);
    let dh = (p.heading ?? 0) - this._prevHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this._prevHeading = p.heading ?? 0;
    this._yawRate = damp(this._yawRate, clamp(dh / dt, -6, 6), 8, dt);

    /* ---- local (char-space) velocity + move direction (strafe/backpedal) ---- */
    const hh = p.heading ?? 0;
    const shh = Math.sin(hh), chh = Math.cos(hh);
    const vwx = p.velocity?.x ?? 0, vwz = p.velocity?.z ?? 0;
    this._lvx = damp(this._lvx, vwx * chh - vwz * shh, 10, dt);
    this._lvz = damp(this._lvz, vwx * shh + vwz * chh, 10, dt);
    const lsp = Math.hypot(this._lvx, this._lvz);
    this._mx = damp(this._mx, lsp > 0.35 ? this._lvx / lsp : 0, 9, dt);
    this._mz = damp(this._mz, lsp > 0.35 ? this._lvz / lsp : 1, 9, dt);
    const mInv = 1 / (Math.hypot(this._mx, this._mz) || 1);
    const mx = this._mx * mInv, mz = this._mz * mInv;
    const fwdness = Math.abs(mz);           // 1 = pure fwd/back, 0 = pure strafe
    const fwdGate = smoothstep(mz, 0.2, 0.8); // toe-off only for forward gait

    /* ---- reset every posed bone to bind (pose is rebuilt, never accumulated) */
    for (let i = 0; i < this._posed.length; i++) {
      const e = this._posed[i];
      e.bone.quaternion.copy(e.bindQ);
    }
    this._qTorso.identity();
    const b = this.b;
    // feet positions may carry ground-clamp offsets; reset them too
    if (b.footL) b.footL.bone.position.copy(b.footL.bindP);
    if (b.footR) b.footR.bone.position.copy(b.footR.bindP);

    // pelvis translation offsets accumulated in char space (meters)
    let pdx = 0, pdy = 0, pdz = 0;
    // spine totals for head stabilization
    let stPitch = 0, stYaw = 0, stRoll = 0;

    /* =================== LAYER 0: base stance (weight 1) =================== */
    // arms fall from A-pose to relaxed hang; kills the A-pose in every state.
    // Faded out while aiming so the arm IK maps exactly from bind directions.
    const hangW = 1 - aimW;
    const hangL = -(this._armDropL - 0.16) * hangW;
    const hangR = (this._armDropR - 0.16) * hangW;
    this._rot(b.upArmL, Z_AXIS, hangL);
    this._rot(b.upArmR, Z_AXIS, hangR);
    this._rot(b.upArmL, X_AXIS, -0.1 * hangW);
    this._rot(b.upArmR, X_AXIS, -0.1 * hangW);
    this._rot(b.loArmL, X_AXIS, -0.28 * hangW); // slight elbow bend
    this._rot(b.loArmR, X_AXIS, -0.28 * hangW);
    this._rot(b.clavL, Z_AXIS, -0.05 * hangW);
    this._rot(b.clavR, Z_AXIS, 0.05 * hangW);
    // relaxed finger curl (A-pose ships with stiff splayed hands)
    this._curlFingers(this._fingerL, 0.32, 0.15);
    this._curlFingers(this._fingerR, 0.32, 0.15);

    /* ==================== LAYER 1: idle (weight idleW) ==================== */
    if (idleW > 0.01) {
      const wAim = 1 - aimW * 0.6;
      // breathing ~13 breaths/min
      const br = Math.sin(t * 1.45);
      const br2 = Math.sin(t * 1.45 + 0.7);
      this._rotT(b.spine3, X_AXIS, br * 0.014 * idleW * wAim);
      this._rotT(b.spine4, X_AXIS, br * 0.02 * idleW * wAim);
      this._rot(b.clavL, Z_AXIS, -br2 * 0.016 * idleW * wAim);
      this._rot(b.clavR, Z_AXIS, br2 * 0.016 * idleW * wAim);
      stPitch += br * 0.034 * idleW * wAim;

      // slow weight shift side to side
      const ws = Math.sin(t * 0.42);
      const wsW = idleW * (1 - crouchW) * (1 - aimW);
      pdx += ws * 0.024 * wsW;
      pdy += (Math.cos(t * 0.84) - 1) * 0.004 * wsW;
      this._rotT(b.pelvis, Z_AXIS, -ws * 0.035 * wsW);
      this._rotT(b.spine2, Z_AXIS, ws * 0.028 * wsW);
      stRoll += -ws * 0.007 * wsW;
      // unweighted knee softens
      const softL = Math.max(0, -ws) * 0.09 * wsW;
      const softR = Math.max(0, ws) * 0.09 * wsW;
      this._rot(b.thighL, X_AXIS, -softL * 0.5);
      this._rot(b.calfL, X_AXIS, softL);
      this._rot(b.footL, X_AXIS, -softL * 0.5);
      this._rot(b.thighR, X_AXIS, -softR * 0.5);
      this._rot(b.calfR, X_AXIS, softR);
      this._rot(b.footR, X_AXIS, -softR * 0.5);

      // idle arm micro-sway
      const asw = Math.sin(t * 0.8 + 1.3) * 0.02 * wsW;
      this._rot(b.upArmL, X_AXIS, asw);
      this._rot(b.upArmR, X_AXIS, -asw);

      // occasional lazy look-around (suppressed while aiming)
      const lookW = idleW * (1 - aimW);
      const lookY = (Math.sin(t * 0.21) * Math.sin(t * 0.13 + 2.1)) * 0.3 * lookW;
      const lookP = Math.sin(t * 0.17 + 4) * 0.05 * lookW;
      this._rot(b.neck1, Y_AXIS, lookY * 0.35);
      this._rot(b.head, Y_AXIS, lookY * 0.65);
      this._rot(b.head, X_AXIS, lookP);
    }

    /* ================ LAYER 2: locomotion (weight moveW) ================== */
    if (moveW > 0.01) {
      const crAmp = 1 - crouchW * 0.42;
      const midW = smoothstep(speed, 1.4, 4.4); // jog-ness
      const swing = (0.28 + 0.28 * midW + 0.2 * runW) * moveW * crAmp;

      // swing axis follows the local move direction: X for fwd/back gait,
      // blending toward Z for lateral steps (side-stepping, aim strafing)
      const swingAxis = _v7.set(mz, 0, -mx);

      // legs — phase L = ph, R = ph + PI. thigh fwd = -swingAxis rot
      for (let side = 0; side < 2; side++) {
        const s = side === 0 ? 1 : -1;
        const lph = side === 0 ? ph : ph + Math.PI;
        const c = Math.cos(lph);
        const swingBend = Math.pow(Math.max(0, -Math.sin(lph - 0.3)), 1.3);
        const stanceLoad = Math.max(0, Math.sin(lph * 2)) * Math.max(0, Math.sin(lph)) * 0.14;
        const thigh = side === 0 ? b.thighL : b.thighR;
        const calf = side === 0 ? b.calfL : b.calfR;
        const foot = side === 0 ? b.footL : b.footR;
        const ball = side === 0 ? b.ballL : b.ballR;

        const thighA = -swing * c + 0.08 * moveW * fwdness; // slight forward bias
        const kneeA = (0.1 + (0.62 + 0.6 * runW) * swingBend + stanceLoad)
          * moveW * crAmp * (0.55 + 0.45 * fwdness);
        this._rot(thigh, swingAxis, thighA);
        this._rot(calf, swingAxis, kneeA);
        // ankle: partially cancel carried chain rotation (foot ~level in stance),
        // plantar-flex push at toe-off just past lph = PI (forward gait only)
        const footA = -(thighA * 0.62 + kneeA * 0.55)
          + 0.4 * moveW * fwdGate * Math.pow(Math.max(0, Math.sin(lph - 1.9)), 2);
        this._rot(foot, swingAxis, footA);
        this._rot(ball, X_AXIS, -0.35 * moveW * fwdGate * Math.pow(Math.max(0, Math.sin(lph - 1.6)), 2));
        // subtle out-toe; hips abduct into a wider base when stepping laterally
        this._rot(thigh, Y_AXIS, s * 0.04 * moveW);
        this._rot(thigh, Z_AXIS, s * 0.06 * moveW * (1 - fwdness));
      }

      // pelvis: vertical bob (2x cadence), lateral weight transfer, yaw/roll
      // constant drop keeps the flexed stance leg planted (no floating feet)
      const bobA = (0.02 + 0.05 * runW) * moveW;
      pdy += -bobA * (0.5 - 0.5 * Math.cos(2 * ph - 0.6))
        - (0.04 * midW + 0.028 * runW) * moveW;
      // weight transfer happens perpendicular to the move direction
      const wt = Math.cos(ph + 0.4) * 0.021 * moveW * (1 - runW * 0.75);
      pdx += wt * mz;
      pdz += -wt * mx;
      this._rotT(b.pelvis, Y_AXIS, -cph * (0.075 + 0.05 * runW) * moveW * (0.5 + 0.5 * fwdness));
      this._rotT(b.pelvis, Z_AXIS, sph * 0.045 * moveW * (1 - runW * 0.4));

      // spine: counter-yaw so shoulders oppose hips, forward lean with speed
      const counter = cph * (0.05 + 0.035 * runW) * moveW * (0.4 + 0.6 * fwdness);
      this._rotT(b.spine2, Y_AXIS, counter);
      this._rotT(b.spine3, Y_AXIS, counter);
      this._rotT(b.spine4, Y_AXIS, counter * 0.7);
      stYaw += counter * 2.4 - cph * (0.075 + 0.05 * runW) * moveW;

      const lean = (0.04 + 0.09 * midW + 0.18 * runW) * moveW
        + clamp(this._accel.z * 0.024, -0.2, 0.2) * moveW;
      const leanRoll = clamp(-this._accel.x * 0.02 - this._yawRate * 0.05, -0.16, 0.16) * moveW;
      this._rotT(b.spine1, X_AXIS, lean * 0.35);
      this._rotT(b.spine2, X_AXIS, lean * 0.35);
      this._rotT(b.spine3, X_AXIS, lean * 0.3);
      this._rotT(b.spine2, Z_AXIS, leanRoll);
      stPitch += lean;
      stRoll += leanRoll;

      // arms: counter-swing (left arm back when left leg fwd), gated by aim
      const armW = moveW * (1 - aimW);
      const armA = (0.24 + 0.34 * midW + 0.28 * runW) * armW;
      const pumpL = Math.max(0, -cph) * (0.14 * midW + 0.3 * runW) * armW;
      const pumpR = Math.max(0, cph) * (0.14 * midW + 0.3 * runW) * armW;
      this._rot(b.upArmL, X_AXIS, armA * cph);
      this._rot(b.upArmR, X_AXIS, -armA * cph);
      // elbows: bent at run, pumping
      this._rot(b.loArmL, X_AXIS, -(0.12 + 0.5 * midW + 0.45 * runW) * armW - pumpL);
      this._rot(b.loArmR, X_AXIS, -(0.12 + 0.5 * midW + 0.45 * runW) * armW - pumpR);
      this._rot(b.clavL, Y_AXIS, cph * 0.05 * armW);
      this._rot(b.clavR, Y_AXIS, cph * 0.05 * armW);
    }

    /* =================== LAYER 3: crouch (weight crouchW) ================== */
    if (crouchW > 0.01) {
      const deep = crouchW * (p.inTallGrass ? 1.12 : 1);
      // pelvis drop matches the leg-coil shortening (ground conform pass
      // clamps the residual so boots stay planted, not hovering)
      pdy += -0.45 * deep;
      pdz += -0.04 * deep;
      // legs coiled deep, slightly apart, feet dorsiflexed to stay flat
      this._rot(b.thighL, X_AXIS, -1.05 * deep);
      this._rot(b.thighR, X_AXIS, -1.05 * deep);
      this._rot(b.thighL, Z_AXIS, 0.12 * deep);
      this._rot(b.thighR, Z_AXIS, -0.12 * deep);
      this._rot(b.calfL, X_AXIS, 1.75 * deep);
      this._rot(b.calfR, X_AXIS, 1.75 * deep);
      this._rot(b.footL, X_AXIS, -0.62 * deep);
      this._rot(b.footR, X_AXIS, -0.62 * deep);
      // hunched spine, arms ready in front
      const hunch = 0.34 * deep * (1 - aimW * 0.55);
      this._rotT(b.spine1, X_AXIS, hunch * 0.3);
      this._rotT(b.spine2, X_AXIS, hunch * 0.34);
      this._rotT(b.spine3, X_AXIS, hunch * 0.36);
      stPitch += hunch;
      const armR = crouchW * (1 - aimW) * (1 - moveW * 0.6);
      this._rot(b.upArmL, X_AXIS, -0.38 * armR);
      this._rot(b.upArmR, X_AXIS, -0.38 * armR);
      this._rot(b.loArmL, X_AXIS, -0.55 * armR);
      this._rot(b.loArmR, X_AXIS, -0.55 * armR);
    }

    /* ============= LAYER 4: head stabilization (before aim look) =========== */
    {
      const w = (1 - aimW) * (1 - dodgeW) * (1 - this._deadW);
      this._rot(b.neck1, X_AXIS, -stPitch * 0.35 * w);
      this._rot(b.head, X_AXIS, -stPitch * 0.45 * w);
      this._rot(b.neck1, Y_AXIS, -stYaw * 0.4 * w);
      this._rot(b.head, Y_AXIS, -stYaw * 0.45 * w);
      this._rot(b.head, Z_AXIS, -stRoll * 0.7 * w);
    }

    /* ================= LAYER 5: aim/draw overlay (weight aimW) ============= */
    if (aimW > 0.01) this._aimLayer(aimW, this._drawS, p, moveW);

    /* ==================== LAYER 6: dodge tuck (dodgeW) ===================== */
    if (dodgeW > 0.01) {
      const k = this._dodgeT;
      // grounded shoulder roll: tuck leads (full tuck by k~0.25), the body
      // rolls low over the ground, then the tuck releases into the recovery
      const tuck = smoothstep(k, 0.02, 0.24) * (1 - smoothstep(k, 0.86, 1.0)) * dodgeW;
      // full forward shoulder roll; once complete (2PI = identity) it is
      // zeroed so the dodgeW fade-out can't visibly "unwind" the body
      const rollT = smoothstep(k, 0.06, 0.9);
      const roll = rollT >= 1 ? 0 : rollT * Math.PI * 2;
      this._rotT(b.pelvis, X_AXIS, roll * dodgeW);
      // pelvis drops to ~0.28m mid-roll — hips ride the ground, not the air
      pdy += -0.68 * Math.pow(Math.sin(Math.PI * clamp(k, 0, 1)), 0.8) * dodgeW;
      const curl = 0.85 * tuck;
      this._rotT(b.spine1, X_AXIS, curl * 0.45);
      this._rotT(b.spine2, X_AXIS, curl * 0.45);
      this._rotT(b.spine3, X_AXIS, curl * 0.4);
      this._rot(b.neck1, X_AXIS, curl * 0.5);
      this._rot(b.head, X_AXIS, curl * 0.45);
      // legs tuck hard into the chest
      this._rot(b.thighL, X_AXIS, -1.8 * tuck);
      this._rot(b.thighR, X_AXIS, -1.65 * tuck);
      this._rot(b.calfL, X_AXIS, 2.25 * tuck);
      this._rot(b.calfR, X_AXIS, 2.1 * tuck);
      this._rot(b.footL, X_AXIS, 0.5 * tuck);
      this._rot(b.footR, X_AXIS, 0.5 * tuck);
      // arms hugged across the chest for the whole roll, not just mid-tuck
      const hug = dodgeW * 0.35 + tuck * 0.65;
      this._rot(b.upArmL, X_AXIS, -1.05 * hug);
      this._rot(b.upArmR, X_AXIS, -1.05 * hug);
      this._rot(b.upArmL, Z_AXIS, -0.3 * hug);
      this._rot(b.upArmR, Z_AXIS, 0.3 * hug);
      this._rot(b.loArmL, X_AXIS, -1.5 * hug);
      this._rot(b.loArmR, X_AXIS, -1.5 * hug);
    }

    /* ===================== LAYER 7: hit react / death ====================== */
    if (this._hit > 0.02) {
      const h = this._hit * (1 - this._deadW);
      this._rotT(b.spine2, X_AXIS, -0.14 * h);
      this._rotT(b.spine3, X_AXIS, -0.1 * h);
      this._rot(b.head, X_AXIS, -0.16 * h);
      this._rot(b.spine2, Z_AXIS, 0.06 * h);
    }
    if (this._deadW > 0.01) {
      const d = this._deadW;
      pdy += -0.62 * d;
      this._rot(b.thighL, X_AXIS, -1.35 * d);
      this._rot(b.thighR, X_AXIS, -1.15 * d);
      this._rot(b.calfL, X_AXIS, 2.15 * d);
      this._rot(b.calfR, X_AXIS, 2.0 * d);
      this._rot(b.footL, X_AXIS, -0.8 * d);
      this._rot(b.footR, X_AXIS, -0.8 * d);
      const slump = 0.62 * d;
      this._rotT(b.spine1, X_AXIS, slump * 0.35);
      this._rotT(b.spine2, X_AXIS, slump * 0.4);
      this._rotT(b.spine3, X_AXIS, slump * 0.35);
      this._rot(b.neck1, X_AXIS, 0.3 * d);
      this._rot(b.head, X_AXIS, 0.42 * d);
      this._rot(b.upArmL, X_AXIS, -0.25 * d);
      this._rot(b.upArmR, X_AXIS, -0.25 * d);
      this._rot(b.upArmL, Z_AXIS, 0.15 * d);
      this._rot(b.upArmR, Z_AXIS, -0.15 * d);
    }

    // weary slump at low health
    const weary = clamp(1 - (p.health ?? 100) / 30, 0, 1) * (1 - this._deadW) * (1 - aimW);
    if (weary > 0.02) {
      this._rotT(b.spine2, X_AXIS, 0.05 * weary);
      this._rot(b.head, X_AXIS, 0.06 * weary);
    }

    /* ------------------- apply pelvis translation offset ------------------- */
    const pe = b.pelvis;
    _v2.set(pdx, pdy + this._grnd, pdz).applyMatrix3(this._pelvisM3);
    pe.bone.position.copy(pe.bindP).add(_v2);

    /* --------- ground conform: pelvis clamp + per-foot terrain clamp ------- */
    this._groundConform(dt, moveW, dodgeW, pdx, pdy, pdz);

    /* ------------------ secondary motion: dyn_ spring chains --------------- */
    this._springs(dt, t, ph, speed, moveW, runW);
  }

  /* -------------------------- ground conforming --------------------------- */

  /**
   * Post-pose pass: samples the terrain under each foot, pitches stance feet
   * to the slope, clamps the pelvis so the planted foot's ball bone touches
   * the ground (idle: lower foot; moving: stance foot), then raises any foot
   * whose ball would still sink below the terrain.
   */
  _groundConform(dt, moveW, dodgeW, pdx, pdy, pdz) {
    const terr = this.ctx.terrain;
    const b = this.b;
    if (!terr?.getHeight || !b.ballL || !b.ballR || !b.footL || !b.footR) return;
    const pe = b.pelvis;
    const offW = Math.max(dodgeW, this._deadW);
    if (offW > 0.25) {
      // rolling / dying: release the conform smoothly and leave the pose alone
      this._grnd = damp(this._grnd, 0, 8, dt);
      _v2.set(pdx, pdy + this._grnd, pdz).applyMatrix3(this._pelvisM3);
      pe.bone.position.copy(pe.bindP).add(_v2);
      return;
    }

    const stanceW = (1 - moveW) * (1 - offW * 4);
    const h = this.ctx.player?.heading ?? 0;
    const shh = Math.sin(h), chh = Math.cos(h);
    let cL = 0, cR = 0;
    for (let side = 0; side < 2; side++) {
      const ball = side === 0 ? b.ballL : b.ballR;
      const foot = side === 0 ? b.footL : b.footR;
      ball.bone.updateWorldMatrix(true, false);
      _v1.setFromMatrixPosition(ball.bone.matrixWorld);
      // stance feet pitch to the terrain slope under them
      if (stanceW > 0.05 && terr.getNormal) {
        terr.getNormal(_v1.x, _v1.z, _nrm);
        const grade = -(_nrm.x * shh + _nrm.z * chh) / Math.max(0.35, _nrm.y);
        this._rot(foot, X_AXIS, clamp(Math.atan(grade), -0.45, 0.45) * stanceW);
        ball.bone.updateWorldMatrix(true, false);
        _v1.setFromMatrixPosition(ball.bone.matrixWorld);
      }
      const c = _v1.y - terr.getHeight(_v1.x, _v1.z) - BALL_REST;
      if (side === 0) cL = c; else cR = c;
    }

    // pelvis clamp: at rest follow the LOWER foot (max clearance) so it
    // plants; while moving track the stance foot (min clearance) so strides
    // never hover or punch through
    const want = -((1 - moveW) * Math.max(cL, cR) + moveW * Math.min(cL, cR));
    const g0 = this._grnd;
    const rate = 6 + 14 * (1 - moveW);
    this._grnd = clamp(damp(g0, g0 + clamp(want, -0.5, 0.5), rate, dt), -0.38, 0.32);
    const dg = this._grnd - g0;
    _v2.set(pdx, pdy + this._grnd, pdz).applyMatrix3(this._pelvisM3);
    pe.bone.position.copy(pe.bindP).add(_v2);

    // per-foot clamp: raise any foot whose ball would still be underground
    for (let side = 0; side < 2; side++) {
      const c = (side === 0 ? cL : cR) + dg;
      if (c < -0.004) {
        const foot = side === 0 ? b.footL : b.footR;
        const raise = Math.min(-c, 0.4) * (1 - offW * 4);
        _m4.copy(foot.bone.parent.matrixWorld).invert();
        _m3.setFromMatrix4(_m4);
        _v2.set(0, raise, 0).applyMatrix3(_m3);
        foot.bone.position.add(_v2);
      }
    }
  }

  /* ----------------------------- aim overlay ------------------------------ */

  _aimLayer(aimW, drawS, p, moveW) {
    const b = this.b;
    const pitch = clamp(p.camPitch ?? 0, -0.6, 1.05);
    const stanceW = aimW * (1 - moveW * 0.85);

    // staggered archer stance: hips bladed, left side toward the target
    this._rotT(b.pelvis, Y_AXIS, -0.3 * stanceW);
    this._rot(b.thighL, X_AXIS, -0.05 * stanceW);
    this._rot(b.thighR, X_AXIS, 0.12 * stanceW);
    this._rot(b.calfR, X_AXIS, 0.14 * stanceW);
    this._rot(b.footL, Y_AXIS, 0.2 * stanceW);
    this._rot(b.footR, Y_AXIS, 0.24 * stanceW);

    // chest: bladed toward the target, opening further as the draw builds;
    // spine carries part of the aim pitch
    const chestYaw = -(0.2 + 0.15 * drawS) * aimW;
    const spineYaw = (chestYaw + 0.3 * stanceW) / 3;
    this._rotT(b.spine1, Y_AXIS, spineYaw);
    this._rotT(b.spine2, Y_AXIS, spineYaw);
    this._rotT(b.spine3, Y_AXIS, spineYaw);
    this._rotT(b.spine2, X_AXIS, pitch * 0.14 * aimW);
    this._rotT(b.spine3, X_AXIS, pitch * 0.15 * aimW);
    this._rotT(b.spine4, X_AXIS, pitch * 0.13 * aimW);
    // slight brace lean into the bow
    this._rotT(b.spine2, Z_AXIS, 0.05 * aimW);

    // head: face the target (counter the chest blade), carry the aim pitch
    this._rot(b.neck1, Y_AXIS, -chestYaw * 0.45);
    this._rot(b.head, Y_AXIS, -chestYaw * 0.6);
    this._rot(b.neck1, X_AXIS, pitch * 0.2 * aimW);
    this._rot(b.head, X_AXIS, pitch * 0.28 * aimW);

    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    const cmb = this.ctx.combat;
    const bow = cmb?.bow;
    const pull = bow?.pull ?? 0.52;
    const restZ = bow?.restZ ?? 0.055;

    // aim ray in character space. The bow is oriented by combat toward the
    // crosshair-true aimPoint, so the string/nock line must follow the SAME
    // ray or the string hand drifts off the nock when aiming at near ground.
    _dA.set(0, -sp, cp); // fallback: camera pitch (heading = camera yaw)
    if (p.aiming && cmb?.aimPoint && p.position) {
      const hy = p.heading ?? 0;
      const sy = Math.sin(hy), cy = Math.cos(hy);
      _v7.copy(cmb.aimPoint);
      _v7.x -= p.position.x + sy * 0.45; // approx grip: 0.45m ahead of chest
      _v7.y -= p.position.y + 1.43;
      _v7.z -= p.position.z + cy * 0.45;
      if (_v7.lengthSq() > 4) {
        _v7.normalize();
        _dA.set(_v7.x * cy - _v7.z * sy, _v7.y, _v7.x * sy + _v7.z * cy);
      }
    }
    const effPitch = Math.asin(clamp(-_dA.y, -1, 1)); // arm-line pitch

    // draw anchor at the right cheek/jaw, from the LIVE head position
    this._charOf(b.head.bone, _anch);
    _v7.set(-0.055, -0.055, 0.1).applyAxisAngle(X_AXIS, effPitch * 0.85);
    _anch.add(_v7);

    // nock offset relative to the hand in char space, from the LIVE bow rig
    // (combat may offset/cant the bow model under the grip): the bow group's
    // basis is +Z = aim dir, Y ~ world up projected off the ray
    const cant = bow?.model?.rotation?.z ?? 0;
    const gOffX = bow?.model?.position?.x ?? 0;
    const gOffY = bow?.model?.position?.y ?? 0;
    const gOffZ = bow?.model?.position?.z ?? 0;
    const ox = -Math.sin(cant) * 0.018 + gOffX;
    const oy = Math.cos(cant) * 0.018 + gOffY;
    const oz = restZ - pull * drawS + gOffZ;
    _v3.copy(_dA).multiplyScalar(oz);
    _v7.set(0, 1, 0).addScaledVector(_dA, -_dA.y).normalize(); // bow up axis
    _v3.addScaledVector(_v7, oy);
    _v7.cross(_dA).normalize();                                // bow x axis
    _v3.addScaledVector(_v7, ox); // _v3 = hand -> nock, char space

    // bow-grip target: relaxed extended hold at rest, blending onto the
    // anchor-aligned arrow line as the draw builds — so the string nock
    // arrives exactly at the cheek at full draw
    const dEase = smoothstep(drawS, 0.08, 0.9) * aimW;
    _grip.set(0.02, 1.4, 0.03).addScaledVector(_dA, 0.42);
    _v7.copy(_anch).sub(_v3);
    _grip.lerp(_v7, dEase);

    // ---- LEFT ARM: bow arm, 2-bone IK to the grip (live shoulder position)
    this._charOf(b.upArmL.bone, _sh);
    _pole.set(0.55, -0.8, -0.05); // elbow out + down
    this._ikArm(b.upArmL, b.loArmL, _sh, _grip, _pole, aimW,
      this._dirUpL, this._dirLoL, this._lenUpL, this._lenLoL, _hand);
    // wrist: brace hand upright behind the bow
    this._rot(b.handL, X_AXIS, 0.25 * aimW);
    this._curlFingers(this._fingerL, 0.5 * aimW, 0.3 * aimW);

    // string nock implied by the ACHIEVED grip — matches the rendered string
    _grip.copy(_hand).add(_v3);

    // ---- RIGHT ARM: string hand rides the nock at every draw length;
    // wrist sits just behind so the hooked fingers land on the string
    _v7.copy(_grip).addScaledVector(_dA, -0.068);
    this._charOf(b.upArmR.bone, _sh);
    _pole.set(-0.85, -0.35 + 0.5 * drawS, -0.45 * drawS); // out+down -> level-back
    this._ikArm(b.upArmR, b.loArmR, _sh, _v7, _pole, aimW,
      this._dirUpR, this._dirLoR, this._lenUpR, this._lenLoR, null);
    // string fingers: two-finger hook tightening with draw
    this._rot(b.handR, Z_AXIS, -0.2 * aimW);
    this._curlFingers(this._fingerR, (0.45 + 0.3 * drawS) * aimW, 0.25 * aimW);
  }

  /** Live character-space position of a bone (model space, +Z forward). */
  _charOf(bone, out) {
    bone.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(bone.matrixWorld);
    return this.model.worldToLocal(out);
  }

  /**
   * 2-bone arm IK in character space with torso compensation.
   * S = live shoulder, target = wrist goal, pole = elbow hint. Applies the
   * rotations to upE/loE at weight w; writes the achieved (clamped) wrist
   * position to outHand when given.
   */
  _ikArm(upE, loE, S, target, pole, w, dirUp, dirLo, L1, L2, outHand) {
    _v1.subVectors(target, S);
    const dLen = clamp(_v1.length(), 0.05, (L1 + L2) * 0.985);
    _v1.normalize();
    _v2.copy(S).addScaledVector(_v1, dLen); // clamped wrist position
    if (outHand) outHand.copy(_v2);
    const A = Math.acos(clamp((L1 * L1 + dLen * dLen - L2 * L2) / (2 * L1 * dLen), -1, 1));
    _v4.copy(pole).addScaledVector(_v1, -pole.dot(_v1));
    if (_v4.lengthSq() < 1e-6) _v4.set(-_v1.y, _v1.x, 0.01);
    _v4.normalize();
    // upper-arm dir: reach dir rotated toward the pole by the IK angle
    _v5.copy(_v1).multiplyScalar(Math.cos(A)).addScaledVector(_v4, Math.sin(A));
    _v6.copy(S).addScaledVector(_v5, L1);   // elbow position
    _v6.subVectors(_v2, _v6).normalize();   // elbow -> wrist dir
    // apply upper arm (torso-compensated: parent chain carries qTorso)
    _q3.copy(this._qTorso).conjugate();
    _v5.applyQuaternion(_q3);
    _q1.setFromUnitVectors(dirUp, _v5);
    if (w < 0.999) _q1.slerp(Q_IDENT, 1 - w);
    this._rotQ(upE, _q1);
    // lower arm lives in the frame carried by (qTorso * R1): compensate both
    _q2.copy(this._qTorso).multiply(_q1).conjugate();
    _v6.applyQuaternion(_q2);
    _q1.setFromUnitVectors(dirLo, _v6);
    if (w < 0.999) _q1.slerp(Q_IDENT, 1 - w);
    this._rotQ(loE, _q1);
  }

  _curlFingers(list, curl, thumbCurl) {
    if (curl === 0 && thumbCurl === 0) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      _q1.setFromAxisAngle(Z_AXIS, e.isThumb ? thumbCurl : curl);
      e.bone.quaternion.multiply(_q1);
    }
  }

  /* ----------------------- dyn_ chain spring-dampers ---------------------- */

  _springs(dt, t, ph, speed, moveW, runW) {
    const ax = this._accel.x, az = this._accel.z;
    const gaitPump = Math.sin(2 * ph) * (0.35 + 0.9 * runW) * moveW;
    for (let i = 0; i < this._chains.length; i++) {
      const c = this._chains[i];
      // forces: accel lag, velocity drag (hair streams back at speed),
      // gait bounce, yaw swing, faint idle breeze
      const fx = az * c.accel * 9
        + this._lvz * c.accel * 26
        + gaitPump * c.gait * 9
        + Math.sin(t * 1.35 + c.seed) * 0.06;
      const fz = -ax * c.accel * 9
        - this._lvx * c.accel * 26
        - this._yawRate * 0.35
        + Math.sin(t * 1.1 + c.seed * 2.3) * 0.05;
      c.vx += (-c.k * c.ax - c.c * c.vx + fx) * dt;
      c.vz += (-c.k * c.az - c.c * c.vz + fz) * dt;
      c.ax = clamp(c.ax + c.vx * dt, -c.max, c.max);
      c.az = clamp(c.az + c.vz * dt, -c.max, c.max);
      for (let j = 0; j < c.links.length; j++) {
        const w = CHAIN_W[j] ?? 0.08;
        this._rot(c.links[j], X_AXIS, c.ax * w);
        this._rot(c.links[j], Z_AXIS, c.az * w);
      }
    }
  }
}
