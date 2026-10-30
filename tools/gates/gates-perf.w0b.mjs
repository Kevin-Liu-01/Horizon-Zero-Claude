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
 * REGISTRATION. tools/gates.r5.gates-perf.mjs spreads this GATES into its own (before A-port-guard, which stays
 * last), so `node tools/gates.mjs --port 5255 --lane gates-perf` runs it; gates.config.mjs discovers that file by
 * pattern. In a tree without gates-perf's gates.config.mjs:
 *   node tools/gates.mjs --port <p> --extra tools/gates.r5.gates-perf.mjs --lane gates-perf
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
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { PROFILE_ROOT, profileDir, disposeProfile, acquireChromeSlot, installProfileCleanup } from '../chrome-profile.mjs';
import { BUDGETS, STAGE_PRELUDE, PERF_SCENARIOS, MEMORY_BUDGETS, RT_LEDGER } from '../budgets.mjs';
import { ROSTER } from '../gate-roster.mjs';
import { PLACES } from '../gate-places.mjs';
import { verify as verifyReferenceSet, storedRowProblems, rowRulesSelfTest } from '../r5-refs/fetch.mjs';
import { classifierSelfTest } from '../r5-refs/licence.mjs';
import { readManifest, laneFolders, parserSelfTest } from '../r5-refs/manifest.mjs';
import { SLOTS } from '../r5-refs/slots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, '..');
const ROOT = path.resolve(TOOLS, '..');
const LANE = 'gates-perf';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
const MB = (b) => r2(b / 1e6);

/* budgets: tools/budgets.mjs MEMORY_BUDGETS (plan §4.2, §4.4, §9; the plan's numbers, verbatim) */
export const W0B_BUDGETS = MEMORY_BUDGETS;

/** THE W0 UNATTRIBUTED-DRAW CAP (plan §4.2): recorded in tools/budgets.mjs MEMORY_BUDGETS.unattributed.w0Cap */
export const UNATTRIBUTED_CAP_W0 = MEMORY_BUDGETS.unattributed.w0Cap ? MEMORY_BUDGETS.unattributed.w0Cap.draws : null;

/**
 * DRAW OWNERS (plan §4.2 rows) — the registration table. A top-level scene child is REGISTERED to an owner when
 * its name matches that owner's pattern; draws from a scene child that matches none (or has no name) are
 * UNATTRIBUTED. Names only: a lane registers its scene children by naming them for its row (an unnamed root can
 * never be registered). Lights and their targets draw nothing themselves and are never hidden (hiding a light
 * would remove every other owner's shadow draws). The post chain is not a scene child (its fullscreen quads have
 * no scene ancestor) and is measured as its own row. Each owner names the lane(s) that answer for its draws.
 */
export const DRAW_OWNERS = Object.freeze([
  { id: 'terrain-sky-sea', row: 'terrain, skirt, sky, sea', lanes: 'world-ground, world-sky',
    re: /^(terrain|terrain-?skirt|skirt|sky|sky-?dome|sea|ocean|water|river-?water|far-?ridges|ridges?|horizon-?ring|clouds?|cloud-?sea)$/i },
  { id: 'ground-scatter', row: 'ground scatter', lanes: 'world-ground', re: /^(ground-?)?scatter|^pebbles|^ground-?cover|^rock-?scatter/i },
  { id: 'vegetation', row: 'vegetation chunks', lanes: 'world-ground', re: /^vegetation|^grass|^trees?$|^shrubs?/i },
  { id: 'landmarks-places', row: 'landmarks + places', lanes: 'world-props',
    re: /^(world-)?props?$|landmark|^places?$|^sites?$|^(world-)?rockworks$|^gather-nodes$|^(world-)?activities$|^datapoints$|megastructure/i },
  { id: 'settlement', row: 'settlement kit', lanes: 'settlements', re: /settlement|^(hunter-)?camp$|hamlet/i },
  { id: 'instruments', row: 'Instruments', lanes: 'instruments lanes (legacy kinds: instruments-core / -b)', re: /^machines?$|^instruments?$|-machine$|-instrument$/i },
  { id: 'lamp-beams', row: 'lamp beams', lanes: 'instruments-core', re: /beam/i },
  { id: 'hero', row: 'Brea + gear', lanes: 'hero-body, armory', re: /^(player|hero|brea)\b/i },
  { id: 'npcs', row: 'NPCs', lanes: 'settlements', re: /^npcs?$|^npc-crowd$|^people$/i },
  { id: 'vfx-ui-pooled', row: 'VFX, UI, pooled', lanes: 'combat-kit, world-props (fauna), world-sky (weather)',
    re: /particles?|vfx|-fx$|^fx$|arrows?|trails?|decals?|projectiles?|^thrown-|pool|fauna|weather|rain|dust|flocks|motes/i },
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
async function onPage(PORT, fn, { initScripts = [], preBoot = null } = {}) {
  let h = null, page = null;
  try {
    h = await openBrowser(PORT);
    // preBoot(browser): readings in THIS Chrome before the game page exists (A90-abs's GPU-process baseline)
    const pre = preBoot ? await preBoot(h.browser) : null;
    const booted = await bootPage(h.browser, PORT, initScripts);
    page = booted.page;
    const cdp = await page.createCDPSession();
    const out = await fn({ page, cdp, browser: h.browser, errors: booted.errors, shared: h.shared, pre });
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
/* R48 (b) / (c): instruments versus bars                                                            */
/* ------------------------------------------------------------------------------------------------ */
/**
 * W0b fix round 3 (plan §8.3 R48 b). At gates-perf's exit A-alloc-rate, A-vram-ledger and A90-abs are graded AS
 * INSTRUMENTS: a sealed run (the harness seals every run that executes one of these rows: tools/gates.r5.gates-perf.mjs
 * `INSTRUMENT_IDS`; the row carries the run id the seal binds), every byte and target attributed to a named owner,
 * positive-control self-tests passing, and each over-bar owner routed with file:line. Their BARS are graded on merged
 * main at the orchestrator's W0b global run on port 5270 (A-vram-ledger and A90-abs after the engine-gpu merge, and
 * binding there: rule 5). So a row's verdict is the instrument's everywhere, AND its bars wherever they bind:
 *   - port 5270 (the orchestrator's global run), or CAL_BARS_BINDING=1 (a re-grade on main on another port);
 *   - A-alloc-rate: the R48 (c) per-owner baseline guard whenever a baseline file exists, and each owner's absolute
 *     bars from the wave in MEMORY_BUDGETS.alloc.owners[].barsFrom (CAL_WAVE, default W0b).
 * Bars that do not bind in this run are measured and REPORTED in full (`bars`), never hidden.
 */
export const INSTRUMENT_ROWS = Object.freeze(['A-alloc-rate', 'A-vram-ledger', 'A90-abs']);
/**
 * A NEGATIVE CONTROL (targeted fix round 1, engineering judge: "an instrument a fake could pass"): an instrument criterion
 * evaluated on an input it must reject. `wouldPass` is what the criterion answered; the control holds when it is false.
 */
const neg = (criterion, how, wouldPass) => ({ criterion, how, wouldPass: !!wouldPass, ok: !wouldPass });
const WAVES = ['W0a', 'W0b', 'W1', 'W2', 'W3', 'W4'];
const waveIdx = (w) => { const i = WAVES.indexOf(String(w)); return i < 0 ? 1 : i; };
const WAVE_NOW = () => String(process.env.CAL_WAVE || 'W0b');
const barsBinding = (PORT) => Number(PORT) === 5270 || process.env.CAL_BARS_BINDING === '1';
const PROCESS_START_MS = Date.now() - Math.round(process.uptime() * 1000);
/** the harness run id (tools/gates.r5.gates-perf.mjs RUN_ID: same formula), which the seal binds the report to */
const runIdOf = (PORT) => process.env.CAL_RUN_ID || `p${PORT}-${process.pid}-${PROCESS_START_MS}`;

/* ------------------------------------------------------------------------------------------------ */
/* A-alloc-rate                                                                                      */
/* ------------------------------------------------------------------------------------------------ */
/**
 * Attribution from a sampling heap profile (CDP HeapProfiler, objects collected by minor and major GC
 * included, so every allocation in the window counts, not only the survivors). EVERY sampled byte is charged to
 * exactly one named owner (W0b fix round 3, R48 b: "every byte attributed to an owner"):
 *   src     the NEAREST src/** frame on the allocating stack (caller attribution, graded since fix round 1), per
 *           function and per owner row (MEMORY_BUDGETS.alloc.owners, first match; else `other-src`)
 *   no src  a byte with no src/** frame anywhere on its stack goes to a NO_SRC bucket chosen by the nearest script
 *           frame on its stack: three.js (renderer), other vendor deps, the Vite dev client, this gate's own
 *           page-side code (puppeteer evaluate), other page script; and a stack with no script frame at all is the
 *           browser / V8 runtime. The buckets and src sum to the profile's total to the byte (checked).
 */
const NO_SRC_BUCKETS = [
  { id: 'renderer (three.js)', owner: 'engine-gpu: three.js reached with no src frame on the stack (its own callbacks)', re: /\/node_modules\/(\.vite\/deps\/)?three(\.|\/|_)/ },
  { id: 'vendor deps', owner: 'orchestrator: node_modules code other than three.js with no src frame on the stack', re: /\/node_modules\// },
  { id: 'vite dev client', owner: 'the Vite dev client (dev server only, never shipped)', re: /\/@vite\/|\/@id\/|\/@fs\/|\/@react-refresh/ },
  { id: 'gate harness', owner: 'gates-perf: this gate\'s own page-side drive and probes (puppeteer evaluate)', re: /^pptr:|__puppeteer_evaluation_script__/ },
  { id: 'page script outside src', owner: 'orchestrator: a page script outside src/** (index.html, public/)', re: /^https?:|^blob:|^data:/ },
];
const NO_SCRIPT = { id: 'browser / V8 runtime', owner: 'the browser: no script frame on the stack ((program), (garbage collector), (V8 API), natives)' };
const CONTROL_FILE = '/src/__gates-perf-control__.js', CONTROL_NOSRC_FILE = '/__gates-perf-control-nosrc__.js';
const ALLOC_OWNER_ROWS = W0B_BUDGETS.alloc.owners.map((o) => ({ ...o, re: new RegExp(o.files) }));
const allocOwnerOfFile = (file) => (file === CONTROL_FILE ? { id: 'planted-control', lane: 'gates-perf self-test (planted)', barsFrom: null }
  : ALLOC_OWNER_ROWS.find((o) => o.re.test(file)) || { id: 'other-src', lane: 'orchestrator (src file no owner row names)', barsFrom: null, ruling: '—' });
const fileOfKey = (fnKey) => String(fnKey).split(' ').slice(-1)[0].replace(/:\d+$/, '');

/**
 * opts (the negative controls only): `dropHeaviestHeadChild` walks the tree WITHOUT the head's heaviest child subtree (an
 * attribution that loses a subtree); `foreignSampleEvery` re-points every Nth sample at a node id the tree does not hold
 * (a sample no named owner can claim). The graded calls pass no opts.
 */
function attribute(profile, seconds, frames, PORT, opts = {}) {
  const srcRe = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${PORT}/src/`);
  const key = (cf) => `${cf.functionName || '(anonymous)'} ${String(cf.url).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
  let total = 0, srcSelf = 0, srcCaller = 0, noSrcTotal = 0;
  const self = new Map(), caller = new Map(), outside = new Map(), noSrc = new Map(), noSrcTop = new Map();
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  const bucketOf = (url) => { if (!url) return NO_SCRIPT; return NO_SRC_BUCKETS.find((b) => b.re.test(url)) || NO_SRC_BUCKETS[NO_SRC_BUCKETS.length - 1]; };
  const nodeOwner = new Map();                 // node id -> the named owner its bytes were charged to
  const head = profile.head || { children: [] };
  const skip = opts.dropHeaviestHeadChild ? (() => { const sub = (n) => (n.selfSize || 0) + (n.children || []).reduce((a, c) => a + sub(c), 0);
    let best = null, bb = -1; for (const c of head.children || []) { const b = sub(c); if (b > bb) { bb = b; best = c; } } return best; })() : null;
  const walk = (node, nearest, nearestScript) => {
    if (node === skip) return;
    const cf = node.callFrame || {};
    const url = cf.url || '';
    const isSrc = srcRe.test(url);
    const here = isSrc ? key(cf) : nearest;
    const script = url ? url : nearestScript;
    const sz = node.selfSize || 0;
    nodeOwner.set(node.id, here ? 'src ' + here : 'no-src ' + bucketOf(script).id);
    if (sz) {
      total += sz;
      if (isSrc) { srcSelf += sz; add(self, here, sz); }
      if (here) { srcCaller += sz; add(caller, here, sz); }
      else {
        const b = bucketOf(script);
        noSrcTotal += sz; add(noSrc, b.id, sz);
        add(noSrcTop, `${b.id}  |  ${key(cf)}`, sz);
      }
      if (!isSrc) add(outside, `${key(cf)}  <-  ${here || '(no src frame on the stack)'}`, sz);
    }
    for (const c of node.children || []) walk(c, here, script);
  };
  walk(head, null, null);
  // INDEPENDENT ACCOUNTING (targeted fix round 1; engineering judge: `srcCaller + noSrcTotal === total` was a tautology, walk()
  // charges every byte to exactly one of the two). V8 keeps a SECOND record of the same allocations: the sample list
  // (profile.samples, one entry per sample with its scaled size and its node id), apart from the node tree whose selfSize
  // sums the walk reads. The bytes the walk charged to named owners are checked against it:
  //   - every sample's node is a node the walk named (unnamedSampleBytes, computed, must be 0);
  //   - the walk's bytes equal the sample list's bytes within ACCOUNTING_TOLERANCE (the two records round each sample's
  //     scale differently: the tree per (node, size) bucket, the list per sample);
  //   - the walk's bytes are >= samples x the sampling interval: a sample stands for at least one interval of allocation
  //     (V8 scales a sample of size s by 1 / (1 - exp(-s / interval)), and s / (1 - exp(-s / interval)) >= interval).
  //   - a sample on a node the tree does not hold is accepted ONLY when it is LATER (by its ordinal, V8's sample id) than
  //     every sample the tree holds: V8 builds the tree first and the sample list after (GetAllocationProfile ->
  //     TranslateAllocationNode, then BuildSamples), and what it allocates in between (script line-end tables for the
  //     frames it resolves) is sampled onto nodes created after the tree was taken. Those bytes are the profiler's own
  //     retrieval, charged to "V8 profile retrieval" (the browser / V8 runtime); a node-less sample anywhere earlier fails
  //     the check (the lane-block run of Oct 30 06:50Z read 4 such samples, 12,284 B of 461.9 MB, in one window; a probe of
  //     V8's profiler in node, scratchpad bin/orphan-probe.mjs, found 4-9 node-less samples per profile, every one newer than
  //     every sample on a tree node).
  const samples = profile.samples || [];
  const every = opts.foreignSampleEvery || 0;
  let sampleBytes = 0, unnamedSampleBytes = 0, unnamedSamples = 0, retrievalBytes = 0, retrievalSamples = 0, maxNamedOrdinal = -Infinity;
  const sampleOwnerBytes = new Map(), orphans = [];
  for (let i = 0; i < samples.length; i++) {
    const sm = samples[i];
    sampleBytes += sm.size;
    const o = every && i % every === 0 ? undefined : nodeOwner.get(sm.nodeId);
    if (!o) orphans.push(sm); else { add(sampleOwnerBytes, o, sm.size); if (sm.ordinal > maxNamedOrdinal) maxNamedOrdinal = sm.ordinal; }
  }
  for (const sm of orphans) {
    if (sm.ordinal > maxNamedOrdinal) { retrievalBytes += sm.size; retrievalSamples++; } else { unnamedSampleBytes += sm.size; unnamedSamples++; }
  }
  const orphanDetail = orphans.slice(0, 8).map((sm) => ({ nodeId: sm.nodeId, ordinal: sm.ordinal, size: sm.size, afterTheTree: sm.ordinal > maxNamedOrdinal }));
  const interval = opts.interval || W0B_BUDGETS.alloc.samplingIntervalB;
  const attributedBytes = srcCaller + noSrcTotal;
  const fps = frames / seconds;
  // graded rate: the measured rate, or the per-frame bytes at 60 fps when the box ran slower (a starved
  // box allocates less per second; per frame it does not)
  const at = (b) => { const perS = b / 1024 / seconds; const per60 = frames ? (b / 1024 / frames) * W0B_BUDGETS.alloc.refFps : perS; return { bytes: b, measuredKBps: r2(perS), kbPerFrame: frames ? r2(b / 1024 / frames) : null, gradedKBps: r2(Math.max(perS, per60)) }; };
  const top = (m, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, b]) => ({ fn: k, ...at(b) }));
  // per OWNER (src): every caller function's bytes summed into its owner row
  const ownerBytes = new Map();
  for (const [fn, b] of caller) { const o = allocOwnerOfFile(fileOfKey(fn)); add(ownerBytes, o.id, b); }
  const owners = [...ownerBytes.entries()].sort((a, b) => b[1] - a[1]).map(([id, b]) => {
    const row = id === 'planted-control' ? allocOwnerOfFile(CONTROL_FILE) : ALLOC_OWNER_ROWS.find((o) => o.id === id) || allocOwnerOfFile('');
    return { id, lane: row.lane, barsFrom: row.barsFrom ?? null, ruling: row.ruling || null, ...at(b) };
  });
  const buckets = [...noSrc.entries()].sort((a, b) => b[1] - a[1]).map(([id, b]) => ({ id, owner: (NO_SRC_BUCKETS.find((x) => x.id === id) || NO_SCRIPT).owner, ...at(b) }));
  return { seconds: r2(seconds), frames, fps: r1(fps), total: at(total), srcSelf: at(srcSelf), srcCaller: at(srcCaller),
    graded: at(srcCaller), topGraded: top(caller, 80), topSrcSelf: top(self, 12), topOutsideSrc: top(outside, 10),
    srcFunctionsSeen: caller.size, owners, noSrc: { ...at(noSrcTotal), buckets, top: top(noSrcTop, 8) },
    accounting: accountingOf({ attributedBytes, srcBytes: srcCaller, noSrcBytes: noSrcTotal, samples: samples.length, sampleBytes, unnamedSampleBytes, unnamedSamples, interval,
      v8ProfileRetrieval: { samples: retrievalSamples, bytes: retrievalBytes, owner: 'the browser / V8 runtime: allocated by V8 while it built this profile, after the tree was taken' },
      maxNamedOrdinal: Number.isFinite(maxNamedOrdinal) ? maxNamedOrdinal : null, orphanSamples: orphanDetail,
      structural: 'src + no-src = the tree total by construction (walk() charges each byte to exactly one): a structural note, not graded' }),
    allFunctions: [...caller.entries()].map(([fn, b]) => ({ fn, ...at(b) })) };
}

/** the attribution check against V8's independent sample list (see attribute()): pure, so its negative controls can run it */
const ACCOUNTING_TOLERANCE = 0.05;
function accountingOf(a) {
  const vsSamples = a.sampleBytes ? a.attributedBytes / a.sampleBytes : null;
  const lowerBound = a.samples * a.interval;
  const checks = {
    sampleListPresent: a.samples > 0,
    everySampleOnANamedOwner: a.samples > 0 && a.unnamedSampleBytes === 0,
    walkMatchesSampleList: vsSamples !== null && Math.abs(vsSamples - 1) <= ACCOUNTING_TOLERANCE,
    walkAtLeastSamplesTimesInterval: a.samples > 0 && a.attributedBytes >= 0.99 * lowerBound,
  };
  return { ...a, vsSamples: vsSamples === null ? null : +vsSamples.toFixed(4), samplesTimesIntervalBytes: lowerBound,
    vsLowerBound: lowerBound ? +(a.attributedBytes / lowerBound).toFixed(4) : null, tolerance: ACCOUNTING_TOLERANCE, checks, ok: Object.values(checks).every(Boolean) };
}

/**
 * Who answers for a src/** file's per-frame allocations: the routing text, DERIVED from the owner rows of
 * MEMORY_BUDGETS.alloc.owners (targeted fix round 1: one table, so the routing and the bar schedule cannot disagree).
 */
const routeOfRow = (o) => (o.id === 'other-src' ? 'orchestrator (a src file no owner row names)' : `${o.lane}${o.barsFrom ? ` — bars from the ${o.barsFrom} exit` : ' — baseline guard only (frozen / no lane after W0b)'}`);
const srcOwner = (fnKey) => routeOfRow(allocOwnerOfFile(fileOfKey(fnKey)));

/**
 * THE PLANTED ALLOCATOR (positive control, R48 b "self-tests passing"). A module of known allocation behaviour is served
 * at a src/** URL (CDP Fetch fulfils the request in this page only; nothing is written under src/) and the same source
 * at a URL outside src/. Each calls `__w0bControlAlloc()` once per animation frame (one 1,900-slot array of small
 * integers: 7,624 B in every tier). Its true size per call is measured INDEPENDENTLY of the profiler: K = 1500 results are retained and
 * the post-GC used heap (Runtime.getHeapUsage after two forced GCs) is read before and after, minus the holding
 * array. The profiler, run with the graded phases' exact settings over a separate window, must then charge
 * calls x size to `__w0bControlAlloc /src/__gates-perf-control__.js` (caller attribution) within
 * MEMORY_BUDGETS.alloc.controlTolerance, and the same bytes from the out-of-src copy to the "page script outside src"
 * bucket (the no-src path). The control runs after the graded phases and never appears in them (checked).
 */
// W0b fix round 3 (second pass): the allocation is one 1,900-slot array of small integers per call (a JSArray + a FixedArray of
// compressed tagged slots, 7,624 B), whatever tier runs it. The first version (192 three-field objects with a double field)
// allocated a different amount in optimised and unoptimised code (heap-number temporaries), and the suite read 1.34 x once.
const CONTROL_SRC = `export const N = 1900;
export function __w0bControlAlloc() { const a = new Array(N); for (let i = 0; i < N; i++) a[i] = i; return a; }
let raf = 0, calls = 0, sink = null;
function tick() { sink = __w0bControlAlloc(); calls++; raf = requestAnimationFrame(tick); }
export function start() { calls = 0; raf = requestAnimationFrame(tick); return true; }
export function stop() { cancelAnimationFrame(raf); raf = 0; sink = null; return calls; }
export function hold(K) { const keep = new Array(K); for (let k = 0; k < K; k++) keep[k] = __w0bControlAlloc(); return keep; }
`;
async function servePlanted(cdp, PORT) {
  const body = Buffer.from(CONTROL_SRC).toString('base64');
  const onPaused = (ev) => {
    const u = new URL(ev.request.url);
    if (u.pathname === CONTROL_FILE || u.pathname === CONTROL_NOSRC_FILE) {
      cdp.send('Fetch.fulfillRequest', { requestId: ev.requestId, responseCode: 200, body,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }] }).catch(() => {});
    } else cdp.send('Fetch.continueRequest', { requestId: ev.requestId }).catch(() => {});
  };
  cdp.on('Fetch.requestPaused', onPaused);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*__gates-perf-control*', requestStage: 'Request' }] });
  return async () => { cdp.off('Fetch.requestPaused', onPaused); await cdp.send('Fetch.disable').catch(() => {}); };
}
/** does a profile's attribution hold the planted allocator (the "absent from the graded phases" detector) */
const hasControl = (a) => a.allFunctions.some((x) => fileOfKey(x.fn) === CONTROL_FILE || /__gates-perf-control/.test(x.fn));
async function plantedControl(page, cdp, PORT, B) {
  const unserve = await servePlanted(cdp, PORT);
  try {
    await page.evaluate(`(async () => {
      window.__w0bCtlSrc = await import('${CONTROL_FILE}?w0b=${process.pid}');
      window.__w0bCtlOut = await import('${CONTROL_NOSRC_FILE}?w0b=${process.pid}');
      return true; })()`);
    // the true size per call, independent of the profiler: K results retained, post-GC used heap before and after
    const K = 1500;
    const h0 = await gcAndHeap(cdp);
    await page.evaluate(`(() => { window.__w0bHold = window.__w0bCtlSrc.hold(${K}); return true; })()`);
    const h1 = await gcAndHeap(cdp);
    await page.evaluate('(() => { window.__w0bHold = null; return true; })()');
    const h2 = await gcAndHeap(cdp);
    const holder = 16 + 8 + K * 4;                             // the JSArray + its FixedArray of K tagged (compressed) slots
    const perCallB = (h1 - h0 - holder) / K;
    // the profiled window, the graded phases' exact sampling settings: both copies allocate once per frame, and their
    // call counters run INSIDE the sampled window only (started after startSampling, read before stopSampling)
    const f0 = await page.evaluate('__CTX__.engine.frames');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: B.samplingIntervalB, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const tS = Date.now();
    await page.evaluate('(() => { window.__w0bCtlSrc.start(); window.__w0bCtlOut.start(); return true; })()');
    await sleep(B.controlWindowS * 1000);
    const calls = await page.evaluate('(() => ({ src: window.__w0bCtlSrc.stop(), out: window.__w0bCtlOut.stop() }))()');
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const seconds = (Date.now() - tS) / 1000;
    const frames = (await page.evaluate('__CTX__.engine.frames')) - f0;
    await page.evaluate('(() => { window.__w0bCtlSrc = null; window.__w0bCtlOut = null; return true; })()');
    const prof = { attribution: attribute(profile, seconds, frames, PORT) };
    const a = prof.attribution;
    const srcRecovered = a.allFunctions.filter((x) => fileOfKey(x.fn) === CONTROL_FILE).reduce((s, x) => s + x.bytes, 0);
    const srcFns = a.allFunctions.filter((x) => fileOfKey(x.fn) === CONTROL_FILE).map((x) => x.fn + ' ' + x.bytes + ' B');
    const outBucket = a.noSrc.buckets.find((b) => b.id === 'page script outside src');
    const outRecovered = outBucket ? outBucket.bytes : 0;
    const expSrc = calls.src * perCallB, expOut = calls.out * perCallB;
    const tol = B.controlTolerance;
    const srcRatio = expSrc ? srcRecovered / expSrc : null, outRatio = expOut ? outRecovered / expOut : null;
    const okSrc = srcRatio !== null && Math.abs(srcRatio - 1) <= tol;
    // the out-of-src bucket also holds any other page script outside src: it must hold AT LEAST the control's bytes
    // (within tolerance) and the control's no-src bytes must not leak into src
    const okOut = outRatio !== null && outRatio >= 1 - tol;
    const ownerRow = a.owners.find((o) => o.id === 'planted-control');
    // NEGATIVE controls (targeted fix round 1): the same comparison must REJECT a 1.5 x size error and a run in which the
    // out-of-src copy's bytes had been charged to src; and the detector that grades "the control is absent from the graded
    // phases" must SEE the control in this window, where it is present
    const within = (got, exp) => exp > 0 && Math.abs(got / exp - 1) <= tol;
    const negative = { wrongSizeWouldPass: within(srcRecovered, expSrc * 1.5), outOfSrcLeakIntoSrcWouldPass: within(srcRecovered + outRecovered, expSrc),
      detectorSeesTheControl: hasControl(a) };
    return { ok: okSrc && okOut && perCallB > 1000, perCallBytes: r1(perCallB), negative, retainedK: K, heapBefore: h0, heapHeld: h1, heapReleased: h2,
      releasedBackWithin: r1((h2 - h0) / 1024) + ' KB', calls, windowS: r2(prof.attribution.seconds), fps: prof.attribution.fps,
      src: { expectedBytes: Math.round(expSrc), recoveredBytes: srcRecovered, ratio: srcRatio === null ? null : +srcRatio.toFixed(3), functions: srcFns, owner: ownerRow ? ownerRow.id : null, ok: okSrc },
      outsideSrc: { expectedBytes: Math.round(expOut), bucketBytes: outRecovered, ratio: outRatio === null ? null : +outRatio.toFixed(3), ok: okOut },
      tolerance: tol, method: 'size per call = (post-GC used heap with K results retained - before - the holding array) / K; recovered = caller-attributed bytes of the control function in a profiled window with the graded settings' };
  } finally { await unserve(); }
}

/**
 * the R48 (c) baseline guard: an owner exceeds its baseline when EITHER its KB/frame OR its KB/s exceeds factor x baseline
 * (targeted fix round 1: fix round 3 required both, which is looser than R48 c's "no owner may exceed its baseline by more
 * than 10 %"; the gate judge and the engineering judge both found it)
 */
function guardOwners(baseline, current, factor) {
  const out = [];
  for (const o of current) {
    if (o.id === 'planted-control') continue;
    const b = baseline.owners?.[o.id];
    if (!b) { out.push({ id: o.id, lane: o.lane, now: o.gradedKBps, base: null, newOwner: true, exceeds: o.gradedKBps > W0B_BUDGETS.alloc.fnKBps }); continue; }
    const rF = b.kbPerFrame ? o.kbPerFrame / b.kbPerFrame : (o.kbPerFrame > 0 ? Infinity : 0);
    const rS = b.measuredKBps ? o.measuredKBps / b.measuredKBps : (o.measuredKBps > 0 ? Infinity : 0);
    out.push({ id: o.id, lane: o.lane, nowKbPerFrame: o.kbPerFrame, baseKbPerFrame: b.kbPerFrame, nowKBps: o.measuredKBps, baseKBps: b.measuredKBps,
      ratioPerFrame: Number.isFinite(rF) ? +rF.toFixed(3) : rF, ratioPerSecond: Number.isFinite(rS) ? +rS.toFixed(3) : rS, exceeds: rF > factor || rS > factor,
      on: [rF > factor ? 'KB/frame' : null, rS > factor ? 'KB/s' : null].filter(Boolean) });
  }
  return { factor, rows: out, offenders: out.filter((x) => x.exceeds) };
}
/** owners merged over the graded phases: the worst phase per owner (by graded KB/s), with that phase's numbers */
function worstOwners(phases) {
  const m = new Map();
  for (const p of phases) for (const o of p.owners) if (!m.has(o.id) || m.get(o.id).gradedKBps < o.gradedKBps) m.set(o.id, { ...o, phase: p.name });
  return [...m.values()].sort((a, b) => b.gradedKBps - a.gradedKBps);
}
/** the guard's own positive and negative controls (pure: run on this run's owner table) */
function guardSelfTest(owners, factor) {
  const asBase = (scaleId, sF, sS) => ({ owners: Object.fromEntries(owners.map((o) => [o.id, { kbPerFrame: o.id === scaleId ? o.kbPerFrame * sF : o.kbPerFrame, measuredKBps: o.id === scaleId ? o.measuredKBps * sS : o.measuredKBps }])) });
  const big = owners.find((o) => o.id !== 'planted-control' && o.kbPerFrame > 0 && o.measuredKBps > 0);
  if (!big) return { ok: false, why: 'no owner to test with' };
  const same = guardOwners(asBase(null, 1, 1), owners, factor);
  const grown = guardOwners(asBase(big.id, 1 / 1.25, 1 / 1.25), owners, factor);
  const perFrameOnly = guardOwners(asBase(big.id, 1 / 1.25, 1), owners, factor);
  const perSecondOnly = guardOwners(asBase(big.id, 1, 1 / 1.25), owners, factor);
  const within = guardOwners(asBase(big.id, 1 / 1.05, 1 / 1.05), owners, factor);
  const alone = (g) => g.offenders.length === 1 && g.offenders[0].id === big.id;
  // positive: 0 flags unchanged and at +5 %; NEGATIVE (the guard can fail an owner): +25 % on both, on KB/frame only, on KB/s only
  const ok = same.offenders.length === 0 && within.offenders.length === 0 && alone(grown) && alone(perFrameOnly) && alone(perSecondOnly);
  return { ok, owner: big.id, rule: 'EITHER KB/frame OR KB/s > ' + factor + ' x baseline', unchangedOffenders: same.offenders.length, grown5PercentFlags: within.offenders.map((x) => x.id),
    grown25PercentFlags: grown.offenders.map((x) => x.id), perFrameOnlyGrowthFlags: perFrameOnly.offenders.map((x) => x.id), perSecondOnlyGrowthFlags: perSecondOnly.offenders.map((x) => x.id) };
}

/**
 * THE BAR SCHEDULE SELF-TEST (targeted fix round 1; engineering-judge finding: whole directories that lanes hold from W1-W3
 * had barsFrom null, so the 4 KB/s per-function bar never bound there). Pure, on the owner rows:
 *   - SCHEDULE_CONTROLS: a file of each set the finding names, with the lane and wave whose exit first binds its bars
 *     (plan §2 rows; §6 for the legacy species), resolved through the rows exactly as an over-bar function is;
 *   - every barsFrom-null row is cls 'frozen' or 'no-lane-after-W0b' (budgets.mjs), every dated row cls 'held' with a wave.
 * NEGATIVE CONTROL: the fix-round-3 rows (FIX_ROUND3_OWNER_ROWS, verbatim from git bccc39b:tools/budgets.mjs) must FAIL it.
 */
const SCHEDULE_CONTROLS = [
  ['/src/world/terrain.js', 'world-ground', 'W1'], ['/src/world/vegetation.js', 'world-ground', 'W1'], ['/src/world/water.js', 'world-ground', 'W1'],
  ['/src/world/island/sites.js', 'world-ground', 'W1'], ['/src/world/environment.js', 'world-sky', 'W1'],
  ['/src/world/props.js', 'world-props', 'W1'], ['/src/world/props/kit.js', 'world-props', 'W1'], ['/src/world/sites/ring.js', 'world-props', 'W1'], ['/src/world/fauna.js', 'world-props', 'W1'],
  ['/src/world/props/settlement.js', 'settlements', 'W2'], ['/src/world/npc/npc.js', 'settlements', 'W2'],
  ['/src/combat/bow.js', 'armory', 'W1'], ['/src/combat/weapons.js', 'armory', 'W1'], ['/src/combat/arrows.js', 'armory', 'W1'], ['/src/combat/combat.js', 'armory', 'W1'], ['/src/hero/loadout.js', 'armory', 'W1'],
  ['/src/combat/traps.js', 'combat-kit', 'W2'], ['/src/combat/kit/pots.js', 'combat-kit', 'W2'], ['/src/items/items.js', 'combat-kit', 'W2'], ['/src/items/crafting.js', 'combat-kit', 'W2'],
  ['/src/entities/anim/meleeLayer.js', 'melee', 'W1'], ['/src/entities/anim/clipMelee.js', 'melee', 'W1'], ['/src/entities/anim/castLayer.js', 'melee', 'W1'], ['/src/combat/melee.js', 'melee', 'W1'], ['/src/entities/playerAnimator.js', 'melee', 'W1'],
  ['/src/core/progression.js', 'progression', 'W3'], ['/src/core/save.js', 'progression', 'W3'], ['/src/items/fieldbooks.js', 'progression', 'W3'],
  ['/src/ui/hud.js', 'shell-ui', 'W2'], ['/src/audio/audio.js', 'audio', 'W3'], ['/src/instruments/kinds/plumb.js', 'instruments-a', 'W1'], ['/src/entities/machines/legacy.js', 'instruments-b', 'W2'], ['/src/entities/machines/rig/shells-expansion.js', 'instruments-b', 'W2'],
  ['/src/entities/machines/machine.js', null, null], ['/src/entities/machines/rig/lod.js', null, null],
  ['/src/core/engine.js', null, null], ['/src/core/collision.js', null, null], ['/src/entities/anim/clipLayer.js', null, null],
];
const FIX_ROUND3_OWNER_ROWS = [
  ['terrain', '^/src/world/terrain\\.js$', 'world-ground', 'W1'], ['playerAnimator', '^/src/entities/playerAnimator\\.js$', 'melee (hero-body until W1)', 'W1'],
  ['fauna', '^/src/world/fauna\\.js$', 'world-props', 'W1'], ['shell-ui', '^/src/ui/', 'shell-ui', 'W2'], ['settlements', '^/src/world/(camp|npc|settlements)', 'settlements', 'W2'],
  ['audio', '^/src/audio/', 'audio', 'W3'], ['engine', '^/src/core/engine\\.js$', 'engine', null], ['frozen-spatial', '^/src/core/(collision|nav|hitHulls)\\.js$', 'FROZEN', null],
  ['frozen-rigging', '^/src/entities/anim/(boneSpace|restPose|clipLayer|retargeter|rigDebug|locomotion)\\.js$', 'FROZEN', null],
  ['frozen-machine-rig', '^/src/entities/machines/(gait|autorig)\\.js$|^/src/entities/machines/rig/', 'FROZEN', null], ['frame-loop', '^/src/main\\.js$', 'FROZEN', null],
  ['hero-body', '^/src/entities/(player)\\.js$|^/src/entities/anim/', 'hero-body (melee from W1)', null], ['instruments', '^/src/entities/machines/|^/src/instruments/', 'instruments-core', null],
  ['world-other', '^/src/world/', 'world-ground / world-props / world-sky (W1)', null], ['combat', '^/src/combat/|^/src/items/', 'combat-kit (W2) / armory', null],
  ['progression', '^/src/core/(progression|save)\\.js$', 'progression (W3)', null],
].map(([id, files, lane, barsFrom]) => ({ id, files, lane, barsFrom, re: new RegExp(files) }));
function scheduleSelfTest(rows) {
  const ownerOf = (f) => rows.find((o) => o.re.test(f)) || null;
  const cases = SCHEDULE_CONTROLS.map(([file, lane, wave]) => {
    const o = ownerOf(file);
    const ok = !!o && (wave === null ? o.barsFrom == null : o.barsFrom === wave && String(o.lane).startsWith(lane));
    return { file, want: wave === null ? 'barsFrom null (frozen / engine)' : `${lane} ${wave}`, got: o ? `${o.id}: ${o.lane} ${o.barsFrom}` : 'no row', ok };
  });
  const badClass = rows.filter((o) => (o.barsFrom ? !(o.cls === 'held' && WAVES.includes(o.barsFrom)) : !(o.cls === 'frozen' || o.cls === 'no-lane-after-W0b'))).map((o) => o.id);
  return { ok: cases.every((c) => c.ok) && badClass.length === 0, failed: cases.filter((c) => !c.ok), badClass, cases: cases.length,
    nullRows: rows.filter((o) => !o.barsFrom).map((o) => `${o.id} (${o.cls || 'no class'})`) };
}
/** offline check of the schedule (node -e import): the live rows, the fix-round-3 rows (must fail), src coverage */
export const allocScheduleCheck = () => ({ now: scheduleSelfTest(ALLOC_OWNER_ROWS), fixRound3: scheduleSelfTest(FIX_ROUND3_OWNER_ROWS), coverage: srcCoverage() });
/** every src/**\/*.js file of this tree -> its owner row (reported: a file no row names routes to the orchestrator) */
function srcCoverage() {
  const out = {}, unowned = [];
  const walk = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name)) { const f = '/' + relRoot(p); const o = allocOwnerOfFile(f); out[o.id] = (out[o.id] || 0) + 1; if (o.id === 'other-src') unowned.push(f); } } };
  walk(path.join(ROOT, 'src'));
  return { files: Object.values(out).reduce((a, b) => a + b, 0), byOwner: out, unowned };
}

