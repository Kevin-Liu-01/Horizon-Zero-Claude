/**
 * THE REGIONS SEAM (Milestone 2, the shared seams: one owner, everyone else only calls). Owner: engine.
 *
 * Which region a point is in, the `enter` / `leave` events of a crossing, and what is resident. Pure: no THREE, no
 * DOM, no ctx, so `node --test` runs every rule (tools/gates/systems/regions.test.mjs). The live half is
 * `engine.attachRegions()` (src/core/engine.js), ticked by the systems runtime with Brea's position.
 *
 * A REGION is a people's ground on one biome of the island recipe (`src/world/island/recipe.js` BIOMES): its cells
 * are the cells whose dominant biome is that region's, so the regions and the ground arrays agree by construction
 * and move with the ground when the Holds are re-baked. Every region is listed, so `regionAt` always answers; the
 * ones Milestone 2 builds (the Pans and the Holds) carry `built: true`.
 *
 *   const map = new RegionMap()                 the 4 m label grid and each region's signed distance (lazy)
 *   map.regionAt(x, z)          -> id           the region whose ground this is (engine x, z)
 *   map.depth(id, x, z)         -> metres       signed: > 0 inside (distance to its edge), < 0 outside
 *   const tr = new RegionTracker(map)
 *   tr.update(x, z)             -> events[]     fires each crossing once (see HYSTERESIS_M)
 *   tr.on('enter' | 'leave' | 'approach' | 'depart', fn({ region, x, z, depth }))
 *   tr.current                  -> id | null    the region she is in (null only between a leave and the next enter)
 *   tr.resident()               -> id[]         the region she is in plus every region she is approaching
 *   const ld = new RegionLoader(tr, { load(region, rows) -> Promise, unload?(region), assetsOf?(region), now?() })
 *   ld.status()                 -> { id: { state, tries, ms, error } }
 *
 * CALLERS (each only calls): world (ground arrays, far tiles), people (atlases), instruments (kind sets), audio
 * (zones), systems (the site clock per region). A caller that needs something resident in a region adds an asset row
 * to that region's `assets` below (the deferred row shape of `ctx.assets.loadExtra`), never a boot row: the first
 * load carries 0 files of a region that is not the Pans (EN2; tools/gates/systems/regions.test.mjs reads it).
 */
import { BIOMES, biomesAt } from '../world/island/recipe.js';
import { WORLD_SIZE } from '../world/island/extent.js';

/**
 * Hysteresis of a crossing, metres. `leave` fires when she is HYSTERESIS_M / 2 outside the region she is in and
 * `enter` when she is HYSTERESIS_M / 2 inside the next, so walking back and forth across a border inside a 20 m band
 * fires nothing, and the switch points of a crossing out and its crossing back are 20 m apart (EN1).
 */
export const HYSTERESIS_M = 20;
/**
 * A region within this many metres of her is being approached: its assets are fetched (EN1: "fetched on the walk").
 * 90 m, because the slice never comes that near the Holds (the cistern is 140 m from their edge, T1's top 105 m), so
 * no Holds file is fetched in the first 21 minutes; on the walk to Ninewalls the fetch starts about 100 m before the
 * enter point (18 s at a sprint, over a minute at a walk).
 */
export const APPROACH_M = 90;
/** The label grid's cell, metres. */
export const CELL_M = 4;

/**
 * @typedef {object} Region
 * @property {string} id
 * @property {string} name        the region's name as the map reads it (writing owns the words; this is a label)
 * @property {string} biome       one of recipe.js BIOMES; its cells are this region's ground
 * @property {boolean} built      Milestone 2 builds it (the Pans, the Holds); the others are listed so lookups answer
 * @property {string} people      the people of the region (people's atlases key on it)
 * @property {string[]} sites     site ids (src/world/island/sites.js) that stand in it
 * @property {Record<string, object>} assets  deferred asset rows (`ctx.assets.loadExtra` shape) resident while near
 * @property {string[]} files     public/ path prefixes this region's files live under (never in the first load)
 */

