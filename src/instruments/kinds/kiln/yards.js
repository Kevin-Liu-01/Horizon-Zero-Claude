import { ensureKind, spawnLive, despawnLive } from './live-kind.js';
import { KILN_KIND } from './kind.js';
import { SPINDLE_KIND } from '../spindle/kind.js';
import { DAVIT_KIND } from '../davit/kind.js';
import { DavitBrain } from '../davit/rules.js';

/**
 * THE YARDS' ENCOUNTER AS LIVE KINDS (Milestone 3 wave 3c, area C; Q4's default and R7; BUILD M3.3/M3.4). "The Kiln
 * Yards" (src/game/hour2/kiln-yards.js, area E) runs the encounter (src/game/hour2/kiln-yards-plan.js YardsEncounter:
 * two KilnBrains, one plugged and still, one awake on the shelf, and a SpindleEscort; never two awake) and, until wave
 * 3c, drew it with grey stand-ins. This draws it with the kinds themselves:
 *
 *   the Kilns    one live Kiln per encounter Kiln, its `brain` the encounter's own KilnBrain (the same object: the
 *                machine draws it, it keeps no copy). Lamp: cold dark (the fire is out of it), coupling or plugged calm,
 *                awake or walking to a head wary, the one that sees her hostile (its stack raised). `awake` is R7's count
 *                (the encounter's role 'awake' or 'going'), read every frame into `stats` (the page row)
 *   the Spindle  the encounter's SpindleEscort pose; grey (its ring is not ruled on)
 *   the Davit    "from the third wellhead" (Q4): it enters once two heads are quenched (the third is the next a Kiln
 *                plugs into), walking in from the shelf's east end beyond the patrol, and keeps about 20 m behind the
 *                nearest Kiln (DavitBrain `followM`), re-seating any part of a Kiln that is `off` (the Kiln's hose)
 *   Brine        a Brine Pot that lands with the door inside its mist springs a hot door (KilnBrain.brine: IK2's
 *                2.0 s stagger, damage x1); the quench of the head is the quest's own (it listens to the same event)
 *
 * While the kinds load (their GLBs are fetched on the first stand-up) the quest's grey stand-ins stand; `ready` says
 * when the kinds have taken over (the quest then hides its stand-ins). Bound machines carry `yardsBound`, so the quest's
 * own "a live Kiln already stands at the Yards" check does not count them.
 *
 *   const L = new YardsLive(ctx, Y, { seam })   Y: the quest's YardsEncounter; seam: the wellheads seam module
 *   L.sync(dt)                                  after the encounter's step, every frame
 *   L.ready / L.report() / L.dispose()
 */
const BRINE_R = 3.0;          // src/combat/pots.js POTS.brine.radius (its mist: a squat dome, top r x 1.1)

export class YardsLive {
  constructor(ctx, Y, { seam } = {}) {
    this.ctx = ctx; this.Y = Y; this.seam = seam;
    this.kilns = []; this.spindle = null; this.davit = null;
    this.ready = false; this.failed = null; this.disposed = false;
    this.stats = { frames: 0, maxAwake: 0, twoAwakeFrames: 0, maxAwakeEncounter: 0, davitIn: null, doorSprung: 0, brineOnHull: 0, spawned: [] };
    this._potOff = ctx.events?.on?.('pot-landed', (e) => { try { if (e?.id === 'brine' && e.at) this._brine(e.at); } catch (err) { this.lastError = String(err?.message || err); } }) || null;
    Promise.all([ensureKind(ctx, KILN_KIND), ensureKind(ctx, SPINDLE_KIND), ensureKind(ctx, DAVIT_KIND)]).then(([k, s, d]) => {
      if (this.disposed) return;
      if (!k) { this.failed = 'kiln'; return; }
      this._ok = { kiln: k, spindle: s, davit: d };
      this._stand();
    });
  }

  _stand() {
    const Y = this.Y, ctx = this.ctx;
    Y.kilns.forEach((k, i) => {
      const B = k.brain;
      const m = spawnLive(ctx, KILN_KIND.id, B.x, B.z, B.heading, { brain: B });
      if (!m) return;
      m.yardsBound = true; m.yardsIndex = i;
      this.kilns.push(m);
      this.stats.spawned.push({ kind: 'kiln', id: B.id });
    });
    if (Y.spindle && this._ok.spindle) {
      const s = Y.spindle;
      const m = spawnLive(ctx, SPINDLE_KIND.id, s.x, s.z, s.heading ?? 0);
      if (m) { m.yardsBound = true; this.spindle = m; this.stats.spawned.push({ kind: 'spindle' }); }
    }
    this.ready = this.kilns.length === Y.kilns.length;
    if (!this.ready) this.failed = 'kiln spawn';
  }

  /** The Davit walks in once two heads are quenched (the third wellhead is next): from beyond the shelf's east end. */
  _davitIn() {
    if (this.davit || !this._ok?.davit || this.stats.davitIn) return;
    if ((this.seam?.quenchedCount?.() ?? 0) < 2 || this.Y.quiet) return;
    const P = this.Y.R?.patrol, e = P ? P[P.length - 1] : { x: this.kilns[0]?.brain.x ?? 0, z: this.kilns[0]?.brain.z ?? 0 };
    const w = P ? P[0] : e, ux = e.x - w.x, uz = e.z - w.z, L = Math.hypot(ux, uz) || 1;
    const x = e.x + (ux / L) * 14, z = e.z + (uz / L) * 14;
    const brain = new DavitBrain({ x, z, heading: Math.atan2(-ux, -uz) });
    const m = spawnLive(this.ctx, DAVIT_KIND.id, x, z, brain.heading, { brain });
    if (!m) return;
    m.yardsBound = true;
    this.davit = m;
    this.stats.davitIn = { t: +(this.Y.t ?? 0).toFixed(1), quenched: this.seam.quenchedCount(), at: { x: +x.toFixed(1), z: +z.toFixed(1) } };
    this.stats.spawned.push({ kind: 'davit' });
  }

