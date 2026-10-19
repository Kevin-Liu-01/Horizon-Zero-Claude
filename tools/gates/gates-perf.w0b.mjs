/**
 * ROUND 5 — lane `gates-perf`, W0b block (docs/ROUND5-PLAN.md §2 row gates-perf, §9 gates-perf, §4.2, §4.4,
 * §10.2 item 4, §6 `reference/*.jpg`; E27, E32).
 *
 *   A-reference-clean    reference/ holds no Guerrilla/Sony/HZD/HFW file (the deleted Round-4 stills are named with
 *                        their sha256 in reference/MANIFEST.md and may not reappear under any name); every file has a
 *                        MANIFEST row with licence PD / CC0 / CC BY (attributed) / own photo; share-alike or unclear
 *                        sources are URL-only rows; V12 / V22 / V24 / V46 / V48 point at reference/r5/**
 *   A-reference-set      tools/r5-refs/fetch.mjs pulls from the Wikimedia Commons API filtered to PD / CC0 / CC BY
 *                        (classifier controls), the set verifies offline, and every V gate names >= 1 reference file
 *                        under reference/r5/** with a MANIFEST row (author, source URL, licence, retrieved date)
 *   A-alloc-rate         CDP sampling heap profiler over 10 s of the staged fight + 10 s of sprint-and-draw: steady
 *                        allocation attributed to src/** <= 64 KB/s, no single src function > 4 KB/s, post-GC heap
 *                        slope <= 0
 *   A-vram-ledger        staged fight: texture bytes <= 160 MB, render targets <= 170 MB (the A-rt-ledger cap),
 *                        geometry buffers <= 120 MB, sum <= 450 MB — from a census of the GL allocation calls
 *   A90-abs              after the A90 kill -> respawn workload, forced GC, then the staged fight for 60 s: post-GC
 *                        JS heap <= 450 MB and the Chrome GPU process footprint <= 1.5 GB, both written to the report
 *   A-unattributed-cap   staged fight, hide each registered draw owner in turn: draws from scene children with no
 *                        registered owner are recorded at W0 (the cap), non-increasing every wave, <= 30 from W2
 *
 * REGISTRATION. Until the orchestrator closes W0a gates-perf this module is run with
 *   node tools/gates.mjs --port 5255 --extra tools/gates/gates-perf.w0b.mjs --only <ids>
 * and then registered by one line in tools/gates.r5.gates-perf.mjs (its GATES array spreads this GATES), after
 * which `node tools/gates.mjs --port 5255 --lane gates-perf` runs it.
 *
 * CHROME. The four perf rows are RUNNER rows (they need CDP: the sampling heap profiler, HeapProfiler GC,
 * SystemInfo). Each opens ONE page: on the harness's own Chrome when this gates.mjs process already has one
 * (connected through its DevToolsActivePort, so no second Chrome), else on a Chrome it launches through the same
 * semaphore + disk/memory preflight as the harness (tools/chrome-profile.mjs) and closes before returning.
 *
 * MEMORY RULE (plan §0 rule 5) for this file's own page code: preallocated arrays only in the per-frame paths;
 * every hook it installs is removed before the row returns; the page is closed.
 *
 * Units: 1 KB = 1024 B for allocation rates; 1 MB = 1e6 B and 1 GB = 1e9 B for memory (the A-rt-ledger convention).
 */
import puppeteer from 'puppeteer';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { PROFILE_ROOT, profileDir, disposeProfile, acquireChromeSlot, installProfileCleanup } from '../chrome-profile.mjs';
import { BUDGETS, STAGE_PRELUDE, PERF_SCENARIOS } from '../budgets.mjs';
import { ROSTER } from '../gate-roster.mjs';
import { PLACES } from '../gate-places.mjs';
import { RT_LEDGER } from '../r5-probes/rt-ledger.mjs';
import { verify as verifyReferenceSet } from '../r5-refs/fetch.mjs';
import { classifierSelfTest, FORBIDDEN_SOURCE_RE, STORED_LICENCES } from '../r5-refs/licence.mjs';
import { readManifest, laneFolders } from '../r5-refs/manifest.mjs';
import { SLOTS } from '../r5-refs/slots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, '..');
const ROOT = path.resolve(TOOLS, '..');
const LANE = 'gates-perf';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
const MB = (b) => r2(b / 1e6);

/* ------------------------------------------------------------------------------------------------ */
/* budgets (plan §4.4, §9). They move into tools/budgets.mjs when W0a gates-perf has closed (that file */
/* is part of the W0a carried build fingerprint until then); the numbers are the plan's, verbatim.     */
/* ------------------------------------------------------------------------------------------------ */
export const W0B_BUDGETS = Object.freeze({
  alloc: { srcKBps: 64, fnKBps: 4, heapSlopeBps: 0, windowS: 10, warmupS: 3, samplingIntervalB: 2048, refFps: 60 },
  vram: { texturesB: 160e6, renderTargetsB: 170e6, geometryB: 120e6, totalB: 450e6 },
  abs: { heapB: 450e6, gpuProcessB: 1.5e9, fightS: 60, a90LoopS: 150, a90LifecycleS: 150, minKills: 25 },
  unattributed: { w2Bar: 30 },
});

/**
 * THE W0 UNATTRIBUTED-DRAW CAP (plan §4.2 row "unattributed scene children (measured at W0, capped <= 30 by W2)").
 * Recorded from the first W0b measurement of A-unattributed-cap on the staged fight (the run is named); every later
 * wave must measure <= this, and <= 30 from the W2 exit. null = not recorded yet (the gate then records nothing and
 * reports PENDING with the measured value, which is what gets written here).
 */
export const UNATTRIBUTED_CAP_W0 = null;

/**
 * DRAW OWNERS (plan §4.2 rows). A top-level scene child is REGISTERED to an owner when its name matches that
 * owner's pattern; draws from a scene child that matches none (or has no name) are UNATTRIBUTED. The post chain
 * is not a scene child (its fullscreen quads have no scene ancestor) and is measured as its own row.
 */
export const DRAW_OWNERS = Object.freeze([
  { id: 'terrain-sky-sea', row: 'terrain, skirt, sky, sea', re: /^(terrain|terrain-?skirt|skirt|sky|sky-?dome|sea|ocean|water|river-?water|horizon-?ring|ridges?)$/i },
  { id: 'ground-scatter', row: 'ground scatter', re: /scatter|rocks?$|pebbles|ground-?cover/i },
  { id: 'vegetation', row: 'vegetation chunks', re: /^vegetation|grass|trees?$|shrubs?/i },
  { id: 'landmarks-places', row: 'landmarks + places', re: /^props?$|landmark|places?$|sites?$|megastructure|tallneck|rockworks|gather/i },
  { id: 'settlement', row: 'settlement kit', re: /settlement|^camp$|hamlet/i },
  { id: 'instruments', row: 'Instruments', re: /^machines?$|instruments?$/i },
  { id: 'lamp-beams', row: 'lamp beams', re: /beam/i },
  { id: 'hero', row: 'Brea + gear', re: /^(player|hero|brea)/i },
  { id: 'npcs', row: 'NPCs', re: /^npcs?$|people/i },
  { id: 'vfx-ui-pooled', row: 'VFX, UI, pooled', re: /particles?|vfx|fx$|arrows?|trails?|decals?|projectiles?|pool|fauna|weather|rain|dust/i },
]);
export const ownerOfName = (name) => (name ? (DRAW_OWNERS.find((o) => o.re.test(name)) || null) : null);

/* ------------------------------------------------------------------------------------------------ */
/* Chrome + page plumbing                                                                             */
/* ------------------------------------------------------------------------------------------------ */
const LAUNCH_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
  '--js-flags=--expose-gc', '--enable-precise-memory-info'];

/** the same HMR stub tools/gates.mjs installs (a page with a live Vite HMR socket reloads under us) */
const HMR_STUB = () => {
  const Real = window.WebSocket;
  function Dead() {
    const target = new EventTarget();
    target.readyState = 1; target.protocol = 'vite-hmr'; target.send = () => {}; target.close = () => { target.readyState = 3; };
    setTimeout(() => { const ev = new Event('open'); target.dispatchEvent(ev); if (typeof target.onopen === 'function') target.onopen(ev); }, 0);
    return target;
  }
  window.WebSocket = function (url, protocols) {
    const p = Array.isArray(protocols) ? protocols[0] : protocols;
    if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead();
    return new Real(url, protocols);
  };
  window.WebSocket.prototype = Real.prototype;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
};

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`infra: ${what} timed out after ${ms} ms`)), ms))]);

