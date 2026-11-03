/**
 * A-specs-data-driven, dynamic half (pipeline lane; plan §9):
 * "a fixture SPECS row and its file are removed in a scratch worktree →
 *  A1 and A20b pass with 0 code edits".
 *
 * What it does, in order:
 *   1. preflight (plan §0 rule 8): free disk >= 3 GB, memory_pressure free
 *      >= 25 %, fewer than 2 headless Chromes alive; otherwise it waits and
 *      retries, then returns PENDING (never launches);
 *   2. copies the tree (tracked + untracked-not-ignored files, APFS clones,
 *      `node_modules` symlinked) into `<scratch>/specs-fixture-<pid>/` —
 *      scratch must be outside the repo;
 *   3. in the copy, deletes the `probe` row line from `src/core/assets.specs.js`
 *      and deletes `public/models/pipeline/probe.glb`, then proves the edit is
 *      data-only: the copy differs from the tree in exactly those two paths,
 *      and the specs module is pure data (only plain-object exports);
 *   4. serves the copy with Vite in MIDDLEWARE mode (no TCP port at all: an
 *      http server on a unix socket, `server.ws: false`, a scratch `cacheDir`
 *      so the shared node_modules/.vite cache is never written) from the
 *      copy's REAL path (W0b fix, below), proves Vite transforms modules
 *      before any Chrome launches (`viteProbe`), and drives
 *      ONE headless Chrome whose every request to the fake origin
 *      `http://specs-fixture.invalid` is intercepted and forwarded to that
 *      socket — an un-intercepted request cannot resolve and fails loudly;
 *   5. runs the harness's own A1-boot-clean and A20b-no-system-errors bodies
 *      (imported from tools/gates.config.mjs) the way tools/gates.mjs runs
 *      them: fresh page, HMR stub, `?shot=1`, __READY__, setup, settle,
 *      assert, quarantine ledger, any console error = FAIL;
 *   6. tears everything down (browser, profile, Vite, socket, copy).
 *
 * W0b FIX — why the gate failed on main only (orchestrator run, Oct 16): with
 * R5_SCRATCH unset the scratch defaults to os.tmpdir(), which on macOS is
 * `/var/folders/...` — a path THROUGH the `/var -> /private/var` symlink. Vite
 * keeps `root` as given but resolves every module id to its real path
 * (`/private/var/...`), so `isFileServingAllowed` (fs.allow is derived from
 * the un-real root) refused every source file, the transform was skipped, and
 * the request fell through to the plain static server: JS came back raw and a
 * CSS file imported from JS came back as `text/css` — "Failed to load module
 * script ... MIME type text/css", no __READY__, A1/A20b timed out. The lane
 * runs passed only because R5_SCRATCH pointed at /private/tmp (already real).
 * Now the scratch, the copy and the served root are realpath'd, and
 * `viteProbe` fails in < 1 s with the served MIME types if Vite ever serves
 * an untransformed module again (no 2 x 120 s timeouts, no Chrome launched).
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, rmSync, copyFileSync, symlinkSync, readFileSync, writeFileSync, readdirSync,
  realpathSync, statfsSync, constants as FS,
} from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { cloneFiles } from '../lib/clone.mjs';

export const FIXTURE_ROW = 'probe';
export const FIXTURE_FILE = 'public/models/pipeline/probe.glb';
export const SPECS_FILE = 'src/core/assets.specs.js';
export const ORIGIN = 'http://specs-fixture.invalid';
const GATE_IDS = ['A1-boot-clean', 'A20b-no-system-errors'];
const LAUNCH_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
  '--js-flags=--expose-gc', '--enable-precise-memory-info'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Plan §0 rule 8 preflight. Returns { ok, freeGb, memFreePct, headless }. */
