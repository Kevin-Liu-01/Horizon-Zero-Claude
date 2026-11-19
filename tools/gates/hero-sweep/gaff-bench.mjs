/**
 * Milestone 2 area D (wave 2) — the Boat Gaff's handling, in Node: Brea dressed (`bench.mjs makeBench`: the real
 * animator, the game's HeroRig with the stow kit, the real `Melee`), Oro's kit bound by the game's own code
 * (src/hero/orokit.js on public/models/armory/kit-oro.glb), the held gaff (src/combat/gaff.js HeldGaff on
 * public/models/armory/gaff-boat.glb) in the gaff layer's hand (src/entities/anim/gaffLayer.js), stepped at 60 Hz of sim
 * time, every step recorded and graded.
 *
 *   node tools/gates/hero-sweep/gaff-bench.mjs [--only gaffDraw,...] [--json out.json] [--commit <sha>]
 *
 * Rows (M2 briefs §7; the bars are the bow's and the lance's):
 *   KT1  Kevin's bars: 0 steps with a hand or forearm behind the head plane or above its shoulder (measure.mjs, the
 *        A107 measure), 0 steps with the gaff (butt, beak or hook) above her shoulders or behind her head
 *   KT2  W1: at the grip the palm within 0.010 m of the stowed gaff's grip socket; the wrist <= 60 deg flexion and
 *        <= 30 deg deviation while she holds it. W2: the gaff never moves at a change of owner (<= 0.02 m at its butt,
 *        beak and hook between the stowed copy and the held one). W3: a wrist moves <= 0.08 m a step
 *   KT3  request to ready: 250-350 ms (the draw); no swap over 650 ms
 * Each case runs in this process from a fresh reset; the cases are independent of order (every case resets the
 * gaff, the lance and the kit).
 */
import path from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { makeBench, step, reset, SPEEDS } from './bench.mjs';
import { buildSweep } from './measure.mjs';
import { THREE } from './load.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const D = 180 / Math.PI;

const quiet = console.log; console.log = () => {};
const R = await makeBench({ melee: true });
console.log = quiet;
const { an, model } = R;
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
const { HeroOroKit } = await import(path.join(ROOT, 'src/hero/orokit.js'));
const { ensureGaff, HeldGaff } = await import(path.join(ROOT, 'src/combat/gaff.js'));
await MeshoptDecoder.ready;
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const parse = (file) => { const b = readFileSync(path.join(ROOT, file)); return new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '', res, rej)); };

// ---- the hand-over, as HeroRig.grantOroKit does it (the row and the held mesh parsed here: no fetch in Node)
R.ctx.combat = R.combat;
const oro = new HeroOroKit({ model, ctx: R.ctx, get animator() { return an; } });
oro.entry = { root: (await parse('public/models/armory/kit-oro.glb')).scene };
oro.attach();
oro.owned = { gaff: true, windwall: false, pots: 0 }; oro._apply();
const hu = R.hero.update.bind(R.hero);
R.hero.update = (dt) => { hu(dt); an._oroKit = oro; oro.solve(dt); };
const gaff = ensureGaff(R.ctx);
gaff.owned = true;
gaff.prop = new HeldGaff({ assets: {} });
{
  const root = (await parse('public/models/armory/gaff-boat.glb')).scene;
  const inner = new THREE.Group(); inner.add(root);
  inner.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  inner.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
  const sockets = {};
  root.traverse((o) => { if (!o.isMesh && o !== root && o.parent?.isMesh) sockets[o.name] = o.position.clone(); });
  gaff.prop.sockets = sockets; gaff.prop.length = sockets.tip?.y ?? 0.625; gaff.prop.inner = inner; gaff.prop.group.add(inner);
}
const M = buildSweep(R, THREE);
// the pelvis's char forward at the rest pose, as a bone-local turn (so hipYawM reads 0 at her idle)
const PELVIS_FWD = new THREE.Quaternion();
{
  for (let i = 0; i < 30; i++) step(R);
  const q = an._liveW(an.b.pelvis.bone, new THREE.Quaternion());
  PELVIS_FWD.copy(q).invert();
}
const b = an.b;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _inv = new THREE.Matrix4();
const ch = (bone) => { bone.getWorldPosition(_v); return _v.applyMatrix4(_inv).toArray(); };

