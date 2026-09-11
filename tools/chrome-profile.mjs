/**
 * Owned, sweepable headless-Chrome user-data directories.
 *
 * WHY THIS FILE EXISTS. Puppeteer creates `$TMPDIR/puppeteer_dev_chrome_profile-*`
 * for every `puppeteer.launch()` and only deletes it inside a clean
 * `browser.close()`. Neither of this repo's harnesses can promise a clean close:
 * `tools/gates.mjs` relaunches the browser on every GPU loss (sixteen lanes share
 * one GPU), SIGKILLs a wedged one on the way out, and dies with the shell when a
 * lane is interrupted. Every one of those paths abandoned a ~70 MB profile. Dozens
 * accumulated and filled the disk mid-round, which then failed gates for "no space
 * left on device" — a runner bug wearing a build bug's clothes.
 *
 * THE FIX, three parts, all here so both harnesses get them:
 *   1. `profileDir()` hands out an EXPLICIT userDataDir under one known root,
 *      named `hzc-<pid>-<port>-<n>` so a leftover can always be traced to the
 *      process that made it.
 *   2. `disposeProfile()` / `installProfileCleanup()` remove it in a finally and
 *      again from `exit`/SIGINT/SIGTERM/uncaught handlers — the paths puppeteer
 *      itself does not cover.
 *   3. `sweepProfiles()` runs at startup and reaps ANY stale profile — ours and
 *      puppeteer's own — so a leak from a killed run is cleaned by the next run
 *      rather than living until the disk fills.
 *
 * THE SWEEP IS NOT ALLOWED TO SHOOT A LIVE RUN. Seven lanes may be running their
 * suites right now and a long suite's profile is easily older than the age cut, so
 * age alone is not enough evidence. A directory is only removed when BOTH hold:
 * it is older than `maxAgeMs`, and nothing is using it — Chrome keeps a
 * `SingletonLock` symlink pointing at `<host>-<pid>`, and our own names carry the
 * owning pid, so "in use" is a `kill(pid, 0)` probe, not a guess.
 *
 * FIX ROUND 2 — THE ORPHAN CASE, which the rule above leaked forever. When the
 * box SIGKILLs a lane at load 45, node dies and its headless Chrome does NOT: it
 * reparents to pid 1 and goes on holding the `SingletonLock` on our directory. So
 * the dir's owner pid is dead (nobody will ever dispose it) while the lock names a
 * LIVE pid (`keptInUse`, forever) — 5 such trees pinned 691 MB on this box with
 * 8.4 GB free, several renderers burning CPU, and the sweep printed nothing.
 *
 * The two roots therefore get DIFFERENT rules, because we know different things
 * about them:
 *   • `puppeteer_dev_chrome_profile-*` — owner unknowable. Conservative rule
 *     unchanged: a live SingletonLock always wins, we never kill.
 *   • `hzc-<pid>-<port>-<n>` — OURS. The name proves which process launched it,
 *     `disposeProfile()` bins it at every relaunch, so once that pid is dead and
 *     the dir is older than `maxAgeMs` any Chrome still on it is orphaned by
 *     construction. (A second forever-keep hides in the same rule: once the
 *     kernel recycles that dead owner's pid onto a stranger, "owner alive"
 *     protects the directory for good. It is reaped only on four agreeing
 *     signals — see the recycled-owner branch.) We prove identity from the
 *     process table — the holder's
 *     command line must carry `--user-data-dir=<this exact dir>` (pid reuse
 *     cannot forge that) and the Chrome-for-Testing binary, and its parent must
 *     be gone — then SIGKILL it and reap the directory, reported as
 *     `reapedOrphans` so it is visible rather than silent. Anything we cannot
 *     prove orphaned (a foreign process on the dir, a live parent, no process
 *     table at all) falls back to the conservative keep.
 */
import { mkdirSync, rmSync, readdirSync, statSync, readlinkSync, realpathSync } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

/** One root we own, so a sweep never has to guess what is ours. */
export const PROFILE_ROOT = process.env.HZC_CHROME_PROFILE_ROOT
  || path.join(os.tmpdir(), 'hzc-chrome-profiles');

/** `hzc-<pid>-<port>-<n>` — the pid is the liveness evidence for the sweep. */
const OURS = /^hzc-(\d+)-\d+-\d+$/;
/** Profiles puppeteer made for itself before/beside us; still ours to reap. */
const PUPPETEER = /^puppeteer_dev_chrome_profile-/;

