/**
 * M1.3h — THE SLICE'S OTHER VERBS on Brea (BUILD M1.3h; BIBLE §11.2 0:00-0:21): the salt rake, the cane cut and the
 * kindle. (The Alidade raise is the aim rig's E5 overlay, `_alidadeLayer`; the seat at the Brazier is `player.ride`'s
 * `sitIdle`. Both are graded by the same rows.)
 *
 * Each verb is a native UAL2 clip from the people's clip pack (public/models/npc/npc-clips.glb, the same 65-joint UBC
 * skeleton as hers, played with no retarget as her climb and slide are; `ctx.people.bank.clipPack`), weighted onto her
 * mixer against the locomotion tree, plus what the clip does not carry:
 *   rake     Farm_Harvest held in its bent window and scrubbed by the stroke (the body pumps with each pull), the
 *            RAKE PROP (a 1.75 m haft and a tined head) laid from its head on the ground ahead of her to the upper grip,
 *            and BOTH ARMS SOLVED ONTO THE HAFT (two-bone IK, elbows down and out): the right palm at the upper grip,
 *            the left 0.55 m down the haft. Two strokes of 1.5 s: out with the head lifted, back with it on the ground.
 *   caneCut  Farm_Harvest once through from standing (bend, cut at the base with the right hand, gather, rise), a
 *            short cane knife in the right fist.
 *   kindle   Farm_PlantSeed once through from standing (kneel at the bowl, lay the wood, rise), a driftwood stick in
 *            the right fist.
 * Kevin's bar (BIBLE §5.2): never an arm or hand behind the head. Every verb is graded by the sweep's own test
 * (tools/gates/hero-sweep/measure.mjs), a row each (tools/gates/hero-sweep/verbs-bench.mjs in Node; the A-sweep-*
 * rows in the page).
 *
 * TRIGGERS (no other lane's file is edited for them): the interactables' 'loot-rummage' event whose entry label is the
 * slice's rake or cut-cane prompt (src/game/runtime.js registers them with the writing's own words), and the Brazier's
 * 'brazier-kindled' event. `animator.playVerb(name, { face })` is the published hook (gates, the Frame Set).
 * A verb does not start with a weapon out, aiming, rolling, seated or dead, and ends early, fading out in 0.25 s, the
 * moment she moves, aims, rolls or sits. Nothing allocates per frame; the props are built once on first use.
 *
 * Installed onto `PlayerAnimator.prototype` (`installMethods`); `this` is the animator.
 */
import * as THREE from 'three';
import { clamp } from './playerCommon.js';

export const VERBS = Object.freeze({
  rake: Object.freeze({ clip: 'Farm_Harvest', mode: 'scrub', win: [0.7, 0.5], strokes: 3, stroke: 1.4, fadeIn: 0.4, fadeOut: 0.6, prop: 'rake' }),
  caneCut: Object.freeze({ clip: 'Farm_Harvest', mode: 'once', from: 2.12, fadeIn: 0.3, fadeOut: 0.35, prop: 'knife' }),
  kindle: Object.freeze({ clip: 'Farm_PlantSeed', mode: 'once', from: 2.36, fadeIn: 0.3, fadeOut: 0.35, prop: 'stick' }),
});

/**
 * The rake (metres, char space: +x her left, +z ahead, y up from her feet). A short-hafted salt rake worked from a deep
 * bend: the upper (right) hand at the haft's end in front of her belly, the left hand LOWER down it, the head on the
 * ground ahead. Her arms are short (0.47 m shoulder to wrist): the hands are 0.27 m apart and the haft runs from the belly,
 * so both reach it from the bent shoulders without straining.
 */
export const RAKE = Object.freeze({
  haft: 1.62, gripR: 1.54, gripL: 1.33, headX: 0.0, end: 0.08,
  // the upper grip with the head out (k = 1) and pulled in (k = 0)
  out: Object.freeze([-0.06, 0.64, 0.38]), in: Object.freeze([-0.08, 0.72, 0.2]),
  outK: 0.34, lift: 0.05,
  // the elbows: the pulling (right) one back along her side, the lower (left) one down
  poleR: [-0.35, -0.45, -0.85], poleL: [0.45, -0.85, -0.2],
});

const _H = new THREE.Vector3(), _R = new THREE.Vector3(), _Lg = new THREE.Vector3(), _d = new THREE.Vector3();
const _t = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _pole = new THREE.Vector3();
const _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4();
const SIDES = ['r', 'l'], PROPS = ['rake', 'knife', 'stick'];
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

