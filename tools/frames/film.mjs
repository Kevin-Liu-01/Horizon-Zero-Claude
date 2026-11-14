/**
 * Film the whole Frame Set in ONE Chrome session, then build the review page.
 *
 *   node tools/frames/film.mjs --port 5270                     every frame, page dated today
 *   node tools/frames/film.mjs --port 5270 --only F02,F08      a targeted re-run
 *   node tools/frames/film.mjs --port 5270 --baseline          this run becomes the anchors (M0.5)
 *   options: --wait <s> slot wait (default 1800) · --budget <s> Chrome time cap (default 840)
 *            --settle <ms> per-frame settle (default 2600) · --no-review · --status "line 1|line 2"
 *
 * The run, in order:
 *   1. the machine guard: memory free >= 50 % (memory_pressure -Q) and pressure level 1, then the
 *      machine-wide slot <slots>/slot1 taken by mkdir and owned in owner.txt; released (rm -r) the
 *      moment the run ends, on every exit path
 *   2. a Vite dev server for THIS tree on --port under nice -n 10 (refuses a busy port and 5173)
 *   3. one headless Chrome, one page, ?shot=1; every frame staged by tools/frames/page.mjs,
 *      screenshotted at the frame set's viewport, unstaged; a frame that throws is recorded, not fatal
 *   4. <review>/runs/<utc>-<commit>/F*.png and run.json; then the review page for today
 * Chrome time is capped (default 14 min): frames left when the cap hits are marked, not filmed.
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmOrder, loadFrameSet, validate } from './frameset.mjs';
import { stageFrame, unstageFrame } from './page.mjs';
import { RUNS, SLOTS, assertOutsideRepo } from './paths.mjs';
import { buildReview } from './review.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[film ${new Date().toISOString().slice(11, 19)}]`, ...a);

const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const WAIT_S = Number(flag('--wait', 1800));
const BUDGET_S = Number(flag('--budget', 840));
const SETTLE_MS = Number(flag('--settle', 2600));
const ONLY = flag('--only') ? new Set(flag('--only').split(',').map((s) => s.trim())) : null;

const set = loadFrameSet();
const problems = validate(set);
if (problems.length) { for (const p of problems) console.error('frameset:', p); process.exit(1); }
const frames = filmOrder(set.frames).filter((f) => !ONLY || ONLY.has(f.id));
if (!frames.length) { console.error('film: no frames selected'); process.exit(1); }

const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;

/* ---------------------------------------------------------------- 1. guard and slot */
function memory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}
const SLOT = path.join(SLOTS, 'slot1');
let slotHeld = false;
const releaseSlot = () => { if (slotHeld) { try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ } slotHeld = false; log('slot released'); } };
async function takeSlot() {
  const until = Date.now() + WAIT_S * 1000;
  for (let said = 0; Date.now() < until; said++) {
    const m = memory();
    if (m.ok) {
      try { mkdirSync(SLOT); slotHeld = true; } catch { /* held */ }
      if (slotHeld) {
        writeFileSync(path.join(SLOT, 'owner.txt'), `int frames ${process.pid} ${utc()}\n`);
        log(`slot taken (memory ${m.free} % free, level ${m.level})`);
        return true;
      }
    }
    if (!(said % 6)) {
      let owner = '';
      try { owner = execFileSync('head', ['-1', path.join(SLOT, 'owner.txt')], { encoding: 'utf8' }).trim(); } catch { /* */ }
      log(`waiting: memory ${m.free} % free, level ${m.level}${owner ? `, slot held by "${owner}"` : ''}`);
    }
    await sleep(10000);
  }
  return false;
}

