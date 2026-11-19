import { segmentHit } from '../lib/sight.js';
import { SCREED_MOVE } from '../lib/blockout.js';

/**
 * THE SCREED'S RULES (M2 wave 1, area C; bible §7.4 #9, §11.2 0:35): rows IN5, IN6, IN7 on simulation time, with no
 * three and no scene, so the Node twins (`tools/instruments/screed-rules.test.mjs`) and the kind file run the same code.
 * A helper module of the Screed kind (no default export: the registry skips it).
 *
 * THE CHARGE (IN5). Wind-up `windupS` with the blade rising to `bladeUp` (2.6 m); at the commit the heading is locked
 * and never steered again ("cannot turn mid-charge"); it runs `chargeLen` (25 m) at `chargeSpeed`. Its blade's front
 * edge is swept every step against the walls (the nine walls' `segmentHitsWall`, area B's seam) and the fixed
 * obstacles (basalt clusters, the Organ Shelf: sight.js shapes); a hit stalls it for `stallS` (3.0 s), the blade
 * planted. Reed under the blade's swept footprint is levelled through the cover mask's `level(x, z, r)`.
 *
 * THE PARTS (IN6). Two ram seals and the cab lamp are hit parts with a state: `sealed`, `seized` (Brine), `off`.
 * A sealed seal comes off with two precision hits; a seized one with one Pry or one hook-rip. Both seals off drops
 * the blade: it can no longer cut a wall (a charge still stalls on one). The lamp goes `off` on one precision hit.
 *
 * THE CUT (IN7). Walking (not charging) with the blade working, the Screed cuts the first wall its blade front reaches
 * down to the Datum Line's height (`setWallCut`), and turns to the next. At the third cut wall the fight ends fail-soft
 * and it walks on along the Scar.
 *
 * Everything here is allocation-light and cold-path; the per-frame kind code calls `step(dt)`.
 */

export const SCREED_RULES = Object.freeze({
  ...SCREED_MOVE,
  /** the blade's front edge, body frame (its 3.6 m width, its face 3.25 m ahead of the hull's centre) */
  bladeHalfW: 1.8, bladeFront: 3.25,
  /** blade heights: at rest (working, cutting to the line), raised in the wind-up, dropped when both seals are off */
  bladeRest: 0.85, bladeDrop: 0.25,
  sealHits: 2, failSoftCuts: 3,
  reedR: 1.9,
});

/** The three hit parts, each `sealed` | `seized` | `off` (the lamp is never `seized`: Brine seizes joints). */
export function makeParts() {
  return { sealL: { state: 'sealed', hits: 0 }, sealR: { state: 'sealed', hits: 0 }, lamp: { state: 'sealed', hits: 0 } };
}

/**
 * One blow on a part: 'precision' (an arrow on the weak point), 'brine' (seizes a seal), 'pry' / 'hookRip' (tears a
 * seized seal off), anything else does nothing to a part. Returns the part's new state.
 */
export function hitPart(parts, id, kind) {
  const p = parts[id];
  if (!p || p.state === 'off') return p ? p.state : null;
  if (id === 'lamp') { if (kind === 'precision') p.state = 'off'; return p.state; }
  if (kind === 'brine') p.state = 'seized';
  else if (kind === 'precision' && p.state === 'sealed') { if (++p.hits >= SCREED_RULES.sealHits) p.state = 'off'; }
  else if ((kind === 'pry' || kind === 'hookRip') && p.state === 'seized') p.state = 'off';
  return p.state;
}

/** Both seals off: the blade drops and no longer cuts. */
export const bladeDropped = (parts) => parts.sealL.state === 'off' && parts.sealR.state === 'off';

/**
 * The Screed's charge-and-cut state on simulation time.
 *   walls     { segmentHitsWall(ax, az, bx, bz, pad), setWallCut(id), wallState(id) } (ninewalls-layout.js, or a stub)
 *   obstacles [{ id, shape }] sight.js shapes (basalt clusters, the Organ Shelf)
 *   reed      { level(x, z, r) } or null
 */
