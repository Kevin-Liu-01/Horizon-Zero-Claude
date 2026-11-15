import { authored, fbm, ss, GLASS, GLASS_LEVEL } from './recipe.js';
import { ISLAND_SCALE as S } from './extent.js';

/**
 * THE REED COVER MASK (BUILD M1.6e; bible §14 "Reed cover"; TECH §5 "Reed cover reads one 256² mask that both places
 * the reeds and drives the stealth rule, so the picture and the rule cannot disagree").
 *
 * ONE 256 x 256 MASK at 0.5 m a cell (a 128 m square on the Glass's basin), two bytes a cell:
 *   [0] cover 0..255   how dense the reed stands there (the drawing plants from it, the rule reads it)
 *   [1] bed            which bed the cell belongs to (`BEDS[bed]`: its kind and the seed of its gust clock)
 * Carrizo stands in a belt on the Glass's rim (plan distance 0.96-1.42, dry ground just above the water) in eight
 * beds round the shore; junco stands in the wet hollows on the lee side of the rim (the damp silt behind the dunes,
 * west and south-west of the Glass, never on the meadow). The golden meadow starts at plan distance 1.95
 * (bake.js GLASS_RIM): no cell of this mask is ever on it, and the rule never reads the meadow (it hides nobody).
 *
 * THE CUT LAYER. Peg transects cut 1 m lanes (bible §14 "reed is consumable"): `cutCover([x0, z0, x1, z1], w)`
 * is the world contract the Peg calls (`ctx.terrain.cutCover`, installed by src/game/reeds). Cuts are kept apart
 * from the base cover, in 64 m tiles of 256 x 256 at 0.25 m on the world grid (made on the first cut that reaches
 * them; this is the Peg lane's stand-in mask of M1.4d, moved here and made the world's), so a lane is measurable
 * anywhere a Peg walks, inside the reeds or not. A cut of width w along a segment sets each cell to the cut left
 * by an anti-aliased band (the cut ramps from 1 to 0 across one cell centred on the band's edge, w / 2 from the
 * segment): the lane's integral across its width is w and its edges are not stair-stepped. Cuts only ever grow.
 *
 * What stands at (x, z) is `cover(x, z) = base(x, z) * (1 - cut(x, z))`: the drawing plants from it and the rule
 * reads it, the marram field (terrain.reedCoverDensity) is cut by the same layer for the rule.
 *
 * Plain JS, no THREE: the Node rows build it from the recipe's own height (tools/gates/systems/reed-cover.test.mjs).
 */
export const REED_MASK = Object.freeze({ n: 256, cell: 0.5, size: 128 });
export const REED_KIND = Object.freeze({ NONE: 0, CARRIZO: 1, JUNCO: 2, MARRAM: 3 });
/** A cell counts as cover at or above this (the marram field's own line, terrain.isInReedCover). */
export const COVER_LINE = 0.45;

const CX = GLASS.e * S, CZ = -GLASS.n * S;
const X0 = CX - REED_MASK.size / 2, Z0 = CZ - REED_MASK.size / 2;
const CARRIZO_BEDS = 8;
const JUNCO_BEDS = 4;

/** The beds: carrizo 0-7 round the Glass (sector k, clockwise from north), junco 8-11 (the lee hollows, by sector). */
export const BEDS = Object.freeze([
  ...Array.from({ length: CARRIZO_BEDS }, (_, k) => Object.freeze({ id: k, kind: REED_KIND.CARRIZO, seed: 0x5eed0 + k * 977 })),
  ...Array.from({ length: JUNCO_BEDS }, (_, k) => Object.freeze({ id: CARRIZO_BEDS + k, kind: REED_KIND.JUNCO, seed: 0x7a11c + k * 1213 })),
]);

/** Sector 0..n-1 round the Glass's centre (clockwise from a bearing of 18 deg; engine -z is north), and how far
 * into it (0..1). The 18 deg puts the F31 place (look.reed) in the middle of a bed, not on a strait between two. */
function sector(x, z, n) {
  const a = Math.atan2(x - CX, -(z - CZ));              // bearing from the Glass's centre, -pi..pi
  const u = ((a / (Math.PI * 2)) + 2 - 0.05) % 1 * n;
  const k = Math.floor(u) % n;
  return { k, f: u - Math.floor(u) };
}

/**
 * The base cover at one point from the recipe and a ground height `h` (engine metres), with the plan distance `g`
 * and the slope `sl` (rise over run). Returns [cover 0..1, bed].
 */