/** A unit-free wood material for every prop (one material, one program). */
let _wood = null, _steel = null;
function woodMat() { return _wood || (_wood = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.86, metalness: 0 })); }
function steelMat() { return _steel || (_steel = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.42, metalness: 0.75 })); }

/** The rake's geometry: the haft along +Y from the head at the origin, the head a bar across X with nine tines down. */
function rakeGeometry() {
  const parts = [];
  const haft = new THREE.CylinderGeometry(0.015, 0.017, RAKE.haft, 8, 1);
  haft.translate(0, RAKE.haft / 2 + 0.02, 0);
  parts.push(haft);
  const bar = new THREE.BoxGeometry(0.44, 0.04, 0.045);
  bar.translate(0, 0.03, 0);
  parts.push(bar);
  for (let i = 0; i < 9; i++) {
    const t = new THREE.BoxGeometry(0.012, 0.07, 0.014);
    t.translate(-0.2 + i * 0.05, -0.02, 0.01);
    parts.push(t);
  }
  return mergeSimple(parts);
}

/** Merge non-indexed copies of simple geometries (position + normal only). */
function mergeSimple(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  for (const g of list) g.dispose();
  for (const g of geos) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.computeBoundingSphere();
  return out;
}

export class SliceVerbs {
  /**
   * Start a verb ('rake' | 'caneCut' | 'kindle'). `opts.face` { x, z } (world) turns her to it first. Returns the verb's
   * length in seconds, or 0 when it cannot start (no clip pack yet, a weapon out, aiming, rolling, seated, dead).
   */
  playVerb(name, opts = {}) {
    const V = VERBS[name];
    const p = this.ctx.player;
    if (!V || !p) return 0;
    if (this._verbBlocked(p)) return 0;
    const clip = this._verbClip(V.clip);
    if (!clip) return 0;
    const S = this._vb || (this._vb = { name: null, on: false, t: 0, w: 0, len: 0, a: null, actions: {}, info: null, props: {} });
    let a = S.actions[V.clip];
    if (!a) {
      a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.enabled = true; a.weight = 0; a.timeScale = 0; a.play();
      S.actions[V.clip] = a;
    }
    if (S.a && S.a !== a) S.a.weight = 0;
    S.a = a; S.name = name; S.V = V; S.on = true; S.t = 0;
    S.dur = clip.duration;
    S.len = V.mode === 'scrub' ? V.strokes * V.stroke : clip.duration;
    if (opts.face && Number.isFinite(opts.face.x)) {
      const dx = opts.face.x - p.position.x, dz = opts.face.z - p.position.z;
      if (dx * dx + dz * dz > 0.04) p.heading = Math.atan2(dx, dz);
    }
    S.started = (S.started || 0) + 1;
    return S.len;
  }

  /** The verb now: { name, t, w, len, phase, rake: { head, gripR, gripL, palmR, palmL } } (rows and the Frame Set). */
  verbInfo() {
    const S = this._vb;
    if (!S) return null;
    return { name: S.name, on: S.on, t: +S.t.toFixed(3), w: +S.w.toFixed(3), len: S.len, started: S.started || 0, rake: S.info };
  }

  _verbBlocked(p) {
    const c = this.ctx.combat;
    return !!(p.aiming || p.dodging || p.riding || p.mantling || this.ctx.state === 'dead' || c?.weaponDrawn
      || (c?.melee?.stance && c.melee.stance !== 'holstered') || (p.moveSpeed ?? 0) > 0.4);
  }

  /** The clip from the people's pack (her body is the F body: native UAL2 clips are not rescaled for it). */
  _verbClip(name) {
    const src = this.ctx.verbClips?.[name] || this.ctx.people?.bank?.clipPack?.of?.('F', name) || null;
    return src || null;
  }