export class ScreedBrain {
  constructor({ x = 0, z = 0, heading = 0, walls = null, obstacles = [], reed = null, cutOrder = null } = {}) {
    this.x = x; this.z = z; this.heading = heading;
    this.walls = walls; this.obstacles = obstacles; this.reed = reed;
    this.parts = makeParts();
    this.phase = 'walk';           // walk | windup | charge | stall | done
    this.phaseT = 0;
    this.bladeY = SCREED_RULES.bladeRest;
    this.lockedHeading = null;
    this.charged = 0;              // metres run in this charge
    this.cuts = [];                // wall ids cut, in order
    this.cutOrder = cutOrder;      // optional wall ids in the order it means to cut them
    this.stalls = [];              // { by, at: [x, z], t }
    this.levelled = 0;
    this.failSoft = false;
    this.t = 0;
    this.target = null;            // { x, z } the walk aims at (a wall, then the Scar)
    this.log = [];
  }

  /** Begin a charge at `targetX, targetZ`: the wind-up turns it onto the bearing; the commit locks it. */
  charge(tx, tz) {
    if (this.phase !== 'walk') return false;
    this.heading = Math.atan2(tx - this.x, tz - this.z);
    this.phase = 'windup'; this.phaseT = 0; this.charged = 0;
    return true;
  }

  /** The blade's front edge in the world: [lx, lz, rx, rz]. */
  bladeEdge() {
    const s = Math.sin(this.heading), c = Math.cos(this.heading), F = SCREED_RULES.bladeFront, W = SCREED_RULES.bladeHalfW;
    const fx = this.x + s * F, fz = this.z + c * F;
    return [fx - c * W, fz + s * W, fx + c * W, fz - s * W];
  }

  /** The first wall or obstacle the blade's front edge crosses moving by (dx, dz) this step, or null. */
  _strike(dx, dz) {
    const [lx, lz, rx, rz] = this.bladeEdge();
    const y = this.bladeY < 0.3 ? 0.3 : this.bladeY;
    let best = null;
    const pts = [[lx, lz], [(lx + rx) / 2, (lz + rz) / 2], [rx, rz]];
    if (this.walls) {
      for (const [px, pz] of pts) {
        const h = this.walls.segmentHitsWall(px, pz, px + dx, pz + dz, 0);
        if (h && (!best || h.t < best.t)) best = { by: h.id, wall: true, t: h.t };
      }
    }
    for (const o of this.obstacles) {
      for (const [px, pz] of pts) {
        const t = segmentHit(o.shape, px, y, pz, px + dx, y, pz + dz);
        if (t >= 0 && (!best || t < best.t)) best = { by: o.id, wall: false, t };
      }
    }
    return best;
  }

  _levelReed() {
    if (!this.reed) return;
    const [lx, lz, rx, rz] = this.bladeEdge();
    const n = 4;
    for (let i = 0; i <= n; i++) { this.reed.level(lx + (rx - lx) * (i / n), lz + (rz - lz) * (i / n), SCREED_RULES.reedR / 2); this.levelled++; }
  }

  step(dt) {
    const R = SCREED_RULES;
    this.t += dt; this.phaseT += dt;
    if (this.phase === 'windup') {
      // IN5: the blade lifts to 2.6 m through the wind-up
      const k = Math.min(1, this.phaseT / (R.windupS * 0.8));
      this.bladeY = bladeDropped(this.parts) ? R.bladeDrop : R.bladeRest + (R.bladeUp - R.bladeRest) * k;
      if (this.phaseT >= R.windupS) { this.phase = 'charge'; this.phaseT = 0; this.lockedHeading = this.heading; }
      return;
    }
    if (this.phase === 'charge') {
      this.heading = this.lockedHeading;    // committed: it cannot turn
      const step = Math.min(R.chargeSpeed * dt, R.chargeLen - this.charged);
      const dx = Math.sin(this.heading) * step, dz = Math.cos(this.heading) * step;
      const hit = this._strike(dx, dz);
      if (hit) {
        this.x += dx * hit.t; this.z += dz * hit.t; this.charged += step * hit.t;
        this.phase = 'stall'; this.phaseT = 0;
        this.bladeY = bladeDropped(this.parts) ? R.bladeDrop : R.bladeRest;
        this.stalls.push({ by: hit.by, wall: hit.wall, at: [+this.x.toFixed(2), +this.z.toFixed(2)], t: +this.t.toFixed(3) });
        return;
      }
      this.x += dx; this.z += dz; this.charged += step;
      this._levelReed();
      if (this.charged >= R.chargeLen - 1e-9) { this.phase = 'walk'; this.phaseT = 0; this.bladeY = bladeDropped(this.parts) ? R.bladeDrop : R.bladeRest; }
      return;
    }
    if (this.phase === 'stall') {
      if (this.phaseT >= R.stallS) { this.phase = 'walk'; this.phaseT = 0; }
      return;
    }
    if (this.phase === 'walk' || this.phase === 'done') this._walk(dt);
  }

