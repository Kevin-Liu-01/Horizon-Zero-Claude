/**
 * M1.8a EXIT BAR — the frame bar of TECH §9.1 and its CPU, load and hitch budgets, in one Chrome slot session.
 *
 *   node tools/perf/exit-bar.mjs --port 5270 --out <dir outside the repo>
 *        [--frames F02,F23-plumb,F32] [--live-s 30] [--reps 7] [--loads 3] [--phases load,live,gpu] [--no-load] [--slot-wait 1800]
 *
 * Run it from a CLEAN tree at a commit (tools/perf/clean-measure.sh, or a detached worktree): the commit and the
 * tree's dirty list are written beside every number. It takes the machine guard and Chrome slot 1 itself
 * (tools/chrome-slot.mjs; CALIMA_SLOT_HELD=1 if the caller holds it) and runs its own servers on --port, bound to
 * 127.0.0.1 under nice -n 10, one at a time.
 *
 *   1. LOAD (built game, `vite build` then `vite preview`; vsync on): a fresh profile (cold) then --loads - 1 reloads
 *      in the same browser (warm cache). Per load: navigation to the title's Start button visible and the state
 *      `title` (title interactive, bar <= 5 s warm), the click to the state `playing` and the first frame drawn after
 *      it (New Game to control, bar <= 8 s warm), bytes transferred (CDP encodedDataLength; first load <= 60 MB).
 *      After the first load's New Game: --live-s seconds of presented-frame intervals in play (the hitch budget:
 *      no frame over 50 ms, at most 3 over 33 ms per 10 minutes, scaled to the window).
 *   2. LIVE (dev server, ?shot=1, vsync on): each frame staged as the Frame Set stages it (tools/frames/page.mjs),
 *      then the simulation released and --live-s seconds sampled: the presented-frame interval (rAF spacing; bar
 *      p95 <= 16.7 ms; an empty page in the same Chrome is sampled first as the harness's own jitter), the main thread's per-frame JS time (engine.lastFrame.jsMs = sim + submit + tail; bar
 *      p95 <= 8.0 ms), its sim and submit parts, frames over 33 / 50 ms, draws and triangles.
 *   3. GPU (dev server, a second Chrome with vsync and the frame-rate limit off, as M0.8): each frame staged and
 *      frozen, then --reps repetitions of tools/perf/attrib-page.mjs finishFrame (60 frames rendered back to back,
 *      each synchronised by a 1-pixel readback; submit + GPU) with 30 rendered frames between; the bar is the
 *      median of the repetitions' medians (<= 14 ms). The GPU renderer string and Chrome version are recorded.
 *
 * The 1-minute load average is read before and after every phase and written beside its numbers.
 */
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { takeMachineSlot, releaseMachineSlot } from '../chrome-slot.mjs';
import { stageFrame, unstageFrame } from '../frames/page.mjs';
import { loadFrameSet } from '../frames/frameset.mjs';
import { assertOutsideRepo } from '../frames/paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const OUT = flag('--out');
if (!OUT) { console.error('exit-bar: --out <dir> is required (outside the repo)'); process.exit(2); }
assertOutsideRepo(OUT, REPO);
mkdirSync(OUT, { recursive: true });
const FRAMES = flag('--frames', 'F02,F23-plumb,F32').split(',').map((s) => s.trim()).filter(Boolean);
const LIVE_S = Number(flag('--live-s', 30));
const REPS = Number(flag('--reps', 7));
const LOADS = Number(flag('--loads', 3));
const PHASES = new Set(flag('--phases', 'load,live,gpu').split(',').map((x) => x.trim()));
const NO_LOAD = args.includes('--no-load') || !PHASES.has('load');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[exit-bar ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
const load1 = () => Math.round(os.loadavg()[0] * 100) / 100;
const VP = { width: 1600, height: 900, deviceScaleFactor: 1.25 };
const BASE_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'];

const run = { tool: 'tools/perf/exit-bar.mjs', commit: git('rev-parse', '--short', 'HEAD'), dirty: (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean),
  tree: REPO, port: PORT, viewport: VP, frames: FRAMES, liveSeconds: LIVE_S, reps: REPS, startedAt: utc(), load: null, live: [], gpu: [], console: [], phases: [] };
const save = () => writeFileSync(path.join(OUT, 'exit-bar.json'), JSON.stringify(run, null, 1));

function portFree(p) { return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); }); }
async function waitHttp(url, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return true; } catch { /* */ } await sleep(500); }
  return false;
}
let server = null;
async function serve(kind) {
  if (!(await portFree(PORT))) throw new Error(`port ${PORT} is taken: this tool runs its own server`);
  const a = kind === 'preview' ? ['vite', 'preview'] : ['vite'];
  server = spawn('nice', ['-n', '10', 'npx', ...a, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  if (!(await waitHttp(`http://127.0.0.1:${PORT}/`))) throw new Error(`${kind} server did not answer on ${PORT}`);
}
function stopServer() {
  if (!server) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* */ }
  server = null;
}
process.on('exit', stopServer);

/** A dead HMR socket: nothing saved elsewhere may reload the page under a measurement. */
const deadHmr = () => {
  const Real = window.WebSocket;
  function Dead() { const t = new EventTarget(); t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
    setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0); return t; }
  window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols;
    if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
  window.WebSocket.prototype = Real.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
};

