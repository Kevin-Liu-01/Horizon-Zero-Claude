/**
 * ROUND 5 — lane `instruments-core` gates (docs/ROUND5-PLAN.md §9 "instruments-core").
 *
 *   node tools/gates.mjs --port 5254 --extra tools/gates.r5.instruments-core.mjs --lane instruments-core
 *
 * tools/gates.mjs is the frozen harness (plan §1.1; only gates-perf edits it).
 * Its directory scan merges `gates.round4.*.mjs` only, so until gates-perf's
 * `A-gates-autodiscover` imports every `tools/gates.r5.*.mjs` by pattern this
 * file is merged through the runner's own `--extra <file>` flag — the same
 * import and the same GATES-shape merge the lane files get. Once auto-discovery
 * is merged, drop `--extra`:
 *   node tools/gates.mjs --port 5254 --lane instruments-core
 *
 * WAVE W0a (this file today): the foundations block.
 *   A-no-override        Override mechanic gone (R17), removal-only diff proved
 *   A-no-corruption      corruption gone (R17), 10-min staged run
 *   A-legacy-collapse    legacy kinds reachable only through machines/legacy.js;
 *                        a legacy row + its files deleted in a scratch copy
 *                        boots clean (A1, A20b) with 0 other edits
 *   A-roles-published    `ctx.machines.roles` contract (published W0a; the
 *                        gate-roster clause is graded once gates-perf ships it)
 *   A-kind-registration  kind auto-registration: a module dropped into a copy
 *                        registers with 0 kept-file edits (real at W0a)
 *   A-boot-roster        lane guard (fix round 1, not a §9 row): the boot
 *                        roster exists at __READY__ and progression's damage
 *                        wrapper is installed at construction, as in base
 * W0b adds A-lamp-states, A-lamp-canon-distance, A-beams-one-draw,
 * A-perception-weather, A-perk-hooks, A-uv1-survives-fold, A-vfx-palette,
 * A90-rig-reclaim x5, A-kind-block-file.
 *
 * HOW THE STATIC HALVES RUN. Grep / import-graph / diff halves run in node when
 * this module loads — and only when the invocation will run one of these gates
 * (`--only` / `--lane` read the same way gates.mjs reads them) — and ride into
 * the page assert as data, so one gate id carries both halves and either half
 * failing fails the gate (the brand lane's pattern).
 *
 * THE SCRATCH-COPY PROBES (A-legacy-collapse, A-kind-registration) build a
 * throwaway copy of this tree OUTSIDE it (`R5_SCRATCH`, default
 * `<tree>/../ic-probe-<port>` for a lane worktree, else `$TMPDIR/r5-ic-probe-<port>`),
 * apply the edit the gate is about, and run `A1-boot-clean` +
 * `A20b-no-system-errors` (+ a probe gate) there through this same runner on
 * THIS lane's port. A port holds one server, so while a probe runs the lane's
 * own Vite is stopped and then restarted exactly as it was — but only a Vite
 * whose working directory is this tree; anything else on the port makes the
 * probe report PENDING. The copy is deleted afterwards.
 */
import { readFileSync, readdirSync, lstatSync, existsSync, mkdirSync, rmSync, symlinkSync,
  writeFileSync, copyFileSync, readlinkSync } from 'fs';
import { execFileSync, spawn } from 'child_process';
import path from 'path';
import os from 'os';
import net from 'net';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const read = (r) => readFileSync(path.join(ROOT, r), 'utf8');
const LANE = 'instruments-core';

/** The commit the W0a removal-only pass is measured against (W0-day1 + the port amendment). */
export const W0A_BASE = '9d3b891';

/** The 14 files of the §1.2 W0a removal-only grant. */
export const REMOVAL_ONLY_FILES = [
  'src/audio/audio.js', 'src/combat/melee.js', 'src/core/progression.js',
  'src/entities/machines/ai/engage.js', 'src/entities/machines/ai/squad.js',
  'src/entities/machines/ai/stimulus.js', 'src/entities/playerAnimator.js',
  'src/studio/cast.js', 'src/studio/pose.js', 'src/ui/focus.js', 'src/ui/menu.js',
  'src/world/props/activities.js', 'src/world/props/places.js', 'src/world/props/tallneck.js',
];

/* ------------------------------------------------------------------ */
/* invocation: compute the static halves only when one of ours runs    */
/* ------------------------------------------------------------------ */
const ARGV = process.argv.slice(2);
const flag = (f) => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : null; };
function wanted(id) {
  const only = flag('--only');
  if (only) return only.split(',').map((s) => s.trim()).includes(id);
  const lane = flag('--lane');
  return !lane || lane === LANE;
}

/* ------------------------------------------------------------------ */
/* source helpers                                                      */
/* ------------------------------------------------------------------ */
function walk(r, out = []) {
  const abs = path.join(ROOT, r);
  if (!existsSync(abs)) return out;
  const st = lstatSync(abs);
  if (st.isDirectory()) {
    for (const f of readdirSync(abs).sort()) walk(r ? `${r}/${f}` : f, out);
  } else if (/\.(js|mjs)$/.test(r)) out.push(r);
  return out;
}

/** Every regular file under `r` (any extension), for a literal `src/**` text scan. */
function walkAll(r, out = []) {
  const abs = path.join(ROOT, r);
  if (!existsSync(abs)) return out;
  const st = lstatSync(abs);
  if (st.isDirectory()) {
    for (const f of readdirSync(abs).sort()) walkAll(r ? `${r}/${f}` : f, out);
  } else if (st.isFile()) out.push(r);
  return out;
}

