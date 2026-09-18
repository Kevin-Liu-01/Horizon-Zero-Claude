/**
 * Round 3 gate runner — literal visual + action quality gates.
 *
 * Usage:
 *   node tools/gates.mjs [--port 5173] [--only A2-dodge-displacement,V1-sprint-frame] [--lane animator]
 *
 * Each gate gets a FRESH page (no state bleed). Action gates auto pass/fail from
 * their assert expression; any console error during a gate fails it. Visual gates
 * capture shots/gates/<id>.png for judging against written criteria.
 *
 * Outputs: shots/gates/*.png, shots/gates/report.json, shots/gates/report.md
 * Exit code 1 if any action gate FAILS (pending/skip does not fail the run).
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import net from 'net';
import { GATES as BASE_GATES } from './gates.config.mjs';
import {
  sweepProfiles, profileDir, disposeProfile, installProfileCleanup, countProfiles,
} from './chrome-profile.mjs';
import { formatVerdict, writeLine } from './gate-verdict.mjs';

/**
 * Round 4 lane gates (D8 module ownership): every lane writes its own gates to
 * `tools/gates.round4.<lane>.mjs` exporting `GATES` in the same shape, and they
 * are merged in here. No lane has to edit another lane's file to be gated.
 */
const args = process.argv.slice(2);
const getFlag = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const laneFiles = readdirSync(TOOLS_DIR)
  .filter((f) => /^gates\.round4\..+\.mjs$/.test(f))
  .sort();
/**
 * `--extra <file>` merges ONE more gates module that the directory scan does not
 * see. It exists so a runner change can be exercised against a throwaway gate
 * (e.g. one that deliberately crashes its page) without dropping that gate into
 * `tools/gates.round4.*.mjs`, where every other lane's concurrent suite would
 * pick it up and run it too.
 */
const extraFile = getFlag('--extra', null);
if (extraFile) laneFiles.push(path.resolve(extraFile));
const merged = [...BASE_GATES];
const seen = new Set(merged.map((g) => g.id));
/**
 * A LANE FILE THAT DOES NOT LOAD IS NOT A MISSING LANE, IT IS AN UNRUN ONE
 * (core-platform-followup2). These gate bodies live inside template literals,
 * so a stray backtick in a comment turns a whole lane's file into a
 * SyntaxError. That was handled by printing one stderr line and carrying on —
 * and then the run reported `N gates: N pass, 0 fail`, which reads GREEN while
 * an entire lane's gates silently did not exist. Observed live: two lane files
 * broken at once, both still named in the "merged" line, and a clean summary.
 * Now the failures are collected, kept out of the merged list, repeated in the
 * summary where nobody can miss them, and written into report.json.
 */
const loadFailures = [];
const loadedFiles = [];
for (const file of laneFiles) {
  let mod;
  try {
    mod = await import(pathToFileURL(path.resolve(TOOLS_DIR, file)).href);
  } catch (err) {
    console.error(`[gates] ${file} FAILED TO LOAD — none of its gates will run: ${err.message}`);
    loadFailures.push({ file, error: String(err.message) });
    process.exitCode = 1;
    continue;
  }
  const list = mod.GATES;
  if (!Array.isArray(list)) {
    console.error(`[gates] ${file} does not export a GATES array — skipped`);
    loadFailures.push({ file, error: 'does not export a GATES array' });
    process.exitCode = 1;
    continue;
  }
  loadedFiles.push(file);
  for (const g of list) {
    if (seen.has(g.id)) {
      console.error(`[gates] duplicate gate id "${g.id}" in ${file} — keeping the first`);
      continue;
    }
    seen.add(g.id);
    merged.push({ ...g, source: file });
  }
}
const GATES = merged;
// Only the files that actually contributed gates are reported as merged: the
// old line listed every file it TRIED, including the ones that threw.
if (loadedFiles.length) console.log(`[gates] merged ${loadedFiles.length} lane file(s): ${loadedFiles.join(', ')}`);

const PORT = parseInt(getFlag('--port', process.env.SHOT_PORT || '5173'), 10);
const only = getFlag('--only', null)?.split(',').map((s) => s.trim());
const lane = getFlag('--lane', null);

