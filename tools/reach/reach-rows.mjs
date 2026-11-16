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
 *   slider    (round 2) the title's SETTINGS: every slider's value whole inside its row and the panel.
 * Round 2: tiers run INTERLEAVED (--rounds, default 5, the order turned each round), per run draws, triangles and the
 * meadow's submitted triangles; pad drives the RIGHT STICK (axes 2 and 3) and walks a leg steered by it alone; ctx
 * compares the restored frame with the frame before the loss (same pose, she has not moved) and the restored frame
 * with the reloaded one (same pose: the record is taken where it was shot), by crop dE2000 (tools/reach/crop-de.mjs).
 *
 *   node tools/reach/reach-rows.mjs --port 5268 [--only tiers,settings,pad,ctx,slider] [--rounds 5] [--label x] [--cap-s 840]
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
import { installPad, stickFace, stickRelease } from './pad-driver.mjs';
import { cropDE, worstDE, CTX_CROPS } from './crop-de.mjs';

/** Round 2 (the judge's fix list 1 and 9): the restored picture against the same pose, by crop. A crop's mean colour may
 *  move <= 3 dE2000 (about the just-noticeable step) and its per-pixel mean <= 8 (the idle, the grass and the clouds move
 *  between two shots); at d028675 the restored frame was 19-20 dE off the reload in both ground crops. */
