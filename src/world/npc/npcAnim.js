import * as THREE from 'three';
import { BoneSpace, ClipLayerSet } from '../../entities/anim/index.js';
import { B, NPC_CLIPS } from './npcRig.js';

/**
 * NPC ANIMATOR — lane `npc`. One per NPC.
 *
 * Built on anim-core: a `ClipLayerSet` over a `THREE.AnimationMixer` (so every
 * crossfade and one-shot is dt-driven and survives `engine.timeScale`), and a
 * `BoneSpace` for the head/neck look-at written over the clip pose.
 *
 * ── THE NO-SKATE CONTRACT (`A97-npc-no-skate`) ────────────────────────────
 *
 * The NPC's translation is DERIVED FROM THE ANIMATION, not the other way
 * round. Every frame, after the mixer runs:
 *
 *   1. find the support foot (the lower of the two toes, with hysteresis);
 *   2. read how far that foot moved BACKWARD in character space this frame;
 *   3. move the character FORWARD by exactly that much.
 *
 * The planted foot therefore cannot drift: its world position is the fixed
 * point of the update by construction, and it is not a correction applied after
 * an independently-chosen velocity. Walk speed is whatever the clip dictates
 * times `action.timeScale` — which scales the foot's own velocity too, so
 * slowing an NPC down cannot introduce skate either.
 *
 * Turning is the other half of the same idea: a yaw applied about the body
 * origin sweeps the planted foot around an arc. `turn()` instead rotates the
 * body AROUND the planted foot, so a corner costs the foot nothing.
 *
 * Root motion is only integrated while a locomotion layer owns the stage;
 * idles, sits and work loops are in-place by definition and a weight shift in
 * `Idle_Loop` must not walk the NPC out of camp.
 */

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Locomotion slots: only these integrate root motion. */
const GAIT = new Set(['walk', 'walkFormal', 'jog']);

/** Slots that must exist for the behaviour loop to have anything to say. */
const CORE_SLOTS = ['idle', 'walk'];

let _gaitCache = null;

/**
 * Measure a locomotion clip's nominal speed the same way the runtime lock
 * works: integrate the support foot's backward travel over one loop. Done once
 * per boot on a throwaway skeleton — never on a live NPC.
 */
export function measureGaits(rigSource, slots = ['walk', 'walkFormal', 'jog']) {
  if (_gaitCache) return _gaitCache;
  const out = {};
  const { root, byName } = rigSource.instantiate();
  const holder = new THREE.Group();
  holder.add(root);
  const mixer = new THREE.AnimationMixer(holder);
  const toeL = byName.get(B.toeL), toeR = byName.get(B.toeR);

  for (const slot of slots) {
    const clip = rigSource.clip(NPC_CLIPS[slot]);
    if (!clip || !toeL || !toeR) continue;
    const action = mixer.clipAction(clip);
    action.reset(); action.play(); action.weight = 1;
    const N = 60;
    const step = clip.duration / N;
    let travel = 0, support = null, prev = 0;
    for (let i = 0; i <= N; i++) {
      mixer.setTime(i * step);
      holder.updateMatrixWorld(true);
      const lz = toeL.matrixWorld.elements[14], ly = toeL.matrixWorld.elements[13];
      const rz = toeR.matrixWorld.elements[14], ry = toeR.matrixWorld.elements[13];
      const low = ly <= ry ? 'L' : 'R';
      const z = low === 'L' ? lz : rz;
      if (low === support) travel += Math.max(0, prev - z);
      support = low; prev = z;
    }
    action.stop();
    mixer.uncacheAction(clip);
    out[slot] = {
      duration: clip.duration,
      cycleDist: +travel.toFixed(4),
      speed: +(travel / Math.max(1e-4, clip.duration)).toFixed(4),
    };
  }
  mixer.uncacheRoot(holder);
  holder.clear();
  _gaitCache = out;
  return out;
}

export function resetGaitCache() { _gaitCache = null; }

