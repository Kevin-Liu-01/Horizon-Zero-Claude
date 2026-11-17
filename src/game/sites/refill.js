import { SiteClock, errorAt, inView } from './clock.js';

/**
 * THE SITE CLOCK, LIVE (BUILD M1.6n; BIBLE §17). Takes the respawn of every MachineSite off the stock scheduler's
 * timers (src/entities/machines/ai/sites.js draws 300-420 s; progression's policy re-times it to 90-540 s) and puts
 * it on the site clock of ./clock.js: 12 in-game hours, measuring kinds anywhere, correcting kinds only in error,
 * nothing within 80 m of Brea or in her view, nothing a quest emptied on true ground, never the quest's own spawns.
 *
 * No edit to the machines lane's files: a pending site's published `respawnAt` is held at Infinity, so the stock
 * scheduler never fires, and a site the clock lets return is filled here the way the scheduler fills one (the
 * machines system's own `spawn` with the site's placement, `machine-respawned`).
 *
 * Node-testable: everything it reads comes through `io` (src/game/runtime.js wires ctx):
 *   io.machines()      the machines system ({ spawn(kind, x, z, opts), sites: { sites[], respawned } }) or null
 *   io.player()        { x, z } or null
 *   io.camera()        { x, y, z, dx, dy, dz, fov, aspect, far } or null
 *   io.datum()         ctx.datum or null (see clock.js errorAt)
 *   io.questStages()   the running stages [{ quest, id, type, kind }] (a stage and the one that runs with it), or []
 *   io.emit(name, e)   the event bus
 */
export const TICK_S = 0.5;

export class SiteRefill {
  constructor(io, clock = new SiteClock()) {
    this.io = io;
    this.clock = clock;
    this.filled = 0;
    this.log = [];
    this._t = 0;
    const self = this;
    this.world = {
      get player() { return self.io.player?.() ?? null; },
      inView(x, z) { const c = self.io.camera?.(); return c ? inView(c, { x, y: self.io.groundAt?.(x, z) ?? c.y - 1.6, z }) : false; },
      inError(x, z) { return errorAt(self.io.datum?.() ?? null, x, z); },
    };
  }

  /** The quest spawned this machine for itself (runtime._spawn): it is never a site that refills. */
  own(machine, questId) {
    const s = machine?._site;
    if (s) s.questOwned = questId || true;
    return !!s;
  }

  /** `machine-killed`: its site is cleared at this hour on the site clock. */
  killed(machine) {
    const s = machine?._site;
    if (!s || s.id == null) return null;
    // a quest emptied it: a running stage asks for kills of this kind (or of any kind)
    const st = s.questOwned ? null : (this.io.questStages?.() ?? []).find((q) => q && q.type === 'kill' && (!q.kind || q.kind === s.kind));
    const emptiedBy = st ? (st.quest || 'quest') : null;
    return this.clock.clear(s, { quest: !!s.questOwned, emptiedBy });
  }

  /** `machine-disposed`: the stock scheduler has just timed its return; the clock owns it instead. */
  disposed(siteId) {
    const s = this._site(siteId);
    if (s && s.pending) s.respawnAt = Infinity;
  }

  _site(id) {
    const list = this.io.machines?.()?.sites?.sites;
    return Array.isArray(list) ? list.find((s) => s && s.id === id) ?? null : null;
  }

  /** Run the clock's rule over every pending site (every TICK_S). */
  update(dt) {
    this._t += dt;
    if (this._t < TICK_S) return 0;
    this._t = 0;
    return this.sweep();
  }

  sweep() {
    const M = this.io.machines?.();
    const list = M?.sites?.sites;
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (const s of list) {
      if (!s || !s.pending || s.machine) continue;
      s.respawnAt = Infinity;
      let e = this.clock.get(s.id);
      // a pending site the clock never saw cleared (a roster restore disposed it, or its kill was missed), or an entry a
      // record left under an id that now names another site: cleared now
      if (e && (e.kind !== String(s.kind) || Math.hypot(e.x - s.x, e.z - s.z) > 1)) { this.clock.forget(s.id); e = null; }
      if (!e) e = this.clock.clear(s, { quest: !!s.questOwned });
      if (s.questOwned && !e.quest) e.quest = true;
      const v = this.clock.verdict(s.id, this.world);
      if (!v.ok) continue;
      if (this.fill(M, s)) n++;
    }
    return n;
  }

  /** Put the site's Instrument back, the way the stock scheduler does. */
  fill(M, s) {
    let m = null;
    try { m = M.spawn(s.kind, s.x, s.z, { ...(s.opts || {}), _site: s }); } catch { m = null; }
    if (!m) return false;
    s.machine = m;
    s.pending = false;
    if (M.sites) M.sites.respawned = (M.sites.respawned ?? 0) + 1;
    this.clock.forget(s.id);
    this.filled++;
    this.log.push({ id: s.id, kind: s.kind, hour: Math.round(this.clock.hours * 1000) / 1000 });
    if (this.log.length > 32) this.log.shift();
    try { this.io.emit?.('machine-respawned', { machine: m, site: s.id, by: 'site-clock' }); } catch { /* foreign listener */ }
    return true;
  }

  /** For a row: every pending site and the clock's verdict on it. */
  report() {
    const list = this.io.machines?.()?.sites?.sites ?? [];
    const pending = list.filter((s) => s && s.pending && !s.machine)
      .map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, quest: s.questOwned ?? null, ...this.clock.verdict(s.id, this.world) }));
    return { hours: Math.round(this.clock.hours * 1000) / 1000, filled: this.filled, pending, log: this.log.slice() };
  }
}

/**
 * The site clock's time source in play: the environment's hour, read every frame. Forward steps of under an hour are
 * hours played; a larger jump (a record's hour put back, a death) is not counted; a rest counts the hours slept once,
 * when it begins. hourNow: decimal hour 0-24.
 */
export class HourMeter {
  constructor(clock) { this.clock = clock; this.last = null; this.resting = false; }
  /** Called every frame with the environment's hour; returns hours added. */
  read(hourNow) {
    const h = Number(hourNow);
    if (!Number.isFinite(h)) return 0;
    if (this.last == null || this.resting) { this.last = h; return 0; }
    let d = h - this.last;
    if (d < 0) d += 24;
    this.last = h;
    if (!(d > 0) || d >= 1) return 0;
    this.clock.advance(d);
    return d;
  }
  /**
   * A rest begins at `fromHour` toward `toHour`: the hours slept are counted now, forward from one to the other (the
   * Brazier writes the named save before it says the rest is over, and the record must carry them), and the frames of
   * the fade are not hours played. Returns the hours slept.
   */
  restStart(fromHour, toHour) {
    let d = Number(toHour) - Number(fromHour);
    if (!Number.isFinite(d)) d = 0;
    if (d < 0) d += 24;
    this.clock.advance(d);
    this.resting = true;
    return d;
  }
  /** The rest is over (or was refused after it began): reading resumes from this hour. */
  restEnd(hourNow) { this.resting = false; this.resync(hourNow); }
  /** A record's hour put back (Continue, a death): not counted. */
  resync(hourNow) { this.last = Number.isFinite(Number(hourNow)) ? Number(hourNow) : null; }
}
