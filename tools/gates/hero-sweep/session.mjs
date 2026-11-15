/**
 * hero-anim's ONE Chrome session (PROCESS §6: frames and rows for one build together, under the 15-minute cap):
 * the page rows, the Frame Set frames and the bar clips, on one boot of one page.
 *
 *   node tools/gates/hero-sweep/session.mjs --port 5274 [--rows A-sweep-run,...|all|none] [--extra-rows <file>[,<file>]]
 *        [--frames F14,F15,F10] [--clips run,draw,crouchDraw,melee] [--label <tag>] [--budget <s>]
 *
 *  1. the machine guard (memory free >= 50 %, pressure level 1), then the shared slot <slots>/slot1 (mkdir; owner.txt
 *     "int hero-anim <pid> <utc>"), released (rm -r) the moment the run ends, on every exit path;
 *  2. Vite for THIS tree on --port, 127.0.0.1, under nice -n 10 (refuses 5173 and a busy port);
 *  3. one headless Chrome, one page (?shot=1): the frames first (tools/frames/page.mjs stageFrame, screenshot,
 *     unstage), then the rows (every row's assert in turn: hero-sweep.mjs and any --extra-rows file's GATES), then the
 *     clips (a frame's lens staged, the world unfrozen, the bar performed through the real input path while the
 *     page is screencast; ffmpeg makes each an mp4);
 *  4. rows.json and the frames in <review>/runs/<utc>-<commit>-<label>-partial/, the clips in <review>/clips/<utc>/.
 * Nothing is written inside the repo.
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadFrameSet } from '../../frames/frameset.mjs';
import { stageFrame, unstageFrame } from '../../frames/page.mjs';
import { RUNS, SLOTS, REVIEW, assertOutsideRepo } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[hero-session ${new Date().toISOString().slice(11, 19)}]`, ...a);

const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const BUDGET_S = Number(flag('--budget', 840));
const LABEL = flag('--label', 'hero-anim');
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');

/* ---- what to run */
const { GATES: SWEEP } = await import('../hero-sweep.mjs');
let rows = [];
const rowsFlag = flag('--rows', 'all');
if (rowsFlag !== 'none') rows = rowsFlag === 'all' ? SWEEP.slice() : SWEEP.filter((g) => rowsFlag.split(',').includes(g.id));
for (const f of (flag('--extra-rows') || '').split(',').filter(Boolean)) {
  const want = flag('--extra-only') ? flag('--extra-only').split(',') : null;
  const mod = await import(pathToFileURL(path.resolve(REPO, f)).href);
  rows.push(...mod.GATES.filter((g) => !want || want.includes(g.id)));
}
const set = loadFrameSet();
const frameIds = (flag('--frames') || '').split(',').filter(Boolean);
const frames = set.frames.filter((f) => frameIds.includes(f.id));
const CLIP_DEFS = {
  // (frame id whose lens is staged with the pose replaced by idle, then the page code performed while recording)
  run: { frame: 'F15', pose: 'idle', secs: 4.0, js: `C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft'); await w(3.8);` },
  draw: { frame: 'F16', pose: 'idle', secs: 4.2, js: `C.input.mouse.buttons |= 4; await w(0.5); C.input.mouse.buttons |= 1; await w(1.8); C.input.mouse.buttons &= ~1; await w(0.6); C.input.mouse.buttons &= ~4; await w(1.0);` },
  crouchDraw: { frame: 'F18', pose: 'idle', secs: 4.4, js: `p.setCrouch(true); await w(0.4); C.input.mouse.buttons |= 4; await w(0.5); C.input.mouse.buttons |= 1; C.input.keys.add('KeyD'); await w(1.8); C.input.mouse.buttons &= ~1; await w(0.6); C.input.keys.delete('KeyD'); C.input.mouse.buttons &= ~4; await w(0.8);` },
  melee: { frame: 'F19', pose: 'idle', secs: 4.4, js: `const mel = C.combat.melee; mel.aimLock = 0; mel.drawLance(30); await w(1.2); C.input.mouse.buttons |= 1; await w(0.9); C.input.mouse.buttons &= ~1; await w(1.0); C.input.mouse.buttons |= 1; await w(0.12); C.input.mouse.buttons &= ~1; await w(1.0);` },
};
const clipIds = (flag('--clips') || '').split(',').filter(Boolean);

