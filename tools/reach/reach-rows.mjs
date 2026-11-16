#!/usr/bin/env node
/**
 * THE REACH ROWS (BUILD M1.6m, engine lane): one headless Chrome under the machine slot, Vite on --port from THIS tree
 * (run it inside tools/perf/clean-measure.sh so the numbers are a commit's). Rows, in this order (--only picks):
 *
 *   tiers     `high`, `medium`, `low`, `high` again, each booted on its own `?shot=1&q=<tier>` page: console errors at
 *             boot, F02 staged (tools/frames/page.mjs), the frame's GPU+submit ms by the M0.8 back-to-back readback
 *             (tools/perf/attrib-page.mjs finishFrame, 3 x 60 frames, the median of the medians), draw calls, a shot.
 *             Then `medium` and `low` booted as a player boots (`/?q=<tier>`: the title, NEW GAME, BEGIN, 5 s of play)
 *             with their console and system errors. Bar: both boot clean and are no slower than `high`.
 *   settings  in play: FOV (camera.fov follows the slider), FOV punch (0 = the sprint does not widen the view), camera
 *             shake (0 = the camera does not move under a shake), subtitles (off hides the field-turn subtitle), and
 *             HOLD / TOGGLE for aim (RMB), Steady (Shift while aiming) and re-survey (E at a 15 s hold).
 *   pad       the synthetic pad (tools/reach/pad-driver.mjs): every play verb's button, what the input layer made of it
 *             and its effect where one is cheap to read; Start opens the hub, the D-pad moves the focus, B closes it.
 *   ctx       a real WEBGL_lose_context: (a) restored after 1 s: the card, the time to play and to the first frame,
 *             the world moving again, the picture back; (b) never restored: the page reloads by itself and CONTINUE
 *             runs on the last record (where she stands against the record).
 *
 *   node tools/reach/reach-rows.mjs --port 5268 [--only tiers,settings,pad,ctx] [--label x] [--cap-s 840]
 *
 * Writes <review>/runs/<utc>-<commit>[-dirty]-reach-<label>/rows.json and its shots.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { takeMachineSlot, releaseMachineSlot } from '../chrome-slot.mjs';
import { profileDir, disposeProfile, installProfileCleanup, guardPort } from '../chrome-profile.mjs';
import { RUNS } from '../frames/paths.mjs';
import { loadFrameSet } from '../frames/frameset.mjs';
import { stageFrame, unstageFrame } from '../frames/page.mjs';
import { installPad } from './pad-driver.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = guardPort(arg('--port'));
const LABEL = arg('--label', 'engine');
const CAP_S = Number(arg('--cap-s', 840));
const ONLY = new Set((arg('--only', 'tiers,settings,pad,ctx')).split(',').map((s) => s.trim()).filter(Boolean));

const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = process.env.CLEAN_COMMIT || git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '');
const OUT = path.join(RUNS, `${stamp}-${commit}${dirty ? '-dirty' : ''}-reach-${LABEL}`);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const log = (...a) => console.log('[reach]', ...a);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const res = { commit, dirty, tree: REPO, port: PORT, label: LABEL, startedAt: new Date().toISOString(), rows: {}, console: [] };

let vite = null, browser = null, profile = null, current = 'boot';
const done = async () => {
  try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
  if (profile) { try { disposeProfile(profile); } catch { /* */ } }
  releaseMachineSlot(log);
  res.endedAt = new Date().toISOString();
  writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify(res, null, 1));
  log('wrote', path.join(OUT, 'rows.json'));
};

if (await portOpen(PORT)) { console.error(`reach: port ${PORT} is busy`); process.exit(3); }
const slot = await takeMachineSlot({ who: `engine reach-rows ${LABEL}`, waitS: 1800, log });
if (!slot.ok) { console.error('reach: no Chrome slot'); process.exit(4); }
const t0 = Date.now();
const capTimer = setTimeout(async () => { res.error = `cap ${CAP_S} s reached`; log('cap reached'); await done(); process.exit(5); }, CAP_S * 1000);

