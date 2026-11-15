#!/usr/bin/env node
/**
 * A-slice-hour, FIRST SKELETON (BUILD M1b exit 1; M1.6a): an input-driven run of "Raker's Morning" from the real
 * title (press a key, NEW GAME, the first Tolerance) that reports how far it gets, beat by beat. One Chrome
 * session (the machine-wide slot1, PROCESS 6), which also films the systems' frames (`--frames`, staged by the
 * Frame Set's own tools/frames/page.mjs) and runs the live save rows, so a turn needs one launch.
 *
 *   node tools/gates/systems/slice-hour.mjs --port 5278 [--frames F30,F20] [--budget 840] [--label systems]
 *
 * WHAT DRIVES THE RUN. Keys only, as a player presses them: W and Shift to move, Space to hop a lip, E to talk,
 * rake, cut and sit, V for the Alidade, R to make arrows, digits for dialogue stations. The LOOK is the one stand-in:
 * the runner writes `player.camYaw` / `camPitch` (what the mouse writes), because a headless page has no pointer
 * lock. It never writes a position, never calls the spine, never skips a beat: a beat it cannot play is where the
 * report stops ("no script jumps"). Kinds and verbs owned by later items (the Plumb's topple needs the bow on the
 * vial) end the run honestly.
 *
 * Live rows in the same session (the node --test rows are tools/gates/systems/*.test.mjs):
 *   brazier-dialog   at the cistern on New Game: the dialog's words are four of the bible's six, with a forecast
 *   save-continue    after the run: reload, CONTINUE on the title, the same stage, satchel, place and hour
 *
 * Output: a run dir under ~/.calima-r5/review/runs/ (never the repo): report.json, the frames, step shots.
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrameSet } from '../../frames/frameset.mjs';
import { stageFrame, unstageFrame } from '../../frames/page.mjs';
import { RUNS, assertOutsideRepo } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';
import { takeMachineSlot, releaseMachineSlot } from '../../chrome-slot.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
const FRAMES = (flag('--frames', 'F30,F20') || '').split(',').map((s) => s.trim()).filter(Boolean);
const BUDGET_S = Number(flag('--budget', 840));
const LABEL = flag('--label', 'systems-slice-hour');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[slice-hour ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}`);
assertOutsideRepo(runDir, REPO);
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });

const report = { row: 'A-slice-hour (skeleton)', commit, dirty, tree: REPO, port: PORT, startedAt: new Date().toISOString(), frames: [], beats: [], rows: {}, console: [], stoppedAt: null, why: null };
let vite = null, browser = null, profile = null;
const T0 = Date.now();
const spent = () => (Date.now() - T0) / 1000;

async function shot(page, name) {
  try {
    const buf = await page.screenshot({ type: 'png' });
    await sharp(buf).resize(1600, 900, { fit: 'fill' }).jpeg({ quality: 82 }).toFile(path.join(runDir, `${name}.jpg`));
    return `${name}.jpg`;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------- in-page */

const probe = () => {
  const C = window.__CTX__, g = C?.systemsGame, s = C?.spine, p = C?.player;
  const cur = s?.current?.();
  const a = cur?.anchor ? g?.A?.[cur.anchor] : null;
  const busy = !!g?.present?.busy;
  return {
    state: C?.state, stage: cur?.id ?? (s?.done ? 'reward' : null), type: cur?.type ?? null, npc: cur?.npc ?? null,
    anchor: a ? { x: a.x, z: a.z } : null, up: cur?.up ?? 0, radius: cur?.radius ?? 3,
    p: p ? { x: p.position.x, y: p.position.y, z: p.position.z, g: C.terrain?.getHeight?.(p.position.x, p.position.z) ?? 0 } : null,
    busy, stations: busy ? document.querySelectorAll('#cal-sys .sys-st').length : 0,
    bz: busy ? [...document.querySelectorAll('#cal-sys .sys-row')].map((r) => r.firstChild?.textContent ?? '') : [],
    bzForecast: busy ? [...document.querySelectorAll('#cal-sys .sys-row small')].map((r) => r.textContent) : [],
    note: document.querySelector('.cal-track-obj')?.textContent ?? null,
    sighting: !!C?.sighting?.on, report: s?.report?.(), salt: C?.inventory?.count?.('metal-shards') ?? null,
  };
};

function face(x, z) {
  const p = window.__CTX__.player;
  p.camYaw = Math.atan2(-(x - p.position.x), -(z - p.position.z));
}

