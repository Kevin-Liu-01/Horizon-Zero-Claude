#!/usr/bin/env node
/**
 * M1.8c HITCH PROBE (engine lane): what a long frame was doing, and what a staged frame's GPU is spent on.
 * One Chrome slot session, Vite (dev, or `vite preview` of a fresh build with --built) on --port from THIS tree, run it
 * inside tools/perf/clean-measure.sh so its numbers are a commit's.
 *
 *   node tools/perf/hitch-probe.mjs --port 5268 --out <dir outside the repo> [--phases boot,reward,ctx,gpu]
 *        [--built] [--play-s 15] [--frames F02,F23-gauge,F25] [--pairs 6]
 *
 *   boot    a player's boot (title, any key, NEW GAME, BEGIN) with every presented frame recorded from the navigation to
 *           --play-s seconds after the Loading sheet closes. Per frame: the rAF interval, the engine's own record
 *           (sim / submit / tail), the GL calls made since the last frame (shader compiles and links, program and
 *           shader status reads, texture and buffer uploads, each counted and timed), renderer.info deltas (programs,
 *           geometries, textures), the JS heap, and every system's update time; the long-animation-frame entries
 *           (their scripts) and the engine's warm-ups are logged beside them. Every frame over 33 ms is reported.
 *   reward  in the same page, the quest closed as the slice closes it (spine._finish(): the reward, the Scout's armour,
 *           the checkpoints, the card) and --play-s seconds recorded the same way.
 *   ctx     the never-restored context: a record, WEBGL_lose_context, the page's own reload and CONTINUE; then what the
 *           reloaded page draws (engine counters, context state, system errors, a shot and its luminance).
 *   gpu     (a second Chrome, vsync and the frame-rate limit off, as M0.8) each frame staged and frozen, its submit +
 *           GPU by the back-to-back readback (tools/perf/attrib-page.mjs finishFrame), then a PAIRED SKIP-ONE per
 *           group (each scene child, each Instrument, the transparent and alpha-tested classes, shadows, GTAO, bloom,
 *           SMAA): the median of --pairs paired differences "all on" minus "all on but this".
 *
 * Writes <out>/hitch-probe.json and its shots.
 */
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
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
if (!OUT) { console.error('hitch-probe: --out <dir> is required (outside the repo)'); process.exit(2); }
assertOutsideRepo(OUT, REPO);
mkdirSync(OUT, { recursive: true });
const PHASES = new Set(flag('--phases', 'boot,reward,ctx,gpu').split(',').map((s) => s.trim()));
const BUILT = args.includes('--built');
const PLAY_S = Number(flag('--play-s', 15));
const FRAMES = flag('--frames', 'F02,F23-gauge,F25').split(',').map((s) => s.trim()).filter(Boolean);
const PAIRS = Number(flag('--pairs', 6));
// --gpu-groups a,b: only the groups whose id holds one of these (the passes always); --split a,b: those groups also
// broken down (their shadow casting alone, and their 8 heaviest meshes by triangles)
const GROUPS = (flag('--gpu-groups', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const SPLIT = (flag('--split', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[hitch-probe ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
const load1 = () => Math.round(os.loadavg()[0] * 100) / 100;
const VP = { width: 1600, height: 900, deviceScaleFactor: 1.25 };
const BASE_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', '--enable-precise-memory-info'];

const run = { tool: 'tools/perf/hitch-probe.mjs', commit: process.env.CLEAN_COMMIT || git('rev-parse', '--short', 'HEAD'),
  dirty: (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean), tree: REPO, port: PORT, built: BUILT,
  viewport: VP, startedAt: utc(), console: [], boot: null, reward: null, ctx: null, gpu: [] };
const save = () => writeFileSync(path.join(OUT, 'hitch-probe.json'), JSON.stringify(run, null, 1));

function portFree(p) { return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); }); }
async function waitHttp(url, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return true; } catch { /* */ } await sleep(500); }
  return false;
}
let server = null;
async function serve() {
  if (!(await portFree(PORT))) throw new Error(`port ${PORT} is taken: this tool runs its own server`);
  if (BUILT) execFileSync('nice', ['-n', '10', 'npx', 'vite', 'build', '--logLevel', 'error'], { cwd: REPO, stdio: 'inherit' });
  const a = BUILT ? ['vite', 'preview'] : ['vite'];
  server = spawn('nice', ['-n', '10', 'npx', ...a, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  if (!(await waitHttp(`http://127.0.0.1:${PORT}/`))) throw new Error(`server did not answer on ${PORT}`);
}
function stopServer() { if (!server) return; try { process.kill(-server.pid, 'SIGTERM'); } catch { /* */ } server = null; }
process.on('exit', stopServer);

const deadHmr = () => {
  const Real = window.WebSocket;
  function Dead() { const t = new EventTarget(); t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
    setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0); return t; }
  window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols;
    if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
  window.WebSocket.prototype = Real.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
};

/** In the page, before any script: the GL call counters, the long-animation-frame log and the per-frame recorder. */
const recorder = () => {
  const R = (window.__hp = { gl: {}, loaf: [], frames: [], events: [], on: false, sys: null, last: 0 });
  const P = WebGL2RenderingContext.prototype;
  const WRAP = ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog',
    'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D',
    'compressedTexSubImage2D', 'compressedTexImage3D', 'compressedTexSubImage3D', 'bufferData', 'bufferSubData', 'generateMipmap',
    'readPixels', 'getError', 'getUniformLocation', 'getActiveUniform', 'getActiveAttrib', 'getAttribLocation', 'clientWaitSync', 'getQueryParameter'];
  for (const k of WRAP) {
    const f = P[k]; if (typeof f !== 'function') continue;
    const c = (R.gl[k] = { n: 0, ms: 0 });
    P[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { c.n++; c.ms += performance.now() - t; } };
  }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      if (R.loaf.length > 400) R.loaf.shift();
      R.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration ?? 0), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
        scripts: (e.scripts || []).map((s) => ({ inv: s.invoker, type: s.invokerType, fn: s.sourceFunctionName, url: (s.sourceURL || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, ''), at: s.sourceCharPosition, d: Math.round(s.duration), layout: Math.round(s.forcedStyleAndLayoutDuration || 0) })) });
    } }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (e) { R.loafError = String(e); }
  const snapGl = () => { const o = {}; for (const k in R.gl) o[k] = [R.gl[k].n, R.gl[k].ms]; return o; };
  let prevGl = snapGl(), prevInfo = null, prevHeap = 0;
  const tick = (t) => {
    const C = window.__CTX__, E = C?.engine;
    if (R.on && R.last) {
      const g = snapGl(), dGl = {};
      for (const k in g) { const n = g[k][0] - prevGl[k][0], ms = g[k][1] - prevGl[k][1]; if (n) dGl[k] = [n, Math.round(ms * 10) / 10]; }
      prevGl = g;
      const info = E?.renderer?.info, cur = info ? { p: info.programs?.length ?? 0, g: info.memory.geometries, x: info.memory.textures } : null;
      const heap = performance.memory?.usedJSHeapSize ?? 0;
      const L = document.getElementById('loading');
      const f = { t: Math.round(t), d: Math.round((t - R.last) * 10) / 10, state: C?.state ?? null, sheet: !!L && !L.classList.contains('hidden'),
        stage: C?.spine?.current?.()?.id ?? null, lf: E?.lastFrame ? { js: +E.lastFrame.jsMs.toFixed(1), sim: +E.lastFrame.simMs.toFixed(1), sub: +E.lastFrame.renderMs.toFixed(1), tail: +E.lastFrame.tailMs.toFixed(1), calls: E.lastFrame.calls } : null,
        gl: dGl, info: cur && prevInfo ? { p: cur.p - prevInfo.p, g: cur.g - prevInfo.g, x: cur.x - prevInfo.x } : null, heapMB: Math.round(heap / 1e5) / 10, heapD: Math.round((heap - prevHeap) / 1e5) / 10 };
      if (R.sys) { const top = Object.entries(R.sys).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, Math.round(v * 10) / 10]); if (top.length) f.sys = top; for (const k in R.sys) R.sys[k] = 0; }
      prevInfo = cur; prevHeap = heap;
      R.frames.push(f);
      if (R.frames.length > 20000) R.frames.shift();
    } else { prevGl = snapGl(); }
    R.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** In the page, once the game exists: time every system's update and the engine's warm-ups. */
