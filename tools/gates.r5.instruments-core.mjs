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
  // the beam tint is the token's linear value: `this.lin[id]` from `LAMP_STATES[id].token`, copied into the flat
  // `_linA` (fix round 1: no keyed load by state name per frame) that the beam colour reads
  const beamFromTokens = /this\.lin\[id\][\s\S]{0,40}|const c = hexToRgb\(LAMP_STATES\[id\]\.token\)/.test(lampsSrc)
    && (/const lc = this\.lin\[s\]/.test(lampsSrc)
      || (/l = this\.lin\[LAMP_ORDER\[i\]\][\s\S]{0,400}this\._linA\[i \* 3\] = l\.r/.test(lampsSrc)
        && /const LA = this\._linA[\s\S]{0,200}B\[ob\] = LA\[si \* 3\] \* k/.test(lampsSrc)));
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
    m.forceState('search'); m.lastKnown.copy(lampPos).addScaledVector(axis, 9).addScaledVector(side, 4);
    /* FIX ROUND 3 (judge-r3: "the hostile lock beam does not appear in either beam film"). Measured in the old
     * staging (A-film-beams-*-probe): the hostile Tiller stood 7 m along WORLD x, so its lock line to Brea ran almost
     * along the camera's view axis and its 10 m shaft covered 62 px of the frame, end-on behind its own lamp. The
     * hostile Tiller now stands 6 m to the side of the wary one, facing the same way, with Brea 10 m straight ahead
     * of its lamp, on the camera's side (the wary Tiller's stimulus lies away from the camera): both shafts cross the
     * frame side-on, one below the other, as in a normal side view of a lock. */
    if (m2) {
      const hx = m.position.x - side.x * 6, hz = m.position.z - side.z * 6;
      m2.position.set(hx, T.getHeight(hx, hz), hz);
      m2.heading = m.heading; m2.root.rotation.y = m.heading; m2.root.updateMatrixWorld(true);
      m2.forceState('attack');
    }
    const tgt = lampPos.clone().addScaledVector(axis, 10).addScaledVector(side, -6);
    p.position.set(tgt.x, T.getHeight(tgt.x, tgt.z), tgt.z); if (p.model) p.model.visible = true;
  } else m.lastKnown.copy(lampPos).addScaledVector(axis, 6);
  holdStill(m); if (m2) holdStill(m2);   // body still, glows live
  // the lens: camera.zoom (player.js and combat.js damp camera.fov every frame; nothing writes zoom)
  if (st === 'beams') {
    cam.zoom = 1; cam.updateProjectionMatrix();
    // a side view from the game camera's height (4.5 m over the ground, looking a little down), so the shafts
    // cross ground and bodies rather than the fog-white horizon an additive beam cannot read against (fix round 3)
    cam.position.copy(lampPos).addScaledVector(axis, 4).addScaledVector(side, -18); cam.position.y = Math.max(cam.position.y, T.getHeight(cam.position.x, cam.position.z) + 4.5);
    cam.lookAt(lampPos.clone().addScaledVector(axis, 5).addScaledVector(side, -2).add(new V(0, -1.0, 0)));
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
/**
 * FIX ROUND 3 (judge instruments-core/W0b/judge-r3: "the hostile lock beam does not appear in either beam film").
 * THE FILM STAGING ASSERTS ITS OWN BEAMS. Each beam film has a companion action row with the SAME setup (the same
 * staging function, the same settle) that measures, in that frame, the hostile beam along the line from the hostile
 * Tiller's lamp to the point it locks on (Brea's chest, 1.3 m up), and the wary beam along its own axis:
 *   at 8 points from 10 % to 80 % of the lamp-to-target segment (the beam ENDS on her: the lock shaft stops where her
 *   body takes the light), the paired (on - off) read — 6 consecutive frame pairs with and without the beam draw,
 *   7 x 7 px — and the on-frame pixel's hue;
 *   PASS when the hostile shaft adds >= 24 to R+G+B with dR > dG and dB > dG (a magenta addition) at >= 6 of the
 *   8 points, AND the on-frame pixel passes the judge's own magenta scan (R and B each > G + 25) at >= 6 of 8; the
 *   wary shaft adds >= 24 at >= 6 of 8 with dG > dB (chartreuse); and no point beyond her (110-140 % of the
 *   segment) carries magenta beam light (min(dR - dG, dB - dG) < 6: it ends on the player).
 * The screenshot the harness takes after the assert is the frame the numbers were read on.
 */
const FILM_BEAM_PROBE = (night) => `(async () => {
  ${KB.PIX}
  const C = __CTX__, M = C.machines, E = C.engine, cam = C.camera, p = C.player;
  const recs = M.lamps.records;
  const rh = recs.find(r => r.state === 'hostile'), rw = recs.find(r => r.state === 'wary');
  if (!rh || !rw) return { pass: false, detail: { error: 'staging: expected one hostile and one wary lamp', states: recs.map(r => r.state) } };
  const V = p.position.constructor;
  const lampOf = (r) => new V().setFromMatrixPosition(r.anchor.matrixWorld);
  const settle = () => new Promise(res => { let n = 0; const f = () => (++n >= 3 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  await settle();
  const pairRead = async (q) => {
    const v = q.clone().project(cam);
    if (Math.abs(v.x) > 0.97 || Math.abs(v.y) > 0.97 || v.z > 1) return null;
    const fx = (W) => (v.x * 0.5 + 0.5) * W, fy = (H) => (v.y * 0.5 + 0.5) * H;
    let dR = 0, dG = 0, dB = 0, oR = 0, oG = 0, oB = 0; const K = 6;
    for (let k = 0; k < K; k++) {
      M.lamps.hideBeams = false; const on = await PIX.grab(fx, fy, 7);
      M.lamps.hideBeams = true; const off = await PIX.grab(fx, fy, 7);
      M.lamps.hideBeams = false;
      const n = on.px.length / 4;
      for (let i = 0; i < on.px.length; i += 4) { dR += on.px[i] - off.px[i]; dG += on.px[i + 1] - off.px[i + 1]; dB += on.px[i + 2] - off.px[i + 2]; oR += on.px[i]; oG += on.px[i + 1]; oB += on.px[i + 2]; }
      dR /= 1; // (sums; divided below)
      if (k === K - 1) { const d = n * K; return { sx: Math.round((v.x * 0.5 + 0.5) * 1600), sy: Math.round((0.5 - v.y * 0.5) * 900),
        dR: +(dR / d).toFixed(1), dG: +(dG / d).toFixed(1), dB: +(dB / d).toFixed(1), d: +((dR + dG + dB) / d).toFixed(1),
        on: [Math.round(oR / d), Math.round(oG / d), Math.round(oB / d)] }; }
    }
  };
  const hl = lampOf(rh), tgt = new V(p.position.x, p.position.y + 1.3, p.position.z);
  const segLen = hl.distanceTo(tgt);
  const host = [], beyond = [];
  for (const f of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) { const r = await pairRead(hl.clone().lerp(tgt, f)); host.push(r ? { f, ...r } : { f, offscreen: true }); }
  for (const f of [1.1, 1.25, 1.4]) { const r = await pairRead(hl.clone().lerp(tgt, f)); beyond.push(r ? { f, ...r } : { f, offscreen: true }); }
  const wl = lampOf(rw), wdir = rw.dir.clone(), wary = [];
  for (const d of [1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12]) { const r = await pairRead(wl.clone().addScaledVector(wdir, d)); wary.push(r ? { d, ...r } : { d, offscreen: true }); }
  PIX.stop();
  const hostOk = host.filter(x => !x.offscreen && x.d >= 24 && x.dR > x.dG && x.dB > x.dG).length;
  const hostScan = host.filter(x => !x.offscreen && x.on[0] > x.on[1] + 25 && x.on[2] > x.on[1] + 25).length;
  const waryOk = wary.filter(x => !x.offscreen && x.d >= 24 && x.dG > x.dB).length;
  // beyond her: no MAGENTA light (the added red and blue over the added green), whatever else moves there (rain, her
  // own silhouette, the other shaft): the lock ends on her
  const beyondMax = Math.max(0, ...beyond.filter(x => !x.offscreen).map(x => Math.min(x.dR - x.dG, x.dB - x.dG)));
  const pass = hostOk >= 6 && hostScan >= 6 && waryOk >= 6 && beyondMax < 6;
  return { pass, detail: {
    verdict: (pass ? 'PASS' : 'FAIL') + ': hostile shaft read at ' + hostOk + '/8 points (bar 6), judge magenta scan ' + hostScan + '/8 (bar 6), wary shaft ' + waryOk + '/8 (bar 6), beyond the player max magenta excess ' + beyondMax + ' (min(dR - dG, dB - dG); bar < 6)',
    night: ${night}, segmentM: +segLen.toFixed(2), hostileBeamLenM: +rh.blen.toFixed(2), hostileBeamOn: !!rh.beamOn, waryBeamOn: !!rw.beamOn,
    lockAngleToTargetDeg: +(Math.acos(Math.min(1, rh.dir.dot(tgt.clone().sub(hl).normalize()))) * 180 / Math.PI).toFixed(2),
    hostile: host, beyondPlayer: beyond, wary, film: window.__IC_FILM__ || null,
    beamDraw: (() => { const L = M.lamps, bm = L.beamMesh, B = L._aBeam.array, im = bm.instanceMatrix.array; const row = (r) => r && r.bslot >= 0 ? { slot: r.bslot, rgbw: [0, 1, 2, 3].map(i => +B[r.bslot * 4 + i].toFixed(3)), pos: [12, 13, 14].map(i => +im[r.bslot * 16 + i].toFixed(2)), zAxisLen: +Math.hypot(im[r.bslot * 16 + 8], im[r.bslot * 16 + 9], im[r.bslot * 16 + 10]).toFixed(2), lowLOD: !!r.machine.lowLOD } : null;
      return { count: bm.count, visible: bm.visible, fogK: +L.fogK.toFixed(2), night: +L.night.toFixed(2), hostile: row(rh), wary: row(rw), hostileLamp: [hl.x, hl.y, hl.z].map(v => +v.toFixed(2)), target: [tgt.x, tgt.y, tgt.z].map(v => +v.toFixed(2)) }; })(),
    metric: 'mean (on - off) per channel and R+G+B (0-765) over 7x7 px, 6 consecutive frame pairs with / without the beam draw; on = the mean on-frame pixel (0-255); screen px in a 1600x900 frame' } };
})()`;
FILM_ROWS.push({
  id: 'A-film-beams-night-probe', kind: 'action', lane: 'instruments-core-film', timeout: 180000,
  title: 'The night beam film, measured in its own frame: the hostile shaft reads magenta from the lamp to Brea and stops on her; the wary shaft reads chartreuse',
  setup: FILM('beams', { both: true, night: true }), settle: 1500,
  assert: FILM_BEAM_PROBE(true),
});
FILM_ROWS.push({
  id: 'A-film-beams-fog-probe', kind: 'action', lane: 'instruments-core-film', timeout: 180000,
  title: 'The fog beam film, measured in its own frame: the hostile shaft reads magenta from the lamp to Brea and stops on her; the wary shaft reads chartreuse',
  setup: FILM('beams', { both: true }), settle: 1500,
  assert: FILM_BEAM_PROBE(false),
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
 *   and major GC included); graded per function = max(measured KB/s, KB/frame
 *   x 60) on CALLER attribution (the nearest src/** frame on the allocating
 *   stack — gates-perf's budgets.mjs `alloc.attribution`, W0b fix round 1; the
 *   profiler's frame is the physical one, so a function inlined into another is
 *   charged to its host); bar 4 KB/s per function (budgets.mjs `alloc.fnKBps`).
 *   FIX ROUND 2 (judges instruments-core/W0b): a 30 s warm-up after staging and
 *   SIX 10 s windows (three of the fight, three of the sprint = 60 s of play),
 *   EVERY window graded on its own — a deopt mid-session that drops a hot
 *   function into an allocating tier fails the window it lands in.
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
  /* KEEP THE FIGHT A FIGHT (fix round 2): with a 30 s warm-up a herd kind's cast loses interest long before the
   * windows open (probe: all 36 lamps calm 30 s after staging), so the windows would grade a calm patrol. Every
   * second a cast member that left the fight is re-armed on her (lastKnown, suspicion 1, attack); every 250 ms
   * the share of the cast in a hostile state is sampled — the witness each window reports and the gate requires. */
  const HOSTILE = new Set(['alert', 'attack', 'stagger', 'downed']);
  window.__icRearm = setInterval(() => { for (const m of cast) { if (!m.alive || m._disposed) continue;
    if (!HOSTILE.has(m.state)) { m.lastKnown.copy(p.position); m.suspicion = 1; m._unseenT = 0; m.forceState('attack'); } } }, 1000);
  const W = window.__icWit = { samples: 0, hostile: 0 };
  window.__icWitT = setInterval(() => { for (const m of cast) { if (!m.alive) continue; W.samples++; if (HOSTILE.has(m.state)) W.hostile++; } }, 250);
  return { kind: KIND, cast: cast.length, alive: M.list.filter(m => m.alive).length, list: M.list.length };
})()`;
const ALLOC_SPRINT_ON = `(() => { const I = __CTX__.input; I.keys.add('KeyW'); I.keys.add('ShiftLeft'); return true; })()`;
const ALLOC_SPRINT_OFF = `(() => { const C = __CTX__, I = C.input; I.keys.delete('KeyW'); I.keys.delete('ShiftLeft');
  clearInterval(window.__icRearm); clearInterval(window.__icWitT); window.__icRearm = window.__icWitT = null;
  const a = C.engine.onAfterRender, i = a.indexOf(window.__icAllocHeal); if (i >= 0) a.splice(i, 1); window.__icAllocHeal = null;
  return { alive: C.machines.list.filter(m => m.alive).length, hostile: C.machines.list.filter(m => m.alive && (m.state === 'attack' || m.state === 'alert')).length }; })()`;

async function allocMachines({ PORT }, opts = {}) {
  /* THE METHOD (W0b fix round 2; every term the same or stricter than gates-perf's A-alloc-rate, budgets.mjs `alloc`):
   *   bar 4 KB/s per function (`alloc.fnKBps`), sampling interval 2048 B, minor + major GC objects included,
   *   graded = max(measured KB/s, KB/frame x 60) on CALLER attribution (the nearest src/** frame on the
   *   allocating stack: a three.js / builtin allocation made on a src function's behalf is that function's);
   *   a 30 s warm-up after staging (judge: deopts must be measured, not waited out), then SIX consecutive
   *   10 s windows — three of the staged fight, three of a sprint through the roster — and EVERY window is
   *   graded on its own (a function over the bar in any one window fails), so 60 s of play are graded. */
  const FN_BAR = 4, INTERVAL = 2048, WARM = 30000, WINDOW = 10000, FIGHT_WINDOWS = 3, SPRINT_WINDOWS = 3, SPRINT_WARM = 3000;
  const { default: puppeteer } = await import('puppeteer');
  const CP = await import(pathToFileURL(path.join(ROOT, 'tools/chrome-profile.mjs')).href);
  CP.installProfileCleanup();
  const dir = CP.profileDir(PORT);
  const jsFlags = ['--expose-gc'];
  const noInline = !!(process.env.R5_IC_NOINLINE || opts.noInline);
  if (noInline) jsFlags.push('--no-turbo-inlining', '--max-inlined-bytecode-size=0', '--no-maglev-inlining');   // one frame per function (the paired attribution run, or diagnosis)
  if (process.env.R5_IC_OPTSTATUS) jsFlags.push('--allow-natives-syntax');                                 // diagnosis only: tier of each hot function
  const deoptMark = !!process.env.R5_IC_DEOPTMARK;   // diagnosis only (fix round 3): --trace-deopt timed by in-stream markers + tier sampling
  if (process.env.R5_IC_TRACEDEOPT || deoptMark) jsFlags.push('--trace-deopt');                             // diagnosis only: deopts per function, timed
  if (deoptMark && !process.env.R5_IC_OPTSTATUS) jsFlags.push('--allow-natives-syntax');
  if (process.env.R5_IC_PROTOTRACE) jsFlags.push('--trace-prototype-users', '--allow-natives-syntax');      // diagnosis only: which prototype map is invalidated
  const diag = !!(deoptMark || process.env.R5_IC_SHAPEWATCH || process.env.R5_IC_PROTOTRACE || process.env.R5_IC_NOINLINE || process.env.R5_IC_OPTSTATUS || process.env.R5_IC_TRACEDEOPT || process.env.R5_IC_PROTOWATCH || process.env.R5_IC_MICRO || process.env.R5_IC_INGAME);
  let protoLock = null;
  const browser = await puppeteer.launch({ protocolTimeout: 900000, headless: 'new', userDataDir: dir, dumpio: false,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940', `--js-flags=${jsFlags.join(' ')}`, '--enable-precise-memory-info'] });
  const r2 = (x) => Math.round(x * 100) / 100;
  // --trace-deopt lines, each stamped with the wall clock on arrival (diagnosis only)
  const deoptLog = [];
  const sfiNames = new Map(); let sfiCur = null;   // R5_IC_DEOPTMARK: SharedFunctionInfo address -> index of the named lane function
  if (process.env.R5_IC_TRACEDEOPT || deoptMark) {
    let tail = '';
    const onData = (buf) => {
      const s = tail + String(buf); const lines = s.split('\n'); tail = lines.pop();
      const now = Date.now();
      for (const line of lines) {
        if (deoptMark) {
          let mm;
          if ((mm = /^DebugPrint: Smi: 0x[0-9a-f]+ \((-?\d+)\)/.exec(line))) { const i = +mm[1]; sfiCur = i <= -1000 ? -1000 - i : null; continue; }
          if (sfiCur !== null && (mm = /^ - shared_info: (0x[0-9a-f]+)/.exec(line))) { sfiNames.set(mm[1], sfiCur); sfiCur = null; continue; }
        }
        if (!/deoptimiz/.test(line)) continue;
        const fn = (/<JSFunction ([^ >]+)/.exec(line) || /<SharedFunctionInfo ([^>]*)>/.exec(line) || [])[1] || '?';
        const why = (/reason: ([^)\],]+)/.exec(line) || [])[1] || '?';
        deoptLog.push({ t: now, fn: fn || '(anonymous)', why, lazy: /marking dependent code/.test(line), tier: (/<Code (\w+)>/.exec(line) || [])[1] || '',
          sfi: (/\(sfi = (0x[0-9a-f]+)\)/.exec(line) || /\((0x[0-9a-f]+) <SharedFunctionInfo/.exec(line) || [])[1],
          off: (/bytecode offset (\d+)/.exec(line) || [])[1], kind: (/kind: ([\w-]+)/.exec(line) || [])[1] });
      }
    };
    browser.process()?.stdout?.on('data', onData);
    browser.process()?.stderr?.on('data', onData);
  }
  // --trace-prototype-users invalidations + %DebugPrint map snapshots of every candidate prototype (diagnosis only)
  const pt = { inval: [], snaps: [], cur: null, idx: null };
  if (process.env.R5_IC_PROTOTRACE) {
    let tail = '';
    const onData = (buf) => {
      const lines = (tail + String(buf)).split('\n'); tail = lines.pop(); const now = Date.now();
      for (const line of lines) {
        let m;
        if ((m = /Invalidating prototype map (0x[0-9a-f]+)/.exec(line))) { pt.inval.push([now, m[1]]); continue; }
        if ((m = /^DebugPrint: Smi: 0x[0-9a-f]+ \((-?\d+)\)/.exec(line))) { const i = +m[1]; if (i === -1) { pt.cur = { t: now, maps: new Map() }; } else if (i === -2) { if (pt.cur) pt.snaps.push(pt.cur); pt.cur = null; } else pt.idx = i; continue; }
        if (pt.cur && pt.idx !== null && (m = /^ - map: (0x[0-9a-f]+)/.exec(line))) { pt.cur.maps.set(m[1], pt.idx); pt.idx = null; }
      }
    };
    browser.process()?.stdout?.on('data', onData);
    browser.process()?.stderr?.on('data', onData);
  }
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, process.env.R5_IC_PROTOLOCK ? 900 : 300)); });
    page.on('pageerror', (e) => errors.push((process.env.R5_IC_PROTOLOCK ? String(e && e.stack || e) : String(e)).slice(0, process.env.R5_IC_PROTOLOCK ? 900 : 300)));
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`http://localhost:${PORT}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__READY__ === true', { timeout: 120000 });
    const cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable');
    const staged = await page.evaluate(ALLOC_STAGE);
    if (staged.skip) return { pass: null, detail: staged.skip };
    if (deoptMark) await page.evaluate(DEOPTMARK_ON);
    if (process.env.R5_IC_PROTOWATCH) await page.evaluate(PROTOWATCH_ON);
    if (process.env.R5_IC_SHAPEWATCH) await page.evaluate(SHAPEWATCH_ON);
    let ptLabels = null;
    if (process.env.R5_IC_PROTOTRACE) ptLabels = await page.evaluate(PROTOTRACE_ON);
    if (process.env.R5_IC_PROTOLOCK) setTimeout(() => { page.evaluate(PROTOLOCK_ON).then((r) => { protoLock = r; }).catch((e) => { protoLock = { error: String(e).slice(0, 200) }; }); }, 20000);
    const srcRe = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${PORT}/src/`);
    const keyOf = (cf) => `${cf.functionName || '(anonymous)'} ${String(cf.url).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
    const ownerOf = (fn) => { const file = fn.split(' ').slice(-1)[0].replace(/:\d+$/, ''); return !MINE_RE.test(file) ? 'other' : FROZEN_MACHINE_RE.test(file) ? 'frozen-machine' : 'instruments-core'; };
    const windows = [];
    const window1 = async (name) => {
      await page.evaluate('(() => { const W = window.__icWit; if (W) { W.samples = 0; W.hostile = 0; } return true; })()');
      const f0 = await page.evaluate('__CTX__.engine.frames');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: INTERVAL, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      const tS = Date.now();
      const pS = deoptMark ? await page.evaluate('performance.now()') : 0;
      await sleep(WINDOW);
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      const tE = Date.now();
      const pE = deoptMark ? await page.evaluate('performance.now()') : 0;
      const secs = (tE - tS) / 1000;
      const frames = (await page.evaluate('__CTX__.engine.frames')) - f0;
      const wit = await page.evaluate('(() => { const W = window.__icWit; const r = W && W.samples ? +(W.hostile / W.samples).toFixed(3) : null; if (W) { W.samples = 0; W.hostile = 0; } return r; })()');
      const self = new Map(), caller = new Map(); let total = 0, srcSelf = 0, srcCaller = 0;
      const parents = new Map();   // src frame -> the src frames that called it directly (for the paired attribution run)
      // an accessor frame (machine.js `get heading` ...) is charged what its CALLER's megamorphic read costs: the
      // caller is recorded so the report names who reads it
      const getterCallers = new Map();
      const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
      const walk = (node, nearest, above) => {
        const cf = node.callFrame || {};
        const isSrc = srcRe.test(cf.url || '');
        const k = isSrc ? keyOf(cf) : null;
        const here = k || nearest, hereAbove = k ? nearest : above;
        if (k && nearest && nearest !== k) { const ps = parents.get(k) || new Set(); ps.add(nearest); parents.set(k, ps); }
        const sz = node.selfSize || 0;
        if (sz) {
          total += sz;
          if (isSrc) { srcSelf += sz; add(self, k, sz); }
          if (here) {
            srcCaller += sz; add(caller, here, sz);
            if (/^(get|set) /.test(here)) {
              const m = getterCallers.get(here) || new Map(); getterCallers.set(here, m);
              add(m, hereAbove || '(no src caller)', sz);
            }
          }
        }
        for (const c of node.children || []) walk(c, here, hereAbove);
      };
      walk(profile.head, null, null);
      const at = (b) => ({ measuredKBps: r2(b / 1024 / secs), kbPerFrame: frames ? r2(b / 1024 / frames) : null, gradedKBps: r2(Math.max(b / 1024 / secs, frames ? (b / 1024 / frames) * 60 : 0)) });
      const rows = [...caller.entries()].map(([fn, b]) => ({ fn, owner: ownerOf(fn), ...at(b), selfKBps: at(self.get(fn) || 0).gradedKBps }))
        .sort((a, b) => b.gradedKBps - a.gradedKBps);
      const callers = {};
      for (const [g, m] of getterCallers) callers[g] = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, b]) => `${at(b).gradedKBps} KB/s from ${c}`);
      const w = { name, tS, tE, pS, pE, secs: r2(secs), frames, fps: r2(frames / secs), castHostile: wit, parents, total: at(total), srcCaller: at(srcCaller), srcSelf: at(srcSelf), getterCallers: callers, getterCallersRaw: getterCallers,
        mine: rows.filter((r) => r.owner === 'instruments-core'), frozenMachine: rows.filter((r) => r.owner === 'frozen-machine'), allRows: rows,
        topOther: rows.filter((r) => r.owner === 'other').slice(0, 12) };
      windows.push(w);
      return w;
    };
    // warm-up: the staged fight runs 30 s before anything is measured
    await sleep(WARM);
    let inGame = null;
    if (process.env.R5_IC_INGAME) {
      // diagnosis only: heap delta around single in-game calls (real tiers, real context), negative deltas (a GC) dropped
      inGame = await page.evaluate(`(async () => {
        const C = __CTX__, M = C.machines, mem = () => performance.memory.usedJSHeapSize;
        const wrap = (obj, name, label, acc) => { const f = obj[name]; obj[name] = function (...a) { const h0 = mem(); const r = f.apply(this, a); const d = mem() - h0; if (d >= 0) { acc[label] = acc[label] || [0, 0]; acc[label][0] += d; acc[label][1]++; } return r; }; return () => { obj[name] = f; }; };
        const acc = {}; const undo = [];
        undo.push(wrap(M.lamps, 'update', 'lamps.update', acc));
        undo.push(wrap(M, '_standoffPass', '_standoffPass', acc));
        undo.push(wrap(M, '_separationPass', '_separationPass', acc));
        await new Promise(r => setTimeout(r, 6000));
        for (const u of undo) u();
        const out = {}; for (const [k, [b, n]] of Object.entries(acc)) out[k] = { calls: n, bytesPerCall: +(b / n).toFixed(1) };
        return out;
      })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
    }
    for (let i = 0; i < FIGHT_WINDOWS; i++) await window1(`staged fight ${i + 1}/${FIGHT_WINDOWS}`);
    let tiers = null;
    if (process.env.R5_IC_OPTSTATUS) {
      // %GetOptimizationStatus bits (V8 runtime-test.cc): 16 optimized, 32 maglev, 64 turbofan, 128 interpreted, 8 maybe-deopted, 256 marked, 2048+ baseline
      tiers = await page.evaluate(`(async () => { const C = __CTX__, M = C.machines; const m = M.list.find(x => x.alive && x.kind === M.roles.herd) || M.list[0];
        const MM = await import('/src/entities/machines/machine.js'); const PP = await import('/src/entities/machines/ai/perception.js');
        const fns = { 'Machines.update': M.update, 'Machines._stepMachines': M._stepMachines, 'Machines._standoffPass': M._standoffPass, 'Machines._separationPass': M._separationPass,
          'lamps.update': M.lamps.update, 'Machine.update': m.update, 'ai.tick': m.ai.tick, 'gait.update': m.gait && m.gait.update, 'terrain.getHeight': C.terrain.getHeight };
        for (const k of ['updateEyesM', 'conformM', 'steerAlongS', 'navTowardS', 'turnS', 'faceS', 'moveTowardS', 'stepRootS', 'updatePartsM', 'updateFxM', 'updateElementalM']) fns[k] = MM[k];
        for (const k of ['_statePatrol', '_engageFrame', '_stateReturn', '_stateSuspicious']) fns[k] = m[k];
        for (const k of ['_scan', '_sight', '_belief', 'update']) fns['perception.' + k] = m.ai.perception[k];
        const out = {}; for (const [k, f] of Object.entries(fns)) { try { out[k] = typeof f === 'function' ? %GetOptimizationStatus(f) : null; } catch (e) { out[k] = String(e).slice(0, 80); } }
        return out; })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
    }
    await page.evaluate(ALLOC_SPRINT_ON);
    await sleep(SPRINT_WARM);
    for (let i = 0; i < SPRINT_WINDOWS; i++) await window1(`sprint ${i + 1}/${SPRINT_WINDOWS}`);
    const end = await page.evaluate(ALLOC_SPRINT_OFF);
    let deoptTimed = null;
    if (deoptMark) {
      const mk = await page.evaluate(DEOPTMARK_OFF).catch((e) => ({ error: String(e).slice(0, 200) }));
      const shapes = await page.evaluate(SHAPES_REPORT).catch((e) => ({ error: String(e).slice(0, 300) }));
      await sleep(1500);   // let the renderer's stdout drain
      deoptTimed = timeDeopts(deoptLog, mk, windows, sfiNames);
      deoptTimed.shapes = shapes;
    }
    const shapeLog = process.env.R5_IC_SHAPEWATCH ? await page.evaluate(SHAPEWATCH_OFF).catch((e) => ({ error: String(e).slice(0, 200) })) : null;
    const protoLog = process.env.R5_IC_PROTOWATCH ? await page.evaluate(PROTOWATCH_OFF).catch((e) => ({ error: String(e).slice(0, 200) })) : null;
    let protoTrace = null;
    if (process.env.R5_IC_PROTOTRACE) {
      await page.evaluate('(() => { clearInterval(window.__icPTtimer); return true; })()').catch(() => {});
      const t0 = windows.length ? windows[0].tS - WARM : 0;
      const hits = [];
      for (const [t, addr] of pt.inval) {
        let who = null;
        for (let i = pt.snaps.length - 1; i >= 0; i--) { const sn = pt.snaps[i]; if (sn.t > t) continue; if (sn.maps.has(addr)) { who = ptLabels.labels[sn.maps.get(addr)]; break; } }
        hits.push([r2((t - t0) / 1000), addr, who]);
      }
      const by = new Map(); for (const [t, a, w] of hits) { const k = w || ('(unknown map ' + a + ')'); const e = by.get(k) || { n: 0, at: [] }; e.n++; if (e.at.length < 12) e.at.push(t); by.set(k, e); }
      protoTrace = { candidates: ptLabels && ptLabels.labels.length, snapshots: pt.snaps.length, invalidations: pt.inval.length,
        afterWarmupStart: hits.filter((h) => h[0] >= 0).length, byPrototype: [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 60).map(([k, e]) => `${e.n}x ${k} @ ${e.at.join(', ')} s`) };
    }
    const protoLockLog = process.env.R5_IC_PROTOLOCK ? { locked: protoLock, hits: await page.evaluate('window.__icLockHits || null').catch(() => null) } : null;
    let micro = null;
    if (process.env.R5_IC_MICRO) {
      // diagnosis only: bytes per call of each hot function over every live machine, after the graded windows
      micro = await page.evaluate(`(async () => {
        const C = __CTX__, M = C.machines;
        if (typeof gc !== 'function') return { error: 'no gc' };
        const mem = () => performance.memory.usedJSHeapSize;
        const MM = await import('/src/entities/machines/machine.js');
        const st = MM._st;
        const L = M.list.filter(x => x.alive && !x._frozenByGate);
        const cases = {
          'perception._scan': (x) => x.ai.perception._scan(0.016),
          'perception._sight': (x) => x.ai.perception._sight(),
          'perception._belief': (x) => x.ai.perception._belief(0.1),
          'conformM (moving)': (x) => { x.position.x += 1e-5; MM.conformM(x, 0.016); x.position.x -= 1e-5; },
          'conformM (still)': (x) => MM.conformM(x, 0.016),
          'turnS': (x) => { st.want = x.sc.heading + 0.01; MM.turnS(x, 0.016); },
          'steerAlongS': (x) => { st.x = 0.3; st.z = 0.9; st.fx = x.position.x + 1; st.fz = x.position.z + 4; st.speed = 2.0; MM.steerAlongS(x, 0.016); },
          'navTowardS': (x) => { st.x = x.position.x + 5; st.z = x.position.z + 5; st.speed = 1.5; MM.navTowardS(x, 0.016); },
          'updateEyesM': (x) => MM.updateEyesM(x, 0.016, C.engine.simTime),
          'Machine.update': (x) => x.update(0.016, C.engine.simTime),
          'lamps.update (once)': (x) => { if (x === L[0]) M.lamps.update(); },
          '_standoffPass (once)': (x) => { if (x === L[0]) M._standoffPass(C.player.position); },
        };
        const out = { machines: L.length, kinds: [...new Set(L.map(x => x.kind))].length };
        for (const [k, f] of Object.entries(cases)) {
          try {
            for (let i = 0; i < 150; i++) for (let j = 0; j < L.length; j++) f(L[j]);
            gc(); gc();
            const h0 = mem();
            for (let i = 0; i < 60; i++) for (let j = 0; j < L.length; j++) f(L[j]);
            out[k] = +((mem() - h0) / 60).toFixed(1) + ' B/frame-equivalent';
          } catch (e) { out[k] = 'ERR ' + String(e).slice(0, 80); }
        }
        return out;
      })()`).catch((e) => ({ error: String(e).slice(0, 200) }));
    }
    // per function: every window's graded rate; the worst window decides
    const perFn = new Map();
    windows.forEach((w, wi) => { for (const r of w.mine) { const e = perFn.get(r.fn) || { fn: r.fn, perWindow: new Array(windows.length).fill(0), self: new Array(windows.length).fill(0) }; e.perWindow[wi] = r.gradedKBps; e.self[wi] = r.selfKBps; perFn.set(r.fn, e); } });
    const fnRows = [...perFn.values()].map((e) => ({ ...e, worst: Math.max(...e.perWindow) })).sort((a, b) => b.worst - a.worst);
    /* WHO CAN FIX EACH FRAME (W0b fix round 2; judge instruments-core/W0b option (b)). Every frame above is
     * graded. A frame over the bar is one of:
     *   lane      code instruments-core edits and whose allocation it causes — must be <= the bar, no ruling
     *   legacy    a legacy species file (the `legacy.js` imports): not in this lane's §1.2 edit grant,
     *             deleted at the W2 exit by instruments-b (plan §6)
     *   accessor  a published-name accessor in machine.js (`get heading` ...) whose bytes are >= 90 % charged
     *             by readers this lane may not edit (frozen gait / rig / collision, melee, the legacy species):
     *             one HeapNumber per changed value per frame, removable only by those readers reading
     *             `m.sc.*` (orchestrator grant)
     * The legacy and accessor classes PASS only under an explicit orchestrator ruling recorded in the plan
     *   <!-- r5-ruling ic-alloc-residual=carried -->
     * Without it the gate FAILS on them. A lane frame over the bar fails whatever the plan says. */
    const residualRuling = /^[ \t]*<!--\s*r5-ruling\s+ic-alloc-residual\s*=\s*carried\s*-->[ \t]*$/m.test(read('docs/ROUND5-PLAN.md'));
    const legacyFiles = new Set([...read('src/entities/machines/legacy.js').matchAll(/^import \{ [A-Z][A-Za-z]* \} from '\.\/([a-z]+)\.js';$/gm)].map((m) => `/src/entities/machines/${m[1]}.js`));
    const notLaneCaller = (k) => { const f = String(k).split(' ').slice(-1)[0].replace(/:\d+$/, ''); return !MINE_RE.test(f) || FROZEN_MACHINE_RE.test(f) || legacyFiles.has(f); };
    const accessorShare = new Map();
    for (const w of windows) for (const [g, m] of w.getterCallersRaw) { const e = accessorShare.get(g) || [0, 0]; for (const [c, b] of m) { e[1] += b; if (notLaneCaller(c)) e[0] += b; } accessorShare.set(g, e); }
    const classOf = (fn) => {
      const file = fn.split(' ').slice(-1)[0].replace(/:\d+$/, '');
      if (legacyFiles.has(file)) return 'legacy';
      const sh = accessorShare.get(fn);
      if (/^(get|set) /.test(fn) && sh && sh[1] > 0 && sh[0] / sh[1] >= 0.9) return 'accessor';
      return 'lane';
    };
    for (const e of fnRows) { e.cls = classOf(e.fn); const sh = accessorShare.get(e.fn); if (sh) e.frozenReaderShare = r2(sh[0] / Math.max(1, sh[1])); }
    const over = fnRows.filter((e) => e.worst > FN_BAR);
    const overLane = over.filter((e) => e.cls === 'lane'), overResidual = over.filter((e) => e.cls !== 'lane');
    const sum = (w, k) => r2(w[k].reduce((a, r) => a + r.gradedKBps, 0));
    // the staging witness: the cast fought through every window (>= 75 % of cast-samples hostile)
    const fought = windows.every((w) => w.castHostile !== null && w.castHostile >= 0.75);
    const pass = errors.length === 0 && overLane.length === 0 && (overResidual.length === 0 || residualRuling) && windows.every((w) => w.frames > 60) && staged.cast >= 6 && fought;
    const fmtW = (w) => ({ name: w.name, secs: w.secs, frames: w.frames, fps: w.fps, castHostile: w.castHostile, allKBps: w.total.measuredKBps, srcCallerKBps: w.srcCaller.gradedKBps, srcSelfKBps: w.srcSelf.gradedKBps,
      mineSumKBps: sum(w, 'mine'), frozenMachineSumKBps: sum(w, 'frozenMachine'),
      mine: w.mine.slice(0, 40).map((r) => `${r.gradedKBps} KB/s (self ${r.selfKBps})  ${r.fn}`), frozenMachine: w.frozenMachine.slice(0, 25).map((r) => `${r.gradedKBps} KB/s  ${r.fn}`),
      topOther: w.topOther.map((r) => `${r.gradedKBps} KB/s  ${r.fn}`), getterCallers: w.getterCallers });
    let deopts;
    if (process.env.R5_IC_TRACEDEOPT) {
      const t0 = windows.length ? windows[0].tS - WARM : 0;
      deopts = { total: deoptLog.length, byWindow: windows.map((w) => {
        const inW = deoptLog.filter((d) => d.t >= w.tS && d.t <= w.tE);
        const by = new Map(); for (const d of inW) { const k = `${d.lazy ? 'lazy' : 'eager'} ${d.fn} — ${d.why}${d.tier ? ' [' + d.tier + ']' : ''}`; by.set(k, (by.get(k) || 0) + 1); }
        return { name: w.name, n: inW.length, top: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => n + '  ' + k) };
      }), warmup: (() => {
        const inW = deoptLog.filter((d) => d.t >= t0 && windows.length && d.t < windows[0].tS);
        const by = new Map(); for (const d of inW) { const k = `${d.lazy ? 'lazy' : 'eager'} ${d.fn} — ${d.why}`; by.set(k, (by.get(k) || 0) + 1); }
        return { n: inW.length, top: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => n + '  ' + k) };
      })(), clusters: (() => {
        // lazy invalidation waves (one prototype or field change marks many functions at once), timed against the windows
        const out = []; let cur = null;
        for (const d of deoptLog) { if (!d.lazy) continue; if (cur && d.t - cur.t1 < 40 && cur.why === d.why) { cur.t1 = d.t; cur.fns.add(d.fn); } else { cur = { t0: d.t, t1: d.t, why: d.why, fns: new Set([d.fn]) }; out.push(cur); } }
        return out.filter((c) => c.t0 >= t0).map((c) => ({ atS: r2((c.t0 - t0) / 1000), why: c.why, n: c.fns.size, fns: [...c.fns].slice(0, 30).join(' ') }));
      })() };
    }
    const parentsAll = new Map();
    for (const w of windows) for (const [k, ps] of w.parents) { const e = parentsAll.get(k) || new Set(); for (const q of ps) e.add(q); parentsAll.set(k, e); }
    const allWorst = new Map();
    for (const w of windows) for (const r of w.allRows) if (!allWorst.has(r.fn) || allWorst.get(r.fn) < r.gradedKBps) allWorst.set(r.fn, r.gradedKBps);
    const raw = { diag, noInline, overLane, overResidual, fnRows, residualRuling, fought, errors, windowsOk: windows.every((w) => w.frames > 60), cast: staged.cast,
      parents: parentsAll, worstOf: new Map(fnRows.map((e) => [e.fn, e.worst])), allWorst };
    return { _raw: raw, pass, detail: {
      verdict: (pass ? 'PASS' : 'FAIL') + `: ${overLane.length} lane frame(s) over ${FN_BAR} KB/s in at least one of ${windows.length} windows` + (overLane.length ? ' — ' + overLane.slice(0, 30).map((o) => `${o.fn} ${o.worst}`).join('; ') : '')
        + ` | residual over the bar (legacy species files, W2 delete; accessors charged by readers this lane may not edit): ${overResidual.length}` + (overResidual.length ? ' — ' + overResidual.map((o) => `[${o.cls}] ${o.fn} ${o.worst}`).join('; ') : '')
        + ` | ruling ic-alloc-residual=carried: ${residualRuling ? 'RECORDED' : 'NOT recorded (the residual fails the gate)'}`
        + ` | lane sum per window (KB/s): ${windows.map((w) => sum(w, 'mine')).join(' / ')} | fps ${windows.map((w) => w.fps).join(' / ')} | cast hostile per window ${windows.map((w) => w.castHostile).join(' / ')}${fought ? '' : ' (STAGING FAILED: the cast did not fight through every window)'}` + (diag ? ' | DIAGNOSIS FLAGS ON (not gradeable)' : ''),
      staged, end, residualRuling, functions: fnRows.slice(0, 60).map((e) => `${e.worst} KB/s worst [${e.perWindow.join(', ')}] self [${e.self.join(', ')}] [${e.cls}${e.frozenReaderShare !== undefined ? ' frozen-reader share ' + e.frozenReaderShare : ''}]  ${e.fn}`),
      deoptTimed, tiers, micro, inGame, protoLog, shapeLog, protoLockLog, protoTrace, deopts, consoleErrors: errors.slice(0, process.env.R5_IC_PROTOLOCK ? 40 : 5),
      inlining: process.env.R5_IC_NOINLINE ? 'OFF (diagnosis run, not gradeable)' : 'default',
      windows: windows.map(fmtW),
      method: `CDP HeapProfiler.startSampling (interval ${INTERVAL} B, minor+major GC objects included); ${WARM / 1000} s warm-up after staging, then ${FIGHT_WINDOWS} x ${WINDOW / 1000} s windows of the staged fight and ${SPRINT_WINDOWS} x ${WINDOW / 1000} s of sprint (after ${SPRINT_WARM / 1000} s); graded per window = max(measured KB/s, KB/frame x 60) on CALLER attribution (nearest src/** frame, gates-perf budgets.mjs alloc.attribution); a function fails if ANY window is over ${FN_BAR} KB/s; graded set = every src frame in a file instruments-core edits (incl. the legacy species files until their W2 deletion)` } };
  } finally {
    await Promise.race([browser.close(), sleep(20000)]).catch(() => {});
    try { browser.process()?.kill('SIGKILL'); } catch { /* gone */ }
    CP.disposeProfile(dir);
  }
}