const DAY = 86400000;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (err) { return err.code === 'EPERM'; }   // alive, just not ours to signal
}

/**
 * Chrome writes `SingletonLock` as a symlink to `<hostname>-<pid>` while a
 * browser holds the profile. Reading the LINK (not its target file, which does
 * not exist) is the cheapest honest "is this in use" probe available.
 */
function lockPid(dir) {
  try {
    const target = readlinkSync(path.join(dir, 'SingletonLock'));
    const m = /-(\d+)$/.exec(String(target));
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;   // no lock (or not a symlink) == not held
  }
}

function lockedByLivePid(dir) {
  const pid = lockPid(dir);
  return pid === null ? false : pidAlive(pid);
}

/**
 * The binary a puppeteer-launched browser runs from. A holder whose command does
 * not contain this is NOT ours to kill however old the directory is — that is the
 * pid-reuse guard: a recycled pid belonging to some unrelated program can hold a
 * stale lock, but it cannot be running Chrome for Testing against our dir.
 */
const CHROME_MARKER = 'Chrome for Testing';

/**
 * The scripts that hand themselves profiles. Used for ONE question: the owner
 * pid encoded in a directory name is alive — is it still the process that made
 * the directory, or a recycled pid? macOS wraps pids at ~99998 and a long round
 * churns thousands, so "owner alive" eventually becomes true for a stranger, and
 * the directory it names is then kept forever by a rule meant to protect a
 * running lane. Same forever-leak as the orphan case, reached by a different
 * road. Anything not on this list is only ever reaped with corroborating
 * evidence (see the recycled-owner branch in `sweepProfiles`).
 */
const HARNESS_MARKERS = ['gates.mjs', 'screenshot.mjs', 'chrome-profile-selftest'];

/** Is `pid`'s command line one of our harnesses? `null` = cannot tell (keep). */
function ownerIsHarness(procs, pid) {
  const p = procs.find((q) => q.pid === pid);
  if (!p) return null;                       // alive but not in our snapshot: unknown
  return HARNESS_MARKERS.some((m) => p.cmd.includes(m));
}

/** Synchronous sleep with no dependency — used only to wait out a SIGKILL. */
const SLEEP_WORD = new Int32Array(new SharedArrayBuffer(4));
const sleepSync = (ms) => { try { Atomics.wait(SLEEP_WORD, 0, 0, ms); } catch { /* no SAB */ } };

/**
 * One `ps` snapshot: `[{pid, ppid, cmd}]`, or null when the process table cannot
 * be read. Null is meaningful — it forces every caller back to the conservative
 * keep-on-lock rule instead of guessing.
 */
function processSnapshot() {
  try {
    const r = spawnSync('ps', ['-axww', '-o', 'pid=,ppid=,command='], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 10000,
    });
    if (r.status !== 0 || !r.stdout) return null;
    const procs = [];
    for (const line of r.stdout.split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (m) procs.push({ pid: +m[1], ppid: +m[2], cmd: m[3] });
    }
    return procs.length ? procs : null;
  } catch { return null; }
}

/**
 * Does this command line run Chrome against exactly `dir`? Substring alone would
 * make `hzc-1-2-3` match `hzc-1-2-30`, so the flag must end at a boundary.
 */
function cmdUsesDir(cmd, dir) {
  const flag = `--user-data-dir=${dir}`;
  for (let i = cmd.indexOf(flag); i !== -1; i = cmd.indexOf(flag, i + 1)) {
    let end = i + flag.length;
    if (cmd[end] === '/') end++;                       // trailing slash, same dir
    const next = cmd[end];
    if (next === undefined || next === ' ' || next === '"' || next === "'") return true;
  }
  return false;
}

/**
 * Classify who, if anyone, is using `dir`:
 *   `none`     nothing in the table holds it — safe to remove on the age rule.
 *   `orphan`   Chrome holds it and its parent is gone: kill list in `.pids`.
 *   `managed`  a live parent still owns that Chrome — a running suite. KEEP.
 *   `foreign`  a holder we cannot identify as our Chrome. KEEP.
 * Only ever called for OUR directory naming, whose owner pid is already dead.
 */
