#!/usr/bin/env node
/**
 * C5 (engine, the first hour's hitches): THE WALK GRID'S LONG SEARCHES, in Node, no browser.
 *
 *   node tools/perf/walk-path-bench.mjs [--pairs 400] [--json <out.json>]
 *
 * Builds Ninewalls' walk grid as the Holds people's Node row does (tools/build/recipes/npc/holds-routines.test.mjs: the
 * island recipe's heights at the bake's nodes, bilinear; the village's colliders in the game's Collision; the grid's box,
 * discs and radius from src/world/npc/people/holds.js NINEWALLS_WALK), then searches routes like the youths' re-routes
 * on the walk into the Holds: from every place of the cast's loops to marks along the herd's slope (HERD_SLOPE), each
 * one twice on the same grid:
 *   exact   the search every route took before C5 (src/core/nav.js WalkGrid._search with no landmarks), to its end
 *   path()  what WalkGrid.path does now: the exact search up to WALK_EXACT_EXP cells, then the landmark (ALT) search
 * and reports per route the cells expanded, the ms, and the path's cost (the search's own g at the goal) against the
 * exact one, plus how long the landmarks took to make. Every route under the exact budget must come out cell for cell
 * the same (the bench says how many did not).
 */
import { writeFileSync } from 'node:fs';
import { NINEWALLS_WALK, holdsPlaces } from '../../src/world/npc/people/holds.js';
import * as NWL from '../../src/world/settlements/ninewalls-layout.js';
import { heightAt } from '../../src/world/island/recipe.js';
import { GRID } from '../../src/world/island/bake.js';
import { Collision } from '../../src/core/collision.js';
import { WalkGrid } from '../../src/core/nav.js';
import { HERD_SLOPE } from '../../src/world/holds/blockout.js';
import { ISLAND_SCALE as S } from '../../src/world/island/extent.js';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PAIRS = Number(flag('--pairs', 400));
const JSON_OUT = flag('--json');

/* the ground as terrain.getHeight reads it (as the Node row) */
const GS = GRID.step, GH = GRID.half, nodes = new Map();
const node = (ix, iz) => { const k = ix * 100003 + iz; let v = nodes.get(k); if (v === undefined) { v = heightAt(ix * GS - GH, iz * GS - GH); nodes.set(k, v); } return v; };
const ground = (x, z) => {
  const fx = (x + GH) / GS, fz = (z + GH) / GS, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = node(ix, iz) + (node(ix + 1, iz) - node(ix, iz)) * tx, b = node(ix, iz + 1) + (node(ix + 1, iz + 1) - node(ix, iz + 1)) * tx;
  return a + (b - a) * tz;
};

const C = new Collision({});
NWL.ninewallsColliders(ground).forEach((d) => C.register(d));
const grid = new WalkGrid(NINEWALLS_WALK.box, { height: ground, depth: null, colliders: () => C.colliders, forEachTriangle: (c, f) => C.forEachTriangle(c, f) }, { discs: NINEWALLS_WALK.discs, radius: NINEWALLS_WALK.radius });
let t = performance.now();
grid.build();
const buildMs = performance.now() - t;

/* the routes: the loops' places -> marks along the herd's slope (its line in engine x, z: e east, n north -> x = e S, z = -n S) */
const places = [];
for (const v of Object.values(holdsPlaces())) {
  const list = Array.isArray(v) ? v : [v];
  for (const p of list) if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && grid.contains(p.x, p.z, 1) && !grid.blockedAt(p.x, p.z)) places.push({ x: p.x, z: p.z });
}
const [A, B] = HERD_SLOPE.map((q) => ({ x: q.e * S, z: -q.n * S }));
const marks = [];
for (let k = 0; k <= 40; k++) {
  const m = { x: A.x + (B.x - A.x) * k / 40, z: A.z + (B.z - A.z) * k / 40 };
  for (const off of [-7, 0, 7]) {
    const L = Math.hypot(B.x - A.x, B.z - A.z) || 1, nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L;
    const q = { x: m.x + nx * off, z: m.z + nz * off };
    if (grid.contains(q.x, q.z, 1)) marks.push(q);
  }
}
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pairs = [];
for (let i = 0; i < PAIRS && places.length && marks.length; i++) pairs.push([places[Math.floor(rnd() * places.length)], marks[Math.floor(rnd() * marks.length)]]);

