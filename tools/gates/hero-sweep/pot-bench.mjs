/**
 * Milestone 2 area D (wave 3) — the pot cast, in Node (the setup is the Windwall bench's: the Windwall's handling, in Node: Brea dressed (`bench.mjs makeBench`: the real
 * animator, the game's HeroRig, the real `Melee`), Oro's kit bound by the game's own code (src/hero/orokit.js on
 * public/models/armory/kit-oro.glb, its extras read as the asset loader reads them), the held gaff and the held
 * Windwall (src/combat/windwall.js HeldWindwall on public/models/armory/windwall-pine.glb) in the layers' hands
 * (gaffLayer.js, windwallLayer.js), stepped at 60 Hz of sim time, every step recorded and graded.
 *
 *   node tools/gates/hero-sweep/pot-bench.mjs [--only cast,...] [--json out.json] [--log out.json]
 *
 * Rows (M2 briefs §7):
 *   KT1  Kevin's bars: 0 steps with a hand or forearm behind the head plane or above its shoulder (measure.mjs); the
 *        left hand (the pot in it) never above her shoulders
 *   KT3  pot from the belt to the release 450-650 ms (sim time, the release step the layer fires)
 *   KT5  the release at or below her chest (the hand >= 0.12 m under her shoulders); the pot, cast from the hand's own
 *        point at the release, lands within 0.5 m of the aimed point at 6-14 m (flat ground)
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
const { ensurePots, POT_CAST } = await import(path.join(ROOT, 'src/combat/pots.js'));
const pots = ensurePots(R.ctx);
pots.grant({ brine: 2, cinder: 1 });
R.ctx.terrain = R.ctx.terrain ?? { getHeight: () => 0 };
const M = buildSweep(R, THREE);
const b = an.b;
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();
const ch = (bone) => { bone.getWorldPosition(_v); return _v.applyMatrix4(_inv).toArray(); };
function record(t) {
  model.updateMatrixWorld(true);
  _inv.copy(model.matrixWorld).invert();
  const I = an.potInfo();
  const r = { t: +t.toFixed(4), phase: I.phase, w: +I.w.toFixed(3), releasedAt: I.releasedAt, releaseH: I.releaseH };
  r.wristL = ch(b.handL.bone); r.shR = ch(b.upArmR.bone); r.shL = ch(b.upArmL.bone); r.head = ch(b.head.bone);
  return r;
}
const fwd = (speed) => { const p = R.player; p.velocity.set(Math.sin(p.heading) * speed, 0, Math.cos(p.heading) * speed); p.moveSpeed = speed; };
const halt = () => { R.player.velocity.set(0, 0, 0); R.player.moveSpeed = 0; };
function home() {
  gaff.want = false; gaff.after = null; gaff.verbs?.cancel();
  ww.want = false; ww.phase = 'stowed'; ww.t = 0; ww.open = WINDWALL_FAN.closed;
  pots.cancel(); pots.flying = null; pots.belt.count = { brine: 2, cinder: 1, dust: 0 }; pots.landed.length = 0; if (an._pots) an._pots.releasedAt = -1;
  for (let i = 0; i < 60; i++) step(R);
  reset(R);
  const G = an._gaffState(); G.mode = 0; G.owner = 'carry'; G.was = false; G.t = 0; G.settleT = 0; G.lastOk = false; oro.setHeld(0);
  gaff.prop.group.visible = false; ww.prop.group.visible = false;
  for (let i = 0; i < 30; i++) step(R);
}
/** the aim: `d` m ahead of her on flat ground */
const aimAt = (d) => { const p = R.player.position, h = R.player.heading || 0; return { x: p.x + Math.sin(h) * d, y: 0, z: p.z + Math.cos(h) * d }; };
const held = () => { gaff.draw(); for (let i = 0; i < 50; i++) step(R); };
const CASES = {
  cast6: { secs: 2.4, go: () => pots.cast(aimAt(6)), d: 6 },
  cast10: { secs: 2.4, go: () => pots.cast(aimAt(10)), d: 10 },
  cast14: { secs: 2.6, go: () => pots.cast(aimAt(14)), d: 14 },
  castJog: { speed: SPEEDS.jog, secs: 1.0, go: () => pots.cast(aimAt(10)) },
  castCrouch: { pre: () => { R.player.crouching = true; for (let i = 0; i < 30; i++) step(R); }, secs: 1.0, go: () => pots.cast(aimAt(8)), post: () => { R.player.crouching = false; } },
  castGaffInHand: { pre: held, secs: 2.4, go: () => pots.cast(aimAt(10)), d: 10 },
  castFromGuard: { pre: () => { held(); ww.guard(true); for (let i = 0; i < 30; i++) step(R); }, secs: 1.2, go: () => pots.cast(aimAt(9)) },
};

