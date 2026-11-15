/**
 * STRINGS — the one door from the game's code to `src/game/text/` (BUILD M1.6a: "every string comes from
 * src/game/text/"). Pure: no DOM, no THREE, safe in node. The browser build hands the parsed JSON in through
 * `src/game/text.js`; node tests read the same files from disk (`tools/gates/systems/lib.mjs`).
 *
 *   fill(template, vars)   '{n} / {of}' and '{key:alidade}' placeholders (src/game/text/index.json)
 *   bearing3(deg)          a bearing as three digits, the compass strip's form
 *   makeStrings(text)      { quest, tutorial, sighting, systems, speakers, card(id), turn(on), scene(id), stage(id) }
 */

/** A bearing in degrees as three digits ('045'). */
export function bearing3(deg) {
  const d = ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
  return String(d).padStart(3, '0');
}

/** Default key caps for `{key:NAME}` when no input layer is given (src/core/input.js DEFAULT_BINDS, sighting V). */
export const DEFAULT_KEYS = Object.freeze({
  alidade: 'V', bearing: 'T', steady: 'SHIFT', interact: 'E', crouch: 'C', slot: '1', pry: 'E',
});

/**
 * Fill placeholders. `vars` may carry n, of, bearing, name, place, hour, speed and `keys` (action -> cap).
 * An unknown placeholder is left as written, so a missing value is visible rather than silently blank.
 */
export function fill(template, vars = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{(key:)?([a-zA-Z0-9]+)\}/g, (all, isKey, name) => {
    if (isKey) {
      const k = vars.keys?.[name] ?? DEFAULT_KEYS[name];
      return k ? String(k) : all;
    }
    const v = vars[name];
    if (v === undefined || v === null) return all;
    return name === 'bearing' ? bearing3(v) : String(v);
  });
}

/** Index the writing so code asks for a line by id, never by text. */
export function makeStrings(text) {
  const quest = text.quest;
  const stages = new Map(quest.stages.map((s) => [s.id, s]));
  const scenes = new Map(quest.scenes.map((s) => [s.id, s]));
  const turns = new Map();
  for (const c of quest.breaAlone.cards) if (!turns.has(c.on)) turns.set(c.on, c);
  const cards = new Map(text.tutorial.cards.map((c) => [c.id, c]));
  const sightings = new Map(text.sighting.cards.map((c) => [c.id, c]));
  return {
    text,
    quest,
    speakers: text.index.speakers,
    systems: text.systems,
    stage: (id) => stages.get(id) ?? null,
    scene: (id) => scenes.get(id) ?? null,
    turn: (on) => turns.get(on) ?? null,
    card: (id) => cards.get(id) ?? null,
    sighting: (id) => sightings.get(id) ?? null,
    hasTurn: (on) => turns.has(on),
  };
}
