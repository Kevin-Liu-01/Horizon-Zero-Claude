import { CertRules, PERKS, actsFromQuests, RANK_AT, actsOfEvent } from './rules.js';
import { saveFieldsOf } from '../save/fields.js';
import { fill } from '../strings.js';

/**
 * THE CERTIFICATIONS, live (Milestone 2 wave 4, area E; HR11). The rules are ./rules.js; this listens for the survey
 * acts the areas already send, counts them, grants a rank the moment its count is met, shows the award card
 * (src/ui/award.js: a glass card for 4 s, the net of three 44 px circles and 1 px rules, never a hexagon) and applies the
 * rank's perk. It never listens to 'machine-killed': no kill moves a counter.
 *
 *   ctx.certs            this: report(), of(cert), perks (what the granted ranks give, for the areas that read them)
 *   events in            'benchmark-resurveyed' {id} · 'resurvey-done' {benchmark} · 'triangle-closed' {id}
 *                        · 'part-torn' / 'machine-damaged' {tornPart} (a tool Pried) · 'ammo-crafted' {ammo} (a pot)
 *                        · 'plumb-dark' (a lamp darkened) · 'arrow-hit' {weak, point, machine} (a vial at 30 m or more)
 *                        · "Raker's Morning"'s crossing done unseen (read off the spine once)
 *   events out           'certification-granted' { cert, rank, act, perk, card: { line, act } }
 *   save                 the save seam's `certs` field; a record with none (a slice save, Q5) is counted from its quests
 *
 * Perks applied here: Ballast I and IV +15 to her health's ceiling (and to her health), Ballast II a third Gourd. The
 * others are published in `ctx.certs.perks` for their owners (combat's Steady reads `steadyS`; armory the satchel).
 */
const POT_AMMO = new Set(['blast-bomb', 'brine-pot', 'cinder-pot', 'dust-pot', 'net']);
const VIAL_M = 30;

export class Certifications {
  constructor(ctx, { text } = {}) {
    this.ctx = ctx;
    // the writing (src/game/text/ui/certs.json), handed in by src/game/text.js's one importer (node --test reads the file)
    this.T = text;
    this.rules = new CertRules();
    this.perks = {};
    this.cards = [];
    this._torn = new WeakMap();
    this._crossCounted = false;
    ctx.certs = this;
    this._listen();
    this._field();
  }

  _field() {
    try {
      saveFieldsOf(this.ctx).register('certs', {
        get: () => ({ ...this.rules.serialize(), crossCounted: this._crossCounted }),
        set: (v) => {
          if (v && this.rules.restore(v)) { this._crossCounted = !!v.crossCounted; this._derive = false; }
          else { this.rules.reset(); this._crossCounted = false; this._derive = true; }
          this._perksFromRanks();
        },
      });
    } catch (err) { console.warn('[systems] save field certs:', err?.message || err); }
  }

  _listen() {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    const on = (n, fn) => ev.on(n, (e) => { try { fn(e || {}); } catch (err) { this.errors = (this.errors ?? 0) + 1; this.lastError = String(err?.message || err); } });
    on('benchmark-resurveyed', (e) => this.count('benchmark', e.id ?? null));
    on('resurvey-done', (e) => this.count('resection', e.benchmark ?? null));
    on('triangle-closed', (e) => this.count('triangle', e.id ?? null));
    // one act per part per machine ('part-torn' and 'machine-damaged' can both report the same Pry)
    const torn = (m, part) => {
      const key = m && typeof m === 'object' ? m : this;
      let set = this._torn.get(key);
      if (!set) { set = new Set(); this._torn.set(key, set); }
      if (set.has(part)) return;
      set.add(part);
      this.count('pried', part);
    };
    on('part-torn', (e) => torn(e.machine, e.part?.name ?? e.part?.id ?? e.part ?? 'part'));
    on('machine-damaged', (e) => { const tp = e.tornPart; if (tp) torn(e.machine, tp.name ?? tp.id ?? String(tp)); });
    on('ammo-crafted', (e) => { if (POT_AMMO.has(e.ammo)) this.count('made', e.ammo); });
    on('plumb-dark', () => this.count('dark', 'plumb'));
    on('arrow-hit', (e) => {
      if (!e.weak || !e.point) return;
      const m = e.machine;
      const name = String(e.part?.name ?? e.weakName ?? e.partName ?? '');
      if (!(m?.kind === 'plumb' && (/vial/i.test(name) || !name))) return;
      const p = this.ctx.player?.position;
      if (p && Math.hypot(e.point.x - p.x, e.point.z - p.z) >= VIAL_M) this.count('vial', 'plumb');
    });
    // M3 wave 3 (area E, HT6): the counted-acts seam (./rules.js COUNTED_EVENTS) for the acts no M2 listener above counts.
    // A seam event for an act one of them already counts is left to it, so no act is counted twice: the Plumb's lamp
    // ('plumb-dark') and its vial ('arrow-hit'), a Pry ('part-torn'), a pot made ('ammo-crafted'), a re-survey
    // ('benchmark-resurveyed', 'resurvey-done') and a triangle ('triangle-closed'). combat's own 'undercut' {machine,
    // killed} carries no part and counts nothing (actsOfEvent): an Undercut that kills is a kill.
    const carry = this._seamCarry = { reed: 0 };
    const seam = (name, skip = null) => on(name, (e) => {
      if (skip?.(e)) return;
      for (const a of actsOfEvent(name, e, carry)) this.countN(a.act, a.n, a.at);
    });
    seam('transect:crossed');
    seam('reed:metres');
    seam('undercut');
    seam('lamp:dark', (e) => e.kind === 'plumb');
    seam('vial:30m', (e) => e.kind === 'plumb');
  }