/* DIAGNOSIS ONLY (R5_IC_DEOPTMARK, fix round 3): the renderer's --trace-deopt lines reach the gate in buffered
 * blocks, so their arrival time says nothing. Every 200 ms the page compiles a fresh uniquely named function
 * (`__icMark<k>`), optimises it and deopts it on a wrong map: its trace line sits IN THE STREAM at page time t_k, so
 * every other deopt line is timed by the markers around it (the stream keeps its order). The same tick samples
 * %GetOptimizationStatus of this lane's hot functions and records every change of tier. */
const DEOPTMARK_ON = `(async () => {
  const C = __CTX__, M = C.machines;
  // the module instance the GAME runs (Vite adds ?t= to a re-served module: a bare import would load a second copy)
  const urlOf = (re) => { const es = performance.getEntriesByType('resource').map(e => e.name).filter(n => re.test(n)); return es.length ? es[es.length - 1].replace(new RegExp('^https?://[^/]+'), '') : null; };
  const mUrl = urlOf(new RegExp('/src/entities/machines/machine[.]js([?]|$)')), pUrl = urlOf(new RegExp('/src/entities/machines/ai/perception[.]js([?]|$)'));
  const MM = await import(mUrl || '/src/entities/machines/machine.js');
  const PP = pUrl ? await import(pUrl) : null;
  const m = M.list.find(x => x.alive && x.kind === M.roles.herd) || M.list[0];
  const fns = { hasLOS: m.ai.perception.hasLOS, updateEyesM: MM.updateEyesM, conformM: MM.conformM, navTowardS: MM.navTowardS, steerAlongS: MM.steerAlongS, turnS: MM.turnS,
    'Machine.update': m.update, _statePatrol: m._statePatrol, _engageFrame: m._engageFrame, animate: m.animate,
    _sight: m.ai.perception._sight, _scan: m.ai.perception._scan, _beliefTick: m.ai.perception._beliefTick, 'perception.update': m.ai.perception.update,
    'lamps.update': M.lamps.update, _writeMatrices: M.lamps._writeMatrices, _stepMachines: M._stepMachines, 'Machines.update': M.update, lampStateFor: MM.lampStateFor };
  // name every function's SharedFunctionInfo in the trace stream: %DebugPrint(Smi -1000 - i) then %DebugPrint(fn)
  const names = Object.keys(fns);
  names.forEach((n, i) => { if (typeof fns[n] === 'function') { %DebugPrint(-1000 - i); %DebugPrint(fns[n]); } });
  const T0 = performance.now();
  const W = window.__icDM = { k: 0, marks: [], tiers: {}, last: {}, T0, fns, names, mUrl, pUrl };
  const tick = () => {
    const k = W.k++;
    const t = (performance.now() - T0) / 1000;
    try {
      const f = (0, eval)('(function __icMark' + k + '(o) { return o.a + 1; })');
      %PrepareFunctionForOptimization(f); f({ a: 1 }); f({ a: 2 }); %OptimizeFunctionOnNextCall(f); f({ a: 3 }); f({ b: 0, a: 1 });
    } catch (e) { /* */ }
    W.marks.push([k, +t.toFixed(3)]);
    for (const [name, fn] of Object.entries(fns)) { if (typeof fn !== 'function') continue; const st = %GetOptimizationStatus(fn);
      // V8 15 (Chrome 151) status bits, measured: 16384 baseline (Sparkplug), +16 Maglev, +32 TurboFan, 131072 lazy
      const tier = (st & 32) ? 'TF' : (st & 16) ? 'MAGLEV' : (st & 16384) ? 'SPARKPLUG' : (st & 131072) ? 'LAZY' : (st & 64) ? 'IGNITION' : 'st' + st;
      if (W.last[name] !== tier) { (W.tiers[name] = W.tiers[name] || []).push([+t.toFixed(2), tier]); W.last[name] = tier; } }
  };
  W.timer = setInterval(tick, 200); tick();
  return true;
})()`;
/* DIAGNOSIS ONLY (R5_IC_DEOPTMARK): after the windows, every live machine and its per-frame records are compared
 * (%HaveSameMap) with a FRESHLY spawned machine of the same kind: a map that differs means a property was added after
 * construction (a map transition mid-session; its map can die with its last holder -> "embedded weak objects
 * cleared"). Reports, per object path, the number of distinct maps among live machines and the keys that differ. */
