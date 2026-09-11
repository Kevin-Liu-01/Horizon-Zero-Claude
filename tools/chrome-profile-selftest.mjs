/**
 * Child process for `A80-chrome-profile-hygiene`.
 *
 * The profile-leak fix has one property that cannot be observed from inside the
 * process that owns it: "a profile handed out by this run is gone once the run
 * ends, even when the run ends by `process.exit` rather than a clean close" —
 * the exact path puppeteer does not cover and the one that filled the disk. So
 * the gate spawns THIS, which hands itself a profile, prints where it put it,
 * and then exits abruptly; the parent checks the directory afterwards.
 *
 * It also exercises the sweep's discrimination. The sweep is the dangerous half
 * of the fix — seven lanes have live profiles under the same root, and a sweep
 * that reaps one of those kills a running suite. Both roots it scans are
 * redirected here (`HZC_CHROME_PROFILE_ROOT` and `TMPDIR`), so the fixtures
 * below are the only things it can see and no real run is ever at risk.
 *
 * FIX ROUND 2 — THE ORPHAN FIXTURES. The case that actually accumulated on this
 * box was missing from here, so the gate stayed green while 691 MB piled up: our
 * directory, owner pid DEAD, `SingletonLock` naming a LIVE Chrome (the tree that
 * outlived a SIGKILLed lane and reparented to pid 1). Three fixtures now cover
 * the whole decision, and the two negatives are what make the positive safe:
 *   orphanHeld    marker binary, parent gone      -> REAP the dir, KILL the tree
 *   orphanForeign live holder, not Chrome         -> KEEP both (pid-reuse guard)
 *   orphanManaged Chrome with a LIVE parent       -> KEEP both (running suite)
 *   recycledOwner owner pid reused by a stranger  -> REAP the dir, kill NOTHING
 *   recycledOrphan recycled pid AND orphaned Chrome -> REAP the dir, KILL the tree
 *   liveOwner     owner pid alive AND is our tool -> KEEP (a running lane)
 * The stand-in "Chrome" is this node binary reached through a symlink named
 * `Google Chrome for Testing`, launched with a real `--user-data-dir=<dir>`, so
 * the sweep's identity proof is exercised exactly as it is in production; the
 * orphan is spawned via a throwaway middle process that exits immediately, which
 * is how a killed lane's browser gets reparented to init for real.
 *
 * Usage: HZC_CHROME_PROFILE_ROOT=<dir> TMPDIR=<dir> node chrome-profile-selftest.mjs
 * Prints one line: `SELFTEST {json}`.
 */
import { mkdirSync, existsSync, utimesSync, symlinkSync, writeFileSync, readFileSync, statSync, rmSync } from 'fs';
import { spawn, spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import {
  sweepProfiles, profileDir, disposeProfile, installProfileCleanup, PROFILE_ROOT,
} from './chrome-profile.mjs';

/** Above macOS's pid_max, so `kill(pid, 0)` is ESRCH by construction. */
const DEAD = 999999;
const DEAD2 = 999998;
const DEAD3 = 999997;
const DEAD4 = 999996;
const DEAD5 = 999995;
const THIRTY_MIN_AGO = new Date(Date.now() - 30 * 60 * 1000);

const TMP = os.tmpdir();
const age = (dir) => utimesSync(dir, THIRTY_MIN_AGO, THIRTY_MIN_AGO);
const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

// --- fixtures -------------------------------------------------------------
const fx = {
  // ours, owner still alive -> must survive however old it is
  liveOwner: path.join(PROFILE_ROOT, `hzc-${process.pid}-9999-90`),
  // ours, owner dead, old -> the actual leak; must be reaped
  deadOld: path.join(PROFILE_ROOT, `hzc-${DEAD}-9999-91`),
  // ours, owner dead, but young -> a run that just started; must survive
  deadYoung: path.join(PROFILE_ROOT, `hzc-${DEAD2}-9999-92`),
  // ours, owner dead, FRESH mtime, held by an ORPHANED Chrome -> reap dir, kill tree
  orphanHeld: path.join(PROFILE_ROOT, `hzc-${DEAD3}-9999-93`),
  // ours, owner dead, held by a live NON-Chrome (recycled pid) -> keep both
  orphanForeign: path.join(PROFILE_ROOT, `hzc-${DEAD4}-9999-94`),
  // ours, owner dead, Chrome with a LIVE parent (a running suite) -> keep both
  orphanManaged: path.join(PROFILE_ROOT, `hzc-${DEAD5}-9999-95`),
  // ours, owner pid RECYCLED onto a live stranger, nothing holding it, old ->
  // reaped. Filled in below once we know the stranger's pid.
  recycledOwner: null,
  // ours, owner pid recycled onto a stranger AND held by an orphaned Chrome —
  // both failures at once -> reap the dir, kill the tree, spare the stranger.
  recycledOrphan: null,
  // puppeteer's own naming, old, but Chrome still holds the SingletonLock
  puppLocked: path.join(TMP, 'puppeteer_dev_chrome_profile-selftest-locked'),
  // puppeteer's own naming, old, unheld -> the pre-fix leak; must be reaped
  puppStale: path.join(TMP, 'puppeteer_dev_chrome_profile-selftest-stale'),
};
const mkFixtures = () => {
  for (const dir of Object.values(fx)) {
    if (!dir) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'Preferences'), '{}');
  }
};
mkFixtures();

