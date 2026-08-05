/**
 * Item catalog (spec v2). Single source of truth for item identity:
 * id -> { name, category, glyph, color }.
 *
 * Categories drive the inventory screen tabs:
 *   'resource'  -> RESOURCES tab (crafting economy)
 *   'valuable'  -> VALUABLES tab (lenses / hearts / cores / braiding)
 *   'ammo'      -> AMMO tab is rendered live from ctx.combat, but ammo ids
 *                  still get glyph/color identity here for toasts and lists.
 *
 * Unknown ids never crash: itemDef() synthesizes a sane fallback so other
 * builders can drop new ids without touching this file.
 */

export const ITEMS = {
  // --- resources (crafting economy, docs/research/mechanics.md §3)
  'metal-shards':   { name: 'Metal Shards',   category: 'resource', glyph: '◆', color: '#aeb9c2' }, // ◆
  'ridge-wood':     { name: 'Ridge-Wood',     category: 'resource', glyph: '☰', color: '#a97c50' }, // ☰
  'blaze':          { name: 'Blaze',          category: 'resource', glyph: '◉', color: '#f0a03c' }, // ◉
  'chillwater':     { name: 'Chillwater',     category: 'resource', glyph: '✦', color: '#59c1c6' }, // ✦
  'sparker':        { name: 'Sparker',        category: 'resource', glyph: 'ϟ', color: '#4fa3e3' }, // ϟ
  'echo-shell':     { name: 'Echo Shell',     category: 'resource', glyph: '◎', color: '#cfae6a' }, // ◎
  'wire':           { name: 'Wire',           category: 'resource', glyph: '∿', color: '#c9a86a' }, // ∿
  'blastpaste':     { name: 'Blastpaste',     category: 'resource', glyph: '✸', color: '#e8762c' }, // ✸
  'metal-vessel':   { name: 'Metal Vessel',   category: 'resource', glyph: '⬢', color: '#8fa3ad' }, // ⬢
  'medicinal-herb': { name: 'Medicinal Herb', category: 'resource', glyph: '❧', color: '#7fb069' }, // ❧

  // --- valuables (machine trophies, docs/research/mechanics.md §5)
  'machine-core':      { name: 'Machine Core',      category: 'valuable', glyph: '⌬', color: '#59c1c6' }, // ⌬
  'machine-heart':     { name: 'Machine Heart',     category: 'valuable', glyph: '❖', color: '#3d7bd9' }, // ❖
  'watcher-lens':      { name: 'Watcher Lens',      category: 'valuable', glyph: '◐', color: '#4ec9b0' }, // ◐
  'watcher-heart':     { name: 'Watcher Heart',     category: 'valuable', glyph: '❖', color: '#3d7bd9' },
  'sawtooth-lens':     { name: 'Sawtooth Lens',     category: 'valuable', glyph: '◐', color: '#4ec9b0' },
  'sawtooth-heart':    { name: 'Sawtooth Heart',    category: 'valuable', glyph: '❖', color: '#3d7bd9' },
  'behemoth-lens':     { name: 'Behemoth Lens',     category: 'valuable', glyph: '◐', color: '#4ec9b0' },
  'behemoth-heart':    { name: 'Behemoth Heart',    category: 'valuable', glyph: '❖', color: '#3d7bd9' },
  'thunderjaw-lens':   { name: 'Thunderjaw Lens',   category: 'valuable', glyph: '◐', color: '#4ec9b0' },
  'thunderjaw-heart':  { name: 'Thunderjaw Heart',  category: 'valuable', glyph: '❖', color: '#3d7bd9' },
  'luminous-braiding': { name: 'Luminous Braiding', category: 'valuable', glyph: '≋', color: '#9c8cff' }, // ≋
  'crystal-braiding':  { name: 'Crystal Braiding',  category: 'valuable', glyph: '❋', color: '#8f7be8' }, // ❋

  // --- pickup weapons (identity for toasts if combat can't grant them)
  'disc-launcher': { name: 'Disc Launcher', category: 'valuable', glyph: '◬', color: '#f2c230' }, // ◬
};

/** Ammo identity for the AMMO tab / toasts (counts live in ctx.combat). */
export const AMMO_INFO = {
  hunter:    { name: 'Hunter Arrow',    glyph: '➳', color: '#efe6d5' },
  hardpoint: { name: 'Hardpoint Arrow', glyph: '➳', color: '#c9a86a' },
  fire:      { name: 'Fire Arrow',      glyph: '➳', color: '#f0a03c' },
  precision: { name: 'Precision Arrow', glyph: '➳', color: '#efe6d5' },
  tearblast: { name: 'Tearblast Arrow', glyph: '➳', color: '#59c1c6' },
  harvest:   { name: 'Harvest Arrow',   glyph: '➳', color: '#7fb069' },
  shock:     { name: 'Shock Arrow',     glyph: '➳', color: '#4fa3e3' },
  freeze:    { name: 'Freeze Arrow',    glyph: '➳', color: '#59c1c6' },
  blast:     { name: 'Blast Bomb',      glyph: '●', color: '#e8762c' },
  disc:      { name: 'Disc',            glyph: '◎', color: '#f2c230' },
};

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
    fb = {
      name: prettify(id),
      category: valuable ? 'valuable' : 'resource',
      glyph: valuable ? '❖' : '◈', // ❖ / ◈
      color: valuable ? '#3d7bd9' : '#efe6d5',
    };
    _fallbackCache.set(id, fb);
  }
  return fb;
}

/** Ammo identity with fallback (weapons builder may add ammo ids freely). */
export function ammoDef(id) {
  const a = AMMO_INFO[id];
  if (a) return a;
  return { name: prettify(id), glyph: '➳', color: '#efe6d5' };
}

/** Stable ordering of the catalog for list rendering. */
export const CATALOG_ORDER = Object.keys(ITEMS);
