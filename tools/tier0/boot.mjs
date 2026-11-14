// @ts-check
/**
 * Tier 0 headless boot: one short page load with no console errors.
 *
 *   node tools/tier0/boot.mjs --port <port> [--tree <dir>] [--slot-wait <seconds>] [--who <name>] [--words <file>]
 *
 * Machine rules (binding here):
 *   - a Vite dev server for this tree on --port (required; 5173 is refused), under `nice -n 10`, killed after;
 *   - ONE gate Chrome machine-wide. Before launch: memory free >= 50 % (`memory_pressure -Q`) and pressure
 *     level 1 (`sysctl kern.memorystatus_vm_pressure_level`); then the slot directory is taken with an atomic
 *     mkdir (default ~/.calima-r5/chrome-slots/slot1, or $CALIMA_CHROME_SLOT), "<who> tier0-boot <pid> <utc>" is
 *     written to its owner.txt, and the directory is removed the moment the run ends (also on SIGINT/SIGTERM).
 *     If the guard or the slot does not allow a launch within --slot-wait seconds (default 1200), the boot is
 *     PENDING, never PASS, and nothing is launched.
 *
 * What it checks: the page at /?shot=1 reaches `window.__READY__`, then runs 5 s more; any console error,
 * page error, failed request or HTTP >= 400 FAILs. It also reports the bytes transferred (the measured first
 * load) and, when the private word list is present, listed terms in the rendered page text.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync, realpathSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mb } from './lib/files.mjs';
import { parseWordList, makeMatcher } from './lib/words.mjs';
import { wordListPath } from './namelint.mjs';

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const arg = (/** @type {string[]} */ argv, /** @type {string} */ k) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : undefined; };
const TMP_PREFIX = 'calima-tier0-chrome-';

