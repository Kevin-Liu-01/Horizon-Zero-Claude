/**
 * THE SICKLE'S RULES (M2 wave 1, area C; bible §7.4 #5): row IN8 on simulation time, with no three and no scene, so
 * the Node twin (`tools/instruments/sickle-rules.test.mjs`) and the kind file run the same code. A helper module of
 * the Sickle kind (no default export: the registry skips it).
 *
 * THE PACK. Two or three Sickles circle her at 9-14 m, each on its own ring and phase, and feint: a feint is a 1.2 s
 * dart 3 m in toward her and back out to its ring. One member at a time may attack.
 *
 * CLEARCUT. A 0.6 s wind-up, then a 360-degree spin. The hub cowl opens for the wind-up only: the hub bearing (the weak
 * point, r 0.16 m, at the hub's centre) is exposed from the wind-up's first step to its last and covered otherwise.
 * `hubExposed()` is what a hit test reads.
 *
 * SCISSOR LUNGE. A 0.45 s wind-up, then a dash that carries the hull 8 m along its committed heading in 0.5 s.
 */

export const SICKLE_RULES = Object.freeze({
  walk: 2.2, run: 7.5, ringMin: 9, ringMax: 14,
  orbitSpeed: 3.2,                  // m/s along the ring
  feintS: 1.2, feintIn: 3, feintEvery: 4.5,
  clearcutWindupS: 0.6, clearcutSpinS: 0.9,
  lungeWindupS: 0.45, lungeDashS: 0.5, lungeLen: 8,
  hubR: 0.16, hubAt: [0, 1.10, 1.50],
});

/** The ring radius and phase of pack member `i` of `n` (deterministic: 9-14 m, spread round her). */
export function ringOf(i, n) {
  const R = SICKLE_RULES;
  const r = R.ringMin + ((R.ringMax - R.ringMin) * (n > 1 ? i / (n - 1) : 0.5));
  return { r: Math.min(R.ringMax - 0.4, Math.max(R.ringMin + 0.4, r)), phase: (i / n) * Math.PI * 2 };
}

/** One pack member's circling and feinting, its position at sim time t about the target (tx, tz). */
export function circlePos(i, n, t, tx, tz) {
  const R = SICKLE_RULES, ring = ringOf(i, n);
  const dir = i % 2 ? -1 : 1;
  const a = ring.phase + dir * (R.orbitSpeed / ring.r) * t;
  // a feint every `feintEvery` s (offset per member): in by feintIn and back, a half-sine over feintS
  const ft = (t + i * 1.7) % R.feintEvery;
  const dart = ft < R.feintS ? Math.sin((ft / R.feintS) * Math.PI) * R.feintIn : 0;
  const r = ring.r - dart;
  return { x: tx + Math.sin(a) * r, z: tz + Math.cos(a) * r, r, feint: dart > 0 };
}

/** The attack state of one Sickle on simulation time: `clearcut()` and `lunge(heading)` start a move; `step(dt)`. */
export class SickleBrain {
  constructor({ x = 0, z = 0, heading = 0 } = {}) {
    this.x = x; this.z = z; this.heading = heading;
    this.move = null;      // 'clearcut' | 'lunge' | null
    this.phase = null;     // 'windup' | 'strike' | null
    this.phaseT = 0;
    this.lockedHeading = 0;
    this.dashed = 0;
    this.t = 0;
  }

  clearcut() { if (this.move) return false; this.move = 'clearcut'; this.phase = 'windup'; this.phaseT = 0; return true; }

  lunge(heading) {
    if (this.move) return false;
    this.move = 'lunge'; this.phase = 'windup'; this.phaseT = 0; this.heading = heading; this.lockedHeading = heading; this.dashed = 0;
    return true;
  }

  /** IN8: the hub bearing is exposed exactly in the Clearcut wind-up. */
  hubExposed() { return this.move === 'clearcut' && this.phase === 'windup'; }

  /** The hub bearing's centre in the world. */
  hubWorld() {
    const [hx, hy, hz] = SICKLE_RULES.hubAt, s = Math.sin(this.heading), c = Math.cos(this.heading);
    return { x: this.x + hx * c + hz * s, y: hy, z: this.z - hx * s + hz * c };
  }

  /** Does a shot along the segment a -> b strike the exposed hub bearing? (ray vs the bearing's sphere) */
  shotHits(ax, ay, az, bx, by, bz) {
    if (!this.hubExposed()) return false;
    const h = this.hubWorld(), R = SICKLE_RULES.hubR;
    const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz;
    let u = ((h.x - ax) * dx + (h.y - ay) * dy + (h.z - az) * dz) / (L2 || 1e-9);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = ax + dx * u - h.x, qy = ay + dy * u - h.y, qz = az + dz * u - h.z;
    return qx * qx + qy * qy + qz * qz <= R * R;
  }

  step(dt) {
    const R = SICKLE_RULES;
    this.t += dt; this.phaseT += dt;
    if (!this.move) return;
    if (this.move === 'clearcut') {
      if (this.phase === 'windup' && this.phaseT >= R.clearcutWindupS) { this.phase = 'strike'; this.phaseT = 0; }
      else if (this.phase === 'strike') { this.heading += (2 * Math.PI / R.clearcutSpinS) * dt; if (this.phaseT >= R.clearcutSpinS) { this.move = null; this.phase = null; } }
      return;
    }
    if (this.move === 'lunge') {
      if (this.phase === 'windup' && this.phaseT >= R.lungeWindupS) { this.phase = 'strike'; this.phaseT = 0; }
      else if (this.phase === 'strike') {
        const step = Math.min((R.lungeLen / R.lungeDashS) * dt, R.lungeLen - this.dashed);
        this.x += Math.sin(this.lockedHeading) * step; this.z += Math.cos(this.lockedHeading) * step; this.dashed += step;
        if (this.dashed >= R.lungeLen - 1e-9) { this.move = null; this.phase = null; }
      }
    }
  }
}
