/**
 * M1.2e / M1.2f / M1.3c / M1.3f (hero-anim) — the sweep's offline bench: Brea dressed (`load.mjs`), her real
 * animator, the game's HeroRig (outfit, stow kit, carry solve) and, for the lance, the real `Melee`, stepped at
 * 60 Hz through the named clips, graded by `measure.mjs` (the function the page rows send as source). No browser.
 *
 *   node tools/gates/hero-sweep/bench.mjs [--only idle,run,crouch,roll,mantle,climb,slide,sit,...] [--json out.json]
 *
 * Stand-ins (the page does these for real): the player is a stub whose flags (velocity, crouching, dodging +
 * dodgeK, mantling + mantleK + mantleClip + mantleEdge, sliding, riding) are driven on player.js's own clocks and
 * distances; the ground is flat at 0 (a slide is the slide clip on flat ground); the wind is the NE trade wind.
 */
import { loadDressed, makeDressedRig, THREE } from './load.mjs';
import { buildSweep } from './measure.mjs';
import { writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

let simMs = 1000;
const PAGE_ORDER = args.includes('--page-order') || process.env.BENCH_PAGE_ORDER === '1';
/* a seeded Math.random: the animator draws its idle's breath, shift, fidget and blink phases from it at construction,
 * so the idle hands' hash (M1.3c) is a function of the code and the assets only */
let seed = 0x5eed;
const reseed = () => { seed = 0x5eed; };
Math.random = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Object.defineProperty(globalThis.performance, 'now', { value: () => simMs, configurable: true, writable: true });

export const SPEEDS = { walk: 1.5, crouch: 1.4, crouchAim: 1.05, aim: 1.35, jog: 5.0, sprint: 6.8 };

export async function makeBench({ melee = false, outfitFile = null } = {}) {
  const A = await loadDressed({ outfitFile });
  // (the stream is reseeded as the animator is built: loading and cloning draw from it too, for every object's uuid,
  // so a rig with more bones would otherwise hand the idle other phases)
  const { PlayerAnimator } = await import(path.join(ROOT, 'src/entities/playerAnimator.js'));
  class SeededAnimator extends PlayerAnimator { constructor(...a) { reseed(); super(...a); } }
  const R = await makeDressedRig(A, { Animator: SeededAnimator });
  const p = R.player;
  p.speeds = SPEEDS; p.dodgeK = 1; p.mantleK = 0; p.mantleClip = null; p.mantleEdge = { x: 0, y: 0, z: 0, dx: 0, dz: 1, valid: false };
  p.sprinting = false; p.setCrouch = (v) => { p.crouching = !!v; };
  R.t = 0;
  if (melee) {
    const quiet = console.log; console.log = () => {};
    const { Melee } = await import(path.join(ROOT, 'src/combat/melee.js'));
    const keys = new Set();
    const input = { keys, mouse: { buttons: 0 }, mouseDown(i) { return !!(this.mouse.buttons & (1 << i)); } };
    Object.assign(R.ctx, {
      input, machines: { list: [], roles: {}, noise() {} }, interactables: { register() {} },
      renderer: { info: { render: { frame: 0 } } }, engine: { timeScale: 1, simTime: 0, requestTimeScale() {} },
      hitHulls: { raycast() { return null; } }, settings: {},
      terrain: { getHeight() { return 0; }, getNormal(x, z, out) { return (out || new THREE.Vector3()).set(0, 1, 0); } },
    });
    p.addRecoil = () => {};
    R.melee = new Melee(R.ctx, R.combat);
    R.combat.melee = R.melee;
    console.log = quiet;
  }
  return R;
}

/** One 1/60 s frame, main.js's order: the player stub, the animator, the hero rig (kit, outfit), then combat. */
/* (M1a r3: --jitter <k> steps at 1/60 s times a factor in [1 - k, 1], every 23rd step a half step, from its own
 *  stream (--jitter-seed): main.js's smooth step mode splits a long frame into equal sub-steps of at most 1/60 s, so
 *  the page's steps are 1/60 s or shorter, never longer; its one crouch clip at dee526d came on a step the bench's
 *  fixed 1/60 s never took) */
const JIT = Number(flag('--jitter', process.env.BENCH_JITTER || 0));
const HALF = Number(flag('--half-every', 23));
let jSeed = Number(flag("--jitter-seed", 0x1234567)) >>> 0, jN = 0;
const jdt = () => { if (!JIT) return 1 / 60; jSeed = (Math.imul(jSeed, 1103515245) + 12345) >>> 0; const u = jSeed / 4294967296; return (HALF && ++jN % HALF === 0 ? 0.5 : 1 - JIT * u) / 60; };
export function step(R, dt = jdt(), hook = null) {
  const { player: p, an, model, ctx } = R;
  simMs += dt * 1000;
  R.t += dt; R.lastDt = dt;
  if (ctx.engine) ctx.engine.simTime = R.t;
  if (ctx.renderer) ctx.renderer.info.render.frame++;
  if (hook) hook(R, dt);
  p.position.addScaledVector(p.velocity, dt);
  model.position.copy(p.position); model.rotation.y = p.heading;
  // (--page-order: as the page runs it, the world matrices are last frame's render's while the animator and the hero
  //  rig run, and are brought up to date only at the render after them)
  if (!PAGE_ORDER) model.updateMatrixWorld(true);
  p.drawStrength = R.combat.drawStrength;
  an.update(dt, R.t);
  R.hero?.update(dt);
  if (R.melee) R.melee.update(dt, true);
  if (PAGE_ORDER) model.updateMatrixWorld(true);
}

export function reset(R) {
  const p = R.player;
  if (R.melee && R.melee.stance !== 'holstered') { R.melee.holsterLance(); for (let i = 0; i < 90 && R.melee.stance !== 'holstered'; i++) step(R); }
  p.position.set(0, 0, 0); p.velocity.set(0, 0, 0); p.heading = 0; p.camYaw = Math.PI; p.camPitch = 0;
  p.aiming = false; p.crouching = false; p.crouchAim = false; p.moveSpeed = 0; p.dodging = false; p.dodgeK = 1;
  p.mantling = false; p.mantleK = 0; p.mantleClip = null; p.mantleEdge.valid = false; p.sliding = false; p.riding = null; p.grounded = true;
  R.combat.drawStrength = 0; R.combat.weaponDrawn = false;
  if (R.melee) R.melee.aimLock = 0;
  for (let i = 0; i < 90; i++) step(R);
}

const fwd = (R, speed) => { const p = R.player; p.velocity.set(Math.sin(p.heading) * speed, 0, Math.cos(p.heading) * speed); p.moveSpeed = speed; };

/**
 * The named clips. Each runs a lead-in (not sampled), then calls `S(st)` every frame it is graded.
 * `cloth`: the cloth points are graded; `run`: the wrist and case rows.
 */
export const CLIPS = {
  idle: { cloth: true, run: (R, S) => { for (let i = 0; i < 180; i++) { step(R); S(); } } },
  stand: { cloth: true, run: (R, S) => { for (let i = 0; i < 120; i++) { step(R); S(); } } },
  run: { cloth: true, wrists: true, run: (R, S) => { for (let i = 0; i < 60; i++) { fwd(R, SPEEDS.jog); step(R); } for (let i = 0; i < 180; i++) { fwd(R, SPEEDS.jog); step(R); S(); } } },
  sprint: { cloth: true, wrists: true, run: (R, S) => { R.player.sprinting = true; for (let i = 0; i < 60; i++) { fwd(R, SPEEDS.sprint); step(R); } for (let i = 0; i < 240; i++) { fwd(R, SPEEDS.sprint); step(R); S(); } R.player.sprinting = false; } },
  crouch: { cloth: true, run: (R, S) => { R.player.crouching = true; for (let i = 0; i < 45; i++) step(R); for (let i = 0; i < 90; i++) { step(R); S(); } for (let i = 0; i < 90; i++) { fwd(R, SPEEDS.crouch); step(R); S(); } } },
  roll: { cloth: true, run: (R, S) => {
    const p = R.player; for (let i = 0; i < 30; i++) { fwd(R, SPEEDS.jog); step(R); }
    p.dodging = true; const N = Math.round(0.82 * 60);
    // (--jitter: the roll on the clock, as player.js runs it; else the fixed 1/60 s steps as before)
    if (JIT) { for (let k = 0; ;) { const dt = jdt(); k = Math.min(1, k + dt / 0.82); p.dodgeK = k; fwd(R, 3.4 / 0.82); step(R, dt); S(); if (k >= 1) break; } }
    else for (let i = 0; i <= N; i++) { p.dodgeK = i / N; fwd(R, 3.4 / 0.82); step(R); S(); }
    p.dodging = false; p.dodgeK = 1; for (let i = 0; i < 30; i++) { fwd(R, SPEEDS.jog); step(R); S(); }
  } },
  // (M1.2e round 2: 1.4 m, as the page row now stages it: player.js finds no wall under 0.9 m, so 0.6 m never mantled)
  mantle: { cloth: true, run: (R, S) => mantleRun(R, S, 1.4, null, 0.42) },
  climb: { cloth: true, run: (R, S) => mantleRun(R, S, 1.0, 'climb1m', 0.78) },
  slide: { cloth: true, run: (R, S) => {
    const p = R.player; p.sliding = true; for (let i = 0; i < 20; i++) { fwd(R, 2.6); step(R); }
    for (let i = 0; i < 120; i++) { fwd(R, 2.6); step(R); S(); }
    p.sliding = false; for (let i = 0; i < 40; i++) { fwd(R, 1.0); step(R); S(); }
  } },
  // M1.2f / M1.3f: the stow and unstow of the lance (melee.js drawLance / holsterLance, from standing and from a jog)
  // and of the bow (combat's weaponDrawn: the bow from the back to the left hand's carry and back)
  unstowLance: { melee: true, run: (R, S) => { R.melee.drawLance(30); for (let i = 0; i < 70; i++) { step(R); S(); } } },
  stowLance: { melee: true, run: (R, S) => { R.melee.drawLance(30); for (let i = 0; i < 70; i++) step(R); R.melee.holsterLance(); for (let i = 0; i < 70; i++) { step(R); S(); } } },
  unstowLanceJog: { melee: true, run: (R, S) => { for (let i = 0; i < 40; i++) { fwd(R, SPEEDS.jog); step(R); } R.melee.drawLance(30); for (let i = 0; i < 70; i++) { fwd(R, SPEEDS.jog); step(R); S(); } } },
  stowLanceAim: { melee: true, run: (R, S) => { R.melee.drawLance(30); for (let i = 0; i < 70; i++) step(R); R.melee.holsterLance(true); for (let i = 0; i < 50; i++) { step(R); S(); } } },
  unstowBow: { run: (R, S) => { R.combat.weaponDrawn = 'bow'; for (let i = 0; i < 60; i++) { step(R); S(); } } },
  stowBow: { run: (R, S) => { R.combat.weaponDrawn = 'bow'; for (let i = 0; i < 60; i++) step(R); R.combat.weaponDrawn = false; for (let i = 0; i < 60; i++) { step(R); S(); } } },
  // M1.3f: the kite's hang pose, the static blockout (an.setHangPose), graded by `hangCheck` too
  hang: { cloth: true, run: (R, S) => { R.an.setHangPose(true); for (let i = 0; i < 60; i++) { step(R); S(); } R.hangCheck = R.M.hangCheck(); R.hangInfo = R.an.hangPoseInfo(); R.an.setHangPose(false); } },
  // (M1a r3 fix: the page's mantle row jogs to the ledge pressing Space, so it JUMPS first where the wall is not yet in
  //  reach: a jog jump and its landing, then the same from standing, as player.js emits them)
  jump: { run: (R, S) => { const p = R.player, ev = R.ctx.events; for (let i = 0; i < 30; i++) { fwd(R, SPEEDS.jog * 0.5); step(R); }
    for (const sp of [SPEEDS.jog * 0.5, 0]) { ev.emit('player-jump', { v0: 5 }); p.grounded = false; for (let i = 0; i < 34; i++) { fwd(R, sp); step(R); S(); } p.grounded = true; ev.emit('player-land', { fall: 1.2 }); for (let i = 0; i < 40; i++) { fwd(R, sp); step(R); S(); } } } },
  // (M1a r3 fix: the page's two lance-and-roll blend pairs, hero-sweep.mjs blendUnstowLanceRoll / blendRollUnstowLance)
  blendUnstowLanceRoll: { melee: true, run: (R, S) => { R.melee.drawLance(30); for (let i = 0; i < 15; i++) { step(R); S(); } rollRun(R, S); for (let i = 0; i < 30; i++) { step(R); S(); } } },
  blendRollUnstowLance: { melee: true, run: (R, S) => { for (let i = 0; i < 24; i++) { fwd(R, SPEEDS.jog); step(R); } rollRun(R, S, () => { if (!R._ul && R.player.dodgeK >= 0.48) { R._ul = 1; R.melee.drawLance(30); } }); R._ul = 0; for (let i = 0; i < 60; i++) { step(R); S(); } } },
  sit: { cloth: true, run: (R, S) => { const p = R.player; p.riding = {}; p.grounded = false; for (let i = 0; i < 60; i++) step(R); for (let i = 0; i < 120; i++) { step(R); S(); } p.riding = null; p.grounded = true; } },
  /* M1a debt (M1.3f): blendUnstowLanceRoll on HALF steps (main.js's smooth step mode splits a long frame into equal
   * sub-steps; the page's one behind-head step at e3d549b, crown, left hand, came on such a step), the roll on
   * player.js's own clock and root-motion curve from a standing start, as the page's row runs it */
  blendUnstowLanceRollHalf: { melee: true, run: (R, S) => { const dt = 1 / 120, p = R.player; R.melee.drawLance(30); for (let i = 0; i < 30; i++) { step(R, dt); S(dt); }
    p.dodging = true; let tt = 0, prog0 = 0; const hx = Math.sin(p.heading), hz = Math.cos(p.heading);
    for (;;) { tt += dt; const k = tt / 0.82; if (k >= 1) break; p.dodgeK = k; const prog = R.an.rollProgress(k) ?? k; const st = Math.max(0, prog - prog0) * 3.4; prog0 = prog; p.velocity.set(hx * st / dt, 0, hz * st / dt); p.moveSpeed = st / dt; step(R, dt); S(dt); }
    p.dodging = false; p.dodgeK = 1; p.velocity.set(0, 0, 0); p.moveSpeed = 0; for (let i = 0; i < 60; i++) { step(R, dt); S(dt); } } },
  /* M1.3h (the clip audit for the slice's other verbs): the Alidade raise (ctx.sighting.on: the animator's E5 overlay,
   * right hand to the right eye). Graded: 0 behind and 0 plane steps, and (R.aliFrontMin) the right wrist in front
   * of the head's frontal plane on every step of the hold (the raise's weight over 0.9) */
  alidade: { run: (R, S) => { R.ctx.sighting = { on: true }; R.aliFrontMin = 9; for (let i = 0; i < 20; i++) { step(R); S(); }
    for (let i = 0; i < 120; i++) { step(R); S(); if ((R.an._ali?.w ?? 0) > 0.9) { const h = R.M.hangCheck(); R.aliFrontMin = Math.min(R.aliFrontMin, h.r.front); } }
    R.ctx.sighting = { on: false }; for (let i = 0; i < 30; i++) { step(R); S(); } R.ctx.sighting = null; } },
};
/** M1.3h: the slice's verbs with no clip in the tree yet: none (src/entities/anim/sliceVerbs.js; their rows are
 *  ./verbs-bench.mjs in Node and the page's A-sweep-saltRake, -kindle, -caneCut). */
export const VERB_STUBS = {};

/** a roll (0.82 s, 3.4 m) as player.js runs it; `each` is called every step before it */
function rollRun(R, S, each = null) {
  const p = R.player; p.dodging = true; const N = Math.round(0.82 * 60);
  for (let i = 0; i <= N; i++) { p.dodgeK = i / N; each?.(); fwd(R, 3.4 / 0.82); step(R); S(); }
  p.dodging = false; p.dodgeK = 1; p.velocity.set(0, 0, 0); p.moveSpeed = 0;
}

function mantleRun(R, S, rise, clip, dur) {
  const p = R.player;
  for (let i = 0; i < 30; i++) { fwd(R, SPEEDS.jog * 0.5); step(R); }
  p.velocity.set(0, 0, 0); p.moveSpeed = 0;
  const F = p.position.clone();
  p.mantleEdge.x = F.x + Math.sin(p.heading) * 0.35; p.mantleEdge.z = F.z + Math.cos(p.heading) * 0.35; p.mantleEdge.y = rise;
  p.mantleEdge.dx = Math.sin(p.heading); p.mantleEdge.dz = Math.cos(p.heading); p.mantleEdge.valid = true;
  p.mantling = true; p.mantleClip = clip; p.grounded = false;
  const N = Math.round(dur * 60);
  // (--jitter: the mantle on the clock, as player.js runs it; else the fixed 1/60 s steps as before)
  let kc = 0;
  for (let i = 0; ; i++) {
    const dt = JIT ? jdt() : 1 / 60;
    if (JIT) kc = i === 0 ? 0 : Math.min(1, kc + dt / dur);
    const k = JIT ? kc : i / N; p.mantleK = k;
    const e = k * k * (3 - 2 * k);
    p.position.y = rise * Math.min(1, e * 1.6);
    const f = Math.max(0, (e - 0.35) / 0.65);
    p.position.x = F.x + p.mantleEdge.dx * 0.8 * f; p.position.z = F.z + p.mantleEdge.dz * 0.8 * f;
    p.velocity.set(0, 0, 0);
    step(R, dt); S();
    if (JIT ? k >= 1 : i >= N) break;
  }
  p.mantling = false; p.mantleClip = null; p.mantleEdge.valid = false; p.grounded = true;
  for (let i = 0; i < 30; i++) { step(R); S(); }
}

/** The idle hands' hash (M1.3c): on a rig built from the seeded Math.random and stepped nowhere else first: reset,
 *  3 s of idle from t = 0, both arms' bones hashed every 0.25 s. */
export function idleHash(R, M, which = 'hands') {
  M.useBones(which);
  R.t = 0; simMs = 1000;
  // every idle phase the animator draws at random, fixed (its constructor draws them after other objects' uuids, so
  // their values would follow the number of bones), and the stream reseeded for the draws the idle makes as it runs
  const an = R.an;
  an._breathPh = 0.25; an._shiftPh = 0.5; an._shift = 0; an._fidgetT = 7; an._fidgetK = 1; an._fidgetKind = 0; an._blinkT = 3; an._blinkK = 1;
  if (an.loco?.actions?.idle) an.loco.actions.idle.time = 0;     // (locomotion.js starts the idle clip at a random time)
  reseed();
  reset(R); R.t = 0;
  M.hashReset();
  const trace = [];
  for (let i = 1; i <= 180; i++) { step(R); if (i % 15 === 0) { M.hashPose(); trace.push(M.tracePose()); } }
  R.idleTrace = trace;
  return M.hashHex();
}

/** The largest angle (deg) between two traces' matching local rotations. */
export function traceDeg(a, b) {
  let mx = 0;
  for (let s = 0; s < Math.min(a.length, b.length); s++) for (let i = 0; i < a[s].length; i += 4) {
    // (the chord between the two unit quaternions, sign-aligned: 4 asin(|dq| / 2) is the angle, and exact at 0)
    const sg = a[s][i] * b[s][i] + a[s][i + 1] * b[s][i + 1] + a[s][i + 2] * b[s][i + 2] + a[s][i + 3] * b[s][i + 3] < 0 ? -1 : 1;
    let c = 0; for (let k = 0; k < 4; k++) c += (a[s][i + k] - sg * b[s][i + k]) ** 2;
    mx = Math.max(mx, 4 * Math.asin(Math.min(1, Math.sqrt(c) / 2)) * 180 / Math.PI);
  }
  return mx;
}

/**
 * M1.2e "tail and panels stream SW in the trade wind": standing 3 s at each of four headings, the tips' mean world
 * position with the trade wind on against the same 3 s in still air; the bearing the wind moves each tip toward
 * (compass: north -Z, east +X; the NE trade wind blows toward 225 deg), and how far.
 */
export function windStream(R) {
  const an = R.an, out = [];
  const tips = () => an._chains.filter((c) => /wrapSash|panel/.test(c.links[0].name)).map((c) => ({ name: c.links[0].name.replace(/^dyn_|_01$/g, ''), c }));
  // (M1a r3 fix: + F02's and F15's own headings, bearing 258 and 315 -> heading 180 - bearing: the page row's places)
  for (const hd of [0, Math.PI / 2, Math.PI, -Math.PI / 2, -78 * Math.PI / 180, -135 * Math.PI / 180]) {
    const mean = {};
    for (const on of [true, false]) {
      reset(R); R.player.heading = hd;
      if (on) an.setWind(45 * Math.PI / 180, 5.5); else an.setWind(0, 0);
      for (let i = 0; i < 90; i++) step(R);
      const acc = {}; let n = 0;
      for (let i = 0; i < 180; i++) { step(R); n++; for (const t of tips()) { const k = t.c.N * 3; (acc[t.name] ||= [0, 0, 0]); acc[t.name][0] += t.c.pos[k]; acc[t.name][1] += t.c.pos[k + 1]; acc[t.name][2] += t.c.pos[k + 2]; } }
      for (const k in acc) acc[k] = acc[k].map((v) => v / n);
      mean[on ? 'on' : 'off'] = acc;
    }
    for (const k in mean.on) {
      const dx = mean.on[k][0] - mean.off[k][0], dz = mean.on[k][2] - mean.off[k][2];
      let brg = Math.atan2(dx, -dz) * 180 / Math.PI; if (brg < 0) brg += 360;
      out.push({ heading: +(hd * 180 / Math.PI).toFixed(0), tip: k, bearing: +brg.toFixed(1), moveM: +Math.hypot(dx, dz).toFixed(3), ok: Math.abs(brg - 225) <= 45 });
    }
  }
  an.setWind(45 * Math.PI / 180, 5.5);
  return out;
}

async function main() {
  // --control-outfit <glb>: grade another build of the outfit (the same geometry, another skin), its panels found by
  // the bind positions of this tree's chain-skinned panels
  let panelBind = null;
  if (flag('--control-outfit')) { const R0 = await makeBench(); panelBind = buildSweep(R0, THREE).panelBindList(); }
  const R = await makeBench({ outfitFile: flag('--control-outfit'), melee: true });
  const M = buildSweep(R, THREE, { panelBind });
  R.M = M;
  const out = { counts: M.counts, caps: M.caps, clips: {} };
  out.idleHash = idleHash(R, M);
  out.handTrace = R.idleTrace;
  out.armHash = idleHash(R, M, 'arms');
  out.armTrace = R.idleTrace;
  M.useBones('hands');
  // M1.3c: against the reference trace taken on 340a562 (before M1.2e), the hands' and the arms' largest change
  try {
    const ref = JSON.parse(readFileSync(path.join(ROOT, 'tools/gates/hero-sweep/idle-ref.json'), 'utf8'));
    out.idleVsRef = { ref: ref.commit, handHashRef: ref.handHash, handHashSame: ref.handHash === out.idleHash, handMaxDeg: +traceDeg(ref.handTrace, out.handTrace).toFixed(4), armMaxDeg: +traceDeg(ref.armTrace, out.armTrace).toFixed(4) };
  } catch { out.idleVsRef = null; }
  const only = flag('--only') ? flag('--only').split(',') : Object.keys(CLIPS);
  for (const name of only) {
    const c = CLIPS[name]; if (!c) continue;
    reset(R);
    M.begin(name);
    let T = 0;
    c.run(R, (dt = 1 / 60) => { T += dt; M.sample({ T: +T.toFixed(3), cloth: c.cloth, run: c.wrists }); });
    out.clips[name] = M.end();
    if (name === 'alidade') { out.clips.alidade.aliFrontMin = +R.aliFrontMin.toFixed(4); console.log('alidade right wrist in front of the head plane, min over the hold', out.clips.alidade.aliFrontMin); }
    if (name === 'hang') { out.clips.hang.hang = R.hangCheck; out.clips.hang.bar = R.hangInfo; console.log('hang', JSON.stringify(R.hangCheck), JSON.stringify(R.hangInfo)); }
  }
  for (const [k, v] of Object.entries(VERB_STUBS)) if (!flag('--only') || flag('--only').split(',').includes(k)) console.log(k.padEnd(8), 'SKIP: no clip in the tree (' + v + ')');
  if (!flag('--only') || flag('--only').split(',').includes('wind')) { out.wind = windStream(R); for (const w of out.wind) console.log('wind', JSON.stringify(w)); }
  console.log(JSON.stringify({ counts: out.counts, caps: out.caps, idleHash: out.idleHash, armHash: out.armHash, idleVsRef: out.idleVsRef }));
  if (flag('--write-idle-ref')) writeFileSync(flag('--write-idle-ref'), JSON.stringify({ commit: flag('--ref-commit', '?'), handHash: out.idleHash, armHash: out.armHash, handTrace: out.handTrace, armTrace: out.armTrace }));
  for (const [k, r] of Object.entries(out.clips)) {
    console.log(k.padEnd(8), `frames ${r.frames} behind ${r.behind} plane ${r.plane} overSh ${r.overShoulder} | clip ${r.clipFrames} deep ${r.clipDeepest} ${JSON.stringify(r.clipBy)} worst ${JSON.stringify(r.clipWorst)} hang ${r.panelHangMin} near ${r.clipNear} ${r.clipNearAt ? JSON.stringify(r.clipNearAt) : ''}${r.wristMid != null ? ` | wristMid ${r.wristMid} foreCase ${r.foreCase}` : ''}${r.behindAt ? ' behindAt ' + JSON.stringify(r.behindAt) : ''}${r.planeAt ? ' planeAt ' + JSON.stringify(r.planeAt) : ''}`);
  }
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
