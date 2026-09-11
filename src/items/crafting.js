import { itemDef, ITEMS } from './items.js';

/**
 * CRAFTING + CAPACITIES  —  lane `focus-items` (port 5212)
 * ===========================================================================
 * Closes `progression-006` ("no capacities/crafting screen") and the crafting
 * half of `ui-14`.
 *
 * Two things live here:
 *
 *  1. **Capacities.** Every satchel item has a base `cap` in the catalog.
 *     A pocket can be upgraded three times; each tier multiplies every cap in
 *     that pocket. `Inventory.add()` clamps against `capacity(id)` and emits
 *     'inventory-full' instead of silently swallowing the overflow.
 *
 *     Pouch capacity is deliberately NOT here: `progression` owns
 *     `player.maxPouch` through its skill tree, and two lanes writing one
 *     number is how you get a bug nobody can bisect.
 *
 *  2. **Recipes.** Tools and potions this lane owns, crafted from resources.
 *     Ammo recipes are NOT re-implemented — the CRAFTING pocket lists them
 *     live from `ctx.combat` (`recipeStatus` / `canCraft` / `craftAmmo`), so
 *     the numbers can only ever come from the lane that owns them.
 *
 * PUBLISHED (`ctx.items`)
 *   capacity(id) -> number            capacityTier(pocket) -> 0..3
 *   pocketOf(id) -> 'resources' | 'valuables' | 'tools'
 *   upgradeCost(pocket) -> { shards, items:[[id,n]] } | null   (null at max)
 *   canUpgrade(pocket) -> { ok, reason }
 *   upgradeCapacity(pocket) -> bool   (emits 'capacity-upgraded')
 *   recipes() -> [recipe]             recipeStatus(id) -> [{id,have,need,ok}]
 *   canCraft(id) -> bool              craft(id) -> bool  (emits 'item-crafted')
 *   craftBlocker(id) -> string|null
 */

export const CAPACITY_POCKETS = {
  resources: { label: 'RESOURCE SATCHEL', category: 'resource' },
  tools:     { label: 'TOOL POUCH',       category: 'tool' },
  valuables: { label: 'TROPHY ROLL',      category: 'valuable' },
};

/** Tier multipliers on the base cap, and what each tier costs. */
export const CAPACITY_TIERS = [
  { mult: 1.0, shards: 0,   items: [] },
  { mult: 1.5, shards: 60,  items: [['ridge-wood', 12], ['wire', 4]] },
  { mult: 2.0, shards: 180, items: [['wire', 10], ['machine-heart', 1]] },
  // Tier-3 cost is machine cores and hearts, NOT braiding: no species in
  // src/entities/machines/* drops braiding and the camp hunter does not stock
  // it, so a braiding cost would have made the last tier unreachable.
  { mult: 3.0, shards: 420, items: [['machine-core', 2], ['machine-heart', 2]] },
];

/** Tools and potions this lane crafts. Ammo stays with `combat`. */
export const RECIPES = [
  {
    id: 'rock', batch: 4,
    cost: [['metal-shards', 2]],
    note: 'Four throwing stones, cut square enough to fly straight.',
  },
  {
    id: 'potion-vigor', batch: 1,
    cost: [['medicinal-herb', 3], ['medicinal-moss', 4], ['metal-vessel', 1]],
    note: 'Boiled down in a salvaged vessel. Refills the pouch in one pull.',
  },
  {
    id: 'trap-shock', batch: 2,
    cost: [['wire', 3], ['sparker', 2], ['ridge-wood', 2]],
    note: 'Two stakes, one wire, one charged cell.',
  },
];

export class Crafting {
  constructor(ctx, inventory) {
    this.ctx = ctx;
    this.inventory = inventory;
    /** Purchased tier per pocket (0 = base). */
    this.tiers = { resources: 0, tools: 0, valuables: 0 };
    this._byId = new Map(RECIPES.map((r) => [r.id, r]));
  }

  /* ----------------------------------------------------------- capacity */

