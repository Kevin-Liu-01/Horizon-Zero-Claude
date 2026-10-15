#!/usr/bin/env node
/**
 * ROUND 5 PIPELINE PROOF — film + measure harness.
 *
 *   node tools/r5-poc/film-creature-world.mjs [creature|biome|all] [--port 5241]
 *
 * Starts its own Vite on --port (never 5173), drives headless Chrome through
 * `?poc=creature&shot=1` and `?poc=biome`, saves shots/r5-poc-*.png and
 * writes tools/r5-poc/out/metrics.<mode>.json. Kills Vite and Chrome and
 * deletes its Chrome profile on exit (tools/chrome-profile.mjs).
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sweepProfiles, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const MODE = args[0] && !args[0].startsWith('--') ? args[0] : 'all';
const getFlag = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const PORT = parseInt(getFlag('--port', '5241'), 10);
if (PORT === 5173) throw new Error('port 5173 is Kevin\'s preview — pick another');
const W = 1600, H = 900;

const portOpen = (port) => new Promise((res) => {
  const s = net.connect(port, '127.0.0.1');
  s.once('connect', () => { s.destroy(); res(true); });
  s.once('error', () => res(false));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let vite = null;
if (!(await portOpen(PORT))) {
  vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await portOpen(PORT)); i++) await sleep(250);
}
installProfileCleanup();
sweepProfiles({ killOrphans: false });
const userDataDir = profileDir(PORT);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H + 40}`,
    '--enable-precise-memory-info', '--js-flags=--expose-gc'],
  userDataDir,
});
mkdirSync(`${ROOT}shots`, { recursive: true });
mkdirSync(`${ROOT}tools/r5-poc/out`, { recursive: true });

async function openPage(query) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  // same HMR neutraliser as tools/screenshot.mjs (other lanes save into this repo)
  await page.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      const p = Array.isArray(protocols) ? protocols[0] : protocols;
      if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) {
        const t = new EventTarget(); t.readyState = 1; t.send = () => {}; t.close = () => {}; return t;
      }
      return new Real(url, protocols);
    };
    window.WebSocket.prototype = Real.prototype;
  });
  const errors = [], warns = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning' && /r5|HZC|gait|autorig/i.test(m.text())) warns.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { page, errors, warns };
}

async function waitReady(page, flag, errors, ms = 150000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate((f) => window[f] === true, flag).catch(() => false)) return;
    if (errors.some((e) => /r5-poc|r5|boot failed/i.test(e))) break;
    await sleep(500);
  }
  const state = await page.evaluate(() => ({ ready: !!window.__READY__, ctx: !!window.__CTX__,
    variety: !!window.__CTX__?.machines?.varietyReady })).catch(() => null);
  throw new Error(`${flag} never set; state=${JSON.stringify(state)} errors=${JSON.stringify(errors.slice(0, 8))}`);
}

async function snap(page, name) {
  const path = `${ROOT}shots/${name}.png`;
  await page.screenshot({ path });
  console.log('saved', `shots/${name}.png`);
  return path;
}

async function filmCreature() {
  const { page, errors, warns } = await openPage('shot=1&poc=creature');
  await waitReady(page, '__R5POC_READY__', errors);
  const out = { mode: 'creature' };
  out.site = await page.evaluate(() => window.__R5POC__.site);
  out.timings = await page.evaluate(() => window.__R5POC__.timings);
  await sleep(2500);
  out.census = await page.evaluate(() => window.__R5POC__.census());
  out.weights = await page.evaluate(() => window.__R5POC__.weights());
  // film
  await page.evaluate(() => window.__R5POC__.shot('side', { dist: 7.2, h: 1.3, look: 1.15, fov: 38 }));
  await snap(page, 'r5-poc-creature-side');
  // gait strip: four side frames 0.28 s apart (planted feet should not move)
  const strip = [];
  for (let i = 0; i < 4; i++) {
    const p = `${ROOT}shots/.r5-strip-${i}.png`;
    await page.screenshot({ path: p, clip: { x: 300, y: 150, width: 1000, height: 650 } });
    strip.push(p);
    await sleep(280);
  }
  const tiles = await Promise.all(strip.map((p) => sharp(p).resize(800, 520).toBuffer()));
  await sharp({ create: { width: 1600, height: 1040, channels: 3, background: '#000' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % 2) * 800, top: Math.floor(i / 2) * 520 })))
    .png().toFile(`${ROOT}shots/r5-poc-creature-gait-strip.png`);
  console.log('saved shots/r5-poc-creature-gait-strip.png');
  const { unlinkSync } = await import('node:fs');
  for (const p of strip) unlinkSync(p);

  await page.evaluate(() => window.__R5POC__.shot('3q', { dist: 7.0, h: 1.0, look: 1.2, fov: 40 }));
  await snap(page, 'r5-poc-creature-3q');
  await page.evaluate(() => window.__R5POC__.shot('rear3q', { dist: 7.5, h: 2.6, look: 1.1, fov: 40 }));
  await snap(page, 'r5-poc-creature-rear');
  await page.evaluate(() => window.__R5POC__.shot('feet', { dist: 4.2, h: 0.35, look: 0.45, fov: 42 }));
  await snap(page, 'r5-poc-creature-feet');

  // measure
  await page.evaluate(() => window.__R5POC__.shot('side', { dist: 9, h: 1.5, look: 1.1, fov: 40 }));
  out.feet = await page.evaluate(() => window.__R5POC__.measureFeet(8000));
  out.draws = await page.evaluate(() => window.__R5POC__.measureDraws());
  out.memory = await page.evaluate(() => window.__R5POC__.memoryCycle(3, 4));
  out.systemErrors = await page.evaluate(() => window.__R5POC__.errors());
  out.consoleErrors = errors.slice(0, 20);
  out.warnings = warns.slice(0, 20);
  writeFileSync(`${ROOT}tools/r5-poc/out/metrics.creature.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
  await page.close();
}

async function filmBiome() {
  const { page, errors, warns } = await openPage('poc=biome');
  await waitReady(page, '__R5BIOME_READY__', errors);
  const out = { mode: 'biome' };
  out.build = await page.evaluate(() => window.__R5BIOME__.stats());
  const views = await page.evaluate(() => Object.keys(window.__R5BIOME__.views));
  for (const v of views) {
    await page.evaluate((v) => window.__R5BIOME__.view(v), v);
    await sleep(1200);
    await snap(page, `r5-poc-biome-${v}`);
  }
  await page.evaluate(() => window.__R5BIOME__.view(Object.keys(window.__R5BIOME__.views)[0]));
  await sleep(800);
  out.perf = await page.evaluate(() => window.__R5BIOME__.measure(3000));
  out.gpuStatesDpr1 = await page.evaluate(() => window.__R5BIOME__.gpuStates(3000));
  out.memoryBeforeDispose = await page.evaluate(() => ({ ...window.__R5BIOME__.engine.renderer.info.memory }));
  out.memoryAfterDispose = await page.evaluate(() => window.__R5BIOME__.dispose());
  await page.close();
  // the shipped `high` tier caps DPR at 1.5: measure there too (A21 grades DPR 1.5 and 2)
  for (const dsf of [1.5]) {
    const p2 = await openPage('poc=biome');
    await p2.page.setViewport({ width: W, height: H, deviceScaleFactor: dsf });
    await p2.page.reload({ waitUntil: 'domcontentloaded' });
    await waitReady(p2.page, '__R5BIOME_READY__', p2.errors);
    await sleep(1500);
    out[`perfDpr${dsf}`] = await p2.page.evaluate(() => window.__R5BIOME__.measure(3000).then((m) => ({ snap: m.snap, total: m.total, dpr: m.dpr })));
    if (dsf === 1.5) out.gpuStatesDpr1_5 = await p2.page.evaluate(() => window.__R5BIOME__.gpuStates(3000));
    await p2.page.close();
  }
  // the procedural-rock route, same cliff view, for the scan-vs-procedural comparison
  {
    const p3 = await openPage('poc=biome&rock=proc');
    await waitReady(p3.page, '__R5BIOME_READY__', p3.errors);
    await p3.page.evaluate(() => window.__R5BIOME__.view('cliff'));
    await sleep(1200);
    await snap(p3.page, 'r5-poc-biome-cliff-procrock');
    await p3.page.close();
  }
  out.consoleErrors = errors.slice(0, 20);
  out.warnings = warns.slice(0, 20);
  writeFileSync(`${ROOT}tools/r5-poc/out/metrics.biome.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
}

/** `eval <query> <file.js>`: open a poc page, wait for it, print the file's expression result. */
async function evalMode() {
  const query = args[1];
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(args[2], 'utf8');
  const { page, errors } = await openPage(query);
  await waitReady(page, query.includes('biome') ? '__R5BIOME_READY__' : '__R5POC_READY__', errors);
  await sleep(parseInt(getFlag('--settle', '2500'), 10));
  const v = await page.evaluate(js);
  console.log(JSON.stringify(v, null, 1));
  if (getFlag('--shot', null)) await snap(page, getFlag('--shot'));
  if (errors.length) console.log('ERRORS', errors.slice(0, 10));
  await page.close();
}

try {
  if (MODE === 'eval') await evalMode();
  if (MODE === 'creature' || MODE === 'all') await filmCreature();
  if (MODE === 'biome' || MODE === 'all') await filmBiome();
} catch (err) {
  console.error('[film] failed:', err);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => { try { browser.process()?.kill('SIGKILL'); } catch { /* gone */ } });
  disposeProfile(userDataDir);
  if (vite) vite.kill();
}
