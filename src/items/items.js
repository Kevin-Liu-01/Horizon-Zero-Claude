/**
 * ITEM CATALOG  —  lane `focus-items` (port 5212)
 * ===========================================================================
 * Single source of truth for item identity:
 *   id -> { name, category, glyph, color, rarity, desc, cap, value, tags }
 *
 * Findings closed here:
 *   ui-14                full-screen pockets need rarity + descriptions + caps
 *   progression-006      capacities (and the upgrades that raise them)
 *   progression-011      three herb variants with distinct values AND colours
 *   ui-11                tools / potions quick-slot DATA (`ctx.items.tools`)
 *
 * Categories drive the inventory pockets:
 *   'resource'  -> RESOURCES pocket (crafting economy)
 *   'valuable'  -> VALUABLES pocket (lenses / hearts / cores / braiding)
 *   'tool'      -> TOOLS pocket + the bottom-left quick-slot strip
 *   'ammo'      -> AMMO pocket is rendered live from ctx.combat, but ammo ids
 *                  still get glyph/color identity here for toasts and lists.
 *
 * Unknown ids never crash: itemDef() synthesizes a sane fallback so other
 * lanes can drop new ids without touching this file.
 *
 * ---------------------------------------------------------------------------
 * PUBLISHED (imported by ui/inventory.js, ui/focus.js, items/inventory.js):
 *   ITEMS · AMMO_INFO · RARITY · CATALOG_ORDER · POCKETS
 *   itemDef(id) · ammoDef(id) · rarityDef(id) · itemCap(id) · itemValue(id)
 *   HERBS  — the three medicinal variants, shared with items/gather.js
 * ---------------------------------------------------------------------------
 */

/* ========================================================================== */
/* 1. RARITY (progression-006 / ui-14 — the frame colour on every item card)  */
/* ========================================================================== */

export const RARITY = {
  common:    { id: 'common',    name: 'COMMON',    rank: 0, color: '#b8b0a0', glow: 'rgba(184,176,160,0.30)' },
  uncommon:  { id: 'uncommon',  name: 'UNCOMMON',  rank: 1, color: '#6fd08c', glow: 'rgba(111,208,140,0.34)' },
  rare:      { id: 'rare',      name: 'RARE',      rank: 2, color: '#4aa8e8', glow: 'rgba(74,168,232,0.38)' },
  veryRare:  { id: 'veryRare',  name: 'VERY RARE', rank: 3, color: '#a97ce8', glow: 'rgba(169,124,232,0.42)' },
  legendary: { id: 'legendary', name: 'LEGENDARY', rank: 4, color: '#f2a93b', glow: 'rgba(242,169,59,0.46)' },
};

export function rarityDef(id) { return RARITY[id] ?? RARITY.common; }

/* ========================================================================== */
/* 2. THE THREE HERB VARIANTS (progression-011)                               */
/* ========================================================================== */

/**
 * "One herb, flat +25" was the finding. Three variants now, each with its own
 * pouch value, colour, rarity and scatter weight. `items/gather.js` builds one
 * instanced bulb mesh per variant from `color`/`bulb`, and `_onGather` reads
 * `pouch` for the refill. Values are deliberately far apart so the player can
 * see a good pick from ten metres through Focus.
 */
export const HERBS = [
  {
    id: 'medicinal-moss', pouch: 12, weight: 0.42,
    color: '#93b984', bulb: [0.42, 1.85, 0.55], scale: 0.82,
  },
  {
    id: 'medicinal-herb', pouch: 25, weight: 0.42,
    color: '#7fb069', bulb: [0.16, 2.40, 0.32], scale: 1.0,
  },
  {
    id: 'medicinal-bloom', pouch: 45, weight: 0.16,
    color: '#e0d264', bulb: [2.10, 1.95, 0.30], scale: 1.16,
  },
];

export const HERB_BY_ID = Object.fromEntries(HERBS.map((h) => [h.id, h]));

/* ========================================================================== */
/* 3. THE CATALOG                                                             */
/* ========================================================================== */

/**
 * `cap`   — pocket capacity (progression-006). `ctx.items.capacity(id)` adds
 *           the purchased upgrade tiers on top of this base.
 * `value` — shard value; the merchant economy (progression) prices against it.
 * `desc`  — the detail-pane line. Written in-world, never as UI instructions.
 */