async function launch(extra, tag) {
  const profile = profileDir(PORT);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 600000, args: [...BASE_ARGS, ...extra] });
  return { browser, profile, close: async () => { try { await browser.close(); } catch { /* */ } disposeProfile(profile); log(`chrome (${tag}) closed`); } };
}
function watch(page, at) {
  page.on('console', (m) => { if (m.type() === 'error') run.console.push({ at: at.v, text: m.text().slice(0, 400) }); });
  page.on('pageerror', (e) => run.console.push({ at: at.v, text: 'pageerror: ' + String(e).slice(0, 400) }));
}

/** In the page: sample `seconds` of presented frames (rAF spacing) and the engine's own per-frame record. */
const sampleLive = async (seconds) => {
  const E = window.__CTX__.engine;
  const raf = () => new Promise((r) => requestAnimationFrame((t) => r(t)));
  const iv = [], js = [], sim = [], sub = [], calls = [], tris = [];
  let last = await raf();
  const end = performance.now() + seconds * 1000;
  while (performance.now() < end) {
    const t = await raf();
    iv.push(t - last); last = t;
    const lf = E.lastFrame || {};
    js.push(lf.jsMs); sim.push(lf.simMs); sub.push(lf.renderMs); calls.push(lf.calls); tris.push(lf.triangles);
  }
  const q = (a, p) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * p))] : null; };
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  return { seconds, frames: iv.length, fps: Math.round(iv.length / seconds * 100) / 100,
    intervalMs: { median: r2(q(iv, 0.5)), p95: r2(q(iv, 0.95)), p99: r2(q(iv, 0.99)), max: r2(Math.max(...iv)) },
    over: { ms17: iv.filter((v) => v > 17.5).length, ms33: iv.filter((v) => v > 33.4).length, ms50: iv.filter((v) => v > 50).length },
    cpuJsMs: { median: r2(q(js, 0.5)), p95: r2(q(js, 0.95)) }, simMs: { median: r2(q(sim, 0.5)), p95: r2(q(sim, 0.95)) },
    submitMs: { median: r2(q(sub, 0.5)), p95: r2(q(sub, 0.95)) }, draws: q(calls, 0.5), drawsMax: Math.max(...calls.filter(Number.isFinite)),
    triangles: q(tris, 0.5), trianglesMax: Math.max(...tris.filter(Number.isFinite)) };
};

