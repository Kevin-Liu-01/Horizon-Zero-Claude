/**
 * Spike C (hybrid) screenshot harness — modeled on tools/screenshot.mjs.
 *
 *   node tools/spike-hybrid-shot.mjs <clip> <t> [--params "speed=3&view=side"] [--suffix name] [--wait 250]
 *   node tools/spike-hybrid-shot.mjs --batch            # the default review set
 *
 * Boots (or reuses) vite on port 5193, opens
 * http://localhost:5193/spike-hybrid.html?clip=<clip>&t=<t>[&params], waits for
 * window.__READY__, saves shots/spike-hybrid-<clip>[-<suffix>]-<t>.png.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import net from 'net';

const PORT = 5193;
const args = process.argv.slice(2);
const flag = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const wait = parseInt(flag('--wait', '250'), 10);
const batch = args.includes('--batch');

const BATCH = [
  ['idle', 0.0], ['idle', 1.2], ['walk', 0.0], ['walk', 0.33], ['walk', 0.66], ['walk', 1.0],
  ['jog', 0.0], ['jog', 0.45], ['run', 0.0], ['run', 0.17], ['run', 0.33], ['run', 0.5],
  ['crouch', 0.5], ['crouchwalk', 0.5], ['crouchwalk', 1.5],
  ['roll', 0.3], ['roll', 0.7], ['roll', 1.1], ['hit', 0.15], ['death', 2.0], ['aimidle', 0.5],
  ['walk', 0.66, 'view=side', 'side'], ['run', 0.33, 'view=side', 'side'], ['run', 0.33, 'view=back', 'back'],
  ['blend', 1.0, 'speed=1.0', 'idle-walk'], ['blend', 1.0, 'speed=3.0', 'walk-jog'],
  ['blend', 1.0, 'speed=6.0', 'jog-run'], ['blend', 1.0, 'speed=1.0&crouch=1', 'crouchwalk'],
  ['blend', 1.0, 'speed=1.0&crouch=0.5', 'halfcrouch'], ['walk', 0.33, 'conform=0', 'noconform'],
];

const jobs = batch
  ? BATCH
  : [[args[0] && !args[0].startsWith('--') ? args[0] : 'walk', parseFloat(args[1] && !args[1].startsWith('--') ? args[1] : '0'),
    flag('--params', ''), flag('--suffix', '')]];

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
let failures = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  for (const [clip, t, extra = '', suffix = ''] of jobs) {
    errors.length = 0;
    const url = `http://localhost:${PORT}/spike-hybrid.html?clip=${encodeURIComponent(clip)}&t=${t}${extra ? '&' + extra : ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForFunction('window.__READY__ === true', { timeout: 60000 });
    } catch (e) {
      console.log(`TIMEOUT waiting for __READY__ on ${url}`);
      failures++;
      if (errors.length) for (const er of errors.slice(0, 8)) console.log('  ' + er);
      continue;
    }
    await new Promise((r) => setTimeout(r, wait));
    const path = `shots/spike-hybrid-${clip}${suffix ? '-' + suffix : ''}-${t}.png`;
    await page.screenshot({ path });
    console.log(`saved ${path}`);
    if (errors.length) {
      console.log('CONSOLE ERRORS:');
      for (const er of errors.slice(0, 12)) console.log('  ' + er);
      failures++;
    }
  }
} finally {
  await browser.close();
  if (viteProc) viteProc.kill();
}
if (failures) process.exitCode = 2;