let _esbuild = null;
async function esbuild() {
  if (!_esbuild) _esbuild = await import('esbuild');
  return _esbuild;
}
const _code = new Map();
/**
 * The file's CODE: every comment stripped by esbuild's whitespace minifier
 * (identifiers, strings and syntax untouched — no identifier or syntax
 * minification). Without minifyWhitespace esbuild keeps comments in some
 * positions, which is not good enough for the code-only scans (A-no-corruption's
 * identifiers, A-legacy-collapse's kept-file rows, A-no-override's extra code
 * check). A-no-override's §9 bar itself is graded on RAW text (see below).
 */
async function codeOf(r) {
  if (_code.has(r)) return _code.get(r);
  const { transformSync } = await esbuild();
  let code;
  try {
    code = transformSync(read(r), { loader: 'js', legalComments: 'none', minifyWhitespace: true, target: 'esnext' }).code;
  } catch (e) {
    code = null;
  }
  _code.set(r, code);
  return code;
}

/** Regex hits in minified code, reported as a 90-char window around each. */
function grepCode(code, re) {
  const out = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (const m of code.matchAll(g)) {
    out.push({ at: m.index, text: code.slice(Math.max(0, m.index - 40), m.index + 50) });
    if (out.length > 20) break;
  }
  return out;
}

function grepLines(text, re) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) out.push({ line: i + 1, text: lines[i].trim().slice(0, 140) });
  return out;
}

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { maxBuffer: 1 << 28 }).toString();

/** Is `after` obtainable from `before` by deletions alone (a character subsequence)? */
function isSubsequence(before, after) {
  let i = 0;
  for (let j = 0; j < before.length && i < after.length; j++) if (before.charCodeAt(j) === after.charCodeAt(i)) i++;
  return i === after.length;
}

/**
 * The removal-only proof. Each granted file's W0a version must be the base with
 * characters deleted and nothing inserted. In later waves hero-body and brand
 * edit `playerAnimator.js` / `menu.js` (plan §3.1), so for a file whose working
 * copy is no longer a subsequence the proof is taken on the FIRST commit after
 * the base that touched it — which is this lane's W0a merge, because the plan
 * merges it before those lanes start.
 */
function removalOnlyAudit() {
  const rows = [];
  let ok = true;
  let base = null;
  try { base = git('rev-parse', '--verify', `${W0A_BASE}^{commit}`).trim(); } catch { /* shallow or foreign tree */ }
  if (!base) return { ok: null, note: `base ${W0A_BASE} not in this repository`, rows };
  for (const f of REMOVAL_ONLY_FILES) {
    let before;
    try { before = git('show', `${base}:${f}`); } catch { rows.push({ f, verdict: 'MISSING-AT-BASE' }); ok = false; continue; }
    const after = existsSync(path.join(ROOT, f)) ? read(f) : '';
    if (isSubsequence(before, after)) {
      rows.push({ f, verdict: 'deletions-only', removedChars: before.length - after.length, against: 'working tree' });
      continue;
    }
    let first = null;
    try { first = git('log', '--format=%H', '--reverse', `${base}..HEAD`, '--', f).split('\n').filter(Boolean)[0] || null; } catch { /* */ }
    if (first) {
      const v = git('show', `${first}:${f}`);
      if (isSubsequence(before, v)) {
        rows.push({ f, verdict: 'deletions-only', removedChars: before.length - v.length, against: first.slice(0, 9), laterEditsBy: 'other lanes' });
        continue;
      }
    }
    rows.push({ f, verdict: 'HAS-INSERTIONS', at: first ? first.slice(0, 9) : 'working tree' });
    ok = false;
  }
  return { ok, base: base.slice(0, 9), rows };
}

/* ------------------------------------------------------------------ */
/* A-no-override — static half                                         */
/* ------------------------------------------------------------------ */
/* The §9 regex, verbatim. The bar is "0 matches in `src/**`": it is applied to
 * the RAW text of every file under src/ (every extension, comments included),
 * with no allowlist: a raw hit fails the gate wherever it sits. The code half
 * (comments stripped by esbuild) and the mechanic-identifier scan must also be 0. */
const OVERRIDE_RE = /override-node|overridden|\bOVERRIDE\b|overrideNode|cauldron-override/;
const MECHANIC_IDENTIFIERS = /\b(OverrideSystem|canOverride|overrideCfg|_stateOverridden|mountedBy|mountSeat|_mountEntry|dismount)\b|machines\.(override|mount)\b|\.overrides\b/;

async function noOverrideStatic() {
  const all = walkAll('src');
  const files = all.filter((f) => /\.(js|mjs)$/.test(f));
  const rawHits = [];
  for (const f of all) {
    for (const h of grepLines(read(f), OVERRIDE_RE)) rawHits.push({ f, ...h });
  }
  const codeHits = [];
  const identHits = [];
  for (const f of files) {
    const code = await codeOf(f);
    if (code == null) { codeHits.push({ f, line: 0, text: 'esbuild could not parse' }); continue; }
    for (const h of grepCode(code, OVERRIDE_RE)) codeHits.push({ f, ...h });
    for (const h of grepCode(code, MECHANIC_IDENTIFIERS)) identHits.push({ f, ...h });
  }
  return {
    overrideJsAbsent: !existsSync(path.join(ROOT, 'src/entities/machines/ai/override.js')),
    filesScanned: all.length, jsFilesParsed: files.length,
    rawHits, codeHits, identHits,
    removalOnly: removalOnlyAudit(),
  };
}

/* ------------------------------------------------------------------ */
/* A-no-corruption — static half                                       */
/* ------------------------------------------------------------------ */
const CORRUPT_RE = /_updateCorruption|\bcorrupt\b|\buncorrupt\b|ECOSYSTEM\.corruption|\bcorruption\s*:|\bcorrupted\b|_corruptor\b|machine-corrupted|machine-uncorrupted/;
async function noCorruptionStatic() {
  const files = walk('src');
  const hits = [];
  for (const f of files) {
    const code = await codeOf(f);
    if (code == null) { hits.push({ f, line: 0, text: 'esbuild could not parse' }); continue; }
    for (const h of grepCode(code, CORRUPT_RE)) hits.push({ f, ...h });
  }
  return { filesScanned: files.length, codeHits: hits };
}

