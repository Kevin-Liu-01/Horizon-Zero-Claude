/**
 * CALIMA · the lookout's warning (people; BUILD M1.5d: "a lookout's warning when an Instrument comes within 80 m"; the
 * acceptance row: the warning fires within 3 s at 80 m). `ctx.people.routines.lookout`.
 *
 * The lookout is the lamp keeper the routines drive (lantern-keeper-2). Four times a second every live Instrument
 * (`ctx.machines.list`) is measured on the ground plane from her. EACH INSTRUMENT IS WARNED OF ONCE: the first scan that
 * finds one she has not warned of at 80 m or nearer, she stops what she is doing, turns to it and calls (Idle_Rail_Call,
 * 4 s), and the call is one line of the `lookout` bark set (src/game/text/barks/saltrow.json, writing's file: the lines are
 * handed in by the people system, never typed here). The call goes to the subtitle while Brea is within 150 m of her, and
 * to `ctx.events` as 'npc-warning' whatever the distance. An Instrument she has warned of is forgotten once it has been
 * past 100 m for 10 s (or is dead, or gone from the list); when the last one she warned of is forgotten she says the set's
 * last line (the all-clear) once.
 *
 * (M1.5d fix round 2: she used to hold ONE arming for every Instrument, re-armed only when all of them had been past
 * 100 m for 10 s. The live world keeps a Gauge 37 m from her, so she warned once at t = 0.27 s and never again in the
 * two-hour log. Now the Gauge is warned of once and stays known, and every other Instrument that comes in is called.)
 *
 * Nothing allocates per tick: the scan reads numbers off the list, and the record per Instrument is made only when one
 * first comes within 80 m (`seen`, swept with a bound callback, no iterator).
 *
 * M2 wave 3 (area B; BUILD M2.13, "the M1.5d log rows at Ninewalls"): THE LOOKOUT RULE IN THE HOLDS. Ninewalls has no lamp
 * keeper: every one of its people watches (`opts.all`), each Instrument is measured from the NEAREST of them, and that one
 * calls. The herd is not called (`opts.ignore`: the Tillers core beside the farms all day and the youths walk behind them;
 * a call for every hull would be a call every minute). Instruments that come in together are one call (`opts.group`: a
 * Sickle pack, a Screed with its flankers). The line is the `lookout-holds` set when writing has one, else none: the call
 * gesture and the 'npc-warning' event still go out (who: `opts.who`).
 * The Saltrow keeper's behaviour is unchanged (the defaults below are hers).
 */
export const LOOKOUT = Object.freeze({ range: 80, clear: 100, clearFor: 10, scan: 0.25, callFor: 4, hear: 150, groupFor: 6, packR: 15 });

export class Lookout {
  /**
   * `routines` the Routines instance; `lines` the lookout set's lines ([[line, ...], ...], the last is the all-clear);
   * `opts` { id: the keeper's loop id, all: every routine person keeps the lookout, ignore: kinds never called, group: one call
   * for all that came in together, who: the subtitle's speaker }.
   */
  constructor(routines, lines = null, opts = {}) {
    this.routines = routines;
    this.ctx = routines.ctx;
    this.lines = lines;
    this.opts = { id: 'lantern-keeper-2', all: false, ignore: null, group: false, who: 'LANTERN-KEEPER', ...opts };
    this.k = 0;
    this._scanT = 0;
    this._scanN = 0;
    this.clock = 0;          // seconds since the lookout started (the log's clock)
    this.nearest = Infinity; // metres, at the last scan (any Instrument, warned of or not)
    this.inRangeAt = null;   // the clock when the Instrument she warned of last came within the range (the probe reads the delay)
    this.warnings = [];      // { t, d, kind, line, ev, delay } (bounded)
    /** per Instrument: { warned, inAt, farT, scan } (made when it first comes within the range) */
    this.seen = new Map();
    this.known = 0;          // how many Instruments she has warned of and not yet forgotten
    this._lastCall = -Infinity;
    this._cleared = 0;
    this._sweep = this._sweep.bind(this);
    this._groupMark = this._groupMark.bind(this);
    this._packTest = this._packTest.bind(this);
  }

  /** (opts.group) Is `m` within packR of an Instrument already called and still known? */
  _packOf(m) {
    this._packM = m; this._packHit = false;
    this.seen.forEach(this._packTest);
    return this._packHit;
  }

  _packTest(s, q) {
    if (this._packHit || !s.warned || q === this._packM || !q.position) return;
    const a = this._packM.position;
    if ((q.position.x - a.x) ** 2 + (q.position.z - a.z) ** 2 <= LOOKOUT.packR * LOOKOUT.packR) this._packHit = true;
  }

  /** (opts.group) an Instrument in range this scan and not yet warned of is in this call. */
  _groupMark(s) { if (!s.warned && s.inAt !== null && s.scan === this._scanNow) { s.warned = true; this.known++; } }

  /** True when no Instrument she has warned of is still known (the old single arming; kept for probes and the log). */
  get armed() { return this.known === 0; }

  /** The machine list to scan: `ctx.machines.list` (a probe may set `source`). */
  _list() { return this.source || this.ctx.machines?.list || null; }