/** Mean luminance of a PNG (0-255) and its fraction of near-black pixels. */
async function lum(file) {
  const { data, info } = await sharp(file).resize(200, 112, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let s = 0, black = 0;
  for (let i = 0; i < data.length; i += info.channels) { const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; s += y; if (y < 6) black++; }
  const n = data.length / info.channels;
  return { mean: +(s / n).toFixed(1), black: +(black / n).toFixed(3) };
}

try {
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  // as tools/perf/attrib.mjs: no vsync, no frame-rate limit (the GPU is timed by readback, not by rAF)
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 300000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', '--disable-gpu-vsync', '--disable-frame-rate-limit',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  res.chrome = await browser.version();
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  page.on('console', (m) => { if (m.type() === 'error') res.console.push({ at: current, text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => res.console.push({ at: current, text: 'pageerror: ' + String(e).slice(0, 300) }));
  await page.evaluateOnNewDocument(() => {
    // a dead HMR socket: other lanes save files in the shared tree
    const Real = window.WebSocket;
    function Dead() { const t = new EventTarget(); t.readyState = 1; t.send = () => {}; t.close = () => {}; return t; }
    window.WebSocket = function (url, p) { if ((Array.isArray(p) ? p[0] : p) === 'vite-hmr' || String(url).includes('vite')) return Dead(); return new Real(url, p); };
    window.WebSocket.prototype = Real.prototype;
    window.__padOff = true;   // the pad row switches it on
  });
  await page.evaluateOnNewDocument(installPad);
  const C = (fn, ...a) => page.evaluate(fn, ...a);
  const shot = async (name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); return f; };
  const errsAt = (at) => res.console.filter((e) => e.at === at).length;

  /** A player's boot: the title, NEW GAME, BEGIN, play. */
  const playerBoot = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 240000, polling: 100 });
    await sleep(800);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
    await sleep(400);
    await C(() => [...document.querySelectorAll('.mn-title-item')].find((x) => /NEW GAME/.test(x.textContent))?.click());
    await page.waitForSelector('.mn-diff', { timeout: 20000 });
    await C(() => document.querySelector('.mn-diff').click());
    await page.waitForFunction(() => window.__CTX__?.state === 'playing' && window.__CTX__?.spine?.started, { timeout: 90000, polling: 50 });
    await sleep(3000);
    // the opening dialogue or field turn: out of it, as a player is
    for (let i = 0; i < 20 && await C(() => !!window.__CTX__.systemsGame?.present?.busy); i++) { await page.keyboard.press('Space'); await sleep(250); }
  };

  /* ------------------------------------------------------------------ tiers */
  if (ONLY.has('tiers')) {
    current = 'tiers';
    const F02 = loadFrameSet().frames.find((f) => f.id === 'F02');
    const rows = [];
    for (const q of ['high', 'medium', 'low', 'high']) {
      current = `tier-${q}`;
      const tb = Date.now();
      await page.goto(`http://127.0.0.1:${PORT}/?shot=1&q=${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
      const bootS = (Date.now() - tb) / 1000;
      await sleep(4000);
      await C(stageFrame, F02, { settleMs: 2600 });
      const m = await C(async () => {
        const E = window.__CTX__.engine;
        E.setDynamicResolution?.(false);
        const M = await import('/tools/perf/attrib-page.mjs');
        const runs = [];
        for (let i = 0; i < 3; i++) runs.push(await M.finishFrame(E, 60));
        E.render(0);
        const info = E.renderer.info.render;
        return { quality: E.quality, renderScale: E.renderScale, pixelRatio: +E.renderer.getPixelRatio().toFixed(3), runs: runs.map((r) => r.medianMs), p95: runs.map((r) => r.p95Ms),
          submit: runs.map((r) => r.submitMs), calls: info.calls, triangles: info.triangles, systemErrors: (window.__GAME__?.systemErrors || []).map((e) => `${e.key}: ${e.message}`).slice(0, 6) };
      });
      const f = await shot(`tier-${q}-${rows.length}`);
      await C(unstageFrame);
      const row = { tier: q, bootS, ...m, medianMs: med(m.runs), consoleErrors: errsAt(current), shot: path.basename(f) };
      rows.push(row);
      log(`tier ${q}: ${row.medianMs} ms (${m.runs.join(', ')}), ${m.calls} calls, DPR ${m.pixelRatio}, quality ${m.quality}, ${row.consoleErrors} console errors`);
    }
    const high = med([rows[0].medianMs, rows[3].medianMs].concat(rows[0].runs, rows[3].runs));
    const boots = {};
    for (const q of ['medium', 'low']) {
      current = `boot-${q}`;
      try {
        await playerBoot(`http://127.0.0.1:${PORT}/?q=${q}`);
        boots[q] = await C(() => ({ state: window.__CTX__.state, quality: window.__CTX__.engine.quality, systemErrors: (window.__GAME__?.systemErrors || []).map((e) => `${e.key}: ${e.message}`).slice(0, 6) }));
        boots[q].shot = path.basename(await shot(`boot-${q}`));
      } catch (e) { boots[q] = { error: String(e?.message || e).slice(0, 200) }; }
      boots[q].consoleErrors = errsAt(current);
      boots[q].clean = !boots[q].error && boots[q].state === 'playing' && boots[q].quality === q && boots[q].consoleErrors === 0 && !(boots[q].systemErrors?.length);
      log(`boot ${q}: ${JSON.stringify(boots[q])}`);
    }
    const tierRow = (q) => {
      const r = rows.find((x) => x.tier === q);
      return { ms: r.medianMs, vsHigh: +(r.medianMs - high).toFixed(3), noSlower: r.medianMs <= high, frameErrors: r.consoleErrors + r.systemErrors.length, boot: boots[q] };
    };
    res.rows.tiers = { rows, highMs: high, medium: tierRow('medium'), low: tierRow('low'),
      pass: ['medium', 'low'].every((q) => { const t = tierRow(q); return t.noSlower && t.frameErrors === 0 && t.boot?.clean; }) };
    log(`tiers: ${res.rows.tiers.pass ? 'PASS' : 'FAIL'} high ${high} ms, medium ${res.rows.tiers.medium.ms}, low ${res.rows.tiers.low.ms}`);
  }

  /* ------------------------------------------------- one player's game for the rest */
  if (ONLY.has('settings') || ONLY.has('pad') || ONLY.has('ctx')) {
    current = 'play';
    await playerBoot(`http://127.0.0.1:${PORT}/`);
    res.playBootErrors = errsAt('play');
  }

  /* --------------------------------------------------------------- settings */
  if (ONLY.has('settings')) {
    current = 'settings';
    const S = {};
    const set = (id, v) => C((i, x) => window.__CTX__.menus.settings.set(i, x), id, v);
    const settle = (ms) => sleep(ms);
    // FOV
    await set('fov', 80); await settle(1500);
    S.fov = { set: 80, cameraFov: await C(() => +window.__CTX__.camera.fov.toFixed(2)) };
    await set('fov', 55); await settle(1500);
    S.fov.back = await C(() => +window.__CTX__.camera.fov.toFixed(2));
    S.fov.pass = Math.abs(S.fov.cameraFov - 80) < 1.5 && Math.abs(S.fov.back - 55) < 1.5;
    // FOV punch: the sprint's widening
    const sprintFov = async () => { await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await sleep(1800);
      const r = await C(() => ({ fov: +window.__CTX__.camera.fov.toFixed(2), base: window.__CTX__.player.fovBase, sprinting: !!window.__CTX__.player.sprinting }));
      await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await sleep(1500); return r; };
    await set('fovPunch', 0);
    const p0 = await sprintFov();
    await set('fovPunch', 1);
    const p1 = await sprintFov();
    S.fovPunch = { off: p0, on: p1, pass: p0.sprinting && p1.sprinting && p0.fov - p0.base < 0.5 && p1.fov - p1.base > 2.5 };
    // camera shake: the camera's spread over 20 frames of a full shake, standing still
    const shakeSpread = () => C(async () => {
      const C2 = window.__CTX__, cam = C2.camera, raf = () => new Promise((r) => requestAnimationFrame(r));
      await raf(); await raf();
      const pts = [];
      C2.player._shake = 1;
      for (let i = 0; i < 20; i++) { await raf(); pts.push(cam.position.clone()); }
      const m = pts.reduce((a, p) => a.add(p), cam.position.clone().set(0, 0, 0)).multiplyScalar(1 / pts.length);
      return +Math.max(...pts.map((p) => p.distanceTo(m))).toFixed(4);
    });
    await sleep(800);
    await set('cameraShake', 1);
    const sh1 = await shakeSpread();
    await sleep(1500);
    await set('cameraShake', 0);
    const sh0 = await shakeSpread();
    await set('cameraShake', 1);
    S.shake = { at1: sh1, at0: sh0, pass: sh0 < 0.005 && sh1 > 0.02 };
    // subtitles
    const sub = () => C(() => { const e = document.querySelector('#cal-sys .sys-subt'); const cs = e ? getComputedStyle(e) : null; return { display: cs?.display ?? null, text: e?.textContent?.slice(0, 60) ?? null }; });
    await C(() => window.__CTX__.systemsGame?.present?.subtitle?.(['The reach rows speak one line.'], 'brea'));
    await sleep(500);
    const subOn = await sub();
    await set('subtitles', false); await sleep(200);
    const subOff = await sub();
    await set('subtitles', true);
    S.subtitles = { on: subOn, off: subOff, pass: subOn.display !== 'none' && !!subOn.text && subOff.display === 'none' };
    // HOLD / TOGGLE: aim
    const aiming = () => C(() => !!window.__CTX__.player.aiming);
    const latches = () => C(() => window.__CTX__.input.latches());
    await page.mouse.move(800, 450);
    await set('holdAim', 'toggle');
    await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' }); await sleep(600);
    const aT1 = { aiming: await aiming(), latches: await latches() };
    // Steady in TOGGLE, while the aim is latched: one Shift press
    await set('holdSteady', 'toggle');
    await page.keyboard.down('ShiftLeft'); await sleep(120); await page.keyboard.up('ShiftLeft'); await sleep(1000);
    const stT = await C(() => ({ active: !!window.__CTX__.combat?.steady?.active, latches: window.__CTX__.input.latches() }));
    await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' }); await sleep(600);
    const aT2 = { aiming: await aiming(), latches: await latches(), steady: await C(() => !!window.__CTX__.combat?.steady?.active) };
    await set('holdAim', 'hold'); await set('holdSteady', 'hold');
    await page.mouse.down({ button: 'right' }); await sleep(600);
    await page.keyboard.down('ShiftLeft'); await sleep(120); await page.keyboard.up('ShiftLeft'); await sleep(800);
    const stH = await C(() => !!window.__CTX__.combat?.steady?.active);
    await page.mouse.up({ button: 'right' }); await sleep(600);
    const aH = await aiming();
    S.holdAim = { toggle: { afterTap: aT1, afterSecondTap: aT2 }, hold: { afterRelease: aH }, pass: aT1.aiming && !aT2.aiming && !aH && !aT2.latches.length };
    S.holdSteady = { toggle: stT, hold: { afterRelease: stH }, pass: stT.active && stT.latches.some((l) => l.why === 'steady') && !stH && !aT2.steady };
    // re-survey: a 15 s hold in front of her
    await C(() => { const C2 = window.__CTX__, p = C2.player.position;
      window.__rsEntry = C2.interactables.register({ position: p.clone(), radius: 3, hold: 15, label: 'RE-SURVEY', once: true, onInteract: () => { window.__rsDone = true; } }); });
    await sleep(300);
    const prog = () => C(() => +(window.__CTX__.interactables.current?.holdProgress ?? 0).toFixed(3));
    await set('holdResurvey', 'toggle');
    await page.keyboard.down('KeyE'); await sleep(120); await page.keyboard.up('KeyE'); await sleep(2000);
    const rT = { progress: await prog(), latches: await latches() };
    await page.keyboard.down('KeyE'); await sleep(120); await page.keyboard.up('KeyE'); await sleep(400);
    const rT2 = { progress: await prog(), latches: await latches() };
    await set('holdResurvey', 'hold');
    await page.keyboard.down('KeyE'); await sleep(1000); await page.keyboard.up('KeyE'); await sleep(400);
    const rH = await prog();
    await C(() => { window.__CTX__.interactables.unregister(window.__rsEntry); });
    S.holdResurvey = { toggle: { after2s: rT, afterSecondPress: rT2 }, hold: { afterRelease: rH }, pass: rT.progress > 0.1 && rT.latches.some((l) => l.why === 'resurvey') && rT2.progress < 0.02 && !rT2.latches.length && rH < 0.02 };
    S.panel = await C(() => [...document.querySelectorAll('.mn-set-pending')].length);
    S.pass = ['fov', 'fovPunch', 'shake', 'subtitles', 'holdAim', 'holdSteady', 'holdResurvey'].every((k) => S[k].pass);
    S.errors = errsAt('settings');
    res.rows.settings = S;
    log(`settings: ${S.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(Object.fromEntries(Object.entries(S).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => [k, v.pass])))}`);
  }

  /* -------------------------------------------------------------------- pad */
  if (ONLY.has('pad')) {
    current = 'pad';
    await C(() => { window.__pad.on = true; });
    await sleep(1200);
    const frame = () => C(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const press = async (b, ms = 150) => { await C((i) => window.__pad.set(i, 1), b); await frame(); await sleep(ms); await C((i) => window.__pad.set(i, 0), b); await frame(); await sleep(120); };
    const lastCode = () => C(() => window.__CTX__.input.padLog.at(-1)?.code ?? null);
    const P = { connected: await C(() => window.__CTX__.input.gamepad.connected), verbs: {} };
    const verb = async (name, b, want, effect = null, ms = 150) => {
      await press(b, ms);
      const code = await lastCode();
      const eff = effect ? await C(effect) : null;
      P.verbs[name] = { button: b, code, want, effect: eff, pass: code === want && (eff == null || eff === true || (typeof eff === 'object' && eff.ok !== false)) };
    };
    await verb('interact X', 2, 'KeyE');
    await verb('Alidade D-up', 12, 'KeyV', () => !!window.__CTX__.sighting?.on);
    await sleep(500);
    await verb('bearing R3 (Sighting)', 11, 'KeyT');
    await verb('Alidade down D-up', 12, 'KeyV', () => !window.__CTX__.sighting?.on);
    await sleep(500);
    await verb('crouch R3', 11, 'KeyC', () => !!window.__CTX__.player.crouching);
    await verb('stand R3', 11, 'KeyC', () => !window.__CTX__.player.crouching);
    await verb('Gourd D-down', 13, 'KeyQ');
    await verb('whistle D-left', 14, 'KeyG');
    await verb('hook-rip Y', 3, 'KeyR');
    await verb('cast RB', 5, 'KeyF');
    await verb('Kit Rack LB', 4, 'Tab');
    await verb('sprint L3', 10, 'ShiftLeft');
    await verb('jump A', 0, 'Space');
    await sleep(800);
    await verb('dodge B', 1, 'ControlLeft');
    await sleep(800);
    await verb('slot tap D-right', 15, 'Digit2', null, 90);
    await sleep(1400);
    P.verbs['slot tap D-right'].effect = await C(() => window.__CTX__.quickslots?.activeSlot ?? null);
    P.verbs['slot tap D-right'].pass &&= P.verbs['slot tap D-right'].effect === 2;
    await verb('plant A (guarding)', 0, 'KeyX', null, 150);
    // (the guard needs the aim held with the lance in hand)
    await C((i) => window.__pad.set(i, 1), 6); await frame(); await sleep(500);
    await press(0);
    P.verbs['plant A (guarding)'] = { button: 0, code: await lastCode(), want: 'KeyX', guarding: await C(() => window.__CTX__.input.hooks.guarding()), pass: (await lastCode()) === 'KeyX' };
    await C((i) => window.__pad.set(i, 0), 6); await frame(); await sleep(500);
    await verb('slot tap D-right back', 15, 'Digit1', null, 90);
    await sleep(1400);
    P.verbs['slot tap D-right back'].effect = await C(() => window.__CTX__.quickslots?.activeSlot ?? null);
    P.verbs['slot tap D-right back'].pass &&= P.verbs['slot tap D-right back'].effect === 1;
    // hold D-right: the slot in hand held (quick-make runs on its own 1.2 s)
    await C(() => { window.__qm0 = window.__CTX__.quickslots?.make?.made ?? 0; window.__qmi0 = window.__CTX__.quickslots?.lastMake ?? null; });
    await press(15, 1800);
    P.verbs['quick-make hold D-right'] = { button: 15, code: await lastCode(), want: 'Digit1',
      effect: await C(() => ({ made: window.__CTX__.quickslots?.make?.made ?? null, lastMake: window.__CTX__.quickslots?.lastMake ?? null })) };
    P.verbs['quick-make hold D-right'].pass = P.verbs['quick-make hold D-right'].code === 'Digit1' && !!P.verbs['quick-make hold D-right'].effect.lastMake;
    // aim (LT), the arrow type with LT held (D-right / D-left), loose (RT)
    await C((i) => window.__pad.set(i, 1), 6); await frame(); await sleep(700);
    const aimOn = await C(() => !!window.__CTX__.player.aiming);
    const ammo0 = await C(() => window.__CTX__.combat?.activeWeapon?.activeAmmo ?? null);
    await press(15);
    const ammoX = { code: await lastCode(), ammo: await C(() => window.__CTX__.combat?.activeWeapon?.activeAmmo ?? null) };
    await press(14);
    const ammoZ = { code: await lastCode(), ammo: await C(() => window.__CTX__.combat?.activeWeapon?.activeAmmo ?? null) };
    await C((i) => window.__pad.set(i, 1), 7); await frame(); await sleep(400);
    const drawing = await C(() => window.__CTX__.input.mouseDown(0));
    await C((i) => window.__pad.set(i, 0), 7); await frame(); await sleep(300);
    await C((i) => window.__pad.set(i, 0), 6); await frame(); await sleep(500);
    const aimOff = await C(() => !window.__CTX__.player.aiming);
    P.verbs['aim LT, arrow type, loose RT'] = { aimOn, ammo0, ammoX, ammoZ, drawing, aimOff,
      pass: aimOn && ammoX.code === 'KeyX' && ammoZ.code === 'KeyZ' && drawing && aimOff };
    // the hub: Start opens it, the D-pad moves the focus, RB turns the tab, B closes it
    await press(9);
    await sleep(900);
    const hubOpen = await C(() => !!window.__CTX__.menus.hubOpen);
    const tab0 = await C(() => window.__CTX__.menus.tab);
    await press(5); await sleep(700);
    const tab1 = await C(() => window.__CTX__.menus.tab);
    await press(13); await sleep(200);
    const focus = await C(() => { const e = document.querySelector('.cal-pad-focus'); return e ? `${e.tagName.toLowerCase()}.${e.className.split(' ')[0]} ${e.textContent.trim().slice(0, 30)}` : null; });
    const fShot = await shot('pad-hub-focus');
    await press(1); await sleep(900);
    const hubClosed = await C(() => !window.__CTX__.menus.hubOpen && window.__CTX__.state === 'playing');
    await press(8); await sleep(900);
    const mapTab = await C(() => ({ open: !!window.__CTX__.menus.hubOpen, tab: window.__CTX__.menus.tab }));
    await press(1); await sleep(900);
    P.hub = { hubOpen, tab0, tab1, focus, shot: path.basename(fShot), hubClosed, map: mapTab, closedAgain: await C(() => !window.__CTX__.menus.hubOpen),
      pass: hubOpen && tab1 !== tab0 && !!focus && hubClosed && mapTab.open && mapTab.tab === 'map' };
    P.log = await C(() => window.__CTX__.input.padLog.slice());
    P.pass = P.connected && Object.values(P.verbs).every((v) => v.pass) && P.hub.pass;
    P.errors = errsAt('pad');
    await C(() => { window.__pad.on = false; });
    await sleep(800);
    res.rows.pad = P;
    log(`pad: ${P.pass ? 'PASS' : 'FAIL'} ${Object.entries(P.verbs).filter(([, v]) => !v.pass).map(([k, v]) => `${k} -> ${v.code}`).join('; ') || 'every verb'}; hub ${P.hub.pass}`);
  }

  /* -------------------------------------------------------------------- ctx */
  if (ONLY.has('ctx')) {
    current = 'ctx';
    const X = {};
    await C(() => { if (window.__CTX__.state !== 'playing') window.__CTX__.state = 'playing'; });
    await sleep(500);
    const before = await shot('ctx-0-before');
    X.before = await lum(before);
    // (a) lost, restored after 1 s
    X.lost = await C(async () => {
      const gl = window.__CTX__.renderer.getContext(); const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return { ext: false };
      window.__ctxExt = ext; window.__ctxT0 = performance.now(); ext.loseContext();
      await new Promise((r) => setTimeout(r, 1000));
      return { ext: true, state: window.__CTX__.state, card: window.__CTX__.menus.contextCard?.audit?.() ?? null, engineLost: window.__CTX__.engine.contextLost };
    });
    X.lostShot = path.basename(await shot('ctx-1-lost'));
    X.restore = await C(async () => {
      const C2 = window.__CTX__, E = C2.engine, t = performance.now(), sim0 = E.simTime, f0 = E.frames;
      window.__ctxExt.restoreContext();
      let playingMs = null, firstFrameMs = null;
      for (let i = 0; i < 400; i++) {
        await new Promise((r) => setTimeout(r, 25));
        if (playingMs == null && C2.state === 'playing') playingMs = Math.round(performance.now() - t);
        const ff = E.contextLog.find((l) => l.what === 'first-frame' && l.t >= t);
        if (ff && firstFrameMs == null) firstFrameMs = Math.round(ff.t - t);
        if (playingMs != null && firstFrameMs != null) break;
      }
      await new Promise((r) => setTimeout(r, 1500));
      return { playingMs, firstFrameMs, firstFrameCostMs: E.contextLog.filter((l) => l.what === 'first-frame').at(-1)?.ms ?? null,
        simAdvanced: +(E.simTime - sim0).toFixed(2), framesAdvanced: E.frames - f0, lostNow: C2.renderer.getContext().isContextLost(),
        card: document.querySelector('.gs-ctx')?.classList.contains('show') ?? null, state: C2.state, log: E.contextLog.slice(-4), restores: E.contextRestores };
    });
    // she moves again
    const p0 = await C(() => ({ x: window.__CTX__.player.position.x, z: window.__CTX__.player.position.z }));
    await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW'); await sleep(300);
    const p1 = await C(() => ({ x: window.__CTX__.player.position.x, z: window.__CTX__.player.position.z }));
    X.restore.moved = +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2);
    const after = await shot('ctx-2-restored');
    X.after = await lum(after);
    X.restore.pass = X.lost.ext && X.lost.state === 'context-lost' && X.lost.card?.visible && X.restore.state === 'playing' && !X.restore.lostNow && !X.restore.card
      && X.restore.firstFrameMs != null && X.restore.firstFrameMs <= 5000 && X.restore.moved > 0.5 && X.after.black < 0.5 && X.after.mean > X.before.mean * 0.5;
    log(`ctx restore: ${X.restore.pass ? 'PASS' : 'FAIL'} ${JSON.stringify({ playingMs: X.restore.playingMs, firstFrameMs: X.restore.firstFrameMs, cost: X.restore.firstFrameCostMs, moved: X.restore.moved, before: X.before, after: X.after })}`);
    // (b) lost and never restored: the page reloads by itself; CONTINUE runs on the last record
    await C(() => window.__CTX__.progression.save('reach-probe'));
    await sleep(800);
    X.record = await C(() => { const S = window.__CTX__.progression.saves.store, n = S.continueSlot(), r = n ? S.latest(n) : null; const p = window.__CTX__.player.position;
      return { slot: n, pos: r?.pos ?? r?.player?.position ?? null, at: { x: p.x, y: p.y, z: p.z }, stage: window.__CTX__.spine.current()?.id ?? null }; });
    const tl = Date.now();
    const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).then(() => Date.now()).catch(() => null);
    await C(() => { const gl = window.__CTX__.renderer.getContext(); gl.getExtension('WEBGL_lose_context').loseContext(); });
    const tNav = await nav;
    X.reload = { reloadAfterMs: tNav ? tNav - tl : null };
    if (tNav) {
      current = 'ctx-reload';
      const ok = await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 180000, polling: 100 }).then(() => true).catch(() => false);
      X.reload.playingAfterMs = ok ? Date.now() - tl : null;
      await sleep(1500);
      X.reload.after = await C(() => { const p = window.__CTX__.player.position; return { state: window.__CTX__.state, at: { x: p.x, y: p.y, z: p.z }, stage: window.__CTX__.spine.current()?.id ?? null,
        loadedFrom: window.__CTX__.progression.saves.loadedFrom ?? null }; });
      X.reload.dxz = +Math.hypot(X.reload.after.at.x - X.record.at.x, X.reload.after.at.z - X.record.at.z).toFixed(3);
      X.reload.shot = path.basename(await shot('ctx-3-reloaded'));
      X.reload.errors = errsAt('ctx-reload');
    }
    X.reload.pass = !!tNav && X.reload.reloadAfterMs <= 6500 && X.reload.after?.state === 'playing' && X.reload.after.stage === X.record.stage && X.reload.dxz < 1.0;
    log(`ctx reload: ${X.reload.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(X.reload)}`);
    X.pass = X.restore.pass && X.reload.pass;
    res.rows.ctx = X;
  }
  res.chromeS = (Date.now() - t0) / 1000;
} catch (e) {
  res.error = String(e?.stack || e).slice(0, 1200);
  log('ERROR', res.error);
} finally {
  clearTimeout(capTimer);
  await done();
  log('done in', (Date.now() - t0) / 1000, 's');
}
