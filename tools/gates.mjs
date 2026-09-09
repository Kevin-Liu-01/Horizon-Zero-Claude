/**
 * Round 3 gate runner — literal visual + action quality gates.
 *
 * Usage:
 *   node tools/gates.mjs [--port 5173] [--only A2-dodge-displacement,V1-sprint-frame] [--lane animator]
 *
 * Each gate gets a FRESH page (no state bleed). Action gates auto pass/fail from
 * their assert expression; any console error during a gate fails it. Visual gates
 * capture shots/gates/<id>.png for judging against written criteria.
 *
 * Outputs: shots/gates/*.png, shots/gates/report.json, shots/gates/report.md
 * Exit code 1 if any action gate FAILS (pending/skip does not fail the run).
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import net from 'net';
import { GATES } from './gates.config.mjs';

const args = process.argv.slice(2);
const getFlag = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const PORT = parseInt(getFlag('--port', process.env.SHOT_PORT || '5173'), 10);
const only = getFlag('--only', null)?.split(',').map((s) => s.trim());
const lane = getFlag('--lane', null);

let gates = GATES;
if (only) gates = gates.filter((g) => only.includes(g.id));
if (lane) gates = gates.filter((g) => g.lane === lane);
if (!gates.length) {
  console.error('no gates matched');
  process.exit(1);
}

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

mkdirSync('shots/gates', { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'],
});

const results = [];
try {
  for (const gate of gates) {
    const res = { id: gate.id, kind: gate.kind, lane: gate.lane, title: gate.title };
    const t0 = Date.now();
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    try {
      await page.setViewport({ width: 1600, height: 900 });
      const url = gate.plain
        ? `http://localhost:${PORT}/${gate.params ? '?' + gate.params : ''}`
        : `http://localhost:${PORT}/?shot=1${gate.params ? '&' + gate.params : ''}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (gate.plain) {
        await page.waitForFunction(
          `document.querySelector('#title') && !document.querySelector('#title').classList.contains('hidden')` +
          ` && document.querySelector('#loading') && document.querySelector('#loading').classList.contains('hidden')`,
          { timeout: 60000 });
        await page.evaluate('document.fonts ? document.fonts.ready : true');
      } else {
        await page.waitForFunction('window.__READY__ === true', { timeout: 60000 });
      }

      if (gate.setup) await page.evaluate(gate.setup);
      await new Promise((r) => setTimeout(r, gate.settle ?? 1200));

      if (gate.kind === 'action' && gate.assert) {
        const out = await Promise.race([
          page.evaluate(gate.assert),
          new Promise((_, rej) => setTimeout(() => rej(new Error('gate assert timeout (30s)')), 30000)),
        ]);
        res.pass = out?.pass;
        res.detail = out?.detail;
        res.status = out?.pass === true ? 'PASS' : out?.pass === null ? 'PENDING' : 'FAIL';
      } else {
        res.status = 'NEEDS-JUDGE';
        res.criteria = gate.criteria;
      }

      const shotPath = `shots/gates/${gate.id}.png`;
      await page.screenshot({ path: shotPath });
      res.shot = shotPath;

      if (errors.length) {
        res.consoleErrors = errors.slice(0, 8);
        if (gate.kind === 'action') res.status = 'FAIL';
      }
    } catch (err) {
      res.status = gate.kind === 'action' ? 'FAIL' : 'ERROR';
      res.error = String(err?.message || err);
    } finally {
      res.ms = Date.now() - t0;
      await page.close().catch(() => {});
    }
    results.push(res);
    console.log(`[${res.status}] ${gate.id} (${res.ms}ms)${res.detail ? ' ' + JSON.stringify(res.detail) : ''}${res.error ? ' ERR: ' + res.error : ''}`);
  }
} finally {
  await browser.close();
  if (viteProc) viteProc.kill();
}

const stamp = new Date().toISOString();
writeFileSync('shots/gates/report.json', JSON.stringify({ stamp, port: PORT, results }, null, 2));

const rows = results.map((r) =>
  `| ${r.id} | ${r.lane} | ${r.status} | ${r.detail ? '`' + JSON.stringify(r.detail).slice(0, 120) + '`' : r.criteria ? r.criteria.slice(0, 90) + '…' : ''} |`
);
writeFileSync('shots/gates/report.md',
  `# Gate report — ${stamp}\n\n| gate | lane | status | detail / criteria |\n|---|---|---|---|\n${rows.join('\n')}\n`);

const failed = results.filter((r) => r.status === 'FAIL');
console.log(`\n${results.length} gates: ${results.filter((r) => r.status === 'PASS').length} pass, ${failed.length} fail, ` +
  `${results.filter((r) => r.status === 'PENDING').length} pending, ${results.filter((r) => r.status === 'NEEDS-JUDGE').length} need judging`);
if (failed.length) process.exitCode = 1;