  /** The Kilns as the Davit's `world.instruments` (the hit-parts records it reads). */
  _instruments() {
    return this.kilns.filter((m) => m.alive !== false).map((m) => ({ id: m.brain.id, x: m.brain.x, z: m.brain.z, heading: m.brain.heading, large: true, alive: true, parts: m.kilnParts }));
  }

  _brine(at) {
    const ay = Number.isFinite(at.y) ? at.y : (this.ctx.terrain?.getHeight?.(at.x, at.z) ?? 0);
    for (const m of this.kilns) {
      if (m.alive === false) continue;
      const gy = m.position.y;
      // the mist as KilnBrain.mistOnDoor reads it (in the brain's frame: its y is 0 at the Kiln's feet)
      const field = { x: at.x, y: ay - gy, z: at.z, r: BRINE_R, contains: (x, y, z) => Math.hypot(x - at.x, z - at.z) <= BRINE_R && y >= ay - gy - 1 && y <= ay - gy + BRINE_R * 1.1 };
      const r = m.brain.brine({ kind: 'pot', field });
      if (r.stagger) { this.stats.doorSprung++; this.ctx.events?.emit?.('kiln:door-sprung', { kiln: m.brain.id, by: 'brine' }); }
      else if (r.why !== 'not on the door') this.stats.brineOnHull++;
    }
  }

  sync(dt) {
    if (!this.ready || this.disposed) return;
    const Y = this.Y;
    let awake = 0;
    for (const m of this.kilns) {
      const k = Y.kilns[m.yardsIndex];
      if (!k || m.alive === false) { m.awake = false; continue; }
      const B = k.brain;
      m.awake = k.role === 'awake' || k.role === 'going';
      const seesHer = Y.seen && Y.seenBy === B.id;
      m.hostile = seesHer;
      m.lampWant = k.role === 'cold' ? 'dark' : seesHer ? 'hostile' : m.awake ? 'wary' : 'calm';
      const w = B.well ? this.seam?.wellheads?.().find((q) => q.id === B.well.id) : null;
      m.wellAt = w ? { x: w.x, y: this.ctx.terrain?.getHeight?.(w.x, w.z) ?? 0, z: w.z } : null;
      // a stagger the encounter does not step (an awake or cold Kiln's brain is not stepped by it): run its clock here
      if (B.staggerT > 0 && (k.role === 'awake' || k.role === 'cold' || (k.role === 'plugged' && B.state === 'plugged'))) {
        B.staggerT = Math.max(0, B.staggerT - dt);
        if (B.staggerT === 0) { B.door = 'shut'; B.events.push({ type: 'door-shut' }); }
      }
      if (m.awake) awake++;
    }
    if (this.spindle && Y.spindle) {
      const s = Y.spindle, S = this.spindle;
      S.pose.x = s.x; S.pose.z = s.z; S.pose.heading = s.heading ?? S.pose.heading;
      S.lampWant = Y.quiet ? 'calm' : (Y.seen && Y.seenBy === 'spindle') ? 'hostile' : 'wary';
      S.awake = !Y.quiet;
    }
    this._davitIn();
    if (this.davit && this.davit.alive !== false) {
      this.davit.brain.step(dt, { instruments: this._instruments() });
      this.davit.brain.events.length = 0;
    }
    const st = this.stats;
    st.frames++;
    if (awake > st.maxAwake) st.maxAwake = awake;
    if (awake >= 2) st.twoAwakeFrames++;
    const ae = Y.awake?.() ?? 0;
    if (ae > st.maxAwakeEncounter) st.maxAwakeEncounter = ae;
    this.awakeNow = awake;
  }

  report() {
    const r3 = (v) => +(+v).toFixed(2);
    return {
      ready: this.ready, failed: this.failed, awakeNow: this.awakeNow ?? 0, stats: { ...this.stats, spawned: this.stats.spawned.length },
      kilns: this.kilns.map((m) => ({ id: m.brain.id, role: this.Y.kilns[m.yardsIndex]?.role ?? null, state: m.brain.state, door: m.brain.door, lamp: m.kindLamp, awake: !!m.awake, x: r3(m.position.x), y: r3(m.position.y), z: r3(m.position.z), heading: r3(m.heading), alive: m.alive !== false })),
      spindle: this.spindle ? { x: r3(this.spindle.position.x), z: r3(this.spindle.position.z), lamp: this.spindle.kindLamp } : null,
      davit: this.davit ? { state: this.davit.brain.state, plates: this.davit.brain.plates, x: r3(this.davit.position.x), z: r3(this.davit.position.z), lamp: this.davit.kindLamp } : null,
    };
  }

  dispose() {
    this.disposed = true;
    try { if (typeof this._potOff === 'function') this._potOff(); } catch { /* */ }
    for (const m of [...this.kilns, this.spindle, this.davit]) if (m) despawnLive(this.ctx, m);
    this.kilns = []; this.spindle = null; this.davit = null; this.ready = false;
  }
}
