/**
 * M1.1c / M1.1d — THE ROCK AND RING SESSION. One Chrome session (the machine guard and slot 1 taken here, Vite on
 * --port bound to 127.0.0.1 under nice -n 10), the game booted once at the bar's size (1600 x 900, DPR 1.25). The
 * probes and their rules are in tools/perf/rock-page.mjs.
 *
 *   F05   still; silhouette layers (+ the class map); the Ring's panels from 150 m and from F05's own station; every
 *         needle stack's strata from 200 m in F05's light; sight lines to the Ring from T1, the Saltrow ramp, the beach
 *   F02   still; strata from 200 m in F02's light; the Ring's panels from 150 m; looks (Organ cluster, crater wall,
 *         the fallen quadrant, the Roque plug); paired GPU A/B of the M1.1c rock (shown / hidden)
 *   F03   still (the Roque plug on the skyline)
 *   F04   still; strata from 200 m at noon
 *
 *   node tools/perf/rock.mjs --port 5271 --out <dir outside the repo> [--budget 780] [--no-timing]
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { stageFrame, unstageFrame } from '../frames/page.mjs';
import { loadFrameSet } from '../frames/frameset.mjs';
import { SLOTS, assertOutsideRepo } from '../frames/paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const log = (...a) => console.log(`[rock ${new Date().toISOString().slice(11, 19)}]`, ...a);
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('port 5173 is the owner preview: never');
const OUT = flag('--out');
if (!OUT) { console.error('rock: --out <dir> is required (outside the repo)'); process.exit(2); }
assertOutsideRepo(OUT, REPO);
const BUDGET_S = Number(flag('--budget', 780));
const LANE = flag('--lane', 'world');
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
mkdirSync(OUT, { recursive: true });

function memory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}
const SLOT = path.join(SLOTS, 'slot1');
let slotHeld = false;
const releaseSlot = () => { if (slotHeld) { try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ } slotHeld = false; log('slot released'); } };
async function takeSlot(waitS = 3600) {
  const until = Date.now() + waitS * 1000;
  for (let said = 0; Date.now() < until; said++) {
    const m = memory();
    if (m.ok) {
      try { mkdirSync(SLOT); slotHeld = true; } catch { /* held */ }
      if (slotHeld) { writeFileSync(path.join(SLOT, 'owner.txt'), `int ${LANE} ${process.pid} ${utc()}\n`); log(`slot taken (memory ${m.free} % free, level ${m.level})`); return true; }
    }
    if (!(said % 6)) log(`waiting: memory ${m.free} % free, level ${m.level}`);
    await sleep(5000);
  }
  return false;
}
const portOn = (p, host) => new Promise((r) => { const s = net.connect(p, host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
const portOpen = async (p) => (await portOn(p, '127.0.0.1')) || (await portOn(p, '::1'));
let vite = null, browser = null, profile = null;
async function teardown() {
  try { await browser?.close(); } catch { try { browser?.process()?.kill('SIGKILL'); } catch { /* */ } }
  browser = null;
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } vite = null; }
  if (profile) { try { disposeProfile(profile); } catch { /* */ } profile = null; }
  releaseSlot();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { await teardown(); process.exit(130); });
process.on('exit', () => { releaseSlot(); if (vite) { try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* */ } } });

const run = { tool: 'tools/perf/rock.mjs', commit: git('rev-parse', '--short', 'HEAD'), dirty: (git('status', '--porcelain', '--untracked-files=no') || '').split('\n').filter(Boolean),
  port: PORT, viewport: { width: 1600, height: 900, dpr: 1.25 }, frames: {}, console: [], probes: {} };
