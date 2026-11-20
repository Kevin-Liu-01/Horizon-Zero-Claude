#!/usr/bin/env node
/**
 * THE FIRST LOAD, MEASURED IN THE BUILT GAME (TECH §9: first load <= 60 MB; the cap means the bytes fetched before
 * she is under control). Row `P-boot-transfer`:
 *
 *   tools/perf/clean-measure.sh <commit> <port> node tools/perf/boot-transfer.mjs --port <port> [--continues stall,plumb-2]
 *
 * It builds the game (vite build), serves dist/ with vite preview on the lane port, takes the one Chrome slot, and in a
 * fresh profile with the HTTP cache disabled (every byte goes over the wire, CDP Network: requestWillBeSent wallTime,
 * loadingFinished encodedDataLength) plays each case from page load:
 *
 *   new-game          the title, a key, NEW GAME, the first difficulty;
 *   continue:<from>   a save written first (tools/gates/systems/first-hour-fixtures.mjs fixture(2, { from }): 'stall' is
 *                     inside Ninewalls in the Holds with the kit, 'plumb-2' on the Holds' terraces by the herd), the page
 *                     opened again, then the title, a key, CONTINUE and the marked slot.
 *
 * Control is the frame two frames after `game-start` (the state 'playing', as tools/perf/exit-bar.mjs times it). For
 * each case: the requests started before control (files, bytes), whether any of them is a deferred file (the game's
 * own list: src/audio/manifest.js DEFERRED_FILES, the list the shipped ledger reads), the late bank's log after control
 * (GameAudio.lateAudit(): started, every set decoded, first asks and leads, any miss), the presented frames over 33 and
 * 50 ms in the WATCH_S after control, and (New Game) the earliest a first-hour cue can be asked: the sprint time from the
 * spawn to the nearest ground each late place's weight reaches 0.01 (the director's own weights), against the time its
 * rows were decoded.
 *
 * PASS: every case <= 60 MB (decimal, 60e6 bytes) before control and no deferred file requested before control; the
 * late bank starts after control and decodes whole; New Game: no late set asked before its decode and every place's
 * rows decoded before she can reach it. A Continue's misses (a set wanted in its first second) are reported with their
 * lateness, not graded.
 *
 * Writes <runs>/<UTC stamp>-<commit>-boot-transfer/report.json (outside the repo). Never port 5173.
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
import { DEFERRED_FILES, LATE_BYTES, BOOT_BYTES } from '../../src/audio/manifest.js';
import { fixture } from '../gates/systems/first-hour-fixtures.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
if (!PORT || PORT === 5173) throw new Error('boot-transfer: --port <lane port> is required (never 5173)');
const CONTINUES = flag('--continues', 'stall,plumb-2').split(',').map((s) => s.trim()).filter(Boolean);
const WATCH_S = Number(flag('--watch-s', 12));
const CAP_BYTES = 60e6;
const SPRINT_MS = 8.2;      // her sprint (m/s; src/audio/audio.js footstep scale, A28b canon band top)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[boot-transfer ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };

const commit = git('rev-parse', '--short', 'HEAD');
const dirty = (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean);
const stamp = utc().replace(/[-:]/g, '');
const OUT = path.join(os.homedir(), '.calima-r5/review/runs', `${stamp}-${commit}-boot-transfer`);
if (path.resolve(OUT).startsWith(REPO + path.sep)) throw new Error('the run directory goes outside the repo');
mkdirSync(OUT, { recursive: true });
const DEFERRED = new Set(DEFERRED_FILES.map((f) => '/' + f));
const run = {
  row: 'P-boot-transfer', tool: 'tools/perf/boot-transfer.mjs', commit, clean: dirty.length === 0, dirty: dirty.slice(0, 20),
  tree: process.env.CLEAN_TREE || REPO, via: process.env.CLEAN_TREE ? 'tools/perf/clean-measure.sh' : 'in place', port: PORT, startedAt: utc(),
  capBytes: CAP_BYTES, ledger: { deferredFiles: DEFERRED.size, lateBytes: LATE_BYTES, bootAudioBytes: BOOT_BYTES }, cases: [], console: [],
};
const save = () => writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(run, null, 1));

function portFree(p) { return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); }); }
let server = null;
function stopServer() { if (!server) return; try { process.kill(-server.pid, 'SIGTERM'); } catch { /* */ } server = null; }
process.on('exit', stopServer);

