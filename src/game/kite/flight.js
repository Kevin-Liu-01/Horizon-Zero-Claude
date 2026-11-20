// @ts-check
/**
 * M3 area B (M3.1), THE SURVEY KITE'S FLIGHT LAW. Pure: no three, no DOM, no clock of its own; the page and the Node
 * rows (tools/gates/kite/*.test.mjs) step the same functions.
 *
 * The numbers are BIBLE §12 "The Survey Kite in numbers" and the M3 briefs' area B bands (KF2-KF6):
 *   still air 7.5 m/s forward, 1.5 m/s sink (5:1); the wind adds 0.4 x its velocity to the ground velocity
 *   (about 6.5:1 straight downwind, 3.5:1 straight upwind in the 5.5 m/s trade); ridge lift from `liftAt`
 *   (+0.5 to +1.5 m/s on a windward slope of 25 deg or more within 40 m below), never above launch height + 25 m;
 *   it opens only when airborne >= 0.35 s with >= 3 m of clearance, and never while `flyable` is false (calima and
 *   squall); a landing at <= 3 m/s vertical does no damage; past the 1.1 m water contour she is turned back.
 *
 * THE FLIGHT-STATE SEAM (M3 briefs §3.2; hero-anim owns it, everyone else reads): `player.flight` is one of
 * FLIGHT_STATES, and `player.kite` is a FlightBody (altitude over ground, launch height, the read-out's two numbers).
 * Callers: systems (`kite:open`, `kite:land`), instruments (sight x2 while 'gliding'), combat (no weapon verb while
 * `player.flight !== 'none'`), ui (the read-out), audio, save (never saved while `player.flight !== 'none'`).
 *
 * Frame: engine x = E, z = -N (sites.js). A bearing b (deg, clockwise from north) is the direction (sin b, -cos b).
 */
import { flyableIn as seamFlyableIn, GROUNDING_WEATHER as SEAM_GROUNDING_WEATHER, GROUNDED_WEIGHT } from '../../world/environment.js';

/** @typedef {'none' | 'opening' | 'gliding' | 'folding' | 'landing'} FlightState */
/** @type {readonly FlightState[]} */
export const FLIGHT_STATES = Object.freeze(['none', 'opening', 'gliding', 'folding', 'landing']);

