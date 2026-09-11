import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { sweepProfiles, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
const PORT = 5212;
mkdirSync('shots', { recursive: true });
installProfileCleanup(); sweepProfiles();
const userDataDir = profileDir(PORT + 900);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'],
  userDataDir,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    function Dead() { const t = new EventTarget(); t.readyState = 1; t.protocol='vite-hmr'; t.send=()=>{}; t.close=()=>{t.readyState=3;}; setTimeout(()=>{const e=new Event('open'); t.dispatchEvent(e); if(typeof t.onopen==='function') t.onopen(e);},0); return t; }
    window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols)?protocols[0]:protocols; if (p==='vite-hmr' || (typeof url==='string'&&url.includes('vite'))) return Dead(); return new Real(url, protocols); };
    window.WebSocket.prototype = Real.prototype;
    Object.assign(window.WebSocket, {CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3});
  });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e)));
  await page.goto(`http://localhost:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 150000 });
  await new Promise(r => setTimeout(r, 1800));

  // --- key collision probe -------------------------------------------------
  const keys = await page.evaluate(async () => {
    const c = window.__CTX__;
    const snap = () => ({ toolIdx: c.items.tools.index, tool: c.items.tools.active?.id,
      weapon: c.combat?.weapon?.name ?? c.combat?.weapon?.id ?? c.combat?.weaponId ?? null });
    const fire = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    const before = snap();
    fire('Digit3'); await new Promise(r => setTimeout(r, 260));
    const after3 = snap();
    fire('Digit2'); await new Promise(r => setTimeout(r, 260));
    const after2 = snap();
    return { before, after3, after2 };
  });
  console.log('KEYS', JSON.stringify(keys));

  for (const p of ['tools', 'valuables', 'crafting', 'notebook', 'trade']) {
    const info = await page.evaluate(async (pk) => {
      const c = window.__CTX__;
      c.items.screen.close();
      await new Promise(r => setTimeout(r, 150));
      const ok = c.items.openInventory(pk);
      await new Promise(r => setTimeout(r, 550));
      return { ok, pocket: c.items.screen.pocket };
    }, p);
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: `shots/judge-focus-items-r0-inv-${p}.png` });
    console.log('POCKET', p, JSON.stringify(info));
  }
  await page.evaluate(() => window.__CTX__.items.screen.close());
  console.log('ERRORS', errors.length, errors.slice(0, 8).join(' | '));
} finally {
  await browser.close().catch(() => {});
  disposeProfile(userDataDir);
}