  /** Before `mixer.update` (after `_nativeLayer`): the verb's clip weight and time. */
  _verbNative(p, dt, dead) {
    if (!this._vbHooked) this._verbHook();
    const S = this._vb;
    if (!S || !S.a) return;
    const V = S.V;
    if (S.on) {
      S.t += dt;
      if (S.t >= S.len || dead || this._verbBlocked(p)) S.on = false;
    }
    const rate = S.on ? 1 / V.fadeIn : 1 / V.fadeOut;
    S.w = S.on ? Math.min(1, S.w + dt * rate) : Math.max(0, S.w - dt * rate * (S.t >= S.len ? 1 : 1.4));
    if (S.w <= 0 && !S.on) { S.a.weight = 0; S.a.time = 0; this._verbProps(null); return; }
    let time;
    if (V.mode === 'scrub') {
      // the stroke: out (the first OUT_K of it, the head lifted), then the pull on the ground; the body's clip time follows
      // the head: the bend deepest with it out, the rise as it comes in
      const u = (S.t % V.stroke) / V.stroke;
      const k = u < RAKE.outK ? 1 - smooth(u / RAKE.outK) : smooth((u - RAKE.outK) / (1 - RAKE.outK));
      time = V.win[0] + (V.win[1] - V.win[0]) * k;
      S.u = u;
    } else {
      time = (V.from + Math.min(S.t, S.len)) % S.dur;
    }
    S.a.time = time;
    const e = smooth(S.w);
    S.a.weight = e >= 0.999 ? 60 : e / (1 - e);
  }

  /** After every body layer, before the twists and the chains: the rake's arms on the haft, the props. */
  _verbLayer() {
    const S = this._vb;
    if (!S || !(S.w > 0.002)) return;
    const w = smooth(S.w);
    if (S.V.prop === 'rake') this._rakeLayer(S, w);
    else this._verbProps(S.V.prop);
    if (S.V.prop !== 'rake') {
      this._curlFingers(this._fingerR, 1.15 * w, 0.8 * w);
    }
  }

  _rakeLayer(S, w) {
    const p = this.ctx.player, T = this.ctx.terrain;
    const u = S.u ?? 0;
    // the head: out over the first OUT_K of the stroke (lifted), back along the ground
    const k = u < RAKE.outK ? smooth(u / RAKE.outK) : 1 - smooth((u - RAKE.outK) / (1 - RAKE.outK));
    const lift = u < RAKE.outK ? RAKE.lift * Math.sin(Math.PI * u / RAKE.outK) : 0;
    // the upper grip, then the head on the ground (or lifted) GRIP_R m down the haft from it, straight ahead of it
    _R.fromArray(RAKE.in).lerp(_t.fromArray(RAKE.out), k);
    _w.set(_R.x, 0, _R.z + 1);
    this.model.localToWorld(_w);
    let gy = 0;
    if (T?.getHeight) { _t.set(_w.x, T.getHeight(_w.x, _w.z), _w.z); this.model.worldToLocal(_t); gy = _t.y; }
    const hy = gy + 0.02 + lift, dy = _R.y - hy, dh = Math.sqrt(Math.max(0.01, RAKE.gripR * RAKE.gripR - dy * dy));
    const dx = RAKE.headX - _R.x, dz = Math.sqrt(Math.max(0.01, dh * dh - dx * dx));
    _H.set(RAKE.headX, hy, _R.z + dz);
    _d.subVectors(_R, _H).normalize();
    _Lg.copy(_H).addScaledVector(_d, RAKE.gripL);
    // both arms onto the haft: the palm (between the wrist and the middle knuckle) on its grip, twice (the hand's own
    // offset moves with the solve)
    for (let si = 0; si < 2; si++) {
      const side = SIDES[si], goal = si === 0 ? _R : _Lg;
      _t.copy(goal);
      for (let it = 0; it < 6; it++) {
        _pole.fromArray(side === 'r' ? RAKE.poleR : RAKE.poleL);
        this._ikArm(side, _t, _pole, w, null);
        this._palmOf(side, _p);
        _w.subVectors(goal, _p);
        if (_w.lengthSq() < 1e-6) break;
        _t.add(_w);
      }
    }
    this._curlFingers(this._fingerR, 1.2 * w, 0.85 * w);
    this._curlFingers(this._fingerL, 1.2 * w, 0.85 * w);
    // the prop: from the head toward the upper grip
    const R = this._verbPropMesh('rake');
    if (R) {
      _q.setFromUnitVectors(_up, _d);
      R.position.copy(_H); R.quaternion.copy(_q);
      R.updateMatrix();
    }
    // the rake is in her hands while the hands are on it (over half weight): no fade of the prop itself
    this._verbProps(w > 0.5 ? 'rake' : null);
    // the row's surface: the haft and the achieved palms (char space)
    const I = S.info || (S.info = { head: [0, 0, 0], gripR: [0, 0, 0], gripL: [0, 0, 0], palmR: [0, 0, 0], palmL: [0, 0, 0], ground: 0 });
    _H.toArray(I.head); _R.toArray(I.gripR); _Lg.toArray(I.gripL);
    this._palmOf('r', _p); _p.toArray(I.palmR);
    this._palmOf('l', _p); _p.toArray(I.palmL);
    I.ground = gy;
  }