/** this process's harness Chrome (connect, never a second Chrome), else one launched through the semaphore */
async function openBrowser(PORT) {
  let dirs = [];
  try { dirs = readdirSync(PROFILE_ROOT).filter((d) => d.startsWith(`cal-${process.pid}-`)); } catch { dirs = []; }
  for (const d of dirs) {
    const f = path.join(PROFILE_ROOT, d, 'DevToolsActivePort');
    if (!existsSync(f)) continue;
    const [port, wsPath] = readFileSync(f, 'utf8').split('\n');
    try {
      const browser = await puppeteer.connect({ browserWSEndpoint: `ws://127.0.0.1:${port.trim()}${wsPath.trim()}`, protocolTimeout: 900000, defaultViewport: null });
      return { browser, shared: true, dir: null };
    } catch { /* a stale file: launch our own below */ }
  }
  installProfileCleanup();
  await acquireChromeSlot();
  const dir = profileDir(PORT);
  const browser = await puppeteer.launch({ protocolTimeout: 900000, headless: 'new', args: LAUNCH_ARGS, userDataDir: dir });
  return { browser, shared: false, dir };
}
async function closeBrowser(h) {
  if (!h) return;
  if (h.shared) { try { await h.browser.disconnect(); } catch { /* gone */ } return; }
  await withTimeout(h.browser.close(), 20000, 'browser.close').catch(() => { try { h.browser.process()?.kill('SIGKILL'); } catch { /* gone */ } });
  disposeProfile(h.dir);
}

