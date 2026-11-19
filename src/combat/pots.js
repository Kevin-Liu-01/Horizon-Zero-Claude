/**
 * CALIMA · the clay pots (Milestone 2 area D, wave 3; bible §8.1 "Pots (clay, pendulum cast)", §8.3, §13 rule 5 "Pots
 * are pendulum casts ... at waist-to-chest height; no overhand throw exists"; KT3, KT5).
 *
 *   Brine Pot   a pale mist, 3 m, 8 s: Seized (joints lock, seized parts come off with one Pry or hook-rip)
 *   Cinder Pot  a fire pool, 2.5 m, 6 s: Charred (burn over time)
 *   Dust Pot    a dust cloud, 3.5 m, 6 s: Clouded (lamps blinded; the sightline through it is broken)
 * Carry cap 3 in all (bible "Carry caps": pots 3). Oro hands over two Brine and one Cinder at 0:35; Dust is made.
 *
 * THE CAST is a pendulum: the right hand takes the pot from the belt at her back (beside the lumbar), swings it down and
 * back past her hip, then forward and up, and lets go at or below her chest. The pot's flight is a plain ballistic arc
 * from the hand at the release; the launch speed is solved for the aimed point (`castVelocity`), so it lands where
 * the reticle is. Rules only, no THREE: the Node twin (src/combat/kit-m2.test.mjs) and the game run this file.
 */

export const G = 9.81;

/** The three pots: the element, its colour (bible §8.3; nothing violet), the field's radius and life. */
export const POTS = Object.freeze({
  brine: Object.freeze({ id: 'brine', word: 'BRINE POT', element: 'brine', colour: '#BDE6E3', radius: 3.0, lifeS: 8, field: 'mist' }),
  cinder: Object.freeze({ id: 'cinder', word: 'CINDER POT', element: 'cinder', colour: '#FF7A1A', radius: 2.5, lifeS: 6, field: 'pool' }),
  dust: Object.freeze({ id: 'dust', word: 'DUST POT', element: 'dust', colour: '#C98B4E', radius: 3.5, lifeS: 6, field: 'cloud' }),
});
export const POT_ORDER = Object.freeze(['brine', 'cinder', 'dust']);
export const POT_CAP = 3;

/**
 * The cast's phases (sim seconds; request to release 0.533 s, KT3 band 0.45-0.65):
 *   T take     the right hand reaches back to the belt beside the lumbar and closes on the pot's neck cord
 *   B back     the pendulum's back swing: down past her hip, the arm straight, the pot behind her thigh
 *   F forward  the swing forward and up: the hip turns into it first, the shoulder after
 *   R release  the fingers open with the hand in front of her, at or below her chest
 *   O follow   the arm follows through low and comes back to her side
 */
export const POT_CAST = Object.freeze({
  phases: Object.freeze([['T', 0.20], ['B', 0.15], ['F', 0.183], ['R', 0.0], ['O', 0.30]]),
  releaseAt: 0.533,
  total: 0.833,
  /** the arc's launch angle above level (deg): an underarm lob */
  angleDeg: 38,
  /** the aimed range (m): nearer is cast at the near bound, farther clamped to the far one */
  minRange: 2, maxRange: 16,
});

/** The phase of the cast at `t` s: [name, k 0..1]. */
export function castPhase(t, out = ['', 0]) {
  let a = 0;
  for (const [n, d] of POT_CAST.phases) {
    if (t < a + d || d === 0 && t <= a) { out[0] = n; out[1] = d > 0 ? (t - a) / d : 1; return out; }
    a += d;
  }
  out[0] = 'O'; out[1] = 1;
  return out;
}

/**
 * The launch velocity from the release point `from` to land on `to` (world, y up) at the cast's angle, raised if the
 * target stands too high for it. Into `out` {x, y, z}; returns null when it cannot reach.
 */
export function castVelocity(from, to, out = { x: 0, y: 0, z: 0 }, angleDeg = POT_CAST.angleDeg) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) { out.x = 0; out.z = 0; out.y = 0; return out; }
  let th = angleDeg * Math.PI / 180;
  // the arc must rise above the target's height: dy < d tan(th)
  for (let i = 0; i < 8 && d * Math.tan(th) - dy < 0.05 * d; i++) th = Math.min(1.3, th + 0.08);
  const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dy);
  if (!(den > 0)) return null;
  const v = Math.sqrt(G * d * d / den);
  const h = v * Math.cos(th);
  out.x = dx / d * h; out.z = dz / d * h; out.y = v * Math.sin(th);
  return out;
}