export function preflight(root) {
  let freeGb = null, memFreePct = null, headless = 0;
  try { const s = statfsSync(root); freeGb = +((s.bavail * s.bsize) / 2 ** 30).toFixed(2); } catch { /* unknown */ }
  try {
    const out = execFileSync('memory_pressure', [], { encoding: 'utf8', timeout: 20000 });
    const m = /free percentage:\s*(\d+)%/.exec(out);
    if (m) memFreePct = +m[1];
  } catch { /* not macOS */ }
  try {
    const ps = execFileSync('ps', ['-axo', 'command'], { encoding: 'utf8' });
    headless = ps.split('\n').filter((l) => /Chrom(e|ium)/.test(l) && /--headless/.test(l) && !/--type=/.test(l)).length;
  } catch { /* unknown */ }
  const ok = (freeGb === null || freeGb >= 3) && (memFreePct === null || memFreePct >= 25) && headless < 2;
  return { ok, freeGb, memFreePct, headless };
}

function treeFiles(root) {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 2 ** 20 });
  // `node_modules` itself is excluded too: a symlinked node_modules is not matched by `node_modules/` in .gitignore
  // (a worktree relies on .git/info/exclude for it; a fresh checkout has none)
  return out.split('\0').filter((f) => f && f !== 'node_modules' && !f.startsWith('node_modules/') && !f.startsWith('shots/')
    && existsSync(path.join(root, f)));
}

/**
 * Clone the tree into `dst` with `cp -c` (clonefile: ~0 bytes of disk). W0b:
 * node's COPYFILE_FICLONE was measured making FULL copies on this volume
 * (tools/build/lib/clone.mjs), i.e. every fixture run cost the tree's size.
 */
export function cloneTree(root, dst) {
  const files = treeFiles(root);
  cloneFiles(files.map((f) => [path.join(root, f), path.join(dst, f)]));
  symlinkSync(realpathSync(path.join(root, 'node_modules')), path.join(dst, 'node_modules'));
  return files.length;
}

/** Remove the fixture row (one line) from the copy's specs data file. */
export function dropFixtureRow(dst) {
  const file = path.join(dst, SPECS_FILE);
  const lines = readFileSync(file, 'utf8').split('\n');
  const re = new RegExp(`^\\s*${FIXTURE_ROW}\\s*:\\s*\\{.*\\},\\s*$`);
  const idx = lines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== 1) throw new Error(`fixture row "${FIXTURE_ROW}" must be exactly one line in ${SPECS_FILE} (found ${idx.length})`);
  lines.splice(idx[0], 1);
  writeFileSync(file, lines.join('\n'));
  rmSync(path.join(dst, FIXTURE_FILE));
}

/** The copy differs from the tree ONLY by the fixture line and the fixture file. */
export function diffCopy(root, dst) {
  const changed = [];
  for (const f of treeFiles(root)) {
    const b = path.join(dst, f);
    if (!existsSync(b)) { changed.push({ file: f, change: 'deleted' }); continue; }
    if (!readFileSync(path.join(root, f)).equals(readFileSync(b))) changed.push({ file: f, change: 'modified' });
  }
  return changed;
}

/** The specs module is DATA: every export is a plain object of plain values. */
export async function specsArePureData(file) {
  const src = readFileSync(file, 'utf8');
  if (/^\s*import\s/m.test(src)) return { ok: false, why: 'imports something' };
  const mod = await import(`${pathToFileURL(file).href}?t=${process.hrtime.bigint()}`);
  const plain = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
    || (Array.isArray(v) && v.every(plain))
    || (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(plain));
  const bad = Object.entries(mod).filter(([, v]) => !plain(v)).map(([k]) => k);
  return { ok: !bad.length, exports: Object.keys(mod), bad, rows: Object.keys(mod.SPECS || {}) };
}

/** HMR stub, same contract as tools/gates.mjs. */
const HMR_STUB = () => {
  const Real = window.WebSocket;
  function Dead() {
    const t = new EventTarget();
    t.readyState = 1; t.protocol = 'vite-hmr'; t.send = () => {}; t.close = () => { t.readyState = 3; };
    setTimeout(() => { const ev = new Event('open'); t.dispatchEvent(ev); if (typeof t.onopen === 'function') t.onopen(ev); }, 0);
    return t;
  }
  window.WebSocket = function (url, protocols) {
    const p = Array.isArray(protocols) ? protocols[0] : protocols;
    if (p === 'vite-hmr' || (typeof url === 'string' && url.includes('vite'))) return Dead();
    return new Real(url, protocols);
  };
  window.WebSocket.prototype = Real.prototype;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
};

