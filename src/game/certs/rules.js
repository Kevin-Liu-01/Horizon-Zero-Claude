/**
 * THE CERTIFICATIONS, rules (Milestone 2 wave 4, area E: the first award of M2.10; BIBLE 8.5, 15). Pure: no DOM, no
 * THREE, no ctx; node --test grades it (tools/gates/systems/certs.test.mjs, HR11).
 *
 * Brea's guild standing in three disciplines, each rank earned by a COUNTED SURVEY ACT and granted the moment the count
 * is met. KILLS MOVE NO COUNTER: `count()` takes an act id from ACTS and nothing else; an Instrument killed is not one.
 *
 *   ACTS        act id -> the certification it counts for (BIBLE 15's table, "the act counted")
 *     ballast   benchmark (a benchmark re-surveyed) · pried (a tool Pried off an Instrument) · made (a pot or a net made)
 *     bearing   triangle (a triangle sighted) · resection (a re-survey's three bearings closed: the triangle it sights
 *               from the benchmark) · dark (a lamp darkened without a kill) · vial (a vial cracked from 30 m or more)
 *     transect  unseen (a live transect crossed unseen) · undercut · reed (each 25 m moved hidden in reed)
 *   RANK_AT     the counts at which ranks I-IV are granted (starting values, the same for the three: 2, 5, 9, 14)
 *
 * In the first hour the slice counts one Ballast act (the bob Pried) and one Bearing act (the triangle T1-T2-T6), and
 * the re-survey at Benchmark 1 counts one of each (the benchmark; its three bearings): BALLAST I and BEARING I are the
 * hour's first award, at the re-survey. A Transect crossing unseen counts one Transect act and grants nothing yet.
 *
 *   const C = new CertRules()
 *   C.count(act, { n = 1, at = null }) -> [{ cert, rank, act }]   the ranks this act granted (usually none)
 *   C.of(cert) -> { n, rank }            C.ranks()                C.serialize() / C.restore(d)
 */
export const CERTS = Object.freeze(['transect', 'bearing', 'ballast']);

export const ACTS = Object.freeze({
  benchmark: 'ballast', pried: 'ballast', made: 'ballast',
  triangle: 'bearing', resection: 'bearing', dark: 'bearing', vial: 'bearing',
  unseen: 'transect', undercut: 'transect', reed: 'transect',
});

/** The counted acts at which ranks I, II, III and IV are granted (BIBLE 15: 3-5 ranks; four here). */
export const RANK_AT = Object.freeze([2, 5, 9, 14]);
export const MAX_RANK = RANK_AT.length;

/** What a rank does when it is granted (the live half applies it; the words are the writing's). */
export const PERKS = Object.freeze({
  ballast: Object.freeze([{ maxHealth: 15 }, { gourds: 1 }, { satchel: true }, { maxHealth: 15, quickMakeS: 0.8 }]),
  bearing: Object.freeze([{ steadyS: 5 }, { backBearing: true }, { drawK: 0.9 }, { sightingK: 1.25 }]),
  transect: Object.freeze([{ crouchNoiseK: 0.7 }, { reedHideMS: 3 }, { laneWalker: true }, { undercutLarge: true }]),
});

export const rankOf = (n) => { let r = 0; for (const at of RANK_AT) if (n >= at) r++; return r; };

export class CertRules {
  constructor() { this.reset(); }

  reset() {
    /** @type {Record<string, { n: number, rank: number }>} */
    this.c = Object.fromEntries(CERTS.map((k) => [k, { n: 0, rank: 0 }]));
    /** every act counted, in order: { act, cert, n, at } (at: a caller's tag, e.g. the benchmark's id) */
    this.log = [];
    this.granted = [];
  }

  /** Count a survey act. Anything that is not one of ACTS (a kill, above all) is refused and changes nothing. */
  count(act, { n = 1, at = null } = {}) {
    const cert = ACTS[act];
    if (!cert) return [];
    const k = Math.max(0, Math.floor(n));
    if (!k) return [];
    const rec = this.c[cert];
    rec.n += k;
    this.log.push({ act, cert, n: k, at });
    const out = [];
    const want = rankOf(rec.n);
    while (rec.rank < want) {
      rec.rank++;
      const g = { cert, rank: rec.rank, act, n: rec.n, of: RANK_AT[rec.rank - 1] };
      this.granted.push(g);
      out.push(g);
    }
    return out;
  }

  of(cert) { return { ...this.c[cert] }; }
  ranks() { return Object.fromEntries(CERTS.map((k) => [k, this.c[k].rank])); }
  counts() { return Object.fromEntries(CERTS.map((k) => [k, this.c[k].n])); }

  serialize() {
    return { v: 1, c: Object.fromEntries(CERTS.map((k) => [k, [this.c[k].n, this.c[k].rank]])), log: this.log.slice(-64), granted: this.granted.slice() };
  }

  restore(d) {
    this.reset();
    if (!d || d.v !== 1) return false;
    for (const k of CERTS) {
      const v = d.c?.[k];
      if (Array.isArray(v)) { this.c[k].n = Math.max(0, v[0] | 0); this.c[k].rank = Math.max(0, Math.min(MAX_RANK, v[1] | 0)); }
    }
    this.log = Array.isArray(d.log) ? d.log.slice() : [];
    this.granted = Array.isArray(d.granted) ? d.granted.slice() : [];
    return true;
  }
}

/**
 * The acts a record already holds when it carries no certifications (a slice save carried forward, Q5; or any record
 * written before wave 4): read from the quests' own records, so carrying a save forward loses no act. Returns
 * [{ act, at }]. `rm` is "Raker's Morning"'s serialize(), `tg` "True Ground"'s.
 */
export function actsFromQuests(rm, tg) {
  const out = [];
  const st = (q, id) => (Array.isArray(q?.stages?.[id]) ? q.stages[id][0] : null);
  const flags = (q, id) => (Array.isArray(q?.stages?.[id]) ? { flagged: !!q.stages[id][2], seen: !!q.stages[id][3] } : null);
  if (st(rm, 'pry') === 'done') out.push({ act: 'pried', at: 'bob' });
  for (const t of (rm?.triangles || [])) out.push({ act: 'triangle', at: t });
  if (!rm?.triangles?.length && st(rm, 'survey') === 'done') out.push({ act: 'triangle', at: 'slice' });
  const cr = flags(rm, 'cross');
  if (st(rm, 'cross') === 'done' && cr && !cr.flagged && !cr.seen) out.push({ act: 'unseen', at: 'peg-line' });
  if (st(tg, 'survey') === 'done') { out.push({ act: 'benchmark', at: 'bm-01' }); out.push({ act: 'resection', at: 'bm-01' }); }
  return out;
}
