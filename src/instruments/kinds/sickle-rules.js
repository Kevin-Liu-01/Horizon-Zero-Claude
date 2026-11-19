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

/**
 * THE PACK'S FIGHT (M2 wave 3, area C; the live Sickle in `./sickle.js` runs exactly this; Node twin
 * tools/instruments/sickle-fight.test.mjs). Each member has a SickleBrain and a SickleFight; the members of a pack share
 * one SicklePack, which lets ONE member attack at a time (`attackCd` between attacks, round robin).
 *   wait   stands (calm) until she is within `engageM` of any member of its pack, or one is struck; only inside its
 *          arena (`arena` { x, z, r }, so the line-up's F23-sickle on the Pans never starts a fight)
 *   ring   circles her on its own ring (circlePos: 9-14 m, feints 3 m in), at most `run` m/s, facing her
 *   attack the pack's turn: within `clearcutM` it winds up Clearcut (0.6 s, the hub bearing exposed: `hubExposed()`)
 *          and spins; at `lungeM` it winds up the Scissor Lunge (0.45 s) on its heading at her and dashes 8 m
 * The blades strike her once a move: Clearcut if she is within `clearcutHitM` when it spins, the lunge if its dash
 * passes within `lungeHitM` of her. Events: 'sickle-engage', 'sickle-clearcut', 'sickle-lunge', 'blade-hit' {move}.
 */
export const PACK = Object.freeze({
  engageM: 22, run: SICKLE_RULES.run, attackCd: 2.4,
  clearcutM: 4.0, lungeM: Object.freeze([6, 11]), clearcutHitM: 2.8, lungeHitM: 1.3,
  clearcutDmg: 14, lungeDmg: 18,
});

export class SicklePack {
  constructor() { this.members = []; this.turn = 0; this.cd = 1.5; this.attacker = null; this.engaged = false; }
  join(f) { if (!this.members.includes(f)) this.members.push(f); return this; }
  live() { return this.members.filter((f) => f.alive()); }
  step(dt) {
    if (this.attacker && !this.attacker.b.move) { this.attacker = null; this.cd = PACK.attackCd; }
    if (!this.attacker && this.cd > 0) this.cd -= dt;
  }
  /** Is it `f`'s turn to attack now? */
  mayAttack(f) {
    if (this.attacker || this.cd > 0) return false;
    const L = this.live();
    if (!L.length) return false;
    return L[this.turn % L.length] === f;
  }
  took(f) { this.attacker = f; this.turn++; }
}

export class SickleFight {
  constructor(brain, pack, { arena = null, alive = () => true } = {}) {
    this.b = brain; this.pack = pack.join(this); this.arena = arena; this.alive = alive;
    this.mode = 'wait'; this.t = 0; this.struck = false; this.hit = false; this.lastMove = null;
    this.events = [];
  }

  _ev(type, payload) { this.events.push(payload ? { type, ...payload } : { type }); }

  /** One step: she is at (px, pz) or null. Events of this step in `this.events`. The pack steps once per frame (its owner). */
  step(dt, px, pz) {
    const b = this.b, P = this.pack;
    this.events.length = 0;
    this.t += dt;
    const has = px != null && pz != null;
    const dx = has ? px - b.x : 1e9, dz = has ? pz - b.z : 1e9, d = Math.hypot(dx, dz);
    const inArena = !this.arena || Math.hypot(b.x - this.arena.x, b.z - this.arena.z) <= this.arena.r;
    if (this.mode === 'wait' && inArena && (P.engaged || this.struck || d < PACK.engageM)) {
      this.mode = 'ring'; P.engaged = true; this._ev('sickle-engage');
    }
    if (this.mode === 'wait' || !has) { b.step(dt); return this.events; }
    const L = P.live(), n = Math.max(1, L.length), i = Math.max(0, L.indexOf(this));
    if (!b.move && P.mayAttack(this)) {
      if (d <= PACK.clearcutM) { b.heading = Math.atan2(dx, dz); b.clearcut(); P.took(this); this.hit = false; this._ev('sickle-clearcut'); }
      else if (d >= PACK.lungeM[0] && d <= PACK.lungeM[1]) { b.lunge(Math.atan2(dx, dz)); P.took(this); this.hit = false; this._ev('sickle-lunge'); }
    }
    if (!b.move) {
      // the ring: toward its circling point at most `run`, facing her
      const q = circlePos(i, n, this.t, px, pz);
      const ex = q.x - b.x, ez = q.z - b.z, e = Math.hypot(ex, ez), stepM = Math.min(e, PACK.run * dt);
      if (e > 1e-6) { b.x += (ex / e) * stepM; b.z += (ez / e) * stepM; }
      b.heading = Math.atan2(px - b.x, pz - b.z);
      this.ringSpeed = stepM / dt;
    } else this.ringSpeed = 0;
    const wasMove = b.move, wasPhase = b.phase;
    b.step(dt);
    // the blades' blows
    if (!this.hit && wasMove === 'clearcut' && wasPhase === 'strike' && d <= PACK.clearcutHitM) { this.hit = true; this._ev('blade-hit', { move: 'clearcut' }); }
    if (!this.hit && wasMove === 'lunge' && wasPhase === 'strike' && Math.hypot(px - b.x, pz - b.z) <= PACK.lungeHitM) { this.hit = true; this._ev('blade-hit', { move: 'lunge' }); }
    return this.events;
  }
}
