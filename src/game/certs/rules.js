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

/* ------------------------------------------------------------------------------------------------------------------
 * THE COUNTED ACTS SEAM (Milestone 3, §3.2 of the area briefs; owner: systems). Typed on day 0 of wave 1.
 *
 * Events only: combat, instruments and items EMIT these names on ctx.events with these payloads; nobody else moves a
 * counter, and a kill emits nothing (no name below is a kill, and `actsOfEvent` refuses every other name). The live
 * half (./live.js) adopts the seam when the emitters do (wave 3); until then it keeps its M2 listeners, so no act is
 * counted twice. Pure: `node --test tools/gates/systems/certs-ranks.test.mjs`.
 *
 *   'transect:crossed'  {CrossedEvent}   a live transect crossed; counts 'unseen' only when she was not seen
 *   'undercut'          {UndercutEvent}  a part cut from under a hull (Transect IV: `large` only with undercutLarge)
 *   'reed:metres'       {ReedEvent}      metres moved hidden in reed since the last emit; 'reed' per REED_M
 *   'triangle'          {TriangleEvent}  a triangle sighted
 *   'lamp:dark'         {LampEvent}      a lamp darkened; counts 'dark' only without a kill
 *   'vial:30m'          {VialEvent}      a vial cracked; counts 'vial' only from VIAL_M or more
 *   'resurvey'          {ResurveyEvent}  a benchmark re-surveyed: 'benchmark' and 'resection' (its three bearings)
 *   'pry'               {PryEvent}       a tool Pried off a hull: 'pried' (once per hull and part: the emitter's dedupe)
 *   'made'              {MadeEvent}      a pot or a net made: 'made' (other makings count nothing)
 * ------------------------------------------------------------------------------------------------------------------ */

/**
 * @typedef {{ transect: string, unseen: boolean, flagged?: boolean }} CrossedEvent
 * @typedef {{ kind: string, part: string, large?: boolean }} UndercutEvent
 * @typedef {{ m: number }} ReedEvent
 * @typedef {{ id: string }} TriangleEvent
 * @typedef {{ kind: string, killed?: boolean }} LampEvent
 * @typedef {{ kind: string, m: number }} VialEvent
 * @typedef {{ benchmark: string, bearings?: number[] }} ResurveyEvent
 * @typedef {{ kind: string, part: string }} PryEvent
 * @typedef {{ item: string, n?: number }} MadeEvent
 * @typedef {'transect:crossed'|'undercut'|'reed:metres'|'triangle'|'lamp:dark'|'vial:30m'|'resurvey'|'pry'|'made'} CountedEventName
 * @typedef {{ act: keyof typeof ACTS, n: number, at: string|null }} CountedAct
 */

/** The seam's event names, in the order of §3.2's table. */
export const COUNTED_EVENTS = Object.freeze(['transect:crossed', 'undercut', 'reed:metres', 'triangle', 'lamp:dark', 'vial:30m', 'resurvey', 'pry', 'made']);
/** Metres hidden in reed per Transect act (BIBLE 15: "each 25 m moved hidden in reed"). */
export const REED_M = 25;
/** A vial counts from this many metres (BIBLE 15). */
export const VIAL_M = 30;
/** What may be 'made' for a Ballast act: the pots and the nets (BIBLE 15: "a pot or a net made"). */
export const MADE_ITEMS = Object.freeze(['blast-bomb', 'brine-pot', 'cinder-pot', 'dust-pot', 'hand-net', 'basalt-net', 'wire-net', 'net']);

/**
 * The acts one seam event counts. Pure but for the reed remainder, which the caller keeps in `carry` ({ reed: m }).
 * Anything that is not a seam event (a kill above all) returns [] and changes nothing.
 * @param {string} name
 * @param {any} e
 * @param {{ reed?: number }} [carry]
 * @returns {CountedAct[]}
 */
export function actsOfEvent(name, e = {}, carry = {}) {
  e = e || {};
  switch (name) {
    case 'transect:crossed': return e.unseen === true && !e.flagged ? [{ act: 'unseen', n: 1, at: e.transect ?? null }] : [];
    case 'undercut': return e.part ? [{ act: 'undercut', n: 1, at: `${e.kind ?? '?'}:${e.part}` }] : [];
    case 'reed:metres': {
      const m = Number(e.m);
      if (!(m > 0) || !Number.isFinite(m)) return [];
      const total = (carry.reed ?? 0) + m;
      const n = Math.floor(total / REED_M);
      carry.reed = total - n * REED_M;
      return n ? [{ act: 'reed', n, at: null }] : [];
    }
    case 'triangle': return e.id ? [{ act: 'triangle', n: 1, at: e.id }] : [];
    case 'lamp:dark': return e.killed ? [] : [{ act: 'dark', n: 1, at: e.kind ?? null }];
    case 'vial:30m': return Number(e.m) >= VIAL_M ? [{ act: 'vial', n: 1, at: e.kind ?? null }] : [];
    case 'resurvey': return e.benchmark ? [{ act: 'benchmark', n: 1, at: e.benchmark }, { act: 'resection', n: 1, at: e.benchmark }] : [];
    case 'pry': return e.part ? [{ act: 'pried', n: 1, at: `${e.kind ?? '?'}:${e.part}` }] : [];
    case 'made': return MADE_ITEMS.includes(e.item) ? [{ act: 'made', n: Math.max(1, Math.floor(e.n ?? 1)), at: e.item }] : [];
    default: return [];
  }
}

/** A CertRules fed by seam events: `emit(name, payload)` -> the ranks granted. The reed remainder rides in `carry`. */
export class CountedActs {
  constructor(rules = new CertRules()) { this.rules = rules; this.carry = { reed: 0 }; }
  /** @param {string} name @param {any} [e] */
  emit(name, e) {
    const out = [];
    for (const a of actsOfEvent(name, e, this.carry)) out.push(...this.rules.count(a.act, { n: a.n, at: a.at }));
    return out;
  }
}