const SHAPES_REPORT = `(async () => {
  const C = __CTX__, M = C.machines, p = C.player;
  const live = M.list.filter(m => m.alive && !m._disposed);
  const paths = { m: (m) => m, sc: (m) => m.sc, ai: (m) => m.ai, per: (m) => m.ai && m.ai.perception, lamp: (m) => m.lamp, eye0: (m) => m._eyeMats && m._eyeMats[0],
    eyeMat0: (m) => m._eyeMats && m._eyeMats[0] && m._eyeMats[0].mat, emisMat0: (m) => m._emisMats && m._emisMats[0], root: (m) => m.root, eyeColor: (m) => m._eyeColor, eyeCalm: (m) => m._eyeCalm,
    gait: (m) => m.gait, lastKnown: (m) => m.lastKnown, parts0: (m) => m.parts && m.parts[0], reactions: (m) => m.ai && m.ai.reactions, cfg: (m) => m.ai && m.ai.perception && m.ai.perception.cfg };
  const out = { live: live.length, kinds: {} };
  const byKind = new Map(); for (const m of live) { const k = m.kind; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(m); }
  for (const [kind, ms] of byKind) {
    let fresh = null;
    try { fresh = M.spawn(kind, p.position.x + 300, p.position.z + 300); } catch (e) { /* */ }
    const row = { n: ms.length };
    for (const [pn, get] of Object.entries(paths)) {
      const objs = ms.map(get).filter(o => o && typeof o === 'object');
      if (!objs.length) continue;
      const reps = []; for (const o of objs) if (!reps.some(r => %HaveSameMap(r, o))) reps.push(o);
      const f = fresh ? get(fresh) : null;
      const diffs = [];
      if (f && typeof f === 'object') for (const o of reps) if (!%HaveSameMap(o, f)) { const a = Object.keys(f), b = Object.keys(o);
        diffs.push({ added: b.filter(k => !a.includes(k)).slice(0, 12), missing: a.filter(k => !b.includes(k)).slice(0, 12), orderDiff: a.join() !== b.join() && a.length === b.length }); }
      if (reps.length > 1 || diffs.length) row[pn] = { maps: reps.length, vsFresh: diffs.slice(0, 4) };
    }
    out.kinds[kind] = row;
    if (fresh) { try { M.sites.dispose(fresh); } catch (e) { /* */ } }
  }
  return out;
})()`;
const DEOPTMARK_OFF = `(() => { const W = window.__icDM; if (!W) return null; clearInterval(W.timer); const out = { marks: W.marks, tiers: W.tiers, T0: W.T0, names: W.names, mUrl: W.mUrl, pUrl: W.pUrl }; window.__icDM = null; return out; })()`;
const LANE_FN_RE = /^(updateEyesM|conformM|latticeM|navTowardS|steerAlongS|turnS|faceS|moveTowardS|stepRootS|update|_statePatrol|_stateReturn|_stateSuspicious|_stateSearch|_stateAlert|_stateAttack|_engageFrame|animate|_sight|_scan|_beliefTick|_belief|hasLOS|tickCooldowns|_writeMatrices|_stepMachines|_standoffPass|_separationPass|lampStateFor|refreshHot|playerBoxes|_steerAlong|updatePartsM|updateFxM|updateElementalM|tick|pickAttack|_far|_tickFar)$/;
function timeDeopts(log, mk, windows, sfiNames) {
  if (!mk || !mk.marks) return { error: 'no marks', mk };
  const markT = new Map(mk.marks.map(([k, t]) => [k, t]));
  // page time of window starts, relative to the marker clock: windows carry wall-clock tS; the first marker was at
  // T0 (page clock). Map wall clock -> marker clock by the first and last marker's arrival is unreliable, so the
  // windows are placed by their own page-side order: fight 1 starts WARM after staging; markers started at staging.
  let lastT = null; const out = [];
  for (const d of log) {
    const mm = /^__icMark(\d+)$/.exec(d.fn);
    if (mm) { const t = markT.get(+mm[1]); if (t !== undefined) lastT = t; continue; }
    const named = d.sfi && sfiNames && sfiNames.has(d.sfi) ? mk.names[sfiNames.get(d.sfi)] : null;
    if (!named && !LANE_FN_RE.test(d.fn)) continue;
    out.push({ afterMarkS: lastT, fn: named ? '*' + named : d.fn, why: d.why, lazy: d.lazy, kind: d.kind || (d.lazy ? 'mark-lazy' : ''), off: d.off, tier: d.tier });
  }
  return { sfiNamed: sfiNames ? sfiNames.size : 0, moduleUrls: [mk.mUrl, mk.pUrl], marks: mk.marks.length, firstMark: mk.marks[0], lastMark: mk.marks[mk.marks.length - 1], tiers: mk.tiers,
    windowsOnMarkerClock: windows.map((w) => `${w.name}: ${((w.pS - mk.T0) / 1000).toFixed(1)}-${((w.pE - mk.T0) / 1000).toFixed(1)} s`),
    laneDeopts: out.map((x) => `${x.afterMarkS === null ? '<first mark' : x.afterMarkS.toFixed(1) + ' s'}  ${x.lazy ? 'LAZY' : (x.kind || 'eager')}  ${x.fn}  — ${x.why}${x.off ? ' @bc ' + x.off : ''}${x.tier ? ' [' + x.tier + ']' : ''}`).slice(0, 600) };
}