let gates = GATES;
/**
 * FIX ROUND 2 — a stale gate id in a doc used to look like an empty lane.
 * `--only A27-species-skate` (an id docs/SPEC.md published but that never
 * existed) printed a bare "no gates matched", which reads as "nothing to run
 * here" rather than "you asked for a gate that does not exist". Name every
 * unmatched id, and say so even when the OTHER ids in the list did match — a
 * partially-typo'd list must never report a clean green over four gates when
 * you asked for five.
 */
if (only) {
  const known = new Set(GATES.map((g) => g.id));
  const missing = only.filter((id) => !known.has(id));
  if (missing.length) {
    console.error(`[gates] --only: no gate with id ${missing.map((m) => `"${m}"`).join(', ')}`);
    const words = (id) => id.toLowerCase().replace(/^[av]\d+[a-z]?-/, '').split('-').map((w) => w.replace(/s$/, '')).filter((w) => w.length >= 4);
    const near = (id) => {
      const want = words(id);
      return GATES.map((g) => ({ id: g.id, score: words(g.id).filter((w) => want.includes(w)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4).map((x) => x.id);
    };
    for (const m of missing) {
      const s = near(m);
      if (s.length) console.error(`[gates]   did you mean: ${s.join(', ')}?`);
    }
    console.error(`[gates] ${GATES.length} gates are registered; run without --only to list them.`);
    process.exit(1);
  }
  gates = gates.filter((g) => only.includes(g.id));
}
if (lane) {
  const lanes = [...new Set(GATES.map((g) => g.lane))].sort();
  if (!lanes.includes(lane)) {
    console.error(`[gates] --lane: no gate declares lane "${lane}". Known lanes: ${lanes.join(', ')}`);
    process.exit(1);
  }
  gates = gates.filter((g) => g.lane === lane);
}
if (!gates.length) {
  console.error('no gates matched');
  process.exit(1);
}

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
    cwd: process.cwd(), stdio: 'ignore', detached: false,
  });
  for (let i = 0; i < 60; i++) {
    if (await portOpen(PORT)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

mkdirSync('shots/gates', { recursive: true });

/**
 * PROFILE LEAK (core-platform-followup2). Every relaunch below used to abandon a
 * ~70 MB `puppeteer_dev_chrome_profile-*` in $TMPDIR, because puppeteer only
 * deletes the profile it made inside a clean `browser.close()` — and this runner
 * relaunches on GPU loss and SIGKILLs a wedged browser on the way out. Dozens
 * leaked in one round and filled the disk. Now: sweep stale profiles at startup,
 * launch every browser with an explicit userDataDir we own, and delete it when
 * that browser goes (finally + exit/signal handlers). `disposeProfile` is called
 * on the OLD dir at every relaunch, so a 40-gate run with six relaunches leaves
 * exactly zero directories behind instead of six.
 */
installProfileCleanup();
const swept = sweepProfiles();
// FIX ROUND 2: `reapedOrphans` must be announced on its own. The five trees that
// pinned 691 MB on this box were all in that bucket and `removed` was 0, so the
// old condition printed nothing at all while the disk filled — a silent sweep is
// how the leak stayed invisible for a whole round.
if (swept.removed || swept.reapedOrphans) {
  console.log(`[gates] swept ${swept.removed} stale chrome profile(s)`
    + `${swept.reapedOrphans ? `, incl. ${swept.reapedOrphans} orphaned tree(s) killed `
      + `(pids ${swept.killedPids.join(',')})` : ''}`
    + `${swept.reapedRecycledOwner ? `, incl. ${swept.reapedRecycledOwner} whose owner pid was recycled` : ''}`
    + `${swept.keptInUse ? `, kept ${swept.keptInUse} in use` : ''}`);
}

/**
 * `--js-flags=--expose-gc` and `--enable-precise-memory-info` (memory-attribution).
 *
 * Four gates already ask for both by name and have never had them. Every one of
 * the heap gates is written as `if (window.gc) window.gc();` before it samples
 * `performance.memory`, and `window.gc` only exists behind `--expose-gc`: with
 * the flag missing, the guard silently skipped, no collection ran, and the
 * number each gate reported as "the heap after a forced GC" was the heap
 * INCLUDING everything the workload had just made garbage. Two of them print
 * `'n/a (enable --enable-precise-memory-info)'` in their own detail string,
 * which is the previous round asking for this and being unable to reach the
 * runner. Without that second flag Blink hands back a bucketized, cached
 * `usedJSHeapSize` rather than a live one.
 *
 * Measured with them on, A90-memory-stability-expansion's heap delta is the
 * difference between a number that hovered on its own 25 % bar and a number
 * that is reproducible — see docs/ROUND4-MEMORY.md §4. Neither flag changes
 * what the build does; they change only what the runner is allowed to observe.
 */
const LAUNCH_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
  '--js-flags=--expose-gc', '--enable-precise-memory-info'];
let currentProfile = null;
/**
 * Launch a browser on a fresh, owned profile and bin the previous one. The old
 * directory is removed AFTER the new browser exists, so a launch failure never
 * costs us the ability to retry.
 */
async function launchBrowser() {
  const dir = profileDir(PORT);
  const b = await puppeteer.launch({ protocolTimeout: 900000,  headless: 'new', args: LAUNCH_ARGS, userDataDir: dir });
  const stale = currentProfile;
  currentProfile = dir;
  if (stale) disposeProfile(stale);
  return b;
}

/**
 * FIX ROUND 1 — the runner used to die with the browser. With sixteen lanes
 * driving their own headless Chrome against one GPU, a heavy gate can take the
 * GPU process (and then the browser) down; `browser.newPage()` then threw
 * OUTSIDE the per-gate try, so one crash lost every remaining gate in the run
 * — the whole suite reported nothing. The browser handle is now re-created on
 * demand, and opening the page is inside the retry.
 */
/**
 * FIX ROUND 1 (second pass) — every await in the gate loop needs a wall clock.
 * A suite of mine hung for 13 minutes on `browser.newPage()` with 52 Chrome
 * processes on the box: goto and waitForFunction carry puppeteer timeouts, but
 * newPage, the setup evaluate, the screenshot and page.close do not, so one
 * wedged browser silently ate the rest of the run with no diagnostic line.
 * Anything tagged `infra:` is a broken browser, not a broken build — it
 * relaunches and retries; a gate's own assert timeout stays a FAIL.
 */
const withTimeout = (p, ms, what) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`infra: ${what} timed out after ${ms}ms`)), ms)),
]);

