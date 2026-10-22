/**
 * Instrument perception by weather and hour (instruments-core W0b; bible §2.3;
 * gate `A-perception-weather`).
 *
 * Plain functions, no three.js: read by `ai/perception.js` (sight range), by
 * `lamps.js` (beam length) and by the gates in node and in the page.
 *
 *   perceptionScale(env) -> number   0..1, multiplies every Instrument's sight range
 *   weatherName(env)     -> string   the weather the scale was read from
 *
 * THE CONTRACT WITH world-sky. world-sky publishes `environment.perceptionScale`
 * (a number) with its `trade / calima / fogbank / squall` states at W1 (E12).
 * When that number exists it is authoritative. Until then the bible §2.3 table
 * is applied by the weather's NAME (`environment.weather`), and night (any
 * weather) is 0.7; the smaller of the two applies. No edit to `environment.js`.
 */

/** Bible §2.3 by weather name. The Round-4 names map onto their CALIMA equivalents. */
export const WEATHER_PERCEPTION = Object.freeze({
  trade: 1.0, clear: 1.0, overcast: 1.0,
  calima: 0.5, fogbank: 0.5,
  squall: 0.8, rain: 0.8, storm: 0.8,
});

/** Night (19:45–05:30, any weather): lamps rule the frame. */
export const NIGHT_PERCEPTION = 0.7;

export function weatherName(env) {
  return (env && typeof env.weather === 'string') ? env.weather : 'trade';
}

export function perceptionScale(env) {
  if (!env) return 1;
  const own = env.perceptionScale;
  if (typeof own === 'number' && Number.isFinite(own)) return Math.max(0, Math.min(1, own));
  const w = WEATHER_PERCEPTION[weatherName(env)] ?? 1;
  const nf = Math.min(1, Math.max(0, env.nightFactor || 0));
  const n = 1 + (NIGHT_PERCEPTION - 1) * nf;
  return Math.min(w, n);
}