export const ITEMS = {
  /* ---- resources (crafting economy, docs/research/mechanics.md §3) ---- */
  'metal-shards': {
    name: 'Metal Shards', category: 'resource', glyph: '◆', color: '#aeb9c2',
    rarity: 'common', cap: 500, value: 1, tags: ['currency'],
    desc: 'Torn machine plating, cut down to trading weight. Every Nora deal '
      + 'is counted in shards.',
  },
  'ridge-wood': {
    name: 'Ridge-Wood', category: 'resource', glyph: '☰', color: '#a97c50',
    rarity: 'common', cap: 120, value: 2,
    desc: 'Straight-grained deadfall from the pine stands. Shafts, stakes and '
      + 'trap frames all start here.',
  },
  blaze: {
    name: 'Blaze', category: 'resource', glyph: '◉', color: '#f0a03c',
    rarity: 'common', cap: 100, value: 4,
    desc: 'Machine fuel, drained from a punctured canister. Volatile enough '
      + 'to carry fire down an arrow shaft.',
  },
  chillwater: {
    name: 'Chillwater', category: 'resource', glyph: '✦', color: '#59c1c6',
    rarity: 'common', cap: 100, value: 4,
    desc: 'Coolant bled from a freeze sac. It burns cold, and it makes metal '
      + 'brittle enough to shatter.',
  },
  sparker: {
    name: 'Sparker', category: 'resource', glyph: 'ϟ', color: '#4fa3e3',
    rarity: 'common', cap: 100, value: 4,
    desc: 'A charged cell still holding its last spark. Enough to stun a '
      + 'machine long enough to matter.',
  },
  'echo-shell': {
    name: 'Echo Shell', category: 'resource', glyph: '◎', color: '#cfae6a',
    rarity: 'uncommon', cap: 60, value: 8,
    desc: 'A resonant sensor housing. It rings when struck — useful for '
      + 'anything meant to be heard from a distance.',
  },
  wire: {
    name: 'Wire', category: 'resource', glyph: '∿', color: '#c9a86a',
    rarity: 'common', cap: 100, value: 3,
    desc: 'Braided machine filament. Strong past reason, and the only thing '
      + 'that holds a tripwire under load.',
  },
  blastpaste: {
    name: 'Blastpaste', category: 'resource', glyph: '✸', color: '#e8762c',
    rarity: 'uncommon', cap: 60, value: 10,
    desc: 'Rendered blaze thickened with ash. Handle it gently and it goes '
      + 'where you throw it, not where you stand.',
  },
  'metal-vessel': {
    name: 'Metal Vessel', category: 'resource', glyph: '⬢', color: '#8fa3ad',
    rarity: 'uncommon', cap: 40, value: 12,
    desc: 'An intact machine container. Old-world work; nobody alive knows '
      + 'how to make another one.',
  },

  /* ---- herbs (progression-011: three variants, three values) ---- */
  'medicinal-moss': {
    name: 'Medicinal Moss', category: 'resource', glyph: '❦', color: '#93b984',
    rarity: 'common', cap: 40, value: 2, tags: ['herb'], pouch: 12,
    desc: 'Low creeping moss from shaded rock. Weak medicine, but it grows '
      + 'everywhere the sun does not.',
  },
  'medicinal-herb': {
    name: 'Medicinal Herb', category: 'resource', glyph: '❧', color: '#7fb069',
    rarity: 'common', cap: 40, value: 4, tags: ['herb'], pouch: 25,
    desc: 'The standard leaf of the medicine pouch. Bruise it, pack the '
      + 'wound, keep moving.',
  },
  'medicinal-bloom': {
    name: 'Medicinal Bloom', category: 'resource', glyph: '✿', color: '#e0d264',
    rarity: 'uncommon', cap: 30, value: 12, tags: ['herb'], pouch: 45,
    desc: 'A gold-headed bloom that only opens on open meadow. One handful '
      + 'is worth a whole afternoon of moss.',
  },

  /* ---- tools & potions (ui-11 quick-slot strip) ---- */
  rock: {
    name: 'Rock', category: 'tool', glyph: '◗', color: '#9c968a',
    rarity: 'common', cap: 12, value: 0, tags: ['tool', 'lure'],
    desc: 'A throwing stone. Machines walk toward a noise they cannot see, '
      + 'and away from where you actually are.',
  },
  'potion-vigor': {
    name: 'Vigour Draught', category: 'tool', glyph: '⚱', color: '#7fb069',
    rarity: 'uncommon', cap: 8, value: 30, tags: ['tool', 'potion'],
    desc: 'Boiled bloom and moss. Restores the medicine pouch outright — the '
      + 'pouch itself only ever holds so much.',
  },
  'trap-shock': {
    name: 'Shock Wire Trap', category: 'tool', glyph: '⌇', color: '#57c8ff',
    rarity: 'uncommon', cap: 10, value: 25, tags: ['tool', 'trap'],
    desc: 'A wire strung between two stakes and fed from a charged cell. '
      + 'Set it on a route, then make the machine take the route.',
  },

  /* ---- valuables (machine trophies, docs/research/mechanics.md §5) ---- */
  'machine-core': {
    name: 'Machine Core', category: 'valuable', glyph: '⌬', color: '#59c1c6',
    rarity: 'rare', cap: 30, value: 60,
    desc: 'The power heart of a heavy machine, still warm. Traders will empty '
      + 'a stall for one.',
  },
  'machine-heart': {
    name: 'Machine Heart', category: 'valuable', glyph: '❖', color: '#3d7bd9',
    rarity: 'rare', cap: 30, value: 55,
    desc: 'A dense drive node. It hums faintly for hours after the machine '
      + 'stops moving.',
  },
  'watcher-lens': {
    name: 'Watcher Lens', category: 'valuable', glyph: '◐', color: '#4ec9b0',
    rarity: 'uncommon', cap: 30, value: 18,
    desc: 'The blue eye of a Watcher, intact. Rare to take one out without '
      + 'cracking it.',
  },
  'watcher-heart': {
    name: 'Watcher Heart', category: 'valuable', glyph: '❖', color: '#3d7bd9',
    rarity: 'rare', cap: 30, value: 34,
    desc: 'A recon drive node. Small, clean, and worth a week of arrows.',
  },
  'sawtooth-lens': {
    name: 'Sawtooth Lens', category: 'valuable', glyph: '◐', color: '#4ec9b0',
    rarity: 'rare', cap: 30, value: 40,
    desc: 'The hunting eye of a Sawtooth. It tracked you before you took it.',
  },
  'sawtooth-heart': {
    name: 'Sawtooth Heart', category: 'valuable', glyph: '❖', color: '#3d7bd9',
    rarity: 'veryRare', cap: 30, value: 75,
    desc: 'A combat-class drive node, ringed with scorch. Few hunters carry '
      + 'more than one at a time.',
  },
  'behemoth-lens': {
    name: 'Behemoth Lens', category: 'valuable', glyph: '◐', color: '#4ec9b0',
    rarity: 'rare', cap: 30, value: 48,
    desc: 'A transport optic the size of a shield boss.',
  },
  'behemoth-heart': {
    name: 'Behemoth Heart', category: 'valuable', glyph: '❖', color: '#3d7bd9',
    rarity: 'veryRare', cap: 30, value: 90,
    desc: 'A hauler drive node. Heavy enough that carrying it is a decision.',
  },
  'thunderjaw-lens': {
    name: 'Thunderjaw Lens', category: 'valuable', glyph: '◐', color: '#4ec9b0',
    rarity: 'veryRare', cap: 30, value: 110,
    desc: 'The forward optic of a Thunderjaw. Bringing one back is a story '
      + 'the whole camp will make you tell twice.',
  },
  'thunderjaw-heart': {
    name: 'Thunderjaw Heart', category: 'valuable', glyph: '❖', color: '#3d7bd9',
    rarity: 'legendary', cap: 30, value: 220,
    desc: 'The core of the largest thing that walks the valley. It still '
      + 'pulls at the metal in your hand.',
  },
  'luminous-braiding': {
    name: 'Luminous Braiding', category: 'valuable', glyph: '≋', color: '#9c8cff',
    rarity: 'rare', cap: 30, value: 45,
    desc: 'Woven light-carrying filament. Nobody has cut one that did not '
      + 'keep glowing.',
  },
  'crystal-braiding': {
    name: 'Crystal Braiding', category: 'valuable', glyph: '❋', color: '#8f7be8',
    rarity: 'veryRare', cap: 30, value: 85,
    desc: 'Braiding grown through with clear crystal. The old world made it; '
      + 'the machines only carry it.',
  },

  /* ---- pickup weapons (identity for toasts if combat can't grant them) ---- */
  'disc-launcher': {
    name: 'Disc Launcher', category: 'valuable', glyph: '◬', color: '#f2c230',
    rarity: 'legendary', cap: 2, value: 0,
    desc: 'A Thunderjaw shoulder launcher, torn free. Too heavy to keep — '
      + 'but not too heavy to use where it fell.',
  },
};

