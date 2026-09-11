/** Film the PLAIN (title-screen) boot on a given port. */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';

const args = process.argv.slice(2);
const name = args[0] || 'plain';
const getFlag = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const PORT = parseInt(getFlag('--port', '5215'), 10);
const waitMs = parseInt(getFlag('--wait', '3500'), 10);
const evalJs = getFlag('--eval', null);

mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'],
});
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.setViewport({ width: 1600, height: 900 });
// vite's HMR reloads the page mid-shot every time a file is saved — same stub
// the gate runner installs (tools/gates.mjs HMR_STUB).
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
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(
  `document.querySelector('#title') && !document.querySelector('#title').classList.contains('hidden')`
  + ` && document.querySelector('#loading') && document.querySelector('#loading').classList.contains('hidden')`,
  { timeout: 120000 });
if (evalJs) {
  const out = await page.evaluate(evalJs);
  console.log('EVAL:', JSON.stringify(out));
}
await new Promise((r) => setTimeout(r, waitMs));
await page.screenshot({ path: `shots/${name}.png` });
console.log(`saved shots/${name}.png`, errs.length ? `ERRORS: ${errs.slice(0, 4).join(' | ')}` : '');
await browser.close();
