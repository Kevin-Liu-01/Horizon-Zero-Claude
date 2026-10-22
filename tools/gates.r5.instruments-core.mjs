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

/**
 * OLD KIND NAMES COME FROM THE SPEC, NEVER FROM LITERALS HERE (plan §9 "no gate
 * names a species"; gates-perf's `A-gate-preludes` scans this file for quoted
 * Round-4 kind ids): the Round-4 kinds are bible §10.2's "old kind" column (by
 * role), the deleted IP kinds are the `*.js` files of plan §6's first row (R30).
 * The static scans need the names to prove the deletions; no page gate stages
 * one (R28).
 */
function oldKindVocabulary() {
  const bible = read('docs/ROUND5-BIBLE.md');
  const at = bible.indexOf('### 10.2 Machines');
  const byRole = {};
  const all = [];
  for (const line of bible.slice(at, bible.indexOf('\n### ', at + 10)).split('\n')) {
    const m = /^\| ([^|]+) \| \*\*[A-Za-z]+\*\* \| `([a-z]+)` \|$/.exec(line.trim());
    if (!m) continue;
    const names = m[1].split(',').map((w) => w.trim().toLowerCase().replace(/-/g, '')).filter((w) => /^[a-z]+$/.test(w));
    byRole[m[2]] = names;
    all.push(...names);
  }
  const plan = read('docs/ROUND5-PLAN.md');
  const s6 = plan.slice(plan.indexOf('## 6. DELETE list'));
  const row = s6.split('\n').find((l) => /HZD IP/.test(l)) || '';
  const ip = [...row.matchAll(/`(\w+)\.js`/g)].map((m) => m[1]).filter((k) => k !== 'legacy');
  return { all: [...new Set(all)], byRole, ip };
}
export const OLD_KINDS = oldKindVocabulary();
/** A quoted kind id for the Round-4 source text a re-stage rewrites (built, so this file holds no literal). */
const q = (k) => "'" + k + "'";

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
        rows.push({ f, verdict: 'deletions-only', removedChars: before.length - v.length, against: first.slice(0, 9), laterEdits: 'after the W0a merge (other lanes, or a later grant)' });
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
const IP_KIND_FILES = OLD_KINDS.ip.map((k) => `src/entities/machines/${k}.js`);
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
  const allKinds = [...new Set([...kinds, ...OLD_KINDS.ip, ...OLD_KINDS.all])];
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
/**
 * The kind that used to corrupt others, read from the W0a base's doctrine
 * (`if (kind === X) { m._corruptor = ... }`), so A-no-corruption stages the old
 * trigger without naming a species here.
 */
