import * as THREE from 'three';

/**
 * GaitController: procedural locomotion for auto-rigged machines (autorig.js).
 *
 * Distance-locked stepping (the watcher stance math generalized to real IK):
 * the gait phase advances with actual travelled distance, each foot keeps a
 * world-fixed PLANT point through its stance (zero skate by construction),
 * and swing arcs the foot to the next predicted plant point sampled from
 * ctx.terrain.getHeight — so feet actually touch the ground, on slopes too.
 * The pelvis follows the average planted foot height, and body english is
 * footfall-driven (impact dip on each plant) rather than sinusoidal mush.
 *
 * Attack layers write into `pose` (crouch / spineRear / tailYaw / legLift…)
 * from attack onUpdate callbacks; the controller applies them after the base
 * layers each frame, so locomotion and attacks never fight.
 *
 * Per-frame cost: bone math only — module-scope temps, zero allocations.
 */

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();

const TAU = Math.PI * 2;

export class GaitController {
  constructor(machine, rig, opts = {}) {
    this.m = machine;
    this.rig = rig;
    this.walk = opts.walk;   // { stride, duty, lift, offsets: {legId: phase} }
    this.run = opts.run ?? opts.walk;
    this.runRef = opts.runRef ?? machine.runSpeed;
    this.rollAmp = opts.rollAmp ?? 0.045;
    this.impactAmp = opts.impactAmp ?? 0.1;
    this.breatheAmp = opts.breatheAmp ?? 0.02;
    this.breatheRate = opts.breatheRate ?? 1.0;
    this.pelvisFollow = opts.pelvisFollow ?? 0.8;
    this.headLook = opts.headLook ?? true;
    this.lookClampYaw = opts.lookClampYaw ?? 0.85;
    this.stepDustSpeed = opts.stepDustSpeed ?? Infinity; // dust when faster
    this.turnRadius = opts.turnRadius ?? 1;
    // standing knee flex (m): drops the pelvis so legs keep reach headroom
    // through the stride instead of walking on locked stilts
    this.stanceFlex = opts.stanceFlex ?? 0;

    // attack/state pose channels (attacks write these in onUpdate)
    this.pose = {
      crouch: 0,       // 0..1 body lowers onto flexed legs
      spineRear: 0,    // rad, rear-up over the spine chain (negative = nose dive)
      spineYaw: 0,     // rad, torso twist
      tailYaw: 0,      // rad, tail sweep (whole chain)
      tailLift: 0,     // rad
      headPitch: 0,    // rad extra
      headYaw: 0,
      legLift: null,   // per-leg 0..1 raise (index matches rig.legs)
      tuck: 0,         // 0..1 airborne leg tuck (pounce)
    };
    this.pose.legLift = new Float32Array(rig.legs.length);

    this.phase = Math.random();
    this._impact = 0;
    this._pelvisOff = 0;
    this._speedS = 0;
    this._lastPos = machine.position.clone();
    this._lastHeading = machine.heading;
    this._turnS = 0;
    this._lookYaw = 0;
    this._lookPitch = 0;
    this._lookW = 0;

    // per-leg runtime state
    this.legs = rig.legs.map((L) => {
      const crouchDrop = (L.hip[1] - L.ankleH) * 0.38;
      return {
        L,
        planted: true,
        inStance: true,
        plant: new THREE.Vector3(),
        swingFrom: new THREE.Vector3(),
        target: new THREE.Vector3(),
        crouchDrop,
      };
    });
    this._crouchDrop = (opts.crouchDrop ?? 0.34) * rig.legs[0].hip[1];

    // seed plants at the neutral stance under the spawn pose
    const terrain = machine.ctx.terrain;
    for (const leg of this.legs) {
      this._homeWorld(leg, 0, _v1);
      _v1.y = terrain.getHeight(_v1.x, _v1.z) + leg.L.ankleH;
      leg.plant.copy(_v1);
      leg.target.copy(_v1);
      leg.swingFrom.copy(_v1);
    }
  }

  /** world position of a leg's neutral ankle home, pushed `ahead` m forward */
  _homeWorld(leg, ahead, out) {
    const m = this.m;
    const L = leg.L;
    // neutral TOE xz (restFoot) minus flat foot-tip offset = neutral ankle xz
    const ax = L.restFoot[0] - L.footTip.x;
    const az = L.restFoot[1] - L.footTip.z;
    const sin = Math.sin(m.heading), cos = Math.cos(m.heading);
    out.set(
      m.position.x + ax * cos + (az + ahead) * sin,
      0,
      m.position.z - ax * sin + (az + ahead) * cos,
    );
    return out;
  }