/** A fresh game page exactly as tools/gates.mjs boots one (?shot=1, 1600x900, HMR stub), optional init scripts. */
async function bootPage(browser, PORT, initScripts = []) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.setViewport({ width: 1600, height: 900 });
  await page.evaluateOnNewDocument(HMR_STUB);
  for (const s of initScripts) await page.evaluateOnNewDocument(s);
  await page.goto(`http://localhost:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__READY__ === true', { timeout: 90000 });
  return { page, errors };
}
/** the harness's system-error ledger read (a gate with system or hook errors FAILs, as in tools/gates.mjs) */
async function systemLedger(page) {
  return page.evaluate(`(() => { const g = window.__GAME__; if (!g) return null;
    return { systemErrors: (g.systemErrors || []).map((r) => ({ key: r.key, count: r.count, message: String(r.message).slice(0, 160) })),
      hookErrors: window.__CTX__?.engine?.hookErrorCount || 0 }; })()`).catch(() => null);
}

/**
 * Run fn({ page, cdp, browser, errors }) on a fresh page; console errors and system/hook errors FAIL the row
 * (the harness's rule for action rows), the page is closed and our Chrome (if we launched it) is closed.
 */
async function onPage(PORT, fn, { initScripts = [] } = {}) {
  let h = null, page = null;
  try {
    h = await openBrowser(PORT);
    const booted = await bootPage(h.browser, PORT, initScripts);
    page = booted.page;
    const cdp = await page.createCDPSession();
    const out = await fn({ page, cdp, browser: h.browser, errors: booted.errors, shared: h.shared });
    const sys = await systemLedger(page);
    const bad = sys ? sys.systemErrors : [];
    if (booted.errors.length || bad.length || (sys && sys.hookErrors)) {
      return { pass: false, detail: { ...(typeof out.detail === 'object' ? out.detail : { result: out.detail }),
        verdict: 'FAIL: console / system errors during the row (the harness rule): ' + [...booted.errors.slice(0, 3), ...bad.slice(0, 3).map((b) => b.key + ': ' + b.message)].join(' | '),
        consoleErrors: booted.errors.slice(0, 8), systemErrors: bad, hookErrors: sys?.hookErrors || 0, measuredPass: out.pass } };
    }
    return { ...out, detail: { ...(typeof out.detail === 'object' ? out.detail : { result: out.detail }), chrome: h.shared ? 'the harness Chrome of this run (connected)' : 'one Chrome launched through the semaphore, closed after the row' } };
  } finally {
    if (page) await withTimeout(page.close(), 15000, 'page.close').catch(() => {});
    await closeBrowser(h);
  }
}

/* ------------------------------------------------------------------------------------------------ */
/* page-side staging (the A21 staged fight: role-cast by tools/gate-roster.mjs, placed by gate-places)  */
/* ------------------------------------------------------------------------------------------------ */
const FRAMES = `const __frames = (n) => new Promise((res) => { let k = 0; const t = () => (++k >= n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); });`;

/**
 * Stage plan §9's staged fight at the shipped tier's pixel ratio on a DPR-2 display (A21's convention:
 * applied = min(BUDGETS.deviceDpr, tier.dprCap)), dynamic resolution off, composition pinned. Leaves
 * window.__w0bUnpin and window.__w0bFight; returns { skip } when no role can be cast (R18 / R28 / R30).
 */
const STAGE_FIGHT = `(async () => {
  ${ROSTER}
  ${PLACES}
  ${STAGE_PRELUDE}
  ${FRAMES}
  const SC = ${JSON.stringify({ fight: PERF_SCENARIOS['staged-fight'] })};
  const ctx = __CTX__, e = ctx.engine;
  ctx.input.enabled = true;
  const applied = Math.min(${BUDGETS.deviceDpr}, e.tier.dprCap);
  if (e.setDynamicResolution) e.setDynamicResolution(false);
  e.basePixelRatio = applied; e.renderScale = 1; e.resize();
  const unpin = eval(SC.fight);
  if (unpin && unpin.skip) return { skip: unpin.skip };
  window.__w0bUnpin = unpin;
  // keep her alive through a long staged fight (the subject is memory, not combat)
  const p = ctx.player;
  const heal = () => { if (p.maxHealth) p.health = p.maxHealth; };
  ctx.engine.onAfterRender.push(heal);
  window.__w0bHeal = heal;
  await __frames(60);
  window.__w0bFight = { cast: __stage.casts['staged-fight'], appliedPixelRatio: applied, devicePixelRatioSimulated: ${BUDGETS.deviceDpr},
    quality: e.quality, tierDprCap: e.tier.dprCap, rendererPixelRatio: +e.renderer.getPixelRatio().toFixed(3),
    drawingBuffer: [e.renderer.domElement.width, e.renderer.domElement.height] };
  return window.__w0bFight;
})()`;
const UNSTAGE = `(() => { try { window.__w0bUnpin && window.__w0bUnpin(); } catch (e) {}
  const a = __CTX__.engine.onAfterRender, i = a.indexOf(window.__w0bHeal); if (i >= 0) a.splice(i, 1);
  window.__w0bUnpin = null; window.__w0bHeal = null; return true; })()`;

const gcAndHeap = async (cdp) => {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const u = await cdp.send('Runtime.getHeapUsage');
  return u.usedSize;
};
const slope = (pts) => {             // least squares, bytes per second
  const n = pts.length; if (n < 2) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den ? num / den : null;
};

/* ------------------------------------------------------------------------------------------------ */
/* A-alloc-rate                                                                                      */
/* ------------------------------------------------------------------------------------------------ */
/**
 * Attribution from a sampling heap profile (CDP HeapProfiler, objects collected by minor and major GC
 * included, so every allocation in the window counts, not only the survivors):
 *   self    the allocating frame is a src/** function (the profiler's own attribution) — GRADED
 *   caller  the nearest src/** frame on the allocating stack (a three.js or browser allocation made on behalf
 *           of src code) — REPORTED, so a renderer-internal per-frame allocation still names the src call site
 */
function attribute(profile, seconds, frames, PORT) {
  const srcRe = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${PORT}/src/`);
  const key = (cf) => `${cf.functionName || '(anonymous)'} ${String(cf.url).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
  let total = 0, srcSelf = 0, srcCaller = 0;
  const self = new Map(), caller = new Map(), outside = new Map();
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  const walk = (node, nearest) => {
    const cf = node.callFrame || {};
    const isSrc = srcRe.test(cf.url || '');
    const here = isSrc ? key(cf) : nearest;
    const sz = node.selfSize || 0;
    if (sz) {
      total += sz;
      if (isSrc) { srcSelf += sz; add(self, here, sz); }
      if (here) { srcCaller += sz; add(caller, here, sz); }
      if (!isSrc) add(outside, `${key(cf)}  <-  ${here || '(no src frame on the stack)'}`, sz);
    }
    for (const c of node.children || []) walk(c, here);
  };
  walk(profile.head, null);
  const fps = frames / seconds;
  // graded rate: the measured rate, or the per-frame bytes at 60 fps when the box ran slower (a starved
  // box allocates less per second; per frame it does not)
  const at = (b) => { const perS = b / 1024 / seconds; const per60 = frames ? (b / 1024 / frames) * W0B_BUDGETS.alloc.refFps : perS; return { measuredKBps: r2(perS), kbPerFrame: frames ? r2(b / 1024 / frames) : null, gradedKBps: r2(Math.max(perS, per60)) }; };
  const top = (m, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, b]) => ({ fn: k, ...at(b) }));
  return { seconds: r2(seconds), frames, fps: r1(fps), total: at(total), srcSelf: at(srcSelf), srcCaller: at(srcCaller),
    topSrcSelf: top(self), topSrcCaller: top(caller, 8), topOutsideSrc: top(outside, 8), srcFunctionsSeen: self.size };
}

async function allocRate({ PORT }) {
  const B = W0B_BUDGETS.alloc;
  return onPage(PORT, async ({ page, cdp }) => {
    await cdp.send('HeapProfiler.enable');
    const fight = await page.evaluate(STAGE_FIGHT);
    if (fight.skip) return { pass: null, detail: { verdict: fight.skip.split(':')[0] + ': the staged fight has no cast — ' + fight.skip } };
    const phase = async (name, drive) => {
      await sleep(B.warmupS * 1000);                                     // steady state, not the staging transient
      const heap = [];
      const f0 = await page.evaluate('__CTX__.engine.frames');
      const t0 = Date.now();
      heap.push([0, await gcAndHeap(cdp)]);
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: B.samplingIntervalB, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      const tS = Date.now();
      const stopDrive = drive ? await drive() : null;
      for (let k = 1; k <= 4; k++) { await sleep((B.windowS * 1000) / 4 - 150); heap.push([(Date.now() - tS) / 1000, await gcAndHeap(cdp)]); }
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      const seconds = (Date.now() - tS) / 1000;
      if (stopDrive) await stopDrive();
      const frames = (await page.evaluate('__CTX__.engine.frames')) - f0;
      const a = attribute(profile, seconds, frames, PORT);
      const s = slope(heap);
      return { name, ...a, heapPostGcB: heap.map(([t, b]) => [r2(t), b]), heapSlopeBps: s === null ? null : Math.round(s), wallS: r2((Date.now() - t0) / 1000) };
    };
    const fightPhase = await phase('staged fight', null);
    await page.evaluate(UNSTAGE);
    // sprint-and-draw: open ground, W + Shift held; every 2.5 s a full draw (RMB aim + LMB draw, held 1.2 s) and a loose
    await page.evaluate(`(async () => { ${PLACES} const p = __CTX__.player; if (PLACE('openGround')) standAt(p, 'openGround'); __CTX__.input.enabled = true; return true; })()`);
    const drive = async () => {
      await page.evaluate(`(() => { const I = __CTX__.input; I.keys.add('KeyW'); I.keys.add('ShiftLeft');
        window.__w0bDraw = setInterval(() => { I.mouse.buttons |= 4; I.mouse.buttons |= 1; setTimeout(() => { I.mouse.buttons &= ~1; setTimeout(() => { I.mouse.buttons &= ~4; }, 150); }, 1200); }, 2500);
        return true; })()`);
      return () => page.evaluate(`(() => { clearInterval(window.__w0bDraw); const I = __CTX__.input; I.keys.delete('KeyW'); I.keys.delete('ShiftLeft'); I.mouse.buttons = 0; return true; })()`);
    };
    const runPhase = await phase('sprint and draw', drive);
    const shots = await page.evaluate(`(() => ({ arrowsFired: __CTX__.combat?.stats?.arrowsFired ?? null, sprinting: !!__CTX__.player.sprinting }))()`).catch(() => null);
    const phases = [fightPhase, runPhase];
    const worstSrc = Math.max(...phases.map((p) => p.srcSelf.gradedKBps));
    const worstFn = phases.flatMap((p) => p.topSrcSelf.map((x) => ({ ...x, phase: p.name }))).sort((a, b) => b.gradedKBps - a.gradedKBps)[0] || null;
    const slopes = phases.map((p) => p.heapSlopeBps);
    const checks = {
      srcAllocationWithinBudget: worstSrc <= B.srcKBps,
      noSrcFunctionOverBudget: !worstFn || worstFn.gradedKBps <= B.fnKBps,
      postGcHeapSlopeNotPositive: slopes.every((s) => s !== null && s <= B.heapSlopeBps),
      profilerSawAllocations: phases.every((p) => p.total.measuredKBps > 0),
    };
    const pass = Object.values(checks).every(Boolean);
    return { pass, detail: {
      verdict: (pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', ')) + ` — src/** ${worstSrc} KB/s (bar ${B.srcKBps}), worst src function ${worstFn ? worstFn.fn + ' ' + worstFn.gradedKBps + ' KB/s in ' + worstFn.phase : 'none'} (bar ${B.fnKBps}), post-GC heap slope ${slopes.map((s) => (s === null ? '?' : r1(s / 1024) + ' KB/s')).join(' / ')} (bar <= 0); `
        + phases.map((p) => `${p.name}: ${p.fps} fps, all allocation ${p.total.measuredKBps} KB/s`).join('; ') + ` — staged fight ${JSON.stringify(fight.cast?.cast || [])} at pixel ratio ${fight.appliedPixelRatio} (tier ${fight.quality})`,
      checks, budget: B, fight, phases, input: shots,
      method: 'CDP HeapProfiler.startSampling (interval ' + B.samplingIntervalB + ' B, objects collected by minor and major GC included) over ' + B.windowS + ' s per phase after ' + B.warmupS + ' s of warm-up; graded = self attribution to src/** frames, max(measured KB/s, KB/frame x 60); post-GC heap = Runtime.getHeapUsage after two HeapProfiler.collectGarbage, 5 readings per phase, least-squares slope',
    } };
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* A-vram-ledger: a census of the GL allocation calls, installed before the game makes its context       */
/* ------------------------------------------------------------------------------------------------ */
/* the same sized-format table engine-gpu's A-rt-ledger-census uses (RGB stored as 4 channels, DEPTH_COMPONENT24 = 4 B) */
const GL_CENSUS = String.raw`(() => {
  if (window.__glCensus) return;
  const SIZED = { 0x8058: 4, 0x8C43: 4, 0x8051: 4, 0x8C41: 4, 0x881A: 8, 0x881B: 8, 0x8814: 16, 0x8815: 16,
    0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822F: 4, 0x822E: 4, 0x8230: 8, 0x8C3A: 4, 0x8059: 4, 0x8C3D: 4,
    0x8056: 2, 0x8057: 2, 0x8D62: 2, 0x81A5: 2, 0x81A6: 4, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 8, 0x8D48: 1,
    0x8231: 1, 0x8232: 1, 0x8233: 2, 0x8234: 2, 0x8235: 4, 0x8236: 4, 0x8237: 2, 0x8238: 2, 0x8239: 4,
    0x823A: 4, 0x823B: 8, 0x823C: 8, 0x8D8E: 4, 0x8D7C: 4, 0x8D88: 8, 0x8D76: 8, 0x8D82: 16, 0x8D70: 16,
    0x8F94: 1, 0x8F95: 2, 0x8F97: 4 };
  const CH = { 0x1908: 4, 0x1907: 4, 0x190A: 2, 0x1909: 1, 0x1906: 1, 0x1902: 1, 0x84F9: 1, 0x1903: 1 };
  const TY = { 0x1401: 1, 0x1400: 1, 0x1403: 2, 0x1402: 2, 0x140B: 2, 0x8D61: 2, 0x1406: 4, 0x1405: 4, 0x1404: 4 };
  const PACKED = { 0x8033: 2, 0x8034: 2, 0x8363: 2, 0x84FA: 4, 0x8C3B: 4, 0x8C3E: 4, 0x8368: 4, 0x8DAD: 8 };
  const unknown = new Set();
  const bpp = (ifmt, fmt, type) => { if (SIZED[ifmt]) return SIZED[ifmt]; if (PACKED[type]) return PACKED[type];
    if (CH[ifmt] && TY[type]) return CH[ifmt] * TY[type]; unknown.add('0x' + (ifmt || 0).toString(16)); return 4; };
  const CUBE = 0x8513, FACE0 = 0x8515, FACE5 = 0x851A, FB = 0x8D40, DRAW_FB = 0x8CA9, READ_FB = 0x8CA8;
  const objs = new Map();                    // GL object -> record (deleted objects are removed)
  const st = new WeakMap();
  const S = (gl) => { let s = st.get(gl); if (!s) { s = { unit: 0, tex: new Map(), rb: null, buf: new Map(), fb: new Map() }; st.set(gl, s); } return s; };
  const bindTarget = (t) => (t >= FACE0 && t <= FACE5 ? CUBE : t);
  const boundTex = (gl, target) => S(gl).tex.get(S(gl).unit + ':' + bindTarget(target)) || null;
  const texRec = (t) => { let r = objs.get(t); if (!r) { r = { kind: 'tex', levels: new Map(), rt: false, created: performance.now() }; objs.set(t, r); } return r; };
  const setLevel = (gl, target, level, w, h, d, bytes) => { const t = boundTex(gl, target); if (!t) return; texRec(t).levels.set(target + ':' + level, { w, h, d, bytes }); };
  const dims = (src) => src ? [src.videoWidth || src.naturalWidth || src.displayWidth || src.width || 0, src.videoHeight || src.naturalHeight || src.displayHeight || src.height || 0] : [0, 0];
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, after) => { const real = P[name]; if (!real) return; P[name] = function (...a) { const out = real.apply(this, a); try { after(this, a, out); } catch (e) { /* census only */ } return out; }; };
  wrap('activeTexture', (gl, [u]) => { S(gl).unit = u - 0x84C0; });
  wrap('bindTexture', (gl, [target, t]) => { S(gl).tex.set(S(gl).unit + ':' + target, t); });
  wrap('deleteTexture', (gl, [t]) => { objs.delete(t); });
  wrap('texImage2D', (gl, a) => {
    if (a.length >= 9) setLevel(gl, a[0], a[1], a[3], a[4], 1, a[3] * a[4] * bpp(a[2], a[6], a[7]));
    else { const [w, h] = dims(a[5]); setLevel(gl, a[0], a[1], w, h, 1, w * h * bpp(a[2], a[3], a[4])); }
  });
  wrap('texImage3D', (gl, a) => { setLevel(gl, a[0], a[1], a[3], a[4], a[5], a[3] * a[4] * a[5] * bpp(a[2], a[7], a[8])); });
  wrap('copyTexImage2D', (gl, a) => { setLevel(gl, a[0], a[1], a[5], a[6], 1, a[5] * a[6] * bpp(a[2], 0, 0)); });
  wrap('compressedTexImage2D', (gl, a) => { const d = a[6]; setLevel(gl, a[0], a[1], a[3], a[4], 1, typeof d === 'number' ? d : (d && d.byteLength) || 0); });
  wrap('compressedTexImage3D', (gl, a) => { const d = a[7]; setLevel(gl, a[0], a[1], a[3], a[4], a[5], typeof d === 'number' ? d : (d && d.byteLength) || 0); });
  wrap('texStorage2D', (gl, [target, levels, ifmt, w, h]) => {
    const faces = target === CUBE ? [FACE0, FACE0 + 1, FACE0 + 2, FACE0 + 3, FACE0 + 4, FACE5] : [target];
    for (const f of faces) for (let l = 0; l < levels; l++) { const lw = Math.max(1, w >> l), lh = Math.max(1, h >> l); setLevel(gl, target, f + '/' + l, lw, lh, 1, lw * lh * bpp(ifmt, 0, 0)); }
  });
  wrap('texStorage3D', (gl, [target, levels, ifmt, w, h, d]) => {
    for (let l = 0; l < levels; l++) { const lw = Math.max(1, w >> l), lh = Math.max(1, h >> l), ld = target === 0x806F ? Math.max(1, d >> l) : d; setLevel(gl, target, 's' + l, lw, lh, ld, lw * lh * ld * bpp(ifmt, 0, 0)); }
  });
  wrap('generateMipmap', (gl, [target]) => {
    const t = boundTex(gl, target); if (!t) return; const r = texRec(t);
    const base = [...r.levels.entries()].filter(([k]) => /:0$/.test(k));
    for (const [k, v] of base) {
      const face = k.split(':')[0]; let w = v.w, h = v.h, l = 0;
      const per = v.w * v.h * v.d ? v.bytes / (v.w * v.h * v.d) : 0;
      while (w > 1 || h > 1) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); l++; r.levels.set(face + ':' + l, { w, h, d: v.d, bytes: w * h * v.d * per }); }
    }
  });
  wrap('bindRenderbuffer', (gl, [, rb]) => { S(gl).rb = rb; });
  wrap('deleteRenderbuffer', (gl, [rb]) => { objs.delete(rb); });
  const rbStore = (gl, samples, ifmt, w, h) => { const rb = S(gl).rb; if (rb) objs.set(rb, { kind: 'rb', w, h, samples, bytes: w * h * Math.max(1, samples) * bpp(ifmt, 0, 0), rt: true }); };
  wrap('renderbufferStorage', (gl, [, ifmt, w, h]) => rbStore(gl, 0, ifmt, w, h));
  wrap('renderbufferStorageMultisample', (gl, [, samples, ifmt, w, h]) => rbStore(gl, samples, ifmt, w, h));
  wrap('bindFramebuffer', (gl, [target, fb]) => { const s = S(gl); if (target === FB) { s.fb.set(DRAW_FB, fb); s.fb.set(READ_FB, fb); } else s.fb.set(target, fb); });
  const attach = (t) => { if (t) texRec(t).rt = true; };
  wrap('framebufferTexture2D', (gl, a) => attach(a[3]));
  wrap('framebufferTextureLayer', (gl, a) => attach(a[2]));
  wrap('bindBuffer', (gl, [target, b]) => { S(gl).buf.set(target, b); });
  wrap('bindBufferBase', (gl, [target, , b]) => { S(gl).buf.set(target, b); });
  wrap('bindBufferRange', (gl, [target, , b]) => { S(gl).buf.set(target, b); });
  wrap('deleteBuffer', (gl, [b]) => { objs.delete(b); });
  wrap('bufferData', (gl, [target, src, , off, len]) => {
    const b = S(gl).buf.get(target); if (!b) return;
    const el = (src && src.BYTES_PER_ELEMENT) || 1;
    const bytes = typeof src === 'number' ? src : len !== undefined ? len * el : (src ? src.byteLength - (off || 0) * el : 0);
    objs.set(b, { kind: 'buf', target, bytes });
  });
  const texBytes = (r) => { let b = 0; for (const v of r.levels.values()) b += v.bytes; return b; };
  window.__glCensus = {
    summary() {
      const out = { textures: { count: 0, bytes: 0, largest: [] }, renderTargets: { count: 0, bytes: 0, textures: 0, renderbuffers: 0, largest: [] },
        buffers: { count: 0, bytes: 0, byTarget: {} }, unknownFormats: [...unknown] };
      const tl = [], rl = [];
      for (const [, r] of objs) {
        if (r.kind === 'buf') { out.buffers.count++; out.buffers.bytes += r.bytes; out.buffers.byTarget['0x' + r.target.toString(16)] = (out.buffers.byTarget['0x' + r.target.toString(16)] || 0) + r.bytes; continue; }
        const bytes = r.kind === 'rb' ? r.bytes : texBytes(r);
        const lv0 = r.kind === 'rb' ? r : [...r.levels.values()][0] || { w: 0, h: 0 };
        const row = { kind: r.kind, bytes, w: lv0.w, h: lv0.h, levels: r.kind === 'tex' ? r.levels.size : 0, samples: r.samples || 0 };
        if (r.rt) { out.renderTargets.count++; out.renderTargets.bytes += bytes; if (r.kind === 'rb') out.renderTargets.renderbuffers++; else out.renderTargets.textures++; rl.push(row); }
        else { out.textures.count++; out.textures.bytes += bytes; tl.push(row); }
      }
      out.textures.largest = tl.sort((a, b) => b.bytes - a.bytes).slice(0, 10);
      out.renderTargets.largest = rl.sort((a, b) => b.bytes - a.bytes).slice(0, 14);
      return out;
    },
  };
})()`;

