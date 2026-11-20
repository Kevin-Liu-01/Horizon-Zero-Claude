// M3 area B, wave 2: THE KITE'S CLIPS ON THE PAGE. One short Chrome session: Brea held in the air 3 m over T1's top (the
// test flight's launch), posed at points of the open (500 ms), the glide and a bank, and the fold (350 ms) by the clips
// themselves (animator.setKiteFlight(state, t): src/entities/anim/kite/kiteClips.js, the flight state and the seconds
// in it), with the Survey Kite (src/entities/anim/kite/surveyKite.js) placed and furled from the hang's solve every
// frame; two lenses close enough that her hands read; the page's own read of her wrists (her facing, the head bone) and
// elbows on each shot. A lane film, never judged against a reference; nothing written inside the repo.
//   node tools/gates/kite/clip-frames.mjs --port 5282 [--label kite-clips]
// Protocol (PROCESS §6): the machine guard and slot1 (tools/chrome-slot.mjs), Vite for THIS tree on --port at
// 127.0.0.1 under nice -n 10, one headless Chrome, torn down and the slot released on every exit path.
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeMachineSlot, releaseMachineSlot } from '../../chrome-slot.mjs';
import { stageFrame, unstageFrame } from '../../frames/page.mjs';
import { RUNS, assertOutsideRepo } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[kite-clips ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const LABEL = flag('--label', 'kite-clips');
const commit = (() => { try { return execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
const dirty = (() => { try { return execFileSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0; } catch { return true; } })();
const BUDGET_S = 600;

/** The lenses, at T1 (the test flight's launch), golden; her heading 283 (toward the Ring). yawRel 0 is in front of her,
 *  +90 her left side, -90 her right. (wave 2b: two close lenses on her right, where her right hand takes the roll off the
 *  mount and carries it round her hip: one in front, one behind) */
const BASE = { hour: 17.75, weather: 'trade', at: 'trig:T1', bearing: 283, state: { pose: 'idle', hud: false } };
const LENSES = [
  { id: 'front3q', ...BASE, camera: { mode: 'orbit', yawRel: 35, dist: 3.4, height: 1.6, target: { fwd: 0, side: 0, up: 1.55 }, fov: 50, lookAt: 'off' } },
  { id: 'right3q', ...BASE, camera: { mode: 'orbit', yawRel: -50, dist: 2.3, height: 1.45, target: { fwd: 0, side: 0, up: 1.2 }, fov: 50, lookAt: 'off' } },
  { id: 'rear-r', ...BASE, camera: { mode: 'orbit', yawRel: -140, dist: 2.2, height: 1.45, target: { fwd: 0, side: 0, up: 1.15 }, fov: 50, lookAt: 'off' } },
  { id: 'side', ...BASE, camera: { mode: 'orbit', yawRel: 95, dist: 3.6, height: 1.7, target: { fwd: 0.2, side: 0, up: 1.6 }, fov: 50, lookAt: 'off' } },
];
/** The poses: [name, state, seconds in it, bank]: the take-down and the open (0.6 s), the glide, the fold (0.39 s) and
 *  the stow (the fold's last steps: the roll seated on the mount, the hand letting go) */
const POSES = [
  ['open-010', 'opening', 0.06, 0], ['open-025', 'opening', 0.15, 0], ['open-take-033', 'opening', 0.2, 0], ['open-045', 'opening', 0.27, 0],
  ['open-055', 'opening', 0.33, 0], ['open-068', 'opening', 0.41, 0], ['open-set-082', 'opening', 0.49, 0], ['open-090', 'opening', 0.54, 0],
  ['glide', 'gliding', 0, 0], ['glide-bank-left', 'gliding', 0, -1],
  ['fold-015', 'folding', 0.06, 0], ['fold-030', 'folding', 0.117, 0], ['fold-045', 'folding', 0.175, 0], ['fold-060', 'folding', 0.234, 0],
  ['fold-075', 'folding', 0.292, 0], ['stow-090', 'folding', 0.351, 0], ['stow-097', 'folding', 0.378, 0],
];

/** Page code: hold her 3 m over T1's top, the kite on her, the update her own lens, model, animator and rig only. */
const KITE_ON = async () => {
  const C = window.__CTX__, p = C.player, an = p.animator, E = C.engine;
  const { buildSurveyKite, placeKite } = await import('/src/entities/anim/kite/surveyKite.js');
  const S = await import('/src/world/island/sites.js');
  const T = S.TRIG.find((t) => t.id === 'T1');
  const K = buildSurveyKite({ furl: 0 });
  const root = an.space?.root || p.model;
  K.mesh.frustumCulled = false; K.mesh.material.fog = false;
  root.add(K.group);
  try { E.compileAsDrawn?.(K.group, C.camera, C.scene); await E._awaitProgramsReady?.(10000); } catch (e) { /* */ }
  const hold = { x: p.position.x, y: C.terrain.getHeight(T.x, T.z) + S.TRIG_TOP + 3, z: p.position.z };
  const u0 = p.update, g0 = p.grounded;
  p.update = function (dt, t) {
    this.position.set(hold.x, hold.y, hold.z); this.velocity?.set?.(0, 0, 0); this.grounded = false;
    this._updateCamera(Math.min(0.05, dt || 0), t);
    this.model.position.copy(this.position); this.model.rotation.y = this.heading;
    this.animator.update(dt, t);
    this.hero?.update(dt);
    const i = this.animator.hangPoseInfo?.();
    if (i && this.animator._kiteFl?.state !== 'none') placeKite(K, root, i);
  };
  window.__KF = { K, root, undo: () => { p.update = u0; p.grounded = g0; an.setKiteFlight('none'); an.setHangPose(false); K.group.parent?.remove(K.group); K.mesh.geometry.dispose(); K.mesh.material.dispose(); p._snapToGround?.(); } };
  return { hold, tris: K.triangles };
};
const POSE = async ([name, state, t, bank]) => {
  const C = window.__CTX__, p = C.player, an = p.animator, E = C.engine, KF = window.__KF;
  const frame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 50); });
  E.requestTimeScale('studio', null);
  // a fresh clip each pose (the open's first step reads where her wrists are, as the page will)
  an.setKiteFlight('none'); await frame(); await frame();
  an.setKiteFlight(state, t, { bank });
  const s0 = E.simTime, w0 = performance.now();
  while (E.simTime - s0 < 0.6 && performance.now() - w0 < 6000) await frame();
  E.requestTimeScale('studio', 0);
  await frame(); await frame();
  // the hero's occlusion fade off: drawn whole
  if ((p._fadeCur ?? 1) < 0.999 || (p.fade ?? 1) < 0.999 || p._fadeApplied !== 1) { p.fade = 1; p._fadeCur = 1; p._fadeApplied = -1; try { p._applyFade(1 / 60, performance.now() / 1000); } catch (e) { /* */ } }
  await frame();
  const V = p.position.constructor, b = an.b;
  const wp = (bone) => { bone.updateWorldMatrix(true, false); return new V().setFromMatrixPosition(bone.matrixWorld); };
  const head = wp(b.head.bone), fwd = new V(Math.sin(p.heading), 0, Math.cos(p.heading));
  const side = (s) => { const w = wp(b[`hand${s}`].bone), e = wp(b[`loArm${s}`].bone), sh = wp(b[`upArm${s}`].bone);
    return { wristFrontOfHeadBoneM: +new V().subVectors(w, head).dot(fwd).toFixed(3), wristBelowHeadBoneM: +(head.y - w.y).toFixed(3), elbowOverShoulderM: +(e.y - sh.y).toFixed(3) }; };
  const i = an.hangPoseInfo();
  return { name, state, t, bank, L: side('L'), R: side('R'), kite: i ? { clip: i.kite.clip, phase: +i.kite.phase.toFixed(3), furl: +i.kite.furl.toFixed(3) } : null, inScene: !!KF.K.group.parent };
};
const KITE_OFF = () => { try { window.__KF?.undo(); } catch { /* */ } window.__KF = null; return true; };

const portOn = (p, host) => new Promise((r) => { const s = net.connect(p, host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const portOpen = async (p) => (await portOn(p, '127.0.0.1')) || (await portOn(p, '::1'));
let vite = null, browser = null, profile = null;
async function teardown() {
  try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
  browser = null;
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } vite = null; }
  if (profile) { try { disposeProfile(profile); } catch { /* */ } profile = null; }
  releaseMachineSlot(log);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { await teardown(); process.exit(130); });
process.on('exit', () => { releaseMachineSlot(log); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

const stamp = utc().replace(/[-:]/g, '');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}`);
assertOutsideRepo(runDir, REPO);
const out = { commit, cleanTree: !dirty, tree: REPO, port: PORT, startedAt: utc(), shots: [], console: [], errors: [] };
if (await portOpen(PORT)) { console.error(`port ${PORT} is in use`); process.exit(3); }
const slot = await takeMachineSlot({ who: `kite`, log });
if (!slot.ok) { console.error('SLOT-NOT-AVAILABLE', slot.why); process.exit(4); }
const t0 = Date.now();
const watchdog = setTimeout(async () => { log('WATCHDOG'); out.errors.push('watchdog'); await teardown(); process.exit(5); }, (BUDGET_S + 30) * 1000);
watchdog.unref();
try {
  mkdirSync(runDir, { recursive: true });
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  const vp = { width: 1600, height: 900, dpr: 1 };
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${vp.width},${vp.height + 40}`] });
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') out.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => out.console.push('pageerror: ' + String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 });
  await sleep(4000);
  out.bootSeconds = Math.round((Date.now() - t0) / 1000);
  log(`booted in ${out.bootSeconds} s`);
  for (const L of LENSES) {
    try {
      const staged = await page.evaluate(stageFrame, L, { settleMs: 2000 });
      const on = await page.evaluate(KITE_ON);
      log(`${L.id}: staged; held at ${JSON.stringify(on.hold)}`);
      for (const P of POSES) {
        if ((Date.now() - t0) / 1000 > BUDGET_S - 60) { out.errors.push('budget: stopped early'); break; }
        const read = await page.evaluate(POSE, P);
        await sleep(250);
        const file = `${L.id}-${P[0]}.png`;
        writeFileSync(path.join(runDir, file), await page.screenshot({ type: 'png' }));
        out.shots.push({ id: `${L.id}-${P[0]}`, file, read, camera: staged.camera, standIns: staged.standIns || [] });
        log(`${L.id}-${P[0]}: L ${JSON.stringify(read.L)} R ${JSON.stringify(read.R)} ${JSON.stringify(read.kite)}`);
      }
      await page.evaluate(KITE_OFF);
      await page.evaluate(unstageFrame);
    } catch (e) { out.shots.push({ id: L.id, error: String(e?.message || e).slice(0, 300) }); try { await page.evaluate(KITE_OFF); await page.evaluate(unstageFrame); } catch { /* */ } }
  }
} catch (e) { out.errors.push(String(e?.message || e).slice(0, 400)); }
out.chromeSeconds = Math.round((Date.now() - t0) / 1000);
await teardown();
writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(out, null, 1));
log(`run dir ${runDir} (${out.chromeSeconds} s of Chrome)`);