const instrument = () => {
  const R = window.__hp, G = window.__GAME__, E = window.__CTX__.engine;
  R.sys = {};
  for (const s of G.systems) {
    const name = s.constructor?.name || 'anon';
    for (const ph of ['update', 'interpolate']) {
      const f = s[ph]; if (typeof f !== 'function' || f.__hp) continue;
      const key = `${name}.${ph}`; R.sys[key] = 0;
      const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { R.sys[key] += performance.now() - t; } };
      w.__hp = true; s[ph] = w;
    }
  }
  const wrapE = (obj, k, label) => { const f = obj[k]; if (typeof f !== 'function' || f.__hp) return;
    const w = function (...a) { const t = performance.now(); const out = f.apply(this, a);
      const end = (v) => { R.events.push({ what: label, t: Math.round(t), ms: Math.round(performance.now() - t) }); return v; };
      return out && typeof out.then === 'function' ? out.then(end) : end(out); };
    w.__hp = true; obj[k] = w; };
  wrapE(E, 'warmUp', 'engine.warmUp'); wrapE(E, 'warmUpTextures', 'engine.warmUpTextures'); wrapE(E, 'warmUpGeometries', 'engine.warmUpGeometries');
  wrapE(E.renderer, 'compile', 'renderer.compile');
  window.__CTX__.events?.on?.('warm-up-complete', (w) => R.events.push({ what: 'warm-up-complete', t: Math.round(performance.now()), w }));
  return Object.keys(R.sys).length;
};