/** In the page from its first script: the wall-clock moment of `game-start` and of control (two frames later). */
const hookControl = () => {
  const iv = setInterval(() => {
    const C = window.__CTX__;
    if (!C?.events?.on) return;
    clearInterval(iv);
    C.events.on('game-start', () => {
      if (window.__gameStartWall) return;
      window.__gameStartWall = Date.now();
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__controlWall = Date.now(); }));
    });
  }, 2);
};

/** In the page after control: presented frames for `s` seconds, and the late bank's log at the end. */
const watchAfter = async (s) => {
  const raf = () => new Promise((r) => requestAnimationFrame((t) => r(t)));
  const iv = [];
  let last = await raf();
  const end = last + s * 1000;
  while (last < end) { const t = await raf(); iv.push(t - last); last = t; }
  const A = window.__CTX__.audio;
  return { frames: iv.length, over33: iv.filter((v) => v > 33.4).length, over50: iv.filter((v) => v > 50).length, worstMs: +Math.max(...iv).toFixed(1),
    late: A?.lateAudit ? A.lateAudit() : null, bankLate: !!A?.bankLate, ctxState: A?.ac?.state ?? null };
};

/** In the page: how soon she can reach each late place from where she stands (the director's own weights). */
const reachOf = (sprint) => {
  const C = window.__CTX__, H = C.audio?.hour, p = C.player;
  if (!H || !p) return null;
  const x0 = p.position.x, z0 = p.position.z;
  const best = { holds: null, ninewalls: null, scar: null, malpais: null };
  const probe = { position: { x: 0, y: 0, z: 0 } };
  for (let r = 0; r <= 900; r += 4) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI;
      probe.position.x = x0 + Math.cos(a) * r; probe.position.z = z0 + Math.sin(a) * r;
      H._zoneTargets(probe);
      for (const place of Object.keys(best)) if (best[place] == null && H.placeWeight(place) > 0.01) best[place] = r;
    }
    if (Object.values(best).every((v) => v != null)) break;
  }
  H._zoneTargets(p);
  const out = {};
  for (const [k, d] of Object.entries(best)) out[k] = { m: d, sprintS: d == null ? null : +(d / sprint).toFixed(1) };
  return { from: { x: +x0.toFixed(1), z: +z0.toFixed(1) }, places: out };
};

async function title(page) {
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 50 });
  await sleep(400);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 25 });
  await sleep(300);
}