/** the visible gaff's butt, beak and hook tip, char: the held one in her hand, else the stowed copy */
function gaffPts() {
  const S = gaff.prop.sockets, g = gaff.prop.group;
  if (g.visible && g.parent) {
    root.updateWorldMatrix?.(true, false);
    const r = gaff.prop.inner.children[0];
    const at = (p) => _v.copy(p).applyMatrix4(r.matrixWorld).applyMatrix4(_inv).toArray();
    r.updateWorldMatrix(true, false);
    return { vis: 'held', butt: at(new THREE.Vector3(0, 0, 0)), tip: at(S.tip), hook: at(S.hookTip) };
  }
  const st = { butt: new THREE.Vector3(), tip: new THREE.Vector3(), grip: new THREE.Vector3() };
  if (!oro.gaffStow(st)) return { vis: 'none' };
  // the hook tip on the stowed copy: from the stowed frame (the same sockets, the hook side from the kit)
  const ax = st.tip.clone().sub(st.butt).normalize();
  const hk = new THREE.Vector3(); oro.gaffHookChar(hk, model);
  hk.applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));            // char -> world rotation
  const hp = S.hookTip;
  const hookW = st.butt.clone().addScaledVector(ax, hp.y).addScaledVector(hk.addScaledVector(ax, -hk.dot(ax)).normalize(), hp.z);
  const c = (w) => w.clone().applyMatrix4(_inv).toArray();
  return { vis: (oro._bits() & 1) ? 'none' : 'kit', butt: c(st.butt), tip: c(st.tip), hook: c(hookW) };
}
const root = model;
function wristAngles() {
  const el = new THREE.Vector3(), wr = new THREE.Vector3(), kn = new THREE.Vector3();
  an._charOf(b.loArmR.bone, el); an._charOf(b.handR.bone, wr);
  const mid = b.handR.bone.children.find((c) => /^middle_01/.test(c.name));
  if (!mid) return [0, 0];
  an._charOf(mid, kn);
  const f = wr.clone().sub(el).normalize(), h = kn.clone().sub(wr).normalize();
  an._liveW(b.handR.bone, _q);
  const g = an.melee?.gripDirL?.clone().applyQuaternion(_q) ?? new THREE.Vector3(0, 0, 1);
  const n = h.clone().cross(g).normalize();
  const n2 = n.clone().addScaledVector(f, -n.dot(f)).normalize(), g2 = f.clone().cross(n2);
  return [Math.atan2(h.dot(n2), h.dot(f)) * D, Math.atan2(h.dot(g2), h.dot(f)) * D];
}
function record(t) {
  model.updateMatrixWorld(true);
  _inv.copy(model.matrixWorld).invert();
  const G = an.gaffInfo();
  const r = { t: +t.toFixed(4), owner: G.owner, mode: G.mode, phase: G.phase, w: G.w, palmMiss: G.palmMiss };
  r.wristR = ch(b.handR.bone); r.elbowR = ch(b.loArmR.bone); r.shR = ch(b.upArmR.bone); r.shL = ch(b.upArmL.bone);
  r.head = ch(b.head.bone);
  const [fl, dv] = wristAngles(); r.flex = +fl.toFixed(2); r.dev = +dv.toFixed(2);
  Object.assign(r, gaffPts());
  r.stance = R.melee?.stance;
  // the body (KT7): the pelvis's yaw (its +Z in char, about +Y) and the shoulder line's (left -> right shoulder), and
  // the pelvis's position; the verb's phase from the layer
  r.verb = G.verb ?? null; r.verbPhase = G.verbPhase ?? '';
  r.pelvis = ch(b.pelvis.bone);
  { const q = an._liveW(b.pelvis.bone, new THREE.Quaternion()); const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q.multiply(PELVIS_FWD)); r.hipYawM = Math.atan2(f.x, f.z); }
  r.shYawM = Math.atan2(-(r.shR[2] - r.shL[2]), r.shR[0] - r.shL[0]) ;
  if (args.includes('--dbg')) { const g = oro._g; r.dbg = { off: g?.off?.toArray().map((x) => +x.toFixed(3)), shove: +(g?.shove ?? 0).toFixed(4), tilt: oro.tiltK, held: oro.held, follow: !!oro.follow, sq: oro.socket.quaternion.toArray().map((x) => +x.toFixed(3)), sp: oro.socket.position.toArray().map((x) => +x.toFixed(3)) }; }
  return r;
}
const fwd = (speed) => { const p = R.player; p.velocity.set(Math.sin(p.heading) * speed, 0, Math.cos(p.heading) * speed); p.moveSpeed = speed; };
const halt = () => { R.player.velocity.set(0, 0, 0); R.player.moveSpeed = 0; };
/** home: everything back where a case starts (gaff on its hanger, the lance holstered, standing) */
function home() {
  gaff.want = false; gaff.after = null; gaff.verbs?.cancel();
  for (let i = 0; i < 60; i++) step(R);
  reset(R);
  const G = an._gaffState(); G.mode = 0; G.owner = 'carry'; G.was = false; G.t = 0; G.settleT = 0; G.lastOk = false; oro.setHeld(0);
  gaff.prop.group.visible = false;
  for (let i = 0; i < 30; i++) step(R);
}
/** the cases: `go` asks, `secs` of steps are recorded (speed: forward at that speed) */
const CASES = {
  gaffDraw: { secs: 0.8, go: () => gaff.draw() },
  gaffStow: { pre: () => { gaff.draw(); for (let i = 0; i < 50; i++) step(R); }, secs: 0.8, go: () => gaff.stow() },
  gaffDrawJog: { speed: SPEEDS.jog, lead: 40, secs: 0.8, go: () => gaff.draw() },
  gaffStowJog: { speed: SPEEDS.jog, pre: () => { gaff.draw(); for (let i = 0; i < 50; i++) { fwd(SPEEDS.jog); step(R); } }, secs: 0.8, go: () => gaff.stow() },
  gaffDrawCrouch: { pre: () => { R.player.crouching = true; for (let i = 0; i < 40; i++) step(R); }, secs: 0.8, go: () => gaff.draw(), post: () => { R.player.crouching = false; } },
  gaffHeldJog: { speed: SPEEDS.jog, pre: () => { gaff.draw(); for (let i = 0; i < 40; i++) step(R); }, secs: 1.5, go: () => {} },
  gaffHeldSprint: { speed: SPEEDS.sprint, pre: () => { gaff.draw(); for (let i = 0; i < 40; i++) step(R); R.player.sprinting = true; }, secs: 1.5, go: () => {}, post: () => { R.player.sprinting = false; } },
  swapLanceToGaff: { pre: () => { R.melee.drawLance(); for (let i = 0; i < 60; i++) step(R); }, secs: 1.4, go: () => gaff.draw() },
  swapGaffToLance: { pre: () => { gaff.draw(); for (let i = 0; i < 50; i++) step(R); }, secs: 1.4, go: () => gaff.stow('lance') },
  // ---- the verbs (M2 wave 3): the three lights chained by presses inside the combo window, the hook-rip, from idle,
  // a jog and a crouch, and the interrupts (a stow or a swap asked mid-verb)
  ...verbCases(),
};
function verbCases() {
  const held = () => { gaff.draw(); for (let i = 0; i < 50; i++) step(R); };
  const heldJog = () => { gaff.draw(); for (let i = 0; i < 50; i++) { fwd(SPEEDS.jog); step(R); } };
  const heldCrouch = () => { R.player.crouching = true; gaff.draw(); for (let i = 0; i < 60; i++) step(R); };
  const up = () => { R.player.crouching = false; };
  // the chain: press at 0.14 s and 0.36 s (inside light 1's and light 2's windows)
  const chain = (i) => { if (i === 8 || i === 21) gaff.verbs.strike(); };
  const C = {
    lights: { pre: held, secs: 1.2, go: () => gaff.verbs.strike(), each: chain, verb: true },
    lightsJog: { speed: SPEEDS.jog, pre: heldJog, secs: 1.2, go: () => gaff.verbs.strike(), each: chain, verb: true },
    lightsCrouch: { pre: heldCrouch, secs: 1.2, go: () => gaff.verbs.strike(), each: chain, verb: true, post: up },
    hookRip: { pre: held, secs: 1.0, go: () => gaff.verbs.hookRip(), verb: true, rip: true },
    hookRipJog: { speed: SPEEDS.jog, pre: heldJog, secs: 1.0, go: () => gaff.verbs.hookRip(), verb: true },
    hookRipCrouch: { pre: heldCrouch, secs: 1.0, go: () => gaff.verbs.hookRip(), verb: true, post: up },
    // interrupts: the stow asked at the strike's contact, mid-recover, and a swap to the lance at the hook-rip's pull
    lightThenStow: { interrupt: true, pre: held, secs: 1.0, go: () => gaff.verbs.strike(), each: (i) => { if (i === 11) gaff.stow(); }, verb: true },
    light2ThenStow: { interrupt: true, pre: held, secs: 1.2, go: () => gaff.verbs.strike(), each: (i) => { if (i === 8) gaff.verbs.strike(); if (i === 26) gaff.stow(); }, verb: true },
    hookRipThenLance: { interrupt: true, pre: held, secs: 1.6, go: () => gaff.verbs.hookRip(), each: (i) => { if (i === 22) gaff.stow('lance'); }, verb: true },
    lightsThenHookRip: { interrupt: true, pre: held, secs: 1.6, go: () => gaff.verbs.strike(), each: (i) => { if (i === 8) gaff.verbs.strike(); if (i === 50) gaff.verbs.hookRip(); }, verb: true },
  };
  return C;
}