async function vramLedger({ PORT }) {
  const B = W0B_BUDGETS.vram;
  return onPage(PORT, async ({ page }) => {
    const installed = await page.evaluate('!!window.__glCensus');
    if (!installed) return { pass: false, detail: { verdict: 'FAIL: the GL census did not install before the game made its context' } };
    const fight = await page.evaluate(STAGE_FIGHT);
    if (fight.skip) return { pass: null, detail: { verdict: fight.skip.split(':')[0] + ': the staged fight has no cast — ' + fight.skip } };
    await page.evaluate(`(async () => { ${FRAMES} await __frames(90); return true; })()`);
    const census = await page.evaluate('window.__glCensus.summary()');
    const cross = await page.evaluate(`(() => { const e = __CTX__.engine, r = e.renderer;
      let ledger = null; try { const L = e.renderTargetLedger ? e.renderTargetLedger() : null; ledger = L ? { totalBytes: L.totalBytes ?? (L.rows || []).reduce((a, x) => a + (x.bytes || 0), 0), rows: (L.rows || []).length } : null; } catch (err) { ledger = { error: String(err).slice(0, 120) }; }
      return { infoTextures: r.info.memory.textures, infoGeometries: r.info.memory.geometries, engineRtLedger: ledger }; })()`);
    await page.evaluate(UNSTAGE);
    const tex = census.textures.bytes, rt = census.renderTargets.bytes, geo = census.buffers.bytes, sum = tex + rt + geo;
    const rtLedgerTotal = Object.values(RT_LEDGER.rows).reduce((a, b) => a + b, 0);
    const checks = {
      texturesWithinBudget: tex <= B.texturesB,
      renderTargetsWithinRtLedgerCap: rt <= B.renderTargetsB,
      geometryWithinBudget: geo <= B.geometryB,
      totalWithinBudget: sum <= B.totalB,
      censusSawTheScene: census.textures.count > 0 && census.buffers.count > 0 && census.renderTargets.count > 0,
    };
    const pass = Object.values(checks).every(Boolean);
    return { pass, detail: {
      verdict: (pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', '))
        + ` — textures ${MB(tex)} MB (bar 160), render targets ${MB(rt)} MB (bar 170), geometry ${MB(geo)} MB (bar 120), total ${MB(sum)} MB (bar 450)`
        + ` at pixel ratio ${fight.appliedPixelRatio} (tier ${fight.quality}, drawing buffer ${fight.drawingBuffer.join('x')}); engine-gpu's recorded RT ledger (${RT_LEDGER.measured}) totals ${MB(rtLedgerTotal)} MB`,
      checks, budgetMB: { textures: 160, renderTargets: 170, geometry: 120, total: 450 },
      measuredMB: { textures: MB(tex), renderTargets: MB(rt), geometry: MB(geo), total: MB(sum) },
      census: { ...census, textures: { ...census.textures, MB: MB(tex) }, renderTargets: { ...census.renderTargets, MB: MB(rt) }, buffers: { ...census.buffers, MB: MB(geo) } },
      crossCheck: { ...cross, censusTextureObjects: census.textures.count + census.renderTargets.textures, rtLedgerRecordedMB: MB(rtLedgerTotal), rtLedgerRecordedAt: RT_LEDGER.measured },
      fight,
      method: 'every texImage2D/3D, texStorage2D/3D, compressedTexImage, copyTexImage2D, generateMipmap, renderbufferStorage(Multisample) and bufferData call on WebGL2 since before the game made its context, minus deleteTexture/Renderbuffer/Buffer; a texture ever attached to a framebuffer (and every renderbuffer) is a render target; bytes = width x height x depth x bytes-per-texel of the sized internal format (engine-gpu A-rt-ledger-census table: RGB as 4 channels, DEPTH_COMPONENT24 = 4 B) x samples, every level and face; buffers = their bufferData size',
    } };
  }, { initScripts: [GL_CENSUS] });
}