const PROTO_COLLECT = `
  const C = __CTX__; const protos = new Map(); const seen = new Set(); let n = 0;
  const nameOf = (p) => { try { return (Object.prototype.hasOwnProperty.call(p, 'constructor') && typeof p.constructor === 'function' && p.constructor.name) ? p.constructor.name + '.prototype' : (typeof p === 'function' ? 'ctor ' + (p.name || '?') : '?'); } catch (e) { return '?'; } };
  const addP = (p) => { if (p && !protos.has(p)) protos.set(p, nameOf(p)); };
  const addChain = (o) => { let p = Object.getPrototypeOf(o), d = 0; while (p && d < 10) { addP(p); if (Object.prototype.hasOwnProperty.call(p, 'constructor') && typeof p.constructor === 'function') addP(p.constructor); p = Object.getPrototypeOf(p); d++; } };
  const walk = (o, depth) => { if (!o || (typeof o !== 'object' && typeof o !== 'function') || seen.has(o) || n > 60000) return; seen.add(o); n++; addChain(o);
    if (depth >= 3) return; let keys; try { keys = Object.keys(o); } catch (e) { return; } if (keys.length > 400) keys = keys.slice(0, 400);
    for (const k of keys) { let v; try { const d = Object.getOwnPropertyDescriptor(o, k); v = d && 'value' in d ? d.value : undefined; } catch (e) { continue; } if (v && (typeof v === 'object' || typeof v === 'function') && !ArrayBuffer.isView(v)) walk(v, depth + 1); } };
  walk(C, 0); for (const m of C.machines.list) walk(m, 1);
  for (const B of [Object, Function, Array, Map, Set, WeakMap, Promise, Error, Number, String, Boolean, Symbol, RegExp, Date, ArrayBuffer, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int32Array]) { addP(B.prototype); }
  addP(Object.getPrototypeOf(Float32Array.prototype)); addP(Object.getPrototypeOf([][Symbol.iterator]())); addP(Object.getPrototypeOf(new Map()[Symbol.iterator]())); addP(Object.getPrototypeOf(new Set()[Symbol.iterator]()));
`;
/* DIAGNOSIS ONLY (R5_IC_PROTOWATCH): every 100 ms, diff the own keys and value identities of every object a
 * machine's code reaches through a PROTOTYPE chain (the root ctx behind each machine's ctx view, the event bus,
 * every class prototype and constructor on a machine's / its AI's / its perception's chain, Object.prototype ...),
 * and log what changed and when: a change to a prototype object invalidates every optimised function whose loads
 * depend on that chain ("dependent prototype chain changed"). */