function grade(name, L, m) {
  const fails = [];
  const out = { name, steps: L.length };
  // KT1: hands and forearms (measure.mjs) and the gaff
  out.KT1 = { behind: m.behind, plane: m.plane, overShoulder: m.overShoulder ?? null, behindAt: m.behindAt ?? null, planeAt: m.planeAt ?? null };
  let propAbove = 0, propBehind = 0, propAboveMax = -9;
  for (const r of L) {
    if (r.vis === 'none' || !r.butt) continue;
    const shY = Math.min(r.shR[1], r.shL[1]);
    for (const p of [r.butt, r.tip, r.hook]) {
      propAboveMax = Math.max(propAboveMax, p[1] - shY);
      if (p[1] > shY) propAbove++;
      // behind the head: at head height (above the shoulders) and behind the head's frontal plane
      if (p[1] > shY && p[2] < r.head[2] - 0.02) propBehind++;
    }
  }
  out.KT1.propAboveShoulderSteps = propAbove; out.KT1.propBehindHeadSteps = propBehind; out.KT1.propAboveShoulderMaxM = +propAboveMax.toFixed(3);
  if (m.behind) fail(`KT1 ${m.behind} steps with a hand or forearm behind the head`);
  if (m.plane) fail(`KT1 ${m.plane} steps with a hand or forearm above the shoulder behind the head plane`);
  if (propAbove) fail(`KT1 the gaff above her shoulders ${propAbove} point-steps (max ${propAboveMax.toFixed(3)} m)`);
  if (propBehind) fail(`KT1 the gaff behind her head ${propBehind} point-steps`);
  // events
  const gi = L.findIndex((r, i) => i > 0 && r.owner === 'handR' && L[i - 1].owner !== 'handR');
  const ri = L.findIndex((r, i) => i > 0 && r.owner !== 'handR' && L[i - 1].owner === 'handR');
  out.events = { gripT: gi >= 0 ? L[gi].t : null, releaseT: ri >= 0 ? L[ri].t : null };
  // W1: the palm at the grip, the wrist while held
  const atGrip = gi >= 0 ? L[gi - 1].palmMiss ?? L[gi].palmMiss : null;
  let flex = 0, dev = 0;
  for (const r of L) if (r.owner === 'handR' || r.phase === 'C' || r.phase === 'D') { flex = Math.max(flex, Math.abs(r.flex)); dev = Math.max(dev, Math.abs(r.dev)); }
  out.W1 = { palmToGripAtTakeM: atGrip == null ? null : +atGrip.toFixed(4), wristFlexMaxDeg: +flex.toFixed(1), wristDevMaxDeg: +dev.toFixed(1) };
  if (atGrip != null && atGrip > 0.010) fail(`W1 the palm ${atGrip.toFixed(4)} m off the grip at the take (bar 0.010)`);
  if (flex > 60) fail(`W1 wrist flexion ${flex.toFixed(1)} deg (bar 60)`);
  if (dev > 30) fail(`W1 wrist deviation ${dev.toFixed(1)} deg (bar 30)`);
  // W2: no jump at a change of owner
  const jump = (i) => { if (i < 1) return null; const a = L[i - 1], c = L[i]; if (!a.butt || !c.butt) return null;
    return Math.max(...['butt', 'tip', 'hook'].map((k) => Math.hypot(a[k][0] - c[k][0], a[k][1] - c[k][1], a[k][2] - c[k][2]))); };
  const jg = jump(gi), jr = jump(ri);
  // (a moving hand carries it a little in one step: the step's own travel is taken out by the step before)
  const travel = (i) => { if (i < 2 || !L[i - 1].butt || !L[i - 2].butt) return 0; return Math.hypot(...[0, 1, 2].map((k) => L[i - 1].tip[k] - L[i - 2].tip[k])); };
  out.W2 = { atGripM: jg == null ? null : +jg.toFixed(4), atReleaseM: jr == null ? null : +jr.toFixed(4), stepBeforeGripM: +travel(gi).toFixed(4), stepBeforeReleaseM: +travel(ri).toFixed(4) };
  if (jg != null && jg - travel(gi) > 0.02) fail(`W2 the gaff jumped ${jg.toFixed(4)} m at the grip (its step before ${travel(gi).toFixed(4)})`);
  if (jr != null && jr - travel(ri) > 0.02) fail(`W2 the gaff jumped ${jr.toFixed(4)} m at the release (its step before ${travel(ri).toFixed(4)})`);
  // W3: the wrist's rate
  let w3 = 0, w3At = null;
  // (the steps the gaff layer holds the arm: a swap's lance draw is the lance's own row)
  for (let i = 1; i < L.length; i++) { if (!(L[i].w > 0) && !(L[i - 1].w > 0)) continue; if (L[i].verb || L[i - 1].verb) continue; const d = Math.hypot(...[0, 1, 2].map((k) => L[i].wristR[k] - L[i - 1].wristR[k])); if (d > w3) { w3 = d; w3At = L[i].t; } }
  out.W3 = { wristStepMaxM: +w3.toFixed(4), at: w3At };
  // (at a run the body itself carries the wrist ~0.08-0.11 m a step: the rate is graded standing; reported at a run)
  if (!CASES[name].speed && w3 > 0.08) fail(`W3 the right wrist moved ${w3.toFixed(3)} m in a step (bar 0.08, t ${w3At})`);
  // KT3: request to ready (the draw), swaps
  const readyI = L.findIndex((r, i) => i > 0 && r.mode === 0 && L[i - 1].mode === 1 && r.owner === 'handR');
  const homeI = L.findIndex((r, i) => i > 0 && r.mode === 0 && L[i - 1].mode === 2);
  out.KT3 = { readyS: readyI >= 0 ? L[readyI].t : null, homeS: homeI >= 0 ? L[homeI].t : null };
  if (/Draw/.test(name) && !(out.KT3.readyS >= 0.25 && out.KT3.readyS <= 0.35 + 1e-6)) fail(`KT3 draw request to ready ${out.KT3.readyS} s (band 0.25-0.35)`);
  if (name === 'swapLanceToGaff') { out.KT3.swapS = out.KT3.readyS; if (!(out.KT3.readyS <= 0.65)) fail(`KT3 swap lance to gaff ${out.KT3.readyS} s (bar 0.65)`); }
  if (name === 'swapGaffToLance') {
    const lr = L.findIndex((r) => r.stance === 'ready');
    out.KT3.swapS = lr >= 0 ? L[lr].t : null;
    if (!(out.KT3.swapS <= 0.65)) fail(`KT3 swap gaff to lance ${out.KT3.swapS} s (bar 0.65)`);
  }
  // KT7 (the verbs): in each strike the pelvis's yaw rate peaks >= 40 ms before the shoulder line's (standing); the
  // hook-rip's pull takes her pelvis back 0.10-0.25 m; the contacts
  if (CASES[name].verb) {
    const strikes = [];
    let cur = null;
    for (let i = 1; i < L.length; i++) {
      const r = L[i], p = L[i - 1];
      const on = r.verb && (r.verbPhase === 'S' || r.verbPhase === 'W' || r.verbPhase === 'P' || r.verbPhase === 'H');
      if (on && (!cur || cur.verb !== r.verb || (p.verbPhase === 'R' && r.verbPhase === 'W'))) { cur = { verb: r.verb, i0: i, i1: i }; strikes.push(cur); }
      if (on && cur) cur.i1 = i;
      if (!on) cur = null;
    }
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    out.KT7 = strikes.map((st) => {
      // (signed: the turn INTO the blow, the way the hip turns across the strike; a chained light's shoulders are still
      // finishing the last one's turn as its wind-up starts)
      let hv = 0, ht = null, sv = 0, stt = null;
      const iS = L.findIndex((r, i) => i >= st.i0 && r.verbPhase !== 'W');
      const sg = Math.sign(wrap(L[Math.min(L.length - 1, st.i1)].hipYawM - L[Math.max(0, iS)].hipYawM)) || 1;
      for (let i = Math.max(1, st.i0); i <= Math.min(L.length - 1, st.i1 + 6); i++) {
        const dh = sg * wrap(L[i].hipYawM - L[i - 1].hipYawM), ds = sg * wrap(L[i].shYawM - L[i - 1].shYawM);
        const own = L[i].verb === st.verb && L[i].verbPhase === 'W' && i <= st.i1;
        if (!own && dh > hv) { hv = dh; ht = L[i].t; }
        if (!own && ds > sv) { sv = ds; stt = L[i].t; }
      }
      return { verb: st.verb, hipPeakT: ht, shPeakT: stt, leadMs: ht != null && stt != null ? Math.round((stt - ht) * 1000) : null, hipRateDeg: +(hv * D).toFixed(2), shRateDeg: +(sv * D).toFixed(2) };
    });
    out.verbs = [...new Set(L.map((r) => r.verb).filter(Boolean))];
    if (!CASES[name].speed && !/Crouch/.test(name) && !CASES[name].interrupt) {
      for (const k of out.KT7) if (k.verb !== 'hookRip' && !(k.leadMs >= 40)) fail(`KT7 ${k.verb}: the hip leads the shoulders by ${k.leadMs} ms (bar 40)`);
    }
    if (CASES[name].rip) {
      const z0 = L[0].pelvis[2];
      const back = Math.max(...L.map((r) => z0 - r.pelvis[2]));
      out.KT7rip = { pelvisBackM: +back.toFixed(3) };
      if (!(back >= 0.10 && back <= 0.25)) fail(`KT7 the hook-rip takes her pelvis back ${back.toFixed(3)} m (band 0.10-0.25)`);
    }
    // the wrist's rate inside a swing (reported; W3 is graded outside the swings)
    let wv = 0; for (let i = 1; i < L.length; i++) { if (!L[i].verb) continue; wv = Math.max(wv, Math.hypot(...[0, 1, 2].map((k) => L[i].wristR[k] - L[i - 1].wristR[k]))); }
    out.swingWristStepMaxM = +wv.toFixed(4);
  }
  out.fails = fails;
  return out;
  function fail(s) { fails.push(s); }
}