/**
 * LAUNCHED LAZILY (core-platform-followup2). The browser used to start before
 * the gate loop, unconditionally — so `--lane core-platform-followup2`, three
 * gates that run entirely in node and never open a page, still paid for a
 * headless Chrome on a box where seven suites are already fighting over one
 * GPU. Nothing launches now until a gate actually asks for a page. The FIRST
 * launch is not a relaunch and must not be counted or announced as one: that
 * counter is the evidence an operator reads to tell GPU thrash from a build
 * failure, and starting it at 1 on every run would make it useless.
 */
let browser = null;
let relaunches = 0;
async function newPage() {
  if (!browser) {
    browser = await launchBrowser();
  } else if (!browser.connected) {
    try { await browser.close(); } catch { /* already gone */ }
    relaunches++;
    console.log(`[gates] browser was gone — relaunching (${relaunches})`);
    browser = await launchBrowser();
  }
  try {
    return await withTimeout(browser.newPage(), 45000, 'browser.newPage');
  } catch (err) {
    try { await browser.close(); } catch { /* already gone */ }
    relaunches++;
    console.log(`[gates] newPage failed (${err?.message || err}) — relaunching (${relaunches})`);
    browser = await launchBrowser();
    return withTimeout(browser.newPage(), 45000, 'browser.newPage (after relaunch)');
  }
}

/**
 * "The browser died under me" vs "the build is wrong". Puppeteer reports the
 * first as one of these, from any await in the gate body — a crashed tab, a lost
 * GPU process taking the browser with it, or a transport that closed mid-call.
 * None of them is evidence about the code under test, so a gate that ends this
 * way is re-run once on a fresh browser; only if the re-run cannot complete
 * either does it land as `{ reason: 'browser lost' }`.
 */
const BROWSER_LOST = /Target closed|Session closed|Protocol error|Page crashed|crashed|Connection closed|Target\.\w+|detached|browser has disconnected|Navigating frame was detached|Requesting main frame too early|Failed to open a new tab|Browser closed|socket hang up|WebSocket is not open/i;
const isBrowserLost = (msg) => !!msg && BROWSER_LOST.test(String(msg));