async function allocRate({ PORT }) {
  const B = W0B_BUDGETS.alloc;
  const wave = WAVE_NOW(), binding = barsBinding(PORT);
  // CAL_ALLOC_RECORD_BASELINE=1 records the baseline from this run; =merge adds this run to an existing baseline file (per owner
  // the larger of the recorded numbers, every run listed): the orchestrator's global run may record over several runs
  const recordMode = process.env.CAL_ALLOC_RECORD_BASELINE === 'merge' ? 'merge' : process.env.CAL_ALLOC_RECORD_BASELINE === '1' ? 'new' : null;
  const recordBaseline = !!recordMode;
  const baselinePath = path.resolve(ROOT, process.env.CAL_ALLOC_BASELINE_FILE || B.baselineFile);
  return onPage(PORT, async ({ page, cdp }) => {
    await cdp.send('HeapProfiler.enable');
    const fight = await page.evaluate(STAGE_FIGHT);
    if (fight.skip) return { pass: null, detail: { verdict: fight.skip.split(':')[0] + ': the staged fight has no cast — ' + fight.skip } };
    /** one profiled window with the graded settings -> { attribution, heap points } */
    const profileWindow = async (windowS, onStart) => {
      const heap = [];
      const f0 = await page.evaluate('__CTX__.engine.frames');
      heap.push([0, await gcAndHeap(cdp)]);
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: B.samplingIntervalB, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      const tS = Date.now();
      const extra = onStart ? await onStart() : null;
      const pts = windowS >= 6 ? 4 : 2;
      for (let k = 1; k <= pts; k++) { await sleep((windowS * 1000 - (extra?.busyMs || 0)) / pts - 150); heap.push([(Date.now() - tS) / 1000, await gcAndHeap(cdp)]); }
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      const seconds = (Date.now() - tS) / 1000;
      const frames = (await page.evaluate('__CTX__.engine.frames')) - f0;
      // NEGATIVE controls on this window's own profile: an attribution that loses a subtree, and samples no owner holds,
      // must each FAIL the accounting check
      const lossy = attribute(profile, seconds, frames, PORT, { dropHeaviestHeadChild: true }).accounting;
      const foreign = attribute(profile, seconds, frames, PORT, { foreignSampleEvery: 50 }).accounting;
      const negatives = { lossyWalkWouldPass: lossy.ok, lossyVsSamples: lossy.vsSamples, lossyUnnamedSampleBytes: lossy.unnamedSampleBytes,
        foreignSamplesWouldPass: foreign.ok, foreignUnnamedSampleBytes: foreign.unnamedSampleBytes };
      return { attribution: attribute(profile, seconds, frames, PORT), heap, extra, negatives };
    };
    const phase = async (name, drive, windowS = B.windowS) => {
      await sleep(B.warmupS * 1000);                                     // steady state, not the staging transient
      const t0 = Date.now();
      let stopDrive = null, sawtoothKBps = null;
      const w = await profileWindow(windowS, async () => {
        stopDrive = drive ? await drive() : null;
        // CROSS-CHECK (independent of the profiler's attribution): the used heap read every 100 ms for 2 s with no
        // forced GC; the sum of its rises is a LOWER bound on everything allocated in that time
        const saw = []; const tw = Date.now();
        while (Date.now() - tw < 2000) { saw.push((await cdp.send('Runtime.getHeapUsage')).usedSize); await sleep(100); }
        let rises = 0; for (let k = 1; k < saw.length; k++) if (saw[k] > saw[k - 1]) rises += saw[k] - saw[k - 1];
        sawtoothKBps = r1(rises / 1024 / ((Date.now() - tw) / 1000));
        return { busyMs: Date.now() - tw };
      });
      const driveWitness = stopDrive ? await stopDrive() : null;
      const a = w.attribution;
      const s = slope(w.heap);
      for (const x of a.topGraded) { x.owner = srcOwner(x.fn); x.ownerRow = allocOwnerOfFile(fileOfKey(x.fn)).id; }
      for (const x of a.topSrcSelf) x.owner = srcOwner(x.fn);
      return { name, ...a, driveWitness, negatives: w.negatives, heapPostGcB: w.heap.map(([t, b]) => [r2(t), b]), heapSlopeBps: s === null ? null : Math.round(s), wallS: r2((Date.now() - t0) / 1000),
        crossCheck: { usedHeapRisesKBps: sawtoothKBps, note: 'used-heap rises over 2 s, no forced GC: a lower bound on all allocation (src + three + browser)' } };
    };
    const fightPhase = await phase('staged fight', null);
    // THE EMPTY-FRAME FLOOR (reported, never subtracted): the same page with the scene hidden
    await page.evaluate('(() => { window.__w0bSceneVis = __CTX__.scene.visible; __CTX__.scene.visible = false; return true; })()');
    let emptyPhase = null;
    try { emptyPhase = await phase('empty frame (scene hidden)', null, B.emptyFrameS || 5); }
    finally { await page.evaluate('(() => { __CTX__.scene.visible = window.__w0bSceneVis !== false; window.__w0bSceneVis = undefined; return true; })()'); }
    const renderPath = (emptyPhase?.topGraded || []).filter((x) => /\/src\/core\/engine\.js|\/src\/main\.js/.test(x.fn));
    const emptyFrame = emptyPhase ? { fps: emptyPhase.fps, srcCallerKBps: emptyPhase.graded.measuredKBps, srcCallerGradedKBps: emptyPhase.graded.gradedKBps,
      engineAndFrameLoopKBps: r2(renderPath.reduce((a, x) => a + x.measuredKBps, 0)), engineAndFrameLoopTop: renderPath.slice(0, 6),
      topGraded: emptyPhase.topGraded.slice(0, 8), allAllocationKBps: emptyPhase.total.measuredKBps, noSrcBuckets: emptyPhase.noSrc.buckets,
      note: 'reported only: no allowance is recorded in MEMORY_BUDGETS.alloc, so nothing is subtracted' } : null;
    await page.evaluate(UNSTAGE);
    // sprint-and-draw: open ground, W + Shift held; every 2.5 s a full draw (RMB aim + LMB draw, held 1.2 s) and a loose
    await page.evaluate(`(async () => { ${PLACES} const p = __CTX__.player; if (PLACE('openGround')) standAt(p, 'openGround'); __CTX__.input.enabled = true; return true; })()`);
    const drive = async () => {
      await page.evaluate(`(() => { const C = __CTX__, I = C.input, p = C.player;
        const W = window.__w0bDrive = { samples: 0, sprinting: 0, aiming: 0, maxSpeed: 0, fired: 0, maxDraw: 0 };
        W.onFire = (e) => { W.fired++; if (e && e.drawStrength > W.maxDraw) W.maxDraw = e.drawStrength; };
        C.events.on('arrow-fired', W.onFire);
        I.keys.add('KeyW'); I.keys.add('ShiftLeft');
        W.draw = setInterval(() => { I.mouse.buttons |= 4; I.mouse.buttons |= 1; setTimeout(() => { I.mouse.buttons &= ~1; setTimeout(() => { I.mouse.buttons &= ~4; }, 150); }, 1200); }, 2500);
        W.watch = setInterval(() => { W.samples++; if (p.sprinting) W.sprinting++; if (p.aiming) W.aiming++;
          const v = p.velocity ? Math.hypot(p.velocity.x, p.velocity.z) : 0; if (v > W.maxSpeed) W.maxSpeed = v; }, 100);
        return true; })()`);
      return () => page.evaluate(`(() => { const C = __CTX__, I = C.input, W = window.__w0bDrive;
        clearInterval(W.draw); clearInterval(W.watch); C.events.off('arrow-fired', W.onFire);
        I.keys.delete('KeyW'); I.keys.delete('ShiftLeft'); I.mouse.buttons = 0; window.__w0bDrive = null;
        return { samples: W.samples, sprintingFraction: +(W.sprinting / Math.max(1, W.samples)).toFixed(2), aimingFraction: +(W.aiming / Math.max(1, W.samples)).toFixed(2),
          maxSpeed: +W.maxSpeed.toFixed(2), arrowsFired: W.fired, maxDrawStrength: +W.maxDraw.toFixed(2) }; })()`);
    };
    const runPhase = await phase('sprint and draw', drive);
    const shots = runPhase.driveWitness || null;
    const phases = [fightPhase, runPhase];
    // THE SELF-TEST (planted allocator), after the graded phases, on the same page with the same profiler settings
    let control = null;
    try { control = await plantedControl(page, cdp, PORT, B); }
    catch (err) { control = { ok: false, error: String(err.message || err).slice(0, 200) }; }
    const controlInGraded = phases.some(hasControl);

    // ---- measured numbers (every one reported) ----
    const worstSrc = Math.max(...phases.map((p) => p.graded.gradedKBps));
    const worstFn = phases.flatMap((p) => p.topGraded.map((x) => ({ ...x, phase: p.name }))).sort((a, b) => b.gradedKBps - a.gradedKBps)[0] || null;
    const overFn = new Map();
    for (const p of phases) for (const x of p.allFunctions) if (x.gradedKBps > B.fnKBps && (!overFn.has(x.fn) || overFn.get(x.fn).gradedKBps < x.gradedKBps)) overFn.set(x.fn, { ...x, phase: p.name, owner: srcOwner(x.fn), ownerRow: allocOwnerOfFile(fileOfKey(x.fn)).id });
    const byOwner = {};
    for (const x of [...overFn.values()].sort((a, b) => b.gradedKBps - a.gradedKBps)) (byOwner[x.owner] = byOwner[x.owner] || []).push(x.fn + ' ' + x.gradedKBps + ' KB/s');
    const slopes = phases.map((p) => p.heapSlopeBps);
    const owners = worstOwners(phases);
    // ROUTED: every over-bar function carries an owner and a file:line (its key is "<fn> /src/<file>:<line>")
    const unroutedOf = (list) => list.filter((x) => !/ \/src\/[^ ]+:\d+$/.test(x.fn) || !x.owner);
    const unrouted = unroutedOf([...overFn.values()]);
    // ---- the R48 (c) baseline guard ----
    let baseline = null, baselineState;
    if (recordBaseline) baselineState = 'recording';
    else if (existsSync(baselinePath)) { try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')); baselineState = 'loaded'; } catch (err) { baselineState = 'unreadable: ' + String(err.message).slice(0, 80); } }
    else baselineState = 'absent';
    const guardTest = guardSelfTest(owners, B.baselineGuard);
    const guard = baseline ? guardOwners(baseline, owners, B.baselineGuard) : null;
    // the bar schedule (targeted fix round 1): the owner rows against the finding's file sets; the fix-round-3 rows must fail it
    const schedule = scheduleSelfTest(ALLOC_OWNER_ROWS), scheduleRound3 = scheduleSelfTest(FIX_ROUND3_OWNER_ROWS), coverage = srcCoverage();
    // ---- the scheduled absolute bars (R48 c): each owner from its barsFrom wave ----
    const active = ALLOC_OWNER_ROWS.filter((o) => o.barsFrom && waveIdx(o.barsFrom) <= waveIdx(wave)).map((o) => o.id);
    const scheduledOver = [...overFn.values()].filter((x) => active.includes(x.ownerRow));
    const unscheduledOwners = owners.filter((o) => o.id !== 'planted-control' && !(o.barsFrom && waveIdx(o.barsFrom) <= waveIdx(wave)) && o.bytes > 0).map((o) => o.id);
    const totalBinds = unscheduledOwners.length === 0;
    // targeted fix round 1: graded against V8's independent sample list (attribute(): accountingOf), not src + no-src = total
    const accountingOk = phases.every((p) => p.accounting.ok);
    const sawAlloc = (ps) => ps.every((p) => p.total.measuredKBps > 0);
    const drove = (w) => !!w && w.sprintingFraction > 0.2 && w.arrowsFired >= 2;
    // NEGATIVE CONTROLS: each instrument criterion, fed an input it must reject, has to come out false
    const negatives = [
      neg('profilerSawAllocations', 'a phase whose profile saw 0 KB/s', sawAlloc([{ total: { measuredKBps: 0 } }])),
      neg('sprintAndDrawHappened', 'a drive witness with no sprint and no arrow', drove({ sprintingFraction: 0, arrowsFired: 0 })),
      neg('everyByteAttributedToANamedOwner', 'each graded profile walked without its heaviest subtree', phases.some((p) => p.negatives?.lossyWalkWouldPass !== false)),
      neg('everyByteAttributedToANamedOwner', 'each graded profile with every 50th sample on a node no owner holds', phases.some((p) => p.negatives?.foreignSamplesWouldPass !== false)),
      neg('selfTestPlantedAllocatorRecovered', 'the recovered bytes against a 1.5 x expected size', control?.negative?.wrongSizeWouldPass !== false),
      neg('selfTestPlantedAllocatorRecovered', 'the out-of-src copy\'s bytes charged to src', control?.negative?.outOfSrcLeakIntoSrcWouldPass !== false),
      neg('selfTestControlAbsentFromGradedPhases', 'the detector on the control window, where the control IS present', control?.negative?.detectorSeesTheControl !== true),
      neg('selfTestBaselineGuard', 'the largest owner grown 25 % on one metric only (KB/frame, then KB/s)', !(guardTest.perFrameOnlyGrowthFlags?.length && guardTest.perSecondOnlyGrowthFlags?.length)),
      neg('everyOverBarFunctionRoutedWithFileLine', 'an over-bar function with no file:line and no owner', unroutedOf([{ fn: '(anonymous) (program)', owner: null }]).length === 0),
      neg('selfTestBarSchedule', 'the fix-round-3 owner rows (world/, combat/, items/, anim/ and progression with barsFrom null)', scheduleRound3.ok),
    ];
    const instrument = {
      profilerSawAllocations: sawAlloc(phases),
      sprintAndDrawHappened: drove(shots),
      everyByteAttributedToANamedOwner: accountingOk,
      selfTestPlantedAllocatorRecovered: !!control?.ok,
      selfTestControlAbsentFromGradedPhases: !controlInGraded,
      selfTestBaselineGuard: !!guardTest.ok,
      selfTestBarSchedule: schedule.ok,
      everyOverBarFunctionRoutedWithFileLine: unrouted.length === 0,
      negativeControlsEachFail: negatives.every((n) => n.ok),
    };
    const bars = {
      scheduledAbsoluteBars: { binding: true, wave, activeOwners: active, pass: scheduledOver.length === 0, over: scheduledOver.map((x) => x.fn + ' ' + x.gradedKBps + ' KB/s') },
      baselineGuard: { binding: !!baseline || recordBaseline, state: baselineState, file: path.relative(ROOT, baselinePath), pass: guard ? guard.offenders.length === 0 : (recordBaseline ? true : null), offenders: guard ? guard.offenders : [], rows: guard ? guard.rows : null },
      srcTotal: { binding: totalBinds, barKBps: B.srcKBps, measuredKBps: worstSrc, pass: worstSrc <= B.srcKBps, unscheduledOwners },
      perFunctionAllOwners: { binding: false, barKBps: B.fnKBps, worst: worstFn ? worstFn.fn + ' ' + worstFn.gradedKBps + ' KB/s' : null, pass: !worstFn || worstFn.gradedKBps <= B.fnKBps, note: 'binds per owner from its barsFrom wave (scheduledAbsoluteBars)' },
      postGcHeapSlope: { binding, barBps: B.heapSlopeBps, slopesBps: slopes, pass: slopes.every((s) => s !== null && s <= B.heapSlopeBps), note: 'graded at the orchestrator\'s global run (R48 b)' },
    };
    const instrumentOk = Object.values(instrument).every(Boolean);
    const bindingBarsOk = Object.values(bars).filter((b) => b.binding).every((b) => b.pass !== false);
    // RECORD (the orchestrator's W0b global run): only from a run whose instrument passed
    let recorded = null;
    if (recordBaseline) {
      if (!instrumentOk) recorded = { written: false, why: 'the instrument did not pass: a baseline is recorded only from a passing instrument' };
      else {
        const box = { loadAverage: os.loadavg().map((x) => +x.toFixed(2)), fps: phases.map((p) => ({ phase: p.name, fps: p.fps })) };
        let prev = null;
        if (recordMode === 'merge' && existsSync(baselinePath)) { try { prev = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch { prev = null; } }
        const rec = { rule: 'R48 (c): the per-owner allocation of the W0b global run; no owner may exceed it by more than 10 % at a later wave exit (an owner exceeds it when EITHER its KB/frame OR its KB/s is > 1.10 x)',
          recordedAt: new Date().toISOString(), port: Number(PORT), runId: runIdOf(PORT), wave, box,
          runs: [...(prev?.runs || (prev ? [{ runId: prev.runId, recordedAt: prev.recordedAt, box: prev.box }] : [])), { runId: runIdOf(PORT), recordedAt: new Date().toISOString(), box }],
          gitHead: (spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout || '').trim() || null,
          owners: Object.fromEntries(owners.filter((o) => o.id !== 'planted-control').map((o) => [o.id, { lane: o.lane, barsFrom: o.barsFrom, phase: o.phase, kbPerFrame: o.kbPerFrame, measuredKBps: o.measuredKBps, gradedKBps: o.gradedKBps }])),
          functions: Object.fromEntries([...overFn.values()].map((x) => [x.fn, { owner: x.ownerRow, kbPerFrame: x.kbPerFrame, measuredKBps: x.measuredKBps, gradedKBps: x.gradedKBps }])),
          noSrcBuckets: Object.fromEntries(runPhase.noSrc.buckets.map((b) => [b.id, { measuredKBps: b.measuredKBps, kbPerFrame: b.kbPerFrame }])) };
        if (prev?.owners) {                                           // merge: per owner, the larger of each recorded number
          for (const [id, o] of Object.entries(prev.owners)) {
            const n = rec.owners[id];
            if (!n) { rec.owners[id] = o; continue; }
            n.kbPerFrame = Math.max(n.kbPerFrame, o.kbPerFrame); n.measuredKBps = Math.max(n.measuredKBps, o.measuredKBps); n.gradedKBps = Math.max(n.gradedKBps, o.gradedKBps);
          }
        }
        mkdirSync(path.dirname(baselinePath), { recursive: true });
        writeFileSync(baselinePath, JSON.stringify(rec, null, 1) + '\n');
        recorded = { written: true, mode: recordMode, runs: rec.runs.length, file: path.relative(ROOT, baselinePath), owners: Object.keys(rec.owners).length };
      }
    }
    const pass = instrumentOk && bindingBarsOk && (!recordBaseline || recorded?.written === true);
    const barLine = Object.entries(bars).map(([k, b]) => `${k} ${b.pass === null ? 'PENDING' : b.pass ? 'pass' : 'FAIL'}${b.binding ? '' : ' (not binding)'}`).join(', ');
    return { pass, detail: {
      verdict: (pass ? 'PASS' : 'FAIL: ' + [...Object.keys(instrument).filter((k) => !instrument[k]), ...Object.entries(bars).filter(([, b]) => b.binding && b.pass === false).map(([k]) => 'bar ' + k)].join(', '))
        + ` — INSTRUMENT (R48 b): ${instrumentOk ? 'PASS' : 'FAIL'} (planted allocator ${control?.src?.ratio ?? '?'}x of ${control?.perCallBytes ?? '?'} B/call in src, ${control?.outsideSrc?.ratio ?? '?'}x outside src; every byte in a named owner: ${accountingOk} (walk / V8 sample list ${phases.map((p) => p.accounting.vsSamples).join(' / ')}, unnamed sample bytes ${phases.map((p) => p.accounting.unnamedSampleBytes).join(' / ')}, walk / (samples x interval) ${phases.map((p) => p.accounting.vsLowerBound).join(' / ')}); baseline-guard self-test ${guardTest.ok} (${guardTest.rule || ''}); bar schedule ${schedule.ok ? 'holds' : 'FAILS ' + JSON.stringify(schedule.failed.slice(0, 3)) + ' ' + schedule.badClass.join(',')} (${schedule.cases} file controls; the fix-round-3 rows fail ${scheduleRound3.failed.length} of them); negative controls ${negatives.filter((n) => n.ok).length}/${negatives.length} fail as they must); `
        + `BARS (${binding ? 'binding: global run' : 'lane run: graded at the orchestrator\'s 5270 global run, R48 b/c'}; wave ${wave}): ${barLine}; baseline ${baselineState}${recorded ? (recorded.written ? ' -> RECORDED ' + recorded.file : ' -> NOT recorded: ' + recorded.why) : ''} — `
        + `measured: src/** (caller attribution) ${worstSrc} KB/s (bar ${B.srcKBps}), worst src function ${worstFn ? worstFn.fn + ' ' + worstFn.gradedKBps + ' KB/s in ' + worstFn.phase : 'none'} (bar ${B.fnKBps}), post-GC heap slope ${slopes.map((s) => (s === null ? '?' : r1(s / 1024) + ' KB/s')).join(' / ')} (bar <= 0); `
        + phases.map((p) => `${p.name}: ${p.fps} fps, all allocation ${p.total.measuredKBps} KB/s = src ${p.srcCaller.measuredKBps} + no-src ${p.noSrc.measuredKBps} (${p.noSrc.buckets.map((b) => b.id + ' ' + b.measuredKBps).join(', ')})`).join('; ')
        + ` — staged fight ${JSON.stringify(fight.cast?.cast || [])} at pixel ratio ${fight.appliedPixelRatio} (tier ${fight.quality})`
        + (Object.keys(byOwner).length ? ` — src functions over ${B.fnKBps} KB/s by owner: ` + Object.entries(byOwner).map(([o, l]) => o + ': ' + l.slice(0, 4).join(', ')).join('; ') : ''),
      instrument, bars, runId: runIdOf(PORT), barsBinding: binding, wave,
      sealing: 'R48 (b): the harness seals every run that executes this row (tools/gates.r5.gates-perf.mjs INSTRUMENT_IDS): report bytes, run monitor and box sample bound to runId in the ledger; verify with node tools/gates.r5.gates-perf.mjs --instruments --port <port>',
      selfTest: { plantedAllocator: control, controlAbsentFromGradedPhases: !controlInGraded, baselineGuard: guardTest, negatives, barSchedule: schedule,
        barScheduleFixRound3: { ok: scheduleRound3.ok, failed: scheduleRound3.failed, badClass: scheduleRound3.badClass }, srcCoverage: coverage,
        accounting: phases.map((p) => ({ phase: p.name, ...p.accounting })) },
      owners, functionsOverBar: [...overFn.values()].map((x) => ({ fn: x.fn, gradedKBps: x.gradedKBps, kbPerFrame: x.kbPerFrame, measuredKBps: x.measuredKBps, phase: x.phase, owner: x.owner, ownerRow: x.ownerRow })),
      checks: { ...instrument, ...Object.fromEntries(Object.entries(bars).map(([k, b]) => ['bar:' + k, b.pass])) },
      budget: { srcKBps: B.srcKBps, fnKBps: B.fnKBps, heapSlopeBps: B.heapSlopeBps, baselineGuard: B.baselineGuard, controlTolerance: B.controlTolerance },
      fight, phases: phases.map((p) => ({ ...p, allFunctions: undefined, functionsSeen: p.allFunctions.length })), emptyFrame, input: shots, functionsOverBarByOwner: byOwner, recorded,
      method: 'CDP HeapProfiler.startSampling (interval ' + B.samplingIntervalB + ' B, objects collected by minor and major GC included) over ' + B.windowS + ' s per phase after ' + B.warmupS + ' s of warm-up; every sampled byte charged to exactly one named owner: the nearest src/** frame on its stack (per function and per owner row, MEMORY_BUDGETS.alloc.owners), else the no-src bucket of the nearest script frame (three.js, vendor deps, Vite client, this gate\'s page code, other page script) or the browser / V8 runtime when no script frame is on the stack; graded rate = max(measured KB/s, KB/frame x 60); post-GC heap = Runtime.getHeapUsage after two HeapProfiler.collectGarbage, least-squares slope; the planted allocator self-test after the graded phases; empty-frame floor with the scene hidden, reported only',
    } };
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* A-vram-ledger: a census of the GL allocation calls, installed before the game makes its context       */
/* ------------------------------------------------------------------------------------------------ */
/* the same sized-format table engine-gpu's A-rt-ledger-census uses (RGB stored as 4 channels, DEPTH_COMPONENT24 = 4 B) */
/*
 * TARGETED FIX ROUND 1 (engineering judge: the wrappers allocated on every WebGL call: a rest array per call through
 * `function (...a)` on every WebGL2 method wrapped, and a string key per bindTexture, against this file's own memory rule,
 * adding GC churn to the measured fight). Now:
 *   - NO bind call is wrapped (activeTexture, bindTexture, bindBuffer*, bindFramebuffer, bindRenderbuffer run native): the
 *     binding a size-changing call acts on is read from the context at that call (gl.getParameter of the *_BINDING enum,
 *     which hands back the existing WebGL object: no allocation), so the census does no work at all on the per-frame
 *     bind traffic (a numeric key in a preallocated table would still run JS on every bind);
 *   - only the size- and attachment-changing calls are wrapped (tex*Image*, texStorage*, copyTexImage2D, generateMipmap,
 *     renderbufferStorage*, framebufferTexture2D / -Layer / -Renderbuffer, bufferData, delete*), each with ONE fixed-arity
 *     wrapper (named parameters, `real.apply(this, arguments)`, which V8 forwards without building an array once the
 *     wrapper is optimised) and no closure or array per call;
 *   - records are keyed numerically and updated IN PLACE: texture levels in an array indexed face * 32 + level, one record
 *     object per level created on its first upload and rewritten after; renderbuffer and buffer records rewritten in place;
 *     the first-upload src frames are captured once per object, never per call.
 * A-vram-ledger measures it: B per wrapped call on a scratch context (selfTest.censusPerCallAllocation), with a positive
 * control that the probe sees a wrapper that does allocate.
 */
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
  const unknown = new Set();                 // numeric internal formats with no size entry (reported)
  const bpp = (ifmt, fmt, type) => { if (SIZED[ifmt]) return SIZED[ifmt]; if (PACKED[type]) return PACKED[type];
    if (CH[ifmt] && TY[type]) return CH[ifmt] * TY[type]; unknown.add(ifmt | 0); return 4; };
  const TEX_2D = 0x0DE1, CUBE = 0x8513, FACE0 = 0x8515, FACE5 = 0x851A, TEX_3D = 0x806F, TEX_2DA = 0x8C1A;
  const BIND_2D = 0x8069, BIND_CUBE = 0x8514, BIND_3D = 0x806A, BIND_2DA = 0x8C1D;
  const READ_FB = 0x8CA8, BIND_DRAW_FB = 0x8CA6, BIND_READ_FB = 0x8CAA, BIND_RB = 0x8CA7;
  // buffer target -> its *_BINDING enum (ARRAY, ELEMENT_ARRAY, UNIFORM, COPY_READ, COPY_WRITE, PIXEL_PACK, PIXEL_UNPACK, TRANSFORM_FEEDBACK)
  const BUF_BIND = { 0x8892: 0x8894, 0x8893: 0x8895, 0x8A11: 0x8A28, 0x8F36: 0x8F36, 0x8F37: 0x8F37, 0x88EB: 0x88ED, 0x88EC: 0x88EF, 0x8C8E: 0x8C8F };
  const objs = new Map();                    // GL object -> record (deleted objects are removed)
  const fbAtt = new Map();                   // framebuffer -> Map(attachment enum -> GL texture / renderbuffer)
  const arrBuf = new WeakMap();              // the typed array a buffer was filled from -> GL buffer (owner resolution)
  const boundTex = (gl, target) => {
    const b = target === TEX_2D ? BIND_2D : (target === CUBE || (target >= FACE0 && target <= FACE5)) ? BIND_CUBE : target === TEX_3D ? BIND_3D : target === TEX_2DA ? BIND_2DA : 0;
    return b ? gl.getParameter(b) : null;
  };
  const faceOf = (target) => (target >= FACE0 && target <= FACE5 ? target - FACE0 : 0);
  // the first upload's src frames (reported for an object no owner claims; captured once per object, never per call)
  // Error.stackTraceLimit raised for this one capture: three's lazily built internals (WebGLBackground's box, the
  // state's empty textures) are uploaded more than 10 frames below the src frame that caused them
  const hintOf = () => { const lim = Error.stackTraceLimit; Error.stackTraceLimit = 80; const st = new Error().stack; Error.stackTraceLimit = lim; const s = String(st || '').split('\n').filter((l) => /\/src\//.test(l) && !/__glCensus/.test(l)).slice(0, 3).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+/, '').replace(/\?[^:)]*/, '')); return s; };
  const texRec = (t) => { let r = objs.get(t); if (!r) { r = { kind: 'tex', lv: [], rt: false, hint: null }; objs.set(t, r); } return r; };
  const setLevel = (gl, target, face, level, w, h, d, bytes) => {
    const t = boundTex(gl, target); if (!t) return;
    const r = texRec(t); if (!r.hint) r.hint = hintOf();
    const k = face * 32 + level;
    const v = r.lv[k];
    if (v) { v.w = w; v.h = h; v.d = d; v.bytes = bytes; } else r.lv[k] = { w, h, d, bytes };
  };
  const srcW = (src) => (src ? src.videoWidth || src.naturalWidth || src.displayWidth || src.width || 0 : 0);
  const srcH = (src) => (src ? src.videoHeight || src.naturalHeight || src.displayHeight || src.height || 0 : 0);
  const P = WebGL2RenderingContext.prototype;
  const wrapped = [];
  let calls = 0;                             // wrapped calls made (a small-integer increment: no allocation)
  // ONE fixed-arity wrapper per method: the original gets exactly the caller's arguments (WebGL overloads resolve by
  // argument count), 'after' gets the count and the first nine by name; nothing is built per call
  const wrap = (name, after) => {
    const real = P[name]; if (typeof real !== 'function') return;
    P[name] = function __glCensusWrapped(a0, a1, a2, a3, a4, a5, a6, a7, a8) {
      'use strict';   // an UNMAPPED arguments object: TurboFan forwards real.apply(this, arguments) and reads arguments.length without
                      // materialising it (a sloppy, mapped one with formals is not elided: 23 B per call in the first probe run)
      calls++;
      const out = real.apply(this, arguments);
      try { after(this, arguments.length, a0, a1, a2, a3, a4, a5, a6, a7, a8); } catch (e) { /* census only */ }
      return out;
    };
    wrapped.push(name);
  };
  wrap('deleteTexture', (gl, n, t) => { objs.delete(t); });
  // texImage2D(target, level, ifmt, w, h, border, format, type, ...) | (target, level, ifmt, format, type, source)
  wrap('texImage2D', (gl, n, t, l, ifmt, a3, a4, a5, a6, a7) => {
    if (n >= 8) setLevel(gl, t, faceOf(t), l, a3, a4, 1, a3 * a4 * bpp(ifmt, a6, a7));
    else { const w = srcW(a5), h = srcH(a5); setLevel(gl, t, faceOf(t), l, w, h, 1, w * h * bpp(ifmt, a3, a4)); }
  });
  wrap('texImage3D', (gl, n, t, l, ifmt, w, h, d, border, fmt, type) => { setLevel(gl, t, 0, l, w, h, d, w * h * d * bpp(ifmt, fmt, type)); });
  wrap('copyTexImage2D', (gl, n, t, l, ifmt, x, y, w, h) => { setLevel(gl, t, faceOf(t), l, w, h, 1, w * h * bpp(ifmt, 0, 0)); });
  wrap('compressedTexImage2D', (gl, n, t, l, ifmt, w, h, border, data) => { setLevel(gl, t, faceOf(t), l, w, h, 1, typeof data === 'number' ? data : (data && data.byteLength) || 0); });
  wrap('compressedTexImage3D', (gl, n, t, l, ifmt, w, h, d, border, data) => { setLevel(gl, t, 0, l, w, h, d, typeof data === 'number' ? data : (data && data.byteLength) || 0); });
  wrap('texStorage2D', (gl, n, target, levels, ifmt, w, h) => {
    const faces = target === CUBE ? 6 : 1, per = bpp(ifmt, 0, 0);
    for (let f = 0; f < faces; f++) for (let l = 0; l < levels; l++) { const lw = Math.max(1, w >> l), lh = Math.max(1, h >> l); setLevel(gl, target, f, l, lw, lh, 1, lw * lh * per); }
  });
  wrap('texStorage3D', (gl, n, target, levels, ifmt, w, h, d) => {
    const per = bpp(ifmt, 0, 0);
    for (let l = 0; l < levels; l++) { const lw = Math.max(1, w >> l), lh = Math.max(1, h >> l), ld = target === TEX_3D ? Math.max(1, d >> l) : d; setLevel(gl, target, 0, l, lw, lh, ld, lw * lh * ld * per); }
  });
  wrap('generateMipmap', (gl, n, target) => {
    const t = boundTex(gl, target); if (!t) return; const r = texRec(t);
    for (let f = 0; f < 6; f++) {
      const v = r.lv[f * 32]; if (!v) continue;
      const per = v.w * v.h * v.d ? v.bytes / (v.w * v.h * v.d) : 0;
      let w = v.w, h = v.h, l = 0;
      while ((w > 1 || h > 1) && l < 31) {
        w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); l++;
        const k = f * 32 + l, x = r.lv[k];
        if (x) { x.w = w; x.h = h; x.d = v.d; x.bytes = w * h * v.d * per; } else r.lv[k] = { w, h, d: v.d, bytes: w * h * v.d * per };
      }
    }
  });
  wrap('deleteRenderbuffer', (gl, n, rb) => { objs.delete(rb); });
  const rbStore = (gl, samples, ifmt, w, h) => {
    const rb = gl.getParameter(BIND_RB); if (!rb) return;
    let r = objs.get(rb);
    if (!r) { r = { kind: 'rb', w: 0, h: 0, samples: 0, bytes: 0, rt: true, hint: hintOf() }; objs.set(rb, r); }
    r.w = w; r.h = h; r.samples = samples; r.bytes = w * h * Math.max(1, samples) * bpp(ifmt, 0, 0);
  };
  wrap('renderbufferStorage', (gl, n, t, ifmt, w, h) => rbStore(gl, 0, ifmt, w, h));
  wrap('renderbufferStorageMultisample', (gl, n, t, samples, ifmt, w, h) => rbStore(gl, samples, ifmt, w, h));
  wrap('deleteFramebuffer', (gl, n, fb) => { fbAtt.delete(fb); });
  const attachTo = (gl, target, point, obj) => {
    const fb = gl.getParameter(target === READ_FB ? BIND_READ_FB : BIND_DRAW_FB); if (!fb) return;
    let m = fbAtt.get(fb);
    if (!obj) { if (m) m.delete(point); return; }
    if (!m) { m = new Map(); fbAtt.set(fb, m); }
    m.set(point, obj);
  };
  wrap('framebufferTexture2D', (gl, n, target, point, textarget, tex) => { if (tex) texRec(tex).rt = true; attachTo(gl, target, point, tex); });
  wrap('framebufferTextureLayer', (gl, n, target, point, tex) => { if (tex) texRec(tex).rt = true; attachTo(gl, target, point, tex); });
  wrap('framebufferRenderbuffer', (gl, n, target, point, rbt, rb) => { attachTo(gl, target, point, rb); });
  wrap('deleteBuffer', (gl, n, b) => { objs.delete(b); });
  wrap('bufferData', (gl, n, target, src, usage, off, len) => {
    const bind = BUF_BIND[target]; if (!bind) return;
    const b = gl.getParameter(bind); if (!b) return;
    const el = (src && src.BYTES_PER_ELEMENT) || 1;
    const bytes = typeof src === 'number' ? src : len !== undefined && len > 0 ? len * el : (src ? src.byteLength - (off || 0) * el : 0);
    let r = objs.get(b);
    if (!r) { r = { kind: 'buf', target, bytes, hint: hintOf() }; objs.set(b, r); } else { r.target = target; r.bytes = bytes; }
    if (src && typeof src === 'object' && ArrayBuffer.isView(src)) arrBuf.set(src, b);
  });
  const texBytes = (r) => { let b = 0; for (const v of r.lv) if (v) b += v.bytes; return b; };
  const texLevels = (r) => { let n = 0; for (const v of r.lv) if (v) n++; return n; };
  const texLv0 = (r) => { for (const v of r.lv) if (v) return v; return { w: 0, h: 0 }; };
  const bytesOf = (r) => (r.kind === 'tex' ? texBytes(r) : r.bytes);
  const catOf = (r) => (r.kind === 'buf' ? 'buffers' : r.rt ? 'renderTargets' : 'textures');
  const rowOf = (r) => { const lv0 = r.kind === 'tex' ? texLv0(r) : r; return { kind: r.kind, bytes: bytesOf(r), w: lv0.w || 0, h: lv0.h || 0, levels: r.kind === 'tex' ? texLevels(r) : 0, samples: r.samples || 0, target: r.kind === 'buf' ? '0x' + r.target.toString(16) : undefined }; };
  window.__glCensus = {
    /** wrapped calls made since install (A-vram-ledger reads it over a window of the fight: the census's per-frame work) */
    calls() { return calls; },
    /** totals per category, exact integers */
    totals() { const t = { textures: 0, renderTargets: 0, buffers: 0, objects: objs.size }; for (const [, r] of objs) t[catOf(r)] += bytesOf(r); return t; },
    summary() {
      const out = { textures: { count: 0, bytes: 0, largest: [] }, renderTargets: { count: 0, bytes: 0, textures: 0, renderbuffers: 0, largest: [] },
        buffers: { count: 0, bytes: 0, byTarget: {} }, unknownFormats: [...unknown].map((f) => '0x' + f.toString(16)), wrappedMethods: wrapped.slice() };
      const tl = [], rl = [];
      for (const [, r] of objs) {
        if (r.kind === 'buf') { out.buffers.count++; out.buffers.bytes += r.bytes; out.buffers.byTarget['0x' + r.target.toString(16)] = (out.buffers.byTarget['0x' + r.target.toString(16)] || 0) + r.bytes; continue; }
        const row = rowOf(r);
        if (r.rt) { out.renderTargets.count++; out.renderTargets.bytes += row.bytes; if (r.kind === 'rb') out.renderTargets.renderbuffers++; else out.renderTargets.textures++; rl.push(row); }
        else { out.textures.count++; out.textures.bytes += row.bytes; tl.push(row); }
      }
      out.textures.largest = tl.sort((a, b) => b.bytes - a.bytes).slice(0, 10);
      out.renderTargets.largest = rl.sort((a, b) => b.bytes - a.bytes).slice(0, 14);
      return out;
    },
    /**
     * W0b fix round 3 (R48 b: "every byte and target attributed to an owner"). Every live GL object is resolved to ONE
     * owner, in this order, and every byte lands in a named owner or in the explicit "unattributed" row:
     *  (1) render targets: each engine.renderTargetLedger() row (engine-gpu's ledger: post chain, CSM, environment
     *      PMREM, registered lane targets) claims its framebuffers' attachments, renderbuffers and textures;
     *  (2) scene roots: every top-level scene child claims its subtree's material textures (every texture-valued
     *      property and uniform), skeleton bone textures and geometry buffers (attributes, morph attributes, index,
     *      instance attributes), named by the §4.2 draw-owner row its name registers to (else "unregistered scene root");
     *      scene.background / scene.environment go to world-sky;
     *  (3) the context graph: a bounded walk of __CTX__ (and the game's systems) claims textures, render targets and
     *      geometries held off-scene (pass quads, pools, templates, caches), owner = the ctx key's lane;
     *  (4) anything left is listed in "unattributed" with its size and its first upload's src frames.
     */
    attribute(cfg) {
      const ctx = __CTX__, e = ctx.engine, r = e.renderer, scene = ctx.scene;
      const props = r.properties;
      const OWN = cfg.drawOwners.map((o) => ({ ...o, re: new RegExp(o.re, o.flags) }));
      const ownerOfName = (n) => (n ? OWN.find((o) => o.re.test(n)) || null : null);
      const claimed = new Map();               // GL object -> owner key
      const owners = new Map();                // owner key -> { lane, how, textures, renderTargets, buffers, objects }
      const ensure = (key, lane, how) => { let o = owners.get(key); if (!o) owners.set(key, (o = { owner: key, lane, how, textures: 0, renderTargets: 0, buffers: 0, objects: 0 })); return o; };
      const claim = (glObj, key, lane, how) => { if (!glObj || claimed.has(glObj)) return; const rec = objs.get(glObj); if (!rec) return; claimed.set(glObj, key); const o = ensure(key, lane, how); o[catOf(rec)] += bytesOf(rec); o.objects++; if (!o.hint && rec.hint && rec.hint.length) o.hint = rec.hint[0]; };
      const each = (v, f) => { if (Array.isArray(v)) { for (const x of v) each(x, f); } else if (v) f(v); };
      const fbAll = (fb, key, lane, how) => { const m = fbAtt.get(fb); if (m) for (const o of m.values()) claim(o, key, lane, how); };
      const claimTarget = (rt, key, lane, how) => {
        if (!rt || !props.has(rt)) return;
        const p = props.get(rt);
        each(p.__webglFramebuffer, (fb) => fbAll(fb, key, lane, how)); each(p.__webglMultisampledFramebuffer, (fb) => fbAll(fb, key, lane, how));
        each(p.__webglDepthbuffer, (o) => claim(o, key, lane, how)); each(p.__webglColorRenderbuffer, (o) => claim(o, key, lane, how)); each(p.__webglDepthRenderbuffer, (o) => claim(o, key, lane, how));
        for (const t of rt.textures || [rt.texture]) if (t && props.has(t)) claim(props.get(t).__webglTexture, key, lane, how);
        if (rt.depthTexture && props.has(rt.depthTexture)) claim(props.get(rt.depthTexture).__webglTexture, key, lane, how);
      };
      const claimTexture = (t, key, lane, how) => {
        if (!t || !t.isTexture || !props.has(t)) return;
        const gt = props.get(t).__webglTexture;
        claim(gt, key, lane, how);
        // a render-target texture held without its target (environment PMREM): its framebuffers' other attachments
        if (gt && objs.get(gt)?.rt) for (const [fb, m] of fbAtt) { let has = false; for (const o of m.values()) if (o === gt) has = true; if (has) fbAll(fb, key, lane, how); }
      };
      const claimAttr = (a, key, lane, how) => { if (!a) return; const arr = a.isInterleavedBufferAttribute ? a.data?.array : a.array; if (arr) claim(arrBuf.get(arr), key, lane, how); };
      const claimGeometry = (g, key, lane, how) => {
        if (!g || !g.isBufferGeometry) return;
        for (const k in g.attributes) claimAttr(g.attributes[k], key, lane, how);
        for (const k in g.morphAttributes) each(g.morphAttributes[k], (a) => claimAttr(a, key, lane, how));
        claimAttr(g.index, key, lane, how);
      };
      const TEX_SCAN = (m, f) => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) f(v); }
        if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) f(v); else if (Array.isArray(v)) for (const x of v) if (x && x.isTexture) f(x); }
      };
      const claimObject = (o, key, lane, how) => {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) TEX_SCAN(m, (t) => claimTexture(t, key, lane, how));
        for (const m of [o.customDepthMaterial, o.customDistanceMaterial]) if (m) TEX_SCAN(m, (t) => claimTexture(t, key, lane, how));
        claimGeometry(o.geometry, key, lane, how);
        if (o.isInstancedMesh) { claimAttr(o.instanceMatrix, key, lane, how); claimAttr(o.instanceColor, key, lane, how); if (o.morphTexture) claimTexture(o.morphTexture, key, lane, how); }
        if (o.isBatchedMesh) for (const k of ['_matricesTexture', '_indirectTexture', '_colorsTexture']) claimTexture(o[k], key, lane, how);
        if (o.skeleton?.boneTexture) claimTexture(o.skeleton.boneTexture, key, lane, how);
        if (o.isLight && o.shadow?.map) claimTarget(o.shadow.map, key, lane, how);
      };
      // (1) the engine's render-target ledger
      const L = e.renderTargetLedger ? e.renderTargetLedger() : { rows: [] };
      const laneOfRt = (owner) => (/^post:/.test(owner) ? 'engine-gpu (post chain)' : /^shadow:/.test(owner) ? 'engine-gpu (shadow maps / CSM)' : /^env:/.test(owner) ? 'world-sky (environment PMREM)' : owner === 'unregistered' ? 'unregistered render target' : 'registered by its lane: ' + owner);
      const ledgerRows = [];
      for (const row of L.rows || []) {
        const key = 'rt ' + row.owner;
        const before = owners.get(key)?.renderTargets || 0;
        if (row.target) claimTarget(row.target, key, laneOfRt(row.owner), 'engine.renderTargetLedger()');
        else if (row.texture) claimTexture(row.texture, key, laneOfRt(row.owner), 'engine.renderTargetLedger()');
        const o = owners.get(key);
        ledgerRows.push({ owner: row.owner, allocated: row.allocated, ledgerBytes: row.allocated ? row.bytes : 0, glBytes: (o ? o.renderTargets + o.textures : 0) - before });
      }
      // (2) scene roots
      const sceneRoots = [];
      for (const root of scene.children) {
        const reg = ownerOfName(root.name);
        const key = reg ? 'scene ' + reg.id : 'unregistered scene root ' + (root.name || '(unnamed ' + root.type + ')');
        const lane = reg ? reg.lanes : 'UNREGISTERED (name the root for its §4.2 row)';
        root.traverse((o) => claimObject(o, key, lane, 'scene root'));
        sceneRoots.push({ root: root.name || '(unnamed ' + root.type + ')', owner: key, obj: reg ? null : root });
      }
      for (const k of ['background', 'environment']) if (scene[k]?.isTexture) claimTexture(scene[k], 'scene.' + k, 'world-sky', 'scene.' + k);
      // (3) the context graph (bounded): what is held off-scene
      const LANE_OF_KEY = cfg.ctxLanes;
      const seen = new Set(), q = []; let qi = 0, visited = 0;
      const SKIP_KEYS = new Set(['game', 'renderer', 'events', 'input', 'settings', 'parent', 'children', '_listeners', 'domElement', 'matrixWorld', 'matrix']);
      for (const k of Object.keys(ctx)) if (!SKIP_KEYS.has(k) && ctx[k] && typeof ctx[k] === 'object' && ctx[k] !== scene) q.push([ctx[k], 'ctx.' + k, k, 0]);
      const sys = ctx.game?.systems || ctx.game?._systems || [];
      if (Array.isArray(sys)) sys.forEach((s, i) => { if (s && typeof s === 'object') q.push([s, 'system ' + (s.constructor?.name || i), '(system)' + (s.constructor?.name || i), 0]); });
      const isSkippable = (v) => v instanceof Node || v instanceof Window || ArrayBuffer.isView(v) || v instanceof ArrayBuffer || v instanceof WebGL2RenderingContext
        || (typeof AudioNode !== 'undefined' && (v instanceof AudioNode || v instanceof AudioBuffer || v instanceof BaseAudioContext)) || v instanceof Promise || v instanceof WeakMap || v instanceof WeakSet
        || (typeof WebGLTexture !== 'undefined' && (v instanceof WebGLTexture || v instanceof WebGLBuffer || v instanceof WebGLFramebuffer || v instanceof WebGLRenderbuffer || v instanceof WebGLProgram || v instanceof WebGLShader || v instanceof WebGLVertexArrayObject));
      while (qi < q.length && visited < 400000) {
        const [v, p, k0, d] = q[qi++];
        if (!v || typeof v !== 'object' || seen.has(v) || isSkippable(v)) continue;
        seen.add(v); visited++;
        const lane = LANE_OF_KEY[k0] || (k0.startsWith('(system)') ? 'system ' + k0.slice(8) : 'orchestrator (ctx.' + k0 + ')');
        const key = 'held by ' + p.split('.').slice(0, 2).join('.');
        if (v === scene) continue;
        // an UNREGISTERED scene root reached from the context graph: who holds it names its lane (the root still has to be named)
        if (v.isObject3D && v.parent === scene) { const sr = sceneRoots.find((x) => x.obj === v); if (sr && !sr.heldBy) { sr.heldBy = p; sr.heldByLane = lane; } }
        if (v.isTexture) { claimTexture(v, key, lane, 'context graph: ' + p); continue; }
        if (v.isRenderTarget) { claimTarget(v, key, lane, 'context graph: ' + p); continue; }
        if (v.isBufferGeometry) { claimGeometry(v, key, lane, 'context graph: ' + p); continue; }
        if (v.isObject3D) { v.traverse((o) => claimObject(o, key, lane, 'context graph (off-scene object): ' + p)); }
        if (v.isMaterial) { TEX_SCAN(v, (t) => claimTexture(t, key, lane, 'context graph: ' + p)); continue; }
        if (d >= 7) continue;
        if (v instanceof Map) { let n = 0; for (const x of v.values()) { if (n++ > 20000) break; if (x && typeof x === 'object') q.push([x, p + '.get()', k0, d + 1]); } continue; }
        if (v instanceof Set) { let n = 0; for (const x of v) { if (n++ > 20000) break; if (x && typeof x === 'object') q.push([x, p + '[set]', k0, d + 1]); } continue; }
        if (Array.isArray(v)) { const n = Math.min(v.length, 20000); for (let i = 0; i < n; i++) { const x = v[i]; if (x && typeof x === 'object') q.push([x, p + '[]', k0, d + 1]); } continue; }
        let keys; try { keys = Object.keys(v); } catch (err) { continue; }
        for (const kk of keys) { if (SKIP_KEYS.has(kk)) continue; let x; try { x = v[kk]; } catch (err) { continue; } if (x && typeof x === 'object') q.push([x, p + '.' + kk, k0, d + 1]); }
      }
      for (const sr of sceneRoots) {
        if (!sr.obj) continue;
        const o = owners.get(sr.owner);
        if (o && sr.heldBy && !/held by/.test(o.lane)) o.lane = 'UNREGISTERED scene root, held by ' + sr.heldBy + ' (' + sr.heldByLane + '): name the root for its §4.2 row';
        sr.obj = undefined;
      }
      // (3b) what no graph reaches (three's renderer internals live in closures: WebGLState's empty textures, WebGLBackground's
      // box) is attributed by the census's own record of the src frame that FIRST uploaded it (its call site), owner = that
      // file's owner row (cfg.srcOwners, MEMORY_BUDGETS.alloc.owners); an object with no src frame on its first upload stays
      // unattributed
      const SRC_OWN = (cfg.srcOwners || []).map((o) => ({ ...o, re: new RegExp(o.re) }));
      for (const [g, rec] of objs) {
        if (claimed.has(g) || !rec.hint || !rec.hint.length) continue;
        const site = rec.hint[0], file = (/(\/src\/[^:)\s]+):\d+/.exec(site) || [])[1] || '';
        const row = SRC_OWN.find((o) => o.re.test(file));
        const key = 'first upload under ' + site.replace(/^.*?\((.*)\)$/, '$1').replace(/:\d+$/, '');
        claim(g, key, row ? row.lane : 'orchestrator (a src file no owner row names)', 'census first-upload call site');
      }
      // (4) the remainder
      const un = { textures: { count: 0, bytes: 0, rows: [] }, renderTargets: { count: 0, bytes: 0, rows: [] }, buffers: { count: 0, bytes: 0, rows: [] } };
      const totals = { textures: 0, renderTargets: 0, buffers: 0 };
      for (const [g, rec] of objs) {
        const c = catOf(rec), b = bytesOf(rec);
        totals[c] += b;
        if (claimed.has(g)) continue;
        un[c].count++; un[c].bytes += b; un[c].rows.push({ ...rowOf(rec), hint: rec.hint || [] });
      }
      for (const c of Object.keys(un)) un[c].rows = un[c].rows.sort((a, b) => b.bytes - a.bytes).slice(0, 12);
      const list = [...owners.values()].map((o) => ({ ...o, total: o.textures + o.renderTargets + o.buffers })).sort((a, b) => b.total - a.total);
      const attributed = { textures: 0, renderTargets: 0, buffers: 0 };
      for (const o of list) { attributed.textures += o.textures; attributed.renderTargets += o.renderTargets; attributed.buffers += o.buffers; }
      const exact = ['textures', 'renderTargets', 'buffers'].every((c) => attributed[c] + un[c].bytes === totals[c]);
      const ledgerTotal = ledgerRows.reduce((a, x) => a + x.ledgerBytes, 0), ledgerGl = ledgerRows.reduce((a, x) => a + x.glBytes, 0);
      return { owners: list, unattributed: un, totals, attributed, accountingExact: exact, ledgerRows, ledgerTotalBytes: ledgerTotal, ledgerClaimedGlBytes: ledgerGl,
        rtMismatches: ledgerRows.filter((x) => x.ledgerBytes !== x.glBytes), sceneRoots, graphVisited: visited };
    },
  };
})()`;

/** the page-side attribution config: draw-owner rows, ctx-key lanes, and the src owner rows for the first-upload step (3b) */
const ATTR_CFG = () => ({ drawOwners: DRAW_OWNERS.map((o) => ({ id: o.id, lanes: o.lanes, re: o.re.source, flags: o.re.flags })), ctxLanes: CTX_LANES,
  srcOwners: ALLOC_OWNER_ROWS.map((o) => ({ id: o.id, re: o.files, lane: o.lane })) });
/** ctx keys -> the lane that answers for what they hold off-scene (plan §2 rows) */
const CTX_LANES = { engine: 'engine-gpu', camera: 'engine-gpu', assets: 'pipeline (loaded templates)', terrain: 'world-ground', vegetation: 'world-ground', water: 'world-ground',
  environment: 'world-sky', sky: 'world-sky', weather: 'world-sky', camp: 'settlements', npcs: 'settlements', settlements: 'settlements', player: 'hero-body', animator: 'hero-body',
  inventory: 'armory', machines: 'instruments-core', instruments: 'instruments-core', combat: 'combat-kit', vfx: 'combat-kit', particles: 'combat-kit', arrows: 'combat-kit',
  wheel: 'shell-ui', sighting: 'shell-ui', hud: 'shell-ui', menus: 'shell-ui', ui: 'shell-ui', interactables: 'world-props', props: 'world-props', sites: 'world-props', fauna: 'world-props',
  audio: 'audio', progression: 'progression', save: 'progression', studio: 'brand' };

/**
 * POSITIVE CONTROLS (R48 b "self-tests passing"): objects of exactly known GPU size are created through three.js on the
 * live page, the census must see their exact bytes, the attribution must give them to the right owner, and disposing
 * them must return every census total to its value before, to the byte:
 *   - a 333 x 211 HalfFloat RGBA render target with a depth renderbuffer, registered as `gates-perf:control`:
 *     562,104 B colour (RGBA16F, 8 B) + 281,052 B depth (DEPTH_COMPONENT24, 4 B) = 843,156 B of render targets,
 *     claimed by the ledger row `rt gates-perf:control`;
 *   - a 64 x 32 RGBA8 DataTexture (8,192 B, one level) and a 100-vertex Float32 position + 150-index Uint16 geometry
 *     (1,200 + 300 = 1,500 B of buffers) on a scene root named `gates-perf-control`, claimed by that root.
 */
const VRAM_CONTROL = `(async () => {
  ${FRAMES}
  const ctx = __CTX__, e = ctx.engine, r = e.renderer, scene = ctx.scene, C = window.__glCensus;
  const url = performance.getEntriesByType('resource').map((x) => x.name).find((n) => /\\/node_modules\\/\\.vite\\/deps\\/three\\.js/.test(n));
  if (!url) return { ok: false, why: 'the page did not load three from the Vite dependency bundle (no resource entry): the control cannot use the page\\'s own three module' };
  const T = await import(url);                                            // the SAME module instance the game uses (same URL)
  const cfg = window.__w0bAttrCfg;
  const t0 = C.totals();
  const W = 333, H = 211;
  const rt = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType, depthBuffer: true, stencilBuffer: false, samples: 0 });
  rt.texture.name = 'gates-perf-control-rt';
  e.registerRenderTarget('gates-perf:control', rt);
  const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.clear(); r.setRenderTarget(prev);
  const data = new Uint8Array(64 * 32 * 4);
  const tex = new T.DataTexture(data, 64, 32, T.RGBAFormat, T.UnsignedByteType); tex.generateMipmaps = false; tex.needsUpdate = true;
  const p = ctx.player.position, pos = new Float32Array(300), idx = new Uint16Array(150);
  for (let i = 0; i < 100; i++) { pos[i * 3] = p.x + (i % 10) - 4.5; pos[i * 3 + 1] = p.y + 1.2; pos[i * 3 + 2] = p.z + Math.floor(i / 10) - 4.5; }
  for (let i = 0; i < 150; i++) idx[i] = (i * 7) % 100;
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(new T.BufferAttribute(idx, 1));
  const mat = new T.MeshBasicMaterial({ map: tex, colorWrite: false, depthWrite: false, depthTest: false });
  const mesh = new T.Mesh(geo, mat); mesh.name = 'gates-perf-control'; mesh.frustumCulled = false; mesh.renderOrder = 9999;
  r.initTexture(tex);
  scene.add(mesh);
  await __frames(4);
  const t1 = C.totals();
  const a = C.attribute(cfg);
  const rtRow = a.owners.find((o) => o.owner === 'rt gates-perf:control') || null;
  const ctlRoot = a.owners.find((o) => o.owner === 'unregistered scene root gates-perf-control') || null;
  const ledgerRow = (e.renderTargetLedger().rows || []).find((x) => x.owner === 'gates-perf:control') || null;
  // dispose everything: the census must return to t0 to the byte
  scene.remove(mesh); geo.dispose(); mat.dispose(); tex.dispose(); e.unregisterRenderTarget(rt); rt.dispose();
  await __frames(3);
  const t2 = C.totals();
  const exp = { renderTargets: W * H * 8 + W * H * 4, textures: 64 * 32 * 4, buffers: 300 * 4 + 150 * 2 };
  const d1 = { renderTargets: t1.renderTargets - t0.renderTargets, textures: t1.textures - t0.textures, buffers: t1.buffers - t0.buffers };
  const back = { renderTargets: t2.renderTargets - t0.renderTargets, textures: t2.textures - t0.textures, buffers: t2.buffers - t0.buffers };
  const checks = {
    censusSawTheTargetExactly: d1.renderTargets === exp.renderTargets,
    censusSawTheTextureExactly: d1.textures === exp.textures,
    censusSawTheBuffersExactly: d1.buffers === exp.buffers,
    ledgerRowClaimedTheTarget: !!rtRow && rtRow.renderTargets + rtRow.textures === exp.renderTargets,
    engineLedgerAgrees: !!ledgerRow && ledgerRow.bytes === exp.renderTargets,
    sceneRootClaimedTextureAndBuffers: !!ctlRoot && ctlRoot.textures === exp.textures && ctlRoot.buffers === exp.buffers,
    disposeReturnedEveryTotal: back.renderTargets === 0 && back.textures === 0 && back.buffers === 0,
  };
  return { ok: Object.values(checks).every(Boolean), checks, expectedBytes: exp, censusDelta: d1, afterDispose: back,
    attributedTo: { target: rtRow, root: ctlRoot }, engineLedgerRowBytes: ledgerRow ? ledgerRow.bytes : null };
})()`;

/**
 * ROUTING WITH FILE:LINE (targeted fix round 1; R48 b "each over-bar owner routed with file:line"; engineering judge:
 * A-vram-ledger and A90-abs routed "src/core/engine.js renderTargetLedger() rows" with no line). Each ledger row is
 * resolved to the line(s) that CREATE its target, read from this tree's own source at run time (so the routing follows
 * whatever engine.js holds: this tree's, or merged main's after engine-gpu's tier), plus the default tier's dprCap line for
 * every target sized by the drawing buffer. A lane's registered target resolves to its registerRenderTarget('<owner>', …)
 * call. `files` overrides the source text (the negative control resolves against a text without the anchors).
 */
const SRC_TEXT = new Map();
const srcLinesOf = (rel, files) => {
  if (files) return Object.prototype.hasOwnProperty.call(files, rel) ? files[rel] : null;
  if (!SRC_TEXT.has(rel)) { let t = null; try { t = readFileSync(path.join(ROOT, rel), 'utf8').split('\n'); } catch { t = null; } SRC_TEXT.set(rel, t); }
  return SRC_TEXT.get(rel);
};
const lineOf = (rel, re, files) => { const lines = srcLinesOf(rel, files); if (!lines) return null; const i = lines.findIndex((l) => !/^\s*(\*|\/\/|\/\*)/.test(l) && re.test(l)); return i < 0 ? null : `${rel}:${i + 1}`; };   // code lines, never a comment
const ENGINE = 'src/core/engine.js', ENVIRONMENT = 'src/world/environment.js';
const RT_ROUTES = [
  [/^post:scene$/, [[ENGINE, /sceneRT\s*=\s*new THREE\.WebGLRenderTarget\(/], [ENGINE, /samples:\s*this\.tier\.msaa/]], 'the HalfFloat scene target at the drawing-buffer size, MSAA x tier.msaa, with its depth texture', true],
  [/^post:pingA$/, [[ENGINE, /'CAL\.postA'/], [ENGINE, /^\s*_makePostTarget\(w, h, name\)/]], 'post ping-pong target A (HalfFloat, drawing-buffer size)', true],
  [/^post:pingB$/, [[ENGINE, /'CAL\.postB'/], [ENGINE, /^\s*_makePostTarget\(w, h, name\)/]], 'post ping-pong target B (HalfFloat, drawing-buffer size)', true],
  [/^post:SMAAPass\./, [[ENGINE, /this\.smaa\s*=\s*new SMAAPass\(/]], 'SMAA edges / weights targets (drawing-buffer size)', true],
  [/^post:GTAOPass\./, [[ENGINE, /this\.gtao\s*=\s*new GTAOPass\(/], [ENGINE, /this\.tier\.gtaoScale/]], 'GTAO targets at tier.gtaoScale of the drawing buffer', true],
  [/^post:UnrealBloomPass\./, [[ENGINE, /this\.bloom\s*=\s*new UnrealBloomPass\(/]], 'the bloom mip chain (capped at BLOOM_MAX_WIDTH)', true],
  [/^post:/, [[ENGINE, /this\.composer\.addPass\(/]], 'a post pass target', true],
  [/^shadow:csm\[\d+\]$/, [[ENGINE, /this\.csm\s*=\s*new CSM\(/], [ENGINE, /Math\.min\(csm\.shadowMapSize, cap\)/], [ENVIRONMENT, /engine\.enableCSM\(/]], 'a CSM cascade shadow map: shadowMapSize from world-sky\'s enableCSM call (and the tier csmMapCaps where the engine has them)', false],
  // the line that SIZES the light's map (a mapSize write), never a line that only reads it
  [/^shadow:/, [[ENGINE, /shadow\.mapSize\.set\(|shadow\.mapSize\.(x|y|width|height)\s*=[^=]/], [ENVIRONMENT, /shadow\.mapSize\.set\(|shadow\.mapSize\.(x|y|width|height)\s*=[^=]/], [ENVIRONMENT, /castShadow\s*=\s*true/]], 'a light shadow map (its light\'s shadow.mapSize)', false],
  [/^env:/, [[ENVIRONMENT, /PMREMGenerator\(/], [ENVIRONMENT, /fromScene\(/]], 'the environment PMREM (world-sky)', false],
];
/** the default tier's dprCap line (every drawing-buffer-sized target scales with it) */
function tierLine(files) {
  const lines = srcLinesOf(ENGINE, files); if (!lines) return null;
  const def = (/DEFAULT_TIER\s*=\s*'([a-z]+)'/.exec(lines.join('\n')) || [])[1] || 'high';
  const at = lines.findIndex((l) => new RegExp('^\\s*' + def + ':\\s*\\{').test(l)); if (at < 0) return null;
  const k = lines.slice(at, at + 4).findIndex((l) => /dprCap/.test(l));
  return k < 0 ? null : `${ENGINE}:${at + k + 1} (default tier '${def}' dprCap)`;
}
let REGISTER_SITES = null;
function registerSite(owner) {
  if (!REGISTER_SITES) {
    REGISTER_SITES = [];
    const walkSrc = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walkSrc(p); else if (/\.js$/.test(e.name)) { let t = ''; try { t = readFileSync(p, 'utf8'); } catch { t = ''; } t.split('\n').forEach((l, i) => { const m = /registerRenderTarget\(\s*['"`]([^'"`]+)['"`]/.exec(l); if (m) REGISTER_SITES.push({ owner: m[1], at: relRoot(p) + ':' + (i + 1) }); }); } } };
    walkSrc(path.join(ROOT, 'src'));
  }
  return REGISTER_SITES.filter((x) => x.owner === owner).map((x) => x.at);
}
/** a ledger row owner -> { fileLines[], what, scalesWithDrawingBuffer } */
export function routeRt(owner, files) {
  const r = RT_ROUTES.find(([re]) => re.test(owner));
  if (r) {
    const fileLines = r[1].map(([f, re]) => lineOf(f, re, files)).filter(Boolean);
    const t = r[3] ? tierLine(files) : null;
    return { fileLines: t && fileLines.length ? [...fileLines, t] : fileLines, what: r[2], scalesWithDrawingBuffer: r[3] };
  }
  const reg = files ? [] : registerSite(owner);
  return { fileLines: reg, what: reg.length ? 'a target its lane registered (engine.registerRenderTarget)' : 'unresolved', scalesWithDrawingBuffer: null };
}