  /** The palm's centre (char space): half way from the wrist to the middle finger's first knuckle. */
  _palmOf(side, out) {
    const r = side === 'r', hb = r ? this.bones.hand_r : this.bones.hand_l, kb = r ? this.bones.middle_01_r : this.bones.middle_01_l;
    this._charOf(hb, out);
    if (kb) { this._charOf(kb, _p2); out.lerp(_p2, 0.5); }
    return out;
  }

  /** The prop mesh by kind, built once: the rake in the model's frame, the knife and the stick in the right fist. */
  _verbPropMesh(kind) {
    const S = this._vb;
    if (S.props[kind] !== undefined) return S.props[kind];
    let m = null;
    try {
      if (kind === 'rake') {
        m = new THREE.Mesh(rakeGeometry(), woodMat());
        m.name = 'verb-rake';
        m.matrixAutoUpdate = false;
        this.model.add(m);
      } else {
        const hand = this.bones.hand_r, idx = this.bones.index_01_r, pky = this.bones.pinky_01_r, mid = this.bones.middle_01_r;
        if (hand && idx && pky && mid) {
          // the fist's axis: across the knuckles, pinky to index (hand-local, from the bind), through the palm's centre
          this.model.updateMatrixWorld(true);
          _m.copy(hand.matrixWorld).invert();
          const a = new THREE.Vector3().setFromMatrixPosition(pky.matrixWorld).applyMatrix4(_m);
          const b = new THREE.Vector3().setFromMatrixPosition(idx.matrixWorld).applyMatrix4(_m);
          const c = new THREE.Vector3().setFromMatrixPosition(mid.matrixWorld).applyMatrix4(_m);
          const axis = b.clone().sub(a).normalize();
          const palm = c.clone().multiplyScalar(0.55);
          let geo;
          if (kind === 'knife') {
            const blade = new THREE.BoxGeometry(0.006, 0.2, 0.032); blade.translate(0, 0.16, 0.004);
            const grip = new THREE.CylinderGeometry(0.014, 0.015, 0.12, 8); grip.translate(0, 0, 0);
            geo = mergeSimple([grip]);
            const bladeGeo = mergeSimple([blade]);
            m = new THREE.Group();
            m.add(new THREE.Mesh(geo, woodMat()), new THREE.Mesh(bladeGeo, steelMat()));
          } else {
            geo = new THREE.CylinderGeometry(0.018, 0.024, 0.48, 7); geo.translate(0, 0.12, 0);
            m = new THREE.Mesh(geo, woodMat());
          }
          m.name = `verb-${kind}`;
          m.position.copy(palm);
          m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
          // the hand's bone may carry a scale: undo it so the prop keeps its metres
          const s = new THREE.Vector3().setFromMatrixScale(hand.matrixWorld), sm = new THREE.Vector3().setFromMatrixScale(this.model.matrixWorld);
          m.scale.set(sm.x / (s.x || 1), sm.y / (s.y || 1), sm.z / (s.z || 1));
          hand.add(m);
        }
      }
    } catch { m = null; }
    if (m) m.visible = false;
    S.props[kind] = m;
    return m;
  }

  /** Show the prop of `kind` (null: none). */
  _verbProps(kind) {
    const S = this._vb;
    if (!S) return;
    for (let i = 0; i < PROPS.length; i++) {
      const k = PROPS[i], m = k === kind ? this._verbPropMesh(k) : S.props[k];
      if (m) m.visible = k === kind;
    }
  }

  /** The triggers: the slice's rake and cut-cane interactions (by their prompt), and a Brazier kindled. Once. */
  _verbHook() {
    this._vbHooked = true;
    const ev = this.ctx.events;
    if (!ev?.on) return;
    ev.on('loot-rummage', (e) => {
      const P = this.ctx.systemsGame?.S?.systems?.prompts;
      const label = e?.label ?? e?.entry?.label;
      if (!P || !label) return;
      const at = e.position || e.entry?.position || null;
      if (label === P.rake) this.playVerb('rake', { face: at });
      else if (label === P.cut) this.playVerb('caneCut', { face: at });
    });
    ev.on('brazier-kindled', (e) => {
      const b = this.ctx.braziers?.byId?.(e?.id);
      this.playVerb('kindle', { face: b?.obj?.position || null });
    });
  }
}

const _p2 = new THREE.Vector3();