export class NpcAnimator {
  /**
   * @param {import('./npcRig.js').NpcRigSource} rigSource
   * @param {THREE.Group} group the NPC's world transform (bones live under it)
   * @param {Map<string, THREE.Bone>} byName cloned bones
   * @param {string} id
   */
  constructor(rigSource, group, byName, id) {
    this.id = id;
    this.src = rigSource;
    this.group = group;
    this.byName = byName;
    this.mixer = new THREE.AnimationMixer(group);
    this.layers = new ClipLayerSet(this.mixer, { name: `npc:${id}`, normalize: true });
    this.slots = new Map();          // slot -> ClipLayer
    this.current = null;             // the base loop slot on stage
    this.clipsPlayed = new Set();
    this.gaits = measureGaits(rigSource);

    for (const s of CORE_SLOTS) this._slot(s);
    this.layers.base('idle');
    this.slots.get('idle')?.setWeight(1);
    this.current = 'idle';
    this.clipsPlayed.add(NPC_CLIPS.idle);

    /* --- foot lock state --- */
    this.toeL = byName.get(B.toeL);
    this.toeR = byName.get(B.toeR);
    this.footL = byName.get(B.footL);
    this.footR = byName.get(B.footR);
    this.support = null;             // 'L' | 'R'
    this._prevLocal = new THREE.Vector3();
    this._supportWorld = new THREE.Vector3();
    this._have = false;
    this.rootMotion = false;
    /**
     * Bumped whenever the foot lock RE-ANCHORS — a base-loop change, a clamped
     * delta, or a shove from the world. A stance window that spans a bump is
     * not a skate measurement (the reference the drift is measured against
     * moved), which is the same exclusion `A13-no-skate` makes for a dropped
     * frame. `A97-npc-no-skate` reads it.
     */
    this.lockEpoch = 0;
    this.travelled = 0;              // metres this animator has walked itself
    this._feet = [
      { name: 'toe.L', planted: false, world: new THREE.Vector3() },
      { name: 'toe.R', planted: false, world: new THREE.Vector3() },
    ];

    /* --- look-at --- */
    this.space = new BoneSpace(group, { worldFrame: true });
    this.eNeck = this.space.entry(B.neck);
    this.eHead = this.space.entry(B.head);
    this.lookTarget = null;          // THREE.Vector3 in world space, or null
    this.lookK = 0;                  // eased 0..1 blend of the look
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.idleYaw = 0;                // slow "looking around" when nobody is near
    this.idleYawTarget = 0;
    this.idleYawT = 0;

    /* --- stance: the per-person bias + weight shift written over the clip --- */
    this.eSpine1 = this.space.entry(B.spine1);
    this.eSpine3 = this.space.entry(B.spine3);
    this.eArmL = this.space.entry(B.upperArmL);
    this.eArmR = this.space.entry(B.upperArmR);
    this.stance = null;
    this.swayT = 0;
  }

  /**
   * Give this NPC a posture of its own.
   *
   * Thirteen people running the same three loops stand identically, and that
   * reads as thirteen copies of one actor even when the bodies differ. A fixed
   * per-person bias (elbows out, a shoulder dropped, chin up) plus a slow
   * weight shift on its own phase is the cheapest thing that makes a crowd read
   * as a crowd — and it is what `V35-settlement`'s pairwise landmark test is
   * actually asking for: no two of these people are holding the same pose.
   */
  setStance(rng) {
    this.stance = {
      armL: (rng() - 0.5) * 0.26,
      armR: (rng() - 0.5) * 0.26,
      armFore: (rng() - 0.5) * 0.18,
      spineZ: (rng() - 0.5) * 0.10,
      spineX: (rng() - 0.5) * 0.07,
      headZ: (rng() - 0.5) * 0.14,
      swayA: 0.030 + rng() * 0.055,
      swayW: 0.55 + rng() * 0.55,
      swayP: rng() * Math.PI * 2,
    };
    this.swayT = rng() * 10;
    return this;
  }

  /** Start the base loop somewhere other than frame 0 — nobody breathes in sync. */
  randomizePhase(rng) {
    for (const l of this.slots.values()) {
      if (l.loop) l.action.time = rng() * l.duration;
    }
    return this;
  }

