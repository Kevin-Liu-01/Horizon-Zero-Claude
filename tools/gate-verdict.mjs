import { writeSync } from 'fs';

/**
 * The one place a gate verdict is turned into text.
 *
 * WHY IT IS ITS OWN FILE. `tools/gates.mjs` is a script: importing it runs a
 * whole suite. That made the runner's most safety-critical line — the one that
 * proves a gate was observed at all — the only part of the harness that could
 * not itself be gated. It lives here so `A79-runner-verdict-line` can call the
 * REAL formatter against every terminal result shape, including the shapes that
 * only occur when the browser dies and are therefore never exercised by a green
 * run.
 *
 * THE INVARIANT: every result that enters a run prints exactly one line, and
 * that line always names the gate id and its status — including
 * `{reason:'browser lost'}`, which is what the run prints when a gate could not
 * be observed after three attempts on fresh browsers.
 */

/**
 * WRITE THE LINE, SYNCHRONOUSLY, AND NOTICE IF IT DID NOT LAND.
 *
 * `console.log` is not a reliable way to emit a safety-critical line.
 * `process.stdout` is created with `kIgnoreErrors: true`, so a failed write —
 * ENOSPC on a box at 97 % disk with sixteen lanes writing screenshots, EAGAIN
 * on a non-blocking pipe, a partial write of a long line — is swallowed with no
 * throw and no event. Observed: a 133-gate run whose summary counted all 133
 * and whose stdout carried 36 verdict lines, the missing 97 a contiguous block
 * in the middle. The run looked complete and named a third of its own results.
 *
 * `writeSync` on fd 1 loops until the whole buffer is on the file, retries the
 * transient errors, and — when the line truly cannot be written — RETURNS FALSE
 * so the caller can count it and say so at the end, out of band on fd 2. A line
 * that is lost is now a number the run reports, never silence.
 */
export function writeLine(text, fd = 1) {
  const buf = Buffer.from(text + '\n', 'utf8');
  let off = 0, spins = 0;
  while (off < buf.length) {
    try {
      off += writeSync(fd, buf, off, buf.length - off);
      spins = 0;
    } catch (err) {
      // EAGAIN/EWOULDBLOCK: a non-blocking pipe whose buffer is full. Spin a
      // bounded number of times — the reader is draining it.
      if ((err.code === 'EAGAIN' || err.code === 'EWOULDBLOCK') && spins++ < 20000) continue;
      if (err.code === 'EINTR') { spins = 0; continue; }
      /**
       * A pipe with a reader too slow for a 20 000-spin budget is not a lost
       * line — node's own stream will queue the rest. Handing the remainder
       * back to it is strictly better than dropping it, and keeps a piped run
       * (`gates.mjs | tee`) behaving exactly as it did before. Only a write
       * that cannot ever land — ENOSPC, EBADF, EPIPE — returns false, which is
       * the case this whole function exists to make visible.
       */
      if (err.code === 'EAGAIN' || err.code === 'EWOULDBLOCK') {
        try { process.stdout.write(buf.subarray(off)); return true; } catch { return false; }
      }
      return false;
    }
  }
  return true;
}

/** One verdict line for one result. Never throws; never returns empty. */
export function formatVerdict(res) {
  const id = res?.id ?? '<unknown-gate>';
  const status = res?.status ?? 'FAIL';
  const ms = Number.isFinite(res?.ms) ? res.ms : 0;
  let detail = '';
  if (res?.detail !== undefined && res?.detail !== null) {
    // A detail that cannot be serialised (a cycle, a live object someone
    // attached) must not cost the line — the line is the point.
    try { detail = ' ' + JSON.stringify(res.detail); }
    catch { detail = ' ' + String(res.detail); }
  }
  return `[${status}] ${id} (${ms}ms)${detail}`
    + `${res?.retried ? ' retried:true' : ''}`
    + `${res?.systemErrors?.length ? ' SYSTEM-ERRORS: ' + res.systemErrors.map((r) => r.key + ' x' + r.count).join(', ') : ''}`
    + `${res?.hookErrors ? ' HOOK-ERRORS: ' + res.hookErrors : ''}`
    + `${res?.error ? ' ERR: ' + res.error : ''}`;
}
