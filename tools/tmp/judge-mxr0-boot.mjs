import puppeteer from 'puppeteer';
import { profileDir, disposeProfile } from '../chrome-profile.mjs';
const PORT = +(process.argv[2] || 5207);
const dir = profileDir(PORT + 1000);
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], userDataDir: dir });
const t0 = Date.now();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${((Date.now()-t0)/1000).toFixed(1)}s ${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => logs.push(`${((Date.now()-t0)/1000).toFixed(1)}s pageerror: ${String(e).slice(0, 300)}`));
  await page.goto(`http://localhost:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('dom', (Date.now() - t0) / 1000);
  for (let i = 0; i < 90; i++) {
    const s = await page.evaluate(() => ({ ready: window.__READY__ === true, varietyReady: !!window.__CTX__?.machines?.varietyReady, expansionReady: !!window.__CTX__?.machines?.expansionReady, machines: window.__CTX__?.machines?.list?.length ?? null, frames: window.__CTX__?.engine?.frames ?? null }));
    if (i % 5 === 0 || s.ready) console.log(((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(s));
    if (s.ready && s.expansionReady) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(logs.join('\n'));
} finally {
  await browser.close().catch(() => {});
  disposeProfile(dir);
}
