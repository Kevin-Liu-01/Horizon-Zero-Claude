/**
 * Canon locomotion speeds for gate asserts — the ONE definition, importable by
 * every lane's gate file (owner: `core-platform-followup2`).
 *
 * WHY THIS IS A SHARED MODULE. Round 3 shipped jog 4.6 / sprint 8.2 m/s and half
 * a dozen gates hard-coded it (`spd > 7.5`, a 6–9.5 band, titles saying "at 8
 * m/s"). Round 4's `player-control` corrected the canon to walk 1.5 / jog 5.0 /
 * sprint 6.8 — HZD's own ratio, and the speed both locomotion clips are actually
 * authored at — and PUBLISHED it as `ctx.player.speeds`. Every literal left
 * behind is a gate that fails a CORRECT build and can only be made green by
 * putting the wrong speed back: a gate that enforces a bug.
 *
 * Hand-deriving the number once (`speed > 6.1`, i.e. someone's 0.9 x 6.8) is the
 * same bug with an extra step — it is still frozen, and it still goes stale the
 * next time the canon moves. `A81-canon-speed-bands` fails any gate whose assert
 * compares a speed-ish identifier to a literal in the 4–12 m/s band, so import
 * this instead.
 *
 * USE (lane gate files):
 *
 *   import { CANON_SPEEDS } from './gate-speeds.mjs';
 *   ...
 *   assert: `(async () => {
 *     const p = __CTX__.player;${CANON_SPEEDS}
 *     // SPD (the published table), SPRINT_MIN, SPRINT_MAX and JOG_MIN are now in scope
 *     return { pass: p.moveSpeed > SPRINT_MIN, detail: { speed: p.moveSpeed, canon: SPD.sprint } };
 *   })()`
 *
 * The relative bars are preserved, not loosened: 7.5/8.2 = 0.915 became
 * 0.9·sprint, and 4/4.6 = 0.87 became 0.87·jog.
 *
 * A missing `player.speeds` is a broken contract, not a failing build, so this
 * resolves PENDING — the runner's convention for a gate whose API is not there.
 * It therefore contains a `return`, and must be spliced into the gate function
 * body, not into an expression.
 */
export const CANON_SPEEDS = `
      const SPD = __CTX__.player && __CTX__.player.speeds;
      if (!SPD || !(SPD.sprint > 0) || !(SPD.jog > 0)) {
        return { pass: null, detail: 'SKIP: player.speeds not published — player-control owns the canon speed table' };
      }
      const SPRINT_MIN = 0.9 * SPD.sprint, SPRINT_MAX = 1.15 * SPD.sprint, JOG_MIN = 0.87 * SPD.jog;`;
