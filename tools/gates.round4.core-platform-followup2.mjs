/**
 * Round 4 gates — lane `core-platform-followup2` (runner integrity).
 *
 * These gate the HARNESS, not the build. Three bugs made the gate suite lie
 * about the game this round, and none of them was catchable by a page assert:
 *
 *   1. A gate whose page or browser died mid-run was counted as a FAIL and
 *      printed NO verdict line, so the summary said "1 fail" and named nothing.
 *   2. Every headless-Chrome relaunch abandoned a ~70 MB profile in $TMPDIR;
 *      dozens filled the disk and gates then failed for "no space left on
 *      device" — a runner bug wearing a build bug's clothes.
 *   3. Gates hard-coded Round 3's 8.2 m/s sprint. Round 4's canon is 6.8, so
 *      those gates could only be made green by putting the wrong speed back:
 *      a gate that enforces a bug.
 *
 * `kind: 'runner'` (see tools/gates.mjs) runs `check()` in node instead of in a
 * page: no browser, no screenshot, milliseconds. They flow through the same
 * `emit()` and the same report as every other gate, so the harness is now
 * checked by the suite every lane already runs.
 */
import { readFileSync, existsSync, rmSync, mkdtempSync, openSync, closeSync } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatVerdict, writeLine } from './gate-verdict.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(TOOLS, f), 'utf8');

/**
 * Strip comments before scanning source for thresholds. Every one of these
 * files documents the OLD numbers in its comments on purpose (that is how the
 * next reader learns why the bands are derived); a scanner that cannot tell a
 * comment from an assertion would fail on the explanation of the fix.
 */
const stripComments = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/** Gates that assert a PLAYER LOCOMOTION speed and must derive it from the build. */
const LOCOMOTION_GATES = ['A3-sprint-speed', 'A12-clip-driven', 'A13-no-skate', 'A28-run-cadence'];

/* ------------------------- canon-speed scanning -------------------------- */

const REPO = path.join(TOOLS, '..');
/** Build source, by repo-relative path. Missing file reads as empty, never throws. */
const repoSrc = (rel) => {
  try { return readFileSync(path.join(REPO, rel), 'utf8'); } catch { return ''; }
};

/** Pull a `<decl> = { key: number, ... }` table out of a source file. */
function parseTable(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  const close = src.indexOf('};', open);
  if (open < 0 || close < 0) return null;
  const out = {};
  for (const m of stripComments(src.slice(open + 1, close)).matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(-?\d+(?:\.\d+)?)/g)) {
    out[m[1]] = +m[2];
  }
  return Object.keys(out).length ? out : null;
}

/** An identifier that holds a speed, and one that is already canon-derived. */
const SPEEDY = /speed|spd|vel|mps/i;
const DERIVED = /SPRINT_MIN|SPRINT_MAX|JOG_MIN|SPD\./;
const LEFT = /([A-Za-z_$][\w.$]*)\s*(<=|>=|<|>)\s*(\d+(?:\.\d+)?)/g;
const RIGHT = /(\d+(?:\.\d+)?)\s*(<=|>=|<|>)\s*([A-Za-z_$][\w.$]*)/g;

/**
 * Fingerprints of Round 3's table — jog 4.6 / sprint 8.2 — and the band edges
 * the gates of that round shipped (7.5 and 9.5 for the sprint band, 7.38 for
 * 0.9x sprint). These are STALE on sight whatever the live canon happens to be:
 * they were derived from a table that no longer exists.
 */
const SUPERSEDED = [4.6, 8.2, 7.5, 7.38, 9.5];

