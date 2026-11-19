/**
 * TRUE GROUND (Milestone 2 area E, HR4; bible 1 "Re-surveying a benchmark makes its region true ground: Screeds stop
 * choosing targets there and its Datum Line vanishes", 10 "a re-surveyed region keeps measuring kinds only"). Pure: no
 * THREE, no DOM, no ctx; node --test walks it over the site clock (tools/gates/systems/true-ground.test.mjs).
 *
 *   const T = new TrueGround({ regionOf: (x, z) => id, classOf: (kind) => 'small' | 'medium' | 'large' })
 *   T.makeTrue(region, { benchmark, hour })     the re-survey's end; returns false if it already was
 *   T.isTrue(region) / T.trueAt(x, z)
 *   T.refuses(kind, x, z)                       a correcting kind may not spawn on true ground (the encounter gate)
 *   T.datum()                                   the site clock's datum view (src/game/sites/clock.js errorAt: trueAt)
 *   T.nodes()                                   benchmarks that are travel nodes (WALK THE LINE)
 *   T.walkRefused({ flagged, wary })            a walk is refused while Flagged, or with a wary or hostile Instrument
 *                                               within 60 m (bible 14 Travel); -> null | 'flagged' | 'wary'
 *   T.serialize() / T.restore(plain)            the 'regions' save field ({ [region]: { true, hour, benchmark } })
 *
 * CORRECTING KINDS: "small Instruments measure, medium ones sample and mark, large ones correct" (bible 7.1 rule 3).
 * A kind's class is the registry's (src/instruments/lib/sizeclass.js); a kind with no class is not refused.
 */
export const CORRECTING_CLASS = 'large';
/** WALK THE LINE is refused with a wary or hostile Instrument this near (bible 14). */
export const WALK_REFUSE_M = 60;

export class TrueGround {
  constructor({ regionOf = () => null, classOf = () => null, onChange = null } = {}) {
    this.regionOf = regionOf;
    this.classOf = classOf;
    this.onChange = onChange;
    /** @type {Map<string, { true: boolean, hour: number, benchmark: string|null }>} */
    this.regions = new Map();
    this.refused = 0;
  }

  isTrue(region) { return !!(region && this.regions.get(region)?.true); }

  trueAt(x, z) { return this.isTrue(this.regionOf(x, z)); }

  isCorrecting(kind) { return this.classOf(kind) === CORRECTING_CLASS; }

  makeTrue(region, { benchmark = null, hour = 0 } = {}) {
    if (!region || this.isTrue(region)) return false;
    this.regions.set(region, { true: true, hour: Math.round(Number(hour) * 1000) / 1000 || 0, benchmark });
    try { this.onChange?.(region); } catch { /* a listener's fault is its own */ }
    return true;
  }

  /** The encounter gate: refuse a correcting kind on true ground. Counts what it refused. */
  refuses(kind, x, z) {
    const no = this.isCorrecting(kind) && this.trueAt(x, z);
    if (no) this.refused++;
    return no;
  }

  /** What the site clock reads (clock.js errorAt: `trueAt(x, z)`). */
  datum() { return { trueAt: (x, z) => this.trueAt(x, z) }; }

  nodes() { return [...this.regions.values()].filter((r) => r.true && r.benchmark).map((r) => r.benchmark); }

  walkRefused({ flagged = false, wary = false } = {}) {
    if (flagged) return 'flagged';
    if (wary) return 'wary';
    return null;
  }

  serialize() {
    const out = {};
    for (const [id, r] of [...this.regions].sort(([a], [b]) => (a < b ? -1 : 1))) out[id] = { true: !!r.true, hour: r.hour, benchmark: r.benchmark ?? null };
    return out;
  }

  restore(plain) {
    this.regions.clear();
    if (plain && typeof plain === 'object') {
      for (const [id, r] of Object.entries(plain)) {
        if (r && r.true) this.regions.set(id, { true: true, hour: Number(r.hour) || 0, benchmark: r.benchmark ?? null });
      }
    }
    return this;
  }
}
