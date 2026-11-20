#!/usr/bin/env node
/**
 * A-region-hitch (Milestone 3 rule 15, area F's EF1), WAVE 1: every region crossing M3 adds, crossed each way at a jog
 * and at kite speed, with the region's assets STOOD IN AT THEIR CAPS, every presented frame recorded:
 * bar 0 frames over 50 ms and at most 1 over 33 ms per crossing; every frame over 33 ms named by its cause.
 *
 *   tools/perf/clean-measure.sh <commit> 5284 node tools/perf/region-hitch.mjs --port 5284 --built [--skip-build] [--only <ids>]
 *        [--upload spread|at-load] [--out <dir outside the repo>]
 *
 * THE CROSSINGS are tools/perf/region-hitch-paths.mjs (the Node twin sweeps the same lines: region-hitch.test.mjs).
 * Wave 1 has no kite and no Malpais ground, so both are stood in, and the report says so:
 *   - her movement is CARRIED, not driven by input: each frame the row sets her on the line at the crossing's speed
 *     (on the ground at a jog, snapped to it as a teleport is; or 60 m over it at 10 m/s with the regions seam told she
 *     is flying, `tracker.modeOf`), the lens turned along the line;
 *   - the Malpais' files are stood in at their plan lines (regions.js `standIn`: 14 MB shipped, 16 MB resident): shipped
 *     GLBs fetched again under a `?standin=` query (a fresh fetch, parse, KTX2 transcode and upload, nothing cached) by
 *     the regions seam's own loader (`RegionLoader`, its `assetsOf` and `load` given the stand-in rows) when the Malpais
 *     is approached, and dropped (`unload`, disposed) when it is departed, so each crossing loads them anew. Their
 *     textures go to the GPU one per frame after the load (`--upload spread`, the default: the loader the world area
 *     will need) or all in the frame the load lands (`--upload at-load`), then the models stand on the line inside the
 *     Malpais, drawn.
 * One Chrome launch (slot1), vsync-locked headless: the intervals are presented-frame intervals (rAF), as TECH 9.1's
 * hitch lines are read. Per frame over 33 ms: the GL calls since the frame before (compiles, links, uploads: count and
 * ms), the long-animation-frame scripts, the region events and the stand-in loader's steps that fell in it, and a
 * cause: compile, upload, fetch/decode (a stand-in response or a loader step landed in it), nav, or unattributed.
 *
 * Writes <out>/region-hitch.json (+ a shot per crossing end).
 */
