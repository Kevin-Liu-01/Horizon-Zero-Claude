/**
 * Chaos gates — on-demand proof that the runner survives a dying browser.
 *
 * NOT auto-merged. The runner's directory scan only picks up
 * `tools/gates.round4.*.mjs`, and this file is deliberately named outside that
 * pattern: no lane should ever run these as part of a suite. They exist so the
 * runner's failure handling can be EXERCISED instead of waited for.
 *
 *   node tools/gates.mjs --port <PORT> --extra tools/chaos-gates.mjs \
 *     --only ZZ-chaos-kill-page,ZZ-chaos-kill-browser
 *
 * BOTH GATES ARE EXPECTED TO FAIL. That is the pass bar: the run must print,
 * for each of them, one verdict line of the form
 *
 *   [FAIL] ZZ-chaos-kill-page (26363ms) {"reason":"browser lost","relaunches":2,
 *          "attempts":3,"lostRuns":3} retried:true ERR: ... Target closed
 *
 * and must then carry on, finish the run, write `shots/gates/report.p<PORT>.json`,
 * and report `chrome profiles on disk: n (this run leaves 0 of its own)`. A run
 * that instead prints a summary counting a failure it never named, or that dies
 * with the browser, is the bug `A79-runner-verdict-line` guards against.
 *
 * `gate.chaos` is honoured by the runner: `'kill-page'` closes the target under
 * the pending assert, `'kill-browser'` SIGKILLs the whole Chrome — which is what
 * a lost GPU process does to it when seven lanes share one GPU.
 *
 * The last two gates here fire no chaos at all: they are POISON PILLS.
 * `ZZ-chaos-error-status` throws in setup so a non-action gate reaches
 * `status: 'ERROR'` — the bucket the summary used to count nowhere; the run must
 * print `1 error` and exit non-zero. `ZZ-chaos-stale-speed` is a poison pill for
 * `A81-canon-speed-bands`. A scanner that reports "no stale literals" is
 * indistinguishable from a scanner that matched nothing, so the only honest
 * proof it still has teeth is to hand it a gate that must turn it red:
 *
 *   node tools/gates.mjs --port <PORT> --extra tools/chaos-gates.mjs \
 *     --only ZZ-chaos-stale-speed,A81-canon-speed-bands
 *
 * A81 must come back FAIL naming `ZZ-chaos-stale-speed`. It is never in a lane
 * run, because the directory scan cannot see this file.
 */

/** Long enough that the chaos timer always lands inside this await. */
const SLOW_ASSERT = `(async () => {
  await new Promise(r => setTimeout(r, 20000));
  return { pass: true, detail: 'assert survived — chaos never fired, which is itself a failure of this probe' };
})()`;

export const GATES = [
  {
    id: 'ZZ-chaos-kill-page', kind: 'action', lane: 'chaos',
    title: 'EXPECT FAIL: page closed under a pending assert must still print a verdict line',
    settle: 200, timeout: 40000, chaos: 'kill-page', chaosAfter: 500,
    assert: SLOW_ASSERT,
  },
  {
    id: 'ZZ-chaos-kill-browser', kind: 'action', lane: 'chaos',
    title: 'EXPECT FAIL: browser SIGKILLed under a pending assert must still print a verdict line',
    settle: 200, timeout: 40000, chaos: 'kill-browser', chaosAfter: 500,
    assert: SLOW_ASSERT,
  },
  {
    /**
     * A gate that is not `kind: 'action'` and throws gets `status: 'ERROR'` —
     * the bucket the summary used to count nowhere. A 31-gate chunk that had
     * two of these printed `31 gates: 17 pass, 8 fail, 1 pending, 3 need
     * judging` (29) and exited 0. Run this one and the summary must say
     * `1 error` and the run must exit non-zero:
     *
     *   node tools/gates.mjs --port <PORT> --extra tools/chaos-gates.mjs \\
     *     --only ZZ-chaos-error-status
     */
    id: 'ZZ-chaos-error-status', kind: 'visual', lane: 'chaos',
    title: 'EXPECT ERROR: a non-action gate that throws must appear in the counts and fail the run',
    // A one-millisecond budget: the page load cannot finish inside it, so the
    // gate throws out of the runner's own await — the real path a visual gate
    // takes to ERROR, not a hand-made status.
    // A setup that throws in the page: the runner's own await rejects and the
    // catch labels a non-action gate ERROR — the real path V24/V25 took, not a
    // hand-made status.
    settle: 0, timeout: 20000,
    setup: `(() => { throw new Error('deliberate: ERROR-status probe'); })()`,
    criteria: 'never judged — this gate throws in setup',
  },
  {
    /**
     * Round 3's actual sprint band, word for word: a floor above the canon
     * sprint (unreachable — the gate could only ever be made green by putting
     * 8.2 m/s back) and a ceiling so loose it asserts nothing. Both must be
     * classified STALE. The `pass: true` body is never reached; only the
     * SOURCE of `assert` matters, because A81 reads it, it does not run it.
     */
    id: 'ZZ-chaos-stale-speed', kind: 'action', lane: 'chaos',
    title: 'POISON PILL: a Round 3 speed band that A81-canon-speed-bands must reject',
    settle: 0, timeout: 5000,
    assert: `(async () => {
      const spd = __CTX__.player.moveSpeed;
      return { pass: spd > 7.5 && spd < 9.5, detail: { spd } };
    })()`,
  },
];