const only = flag('--only') ? flag('--only').split(',') : Object.keys(CASES);
const res = { commit: flag('--commit', '?'), cases: {} };
const logs = {};
for (const name of only) {
  const c = CASES[name];
  home();
  if (c.lead) for (let i = 0; i < c.lead; i++) { fwd(c.speed); step(R); }
  c.pre?.();
  const L = [];
  M.begin(name);
  c.go();
  const N = Math.round(c.secs * 60);
  for (let i = 0; i < N; i++) {
    if (c.speed) fwd(c.speed); else halt();
    c.each?.(i);
    step(R);
    M.sample({ T: +((i + 1) / 60).toFixed(3) });
    L.push(record((i + 1) / 60));
  }
  const m = M.end();
  c.post?.(); halt();
  const g = grade(name, L, m);
  res.cases[name] = g;
  logs[name] = L;
  console.log(`${name.padEnd(16)} ${g.fails.length ? 'FAIL' : 'PASS'}  ` + JSON.stringify({ ev: g.events, KT3: g.KT3, W1: g.W1, W2: g.W2, W3: g.W3, KT7: g.KT7, KT7rip: g.KT7rip, verbs: g.verbs, swingStep: g.swingWristStepMaxM, KT1: { behind: g.KT1.behind, plane: g.KT1.plane, propAbove: g.KT1.propAboveShoulderSteps, propBehind: g.KT1.propBehindHeadSteps } }));
  for (const f of g.fails) console.log(`    - ${f}`);
}
const failing = Object.values(res.cases).filter((g) => g.fails.length).length;
res.summary = { cases: only.length, failing, clauses: Object.values(res.cases).reduce((n, g) => n + g.fails.length, 0) };
console.log(`gaff bench: ${only.length - failing}/${only.length} cases pass, ${res.summary.clauses} failing clauses`);
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(res, null, 1));
if (flag('--log')) writeFileSync(flag('--log'), JSON.stringify(logs));
process.exit(0);
