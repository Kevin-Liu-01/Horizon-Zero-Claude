/**
 * THE RE-SURVEY'S RULE (Milestone 2 area E, HR3; bible 8.5 and 11.2 0:45 "Hold the Alidade on the mark for 15 s and take
 * three bearings while Instruments come to look"). Pure: no THREE, no DOM, no ctx; node --test walks it on simulation
 * time (tools/gates/systems/resurvey.test.mjs) and the live half (./live.js) feeds it the same numbers each step.
 *
 *   const R = new ResurveyHold({ marks, holdS: 15, onDeg: 3, bearingDeg: 2.5, hitDamage: 10, hitPauseS: 1.5 })
 *   R.step(dt, { eye, dir, alidade, onPad })   eye {x, y, z}; dir a unit vector (where the Alidade points)
 *   R.take({ eye, dir, alidade, onPad })       T: the bearing of the mark within bearingDeg, once each -> { id, bearing } | null
 *   R.hit(damage)                              a blow on her: over hitDamage pauses the arc hitPauseS (nothing is reset)
 *   R.report()
 *
 * A MARK is an upright segment: { id, x, z, y0, y1 } (a pillar from its foot to its plate, the Ring from its foot to its
 * band). "On the mark" is the angle between the Alidade's line and the nearest point of that segment, <= onDeg.
 *
 * THE ARC fills only while all hold: the Alidade is up, she is on the pad (padR of the benchmark), the line is on a mark
 * within onDeg, and no hit pause runs. Off the mark, off the pad, the Alidade down or a hit pause: the arc PAUSES where
 * it is; it never drains, and the bearings taken stay taken. The re-survey is DONE the step the arc reaches holdS with
 * all the marks' bearings taken (if the arc is full first it waits, full, for the last bearing).
 */

const D2R = Math.PI / 180;

/** Compass bearing from a to b, degrees (engine x = E, z = -N), as the spine's `bearing` and the compass strip read. */
export function bearingTo(a, b) {
  return ((Math.atan2(b.x - a.x, -(b.z - a.z)) / D2R) + 360) % 360;
}

/** The angle, degrees, between the line eye + t dir and the nearest point of the mark's upright segment. */
export function angleToMark(eye, dir, m) {
  const dx = m.x - eye.x, dz = m.z - eye.z;
  // the point on the segment nearest the line: the height where the line passes over the mark's plan point
  const h = Math.hypot(dx, dz);
  const dh = Math.hypot(dir.x, dir.z);
  // along the line, the horizontal distance h is reached at t = h / dh; the line's height there
  const yAt = dh > 1e-9 ? eye.y + dir.y * (h / dh) : eye.y;
  const y = Math.max(m.y0, Math.min(m.y1, yAt));
  const vx = dx, vy = y - eye.y, vz = dz;
  const L = Math.hypot(vx, vy, vz) || 1, Ld = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const c = (vx * dir.x + vy * dir.y + vz * dir.z) / (L * Ld);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
}

export class ResurveyHold {
  constructor({ marks, holdS = 15, onDeg = 3, bearingDeg = 2.5, hitDamage = 10, hitPauseS = 1.5 } = {}) {
    if (!Array.isArray(marks) || !marks.length) throw new Error('a re-survey needs its marks');
    this.marks = marks.map((m) => ({ ...m }));
    this.holdS = holdS; this.onDeg = onDeg; this.bearingDeg = bearingDeg; this.hitDamage = hitDamage; this.hitPauseS = hitPauseS;
    this.reset();
  }

  reset() {
    this.t = 0;                 // sim seconds since the first step
    this.arc = 0;               // seconds of hold banked (0..holdS)
    this.pauseT = 0;            // hit pause left
    /** @type {Map<string, number>} mark id -> bearing taken (degrees) */
    this.bearings = new Map();
    this.order = [];            // [{ id, bearing, t, err }]
    this.done = false;
    this.doneT = -1;
    this.on = false;            // the last step's verdict
    this.mark = null;           // the mark the line was on (id) or null
    this.err = Infinity;        // the last step's nearest angle, degrees
    this.pauses = { hit: 0, offMark: 0, offPad: 0, down: 0 };
    this.hits = [];             // [{ t, damage, paused }]
    this.onSteps = 0;
    this._why = 'down';
  }