import puppeteer from 'puppeteer';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { takeMachineSlot, releaseMachineSlot } from '../chrome-slot.mjs';
import { RUNS, assertOutsideRepo } from '../frames/paths.mjs';
import { CROSSINGS } from './region-hitch-paths.mjs';
import { fixture } from '../gates/systems/hour-two-fixtures.mjs';
import { makeRecord } from '../../src/game/save/format.js';
import { heightAt } from '../../src/world/island/recipe.js';
import { REGIONS } from '../../src/core/regions.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('5173 is never used');
const BUILT = args.includes('--built');
const UPLOAD = flag('--upload', 'spread');
const WARM = !args.includes('--no-warm');
const ONLY = (flag('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[region-hitch ${new Date().toISOString().slice(11, 19)}]`, ...a);
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = process.env.CLEAN_COMMIT || git('rev-parse', '--short', 'HEAD');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const OUT = flag('--out') || path.join(RUNS, `${stamp}-${commit.slice(0, 7)}-region-hitch`);
assertOutsideRepo(OUT, REPO);
mkdirSync(OUT, { recursive: true });
const crossings = CROSSINGS.filter((c) => !ONLY.length || ONLY.includes(c.id));

/**
 * The Malpais' stand-in rows: shipped GLBs (people, the town kit, the sea stacks) whose sum is at or over the Malpais'
 * plan lines (14 MB shipped, 16 MiB resident; tools/perf/region-hitch-resident.mjs counts them the texture ledger's way).
 */
const MAL = REGIONS.find((r) => r.id === 'malpais');
const STANDIN_FILES = ['models/npc/guild-matron.glb', 'models/npc/boat-caulker-2.glb', 'models/npc/salt-porter-2.glb', 'models/npc/lantern-keeper-2.glb',
  'models/npc/salt-raker-2.glb', 'models/npc/tube-smith.glb', 'models/npc/atlas-pan.glb', 'models/settlements/saltrow-kit.glb', 'models/landmarks/sea-stacks.glb'];

const report = {
  row: 'A-region-hitch', wave: 1, commit, clean: !!process.env.CLEAN_COMMIT, built: BUILT, port: PORT, upload: UPLOAD, warm: WARM, startedAt: new Date().toISOString(),
  bar: { over50: 0, over33: 1 }, standIn: { malpais: MAL.standIn, files: STANDIN_FILES }, standInNote: 'her movement is carried (no kite, no input drive); the Malpais\' files are stood in by shipped GLBs fetched again', crossings: [], console: [],
};
const save = () => writeFileSync(path.join(OUT, 'region-hitch.json'), JSON.stringify(report, null, 1));

/* ------------------------------------------------------------------ server */

const portFree = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); });
async function waitHttp(url, ms = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return true; } catch { /* */ } await sleep(500); }
  return false;
}
let server = null;
async function serve() {
  if (!(await portFree(PORT))) throw new Error(`port ${PORT} is taken: this tool runs its own server`);
  const a = BUILT ? ['vite', 'preview'] : ['vite'];
  server = spawn('nice', ['-n', '10', 'npx', ...a, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: REPO, stdio: 'ignore', detached: true });
  if (!(await waitHttp(`http://127.0.0.1:${PORT}/`))) throw new Error(`server did not answer on ${PORT}`);
}
const stopServer = () => { if (!server) return; try { process.kill(-server.pid, 'SIGTERM'); } catch { /* */ } server = null; };
process.on('exit', stopServer);

/* ------------------------------------------------------------------ in-page (before any script) */