async function aimAt(id) {
  const C = window.__CTX__, g = C.systemsGame, p = C.player, cam = C.camera;
  const t = g.targets[id];
  if (!t) return { ok: false };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  p.camYaw = Math.atan2(-(t.x - p.position.x), -(t.z - p.position.z));
  const V = cam.position.constructor;
  const dir = new V(), pos = new V(), to = new V();
  const ang = () => {
    cam.getWorldPosition(pos); cam.getWorldDirection(dir);
    to.set(t.x - pos.x, t.y - pos.y, t.z - pos.z).normalize();
    return Math.acos(Math.max(-1, Math.min(1, dir.dot(to)))) * 180 / Math.PI;
  };
  let best = { pitch: p.camPitch, a: 999 };
  for (let k = -0.7; k <= 0.7; k += 0.035) {
    p.camPitch = k; await raf(); await raf();
    const a = ang();
    if (a < best.a) best = { pitch: k, a };
  }
  // fine yaw then
  p.camPitch = best.pitch;
  let yaw0 = p.camYaw, by = { yaw: yaw0, a: best.a };
  for (let d = -0.06; d <= 0.06; d += 0.01) { p.camYaw = yaw0 + d; await raf(); await raf(); const a = ang(); if (a < by.a) by = { yaw: yaw0 + d, a }; }
  p.camYaw = by.yaw; await raf();
  return { ok: by.a <= t.tol, angle: +by.a.toFixed(2), tol: t.tol };
}

/* -------------------------------------------------------------- driver */

const keys = (page) => ({
  down: (k) => page.keyboard.down(k), up: (k) => page.keyboard.up(k),
  tap: async (k, ms = 120) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); },
});

async function walkTo(page, K, target, radius, { up = 0, maxS = 150 } = {}) {
  const t0 = Date.now();
  let best = Infinity, bestAt = Date.now(), hop = 0;
  await K.down('KeyW'); await K.down('ShiftLeft');
  try {
    for (;;) {
      const s = await page.evaluate(probe);
      if (s.state === 'dead') return { ok: false, why: 'died' };
      if (s.busy) return { ok: true, interrupted: true };
      if (s.state !== 'playing') return { ok: false, why: `the game left play (state ${s.state})` };
      const dx = s.p.x - target.x, dz = s.p.z - target.z, d = Math.hypot(dx, dz);
      if (d <= radius && (!up || s.p.y - s.p.g >= 0 || true)) {
        if (!up) return { ok: true, d };
        const h = s.p.y - (await page.evaluate((x, z) => window.__CTX__.terrain.getHeight(x, z), target.x, target.z));
        if (h >= up) return { ok: true, d, h };
      }
      if (d < best - 0.5) { best = d; bestAt = Date.now(); }
      if (Date.now() - bestAt > 4000) { await K.tap('Space', 90); hop++; bestAt = Date.now(); if (hop > 12) return { ok: false, why: `stuck ${d.toFixed(1)} m short`, d }; }
      if ((Date.now() - t0) / 1000 > maxS) return { ok: false, why: `timed out ${d.toFixed(1)} m short`, d };
      await page.evaluate(face, target.x, target.z);
      await sleep(120);
    }
  } finally { await K.up('ShiftLeft'); await K.up('KeyW'); }
}

async function playScene(page, K, maxN = 40) {
  for (let i = 0; i < maxN; i++) {
    const s = await page.evaluate(probe);
    if (!s.busy) return true;
    if (s.stations > 0) await K.tap(`Digit${s.stations}`);   // the exit station is listed last
    else await K.tap('Space');
    await sleep(260);
  }
  return false;
}

async function holdE(page, K, ms = 650) { await K.down('KeyE'); await sleep(ms); await K.up('KeyE'); await sleep(220); }