/** The law's numbers. A key marked * in the brief is a starting value, frozen on its first Node run. */
export const KITE = Object.freeze({
  /** m/s through the air, still air */
  air: 7.5,
  /** m/s of sink, still air */
  sink: 1.5,
  /** the share of the wind's velocity added to the ground velocity */
  windK: 0.4,
  /** s airborne before Space opens it */
  openAirborneS: 0.35,
  /** m of clearance under her feet before it opens */
  openClearM: 3,
  /** lift stops this far above the launch height (m) and fades over the last `liftFadeM` */
  liftCapM: 25,
  liftFadeM: 2,
  /** s from the request to her weight on the sling (KF4: 400-600 ms*; wave 2b 0.5 -> 0.6: her right hand takes the roll
   *  off its mount at the small of her back and carries it round her hip, 1.8 m of road at W1's wrist bar) */
  openS: 0.6,
  /** s from the fold's request to hands free (KF4: <= 400 ms*; wave 2b 0.35 -> 0.39: the roll carried back to the mount; stepped at 60 Hz the state turns at the 24th step, 0.400 s) */
  foldS: 0.39,
  /** m over the ground at which a glide becomes a landing (the flare) */
  landAglM: 1.2,
  /** s the landing takes once the feet are down (planted inside 2 steps at 7.5 m/s is under 0.6 s; wave 2b 0.4 -> 0.55: the
   *  roll held through the crouch and carried back to its mount once she rises) */
  landS: 0.55,
  /** m/s vertical at or under which a landing is free */
  safeLandVs: 3,
  /** m/s of sink the flare holds in the last `landAglM` (under safeLandVs) */
  flareSink: 1.0,
  /** grounded mid-air (calima or squall arrives). RULING R5 (the orchestrator's M3 rulings, provisional; KF5 restated):
   *  "calima or squall forces the fold within 1 s at any height; from 80 m or lower she is on the ground within 5 s; from
   *  higher, at the law's safe sink (no free fall)". The forced fold is a REEF: the cells are pulled flat and the kite
   *  rides above her as a drogue, her hands on the bar, until her feet are down (a fold to hands free in the air would
   *  be a free fall). It begins on the step the weather is read (`forcedFoldS` is the bar: <= 1 s). Reefed, she goes
   *  down at `downAcc` (0.8 of the player's 22 m/s^2: the reefed kite holds part of her weight at every instant, so
   *  never a free fall) to at most `downMaxVs` (the law's safe sink), and the kite brakes her at `downBrake` into the
   *  flare. 80 m over the ground comes down in 4.91 s (closed form below, `groundedDownTime`); from higher she comes
   *  down at that safe sink, never faster (200 m: 9.9 s; 275 m: 13.0 s). (Wave 1's law fell at the full 22 m/s^2
   *  and braked at 16: 4.95 s from 80 m) */
  groundedDownS: 5,
  forcedFoldS: 1,
  downAcc: 17.6,
  downMaxVs: 24,
  downBrake: 22,
  /** m over the ground at which the brought-down descent holds the flare's sink */
  groundedFlareM: 1.5,
  /** m/s of sink in the brought-down flare (under safeLandVs) */
  groundedFlareSink: 2.5,
  /** rad/s of turn at full bank */
  turnRate: 0.9,
  /** the water contour past which a landing is refused (BIBLE: wading to 1.2 m; the current turns her at 1.1) */
  waterContourM: 1.1,
  /** m over deep water under which she turns for the last ground she crossed at or inside the contour */
  waterTurnAglM: 8,
  /** m/s the current carries her toward that ground if she still comes down on deep water */
  waterCarryMs: 2.5,
  /** the player's jump (src/entities/player.js GRAVITY 22 m/s^2, JUMP_PEAK 1.5 m): where she is when Space may open
   *  the kite, `openAirborneS` after a jump off a top. A step off a 4 m pillar is 2.65 m over its foot at 0.35 s, under
   *  the 3 m of clearance, so a pillar is launched from with a jump (`openHeightOffTop`) */
  gravity: 22,
  jumpPeakM: 1.5,
});

/** The height (m) the kite opens at off a top at `topY`: a jump, then Space at `KITE.openAirborneS` (the one launch
 *  height area A's lift rows and area B's row 0 both read). */
export function openHeightOffTop(/** @type {number} */ topY) {
  const v0 = Math.sqrt(2 * KITE.gravity * KITE.jumpPeakM), t = KITE.openAirborneS;
  return topY + v0 * t - 0.5 * KITE.gravity * t * t;
}

/**
 * The brought-down descent's time (s) from `agl` m over flat ground (KF5), in closed form: accelerate at `downAcc` to at
 * most `downMaxVs`, brake at `downBrake` to the flare's sink at `groundedFlareM`, then the flare. The Node rows step the
 * law and compare.
 * @param {number} agl
 * @param {number} [v0] m/s of sink when the weather arrives (the glide's)
 */
export function groundedDownTime(agl, v0 = KITE.sink) {
  const a = KITE.downAcc, b = KITE.downBrake, vf = KITE.groundedFlareSink, h = Math.max(0, agl - KITE.groundedFlareM);
  // peak speed reached with no cruise: h = (v^2 - v0^2)/2a + (v^2 - vf^2)/2b
  const vPk = Math.min(KITE.downMaxVs, Math.sqrt(Math.max(vf * vf, (h + v0 * v0 / (2 * a) + vf * vf / (2 * b)) / (1 / (2 * a) + 1 / (2 * b)))));
  const dA = Math.max(0, (vPk * vPk - v0 * v0) / (2 * a)), dB = Math.max(0, (vPk * vPk - vf * vf) / (2 * b)), cruise = Math.max(0, h - dA - dB);
  return Math.max(0, vPk - v0) / a + Math.max(0, vPk - vf) / b + cruise / vPk + Math.min(agl, KITE.groundedFlareM) / vf;
}

