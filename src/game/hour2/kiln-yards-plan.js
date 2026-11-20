/**
 * "THE KILN YARDS", THE PLAN AND THE YARDS' RULES (Milestone 3 wave 3, area E: the quest half of BUILD M3.3; BIBLE 11.3
 * "Quench four wellheads with Brine Pots while Kilns are plugged in; Spindle escorts", reward rung 7 (Arcane), held at
 * Oro's until rung 6 is owned; the brief's HT3 and Q4). Pure: no THREE, no DOM, no ctx, so node --test walks it
 * (src/game/hour2/kiln-yards.test.mjs) and the live quest (./kiln-yards.js) runs the same code.
 *
 * THE STAGES are the hour-two run's leg-6 beats (./plan.js BEATS, leg 6), one stage per beat, in order, each waiting on
 * the event the beat names. Every word is in src/game/text/quests/kiln-yards.json under these ids (W3).
 *
 * THE YARDS (`YardsEncounter`), over the wellheads seam (src/world/sites/kilnyards-layout.js, area A) and the Kiln's
 * own rules (src/instruments/kinds/kiln/rules.js KilnBrain, area C):
 *   - Q4's default (M3-BRIEFS §13, kept) and R7: two Kilns at the Yards, ONE AWAKE. One stands plugged into a hot
 *     wellhead, still (the stealth window: it neither turns nor sees); the other is awake, walking the shelf between
 *     the racks and the stacks, and the Spindle escorts it (area C's SpindleEscort: 6-9 m off it, toward her).
 *   - HT3's quench: Brine within QUENCH_R (3 m) of a hot wellhead quenches it while a Kiln is plugged into it or after
 *     (a wellhead a Kiln has plugged into at any time this save). Brine on a wellhead no Kiln has held does nothing.
 *   - The turn of the Yards: when the plugged Kiln's wellhead is quenched it goes COLD where it stands (not awake: the
 *     fire is out of it); the awake Kiln walks to the nearest hot wellhead and plugs in; the moment it is plugged the
 *     cold one wakes and takes the walk. So every wellhead is quenched while a Kiln is plugged into it, and at no step
 *     are two awake. With all four quenched both stand cold: the Yards are quiet.
 *   - The spawns (IK3): area C's KilnSpawner on the site clock, every RESPAWN_H while fewer than its cap live and any
 *     wellhead is hot. Four quenched: none, ever (`spawnsOver`).
 *   - Seen: the awake Kiln's stand-in eye (SIGHT_M within SIGHT_HALF_DEG of its heading) and the Spindle's
 *     (SPINDLE_SIGHT_M, any direction). A plugged or cold Kiln sees nothing. 'plugged' (the beat) is her within REACH_M
 *     of a wellhead a Kiln is plugged into, unseen.
 * The fight (the mortar, the door, the thrust) is area C's live kinds'; until they stand at the Yards the encounter's
 * Kilns and Spindle are grey stand-ins that run these rules and strike nothing (./kiln-yards.js). Bands marked * are
 * starting values (M3-BRIEFS §14).
 */
import { KilnBrain, KilnSpawner, KILN_RULES } from '../../instruments/kinds/kiln/rules.js';
import { SpindleEscort } from '../../instruments/kinds/spindle/rules.js';
import { WELLHEADS, QUENCH_R, apronPoint } from '../../world/sites/kilnyards-layout.js';
import { KILN_YARDS_ID } from './plan.js';
import { ISLAND_SCALE as S } from '../../world/island/extent.js';

export { KILN_YARDS_ID };

/** The quest's stages: one per leg-6 beat (./plan.js), in order. Each is a checkpoint (the spine writes it after the next
 * stage is entered). `spawn: 'yards'` stands the encounter up; a stage after it still stands on it (`STANDS_ON_YARDS`). */