/**
 * A stand-in Chrome: this very node binary, reached through a path containing
 * the marker the sweep looks for. `-e … -- --user-data-dir=<dir>` puts a real
 * flag on a real command line, which is the only identity evidence the sweep
 * trusts (a recycled pid cannot forge it).
 */
const BIN_DIR = path.join(PROFILE_ROOT, '..', 'hzc-selftest-bin');
mkdirSync(BIN_DIR, { recursive: true });
const FAKE_CHROME = path.join(BIN_DIR, 'Google Chrome for Testing');
const spawnFailures = [];
try { if (!existsSync(FAKE_CHROME)) symlinkSync(process.execPath, FAKE_CHROME); }
catch (err) { spawnFailures.push(`symlink: ${err.message}`); }

const IDLE = 'setTimeout(() => {}, 120000)';
const holderArgs = (dir) => ['-e', IDLE, '--', `--user-data-dir=${dir}`];

/**
 * Spawn a holder whose parent stays alive — the "running suite" shape — as a
 * GRANDCHILD, never as our own child. A direct child that gets SIGKILLed becomes
 * a zombie until we wait on it, and `kill(pid, 0)` on a zombie succeeds: the
 * fixture would then report "still alive" for a holder the sweep had actually
 * killed, and the assertion protecting live lanes would pass for the wrong
 * reason. A middle process that stays up owns it and reaps it properly.
 */
let managedSeq = 0;
function spawnManaged(exe, dir) {
  /**
   * The handshake file MUST be unique per call. It was not: both calls shared
   * `managed-<pid>.pid`, so the second returned the FIRST holder's pid — which
   * made `disposeKilledHolder` read false forever, and would have made any
   * assertion on it demand that dispose kill the `orphanManaged` holder, i.e.
   * demand the sweep shoot a running lane. A fixture that names the wrong
   * process is worse than no fixture.
   */
  const pidFile = path.join(BIN_DIR, `managed-${process.pid}-${managedSeq++}.pid`);
  try { rmSync(pidFile, { force: true }); } catch { /* fresh anyway */ }
  const middle = `
    const { spawn } = require('child_process');
    const c = spawn(process.argv[1], [process.argv[2], ${JSON.stringify(IDLE)}, '--', process.argv[3]],
      { stdio: 'ignore' });
    require('fs').writeFileSync(process.argv[4], String(c.pid));
    setTimeout(() => {}, 120000);
  `;
  try {
    const m = spawn(process.execPath, ['-e', middle, exe, '-e', `--user-data-dir=${dir}`, pidFile],
      { stdio: 'ignore' });
    middlePids.push(m.pid);
    const wait = new Int32Array(new SharedArrayBuffer(4));
    for (let i = 0; i < 40; i++) {
      if (existsSync(pidFile)) {
        const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
        if (Number.isInteger(pid) && pid > 0) return pid;
      }
      Atomics.wait(wait, 0, 0, 100);
    }
    spawnFailures.push('managed: holder pid never appeared');
    return null;
  } catch (err) { spawnFailures.push(`managed: ${err.message}`); return null; }
}

/**
 * Spawn a holder and orphan it for real: a middle process spawns it detached and
 * exits, so the kernel reparents it to init exactly as it does when the box
 * SIGKILLs a lane out from under its browser.
 */