  /** Lazily create (and cache) the layer for a logical slot. */
  _slot(slot) {
    let l = this.slots.get(slot);
    if (l) return l;
    const name = NPC_CLIPS[slot] || slot;
    const clip = this.src.clip(name);
    if (!clip) return null;
    const loop = /_Loop$/.test(name);
    l = this.layers.add(slot, clip, { loop, weight: 0 });
    this.slots.set(slot, l);
    return l;
  }

  has(slot) { return !!(this.slots.get(slot) || this.src.clip(NPC_CLIPS[slot] || slot)); }

  /**
   * Crossfade the base loop to `slot`. `rate` scales playback (and, for a
   * locomotion loop, the travel speed — the foot lock keeps step).
   */
  play(slot, { fade = 0.28, rate = 1 } = {}) {
    if (this.current === slot && Math.abs((this.slots.get(slot)?.action.timeScale ?? 1) - rate) < 1e-3) return this;
    const next = this._slot(slot);
    if (!next) return this;
    const prev = this.current ? this.slots.get(this.current) : null;
    next.action.timeScale = rate;
    /**
     * CLEAR THE STAGE, AND RETARGET ANYTHING STILL ON IT.
     *
     * `ClipLayerSet` normalizes override weights, so a layer left carrying
     * weight does not sit on top of the new base — it DIVIDES it. Two ways that
     * happened here, both filmed:
     *   - a one-shot captured `restore` when it started, so a fidget fired
     *     during an idle handed the stage back to IDLE after the NPC had
     *     already started walking: idle and walk both at 1, normalized to 0.5
     *     each, and SONA walked at a quarter speed with a 0.68 rad knee swing
     *     while `current` cheerfully read 'walk';
     *   - a `tempT` loop (crouchIdle, push) whose timer had not expired.
     * So: every other override layer is faded out, and any live one-shot is
     * re-pointed at the layer that is actually taking the stage.
     */
    for (const l of this.slots.values()) {
      if (l === next) continue;
      if (l.oneShot && !l.handedBack) { l.restore = next; continue; }
      if (l.weight > 1e-3 || l.target > 1e-3) l.fadeTo(0, fade);
    }
    if (prev && prev !== next) prev.fadeTo(0, fade);
    next.fadeTo(1, fade);
    // a loop that has been parked at zero weight keeps its old clock; restart
    // one-shot-shaped clips so they read from the top
    if (!next.loop) { next.action.reset(); next.action.play(); }
    this.current = slot;
    this.layers.base(slot);
    this.clipsPlayed.add(NPC_CLIPS[slot] || slot);
    this.rootMotion = GAIT.has(slot);
    this._have = false;        // always re-anchor on a base-loop change
    this.lockEpoch++;
    return this;
  }

  /** Fire a one-shot over the current base loop; it restores on mixer time. */
  once(slot, { fade = 0.22, rate = 1, hold = 0, onDone = null } = {}) {
    const l = this._slot(slot);
    if (!l) return null;
    this.clipsPlayed.add(NPC_CLIPS[slot] || slot);
    return l.playOnce({
      restore: this.current ? this.slots.get(this.current) : null,
      fade, timeScale: rate, hold, onDone,
    });
  }

  /** Is a one-shot currently holding the stage? */
  get busy() {
    for (const l of this.slots.values()) if (l.oneShot && !l.handedBack) return true;
    return false;
  }

  /** Nominal ground speed of the current gait, in metres/second, at `rate`. */
  gaitSpeed(slot = this.current, rate = 1) {
    const g = this.gaits[slot];
    return g ? g.speed * rate * (this.group.scale.x || 1) : 0;
  }

