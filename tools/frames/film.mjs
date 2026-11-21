/**
 * Film the whole Frame Set in ONE Chrome session, then build the review page.
 *
 *   node tools/frames/film.mjs --port 5270                     every frame, page dated today
 *   node tools/frames/film.mjs --port 5270 --only F02,F08      a targeted re-run
 *   node tools/frames/film.mjs --port 5270 --baseline          this run becomes the anchors (M0.5)
 *   options: --wait <s> slot wait (default 1800) · --budget <s> Chrome time cap (default 840)
 *            --settle <ms> per-frame settle (default 2600) · --no-review · --status "line 1|line 2"
 *            --vite-config <file> serve the tree with that Vite config (M0.7: three resolved to another version)
 *            --label <tag> appended to the run directory name (e.g. r187)
 *            --probe <served path> a page module run after each shot; its probe(frame) result goes in run.json
 *            --hud-twin   for a frame with the HUD: two more shots with the page chrome hidden, so run.json
 *                         carries the share of pixels the HUD changes (measured.hudCover) and <id>-nohud.png
 *            --repeat N   (M1a regfix 3) film the selected frames N times in the session, interleaved (F15, F19, F15,
 *                         F19, ...), as <id>.png, <id>-r2.png, ...; each staging also takes a second shot of the same
 *                         frozen frame (its noise floor), and run.json `repeats` gives, per frame, every repeat's pixel
 *                         difference from the first over the whole frame and over her screen box (heroBox)
 *            --wall-clock stage the run, the heavy, the draws and the crouched aim on the wall clock, as before
 *                         regfix 3 (page.mjs 7a)
 *            --clip-phases a,b,...  repeat k freezes a sim-time stride (run, crouched aim-strafe) at gait phase k
 *            --repeat-only a,b,...  with --repeat N, repeats 2..N film only these frames (the selection once first)
 *            --lanes      also film every Milestone 2 lane frame (tools/frames/stagings/*.mjs); without it a lane frame
 *                         is filmed only when --only names it
 *            --state-probe  each sim-time staging hashes her animator, player and melee fields at the slate's end and
 *                         after the idle (run.json frames[].sim.state), to name what one staging carried into the next
 *            --shoot-unstaged  (M3 rule 17) film a frame whose subject check fails anyway (a diagnosis: run.json still marks
 *                         it notStaged, and it is not judged); --diagnose-unstaged refuses it (no frame) but keeps a
 *                         picture of the refused staging as <id>-not-staged.png; --no-subjects skips the check
 *
 * THE SUBJECT CHECK (M3 rule 17, area F's EF4): a frame that declares subjects (its own `subjects`, or
 * tools/frames/subjects.mjs) is checked on the frozen frame before the shutter (tools/frames/subject-page.mjs). A subject
 * under its pixel floor, outside the lens's safe area or hidden is a refusal: no picture, run.json `notStaged: true` and
 * `error: "not staged: <frame>: subject '<name>' <why>"`, with every member's numbers in `subjectCheck`.
 *
 * The run, in order:
 *   1. the machine guard: memory free >= 50 % (memory_pressure -Q) and pressure level 1, then the
 *      machine-wide slot <slots>/slot1 taken by mkdir and owned in owner.txt; released (rm -r) the
 *      moment the run ends, on every exit path
 *   2. a Vite dev server for THIS tree on --port under nice -n 10 (refuses a busy port and 5173)
 *   3. one headless Chrome, one page, ?shot=1; every frame staged by tools/frames/page.mjs,
 *      screenshotted at the frame set's viewport, unstaged; a frame that throws is recorded, not fatal
 *   4. <review>/runs/<utc>-<commit>/F*.png and run.json; then that run's review page, <review>/<date>/<run>/
 * Chrome time is capped (default 14 min): frames left when the cap hits are marked, not filmed.
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmOrder, loadFrameSet, validate } from './frameset.mjs';
import { stageFrame, unstageFrame } from './page.mjs';
import { loadLanes, mergeFrames, installStagings } from './stagings/index.mjs';
import { subjectsFor } from './subjects.mjs';
import { RUNS, SLOTS, assertOutsideRepo } from './paths.mjs';
import { slotTurn, leaveSlotQueue } from '../chrome-slot.mjs';
import { buildReview } from './review.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[film ${new Date().toISOString().slice(11, 19)}]`, ...a);

const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const WAIT_S = Number(flag('--wait', 1800));
const BUDGET_S = Number(flag('--budget', 840));
const SETTLE_MS = Number(flag('--settle', 2600));
const ONLY = flag('--only') ? new Set(flag('--only').split(',').map((s) => s.trim())) : null;
// --probe <served path>: a page module whose probe(frame) runs after each screenshot (frozen world); its result
// lands in run.json as frames[].probe (sky-look M1.1f: tools/look/sky-probe-page.mjs)
const PROBE = flag('--probe');
// --hud-twin (ui M1.6g1): the HUD's cover of the frame, measured as pixels it changes against the same frozen
// frame with the page chrome hidden (display: none; a visible child paints through visibility: hidden); a second
// chrome-off shot gives the noise floor of the frozen world
const HUD_TWIN = args.includes('--hud-twin');
const REPEAT = Math.max(1, Number(flag('--repeat', 1)) | 0);
const WALL_CLOCK = args.includes('--wall-clock');
// --clip-phases a,b,... (regfix 4): repeat k stages a sim-time strafe or run frozen at gait phase k (a probe of where in
// the stride a frame should freeze; with --repeat N, one phase per repeat)
const CLIP_PHASES = flag('--clip-phases') ? flag('--clip-phases').split(',').map(Number) : null;
// --repeat-only a,b,... (M1b, engine): with --repeat N, repeats 2..N film only these frames (after the whole selection
// once: a full-set session's history before each repeat). --state-probe: each sim-time staging records a hash of every
// field of her animator, player, melee and the wind at the slate's end and after the idle (page.mjs 7a), so two
// stagings that differ say which field carried over
const REPEAT_ONLY = flag('--repeat-only') ? new Set(flag('--repeat-only').split(',').map((s) => s.trim())) : null;
const STATE_PROBE = args.includes('--state-probe');
const SHOOT_UNSTAGED = args.includes('--shoot-unstaged');
const DIAGNOSE_UNSTAGED = args.includes('--diagnose-unstaged');
const NO_SUBJECTS = args.includes('--no-subjects');
// --wear <armour id> (M1b systems, M1.6l): after boot she wears this armory variant through her loadout (a deferred row
// loads), and the rung it belongs to is hers (the Character page shows it worn); every frame of the run is filmed in it
const WEAR = flag('--wear');
/** Per-pixel difference of two raw RGB buffers (w x h), over the whole frame or a box [x0, y0, x1, y1]: the share of
 * pixels whose largest channel difference passes TH (8-bit), the largest difference, the mean. */
