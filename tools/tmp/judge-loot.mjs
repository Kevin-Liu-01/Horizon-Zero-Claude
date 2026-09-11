import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { sweepProfiles, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
const PORT = 5212;
mkdirSync('shots', { recursive: true });
installProfileCleanup(); sweepProfiles();
const userDataDir = profileDir(PORT + 800);
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
    function Dead() { const t = new EventTarget(); t.readyState=1; t.protocol='vite-hmr'; t.send=()=>{}; t.close=()=>{t.readyState=3;}; setTimeout(()=>{const e=new Event('open'); t.dispatchEvent(e); if(typeof t.onopen==='function') t.onopen(e);},0); return t; }
    window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols)?protocols[0]:protocols; if (p==='vite-hmr' || (typeof url==='string'&&url.includes('vite'))) return Dead(); return new Real(url, protocols); };
    window.WebSocket.prototype = Real.prototype;
    Object.assign(window.WebSocket, {CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3});
  });
  const errors = [];
  page.on('console', (m) => { if (m.type()==='error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e)));
  await page.goto(`http://localhost:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 150000 });
  await new Promise(r => setTimeout(r, 1800));

  // 1) HERB VARIANTS -- stand in a herb cluster, Focus on
  const herb = await page.evaluate(async () => {
    const c = window.__CTX__, p = c.player;
    const g = c.interactables.gather;
    const nodes = (c.interactables.list||[]).filter(e => e?.gatherNode?.kind === 'herb' && !e.removed);
    if (!nodes.length) return 'none';
    const n0 = nodes[0];
    const ang = Math.atan2(n0.position.x - (n0.position.x - 6), 1);
    p.position.set(n0.position.x - 5, 0, n0.position.z - 5);
    p._snapToGround?.();
    p.camYaw = Math.atan2(n0.position.x - p.position.x, n0.position.z - p.position.z);
    p.camPitch = -0.42;
    p.heading = p.camYaw + Math.PI;
    c.focus.toggle(true);
    await new Promise(r => setTimeout(r, 2200));
    return { variants: g.herbVariantCounts, herbCount: g.herbCount,
      nearby: nodes.slice(0,6).map(e => e.gatherNode.itemId) };
  });
  console.log('HERB', JSON.stringify(herb));
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'shots/judge-focus-items-r0-herbs.png' });

  // 2) LOOT POPUP projected on a wreck
  const loot = await page.evaluate(async () => {
    const c = window.__CTX__, p = c.player;
    const m = c.machines.list.find(x => x.kind === 'watcher' && x.alive) || c.machines.list.find(x => x.alive);
    const px = p.position.x + 6, pz = p.position.z + 4;
    const y = c.terrain.getHeight(px, pz);
    m.position.set(px, y, pz); m.root?.position?.set?.(px, y, pz);
    let mesh = null; m.root.traverse(o => { if (!mesh && (o.isMesh || o.isSkinnedMesh)) mesh = o; });
    m.takeDamage({ point: m.position.clone(), object: mesh, impact: 99999, tear: 0,
      element: 'none', elementAmount: 0, dir: {x:0,y:0,z:1}, type: 'hunter', baseDamage: 99999 });
    const t0 = performance.now();
    let wreck = null;
    while (performance.now() - t0 < 9000) {
      wreck = (c.interactables.list||[]).find(e => e && !e.removed && e.machine === m && Array.isArray(e.loot));
      if (wreck) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!wreck) return 'no wreck';
    p.camYaw = Math.atan2(wreck.position.x - p.position.x, wreck.position.z - p.position.z);
    p.camPitch = -0.12; p.heading = p.camYaw + Math.PI;
    const seen = [];
    c.events.on('loot-rummage', (e) => seen.push({ label: e.label, src: e.sourceName, rows: e.rows?.length, dur: e.duration, hasPos: !!e.position }));
    await new Promise(r => setTimeout(r, 400));
    c.interactables._fire(wreck);
    await new Promise(r => setTimeout(r, 500));
    const el = document.querySelector('.hzc-loot');
    const r = el.getBoundingClientRect();
    return { rummage: seen, popup: { cls: el.className, rect: [r.left|0, r.top|0, r.width|0, r.height|0], text: el.textContent.replace(/\s+/g,' ').trim().slice(0,140) } };
  });
  console.log('LOOT', JSON.stringify(loot));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'shots/judge-focus-items-r0-loot.png' });
  console.log('ERRORS', errors.length, errors.slice(0,8).join(' | '));
} finally {
  await browser.close().catch(()=>{});
  disposeProfile(userDataDir);
}