export const KILN_YARDS_STAGES = Object.freeze([
  // Oro, at the tube mouth: given only after "True Ground" (the quest is not offered before; `offered`)
  { id: 'oro-yards', type: 'talk', npc: 'oro', scene: 'yards', anchor: 'oro', turns: { done: 'yards-given' } },
  // the walk up: the Malpais entered (it is upwind)
  { id: 'climb', type: 'event', event: 'region-enter', where: { region: 'malpais' }, anchor: 'kiln-yards', spawn: 'yards',
    turns: { start: 'yards-walk', done: 'malpais-in' } },
  // a wellhead reached, unseen, while a Kiln is plugged into it
  { id: 'plugged', type: 'event', event: 'wellhead-reached', where: { unseen: true, plugged: true }, anchor: 'kiln-yards',
    turns: { start: 'yards-seen', done: 'at-the-head' }, cards: ['yards'] },
  ...[1, 2, 3, 4].map((n) => ({ id: `quench-${n}`, type: 'event', event: 'wellhead-quenched', where: { n }, anchor: 'kiln-yards',
    turns: { done: `quenched-${n}` } })),
  // all four quenched and the Kilns cold: no Kiln will come to the Yards again
  { id: 'yards-quiet', type: 'event', event: 'yards-quiet', anchor: 'kiln-yards', turns: { done: 'quiet' } },
  // rest at the tube shelter's Brazier (area A's prop; systems' Brazier)
  { id: 'tube-rest', type: 'rest', brazier: 'tube-shelter', anchor: 'tube-shelter', turns: { start: 'to-the-tube' } },
  // home down the Scar's seven posts on the kite (area B's flight)
  { id: 'scar-flight', type: 'event', event: 'kite:land', where: { near: 'scar-foot' }, anchor: 'scar-top', turns: { start: 'scar-road', done: 'scar-down' } },
  // Oro's card: rung 7 held at his forge while rung 6 is not owned
  { id: 'rung-7-held', type: 'talk', npc: 'oro', scene: 'yards-paid', anchor: 'oro' },
].map((s) => Object.freeze({ checkpoint: true, ...s })));

/** The stages that stand on the Yards' encounter (a record continued in one stands it up again). */
export const STANDS_ON_YARDS = Object.freeze(['climb', 'plugged', 'quench-1', 'quench-2', 'quench-3', 'quench-4', 'yards-quiet']);

/** The rung the quest pays (BIBLE 8.4: rung 7 ARCANE), and the one it waits on (rung 6 VANGUARD). */
export const RUNG_7 = 'arcane';
export const RUNG_6 = 'vanguard';
/** What "The Kiln Yards" pays: rung 7, held at Oro's while rung 6 is not owned (HT3). `held` names the card. */
export const KILN_YARDS_REWARD = Object.freeze({ items: Object.freeze([]), rung: RUNG_7, heldUnless: RUNG_6, held: 'rung-7' });

/** Oro gives the quest only after "True Ground" (HT3). `tg` is True Ground's spine (or its serialize()). */
export const offered = (tg) => !!(tg && (tg.done === true));

/** The reward's verdict: made at once, or held at Oro's (the card's words follow it). `rungs`: the rungs she owns. */
export function rewardVerdict(rungs = []) {
  const own = new Set(rungs || []);
  return own.has(RUNG_6) ? { rung: RUNG_7, held: false } : { rung: RUNG_7, held: true, until: RUNG_6 };
}

/* ------------------------------------------------------------------ the Yards' rules */

export const YARDS_RULES = Object.freeze({
  quenchR: QUENCH_R,          // HT3 (*), the seam's
  reachM: 8,                  // * 'plugged': within this of a plugged wellhead (inside a pot's cast, 2-16 m)
  sightM: 24, sightHalfDeg: 60,   // * the awake Kiln's stand-in eye
  spindleSightM: 10,          // * the Spindle's stand-in eye (all round: its ring)
  metM: 14,                   // * "the Spindle met on the way": she comes within this of it
  // the awake Kiln walks the shelf between the manifold rack (v 7) and the stacks (v 18), end to end of the bench
  patrol: Object.freeze([apronPoint(-20, 12.5), apronPoint(20, 12.5)].map((p) => Object.freeze({ x: +(p.e * S).toFixed(2), z: +(-p.n * S).toFixed(2) }))),
  walk: KILN_RULES.walk,      // the Kiln's own pace, 1.1 m/s
  reachEveryS: 1.0,           // 'wellhead-reached' is sent again at most this often while she stays inside REACH_M
});