const DIFF_TH = 10;
function diffStats(a, b, w, h, box = null) {
  const [x0, y0, x1, y1] = box || [0, 0, w, h];
  let n = 0, over = 0, max = 0, sum = 0;
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
    const i = (y * w + x) * 3;
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    n++; sum += d; if (d > max) max = d; if (d > DIFF_TH) over++;
  }
  return { pxOver: over, pctOver: n ? Math.round(over / n * 1e5) / 1e3 : null, max, meanAbs: n ? Math.round(sum / n * 1e3) / 1e3 : null, px: n, threshold: DIFF_TH };
}
const boxUnion = (a, b) => (a && b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a || b || null);

// Milestone 2: the lanes' frames (tools/frames/stagings/*.mjs) join only when named in --only, or all with --lanes
const LANES = await loadLanes();
if (LANES.errors.length) { for (const e of LANES.errors) console.error('stagings:', e); process.exit(1); }
const set = mergeFrames(loadFrameSet(), LANES, { all: args.includes('--lanes'), only: ONLY });
const problems = validate(set);
if (problems.length) { for (const p of problems) console.error('frameset:', p); process.exit(1); }
const frames0 = filmOrder(set.frames).filter((f) => !ONLY || ONLY.has(f.id));
const frames = [];
for (let r = 1; r <= REPEAT; r++) for (const f of frames0) if (r === 1 || !REPEAT_ONLY || REPEAT_ONLY.has(f.id)) frames.push(r === 1 ? f : { ...f, _repeat: r });
if (!frames.length) { console.error('film: no frames selected'); process.exit(1); }

const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;

/* ---------------------------------------------------------------- 1. guard and slot */
function memory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}
const SLOT = path.join(SLOTS, 'slot1');
let slotHeld = false;
const releaseSlot = () => { if (slotHeld) { try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ } slotHeld = false; log('slot released'); } };
async function takeSlot() {
  const until = Date.now() + WAIT_S * 1000;
  for (let said = 0; Date.now() < until; said++) {
    const m = memory();
    if (m.ok && slotTurn('frames')) {
      try { mkdirSync(SLOT); slotHeld = true; } catch { /* held */ }
      if (slotHeld) {
        leaveSlotQueue();
        writeFileSync(path.join(SLOT, 'owner.txt'), `int frames ${process.pid} ${utc()}\n`);
        log(`slot taken (memory ${m.free} % free, level ${m.level})`);
        return true;
      }
    }
    if (!(said % 6)) {
      let owner = '';
      try { owner = execFileSync('head', ['-1', path.join(SLOT, 'owner.txt')], { encoding: 'utf8' }).trim(); } catch { /* */ }
      log(`waiting: memory ${m.free} % free, level ${m.level}${owner ? `, slot held by "${owner}"` : ''}`);
    }
    await sleep(10000);
  }
  leaveSlotQueue();
  return false;
}

