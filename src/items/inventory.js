/**
 * Inventory + item catalog. STUB: round-2 builder replaces with the full
 * system (categories, capacity, crafting integration, inventory screen).
 */
export class Inventory {
  constructor(ctx) {
    this.ctx = ctx;
    this.counts = new Map(); // itemId -> count
  }

  add(id, n = 1) {
    this.counts.set(id, (this.counts.get(id) ?? 0) + n);
    this.ctx.events.emit('item-gained', { id, count: n, total: this.counts.get(id) });
  }

  count(id) { return this.counts.get(id) ?? 0; }

  take(id, n = 1) {
    const have = this.count(id);
    if (have < n) return false;
    this.counts.set(id, have - n);
    return true;
  }

  update(dt, t) {}
}