function baseAt(x, z, h, sl) {
  const g = authored.glass(x, z);
  if (g > 1.9 || sl > 0.55) return [0, 0];
  const track = authored.track(x, z);
  const dry = ss(GLASS_LEVEL + 0.02, GLASS_LEVEL + 0.1, h) * (1 - ss(2.6, 3.6, h));
  /* carrizo: the rim belt, in beds 20-35 m long with clearings between them (the gap at a sector's edge is a strait
   * of open shore the patch noise widens) */
  const belt = ss(0.95, 1.0, g) * (1 - ss(1.3, 1.44, g));
  const sc = sector(x, z, CARRIZO_BEDS);
  const edge = ss(0.0, 0.07, sc.f) * (1 - ss(0.93, 1.0, sc.f));
  const patch = ss(0.4, 0.5, fbm(x * 0.05 + 45.8, z * 0.05 - 7.8, 3));
  const carrizo = belt * dry * (1 - ss(0.2, 0.5, track)) * (1 - ss(0.4, 0.55, sl)) * Math.min(1, edge * 1.4) * patch;
  /* junco: the damp hollows on the lee side of the rim (south-west of the Glass: the trade blows from 045), low
   * ground 0.25-0.9 m up, outside the carrizo belt and inside the marram's band, in long lee strips */
  const lee = Math.max(0, -((x - CX) * 0.7071 + (z - CZ) * -0.7071) / 50);   // 0 at the centre, + toward the SW
  const hollow = (1 - ss(0.75, 1.0, h)) * ss(GLASS_LEVEL + 0.06, GLASS_LEVEL + 0.14, h);
  const strip = ss(0.46, 0.56, fbm(x * 0.09 - 7, z * 0.03 + 11, 2));
  const jband = ss(1.32, 1.42, g) * (1 - ss(1.7, 1.85, g));
  const junco = jband * hollow * ss(0.5, 0.9, lee) * strip * (1 - ss(0.2, 0.5, track)) * (1 - ss(0.3, 0.45, sl));
  if (carrizo >= junco) return carrizo > 0.02 ? [carrizo, sc.k] : [0, 0];
  const sj = sector(x, z, JUNCO_BEDS);
  return junco > 0.02 ? [junco, CARRIZO_BEDS + sj.k] : [0, 0];
}

export class ReedMask {
  /** `heightAt(x, z)`: the ground the reeds stand on (the terrain's own read in the game; the recipe's in Node). */
  constructor(heightAt) {
    const N = REED_MASK.n, c = REED_MASK.cell;
    this.n = N; this.cell = c; this.x0 = X0; this.z0 = Z0;
    this.base = new Uint8Array(N * N * 2);
    // heights on the cell centres plus a one-cell rim, for the slope
    const H = new Float32Array((N + 2) * (N + 2));
    for (let j = -1; j <= N; j++) for (let i = -1; i <= N; i++) H[(j + 1) * (N + 2) + (i + 1)] = heightAt(X0 + (i + 0.5) * c, Z0 + (j + 0.5) * c);
    const hAt = (i, j) => H[(j + 1) * (N + 2) + (i + 1)];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = X0 + (i + 0.5) * c, z = Z0 + (j + 0.5) * c;
        const gx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * c), gz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * c);
        const [v, bed] = baseAt(x, z, hAt(i, j), Math.hypot(gx, gz));
        const o = (j * N + i) * 2;
        this.base[o] = Math.max(0, Math.min(255, Math.round(v * 255)));
        this.base[o + 1] = bed;
      }
    }
    this.cuts = new CutLayer();
    this.version = 0;          // bumped by every cut: the drawing re-plants what changed
    this.dirty = null;         // [x0, z0, x1, z1] of the cuts since the drawing last read it
  }

  /** Inside the mask's square. */
  covers(x, z) { return x >= X0 && z >= Z0 && x < X0 + REED_MASK.size && z < Z0 + REED_MASK.size; }

  _cell(gi, gj) {
    const N = this.n;
    if (gi < 0 || gj < 0 || gi >= N || gj >= N) return 0;
    return this.base[(gj * N + gi) * 2];
  }

  /** The uncut base cover 0..1 at (x, z), bilinear over cell centres. */
  baseAt(x, z) {
    const c = this.cell, u = (x - X0) / c - 0.5, v = (z - Z0) / c - 0.5;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    if (i < -1 || j < -1 || i >= this.n || j >= this.n) return 0;
    const a = this._cell(i, j), b = this._cell(i + 1, j), d = this._cell(i, j + 1), e = this._cell(i + 1, j + 1);
    return ((a + (b - a) * fu) * (1 - fv) + (d + (e - d) * fu) * fv) / 255;
  }

  /** The bed at (x, z): that of the densest of the four cells `baseAt` blends (null where no reed stands). */
  bedAt(x, z) {
    const c = this.cell, u = (x - X0) / c - 0.5, v = (z - Z0) / c - 0.5, N = this.n;
    const i = Math.floor(u), j = Math.floor(v);
    let best = 0, bed = -1;
    for (let q = 0; q < 4; q++) {
      const gi = i + (q & 1), gj = j + (q >> 1);
      if (gi < 0 || gj < 0 || gi >= N || gj >= N) continue;
      const o = (gj * N + gi) * 2;
      if (this.base[o] > best) { best = this.base[o]; bed = this.base[o + 1]; }
    }
    return bed >= 0 ? BEDS[bed] : null;
  }

  /** What stands at (x, z): the base cover less the cuts, 0..1. */
  cover(x, z) {
    const b = this.baseAt(x, z);
    return b > 0 ? b * (1 - this.cuts.cutAt(x, z)) : 0;
  }

  /** The world contract (`terrain.cutCover`): cut a lane of width w along [x0, z0, x1, z1]. */
  cutCover(seg, w) {
    this.cuts.cut(seg, w);
    const pad = w / 2 + 0.5;
    const r = [Math.min(seg[0], seg[2]) - pad, Math.min(seg[1], seg[3]) - pad, Math.max(seg[0], seg[2]) + pad, Math.max(seg[1], seg[3]) + pad];
    const d = this.dirty;
    this.dirty = d ? [Math.min(d[0], r[0]), Math.min(d[1], r[1]), Math.max(d[2], r[2]), Math.max(d[3], r[3])] : r;
    this.version++;
  }

  /** The cells with any cover: { cells, carrizo, junco, area m² } for the rows. */
  stats() {
    let carrizo = 0, junco = 0, dense = 0;
    const N = this.n;
    for (let k = 0; k < N * N; k++) {
      const v = this.base[k * 2];
      if (!v) continue;
      if (BEDS[this.base[k * 2 + 1]].kind === REED_KIND.CARRIZO) carrizo++; else junco++;
      if (v >= COVER_LINE * 255) dense++;
    }
    const a = this.cell * this.cell;
    return { carrizoM2: carrizo * a, juncoM2: junco * a, coverM2: dense * a, beds: BEDS.length };
  }
}

