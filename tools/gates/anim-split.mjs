/**
 * M1.3a — THE ANIMATOR SPLIT'S NO-CHANGE PROOF (hero-anim).
 *
 * Run with the runner's `--extra` so no other lane's suite picks these rows up:
 *
 *   node tools/gates.mjs --port <p> --extra tools/gates/anim-split.mjs --only A-pose-hash-record
 *   CAL_POSE_TAPES=<abs path of tapes.json> CAL_POSE_PRESPLIT=/src/entities/<copy>.js \
 *     node tools/gates.mjs --port <p> --extra tools/gates/anim-split.mjs --only A-pose-hash-replay
 *
 * HOW A POSE HASH IS MADE. Twelve reference clips are played LIVE through the real input path
 * (keys and mouse bits, Instruments frozen) while every input the animator reads is recorded on
 * each `animator.update`: the dt and t, the player's own fields, combat's, the lance's, Steady's,
 * the lance pose state the animator was handed, the model's transform, the camera, `ctx.state`,
 * Sighting, the renderer frame id and the events the animator listens to. The game loop is then
 * stopped and each tape is REPLAYED into a fresh animator of the class under test, built on the
 * real model from one reset state (the model subtree restored, every skeleton put in its bind
 * pose) with `Math.random` seeded, reading the tape through overlays (`Object.create` of the
 * real player, combat and lance, so anything not taped is the real object's). After every replayed
 * step every node under the model is hashed (name, local position, quaternion, scale, visibility,
 * parent), exactly, on the IEEE bits. The clip hash folds every step.
 *
 * Same code, same tape -> the same hash (each class is replayed twice to show it). A pure code
 * move -> the same hash as the class it was moved from. The tapes are saved by the record run and
 * replayed by the replay run, so BEFORE and AFTER are compared on identical input.
 *
 * COMPARE IN ONE PAGE. The reset state is the bind pose for every bone, but the props under the model
 * (the stowed lance, bow and quiver) keep the transforms the live game left when the world stopped, and
 * the ground the conform reads is whatever terrain the tree has; neither is the same from one page to
 * the next. So BEFORE is the pre-split class served beside the split one (CAL_POSE_PRESPLIT, a copy of
 * the old file in src/entities/), replayed from the same reset in the same page. Hashes from two pages
 * are not comparable.
 */
import { placed } from '../gate-places.mjs';

export const CLIPS = [
  // name, frames, schedule: [frame, op, arg]; ops: hold/up (key), tap (key press for 2 frames), mouse+/mouse- (bit), hurt
  ['idle-hit', 150, [[60, 'hurt', 14]]],
  ['jog', 150, [[0, 'hold', 'KeyW']]],
  ['jog-stop', 150, [[0, 'hold', 'KeyW'], [70, 'up', 'KeyW']]],
  ['sprint', 150, [[0, 'hold', 'KeyW'], [0, 'hold', 'ShiftLeft']]],
  ['turn-run', 150, [[0, 'hold', 'KeyA'], [70, 'up', 'KeyA'], [70, 'hold', 'KeyD']]],
  ['crouch-walk', 150, [[0, 'tap', 'KeyC'], [10, 'hold', 'KeyW'], [130, 'up', 'KeyW'], [135, 'tap', 'KeyC']]],
  ['aim-draw-loose', 170, [[0, 'mouse+', 4], [30, 'mouse+', 1], [110, 'mouse-', 1], [140, 'mouse-', 4]]],
  ['crouch-aim-move', 170, [[0, 'tap', 'KeyC'], [6, 'mouse+', 4], [20, 'hold', 'KeyA'], [80, 'up', 'KeyA'],
    [80, 'hold', 'KeyW'], [90, 'mouse+', 1], [150, 'mouse-', 1], [150, 'up', 'KeyW'], [160, 'mouse-', 4], [165, 'tap', 'KeyC']]],
  ['dodge-roll', 140, [[0, 'hold', 'KeyW'], [40, 'tap', 'ControlLeft'], [110, 'up', 'KeyW']]],
  ['jump', 140, [[0, 'hold', 'KeyW'], [30, 'tap', 'Space'], [110, 'up', 'KeyW']]],
  ['lance-combo', 230, [[0, 'tap', 'KeyB'], [50, 'mouse+', 1], [53, 'mouse-', 1], [75, 'mouse+', 1], [78, 'mouse-', 1],
    [100, 'mouse+', 1], [103, 'mouse-', 1], [140, 'mouse+', 1], [175, 'mouse-', 1]]],
  ['lance-aim-stow', 170, [[0, 'tap', 'KeyB'], [60, 'mouse+', 4], [160, 'mouse-', 4]]],
];

