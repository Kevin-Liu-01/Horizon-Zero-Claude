import * as THREE from 'three';
import { ClipLibrary } from './anim/clipLibrary.js';
import { LocomotionBlend } from './anim/locomotion.js';

/**
 * PlayerAnimator — Round 4: mocap clip base + procedural overlays.
 *
 * BASE (src/entities/anim/): the CC0 Quaternius Universal Animation Library
 * is retargeted onto the Aloy rig once at boot (ClipLibrary -> Retargeter,
 * char-space bake, clips bind by bone name) and played through a plain
 * THREE.AnimationMixer on this model. LocomotionBlend steers the mixer:
 * idle/walk/jog/sprint + crouch loops phase-locked to player.moveSpeed (feet
 * never skate), backpedal = reverse playback, strafe = leg yaw; roll and death
 * are one-shots scrubbed from the gameplay timeline.
 *
 * OVERLAYS (this file) run AFTER mixer.update and multiply onto the clip-posed
 * local quaternions — the old per-frame reset-to-bind is gone; only bones the
 * clips do not animate (spine_02/04, neck_02, dyn_ chains) are reset:
 *   - locomotion additives: strafe leg-yaw + torso counter, speed/accel lean,
 *     banked turns, plant-turn, stop settle, tall-grass crouch sink
 *   - head look-at toward the camera view / nearest machine (clamped)
 *   - aim/draw layer: torso blade + spine pitch, head-glued cheek anchor,
 *     reach clamp, head-sphere guard, quiver flourish, loose follow-through —
 *     both arms solved with a 2-bone IK that reads LIVE joint positions and
 *     orientations from the clip pose (layers over the aim-walk lower body)
 *   - heavy two-hand carry, hit react, death crumple (fallback when the clip
 *     is missing), weary slump
 *   - per-foot ground conform: only feet the clips flag as planted (stance
 *     bits baked per frame) clamp the pelvis; sunk feet are lifted
 *   - dyn_ hair/cloth spring chains (unchanged)
 *
 * Rotation conventions: `_rot` rotates about a CHARACTER-space axis using the
 * bone's BIND char orientation (cheap; exact for small additive offsets),
 * `_rotL` / `_rotQL` use the bone's LIVE char orientation (exact absolute
 * solves: IK, look-at, leg yaw). Char space = model root frame, +Z forward.
 */

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Q_IDENT = new THREE.Quaternion();

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
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
const _el = new THREE.Vector3();   // live elbow position
const _wr = new THREE.Vector3();   // live wrist position
const _grip = new THREE.Vector3(); // bow grip / nock scratch
const _pole = new THREE.Vector3(); // IK elbow pole
const _hand = new THREE.Vector3(); // achieved IK hand position
const _look = new THREE.Vector3(); // look-at target direction
const _nrm = new THREE.Vector3();  // terrain normal
const _lkH = new THREE.Vector3();  // foot lock: hip joint (char)
const _lkK = new THREE.Vector3();  // foot lock: knee joint (char)
const _lkA = new THREE.Vector3();  // foot lock: ankle (char)
const _lkT = new THREE.Vector3();  // foot lock: ankle target (char)
const _lkD = new THREE.Vector3();  // foot lock: correction (char)
const _lkAx = new THREE.Vector3(); // foot lock: knee bend axis (char)
const _lkQ0 = new THREE.Quaternion();
const _lkQ1 = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();

