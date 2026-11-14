/**
 * M1.1b / M1.1e — THE MEADOW AND GROUND SESSION. One Chrome session (the machine guard and slot 1 taken here, Vite on
 * --port bound to 127.0.0.1 under nice -n 10), the game booted once at the bar's size (1600 x 900, DPR 1.25):
 *
 *   F02   stills with the main target at 0 and 4 samples; grass triangles submitted and drawn; soil-coloured pixels
 *         within 30 m; paired GPU A/B (render + 1-pixel readback, M0.8's method): the meadow on/off, MSAA 4 vs 0,
 *         coverage fade on the blades on/off under MSAA; the walk and sprint sequences at 0 and 4 samples (temporal
 *         second difference over meadow pixels); then, with --clip, the 10-second clip (5 s at 1 m/s, 5 s sprint at
 *         6.8 m/s and the sprint FOV) at the sample count with fewer events, as JPEG frames and an MP4 (ffmpeg)
 *   F03   stills at 0 and 4 samples; grass triangles; soil-coloured pixels
 *   F04   still (shipped)
 *   --topdown   40 m orthographic top-down captures of the ground at named sites and their autocorrelation
 *               (tools/perf/autocorr.mjs): the M1.1e tiling check
 *
 *   node tools/perf/meadow.mjs --port 5271 --out <dir outside the repo> [--frames F02,F03,F04] [--clip] [--topdown]
 *        [--no-timing] [--no-walk] [--budget 780]
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { stageFrame, unstageFrame } from '../frames/page.mjs';
import { loadFrameSet } from '../frames/frameset.mjs';
import { SLOTS, assertOutsideRepo } from '../frames/paths.mjs';
import { autocorr } from './autocorr.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[meadow ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const OUT = flag('--out');
if (!OUT) { console.error('meadow: --out <dir> is required (outside the repo)'); process.exit(2); }
assertOutsideRepo(OUT, REPO);
const FRAMES = flag('--frames', 'F02,F03,F04').split(',').map((s) => s.trim()).filter(Boolean);
const BUDGET_S = Number(flag('--budget', 780));
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

const run = { tool: 'tools/perf/meadow.mjs', commit: git('rev-parse', '--short', 'HEAD'), dirty: (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean),
  port: PORT, viewport: { width: 1600, height: 900, dpr: 1.25 }, frames: {}, console: [] };
if (await portOpen(PORT)) { console.error(`meadow: port ${PORT} busy`); process.exit(3); }
if (!(await takeSlot())) { console.error('meadow: SLOT-NOT-AVAILABLE'); process.exit(4); }
const tStart = Date.now();
const spent = () => (Date.now() - tStart) / 1000;
run.startedAt = utc();
/** The page's base64 RGBA (bottom-up) as a PNG file, top-down. */
async function savePng(file, b64, w, h) {
  const raw = Buffer.from(b64, 'base64');
  const flip = Buffer.alloc(raw.length), row = w * 4;
  for (let y = 0; y < h; y++) raw.copy(flip, (h - 1 - y) * row, y * row, (y + 1) * row);
  await sharp(flip, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
  return flip;
}
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
  const clipDir = path.join(OUT, 'clip');
  await page.exposeFunction('__meadowFrame', (k, dataUrl) => {
    mkdirSync(clipDir, { recursive: true });
    writeFileSync(path.join(clipDir, `f${String(k).padStart(4, '0')}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    return true;
  });
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
  run.bootSeconds = Math.round(spent());
  await sleep(4000);
  const set = loadFrameSet();
  const msaa = (n) => page.evaluate(async (n) => (await import('/tools/perf/meadow-page.mjs')).setMsaa(window.__CTX__.engine, n), n);
  const shot = async (file) => page.screenshot({ path: path.join(OUT, file) });

  for (const id of FRAMES) {
    if (spent() > BUDGET_S) { run.frames[id] = { error: 'budget' }; continue; }
    const f = set.frames.find((x) => x.id === id);
    current = id;
    const R = run.frames[id] = {};
    try {
      R.staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
      await msaa(0); await shot(`${id}-msaa0.png`);
      if (id === 'F04') { await page.evaluate(unstageFrame); log(`${id} filmed`); continue; }
      R.msaa0 = await page.evaluate(async () => {
        const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine;
        return { grass: M.grassCount(E, C.scene, C), soil: await M.soil(E, C) };
      });
      log(`${id} msaa0: grass submitted ${R.msaa0.grass.submittedTris}, mirror drawn ${R.msaa0.grass.mirror.drawnTris}, soil ${R.msaa0.soil.soilPct} % (wide class ${R.msaa0.soil.soilPctWideClass} %, gap ${R.msaa0.soil.gapPct} %)`);
      if (id === 'F02' && !has('--no-timing')) {
        R.timing = await page.evaluate(async () => {
          const M = await import('/tools/perf/meadow-page.mjs'); const P = await import('/tools/perf/census-page.mjs'); const A = await import('/tools/perf/attrib-page.mjs');
          const C = window.__CTX__, E = C.engine, MD = C.vegetation.meadow;
          const sw = Object.fromEntries(MD.perfSwitches().map((s) => [s.id, s]));
          const out = {};
          await M.setMsaa(E, 0);
          out.finishMsaa0 = await A.finishFrame(E, 60);
          out.meadowAtMsaa0 = (await P.toggles(E, [sw.meadow], { n: 30, pairs: 8 })).meadow;
          // MSAA 4 against 0: the target is rebuilt each switch (a few frames to settle, then the paired measure)
          const ms = { id: 'msaa4', on: () => E.applyTier({ ...E.tier, msaa: 4 }, E.quality), off: () => E.applyTier({ ...E.tier, msaa: 0 }, E.quality), restore: () => E.applyTier({ ...E.tier, msaa: 0 }, E.quality) };
          out.msaa4VsMsaa0 = (await P.toggles(E, [ms], { n: 30, pairs: 6 })).msaa4;
          await M.setMsaa(E, 4);
          out.finishMsaa4 = await A.finishFrame(E, 60);
          out.meadowAtMsaa4 = (await P.toggles(E, [sw.meadow], { n: 30, pairs: 8 })).meadow;
          out.a2cAtMsaa4 = (await P.toggles(E, [sw['meadow-a2c']], { n: 30, pairs: 6 }))['meadow-a2c'];
          const smaa = { id: 'smaa', on: () => { E.smaa.enabled = true; }, off: () => { E.smaa.enabled = false; }, restore: () => { E.smaa.enabled = true; } };
          out.smaaAtMsaa4 = (await P.toggles(E, [smaa], { n: 30, pairs: 6 })).smaa;
          await M.setMsaa(E, 0);
          out.smaaAtMsaa0 = (await P.toggles(E, [smaa], { n: 30, pairs: 6 })).smaa;
          out.diagAtMsaa0 = await P.toggles(E, ['meadow-r0', 'meadow-r1', 'meadow-r2', 'meadow-lighting', 'meadow-raster', 'meadow-shadow-recv'].map((k) => sw[k]), { n: 30, pairs: 6 });
          return out;
        });
        log(`${id} timing: msaa0 ${R.timing.finishMsaa0.medianMs} ms, msaa4 ${R.timing.finishMsaa4.medianMs} ms; meadow @0 ${R.timing.meadowAtMsaa0.onMinusOffMs}, msaa4-0 ${R.timing.msaa4VsMsaa0.onMinusOffMs}, a2c ${R.timing.a2cAtMsaa4.onMinusOffMs}, smaa @4 ${R.timing.smaaAtMsaa4.onMinusOffMs} @0 ${R.timing.smaaAtMsaa0.onMinusOffMs}`);
        log(`${id} diag @0: ${Object.entries(R.timing.diagAtMsaa0).map(([k, v]) => `${k} ${v.onMinusOffMs}`).join(', ')}`);
      }
      await msaa(4); await shot(`${id}-msaa4.png`);
      R.msaa4 = await page.evaluate(async () => {
        const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine;
        return { grass: M.grassCount(E, C.scene, C), soil: await M.soil(E, C) };
      });
      log(`${id} msaa4: soil ${R.msaa4.soil.soilPct} % (gap ${R.msaa4.soil.gapPct} %)`);
      if (id === 'F02' && !has('--no-walk')) {
        R.walk = {};
        for (const n of [0, 4]) {
          for (const [name, speed, fov] of [['walk', 1, null], ['sprint', 6.8, 60]]) {
            if (spent() > BUDGET_S - 120) break;
            R.walk[`msaa${n}-${name}`] = await page.evaluate(async (n, speed, fov, bearing) => {
              const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine;
              await M.setMsaa(E, n);
              return M.walk(E, C, { speed, fov, frames: 60, bearing });
            }, n, speed, fov, f.bearing);
            log(`${id} ${name} msaa${n}: mean |d2Y| ${R.walk[`msaa${n}-${name}`].meanAbsD2}, events ${R.walk[`msaa${n}-${name}`].eventsPerMille} per mille`);
          }
        }
        if (has('--clip') && spent() < BUDGET_S - 150) {
          const ev = (n) => (R.walk[`msaa${n}-walk`]?.eventsPerMille ?? 1e9) + (R.walk[`msaa${n}-sprint`]?.eventsPerMille ?? 1e9);
          const n = flag('--clip-msaa') != null ? Number(flag('--clip-msaa')) : ev(4) <= ev(0) ? 4 : 0;
          R.clip = { msaa: n };
          const a = await page.evaluate(async (n, bearing) => {
            const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine;
            await M.setMsaa(E, n);
            const w = await M.walk(E, C, { speed: 1, frames: 300, bearing, save: true, onFrame: (k, url) => window.__meadowFrame(k, url) });
            const s = await M.walk(E, C, { speed: 6.8, fov: 60, frames: 300, bearing, save: true, onFrame: (k, url) => window.__meadowFrame(300 + k, url), t0: 105 });
            await M.setMsaa(E, 0);
            return { walk: w, sprint: s };
          }, n, f.bearing);
          R.clip.walk = a.walk; R.clip.sprint = a.sprint;
          try {
            execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', path.join(clipDir, 'f%04d.jpg'), '-vf', 'scale=1600:900', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(OUT, `${id}-clip-msaa${n}.mp4`)]);
            R.clip.file = `${id}-clip-msaa${n}.mp4`;
          } catch (e) { R.clip.ffmpegError = String(e.message).slice(0, 200); }
          log(`${id} clip at msaa${n}: walk ${a.walk.eventsPerMille}, sprint ${a.sprint.eventsPerMille} per mille`);
        }
      }
      await msaa(0);
      await page.evaluate(unstageFrame);
    } catch (e) {
      R.error = String(e?.stack || e).slice(0, 800);
      log(`${id} FAILED: ${String(e?.message || e).slice(0, 300)}`);
      try { await page.evaluate(unstageFrame); } catch { /* */ }
    }
  }

  if (has('--topdown') && spent() < BUDGET_S) {
    current = 'topdown';
    const f04 = set.frames.find((x) => x.id === 'F04');
    await page.evaluate(stageFrame, f04, { settleMs: 1500 });
    const sites = await page.evaluate(async () => {
      const S = await import('/src/world/island/sites.js');
      const C = window.__CTX__, GP = C.props?.gatePlaces || {};
      const sp = S.siteById?.('salt-pans');
      const list = [];
      if (sp) list.push({ id: 'salt-crust', x: sp.x, z: sp.z });
      list.push({ id: 'black-sand', x: -200, z: 420 });   // F03's flats at the Shelf's foot (openGround is meadow now)
      list.push({ id: 'basalt-shelf', x: GP.rockShelf?.x ?? -170, z: GP.rockShelf?.z ?? 352 });
      list.push({ id: 'meadow-ground', x: -246, z: 257 });
      return list;
    });
    run.topdown = [];
    for (const s of sites) {
      const r = await page.evaluate(async (s) => {
        const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine;
        const t = await M.topDown(E, C, s.x, s.z, { span: 40, px: 1024 });
        let bin = ''; const b = t.rgba; for (let i = 0; i < b.length; i += 32768) bin += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
        return { ...s, px: t.px, span: t.span, b64: btoa(bin) };
      }, s);
      const img = await savePng(path.join(OUT, `topdown-${s.id}.png`), r.b64, r.px, r.px);
      const ac = autocorr(img, r.px, r.px / r.span, { hpM: 2, minM: 1, maxM: 20 });
      run.topdown.push({ id: s.id, x: s.x, z: s.z, span: r.span, px: r.px, ...ac });
      log(`topdown ${s.id}: autocorrelation peak ${ac.peak} at ${JSON.stringify(ac.atM)} m`);
    }
    await page.evaluate(unstageFrame);
  }
} finally {
  run.endedAt = utc();
  run.chromeSeconds = Math.round(spent());
  writeFileSync(path.join(OUT, 'meadow.json'), JSON.stringify(run, null, 1));
  await teardown();
  log(`wrote ${path.join(OUT, 'meadow.json')} (${run.console.length} console errors, ${run.chromeSeconds} s)`);
}