/** Memory guard reading. */
export function machineGuard() {
  let free = 0;
  let level = 9;
  try { free = Number((/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' })) || [])[1] || 0); } catch { /* not macOS */ }
  try { level = Number(execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim()); } catch { /* not macOS */ }
  return { free, level, ok: free >= 50 && level === 1 };
}

/** @param {number} port */
const portOpen = (port) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1');
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
});

/**
 * @param {{ root: string, argv?: string[] }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult[]>}
 */
export async function run({ root, argv = process.argv }) {
  const t0 = Date.now();
  const who = arg(argv, '--who') || 'tier0';
  const port = Number(arg(argv, '--port'));
  /** @param {'PASS'|'FAIL'|'PENDING'|'SKIP'} status @param {string} summary @param {string[]} [failures] @param {string[]} [notes] */
  const one = (status, summary, failures = [], notes = []) => [{ id: 'boot', status, summary, failures, notes, ms: Date.now() - t0 }];
  if (!port) return one('SKIP', 'no --port given: boot not run (Tier 0 boots only on an explicit port)');
  if (port === 5173) return one('FAIL', 'refusing port 5173 (reserved for the owner\'s preview)', ['--port 5173 refused']);
  if (await portOpen(port)) return one('FAIL', `port ${port} is already in use; not starting a second server`, [`port ${port} busy`]);

  const slot = process.env.CALIMA_CHROME_SLOT || path.join(os.homedir(), '.calima-r5', 'chrome-slots', 'slot1');
  const waitS = Number(arg(argv, '--slot-wait') ?? 1200);
  const deadline = Date.now() + waitS * 1000;
  let held = false;
  let last = machineGuard();
  let polls = 0;
  while (Date.now() < deadline || polls === 0) {
    polls++;
    last = machineGuard();
    if (last.ok) {
      try { mkdirSync(slot); held = true; break; } catch { /* taken */ }
    }
    if (Date.now() >= deadline) break;
    await sleep(5000);
  }
  if (!held) {
    let owner = '';
    try { owner = readFileSync(path.join(slot, 'owner.txt'), 'utf8').trim(); } catch { /* none */ }
    return one('PENDING', `no Chrome launched: within ${waitS} s the guard/slot never allowed it (last reading: ${last.free} % free, pressure level ${last.level}; slot ${existsSync(slot) ? `held by "${owner}"` : 'free'})`);
  }
  const release = () => { try { rmSync(slot, { recursive: true }); } catch { /* already gone */ } };
  const onSig = () => { release(); process.exit(130); };
  process.once('SIGINT', onSig);
  process.once('SIGTERM', onSig);
  writeFileSync(path.join(slot, 'owner.txt'), `${who} tier0-boot ${process.pid} ${new Date().toISOString()}\n`);

  /** @type {import('node:child_process').ChildProcess | null} */
  let srv = null;
  /** @type {any} */
  let browser = null;
  let profile = '';
  const errors = [];
  const out = { ready: false, readyMs: 0, bytes: 0, requests: 0, text: '' };
  try {
    const vite = path.join(root, 'node_modules/vite/bin/vite.js');
    srv = spawn('nice', ['-n', '10', process.execPath, vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', detached: true });
    for (let i = 0; i < 240 && !(await portOpen(port)); i++) await sleep(250);
    if (!(await portOpen(port))) throw new Error(`vite did not listen on ${port} within 60 s`);
    const req = createRequire(path.join(root, 'package.json'));
    const puppeteer = (await import(pathToFileURL(req.resolve('puppeteer')).href)).default;
    profile = mkdtempSync(path.join(realpathSync(os.tmpdir()), TMP_PREFIX));
    browser = await puppeteer.launch({
      headless: true, userDataDir: profile,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--no-first-run', '--no-default-browser-check'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    cdp.on('Network.loadingFinished', (/** @type {any} */ e) => { out.bytes += e.encodedDataLength || 0; out.requests++; });
    page.on('console', (/** @type {any} */ m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
    page.on('pageerror', (/** @type {any} */ e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
    page.on('requestfailed', (/** @type {any} */ q) => errors.push(`requestfailed: ${q.url().replace(/^https?:\/\/[^/]+/, '')} ${q.failure()?.errorText || ''}`));
    page.on('response', (/** @type {any} */ q) => { if (q.status() >= 400) errors.push(`http ${q.status()}: ${q.url().replace(/^https?:\/\/[^/]+/, '')}`); });
    const tLoad = Date.now();
    await page.goto(`http://127.0.0.1:${port}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction('window.__READY__ === true', { timeout: 180000 });
    out.ready = true;
    out.readyMs = Date.now() - tLoad;
    await sleep(5000);
    out.text = await page.evaluate(() => document.body?.innerText || '');
  } catch (e) {
    errors.push(`harness: ${String(e).slice(0, 300)}`);
  } finally {
    try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* gone */ } }
    try { if (srv?.pid) process.kill(-srv.pid, 'SIGTERM'); } catch { /* gone */ }
    release();
    process.removeListener('SIGINT', onSig);
    process.removeListener('SIGTERM', onSig);
    if (profile) {
      const tmp = realpathSync(os.tmpdir());
      if (path.dirname(profile) === tmp && path.basename(profile).startsWith(TMP_PREFIX)) rmSync(profile, { recursive: true, force: true });
    }
  }
  const uniq = [...new Set(errors)];
  /** @type {import('./lib/files.mjs').CheckResult[]} */
  const results = [{
    id: 'boot',
    status: out.ready && !uniq.length ? 'PASS' : 'FAIL',
    summary: out.ready ? `ready in ${(out.readyMs / 1000).toFixed(1)} s; ${uniq.length} errors; ${out.requests} requests, ${mb(out.bytes)} MB transferred (measured first load)` : `never reached __READY__; ${uniq.length} errors`,
    failures: uniq.slice(0, 40),
    ms: Date.now() - t0,
  }];
  const wl = wordListPath(argv);
  if (out.text && existsSync(wl)) {
    const L = parseWordList(readFileSync(wl, 'utf8'));
    const hits = makeMatcher([...L.anywhere, ...L.names, ...L.playerVisible])(out.text);
    /** @type {Record<string, number>} */
    const n = {};
    for (const h of hits) n[h] = (n[h] || 0) + 1;
    results.push({ id: 'name-lint-page', status: hits.length ? 'FAIL' : 'PASS', summary: `${hits.length} listed terms in the rendered page text`, failures: Object.entries(n).map(([t, k]) => `${t}×${k}`), ms: 0 });
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { treeRoot } = await import('./lib/files.mjs');
  for (const r of await run({ root: treeRoot() })) {
    console.log(`${r.status} ${r.id}: ${r.summary}`);
    for (const f of r.failures) console.log('  - ' + f);
  }
}
