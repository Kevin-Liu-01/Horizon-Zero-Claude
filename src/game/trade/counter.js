import { saveFieldsOf } from '../save/fields.js';
import { PLACES as NW_PLACES } from '../../world/settlements/ninewalls-layout.js';
import { vec3 } from '../../world/settlements/brazier.js';

/**
 * THE NINEWALLS COUNTER AND ITS NOTICE BOARD (Milestone 2 wave 4, area E; HR10, F46; BIBLE 16, 18).
 *
 * RULES (pure; node --test tools/gates/systems/trade.test.mjs): salt is the only currency (`metal-shards`), prices are
 * in salt only and untimed (no clock, no restock timer). TAKE takes one of the counter's stock for its price in salt;
 * GIVE gives one of her goods the counter takes for its price. A trade that cannot be made changes nothing.
 * LIVE: the counter opens on "The Scar"'s reward ('counter-opened' { id: 'ninewalls-counter' }, src/game/hour.js); its
 * prompt stands at settlements' PLACES.counter (TRADE), the Guild Notice board 2.4 m along the counter's line (GUILD
 * NOTICE). E opens the TRADE screen or the notices (src/ui/trade.js). Saved in the save seam's `counter` field.
 *
 *   new CounterRules({ text })   .stock() · .takes() · .take(inv, id) · .give(inv, id) · .serialize() / .restore(d)
 *   new Counter(ctx, { present }) .open() · .opened · .rules · .openScreen() · .openNotices() · .takeNotice(id) · report()
 */
export const SALT = 'metal-shards';

export class CounterRules {
  /** text: src/game/text/ui/trade.json (handed in: src/game/text.js is the one importer of the writing) */
  constructor({ text }) {
    this.T = text;
    this.reset();
  }

  reset() {
    this.qty = Object.fromEntries(this.T.stock.map((s) => [s.id, s.qty]));
    this.log = [];
  }

  /** The counter's stock as the TAKE column lists it: { id, name, price, qty, grade }. */
  stock() { return this.T.stock.map((s) => ({ id: s.id, name: s.name, price: s.price, qty: this.qty[s.id] ?? 0, grade: s.grade })); }

  /** Her goods the counter takes (GIVE), with what she holds of each. */
  takes(inv) { return this.T.takes.map((s) => ({ id: s.id, name: s.name, price: s.price, have: inv?.count?.(s.id) ?? 0, grade: s.grade })); }

  /** TAKE one: her salt for the counter's good. */
  take(inv, id) {
    const s = this.T.stock.find((x) => x.id === id);
    if (!s) return { ok: false, why: 'not-stocked' };
    if ((this.qty[id] ?? 0) < 1) return { ok: false, why: 'none-left' };
    const salt = inv?.count?.(SALT) ?? 0;
    if (salt < s.price) return { ok: false, why: 'salt' };
    inv.take(SALT, s.price);
    inv.add(id, 1);
    this.qty[id] -= 1;
    this.log.push({ verb: 'take', id, price: s.price });
    return { ok: true, id, price: s.price, salt: inv.count(SALT) };
  }

  /** GIVE one: her good for salt. */
  give(inv, id) {
    const s = this.T.takes.find((x) => x.id === id);
    if (!s) return { ok: false, why: 'not-taken' };
    if ((inv?.count?.(id) ?? 0) < 1) return { ok: false, why: 'none-held' };
    inv.take(id, 1);
    inv.add(SALT, s.price);
    this.log.push({ verb: 'give', id, price: s.price });
    return { ok: true, id, price: s.price, salt: inv.count(SALT) };
  }

  /** Every word the TRADE screen can print besides the names and the numbers (the "exactly BIBLE 18" row). */
  words() { return [this.T.words.head, this.T.words.give, this.T.words.take]; }

  serialize() { return { qty: { ...this.qty } }; }
  restore(d) { this.reset(); for (const [k, v] of Object.entries(d?.qty || {})) if (k in this.qty) this.qty[k] = Math.max(0, v | 0); }
}

export class Counter {
  constructor(ctx, { present = null, text, notices }) {
    this.ctx = ctx;
    this.present = present;
    this.T = text;
    this.N = notices;
    this.rules = new CounterRules({ text });
    this.opened = false;
    this.taken = [];
    this.entries = {};
    this._field();
    this._entries();
  }

  _field() {
    try {
      saveFieldsOf(this.ctx).register('counter', {
        get: () => ({ open: this.opened, taken: this.taken.slice(), ...this.rules.serialize() }),
        set: (v) => { this.rules.restore(v); this.opened = !!v?.open; this.taken = Array.isArray(v?.taken) ? v.taken.slice() : []; this._sync(); },
      });
    } catch (err) { console.warn('[systems] save field counter:', err?.message || err); }
  }

  _entries() {
    const I = this.ctx.interactables;
    if (!I?.register) return;
    const T = this.ctx.terrain, K = NW_PLACES.counter;
    const at = (x, z) => vec3(x, T?.getHeight?.(x, z) ?? 0, z);
    // the counter faces the street: she stands 1.3 m out from its front, toward the village's centre
    const b = (K.b ?? 57) * Math.PI / 180, out = { x: -Math.sin(b), z: Math.cos(b) };
    const front = { x: K.x + out.x * 1.3, z: K.z + out.z * 1.3 };
    // the board on the counter's line, 2.4 m to its side
    const side = { x: Math.cos(b), z: Math.sin(b) };
    const board = { x: front.x + side.x * 2.4, z: front.z + side.z * 2.4 };
    this.at = { counter: front, board };
    const W = this.T.words;
    this.entries.counter = I.register({ position: at(front.x, front.z), radius: 2.4, hold: 0.3, label: W.head, once: false, disabled: true, onInteract: () => this.openScreen() });
    this.entries.board = I.register({ position: at(board.x, board.z), radius: 2.2, hold: 0.3, label: this.N.head, once: false, disabled: true, onInteract: () => this.openNotices() });
  }

  _sync() { for (const e of Object.values(this.entries)) if (e) e.disabled = !this.opened; }

  /** "The Scar" paid: the counter is open from now on (and in every record after). */
  open() { if (this.opened) return; this.opened = true; this._sync(); this.ctx.events?.emit?.('counter-open', { id: 'ninewalls-counter' }); }

  newGame() { this.rules.reset(); this.opened = false; this.taken = []; this._sync(); }

  _ui() { return import('../../ui/trade.js'); }

  /** The TRADE screen (src/ui/trade.js); resolves when it closes. */
  async openScreen() {
    if (!this.opened || this.present?.busy) return null;
    const ui = await this._ui();
    return ui.openTrade(this.ctx, this, { present: this.present });
  }

  async openNotices() {
    if (!this.opened || this.present?.busy) return null;
    const ui = await this._ui();
    return ui.openNotices(this.ctx, this, this.N, { present: this.present });
  }

  takeNotice(id) {
    if (this.taken.includes(id)) return false;
    this.taken.push(id);
    this.ctx.events?.emit?.('notice-taken', { id, board: 'ninewalls' });
    return true;
  }

  take(id) { const r = this.rules.take(this.ctx.inventory, id); if (r.ok) this.ctx.events?.emit?.('trade-take', r); return r; }
  give(id) { const r = this.rules.give(this.ctx.inventory, id); if (r.ok) this.ctx.events?.emit?.('trade-give', r); return r; }

  report() { return { open: this.opened, taken: this.taken.slice(), at: this.at ?? null, log: this.rules.log.slice(-8) }; }

  dispose() { for (const e of Object.values(this.entries)) if (e) this.ctx.interactables?.unregister?.(e); }
}