/**
 * Neutralise vite's HMR socket. Sixteen lanes save into this repo at once and a
 * full-reload lands in the middle of a running assert, destroying its execution
 * context. The stub reports "connected" so vite's client never logs its
 * connection error (a console error would fail the gate on its own) and then
 * simply never delivers a message.
 */
const HMR_STUB = () => {
  const Real = window.WebSocket;
  function Dead() {
    const target = new EventTarget();
    target.readyState = 1;
    target.protocol = 'vite-hmr';
    target.send = () => {};
    target.close = () => { target.readyState = 3; };
    setTimeout(() => {
      const ev = new Event('open');
      target.dispatchEvent(ev);
      if (typeof target.onopen === 'function') target.onopen(ev);
    }, 0);
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

const results = [];
// Declared before the gate loop, not after it: `writeReport()` is called from
// the loop's `finally`, and a `let` below that point is in its temporal dead
// zone there — the first wedged run to reach it died with a ReferenceError and
// wrote no report at all, which is the exact failure this was added to fix.
let reportWritten = false;

/**
 * EVERY GATE PRINTS EXACTLY ONE VERDICT LINE (core-platform-followup2).
 *
 * WHAT BROKE. When a gate's page or browser died mid-gate — routine here, where
 * seven lanes' headless Chromes fight over one GPU — the result object was
 * pushed with `status: 'FAIL'` and counted in the summary, but the run could
 * still lose its verdict line: anything that escaped the per-gate try (a
 * synchronous throw out of the `finally`'s page.close, a launch failure inside
 * newPage on the retry path) unwound past `results.push` and past the
 * `console.log`, out of the for-loop entirely. The operator then read a summary
 * saying "1 fail" with no line naming which gate, and — because the report was
 * written AFTER the try/finally, not inside it — no report.json either.
 *
 * THE RULE NOW. `emit()` is the only way a result enters the run, and it always
 * prints. Nothing may escape a gate: the body is wrapped, and an escaped throw
 * becomes `[FAIL] <id> {reason:'browser lost', relaunches:n}`. The report is
 * written from the finally.
 */
/**
 * FIX ROUND 1 — `console.log` was not durable enough to carry this line.
 * `process.stdout` is constructed with `kIgnoreErrors: true`: a failed or
 * partial write is swallowed with no throw and no event. A 133-gate run on this
 * box (97 % full, sixteen lanes writing screenshots) counted all 133 in its
 * summary and printed 36 verdict lines — the missing 97 a contiguous block in
 * the middle, invisible to `emitted`/`silent` because every one of them HAD
 * reached emit(). `say()` writes fd 1 synchronously until the whole line is
 * down, and when it cannot, counts the loss and shouts on fd 2. The run can now
 * only be wrong about its own output out loud.
 */
let droppedLines = 0;
const say = (text) => {
  if (writeLine(text)) return;
  droppedLines++;
  writeLine(`[gates] STDOUT WRITE FAILED (${droppedLines}) for: ${String(text).slice(0, 120)}`, 2);
};

const emit = (res) => {
  results.push(res);
  say(formatVerdict(res));
};

try {
  for (const gate of gates) {
    const res = { id: gate.id, kind: gate.kind, lane: gate.lane, title: gate.title };
    const t0 = Date.now();
    /**
     * `kind: 'runner'` — a gate on the HARNESS, not on the build
     * (core-platform-followup2). The runner's own failure handling (every gate
     * prints a verdict; every Chrome profile is reclaimed; no gate hard-codes a
     * speed the build no longer uses) was the only part of this repo with no
     * literal gate, because a page assert cannot see node. These run their
     * `check()` in node — no browser, no page, no screenshot, single-digit
     * milliseconds — and then flow through the SAME `emit()` and the same
     * report as every other gate, so a broken harness shows up in the suite
     * every lane already runs instead of in a script nobody remembers.
     */
    if (gate.kind === 'runner') {
      try {
        const out = await withTimeout(
          Promise.resolve().then(() => gate.check({ PORT, TOOLS_DIR, GATES })),
          gate.timeout ?? 60000, `${gate.id} check`);
        res.pass = out?.pass;
        res.detail = out?.detail;
        res.status = out?.pass === true ? 'PASS' : out?.pass === null ? 'PENDING' : 'FAIL';
      } catch (err) {
        res.status = 'FAIL';
        res.error = String(err?.message || err);
      }
      res.ms = Date.now() - t0;
      emit(res);
      continue;
    }
    let attempt = 0;
    let lostRuns = 0;      // how many attempts ended because the browser went away
    try {
    // Sixteen lanes edit this repo at once and vite answers every save with a
    // full page reload, which destroys the gate's execution context mid-assert.
    // The HMR client is stubbed out below; this retry covers the rest.
    // eslint-disable-next-line no-constant-condition
    while (true) {
    attempt++;
    let page = null;
    const errors = [];
    try {
      page = await newPage();
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.setViewport({ width: 1600, height: 900 });
      await page.evaluateOnNewDocument(HMR_STUB);
      const url = gate.plain
        ? `http://localhost:${PORT}/${gate.params ? '?' + gate.params : ''}`
        : `http://localhost:${PORT}/?shot=1${gate.params ? '&' + gate.params : ''}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (gate.plain) {
        await page.waitForFunction(
          `document.querySelector('#title') && !document.querySelector('#title').classList.contains('hidden')` +
          ` && document.querySelector('#loading') && document.querySelector('#loading').classList.contains('hidden')`,
          { timeout: 90000 });
        await page.evaluate('document.fonts ? document.fonts.ready : true');
      } else {
        // 90 s, not 60: with sixteen lanes' Chromes on one box a cold boot
        // (model loads + shader warm-up) has been measured past 60 s, and a
        // boot that slow is the machine, not the build — see the retry below.
        await page.waitForFunction('window.__READY__ === true', { timeout: 90000 });
      }

      if (gate.setup) await withTimeout(page.evaluate(gate.setup), 60000, `${gate.id} setup`);
      await new Promise((r) => setTimeout(r, gate.settle ?? 1200));

      /**
       * `chaos` — a gate may ask the runner to break the browser under it, so
       * the runner's OWN failure handling can be exercised on demand instead of
       * waited for. `'kill-browser'` SIGKILLs the Chrome that is running this
       * gate (exactly what a lost GPU process does to it on this box);
       * `'kill-page'` closes the target under the pending assert. Only ever set
       * by a throwaway gate module passed with `--extra`; no shipped gate uses
       * it, and the timer is unref'd so it can never hold the run open.
       */
      if (gate.chaos) {
        const victim = page;
        const t = setTimeout(() => {
          if (gate.chaos === 'kill-browser') {
            console.log(`[chaos] ${gate.id} — SIGKILLing this gate's browser`);
            try { browser.process()?.kill('SIGKILL'); } catch { /* already gone */ }
          } else {
            console.log(`[chaos] ${gate.id} — closing this gate's page`);
            victim.close().catch(() => {});
          }
        }, gate.chaosAfter ?? 600);
        if (t.unref) t.unref();
      }

      if (gate.kind === 'action' && gate.assert) {
        const budget = gate.timeout ?? 30000;
        const out = await Promise.race([
          page.evaluate(gate.assert),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`gate assert timeout (${budget}ms)`)), budget)),
        ]);
        res.pass = out?.pass;
        res.detail = out?.detail;
        res.status = out?.pass === true ? 'PASS' : out?.pass === null ? 'PENDING' : 'FAIL';
      } else {
        res.status = 'NEEDS-JUDGE';
        res.criteria = gate.criteria;
      }

      const shotPath = `shots/gates/${gate.id}.png`;
      await withTimeout(page.screenshot({ path: shotPath }), 45000, `${gate.id} screenshot`);
      res.shot = shotPath;

      /**
       * Round 4: the guarded frame loop quarantines a throwing system and logs
       * it as console.warn on purpose (console.error is this runner's hard-fail
       * channel and a quarantined system must not poison an unrelated gate).
       * That closed one hole and opened another: a system throwing 60x/second
       * used to freeze the loop and was impossible to miss, and would now ship
       * green. So every gate reads the quarantine ledger and fails on it.
       * `allowSystemErrors` lists the keys a gate deliberately creates (A20
       * throws from a synthetic system by design).
       */
      const ledger = await withTimeout(page.evaluate(`(() => {
        const g = window.__GAME__;
        if (!g) return null;
        return {
          systemErrors: (g.systemErrors || []).map(r => ({ key: r.key, count: r.count, message: r.message })),
          hookErrors: window.__CTX__?.engine?.hookErrorCount || 0,
        };
      })()`), 20000, `${gate.id} ledger`).catch(() => null);
      if (ledger) {
        const allow = (gate.allowSystemErrors || []).map((p) => new RegExp(p));
        const bad = ledger.systemErrors.filter((r) => !allow.some((re) => re.test(r.key)));
        if (bad.length || ledger.hookErrors) {
          res.systemErrors = bad;
          res.hookErrors = ledger.hookErrors;
          res.status = 'FAIL';
        }
      }

      if (errors.length) {
        res.consoleErrors = errors.slice(0, 8);
        if (gate.kind === 'action') res.status = 'FAIL';
      }
    } catch (err) {
      res.status = gate.kind === 'action' ? 'FAIL' : 'ERROR';
      res.error = String(err?.message || err);
    } finally {
      res.ms = Date.now() - t0;
      // page.close() is wrapped, not just awaited: a dead target makes it throw
      // SYNCHRONOUSLY, and a synchronous throw out of a finally block skips the
      // .catch() entirely and unwinds the whole run.
      try {
        if (page) await withTimeout(page.close(), 15000, 'page.close').catch(() => {});
      } catch { /* the target is already gone; that is the case we are handling */ }
    }
    // "Waiting failed: 90000ms exceeded" is puppeteer's own boot/ready timeout:
    // the page never reached __READY__ in time. On a quiet box that is a real
    // failure; on this one it is the queue, so retry it like any other infra
    // stall and let it fail three times before it counts.
    const lost = isBrowserLost(res.error);
    if (lost) lostRuns++;
    if (attempt < 3 && res.error && (lost || /^infra:|Waiting failed|context was destroyed/i.test(res.error))) {
      console.log(`[retry ${attempt}] ${gate.id} — ${res.error}`
        + `${lost ? ' (browser lost — re-running on a fresh browser)' : ''}`);
      // A wall-clock timeout means the browser itself is wedged: a retry on the
      // same handle would just wait out the next clock. Drop it and let
      // newPage() relaunch. Same for a lost browser — its handle is a corpse.
      if (lost || /^infra:|Waiting failed/.test(res.error)) {
        try { await browser.close(); } catch { /* already gone */ }
      }
      // EVERY per-attempt field goes, not just three. The abandoned attempt's
      // `pass`, `consoleErrors`, `systemErrors`, `hookErrors`, `criteria` and
      // `shot` used to survive into the re-run, so a gate that went green on
      // the second browser could still print the FIRST attempt's console errors
      // in its PASS line and carry them into report.json — a verdict describing
      // a run that was thrown away.
      for (const k of ['error', 'status', 'detail', 'pass', 'consoleErrors',
        'systemErrors', 'hookErrors', 'criteria', 'shot']) delete res[k];
      // The re-run's verdict is the gate's verdict, but the operator has to be
      // able to tell "green" from "green on the second browser".
      res.retried = true;
      res.relaunches = relaunches;
      continue;
    }
    /**
     * Attempts exhausted with the browser still dying under us. This is the
     * case that used to be counted and never printed. It is a FAIL — a gate
     * that cannot be observed has not passed — but it is labelled as infra so
     * nobody spends an hour looking for the bug in the build.
     */
    if (lost) {
      res.status = 'FAIL';
      res.detail = { reason: 'browser lost', relaunches, attempts: attempt, lostRuns };
    }
    break;
    }
    } catch (err) {
      // Nothing may escape a gate. Whatever this was, the gate is unobserved.
      res.status = 'FAIL';
      res.ms = res.ms ?? (Date.now() - t0);
      res.error = String(err?.message || err);
      res.detail = { reason: 'browser lost', relaunches, attempts: attempt, lostRuns, escaped: true };
      // The handle that threw is not reusable; drop it so the NEXT gate gets a
      // fresh browser instead of inheriting the corpse.
      try { await browser?.close(); } catch { /* already gone */ }
    }
    emit(res);
  }
} finally {
  /**
   * FIX ROUND 2 — the report must survive a wedged browser. Every await in the
   * gate LOOP got a wall clock in fix round 1, but this one did not, and it is
   * the one that hangs: a standalone A21 run printed its verdict at 75.7 s and
   * then sat in `browser.close()` for minutes, so `shots/gates/report.*.json`
   * was never written and the run looked like it was still measuring. Close it
   * on a clock, SIGKILL the Chrome if the clock runs out, and write the report
   * either way.
   */
  await withTimeout(browser ? browser.close() : Promise.resolve(), 20000, 'browser.close')
    .catch(() => {
      console.log('[gates] browser.close() wedged — SIGKILLing it');
      try { browser?.process()?.kill('SIGKILL'); } catch { /* already gone */ }
    });
  // Whatever happened to that browser — clean close, wedged close, SIGKILL —
  // its profile directory is ours to delete. This is the path puppeteer skips.
  disposeProfile(currentProfile);
  currentProfile = null;
  if (viteProc) viteProc.kill();
  writeReport();
}