function holderState(procs, dir) {
  // macOS hands the same directory out as both `/var/folders/...` and
  // `/private/var/folders/...` depending on who resolved it; a holder launched
  // through the other spelling is the same orphan and must still be found.
  const names = new Set([dir]);
  try { names.add(realpathSync(dir)); } catch { /* already gone */ }
  const holders = procs.filter((p) => p.pid !== process.pid && pidAlive(p.pid)
    && [...names].some((n) => cmdUsesDir(p.cmd, n)));
  if (!holders.length) return { kind: 'none', pids: [] };
  const alien = holders.find((p) => !p.cmd.includes(CHROME_MARKER));
  if (alien) {
    return { kind: 'foreign', pids: [], why: `pid ${alien.pid} holds the profile and is not ${CHROME_MARKER}` };
  }
  // Renderers/GPU helpers carry `--type=`; the browser main does not. Judge by
  // the main when there is one — when the main is already dead and only helpers
  // remain, judge by those.
  const mains = holders.filter((p) => !/--type=/.test(p.cmd));
  const judged = mains.length ? mains : holders;
  const managed = judged.find((p) => p.ppid !== 1 && pidAlive(p.ppid));
  if (managed) {
    return { kind: 'managed', pids: [], why: `pid ${managed.pid} still has a live parent (${managed.ppid})` };
  }
  // Helpers first, main last: killing the main first makes the helpers vanish
  // mid-scan and turns the "did the kill take" check into a race.
  const pids = [...holders.filter((p) => /--type=/.test(p.cmd)), ...mains].map((p) => p.pid);
  return { kind: 'orphan', pids };
}

/** SIGKILL a proven-orphan Chrome tree. Returns true once every pid is gone. */
function killPids(pids) {
  for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
  for (let waited = 0; waited < 2000; waited += 100) {
    if (!pids.some(pidAlive)) return true;
    sleepSync(100);
  }
  return !pids.some(pidAlive);
}

function dirSizeMB(dir) {
  let bytes = 0;
  const walk = (d, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else { try { bytes += statSync(p).size; } catch { /* raced */ } }
    }
  };
  walk(dir, 0);
  return bytes / 1048576;
}

/**
 * Reap stale Chrome profiles. Returns
 * `{ removed, reapedOrphans, killedPids, keptInUse, keptYoung, freedMB, scanned, dirs, kept }`.
 * Never throws: a sweep failure must not stop a gate run.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.maxAgeMs=600000]  only consider profiles older than this
 * @param {boolean} [opts.measure=false]    size the directories before removing
 *                                          (a couple of hundred ms per profile —
 *                                          worth it when verifying, off by default)
 * @param {boolean} [opts.killOrphans=true] kill a Chrome proven orphaned on one of
 *                                          OUR directories. Off = the old rule.
 */
