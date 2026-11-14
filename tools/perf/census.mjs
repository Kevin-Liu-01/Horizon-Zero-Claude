/**
 * M1.1a GEOMETRY CENSUS AND A/B — the driver. Takes the machine guard and Chrome slot 1 itself, serves this tree on
 * --port with Vite (127.0.0.1, nice -n 10), boots the game once at the bar's size (1600 x 900, DPR 1.25), stages each
 * named frame (tools/frames/page.mjs), freezes it and runs tools/perf/census-page.mjs:
 *
 *   census     every submitted draw by pass (main, shadow cascade i) and object: draws, triangles, vertex invocations
 *   samplers   active sampler units of the ground's program (terrain chunk material) with the cascades bound
 *   finish     GPU+submit ms finish-to-finish (attrib-page finishFrame, M0.8's method), as shipped and with the look off
 *              (every engine.lookItems switch off and engine.setLookEnabled(false))
 *   groups     paired skip-one by object group (--groups)
 *   ab         the world's runtime switches, paired (--ab): terrain.perfSwitches(), vegetation.perfSwitches()
 *   seams      the LOD-seam probe on frames whose id is in --seams (default F32)
 *
 *   node tools/perf/census.mjs --port 5271 --out <dir outside the repo> [--frames F02,F32] [--groups] [--ab]
 *        [--seams F32] [--budget 600]
 */
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { stageFrame, unstageFrame } from '../frames/page.mjs';
import { loadFrameSet } from '../frames/frameset.mjs';
import { SLOTS, assertOutsideRepo } from '../frames/paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[census ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const OUT = flag('--out');
if (!OUT) { console.error('census: --out <dir> is required (outside the repo)'); process.exit(2); }
assertOutsideRepo(OUT, REPO);
const FRAMES = flag('--frames', 'F02,F32').split(',').map((s) => s.trim()).filter(Boolean);
const SEAMS = new Set(flag('--seams', 'F32').split(','));
const BUDGET_S = Number(flag('--budget', 600));
const LANE = flag('--lane', 'world');
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
mkdirSync(OUT, { recursive: true });

