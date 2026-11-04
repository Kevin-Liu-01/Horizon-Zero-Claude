import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PersonChains } from './chains.js';
import { FADE_LEVELS } from './bank.js';

/**
 * CALIMA · one person on the street (settlements; R56; bible §6.2). A clone of an archetype's GLB: ONE
 * skeleton, its tier meshes, its mixer, its chains. Moves by the clip's own stride table, so the
 * planted foot is the fixed point of the walk (A97).
 *
 * Tiers: 0 near (3 draws, live chains), 1 at 18-35 m (2 draws), 2 beyond (2 draws), -1 hidden. A tier
 * change is a screen-door cross-fade over FADE_T, out of a quantised material pool. The `Caster` mesh is
 * the only thing that ever casts: no main pass (its draw is skipped before it reaches GL) and one draw
 * per cascade, and only the system's nearest four have it on.
 */
const FADE_T = 0.32;
const TAU = Math.PI * 2;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _ax = new THREE.Vector3(1, 0, 0), _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _sc = new THREE.Vector3();
const _mq = new THREE.Quaternion();
/** Head turn toward the player (rad, m): a person near her looks up from what they are doing. */
const LOOK_MAX = 0.75, LOOK_R = 5.5, LOOK_RATE = 2.2;
const _sphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.75);
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

/** No main-pass draw: count -1 makes three return before gl.drawElements; the shadow pass (which skips these hooks) sees the full range. */
function skipMain(geo) {
  return {
    before() { geo.drawRange.count = -1; },
    after() { geo.drawRange.count = Infinity; },
  };
}

export class Person {
  constructor(sys, entry, { x = 0, z = 0, yaw = 0, seed = 1, id = null, script = null, height = null } = {}) {
    this.sys = sys;
    this.entry = entry;
    this.archetype = entry.id;
    this.spec = entry.npc;
    this.id = id || `${entry.id}#${seed}`;
    this.seed = seed;
    this.script = script;
    const npc = entry.npc;
    const bank = sys.bank;
    this.group = new THREE.Group();
    this.group.name = `person-${this.id}`;
    this.yaw = yaw;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;

    const root = skeletonClone(entry.scene);
    this.root = root;
    // uniform scale only (bible §6.2); the sole sits on the ground
    const S = (height ? height / npc.height : 1) * npc.scale;
    this.scale = S;
    root.scale.setScalar(S);
    root.position.y = -npc.footY * S;
    this.group.add(root);

    this.meshes = {};
    this.bones = {};
    root.traverse((o) => { if (o.isBone) this.bones[o.name] = o; if (o.isSkinnedMesh) this.meshes[o.name] = o; });
    // ONE skeleton for every mesh of this person (a clone gets one per mesh, each with a bone texture)
    const firstMesh = this.meshes.Skin_L0;
    this.skeleton = firstMesh.skeleton;
    const outfitMat = bank.atlases.get(entry.faction).material, hairMat = bank.atlases.get('hair').material;
    for (const name in this.meshes) {
      const m = this.meshes[name];
      if (m.skeleton !== this.skeleton) { m.skeleton.dispose(); m.skeleton = this.skeleton; }
      m.boundingSphere = _sphere;
      m.frustumCulled = true;
      m.castShadow = false;
      m.receiveShadow = true;
      if (/^Outfit_/.test(name)) m.material = outfitMat;
      else if (/^Hair_/.test(name)) m.material = hairMat;
      else if (name === 'Caster') m.material = bank.casterMat;
      else m.material = entry.skinMat;
      m.userData.baseMat = m.material;
      m.userData.noSizeCull = true;   // a tier owns its own visibility
      m.visible = false;
    }
    const c = this.meshes.Caster;
    if (c) {
      const hook = skipMain(c.geometry);
      c.onBeforeRender = hook.before;
      c.onAfterRender = hook.after;
      c.castShadow = false;
    }
    this.tierMeshes = [
      [this.meshes.Skin_L0, this.meshes.Hair_L0, this.meshes.Outfit_L0].filter(Boolean),
      [this.meshes.Skin_L1, this.meshes.Outfit_L1].filter(Boolean),
      [this.meshes.Skin_L2, this.meshes.Outfit_L2].filter(Boolean),
    ];
    this.tier = -1;
    this.fromTier = -1;
    this.fadeT = 0;
    this.casting = false;

    this.chains = new PersonChains(this.bones, npc.chains || [], { worldScale: S });

    // the mixer
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.clipCount = new Set();
    this.current = null;
    this.mixAcc = 0;
    this.mixerClock = 0;
    this.distance = 0;
    this.walking = null;     // { clip, gait, ts, lean, swing }
    this.walkTarget = null;
    this.speed = 0;
    this.travelled = 0;
    this.stateT = 0;
    this.scriptI = 0;
    this.frozen = false;
    this.leanK = 0;
    this.lean = 0;
    this.swing = 1;
    this.head = this.bones.Head;
    this.neck = this.bones.neck_01;
    this.lookYaw = 0;
    this.spine1 = this.bones.spine_01;
    this.upL = this.bones.upperarm_l;
    this.upR = this.bones.upperarm_r;
    this.props = {};
    for (const p of npc.props || []) this.props[p.name] = this.bones[p.name] || null;
    this.showProps(null);
    this.setPosition(x, z);
  }

