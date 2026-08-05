import { Gather } from './gather.js';
import { LootPopup } from '../ui/inventory.js';

/**
 * Interactables: world interaction registry + the E hold-to-interact binding.
 *
 * Contract (spec v2 — HUD renders the [E] prompt from `current`):
 *   register({ position, radius=2.2, label='LOOT', hold=0.45, onInteract,
 *              once, loot?, pickupWeapon? }) -> entry
 *   unregister(entry)
 *   list     -> every live entry (focus reads label==='GATHER' for node glow)
 *   current  -> nearest-in-range entry each frame as
 *               { entry, label, holdProgress 0..1 } (null when none)
 *
 * Cross-builder conventions handled here (machines builder registers torn
 * parts + corpses blind):
 *   entry.loot = [{ id, n }]  -> we grant items, emit 'item-gained' toasts,
 *                                and show the small take-all popup.
 *   entry.pickupWeapon = 'disc-launcher' -> pass to ctx.combat.grantWeapon()
 *                                if present, else toast a hint.
 * No line-of-sight requirement — radius is the whole gate (spec).
 */

const DEFAULT_RADIUS = 2.2;
const DEFAULT_HOLD = 0.45;

export class Interactables {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.current = null;
    this._cur = { entry: null, label: '', holdProgress: 0 }; // reused, no GC
    this._holdEntry = null;
    this._holdT = 0;
    this._latched = false; // require E re-press after a completed interact

    this.popup = new LootPopup();

    // World gather nodes live here (main.js is frozen — we own their system).
    this.gather = new Gather(ctx, this);

    // reset the hold latch on key release so taps feel crisp
    ctx.input.onUp('KeyE', () => { this._latched = false; });
  }

  register(entry) {
    if (!entry) return entry;
    if (entry.radius == null) entry.radius = DEFAULT_RADIUS;
    if (entry.label == null) entry.label = 'LOOT';
    if (entry.hold == null) entry.hold = DEFAULT_HOLD;
    entry.removed = false;
    if (!this.list.includes(entry)) this.list.push(entry);
    return entry;
  }

  unregister(entry) {
    const i = this.list.indexOf(entry);
    if (i >= 0) this.list.splice(i, 1);
    if (entry) entry.removed = true;
    if (this._holdEntry === entry) { this._holdEntry = null; this._holdT = 0; }
  }

  /* ------------------------------ interaction --------------------------- */

  _fire(entry) {
    const ctx = this.ctx;

    // loot convention: grant items -> 'item-gained' toasts + take-all popup
    if (Array.isArray(entry.loot) && entry.loot.length) {
      const rows = [];
      for (const l of entry.loot) {
        if (!l || !l.id) continue;
        const n = l.n ?? l.count ?? 1;
        ctx.inventory?.add?.(l.id, n);
        rows.push({ id: l.id, n });
      }
      if (rows.length) this.popup.show(rows, entry.label);
    }

    // pickup weapons (Thunderjaw disc launchers) pass through to combat
    if (entry.pickupWeapon) {
      const combat = ctx.combat;
      if (typeof combat?.grantWeapon === 'function') {
        combat.grantWeapon(entry.pickupWeapon);
        this.popup.showText(entry.pickupWeapon, 'HEAVY WEAPON EQUIPPED');
      } else {
        // combat can't take it yet — toast a hint through the item stream
        ctx.events.emit('item-gained', {
          id: entry.pickupWeapon, count: 1, total: 1,
          name: 'Disc Launcher', glyph: '◬', color: '#f2c230',
        });
        this.popup.showText(entry.pickupWeapon, 'TOO HEAVY TO CARRY — LEAVE IT');
      }
    }

    entry.onInteract?.(ctx, entry);

    // "removes if once" — entries carrying loot default to one-shot so a
    // corpse can't be farmed if the machines builder forgets the flag
    const once = entry.once ?? (!!entry.loot || !!entry.pickupWeapon);
    if (once) this.unregister(entry);

    this._holdT = 0;
    this._holdEntry = null;
    this._latched = true;
  }

  _clear() {
    this.current = null;
    this._holdEntry = null;
    this._holdT = 0;
  }

  update(dt, t) {
    this.gather.update(dt, t);
    this.popup.update(dt);

    const ctx = this.ctx;
    const p = ctx.player;
    if (!p || (ctx.state !== 'playing' && !ctx.params.has('shot'))) {
      this._clear();
      return;
    }

    // nearest entry within its own radius (defensive: cross-builder entries
    // may carry plain {x,y,z} positions, vanish mid-frame, or be retired by
    // setting removed/disabled/consumed instead of calling unregister).
    // Weapon pickups (Thunderjaw disc launchers) get radius >= 3.5 AND a 3.5x
    // selection weight so a shard pile 0.3m closer can't shadow the launcher.
    const PICKUP_W2 = 3.5 * 3.5;
    const px = p.position.x, py = p.position.y, pz = p.position.z;
    let best = null;
    let bestScore = Infinity;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e || e.removed || e.consumed) { list.splice(i, 1); continue; }
      if (e.disabled) continue;
      const pos = e.position;
      if (!pos) continue;
      const dx = (pos.x ?? 0) - px;
      const dy = (pos.y ?? py) - py;
      const dz = (pos.z ?? 0) - pz;
      let r = e.radius ?? DEFAULT_RADIUS;
      if (e.pickupWeapon && r < 3.5) r = 3.5;
      const d2 = dx * dx + dy * dy * 0.25 + dz * dz; // forgiving vertically
      if (d2 > r * r) continue;
      const score = e.pickupWeapon ? d2 / PICKUP_W2 : d2;
      if (score < bestScore) { bestScore = score; best = e; }
    }

    if (!best) {
      this.current = null;
      this._holdEntry = null;
      this._holdT = 0;
      return;
    }

    // E hold-to-fill
    const holding = ctx.input.isDown('KeyE') && !this._latched && !ctx.wheel?.open;
    if (!holding || best !== this._holdEntry) {
      this._holdEntry = holding ? best : null;
      this._holdT = 0;
    }
    if (holding) {
      const holdS = Math.max(0.05, best.hold ?? DEFAULT_HOLD);
      this._holdT += dt / holdS;
      if (this._holdT >= 1) {
        this._cur.entry = best;
        this._cur.label = best.label ?? 'LOOT';
        this._cur.holdProgress = 1;
        this.current = this._cur;
        this._fire(best);
        this.current = null; // consumed this frame; reselect next frame
        return;
      }
    }

    this._cur.entry = best;
    this._cur.label = best.label ?? 'LOOT';
    this._cur.holdProgress = Math.min(1, Math.max(0, this._holdT));
    this.current = this._cur;
  }
}