/** Ammo identity for the AMMO pocket / toasts (counts live in ctx.combat). */
export const AMMO_INFO = {
  hunter:       { name: 'Hunter Arrow',    glyph: '➳', color: '#e8d9b0', rarity: 'common' },
  hardpoint:    { name: 'Hardpoint Arrow', glyph: '➶', color: '#ffb45e', rarity: 'uncommon' },
  fire:         { name: 'Fire Arrow',      glyph: '✹', color: '#ff7a1e', rarity: 'uncommon' },
  precision:    { name: 'Precision Arrow', glyph: '✜', color: '#9fe8ff', rarity: 'rare' },
  tearblast:    { name: 'Tearblast Arrow', glyph: '✷', color: '#6fd6e8', rarity: 'rare' },
  harvest:      { name: 'Harvest Arrow',   glyph: '❧', color: '#7fb069', rarity: 'uncommon' },
  shock:        { name: 'Shock Arrow',     glyph: 'ϟ', color: '#57c8ff', rarity: 'uncommon' },
  freeze:       { name: 'Freeze Arrow',    glyph: '✻', color: '#bfe6ff', rarity: 'uncommon' },
  'blast-bomb': { name: 'Blast Bomb',      glyph: '✸', color: '#ff9a3c', rarity: 'rare' },
  disc:         { name: 'Explosive Disc',  glyph: '◎', color: '#ff5a30', rarity: 'veryRare' },
  rope:         { name: 'Rope',            glyph: '⌇', color: '#c9a86a', rarity: 'uncommon' },
  tripwire:     { name: 'Tripwire',        glyph: '⋔', color: '#b8d46a', rarity: 'uncommon' },
};

