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
 */
export const LOOKOUT = Object.freeze({ range: 80, clear: 100, clearFor: 10, scan: 0.25, callFor: 4, hear: 150 });

export class Lookout {
  /** `routines` the Routines instance; `lines` the lookout set's lines ([[line, ...], ...], the last is the all-clear). */
  constructor(routines, lines = null) {
    this.routines = routines;
    this.ctx = routines.ctx;
    this.lines = lines;
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
    this._cleared = 0;
    this._sweep = this._sweep.bind(this);
  }

  /** True when no Instrument she has warned of is still known (the old single arming; kept for probes and the log). */
  get armed() { return this.known === 0; }

  /** The machine list to scan: `ctx.machines.list` (a probe may set `source`). */
  _list() { return this.source || this.ctx.machines?.list || null; }

  _keeper() {
    const L = this.routines.list;
    for (let i = 0; i < L.length; i++) if (L[i].id === 'lantern-keeper-2') return L[i];
    return null;
  }

  update(dt) {
    this.clock += dt;
    this._scanT -= dt;
    if (this._scanT > 0) return;
    this._scanT += LOOKOUT.scan;
    if (this._scanT < 0) this._scanT = 0;
    const e = this._keeper();
    const list = this._list();
    if (!e || !list) { this.nearest = Infinity; return; }
    const kp = e.person.group.position;
    const n = ++this._scanN;
    let near = Infinity, best = Infinity, who = null, whoS = null;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m._disposed || m.alive === false || !m.position) continue;
      const dx = m.position.x - kp.x, dz = m.position.z - kp.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < near) near = d;
      let s = this.seen.get(m);
      if (d <= LOOKOUT.range) {
        if (!s) { s = { warned: false, inAt: this.clock, farT: 0, scan: n }; this.seen.set(m, s); }
        if (s.inAt === null) s.inAt = this.clock;
        s.farT = 0; s.scan = n;
        if (!s.warned && d < best) { best = d; who = m; whoS = s; }
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
    if (who) {
      whoS.warned = true; this.known++;
      this.inRangeAt = whoS.inAt;
      this._warn(e, who, best, this.clock - whoS.inAt);
    } else if (this._cleared && this.known === 0) {
      this._say(e, this.lines?.[this.lines.length - 1], 'npc-all-clear', null, near, null);
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
    this.ctx.events?.emit?.(ev, { who: 'LANTERN-KEEPER', id: e.id, line, d: rec.d, kind: rec.kind });
    const pl = this.ctx.player?.position, kp = e.person.group.position;
    const heard = !pl || Math.hypot(pl.x - kp.x, pl.z - kp.z) <= LOOKOUT.hear;
    if (line && heard) this.ctx.systemsGame?.present?.subtitle?.(line, 'LANTERN-KEEPER');
  }
}