function corruptingKind() {
  try {
    const t = git('show', `${W0A_BASE}:src/entities/machines/ai/doctrine.js`);
    return (/if \(kind === '(\w+)'\) \{\s*m\._corruptor = /.exec(t) || [])[1] || null;
  } catch { return null; }
}
const CORRUPTING_KIND = wanted('A-no-corruption') ? corruptingKind() : null;

const STATIC = {
  override: wanted('A-no-override') ? await noOverrideStatic() : null,
  corruption: wanted('A-no-corruption') ? await noCorruptionStatic() : null,
};

/**
 * gates-perf's role roster (`tools/gate-roster.mjs`, §3.2 consumer of
 * `ctx.machines.roles`): A-roles-published runs its ROSTER prelude in the page.
 * In a tree without it (before gates-perf merges) `R5_GATE_ROSTER=<path>` names
 * the module to grade against; with neither, that clause is PENDING.
 */
async function rosterInfo() {
  const cands = [path.join(ROOT, 'tools/gate-roster.mjs'), process.env.R5_GATE_ROSTER].filter(Boolean);
  for (const f of cands) {
    if (!existsSync(f)) continue;
    try {
      const mod = await import(pathToFileURL(path.resolve(f)).href);
      if (typeof mod.ROSTER === 'string') return { file: f.startsWith(ROOT) ? rel(f) : f, prelude: mod.ROSTER, roles: mod.ROLES || null };
    } catch { /* try the next */ }
  }
  return null;
}
const ROSTER_INFO = wanted('A-roles-published') ? await rosterInfo() : null;

/** The static halves, exported so they can be run on their own (`node -e`). */
export { noOverrideStatic, noCorruptionStatic, legacyCollapseStatic, removalOnlyAudit };

/** Page-side helpers shared by the live halves. */
const WAIT_BOOT = `
  const M = __CTX__.machines;
  { const t0 = performance.now();
    while (!M.expansionReady && performance.now() - t0 < 90000) await new Promise(r => setTimeout(r, 250)); }`;

/**
 * The two legacy rows the A-legacy-collapse probes delete: one BOOT kind and one
 * deferred kind, read from legacy.js's own rows (the 2nd boot row and the 3rd
 * deferred row: the same two the W0a probes deleted).
 */
function legacyProbeKinds() {
  const f = 'src/entities/machines/legacy.js';
  if (!existsSync(path.join(ROOT, f))) return [];
  const text = read(f);
  const rows = [...text.matchAll(/^ {2}(\w+): \{$([\s\S]*?)^ {2}\},$/gm)].map((m) => ({ kind: m[1], boot: /registerAt: 'boot'/.test(m[2]) }));
  const boot = rows.filter((r) => r.boot), later = rows.filter((r) => !r.boot);
  return [boot[1]?.kind, later[2]?.kind].filter(Boolean);
}
const LEGACY_PROBE_KINDS = legacyProbeKinds();
/** Wall clock for one nested probe run (two page gates; ~60 s when healthy). */
const PROBE_DEADLINE = 240000;

const W0A_GATES = [
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
      const OLD_CORRUPTOR = ${JSON.stringify(CORRUPTING_KIND)};
      const order = OLD_CORRUPTOR && kinds.includes(OLD_CORRUPTOR) ? [OLD_CORRUPTOR, ...kinds.filter(k => k !== OLD_CORRUPTOR)] : kinds;
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
      // "tools/gate-roster.mjs resolves every role": gates-perf's ROSTER prelude run against this page
      const RS = ${JSON.stringify(ROSTER_INFO ? { file: ROSTER_INFO.file, roles: ROSTER_INFO.roles } : null)};
      let gateRoster = null;
      if (RS) {
        const RR = await (async () => {
          ${ROSTER_INFO ? ROSTER_INFO.prelude : ''}
          return { KIND, ROLE_NOTE, STAGED_KINDS: typeof STAGED_KINDS !== 'undefined' ? STAGED_KINDS : null };
        })();
        const rows = ROLES.map(r => ({ role: r, published: R ? R[r] : undefined, roster: RR.KIND[r], label: RR.ROLE_NOTE[r] && RR.ROLE_NOTE[r].label }));
        const unresolved = rows.filter(x => x.published ? x.roster !== x.published : !(x.roster === null && x.label));
        const rosterRoles = RS.roles || [];
        gateRoster = { file: RS.file, rosterRolesMatch: rosterRoles.length === 12 && ROLES.every(r => rosterRoles.includes(r)),
          unresolved, stagedKinds: RR.STAGED_KINDS, stagedLegacy: (RR.STAGED_KINDS || []).filter(k => M.isLegacyKind(k)), rows };
        gateRoster.ok = gateRoster.rosterRolesMatch && unresolved.length === 0 && gateRoster.stagedLegacy.length === 0
          && Array.isArray(RR.STAGED_KINDS) && RR.STAGED_KINDS.includes(R.herd);
      }
      const core = shape && legacyMapped.length === 0 && nullWithoutNote.length === 0 && notLive.length === 0
        && forbidden.length === 0 && R.herd === 'tiller' && staged && staged.kind === 'tiller' && !staged.legacy;
      // the gate-roster clause is graded whenever the roster module exists; without it the gate cannot PASS (PENDING, named)
      const pass = !core ? false : !gateRoster ? null : gateRoster.ok;
      return { pass, detail: {
        roles: R, notes: N, legacyMapped, nullWithoutNote, notLive, forbidden, staged,
        gateRoster: gateRoster || 'PENDING: tools/gate-roster.mjs (gates-perf) is not in this tree and R5_GATE_ROSTER is unset — the "resolves every role" clause cannot be graded',
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


/* -------------------------------------------------------------------- */
/* the drop-in probe: a throwaway kind module + its page assert          */
/* -------------------------------------------------------------------- */
const PROBE_KIND_FILE = 'src/instruments/kinds/zz-icprobe.js';
/** A new kind built from the fixture's class and model, with tables of its own. */
const PROBE_KIND_SRC = `import tiller from './tiller.js';
import { REST_SITE } from '../../world/island/sites.js';
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
  doctrine: { spawn: [{ n: 1, x: REST_SITE.x + 98, z: REST_SITE.z + 10, route: 12, poi: 'ic-probe' }] },
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

/* ===================================================================== */
/* ===================================================================== */
/*  WAVE W0b — the lamp grammar, the perk + weather hooks, uv1, the VFX   */
/*  palette, the memory bars on the role-based workload, the kind block   */
/* ===================================================================== */
/* ===================================================================== */
/**
 * W0b rows (plan §9 instruments-core):
 *   A-lamp-states            rendered lamp pixels at 15 m, per state (kind-block builder)
 *   A-lamp-canon-distance    every lamp / beam / scanner / compass-pip token >= 20 from canon (runner, static)
 *   A-beams-one-draw         8 wary Tillers in fog: 1 beam draw; spawn/kill x3 + dispose to baseline
 *   A-perception-weather     calima sight x0.5 ±5 %, trade 1.0, detectMul x0.5 probe
 *   A-perk-hooks             detectMul / flagDuration / noise filter, each with its negative control (R31)
 *   A-uv1-survives-fold      a generated GLB with a decal uv1 through rig/lod.js's fold
 *   A-vfx-palette            every machine particle / glint emitter >= 15 from #38c6ff and #19ffd0
 *   A90-rig-reclaim          (shadow, staged kinds) and A90-rig-reclaim-5of5 (5 fresh-page runs)
 *   A90b-memory-attribution  (shadow, role-based herd workload, R34) and -3of3 (3 fresh-page runs)
 *   A-kind-block-file        tools/gates.r5.kind-block.mjs exports the block; it runs green on the fixture
 *   A37 / A39 / A43          must-stay-green rows re-staged on the Tiller fixture (herd role, R28)
 *
 * SHADOW IDS. Under gates-perf's registry (`gates.config.mjs` auto-discovers
 * `tools/gates.r5.*.mjs`, `LANE_FILE_RE`) a row here shadows the carried row of
 * the same id (plan §3.3). Under the Round-4 runner (this tree until gates-perf
 * merges) the round4 lane files are merged BEFORE `--extra` and a duplicate id
 * keeps the FIRST row, so the shadowed rows are exported as `<id>@ic` (the
 * hero-body convention, `@hero`) and `--lane instruments-core` runs them.
 */
import { pathToFileURL } from 'url';

const IS_REGISTRY = (() => {
  try { return read('tools/gates.config.mjs').includes('LANE_FILE_RE'); } catch { return true; }
})();
export const shadowId = (id) => (IS_REGISTRY ? id : `${id}@ic`);

/** Import the first module of `rels` that exists (round4 files move to tools/gates/archive/ at gates-perf's merge). */
async function importFirst(rels) {
  for (const r of rels) {
    const abs = path.join(ROOT, r);
    if (existsSync(abs)) {
      try { return await import(pathToFileURL(abs).href); } catch { /* try the next */ }
    }
  }
  return null;
}

const MEM = await importFirst(['tools/gates.round4.memory.mjs', 'tools/gates/archive/gates.round4.memory.mjs']);
const MAI = await importFirst(['tools/gates.round4.machine-ai.mjs', 'tools/gates/archive/gates.round4.machine-ai.mjs']);
const KB = await import(pathToFileURL(path.join(ROOT, 'tools/gates.r5.kind-block.mjs')).href);
const COL = await import(pathToFileURL(path.join(ROOT, 'src/instruments/lib/color.js')).href);

/** Where nested runs keep their reports (outside the tree, deleted afterwards). */
function runsRoot() {
  if (process.env.R5_SCRATCH) return path.join(process.env.R5_SCRATCH, 'ic-runs');
  if (path.basename(ROOT) === 'tree') return path.join(path.dirname(ROOT), 'runs');
  return path.join(os.tmpdir(), 'r5-ic-runs');
}

/**
 * N FRESH-PAGE RUNS of one gate, in sequence, each its own runner process with
 * its own browser (one Chrome at a time: runner rows run before this file's
 * page rows, so the parent has not launched its own). Reports land in scratch,
 * never over the tree's shots/gates/report.json, and are summarised here.
 */
async function nRuns(PORT, ids, n, tag, { lane = null, timeoutMs = 600000 } = {}) {
  const runs = [];
  const me = fileURLToPath(import.meta.url);
  for (let k = 0; k < n; k++) {
    const dir = path.join(runsRoot(), `${tag}-${process.pid}-${k}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const args = [path.join(ROOT, 'tools/gates.mjs'), '--port', String(PORT), '--extra', me];
    if (lane) args.push('--lane', lane); else args.push('--only', ids.join(','));
    const out = await new Promise((resolve) => {
      const child = spawn(process.execPath, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      const kill = () => { try { child.kill('SIGKILL'); } catch { /* */ } };
      process.on('exit', kill);
      let buf = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGTERM'); } catch { /* */ } }, timeoutMs);
      child.stdout.on('data', (d) => { buf += d; });
      child.stderr.on('data', (d) => { buf += d; });
      child.on('close', (code) => { clearTimeout(timer); process.removeListener('exit', kill); resolve({ code, buf, timedOut }); });
    });
    let report = null;
    try { report = JSON.parse(readFileSync(path.join(dir, 'shots/gates/report.json'), 'utf8')); } catch { /* */ }
    const results = (report?.results || report?.gates || []).map((r) => ({
      id: r.id, status: r.status, ms: r.ms, error: r.error, consoleErrors: r.consoleErrors,
      detail: r.detail,
    }));
    runs.push({ run: k + 1, exit: out.code, timedOut: out.timedOut || undefined, results,
      tail: out.buf.split('\n').filter((l) => /^\[(PASS|FAIL|PENDING|ERROR|retry)/.test(l)).map((l) => l.slice(0, 300)) });
    rmSync(dir, { recursive: true, force: true });
  }
  return runs;
}

/* ------------------------------------------------------------------ */
/* A-lamp-canon-distance — static (node)                               */
/* ------------------------------------------------------------------ */
const CANON = ['#38c6ff', '#ffb31f', '#ff2413', '#19ffd0', '#9B6BFF'];
const LAMP_WORDS = /lamp|beam|sensor|\beye|scanner|sighting|alidade|compass|\bpip|iris|\blens/i;

/** Hex / rgb() colour literals on a line, as '#rrggbb'. */
function colourLiterals(line) {
  const out = [];
  for (const m of line.matchAll(/(?:#|0x)([0-9a-fA-F]{6})\b/g)) out.push('#' + m[1].toLowerCase());
  for (const m of line.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    out.push('#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join(''));
  }
  return out;
}

/** Code lines with comments removed, line numbers kept (JS and CSS). */
function codeLines(text, css) {
  const lines = text.split('\n');
  let inBlock = false;
  return lines.map((l) => {
    let s = l;
    if (inBlock) {
      const e = s.indexOf('*/');
      if (e < 0) return '';
      s = s.slice(e + 2); inBlock = false;
    }
    s = s.replace(/\/\*.*?\*\//g, '');
    const b = s.indexOf('/*');
    if (b >= 0) { s = s.slice(0, b); inBlock = true; }
    if (!css) {
      const c = s.search(/(^|[^:'"\\])\/\//);
      if (c >= 0) s = s.slice(0, c + (s[c] === '/' ? 0 : 1));
    }
    return s;
  });
}

const ownerOf = (f) => (/^src\/(instruments|entities\/machines)\//.test(f) ? 'instruments-core'
  : /^src\/ui\//.test(f) ? 'shell-ui (W2)' : /^src\/style\.css$|^index\.html$/.test(f) ? 'brand / shell-ui'
    : /^src\/combat\//.test(f) ? 'combat-kit (W2)' : 'other');

async function canonDistanceStatic() {
  const L = await import(pathToFileURL(path.join(ROOT, 'src/instruments/lamps.js')).href);
  const rows = [];
  const grade = (source, name, hex, graded = true, note = undefined) => {
    const ds = CANON.map((c) => +COL.deltaE(hex, c).toFixed(1));
    const min = Math.min(...ds);
    rows.push({ source, name, hex, minDE: min, nearest: CANON[ds.indexOf(min)], graded, ok: min >= 20, note });
  };
  // 1. the published tokens (instruments-core's contract surface)
  for (const s of L.LAMP_ORDER) grade('lamps.js LAMP_STATES', s, L.LAMP_STATES[s].token);
  for (const s of L.LAMP_ORDER) grade('lamps.js COMPASS_PIP', s, L.COMPASS_PIP[s].color);
  for (const [k, v] of Object.entries(L.SCANNER_TOKENS)) grade('lamps.js SCANNER_TOKENS', k, v);
  const lampsSrc = read('src/instruments/lamps.js');
  const beamFromTokens = /this\.lin\[id\][\s\S]{0,40}|const c = hexToRgb\(LAMP_STATES\[id\]\.token\)/.test(lampsSrc)
    && /const lc = this\.lin\[s\]/.test(lampsSrc);
  for (const s of L.LAMP_ORDER) grade('lamps.js beam tint (LampSystem.lin <- LAMP_STATES)', s, L.LAMP_STATES[s].token);
  // 2. every colour literal in a lamp / beam / sensor / eye / scanner / sighting / compass / pip context
  const files = walkAll('src').filter((f) => /\.(js|css)$/.test(f)).concat(existsSync(path.join(ROOT, 'index.html')) ? ['index.html'] : []);
  const scanned = [];
  for (const f of files) {
    const css = /\.css$/.test(f);
    const lines = codeLines(read(f), css);
    let selector = '';
    lines.forEach((l, i) => {
      if (css && /\{/.test(l)) selector = l;
      const ctx = css ? selector + ' ' + l : l;
      const fileCtx = /focus\.(js|css)$|sighting/.test(f);
      if (!LAMP_WORDS.test(ctx) && !fileCtx) return;
      if (/LAMP_CANON\s*=/.test(l)) return;               // the canon reference list itself
      if (/shellMaterials\(sensorColor = /.test(l)) return;  // the frozen shells.js default: rule 3 below
      for (const m of l.matchAll(/(?:#|0x)([0-9a-fA-F]{6})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
        const hex = m[1] ? '#' + m[1].toLowerCase() : '#' + [m[2], m[3], m[4]].map((v) => (+v).toString(16).padStart(2, '0')).join('');
        const owner = ownerOf(f);
        const calimaToken = /--cal-(lamp|beam|scanner|sighting|pip|compass)|LAMP_|SCANNER_|COMPASS_PIP/.test(l);
        // the key the literal is bound to: a sensor PART's body colour is not its lamp colour
        const key = (/(\w+)\s*[:=]\s*$/.exec(l.slice(0, m.index)) || [])[1] || '';
        const bodyOfSensorPart = /^(color|metal|shell|trim|base|tint)$/.test(key) && /emissive|\btip\b|accent/.test(l);
        const graded = !bodyOfSensorPart && (owner === 'instruments-core' || calimaToken);
        scanned.push({ f, line: i + 1, hex, key });
        grade(`${f}:${i + 1}`, l.trim().slice(0, 80), hex, graded,
          graded ? undefined : bodyOfSensorPart ? `body colour (${key}) of a sensor part; its lamp colour is the emissive on the same line, graded`
            : `${owner}: Round-4 UI colour listed, not graded — replaced by its owner (shell-ui W2 compass pips in COMPASS_PIP + iris shape; Sighting replaces Focus)`);
      }
    });
  }
  // 3. the frozen rig/shells.js sensor default: graded unless it is dead code
  const shellsDefault = /shellMaterials\(sensorColor = 0x([0-9a-f]{6})\)/i.exec(read('src/entities/machines/rig/shells.js'));
  const callers = [];
  for (const f of walk('src')) {
    const lines = codeLines(read(f), false);
    lines.forEach((l, i) => { if (/\bbuildShell\(/.test(l) && !/export function buildShell/.test(l)) callers.push({ f, line: i + 1, passes: /sensorColor/.test(lines.slice(i, i + 3).join(' ')) }); });
  }
  const shellMatCalls = walk('src').flatMap((f) => codeLines(read(f), false).map((l, i) => ({ f, line: i + 1, l }))
    .filter((x) => /\bshellMaterials\(/.test(x.l) && !/export function shellMaterials/.test(x.l)));
  const dead = callers.length > 0 && callers.every((c) => c.passes)
    && shellMatCalls.every((x) => /shellMaterials\(opts\.sensorColor\)/.test(x.l));
  if (shellsDefault) {
    grade('src/entities/machines/rig/shells.js shellMaterials(sensorColor = ...) default', 'sensorColor default', '#' + shellsDefault[1], !dead,
      dead ? `frozen file outside the W0b grant; DEAD default — every buildShell caller (${callers.length}) passes sensorColor (the calm lamp token) and shellMaterials is only called with opts.sensorColor` : undefined);
  }
  // 4. no lamp-state token within ΔE 10 of a scanner highlight token
  const highlight = [];
  for (const s of L.LAMP_ORDER) for (const h of L.SCANNER_HIGHLIGHTS) {
    highlight.push({ lamp: s, highlight: h, dE: +COL.deltaE(L.LAMP_STATES[s].token, h).toFixed(1) });
  }
  return {
    sharmaMaxErr: COL.sharmaCheck(), beamFromTokens,
    graded: rows.filter((r) => r.graded), listed: rows.filter((r) => !r.graded),
    highlight, shellsCallers: callers, filesScanned: files.length, literalsInContext: scanned.length,
  };
}

/* ------------------------------------------------------------------ */
/* A-vfx-palette — static (node)                                       */
/* ------------------------------------------------------------------ */
const BLUES = ['#38c6ff', '#19ffd0'];
async function vfxPaletteStatic() {
  const files = [...walk('src/entities/machines'), ...walk('src/instruments')];
  const hits = [];
  const deadDefaults = [];
  let n = 0;
  for (const f of files) {
    const lines = codeLines(read(f), false);
    lines.forEach((l, i) => {
      if (/LAMP_CANON\s*=/.test(l)) return;
      if (/shellMaterials\(sensorColor = /.test(l)) { deadDefaults.push({ f, line: i + 1, text: l.trim() }); return; }
      for (const hex of colourLiterals(l)) {
        n++;
        const d = Math.min(...BLUES.map((b) => COL.deltaE(hex, b)));
        if (d < 15) hits.push({ f, line: i + 1, hex, minDE: +d.toFixed(1), text: l.trim().slice(0, 90) });
      }
    });
  }
  const fx = read('src/entities/machines/rig/fx.js');
  const sparkDefault = /\n\s*spark\(x, y, z, scale = [\d.]+, color = ([^,]+),/.exec(fx)?.[1] || null;
  const arcDefault = /machine\._arcFlash = function \(color = ([^)]+)\)/.exec(fx)?.[1] || null;
  // out of lane, listed (combat-kit W2 recolours the elemental arrows)
  const listed = [];
  for (const f of walk('src/combat')) {
    codeLines(read(f), false).forEach((l, i) => {
      for (const hex of colourLiterals(l)) {
        const d = Math.min(...BLUES.map((b) => COL.deltaE(hex, b)));
        if (d < 15) listed.push({ f, line: i + 1, hex, minDE: +d.toFixed(1), owner: 'combat-kit (W2)' });
      }
    });
  }
  // the frozen rig/shells.js sensor default (a lamp colour, not an emitter): it must be DEAD code
  const canon = await canonDistanceStatic();
  const shellsRow = canon.listed.find((r) => /shells\.js shellMaterials/.test(r.source));
  const deadOk = deadDefaults.length <= 1 && !!shellsRow && /DEAD default/.test(shellsRow.note || '');
  return { filesScanned: files.length, literals: n, hits, sparkDefault, arcDefault, listedOutOfLane: listed,
    deadDefaults: deadDefaults.map((d) => ({ ...d, dead: deadOk, note: shellsRow?.note })), deadDefaultsOk: deadOk };
}

/* ------------------------------------------------------------------ */
/* A-uv1-survives-fold — the generated GLB (node)                       */
/* ------------------------------------------------------------------ */
/**
 * A tiny generated GLB: two meshes share a DECAL material whose base-colour map
 * reads TEXCOORD_1 (three: `texture.channel === 1`, i.e. the group WANTS uv1),
 * two more share a PLAIN material that samples nothing on uv1 (the group does
 * not want it). Every mesh carries TEXCOORD_0 and TEXCOORD_1 with distinct,
 * non-round values. Built with gltf-transform, unquantised, base64 to the page.
 */
async function uv1Glb() {
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const doc = new Document();
  const buf = doc.createBuffer();
  // a 1 x 1 PNG (the decal atlas stand-in)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const tex = doc.createTexture('decal').setImage(png).setMimeType('image/png');
  const decal = doc.createMaterial('uv1-decal').setBaseColorTexture(tex);
  decal.getBaseColorTextureInfo().setTexCoord(1);
  const plain = doc.createMaterial('uv1-plain').setBaseColorFactor([0.66, 0.6, 0.5, 1]);
  const scene = doc.createScene('probe');
  const src = {};
  const mk = (name, mat, ox, seed) => {
    const P = [], N = [], U0 = [], U1 = [], I = [];
    // a 4 x 4 quad grid (25 verts, 32 tris)
    for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) {
      P.push(ox + i * 0.1, j * 0.1, 0); N.push(0, 0, 1);
      U0.push(i / 4, j / 4);
      U1.push(+(0.123456 + seed * 0.071 + i * 0.0371 + j * 0.0013).toFixed(6), +(0.654321 - seed * 0.031 + j * 0.0419 - i * 0.0007).toFixed(6));
    }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const a = j * 5 + i; I.push(a, a + 1, a + 6, a, a + 6, a + 5); }
    const acc = (arr, type, T) => doc.createAccessor().setArray(new T(arr)).setType(type).setBuffer(buf);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc(P, 'VEC3', Float32Array)).setAttribute('NORMAL', acc(N, 'VEC3', Float32Array))
      .setAttribute('TEXCOORD_0', acc(U0, 'VEC2', Float32Array)).setAttribute('TEXCOORD_1', acc(U1, 'VEC2', Float32Array))
      .setIndices(acc(I, 'SCALAR', Uint16Array)).setMaterial(mat);
    const mesh = doc.createMesh(name).addPrimitive(prim);
    scene.addChild(doc.createNode(name).setMesh(mesh));
    // the de-indexed uv1 the fold must reproduce (merge de-indexes)
    const de = [];
    for (const k of I) de.push(U1[k * 2], U1[k * 2 + 1]);
    src[name] = de;
  };
  mk('decal-a', decal, 0, 1); mk('decal-b', decal, 0.6, 2); mk('plain-a', plain, 1.2, 3); mk('plain-b', plain, 1.8, 4);
  const glb = await new NodeIO().writeBinary(doc);
  return { b64: Buffer.from(glb).toString('base64'), bytes: glb.byteLength, src };
}

/* the W0b static halves, computed only when one of their rows runs */
const STATIC_B = {
  vfx: wanted('A-vfx-palette') ? await vfxPaletteStatic() : null,
  uv1: wanted('A-uv1-survives-fold') ? await uv1Glb() : null,
};
export { canonDistanceStatic, vfxPaletteStatic, uv1Glb };

/* ------------------------------------------------------------------ */
/* page asserts                                                        */
/* ------------------------------------------------------------------ */
const HERD = { role: 'herd', fixture: true };
const KP = KB.KIND_PRELUDE(HERD);

/** A machine of KIND whose body holds still while its OWN perception tick runs (staging). */
const PERCEPTION_ONLY = `
  function perceptionOnly(m) {
    if (!m._frozenByGate) m._frozenByGate = m.update;
    m.update = (dt) => { if (m._disposed || !m.alive) return; m._stateT += dt; m._perceive(dt); };
  }
  /** A heading from m with clear sight (terrain + props) out to d metres. */
  function clearHeading(m, d) {
    const T = __C.terrain, P = m.ai.perception;
    for (let k = 0; k < 24; k++) {
      const h = k * Math.PI / 12 + 0.11;
      let ok = true;
      for (let s = 2; s <= d && ok; s += 1) {
        const x = m.position.x + Math.sin(h) * s, z = m.position.z + Math.cos(h) * s;
        if (!P.hasLOS({ x, y: T.getHeight(x, z), z })) ok = false;
      }
      if (ok) return h;
    }
    return null;
  }
  function placeAt(m, h, d) {
    const p = __C.player, T = __C.terrain;
    const x = m.position.x + Math.sin(h) * d, z = m.position.z + Math.cos(h) * d;
    p.position.set(x, T.getHeight(x, z), z);
    p.velocity?.set(0, 0, 0);
    p._snapToGround?.();
    p.moveSpeed = 0;
    if (p.crouching) p.setCrouch(false);
    return p;
  }
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
  /** Did the EMITTER chain run through gate code? Frame 0 is the gate's own listener: skip it. */
  const fromTools = (st) => (st || '').split('\\n').slice(2).some((l) => /pptr:|__puppeteer|tools\\/gates|evaluation_script/.test(l));
`;

const A_BEAMS_ONE_DRAW = `(async () => {
  ${KP}
  if (!KIND) return skipNoKind();
  const E = __C.engine, R = E.renderer, env = __C.environment, cam = __C.camera, p = __C.player;
  const L = __M.lamps;
  if (!L) return { pass: false, detail: 'machines.lamps is not installed' };
  E.setDynamicResolution?.(false);
  const matCensus = () => { const s = new Set(); __C.scene.traverse(o => { const m = o.material; if (Array.isArray(m)) m.forEach(x => s.add(x)); else if (m) s.add(m); }); return s.size; };
  // calm everything that is not ours, and let the deferred uploads settle
  for (const o of __M.list) { if (o.alive && o.state !== 'patrol') { try { park(o); } catch (e) { /* */ } } }
  freezeAll([]);
  env.setWeather('rain', 0.05);                        // aerial-fog density x2.55 > 1.2
  await wait(1800);
  const spot = flatSpot(30, 60);
  let base = null;
  p._updateCamera = () => {}; if (p.model) p.model.visible = false;
  const frame = { beamDraws: [], beamCount: [], calls: [] };
  const hook = () => { frame.beamDraws.push(L.beamDraws); frame.beamCount.push(L.beamCount); frame.calls.push(R.info.render.calls); };
  const grabFrames = async (n) => { frame.beamDraws.length = 0; frame.beamCount.length = 0; frame.calls.length = 0;
    E.onAfterRender.push(hook); const f0 = E.frames; while (E.frames - f0 < n) await wait(16);
    const i = E.onAfterRender.indexOf(hook); if (i >= 0) E.onAfterRender.splice(i, 1);
    return { beamDraws: frame.beamDraws.slice(), beamCount: frame.beamCount.slice(), calls: frame.calls.slice() }; };
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const cycles = [];
  let measure = null;
  // cycle 0 is the WARM cycle (first draw of the kind at this spot, the rain's own buffers, the
  // measurement); the baseline is taken after it, then three spawn/kill/dispose cycles are graded
  for (let c = 0; c < 4; c++) {
    if (c === 1) { await wait(1200); base = { geo: R.info.memory.geometries, tex: R.info.memory.textures, mats: matCensus(), records: L.records.length,
      lampMesh: L.lampMesh.uuid, beamMesh: L.beamMesh.uuid, lampGeo: L.lampMesh.geometry.uuid, beamGeo: L.beamMesh.geometry.uuid }; }
    const ms = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const m = stageKind(spot.x + Math.sin(a) * 7, spot.z + Math.cos(a) * 7, { route: [new V(spot.x + Math.sin(a) * 7, 0, spot.z + Math.cos(a) * 7)] });
      if (m) ms.push(m);
    }
    await wait(1600);
    for (const m of ms) {
      thaw(m);
      const a = Math.atan2(m.position.x - spot.x, m.position.z - spot.z);
      park(m, a);
      m.forceState('search');                          // wary: the beam sweeps toward the stimulus
      m.lastKnown.set(m.position.x + Math.sin(a) * 9, m.position.y, m.position.z + Math.cos(a) * 9);
      freezeOne(m);
    }
    if (c === 0) {
      cam.position.set(spot.x, __C.terrain.getHeight(spot.x, spot.z) + 9, spot.z + 26);
      cam.lookAt(spot.x, __C.terrain.getHeight(spot.x, spot.z) + 1.5, spot.z);
      cam.updateMatrixWorld();
      await wait(800);
      const wary = await grabFrames(40);
      const lampsWary = ms.filter(m => m.lamp && m.lamp.state === 'wary').length;
      // the same frozen frame with the eight in calm: the beam owner's draws are the difference
      for (const m of ms) { thaw(m); park(m, m.heading); freezeOne(m); }
      await wait(600);
      const calm = await grabFrames(40);
      measure = {
        lampsWary,
        beamDrawsPerFrame: { min: Math.min(...wary.beamDraws), max: Math.max(...wary.beamDraws), median: med(wary.beamDraws) },
        beamInstancesPerFrame: { min: Math.min(...wary.beamCount), max: Math.max(...wary.beamCount) },
        callsWaryMedian: med(wary.calls), callsCalmMedian: med(calm.calls),
        attributedBeamDraws: med(wary.calls) - med(calm.calls),
        calmBeamDraws: Math.max(...calm.beamDraws), calmBeamInstances: Math.max(...calm.beamCount),
        fogK: L.fogK, frames: wary.beamDraws.length,
      };
    }
    // kill, run the corpse lifecycle, dispose
    for (const m of ms) {
      thaw(m);
      let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      try { m.takeDamage({ point: m.position.clone(), object: mesh, impact: 1e6, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 1e6 }); } catch (e) { /* */ }
      if (m.alive) { try { m._die(); } catch (e) { /* */ } }
    }
    await wait(800);
    for (const m of ms) __M.sites.dispose(m);
    await wait(500);
    cycles.push({ cycle: c === 0 ? 'warm' : c, spawned: ms.length, recordsAfter: L.records.length, geo: R.info.memory.geometries, tex: R.info.memory.textures, mats: matCensus() });
  }
  await wait(1500);
  const after = { geo: R.info.memory.geometries, tex: R.info.memory.textures, mats: matCensus(), records: L.records.length,
    lampMesh: L.lampMesh.uuid, beamMesh: L.beamMesh.uuid, lampGeo: L.lampMesh.geometry.uuid, beamGeo: L.beamMesh.geometry.uuid };
  env.setWeather('clear', 0.05);
  const checks = {
    eightWaryInFog: !!measure && measure.lampsWary === 8 && measure.beamInstancesPerFrame.min === 8 && measure.fogK > 1.2,
    beamDrawsExactlyOne: !!measure && measure.beamDrawsPerFrame.min === 1 && measure.beamDrawsPerFrame.max === 1,
    attributedDrawsOne: !!measure && measure.attributedBeamDraws === 1,
    noBeamsInCalm: !!measure && measure.calmBeamInstances === 0 && measure.calmBeamDraws === 0,
    threeCycles: cycles.length === 4 && cycles.every(c => c.spawned === 8),
    geometriesBaseline: after.geo <= base.geo,
    materialsBaseline: after.mats <= base.mats,
    texturesBaseline: after.tex <= base.tex,
    lampRecordsBaseline: after.records === base.records,
    sameTwoDraws: after.lampMesh === base.lampMesh && after.beamMesh === base.beamMesh && after.lampGeo === base.lampGeo && after.beamGeo === base.beamGeo,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { kind: KIND, checks, measure, base, after, cycles } };
})()`;

const A_PERCEPTION_WEATHER = `(async () => {
  ${KP}
  ${PERCEPTION_ONLY}
  if (!KIND) return skipNoKind();
  const env = __C.environment, H = __M.perception, T = __C.terrain;
  if (!H) return { pass: false, detail: 'machines.perception is not installed' };
  const w0 = env.weather;
  freezeAll([]);
  let m = null, h = null;
  for (let tries = 0; tries < 6 && h === null; tries++) {
    const spot = flatSpot(30 + tries * 15, 90);
    if (m) __M.sites.dispose(m);
    m = stageKind(spot.x, spot.z, { route: [new V(spot.x, 0, spot.z)] });
    if (!m) return { pass: null, detail: 'SKIP: could not spawn ' + KIND };
    await wait(1200);
    thaw(m); park(m); perceptionOnly(m);
    h = clearHeading(m, 46);
  }
  if (h === null) return { pass: null, detail: 'SKIP: no 46 m clear sightline found for the staged ' + KIND };
  m.heading = h; m.root.rotation.y = h; m.scanOffset = 0;
  m.ai.perception.cfg = { ...m.ai.perception.cfg };     // (a per-machine view; the shared row is not edited)
  m.ai.perception.cfg.scanSweep = 0;                      // the cone holds dead ahead while it is measured
  const stage = (name) => {
    if ((env.weatherStates || []).includes(name)) { env.setWeather(name, 0.05); return 'setWeather(' + name + ')'; }
    env.weather = name;
    return 'environment.weather = ' + name + ' (the environment has no ' + name + ' state until world-sky W1, E12; the perception hook reads the weather NAME per bible §2.3)';
  };
  async function seesAt(d) {
    placeAt(m, h, d);
    m.suspicion = 0;
    await simSleep(0.4);
    const v = m.ai.perception.visible;
    m.suspicion = 0;
    return v;
  }
  async function range() {
    if (!(await seesAt(3))) return null;
    let lo = 3, hi = 46;
    if (await seesAt(hi)) return hi;
    for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (await seesAt(mid)) lo = mid; else hi = mid; }
    return +((lo + hi) / 2).toFixed(2);
  }
  env.setTime?.(13);
  const how = {};
  how.trade = stage('trade'); await wait(400);
  const scaleTrade = H.sightScale;
  const rTrade = await range();
  how.calima = stage('calima'); await wait(400);
  const scaleCalima = H.sightScale;
  const rCalima = await range();
  how.fogbank = stage('fogbank'); await wait(300);
  const rFog = await range();
  how.back = stage('trade'); await wait(300);
  const rTrade2 = await range();
  env.setTime?.(23); await wait(600);
  const rNight = await range();
  const nightScale = H.sightScale;
  env.setTime?.(13); await wait(400);
  // the detectMul hook scales the fill rate (x0.5 probe), calm, 20 m dead ahead
  async function fillAt20(mul) {
    H.detectMul = mul;
    placeAt(m, h, 20);
    // 0.25 sim-s (>= 2 perception ticks at 0.1 s) before sampling: detectFill is the LAST tick's
    // value, so the first samples after a change still carry the previous multiplier
    await simSleep(0.25, () => { m.suspicion = 0; });
    const xs = [];
    await simSleep(1.6, () => { if (m.detectFill > 0) xs.push(m.detectFill); m.suspicion = 0; });
    H.detectMul = 1;
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }
  const f1 = await fillAt20(1), fH = await fillAt20(0.5), f1b = await fillAt20(1);
  if ((env.weatherStates || []).includes(w0)) env.setWeather(w0, 0.05); else env.weather = w0;
  const ratio = rTrade && rCalima ? rCalima / rTrade : null;
  const checks = {
    tradeIsSightRange: rTrade !== null && Math.abs(rTrade / m.sightRange - 1) <= 0.05,
    calimaHalf: ratio !== null && Math.abs(ratio - 0.5) <= 0.025,
    fogbankHalf: rTrade && rFog ? Math.abs(rFog / rTrade - 0.5) <= 0.025 : false,
    tradeRestored: rTrade2 !== null && Math.abs(rTrade2 / rTrade - 1) <= 0.03,
    scaleReadout: scaleTrade === 1 && scaleCalima === 0.5,
    detectMulHalvesFill: f1 > 0 && Math.abs(fH / ((f1 + f1b) / 2) - 0.5) <= 0.025,
  };
  return { pass: Object.values(checks).every(Boolean), detail: {
    kind: KIND, checks, sightRangeM: m.sightRange,
    measuredRangeM: { trade: rTrade, calima: rCalima, fogbank: rFog, tradeAgain: rTrade2, night: rNight },
    calimaOverTrade: ratio === null ? null : +ratio.toFixed(3), nightOverTrade: rTrade && rNight ? +(rNight / rTrade).toFixed(3) : null,
    sightScale: { trade: scaleTrade, calima: scaleCalima, night: +nightScale.toFixed(3) },
    staging: how,
    detectMulProbe: { fill1: +f1.toFixed(4), fillHalf: +fH.toFixed(4), fill1again: +f1b.toFixed(4), ratio: f1 ? +(fH / ((f1 + f1b) / 2)).toFixed(3) : null },
    clock: 'SIM seconds; range found by bisection to 0.08 m, the player standing dead ahead in the open, the machine perception-only (its own tick, body still)',
  } };
})()`;

const A_PERK_HOOKS = `(async () => {
  ${KP}
  ${PERCEPTION_ONLY}
  if (!KIND) return skipNoKind();
  const H = __M.perception, S = __M.stimulus, ev = __C.events, p = __C.player, T = __C.terrain;
  if (!H || typeof S.addNoiseFilter !== 'function') return { pass: false, detail: { verdict: 'hooks not published', perception: !!H, addNoiseFilter: typeof S.addNoiseFilter } };
  const shape = {
    detectMul: H.detectMul, flagDuration: H.flagDuration, dustSight: H.dustSight,
    flagPlayer: typeof H.flagPlayer, addDustCloud: typeof H.addDustCloud, outlined: typeof H.outlined,
    addNoiseFilter: typeof S.addNoiseFilter, dustOccludedField: __M.list.every(m => 'dustOccluded' in m),
  };
  freezeAll([]);
  // ---------- 1. detectMul: the calm fill rate at 20 m (and hostile unchanged)
  let m = null, h = null;
  for (let tries = 0; tries < 6 && h === null; tries++) {
    const spot = flatSpot(30 + tries * 15, 90);
    if (m) __M.sites.dispose(m);
    m = stageKind(spot.x, spot.z, { route: [new V(spot.x, 0, spot.z)] });
    if (!m) return { pass: null, detail: 'SKIP: could not spawn ' + KIND };
    await wait(1200);
    thaw(m); park(m); perceptionOnly(m);
    h = clearHeading(m, 32);
  }
  if (h === null) return { pass: null, detail: 'SKIP: no clear 32 m sightline for the staged ' + KIND };
  m.heading = h; m.root.rotation.y = h;
  m.ai.perception.cfg = { ...m.ai.perception.cfg, scanSweep: 0 };
  async function fill(mul, hostile) {
    H.detectMul = mul;
    if (hostile) { m.state = 'attack'; } else { m.state = 'patrol'; }
    placeAt(m, h, 20);
    // settle 0.25 sim-s (>= 2 perception ticks) so no sample carries the previous multiplier or state
    await simSleep(0.25, () => { m.suspicion = hostile ? 1 : 0; });
    const xs = [];
    await simSleep(1.6, () => { if (m.detectFill > 0) xs.push(m.detectFill); m.suspicion = hostile ? 1 : 0; });
    H.detectMul = 1;
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }
  const calm1 = await fill(1, false), calmHalf = await fill(0.5, false), calm1b = await fill(1, false);
  const host1 = await fill(1, true), hostHalf = await fill(0.5, true);
  const dm = {
    calm: { without: +((calm1 + calm1b) / 2).toFixed(4), with: +calmHalf.toFixed(4), ratio: +(calmHalf / ((calm1 + calm1b) / 2)).toFixed(3) },
    hostile: { without: +host1.toFixed(4), with: +hostHalf.toFixed(4), ratio: host1 ? +(hostHalf / host1).toFixed(3) : null },
  };
  m.state = 'patrol';
  __M.sites.dispose(m);
  // ---------- 2. flagDuration: a flag-capable machine sees her and goes hostile; the Flag lasts flagDuration
  const spot2 = flatSpot(40, 90);
  const flagger = stageKind(spot2.x, spot2.z, { route: [new V(spot2.x, 0, spot2.z)] });
  const others = [];
  for (let i = 0; i < 3; i++) others.push(stageKind(spot2.x + 18 + i * 6, spot2.z - 12, { route: [new V(spot2.x + 18 + i * 6, 0, spot2.z - 12)] }));
  await wait(1500);
  if (!flagger || others.some(o => !o)) return { pass: null, detail: 'SKIP: could not stage the flag set' };
  const set = [flagger, ...others];
  flagger.flagsOnSight = true;           // staging: the sentry role (Plumb, W1) carries this in its table row
  for (const o of set) { thaw(o); park(o); }
  const fh = clearHeading(flagger, 16);
  // the three recipients face AWAY from where she will stand, so only the Flag can send them
  const herX = () => flagger.position.x + Math.sin(fh) * 12, herZ = () => flagger.position.z + Math.cos(fh) * 12;
  if (fh === null) return { pass: null, detail: 'SKIP: no clear sightline for the flagging machine' };
  const flagRun = async (dur) => {
    for (const o of set) { thaw(o); park(o, o === flagger ? fh : Math.atan2(o.position.x - herX(), o.position.z - herZ())); o.flagMark = null; }
    if (dur !== null) H.flagDuration = dur;
    const rec = { raised: null, ended: null, stacks: [], recipients: null, after: null };
    const onF = (e) => { rec.raised = H.clock; rec.stacks.push(new Error().stack); };
    const onE = (e) => { rec.ended = H.clock; rec.lasted = e.lasted; };
    ev.on('flagged', onF); ev.on('flag-ended', onE);
    // she stands in the open 12 m in front of it: its own senses raise the Flag
    placeAt(flagger, fh, 12);
    p.health = p.maxHealth;
    const w0 = performance.now();
    while (rec.raised === null && performance.now() - w0 < 15000) { await wait(50); p.health = p.maxHealth; }
    // she leaves (input: jog away for 0.6 s, so the mark is a mark, not a sightline)
    p.camYaw = fh + Math.PI;
    key('KeyW', true); await wait(600); key('KeyW', false);
    await simSleep(0.4, () => { p.health = p.maxHealth; });
    rec.recipients = others.map(o => ({ state: o.state, marked: o.flagMark === H.flag, lkToHer: +Math.hypot(o.lastKnown.x - p.position.x, o.lastKnown.z - p.position.z).toFixed(1) }));
    const w1 = performance.now();
    while (rec.ended === null && performance.now() - w1 < 30000) { await wait(40); p.health = p.maxHealth; }
    rec.after = others.map(o => ({ state: o.state, marked: o.flagMark === H.flag }));
    if (ev.off) { ev.off('flagged', onF); ev.off('flag-ended', onE); }
    H.flagDuration = 8;
    return { lastedS: rec.raised !== null && rec.ended !== null ? +(rec.ended - rec.raised).toFixed(3) : null,
      raisedBy: rec.stacks.length ? (rec.stacks[0].match(/flagPlayer|setState/g) || []).slice(0, 4) : [],
      stackFromTools: rec.stacks.some(fromTools), recipients: rec.recipients, after: rec.after };
  };
  const flagShrug = await flagRun(3);
  for (const o of set) { thaw(o); park(o); }
  await wait(600);
  const flagBase = await flagRun(null);
  for (const o of set) __M.sites.dispose(o);
  // ---------- 3. noise filter: a 10 s jog, footstep stimuli counted (input-driven, R31)
  const jog = async (withFilter) => {
    const spot3 = flatSpot(20, 60);
    p.position.set(spot3.x, T.getHeight(spot3.x, spot3.z), spot3.z); p._snapToGround?.();
    let n = 0, fromToolsN = 0, kinds = {};
    const onS = (e) => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; if (e.kind === 'footstep') { n++; if (fromTools(new Error().stack)) fromToolsN++; } };
    ev.on('stimulus', onS);
    const remove = withFilter ? S.addNoiseFilter((e) => (e.kind === 'footstep' ? false : undefined)) : null;
    let speeds = [];
    key('KeyW', true);
    await simSleep(10, () => { speeds.push(p.moveSpeed || 0); if (Math.random() < 0.05) p.camYaw += 0.6; });
    key('KeyW', false);
    if (remove) remove();
    if (ev.off) ev.off('stimulus', onS);
    speeds.sort((a, b) => a - b);
    return { footstepEvents: n, eventsFromTools: fromToolsN, kinds, medianSpeed: +(speeds[speeds.length >> 1] || 0).toFixed(2) };
  };
  const noiseWithout = await jog(false);
  const noiseWith = await jog(true);
  const filtersLeft = (S._filters || []).length;
  // ---------- 4. the Dust-sight occlusion flag (shape + behaviour; the outline is shell-ui's, W2)
  const spot4 = flatSpot(35, 80);
  const dm2 = stageKind(spot4.x, spot4.z, { route: [new V(spot4.x, 0, spot4.z)] });
  await wait(1200);
  thaw(dm2); park(dm2); perceptionOnly(dm2);
  const dh = clearHeading(dm2, 32) ?? 0;
  placeAt(dm2, dh, 30);
  await simSleep(0.5);
  const clearOcc = dm2.dustOccluded, clearOut = H.outlined(dm2);
  const mid = new V((p.position.x + dm2.position.x) / 2, 0, (p.position.z + dm2.position.z) / 2);
  mid.y = T.getHeight(mid.x, mid.z) + 1.6;
  const removeCloud = H.addDustCloud({ x: mid.x, y: mid.y, z: mid.z, r: 3, seconds: 10 });
  await simSleep(0.5);
  const cloudOcc = dm2.dustOccluded, cloudOutNoPerk = H.outlined(dm2);
  H.dustSight = true;
  const cloudOutPerk = H.outlined(dm2);
  H.dustSight = false;
  const machineSees = dm2.ai.perception.hasLOS(p.position);
  removeCloud();
  await simSleep(0.5);
  const afterOcc = dm2.dustOccluded;
  __M.sites.dispose(dm2);
  const dust = { noCloud: { occluded: clearOcc, outlined: clearOut }, cloud: { occluded: cloudOcc, outlinedWithoutPerk: cloudOutNoPerk, outlinedWithPerk: cloudOutPerk, instrumentSeesThroughIt: machineSees }, cloudRemoved: { occluded: afterOcc } };
  const near = (v, want, tol) => v !== null && Math.abs(v - want) <= tol;
  const checks = {
    shapePublished: shape.detectMul === 1 && shape.flagDuration === 8 && shape.flagPlayer === 'function' && shape.addNoiseFilter === 'function' && shape.dustOccludedField && shape.outlined === 'function',
    detectMulHalvesCalm: near(dm.calm.ratio, 0.5, 0.025),
    detectMulControl: dm.calm.without > 0 && near(dm.calm.without / Math.max(1e-9, calm1), 1, 0.05),
    detectMulHostileUnchanged: near(dm.hostile.ratio, 1, 0.03),
    flagShrug3s: near(flagShrug.lastedS, 3, 0.1),
    flagControl8s: near(flagBase.lastedS, 8, 0.1),
    flagRecipientsSearched: (flagShrug.recipients || []).every(r => r.state === 'search' && r.marked) && (flagBase.recipients || []).every(r => r.state === 'search' && r.marked),
    flagMarkCleared: (flagShrug.after || []).every(r => !r.marked) && (flagBase.after || []).every(r => !r.marked),
    flagRaisedByTheGame: !flagShrug.stackFromTools && !flagBase.stackFromTools && flagShrug.raisedBy.includes('flagPlayer'),
    noiseFilterDropsFootsteps: noiseWith.footstepEvents === 0 && noiseWith.medianSpeed > 3,
    noiseControl: noiseWithout.footstepEvents > 0 && noiseWithout.eventsFromTools === 0 && noiseWithout.medianSpeed > 3,
    filterRemoved: filtersLeft === 0,
    dustOcclusionFlag: !clearOcc && cloudOcc && !afterOcc && !cloudOutNoPerk && cloudOutPerk && !machineSees && !clearOut,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { kind: KIND, checks, shape, detectMul: dm,
    flag: { shrug: flagShrug, control: flagBase }, noise: { withFilter: noiseWith, without: noiseWithout }, dust,
    r31: 'player movement by synthesized KeyboardEvents into input.js; the Flag is raised by the flagging machine\\'s own setState(alert) from its own sight; footstep stimuli come from StimulusBus.update in the frame loop (stacks checked)' } };
})()`;

const A_UV1 = (S) => `(async () => {
  const S = ${JSON.stringify(S ? { b64: S.b64, src: S.src, bytes: S.bytes } : null)};
  if (!S) return { pass: null, detail: 'static half not computed in this invocation' };
  const C = __CTX__;
  const LOD = await import('/src/entities/machines/rig/lod.js');
  const bin = Uint8Array.from(atob(S.b64), c => c.charCodeAt(0));
  const gltf = await C.assets.loader.parseAsync(bin.buffer, '');
  const model = gltf.scene;
  const Group = model.constructor;
  const root = new Group(); const body = new Group(); root.add(body); body.add(model);
  const before = {};
  model.traverse(o => { if (o.isMesh) before[o.name] = { uv1: !!o.geometry.attributes.uv1, channel: o.material.map ? o.material.map.channel : null, mat: o.material.name }; });
  const stub = { ctx: C, kind: 'uv1-probe', modelKind: 'uv1-probe', model, root, body, _eyeMats: [], _emisMats: [], parts: [] };
  const res = LOD.foldMachineMeshes(stub, { pool: false });
  const merged = [];
  model.traverse(o => { if (o.isMesh) merged.push(o); });
  const decal = merged.find(o => o.material.name === 'uv1-decal');
  const plain = merged.find(o => o.material.name === 'uv1-plain');
  let maxErr = null, nDecal = 0;
  if (decal && decal.geometry.attributes.uv1) {
    const want = [...S.src['decal-a'], ...S.src['decal-b']];
    const a = decal.geometry.attributes.uv1;
    nDecal = a.count;
    maxErr = 0;
    if (a.count * 2 !== want.length) maxErr = Infinity;
    else for (let i = 0; i < a.count; i++) { maxErr = Math.max(maxErr, Math.abs(a.getX(i) - want[i * 2]), Math.abs(a.getY(i) - want[i * 2 + 1])); }
  }
  const out = {
    sourceMeshes: before, foldStats: res,
    mergedMeshes: merged.map(o => ({ name: o.name, mat: o.material.name, attrs: Object.keys(o.geometry.attributes), verts: o.geometry.attributes.position.count })),
    decal: decal ? { merged: o2(decal), uv1: !!decal.geometry.attributes.uv1, uv1MaxErr: maxErr, verts: nDecal } : null,
    plain: plain ? { merged: o2(plain), uv1: !!plain.geometry.attributes.uv1, uv: !!plain.geometry.attributes.uv } : null,
  };
  function o2(o) { return o.userData?.merged || 1; }
  for (const o of merged) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); }
  const checks = {
    loaderSawUv1: Object.values(before).every(b => b.uv1) && before['decal-a']?.channel === 1,
    decalGroupMerged: !!decal && o2(decal) === 2,
    plainGroupMerged: !!plain && o2(plain) === 2,
    uv1SurvivesInDecalGroup: !!decal && !!decal.geometry.attributes.uv1,
    uv1Within1e4: maxErr !== null && maxErr <= 1e-4,
    plainGroupDropsUv1: !!plain && !plain.geometry.attributes.uv1,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { checks, ...out, glbBytes: S.bytes } };
})()`;

const A_VFX = (S) => `(async () => {
  const S = ${JSON.stringify(S)};
  if (!S) return { pass: null, detail: 'static half not computed in this invocation' };
  const C = __CTX__, M = C.machines;
  { const t0 = performance.now(); while (!M.expansionReady && performance.now() - t0 < 90000) await new Promise(r => setTimeout(r, 200)); }
  const Col = await import('/src/instruments/lib/color.js');
  const T = await import('/src/entities/machines/ai/tables.js');
  const BLUE = ['#38c6ff', '#19ffd0'];
  const seen = new Map();          // hex -> { n, via:Set }
  const note = (hex, via) => { if (!hex) return; let r = seen.get(hex); if (!r) { r = { n: 0, via: new Set() }; seen.set(hex, r); } r.n++; r.via.add(via); };
  const hexOf = (c) => (c && c.isColor) ? '#' + c.getHexString() : (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : null);
  // 1. every pooled particle (rig/fx.js MachineFx: sparks, arcs, flames, smoke, dust, bursts)
  const pool = C.machineFx || (M.list.find(m => m._fxPool) || {})._fxPool || null;   // published on the machine ctx view
  const undo = [];
  if (pool) for (const which of ['hot', 'cold']) {
    const P = pool[which]; if (!P) continue;
    const real = P.spawn;
    P.spawn = function (x, y, z, opts) { const c = opts && opts.color !== undefined ? opts.color : 0xffffff; note(typeof c === 'string' ? c.toLowerCase() : hexOf(c), 'pool.' + which); return real.call(this, x, y, z, opts); };
    undo.push(() => { P.spawn = real; });
  }
  // 2. every FX object a machine adds to the scene (sprites, rings, fireballs, beacon, spit)
  const realAdd = C.scene.add;
  C.scene.add = function (...objs) {
    for (const o of objs) {
      if (o && !(o.userData?.machine && o.userData.machine.root === o)) {   // every FX object; not a machine root
        const mats = Array.isArray(o?.material) ? o.material : (o?.material ? [o.material] : []);
        for (const m of mats) { if (m.color) note('#' + m.color.getHexString(), 'scene.' + (o.type || 'obj')); if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) note('#' + m.emissive.getHexString(), 'scene.emissive'); }
      }
    }
    return realAdd.apply(this, objs);
  };
  undo.push(() => { C.scene.add = realAdd; });
  // 3. the fx.js default spark (no colour argument)
  if (pool) pool.spark(0, -50, 0);
  // 4. drive every emitter on one machine of every spawnable kind
  const p = C.player;
  const kinds = M.kinds.filter(k => M.canSpawn(k));
  const exercised = {};
  let i = 0;
  for (const k of kinds) {
    const x = p.position.x + 25 + (i % 4) * 9, z = p.position.z + 25 + Math.floor(i / 4) * 9; i++;
    const m = M.spawn(k, x, z);
    if (!m) continue;
    m.lowLOD = false;
    const ex = exercised[k] = [];
    await new Promise(r => setTimeout(r, 250));
    const pt = m.position.clone(); pt.y += m.height * 0.5;
    let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
    const hit = (o) => { try { m.takeDamage(Object.assign({ point: pt.clone(), object: mesh, impact: 5, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 5 }, o)); } catch (e) { ex.push('ERR ' + e.message); } };
    hit({}); ex.push('hit');
    hit({ tear: 400 }); ex.push('tear');
    for (const el of ['fire', 'freeze', 'shock']) { hit({ element: el, elementAmount: 400 }); ex.push(el); }
    try { m._explosionFX(pt.clone(), 'fire'); m._explosionFX(pt.clone(), 'freeze'); m._explosionFX(pt.clone(), 'shock'); ex.push('explosions'); } catch (e) { ex.push('ERR explosion ' + e.message); }
    try { m._arcFlash(); ex.push('arc default'); } catch (e) { /* */ }
    try { m._sparkBurst(pt.clone(), 6); ex.push('spark default'); } catch (e) { /* */ }
    // every attack row that carries its own projectile / flash colour fires its flash
    for (const row of T.attackTable(k)) if (row.params && row.params.color !== undefined) { try { m._arcFlash(row.params.color); ex.push('flash ' + row.id); } catch (e) { /* */ } }
    for (const fn of ['_pingRing', '_freezeSpit', '_spit', '_shatterBurst']) if (typeof m[fn] === 'function') { try { m[fn](); ex.push(fn); } catch (e) { /* needs a target */ } }
    // run the statuses for a beat (burn flames + smoke, seized-crust glints from the Brine hit, Clouded arcs)
    m.burnT = Math.max(m.burnT, 1); m._burnDps = 0.01; m.stunT = Math.max(m.stunT, 0.6);   // (the seized crust is already on from the Brine hit above)
    await new Promise(r => setTimeout(r, 900));
    // death sparks + smoke, then the loot beacon
    hit({ impact: 1e6, baseDamage: 1e6 }); ex.push('death');
    await new Promise(r => setTimeout(r, 400));
    try { if (m._spawnBeacon && !m._beaconMesh) m._spawnBeacon(); ex.push('beacon'); } catch (e) { /* */ }
    await new Promise(r => setTimeout(r, 300));
    M.sites.dispose(m);
  }
  for (const u of undo) u();
  const rows = [...seen.entries()].map(([hex, r]) => {
    const c = Col.hexToRgb(hex); const mx = Math.max(c[0], c[1], c[2], 1e-6);
    const norm = Col.rgbToHex(c.map(v => v / mx));
    const d = Math.min(...BLUE.map(b => Col.deltaE(hex, b)));
    const dn = Math.min(...BLUE.map(b => Col.deltaE(norm, b)));
    return { hex, normalised: norm, minDE: +d.toFixed(1), minDEnormalised: +dn.toFixed(1), n: r.n, via: [...r.via] };
  }).sort((a, b) => Math.min(a.minDE, a.minDEnormalised) - Math.min(b.minDE, b.minDEnormalised));
  const blue = rows.filter(r => r.minDE < 15 || r.minDEnormalised < 15);
  const checks = {
    sharma: Col.sharmaCheck() < 1e-4,
    staticNoBlueLiteral: S.hits.length === 0 && S.deadDefaultsOk,
    fxDefaultSparkNotBlue: !!S.sparkDefault && /VFX_COLORS\\.bronzeChip/.test(S.sparkDefault) && !!S.arcDefault && /VFX_COLORS\\.bronzeChip/.test(S.arcDefault),
    noLiveParticleNearBlue: blue.length === 0,
    emittersExercised: Object.keys(exercised).length >= 2 && rows.length >= 8,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { checks, blueOffenders: blue, coloursSeen: rows.length, closest: rows.slice(0, 12),
    kindsExercised: exercised, static: { filesScanned: S.filesScanned, literals: S.literals, hits: S.hits, sparkDefault: S.sparkDefault, arcDefault: S.arcDefault, deadDefaults: S.deadDefaults, listedOutOfLane: S.listedOutOfLane } } };
})()`;

/* ------------------------------------------------------------------ */
/* shadowed Round-4 rows, re-staged on the herd role (R28, R34)        */
/* ------------------------------------------------------------------ */
/**
 * Text surgery on the Round-4 row (read from its file, wherever gates-perf has
 * archived it): every edit is asserted, and a row whose source text moved
 * reports PENDING with the reason instead of running a half-edited gate.
 */
function restage(srcRow, edits, fields) {
  if (!srcRow) return { ...fields, kind: 'action', assert: '(async () => ({ pass: null, detail: "the Round-4 source row is not available in this tree" }))()' };
  let a = srcRow.assert;
  const missing = [];
  for (const [from, to] of edits) {
    if (!a.includes(from)) { missing.push(from.slice(0, 80)); continue; }
    a = a.split(from).join(to);
  }
  if (missing.length) {
    return { ...srcRow, ...fields, assert: `(async () => ({ pass: null, detail: ${JSON.stringify({ note: 'Round-4 source text moved; re-stage edits not applied', missing })} }))()` };
  }
  return { ...srcRow, ...fields, assert: a };
}
const rowOf = (mod, id) => (mod?.GATES || []).find((g) => g.id === id) || null;

const HERD_STAGE = `
      const __herd = ctx.machines.roles ? ctx.machines.roles.herd : null;
      if (!__herd) return { pass: null, detail: 'SKIP-R18: role herd has no live kind (' + (ctx.machines.roleNotes ? ctx.machines.roleNotes.herd : 'roles not published') + ')' };
      let w = ctx.machines.list.find(m => m.kind === __herd && m.alive && !m._disposed);
      if (!w) { const pp = ctx.player.position; w = ctx.machines.spawn(__herd, pp.x + 24, pp.z + 24); await new Promise(r => setTimeout(r, 900)); }
      if (!w || !w.alive) return { pass: null, detail: 'SKIP: no living ' + __herd + ' (herd role) could be staged' };`;
/** The Round-4 rows' staging text (their sentry kind, bible §10.2), which the re-stage replaces by role. */
const OLD_SENTRY = OLD_KINDS.byRole.sentry?.[0] || '';
const WATCHER_STAGE = `const w = ctx.machines.list.find(m => m.kind === ${q(OLD_SENTRY)} && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living ${OLD_SENTRY}' };`;

const A37_HERD = restage(rowOf(MAI, 'A37-stealth-approach'), [[WATCHER_STAGE, HERD_STAGE]], {
  id: shadowId('A37-stealth-approach'), lane: LANE, shadowOf: 'A37-stealth-approach',
  title: 'Crouched in tall grass, 20 m -> 3 m behind the herd-role Instrument (the Tiller fixture, R28): never leaves patrol/suspicious, suspicion < 0.3',
});
const A39_HERD = restage(rowOf(MAI, 'A39-detection-curve'), [[WATCHER_STAGE, HERD_STAGE]], {
  id: shadowId('A39-detection-curve'), lane: LANE, shadowOf: 'A39-detection-curve',
  title: 'Standing still in the herd-role Instrument\'s cone (the Tiller fixture, R28): 30 m suspicious >= 1.5 s / alert 3.0-4.6 s; 10 m alert <= 1.5 s',
});
const A43_HERD = restage(rowOf(MAI, 'A43-corpse-lifecycle'), [
  ['const count = () => { let n = 0; ctx.scene.traverse(() => n++); return n; };',
    `const __herd = ctx.machines.roles ? ctx.machines.roles.herd : null;
      if (!__herd) return { pass: null, detail: 'SKIP-R18: role herd has no live kind' };
      { const pp = ctx.player.position; const have = ctx.machines.list.filter(m => m.alive && m.kind === __herd).length;
        for (let i = have; i < 8; i++) ctx.machines.spawn(__herd, pp.x + 22 + (i % 4) * 6, pp.z + 22 + Math.floor(i / 4) * 6);
        await new Promise(r => setTimeout(r, 1500)); }
      const count = () => { let n = 0; ctx.scene.traverse(() => n++); return n; };`],
  ['const live = ctx.machines.list.filter(m => m.alive)', 'const live = ctx.machines.list.filter(m => m.alive && m.kind === __herd)'],
], {
  id: shadowId('A43-corpse-lifecycle'), lane: LANE, shadowOf: 'A43-corpse-lifecycle',
  title: 'Eight herd-role wrecks (the Tiller fixture, R28) freeze, fade, dispose and schedule a respawn; scene growth <= +40 and nothing of a disposed machine is left in the scene',
});

/** A90-rig-reclaim on the staged (role) kinds, as gates-perf's carried row re-stages it (R28: never a legacy kind). */
const A90_RIG = restage(rowOf(await importFirst(['tools/gates.round4.machines-expansion.mjs', 'tools/gates/archive/gates.round4.machines-expansion.mjs']), 'A90-rig-reclaim'), [
  [`const roster = M.kinds.filter(k => M.canSpawn ? M.canSpawn(k) : true);
      if (roster.length < 4) return { pass: null, detail: { note: 'SKIP: roster not loaded', roster } };`,
  `// R5 (R28): the staged role kinds only, never a legacy kind
      const roster = [...new Set(Object.values(M.roles || {}).filter(Boolean))].filter(k => M.canSpawn(k));
      if (!roster.length) return { pass: null, detail: { note: 'SKIP-R18: no role resolves to a live kind', roles: M.roles } };`],
  [`const liveKind = roster.includes(${q(OLD_SENTRY)}) ? ${q(OLD_SENTRY)} : roster[0];`, 'const liveKind = roster[0];'],
], {
  id: shadowId('A90-rig-reclaim'), lane: LANE, shadowOf: 'A90-rig-reclaim',
  title: 'RIG-SIDE RECLAIM on the staged role kinds (the Tiller fixture, R28): 30 spawn/kill/dispose cycles grow geometries <= +40 and textures <= +30, and a LIVE machine costs <= 1 of each',
});

/** A90b with the role-based workload (R34): every kill is followed by a respawn of the herd role's kind. */
const A90B = restage(rowOf(MEM, 'A90b-memory-attribution'), [
  ['const ctx = __CTX__;', `const ctx = __CTX__;
      const HERD = ctx.machines.roles ? ctx.machines.roles.herd : null;
      const W = { kills: 0, respawned: 0, respawnFailed: 0, kind: HERD };
      { const t0 = performance.now(); while (!ctx.machines.expansionReady && performance.now() - t0 < 45000) await new Promise(r => setTimeout(r, 200)); }
      if (!HERD) return { pass: null, detail: 'SKIP-R18: role herd has no live kind — the R34 workload cannot run' };`],
  [`          if (m) { kill(m); kills++; }`, `          const killedKind = m ? m.kind : null;
          if (m) { kill(m); kills++; W.kills++; }`],
  [`          try { ctx.machines.spawn(${q(OLD_SENTRY)}, ctx.player.position.x + 30, ctx.player.position.z + 30); } catch (e) {}`,
    `          if (killedKind) { let s = null; try { s = ctx.machines.spawn(HERD, ctx.player.position.x + 30, ctx.player.position.z + 30); } catch (e) { s = null; } if (s) W.respawned++; else W.respawnFailed++; }`],
  ['        return {\n          pass: offenders.length === 0,\n          detail: {\n            kills, selfTest: self, offenders,', `        const R34_LOC = /machine\\.js|autorig\\.js/;
        const r34Offenders = offenders.filter((o) => R34_LOC.test(JSON.stringify(o.at || '')));
        const r34Held = [];
        for (const kind of ['objects', 'geometries']) for (const owner in whole[kind]) {
          const r = whole[kind][owner];
          if (!R34_LOC.test(JSON.stringify(r.locs || '') + owner)) continue;
          r34Held.push({ kind, owner, attached: r.attached, detachedRetained: r.detachedRetained, heldUnreachable: r.heldUnreachable, created: r.created, disposed: r.disposed });
        }
        const workloadOk = W.kills >= 25 && W.respawned === W.kills;
        return {
          pass: offenders.length === 0 && r34Offenders.length === 0 && workloadOk,
          detail: {
            kills, selfTest: self, offenders, r34: { offenders: r34Offenders.length, held: r34Held, workload: W, workloadOk },`],
], {
  id: shadowId('A90b-memory-attribution'), lane: LANE, shadowOf: 'A90b-memory-attribution',
  title: 'A90b with the ROLE-BASED workload (R34): 30 kills, each followed by a respawn of the herd role\'s kind (the Tiller fixture); zero unreachable GPU textures, no module holding > 4 textures / > 20 geometries / > 20 objects after the corpse lifecycle, 0 offenders at the machine.js model clone or the autorig.js bones',
});
/* ------------------------------------------------------------------ */
/* the lamp film (frames for the lane and the R29 judge)               */
/* ------------------------------------------------------------------ */
const FILM = (state, { fov = 4, both = false, dist = 15, night = false, sunlit = false, threeq = false } = {}) => `(async () => {
  ${KP}
  if (!KIND) return;
  const E = __C.engine, cam = __C.camera, p = __C.player, env = __C.environment, T = __C.terrain;
  E.setDynamicResolution?.(false);
  env.setTime?.(${night ? 23 : 13});
  env.setWeather(${JSON.stringify(state === 'beams' && !night ? 'rain' : 'clear')}, 0.05);
  const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
  for (const o of __M.list) if (o.alive && o.state !== 'patrol') { try { park(o); } catch (e) { /* */ } }
  freezeAll([]);
  const spot = flatSpot(30, 60);
  const m = stageKind(spot.x, spot.z, { route: [new V(spot.x, 0, spot.z)] });
  const m2 = ${both ? 'stageKind(spot.x + 7, spot.z, { route: [new V(spot.x + 7, 0, spot.z)] })' : 'null'};
  await wait(1600);
  for (const r of __M.lamps.records.slice()) if (r.machine !== m && r.machine !== m2) __M.lamps.detach(r.machine);
  p._updateCamera = () => {}; if (p.model) p.model.visible = false;
  park(m, 0.2); if (m2) park(m2, 0.2);
  const rec = m.lamp;
  const lampPos = new V(), axis = new V();
  let ok = false;
  // SUNLIT (the judge's noon frames): of the clear headings, the one whose lens axis is closest to the sun's azimuth
  const sd = env.sunDir ? new V(env.sunDir.x, 0, env.sunDir.z).normalize() : new V(0, 0, 1);
  const aim = (hd) => { m.heading = hd; m.root.rotation.y = hd; m.root.updateMatrixWorld(true);
    rec.anchor.updateWorldMatrix(true, false);
    lampPos.setFromMatrixPosition(rec.anchor.matrixWorld);
    axis.set(0, 0, 1).transformDirection(rec.anchor.matrixWorld); axis.y = 0; axis.normalize();
    cam.position.copy(lampPos).addScaledVector(axis, ${dist}); };
  const clearLine = () => { for (let s = 1; s < 60; s++) { const q = lampPos.clone().lerp(cam.position, s / 60); if (T.getHeight(q.x, q.z) > q.y - 0.4) return false; }
    return !__C.collision?.occluded?.(cam.position, lampPos); };   // walls, rocks, props
  let bestH = null, bestSun = -2;
  for (let k = 0; k < ${sunlit ? 24 : 12} && !(ok && !${sunlit}); k++) {
    const hd = ${sunlit ? 'k * Math.PI / 12' : '0.2 + k * Math.PI / 6'};
    aim(hd);
    const c = clearLine();
    if (c) { ok = true; const sun = axis.x * sd.x + axis.z * sd.z; if (sun > bestSun) { bestSun = sun; bestH = hd; } }
  }
  if (bestH !== null) aim(bestH);
  const st = ${JSON.stringify(state)};
  const side = new V(axis.z, 0, -axis.x);
  if (st === 'wary') m.forceState('search');
  if (st === 'hostile') m.forceState('attack');
  if (st === 'dark') { const wp = m.weakPoints.find(w => w.name === 'lamp'); let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
    m.takeDamage({ point: wp.obj.getWorldPosition(new V()), object: mesh, impact: 1, tear: 0, element: 'none', elementAmount: 0, dir: { x: -axis.x, y: 0, z: -axis.z }, type: 'hunter', baseDamage: 1 }); }
  if (st === 'beams') {
    m.forceState('search'); m.lastKnown.copy(lampPos).addScaledVector(axis, 9).addScaledVector(side, -4);
    if (m2) { m2.heading = m.heading; m2.root.rotation.y = m.heading; m2.forceState('attack'); }
    const tgt = lampPos.clone().addScaledVector(axis, 10).addScaledVector(side, 6);
    p.position.set(tgt.x, T.getHeight(tgt.x, tgt.z), tgt.z); if (p.model) p.model.visible = true;
  } else m.lastKnown.copy(lampPos).addScaledVector(axis, 6);
  holdStill(m); if (m2) holdStill(m2);   // body still, glows live
  // the lens: camera.zoom (player.js and combat.js damp camera.fov every frame; nothing writes zoom)
  if (st === 'beams') {
    cam.zoom = 1; cam.updateProjectionMatrix();
    cam.position.copy(lampPos).addScaledVector(axis, 4).addScaledVector(side, -16); cam.position.y = Math.max(cam.position.y, T.getHeight(cam.position.x, cam.position.z) + 1.8);
    cam.lookAt(lampPos.clone().addScaledVector(axis, 5));
  } else {
    cam.zoom = cam.fov / ${fov}; cam.updateProjectionMatrix();
    cam.position.copy(lampPos).addScaledVector(axis, ${dist});
    ${threeq ? `// three-quarter view: 40 deg off the lens axis, a little above it (the barrel and the drum read)
    { const yaw = 40 * Math.PI / 180; const dx = axis.x * Math.cos(yaw) + side.x * Math.sin(yaw), dz = axis.z * Math.cos(yaw) + side.z * Math.sin(yaw);
      cam.position.set(lampPos.x + dx * ${dist}, lampPos.y + ${dist} * 0.18, lampPos.z + dz * ${dist}); }` : ''}
    cam.lookAt(lampPos);
  }
  cam.updateMatrixWorld();
  window.__IC_FILM__ = { state: st, camDistM: +cam.position.distanceTo(lampPos).toFixed(2), fov: cam.fov, zoom: cam.zoom, clearLine: ok, sunlit: ${sunlit}, lensAxisDotSun: +bestSun.toFixed(3),
    sunElevDeg: env.sunDir ? +(Math.asin(env.sunDir.y) * 180 / Math.PI).toFixed(1) : null, lampState: m.lamp ? m.lamp.state : null, aperture: m.lamp ? +m.lamp.aperture.toFixed(2) : null };
})()`;
const FILM_ROWS = [
  ['calm', 'calm: the iris fully open (100 %), a hot core inside a bone #F2EAD3 ring, steady; the dark drum face and bezel around it; no beam'],
  ['wary', 'wary: the iris at HALF area (50 %), level-vial chartreuse #B5E61D; the closed half reads as dark blades'],
  ['hostile', 'hostile: a PINHOLE (20 % area), cochineal magenta #FF2D8C; blades dark around it'],
  ['dark', 'dark (a precise hit on the lamp): the iris CLOSED and cracked (a fracture with a branch, not a cross), #3B3A36 blades; no lit glass'],
].map(([st, crit]) => ({
  id: `V-lamp-${st}-15m`, kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: `Lamp grammar, ${st}: the herd-role Instrument's drum lamp filmed from 15.0 m on its lens axis (camera.zoom to a 4 deg lens so the iris can be read)`,
  setup: FILM(st), settle: st === 'dark' ? 1600 : 1200,
  criteria: `${crit}. The lens is a disc behind an iris (shape first), not a glow ball. FAIL if the lens is a soft glow sphere, if the aperture does not match the state, or if any Horizon sensor colour (blue #38c6ff, amber #ffb31f, red #ff2413) appears.`,
}));
/* W0b fix round 1: the judge's noon frames, re-filmed at the cited angles (lens turned to the sun, 13:00) */
FILM_ROWS.push({
  id: 'V-lamp-calm-sunlit-15m', kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: 'Calm lamp at noon, the drum face turned to the sun (13:00, clear), the game lens (55 deg), 15.0 m on the lens axis',
  setup: FILM('calm', { fov: 55, sunlit: true }), settle: 1400,
  criteria: 'In full sun the calm lamp reads at once as a LIT lens: a hot white core with a bone ring, set in a dark graphite drum face that separates it from the sunlit bone glaze; a soft glow around the core. FAIL if the lens is a flat cream disc that separates from the drum only by a thin bezel, or if the lamp is darker than the hull.',
});
FILM_ROWS.push({
  id: 'V-lamp-iris-calm-15m-zoom', kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: 'Calm iris close-up at noon, sunlit face: 15.0 m on the lens axis through a 4 deg lens',
  setup: FILM('calm', { fov: 4, sunlit: true }), settle: 1400,
  criteria: 'The calm lens fully open: a glowing core (above the bloom threshold) inside a bone #F2EAD3 ring, the retracted blade seams and a dark housing face around it, a bezel at the rim. Reads as glass behind an iris in a lamp drum. FAIL if the lens is a flat, unlit cream disc with no glow.',
});
FILM_ROWS.push({
  id: 'V-lamp-wary-sunlit-15m', kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: 'Wary lamp at noon, the drum face turned to the sun, the game lens (55 deg), 15.0 m on the lens axis',
  setup: FILM('wary', { fov: 55, sunlit: true }), settle: 1400,
  criteria: 'The wary lamp reads in sun: a half-closed iris, chartreuse glass with a hot centre, in the dark drum face. FAIL if it does not separate from the hull.',
});
FILM_ROWS.push({
  id: 'V-lamp-calm-sunlit-threeq-15m', kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: 'Calm lamp at noon from three-quarters (40 deg off the lens axis, slightly above), 15.0 m, 12 deg lens: the lamp drum as an object',
  setup: FILM('calm', { fov: 12, sunlit: true, threeq: true }), settle: 1400,
  criteria: 'The lamp is a short graphite drum set into the hull drum, its face carrying the lit lens: it has depth and sits IN the drum. FAIL if it reads as a flat disc floating in front of the hull, or as a sticker.',
});
FILM_ROWS.push({
  id: 'V-lamp-hostile-15m-wide', kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: 'Lamp grammar, hostile, at the game lens (55 deg) from 15.0 m: the scale a player sees it at',
  setup: FILM('hostile', { fov: 55 }), settle: 1200,
  criteria: 'At play scale the drum lamp reads as a small magenta point in a dark bezel on the front drum of the Tiller; the hull is not blown out. FAIL if the lamp blooms into a glow ball larger than the drum.',
});
FILM_ROWS.push({
  id: 'V-lamp-calm-40m-wide', kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: 'Lamp at A-weak40 range: calm, the game lens (55 deg), 40.0 m on the lens axis (the weak-point size and contrast frame)',
  setup: FILM('calm', { fov: 55, dist: 40, sunlit: true }), settle: 1200,
  criteria: 'At 40 m, face in the noon sun, the drum lamp still reads as a distinct lit point in a dark ring on the front drum. FAIL if the lamp cannot be told apart from the hull.',
});
FILM_ROWS.push({
  id: 'V-lamp-beams-night', kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: 'Beams at night (clear, 23:00): a wary Tiller sweeping toward its stimulus, a hostile Tiller locked on Brea; side view',
  setup: FILM('beams', { both: true, night: true }), settle: 1500,
  criteria: 'At night the lamps rule the frame: two narrow additive shafts from the drum lamps, chartreuse (wary) and magenta (hostile, ending on the player), brightest at the lens and fading with length. FAIL if a beam is opaque, a solid block, or missing.',
});
FILM_ROWS.push({
  id: 'V-lamp-beams-fog', kind: 'visual', lane: 'instruments-core-film', timeout: 120000,
  title: 'Beams in fog (rain weather, aerial density x2.55): a wary Tiller sweeping toward its stimulus, a hostile Tiller locked on Brea; side view',
  setup: FILM('beams', { both: true }), settle: 1500,
  criteria: 'Two thin additive cones from the drum lamps: the wary one chartreuse, the hostile one magenta pointing at the player. Cones are narrow (5 deg half-angle) and fade with length; no cone in a calm machine. FAIL if a beam is opaque, if it renders as a solid block, or if no beam is visible.',
});

/* ------------------------------------------------------------------ */
/* the W0b rows                                                        */
/* ------------------------------------------------------------------ */
const KIND_LANE = 'instruments-core-kind';
const BLOCK_IDS = ['A44-socket-integrity', 'A44b-socket-vertex-integrity', 'A45-no-skate-per-species', 'A45c-foot-continuity',
  'A46-ground-truth', 'A47-corpse-grounded', 'A47b-corpse-posed', 'A47c-corpse-mass', 'A48-cadence', 'A-weights-authored',
  'A-sil40', 'A-weak40', 'A-lamp-states', 'A41b-attack-coverage', 'A41d-attack-coverage', 'A41c-sustained-variety', 'A42-stagger',
  'A-linked-attack', 'A-glb-budget', 'A21-with-kind', 'A90-expansion-with-kind', 'A90-rig-reclaim-with-kind',
  'V26-silhouette', 'V27-attack-pose', 'V-lineup'];

/* ------------------------------------------------------------------ */
/* A-alloc-machines — the memory rule on this lane's own frames        */
/* ------------------------------------------------------------------ */
/**
 * W0b FIX ROUND 1 (judge finding "A-alloc-rate ... two of the over-budget
 * per-frame allocators are in files this lane owns"). gates-perf's
 * `A-alloc-rate` (global list) grades the whole of `src/**` and prints its top
 * 12 frames; this row is the same METHOD restricted to the frames this lane
 * answers for, so every one of them is graded and none hides below the top 12:
 *   CDP HeapProfiler.startSampling (interval 2048 B, objects collected by minor
 *   and major GC included), 3 s warm-up, 10 s window; graded per function =
 *   max(measured KB/s, KB/frame x 60) on SELF attribution (the profiler's
 *   physical frame: a function inlined into another is charged to its host,
 *   exactly as A-alloc-rate charges it); bar 4 KB/s per function (budgets.mjs
 *   `alloc.fnKBps`).
 * Workload: the staged fight of `A21` re-cast by role — eight herd-role
 * Instruments in `attack` on a forward arc 9-17 m from the player (gates-perf's
 * PERF_SCENARIOS 'staged-fight' geometry), the boot roster alive around them,
 * the player kept alive; then a sprint phase (W + Shift through the roster).
 * Graded: every src frame in a file this lane edits under its §2 row and §1.2
 * grants (`machine`, `index`, `variety-assets`, `parts`, `legacy`, the species
 * files of `src/entities/machines/`, `ai/{tables,doctrine,attacks,perception,
 * index}`, `src/instruments/**`). Reported with their owner, not graded here:
 * the frozen machine-rig and AI-engine files (`gait`, `autorig`, `rig/*`,
 * `ai/{engage,search,squad,sites,reactions,emit,stimulus,rng}`) and the rest of
 * `src/**`. Runs ONE Chrome of its own (runner rows go first, so the harness
 * has none alive yet), on a fresh owned profile that is removed afterwards.
 */
const FROZEN_MACHINE_RE = /^\/src\/entities\/machines\/(gait|autorig)\.js|^\/src\/entities\/machines\/rig\/|^\/src\/entities\/machines\/ai\/(engage|search|squad|sites|reactions|emit|stimulus|rng)\.js/;
const MINE_RE = /^\/src\/instruments\/|^\/src\/entities\/machines\//;
const ALLOC_STAGE = `(async () => {
  const C = __CTX__, M = C.machines, E = C.engine, p = C.player;
  { const t0 = performance.now(); while (!M.expansionReady && performance.now() - t0 < 90000) await new Promise(r => setTimeout(r, 200)); }
  const KIND = M.roles ? M.roles.herd : null;
  if (!KIND) return { skip: 'SKIP-R18: role herd has no live kind' };
  E.setDynamicResolution?.(false);
  C.input.enabled = true;
  // flat open ground near the player (slope < 1.7 m over 12 m)
  const T = C.terrain; let at = null;
  for (let i = 0; i < 400 && !at; i++) {
    const a = (i * 2.399) % (Math.PI * 2), r = 20 + (i % 9) * 6;
    const x = p.position.x + Math.sin(a) * r, z = p.position.z + Math.cos(a) * r, h = T.getHeight(x, z);
    let ok = true; for (let k = 0; k < 8 && ok; k++) { const b = k / 8 * Math.PI * 2; if (Math.abs(T.getHeight(x + Math.sin(b) * 14, z + Math.cos(b) * 14) - h) > 1.7) ok = false; }
    if (ok && (!C.water?.levelAt || C.water.levelAt(x, z) < h - 0.2)) at = { x, z };
  }
  if (!at) at = { x: p.position.x + 30, z: p.position.z + 30 };
  p.position.set(at.x, T.getHeight(at.x, at.z), at.z);
  const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
  const cast = [];
  for (let i = 0; i < 8; i++) {
    const spread = (i - 3.5) / 3.5, a = Math.atan2(fx, fz) + spread * 0.66, r = 9 + (i % 2) * 5.5 + (i % 4) * 1.1;
    const x = at.x + Math.sin(a) * r, z = at.z + Math.cos(a) * r;
    const m = M.spawn(KIND, x, z, { route: [new (p.position.constructor)(x, 0, z)] });
    if (!m) continue;
    m.heading = a + Math.PI; m.root.rotation.y = m.heading;
    m.lastKnown.copy(p.position); m.suspicion = 1; m.forceState('attack');
    cast.push(m);
  }
  const heal = () => { if (p.maxHealth) p.health = p.maxHealth; };
  E.onAfterRender.push(heal);
  window.__icAllocHeal = heal;
  return { kind: KIND, cast: cast.length, alive: M.list.filter(m => m.alive).length, list: M.list.length };
})()`;
const ALLOC_SPRINT_ON = `(() => { const I = __CTX__.input; I.keys.add('KeyW'); I.keys.add('ShiftLeft'); return true; })()`;
const ALLOC_SPRINT_OFF = `(() => { const C = __CTX__, I = C.input; I.keys.delete('KeyW'); I.keys.delete('ShiftLeft');
  const a = C.engine.onAfterRender, i = a.indexOf(window.__icAllocHeal); if (i >= 0) a.splice(i, 1); window.__icAllocHeal = null;
  return { alive: C.machines.list.filter(m => m.alive).length, hostile: C.machines.list.filter(m => m.alive && (m.state === 'attack' || m.state === 'alert')).length }; })()`;

async function allocMachines({ PORT }) {
  const FN_BAR = 4, WARM = 3000, WINDOW = 10000, INTERVAL = 2048;
  const { default: puppeteer } = await import('puppeteer');
  const CP = await import(pathToFileURL(path.join(ROOT, 'tools/chrome-profile.mjs')).href);
  CP.installProfileCleanup();
  const dir = CP.profileDir(PORT);
  const jsFlags = ['--expose-gc'];
  if (process.env.R5_IC_NOINLINE) jsFlags.push('--no-turbo-inlining', '--max-inlined-bytecode-size=0');   // diagnosis only: one frame per function
  if (process.env.R5_IC_OPTSTATUS) jsFlags.push('--allow-natives-syntax');                                 // diagnosis only: tier of each hot function
  if (process.env.R5_IC_TRACEDEOPT) jsFlags.push('--trace-deopt');                                         // diagnosis only: deopts per function
  const browser = await puppeteer.launch({ protocolTimeout: 900000, headless: 'new', userDataDir: dir, dumpio: !!process.env.R5_IC_TRACEDEOPT,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', `--js-flags=${jsFlags.join(' ')}`, '--enable-precise-memory-info'] });
  const r2 = (x) => Math.round(x * 100) / 100;
  // --trace-deopt lines, counted only while a window is open
  const deopts = { open: false, byFn: new Map(), lines: 0 };
  if (process.env.R5_IC_TRACEDEOPT) {
    const onData = (buf) => {
      if (!deopts.open) return;
      for (const line of String(buf).split('\n')) {
        const mm = /deoptimizing [^<]*<JSFunction ([^ >]+)[^>]*>.*?reason: ([^)\]]+)/.exec(line) || /reason: ([^)\]]+)\).*?<JSFunction ([^ >]+)/.exec(line);
        if (!/deoptimiz/.test(line)) continue;
        deopts.lines++;
        const fn = (/<JSFunction ([^ >]+)/.exec(line) || [])[1] || '?';
        const why = (/reason: ([^)\],]+)/.exec(line) || [])[1] || '?';
        const k = fn + ' — ' + why;
        deopts.byFn.set(k, (deopts.byFn.get(k) || 0) + 1);
      }
    };
    browser.process()?.stdout?.on('data', onData);
    browser.process()?.stderr?.on('data', onData);
  }
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`http://localhost:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__READY__ === true', { timeout: 120000 });
    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable');
    const staged = await page.evaluate(ALLOC_STAGE);
    if (staged.skip) return { pass: null, detail: staged.skip };
    const srcRe = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${PORT}/src/`);
    const keyOf = (cf) => `${cf.functionName || '(anonymous)'} ${String(cf.url).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
    const phase = async (name, drive) => {
      if (drive) await page.evaluate(drive);
      await sleep(WARM);
      const f0 = await page.evaluate('__CTX__.engine.frames');
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: INTERVAL, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      const tS = Date.now();
      deopts.open = true;
      await sleep(WINDOW);
      deopts.open = false;
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      const secs = (Date.now() - tS) / 1000;
      const frames = (await page.evaluate('__CTX__.engine.frames')) - f0;
      const self = new Map(); let total = 0, src = 0;
      // an accessor frame (machine.js `get heading` ...) is charged what its CALLER's megamorphic read costs:
      // the caller is recorded so the report names who reads it
      const getterCallers = new Map();
      const walk = (node, parentKey) => {
        const cf = node.callFrame || {};
        const sz = node.selfSize || 0;
        const k = srcRe.test(cf.url || '') ? keyOf(cf) : null;
        if (sz) {
          total += sz;
          if (k) {
            src += sz; self.set(k, (self.get(k) || 0) + sz);
            if (/^(get|set) /.test(cf.functionName || '')) {
              const m = getterCallers.get(k) || new Map(); getterCallers.set(k, m);
              const pk = parentKey || '(no src caller)'; m.set(pk, (m.get(pk) || 0) + sz);
            }
          }
        }
        for (const c of node.children || []) walk(c, k || parentKey);
      };
      walk(profile.head, null);
      const at = (b) => ({ measuredKBps: r2(b / 1024 / secs), kbPerFrame: frames ? r2(b / 1024 / frames) : null, gradedKBps: r2(Math.max(b / 1024 / secs, frames ? (b / 1024 / frames) * 60 : 0)) });
      const rows = [...self.entries()].map(([fn, b]) => {
        const file = fn.split(' ').slice(-1)[0].replace(/:\d+$/, '');
        const owner = !MINE_RE.test(file) ? 'other' : FROZEN_MACHINE_RE.test(file) ? 'frozen-machine' : 'instruments-core';
        return { fn, owner, ...at(b) };
      }).sort((a, b) => b.gradedKBps - a.gradedKBps);
      const callers = {};
      for (const [g, m] of getterCallers) callers[g] = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, b]) => `${at(b).gradedKBps} KB/s from ${c}`);
      return { name, secs: r2(secs), frames, fps: r2(frames / secs), total: at(total), src: at(src), getterCallers: callers,
        mine: rows.filter((r) => r.owner === 'instruments-core'), frozenMachine: rows.filter((r) => r.owner === 'frozen-machine'),
        topOther: rows.filter((r) => r.owner === 'other').slice(0, 12) };
    };
    const fight = await phase('staged fight', null);
    let micro = null;
    if (process.env.R5_IC_MICRO) {
      // diagnosis only: bytes per call of each hot function, called in a loop on one live herd-role machine
      micro = await page.evaluate(`(async () => {
        const C = __CTX__, M = C.machines; const m = M.list.find(x => x.alive && x.kind === M.roles.herd);
        if (!m || typeof gc !== 'function') return { error: 'no machine or no gc' };
        const P = m.ai.perception, mem = () => performance.memory.usedJSHeapSize;
        const st = M.list.find(x => x !== m && x.alive);
        const L = M.list.filter(x => x.alive && !x._frozenByGate);
        // every case runs over EVERY live machine (a dozen classes: the megamorphic context of the game)
        const cases = {
          'perception._scan': (x) => x.ai.perception._scan(0.016),
          'perception._sight': (x) => x.ai.perception._sight(),
          'perception._belief': (x) => x.ai.perception._belief(0.1),
          '_conform (moving)': (x) => { x.position.x += 1e-5; x._conform(0.016); x.position.x -= 1e-5; },
          '_conform (still)': (x) => x._conform(0.016),
          '_turnToward': (x) => x._turnToward(x.heading + 0.01, 0.016),
          '_steerAlong': (x) => { x._steerAlong(0.3, 0.9, x.position.x + 1, x.position.z + 4, 2.0, 0.016); },
          '_navToward': (x) => { x._navToward(x.position.x + 5, x.position.z + 5, 1.5, 0.016); },
          '_statePatrol': (x) => { const w = x.sc._waitT; x.sc._waitT = 0; x._statePatrol(0.016); x.sc._waitT = w; },
          '_updateEyes': (x) => x._updateEyes(0.016, C.engine.simTime),
          '_updateParts': (x) => x._updateParts(0.016, C.engine.simTime),
          'ai.tick': (x) => x.ai.tick(0.016),
          'Machine.update': (x) => x.update(0.016, C.engine.simTime),
          'lamps.update (once)': (x) => { if (x === L[0]) M.lamps.update(); },
          '_standoffPass (once)': (x) => { if (x === L[0]) M._standoffPass(C.player.position); },
          '_separationPass (once)': (x) => { if (x === L[0]) M._separationPass(); },
          'gait.update (frozen)': (x) => x.gait && x.gait.update(0.016, C.engine.simTime),
        };
        const out = { machines: L.length, kinds: [...new Set(L.map(x => x.kind))].length };
        for (const [k, f] of Object.entries(cases)) {
          try {
            for (let i = 0; i < 150; i++) for (let j = 0; j < L.length; j++) f(L[j]);      // warm (optimise)
            gc(); gc();
            const h0 = mem();
            for (let i = 0; i < 60; i++) for (let j = 0; j < L.length; j++) f(L[j]);
            const h1 = mem();
            out[k] = +((h1 - h0) / 60).toFixed(1) + ' B/frame-equivalent';
          } catch (e) { out[k] = 'ERR ' + String(e).slice(0, 80); }
        }
        return out;
      })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
    }
    let tiers = null;
    if (process.env.R5_IC_OPTSTATUS) {
      // %GetOptimizationStatus bits (V8 runtime-test.cc): 16 optimized, 32 maglev, 64 turbofan, 128 interpreted, 8 maybe-deopted, 256 marked, 2048+ baseline
      tiers = await page.evaluate(`(() => { const C = __CTX__, M = C.machines; const m = M.list.find(x => x.alive && x.kind === M.roles.herd) || M.list[0];
        const P = Object.getPrototypeOf; const fns = { 'Machines.update': M.update, 'Machines.interpolate': M.interpolate, 'lamps.update': M.lamps.update,
          'Machine.update': m.update, '_updateEyes': m._updateEyes, '_conform': m._conform, '_steerAlong': m._steerAlong, '_navToward': m._navToward,
          '_applyStep': m._applyStep, '_moveToward': m._moveToward, '_turnToward': m._turnToward, '_statePatrol': m._statePatrol, '_updateParts': m._updateParts,
          'Perception.update': m.ai.perception.update, 'hasLOS': m.ai.perception.hasLOS, 'ai.tick': m.ai.tick, 'gait.update': m.gait && m.gait.update,
          'terrain.getHeight': C.terrain.getHeight };
        const out = {}; for (const [k, f] of Object.entries(fns)) { try { out[k] = typeof f === 'function' ? %GetOptimizationStatus(f) : null; } catch (e) { out[k] = String(e).slice(0, 80); } }
        return out; })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
    }
    const sprint = await phase('sprint', ALLOC_SPRINT_ON);
    const end = await page.evaluate(ALLOC_SPRINT_OFF);
    const over = [];
    for (const ph of [fight, sprint]) for (const r of ph.mine) if (r.gradedKBps > FN_BAR) over.push({ phase: ph.name, ...r });
    const sum = (ph, k) => r2(ph[k].reduce((a, r) => a + r.gradedKBps, 0));
    const pass = errors.length === 0 && over.length === 0 && fight.frames > 60 && staged.cast >= 6;
    const fmt = (ph) => ({ name: ph.name, secs: ph.secs, frames: ph.frames, fps: ph.fps, allKBps: ph.total.measuredKBps, srcGradedKBps: ph.src.gradedKBps,
      mineSumKBps: sum(ph, 'mine'), frozenMachineSumKBps: sum(ph, 'frozenMachine'),
      mine: ph.mine.map((r) => `${r.gradedKBps} KB/s  ${r.fn}`), frozenMachine: ph.frozenMachine.map((r) => `${r.gradedKBps} KB/s  ${r.fn}`),
      topOther: ph.topOther.map((r) => `${r.gradedKBps} KB/s  ${r.fn}`), getterCallers: ph.getterCallers });
    return { pass, detail: {
      verdict: (pass ? 'PASS' : 'FAIL') + `: ${over.length} instruments-core frame(s) over ${FN_BAR} KB/s` + (over.length ? ' — ' + over.map((o) => `${o.fn} ${o.gradedKBps} (${o.phase})`).join('; ') : ''),
      staged, end, tiers, micro, consoleErrors: errors.slice(0, 5),
      deopts: process.env.R5_IC_TRACEDEOPT ? { lines: deopts.lines, top: [...deopts.byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => n + '  ' + k) } : undefined,
      inlining: process.env.R5_IC_NOINLINE ? 'OFF (diagnosis run, not gradeable)' : 'default',
      phases: [fmt(fight), fmt(sprint)],
      method: `CDP HeapProfiler.startSampling (interval ${INTERVAL} B, minor+major GC objects included), ${WARM / 1000} s warm-up, ${WINDOW / 1000} s window per phase; graded = max(measured KB/s, KB/frame x 60) on self attribution (gates-perf A-alloc-rate's method); bar ${FN_BAR} KB/s per instruments-core function` } };
  } finally {
    await Promise.race([browser.close(), sleep(20000)]).catch(() => {});
    try { browser.process()?.kill('SIGKILL'); } catch { /* gone */ }
    CP.disposeProfile(dir);
  }
}

const W0B_GATES = [
  {
    id: 'A-alloc-machines', kind: 'runner', lane: 'instruments-core-alloc', timeout: 600000,
    title: "The memory rule on this lane's frames: gates-perf's A-alloc-rate method (sampling heap profiler, self attribution, graded max(KB/s, KB/frame x 60)) on a herd-role staged fight + sprint; every src frame in a file instruments-core edits <= 4 KB/s; frozen machine files and the rest of src/** reported with their owner",
    check: (ctx) => allocMachines(ctx),
  },
  {
    id: 'A-lamp-states', kind: 'action', lane: LANE, timeout: 300000, settle: 600,
    setup: '__CTX__.input.enabled = true;',
    title: 'Lamp grammar on the herd-role Instrument (the Tiller fixture), rendered pixels at 15.0 m: colour dE2000 <= 3 of the state token, iris area 100/50/20 % (consecutive ratio >= 2, dark closed), rhythm 0/1/4 Hz +-15 % and sputter-then-out, consecutive tokens dE >= 25, beam in wary/hostile when fog density > 1.2 or night and never in calm',
    assert: KB.lampStatesAssert(HERD),
  },
  {
    id: 'A-lamp-canon-distance', kind: 'runner', lane: LANE, timeout: 120000,
    title: 'Every lamp, beam, scanner and compass-pip colour token (JS + CSS) is dE2000 >= 20 from #38c6ff #ffb31f #ff2413 #19ffd0 #9B6BFF; no lamp-state token within dE 10 of a scanner highlight token; CIEDE2000 checked against the Sharma pairs first',
    check: async () => {
      const s = await canonDistanceStatic();
      const bad = s.graded.filter((r) => !r.ok);
      const hl = s.highlight.filter((h) => h.dE < 10);
      const pass = s.sharmaMaxErr < 1e-4 && bad.length === 0 && hl.length === 0 && s.beamFromTokens && s.graded.length >= 16;
      return { pass, detail: { sharmaMaxErr: s.sharmaMaxErr, gradedTokens: s.graded.length, offenders: bad,
        graded: s.graded.map((r) => `${r.source} ${r.name} ${r.hex} min dE ${r.minDE} (vs ${r.nearest})`),
        listedNotGraded: (() => { const g = {}; for (const r of s.listed) { const k = r.note && r.note.startsWith('body colour') ? 'sensor-part body colours (instruments-core; emissive graded)' : r.note && r.note.startsWith('frozen') ? 'rig/shells.js dead default' : r.source.split(':')[0];
          const e = g[k] || (g[k] = { n: 0, worstDE: 99, worstHex: null, note: r.note }); e.n++; if (r.minDE < e.worstDE) { e.worstDE = r.minDE; e.worstHex = r.hex; } } return g; })(),
        lampVsScannerHighlight: s.highlight, beamTintFromTokens: s.beamFromTokens,
        buildShellCallers: s.shellsCallers.length, filesScanned: s.filesScanned, literalsInLampContext: s.literalsInContext } };
    },
  },
  {
    id: 'A-beams-one-draw', kind: 'action', lane: LANE, timeout: 240000, settle: 600,
    title: 'Eight wary herd-role Instruments in fog: the beams are ONE draw per frame (8 instances), attributed on the same frozen frame (wary vs calm); after a warm cycle, spawn/kill x3 then dispose returns GPU geometries, textures, scene materials and lamp records to the baseline',
    assert: A_BEAMS_ONE_DRAW,
  },
  {
    id: 'A-perception-weather', kind: 'action', lane: LANE, timeout: 300000, settle: 600,
    title: "setWeather('calima') then a sight test on the herd-role Instrument: sight range x0.5 +-5 % in sim; trade 1.0; the detectMul hook scales the fill rate (x0.5 probe)",
    assert: A_PERCEPTION_WEATHER,
  },
  {
    id: 'A-perk-hooks', kind: 'action', lane: LANE, timeout: 300000, settle: 600,
    setup: '__CTX__.input.enabled = true;',
    title: 'Perk hooks (R31), each with its negative control: perception.detectMul = 0.5 halves the calm fill rate at 20 m (x1.0 without; hostile unchanged); perception.flagDuration = 3 ends a Flag at 3 +-0.1 s (8 +-0.1 s without); a noise filter that drops footsteps yields 0 footstep stimuli over a 10 s jog (> 0 without); the Dust-sight occlusion flag',
    assert: A_PERK_HOOKS,
  },
  {
    id: 'A-uv1-survives-fold', kind: 'action', lane: LANE, timeout: 90000, settle: 400,
    title: 'A generated GLB with a decal uv1 folded through rig/lod.js: uv1 present after the fold and within 1e-4 of the source; a merge group that does not sample uv1 drops it',
    assert: A_UV1(STATIC_B.uv1),
  },
  {
    id: 'A-vfx-palette', kind: 'action', lane: LANE, timeout: 240000, settle: 600,
    title: 'Every machine particle and glint emitter (hits, tears, sparks, arcs, elements, explosions, deaths, beacons, attack flashes) on every spawnable kind: no colour within dE2000 15 of #38c6ff or #19ffd0; the rig/fx.js default spark is not blue',
    assert: A_VFX(STATIC_B.vfx),
  },
  {
    id: 'A90-rig-reclaim-5of5', kind: 'runner', lane: LANE, timeout: 1800000,
    title: 'A90-rig-reclaim on the staged kinds, bars unchanged, 5 of 5 fresh-page runs',
    check: async ({ PORT }) => {
      const id = shadowId('A90-rig-reclaim');
      const runs = await nRuns(PORT, [id], 5, 'rig5', { timeoutMs: 420000 });
      const v = runs.map((r) => r.results.find((x) => x.id === id) || { status: 'NOT-RUN' });
      return { pass: v.every((x) => x.status === 'PASS'), detail: { verdicts: v.map((x) => x.status),
        runs: v.map((x, i) => ({ run: i + 1, status: x.status, ms: x.ms, error: x.error, afterCycles: x.detail?.afterCycles, perLiveMachine: x.detail?.perLiveMachine, heldThenReleased: x.detail?.heldThenReleased, cycles: x.detail?.cycles, roster: x.detail?.roster })) } };
    },
  },
  {
    id: 'A90b-memory-attribution-3of3', kind: 'runner', lane: LANE, timeout: 1500000,
    title: 'A90b with the role-based workload (R34), 3 of 3 fresh-page runs; 0 offenders at the machine.js model clone or the autorig.js bones',
    check: async ({ PORT }) => {
      const id = shadowId('A90b-memory-attribution');
      const runs = await nRuns(PORT, [id], 3, 'a90b3', { timeoutMs: 420000 });
      const v = runs.map((r) => r.results.find((x) => x.id === id) || { status: 'NOT-RUN' });
      return { pass: v.every((x) => x.status === 'PASS'), detail: { verdicts: v.map((x) => x.status),
        runs: v.map((x, i) => ({ run: i + 1, status: x.status, ms: x.ms, error: x.error, offenders: x.detail?.offenders, r34: x.detail?.r34, kills: x.detail?.kills, heap: x.detail?.heap, counters: x.detail?.counters })) } };
    },
  },
  {
    id: 'A-kind-block-file', kind: 'runner', lane: LANE, timeout: 3600000,
    title: 'tools/gates.r5.kind-block.mjs exports the per-kind block parameterised by kind, and it runs green on the Tiller fixture (fidelity-only clauses report SKIP-fixture)',
    check: async ({ PORT }) => {
      const rows = typeof KB.kindBlock === 'function' ? KB.kindBlock({ role: 'herd', fixture: true, lane: 'probe', class: 'medium' }) : [];
      const rowsByKind = typeof KB.kindBlock === 'function' ? KB.kindBlock({ kind: 'plumb', lane: 'probe', class: 'small' }) : [];
      const ids = rows.map((r) => r.id.split(':')[0]);
      const shape = {
        exportsFunction: typeof KB.kindBlock === 'function', exportsEmptyGates: Array.isArray(KB.GATES) && KB.GATES.length === 0,
        everySection9Row: BLOCK_IDS.filter((x) => !ids.includes(x)),
        parameterisedByKind: rowsByKind.length === rows.length && rowsByKind.every((r) => r.id.endsWith(':plumb')),
        laneHonoured: rows.every((r) => r.lane === 'probe'),
      };
      const runs = await nRuns(PORT, null, 1, 'kindblock', { lane: KIND_LANE, timeoutMs: 3300000 });
      const res = runs[0].results;
      // A41c-sustained-variety: 5/5 clean runs (plan §9) — four more fresh-page runs of that row
      const a41cRow = res.find((x) => x.id.startsWith('A41c-sustained-variety'));
      const more = a41cRow ? await nRuns(PORT, [a41cRow.id], 4, 'a41c', { timeoutMs: 600000 }) : [];
      const a41c = [a41cRow?.status ?? 'NOT-RUN', ...more.map((r) => (r.results.find((x) => x.id === a41cRow.id) || { status: 'NOT-RUN' }).status)];
      const skipFixture = (x) => x.status === 'PENDING' && /SKIP-fixture/.test(JSON.stringify(x.detail || ''));
      const judged = (x) => x.status === 'NEEDS-JUDGE';
      const bad = res.filter((x) => !(x.status === 'PASS' || skipFixture(x) || judged(x)));
      const pass = shape.exportsFunction && shape.exportsEmptyGates && shape.everySection9Row.length === 0 && shape.parameterisedByKind
        && shape.laneHonoured && res.length === rows.length && bad.length === 0 && res.filter((x) => x.status === 'PASS').length >= 15
        && a41c.length === 5 && a41c.every((v) => v === 'PASS');
      return { pass, detail: { shape, a41cFiveRuns: a41c, rows: res.map((x) => ({ id: x.id, status: x.status, ms: x.ms,
        note: x.status === 'PASS' ? undefined : (x.error || JSON.stringify(x.detail || '').slice(0, 400)) })), notGreen: bad.map((x) => x.id),
        details: Object.fromEntries(res.map((x) => [x.id, x.detail])), a41cRuns: more.map((r) => r.results.map((x) => ({ id: x.id, status: x.status, detail: x.detail }))) } };
    },
  },
  A37_HERD, A39_HERD, A43_HERD, A90_RIG, A90B,
  /**
   * THE LAMP FILMS ARE NOT §9 ROWS (instruments-core's §9 block has 0 visual
   * gates; A-lamp-states grades the lamp from rendered pixels). They are the
   * lane's advisory frames, registered only on request so they are never
   * counted as graded V gates without a licence-clean reference
   * (gates-perf A-reference-set):
   *   R5_IC_FILM=1 node tools/gates.mjs --port <p> --extra tools/gates.r5.instruments-core.mjs --lane instruments-core-film
   */
  ...(process.env.R5_IC_FILM ? FILM_ROWS : []),
  ...KB.kindBlock({ role: 'herd', fixture: true, lane: KIND_LANE, class: 'medium' }),
];

/**
 * RUNNER GATES FIRST. The harness launches its own headless Chrome lazily, at
 * the first page gate; the probes and the n-run rows launch a Chrome of their
 * own in a child runner. Running every runner before any page gate keeps this
 * lane at ONE live Chrome at a time (plan §0 rule 8). Array.prototype.sort is
 * stable.
 */
export const GATES = [...W0A_GATES, ...W0B_GATES]
  .sort((a, b) => (a.kind === 'runner' ? 0 : 1) - (b.kind === 'runner' ? 0 : 1));
export const INSTRUMENTS_CORE_W0B_IDS = W0B_GATES.map((g) => g.id);
export { FILM_ROWS };