  /* ---------------- main per-frame update ---------------- */

  update(dt, t) {
    const m = this.m;
    const rig = this.rig;
    if (dt <= 0) return;

    // actual world velocity (includes attack root-motion, standoff pushes)
    _v1.subVectors(m.position, this._lastPos);
    this._lastPos.copy(m.position);
    const travel = Math.hypot(_v1.x, _v1.z);
    const rawSpeed = Math.min(travel / dt, 20);
    let dh = m.heading - this._lastHeading;
    while (dh > Math.PI) dh -= TAU;
    while (dh < -Math.PI) dh += TAU;
    this._lastHeading = m.heading;
    const turnRate = dh / dt;
    this._turnS = THREE.MathUtils.damp(this._turnS, turnRate, 7, dt);
    this._speedS = THREE.MathUtils.damp(this._speedS, Math.max(rawSpeed, m._speed), 9, dt);
    const speed = this._speedS;

    // gait params: walk <-> run crossfade by speed
    const runK = THREE.MathUtils.clamp(
      (speed / this.runRef - 0.32) / 0.35, 0, 1);
    const g0 = this.walk, g1 = this.run;
    const stride = THREE.MathUtils.lerp(g0.stride, g1.stride, runK);
    const duty = THREE.MathUtils.lerp(g0.duty, g1.duty, runK);
    const lift = THREE.MathUtils.lerp(g0.lift, g1.lift, runK);
    const offsets = runK > 0.55 ? g1.offsets : g0.offsets;

    // distance-locked phase: cycles advance with travel (+ a turn term so
    // turning in place steps the feet instead of pivoting on rails)
    const eff = speed + Math.abs(this._turnS) * this.turnRadius * 0.7;
    this.phase += dt * eff / stride;
    const moveK = THREE.MathUtils.clamp(speed / 1.4, 0, 1);

    // ---- body english (impact spring; attacks own the body while active)
    this._impact *= Math.exp(-9 * dt);
    if (!m._attack) {
      m.body.position.y = -this._impact * this.impactAmp
        + Math.sin(t * this.breatheRate) * this.breatheAmp * (1 - moveK * 0.7);
      m.body.rotation.x = 0;
      m.body.rotation.y = 0;
      m.body.rotation.z = 0;
    }

    // ---- skeleton: reset to rest, then layered poses
    for (const [b, q] of rig.rest) b.quaternion.copy(q);
    const pose = this.pose;

    // pelvis height: follow planted feet + crouch + airborne tuck
    let sum = 0, n = 0;
    for (const leg of this.legs) {
      if (leg.planted) { sum += leg.plant.y - leg.L.ankleH; n++; }
    }
    const rootY = m.position.y;
    const wantOff = n ? THREE.MathUtils.clamp(
      ((sum / n) - rootY) * this.pelvisFollow, -rig.legs[0].hip[1] * 0.25, rig.legs[0].hip[1] * 0.2) : 0;
    this._pelvisOff = THREE.MathUtils.damp(this._pelvisOff, wantOff, 10, dt);
    rig.pelvis.position.y = rig.restPelvisY + this._pelvisOff
      - this.stanceFlex * (0.45 + 0.55 * moveK)
      - pose.crouch * this._crouchDrop;

    // spine layers: gait sway + turn lean + accel pitch + attack channels
    const sway = Math.sin(this.phase * TAU) * this.rollAmp * moveK;
    const lean = THREE.MathUtils.clamp(-this._turnS * speed * 0.014, -0.1, 0.1);
    const accelPitch = (speed - m._accelPitch) * 0.022; // + = accelerating
    const sn = rig.spine.length;
    for (let i = 0; i < sn; i++) {
      const b = rig.spine[i];
      const k = (i + 1) / sn;
      rotX(b, (-pose.spineRear * (1 - k * 0.4) + accelPitch * 0.5 + pose.crouch * 0.06) / sn * 2.2);
      rotZ(b, (sway + lean) / sn * 2);
      if (pose.spineYaw) rotY(b, pose.spineYaw / sn);
    }

    // head/neck: stabilized gaze — counter the sway, look at the threat
    if (this.headLook) this._updateLook(dt, pose);

    // tail: follow-through + counterbalance + attack sweep
    const tn = rig.tail.length;
    if (tn) {
      const wag = Math.sin(this.phase * TAU - 0.9) * 0.05 * moveK;
      const counter = THREE.MathUtils.clamp(this._turnS * 0.35, -0.5, 0.5)
        - lean * 2.2 - sway * 1.6;
      for (let i = 0; i < tn; i++) {
        const b = rig.tail[i];
        rotY(b, (pose.tailYaw + counter) / tn + wag);
        rotX(b, (pose.tailLift) / tn + Math.sin(t * 1.3 + i) * 0.012);
      }
    }

    // ---- legs: plant / swing bookkeeping then IK
    rig.root.updateWorldMatrix(true, true);
    const terrain = m.ctx.terrain;
    const airborne = m._airborne || pose.tuck > 0.01;

    for (let li = 0; li < this.legs.length; li++) {
      const leg = this.legs[li];
      const L = leg.L;
      let p = this.phase + (offsets[L.id] ?? 0);
      p -= Math.floor(p);
      const stance = p < duty;

      const liftAdd = pose.legLift[li]; // attack channel (stomp windup etc.)

      if (airborne || liftAdd > 0.001) {
        // tucked mid-leap / raised for a stomp: no planting
        this._homeWorld(leg, stride * 0.1, _v2);
        if (liftAdd > 0.001) {
          _v2.y = terrain.getHeight(_v2.x, _v2.z) + L.ankleH
            + liftAdd * L.hip[1] * 0.42;
        } else {
          _v2.y = rootY + L.ankleH + L.hip[1] * 0.3 * Math.max(pose.tuck, 0.6);
        }
        leg.target.lerp(_v2, Math.min(1, dt * 14));
        leg.planted = false;
        leg.inStance = false;
      } else if (stance) {
        if (!leg.inStance) {
          // touchdown: lock the plant where the swing was heading
          leg.plant.copy(leg.target);
          leg.plant.y = terrain.getHeight(leg.plant.x, leg.plant.z) + L.ankleH;
          leg.planted = true;
          this._footfall(leg, li, speed, runK);
        }
        leg.target.copy(leg.plant);
        leg.inStance = true;
      } else {
        if (leg.inStance) {
          leg.swingFrom.copy(leg.target);
          leg.planted = false;
        }
        const u = (p - duty) / (1 - duty);
        // land ahead of the home by half a stance's travel (+velocity lead)
        this._homeWorld(leg, stride * duty * 0.5 + speed * 0.06, _v2);
        _v2.y = terrain.getHeight(_v2.x, _v2.z) + L.ankleH;
        const e = u * u * (3 - 2 * u);
        leg.target.lerpVectors(leg.swingFrom, _v2, e);
        leg.target.y += Math.sin(Math.PI * u) * lift * (0.45 + 0.55 * moveK);
        leg.inStance = false;
      }

      this._solveLeg(leg, u01(p, duty));
    }
  }