/** In the page: the frames over `over` ms since `since` (page time), with the long-animation-frames that ended near them. */
const longFrames = ({ since, over }) => {
  const R = window.__hp;
  const L = R.frames.filter((f) => f.t >= since && f.d > over);
  return { frames: R.frames.filter((f) => f.t >= since).length, long: L.map((f) => ({ ...f, loaf: R.loaf.filter((l) => l.t + l.d >= f.t - f.d - 5 && l.t <= f.t + 5) })),
    events: R.events.filter((e) => e.t >= since - 20000), sheetClosedAt: (() => { const fs = R.frames; for (let i = 1; i < fs.length; i++) if (fs[i - 1].sheet && !fs[i].sheet && fs[i].t >= since) return fs[i].t; return null; })() };
};

async function launch(extra, tag) {
  const profile = profileDir(PORT);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 600000, args: [...BASE_ARGS, ...extra] });
  return { browser, close: async () => { try { await browser.close(); } catch { /* */ } disposeProfile(profile); log(`chrome (${tag}) closed`); } };
}

async function lum(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  let s = 0, black = 0; const n = data.length / info.channels;
  for (let i = 0; i < data.length; i += info.channels) { const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; s += y; if (y < 6) black++; }
  return { mean: +(s / n).toFixed(1), black: +(black / n).toFixed(3) };
}

