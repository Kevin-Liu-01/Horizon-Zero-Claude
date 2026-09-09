/**
 * Spike-reskin screenshot harness (model: tools/screenshot.mjs).
 *
 * Usage:
 *   node tools/spike-reskin-shot.mjs <clip> <t> [<clip> <t> ...] [--params "cam=side&weights=capsule"] [--suffix tag] [--wait 300]
 *
 * Boots (or reuses) vite on port 5192, opens
 *   http://localhost:5192/spike-reskin.html?clip=<clip>&t=<t>&<params>
 * waits for window.__READY__, saves shots/spike-reskin-<clip>-<t>[-suffix].png
 * (one browser session for all pairs).
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import net from 'net';

const PORT = 5192;
const args = process.argv.slice(2);
const getFlag = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
const params = getFlag('--params', '');
const suffix = getFlag('--suffix', '');
const wait = parseInt(getFlag('--wait', '250'), 10);
const evalJs = getFlag('--eval', null);
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { i++; continue; }
  positional.push(args[i]);
}
const pairs = [];
for (let i = 0; i + 1 < positional.length; i += 2) pairs.push([positional[i], positional[i + 1]]);
if (!pairs.length) { console.error('need <clip> <t> pairs'); process.exit(1); }

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
  for (let i = 0; i < 80; i++) {
    if (await portOpen(PORT)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'],
});
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    else if (msg.text().startsWith('reskin:')) console.log('  ' + msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  for (const [clip, t] of pairs) {
    errors.length = 0;
    const url = `http://localhost:${PORT}/spike-reskin.html?clip=${encodeURIComponent(clip)}&t=${encodeURIComponent(t)}${params ? '&' + params : ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForFunction('window.__READY__ === true || window.__ERROR__', { timeout: 90000 });
    } catch (e) {
      console.log(`TIMEOUT waiting for ${url}`);
      failed = true;
    }
    const err = await page.evaluate('window.__ERROR__ || null');
    if (err) { console.log(`PAGE ERROR (${clip}@${t}): ${err}`); failed = true; }
    if (evalJs) {
      const out = await page.evaluate(evalJs);
      console.log(`EVAL (${clip}@${t}):`, typeof out === 'string' ? out : JSON.stringify(out, null, 1));
    }
    await new Promise((r) => setTimeout(r, wait));
    const path = `shots/spike-reskin-${clip}-${t}${suffix ? '-' + suffix : ''}.png`;
    await page.screenshot({ path });
    const hud = await page.evaluate('document.getElementById("hud")?.textContent');
    console.log(`saved ${path}  [${hud}]`);
    if (errors.length) {
      console.log('CONSOLE ERRORS:');
      for (const e of errors.slice(0, 12)) console.log('  ' + e);
      failed = true;
    }
  }
} finally {
  await browser.close();
  if (viteProc) viteProc.kill();
}
if (failed) process.exitCode = 2;