/* ------------------------------------------------------------------ */
/* A-legacy-collapse — static half (import graph + kept-file rows)     */
/* ------------------------------------------------------------------ */
const IP_KIND_FILES = ['watcher', 'sawtooth', 'behemoth', 'thunderjaw', 'redeye']
  .map((k) => `src/entities/machines/${k}.js`);
const LEGACY_DATA_FILES = ['src/entities/machines/rig/shells-expansion.js', 'src/entities/machines/rig/rigs-expansion.js'];
const KEPT_MACHINE_FILES = [
  'src/entities/machines/index.js', 'src/entities/machines/machine.js', 'src/entities/machines/autorig.js',
  'src/entities/machines/variety-assets.js', 'src/entities/machines/parts.js', 'src/entities/machines/gait.js',
  'src/entities/machines/ai/tables.js', 'src/entities/machines/ai/doctrine.js', 'src/entities/machines/ai/index.js',
  'src/entities/machines/ai/attacks.js', 'src/entities/machines/ai/perception.js', 'src/entities/machines/ai/squad.js',
  'src/entities/machines/rig/shells.js', 'src/entities/machines/rig/lod.js',
];

/** Kind id -> species module, read from legacy.js's own import lines. */
function legacyModules() {
  const f = 'src/entities/machines/legacy.js';
  if (!existsSync(path.join(ROOT, f))) return { kinds: [], modules: [] };
  const text = read(f);
  const modules = [];
  for (const m of text.matchAll(/^import \{ (\w+) \} from '\.\/(\w+)\.js';$/gm)) {
    if (/^[A-Z]/.test(m[1])) modules.push(`src/entities/machines/${m[2]}.js`);
  }
  const kinds = [...text.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1]);
  return { kinds, modules };
}

function importsOf(r, text) {
  const out = [];
  const re = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^import\s*['"]([^'"]+)['"]/gm;
  for (const m of text.matchAll(re)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    if (spec.startsWith('.')) out.push(rel(path.resolve(path.join(ROOT, path.dirname(r)), spec)));
    else if (spec.startsWith('/src/')) out.push(spec.slice(1));
  }
  return out;
}

async function legacyCollapseStatic() {
  const { kinds, modules } = legacyModules();
  const legacySet = new Set([...modules, ...LEGACY_DATA_FILES, 'src/entities/machines/legacy.js']);
  const files = [...walk('src'), ...walk('tools').filter((f) => /^tools\/gates/.test(f) === false)];
  const strayImports = [];
  const ipImports = [];
  for (const f of files) {
    const text = read(f);
    for (const imp of importsOf(f, text)) {
      if (IP_KIND_FILES.includes(imp) || imp === 'src/entities/machines/ai/override.js') ipImports.push({ f, imp });
      if (!legacySet.has(imp) || legacySet.has(f)) continue;
      // (index.js reaches legacy.js through a guarded import.meta.glob, the one door, which this static scan does not list)
      strayImports.push({ f, imp });
    }
  }
  // kept machine files carry no legacy (or IP) kind ROW: no `kind:` key and no
  // 'kind' string literal in their code
  const allKinds = [...new Set([...kinds, 'watcher', 'sawtooth', 'behemoth', 'thunderjaw', 'redeye', 'tallneck'])];
  const rowRe = new RegExp(`(^|[\\s{,])(${allKinds.join('|')})\\s*:|['"](${allKinds.join('|')})['"]`);
  const keptRows = [];
  for (const f of KEPT_MACHINE_FILES) {
    if (!existsSync(path.join(ROOT, f))) continue;
    const code = await codeOf(f);
    if (code == null) { keptRows.push({ f, line: 0, text: 'esbuild could not parse' }); continue; }
    for (const h of grepCode(code, rowRe)) keptRows.push({ f, ...h });
  }
  return {
    legacyKinds: kinds,
    legacyModules: modules,
    ipFilesPresent: IP_KIND_FILES.filter((f) => existsSync(path.join(ROOT, f))),
    ipImports, strayImports, keptRows,
    oneDoor: read('src/entities/machines/index.js').includes("import.meta.glob('./legacy.js'"),
  };
}

/* ------------------------------------------------------------------ */
/* scratch-copy probes                                                 */
/* ------------------------------------------------------------------ */
const portOpen = (port) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1');
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return ''; } };