  /** The nearest mark to the line and its angle. */
  nearest(eye, dir) {
    let best = null, err = Infinity;
    for (const m of this.marks) {
      const a = angleToMark(eye, dir, m);
      if (a < err) { err = a; best = m; }
    }
    return { mark: best, err };
  }

  step(dt, { eye, dir, alidade, onPad }) {
    if (this.done || !(dt > 0)) return this;
    this.t += dt;
    if (this.pauseT > 0) this.pauseT = Math.max(0, this.pauseT - dt);
    const n = eye && dir ? this.nearest(eye, dir) : { mark: null, err: Infinity };
    this.err = n.err;
    this.mark = n.err <= this.onDeg ? n.mark.id : null;
    let why = null;
    if (!alidade) why = 'down';
    else if (!onPad) why = 'offPad';
    else if (n.err > this.onDeg) why = 'offMark';
    else if (this.pauseT > 0) why = 'hit';
    // a pause is counted once, on the step it begins
    if (why && why !== this._why && why !== 'hit') this.pauses[why]++;
    this._why = why;
    this.on = !why;
    if (this.on) {
      this.arc = Math.min(this.holdS, this.arc + dt);
      this.onSteps++;
    }
    if (this.arc >= this.holdS - 1e-9 && this.bearings.size === this.marks.length) {
      this.done = true;
      this.doneT = this.t;
    }
    return this;
  }

  /** T: take the bearing of the mark the line is on (within bearingDeg), once per mark. */
  take({ eye, dir, alidade, onPad }) {
    if (this.done || !alidade || !onPad || !eye || !dir) return null;
    const n = this.nearest(eye, dir);
    if (!n.mark || n.err > this.bearingDeg || this.bearings.has(n.mark.id)) return null;
    const b = +bearingTo(eye, n.mark).toFixed(1);
    this.bearings.set(n.mark.id, b);
    this.order.push({ id: n.mark.id, bearing: b, t: +this.t.toFixed(3), err: +n.err.toFixed(3) });
    if (this.arc >= this.holdS - 1e-9 && this.bearings.size === this.marks.length) { this.done = true; this.doneT = this.t; }
    return { id: n.mark.id, bearing: b, n: this.bearings.size };
  }

  /** A blow on her. Over hitDamage pauses the arc; the arc and the bearings are kept. */
  hit(damage) {
    const paused = !this.done && Number(damage) > this.hitDamage;
    this.hits.push({ t: +this.t.toFixed(3), damage: +Number(damage).toFixed(2), paused });
    if (paused) { this.pauseT = this.hitPauseS; this.pauses.hit++; }
    return paused;
  }

  /** 0..1, the arc's share of holdS (what the overlay draws). */
  get progress() { return this.arc / this.holdS; }

  report() {
    return {
      done: this.done, t: +this.t.toFixed(3), doneT: +this.doneT.toFixed(3), arc: +this.arc.toFixed(3), holdS: this.holdS,
      bearings: this.order.map((o) => ({ ...o })), taken: this.bearings.size, of: this.marks.length,
      pauses: { ...this.pauses }, hits: this.hits.slice(), on: this.on, mark: this.mark, err: Number.isFinite(this.err) ? +this.err.toFixed(2) : null,
    };
  }
}

/**
 * INSTRUMENTS COME TO LOOK (HR3): of the live Instruments, the `n` nearest the benchmark within `range` m that are not
 * correcting kinds, each sent to a point `standOff` m short of her on its own line. Pure: in, plain {id, kind, x, z};
 * out, [{ id, x, z, d }] the points to lure each to.
 */
export function chooseLookers(list, at, { n = 3, range = 70, standOff = 6, refuse = () => false } = {}) {
  const c = [];
  for (const m of list) {
    if (!m || refuse(m.kind)) continue;
    const d = Math.hypot(m.x - at.x, m.z - at.z);
    if (d <= range) c.push({ m, d });
  }
  c.sort((a, b) => a.d - b.d);
  return c.slice(0, n).map(({ m, d }) => {
    const k = d > standOff ? (d - standOff) / d : 0;
    return { id: m.id, x: +(m.x + (at.x - m.x) * k).toFixed(2), z: +(m.z + (at.z - m.z) * k).toFixed(2), d: +d.toFixed(2) };
  });
}