const PROTOWATCH_ON = `(() => {
  ${PROTO_COLLECT}
  for (const B of [C, C.events]) protos.set(B, B === C ? 'ctx(root)' : 'ctx.events');
  const ids = new WeakMap(); let nid = 1;
  const idOf = (v) => (v !== null && (typeof v === 'object' || typeof v === 'function')) ? (ids.get(v) || (ids.set(v, nid++), ids.get(v))) : (typeof v === 'number' ? 'n:' + v : typeof v === 'string' ? 's:' + v.slice(0, 20) : typeof v);
  const W = window.__icProto = { objs: [], log: [], t0: Date.now() };
  const snap = (o) => { const out = new Map(); for (const k of Reflect.ownKeys(o)) { const d = Reflect.getOwnPropertyDescriptor(o, k); out.set(String(k), d ? ('value' in d ? idOf(d.value) + (d.writable ? '' : ':ro') : 'acc') : '?'); } out.set('#ext', Object.isExtensible(o) ? 'y' : 'n'); return out; };
  for (const [o, name] of protos) W.objs.push({ name, o, s: snap(o) });
  W.timer = setInterval(() => {
    for (const e of W.objs) {
      const s = snap(e.o);
      for (const [k, v] of s) { const was = e.s.get(k); if (was === undefined) W.log.push([Date.now() - W.t0, e.name, '+' + k, v]); else if (was !== v) W.log.push([Date.now() - W.t0, e.name, '~' + k, was + '->' + v]); }
      for (const k of e.s.keys()) if (!s.has(k)) W.log.push([Date.now() - W.t0, e.name, '-' + k, '']);
      e.s = s;
      if (W.log.length > 4000) break;
    }
  }, 100);
  return { watched: W.objs.length };
})()`;
/* DIAGNOSIS ONLY (R5_IC_PROTOLOCK): 20 s into the warm-up, every prototype object (and constructor) on the chain of
 * every object reachable from the root ctx (depth 3) — plus Object / Function / Array prototypes — is made
 * NON-EXTENSIBLE, and Object.defineProperty / defineProperties / setPrototypeOf / Reflect.* / Object.assign are
 * wrapped: any later attempt to add a property to a prototype throws (strict code) or is logged with its stack.
 * That names the code that keeps invalidating prototype chains. Breaks that code: never in a graded run. */
