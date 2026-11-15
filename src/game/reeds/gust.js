/**
 * THE GUST CLOCK (BUILD M1.6e; bible §14 "Stealth has a clock").
 *
 *   "In trade weather the wind at a reed bed cycles a 9 s gust (5-7 m/s) and a 5 s lull (1.5-3 m/s), period
 *    14 s ± 2 s, phase seeded per bed so two beds are never in step. On a calima day the lull is 8 s. At night the
 *    gust is 7 s. The canes begin to lean 0.8 s before the gust reaches 4 m/s, which is the player's cue."
 *
 * One clock per bed, laid from a fixed origin by its seed (the same seed and moods give the same wind at the same
 * time, however the clock is stepped; a clock asked about a time before what it keeps lays again from its origin).
 * The game asks it about the plants' clock (src/game/reeds), so the rule, the drawing and the rows read one wind. Cycle k starts at the instant the wind rises through
 * 4 m/s (`T[k]`); the GUST is the span at or above 4 m/s, `G[k]` long; the LULL the span below it, `L[k]` long.
 * Each bed lays its cycles on its own grid of 14 s (its phase is set by its index): cycle k
 * starts within ±0.25 s of grid point k and gusts 9 s ± 0.5, so the lull is 5 s ± 1 and the period 14 s ± 0.5 (the
 * bible's ± 2 is a tolerance, not a wander). Seeded jitter never accumulates: a bed keeps its phase, and two beds
 * never fall into step. The plateaux are seeded per cycle: 5-7 m/s in the gust, 1.5-3 m/s in the lull. Between them the wind ramps over RAMP s on a smoothstep placed
 * so that it crosses 4 m/s exactly at the cycle's edges. Weather and night are read when a cycle is laid (one
 * cycle ahead of the clock): a calima lull is 8 s, a night gust 7 s.
 *
 * THE LEAN is the cue, read by the drawing: `lean(t)` is driven by the wind 0.8 s AHEAD of t. Below 4 m/s ahead
 * the canes stand at their lull lean; from the instant the wind 0.8 s ahead passes 4 m/s they begin to lean in
 * (an ease-out over the next 2.5 m/s). So the canes begin to lean 0.8 s before the gust reaches 4 m/s, and they
 * straighten 0.8 s before it falls back through it.
 *
 * Phase: bed i's grid starts at `-((5 i mod 12) / 12) * 14` s: no two of the twelve beds closer than 1.17 s. Plain JS, no THREE (the Node row reads it: tools/gates/systems/reed-cover.test.mjs).
 */
export const GUST = Object.freeze({
  on: 4.0,                 // m/s: the line between a lull and a gust (the rule's line)
  gust: 9, lull: 5,
  startJitter: 0.25,       // s, a cycle's start about its bed's grid point
  gustJitter: 0.5,         // s, a gust's length about its base
  calimaLull: 8, nightGust: 7,
  gustLo: 5, gustHi: 7, lullLo: 1.5, lullHi: 3,
  ramp: 1.6,               // s, the smoothstep between a plateau and the next
  lead: 0.8,               // s, the canes lean this far ahead of the 4 m/s crossing
  leanLull: 0.22,          // the lean (0..1 of the gust's full lean) the canes hold in a lull
  leanSpan: 2.5,           // m/s above 4 over which the lean eases to full
});

/** Beds' phases: index i takes (5 i mod 12) twelfths of a period, so the twelve beds are 1.17 s apart at least and
 * neighbouring beds (consecutive indices round the shore) 5.8 s apart. */
const PHASES = 12;

