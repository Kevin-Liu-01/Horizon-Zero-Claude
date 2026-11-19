/**
 * M0.8 PERFORMANCE ATTRIBUTION — the driver. Boots the game once in headless Chrome at the bar's size
 * (1600 x 900 CSS px, DPR 1.25), stages each named Frame Set frame (tools/frames/page.mjs), freezes it, and runs
 * the page half (tools/perf/attrib-page.mjs): a per-class GPU split, the overdraw view, the unlit swap, the
 * half-resolution probe and the CPU frame. Writes one JSON per run and a screenshot per frame.
 *
 *   node tools/perf/attrib.mjs --port 5270 --out <dir outside the repo> [--frames F02,F23-plumb,F32] [--vsync on]
 *        [--probe m08|d1] [--standins F25] [--serve] [--slot-wait 1800]
 *
 * --probe d1 (M2 wave 0, D1) runs attrib-page.mjs attributeD1 instead of M0.8's attributeFrame: the census of draws and
 * triangles per scene child and per cascade, the GPU ms of the costliest children, of each cascade, of the post chain,
 * the 1/64-pixel frame (vertex, per-draw and fixed cost), the main thread with Brea's cloth and the people live, and on
 * the --standins frames the Holds' fight load as stand-in geometry. tools/perf/holds-budget.mjs reads its JSON.
 *
 * The tool takes the machine guard and Chrome slot 1 itself (tools/chrome-slot.mjs; CALIMA_SLOT_HELD=1 if the caller
 * holds it). With --serve it runs its own Vite dev server on --port (127.0.0.1, nice -n 10) and stops it at the end;
 * without, the caller serves the tree on the port. Timing method: the GPU is timed
 * with EXT_disjoint_timer_query_webgl2 around composer.render (engine.enableGpuTimer), which does not include the
 * wait for vsync; Chrome is launched with --disable-gpu-vsync --disable-frame-rate-limit (unless --vsync on) so the
 * GPU runs frame after frame and is not down-clocked by idle gaps. The GPU renderer string and the Chrome version
 * are recorded with every run.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { takeMachineSlot, releaseMachineSlot, machineMemory } from '../chrome-slot.mjs';
import { assertOutsideRepo } from '../frames/paths.mjs';
import { stageFrame, unstageFrame } from '../frames/page.mjs';
import { loadFrameSet } from '../frames/frameset.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
const OUT = flag('--out');
if (!OUT) { console.error('attrib: --out <dir> is required (outside the repo)'); process.exit(2); }
const FRAMES = (flag('--frames', 'F02,F23-plumb,F32')).split(',').map((s) => s.trim()).filter(Boolean);
const VSYNC = flag('--vsync', 'off');
const PROBE = flag('--probe', 'm08');
const STANDINS = new Set((flag('--standins', '') || '').split(',').map((x) => x.trim()).filter(Boolean));
const SERVE = args.includes('--serve');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assertOutsideRepo(OUT, REPO);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
const load1 = () => Math.round(os.loadavg()[0] * 100) / 100;
mkdirSync(OUT, { recursive: true });

const run = { tool: 'tools/perf/attrib.mjs', commit: git('rev-parse', '--short', 'HEAD'), dirty: (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean),
  tree: REPO, port: PORT, vsync: VSYNC, probe: PROBE, standIns: [...STANDINS], load1: { start: load1() }, viewport: { width: 1600, height: 900, dpr: 1.25 }, startedAt: new Date().toISOString(), frames: [], console: [] };
installProfileCleanup();
let server = null;
const stopServer = () => { if (!server) return; try { process.kill(-server.pid, 'SIGTERM'); } catch { /* */ } server = null; };
process.on('exit', stopServer);
if (SERVE) {
  server = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  let up = false;
  for (let i = 0; i < 240 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { /* */ } if (!up) await sleep(500); }
  if (!up) { stopServer(); console.error(`attrib: the dev server did not answer on ${PORT}`); process.exit(3); }
}
const slot = await takeMachineSlot({ who: `attrib ${PORT}`, waitS: Number(flag('--slot-wait', 1800)) });
if (!slot.ok) { stopServer(); console.error(`attrib: no Chrome slot (${slot.why})`); process.exit(4); }
run.slot = { waitedS: slot.waitedS, held: slot.held };
const launchArgs = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'];
if (VSYNC === 'off') launchArgs.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
run.launchArgs = launchArgs;
run.launches = [];
// A Chrome the machine guard kills (free memory under 30 %: the orchestrator's mem-guard pkills gate Chromes) or that
// dies is relaunched once memory is calm again (machineMemory: free >= 50 %, level 1), up to --relaunch times; the frame
// it died on is tried once more. The slot stays held across a relaunch.
const RELAUNCH = Number(flag('--relaunch', 3));
let browser = null, page = null, profile = null, current = 'boot';
async function closeBrowser() {
  if (browser) { try { await browser.close(); } catch { try { browser.process()?.kill('SIGKILL'); } catch { /* */ } } }
  if (profile) disposeProfile(profile);
  browser = null; page = null; profile = null;
}
async function boot() {
  profile = profileDir(PORT);
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 600000, args: launchArgs });
  run.chrome = await browser.version();
  page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  // a dead HMR socket: a file saved elsewhere in the shared tree mid-run must not reload the page under the measurement
  await page.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    function Dead() { const t = new EventTarget(); t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
      setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0); return t; }
    window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols;
      if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
    window.WebSocket.prototype = Real.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  page.on('console', (m) => { if (m.type() === 'error') run.console.push({ at: current, text: m.text().slice(0, 400) }); else if (m.text().startsWith('[d1]')) console.log(`[attrib ${current}] ${m.text()}`); });
  page.on('error', (e) => console.log(`[attrib] page crashed at ${current}: ${String(e).slice(0, 200)}`));
  page.on('pageerror', (e) => run.console.push({ at: current, text: 'pageerror: ' + String(e).slice(0, 400) }));
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
  await sleep(6000);
  run.launches.push({ at: new Date().toISOString(), bootS: Math.round((Date.now() - t0) / 1000), memory: machineMemory() });
}
const alive = () => !!(browser && browser.connected !== false && page && !page.isClosed());
try {
  const set = loadFrameSet();
  const queue = FRAMES.slice();
  const tries = new Map();
  let relaunches = 0, died = false;
  while (queue.length) {
    const id = queue[0];
    const f = set.frames.find((x) => x.id === id);
    if (!f) { run.frames.push({ id, error: 'no such frame' }); queue.shift(); continue; }
    if (!alive()) {
      if (browser || died) {
        died = false;
        await closeBrowser();
        if (relaunches++ >= RELAUNCH) { for (const q of queue) run.frames.push({ id: q, error: 'not measured: Chrome died and the relaunches were spent' }); break; }
        for (let w = 0; w < 120 && !machineMemory().ok; w++) await sleep(5000);
        console.log(`[attrib] relaunching Chrome (${relaunches}/${RELAUNCH}), memory ${JSON.stringify(machineMemory())}`);
      }
      current = 'boot';
      await boot();
    }
    current = id;
    const t0 = Date.now();
    try {
      const staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
      await page.screenshot({ path: path.join(OUT, `${id}.png`) });
      if (PROBE === 'd1') {
        const l0 = load1();
        const a = await page.evaluate(async (standIn) => {
          const M = await import('/tools/perf/attrib-page.mjs');
          return M.attributeD1(window.__CTX__.engine, window.__CTX__.scene, window.__CTX__, { standIn });
        }, STANDINS.has(id));
        await page.evaluate(unstageFrame);
        run.frames.push({ id, staged: { measured: staged.measured, standIns: staged.standIns, sim: staged.sim ? { frames: staged.sim.frames } : null }, load1: [l0, load1()], memory: machineMemory(), ...a, wallSeconds: Math.round((Date.now() - t0) / 1000) });
        writeFileSync(path.join(OUT, 'attrib.json'), JSON.stringify(run, null, 1));
        console.log(`[attrib d1] ${id}: finish ${a.finish.medianMs} ms (submit ${a.finish.submitMs}), end ${a.finishEnd.medianMs}; draws ${a.census.frame.draws}, tris ${a.census.frame.tris}; shadows ${a.cascades.all.ms}, post ${a.post.ms}; tiny ${JSON.stringify(a.tiny.derived)}; owners ${a.owners.rows.map((r) => `${r.name} ${r.ms}`).join(', ')}; ${a.seconds} s`);
      } else {
        const a = await page.evaluate(async () => {
          const M = await import('/tools/perf/attrib-page.mjs');
          return M.attributeFrame(window.__CTX__.engine, window.__CTX__.scene);
        });
        await page.evaluate(unstageFrame);
        run.frames.push({ id, staged: { measured: staged.measured, standIns: staged.standIns }, ...a, wallSeconds: Math.round((Date.now() - t0) / 1000) });
        console.log(`[attrib] ${id}: timer(vsync) ${a.whole.medianMs} ms, finish ${a.finish.medianMs} ms (submit ${a.finish.submitMs}), split ${JSON.stringify(a.split.grouped)}, paired ${JSON.stringify(Object.fromEntries(Object.entries(a.paired.rows).map(([k, v]) => [k, v.ms])))}, alpha layers ${a.overdraw.alphaTested.layersPerCoveredPixel}, half-res ratio ${a.halfRes.ratio}`);
      }
      queue.shift();
    } catch (e) {
      const dead = !alive() || /Target closed|detached Frame|Session closed/i.test(String(e?.message || e));
      console.log(`[attrib] ${id} FAILED${dead ? ' (Chrome died)' : ''}: ${String(e?.message || e).slice(0, 200)}; memory ${JSON.stringify(machineMemory())}`);
      const n = (tries.get(id) || 0) + 1; tries.set(id, n);
      if (dead && n < 2) { died = true; await closeBrowser(); continue; }
      run.frames.push({ id, error: String(e?.stack || e).slice(0, 800) });
      queue.shift();
      try { await page.evaluate(unstageFrame); } catch { /* */ }
    }
  }
} finally {
  await closeBrowser();
  releaseMachineSlot();
  stopServer();
  run.load1.end = load1();
  run.endedAt = new Date().toISOString();
  writeFileSync(path.join(OUT, 'attrib.json'), JSON.stringify(run, null, 1));
  console.log(`[attrib] wrote ${path.join(OUT, 'attrib.json')} (${run.console.length} console errors)`);
}