// (ball- and ankle-bone rest heights are MEASURED off the bind pose in the
// constructor — assets.js grounds Aloy with a -55mm yOffset so the skirt
// tassels do not float her, which leaves ball_l at y = -0.007, not at 0)
// max horizontal correction the foot lock will hold before it re-anchors (m)
const MAX_LOCK = 0.3;

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
  { links: ['dyn_hairBackMain_01_0145', 'dyn_hairBackMain_02_0146', 'dyn_hairBackMain_03_0147', 'dyn_hairBackMain_04_0148', 'dyn_hairBackMain_05_0149', 'dyn_hairBackMain_06_0150'], k: 42, c: 7.5, accel: 0.055, gait: 0.11, max: 0.58, seed: 0.0 },
  { links: ['dyn_hairBackBraid_01_l_0151', 'dyn_hairBackBraid_02_l_0152', 'dyn_hairBackBraid_03_l_0153', 'dyn_hairBackBraid_04_l_0154'], k: 50, c: 8, accel: 0.05, gait: 0.09, max: 0.52, seed: 1.7 },
  { links: ['dyn_hairBackBraid_01_r_0155', 'dyn_hairBackBraid_02_r_0156', 'dyn_hairBackBraid_03_r_0157', 'dyn_hairBackBraid_04_r_0158'], k: 48, c: 8, accel: 0.05, gait: 0.09, max: 0.52, seed: 3.9 },
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
    this._invModelQ = new THREE.Quaternion();

    // entry: bone + bind local quat/pos + bind char-space quat (and inverse)
    this._entries = {};
    const makeEntry = (name) => {
      if (!name) return null;
      const bone = this.bones[name];
      if (!bone) return null;
      if (this._entries[name]) return this._entries[name];
      const W = new THREE.Quaternion();
      bone.getWorldQuaternion(W).premultiply(invModelQ);
      const e = {
        name, bone,
        bindQ: bone.quaternion.clone(),
        bindP: bone.position.clone(),
        W,
        invW: W.clone().invert(),
        clip: false, // set below: animated by the baked clips?
      };
      this._entries[name] = e;
      return e;
    };

    this.b = {};
    for (const [short, name] of Object.entries(KEY)) this.b[short] = makeEntry(name);

    // fingers: curl by local Z (rig curls fingers about local +Z on both hands)
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

    // arm segment lengths (char space, constant) + bind directions for the
    // procedural fallback when the clip pack failed to load
    const charPos = (short) => this.b[short].bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(invModelM);
    const P = {};
    for (const s of ['upArmL', 'loArmL', 'handL', 'upArmR', 'loArmR', 'handR']) P[s] = charPos(s);
    this._lenUpL = P.upArmL.distanceTo(P.loArmL);
    this._lenLoL = P.loArmL.distanceTo(P.handL);
    this._lenUpR = P.upArmR.distanceTo(P.loArmR);
    this._lenLoR = P.loArmR.distanceTo(P.handR);
    // ground-contact rest heights: where the ball (toe) and ankle (heel) bones
    // sit relative to the model's ground plane at bind. Hardcoding 0.005 for
    // the ball floated her a centimetre — the rig's ball bone is BELOW y=0.
    this._ballRest = charPos('ballL').y;
    this._ankRest = charPos('footL').y;
    this._pelvisRestY = charPos('pelvis').y;   // standing hip height (char space)

    // pelvis translation basis: char-space offset -> pelvis-parent local
    const pelvisParent = this.b.pelvis.bone.parent;
    pelvisParent.updateWorldMatrix(true, false);
    this._pelvisM3 = new THREE.Matrix3().setFromMatrix4(
      _m4.copy(pelvisParent.matrixWorld).invert(),
    );

    /* ------------------------- clip base (mixer) ------------------------- */
    this.lib = ClipLibrary.shared(ctx.assets);
    this.mixer = null;
    this.loco = null;
    if (this.lib) {
      this.mixer = new THREE.AnimationMixer(model);
      this.loco = new LocomotionBlend(this.mixer, this.lib);
      for (const name of this.lib.animatedNames) if (this._entries[name]) this._entries[name].clip = true;
      const rep = this.lib.report();
      console.info(`[animator] clip base: ${Object.keys(rep.clips).length} clips baked in ${rep.bakeMs}ms`, rep.clips);
    } else {
      console.warn('[animator] no clip library — running the procedural fallback');
    }
    // bones the mixer never writes must be reset every frame (overlays would
    // otherwise accumulate on them)
    this._resetList = Object.values(this._entries).filter((e) => !e.clip);
    // bones the mixer DOES write keep a copy of the pure clip pose: three's
    // PropertyMixer skips setValue when a blended value is unchanged from the
    // previous frame (held roll/death frames), which would otherwise leave
    // last frame's overlay in place for this frame's overlay to stack onto
    this._clipList = Object.values(this._entries).filter((e) => e.clip);
    for (const e of this._clipList) e.clipQ = e.bindQ.clone();
    this._clipP = this.b.pelvis.bindP.clone();
    const roll = this.lib?.get('roll');
    this.rollDuration = roll?.info.duration ?? 0;
    this._rollProg = roll?.root?.rootProgress ?? null;

    /* ------------------------------ state ------------------------------- */
    this._moveW = 0; this._runW = 0; this._crouchW = 0; this._aimW = 0;
    this._dodgeW = 0; this._deadW = 0; this._drawS = 0;
    this._hit = 0;
    this._prevVel = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this._prevHeading = 0;
    this._yawRate = 0;
    this._grnd = 0;                 // ground-conform pelvis offset (damped)
    this._locks = [{ on: false, x: 0, z: 0, w: 0, cx: 0, cz: 0 },
                   { on: false, x: 0, z: 0, w: 0, cx: 0, cz: 0 }];
    this._stL = 1; this._stR = 1;   // stance flags used by the last conform
    this._lvx = 0; this._lvz = 0;   // local (char-space) velocity, damped
    this._mx = 0; this._mz = 1;     // local move direction, damped
    this._boneWorldCache = {};

    this._breathPh = Math.random();          // breath cycle 0..1 (asymmetric)
    this._brNow = 0.4; this._brLag = 0.4;    // lung fill + lagged copy
    this._puff = 0;                          // exertion 0..1 (winded after sprint)
    this._quiverT = 1; this._prevRawDraw = 0; // nock flourish timeline
    this._holdT = 0;                         // full-draw hold time -> tremble
    this._plantT = 1;                        // plant-and-turn overlay timeline
    this._stableX = 0; this._stableZ = 1;    // recent stable travel direction
    this._settleT = 1; this._prevSpd = 0; this._recentSpd = 0; // stop settle
    this._settleAmp = 0;
    this._looseT = 1; this._looseDraw = 0;   // arrow-release follow-through
    this._carryW = 0;                        // heavy two-hand carry weight
    this._dieT = 0; this._wasDead = false;   // death timeline
    this._leanAcc = 0; this._bank = 0;       // smoothed accel lean / turn bank
    this._lookYaw = 0; this._lookPitch = 0;  // damped head look-at angles
    this._lookW = 0;

    ctx.events?.on('player-hurt', () => { this._hit = 1; });
    ctx.events?.on('arrow-fired', () => {
      if (!this.ctx.combat?.activeWeapon?.heavy) {
        this._looseT = 0;
        this._looseDraw = this._drawS;
      }
    });
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

  /** Feet world positions + planted flags (gates: A13-no-skate). */
  debugFeet() {
    const out = [];
    for (const [short, planted] of [['ballL', this._stL > 0.5], ['ballR', this._stR > 0.5]]) {
      const e = this.b[short];
      if (!e) continue;
      e.bone.updateWorldMatrix(true, false);
      _v1.setFromMatrixPosition(e.bone.matrixWorld);
      out.push({ name: e.name, world: { x: _v1.x, y: _v1.y, z: _v1.z }, planted });
    }
    return out;
  }

  /** Clip name + weight of the dominant mixer action (gates: A12-clip-driven). */
  dominantAction() { return this.loco?.dominantAction() ?? null; }

  /** Baked-clip report: nominal speeds, cycle distances, phase offsets. */
  clipReport() { return this.lib?.report() ?? null; }

  /**
   * Fraction (0..1) of the roll's root-motion travel completed at normalized
   * clip time k — the dodge velocity curve. null when no roll clip is baked.
   */
  rollProgress(k) {
    const P = this._rollProg;
    if (!P) return null;
    const x = clamp(k, 0, 1) * (P.length - 1);
    const i = Math.floor(x), f = x - i;
    return i >= P.length - 1 ? P[P.length - 1] : P[i] * (1 - f) + P[i + 1] * f;
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

  // rotate bone about a character-space axis (bind char orientation; cheap)
  _rot(e, axis, angle) {
    if (!e || angle === 0) return;
    _q1.setFromAxisAngle(axis, angle);
    _q2.copy(e.invW).multiply(_q1).multiply(e.W);
    e.bone.quaternion.multiply(_q2);
  }

  // apply an arbitrary char-space quaternion rotation (bind char orientation)
  _rotQ(e, q) {
    if (!e) return;
    _q2.copy(e.invW).multiply(q).multiply(e.W);
    e.bone.quaternion.multiply(_q2);
  }

  /** Live char-space orientation of a bone (clip pose + overlays so far). */
  _liveW(bone, out) {
    bone.getWorldQuaternion(out);
    return out.premultiply(this._invModelQ);
  }

  // rotate about a char-space axis using the bone's LIVE orientation (exact)
  _rotL(e, axis, angle) {
    if (!e || angle === 0) return;
    _q1.setFromAxisAngle(axis, angle);
    this._liveW(e.bone, _q4);
    _q2.copy(_q4).invert().multiply(_q1).multiply(_q4);
    e.bone.quaternion.multiply(_q2);
  }

  // apply a char-space quaternion using the bone's LIVE orientation (exact)
  _rotQL(e, q) {
    if (!e) return;
    this._liveW(e.bone, _q4);
    _q2.copy(_q4).invert().multiply(q).multiply(_q4);
    e.bone.quaternion.multiply(_q2);
  }

  /** Live character-space position of a bone (model space, +Z forward). */
  _charOf(bone, out) {
    bone.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(bone.matrixWorld);
    return this.model.worldToLocal(out);
  }

  /* ------------------------------- update -------------------------------- */

  update(dt, t) {
    const p = this.ctx.player;
    if (!p || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this._invModelQ.copy(this.model.quaternion).invert();

    /* ---- read state, smooth layer weights ---- */
    const speed = p.moveSpeed ?? 0;
    const draw = this.ctx.combat?.drawStrength ?? p.drawStrength ?? 0;
    const dead = this.ctx.state === 'dead';

    this._moveW = damp(this._moveW, smoothstep(speed, 0.18, 1.1), 12, dt);
    this._runW = damp(this._runW, smoothstep(speed, 4.9, 7.9), 9, dt);
    this._crouchW = damp(this._crouchW, p.crouching ? 1 : 0, 10, dt);
    this._aimW = damp(this._aimW, p.aiming && !dead ? 1 : 0, 13, dt);
    this._deadW = damp(this._deadW, dead ? 1 : 0, dead ? 12 : 10, dt);
    this._drawS = damp(this._drawS, clamp(draw, 0, 1), 16, dt);
    this._hit = damp(this._hit, 0, 9, dt);

    if (dead && !this._wasDead) this._dieT = 0;
    this._wasDead = dead;
    if (dead) this._dieT += dt;

    // quiver-reach flourish: string hand dips to the hip quiver at draw start
    if (draw > 0.02 && this._prevRawDraw <= 0.02 && p.aiming && !dead) this._quiverT = 0;
    this._prevRawDraw = draw;
    this._quiverT = Math.min(this._quiverT + dt / 0.13, 1);
    this._looseT = Math.min(this._looseT + dt / 0.15, 1);

    // heavy pickup weapon (disc launcher): two-hand waist carry replaces the
    // bow aim overlay entirely while it is held
    const heavy = !!this.ctx.combat?.activeWeapon?.heavy && !dead;
    this._carryW = damp(this._carryW, heavy ? 1 : 0, 10, dt);

    // draw-hold fatigue: arms tremble after ~3s at full draw
    if (p.aiming && this._drawS > 0.92) this._holdT += dt;
    else this._holdT = Math.max(0, this._holdT - dt * 4);

    const dodgeK = p.dodging ? clamp(p.dodgeK ?? 0, 0, 1) : 1;
    this._dodgeW = damp(this._dodgeW, p.dodging ? 1 : 0, p.dodging ? 30 : 10, dt);

    /* ---- breathing (drives aim sway + winded overlay) ---- */
    const puffT = this._runW * 0.9 + this._moveW * 0.1;
    this._puff = damp(this._puff, puffT, puffT > this._puff ? 0.45 : 0.14, dt);
    this._breathPh = (this._breathPh + dt * (0.21 + 0.15 * this._puff)) % 1;
    const bu = this._breathPh;
    let brF;
    if (bu < 0.38) { const k = bu / 0.38; brF = k * k * (3 - 2 * k); }
    else if (bu < 0.9) { const k = (bu - 0.38) / 0.52; brF = 1 - k * k * (2.4 - 1.4 * k); }
    else brF = 0;
    this._brNow = damp(this._brNow, brF, 24, dt);
    this._brLag = damp(this._brLag, this._brNow, 8, dt);

    const moveW = this._moveW * (1 - this._deadW);
    const runW = this._runW;
    const crouchW = this._crouchW * (1 - this._deadW);
    const dodgeW = this._dodgeW;
    const carryW = this._carryW * (1 - dodgeW) * (1 - this._deadW);
    const aimW = this._aimW * (1 - this._dodgeW) * (1 - this._deadW) * (1 - carryW);
    const idleW = (1 - moveW) * (1 - this._deadW);

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
    const moveAngle = Math.atan2(this._mx, this._mz);

    /* ---- plant-and-turn: travel direction reverses >120deg at speed ---- */
    const wsp = Math.hypot(vwx, vwz);
    if (wsp > 2.2) {
      const ivx = vwx / wsp, ivz = vwz / wsp;
      if (ivx * this._stableX + ivz * this._stableZ < -0.5
          && this._plantT >= 1 && this._moveW > 0.2 && this._recentSpd > 2.6
          && !p.dodging && this._aimW < 0.5) {
        this._plantT = 0;
        this._stableX = ivx; this._stableZ = ivz;
      } else {
        this._stableX = damp(this._stableX, ivx, 4, dt);
        this._stableZ = damp(this._stableZ, ivz, 4, dt);
      }
    }
    this._plantT = Math.min(this._plantT + dt / 0.34, 1);

    /* ---- stop settle: coming off a jog/sprint to a stand ---- */
    this._recentSpd = Math.max(this._recentSpd - dt * 3.5, speed);
    if (speed < 1.4 && this._prevSpd >= 1.4 && this._recentSpd > 2.6
        && this._settleT >= 1 && !p.dodging && !dead) {
      this._settleT = 0;
      this._settleAmp = clamp(this._recentSpd / 8.2, 0.4, 1.15);
    }
    this._prevSpd = speed;
    this._settleT = Math.min(this._settleT + dt / 0.5, 1);

    /* ===================== BASE: clip pose via the mixer ===================== */
    for (let i = 0; i < this._resetList.length; i++) {
      const e = this._resetList[i];
      e.bone.quaternion.copy(e.bindQ);
    }
    const b = this.b;
    // feet positions carry ground-clamp offsets the mixer never rewrites
    if (b.footL) b.footL.bone.position.copy(b.footL.bindP);
    if (b.footR) b.footR.bone.position.copy(b.footR.bindP);

    if (this.loco) {
      for (let i = 0; i < this._clipList.length; i++) {
        const e = this._clipList[i];
        e.bone.quaternion.copy(e.clipQ);
      }
      b.pelvis.bone.position.copy(this._clipP);
      this.loco.update(dt, {
        speed, moveAngle, crouch: p.crouching && !dead, dodging: p.dodging, dodgeK,
        dead, dieT: this._dieT, aimW,
      });
      this.mixer.update(dt);
      for (let i = 0; i < this._clipList.length; i++) {
        const e = this._clipList[i];
        e.clipQ.copy(e.bone.quaternion);
      }
      this._clipP.copy(b.pelvis.bone.position);
    } else {
      this._fallbackBase(aimW, carryW);
    }
    const ph = (this.loco?.phase ?? 0) * Math.PI * 2;

    // pelvis translation offsets accumulated in char space (meters)
    let pdx = 0, pdy = 0, pdz = 0;

    // Roll_RM is a DIVE roll — its hips peak ~0.28m above standing, which reads
    // as a swan dive rather than HZD's low tap-dodge. Flatten the leap (bounded)
    // while leaving the clip's tuck, shoulder roll and recovery alone.
    if (this._dodgeW > 0.02 && this.loco?.actions.roll) {
      this._charOf(b.pelvis.bone, _v1);
      const rise = _v1.y - this._pelvisRestY;
      if (rise > 0) pdy -= Math.min(rise * 0.6, 0.24) * this._dodgeW;
    }

    /* ================ OVERLAY 1: locomotion additives ================ */
    if (this.loco) {
      // strafe / backpedal: legs face the travel direction, torso counters
      // so chest + shoulders keep the heading (aim-walk lower body banks
      // while the upper body stays on target)
      const ly = this.loco.legYaw * (1 - dodgeW) * (1 - this._deadW);
      if (Math.abs(ly) > 1e-3) {
        this._rotL(b.pelvis, Y_AXIS, ly);
        this._rotL(b.spine1, Y_AXIS, -ly * 0.45);
        this._rotL(b.spine3, Y_AXIS, -ly * 0.55);
      }
    }
    if (moveW > 0.01) {
      const midW = smoothstep(speed, 1.4, 4.4);
      // push-off lean at start / brake lean at stop (smoothed acceleration)
      this._leanAcc = damp(this._leanAcc, clamp(this._accel.z * 0.03, -0.24, 0.26), 9, dt);
      // reference/run-side.jpg: sprint lean deeper than the source clip
      const lean = (0.02 * midW + 0.11 * runW) * moveW * (1 - crouchW)
        + this._leanAcc * clamp(moveW * 3, 0, 1) * (1 - dodgeW);
      const hinge = lean * 0.45;
      this._rot(b.pelvis, X_AXIS, hinge);
      this._rot(b.thighL, X_AXIS, -hinge * 0.9);
      this._rot(b.thighR, X_AXIS, -hinge * 0.9);
      this._rot(b.spine1, X_AXIS, lean * 0.3);
      this._rot(b.spine2, X_AXIS, lean * 0.3);
      this._rot(b.spine3, X_AXIS, lean * 0.25);
      this._rot(b.neck1, X_AXIS, -lean * 0.45);
      this._rot(b.head, X_AXIS, -lean * 0.4);
      // banked turn: pelvis + whole spine roll into the yaw rate, more at speed
      const spd01 = smoothstep(speed, 1.5, 8);
      this._bank = damp(this._bank,
        clamp(-this._yawRate * (0.05 + 0.13 * spd01) - this._accel.x * 0.016, -0.28, 0.28) * moveW,
        10, dt);
      const bank = this._bank * (1 - dodgeW);
      this._rot(b.pelvis, Z_AXIS, bank * 0.3);
      this._rot(b.spine1, Z_AXIS, bank * 0.3);
      this._rot(b.spine2, Z_AXIS, bank * 0.35);
      this._rot(b.spine3, Z_AXIS, bank * 0.25);
      this._rot(b.head, Z_AXIS, -bank * 0.9); // head level on the horizon
    } else {
      this._bank = damp(this._bank, 0, 10, dt);
      this._leanAcc = damp(this._leanAcc, 0, 9, dt);
    }

    // tall grass: sink the stealth crouch a little deeper
    if (crouchW > 0.01 && p.inTallGrass) {
      const deep = crouchW * 0.12;
      pdy += -0.5 * deep;
      this._rot(b.thighL, X_AXIS, -0.6 * deep);
      this._rot(b.thighR, X_AXIS, -0.6 * deep);
      this._rot(b.calfL, X_AXIS, 1.0 * deep);
      this._rot(b.calfR, X_AXIS, 1.0 * deep);
      this._rot(b.footL, X_AXIS, -0.4 * deep);
      this._rot(b.footR, X_AXIS, -0.4 * deep);
      this._rot(b.spine2, X_AXIS, 0.25 * deep);
    }

    // plant-and-turn: on a >120deg reversal she sinks, plants wide and drives
    // out of the turn instead of pivoting like a turret (no turn clips in pack)
    if (this._plantT < 1) {
      const pw = Math.sin(Math.PI * this._plantT) * (1 - dodgeW) * (1 - this._deadW) * 0.7;
      pdy += -0.12 * pw;
      this._rot(b.thighL, X_AXIS, -0.2 * pw);
      this._rot(b.thighR, X_AXIS, -0.28 * pw);
      this._rot(b.calfL, X_AXIS, 0.5 * pw);
      this._rot(b.calfR, X_AXIS, 0.4 * pw);
      this._rot(b.spine2, X_AXIS, 0.18 * pw);
      this._rot(b.spine3, X_AXIS, 0.12 * pw);
      const armF = pw * (1 - aimW);
      this._rot(b.upArmL, Z_AXIS, 0.22 * armF);
      this._rot(b.upArmR, Z_AXIS, -0.22 * armF);
    }
    // stop settle: braking dip scaled by how fast she was going
    if (this._settleT < 1) {
      const gate = (1 - dodgeW) * (1 - this._deadW) * (1 - moveW * 0.35);
      const amp = (this._settleAmp || 0.5) * 0.65;
      const sw = Math.sin(Math.PI * this._settleT) * gate * amp;
      pdy += -0.16 * sw;
      this._rot(b.thighR, X_AXIS, -0.4 * sw);
      this._rot(b.calfR, X_AXIS, 0.6 * sw);
      this._rot(b.calfL, X_AXIS, 0.3 * sw);
      this._rot(b.footR, X_AXIS, -0.2 * sw);
      const brk = Math.sin(Math.PI * clamp(this._settleT * 1.7, 0, 1)) * gate * amp;
      this._rot(b.spine1, X_AXIS, -0.12 * brk);
      this._rot(b.spine2, X_AXIS, -0.14 * brk + 0.08 * sw);
      this._rot(b.neck1, X_AXIS, 0.12 * brk);
      const armS = (brk * 0.5 + sw * 0.3) * (1 - aimW) * (1 - carryW);
      this._rot(b.upArmL, Z_AXIS, 0.2 * armS);
      this._rot(b.upArmR, Z_AXIS, -0.2 * armS);
    }

    /* ================ OVERLAY 2: winded breathing after a sprint ================ */
    if (idleW > 0.01) {
      const puffW = smoothstep(this._puff, 0.45, 0.9) * idleW * (1 - aimW) * (1 - crouchW);
      if (puffW > 0.02) {
        const br = (this._brNow - 0.42) * 2;
        this._rot(b.spine2, X_AXIS, (0.08 + br * 0.05) * puffW);
        this._rot(b.spine4, X_AXIS, br * 0.04 * puffW);
        this._rot(b.clavL, Z_AXIS, -br * 0.04 * puffW);
        this._rot(b.clavR, Z_AXIS, br * 0.04 * puffW);
        this._rot(b.head, X_AXIS, -(0.08 + br * 0.03) * puffW);
      }
    }

    /* ================ OVERLAY 3: head look-at (non-aim) ================ */
    this._lookLayer((1 - aimW) * (1 - dodgeW) * (1 - this._deadW) * (1 - carryW * 0.5), p, dt);

    /* ================ OVERLAY 4: aim/draw + heavy carry ================ */
    if (aimW > 0.01) this._aimLayer(aimW, this._drawS, p, moveW, t);
    if (carryW > 0.01) this._carryLayer(carryW, p, t);

    /* ================ OVERLAY 5: hit react / death / weary ================ */
    if (this._hit > 0.02) {
      const h = this._hit * (1 - this._deadW);
      this._rot(b.spine2, X_AXIS, -0.14 * h);
      this._rot(b.spine3, X_AXIS, -0.1 * h);
      this._rot(b.head, X_AXIS, -0.16 * h);
      this._rot(b.spine2, Z_AXIS, 0.06 * h);
    }
    if (this._deadW > 0.01 && !this.loco?.actions.death) pdy += this._deathFallback();
    const weary = clamp(1 - (p.health ?? 100) / 30, 0, 1) * (1 - this._deadW) * (1 - aimW);
    if (weary > 0.02) {
      this._rot(b.spine2, X_AXIS, 0.05 * weary);
      this._rot(b.head, X_AXIS, 0.06 * weary);
    }

    /* ------------------- pelvis translation offset (post-mixer, additive) ---- */
    const pe = b.pelvis;
    _v2.set(pdx, pdy + this._grnd, pdz).applyMatrix3(this._pelvisM3);
    pe.bone.position.add(_v2);

    /* --------- ground conform: pelvis clamp + per-foot terrain clamp ------- */
    this._groundConform(dt, moveW, dodgeW, pdx, pdy, pdz);

    /* ------------------ secondary motion: dyn_ spring chains --------------- */
    this._springs(dt, t, ph, speed, moveW, runW);
  }

  /* -------------------- procedural fallback (no clip pack) ---------------- */

  _fallbackBase(aimW, carryW) {
    for (const e of Object.values(this._entries)) e.bone.quaternion.copy(e.bindQ);
    const hangW = 1 - Math.max(aimW, carryW);
    if (hangW > 0.001) {
      _grip.set(0.24, 0.86, 0.06); _pole.set(0.35, -0.5, -0.85);
      this._ikArm('l', _grip, _pole, hangW, null);
      _grip.set(-0.24, 0.86, 0.06); _pole.set(-0.35, -0.5, -0.85);
      this._ikArm('r', _grip, _pole, hangW, null);
    }
    this._curlFingers(this._fingerL, 0.32, 0.15);
    this._curlFingers(this._fingerR, 0.32, 0.15);
  }

  /** Procedural crumple (knees buckle -> fold -> keel over); returns pelvis drop. */
  _deathFallback() {
    const b = this.b;
    const d = this._deadW;
    const k1 = smoothstep(this._dieT, 0.0, 0.28);
    const k2 = smoothstep(this._dieT, 0.18, 0.6);
    const k3 = smoothstep(this._dieT, 0.5, 1.05);
    this._rot(b.thighL, X_AXIS, -1.3 * k1 * d);
    this._rot(b.thighR, X_AXIS, (-0.95 * k1 - 0.2 * k3) * d);
    this._rot(b.calfL, X_AXIS, 2.3 * k1 * d);
    this._rot(b.calfR, X_AXIS, (1.9 * k1 + 0.2 * k3) * d);
    const slump = 0.72 * k2 * d;
    this._rot(b.spine1, X_AXIS, slump * 0.35);
    this._rot(b.spine2, X_AXIS, slump * 0.4);
    this._rot(b.spine3, X_AXIS, slump * 0.35);
    this._rot(b.pelvis, Z_AXIS, -0.55 * k3 * d);
    this._rot(b.neck1, X_AXIS, 0.32 * k2 * d);
    this._rot(b.head, X_AXIS, 0.42 * k2 * d);
    this._rot(b.upArmL, Z_AXIS, (0.15 * k2 + 0.18 * k3) * d);
    this._rot(b.upArmR, Z_AXIS, (-0.15 * k2 - 0.25 * k3) * d);
    return (-0.5 * k1 - 0.3 * k3) * d;
  }

  /* ----------------------------- head look-at ----------------------------- */

  /**
   * Eyes go where the player looks: the head tracks the camera view direction
   * (clamped, faded out when the camera stares into her face) and swings to
   * the nearest machine when one is close. Applied as an absolute solve on
   * the live clip pose at weight w so the clip's own head motion survives.
   */
  _lookLayer(w, p, dt) {
    const b = this.b;
    if (!b.head || !b.neck1) return;
    const cam = this.ctx.camera;
    let yaw = 0, pitch = 0, want = 0;
    if (cam && w > 0.01) {
      cam.getWorldDirection(_look).applyQuaternion(this._invModelQ);
      // nearest live machine within 14m pulls the gaze
      const list = this.ctx.machines?.list;
      if (list && list.length) {
        this._charOf(b.head.bone, _v1);
        let best = null, bd = 14 * 14;
        for (let i = 0; i < list.length; i++) {
          const m = list[i];
          if (!m.alive || !m.position) continue;
          const d = m.position.distanceToSquared(p.position);
          if (d < bd) { bd = d; best = m; }
        }
        if (best) {
          _v2.copy(best.position); _v2.y += 1.2;
          this.model.worldToLocal(_v2).sub(_v1).normalize();
          const near = 1 - smoothstep(Math.sqrt(bd), 6, 14);
          _look.lerp(_v2, 0.75 * near).normalize();
        }
      }
      yaw = Math.atan2(_look.x, _look.z);
      pitch = Math.asin(clamp(_look.y, -1, 1));
      // don't crane round when the camera looks at her from the front
      want = w * (1 - smoothstep(Math.abs(yaw), 1.15, 1.7));
      const yawMax = 0.95 - 0.45 * this._runW;
      yaw = clamp(yaw, -yawMax, yawMax);
      pitch = clamp(pitch, -0.4, 0.4);
    }
    this._lookYaw = damp(this._lookYaw, yaw, 5, dt);
    this._lookPitch = damp(this._lookPitch, pitch, 5, dt);
    this._lookW = damp(this._lookW, want, 6, dt);
    const lw = this._lookW * 0.85;
    if (lw < 0.005) return;
    const cp = Math.cos(this._lookPitch);
    _look.set(Math.sin(this._lookYaw) * cp, Math.sin(this._lookPitch), Math.cos(this._lookYaw) * cp);
    this._lookAt(_look, lw);
  }

  /** Rotate neck (35%) + head (65%) so the head's live forward meets dir. */
  _lookAt(dir, w) {
    const b = this.b;
    // live head forward = live orientation * bind-frame forward (+Z in char space)
    this._liveW(b.head.bone, _q4);
    _q2.copy(_q4).multiply(b.head.invW);
    _v1.set(0, 0, 1).applyQuaternion(_q2);
    _q3.setFromUnitVectors(_v1, dir);
    _q1.copy(_q3).slerp(Q_IDENT, 1 - 0.35 * w);
    this._rotQL(b.neck1, _q1);
    _q1.copy(_q3).slerp(Q_IDENT, 1 - 0.65 * w);
    this._rotQL(b.head, _q1);
  }

  /* -------------------------- ground conforming --------------------------- */

  /**
   * Post-pose pass on the clip pose: samples the terrain under each foot,
   * pitches planted feet to the slope, clamps the pelvis so the planted
   * foot(s) touch the ground (both at idle; only clip-flagged stance feet
   * while moving — airborne jog/sprint frames never yank the hips), then
   * raises any foot whose ball would still sink below the terrain.
   */
  _groundConform(dt, moveW, dodgeW, pdx, pdy, pdz) {
    const terr = this.ctx.terrain;
    const b = this.b;
    if (!terr?.getHeight || !b.ballL || !b.ballR || !b.footL || !b.footR) return;
    const pe = b.pelvis;
    const offW = Math.max(dodgeW, this._deadW);
    const applyPelvis = (g) => {
      _v2.set(0, g - this._grnd, 0).applyMatrix3(this._pelvisM3);
      pe.bone.position.add(_v2);
      this._grnd = g;
    };
    if (offW > 0.25) {
      // rolling / dying: release the conform smoothly and leave the pose alone
      applyPelvis(damp(this._grnd, 0, 8, dt));
      this._stL = 0; this._stR = 0;
      this._locks[0].on = false; this._locks[1].on = false;
      return;
    }

    const sL = this.loco ? this.loco.stanceL : 1;
    const sR = this.loco ? this.loco.stanceR : 1;
    this._stL = sL; this._stR = sR;
    const h = this.ctx.player?.heading ?? 0;
    const shh = Math.sin(h), chh = Math.cos(h);
    let cL = 0, cR = 0;
    for (let side = 0; side < 2; side++) {
      const ball = side === 0 ? b.ballL : b.ballR;
      const foot = side === 0 ? b.footL : b.footR;
      const st = (side === 0 ? sL : sR) * (1 - offW * 4);
      ball.bone.updateWorldMatrix(true, false);
      _v1.setFromMatrixPosition(ball.bone.matrixWorld);
      // planted feet pitch to the terrain slope under them
      if (st > 0.05 && terr.getNormal) {
        terr.getNormal(_v1.x, _v1.z, _nrm);
        const grade = -(_nrm.x * shh + _nrm.z * chh) / Math.max(0.35, _nrm.y);
        this._rot(foot, X_AXIS, clamp(Math.atan(grade), -0.45, 0.45) * st);
        ball.bone.updateWorldMatrix(true, false);
        _v1.setFromMatrixPosition(ball.bone.matrixWorld);
      }
      // horizontal foot lock (see _footLock): pins the ball's world XZ for the
      // whole stance, then re-reads the ball for the height clamps below.
      // Only once the BALL itself is down — at heel strike the foot is still
      // rolling over the heel and the ball is meant to travel forward.
      const ballC = _v1.y - terr.getHeight(_v1.x, _v1.z) - this._ballRest;
      if (this._footLock(side, ballC < 0.05 ? st : 0, _v1, dt)) {
        ball.bone.updateWorldMatrix(true, false);
        _v1.setFromMatrixPosition(ball.bone.matrixWorld);
      }
      // ground clearance of the foot = its LOWEST contact point. Measuring the
      // ball alone reads 8cm of float at heel strike, and the pelvis clamp then
      // drops the hips 8cm on every step to "plant" a foot that is already down
      // on its heel.
      _v3.setFromMatrixPosition(foot.bone.matrixWorld); // ankle (updated above)
      const c = Math.min(
        _v1.y - terr.getHeight(_v1.x, _v1.z) - this._ballRest,
        _v3.y - terr.getHeight(_v3.x, _v3.z) - this._ankRest,
      );
      if (side === 0) cL = c; else cR = c;
    }

    // pelvis clamp: bring the HIGHER planted foot down to the ground (the
    // lower one is lifted by the per-foot clamp below); with no planted foot
    // (flight phase) hold the last offset
    const plL = sL > 0.5, plR = sR > 0.5;
    let want;
    if (plL && plR) want = -Math.max(cL, cR);
    else if (plL) want = -cL;
    else if (plR) want = -cR;
    else want = this._grnd;
    const g0 = this._grnd;
    const rate = 8 + 12 * (1 - moveW);
    const g = clamp(damp(g0, clamp(want, -0.5, 0.5), rate, dt), -0.38, 0.32);
    const dg = g - g0;
    applyPelvis(g);

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

  /**
   * Horizontal foot lock — the reason the feet do not skate.
   *
   * Phase-locking the clips matches the stance foot's AVERAGE speed to the
   * character's, but the source loops' contact velocity is not constant
   * (Sprint_Loop's ball swings 6.3 -> 9.5 m/s inside one 0.1s contact), so the
   * planted ball still slid ~0.18m per stance. On the frame a foot is flagged
   * planted its ball's world XZ is captured; for the rest of that stance the
   * whole leg is rotated about the hip by the small rotation that puts the
   * ANKLE back over the anchor, and the ankle bone is counter-rotated so the
   * sole keeps the orientation the clip (and the slope pitch) gave it — the
   * ball then rides the anchor exactly. Rotating rigidly about the hip cannot
   * over-extend the knee or change any bone length, which a 2-bone leg IK can.
   *
   * The lock releases when the clip lifts the foot, and its anchor SLIDES once
   * the correction would exceed MAX_LOCK (a hard pivot, a frame hitch), so it
   * can neither drag the leg into a split nor snap it back in one frame.
   *
   * @param {number} side 0=left 1=right
   * @param {number} st   stance weight 0..1 for this foot
   * @param {THREE.Vector3} ballW  ball world position this frame
   * @param {number} dt
   * @returns {boolean} true when the pose was changed
   */
  _footLock(side, st, ballW, dt) {
    const L = this._locks[side];
    let ex, ez;
    if (st >= 0.5) {
      // capture on the plant frame: the error starts at zero, so full authority
      // from the first frame cannot pop the leg
      if (!L.on) { L.on = true; L.x = ballW.x; L.z = ballW.z; }
      L.w = 1;
      ex = L.x - ballW.x; ez = L.z - ballW.z;
      // Past MAX_LOCK, SLIDE the anchor up to the limit instead of dropping the
      // lock: releasing it would snap the leg back to the clip pose in one
      // frame. Only a frame hitch or a hard pivot gets here.
      const d2 = ex * ex + ez * ez;
      if (d2 > MAX_LOCK * MAX_LOCK) {
        const k = MAX_LOCK / Math.sqrt(d2);
        ex *= k; ez *= k;
        L.x = ballW.x + ex; L.z = ballW.z + ez;
      }
      L.cx = ex; L.cz = ez;                  // remembered for the release unwind
    } else if (L.on) {
      // foot lifting: unwind the correction we were holding over ~0.12s rather
      // than snapping the leg straight the frame the clip releases it
      L.w -= dt * 8;
      if (L.w <= 0) { L.on = false; L.w = 0; return false; }
      ex = L.cx; ez = L.cz;
    } else return false;
    const w = L.w;
    if (ex * ex + ez * ez < 1e-8 || w < 0.02) return false;
    ex *= w; ez *= w;

    const b = this.b;
    const hip = side === 0 ? b.thighL : b.thighR;
    const knee = side === 0 ? b.calfL : b.calfR;
    const foot = side === 0 ? b.footL : b.footR;
    // char-space: hip joint H, ankle A, wanted ankle T = A + correction
    this._liveW(foot.bone, _lkQ0);                       // sole orientation to keep
    this._charOf(hip.bone, _lkH);
    this._charOf(foot.bone, _lkA);
    _lkD.set(ex, 0, ez).applyQuaternion(this._invModelQ); // world delta -> char
    _lkT.copy(_lkA).add(_lkD);
    let d = _lkA.distanceTo(_lkH);
    const dWant = _lkT.distanceTo(_lkH);
    if (d < 0.05) return false;

    // (1) knee — a horizontal correction on an EXTENDED leg (sprint toe-off,
    // where the trailing leg lies ~40deg off vertical) is mostly RADIAL, and a
    // rigid rotation about the hip can only deliver the tangential part. Change
    // the leg's length instead by flexing the knee about its own current bend
    // axis, which leaves the clip's knee direction alone (a full 2-bone IK
    // would re-plant the knee on the solver's plane and pop it).
    if (Math.abs(dWant - d) > 0.002) {
      this._charOf(knee.bone, _lkK);
      _lkAx.subVectors(_lkK, _lkH).cross(_v6.subVectors(_lkA, _lkK));
      if (_lkAx.lengthSq() < 1e-8) _lkAx.copy(X_AXIS); else _lkAx.normalize();
      const probe = 0.06;
      _q3.setFromAxisAngle(_lkAx, probe);
      this._rotQL(knee, _q3);
      this._charOf(foot.bone, _v6);
      const dProbe = _v6.distanceTo(_lkH);
      // secant step from the probe, then undo the probe itself
      const slope = (dProbe - d) / probe;
      const step = Math.abs(slope) > 0.05 ? clamp((dWant - d) / slope, -0.5, 0.5) : 0;
      _q3.setFromAxisAngle(_lkAx, step - probe);
      this._rotQL(knee, _q3);
      this._charOf(foot.bone, _lkA);
      d = _lkA.distanceTo(_lkH);
    }

    // (2) hip — aim the (re-lengthened) leg at the target
    _v6.subVectors(_lkA, _lkH).divideScalar(Math.max(1e-6, d));
    _v7.copy(_lkT).sub(_lkH).normalize();
    _q3.setFromUnitVectors(_v6, _v7);
    this._rotQL(hip, _q3);

    // (3) foot — put the sole back the way the clip and the slope pitch had it
    this._liveW(foot.bone, _lkQ1);
    _q3.copy(_lkQ0).multiply(_lkQ1.invert());
    this._rotQL(foot, _q3);
    return true;
  }

  /* ----------------------------- aim overlay ------------------------------ */

  _aimLayer(aimW, drawS, p, moveW, t) {
    const b = this.b;
    const pitch = clamp(p.camPitch ?? 0, -0.6, 1.05);
    const stanceW = aimW * (1 - moveW * 0.85);

    // staggered archer stance: hips bladed, left side toward the target
    this._rotL(b.pelvis, Y_AXIS, -0.3 * stanceW);
    this._rot(b.thighL, X_AXIS, -0.05 * stanceW);
    this._rot(b.thighR, X_AXIS, 0.12 * stanceW);
    this._rot(b.calfR, X_AXIS, 0.14 * stanceW);
    this._rot(b.footL, Y_AXIS, 0.2 * stanceW);
    this._rot(b.footR, Y_AXIS, 0.24 * stanceW);

    // chest: bladed toward the target, opening further as the draw builds;
    // spine carries part of the aim pitch
    const chestYaw = -(0.2 + 0.15 * drawS) * aimW;
    const spineYaw = (chestYaw + 0.3 * stanceW) / 3;
    this._rotL(b.spine1, Y_AXIS, spineYaw);
    this._rotL(b.spine2, Y_AXIS, spineYaw);
    this._rotL(b.spine3, Y_AXIS, spineYaw);
    this._rot(b.spine2, X_AXIS, pitch * 0.14 * aimW);
    this._rot(b.spine3, X_AXIS, pitch * 0.15 * aimW);
    this._rot(b.spine4, X_AXIS, pitch * 0.13 * aimW);
    // slight brace lean into the bow (reference/draw-side.jpg)
    this._rot(b.spine2, Z_AXIS, 0.05 * aimW);
    this._rot(b.spine1, X_AXIS, 0.035 * aimW);
    this._rot(b.spine2, X_AXIS, 0.03 * aimW);
    // shoulders down + scapula squeezed
    this._rot(b.clavL, Z_AXIS, 0.04 * aimW);
    this._rot(b.clavR, Z_AXIS, -0.06 * aimW);

    // head: face the target (counter the chest blade), carry the aim pitch
    this._rotL(b.neck1, Y_AXIS, -chestYaw * 0.45);
    this._rotL(b.head, Y_AXIS, -chestYaw * 0.6);
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

    // breathing sway (steadier under Concentration) + draw-hold tremble
    const conc = this.ctx.combat?.concentration?.active ? 0.35 : 1;
    const trem = smoothstep(this._holdT, 3, 4.6) * aimW;
    _dA.y += (this._brNow - 0.5) * 0.011 * conc + trem * 0.006 * Math.sin(t * 43);
    _dA.applyAxisAngle(Y_AXIS,
      0.005 * conc * Math.sin(t * 0.57 + 1.3) + trem * 0.005 * Math.sin(t * 51));
    _dA.normalize();

    // draw anchor RIGIDLY GLUED to the live head frame: offset expressed in
    // the head's bind frame and rotated by the head's live char-space delta
    this._charOf(b.head.bone, _anch);
    this._liveW(b.head.bone, _q1);
    _q2.copy(_q1).multiply(b.head.invW);     // delta from bind, char space
    _v7.set(-0.065, -0.09, 0.145).applyQuaternion(_q2);
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
    // arrives exactly at the cheek at full draw. Rest hold starts on the
    // LEFT-shoulder line and keeps lateral + forward clearance off the chest.
    const dEase = smoothstep(drawS, 0.08, 0.9) * aimW;
    this._charOf(b.upArmL.bone, _v4); // live bow shoulder (kept for reach clamp)
    _grip.set(0.14, 1.42, 0.03).addScaledVector(_dA, 0.42);
    _v7.copy(_anch).sub(_v3);
    _grip.lerp(_v7, dEase);
    _grip.x += 0.035 * dEase;
    _grip.addScaledVector(_dA, 0.05 * dEase);
    // reach clamp BEFORE the arrow line is derived: slide the whole draw
    // geometry in along the aim ray so the string hand can't collapse into
    // the head at steep pitches
    _v5.subVectors(_grip, _v4);
    const reachL = (this._lenUpL + this._lenLoL) * 0.96;
    if (_v5.lengthSq() > reachL * reachL) {
      _v5.setLength(reachL);
      _grip.copy(_v4).add(_v5);
    }
    if (trem > 0.01) {
      _grip.x += trem * 0.006 * Math.sin(t * 47 + 1);
      _grip.y += trem * 0.005 * Math.sin(t * 59);
    }

    // loose follow-through kick: fast attack, ~0.15s decay
    const lk = this._looseT < 1
      ? (this._looseT < 0.25 ? this._looseT / 0.25
        : 1 - smoothstep(this._looseT, 0.25, 1))
      : 0;

    // ---- LEFT ARM: bow arm, 2-bone IK to the grip; pole firmly DOWN so the
    // soft elbow bend points at the ground (reference/draw-front.jpg)
    _pole.set(0.3, -0.95, 0.12);
    this._ikArm('l', _grip, _pole, aimW, _hand);
    // wrist: brace hand upright behind the bow
    this._rot(b.handL, X_AXIS, 0.25 * aimW);
    this._curlFingers(this._fingerL, 0.5 * aimW, 0.3 * aimW);
    if (lk > 0.001) {
      this._rot(b.clavL, Z_AXIS, -0.045 * lk * aimW);
      this._rot(b.upArmL, X_AXIS, 0.05 * lk * aimW);
    }

    // string nock implied by the ACHIEVED grip — matches the rendered string
    _grip.copy(_hand).add(_v3);

    // ---- RIGHT ARM: string hand rides the nock at every draw length; on
    // loose the string snaps forward but the hand holds at the cheek and
    // kicks ~7cm further back along -aim before blending down to rest
    const hold = this._looseT < 1
      ? Math.max(0, (this._looseDraw ?? 0) * (1 - smoothstep(this._looseT, 0.25, 1)) - drawS)
      : 0;
    _v7.copy(_grip).addScaledVector(_dA, -0.068 - 0.075 * lk - pull * hold);
    // nock flourish: short dip of the string hand toward the HIP quiver
    let qOpen = 1;
    let qw = 0;
    if (this._quiverT < 1) {
      qw = Math.sin(Math.PI * this._quiverT) * aimW;
      _v6.set(-0.2, 1.02, -0.14);
      _v7.lerp(_v6, qw * 0.6);
      qOpen = 0.45 + 0.55 * this._quiverT;
    }
    // hard guard: the string hand's target may never enter the skull/hair
    // volume (radius covers the hair mass, not just the skull)
    this._charOf(b.head.bone, _v6);
    _v5.subVectors(_v7, _v6);
    if (_v5.lengthSq() < 0.21 * 0.21) {
      _v5.normalize().multiplyScalar(0.21);
      _v7.copy(_v6).add(_v5);
    }
    // archery form: draw elbow straight BACK, level with the arrow line,
    // fractionally below the shoulder (reference/draw-side.jpg)
    _pole.set(-0.45, -0.3 + 0.26 * drawS, -0.9);
    if (qw > 0.001) _pole.lerp(_v5.set(-0.5, -0.95, -0.3), qw);
    this._ikArm('r', _v7, _pole, aimW, null);
    // string fingers: two-finger hook tightening with draw (open at the
    // quiver, thrown fully open for the loose follow-through)
    this._rot(b.handR, Z_AXIS, (-0.2 + 0.14 * lk) * aimW);
    this._curlFingers(this._fingerR,
      (0.45 + 0.3 * drawS) * aimW * qOpen * (1 - 0.9 * lk),
      0.25 * aimW * (1 - 0.7 * lk));
  }

  /* --------------------- heavy two-hand carry overlay ---------------------- */

  _carryLayer(w, p, t) {
    const b = this.b;
    this._rot(b.pelvis, X_AXIS, 0.04 * w);
    this._rot(b.spine1, X_AXIS, -0.07 * w);
    this._rot(b.spine2, X_AXIS, -0.09 * w);
    this._rot(b.spine3, X_AXIS, -0.05 * w);
    this._rot(b.neck1, X_AXIS, 0.08 * w);
    this._rot(b.head, X_AXIS, 0.1 * w);
    this._rot(b.thighL, Z_AXIS, 0.07 * w);
    this._rot(b.thighR, Z_AXIS, -0.07 * w);
    this._rot(b.calfL, X_AXIS, 0.1 * w);
    this._rot(b.calfR, X_AXIS, 0.1 * w);

    const pitch = clamp(p.camPitch ?? 0, -0.5, 0.7);
    const heave = (this._brNow - 0.5) * 0.01 - 0.4 * this._crouchW;
    _grip.set(0.08, 1.03 - 0.1 * pitch + heave, 0.36);
    _pole.set(0.7, -0.6, 0.1);
    this._ikArm('l', _grip, _pole, w, null);
    _grip.set(-0.02, 0.97 - 0.05 * pitch + heave, 0.1);
    _pole.set(-0.8, -0.55, -0.15);
    this._ikArm('r', _grip, _pole, w, null);
    this._curlFingers(this._fingerL, 0.55 * w, 0.35 * w);
    this._curlFingers(this._fingerR, 0.55 * w, 0.35 * w);
  }

  /**
   * 2-bone arm IK in character space on the LIVE pose: reads the current
   * shoulder/elbow/wrist positions and orientations from the posed skeleton
   * (clip + earlier overlays), rotates the upper arm so the elbow lands on
   * the pole-hinted plane, then the forearm onto the wrist goal. Applied at
   * weight w (slerp toward identity) so it fades cleanly over the clip's own
   * arm motion. Writes the achieved (reach-clamped) wrist to outHand.
   */
  _ikArm(side, target, pole, w, outHand) {
    const b = this.b;
    const upE = side === 'l' ? b.upArmL : b.upArmR;
    const loE = side === 'l' ? b.loArmL : b.loArmR;
    const haE = side === 'l' ? b.handL : b.handR;
    const L1 = side === 'l' ? this._lenUpL : this._lenUpR;
    const L2 = side === 'l' ? this._lenLoL : this._lenLoR;
    if (!upE || !loE || !haE) return;

    this._charOf(upE.bone, _sh);
    this._charOf(loE.bone, _el);
    this._charOf(haE.bone, _wr);

    _v1.subVectors(target, _sh);
    const dLen = clamp(_v1.length(), 0.05, (L1 + L2) * 0.985);
    _v1.normalize();
    _v2.copy(_sh).addScaledVector(_v1, dLen); // clamped wrist position
    if (outHand) outHand.copy(_v2);
    const A = Math.acos(clamp((L1 * L1 + dLen * dLen - L2 * L2) / (2 * L1 * dLen), -1, 1));
    _v4.copy(pole).addScaledVector(_v1, -pole.dot(_v1));
    if (_v4.lengthSq() < 1e-6) _v4.set(-_v1.y, _v1.x, 0.01);
    _v4.normalize();
    // desired upper-arm dir: reach dir rotated toward the pole by the IK angle
    _v5.copy(_v1).multiplyScalar(Math.cos(A)).addScaledVector(_v4, Math.sin(A));
    _v6.copy(_sh).addScaledVector(_v5, L1);   // elbow position
    _v6.subVectors(_v2, _v6).normalize();     // desired elbow -> wrist dir

    // upper arm: live dir -> desired dir, applied in the live frame
    _v3.subVectors(_el, _sh).normalize();
    _q3.setFromUnitVectors(_v3, _v5);
    if (w < 0.999) _q3.slerp(Q_IDENT, 1 - w);
    this._liveW(upE.bone, _q4);
    _q2.copy(_q4).invert().multiply(_q3).multiply(_q4);
    upE.bone.quaternion.multiply(_q2);

    // forearm: its live dir has been carried by the upper-arm rotation
    _v3.subVectors(_wr, _el).normalize().applyQuaternion(_q3);
    _q3.setFromUnitVectors(_v3, _v6);
    if (w < 0.999) _q3.slerp(Q_IDENT, 1 - w);
    this._liveW(loE.bone, _q4); // re-read: includes the new upper-arm pose
    _q2.copy(_q4).invert().multiply(_q3).multiply(_q4);
    loE.bone.quaternion.multiply(_q2);
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
      const fx = az * c.accel * 10
        + this._lvz * c.accel * 46
        + gaitPump * c.gait * 10
        + Math.sin(t * 1.35 + c.seed) * 0.06;
      const fz = -ax * c.accel * 10
        - this._lvx * c.accel * 46
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
