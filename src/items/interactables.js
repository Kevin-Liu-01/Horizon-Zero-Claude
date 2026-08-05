/**
 * World interactables: lootable machine corpses, gatherable plants, crates.
 * STUB: round-2 builder replaces with registry + prompts + hold-to-interact.
 */
export class Interactables {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = []; // { position, label, radius, onInteract(), consumed }
  }

  register(entry) {
    this.list.push(entry);
    return entry;
  }

  update(dt, t) {}
}