/** Page-side: the tape codec, the recorder, the reset, the replayer and the hash. */
const HARNESS = String.raw`
  const C = __CTX__, G = __GAME__, p = C.player;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const V3 = p.position.constructor, Q4 = p.model.quaternion.constructor, EU = p.model.rotation.constructor;
  const ANIM_EVENTS = ['player-hurt', 'player-damage', 'player-jump', 'player-land', 'player-mantle', 'item-gained',
    'herb-gathered', 'cache-found', 'fieldbook-found', 'arrow-fired'];

  const enc = (v, d, src = false) => {
    if (v === undefined) return { u: 1 };
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return { p: v };
    if (typeof v === 'number') return Number.isFinite(v) ? { p: v } : { n: String(v) };
    if (typeof v !== 'object') return null;
    if (v.isVector3) return { v3: [v.x, v.y, v.z] };
    if (v.isQuaternion) return { q: [v.x, v.y, v.z, v.w] };
    if (v.isEuler) return { e: [v.x, v.y, v.z, v.order] };
    if (v.isVector2) return { o: { x: { p: v.x }, y: { p: v.y } } };
    if (d > 2) return null;
    if (Array.isArray(v)) {
      if (v.length > 32) return null;
      const a = v.map((x) => enc(x, d + 1, src));
      return a.every(Boolean) ? { a } : null;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null && d > 0) {
      // a class instance below the top is never taped (the replay reads the real one), except an
      // event's damage source, of which only the position is read
      return src && v.position?.isVector3 ? { o: { position: { v3: [v.position.x, v.position.y, v.position.z] } } } : null;
    }
    const o = {}; let n = 0;
    for (const k of Object.keys(v)) {
      const e = enc(v[k], d + 1, src);
      if (e) { o[k] = e; if (++n > 64) return null; }
    }
    return { o };
  };
  const dec = (e) => {
    if (!e || e.u) return undefined;
    if ('p' in e) return e.p;
    if (e.n) return Number(e.n);
    if (e.v3) return new V3(e.v3[0], e.v3[1], e.v3[2]);
    if (e.q) return new Q4(e.q[0], e.q[1], e.q[2], e.q[3]);
    if (e.e) return new EU(e.e[0], e.e[1], e.e[2], e.e[3]);
    if (e.a) return e.a.map(dec);
    if (e.o) { const o = {}; for (const k in e.o) o[k] = dec(e.o[k]); return o; }
    return undefined;
  };
  /** own enumerable fields, one level of plain objects, vectors by value */
  const snapObj = (o) => {
    const out = {};
    if (!o || typeof o !== 'object') return out;
    for (const k of Object.keys(o)) { if (k === 'ctx') continue; const e = enc(o[k], 1); if (e) out[k] = JSON.stringify(e); }
    return out;
  };
  const delta = (prev, cur) => {
    const set = {}, del = [];
    for (const k in cur) if (prev[k] !== cur[k]) set[k] = cur[k];
    for (const k in prev) if (!(k in cur)) del.push(k);
    return { set, del };
  };

  /* ------------------------------------------------------------- recorder */
  const recorder = () => {
    const an0 = p.animator, M = C.combat?.melee;
    const R = { on: false, frames: [], events: [], prev: null, pose: null };
    const origUpdate = an0.update;
    const origPose = M?.poseState;
    if (M && origPose) M.poseState = function () { const r = origPose.call(this); if (R.on) R.pose = JSON.stringify(enc(r, 0)); return r; };
    const origEmit = C.events.emit;
    C.events.emit = function (name, payload, ...rest) {
      if (R.on && ANIM_EVENTS.includes(name)) R.events.push({ i: R.frames.length, name, payload: JSON.stringify(enc(payload, 0, true)) });
      return origEmit.call(this, name, payload, ...rest);
    };
    an0.update = function (dt, t) {
      let cur = null;
      if (R.on) {
        const cam = C.camera;
        cam.updateMatrixWorld(true);
        cur = {
          P: snapObj(p), CB: snapObj(C.combat), ML: snapObj(C.combat?.melee), ST: snapObj(C.combat?.steady),
          X: JSON.stringify({ dt, t, state: C.state, sight: !!C.sighting?.on, rf: C.renderer?.info?.render?.frame ?? null,
            m: [...p.model.position.toArray(), ...p.model.quaternion.toArray(), ...p.model.scale.toArray()],
            cam: Array.from(cam.matrixWorld.elements), lens: [cam.fov, cam.aspect, cam.near, cam.far, cam.zoom] }),
        };
        R.pose = null;
      }
      const r = origUpdate.call(this, dt, t);
      if (R.on) {
        cur.PS = R.pose;
        const prev = R.prev || { P: {}, CB: {}, ML: {}, ST: {} };
        R.frames.push({ X: cur.X, PS: cur.PS, P: delta(prev.P, cur.P), CB: delta(prev.CB, cur.CB),
          ML: delta(prev.ML, cur.ML), ST: delta(prev.ST, cur.ST) });
        R.prev = cur;
      }
      return r;
    };
    R.restore = () => { an0.update = origUpdate; if (M && origPose) M.poseState = origPose; C.events.emit = origEmit; };
    return R;
  };

  const play = async (R, clip) => {
    const [name, n, sched] = clip;
    const I = C.input;
    const tape = { name, frames: [], events: [] };
    R.frames = tape.frames; R.events = tape.events; R.prev = null;
    const ups = [];
    let f = 0;
    R.on = true;
    while (tape.frames.length < n && f < n * 4) {
      const i = tape.frames.length;
      for (const [at, op, arg] of sched) {
        if (at !== i || (op !== 'hurt' && sched._done?.has(at + op + arg))) continue;
        (sched._done ||= new Set()).add(at + op + arg);
        if (op === 'hold') I._press(arg, {});
        else if (op === 'up') I.keys.delete(arg);
        else if (op === 'tap') { I._press(arg, {}); ups.push([i + 2, arg]); }
        else if (op === 'mouse+') I.mouse.buttons |= arg;
        else if (op === 'mouse-') I.mouse.buttons &= ~arg;
        else if (op === 'hurt' && !sched._hurt) {
          sched._hurt = 1;
          const from = { position: p.position.clone().add(new V3(1.5, 0, 2)) };
          C.events.emit('player-damage', { amount: arg, from });
        }
      }
      for (let k = ups.length - 1; k >= 0; k--) if (ups[k][0] <= i) { I.keys.delete(ups[k][1]); ups.splice(k, 1); }
      await frame(); f++;
    }
    R.on = false;
    I.keys.clear(); I.mouse.buttons = 0;
    return tape;
  };

  /* ------------------------------------------------------------- reset */
  const subtree = () => { const a = []; p.model.traverse((o) => a.push(o)); return a; };
  const extras = () => [C.combat?.bow?.group, p.animator?.melee?.lance].filter(Boolean);
  const snapshotS0 = () => {
    const list = [...new Set([...subtree(), ...extras()])];
    return list.map((o) => ({ o, parent: o.parent, pos: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), vis: o.visible }));
  };
  const restoreS0 = (S0) => {
    const known = new Set(S0.map((r) => r.o));
    for (const o of subtree()) if (!known.has(o) && o.parent) o.parent.remove(o);
    for (const r of S0) {
      if (r.o.parent !== r.parent) { if (r.parent) r.parent.add(r.o); else r.o.parent?.remove(r.o); }
      r.o.position.copy(r.pos); r.o.quaternion.copy(r.q); r.o.scale.copy(r.s); r.o.visible = r.vis;
    }
    p.model.updateMatrixWorld(true);
    const seen = new Set();
    p.model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton && !seen.has(o.skeleton)) { seen.add(o.skeleton); o.skeleton.pose(); } });
    p.model.updateMatrixWorld(true);
  };

  /* ------------------------------------------------------------- hash */
  const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  const mixer = () => {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
    const w = (x) => { a = Math.imul(a ^ x, 0x01000193) >>> 0; b = Math.imul(b ^ x, 0x5bd1e995) >>> 0; b ^= b >>> 15; };
    return { num(v) { F64[0] = v; w(U32[0]); w(U32[1]); }, str(s) { for (let i = 0; i < s.length; i++) w(s.charCodeAt(i)); w(0xff); },
      hex() { return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0'); } };
  };
  const poseHash = () => {
    const h = mixer();
    p.model.traverse((o) => {
      h.str(o.name || o.type); h.str(o.parent ? (o.parent.name || o.parent.type) : '-');
      h.num(o.position.x); h.num(o.position.y); h.num(o.position.z);
      h.num(o.quaternion.x); h.num(o.quaternion.y); h.num(o.quaternion.z); h.num(o.quaternion.w);
      h.num(o.scale.x); h.num(o.scale.y); h.num(o.scale.z); h.num(o.visible ? 1 : 0);
    });
    for (const o of extras()) { h.str(o.parent ? (o.parent.name || o.parent.type) : '-'); h.num(o.position.x); h.num(o.position.y); h.num(o.position.z);
      h.num(o.quaternion.x); h.num(o.quaternion.y); h.num(o.quaternion.z); h.num(o.quaternion.w); }
    return h.hex();
  };

  /* ------------------------------------------------------------- replay */
  const mulberry = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const setOwn = (o, k, v) => Object.defineProperty(o, k, { value: v, writable: true, configurable: true, enumerable: true });
  const plainOrValue = (x) => x == null || typeof x !== 'object' || x.isVector3 || x.isQuaternion || x.isEuler || x.isVector2
    || Array.isArray(x) || Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null;
  const applyDelta = (ov, d) => {
    for (const k in d.set) {
      if (k === 'ctx' || !plainOrValue(Object.getPrototypeOf(ov)[k])) continue;
      const v = dec(JSON.parse(d.set[k]));
      const own = Object.prototype.hasOwnProperty.call(ov, k) ? ov[k] : undefined;
      if (own && v && ((own.isVector3 && v.isVector3) || (own.isQuaternion && v.isQuaternion))) own.copy(v);
      else if (own && v && own.isEuler && v.isEuler) own.copy(v);
      else setOwn(ov, k, v);
    }
    for (const k of d.del) delete ov[k];
  };
  const replay = async (Cls, tape, S0, seed) => {
    restoreS0(S0);
    const mathRandom = Math.random;
    Math.random = mulberry(seed);
    const hp = Object.create(p), hcb = Object.create(C.combat), hst = C.combat?.steady ? Object.create(C.combat.steady) : null;
    const hml = C.combat?.melee ? Object.create(C.combat.melee) : null;
    let curPose = null;
    if (hml) { setOwn(hml, 'poseState', () => curPose); setOwn(hcb, 'melee', hml); }
    if (hst) setOwn(hcb, 'steady', hst);
    const hcam = C.camera.clone();
    const L = new Map();
    const hev = { on(n, fn) { if (!L.has(n)) L.set(n, []); L.get(n).push(fn); }, off() {}, once(n, fn) { this.on(n, fn); },
      emit(n, e) { for (const fn of L.get(n) || []) fn(e); } };
    const hctx = Object.create(C);
    for (const [k, v] of Object.entries({ player: hp, combat: hcb, camera: hcam, events: hev, state: C.state,
      sighting: { on: false }, renderer: { info: { render: { frame: 0 } } } })) setOwn(hctx, k, v);
    const step = (i) => {
      const f = tape.frames[i];
      const X = JSON.parse(f.X);
      applyDelta(hp, f.P); applyDelta(hcb, f.CB); if (hml) applyDelta(hml, f.ML); if (hst) applyDelta(hst, f.ST);
      curPose = f.PS ? dec(JSON.parse(f.PS)) : null;
      p.model.position.fromArray(X.m, 0); p.model.quaternion.fromArray(X.m, 3); p.model.scale.fromArray(X.m, 7);
      hcam.matrixWorld.fromArray(X.cam); hcam.matrixWorld.decompose(hcam.position, hcam.quaternion, hcam.scale);
      [hcam.fov, hcam.aspect, hcam.near, hcam.far, hcam.zoom] = X.lens; hcam.updateProjectionMatrix(); hcam.updateMatrixWorld(true);
      hctx.state = X.state; hctx.sighting.on = X.sight; hctx.renderer.info.render.frame = X.rf;
      return X;
    };
    const out = { hashes: [], err: null };
    let an = null;
    try {
      step(0);
      an = new Cls(hctx, p.model);
      const k0 = new Set(Object.keys(an));
      const roll = mixer();
      for (let i = 0; i < tape.frames.length; i++) {
        const X = i === 0 ? JSON.parse(tape.frames[0].X) : step(i);
        for (const ev of tape.events) if (ev.i === i) hev.emit(ev.name, dec(JSON.parse(ev.payload)));
        an.update(X.dt, X.t);
        const hh = poseHash();
        out.hashes.push(hh); roll.str(hh);
      }
      out.clip = roll.hex();
      out.lateFields = Object.keys(an).filter((k) => !k0.has(k));   // fields first written after the constructor (BACKLOG I3)
    } catch (err) {
      out.err = String(err && err.stack || err).slice(0, 600);
    } finally {
      try { an?.disposeMelee?.(); } catch (e) { /* */ }
      Math.random = mathRandom;
      restoreS0(S0);
    }
    return out;
  };
  const stopWorld = () => {
    for (const m of C.machines?.list || []) m.update = () => {};
  };
  const stage = () => {
    standAt(p, 'openGround');
    const M = C.combat?.melee;
    M?.holsterLance?.();
  };
`;

