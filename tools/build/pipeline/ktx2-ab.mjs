/**
 * M0.10 acceptance: the Frame Set rendered with the shipped KTX2 textures against the SAME page and the same frozen
 * frame rendered with the uncompressed reference set (tools/build/pipeline/ktx2.mjs --raw <dir>: the same textures,
 * same mips, RGBA8).
 *
 *   node tools/build/pipeline/ktx2-ab.mjs --port 5270 --ref <raw dir> --out <dir outside the repo>
 *        [--only F02,F11] [--settle 2600] [--budget 840] [--reuse-server] [--protocol-timeout 120000] [--swap-keys map,normalMap]
 *   node tools/build/pipeline/ktx2-ab.mjs --compare <dirA> <dirB> [--json out.json]     (no browser)
 *
 * One Chrome, one page, under the machine guard and Chrome slot 1 (the rules of tools/frames/film.mjs). Each frame is
 * staged once with tools/frames/page.mjs (which freezes the world), then filmed three times: as shipped (ktx2/), with
 * every KTX2-loaded texture in the scene swapped for its uncompressed twin (ref/: the twins are fetched under
 * /__ktx2ref__/ and answered from <raw dir>), and as shipped again (ktx2-again/: the filmer's own noise floor).
 * Per frame: mean CIEDE2000 over all pixels and the worst 8 x 8 block (mean ΔE2000 of the block). Bars (BUILD M0.10):
 * mean ≤ 1.0 in every frame; no block over 3 in F11-F13. The GPU bytes of every loaded texture are read in the page
 * (src/core/ktx2.js `textureBytes`).
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmOrder, loadFrameSet } from '../../frames/frameset.mjs';
import { stageFrame, unstageFrame } from '../../frames/page.mjs';
import { SLOTS, assertOutsideRepo } from '../../frames/paths.mjs';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../../chrome-profile.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[ktx2-ab ${new Date().toISOString().slice(11, 19)}]`, ...a);

export const BARS = Object.freeze({ meanDE: 1.0, blockDE: 3.0, blockFrames: ['F11', 'F12', 'F13'], block: 8 });

/* ------------------------------------------------------------------ CIEDE2000 */
const lin = new Float64Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
const f3 = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
function lab(r, g, b, out, o) {
  const R = lin[r], G = lin[g], B = lin[b];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const fx = f3(x), fy = f3(y), fz = f3(z);
  out[o] = 116 * fy - 16; out[o + 1] = 500 * (fx - fy); out[o + 2] = 200 * (fy - fz);
}
const D = Math.PI / 180;
export function de2000(L1, a1, b1, L2, a2, b2) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  let hp1 = Math.atan2(b1, ap1); if (hp1 < 0) hp1 += 2 * Math.PI;
  let hp2 = Math.atan2(b2, ap2); if (hp2 < 0) hp2 += 2 * Math.PI;
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh / 2);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) { if (Math.abs(hp1 - hp2) > Math.PI) hb += hb < 2 * Math.PI ? 2 * Math.PI : -2 * Math.PI; hb /= 2; }
  const T = 1 - 0.17 * Math.cos(hb - 30 * D) + 0.24 * Math.cos(2 * hb) + 0.32 * Math.cos(3 * hb + 6 * D) - 0.20 * Math.cos(4 * hb - 63 * D);
  const dTh = 30 * D * Math.exp(-(((hb / D - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T;
  const Rt = -Math.sin(2 * dTh) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/** Compare two PNGs of the same size: mean ΔE2000, share of pixels over 1 and 3, worst 8 × 8 block and where. */
export async function compareFrames(fa, fb, block = BARS.block) {
  const A = await sharp(fa).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(fb).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = A.info;
  if (B.info.width !== w || B.info.height !== h) throw new Error(`${fa} and ${fb} differ in size`);
  const la = new Float64Array(3), lb = new Float64Array(3);
  const bw = Math.floor(w / block), bh = Math.floor(h / block);
  const bs = new Float64Array(bw * bh);
  let sum = 0, over1 = 0, over3 = 0, max = 0;
  const cache = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const pa = (A.data[i] << 16) | (A.data[i + 1] << 8) | A.data[i + 2];
    const pb = (B.data[i] << 16) | (B.data[i + 1] << 8) | B.data[i + 2];
    let d = 0;
    if (pa !== pb) {
      const k = pa * 16777216 + pb;
      d = cache.get(k);
      if (d === undefined) {
        lab(A.data[i], A.data[i + 1], A.data[i + 2], la, 0); lab(B.data[i], B.data[i + 1], B.data[i + 2], lb, 0);
        d = de2000(la[0], la[1], la[2], lb[0], lb[1], lb[2]);
        if (cache.size < 4e6) cache.set(k, d);
      }
    }
    sum += d; if (d > 1) over1++; if (d > 3) over3++; if (d > max) max = d;
    const bx = Math.floor(x / block), by = Math.floor(y / block);
    if (bx < bw && by < bh) bs[by * bw + bx] += d;
  }
  let worst = 0, at = 0;
  for (let k = 0; k < bs.length; k++) { const m = bs[k] / (block * block); if (m > worst) { worst = m; at = k; } }
  const n = w * h;
  return { meanDE: +(sum / n).toFixed(4), pctOver1: +(100 * over1 / n).toFixed(3), pctOver3: +(100 * over3 / n).toFixed(3),
    maxPixelDE: +max.toFixed(2), worstBlockDE: +worst.toFixed(3), worstBlockAt: [(at % bw) * block, Math.floor(at / bw) * block] };
}

/** Compare every frame present in both directories. */
export async function compareDirs(da, db, { only = null } = {}) {
  const rows = [];
  const ids = JSON.parse(readFileSync(path.join(db, 'pass.json'), 'utf8')).frames.filter((f) => f.ok).map((f) => f.id);
  for (const id of ids) {
    if (only && !only.has(id)) continue;
    const fa = path.join(da, `${id}.png`), fb = path.join(db, `${id}.png`);
    if (!existsSync(fa) || !existsSync(fb)) continue;
    const c = await compareFrames(fa, fb);
    const blockBar = BARS.blockFrames.includes(id);
    rows.push({ id, ...c, passMean: c.meanDE <= BARS.meanDE, passBlock: blockBar ? c.worstBlockDE <= BARS.blockDE : null });
  }
  return rows;
}

/* ------------------------------------------------------------------ browser passes */
function memory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}
const portOn = (p, host) => new Promise((r) => { const s = net.connect(p, host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const portOpen = async (p) => (await portOn(p, '127.0.0.1')) || (await portOn(p, '::1'));

/** In the page: GPU bytes of every texture the game has loaded (KTX2 files) and of all textures in the scene. */
async function residentInPage() {
  const ctx = window.__CTX__;
  const K = ctx.assets.ktx2;
  const seen = new Map();
  const visit = (t, tag) => { if (t?.isTexture && !t.isRenderTargetTexture && !seen.has(t.uuid)) seen.set(t.uuid, { t, tag }); };
  const scanMat = (m) => {
    if (!m) return;
    for (const v of Object.values(m)) visit(v, 'mat');
    for (const u of Object.values(m.uniforms || {})) { const v = u?.value; if (Array.isArray(v)) v.forEach((x) => visit(x, 'uni')); else visit(v, 'uni'); }
  };
  const scan = (root) => root?.traverse?.((o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(scanMat); });
  scan(ctx.scene);
  for (const e of Object.values(ctx.assets.models || {})) scan(e.root);
  for (const t of Object.values(ctx.assets.textures || {})) visit(t, 'row');
  let file = 0, all = 0, nFile = 0;
  const byFormat = {};
  for (const { t } of seen.values()) {
    const b = K.bytes(t);
    all += b;
    const fromFile = t.userData?.mimeType === 'image/ktx2' || Object.values(ctx.assets.textures || {}).includes(t);
    if (fromFile) {
      file += b; nFile++;
      const f = t.isCompressedTexture ? `compressed:${t.format}` : `raw:${t.format}`;
      byFormat[f] = (byFormat[f] || 0) + b;
    }
  }
  const MiB = (b) => +(b / 2 ** 20).toFixed(2);
  return { fileTextures: nFile, fileMiB: MiB(file), allTextures: seen.size, allMiB: MiB(all), byFormatMiB: Object.fromEntries(Object.entries(byFormat).map(([k, v]) => [k, MiB(v)])),
    targets: K.targets(), glTextures: ctx.renderer.info.memory.textures, renderer: (() => { const gl = ctx.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })() };
}

/* In the page: swap every KTX2-loaded texture in the scene for its uncompressed twin from the reference set
 * (GLB url + glTF texture index from src/core/ktx2.js `textureSource`; the ground arrays by their TEXTURES row),
 * and back. Twins are built once and keep each shipped texture's channel, transform, wrap and filters. */
async function swapTextures(to, prefix, keys = null) {
  const ctx = window.__CTX__;
  const K = ctx.assets.ktx2;   // the app's own module instance (an import here could be a second copy under HMR)
  const S = window.__ktx2ab || (window.__ktx2ab = { gltf: new Map(), rows: new Map(), twins: new Map(), shipOf: new Map() });
  const refTex = async (src) => {
    let p = S.gltf.get(src.url);
    if (!p) {
      p = ctx.assets.loader.loadAsync(prefix + src.url).then((g) => {
        const m = new Map();
        for (const [o, r] of g.parser.associations) if (o?.isTexture && r?.textures != null && !m.has(r.textures)) m.set(r.textures, o);
        return m;
      });
      S.gltf.set(src.url, p);
    }
    return (await p).get(src.texture) || null;
  };
  const rowOf = new Map(Object.entries(ctx.assets.textures || {}).map(([n, t]) => [t, n]));
  const twinFor = async (t) => {
    if (S.twins.has(t.uuid)) return S.twins.get(t.uuid);
    let ref = null;
    const src = K.source(t);
    if (src) ref = await refTex(src);
    else if (rowOf.has(t)) {
      const row = ctx.assets.textureRows[rowOf.get(t)];
      ref = await K.load(prefix + row.url, row);
    }
    let twin = null;
    if (ref) {
      twin = ref.isCompressedTexture || ref.isDataArrayTexture ? ref : ref.clone();
      if (twin !== ref) twin.source = ref.source;
      for (const k of ['channel', 'rotation', 'matrixAutoUpdate', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'colorSpace', 'flipY']) twin[k] = t[k];
      for (const k of ['offset', 'repeat', 'center']) twin[k].copy(t[k]);
      twin.matrix.copy(t.matrix);
      twin.userData = { ...twin.userData, ktx2abTwin: true };
      twin.needsUpdate = true;
    }
    S.twins.set(t.uuid, twin);
    return twin;
  };
  const slots = [];
  const seenSlot = new Set();
  const addSlot = (obj, key) => { const id = `${obj.uuid || (obj.__abId ||= Math.random().toString(36).slice(2))}:${key}`; if (!seenSlot.has(id)) { seenSlot.add(id); slots.push([obj, key]); } };
  const fromFile = (t) => t?.isTexture && !t.userData?.ktx2abTwin && (t.userData?.mimeType === 'image/ktx2' || rowOf.has(t));
  ctx.scene.traverse((o) => {
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      for (const k of Object.keys(m)) { const v = m[k]; if (v?.isTexture) addSlot(m, k); }
      for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) addSlot(u, 'value');
    }
  });
  let swapped = 0, missing = 0, ktx = 0;
  for (const [obj, key] of slots) {
    const cur = obj[key];
    if (to === 'ref') {
      if (!fromFile(cur) || (keys && !keys.includes(key))) continue;
      ktx++;
      const twin = await twinFor(cur);
      if (!twin) { missing++; continue; }
      obj[key] = twin; obj.__ktx2ab = obj.__ktx2ab || {}; obj.__ktx2ab[key] = cur; swapped++;
    } else if (obj.__ktx2ab?.[key]) { obj[key] = obj.__ktx2ab[key]; delete obj.__ktx2ab[key]; swapped++; }
  }
  return { to, slots: slots.length, ktx, swapped, missing };
}

async function runSameSession() {
  const PORT = guardPort(flag('--port'));
  if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
  const REF = path.resolve(flag('--ref') || '');
  const OUT = path.resolve(flag('--out') || '');
  if (!existsSync(path.join(REF, 'public'))) throw new Error(`--ref ${REF}: no public/ (build it with ktx2.mjs --raw)`);
  assertOutsideRepo(OUT, REPO);
  const ONLY = flag('--only') ? new Set(flag('--only').split(',')) : null;
  const SETTLE = Number(flag('--settle', 2600));
  const BUDGET = Number(flag('--budget', 840));
  const WAIT_S = Number(flag('--wait', 1800));
  const PREFIX = '/__ktx2ref__';
  const KEYS = flag('--swap-keys') ? flag('--swap-keys').split(',') : null;   // diagnosis: swap only these material keys (map, normalMap, ...)
  const set = loadFrameSet();
  const frames = filmOrder(set.frames).filter((f) => !ONLY || ONLY.has(f.id));
  const vp = set.viewport || { width: 1600, height: 900, dpr: 1.25 };
  const commit = execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

  const SLOT = path.join(SLOTS, 'slot1');
  let slotHeld = false, vite = null, browser = null, profile = null;
  const release = () => { if (slotHeld) { try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ } slotHeld = false; log('slot released'); } };
  const teardown = async () => {
    try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
    browser = null;
    if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } vite = null; }
    if (profile) { try { disposeProfile(profile); } catch { /* */ } profile = null; }
    release();
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { await teardown(); process.exit(130); });
  process.on('exit', () => { release(); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

  // --reuse-server: a Vite already serving THIS tree on the port (it answers for src/core/ktx2.js) is used and left
  // running; otherwise a busy port is refused
  let reuse = false;
  if (await portOpen(PORT)) {
    const ok = args.includes('--reuse-server') && await fetch(`http://127.0.0.1:${PORT}/src/core/ktx2.js`).then((r) => r.ok).catch(() => false);
    if (!ok) throw new Error(`port ${PORT} is in use`);
    reuse = true;
    log(`reusing the Vite already on ${PORT} (serves this tree)`);
  }
  const until = Date.now() + WAIT_S * 1000;
  for (let i = 0; Date.now() < until && !slotHeld; i++) {
    const m = memory();
    if (m.ok) { try { mkdirSync(SLOT); slotHeld = true; } catch { /* held */ } }
    if (slotHeld) { writeFileSync(path.join(SLOT, 'owner.txt'), `int ktx2-ab ${process.pid} ${utc()}\n`); log(`slot taken (memory ${m.free} % free, level ${m.level})`); break; }
    if (!(i % 60)) { let o = ''; try { o = readFileSync(path.join(SLOT, 'owner.txt'), 'utf8').trim(); } catch { /* */ } log(`waiting: memory ${m.free} %, level ${m.level}${o ? `, slot held by "${o}"` : ''}`); }
    await sleep(3000);
  }
  if (!slotHeld) throw new Error('SLOT-NOT-AVAILABLE');

  const dirs = { ktx2: path.join(OUT, 'ktx2'), ref: path.join(OUT, 'ref'), again: path.join(OUT, 'ktx2-again') };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  const P = { commit, startedAt: utc(), viewport: vp, ref: REF, frames: [], console: [], served: 0 };
  try {
    if (!reuse) vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
    for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
    if (!(await portOpen(PORT))) throw new Error(`vite did not open ${PORT}`);
    installProfileCleanup();
    profile = profileDir(PORT);
    const t0 = Date.now();
    browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: Number(flag('--protocol-timeout', 120000)),
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${vp.width},${vp.height + 40}`] });
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr || 1 });
    await page.evaluateOnNewDocument(() => {
      const Real = window.WebSocket;
      function Dead() { const t = new EventTarget(); t.readyState = 1; t.send = () => {}; t.close = () => { t.readyState = 3; }; setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0); return t; }
      window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols; if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
      window.WebSocket.prototype = Real.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    });
    page.on('console', (m) => { if (m.type() === 'error') { P.console.push(m.text().slice(0, 300)); if (P.console.length <= 5) log(`console error: ${m.text().slice(0, 300)}`); } });
    page.on('pageerror', (e) => { P.console.push('pageerror: ' + String(e).slice(0, 300)); log(`pageerror: ${String(e).slice(0, 300)}`); });
    // the reference twins are fetched under PREFIX and answered from <ref>/public; only those requests pause
    const cdp = await page.createCDPSession();
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `*${PREFIX}/*`, requestStage: 'Request' }] });
    cdp.on('Fetch.requestPaused', async (ev) => {
      const u = new URL(ev.request.url);
      const rel = decodeURIComponent(u.pathname).replace(PREFIX, '');
      const f = path.join(REF, 'public', rel);
      try {
        if (/^\/(models\/.*\.glb|textures\/.*\.ktx2)$/.test(rel) && existsSync(f)) {
          P.served++;
          await cdp.send('Fetch.fulfillRequest', { requestId: ev.requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'application/octet-stream' }], body: readFileSync(f).toString('base64') });
        } else await cdp.send('Fetch.fulfillRequest', { requestId: ev.requestId, responseCode: 404, body: '' });
      } catch (e) { log(`fetch hook ${rel}: ${String(e).slice(0, 160)}`); }
    });
    log('loading the page');
    await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await Promise.race([
      page.waitForFunction('window.__READY__ === true', { timeout: 240000, polling: 500 }),
      new Promise((_, rej) => { const t = setInterval(() => { const e = P.console.find((x) => /boot failed|pageerror/.test(x)); if (e) { clearInterval(t); rej(new Error(`boot: ${e}`)); } }, 500); page.once('close', () => clearInterval(t)); }),
    ]);
    await sleep(6000);
    P.resident = await page.evaluate(residentInPage);
    log(`booted; textures ${JSON.stringify(P.resident)}`);
    // While the three shots are taken the game loop is stopped and the engine renders the same frame with dt = 0:
    // the staged freeze stops the simulation, but shader clocks (wind, water, clouds) and the mixer would still move
    // between shots and swamp the codec's difference.
    const hold = (on) => page.evaluate((on) => {
      const g = window.__GAME__, r = g.ctx.renderer;
      if (on) r.setAnimationLoop(null); else { g._lastNow = performance.now(); r.setAnimationLoop(() => g._frame()); }
    }, on);
    const shoot = async (dir, id) => {
      await page.evaluate(() => new Promise((res) => { let n = 0; const f = () => { window.__GAME__.ctx.engine.render(0); if (++n >= 3) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
      const shot = await page.screenshot({ type: 'png' });
      await sharp(shot).resize(vp.width, vp.height, { fit: 'fill' }).png({ compressionLevel: 6 }).toFile(path.join(dir, `${id}.png`));
    };
    for (const f of frames) {
      if ((Date.now() - t0) / 1000 > BUDGET) { P.frames.push({ id: f.id, ok: false, error: 'budget' }); continue; }
      if (memory().level === '4') { P.frames.push({ id: f.id, ok: false, error: 'memory critical' }); continue; }
      const fs0 = Date.now();
      try {
        await page.evaluate(stageFrame, f, { settleMs: SETTLE });
        await hold(true);
        await shoot(dirs.ktx2, f.id);
        const toRef = await page.evaluate(swapTextures, 'ref', PREFIX, KEYS);
        await shoot(dirs.ref, f.id);
        const back = await page.evaluate(swapTextures, 'ktx2', PREFIX);
        await shoot(dirs.again, f.id);
        await hold(false);
        await page.evaluate(unstageFrame);
        P.frames.push({ id: f.id, ok: true, toRef, back, seconds: Math.round((Date.now() - fs0) / 100) / 10 });
        log(`${f.id} ok (${toRef.swapped}/${toRef.ktx} KTX2 slots swapped, ${toRef.missing} without a twin) in ${((Date.now() - fs0) / 1000).toFixed(1)} s`);
      } catch (e) {
        P.frames.push({ id: f.id, ok: false, error: String(e?.message || e).slice(0, 200) });
        log(`${f.id} FAILED: ${String(e?.message || e).slice(0, 160)}`);
        try { await page.evaluate(swapTextures, 'ktx2', PREFIX); await hold(false); await page.evaluate(unstageFrame); } catch { /* */ }
      }
    }
    P.residentAfter = await page.evaluate(residentInPage).catch(() => null);
    P.chromeSeconds = Math.round((Date.now() - t0) / 1000);
  } finally {
    await teardown();
    P.endedAt = utc();
    for (const d of Object.values(dirs)) writeFileSync(path.join(d, 'pass.json'), JSON.stringify(P, null, 1));
  }
  return { P, OUT, dirs };
}

