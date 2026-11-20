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
  /** s from the request to her weight on the sling (KF4: 400-600 ms*) */
  openS: 0.5,
  /** s from the fold's request to hands free (KF4: <= 400 ms*) */
  foldS: 0.35,
  /** m over the ground at which a glide becomes a landing (the flare) */
  landAglM: 1.2,
  /** s the landing takes once the feet are down (planted inside 2 steps at 7.5 m/s is under 0.6 s) */
  landS: 0.4,
  /** m/s vertical at or under which a landing is free */
  safeLandVs: 3,
  /** m/s of sink the flare holds in the last `landAglM` (under safeLandVs) */
  flareSink: 1.0,
  /** grounded mid-air (calima or squall arrives): down inside this many s* (KF5), never faster than `downMaxVs` */
  groundedDownS: 5,
  downMaxVs: 14,
  /** m/s of sink in the brought-down flare (under safeLandVs) */
  groundedFlareSink: 2.5,
  /** rad/s of turn at full bank */
  turnRate: 0.9,
  /** the water contour past which a landing is refused (BIBLE: wading to 1.2 m; the current turns her at 1.1) */
  waterContourM: 1.1,
});

/** Weather states that ground the kite (BIBLE §3.2: calima and squall). */
export const GROUNDING_WEATHER = Object.freeze(['calima', 'squall']);

/**
 * The kite flies in this weather. `environment.js` (sky-look) owns the seam's `flyable()`; until it exports one, the
 * page calls this with `environment.weather`.
 * @param {string | null | undefined} weather
 */
export function flyableIn(weather) {
  return !GROUNDING_WEATHER.includes(String(weather || 'trade'));
}

/**
 * The bible's field note when an open is refused because the weather grounds the kite. The words live in
 * src/game/text/ once the writing area lands them; this is the blockout's line.
 */
export const GROUNDED_NOTE = Object.freeze({ calima: 'Calima. The air will not hold the kite.', squall: 'Squall. The air will not hold the kite.' });

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
 * @property {number} landVs    m/s vertical at the last touchdown
 * @property {number} landDamage hp taken at the last touchdown (0 at or under KITE.safeLandVs)
 * @property {boolean} refusedWater the last landing was turned back from water past the contour
 * @property {number} downFromY height at the moment the weather grounded it
 */

/** @returns {FlightBody} */
export function createFlightBody() {
  return { x: 0, y: 0, z: 0, heading: 0, vx: 0, vy: 0, vz: 0, agl: 0, launchY: 0, t: 0, lift: 0, windOver: 0, windBearing: 45,
    grounded: false, landVs: 0, landDamage: 0, refusedWater: false, downFromY: 0 };
}

/**
 * Can Space open the kite now? (KF4, KF5)
 * @param {{ airborneS: number, clearM: number, weather?: string, state?: FlightState }} q
 * @returns {{ ok: boolean, why: '' | 'not-airborne' | 'too-low' | 'weather' | 'busy', note?: string }}
 */
export function canOpen({ airborneS, clearM, weather = 'trade', state = 'none' }) {
  if (state !== 'none') return { ok: false, why: 'busy' };
  if (!flyableIn(weather)) return { ok: false, why: 'weather', note: GROUNDED_NOTE[/** @type {'calima'|'squall'} */ (weather)] };
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
  f.grounded = false; f.landVs = 0; f.landDamage = 0; f.refusedWater = false; f.downFromY = 0;
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
    if (!world.flyable()) { f.grounded = true; f.downFromY = f.y; }
    if (f.t >= KITE.openS) { f.t = 0; return 'gliding'; }
    return 'opening';
  }
  if (state === 'folding') {
    integrate(f, input, world, dt, false);
    if (f.t >= KITE.foldS) { f.t = 0; return 'none'; }   // hands free; the page's gravity takes her from here
    return 'folding';
  }
  if (state === 'landing') {
    // feet down: the run-out
    const k = Math.max(0, 1 - dt * 6);
    f.vx *= k; f.vz *= k; f.vy = 0;
    f.x += f.vx * dt; f.z += f.vz * dt; f.y = floorAt(world, f.x, f.z); f.agl = 0;
    if (f.t >= KITE.landS) { f.t = 0; return 'none'; }
    return 'landing';
  }
  // gliding
  if (input.fold) { f.t = 0; return 'folding'; }
  if (!f.grounded && !world.flyable()) { f.grounded = true; f.downFromY = f.y; f.t = 0; }
  integrate(f, input, world, dt, true);
  if (f.agl <= 0) {
    // touchdown
    f.landVs = -Math.min(0, f.vy);
    const water = world.waterDepthAt ? world.waterDepthAt(f.x, f.z) : 0;
    if (water > KITE.waterContourM) {
      // the current turns her: she is put back up the slope she came from at the contour and lands there
      f.refusedWater = true;
      f.heading += Math.PI;
    }
    f.landDamage = landingDamage(f.landVs);
    f.y = floorAt(world, f.x, f.z); f.agl = 0; f.t = 0;
    return 'landing';
  }
  return 'gliding';
}

/**
 * @param {FlightBody} f @param {FlightInput} input @param {FlightWorld} world @param {number} dt @param {boolean} flying
 */
function integrate(f, input, world, dt, flying) {
  const bank = Math.max(-1, Math.min(1, input.bank || 0));
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
    // brought down: a steep descent that reaches the ground inside KITE.groundedDownS of the weather arriving, then the
    // flare (lift is ignored: the air will not hold the kite)
    const agl = f.y - g0;
    const left = Math.max(0.3, KITE.groundedDownS - 0.8 - f.t);
    vy = -Math.min(KITE.downMaxVs, Math.max(KITE.sink, agl / left));
    if (agl < KITE.landAglM + 0.3) vy = -KITE.groundedFlareSink;
  }
  if (!flying && !f.grounded) vy = -KITE.sink * 1.6;   // folding: the fill goes out of it
  f.lift = +lift.toFixed(3);
  f.vy = vy;
  f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
  f.agl = f.y - floorAt(world, f.x, f.z);
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
 * Glide ratio over the ground for a steady flight on a bearing in a steady wind (no lift): ground speed / sink.
 * @param {number} headingDeg @param {number} windMs @param {number} windFromDeg
 */
export function glideRatio(headingDeg, windMs, windFromDeg = 45) {
  const h = bearingDir(headingDeg), w = bearingDir(windFromDeg + 180);
  const gx = h.x * KITE.air + KITE.windK * windMs * w.x, gz = h.z * KITE.air + KITE.windK * windMs * w.z;
  return Math.hypot(gx, gz) / KITE.sink;
}

/**
 * KF8, the seam's two reads for other lanes: an Instrument that sees by sight (a Plumb, a Sonde) sees a GLIDING Brea at
 * double range, and at x1.0 the step she lands; no weapon verb answers while the flight state is not 'none'.
 * @param {FlightState} state
 */
export const sightRangeMul = (state) => (state === 'gliding' || state === 'opening' || state === 'folding' ? 2.0 : 1.0);
/** @param {FlightState} state */
export const weaponVerbsAllowed = (state) => state === 'none';