function listenerPid(port) {
  const out = sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).trim().split('\n').filter(Boolean);
  return out.length ? +out[0] : null;
}
function cwdOf(pid) {
  const out = sh('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const m = out.match(/^n(.+)$/m);
  return m ? m[1] : null;
}
function isDescendant(pid, of) {
  let p = pid;
  for (let i = 0; i < 6 && p > 1; i++) {
    const pp = +sh('ps', ['-o', 'ppid=', '-p', String(p)]).trim();
    if (pp === of) return true;
    p = pp;
  }
  return false;
}

function probeRoot(port) {
  if (process.env.R5_SCRATCH) return path.join(process.env.R5_SCRATCH, `ic-probe-${port}`);
  if (path.basename(ROOT) === 'tree') return path.join(path.dirname(ROOT), `ic-probe-${port}`);
  return path.join(os.tmpdir(), `r5-ic-probe-${port}`);
}

/**
 * A copy of this tree for a probe: src/ and tools/ copied (they get edited),
 * everything else symlinked (public/ file by file under public/models, so one
 * model can be left out), node_modules symlinked. A few MB on disk.
 */
function makeCopy(dir, { dropModels = [] } = {}) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const copyTree = (r) => {
    const abs = path.join(ROOT, r);
    const st = lstatSync(abs);
    if (st.isDirectory()) {
      mkdirSync(path.join(dir, r), { recursive: true });
      for (const f of readdirSync(abs)) copyTree(`${r}/${f}`);
    } else if (st.isSymbolicLink()) {
      symlinkSync(path.resolve(path.dirname(abs), readlinkSync(abs)), path.join(dir, r));
    } else copyFileSync(abs, path.join(dir, r));
  };
  // src/ and tools/ are copied whole (src/main.js names modules under tools/,
  // and the runner itself lives there): ~8 MB
  for (const r of ['src', 'tools']) copyTree(r);
  for (const f of ['index.html', 'vite.config.js', 'package.json']) {
    if (existsSync(path.join(ROOT, f))) copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  mkdirSync(path.join(dir, 'public'), { recursive: true });
  for (const f of readdirSync(path.join(ROOT, 'public'))) {
    if (f === 'models') continue;
    symlinkSync(path.join(ROOT, 'public', f), path.join(dir, 'public', f));
  }
  const linkModels = (r) => {
    const abs = path.join(ROOT, 'public', r);
    const st = lstatSync(abs);
    if (st.isDirectory()) {
      mkdirSync(path.join(dir, 'public', r), { recursive: true });
      for (const f of readdirSync(abs)) linkModels(`${r}/${f}`);
    } else if (!dropModels.includes(`public/${r}`)) {
      symlinkSync(abs, path.join(dir, 'public', r));
    }
  };
  linkModels('models');
}

/**
 * Run `ids` through this runner inside the copy on `port`. The lane's own Vite
 * is stopped for the duration (only one whose cwd is this tree) and restored.
 */
async function runInCopy(dir, port, ids, { extra = null } = {}) {
  const pid = listenerPid(port);
  let restore = null;
  if (pid) {
    const cwd = cwdOf(pid);
    if (!cwd || path.resolve(cwd) !== path.resolve(ROOT)) {
      return { ok: null, note: `port ${port} is held by a server not started from this tree (pid ${pid}, cwd ${cwd}) — probe not run` };
    }
    restore = { ours: isDescendant(pid, process.pid) };
    try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
    for (let i = 0; i < 40 && await portOpen(port); i++) await sleep(250);
    if (await portOpen(port)) return { ok: null, note: `could not free port ${port}` };
  }
  const args = ['tools/gates.mjs', '--port', String(port), '--only', ids.join(',')];
  if (extra) args.push('--extra', extra);
  /**
   * BOUNDED, AND NEVER ORPHANED. The nested run gets PROBE_DEADLINE; past it,
   * or if this process exits first (the outer runner's own check timeout), it
   * is killed, and so is any server left on the port from the copy.
   */
  const reapCopyServer = () => {
    const p2 = listenerPid(port);
    if (p2 && path.resolve(cwdOf(p2) || '') === path.resolve(dir)) { try { process.kill(p2, 'SIGTERM'); } catch { /* */ } }
  };
  const out = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    const onExit = () => { try { child.kill('SIGKILL'); } catch { /* */ } reapCopyServer(); };
    process.on('exit', onExit);
    let buf = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGTERM'); } catch { /* */ } }, PROBE_DEADLINE);
    child.stdout.on('data', (d) => { buf += d; });
    child.stderr.on('data', (d) => { buf += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      process.removeListener('exit', onExit);
      resolve({ code, buf, timedOut });
    });
  });
  if (out.timedOut) {
    reapCopyServer();
    for (let i = 0; i < 40 && await portOpen(port); i++) await sleep(250);
  }
  let report = null;
  try { report = JSON.parse(readFileSync(path.join(dir, 'shots/gates/report.json'), 'utf8')); } catch { /* */ }
  const results = (report?.results || report?.gates || (Array.isArray(report) ? report : []))
    .map((r) => ({ id: r.id, status: r.status, detail: r.detail, consoleErrors: r.consoleErrors, error: r.error }));
  if (restore) {
    const v = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
      cwd: ROOT, stdio: 'ignore', detached: !restore.ours,
    });
    if (restore.ours) process.on('exit', () => { try { v.kill(); } catch { /* */ } });
    else v.unref();
    for (let i = 0; i < 80 && !(await portOpen(port)); i++) await sleep(250);
  }
  const verdicts = Object.fromEntries(ids.map((id) => [id, results.find((r) => r.id === id)?.status ?? 'NOT-RUN']));
  return {
    ok: ids.every((id) => verdicts[id] === 'PASS'),
    verdicts,
    results,
    exit: out.code, timedOut: out.timedOut || undefined,
    tail: out.buf.split('\n').filter((l) => /^\[(PASS|FAIL|PENDING|ERROR)/.test(l)).map((l) => l.slice(0, 220)),
  };
}

/** Remove one kind's row (and its class import) from a copy's legacy.js. */
function dropLegacyRow(dir, kind) {
  const f = path.join(dir, 'src/entities/machines/legacy.js');
  const lines = readFileSync(f, 'utf8').split('\n');
  const start = lines.findIndex((l) => l === `  ${kind}: {`);
  if (start < 0) return { ok: false, note: `no row '${kind}'` };
  let end = start + 1;
  while (end < lines.length && lines[end] !== '  },') end++;
  const row = lines.slice(start, end + 1);
  const cls = (row.join('\n').match(/^ {4}Cls: (\w+),$/m) || [])[1];
  const out = lines.filter((l, i) => (i < start || i > end) && !(cls && l === `import { ${cls} } from './${kind}.js';`));
  writeFileSync(f, out.join('\n'));
  return { ok: true, removedLines: lines.length - out.length, cls };
}

/* ------------------------------------------------------------------ */
/* the static halves, computed once per invocation that needs them     */
/* ------------------------------------------------------------------ */
const STATIC = {
  override: wanted('A-no-override') ? await noOverrideStatic() : null,
  corruption: wanted('A-no-corruption') ? await noCorruptionStatic() : null,
};