const slot = await takeMachineSlot({ who: `exit-bar ${PORT}`, waitS: Number(flag('--slot-wait', 1800)), log });
if (!slot.ok) { run.error = slot.why; save(); console.error(slot.why); process.exit(3); }
installProfileCleanup();
const tStart = Date.now();
const set = loadFrameSet();
try {
  /* ---------------- 1. LOAD on the built game ---------------- */
  if (!NO_LOAD) {
    const ph = { phase: 'load', load1Before: load1(), at: utc() };
    log('vite build for the load phase');
    execFileSync('nice', ['-n', '10', 'npx', 'vite', 'build', '--logLevel', 'error'], { cwd: REPO, stdio: 'inherit' });
    await serve('preview');
    const C = await launch([], 'load');
    const at = { v: 'load' };
    const loads = [];
    try {
      const page = await C.browser.newPage();
      await page.setViewport(VP);
      watch(page, at);
      const cdp = await page.target().createCDPSession();
      await cdp.send('Network.enable');
      let bytes = 0, reqs = 0, fromCache = 0;
      cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; reqs++; });
      cdp.on('Network.requestServedFromCache', () => { fromCache++; });
      for (let i = 0; i < LOADS; i++) {
        at.v = `load ${i + 1}`;
        bytes = 0; reqs = 0; fromCache = 0;
        const t0 = Date.now();
        if (i === 0) await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        else await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
        // title interactive: the title state with the menus' "press any key" stage up (menu.js title flow)
        await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press'
          && !document.getElementById('title')?.classList.contains('hidden'), { timeout: 180000, polling: 25 });
        const titleS = (Date.now() - t0) / 1000;
        await sleep(400);
        // press any key -> the authored dolly -> the vertical menu (not part of either bar; recorded)
        const tp = Date.now();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 25 });
        const dollyS = (Date.now() - tp) / 1000;
        await sleep(300);
        // New Game to control: NEW GAME, then the first difficulty, to the state `playing` and two drawn frames
        const t1 = Date.now();
        const clicked = await page.evaluate(() => {
          const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /NEW GAME/.test(x.textContent));
          if (!b) return false; b.click(); return true;
        });
        if (!clicked) throw new Error('no NEW GAME item on the title menu');
        await page.waitForSelector('.mn-diff', { timeout: 20000 });
        const tPick = Date.now();
        await page.evaluate(() => document.querySelector('.mn-diff').click());
        await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 10 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        const controlS = (Date.now() - t1) / 1000, pickS = (Date.now() - tPick) / 1000;
        await sleep(1500);
        const rec = { load: i + 1, cache: i === 0 ? 'cold (fresh profile)' : 'warm (reload, same browser)', titleInteractiveS: +titleS.toFixed(2), titleDollyS: +dollyS.toFixed(2),
          newGameToControlS: +controlS.toFixed(3), difficultyClickToControlS: +pickS.toFixed(3),
          transferredMB: +(bytes / 1e6).toFixed(2), requests: reqs, servedFromCache: fromCache, load1: load1() };
        if (i === 0) {
          at.v = 'hitch window after New Game';
          rec.hitchWindow = await page.evaluate(sampleLive, LIVE_S);
          rec.hitchWindow.note = 'presented frames in play right after the loading sheet closed and New Game, standing at the spawn';
        }
        loads.push(rec);
        log(`load ${i + 1}: title ${rec.titleInteractiveS} s, control ${rec.newGameToControlS} s, ${rec.transferredMB} MB in ${rec.requests} requests (${rec.servedFromCache} from cache)`);
      }
    } finally { await C.close(); stopServer(); }
    ph.load1After = load1();
    run.load = loads; run.phases.push(ph); save();
  }

  /* ---------------- 2. LIVE presented-frame intervals, vsync on ---------------- */
  if (PHASES.has('live') || PHASES.has('gpu')) await serve('dev');
  if (PHASES.has('live')) {
    const ph = { phase: 'live', load1Before: load1(), at: utc() };
    const C = await launch([], 'live');
    const at = { v: 'boot' };
    try {
      const page = await C.browser.newPage();
      await page.setViewport(VP);
      await page.evaluateOnNewDocument(deadHmr);
      watch(page, at);
      // the control: an empty page in the same Chrome, so the harness's own presented-frame jitter is known
      {
        const blank = await C.browser.newPage();
        await blank.setViewport(VP);
        await blank.goto('data:text/html,<body style="background:%23222"></body>');
        await sleep(1000);
        const l0 = load1();
        const s = await blank.evaluate(async (seconds) => {
          const raf = () => new Promise((r) => requestAnimationFrame((t) => r(t)));
          const iv = []; let last = await raf(); const end = performance.now() + seconds * 1000;
          while (performance.now() < end) { const t = await raf(); iv.push(t - last); last = t; }
          const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
          const r2 = (v) => Math.round(v * 100) / 100;
          return { seconds, frames: iv.length, intervalMs: { median: r2(q(iv, 0.5)), p95: r2(q(iv, 0.95)), p99: r2(q(iv, 0.99)), max: r2(Math.max(...iv)) },
            over: { ms17: iv.filter((v) => v > 17.5).length, ms33: iv.filter((v) => v > 33.4).length, ms50: iv.filter((v) => v > 50).length } };
        }, LIVE_S);
        run.control = { what: 'an empty page (no WebGL) in the live Chrome, same launch flags and size', ...s, load1Before: l0, load1After: load1() };
        log(`control (empty page): interval median ${s.intervalMs.median} p95 ${s.intervalMs.p95} ms, ${s.frames} frames in ${s.seconds} s (load ${l0})`);
        await blank.close();
      }
      await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
      await sleep(8000);
      run.chrome = await C.browser.version();
      run.gpuRenderer = await page.evaluate(() => { try { const gl = window.__CTX__.engine.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; } catch { return null; } });
      run.textures = await page.evaluate(() => { const i = window.__CTX__.engine.renderer.info; return { textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs?.length }; });
      for (const id of FRAMES) {
        const f = set.frames.find((x) => x.id === id);
        if (!f) { run.live.push({ id, error: 'no such frame' }); continue; }
        at.v = `live ${id}`;
        try {
          const staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
          await page.screenshot({ path: path.join(OUT, `${id}-live.png`) });
          await page.evaluate(() => window.__CTX__.engine.requestTimeScale('studio', null));
          await sleep(1500);
          const l0 = load1();
          const s = await page.evaluate(sampleLive, LIVE_S);
          await page.evaluate(unstageFrame);
          run.live.push({ id, staged: staged.measured, ...s, load1Before: l0, load1After: load1() });
          log(`live ${id}: interval median ${s.intervalMs.median} p95 ${s.intervalMs.p95} ms; >33 ${s.over.ms33}, >50 ${s.over.ms50}; js p95 ${s.cpuJsMs.p95} ms; ${s.draws} draws, ${(s.triangles / 1e6).toFixed(2)} M tris (load ${l0})`);
        } catch (e) { run.live.push({ id, error: String(e?.stack || e).slice(0, 600) }); log(`live ${id} FAILED: ${String(e?.message || e).slice(0, 200)}`); try { await page.evaluate(unstageFrame); } catch { /* */ } }
        save();
      }
    } finally { await C.close(); }
    ph.load1After = load1(); run.phases.push(ph); save();
  }

  /* ---------------- 3. GPU by the M0.8 back-to-back readback, vsync off ---------------- */
  if (PHASES.has('gpu')) {
    const ph = { phase: 'gpu', load1Before: load1(), at: utc() };
    const C = await launch(['--disable-gpu-vsync', '--disable-frame-rate-limit'], 'gpu');
    const at = { v: 'boot' };
    try {
      const page = await C.browser.newPage();
      await page.setViewport(VP);
      await page.evaluateOnNewDocument(deadHmr);
      watch(page, at);
      await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
      await sleep(8000);
      for (const id of FRAMES) {
        const f = set.frames.find((x) => x.id === id);
        if (!f) continue;
        at.v = `gpu ${id}`;
        try {
          await page.evaluate(stageFrame, f, { settleMs: 2600 });
          await page.screenshot({ path: path.join(OUT, `${id}-gpu.png`) });
          const l0 = load1();
          const reps = await page.evaluate(async (n) => {
            const M = await import('/tools/perf/attrib-page.mjs');
            const E = window.__CTX__.engine;
            const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
            const out = [];
            for (let i = 0; i < n; i++) { for (let k = 0; k < 30; k++) await raf(); out.push(await M.finishFrame(E, 60)); }
            const info = E.renderer.info.render;
            return { reps: out, calls: info.calls, triangles: info.triangles };
          }, REPS);
          await page.evaluate(unstageFrame);
          const meds = reps.reps.map((r) => r.medianMs).sort((a, b) => a - b);
          const subs = reps.reps.map((r) => r.submitMs).sort((a, b) => a - b);
          const rec = { id, method: 'tools/perf/attrib-page.mjs finishFrame: 60 frames back to back, each + a 1-pixel readback (submit + GPU), frozen staged frame, vsync off',
            medianMs: meds[meds.length >> 1], minMs: meds[0], maxMs: meds[meds.length - 1], submitMedianMs: subs[subs.length >> 1], repMedians: reps.reps.map((r) => r.medianMs), repP95: reps.reps.map((r) => r.p95Ms),
            calls: reps.calls, triangles: reps.triangles, load1Before: l0, load1After: load1() };
          run.gpu.push(rec);
          log(`gpu ${id}: median ${rec.medianMs} ms (reps ${rec.repMedians.join(', ')}), submit ${rec.submitMedianMs} ms (load ${l0} -> ${rec.load1After})`);
        } catch (e) { run.gpu.push({ id, error: String(e?.stack || e).slice(0, 600) }); log(`gpu ${id} FAILED: ${String(e?.message || e).slice(0, 200)}`); try { await page.evaluate(unstageFrame); } catch { /* */ } }
        save();
      }
    } finally { await C.close(); }
    ph.load1After = load1(); run.phases.push(ph);
  }
} finally {
  stopServer();
  run.endedAt = utc(); run.chromeSeconds = Math.round((Date.now() - tStart) / 1000);
  save();
  releaseMachineSlot(log);
}
log(`done in ${run.chromeSeconds} s; ${run.console.length} console errors; ${path.join(OUT, 'exit-bar.json')}`);
process.exit(0);