/* ---------------------------------------------------------------- helpers */
// Vite's "localhost" can bind IPv6 only ([::1]); a port counts as open on either loopback
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

/* ---------------------------------------------------------------- run */
const stamp = utc().replace(/[-:]/g, '');
const LABEL = flag('--label');
const VITE_CONFIG = flag('--vite-config');
const runDir = path.join(RUNS, `${stamp}-${commit}${LABEL ? `-${LABEL}` : ''}${ONLY ? '-partial' : ''}${REPEAT > 1 ? `-x${REPEAT}` : ''}`);
assertOutsideRepo(runDir, REPO);
const run = { commit, dirty, branch: git('branch', '--show-current'), tree: REPO, port: PORT, frameset: set.sha256, viewport: set.viewport, startedAt: utc(), only: ONLY ? [...ONLY] : null, repeat: REPEAT, wallClock: WALL_CLOCK, frames: [], console: [], errors: [] };

if (await portOpen(PORT)) { console.error(`film: port ${PORT} is already in use; not starting a second server`); process.exit(3); }
if (!(await takeSlot())) { console.error(`film: SLOT-NOT-AVAILABLE within ${WAIT_S} s (the memory guard or another run holds Chrome)`); process.exit(4); }

let exitCode = 0;
try {
  mkdirSync(runDir, { recursive: true });
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort', ...(VITE_CONFIG ? ['--config', VITE_CONFIG] : [])], { cwd: REPO, stdio: 'ignore', detached: true });
  if (VITE_CONFIG) run.viteConfig = VITE_CONFIG;
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);

  installProfileCleanup();
  profile = profileDir(PORT);
  const vp = set.viewport || { width: 1600, height: 900, dpr: 1.25 };
  const t0 = Date.now();
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${vp.width},${vp.height + 40}`] });
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr || 1 });
  // a dead HMR socket: a file saved elsewhere mid-run must not reload the page under the film
  await page.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    function Dead() { const t = new EventTarget(); t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
      setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0); return t; }
    window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols;
      if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
    window.WebSocket.prototype = Real.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  let current = 'boot';
  page.on('console', (m) => { if (m.type() === 'error') run.console.push({ frame: current, text: m.text().slice(0, 400) }); });
  page.on('pageerror', (e) => run.console.push({ frame: current, text: 'pageerror: ' + String(e).slice(0, 400) }));

  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 });
  await sleep(6000);   // people and the deferred variety stream in behind the first frame
  run.bootSeconds = Math.round((Date.now() - t0) / 1000);
  if (WEAR) {
    run.wear = await page.evaluate(async (id) => {
      const C = window.__CTX__, L = C?.player?.hero?.loadout;
      if (!L?.equipArmor) return { error: 'no loadout' };
      if (C.systemsGame && id === 'pan-2') C.systemsGame.rung = 'scout';
      const info = await L.equipArmor(id);
      C.player.hero.update?.(0);
      return { armorId: L.armorId, perk: L.perk, row: info?.row ?? null, flagDuration: C.machines?.perception?.flagDuration ?? null };
    }, WEAR).catch((e) => ({ error: String(e?.message || e).slice(0, 200) }));
    log(`wearing ${WEAR}: ${JSON.stringify(run.wear)}`);
  }
  if (Object.keys(LANES.hooks).length) await installStagings(page, LANES);
  run.three = await page.evaluate(() => window.__calShaderPatchAudit?.report?.().revision ?? null).catch(() => null);
  run.chrome = await browser.version();
  log(`booted in ${run.bootSeconds} s; filming ${frames.length} frames`);

  for (const f of frames) {
    current = f.id;
    const spent = (Date.now() - t0) / 1000;
    if (spent > BUDGET_S) { run.frames.push({ id: f.id, ok: false, error: `not filmed: the ${BUDGET_S} s Chrome cap was reached` }); continue; }
    const m = memory();
    if (m.level === '4') { run.frames.push({ id: f.id, ok: false, error: 'not filmed: memory pressure critical' }); continue; }
    const fs0 = Date.now();
    try {
      const rep = f._repeat || 1;
      const clipPhase = CLIP_PHASES ? CLIP_PHASES[(rep - 1) % CLIP_PHASES.length] : undefined;
      const staged = await page.evaluate(stageFrame, f, { settleMs: SETTLE_MS, wallClock: WALL_CLOCK, ...(STATE_PROBE ? { stateProbe: true } : {}), ...(clipPhase != null ? { clipPhase } : {}) });
      // (M3 rule 17) the subject check, on the frozen frame, before the shutter
      const subs = NO_SUBJECTS ? null : subjectsFor(f);
      if (subs) {
        staged.subjectCheck = await page.evaluate(async (fid, ss) => (await import('/tools/frames/subject-page.mjs')).checkSubjects(fid, ss), f.id, subs)
          .catch((e) => ({ pass: false, refusal: `not staged: ${f.id}: the subject check threw: ${String(e?.message || e).slice(0, 200)}`, subjects: [] }));
        const sc = staged.subjectCheck;
        log(`${f.id} subjects: ${sc.pass ? 'PASS' : 'FAIL'} in ${sc.ms ?? '?'} ms (${(sc.subjects || []).map((x) => `${x.name}: ${x.pass ? 'ok' : 'FAIL'}`).join('; ')})`);
        if (!sc.pass && !SHOOT_UNSTAGED) {
          // --diagnose-unstaged: the refused staging is still photographed, under a name that is not a frame's
          // (<id>-not-staged.png; the review page never reads it), so the lane can see what the lens held
          if (DIAGNOSE_UNSTAGED) {
            const dg = `${f.id}${rep === 1 ? '' : `-r${rep}`}-not-staged.png`;
            try { writeFileSync(path.join(runDir, dg), await sharp(await page.screenshot({ type: 'png' })).resize(vp.width, vp.height, { fit: 'fill' }).png({ compressionLevel: 8 }).toBuffer()); staged.diagnosisFile = dg; } catch (e) { staged.diagnosisFile = `failed: ${String(e?.message || e).slice(0, 120)}`; }
          }
          const un = await page.evaluate(unstageFrame);
          run.frames.push({ id: f.id, ...(REPEAT > 1 ? { repeat: rep } : {}), ok: false, notStaged: true, error: sc.refusal, seconds: Math.round((Date.now() - fs0) / 100) / 10, ...staged, unstageErrors: un.errors });
          log(`${f.id} NOT STAGED (refused): ${String(sc.refusal).slice(0, 240)}`);
          continue;
        }
        if (!sc.pass) staged.notStaged = true;
      }
      const shot = await page.screenshot({ type: 'png' });
      const img = sharp(shot).resize(vp.width, vp.height, { fit: 'fill' });
      const file = rep === 1 ? `${f.id}.png` : `${f.id}-r${rep}.png`;
      const png = await img.png({ compressionLevel: 8 }).toBuffer();
      writeFileSync(path.join(runDir, file), png);
      if (REPEAT > 1) {
        // the noise floor of this frozen frame: a second shot of the same staging, nothing re-staged
        try {
          const raw = async (b) => sharp(b).resize(vp.width, vp.height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
          const shot2 = await page.screenshot({ type: 'png' });
          writeFileSync(path.join(runDir, file.replace(/\.png$/, '-floor.png')), await sharp(shot2).resize(vp.width, vp.height, { fit: 'fill' }).png({ compressionLevel: 8 }).toBuffer());
          const a = await raw(shot), b = await raw(shot2);
          staged.measured.floor = { whole: diffStats(a, b, vp.width, vp.height), hero: staged.heroBox ? diffStats(a, b, vp.width, vp.height, staged.heroBox) : null };
        } catch (e) { staged.measured.floor = { error: String(e?.message || e).slice(0, 200) }; }
      }
      // mean relative luminance of the frame, in percent (sRGB channel means, linearised)
      const st = await sharp(png).stats();
      const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const [r, g, b] = st.channels.map((c) => c.mean);
      staged.measured.meanLuminance = Math.round((0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)) * 1000) / 10;
      if (HUD_TWIN && f.state?.hud) {
        try {
          const raw = async () => (await sharp(await page.screenshot({ type: 'png' })).resize(vp.width, vp.height, { fit: 'fill' }).removeAlpha().raw().toBuffer());
          await page.evaluate(() => { window.__twinHidden = []; const cv = window.__CTX__?.engine?.renderer?.domElement;
            for (const el of Array.from(document.body.children)) { if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el === cv || (cv && el.contains(cv))) continue;
              window.__twinHidden.push([el, el.style.display]); el.style.display = 'none'; } });
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
          const offA = await raw(), offB = await raw();
          writeFileSync(path.join(runDir, `${f.id}-nohud.png`), await sharp(offA, { raw: { width: vp.width, height: vp.height, channels: 3 } }).png().toBuffer());
          await page.evaluate(() => { for (const [el, v] of window.__twinHidden || []) el.style.display = v; window.__twinHidden = []; });
          const on = await sharp(png).removeAlpha().raw().toBuffer();
          const TH = 10;   // 8-bit, max over RGB
          const frac = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 3) { if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > TH) n++; } return n / (a.length / 3); };
          const r3 = (v) => Math.round(v * 100000) / 1000;
          staged.measured.hudCover = { pct: r3(frac(on, offA)), noisePct: r3(frac(offA, offB)), threshold: TH, file: `${f.id}-nohud.png` };
        } catch (e) { staged.measured.hudCover = { error: String(e?.message || e).slice(0, 300) }; }
      }
      if (PROBE) {
        try { staged.probe = await page.evaluate(async (url, fr) => (await import(url)).probe(fr), PROBE, f); }
        catch (e) { staged.probe = { error: String(e?.message || e).slice(0, 400) }; }
      }
      const un = await page.evaluate(unstageFrame);
      run.frames.push({ id: f.id, ...(REPEAT > 1 ? { repeat: rep } : {}), ok: true, file, seconds: Math.round((Date.now() - fs0) / 100) / 10, ...staged, unstageErrors: un.errors });
      log(`${f.id} ok in ${((Date.now() - fs0) / 1000).toFixed(1)} s${staged.standIns.length ? ` (${staged.standIns.length} stand-in)` : ''}`);
    } catch (e) {
      run.frames.push({ id: f.id, ok: false, error: String(e?.message || e).slice(0, 400), seconds: Math.round((Date.now() - fs0) / 100) / 10 });
      log(`${f.id} FAILED: ${String(e?.message || e).slice(0, 160)}`);
      try { await page.evaluate(unstageFrame); } catch { /* page may be gone */ }
    }
  }
  run.chromeSeconds = Math.round((Date.now() - t0) / 1000);
  if (REPEAT > 1) {
    // every repeat against the first staging of the same frame
    run.repeats = {};
    for (const f of frames0) {
      const shots = run.frames.filter((x) => x.id === f.id && x.ok);
      const first = shots.find((x) => (x.repeat || 1) === 1);
      if (!first || shots.length < 2) continue;
      const rawOf = async (x) => sharp(path.join(runDir, x.file)).removeAlpha().raw().toBuffer();
      const a = await rawOf(first);
      run.repeats[f.id] = [];
      for (const x of shots) {
        if (x === first) continue;
        const b = await rawOf(x), box = boxUnion(first.heroBox, x.heroBox);
        run.repeats[f.id].push({ repeat: x.repeat, file: x.file, whole: diffStats(a, b, vp.width, vp.height), hero: box ? diffStats(a, b, vp.width, vp.height, box) : null, heroBox: box,
          sim: x.sim ? { frames: x.sim.frames, clipPhase: x.sim.clipPhase, contactK: x.sim.contactK } : null });
      }
      const fmt = (d) => (d ? `${d.pctOver} % over ${d.threshold}, max ${d.max}` : 'n/a');
      for (const r of run.repeats[f.id]) log(`${f.id} repeat ${r.repeat} vs 1: whole ${fmt(r.whole)}; her box ${fmt(r.hero)}`);
    }
  }
} catch (e) {
  run.errors.push(String(e?.stack || e).slice(0, 800));
  exitCode = 1;
} finally {
  await teardown();
  run.endedAt = utc();
  try { mkdirSync(runDir, { recursive: true }); writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(run, null, 1)); } catch { /* */ }
}

const filmed = run.frames.filter((x) => x.ok).length;
log(`run ${runDir}: ${filmed}/${frames.length} frames filmed, ${run.chromeSeconds ?? '?'} s of Chrome, ${run.console.length} console errors`);
if (run.chromeSeconds > 900) log('WARNING: over the 15-minute cap');
if (!args.includes('--no-review') && filmed && REPEAT === 1) {   // a repeat run is a proof, not a review page
  const r = await buildReview({ runDir, status: flag('--status') || '', setBaseline: args.includes('--baseline') });
  log(`review page: ${r.page}`);
}
process.exit(exitCode || (filmed === frames.length ? 0 : 1));
