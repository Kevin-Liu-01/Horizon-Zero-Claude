/**
 * QUICK SLOTS (M0.3 stand-in; bible §8.5 "quick slots 1-4", the Kit Rack half-ring is M2).
 *
 * Replaces the Round-4 centre radial. The world keeps running; there is no
 * overlay. Two slots are bound today:
 *
 *   1  the bow: the lance goes back on her back (the quick stow) and the
 *      first bow in `combat.weapons` is selected
 *   2  the lance: drawn from the back (`melee.drawLance()`)
 *
 * Slots 3 and 4 are reserved for the pot and net families (bible §8.1) and do
 * nothing until those exist. Published as `ctx.quickslots`; `open` is always
 * false so systems that pause aiming while a selector is up never block.
 */
export const QUICK_SLOTS = Object.freeze([
  { key: 'Digit1', slot: 1, kind: 'bow' },
  { key: 'Digit2', slot: 2, kind: 'lance' },
]);

export class QuickSlots {
  constructor(ctx) {
    this.ctx = ctx;
    this.open = false;
    this.last = null;
    const inPlay = () => ctx.state === 'playing' || ctx.params.has('shot');
    for (const q of QUICK_SLOTS) ctx.input.onDown(q.key, () => { if (inPlay()) this.select(q.slot); });
  }

  /** Select quick slot `n` (1 = bow, 2 = lance). Returns the kind selected, or null. */
  select(n) {
    const q = QUICK_SLOTS.find((x) => x.slot === n);
    const combat = this.ctx.combat;
    if (!q || !combat) return null;
    const melee = combat.melee;
    if (q.kind === 'bow') {
      melee?.holsterLance?.(true);
      const bow = combat.weapons?.find((w) => /bow|recurve/.test(w.id));
      if (bow) combat.setWeapon(bow.id);
    } else if (q.kind === 'lance') {
      melee?.drawLance?.();
    }
    this.last = q.kind;
    this.ctx.events?.emit?.('quick-slot', { slot: n, kind: q.kind });
    return q.kind;
  }

  update() {}
}
