/**
 * CALIMA · the lookout's warning (people; BUILD M1.5d: "a lookout's warning when an Instrument comes within 80 m"; the
 * acceptance row: the warning fires within 3 s at 80 m). `ctx.people.routines.lookout`.
 *
 * The lookout is the lamp keeper the routines drive (lantern-keeper-2). Four times a second the nearest live Instrument
 * (`ctx.machines.list`) is measured on the ground plane from her; the first time one is at 80 m or nearer she stops what she
 * is doing, turns to it and calls (Idle_Rail_Call, 4 s), and the call is one line of the `lookout` bark set
 * (src/game/text/barks/saltrow.json, writing's file: the lines are handed in by the people system, never typed here). The
 * call goes to the subtitle while Brea is within 150 m of her, and to `ctx.events` as 'npc-warning' whatever the distance.
 * She does not call again until every Instrument has been past 100 m for 10 s; then the set's last line (the all-clear) once.
 *
 * Nothing allocates per tick: the scan reads numbers off the list. In a ?shot film nothing is adopted, so nothing calls.
 */
export const LOOKOUT = Object.freeze({ range: 80, clear: 100, clearFor: 10, scan: 0.25, callFor: 4, hear: 150 });

export class Lookout {
  /** `routines` the Routines instance; `lines` the lookout set's lines ([[line, ...], ...], the last is the all-clear). */
  constructor(routines, lines = null) {
    this.routines = routines;
    this.ctx = routines.ctx;
    this.lines = lines;
    this.armed = true;
    this.k = 0;
    this._scanT = 0;
    this._clearT = 0;
    this.clock = 0;          // seconds since the lookout started (the log's clock)
    this.nearest = Infinity; // metres, at the last scan
    this.inRangeAt = null;   // the clock when the last scan first found one at or inside the range (the probe reads the delay)
    this.warnings = [];      // { t, d, kind, line, delay } (bounded)
  }

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
    let best = Infinity, who = null;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m._disposed || m.alive === false || !m.position) continue;
      const dx = m.position.x - kp.x, dz = m.position.z - kp.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) { best = d; who = m; }
    }
    this.nearest = best;
    if (best <= LOOKOUT.range) {
      if (this.inRangeAt === null) this.inRangeAt = this.clock;
      this._clearT = 0;
      if (this.armed) this._warn(e, who, best);
      return;
    }
    if (best > LOOKOUT.range) this.inRangeAt = null;
    if (!this.armed && best > LOOKOUT.clear) {
      this._clearT += LOOKOUT.scan;
      if (this._clearT >= LOOKOUT.clearFor) { this.armed = true; this._clearT = 0; this._say(e, this.lines?.[this.lines.length - 1], 'npc-all-clear', null, best); }
    } else this._clearT = 0;
  }

  _warn(e, m, d) {
    this.armed = false;
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
    this._say(e, line, 'npc-warning', m, d);
  }

  _say(e, line, ev, m, d) {
    const rec = { t: +this.clock.toFixed(3), d: +d.toFixed(2), kind: m?.kind || null, line: line ? line.join(' ') : null, ev, delay: this.inRangeAt !== null && ev === 'npc-warning' ? +(this.clock - this.inRangeAt).toFixed(3) : null };
    this.warnings.push(rec);
    if (this.warnings.length > 64) this.warnings.shift();
    this.ctx.events?.emit?.(ev, { who: 'LANTERN-KEEPER', id: e.id, line, d: rec.d, kind: rec.kind });
    const pl = this.ctx.player?.position, kp = e.person.group.position;
    const heard = !pl || Math.hypot(pl.x - kp.x, pl.z - kp.z) <= LOOKOUT.hear;
    if (line && heard) this.ctx.systemsGame?.present?.subtitle?.(line, 'LANTERN-KEEPER');
  }
}
