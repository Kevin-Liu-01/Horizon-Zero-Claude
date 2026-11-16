#!/usr/bin/env node
/**
 * THE UI LANE'S LIVE PROBE (M1.6h title and New Game, M1.6d Making ledger and quick-make).
 *
 * Boots the real page (no ?shot: the Loading sheet, the title, the press beat) from THIS tree on --port, in one
 * headless Chrome under the machine slot, and measures every way into play, each timed from the moment the Loading
 * sheet closes over it:
 *   A. boot -> press -> NEW GAME -> BEGIN, 6 s of play
 *   B. QUIT TO TITLE -> press -> NEW GAME -> BEGIN, 6 s of play (shots: the press beat, the stations, the Tolerance card)
 *   C. SAVE, QUIT TO TITLE -> press -> CONTINUE, 6 s of play
 * then the Making ledger (shot and audit: the turntable rendered, the material pictures) and quick-make (hold 1 for
 * 1.3 s; hold again and take a 1 HP hit at 0.6 s), then the Character page (M1.6i: P from play; rung 2 before it is
 * hers, then staged as the quest's reward; WEAR to rung 2, to rung 1 and to rung 2 again, each with its frames;
 * Escape hands the lens and her heading back). With --variants and VARIANTS='[{frame:{...}}, ...]' it re-solves
 * the title shot for each and shoots the rest frame and the press frame (tuning; not a measurement).
 *
 * Frame time is the rAF interval (vsync-locked in headless Chrome: a stall shows, GPU cost does not; see
 * tools/perf/attrib.mjs for GPU ms). A frame counts as "under the sheet" when the sheet was up on it or on the frame
 * before; the bar (BUILD M1.6h) is no frame over 50 ms after the sheet closes.
 *
 * Writes <review>/runs/<utc>-<commit>-ui-probe-<label>/probe.json and its shots, with the commit and the dirty flag.
 *   node tools/ui/title-probe.mjs --port 5263 --label fix1 [--variants]
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { takeMachineSlot, releaseMachineSlot } from '../chrome-slot.mjs';
import { profileDir, disposeProfile, installProfileCleanup, guardPort } from '../chrome-profile.mjs';
import { RUNS } from '../frames/paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('--port'));
const LABEL = arg('--label', 'probe');
const VARIANTS = process.argv.includes('--variants');
if (!PORT) { console.error('title-probe: --port is required'); process.exit(2); }
guardPort?.(PORT);

const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const stamp = utc().replace(/[-:]/g, '');
const OUT = path.join(RUNS, `${stamp}-${commit}${dirty ? '-dirty' : ''}-ui-probe-${LABEL}`);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const log = (...a) => console.log('[title-probe]', ...a);
const res = { commit, dirty, tree: REPO, port: PORT, label: LABEL, startedAt: utc(), shots: [], console: [] };

let vite = null, browser = null, profile = null;
const done = async () => {
  try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
  if (profile) { try { disposeProfile(profile); } catch { /* */ } }
  releaseMachineSlot(log);
  res.endedAt = utc();
  writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(res, null, 1));
  log('wrote', path.join(OUT, 'probe.json'));
};

