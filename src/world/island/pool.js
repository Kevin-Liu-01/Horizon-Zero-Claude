/**
 * THE TERRAIN WORKER POOL (world-ground W1). Binding from plan §8.3: the pool ships in
 * the real build, not only in the probe; the whole build stays ≤ 1.271 µs/vertex and
 * ≤ 600 ms; `getHeight` then reads the baked grid.
 *
 * bakeIsland() resolves once, before `Terrain` constructs (terrain.js awaits it at module
 * top level, so main.js boots after it). `?terrainpool=0` forces the single-thread path,
 * which is what `A-world-size` compares the pool against, byte for byte.
 *
 * Every worker is terminated when the bake resolves. On any worker failure the whole bake
 * falls back to the single-thread path (never a half-baked island).
 */
import { ensureMacro, macroShared } from './recipe.js';
import { GRID, MASK_N, PAN_N, bakeHeights, bakeShade, bakeMasks, bakePan } from './bake.js';
import { LAYER_FILES, LAYER_SIZE, decodeLayer } from './layers.js';
import { KINDS, STRIDE, TILE_N, fieldReader, scatterRows, scatterStatic } from './scatter.js';

export const POOL = Object.freeze({ workers: 4, rowsPerJob: 32, maskRowsPerJob: 48, inflight: 2 });

const layerUrl = (id, part) => `/textures/ground/${id}_${part}.webp`;

function layerJobs() {
  const jobs = [];
  for (const group of ['big', 'small']) {
    LAYER_FILES[group].forEach((id, layer) => {
      for (const part of ['a', 'n']) jobs.push({ group, layer, part, url: layerUrl(id, part) });
    });
  }
  return jobs;
}

function assemble(parts) { return parts; }

/** Stitch per-row scatter into one record array + tile offsets per kind. */
function stitchScatter(rowParts, staticPart) {
  const out = { static: staticPart, kinds: {} };
  for (const kind of Object.keys(KINDS)) {
    let total = 0;
    for (const p of rowParts) total += p.part[kind].rec.length;
    const rec = new Float32Array(total), start = new Uint32Array(TILE_N * TILE_N + 1);
    let w = 0;
    const counts = new Uint32Array(TILE_N * TILE_N);
    for (const p of rowParts) {
      rec.set(p.part[kind].rec, w);
      w += p.part[kind].rec.length;
      counts.set(p.part[kind].counts, p.tz0 * TILE_N);
    }
    let acc = 0;
    for (let i = 0; i < TILE_N * TILE_N; i++) { start[i] = acc; acc += counts[i] * STRIDE; }
    start[TILE_N * TILE_N] = acc;
    out.kinds[kind] = { rec, start };
  }
  return out;
}

function newLayerStore() {
  const size = LAYER_SIZE, count = { big: LAYER_FILES.big.length, small: LAYER_FILES.small.length };
  const mk = (g) => new Uint8Array(size[g] * size[g] * 4 * count[g]);
  return { aBig: mk('big'), nBig: mk('big'), aSmall: mk('small'), nSmall: mk('small') };
}
function storeLayer(store, job, bytes) {
  const key = (job.part === 'a' ? 'a' : 'n') + (job.group === 'big' ? 'Big' : 'Small');
  const s = LAYER_SIZE[job.group];
  store[key].set(bytes, job.layer * s * s * 4);
}

async function bakeSingle() {
  const t0 = performance.now();
  ensureMacro();
  const { side, segs } = GRID;
  const H = bakeHeights(0, side);
  const t1 = performance.now();
  const { normals, tint } = bakeShade(H, 0, side);
  const [maskA, maskB, shore] = bakeMasks(H, 0, MASK_N);
  const pan = bakePan();
  const F = { H, maskA, maskB, shore };
  const scatter = stitchScatter([{ tz0: 0, part: scatterRows(F, 0, TILE_N) }], scatterStatic(fieldReader(F)));
  const t2 = performance.now();
  const layers = newLayerStore();
  for (const job of layerJobs()) storeLayer(layers, job, await decodeLayer(job.url));
  const t3 = performance.now();
  return assemble({ H, normals, tint, maskA, maskB, shore, pan, layers, scatter,
    stats: { mode: 'single', workers: 0, segs, buildMs: t2 - t0, heightMs: t1 - t0, shadeMs: t2 - t1, layerMs: t3 - t2, totalMs: t3 - t0 } });
}