/* ------------------------------------------------------------------------------------------------ */
/* A90-abs                                                                                           */
/* ------------------------------------------------------------------------------------------------ */
/** the A90-memory-stability workload of tools/gates.r5.carried.mjs (Round-4 bars' workload), durations as there */
const A90_WORKLOAD = (loopS, lifecycleS) => `(async () => {${ROSTER}
  const W = memWorkload();
  const kill = (m) => { let mesh = null; m.root.traverse((o) => { if (!mesh && o.isMesh) mesh = o; }); m.takeDamage({ point: m.position.clone(), object: mesh, impact: 99999, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 }); };
  __CTX__.input.enabled = true;
  const t0 = performance.now(); let kills = 0;
  while (performance.now() - t0 < ${loopS * 1000}) {
    const m = (__CTX__.machines?.list || []).find((x) => x.alive);
    const killedKind = m ? m.kind : null;
    if (m) { kill(m); kills++; W.kills++; }
    __CTX__.input.keys.add('KeyW'); await new Promise((res) => setTimeout(res, 2500)); __CTX__.input.keys.delete('KeyW');
    memRespawnAfter(W, killedKind, __CTX__.player.position.x + 30, __CTX__.player.position.z + 30);
    await new Promise((res) => setTimeout(res, 2500));
  }
  const p0 = __CTX__.player.position.clone();
  __CTX__.player.position.set(p0.x + 130, 0, p0.z + 130); __CTX__.player._snapToGround?.();
  await new Promise((res) => setTimeout(res, ${lifecycleS * 1000}));
  const wv = memWorkloadVerdict(W, ${W0B_BUDGETS.abs.minKills});
  return { kills, workload: W, workloadVerdict: wv ? wv.detail.verdict : null, workloadPass: wv ? wv.pass : true };
})()`;

/** the GPU process of a Chrome: CDP SystemInfo.getProcessInfo (browser target), its macOS footprint and RSS */
async function gpuProcess(browser) {
  const s = await browser.target().createCDPSession();
  try {
    const { processInfo } = await s.send('SystemInfo.getProcessInfo');
    const g = (processInfo || []).find((p) => p.type === 'GPU' || p.type === 'gpu-process');
    if (!g) return { found: false, types: (processInfo || []).map((p) => p.type) };
    const fp = spawnSync('footprint', ['-p', String(g.id), '-f', 'bytes'], { encoding: 'utf8', timeout: 20000 });
    const m = /Footprint:\s*(\d+)\s*B/.exec(fp.stdout || '');
    const rss = Number((spawnSync('ps', ['-o', 'rss=', '-p', String(g.id)], { encoding: 'utf8' }).stdout || '').trim()) * 1024;
    return { found: true, pid: g.id, footprintB: m ? Number(m[1]) : null, rssB: Number.isFinite(rss) ? rss : null, cpuTimeS: g.cpuTime ?? null,
      footprintError: m ? null : String(fp.stderr || fp.stdout || '').slice(0, 160) };
  } finally { await s.detach().catch(() => {}); }
}

