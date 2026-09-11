import puppeteer from 'puppeteer';
import { sweepProfiles, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
installProfileCleanup(); sweepProfiles();
const dir = profileDir(7777);
const b = await puppeteer.launch({ headless: 'new', args: ['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'], userDataDir: dir });
try {
  const p = await b.newPage();
  const errs = [];
  p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
  p.on('requestfailed', r => errs.push('REQFAIL ' + r.url()));
  await p.goto('http://localhost:5210/?shot=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 45000));
  const st = await p.evaluate(() => ({ ready: window.__READY__, hasCtx: !!window.__CTX__, state: window.__CTX__?.state,
    loading: document.querySelector('#loading')?.textContent?.slice(0,120) }));
  console.log('STATE', JSON.stringify(st));
  console.log('ERRORS', errs.length);
  for (const e of errs.slice(0, 15)) console.log('  ' + e.slice(0, 300));
} finally { await b.close().catch(()=>{}); disposeProfile(dir); }