/** One search on the grid's own cells: { found, exp, ms, cost } (cost: the search's g at the goal). */
function search(from, to, alt) {
  const s = grid.nearestOpen(from.x, from.z), g = grid.nearestOpen(to.x, to.z, 12);
  if (s < 0 || g < 0) return null;
  const t0 = performance.now();
  grid._alt = alt ? grid._lm : null;
  let found;
  try { found = grid._search(s, g, 120000); } finally { grid._alt = null; }
  return { found, exp: grid._exp, ms: performance.now() - t0, cost: found ? grid._g[g] : null };
}

// exact (before C5), then path() with the landmarks standing
const rows = pairs.map(([f, to]) => ({ f, to, exact: search(f, to, false) }));
t = performance.now();
const ready = grid.landmarksNow();
const lmMs = performance.now() - t;
let sameUnder = 0, diffUnder = 0;
for (const r of rows) {
  if (!r.exact) continue;
  const before = grid.stats.lastExp;
  const t0 = performance.now();
  const p = grid.path(r.f, r.to);
  r.pathMs = performance.now() - t0;
  r.pathExp = grid.stats.lastExp !== before || p ? grid.stats.lastExp : null;
  if (r.exact.exp <= 32000) { const e = search(r.f, r.to, false); if (e.exp === r.exact.exp && e.cost === r.exact.cost) sameUnder++; else diffUnder++; }
  else r.alt = search(r.f, r.to, true);
}
const long = rows.filter((r) => r.alt && r.exact.found);
const unreachable = rows.filter((r) => r.exact && !r.exact.found).length;
const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null);
const sorted = (a) => a.slice().sort((x, y) => x - y);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const out = {
  grid: grid.audit(), buildMs: r2(buildMs), landmarks: { ready, ms: r2(lmMs), ...grid.stats.landmarks },
  routes: rows.length, unreachable, underBudget: { same: sameUnder, different: diffUnder },
  long: {
    n: long.length,
    exactExp: { p50: q(sorted(long.map((r) => r.exact.exp)), 0.5), max: Math.max(0, ...long.map((r) => r.exact.exp)) },
    exactMs: { p50: r2(q(sorted(long.map((r) => r.exact.ms)), 0.5)), max: r2(Math.max(0, ...long.map((r) => r.exact.ms))) },
    altExp: { p50: q(sorted(long.map((r) => r.alt.exp)), 0.5), max: Math.max(0, ...long.map((r) => r.alt.exp)) },
    altMs: { p50: r2(q(sorted(long.map((r) => r.alt.ms)), 0.5)), max: r2(Math.max(0, ...long.map((r) => r.alt.ms))) },
    pathMs: { p50: r2(q(sorted(long.map((r) => r.pathMs)), 0.5)), max: r2(Math.max(0, ...long.map((r) => r.pathMs))) },
    altNotFound: long.filter((r) => !r.alt.found).length,
    costRatioMax: r2(Math.max(1, ...long.filter((r) => r.alt.found).map((r) => r.alt.cost / r.exact.cost))),
  },
  allPathMs: { p50: r2(q(sorted(rows.map((r) => r.pathMs ?? 0)), 0.5)), p99: r2(q(sorted(rows.map((r) => r.pathMs ?? 0)), 0.99)), max: r2(Math.max(0, ...rows.map((r) => r.pathMs ?? 0))) },
};
console.log(JSON.stringify(out, null, 1));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ ...out, rows: rows.map((r) => ({ f: r.f, to: r.to, exact: r.exact, alt: r.alt ?? null, pathMs: r2(r.pathMs) })) }));