function forward(socketPath, req) {
  const u = new URL(req.url());
  return new Promise((resolve, reject) => {
    const headers = { ...req.headers(), host: 'localhost' };
    const r = http.request({ socketPath, path: u.pathname + u.search, method: req.method(), headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    r.on('error', reject);
    const body = req.postData();
    if (body) r.write(body);
    r.end();
  });
}

/** First `import './x.css'` statement in a src/**.js file of `dir` -> its URL, or null. */
function firstCssImport(dir) {
  const files = [];
  const walk = (rel) => {
    for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r); else if (e.name.endsWith('.js')) files.push(r);
    }
  };
  walk('src');
  files.sort();
  for (const f of files) {
    let text = '';
    try { text = readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    const m = /^\s*import\s+['"](\.{1,2}\/[^'"]+\.css)['"]/m.exec(text);
    if (m) return `/${path.posix.join(path.posix.dirname(f), m[1])}`;
  }
  return null;
}

/**
 * Before any Chrome: the served copy must TRANSFORM modules. Requests the
 * entry module and the first CSS file a src module imports, the way a module
 * script asks (Accept: *\/*): both must come back as JavaScript, and the entry
 * must carry Vite's rewritten imports. Returns { ok, checks }.
 */
export async function viteProbe(dir, socketPath) {
  const get = (p) => new Promise((resolve) => {
    const r = http.get({ socketPath, path: p, headers: { host: 'localhost', accept: '*/*' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ path: p, status: res.statusCode, type: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', (err) => resolve({ path: p, status: 0, type: '', body: '', error: String(err?.message || err) }));
  });
  const isJs = (r) => r && r.status === 200 && /javascript/.test(r.type);
  const entry = await get('/src/main.js');
  // a transformed entry has its relative imports rewritten to root URLs and the dev-only define replaced
  const checks = [{ path: entry.path, status: entry.status, type: entry.type, bytes: entry.body.length,
    ok: isJs(entry) && /from\s+["']\/src\//.test(entry.body), want: 'transformed JS (imports rewritten to /src/...)' }];
  const cssUrl = firstCssImport(dir);
  if (cssUrl) {
    const css = await get(cssUrl);
    checks.push({ path: css.path, status: css.status, type: css.type, bytes: css.body.length, ok: isJs(css), want: 'CSS imported from JS served as a JS module' });
  }
  return { ok: checks.every((c) => c.ok), root: dir, checks };
}

/** Vite in middleware mode on a unix socket, root exactly as given. `control`: quiet, no dep scan. */
async function startVite(dir, sock, { control = false, cacheDir = null } = {}) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: dir,
    configFile: path.join(dir, 'vite.config.js'),
    cacheDir: cacheDir || path.join(dir, '.vite-cache'),
    logLevel: control ? 'silent' : 'error',
    clearScreen: false,
    ...(control ? { optimizeDeps: { noDiscovery: true, include: [] } } : {}),
    server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } },
  });
  rmSync(sock, { force: true });
  const server = http.createServer(vite.middlewares);
  await new Promise((r, j) => { server.once('error', j); server.listen(sock, r); });
  return { vite, server };
}

/**
 * NEGATIVE CONTROL for `viteProbe`: serve the same copy through a symlinked
 * path WITHOUT realpath (the failure mode of the orchestrator's main run) —
 * the probe must report it (ok: false). No Chrome. Returns { caught, probe }.
 */
export async function probeControl(dir, sock) {
  const link = `${dir}-via-link`;
  rmSync(link, { force: true });
  symlinkSync(dir, link);
  let v = null;
  try {
    v = await startVite(link, sock, { control: true });
    const probe = await viteProbe(link, sock);
    return { caught: !probe.ok, probe };
  } finally {
    if (v) { await new Promise((r) => v.server.close(() => r())); await v.vite.close().catch(() => {}); }
    rmSync(sock, { force: true });
    rmSync(link, { force: true });
  }
}

export async function runGate(browser, gate, socketPath) {
  const res = { id: gate.id };
  const errors = [];
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith(ORIGIN)) { req.continue().catch(() => {}); return; }
      forward(socketPath, req).then((r) => {
        const headers = {};
        for (const [k, v] of Object.entries(r.headers)) if (!/^(connection|transfer-encoding|keep-alive)$/i.test(k)) headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
        return req.respond({ status: r.status, headers, body: r.body });
      }).catch((err) => req.abort('failed').catch(() => {}).finally(() => errors.push(`proxy: ${url} ${err?.message || err}`)));
    });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewport({ width: 1600, height: 900 });
    await page.evaluateOnNewDocument(HMR_STUB);
    await page.goto(`${ORIGIN}/?shot=1${gate.params ? `&${gate.params}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(gate.ready || 'window.__READY__ === true', { timeout: gate.readyTimeout ?? 120000 });
    if (gate.setup) await page.evaluate(gate.setup);
    await sleep(gate.settle ?? 1200);
    const budget = gate.timeout ?? 30000;
    const out = await Promise.race([page.evaluate(gate.assert), sleep(budget).then(() => { throw new Error(`assert timeout ${budget} ms`); })]);
    res.pass = out?.pass; res.detail = out?.detail;
    // optional frame of the asserted state (integration checks of a merged copy film what they grade)
    if (gate.shot) { await page.screenshot({ path: gate.shot }); res.shot = gate.shot; }
    const ledger = await page.evaluate(`(() => ({
      systemErrors: (window.__GAME__?.systemErrors || []).map(r => r.key),
      hookErrors: window.__CTX__?.engine?.hookErrorCount || 0,
      models: Object.keys(window.__CTX__?.assets?.models || {}),
      specs: Object.keys(window.__CTX__?.assets?.specs || {}),
      skipped: (window.__CTX__?.assets?.skipped || []).map(s => s.name + ':' + s.status),
    }))()`);
    res.ledger = ledger;
    if (ledger.systemErrors.length || ledger.hookErrors) res.pass = false;
  } catch (err) {
    res.pass = false; res.error = String(err?.message || err).slice(0, 300);
  } finally {
    await page.close().catch(() => {});
  }
  if (errors.length) { res.pass = false; res.consoleErrors = errors.slice(0, 6); }
  return res;
}