function writeReport() {
  if (reportWritten) return;
  reportWritten = true;
  const stamp = new Date().toISOString();
  /**
   * RECONCILE THE LEDGER, OUT LOUD (core-platform-followup2). "Every gate
   * prints exactly one verdict line" is enforced structurally — `emit()` is the
   * only way a result enters `results`, and it always prints — but a structural
   * invariant is only as good as the next edit. This says so on every run: if a
   * gate was selected and produced no verdict, it is named here rather than
   * silently missing from a summary that still looks like a clean count. An
   * abandoned run reaches this from the `finally`, so the gates it never got to
   * are listed too, which is the difference between "the suite is green" and
   * "the suite stopped".
   */
  const emitted = new Set(results.map((r) => r.id));
  const silent = gates.filter((g) => !emitted.has(g.id)).map((g) => g.id);
  if (silent.length) {
    say(`[gates] ${silent.length} selected gate(s) produced NO verdict line `
      + `(run abandoned before them, or a result never reached emit()): ${silent.join(', ')}`);
    process.exitCode = 1;
  }
  /**
   * FIX ROUND 1 — sixteen lanes run this runner concurrently against one working
   * tree, and every one of them was writing `shots/gates/report.json`. A report
   * read a second after a run finished could easily belong to a different port
   * (observed: port 5201's suite reading back a single-gate report from 5202).
   * The per-port file is the one to cite; the unsuffixed one stays for anything
   * that already reads it. PNGs deliberately stay shared: `shots/` is already
   * 1.9 GB against 8.6 GB free, and every lane renders the same working tree.
   *
   * FOLLOWUP2 — and it is written from the `finally`, not after it. Anything
   * that unwound the gate loop used to skip these four writes entirely, so the
   * one run whose report mattered most (the one that fell over) was the one
   * that produced none.
   */
  // `loadFailures` and `silent` ride along in the report: a consumer reading
  // report.json must be able to see that a lane's gates never ran, which a list
  // of results alone can never show.
  const payload = JSON.stringify({ stamp, port: PORT, results, loadFailures,
    unrunGates: silent, droppedVerdictLines: droppedLines }, null, 2);
  /**
   * FIX ROUND 1 — and these writes are not allowed to fail quietly either. A
   * throw here unwound past the summary and past the markdown report, so the
   * one signal that the report is missing was itself missing. Observed: a run
   * that printed its summary while `report.p<PORT>.json` still held the
   * previous run's three results, with nothing on stdout to say so.
   */
  const wrote = (f, body) => {
    try { writeFileSync(f, body); return true; }
    catch (err) { say(`[gates] REPORT WRITE FAILED ${f}: ${err.message}`); process.exitCode = 1; return false; }
  };
  wrote(`shots/gates/report.p${PORT}.json`, payload);
  wrote('shots/gates/report.json', payload);

  const rows = results.map((r) =>
    `| ${r.id} | ${r.lane} | ${r.status} | ${r.detail ? '`' + JSON.stringify(r.detail).slice(0, 120) + '`' : r.criteria ? r.criteria.slice(0, 90) + '…' : ''} |`
  );
  const md = `# Gate report — ${stamp} (port ${PORT})\n\n| gate | lane | status | detail / criteria |\n|---|---|---|---|\n${rows.join('\n')}\n`;
  wrote(`shots/gates/report.p${PORT}.md`, md);
  wrote('shots/gates/report.md', md);
}

