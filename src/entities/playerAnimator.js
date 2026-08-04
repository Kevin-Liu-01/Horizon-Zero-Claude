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
const _m4 = new THREE.Matrix4();

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

    /* ---- reset every posed bone to bind (pose is rebuilt, never accumulated) */
    for (let i = 0; i < this._posed.length; i++) {
      const e = this._posed[i];
      e.bone.quaternion.copy(e.bindQ);
    }
    this._qTorso.identity();
    const b = this.b;

    // pelvis translation offsets accumulated in char space (meters)
    let pdx = 0, pdy = 0, pdz = 0;
    // spine totals for head stabilization
    let stPitch = 0, stYaw = 0, stRoll = 0;

    /* =================== LAYER 0: base stance (weight 1) =================== */
    // arms fall from A-pose to relaxed hang; kills the A-pose in every state
    const hangL = -(this._armDropL - 0.16);
    const hangR = (this._armDropR - 0.16);
    this._rot(b.upArmL, Z_AXIS, hangL);
    this._rot(b.upArmR, Z_AXIS, hangR);
    this._rot(b.upArmL, X_AXIS, -0.1);
    this._rot(b.upArmR, X_AXIS, -0.1);
    this._rot(b.loArmL, X_AXIS, -0.28); // slight elbow bend
    this._rot(b.loArmR, X_AXIS, -0.28);
    this._rot(b.clavL, Z_AXIS, -0.05);
    this._rot(b.clavR, Z_AXIS, 0.05);
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

      // legs — phase L = ph, R = ph + PI. thigh fwd = -X rot
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

        const thighA = -swing * c + 0.08 * moveW; // slight forward bias
        const kneeA = (0.1 + (0.62 + 0.6 * runW) * swingBend + stanceLoad) * moveW * crAmp;
        this._rot(thigh, X_AXIS, thighA);
        this._rot(calf, X_AXIS, kneeA);
        // ankle: partially cancel carried chain rotation (foot ~level in stance),
        // plantar-flex push at toe-off just past lph = PI
        const footA = -(thighA * 0.62 + kneeA * 0.55)
          + 0.4 * moveW * Math.pow(Math.max(0, Math.sin(lph - 1.9)), 2);
        this._rot(foot, X_AXIS, footA);
        this._rot(ball, X_AXIS, -0.35 * moveW * Math.pow(Math.max(0, Math.sin(lph - 1.6)), 2));
        // subtle out-toe
        this._rot(thigh, Y_AXIS, s * 0.04 * moveW);
      }

      // pelvis: vertical bob (2x cadence), lateral weight transfer, yaw/roll
      // constant drop keeps the flexed stance leg planted (no floating feet)
      const bobA = (0.02 + 0.05 * runW) * moveW;
      pdy += -bobA * (0.5 - 0.5 * Math.cos(2 * ph - 0.6))
        - (0.05 * midW + 0.035 * runW) * moveW;
      pdx += Math.cos(ph + 0.4) * 0.021 * moveW * (1 - runW * 0.75);
      this._rotT(b.pelvis, Y_AXIS, -cph * (0.075 + 0.05 * runW) * moveW);
      this._rotT(b.pelvis, Z_AXIS, sph * 0.045 * moveW * (1 - runW * 0.4));

      // spine: counter-yaw so shoulders oppose hips, forward lean with speed
      const counter = cph * (0.05 + 0.035 * runW) * moveW;
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
      pdy += -0.31 * deep;
      pdz += -0.03 * deep;
      // legs coiled, slightly apart
      this._rot(b.thighL, X_AXIS, -0.88 * deep);
      this._rot(b.thighR, X_AXIS, -0.88 * deep);
      this._rot(b.thighL, Z_AXIS, 0.1 * deep);
      this._rot(b.thighR, Z_AXIS, -0.1 * deep);
      this._rot(b.calfL, X_AXIS, 1.28 * deep);
      this._rot(b.calfR, X_AXIS, 1.28 * deep);
      this._rot(b.footL, X_AXIS, -0.42 * deep);
      this._rot(b.footR, X_AXIS, -0.42 * deep);
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
    if (aimW > 0.01) this._aimLayer(aimW, this._drawS, p);

    /* ==================== LAYER 6: dodge tuck (dodgeW) ===================== */
    if (dodgeW > 0.01) {
      const k = this._dodgeT;
      // forward somersault: whole-body roll about the lateral axis
      const roll = smoothstep(k, 0.04, 0.96) * Math.PI * 2;
      const tuck = Math.pow(Math.sin(Math.PI * clamp(k, 0, 1)), 0.75) * dodgeW;
      this._rotT(b.pelvis, X_AXIS, -roll * dodgeW);
      pdy += (-0.42 * Math.sin(Math.PI * k) + 0.06) * dodgeW;
      const curl = 0.5 * tuck;
      this._rotT(b.spine1, X_AXIS, curl * 0.5);
      this._rotT(b.spine2, X_AXIS, curl * 0.5);
      this._rotT(b.spine3, X_AXIS, curl * 0.4);
      this._rot(b.neck1, X_AXIS, curl * 0.5);
      this._rot(b.head, X_AXIS, curl * 0.4);
      // tuck limbs
      this._rot(b.thighL, X_AXIS, -1.5 * tuck);
      this._rot(b.thighR, X_AXIS, -1.35 * tuck);
      this._rot(b.calfL, X_AXIS, 1.9 * tuck);
      this._rot(b.calfR, X_AXIS, 1.75 * tuck);
      this._rot(b.upArmL, X_AXIS, -0.9 * tuck);
      this._rot(b.upArmR, X_AXIS, -0.9 * tuck);
      this._rot(b.loArmL, X_AXIS, -1.3 * tuck);
      this._rot(b.loArmR, X_AXIS, -1.3 * tuck);
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
    _v2.set(pdx, pdy, pdz).applyMatrix3(this._pelvisM3);
    pe.bone.position.copy(pe.bindP).add(_v2);

    /* ------------------ secondary motion: dyn_ spring chains --------------- */
    this._springs(dt, t, ph, speed, moveW, runW);
  }

  /* ----------------------------- aim overlay ------------------------------ */

  _aimLayer(aimW, drawS, p) {
    const b = this.b;
    const pitch = clamp(p.camPitch ?? 0, -0.6, 1.05);

    // archer stance: chest opens right, spine carries part of the aim pitch
    this._rotT(b.spine1, Y_AXIS, -0.07 * aimW);
    this._rotT(b.spine2, Y_AXIS, -0.08 * aimW);
    this._rotT(b.spine3, Y_AXIS, -0.08 * aimW);
    this._rotT(b.spine2, X_AXIS, pitch * 0.14 * aimW);
    this._rotT(b.spine3, X_AXIS, pitch * 0.15 * aimW);
    this._rotT(b.spine4, X_AXIS, pitch * 0.13 * aimW);
    // slight brace lean into the bow
    this._rotT(b.spine2, Z_AXIS, 0.05 * aimW);

    // head: look along the aim ray, counter the chest twist
    this._rot(b.neck1, Y_AXIS, 0.1 * aimW);
    this._rot(b.head, Y_AXIS, 0.13 * aimW);
    this._rot(b.neck1, X_AXIS, pitch * 0.2 * aimW);
    this._rot(b.head, X_AXIS, pitch * 0.28 * aimW);

    // torso-compensated aim direction (so the arm tracks the camera exactly)
    _q3.copy(this._qTorso).conjugate();
    const sp = Math.sin(pitch), cp = Math.cos(pitch);

    // ---- LEFT ARM: bow arm, extended along aim ray
    _v3.set(0.12, -sp, cp).normalize().applyQuaternion(_q3);
    _q1.setFromUnitVectors(this._dirUpL, _v3);
    if (aimW < 0.999) _q1.slerp(Q_IDENT, 1 - aimW);
    this._rotQ(b.upArmL, _q1);
    // straighten the elbow (bind has a bend); keep a hint of flex
    _q1.setFromUnitVectors(this._dirLoL, this._dirUpL);
    _q1.slerp(Q_IDENT, 1 - aimW * 0.9);
    this._rotQ(b.loArmL, _q1);
    // wrist: brace hand upright behind the bow
    this._rot(b.handL, X_AXIS, 0.25 * aimW);
    this._curlFingers(this._fingerL, 0.5 * aimW, 0.3 * aimW);

    // ---- RIGHT ARM: string hand, 2-bone reach from nock point to cheek.
    // All positions/directions below live in character space; the applied
    // rotations are compensated by qTorso so the reach lands where intended.
    const S = this._charPos.upArmR;                       // shoulder
    const L1 = this._lenUpR, L2 = this._lenLoR;
    _v3.set(
      0.02 - 0.12 * drawS,
      1.38 + 0.05 * drawS - S.y,
      0.44 - 0.42 * drawS,
    ).applyAxisAngle(X_AXIS, pitch * 0.8).add(S);         // target (pitches with aim)
    _v1.subVectors(_v3, S);                               // reach vector
    const dLen = clamp(_v1.length(), 0.22, (L1 + L2) * 0.98);
    _v1.normalize();
    const A = Math.acos(clamp((L1 * L1 + dLen * dLen - L2 * L2) / (2 * L1 * dLen), -1, 1));
    // pole: elbow out+down while at the string, level+back at full draw
    _v4.set(-0.85, -0.5 + 0.62 * drawS, 0.1 - 0.5 * drawS)
      .addScaledVector(_v1, -_v4.dot(_v1));
    if (_v4.lengthSq() < 1e-6) _v4.set(-1, 0, 0);
    _v4.normalize();
    // upper-arm dir: reach dir rotated toward the pole by the IK angle
    _v5.copy(_v1).multiplyScalar(Math.cos(A)).addScaledVector(_v4, Math.sin(A));
    _v6.copy(S).addScaledVector(_v5, L1);                 // elbow position
    _v6.subVectors(_v3, _v6).normalize();                 // elbow -> target dir
    // apply upper arm (torso-compensated)
    _v2.copy(_v5).applyQuaternion(_q3);
    _q1.setFromUnitVectors(this._dirUpR, _v2);
    if (aimW < 0.999) _q1.slerp(Q_IDENT, 1 - aimW);
    this._rotQ(b.upArmR, _q1);
    // lower arm lives in the frame carried by (qTorso * R1): compensate both
    _q2.copy(this._qTorso).multiply(_q1).conjugate();
    _v6.applyQuaternion(_q2);
    _q1.setFromUnitVectors(this._dirLoR, _v6);
    if (aimW < 0.999) _q1.slerp(Q_IDENT, 1 - aimW);
    this._rotQ(b.loArmR, _q1);
    // string fingers: two-finger hook tightening with draw
    this._rot(b.handR, Z_AXIS, -0.2 * aimW);
    this._curlFingers(this._fingerR, (0.45 + 0.3 * drawS) * aimW, 0.25 * aimW);
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
      // forces: accel lag, gait bounce, yaw swing, faint idle breeze
      const fx = az * c.accel * 9
        + gaitPump * c.gait * 9
        + Math.sin(t * 1.35 + c.seed) * 0.06;
      const fz = -ax * c.accel * 9
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