const recorder = () => {
  const R = (window.__rh = { gl: {}, loaf: [], on: false, frames: 0, over33: 0, over50: 0, max: 0, long: [], marks: [], last: 0, sheetWas: true, res: [] });
  const P = WebGL2RenderingContext.prototype;
  const WRAP = ['compileShader', 'linkProgram', 'getProgramParameter', 'getProgramInfoLog', 'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D',
    'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'compressedTexImage3D', 'compressedTexSubImage3D', 'bufferData', 'bufferSubData', 'generateMipmap'];
  for (const k of WRAP) {
    const f = P[k]; if (typeof f !== 'function') continue;
    const c = (R.gl[k] = { n: 0, ms: 0 });
    P[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { c.n++; c.ms += performance.now() - t; } };
  }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      if (R.loaf.length > 300) R.loaf.shift();
      R.loaf.push({ t: e.startTime, d: Math.round(e.duration), scripts: (e.scripts || []).filter((s) => s.duration >= 3).map((s) => ({ fn: s.sourceFunctionName, url: (s.sourceURL || '').replace(/^.*\//, '').replace(/\?.*$/, ''), d: Math.round(s.duration) })) });
    } }).observe({ type: 'long-animation-frame', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (/standin=/.test(e.name)) R.res.push({ url: e.name.replace(/^.*\/models\//, ''), start: e.startTime, end: e.responseEnd, bytes: e.encodedBodySize }); }).observe({ type: 'resource', buffered: true });
  } catch (e) { R.obsError = String(e); }
  const snap = () => { const o = {}; for (const k in R.gl) o[k] = [R.gl[k].n, R.gl[k].ms]; return o; };
  let prev = snap();
  const tick = (t) => {
    const L = document.getElementById('loading'), sheet = !!L && !L.classList.contains('hidden');
    const cur = snap();
    if (R.on && R.last && !sheet && !R.sheetWas) {
      const d = t - R.last;
      R.frames++;
      if (d > R.max) R.max = d;
      if (d > 33.4) R.over33++;
      if (d > 50) R.over50++;
      if (d > 33.4 && R.long.length < 60) {
        const gl = {};
        for (const k in cur) { const dn = cur[k][0] - prev[k][0], dm = cur[k][1] - prev[k][1]; if (dn) gl[k] = [dn, Math.round(dm * 10) / 10]; }
        R.long.push({ t: Math.round(t), d: Math.round(d * 10) / 10, gl, at: R.where?.() ?? null });
      }
    }
    prev = cur; R.last = t; R.sheetWas = sheet;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** In the page after Continue: the stand-in loader on the regions seam's own loader. */
const installStandIn = (rows, upload, place, warm) => {
  const C = window.__CTX__, E = C.engine, R = E.regions, A = C.assets, S = window.__rh;
  const mark = (tag, extra = {}) => S.marks.push({ t: Math.round(performance.now()), tag, ...extra });
  const held = (window.__standIn = { names: [], roots: [], queue: [], loads: 0 });
  R.loader.assetsOf = (r) => (r.id === 'malpais' ? rows : r.assets);
  R.loader.load = async (region, rs) => {
    mark('load-start', { region: region.id });
    const t0 = performance.now();
    held.loads++;
    const tag = `s${held.loads}`;
    const named = Object.fromEntries(Object.entries(rs).map(([n, s]) => [`${n}-${tag}`, { ...s, url: `${s.url}?standin=${tag}` }]));
    await A.loadExtra(named);
    mark('load-done', { region: region.id, ms: Math.round(performance.now() - t0) });
    const H = (x, z) => C.terrain?.getHeight?.(x, z) ?? 0;
    let i = 0;
    for (const n of Object.keys(named)) {
      const e = A.models[n]; if (!e?.root) continue;
      held.names.push(n);
      const a = (i++ / Object.keys(named).length) * Math.PI * 2;
      const x = place.x + Math.cos(a) * 14, z = place.z + Math.sin(a) * 14;
      e.root.position.set(x, H(x, z), z);
      held.roots.push(e.root);
      const tex = [];
      e.root.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const k in m) if (m[k]?.isTexture) tex.push(m[k]); });
      held.queue.push(...new Set(tex));
    }
    if (upload === 'at-load') { for (const t of held.queue.splice(0)) { try { E.renderer.initTexture(t); } catch { /* */ } } mark('uploaded-all'); }
    else {
      await new Promise((res) => { const step = () => { const t = held.queue.shift(); if (t) { try { E.renderer.initTexture(t); } catch { /* */ } requestAnimationFrame(step); } else res(); }; requestAnimationFrame(step); });
      mark('uploaded-spread');
    }
    // the programs: issued off the frame and awaited (KHR_parallel_shader_compile) before the models are drawn, as the
    // engine's warm-up does (engine.compileAsDrawn + _awaitProgramsReady); --no-warm adds them to the scene cold.
    // Their materials are REGISTERED with the environment first (fog uniforms and the cascades: registerMaterial changes
    // the program): at cc1e850 the warm-up compiled the unregistered variant, and the environment's material scan (every
    // 2.5 s) registered them 359 ms (jog) and 494 ms (flight) after they were drawn, so the next frame linked 6 programs
    // again, 93.4 and 80.3 ms in getProgramInfoLog (frames of 106.9 and 91.7 ms). A region's loader registers, then
    // compiles, then awaits, then adds: that order is the seam's (BACKLOG: engine.attachRegions' own load)
    if (warm && C.environment?.registerMaterial) {
      let n = 0;
      for (const r of held.roots) r.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) { C.environment.registerMaterial(m); n++; } } });
      mark('registered', { materials: n });
    }
    if (warm && E.compileAsDrawn && E._awaitProgramsReady) {
      const g = new (E.scene.constructor)();
      for (const r of held.roots) g.add(r);
      try { E.compileAsDrawn(g, E.camera, E.scene); } catch (err) { mark('compile-threw', { err: String(err).slice(0, 120) }); }
      mark('programs-issued');
      await E._awaitProgramsReady(20000);
      mark('programs-ready');
      g.clear();
    }
    for (const r of held.roots) E.scene.add(r);
    mark('added');
  };
  R.loader.unload = (region) => {
    if (region?.id !== 'malpais') return;   // the loader calls unload on every depart (pans, caldera): only the Malpais is stood in
    for (const n of held.names.splice(0)) { try { A.unload(n); } catch { /* */ } }
    held.roots.length = 0;
    mark('unloaded');
  };
  if (!window.__standInEv) { window.__standInEv = true; for (const k of ['enter', 'leave', 'approach', 'depart']) C.events.on(`region-${k}`, (e) => window.__rh.marks.push({ t: Math.round(performance.now()), tag: `region-${k}`, region: e.region, depth: e.depth })); }
  S.where = () => { const p = C.player.position; return { x: Math.round(p.x), z: Math.round(p.z), region: R.tracker.current }; };
  return true;
};

/** In the page: carry her from a to b at speed (m/s), agl metres over the ground (0 = on it, snapped), in mode. */
const carry = (c, from, to, agl) => new Promise((resolve) => {
  const C = window.__CTX__, p = C.player, R = C.engine.regions;
  const H = (x, z) => C.terrain?.getHeight?.(x, z) ?? p.position.y;
  // her mode goes through the game's own binding (the flight-state seam, player.flight, read by the tracker's modeOf:
  // src/game/runtime.js), never by overriding modeOf: the row checks the binding as it measures
  p.flight = c.mode === 'flight' ? 'gliding' : 'none';
  const L = Math.hypot(to.x - from.x, to.z - from.z);
  const t0 = performance.now();
  p.camYaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
  const step = () => {
    const s = Math.min(L, (c.speed * (performance.now() - t0)) / 1000), k = s / L;
    const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
    p.position.x = x; p.position.z = z;
    if (agl > 0) {
      p.position.y = H(x, z) + agl;
      p.velocity?.set?.(0, 0, 0);
      p._prevPos?.copy?.(p.position);
      p._fallPeak = p.position.y; p.airTime = 0;
    } else { try { p._snapToGround(p.position.y + 2); } catch { p.position.y = H(x, z); p._prevPos?.copy?.(p.position); } }
    if (s >= L) resolve({ s: +s.toFixed(1), ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

/** In the page: hold her at `at`, agl metres over the ground, for ms (a flight's start and end: no fall). */
const hold = (at, agl, ms) => new Promise((resolve) => {
  const C = window.__CTX__, p = C.player;
  const H = (x, z) => C.terrain?.getHeight?.(x, z) ?? p.position.y;
  const t0 = performance.now();
  const step = () => {
    p.position.x = at.x; p.position.z = at.z;
    if (agl > 0) { p.position.y = H(at.x, at.z) + agl; p.velocity?.set?.(0, 0, 0); p._prevPos?.copy?.(p.position); p._fallPeak = p.position.y; p.airTime = 0; }
    if (performance.now() - t0 >= ms) resolve(true); else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

/** Name a long frame's cause from what fell in it. */
function causeOf(f, marks, res, loaf) {
  const gl = f.gl || {};
  const ms = (ks) => ks.reduce((s, k) => s + (gl[k]?.[1] ?? 0), 0);
  const compile = ms(['compileShader', 'linkProgram', 'getProgramParameter', 'getProgramInfoLog']);
  const upload = ms(['texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'compressedTexImage3D', 'compressedTexSubImage3D', 'generateMipmap']);
  const buf = ms(['bufferData', 'bufferSubData']);
  const lo = f.t - f.d - 2, hi = f.t + 2;
  const inFrame = marks.filter((m) => m.t >= lo && m.t <= hi).map((m) => m.tag);
  const fetched = res.filter((r) => r.end >= lo && r.end <= hi).map((r) => r.url);
  const scripts = loaf.filter((l) => l.t <= hi && l.t + l.d >= lo).flatMap((l) => l.scripts).slice(0, 6);
  let cause = 'unattributed';
  if (compile >= 5) cause = 'compile';
  else if (upload >= 5 || buf >= 5) cause = 'upload';
  else if (fetched.length || inFrame.some((t) => /load-done|uploaded/.test(t))) cause = 'fetch/decode';
  else if (scripts.some((s) => /nav|path/i.test(`${s.fn} ${s.url}`))) cause = 'nav';
  return { cause, compileMs: +compile.toFixed(1), uploadMs: +upload.toFixed(1), bufferMs: +buf.toFixed(1), marks: inFrame, fetched, scripts };
}

/* ------------------------------------------------------------------ main */

let browser = null, profile = null, slotTaken = false;
const tStart = Date.now();
try {
  // the build is not Chrome time: it runs before the slot is asked for (at cc1e850 it ran inside the slot)
  if (BUILT && !args.includes('--skip-build')) execFileSync('nice', ['-n', '10', 'npx', 'vite', 'build', '--logLevel', 'error'], { cwd: REPO, stdio: 'inherit' });
  const slot = await takeMachineSlot({ who: `int e+f region-hitch ${PORT}`, waitS: 1800, log });
  if (!slot.ok) throw new Error(slot.why);
  slotTaken = true;
  report.slotTakenAt = new Date().toISOString();
  report.slotWaitS = Math.round((Date.now() - tStart) / 1000);
  await serve();
  installProfileCleanup();
  profile = profileDir(PORT);
  browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', '--enable-precise-memory-info',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
  page.on('console', (m) => { if (m.type() === 'error' && report.console.length < 40) report.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { if (report.console.length < 40) report.console.push(`pageerror: ${String(e).slice(0, 300)}`); });
  await page.evaluateOnNewDocument(recorder);
  // the start: the first hour's end record moved to the first crossing's start, trade weather, the afternoon
  const c0 = crossings[0];
  const base = fixture(4);
  const rec = makeRecord({ ...base, hour: 16.0, weather: 'trade', place: 'NINEWALLS', position: { x: c0.a.x, y: heightAt(c0.a.x, c0.a.z) + 0.05, z: c0.a.z, yaw: 0, pitch: 0, heading: 0 } },
    { kind: 'checkpoint', reason: 'region-hitch', slot: 1, savedAt: Date.now() });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 200 });
  const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, rec);
  if (!wrote?.ok) throw new Error(`record not written: ${JSON.stringify(wrote)}`);
  await page.goto('about:blank');
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 100 });
  await sleep(500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
  await sleep(300);
  const cont = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent));
    if (!b || b.disabled) return 'no CONTINUE'; b.click();
    const go = document.querySelector('.gs-slot.cont .gs-slot-go'); if (!go) return 'no slot card'; go.click(); return null;
  });
  if (cont) throw new Error(`continue: ${cont}`);
  await page.waitForFunction(() => window.__CTX__?.state === 'playing', { timeout: 90000, polling: 50 });
  await sleep(4000);
  const rows = Object.fromEntries(STANDIN_FILES.map((f) => [`standin-${f.replace(/^.*\//, '').replace(/\.glb$/, '')}`, { url: `/${f}`, targetHeight: 6 }]));
  for (const c of crossings) {
    const C = { id: c.id, mode: c.mode, speed: c.speed, agl: c.agl, a: c.a, b: c.b, standIn: c.to === 'malpais' || c.from === 'malpais' ? 'carried; Malpais files stood in' : 'carried; the Holds\' own files (nothing stood in)' };
    try {
      const inside = { x: c.b.x, z: c.b.z };
      await page.evaluate(installStandIn, rows, UPLOAD, inside, WARM);
      // to the start (a teleport: not counted), settle 4 s
      await page.evaluate((cc) => { const C = window.__CTX__, p = C.player; p.flight = cc.mode === 'flight' ? 'gliding' : 'none'; p.position.x = cc.a.x; p.position.z = cc.a.z; p._snapToGround?.(p.position.y + 200); }, c);
      await page.evaluate(hold, c.a, c.agl, 4000);
      C.before = await page.evaluate(() => ({ status: window.__CTX__.engine.regionStatus(), where: window.__rh.where(), flight: window.__CTX__.player.flight, modeSeen: window.__CTX__.engine.regions.tracker.modeOf() }));
      C.modeBound = C.before.modeSeen === c.mode;
      await page.evaluate(() => { const S = window.__rh; S.on = true; S.frames = 0; S.over33 = 0; S.over50 = 0; S.max = 0; S.long = []; S.marks = []; S.res = []; S.loaf = []; S.last = 0; });
      C.out = await page.evaluate(carry, c, c.a, c.b, c.agl);
      await page.evaluate(hold, c.b, c.agl, 3000);
      const shotOut = path.join(OUT, `${c.id}-in.jpg`);
      await page.evaluate(() => { window.__rh.on = false; });
      await page.screenshot({ path: shotOut, type: 'jpeg', quality: 80 }).catch(() => null);
      await page.evaluate(() => { window.__rh.last = 0; window.__rh.on = true; });
      await page.evaluate(hold, c.b, c.agl, 500);
      C.mid = await page.evaluate(() => ({ status: window.__CTX__.engine.regionStatus(), standIn: { names: window.__standIn.names.length, queue: window.__standIn.queue.length, loads: window.__standIn.loads } }));
      C.back = await page.evaluate(carry, c, c.b, c.a, c.agl);
      await page.evaluate(hold, c.a, c.agl, 3000);
      const R = await page.evaluate(() => { const S = window.__rh; S.on = false; return { frames: S.frames, over33: S.over33, over50: S.over50, maxMs: +S.max.toFixed(1), long: S.long, marks: S.marks, res: S.res, loaf: S.loaf }; });
      C.after = await page.evaluate(() => ({ status: window.__CTX__.engine.regionStatus(), standInHeld: window.__standIn.names.length, hp: Math.round(window.__CTX__.player.health ?? 0), dead: !!document.querySelector('.mn-death.show') }));
      // down to the ground again before the next crossing (a teleport: not counted)
      await page.evaluate(() => { const p = window.__CTX__.player; p._snapToGround?.(p.position.y + 2); window.__CTX__.player.flight = 'none'; });
      C.frames = R.frames; C.over33 = R.over33; C.over50 = R.over50; C.maxMs = R.maxMs;
      C.long = R.long.map((f) => ({ ...f, ...causeOf(f, R.marks, R.res, R.loaf) }));
      C.marks = R.marks; C.fetched = R.res.map((r) => ({ url: r.url, ms: Math.round(r.end - r.start), bytes: r.bytes }));
      C.fetchedBytes = R.res.reduce((s, r) => s + (r.bytes || 0), 0);
      C.pass = !C.after.dead && C.modeBound && (c.to !== 'malpais' || C.fetchedBytes > 0) && C.over50 <= report.bar.over50 && C.over33 <= report.bar.over33 && C.long.every((f) => f.cause !== 'unattributed');
      C.shot = path.basename(shotOut);
      log(`${c.id}: ${C.frames} frames, ${C.over33} over 33 ms, ${C.over50} over 50 ms (max ${C.maxMs}); stand-in ${(C.fetchedBytes / 1e6).toFixed(2)} MB fetched; ${C.pass ? 'PASS' : 'FAIL'}`);
      // back at the start in the Holds the Malpais must have departed (its stand-ins disposed) before the next crossing
    } catch (e) { C.error = String(e?.stack || e).slice(0, 800); log(`${c.id} error: ${C.error.slice(0, 200)}`); }
    report.crossings.push(C);
    save();
  }
} catch (e) {
  report.error = String(e?.stack || e).slice(0, 1200);
  log(`error: ${report.error.slice(0, 300)}`);
} finally {
  report.chromeSeconds = Math.round((Date.now() - tStart) / 1000) - (report.slotWaitS ?? 0);
  try { await browser?.close(); } catch { /* */ }
  if (profile) disposeProfile(profile);
  stopServer();
  if (slotTaken) releaseMachineSlot(log);
  report.pass = report.crossings.length === crossings.length && report.crossings.every((c) => c.pass);
  save();
  log(`report: ${path.join(OUT, 'region-hitch.json')} (${report.chromeSeconds} s of Chrome) ${report.pass ? 'PASS' : 'FAIL'}`);
}