/** @type {ReadonlyArray<Readonly<Region>>} */
export const REGIONS = Object.freeze([
  { id: 'pans', name: 'The Pans', biome: 'pans', built: true, people: 'pan-houses',
    sites: ['saltrow', 'salt-pans', 'the-glass', 'organ-shelf', 'sounding-ring', 'black-sand-beach'],
    assets: {}, files: [] },
  { id: 'holds', name: 'The Crescent Holds', biome: 'holds', built: true, people: 'holds',
    sites: ['ninewalls', 'jameo'],
    assets: {}, files: ['models/holds/', 'textures/holds/'] },
  { id: 'malpais', name: 'The Malpais', biome: 'malpais', built: false, people: 'none',
    sites: ['kiln-yards', 'rust-cone', 'hornito-field'], assets: {}, files: ['models/malpais/', 'textures/malpais/'] },
  { id: 'cloudline', name: 'The Cloudline', biome: 'cloudline', built: false, people: 'cloudline',
    sites: ['mistfold', 'fog-harp'], assets: {}, files: ['models/cloudline/', 'textures/cloudline/'] },
  { id: 'flank', name: 'The Flank', biome: 'flank', built: false, people: 'none',
    sites: ['pinned-cliff', 'leveler-muster', 'the-boilers'], assets: {}, files: ['models/flank/', 'textures/flank/'] },
  { id: 'caldera', name: 'The Caldera', biome: 'caldera', built: false, people: 'none',
    sites: ['roques', 'calibration-yard', 'the-fundamental'], assets: {}, files: ['models/caldera/', 'textures/caldera/'] },
].map((r) => Object.freeze({ ...r, sites: Object.freeze(r.sites), assets: Object.freeze(r.assets), files: Object.freeze(r.files) })));

/** The region the game boots in: its rows may be boot rows; every other region's may not. */
export const BOOT_REGION = 'pans';

const byId = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const regionById = (id) => byId[id] || null;

/** The default classifier: the dominant biome of the island recipe at an engine point -> region id. */
export function biomeRegion() {
  const w = new Float32Array(BIOMES.length);
  const ids = BIOMES.map((b) => REGIONS.find((r) => r.biome === b)?.id ?? null);
  return (x, z) => {
    biomesAt(x, z, w);
    let k = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[k]) k = i;
    return ids[k];
  };
}

/**
 * The label grid and each region's signed distance, built once (about 65 k cells at 4 m over 1024 m; ~10 ms in Node).
 * `classify(x, z) -> region id` is injectable so a test can draw its own map.
 */
export class RegionMap {
  constructor({ classify = null, size = WORLD_SIZE, cell = CELL_M, regions = REGIONS } = {}) {
    this.size = size;
    this.cell = cell;
    this.n = Math.ceil(size / cell);
    this.half = size / 2;
    this.regions = regions;
    this._classify = classify;
    this.ready = false;
  }

  build() {
    if (this.ready) return this;
    const { n, cell, half } = this;
    const classify = this._classify || biomeRegion();
    const index = new Map(this.regions.map((r, i) => [r.id, i]));
    const label = new Uint8Array(n * n).fill(255);
    for (let iz = 0; iz < n; iz++) {
      const z = (iz + 0.5) * cell - half;
      for (let ix = 0; ix < n; ix++) {
        const id = classify((ix + 0.5) * cell - half, z);
        const k = index.get(id);
        if (k != null) label[iz * n + ix] = k;
      }
    }
    this.label = label;
    this.dist = this.regions.map((_, k) => signedDistance(label, n, k, cell));
    this.ready = true;
    return this;
  }

  _cell(x, z) {
    const { n, cell, half } = this;
    const ix = Math.max(0, Math.min(n - 1, Math.floor((x + half) / cell)));
    const iz = Math.max(0, Math.min(n - 1, Math.floor((z + half) / cell)));
    return iz * n + ix;
  }