  /** Count `n` of one act at once (the reed's 25 m steps); grant what they earn. Returns the grants. */
  countN(act, n = 1, at = null) {
    const g = this.rules.count(act, { n, at });
    for (const r of g) this._grant(r);
    return g;
  }

  /** Count one act; grant what it earns. Returns the grants. */
  count(act, at = null) {
    const g = this.rules.count(act, { at });
    for (const r of g) this._grant(r);
    return g;
  }

  _perkWord(cert, rank) { return this.T.certs[cert]?.perks?.[rank - 1] ?? ''; }

  /** The card's two lines: `BEARING II · BACK BEARING`, and the act counted. */
  cardFor(r) {
    const name = this.T.certs[r.cert]?.name ?? r.cert.toUpperCase();
    const line = `${name} ${this.T.ranks[r.rank - 1] ?? r.rank} · ${this._perkWord(r.cert, r.rank)}`;
    const act = `${this.T.acts[r.act] ?? ''} · ${fill(this.T.count, { n: r.n, of: r.of })}`;
    return { line, act, cert: r.cert, rank: r.rank };
  }

  _grant(r) {
    const perk = PERKS[r.cert]?.[r.rank - 1] ?? {};
    this._apply(perk);
    const card = this.cardFor(r);
    this.cards.push({ ...card, t: Date.now() });
    this.ctx.events?.emit?.('certification-granted', { cert: r.cert, rank: r.rank, act: r.act, perk, card });
    this._show(card);
  }

  _apply(perk) {
    const p = this.ctx.player;
    if (perk.maxHealth && p && Number.isFinite(p.maxHealth)) {
      p.maxHealth += perk.maxHealth;
      if (Number.isFinite(p.health)) p.health = Math.min(p.maxHealth, p.health + perk.maxHealth);
      this.ctx.events?.emit?.('player-hurt', { health: p.health, max: p.maxHealth });
    }
    if (perk.gourds && p && Number.isFinite(p.maxGourd)) p.maxGourd += perk.gourds;
    for (const [k, v] of Object.entries(perk)) if (k !== 'maxHealth' && k !== 'gourds') this.perks[k] = v;
  }

  /** The perks the ranks held give, without re-applying the vitals (a record carries her health's ceiling itself). */
  _perksFromRanks() {
    this.perks = {};
    for (const [cert, rank] of Object.entries(this.rules.ranks())) {
      for (let i = 0; i < rank; i++) for (const [k, v] of Object.entries(PERKS[cert][i] || {})) if (k !== 'maxHealth' && k !== 'gourds') this.perks[k] = v;
    }
  }

  _show(card) {
    if (typeof document === 'undefined') return;
    import('../../ui/award.js').then((m) => m.showAward(this.ctx, card, { head: this.T.head, ranks: this.rules.ranks(), names: this.T.certs, rankWords: this.T.ranks }))
      .catch((err) => console.warn('[systems] award card:', err?.message || err));
  }

  /** After a record is applied (FirstHour.afterRestore): a record with no certifications is counted from its quests. */
  afterRestore(rm, tg) {
    if (!this._derive) return;
    this._derive = false;
    const acts = actsFromQuests(rm?.serialize?.() ?? rm, tg?.serialize?.() ?? tg);
    // counted quietly: what a record held was granted when it was earned (no card, no second perk)
    for (const a of acts) this.rules.count(a.act, { at: a.at });
    this._crossCounted = acts.some((a) => a.act === 'unseen') || this._crossCounted;
    this._perksFromRanks();
  }

  /** The slice's crossing, read once when it closes unseen (the spine records it; no event names it). */
  update(spine) {
    if (this._crossCounted || !spine?.st?.cross) return;
    const c = spine.st.cross;
    if (c.state !== 'done') return;
    this._crossCounted = true;
    if (!c.flagged && !c.seen) this.count('unseen', 'peg-line');
  }

  newGame() { this.rules.reset(); this.perks = {}; this.cards = []; this._torn = new WeakMap(); this._crossCounted = false; this._derive = false; if (this._seamCarry) this._seamCarry.reed = 0; }

  of(cert) { return this.rules.of(cert); }

  report() { return { counts: this.rules.counts(), ranks: this.rules.ranks(), granted: this.rules.granted.slice(), log: this.rules.log.slice(-12), perks: { ...this.perks }, rankAt: RANK_AT.slice() }; }

  dispose() { /* listeners live with ctx.events */ }
}