const CTX_DE_MEANS = 3, CTX_DE_PIX = 8;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = guardPort(arg('--port'));
const LABEL = arg('--label', 'engine');
const CAP_S = Number(arg('--cap-s', 840));
const ROUNDS = Number(arg('--rounds', 5)), NRUNS = Number(arg('--runs', 3));
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
  const playerBoot = async (url, atMenu = null) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 240000, polling: 100 });
    await sleep(800);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
    await sleep(400);
    if (atMenu) await atMenu();
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
    // round 2 (fix list 4): INTERLEAVED, ROUNDS rounds of the three tiers, the order turned each round (H M L, M L H,
    // L H M, ...), each a fresh page; per run its draws, triangles, programs and seconds since the page was ready, so a
    // slow run can be explained by what the page was doing
    const ORDERS = [['high', 'medium', 'low'], ['medium', 'low', 'high'], ['low', 'high', 'medium']];
    for (let round = 0; round < ROUNDS; round++) {
      for (const q of ORDERS[round % 3]) {
        current = `tier-${q}`;
        const tb = Date.now();
        await page.goto(`http://127.0.0.1:${PORT}/?shot=1&q=${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
        const bootS = (Date.now() - tb) / 1000;
        await C(() => { window.__readyAt = performance.now(); });
        await sleep(4000);
        await C(stageFrame, F02, { settleMs: 2600 });
        const m = await C(async (nRuns) => {
          const E = window.__CTX__.engine;
          E.setDynamicResolution?.(false);
          const M = await import('/tools/perf/attrib-page.mjs');
          const runs = [];
          for (let i = 0; i < nRuns; i++) {
            const r = await M.finishFrame(E, 60);
            E.render(0);
            const info = E.renderer.info;
            runs.push({ ms: r.medianMs, p95: r.p95Ms, submit: r.submitMs, calls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length ?? null,
              geometries: info.memory.geometries, textures: info.memory.textures, atS: +((performance.now() - window.__readyAt) / 1000).toFixed(1),
              meadowTris: (() => { try { return window.__CTX__.vegetation?.meadow?.stats?.(undefined, { drawn: false })?.submittedTris ?? null; } catch { return null; } })() });
          }
          const info = E.renderer.info.render;
          const mead = window.__CTX__.vegetation?.meadow ?? null;
          return { quality: E.quality, renderScale: E.renderScale, pixelRatio: +E.renderer.getPixelRatio().toFixed(3), runs, calls: info.calls, triangles: info.triangles,
            meadowRings: mead?.ringTable?.map?.((r) => [r.rIn, r.rOut]) ?? null,
            systemErrors: (window.__GAME__?.systemErrors || []).map((e) => `${e.key}: ${e.message}`).slice(0, 6) };
        }, NRUNS);
        const f = round === 0 || round === ROUNDS - 1 ? await shot(`tier-${q}-r${round}`) : null;
        await C(unstageFrame);
        const row = { tier: q, round, bootS, ...m, medianMs: med(m.runs.map((r) => r.ms)), consoleErrors: errsAt(current), shot: f && path.basename(f) };
        rows.push(row);
        log(`tier ${q} round ${round}: ${row.medianMs} ms (${m.runs.map((r) => `${r.ms}@${r.atS}s ${r.calls}c ${(r.triangles / 1e6).toFixed(2)}M mead ${r.meadowTris}`).join(', ')}), DPR ${m.pixelRatio}, rings ${JSON.stringify(m.meadowRings)}, ${row.consoleErrors} console errors`);
      }
    }
    // per tier: the median and the spread of the per-page medians (each page's runs' median), and of every run
    const stat = (a) => { const s = a.slice().sort((x, y) => x - y); return { median: med(s), min: s[0], max: s.at(-1), iqr: [s[Math.floor(s.length * 0.25)], s[Math.floor(s.length * 0.75)]], n: s.length }; };
    const byTier = Object.fromEntries(['high', 'medium', 'low'].map((q) => {
      const R = rows.filter((r) => r.tier === q);
      return [q, { pages: stat(R.map((r) => r.medianMs)), runs: stat(R.flatMap((r) => r.runs.map((x) => x.ms))), triangles: stat(R.flatMap((r) => r.runs.map((x) => x.triangles))),
        calls: stat(R.flatMap((r) => r.runs.map((x) => x.calls))), slowRuns: R.flatMap((r) => r.runs.map((x, i) => ({ round: r.round, run: i, ...x }))).filter((x) => x.ms > 16) }];
    }));
    const high = byTier.high.pages.median;
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
      const R = rows.filter((x) => x.tier === q), T = byTier[q];
      // no slower: the tier's median page is at or under high's, and its upper quartile does not reach past high's
      return { ms: T.pages.median, spread: T.pages, vsHigh: +(T.pages.median - high).toFixed(3), noSlower: T.pages.median <= high && T.pages.iqr[1] <= byTier.high.pages.iqr[1],
        frameErrors: R.reduce((s2, r) => s2 + r.consoleErrors + r.systemErrors.length, 0), boot: boots[q] };
    };
    res.rows.tiers = { rounds: ROUNDS, runsPerPage: NRUNS, rows, byTier, highMs: high, medium: tierRow('medium'), low: tierRow('low'),
      pass: ['medium', 'low'].every((q) => { const t = tierRow(q); return t.noSlower && t.frameErrors === 0 && t.boot?.clean; }) };
    log(`tiers: ${res.rows.tiers.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(Object.fromEntries(Object.entries(byTier).map(([q, T]) => [q, { pages: T.pages, tris: T.triangles.median, slow: T.slowRuns.length }])))}`);
  }

  /* ------------------------------------------------- one player's game for the rest */
  if (ONLY.has('settings') || ONLY.has('pad') || ONLY.has('ctx') || ONLY.has('slider')) {
    current = 'play';
    // round 2 (fix list 7): the title's SETTINGS, graphics page: every slider's value is whole inside its row and the panel
    const slider = ONLY.has('slider') ? async () => {
      await C(() => [...document.querySelectorAll('.mn-title-item')].find((x) => /SETTINGS/.test(x.textContent))?.click());
      await page.waitForSelector('.mn-modal .mn-set-row.slider', { timeout: 15000 }).catch(() => null);
      await sleep(700);
      const S = await C(() => {
        const panel = document.querySelector('.mn-modal .mn-modal-shell') || document.querySelector('.mn-modal');
        const pr = panel?.getBoundingClientRect();
        return [...document.querySelectorAll('.mn-modal .mn-set-row.slider')].filter((r) => r.offsetParent).map((r) => {
          const v = r.querySelector('.mn-set-val'), vr = v.getBoundingClientRect(), rr = r.getBoundingClientRect();
          return { label: r.querySelector('.mn-set-label')?.childNodes[0]?.textContent?.trim(), text: v.textContent, clipped: v.scrollWidth > v.clientWidth + 0.5,
            outOfRow: vr.right > rr.right + 0.5, outOfPanel: pr ? vr.right > pr.right - 1 : null, valRight: Math.round(vr.right), rowRight: Math.round(rr.right), panelRight: pr ? Math.round(pr.right) : null };
        });
      });
      const f = await shot('title-settings');
      res.rows.slider = { rows: S, shot: path.basename(f), pass: S.length >= 3 && S.every((x) => !x.clipped && !x.outOfRow && x.outOfPanel === false) };
      log(`title settings sliders: ${res.rows.slider.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(S.map((x) => `${x.label}=${x.text}${x.clipped || x.outOfRow || x.outOfPanel ? ' CLIPPED' : ''}`))}`);
      await page.keyboard.press('Escape'); await sleep(600);
      if (await C(() => !!document.querySelector('.mn-modal .mn-set-row'))) { await page.keyboard.press('Escape'); await sleep(600); }
    } : null;
    await playerBoot(`http://127.0.0.1:${PORT}/`, slider);
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
    // (A plants the Windwall while guarding: the Windwall is Oro's kit, Milestone 2; until then nothing guards and A is
    // the jump. The mapping itself is in tools/reach/input-pad.test.mjs)
    await verb('slot tap D-right back', 15, 'Digit1', null, 90);
    await sleep(1400);
    P.verbs['slot tap D-right back'].effect = await C(() => window.__CTX__.quickslots?.activeSlot ?? null);
    P.verbs['slot tap D-right back'].pass &&= P.verbs['slot tap D-right back'].effect === 1;
    // hold D-right: the slot in hand held (quick-make runs on its own 1.2 s)
    // (the bow in hand: slot 1 is the slot that makes)
    for (let i = 0; i < 3 && await C(() => (window.__CTX__.quickslots?.activeSlot ?? 1) !== 1); i++) { await press(15, 90); await sleep(1200); }
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
    // round 2 (fix list 5): the RIGHT STICK. (a) axes 2 and 3 move the camera's yaw and pitch, and a centred stick
    // holds them; (b) a walked leg steered by the stick alone: a point 8 m off to her right, the left stick forward,
    // stickFace every 120 ms (the runner never writes camYaw)
    {
      const look = () => C(() => ({ yaw: +window.__CTX__.player.camYaw.toFixed(4), pitch: +window.__CTX__.player.camPitch.toFixed(4) }));
      const S = { l0: await look() };
      await C(() => window.__pad.axis(2, 0.85)); await sleep(700); await C(() => window.__pad.axis(2, 0)); await sleep(250);
      S.l1 = await look();
      await sleep(400);
      S.l1b = await look();
      await C(() => window.__pad.axis(3, 0.85)); await sleep(350); await C(() => window.__pad.axis(3, 0)); await sleep(250);
      S.l2 = await look();
      await C(() => window.__pad.axis(3, -0.85)); await sleep(350); await C(() => window.__pad.axis(3, 0)); await sleep(250);
      S.l3 = await look();
      S.dyaw = +(S.l1.yaw - S.l0.yaw).toFixed(3); S.heldYaw = +Math.abs(S.l1b.yaw - S.l1.yaw).toFixed(4);
      S.dpitchDown = +(S.l2.pitch - S.l1b.pitch).toFixed(3); S.dpitchUp = +(S.l3.pitch - S.l2.pitch).toFixed(3);
      S.axesPass = Math.abs(S.dyaw) > 0.3 && S.heldYaw < 0.01 && Math.abs(S.dpitchDown) > 0.05 && Math.abs(S.dpitchUp) > 0.05 && Math.sign(S.dpitchDown) !== Math.sign(S.dpitchUp);
      // (b) the leg
      const tgt = await C(() => { const p = window.__CTX__.player, y = p.camYaw - Math.PI / 2;   // her right
        return { x: p.position.x - Math.sin(y) * 8, z: p.position.z - Math.cos(y) * 8, yaw0: p.camYaw }; });
      await C(() => window.__pad.axis(1, -1));
      const errs = [];
      let d = null;
      const tw = Date.now();
      while (Date.now() - tw < 7000) {
        errs.push(await stickFace(page, tgt.x, tgt.z));
        await sleep(120);
        d = await C((x, z) => Math.hypot(window.__CTX__.player.position.x - x, window.__CTX__.player.position.z - z), tgt.x, tgt.z);
        if (d < 1.5) break;
      }
      await C(() => window.__pad.axis(1, 0)); await stickRelease(page); await sleep(400);
      S.leg = { target: tgt, reachedM: +d.toFixed(2), seconds: +((Date.now() - tw) / 1000).toFixed(1), steps: errs.length, firstErr: errs[0], turnedRad: +(await C(() => window.__CTX__.player.camYaw)).toFixed(3) - tgt.yaw0,
        lastErrs: errs.slice(-4), stickSteps: await C(() => window.__pad.stickSteps || 0) };
      S.legPass = d < 1.5 && Math.abs(errs[0]) > 1.0 && S.leg.stickSteps >= errs.length;
      S.pass = S.axesPass && S.legPass;
      P.stick = S;
      log(`pad right stick: ${S.pass ? 'PASS' : 'FAIL'} ${JSON.stringify({ dyaw: S.dyaw, held: S.heldYaw, dpitch: [S.dpitchDown, S.dpitchUp], leg: { reached: S.leg.reachedM, s: S.leg.seconds, firstErr: S.leg.firstErr } })}`);
    }
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
    // B backs out one layer at a time (a lane's panel first, then the hub), as Escape does
    let backs = 0;
    for (; backs < 3 && await C(() => !!window.__CTX__.menus.hubOpen); backs++) { await press(1); await sleep(900); }
    const hubClosed = await C(() => !window.__CTX__.menus.hubOpen && window.__CTX__.state === 'playing');
    await press(8); await sleep(900);
    const mapTab = await C(() => ({ open: !!window.__CTX__.menus.hubOpen, tab: window.__CTX__.menus.tab }));
    for (let i = 0; i < 3 && await C(() => !!window.__CTX__.menus.hubOpen); i++) { await press(1); await sleep(900); }
    P.hub = { hubOpen, tab0, tab1, focus, shot: path.basename(fShot), hubClosed, backs, map: mapTab, closedAgain: await C(() => !window.__CTX__.menus.hubOpen),
      pass: hubOpen && tab1 !== tab0 && !!focus && hubClosed && mapTab.open && mapTab.tab === 'map' };
    P.log = await C(() => window.__CTX__.input.padLog.slice());
    P.pass = P.connected && Object.values(P.verbs).every((v) => v.pass) && P.hub.pass && !!P.stick?.pass;
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
    // she stands; the HUD is revealed (a calm HUD fades its column, which no crop reads, but the shots then pair)
    await sleep(2500);
    const before = await shot('ctx-0-before');
    X.before = await lum(before);
    X.poseBefore = await C(() => { const p = window.__CTX__.player; return { x: p.position.x, z: p.position.z, yaw: p.camYaw, pitch: p.camPitch }; });
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
      await new Promise((r) => setTimeout(r, 2500));
      return { playingMs, firstFrameMs, firstFrameCostMs: E.contextLog.filter((l) => l.what === 'first-frame').at(-1)?.ms ?? null,
        rebuilt: E.contextLog.filter((l) => l.what === 'rebuilt').at(-1) ?? null, farRedraws: C2.terrain?._far?.redraws ?? null,
        simAdvanced: +(E.simTime - sim0).toFixed(2), framesAdvanced: E.frames - f0, lostNow: C2.renderer.getContext().isContextLost(),
        card: document.querySelector('.gs-ctx')?.classList.contains('show') ?? null, state: C2.state, log: E.contextLog.slice(-5), restores: E.contextRestores };
    });
    // round 2 (fix list 9): the restored picture against the one before the loss, at the SAME pose (she has not moved)
    const still = await shot('ctx-2a-restored-still');
    X.poseStill = await C(() => { const p = window.__CTX__.player; return { x: p.position.x, z: p.position.z, yaw: p.camYaw, pitch: p.camPitch }; });
    X.restore.samePose = { moved: +Math.hypot(X.poseStill.x - X.poseBefore.x, X.poseStill.z - X.poseBefore.z).toFixed(3), dyaw: +Math.abs(X.poseStill.yaw - X.poseBefore.yaw).toFixed(4) };
    X.restore.vsBefore = await cropDE(before, still);
    X.restore.vsBeforeWorst = { dEOfMeans: Math.max(...Object.values(X.restore.vsBefore).map((c) => c.dEOfMeans)), meanDE: worstDE(X.restore.vsBefore) };
    // she moves again
    const p0 = await C(() => ({ x: window.__CTX__.player.position.x, z: window.__CTX__.player.position.z }));
    await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW'); await sleep(1500);
    const p1 = await C(() => ({ x: window.__CTX__.player.position.x, z: window.__CTX__.player.position.z }));
    X.restore.moved = +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2);
    const after = await shot('ctx-2-restored');
    X.after = await lum(after);
    const picOk = (w) => w.dEOfMeans <= CTX_DE_MEANS && w.meanDE <= CTX_DE_PIX;
    X.restore.pass = X.lost.ext && X.lost.state === 'context-lost' && X.lost.card?.visible && X.restore.state === 'playing' && !X.restore.lostNow && !X.restore.card
      && X.restore.firstFrameMs != null && X.restore.firstFrameMs <= 5000 && X.restore.moved > 0.5 && X.after.black < 0.5
      && X.restore.samePose.moved < 0.05 && picOk(X.restore.vsBeforeWorst) && !(X.restore.rebuilt?.failed?.length);
    log(`ctx restore: ${X.restore.pass ? 'PASS' : 'FAIL'} ${JSON.stringify({ playingMs: X.restore.playingMs, firstFrameMs: X.restore.firstFrameMs, cost: X.restore.firstFrameCostMs, rebuilt: X.restore.rebuilt, moved: X.restore.moved, samePose: X.restore.samePose, vsBefore: X.restore.vsBeforeWorst })}`);
    // (b) lost and never restored: the page reloads by itself; CONTINUE runs on the last record. The record is taken
    // where ctx-2 was shot, so the reloaded frame is the restored frame's pose (fix list 1: the two compared)
    await C(() => window.__CTX__.progression.save('reach-probe'));
    await sleep(800);
    X.record = await C(() => { const S = window.__CTX__.progression.saves.store, n = S.continueSlot(), r = n ? S.latest(n) : null; const p = window.__CTX__.player.position;
      return { slot: n, pos: r?.pos ?? r?.player?.position ?? null, at: { x: p.x, y: p.y, z: p.z }, yaw: window.__CTX__.player.camYaw, stage: window.__CTX__.spine.current()?.id ?? null }; });
    const tl = Date.now();
    const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).then(() => Date.now()).catch(() => null);
    await C(() => { const gl = window.__CTX__.renderer.getContext(); gl.getExtension('WEBGL_lose_context').loseContext(); });
    const tNav = await nav;
    X.reload = { reloadAfterMs: tNav ? tNav - tl : null };
    if (tNav) {
      current = 'ctx-reload';
      const ok = await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 180000, polling: 100 }).then(() => true).catch(() => false);
      X.reload.playingAfterMs = ok ? Date.now() - tl : null;
      await sleep(2500);
      X.reload.after = await C(() => { const p = window.__CTX__.player.position; return { state: window.__CTX__.state, at: { x: p.x, y: p.y, z: p.z }, yaw: window.__CTX__.player.camYaw, stage: window.__CTX__.spine.current()?.id ?? null,
        loadedFrom: window.__CTX__.progression.saves.loadedFrom ?? null }; });
      X.reload.dxz = +Math.hypot(X.reload.after.at.x - X.record.at.x, X.reload.after.at.z - X.record.at.z).toFixed(3);
      const rf = await shot('ctx-3-reloaded');
      X.reload.shot = path.basename(rf);
      X.reload.errors = errsAt('ctx-reload');
      // the restored world against the reloaded world, same pose
      X.restoredVsReload = await cropDE(after, rf);
      X.restoredVsReloadWorst = { dEOfMeans: Math.max(...Object.values(X.restoredVsReload).map((c) => c.dEOfMeans)), meanDE: worstDE(X.restoredVsReload) };
      X.restoredVsReloadPass = X.reload.dxz < 0.05 && picOk(X.restoredVsReloadWorst);
      log(`ctx restored vs reloaded (same pose, dxz ${X.reload.dxz}): ${X.restoredVsReloadPass ? 'PASS' : 'FAIL'} ${JSON.stringify(X.restoredVsReloadWorst)} ${JSON.stringify(X.restoredVsReload)}`);
    }
    X.reload.pass = !!tNav && X.reload.reloadAfterMs <= 6500 && X.reload.after?.state === 'playing' && X.reload.after.stage === X.record.stage && X.reload.dxz < 1.0;
    log(`ctx reload: ${X.reload.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(X.reload)}`);
    X.bars = { dEOfMeans: CTX_DE_MEANS, meanDE: CTX_DE_PIX, crops: CTX_CROPS };
    X.pass = X.restore.pass && X.reload.pass && !!X.restoredVsReloadPass;
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