/** The static halves, exported so they can be run on their own (`node -e`). */
export { noOverrideStatic, noCorruptionStatic, legacyCollapseStatic, removalOnlyAudit };

/** Page-side helpers shared by the live halves. */
const WAIT_BOOT = `
  const M = __CTX__.machines;
  { const t0 = performance.now();
    while (!M.expansionReady && performance.now() - t0 < 90000) await new Promise(r => setTimeout(r, 250)); }`;

const LEGACY_PROBE_KINDS = ['scrapper', 'snapmaw'];
/** Wall clock for one nested probe run (two page gates; ~60 s when healthy). */
const PROBE_DEADLINE = 240000;

export const GATES = [
  /* ---------------------------------------------------------------- */
  /* A-legacy-collapse (runner: node only, then probes in a copy)      */
  /* ---------------------------------------------------------------- */
  {
    id: 'A-legacy-collapse', kind: 'runner', lane: LANE, timeout: 900000,
    title: 'Legacy kinds are reachable only through machines/legacy.js; deleting one legacy row + its files boots clean (A1, A20b) with 0 other edits (x2 kinds), and so does deleting the whole legacy set',
    check: async ({ PORT }) => {
      const s = await legacyCollapseStatic();
      const staticOk = s.ipFilesPresent.length === 0 && s.ipImports.length === 0
        && s.strayImports.length === 0 && s.keptRows.length === 0 && s.oneDoor && s.legacyKinds.length > 0;
      const probes = [];
      for (const kind of LEGACY_PROBE_KINDS) {
        if (!s.legacyKinds.includes(kind)) { probes.push({ kind, ok: null, note: 'row already gone' }); continue; }
        const dir = probeRoot(PORT);
        const species = `src/entities/machines/${kind}.js`;
        const spec = read('src/entities/machines/legacy.js').match(new RegExp(`^ {2}${kind}: \\{[\\s\\S]*?url: '(/models/[^']+)'`, 'm'));
        const model = spec ? `public${spec[1]}` : null;
        makeCopy(dir, { dropModels: model ? [model] : [] });
        const edit = dropLegacyRow(dir, kind);
        rmSync(path.join(dir, species), { force: true });
        // 0 other edits: the copy differs from the tree by exactly the row, its class import, its file, its model
        const res = edit.ok ? await runInCopy(dir, PORT, ['A1-boot-clean', 'A20b-no-system-errors']) : { ok: false, note: edit.note };
        probes.push({ kind, deleted: { row: edit.removedLines, file: species, model }, ...res });
        rmSync(dir, { recursive: true, force: true });
      }
      /**
       * ...and the W2-exit shape (`A-legacy-gone`), proved now: the WHOLE
       * legacy set gone — legacy.js, both legacy rig data files, every species
       * module and every legacy model — boots clean on the Instrument kinds
       * alone. This is what instruments-b's deletion grant will do.
       */
      {
        const dir = probeRoot(PORT);
        const text = read('src/entities/machines/legacy.js');
        const models = [...text.matchAll(/^ {4}spec: \{ url: '(\/models\/[^']+)'/gm)].map((m) => `public${m[1]}`);
        makeCopy(dir, { dropModels: models });
        const files = ['src/entities/machines/legacy.js', ...LEGACY_DATA_FILES, ...s.legacyModules];
        for (const f of files) rmSync(path.join(dir, f), { force: true });
        const res = await runInCopy(dir, PORT, ['A1-boot-clean', 'A20b-no-system-errors']);
        probes.push({ kind: 'ALL (W2-exit shape)', deleted: { files: files.length, models: models.length }, ...res });
        rmSync(dir, { recursive: true, force: true });
      }
      const probeOk = probes.every((p) => p.ok === true);
      const pending = probes.some((p) => p.ok === null);
      return {
        pass: staticOk && probeOk ? true : (!staticOk || probes.some((p) => p.ok === false)) ? false : (pending ? null : false),
        detail: { static: s, probes },
      };
    },
  },

  /* ---------------------------------------------------------------- */
  /* A-no-override                                                    */
  /* ---------------------------------------------------------------- */
  {
    id: 'A-no-override', kind: 'action', lane: LANE, timeout: 180000, settle: 600,
    title: 'Override is gone (R17): override.js absent, OVERRIDE table undefined, no FSM state overridden/ally/mount, 0 regex hits in the raw text of src/** (comments included, no allowlist), the W0a diff on the 14 granted files is deletions only',
    assert: `(async () => {
      const S = ${JSON.stringify(STATIC.override)};
      if (!S) return { pass: null, detail: 'static half not computed in this invocation' };
      ${WAIT_BOOT}
      const T = await import('/src/entities/machines/ai/tables.js');
      const Mach = await import('/src/entities/machines/machine.js');
      const live = {
        tablesOVERRIDE: typeof T.OVERRIDE, overrideCfg: typeof T.overrideCfg,
        eyeOverride: Mach.EYE_COLORS && 'override' in Mach.EYE_COLORS,
        protoState: typeof Mach.Machine.prototype._stateOverridden,
        fsm: Mach.MACHINE_STATES || null,
        api: ['override', 'canOverride', 'mount', 'dismount', 'overrides', 'mounted'].filter(k => M[k] !== undefined),
      };
      // every live kind, every state the FSM can be asked for: never overridden/ally/mount
      const FORBIDDEN = /overrid|ally|mount/i;
      const asked = ['patrol', 'suspicious', 'alert', 'search', 'attack', 'return', 'stagger', 'downed', 'overridden', 'ally', 'mount', 'mounted'];
      const p = __CTX__.player;
      const kinds = M.kinds.filter(k => M.canSpawn(k));
      const seen = {};
      const bad = [];
      for (const k of kinds) {
        const m = M.spawn(k, p.position.x + 60, p.position.z + 60);
        if (!m) continue;
        seen[k] = [];
        for (const s of asked) {
          try { m.forceState(s); } catch (e) { /* a refused state is fine */ }
          await new Promise(r => setTimeout(r, 40));
          if (!seen[k].includes(m.state)) seen[k].push(m.state);
          if (FORBIDDEN.test(m.state)) bad.push(k + ':' + m.state);
        }
        // and the machine never targets another machine for the player
        if (m.ally || m.leader === p || m.followTarget) bad.push(k + ':ally-field');
        M.sites.dispose(m);
      }
      const staticOk = S.overrideJsAbsent && S.rawHits.length === 0 && S.codeHits.length === 0
        && S.identHits.length === 0 && S.removalOnly.ok === true;
      const liveOk = live.tablesOVERRIDE === 'undefined' && live.overrideCfg === 'undefined' && !live.eyeOverride
        && live.protoState === 'undefined' && live.api.length === 0 && bad.length === 0 && kinds.length > 0
        && Array.isArray(live.fsm) && !live.fsm.some(s => FORBIDDEN.test(s));
      return { pass: staticOk && liveOk, detail: {
        static: { overrideJsAbsent: S.overrideJsAbsent, filesScanned: S.filesScanned, jsFilesParsed: S.jsFilesParsed,
          rawHits: S.rawHits, codeHits: S.codeHits, identHits: S.identHits, removalOnly: S.removalOnly },
        live, kindsStaged: kinds, statesSeen: seen, forbidden: bad,
      } };
    })()`,
  },

  /* ---------------------------------------------------------------- */
  /* A-no-corruption (10-minute staged run)                           */
  /* ---------------------------------------------------------------- */
  {
    id: 'A-no-corruption', kind: 'action', lane: LANE, timeout: 720000, settle: 600,
    title: 'Corruption is gone (R17): _updateCorruption / corrupt / uncorrupt / ECOSYSTEM.corruption absent; no live machine has corrupted === true over a 10-min staged fight',
    assert: `(async () => {
      const S = ${JSON.stringify(STATIC.corruption)};
      if (!S) return { pass: null, detail: 'static half not computed in this invocation' };
      ${WAIT_BOOT}
      const T = await import('/src/entities/machines/ai/tables.js');
      const sq = M.squads;
      const live = {
        ecosystemCorruption: T.ECOSYSTEM && 'corruption' in T.ECOSYSTEM,
        squadsApi: ['corrupt', 'uncorrupt', '_updateCorruption'].filter(k => typeof sq[k] === 'function'),
      };
      // STAGE: the one kind that used to corrupt (if it is still a legacy kind)
      // in a fight, with every other spawnable kind inside the old 25 m radius.
      const p = __CTX__.player;
      const cx = p.position.x + 40, cz = p.position.z - 40;
      const kinds = M.kinds.filter(k => M.canSpawn(k));
      const order = kinds.includes('corruptor') ? ['corruptor', ...kinds.filter(k => k !== 'corruptor')] : kinds;
      const staged = [];
      for (let i = 0; i < Math.min(order.length, 7); i++) {
        const a = (i / 7) * Math.PI * 2;
        const m = M.spawn(order[i], cx + Math.sin(a) * (i ? 9 : 0), cz + Math.cos(a) * (i ? 9 : 0));
        if (m) staged.push(m);
      }
      let events = 0;
      const onEv = () => { events++; };
      __CTX__.events.on('machine-corrupted', onEv);
      p.position.set(cx + 11, 0, cz); p._snapToGround?.();
      const t0 = performance.now();
      let samples = 0, corruptedSeen = 0, corruptorField = 0, maxAlert = 0;
      const states = {};
      while (performance.now() - t0 < 600000) {
        p.health = p.maxHealth;                         // keep the fight going
        if (__CTX__.state === 'dead' && __CTX__.menus?.respawn) __CTX__.menus.respawn('checkpoint');
        if (Math.hypot(p.position.x - cx, p.position.z - cz) > 30) { p.position.set(cx + 11, 0, cz); p._snapToGround?.(); }
        for (const m of staged) {
          if (!m.alive && !m._disposed && staged.length) { /* corpse: leave it */ }
          if (m.alive && (m.state === 'patrol' || m.state === 'return')) m.forceState('attack');
        }
        let alerted = 0;
        for (const m of M.list) {
          if (m.corrupted === true) corruptedSeen++;
          if (m._corruptor) corruptorField++;
          if (m.state === 'alert' || m.state === 'attack') alerted++;
          states[m.state] = (states[m.state] || 0) + 1;
        }
        maxAlert = Math.max(maxAlert, alerted);
        samples++;
        await new Promise(r => setTimeout(r, 250));
      }
      const seconds = Math.round((performance.now() - t0) / 1000);
      for (const m of staged) M.sites.dispose(m);
      const staticOk = S.codeHits.length === 0;
      const liveOk = !live.ecosystemCorruption && live.squadsApi.length === 0
        && corruptedSeen === 0 && corruptorField === 0 && events === 0 && seconds >= 600 && maxAlert >= 2;
      return { pass: staticOk && liveOk, detail: {
        static: S, live, staged: staged.map(m => m.kind), seconds, samples,
        corruptedSeen, corruptorField, corruptionEvents: events, maxSimultaneouslyEngaged: maxAlert,
      } };
    })()`,
  },

  /* ---------------------------------------------------------------- */
  /* A-roles-published (W0a stub; real by the W0 exit)                */
  /* ---------------------------------------------------------------- */
  {
    id: 'A-roles-published', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
    title: 'ctx.machines.roles maps the 12 roles to a live non-legacy kind or null + note; herd -> the Tiller fixture; no legacy kind mapped; no forbidden role id',
    assert: `(async () => {
      ${WAIT_BOOT}
      const R = M.roles, N = M.roleNotes || {};
      const ROLES = ['sentry', 'herd', 'swarm', 'flanker', 'heavy', 'keeper', 'duelist', 'artillery', 'support', 'spotter', 'ambusher', 'colossus'];
      const keys = R ? Object.keys(R) : [];
      const shape = !!R && keys.length === 12 && ROLES.every(r => keys.includes(r));
      const legacyMapped = keys.filter(r => R[r] && M.isLegacyKind?.(R[r]));
      const nullWithoutNote = keys.filter(r => R[r] == null && !(N[r] && /R18/.test(N[r])));
      const notLive = keys.filter(r => R[r] && !M.canSpawn(R[r]));
      const forbidden = keys.filter(r => /charger|burrower|grazer|stalker|watcher|apex|scout/i.test(r));
      // stage the mapped role: it must spawn as itself and be non-legacy
      let staged = null;
      if (R?.herd) {
        const p = __CTX__.player;
        const m = M.spawn(R.herd, p.position.x + 30, p.position.z + 30);
        staged = m ? { kind: m.kind, modelKind: m.modelKind, legacy: M.isLegacyKind(m.kind) } : null;
        if (m) M.sites.dispose(m);
      }
      const pass = shape && legacyMapped.length === 0 && nullWithoutNote.length === 0 && notLive.length === 0
        && forbidden.length === 0 && R.herd === 'tiller' && staged && staged.kind === 'tiller' && !staged.legacy;
      return { pass, detail: {
        roles: R, notes: N, legacyMapped, nullWithoutNote, notLive, forbidden, staged,
        gateRoster: 'tools/gate-roster.mjs is gates-perf\\'s (W0a); its "resolves every role" clause is graded at the W0 exit',
      } };
    })()`,
  },

  /* ---------------------------------------------------------------- */
  /* A-boot-roster (lane guard, fix round 1)                          */
  /* ---------------------------------------------------------------- */
  /**
   * THE BOOT CONTRACT the legacy collapse first broke (judge finding,
   * instruments-core W0a fix round 1). Base built its authored roster in the
   * `Machines` constructor; `progression.js` installs its difficulty/skill
   * damage wrapper through `machines.list[0]` when it is constructed, and the
   * Round-4 suite stages on whatever is alive at `__READY__`. Deferring the
   * whole roster left the wrapper to a 1 Hz retry (A64b/A64c FAIL) and
   * A62/A63 with nothing to stage.
   *
   * `settle: 0` and no WAIT_BOOT: the assert's first sample is taken the
   * moment `__READY__` is true. `main.js` sets `__READY__` BEFORE it starts
   * the frame loop, so no `Progression.update` (and so no hook retry) can
   * have run by then — a wrapper present at that sample was installed at
   * construction. Then it waits for the deferred kinds and checks the boot
   * roster was not spawned twice and the deferred half really landed.
   */
  {
    id: 'A-boot-roster', kind: 'action', lane: LANE, timeout: 120000, settle: 0,
    title: 'Boot contract: the BOOT_SPECS roster exists at __READY__ (spawned in the Machines constructor) and the progression damage wrapper is installed at construction; the deferred kinds land later without re-spawning it',
    assert: `(async () => {
      const C = __CTX__, M = C.machines;
      const prog = window.__PROG__ || C.progression;
      const tReady = Math.round(performance.now());
      const L = await import('/src/entities/machines/legacy.js');
      const bootKinds = Object.keys(L.BOOT_SPECS || {});
      const count = (k) => M.list.filter(m => m.kind === k && m.alive && !m._disposed).length;
      const census = () => Object.fromEntries(bootKinds.map(k => [k, count(k)]));
      const at = {
        aliveAtReady: M.list.filter(m => m.alive && !m._disposed).length,
        perKind: census(),
        modelsAtReady: bootKinds.filter(k => !!C.assets.models[k]),
        bootAudit: M.bootAudit ? JSON.parse(JSON.stringify(M.bootAudit.boot)) : null,
        expansionReadyAtReady: M.expansionReady, varietyReadyAtReady: M.varietyReady,
        wrapperAtReady: !!prog?._machineProto?.takeDamage?.__calWrapped,
        hookTriesAtReady: prog?._hookTries ?? null, hookedAtReady: prog?._hooked ?? null,
        listHead: M.list[0]?.kind ?? null,
      };
      const t0 = performance.now();
      while (!M.expansionReady && performance.now() - t0 < 90000) await new Promise(r => setTimeout(r, 100));
      const after = {
        waitedMs: Math.round(performance.now() - t0), expansionReady: M.expansionReady,
        aliveAfter: M.list.filter(m => m.alive && !m._disposed).length,
        perKind: census(),
        deferred: M.bootAudit ? JSON.parse(JSON.stringify(M.bootAudit.deferred)) : null,
        herdKind: M.roles?.herd ?? null,
        herdAlive: M.roles?.herd ? count(M.roles.herd) : 0,
      };
      const bootRoster = at.bootAudit?.roster ?? 0;
      const checks = {
        bootRowsPublished: bootKinds.length > 0,
        bootModelsAtReady: at.modelsAtReady.length === bootKinds.length,
        bootKindsSpawnedInCtor: !!at.bootAudit && bootKinds.every(k => at.bootAudit.kinds.includes(k)),
        rosterAtReady: bootRoster > 0 && at.aliveAtReady >= bootRoster && bootKinds.every(k => at.perKind[k] > 0)
          && bootKinds.reduce((n, k) => n + at.perKind[k], 0) === bootRoster,
        wrapperAtConstruction: at.wrapperAtReady === true,
        deferredLanded: after.expansionReady === true && (after.deferred?.expansion ?? 0) > 0 && after.herdAlive > 0,
        bootRosterNotRespawned: (after.deferred?.roster ?? -1) === 0
          && bootKinds.every(k => after.perKind[k] === at.perKind[k]),
      };
      return { pass: Object.values(checks).every(Boolean),
        detail: { checks, tReadyMs: tReady, bootKinds, atReady: at, afterDeferred: after } };
    })()`,
  },

  /* ---------------------------------------------------------------- */
  /* A-kind-registration (runner: a module dropped into a copy)       */
  /* ---------------------------------------------------------------- */
  {
    id: 'A-kind-registration', kind: 'runner', lane: LANE, timeout: 420000,
    title: 'A kind module dropped into src/instruments/kinds/ registers spec, class, tables, audio set and spawn rows with 0 kept-file edits; cfg() returns its rows merged over default',
    check: async ({ PORT }) => {
      const dir = probeRoot(PORT);
      makeCopy(dir);
      // THE ONLY DIFFERENCE between the copy and this tree: one new kind module
      writeFileSync(path.join(dir, PROBE_KIND_FILE), PROBE_KIND_SRC);
      writeFileSync(path.join(dir, 'tools/gates.ic-probe.mjs'), PROBE_GATES_SRC);
      const res = await runInCopy(dir, PORT, ['A1-boot-clean', 'A20b-no-system-errors', 'A-kind-registration-probe'],
        { extra: 'tools/gates.ic-probe.mjs' });
      rmSync(dir, { recursive: true, force: true });
      return { pass: res.ok, detail: { droppedModule: PROBE_KIND_FILE, ...res } };
    },
  },
];

/**
 * RUNNER GATES FIRST. The harness launches its own headless Chrome lazily, at
 * the first page gate; the two probes launch a Chrome of their own inside the
 * copy. Running every probe before any page gate keeps this lane at ONE live
 * Chrome at a time (plan §0 rule 8). Array.prototype.sort is stable.
 */
GATES.sort((a, b) => (a.kind === 'runner' ? 0 : 1) - (b.kind === 'runner' ? 0 : 1));

/* -------------------------------------------------------------------- */
/* the drop-in probe: a throwaway kind module + its page assert          */
/* -------------------------------------------------------------------- */
const PROBE_KIND_FILE = 'src/instruments/kinds/zz-icprobe.js';
/** A new kind built from the fixture's class and model, with tables of its own. */
const PROBE_KIND_SRC = `import tiller from './tiller.js';
export default {
  ...tiller,
  id: 'icprobe',
  role: null,
  fixture: true,
  tables: {
    perception: { gain: 1.234, periphRange: 7.5 },
    engage: { archetype: 'skittish', band: [5.1, 13.3] },
    attacks: tiller.tables.attacks.slice(0, 2),
    attackMode: 'table',
    elem: 77,
  },
  audio: { set: 'icprobe', mass: 'small' },
  doctrine: { spawn: [{ n: 1, x: 120, z: 40, route: 12, poi: 'ic-probe' }] },
};
`;
const KIND_ASSERT = (id, want) => `(async () => {
  ${WAIT_BOOT}
  const T = await import('/src/entities/machines/ai/tables.js');
  const D = await import('/src/entities/machines/ai/doctrine.js');
  const id = ${JSON.stringify(id)}, want = ${JSON.stringify(want)};
  const d = M.instrumentKinds?.[id];
  const perc = T.perceptionCfg(id), eng = T.engageCfg(id), react = T.reactCfg(id);
  const merged = {
    perceptionOwn: perc.gain === want.gain,
    perceptionDefault: perc.d0 === T.PERCEPTION.default.d0 && perc.tick === T.PERCEPTION.default.tick,
    engageOwn: JSON.stringify(eng.band) === JSON.stringify(want.band),
    engageDefault: eng.hyst === T.ENGAGE.default.hyst,
    reactDefault: react.critDamage === T.REACT.default.critDamage,
    attacks: T.attackTable(id).length, mode: T.attackMode(id), elem: T.elemThreshold(id),
  };
  const spawnRows = D.SPAWN_PLAN.filter(r => r.kind === id).length;
  const live = M.list.filter(m => m.kind === id && m.alive);
  const pass = !!d && M.kinds.includes(id) && M.canSpawn(id) && !!__CTX__.assets.models[id]
    && Object.values(merged).every(v => v !== false) && merged.attacks === want.attacks
    && merged.mode === 'table' && merged.elem === want.elem
    && M.kindAudio?.[id]?.set === want.audio && spawnRows > 0 && live.length > 0
    && live.every(m => m.modelKind === id) && M.isLegacyKind(id) === false;
  return { pass, detail: { kind: id, source: d?.source, registered: M.kinds.includes(id),
    modelLoaded: !!__CTX__.assets.models[id], merged, audio: M.kindAudio?.[id], spawnRows,
    liveAtBoot: live.length, role: M.roleOf(id) } };
})()`;
const PROBE_GATES_SRC = `export const GATES = [{
  id: 'A-kind-registration-probe', kind: 'action', lane: 'ic-probe', timeout: 120000, settle: 400,
  title: 'drop-in kind module + the fixture both registered',
  assert: \`(async () => {
    const a = await ${KIND_ASSERT('icprobe', { gain: 1.234, band: [5.1, 13.3], attacks: 2, elem: 77, audio: 'icprobe' }).replace(/`/g, '\\`').replace(/\$\{/g, '\\${')};
    const b = await ${KIND_ASSERT('tiller', { gain: 2.1, band: [4.2, 14], attacks: 4, elem: 110, audio: 'tiller' }).replace(/`/g, '\\`').replace(/\$\{/g, '\\${')};
    return { pass: a.pass === true && b.pass === true, detail: { dropIn: a.detail, fixture: b.detail } };
  })()\`,
}];
`;