/**
 * Fly a pot from `from` at velocity `v` over ground `groundY(x, z)` at `dt` steps until it lands; returns
 * { x, y, z, t } of the landing (the first step below the ground, back-interpolated) or null after `maxS`.
 */
export function flyPot(from, v, groundY, dt = 1 / 60, maxS = 4) {
  let x = from.x, y = from.y, z = from.z, vy = v.y;
  for (let t = 0; t < maxS; t += dt) {
    const nx = x + v.x * dt, nz = z + v.z * dt;
    const ny = y + vy * dt - 0.5 * G * dt * dt;
    vy -= G * dt;
    const g = groundY(nx, nz);
    if (ny <= g) {
      const g0 = groundY(x, z), a = (y - g0) / Math.max(1e-6, (y - g0) - (ny - g));
      return { x: x + (nx - x) * a, y: g, z: z + (nz - z) * a, t: t + dt * a };
    }
    x = nx; y = ny; z = nz;
  }
  return null;
}

/** The aimed point clamped to the cast's range from `from` (a point on the ground; `groundY` gives its height). */
export function clampAim(from, to, groundY, out = { x: 0, y: 0, z: 0 }) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1e-6;
  const k = Math.max(POT_CAST.minRange, Math.min(POT_CAST.maxRange, d)) / d;
  out.x = from.x + dx * k; out.z = from.z + dz * k; out.y = groundY(out.x, out.z);
  return out;
}

/**
 * The belt (counts per pot, the type the wheel has selected; cap 3 in all). `take()` spends one of the selected type.
 */
export class PotBelt {
  constructor() {
    this.count = { brine: 0, cinder: 0, dust: 0 };
    this.selected = 'brine';
    this.owned = false;
  }

  get total() { return this.count.brine + this.count.cinder + this.count.dust; }

  /** Add `n` of `id` up to the cap; returns how many went in. */
  add(id, n = 1) {
    if (!POTS[id]) return 0;
    const k = Math.max(0, Math.min(n | 0, POT_CAP - this.total));
    this.count[id] += k;
    if (k && !this.count[this.selected]) this.selected = id;
    this.owned = this.owned || k > 0;
    return k;
  }

  /** The mouse wheel: the next type she carries (skips the empty ones; stays when none). */
  cycle(dir = 1) {
    const i0 = POT_ORDER.indexOf(this.selected);
    for (let s = 1; s <= POT_ORDER.length; s++) {
      const id = POT_ORDER[(i0 + dir * s + POT_ORDER.length * 4) % POT_ORDER.length];
      if (this.count[id] > 0) { this.selected = id; return id; }
    }
    return this.selected;
  }

  /** Spend one of the selected type; returns its id, or null when there is none. */
  take() {
    let id = this.selected;
    if (!(this.count[id] > 0)) id = POT_ORDER.find((k) => this.count[k] > 0) ?? null;
    if (!id) return null;
    this.count[id]--;
    this.selected = id;
    if (!this.count[id]) this.cycle(1);
    return id;
  }
}

/**
 * One field on the ground: a Brine mist, a Cinder pool or a Dust cloud. `contains(x, y, z)` for the machines it
 * reaches; `left` seconds.
 */
export class PotField {
  constructor(id, at) {
    const P = POTS[id];
    this.id = id; this.def = P;
    this.x = at.x; this.y = at.y; this.z = at.z;
    this.r = P.radius; this.left = P.lifeS; this.age = 0;
  }

  get alive() { return this.left > 1e-6; }

  step(dt) { this.age += dt; this.left = Math.max(0, this.left - dt); }

  /** Is the point inside the field (a flat disc for the pool, a squat dome for the mist and the cloud)? */
  contains(x, y, z, pad = 0) {
    const dx = x - this.x, dz = z - this.z, R = this.r + pad;
    if (dx * dx + dz * dz > R * R) return false;
    const top = this.def.field === 'pool' ? 1.2 : this.r * 1.1;
    return y >= this.y - 1 && y <= this.y + top;
  }
}