/* ------------------------------------------------------------------ CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.includes('--compare')) {
    const i = args.indexOf('--compare');
    const rows = await compareDirs(path.resolve(args[i + 1]), path.resolve(args[i + 2]));
    for (const r of rows) console.log(`${r.id.padEnd(10)} mean ΔE ${r.meanDE.toFixed(3)}  >1: ${r.pctOver1}%  >3: ${r.pctOver3}%  worst 8x8 ${r.worstBlockDE.toFixed(2)} at ${r.worstBlockAt}`);
    if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(rows, null, 1));
  } else {
    const { P, OUT, dirs } = await runSameSession();
    const result = { commit: P.commit, startedAt: P.startedAt, chromeSeconds: P.chromeSeconds, resident: P.resident, residentAfter: P.residentAfter,
      console: P.console.slice(0, 20), frames: P.frames, compare: {} };
    result.compare['ref-vs-ktx2'] = await compareDirs(dirs.ref, dirs.ktx2);
    result.compare['ktx2-vs-ktx2-again'] = await compareDirs(dirs.ktx2, dirs.again);
    const R = result.compare['ref-vs-ktx2'];
    const N = result.compare['ktx2-vs-ktx2-again'];
    result.verdict = {
      frames: R.length,
      maxMeanDE: R.length ? Math.max(...R.map((r) => r.meanDE)) : null, avgMeanDE: +(R.reduce((s, r) => s + r.meanDE, 0) / Math.max(1, R.length)).toFixed(4),
      failMean: R.filter((r) => !r.passMean).map((r) => r.id), failBlock: R.filter((r) => r.passBlock === false).map((r) => r.id),
      faceBlocks: Object.fromEntries(R.filter((r) => BARS.blockFrames.includes(r.id)).map((r) => [r.id, r.worstBlockDE])),
      noiseMaxMeanDE: N.length ? Math.max(...N.map((r) => r.meanDE)) : null,
    };
    result.verdict.pass = !result.verdict.failMean.length && !result.verdict.failBlock.length && R.length > 0;
    writeFileSync(path.join(OUT, 'ab.json'), JSON.stringify(result, null, 1));
    console.log(JSON.stringify(result.verdict));
    console.log(`written ${path.join(OUT, 'ab.json')}`);
  }
}