const D2R = Math.PI / 180;

/** Is (bx, bz) inside an eye at (x, z) facing `heading` (yaw 0 faces +z) within `r` and `halfDeg`? */
export function inEye(x, z, heading, bx, bz, r, halfDeg = 180) {
  const dx = bx - x, dz = bz - z, d = Math.hypot(dx, dz);
  if (d > r) return false;
  if (halfDeg >= 180 || d < 1e-6) return true;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  return (dx * fx + dz * fz) / d >= Math.cos(halfDeg * D2R);
}

/**
 * HT3's quench: the wellhead a Brine field landing at `at` quenches, or why none. `wells` are the seam's live records
 * ({ id, x, z, state, plugged }); `ever` the ids a Kiln has plugged into this save.
 * @returns {{ id: string|null, why: string, d?: number }}
 */
export function quenchAt(at, wells, ever, R = YARDS_RULES.quenchR) {
  let best = null, bd = Infinity;
  for (const w of wells || []) { const d = Math.hypot(w.x - at.x, w.z - at.z); if (d < bd) { bd = d; best = w; } }
  if (!best || bd > R) return { id: null, why: `no wellhead within ${R} m (nearest ${Number.isFinite(bd) ? bd.toFixed(1) : '-'} m)` };
  if (best.state !== 'hot') return { id: null, why: `${best.id} is already quenched`, d: bd };
  if (!best.plugged && !(ever && ever.has(best.id))) return { id: null, why: `${best.id}: no Kiln has plugged into it`, d: bd };
  return { id: best.id, why: 'quenched', d: bd };
}

/** IK3 for the quest: Kilns spawned at the Yards over `hours` of site clock, with `live` Kilns there and the wellheads. */
export function spawnsOver(hours, wellheads, live = 0, stepH = 1) {
  const sp = new KilnSpawner();
  let n = 0;
  for (let h = 0; h < hours; h += stepH) { const k = sp.step(stepH, wellheads, live + n, 0); n += k; }
  return n;
}

/**
 * The Yards' encounter. `seam` is the wellheads seam (the module's functions: wellheads, plugIn, unplug, setQuenched,
 * quenchedCount, allQuenched); `ever` carries the ids a Kiln has plugged into (a Set, restored from the save).
 *
 *   const Y = new YardsEncounter(seam, { ever })
 *   Y.standUp()                       two Kilns (one plugged, one awake) and the Spindle; from the seam's state
 *   Y.step(dt, brea) -> events        brea { x, z }; events [{ type, ... }] in order
 *   Y.brine(at) -> { id, why }        a Brine field landed at `at` ({ x, z })
 *   Y.awake()                         how many Kilns are awake now (R7: never more than one)
 *   Y.seen                            does anything see her now
 */
export class YardsEncounter {
  constructor(seam, { ever = new Set(), rules = YARDS_RULES } = {}) {
    this.seam = seam;
    this.R = rules;
    this.ever = ever;
    this.kilns = [];
    this.spindle = null;
    this.seen = false;
    this.seenBy = null;
    this.met = false;
    this.quiet = false;
    this.maxAwake = 0;
    this._reachT = 0;
    this._patrolI = 1;
    this.t = 0;
  }

  _world() {
    const seam = this.seam;
    return {
      wellheads: seam.wellheads(),
      plugIn: (id, kind) => { const ok = seam.plugIn(id, kind); if (ok) this.ever.add(id); return ok; },
      unplug: (id) => seam.unplug(id),
    };
  }

