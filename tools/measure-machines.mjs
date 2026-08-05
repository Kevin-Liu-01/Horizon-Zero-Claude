// Draw-call measurement harness (based on tools/screenshot.mjs).
// Usage: node measure.mjs --port 5184 --params "px=..&pz=..&yaw=..&pitch=.." [--eval JS]
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import net from 'net';

const args = process.argv.slice(2);
const getFlag = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const params = getFlag('--params', '');
const evalJs = getFlag('--eval', null);
const PORT = parseInt(getFlag('--port', '5184'), 10);

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
    cwd: '/Users/kevinliu/horizon-zero-claude', stdio: 'ignore', detached: false,
  });
  for (let i = 0; i < 60; i++) {
    if (await portOpen(PORT)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  const url = `http://localhost:${PORT}/?shot=1${params ? '&' + params : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 60000 });
  if (evalJs) await page.evaluate(evalJs);
  await new Promise((r) => setTimeout(r, 1500));
  const res = await page.evaluate(async () => {
    const info = window.__CTX__.renderer.info;
    info.autoReset = false;
    // sync to a frame boundary, reset, accumulate exactly N frames
    await new Promise((r) => requestAnimationFrame(r));
    info.reset();
    const N = 10;
    for (let i = 0; i < N; i++) await new Promise((r) => requestAnimationFrame(r));
    const out = {
      calls: Math.round(info.render.calls / N),
      triangles: Math.round(info.render.triangles / N),
      geometries: info.memory.geometries, textures: info.memory.textures,
    };
    info.autoReset = true;
    // count part meshes casting shadows
    let castParts = 0, castTotal = 0;
    window.__CTX__.scene.traverse((o) => {
      if (o.isMesh && o.castShadow) {
        castTotal += 1;
        if (o.userData.part) castParts += 1;
      }
    });
    out.shadowCasters = castTotal;
    out.shadowCastingPartMeshes = castParts;
    return out;
  });
  console.log(JSON.stringify(res));
  if (errors.length) {
    console.log('CONSOLE ERRORS:');
    for (const e of errors.slice(0, 12)) console.log('  ' + e);
    process.exitCode = 2;
  }
} finally {
  await browser.close();
  if (viteProc) viteProc.kill();
}
