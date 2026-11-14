/**
 * M0.13: measure the single-asset turntable page in its own small headless Chrome, beside the gate Chrome.
 *
 *   node tools/turntable/measure.mjs --port 5270 --out <dir outside the repo> [--seconds 300] [--asset /models/hero/brea.glb]
 *                                    [--need-gate-chrome 1]
 *
 * Every 5 s it records: the resident memory of this Chrome's whole process tree (RSS, and the macOS physical
 * footprint, which counts the GPU process's Metal allocations), the same for every other "Chrome for Testing"
 * tree on the machine (the gate Chrome), and the machine guard's inputs: free memory %, the kernel's pressure level,
 * swap used and its growth over the last minute. Every 30 s it reloads the page (the art loop's rebuild-and-look);
 * every 10 s it takes a screenshot (the look). The orchestrator's guard log is read over the same window for slot
 * takes and kills. Bar (BUILD M0.13, PROCESS §6): under 1.5 GB resident and a quiet guard -> exempt from the
 * one-Chrome rule.
 */
import puppeteer from 'puppeteer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
const OUT = flag('--out');
if (!OUT) { console.error('measure: --out <dir> is required'); process.exit(2); }
const SECONDS = Number(flag('--seconds', 300));
const ASSET = flag('--asset', '/models/hero/brea.glb');
const NEED_GATE = flag('--need-gate-chrome', '1') === '1';
const CONTROL_S = Number(flag('--control', 0));          // seconds of gate-Chrome-alone readings first
const ABORT_FREE = Number(flag('--abort-free', 35));      // stop above the guard's kill line (free < 30 %)
const ABORT_LEVEL = Number(flag('--abort-level', 3));
const GUARD_LOG = '/Users/kevinliu/.calima-r5/orch/logs/mem-guard.log';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, a) => { try { return execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 << 20 }); } catch (e) { return e.stdout || ''; } };

function procs() {
  const rows = sh('ps', ['-axo', 'pid=,ppid=,rss=,command=']).split('\n').filter(Boolean).map((l) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l);
    return m && { pid: +m[1], ppid: +m[2], rssKB: +m[3], cmd: m[4] };
  }).filter(Boolean);
  return rows;
}
function tree(rows, root) {
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const out = [], stack = [root];
  while (stack.length) { const p = stack.pop(); const r = rows.find((x) => x.pid === p); if (r) out.push(r); for (const k of kids.get(p) || []) stack.push(k.pid); }
  return out;
}
/** physical footprint (MB) per pid, from /usr/bin/footprint (counts IOAccelerator / Metal memory). */
function footprintMB(pids) {
  if (!pids.length) return 0;
  const a = []; for (const p of pids) a.push('-p', String(p));
  const txt = sh('/usr/bin/footprint', ['-f', 'bytes', ...a]);
  let sum = 0;
  for (const m of txt.matchAll(/phys_footprint:\s*([\d,]+)\s*B/g)) sum += Number(m[1].replace(/,/g, ''));
  if (!sum) for (const m of txt.matchAll(/Footprint:\s*([\d,]+)\s*B/g)) sum += Number(m[1].replace(/,/g, ''));
  return Math.round(sum / 1048576);
}
function guard() {
  const free = Number(/free percentage:\s*(\d+)%/.exec(sh('memory_pressure', ['-Q']))?.[1] || 0);
  const level = Number(sh('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']).trim());
  const sw = sh('sysctl', ['-n', 'vm.swapusage']).match(/used = ([\d.]+)M/);
  return { free, level, swapUsedMB: sw ? Math.round(Number(sw[1])) : null };
}
function gateRoots(rows, mine) {
  return rows.filter((r) => /Chrome for Testing\.app\/Contents\/MacOS\/(Google )?Chrome for Testing/.test(r.cmd) && r.pid !== mine && !/--type=/.test(r.cmd));
}

if (NEED_GATE) {
  for (let i = 0; i < 120 && !gateRoots(procs(), -1).length; i++) await sleep(5000);
  if (!gateRoots(procs(), -1).length) { console.error('measure: no gate Chrome running beside; not measuring'); process.exit(3); }
}
const guardLogStart = existsSync(GUARD_LOG) ? readFileSync(GUARD_LOG, 'utf8').length : 0;
/** The same readings with no turntable: the gate Chrome and the rest of the machine on their own. */
const control = [];
for (const tc = Date.now(); Date.now() - tc < CONTROL_S * 1000;) {
  const rows = procs();
  const gates = gateRoots(rows, -1).flatMap((r) => tree(rows, r.pid));
  control.push({ t: Math.round((Date.now() - tc) / 1000), gateRssMB: Math.round(gates.reduce((a, r) => a + r.rssKB, 0) / 1024), gateProcs: gates.length, ...guard() });
  await sleep(5000);
}
installProfileCleanup();
const profile = profileDir(PORT + 1000);
const launchArgs = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1024,1024', '--renderer-process-limit=1',
  '--disable-extensions', '--disable-background-networking', '--disable-component-update'];