async function bakePool() {
  const t0 = performance.now();
  const { side, segs } = GRID;
  const pool = [], inflight = [];
  let nextId = 1;
  const pending = new Map();
  const queue = [];
  let failed = null;
  const pump = () => {
    for (let k = 0; k < pool.length && queue.length; k++) {
      while (inflight[k] < POOL.inflight && queue.length) {
        const j = queue.shift();
        inflight[k]++;
        const id = nextId++;
        pending.set(id, { res: j.res, rej: j.rej, k });
        pool[k].postMessage({ id, ...j.msg }, j.transfer || []);
      }
    }
  };
  const run = (msg) => new Promise((res, rej) => { queue.push({ msg, res, rej }); pump(); });
  const toWorker = (k, msg) => new Promise((res, rej) => {
    const id = nextId++;
    inflight[k]++;
    pending.set(id, { res, rej, k });
    pool[k].postMessage({ id, ...msg });
  });
  const done = () => { for (const w of pool) { w.onmessage = null; w.onerror = null; w.terminate(); } pool.length = 0; queue.length = 0; };
  try {
    const macro = macroShared();
    const tMacro = performance.now();
    for (let k = 0; k < POOL.workers; k++) {
      const w = new Worker(new URL('./bake.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => {
        const m = ev.data, p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        inflight[p.k]--;
        if (m.error) p.rej(new Error(m.error)); else p.res(m.out);
        pump();
      };
      w.onerror = (e) => {
        failed = e.message || 'worker error';
        for (const p of pending.values()) p.rej(new Error(failed));
        pending.clear();
      };
      pool.push(w); inflight.push(0);
    }
    await Promise.all(pool.map((_, k) => toWorker(k, { op: 'macro', macro })));
    const tReady = performance.now();

    // layers decode alongside the heights: they share the pool, not the bar
    const store = newLayerStore();
    const layerP = Promise.all(layerJobs().map(async (job) => {
      storeLayer(store, job, await run({ op: 'layer', url: job.url }));
    }));

    const H = new Float32Array(side * side);
    const hJobs = [];
    for (let r = 0; r < side; r += POOL.rowsPerJob) {
      const r1 = Math.min(side, r + POOL.rowsPerJob);
      hJobs.push(run({ op: 'heights', r0: r, r1 }).then((out) => H.set(out, r * side)));
    }
    await Promise.all(hJobs);
    const tH = performance.now();

    await Promise.all(pool.map((_, k) => toWorker(k, { op: 'fields', H })));
    const normals = new Int16Array(side * side * 4), tint = new Uint8Array(side * side * 4);
    const N = MASK_N;
    const maskA = new Uint8Array(N * N * 4), maskB = new Uint8Array(N * N * 4), shore = new Uint8Array(N * N * 4);
    const jobs = [];
    for (let r = 0; r < side; r += POOL.rowsPerJob) {
      const r1 = Math.min(side, r + POOL.rowsPerJob);
      jobs.push(run({ op: 'shade', r0: r, r1 }).then(([n, t]) => { normals.set(n, r * side * 4); tint.set(t, r * side * 4); }));
    }
    for (let r = 0; r < N; r += POOL.maskRowsPerJob) {
      const r1 = Math.min(N, r + POOL.maskRowsPerJob);
      jobs.push(run({ op: 'masks', r0: r, r1 }).then(([a, b, s]) => {
        const o = r * N * 4;
        maskA.set(a, o); maskB.set(b, o); shore.set(s, o);
      }));
    }
    let pan = null;
    jobs.push(run({ op: 'pan' }).then((out) => { pan = out; }));
    await Promise.all(jobs);
    const tBuild = performance.now();
    // the scatter stands on the finished masks
    await Promise.all(pool.map((_, k) => toWorker(k, { op: 'masksIn', maskA, maskB, shore })));
    const rowParts = [], sJobs = [];
    const ROWS = 6;
    for (let tz = 0; tz < TILE_N; tz += ROWS) {
      const tz1 = Math.min(TILE_N, tz + ROWS);
      sJobs.push(run({ op: 'scatterRows', tz0: tz, tz1 }).then((part) => rowParts.push({ tz0: tz, part })));
    }
    let staticPart = null;
    sJobs.push(run({ op: 'scatterStatic' }).then((part) => { staticPart = part; }));
    await Promise.all(sJobs);
    rowParts.sort((a, b) => a.tz0 - b.tz0);
    const scatter = stitchScatter(rowParts, staticPart);
    const tScatter = performance.now();
    await layerP;
    const tLayers = performance.now();
    done();
    return assemble({ H, normals, tint, maskA, maskB, shore, pan, layers: store, scatter,
      stats: { mode: 'pool', workers: POOL.workers, segs, macroMs: tMacro - t0, spawnMs: tReady - tMacro,
        heightMs: tH - tReady, shadeMs: tBuild - tH, buildMs: tBuild - t0, scatterMs: tScatter - tBuild,
        layerWaitMs: tLayers - tScatter, totalMs: tLayers - t0 } });
  } catch (err) {
    done();
    throw err;
  }
}

/** The island, baked. Never rejects for a pool failure: the single-thread path is the fallback. */
export async function bakeIsland() {
  const force = typeof location !== 'undefined' && new URLSearchParams(location.search).get('terrainpool') === '0';
  if (force || typeof Worker === 'undefined') return bakeSingle();
  try {
    return await bakePool();
  } catch (err) {
    console.warn('[terrain] worker pool failed, baking single-thread:', err.message);
    return bakeSingle();
  }
}

export { PAN_N };
export const bakeSingleThread = bakeSingle;
