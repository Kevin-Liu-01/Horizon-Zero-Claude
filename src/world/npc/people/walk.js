/**
 * CALIMA · one step of a person's walk toward a mark (people; M1.5d). Shared by ./person.js (the live walk) and the routine
 * log's Node bench (tools/build/recipes/npc/routines.test.mjs), so the log walks people the way the game does. No three, no
 * allocation: `o` is { yaw, x, z } and is written in place.
 *
 * The person turns toward the mark at most TURN rad/s and moves `d` m along the new heading. Within NEAR m of the mark, or
 * whenever the mark is more than SHARP rad off the heading (a corner of a path), the turn is FAST rad/s and the step is cut by
 * the cosine of what is left of the turn (at least MIN): a person walking a path round a building's corner turns at the corner
 * instead of swinging wide through it (at 1.5 rad/s and 1.2 m/s the turning circle is 1.6 m across, and the routine log caught
 * people circling a mark they never reached, and corners cut 0.3 m into a wall's margin).
 * Returns the distance moved; `o.arrived` is true once the mark is within ARRIVE m.
 */
export const WALK_STEER = Object.freeze({ TURN: 1.5, FAST: 5, NEAR: 1.5, SHARP: 1.0, MIN: 0.15, ARRIVE: 0.3 });
const TAU = Math.PI * 2;

export function walkToward(o, T, d, step) {
  const S = WALK_STEER;
  const dx = T.x - o.x, dz = T.z - o.z;
  let turn = Math.atan2(dx, dz) - o.yaw;
  while (turn > Math.PI) turn -= TAU;
  while (turn < -Math.PI) turn += TAU;
  const at = Math.abs(turn);
  const slow = (dx * dx + dz * dz < S.NEAR * S.NEAR && at > 0.6) || at > S.SHARP;
  const maxTurn = (slow ? S.FAST : S.TURN) * step;
  o.yaw += Math.max(-maxTurn, Math.min(maxTurn, turn));
  if (slow) d *= Math.max(S.MIN, Math.cos(Math.min(Math.PI / 2, at)));
  o.x += Math.sin(o.yaw) * d;
  o.z += Math.cos(o.yaw) * d;
  // (the mark is reached on the distance before this step, as the walk always read it)
  o.arrived = dx * dx + dz * dz < S.ARRIVE * S.ARRIVE;
  return d;
}
