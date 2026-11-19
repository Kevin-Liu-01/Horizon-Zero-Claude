/**
 * THE SAVE SEAM (Milestone 2, the shared seams). Owner: systems. One versioned record (src/game/save/format.js);
 * each area hands systems a plain `{ get, set }` pair for its state and no area writes storage.
 *
 *   const F = saveFieldsOf(ctx)                            the game's one (ctx.saveFields), made on first use
 *   F.register('walls', { get: () => plain, set: (plain | null) => void })   an area, once, at install
 *   F.collect()              -> { walls: plain, ... }      what a record's `areas` carries (only registered ids)
 *   F.apply(areas | null)                                  each registered setter with its plain state, or null
 *                                                          (a record without that field: a fresh state, Q5)
 *
 * The record's `areas` is optional in v6 (as `sites` was for the site clock), so a slice save from Milestone 1b
 * carries forward into "The Scar" with every Milestone 2 field fresh (the owner's question Q5, its default) and
 * format.js needs no version step. Field ids are fixed here; an unknown id is refused, so two areas never write
 * the same field under two names.
 *
 * Pure: no DOM, no ctx. node --test: tools/gates/systems/save-fields.test.mjs.
 */

/**
 * @typedef {{ get: () => any, set: (state: any) => void }} FieldPair
 */

/**
 * The Milestone 2 fields and their owners (HR7). The plain shape inside each is its owner's (the pair's get() return);
 * the notes below are what each is expected to carry, the owner's file is the truth (settlements' wallsSave(), for one).
 */
export const AREA_FIELDS = Object.freeze({
  /** settlements: the nine walls, cut or whole and painted or not (wallsSave(): `{ cut: [id], painted: [id] }`) */
  walls: Object.freeze({ owner: 'settlements', file: 'src/world/settlements/ninewalls-layout.js' }),
  /** world: benchmarks re-surveyed, `{ [benchmarkId]: { surveyed: boolean, hour: number } }` */
  benchmarks: Object.freeze({ owner: 'world', file: 'src/world/sites/layout.js' }),
  /** combat and armory: kit owned beyond the bow and lance, `{ gaff: bool, windwall: bool, pots: { brine, cinder } }` */
  kit: Object.freeze({ owner: 'combat', file: 'src/combat/**' }),
  /** systems: each region's truth, `{ [regionId]: { true: boolean, hour: number } }` (src/core/regions.js ids) */
  regions: Object.freeze({ owner: 'systems', file: 'src/game/**' }),
  /** systems: "The Scar" and "True Ground" (src/game/quest/scar-plan.js), the spine's serialize() of each */
  quests: Object.freeze({ owner: 'systems', file: 'src/game/quest/**' }),
  /** systems (wave 4, HR11): the certifications' counted acts and ranks, src/game/certs/rules.js serialize() */
  certs: Object.freeze({ owner: 'systems', file: 'src/game/certs/**' }),
  /** systems (wave 4, HR10): the Ninewalls counter (open, its stock) and the Guild Notices taken, src/game/trade/counter.js */
  counter: Object.freeze({ owner: 'systems', file: 'src/game/trade/**' }),
});

const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export class SaveFields {
  constructor() {
    /** @type {Map<string, FieldPair>} */
    this.pairs = new Map();
  }

  /** @param {string} id one of AREA_FIELDS @param {FieldPair} pair */
  register(id, pair) {
    if (!AREA_FIELDS[id]) throw new Error(`save field '${id}' is not one of ${Object.keys(AREA_FIELDS).join(', ')}`);
    if (typeof pair?.get !== 'function' || typeof pair?.set !== 'function') throw new Error(`save field '${id}' needs { get, set }`);
    if (this.pairs.has(id)) throw new Error(`save field '${id}' is registered twice`);
    this.pairs.set(id, pair);
    return () => this.pairs.delete(id);
  }

  /** Plain JSON of every registered field (sorted keys, so a record is JSON-stable). A getter that throws is null. */
  collect() {
    const out = {};
    for (const id of [...this.pairs.keys()].sort()) {
      try { out[id] = clone(this.pairs.get(id).get()); } catch (err) { console.warn(`[CAL] save field ${id}: get threw:`, err?.message || err); out[id] = null; }
    }
    return out;
  }

  /** Hand each registered area its state from a record's `areas` (null when absent: a fresh state). */
  apply(areas) {
    for (const [id, pair] of this.pairs) {
      const v = areas && Object.prototype.hasOwnProperty.call(areas, id) ? clone(areas[id]) : null;
      try { pair.set(v); } catch (err) { console.warn(`[CAL] save field ${id}: set threw:`, err?.message || err); }
    }
  }
}

/** Normalise a record's `areas` for format.js makeRecord: only known ids, plain JSON, or null. */
export function normaliseAreas(areas) {
  if (!areas || typeof areas !== 'object') return null;
  const out = {};
  for (const id of Object.keys(areas).sort()) if (AREA_FIELDS[id]) out[id] = clone(areas[id]);
  return Object.keys(out).length ? out : null;
}

/**
 * The game's one SaveFields, created on first use, so an area constructed before the systems runtime (settlements,
 * machines, combat) registers from its own constructor: `saveFieldsOf(ctx).register('walls', { get, set })`.
 */
export function saveFieldsOf(ctx) {
  if (!ctx.saveFields) ctx.saveFields = new SaveFields();
  return ctx.saveFields;
}