/**
 * THE CENSUS PROBE (targeted fix round 1), on a SCRATCH WebGL2 context (an OffscreenCanvas of this page; the game's context
 * and three's state are never touched):
 *  (1) NEGATIVE CONTROL for the attribution criteria: GL objects of exactly known size that no owner can claim (not in the
 *      scene, the context graph or the ledger): a 128 x 64 RGBA8 texture (32,768 B), a 96 x 32 RGBA8 texture attached to a
 *      framebuffer (12,288 B of render target) and a 250-float buffer (1,000 B). The attribution must put exactly those
 *      bytes in its unattributed row, so "every render target attributed" reads FALSE while they live, then back to its
 *      value before when they are deleted;
 *  (2) the census's own per-call allocation: 'warm' x 3 wrapped calls (framebufferTexture2D, texImage2D 4 x 4,
 *      generateMipmap; plus the native activeTexture / bindTexture between them) to let V8 optimise the wrappers, then a
 *      sampled window over 'n' more iterations; the bytes under __glCensusWrapped / calls. POSITIVE CONTROL: the same
 *      calls through a wrapper written the round-3 way (a rest array and a string key per call), under its own name.
 */
const CENSUS_PROBE = (phase, warm = 12000, n = 20000) => `(async () => {
  const C = window.__glCensus, cfg = window.__w0bAttrCfg;
  if (${JSON.stringify(phase)} === 'orphans') {
    const cv = new OffscreenCanvas(8, 8);
    const gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false });
    if (!gl) return { ok: false, why: 'no scratch WebGL2 context' };
    const un = (a) => ({ textures: a.unattributed.textures.bytes, renderTargets: a.unattributed.renderTargets.bytes, buffers: a.unattributed.buffers.bytes });
    const u0 = un(C.attribute(cfg));
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 128, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const rtTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, rtTex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 96, 32);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtTex, 0);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(250), gl.STATIC_DRAW);
    const a1 = C.attribute(cfg), u1 = un(a1);
    const seen = { textures: u1.textures - u0.textures, renderTargets: u1.renderTargets - u0.renderTargets, buffers: u1.buffers - u0.buffers };
    const everyRenderTargetAttributedWouldPass = a1.unattributed.renderTargets.bytes === 0 && a1.rtMismatches.length === 0;
    const everyByteAttributedWouldPass = a1.unattributed.textures.bytes + a1.unattributed.renderTargets.bytes + a1.unattributed.buffers.bytes === 0;
    gl.deleteFramebuffer(fb); gl.deleteTexture(tex); gl.deleteTexture(rtTex); gl.deleteBuffer(buf);
    const u2 = un(C.attribute(cfg));
    const back = { textures: u2.textures - u0.textures, renderTargets: u2.renderTargets - u0.renderTargets, buffers: u2.buffers - u0.buffers };
    const exp = { textures: 128 * 64 * 4, renderTargets: 96 * 32 * 4, buffers: 250 * 4 };
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    const ok = seen.textures === exp.textures && seen.renderTargets === exp.renderTargets && seen.buffers === exp.buffers && back.textures === 0 && back.renderTargets === 0 && back.buffers === 0 && !everyRenderTargetAttributedWouldPass && !everyByteAttributedWouldPass;
    return { ok, expectedUnattributedBytes: exp, unattributedDelta: seen, afterDelete: back, everyRenderTargetAttributedWouldPass, everyByteAttributedWouldPass };
  }
  if (${JSON.stringify(phase)} === 'setup') {
    const cv = new OffscreenCanvas(8, 8);
    const gl = cv.getContext('webgl2', { antialias: false, depth: false, stencil: false });
    if (!gl) return { ok: false, why: 'no scratch WebGL2 context' };
    const T = gl.TEXTURE_2D, FBT = gl.FRAMEBUFFER, CA0 = gl.COLOR_ATTACHMENT0, RGBA8 = gl.RGBA8, RGBA = gl.RGBA, UB = gl.UNSIGNED_BYTE, U0 = gl.TEXTURE0;
    const px = new Uint8Array(64);
    const rtTex = gl.createTexture(); gl.bindTexture(T, rtTex); gl.texStorage2D(T, 1, RGBA8, 4, 4);
    const tex = gl.createTexture();
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(FBT, fb);
    // the round-3 wrapper shape (positive control of the probe): a rest array and a string key per call, on THIS context only
    const keys = new Map();
    const round3 = (real) => function __glCensusRound3Shape(...a) { const out = real.apply(this, a); keys.set(a[0] + ':' + a[1], a); return out; };
    const r3 = { fbt: round3(gl.framebufferTexture2D), tex: round3(gl.texImage2D), mip: round3(gl.generateMipmap) };
    const census = (k) => { for (let i = 0; i < k; i++) { gl.activeTexture(U0); gl.bindTexture(T, tex); gl.framebufferTexture2D(FBT, CA0, T, rtTex, 0); gl.texImage2D(T, 0, RGBA8, 4, 4, 0, RGBA, UB, px); gl.generateMipmap(T); } return k * 3; };
    const control = (k) => { for (let i = 0; i < k; i++) { gl.activeTexture(U0); gl.bindTexture(T, tex); r3.fbt.call(gl, FBT, CA0, T, rtTex, 0); r3.tex.call(gl, T, 0, RGBA8, 4, 4, 0, RGBA, UB, px); r3.mip.call(gl, T); } return k * 3; };
    window.__w0bProbe = { gl, census, control, dispose: () => { keys.clear(); gl.deleteFramebuffer(fb); gl.deleteTexture(tex); gl.deleteTexture(rtTex); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } };
    census(${warm}); control(${warm}); gl.finish();
    return { ok: true, warmIterations: ${warm} };
  }
  if (${JSON.stringify(phase)} === 'census') { const c = window.__w0bProbe.census(${n}); window.__w0bProbe.gl.finish(); return c; }
  if (${JSON.stringify(phase)} === 'control') { const c = window.__w0bProbe.control(${n}); window.__w0bProbe.gl.finish(); return c; }
  if (${JSON.stringify(phase)} === 'dispose') { if (window.__w0bProbe) window.__w0bProbe.dispose(); window.__w0bProbe = null; return true; }
  return null;
})()`;
/** bytes a sampling heap profile holds under every frame named `fnName` (the frame and everything it called) */
function bytesUnder(profile, fnName) {
  let total = 0;
  const sub = (n) => (n.selfSize || 0) + (n.children || []).reduce((a, c) => a + sub(c), 0);
  const walk = (n) => { if ((n.callFrame || {}).functionName === fnName) { total += sub(n); return; } for (const c of n.children || []) walk(c); };
  walk(profile.head);
  return total;
}
async function censusPerCallAllocation(page, cdp) {
  const setup = await page.evaluate(CENSUS_PROBE('setup'));
  if (!setup?.ok) return { ok: false, setup };
  const measure = async (phase, fnName) => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const calls = await page.evaluate(CENSUS_PROBE(phase));
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const bytes = bytesUnder(profile, fnName);
    return { calls, bytes, bytesPerCall: calls ? +(bytes / calls).toFixed(3) : null };
  };
  try {
    // three measured windows each (the median graded): one window can catch a tier-up or deopt of the wrapper in a page that
    // shares its renderer with the harness's other pages (the lane block's first run read 1.4 B per call in one window, the
    // fresh-Chrome dev run 0 B)
    const windows = async (phase, fn) => { const w = []; for (let i = 0; i < 3; i++) w.push(await measure(phase, fn)); const med = w.map((x) => x.bytesPerCall).sort((x, y) => x - y)[1]; return { windows: w, medianBytesPerCall: med }; };
    const census = await windows('census', '__glCensusWrapped');
    const control = await windows('control', '__glCensusRound3Shape');
    // graded: < 1 B per wrapped call once warm (median of 3 windows); the probe's positive control must see >= 8 B per call
    // in the round-3 shape
    const ok = census.medianBytesPerCall != null && census.medianBytesPerCall < 1 && control.medianBytesPerCall != null && control.medianBytesPerCall >= 8;
    return { ok, warmIterations: setup.warmIterations, census: { ...census, bytesPerCall: census.medianBytesPerCall }, round3ShapeControl: { ...control, bytesPerCall: control.medianBytesPerCall }, samplingIntervalB: 256,
      note: 'bytes under the wrapper frame (sampling heap profiler, objects collected by GC included) / wrapped calls, after the wrappers ran warm, median of 3 windows; a wrapper running unoptimised (its first calls) still materialises an arguments object, which is why the per-frame number in the fight (censusInTheFight) is the memory-rule reading' };
  } finally { await page.evaluate(CENSUS_PROBE('dispose')).catch(() => {}); }
}

