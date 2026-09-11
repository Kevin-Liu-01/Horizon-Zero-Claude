import { itemDef, CATALOG_ORDER, rarityDef } from './items.js';
import { Crafting, CAPACITY_POCKETS } from './crafting.js';
import { Tools } from './tools.js';
import { InventoryScreen } from '../ui/inventory.js';

/**
 * INVENTORY  —  lane `focus-items` (port 5212)
 * ===========================================================================
 * Item counts, the 'item-gained' stream every pickup flows through, pocket
 * CAPACITIES (`progression-006`), and the lane facade `ctx.items`.
 *
 * ---------------------------------------------------------------------------
 * PUBLISHED — `ctx.inventory` (unchanged Round-3 surface, still honoured)
 * ---------------------------------------------------------------------------
 *   add(id, n)  -> emits 'item-gained' { id, count, total, name, glyph, color,
 *                                        rarity, capped }
 *   count(id) · has(id, n) · take(id, n) · items(category)
 *   counts      Map<id, n>
 *
 * ---------------------------------------------------------------------------
 * PUBLISHED — `ctx.items` (the lane facade every other lane reads)
 * ---------------------------------------------------------------------------
 *   tools        -> Tools        (ui-11 quick-slot strip data; see tools.js)
 *   crafting     -> Crafting     (recipes + capacity upgrades)
 *   datapoints   -> Datapoints   (attached by items/interactables.js)
 *   screen       -> InventoryScreen  (the full-screen pockets)
 *   capacity(id) · capacityTier(pocket) · pocketOf(id)
 *   upgradeCost / canUpgrade / upgradeCapacity  (delegates to crafting)
 *   recipes / recipeStatus / canCraft / craft / craftBlocker
 *   openInventory(pocket?) · openTrade() · openNotebook(id?)
 *   audit() -> one flat object for gates
 *
 * EVENTS ADDED BY THIS LANE
 *   'inventory-full'    { id, name, cap }        add() clamped at the cap
 *   'item-crafted'      { id, n, name }
 *   'capacity-upgraded' { pocket, tier, mult, label }
 *   'tool-selected' / 'tool-used' / 'tool-blocked' / 'tool-throw' /
 *   'tool-landed'                                (tools.js)
 *   'datapoint-collected'                        (datapoints.js)
 *   'loot-rummage'      { entry, label, duration, rows }   (interactables.js)
 */

/** Spec v2 starting inventory (set silently — no boot-time toast spam). */
const STARTING = [
  ['metal-shards', 60],
  ['ridge-wood', 20],
  ['blaze', 6],
  ['sparker', 6],
  ['chillwater', 6],
  ['echo-shell', 4],
  ['wire', 6],
  ['medicinal-herb', 3],
  ['medicinal-moss', 4],
  // one of each tool so the quick-slot strip is never an empty row on boot
  ['rock', 4],
  ['potion-vigor', 1],
  ['trap-shock', 2],
];

export class Inventory {
  constructor(ctx) {
    this.ctx = ctx;
    this.counts = new Map(); // itemId -> count

    this.crafting = new Crafting(ctx, this);
    for (const [id, n] of STARTING) {
      this.counts.set(id, Math.min(n, this.crafting.capacity(id)));
    }
    this.tools = new Tools(ctx, this);

    // The inventory screen (src/ui/inventory.js) reads ctx.combat lazily —
    // combat is constructed after us, so only update()/open() may touch it.
    this.screen = new InventoryScreen(ctx);

    ctx.items = this._facade();
  }

  /* ------------------------------------------------------------- facade */

  _facade() {
    const self = this;
    const c = this.crafting;
    return {
      inventory: this,
      tools: this.tools,
      crafting: c,
      datapoints: null,            // items/interactables.js attaches this
      screen: this.screen,
      POCKETS: CAPACITY_POCKETS,

      capacity: (id) => c.capacity(id),
      capacityTier: (p) => c.capacityTier(p),
      pocketOf: (id) => c.pocketOf(id),
      upgradeCost: (p) => c.upgradeCost(p),
      canUpgrade: (p) => c.canUpgrade(p),
      upgradeCapacity: (p) => c.upgradeCapacity(p),

      recipes: () => c.recipes(),
      recipeStatus: (id) => c.recipeStatus(id),
      canCraft: (id) => c.canCraft(id),
      craftBlocker: (id) => c.craftBlocker(id),
      craft: (id) => c.craft(id),

      openInventory: (pocket) => self.screen.open(pocket),
      openTrade: () => self.screen.open('trade'),
      openNotebook: (id) => self.screen.openNotebook(id),

      audit: () => self.audit(),
    };
  }

  audit() {
    const dp = this.ctx.items?.datapoints;
    return {
      items: this.counts.size,
      capacities: Object.fromEntries(
        Object.keys(CAPACITY_POCKETS).map((p) => [p, this.crafting.capacityTier(p)]),
      ),
      tools: this.tools.audit(),
      recipes: this.crafting.recipes().length,
      datapoints: dp ? { total: dp.total, collected: dp.count } : null,
      screenOpen: this.screen.isOpen,
      pocket: this.screen.pocket,
    };
  }

  /* -------------------------------------------------------------- counts */

  /** Cap for an id, including purchased upgrades. */
  capacity(id) { return this.crafting.capacity(id); }

  /**
   * Grant items. Clamped at the pocket capacity — the overflow is reported
   * (`capped`) and announced once as 'inventory-full' instead of vanishing.
   */
  add(id, n = 1) {
    if (!id || !(n > 0)) return 0;
    const cap = this.crafting.capacity(id);
    const have = this.counts.get(id) ?? 0;
    const total = Math.min(cap, have + n);
    const gained = total - have;
    this.counts.set(id, total);
    const def = itemDef(id);
    if (gained > 0) {
      this.ctx.events.emit('item-gained', {
        id, count: gained, total,
        name: def.name, glyph: def.glyph, color: def.color,
        rarity: def.rarity ?? 'common',
        rarityColor: rarityDef(def.rarity).color,
        capped: gained < n,
      });
    }
    if (gained < n) {
      this.ctx.events.emit('inventory-full', { id, name: def.name, cap });
    }
    return gained;
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
   * Each row carries `cap` and `frac` so the pockets can draw capacity bars.
   */
  items(category) {
    const out = [];
    const push = (id, c) => {
      const def = itemDef(id);
      if (def.category !== category) return;
      const cap = this.crafting.capacity(id);
      out.push({ id, def, count: c, cap, frac: cap ? Math.min(1, c / cap) : 0 });
    };
    for (const id of CATALOG_ORDER) {
      const c = this.counts.get(id) ?? 0;
      if (c > 0) push(id, c);
    }
    for (const [id, c] of this.counts) {
      if (c <= 0 || CATALOG_ORDER.includes(id)) continue;
      push(id, c);
    }
    return out;
  }

  /* ---------------------------------------------------------------- save */

  serialize() {
    return {
      counts: Object.fromEntries(this.counts),
      crafting: this.crafting.serialize(),
      datapoints: this.ctx.items?.datapoints?.serialize?.() ?? null,
    };
  }

  deserialize(d) {
    if (!d) return;
    if (d.counts) {
      this.counts.clear();
      for (const [id, n] of Object.entries(d.counts)) this.counts.set(id, n);
    }
    this.crafting.deserialize(d.crafting);
    this.ctx.items?.datapoints?.deserialize?.(d.datapoints);
    this.tools.refresh();
  }

  update(dt, t) {
    this.tools.update(dt);
    this.screen.update(dt, t);
  }
}