if (await portOpen(PORT)) { console.error(`title-probe: port ${PORT} is busy`); process.exit(3); }
const slot = await takeMachineSlot({ who: `ui title-probe ${LABEL}`, waitS: 1500, log });
if (!slot.ok) { console.error('title-probe: no Chrome slot'); process.exit(4); }
const t0 = Date.now();
try {
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  installProfileCleanup();
  profile = profileDir(PORT);
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  page.on('console', (m) => { if (m.type() === 'error') res.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => res.console.push('pageerror: ' + String(e).slice(0, 300)));
  await page.evaluateOnNewDocument(() => {
    // a dead HMR socket: other lanes save files in the shared tree
    const Real = window.WebSocket;
    function Dead() { const t = new EventTarget(); t.readyState = 1; t.send = () => {}; t.close = () => {}; return t; }
    window.WebSocket = function (url, p) { if ((Array.isArray(p) ? p[0] : p) === 'vite-hmr' || String(url).includes('vite')) return Dead(); return new Real(url, p); };
    window.WebSocket.prototype = Real.prototype;
    // every rAF interval [t, ms, sheet up now, sheet up the frame before], and each time the sheet closes
    window.__ft = []; window.__closes = [];
    let last = performance.now(), wasUp = true;
    const tick = (now) => {
      const L = document.getElementById('loading');
      const up = !!L && !L.classList.contains('hidden');
      window.__ft.push([Math.round(now), +(now - last).toFixed(1), up ? 1 : 0, wasUp ? 1 : 0]);
      if (wasUp && !up) window.__closes.push(Math.round(now));
      wasUp = up; last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__loaf = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration),
        scripts: (e.scripts || []).filter((x) => x.duration > 15).map((x) => ({ fn: x.sourceFunctionName, src: String(x.sourceURL || '').split('/').slice(-2).join('/'), d: Math.round(x.duration) })) }); })
        .observe({ type: 'long-animation-frame', buffered: true });
    } catch { /* */ }
  });
  const shot = async (name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); res.shots.push(path.basename(f)); log('shot', name); };
  const C = (fn, a) => page.evaluate(fn, a);
  const station = (key) => C((k) => [...document.querySelectorAll('.mn-title-item')].find((x) => x.dataset.station === k)?.click(), key);
  const waitPlaying = () => page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 });
  const waitPress = () => page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 240000, polling: 100 });
  /** Frames of the window that starts at the latest sheet close, for `ms` of play after it. */
  const segment = async (name, ms = 6000) => {
    await page.waitForFunction(() => { const L = document.getElementById('loading'); return !L || L.classList.contains('hidden'); }, { timeout: 30000, polling: 50 });
    await sleep(ms);
    const s = await C(() => {
      const c = window.__closes[window.__closes.length - 1] ?? 0;
      const win = window.__ft.filter(([t]) => t > c);
      const under = win.filter((f) => f[2] || f[3]);
      const after = win.filter((f) => !f[2] && !f[3]);
      const ds = after.map(([, d]) => d).sort((x, y) => x - y);
      const L = document.getElementById('loading');
      // the long frames while the sheet stood over this start (from the click to the close)
      const before = window.__ft.filter(([t, , up]) => up && t <= c && t > c - 15000);
      return { closedAt: c, frames: after.length, over50: after.filter(([, d]) => d > 50).length, max: ds[ds.length - 1] ?? 0,
        p99: ds[Math.floor(ds.length * 0.99)] ?? 0, median: ds[Math.floor(ds.length / 2)] ?? 0, under: under.length,
        sheetWorst: before.reduce((m, f) => Math.max(m, f[1]), 0), sheetFrames: before.length,
        closedAfterMs: L?.dataset.closedAfterMs ?? null, overList: after.filter(([, d]) => d > 50).slice(0, 12),
        loaf: (window.__loaf || []).filter((e) => e.t > c && e.d > 50).slice(0, 8) };
    });
    // reset the frame log so the next window is its own
    await C(() => { window.__ft.length = 0; });
    res[name] = s;
    log(name, JSON.stringify({ frames: s.frames, over50: s.over50, max: s.max, p99: s.p99, under: s.under, sheetWorst: s.sheetWorst }));
    return s;
  };

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(1500);
  await shot('00-loading');
  await waitPress();
  res.bootS = (Date.now() - t0) / 1000;

  // A. boot -> press -> NEW GAME -> BEGIN
  await sleep(2000);
  await page.keyboard.press('Enter');
  await sleep(2600);
  await station('newGame');
  await sleep(700);
  await C(() => document.querySelector('.mn-tol-begin').click());
  await waitPlaying();
  await segment('A_boot_newGame');

  // B. QUIT TO TITLE -> press -> NEW GAME -> BEGIN, with the pictures
  await C(() => window.__CTX__.menus.quitToTitle());
  await sleep(2500);
  await shot('01-press');
  res.press = await C(() => { const M = window.__CTX__.menus; const a = M.audit().title; const cam = window.__CTX__.camera.position;
    const sub = document.querySelector('#cal-sys .sys-subt');
    return { stage: a.stage, dolly: a.dolly, shot: a.shot, cam: [cam.x, cam.y, cam.z].map((v) => +v.toFixed(2)),
      subtitleShown: !!sub && sub.classList.contains('on') && getComputedStyle(sub).display !== 'none' }; });
  await page.keyboard.press('Enter');
  await sleep(3000);
  await shot('02-title');
  res.title = await C(() => { const a = window.__CTX__.menus.audit().title; return { stage: a.stage, logos: a.logos, items: a.menuItems, dolly: a.dolly, shot: a.shot, clock: a.clock }; });
  if (VARIANTS) {
    const vars = JSON.parse(process.env.VARIANTS || '[]');
    res.variants = [];
    for (let i = 0; i < vars.length; i++) {
      const v = await C((o) => window.__CTX__.menus._titleReframe(o), vars[i]);
      await sleep(900);
      await shot(`03-variant-${i}`);
      res.variants.push({ in: vars[i], shot: v });
    }
    await C(() => window.__CTX__.menus._titleReframe({ frame: {} }));
  }
  await station('newGame');
  await sleep(700);
  await shot('04-tolerance');
  await C(() => document.querySelector('.mn-tol-begin').click());
  await waitPlaying();
  await segment('B_quit_newGame');

  // C. SAVE, QUIT TO TITLE -> press -> CONTINUE
  res.saved = await C(() => { const M = window.__CTX__.menus; M.saveGame?.(); return !!window.__CTX__.progression?.hasSave?.(); });
  await C(() => window.__CTX__.menus.quitToTitle());
  await sleep(2000);
  await page.keyboard.press('Enter');
  await sleep(2600);
  res.continueEnabled = await C(() => { const b = [...document.querySelectorAll('.mn-title-item')].find((x) => x.dataset.station === 'continue'); return !!b && !b.disabled; });
  await station('continue');
  await waitPlaying();
  await segment('C_quit_continue');
  await shot('05-play');

  // the Making ledger (O from play)
  const tO = await C(() => performance.now());
  await page.keyboard.press('KeyO');
  await sleep(1400);
  await shot('06-making');
  res.making = await C((t) => ({ ...window.__CTX__.menus.making.audit(),
    openLongFrames: (window.__loaf || []).filter((e) => e.t > t - 5 && e.d > 50).map((e) => ({ d: e.d, scripts: e.scripts })) }), tO);
  await page.keyboard.press('Escape');
  await sleep(600);

  // quick-make: hold 1 for 1.3 s; then hold again and take a hit at 0.6 s
  const read = () => C(() => ({ reed: window.__CTX__.combat.ammo.hunter, cane: window.__CTX__.inventory.count('ridge-wood'), feather: window.__CTX__.inventory.count('feather'), state: window.__CTX__.state }));
  res.qm0 = await read();
  await page.keyboard.down('Digit1'); await sleep(1300); await page.keyboard.up('Digit1'); await sleep(300);
  res.qm1 = await read();
  await page.keyboard.down('Digit1'); await sleep(600);
  await C(() => window.__CTX__.events.emit('player-damage', { amount: 1, from: null }));
  await sleep(900); await page.keyboard.up('Digit1'); await sleep(300);
  res.qm2 = await read();
  res.qmAudit = await C(() => ({ made: window.__CTX__.quickslots?.make?.made, interrupted: window.__CTX__.quickslots?.make?.interrupted }));
  log('quick-make', JSON.stringify([res.qm0, res.qm1, res.qm2, res.qmAudit]));

  // M1.6i the Character page: P from play; the header, the eight cards, the locked silhouettes; WEAR swaps rung 1 and 2
  await sleep(600);
  const lensRead = () => C(() => { const c = window.__CTX__.camera, p = window.__CTX__.player;
    return { cam: [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(3)), fov: +c.fov.toFixed(2), heading: +(p.heading ?? 0).toFixed(4), rotY: +p.model.rotation.y.toFixed(4) }; });
  const ch = res.character = { before: await lensRead() };
  await C(() => { window.__ft.length = 0; });
  await page.keyboard.press('KeyP');
  await sleep(1600);
  await shot('07-character');
  ch.open = await C(() => { const M = window.__CTX__.menus; return { hub: M.hubOpen, tab: M.tab, state: window.__CTX__.state, tabs: M.audit().tabs, page: M.character.audit() }; });
  // rung 2 before it is hers: WEAR stays off
  ch.notOwned = await C(async () => { const M = window.__CTX__.menus;
    document.querySelector('.ch-card[data-rung="scout"]')?.click(); await new Promise((r) => setTimeout(r, 200));
    const b = document.querySelector('button.ch-wear'); const on = !!b && !b.disabled; b?.click(); await new Promise((r) => setTimeout(r, 600));
    return { wearOn: on, why: document.querySelector('.ch-why')?.textContent ?? '', armorId: M.character.audit().armorId }; });
  // staged: the quest's reward (systems publish rung 'scout' and 'rung-granted' when Raker's Morning pays)
  await C(() => { const G = window.__CTX__.systemsGame; if (G) G.rung = 'scout'; window.__CTX__.events.emit('rung-granted', { rung: 'scout' }); });
  const wearSwap = async (rung) => {
    const t = await C(() => performance.now());
    await C((r) => { document.querySelector(`.ch-card[data-rung="${r}"]`)?.click(); }, rung);
    await sleep(250);
    const pressed = await C(() => { const b = document.querySelector('button.ch-wear'); const on = !!b && !b.disabled; b?.click(); return on; });
    await page.waitForFunction((r) => window.__CTX__.menus.character.audit().worn === r && !window.__CTX__.menus.character.busy, { timeout: 20000, polling: 50 }, rung).catch(() => {});
    await sleep(1500);
    return C(([r, t0, wasOn]) => { const a = window.__CTX__.menus.character.audit(); const L = window.__CTX__.player.hero.loadout;
      const fr = window.__ft.filter(([tt]) => tt > t0);
      return { rung: r, wearOn: wasOn, worn: a.worn, armorId: a.armorId, perk: L?.perk ?? null, row: window.__CTX__.player.hero.outfit?.row ?? null,
        log: a.log.slice(-1)[0] ?? null, frames: fr.length, over50: fr.filter(([, d]) => d > 50).length, max: fr.reduce((m, f) => Math.max(m, f[1]), 0),
        cards: a.cards.map((c) => `${c.rung}:${c.state}`) }; }, [rung, t, pressed]);
  };
  ch.toRung2 = await wearSwap('scout');
  await shot('08-character-rung2');
  ch.toRung1 = await wearSwap('starter');
  await shot('09-character-rung1');
  ch.toRung2again = await wearSwap('scout');
  ch.page = await C(() => window.__CTX__.menus.character.audit());
  await page.keyboard.press('Escape');
  await sleep(800);
  ch.after = await lensRead();
  ch.closed = await C(() => ({ hub: window.__CTX__.menus.hubOpen, state: window.__CTX__.state }));
  // put her back in rung 1 for the rest of the session
  await C(() => window.__CTX__.player.hero.loadout.equipArmor('pan-1'));
  log('character', JSON.stringify({ open: { tab: ch.open.tab, locked: ch.open.page.locked, silhouettes: ch.open.page.silhouettes, head: ch.open.page.head },
    notOwned: ch.notOwned, toRung2: ch.toRung2, toRung1: ch.toRung1 }));
  res.chromeS = (Date.now() - t0) / 1000;
} catch (e) {
  res.error = String(e?.stack || e).slice(0, 800);
  log('ERROR', res.error);
} finally {
  await done();
  log('done in', (Date.now() - t0) / 1000, 's');
}