/**
 * Serve `dir` with Vite in middleware mode on a unix socket (no TCP port, no
 * HMR websocket, scratch dep cache) and run gate definitions against it in ONE
 * headless Chrome through request interception. Everything is torn down
 * before it returns. Exported for integration checks of a merged copy.
 */
export async function serveAndRun(dir, gateDefs, { port = 0, sock = path.join(os.tmpdir(), `cal-sf-${process.pid}.sock`), onProbe = null, cacheDir = null } = {}) {
  let vite = null, server = null, browser = null, profile = null, slot = false;
  // the served root must be the REAL path (W0b fix, header): Vite resolves module ids to real paths
  dir = realpathSync(dir);
  const toolsDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
  const cp = await import(pathToFileURL(path.join(toolsDir, 'chrome-profile.mjs')).href);
  const results = [];
  try {
    ({ vite, server } = await startVite(dir, sock, { cacheDir }));
    const probe = await viteProbe(dir, sock);
    if (onProbe) onProbe(probe);
    if (!probe.ok) {
      for (const gate of gateDefs) results.push({ id: gate.id, pass: false, error: `vite served an untransformed module before any Chrome launched: ${JSON.stringify(probe.checks)}` });
      return results;
    }
    const puppeteer = (await import('puppeteer')).default;
    // gates-perf's machine-wide semaphore (W0a), when it is in this tree. Call
    // this module from its own process (see the CLI below): the ticket is per
    // process, so sharing the harness's process would share its ticket.
    if (typeof cp.acquireChromeSlot === 'function') { await cp.acquireChromeSlot(); slot = true; }
    profile = cp.profileDir(port);
    browser = await puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS, userDataDir: profile, protocolTimeout: 600000 });
    for (const gate of gateDefs) {
      if (gate.missing) { results.push({ id: gate.id, pass: false, error: 'gate not found' }); continue; }
      results.push(await runGate(browser, gate, sock));
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (profile) cp.disposeProfile(profile);
    if (slot) cp.releaseChromeSlot?.();
    if (server) await new Promise((r) => server.close(() => r()));
    if (vite) await vite.close().catch(() => {});
    rmSync(sock, { force: true });
  }
  return results;
}