/** Weather states that ground the kite (BIBLE §3.2: calima and squall): the weather seam's own list. */
export const GROUNDING_WEATHER = SEAM_GROUNDING_WEATHER;

/**
 * The kite flies in this weather: the weather seam's law (src/world/environment.js `flyableIn`, behind `flyable()`; rule
 * 21, one law: M3 fix round 1, area F's smallest change here, where wave 2 kept a copy without the seam's fade-out rule).
 * @param {string | null | undefined} weather  the state (aliases as setWeather takes them)
 * @param {{ calima?: number, rain?: number } | null} [w]  the cross-faded weather record, when the caller has it
 */
export function flyableIn(weather, w = null) {
  return seamFlyableIn(weather, w);
}

/**
 * The field note when an open is refused because the weather grounds the kite: the bible's own words (BIBLE §3.2's
 * weather table, "grounds the Survey Kite", and §16's Survey Kite row, "Calima and squalls ground it"). The strings
 * move to src/game/text/ when the writing area (W3) lands the kite's lines; the words stay the bible's.
 */
export const GROUNDED_NOTE = Object.freeze({ calima: 'Calima grounds the Survey Kite.', squall: 'A squall grounds the Survey Kite.' });

/**
 * @typedef {object} FlightBody
 * @property {number} x         engine x (m)
 * @property {number} y         height of her feet (m)
 * @property {number} z         engine z (m)
 * @property {number} heading   rad, the bearing she flies (0 = north, clockwise)
 * @property {number} vx        ground velocity (m/s)
 * @property {number} vy
 * @property {number} vz
 * @property {number} agl       altitude over the ground, or the water's surface, under her (m)
 * @property {number} launchY   the height she opened at (lift is capped at launchY + KITE.liftCapM)
 * @property {number} t         s in the current state
 * @property {number} lift      m/s of lift applied this step (the read-out's LIFT)
 * @property {number} windOver  m/s of wind over the ground this step (the read-out's WIND)
 * @property {number} windBearing deg the wind comes FROM, three digits in the read-out
 * @property {boolean} grounded true once calima or squall arrived mid-air: she is being brought down
 * @property {boolean} forced   the fold now running was forced by the weather (R5: a reef held to the ground)
 * @property {number} landVs    m/s vertical at the last touchdown
 * @property {number} landDamage hp taken at the last touchdown (0 at or under KITE.safeLandVs)
 * @property {boolean} refusedWater the last landing was turned back from water past the contour
 * @property {number} downFromY height at the moment the weather grounded it
 * @property {number} downT     s since the weather grounded it
 * @property {boolean} hasShore she has crossed ground at or inside the water contour on this flight
 * @property {number} shoreX    engine x of the last such ground (m)
 * @property {number} shoreZ    engine z of the last such ground (m)
 * @property {boolean} waterTurn this step she was turned for that ground (low over water past the contour)
 * @property {boolean} carried  the current is carrying her toward that ground after a touchdown on deep water
 */

/** @returns {FlightBody} */
export function createFlightBody() {
  return { x: 0, y: 0, z: 0, heading: 0, vx: 0, vy: 0, vz: 0, agl: 0, launchY: 0, t: 0, lift: 0, windOver: 0, windBearing: 45,
    grounded: false, forced: false, landVs: 0, landDamage: 0, refusedWater: false, downFromY: 0, downT: 0,
    hasShore: false, shoreX: 0, shoreZ: 0, waterTurn: false, carried: false };
}

