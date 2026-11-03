/**
 * CALIMA · armor and weapon variants as data (armory W1; bible §4.1–§4.7, §5.2, §5.3).
 *
 * W1 carries the Pan Whites set and Ash Wraps I; W3 adds the rest (rows and perks are
 * data, nothing else changes). R16: a variant's only behaviour is its verb perk,
 * applied through a published hook (loadout.js `PERKS`); no field here can touch
 * `player.speeds`, dodge, jump or slide length.
 *
 *   row     `ctx.assets.models[row]` (boot row, or deferred in rows.js ARMOR_ROWS)
 *   perk    key in PERKS
 *   armor / resist   the small secondary numbers (bible tables)
 */
export const ARMOR = {
  'pan-1': { row: 'heroOutfitPan1', set: 'pan', name: "Pan Whites I — Raker's Whites", perk: 'brineWade', armor: 0.05, resist: { brine: 0.20 } },
  'pan-2': { row: 'armorPan2', set: 'pan', name: 'Pan Whites II — Guild Whites', perk: 'shrug', armor: 0.10, resist: {} },
  'pan-3': { row: 'armorPan3', set: 'pan', name: 'Pan Whites III — Brine-Cured', perk: 'mistFighter', armor: 0.20, resist: { brine: 0.50 } },
  'ash-1': { row: 'armorAsh1', set: 'ash', name: 'Ash Wraps I — Pit Wraps', perk: 'ashStep', armor: 0.08, resist: { dust: 0.20 } },
};
export const DEFAULT_ARMOR = 'pan-1';

/** Weapon variants present at W1 (the 18 land at W3). */
export const WEAPONS = {
  sabina: { cls: 'bow', row: 'armoryBowSabina', name: 'Sabina Bow', length: 1.45, drawTime: 0.65 },
  shepherd: { cls: 'lance', row: 'armoryLanceShepherd', name: "Shepherd's Lance", length: 1.55 },
};