  /** Two Kilns and the Spindle, from the seam's state: the first Kiln coupling at the first hot wellhead (it plugs in
   * after the Kiln's own coupleS), the second awake on the shelf; with no hot wellhead both stand cold. */
  standUp() {
    const W = this.seam.wellheads();
    const hot = W.filter((w) => w.state === 'hot');
    const P = this.R.patrol;
    const a = new KilnBrain({ id: 'yards-kiln-1' }), b = new KilnBrain({ id: 'yards-kiln-2' });
    this.kilns = [{ brain: a, role: 'cold' }, { brain: b, role: 'cold' }];
    // the awake one: on the shelf at the patrol's east end, walking west
    b.x = P[1].x; b.z = P[1].z; b.heading = Math.atan2(P[0].x - P[1].x, P[0].z - P[1].z);
    if (hot.length) {
      const w = hot[0];
      a.well = w; a.stand = a._standFor(w); a.x = a.stand.x; a.z = a.stand.z; a.heading = a.stand.heading;
      a.state = 'walking';
      this.kilns[0].role = 'plugging';
      this.kilns[1].role = 'awake';
      b.state = 'awake';
    } else {
      // all quenched: both stand cold on the bench, in front of the first two heads
      const [w1, w2] = W;
      for (const [k, w] of [[a, w1], [b, w2]]) { const s = k._standFor(w); k.x = s.x; k.z = s.z; k.heading = s.heading; k.state = 'idle'; }
      this.quiet = true;
    }
    this.spindle = new SpindleEscort({ x: b.x - 6, z: b.z });
    this.spindle.heading = 0;
    return this;
  }

  /** R7's count: a Kiln is awake while it walks the shelf or walks to a wellhead (plugging, plugged and cold are not). */
  awake() { return this.kilns.filter((k) => k.role === 'awake' || k.role === 'going').length; }

  /** The Kiln the Spindle escorts: the awake one (or the one walking to plug in). */
  ward() { return this.kilns.find((k) => k.role === 'awake' || k.role === 'going') ?? null; }

  /** Brine landed at `at`: HT3's quench. */
  brine(at) {
    const r = quenchAt(at, this.seam.wellheads(), this.ever, this.R.quenchR);
    if (r.id) this.seam.setQuenched(r.id);
    return r;
  }

  _patrol(k, dt) {
    const P = this.R.patrol, tgt = P[this._patrolI];
    const B = k.brain, dx = tgt.x - B.x, dz = tgt.z - B.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { this._patrolI = 1 - this._patrolI; return; }
    const s = Math.min(d, this.R.walk * dt);
    B.x += (dx / d) * s; B.z += (dz / d) * s; B.heading = Math.atan2(dx, dz);
  }