  /** Prop joints: a tool is collapsed by scaling its joint to nothing (no draw, no allocation). */
  showProps(list) {
    const carry = this.spec.clips?.carry;
    for (const name in this.props) {
      const b = this.props[name];
      if (!b) continue;
      const on = list ? list.includes(name) : (name !== 'prop_hand' && name !== 'prop_lamp');
      b.scale.setScalar(on ? 1 : 0.0005);
    }
    void carry;
  }

  setPosition(x, z) {
    this.group.position.x = x; this.group.position.z = z;
    const T = this.sys.ctx.terrain;
    if (T) this.group.position.y = T.getHeight(x, z);
  }

  action(name) {
    let a = this.actions.get(name);
    if (a) return a;
    const clip = this.sys.bank.clipPack.of(this.spec.sex, name);
    if (!clip) return null;
    a = this.mixer.clipAction(clip);
    a.enabled = true;
    this.actions.set(name, a);
    return a;
  }

  /** Cross-fade to a clip; returns its duration. */
  play(name, { fade = 0.35, ts = 1, loop = true, offset = null } = {}) {
    const a = this.action(name);
    if (!a) return 0;
    if (this.current === a) { a.setEffectiveTimeScale(ts); return a.getClip().duration; }
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.setEffectiveTimeScale(ts);
    a.setEffectiveWeight(1);
    if (offset !== null) a.time = offset * a.getClip().duration;
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.clipCount.add(name);
    return a.getClip().duration;
  }

  /** Walk to a point in this person's walk style; `then` when there. */
  walkTo(x, z, then = null) {
    const W = this.spec.clips?.walk || { clip: 'Walk_Loop', ts: 1, lean: 0, swing: 1 };
    const clip = W.also && !this._jog ? W.also : W.clip;
    const ts = W.also && !this._jog ? 1 : W.ts;
    const gait = this.sys.bank.clipPack.gaits[`${this.spec.sex}|${clip}`] || null;
    this.walking = { clip, gait, ts };
    this.lean = W.lean || 0;
    this.swing = W.swing ?? 1;
    this.walkTarget = { x, z, then };
    this.play(clip, { ts, fade: 0.32 });
    this.armMean = this.sys.bank.armMean(this.spec.sex, clip);
  }

  stopWalk() {
    this.walking = null;
    this.walkTarget = null;
    this.speed = 0;
  }

  /** The stride table: distance a planted foot carries the body between two clip times (raw metres). */
  _gaitDist(g, a, b) {
    const n = g.frames, k = n / g.dur;
    const at = (t) => {
      const f = Math.max(0, Math.min(n - 1e-4, t * k));
      const i = Math.floor(f);
      return g.cum[i] + (g.cum[i + 1] - g.cum[i]) * (f - i);
    };
    let d = b >= a ? at(b) - at(a) : (g.dist - at(a)) + at(b);
    if (d < 0) d = 0;
    return d;
  }

  update(dt, tier, wind) {
    if (this.frozen) dt = 0;
    this.stateT += dt;
    this._applyTier(tier, dt);
    // the mixer's rate falls with distance (bible §6.2)
    const hz = tier === 0 ? 0 : tier === 1 ? 1 / 30 : 1 / 15;
    this.mixAcc += dt;
    if (this.mixAcc < hz) return false;
    const step = this.mixAcc;
    this.mixAcc = 0;
    const a = this.current;
    const t0 = a ? a.time : 0;
    this.mixer.update(step);
    this.mixerClock += step;
    if (this.walking && a) {
      const g = this.walking.gait;
      const t1 = a.time;
      let d = g ? this._gaitDist(g, t0, t1) * this.scale : 0.9 * step * this.walking.ts;
      if (step > 0 && d === 0 && g) d = 0;
      this.speed = step > 0 ? d / step : 0;
      const T = this.walkTarget;
      if (T) {
        const dx = T.x - this.group.position.x, dz = T.z - this.group.position.z;
        const want = Math.atan2(dx, dz);
        const turn = wrapPi(want - this.yaw);
        const maxTurn = 1.5 * step;
        this.yaw += Math.max(-maxTurn, Math.min(maxTurn, turn));
        this.group.rotation.y = this.yaw;
        const px = this.group.position.x + Math.sin(this.yaw) * d, pz = this.group.position.z + Math.cos(this.yaw) * d;
        this.group.position.x = px; this.group.position.z = pz;
        this.travelled += d;
        const Tn = this.sys.ctx.terrain;
        if (Tn && d > 0) this.group.position.y = Tn.getHeight(px, pz);
        if (dx * dx + dz * dz < 0.09) {
          const then = T.then;
          this.stopWalk();
          if (then) then(this);
        }
      }
    }
    this._overlay();
    if (tier === 0) this._look(step);
    return true;
  }