/**
 * Run the whole dynamic check. `scratch` must be outside `root`.
 * Returns { pass: true|false|null, detail }.
 */
export async function runSpecsFixture({ root, scratch, port = 0, waitMs = 180000, log = () => {} }) {
  if (!scratch) return { pass: false, detail: { error: 'scratch dir required (outside the repo)' } };
  // compare and use REAL paths (W0b fix, header): TMPDIR is /var/folders/... -> /private/var/folders/...
  mkdirSync(scratch, { recursive: true });
  scratch = realpathSync(scratch);
  root = realpathSync(root);
  if (scratch === root || scratch.startsWith(root + path.sep)) {
    return { pass: false, detail: { error: `scratch dir must be outside the repo (got ${scratch})` } };
  }
  const t0 = Date.now();
  let pf = preflight(root);
  while (!pf.ok && Date.now() - t0 < waitMs) { log(`[specs-fixture] preflight waiting ${JSON.stringify(pf)}`); await sleep(10000); pf = preflight(root); }
  if (!pf.ok) return { pass: null, detail: { pending: 'preflight refused to launch Chrome (plan §0 rule 8)', preflight: pf } };

  const work = path.join(scratch, `specs-fixture-${process.pid}`);
  const sock = path.join(os.tmpdir(), `cal-sf-${process.pid}.sock`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const detail = { preflight: pf, copy: work };
  try {
    detail.filesCopied = cloneTree(root, work);
    dropFixtureRow(work);
    detail.diff = diffCopy(root, work);
    const expected = [`${SPECS_FILE}:modified`, `${FIXTURE_FILE}:deleted`].sort();
    detail.dataOnly = JSON.stringify(detail.diff.map((d) => `${d.file}:${d.change}`).sort()) === JSON.stringify(expected);
    detail.specsPureData = await specsArePureData(path.join(work, SPECS_FILE));
    if (!detail.dataOnly || !detail.specsPureData.ok) return { pass: false, detail };

    // the probe's negative control: the same copy through a symlink, un-realpath'd, must be caught (no Chrome)
    detail.probeControl = await probeControl(work, sock).catch((err) => ({ caught: null, error: String(err?.message || err).slice(0, 200) }));
    const { GATES } = await import(pathToFileURL(path.join(root, 'tools/gates.config.mjs')).href);
    const defs = GATE_IDS.map((id) => GATES.find((g) => g.id === id) || { id, missing: true });
    detail.gates = await serveAndRun(work, defs, { port, sock, onProbe: (p) => { detail.viteProbe = p; } });
    const fixtureGone = detail.gates.every((g) => g.ledger && !g.ledger.models.includes(FIXTURE_ROW) && !g.ledger.specs.includes(FIXTURE_ROW));
    detail.fixtureAbsentInCopy = fixtureGone;
    return { pass: detail.gates.every((g) => g.pass === true) && fixtureGone, detail };
  } catch (err) {
    detail.error = String(err?.stack || err).slice(0, 600);
    return { pass: false, detail };
  } finally {
    rmSync(sock, { force: true });
    rmSync(work, { recursive: true, force: true });
    detail.ms = Date.now() - t0;
    detail.cleanedUp = !existsSync(work) && !existsSync(sock);
  }
}

/**
 * CLI — the gate runs the dynamic check in a CHILD process so its Chrome holds
 * its own semaphore ticket and its own crash domain:
 *   node tools/build/pipeline/specs-fixture.mjs --root <repo> --scratch <dir> [--port <p>]
 * prints one JSON line `{ pass, detail }`.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (f, d = null) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const root = path.resolve(val('--root', path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')));
  const res = await runSpecsFixture({ root, scratch: val('--scratch'), port: Number(val('--port', 0)), log: (m) => process.stderr.write(`${m}\n`) });
  process.stdout.write(`${JSON.stringify(res)}\n`, () => process.exit(0));
}