  /** The region whose ground (x, z) is, or null off the grid's regions. */
  regionAt(x, z) {
    this.build();
    const k = this.label[this._cell(x, z)];
    return k === 255 ? null : this.regions[k].id;
  }

  /** Signed distance (m) from (x, z) to region `id`'s edge: > 0 inside, < 0 outside. Bilinear on cell centres. */
  depth(id, x, z) {
    this.build();
    const k = this.regions.findIndex((r) => r.id === id);
    if (k < 0) return -Infinity;
    const D = this.dist[k], { n, cell, half } = this;
    const fx = Math.max(0, Math.min(n - 1.001, (x + half) / cell - 0.5));
    const fz = Math.max(0, Math.min(n - 1.001, (z + half) / cell - 0.5));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const o = iz * n + ix;
    const a = D[o] + (D[o + 1] - D[o]) * tx, b = D[o + n] + (D[o + n + 1] - D[o + n]) * tx;
    return a + (b - a) * tz;
  }
}

/** Two-pass 8-neighbour chamfer distance (1, sqrt 2) of label k, signed: + inside, - outside, in metres. */
function signedDistance(label, n, k, cell) {
  const INF = 1e9, S2 = Math.SQRT2;
  const din = new Float32Array(n * n), dout = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { const inside = label[i] === k; din[i] = inside ? INF : 0; dout[i] = inside ? 0 : INF; }
  for (const d of [din, dout]) {
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const i = z * n + x; let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (z > 0) {
        v = Math.min(v, d[i - n] + 1);
        if (x > 0) v = Math.min(v, d[i - n - 1] + S2);
        if (x < n - 1) v = Math.min(v, d[i - n + 1] + S2);
      }
      d[i] = v;
    }
    for (let z = n - 1; z >= 0; z--) for (let x = n - 1; x >= 0; x--) {
      const i = z * n + x; let v = d[i];
      if (v === 0) continue;
      if (x < n - 1) v = Math.min(v, d[i + 1] + 1);
      if (z < n - 1) {
        v = Math.min(v, d[i + n] + 1);
        if (x < n - 1) v = Math.min(v, d[i + n + 1] + S2);
        if (x > 0) v = Math.min(v, d[i + n - 1] + S2);
      }
      d[i] = v;
    }
  }
  // a cell's distance is to the nearest cell of the other side; the edge lies half a cell between them
  const out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = (din[i] > 0 ? din[i] - 0.5 : -(dout[i] - 0.5)) * cell;
  return out;
}

/** enter / leave with hysteresis, approach / depart at APPROACH_M. Fires each crossing once. */
export class RegionTracker {
  constructor(map = new RegionMap(), { hysteresis = HYSTERESIS_M, approach = APPROACH_M } = {}) {
    this.map = map;
    this.band = hysteresis / 2;
    this.approachM = approach;
    this.current = null;
    this.near = new Set();
    this.started = false;
    this._on = new Map();
    /** every event fired, in order, for the rows (capped) */
    this.history = [];
  }

  on(type, fn) {
    if (!this._on.has(type)) this._on.set(type, new Set());
    this._on.get(type).add(fn);
    return () => this._on.get(type)?.delete(fn);
  }

  _fire(type, region, x, z, depth, out) {
    const e = { type, region, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, depth: Math.round(depth * 10) / 10 };
    out.push(e);
    if (this.history.length < 512) this.history.push(e);
    for (const fn of this._on.get(type) || []) { try { fn(e); } catch (err) { console.warn('[CAL] regions: a listener threw:', err?.message || err); } }
  }