const CLIPS_SRC = JSON.stringify(CLIPS);
const TAPES_URL = process.env.CAL_POSE_TAPES ? '/@fs' + process.env.CAL_POSE_TAPES : null;
const PRESPLIT = process.env.CAL_POSE_PRESPLIT || null;

export const GATES = [
  {
    id: 'A-pose-hash-record', kind: 'action', lane: 'hero-anim', timeout: 600000, settle: 1500,
    title: 'M1.3a: record the 12 reference clips live, replay each twice into the current animator class, publish the tapes and the pose hashes',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {
      ${HARNESS}
      const clips = ${CLIPS_SRC};
      stopWorld();
      C.state = 'playing';
      const R = recorder();
      const tapes = [];
      for (const clip of clips) {
        stage();
        for (let i = 0; i < 45; i++) await frame();
        tapes.push(await play(R, clip));
        for (let i = 0; i < 20; i++) await frame();
      }
      R.restore();
      G._simulate = () => {};          // the world stops; the renderer keeps drawing
      for (let i = 0; i < 3; i++) await frame();
      const S0 = snapshotS0();
      const Cls = p.animator.constructor;
      const rows = [];
      for (const tape of tapes) {
        const a = await replay(Cls, tape, S0, 1234567);
        await frame();
        const b = await replay(Cls, tape, S0, 1234567);
        rows.push({ clip: tape.name, frames: tape.frames.length, events: tape.events.length, hash: a.clip, again: b.clip,
          repeatable: a.clip === b.clip && !a.err, err: a.err || b.err || null,
          firstDiff: a.hashes.findIndex((h, i) => h !== b.hashes[i]), hashes: a.hashes });
      }
      const ok = rows.every((r) => r.repeatable && r.frames > 100);
      return { pass: ok, detail: { cls: Cls.name, rows, tapes } };
    })()`),
  },
  {
    id: 'A-pose-hash-replay', kind: 'action', lane: 'hero-anim', timeout: 600000, settle: 1500,
    title: 'M1.3a: replay the recorded tapes into the current animator class (twice) and into the pre-split copy; publish the pose hashes',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {
      ${HARNESS}
      const url = ${JSON.stringify(TAPES_URL)};
      if (!url) return { pass: false, detail: 'CAL_POSE_TAPES is not set' };
      const saved = await (await fetch(url)).json();
      stopWorld();
      stage();
      for (let i = 0; i < 60; i++) await frame();
      G._simulate = () => {};
      for (let i = 0; i < 3; i++) await frame();
      const S0 = snapshotS0();
      const Cls = p.animator.constructor;
      const pre = ${JSON.stringify(PRESPLIT)} ? (await import(${JSON.stringify(PRESPLIT)})).PlayerAnimator : null;
      const rows = [];
      for (const tape of saved.tapes) {
        const a = await replay(Cls, tape, S0, 1234567);
        await frame();
        const b = await replay(Cls, tape, S0, 1234567);
        const c = pre ? await replay(pre, tape, S0, 1234567) : null;
        rows.push({ clip: tape.name, frames: tape.frames.length, hash: a.clip, again: b.clip, presplit: c?.clip ?? null,
          err: a.err || b.err || c?.err || null, repeatable: a.clip === b.clip, sameAsPresplit: c ? c.clip === a.clip : null,
          firstDiffVsPresplit: c ? a.hashes.findIndex((h, i) => h !== c.hashes[i]) : null, lateFields: a.lateFields, hashes: a.hashes });
      }
      const ok = rows.every((r) => r.repeatable && r.sameAsPresplit !== false && !r.err);
      return { pass: ok, detail: { cls: Cls.name, presplit: !!pre, rows } };
    })()`),
  },
];