  /**
   * The head turns toward the player when she is close and in front, split between neck and head,
   * written over the clip. World-axis yaw in each bone's parent frame, from last frame's matrices (no allocation).
   */
  _look(dt) {
    const pl = this.sys.ctx.player;
    let want = 0;
    if (pl && !this.frozen) {
      const dx = pl.position.x - this.group.position.x, dz = pl.position.z - this.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < LOOK_R * LOOK_R && d2 > 0.25) {
        const off = wrapPi(Math.atan2(dx, dz) - this.yaw);
        if (Math.abs(off) < 1.9) want = Math.max(-LOOK_MAX, Math.min(LOOK_MAX, off));
      }
    }
    this.lookYaw += (want - this.lookYaw) * Math.min(1, LOOK_RATE * dt);
    if (Math.abs(this.lookYaw) < 0.002 || !this.neck || !this.head) return;
    for (let i = 0; i < 2; i++) {
      const b = i ? this.head : this.neck, share = i ? 0.55 : 0.45;
      b.parent.matrixWorld.decompose(_v, _mq, _sc);
      _q3.copy(_mq).invert();
      _q.setFromAxisAngle(_up, this.lookYaw * share);
      // q_local' = parent^-1 * R * parent * q_local
      _q2.copy(_q3).multiply(_q).multiply(_mq).multiply(b.quaternion);
      b.quaternion.copy(_q2);
    }
  }

  /** The walk style's posture (bible §6.2): a lean from the hips and an arm-swing gain, preallocated. */
  _overlay() {
    const k = this.walking ? 1 : 0;
    this.leanK += (k - this.leanK) * 0.08;
    if (this.lean !== 0 && this.spine1) {
      _q.setFromAxisAngle(_ax, this.lean * this.leanK);
      this.spine1.quaternion.multiply(_q);
    }
    if (this.swing < 0.999 && this.leanK > 0.01) {
      const s = (1 - this.swing) * this.leanK;
      for (const b of [this.upL, this.upR]) {
        if (!b) continue;
        if (!this.armMean) continue;
        _q2.copy(b === this.upL ? this.armMean.l : this.armMean.r);
        b.quaternion.slerp(_q2, s);
      }
    }
  }

  _applyTier(tier, dt) {
    if (tier !== this.tier) {
      const from = this.tier;
      this.fromTier = from;
      this.tier = tier;
      this.fadeT = from === -1 || tier === -1 ? 0 : FADE_T;
      if (from === -1 || tier === -1) this.fromTier = -1;
      for (let i = 0; i < 3; i++) {
        const on = i === tier || i === this.fromTier;
        for (const m of this.tierMeshes[i]) { m.visible = on; m.material = m.userData.baseMat; }
      }
      if (tier !== 0 && from !== 0) this.chains.freeze();
    }
    if (this.fadeT > 0) {
      this.fadeT -= dt;
      if (this.fadeT <= 0) {
        for (const m of this.tierMeshes[this.fromTier] || []) { m.visible = false; m.material = m.userData.baseMat; }
        for (const m of this.tierMeshes[this.tier] || []) m.material = m.userData.baseMat;
        if (this.fromTier === 0) this.chains.freeze();
        this.fromTier = -1;
      } else {
        const lv = Math.max(1, Math.min(FADE_LEVELS - 1, Math.floor((1 - this.fadeT / FADE_T) * FADE_LEVELS)));
        if (lv !== this._lv) {
          this._lv = lv;
          const bank = this.sys.bank;
          for (const m of this.tierMeshes[this.tier]) m.material = bank.fadeOf(m.userData.baseMat, lv, 1);
          for (const m of this.tierMeshes[this.fromTier]) m.material = bank.fadeOf(m.userData.baseMat, lv, -1);
        }
      }
    }
  }

  setCasting(on) {
    if (on === this.casting) return;
    this.casting = on;
    const c = this.meshes.Caster;
    if (c) { c.visible = on; c.castShadow = on; }
  }

  /** What this person is drawing right now (gate surface). */
  info() {
    let draws = 0, tris = 0;
    const list = [];
    for (const t of this.tierMeshes) for (const m of t) {
      if (!m.visible) continue;
      const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      draws++; tris += n; list.push({ name: m.name, tris: Math.round(n) });
    }
    return { tier: this.tier, draws, tris: Math.round(tris), casting: this.casting, meshes: list };
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.skeleton.dispose();
    this.group.removeFromParent();
    this.actions.clear();
  }
}
