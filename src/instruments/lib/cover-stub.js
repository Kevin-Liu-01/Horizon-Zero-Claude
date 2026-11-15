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
 * 256 x 256 cells of 0.25 m (a 64 m square), anchored on the first cut's middle,
 * every cell full cover (255) until cut. A cut of width w along a segment sets each
 * cell to the cover left after an anti-aliased band: the cut fraction ramps from 1
 * to 0 across one cell centred on the band's edge (w / 2 from the segment), so the
 * lane's integral across its width is w and its edges are not stair-stepped.
 * Cuts only ever lower cover (min). Cold path: one call per peg driven.
 */
export const COVER_STUB = Object.freeze({ size: 256, cell: 0.25 });

export class CoverMaskStub {
  constructor() {
    const N = COVER_STUB.size;
    this.size = N;
    this.cell = COVER_STUB.cell;
    this.data = new Uint8Array(N * N).fill(255);
    this.ox = NaN; this.oz = NaN;
    this.cuts = 0;
    this.outside = 0;   // cuts that fell partly outside the 64 m square
  }

  /** The world contract's signature: `cutCover([x0, z0, x1, z1], w)`. */
  cutCover(seg, w) {
    const [x0, z0, x1, z1] = seg;
    const N = this.size, c = this.cell;
    if (!Number.isFinite(this.ox)) { this.ox = (x0 + x1) / 2 - (N * c) / 2; this.oz = (z0 + z1) / 2 - (N * c) / 2; }
    const half = w / 2, pad = half + c;
    const ex = x1 - x0, ez = z1 - z0, L2 = ex * ex + ez * ez;
    const i0 = Math.floor((Math.min(x0, x1) - pad - this.ox) / c), i1 = Math.ceil((Math.max(x0, x1) + pad - this.ox) / c);
    const j0 = Math.floor((Math.min(z0, z1) - pad - this.oz) / c), j1 = Math.ceil((Math.max(z0, z1) + pad - this.oz) / c);
    if (i0 < 0 || j0 < 0 || i1 >= N || j1 >= N) this.outside++;
    for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) {
      const z = this.oz + (j + 0.5) * c;
      for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
        const x = this.ox + (i + 0.5) * c;
        const t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / L2)) : 0;
        const dx = x - (x0 + ex * t), dz = z - (z0 + ez * t);
        const d = Math.sqrt(dx * dx + dz * dz);
        const f = Math.max(0, Math.min(1, (half - d) / c + 0.5));
        if (f <= 0) continue;
        const v = Math.round(255 * (1 - f)), o = j * N + i;
        if (v < this.data[o]) this.data[o] = v;
      }
    }
    this.cuts++;
  }

  /** Cover 0..1 at (x, z), bilinear over cell centres; 1 outside the square. */
  density(x, z) {
    const N = this.size, c = this.cell;
    if (!Number.isFinite(this.ox)) return 1;
    const u = (x - this.ox) / c - 0.5, v = (z - this.oz) / c - 0.5;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const at = (a, b) => (a < 0 || b < 0 || a >= N || b >= N ? 255 : this.data[b * N + a]);
    const top = at(i, j) * (1 - fu) + at(i + 1, j) * fu, bot = at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu;
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
