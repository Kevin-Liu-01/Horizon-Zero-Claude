import { Gather } from './gather.js';
import { Datapoints } from './datapoints.js';
import { LootPopup } from '../ui/inventory.js';
import { itemDef } from './items.js';

/**
 * INTERACTABLES  —  lane `focus-items` (port 5212)
 * World interaction registry + the E hold-to-interact binding.
 *
 * Contract (spec v2 — HUD renders the [E] prompt from `current`):
 *   register({ position, radius=2.2, label='LOOT', hold=0.45, onInteract,
 *              once, loot?, pickupWeapon? }) -> entry
 *   unregister(entry)
 *   list     -> every live entry (focus reads label/loot for its reveal pass)
 *   current  -> nearest-in-range entry each frame as
 *               { entry, label, holdProgress 0..1 } (null when none)
 *
 * Cross-lane conventions handled here (machine-ai registers torn parts +
 * corpses blind):
 *   entry.loot = [{ id, n }]  -> we grant items, emit 'item-gained' toasts,
 *                                and show the take-all popup ANCHORED TO THE
 *                                INTERACTABLE (`ui-16`).
 *   entry.pickupWeapon = 'disc-launcher' -> ctx.combat.grantWeapon() if present
 *   entry.datapoint           -> the Notebook record this pedestal carries
 * No line-of-sight requirement — radius is the whole gate (spec).
 *
 * ROUND 4 ADDITIONS
 *   `onboarding-loop-loot-feel` — every completed loot/gather emits
 *      'loot-rummage' { entry, label, duration, rows, sourceName }
 *   BEFORE the items are granted, so `player-anim` can play the rummage clip
 *   over the grant. It is fire-and-forget: nothing here waits on the animator.
 *   `ui-16` — the popup is projected onto the interactable, not pinned to the
 *   screen corner.
 *   `missing-systems-focus-datapoints` — datapoint pedestals live here and
 *   open the Notebook reader on pickup.
 */

const DEFAULT_RADIUS = 2.2;
const DEFAULT_HOLD = 0.45;

/** How long the rummage animation should run for each interaction class. */
const RUMMAGE = { LOOT: 1.15, 'PICK UP': 0.85, GATHER: 0.7, DATAPOINT: 0.9 };

export class Interactables {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.current = null;
    this._cur = { entry: null, label: '', holdProgress: 0 }; // reused, no GC
    this._holdEntry = null;
    this._holdT = 0;
    this._latched = false; // require E re-press after a completed interact

    this.popup = new LootPopup(ctx);

    // World gather nodes live here (main.js is frozen — we own their system).
    this.gather = new Gather(ctx, this);
    // Old-World records + the Notebook they fill (missing-systems-focus-datapoints)
    this.datapoints = new Datapoints(ctx, this);
    if (ctx.items) ctx.items.datapoints = this.datapoints;

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

  /**
   * Human name for what is being opened — the loot popup's second line
   * (`onboarding-loop-loot-feel`: "source name"). Reads only published
   * fields, so a lane that never sets any of them still gets a sane label.
   */
  sourceName(entry) {
    if (!entry) return '';
    if (entry.sourceName) return String(entry.sourceName).toUpperCase();
    if (entry.datapoint) return String(entry.datapoint.title ?? 'RECORD').toUpperCase();
    if (entry.part) {
      const p = entry.part;
      const m = p.machine ?? entry.machine;
      const base = String(p.displayName ?? p.name ?? 'COMPONENT').replace(/[-_]/g, ' ');
      return (m?.displayName ? `${m.displayName} ${base}` : base).toUpperCase();
    }
    if (entry.machine) {
      return `${String(entry.machine.displayName ?? entry.machine.kind ?? 'MACHINE')} WRECK`
        .toUpperCase();
    }
    const node = entry.gatherNode;
    if (node) {
      if (node.kind === 'crate') return 'SUPPLY CRATE';
      if (node.kind === 'wood') return 'RIDGE-WOOD DEADFALL';
      if (node.kind === 'herb') return itemDef(node.itemId ?? 'medicinal-herb').name.toUpperCase();
    }
    return entry.label === 'GATHER' ? 'GATHERED' : 'CACHE';
  }

  _fire(entry) {
    const ctx = this.ctx;
    const label = entry.label ?? 'LOOT';

    // rows first, so the rummage event can name what is about to be taken
    const rows = [];
    if (Array.isArray(entry.loot) && entry.loot.length) {
      for (const l of entry.loot) {
        if (!l || !l.id) continue;
        rows.push({ id: l.id, n: l.n ?? l.count ?? 1 });
      }
    }

    // `onboarding-loop-loot-feel`: the animator's rummage hook. Fired BEFORE
    // the grant so the clip covers the pop-in, and never awaited.
    ctx.events?.emit?.('loot-rummage', {
      entry, label, rows,
      sourceName: this.sourceName(entry),
      duration: RUMMAGE[label] ?? 0.9,
      position: entry.position,
    });

    // loot convention: grant items -> 'item-gained' toasts + take-all popup
    if (rows.length) {
      for (const r of rows) ctx.inventory?.add?.(r.id, r.n);
      this.popup.show(rows, label, {
        sourceName: this.sourceName(entry),
        position: entry.position,
      });
    }

    // pickup weapons (Thunderjaw disc launchers) pass through to combat
    if (entry.pickupWeapon) {
      const combat = ctx.combat;
      if (typeof combat?.grantWeapon === 'function') {
        combat.grantWeapon(entry.pickupWeapon);
        this.popup.showText(entry.pickupWeapon, 'HEAVY WEAPON EQUIPPED', {
          sourceName: this.sourceName(entry), position: entry.position,
        });
      } else {
        // combat can't take it yet — toast a hint through the item stream
        ctx.events.emit('item-gained', {
          id: entry.pickupWeapon, count: 1, total: 1,
          name: 'Disc Launcher', glyph: '◬', color: '#f2c230',
        });
        this.popup.showText(entry.pickupWeapon, 'TOO HEAVY TO CARRY — LEAVE IT', {
          sourceName: this.sourceName(entry), position: entry.position,
        });
      }
    }

    entry.onInteract?.(ctx, entry);

    // A datapoint opens its own reader once it has been collected — but not
    // in the middle of a fight: a full-screen modal while a Sawtooth is
    // charging is the kind of thing that gets a player killed. The record is
    // already in the Notebook either way; it just waits for a quiet moment.
    if (entry.datapoint) {
      const p = ctx.player?.position;
      let hostile = false;
      for (const m of (ctx.machines?.list ?? [])) {
        if (!m || m.alive === false || !m.position || !p) continue;
        const st = m.ai?.state ?? m.state ?? '';
        if (st !== 'alert' && st !== 'attack' && st !== 'search') continue;
        if (m.position.distanceToSquared(p) < 3600) { hostile = true; break; }
      }
      if (!hostile) ctx.items?.openNotebook?.(entry.datapoint.id);
    }

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
    this.datapoints.update(dt, t);
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
