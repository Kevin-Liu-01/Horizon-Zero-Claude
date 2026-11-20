#!/usr/bin/env node
/**
 * A-region-hitch (Milestone 3 rule 15, area F's EF1), WAVE 1: every region crossing M3 adds, crossed each way at a jog
 * and at kite speed, with the region's assets STOOD IN AT THEIR CAPS, every presented frame recorded:
 * bar 0 frames over 50 ms and at most 1 over 33 ms per crossing; every frame over 33 ms named by its cause.
 *
 *   tools/perf/clean-measure.sh <commit> 5284 node tools/perf/region-hitch.mjs --port 5284 --built [--skip-build] [--only <ids>]
 *        [--out <dir outside the repo>]
 *
 * THE CROSSINGS are tools/perf/region-hitch-paths.mjs (the Node twin sweeps the same lines: region-hitch.test.mjs).
 * There is no kite and no Malpais art yet, so both are stood in, and the report says so:
 *   - her movement is CARRIED, not driven by input: each frame the row sets her on the line at the crossing's speed
 *     (on the ground at a jog, snapped to it as a teleport is; or 60 m over it at 10 m/s with the regions seam told she
 *     is flying, through the game's own binding of player.flight), the lens turned along the line;
 *   - the Malpais' files are stood in at their plan lines (regions.js `standIn`: 14 MB shipped, 16 MB resident): shipped
 *     GLBs fetched again under a `?standin=` query (a fresh fetch, parse, KTX2 transcode and upload, nothing cached).
 *     WAVE 2: they are loaded by the GAME's region loader (src/core/engine.js attachRegions on src/core/regions.js
 *     RegionLoader): fetched, their textures uploaded one a frame, their materials registered with the sky, their programs
 *     compiled off the frame and waited for, and only then added (on a 14 m ring round the crossing's end); unloaded and
 *     disposed on depart. The row hands the loader only the rows (`assetsOf`), and passes a Malpais crossing only if the
 *     loader's steps ran in that order. (Wave 1 drove the same order from this file: cc1e850-29a32d6.)
 *     WAVE 3 (fix round 1): the Malpais' REAL build exists (src/world/sites/malpais-region.js, area A: e4c2321, decc1d7,
 *     12b9a57), so it is what a Malpais crossing measures; the stand-ins come back only with --standin. Its steps are read
 *     off its own stats as they are written; a crossing passes only if the seam's order held (approached, registered,
 *     compiled and awaited, then added) and the region was taken down again on depart.
 *   - NW11 / EF2 in the page: the Holds' cast (holds.js state, persons, and the people bank's GLBs of the cast) is read at
 *     each crossing's start and end, and on the Holds-to-Malpais jog at each of the Kiln Yards' four wellheads (3 s each,
 *     the recording paused).
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
import { causeOf } from './region-hitch-cause.mjs';
import { fixture } from '../gates/systems/hour-two-fixtures.mjs';
import { makeRecord } from '../../src/game/save/format.js';
import { heightAt } from '../../src/world/island/recipe.js';
import { REGIONS } from '../../src/core/regions.js';
import { WELLHEADS } from '../../src/world/sites/kilnyards-layout.js';
import { HOLDS_CAST } from '../../src/world/npc/people/holds.js';
import { ARCHETYPE_IDS, SLICE_CAST } from '../../src/world/npc/people/ids.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
if (PORT === 5173) throw new Error('5173 is never used');
const BUILT = args.includes('--built');
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
/** --standin: wave 2's stand-in rows for the Malpais even where its real build exists (by default, WAVE 3, the real one). */
const FORCE_STANDIN = args.includes('--standin');
/** The Holds' cast GLBs that leave with the region (the regions seam's `cast`: HOLDS_CAST less the boot-staged archetypes). */
const HOLDS_ONLY = HOLDS_CAST.filter((id) => !ARCHETYPE_IDS.includes(id) && !SLICE_CAST.includes(id));

/**
 * The Malpais' stand-in rows: shipped GLBs (people, the town kit, the sea stacks) whose sum is at or over the Malpais'
 * plan lines (14 MB shipped, 16 MiB resident; tools/perf/region-hitch-resident.mjs counts them the texture ledger's way).
 */
const MAL = REGIONS.find((r) => r.id === 'malpais');
const STANDIN_FILES = ['models/npc/guild-matron.glb', 'models/npc/boat-caulker-2.glb', 'models/npc/salt-porter-2.glb', 'models/npc/lantern-keeper-2.glb',
  'models/npc/salt-raker-2.glb', 'models/npc/tube-smith.glb', 'models/npc/atlas-pan.glb', 'models/settlements/saltrow-kit.glb', 'models/landmarks/sea-stacks.glb'];