/**
 * THE PAIRED ATTRIBUTION RUN (W0b fix round 2). The sampling heap profiler charges a byte to the PHYSICAL frame:
 * when V8 inlines a frozen function (engage.pursue, rig/lod.js updateRigLOD, gait) into a lane function, the
 * frozen code's allocation is reported as the lane function's. When the graded run leaves lane frames over the
 * bar, the gate runs the same staging, warm-up and six windows again with inlining OFF (TurboFan and Maglev) and
 * re-classes a lane frame F as `inlined-frozen` ONLY if, in that run,
 *   - F's own bytes are <= the bar in every window,
 *   - every lane function F calls directly (from the profile tree) is <= the bar in every window, and
 *   - the code outside this lane that F calls directly allocates at least F's graded excess over the bar
 *     (so a one-window spike that simply did not recur in the second run is NOT re-classed: it has to be
 *     carried by frozen callees that are measured doing the allocating),
 * so the excess the graded run charged to F can only have come from code this lane does not own. Everything
 * else stays a lane failure. `inlined-frozen` joins the residual: it passes only under the plan ruling
 * `<!-- r5-ruling ic-alloc-residual=carried -->`, exactly like the legacy and accessor classes.
 */
async function allocMachinesPaired(ctx) {
  const FN_BAR = 4;
  const g = await allocMachines(ctx);
  const R = g._raw; delete g._raw;
  if (!R || R.diag || g.pass === null || !R.overLane.length) return g;
  const a = await allocMachines(ctx, { noInline: true });
  const A = a._raw; delete a._raw;
  if (!A) { g.detail.pairedRun = 'the attribution run did not complete: ' + JSON.stringify(a.detail).slice(0, 300); return g; }
  const legacyOrResidual = new Set(A.overResidual.map((e) => e.fn));
  const laneWorst = (fn) => { const w = A.worstOf.get(fn); return w === undefined ? 0 : w; };
  const isLaneFn = (fn) => { const e = A.fnRows.find((x) => x.fn === fn); return !!e && e.cls === 'lane'; };
  const evidence = [];
  for (const F of R.overLane) {
    const own = laneWorst(F.fn);
    const callees = [...A.parents.entries()].filter(([, ps]) => ps.has(F.fn)).map(([c]) => c);
    const laneCallees = callees.filter((c) => isLaneFn(c));
    const badCallees = laneCallees.filter((c) => laneWorst(c) > FN_BAR);
    const others = callees.filter((c) => !isLaneFn(c) && !legacyOrResidual.has(c));
    const otherCallees = others.map((c) => `${c} ${A.allWorst.get(c) ?? 0} KB/s`).slice(0, 8);
    const otherBytes = others.reduce((sum, c) => sum + (A.allWorst.get(c) ?? 0), 0);
    const ok = own <= FN_BAR && badCallees.length === 0 && otherBytes >= F.worst - FN_BAR;
    if (ok) F.cls = 'inlined-frozen';
    evidence.push(`${ok ? 'INLINED-FROZEN' : 'LANE'}: ${F.fn} graded ${F.worst} KB/s; with inlining off its own bytes ${own} KB/s, lane callees over the bar ${badCallees.length ? badCallees.map((c) => c + ' ' + laneWorst(c)).join(', ') : 'none'}; callees outside this lane ${Math.round(otherBytes * 100) / 100} KB/s in all (needs >= ${Math.round((F.worst - FN_BAR) * 100) / 100}): ${otherCallees.join(', ') || 'none recorded'}`);
  }
  const overLane = R.overLane.filter((e) => e.cls === 'lane');
  const residual = [...R.overResidual, ...R.overLane.filter((e) => e.cls === 'inlined-frozen')];
  const pass = R.errors.length === 0 && overLane.length === 0 && (residual.length === 0 || R.residualRuling) && R.windowsOk && R.cast >= 6 && R.fought;
  const d = g.detail;
  d.verdict = (pass ? 'PASS' : 'FAIL') + `: ${overLane.length} lane frame(s) over ${FN_BAR} KB/s after the paired attribution run` + (overLane.length ? ' — ' + overLane.map((o) => `${o.fn} ${o.worst}`).join('; ') : '')
    + ` | residual over the bar: ${residual.length} — ` + residual.map((o) => `[${o.cls}] ${o.fn} ${o.worst}`).join('; ')
    + ` | ruling ic-alloc-residual=carried: ${R.residualRuling ? 'RECORDED' : 'NOT recorded (the residual fails the gate)'} || graded run: ` + d.verdict;
  d.pairedRun = { method: 'the same staging, 30 s warm-up and six 10 s windows with --no-turbo-inlining --max-inlined-bytecode-size=0 --no-maglev-inlining', evidence,
    noInlineVerdict: a.detail && a.detail.verdict, noInlineFunctions: a.detail && a.detail.functions && a.detail.functions.slice(0, 40) };
  return { pass, detail: d };
}

