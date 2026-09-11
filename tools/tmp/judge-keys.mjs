import puppeteer from 'puppeteer';
import { sweepProfiles, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
installProfileCleanup(); sweepProfiles();
const dir = profileDir(7001);
const b = await puppeteer.launch({ headless:'new', args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'], userDataDir: dir });
try {
  const p = await b.newPage();
  await p.setViewport({ width: 1600, height: 900 });
  await p.evaluateOnNewDocument(() => { const R=window.WebSocket; function D(){const t=new EventTarget();t.readyState=1;t.protocol='vite-hmr';t.send=()=>{};t.close=()=>{t.readyState=3;};setTimeout(()=>{const e=new Event('open');t.dispatchEvent(e);if(typeof t.onopen==='function')t.onopen(e);},0);return t;} window.WebSocket=function(u,pr){const q=Array.isArray(pr)?pr[0]:pr; if(q==='vite-hmr'||(typeof u==='string'&&u.includes('vite')))return D(); return new R(u,pr);}; window.WebSocket.prototype=R.prototype; Object.assign(window.WebSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3}); });
  await p.goto('http://localhost:5212/?shot=1', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForFunction('window.__READY__===true', { timeout: 150000 });
  await new Promise(r=>setTimeout(r,1500));
  const out = await p.evaluate(async () => {
    const c = window.__CTX__;
    const snap = () => ({ tool: c.items.tools.active?.id,
      weapon: c.combat.activeWeapon?.id ?? c.combat.activeWeapon?.name ?? null });
    const fire = code => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles:true }));
    const before = snap();
    fire('Digit3'); await new Promise(r=>setTimeout(r,300));
    const a3 = snap();
    fire('Digit1'); await new Promise(r=>setTimeout(r,300));
    const a1 = snap();
    return { before, afterDigit3: a3, afterDigit1: a1 };
  });
  console.log(JSON.stringify(out, null, 1));
} finally { await b.close().catch(()=>{}); disposeProfile(dir); }