async function oneCase(browser, kind, from) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  page.on('console', (m) => { if (m.type() === 'error') run.console.push({ case: kind, text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => run.console.push({ case: kind, text: 'pageerror: ' + String(e).slice(0, 300) }));
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.evaluateOnNewDocument(hookControl);
  const rec = { case: kind + (from ? `:${from}` : ''), pass: null };
  if (kind === 'continue') {
    // the save first (its own page load, not measured), then the page opened again
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 100 });
    const save = { ...fixture(2, { from }), savedAt: Date.now() };
    const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, save);
    if (!wrote?.ok) throw new Error(`fixture ${from} not written: ${JSON.stringify(wrote)}`);
    rec.save = { from, position: save.position, hour: save.hour };
    await page.goto('about:blank', { waitUntil: 'load', timeout: 30000 });
  }
  const reqs = new Map();
  const onSent = (e) => { if (!reqs.has(e.requestId)) reqs.set(e.requestId, { url: e.request.url, wall: e.wallTime * 1000, bytes: 0, done: false }); };
  const onDone = (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength || 0; r.done = true; } };
  const onFail = (e) => { const r = reqs.get(e.requestId); if (r) { r.failed = e.errorText; r.done = true; } };
  cdp.on('Network.requestWillBeSent', onSent);
  cdp.on('Network.loadingFinished', onDone);
  cdp.on('Network.loadingFailed', onFail);
  const tNav = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await title(page);
  if (kind === 'new-game') {
    const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /NEW GAME/.test(x.textContent)); if (!b) return false; b.click(); return true; });
    if (!ok) throw new Error('no NEW GAME item on the title menu');
    await page.waitForSelector('.mn-diff', { timeout: 20000 });
    await page.evaluate(() => document.querySelector('.mn-diff').click());
  } else {
    const why = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent));
      if (!b || b.disabled) return 'no CONTINUE on the title';
      b.click();
      const go = document.querySelector('.gs-slot.cont .gs-slot-go');
      if (!go) return 'no marked slot card';
      go.click();
      return null;
    });
    if (why) throw new Error(`continue: ${why}`);
  }
  await page.waitForFunction(() => window.__CTX__?.state === 'playing' && !!window.__controlWall, { timeout: 60000, polling: 10 });
  const { gs, ctl } = await page.evaluate(() => ({ gs: window.__gameStartWall, ctl: window.__controlWall }));
  const w = await page.evaluate(watchAfter, WATCH_S);
  // where she stands now and how soon she can reach each late place
  rec.where = await page.evaluate(() => { const C = window.__CTX__, p = C.player.position; return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), region: C.regions?.tracker?.current ?? null }; });
  if (kind === 'new-game') rec.reach = await page.evaluate(reachOf, SPRINT_MS);
  cdp.off('Network.requestWillBeSent', onSent);
  cdp.off('Network.loadingFinished', onDone);
  cdp.off('Network.loadingFailed', onFail);

  const all = [...reqs.values()];
  const pathOf = (u) => { try { return decodeURIComponent(new URL(u).pathname); } catch { return u; } };
  const before = all.filter((r) => r.wall < ctl);
  const after = all.filter((r) => r.wall >= ctl);
  const sum = (a) => a.reduce((s, r) => s + r.bytes, 0);
  const deferredBefore = before.filter((r) => DEFERRED.has(pathOf(r.url))).map((r) => ({ file: pathOf(r.url), msBeforeControl: Math.round(ctl - r.wall) }));
  const deferredAfter = after.filter((r) => DEFERRED.has(pathOf(r.url)));
  const firstDeferred = deferredAfter.length ? Math.min(...deferredAfter.map((r) => r.wall)) : null;
  const byKind = {};
  for (const r of before) { const ext = (pathOf(r.url).match(/\.([a-z0-9]+)$/i)?.[1] || 'other').toLowerCase(); byKind[ext] = (byKind[ext] || 0) + r.bytes; }
  rec.timing = { navToGameStartS: +((gs - tNav) / 1000).toFixed(2), gameStartToControlMs: ctl - gs };
  rec.beforeControl = {
    files: before.length, bytes: sum(before), mb: +(sum(before) / 1e6).toFixed(2), mib: +(sum(before) / 1048576).toFixed(2),
    stillInFlightAtControl: before.filter((r) => !r.done).length, failed: before.filter((r) => r.failed).length,
    byKindMb: Object.fromEntries(Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1e6).toFixed(2)])),
    deferredFiles: deferredBefore.length, deferred: deferredBefore.slice(0, 10),
  };
  rec.afterControl = {
    seconds: WATCH_S, files: after.length, mb: +(sum(after) / 1e6).toFixed(2),
    deferredFiles: deferredAfter.length, deferredMb: +(sum(deferredAfter) / 1e6).toFixed(3),
    firstDeferredMsAfterControl: firstDeferred == null ? null : Math.round(firstDeferred - ctl),
    lastDeferredMsAfterControl: deferredAfter.length ? Math.round(Math.max(...deferredAfter.map((r) => r.wall)) - ctl) : null,
  };
  const L = w.late;
  rec.frames = { frames: w.frames, over33: w.over33, over50: w.over50, worstMs: w.worstMs, audioContext: w.ctxState };
  rec.late = L ? { state: L.state, rows: L.rows, decoded: L.decoded, megabytes: L.megabytes, startedS: L.startedS, lastDecodedS: L.lastDecodedS, doneS: L.doneS,
    asked: L.asked, missed: L.missed, minLeadS: L.minLeadS, asks: L.sets.filter((s) => s.asks > 0) } : null;
  if (rec.reach && L) {
    const placeOf = {};
    const { MANIFEST } = await import('../../src/audio/manifest.js');
    for (const r of MANIFEST) if (r.load === 'late') placeOf[r.set] = r.place;
    rec.leadByPlace = {};
    for (const [place, v] of Object.entries(rec.reach.places)) {
      const sets = L.sets.filter((s) => placeOf[s.set] === place);
      const dec = sets.every((s) => s.decodedS != null) ? Math.max(...sets.map((s) => s.decodedS)) : null;
      rec.leadByPlace[place] = { reachS: v.sprintS, decodedS: dec, leadS: v.sprintS != null && dec != null ? +(v.sprintS - dec).toFixed(1) : null };
    }
  }
  const late = rec.late;
  rec.checks = {
    underCap: rec.beforeControl.bytes <= CAP_BYTES,
    noDeferredBeforeControl: rec.beforeControl.deferredFiles === 0,
    lateAfterControl: !!late && late.startedS != null && late.startedS >= 0 && rec.afterControl.firstDeferredMsAfterControl != null && rec.afterControl.firstDeferredMsAfterControl >= 0,
    lateWhole: !!late && late.state === 'done' && late.decoded === late.rows && rec.afterControl.deferredFiles === DEFERRED.size,
  };
  if (kind === 'new-game') {
    rec.checks.noMiss = !!late && late.missed.length === 0;
    rec.checks.decodedBeforeReach = !!rec.leadByPlace && Object.values(rec.leadByPlace).every((v) => v.leadS == null || v.leadS > 0) && Object.values(rec.leadByPlace).some((v) => v.leadS != null);
  }
  rec.pass = Object.values(rec.checks).every(Boolean);
  await page.close();
  return rec;
}

