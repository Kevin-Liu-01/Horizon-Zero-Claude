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
 *   M1a debt: --stab takes a fourth group per variant, the meadow's soft edge (uSoft "weight,px,near,far"); --crust
 *   "gain,cool;..." films F04 per salt-crust variant (terrain.js CRUST) and reads each still in Node (film.mjs's mean
 *   luminance, the crust boxes' Lab); --organ takes a third value (the Organ's albedo gain) and every F05 variant reads
 *   the two Organ clusters' Lab; --aerial takes a sixth value (AERIAL_B.y, the fade on falling rays) and, with --f32,
 *   films F32 per variant; --seams also reports the LOD's own cracks (shipped, not in the one-level render); the glass
 *   swatch at 100 m reads the Glass's own pixels; --clip10 records the real 10 s walk and sprint as MP4s.
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
/* --stab "x,y,z,w[/a,b,c,d[/r,g,b,w]];..." : uStab, (round 3) uStab2 and (round 3 fix) uStand per variant; with a stand
 * tone the variant also films F02 (F02-stand-<r_g_b_w>.png) */
const STAB = (flag('--stab', '') || '').split(';').filter(Boolean).map((v) => v.split('/').map((q) => q.split(',').map(Number)));
/* M1a round 3: --aerial "amount,start,scale[,cap[,dome]];..." (island/aerial.js; dome = AERIAL_B.x, round 3 fix) and --organ "bounce,rim;..." (sites/basalt.js) variants
 * on F05 (layers and a still each); --ring (the Ring's panels at 150 m, the fallen quadrant); --walls (field walls from
 * 120 m over T1, the far bake) */
const AER = (flag('--aerial', '') || '').split(';').filter(Boolean).map((v) => v.split(',').map(Number));
const ORG = (flag('--organ', '') || '').split(';').filter(Boolean).map((v) => v.split(',').map(Number));
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
/* M1a debt: a still's numbers in Node. meanLuminance is tools/frames/film.mjs's (the sRGB channel means, linearised, in %);
 * each box [x0, y0, x1, y1] (fractions of the image) is read as the mean in LINEAR sRGB, then CIELAB D65 (m11-accept's rule) */
async function stillStats(file, boxes = {}) {
  const { data, info } = await sharp(path.join(OUT, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, lin = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
  let sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < data.length; i += 3) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; }
  const n = data.length / 3;
  const out = { meanLuminance: Math.round((0.2126 * lin(sr / n) + 0.7152 * lin(sg / n) + 0.0722 * lin(sb / n)) * 1000) / 10, boxes: {} };
  const fz = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (const [k, b] of Object.entries(boxes)) {
    let r = 0, g = 0, bl = 0, m = 0;
    for (let y = Math.round(b[1] * H); y < Math.round(b[3] * H); y++) for (let x = Math.round(b[0] * W); x < Math.round(b[2] * W); x++) {
      const o = (y * W + x) * 3; r += lin(data[o]); g += lin(data[o + 1]); bl += lin(data[o + 2]); m++;
    }
    r /= m; g /= m; bl /= m;
    const X = 0.4124 * r + 0.3576 * g + 0.1805 * bl, Y = 0.2126 * r + 0.7152 * g + 0.0722 * bl, Z = 0.0193 * r + 0.1192 * g + 0.9505 * bl;
    const fx = fz(X / 0.95047), fy = fz(Y), fzz = fz(Z / 1.08883);
    out.boxes[k] = [+(116 * fy - 16).toFixed(1), +(500 * (fx - fy)).toFixed(1), +(200 * (fy - fzz)).toFixed(1)];
  }
  return out;
}
/* M1a debt: the boxes those stills are read in. F04: m11-accept's c, d, e (the crust); F05: the two Organ clusters as F05
 * frames them (fractions of the frame, read off the exit run's still at fb6d5f0) */