const failed = results.filter((r) => r.status === 'FAIL');
if (relaunches) say(`[gates] browser relaunched ${relaunches}x during this run (shared-GPU contention)`);
// Accounting, not decoration: a gate that failed because the browser died is a
// different conversation from a gate that failed because the build is wrong,
// and the summary is what an orchestrator reads.
const lostGates = results.filter((r) => r.detail && r.detail.reason === 'browser lost');
if (lostGates.length) {
  say(`[gates] ${lostGates.length} gate(s) FAILED as 'browser lost' (infra, not build): `
    + lostGates.map((r) => r.id).join(', '));
}
const retriedGates = results.filter((r) => r.retried);
if (retriedGates.length) {
  say(`[gates] ${retriedGates.length} gate(s) re-run on a fresh browser: `
    + retriedGates.map((r) => `${r.id}=${r.status}`).join(', '));
}
say(`[gates] chrome profiles on disk: ${countProfiles()} (this run leaves 0 of its own)`);
if (droppedLines) {
  say(`[gates] ${droppedLines} line(s) COULD NOT BE WRITTEN to stdout — this run's output is incomplete`);
  process.exitCode = 1;
}
/**
 * FIX ROUND 1 — THE COUNTS MUST ADD UP TO THE RUN.
 *
 * A gate that threw and is not `kind: 'action'` gets `status: 'ERROR'` (line
 * ~487), and the summary counted PASS + FAIL + PENDING + NEEDS-JUDGE only. So a
 * chunk of 31 printed `31 gates: 17 pass, 8 fail, 1 pending, 3 need judging` —
 * 29 — with `V24-draw-vs-reference` and `V25-alarm-converge` timing out into a
 * bucket that appeared in no total and set no exit code. Every verdict line was
 * there; the arithmetic was what lied, and the arithmetic is what an
 * orchestrator reads. The buckets are now derived from the results themselves,
 * every status is printed, and a status that reaches no bucket is named.
 */