const res = { tool: 'tools/turntable/measure.mjs', asset: ASSET, seconds: SECONDS, launchArgs, viewport: { width: 1024, height: 1024, dpr: 1 }, startedAt: new Date().toISOString(), control, samples: [], reloads: 0, shots: 0, console: [] };
const t0 = Date.now();
const browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000, args: launchArgs });
const myRoot = browser.process()?.pid;
res.chrome = await browser.version();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') res.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => res.console.push('pageerror: ' + String(e).slice(0, 300)));
  const url = `http://127.0.0.1:${PORT}/tools/turntable/?asset=${encodeURIComponent(ASSET)}`;
  const load = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__TT__ && (window.__TT__.ready || window.__TT__.error)', { timeout: 120000, polling: 250 });
  };
  const tl = Date.now(); await load(); res.firstLoadMs = Date.now() - tl;
  res.page = await page.evaluate(() => ({ ready: window.__TT__.ready, error: window.__TT__.error, frame: window.__TT__.frame }));
  let lastReload = Date.now(), lastShot = 0;
  const swapHist = [];
  while (Date.now() - t0 < SECONDS * 1000) {
    const rows = procs();
    const mine = tree(rows, myRoot);
    const gates = gateRoots(rows, myRoot).flatMap((r) => tree(rows, r.pid));
    const g = guard();
    swapHist.push([Date.now(), g.swapUsedMB]);
    while (swapHist.length && Date.now() - swapHist[0][0] > 60000) swapHist.shift();
    const s = { t: Math.round((Date.now() - t0) / 1000), turntableRssMB: Math.round(mine.reduce((a, r) => a + r.rssKB, 0) / 1024), turntableProcs: mine.length,
      turntableFootprintMB: footprintMB(mine.map((r) => r.pid)), gateRssMB: Math.round(gates.reduce((a, r) => a + r.rssKB, 0) / 1024), gateProcs: gates.length,
      ...g, swapGrowth60sMB: swapHist.length ? g.swapUsedMB - swapHist[0][1] : 0 };
    res.samples.push(s);
    if (Date.now() - lastShot > 10000) { await page.screenshot({ path: path.join(OUT, `tt-${String(res.shots).padStart(3, '0')}.png`) }); res.shots++; lastShot = Date.now(); }
    if (Date.now() - lastReload > 30000) { await load(); res.reloads++; lastReload = Date.now(); }
    if (g.level >= ABORT_LEVEL || g.free < ABORT_FREE) { res.abort = `guard: level ${g.level}, free ${g.free} %`; break; }
    await sleep(5000);
  }
  res.pageEnd = await page.evaluate(() => ({ ready: window.__TT__.ready, error: window.__TT__.error, frame: window.__TT__.frame }));
} finally {
  try { await browser.close(); } catch { try { browser.process()?.kill('SIGKILL'); } catch { /* */ } }
  disposeProfile(profile);
  res.endedAt = new Date().toISOString();
  const log = existsSync(GUARD_LOG) ? readFileSync(GUARD_LOG, 'utf8').slice(guardLogStart) : '';
  res.guardLogDuring = log.split('\n').filter(Boolean);
  const S = res.samples;
  const max = (k) => Math.max(...S.map((x) => x[k] ?? 0)), min = (k) => Math.min(...S.map((x) => x[k] ?? 1e9));
  res.summary = S.length ? {
    samples: S.length, peakTurntableRssMB: max('turntableRssMB'), peakTurntableFootprintMB: max('turntableFootprintMB'),
    medianTurntableFootprintMB: S.map((x) => x.turntableFootprintMB).sort((a, b) => a - b)[S.length >> 1],
    peakGateRssMB: max('gateRssMB'), samplesWithGateChrome: S.filter((x) => x.gateProcs > 0).length,
    minFreePct: min('free'), maxPressureLevel: max('level'), maxSwapGrowth60sMB: max('swapGrowth60sMB'),
    guardEvents: res.guardLogDuring.filter((l) => /took|KILLED/.test(l)),
    samplesAtLevel2: S.filter((x) => x.level >= 2).length, samplesUnder50Free: S.filter((x) => x.free < 50).length,
    control: control.length ? { samples: control.length, minFreePct: Math.min(...control.map((x) => x.free)), maxPressureLevel: Math.max(...control.map((x) => x.level)),
      samplesAtLevel2: control.filter((x) => x.level >= 2).length, samplesUnder50Free: control.filter((x) => x.free < 50).length,
      medianFreePct: control.map((x) => x.free).sort((a, b) => a - b)[control.length >> 1], peakGateRssMB: Math.max(...control.map((x) => x.gateRssMB)) } : null,
    medianFreePct: S.map((x) => x.free).sort((a, b) => a - b)[S.length >> 1],
  } : null;
  const peak = res.summary ? Math.max(res.summary.peakTurntableRssMB, res.summary.peakTurntableFootprintMB) : null;
  res.verdict = res.summary ? {
    under15GB: peak < 1536, quietGuard: res.summary.maxPressureLevel <= 1 && res.summary.guardEvents.filter((l) => /KILLED/.test(l)).length === 0 && res.summary.minFreePct >= 50,
    besideGateChrome: res.summary.samplesWithGateChrome === res.summary.samples,
  } : null;
  writeFileSync(path.join(OUT, 'turntable-measure.json'), JSON.stringify(res, null, 1));
  console.log(`[turntable] ${JSON.stringify(res.summary)} verdict ${JSON.stringify(res.verdict)}`);
}
