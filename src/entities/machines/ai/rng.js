/**
 * The machine-AI dice, behind one seam (FIX ROUND 3, judge-machine-ai-r2 §1).
 *
 * Every decision this lane rolls — which way the orbit flips, how long it
 * holds that direction, whether `_pickRing` takes the range its picker asked
 * for or a random one, the jitter on an attack score — used to call
 * `Math.random()` directly. That made `A41c-sustained-variety` a coin flip on
 * an unchanged tree: the judge measured FAIL, FAIL, PASS, FAIL, PASS over five
 * clean runs, all of them full-length, none starved. A gate that is this
 * round's deliverable cannot have a verdict that moves on its own.
 *
 * So the lane's dice are a single function pointer. The default IS
 * `Math.random` — the game is byte-for-byte as random as it was — and a gate
 * (or the debug HUD, or a future replay) can swap in a seeded stream for the
 * length of a measurement and put the real one back afterwards.
 *
 * SCOPE. Every die this lane rolls that can move a duel:
 * `Engage` (orbit direction, flip timer, ring dice, lateral jitter),
 * `AttackPicker._score` (the score jitter), `tables.span()` (every `[lo, hi]`
 * roll in the tables, which is what times the flips) and — added in FIX ROUND
 * 4 — `Perception`'s tick phase, scan phase and unseen-hit jitter, because the
 * PHASE of the 0.1 s perception tick decides which sim step a sightline is
 * sampled on and that alone re-writes a fight over broken ground. Search
 * patterns, squad phases and stimulus jitter are still on `Math.random`: they
 * run in states no duel measurement enters.
 *
 * WHAT A SEED ACTUALLY BUYS (judge-machine-ai-r2-r1 §2, which measured the
 * honest limit of the round-3 claim: same seed, same species, same bearing —
 * PASS, FAIL, FAIL, PASS, PASS, FAIL). A seed fixes THE DICE. It does not fix
 * the frame clock, the machine's starting pose, or its leftover state from the
 * last fight, and those move a duel at least as much. Replaying a fight needs
 * all four, and a caller that wants one must ALSO:
 *
 *   - pin the step size: `engine.stepMode = 'fixed'` (whole 1/60 s steps —
 *     the default 'substep' mode divides each frame's elapsed time, so dt
 *     depends on the frame rate and no two runs share a step sequence);
 *   - end the measurement on a STEP COUNT, not on a wall-clock poll;
 *   - restore the machine's pose (position, heading) and clear its fight state
 *     (`Engage.reset()`, the picker's cd/used/missed/stalled/blind maps, the
 *     perception tick phase) before each run.
 *
 * `A41c-sustained-variety` does all four and reports the replay it measures in
 * `replay:`. With the dice alone it is a coin flip, and this file does not
 * claim otherwise. What that gate measures with all four in place, so the next
 * reader does not have to guess: the DECISIONS replay exactly — the same seed
 * produced the same move sequence over the same 1801 steps in both runs —
 * while the TRAJECTORY does not: the end pose differed, because the continuous
 * state a duel also rides on (gait phase, rig smoothing, the nav layer's own
 * caches) is not reset between runs and this seam does not reach it. Seeded
 * dice buy a reproducible fight PLAN, not a reproducible replay.
 *
 * NOT a global `Math.random` stub. Stubbing the global would also seed
 * particles, grass and every other lane's dice for the duration, so a gate
 * would be measuring a different game than the one that ships.
 */

/** @type {() => number} */
let _rng = Math.random;

/**
 * One uniform [0, 1). Hot path — this is called a few times per machine per
 * second, so it stays a plain indirect call with no allocation.
 */
export function aiRandom() { return _rng(); }

/**
 * Swap the lane's dice. Pass `null` (or nothing) to restore `Math.random`.
 * Published as `ctx.machines.setAiRng(fn)`.
 * @param {(() => number)|null} fn
 * @returns {() => number} the function that was in place before
 */
export function setAiRng(fn) {
  const prev = _rng;
  _rng = typeof fn === 'function' ? fn : Math.random;
  return prev;
}

/** Is the lane currently running on something other than `Math.random`? */
export function aiRngSeeded() { return _rng !== Math.random; }

/**
 * A small, fast, well-distributed 32-bit PRNG (mulberry32) so a caller does
 * not have to bring its own. Published as `ctx.machines.seededRng(seed)`.
 * @param {number} seed
 */
export function seededRng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