/**
 * THE CUT LAYER: tiles of 256 x 256 cells of 0.25 m (64 m squares) on the world grid, made on the first cut that
 * reaches them, every cell uncut (0) until cut. Cold path: one call per peg driven.
 */
export class CutLayer {
  constructor() {
    this.size = 256;
    this.cell = 0.25;
    this.tiles = new Map();   // "ti,tj" -> Uint8Array(size * size), 255 = fully cut
    this.cuts = 0;
    this.outside = 0;         // kept for the Peg probe's row: with tiles no cut falls outside
  }

  _tile(ti, tj, make) {
    const k = `${ti},${tj}`;
    let t = this.tiles.get(k);
    if (!t && make) { t = new Uint8Array(this.size * this.size); this.tiles.set(k, t); }
    return t || null;
  }

  _at(gi, gj) {
    const N = this.size, ti = Math.floor(gi / N), tj = Math.floor(gj / N);
    const t = this._tile(ti, tj, false);
    return t ? t[(gj - tj * N) * N + (gi - ti * N)] : 0;
  }

  cut(seg, w) {
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
        const f = Math.max(0, Math.min(1, (half - Math.sqrt(dx * dx + dz * dz)) / c + 0.5));
        if (f <= 0) continue;
        const ti = Math.floor(i / N), tile = this._tile(ti, tj, true);
        const v = Math.round(255 * f), o = (j - tj * N) * N + (i - ti * N);
        if (v > tile[o]) tile[o] = v;
      }
    }
    this.cuts++;
  }

  /** The cut 0..1 at (x, z), bilinear over cell centres; 0 where nothing was cut. */
  cutAt(x, z) {
    if (!this.tiles.size) return 0;
    const c = this.cell, u = x / c - 0.5, v = z / c - 0.5;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const top = this._at(i, j) * (1 - fu) + this._at(i + 1, j) * fu, bot = this._at(i, j + 1) * (1 - fu) + this._at(i + 1, j + 1) * fu;
    return (top * (1 - fv) + bot * fv) / 255;
  }

  /** Cover 0..1 as the M1.4d stand-in read it (1 uncut): kept so the Peg probe's lane row reads either. */
  density(x, z) { return 1 - this.cutAt(x, z); }

  /**
   * The lane across (x, z) along the unit normal (nx, nz): `integral` is the cut integrated across +-span (m of
   * lane), `run` the contiguous width through the point where the cut is at least half (m).
   */
  laneAt(x, z, nx, nz, span = 3, step = 0.01) {
    let integral = 0;
    const n = Math.round(span / step);
    for (let k = -n; k <= n; k++) integral += this.cutAt(x + nx * k * step, z + nz * k * step) * step;
    let a = 0, b = 0;
    while (a < n && this.cutAt(x - nx * (a + 1) * step, z - nz * (a + 1) * step) >= 0.5) a++;
    while (b < n && this.cutAt(x + nx * (b + 1) * step, z + nz * (b + 1) * step) >= 0.5) b++;
    const centre = this.cutAt(x, z) >= 0.5;
    return { integral, run: centre ? (a + b + 1) * step : 0 };
  }
}
