import { saveFieldsOf } from '../save/fields.js';
import { KilnYardsQuest } from './kiln-yards.js';

/**
 * HOUR TWO, LIVE (Milestone 3 wave 3, area E): the hub the hour-two quests hang on, installed by the systems runtime
 * (src/game/runtime.js installGame, one call) after the first hour. It owns the save seam's `hour2` field
 * (src/game/save/fields.js) and hands each quest and area a PART of it, so one field carries hour two without two owners:
 *
 *   ctx.hour2                       this
 *   ctx.hour2.part(key, { get, set })   a quest's or an area's slice of the field (its own key); set(null) on a fresh game
 *   ctx.hour2.kilnYards             "The Kiln Yards" (./kiln-yards.js)
 *   ctx.hour2.heldRungs()           the rungs held at a giver's ('rung-7' at Oro's while rung 6 is not owned)
 *   ctx.hour2.report()
 *
 * The field's shape (HT5): { quests: { [id]: part }, wellheads: { [id]: { state, plugged } }, held: [id], ...every key a
 * record carried that no part claims (a fixture's kite, sonde, nets, rungs), kept as it came so a round trip loses none }.
 * The kite quest (area B, its own file) registers its part here when it lands (`ctx.hour2.part('glass-line', ...)`).
 * It is a system of the game (ctx.game.systems): update(dt) at the sim rate.
 */
const QUEST_PARTS = new Set(['kiln-yards', 'glass-line', 'wrong-tide']);

export class HourTwo {
  constructor(ctx, sys) {
    this.ctx = ctx;
    this.sys = sys;
    this.parts = new Map();
    this.carry = {};
    this._held = new Set();
    ctx.hour2 = this;
    saveFieldsOf(ctx).register('hour2', { get: () => this._get(), set: (v) => this._set(v) });
    this.kilnYards = new KilnYardsQuest(this);
    this._hookNewGame();
  }

  /** A slice of the hour-two field: quests under `quests[key]`, anything else at the top level under `key`. */
  part(key, pair) {
    if (this.parts.has(key)) throw new Error(`hour2 part '${key}' is registered twice`);
    this.parts.set(key, pair);
    return () => this.parts.delete(key);
  }

  held(id) { if (id) this._held.add(id); }
  heldRungs() { return [...this._held]; }

  _get() {
    const out = JSON.parse(JSON.stringify(this.carry || {}));
    out.quests = { ...(out.quests || {}) };
    for (const [k, p] of this.parts) {
      let v = null;
      try { v = p.get(); } catch (err) { console.warn(`[hour2] part ${k}: get threw`, err?.message || err); }
      if (QUEST_PARTS.has(k)) out.quests[k] = v; else out[k] = v;
    }
    out.held = [...this._held];
    return out;
  }

  _set(v) {
    this.carry = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : {};
    this._held = new Set(Array.isArray(this.carry.held) ? this.carry.held : []);
    for (const [k, p] of this.parts) {
      const val = QUEST_PARTS.has(k) ? (this.carry.quests?.[k] ?? null) : (this.carry[k] ?? null);
      try { p.set(val); } catch (err) { console.warn(`[hour2] part ${k}: set threw`, err?.message || err); }
    }
  }

  _hookNewGame() {
    const sys = this.sys;
    if (!sys || typeof sys.newGame !== 'function' || sys.__hour2NewGame) return;
    sys.__hour2NewGame = true;
    const ng = sys.newGame.bind(sys);
    sys.newGame = (...a) => { this.carry = {}; this._held = new Set(); this.kilnYards.newGame(); return ng(...a); };
    // Oro speaks for hour two once the first hour has nothing for him (FirstHour.talk answers only "The Scar")
    const talk = sys.talk.bind(sys);
    sys.talk = (npc) => { if (npc === 'oro' && this.kilnYards.talk('oro')) return; return talk(npc); };
  }

  update(dt) { this.kilnYards.update(dt); }

  report() { return { kilnYards: this.kilnYards.report(), held: this.heldRungs(), parts: [...this.parts.keys()] }; }

  dispose() { this.kilnYards.dispose(); }
}

/** One call from the systems runtime: hour two beside the first hour, updated as a system of the game. */
export function installHourTwo(ctx, sys) {
  if (ctx.hour2) return ctx.hour2;
  const h = new HourTwo(ctx, sys);
  ctx.game?.systems?.push?.(h);
  return h;
}