async function a90Abs({ PORT }) {
  const B = W0B_BUDGETS.abs;
  const loopS = Number(process.env.CAL_A90ABS_LOOP_S) || B.a90LoopS;
  const lifeS = Number(process.env.CAL_A90ABS_LIFECYCLE_S) || B.a90LifecycleS;
  const fightS = Number(process.env.CAL_A90ABS_FIGHT_S) || B.fightS;
  const shortened = loopS < B.a90LoopS || lifeS < B.a90LifecycleS || fightS < B.fightS;
  return onPage(PORT, async ({ page, cdp, browser }) => {
    await cdp.send('HeapProfiler.enable');
    const heapAtBoot = await gcAndHeap(cdp);
    const a90 = await page.evaluate(A90_WORKLOAD(loopS, lifeS));
    const heapAfterA90 = await gcAndHeap(cdp);
    const fight = await page.evaluate(STAGE_FIGHT);
    if (fight.skip) return { pass: null, detail: { verdict: fight.skip.split(':')[0] + ': the staged fight has no cast — ' + fight.skip, a90 } };
    const gpuSamples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < fightS * 1000) { await sleep(Math.min(15000, fightS * 1000 - (Date.now() - t0) + 10)); gpuSamples.push(await gpuProcess(browser)); }
    const heapPostGc = await gcAndHeap(cdp);
    const perfMem = await page.evaluate('performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null');
    gpuSamples.push(await gpuProcess(browser));
    await page.evaluate(UNSTAGE);
    const gpu = gpuSamples.filter((g) => g.found && g.footprintB != null);
    const gpuMax = gpu.length ? Math.max(...gpu.map((g) => g.footprintB)) : null;
    const checks = {
      a90WorkloadRan: a90.workloadPass === true,
      postGcHeapWithinCeiling: heapPostGc <= B.heapB,
      gpuProcessMeasured: gpuMax !== null,
      gpuProcessWithinCeiling: gpuMax !== null && gpuMax <= B.gpuProcessB,
    };
    const measuredPass = Object.values(checks).every(Boolean);
    const pass = shortened ? (measuredPass ? null : false) : measuredPass;
    return { pass, detail: {
      verdict: (shortened ? 'DEV RUN (shortened workload, never a PASS): ' : '') + (measuredPass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', '))
        + ` — post-GC JS heap ${MB(heapPostGc)} MB (ceiling 450), Chrome GPU process footprint ${gpuMax === null ? 'not measured' : MB(gpuMax) + ' MB'} (ceiling 1500) at the staged fight, after the A90 workload (${a90.kills} kills, ${a90.workload?.respawned} respawned)`,
      checks, report: { postGcJsHeapMB: MB(heapPostGc), gpuProcessFootprintMB: gpuMax === null ? null : MB(gpuMax) },
      ceilings: { heapMB: 450, gpuProcessMB: 1500 },
      heapMB: { atBoot: MB(heapAtBoot), afterA90: MB(heapAfterA90), afterFightPostGc: MB(heapPostGc) }, performanceMemory: perfMem,
      gpuProcess: gpuSamples.map((g) => ({ ...g, footprintMB: g.footprintB == null ? null : MB(g.footprintB), rssMB: g.rssB == null ? null : MB(g.rssB) })),
      a90, durationsS: { a90Loop: loopS, a90Lifecycle: lifeS, fight: fightS, shortened }, fight,
      method: 'A90-memory-stability\'s kill -> respawn workload (gate-roster memWorkload / memRespawnAfter, same loop and lifecycle times), two forced GCs (CDP HeapProfiler.collectGarbage), then the A21 staged fight for ' + fightS + ' s; JS heap = Runtime.getHeapUsage().usedSize after two forced GCs; GPU process = SystemInfo.getProcessInfo type GPU, macOS `footprint -p <pid> -f bytes` (phys_footprint, includes IOSurface / Metal memory), sampled every 15 s through the fight, max graded',
    } };
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* A-unattributed-cap                                                                                */
/* ------------------------------------------------------------------------------------------------ */
const DRAW_PROBE = `(async () => {
  ${FRAMES}
  const ctx = __CTX__, R = ctx.engine.renderer, scene = ctx.scene;
  const OWNERS = ${JSON.stringify(DRAW_OWNERS.map((o) => ({ id: o.id, row: o.row, re: o.re.source, flags: o.re.flags })))}.map((o) => ({ ...o, re: new RegExp(o.re, o.flags) }));
  const ownerOf = (name) => (name ? (OWNERS.find((o) => o.re.test(name)) || null) : null);
  // draws per frame (renderer.info with autoReset off, accumulated over whole frames)
  const drawsPerFrame = async (n = 8) => {
    const ar = R.info.autoReset; R.info.autoReset = false; R.info.reset();
    const f0 = ctx.engine.frames; await __frames(n); const f = ctx.engine.frames - f0;
    const calls = R.info.render.calls; R.info.autoReset = ar; R.info.reset();
    return f ? calls / f : null;
  };
  const roots = scene.children.map((c) => ({ obj: c, name: c.name || '', type: c.type, owner: ownerOf(c.name)?.id || null, visible: c.visible }));
  const settle = () => __frames(4);
  await settle();
  const total = await drawsPerFrame();
  // DIRECT attribution (cross-check): wrap renderBufferDirect, bucket each draw by its scene root's owner
  const direct = await (async () => {
    const real = R.renderBufferDirect.bind(R);
    const by = {}; let n = 0;
    R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
      let o = object, root = null; while (o) { if (o.parent === scene) { root = o; break; } o = o.parent; }
      const k = !root ? 'post (no scene ancestor)' : (ownerOf(root.name)?.id || 'UNATTRIBUTED: ' + (root.name || '(unnamed ' + root.type + ')'));
      by[k] = (by[k] || 0) + 1; n++;
      return real(camera, sc, geometry, material, object, group);
    };
    const f0 = ctx.engine.frames; await __frames(8); const f = ctx.engine.frames - f0;
    R.renderBufferDirect = real;
    for (const k in by) by[k] = Math.round((by[k] / f) * 10) / 10;
    return { perFrame: Math.round((n / f) * 10) / 10, by };
  })();
  // HIDE EACH REGISTERED OWNER IN TURN (plan §9): its draws = total - draws with it hidden
  const hidden = {};
  for (const o of OWNERS) {
    const mine = roots.filter((r) => r.owner === o.id && r.obj.visible);
    if (!mine.length) { hidden[o.id] = { roots: 0, draws: 0 }; continue; }
    for (const r of mine) r.obj.visible = false;
    await settle(); const without = await drawsPerFrame();
    for (const r of mine) r.obj.visible = r.visible;
    hidden[o.id] = { roots: mine.length, names: mine.map((r) => r.name), draws: Math.round((total - without) * 10) / 10 };
  }
  // every scene child hidden: what is left is the post chain (+ passes that draw without the scene)
  for (const r of roots) r.obj.visible = false;
  await settle(); const postOnly = await drawsPerFrame();
  for (const r of roots) r.obj.visible = r.visible;
  // the unregistered roots, hidden together: the direct measure of the unattributed row
  const un = roots.filter((r) => !r.owner && r.obj.visible);
  for (const r of un) r.obj.visible = false;
  await settle(); const withoutUn = await drawsPerFrame();
  for (const r of un) r.obj.visible = r.visible;
  await settle();
  const ownedSum = Object.values(hidden).reduce((a, h) => a + h.draws, 0);
  return { total, postOnly, owners: hidden, ownedSum: Math.round(ownedSum * 10) / 10,
    unattributedByHidingOwners: Math.round((total - postOnly - ownedSum) * 10) / 10,
    unattributedByHidingUnregistered: Math.round((total - withoutUn) * 10) / 10,
    unregisteredRoots: un.map((r) => r.name || '(unnamed ' + r.type + ')'),
    rootsByOwner: roots.reduce((a, r) => { const k = r.owner || 'UNREGISTERED'; (a[k] = a[k] || []).push(r.name || '(unnamed ' + r.type + ')'); return a; }, {}),
    direct };
})()`;

async function unattributedCap({ PORT }) {
  const wave = String(process.env.CAL_WAVE || 'W0b');
  const fromW2 = /^W[2-4]/.test(wave);
  return onPage(PORT, async ({ page }) => {
    const fight = await page.evaluate(STAGE_FIGHT);
    if (fight.skip) return { pass: null, detail: { verdict: fight.skip.split(':')[0] + ': the staged fight has no cast — ' + fight.skip } };
    const m = await page.evaluate(DRAW_PROBE);
    await page.evaluate(UNSTAGE);
    // graded: the plan's method (hide each registered owner in turn); the direct count is the cross-check
    const measured = Math.max(0, Math.round(m.unattributedByHidingOwners));
    const cap = UNATTRIBUTED_CAP_W0;
    const checks = {
      w0CapRecorded: cap !== null,
      notAboveW0Cap: cap === null || measured <= cap,
      ...(fromW2 ? { atMost30FromW2: measured <= W0B_BUDGETS.unattributed.w2Bar } : {}),
    };
    const pass = cap === null ? null : Object.values(checks).every(Boolean);
    return { pass, detail: {
      verdict: (cap === null ? `PENDING: W0 cap not recorded yet — record ${measured} (this measurement) as UNATTRIBUTED_CAP_W0` : pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', '))
        + ` — ${measured} draws/frame from scene children with no registered owner (hide-each-owner method; hiding the unregistered roots directly: ${m.unattributedByHidingUnregistered}; direct per-draw count: ${Object.entries(m.direct.by).filter(([k]) => k.startsWith('UNATTRIBUTED')).reduce((a, [, v]) => a + v, 0)}), `
        + `of ${r1(m.total)} total (post chain ${r1(m.postOnly)}); W0 cap ${cap === null ? 'unrecorded' : cap}, W2 bar ${W0B_BUDGETS.unattributed.w2Bar}; wave ${wave}; unregistered roots: ${m.unregisteredRoots.join(', ') || 'none'}`,
      checks, measured, cap, wave, probe: m, fight,
      owners: DRAW_OWNERS.map((o) => ({ id: o.id, row: o.row, pattern: String(o.re) })),
    } };
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* A-reference-clean / A-reference-set                                                               */
/* ------------------------------------------------------------------------------------------------ */
const IMG_RE = /\.(jpe?g|png|webp|gif|tiff?|bmp|avif|heic)$/i;
function walkFiles(dir, out = []) {
  let ents = [];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) walkFiles(p, out); else out.push(p); }
  return out;
}
const relRoot = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** reference/MANIFEST.md: the deleted Round-4 stills, `| file | sha256 | bytes | source | deleted |` */
function deletedStills() {
  let text = '';
  try { text = readFileSync(path.join(ROOT, 'reference', 'MANIFEST.md'), 'utf8'); } catch { return { ok: false, rows: [], why: 'reference/MANIFEST.md missing' }; }
  const at = text.indexOf('| file | sha256 | bytes | source | deleted |');
  if (at < 0) return { ok: false, rows: [], why: 'reference/MANIFEST.md has no deleted-stills table' };
  const rows = [];
  for (const l of text.slice(at).split('\n').slice(2)) {
    if (!l.trim().startsWith('|')) break;
    const c = l.trim().replace(/^\||\|$/g, '').split(' | ').map((x) => x.trim().replace(/`/g, ''));
    rows.push({ file: c[0], sha256: c[1], bytes: Number(c[2]), source: c[3], deleted: c[4] });
  }
  return { ok: rows.length > 0, rows };
}

/** reference names in a gate's reference / criteria / title: reference/r5/<lane>/<name>[, <name>…] */
function referenceTokens(g) {
  const text = ['reference', 'criteria', 'title'].map((k) => { try { const v = g[k]; return Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : ''; } catch { return ''; } }).join(' \n ');
  const out = [];
  for (const m of text.matchAll(/reference\/r5\/([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*(?:\s*,\s*(?:and\s+)?[a-z0-9][a-z0-9._-]*)*)/gi)) {
    for (const n of m[2].split(/\s*,\s*(?:and\s+)?/)) out.push({ lane: m[1], name: n.replace(/[.,;:]+$/, '') });
  }
  const other = [...new Set([...text.matchAll(/reference\/(?!r5\/)[\w./*-]+/g)].map((x) => x[0]))];
  const seen = new Set();
  return { refs: out.filter((r) => { const k = r.lane + '/' + r.name; if (seen.has(k)) return false; seen.add(k); return true; }), nonR5: other };
}
/** resolve a token to a stored file with a complete MANIFEST row */
function resolveRef({ lane, name }) {
  const dir = path.join(ROOT, 'reference', 'r5', lane);
  const m = readManifest(dir);
  const row = m.stored.find((r) => r.file === name || r.slot === name || r.file.replace(/\.[a-z]+$/i, '') === name);
  if (!row) return { ok: false, why: `reference/r5/${lane}/${name}: no stored MANIFEST row` };
  const p = path.join(dir, row.file);
  if (!existsSync(p)) return { ok: false, why: `reference/r5/${lane}/${row.file}: the row's file is missing` };
  const missing = ['author', 'source', 'licence', 'retrieved'].filter((k) => !row[k] || row[k] === 'unknown');
  if (missing.length) return { ok: false, why: `reference/r5/${lane}/${row.file}: row lacks ${missing.join(', ')}` };
  return { ok: true, file: `reference/r5/${lane}/${row.file}`, licence: row.licence };
}

const KEPT_VISUAL = ['V1-sprint-frame', 'V2-idle-frame', 'V3-crouch-stalk', 'V4-aim-anchor', 'V12-sprint-vs-reference', 'V13-aim-strafe', 'V14-slope-contour', 'V21-camera-cover'];
const laneOfGate = (g) => (g.source === 'gates.r5.carried.mjs' || g.lane === 'carried' || g.r4Source) ? 'carried' : (/gates\.r5\.([a-z0-9-]+)\.mjs$/.exec(g.source || '')?.[1] || g.lane || 'unknown');

function referenceClean({ GATES }) {
  const refDir = path.join(ROOT, 'reference');
  const files = walkFiles(refDir).filter((p) => IMG_RE.test(p));
  const topLevel = files.filter((p) => path.dirname(p) === refDir).map(relRoot);
  const stills = deletedStills();
  const banned = new Map(stills.rows.map((r) => [r.sha256, r.file]));
  const reappeared = files.filter((p) => banned.has(sha256(readFileSync(p)))).map((p) => `${relRoot(p)} (= deleted ${banned.get(sha256(readFileSync(p)))})`);
  const stillNamesPresent = stills.rows.filter((r) => existsSync(path.join(refDir, r.file))).map((r) => r.file);
  // every image under reference/ is a stored row of its folder's MANIFEST, with an allowed licence and source
  const rowsProblems = [];
  const byFolder = new Map();
  for (const p of files) { const d = path.dirname(p); if (!byFolder.has(d)) byFolder.set(d, []); byFolder.get(d).push(path.basename(p)); }
  let storedRows = 0, urlOnlyRows = 0;
  const licences = {};
  for (const [d, list] of byFolder) {
    const m = readManifest(d);
    if (!m.exists) { rowsProblems.push(`${relRoot(d)}: ${list.length} image(s), no MANIFEST.md`); continue; }
    for (const f of list) if (!m.stored.some((r) => r.file === f)) rowsProblems.push(`${relRoot(path.join(d, f))}: no MANIFEST row`);
  }
  for (const { dir } of laneFolders(ROOT)) {
    const m = readManifest(dir);
    storedRows += m.stored.length; urlOnlyRows += m.urlOnly.length;
    for (const r of m.stored) {
      licences[r.licence] = (licences[r.licence] || 0) + 1;
      if (!STORED_LICENCES.test(r.licence)) rowsProblems.push(`${relRoot(path.join(dir, r.file))}: licence ${r.licence} is not PD / CC0 / CC BY / own photo`);
      if (/^CC-BY/.test(r.licence) && !r.attribution) rowsProblems.push(`${relRoot(path.join(dir, r.file))}: CC BY without its attribution string`);
      if (FORBIDDEN_SOURCE_RE.test(`${r.source} ${r.author} ${r.subject}`)) rowsProblems.push(`${relRoot(path.join(dir, r.file))}: forbidden source (${r.source})`);
    }
    for (const r of m.urlOnly) if (readdirSync(dir).some((f) => f.replace(/\.[a-z]+$/i, '') === r.slot)) rowsProblems.push(`${relRoot(dir)}/${r.slot}: URL-only (${r.licence}) but stored`);
  }
  // V12 / V22 / V24 / V46 / V48 point at reference/r5/**
  const NAMED = ['V12', 'V22', 'V24', 'V46', 'V48'];
  const pointing = NAMED.map((short) => {
    const g = (GATES || []).find((x) => new RegExp(`^${short}-`).test(x.id) && x.kind === 'visual');
    if (!g) return { gate: short, present: false };
    const t = referenceTokens(g);
    const res = t.refs.map(resolveRef);
    return { gate: g.id, present: true, source: g.source, refs: res.map((x) => x.file || x.why), nonR5: t.nonR5,
      ok: t.refs.length > 0 && res.every((x) => x.ok) && t.nonR5.length === 0 };
  });
  const checks = {
    noStillAtTopLevel: topLevel.length === 0,
    deletedStillsRecorded: stills.ok && stills.rows.length >= 19,
    noDeletedStillByName: stillNamesPresent.length === 0,
    noDeletedStillByContent: reappeared.length === 0,
    everyFileHasAnAllowedRow: rowsProblems.length === 0,
    namedRowsPointAtR5: pointing.filter((x) => x.present).every((x) => x.ok),
    referenceSetPresent: storedRows > 0,
  };
  const pass = Object.values(checks).every(Boolean);
  return { pass, detail: {
    verdict: (pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', '))
      + ` — ${files.length} image(s) under reference/ (${storedRows} stored rows, ${urlOnlyRows} URL-only rows; licences ${JSON.stringify(licences)}); ${stills.rows.length} deleted Round-4 stills recorded with sha256, ${stillNamesPresent.length} present by name, ${reappeared.length} by content; `
      + pointing.map((x) => (x.present ? `${x.gate} -> ${x.ok ? x.refs.join(' + ') : 'NOT r5: ' + JSON.stringify(x.refs) + ' ' + x.nonR5.join(' ')}` : `${x.gate}: not registered in this tree`)).join('; '),
    checks, topLevelImages: topLevel, deletedStills: stills.rows.length, deletedStillsPresentByName: stillNamesPresent, reappearedByContent: reappeared,
    manifestProblems: rowsProblems, namedRows: pointing,
  } };
}

function referenceSet({ GATES }) {
  // (a) the fetcher: Commons API, filtered by the classifier, whose controls hold
  const src = readFileSync(path.join(TOOLS, 'r5-refs', 'fetch.mjs'), 'utf8');
  const fetcher = { commonsApi: /https:\/\/commons\.wikimedia\.org\/w\/api\.php/.test(src), filtersOnClassifier: /classifyCommons\(/.test(src) && /info\.c\.cls !== 'stored'/.test(src),
    selfTest: classifierSelfTest() };
  // (b) the set verifies offline (every pinned slot fetched, every file a complete row, sha256 intact)
  const v = verifyReferenceSet(ROOT);
  // (c) every V gate in every lane file names >= 1 reference file under reference/r5/** with a MANIFEST row
  const vis = (GATES || []).filter((g) => g.kind === 'visual');
  const rows = vis.map((g) => {
    const t = referenceTokens(g);
    const res = t.refs.map(resolveRef);
    const good = res.filter((x) => x.ok);
    const lane = laneOfGate(g);
    // R33 (c): a carried visual row that is not a kept system and that no lane shadows is SKIP-replaced; its
    // absorbing lane re-stages it with its own reference, so it is reported here, not graded
    const replaced = lane === 'carried' && !g.shadows && !KEPT_VISUAL.includes(g.id);
    return { id: g.id, lane, source: g.source, graded: lane === 'carried' ? !replaced : lane === LANE, replaced, absorbedBy: g.absorbedBy || null,
      ok: good.length > 0, refs: good.map((x) => x.file), problems: res.filter((x) => !x.ok).map((x) => x.why), nonR5: t.nonR5 };
  });
  const graded = rows.filter((r) => r.graded), missing = graded.filter((r) => !r.ok);
  const reported = rows.filter((r) => !r.graded && !r.ok);
  const byLane = reported.reduce((a, r) => { (a[r.replaced ? `carried, SKIP-replaced -> ${r.absorbedBy}` : r.lane] = a[r.replaced ? `carried, SKIP-replaced -> ${r.absorbedBy}` : r.lane] || []).push(r.id); return a; }, {});
  const checks = {
    fetcherQueriesCommonsApi: fetcher.commonsApi,
    fetcherStoresOnlyPdCc0CcBy: fetcher.filtersOnClassifier && fetcher.selfTest.ok,
    referenceSetVerifies: v.ok,
    everyGradedVisualGateNamesAReference: missing.length === 0 && graded.length > 0,
  };
  const pass = Object.values(checks).every(Boolean);
  return { pass, detail: {
    verdict: (pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', '))
      + ` — reference set: ${v.stored} stored + ${v.urlOnly} URL-only rows, ${v.files} files${v.ok ? '' : ', problems: ' + v.problems.slice(0, 4).join('; ')}; classifier controls ${fetcher.selfTest.cases.filter((c) => c.ok).length}/${fetcher.selfTest.cases.length}; `
      + `graded visual gates (gates-perf's files: carried kept-system rows + this lane's): ${graded.length - missing.length}/${graded.length} name a reference`
      + (missing.length ? ` (missing: ${missing.map((r) => r.id + (r.problems.length ? ' [' + r.problems.join('; ') + ']' : '')).join(', ')})` : '')
      + (Object.keys(byLane).length ? ` — reported, graded at their own lane's exit: ${Object.entries(byLane).map(([l, ids]) => l + ' (' + ids.join(', ') + ')').join('; ')}` : ''),
    checks, fetcher: { ...fetcher, selfTest: fetcher.selfTest.cases }, verify: v,
    slots: SLOTS.map((s) => ({ lane: s.lane, slot: s.slot, gates: s.gates, pinned: !!s.file })),
    visualGates: rows,
    rule: 'graded over gates-perf\'s own files (the carried kept-system rows R33 (c) grades, V1-V4 / V12-V14 / V21, and any visual row of this lane); every other visual row is reported with its owner and graded at that lane\'s exit (the R33 (e) rule A-gate-preludes uses)',
  } };
}

/* ------------------------------------------------------------------------------------------------ */
/* the rows                                                                                          */
/* ------------------------------------------------------------------------------------------------ */
export const GATES = [
  {
    id: 'A-reference-clean', kind: 'runner', lane: LANE, wave: 'W0b', timeout: 60000,
    title: 'W0b: reference/ holds no Guerrilla / Sony / HZD / HFW file (the deleted stills are recorded with their sha256 and may not reappear under any name); every image has a MANIFEST row with licence PD / CC0 / CC BY (attributed) / own photo; share-alike or unclear sources are URL-only; V12 / V22 / V24 / V46 / V48 point at reference/r5/**',
    check: (ctx) => referenceClean(ctx),
  },
  {
    id: 'A-reference-set', kind: 'runner', lane: LANE, wave: 'W0b', timeout: 60000,
    title: 'W0b: tools/r5-refs/fetch.mjs pulls from the Wikimedia Commons API filtered to PD / CC0 / CC BY (classifier controls), the set verifies offline, and every graded V gate names >= 1 reference file under reference/r5/** with a MANIFEST row (author, source URL, licence, retrieved date)',
    check: (ctx) => referenceSet(ctx),
  },
  {
    id: 'A-alloc-rate', kind: 'runner', lane: LANE, wave: 'W0b', timeout: 300000,
    title: 'W0b: CDP sampling heap profiler over 10 s of the staged fight + 10 s of sprint-and-draw: allocation attributed to src/** <= 64 KB/s, no single src function > 4 KB/s, post-GC heap slope <= 0',
    check: (ctx) => allocRate(ctx),
  },
  {
    id: 'A-vram-ledger', kind: 'runner', lane: LANE, wave: 'W0b', timeout: 240000,
    title: 'W0b: staged fight, GL allocation census: textures <= 160 MB, render targets <= 170 MB (A-rt-ledger cap), geometry buffers <= 120 MB, sum <= 450 MB',
    check: (ctx) => vramLedger(ctx),
  },
  {
    id: 'A90-abs', kind: 'runner', lane: LANE, wave: 'W0b', timeout: 900000,
    title: 'W0b (global list): after the A90 kill -> respawn workload, forced GC, then the staged fight for 60 s: post-GC JS heap <= 450 MB and the Chrome GPU process footprint <= 1.5 GB, both reported',
    check: (ctx) => a90Abs(ctx),
  },
  {
    id: 'A-unattributed-cap', kind: 'runner', lane: LANE, wave: 'W0b', timeout: 240000,
    title: 'W0b: staged fight, each registered draw owner hidden in turn: draws from scene children with no registered owner are recorded at W0 (the cap), non-increasing every wave, <= 30 from the W2 exit',
    check: (ctx) => unattributedCap(ctx),
  },
];