async function vramLedger({ PORT }) {
  const B = W0B_BUDGETS.vram;
  const binding = barsBinding(PORT);
  return onPage(PORT, async ({ page, cdp }) => {
    const installed = await page.evaluate('!!window.__glCensus');
    if (!installed) return { pass: false, detail: { verdict: 'FAIL: the GL census did not install before the game made its context' } };
    const fight = await page.evaluate(STAGE_FIGHT);
    if (fight.skip) return { pass: null, detail: { verdict: fight.skip.split(':')[0] + ': the staged fight has no cast — ' + fight.skip } };
    await page.evaluate(`(async () => { ${FRAMES} await __frames(90); return true; })()`);
    // THE CENSUS IN THE FIGHT (targeted fix round 1; engineering judge: the wrappers allocated on every WebGL call): over
    // 180 frames of the staged fight, the wrapped calls the game makes and the bytes the sampling profiler (256 B interval,
    // collected objects included) finds under the wrapper frames: the census's own per-frame work and allocation in the
    // measured scene
    let inFight = null;
    try {
      const c0 = await page.evaluate('[window.__glCensus.calls(), __CTX__.engine.frames]');
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await page.evaluate(`(async () => { ${FRAMES} await __frames(180); return true; })()`);
      const { profile: fp } = await cdp.send('HeapProfiler.stopSampling');
      const c1 = await page.evaluate('[window.__glCensus.calls(), __CTX__.engine.frames]');
      const frames = c1[1] - c0[1], wrappedCalls = c1[0] - c0[0], bytes = bytesUnder(fp, '__glCensusWrapped');
      inFight = { frames, wrappedCalls, callsPerFrame: frames ? +(wrappedCalls / frames).toFixed(3) : null, bytesUnderWrapper: bytes, bytesPerFrame: frames ? +(bytes / frames).toFixed(2) : null, samplingIntervalB: 256 };
    } catch (err) { inFight = { error: String(err.message || err).slice(0, 160) }; }
    const attrCfg = ATTR_CFG();
    await page.evaluate(`(() => { window.__w0bAttrCfg = ${JSON.stringify(attrCfg)}; return true; })()`);
    const census = await page.evaluate('window.__glCensus.summary()');
    const attr = await page.evaluate('window.__glCensus.attribute(window.__w0bAttrCfg)');
    const cross = await page.evaluate(`(() => { const e = __CTX__.engine, r = e.renderer;
      let ledger = null; try { const L = e.renderTargetLedger ? e.renderTargetLedger() : null; ledger = L ? { totalBytes: L.totalBytes ?? (L.rows || []).reduce((a, x) => a + (x.allocated ? (x.bytes || 0) : 0), 0), rows: (L.rows || []).length } : null; } catch (err) { ledger = { error: String(err).slice(0, 120) }; }
      return { infoTextures: r.info.memory.textures, infoGeometries: r.info.memory.geometries, engineRtLedger: ledger }; })()`);
    // THE SELF-TEST: known objects in, exact bytes seen and attributed, disposed back to the byte
    let control;
    try { control = await page.evaluate(VRAM_CONTROL); } catch (err) { control = { ok: false, error: String(err.message || err).slice(0, 200) }; }
    // targeted fix round 1: the orphan NEGATIVE control and the census's per-call allocation, on a scratch context
    let orphans, perCall;
    try { orphans = await page.evaluate(CENSUS_PROBE('orphans')); } catch (err) { orphans = { ok: false, error: String(err.message || err).slice(0, 200) }; }
    try { perCall = await censusPerCallAllocation(page, cdp); } catch (err) { perCall = { ok: false, error: String(err.message || err).slice(0, 200) }; }
    await page.evaluate('(() => { window.__w0bAttrCfg = null; return true; })()');
    await page.evaluate(UNSTAGE);
    const tex = census.textures.bytes, rt = census.renderTargets.bytes, geo = census.buffers.bytes, sum = tex + rt + geo;
    const rtLedgerTotal = Object.values(RT_LEDGER.rows).reduce((a, b) => a + b, 0);
    const un = attr.unattributed;
    const unTotal = un.textures.bytes + un.renderTargets.bytes + un.buffers.bytes;
    // the unregistered scene roots: attributed to a named root, but to no lane (counted with the unattributed for the lane split)
    const unregistered = attr.owners.filter((o) => /^unregistered scene root/.test(o.owner));
    // ROUTING (R48 b): every ledger row that holds bytes, with the source line(s) that create its target
    const rtRouting = attr.ledgerRows.filter((x) => x.glBytes > 0).sort((a, b) => b.glBytes - a.glBytes).map((x) => ({ owner: x.owner, MB: MB(x.glBytes), ...routeRt(x.owner) }));
    const routedOk = (rows) => rows.length > 0 && rows.every((x) => x.fileLines.length > 0);
    const sawScene = (c) => c.textures.count > 0 && c.buffers.count > 0 && c.renderTargets.count > 0;
    const knownOk = (c) => !!c && c.checks && Object.values(c.checks).every(Boolean);
    // NEGATIVE CONTROLS: each criterion fed an input it must reject
    const negatives = [
      neg('censusSawTheScene', 'an empty census', sawScene({ textures: { count: 0 }, buffers: { count: 0 }, renderTargets: { count: 0 } })),
      neg('everyRenderTargetAttributed', 'live orphan GL objects of known size on a scratch context (seen to the byte in the unattributed row)', orphans?.ok !== true || orphans.everyRenderTargetAttributedWouldPass),
      neg('everyByteAttributed', 'the same live orphans (texture, render target, buffer)', orphans?.ok !== true || orphans.everyByteAttributedWouldPass),
      neg('selfTestKnownObjectsSeenAttributedAndDisposed', 'the control readings against a target 1 B larger than created', knownOk({ checks: { ...(control?.checks || {}), censusSawTheTargetExactly: control?.censusDelta?.renderTargets === (control?.expectedBytes?.renderTargets ?? 0) + 1 } })),
      neg('everyOverBarRowRoutedWithFileLine', 'the ledger rows resolved against an engine.js without the creating lines', routedOk(attr.ledgerRows.filter((x) => x.glBytes > 0).map((x) => ({ fileLines: routeRt(x.owner, { [ENGINE]: ['// no anchors'], [ENVIRONMENT]: ['// no anchors'] }).fileLines })))),
      neg('censusAllocatesNothingPerCall', 'the round-3 wrapper shape (rest array + string key per call)', !!perCall?.round3ShapeControl && perCall.round3ShapeControl.bytesPerCall < 1),
    ];
    const instrument = {
      censusSawTheScene: sawScene(census),
      everyRenderTargetAttributed: un.renderTargets.bytes === 0 && attr.rtMismatches.length === 0,
      everyByteAttributed: unTotal === 0,
      selfTestKnownObjectsSeenAttributedAndDisposed: !!control?.ok,
      selfTestOrphansLandInTheUnattributedRow: !!orphans?.ok,
      censusAllocatesNothingPerCall: !!perCall?.ok,
      everyOverBarRowRoutedWithFileLine: rt <= B.renderTargetsB || routedOk(rtRouting),
      negativeControlsEachFail: negatives.every((n) => n.ok),
    };
    // structural notes (not graded: true by construction of attribute(), each object claimed once or listed unattributed)
    const structural = { attributedPlusUnattributedEqualsCensus: attr.accountingExact, censusTotalsEqualSummary: attr.totals.textures === tex && attr.totals.renderTargets === rt && attr.totals.buffers === geo };
    const bars = {
      texturesWithinBudget: { binding, barMB: 160, MB: MB(tex), pass: tex <= B.texturesB },
      renderTargetsWithinRtLedgerCap: { binding, barMB: 170, MB: MB(rt), pass: rt <= B.renderTargetsB },
      geometryWithinBudget: { binding, barMB: 120, MB: MB(geo), pass: geo <= B.geometryB },
      totalWithinBudget: { binding, barMB: 450, MB: MB(sum), pass: sum <= B.totalB },
    };
    const instrumentOk = Object.values(instrument).every(Boolean);
    const barsOk = Object.values(bars).every((b) => !b.binding || b.pass);
    const pass = instrumentOk && barsOk;
    // ROUTING: each over-bar category, its owners by bytes (the R48 b "each over-bar owner routed")
    const route = (cat) => attr.owners.filter((o) => o[cat] > 0).sort((a, b) => b[cat] - a[cat]).slice(0, 12).map((o) => ({ owner: o.owner, lane: o.lane, MB: MB(o[cat]) }));
    const overBar = Object.entries(bars).filter(([, b]) => !b.pass).map(([k]) => k);
    const routing = {
      renderTargets: route('renderTargets'), textures: route('textures'), buffers: route('buffers'),
      renderTargetRows: rtRouting,
      textureOwnersFirstUpload: attr.owners.filter((o) => o.textures > 0).sort((a, b) => b.textures - a.textures).slice(0, 8).map((o) => ({ owner: o.owner, MB: MB(o.textures), firstUploadFrame: o.hint || null })),
      bufferOwnersFirstUpload: attr.owners.filter((o) => o.buffers > 0).sort((a, b) => b.buffers - a.buffers).slice(0, 8).map((o) => ({ owner: o.owner, MB: MB(o.buffers), firstUploadFrame: o.hint || null })),
    };
    const lanes = {};
    for (const o of attr.owners) { const l = /^unregistered/.test(o.owner) ? 'UNREGISTERED scene roots' : o.lane; lanes[l] = r2((lanes[l] || 0) + o.total / 1e6); }
    lanes.UNATTRIBUTED = MB(unTotal);
    return { pass, detail: {
      verdict: (pass ? 'PASS' : 'FAIL: ' + [...Object.keys(instrument).filter((k) => !instrument[k]), ...Object.entries(bars).filter(([, b]) => b.binding && !b.pass).map(([k]) => 'bar ' + k)].join(', '))
        + ` — INSTRUMENT (R48 b): ${instrumentOk ? 'PASS' : 'FAIL'} (control: target ${control?.censusDelta?.renderTargets ?? '?'} B of ${control?.expectedBytes?.renderTargets ?? '?'}, texture ${control?.censusDelta?.textures ?? '?'} of ${control?.expectedBytes?.textures ?? '?'}, buffers ${control?.censusDelta?.buffers ?? '?'} of ${control?.expectedBytes?.buffers ?? '?'}, disposed back ${JSON.stringify(control?.afterDispose || null)}; render targets attributed ${MB(attr.attributed.renderTargets)} of ${MB(rt)} MB to ${attr.ledgerRows.length} ledger rows; unattributed ${MB(un.textures.bytes)} MB textures, ${MB(un.buffers.bytes)} MB buffers, ${MB(un.renderTargets.bytes)} MB targets; unregistered scene roots ${MB(unregistered.reduce((a, o) => a + o.total, 0))} MB) — `
        + `BARS (${binding ? 'binding: global run' : 'lane run: graded at the orchestrator\'s 5270 global run after the engine-gpu merge, R48 b'}): `
        + `textures ${MB(tex)} MB (bar 160) ${bars.texturesWithinBudget.pass ? 'pass' : 'FAIL'}, render targets ${MB(rt)} MB (bar 170) ${bars.renderTargetsWithinRtLedgerCap.pass ? 'pass' : 'FAIL'}, geometry ${MB(geo)} MB (bar 120) ${bars.geometryWithinBudget.pass ? 'pass' : 'FAIL'}, total ${MB(sum)} MB (bar 450) ${bars.totalWithinBudget.pass ? 'pass' : 'FAIL'}`
        + ` at pixel ratio ${fight.appliedPixelRatio} (tier ${fight.quality}, drawing buffer ${fight.drawingBuffer.join('x')}); engine-gpu's recorded RT ledger (${RT_LEDGER.measured}) totals ${MB(rtLedgerTotal)} MB`
        + (overBar.length ? ' — over-bar routing: ' + overBar.map((k) => k + ' -> ' + (k.startsWith('render') || k.startsWith('total') ? rtRouting.slice(0, 5).map((x) => x.owner + ' ' + x.MB + ' MB @ ' + x.fileLines.join(' + ')).join('; ') : k.startsWith('textures') ? routing.textureOwnersFirstUpload.slice(0, 3).map((x) => x.owner + ' ' + x.MB + ' @ ' + x.firstUploadFrame).join('; ') : routing.bufferOwnersFirstUpload.slice(0, 3).map((x) => x.owner + ' ' + x.MB + ' @ ' + x.firstUploadFrame).join('; '))).join(' | ') : '')
        + ` — census per wrapped call ${perCall?.census?.bytesPerCall ?? '?'} B (round-3 shape ${perCall?.round3ShapeControl?.bytesPerCall ?? '?'} B); in the fight ${inFight?.callsPerFrame ?? '?'} wrapped calls/frame and ${inFight?.bytesPerFrame ?? '?'} B/frame under the wrappers over ${inFight?.frames ?? '?'} frames; unattributed ${unTotal} B; attributed by first-upload call site ${attr.owners.filter((o) => /^first upload under/.test(o.owner)).map((o) => o.owner.slice(19) + ' ' + o.total + ' B').join(', ') || 'none'}; orphan control ${orphans?.ok ? 'seen to the byte in unattributed and gone after delete' : 'FAILED ' + JSON.stringify(orphans || null).slice(0, 160)}; negative controls ${negatives.filter((n) => n.ok).length}/${negatives.length} fail as they must`,
      instrument, structural, bars, runId: runIdOf(PORT), barsBinding: binding, overBar, routing, byLaneMB: lanes,
      sealing: 'R48 (b): the harness seals every run that executes this row (tools/gates.r5.gates-perf.mjs INSTRUMENT_IDS); verify with node tools/gates.r5.gates-perf.mjs --instruments --port <port>',
      checks: { ...instrument, ...Object.fromEntries(Object.entries(bars).map(([k, b]) => ['bar:' + k, b.pass])) }, budgetMB: { textures: 160, renderTargets: 170, geometry: 120, total: 450 },
      measuredMB: { textures: MB(tex), renderTargets: MB(rt), geometry: MB(geo), total: MB(sum) },
      attribution: { owners: attr.owners.map((o) => ({ owner: o.owner, lane: o.lane, how: o.how, objects: o.objects, texturesMB: MB(o.textures), renderTargetsMB: MB(o.renderTargets), buffersMB: MB(o.buffers), totalB: o.total })),
        unattributed: { textures: { ...un.textures, MB: MB(un.textures.bytes) }, renderTargets: { ...un.renderTargets, MB: MB(un.renderTargets.bytes) }, buffers: { ...un.buffers, MB: MB(un.buffers.bytes) } },
        accountingExact: attr.accountingExact, totals: attr.totals, attributed: attr.attributed, ledgerRows: attr.ledgerRows, rtMismatches: attr.rtMismatches, sceneRoots: attr.sceneRoots, graphVisited: attr.graphVisited },
      selfTest: { ...control, orphans, censusPerCallAllocation: perCall, censusInTheFight: inFight, negatives },
      census: { ...census, textures: { ...census.textures, MB: MB(tex) }, renderTargets: { ...census.renderTargets, MB: MB(rt) }, buffers: { ...census.buffers, MB: MB(geo) } },
      crossCheck: { ...cross, censusTextureObjects: census.textures.count + census.renderTargets.textures, rtLedgerRecordedMB: MB(rtLedgerTotal), rtLedgerRecordedAt: RT_LEDGER.measured },
      fight,
      method: 'every texImage2D/3D, texStorage2D/3D, compressedTexImage, copyTexImage2D, generateMipmap, renderbufferStorage(Multisample) and bufferData call on WebGL2 since before the game made its context, minus deleteTexture/Renderbuffer/Buffer; a texture ever attached to a framebuffer (and every renderbuffer) is a render target; bytes = width x height x depth x bytes-per-texel of the sized internal format (engine-gpu A-rt-ledger-census table: RGB as 4 channels, DEPTH_COMPONENT24 = 4 B) x samples, every level and face; buffers = their bufferData size. Attribution: engine.renderTargetLedger() rows claim their framebuffer attachments; scene roots claim their subtrees\' textures and buffers (a buffer is matched by the typed array it was filled from); a bounded walk of the context graph claims what is held off-scene; the rest is listed unattributed with its first upload\'s src frames',
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
    // W0b fix round 2 (R28 + R34): the carried A90 row's re-staged pick, a STAGED kind's machine (memVictim)
    const m = await memVictim();
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
/**
 * Wait until the GPU process's footprint stops moving (the last `n` readings within `tolMB`), at most `maxS` seconds, then
 * return the median of 5 readings (targeted fix round 1: in the lane block the row shares the harness's Chrome, whose GPU
 * process was still releasing the earlier rows' pages while the baseline was read: 244 -> 225 -> 253 -> 180 MB). The trace
 * is reported.
 */
async function settledFootprint(browser, { n = 3, tolMB = 4, maxS = 45 } = {}) {
  const t0 = Date.now(), trace = [];
  for (;;) {
    const g = await gpuProcess(browser);
    if (g.found && g.footprintB != null) trace.push(MB(g.footprintB));
    const last = trace.slice(-n);
    const settled = last.length === n && Math.max(...last) - Math.min(...last) <= tolMB;
    if (settled || Date.now() - t0 > maxS * 1000) {
      const m = await footprintMedian(browser);
      return { ...m, settled, settleS: r1((Date.now() - t0) / 1000), settleTraceMB: trace.slice(-12) };
    }
    await sleep(1000);
  }
}
/** the median of n footprint readings `gapMs` apart (the fight keeps drawing; one reading is noisy) */
async function footprintMedian(browser, n = 5, gapMs = 700) {
  const v = [];
  for (let i = 0; i < n; i++) { const g = await gpuProcess(browser); if (g.found && g.footprintB != null) v.push(g.footprintB); if (i < n - 1) await sleep(gapMs); }
  v.sort((a, b) => a - b);
  return { medianB: v.length ? v[(v.length - 1) >> 1] : null, readings: v.map(MB), spreadMB: v.length ? MB(v[v.length - 1] - v[0]) : null };
}

/**
 * POSITIVE CONTROLS (R48 b "self-tests passing") for A90-abs's two instruments, each a KNOWN delta on the live page:
 *   - JS heap: 128 arrays of 65,536 small integers are retained (33.56 MB: JSArray + FixedArray of compressed tagged
 *     slots, computed exactly) -> the post-GC used heap (Runtime.getHeapUsage after two forced GCs) must rise by that
 *     within 5 %, and fall back when they are released;
 *   - GPU process: with the world held (ctx.state pinned: nothing streams), a 4096 x 4096 RGBA8 render target
 *     (67,108,864 B, one level, no depth) is allocated through three and cleared, then disposed, GPU_CONTROL_CYCLES times;
 *     the GPU process's macOS footprint (median of 5 readings at each step) is read before, held and after each cycle.
 *     Graded on the medians over the cycles: the rise is 0.75-1.6 x the allocation (a Metal surface is page-aligned and the
 *     driver may keep a resolve or clear copy; the footprint is a process-wide reading) AND (targeted fix round 1,
 *     engineering judge: one reading of 1.485 x passed) the fall after dispose is 0.75-1.25 x the rise, so a reading that
 *     rose for some other reason than the control, or a driver that never frees it, fails.
 */
// 128 arrays of 65,536 small integers: each a JSArray (16 B) + a FixedArray of 65,536 compressed tagged slots (8 + 4 x 65,536 B);
// String.prototype.repeat is NOT used: V8 builds it as a rope of cons cells (the first dev run read a 0.001 x rise)
const HEAP_CONTROL_N = 128, HEAP_CONTROL_LEN = 65536, HEAP_CONTROL_BYTES = HEAP_CONTROL_N * (16 + 8 + 4 * HEAP_CONTROL_LEN);
const HEAP_CONTROL_HOLD = `(() => { const keep = new Array(${HEAP_CONTROL_N}); for (let k = 0; k < ${HEAP_CONTROL_N}; k++) { const a = new Array(${HEAP_CONTROL_LEN}); for (let i = 0; i < ${HEAP_CONTROL_LEN}; i++) a[i] = i; keep[k] = a; } window.__w0bHeapCtl = keep; return keep.length; })()`;
const GPU_CONTROL_CYCLES = 3, GPU_RISE_BAND = [0.75, 1.6], GPU_FALL_BAND = [0.75, 1.25];
const GPU_CONTROL = (phase) => `(async () => {
  ${FRAMES}
  const ctx = __CTX__, e = ctx.engine, r = e.renderer;
  if (${JSON.stringify(phase)} === 'pin') { window.__w0bState0 = ctx.state; ctx.state = 'gate-pinned'; await __frames(30); return { held: ctx.state === 'gate-pinned' }; }
  if (${JSON.stringify(phase)} === 'alloc') {
    const url = performance.getEntriesByType('resource').map((x) => x.name).find((n) => /\\/node_modules\\/\\.vite\\/deps\\/three\\.js/.test(n));
    if (!url) return { ok: false, why: 'three dependency bundle not found among the page resources' };
    const T = await import(url);
    const rt = new T.WebGLRenderTarget(4096, 4096, { type: T.UnsignedByteType, depthBuffer: false, stencilBuffer: false, samples: 0 });
    e.registerRenderTarget('gates-perf:a90abs-control', rt);
    const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.clear(); r.setRenderTarget(prev);
    const gl = r.getContext(); const px = new Uint8Array(4);
    r.setRenderTarget(rt); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); r.setRenderTarget(prev);   // forces the allocation to complete
    window.__w0bGpuCtl = rt; await __frames(10);
    return { ok: true, bytes: 4096 * 4096 * 4 };
  }
  if (${JSON.stringify(phase)} === 'free') { const rt = window.__w0bGpuCtl; if (rt) { e.unregisterRenderTarget(rt); rt.dispose(); } window.__w0bGpuCtl = null; await __frames(10); return { ok: true }; }
  if (${JSON.stringify(phase)} === 'unpin') { ctx.state = window.__w0bState0; window.__w0bState0 = undefined; return { ok: true }; }
  return null;
})()`;
const median = (v) => { const a = v.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[(a.length - 1) >> 1] : null; };
/** the GPU control's grading, pure (its negative controls feed it readings it must reject) */
function gpuControlGrade(cycles, expectedB) {
  const rise = median(cycles.map((c) => c.riseB)), fall = median(cycles.map((c) => c.fallB));
  const riseRatio = rise != null && expectedB ? rise / expectedB : null;
  const fallOverRise = rise ? (fall != null ? fall / rise : null) : null;
  const ok = riseRatio != null && riseRatio >= GPU_RISE_BAND[0] && riseRatio <= GPU_RISE_BAND[1] && fallOverRise != null && fallOverRise >= GPU_FALL_BAND[0] && fallOverRise <= GPU_FALL_BAND[1];
  return { ok, riseB: rise, fallB: fall, ratio: riseRatio == null ? null : +riseRatio.toFixed(3), fallOverRise: fallOverRise == null ? null : +fallOverRise.toFixed(3) };
}
const heapControlGrade = (riseB, fallB, expectedB) => ({ ok: Math.abs(riseB / expectedB - 1) <= 0.05 && fallB / expectedB >= 0.95, ratio: +(riseB / expectedB).toFixed(4) });

/**
 * THE GPU-PROCESS BASELINE (targeted fix round 1; engineering judge: A90-abs filed ~57 % of the footprint under an
 * unmeasured "browser" remainder hard-coded exact). Read in THIS Chrome before the game page exists:
 *   blank   a page of the game's origin with no game and no canvas (CDP Fetch serves an empty document at
 *           GPU_BASELINE_PATH): the GPU process with no WebGL context of this row = the browser's own share (plus
 *           whatever earlier pages of this Chrome left cached in it);
 *   tiny    the same page with ONE bare WebGL2 canvas at 16 x 9, the game's context attributes, drawn 30 frames: the
 *           context's fixed cost (ANGLE / Metal device, command buffers, the first context's runtime);
 *   full    that canvas resized to the staged fight's drawing buffer (the engine module's own tier table, as STAGE_FIGHT
 *           applies it: min(BUDGETS.deviceDpr, tier.dprCap) x 1600 x 900), drawn 30 frames: + the default framebuffer at
 *           its REAL size, buffer count, samples and depth (full - tiny, per pixel).
 * The canvas's context is then lost and the page closed, and the game boots.
 */
const GPU_BASELINE_PATH = '/__gates-perf-gpu-baseline__.html';
// the game's context as getContextAttributes() reports it: engine.js asks three for antialias false, stencil false and
// high-performance; three's WebGLRenderer creates every context with alpha: true (its `alpha` option only sets the clear
// alpha). The split's bareContextHadTheGameAttributes check compares the two, so a drift fails the split (the first dev run
// had alpha: false here, and it did)
const GAME_CONTEXT_ATTRS = { alpha: true, depth: true, stencil: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
async function gpuBaseline(browser, PORT) {
  const page = await browser.newPage();
  let closed = false;
  try {
    const cdp = await page.createCDPSession();
    const body = Buffer.from('<!doctype html><meta charset="utf-8"><title>gates-perf GPU baseline</title><body style="margin:0;background:#000"></body>').toString('base64');
    const onPaused = (ev) => { cdp.send('Fetch.fulfillRequest', { requestId: ev.requestId, responseCode: 200, body, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }, { name: 'Cache-Control', value: 'no-store' }] }).catch(() => {}); };
    cdp.on('Fetch.requestPaused', onPaused);
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*__gates-perf-gpu-baseline__*', requestStage: 'Request' }] });
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`http://localhost:${PORT}${GPU_BASELINE_PATH}`, { waitUntil: 'load', timeout: 30000 });
    cdp.off('Fetch.requestPaused', onPaused); await cdp.send('Fetch.disable').catch(() => {});
    // PRIME (lane block, Oct 30 07:05Z: in the harness's shared Chrome the GPU process dropped 37 MB of the earlier rows'
    // residue the moment a new context was made, so the context's fixed cost read -36.7 MB): one throwaway WebGL2 context of
    // the game's attributes is made, drawn, lost and removed BEFORE the blank reading, so what a new context purges is purged
    // before the baseline is read
    await page.evaluate(`(async () => { const c = document.createElement('canvas'); c.width = 16; c.height = 9; document.body.appendChild(c);
      const gl = c.getContext('webgl2', ${JSON.stringify(GAME_CONTEXT_ATTRS)}); if (!gl) return false;
      await new Promise((res) => { let k = 0; const f = () => { gl.clear(gl.COLOR_BUFFER_BIT); if (++k >= 10) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); c.remove(); return true; })()`);
    await sleep(1500);
    const blank = await settledFootprint(browser);
    const plan = await page.evaluate(`(async () => { const m = await import('/src/core/engine.js'); const q = m.DEFAULT_TIER || 'high'; const t = m.QUALITY_TIERS && m.QUALITY_TIERS[q];
      const pr = Math.min(${BUDGETS.deviceDpr}, t ? t.dprCap : 1); return { quality: q, dprCap: t ? t.dprCap : null, pixelRatio: pr, width: Math.floor(1600 * pr), height: Math.floor(900 * pr) }; })()`);
    const attrs = await page.evaluate(`(async () => {
      const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:900px;display:block'; c.width = 16; c.height = 9; document.body.appendChild(c);
      const gl = c.getContext('webgl2', ${JSON.stringify(GAME_CONTEXT_ATTRS)}); if (!gl) return null;
      const draw = (n) => new Promise((res) => { let k = 0; const f = () => { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.clearColor(0.2, 0.3, 0.4, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      window.__w0bBare = { c, gl, draw }; await draw(30); return gl.getContextAttributes(); })()`);
    if (!attrs) return { ok: false, why: 'no bare WebGL2 context', blank };
    await sleep(1000);
    const tiny = await settledFootprint(browser);
    const size = await page.evaluate(`(async () => { const b = window.__w0bBare; b.c.width = ${plan.width}; b.c.height = ${plan.height}; await b.draw(30); return [b.gl.drawingBufferWidth, b.gl.drawingBufferHeight]; })()`);
    await sleep(1000);
    const full = await settledFootprint(browser);
    await page.evaluate(`(() => { const b = window.__w0bBare; const x = b.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); b.c.remove(); window.__w0bBare = null; return true; })()`);
    // after the probe's page is gone (diagnostic, not a bucket): what the GPU process still holds of the probe. The ANGLE /
    // Metal device state a first context creates is kept by the GPU process and SHARED by the game's context, so this is
    // reported, never subtracted a second time
    await withTimeout(page.close(), 15000, 'baseline page.close').catch(() => {}); closed = true;
    await sleep(2000);
    const afterClose = await footprintMedian(browser, 3, 600);
    return { ok: blank.medianB != null && tiny.medianB != null && full.medianB != null, blank, tiny, full, afterClose, plan, bareSize: size, tinySize: [16, 9], attrs,
      probeResidueMB: afterClose.medianB != null && blank.medianB != null ? MB(afterClose.medianB - blank.medianB) : null,
      method: 'GPU-process footprint (settled, then the median of 5 macOS footprint readings) on an empty page of the game origin after one throwaway context was made and lost (the prime), then with one bare WebGL2 canvas of the game\'s context attributes at 16 x 9 and at the fight\'s drawing-buffer size, 30 frames drawn each; read before the game page exists; the reading after the probe page closed is reported' };
  } catch (err) { return { ok: false, error: String(err.message || err).slice(0, 200) }; }
  finally { if (!closed) await withTimeout(page.close(), 15000, 'baseline page.close').catch(() => {}); }
}

/** routing for the game-driven GPU memory outside the census (engine-gpu): the engine.js lines that drive it */
const REMAINDER_ROUTES = [
  [ENGINE, /new THREE\.WebGLRenderer\(/, 'the game\'s WebGL context (ANGLE / Metal resources per context: command buffers, staging and conversion copies)'],
  [ENGINE, /this\.renderer\.compile\(/, 'the programs compiled at warm-up (Metal pipeline states and shader caches, per program x render-pass format)'],
  [ENGINE, /samples:\s*this\.tier\.msaa/, 'the MSAA scene target (Metal MSAA textures and their implicit resolve)'],
];
function routeRemainder(files) {
  const rows = REMAINDER_ROUTES.map(([f, re, what]) => ({ fileLine: lineOf(f, re, files), what })).filter((x) => x.fileLine);
  const t = tierLine(files);
  if (t && rows.length) rows.push({ fileLine: t, what: 'the drawing-buffer size every render-target-proportional cost scales with' });
  return rows;
}
const SPLIT_TOLERANCE_B = 32e6;   // a negative remainder beyond this means the buckets do not add up: the split fails
/**
 * THE FOOTPRINT SPLIT, graded against MEASURED buckets only (pure: its negative controls feed it inputs it must reject):
 *   browser baseline      = blank (measured)
 *   WebGL context + swap  = full - blank (measured: context fixed cost tiny - blank, default framebuffer full - tiny)
 *   GL census             = the census bytes by owner lane (A-vram-ledger's census, installed before the context)
 *   game-driven, outside the census = footprint - the three above, routed to engine-gpu with engine.js file:line
 * Checks: every bucket measured; the bare context was the game's drawing-buffer size; no bucket negative and the
 * remainder not below -SPLIT_TOLERANCE_B; the remainder routed with file:line.
 */
const ATTR_KEYS = ['alpha', 'depth', 'stencil', 'antialias', 'premultipliedAlpha', 'preserveDrawingBuffer'];
function splitFootprint({ footprintB, base, gameSize, gameAttrs, glBytes, routing }) {
  const blankB = base?.blank?.medianB ?? null, tinyB = base?.tiny?.medianB ?? null, fullB = base?.full?.medianB ?? null;
  const measured = [footprintB, blankB, tinyB, fullB, glBytes].every((x) => x != null && Number.isFinite(x));
  const sameSize = !!base?.bareSize && !!gameSize && base.bareSize[0] === gameSize[0] && base.bareSize[1] === gameSize[1];
  const contextB = measured ? fullB - blankB : null, contextFixedB = measured ? tinyB - blankB : null, defaultFbB = measured ? fullB - tinyB : null;
  const px = sameSize ? gameSize[0] * gameSize[1] - 16 * 9 : null;
  const bytesPerPixel = px && defaultFbB != null ? defaultFbB / px : null;
  const depthBpp = base?.attrs?.depth ? 4 : 0, samples = base?.attrs?.antialias ? 4 : 1;
  const remainderB = measured ? footprintB - blankB - contextB - glBytes : null;
  const checks = {
    everyBucketMeasured: measured && blankB > 0,
    baselineReadingsSettled: [base?.blank, base?.tiny, base?.full].every((x) => x?.settled === true),
    bareContextWasTheGameDrawingBufferSize: sameSize,
    bareContextHadTheGameAttributes: !!gameAttrs && !!base?.attrs && ATTR_KEYS.every((k) => gameAttrs[k] === base.attrs[k]),
    noBucketNegative: measured && contextB >= -SPLIT_TOLERANCE_B && contextFixedB >= -SPLIT_TOLERANCE_B && defaultFbB >= -SPLIT_TOLERANCE_B,
    remainderNotBelowTolerance: remainderB != null && remainderB >= -SPLIT_TOLERANCE_B,
    remainderRoutedWithFileLine: Array.isArray(routing) && routing.length > 0 && routing.every((x) => !!x.fileLine),
  };
  return { ok: Object.values(checks).every(Boolean), checks,
    buckets: measured ? { footprintMB: MB(footprintB), browserBaselineMB: MB(blankB), webglContextAndSwapChainMB: MB(contextB), glCensusMB: MB(glBytes), gameDrivenOutsideCensusMB: MB(remainderB) } : null,
    context: measured ? { fixedCostMB: MB(contextFixedB), defaultFramebufferMB: MB(defaultFbB), drawingBuffer: gameSize, bytesPerPixel: bytesPerPixel == null ? null : +bytesPerPixel.toFixed(2),
      impliedColourBuffers: bytesPerPixel == null ? null : +((bytesPerPixel / samples - depthBpp) / 4).toFixed(2), samples, depthBytesPerPixel: depthBpp, attrs: base?.attrs || null } : null,
    shares: measured && footprintB ? { browserBaseline: +(blankB / footprintB).toFixed(3), webglContextAndSwapChain: +(contextB / footprintB).toFixed(3), glCensus: +(glBytes / footprintB).toFixed(3), gameDrivenOutsideCensus: +(remainderB / footprintB).toFixed(3) } : null,
    remainderOwner: 'engine-gpu: game-driven GPU memory outside the census (ANGLE / Metal per-resource and per-program overhead the GL calls cause but do not size)', routing };
}

async function a90Abs({ PORT }) {
  const B = W0B_BUDGETS.abs;
  const binding = barsBinding(PORT);
  const loopS = Number(process.env.CAL_A90ABS_LOOP_S) || B.a90LoopS;
  const lifeS = Number(process.env.CAL_A90ABS_LIFECYCLE_S) || B.a90LifecycleS;
  const fightS = Number(process.env.CAL_A90ABS_FIGHT_S) || B.fightS;
  const shortened = loopS < B.a90LoopS || lifeS < B.a90LifecycleS || fightS < B.fightS;
  return onPage(PORT, async ({ page, cdp, browser, pre }) => {
    await cdp.send('HeapProfiler.enable');
    const heapAtBoot = await gcAndHeap(cdp);
    // the post-boot heap GROWTH is attributed by a sampling profile of what is still live at the end (objects
    // collected by GC are NOT included here, unlike A-alloc-rate: this one names what is RETAINED)
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
    const a90 = await page.evaluate(A90_WORKLOAD(loopS, lifeS));
    const heapAfterA90 = await gcAndHeap(cdp);
    const fight = await page.evaluate(STAGE_FIGHT);
    if (fight.skip) { await cdp.send('HeapProfiler.stopSampling').catch(() => {}); return { pass: null, detail: { verdict: fight.skip.split(':')[0] + ': the staged fight has no cast — ' + fight.skip, a90 } }; }
    const gpuSamples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < fightS * 1000) { await sleep(Math.min(15000, fightS * 1000 - (Date.now() - t0) + 10)); gpuSamples.push(await gpuProcess(browser)); }
    const heapPostGc = await gcAndHeap(cdp);
    const { profile: liveProfile } = await cdp.send('HeapProfiler.stopSampling');
    const perfMem = await page.evaluate('performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null');
    gpuSamples.push(await gpuProcess(browser));
    // the census at the last fight reading (A-vram-ledger's, installed before the context), by owner lane
    const attrCfg = ATTR_CFG();
    const glAttr = await page.evaluate(`(() => { const a = window.__glCensus.attribute(${JSON.stringify(attrCfg)}); const e = __CTX__.engine, gl = e.renderer.getContext(); let canvas = null; try { canvas = e.renderTargetLedger().canvas || null; } catch (err) { canvas = null; }
      const lanes = {}; for (const o of a.owners) { const l = /^unregistered/.test(o.owner) ? 'UNREGISTERED scene roots' : o.lane; lanes[l] = (lanes[l] || 0) + o.textures + o.renderTargets + o.buffers; }
      const un = a.unattributed.textures.bytes + a.unattributed.renderTargets.bytes + a.unattributed.buffers.bytes;
      const rt = a.ledgerRows.filter((x) => x.glBytes > 0).sort((x, y) => y.glBytes - x.glBytes).slice(0, 6).map((x) => ({ owner: x.owner, bytes: x.glBytes }));
      return { lanes, unattributedGlBytes: un, totals: a.totals, canvasLedger: canvas, topRenderTargets: rt, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        gameAttrs: gl.getContextAttributes(), programs: (e.renderer.info.programs || []).length }; })()`);
    // WHAT-IF (reported, never graded): the same fight at pixel ratio 1.25 (engine-gpu's W0b tier DPR cap), the census read
    // at both, so the footprint drop that is NOT the census's names how much of the outside-census memory scales with resolution
    let whatIfDpr125 = null;
    try {
      const f0 = await footprintMedian(browser, 3, 600);
      const c0 = await page.evaluate('window.__glCensus.totals()');
      const was = await page.evaluate(`(async () => { ${FRAMES} const e = __CTX__.engine; const was = e.basePixelRatio; e.basePixelRatio = 1.25; e.renderScale = 1; e.resize(); await __frames(180); return was; })()`);
      await sleep(4000);
      const f1 = await footprintMedian(browser, 3, 600);
      const c1 = await page.evaluate('window.__glCensus.totals()');
      const cB = (c) => c.textures + c.renderTargets + c.buffers;
      whatIfDpr125 = { pixelRatio: 1.25, from: was, footprintMB: f1.medianB == null ? null : MB(f1.medianB), footprintAtFromMB: f0.medianB == null ? null : MB(f0.medianB),
        footprintDropMB: f0.medianB != null && f1.medianB != null ? MB(f0.medianB - f1.medianB) : null, censusDropMB: MB(cB(c0) - cB(c1)),
        outsideCensusDropMB: f0.medianB != null && f1.medianB != null ? MB(f0.medianB - f1.medianB - (cB(c0) - cB(c1))) : null };
      await page.evaluate(`(() => { const e = __CTX__.engine; e.basePixelRatio = ${JSON.stringify(was)}; e.renderScale = 1; e.resize(); return true; })()`);
    } catch (err) { whatIfDpr125 = { error: String(err.message || err).slice(0, 160) }; }
    // THE SELF-TESTS (known deltas), after the graded readings
    let heapControl = null, gpuControl = null;
    try {
      const h0 = await gcAndHeap(cdp);
      await page.evaluate(HEAP_CONTROL_HOLD);
      const h1 = await gcAndHeap(cdp);
      await page.evaluate('(() => { window.__w0bHeapCtl = null; return true; })()');
      const h2 = await gcAndHeap(cdp);
      const exp = HEAP_CONTROL_BYTES + 16 + 8 + 4 * HEAP_CONTROL_N, rise = h1 - h0;   // + the holding array
      heapControl = { ...heapControlGrade(rise, h1 - h2, exp), expectedB: exp, riseB: rise, fallB: h1 - h2, tolerance: 0.05 };
    } catch (err) { heapControl = { ok: false, error: String(err.message || err).slice(0, 160) }; }
    try {
      const pin = await page.evaluate(GPU_CONTROL('pin'));
      await sleep(1500);
      const cycles = [];
      let before = await footprintMedian(browser);
      let exp = 0, allocOk = true;
      for (let c = 0; c < GPU_CONTROL_CYCLES; c++) {
        const al = await page.evaluate(GPU_CONTROL('alloc'));
        allocOk = allocOk && !!al?.ok; exp = al?.bytes || exp;
        await sleep(1500);
        const held = await footprintMedian(browser);
        await page.evaluate(GPU_CONTROL('free'));
        await sleep(2500);
        const after = await footprintMedian(browser);
        cycles.push({ beforeMB: before.medianB == null ? null : MB(before.medianB), heldMB: held.medianB == null ? null : MB(held.medianB), afterMB: after.medianB == null ? null : MB(after.medianB),
          riseB: held.medianB != null && before.medianB != null ? held.medianB - before.medianB : null, fallB: held.medianB != null && after.medianB != null ? held.medianB - after.medianB : null,
          spreadMB: [before.spreadMB, held.spreadMB, after.spreadMB] });
        before = after;
      }
      await page.evaluate(GPU_CONTROL('unpin'));
      const g = gpuControlGrade(cycles, exp);
      gpuControl = { ...g, ok: g.ok && allocOk && !!pin?.held, held: !!pin?.held, expectedB: exp, cycles, riseBand: GPU_RISE_BAND, fallOverRiseBand: GPU_FALL_BAND };
    } catch (err) { gpuControl = { ok: false, error: String(err.message || err).slice(0, 160) }; try { await page.evaluate(GPU_CONTROL('free')); await page.evaluate(GPU_CONTROL('unpin')); } catch { /* */ } }
    await page.evaluate(UNSTAGE);
    // the graded readings, through the same predicates the negative controls feed (no literal stands in for a criterion)
    const gpuReadings = (samples) => samples.filter((g) => g.found && g.footprintB != null && g.footprintB > 0);
    const gpuMeasured = (samples) => gpuReadings(samples).length >= Math.max(2, Math.floor(fightS / 15));
    const workloadRan = (w) => !!w && w.workloadPass === true && w.kills >= B.minKills;
    const gpu = gpuReadings(gpuSamples);
    const gpuMax = gpu.length ? Math.max(...gpu.map((g) => g.footprintB)) : null;
    const gpuAt = gpu.length ? gpu[gpu.length - 1].footprintB : null;
    // the footprint split (at the last fight reading), against MEASURED buckets (targeted fix round 1)
    const glBytes = glAttr ? glAttr.totals.textures + glAttr.totals.renderTargets + glAttr.totals.buffers : null;
    const remainderRouting = routeRemainder();
    const footprintSplit = { ...splitFootprint({ footprintB: gpuAt, base: pre, gameSize: glAttr?.drawingBuffer, gameAttrs: glAttr?.gameAttrs, glBytes, routing: remainderRouting }),
      glCensusByLaneMB: glAttr ? Object.fromEntries(Object.entries(glAttr.lanes).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, MB(v)])) : null,
      unattributedGlMB: glAttr ? MB(glAttr.unattributedGlBytes) : null,
      glTopRenderTargets: glAttr ? glAttr.topRenderTargets.map((x) => ({ owner: x.owner, MB: MB(x.bytes), fileLines: routeRt(x.owner).fileLines })) : null,
      engineLedgerCanvas: glAttr?.canvasLedger || null, gameContextAttrs: glAttr?.gameAttrs || null, bareContextAttrs: pre?.attrs || null,
      attrsMatch: !!glAttr && !!pre?.attrs && ['alpha', 'depth', 'stencil', 'antialias', 'preserveDrawingBuffer'].every((k) => glAttr.gameAttrs?.[k] === pre.attrs[k]),
      programs: glAttr?.programs ?? null, baseline: pre };
    // the heap growth after boot, by owner: what is still live at the end, from the sampling profile
    let heapGrowth = null, liveNeg = null;
    try {
      const a = attribute(liveProfile, 1, 0, PORT, { interval: 32768 });
      const lossy = attribute(liveProfile, 1, 0, PORT, { interval: 32768, dropHeaviestHeadChild: true }).accounting;
      const foreign = attribute(liveProfile, 1, 0, PORT, { interval: 32768, foreignSampleEvery: 50 }).accounting;
      liveNeg = { lossyWalkWouldPass: lossy.ok, foreignSamplesWouldPass: foreign.ok };
      heapGrowth = { liveSampledMB: MB(a.total.bytes), bySrcOwnerMB: Object.fromEntries(a.owners.slice(0, 12).map((o) => [o.id, MB(o.bytes)])), noSrcMB: Object.fromEntries(a.noSrc.buckets.map((b) => [b.id, MB(b.bytes)])),
        topFunctions: a.topGraded.slice(0, 8).map((x) => ({ fn: x.fn, MB: MB(x.bytes), owner: srcOwner(x.fn) })), accounting: a.accounting,
        note: 'sampled live objects at the end of the fight (interval 32 KB, objects collected by GC excluded): who holds the heap the workload and the fight added; the boot heap (' + MB(heapAtBoot) + ' MB post-GC) is the boot\'s; attribution checked against V8\'s sample list and samples x interval' };
    } catch (err) { heapGrowth = { error: String(err.message || err).slice(0, 160) }; }
    // NEGATIVE CONTROLS: each instrument criterion fed an input it must reject
    const negatives = [
      neg('a90WorkloadRan', 'this run\'s workload result with one kill fewer than the floor', workloadRan({ ...a90, kills: B.minKills - 1 })),
      neg('a90WorkloadRan', 'this run\'s workload result with its verdict failed', workloadRan({ ...a90, workloadPass: false })),
      neg('gpuProcessMeasured', 'this run\'s GPU-process samples with the footprint reading missing (footprint tool failed)', gpuMeasured(gpuSamples.map((g) => ({ ...g, footprintB: null })))),
      neg('gpuProcessMeasured', 'this run\'s GPU-process samples with the GPU process not found', gpuMeasured(gpuSamples.map((g) => ({ ...g, found: false })))),
      neg('footprintSplitIntoMeasuredBuckets', 'the split with a blank reading taken while the GPU process was still moving (not settled)', splitFootprint({ footprintB: gpuAt, base: { ...pre, blank: { ...(pre?.blank || {}), settled: false } }, gameSize: glAttr?.drawingBuffer, gameAttrs: glAttr?.gameAttrs, glBytes, routing: remainderRouting }).ok),
      neg('footprintSplitIntoMeasuredBuckets', 'the split with no browser baseline', splitFootprint({ footprintB: gpuAt, base: { ...pre, blank: { medianB: null } }, gameSize: glAttr?.drawingBuffer, gameAttrs: glAttr?.gameAttrs, glBytes, routing: remainderRouting }).ok),
      neg('footprintSplitIntoMeasuredBuckets', 'the split with a bare context of another size', splitFootprint({ footprintB: gpuAt, base: { ...pre, bareSize: [16, 9] }, gameSize: glAttr?.drawingBuffer, gameAttrs: glAttr?.gameAttrs, glBytes, routing: remainderRouting }).ok),
      neg('footprintSplitIntoMeasuredBuckets', 'the split with a bare context made with antialias on (attributes not the game\'s)', splitFootprint({ footprintB: gpuAt, base: { ...pre, attrs: { ...(pre?.attrs || {}), antialias: !(glAttr?.gameAttrs?.antialias) } }, gameSize: glAttr?.drawingBuffer, gameAttrs: glAttr?.gameAttrs, glBytes, routing: remainderRouting }).ok),
      neg('footprintSplitIntoMeasuredBuckets', 'the split with 200 MB more census than the footprint holds', splitFootprint({ footprintB: gpuAt, base: pre, gameSize: glAttr?.drawingBuffer, gameAttrs: glAttr?.gameAttrs, glBytes: (gpuAt ?? 0) - (pre?.full?.medianB ?? 0) + 200e6, routing: remainderRouting }).ok),
      neg('remainderRoutedWithFileLine', 'the remainder resolved against an engine.js without the anchors', routeRemainder({ [ENGINE]: ['// no anchors'] }).length > 0),
      neg('heapGrowthAttributed', 'the live profile walked without its heaviest subtree', liveNeg?.lossyWalkWouldPass !== false),
      neg('heapGrowthAttributed', 'the live profile with every 50th sample on a node no owner holds', liveNeg?.foreignSamplesWouldPass !== false),
      neg('selfTestHeapKnownDelta', 'the heap readings against twice the retained size', heapControl?.riseB != null ? heapControlGrade(heapControl.riseB, heapControl.fallB, heapControl.expectedB * 2).ok : true),
      neg('selfTestGpuKnownDelta', 'the GPU readings of a driver that never frees (fall 0)', gpuControl?.cycles ? gpuControlGrade(gpuControl.cycles.map((c) => ({ ...c, fallB: 0 })), gpuControl.expectedB).ok : true),
      neg('selfTestGpuKnownDelta', 'the GPU readings against twice the allocation', gpuControl?.cycles ? gpuControlGrade(gpuControl.cycles, gpuControl.expectedB * 2).ok : true),
    ];
    const instrument = {
      a90WorkloadRan: workloadRan(a90),
      gpuProcessMeasured: gpuMeasured(gpuSamples),
      footprintSplitIntoMeasuredBuckets: !!footprintSplit.ok,
      heapGrowthAttributed: !!heapGrowth?.accounting?.ok,
      selfTestHeapKnownDelta: !!heapControl?.ok,
      selfTestGpuKnownDelta: !!gpuControl?.ok,
      negativeControlsEachFail: negatives.every((n) => n.ok),
    };
    const bars = {
      postGcHeapWithinCeiling: { binding, ceilingMB: 450, MB: MB(heapPostGc), pass: heapPostGc <= B.heapB },
      gpuProcessWithinCeiling: { binding, ceilingMB: 1500, MB: gpuMax === null ? null : MB(gpuMax), pass: gpuMax !== null && gpuMax <= B.gpuProcessB },
    };
    const instrumentOk = Object.values(instrument).every(Boolean);
    const barsOk = Object.values(bars).every((b) => !b.binding || b.pass);
    const measuredPass = instrumentOk && barsOk;
    const pass = shortened ? (measuredPass ? null : false) : measuredPass;
    const bk = footprintSplit.buckets;
    return { pass, detail: {
      verdict: (shortened ? 'DEV RUN (shortened workload, never a PASS): ' : '') + (measuredPass ? 'PASS' : 'FAIL: ' + [...Object.keys(instrument).filter((k) => !instrument[k]), ...Object.entries(bars).filter(([, b]) => b.binding && !b.pass).map(([k]) => 'bar ' + k)].join(', '))
        + ` — INSTRUMENT (R48 b): ${instrumentOk ? 'PASS' : 'FAIL'} (heap control ${heapControl?.ratio ?? '?'}x of ${heapControl?.expectedB ? MB(heapControl.expectedB) : '?'} MB; GPU control ${gpuControl?.ratio ?? '?'}x of ${gpuControl?.expectedB ? MB(gpuControl.expectedB) : '?'} MB, fall ${gpuControl?.fallOverRise ?? '?'}x of the rise (median of ${GPU_CONTROL_CYCLES} cycles); `
        + `footprint split into MEASURED buckets ${footprintSplit.ok ? 'holds' : 'FAILS ' + Object.keys(footprintSplit.checks).filter((k) => !footprintSplit.checks[k]).join(', ')}: ${bk ? `browser baseline ${bk.browserBaselineMB} MB, WebGL context + swap chain ${bk.webglContextAndSwapChainMB} MB (default framebuffer ${footprintSplit.context?.defaultFramebufferMB} MB = ${footprintSplit.context?.bytesPerPixel} B/px at ${(footprintSplit.context?.drawingBuffer || []).join('x')}), GL census ${bk.glCensusMB} MB, game-driven outside the census ${bk.gameDrivenOutsideCensusMB} MB -> engine-gpu @ ${remainderRouting.map((x) => x.fileLine).join(' + ')}` : 'not measured'}; `
        + `negative controls ${negatives.filter((n) => n.ok).length}/${negatives.length} fail as they must) — `
        + `BARS (${binding ? 'binding: global run' : 'lane run: graded at the orchestrator\'s 5270 global run after the engine-gpu merge, R48 b'}): post-GC JS heap ${MB(heapPostGc)} MB (ceiling 450) ${bars.postGcHeapWithinCeiling.pass ? 'pass' : 'FAIL'}, Chrome GPU process footprint ${gpuMax === null ? 'not measured' : MB(gpuMax) + ' MB'} (ceiling 1500) ${bars.gpuProcessWithinCeiling.pass ? 'pass' : 'FAIL'} at the staged fight, after the A90 workload (${a90.kills} kills, ${a90.workload?.respawned} respawned)`
        + (bars.gpuProcessWithinCeiling.pass ? '' : ` — over-bar routing: GL census -> ${footprintSplit.glTopRenderTargets ? footprintSplit.glTopRenderTargets.slice(0, 3).map((x) => x.owner + ' ' + x.MB + ' MB @ ' + x.fileLines.join(' + ')).join('; ') : '?'}; game-driven outside the census ${bk ? bk.gameDrivenOutsideCensusMB : '?'} MB -> engine-gpu @ ${remainderRouting.map((x) => x.fileLine).join(' + ')}; what-if at pixel ratio 1.25 ${whatIfDpr125?.footprintMB ?? '?'} MB (drop ${whatIfDpr125?.footprintDropMB ?? '?'} MB, of which outside the census ${whatIfDpr125?.outsideCensusDropMB ?? '?'} MB)`),
      instrument, bars, runId: runIdOf(PORT), barsBinding: binding,
      sealing: 'R48 (b): the harness seals every run that executes this row (tools/gates.r5.gates-perf.mjs INSTRUMENT_IDS); verify with node tools/gates.r5.gates-perf.mjs --instruments --port <port>',
      checks: { ...instrument, ...Object.fromEntries(Object.entries(bars).map(([k, b]) => ['bar:' + k, b.pass])) },
      report: { postGcJsHeapMB: MB(heapPostGc), gpuProcessFootprintMB: gpuMax === null ? null : MB(gpuMax) },
      ceilings: { heapMB: 450, gpuProcessMB: 1500 }, footprintSplit, heapGrowth, selfTest: { heap: heapControl, gpu: gpuControl, negatives },
      heapMB: { atBoot: MB(heapAtBoot), afterA90: MB(heapAfterA90), afterFightPostGc: MB(heapPostGc) }, performanceMemory: perfMem,
      gpuProcess: gpuSamples.map((g) => ({ ...g, footprintMB: g.footprintB == null ? null : MB(g.footprintB), rssMB: g.rssB == null ? null : MB(g.rssB) })),
      whatIfDpr125, a90, durationsS: { a90Loop: loopS, a90Lifecycle: lifeS, fight: fightS, shortened }, fight,
      method: 'A90-memory-stability\'s kill -> respawn workload (gate-roster memWorkload / memRespawnAfter, same loop and lifecycle times), two forced GCs (CDP HeapProfiler.collectGarbage), then the A21 staged fight for ' + fightS + ' s; JS heap = Runtime.getHeapUsage().usedSize after two forced GCs; GPU process = SystemInfo.getProcessInfo type GPU, macOS `footprint -p <pid> -f bytes` (phys_footprint, includes IOSurface / Metal memory), sampled every 15 s through the fight, max graded; the footprint split at the last reading into measured buckets: the browser baseline and a bare same-size WebGL2 context read in this Chrome before the game booted, the GL census by lane, and the game-driven remainder outside the census routed with engine.js file:line; heap growth by a live-object sampling profile, checked against V8\'s sample list; known-delta self-tests after the graded readings; negative controls',
    } };
  }, { initScripts: [GL_CENSUS], preBoot: (browser) => gpuBaseline(browser, PORT) });
}

/* ------------------------------------------------------------------------------------------------ */
/* A-unattributed-cap                                                                                */
/* ------------------------------------------------------------------------------------------------ */
const DRAW_PROBE = `(async () => {
  ${FRAMES}
  const ctx = __CTX__, e = ctx.engine, R = e.renderer, scene = ctx.scene;
  const OWNERS = ${JSON.stringify(DRAW_OWNERS.map((o) => ({ id: o.id, row: o.row, re: o.re.source, flags: o.re.flags })))}.map((o) => ({ ...o, re: new RegExp(o.re, o.flags) }));
  const ownerOf = (name) => (name ? (OWNERS.find((o) => o.re.test(name)) || null) : null);
  // draws per frame: the engine owns renderer.info (autoReset off, reset at the top of render()) and records
  // every frame's calls in its perf ring, so a frame's draws are perfSnapshot().medianDrawCalls over n frames
  const drawsPerFrame = async (n = 8) => { e.perfReset(); const f0 = e.frames; while (e.frames - f0 < n) await new Promise((r) => requestAnimationFrame(r));
    const s = e.perfSnapshot(n); return s ? s.medianDrawCalls : null; };
  const describe = (c, i) => {
    if (c.name) return c.name;
    let tris = 0, meshes = 0; c.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; tris += g ? (g.index ? g.index.count : (g.attributes.position?.count || 0)) / 3 : 0; } });
    return '(unnamed ' + c.type + ' #' + i + (c.isMesh ? ': ' + (c.geometry?.type || '?') + ' / ' + (c.material?.type || '?') : meshes ? ': ' + meshes + ' meshes' : '') + (tris ? ', ' + Math.round(tris) + ' tris' : '') + ')';
  };
  // a light or a light's target (an empty Object3D) draws nothing itself; hiding it would remove OTHER owners' shadow draws
  const isLightish = (c) => c.isLight || (!c.isMesh && c.type === 'Object3D' && !c.children.length);
  const roots = scene.children.map((c, i) => ({ obj: c, label: describe(c, i), owner: ownerOf(c.name)?.id || null, visible: c.visible, light: isLightish(c) }));
  const settle = () => __frames(4);
  await settle();
  const total = await drawsPerFrame();
  /*
   * THE GRADED NUMBER (W0b fix round 1): the DIRECT per-draw count. Every renderBufferDirect call (main, shadow and
   * post passes) over 10 frames is bucketed by the scene root it draws for, keyed by the engine frame it falls in;
   * the first and last frame (partial: the hook is installed and removed between rAF callbacks) are dropped. A root
   * that appears during the probe is attributed by its own name like any other. Deterministic: nothing is hidden.
   */
  const directCount = async () => {
    const real = R.renderBufferDirect;
    const perRoot = new Map(); const perFrameUn = new Map(); const perFrameAll = new Map(); const postByFrame = new Map();
    const f0 = e.frames;
    // the renderer's own counter on the SAME frames: renderer.info is reset at the top of engine.render(), so at
    // onAfterRender it holds that frame's calls (fix round 2: both instruments over identical frames)
    const infoByFrame = new Map();
    const recInfo = () => { infoByFrame.set(e.frames, R.info.render.calls); };
    e.onAfterRender.push(recInfo);
    R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
      let o = object, root = null; while (o) { if (o.parent === scene) { root = o; break; } o = o.parent; }
      const fk = e.frames;
      perFrameAll.set(fk, (perFrameAll.get(fk) || 0) + 1);
      if (!root) { postByFrame.set(fk, (postByFrame.get(fk) || 0) + 1); }
      else {
        let pr = perRoot.get(root); if (!pr) { pr = new Map(); perRoot.set(root, pr); }
        pr.set(fk, (pr.get(fk) || 0) + 1);
        if (!ownerOf(root.name) && !isLightish(root)) perFrameUn.set(fk, (perFrameUn.get(fk) || 0) + 1);
      }
      return real.call(this, camera, sc, geometry, material, object, group);
    };
    try { await __frames(10); } finally { R.renderBufferDirect = real; const ii = e.onAfterRender.indexOf(recInfo); if (ii >= 0) e.onAfterRender.splice(ii, 1); }
    const keys = [...perFrameAll.keys()].sort((a, b) => a - b).slice(1, -1).filter((k) => infoByFrame.has(k));   // whole frames only
    const f = Math.max(1, keys.length);
    const unPerFrame = keys.map((k) => perFrameUn.get(k) || 0);
    const allPerFrame = keys.map((k) => perFrameAll.get(k) || 0);
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
    const whole = (m) => keys.reduce((a, k) => a + (m.get(k) || 0), 0) / f;   // per whole frame
    const rows = [...perRoot.entries()].map(([root, pr]) => ({ root: root.name || describe(root, scene.children.indexOf(root)), owner: ownerOf(root.name)?.id || null, draws: Math.round(whole(pr) * 10) / 10 }))
      .filter((x) => x.draws > 0).sort((a, b) => b.draws - a.draws);
    const by = {};
    for (const x of rows) { const k = x.owner || 'UNATTRIBUTED'; by[k] = Math.round(((by[k] || 0) + x.draws) * 10) / 10; }
    return { frames: f, unattributedPerFrame: unPerFrame, unattributedMax: unPerFrame.length ? Math.max(...unPerFrame) : 0, unattributedMedian: med(unPerFrame),
      drawsPerFrameMedian: med(allPerFrame), post: Math.round(whole(postByFrame) * 10) / 10, perFrame: Math.round(whole(perFrameAll) * 10) / 10, by, rows, firstFrame: f0,
      infoPerFrame: keys.map((k) => infoByFrame.get(k)), infoMedian: med(keys.map((k) => infoByFrame.get(k))), allPerFrame,
      infoVsDirectMax: keys.reduce((a, k) => Math.max(a, Math.abs((infoByFrame.get(k) || 0) - (perFrameAll.get(k) || 0))), 0),
      // per owner: the per-frame values, so a reading that varies frame to frame is visible
      ownerPerFrame: Object.fromEntries([...new Set(rows.map((x) => x.owner || 'UNATTRIBUTED'))].map((k) => [k, keys.map((fk) => {
        let n = 0; for (const [root, pr] of perRoot) if ((ownerOf(root.name)?.id || 'UNATTRIBUTED') === k && !(k === 'UNATTRIBUTED' && isLightish(root))) n += pr.get(fk) || 0; return n; })])) };
  };
  const direct = await directCount();   // GRADED: the live world, the worst whole frame
  /*
   * CROSS-CHECKS (the plan's "hide each registered owner in turn"), as PAIRED readings on a PINNED WORLD.
   * W0b fix round 2 (judge finding: the PASS did not reproduce inside a full suite; the NPC owner's hide delta read 14
   * against a direct count of 16, because NPC LOD and animation changed the NPC draws between the with and the
   * without reading). Every reading below is taken with the simulation held: ctx.state is set to a non-live state,
   * so main.js _simulate() runs no system (no NPC animation or LOD switch, no particle, no AI) while engine.render()
   * keeps drawing the same world; dynamic resolution is off. The pinned direct count is taken in the same hold, and
   * each owner's hide delta must equal ITS pinned direct count within +-1 (and the unregistered roots hidden together
   * the pinned unattributed count). The graded number stays the LIVE direct count above; the pinned unattributed
   * count must agree with it within +-1 too.
   */
  const __state0 = ctx.state, __drs0 = e.drsEnabled;
  ctx.state = 'gate-pinned';
  try { e.setDynamicResolution?.(false); } catch (err) { /* optional */ }
  let pinned = null;
  try {
  await settle();
  pinned = await directCount();
  /* Measured (fix round 2, lane run 01:34Z): even on the pinned world the NPC pair read 14 against a pinned direct count
   * of 16, and its own 'with' reading was 333 draws where the pinned total was 335. The world was held; what moved is
   * render-time state that a hide/unhide cycle leaves behind (the cull pass keeps a size-cull hysteresis per mesh) and
   * draws that move to OTHER roots while an owner is hidden (a shadow-caster or cull slot taken by another mesh). So each
   * pair now takes the direct per-root count on the SAME frames as its renderer readings: the owner's direct count in
   * the 'with' state, and every root's direct count in the 'without' state. The cross-check is then exact accounting:
   * the renderer's (with - without) must equal the owner's own direct draws minus what the other roots and the post
   * passes gained while it was hidden (substitution), within +-1; and the owner must draw 0 while hidden. */
  const medOf = (a) => { const s = (a || []).slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
  /* One pair = two windows of whole frames (with, without), each read by BOTH instruments on the same frames: the
   * renderer's counter (renderer.info.render.calls at onAfterRender) and the direct per-draw hook. The plan's hide
   * reading is the renderer's (with - without); it must equal the direct hook's (with - without) within +-1, and the
   * owner must draw 0 while hidden. The owner's own direct draws and the substitution (own - total delta: what other
   * roots and passes gained while it was hidden) are reported; medians of the same frames throughout. */
  const pair = async (objs, key) => {
    await settle(); const w = await directCount();
    for (const r of objs) r.obj.visible = false;
    await settle(); const h = await directCount();
    for (const r of objs) r.obj.visible = r.visible;
    const own = medOf(w.ownerPerFrame[key]), ownHidden = Math.max(0, ...((h.ownerPerFrame[key]) || [0]));
    const rDelta = w.infoMedian - h.infoMedian, dDelta = w.drawsPerFrameMedian - h.drawsPerFrameMedian;
    return { draws: rDelta, directDelta: dDelta, with: w.infoMedian, without: h.infoMedian, ownDirectWith: own, ownDirectHidden: ownHidden,
      substitution: own - dDelta, infoVsDirectMaxPerFrame: Math.max(w.infoVsDirectMax, h.infoVsDirectMax), framesWith: w.frames, framesWithout: h.frames };
  };
  const hidden = {};
  for (const o of OWNERS) {
    const mine = roots.filter((r) => r.owner === o.id && r.obj.visible);
    if (!mine.length) { hidden[o.id] = { roots: 0, draws: 0 }; continue; }
    hidden[o.id] = { row: o.row, roots: mine.length, names: [...new Set(mine.map((r) => r.label))].slice(0, 12), ...(await pair(mine, o.id)) };
  }
  // every scene child hidden: what is left is the post chain (+ passes that draw without the scene)
  for (const r of roots) r.obj.visible = false;
  await settle(); const postOnly = await drawsPerFrame();
  for (const r of roots) r.obj.visible = r.visible;
  // the unregistered roots, hidden together (paired)
  const un = roots.filter((r) => !r.owner && !r.light && r.obj.visible);
  const unPair = un.length ? await pair(un, 'UNATTRIBUTED') : { draws: 0, directDelta: 0, ownDirectWith: 0, ownDirectHidden: 0, substitution: 0 };
  await settle();
  const ownedSum = Object.values(hidden).reduce((a, h) => a + h.draws, 0);
  return { total, postOnly, owners: hidden, ownedSum,
    unattributedByHidingOwners: pinned.perFrame - postOnly - ownedSum,
    unattributedByHidingUnregistered: unPair.draws,
    unregisteredPair: unPair,
    unregisteredRoots: [...new Set(un.map((r) => r.label))], lightsNotHidden: roots.filter((r) => r.light).map((r) => r.label),
    rootsByOwner: roots.reduce((a, r) => { const k = r.owner || 'UNREGISTERED'; (a[k] = a[k] || []).push(r.label); return a; }, {}),
    direct, pinned, pinnedState: { held: ctx.state === 'gate-pinned', framesAdvanced: e.frames - pinned.firstFrame } };
  } finally {
    ctx.state = __state0;
    try { e.setDynamicResolution?.(__drs0); } catch (err) { /* optional */ }
    for (const r of roots) r.obj.visible = r.visible;
  }
})()`;

async function unattributedCap({ PORT }) {
  const wave = String(process.env.CAL_WAVE || 'W0b');
  const fromW2 = /^W[2-4]/.test(wave);
  return onPage(PORT, async ({ page }) => {
    const fight = await page.evaluate(STAGE_FIGHT);
    if (fight.skip) return { pass: null, detail: { verdict: fight.skip.split(':')[0] + ': the staged fight has no cast — ' + fight.skip } };
    const m = await page.evaluate(DRAW_PROBE);
    await page.evaluate(UNSTAGE);
    // GRADED (W0b fix round 1): the direct per-draw count, the worst whole frame of the window
    const measured = m.direct.unattributedMax;
    const cap = UNATTRIBUTED_CAP_W0;
    // the cross-checks must agree within +-1 draw, owner by owner, else the instrument is in doubt -> PENDING, named
    const TOL = 1;
    const disagree = [];
    // W0b fix round 2: every hide reading is compared with the direct count taken on the SAME pinned frames, net of the
    // draws other roots gained while the owner was hidden (substitution, measured on those frames)
    for (const o of DRAW_OWNERS) {
      const h = m.owners[o.id];
      if (!h || !h.roots) continue;
      if (Math.abs(h.draws - h.directDelta) > TOL) disagree.push(`${o.id}: hide delta ${r1(h.draws)} (renderer) vs ${r1(h.directDelta)} (direct hook), same frames`);
      if (h.ownDirectHidden > 0) disagree.push(`${o.id}: still drew ${h.ownDirectHidden} while hidden`);
    }
    const up = m.unregisteredPair;
    if (Math.abs(up.draws - up.directDelta) > TOL) disagree.push(`unregistered roots: hide delta ${r1(up.draws)} (renderer) vs ${r1(up.directDelta)} (direct hook), same frames`);
    if (up.ownDirectHidden > 0) disagree.push(`unregistered roots: still drew ${up.ownDirectHidden} while hidden`);
    if (Math.abs(m.direct.unattributedMedian - measured) > TOL) disagree.push(`direct per frame: median ${m.direct.unattributedMedian} vs max ${measured} over ${m.direct.frames} frames`);
    if (Math.abs(m.pinned.unattributedMax - measured) > TOL) disagree.push(`pinned unattributed ${m.pinned.unattributedMax} vs live ${measured}`);
    if (!m.pinnedState.held) disagree.push('the world was not held during the paired readings (ctx.state changed under the probe)');
    const checks = {
      w0CapRecorded: cap !== null,
      notAboveW0Cap: cap === null || measured <= cap,
      ...(fromW2 ? { atMost30FromW2: measured <= W0B_BUDGETS.unattributed.w2Bar } : {}),
    };
    const crossChecksAgree = disagree.length === 0;
    const pass = cap === null || !crossChecksAgree ? null : Object.values(checks).every(Boolean);
    return { pass, detail: {
      verdict: (cap === null ? `PENDING: W0 cap not recorded yet — record ${measured} (this measurement) as UNATTRIBUTED_CAP_W0`
        : !crossChecksAgree ? 'PENDING: the hide cross-checks disagree with the direct count by more than ' + TOL + ' draw (' + disagree.join('; ') + '); the direct count (' + measured + ') is not graded on a doubted instrument'
        : pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', '))
        + ` — ${measured} draws/frame from scene children with no registered owner (direct per-draw count, worst of ${m.direct.frames} whole frames, median ${m.direct.unattributedMedian}; cross-checks: unregistered roots hidden together ${r1(m.unattributedByHidingUnregistered)}, hide-each-owner remainder ${r1(m.unattributedByHidingOwners)} (reported only: its error is the sum of every owner's), `
        + `per-owner hide vs direct within ${TOL}: ${crossChecksAgree ? 'all agree' : disagree.length + ' disagree'}), `
        + `of ${r1(m.total)} total (post chain ${r1(m.postOnly)}); W0 cap ${cap === null ? 'unrecorded' : cap + ' (' + MEMORY_BUDGETS.unattributed.w0Cap.measured + ')'}, W2 bar ${W0B_BUDGETS.unattributed.w2Bar}; wave ${wave}; unregistered roots: ${m.unregisteredRoots.join(', ') || 'none'}`,
      checks, crossChecks: { tolerance: TOL, agree: crossChecksAgree, disagreements: disagree,
        perOwner: DRAW_OWNERS.map((o) => ({ id: o.id, hidden: m.owners[o.id]?.draws ?? 0, hiddenDirectHook: m.owners[o.id]?.directDelta ?? 0, ownDirectSameFrames: m.owners[o.id]?.ownDirectWith ?? 0,
          substitution: m.owners[o.id]?.substitution ?? 0, infoVsDirectMaxPerFrame: m.owners[o.id]?.infoVsDirectMaxPerFrame, pinnedDirect: m.pinned.by[o.id] || 0, liveDirect: m.direct.by[o.id] || 0,
          livePerFrame: m.direct.ownerPerFrame?.[o.id], pinnedPerFrame: m.pinned.ownerPerFrame?.[o.id], roots: m.owners[o.id]?.roots || 0 })),
        pinnedWorld: { method: 'ctx.state held at a non-live state (main.js _simulate() returns before any system update; engine.render() still draws), dynamic resolution off', ...m.pinnedState,
          pinnedUnattributedPerFrame: m.pinned.unattributedPerFrame } },
      measured, cap, wave, probe: m, fight,
      owners: DRAW_OWNERS.map((o) => ({ id: o.id, row: o.row, lanes: o.lanes, pattern: String(o.re) })),
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
  // targeted fix round 1: every lane's MANIFEST is read by column name (tools/r5-refs/manifest.mjs), and each stored row is
  // held to the one rule set verify() uses (tools/r5-refs/fetch.mjs storedRowProblems: licence, attribution, author, source,
  // retrieved, forbidden sources, sha256 when recorded)
  const byLaneLayout = {};
  for (const { lane, dir } of laneFolders(ROOT)) {
    const m = readManifest(dir);
    storedRows += m.stored.length; urlOnlyRows += m.urlOnly.length;
    byLaneLayout[lane] = { stored: m.stored.length, urlOnly: m.urlOnly.length, notes: m.notes.length, headers: m.tables.filter((t) => t.kind !== 'other').map((t) => t.header.join(' | ')) };
    for (const r of m.stored) {
      licences[r.licence] = (licences[r.licence] || 0) + 1;
      for (const pr of storedRowProblems(lane, dir, r)) rowsProblems.push('reference/r5/' + pr);
    }
    for (const r of m.urlOnly) if (r.slot && readdirSync(dir).some((f) => f.replace(/\.[a-z]+$/i, '') === r.slot)) rowsProblems.push(`${relRoot(dir)}/${r.slot}: URL-only (${r.licence}) but stored`);
  }
  // the row rules can fail (targeted fix round 1): a complete row passes, each bad variant of it is refused
  const rules = rowRulesSelfTest(ROOT);
  // V12 / V22 / V24 / V46 / V48 point at reference/r5/**
  const NAMED = ['V12', 'V22', 'V24', 'V46', 'V48'];
  const pointing = NAMED.map((short) => {
    // any kind: V22-chase-framing is an ACTION row that names its framing reference
    const g = (GATES || []).find((x) => new RegExp(`^${short}-`).test(x.id));
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
    rowRulesRejectBadRows: rules.ok,
  };
  const pass = Object.values(checks).every(Boolean);
  return { pass, detail: {
    verdict: (pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', '))
      + ` — ${files.length} image(s) under reference/ (${storedRows} stored rows, ${urlOnlyRows} URL-only rows; licences ${JSON.stringify(licences)}; MANIFEST layouts read by column name: ${Object.entries(byLaneLayout).map(([l, x]) => l + ' ' + x.stored + ' stored').join(', ')}); row-rule controls ${rules.cases ? rules.cases.filter((c) => c.ok).length + '/' + rules.cases.length : 'FAILED ' + rules.why}; ${stills.rows.length} deleted Round-4 stills recorded with sha256, ${stillNamesPresent.length} present by name, ${reappeared.length} by content; `
      + pointing.map((x) => (x.present ? `${x.gate} -> ${x.ok ? x.refs.join(' + ') : 'NOT r5: ' + JSON.stringify(x.refs) + ' ' + x.nonR5.join(' ')}` : `${x.gate}: not registered in this tree`)).join('; '),
    checks, topLevelImages: topLevel, deletedStills: stills.rows.length, deletedStillsPresentByName: stillNamesPresent, reappearedByContent: reappeared,
    manifestProblems: rowsProblems, namedRows: pointing, manifestsByLane: byLaneLayout, rowRulesSelfTest: rules,
  } };
}

function referenceSet({ GATES }) {
  // (a) the fetcher: Commons API, filtered by the classifier, whose controls hold
  const src = readFileSync(path.join(TOOLS, 'r5-refs', 'fetch.mjs'), 'utf8');
  const fetcher = { commonsApi: /https:\/\/commons\.wikimedia\.org\/w\/api\.php/.test(src), filtersOnClassifier: /classifyCommons\(/.test(src) && /info\.c\.cls !== 'stored'/.test(src),
    selfTest: classifierSelfTest() };
  // targeted fix round 1: the MANIFEST parser reads every lane's layout (gates-perf's, brand's, hero-body's), with a negative case
  const parser = parserSelfTest();
  // (b) the set verifies offline (every pinned slot fetched, every file a complete row, sha256 intact)
  const v = verifyReferenceSet(ROOT);
  // (c) every V gate in every lane file names >= 1 reference file under reference/r5/** with a MANIFEST row.
  // W0b fix round 3 (judge finding: the gate graded 8 of the 37 visual rows of gates-perf's own carried.mjs): §9 says
  // EVERY V gate in EVERY lane file, and no ruling narrows it, so every registered visual row is graded here, the
  // SKIP-replaced carried rows included (each names the licence-clean reference its absorbing lane re-stages against);
  // a row of another lane's file that names none is an offender named with its lane.
  const vis = (GATES || []).filter((g) => g.kind === 'visual');
  const rows = vis.map((g) => {
    const t = referenceTokens(g);
    const res = t.refs.map(resolveRef);
    const good = res.filter((x) => x.ok);
    const lane = laneOfGate(g);
    const replaced = lane === 'carried' && !g.shadows && !KEPT_VISUAL.includes(g.id);
    // R49 (plan §8.3, Oct 22): engine-gpu's V gates (V20, V33b, V-gpu-tier-look) are graded at W0b against their
    // IN-SHEET controls (shipped vs no-AA, stock shader, 2x/2x), which serve as the R29 reference; such a row of
    // engine-gpu's file that names no reference/r5 file is accepted by that ruling, and says so
    const r49 = lane === 'engine-gpu' && /^(V20|V33b|V-gpu-tier-look)(-|$)/.test(g.id) && t.refs.length === 0;
    if (r49) return { id: g.id, lane, source: g.source, graded: true, replaced: false, ok: true, refs: ['in-sheet control (R49)'], problems: [], nonR5: t.nonR5, ruling: 'R49' };
    return { id: g.id, lane, source: g.source, graded: true, replaced, absorbedBy: g.absorbedBy || null,
      ok: good.length > 0 && res.every((x) => x.ok) && t.nonR5.length === 0, refs: good.map((x) => x.file), problems: res.filter((x) => !x.ok).map((x) => x.why), nonR5: t.nonR5 };
  });
  const missing = rows.filter((r) => !r.ok);
  const byLane = missing.reduce((a, r) => { const k = r.lane === 'carried' ? 'carried (gates-perf)' : r.lane; (a[k] = a[k] || []).push(r.id); return a; }, {});
  const checks = {
    fetcherQueriesCommonsApi: fetcher.commonsApi,
    fetcherStoresOnlyPdCc0CcBy: fetcher.filtersOnClassifier && fetcher.selfTest.ok,
    referenceSetVerifies: v.ok,
    manifestParserReadsEveryLaneLayout: parser.ok,
    everyVisualGateInEveryLaneFileNamesAReference: missing.length === 0 && rows.length > 0,
  };
  const pass = Object.values(checks).every(Boolean);
  const lanesSeen = [...new Set(rows.map((r) => r.lane))];
  return { pass, detail: {
    verdict: (pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', '))
      + ` — reference set: ${v.stored} stored + ${v.urlOnly} URL-only + ${v.notes} note rows, ${v.files} files in ${Object.keys(v.byLane || {}).length} lane folder(s) (${Object.entries(v.byLane || {}).map(([l, x]) => l + ' ' + x.stored + '/' + x.images).join(', ')})${v.hashedAtVerify?.length ? ', ' + v.hashedAtVerify.length + ' row(s) without a sha256 hashed at verify' : ''}${v.ok ? '' : ', problems: ' + v.problems.slice(0, 4).join('; ')}; classifier controls ${fetcher.selfTest.cases.filter((c) => c.ok).length}/${fetcher.selfTest.cases.length}; MANIFEST parser controls ${parser.cases.filter((c) => c.ok).length}/${parser.cases.length}; `
      + `every visual gate of every lane file (${lanesSeen.join(', ')}): ${rows.length - missing.length}/${rows.length} name a licence-clean reference under reference/r5/** with a complete MANIFEST row`
      + (missing.length ? ` — missing, by lane: ${Object.entries(byLane).map(([l, ids]) => l + ' (' + ids.join(', ') + ')').join('; ')}` + ` [${missing.slice(0, 6).map((r) => r.id + ': ' + (r.problems.join('; ') || (r.nonR5.length ? 'non-r5 ' + r.nonR5.join(' ') : 'names none'))).join(' | ')}]` : ''),
    checks, fetcher: { ...fetcher, selfTest: fetcher.selfTest.cases }, parser: parser.cases, verify: v,
    slots: SLOTS.map((s) => ({ lane: s.lane, slot: s.slot, gates: s.gates, pinned: !!s.file })),
    visualGates: rows, missingByLane: byLane,
    rule: 'plan §9: every V gate in every lane file names >= 1 reference file under reference/r5/** with a MANIFEST row (author, source URL, licence, retrieved date); graded over every registered visual row, SKIP-replaced carried rows included; R49: engine-gpu\'s V20 / V33b / V-gpu-tier-look use their in-sheet controls as the R29 reference',
  } };
}

/* ------------------------------------------------------------------------------------------------ */
/* A-perf-scenarios-self-contained (plan §8.3 R34)                                                    */
/* ------------------------------------------------------------------------------------------------ */
/**
 * engine-gpu's gates eval PERF_SCENARIOS with STAGE_PRELUDE ONLY (tools/gates.r5.engine-gpu.mjs: `${GUARD} ${FRAMES}
 * ${STAGE_PRELUDE}` then `eval(VISTA)` / `eval(FIGHT)`). This row does exactly that in the harness page — a scope
 * that holds STAGE_PRELUDE and nothing else — and proves that the roster and place helpers are NOT in that scope
 * (so a pass cannot come from a leaked global), that every scenario stages (an unpin function) or returns a named
 * R18 / R28 / R30 skip, and that every unpin works.
 */
const SELF_CONTAINED = `(async () => {
  ${STAGE_PRELUDE}
  const __SC = ${JSON.stringify(PERF_SCENARIOS)};
  const __probe = ['KIND', 'ROLE_NOTE', 'roleSkip', 'PLACE', 'placeSkip', 'standAt', 'liveOf', 'stageRole'];
  const __leaked = __probe.filter((n) => { try { eval(n); return true; } catch (e) { return false; } });
  const __out = {};
  for (const __k of Object.keys(__SC)) {
    let __r;
    try { __r = eval(__SC[__k]); } catch (e) { __out[__k] = { ok: false, error: String((e && e.message) || e).slice(0, 200) }; continue; }
    if (typeof __r === 'function') {
      __out[__k] = { ok: true, staged: true, cast: __stage.casts[__k] || null };
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try { __r(); } catch (e) { __out[__k].ok = false; __out[__k].unpinError = String((e && e.message) || e).slice(0, 200); }
    } else if (__r && typeof __r.skip === 'string') __out[__k] = { ok: /^SKIP-(R18|legacy)/.test(__r.skip), skip: __r.skip };
    else __out[__k] = { ok: false, returned: __r === null ? 'null' : typeof __r };
  }
  const __hooksLeft = (__CTX__.engine.onAfterRender || []).length;
  const ok = __leaked.length === 0 && Object.values(__out).every((x) => x.ok);
  return { pass: ok, detail: { verdict: (ok ? 'PASS' : 'FAIL') + ': ' + Object.keys(__out).length + ' scenario(s) evaluated in a scope holding STAGE_PRELUDE only — '
      + Object.entries(__out).map(([k, x]) => k + ' ' + (x.staged ? 'staged' : x.skip ? 'skip (' + x.skip.split(':')[0] + ')' : 'ERROR ' + (x.error || x.unpinError || x.returned))).join(', ')
      + '; roster / place helpers visible outside __stage: ' + (__leaked.join(', ') || 'none'),
    scenarios: __out, leakedHelpers: __leaked, placesSource: __stage.placesSource, roles: __stage.KIND, onAfterRenderHooksAfter: __hooksLeft } };
})()`;

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
    title: 'W0b: tools/r5-refs/fetch.mjs pulls from the Wikimedia Commons API filtered to PD / CC0 / CC BY (classifier controls), the set verifies offline, and every V gate in every lane file names >= 1 reference file under reference/r5/** with a MANIFEST row (author, source URL, licence, retrieved date)',
    check: (ctx) => referenceSet(ctx),
  },
  {
    id: 'A-perf-scenarios-self-contained', kind: 'action', lane: LANE, wave: 'W0b', timeout: 120000, settle: 600,
    title: 'W0b (R34): every PERF_SCENARIOS entry, eval\'d in a page scope holding STAGE_PRELUDE and nothing else (as engine-gpu\'s A-terrain-1024-probe / A-rt-ledger-census / A-rt-ledger do), stages or returns a named R18/R28/R30 skip; no roster or place helper is visible outside __stage; every unpin works',
    assert: SELF_CONTAINED,
  },
  {
    id: 'A-alloc-rate', kind: 'runner', lane: LANE, wave: 'W0b', timeout: 300000,
    title: 'W0b: CDP sampling heap profiler over 10 s of the staged fight + 10 s of sprint-and-draw: allocation attributed to src/** (nearest src frame on the stack) <= 64 KB/s, no single src function > 4 KB/s, post-GC heap slope <= 0',
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
    title: 'W0b: staged fight: draws from scene children with no registered owner (direct per-draw count; each registered owner hidden in turn as the paired cross-check, within 1 draw) are recorded at W0 (the cap), non-increasing every wave, <= 30 from the W2 exit',
    check: (ctx) => unattributedCap(ctx),
  },
];
