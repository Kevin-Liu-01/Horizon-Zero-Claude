/**
 * M0.8 PERFORMANCE ATTRIBUTION — the driver. Boots the game once in headless Chrome at the bar's size
 * (1600 x 900 CSS px, DPR 1.25), stages each named Frame Set frame (tools/frames/page.mjs), freezes it, and runs
 * the page half (tools/perf/attrib-page.mjs): a per-class GPU split, the overdraw view, the unlit swap, the
 * half-resolution probe and the CPU frame. Writes one JSON per run and a screenshot per frame.
 *
 *   node tools/perf/attrib.mjs --port 5270 --out <dir outside the repo> [--frames F02,F23-plumb,F32] [--vsync on]
 *
 * The caller holds the Chrome slot and serves the tree on the port (Vite, 127.0.0.1). Timing method: the GPU is timed
 * with EXT_disjoint_timer_query_webgl2 around composer.render (engine.enableGpuTimer), which does not include the
 * wait for vsync; Chrome is launched with --disable-gpu-vsync --disable-frame-rate-limit (unless --vsync on) so the
 * GPU runs frame after frame and is not down-clocked by idle gaps. The GPU renderer string and the Chrome version
 * are recorded with every run.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { stageFrame, unstageFrame } from '../frames/page.mjs';
import { loadFrameSet } from '../frames/frameset.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
const OUT = flag('--out');
if (!OUT) { console.error('attrib: --out <dir> is required (outside the repo)'); process.exit(2); }
const FRAMES = (flag('--frames', 'F02,F23-plumb,F32')).split(',').map((s) => s.trim()).filter(Boolean);
const VSYNC = flag('--vsync', 'off');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return null; } };
mkdirSync(OUT, { recursive: true });

const run = { tool: 'tools/perf/attrib.mjs', commit: git('rev-parse', '--short', 'HEAD'), dirty: (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean),
  port: PORT, vsync: VSYNC, viewport: { width: 1600, height: 900, dpr: 1.25 }, startedAt: new Date().toISOString(), frames: [], console: [] };
installProfileCleanup();
const profile = profileDir(PORT);
const launchArgs = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'];
if (VSYNC === 'off') launchArgs.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
run.launchArgs = launchArgs;
const browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 600000, args: launchArgs });
try {
  run.chrome = await browser.version();
  const page = await browser.newPage();
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
  let current = 'boot';
  page.on('console', (m) => { if (m.type() === 'error') run.console.push({ at: current, text: m.text().slice(0, 400) }); });
  page.on('pageerror', (e) => run.console.push({ at: current, text: 'pageerror: ' + String(e).slice(0, 400) }));
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
  await sleep(6000);
  const set = loadFrameSet();
  for (const id of FRAMES) {
    const f = set.frames.find((x) => x.id === id);
    if (!f) { run.frames.push({ id, error: 'no such frame' }); continue; }
    current = id;
    const t0 = Date.now();
    try {
      const staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
      await page.screenshot({ path: path.join(OUT, `${id}.png`) });
      const a = await page.evaluate(async () => {
        const M = await import('/tools/perf/attrib-page.mjs');
        return M.attributeFrame(window.__CTX__.engine, window.__CTX__.scene);
      });
      await page.evaluate(unstageFrame);
      run.frames.push({ id, staged: { measured: staged.measured, standIns: staged.standIns }, ...a, wallSeconds: Math.round((Date.now() - t0) / 1000) });
      console.log(`[attrib] ${id}: timer(vsync) ${a.whole.medianMs} ms, finish ${a.finish.medianMs} ms (submit ${a.finish.submitMs}), split ${JSON.stringify(a.split.grouped)}, paired ${JSON.stringify(Object.fromEntries(Object.entries(a.paired.rows).map(([k, v]) => [k, v.ms])))}, alpha layers ${a.overdraw.alphaTested.layersPerCoveredPixel}, half-res ratio ${a.halfRes.ratio}`);
    } catch (e) {
      run.frames.push({ id, error: String(e?.stack || e).slice(0, 800) });
      console.log(`[attrib] ${id} FAILED: ${String(e?.message || e).slice(0, 200)}`);
      try { await page.evaluate(unstageFrame); } catch { /* */ }
    }
  }
} finally {
  try { await browser.close(); } catch { try { browser.process()?.kill('SIGKILL'); } catch { /* */ } }
  disposeProfile(profile);
  run.endedAt = new Date().toISOString();
  writeFileSync(path.join(OUT, 'attrib.json'), JSON.stringify(run, null, 1));
  console.log(`[attrib] wrote ${path.join(OUT, 'attrib.json')} (${run.console.length} console errors)`);
}