function memory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}
const SLOT = path.join(SLOTS, 'slot1');
let slotHeld = false;
const releaseSlot = () => { if (slotHeld) { try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ } slotHeld = false; log('slot released'); } };
async function takeSlot(waitS = 3600) {
  const until = Date.now() + waitS * 1000;
  for (let said = 0; Date.now() < until; said++) {
    const m = memory();
    if (m.ok) {
      try { mkdirSync(SLOT); slotHeld = true; } catch { /* held */ }
      if (slotHeld) { writeFileSync(path.join(SLOT, 'owner.txt'), `int ${LANE} ${process.pid} ${utc()}\n`); log(`slot taken (memory ${m.free} % free, level ${m.level})`); return true; }
    }
    if (!(said % 6)) log(`waiting: memory ${m.free} % free, level ${m.level}`);
    await sleep(5000);
  }
  return false;
}
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
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { await teardown(); process.exit(130); });
process.on('exit', () => { releaseSlot(); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

const run = { tool: 'tools/perf/census.mjs', commit: git('rev-parse', '--short', 'HEAD'), dirty: (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean),
  port: PORT, viewport: { width: 1600, height: 900, dpr: 1.25 }, frames: [], console: [] };
if (await portOpen(PORT)) { console.error(`census: port ${PORT} busy`); process.exit(3); }
if (!(await takeSlot())) { console.error('census: SLOT-NOT-AVAILABLE'); process.exit(4); }
const tStart = Date.now();
run.startedAt = utc();
try {
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  const launchArgs = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
  run.launchArgs = launchArgs;
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 600000, args: launchArgs });
  run.chrome = await browser.version();
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
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
  run.bootSeconds = Math.round((Date.now() - tStart) / 1000);
  await sleep(4000);
  const set = loadFrameSet();
  for (const id of FRAMES) {
    if ((Date.now() - tStart) / 1000 > BUDGET_S) { run.frames.push({ id, error: 'budget' }); continue; }
    const f = set.frames.find((x) => x.id === id);
    if (!f) { run.frames.push({ id, error: 'no such frame' }); continue; }
    current = id;
    const t0 = Date.now();
    try {
      const staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
      await page.screenshot({ path: path.join(OUT, `${id}.png`) });
      const opts = { groups: has('--groups'), ab: has('--ab'), seams: SEAMS.has(id) };
      const a = await page.evaluate(async (opts) => {
        const M = await import('/tools/perf/census-page.mjs');
        const A = await import('/tools/perf/attrib-page.mjs');
        const C = window.__CTX__, E = C.engine, S = C.scene;
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
        for (let i = 0; i < 20; i++) await raf();
        const out = { info: {} };
        try { const gl = E.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); out.info.gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; } catch { /* */ }
        out.census = M.census(E, S);
        const T = C.terrain;
        const groundMat = T.groundMaterial || T.mesh?.material;
        out.samplers = groundMat ? M.samplers(E, groundMat) : { error: 'no ground material' };
        out.terrainStats = T.lodStats ? T.lodStats() : null;
        out.finish = await A.finishFrame(E, 60);
        // the look off: every registered look item off, and the engine's look
        const items = [...(E.lookItems?.values?.() || [])];
        const was = items.map((it) => { try { return it.get(); } catch { return null; } });
        const lookOff = () => { for (const it of items) { try { it.set(false); } catch { /* */ } } E.setLookEnabled(false); };
        const lookOn = () => { items.forEach((it, i) => { try { it.set(was[i] ?? true); } catch { /* */ } }); E.setLookEnabled(true); };
        out.lookItems = items.map((it) => it.id);
        const tl = await M.toggles(E, [{ id: 'look', on: lookOn, off: lookOff }], { n: 40, pairs: 6 });
        out.look = tl.look;
        lookOff(); for (let i = 0; i < 10; i++) await raf();
        out.finishLookOff = await A.finishFrame(E, 80);
        out.censusLookOff = M.census(E, S).totals;
        if (opts.ab) {
          const sw = [...(T.perfSwitches ? T.perfSwitches() : []), ...(C.vegetation?.perfSwitches ? C.vegetation.perfSwitches() : [])];
          out.ab = await M.toggles(E, sw, { n: 30, pairs: 8 });
          out.abCensus = {};
          for (const s of sw) { s.off(); for (let i = 0; i < 6; i++) await raf(); out.abCensus[s.id] = M.census(E, S).totals; (s.restore || s.on)(); for (let i = 0; i < 4; i++) await raf(); }
        }
        if (opts.groups) {
          const groups = {};
          const add = (k, o) => { (groups[k] || (groups[k] = [])).push(o); };
          for (const top of S.children) {
            if (top.name === 'terrain' || top.name === 'vegetation') { for (const c of top.children) add(`${top.name}/${c.name || c.type}`.replace(/-\d+(-\d+)*$/, '-*'), c); }
            else add(top.name || top.type, top);
          }
          out.groups = await M.groupSkip(E, groups, { n: 16, pairs: 4 });
        }
        if (opts.seams) {
          const land = new Set(); T.group.traverse((o) => { if (o.isMesh && o !== T.isles) land.add(o); });
          const water = new Set(); (T.water?.group || T.water?.mesh)?.traverse?.((o) => { if (o.isMesh) water.add(o); });
          out.seams = M.seams(E, S, (o) => land.has(o) || water.has(o));
          if (T.perfSwitches) {
            const lod = T.perfSwitches().find((s) => s.id === 'terrain-lod');
            if (lod) { lod.off(); for (let i = 0; i < 4; i++) await raf(); out.seamsMonolithic = M.seams(E, S, (o) => (T.group.children.includes(o) || land.has(o) || water.has(o)) && o !== T.isles && o.visible); lod.on(); }
          }
        }
        lookOn();
        return out;
      }, opts);
      await page.evaluate(unstageFrame);
      run.frames.push({ id, staged: { measured: staged.measured, standIns: staged.standIns }, ...a, wallSeconds: Math.round((Date.now() - t0) / 1000) });
      log(`${id}: finish ${a.finish.medianMs} ms, look off ${a.finishLookOff.medianMs} ms, main ${JSON.stringify(a.census.totals.main)}, all ${JSON.stringify(a.census.all)}, samplers ${a.samplers.units}`);
    } catch (e) {
      run.frames.push({ id, error: String(e?.stack || e).slice(0, 800) });
      log(`${id} FAILED: ${String(e?.message || e).slice(0, 300)}`);
      try { await page.evaluate(unstageFrame); } catch { /* */ }
    }
  }
} finally {
  run.endedAt = utc();
  run.chromeSeconds = Math.round((Date.now() - tStart) / 1000);
  writeFileSync(path.join(OUT, 'census.json'), JSON.stringify(run, null, 1));
  await teardown();
  log(`wrote ${path.join(OUT, 'census.json')} (${run.console.length} console errors, ${run.chromeSeconds} s)`);
}