const tally = new Map();
for (const r of results) tally.set(r.status, (tally.get(r.status) || 0) + 1);
const LABEL = { PASS: 'pass', FAIL: 'fail', PENDING: 'pending', 'NEEDS-JUDGE': 'need judging', ERROR: 'error' };
const ORDER = ['PASS', 'FAIL', 'ERROR', 'PENDING', 'NEEDS-JUDGE'];
const parts = ORDER.filter((k) => tally.has(k)).map((k) => `${tally.get(k)} ${LABEL[k]}`);
for (const [k, n] of tally) {
  if (ORDER.includes(k)) continue;
  parts.push(`${n} ${String(k ?? 'no-status').toLowerCase()}`);
  say(`[gates] ${n} gate(s) ended with an UNKNOWN status ${JSON.stringify(k)} — not a bucket this runner knows`);
  process.exitCode = 1;
}
say(`\n${results.length} gates: ${parts.join(', ')}`);
/**
 * Repeated LAST, after the counts, because the counts are what gets pasted into
 * a report and they cannot be read as green while a lane's gates never ran. The
 * load errors were printed hundreds of lines earlier, off the top of the scroll.
 */
if (loadFailures.length) {
  say(`[gates] ${loadFailures.length} LANE FILE(S) DID NOT LOAD — their gates did NOT run and are NOT in the counts above:`);
  for (const f of loadFailures) say(`[gates]   ${f.file}: ${f.error}`);
  process.exitCode = 1;
}
// An ERROR is a gate that did not answer. It is not a pass, and it never made
// the run exit non-zero until now.
if (failed.length || (tally.get('ERROR') || 0)) process.exitCode = 1;
/**
 * A killed-but-not-reaped Chrome pipe can keep the event loop alive forever.
 * The report is on disk and the summary is printed, so leave — but on an
 * UNREF'd timer, so a healthy run still exits naturally (and flushes a piped
 * stdout) and only a wedged one gets pushed out the door.
 */
setTimeout(() => process.exit(process.exitCode || 0), 1000).unref();
