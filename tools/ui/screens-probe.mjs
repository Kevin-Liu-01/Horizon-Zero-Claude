#!/usr/bin/env node
/**
 * THE UI LANE'S SCREENS PROBE (M1.6g2 "every menu is glass" and "the BIBLE §18 rows for these screens each exist
 * with exactly their listed words"; M1.6i's page with the world frosted round its stage).
 *
 * Boots the real page from THIS tree on --port in one headless Chrome under the machine slot (CALIMA_SLOT_HELD=1 when
 * a wrapper holds it), opens every shell screen that has no Frame Set frame, shoots it, and audits it in the page:
 *   title:  EXTRAS (the card), its FIELD MANUAL and CREDITS, SETTINGS from the title
 *   play:   the hub's SATCHEL, FIELD LOG, FIELD BOOKS, SETTINGS (GRAPHICS · CONTROLS · READING · AUDIO), CHARACTER
 *           (the frost cut round the stage), the dialogue lower-third (Ansel), the death card, the context-lost card
 *           (a real WEBGL_lose_context, then its restore), and the unsupported-browser page (?unsupported=1)
 *
 * Per screen: the shot; every listed word of its §18 row found or not in the screen's visible text (innerText, so CSS
 * text-transform counts as shown); the screen's own surface (computed background colour and alpha, backdrop
 * filter); every other visible box over 2000 px² whose background is paper (light, alpha >= 0.5) or margin red;
 * the font families its visible text is set in. Glass is #1E1A28 (30, 26, 40) at 0.90 (BIBLE 18).
 *
 * Writes <review>/runs/<utc>-<commit>-ui-screens-<label>/probe.json and its shots, with the commit and the dirty flag.
 *   node tools/ui/screens-probe.mjs --port 5263 --label fix1
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
const LABEL = arg('--label', 'screens');
const CAP_S = Number(arg('--cap-s', 600));
if (!PORT) { console.error('screens-probe: --port is required'); process.exit(2); }
guardPort?.(PORT);

const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const stamp = utc().replace(/[-:]/g, '');
const OUT = path.join(RUNS, `${stamp}-${commit}${dirty ? '-dirty' : ''}-ui-screens-${LABEL}`);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const log = (...a) => console.log('[screens-probe]', ...a);
const res = { commit, dirty, tree: REPO, port: PORT, label: LABEL, startedAt: utc(), screens: {}, console: [] };

/** BIBLE 18's listed words for each screen this probe opens. */
const WORDS = {
  extras: ['FIELD MANUAL', 'CREDITS'],
  manual: ['FIELD MANUAL'],
  credits: ['CREDITS'],
  satchel: ['ALL', 'WEAPONS', 'TOOLS', 'STORES', 'FIELD BOOKS', 'TRADE'],
  fieldLog: ['FIELD LOG', 'TRACK'],
  fieldBooks: ['FIELD BOOKS'],
  'settings-graphics': ['GRAPHICS'],
  'settings-controls': ['CONTROLS', 'REBIND', 'RESET'],
  'settings-reading': ['READING'],
  'settings-audio': ['AUDIO'],
  'title-settings': ['GRAPHICS', 'CONTROLS', 'READING'],
  character: ['BREA · SALT-PAN RECKONER', 'WEAR'],
  dialogue: [],
  'dialogue-stations': [],
  death: ['THE LINE IS LOST', 'RETURN TO THE LAST BRAZIER', 'QUIT TO TITLE'],
  contextLost: ['DISPLAY RESET · RESUMING'],
  unsupported: ['CALIMA NEEDS WEBGL 2'],
};
/** Words that must NOT show on a shell screen (IP-PRIVATE P2: no level, XP, points or purchase; no rarity tiers). */
const NEVER = ['XP', 'LEVEL UP', 'SKILL POINTS', 'UPGRADE', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'PURCHASE'];

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