const report = {
  row: 'A-region-hitch', wave: 3, loader: 'the Malpais: its own build on the seam (MalpaisRegion: fetch, build in 5 ms slices, register, compile off the frame and wait, upload a texture a frame, add; release on depart); a region with rows: the game\'s RegionLoader (load, upload, register, compile and wait, add; unload on depart)', commit, clean: !!process.env.CLEAN_COMMIT, built: BUILT, port: PORT, startedAt: new Date().toISOString(),
  bar: { over50: 0, over33: 1 }, standIn: { malpais: MAL.standIn, files: STANDIN_FILES, forced: FORCE_STANDIN }, holdsCast: HOLDS_ONLY,
  standInNote: 'her movement is carried (no kite, no input drive); WAVE 3: the Malpais is its real build (src/world/sites/malpais-region.js) unless --standin, where shipped GLBs fetched again stand in for it', crossings: [], console: [],
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
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (/standin=|\/malpais\//.test(e.name)) R.res.push({ url: e.name.replace(/^.*\/(models|textures)\//, ''), start: e.startTime, end: e.responseEnd, bytes: e.encodedBodySize }); }).observe({ type: 'resource', buffered: true });
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

/**
 * In the page after Continue: the Malpais' stand-in rows handed to the regions seam's OWN loader (wave 2: engine.attachRegions'
 * load, upload one texture a frame, register with the sky, compile off the frame and wait, add; unload on depart). Only
 * `assetsOf` is the row's: each approach gets the rows under fresh names and a fresh `?standin=` query (nothing cached),
 * each standing at a point on a 14 m ring round `place`. The loader's steps come back as `region-load-step` events.
 */
const installStandIn = (rows, place, forceStandIn = false) => {
  const C = window.__CTX__, E = C.engine, R = E.regions, S = window.__rh;
  const mark = (tag, extra = {}) => S.marks.push({ t: Math.round(performance.now()), tag, ...extra });
  const held = (window.__standIn = window.__standIn || { loads: 0 });
  const H = (x, z) => C.terrain?.getHeight?.(x, z) ?? 0;
  // WAVE 3: the Malpais' real build (src/world/sites/malpais-region.js MalpaisRegion, on the seam's `region-approach`) is
  // what the crossing measures; the stand-ins are wave 2's and come back only with --standin
  const M = C.terrain?.malpais || null;
  const real = !!M && !forceStandIn;
  held.real = real;
  if (real) {
    R.loader.assetsOf = (r) => r.assets;
    // each step of the real build marks the frame it lands in (stats.ms is written as each step ends; stats.compile once
    // the programs are linked and awaited; stats.builds as it is added; stats.releases as it is taken down)
    M.stats.ms = new Proxy({}, { set(t, k, v) { if (!(k in t)) mark(`malpais:${String(k)}`); t[k] = v; return true; } });
    if (!M.__rhStats) {
      M.__rhStats = true;
      M.stats = new Proxy(M.stats, { set(t, k, v) {
        if (k === 'compile') mark('malpais:compile', { ms: Math.round(v?.ms ?? 0), programs: v?.programs ?? 0 });
        if (k === 'builds') mark('malpais:ready');
        if (k === 'releases') mark('malpais:released');
        t[k] = v; return true;
      } });
    }
  } else {
    R.loader.assetsOf = (r) => {
      if (r.id !== 'malpais') return r.assets;
      held.loads++;
      const tag = `s${held.loads}`, names = Object.keys(rows);
      return Object.fromEntries(names.map((n, i) => {
        const a = (i / names.length) * Math.PI * 2, x = place.x + Math.cos(a) * 14, z = place.z + Math.sin(a) * 14;
        return [`${n}-${tag}`, { ...rows[n], url: `${rows[n].url}?standin=${tag}`, at: { x, y: H(x, z), z } }];
      }));
    };
  }
  if (!window.__standInEv) {
    window.__standInEv = true;
    for (const k of ['enter', 'leave', 'approach', 'depart']) C.events.on(`region-${k}`, (e) => window.__rh.marks.push({ t: Math.round(performance.now()), tag: `region-${k}`, region: e.region, depth: e.depth }));
    // the loader's own steps (load, upload, register, compile, add, unload), as the stand-in's marks were
    C.events.on('region-load-step', (e) => { const tag = { load: 'load-done', upload: 'uploaded-spread', register: 'registered', compile: 'programs-ready', add: 'added', unload: 'unloaded' }[e.step] || e.step; mark(tag, { region: e.region, ms: e.ms }); });
  }
  S.where = () => { const p = C.player.position; return { x: Math.round(p.x), z: Math.round(p.z), region: R.tracker.current }; };
  return { loader: !!R.loader.compile && !!R.loader.register && !!R.loader.add, real, malpaisState: M?.state ?? null };
};

/** In the page: the Holds' cast as the game holds it (holds.js state, persons, and which of `ids` the people bank holds). */
const castNow = (ids) => {
  const C = window.__CTX__, P = C.people, T = C.engine.regions?.tracker, p = C.player.position;
  const bank = P?.bank?.entries;
  return { state: P?.holds?.state ?? null, persons: P?.holds?.persons?.size ?? null, banked: bank ? ids.filter((id) => bank.has(id)) : null,
    nearHolds: T ? T.near.has('holds') : null, region: T?.current ?? null, at: { x: Math.round(p.x), z: Math.round(p.z) } };
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

/* A long frame's cause: tools/perf/region-hitch-cause.mjs (pure; a saved report can be re-read with it). */

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
      const inst = await page.evaluate(installStandIn, rows, inside, FORCE_STANDIN);
      C.gameLoader = inst.loader; C.real = inst.real; C.malpaisStateAtStart = inst.malpaisState;
      if (inst.real && (c.to === 'malpais' || c.from === 'malpais')) C.standIn = 'carried; the Malpais\' REAL build (MalpaisRegion on region-approach: fetch, build in slices, register, compile off the frame, upload, add)';
      // to the start (a teleport: not counted), settle 4 s
      await page.evaluate((cc) => { const C = window.__CTX__, p = C.player; p.flight = cc.mode === 'flight' ? 'gliding' : 'none'; p.position.x = cc.a.x; p.position.z = cc.a.z; p._snapToGround?.(p.position.y + 200); }, c);
      await page.evaluate(hold, c.a, c.agl, 4000);
      C.castAtStart = await page.evaluate(castNow, HOLDS_ONLY);
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
      C.mid = await page.evaluate(() => { const C = window.__CTX__, g = C.engine._regionRoots?.malpais, M = C.terrain?.malpais; return { status: C.engine.regionStatus(), standIn: { added: g ? g.children.length : 0, loads: window.__standIn.loads },
        malpais: M ? { state: M.state, builds: M.stats.builds, ms: { ...M.stats.ms }, totalMs: M.stats.totalMs, worstSliceMs: M.stats.worstSliceMs, compile: M.stats.compile, textures: M.stats.textures, draws: M.stats.draws, tris: M.stats.tris, error: M.stats.error } : null,
        holdsCast: { state: C.people?.holds?.state ?? null, persons: C.people?.holds?.persons?.size ?? null, archetypes: C.people?.bank ? [...C.people.bank.entries.keys()] : null } }; });
      C.castAtEnd = await page.evaluate(castNow, HOLDS_ONLY);
      // NW11 / EF2 in the page: on foot from the crossing's end to each of the Kiln Yards' four wellheads (her jog, the
      // recording paused: this is residency, not the crossing's frames), 3 s at each, the Holds' cast read as the game holds it
      if (c.to === 'malpais' && c.mode === 'walk') {
        await page.evaluate(() => { window.__rh.on = false; });
        C.wellheads = [];
        let from = c.b;
        for (const w of WELLHEADS) {
          const to = { x: w.x - 2.5, z: w.z + 2.5 };
          await page.evaluate(carry, c, from, to, 0);
          await page.evaluate(hold, to, 0, 3000);
          C.wellheads.push({ id: w.id, ...(await page.evaluate(castNow, HOLDS_ONLY)) });
          from = to;
        }
        const shotW = path.join(OUT, `${c.id}-wellhead.jpg`);
        await page.screenshot({ path: shotW, type: 'jpeg', quality: 80 }).catch(() => null);
        await page.evaluate(carry, c, from, c.b, 0);
        await page.evaluate(hold, c.b, 0, 1500);
        log(`${c.id}: the Holds' cast at the wellheads: ${C.wellheads.map((w) => `${w.id} ${w.state}/${w.persons} (${w.banked?.length ?? '?'} banked)`).join(', ')}`);
      }
      await page.evaluate(() => { window.__rh.last = 0; window.__rh.on = true; });
      C.back = await page.evaluate(carry, c, c.b, c.a, c.agl);
      await page.evaluate(hold, c.a, c.agl, 3000);
      const R = await page.evaluate(() => { const S = window.__rh; S.on = false; return { frames: S.frames, over33: S.over33, over50: S.over50, maxMs: +S.max.toFixed(1), long: S.long, marks: S.marks, res: S.res, loaf: S.loaf }; });
      C.after = await page.evaluate(() => { const C = window.__CTX__, g = C.engine._regionRoots?.malpais; return { status: C.engine.regionStatus(), standInHeld: g ? g.children.length : 0, malpaisState: C.terrain?.malpais?.state ?? null, hp: Math.round(C.player.health ?? 0), dead: !!document.querySelector('.mn-death.show') }; });
      C.castAfter = await page.evaluate(castNow, HOLDS_ONLY);
      // down to the ground again before the next crossing (a teleport: not counted)
      await page.evaluate(() => { const p = window.__CTX__.player; p._snapToGround?.(p.position.y + 2); window.__CTX__.player.flight = 'none'; });
      C.frames = R.frames; C.over33 = R.over33; C.over50 = R.over50; C.maxMs = R.maxMs;
      C.long = R.long.map((f) => ({ ...f, ...causeOf(f, R.marks, R.res, R.loaf) }));
      C.marks = R.marks; C.fetched = R.res.map((r) => ({ url: r.url, ms: Math.round(r.end - r.start), bytes: r.bytes }));
      C.fetchedBytes = R.res.reduce((s, r) => s + (r.bytes || 0), 0);
      if (C.real) {
        // the seam's order on the real build: approached first; registered, then compiled and awaited, then (uploaded and)
        // added; and taken down on depart
        const at = (tag) => { const m = C.marks.find((q) => q.tag === tag && (q.region == null || q.region === 'malpais')); return m ? m.t : null; };
        const seq = C.marks.filter((m) => /^malpais:/.test(m.tag) || (/^region-(approach|depart)$/.test(m.tag) && m.region === 'malpais')).map((m) => m.tag);
        C.loaderOrder = seq;
        const tA = at('region-approach'), tR = at('malpais:register'), tC = at('malpais:compile'), tU = at('malpais:upload'), tAdd = at('malpais:add'), tReady = at('malpais:ready');
        C.addedAtMs = tA != null && tReady != null ? tReady - tA : null;
        C.loaderOrderOk = c.to !== 'malpais' || (tA != null && tR != null && tC != null && tAdd != null && tReady != null && tA <= tR && tR <= tC && tC <= tAdd && (tU == null || tU <= tAdd) && seq.includes('malpais:released'));
        if (c.to === 'malpais') C.pass = !C.after.dead && C.modeBound && C.gameLoader && C.loaderOrderOk && C.after.malpaisState === 'cold' && C.over50 <= report.bar.over50 && C.over33 <= report.bar.over33 && C.long.every((f) => f.cause !== 'unattributed');
        else C.pass = !C.after.dead && C.modeBound && C.gameLoader && !seq.length && C.over50 <= report.bar.over50 && C.over33 <= report.bar.over33 && C.long.every((f) => f.cause !== 'unattributed');
      } else {
        const order = C.marks.filter((m) => ['load-done', 'uploaded-spread', 'registered', 'programs-ready', 'added'].includes(m.tag)).map((m) => m.tag);
        C.loaderOrder = order;
        C.loaderOrderOk = c.to !== 'malpais' || order.join(',').startsWith('load-done,uploaded-spread,registered,programs-ready,added');
        C.pass = !C.after.dead && C.modeBound && C.gameLoader && C.loaderOrderOk && (c.to !== 'malpais' || C.fetchedBytes > 0) && C.over50 <= report.bar.over50 && C.over33 <= report.bar.over33 && C.long.every((f) => f.cause !== 'unattributed');
      }
      // NW11 in the page (a separate verdict; it does not fail the crossing): the cast stood at the Holds end of a Pans
      // crossing, and is out of memory at every wellhead
      if (C.wellheads) C.castGoneAtWellheads = C.wellheads.every((w) => w.state === 'out' && w.persons === 0 && (w.banked?.length ?? 1) === 0);
      if (c.to === 'holds') C.castCycle = { atHoldsEnd: C.castAtEnd, backAtStart: C.castAfter };
      C.shot = path.basename(shotOut);
      log(`${c.id}: ${C.frames} frames, ${C.over33} over 33 ms, ${C.over50} over 50 ms (max ${C.maxMs}); ${C.real ? 'real Malpais' : 'stand-in'} ${(C.fetchedBytes / 1e6).toFixed(2)} MB fetched; order ${(C.loaderOrder || []).join('>')}; ${C.pass ? 'PASS' : 'FAIL'}`);
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