function spawnOrphan(exe, dir) {
  const middle = `
    const { spawn } = require('child_process');
    const c = spawn(process.argv[1], [process.argv[2], ${JSON.stringify(IDLE)}, '--', process.argv[3]],
      { detached: true, stdio: 'ignore' });
    c.unref();
    process.stdout.write(String(c.pid));
  `;
  const r = spawnSync(process.execPath, ['-e', middle, exe, '-e', `--user-data-dir=${dir}`],
    { encoding: 'utf8', timeout: 15000 });
  const pid = parseInt(String(r.stdout || '').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    spawnFailures.push(`orphan: ${(r.stderr || r.error?.message || 'no pid').slice(0, 200)}`);
    return null;
  }
  return pid;
}

const middlePids = [];
const orphanPid = spawnOrphan(FAKE_CHROME, fx.orphanHeld);
const foreignPid = spawnOrphan(process.execPath, fx.orphanForeign);   // not "Chrome"
const managedPid = spawnManaged(FAKE_CHROME, fx.orphanManaged);
/**
 * The RECYCLED-OWNER fixture. A live process that is NOT one of our harnesses
 * and holds no profile at all — the stranger the kernel eventually hands a dead
 * lane's pid to. Its pid becomes the directory's encoded owner, so `kill(pid,0)`
 * says "alive" and the protect-live-lanes rule would otherwise keep 70 MB
 * forever. Spawned orphaned so it has no tie back to us, and given a directory
 * name that is NOT any fixture, so nothing it does can be mistaken for holding
 * one.
 */
const recycledPid = spawnOrphan(process.execPath, path.join(BIN_DIR, 'not-a-profile'));
if (recycledPid) {
  fx.recycledOwner = path.join(PROFILE_ROOT, `hzc-${recycledPid}-9999-96`);
  fx.recycledOrphan = path.join(PROFILE_ROOT, `hzc-${recycledPid}-9999-97`);
  mkFixtures();
}
const recycledOrphanPid = fx.recycledOrphan ? spawnOrphan(FAKE_CHROME, fx.recycledOrphan) : null;
const spawned = [orphanPid, foreignPid, managedPid, recycledPid, recycledOrphanPid].filter(Boolean);

/**
 * Does `ps` actually show the stranger? The sweep reads the process table to
 * decide, and an unreadable/incomplete table makes it KEEP — correct, but it
 * means this fixture proved nothing. The parent asserts the reap only when this
 * is true, so a loaded box degrades to "unverified", never to a false red.
 */
const recycledInPs = recycledPid ? (() => {
  const r = spawnSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8', timeout: 10000 });
  return new RegExp(`^\\s*${recycledPid}\\s`, 'm').test(String(r.stdout || ''));
})() : false;

// Give the process table a moment to show them, then lock each fixture with a
// SingletonLock naming its holder — the same symlink Chrome writes.
const settle = new Int32Array(new SharedArrayBuffer(4));
Atomics.wait(settle, 0, 0, 300);
const lock = (dir, pid) => {
  if (!pid) return;
  try { symlinkSync(`${os.hostname()}-${pid}`, path.join(dir, 'SingletonLock')); }
  catch (err) { spawnFailures.push(`lock ${path.basename(dir)}: ${err.message}`); }
};
lock(fx.orphanHeld, orphanPid);
lock(fx.orphanForeign, foreignPid);
lock(fx.orphanManaged, managedPid);
if (fx.recycledOrphan) lock(fx.recycledOrphan, recycledOrphanPid);   // fresh mtime on purpose
// The lock is a SYMLINK to `<host>-<pid>`; its target never exists on disk.
symlinkSync(`${os.hostname()}-${process.pid}`, path.join(fx.puppLocked, 'SingletonLock'));

// mtimes LAST: creating the symlinks above bumps the directory's mtime, and the
// age cut is half the evidence the sweep works from.
age(fx.liveOwner); age(fx.deadOld); age(fx.puppLocked); age(fx.puppStale);
// The recycled-owner dir must be OLD and UNLOCKED: age and 'nothing holds it'
// are two of the four agreements that branch requires before it reaps.
if (fx.recycledOwner) age(fx.recycledOwner);
/**
 * The three orphan fixtures deliberately keep a FRESH mtime. That is the real
 * shape of the case that could not be reclaimed on this box: a live Chrome
 * writes to its profile continuously, so the directory is never more than
 * seconds old however long ago its owner died (measured at 92 minutes on one
 * probe and 6.7 on the next, same dead owner, same tree). If the sweep's orphan
 * path ever goes back to needing `age > maxAgeMs`, these three stop being
 * reaped and this gate says so.
 */