if (await portOpen(PORT)) { console.error(`meadow: port ${PORT} busy`); process.exit(3); }
if (!(await takeSlot())) { console.error('rock: SLOT-NOT-AVAILABLE'); process.exit(4); }
const tStart = Date.now();
const spent = () => (Date.now() - tStart) / 1000;
run.startedAt = utc();
/** The page's base64 RGBA (bottom-up) as a PNG file, top-down. */
async function savePng(file, b64, w, h) {
  const raw = Buffer.from(b64, 'base64');
  const flip = Buffer.alloc(raw.length), row = w * 4;
  for (let y = 0; y < h; y++) raw.copy(flip, (h - 1 - y) * row, y * row, (y + 1) * row);
  await sharp(flip, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
  return flip;
}

async function saveRgb(file, c) {
  await sharp(Buffer.from(c.b64, 'base64'), { raw: { width: c.w, height: c.h, channels: 3 } }).jpeg({ quality: 90 }).toFile(file);
}
try {
  vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
  if (!(await portOpen(PORT))) throw new Error(`vite did not open port ${PORT}`);
  installProfileCleanup();
  profile = profileDir(PORT);
  const launchArgs = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940'];
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 600000, args: launchArgs });
  run.chrome = await browser.version();
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  await page.evaluateOnNewDocument(() => {
    const Real = window.WebSocket;
    function Dead() { const t = new EventTarget(); t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
      setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0); return t; }
    window.WebSocket = function (url, protocols) { const p = Array.isArray(protocols) ? protocols[0] : protocols;
      if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead(); return new Real(url, protocols); };
    window.WebSocket.prototype = Real.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  let current = 'boot';
  page.on('console', (m) => { if (m.type() === 'error') run.console.push({ at: current, text: m.text().slice(0, 400) }); });
  page.on('pageerror', (e) => run.console.push({ at: current, text: 'pageerror: ' + String(e).slice(0, 400) }));
  await page.goto(`http://127.0.0.1:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 300000, polling: 500 });
  await page.waitForFunction('window.__CTX__?.props?.loaded === true', { timeout: 120000, polling: 500 }).catch(() => {});
  run.bootSeconds = Math.round(spent());
  await sleep(4000);
  const set = loadFrameSet();
  const stage = async (id) => { current = id; const f = set.frames.find((x) => x.id === id); run.frames[id] = { staged: await page.evaluate(stageFrame, f, { settleMs: 2600 }) }; await page.screenshot({ path: path.join(OUT, `${id}.png`) }); log(`${id} filmed`); return f; };
  const P = (fn, ...a) => page.evaluate(async (fn, a) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; return M[fn](C.engine, C, ...a); }, fn, a);
  const stackRecs = () => page.evaluate(() => window.__CTX__.props.landmarkSet.stacks.filter((s) => /^stack-/.test(s.id)).map((s) => s.id));
  const strataAll = async (tag) => {
    const ids = await stackRecs(); const out = [];
    for (const id of ids) {
      const r = await page.evaluate(async (id) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; const rec = C.props.landmarkSet.stacks.find((s) => s.id === id); return M.strata(C.engine, C, rec); }, id);
      if (r.crop) { await saveRgb(path.join(OUT, `strata-${tag}-${id}.jpg`), r.crop); delete r.crop; }
      out.push(r);
    }
    log(`strata ${tag}: ${out.map((r) => `${r.id} ${r.bands}`).join(', ')}`);
    return out;
  };

  // ---- F05
  if (spent() < BUDGET_S) {
    await stage('F05');
    const L = await P('layers');
    await sharp(Buffer.from(L.map.b64, 'base64'), { raw: { width: L.map.w, height: L.map.h, channels: 3 } }).png().toFile(path.join(OUT, 'F05-layers.png'));
    delete L.map; run.probes.F05layers = L;
    log(`F05 layers ${L.layers} (${L.classes.map((c) => `${c.class} ${c.columnsPct}% L*${c.rimL}`).join('; ')})`);
    for (const d of [150, 164]) {
      const r = await P('ringPanels', d);
      if (r.crop) { await saveRgb(path.join(OUT, `ring-F05light-${d}m.jpg`), r.crop); delete r.crop; }
      run.probes[`ringF05_${d}`] = r; log(`ring at ${d} m (F05 light): ${r.panels} panels`);
    }
    run.probes.strataF05 = await strataAll('F05');
    run.probes.sight = await page.evaluate(async () => {
      const M = await import('/tools/perf/rock-page.mjs'); const S = await import('/src/world/island/sites.js');
      const C = window.__CTX__, E = C.engine, T = C.terrain;
      const t1 = S.TRIG[0], beach = S.siteById('black-sand-beach'), salt = S.siteById('saltrow');
      // the Saltrow ramp (stand-in until settlements build it): the first ground under 1.2 m on the bearing from
      // Saltrow toward the Ring, the boat ramp's place on the black sand
      const ring = C.props.landmarkSet.ring; const dx = ring.x - salt.x, dz = ring.z - salt.z, dl = Math.hypot(dx, dz);
      let ramp = null; for (let s = 0; s < dl; s += 1) { const x = salt.x + dx / dl * s, z = salt.z + dz / dl * s; if (T.getHeight(x, z) < 1.2) { ramp = { x, z }; break; } }
      const top = (S.TRIG_TOP ?? 4) + 1.7;
      return [M.sight(E, C, { x: t1.x, z: t1.z, eye: top }, 'T1 (on the pillar)'), M.sight(E, C, { x: t1.x + 3, z: t1.z + 3 }, 'T1 (at its foot)'),
        ramp ? M.sight(E, C, ramp, `Saltrow ramp stand-in (${ramp.x.toFixed(0)}, ${ramp.z.toFixed(0)})`) : { station: 'Saltrow ramp', error: 'no shore found' },
        M.sight(E, C, beach, 'black-sand beach (site)'), M.sight(E, C, { x: -200, z: 414 }, 'beach (look.pansInland)')];
    });
    log(`sight: ${run.probes.sight.map((s) => `${s.station} ${s.open}/${s.of}`).join('; ')}`);
    run.probes.ringSite = await page.evaluate(() => {
      const C = window.__CTX__, r = C.props.landmarkSet.ring, T = C.terrain, M = C.vegetation?.meadow;
      const g = T.getHeight(r.x, r.z); let low = Infinity;
      for (let a = 0; a < 16; a++) { const x = r.x + Math.cos(a / 16 * Math.PI * 2) * 34, z = r.z + Math.sin(a / 16 * Math.PI * 2) * 34; low = Math.min(low, T.getHeight(x, z)); }
      const dens = []; for (let a = 0; a < 16; a++) for (const d of [10, 13, 16]) { const x = r.x + Math.cos(a / 8 * Math.PI * 2) * d, z = r.z + Math.sin(a / 8 * Math.PI * 2) * d; dens.push(M?.densityAt ? M.densityAt(x, z) : null); }
      return { riseTopY: +g.toFixed(2), groundAt34mMin: +low.toFixed(2), riseM: +(g - low).toFixed(2), meadowOnFlanks: { samples: dens.length, grassedPct: Math.round(100 * dens.filter((v) => v >= 0.5).length / dens.length), note: 'meadow density >= 0.5 at 10, 13, 16 m on 16 bearings (inside 9 m is the cradle keepout)' },
        fallen: (r.fallen || []).map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), ground: T.materialAt(p.x, p.z) })), tiltDeg: r.info?.tiltDeg, outerDiameter: r.info?.outerDiameter };
    });
    log(`ring site: ${JSON.stringify(run.probes.ringSite)}`);
    await page.evaluate(unstageFrame);
  }
  // ---- F02
  if (spent() < BUDGET_S) {
    await stage('F02');
    run.probes.strataF02 = await strataAll('F02');
    const r = await P('ringPanels', 150);
    if (r.crop) { await saveRgb(path.join(OUT, 'ring-F02light-150m.jpg'), r.crop); delete r.crop; }
    run.probes.ringF02_150 = r; log(`ring at 150 m (F02 light): ${r.panels} panels`);
    const looks = await page.evaluate(() => {
      const C = window.__CTX__, T = C.terrain, LS = C.props.landmarkSet, O = C.props.organ, gp = C.props.gatePlaces;
      const out = [];
      const tall = O.clusterRecs.reduce((a, c) => (c.height > a.height ? c : a));
      const ring = LS.ring;
      // the cluster from 26 m off its centre, toward T1's side
      out.push({ name: 'organ', pos: [tall.x + 18, T.getHeight(tall.x + 18, tall.z + 18) + 1.7, tall.z + 18], target: [tall.x, tall.y + tall.height * 0.4, tall.z] });
      const cw = gp.look?.craterWall; if (cw) out.push({ name: 'crater', pos: [cw.x, cw.y + cw.eye, cw.z], target: [cw.look.x, cw.look.y, cw.look.z] });
      for (const p of (ring.fallen || []).slice(0, 1)) out.push({ name: 'fallen', pos: [p.x + 14, T.getHeight(p.x + 14, p.z + 10) + 1.7, p.z + 10], target: [p.x, p.y + 0.6, p.z] });
      out.push({ name: 'ring-near', pos: [ring.x + 45, T.getHeight(ring.x + 45, ring.z + 25) + 1.7, ring.z + 25], target: [ring.x, ring.y + 14, ring.z] });
      const plug = LS.records.find((q) => q.id === 'roque-plug');
      if (plug) out.push({ name: 'roque', pos: [plug.x - 140, T.getHeight(plug.x - 140, plug.z + 140) + 1.7, plug.z + 140], target: [plug.x, plug.y + 28, plug.z] });
      return out;
    });
    for (const l of looks) {
      const c = await page.evaluate(async (l) => { const M = await import('/tools/perf/rock-page.mjs'); const C = window.__CTX__; return M.look(C.engine, C, l.pos, l.target, 46); }, l);
      await saveRgb(path.join(OUT, `look-${l.name}.jpg`), c);
    }
    log(`looks: ${looks.map((l) => l.name).join(', ')}`);
    if (!has('--no-timing') && spent() < BUDGET_S - 120) {
      run.probes.timingF02 = await page.evaluate(async () => {
        const P = await import('/tools/perf/census-page.mjs'); const A = await import('/tools/perf/attrib-page.mjs');
        const C = window.__CTX__, E = C.engine, LS = C.props.landmarkSet, O = C.props;
        const objs = [O.organ.mesh, O.crater.blocks, O.crater.buttresses, ...['stack-a', 'stack-b', 'stack-c', 'sea-arch', 'roques'].map((k) => LS.meshes[k]).filter(Boolean)];
        const vis = (v) => objs.forEach((o) => { o.visible = v; });
        const base = await A.finishFrame(E, 60);
        const ab = await P.toggles(E, [{ id: 'rock', on: () => vis(true), off: () => vis(false), restore: () => vis(true) }], { n: 30, pairs: 8 });
        let tris = 0; for (const o of objs) { const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); }
        return { frame: base, rockOnMinusOff: ab.rock, rockTrianglesInScene: Math.round(tris) };
      });
      log(`F02 timing: ${run.probes.timingF02.frame.medianMs} ms; rock on-off ${run.probes.timingF02.rockOnMinusOff.onMinusOffMs} ms`);
    }
    await page.evaluate(unstageFrame);
  }
  if (spent() < BUDGET_S) { await stage('F03'); await page.evaluate(unstageFrame); }
  if (spent() < BUDGET_S) { await stage('F04'); run.probes.strataF04 = await strataAll('F04'); await page.evaluate(unstageFrame); }
} finally {
  run.endedAt = utc();
  run.chromeSeconds = Math.round(spent());
  writeFileSync(path.join(OUT, 'rock.json'), JSON.stringify(run, null, 1));
  await teardown();
  log(`wrote ${path.join(OUT, 'rock.json')} (${run.console.length} console errors, ${run.chromeSeconds} s)`);
}