/* DIAGNOSIS ONLY (R5_IC_SHAPEWATCH): the INSTANCES other systems' code treats as fixed (every object reachable from the
 * root ctx to depth 2 — the engine, terrain, nav, player, environment, collision ... — plus Math and the HOT record)
 * are fingerprinted every 200 ms by own keys and the representation class of each value (smi / double / null /
 * object / function / ...): a key added or removed, or a value changing class, is a MAP TRANSITION of that object,
 * which deoptimises every function that relied on its map ("dependent prototype chain changed" for constants,
 * "wrong map" for checks). Logged with the object's path and the time since the warm-up began. */
const SHAPEWATCH_ON = `(async () => {
  const C = __CTX__; const objs = []; const seen = new Set();
  const cls = (v) => v === null ? 'null' : typeof v === 'number' ? (Number.isInteger(v) && Math.abs(v) < 1073741824 ? 'smi' : 'dbl') : typeof v;
  const fp = (o) => { const m = new Map(); let keys; try { keys = Object.keys(o); } catch (e) { return m; } for (const k of keys) { let d; try { d = Object.getOwnPropertyDescriptor(o, k); } catch (e) { continue; } m.set(k, d && 'value' in d ? cls(d.value) : 'acc'); } return m; };
  const add = (path, o, depth) => { if (!o || typeof o !== 'object' || seen.has(o) || objs.length > 4000 || Array.isArray(o) || ArrayBuffer.isView(o) || o instanceof Map || o instanceof Set || o instanceof Node) return; seen.add(o); objs.push({ path, o, f: fp(o) });
    if (depth >= 2) return; for (const k of Object.keys(o)) { let v; try { const d = Object.getOwnPropertyDescriptor(o, k); v = d && 'value' in d ? d.value : null; } catch (e) { continue; } if (v && typeof v === 'object') add(path + '.' + k, v, depth + 1); } };
  add('ctx', C, 0);
  add('Math', Math, 2);
  const H = (await import('/src/instruments/lib/hot.js')).HOT; add('HOT', H, 2);
  const W = window.__icShape = { log: [], t0: Date.now(), n: objs.length };
  W.timer = setInterval(() => {
    for (const e of objs) {
      const f = fp(e.o);
      for (const [k, v] of f) { const was = e.f.get(k); if (was === undefined) W.log.push([Date.now() - W.t0, e.path, '+' + k, v]); else if (was !== v && !(was === 'smi' && v === 'smi')) W.log.push([Date.now() - W.t0, e.path, '~' + k, was + '->' + v]); }
      for (const k of e.f.keys()) if (!f.has(k)) W.log.push([Date.now() - W.t0, e.path, '-' + k, '']);
      e.f = f;
      if (W.log.length > 6000) break;
    }
  }, 200);
  return { watched: objs.length };
})()`;
const SHAPEWATCH_OFF = `(() => { const W = window.__icShape; if (!W) return null; clearInterval(W.timer);
  const by = new Map(); for (const [t, p, k, v] of W.log) { const key = p + ' ' + k + ' ' + v; const e = by.get(key) || { n: 0, first: t, last: t }; e.n++; e.last = t; by.set(key, e); }
  const out = { watched: W.n, changes: W.log.length, byKey: [...by.entries()].sort((a, b) => a[1].first - b[1].first).slice(0, 150).map(([k, e]) => (e.first / 1000).toFixed(1) + 's' + (e.n > 1 ? ' (' + e.n + 'x, last ' + (e.last / 1000).toFixed(1) + 's)' : '') + ' ' + k) };
  window.__icShape = null; return out; })()`;