  /**
   * Yaw the body about the PLANTED FOOT so a turn never drags it.
   * @param {number} dYaw radians
   */
  turn(dYaw) {
    if (!dYaw) return;
    const g = this.group;
    const pivot = this._have && this.rootMotion;
    if (pivot) {
      const f = this._supportWorld;
      const dx = g.position.x - f.x, dz = g.position.z - f.z;
      const c = Math.cos(dYaw), s = Math.sin(dYaw);
      g.position.x = f.x + dx * c + dz * s;
      g.position.z = f.z - dx * s + dz * c;
    }
    g.rotation.y += dYaw;
    /**
     * Re-express the lock's reference in the NEW character frame. `_prevLocal`
     * was measured before this yaw; comparing it against next frame's local
     * reading would charge the turn itself to the foot and report it as skate.
     * The group only ever carries a Y rotation and a uniform scale, so the
     * conversion is four multiplies — no matrix walk in the hot loop.
     */
    if (pivot) {
      const sc = g.scale.x || 1;
      const dx = (this._supportWorld.x - g.position.x) / sc;
      const dz = (this._supportWorld.z - g.position.z) / sc;
      const cy = Math.cos(g.rotation.y), sy = Math.sin(g.rotation.y);
      this._prevLocal.x = dx * cy - dz * sy;
      this._prevLocal.z = dx * sy + dz * cy;
    }
  }

  /** Point the head (and half as much, the neck) at a world position. */
  lookAt(target) { this.lookTarget = target; }

  /**
   * @param {number} dt already multiplied by `engine.timeScale`
   * @returns {{x:number,z:number}} the world XZ the foot lock moved the body by
   */
  update(dt) {
    this.layers.update(dt);           // steps the mixer with the same dt
    const g = this.group;
    g.updateMatrixWorld(true);
    const moved = this._lockFeet(dt);
    this._stance(dt);
    this._look(dt);
    return moved;
  }

  _lockFeet(dt) {
    const g = this.group;
    const tl = this.toeL, tr = this.toeR;
    let mx = 0, mz = 0;
    if (!tl || !tr) return { x: 0, z: 0 };

    // support = the lower toe, with 1.5 cm of hysteresis so the choice cannot
    // chatter across the crossover frame (a chattering support is itself skate)
    const ly = tl.matrixWorld.elements[13], ry = tr.matrixWorld.elements[13];
    let next = this.support;
    if (!next) next = ly <= ry ? 'L' : 'R';
    else if (next === 'L' && ry < ly - 0.015 * (g.scale.y || 1)) next = 'R';
    else if (next === 'R' && ly < ry - 0.015 * (g.scale.y || 1)) next = 'L';

    const toe = next === 'L' ? tl : tr;
    _w.setFromMatrixPosition(toe.matrixWorld);
    _v.copy(_w);
    g.worldToLocal(_v);               // character-space position of the support toe

    if (this.rootMotion && this._have && next === this.support && dt > 0) {
      _d.subVectors(this._prevLocal, _v);
      _d.y = 0;
      const lim = 0.45;
      if (_d.lengthSq() >= lim * lim) this.lockEpoch++;
      else {
        _d.applyQuaternion(g.quaternion).multiplyScalar(g.scale.x || 1);
        mx = _d.x; mz = _d.z;
        g.position.x += mx;
        g.position.z += mz;
        this.travelled += Math.hypot(mx, mz);
        _w.x += mx; _w.z += mz;       // the foot is pinned: carry it with us
      }
    }
    this.support = next;
    this._prevLocal.copy(_v);
    this._supportWorld.copy(_w);
    this._have = true;

    const F = this._feet;
    F[0].planted = next === 'L';
    F[1].planted = next === 'R';
    F[0].world.setFromMatrixPosition(tl.matrixWorld);
    F[1].world.setFromMatrixPosition(tr.matrixWorld);
    if (next === 'L') { F[0].world.x = _w.x; F[0].world.z = _w.z; }
    else { F[1].world.x = _w.x; F[1].world.z = _w.z; }
    return { x: mx, z: mz };
  }

  /** The A13-shaped probe `A97-npc-no-skate` reads. */
  debugFeet() { return this._feet; }

  /**
   * The body was moved by something other than the animation (a depenetration
   * against a prop). Carry the lock's pivot and the reported feet with it, so
   * the next turn pivots about where the foot actually IS and the probe reports
   * the drag honestly instead of hiding it.
   */
  shift(dx, dz) {
    if (!dx && !dz) return;
    this.lockEpoch++;
    this._supportWorld.x += dx; this._supportWorld.z += dz;
    this._feet[0].world.x += dx; this._feet[0].world.z += dz;
    this._feet[1].world.x += dx; this._feet[1].world.z += dz;
  }

