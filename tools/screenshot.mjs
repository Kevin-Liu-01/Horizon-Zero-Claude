/**
 * Gauntlet screenshot harness.
 *
 * Usage:
 *   node tools/screenshot.mjs <outName> [--params "px=10&pz=20&yaw=1.2&pitch=0.3"] [--wait 1500] [--eval "JS"]
 *
 * Boots (or reuses) the vite dev server on port 5173, loads the game with
 * ?shot=1&<params>, waits for window.__READY__, optionally runs --eval JS
 * (with __GAME__/__CTX__ available), waits --wait ms of settle time, then
 * saves a 1600x900 PNG to shots/<outName>.png.
 *
 * Supported URL params (read by game code):
 *   px, pz         player position
 *   yaw, pitch     camera orbit
 *   q=low|high     quality
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import net from 'net';
import { sweepProfiles, profileDir, disposeProfile, installProfileCleanup } from './chrome-profile.mjs';

const args = process.argv.slice(2);
const name = args[0] && !args[0].startsWith('--') ? args[0] : 'shot';
const getFlag = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const params = getFlag('--params', '');
const wait = parseInt(getFlag('--wait', '1200'), 10);
const evalJs = getFlag('--eval', null);
const PORT = parseInt(getFlag('--port', process.env.SHOT_PORT || '5173'), 10);

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
}

let viteProc = null;
if (!(await portOpen(PORT))) {
  viteProc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'ignore', detached: false,
  });
  for (let i = 0; i < 60; i++) {
    if (await portOpen(PORT)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

mkdirSync('shots', { recursive: true });

/**
 * PROFILE LEAK (core-platform-followup2). This harness is run dozens of times a
 * round, often killed mid-shot when a probe is wrong, and every kill abandoned a
 * ~70 MB `puppeteer_dev_chrome_profile-*` in $TMPDIR — they filled the disk.
 * Own the directory, delete it in the finally and from the exit handlers, and
 * reap anything a previous kill left behind. See tools/chrome-profile.mjs.
 */
installProfileCleanup();
{
  // FIX ROUND 2: a kill that leaves the browser behind (the box SIGKILLs a lane,
  // Chrome reparents to pid 1 and keeps its profile locked) is reclaimed here
  // too, and said out loud — the reason the leak survived a whole round is that
  // the sweep that kept those directories reported nothing at all.
  const s = sweepProfiles();
  if (s.reapedOrphans) {
    console.log(`[shot] killed ${s.reapedOrphans} orphaned chrome tree(s) `
      + `(pids ${s.killedPids.join(',')}) and reclaimed their profiles`);
  }
}
const userDataDir = profileDir(PORT);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'],
  userDataDir,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  // Neutralise vite's HMR socket: with sixteen lanes saving into this repo, a
  // full reload otherwise lands in the middle of an --eval or a settle window.
  await page.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    function Dead() {
      const t = new EventTarget();
      t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
      setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0);
      return t;
    }
    window.WebSocket = function (url, protocols) {
      const p = Array.isArray(protocols) ? protocols[0] : protocols;
      if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead();
      return new Real(url, protocols);
    };
    window.WebSocket.prototype = Real.prototype;
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  const url = `http://localhost:${PORT}/?shot=1${params ? '&' + params : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 60000 });

  // FIX ROUND 1: --eval used to swallow its own return value, so every probe
  // had to smuggle results out through a screenshot. Print whatever it
  // resolves to (JSON, depth-safe) so `--eval` is a real measurement channel.
  if (evalJs) {
    const value = await page.evaluate(evalJs);
    if (value !== undefined) {
      let text;
      try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
      console.log('EVAL: ' + text);
    }
  }
  await new Promise((r) => setTimeout(r, wait));

  const path = `shots/${name}.png`;
  await page.screenshot({ path });
  console.log(`saved ${path}`);
  if (errors.length) {
    console.log('CONSOLE ERRORS:');
    for (const e of errors.slice(0, 12)) console.log('  ' + e);
    process.exitCode = 2;
  }
} finally {
  await browser.close().catch(() => {
    try { browser.process()?.kill('SIGKILL'); } catch { /* already gone */ }
  });
  disposeProfile(userDataDir);
  if (viteProc) viteProc.kill();
}