/**
 * Can Space open the kite now? (KF4, KF5)
 * @param {{ airborneS: number, clearM: number, weather?: string, state?: FlightState, w?: { calima?: number, rain?: number } | null }} q
 * @returns {{ ok: boolean, why: '' | 'not-airborne' | 'too-low' | 'weather' | 'busy', note?: string }}
 */
export function canOpen({ airborneS, clearM, weather = 'trade', state = 'none', w = null }) {
  if (state !== 'none') return { ok: false, why: 'busy' };
  if (!flyableIn(weather, w)) return { ok: false, why: 'weather', note: GROUNDED_NOTE[weather === 'calima' || (w?.calima ?? 0) > GROUNDED_WEIGHT.calima ? 'calima' : 'squall'] };
  if (!(airborneS >= KITE.openAirborneS)) return { ok: false, why: 'not-airborne' };
  if (!(clearM >= KITE.openClearM)) return { ok: false, why: 'too-low' };
  return { ok: true, why: '' };
}

/** @param {number} deg */
export const bearingDir = (deg) => { const r = deg * Math.PI / 180; return { x: Math.sin(r), z: -Math.cos(r) }; };
/** deg clockwise from north of an engine direction */
export const dirBearing = (/** @type {number} */ x, /** @type {number} */ z) => ((Math.atan2(x, -z) * 180 / Math.PI) % 360 + 360) % 360;

/**
 * The world the law reads. Every member is the game's own seam, injected so Node and the page step the same code.
 * @typedef {object} FlightWorld
 * @property {(x: number, z: number, out: {x: number, z: number}) => number} windAt  environment.windAt (velocity into out)
 * @property {(x: number, y: number, z: number) => number} liftAt   m/s of rise, 0 where there is none
 * @property {(x: number, z: number) => number} groundAt  ground height (m)
 * @property {(x: number, z: number) => number} [waterDepthAt]  m of water over the ground (0 on land)
 * @property {() => boolean} flyable  false in calima and squall
 */

/**
 * The input of one step. `bank` turns (-1 left .. 1 right); `fold` asks for the fold.
 * @typedef {{ bank?: number, fold?: boolean }} FlightInput
 */

/**
 * Open the kite on a body at a point (the request: `state` becomes 'opening' and the glide starts after KITE.openS).
 * Call only after `canOpen` said yes.
 * @param {FlightBody} f
 * @param {{ x: number, y: number, z: number, headingDeg: number, groundY: number }} at
 * @returns {FlightState}
 */
export function openAt(f, { x, y, z, headingDeg, groundY }) {
  f.x = x; f.y = y; f.z = z; f.heading = headingDeg * Math.PI / 180;
  f.vx = 0; f.vy = 0; f.vz = 0; f.agl = y - groundY; f.launchY = y; f.t = 0; f.lift = 0;
  f.grounded = false; f.forced = false; f.landVs = 0; f.landDamage = 0; f.refusedWater = false; f.downFromY = 0; f.downT = 0;
  // the shore she knows: the first step reads the ground she opened over (integrate)
  f.hasShore = false; f.shoreX = x; f.shoreZ = z; f.waterTurn = false; f.carried = false;
  return 'opening';
}

const _w = { x: 0, z: 0 };

/** The surface she lands on: the ground, or the water's surface over it. @param {FlightWorld} world @param {number} x @param {number} z */
const floorAt = (world, x, z) => world.groundAt(x, z) + (world.waterDepthAt ? world.waterDepthAt(x, z) : 0);

/**
 * Fall damage for a touchdown at `vs` m/s vertical, by the player's existing rule (player.js `_land`: free under a 4 m
 * fall, lethal over 9, gravity 22 m/s^2), read as the fall height that gives that speed. 0 at or under KITE.safeLandVs.
 * @param {number} vs
 * @param {{ gravity?: number, fallSafe?: number, fallLethal?: number, maxHp?: number }} [rule]
 */
