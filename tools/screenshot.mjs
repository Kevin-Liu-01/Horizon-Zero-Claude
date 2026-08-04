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

const args = process.argv.slice(2);
const name = args[0] && !args[0].startsWith('--') ? args[0] : 'shot';
const getFlag = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const params = getFlag('--params', '');
const wait = parseInt(getFlag('--wait', '1200'), 10);
const evalJs = getFlag('--eval', null);
const PORT = 5173;

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

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  const url = `http://localhost:${PORT}/?shot=1${params ? '&' + params : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 60000 });

  if (evalJs) await page.evaluate(evalJs);
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
  await browser.close();
  if (viteProc) viteProc.kill();
}
