/**
 * QUICK SLOTS 1-4 (M1.6g1; BIBLE §12 "quick slots 1-4 (1 bow, 2 lance, 3 gaff, 4 pots and net;
 * empty until earned)"; the Kit Rack half-ring is Milestone 2).
 *
 * No overlay and no pause: the world keeps running. The slots are drawn on the field HUD's
 * weapon tag (src/ui/hud.js), one cell each, the slot in hand on the lilac selection line.
 *
 *   1  the bow: the lance goes back on her back (the quick stow) and the first bow in
 *      `combat.weapons` is selected
 *   2  the lance: drawn from the back (`melee.drawLance()`)
 *   3  the gaff         empty until earned (Ninewalls, Milestone 2)
 *   4  pots and net     empty until earned
 *
 * An empty slot does nothing and says so (`quick-slot-empty`), so a key press is never silent
 * to the systems that listen. Published as `ctx.quickslots`; `open` is always false so systems
 * that pause aiming while a selector is up never block.
 */
export const QUICK_SLOTS = Object.freeze([
  Object.freeze({ key: 'Digit1', slot: 1, kind: 'bow' }),
  Object.freeze({ key: 'Digit2', slot: 2, kind: 'lance' }),
  Object.freeze({ key: 'Digit3', slot: 3, kind: null, earns: 'gaff' }),
  Object.freeze({ key: 'Digit4', slot: 4, kind: null, earns: 'pots' }),
]);

/** The lance is the weapon in hand from the first frame of its draw to the last of its stow. */
const LANCE_STANCES = new Set(['draw', 'ready', 'swing', 'holster']);

export class QuickSlots {
  constructor(ctx) {
    this.ctx = ctx;
    this.open = false;
    this.last = null;
    const inPlay = () => ctx.state === 'playing' || ctx.params.has('shot');
    for (const q of QUICK_SLOTS) ctx.input.onDown(q.key, () => { if (inPlay()) this.select(q.slot); });
  }

  /** The four slots as the HUD draws them: `{ slot, kind, earned }`. Frozen; never reallocated. */
  get slots() { return QUICK_SLOTS; }

  /**
   * The slot whose weapon is in her hands now: 2 while the lance is out (drawing, ready,
   * swinging or being stowed), else 1. Read from the weapons themselves, not from the last
   * key, so the lance's own timed stow and an aim that puts it away both show truthfully.
   */
  get activeSlot() {
    const m = this.ctx.combat?.melee;
    if (m && (m.lanceInHand || LANCE_STANCES.has(m.stance))) return 2;
    return 1;
  }

  /** Select quick slot `n` (1 = bow, 2 = lance). Returns the kind selected, or null (empty slot). */
  select(n) {
    const q = QUICK_SLOTS.find((x) => x.slot === n);
    const combat = this.ctx.combat;
    if (!q) return null;
    if (!q.kind) {
      this.ctx.events?.emit?.('quick-slot-empty', { slot: n, earns: q.earns });
      return null;
    }
    if (!combat) return null;
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