  _keeper() {
    const L = this.routines.list, id = this.opts.id;
    for (let i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }

  /** Who keeps the lookout nearest (x, z) and the distance (`_nd`): the one keeper, or (opts.all) every routine person. */
  _nearest(x, z, one) {
    if (!this.opts.all) { const p = one.person.group.position; this._nd = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2); return one; }
    const L = this.routines.list;
    let best = null, bd = Infinity;
    for (let i = 0; i < L.length; i++) {
      const p = L[i].person.group.position, dx = x - p.x, dz = z - p.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = L[i]; }
    }
    this._nd = Math.sqrt(bd);
    return best;
  }

  update(dt) {
    this.clock += dt;
    this._scanT -= dt;
    if (this._scanT > 0) return;
    this._scanT += LOOKOUT.scan;
    if (this._scanT < 0) this._scanT = 0;
    const e0 = this.opts.all ? this.routines.list[0] : this._keeper();
    const list = this._list();
    if (!e0 || !list) { this.nearest = Infinity; return; }
    const n = ++this._scanN;
    const ign = this.opts.ignore;
    let near = Infinity, best = Infinity, who = null, whoS = null, caller = e0, fresh = 0;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m._disposed || m.alive === false || !m.position) continue;
      if (ign && ign.has(m.kind)) continue;
      const w = this._nearest(m.position.x, m.position.z, e0);
      const d = this._nd;
      if (d < near) near = d;
      let s = this.seen.get(m);
      if (d <= LOOKOUT.range) {
        if (!s) { s = { warned: false, inAt: this.clock, farT: 0, scan: n }; this.seen.set(m, s); }
        if (s.inAt === null) s.inAt = this.clock;
        s.farT = 0; s.scan = n;
        if (!s.warned) { fresh++; if (d < best) { best = d; who = m; whoS = s; caller = w; } }
      } else if (s) {
        s.scan = n;
        s.inAt = null;
        if (!s.warned) { this.seen.delete(m); continue; }
        if (d > LOOKOUT.clear) s.farT += LOOKOUT.scan; else s.farT = 0;
      }
    }
    this.nearest = near;
    // forget what has been past the clear distance long enough, is dead, or has left the list
    this._cleared = 0;
    this._scanNow = n;
    this.seen.forEach(this._sweep);
    if (who && this.opts.group && (this.clock - this._lastCall < LOOKOUT.groupFor || this._packOf(who))) {
      // (the Holds) one that comes in within groupFor s of a call, or within packR of one already called, came in with it (the
      // pack behind its first): no new call
      this._scanNow = n; this.seen.forEach(this._groupMark);
    } else if (who) {
      whoS.warned = true; this.known++;
      this.inRangeAt = whoS.inAt;
      // (the Holds) every other one that came in with it is in the same call
      if (this.opts.group && fresh > 1) { this._scanNow = n; this.seen.forEach(this._groupMark); }
      this._lastCall = this.clock;
      this._warn(caller, who, best, this.clock - whoS.inAt);
    } else if (this._cleared && this.known === 0) {
      this._say(e0, this.lines?.[this.lines.length - 1], 'npc-all-clear', null, near, null);
    }
  }

  _sweep(s, m, map) {
    const gone = m._disposed || m.alive === false || s.scan !== this._scanNow;
    if (!gone && !(s.warned && s.farT >= LOOKOUT.clearFor)) return;
    map.delete(m);
    if (s.warned) { this.known--; this._cleared++; }
  }

  _warn(e, m, d, delay) {
    const n = this.lines ? Math.max(1, this.lines.length - 1) : 0;
    const line = n ? this.lines[this.k++ % n] : null;
    // she stops, turns to it and calls
    const p = e.person;
    p.stopWalk();
    const y = Math.atan2(m.position.x - p.group.position.x, m.position.z - p.group.position.z);
    p.yaw = y; p.group.rotation.y = y;
    if (!p.play('Idle_Rail_Call', { fade: 0.25 })) p.play('Idle_Loop', { fade: 0.25 });
    e.path = [];
    e.phase = 'do'; e.act = 'warn'; e.clip = 'Idle_Rail_Call'; e.t = 0; e.end = LOOKOUT.callFor;
    this._say(e, line, 'npc-warning', m, d, delay);
  }

  _say(e, line, ev, m, d, delay) {
    const rec = { t: +this.clock.toFixed(3), d: Number.isFinite(d) ? +d.toFixed(2) : null, kind: m?.kind || null, line: line ? line.join(' ') : null, ev, delay: delay == null ? null : +delay.toFixed(3) };
    this.warnings.push(rec);
    if (this.warnings.length > 64) this.warnings.shift();
    this.ctx.events?.emit?.(ev, { who: this.opts.who, id: e.id, line, d: rec.d, kind: rec.kind });
    const pl = this.ctx.player?.position, kp = e.person.group.position;
    const heard = !pl || Math.hypot(pl.x - kp.x, pl.z - kp.z) <= LOOKOUT.hear;
    if (line && heard) this.ctx.systemsGame?.present?.subtitle?.(line, this.opts.who);
  }
}