function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** The k in 0..1 at which smoothstep(k) == y (bisection: laid once per cycle edge). */
function invSmooth(y) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (smooth(m) < y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export class GustClock {
  /**
   * @param seed   the bed's seed (BEDS[i].seed)
   * @param index  the bed's index (its phase: golden-ratio spread over one period)
   * @param mood   () => { calima: bool, night: bool } read as each cycle is laid (default trade, day)
   */
  constructor(seed, index = 0, mood = null) {
    this.seed = seed >>> 0;
    this.index = index;
    this.mood = mood || (() => ({ calima: false, night: false }));
    this._reset();
  }

  _reset() {
    this.r = rand(this.seed);
    // cycles: T (start, rising through 4), G, L, gust plateau g, lull plateau l (the lull after this gust)
    this.T = []; this.G = []; this.L = []; this.g = []; this.l = [];
    // the bed's own grid: cycle k starts within +-startJitter of grid point k, so beds keep their phases
    const phase = (((this.index * 5) % PHASES) / PHASES) * (GUST.gust + GUST.lull);
    this._grid = -phase - (GUST.gust + GUST.lull);
    this._a = (this.r() * 2 - 1) * GUST.startJitter;
    this.lPrev = GUST.lullLo + this.r() * (GUST.lullHi - GUST.lullLo);
    this._push();
    this.k = 0;
  }

  /** Lay the next cycle: it starts at its grid point (+-startJitter); the next grid point is one mood period on. */
  _push() {
    const m = this.mood() || {};
    const Gb = m.night ? GUST.nightGust : GUST.gust, Lb = m.calima ? GUST.calimaLull : GUST.lull;
    const T = this._grid + this._a;
    const G = Gb + (this.r() * 2 - 1) * GUST.gustJitter;
    this._grid += Gb + Lb;
    this._a = (this.r() * 2 - 1) * GUST.startJitter;
    const L = this._grid + this._a - (T + G);
    this.T.push(T); this.G.push(G); this.L.push(L);
    this.g.push(GUST.gustLo + this.r() * (GUST.gustHi - GUST.gustLo));
    this.l.push(GUST.lullLo + this.r() * (GUST.lullHi - GUST.lullLo));
    // drop what is long past (keep the arrays short)
    if (this.T.length > 12) {
      this.lPrev = this.l[0];
      for (const a of [this.T, this.G, this.L, this.g, this.l]) a.shift();
      this.k = Math.max(0, this.k - 1);
    }
  }

  /** The cycle holding t (laying cycles ahead as needed). Returns its index into the arrays. */
  _cycle(t) {
    if (t < this.T[0] - GUST.ramp) this._reset();
    let n = this.T.length - 1;
    while (t >= this.T[n] + this.G[n] + this.L[n] - GUST.ramp) { this._push(); n = this.T.length - 1; }
    let k = Math.min(this.k, n);
    while (k > 0 && t < this.T[k] - GUST.ramp) k--;
    while (k < n && t >= this.T[k + 1] - GUST.ramp) k++;
    this.k = k;
    return k;
  }

  /** The wind speed at the bed (m/s) at time t. */
  speed(t) {
    const k = this._cycle(t);
    const lBefore = k > 0 ? this.l[k - 1] : this.lPrev;
    const T = this.T[k], G = this.G[k], g = this.g[k], l = this.l[k], R = GUST.ramp;
    // the rise through 4 at T: a smoothstep from the lull before to this gust's plateau
    const fu = invSmooth((GUST.on - lBefore) / (g - lBefore));
    const u0 = T - R * fu, u1 = u0 + R;
    if (t < u1) return lBefore + (g - lBefore) * smooth((t - u0) / R);
    // the fall through 4 at T + G
    const fd = invSmooth((g - GUST.on) / (g - l));
    const d0 = T + G - R * fd, d1 = d0 + R;
    if (t < d0) return g;
    if (t < d1) return g + (l - g) * smooth((t - d0) / R);
    return l;
  }

  /** In a gust (>= 4 m/s) at t. */
  gusting(t) { return this.speed(t) >= GUST.on; }

  /** The canes' lean 0..1 (of the gust's full lean) at t: the wind 0.8 s ahead drives it. */
  lean(t) {
    const s = this.speed(t + GUST.lead);
    const k = Math.max(0, Math.min(1, (s - GUST.on) / GUST.leanSpan));
    return GUST.leanLull + (1 - GUST.leanLull) * k * (2 - k);
  }

  /** The gust and lull spans that overlap [t0, t1]: [{ start, end, gust }] (for the rows). */
  spans(t0, t1) {
    const out = [];
    let t = t0, last = -Infinity;
    while (t < t1) {
      const k = this._cycle(t);
      const a = this.T[k], b = a + this.G[k], c = b + this.L[k];
      if (a > last) {
        if (b > t0 && a < t1) out.push({ start: a, end: b, gust: true });
        if (c > t0 && b < t1) out.push({ start: b, end: c, gust: false });
        last = a;
      }
      t = Math.max(t + 1e-3, c - GUST.ramp + 1e-6);
    }
    return out;
  }
}