try {
  if (!args.includes('--no-build')) {
    log('vite build');
    execFileSync('nice', ['-n', '10', 'npx', 'vite', 'build', '--logLevel', 'error'], { cwd: REPO, stdio: 'inherit' });
  }
  if (!(await portFree(PORT))) throw new Error(`port ${PORT} is taken: this tool runs its own server`);
  server = spawn('nice', ['-n', '10', 'npx', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break; } catch { /* */ } await sleep(250); }
  const slot = await takeMachineSlot({ who: `boot-transfer ${PORT}`, waitS: Number(flag('--slot-wait', 1800)), log });
  if (!slot.ok) throw new Error(slot.why);
  installProfileCleanup();
  const tC = Date.now();
  const profile = profileDir(PORT);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  try {
    for (const c of [['new-game', null], ...CONTINUES.map((f) => ['continue', f])]) {
      try {
        const rec = await oneCase(browser, c[0], c[1]);
        run.cases.push(rec);
        log(`${rec.case}: ${rec.beforeControl.mb} MB in ${rec.beforeControl.files} files before control, ${rec.beforeControl.deferredFiles} deferred; late ${rec.late?.decoded}/${rec.late?.rows} by ${rec.late?.lastDecodedS} s, missed ${rec.late?.missed?.length}; ${rec.pass ? 'PASS' : 'FAIL'}`);
      } catch (e) { run.cases.push({ case: c.join(':'), pass: false, error: String(e?.stack || e).slice(0, 600) }); log(`${c.join(':')}: ${e}`); }
      save();
    }
  } finally {
    try { await browser.close(); } catch { /* */ }
    disposeProfile(profile);
    releaseMachineSlot(log);
    run.chromeS = Math.round((Date.now() - tC) / 1000);
  }
} catch (e) {
  run.error = String(e?.stack || e).slice(0, 800);
} finally {
  stopServer();
  run.pass = run.cases.length > 0 && run.cases.every((c) => c.pass) && !run.error;
  run.finishedAt = utc();
  save();
  log(`${run.pass ? 'PASS' : 'FAIL'} P-boot-transfer at ${commit} (clean ${run.clean}): ${OUT}`);
  process.exitCode = run.pass ? 0 : 1;
}