const slot = await takeMachineSlot({ who: `hitch-probe ${PORT}`, waitS: Number(flag('--slot-wait', 1800)), log });
if (!slot.ok) { run.error = slot.why; save(); console.error(slot.why); process.exit(3); }
installProfileCleanup();
const tStart = Date.now();
try {
  await serve();
  if (PHASES.has('boot') || PHASES.has('reward') || PHASES.has('ctx')) {
    const C = await launch([], 'live');
    try {
      const page = await C.browser.newPage();
      await page.setViewport(VP);
      await page.evaluateOnNewDocument(deadHmr);
      await page.evaluateOnNewDocument(recorder);
      page.on('console', (m) => { if (m.type() === 'error' || /\[CAL\]/.test(m.text())) run.console.push({ type: m.type(), text: m.text().slice(0, 400) }); });
      page.on('pageerror', (e) => run.console.push({ type: 'pageerror', text: String(e).slice(0, 400) }));
      const E = (fn, ...a) => page.evaluate(fn, ...a);
      const boot = async () => {
        await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 240000, polling: 50 });
        const n = await E(instrument);
        await E(() => { window.__hp.on = true; });
        return n;
      };
      if (PHASES.has('boot') || PHASES.has('reward')) {
        const t0 = Date.now();
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        const nSys = await boot();
        const titleS = (Date.now() - t0) / 1000;
        await sleep(500);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
        await sleep(300);
        const tClick = await E(() => performance.now());
        await E(() => [...document.querySelectorAll('.mn-title-item')].find((x) => /NEW GAME/.test(x.textContent))?.click());
        await page.waitForSelector('.mn-diff', { timeout: 20000 });
        await E(() => document.querySelector('.mn-diff').click());
        await page.waitForFunction(() => window.__CTX__?.state === 'playing' && window.__CTX__?.spine?.started, { timeout: 60000, polling: 50 });
        await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 30000, polling: 20 }).catch(() => {});
        await sleep(PLAY_S * 1000);
        run.boot = { titleS, systemsTimed: nSys, load1: load1(), ...(await E(longFrames, { since: tClick, over: 33.4 })) };
        run.boot.playFrames = await E((s) => { const f = window.__hp.frames.filter((x) => x.t >= s && x.state === 'playing' && !x.sheet); return { n: f.length, over33: f.filter((x) => x.d > 33.4).length, over50: f.filter((x) => x.d > 50).length, max: Math.max(0, ...f.map((x) => x.d)) }; }, tClick);
        log(`boot: title ${titleS} s; after the sheet: ${JSON.stringify(run.boot.playFrames)}; long frames since NEW GAME ${run.boot.long.length}`);
        for (const f of run.boot.long) log(`  ${f.t} ${f.d} ms ${f.state}${f.sheet ? ' (sheet)' : ''} ${f.stage ?? ''} lf ${JSON.stringify(f.lf)} gl ${JSON.stringify(f.gl)} info ${JSON.stringify(f.info)} heapD ${f.heapD} sys ${JSON.stringify(f.sys ?? [])} loaf ${JSON.stringify(f.loaf.map((l) => ({ d: l.d, s: l.scripts.map((s) => `${s.type}:${s.inv}:${s.fn}@${s.url}:${s.d}`) })))}`);
        for (const e of run.boot.events) log(`  event ${JSON.stringify(e)}`);
        await page.screenshot({ path: path.join(OUT, 'boot-play.png') });
        save();
      }
      if (PHASES.has('reward')) {
        const tR = await E(() => performance.now());
        const r = await E(() => { const S = window.__CTX__.spine; const before = window.__CTX__.player.hero?.loadout?.armorId; S._finish(); return { before, done: S.done }; });
        await sleep(PLAY_S * 1000);
        run.reward = { ...r, after: await E(() => window.__CTX__.player.hero?.loadout?.armorId), ...(await E(longFrames, { since: tR, over: 33.4 })) };
        run.reward.playFrames = await E((s) => { const f = window.__hp.frames.filter((x) => x.t >= s); return { n: f.length, over33: f.filter((x) => x.d > 33.4).length, over50: f.filter((x) => x.d > 50).length, max: Math.max(0, ...f.map((x) => x.d)) }; }, tR);
        log(`reward: ${r.before} -> ${run.reward.after}; ${JSON.stringify(run.reward.playFrames)}`);
        for (const f of run.reward.long) log(`  ${f.t - Math.round(tR)} ${f.d} ms ${f.state} lf ${JSON.stringify(f.lf)} gl ${JSON.stringify(f.gl)} info ${JSON.stringify(f.info)} heapD ${f.heapD} sys ${JSON.stringify(f.sys ?? [])} loaf ${JSON.stringify(f.loaf.map((l) => ({ d: l.d, s: l.scripts.map((s) => `${s.type}:${s.inv}:${s.fn}@${s.url}:${s.d}`) })))}`);
        await page.screenshot({ path: path.join(OUT, 'reward.png') });
        save();
      }
      if (PHASES.has('ctx')) {
        if (!(PHASES.has('boot') || PHASES.has('reward'))) {
          await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
          await boot(); await sleep(500); await page.keyboard.press('Enter');
          await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 }); await sleep(300);
          await E(() => [...document.querySelectorAll('.mn-title-item')].find((x) => /NEW GAME/.test(x.textContent))?.click());
          await page.waitForSelector('.mn-diff', { timeout: 20000 }); await E(() => document.querySelector('.mn-diff').click());
          await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 }); await sleep(4000);
        }
        const X = {};
        await E(() => window.__CTX__.progression.save('hitch-probe'));
        await sleep(800);
        const before = path.join(OUT, 'ctx-0-before.png'); await page.screenshot({ path: before }); X.before = await lum(before);
        const tl = Date.now();
        const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).then(() => Date.now()).catch(() => null);
        await E(() => { const gl = window.__CTX__.renderer.getContext(); gl.getExtension('WEBGL_lose_context').loseContext(); });
        const tNav = await nav;
        X.reloadAfterMs = tNav ? tNav - tl : null;
        if (tNav) {
          await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 180000, polling: 100 }).catch(() => {});
          X.playingAfterMs = Date.now() - tl;
          const probe = () => { const C = window.__CTX__, E2 = C.engine, gl = C.renderer.getContext(), L = document.getElementById('loading');
            return { state: C.state, frames: E2.frames, engineLost: E2.contextLost, glLost: gl.isContextLost(), calls: E2.lastFrame.calls, tris: E2.lastFrame.triangles, hold: !!E2._hold,
              sheet: L ? { hidden: L.classList.contains('hidden'), op: getComputedStyle(L).opacity, disp: getComputedStyle(L).display } : null,
              canvas: (() => { const c = C.renderer.domElement, cs = getComputedStyle(c); return { w: c.width, h: c.height, vis: cs.visibility, op: cs.opacity, disp: cs.display }; })(),
              title: (() => { const t = document.getElementById('title'); return t ? { hidden: t.classList.contains('hidden') } : null; })(), bodyClass: document.body.className,
              cam: { x: +C.camera.position.x.toFixed(2), y: +C.camera.position.y.toFixed(2), z: +C.camera.position.z.toFixed(2), fov: +C.camera.fov.toFixed(2), near: C.camera.near, far: C.camera.far },
              player: { x: +C.player.position.x.toFixed(2), y: +C.player.position.y.toFixed(2), z: +C.player.position.z.toFixed(2) },
              exposure: C.renderer.toneMappingExposure, timeScale: E2.timeScale, sysErrors: (window.__GAME__.systemErrors || []).map((e) => `${e.key} x${e.count}: ${e.message.slice(0, 160)}`),
              hookErrors: E2.hookErrorCount ?? 0, ctxLog: E2.contextLog?.slice(-4), menus: { titleStage: C.menus?.titleStage, modal: !!document.querySelector('.mn-modal.show, .mn-modal.open') } }; };
          const series = [];
          for (let i = 0; i < 6; i++) { await sleep(1000); series.push(await E(probe)); const f = path.join(OUT, `ctx-reloaded-${i}.png`); await page.screenshot({ path: f }); series.at(-1).lum = await lum(f); }
          X.series = series;
          log(`ctx reload: after ${X.reloadAfterMs} ms, playing after ${X.playingAfterMs} ms; ${series.map((s) => `lum ${s.lum.mean}/${s.lum.black} frames ${s.frames} calls ${s.calls} lost ${s.engineLost}/${s.glLost}`).join(' | ')}`);
          log(`ctx reload probe: ${JSON.stringify(series.at(-1))}`);
        }
        run.ctx = X; save();
      }
    } finally { await C.close(); }
  }
  if (PHASES.has('gpu')) {
    const set = loadFrameSet();
    const C = await launch(['--disable-gpu-vsync', '--disable-frame-rate-limit'], 'gpu');
    try {
      const page = await C.browser.newPage();
      await page.setViewport(VP);
      await page.evaluateOnNewDocument(deadHmr);
      page.on('console', (m) => { if (m.type() === 'error') run.console.push({ type: 'error', text: m.text().slice(0, 400) }); });
      await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
      await sleep(8000);
      for (const id of FRAMES) {
        const f = set.frames.find((x) => x.id === id);
        if (!f) continue;
        try {
          await page.evaluate(stageFrame, f, { settleMs: 2600 });
          await page.screenshot({ path: path.join(OUT, `${id}-gpu.png`) });
          const l0 = load1();
          const rec = await page.evaluate(async (pairs, only, split) => {
            const M = await import('/tools/perf/attrib-page.mjs');
            const C = window.__CTX__, E = C.engine, scene = C.scene, sm = E.renderer.shadowMap;
            const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
            const wait = async (n) => { for (let i = 0; i < n; i++) await raf(); };
            const T = async () => (await M.finishFrame(E, 40)).medianMs;
            const base = []; for (let i = 0; i < 5; i++) { await wait(10); base.push(await T()); }
            base.sort((a, b) => a - b);
            const info = E.renderer.info.render;
            // the groups: each scene child that draws, each Instrument's root, the two classes, the passes
            const groups = [];
            const draws = (o) => { let n = 0; o.traverseVisible((x) => { if ((x.isMesh || x.isPoints || x.isLine || x.isSprite)) n++; }); return n; };
            const machineRoots = new Set((C.machines?.list || []).map((m) => m.root).filter(Boolean));
            const nameOf = (o) => o.name || o.userData?.name || o.type;
            scene.children.forEach((o, i) => { if (!o.visible || machineRoots.has(o)) return; const n = draws(o); if (n >= 1) groups.push({ id: `child${i}:${nameOf(o)}`, n, objs: [o] }); });
            (C.machines?.list || []).forEach((m) => { if (m.root?.visible) groups.push({ id: `inst:${m.kind || m.constructor?.name}#${m.id ?? ''}`, n: draws(m.root), objs: [m.root] }); });
            const cls = M.classify(E, scene);
            groups.push({ id: 'class:transparent', n: cls.transparent.length, objs: cls.transparent });
            groups.push({ id: 'class:alpha-tested', n: cls.alpha.length, objs: cls.alpha });
            const passes = [
              { id: 'pass:shadows', down: () => { const k = sm.autoUpdate; sm.autoUpdate = false; sm.needsUpdate = false; return () => { sm.autoUpdate = k; sm.needsUpdate = true; }; } },
              { id: 'pass:gtao', down: () => { const k = E.gtao.enabled; E.gtao.enabled = false; return () => { E.gtao.enabled = k; }; } },
              { id: 'pass:bloom', down: () => { const k = E.bloom.enabled; E.bloom.enabled = false; return () => { E.bloom.enabled = k; }; } },
              { id: 'pass:smaa', down: () => { const k = E.smaa.enabled; E.smaa.enabled = false; return () => { E.smaa.enabled = k; }; } },
            ];
            const tris = (o) => { const g = o.geometry; if (!g) return 0; const n = g.index ? g.index.count : (g.attributes.position?.count || 0); return (n / 3) * (o.isInstancedMesh ? o.count : 1); };
            if (only.length) groups.splice(0, groups.length, ...groups.filter((g) => only.some((x) => g.id.includes(x))));
            for (const g of groups.slice()) {
              if (!split.some((x) => g.id.includes(x))) continue;
              const meshes = []; g.objs.forEach((o) => o.traverseVisible((x) => { if (x.isMesh) meshes.push(x); }));
              groups.push({ id: `${g.id}/shadow`, n: meshes.filter((x) => x.castShadow).length, shadowOnly: meshes });
              meshes.slice().sort((a, b) => tris(b) - tris(a)).slice(0, 8).forEach((x) => groups.push({ id: `${g.id}/${x.name || x.type}${x.isInstancedMesh ? `[x${x.count}]` : ''} ${Math.round(tris(x) / 1000)}k`, n: 1, objs: [x] }));
            }
            for (const g of groups) g.down = g.shadowOnly
              ? () => { const prev = g.shadowOnly.map((o) => o.castShadow); g.shadowOnly.forEach((o) => { o.castShadow = false; }); return () => { g.shadowOnly.forEach((o, i) => { o.castShadow = prev[i]; }); }; }
              : () => { const prev = g.objs.map((o) => o.visible); g.objs.forEach((o) => { o.visible = false; }); return () => { g.objs.forEach((o, i) => { o.visible = prev[i]; }); }; };
            const rows = [];
            for (const g of [...groups, ...passes]) {
              const d = [];
              for (let i = 0; i < pairs; i++) { await wait(3); const on = await T(); const up = g.down(); await wait(3); const off = await T(); up(); d.push(on - off); }
              d.sort((a, b) => a - b);
              rows.push({ id: g.id, objects: g.n ?? null, ms: Math.round(d[d.length >> 1] * 100) / 100, iqr: [Math.round(d[Math.floor(d.length * 0.25)] * 100) / 100, Math.round(d[Math.floor(d.length * 0.75)] * 100) / 100] });
            }
            rows.sort((a, b) => b.ms - a.ms);
            return { medianMs: base[base.length >> 1], reps: base, calls: info.calls, triangles: info.triangles, rows,
              transparentObjects: [...cls.materials.transparent].map(([k, v]) => `${v} x ${k}`).slice(0, 30), alphaObjects: [...cls.materials.alpha].map(([k, v]) => `${v} x ${k}`).slice(0, 30) };
          }, PAIRS, GROUPS, SPLIT);
          await page.evaluate(unstageFrame);
          run.gpu.push({ id, ...rec, load1Before: l0, load1After: load1() });
          log(`gpu ${id}: median ${rec.medianMs} ms (${rec.reps.join(', ')}), ${rec.calls} draws; skip-one: ${rec.rows.slice(0, 12).map((r) => `${r.id}(${r.objects ?? '-'}) ${r.ms}`).join('; ')}`);
        } catch (e) { run.gpu.push({ id, error: String(e?.stack || e).slice(0, 600) }); log(`gpu ${id} FAILED: ${String(e?.message || e).slice(0, 200)}`); try { await page.evaluate(unstageFrame); } catch { /* */ } }
        save();
      }
    } finally { await C.close(); }
  }
} catch (e) {
  run.error = String(e?.stack || e).slice(0, 1500);
  log('ERROR', run.error);
} finally {
  stopServer();
  run.endedAt = utc(); run.chromeSeconds = Math.round((Date.now() - tStart) / 1000);
  save();
  releaseMachineSlot(log);
}
log(`done in ${run.chromeSeconds} s; ${run.console.length} console lines; ${path.join(OUT, 'hitch-probe.json')}`);
process.exit(0);
