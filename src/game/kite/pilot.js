// @ts-check
/**
 * M3 wave 3c, area B: THE PILOT'S HAND, pure (no three, no DOM). Where a driver wants the Survey Kite to go, as a bearing;
 * the Node rows turn it into the law's bank (`bankToward`), the page drivers into A and D held (the same bearing, an 8 deg
 * dead band). Nothing here moves her: the flight law does (./flight.js).
 *
 *   alongPosts(f, posts, i)        a glide road (R4): the track on post i; `passed` once her ground track comes within
 *                                  POST_PASS_M of it (roads.js)
 *   toField(f, field)              home onto a landing field: the track on its centre while she is far; near it with height
 *                                  to lose she ORBITS it (a circle of `orbitM`, clockwise), since the law's sink is the
 *                                  same in a turn: the circle only keeps her over the field while the height goes; once a
 *                                  straight glide to the centre (at `glide`:1) would use all she has, the final, the track
 *                                  on the centre to her feet (the law flares and lands at its own sink, <= KITE.safeLandVs)
 * Frame: engine x = E, z = -N; a bearing b (deg, clockwise from north) is the direction (sin b, -cos b) (flight.js).
 */
import { dirBearing } from './flight.js';

/** deg, wrapped to (-180, 180] */
export const wrapDeg = (/** @type {number} */ d) => { d %= 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; };

/** deg: the bearing from (x, z) to a goal */
export const bearingTo = (/** @type {number} */ x, /** @type {number} */ z, /** @type {{x: number, z: number}} */ g) => dirBearing(g.x - x, g.z - z);

/** deg: the bearing the body flies (its heading) */
export const headingDeg = (/** @type {{ heading: number }} */ f) => ((f.heading * 180 / Math.PI) % 360 + 360) % 360;

/**
 * The bank toward a wanted bearing: -1 (A), 0 or 1 (D), with a dead band (the page's drivers hold A or D the same way).
 * @param {{ heading: number }} f @param {number} want deg @param {number} [deadDeg]
 */
export function bankToward(f, want, deadDeg = 8) {
  const d = wrapDeg(want - headingDeg(f));
  return d < -deadDeg ? -1 : d > deadDeg ? 1 : 0;
}

/**
 * A glide road: the bearing to post `i` and whether it is passed this step.
 * @param {{ x: number, z: number }} f @param {readonly {x: number, z: number}[]} posts @param {number} i @param {number} passM
 */
export function alongPosts(f, posts, i, passM) {
  const p = posts[Math.min(i, posts.length - 1)];
  const d = Math.hypot(p.x - f.x, p.z - f.z);
  return { want: bearingTo(f.x, f.z, p), d, passed: i < posts.length && d <= passM };
}

/**
 * Home onto a landing field. `agl` is her height over the field's own ground (the field's `g`, or the ground under her).
 * @param {{ x: number, z: number, y: number }} f
 * @param {{ x: number, z: number, r: number, g: number }} field
 * @param {{ orbitM?: number, glide?: number }} [o]
 *   orbitM: the circle's radius; glide: the ratio the pilot plans the final on (she starts the final this far out per
 *   metre of height over the field's ground, so she arrives at the centre low)
 * @returns {{ want: number, phase: 'track' | 'orbit' | 'final', d: number, aglField: number }}
 */
export function toField(f, field, { orbitM = 16, glide = 4 } = {}) {
  const d = Math.hypot(field.x - f.x, field.z - f.z), aglField = f.y - field.g;
  const toC = bearingTo(f.x, f.z, field);
  // the height she still has over a straight glide to the centre from here: none to spare, the final
  const spare = aglField - d / glide;
  if (spare <= 0.5) return { want: toC, phase: 'final', d, aglField };
  if (d > orbitM * 1.6) return { want: toC, phase: 'track', d, aglField };
  // the orbit: clockwise round the centre (the tangent is the bearing from the centre + 90), pulled in or out to orbitM
  const fromC = bearingTo(field.x, field.z, f);
  const pull = Math.max(-60, Math.min(60, (d - orbitM) * 4));
  return { want: (fromC + 90 + pull + 360) % 360, phase: 'orbit', d, aglField };
}