async function beat(page, K, s) {
  const st = s.stage;
  if (s.type === 'goto') {
    if (s.up) {
      // a pillar is climbed by its three 1 m steps (src/world/sites/survey.js): come at it from the steps' side
      const ap = await page.evaluate((x, z) => {
        const P = window.__CTX__.props?.survey?.pillars || [];
        let best = null, bd = Infinity;
        for (const p of P) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
        return best ? { x: best.x + Math.sin(best.yaw) * 8, z: best.z + Math.cos(best.yaw) * 8, cx: best.x, cz: best.z } : null;
      }, s.anchor.x, s.anchor.z);
      if (ap) {
        const r0 = await walkTo(page, K, ap, 1.5);
        if (!r0.ok) return { ...r0, why: `approach to the steps: ${r0.why}` };
        const r1 = await walkTo(page, K, { x: ap.cx, z: ap.cz }, 1.2, { up: s.up, maxS: 60 });
        return r1;
      }
    }
    const r = await walkTo(page, K, s.anchor, Math.max(1.5, s.radius - 1), { up: s.up });
    await sleep(300);
    await playScene(page, K);
    return r;
  }
  if (s.type === 'talk') {
    const r = await walkTo(page, K, s.anchor, 2.0);
    if (!r.ok) return r;
    await holdE(page, K, 500);
    await sleep(300);
    await playScene(page, K);
    return { ok: true };
  }
  if (s.type === 'gather') {
    if (st === 'make') {
      for (let i = 0; i < 3; i++) { await K.down('KeyR'); await sleep(1700); await K.up('KeyR'); await sleep(400); if ((await page.evaluate(probe)).stage !== st) return { ok: true }; }
      return { ok: false, why: 'hold R made no Reed arrows' };
    }
    const r = await walkTo(page, K, s.anchor, 2.5);
    if (!r.ok) return r;
    for (let i = 0; i < 16; i++) { await holdE(page, K); await playScene(page, K); if ((await page.evaluate(probe)).stage !== st) return { ok: true }; }
    return { ok: false, why: 'gathering did not complete' };
  }
  if (s.type === 'sight' || s.type === 'survey') {
    if (s.type === 'sight') { const r = await walkTo(page, K, s.anchor, 40); if (!r.ok) return r; }
    await playScene(page, K);
    if (!(await page.evaluate(probe)).sighting) await K.tap('KeyV');
    await sleep(500);
    const ids = s.type === 'sight' ? ['gauge'] : ['T2', 'T6'];
    const aims = [];
    for (const id of ids) { aims.push({ id, ...(await page.evaluate(aimAt, id)) }); await sleep(1600); }
    if ((await page.evaluate(probe)).sighting) await K.tap('KeyV');
    await sleep(300);
    await playScene(page, K);
    return { ok: (await page.evaluate(probe)).stage !== st, aims };
  }
  if (s.type === 'kill') {
    return { ok: false, why: `not driven yet: '${st}' needs the bow on the Plumb (aim on a moving weak point; M1.6j's verbs)` };
  }
  return { ok: false, why: `unknown beat type ${s.type}` };
}

/* ---------------------------------------------------------------- main */