const F04_BOXES = { c: [0.35, 0.35, 0.65, 0.60], d: [0.05, 0.65, 0.30, 0.95], e: [0.70, 0.65, 0.95, 0.95] };
const F05_BOXES = { organRight: [0.6625, 0.378, 0.8125, 0.733], organLeft: [0.15, 0.6, 0.275, 0.756] };
/* M1a debt: --crust "gain,cool;..." (terrain.js CRUST) variants on F04, each a still read in Node */
const CRU = (flag('--crust', '') || '').split(';').filter(Boolean).map((v) => v.split(',').map(Number));
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
  let bootFail = null;
  page.on('pageerror', (e) => { run.console.push({ at: current, text: 'pageerror: ' + String(e).slice(0, 400) }); if (current === 'boot') bootFail = e; });
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  // a boot that throws never reaches __READY__: stop at the first error instead of holding the slot for 5 minutes
  for (let t = 0; t < 600 && !bootFail; t++) { if (await page.evaluate(() => window.__READY__ === true)) break; await sleep(500); }
  if (bootFail) throw new Error(`boot failed: ${String(bootFail).slice(0, 300)}`);
  if (run.console.length) throw new Error(`boot console errors: ${run.console.map((c) => c.text).join(' | ').slice(0, 600)}`);
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
        // M1a round 3 fix: the Organ's light terms compiled out (sites/basalt.js CAL_O_NOLIGHT)
        const om = C.props?.organ?.mesh?.material;
        if (om) { const def = (on) => { const d = { ...(om.defines || {}) }; if (on) delete d.CAL_O_NOLIGHT; else d.CAL_O_NOLIGHT = 1; om.defines = d; om.needsUpdate = true; };
          sw.push({ id: 'organ-light', on: () => def(true), off: () => def(false) }); }
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
    /* (M1a debt) a fourth group per variant is the soft edge, uSoft "weight,px,near,far" (meadow.js MEADOW_COLOR) */
    const variants = STAB.length ? STAB.map((v) => ({ n: 0, v: v[0], v2: v[1] || null, v3: v[2] || null, v4: v[3] || null })) : [{ n: 0, v: null }];
    variants.push({ n: 4, v: run.applied.stab, ref: true });
    for (const { n, v, v2, v3, v4, ref } of variants) {
      if ((v3 || v4) && !ref) {
        await page.evaluate((v3, v4) => { const MD = window.__CTX__.vegetation.meadow; window.__stand0 = MD._u.uStand.value.toArray(); window.__soft0 = MD._u.uSoft.value.toArray();
          if (v3) MD.setStand(...v3); if (v4) MD.setSoft(...v4); }, v3, v4);
        await sleep(400); await shot(`F02-stand-${(v3 || ['-']).join('_')}${v4 ? '-soft-' + v4.join('_') : ''}.png`);
        await page.evaluate(() => { const MD = window.__CTX__.vegetation.meadow; MD.setStand(...window.__stand0); MD.setSoft(...window.__soft0); });
      }
      if (spent() > BUDGET_S - 150) { log('walks: budget'); break; }
      for (const [name, speed, fov] of [['walk', 1, null], ['sprint', 6.8, 60]]) {
        const key = `msaa${n}-${ref ? 'ref' : v ? v.join('/') + (v2 ? '+' + v2.join('/') : '') + (v3 ? '+' + v3.join('/') : '') + (v4 ? '+soft' + v4.join('/') : '') : 'shipped'}-${name}`;
        R.walk[key] = await page.evaluate(async (n, v, v2, v3, v4, speed, fov, bearing) => {
          const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine, MD = C.vegetation.meadow;
          const s0 = MD._u.uStab.value.toArray(), s20 = MD._u.uStab2 ? MD._u.uStab2.value.toArray() : null;
          if (v) MD.setStab(...v);
          if (v2 && MD.setStab2) MD.setStab2(...v2);
          const st0 = MD._u.uStand ? MD._u.uStand.value.toArray() : null;
          if (v3 && MD.setStand) MD.setStand(...v3);
          const so0 = MD._u.uSoft ? MD._u.uSoft.value.toArray() : null;
          if (v4 && MD.setSoft) MD.setSoft(...v4);
          try { await M.setMsaa(E, n); const r = M.walk(E, C, { speed, fov, frames: 60, bearing }); return await r; } finally { MD.setStab(...s0); if (s20) MD.setStab2(...s20); if (st0) MD.setStand(...st0); if (so0) MD.setSoft(...so0); await M.setMsaa(E, 0); }
        }, n, v, v2, v3, v4, speed, fov, f.bearing);
        const w = R.walk[key];
        log(`F02 ${key}: all ${w.eventsPerMille}, mid 12-30 m ${w.bands['mid12-30m'].eventsPerMille}, near ${w.bands['near<12m'].eventsPerMille}, far ${w.bands['far>30m'].eventsPerMille} per mille`);
      }
    }
    // 6. M1a fix round (FIX LIST 3): the clip itself at the shipped stabiliser, every 4th frame of the walk and the sprint saved
    if (has('--clip')) {
      for (const [name, speed, fov] of [['walk', 1, null], ['sprint', 6.8, 60]]) {
        const r = await page.evaluate(async (speed, fov, bearing) => {
          const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine;
          const shots = [];
          const m = await M.walk(E, C, { speed, fov, frames: 60, bearing, save: true, onFrame: (k, u) => { if (k % 4 === 0) shots.push(u); } });
          return { m, shots, stab: C.vegetation.meadow._u.uStab.value.toArray().concat(C.vegetation.meadow._u.uStab2 ? C.vegetation.meadow._u.uStab2.value.toArray() : []) };
        }, speed, fov, f.bearing);
        R.clip = R.clip || {};
        R.clip[name] = { ...r.m, stab: r.stab, frames: r.shots.length };
        for (let i = 0; i < r.shots.length; i++) writeFileSync(path.join(OUT, `clip-${name}-${String(i * 4).padStart(2, '0')}.jpg`), Buffer.from(r.shots[i].split(',')[1], 'base64'));
        log(`F02 clip ${name} (stab ${r.stab}): ${r.m.eventsPerMille} per mille, mid ${r.m.bands['mid12-30m'].eventsPerMille}, ${r.shots.length} frames saved`);
      }
    }
    /* M1a round 3 fix (the judge's FIX LIST 2: the clip was a 1 s isolated render, black sky, Brea and the Ring hidden):
     * the real F02 clip, 10 s of the game itself from F02's staging, Brea walking (forward + the walk key) and then
     * sprinting (forward + sprint), the chase camera and the whole scene as shipped; a frame every 0.5 s saved, her speed
     * logged. Graded by eye; the crawl number stays the deterministic measure above */
    /* (M1a debt: at a000205 the clip's speeds read 0 for all 20 stills: the staged frame freezes the game, time scale
     * 'studio' 0, and the keys were pressed into the frozen frame) staged at F02 for the place, hour and lens, then
     * UNSTAGED, which gives the game back its clock and its chase camera with Brea where F02 put her; the whole 10 s
     * recorded by the compositor's own screencast (every presented frame, with its timestamp) and written as an MP4 at
     * those timestamps (ffmpeg), a still every second kept beside it */
    if (has('--clip10')) {
      R.clip10 = {};
      const cdp = await page.createCDPSession();
      for (const [name, keys] of [['walk', ['KeyW', 'AltLeft']], ['sprint', ['KeyW', 'ShiftLeft']]]) {
        await page.evaluate(unstageFrame);
        await stage('F02', 1500);
        await page.evaluate(unstageFrame);
        await page.evaluate((h) => { const C = window.__CTX__; C.environment.setTime(h); }, f.hour);
        current = `clip10-${name}`;
        const dir = path.join(OUT, `clip10-${name}`);
        mkdirSync(dir, { recursive: true });
        const shots = [];
        const onFrame = async (ev) => { shots.push({ t: ev.metadata.timestamp, data: ev.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch { /* */ } };
        cdp.on('Page.screencastFrame', onFrame);
        await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1 });
        await page.evaluate((keys) => { const I = window.__CTX__.input; for (const k of keys) I.keys.add(k); }, keys);
        const speeds = [], pos = [];
        const t0 = Date.now();
        while (Date.now() - t0 < 10000) {
          await sleep(500);
          const r = await page.evaluate(() => { const p = window.__CTX__.player; return [+Math.hypot(p.velocity.x, p.velocity.z).toFixed(2), +p.position.x.toFixed(2), +p.position.z.toFixed(2)]; });
          speeds.push(r[0]); pos.push([r[1], r[2]]);
        }
        await page.evaluate((keys) => { const I = window.__CTX__.input; for (const k of keys) I.keys.delete(k); }, keys);
        await cdp.send('Page.stopScreencast');
        cdp.off('Page.screencastFrame', onFrame);
        // the MP4 at the frames' own timestamps (ffconcat durations), and one still a second
        const list = [];
        for (let i = 0; i < shots.length; i++) {
          const file = `f${String(i).padStart(4, '0')}.jpg`;
          writeFileSync(path.join(dir, file), Buffer.from(shots[i].data, 'base64'));
          const dur = i + 1 < shots.length ? Math.max(0.001, shots[i + 1].t - shots[i].t) : 1 / 60;
          list.push(`file '${file}'`, `duration ${dur.toFixed(4)}`);
        }
        writeFileSync(path.join(dir, 'frames.ffconcat'), 'ffconcat version 1.0\n' + list.join('\n') + '\n');
        let mp4 = null;
        try {
          execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'frames.ffconcat'), '-fps_mode', 'vfr', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '18', path.join(OUT, `clip10-${name}.mp4`)]);
          mp4 = `clip10-${name}.mp4`;
        } catch (e) { log(`clip10 ${name}: ffmpeg failed ${String(e).slice(0, 200)}`); }
        const span = shots.length > 1 ? shots[shots.length - 1].t - shots[0].t : 0;
        for (let s = 0; s <= 10; s++) {
          const k = shots.findIndex((q) => q.t - shots[0].t >= s);
          if (k >= 0) writeFileSync(path.join(OUT, `clip10-${name}-${String(s).padStart(2, '0')}s.jpg`), Buffer.from(shots[k].data, 'base64'));
        }
        const dist = pos.length > 1 ? Math.hypot(pos[pos.length - 1][0] - pos[0][0], pos[pos.length - 1][1] - pos[0][1]) : 0;
        R.clip10[name] = { seconds: +((Date.now() - t0) / 1000).toFixed(1), screencastFrames: shots.length, screencastSpanS: +span.toFixed(2),
          fps: span ? +(shots.length / span).toFixed(1) : 0, mp4, speeds, metres: +dist.toFixed(1) };
        log(`F02 clip10 ${name}: ${R.clip10[name].seconds} s, ${shots.length} frames over ${R.clip10[name].screencastSpanS} s (${R.clip10[name].fps} fps), ${R.clip10[name].metres} m, speeds ${speeds.join(' ')}`);
      }
      await cdp.detach();
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
  for (const id of ['F04', 'F05', 'F20', 'F24', 'F25', 'F31']) {
    if (!FRAMES.includes(id) || spent() > BUDGET_S) continue;
    const R = run.frames[id] = {};
    await stage(id);
    await shot(`${id}.png`);
    if (id === 'F04' || id === 'F05') { R.still = await stillStats(`${id}.png`, id === 'F04' ? F04_BOXES : F05_BOXES); log(`${id} still: ${JSON.stringify(R.still)}`); }
    if (id === 'F04' && CRU.length) {
      R.crust = {};
      const c0 = await page.evaluate(async () => (await import('/src/world/terrain.js')).CRUST.value.toArray());
      for (const c of CRU) {
        await page.evaluate(async (c) => { (await import('/src/world/terrain.js')).CRUST.value.set(c[0], c[1], 0, 0); }, c);
        await sleep(400);
        const file = `F04-crust-${c.join('_')}.png`;
        await shot(file);
        R.crust[c.join('/')] = await stillStats(file, F04_BOXES);
        log(`F04 crust ${c.join('/')}: ${JSON.stringify(R.crust[c.join('/')])}`);
      }
      await page.evaluate(async (c0) => { (await import('/src/world/terrain.js')).CRUST.value.set(...c0); }, c0);
    }
    if (id !== 'F04') {
      R.blue = {};
      for (const x of (SHADE.length ? SHADE : [null])) {
        R.blue[`shade${x}`] = await page.evaluate(async (x) => {
          const W = await import('/tools/perf/world-r2-page.mjs'); const C = window.__CTX__, U = C.terrain.groundUniforms.uGroundR2.value;
          const x0 = U.x; if (x != null) U.x = x;
          try { const s = await W.groundHue(C.engine, C); delete s.mask; return s; } finally { U.x = x0; }
        }, x);
        log(`${id} blue (shade ${x}): ${R.blue[`shade${x}`].bluePct} %, dark mean hue ${R.blue[`shade${x}`].darkMeanHue}`);
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
      const R = await import('/src/world/island/recipe.js');
      const C = window.__CTX__, GP = C.props?.gatePlaces || {};
      const sp = S.siteById?.('salt-pans');
      const list = [];
      if (sp) list.push({ id: 'salt-crust', x: sp.x, z: sp.z });
      list.push({ id: 'black-sand', x: -200, z: 420 });
      list.push({ id: 'basalt-shelf', x: GP.rockShelf?.x ?? -170, z: GP.rockShelf?.z ?? 352 });
      list.push({ id: 'meadow-ground', x: -246, z: 257 });
      /* M1a fix round (the judge's FIX LIST 4 and 5): the two failing squares straddled the field's walls and the meadow's edge,
       * whose straight lines correlate along their own length. Re-sited: the crust in situ centred on the F14-F19 white cell
       * (24 x 11 m, so the square still crosses its dykes), the crust as a material (CAL_CAPTURE_LAYER 1: a dry white cell's
       * crust over the whole square), and the meadow ground at the first square found wholly inside the meadow (density
       * >= 0.9 at every 4 m sample over 44 m, no pan cell) */
      list.push({ id: 'salt-cell', x: -316.9, z: 264.9 });
      list.push({ id: 'salt-layer', x: -316.9, z: 264.9, layer: 1 });
      const MD = C.vegetation.meadow;
      let found = null;
      const near = [[-168, 178], [-168, 208], [-200, 190], [-228, 338], [-246, 300], [-150, 160], [-190, 230], [-260, 230]];
      for (const [cx0, cz0] of near) {
        for (let r = 0; r <= 40 && !found; r += 8) for (let a = 0; a < 8 && !found; a++) {
          const cx = cx0 + r * Math.cos(a * Math.PI / 4), cz = cz0 + r * Math.sin(a * Math.PI / 4);
          let ok = true;
          for (let j = -22; j <= 22 && ok; j += 4) for (let i = -22; i <= 22 && ok; i += 4) {
            if (!(MD.densityAt(cx + i, cz + j) >= 0.9)) ok = false;
          }
          if (ok) found = { x: Math.round(cx), z: Math.round(cz) };
        }
        if (found) break;
      }
      if (found) list.push({ id: 'meadow-interior', ...found });
      // the materials alone (CAL_CAPTURE_LAYER): the black sand and the basalt as layers, at the black-sand site
      list.push({ id: 'sand-layer', x: -200, z: 420, layer: 0 });
      list.push({ id: 'basalt-layer', x: -200, z: 420, layer: 2 });
      /* M1a round 3 (the review's re-read "inside one pan cell, no dyke"): in situ, an 8 m square wholly inside the white
       * cell at the salt-pans site (field u -5, v 8.4: 2.3-14.6 m clear of its dykes; the square's diagonal spans 11.2 m) */
      const o = {}; R.fieldToWorld(-5, 8.4, o);
      list.push({ id: 'salt-incell', x: +o.x.toFixed(2), z: +o.z.toFixed(2), span: 8 });
      return list;
    });
    run.topdown = [];
    for (const s of sites) {
      const r = await page.evaluate(async (s) => {
        const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine;
        const t = await M.topDown(E, C, s.x, s.z, { span: s.span ?? 40, px: 1024, layer: s.layer ?? null });
        let bin = ''; const b = t.rgba; for (let i = 0; i < b.length; i += 32768) bin += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
        return { ...s, px: t.px, span: t.span, b64: btoa(bin) };
      }, s);
      const img = await savePng(path.join(OUT, `topdown-${s.id}.png`), r.b64, r.px, r.px);
      const ac = autocorr(img, r.px, r.px / r.span, { hpM: 2, minM: 1, maxM: Math.min(20, r.span / 2) });
      run.topdown.push({ id: s.id, x: s.x, z: s.z, span: r.span, px: r.px, ...ac });
      log(`topdown ${s.id}: autocorrelation peak ${ac.peak} at ${JSON.stringify(ac.atM)} m`);
    }
    /* M1a round 3 fix (FIX LIST 6, 11): which term carries the salt squares' peak: each re-read with the crust's detail
     * (cracks, rake, pits: CAL_P_NOCRUST) and with the grain (CAL_P_NOGRAIN) compiled out */
    if (has('--topdown-ab')) {
      for (const s of sites.filter((q) => /^salt-(incell|cell|crust)$/.test(q.id))) {
        for (const k of ['CAL_P_NOCRUST', 'CAL_P_NOGRAIN']) {
          const r = await page.evaluate(async (s, k) => {
            const M = await import('/tools/perf/meadow-page.mjs'); const C = window.__CTX__, E = C.engine, mat = C.terrain.groundMaterial;
            const d0 = mat.defines; mat.defines = { ...(d0 || {}), [k]: 1 }; mat.needsUpdate = true;
            try {
              const t = await M.topDown(E, C, s.x, s.z, { span: s.span ?? 40, px: 1024, layer: s.layer ?? null });
              let bin = ''; const b = t.rgba; for (let i = 0; i < b.length; i += 32768) bin += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
              return { px: t.px, span: t.span, b64: btoa(bin) };
            } finally { mat.defines = d0; mat.needsUpdate = true; }
          }, s, k);
          const img = await savePng(path.join(OUT, `topdown-${s.id}-${k}.png`), r.b64, r.px, r.px);
          const ac = autocorr(img, r.px, r.px / r.span, { hpM: 2, minM: 1, maxM: Math.min(20, r.span / 2) });
          run.topdown.push({ id: `${s.id}-${k}`, x: s.x, z: s.z, span: r.span, px: r.px, ...ac });
          log(`topdown ${s.id} (${k}): autocorrelation peak ${ac.peak} at ${JSON.stringify(ac.atM)} m`);
        }
      }
    }
    await page.evaluate(unstageFrame);
  }
  /* M1a fix round: F05's silhouette layers (tools/perf/rock-page.mjs layers, the frozen rule), the Organ's foot (FIX LIST 8) */
  if (has('--layers') && spent() < BUDGET_S) {
    await stage('F05');
    const L = await page.evaluate(async () => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; const r = await M.layers(C.engine, C); delete r.map; return r; });
    run.F05layers = L;
    log(`F05 layers ${L.layers}, rims ${L.classes.map((c) => c.rimL).join(' / ')}, gaps ${L.gaps.map((g) => g.dL).join(' / ')}, pass ${L.pass}`);
    /* M1a round 3 fix (FIX LIST 9: strata at 200 m and the Ring's line of sight were UNMEASURED): tools/perf/rock-page.mjs's
     * probes, as tools/perf/rock.mjs runs them, in F05's light */
    if (has('--rock')) {
      const ids = await page.evaluate(() => window.__CTX__.props.landmarkSet.stacks.filter((s) => /^stack-/.test(s.id)).map((s) => s.id));
      run.strataF05 = [];
      for (const id of ids) {
        const r = await page.evaluate(async (id) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; const rec = C.props.landmarkSet.stacks.find((s) => s.id === id); return M.strata(C.engine, C, rec); }, id);
        if (r.crop) { await sharp(Buffer.from(r.crop.b64, 'base64'), { raw: { width: r.crop.w, height: r.crop.h, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(OUT, `strata-F05-${id}.jpg`)); delete r.crop; }
        run.strataF05.push(r);
      }
      log(`strata F05: ${run.strataF05.map((r) => `${r.id} ${r.bands}`).join(', ')}`);
      run.sight = await page.evaluate(async () => {
        const M = await import('/tools/perf/rock-page.mjs'); const S = await import('/src/world/island/sites.js');
        const C = window.__CTX__, E = C.engine, T = C.terrain;
        const t1 = S.TRIG[0], beach = S.siteById('black-sand-beach'), salt = S.siteById('saltrow');
        const ring = C.props.landmarkSet.ring; const dx = ring.x - salt.x, dz = ring.z - salt.z, dl = Math.hypot(dx, dz);
        let ramp = null; for (let s = 0; s < dl; s += 1) { const x = salt.x + dx / dl * s, z = salt.z + dz / dl * s; if (T.getHeight(x, z) < 1.2) { ramp = { x, z }; break; } }
        const top = (S.TRIG_TOP ?? 4) + 1.7;
        return [M.sight(E, C, { x: t1.x, z: t1.z, eye: top }, 'T1 (on the pillar)'), M.sight(E, C, { x: t1.x + 3, z: t1.z + 3 }, 'T1 (at its foot)'),
          ramp ? M.sight(E, C, ramp, `Saltrow ramp stand-in (${ramp.x.toFixed(0)}, ${ramp.z.toFixed(0)})`) : { station: 'Saltrow ramp', error: 'no shore found' },
          beach ? M.sight(E, C, beach, 'black-sand beach (site)') : { station: 'black-sand beach', error: 'no site' }, M.sight(E, C, { x: -200, z: 414 }, 'beach (look.pansInland)')];
      });
      log(`sight: ${run.sight.map((s) => `${s.station} ${s.open}/${s.of}${s.error ? ' ' + s.error : ''}`).join('; ')}`);
    }
    await page.evaluate(unstageFrame);
    const looks = await page.evaluate(() => {
      const C = window.__CTX__, T = C.terrain, O = C.props.organ;
      const tall = O.clusterRecs.reduce((a, c) => (c.height > a.height ? c : a));
      const g = (x, z) => T.getHeight(x, z);
      return [
        { name: 'organ-foot', pos: [tall.x + 13, g(tall.x + 13, tall.z + 9) + 1.2, tall.z + 9], target: [tall.x, g(tall.x, tall.z) + 1.0, tall.z] },
        { name: 'organ-foot-b', pos: [tall.x - 12, g(tall.x - 12, tall.z + 11) + 1.2, tall.z + 11], target: [tall.x, g(tall.x, tall.z) + 1.0, tall.z] },
      ];
    });
    for (const l of looks) {
      const c = await page.evaluate(async (l) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; return M.look(C.engine, C, l.pos, l.target, 50); }, l);
      await sharp(Buffer.from(c.b64, 'base64'), { raw: { width: c.w, height: c.h, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(OUT, `look-${l.name}.jpg`));
    }
  }

  /* M1a fix round (FIX LIST 7, M1.1e "F04 against the swatches at 1 m and at 100 m"): each material at noon (F04's hour and
   * weather), from 1 m (lens 0.8 m up, 0.6 m back, fov 50) and from 100 m (eye 1.7 m, fov 10, the first of eight bearings
   * whose sight line clears the ground by 0.3 m), Brea hidden. Lab of the middle 40 % is read in Node */
  if (has('--swatches') && spent() < BUDGET_S) {
    const f04 = set.frames.find((x) => x.id === 'F04');
    await page.evaluate(stageFrame, f04, { settleMs: 1500 });
    current = 'swatches';
    const sites = await page.evaluate(async () => {
      const R = await import('/src/world/island/recipe.js');
      const C = window.__CTX__, GP = C.props?.gatePlaces || {};
      const out = [
        { id: 'salt-crust', x: -316.9, z: 264.9 },
        { id: 'black-sand', x: -200, z: 420 },
        { id: 'basalt', x: GP.rockShelf?.x ?? -170, z: GP.rockShelf?.z ?? 352 },
        { id: 'glass', x: R.GLASS.e, z: -R.GLASS.n },
      ];
      /* M1a round 3: the brine pond in F04's frame (recipe.js CELL_KIND, seaward of the salt-pans site's main dyke), 6 m in
       * from its dyke, and its evaporating pink edge 1.5 m in */
      const S = await import('/src/world/island/sites.js');
      const sp = S.siteById('salt-pans');
      if (sp) {
        const b = 200 * Math.PI / 180, fx = Math.sin(b), fz = -Math.cos(b);
        out.push({ id: 'brine-f04', x: sp.x + fx * 12, z: sp.z + fz * 12 });
        out.push({ id: 'brine-edge-f04', x: sp.x + fx * 7, z: sp.z + fz * 7 });
        out.push({ id: 'crust-f04', x: sp.x - fx * 0.5, z: sp.z - fz * 0.5 });
      }
      // a brine cell: the deepest-inside BRINE cell near the field's middle
      let best = null;
      try {
        for (let n = -330; n <= -230; n += 3) for (let e = -380; e <= -250; e += 3) {
          const P = R.panAt(e, n);
          if (P.kind === R.PAN.BRINE && P.edge > 3 && (!best || P.edge > best.edge)) best = { e, n, edge: P.edge };
        }
      } catch (err) { /* */ }
      if (best) out.push({ id: 'brine-cell', x: best.e, z: -best.n });
      return out;
    });
    run.swatches = [];
    for (const s0 of sites) {
      for (const dist of [1, 100]) {
        const v = await page.evaluate((s0, dist) => {
          const C = window.__CTX__, T = C.terrain, gy = (x, z) => T.getHeight(x, z);
          const ty = Math.max(gy(s0.x, s0.z), s0.id === 'glass' ? 0.16 : -1e9);
          if (dist === 1) return { pos: [s0.x - 0.6, ty + 0.8, s0.z + 0.0], target: [s0.x, ty, s0.z], fov: 50 };
          // (round 3) 16 bearings, and a lens up to 6 m over the ground where 1.7 m sees no clear line (dunes, a pump base)
          for (const eye of [1.7, 3, 6, 10, 16]) for (let b = 0; b < 16; b++) {
            const a = b * Math.PI / 8, ex = s0.x + 100 * Math.cos(a), ez = s0.z + 100 * Math.sin(a), ey = gy(ex, ez) + eye;
            let ok = ey > ty && gy(ex, ez) > -0.2;
            for (let k = 1; k < 40 && ok; k++) { const t = k / 40, x = ex + (s0.x - ex) * t, z = ez + (s0.z - ez) * t; if (gy(x, z) > ey + (ty - ey) * t - 0.3 && t < 0.97) ok = false; }
            if (ok) return { pos: [ex, ey, ez], target: [s0.x, ty, s0.z], fov: 10, bearingDeg: b * 22.5, eye };
          }
          return null;
        }, s0, dist);
        if (!v) { run.swatches.push({ id: s0.id, dist, error: 'no clear sight line' }); continue; }
        const c = await page.evaluate(async (v) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; return M.look(C.engine, C, v.pos, v.target, v.fov); }, v);
        const file = `swatch-${s0.id}-${dist}m.jpg`;
        const raw = Buffer.from(c.b64, 'base64');
        await sharp(raw, { raw: { width: c.w, height: c.h, channels: 3 } }).jpeg({ quality: 90 }).toFile(path.join(OUT, file));
        // Lab (D65) of the middle 40 %
        const x0 = Math.round(c.w * 0.3), x1 = Math.round(c.w * 0.7), y0 = Math.round(c.h * 0.3), y1 = Math.round(c.h * 0.7);
        const lin = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
        let X = 0, Y = 0, Z = 0, n = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const o = (y * c.w + x) * 3, r = lin(raw[o]), g = lin(raw[o + 1]), b = lin(raw[o + 2]);
          X += 0.4124 * r + 0.3576 * g + 0.1805 * b; Y += 0.2126 * r + 0.7152 * g + 0.0722 * b; Z += 0.0193 * r + 0.1192 * g + 0.9505 * b; n++;
        }
        const fz = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        const fx = fz(X / n / 0.95047), fy = fz(Y / n), fzz = fz(Z / n / 1.08883);
        const lab = [+(116 * fy - 16).toFixed(1), +(500 * (fx - fy)).toFixed(1), +(200 * (fy - fzz)).toFixed(1)];
        const sw = { id: s0.id, dist, file, x: s0.x, z: s0.z, lens: v, labMid40: lab };
        /* M1a debt ("the Glass an emerald mirror at range"): at 100 m the middle 40 % is half black sand; the Glass's own
         * pixels are the ones that change when its water is hidden, read alone (linear mean, then Lab) */
        if (s0.id === 'glass') {
          const c2 = await page.evaluate(async (v) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__, g = C.terrain.water?.glassMesh || C.water?.glassMesh;
            if (!g) return null; g.visible = false; try { return M.look(C.engine, C, v.pos, v.target, v.fov); } finally { g.visible = true; } }, v);
          if (c2) {
            const raw2 = Buffer.from(c2.b64, 'base64');
            let gX = 0, gY = 0, gZ = 0, gn = 0;
            for (let i = 0; i < raw.length; i += 3) {
              if (Math.abs(raw[i] - raw2[i]) + Math.abs(raw[i + 1] - raw2[i + 1]) + Math.abs(raw[i + 2] - raw2[i + 2]) < 12) continue;
              const r = lin(raw[i]), g = lin(raw[i + 1]), b = lin(raw[i + 2]);
              gX += 0.4124 * r + 0.3576 * g + 0.1805 * b; gY += 0.2126 * r + 0.7152 * g + 0.0722 * b; gZ += 0.0193 * r + 0.1192 * g + 0.9505 * b; gn++;
            }
            if (gn) {
              const gx = fz(gX / gn / 0.95047), gy = fz(gY / gn), gzz = fz(gZ / gn / 1.08883);
              sw.labGlassOnly = [+(116 * gy - 16).toFixed(1), +(500 * (gx - gy)).toFixed(1), +(200 * (gy - gzz)).toFixed(1)];
              sw.glassPx = gn;
              sw.glassHueDeg = +((Math.atan2(sw.labGlassOnly[2], sw.labGlassOnly[1]) * 180 / Math.PI + 360) % 360).toFixed(1);
            }
          }
        }
        run.swatches.push(sw);
        log(`swatch ${s0.id} at ${dist} m: Lab ${lab.join(' ')}${sw.labGlassOnly ? `; the Glass alone ${sw.labGlassOnly.join(' ')} (hue ${sw.glassHueDeg} deg, ${sw.glassPx} px)` : ''}`);
      }
    }
    await page.evaluate(unstageFrame);
  }

  /* M1a round 3: F05 per aerial variant (layers + still) and per Organ light variant (still + the Organ's crop) */
  if ((AER.length || ORG.length) && spent() < BUDGET_S) {
    await stage('F05');
    run.F05variants = [];
    const setV = (a, o) => page.evaluate(async (a, o) => {
      const A = await import('/src/world/island/aerial.js'); const B = await import('/src/world/sites/basalt.js');
      const a0 = A.AERIAL.value.toArray().concat(A.AERIAL_B ? [A.AERIAL_B.value.x] : []), o0 = B.ORGAN_LIGHT.value.toArray();
      a0.push(A.AERIAL_B ? A.AERIAL_B.value.y : 0);
      if (a) { A.AERIAL.value.set(a[0], a[1], a[2], a[3] ?? a0[3]); if (A.AERIAL_B && a[4] != null) A.AERIAL_B.value.x = a[4]; if (A.AERIAL_B && a[5] != null) A.AERIAL_B.value.y = a[5]; }
      if (o) B.ORGAN_LIGHT.value.set(o[0], o[1], o[2] ?? o0[2], 0);
      return { a0, o0 };
    }, a, o);
    const shipped = await setV(null, null);
    const list = [...AER.map((a) => ({ a, o: null })), ...ORG.map((o) => ({ a: null, o }))];
    for (const { a, o } of list) {
      if (spent() > BUDGET_S) break;
      await setV(a, o);
      await sleep(400);
      const key = a ? `aerial-${a.join('_')}` : `organ-${o.join('_')}`;
      await shot(`F05-${key}.png`);
      const still = await stillStats(`F05-${key}.png`, F05_BOXES);
      const L = await page.evaluate(async () => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; const r = await M.layers(C.engine, C); delete r.map; return r; });
      run.F05variants.push({ key, aerial: a, organ: o, layers: L.layers, classes: L.classes.map((c) => [c.class, c.columnsPct, c.rimL]), gaps: L.gaps.map((g) => g.dL), pass: L.pass, still });
      log(`F05 ${key}: layers ${L.layers}, rims ${L.classes.map((c) => c.rimL).join(' / ')}, gaps ${L.gaps.map((g) => g.dL).join(' / ')}, pass ${L.pass}; organ L* ${still.boxes.organRight[0]} / ${still.boxes.organLeft[0]}`);
      await setV(shipped.a0.slice(0, 5).concat([shipped.a0[5]]), shipped.o0);
    }
    await page.evaluate(unstageFrame);
    /* M1a debt (M1.1j's pale wedge): F32 per aerial variant, a still each */
    if (AER.length && has('--f32')) {
      await stage('F32', 2500);
      for (const a of AER) {
        await setV(a, null);
        await sleep(400);
        await shot(`F32-aerial-${a.join('_')}.png`);
        await setV(shipped.a0.slice(0, 5).concat([shipped.a0[5]]), null);
      }
      await page.evaluate(unstageFrame);
    }
  }
  if (has('--ring') && spent() < BUDGET_S) {
    run.ring = {};
    for (const id of ['F05', 'F02']) {
      await stage(id);
      const r = await page.evaluate(async () => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; return M.ringPanels(C.engine, C, 150); });
      if (r.crop) { await sharp(Buffer.from(r.crop.b64, 'base64'), { raw: { width: r.crop.w, height: r.crop.h, channels: 3 } }).jpeg({ quality: 90 }).toFile(path.join(OUT, `ring-${id}light-150m.jpg`)); delete r.crop; }
      run.ring[id] = r;
      log(`ring at 150 m (${id} light): ${r.panels} panels (${r.keptSamples} samples)`);
      await page.evaluate(unstageFrame);
    }
    await stage('F02');
    run.ring.site = await page.evaluate(() => {
      const C = window.__CTX__, r = C.props.landmarkSet.ring, T = C.terrain;
      return { fallen: (r.fallen || []).map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), ground: T.materialAt(p.x, p.z), ends: [T.materialAt(p.x + Math.cos(p.yaw) * 4, p.z - Math.sin(p.yaw) * 4), T.materialAt(p.x - Math.cos(p.yaw) * 4, p.z + Math.sin(p.yaw) * 4)] })) };
    });
    log(`ring fallen: ${JSON.stringify(run.ring.site)}`);
    const fl = run.ring.site.fallen[0];
    if (fl) {
      const c = await page.evaluate(async (p) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__, T = C.terrain; return M.look(C.engine, C, [p.x + 14, T.getHeight(p.x + 14, p.z + 10) + 1.7, p.z + 10], [p.x, T.getHeight(p.x, p.z) + 0.6, p.z], 46); }, fl);
      await sharp(Buffer.from(c.b64, 'base64'), { raw: { width: c.w, height: c.h, channels: 3 } }).jpeg({ quality: 88 }).toFile(path.join(OUT, 'look-fallen.jpg'));
    }
    await page.evaluate(unstageFrame);
  }
  if (has('--walls') && spent() < BUDGET_S) {
    await stage('F32', 2000);
    const looks = await page.evaluate(() => {
      const C = window.__CTX__, T = C.terrain;
      const t1 = { x: -187, z: 357 }, y = T.getHeight(t1.x, t1.z) + 120;
      return { far: T._far?.walls || null, looks: [
        { name: 'walls-120m-enclosures', pos: [t1.x, y, t1.z], target: [-200, T.getHeight(-200, 215), 215] },
        { name: 'walls-120m-field', pos: [t1.x, y, t1.z], target: [-300, T.getHeight(-300, 290), 290] },
      ] };
    });
    run.walls = { far: looks.far };
    log(`far-field wall bake: ${JSON.stringify(looks.far)}`);
    for (const l of looks.looks) {
      const c = await page.evaluate(async (l) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; return M.look(C.engine, C, l.pos, l.target, 50); }, l);
      await sharp(Buffer.from(c.b64, 'base64'), { raw: { width: c.w, height: c.h, channels: 3 } }).jpeg({ quality: 90 }).toFile(path.join(OUT, `look-${l.name}.jpg`));
    }
    await page.evaluate(unstageFrame);
  }

  /* M1a fix round (FIX LIST 11): F32's frame bar, the p95 presented-frame interval over 30 s (rAF spacing, the game loop
   * running on the staged frame), the median GPU (back-to-back readback), draws and triangles */
  if (has('--f32') && spent() < BUDGET_S) {
    await stage('F32', 3000);
    await shot('F32.png');
    const r = await page.evaluate(async () => {
      const P = await import('/tools/perf/census-page.mjs'); const A = await import('/tools/perf/attrib-page.mjs');
      const C = window.__CTX__, E = C.engine;
      const ts = [];
      const t0 = performance.now();
      await new Promise((res) => { const tick = (t) => { ts.push(t); if (t - t0 < 30000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
      const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
      const s = d.slice().sort((a, b) => a - b), q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
      const cen = P.census(E, C.scene);
      const gpu = await A.finishFrame(E, 60);
      return { intervals: d.length, seconds: +((ts[ts.length - 1] - ts[0]) / 1000).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s[s.length - 1].toFixed(2), over16_7: d.filter((x) => x > 16.7).length, census: cen.all, gpu };
    });
    run.F32 = r;
    /* M1a round 3 fix (FIX LIST 9: F32's missing chunk and LOD seam were UNMEASURED): tools/perf/census-page.mjs's seam
     * probe, as tools/perf/census.mjs runs it (land and water white over magenta; a gap pixel with land within 3 px on both
     * sides is a crack), with the chunk LOD on (shipped) and off (one level everywhere) */
    if (has('--seams')) {
      run.F32.seams = await page.evaluate(async () => {
        const P = await import('/tools/perf/census-page.mjs'); const C = window.__CTX__, E = C.engine, S = C.scene, T = C.terrain;
        const raf = () => new Promise((res) => requestAnimationFrame(() => res()));
        const land = new Set(); T.group.traverse((o) => { if (o.isMesh && o !== T.isles) land.add(o); });
        const water = new Set(); (T.water?.group || T.water?.mesh)?.traverse?.((o) => { if (o.isMesh) water.add(o); });
        const out = { shipped: P.seams(E, S, (o) => land.has(o) || water.has(o)) };
        /* M1a debt: the LOD's own seam is a crack in the shipped render that the one-level render does not have; a gap
         * in both is the geometry's (at a000205 and fb6d5f0 the 3 px, widest 4, were the same 3 pixels in both renders) */
        const W = await import('/tools/perf/world-r2-page.mjs');
        const a = W.crackList(E, S, (o) => land.has(o) || water.has(o));
        const lod = T.perfSwitches().find((s) => s.id === 'terrain-lod');
        if (lod) {
          lod.off(); for (let i = 0; i < 4; i++) await raf();
          const keepM = (o) => (T.group.children.includes(o) || land.has(o) || water.has(o)) && o !== T.isles && o.visible;
          out.monolithic = P.seams(E, S, keepM);
          const b = W.crackList(E, S, keepM);
          lod.on(); for (let i = 0; i < 4; i++) await raf();
          const inB = new Set(b.cracks.map((c) => c[0]));
          const lodOnly = a.cracks.filter((c) => !inB.has(c[0]));
          out.lodOnly = { crackPx: lodOnly.length, widestPx: lodOnly.reduce((m, c) => Math.max(m, c[1]), 0),
            at: lodOnly.slice(0, 24).map((c) => [c[0] % a.w, a.h - 1 - Math.floor(c[0] / a.w), c[1]]),
            bothPx: a.cracks.length - lodOnly.length, method: 'crack pixels of the shipped render that are not cracks in the one-level (terrain-lod off) render' };
        }
        out.terrainStats = T.lodStats();
        return out;
      });
      const sm = run.F32.seams;
      log(`F32 seams: shipped crack ${sm.shipped.crackPx} px (widest ${sm.shipped.widestPx}), monolithic crack ${sm.monolithic?.crackPx} px (widest ${sm.monolithic?.widestPx}), land ${sm.shipped.landPx} px; LOD's own ${sm.lodOnly?.crackPx} px (widest ${sm.lodOnly?.widestPx}), in both ${sm.lodOnly?.bothPx}`);
    }
    log(`F32: p95 interval ${r.p95} ms (p50 ${r.p50}, ${r.intervals} frames in ${r.seconds} s), GPU median ${r.gpu.medianMs} ms, draws ${r.census.draws}, tris ${r.census.tris}`);
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