/* DIAGNOSIS ONLY (R5_IC_PROTOTRACE, with --trace-prototype-users): every 1.5 s, %DebugPrint each candidate prototype
 * after a Smi marker with its index, so node can map the "Invalidating prototype map 0x..." lines to the object
 * whose map that was (the most recent snapshot before the invalidation). */
const PROTOTRACE_ON = `(() => {
  ${PROTO_COLLECT}
  protos.set(C, 'ctx(root)'); protos.set(C.events, 'ctx.events');
  const P = [...protos.keys()], labels = P.map((p) => protos.get(p));
  const snap = () => { %DebugPrint(-1); for (let i = 0; i < P.length; i++) { %DebugPrint(i); %DebugPrint(P[i]); } %DebugPrint(-2); };
  snap(); window.__icPTtimer = setInterval(snap, 1500);
  return { labels };
})()`;
const PROTOLOCK_ON = `(() => {
  ${PROTO_COLLECT}
  const hits = window.__icLockHits = [];
  const note = (what, t, k) => { if (hits.length < 60) hits.push({ t: Date.now(), what, target: protos.get(t) || '?', key: String(k), stack: String(new Error().stack).split('\\n').slice(2, 9).join(' | ') }); };
  const wrap = (obj, name) => { const f = obj[name]; obj[name] = function (...a) { if (protos.has(a[0])) note(name, a[0], a[1]); return f.apply(this, a); }; };
  wrap(Object, 'defineProperty'); wrap(Object, 'defineProperties'); wrap(Object, 'setPrototypeOf'); wrap(Reflect, 'defineProperty'); wrap(Reflect, 'setPrototypeOf'); wrap(Object, 'assign');
  let locked = 0; for (const p of protos.keys()) { if (p === Object || p === Function || p === Reflect) continue; try { Object.preventExtensions(p); locked++; } catch (e) { } }
  return { locked, walked: n };
})()`;
const PROTOWATCH_OFF = `(() => { const W = window.__icProto; if (!W) return null; clearInterval(W.timer);
  const by = new Map(); for (const [t, n, k, v] of W.log) { const key = n + ' ' + k; const e = by.get(key) || { n: 0, first: t, last: t, v }; e.n++; e.last = t; e.v = v; by.set(key, e); }
  const out = { watched: W.objs.length, changes: W.log.length, byKey: [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 80).map(([k, e]) => e.n + 'x ' + k + ' (' + (e.first / 1000).toFixed(1) + '-' + (e.last / 1000).toFixed(1) + ' s) ' + String(e.v).slice(0, 60)) };
  window.__icProto = null; return out; })()`;

const W0B_GATES = [
  {
    id: 'A-alloc-machines', kind: 'runner', lane: 'instruments-core-alloc', timeout: 900000,
    title: "The memory rule on this lane's frames: gates-perf's A-alloc-rate method (sampling heap profiler, CALLER attribution, graded max(KB/s, KB/frame x 60)) on a herd-role staged fight + sprint, 30 s warm-up, six 10 s windows each graded; every src frame in a file instruments-core edits <= 4 KB/s in every window; frozen machine files and the rest of src/** reported with their owner",
    check: (ctx) => allocMachinesPaired(ctx),
  },
  {
    /* FIX ROUND 3 (judge instruments-core/W0b/fix-round-2: "publish-on-change accessors return a stale 0 when the
     * first read sees a value of exactly 0.5"). Every name in MACHINE_SCALARS is written through its setter and read
     * back through its getter: (a) the FIRST read on a fresh scalar record, for each of 0.5, 0, -1, 1e-7, 99 (one fresh
     * record per name per value, so no earlier read can hide a stale seed); (b) on a freshly spawned herd-role
     * machine, the same values in sequence. NEGATIVE CONTROL: the round-2 seed (box 0, sentinel 0.5) built by hand
     * must make the same probe fail, so the probe can see the bug it guards against. */
    id: 'A-published-scalars', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
    title: 'Every MACHINE_SCALARS name round-trips setter -> getter: the first read of a fresh record and a fresh herd-role machine return exactly 0.5, 0, -1, 1e-7 and 99; the round-2 seed (box 0, sentinel 0.5) fails the same probe (negative control)',
    assert: `(async () => {
      ${WAIT_BOOT}
      const MM = await import('/src/entities/machines/machine.js');
      const NAMES = MM.MACHINE_SCALARS, P = MM.Machine.prototype, VALS = [0.5, 0, -1, 1e-7, 99];
      const missing = NAMES.filter(n => { const d = Object.getOwnPropertyDescriptor(P, n); return !d || typeof d.get !== 'function' || typeof d.set !== 'function'; });
      const firstRead = [];
      for (const n of NAMES) { const d = Object.getOwnPropertyDescriptor(P, n); if (!d) continue;
        for (const v of VALS) { const host = { sc: new MM.MachineScalars() }; d.set.call(host, v); const got = d.get.call(host); if (!Object.is(got, v)) firstRead.push(n + ' wrote ' + v + ' read ' + got); } }
      const p = __CTX__.player, KIND = M.roles && M.roles.herd;
      let onMachine = null;
      if (KIND) {
        const m = M.spawn(KIND, p.position.x + 40, p.position.z + 40);
        if (m) { const bad = [];
          for (const n of NAMES) for (const v of [...VALS, 0.5]) { m[n] = v; const got = m[n]; if (!Object.is(got, v)) bad.push(n + ' wrote ' + v + ' read ' + got); }
          onMachine = { kind: m.kind, bad }; M.sites.dispose(m); }
      }
      // negative control: the round-2 seed by hand (box 0, sentinel 0.5) -> the first 0.5 read must come back 0
      const ctl = [];
      for (const n of NAMES) { const d = Object.getOwnPropertyDescriptor(P, n); if (!d) continue; const sc = new MM.MachineScalars(); sc['_pb' + n] = 0; sc['_pv' + n] = 0.5; const host = { sc }; d.set.call(host, 0.5); if (d.get.call(host) !== 0.5) ctl.push(n); }
      const pass = NAMES.length === 30 && missing.length === 0 && firstRead.length === 0 && !!onMachine && onMachine.bad.length === 0 && ctl.length === NAMES.length;
      return { pass, detail: { names: NAMES.length, missingAccessor: missing, firstReadWrong: firstRead.slice(0, 40), firstReadChecks: NAMES.length * VALS.length,
        onMachine: onMachine ? { kind: onMachine.kind, wrong: onMachine.bad.slice(0, 40), checks: NAMES.length * (VALS.length + 1) } : 'no herd-role machine spawned',
        negativeControl: ctl.length + ' / ' + NAMES.length + ' names caught with the round-2 seed (box 0, sentinel 0.5)' } };
    })()`,
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
      // W0b fix round 2: a row whose every clause passes except one that waits on ANOTHER lane's API reports
      // PENDING naming that lane (A-weak40's calima clause: world-sky W1). It is not green, so this gate is then
      // PENDING too — never PASS — and it names the row and the owner.
      const pendingCrossLane = (x) => x.status === 'PENDING' && /awaits world-sky W1/.test(JSON.stringify(x.detail || ''));
      const bad = res.filter((x) => !(x.status === 'PASS' || skipFixture(x) || judged(x) || pendingCrossLane(x)));
      const pending = res.filter(pendingCrossLane);
      const green = shape.exportsFunction && shape.exportsEmptyGates && shape.everySection9Row.length === 0 && shape.parameterisedByKind
        && shape.laneHonoured && res.length === rows.length && bad.length === 0 && res.filter((x) => x.status === 'PASS').length >= 15
        && a41c.length === 5 && a41c.every((v) => v === 'PASS');
      const pass = !green ? false : pending.length ? null : true;
      return { pass, detail: { verdict: !green ? 'FAIL' : pending.length ? 'PENDING — every other row green; cross-lane clause(s) pending: ' + pending.map((x) => x.id).join(', ') + ' (calima: world-sky W1)' : 'PASS',
        pendingCrossLane: pending.map((x) => x.id), shape, a41cFiveRuns: a41c, rows: res.map((x) => ({ id: x.id, status: x.status, ms: x.ms,
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
