import { fill } from '../strings.js';

/**
 * THE BRAZIER — rules (BUILD M1.6c; BIBLE 17 "Rest and save", 18 "Brazier rest"). Pure: node --test runs them
 * (tools/gates/systems/brazier.test.mjs). The mesh is `src/world/settlements/brazier.js`; the runtime that sits
 * Brea down, fades the hour, writes the named save and refills the Gourds is `src/game/brazier/braziers.js`.
 *
 *   1. Interact to sit; choose REST UNTIL DAWN / GOLDEN / DUSK / NIGHT; the world fades to that hour.
 *   2. Rest chooses the hour, not the weather: the dialog shows the forecast for that hour in one line.
 *   3. Resting writes the named save and refills the fog-water Gourds.
 *   4. Refused while any Instrument within 60 m is wary or hostile: THE LAMPS ARE UP. NO REST HERE.
 *   5. A Brazier is kindled once (E, 2 s) and stays lit for the rest of the save.
 *
 * The six UI strings are the bible's words and live in src/game/text/ui/systems.json (`brazier.six`).
 */
export const REFUSE_RADIUS = 60;
export const KINDLE_HOLD = 2.0;
/** The four hours a rest can choose (decimal hours; golden is the title's 18:40, dusk the bible's 19:45). */
export const REST_HOURS = Object.freeze({ dawn: 7.0, golden: 18.67, dusk: 19.75, night: 23.0 });
export const REST_ORDER = Object.freeze(['dawn', 'golden', 'dusk', 'night']);

/** The Braziers of the slice. `home` is Brea's cistern (a New Game counts as a rest there; BIBLE 17). */
export const BRAZIERS = Object.freeze([
  Object.freeze({ id: 'cistern', home: true, litAtStart: true, locked: false }),
  Object.freeze({ id: 't1', home: false, litAtStart: false, locked: true }),
]);

/** Is any Instrument within REFUSE_RADIUS of (x, z) wary or hostile? machines: [{ x, z, lamp }] */
export function refusedBy(x, z, machines, radius = REFUSE_RADIUS) {
  const r2 = radius * radius;
  for (const m of machines || []) {
    if (!m) continue;
    const lamp = m.lamp;
    if (lamp !== 'wary' && lamp !== 'hostile') continue;
    const dx = m.x - x, dz = m.z - z;
    if (dx * dx + dz * dz <= r2) return m;
  }
  return null;
}

/**
 * The forecast line for an hour. weather: { state ('trade'|'calima'|'squall'|...), windFrom (deg), speed (m/s),
 * calimaAt? (decimal hour the calima is due, or null) }. Templates from systems.json `forecast`.
 */
export function forecastLine(T, hour, weather = {}) {
  const f = T.forecast;
  const state = weather.state || 'trade';
  const speed = Math.max(0, Math.round(Number(weather.speed ?? 5)));
  const bearing = Number(weather.windFrom ?? 45);
  if (weather.calimaAt != null && hour < weather.calimaAt && weather.calimaAt <= 12.5) return f.calimaSoon;
  if (state === 'calima') return fill(f.calima, { speed });
  if (state === 'squall') return fill(f.squall, { bearing, speed });
  return fill(f.trade, { bearing, speed });
}

/**
 * What the dialog shows for this Brazier right now: the prompt, and either the refusal or the four rest rows
 * with their forecast. state: { lit:Set, x, z, machines, weather }.
 */
export function dialogFor(T, brazier, state) {
  const six = T.brazier.six;
  const lit = state.lit?.has?.(brazier.id);
  if (!lit) {
    return { mode: brazier.locked && !state.unlocked?.has?.(brazier.id) ? 'locked' : 'kindle', prompt: six.kindle, rows: [] };
  }
  const by = refusedBy(state.x, state.z, state.machines);
  if (by) return { mode: 'refused', prompt: T.brazier.promptLit, line: six.refused, rows: [], by };
  return {
    mode: 'rest',
    prompt: T.brazier.promptLit,
    rows: REST_ORDER.map((k) => ({ id: k, label: six[k], hour: REST_HOURS[k], forecast: forecastLine(T, REST_HOURS[k], state.weather) })),
  };
}

/** Every UI string a Brazier can print, for the "exactly the bible's six" row. */
export function brazierStrings(T) {
  const six = T.brazier.six;
  return [six.kindle, six.dawn, six.golden, six.dusk, six.night, six.refused];
}