export const GATES = [
  {
    id: 'A79-runner-verdict-line', kind: 'runner', lane: 'core-platform-followup2',
    title: 'Every gate result prints exactly one verdict line naming id + status, including "browser lost"; every assert parses',
    timeout: 20000,
    check({ GATES: ALL } = {}) {
      /**
       * Part 1 — the real formatter against every terminal shape, including the
       * two that only ever occur when the browser dies and are therefore never
       * exercised by a green run. That is precisely why they broke unnoticed.
       */
      const shapes = {
        pass:        { id: 'X-pass', status: 'PASS', ms: 12, detail: { ok: true } },
        fail:        { id: 'X-fail', status: 'FAIL', ms: 12, detail: { got: 3 } },
        pending:     { id: 'X-pending', status: 'PENDING', ms: 1, detail: 'SKIP: api missing' },
        judge:       { id: 'X-judge', status: 'NEEDS-JUDGE', ms: 900 },
        lost:        { id: 'X-lost', status: 'FAIL', ms: 70487,
                       detail: { reason: 'browser lost', relaunches: 4, attempts: 3, lostRuns: 3 },
                       retried: true, error: 'Protocol error (Runtime.evaluate): Target closed' },
        escaped:     { id: 'X-escaped', status: 'FAIL', ms: 5,
                       detail: { reason: 'browser lost', relaunches: 1, escaped: true },
                       error: 'Target closed' },
        // A detail that cannot be JSON-serialised must still print a line.
        cyclic:      (() => { const d = { a: 1 }; d.self = d; return { id: 'X-cyclic', status: 'FAIL', ms: 3, detail: d }; })(),
        // A result missing everything optional must still print a line.
        bare:        { id: 'X-bare', status: 'FAIL' },
      };
      const lines = {};
      const broken = [];
      for (const [k, res] of Object.entries(shapes)) {
        let line;
        try { line = formatVerdict(res); } catch (err) { broken.push(`${k}: threw ${err.message}`); continue; }
        lines[k] = line;
        if (typeof line !== 'string' || !line.length) { broken.push(`${k}: empty line`); continue; }
        if (line.split('\n').length !== 1) broken.push(`${k}: ${line.split('\n').length} lines, must be exactly 1`);
        if (!line.includes(res.id)) broken.push(`${k}: line does not name the gate id`);
        if (!line.startsWith(`[${res.status}]`)) broken.push(`${k}: line does not lead with the status`);
      }
      // The specific contract for a lost browser: FAIL, the reason, the relaunch count.
      const lost = lines.lost || '';
      const lostOk = lost.startsWith('[FAIL] X-lost')
        && lost.includes('"reason":"browser lost"') && lost.includes('"relaunches":4')
        && lost.includes('retried:true');
      if (!lostOk) broken.push(`browser-lost line is wrong: ${lost}`);
      const escapedOk = (lines.escaped || '').includes('"reason":"browser lost"')
        && (lines.escaped || '').includes('"escaped":true');
      if (!escapedOk) broken.push(`escaped-throw line is wrong: ${lines.escaped}`);

      /**
       * Part 1b — the WRITE, not just the formatting. A correct line that never
       * reaches the terminal is the same bug as no line: `process.stdout` is
       * built with `kIgnoreErrors: true`, so ENOSPC, EAGAIN and a short write
       * are all swallowed. Observed on this box: a 133-gate run that counted
       * 133 in its summary and printed 36 verdict lines. So `writeLine` is
       * exercised against a real fd (whole line down, byte for byte) and
       * against a closed one (must REPORT the loss, not throw and not lie).
       */
      const wl = {};
      const tmpf = path.join(os.tmpdir(), `gate-verdict-selftest-${process.pid}.txt`);
      try {
        const fd = openSync(tmpf, 'w');
        const sample = formatVerdict(shapes.lost);
        wl.wrote = writeLine(sample, fd);
        closeSync(fd);
        wl.roundTrip = readFileSync(tmpf, 'utf8') === sample + '\n';
        // the fd is closed now: EBADF is unrecoverable and must come back false
        wl.reportsLoss = writeLine('nowhere', fd) === false;
      } catch (err) {
        wl.threw = String(err && err.message);
      } finally {
        rmSync(tmpf, { force: true });
      }
      if (wl.threw) broken.push(`writeLine self-test threw: ${wl.threw}`);
      if (!wl.wrote || !wl.roundTrip) broken.push('writeLine did not put the whole line on the fd, byte for byte');
      if (!wl.reportsLoss) broken.push('writeLine did not REPORT an unwritable fd — a dropped verdict line would be silent');

      /**
       * Part 2 — the structural guarantee. A formatter that prints correctly is
       * worth nothing if a code path can still push a result without calling
       * it, or throw out of the gate body entirely. Both happened. So: exactly
       * ONE `results.push` in the runner (the one inside `emit`), the gate body
       * wrapped by a catch that labels an escaped throw, and the report written
       * from a `finally` so the run that falls over is not the one run that
       * produces no report.
       */
      const src = read('gates.mjs');
      const bare = stripComments(src);
      const pushes = (bare.match(/results\.push\(/g) || []).length;
      const emitDecl = /const emit = \(res\) => \{\s*results\.push\(res\);\s*say\(formatVerdict\(res\)\);/.test(bare);
      /**
       * …and `say()` is durable: it writes through `writeLine`, counts what it
       * could not write, puts that count in the report and fails the run.
       * `console.log` anywhere on the verdict path is the bug coming back.
       */
      const durableStdout = /const say = \(text\) => \{/.test(bare)
        && /if \(writeLine\(text\)\) return;/.test(bare)
        && /droppedLines\+\+/.test(bare)
        && /droppedVerdictLines: droppedLines/.test(bare)
        && /COULD NOT BE WRITTEN/.test(bare)
        && !/console\.log\(formatVerdict/.test(bare);
      if (!durableStdout) broken.push('the verdict line is not written durably — a failed stdout write would be silent again');
      // A report that cannot be written must say so instead of unwinding past
      // the summary: observed as a run that printed its counts while
      // report.p<PORT>.json still held the PREVIOUS run's results.
      const reportWriteGuarded = /const wrote = \(f, body\)/.test(bare) && /REPORT WRITE FAILED/.test(bare);
      if (!reportWriteGuarded) broken.push('a failed report write can still unwind past the summary in silence');
      /**
       * …and the counts must add up to the run. `status: 'ERROR'` (a non-action
       * gate that threw) belonged to no bucket, so `31 gates: 17 pass, 8 fail,
       * 1 pending, 3 need judging` was a real summary of a 31-gate chunk in
       * which two gates timed out into arithmetic that summed to 29 and set no
       * exit code. The buckets must be derived from the results.
       */
      const countsTotal = /const tally = new Map\(\)/.test(bare)
        && /for \(const r of results\) tally\.set\(/.test(bare)
        && /UNKNOWN status/.test(bare)
        && /tally\.get\('ERROR'\)/.test(bare)
        && !/\$\{failed\.length\} fail/.test(bare);
      if (!countsTotal) broken.push('the summary buckets are hard-coded — a status outside them vanishes from the counts');
      const escapeGuard = /escaped: true/.test(bare);
      const reportInFinally = /\} finally \{[\s\S]*writeReport\(\);\s*\}/.test(bare);
      const emitsRunnerGate = /if \(gate\.kind === 'runner'\)/.test(bare);
      // A retried gate must not print the abandoned attempt's evidence.
      const retryReset = /delete res\[k\]/.test(bare)
        && /'consoleErrors'/.test(bare) && /'systemErrors'/.test(bare) && /'pass'/.test(bare);
      if (!retryReset) broken.push('retry does not clear every per-attempt field before the re-run');
      if (pushes !== 1) broken.push(`results.push appears ${pushes}x — every result must enter through emit()`);
      if (!emitDecl) broken.push('emit() no longer pushes-and-prints through formatVerdict');
      if (!escapeGuard) broken.push('no escaped-throw guard around the gate body');
      if (!reportInFinally) broken.push('writeReport() is not called from the finally');
      if (!emitsRunnerGate) broken.push('runner-kind gates are not dispatched');
      // …and the run says so out loud when a selected gate produced no verdict,
      // instead of leaving a summary that counts right and names nothing.
      const reconciles = /produced NO verdict line/.test(bare)
        && /gates\.filter\(\(g\) => !emitted\.has\(g\.id\)\)/.test(bare);
      if (!reconciles) broken.push('the run does not reconcile selected gates against emitted verdicts');
      /**
       * A lane file that will not parse is an UNRUN lane, not a missing one.
       * Observed live: two lane files broken at once, both still printed in the
       * "merged" line, and a summary reading `1 gates: 1 pass, 0 fail` while an
       * entire lane's gates did not exist. The failures must be collected, kept
       * out of the merged list, repeated after the counts, and put in the report.
       */
      const loadFailuresTracked = /const loadFailures = \[\]/.test(bare)
        && /loadFailures\.push\(/.test(bare)
        && /LANE FILE\(S\) DID NOT LOAD/.test(bare)
        && /loadedFiles\.length/.test(bare)
        && /loadFailures,[\s\S]{0,60}unrunGates/.test(bare);
      if (!loadFailuresTracked) broken.push('a lane file that fails to load can still leave the summary looking green');

      /**
       * Part 3 — every merged gate's assert/setup must PARSE, checked here in
       * milliseconds instead of discovered 90 seconds into a cold boot as a
       * confusing page error. These strings live inside template literals in
       * `gates.config.mjs`, so an innocent backtick in a comment silently turns
       * a gate body into garbage; the runner cannot tell that from a build
       * failure, and every lane pays a full boot to find out.
       */
      const unparseable = [];
      for (const g of (Array.isArray(ALL) ? ALL : [])) {
        for (const key of ['assert', 'setup']) {
          const body = g[key];
          if (typeof body !== 'string' || !body.trim()) continue;
          try {
            // eslint-disable-next-line no-new-func
            new Function(key === 'assert' ? `return (${body})` : body);
          } catch (err) {
            unparseable.push({ id: g.id, key, error: String(err.message).slice(0, 120) });
          }
        }
      }
      if (unparseable.length) {
        broken.push(`${unparseable.length} gate body/bodies do not parse: `
          + unparseable.map((u) => `${u.id}.${u.key}`).join(', '));
      }

      return {
        pass: broken.length === 0,
        detail: {
          shapesChecked: Object.keys(shapes).length,
          gateBodiesParsed: Array.isArray(ALL) ? ALL.length : 0,
          unparseable,
          resultsPushSites: pushes, emitDecl, escapeGuard, reportInFinally, retryReset, reconciles,
          durableStdout, reportWriteGuarded, countsTotal,
          loadFailuresTracked,
          lostLine: lines.lost, writeLineSelfTest: wl,
          broken,
        },
      };
    },
  },

  {
    id: 'A80-chrome-profile-hygiene', kind: 'runner', lane: 'core-platform-followup2',
    title: 'Chrome profiles are owned, removed on abrupt exit, reclaimed from orphaned browsers, and never reaped out from under a live run',
    timeout: 45000,
    check() {
      const problems = [];

      // --- both harnesses must ask for an explicit userDataDir --------------
      // Without this, puppeteer picks $TMPDIR/puppeteer_dev_chrome_profile-*
      // and only deletes it on a clean close — which neither harness can promise.
      for (const f of ['gates.mjs', 'screenshot.mjs']) {
        const bare = stripComments(read(f));
        // Inside the launch CALL, not merely somewhere in the file: a mutation
        // that deleted the key from the options object while leaving the
        // `const userDataDir = profileDir(...)` line above it went undetected
        // by a whole-file grep, and that is exactly the shape of the leak.
        if (!/puppeteer\.launch\(\s*\{[\s\S]{0,400}?userDataDir[\s\S]{0,200}?\}\s*\)/.test(bare)) {
          problems.push(`${f} does not pass userDataDir into puppeteer.launch()`);
        }
        if (!/disposeProfile\(/.test(bare)) problems.push(`${f} never disposes its profile`);
        if (!/installProfileCleanup\(\)/.test(bare)) problems.push(`${f} does not install the exit-handler cleanup`);
        if (!/sweepProfiles\(/.test(bare)) problems.push(`${f} does not sweep stale profiles at startup`);
      }
      // The relaunch path is the one that leaked most: a new profile per
      // relaunch, none of them ever closed cleanly.
      const gsrc = stripComments(read('gates.mjs'));
      if (!/async function launchBrowser\(\)[\s\S]{0,400}disposeProfile\(stale\)/.test(gsrc)) {
        problems.push('relaunch does not bin the previous profile');
      }
      /**
       * FIX ROUND 2 — the orphan path, statically. The leak that survived round 1
       * was `owner pid dead + SingletonLock naming a LIVE Chrome`: unreclaimable
       * by design, 5 trees x ~138 MB. Reclaiming it means killing a process, so
       * the three things that make that safe are asserted in the source itself,
       * not just inferred from the fixture passing:
       *   - identity comes from the command line (`--user-data-dir=<this dir>`
       *     plus the Chrome-for-Testing binary), which pid reuse cannot forge;
       *   - it is a SIGKILL of that proven tree, nothing broader;
       *   - puppeteer's root, whose owner is unknowable, still never gets killed.
       */
      const psrc = stripComments(read('chrome-profile.mjs'));
      if (!/CHROME_MARKER\s*=\s*'Chrome for Testing'/.test(psrc)) {
        problems.push('chrome-profile.mjs does not identify holders by the Chrome for Testing binary');
      }
      if (!/--user-data-dir=\$\{dir\}/.test(psrc)) {
        problems.push('chrome-profile.mjs does not prove a holder owns THIS directory from its command line');
      }
      if (!/process\.kill\(pid,\s*'SIGKILL'\)/.test(psrc)) {
        problems.push('chrome-profile.mjs never kills a proven-orphaned browser — the dir can never be reclaimed');
      }
      if (!/kind:\s*'managed'/.test(psrc) || !/kind:\s*'foreign'/.test(psrc)) {
        problems.push('chrome-profile.mjs lost the keep-it rules (live parent / unidentified holder)');
      }
      // The kill must be reachable ONLY from our own naming. If the puppeteer
      // branch ever learns to kill, a foreign puppeteer run on this box dies.
      const puppBranch = /puppeteer's own root[\s\S]{0,1400}?out\.freedMB = /.exec(psrc.slice(psrc.indexOf('sweepProfiles')))
        || /PUPPETEER\.test\(e\.name\)[\s\S]{0,900}?\n  }/.exec(psrc);
      // A scanner that matched nothing must not read as "clean" — that is how a
      // static assertion quietly stops asserting.
      if (!puppBranch) {
        problems.push('could not locate the puppeteer-root branch in chrome-profile.mjs — this check stopped checking');
      } else if (/killPids|SIGKILL/.test(puppBranch[0])) {
        problems.push('the sweep kills processes on puppeteer-named profiles, whose owner it cannot know');
      }
      if (!/swept\.reapedOrphans/.test(gsrc)) {
        problems.push('gates.mjs does not announce reaped orphan trees — a silent sweep is how this leak hid');
      }
      /**
       * The SECOND forever-keep in the same rule: once the kernel recycles the
       * dead owner's pid onto a stranger, `pidAlive(owner)` is true again and
       * the protect-live-lanes branch keeps the directory for good. Reaping it
       * is only safe on corroborating evidence, so the corroboration is
       * asserted in the source, not merely inferred from the fixture.
       */
      if (!/HARNESS_MARKERS/.test(psrc) || !/ownerIsHarness/.test(psrc)) {
        problems.push('chrome-profile.mjs cannot tell a live OWNER from a recycled pid — '
          + 'a stranger inheriting the pid pins that profile forever');
      }
      if (!/reapedRecycledOwner/.test(psrc)) {
        problems.push('chrome-profile.mjs does not report recycled-owner reaps — a silent reap is not auditable');
      }

      // --- live behaviour, in a sandbox of its own --------------------------
      // Both roots the sweep scans are redirected, so no other lane's live
      // profile is reachable from this gate however it fails.
      const sandbox = mkdtempSync(path.join(os.tmpdir(), 'hzc-profile-selftest-'));
      let out = null;
      let fixtureUp = false;
      try {
        const r = spawnSync(process.execPath, [path.join(TOOLS, 'chrome-profile-selftest.mjs')], {
          encoding: 'utf8', timeout: 30000,
          env: {
            ...process.env,
            HZC_CHROME_PROFILE_ROOT: path.join(sandbox, 'root'),
            TMPDIR: path.join(sandbox, 'tmp'),
          },
        });
        const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('SELFTEST '));
        /**
         * The child being KILLED is not evidence about the profile code. Seven
         * lanes' suites share this box and a node start has been measured into
         * the seconds here; a timeout or a spawn error is infra, and this file's
         * own convention for "the thing I need is not available" is PENDING, not
         * a red build. A child that ran and answered wrongly still FAILs.
         */
        // …but only when the static half found nothing. A real source problem
        // is a FAIL whatever happened to the child.
        if (!line && (r.error || r.signal) && problems.length === 0) {
          return { pass: null, detail: {
            verdict: `SKIP: profile selftest child could not run (${r.signal || r.error?.message}) — infra, not a build failure`,
            sourceScanProblems: problems,
          } };
        }
        if (!line) {
          problems.push(`selftest produced no result (status ${r.status}): ${(r.stderr || '').slice(0, 300)}`);
        } else {
          out = JSON.parse(line.slice('SELFTEST '.length));
          const s = out.survived;
          // The leak: an old profile whose owner is gone.
          if (s.deadOld) problems.push('sweep left a stale OWNED profile behind — the leak is back');
          if (s.puppStale) problems.push("sweep left a stale puppeteer profile behind — pre-fix leaks are not reclaimed");
          // The danger: reaping a profile a running suite is using.
          if (!s.liveOwner) problems.push('sweep DELETED a profile whose owner process is alive');
          if (!s.deadYoung) problems.push('sweep deleted a profile younger than the age cut');
          if (!s.puppLocked) problems.push('sweep deleted a profile Chrome still holds the SingletonLock on');
          if (!out.createdUnderRoot) problems.push('profileDir() did not create the directory under the owned root');
          if (!out.disposeWorked) problems.push('disposeProfile() did not remove the directory');
          /**
           * Disposing a LOCKED profile must take its browser down first. The
           * runner SIGKILLs a wedged main and then deletes the directory; a
           * helper that outlives the main is reparented to init AND loses the
           * only evidence of what it was using, because the path its command
           * line names has just been removed. That is an orphan no sweep can
           * ever find — the leak, made permanently invisible. The selftest has
           * measured this since round 2 and nothing read it: until now the
           * fixture also returned the WRONG pid, so it read false forever.
           */
          if (out.disposeKilledHolder === false) {
            problems.push('disposeProfile() deleted a locked profile without killing its browser — '
              + 'that browser is now an orphan whose profile path no longer exists, unsweepable forever');
          }
          if (out.disposeRemovedHeld === false) {
            problems.push('disposeProfile() left a held profile on disk');
          }
          // The property only observable from out here: an abrupt
          // `process.exit(0)` still takes the profile with it.
          if (existsSync(out.abandoned)) {
            problems.push('a profile survived process.exit() — the exit handler does not clean up');
          }

          /**
           * FIX ROUND 2 — the orphan trio. `orphanHeld` is the case that filled
           * the disk (our dir, owner dead, a live Chrome reparented to init still
           * holding the lock); `orphanForeign` and `orphanManaged` are the two
           * ways killing could go wrong, and they are asserted just as hard —
           * a sweep that reaps the first by reaping everything is a worse bug
           * than the leak. All three are checked only when their holder actually
           * came up; a box that could not spawn them says so below.
           */
          const before = out.spawnedAliveBefore || {};
          const after = out.spawnedAliveAfter || {};
          fixtureUp = !!(before.orphan && before.foreign && before.managed)
            && !(out.spawnFailures || []).length;
          if (fixtureUp) {
            if (s.orphanHeld) {
              problems.push('sweep KEPT our profile whose owner is dead and whose Chrome is orphaned — '
                + 'this is the 691 MB case, unreclaimable by design');
            }
            if (!(out.swept?.reapedOrphans >= 1)) {
              problems.push(`sweep reported reapedOrphans=${out.swept?.reapedOrphans} — the orphan path did not run`);
            }
            /**
             * The reap must NOT have come from the age rule. A live Chrome writes
             * to its profile constantly, so the real orphans on this box read
             * minutes old forever; if this fixture only passes because it aged
             * past the cut, the gate is green on a case that never occurs.
             */
            if (!(out.orphanAgeMsAtSweep < out.maxAgeMs)) {
              problems.push(`orphan fixture was ${out.orphanAgeMsAtSweep}ms old against a ${out.maxAgeMs}ms cut — `
                + 'this run did not prove the reap is age-independent');
            }
            if (after.orphan) {
              problems.push('the orphaned Chrome tree is still running after the sweep — '
                + 'it keeps burning CPU and keeps its profile unreclaimable');
            }
            if (!(out.swept?.killedPids || []).includes(out.holders?.orphanPid)) {
              problems.push('sweep did not report the pid it killed — an invisible kill is not auditable');
            }
            if (!s.orphanForeign || !after.foreign) {
              problems.push('sweep reaped a profile held by a live NON-Chrome process (recycled pid) — '
                + 'identity is not being proved from the command line');
            }
            if (!s.orphanManaged || !after.managed) {
              problems.push('sweep killed a Chrome whose parent is alive — that is a RUNNING lane, not an orphan');
            }
          }

          /**
           * The recycled-owner case, asserted only when the stranger really is
           * in the process table — the sweep reads `ps` to decide and a table
           * it cannot read makes it KEEP, which is correct behaviour but proves
           * nothing. Both halves matter: the directory goes, and the innocent
           * process on the recycled pid does NOT.
           */
          if (out.recycledInPs && out.holders?.recycledPid) {
            if (s.recycledOwner !== false) {
              problems.push('sweep KEPT our profile whose owner pid was recycled onto an unrelated live '
                + 'process — nothing will ever reclaim it, same forever-leak as the orphan case');
            }
            if (!(out.swept?.reapedRecycledOwner >= 1)) {
              problems.push(`sweep reported reapedRecycledOwner=${out.swept?.reapedRecycledOwner} — that path did not run`);
            }
            if (out.recycledAliveAfter === false) {
              problems.push('sweep KILLED the unrelated process holding the recycled pid — '
                + 'it only owns a name collision, not a browser');
            }
            /**
             * Both failures at once. This is the state a directory reaches when
             * a lane is SIGKILLed and its pid is later recycled: the plainest
             * derelict there is, and the easiest to leave keeping forever by
             * treating "recycled" and "orphaned" as separate stories.
             */
            if (out.holders?.recycledOrphanPid) {
              if (s.recycledOrphan !== false) {
                problems.push('sweep KEPT a profile whose owner pid was recycled AND whose Chrome is '
                  + 'orphaned — the most derelict state a profile can reach, kept for failing twice');
              }
              if (out.recycledOrphanAliveAfter) {
                problems.push('the orphaned Chrome on the recycled-owner profile is still running');
              }
            }
          }
          // A live owner that IS one of our harnesses is a running lane and
          // must survive the recycled-owner branch it now passes through.
          if (s.liveOwner === false) {
            problems.push('sweep deleted the profile of a LIVE harness process');
          }
        }
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }

      /**
       * A box too loaded to spawn three idle node processes has told us nothing
       * about the orphan path — but it has not told us the path is broken
       * either, and this file's convention for "the evidence is unavailable" is
       * PENDING. Only when everything else is clean: a real source problem is a
       * FAIL whatever the fixture managed to do.
       */
      if (out && !fixtureUp && problems.length === 0) {
        return { pass: null, detail: {
          verdict: 'SKIP: orphan fixtures could not be started on this box — orphan reaping unverified this run',
          spawnFailures: out.spawnFailures, spawnedAliveBefore: out.spawnedAliveBefore,
          sweep: out.swept, survived: out.survived,
        } };
      }

      return {
        pass: problems.length === 0,
        detail: {
          sweep: out?.swept ?? null,
          survived: out?.survived ?? null,
          disposedOnExit: out ? !existsSync(out.abandoned) : null,
          orphanReaped: fixtureUp ? {
            dirReaped: out.survived.orphanHeld === false,
            treeKilled: out.spawnedAliveAfter.orphan === false,
            killedPids: out.swept.killedPids,
            keptForeignHolder: out.survived.orphanForeign === true,
            keptManagedHolder: out.survived.orphanManaged === true,
            keptReasons: out.swept.kept,
            ageIndependent: `reaped at ${out.orphanAgeMsAtSweep}ms old, cut ${out.maxAgeMs}ms`,
          } : 'fixtures unavailable',
          recycledOwner: out?.recycledInPs ? {
            dirReaped: out.survived.recycledOwner === false,
            strangerSpared: out.recycledAliveAfter === true,
            reaped: out.swept.reapedRecycledOwner,
            compoundDirReaped: out.survived.recycledOrphan === false,
            compoundTreeKilled: out.recycledOrphanAliveAfter === false,
          } : 'stranger not visible in ps — unverified this run',
          disposeKillsHolder: out ? out.disposeKilledHolder : null,
          problems,
        },
      };
    },
  },

  /* -------------------------------------------------- A81-canon-speed-bands */
  {
    id: 'A81-canon-speed-bands', kind: 'runner', lane: 'core-platform-followup2',
    title: 'Canon speeds stand: no gate asserts a locomotion band the live canon cannot satisfy, and every locomotion gate derives its bands from player.speeds',
    timeout: 20000,
    check({ GATES: ALL } = {}) {
      const gates = Array.isArray(ALL) ? ALL : [];
      if (!gates.length) return { pass: null, detail: 'SKIP: runner passed no gate list' };

      /**
       * PART 1 — read the canon out of the BUILD, never out of this gate.
       *
       * A gate that froze `6.8` in its own source would be the very bug it is
       * meant to catch, one level up. `player.speeds` is `SPEEDS` in
       * src/entities/player.js; the animator retimes its clips against
       * `CANON_SPEEDS` in src/entities/anim/clipLibrary.js. Two tables means
       * two canons and no gate can tell which one is real, so a disagreement
       * on any shared key is a FAIL in its own right.
       */
      const canon = parseTable(repoSrc('src/entities/player.js'), 'const SPEEDS');
      const clipCanon = parseTable(repoSrc('src/entities/anim/clipLibrary.js'), 'const CANON_SPEEDS');
      if (!canon || !(canon.sprint > 0) || !(canon.jog > 0)) {
        return { pass: null, detail: 'SKIP: could not read SPEEDS out of src/entities/player.js — player-control owns the canon table' };
      }
      const canonSplit = [];
      if (clipCanon) {
        for (const k of Object.keys(canon)) {
          if (clipCanon[k] !== undefined && Math.abs(clipCanon[k] - canon[k]) > 1e-6) {
            canonSplit.push(`${k}: player.js ${canon[k]} vs clipLibrary.js ${clipCanon[k]}`);
          }
        }
      }

      /**
       * PART 2 — classify every speed literal in every gate against that canon.
       *
       * The window is 4–12 m/s. Below 4 lives a pile of legitimate absolute
       * bars — the 3 m/s slope cap, a 0.25 m/s idle threshold — which are not
       * canon-relative. Above 12 is nothing a character does on foot.
       *
       *   STALE  — the literal cannot be satisfied by a canon-speed build, or
       *            is a fingerprint of Round 3's superseded table. A gate like
       *            this can only be made green by putting the wrong speed
       *            back, so it FAILS, always, whoever owns it.
       *   FROZEN — the literal is a hand-derived band that the live canon
       *            still satisfies (a lower bar at 0.85–0.99x a canon speed,
       *            an upper bar at 1.01–1.25x). It asserts the right thing
       *            today and goes STALE — this gate red, by name — the moment
       *            the canon moves more than ~10%. It is reported every run
       *            with its owning lane and the one-line fix. It is a FAIL,
       *            with no tolerance, in a gate this lane owns or in one of
       *            the four gates whose whole subject IS the speed.
       */
      const scan = (g) => {
        const src = stripComments(`${g.assert || ''} ${g.setup || ''}`);
        const out = [];
        for (const m of src.matchAll(LEFT)) {
          const [text, ident, op, num] = [m[0].trim(), m[1], m[2], +m[3]];
          if (!SPEEDY.test(ident) || DERIVED.test(ident) || num < 4 || num > 12) continue;
          out.push({ text, ident, value: num, isLower: op === '>' || op === '>=' });
        }
        for (const m of src.matchAll(RIGHT)) {
          const [text, num, op, ident] = [m[0].trim(), +m[1], m[2], m[3]];
          if (!SPEEDY.test(ident) || DERIVED.test(ident) || num < 4 || num > 12) continue;
          // `4.6 < speed` is a LOWER bound on the identifier: flip the operator.
          out.push({ text, ident, value: num, isLower: op === '<' || op === '<=' });
        }
        const seen = new Set();
        return out.filter((h) => !seen.has(h.text) && seen.add(h.text));
      };

      const classify = (h, table = canon) => {
        for (const s of SUPERSEDED) {
          if (Math.abs(h.value - s) <= 0.02) {
            return { ...h, verdict: 'stale', why: `${h.value} is Round 3's superseded speed table` };
          }
        }
        let best = null;
        for (const [band, c] of Object.entries(table)) {
          const ratio = h.value / c;
          const ok = h.isLower ? (ratio >= 0.85 && ratio <= 0.99) : (ratio >= 1.01 && ratio <= 1.25);
          if (!ok) continue;
          // tightest bar wins: the highest reachable floor, the lowest ceiling
          if (!best || (h.isLower ? ratio > best.ratio : ratio < best.ratio)) best = { band, ratio };
        }
        if (!best) {
          return { ...h, verdict: 'stale', why: h.isLower
            ? `${h.value} is not a reachable floor for any canon speed (jog ${table.jog}, sprint ${table.sprint})`
            : `${h.value} is not a meaningful ceiling for any canon speed (jog ${table.jog}, sprint ${table.sprint})` };
        }
        const derived = h.isLower
          ? `${h.ident} > ${best.band === 'sprint' ? 'SPRINT_MIN' : 'JOG_MIN'}`
          : `${h.ident} < SPRINT_MAX`;
        return { ...h, verdict: 'frozen', band: best.band, ratio: +best.ratio.toFixed(3),
                 fix: `import { CANON_SPEEDS } from './gate-speeds.mjs', splice it into the gate body, and write \`${derived}\` instead of \`${h.text}\`` };
      };

      const stale = [], frozen = [];
      for (const g of gates) {
        // The gate that asserts the canon table itself must name the numbers.
        if (g.id === 'A28b-canon-speeds') continue;
        // No tolerance where the speed IS the subject, or where this lane can fix it.
        const strict = g.lane === 'core-platform-followup2' || LOCOMOTION_GATES.includes(g.id);
        for (const raw of scan(g)) {
          const h = classify(raw);
          const row = { id: g.id, lane: g.lane || null, hit: h.text };
          if (h.verdict === 'stale') stale.push({ ...row, why: h.why });
          else if (strict) stale.push({ ...row, why: `frozen literal in a gate that must derive its band (${h.ratio}x canon ${h.band})`, fix: h.fix });
          else frozen.push({ ...row, band: h.band, ratio: h.ratio, satisfiedBy: canon[h.band], fix: h.fix });
        }
      }

      /**
       * PART 3 — the classifier itself, against literals whose verdict is
       * known. Without this, "no stale literals" is indistinguishable from "the
       * scanner matched nothing", which is how a scan gate rots into a no-op.
       */
      const FIXTURE = [
        ['spd > 7.5', 'stale'], ['speed > 8.2', 'stale'], ['speed < 9.5', 'stale'],
        ['moveSpeed > 4', 'stale'], ['speed >= 7.38', 'stale'], ['vel < 4.6', 'stale'],
        ['8.2 < speed', 'stale'], ['speed > 11.9', 'stale'],
        ['speed > 6.1', 'frozen'], ['moveSpeed >= 6.12', 'frozen'],
        ['p.moveSpeed > SPRINT_MIN', 'clean'], ['speed < SPRINT_MAX', 'clean'],
        ['spd > SPD.sprint * 0.9', 'clean'], ['speed > 0.25', 'clean'],
        ['speed < 3', 'clean'], ['hairHz > 4.5', 'clean'],
      ];
      const misclassified = [];
      for (const [src, want] of FIXTURE) {
        const hits = scan({ assert: src });
        const got = !hits.length ? 'clean' : classify(hits[0]).verdict;
        if (got !== want) misclassified.push(`${src} -> ${got}, expected ${want}`);
      }

      /**
       * ...and the DRIFT property, asserted rather than promised. Tolerating a
       * frozen-but-satisfied literal is only defensible if this gate provably
       * turns on it the moment the canon moves — otherwise "frozen" is just a
       * quieter word for "waved through". Every literal this run tolerated is
       * re-classified against a canon table scaled 2x and 0.5x; each MUST come
       * back stale, or the tolerance is unearned and the gate fails.
       */
      const undetectedDrift = [];
      for (const k of [2, 0.5]) {
        const moved = Object.fromEntries(Object.entries(canon).map(([b, v]) => [b, v * k]));
        for (const f of frozen) {
          const hits = scan({ assert: f.hit });
          const got = !hits.length ? 'clean' : classify(hits[0], moved).verdict;
          if (got !== 'stale') {
            undetectedDrift.push(`${f.id} \`${f.hit}\` still ${got} at ${k}x canon (sprint ${moved.sprint}) — this gate would not catch the drift`);
          }
        }
      }

      /** PART 4 — the four gates that assert a locomotion speed must derive it. */
      const missing = [], derives = {};
      for (const id of LOCOMOTION_GATES) {
        const g = gates.find((x) => x.id === id);
        if (!g) { derives[id] = 'absent'; continue; }
        const src = `${g.assert || ''} ${g.setup || ''}`;
        const ok = /__CTX__\.player\.speeds/.test(src) && /SPD\.(sprint|jog)/.test(src);
        derives[id] = ok;
        if (!ok) missing.push(id);
      }

      return {
        pass: stale.length === 0 && missing.length === 0 && misclassified.length === 0
          && canonSplit.length === 0 && undetectedDrift.length === 0,
        detail: {
          canon, gatesScanned: gates.length, derives,
          staleLiterals: stale,
          canonSplit,
          classifierSelfTest: misclassified.length ? misclassified : `${FIXTURE.length}/${FIXTURE.length} ok`,
          driftDetection: undetectedDrift.length ? undetectedDrift
            : `${frozen.length} tolerated literal(s) all classify stale at 2x and 0.5x canon`,
          frozenButSatisfied: frozen,
          note: frozen.length
            ? `${frozen.length} hand-derived literal(s) still satisfied by the live canon — owned by another lane, listed with the one-line fix; this gate goes RED by name the moment the canon moves past them`
            : 'every locomotion band derives from the published player.speeds',
        },
      };
    },
  },
];