export function landingDamage(vs, { gravity = 22, fallSafe = 4, fallLethal = 9, maxHp = 100 } = {}) {
  if (!(vs > KITE.safeLandVs)) return 0;
  const h = vs * vs / (2 * gravity);
  if (h > fallLethal) return maxHp + 50;
  if (h > fallSafe) return ((h - fallSafe) / (fallLethal - fallSafe)) * 62;
  return 0;
}

/**
 * One step of flight. Returns the state after the step.
 * @param {FlightState} state
 * @param {FlightBody} f
 * @param {FlightInput} input
 * @param {FlightWorld} world
 * @param {number} dt s
 * @returns {FlightState}
 */
export function stepFlight(state, f, input, world, dt) {
  if (state === 'none') return state;
  f.t += dt;
  if (state === 'opening') {
    // the kite leaves the case and fills; she keeps her jump's fall (the page's own physics) until the sling takes her
    // weight: the law moves her at the glide's still-air numbers from the request so the open has no hitch in Node
    integrate(f, input, world, dt, true);
    // R5: the weather forces the fold (a reef) from the open as from the glide
    if (!f.grounded && !world.flyable()) { forceFold(f); return 'folding'; }
    if (f.t >= KITE.openS) { f.t = 0; return 'gliding'; }
    return 'opening';
  }
  if (state === 'folding') {
    integrate(f, input, world, dt, false);
    // the forced fold (R5) is a reef held to the ground: it ends at touchdown, never in the air
    if (f.forced) return f.agl <= 0 ? touchdown(f, world) : 'folding';
    if (f.t >= KITE.foldS) { f.t = 0; return 'none'; }   // hands free; the page's gravity takes her from here
    return 'folding';
  }
  if (state === 'landing') {
    if (f.carried) {
      // down on water past the contour: the current carries her to the last ground she crossed inside it
      const dx = f.shoreX - f.x, dz = f.shoreZ - f.z, d = Math.hypot(dx, dz), step = Math.min(d, KITE.waterCarryMs * dt);
      f.vx = d > 1e-6 ? dx / d * KITE.waterCarryMs : 0; f.vz = d > 1e-6 ? dz / d * KITE.waterCarryMs : 0; f.vy = 0;
      if (d > 1e-6) { f.x += dx / d * step; f.z += dz / d * step; }
      f.y = floorAt(world, f.x, f.z); f.agl = 0; f.t = 0;
      if (depthAt(world, f.x, f.z) <= KITE.waterContourM || d <= 1e-6) { f.carried = false; f.vx = 0; f.vz = 0; }
      return 'landing';
    }
    // feet down: the run-out (it stops at the contour: the current turns her)
    const k = Math.max(0, 1 - dt * 6);
    f.vx *= k; f.vz *= k; f.vy = 0;
    const nx = f.x + f.vx * dt, nz = f.z + f.vz * dt;
    if (depthAt(world, nx, nz) <= KITE.waterContourM) { f.x = nx; f.z = nz; } else { f.vx = 0; f.vz = 0; }
    f.y = floorAt(world, f.x, f.z); f.agl = 0;
    if (f.t >= KITE.landS) { f.t = 0; return 'none'; }
    return 'landing';
  }
  // gliding
  if (input.fold) { f.t = 0; return 'folding'; }
  // R5: calima or squall forces the fold on the step it is read (the bar is <= KITE.forcedFoldS)
  if (!f.grounded && !world.flyable()) { forceFold(f); return 'folding'; }
  integrate(f, input, world, dt, true);
  if (f.agl <= 0) return touchdown(f, world);
  return 'gliding';
}

/** R5: the weather grounds the kite in the air: the forced fold (the reef) starts now. @param {FlightBody} f */
function forceFold(f) {
  f.grounded = true; f.forced = true; f.downFromY = f.y; f.downT = 0; f.t = 0;
}