/* ========================================================================== */
/* 4. POCKETS (the full-screen inventory's left rail — ui-14)                  */
/* ========================================================================== */

export const POCKETS = [
  { id: 'resources', label: 'RESOURCES', glyph: '◆', category: 'resource' },
  { id: 'ammo',      label: 'AMMO',      glyph: '➳', category: 'ammo' },
  { id: 'tools',     label: 'TOOLS',     glyph: '⚱', category: 'tool' },
  { id: 'valuables', label: 'VALUABLES', glyph: '❖', category: 'valuable' },
  { id: 'crafting',  label: 'CRAFTING',  glyph: '⚒', category: null },
  { id: 'notebook',  label: 'NOTEBOOK',  glyph: '❐', category: null },
  { id: 'trade',     label: 'TRADE',     glyph: '⚖', category: null },
];

/* ========================================================================== */
/* 5. RESOLUTION                                                              */
/* ========================================================================== */

const _fallbackCache = new Map();

function prettify(id) {
  return String(id)
    .split(/[-_]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Resolve an item definition; unknown ids get a synthesized fallback. */
export function itemDef(id) {
  const def = ITEMS[id];
  if (def) return def;
  let fb = _fallbackCache.get(id);
  if (!fb) {
    const s = String(id).toLowerCase();
    const valuable = /lens|heart|core|braid|trophy|vessel/.test(s);
    const tool = /potion|trap|rock|draught|tool/.test(s);
    fb = {
      name: prettify(id),
      category: tool ? 'tool' : valuable ? 'valuable' : 'resource',
      glyph: tool ? '⚱' : valuable ? '❖' : '◈',
      color: tool ? '#7fb069' : valuable ? '#3d7bd9' : '#efe6d5',
      rarity: valuable ? 'rare' : 'common',
      cap: 100,
      value: valuable ? 30 : 2,
      desc: 'Salvage. Nobody has written down what it was for.',
    };
    _fallbackCache.set(id, fb);
  }
  return fb;
}

/** Ammo identity with fallback (weapons builder may add ammo ids freely). */
export function ammoDef(id) {
  const a = AMMO_INFO[id];
  if (a) return a;
  return { name: prettify(id), glyph: '➳', color: '#efe6d5', rarity: 'common' };
}

/** Base pocket capacity for an id, before purchased upgrades. */
export function itemCap(id) { return itemDef(id).cap ?? 100; }

/** Base shard value (the merchant scales it; this is the honest number). */
export function itemValue(id) { return itemDef(id).value ?? 1; }

/** Stable ordering of the catalog for list rendering. */
export const CATALOG_ORDER = Object.keys(ITEMS);
