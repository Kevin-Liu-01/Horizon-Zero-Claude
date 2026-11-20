// M3 area B, wave 1: THE STATIC HANG FRAME. One short Chrome session: Brea in the M1.3f chest-bar hang under the grey
// kite (src/entities/anim/kite/greyKite.js), filmed from two lenses (side-on at 4 m, F52's lens; and wide, to show the
// kite over her), with the page's own read of her wrists, elbows and the bar. A lane frame, never judged against a
// reference; nothing written inside the repo.
//   node tools/gates/kite/hang-frame.mjs --port 5282 [--label kite-hang]
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
const log = (...a) => console.log(`[kite-hang ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const LABEL = flag('--label', 'kite-hang');
const commit = (() => { try { return execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
const dirty = (() => { try { return execFileSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0; } catch { return true; } })();
const BUDGET_S = 600;

/** The two lenses, on F16's ground (the raked crust of a white pan cell), golden. */
const BASE = { hour: 17.75, weather: 'trade', at: { en: [-316.9, -264.9] }, bearing: 315, state: { pose: 'idle', hud: false } };
const LENSES = [
  { id: 'hang-side-4m', ...BASE, camera: { mode: 'orbit', yawRel: 90, dist: 4, height: 1.3, target: { fwd: 0, side: 0, up: 1.25 }, fov: 42 } },
  { id: 'hang-wide-3q', ...BASE, camera: { mode: 'orbit', yawRel: 55, dist: 7.5, height: 2.2, target: { fwd: 0, side: 0, up: 2.0 }, fov: 45 } },
];

/** Page code: the hang on, 1.2 s of game time, the grey kite on the bar; the page's read of the bars. */
const HANG_ON = async () => {
  const C = window.__CTX__, p = C.player, an = p.animator, E = C.engine;
  const frame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 50); });
  // stageFrame ends frozen (the 'studio' time scale 0): let the game run 1.2 s with the hang on, then freeze again
  E.requestTimeScale('studio', null);
  an.setHangPose(true);
  const s0 = E.simTime, w0 = performance.now();
  while (E.simTime - s0 < 1.2 && performance.now() - w0 < 8000) await frame();
  E.requestTimeScale('studio', 0);
  if (!an.hangPoseInfo()) throw new Error(`the hang layer never ran (sim ${(E.simTime - s0).toFixed(2)} s in ${Math.round(performance.now() - w0)} ms)`);
  const { buildGreyKite, placeAtBar } = await import('/src/entities/anim/kite/greyKite.js');
  const K = buildGreyKite();
  const root = an.space?.root || p.model;
  // parented to the hang pose's own frame (the bar is given in it), so the kite rides with her model
  root.add(K.group);
  const info = an.hangPoseInfo();
  placeAtBar(K.group, root, info.bar);
  window.__KITE_BLOCKOUT__ = K.group;
  await frame(); await frame();
  // the page's read: wrists against the head bone's frontal plane (her facing) and height; elbows against shoulders
  const V = p.position.constructor, b = an.b;
  const wp = (bone) => { bone.updateWorldMatrix(true, false); return new V().setFromMatrixPosition(bone.matrixWorld); };
  const head = wp(b.head.bone), fwd = new V(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new p.model.quaternion.constructor()));
  fwd.y = 0; fwd.normalize();
  const side = (s) => {
    const w = wp(b[`hand${s}`].bone), e = wp(b[`loArm${s}`].bone), sh = wp(b[`upArm${s}`].bone);
    return { wristFrontOfHeadM: +new V().subVectors(w, head).dot(fwd).toFixed(3), wristBelowHeadBoneM: +(head.y - w.y).toFixed(3), elbowOverShoulderM: +(e.y - sh.y).toFixed(3) };
  };
  const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
  const kw = K.group.getWorldPosition(new V()), rw = root.getWorldPosition(new V()), rs = root.getWorldScale(new V());
  let inScene = false; for (let o = K.group; o; o = o.parent) if (o === C.scene) inScene = true;
  return { L: side('L'), R: side('R'), bar: info, kiteTris: K.triangles, hang: !!an._hangOn,
    where: { kite: r2(kw), root: r2(rw), rootScale: r2(rs), rootName: root.name || root.type, player: r2(p.position), head: r2(head), inScene, visible: K.mesh.visible, cam: r2(C.camera.position) } };
};
const HANG_OFF = () => {
  const C = window.__CTX__;
  try { C.player.animator.setHangPose(false); } catch { /* */ }
  const k = window.__KITE_BLOCKOUT__;
  if (k) { k.parent?.remove(k); k.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); window.__KITE_BLOCKOUT__ = null; }
  return true;
};

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
const slot = await takeMachineSlot({ who: `m3-kite ${LABEL}`, log });
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
      const read = await page.evaluate(HANG_ON);
      await sleep(400);
      const file = `${L.id}.png`;
      writeFileSync(path.join(runDir, file), await page.screenshot({ type: 'png' }));
      out.shots.push({ id: L.id, file, read, camera: staged.camera, standIns: staged.standIns || [] });
      log(`${L.id}: ${JSON.stringify(read.L)} ${JSON.stringify(read.R)} ${JSON.stringify(read.where)}`);
      await page.evaluate(HANG_OFF);
      await page.evaluate(unstageFrame);
    } catch (e) { out.shots.push({ id: L.id, error: String(e?.message || e).slice(0, 300) }); try { await page.evaluate(HANG_OFF); await page.evaluate(unstageFrame); } catch { /* */ } }
  }
} catch (e) { out.errors.push(String(e?.message || e).slice(0, 400)); }
out.chromeSeconds = Math.round((Date.now() - t0) / 1000);
await teardown();
writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(out, null, 1));
log(`run dir ${runDir} (${out.chromeSeconds} s of Chrome)`);