export function sweepProfiles({ maxAgeMs = 10 * 60 * 1000, measure = false, killOrphans = true } = {}) {
  const out = {
    removed: 0, reapedOrphans: 0, reapedRecycledOwner: 0, killedPids: [],
    keptInUse: 0, keptYoung: 0, freedMB: 0, scanned: 0, dirs: [], kept: [],
  };
  const now = Date.now();

  // The process table is read at most once per sweep, and only if a directory
  // actually needs it. `null` (unreadable) keeps every decision conservative.
  let procs;
  const table = () => (procs === undefined ? (procs = killOrphans ? processSnapshot() : null) : procs);

  const reap = (full, name) => {
    const mb = measure ? dirSizeMB(full) : 0;
    try {
      rmSync(full, { recursive: true, force: true, maxRetries: 2 });
      out.removed++; out.freedMB += mb; out.dirs.push(name);
      return true;
    } catch { return false; }   // held open by something we cannot see — next run gets it
  };

  // --- OUR root: name carries the owner, so an orphan is provable ------------
  let ours = [];
  try { ours = readdirSync(PROFILE_ROOT, { withFileTypes: true }); } catch { ours = []; }
  for (const e of ours) {
    if (!e.isDirectory()) continue;
    const m = OURS.exec(e.name);
    if (!m) continue;
    out.scanned++;
    const full = path.join(PROFILE_ROOT, e.name);
    const procTable = table();

    /**
     * The owner is still running: this is a live suite's profile, full stop —
     * checked FIRST so no later branch can touch a running lane.
     *
     * The one exception is a pid the kernel handed to somebody ELSE after our
     * owner died. That directory is unreclaimable by exactly the mechanism the
     * orphan case was: a rule written to protect live lanes keeps it forever.
     * Reaping it needs FOUR independent agreements, because getting this wrong
     * deletes a running lane's profile:
     *   1. the process table is readable and says this pid is NOT one of our
     *      harnesses (an unreadable table, or a pid we cannot see, keeps);
     *   2. nothing at all holds the directory — no Chrome, no anything, so no
     *      live run can be mid-flight on it;
     *   3. no SingletonLock naming a live pid;
     *   4. it is older than the age cut, which covers the seconds between
     *      `profileDir()` and `puppeteer.launch()`.
     * Any one of those unmet keeps the directory, which costs 70 MB once.
     */
    if (pidAlive(parseInt(m[1], 10))) {
      const harness = procTable ? ownerIsHarness(procTable, parseInt(m[1], 10)) : null;
      if (harness !== false) { out.keptInUse++; continue; }        // ours, or unknown
      const held = holderState(procTable, full);
      /**
       * Both failures at once — the owner's pid recycled onto a stranger AND a
       * parentless Chrome still on the directory — is the compound case, and it
       * is the *most* derelict state a profile can reach. The evidence is
       * identical to the plain orphan path (our naming, a holder with no parent,
       * proven from its command line), so it takes the identical action rather
       * than being kept forever for having failed twice.
       */
      if (held.kind === 'orphan') {
        if (!killPids(held.pids)) {
          out.keptInUse++; out.kept.push(`${e.name}: recycled owner, orphan tree, SIGKILL did not take`);
        } else if (reap(full, e.name)) {
          out.reapedOrphans++; out.killedPids.push(...held.pids);
        } else {
          // Tree is down; only the removal failed. Next sweep sees no holder at
          // all and takes the plain age path — say which half failed, not both.
          out.kept.push(`${e.name}: orphan tree killed, directory removal failed`);
        }
        continue;
      }
      if (held.kind !== 'none') {
        out.keptInUse++; out.kept.push(`${e.name}: owner pid recycled but ${held.why || 'a process holds it'}`);
        continue;
      }
      if (lockedByLivePid(full)) { out.keptInUse++; out.kept.push(`${e.name}: owner pid recycled, still locked`); continue; }
      let recycledAge;
      try { recycledAge = now - statSync(full).mtimeMs; } catch { continue; }
      if (!(recycledAge > maxAgeMs) || recycledAge > 30 * DAY) { out.keptYoung++; continue; }
      if (reap(full, e.name)) out.reapedRecycledOwner++;
      continue;
    }

    const st = procTable ? holderState(procTable, full) : null;
    if (st && (st.kind === 'managed' || st.kind === 'foreign')) {
      out.keptInUse++; out.kept.push(`${e.name}: ${st.why}`); continue;
    }
    /**
     * A PARENTLESS CHROME ON OUR DIRECTORY IS ABANDONED NOW — no age cut.
     *
     * The cut cannot be part of this decision, and that is not a nicety: a busy
     * orphan WRITES to its profile, so its mtime is refreshed forever and the
     * directory never ages past ten minutes however long it has been derelict.
     * The one this box could not reclaim read 92 minutes old at one probe and
     * 6.7 at the next, with the same dead owner and the same live tree — an age
     * rule alone would have kept it until the disk filled. The evidence here is
     * stronger than age anyway: the process that created this directory is
     * dead, our naming proves nobody else ever launched into it, and the Chrome
     * on it has lost its parent. Nothing is coming back for it.
     */
    if (st && st.kind === 'orphan') {
      if (!killPids(st.pids)) { out.keptInUse++; out.kept.push(`${e.name}: SIGKILL did not take`); continue; }
      if (reap(full, e.name)) { out.reapedOrphans++; out.killedPids.push(...st.pids); }
      continue;
    }

    // Nothing holds it (or we could not read the table). Now age is the only
    // protection left, and it guards a real race: `profileDir()` creates the
    // directory a moment before `puppeteer.launch()` puts a browser in it.
    let ageMs;
    try { ageMs = now - statSync(full).mtimeMs; } catch { continue; }
    // A clock skew or a bogus mtime must not turn the sweep into an rm -rf of
    // things it has no evidence about.
    if (!(ageMs > maxAgeMs) || ageMs > 30 * DAY) { out.keptYoung++; continue; }
    if (!procTable) {
      // No process table: fall back to the old lock rule rather than guess.
      if (lockedByLivePid(full)) { out.keptInUse++; out.kept.push(`${e.name}: locked, no process table`); continue; }
    }
    // A live pid in the SingletonLock that the table says owns no Chrome on this
    // directory is a RECYCLED pid, not a user — the lock outlived its writer.
    reap(full, e.name);
  }

  // --- puppeteer's own root: owner unknowable, so never kill, never guess ----
  let pupp = [];
  try { pupp = readdirSync(os.tmpdir(), { withFileTypes: true }); } catch { pupp = []; }
  for (const e of pupp) {
    if (!e.isDirectory() || !PUPPETEER.test(e.name)) continue;
    out.scanned++;
    const full = path.join(os.tmpdir(), e.name);
    let age;
    try { age = now - statSync(full).mtimeMs; } catch { continue; }
    if (!(age > maxAgeMs) || age > 30 * DAY) { out.keptYoung++; continue; }
    if (lockedByLivePid(full)) { out.keptInUse++; continue; }
    reap(full, e.name);
  }

  out.freedMB = +out.freedMB.toFixed(1);
  return out;
}

