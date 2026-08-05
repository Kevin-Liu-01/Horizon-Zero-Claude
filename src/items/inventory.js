import { itemDef, CATALOG_ORDER } from './items.js';
import { InventoryScreen } from '../ui/inventory.js';

/**
 * Inventory: item counts + the 'item-gained' event stream every pickup flows
 * through (HUD toasts + audio key off it), plus category queries for the
 * inventory screen (I key), which this system constructs and owns.
 *
 * Contract surface (other builders code against this blind):
 *   add(id, n)  -> emits 'item-gained' { id, count, total, name, glyph, color }
 *   count(id)   -> number owned
 *   take(id, n) -> bool (false + no change when short)
 *   has(id, n)  -> bool
 *   items(category) -> [{ id, def, count }] for UI lists
 */

// Spec v2 starting inventory (set silently — no boot-time toast spam).
const STARTING = [
  ['metal-shards', 60],
  ['ridge-wood', 20],
  ['blaze', 6],
  ['sparker', 6],
  ['chillwater', 6],
  ['echo-shell', 4],
];

export class Inventory {
  constructor(ctx) {
    this.ctx = ctx;
    this.counts = new Map(); // itemId -> count
    for (const [id, n] of STARTING) this.counts.set(id, n);

    // The inventory screen (src/ui/inventory.js) reads ctx.combat lazily —
    // combat is constructed after us, so only update()/open() may touch it.
    this.screen = new InventoryScreen(ctx);
  }

  add(id, n = 1) {
    if (!id || !(n > 0)) return;
    const total = (this.counts.get(id) ?? 0) + n;
    this.counts.set(id, total);
    const def = itemDef(id);
    this.ctx.events.emit('item-gained', {
      id, count: n, total,
      name: def.name, glyph: def.glyph, color: def.color,
    });
  }

  count(id) { return this.counts.get(id) ?? 0; }

  has(id, n = 1) { return this.count(id) >= n; }

  take(id, n = 1) {
    const have = this.count(id);
    if (have < n) return false;
    this.counts.set(id, have - n);
    return true;
  }

  /**
   * Items owned in a category, catalog order first, then any unknown ids
   * other builders introduced (so nothing ever silently disappears).
   */
  items(category) {
    const out = [];
    for (const id of CATALOG_ORDER) {
      const c = this.counts.get(id) ?? 0;
      if (c <= 0) continue;
      const def = itemDef(id);
      if (def.category !== category) continue;
      out.push({ id, def, count: c });
    }
    for (const [id, c] of this.counts) {
      if (c <= 0 || CATALOG_ORDER.includes(id)) continue;
      const def = itemDef(id);
      if (def.category !== category) continue;
      out.push({ id, def, count: c });
    }
    return out;
  }

  update(dt, t) {
    this.screen.update(dt, t);
  }
}