try {
  mkdirSync(runDir, { recursive: true });
  if (await portOpen(PORT)) throw new Error(`port ${PORT} already in use`);
  const slot = await takeMachineSlot({ who: `systems slice-hour ${PORT}`, waitS: 1800, log });
  if (!slot.ok) throw new Error(slot.why);
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'] });
  report.chrome = await browser.version();

  /* ---- A. the systems' frames, staged by the Frame Set's own page.mjs ---- */
  if (FRAMES.length) {
    const set = loadFrameSet();
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
    page.on('console', (m) => { if (m.type() === 'error') report.console.push({ at: 'frames', text: m.text().slice(0, 300) }); });
    page.on('pageerror', (e) => report.console.push({ at: 'frames', text: `pageerror: ${String(e).slice(0, 300)}` }));
    await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 });
    await sleep(6000);
    for (const id of FRAMES) {
      const f = set.frames.find((x) => x.id === id);
      if (!f) { report.frames.push({ id, ok: false, error: 'not in the Frame Set' }); continue; }
      try {
        const staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
        const buf = await page.screenshot({ type: 'png' });
        await sharp(buf).resize(1600, 900, { fit: 'fill' }).png().toFile(path.join(runDir, `${id}.png`));
        await page.evaluate(unstageFrame);
        report.frames.push({ id, ok: true, file: `${id}.png`, standIns: staged.standIns ?? [] });
        log(`${id} filmed`);
      } catch (e) { report.frames.push({ id, ok: false, error: String(e?.message || e).slice(0, 300) }); }
    }
    await page.close();
  }

  /* ---- B. the run, from the real title, in a clean profile context ---- */
  const bctx = await browser.createBrowserContext();
  const page = await bctx.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  page.on('console', (m) => { if (m.type() === 'error') report.console.push({ at: 'run', text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => report.console.push({ at: 'run', text: `pageerror: ${String(e).slice(0, 300)}` }));
  const K = keys(page);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 240000, polling: 100 });
  await sleep(500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('.mn-title-item')].find((x) => /NEW GAME/.test(x.textContent))?.click());
  await page.waitForSelector('.mn-diff', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.mn-diff').click());
  await page.waitForFunction(() => window.__CTX__?.state === 'playing' && window.__CTX__?.spine?.started, { timeout: 60000, polling: 50 });
  await sleep(2500);
  const s0 = await page.evaluate(probe);
  report.start = { hour: await page.evaluate(() => window.__CTX__.environment.time), stage: s0.stage, note: s0.note };
  await shot(page, 'b00-new-game');

  // brazier-dialog row: she wakes beside the cistern Brazier; sit, read the dialog, stand without resting
  await holdE(page, K, 600);
  await sleep(500);
  const bz = await page.evaluate(probe);
  report.rows['brazier-dialog'] = { rows: bz.bz, forecast: bz.bzForecast, shot: await shot(page, 'b01-brazier-dialog') };
  if (bz.busy) await K.tap('Escape');
  await sleep(400);

  let last = null, tries = 0;
  while (spent() < BUDGET_S - 120) {
    const s = await page.evaluate(probe);
    if (s.state === 'dead') { report.stoppedAt = s.stage; report.why = 'Brea died'; break; }
    if (!s.stage || s.stage === 'reward') { report.stoppedAt = 'reward'; report.why = 'quest done'; break; }
    if (s.busy) { await playScene(page, K); continue; }
    if (s.stage === last) tries++; else tries = 0;
    if (tries > 1) { report.stoppedAt = s.stage; report.why = report.beats.at(-1)?.why || 'no progress'; break; }
    last = s.stage;
    const b0 = Date.now();
    log(`beat ${s.stage} (${s.type})`);
    const r = await beat(page, K, s);
    const after = await page.evaluate(probe);
    const row = { stage: s.stage, type: s.type, ok: after.stage !== s.stage, seconds: +((Date.now() - b0) / 1000).toFixed(1), ...r, note: s.note };
    if (row.ok) row.shot = await shot(page, `b-${String(report.beats.length + 2).padStart(2, '0')}-${s.stage}`);
    report.beats.push(row);
    if (!row.ok && r.ok === false) { report.stoppedAt = s.stage; report.why = r.why; break; }
  }
  if (!report.stoppedAt) { report.stoppedAt = (await page.evaluate(probe)).stage; report.why = 'Chrome budget'; }
  const fin = await page.evaluate(probe);
  report.spine = fin.report;
  report.stopShot = await shot(page, 'b-stop');

  // save-continue row: what the store holds now, then reload, CONTINUE, and compare
  const before = await page.evaluate(() => {
    const C = window.__CTX__, s = C.progression.saves;
    const rec = s.store.latest(s.store.active);
    return rec ? { stage: rec.quest?.order?.at?.(-1)?.id ?? null, idx: rec.quest?.idx, salt: rec.satchel['metal-shards'] ?? 0, hour: rec.hour, x: rec.position.x, z: rec.position.z, kind: rec.kind, reason: rec.reason, v: rec.v, keys: Object.keys(localStorage).filter((k) => k.startsWith('cal.v6')) } : null;
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && /press|menu/.test(window.__CTX__?.menus?.titleStage || ''), { timeout: 240000, polling: 100 });
  await sleep(400);
  if (await page.evaluate(() => window.__CTX__.menus.titleStage === 'press')) await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
  await sleep(300);
  const hadContinue = await page.evaluate(() => { const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent)); if (!b || b.disabled) return false; b.click(); return true; });
  await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 60000, polling: 50 }).catch(() => {});
  await sleep(1500);
  const afterC = await page.evaluate(() => {
    const C = window.__CTX__, sp = C.spine, p = C.player;
    return { idx: sp.idx, stage: sp.order.at(-1)?.id ?? null, salt: C.inventory.count('metal-shards'), hour: +C.environment.time.toFixed(3), x: +p.position.x.toFixed(3), z: +p.position.z.toFixed(3), note: document.querySelector('.cal-track-obj')?.textContent ?? null };
  });
  report.rows['save-continue'] = {
    before, after: afterC, hadContinue,
    pass: !!before && hadContinue && before.idx === afterC.idx && before.salt === afterC.salt && Math.abs(before.hour - afterC.hour) < 0.05 && Math.hypot(before.x - afterC.x, before.z - afterC.z) < 1.0,
    shot: await shot(page, 'c-continued'),
  };
  await bctx.close();
} catch (e) {
  report.error = String(e?.stack || e).slice(0, 1200);
  log('error', report.error);
} finally {
  report.chromeSeconds = Math.round(spent());
  try { await browser?.close(); } catch { /* */ }
  if (profile) disposeProfile(profile);
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
  releaseMachineSlot(log);
  try { mkdirSync(runDir, { recursive: true }); writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2)); } catch { /* */ }
  log(`report: ${path.join(runDir, 'report.json')}`);
  log(`reached: ${(report.spine?.reached || []).join(' > ') || 'nothing'}; stopped at ${report.stoppedAt} (${report.why})`);
  process.exit(report.error ? 1 : 0);
}