  /* wire head/neck gaze: scan sway counter + snap onto the player when wary+ */
  _updateLook(dt, pose) {
    const m = this.m;
    const rig = this.rig;
    const hostile = m.state === 'alert' || m.state === 'attack';
    const wary = m.state === 'suspicious' || m.state === 'search';
    this._lookW = THREE.MathUtils.damp(this._lookW, hostile || wary ? 1 : 0, hostile ? 10 : 4, dt);
    let ty = 0, tp = 0;
    if (this._lookW > 0.01) {
      _v1.copy(hostile && m.ctx.player ? m.ctx.player.position : m.lastKnown);
      _v1.y += 1.1;
      m.root.worldToLocal(_v1);
      ty = THREE.MathUtils.clamp(Math.atan2(_v1.x, _v1.z), -this.lookClampYaw, this.lookClampYaw);
      const hd = Math.hypot(_v1.x, _v1.z);
      tp = THREE.MathUtils.clamp(Math.atan2(_v1.y - m.eyeHeight, Math.max(hd, 1)), -0.5, 0.4);
    }
    const k = hostile ? 11 : 5;
    this._lookYaw = THREE.MathUtils.damp(this._lookYaw, ty * this._lookW, k, dt);
    this._lookPitch = THREE.MathUtils.damp(this._lookPitch, tp * this._lookW, k, dt);
    const parts = [];
    if (rig.neck) parts.push(rig.neck);
    parts.push(rig.head);
    for (const b of parts) {
      rotY(b, (this._lookYaw + pose.headYaw) / parts.length);
      rotX(b, (-this._lookPitch + pose.headPitch) / parts.length);
    }
  }