/* ---- 1. guard and slot */
function memory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}
const SLOT = path.join(SLOTS, 'slot1');
let slotHeld = false;
const releaseSlot = () => { if (slotHeld) { try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ } slotHeld = false; log('slot released'); } };
async function takeSlot(waitS = 1800) {
  const until = Date.now() + waitS * 1000;
  for (let said = 0; Date.now() < until; said++) {
    const m = memory();
    if (m.ok) {
      try { mkdirSync(SLOT); slotHeld = true; } catch { /* held */ }
      if (slotHeld) { writeFileSync(path.join(SLOT, 'owner.txt'), `int hero-anim ${process.pid} ${utc()}\n`); log(`slot taken (memory ${m.free} % free, level ${m.level})`); return true; }
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
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { log(`${sig}: tearing down`); await teardown(); process.exit(130); });
process.on('exit', () => { releaseSlot(); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

const stamp = utc().replace(/[-:]/g, '');
const runDir = path.join(RUNS, `${stamp}-${commit}-${LABEL}-partial`);
const clipDir = path.join(REVIEW, 'clips', stamp);
assertOutsideRepo(runDir, REPO); assertOutsideRepo(clipDir, REPO);
const out = { commit, tree: REPO, port: PORT, startedAt: utc(), rows: [], frames: [], clips: [], console: [], errors: [] };

if (await portOpen(PORT)) { console.error(`port ${PORT} is in use`); process.exit(3); }
if (!(await takeSlot())) { console.error('SLOT-NOT-AVAILABLE'); process.exit(4); }
let t0 = 0;
try {
  mkdirSync(runDir, { recursive: true });
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  const vp = set.viewport || { width: 1600, height: 900, dpr: 1.25 };
  t0 = Date.now();
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${vp.width},${vp.height + 40}`] });
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr || 1 });
  await page.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    function Dead() { const t = new EventTarget(); t.readyState = 1; t.send = () => {}; t.close = () => { t.readyState = 3; }; setTimeout(() => t.dispatchEvent(new Event('open')), 0); return t; }
    window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols; if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
    window.WebSocket.prototype = Real.prototype;
  });
  let current = 'boot';
  page.on('console', (m) => { if (m.type() === 'error') out.console.push({ at: current, text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => out.console.push({ at: current, text: 'pageerror: ' + String(e).slice(0, 300) }));
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 });
  await sleep(6000);
  out.bootSeconds = Math.round((Date.now() - t0) / 1000);
  log(`booted in ${out.bootSeconds} s: ${rows.length} rows, ${frames.length} frames, ${clipIds.length} clips`);
  const over = () => (Date.now() - t0) / 1000 > BUDGET_S;

  /* ---- frames, first: on the freshly booted page (rows before them left the bow in her hand on the holster
   * timer and an arrow in the ground) */
  for (const f of frames) {
    current = f.id;
    if (over()) { out.frames.push({ id: f.id, ok: false, error: 'budget' }); continue; }
    try {
      const staged = await page.evaluate(stageFrame, f, { settleMs: 2600 });
      const shot = await page.screenshot({ type: 'png' });
      const png = await sharp(shot).resize(vp.width, vp.height, { fit: 'fill' }).png({ compressionLevel: 8 }).toBuffer();
      writeFileSync(path.join(runDir, `${f.id}.png`), png);
      const un = await page.evaluate(unstageFrame);
      out.frames.push({ id: f.id, ok: true, file: `${f.id}.png`, ...staged, unstageErrors: un.errors });
      log(`${f.id} filmed${staged.standIns?.length ? ` (${staged.standIns.length} stand-in)` : ''}`);
    } catch (e) { out.frames.push({ id: f.id, ok: false, error: String(e?.message || e).slice(0, 300) }); try { await page.evaluate(unstageFrame); } catch { /* */ } }
  }

  /* ---- rows (each ends with the bow put away and the lance holstered, for the clips after them) */
  for (const g of rows) {
    current = g.id;
    if (over()) { out.rows.push({ id: g.id, status: 'NOT-RUN', why: 'budget' }); continue; }
    const r0 = Date.now();
    try {
      if (g.setup) await page.evaluate(g.setup);
      await sleep(g.settle ?? 400);
      const res = await Promise.race([page.evaluate(g.assert), sleep(g.timeout ?? 90000).then(() => ({ pass: false, detail: 'timeout' }))]);
      out.rows.push({ id: g.id, status: res?.pass === true ? 'PASS' : res?.pass === null ? 'PENDING' : 'FAIL', seconds: Math.round((Date.now() - r0) / 1000), detail: res?.detail });
    } catch (e) { out.rows.push({ id: g.id, status: 'ERROR', error: String(e?.message || e).slice(0, 400) }); }
    const last = out.rows[out.rows.length - 1];
    log(`${g.id} ${last.status} in ${last.seconds ?? '?'} s${last.detail?.fails?.length ? ': ' + last.detail.fails.join('; ') : ''}`);
    try { await page.evaluate(() => { const C = window.__CTX__; C.input.keys.clear(); C.input.mouse.buttons = 0; C.player.setCrouch?.(false); C.player.animator?.setHangPose?.(false); C.combat?.melee?.holsterLance?.(); if (C.combat) C.combat._holsterT = 0; }); } catch { /* */ }
    await sleep(300);
  }
  writeFileSync(path.join(runDir, 'rows.json'), JSON.stringify(out.rows, null, 1));

  /* ---- clips: a frame's lens, the world running, the bar performed, the page screencast */
  if (clipIds.length) mkdirSync(clipDir, { recursive: true });
  const cdp = await page.createCDPSession();
  for (const id of clipIds) {
    const d = CLIP_DEFS[id];
    current = 'clip ' + id;
    if (!d || over()) { out.clips.push({ id, ok: false, error: d ? 'budget' : 'unknown clip' }); continue; }
    const fr = set.frames.find((x) => x.id === d.frame);
    const jpgs = [];
    const onFrame = async (e) => { jpgs.push({ t: e.metadata.timestamp, data: e.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }); } catch { /* */ } };
    try {
      await page.evaluate(stageFrame, { ...fr, state: { ...(fr.state || {}), pose: d.pose } }, { settleMs: 1500, measureFrames: 2 });
      await page.evaluate(() => window.__CTX__.engine.requestTimeScale('studio', null));
      cdp.on('Page.screencastFrame', onFrame);
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
      await page.evaluate(`(async () => { const C = window.__CTX__, p = C.player, E = C.engine; const fr = () => new Promise((r) => requestAnimationFrame(r));
        const w = async (s) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < s && performance.now() - w0 < s * 4000) await fr(); };
        ${d.js} })()`);
      await cdp.send('Page.stopScreencast');
      cdp.off('Page.screencastFrame', onFrame);
      await page.evaluate(() => { const C = window.__CTX__; C.input.keys.clear(); C.input.mouse.buttons = 0; C.player.setCrouch?.(false); });
      await page.evaluate(unstageFrame);
      // the frames at their own times, into a 30 fps mp4 (each frame held until the next one's timestamp)
      const dir = path.join(clipDir, id + '-frames'); mkdirSync(dir, { recursive: true });
      const list = [];
      jpgs.forEach((j, i) => { const f = path.join(dir, `${String(i).padStart(4, '0')}.jpg`); writeFileSync(f, Buffer.from(j.data, 'base64')); const dur = i + 1 < jpgs.length ? Math.max(0.001, jpgs[i + 1].t - j.t) : 0.05; list.push(`file '${f}'\nduration ${dur.toFixed(4)}`); });
      if (jpgs.length) list.push(`file '${path.join(dir, `${String(jpgs.length - 1).padStart(4, '0')}.jpg`)}'`);
      writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
      const mp4 = path.join(clipDir, `${id}.mp4`);
      execFileSync('nice', ['-n', '10', 'ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20', mp4]);
      const span = jpgs.length ? jpgs[jpgs.length - 1].t - jpgs[0].t : 0;
      out.clips.push({ id, ok: true, file: mp4, frames: jpgs.length, seconds: +span.toFixed(2), fps: span > 0 ? +(jpgs.length / span).toFixed(1) : 0, frame: d.frame });
      log(`clip ${id}: ${jpgs.length} frames over ${span.toFixed(1)} s -> ${mp4}`);
    } catch (e) {
      try { await cdp.send('Page.stopScreencast'); } catch { /* */ }
      cdp.off('Page.screencastFrame', onFrame);
      out.clips.push({ id, ok: false, error: String(e?.message || e).slice(0, 300) });
      try { await page.evaluate(unstageFrame); } catch { /* */ }
    }
  }
  out.chromeSeconds = Math.round((Date.now() - t0) / 1000);
} catch (e) {
  out.errors.push(String(e?.stack || e).slice(0, 800));
} finally {
  await teardown();
  out.endedAt = utc();
  try { mkdirSync(runDir, { recursive: true }); writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(out, null, 1)); } catch { /* */ }
}
log(`run ${runDir}: ${out.rows.filter((r) => r.status === 'PASS').length}/${out.rows.length} rows pass, ${out.frames.filter((f) => f.ok).length}/${frames.length} frames, ${out.clips.filter((c) => c.ok).length}/${clipIds.length} clips, ${out.chromeSeconds ?? '?'} s of Chrome, ${out.console.length} console errors`);
if (out.chromeSeconds > 900) log('WARNING: over the 15-minute cap');