  /** Walk toward `target` at walk speed, turning at most turnRate; a wall the blade reaches is cut (IN7). */
  _walk(dt) {
    const R = SCREED_RULES;
    this.bladeY = bladeDropped(this.parts) ? R.bladeDrop : R.bladeRest;
    if (!this.target) return;
    const want = Math.atan2(this.target.x - this.x, this.target.z - this.z);
    let d = want - this.heading;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const lim = R.turnRate * dt;
    this.heading += d < -lim ? -lim : d > lim ? lim : d;
    const step = R.walk * dt;
    const dx = Math.sin(this.heading) * step, dz = Math.cos(this.heading) * step;
    const hit = this.phase === 'walk' ? this._strike(dx, dz) : null;
    if (hit && hit.wall && !this.cuts.includes(hit.by)) {
      if (!bladeDropped(this.parts) && this.walls) {
        this.walls.setWallCut(hit.by);
        this.cuts.push(hit.by);
        this.log.push({ t: +this.t.toFixed(2), cut: hit.by });
        if (this.cuts.length >= R.failSoftCuts) { this.failSoft = true; this.phase = 'done'; }
      }
      // cut or not, the wall stops the walk this step (a dropped blade pushes against it)
      if (bladeDropped(this.parts)) return;
    } else if (hit && !hit.wall) return;
    this.x += dx; this.z += dz;
  }
}

/**
 * THE FIGHT AROUND THE BRAIN (M2 wave 3, area C; the live Screed in `./screed.js` runs exactly this). It reads where she
 * is, decides when the fight starts and when to charge, and reports what happened as events; the kind file only writes
 * the brain's position back onto the machine and emits the events. So the page's fight and its Node twin
 * (tools/instruments/screed-fight.test.mjs) are the same code.
 *   wait   stands (calm) until she is within `engageM` of it or it is struck
 *   come   walks on `centre` (the village), cutting walls (IN7); charges her when she is `chargeM` ahead within
 *          `chargeCone` of its heading and `chargeCd` has run since its last charge ended; the blade strikes her once a
 *          charge if she is inside `bladeBox` in front of it. After a stall it backs off the wall (`backS` at
 *          `backSpeed`, the blade still planted low) before it walks on, so the wall it stalled on is cut only if it
 *          walks into it again un-stalled
 *   done   fail-soft (the third cut) or the blade dropped (both seals off): it walks the `away` points in turn (back out
 *          the way it came, then down the Scar), cutting nothing and charging no more
 * Events (type, then the payload): 'screed-engage', 'screed-charge' {at}, 'blade-hit', 'screed-stalled' {wall, by, at}
 * (on a wall), 'screed-stalled-rock' {by, at}, 'screed-cut' {id, cuts}, 'seal-off' {seal: 'ram-1' | 'ram-2', part},
 * 'screed-seized' {part}, 'screed-done' {failSoft, cuts, sealsOff}.
 */
export const FIGHT = Object.freeze({
  engageM: 45, chargeM: Object.freeze([7, 24]), chargeCone: 0.6, chargeCd: 4.5,
  bladeDmg: 32, bladeBox: Object.freeze({ back: 1.2, front: 1.4, half: SCREED_RULES.bladeHalfW + 0.35 }),
  backS: 2.0, backSpeed: 1.2,
});

export class ScreedFight {
  constructor(brain, { centre, away }) {
    this.b = brain; this.centre = centre; this.away = Array.isArray(away) ? away : [away]; this.awayI = 0;
    this.mode = 'wait'; this.cd = 0; this.struck = false; this.bladeHit = false;
    this.lastPhase = brain.phase; this.nStalls = 0; this.nCuts = 0; this.backT = 0;
    this.events = [];
  }

  _ev(type, payload) { this.events.push(payload ? { type, ...payload } : { type }); }