/* ---------------------------------------------------------------- helpers */
// Vite's "localhost" can bind IPv6 only ([::1]); a port counts as open on either loopback
const portOn = (p, host) => new Promise((r) => { const s = net.connect(p, host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const portOpen = async (p) => (await portOn(p, '127.0.0.1')) || (await portOn(p, '::1'));
let vite = null, browser = null, profile = null;
async function teardown() {
  try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
  browser = null;
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } vite = null; }
  if (profile) { try { disposeProfile(profile); } catch { /* */ } profile = null; }
  releaseSlot();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { log(`${sig}: tearing down`); await teardown(); process.exit(130); });
process.on('exit', () => { releaseSlot(); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

/* ---------------------------------------------------------------- run */
const stamp = utc().replace(/[-:]/g, '');
const runDir = path.join(RUNS, `${stamp}-${commit}${ONLY ? '-partial' : ''}`);
assertOutsideRepo(runDir, REPO);
const run = { commit, dirty, branch: git('branch', '--show-current'), tree: REPO, port: PORT, frameset: set.sha256, viewport: set.viewport, startedAt: utc(), only: ONLY ? [...ONLY] : null, frames: [], console: [], errors: [] };

if (await portOpen(PORT)) { console.error(`film: port ${PORT} is already in use; not starting a second server`); process.exit(3); }
if (!(await takeSlot())) { console.error(`film: SLOT-NOT-AVAILABLE within ${WAIT_S} s (the memory guard or another run holds Chrome)`); process.exit(4); }

let exitCode = 0;
try {
  mkdirSync(runDir, { recursive: true });
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);

  installProfileCleanup();
  profile = profileDir(PORT);
  const vp = set.viewport || { width: 1600, height: 900, dpr: 1.25 };
  const t0 = Date.now();
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${vp.width},${vp.height + 40}`] });
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr || 1 });
  // a dead HMR socket: a file saved elsewhere mid-run must not reload the page under the film
  await page.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    function Dead() { const t = new EventTarget(); t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
      setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0); return t; }
    window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols;
      if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
    window.WebSocket.prototype = Real.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  let current = 'boot';
  page.on('console', (m) => { if (m.type() === 'error') run.console.push({ frame: current, text: m.text().slice(0, 400) }); });
  page.on('pageerror', (e) => run.console.push({ frame: current, text: 'pageerror: ' + String(e).slice(0, 400) }));

  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 });
  await sleep(6000);   // people and the deferred variety stream in behind the first frame
  run.bootSeconds = Math.round((Date.now() - t0) / 1000);
  log(`booted in ${run.bootSeconds} s; filming ${frames.length} frames`);

  for (const f of frames) {
    current = f.id;
    const spent = (Date.now() - t0) / 1000;
    if (spent > BUDGET_S) { run.frames.push({ id: f.id, ok: false, error: `not filmed: the ${BUDGET_S} s Chrome cap was reached` }); continue; }
    const m = memory();
    if (m.level === '4') { run.frames.push({ id: f.id, ok: false, error: 'not filmed: memory pressure critical' }); continue; }
    const fs0 = Date.now();
    try {
      const staged = await page.evaluate(stageFrame, f, { settleMs: SETTLE_MS });
      const shot = await page.screenshot({ type: 'png' });
      const img = sharp(shot).resize(vp.width, vp.height, { fit: 'fill' });
      const file = `${f.id}.png`;
      const png = await img.png({ compressionLevel: 8 }).toBuffer();
      writeFileSync(path.join(runDir, file), png);
      // mean relative luminance of the frame, in percent (sRGB channel means, linearised)
      const st = await sharp(png).stats();
      const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const [r, g, b] = st.channels.map((c) => c.mean);
      staged.measured.meanLuminance = Math.round((0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)) * 1000) / 10;
      const un = await page.evaluate(unstageFrame);
      run.frames.push({ id: f.id, ok: true, file, seconds: Math.round((Date.now() - fs0) / 100) / 10, ...staged, unstageErrors: un.errors });
      log(`${f.id} ok in ${((Date.now() - fs0) / 1000).toFixed(1)} s${staged.standIns.length ? ` (${staged.standIns.length} stand-in)` : ''}`);
    } catch (e) {
      run.frames.push({ id: f.id, ok: false, error: String(e?.message || e).slice(0, 400), seconds: Math.round((Date.now() - fs0) / 100) / 10 });
      log(`${f.id} FAILED: ${String(e?.message || e).slice(0, 160)}`);
      try { await page.evaluate(unstageFrame); } catch { /* page may be gone */ }
    }
  }
  run.chromeSeconds = Math.round((Date.now() - t0) / 1000);
} catch (e) {
  run.errors.push(String(e?.stack || e).slice(0, 800));
  exitCode = 1;
} finally {
  await teardown();
  run.endedAt = utc();
  try { mkdirSync(runDir, { recursive: true }); writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(run, null, 1)); } catch { /* */ }
}

const filmed = run.frames.filter((x) => x.ok).length;
log(`run ${runDir}: ${filmed}/${frames.length} frames filmed, ${run.chromeSeconds ?? '?'} s of Chrome, ${run.console.length} console errors`);
if (run.chromeSeconds > 900) log('WARNING: over the 15-minute cap');
if (!args.includes('--no-review') && filmed) {
  const r = await buildReview({ runDir, status: flag('--status') || '', setBaseline: args.includes('--baseline') });
  log(`review page: ${r.page}`);
}
process.exit(exitCode || (filmed === frames.length ? 0 : 1));
