/**
 * M1a ROUND 2, WORLD — one Chrome session for the world lane's numbers (the machine guard and slot 1 taken here, Vite on
 * --port bound to 127.0.0.1 under nice -n 10, the game booted once at the bar's size, 1600 x 900, DPR 1.25):
 *
 *   F02   the census (draws and triangles by pass), the ground's sampler units, GPU+submit ms as shipped and with the
 *         look off (M0.8's back-to-back readback, tools/perf/attrib-page.mjs); paired A/B of the world's switches WITH
 *         THE LOOK OFF (the M1.1a bar's state): the ground shader term by term, each static kind's draw and casting,
 *         the flora kinds, the meadow and its rings (--ab <ids> picks them); grass triangles; soil-coloured pixels
 *         (meadow-page.soil) per gap variant; the blue share of the ground per shade-fill variant (world-r2-page);
 *         the walk and the sprint (meadow-page.walk) per crawl-stabiliser variant at 0 samples and the reference at 4
 *   F03   soil-coloured pixels
 *   F04   still (the salt crust's L* is read from it in Node)
 *   F05   still; the blue share
 *   --topdown   40 m top-down captures at the four M1.1e sites and their autocorrelation (tools/perf/autocorr.mjs)
 *
 *   node tools/perf/world-r2.mjs --port 5271 --out <dir outside the repo> [--ab ids|all|none] [--stab "x,y,z,w;..."]
 *        [--shade "0,1"] [--gap "0,1"] [--set k=v,...] [--frames F02,F03,F04,F05] [--topdown] [--budget 600]
 *
 *   --set applies runtime settings before anything is measured (terrain.groundUniforms.uGroundR2.x/.y as shade/gap,
 *   meadow stab as "stab=x/y/z/w", meadow early-out as "early=1"): the shipped defaults when absent.
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
const log = (...a) => console.log(`[world-r2 ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const OUT = flag('--out');
if (!OUT) { console.error('world-r2: --out <dir> is required (outside the repo)'); process.exit(2); }
assertOutsideRepo(OUT, REPO);
const FRAMES = flag('--frames', 'F02,F03,F04,F05').split(',').map((s) => s.trim()).filter(Boolean);
const BUDGET_S = Number(flag('--budget', 600));
const AB = flag('--ab', 'none');
const STAB = (flag('--stab', '') || '').split(';').filter(Boolean).map((v) => v.split(',').map(Number));
const SHADE = (flag('--shade', '') || '').split(',').filter((v) => v !== '').map(Number);
const GAP = (flag('--gap', '') || '').split(',').filter((v) => v !== '').map(Number);
const SET = Object.fromEntries((flag('--set', '') || '').split(',').filter(Boolean).map((kv) => kv.split('=')));
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
      if (slotHeld) { writeFileSync(path.join(SLOT, 'owner.txt'), `int world ${process.pid} ${utc()}\n`); log(`slot taken (memory ${m.free} % free, level ${m.level})`); return true; }
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

const run = { tool: 'tools/perf/world-r2.mjs', commit: process.env.CLEAN_COMMIT || git('rev-parse', '--short', 'HEAD'),
  dirty: (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean), cleanTree: process.env.CLEAN_TREE || null,
  port: PORT, viewport: { width: 1600, height: 900, dpr: 1.25 }, set: SET, frames: {}, console: [] };
if (await portOpen(PORT)) { console.error(`world-r2: port ${PORT} busy`); process.exit(3); }
if (!(await takeSlot())) { console.error('world-r2: SLOT-NOT-AVAILABLE'); process.exit(4); }
const tStart = Date.now();
const spent = () => (Date.now() - tStart) / 1000;
run.startedAt = utc();
/** A base64 RGBA (bottom-up) as a PNG, top-down. */
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
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
  run.bootSeconds = Math.round(spent());
  await sleep(4000);
  // runtime settings (the defaults as shipped when absent)
  run.applied = await page.evaluate((SET) => {
    const C = window.__CTX__, U = C.terrain.groundUniforms.uGroundR2.value, M = C.vegetation.meadow;
    if (SET.shade != null) U.x = Number(SET.shade);
    if (SET.gap != null) U.y = Number(SET.gap);
    if (SET.stab != null) M.setStab(...SET.stab.split('/').map(Number));
    if (SET.early != null) M.setEarlyOut(SET.early === '1');
    return { uGroundR2: U.toArray(), stab: M._u.uStab.value.toArray(), early: !!M._early };
  }, SET);
  log('applied', JSON.stringify(run.applied));
  const set = loadFrameSet();
  const shot = async (file) => page.screenshot({ path: path.join(OUT, file) });
  const stage = async (id, settleMs = 2600) => { const f = set.frames.find((x) => x.id === id); current = id; return { f, staged: await page.evaluate(stageFrame, f, { settleMs }) }; };

  if (FRAMES.includes('F02')) {
    const R = run.frames.F02 = {};
    const { f } = await stage('F02');
    await shot('F02.png');
    // 1. census, samplers, GPU ms with the look on and off; 2. the A/B with the look off
    const abIds = AB === 'none' ? [] : AB === 'all' ? null : AB.split(',');
    Object.assign(R, await page.evaluate(async (abIds) => {
      const P = await import('/tools/perf/census-page.mjs'); const A = await import('/tools/perf/attrib-page.mjs');
      const C = window.__CTX__, E = C.engine, S = C.scene, T = C.terrain;
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
      for (let i = 0; i < 20; i++) await raf();
      const out = { info: {} };
      try { const gl = E.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); out.info.gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; } catch { /* */ }
      out.census = P.census(E, S);
      out.samplers = P.samplers(E, T.groundMaterial);
      out.terrainStats = T.lodStats();
      out.finishLookOn = await A.finishFrame(E, 60);
      const items = [...(E.lookItems?.values?.() || [])];
      const was = items.map((it) => { try { return it.get(); } catch { return null; } });
      const lookOff = () => { for (const it of items) { try { it.set(false); } catch { /* */ } } E.setLookEnabled(false); };
      const lookOn = () => { items.forEach((it, i) => { try { it.set(was[i] ?? true); } catch { /* */ } }); E.setLookEnabled(true); };
      out.lookItems = items.map((it) => it.id);
      out.look = (await P.toggles(E, [{ id: 'look', on: lookOn, off: lookOff }], { n: 40, pairs: 6 })).look;
      lookOff(); for (let i = 0; i < 10; i++) await raf();
      out.finishLookOff = await A.finishFrame(E, 80);
      out.censusLookOff = P.census(E, S).totals;
      if (!abIds || abIds.length) {
        const sw = [...T.perfSwitches(), ...C.vegetation.perfSwitches()];
        const list = abIds ? abIds.map((id) => sw.find((s) => s.id === id)).filter(Boolean) : sw;
        out.abIds = list.map((s) => s.id);
        out.ab = await P.toggles(E, list, { n: 24, pairs: 5 });
        out.abCensus = {};
        for (const s of list) { s.off(); for (let i = 0; i < 6; i++) await raf(); out.abCensus[s.id] = P.census(E, S).totals; (s.restore || s.on)(); for (let i = 0; i < 4; i++) await raf(); }
        out.finishLookOffAfterAb = await A.finishFrame(E, 60);
      }
      lookOn(); for (let i = 0; i < 6; i++) await raf();
      return out;
    }, abIds));
    log(`F02 look on ${R.finishLookOn.medianMs} ms, look off ${R.finishLookOff.medianMs} ms; main ${JSON.stringify(R.census.totals.main)}, all ${JSON.stringify(R.census.all)}, samplers ${R.samplers.units}`);
    if (R.ab) for (const [k, v] of Object.entries(R.ab)) log(`  ab ${k}: ${v.onMinusOffMs} ms (iqr ${v.iqr})`);
    // 3. grass and soil per gap variant
    R.grass = await page.evaluate(async () => { const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__; return M.grassCount(C.engine, C.scene, C); });
    log(`F02 grass submitted ${R.grass.submittedTris}, drawn (mirror) ${R.grass.mirror.drawnTris}`);
    R.soil = {};
    for (const g of (GAP.length ? GAP : [null])) {
      const r = await page.evaluate(async (g) => {
        const b64 = (b) => { let t = ''; for (let i = 0; i < b.length; i += 32768) t += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(t); };
        const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, U = C.terrain.groundUniforms.uGroundR2.value;
        const y0 = U.y; if (g != null) U.y = g;
        try { const s = await M.soil(C.engine, C, { mask: true }); const m = s.mask; delete s.mask; return { ...s, gap: U.y, maskB64: b64(m) }; } finally { U.y = y0; }
      }, g);
      const key = `gap${r.gap}`;
      await savePng(path.join(OUT, `F02-soil-${key}.png`), r.maskB64, r.w, r.h); delete r.maskB64;
      R.soil[key] = r;
      log(`F02 soil (${key}): ${r.soilPct} % (gap ${r.gapPct} %, wide class ${r.soilPctWideClass} %)`);
    }
    // 4. the blue share of the ground per shade-fill variant
    R.blue = {};
    for (const x of (SHADE.length ? SHADE : [null])) {
      const r = await page.evaluate(async (x) => {
        const b64 = (b) => { let t = ''; for (let i = 0; i < b.length; i += 32768) t += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(t); };
        const W = await import('/tools/perf/world-r2-page.mjs'); const C = window.__CTX__, U = C.terrain.groundUniforms.uGroundR2.value;
        const x0 = U.x; if (x != null) U.x = x;
        try { const s = await W.groundHue(C.engine, C, { mask: true }); const m = s.mask; delete s.mask; return { ...s, shade: U.x, maskB64: b64(m) }; } finally { U.x = x0; }
      }, x);
      const key = `shade${r.shade}`;
      await savePng(path.join(OUT, `F02-blue-${key}.png`), r.maskB64, r.w, r.h); delete r.maskB64;
      R.blue[key] = r;
      if (x != null) { await page.evaluate((x) => { window.__CTX__.terrain.groundUniforms.uGroundR2.value.x = x; }, x); await sleep(300); await shot(`F02-${key}.png`);
        await page.evaluate((x0) => { window.__CTX__.terrain.groundUniforms.uGroundR2.value.x = x0; }, run.applied.uGroundR2[0]); }
      log(`F02 blue (${key}): ${r.bluePct} % of ${r.groundPx} ground px; dark mean hue ${r.darkMeanHue}`);
    }
    // 5. the walk and the sprint per stabiliser variant at 0 samples, and the 4-sample reference
    R.walk = {};
    const variants = STAB.length ? STAB.map((v) => ({ n: 0, v })) : [{ n: 0, v: null }];
    variants.push({ n: 4, v: run.applied.stab, ref: true });
    for (const { n, v, ref } of variants) {
      if (spent() > BUDGET_S - 150) { log('walks: budget'); break; }
      for (const [name, speed, fov] of [['walk', 1, null], ['sprint', 6.8, 60]]) {
        const key = `msaa${n}-${ref ? 'ref' : v ? v.join('/') : 'shipped'}-${name}`;
        R.walk[key] = await page.evaluate(async (n, v, speed, fov, bearing) => {
          const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine, MD = C.vegetation.meadow;
          const s0 = MD._u.uStab.value.toArray();
          if (v) MD.setStab(...v);
          try { await M.setMsaa(E, n); const r = M.walk(E, C, { speed, fov, frames: 60, bearing }); return await r; } finally { MD.setStab(...s0); await M.setMsaa(E, 0); }
        }, n, v, speed, fov, f.bearing);
        const w = R.walk[key];
        log(`F02 ${key}: all ${w.eventsPerMille}, mid 12-30 m ${w.bands['mid12-30m'].eventsPerMille}, near ${w.bands['near<12m'].eventsPerMille}, far ${w.bands['far>30m'].eventsPerMille} per mille`);
      }
    }
    await page.evaluate(unstageFrame);
  }

  if (FRAMES.includes('F03') && spent() < BUDGET_S) {
    const R = run.frames.F03 = {};
    await stage('F03');
    await shot('F03.png');
    R.soil = await page.evaluate(async () => { const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__; const s = await M.soil(C.engine, C); delete s.mask; return s; });
    R.grass = await page.evaluate(async () => { const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__; return M.grassCount(C.engine, C.scene, C); });
    log(`F03 soil ${R.soil.soilPct} %, grass submitted ${R.grass.submittedTris}`);
    await page.evaluate(unstageFrame);
  }
  for (const id of ['F04', 'F05']) {
    if (!FRAMES.includes(id) || spent() > BUDGET_S) continue;
    const R = run.frames[id] = {};
    await stage(id);
    await shot(`${id}.png`);
    if (id === 'F05') {
      R.blue = {};
      for (const x of (SHADE.length ? SHADE : [null])) {
        R.blue[`shade${x}`] = await page.evaluate(async (x) => {
          const W = await import('/tools/perf/world-r2-page.mjs'); const C = window.__CTX__, U = C.terrain.groundUniforms.uGroundR2.value;
          const x0 = U.x; if (x != null) U.x = x;
          try { const s = await W.groundHue(C.engine, C); delete s.mask; return s; } finally { U.x = x0; }
        }, x);
        log(`F05 blue (shade ${x}): ${R.blue[`shade${x}`].bluePct} %, dark mean hue ${R.blue[`shade${x}`].darkMeanHue}`);
      }
    }
    await page.evaluate(unstageFrame);
    log(`${id} filmed`);
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
      list.push({ id: 'black-sand', x: -200, z: 420 });
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
} catch (e) {
  run.error = String(e?.stack || e).slice(0, 1200);
  log('FAILED', run.error);
} finally {
  run.endedAt = utc();
  run.chromeSeconds = Math.round(spent());
  writeFileSync(path.join(OUT, 'world-r2.json'), JSON.stringify(run, null, 1));
  await teardown();
  log(`wrote ${path.join(OUT, 'world-r2.json')} (${run.console.length} console errors, ${run.chromeSeconds} s)`);
}