  /** One step: she is at (px, pz) (or null). The events of this step are in `this.events` (cleared each step). */
  step(dt, px, pz) {
    const b = this.b, F = FIGHT;
    this.events.length = 0;
    const has = px != null && pz != null;
    const dx = has ? px - b.x : 1e9, dz = has ? pz - b.z : 1e9, d = Math.hypot(dx, dz);
    if (this.mode === 'wait' && (d < F.engageM || this.struck)) {
      this.mode = 'come'; b.target = { x: this.centre.x, z: this.centre.z }; this._ev('screed-engage');
    }
    if (this.mode === 'come' && (b.failSoft || bladeDropped(b.parts))) {
      this.mode = 'done'; this.awayI = 0; b.target = { x: this.away[0].x, z: this.away[0].z };
      this._ev('screed-done', { failSoft: b.failSoft, cuts: b.cuts.length, sealsOff: bladeDropped(b.parts) });
    }
    if (this.cd > 0 && b.phase === 'walk') this.cd -= dt;
    if (this.mode === 'come' && b.phase === 'walk' && this.cd <= 0 && has && d >= F.chargeM[0] && d <= F.chargeM[1]) {
      let a = Math.atan2(dx, dz) - b.heading;
      a -= Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
      if (Math.abs(a) <= F.chargeCone && b.charge(px, pz)) { this.bladeHit = false; this._ev('screed-charge', { at: [px, pz] }); }
    }
    // a walk in 'done' never cuts: the brain only strikes walls in its 'walk' phase, so a finished fight walks in 'done'
    if (this.mode === 'done' && b.phase === 'walk') b.phase = 'done';
    if (this.mode === 'done' && b.target && this.awayI < this.away.length - 1 && Math.hypot(b.target.x - b.x, b.target.z - b.z) < 3) {
      this.awayI++; b.target = { x: this.away[this.awayI].x, z: this.away[this.awayI].z };
    }
    if (this.backT > 0) {
      // backing off the wall it stalled on: straight back along its heading, the blade low
      this.backT -= dt;
      b.x -= Math.sin(b.heading) * F.backSpeed * dt; b.z -= Math.cos(b.heading) * F.backSpeed * dt;
    } else b.step(dt);
    if (b.phase === 'charge' && !this.bladeHit && has) {
      const s = Math.sin(b.heading), c = Math.cos(b.heading);
      const ex = px - b.x, ez = pz - b.z, fwd = ex * s + ez * c - SCREED_RULES.bladeFront, lat = ex * c - ez * s;
      if (fwd >= -F.bladeBox.back && fwd <= F.bladeBox.front && Math.abs(lat) <= F.bladeBox.half) { this.bladeHit = true; this._ev('blade-hit'); }
    }
    if (b.phase !== this.lastPhase) {
      if (this.lastPhase === 'charge' || this.lastPhase === 'stall') this.cd = F.chargeCd;
      if (this.lastPhase === 'stall') this.backT = F.backS;
      this.lastPhase = b.phase;
    }
    if (b.stalls.length !== this.nStalls) {
      this.nStalls = b.stalls.length;
      const st = b.stalls[b.stalls.length - 1];
      if (st.wall) this._ev('screed-stalled', { wall: st.by, by: st.by, at: st.at });
      else this._ev('screed-stalled-rock', { by: st.by, at: st.at });
    }
    if (b.cuts.length !== this.nCuts) { this.nCuts = b.cuts.length; this._ev('screed-cut', { id: b.cuts[b.cuts.length - 1], cuts: b.cuts.length }); }
    return this.events;
  }

  /** A blow on a part ('sealL' | 'sealR' | 'lamp'; kind as `hitPart`). Returns the new state; events in `this.events`. */
  blow(id, kind) {
    const S = this.b.parts, before = S[id]?.state;
    this.events.length = 0;
    const st = hitPart(S, id, kind);
    if (st !== before) {
      this.struck = true;
      if (id !== 'lamp') {
        const off = (S.sealL.state === 'off') + (S.sealR.state === 'off');
        if (st === 'off') this._ev('seal-off', { seal: `ram-${off}`, part: id, off });
        else if (st === 'seized') this._ev('screed-seized', { part: id });
      }
    }
    return st;
  }
}