if (await portOpen(PORT)) { console.error(`screens-probe: port ${PORT} is busy`); process.exit(3); }
const slot = await takeMachineSlot({ who: `ui screens-probe ${LABEL}`, waitS: 1500, log });
if (!slot.ok) { console.error('screens-probe: no Chrome slot'); process.exit(4); }
const t0 = Date.now();
const capTimer = setTimeout(async () => { res.error = `cap ${CAP_S} s reached`; log('cap reached'); await done(); process.exit(5); }, CAP_S * 1000);
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
    // the in-page audit: words, the surface's glass, paper boxes, fonts
    window.__audit = (rootSel, surfSel, words, never) => {
      const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : document.body;
      if (!root) return { found: false, rootSel };
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
      const text = (root.innerText || '').replace(/\s+/g, ' ').trim();
      const rgba = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
      const surf = surfSel ? document.querySelector(surfSel) : root;
      const scs = surf ? getComputedStyle(surf) : null;
      const sbg = scs ? rgba(scs.backgroundColor) : null;
      const paper = [], red = [];
      const fonts = {};
      for (const e of [root, ...root.querySelectorAll('*')]) {
        if (!vis(e)) continue;
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        const c = rgba(cs.backgroundColor);
        if (c && r.width * r.height > 2000 && c.a >= 0.5) {
          const L = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
          const tag = `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).trim().split(/\s+/).slice(0, 2).join('.')} ${cs.backgroundColor} ${Math.round(r.width)}x${Math.round(r.height)}`;
          if (L > 0.6) paper.push(tag);
          if (c.r > 150 && c.g < 90 && c.b < 90) red.push(tag);
        }
        // the font of every element that carries its own text
        if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
          const f = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
          fonts[f] = (fonts[f] || 0) + 1;
        }
      }
      return {
        found: true, visible: vis(root),
        words: Object.fromEntries((words || []).map((w) => [w, text.includes(w)])),
        never: (never || []).filter((w) => new RegExp(`(^|[^A-Z])${w}([^A-Z]|$)`).test(text)),
        surface: surf ? { sel: surfSel, bg: scs.backgroundColor, rgb: sbg ? [sbg.r, sbg.g, sbg.b] : null, a: sbg?.a ?? null,
          glass: !!sbg && Math.abs(sbg.r - 30) <= 2 && Math.abs(sbg.g - 26) <= 2 && Math.abs(sbg.b - 40) <= 2 && Math.abs(sbg.a - 0.9) < 0.02,
          backdrop: scs.backdropFilter || scs.webkitBackdropFilter || 'none', bgImage: scs.backgroundImage.slice(0, 80) } : null,
        paper, red, fonts, text: text.slice(0, 600),
      };
    };
  });
  const C = (fn, a) => page.evaluate(fn, a);
  const shot = async (name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); log('shot', name); return path.basename(f); };
  /** One screen: shoot it, audit it in the page. */
  const screen = async (name, rootSel, surfSel, extra = null) => {
    const file = await shot(name);
    const a = await C(([r, s, w, n]) => window.__audit(r, s, w, n), [rootSel, surfSel, WORDS[name] ?? [], NEVER]);
    const x = extra ? await C(extra) : null;
    res.screens[name] = { shot: file, ...a, ...(x ? { extra: x } : {}) };
    const miss = Object.entries(a.words || {}).filter(([, v]) => !v).map(([k]) => k);
    log(name, JSON.stringify({ found: a.found, missing: miss, never: a.never, glass: a.surface?.glass, bg: a.surface?.bg, paper: a.paper?.length, red: a.red?.length, fonts: a.fonts }));
    return a;
  };
  const station = (key) => C((k) => [...document.querySelectorAll('.mn-title-item')].find((x) => x.dataset.station === k)?.click(), key);
  const waitPlaying = () => page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 });
  const waitPress = () => page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 240000, polling: 100 });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPress();
  res.bootS = (Date.now() - t0) / 1000;
  await sleep(1500);
  await page.keyboard.press('Enter');
  await sleep(2600);

  // ---- the title's own cards: EXTRAS, the Field Manual, Credits, Settings
  await station('extras');
  await sleep(700);
  await screen('extras', '.mn-modal', '.mn-modal-shell');
  await C(() => document.querySelectorAll('.mn-modal .t2-extra')[0]?.click());
  await sleep(700);
  await screen('manual', '.mn-modal', '.mn-modal-shell');
  await C(() => window.__CTX__.menus.openModal('credits'));
  await sleep(600);
  await screen('credits', '.mn-modal', '.mn-modal-shell');
  await C(() => window.__CTX__.menus.closeModal());
  await sleep(300);
  await station('settings');
  await sleep(700);
  await screen('title-settings', '.mn-modal', '.mn-modal-shell');
  await C(() => window.__CTX__.menus.closeModal());
  await sleep(300);

  // ---- into play
  await station('newGame');
  await sleep(700);
  await C(() => document.querySelector('.mn-tol-begin').click());
  await waitPlaying();
  await sleep(4000);

  // ---- the hub's pages
  const hub = async (tab) => { await C((t) => window.__CTX__.menus.openHub(t), tab); await sleep(1100); };
  await hub('inventory');
  await screen('satchel', '.cal-inv', '.cal-inv-shell', () => ({ tab: window.__CTX__.menus.tab, state: window.__CTX__.state,
    tabs: [...document.querySelectorAll('.cal-inv .cal-inv-pocket')].map((t) => t.innerText.trim()).filter(Boolean) }));
  await hub('quests');
  await screen('fieldLog', '#cal-prog .pg-overlay', '#cal-prog .pg-panel', () => ({ tab: window.__CTX__.menus.tab, state: window.__CTX__.state }));
  await hub('notebook');
  await screen('fieldBooks', '.cal-inv', '.cal-inv-shell', () => ({ tab: window.__CTX__.menus.tab, state: window.__CTX__.state }));
  await hub('settings');
  for (const pg of ['graphics', 'controls', 'reading', 'audio']) {
    await C((p) => window.__CTX__.menus.settingsPanel.showPage(p), pg);
    await sleep(500);
    await screen(`settings-${pg}`, '.mn-hub', '.mn-hub-shell', () => ({ tab: window.__CTX__.menus.tab,
      tabs: [...document.querySelectorAll('.mn-hub .mn-tab')].map((t) => t.querySelector('span')?.textContent ?? '') }));
  }
  await hub('character');
  await sleep(800);
  await screen('character', '.mn-hub', '.ch-left', () => {
    const sc = document.querySelector('.mn-hub-scrim'), cs = getComputedStyle(sc);
    const st = document.querySelector('.ch-stage')?.getBoundingClientRect();
    return { page: window.__CTX__.menus.character.audit().frostCut, scrimOpacity: cs.opacity, scrimBackdrop: cs.backdropFilter, clip: cs.clipPath.slice(0, 160),
      stage: st ? [st.left, st.top, st.right, st.bottom].map(Math.round) : null };
  });
  await C(() => window.__CTX__.menus.closeHub(true));
  await sleep(800);

  // ---- the dialogue lower-third (the systems presenter's #cal-sys .sys-lt): Ansel's first card, then her stations
  const ltRead = () => C(() => {
    const P = window.__CTX__.systemsGame?.present, lt = document.querySelector('#cal-sys .sys-lt'), ln = document.querySelector('#cal-sys .sys-line');
    const lh = ln ? parseFloat(getComputedStyle(ln).lineHeight) : 0;
    return { state: window.__CTX__.state, on: !!lt?.classList.contains('on'), busy: !!P?.busy, who: document.querySelector('#cal-sys .sys-who')?.innerText ?? '',
      lineRows: ln && lh ? Math.round(ln.getBoundingClientRect().height / lh) : null, lineText: ln?.innerText ?? '',
      stations: [...document.querySelectorAll('#cal-sys .sys-st')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()) };
  });
  res.dialogueOpen = await C(() => { const G = window.__CTX__.systemsGame; if (!G?.talk) return false; G.talk('ansel'); return true; });
  await sleep(1400);
  res.dialogueCards = [await ltRead()];
  await screen('dialogue', '#cal-sys', '#cal-sys .sys-lt', ltRead);
  // advance to her stations (at most 12 cards), shooting the first station list
  for (let i = 0; i < 12; i++) {
    const r = await ltRead();
    if (r.stations.length || !r.on) break;
    await C(() => document.querySelector('#cal-sys .sys-lt')?.click());
    await sleep(500);
    res.dialogueCards.push(await ltRead());
  }
  const rs = await ltRead();
  if (rs.stations.length) await screen('dialogue-stations', '#cal-sys', '#cal-sys .sys-lt', ltRead);
  // out: the exit station when there is one, then every card after it
  for (let i = 0; i < 16; i++) {
    const r = await ltRead();
    if (!r.on) break;
    if (r.stations.length) await C(() => { const st = [...document.querySelectorAll('#cal-sys .sys-st')]; st[st.length - 1]?.click(); });
    else await C(() => document.querySelector('#cal-sys .sys-lt')?.click());
    await sleep(400);
  }
  res.dialogueAfter = await ltRead();
  await C(() => { if (window.__CTX__.state !== 'playing' && !window.__CTX__.systemsGame?.present?.busy) window.__CTX__.state = 'playing'; });

  // ---- the death card
  await C(() => { const p = window.__CTX__.player; p.health = 0; window.__CTX__.events.emit('player-died', { from: null }); });
  await page.waitForFunction(() => window.__CTX__.menus.deathState === 'choice', { timeout: 15000, polling: 100 }).catch(() => {});
  await sleep(600);
  await screen('death', '.mn-death', '.mn-death-inner', () => ({ deathState: window.__CTX__.menus.deathState,
    stations: [...document.querySelectorAll('.mn-death-opt b')].map((b) => b.textContent) }));
  await C(() => window.__CTX__.menus.respawn('checkpoint'));
  await page.waitForFunction(() => window.__CTX__.state === 'playing', { timeout: 15000, polling: 100 }).catch(() => {});
  await sleep(2500);

  // ---- the context-lost card: a real loss, then the restore
  res.ctxLoss = await C(async () => {
    const gl = window.__CTX__.renderer.getContext(); const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return { ext: false };
    window.__ctxExt = ext; const t = performance.now(); ext.loseContext();
    await new Promise((r) => setTimeout(r, 900));
    return { ext: true, state: window.__CTX__.state, card: window.__CTX__.menus.contextCard?.audit?.() ?? null, ms: Math.round(performance.now() - t) };
  });
  await screen('contextLost', '.gs-ctx', '.gs-ctx-card');
  res.ctxRestore = await C(async () => {
    const t = performance.now(); window.__ctxExt?.restoreContext();
    for (let i = 0; i < 80 && window.__CTX__.state !== 'playing'; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 1500));
    const vis = document.querySelector('.gs-ctx')?.classList.contains('show');
    return { state: window.__CTX__.state, cardShown: vis, ms: Math.round(performance.now() - t), lost: window.__CTX__.renderer.getContext().isContextLost() };
  });
  await shot('contextRestored');
  log('context', JSON.stringify({ loss: res.ctxLoss, restore: res.ctxRestore }));

  // ---- the unsupported-browser page
  await page.goto(`http://127.0.0.1:${PORT}/?unsupported=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  await screen('unsupported', null, null);
  res.chromeS = (Date.now() - t0) / 1000;
} catch (e) {
  res.error = String(e?.stack || e).slice(0, 800);
  log('ERROR', res.error);
} finally {
  clearTimeout(capTimer);
  await done();
  log('done in', (Date.now() - t0) / 1000, 's');
}
