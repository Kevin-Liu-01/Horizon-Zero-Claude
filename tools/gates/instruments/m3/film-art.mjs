/**
 * M3 wave 3, area C: film the surfaces-and-behaviour page (./art.html) in ONE short headless Chrome under the
 * machine-wide slot protocol (memory >= 50 % free and pressure level 1, then mkdir the slot, owner.txt, rm -r the slot the
 * moment the run ends), on the lane's own Vite (127.0.0.1, nice -n 10, killed after). Serves the tree this file sits in
 * (a detached worktree at a commit: the measurement rule). Never port 5173.
 *
 *   node tools/gates/instruments/m3/film-art.mjs --port 5283 [--parts turn-kiln,turn-davit,turn-sonde,kiln,davit,sonde]
 *        [--yaws 0,45,90,135,180,225,270,315] [--label <name>] [--wait <s>] [--budget <s>]
 *   turn-<kind>  the turntable beside Brea at each yaw (lamp calm), then yaw 30 in wary and in hostile; at yaw 0 and in
 *                the two lamp shots each lamp's centre pixel (median of 5 x 5) is read off the PNG: dE2000 to its token
 *   kiln         the rows (one page runs the whole script), then a fresh page (&run=0) seeks the named moments in order
 *   davit, sonde the same
 *   -> <review>/runs/<utc>-<commit>-m3c-art[-<label>]/<shot>.png and art.json (rows, timelines, events, lamp reads)
 */
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../../chrome-profile.mjs';
import { RUNS, SLOTS, assertOutsideRepo } from '../../../frames/paths.mjs';
import sharp from 'sharp';
import { deltaE } from '../../../../src/instruments/lib/color.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
const PARTS = (flag('--parts') || 'turn-kiln,turn-davit,turn-sonde,kiln,davit,sonde').split(',');
const WAIT_S = Number(flag('--wait', 1800)), BUDGET_S = Number(flag('--budget', 600));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (m) => console.log(`[art ${utc()}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };

function memory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}
const SLOT = path.join(SLOTS, 'slot1');
let slotHeld = false, vite = null, browser = null, profile = null;
const releaseSlot = () => { if (slotHeld) { try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ } slotHeld = false; log('slot released'); } };
async function takeSlot() {
  const until = Date.now() + WAIT_S * 1000;
  for (let said = 0; Date.now() < until; said++) {
    const m = memory();
    if (m.ok) {
      try { mkdirSync(SLOT); slotHeld = true; } catch { /* held */ }
      if (slotHeld) { writeFileSync(path.join(SLOT, 'owner.txt'), `int m3-instruments-c ${process.pid} ${utc()}\n`); log(`slot taken (memory ${m.free} % free, level ${m.level})`); return true; }
    }
    if (!(said % 12)) { let owner = ''; try { owner = readFileSync(path.join(SLOT, 'owner.txt'), 'utf8').trim(); } catch { /* */ } log(`waiting: memory ${m.free} % free, level ${m.level}${owner ? `, slot held by "${owner}"` : ''}`); }
    await sleep(5000);   // the slot protocol's 5 s (a 10 s poll lost the slot to the 5 s pollers for 50 min at c66bf8e)
  }
  return false;
}
const portOn = (p, host) => new Promise((r) => { const s = net.connect(p, host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
async function teardown() {
  try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
  browser = null;
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } vite = null; }
  if (profile) { try { disposeProfile(profile); } catch { /* */ } profile = null; }
  releaseSlot();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { await teardown(); process.exit(130); });
process.on('exit', () => { releaseSlot(); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

/** Each lamp's centre pixel on the PNG (the median of a 5 x 5 patch per channel) and its dE2000 to the token. */
async function lampColours(file, px, token) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = {};
  for (const [k, [x, y]] of Object.entries(px)) {
    if (x < 2 || y < 2 || x >= info.width - 2 || y >= info.height - 2) { out[k] = { at: [x, y], off: true }; continue; }
    const ch = [[], [], []];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const o = ((y + dy) * info.width + (x + dx)) * 3; for (let c = 0; c < 3; c++) ch[c].push(data[o + c]); }
    const rgb = ch.map((a) => a.sort((p, q) => p - q)[12]);
    out[k] = { at: [x, y], rgb, hex: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(), token, dE: +deltaE(rgb.map((v) => v / 255), token).toFixed(2) };
  }
  return out;
}

const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
const LABEL = flag('--label');
const YAWS = (flag('--yaws') || '0,45,90,135,180,225,270,315').split(',').map(Number);
const runDir = path.join(RUNS, `${utc().replace(/[-:]/g, '')}-${commit}-m3c-art${LABEL ? `-${LABEL}` : ''}`);
assertOutsideRepo(runDir, REPO);
const run = { tool: 'tools/gates/instruments/m3/film-art.mjs', commit, dirty, tree: REPO, port: PORT, parts: PARTS, startedAt: utc(), shots: [], rows: {}, timelines: {}, events: {}, measured: {}, console: [] };

if (await portOn(PORT, '127.0.0.1')) { console.error(`port ${PORT} is in use; not starting a second server`); process.exit(3); }
if (!(await takeSlot())) { console.error('SLOT-NOT-AVAILABLE'); process.exit(4); }
let code = 0;
try {
  mkdirSync(runDir, { recursive: true });
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOn(PORT, '127.0.0.1')); i++) await sleep(250);
  if (!(await portOn(PORT, '127.0.0.1'))) throw new Error(`vite did not open ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  const t0 = Date.now();
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 120000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', '--renderer-process-limit=1', '--disable-extensions'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') run.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => run.console.push('pageerror: ' + String(e).slice(0, 300)));
  run.failed = [];
  page.on('response', (r) => { if (r.status() >= 400) run.failed.push(`${r.status()} ${r.url().replace(`http://127.0.0.1:${PORT}`, '')}`); });
  const open = async (qs) => {
    await page.goto(`http://127.0.0.1:${PORT}/tools/gates/instruments/m3/art.html?${qs}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__ART__ && (window.__ART__.ready || window.__ART__.error)', { timeout: 120000, polling: 250 });
    const a = await page.evaluate(() => ({ ready: window.__ART__.ready, error: window.__ART__.error, rows: window.__ART__.rows, timeline: window.__ART__.timeline, events: window.__ART__.events, measured: window.__ART__.measured }));
    if (a.error) throw new Error(`${qs}: ${a.error}`);
    return a;
  };
  const shoot = async (name, extra = {}, lampRead = false) => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const file = path.join(runDir, `${name}.png`);
    await page.screenshot({ path: file });
    const st = await page.evaluate(() => ({ lampPx: window.__ART__.lampPx, lampState: window.__ART__.lampState }));
    let lamps = null;
    if (lampRead && st.lampPx) {
      lamps = {};
      for (const [k, px] of Object.entries(st.lampPx)) {
        const state = st.lampState?.[k] || 'calm';
        const token = { calm: '#F2EAD3', wary: '#B5E61D', hostile: '#FF2D8C' }[state];
        lamps[k] = (await lampColours(file, { [k]: px }, token))[k];
        lamps[k].state = state;
      }
    }
    run.shots.push({ name, file, ...extra, lamps });
    log(`${name}${lamps ? ` lamps ${Object.entries(lamps).map(([k, r]) => `${k} ${r.state} dE ${r.dE}`).join(', ')}` : ''}`);
  };
  for (const part of PARTS) {
    if ((Date.now() - t0) / 1000 > BUDGET_S) { run.stopped = `budget ${BUDGET_S} s`; break; }
    if (part.startsWith('turn-')) {
      const kind = part.slice(5);
      const a = await open(`view=turn&kind=${kind}`);
      run.measured[kind] = a.measured;
      for (const yaw of YAWS) { await page.evaluate((y) => window.__ART__.pose({ yaw: y }), yaw); await shoot(`turn-${kind}-${String(yaw).padStart(3, '0')}`, { yaw }, yaw === 0); }
      for (const lamp of ['wary', 'hostile']) { await open(`view=turn&kind=${kind}&lamp=${lamp}`); await page.evaluate(() => window.__ART__.pose({ yaw: 20 })); await shoot(`turn-${kind}-020-${lamp}`, { yaw: 20, lamp }, true); }
      continue;
    }
    const a = await open(`view=${part}`);
    run.rows[part] = a.rows; run.timelines[part] = a.timeline; run.events[part] = a.events;
    for (const [k, v] of Object.entries(a.rows)) log(`${k}: ${v.verdict} ${v.text}`);
    await open(`view=${part}&run=0`);
    const LENS = { kiln: { plugged: 'plugged', wake: 'plugged', turned: 'wide', shells: 'wide', impact: 'wide', brine: 'door', stagger: 'door', shut: 'door' },
      davit: { arrive: 'wide', reseating: 'near', done: 'near' }, sonde: { post: 'post', near: 'near' } }[part];
    const order = Object.entries(a.timeline).sort((p, q2) => p[1] - q2[1]);
    for (const [name, t] of order) {
      const st = await page.evaluate((tt, l) => window.__ART__.seek(tt, l), t, LENS[name]);
      await shoot(`${part}-${name}`, { t, lens: LENS[name], state: st }, true);
    }
  }
  run.chromeS = +((Date.now() - t0) / 1000).toFixed(1);
} catch (e) { run.error = String(e?.stack || e).slice(0, 800); code = 1; } finally {
  await teardown();
  run.endedAt = utc();
  writeFileSync(path.join(runDir, 'art.json'), JSON.stringify(run, null, 1));
  log(`run dir ${runDir}`);
}
process.exitCode = code;
