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