/**
 * Feet down: the touchdown's speed and damage; past the water contour no landing (the current carries her to the last
 * ground she crossed inside it). @param {FlightBody} f @param {FlightWorld} world @returns {FlightState}
 */
function touchdown(f, world) {
  f.landVs = -Math.min(0, f.vy);
  f.landDamage = landingDamage(f.landVs);
  if (depthAt(world, f.x, f.z) > KITE.waterContourM) {
    f.refusedWater = true;
    f.carried = f.hasShore;
  }
  f.y = floorAt(world, f.x, f.z); f.agl = 0; f.t = 0;
  return 'landing';
}

/** m of water over the ground (0 on land). @param {FlightWorld} world @param {number} x @param {number} z */
const depthAt = (world, x, z) => (world.waterDepthAt ? world.waterDepthAt(x, z) : 0);

/**
 * @param {FlightBody} f @param {FlightInput} input @param {FlightWorld} world @param {number} dt @param {boolean} flying
 */
function integrate(f, input, world, dt, flying) {
  if (depthAt(world, f.x, f.z) <= KITE.waterContourM) { f.hasShore = true; f.shoreX = f.x; f.shoreZ = f.z; }
  let bank = Math.max(-1, Math.min(1, input.bank || 0));
  // low over water past the contour she turns for the last ground she crossed inside it (her hand on the bar is
  // overruled: the bible's "the current turns her" starts in the air, so she comes down where she may land)
  f.waterTurn = false;
  if (flying && f.hasShore && f.y - floorAt(world, f.x, f.z) < KITE.waterTurnAglM && depthAt(world, f.x, f.z) > KITE.waterContourM) {
    const want = Math.atan2(f.shoreX - f.x, -(f.shoreZ - f.z));
    let d = want - f.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    bank = Math.max(-1, Math.min(1, d * 3)); f.waterTurn = true;
  }
  f.heading += bank * KITE.turnRate * dt;
  const hx = Math.sin(f.heading), hz = -Math.cos(f.heading);
  const ws = world.windAt(f.x, f.z, _w);
  f.windBearing = Math.round(dirBearing(-_w.x, -_w.z)) % 360;   // the wind comes FROM the opposite of its velocity
  const air = flying ? KITE.air : KITE.air * 0.6;
  f.vx = hx * air + KITE.windK * _w.x;
  f.vz = hz * air + KITE.windK * _w.z;
  f.windOver = +(KITE.windK * ws).toFixed(3);
  const g0 = floorAt(world, f.x, f.z);
  let vy = -KITE.sink;
  let lift = 0;
  if (flying && !f.grounded) {
    lift = Math.max(0, world.liftAt(f.x, f.y, f.z));
    // the bible's band (+0.5 to +1.5 m/s) is her CLIMB in lift, as the read-out shows it (LIFT +0.8): in lift she rises
    // at `lift` instead of sinking. The cap: never above launch + 25 m; the climb fades over the last 2 m, so she holds
    // at the cap rather than bouncing on it
    const room = f.launchY + KITE.liftCapM - f.y;
    lift *= Math.max(0, Math.min(1, room / KITE.liftFadeM));
    if (lift > 0) vy = Math.max(vy, lift);
    // the flare: in the last metres over the ground the sink is held under the safe landing speed
    if (f.y - g0 < KITE.landAglM && vy < -KITE.flareSink) vy = -KITE.flareSink;
  } else if (f.grounded) {
    // brought down (lift is ignored: the air will not hold the kite): she gains sink no faster than a fall, to at most
    // downMaxVs, and the kite brakes her at downBrake so she meets the flare's height at the flare's sink
    f.downT += dt;
    const agl = f.y - g0, vf = KITE.groundedFlareSink;
    const want = agl <= KITE.groundedFlareM ? vf
      : Math.min(KITE.downMaxVs, Math.sqrt(vf * vf + 2 * KITE.downBrake * (agl - KITE.groundedFlareM)));
    const now = -f.vy;
    vy = -(want >= now ? Math.min(want, now + KITE.downAcc * dt) : Math.max(want, now - KITE.downBrake * dt));
  }
  if (!flying && !f.grounded) vy = -KITE.sink * 1.6;   // folding: the fill goes out of it
  f.lift = +lift.toFixed(3);
  f.vy = vy;
  f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
  f.agl = f.y - floorAt(world, f.x, f.z);
  if (depthAt(world, f.x, f.z) <= KITE.waterContourM) { f.hasShore = true; f.shoreX = f.x; f.shoreZ = f.z; }
}