  step(dt, brea) {
    this.t += dt;
    const out = [];
    const world = this._world();
    for (const k of this.kilns) {
      const B = k.brain;
      if (k.role === 'plugging' || k.role === 'going') {
        B.step(dt, world);
        for (const e of B.events.splice(0)) if (e.type === 'plugged') out.push({ type: 'kiln-plugged', kiln: B.id, well: e.well });
        if (B.state === 'plugged') {
          k.role = 'plugged';
          // the cold one wakes the moment this one is plugged in (never two awake)
          const cold = this.kilns.find((o) => o !== k && o.role === 'cold');
          if (cold && !this.quiet) { cold.role = 'awake'; cold.brain.state = 'awake'; out.push({ type: 'kiln-woke', kiln: cold.brain.id }); }
        } else if (k.role === 'going' && B.state === 'idle' && !world.wellheads.some((w) => w.state === 'hot' && !w.plugged)) {
          k.role = 'cold'; out.push({ type: 'kiln-cold', kiln: B.id, why: 'no hot wellhead' });
        }
      } else if (k.role === 'plugged') {
        const w = world.wellheads.find((x) => x.id === B.well?.id);
        if (!w || w.state !== 'hot') {
          // its wellhead quenched: the fire goes out of it where it stands (the brain releases the plug)
          B.step(dt, world); B.events.length = 0; B.state = 'idle';
          k.role = 'cold';
          out.push({ type: 'kiln-cold', kiln: B.id, why: 'quenched', well: w?.id ?? null });
          // the awake one goes to the nearest hot wellhead
          const a = this.kilns.find((o) => o !== k && o.role === 'awake');
          if (a && world.wellheads.some((x) => x.state === 'hot' && !x.plugged)) { a.role = 'going'; a.brain.state = 'idle'; out.push({ type: 'kiln-going', kiln: a.brain.id }); }
          else if (a) { a.role = 'cold'; a.brain.state = 'idle'; out.push({ type: 'kiln-cold', kiln: a.brain.id, why: 'no hot wellhead' }); }
        }
      } else if (k.role === 'awake') this._patrol(k, dt);
    }
    // the Spindle escorts the awake Kiln, toward her when she is near
    const ward = this.ward();
    if (this.spindle) {
      const wb = ward?.brain ?? this.kilns[0]?.brain;
      if (wb) {
        const near = brea && Math.hypot(brea.x - wb.x, brea.z - wb.z) < 30 ? brea : null;
        const x0 = this.spindle.x, z0 = this.spindle.z;
        this.spindle.step(dt, { x: wb.x, z: wb.z, heading: wb.heading }, near);
        const mx = this.spindle.x - x0, mz = this.spindle.z - z0;
        if (Math.hypot(mx, mz) > 1e-4) this.spindle.heading = Math.atan2(mx, mz);
      }
    }
    const aw = this.awake();
    if (aw > this.maxAwake) this.maxAwake = aw;
    // seen
    this.seen = false; this.seenBy = null;
    if (brea) {
      for (const k of this.kilns) {
        if (k.role !== 'awake' && k.role !== 'going') continue;
        if (inEye(k.brain.x, k.brain.z, k.brain.heading, brea.x, brea.z, this.R.sightM, this.R.sightHalfDeg)) { this.seen = true; this.seenBy = k.brain.id; break; }
      }
      if (!this.seen && this.spindle && ward && inEye(this.spindle.x, this.spindle.z, 0, brea.x, brea.z, this.R.spindleSightM)) { this.seen = true; this.seenBy = 'spindle'; }
      if (!this.met && this.spindle && Math.hypot(brea.x - this.spindle.x, brea.z - this.spindle.z) <= this.R.metM) { this.met = true; out.push({ type: 'spindle-met' }); }
      // 'plugged': within reach of a wellhead a Kiln is plugged into
      this._reachT = Math.max(0, this._reachT - dt);
      if (this._reachT === 0) {
        for (const w of world.wellheads) {
          if (!w.plugged || w.state !== 'hot') continue;
          const d = Math.hypot(brea.x - w.x, brea.z - w.z);
          if (d <= this.R.reachM) { out.push({ type: 'wellhead-reached', id: w.id, plugged: true, unseen: !this.seen, d: +d.toFixed(2) }); this._reachT = this.R.reachEveryS; break; }
        }
      }
    }
    if (!this.quiet && this.seam.allQuenched() && this.kilns.every((k) => k.role === 'cold')) { this.quiet = true; out.push({ type: 'yards-quiet', quenched: this.seam.quenchedCount() }); }
    return out;
  }

  report() {
    return {
      kilns: this.kilns.map((k) => ({ id: k.brain.id, role: k.role, state: k.brain.state, x: +k.brain.x.toFixed(2), z: +k.brain.z.toFixed(2), well: k.brain.well?.id ?? null })),
      spindle: this.spindle ? { x: +this.spindle.x.toFixed(2), z: +this.spindle.z.toFixed(2) } : null,
      awake: this.awake(), maxAwake: this.maxAwake, seen: this.seen, seenBy: this.seenBy, met: this.met, quiet: this.quiet,
      ever: [...this.ever], wells: this.seam.wellheads().map((w) => ({ id: w.id, state: w.state, plugged: w.plugged })),
    };
  }
}

/**
 * What the world already shows that the current stage waits on (the live quest asks each tick, so an event sent before
 * its stage was entered is not lost: a pot that quenched the first head before 'plugged' closed, or the Yards gone quiet
 * in the same step as the fourth quench). Returns [eventName, payload] or null. `Y` is the encounter (or null).
 */
export function catchUp(stageId, seamNow, Y = null) {
  const m = /^quench-(\d)$/.exec(stageId || '');
  if (m && seamNow.quenchedCount() >= Number(m[1])) return ['wellhead-quenched', { n: Number(m[1]), caught: true }];
  if (stageId === 'yards-quiet' && seamNow.allQuenched() && (!Y || Y.quiet)) return ['yards-quiet', { quenched: seamNow.quenchedCount(), caught: true }];
  return null;
}

/** The four wellheads' ids in the seam's order (for the text and the runner). */
export const WELL_IDS = Object.freeze(WELLHEADS.map((w) => w.id));
