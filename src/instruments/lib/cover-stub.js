/**
 * THE COVER MASK STUB (instruments, BUILD M1.4d). The reed cover of BUILD M1.6e
 * ("carrizo and junco beds ... from one 256² cover mask that both draws the reeds
 * and drives the rule") is not built, and `ctx.terrain.cutCover` does not exist
 * yet. The Peg transects cut their lanes into this stand-in instead, so the lane
 * a swarm cuts can be measured. It is a STUB: nothing draws it, nothing hides in
 * it, the stealth rule never reads it. When the world's mask lands it takes the
 * cuts (`peg-transect.js` calls `terrain.cutCover` whenever it exists) and this
 * file goes.
 *
 * Tiles of 256 x 256 cells of 0.25 m (64 m squares) on the world grid, made on
 * the first cut that reaches them, every cell full cover (255) until cut. (Fix
 * round 1: one square anchored on the first cut anywhere left a later swarm's
 * lines outside it once F23-peg moved: 30 of 31 cuts outside, every lane 0 m.)
 * A cut of width w along a segment sets each cell to the cover left after an
 * anti-aliased band: the cut fraction ramps from 1 to 0 across one cell centred on
 * the band's edge (w / 2 from the segment), so the lane's integral across its width
 * is w and its edges are not stair-stepped. Cuts only ever lower cover (min). Cold
 * path: one call per peg driven.
 */
export const COVER_STUB = Object.freeze({ size: 256, cell: 0.25 });

export class CoverMaskStub {
  constructor() {
    this.size = COVER_STUB.size;
    this.cell = COVER_STUB.cell;
    this.tiles = new Map();   // "ti,tj" -> Uint8Array(size * size)
    this.cuts = 0;
    this.outside = 0;         // kept for the probe's row: with tiles no cut falls outside
  }

  _tile(ti, tj, make) {
    const k = `${ti},${tj}`;
    let t = this.tiles.get(k);
    if (!t && make) { t = new Uint8Array(this.size * this.size).fill(255); this.tiles.set(k, t); }
    return t || null;
  }

  /** Cover byte at global cell (gi, gj); 255 where no tile was made. */
  _at(gi, gj) {
    const N = this.size, ti = Math.floor(gi / N), tj = Math.floor(gj / N);
    const t = this._tile(ti, tj, false);
    return t ? t[(gj - tj * N) * N + (gi - ti * N)] : 255;
  }

  /** The world contract's signature: `cutCover([x0, z0, x1, z1], w)`. */
  cutCover(seg, w) {
    const [x0, z0, x1, z1] = seg;
    const N = this.size, c = this.cell;
    const half = w / 2, pad = half + c;
    const ex = x1 - x0, ez = z1 - z0, L2 = ex * ex + ez * ez;
    const i0 = Math.floor((Math.min(x0, x1) - pad) / c), i1 = Math.ceil((Math.max(x0, x1) + pad) / c);
    const j0 = Math.floor((Math.min(z0, z1) - pad) / c), j1 = Math.ceil((Math.max(z0, z1) + pad) / c);
    for (let j = j0; j <= j1; j++) {
      const z = (j + 0.5) * c, tj = Math.floor(j / N);
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * c;
        const t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / L2)) : 0;
        const dx = x - (x0 + ex * t), dz = z - (z0 + ez * t);
        const d = Math.sqrt(dx * dx + dz * dz);
        const f = Math.max(0, Math.min(1, (half - d) / c + 0.5));
        if (f <= 0) continue;
        const ti = Math.floor(i / N), tile = this._tile(ti, tj, true);
        const v = Math.round(255 * (1 - f)), o = (j - tj * N) * N + (i - ti * N);
        if (v < tile[o]) tile[o] = v;
      }
    }
    this.cuts++;
  }

  /** Cover 0..1 at (x, z), bilinear over cell centres; 1 where nothing was cut. */
  density(x, z) {
    const c = this.cell;
    if (!this.tiles.size) return 1;
    const u = x / c - 0.5, v = z / c - 0.5;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const top = this._at(i, j) * (1 - fu) + this._at(i + 1, j) * fu, bot = this._at(i, j + 1) * (1 - fu) + this._at(i + 1, j + 1) * fu;
    return (top * (1 - fv) + bot * fv) / 255;
  }

  /**
   * The lane across (x, z) along the unit normal (nx, nz): `integral` is the cut
   * integrated across +-span (m of lane), `run` the contiguous width through the
   * point where the cut is at least half (m).
   */
  laneAt(x, z, nx, nz, span = 3, step = 0.01) {
    let integral = 0;
    const n = Math.round(span / step);
    for (let k = -n; k <= n; k++) integral += (1 - this.density(x + nx * k * step, z + nz * k * step)) * step;
    let a = 0, b = 0;
    while (a < n && 1 - this.density(x - nx * (a + 1) * step, z - nz * (a + 1) * step) >= 0.5) a++;
    while (b < n && 1 - this.density(x + nx * (b + 1) * step, z + nz * (b + 1) * step) >= 0.5) b++;
    const centre = 1 - this.density(x, z) >= 0.5;
    return { integral, run: centre ? (a + b + 1) * step : 0 };
  }
}
