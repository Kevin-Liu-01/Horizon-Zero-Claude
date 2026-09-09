/**
 * Retarget-spike screenshot harness (mirrors tools/screenshot.mjs).
 *
 * Usage:
 *   node tools/spike-retarget-shot.mjs <clip>[,<clip>...] [--t 0.4[,0.8,...]]
 *        [--params "cam=side&src=1&fix=all"] [--wait 300] [--eval "JS"] [--dump]
 *
 * Boots (or reuses) vite on port 5191 (fixed — never another port), opens
 * http://localhost:5191/spike-retarget.html?shot=1&clip=<clip>&t=<t>&<params>,
 * waits for window.__READY__, then saves shots/spike-retarget-<clip>-<t>.png
 * (a --tag suffix is appended before .png when given, to keep variants apart).
 *
 * --dump prints window.__RETARGET__.info as JSON after each shot (bone map
 * coverage, hip scale, ground shift, per-clip metrics).
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import net from 'net';

const PORT = 5191;
const args = process.argv.slice(2);
const clipsArg = args[0] && !args[0].startsWith('--') ? args[0] : 'Idle_Loop';
const getFlag = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const hasFlag = (flag) => args.includes(flag);
const clips = clipsArg.split(',').map((s) => s.trim()).filter(Boolean);
const times = String(getFlag('--t', '0')).split(',').map((s) => s.trim()).filter(Boolean);
const params = getFlag('--params', '');
const wait = parseInt(getFlag('--wait', '250'), 10);
const evalJs = getFlag('--eval', null);
const tag = getFlag('--tag', '');
const dump = hasFlag('--dump');

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
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning' && /retarget/i.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  for (const clip of clips) {
    for (const t of times) {
      const q = `shot=1&clip=${encodeURIComponent(clip)}&t=${encodeURIComponent(t)}${params ? '&' + params : ''}`;
      const url = `http://localhost:${PORT}/spike-retarget.html?${q}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction('window.__READY__ === true', { timeout: 60000 });
      if (evalJs) await page.evaluate(evalJs);
      await new Promise((r) => setTimeout(r, wait));
      const path = `shots/spike-retarget-${clip}-${t}${tag ? '-' + tag : ''}.png`;
      await page.screenshot({ path });
      console.log(`saved ${path}`);
      if (dump) {
        const info = await page.evaluate('JSON.stringify(window.__RETARGET__ && window.__RETARGET__.info, null, 1)');
        console.log(info);
      }
    }
  }
  if (errors.length) {
    console.log('CONSOLE ERRORS:');
    for (const e of errors.slice(0, 20)) console.log('  ' + e);
    process.exitCode = 2;
  }
} finally {
  await browser.close();
  if (viteProc) viteProc.kill();
}