  _stance(dt) {
    const s = this.stance;
    if (!s) return;
    this.swayT += dt;
    // a gait already carries its own weight transfer; damp the idle shift so the
    // two do not fight over the pelvis
    const k = this.rootMotion ? 0.32 : 1;
    const sway = Math.sin(this.swayT * s.swayW + s.swayP) * s.swayA * k;
    this.space.syncFrame();
    if (this.eSpine1) {
      this.space.rotChar(this.eSpine1, 'z', s.spineZ * k + sway);
      this.space.rotChar(this.eSpine1, 'x', s.spineX * k);
    }
    if (this.eSpine3) this.space.rotChar(this.eSpine3, 'z', -sway * 0.55);
    if (this.eArmL) {
      this.space.rotChar(this.eArmL, 'z', s.armL * k);
      this.space.rotChar(this.eArmL, 'x', s.armFore * k);
    }
    if (this.eArmR) {
      this.space.rotChar(this.eArmR, 'z', -s.armR * k);
      this.space.rotChar(this.eArmR, 'x', s.armFore * k);
    }
  }

  _look(dt) {
    const en = this.eNeck, eh = this.eHead;
    if (!en && !eh) return;
    const g = this.group;
    this.space.syncFrame();

    let wantYaw = 0, wantPitch = 0, wantK = 0;
    if (this.lookTarget) {
      const head = this.byName.get(B.head);
      if (head) {
        _tgt.copy(this.lookTarget);
        _v.setFromMatrixPosition(head.matrixWorld);
        _d.subVectors(_tgt, _v);
        const dist = _d.length();
        if (dist > 1e-3) {
          _d.multiplyScalar(1 / dist);
          g.getWorldQuaternion(_q).invert();
          _d.applyQuaternion(_q);      // direction in character space
          wantYaw = Math.atan2(_d.x, _d.z);
          wantPitch = -Math.asin(THREE.MathUtils.clamp(_d.y, -1, 1));
          // only turn the head for something in front and within reach
          wantK = Math.abs(wantYaw) < 1.45 ? 1 : 0;
        }
      }
    }
    if (!wantK) {
      // nobody to look at: drift the gaze around on a slow timer so an idle
      // NPC is not a statue staring down its own nose
      this.idleYawT -= dt;
      if (this.idleYawT <= 0) {
        this.idleYawT = 2.6 + Math.random() * 3.4;
        this.idleYawTarget = (Math.random() - 0.5) * 1.1;
      }
      wantYaw = this.idleYawTarget;
      wantPitch = 0;
      wantK = 0.55;
    }

    const k = 1 - Math.exp(-dt * 4.5);
    this.lookYaw += (THREE.MathUtils.clamp(wantYaw, -1.25, 1.25) - this.lookYaw) * k;
    this.lookPitch += (THREE.MathUtils.clamp(wantPitch, -0.45, 0.42) - this.lookPitch) * k;
    this.lookK += (wantK - this.lookK) * k;

    const yaw = this.lookYaw * this.lookK;
    const pitch = this.lookPitch * this.lookK;
    if (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4) return;
    if (en) { this.space.rotChar(en, 'y', yaw * 0.38); this.space.rotChar(en, 'x', pitch * 0.4); }
    if (eh) { this.space.rotChar(eh, 'y', yaw * 0.62); this.space.rotChar(eh, 'x', pitch * 0.6); }
  }

  /** Health line for the gates: layers in an impossible state. */
  stuck() { return this.layers.stuck(); }

  dispose() {
    for (const l of this.slots.values()) {
      try { l.action.stop(); } catch { /* already stopped */ }
    }
    try { this.mixer.stopAllAction(); } catch { /* nothing playing */ }
    try { this.mixer.uncacheRoot(this.group); } catch { /* never bound */ }
    this.slots.clear();
    this.clipsPlayed.clear();
    this.lookTarget = null;
    this.space = null;
    this.eNeck = this.eHead = this.eSpine1 = this.eSpine3 = this.eArmL = this.eArmR = null;
    this.stance = null;
  }
}