let seq = 0;
const live = new Set();

/** A fresh, empty, explicitly-owned userDataDir. Pass it to puppeteer.launch(). */
export function profileDir(port = 0) {
  const dir = path.join(PROFILE_ROOT, `hzc-${process.pid}-${port}-${seq++}`);
  mkdirSync(dir, { recursive: true });
  live.add(dir);
  return dir;
}

/**
 * Kill whatever Chrome is still on `dir`, whoever its parent is. ONLY safe for a
 * directory this process owns and is finished with — which is exactly where it
 * is called from. Returns the pids killed.
 */
export function killProfileHolders(dir) {
  const procs = processSnapshot();
  if (!procs) return [];
  const names = new Set([dir]);
  try { names.add(realpathSync(dir)); } catch { /* already gone */ }
  const holders = procs.filter((p) => p.pid !== process.pid && pidAlive(p.pid)
    && p.cmd.includes(CHROME_MARKER) && [...names].some((n) => cmdUsesDir(p.cmd, n)));
  // Helpers before the main, so "did the kill take" is not racing the teardown.
  const pids = [...holders.filter((p) => /--type=/.test(p.cmd)),
    ...holders.filter((p) => !/--type=/.test(p.cmd))].map((p) => p.pid);
  if (pids.length) killPids(pids);
  return pids;
}

/**
 * Remove one profile now (call it right after the browser that used it closes).
 *
 * FIX ROUND 2 — it kills first when the profile is still locked. `gates.mjs`
 * SIGKILLs a wedged browser MAIN and then lands here; the renderers usually
 * follow it down, but any that do not are reparented to init AND lose the one
 * thing that could ever identify them, because the next line deletes the
 * directory their command line names. That is an orphan nothing can sweep. A
 * live `SingletonLock` is the cheap pre-check (Chrome removes it on a clean
 * exit), so the clean path pays a readlink and nothing more.
 */
export function disposeProfile(dir) {
  if (!dir) return;
  live.delete(dir);
  try { if (lockedByLivePid(dir)) killProfileHolders(dir); } catch { /* best effort */ }
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 2 }); } catch { /* swept later */ }
}

/** Remove every profile this process handed out. Safe to call more than once. */
export function disposeAllProfiles() {
  for (const dir of [...live]) disposeProfile(dir);
}

let installed = false;
/**
 * Wire `disposeAllProfiles` into every way this process can end. `exit` covers
 * the normal path and `process.exit()`; the signals cover a Ctrl-C or an
 * orchestrator kill, which is exactly how the leaked profiles were made.
 */
export function installProfileCleanup() {
  if (installed) return;
  installed = true;
  process.on('exit', disposeAllProfiles);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => { disposeAllProfiles(); process.exit(130); });
  }
  process.on('uncaughtException', (err) => {
    disposeAllProfiles();
    console.error(err);
    process.exit(1);
  });
}

/** Count of profile dirs currently on disk — the before/after number for a leak check. */
export function countProfiles() {
  let n = 0;
  for (const { dir, match } of [{ dir: PROFILE_ROOT, match: OURS }, { dir: os.tmpdir(), match: PUPPETEER }]) {
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && match.test(e.name)) n++;
      }
    } catch { /* root does not exist yet */ }
  }
  return n;
}