  pocketOf(id) {
    const cat = itemDef(id).category;
    if (cat === 'tool') return 'tools';
    if (cat === 'valuable') return 'valuables';
    return 'resources';
  }

  capacityTier(pocket) { return this.tiers[pocket] ?? 0; }

  capacity(id) {
    const base = itemDef(id).cap ?? 100;
    const tier = CAPACITY_TIERS[this.capacityTier(this.pocketOf(id))] ?? CAPACITY_TIERS[0];
    return Math.round(base * tier.mult);
  }

  upgradeCost(pocket) {
    const next = (this.tiers[pocket] ?? 0) + 1;
    const tier = CAPACITY_TIERS[next];
    if (!tier) return null;
    return { tier: next, shards: tier.shards, items: tier.items, mult: tier.mult };
  }

  canUpgrade(pocket) {
    const cost = this.upgradeCost(pocket);
    if (!cost) return { ok: false, reason: 'FULLY UPGRADED' };
    const inv = this.inventory;
    if (inv.count('metal-shards') < cost.shards) {
      return { ok: false, reason: `NEED ${cost.shards - inv.count('metal-shards')} MORE SHARDS` };
    }
    for (const [id, n] of cost.items) {
      const have = inv.count(id);
      if (have < n) {
        return { ok: false, reason: `NEED ${n - have} ${itemDef(id).name.toUpperCase()}` };
      }
    }
    return { ok: true, reason: null };
  }

  upgradeCapacity(pocket) {
    const cost = this.upgradeCost(pocket);
    if (!cost || !this.canUpgrade(pocket).ok) return false;
    const inv = this.inventory;
    inv.take('metal-shards', cost.shards);
    for (const [id, n] of cost.items) inv.take(id, n);
    this.tiers[pocket] = cost.tier;
    this.ctx.events?.emit?.('capacity-upgraded', {
      pocket, tier: cost.tier, mult: cost.mult,
      label: CAPACITY_POCKETS[pocket]?.label ?? pocket,
    });
    return true;
  }

  /* ------------------------------------------------------------ recipes */

  recipes() { return RECIPES; }

  recipe(id) { return this._byId.get(id) ?? null; }

  recipeStatus(id) {
    const r = this._byId.get(id);
    if (!r) return [];
    const inv = this.inventory;
    return r.cost.map(([cid, n]) => {
      const have = inv.count(cid);
      return { id: cid, have, need: n, ok: have >= n, def: itemDef(cid) };
    });
  }

  canCraft(id) {
    const r = this._byId.get(id);
    if (!r) return false;
    if (this.inventory.count(id) >= this.capacity(id)) return false;
    return this.recipeStatus(id).every((s) => s.ok);
  }

  craftBlocker(id) {
    const r = this._byId.get(id);
    if (!r) return 'CANNOT CRAFT';
    if (this.inventory.count(id) >= this.capacity(id)) return 'POUCH FULL';
    const miss = this.recipeStatus(id).filter((s) => !s.ok);
    if (!miss.length) return null;
    return 'NEED ' + miss
      .map((s) => `${s.need - s.have} ${s.def.name}`)
      .join(' + ').toUpperCase();
  }

  craft(id) {
    const r = this._byId.get(id);
    if (!r || !this.canCraft(id)) return false;
    for (const [cid, n] of r.cost) this.inventory.take(cid, n);
    const before = this.inventory.count(id);
    this.inventory.add(id, r.batch ?? 1);
    const made = this.inventory.count(id) - before;
    this.ctx.events?.emit?.('item-crafted', {
      id, n: made, name: ITEMS[id]?.name ?? id,
    });
    return made > 0;
  }

  /* --------------------------------------------------------------- save */

  serialize() { return { tiers: { ...this.tiers } }; }

  deserialize(d) {
    if (!d?.tiers) return;
    for (const k of Object.keys(this.tiers)) {
      const v = d.tiers[k];
      if (Number.isFinite(v)) this.tiers[k] = Math.max(0, Math.min(3, v | 0));
    }
  }
}
