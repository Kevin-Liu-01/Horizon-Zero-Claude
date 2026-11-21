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
/**
 * Milestone 2 (HR5; bible 11.2 0:50): ONE rest in the game offers noon, pre-selected: the first at the Ninewalls cistern,
 * while "True Ground" waits on it ('rest-noon'). The row is written apart from the bible's six (systems.json
 * `brazier.noon`), first in the list so the dialog's selection line stands on it; every other rest shows the four.
 */
export const NOON = 'noon';
export const NOON_HOUR = 12.0;
/**
 * (M2 fix wave, HR6) The hour the noon rest wakes her: the first of the beat's window (12:00 +- 0:30, BUILD M2.9). At
 * fa45e47 she woke at 12:00 and the walk from this Brazier to the Malpais edge (about 210 m and 75 m of climb) took 64 s
 * of play, 0.78 game hours on the clock: she stood at the edge at 12:51, after the window closed, and the Transit was not
 * drawn. Woken at 11:30 the calima is asked for at once and she reads the far form near noon.
 */
export const NOON_WAKE = 11.5;

/** The Braziers of the slice. `home` is Brea's cistern (a New Game counts as a rest there; BIBLE 17). */
export const BRAZIERS = Object.freeze([
  Object.freeze({ id: 'cistern', home: true, litAtStart: true, locked: false }),
  Object.freeze({ id: 't1', home: false, litAtStart: false, locked: true }),
  // Milestone 2: the Ninewalls cistern's (settlements' PLACES.brazier); unlocked when "True Ground" reaches 'rest-noon'
  Object.freeze({ id: 'ninewalls', home: false, litAtStart: false, locked: true }),
  // Milestone 3 (wave 3c, area E): the Malpais tube shelter's (BIBLE §3.4; its spot malpais-layout.js TUBE_SHELTER.brazier),
  // the rest of "The Kiln Yards" ('tube-rest'). Open to kindle from the start, as any Brazier she finds. `region`: its
  // object is the one the Malpais builds on approach (src/world/sites/malpais-region.js), so it stands only while the
  // region does (src/game/brazier/braziers.js adopts it)
  Object.freeze({ id: 'tube-shelter', home: false, litAtStart: false, locked: false, region: 'malpais' }),
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
 * (M2 fix wave 2) How near the calima's hour a row's hour must be for its forecast to be the calima's ("CALIMA BY NOON"):
 * the forecast is the weather at the hour she wakes. At 02f7125 every row before the calima read CALIMA BY NOON, the
 * DAWN row (07:00, five hours before it) too; at dawn the trade still blows.
 */
export const CALIMA_SOON_H = 1.0;

/**
 * The forecast line for an hour. weather: { state ('trade'|'calima'|'squall'|...), windFrom (deg), speed (m/s),
 * calimaAt? (decimal hour the calima is due, or null) }. Templates from systems.json `forecast`.
 */
export function forecastLine(T, hour, weather = {}) {
  const f = T.forecast;
  const state = weather.state || 'trade';
  const speed = Math.max(0, Math.round(Number(weather.speed ?? 5)));
  const bearing = Number(weather.windFrom ?? 45);
  const due = weather.calimaAt;
  if (due != null && hour < due && due - hour <= CALIMA_SOON_H && due <= 12.5) return f.calimaSoon;
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
  const rows = REST_ORDER.map((k) => ({ id: k, label: six[k], hour: REST_HOURS[k], forecast: forecastLine(T, REST_HOURS[k], state.weather) }));
  // the one rest that offers noon (state.noon: the runtime asks the quest), pre-selected: first, so it is the selection
  if (state.noon && T.brazier.noon) rows.unshift({ id: NOON, label: T.brazier.noon, hour: NOON_WAKE, forecast: forecastLine(T, NOON_WAKE, state.weather), preselected: true });
  return { mode: 'rest', prompt: T.brazier.promptLit, rows, ...(state.noon ? { preselect: NOON } : {}) };
}

/** Every UI string a Brazier can print, for the "exactly the bible's six" row. */
export function brazierStrings(T) {
  const six = T.brazier.six;
  return [six.kindle, six.dawn, six.golden, six.dusk, six.night, six.refused];
}