/**
 * The read-out's two numbers (BIBLE §18: `WIND 045 · 5 m/s` · `LIFT +0.8`): the wind's bearing in three digits and its
 * speed over the ground, and the climb or sink. Strings only from src/game/text/ once ui lands kiteread.js.
 * @param {FlightBody} f
 */
export function readOut(f) {
  return { windBearing: String(f.windBearing).padStart(3, '0'), windMs: Math.round(f.windOver / KITE.windK), lift: +(f.vy).toFixed(1) };
}

/**
 * Holding a GROUND TRACK on a bearing in a steady wind (no lift): she crabs into the cross-wind so the 0.4 x wind's
 * share across the track is cancelled, and her ground speed is what is left along it (area A's lift rows read the
 * same). Returns the glide ratio over the ground, the ground speed, the heading she flies and the crab angle; null
 * when the cross-wind is stronger than her air speed.
 * @param {number} trackDeg @param {number} windMs @param {number} [windFromDeg]
 */
export function trackGlide(trackDeg, windMs, windFromDeg = 45) {
  const t = bearingDir(trackDeg), w = bearingDir(windFromDeg + 180);
  const wx = KITE.windK * windMs * w.x, wz = KITE.windK * windMs * w.z;
  const along = wx * t.x + wz * t.z, across = wx * -t.z + wz * t.x;   // across: + to the track's left
  const s = -across / KITE.air;
  if (Math.abs(s) >= 1) return null;
  const crab = Math.asin(s), ground = KITE.air * Math.cos(crab) + along;
  const hx = t.x * Math.cos(crab) - t.z * Math.sin(crab), hz = t.z * Math.cos(crab) + t.x * Math.sin(crab);
  return { ratio: ground / KITE.sink, groundMs: ground, headingDeg: dirBearing(hx, hz), crabDeg: crab * 180 / Math.PI };
}

/**
 * Glide ratio over the ground for a steady flight on a HEADING in a steady wind (no lift): ground speed / sink. The wind
 * sets her off that heading's line; `trackGlide` is the ratio holding a track.
 * @param {number} headingDeg @param {number} windMs @param {number} windFromDeg
 */
export function glideRatio(headingDeg, windMs, windFromDeg = 45) {
  const h = bearingDir(headingDeg), w = bearingDir(windFromDeg + 180);
  const gx = h.x * KITE.air + KITE.windK * windMs * w.x, gz = h.z * KITE.air + KITE.windK * windMs * w.z;
  return Math.hypot(gx, gz) / KITE.sink;
}

/**
 * KF8, the seam's two reads for other lanes: an Instrument that sees by sight (a Plumb, a Sonde) sees a GLIDING Brea at
 * double range, and at x1.0 in every other state (the brief §3.2: "doubles Plumb and Sonde range while `gliding`";
 * area C's src/instruments/kinds/sonde/rules.js reads 'gliding' alone; this is the seam's one definition, for it to
 * import). No weapon verb answers while the flight state is not 'none' (combat reads it when the kite opens in play,
 * wave 3: nothing opens it before then).
 * @param {FlightState} state
 */
export const sightRangeMul = (state) => (state === 'gliding' ? 2.0 : 1.0);
/** @param {FlightState} state */
export const weaponVerbsAllowed = (state) => state === 'none';
