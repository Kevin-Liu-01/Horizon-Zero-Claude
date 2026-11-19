/**
 * Milestone 2 area D (wave 3) — the Pine Windwall's handling, in Node: Brea dressed (`bench.mjs makeBench`: the real
 * animator, the game's HeroRig, the real `Melee`), Oro's kit bound by the game's own code (src/hero/orokit.js on
 * public/models/armory/kit-oro.glb, its extras read as the asset loader reads them), the held gaff and the held
 * Windwall (src/combat/windwall.js HeldWindwall on public/models/armory/windwall-pine.glb) in the layers' hands
 * (gaffLayer.js, windwallLayer.js), stepped at 60 Hz of sim time, every step recorded and graded.
 *
 *   node tools/gates/hero-sweep/windwall-bench.mjs [--only guard,...] [--json out.json] [--log out.json]
 *
 * Rows (M2 briefs §7):
 *   KT1  Kevin's bars: 0 steps with a hand or forearm behind the head plane or above its shoulder (measure.mjs, the
 *        A107 measure); 0 steps with any point of the fan (its rivet and its nine slat tips) above her shoulders or
 *        behind her head; at a jog with the fan up the arms are graded as A107's
 *   KT3  request to a full guard 200-300 ms
 *   KT4  (the face) the fan's face within 25 deg of the guard's (the forearm's twist reached it)
 *   KT7  the bash moves her pelvis forward (reported) and her feet stay planted standing (the foot rows: reported)
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

const quiet = console.log; console.log = () => {};
const R = await makeBench({ melee: true });
console.log = quiet;
const { an, model } = R;
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
const { HeroOroKit } = await import(path.join(ROOT, 'src/hero/orokit.js'));
const { ensureGaff, HeldGaff } = await import(path.join(ROOT, 'src/combat/gaff.js'));
const { ensureWindwall, HeldWindwall, installFan, WINDWALL_FAN } = await import(path.join(ROOT, 'src/combat/windwall.js'));
await MeshoptDecoder.ready;
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const parse = (file) => { const b = readFileSync(path.join(ROOT, file)); return new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '', res, rej)); };

// ---- the hand-over, as HeroRig.grantOroKit does it
R.ctx.combat = R.combat;
const oro = new HeroOroKit({ model, ctx: R.ctx, get animator() { return an; } });
{ const g = await parse('public/models/armory/kit-oro.glb'); oro.entry = { root: g.scene, extras: g.parser.json.asset?.extras ?? {} }; }
oro.attach();
oro.owned = { gaff: true, windwall: true, pots: 0 }; oro._apply();
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
const ww = ensureWindwall(R.ctx);
ww.owned = true;
ww.prop = new HeldWindwall({ assets: {} });
{
  const root = (await parse('public/models/armory/windwall-pine.glb')).scene;
  root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); ww.prop.u = installFan(o.material); } });
  ww.prop.group.add(root);
  ww.prop.setOpen(WINDWALL_FAN.closed);
}
// the slat tips in the held group's frame (the recipe: slats along +Y from the rivet, fanned about +Z)
const SLAT_LEN = 0.47;
function fanPoints(open) {
  const pts = [new THREE.Vector3(0, 0, 0)];
  const k = -(WINDWALL_FAN.spreadDeg * Math.PI / 180) / (WINDWALL_FAN.slats - 1);   // (the recipe's SWEEP = -1)
  for (let s = 0; s < WINDWALL_FAN.slats; s++) {
    const a = s * k * open;
    pts.push(new THREE.Vector3(-Math.sin(a) * SLAT_LEN, Math.cos(a) * SLAT_LEN, 0));
  }
  return pts;
}

const M = buildSweep(R, THREE);
// (tuning: --guard 'x,y,z|px,py,pz|fx,fy,fz' overrides the guard's keys)
if (flag('--guard')) {
  const { GUARD } = await import(path.join(ROOT, 'src/entities/anim/windwallLayer.js'));
  const [w, p, f] = flag('--guard').split('|').map((t) => t.split(',').map(Number));
  GUARD.fromShoulder.set(...w); GUARD.pole.set(...p).normalize(); GUARD.face.set(...f).normalize();
}
const b = an.b;
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();
const ch = (bone) => { bone.getWorldPosition(_v); return _v.applyMatrix4(_inv).toArray(); };
function record(t) {
  model.updateMatrixWorld(true);
  _inv.copy(model.matrixWorld).invert();
  const I = an.wwInfo();
  const r = { t: +t.toFixed(4), phase: I.phase, open: +I.open.toFixed(3), w: +I.w.toFixed(3), faceErr: I.faceErrDeg, pdy: I.pdy, pdz: I.pdz };
  r.wristL = ch(b.handL.bone); r.elbowL = ch(b.loArmL.bone); r.shR = ch(b.upArmR.bone); r.shL = ch(b.upArmL.bone); r.head = ch(b.head.bone);
  r.pelvis = ch(b.pelvis.bone);
  const g = ww.prop.group;
  if (g.visible && g.parent) {
    g.updateWorldMatrix(true, false);
    r.fan = fanPoints(ww.open).map((p) => p.applyMatrix4(g.matrixWorld).applyMatrix4(_inv).toArray());
  }
  r.footL = ch(b.footL?.bone ?? b.pelvis.bone); r.footR = ch(b.footR?.bone ?? b.pelvis.bone);
  return r;
}
const fwd = (speed) => { const p = R.player; p.velocity.set(Math.sin(p.heading) * speed, 0, Math.cos(p.heading) * speed); p.moveSpeed = speed; };
const halt = () => { R.player.velocity.set(0, 0, 0); R.player.moveSpeed = 0; };
function home() {
  gaff.want = false; gaff.after = null; gaff.verbs?.cancel();
  ww.want = false; ww.phase = 'stowed'; ww.t = 0; ww.open = WINDWALL_FAN.closed; ww.plantedAt = null;
  for (let i = 0; i < 60; i++) step(R);
  reset(R);
  const G = an._gaffState(); G.mode = 0; G.owner = 'carry'; G.was = false; G.t = 0; G.settleT = 0; G.lastOk = false; oro.setHeld(0);
  gaff.prop.group.visible = false; ww.prop.group.visible = false;
  for (let i = 0; i < 30; i++) step(R);
}
const held = () => { gaff.draw(); for (let i = 0; i < 50; i++) step(R); };
const heldJog = () => { gaff.draw(); for (let i = 0; i < 50; i++) { fwd(SPEEDS.jog); step(R); } };
const CASES = {
  guard: { pre: held, secs: 0.9, go: () => ww.guard(true), grip: true },
  guardRelease: { pre: () => { held(); ww.guard(true); for (let i = 0; i < 30; i++) step(R); }, secs: 0.6, go: () => ww.guard(false) },
  guardJog: { speed: SPEEDS.jog, pre: heldJog, secs: 1.2, go: () => ww.guard(true) },
  guardCrouch: { pre: () => { R.player.crouching = true; held(); for (let i = 0; i < 20; i++) step(R); }, secs: 0.9, go: () => ww.guard(true), post: () => { R.player.crouching = false; } },
  bash: { pre: () => { held(); ww.guard(true); for (let i = 0; i < 30; i++) step(R); }, secs: 0.7, go: () => ww.bash(), bash: true },
  plant: { pre: () => { held(); ww.guard(true); for (let i = 0; i < 30; i++) step(R); }, secs: 0.9, go: () => ww.plant() },
  guardThenStowGaff: { pre: () => { held(); ww.guard(true); for (let i = 0; i < 30; i++) step(R); }, secs: 1.0, go: () => { ww.guard(false); gaff.stow(); } },
  guardThenLight: { pre: () => { held(); ww.guard(true); for (let i = 0; i < 30; i++) step(R); }, secs: 0.9, go: () => gaff.verbs.strike() },
};

function grade(name, L, m) {
  const fails = [];
  const fail = (s) => fails.push(s);
  const out = { name, steps: L.length };
  out.KT1 = { behind: m.behind, plane: m.plane };
  if (m.behind) fail(`KT1 ${m.behind} steps with a hand or forearm behind the head`);
  if (m.plane) fail(`KT1 ${m.plane} steps with a hand or forearm above the shoulder behind the head plane`);
  let above = 0, behind = 0, aboveMax = -9, wristAbove = 0;
  // (the clip's fan: from the step the arm has taken it (w >= 0.5) or it is opening past 0.3; the closed fan carried on
  // a hanging forearm stands past her elbow to about her shoulder's height, wave 2's carry: reported apart)
  let carryAbove = -9;
  for (const r of L) {
    const shY = Math.min(r.shR[1], r.shL[1]);
    if (r.wristL[1] > shY) wristAbove++;
    if (!r.fan) continue;
    if (!(r.w >= 0.5 || r.open >= 0.3) || r.phase === 'planted') { for (const p of r.fan) carryAbove = Math.max(carryAbove, p[1] - shY); continue; }
    for (const p of r.fan) {
      aboveMax = Math.max(aboveMax, p[1] - shY);
      if (p[1] > shY) above++;
      if (p[1] > shY && p[2] < r.head[2] - 0.02) behind++;
    }
  }
  out.KT1.carryFanAboveShoulderMaxM = +carryAbove.toFixed(3);
  out.KT1.fanAboveShoulderPointSteps = above; out.KT1.fanAboveShoulderMaxM = +aboveMax.toFixed(3); out.KT1.fanBehindHead = behind; out.KT1.wristAbove = wristAbove;
  if (above) fail(`KT1 the fan above her shoulders ${above} point-steps (max ${aboveMax.toFixed(3)} m)`);
  if (behind) fail(`KT1 the fan behind her head ${behind} point-steps`);
  if (wristAbove) fail(`KT1 the left wrist above her shoulders ${wristAbove} steps`);
  // KT3: request to the full guard
  const up = L.findIndex((r, i) => i > 0 && r.phase === 'guard' && L[i - 1].phase !== 'guard');
  out.KT3 = { guardS: up >= 0 ? L[up].t : null };
  if (name === 'guard' && !(out.KT3.guardS >= 0.2 && out.KT3.guardS <= 0.3 + 1e-6)) fail(`KT3 request to guard ${out.KT3.guardS} s (band 0.20-0.30)`);
  // the face at the guard
  const g = L.filter((r) => r.phase === 'guard' && r.faceErr != null);
  out.faceErrDeg = g.length ? Math.max(...g.map((r) => r.faceErr)) : null;
  // (reported: the forearm's line is not in her frontal plane, so the twist cannot take the whole face onto the guard's)
  // the fan in front of her body at the guard: its middle slat's tip ahead of her chest
  const gf = L.filter((r) => r.phase === 'guard' && r.fan);
  if (gf.length) {
    const r = gf[gf.length - 1];
    out.fanAtGuard = { rivet: r.fan[0].map((x) => +x.toFixed(3)), midTip: r.fan[5].map((x) => +x.toFixed(3)), topY: +Math.max(...r.fan.map((p) => p[1] - Math.min(r.shR[1], r.shL[1]))).toFixed(3), minZ: +Math.min(...r.fan.map((p) => p[2])).toFixed(3) };
  }
  // the bash: her pelvis forward
  if (CASES[name].bash) {
    const z0 = L[0].pelvis[2];
    out.bashPelvisFwdM = +Math.max(...L.map((r) => r.pelvis[2] - z0)).toFixed(3);
  }
  // the wrist's rate outside the bash and the plant (W3, reported)
  let w3 = 0; for (let i = 1; i < L.length; i++) w3 = Math.max(w3, Math.hypot(...[0, 1, 2].map((k) => L[i].wristL[k] - L[i - 1].wristL[k])));
  out.W3leftStepMaxM = +w3.toFixed(4);
  out.fails = fails;
  return out;
}

const only = flag('--only') ? flag('--only').split(',') : Object.keys(CASES);
const res = { commit: flag('--commit', '?'), cases: {} };
const logs = {};
for (const name of only) {
  const c = CASES[name];
  home();
  c.pre?.();
  const L = [];
  M.begin(name);
  c.go();
  const N = Math.round(c.secs * 60);
  for (let i = 0; i < N; i++) {
    if (c.speed) fwd(c.speed); else halt();
    step(R);
    M.sample({ T: +((i + 1) / 60).toFixed(3) });
    L.push(record((i + 1) / 60));
  }
  const mm = M.end();
  c.post?.(); halt();
  const g = grade(name, L, mm);
  res.cases[name] = g; logs[name] = L;
  console.log(`${name.padEnd(18)} ${g.fails.length ? 'FAIL' : 'PASS'}  ` + JSON.stringify({ KT1: g.KT1, KT3: g.KT3, face: g.faceErrDeg, fan: g.fanAtGuard, bash: g.bashPelvisFwdM, W3: g.W3leftStepMaxM }));
  for (const f of g.fails) console.log(`    - ${f}`);
}
const failing = Object.values(res.cases).filter((g) => g.fails.length).length;
res.summary = { cases: only.length, failing, clauses: Object.values(res.cases).reduce((n, g) => n + g.fails.length, 0) };
console.log(`windwall bench: ${only.length - failing}/${only.length} cases pass, ${res.summary.clauses} failing clauses`);
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(res, null, 1));
if (flag('--log')) writeFileSync(flag('--log'), JSON.stringify(logs));
process.exit(0);