// deadYoung deliberately keeps its fresh mtime too.

const spawnedAliveBefore = Object.fromEntries(
  [['orphan', orphanPid], ['foreign', foreignPid], ['managed', managedPid]]
    .map(([k, pid]) => [k, alive(pid)]));

// How old the orphan's directory looked at the moment of the sweep. The parent
// asserts this is BELOW the cut: proof the reap came from the orphan evidence
// and not from the age rule, which a busy Chrome can outrun forever.
const MAX_AGE_MS = 10 * 60 * 1000;
let orphanAgeMsAtSweep = null;
try { orphanAgeMsAtSweep = Date.now() - statSync(fx.orphanHeld).mtimeMs; } catch { /* gone */ }

const swept = sweepProfiles({ maxAgeMs: MAX_AGE_MS });

// `null` = that fixture could not be built on this box (distinct from `false`,
// which is a real "the sweep removed it"). The parent must not read one as the other.
const survived = Object.fromEntries(
  Object.entries(fx).map(([k, dir]) => [k, dir ? existsSync(dir) : null]));
/**
 * Read IMMEDIATELY after the sweep, before anything else touches these pids.
 * Two of these were being read at PRINT time — i.e. after the teardown loop
 * below SIGKILLs every fixture — so "still alive" was a race against signal
 * delivery rather than a measurement. A value that happens to come out right is
 * not evidence.
 */
const spawnedAliveAfter = Object.fromEntries(
  [['orphan', orphanPid], ['foreign', foreignPid], ['managed', managedPid],
    ['recycled', recycledPid], ['recycledOrphan', recycledOrphanPid]]
    .map(([k, pid]) => [k, pid ? alive(pid) : null]));

// --- hand-out / dispose / exit-handler ------------------------------------
installProfileCleanup();
const disposed = profileDir(1);
const createdUnderRoot = disposed.startsWith(PROFILE_ROOT) && existsSync(disposed);
disposeProfile(disposed);
const disposeWorked = !existsSync(disposed);

/**
 * Disposing a profile that is still LOCKED must take the browser with it. The
 * runner SIGKILLs a wedged browser main and then deletes its directory; a helper
 * that outlived the main would otherwise be orphaned AND unfindable, because the
 * only evidence of what it was using is the path just deleted.
 */
const stillHeld = profileDir(3);
const heldPid = spawnManaged(FAKE_CHROME, stillHeld);
if (heldPid) {
  try { symlinkSync(`${os.hostname()}-${heldPid}`, path.join(stillHeld, 'SingletonLock')); }
  catch (err) { spawnFailures.push(`held lock: ${err.message}`); }
}
disposeProfile(stillHeld);
const disposeKilledHolder = heldPid ? !alive(heldPid) : null;
const disposeRemovedHeld = !existsSync(stillHeld);

// This one is NOT disposed by hand. Only the exit handler can remove it, which
// is the property the parent verifies after we are gone.
const abandoned = profileDir(2);

// Whatever the sweep decided, no fixture process outlives this gate — the
// middle process first, so it cannot outlive the holder it is watching.
for (const pid of [...middlePids, ...spawned, heldPid]) {
  if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}

console.log('SELFTEST ' + JSON.stringify({
  root: PROFILE_ROOT, tmp: TMP, swept, survived,
  createdUnderRoot, disposeWorked, abandoned,
  holders: { orphanPid, foreignPid, managedPid, heldPid, recycledPid, recycledOrphanPid },
  orphanAgeMsAtSweep, maxAgeMs: MAX_AGE_MS, recycledInPs,
  recycledAliveAfter: spawnedAliveAfter.recycled,
  recycledOrphanAliveAfter: spawnedAliveAfter.recycledOrphan,
  disposeKilledHolder, disposeRemovedHeld,
  spawnedAliveBefore, spawnedAliveAfter, spawnFailures,
}));

// Abrupt exit — no `browser.close()`, no unwinding. Exactly how a killed lane
// used to leave its 70 MB behind.
process.exit(0);
