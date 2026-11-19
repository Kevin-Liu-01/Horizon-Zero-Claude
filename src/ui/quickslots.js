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
 *   3  the gaff         empty until earned (the Tube Smith's hand-over at Ninewalls, Milestone 2): drawn from its
 *                       hanger at the back of her belt (src/combat/gaff.js asks; the animator's gaffLayer.js draws)
 *   4  pots and net     empty until earned
 *
 * An empty slot does nothing and says so (`quick-slot-empty`), so a key press is never silent
 * to the systems that listen. Published as `ctx.quickslots`; `open` is always false so systems
 * that pause aiming while a selector is up never block.
 *
 * QUICK-MAKE (M1.6d; BIBLE §9 "hold a quick slot (1-4) for 1.2 s to quick-make a bundle of six for
 * that slot at normal time; taking damage interrupts it", §16 "quick-make interrupted by damage makes
 * nothing and loses nothing"). Holding a slot's key runs `QuickMake` on the world's own clock; at
 * 1.2 s the slot's ammunition is made once through `combat.craftAmmo` (the recipe and its yield of
 * six are combat's, BIBLE §16). A hit before then cancels it: nothing is spent and nothing is made,
 * and the key must be pressed again. The HUD draws the hold on the kit tag's MAKE line.
 */
import { KitRack } from './kitrack.js';

export const QUICK_SLOTS = Object.freeze([
  Object.freeze({ key: 'Digit1', slot: 1, kind: 'bow' }),
  Object.freeze({ key: 'Digit2', slot: 2, kind: 'lance' }),
  Object.freeze({ key: 'Digit3', slot: 3, kind: null, earns: 'gaff' }),
  Object.freeze({ key: 'Digit4', slot: 4, kind: null, earns: 'pots' }),
]);

/** Seconds a quick slot is held to make its bundle (BIBLE §9). */
export const QUICK_MAKE_S = 1.2;

/**
 * The hold-to-make state machine, pure (no DOM, no three): `press(slot, ammo)` on the key's down edge,
 * `tick(dt, held)` every simulation step while the world runs, `hit()` when Brea takes damage. `tick`
 * returns the ammo id to make on the step the hold completes, else null. One completion per press;
 * an interrupted or completed hold waits for the key to come up before a new press counts.
 */
export class QuickMake {
  constructor(holdS = QUICK_MAKE_S) {
    this.holdS = holdS;
    this.slot = 0;          // the slot being held (0 = none)
    this.ammo = null;       // what that slot makes
    this.t = 0;             // seconds held
    this.state = 'idle';    // 'idle' | 'holding' | 'done' | 'interrupted'
    this.made = 0;          // completions (audit)
    this.interrupted = 0;   // holds broken off by damage (audit)
  }

  get progress() { return this.state === 'holding' ? Math.min(1, this.t / this.holdS) : 0; }
  get holding() { return this.state === 'holding'; }

  press(slot, ammo) {
    this.slot = slot; this.ammo = ammo || null; this.t = 0;
    this.state = this.ammo ? 'holding' : 'idle';
  }

  /** @returns {string|null} the ammo to make now */
  tick(dt, held) {
    if (!held) { if (this.state !== 'idle') { this.state = 'idle'; this.slot = 0; this.ammo = null; this.t = 0; } return null; }
    if (this.state !== 'holding') return null;
    this.t += Math.max(0, dt || 0);
    if (this.t + 1e-9 >= this.holdS) { this.state = 'done'; this.made++; return this.ammo; }
    return null;
  }

  /** Damage taken: a hold in progress is broken off and makes nothing. */
  hit() {
    if (this.state !== 'holding') return false;
    this.state = 'interrupted'; this.t = 0; this.interrupted++;
    return true;
  }
}


/** The lance is the weapon in hand from the first frame of its draw to the last of its stow. */
const LANCE_STANCES = new Set(['draw', 'ready', 'swing', 'holster']);

export class QuickSlots {
  constructor(ctx) {
    this.ctx = ctx;
    this.open = false;
    this.last = null;
    const inPlay = () => ctx.state === 'playing' || ctx.params.has('shot');
    this.make = new QuickMake();
    this.lastMake = null;   // { slot, ammo, ok, n, at } of the last completed hold (audit)
    for (const q of QUICK_SLOTS) {
      ctx.input.onDown(q.key, () => {
        if (!inPlay()) return;
        this.select(q.slot);
        this.make.press(q.slot, this.ammoFor(q.slot));
      });
    }
    ctx.events?.on?.('player-damage', () => {
      if (this.make.hit()) ctx.events?.emit?.('quick-make-interrupted', { slot: this.make.slot });
    });
    // (M2 area D) the Kit Rack half-ring over the slots (Tab, once Oro's kit is hers)
    this.rack = new KitRack(ctx, this);
    this._potSlot = false;
  }

  /** What holding slot `n` makes: the bow's loaded arrow for slot 1; nothing for the lance or an empty slot. */
  ammoFor(n) {
    const q = QUICK_SLOTS.find((x) => x.slot === n);
    if (!q || q.kind !== 'bow') return null;
    const combat = this.ctx.combat;
    const bow = combat?.weapons?.find?.((w) => /bow|recurve/.test(w.id));
    return bow?.activeAmmo ?? 'hunter';
  }

  /** The four slots as the HUD draws them: `{ slot, kind, earned }`. Frozen; never reallocated. */
  get slots() { return QUICK_SLOTS; }

  /**
   * The slot whose weapon is in her hands now: 2 while the lance is out (drawing, ready,
   * swinging or being stowed), else 1. Read from the weapons themselves, not from the last
   * key, so the lance's own timed stow and an aim that puts it away both show truthfully.
   */
  get activeSlot() {
    // (M2 area D) slot 4 (the pots) while it was the last one taken and nothing is in her right hand
    const g = this.ctx.combat?.gaff;
    if (this._potSlot && this.ctx.combat?.pots?.owned && !(g?.owned && (g.want || g.inHand))) return 4;
    if (g?.owned && (g.want || g.inHand)) return 3;
    const m = this.ctx.combat?.melee;
    if (m && (m.lanceInHand || LANCE_STANCES.has(m.stance))) return 2;
    return 1;
  }

  /** Select quick slot `n` (1 = bow, 2 = lance). Returns the kind selected, or null (empty slot). */
  select(n) {
    const q = QUICK_SLOTS.find((x) => x.slot === n);
    const combat = this.ctx.combat;
    if (!q) return null;
    if (!combat) { if (!q.kind) this.ctx.events?.emit?.('quick-slot-empty', { slot: n, earns: q.earns }); return null; }
    // (M2 area D) slot 3 is the gaff once it is earned; 1 and 2 put it back on its hanger first
    const gaff = combat.gaff ?? null;
    this._potSlot = false;
    // (M2 area D) slot 4 is the pots once they are hers: a press takes the next type she carries (F casts it)
    if (q.earns === 'pots' && combat.pots?.owned) {
      const K = combat.pots;
      if (this.last === 'pots') K.belt.cycle(1);
      this._potSlot = true;
      this.last = 'pots';
      this.ctx.events?.emit?.('quick-slot', { slot: n, kind: 'pots', pot: K.belt.selected });
      return 'pots';
    }
    if (q.earns === 'gaff' && gaff?.owned) {
      gaff.draw();
      this.last = 'gaff';
      this.ctx.events?.emit?.('quick-slot', { slot: n, kind: 'gaff' });
      return 'gaff';
    }
    if (!q.kind) {
      this.ctx.events?.emit?.('quick-slot-empty', { slot: n, earns: q.earns });
      return null;
    }
    const melee = combat.melee;
    if (gaff?.owned && (gaff.want || gaff.inHand)) {
      if (q.kind === 'lance') { gaff.stow('lance'); this.last = 'lance'; this.ctx.events?.emit?.('quick-slot', { slot: n, kind: 'lance' }); return 'lance'; }
      gaff.stow(null);
    }
    if (q.kind === 'bow') {
      melee?.holsterLance?.(true);
      const bow = combat.weapons?.find((w) => /bow|recurve/.test(w.id));
      if (bow) combat.setWeapon(bow.id);
      // (M1a weapons step 1, hero-anim: key 1 READIES the bow, after the lance is back on her back; it raised nothing)
      combat.noteCombatAction?.();
    } else if (q.kind === 'lance') {
      melee?.drawLance?.();
    }
    this.last = q.kind;
    this.ctx.events?.emit?.('quick-slot', { slot: n, kind: q.kind });
    return q.kind;
  }

  /** Simulation step: runs the hold on the world's clock (the world keeps its pace; nothing pauses). */
  update(dt) {
    const ctx = this.ctx;
    this.rack?.update(dt);
    const m = this.make;
    if (m.state === 'idle') return;
    const q = QUICK_SLOTS.find((x) => x.slot === m.slot);
    const playing = ctx.state === 'playing' || ctx.params?.has?.('shot');
    const held = playing && !!q && !!ctx.input?.isDown?.(q.key);
    const ammo = m.tick(dt, held);
    if (!ammo) return;
    const combat = ctx.combat;
    const before = combat?.ammo?.[ammo] ?? 0;
    const blocker = combat?.craftBlocker ? combat.craftBlocker(ammo) : 'CANNOT MAKE';
    const ok = !blocker && !!combat?.craftAmmo?.(ammo);
    const n = (combat?.ammo?.[ammo] ?? 0) - before;
    this.lastMake = { slot: m.slot, ammo, ok, n, blocker: ok ? null : blocker };
    if (!ok) combat?.feedback?.toast?.(blocker || 'CANNOT MAKE', ammo, true);
    ctx.events?.emit?.('quick-make', this.lastMake);
  }
}