function grade(name, L, m) {
  const fails = [];
  const fail = (s) => fails.push(s);
  const out = { name, steps: L.length };
  out.KT1 = { behind: m.behind, plane: m.plane };
  if (m.behind) fail(`KT1 ${m.behind} steps with a hand or forearm behind the head`);
  if (m.plane) fail(`KT1 ${m.plane} steps with a hand or forearm above the shoulder behind the head plane`);
  let above = 0, aboveMax = -9;
  for (const r of L) { const shY = Math.min(r.shR[1], r.shL[1]); aboveMax = Math.max(aboveMax, r.wristL[1] - shY); if (r.wristL[1] > shY) above++; }
  out.KT1.leftHandAboveShoulderSteps = above; out.KT1.leftHandOverShoulderMaxM = +aboveMax.toFixed(3);
  if (above) fail(`KT1 the left hand above her shoulders ${above} steps`);
  const rel = L.find((r) => r.releasedAt >= 0);
  out.KT3 = { releaseS: rel ? +(L.findIndex((r) => r.releasedAt >= 0) + 1) / 60 : null };
  if (!(out.KT3.releaseS >= 0.45 && out.KT3.releaseS <= 0.65)) fail(`KT3 belt to release ${out.KT3.releaseS} s (band 0.45-0.65)`);
  out.KT5 = { releaseH: rel?.releaseH ?? null };
  if (!(rel && rel.releaseH <= -0.12)) fail(`KT5 the release ${rel?.releaseH} m off her shoulder (at or below her chest: <= -0.12)`);
  const land = pots.landed[pots.landed.length - 1] ?? null;
  out.KT5.land = land;
  if (CASES[name].d) {
    if (!land) fail('KT5 the pot did not land');
    else if (land.missM > 0.5) fail(`KT5 landed ${land.missM} m from the aimed point (bar 0.5)`);
  }
  out.fails = fails;
  return out;
}

const only = flag('--only') ? flag('--only').split(',') : Object.keys(CASES);
const res = { commit: flag('--commit', '?'), cases: {} };
const logs = {};
for (const name of only) {
  const c = CASES[name];
  home();
  if (c.speed) for (let i = 0; i < 40; i++) { fwd(c.speed); step(R); }
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
  console.log(`${name.padEnd(16)} ${g.fails.length ? 'FAIL' : 'PASS'}  ` + JSON.stringify({ KT1: g.KT1, KT3: g.KT3, KT5: g.KT5 }));
  for (const f of g.fails) console.log(`    - ${f}`);
}
const failing = Object.values(res.cases).filter((g) => g.fails.length).length;
res.summary = { cases: only.length, failing, clauses: Object.values(res.cases).reduce((n, g) => n + g.fails.length, 0) };
console.log(`pot bench: ${only.length - failing}/${only.length} cases pass, ${res.summary.clauses} failing clauses`);
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(res, null, 1));
if (flag('--log')) writeFileSync(flag('--log'), JSON.stringify(logs));
process.exit(0);