  _footfall(leg, li, speed, runK) {
    const m = this.m;
    this._impact = Math.min(1.6, this._impact + 0.55 + runK * 0.6);
    if (speed > this.stepDustSpeed && !m.lowLOD) {
      _v3.copy(leg.target);
      _v3.addScaledVector(_v4.copy(leg.L.footTip).applyQuaternion(m.root.quaternion), 1);
      m._dustPuff(_v3.x, leg.plant.y - leg.L.ankleH + 0.25, _v3.z,
        0.5 + runK * 0.9);
    }
    m.onFootfall?.(leg, li, speed, runK);
  }

  /**
   * Two-bone IK in world space. Bones were authored with identity local
   * rotation in body axes, so `bind*` direction vectors live in each bone's
   * parent frame — parent's current world quaternion maps them to world.
   */
  _solveLeg(leg, swingU) {
    const L = leg.L;
    const target = leg.target;

    L.thigh.parent.getWorldQuaternion(_q1);         // parent world rot
    L.thigh.parent.updateWorldMatrix(false, false);
    _v1.setFromMatrixPosition(L.thigh.matrixWorld); // hip world (pre-IK pose ok)

    _v2.subVectors(target, _v1);                    // hip -> ankle target
    const l1 = L.l1, l2 = L.l2;
    let d = _v2.length();
    const dMax = (l1 + l2) * 0.985;
    const dMin = Math.abs(l1 - l2) + Math.max(l1, l2) * 0.12;
    if (d > dMax) { _v2.multiplyScalar(dMax / d); d = dMax; }
    else if (d < dMin) { _v2.multiplyScalar(dMin / Math.max(d, 1e-5)); d = dMin; }
    _v2.divideScalar(d);                            // D̂

    // hinge plane: knee apex toward the leg's bind-pose side (body ±Z)
    _v3.set(0, 0, L.hingeZ).applyQuaternion(_q1);   // pole in world
    _v4.crossVectors(_v2, _v3);
    if (_v4.lengthSq() < 1e-6) _v4.set(1, 0, 0).applyQuaternion(_q1);
    _v4.normalize();                                // plane normal n

    const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const A = Math.acos(cosA);
    // thigh dir = D̂ rotated toward the pole by A around n
    _q2.setFromAxisAngle(_v4, A);
    _v5.copy(_v2).applyQuaternion(_q2);             // thigh world dir

    // thigh.quaternion: parent-frame align of bind dir onto target dir
    _v3.copy(L.bindThigh).applyQuaternion(_q1);     // zero dir in world
    _q3.setFromUnitVectors(_v3, _v5);               // world align
    // local = parent⁻¹ · align · parent
    L.thigh.quaternion.copy(_q1).invert().multiply(_q3).multiply(_q1);

    // shin: aim knee -> target
    _q4.copy(_q1).multiply(L.thigh.quaternion);     // thigh world rot
    _v3.copy(_v1).addScaledVector(_v5, l1);         // knee world
    _v2.subVectors(target, _v3).normalize();        // shin dir
    _v3.copy(L.bindShin).applyQuaternion(_q4);
    _q3.setFromUnitVectors(_v3, _v2);
    L.shin.quaternion.copy(_q4).invert().multiply(_q3).multiply(_q4);

    // foot: keep the sole flat on the terrain plane (root orientation),
    // with a little toe-off pitch through the swing
    _q4.multiply(L.shin.quaternion);                // shin world rot
    _q3.copy(this.m.root.quaternion);
    if (swingU > 0) {
      _q2.setFromAxisAngle(_v4.set(1, 0, 0).applyQuaternion(_q3),
        Math.sin(Math.PI * swingU) * -0.35);
      _q3.premultiply(_q2);
    }
    L.foot.quaternion.copy(_q4).invert().multiply(_q3);
  }

