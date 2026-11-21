// M3 wave 3b, area B: THE MOORED SONDE STAND-IN, FILMED. One short Chrome session on this tree's Vite (--port,
// 127.0.0.1, nice -n 10), the machine-wide slot (tools/chrome-slot.mjs), torn down on every exit path. The game boots
// from leg 4's start (tools/gates/systems/hour-two-fixtures.mjs fixture(4): the first hour's end, "True Ground" done),
// written to the save store and CONTINUED, as the hour-two runner boots; "A Line Over the Glass" starts and moors the
// stand-in (src/entities/anim/kite/mooredSonde.js) at MOORING. The sim is frozen and three lenses are put on it (the
// lens is the shot's own; nothing of the quest is staged): from the guild-house side 34 m off, under it from beside the
// stake, and level with the hull 12 m off. Writes <review>/runs/<utc>-<commit>-<label>/ (run.json and PNGs).
//   node tools/gates/kite/sonde-frame.mjs --port 5282 [--label kite-sonde]
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeMachineSlot, releaseMachineSlot } from '../../chrome-slot.mjs';
import { RUNS, assertOutsideRepo } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';
import { fixture } from '../systems/hour-two-fixtures.mjs';
import { MOORING } from '../../../src/game/hour2/glass-line-plan.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[kite-sonde ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const LABEL = flag('--label', 'kite-sonde');
const commit = (() => { try { return execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
const dirty = (() => { try { return execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0; } catch { return true; } })();
const BUDGET_S = 240;

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

/** Freeze the sim and put a lens at `eye` looking at `at` (engine metres). */
const LENS = async ({ eye, at, fov = 50 }) => {
  const C = window.__CTX__, p = C.player, E = C.engine, cam = C.camera;
  E.requestTimeScale('studio', 0);
  const upd0 = p._updateCamera, fov0 = cam.fov;
  p._updateCamera = function () { cam.position.set(eye.x, eye.y, eye.z); cam.lookAt(at.x, at.y, at.z); if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); } cam.updateMatrixWorld(); };
  p._updateCamera();
  window.__unlens = () => { p._updateCamera = upd0; cam.fov = fov0; cam.updateProjectionMatrix(); E.requestTimeScale('studio', null); };
  await new Promise((r) => { let k = 0; const f = () => (++k >= 6 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  return true;
};

const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}`);
assertOutsideRepo(runDir, REPO);
const out = { commit, cleanTree: !dirty, tree: REPO, port: PORT, mooring: MOORING, shots: [], console: [], errors: [] };
if (await portOpen(PORT)) { console.error(`port ${PORT} is in use`); process.exit(3); }
const slot = await takeMachineSlot({ who: `kite ${PORT}`, log });
if (!slot.ok) { console.error('SLOT-NOT-AVAILABLE', slot.why); process.exit(4); }
const t0 = Date.now();
const watchdog = setTimeout(async () => { log('WATCHDOG'); await teardown(); process.exit(5); }, (BUDGET_S + 30) * 1000);
watchdog.unref();
try {
  mkdirSync(runDir, { recursive: true });
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') out.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => out.console.push('pageerror: ' + String(e).slice(0, 300)));
  // boot as the hour-two runner does: the record in the store, the title, CONTINUE
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 200 });
  const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, fixture(4));
  if (!wrote?.ok) throw new Error(`start record not written: ${JSON.stringify(wrote)}`);
  await page.goto('about:blank', { waitUntil: 'load', timeout: 30000 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 100 });
  await sleep(500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
  await sleep(300);
  await page.evaluate(() => { [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent))?.click(); document.querySelector('.gs-slot.cont .gs-slot-go')?.click(); });
  await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 });
  await page.waitForFunction(() => !!window.__CTX__.hour2?.glassLine?.report?.().standIn, { timeout: 30000, polling: 250 });
  await sleep(4000);
  out.report = await page.evaluate(() => window.__CTX__.hour2.glassLine.report());
  log(`stand-in ${JSON.stringify(out.report.standIn)} stage ${out.report.stage}`);
  const S = out.report.standIn, gy = await page.evaluate((x, z) => window.__CTX__.terrain.getHeight(x, z), S.at.x, S.at.z);
  const H = S.hull, mid = { x: (S.at.x + H.x) / 2, y: (gy + H.y) / 2, z: (S.at.z + H.z) / 2 };
  const lenses = {
    // from the guild-house side (bearing 039 from the Ring), 34 m off the line's middle, at head height
    'sonde-moored-approach': { eye: { x: mid.x + 26, y: gy + 1.7, z: mid.z - 22 }, at: { x: mid.x, y: mid.y + 1, z: mid.z }, fov: 55 },
    // under it, beside the stake
    'sonde-moored-under': { eye: { x: S.at.x + 3.5, y: gy + 1.6, z: S.at.z - 2 }, at: { x: H.x, y: H.y + 1, z: H.z }, fov: 60 },
    // level with the hull, 12 m off its side
    'sonde-moored-level': { eye: { x: H.x + 10, y: H.y + 1.5, z: H.z + 7 }, at: { x: H.x, y: H.y + 1.5, z: H.z }, fov: 45 },
  };
  for (const [name, L] of Object.entries(lenses)) {
    await page.evaluate(LENS, L);
    await sleep(200);
    writeFileSync(path.join(runDir, `${name}.png`), await page.screenshot({ type: 'png' }));
    await page.evaluate(() => window.__unlens?.());
    out.shots.push({ name, lens: L });
    log(`shot ${name}`);
  }
} catch (e) { out.errors.push(String(e?.stack || e).slice(0, 600)); log('error', String(e?.message || e)); }
out.chromeSeconds = Math.round((Date.now() - t0) / 1000);
await teardown();
writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(out, null, 1));
log(`run dir ${runDir} (${out.chromeSeconds} s of Chrome)`);