  /** Feed her position (engine x, z). Returns the events this call fired. */
  update(x, z) {
    const out = [];
    const M = this.map;
    if (!this.started) {
      // the first fix (boot, Continue, a staged frame): she is where she stands, no band to cross
      this.started = true;
      const id = M.regionAt(x, z);
      if (id) { this.current = id; this._fire('enter', id, x, z, M.depth(id, x, z), out); }
    } else {
      if (this.current && M.depth(this.current, x, z) <= -this.band) {
        const was = this.current;
        this.current = null;
        this._fire('leave', was, x, z, M.depth(was, x, z), out);
      }
      if (!this.current) {
        let best = null, bd = this.band;
        for (const r of M.regions) { const d = M.depth(r.id, x, z); if (d >= bd) { best = r.id; bd = d; } }
        if (best) { this.current = best; this._fire('enter', best, x, z, bd, out); }
      }
    }
    for (const r of M.regions) {
      const d = M.depth(r.id, x, z), has = this.near.has(r.id);
      if (!has && (d >= -this.approachM || r.id === this.current)) { this.near.add(r.id); this._fire('approach', r.id, x, z, d, out); }
      else if (has && r.id !== this.current && d < -(this.approachM + this.band * 2)) { this.near.delete(r.id); this._fire('depart', r.id, x, z, d, out); }
    }
    return out;
  }

  /** The region she is in and every region she is approaching. */
  resident() { return [...this.near]; }

  /** A new place with no crossing (Continue, a death's stand-up, a staged frame): the next update is a first fix. */
  reset() { this.current = null; this.near.clear(); this.started = false; }
}

/**
 * Fetches a region's assets when it is approached and keeps them while it is near; a failure retries with backoff and
 * never blocks play (EN1). `load(region, rows)` returns a promise (the engine's is `ctx.assets.loadExtra(rows)`);
 * `unload(region)` is optional (residency is not trimmed in Milestone 2: 61 MB of 175 at f2ad55f).
 */
export const RETRY_S = Object.freeze([1, 2, 4, 8, 15]);

export class RegionLoader {
  constructor(tracker, { load, unload = null, assetsOf = (r) => r.assets, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
    this.tracker = tracker;
    this.load = load;
    this.assetsOf = assetsOf;
    this.unload = unload;
    this.now = now;
    /** @type {Record<string, {state: 'idle'|'loading'|'resident'|'failed', tries: number, ms: number, error: string|null, retryAt: number}>} */
    this.st = {};
    this._off = [
      tracker.on('approach', (e) => this._want(e.region)),
      tracker.on('depart', (e) => this._drop(e.region)),
    ];
  }

  _row(id) { return (this.st[id] ||= { state: 'idle', tries: 0, ms: 0, error: null, retryAt: 0 }); }

  _want(id) {
    const s = this._row(id);
    if (s.state === 'loading' || s.state === 'resident') return;
    const region = regionById(id);
    const rows = region ? this.assetsOf(region) || {} : {};
    if (!Object.keys(rows).length) { s.state = 'resident'; return; }   // nothing to fetch
    s.state = 'loading'; s.tries++;
    const t0 = this.now();
    let p;
    try { p = Promise.resolve(this.load(region, rows)); } catch (err) { p = Promise.reject(err); }
    p.then(() => { s.state = 'resident'; s.ms = Math.round(this.now() - t0); s.error = null; },
      (err) => {
        s.state = 'failed'; s.error = String(err?.message || err);
        s.retryAt = this.now() + RETRY_S[Math.min(RETRY_S.length - 1, s.tries - 1)] * 1000;
      });
  }

  _drop(id) {
    const s = this._row(id);
    if (s.state === 'resident' && this.unload) { try { this.unload(regionById(id)); } catch { /* never blocks */ } s.state = 'idle'; }
  }

  /** Per frame (cheap): a failed fetch of a region still near is retried when its backoff is up. */
  tick() {
    const t = this.now();
    for (const id of this.tracker.near) { const s = this.st[id]; if (s?.state === 'failed' && t >= s.retryAt) this._want(id); }
  }

  status() { return JSON.parse(JSON.stringify(this.st)); }

  dispose() { for (const off of this._off) off(); this._off = []; }
}