  /**
   * Round-3 contract (gate A6): world-space foot soles + plant bookkeeping.
   * Reads the actual bones post-IK — the sole sits ankleH below the ankle
   * pivot — so it reports where the foot IS, not where it was told to go.
   * Cold path (debug/gate), fresh vectors are fine.
   */
  debugFeet() {
    const out = [];
    // beyond LOD range animate() is skipped while the root keeps moving on
    // coarse ticks — plants go stale, so they are honestly NOT planted
    const live = !this.m.lowLOD && this.m.alive;
    for (const leg of this.legs) {
      const p = leg.L.foot.getWorldPosition(new THREE.Vector3());
      p.y -= leg.L.ankleH;
      out.push({ name: leg.L.id, world: p, planted: live && leg.planted });
    }
    return out;
  }

  /* ---------------- death collapse ---------------- */

  /**
   * Skeletal death: legs buckle asymmetrically (deathSide first), spine and
   * neck drop, then 1-2 damped settle bounces. Driven from onDeathPose(k)
   * with the raw death timer for the bounce term.
   */
  deathPose(k, deathT) {
    const m = this.m;
    const rig = this.rig;
    for (const [b, q] of rig.rest) b.quaternion.copy(q);

    const side = m._deathSide;
    const foldA = THREE.MathUtils.smoothstep(Math.min(1, k * 1.7), 0, 1);
    const foldB = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(k * 1.7 - 0.5, 0, 1), 0, 1);
    // settle bounce: two damped oscillations after the main crash
    const bt = Math.max(0, deathT - 0.85);
    const osc = bt > 0 ? Math.exp(-2.4 * bt) * Math.sin(8.5 * bt) * 0.14 : 0;

    for (let li = 0; li < rig.legs.length; li++) {
      const L = rig.legs[li];
      const first = (L.hip[0] >= 0 ? 1 : -1) === side;
      const f = (first ? foldA : foldB) * (0.85 + 0.15 * ((li * 37) % 7) / 7);
      // fold the leg under the belly: knee travels toward its hinge apex
      // (thigh rotX sign: + swings the knee rearward, - forward), shin closes
      // the opposite way, foot goes slack. Signs derive from bone axes ≡ body
      // axes with the knee hanging on -Y.
      const h = L.hingeZ;
      rotX(L.thigh, -h * (0.7 + (first ? 0.18 : 0)) * f);
      rotZ(L.thigh, 0.22 * f * (L.hip[0] >= 0 ? 1 : -1)); // slight splay
      rotX(L.shin, h * (1.25 + osc * 1.6) * f);
      rotX(L.foot, -h * 0.5 * f);
    }
    // drop the chassis onto the folded legs — but keep the belly ON the
    // ground plane, not through it (the base body roll already tips it)
    const drop = rig.legs[0].hip[1] * 0.42;
    rig.pelvis.position.y = rig.restPelvisY - drop * foldA + osc * drop * 0.6;

    const sn = rig.spine.length;
    for (let i = 0; i < sn; i++) {
      const b = rig.spine[i];
      const kk = (i + 1) / sn;
      rotX(b, (0.14 * kk * foldA + osc * 0.35 * kk) / sn * 2.4);
      rotZ(b, (0.3 * side * foldA) / sn * 2);
    }
    // neck/head drop slack with a settle overshoot
    rotX(rig.head, 0.32 * foldA + osc * 0.8);
    if (rig.neck) rotX(rig.neck, 0.2 * foldA + osc * 0.4);
    const tn = rig.tail.length;
    for (let i = 0; i < tn; i++) {
      rotX(rig.tail[i], (0.4 * foldB - osc * 0.7) / tn * 2);
      rotY(rig.tail[i], (0.45 * side * foldB) / tn * 2);
    }
  }
}

/* axis-local rotation helpers (multiply on top of current quaternion) */
const _AX = new THREE.Vector3(1, 0, 0);
const _AY = new THREE.Vector3(0, 1, 0);
const _AZ = new THREE.Vector3(0, 0, 1);
function rotX(b, a) { if (a) { _q1.setFromAxisAngle(_AX, a); b.quaternion.multiply(_q1); } }
function rotY(b, a) { if (a) { _q1.setFromAxisAngle(_AY, a); b.quaternion.multiply(_q1); } }
function rotZ(b, a) { if (a) { _q1.setFromAxisAngle(_AZ, a); b.quaternion.multiply(_q1); } }

function u01(p, duty) {
  return p < duty ? 0 : (p - duty) / (1 - duty);
}
