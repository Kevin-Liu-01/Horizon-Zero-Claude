/**
 * ROUND 5 — lane `engine-gpu` gates (docs/ROUND5-PLAN.md §9 "engine-gpu";
 * report docs/ROUND5-ENGINE-GPU.md; numbers docs/ROUND5-ENGINE.md).
 *
 *   node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --lane engine-gpu
 *
 * `tools/gates.mjs` is frozen for this lane (plan §1.1) and its directory scan
 * merges `gates.round4.*.mjs` only. Until gates-perf's A-gates-autodiscover
 * (W0a) imports every `tools/gates.r5.*.mjs` by pattern, this file goes in
 * through the runner's existing `--extra <file>` flag — the same import and
 * the same GATES merge a lane file gets. Once discovery is live, drop `--extra`
 * (keeping it only logs "duplicate gate id … keeping the first"; nothing runs
 * twice):
 *
 *   node tools/gates.mjs --port 5251 --lane engine-gpu
 *
 * W0a is PROBES ONLY (orchestrator ruling): this file carries
 *   A-terrain-1024-probe-box  (runner) samples the box in node — load average,
 *                             other headless Chromes — and hands the sample to
 *                             the probe, whose clocks (build, nav, GPU) are
 *                             graded only on a quiet box. A page assert cannot see node; the
 *                             runner's `check({ GATES })` can, and it rewrites
 *                             the probe's assert with the sample. Run the two
 *                             together (`--lane engine-gpu`, or `--only
 *                             A-terrain-1024-probe-box,A-terrain-1024-probe`);
 *                             the probe alone reads "box not sampled" and its
 *                             clocks stay PENDING — never a silent PASS.
 *   A-terrain-1024-probe      today's terrain build (single-thread, and on a
 *                             cold worker pool when bit-identical) + the
 *                             frozen navgrid at 1024 / 860 / 720 m; the W1
 *                             size decision. Every clock in it is judged on a
 *                             quiet box only (QUIET); the pool additionally
 *                             needs its own before/after witness. Whether the
 *                             600 ms bar may grade the pool (not in src/) is
 *                             the orchestrator's ruling `pool-terrain-build`
 *                             (RULINGS): unruled, only the single-thread build
 *                             can pass, and the decision reports the size
 *                             under both rulings.
 *   A-rt-ledger-census        the render-target ledger is complete and honest,
 *                             recounted from the GL allocation calls since
 *                             boot (`?rtTally=1`)
 *   A-rt-ledger               the plan's budget bar on that ledger. Wave = the
 *                             orchestrator's ruling `rt-ledger-bar` (RULINGS);
 *                             unruled it is W0a, where the W0a brief lists
 *                             "the render-target ledger measurements" (plan
 *                             §3.1 puts "render targets measured" in the W0b
 *                             exit), and it reads FAIL — the bar is reachable
 *                             only through the W0b tier levers, measured live
 *                             in its detail.
 * W0b — THE GPU TIER DECISION (src/core/engine.js QUALITY_TIERS.high, the
 * shipped default; numbers in docs/ROUND5-ENGINE.md §3):
 *   A-gpu-tier-box            (runner) the box witness for A-gpu-tier
 *   A-gpu-tier                the shipped tier's GPU / fps on the Pans POC
 *                             (?poc=biome, hosted in an iframe: see POC_KIT),
 *                             quiet box only; before/after per lever; docs row
 *   A-rt-ledger               now GRADED (plan §8.3 rt-ledger-bar=W0b)
 *   V-gpu-tier-look           (fix round 1) the vista at Round 4's `high` beside
 *                             the shipped `high`, full frame + far-ground crop:
 *                             what the tier's levers cost the picture, for the
 *                             R29 judge
 *   A22-msaa, V20-aa-crop, A108-ao-periodicity, A109-ao-distance-fade,
 *   V33b-no-ao-lattice        re-staged on the Pans POC; they SHADOW the
 *                             Round-4 rows by id (see SHADOW BY ID: before
 *                             gates-perf's registry is in the tree they run
 *                             as `<id>@r5`)
 *   node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --only A-gpu-tier-box,A-gpu-tier
 *   node tools/gates.mjs --port 5251 --extra tools/gates.r5.engine-gpu.mjs --lane engine-gpu   (W0a probe included: ~10 min)
 * Every row carries `wave`.
 *
 * No gate here names a species, a coordinate or a bone: the vista and the
 * staged fight come from tools/budgets.mjs (gates-perf), the island sites from
 * the probe's bible table.
 */
import { readFileSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import * as BUDGETS_MOD from './budgets.mjs';
import { RT_LEDGER } from './r5-probes/rt-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * THE MEASURED LEDGER lives in the leaf module tools/r5-probes/rt-ledger.mjs
 * (no imports). gates-perf records it in tools/budgets.mjs with
 *   export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';
 * NEVER by re-exporting it from this file: this file imports budgets.mjs, so
 * that would close an import cycle (PERF_SCENARIOS read before initialisation
 * when budgets.mjs loads first, an unsettled top-level await the other way)
 * and gates.mjs would load no gate at all. Re-exported here for callers that
 * already import the lane file.
 */
export { RT_LEDGER };

/* ------------------------------------------------------------------------ */
/* node side                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * docs/ROUND5-ENGINE.md carries the ledger as a table whose rows start with
 * `| \`owner\` |` and whose last cell is the byte count. Parsed here, compared
 * in the page against the live ledger.
 */
function docsLedger() {
  const f = path.join(ROOT, 'docs/ROUND5-ENGINE.md');
  if (!existsSync(f)) return { present: false, rows: {} };
  const text = readFileSync(f, 'utf8');
  const start = text.indexOf('<!-- rt-ledger:begin -->');
  const end = text.indexOf('<!-- rt-ledger:end -->');
  if (start < 0 || end < 0) return { present: true, marked: false, rows: {} };
  const rows = {};
  for (const ln of text.slice(start, end).split('\n')) {
    const m = ln.match(/^\|\s*`([^`]+)`\s*\|.*\|\s*([\d,]+)\s*\|\s*$/);
    if (m) rows[m[1]] = Number(m[2].replace(/,/g, ''));
  }
  return { present: true, marked: true, rows };
}

/**
 * What tools/budgets.mjs records (gates-perf's file), read from the STATIC
 * import above — no top-level await, no second import. A-rt-ledger compares
 * the rows owner by owner against the live ledger, not mere presence.
 */
function budgetsRecord() {
  const rec = BUDGETS_MOD.RT_LEDGER || null;
  if (!rec) return { present: false, rows: {} };
  return { present: true, rows: rec.rows || {}, measured: rec.measured || null };
}

/**
 * ORCHESTRATOR RULINGS this file applies, read from docs/ROUND5-PLAN.md (the
 * orchestrator's file) so a ruling takes effect without anyone editing this
 * lane's code. One HTML comment per ruling, on a line of its own, anywhere in the plan:
 *   <!-- r5-ruling pool-terrain-build=accepted -->   (or =rejected)
 *   <!-- r5-ruling rt-ledger-bar=W0b -->             (or =W0a)
 * Absent = unruled. Unruled `pool-terrain-build`: the 1024 m build term can
 * pass only on the single-thread build of today's code; a pool-only pass is
 * PENDING (ruling) and the probe reports the size under both rulings.
 * Unruled `rt-ledger-bar`: A-rt-ledger is graded at W0a (the orchestrator's
 * W0a brief) and carries `rulingRequested`.
 */
function planRulings() {
  const f = path.join(ROOT, 'docs/ROUND5-PLAN.md');
  const out = { poolTerrainBuild: null, rtLedgerBar: null, source: 'docs/ROUND5-PLAN.md' };
  if (!existsSync(f)) return out;
  const text = readFileSync(f, 'utf8');
  // the marker must stand on a line of its own: a marker quoted inside prose or backticks is not a ruling
  const m1 = text.match(/^[ \t]*<!--\s*r5-ruling\s+pool-terrain-build\s*=\s*(accepted|rejected)\s*-->[ \t]*$/m);
  const m2 = text.match(/^[ \t]*<!--\s*r5-ruling\s+rt-ledger-bar\s*=\s*(W0a|W0b)\s*-->[ \t]*$/m);
  if (m1) out.poolTerrainBuild = m1[1];
  if (m2) out.rtLedgerBar = m2[1];
  return out;
}
export const RULINGS = Object.freeze(planRulings());

/**
 * THE QUIET-BOX RULE (judge findings, fix rounds 1 and 2). Every wall clock
 * the probe grades — the A9 GPU delta, the terrain build, the nav build — is
 * judged only when the 1-minute load average is < 3 and no other headless
 * Chrome is alive (this run's own Chrome, a descendant of this node process,
 * is not counted), sampled in node at most `maxBoxAgeMs` before the page
 * reads it. The page adds its own witnesses:
 *   GPU  null frame before and after < 3 ms, burst instability <= 1.4 on both
 *        arms, >= 8 interleaved pairs, per-pair delta IQR under the bar;
 *   CPU  today's own mesh built 3x before and 3x after every candidate build
 *        on the same page: the two medians within `cpuCalibrationDrift`.
 * Anything else is PENDING, pass or fail — with one exception the harness's
 * own rule allows (a loud box only ever makes a clock SLOWER): a single-thread
 * CPU term stays FAIL on a loud box when every run is over the bar by more
 * than `cpuWorstDrift`, the worst calibration drift measured on this box
 * (today's own 720 m build read 575.7 ms and 785.5 ms on unchanged code in
 * fix round 1: 1.364x). A worker-pool build is never failed on a loud box.
 */
export const QUIET = Object.freeze({ load1: 3, otherHeadlessChromes: 0, nullFrameGpuMs: 3,
  burstInstability: 1.4, minPairs: 8, maxBoxAgeMs: 300000, cpuCalibrationDrift: 1.10, cpuWorstDrift: 1.37 });

export function sampleBox() {
  const [l1, l5, l15] = os.loadavg();
  const rows = [];
  let psError = null;
  try {
    const out = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 32 << 20 });
    for (const ln of out.split('\n')) {
      const m = ln.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (m) rows.push({ pid: +m[1], ppid: +m[2], cmd: m[3] });
    }
  } catch (err) { psError = String(err.message); }
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]));
  const mine = (pid) => {
    for (let p = pid, n = 0; p > 1 && n < 64; p = parent.get(p), n++) if (p === process.pid) return true;
    return false;
  };
  const headless = rows.filter((r) => /Chrom(e|ium)/.test(r.cmd) && /--headless/.test(r.cmd) && !/--type=/.test(r.cmd));
  const others = headless.filter((r) => !mine(r.pid));
  const box = {
    sampledAt: Date.now(), load1: +l1.toFixed(2), load5: +l5.toFixed(2), load15: +l15.toFixed(2),
    cpus: os.cpus().length, otherHeadlessChromes: psError ? null : others.length,
    ownHeadlessChromes: headless.length - others.length, psError,
  };
  box.quiet = !psError && box.load1 < QUIET.load1 && others.length <= QUIET.otherHeadlessChromes;
  return box;
}

/**
 * Staging comes from gates-perf's tools/budgets.mjs, which W0a/W0b re-cast by
 * role (`vista` / `herd` / `staged-fight`). Read it tolerantly so a merge in
 * either order works: the Round-4 `spawn-vista` key or the re-cast `vista`.
 * Missing staging makes the dependent gates PENDING with the reason, never a
 * silent re-point.
 */
const PERF_SCENARIOS = BUDGETS_MOD.PERF_SCENARIOS || {};
/**
 * gates-perf's role/place re-cast (W0a, not yet merged into this tree when
 * W0b started) evaluates its scenarios against two more page preludes,
 * `ROSTER` (tools/gate-roster.mjs: KIND, roleSkip, ROLE_NOTE) and `PLACES`
 * (tools/gate-places.mjs: PLACE, standAt). They are spliced in front of
 * STAGE_PRELUDE when those modules exist, so this file stages correctly
 * before and after that merge. Loaded with a guarded dynamic import: neither
 * module imports this file, so there is no cycle (the W0a lesson).
 */
const optionalModule = async (rel) => {
  const f = path.join(ROOT, 'tools', rel);
  if (!existsSync(f)) return null;
  try { return await import(pathToFileURL(f).href); } catch (err) { return { __loadError: String(err.message) }; }
};
const ROSTER_MOD = await optionalModule('gate-roster.mjs');
const PLACES_MOD = await optionalModule('gate-places.mjs');
const STAGE_PRELUDE = (ROSTER_MOD?.ROSTER || '') + (PLACES_MOD?.PLACES || '') + (BUDGETS_MOD.STAGE_PRELUDE || '');
const VISTA = PERF_SCENARIOS['spawn-vista'] || PERF_SCENARIOS.vista || null;
const FIGHT = PERF_SCENARIOS['staged-fight'] || null;
const STAGING_MISSING = !STAGE_PRELUDE || !VISTA || !FIGHT
  ? `tools/budgets.mjs staging missing (STAGE_PRELUDE ${!!STAGE_PRELUDE}, vista ${!!VISTA}, staged-fight ${!!FIGHT})` : null;
const GUARD = STAGING_MISSING ? `return { pass: null, detail: ${JSON.stringify(STAGING_MISSING)} };` : '';

const DOCS = JSON.stringify(docsLedger());
const BUDGETS_REC = JSON.stringify(budgetsRecord());
const RT_LEDGER_JSON = JSON.stringify(RT_LEDGER);

/* ------------------------------------------------------------------------ */
/* page side: shared preludes                                                */
/* ------------------------------------------------------------------------ */

const FRAMES = `
  const __frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const __frames = async (n) => { for (let i = 0; i < n; i++) await __frame(); };
  const __r2 = (v) => (v == null ? null : +v.toFixed(2));
  /** median GPU ms over a burst (engine.perfSnapshot, EXT_disjoint_timer_query) */
  const __gpuBurst = async (ms) => {
    const e = __CTX__.engine;
    await __frames(6); e.perfReset();
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < ms) { await __frame(); n++; }
    const s = e.perfSnapshot(n);
    return { gpu: s ? s.medianGpuMs : null, gpuFrames: s ? s.gpuFrames : 0, fps: s ? s.fps : null,
      calls: s ? s.medianDrawCalls : null, tris: s ? s.maxTriangles : null, frames: n };
  };
  /** the true median: the mean of the two middle values for an even count */
  const __median = (a) => {
    const s = a.filter((v) => v != null).sort((x, y) => x - y), n = s.length;
    if (!n) return null;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  /** linear-interpolated quantile (R type 7) */
  const __quantile = (a, q) => {
    const s = a.filter((v) => v != null).sort((x, y) => x - y);
    if (!s.length) return null;
    const h = (s.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (s[hi] - s[lo]) * (h - lo);
  };
  /** GPU ms with NOTHING drawn (A9's witness): above ~3 ms another client owns the GPU */
  const __nullFrame = async () => {
    const ctx = __CTX__, e = ctx.engine, r = e.renderer;
    const keep = { dpr: e.basePixelRatio, gtao: e.gtao.enabled, bloom: e.bloom.enabled, smaa: e.smaa.enabled,
      shadows: r.shadowMap.enabled, vis: ctx.scene.visible };
    try {
      e.gtao.enabled = false; e.bloom.enabled = false; e.smaa.enabled = false;
      r.shadowMap.enabled = false; ctx.scene.visible = false;
      e.basePixelRatio = 0.5; e.renderScale = 1; e.resize();
      return __r2((await __gpuBurst(900)).gpu);
    } finally {
      ctx.scene.visible = keep.vis; e.gtao.enabled = keep.gtao; e.bloom.enabled = keep.bloom;
      e.smaa.enabled = keep.smaa; r.shadowMap.enabled = keep.shadows;
      e.basePixelRatio = keep.dpr; e.renderScale = 1; e.resize();
    }
  };
`;

/**
 * Independent texture + geometry census over the live scene (GPU-resident
 * estimate: texel bytes × mips × faces for every uploaded texture a material,
 * a uniform, a skeleton or the scene references; byte length of every
 * buffer attribute, index and instance buffer). Render-target textures are
 * left to the RT ledger. The same arithmetic gates-perf's A-vram-ledger
 * specifies; exported for reuse.
 */
export const VRAM_CENSUS = `
  const __vramCensus = () => {
    const ctx = __CTX__, r = ctx.engine.renderer;
    const texSeen = new Set(), bufSeen = new Set();
    let tex = 0, texCount = 0, geo = 0;
    const bpt = (t) => {
      const f = t.format, ty = t.type;
      if (f === 1026) return ty === 1012 ? 2 : 4;                 // DepthFormat
      if (f === 1027) return ty === 1015 ? 8 : 4;                 // DepthStencilFormat
      if (t.isCompressedTexture) return 0;                        // counted from mip data
      const ch = (f === 1028 || f === 1029 || f === 1021) ? 1 : (f === 1030 || f === 1031) ? 2 : 4;
      const by = (ty === 1016 || ty === 1011 || ty === 1012) ? 2 : (ty === 1015 || ty === 1013 || ty === 1014) ? 4 : 1;
      return ch * by;
    };
    const big = [];
    let curOwner = '';
    const addTex = (t) => {
      if (!t || !t.isTexture || texSeen.has(t) || t.isRenderTargetTexture) return;
      texSeen.add(t);
      if (!r.properties.has(t) || !r.properties.get(t).__webglTexture) return;   // never uploaded
      let bytes = 0;
      if (t.isCompressedTexture && t.mipmaps) { for (const m of t.mipmaps) bytes += m.data ? m.data.byteLength : 0; }
      else {
        const img = Array.isArray(t.image) ? t.image[0] : t.image;
        const w = (img && (img.width || img.videoWidth)) || 0, h = (img && (img.height || img.videoHeight)) || 0;
        const faces = t.isCubeTexture ? 6 : 1, depth = (img && img.depth) || 1;
        const mips = t.generateMipmaps && t.minFilter !== 1003 && t.minFilter !== 1006 ? 4 / 3 : 1;
        bytes = w * h * depth * faces * bpt(t) * mips;
      }
      tex += bytes; texCount++;
      if (bytes >= 1e6) {
        const img = Array.isArray(t.image) ? t.image[0] : t.image;
        const src = (img && (img.currentSrc || img.src)) || '';
        big.push({ mb: +(bytes / 1e6).toFixed(2), name: t.name || (src ? src.split('/').pop().slice(0, 60) : ''), owner: curOwner,
          size: img ? (img.width || 0) + 'x' + (img.height || 0) : '?' });
      }
    };
    const addBuf = (a) => {
      if (!a) return;
      const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
      if (!arr || bufSeen.has(arr)) return;
      bufSeen.add(arr); geo += arr.byteLength;
    };
    const addGeo = (g) => {
      if (!g) return;
      for (const k in g.attributes) addBuf(g.attributes[k]);
      if (g.index) addBuf(g.index);
      for (const k in (g.morphAttributes || {})) for (const a of g.morphAttributes[k]) addBuf(a);
    };
    ctx.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      let top = o; while (top.parent && top.parent !== ctx.scene) top = top.parent;
      curOwner = (top.name || top.type) + (o !== top ? ' > ' + (o.name || o.type) : '');
      for (const m of mats) {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v); }
        if (m.uniforms) for (const k in m.uniforms) {
          const v = m.uniforms[k] && m.uniforms[k].value;
          if (v && v.isTexture) addTex(v);
          else if (Array.isArray(v)) for (const x of v) if (x && x.isTexture) addTex(x);
        }
      }
      if (o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) addTex(o.skeleton.boneTexture);
      if (o.geometry) addGeo(o.geometry);
      if (o.isInstancedMesh) { addBuf(o.instanceMatrix); addBuf(o.instanceColor); }
    });
    for (const k of ['environment', 'background']) { const t = ctx.scene[k]; if (t && t.isTexture) addTex(t); }
    big.sort((a, b) => b.mb - a.mb);
    return { textureBytes: Math.round(tex), textures: texCount, geometryBytes: geo, buffers: bufSeen.size, top: big.slice(0, 14) };
  };
`;

/** Ledger staging: shipped tier, DPR 1.25, DRS off; spawn vista then the staged fight. */
const LEDGER_STAGE = `
  /**
   * The shipped default tier on a DPR-2 display: basePixelRatio = min(2, tier.dprCap) (1.25 at W0b),
   * DRS off; the vista, then the staged fight. A scenario that cannot cast (gates-perf's role re-cast
   * returns { skip }) leaves the stage unstaged and says so: the caller reports PENDING, never PASS.
   */
  const __stageLedger = async () => {
    const ctx = __CTX__, e = ctx.engine;
    e.setDynamicResolution(false);
    e.basePixelRatio = Math.min(2, e.tier.dprCap); e.renderScale = 1; e.resize();
    const unpinA = eval(${JSON.stringify(VISTA)});
    await __frames(60);
    if (typeof unpinA === 'function') unpinA();
    const unpinF = eval(${JSON.stringify(FIGHT)});
    await __frames(90);
    if (typeof unpinF !== 'function') { const sk = unpinF; const f = () => {}; f.skip = (sk && sk.skip) || 'staged-fight did not stage'; return f; }
    return unpinF;
  };
  /**
   * RT bytes RECOUNTED FROM THE GL ALLOCATION CALLS (fix round 3). engine.glTally, installed by
   * \`?rtTally=1\` before the renderer's context existed, recorded every texture level, renderbuffer
   * storage, framebuffer attachment and explicit delete since boot. Ground truth here = every live
   * attachment of every live framebuffer + every live renderbuffer with storage, sized with THIS
   * function's own table of GL internal formats (not the ledger's three-enum arithmetic). Then every
   * GL object is attributed to a ledger row: a row with a target through three's properties (its
   * framebuffers' attachments, colour/depth renderbuffers, textures), a texture-only row through its
   * texture and whatever shares a framebuffer with it. An allocation the ledger omits is either
   * unattributed or makes its row's GL bytes differ from the ledger's: both fail.
   * Convention shared with the ledger and stated in docs: RGB stored as 4 channels, DEPTH_COMPONENT24 = 4 B.
   */
  const __glRecount = (L) => {
    const r = __CTX__.engine.renderer, T = window.__rtTally;
    if (!T) return { installed: false };
    const SIZED = { 0x8058: 4, 0x8C43: 4, 0x8051: 4, 0x8C41: 4, 0x881A: 8, 0x881B: 8, 0x8814: 16, 0x8815: 16,
      0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822F: 4, 0x822E: 4, 0x8230: 8, 0x8C3A: 4, 0x8059: 4, 0x8C3D: 4,
      0x8056: 2, 0x8057: 2, 0x8D62: 2, 0x81A5: 2, 0x81A6: 4, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 8, 0x8D48: 1,
      0x8231: 1, 0x8232: 1, 0x8233: 2, 0x8234: 2, 0x8235: 4, 0x8236: 4, 0x8237: 2, 0x8238: 2, 0x8239: 4,
      0x823A: 4, 0x823B: 8, 0x823C: 8, 0x8D8E: 4, 0x8D7C: 4, 0x8D88: 8, 0x8D76: 8, 0x8D82: 16, 0x8D70: 16,
      0x8F94: 1, 0x8F95: 2, 0x8F97: 4 };
    const CH = { 0x1908: 4, 0x1907: 4, 0x190A: 2, 0x1909: 1, 0x1906: 1, 0x1902: 1, 0x84F9: 1, 0x1903: 1 };
    const TY = { 0x1401: 1, 0x1400: 1, 0x1403: 2, 0x1402: 2, 0x140B: 2, 0x8D61: 2, 0x1406: 4, 0x1405: 4, 0x1404: 4 };
    const PACKED = { 0x8033: 2, 0x8034: 2, 0x8363: 2, 0x84FA: 4, 0x8C3B: 4, 0x8C3E: 4, 0x8368: 4, 0x8DAD: 8 };
    const unknown = new Set();
    const bpp = (ifmt, fmt, type) => {
      if (SIZED[ifmt]) return SIZED[ifmt];
      if (PACKED[type]) return PACKED[type];
      if (CH[ifmt] && TY[type]) return CH[ifmt] * TY[type];
      unknown.add('0x' + (ifmt || 0).toString(16)); return 4;
    };
    const texBytes = (i) => { let b = 0; for (const v of i.lv) if (v) b += v.bytes >= 0 ? v.bytes : v.w * v.h * v.d * bpp(v.ifmt, v.fmt, v.type); return b; };
    const rbBytes = (i) => (i.ifmt ? i.w * i.h * Math.max(1, i.samples) * bpp(i.ifmt, 0, 0) : 0);
    const bytesOf = (i) => (i.kind === 'tex' ? texBytes(i) : rbBytes(i));
    const objs = new Map(), fbOf = new Map();
    let liveFbs = 0;
    for (const fb of T.fb) {
      liveFbs++;
      for (const k in fb.att) {
        const a = fb.att[k];
        if (!a || a.deleted) continue;
        if (!objs.has(a)) objs.set(a, { bytes: bytesOf(a), unattached: false });
        let s = fbOf.get(a); if (!s) fbOf.set(a, (s = new Set())); s.add(fb);
      }
    }
    for (const rb of T.rb) if (!objs.has(rb) && rb.ifmt) objs.set(rb, { bytes: rbBytes(rb), unattached: true });
    const infoOf = (o) => (o ? T.info.get(o) || null : null);
    const each = (v, f) => { if (Array.isArray(v)) { for (const x of v) each(x, f); } else if (v) f(v); };
    const rows = [], claimed = new Set();
    for (const row of L.rows) {
      if (!row.allocated) continue;
      const set = new Set();
      const take = (o) => { const i = infoOf(o); if (i && !i.deleted) set.add(i); };
      const fbAll = (fbObj) => { const i = infoOf(fbObj); if (i && !i.deleted) for (const k in i.att) if (i.att[k] && !i.att[k].deleted) set.add(i.att[k]); };
      if (row.target) {
        const p = r.properties.get(row.target);
        each(p.__webglFramebuffer, fbAll); each(p.__webglMultisampledFramebuffer, fbAll);
        each(p.__webglDepthbuffer, take); each(p.__webglColorRenderbuffer, take); each(p.__webglDepthRenderbuffer, take);
        for (const t of row.target.textures || [row.target.texture]) take(r.properties.get(t)?.__webglTexture);
        if (row.target.depthTexture) take(r.properties.get(row.target.depthTexture)?.__webglTexture);
      } else if (row.texture) {
        const ti = infoOf(r.properties.get(row.texture)?.__webglTexture);
        if (ti && !ti.deleted) { set.add(ti); for (const fb of fbOf.get(ti) || []) for (const k in fb.att) if (fb.att[k] && !fb.att[k].deleted) set.add(fb.att[k]); }
      }
      let gl = 0;
      const parts = [];
      for (const i of set) {
        const b = bytesOf(i); gl += b; claimed.add(i);
        const v = i.kind === 'tex' ? i.lv.find(Boolean) : i;
        parts.push({ kind: i.kind, bytes: b, w: v ? v.w : 0, h: v ? v.h : 0, ifmt: v ? '0x' + (v.ifmt || 0).toString(16) : null,
          samples: i.kind === 'rb' ? i.samples : 0, levels: i.kind === 'tex' ? i.lv.filter(Boolean).length : 0 });
      }
      rows.push({ owner: row.owner, ledger: row.bytes, gl, diff: gl - row.bytes, objects: set.size, parts });
    }
    const unattributed = [];
    let glTotal = 0;
    for (const [i, o] of objs) {
      glTotal += o.bytes;
      if (claimed.has(i)) continue;
      const v = i.kind === 'tex' ? i.lv.find(Boolean) : i;
      unattributed.push({ kind: i.kind, bytes: o.bytes, w: v ? v.w : 0, h: v ? v.h : 0, ifmt: v ? '0x' + (v.ifmt || 0).toString(16) : null,
        samples: i.kind === 'rb' ? i.samples : 0, framebuffers: (fbOf.get(i) || new Set()).size, unattachedRenderbuffer: o.unattached });
    }
    const claimedBytes = rows.reduce((n, x) => n + x.gl, 0);
    return { installed: true, liveFramebuffers: liveFbs, glObjects: objs.size, glBytes: glTotal, claimedBytes,
      unattributed, unattributedBytes: unattributed.reduce((n, x) => n + x.bytes, 0),
      rowMismatches: rows.filter((x) => x.diff !== 0), rows, unknownFormats: [...unknown], orphanCalls: T.orphanCalls };
  };
  /** Collapse the bloom mip chain into one row, as the docs table does. */
  const __byOwner = (L) => {
    const out = {};
    for (const row of L.rows) {
      if (!row.allocated) continue;
      const k = /^post:UnrealBloomPass\\./.test(row.owner) ? 'post:UnrealBloomPass.bloom-chain' : row.owner;
      out[k] = (out[k] || 0) + row.bytes;
    }
    return out;
  };
`;

/* ------------------------------------------------------------------------ */
/* W0b: the Pans POC host (A-gpu-tier, A22, A108, A109, V20, V33b)           */
/* ------------------------------------------------------------------------ */

/**
 * THE PANS POC HOST. Plan §9 stages the W0b block on `?poc=biome` (the Pans
 * proof: tools/r5-poc/poc-biome.js, pipeline's, kept for A-gpu-tier until the
 * W1 Pans replace it), and that flag replaces the game boot, so the runner's
 * `window.__READY__` never comes. The gates therefore boot the normal page,
 * STOP the game's frame loop (one GPU client measured, not two), hide its
 * canvas, and open `/?poc=biome` in a same-origin iframe the size of the
 * viewport. The iframe is a separate window: its own engine.js module, its
 * own WebGL context, its own rAF. Everything below drives `__R5BIOME__`
 * (engine, scene, camera, views, groups) through the public engine API, and
 * every tier row comes from the iframe's own engine.js
 * (`await W.eval("import('/src/core/engine.js')")` is not needed: the outer
 * page imports the same module URL and the rows are plain data).
 *
 * "DPR 2" means basePixelRatio = min(2, tier.dprCap), exactly what a DPR-2
 * display gets (the runner's page is 1600 x 900 at deviceScaleFactor 1), as
 * Round 4's GTAO gates did. Splice inside an async body.
 */
export const POC_KIT = `
  const __EM = await import('/src/core/engine.js');
  const QUALITY_TIERS = __EM.QUALITY_TIERS, ROUND4_HIGH = __EM.ROUND4_HIGH, DEFAULT_TIER = __EM.DEFAULT_TIER;
  const __POCM = await import('/tools/r5-poc/poc-biome.js');
  const pocHeight = __POCM.height;
  const __pocBoot = async (query) => {
    const C = window.__CTX__;
    if (C && C.engine) { C.engine.renderer.setAnimationLoop(null); C.engine.renderer.domElement.style.visibility = 'hidden'; }
    const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
    const f = document.createElement('iframe');
    f.src = '/?poc=biome' + (query ? '&' + query : '');
    f.style.cssText = 'position:fixed;left:0;top:0;width:' + innerWidth + 'px;height:' + innerHeight + 'px;border:0;z-index:2147483640;background:#000';
    document.body.appendChild(f);
    const t0 = performance.now();
    for (;;) {
      const w = f.contentWindow;
      if (w && w.__R5BIOME_READY__ && w.__R5BIOME__) break;
      if (performance.now() - t0 > 90000) throw new Error('the Pans POC (?poc=biome) did not boot within 90 s');
      await new Promise((r) => setTimeout(r, 100));
    }
    return f;
  };
  const __F = await __pocBoot();
  const PW = __F.contentWindow, PB = PW.__R5BIOME__, E = PB.engine, R = E.renderer, gl = R.getContext(), cam = E.camera;
  const pfr = (n) => new Promise((res) => { let k = 0; const t = () => { if (++k >= (n || 1)) res(); else PW.requestAnimationFrame(t); }; PW.requestAnimationFrame(t); });
  const r2 = (v) => (v == null ? null : +(+v).toFixed(2));
  const r3 = (v) => (v == null ? null : +(+v).toFixed(3));
  const median = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
  const quantile = (a, q) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); if (!s.length) return null; const h = (s.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h); return s[lo] + (s[hi] - s[lo]) * (h - lo); };
  /** apply a tier row at "DPR dpr" (min(dpr, row.dprCap)), DRS off */
  const setTierDpr = (row, name, dpr) => {
    E.applyTier(row, name);
    E.setDynamicResolution(false);
    E.basePixelRatio = Math.min(dpr, row.dprCap); E.renderScale = 1; E.resize();
  };
  /** n synchronous renders (cull pass forced), for framebuffer reads in the same task */
  let camFn = null;
  const draw = (n) => { for (let i = 0; i < (n || 5); i++) { if (camFn) camFn(); E._shadowCullClock = 0; E.render(0.05); } };
  const W = () => R.domElement.width, H = () => R.domElement.height;
  const readRect = (x0, yTop, w, h) => {
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(x0, H() - yTop - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8Array(w * h * 4);
    for (let r = 0; r < h; r++) out.set(buf.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4);
    return out;
  };
  const lum = (rgba, i) => (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
  const lumCrop = (cx, cy, S) => {
    const x0 = Math.max(0, Math.min(W() - S, Math.round(cx * W() - S / 2)));
    const y0 = Math.max(0, Math.min(H() - S, Math.round(cy * H() - S / 2)));
    const px = readRect(x0, y0, S, S), L = new Float64Array(S * S);
    for (let i = 0; i < S * S; i++) L[i] = lum(px, i);
    return L;
  };
  const meanLum = (fx0, fy0, fx1, fy1) => {
    const x0 = Math.round(fx0 * W()), y0 = Math.round(fy0 * H());
    const w = Math.round((fx1 - fx0) * W()), h = Math.round((fy1 - fy0) * H());
    const px = readRect(x0, y0, w, h);
    let s = 0;
    for (let i = 0; i < w * h; i++) s += lum(px, i);
    return s / (w * h);
  };
  const hf = (u) => {
    const s = (u & 0x8000) ? -1 : 1, ex = (u >> 10) & 0x1f, f = u & 0x3ff;
    if (ex === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (ex === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, ex - 15) * (1 + f / 1024);
  };
  /** a camera at (x, z), h m over the POC ground, looking at bearing yawDeg (0 = +z, 90 = +x), pitch deg */
  const camAt = (x, z, h, yawDeg, pitchDeg, fov) => {
    const gy = Math.max(pocHeight(x, z), -0.9), yaw = yawDeg * Math.PI / 180, pit = (pitchDeg || 0) * Math.PI / 180;
    camFn = () => {
      cam.fov = fov || 50; cam.updateProjectionMatrix();
      cam.position.set(x, gy + h, z);
      cam.lookAt(x + Math.sin(yaw) * Math.cos(pit) * 100, gy + h + Math.sin(pit) * 100, z + Math.cos(yaw) * Math.cos(pit) * 100);
      cam.updateMatrixWorld(true);
    };
    camFn();
    if (PB.scene.fog) PB.scene.fog.density = 0.0026;
    E.csm && E.csm.updateFrustums && E.csm.updateFrustums();
  };
  const viewNamed = (name) => { camFn = null; PB.view(name); cam.updateMatrixWorld(true); };

  /* --- autocorrelation (Round 4 core-platform-gtao A108, unchanged) ------- */
  const fft1 = (re, im, inv) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  };
  const fft2 = (re, im, N, inv) => {
    const rr = new Float64Array(N), ii = new Float64Array(N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) { rr[x] = re[y * N + x]; ii[x] = im[y * N + x]; }
      fft1(rr, ii, inv);
      for (let x = 0; x < N; x++) { re[y * N + x] = rr[x]; im[y * N + x] = ii[x]; }
    }
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) { rr[y] = re[y * N + x]; ii[y] = im[y * N + x]; }
      fft1(rr, ii, inv);
      for (let y = 0; y < N; y++) { re[y * N + x] = rr[y]; im[y * N + x] = ii[y]; }
    }
  };
  const acorr = (L, S) => {
    const hp = 12;
    const blur = (src) => {
      const tmp = new Float64Array(S * S), dst = new Float64Array(S * S);
      for (let y = 0; y < S; y++) {
        let acc = 0, n = 0;
        for (let x = 0; x <= hp && x < S; x++) { acc += src[y * S + x]; n++; }
        for (let x = 0; x < S; x++) {
          tmp[y * S + x] = acc / n;
          const xo = x - hp, xi = x + hp + 1;
          if (xo >= 0) { acc -= src[y * S + xo]; n--; }
          if (xi < S) { acc += src[y * S + xi]; n++; }
        }
      }
      for (let x = 0; x < S; x++) {
        let acc = 0, n = 0;
        for (let y = 0; y <= hp && y < S; y++) { acc += tmp[y * S + x]; n++; }
        for (let y = 0; y < S; y++) {
          dst[y * S + x] = acc / n;
          const yo = y - hp, yi = y + hp + 1;
          if (yo >= 0) { acc -= tmp[yo * S + x]; n--; }
          if (yi < S) { acc += tmp[yi * S + x]; n++; }
        }
      }
      return dst;
    };
    const lo = blur(blur(L)), N = S * 2;
    const re = new Float64Array(N * N), im = new Float64Array(N * N);
    let v0 = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = L[y * S + x] - lo[y * S + x];
      re[y * N + x] = d; v0 += d * d;
    }
    fft2(re, im, N, false);
    for (let i = 0; i < N * N; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    fft2(re, im, N, true);
    const r0 = re[0] / (S * S);
    const Rr = (dx, dy) => {
      const ix = (dx + N) % N, iy = (dy + N) % N;
      return (re[iy * N + ix] / ((S - Math.abs(dx)) * (S - Math.abs(dy)))) / r0;
    };
    let best = { peak: -1, lag: [0, 0] };
    for (let dy = -32; dy <= 32; dy++) for (let dx = 0; dx <= 32; dx++) {
      const ch = Math.max(Math.abs(dx), Math.abs(dy));
      if (ch < 2 || (dx === 0 && dy < 0)) continue;
      const v = Rr(dx, dy);
      let isMax = v > best.peak;
      for (let oy = -1; oy <= 1 && isMax; oy++) for (let ox = -1; ox <= 1; ox++) {
        if ((ox || oy) && Rr(dx + ox, dy + oy) >= v) { isMax = false; break; }
      }
      if (isMax) best = { peak: v, lag: [dx, dy] };
    }
    return { peak: +best.peak.toFixed(3), lag: best.lag, rms: +Math.sqrt(v0 / (S * S)).toFixed(4) };
  };
  /** contact-sheet helpers: a 1600 x 900 canvas of 400 x 225 tiles, shown over everything at the end */
  const sheetNew = (cols, rows) => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
    const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, 1600, 900);
    const tmp = document.createElement('canvas'), tg = tmp.getContext('2d');
    const TW = 1600 / cols, TH = 900 / rows;
    /** any rectangle of the sheet (x, y, dw, dh in sheet px); put() is the grid case */
    const putRect = (rgba, w, h, x, y, dw, dh, label, nearest) => {
      tmp.width = w; tmp.height = h;
      tg.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), w, h), 0, 0);
      g.imageSmoothingEnabled = !nearest;
      g.drawImage(tmp, 0, 0, w, h, x, y, dw, dh);
      g.imageSmoothingEnabled = true;
      g.fillStyle = '#000'; g.globalAlpha = 0.62; g.fillRect(x, y, 8 + label.length * 7.3, 18);
      g.globalAlpha = 1; g.fillStyle = '#ffe3b0'; g.font = '12px ui-monospace, monospace';
      g.fillText(label, x + 5, y + 13);
    };
    const put = (rgba, w, h, col, row, label, nearest) => putRect(rgba, w, h, col * TW, row * TH, TW, TH, label, nearest);
    /** a red outline on the sheet (where a crop came from) */
    const box = (x, y, w, h) => { g.strokeStyle = '#ff4040'; g.lineWidth = 2; g.strokeRect(x, y, w, h); };
    const show = () => {
      const img = new Image(); img.src = c.toDataURL('image/png');
      img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647';
      document.body.appendChild(img);
      return new Promise((r) => { img.onload = () => r(); setTimeout(r, 2000); });
    };
    return { put, putRect, box, show, TW, TH, g };
  };
`;

/* ------------------------------------------------------------------------ */
/* A-gpu-tier (W0b)                                                          */
/* ------------------------------------------------------------------------ */

/** Plan §4.3 / §9 bars, and the lever chain the plan names, in its order. */
export const GPU_TIER_BAR = Object.freeze({ emptyGpuMs: 7, vistaGpuMs: 13, medianFps: 58, p95FrameMs: 20 });

/**
 * docs/ROUND5-ENGINE.md records the chosen tier between
 * `<!-- gpu-tier:begin -->` and `<!-- gpu-tier:end -->`, including one line
 * `tier-row: {json}` with the levers. A-gpu-tier compares it with the live
 * QUALITY_TIERS[DEFAULT_TIER] (so the doc can never describe a tier that is not
 * the one shipped).
 */
function docsGpuTier() {
  const f = path.join(ROOT, 'docs/ROUND5-ENGINE.md');
  if (!existsSync(f)) return { present: false };
  const text = readFileSync(f, 'utf8');
  const a = text.indexOf('<!-- gpu-tier:begin -->'), b = text.indexOf('<!-- gpu-tier:end -->');
  if (a < 0 || b < 0) return { present: true, marked: false };
  const block = text.slice(a, b);
  const m = block.match(/tier-row:\s*`?(\{[^\n`]*\})`?/);
  let row = null;
  try { row = m ? JSON.parse(m[1]) : null; } catch (err) { row = null; }
  return { present: true, marked: true, row, hasBeforeAfter: /before/i.test(block) && /after/i.test(block) };
}
const DOCS_GPU_TIER = JSON.stringify(docsGpuTier());

/**
 * A-gpu-tier, measured on the Pans POC at the SHIPPED DEFAULT TIER on a DPR-2
 * display (basePixelRatio = min(2, dprCap) = 1.25), 1600 x 900, DRS off:
 *   empty frame   only the sky + the whole post chain (every other POC group
 *                 hidden; the POC's own `gpuStates().emptyFrame` set)
 *   vista         the POC's `vista` view, everything drawn
 * 4 rounds of (vista 2 s, empty 2 s), GPU time by EXT_disjoint_timer_query
 * (engine.perfSnapshot), frame intervals from the POC loop's own
 * engine._recordFrame ring (every frame of the 4 vista bursts pooled: median
 * fps = 1000 / median interval, p95 interval).
 * JUDGED ONLY ON A QUIET BOX (the W0a rule, QUIET): load < 3 and 0 other
 * headless Chromes (sampled in node by A-gpu-tier-box), a null frame (nothing
 * drawn, DPR 0.5) < 3 ms before and after, and the 4 burst medians of each
 * scene within 1.4x. Otherwise PENDING with every number reported.
 * Then, for the record (ungraded), the plan's levers one at a time from
 * Round 4's `high` (DPR 1.5): DPR cap 1.25, + GTAO quarter-res, + SMAA-only,
 * = shipped (+ SMAA RGBA8 + far-cascade caps), 2 rounds each, and the
 * render-target MB of each from engine.renderTargetLedger().
 * The docs clause is graded on any box.
 */
function gpuTierAssert(box) {
  return `(async () => {
      ${POC_KIT}
      const BOX = ${JSON.stringify(box)};
      const QUIET = ${JSON.stringify(QUIET)};
      const BAR = ${JSON.stringify(GPU_TIER_BAR)};
      const DOCS = ${DOCS_GPU_TIER};
      const out = { bars: BAR, box: BOX };
      const why = [];
      if (!BOX) why.push('box not sampled (A-gpu-tier-box samples load and headless Chromes in node and hands them here; run both: --lane engine-gpu)');
      else {
        if (Date.now() - BOX.sampledAt > QUIET.maxBoxAgeMs) why.push('box sample ' + Math.round((Date.now() - BOX.sampledAt) / 1000) + ' s old');
        if (!(BOX.load1 < QUIET.load1)) why.push('load average ' + BOX.load1 + ' (needs < ' + QUIET.load1 + ')');
        if (BOX.otherHeadlessChromes == null || BOX.otherHeadlessChromes > QUIET.otherHeadlessChromes) why.push(BOX.otherHeadlessChromes + ' other headless Chrome(s) (needs 0)');
      }
      E.enableGpuTimer(true);
      const P = E._perf;
      /** a burst of the POC's own loop; returns GPU median + every frame interval it recorded */
      const burst = async (ms) => {
        await pfr(6); E.perfReset();
        const t0 = performance.now(); let n = 0;
        while (performance.now() - t0 < ms) { await pfr(1); n++; }
        const s = E.perfSnapshot(n);
        const cnt = Math.min(n, P.n), cap = P.ms.length, iv = [];
        for (let k = 0; k < cnt; k++) iv.push(P.ms[(P.i - 1 - k + cap * 2) % cap]);
        return { gpu: s ? s.medianGpuMs : null, gpuFrames: s ? s.gpuFrames : 0, frames: n, intervals: iv,
          calls: s ? s.medianDrawCalls : null, tris: s ? s.maxTriangles : null };
      };
      const groups = PB.groups;
      const showOnly = (keep) => { for (const k in groups) groups[k].visible = keep === null ? k !== 'kitbash' : keep.includes(k); };
      const nullFrame = async () => {
        const keep = { pr: E.basePixelRatio, g: E.gtao.enabled, b: E.bloom.enabled, s: E.smaa.enabled, sh: R.shadowMap.enabled };
        try {
          E.gtao.enabled = false; E.bloom.enabled = false; E.smaa.enabled = false; R.shadowMap.enabled = false; PB.scene.visible = false;
          E.basePixelRatio = 0.5; E.resize();
          return r2((await burst(900)).gpu);
        } finally {
          PB.scene.visible = true; E.gtao.enabled = keep.g; E.bloom.enabled = keep.b; E.smaa.enabled = keep.s; R.shadowMap.enabled = keep.sh;
          E.basePixelRatio = keep.pr; E.resize();
        }
      };
      const SHIPPED = QUALITY_TIERS[DEFAULT_TIER];
      const levers = (row) => ({ dprCap: row.dprCap, msaa: row.msaa, gtao: row.gtao, gtaoScale: row.gtaoScale, smaa: row.smaa,
        smaaHalfFloat: row.smaaHalfFloat, csmMapCaps: row.csmMapCaps, postFold: row.postFold, csmFarCadence: row.csmFarCadence,
        maxAnisotropy: row.maxAnisotropy, maxAnisotropyData: row.maxAnisotropyData });
      const measure = async (rounds, ms) => {
        const v = [], m = [];
        for (let k = 0; k < rounds; k++) {
          showOnly(null); v.push(await burst(ms));
          showOnly(['sky']); m.push(await burst(ms));
        }
        showOnly(null);
        const iv = [].concat(...v.map((b) => b.intervals));
        const inst = (a) => { const s = a.filter((x) => x != null && x > 0); return s.length === a.length && s.length > 1 ? r3(Math.max(...s) / Math.min(...s)) : null; };
        return { vistaGpu: v.map((b) => r2(b.gpu)), emptyGpu: m.map((b) => r2(b.gpu)), vistaGpuMedian: r2(median(v.map((b) => b.gpu))),
          emptyGpuMedian: r2(median(m.map((b) => b.gpu))), vistaInstability: inst(v.map((b) => b.gpu)), emptyInstability: inst(m.map((b) => b.gpu)),
          medianFrameMs: r2(median(iv)), medianFps: iv.length ? r2(1000 / median(iv)) : null, p95FrameMs: r2(quantile(iv, 0.95)),
          frames: iv.length, drawCalls: { vista: v[0].calls, empty: m[0].calls }, vistaTris: v[0].tris };
      };

      // ---- the shipped default tier ----
      viewNamed('vista');
      setTierDpr(SHIPPED, DEFAULT_TIER, 2);
      await pfr(30);
      const L = E.renderTargetLedger();
      out.shipped = { tier: DEFAULT_TIER, levers: levers(SHIPPED), pixelRatio: r3(R.getPixelRatio()), drawingBuffer: [W(), H()],
        msaaSamples: E.sceneTarget.samples, gtaoBuffer: [E.gtao.width, E.gtao.height], smaaType: E.smaa.edgesRT.texture.type,
        csmMapSizes: E.csmMapSizes, renderTargetMB: L.mb };
      const nullBefore = await nullFrame();
      const ship = await measure(4, 2000);
      const nullAfter = await nullFrame();
      Object.assign(out.shipped, ship, { nullFrameGpuMs: [nullBefore, nullAfter] });
      if (!(nullBefore < QUIET.nullFrameGpuMs) || !(nullAfter < QUIET.nullFrameGpuMs)) why.push('null-frame GPU ' + nullBefore + ' / ' + nullAfter + ' ms (needs < ' + QUIET.nullFrameGpuMs + ')');
      if (!(ship.vistaInstability <= QUIET.burstInstability) || !(ship.emptyInstability <= QUIET.burstInstability)) why.push('burst instability vista ' + ship.vistaInstability + ' / empty ' + ship.emptyInstability + ' (needs <= ' + QUIET.burstInstability + ')');
      const terms = { emptyGpuMs: ship.emptyGpuMedian != null && ship.emptyGpuMedian <= BAR.emptyGpuMs,
        vistaGpuMs: ship.vistaGpuMedian != null && ship.vistaGpuMedian <= BAR.vistaGpuMs,
        medianFps: ship.medianFps != null && ship.medianFps >= BAR.medianFps,
        p95FrameMs: ship.p95FrameMs != null && ship.p95FrameMs <= BAR.p95FrameMs };
      const shippedOk = out.shipped.pixelRatio === 1.25 && E.quality === DEFAULT_TIER;
      if (!shippedOk) why.push('not measured at the shipped tier on a DPR-2 display (quality ' + E.quality + ', pixel ratio ' + out.shipped.pixelRatio + ')');

      // ---- before -> after, the plan's levers in its order (ungraded record) ----
      const L3 = Object.assign({}, ROUND4_HIGH, { dprCap: 1.25, gtaoScale: 0.25, msaa: 0 });
      const L4 = Object.assign({}, L3, { smaaHalfFloat: false, csmMapCaps: SHIPPED.csmMapCaps });
      const L5 = Object.assign({}, L4, { postFold: true });
      const L6 = Object.assign({}, L5, { csmFarCadence: SHIPPED.csmFarCadence });
      const chain = [
        ['Round-4 high (DPR 1.5, MSAA x4, GTAO 1/2, SMAA HalfFloat, CSM 3 x 2048, in-place GTAO + bloom blends, every cascade every frame, anisotropy as authored)', ROUND4_HIGH],
        ['lever 1: DPR cap 1.25', Object.assign({}, ROUND4_HIGH, { dprCap: 1.25 })],
        ['lever 2: + GTAO quarter-res', Object.assign({}, ROUND4_HIGH, { dprCap: 1.25, gtaoScale: 0.25 })],
        ['lever 3: + SMAA-only (MSAA 0: the scene target is read directly, no resolve copy; grade output RGBA8)', L3],
        ['lever 4: + SMAA targets RGBA8, far cascades capped at 1024 (W0b fix round 0 = its shipped row)', L4],
        ['lever 5: + GTAO multiply and bloom composite folded into the grade pass', L5],
        ['lever 6: + far cascades rendered on alternate frames', L6],
        ['lever 7: + anisotropic filtering capped, colour (sRGB) textures ' + SHIPPED.maxAnisotropy + 'x / data textures (normal, rough/AO) ' + SHIPPED.maxAnisotropyData + 'x = shipped ' + DEFAULT_TIER, SHIPPED],
      ];
      // the alternatives the decision was taken against (fix round 1 shipped 2x / 2x), unless one is the shipped row
      for (const [c, d, why] of [[2, 2, 'the fix-round-1 row'], [2, 4, 'colour at 2x'], [4, 4, 'every texture at 4x']]) {
        if (SHIPPED.maxAnisotropy === c && SHIPPED.maxAnisotropyData === d) continue;
        chain.push(['NOT shipped: shipped row with anisotropy ' + c + 'x colour / ' + d + 'x data (' + why + ')', Object.assign({}, SHIPPED, { maxAnisotropy: c, maxAnisotropyData: d })]);
      }
      out.leverChain = [];
      for (const [label, row] of chain) {
        setTierDpr(row, 'lever', 2);
        await pfr(20);
        const m = await measure(2, 1500);
        out.leverChain.push({ label, pixelRatio: r3(R.getPixelRatio()), renderTargetMB: E.renderTargetLedger().mb,
          vistaGpuMedian: m.vistaGpuMedian, emptyGpuMedian: m.emptyGpuMedian, medianFps: m.medianFps, p95FrameMs: m.p95FrameMs,
          vistaGpu: m.vistaGpu, emptyGpu: m.emptyGpu });
      }
      setTierDpr(SHIPPED, DEFAULT_TIER, 2);
      await pfr(10);

      // ---- the docs clause (graded on any box) ----
      const live = levers(SHIPPED);
      const docsOk = !!(DOCS.marked && DOCS.row && DOCS.hasBeforeAfter
        && Object.keys(live).every((k) => JSON.stringify(DOCS.row[k]) === JSON.stringify(live[k])));
      out.docs = { recorded: DOCS, live, ok: docsOk };
      out.terms = terms;
      out.judged = why.length === 0;
      out.pendingBecause = why;
      const clockPass = Object.values(terms).every(Boolean);
      const pass = !docsOk ? false : !out.judged ? null : clockPass;
      if (!out.judged) out.unjudgedReads = clockPass ? 'every clock under its bar' : 'red on ' + Object.keys(terms).filter((k) => !terms[k]).join(', ');
      return { pass, detail: out };
    })()`;
}

/* ------------------------------------------------------------------------ */
/* A22-msaa (R25), V20, A108, A109, V33b — re-staged on the Pans POC (W0b)   */
/* ------------------------------------------------------------------------ */

/**
 * SHADOW BY ID (plan §3.3). These five rows replace the Round-4 rows of the
 * same id while this lane is active. gates-perf's registry (W0a, merged into
 * main after this tree was cut) does the replacement; this tree's Round-4
 * runner instead keeps the FIRST of two equal ids, i.e. the Round-4 row. So
 * until `tools/gates.r5.carried.mjs` (the registry's sign) exists in the tree,
 * the rows run under `<id>@r5`, which the Round-4 runner cannot shadow; after
 * the merge they take their real ids and shadow the carried rows. Same body
 * either way.
 */
const PRE_MERGE = !existsSync(path.join(ROOT, 'tools/gates.r5.carried.mjs'));
export const SHADOWED_IDS = Object.freeze(['A22-msaa', 'A108-ao-periodicity', 'A109-ao-distance-fade', 'V20-aa-crop', 'V33b-no-ao-lattice']);
export const SHADOW_ID_SUFFIX = PRE_MERGE ? '@r5' : '';
const sid = (id) => (SHADOWED_IDS.includes(id) ? id + SHADOW_ID_SUFFIX : id);

/**
 * The AA frame (V20 and A22's R25 clause): basalt columns on the Pans shelf
 * against the sky. `crop` is in CSS px of the 1600 x 900 frame and is read at
 * the device ratio in force.
 */
const AA_FRAME = Object.freeze({ cam: [16, 22, 2.2, 53, 14, 50], crop: [860, 62, 200, 112] });

/**
 * Edge anti-aliasing, measured: on every pixel whose 3x3 neighbourhood spans
 * more than 0.25 of luminance (a silhouette), t = (L - min) / (max - min);
 * the pixel is INTERMEDIATE when 0.2 <= t <= 0.8. With no AA a hard
 * silhouette leaves two plateaus (t near 0 or 1); SMAA / MSAA put ramp values
 * on the boundary. Returns the intermediate fraction over edge pixels.
 */
const AA_METRIC = `
  const aaMetric = (px, w, h) => {
    const Lm = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) Lm[i] = lum(px, i);
    let edges = 0, inter = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let mn = 1, mx = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = Lm[(y + dy) * w + x + dx]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const c = mx - mn;
      if (c <= 0.25) continue;
      edges++;
      const t = (Lm[y * w + x] - mn) / c;
      if (t >= 0.2 && t <= 0.8) inter++;
    }
    return { edges, intermediate: inter, fraction: edges ? +(inter / edges).toFixed(4) : null };
  };
  const aaStage = () => camAt(${AA_FRAME.cam.join(', ')});
  const aaCrop = () => {
    const pr = R.getPixelRatio(), c = ${JSON.stringify(AA_FRAME.crop)};
    const x0 = Math.round(c[0] * pr), y0 = Math.round(c[1] * pr), w = Math.round(c[2] * pr), h = Math.round(c[3] * pr);
    draw(4);
    return { px: readRect(x0, y0, w, h), w, h };
  };
`;

/**
 * A22-msaa under R25 (A-gpu-tier picked SMAA-only). Mechanical: the scene
 * target is composer.renderTarget1; at the shipped tier its sample count is the
 * tier's; SMAA is present and enabled. Then R25's "V20-aa-crop passes" is
 * backed by a MEASURED clause on V20's own crop: SMAA must put ramp values on
 * the silhouettes (intermediate fraction >= AA_BAR.minFraction and >=
 * AA_BAR.minGainOverOff x the same frame with SMAA off). Round 4's MSAA x4 +
 * SMAA on the same crop is reported for scale. The V20 verdict itself is the
 * judge's (R29).
 */
export const AA_BAR = Object.freeze({ minFraction: 0.2, minGainOverOff: 1.5 });
const A22_ASSERT = `(async () => {
  ${POC_KIT}
  ${AA_METRIC}
  const SHIP = QUALITY_TIERS[DEFAULT_TIER], BAR = ${JSON.stringify(AA_BAR)};
  setTierDpr(SHIP, DEFAULT_TIER, 2);
  aaStage();
  const aaP = E.composer.passes.find((p) => /SMAA|TAA/.test(p.constructor.name)) || null;
  const mech = { quality: E.quality, defaultTier: DEFAULT_TIER, samples: E.sceneTarget.samples, tierMsaa: SHIP.msaa,
    sceneTargetIsRenderTarget1: E.composer.renderTarget1 === E.sceneTarget,
    aaPass: aaP ? aaP.constructor.name : null,
    smaaEnabled: !!E.smaa.enabled, smaaInChain: E.composer.passes.includes(E.smaa), pixelRatio: r3(R.getPixelRatio()) };
  const msaaPath = SHIP.msaa >= 4;
  const mechOk = mech.sceneTargetIsRenderTarget1 && mech.smaaEnabled && mech.smaaInChain && mech.quality === DEFAULT_TIER
    && (msaaPath ? mech.samples >= 4 : mech.samples === 0);
  const on = aaCrop(); const mOn = aaMetric(on.px, on.w, on.h);
  E.smaa.enabled = false; const off = aaCrop(); const mOff = aaMetric(off.px, off.w, off.h); E.smaa.enabled = true;
  setTierDpr(ROUND4_HIGH, 'round4-high', 2); aaStage();
  const r4 = aaCrop(); const mR4 = aaMetric(r4.px, r4.w, r4.h);
  setTierDpr(SHIP, DEFAULT_TIER, 2);
  const gain = mOff.fraction ? +(mOn.fraction / mOff.fraction).toFixed(3) : null;
  const measured = msaaPath ? null : { smaaOn: mOn, smaaOff: mOff, round4MsaaX4PlusSmaa: mR4, gainOverOff: gain,
    ok: mOn.edges >= 200 && mOn.fraction >= BAR.minFraction && gain != null && gain >= BAR.minGainOverOff };
  const pass = mechOk && (msaaPath || measured.ok);
  return { pass, detail: { path: msaaPath ? 'MSAA x' + mech.samples + ' + SMAA' : 'R25: SMAA-only (V20-aa-crop graded by the R29 judge)',
    mechanical: Object.assign(mech, { ok: mechOk }), measuredAA: measured, bar: BAR, crop: ${JSON.stringify(AA_FRAME)} } };
})()`;

/**
 * V20 on the Pans POC: the shipped tier's 4x nearest crop of basalt-column
 * silhouettes against the sky, with the same crop with NO anti-aliasing (what
 * stair-steps look like) and with Round 4's MSAA x4 + SMAA for scale.
 * A visual setup must return within the runner's 60 s, and the POC boot can
 * take most of that on a busy box: the sheet is built in the background and
 * the runner's settle waits for it (the PNG says "incomplete" otherwise).
 */
const V20_SETUP = `(async () => { const __work = (async () => {
  ${POC_KIT}
  const SHIP = QUALITY_TIERS[DEFAULT_TIER];
  const sh = sheetNew(2, 2);
  const c = ${JSON.stringify(AA_FRAME.crop)};
  const grab = () => { const pr = R.getPixelRatio(); draw(4);
    return { px: readRect(Math.round(c[0] * pr), Math.round(c[1] * pr), Math.round(c[2] * pr), Math.round(c[3] * pr)), w: Math.round(c[2] * pr), h: Math.round(c[3] * pr) }; };
  setTierDpr(SHIP, DEFAULT_TIER, 2); camAt(${AA_FRAME.cam.join(', ')});
  let g = grab(); sh.put(g.px, g.w, g.h, 0, 0, 'SHIPPED ' + DEFAULT_TIER + ': SMAA-only, DPR ' + R.getPixelRatio() + ', 4x nearest', true);
  E.smaa.enabled = false; g = grab(); sh.put(g.px, g.w, g.h, 1, 0, 'same frame, NO AA (stair-steps), 4x nearest', true); E.smaa.enabled = true;
  setTierDpr(ROUND4_HIGH, 'r4', 2); camAt(${AA_FRAME.cam.join(', ')});
  g = grab(); sh.put(g.px, g.w, g.h, 0, 1, 'Round-4 high: MSAA x4 + SMAA, DPR ' + R.getPixelRatio() + ', 4x nearest', true);
  setTierDpr(SHIP, DEFAULT_TIER, 1); camAt(${AA_FRAME.cam.join(', ')}); draw(4);
  const full = readRect(0, 0, W(), H());
  sh.put(full, W(), H(), 1, 1, 'where: crop box ' + c.join(','), false);
  await sh.show();
  // outline the crop on the overview tile
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;z-index:2147483647;border:2px solid #ff4040;left:' + (800 + c[0] / 2) + 'px;top:' + (450 + c[1] / 2) + 'px;width:' + c[2] / 2 + 'px;height:' + c[3] / 2 + 'px';
  document.body.appendChild(ov);
  window.__V20_DONE__ = true;
})(); window.__V20_WORK__ = __work; await Promise.race([__work, new Promise((r) => setTimeout(r, 52000))]); })()`;

/**
 * A108 on the Pans POC. Same instrument and rule as Round 4's A108 (the
 * lattice it guards is screen-locked periodicity from GTAO's centre-depth
 * fetch): normalised 2-D luminance autocorrelation of 256 x 256 device-px
 * crops, high-passed, strongest strict local maximum at lags 2..32 px. A crop
 * is MEASURABLE when its GTAO-off control peaks below BAR in that
 * configuration; GTAO on must then stay below BAR. FAR crops (the defect
 * region) must be measurable everywhere. A near/mid crop whose control peaks
 * is content-limited: GTAO may add at most 0.03 there, and more than one such
 * crop in a configuration fails it as unmeasured. Every tier with GTAO on, at
 * DPR 1 and 2 (= min(2, dprCap)); the AO buffer must follow the tier's scale.
 * Crops chosen by a survey of 135 positions x 4 frames x 4 configurations
 * (docs/ROUND5-ENGINE.md §3.6): the far crops are the NE mesas and the haze
 * band (>= 150 m), the mid crops the open pan and the shelf top, with no
 * grass in them (grass blades darkened by real contact AO read as vertical
 * structure at ultra@2, content not lattice; the survey records it).
 */
const A108_FRAMES = [
  { name: 'mesas E from the vista spot', cam: [-82, 0, 2.6, 80, 2, 46], crops: { far147m: [0.5, 0.5], far128m: [0.4, 0.55], mid87m: [0.5, 0.6], mid47m: [0.5, 0.65], mid32m: [0.8, 0.6] }, far: ['far147m', 'far128m'] },
  { name: 'the pan from 14 m', cam: [-70, -40, 14, 50, -14, 40], crops: { far129m: [0.4, 0.25], far108m: [0.5, 0.35], mid87m: [0.5, 0.4], mid62m: [0.4, 0.5], mid46m: [0.1, 0.6], mid41m: [0.8, 0.65] }, far: ['far129m', 'far108m'] },
  { name: 'the shelf from 6 m', cam: [-30, -20, 6, 60, -6, 46], crops: { mid68m: [0.6, 0.5], near23m: [0.5, 0.75] }, far: [] },
];
/**
 * Witness crops for A108's sensitivity self-test (survey 2, docs/ROUND5-ENGINE.md §3.6). They hold grass,
 * which is why they are a witness and not a graded crop (Round 4 excluded grass from the graded crops).
 * Crop 1 is the one that sees: at the shipped tier, DPR 1, with the engine's seeded denoise noise
 * (GTAO_NOISE_SEED) the stock three centre sample reads 0.239 at lag 5,-29 against the shipped shader's
 * 0.102 and GTAO-off 0.114, on every boot (fix round 4). Whether the stock lattice survives the Poisson
 * denoise depends on the denoise's noise texture (fix round 4's survey: blind for 7 of 30 Math.random draws
 * and 5 of 40 seeds, re-installed bytes reproduce each verdict exactly), which is why the engine seeds that
 * texture and A108 asserts the seed. Crop 2 has never separated on this content (stock 0.127-0.130,
 * shipped 0.124-0.127 in fix rounds 2-4); it stays as a reported row.
 */
const A108_WITNESS = [
  { name: 'sand + grass below the shelf, 2 m up', cam: [50, 18, 2, 330, 3, 46], crop: [0.2, 0.8] },
  { name: 'near dune grass from the vista spot', cam: [-82, 0, 2.6, 80, 2, 46], crop: [0.6, 0.8] },
];
const A108_ASSERT = `(async () => {
  ${POC_KIT}
  const FRAMES = ${JSON.stringify(A108_FRAMES)};
  const BAR = 0.15, S = 256, SLACK = 0.03;
  const configs = [], fails = [];
  let worst = { peak: -1 };
  for (const tierName of Object.keys(QUALITY_TIERS)) {
    const row = QUALITY_TIERS[tierName];
    if (!row.gtao) { configs.push(tierName + ': gtao off in this tier (not measured)'); continue; }
    for (const dpr of [1, 2]) {
      setTierDpr(row, tierName, dpr);
      const tag = tierName + '@' + r2(R.getPixelRatio());
      const wantW = Math.max(2, Math.round(W() * E.tier.gtaoScale));
      if (E.gtao.width !== wantW) fails.push(tag + ': AO buffer ' + E.gtao.width + ' px wide, tier wants ' + wantW);
      const cfg = { cfg: tag, ao: E.gtao.width + 'x' + E.gtao.height };
      let limited = 0;
      for (const fr of FRAMES) {
        camAt(...fr.cam);
        const got = {};
        for (const on of [false, true]) {
          E.gtao.enabled = on; draw(5);
          const Ls = {};
          for (const k in fr.crops) Ls[k] = lumCrop(fr.crops[k][0], fr.crops[k][1], S);
          for (const k in Ls) (got[k] = got[k] || {})[on ? 'on' : 'off'] = acorr(Ls[k], S);
        }
        E.gtao.enabled = E.tier.gtao;
        for (const k in got) {
          const g = got[k], isFar = fr.far.includes(k);
          cfg[k] = g.on.peak + '@' + g.on.lag.join(',') + ' (off ' + g.off.peak + ')';
          if (g.off.peak >= BAR) {
            limited++; cfg[k] += ' CONTENT-LIMITED';
            if (isFar) fails.push(tag + ' ' + k + ': CONTROL peaks ' + g.off.peak + ' on a far crop: the defect region is unmeasurable');
            if (g.on.peak > g.off.peak + SLACK) fails.push(tag + ' ' + k + ': GTAO adds periodicity on a content-limited crop, ' + g.off.peak + ' -> ' + g.on.peak);
            continue;
          }
          if (g.on.peak >= BAR) fails.push(tag + ' ' + k + ': periodic peak ' + g.on.peak + ' at lag ' + g.on.lag.join(',') + ' (control ' + g.off.peak + ')');
          if (g.on.peak > worst.peak) worst = { peak: g.on.peak, lag: g.on.lag, where: tag + ' ' + k, control: g.off.peak };
        }
      }
      if (limited > 1) fails.push(tag + ': ' + limited + ' crops content-limited: this configuration was not measured');
      configs.push(cfg);
    }
  }
  // ---- SENSITIVITY WITNESS (negative control): can this instrument see the Round-4 defect on THIS content? ----
  // At the shipped tier, DPR 1, the stock three r169 centre sample (depth NEAREST at vUv, position rebuilt at
  // vUv: the Round-4 lattice) is swapped in on the witness crops: it must raise a peak >= BAR there while the
  // shipped shader stays under it. If the stock sample raises nothing, the crops above prove nothing and the
  // gate fails as blind.
  const W_ = ${JSON.stringify(A108_WITNESS)};
  const mtl = E.gtao.gtaoMaterial, PATCHED = mtl.fragmentShader;
  const STOCK = PATCHED.replace('float depth = texelFetch(tDepth, centerTexel, 0).DEPTH_SWIZZLING;', 'float depth = getDepth(vUv.xy);')
    .replace('vec3 viewPos = getViewPosition(centerUv, depth);', 'vec3 viewPos = getViewPosition(vUv, depth);')
    .replace('vec3 viewNormal = getViewNormal(centerUv);', 'vec3 viewNormal = getViewNormal(vUv);');
  const stockEdits = ['getDepth(vUv.xy)', 'getViewPosition(vUv, depth)', 'getViewNormal(vUv)'].filter((t) => STOCK.includes(t)).length;
  setTierDpr(QUALITY_TIERS[DEFAULT_TIER], DEFAULT_TIER, 1);
  const witness = { crops: W_, stockEditsInstalled: stockEdits, rows: [] };
  try {
    for (const w of W_) {
      camAt(...w.cam);
      const peakWith = (fs, on) => { mtl.fragmentShader = fs; mtl.needsUpdate = true; E.gtao.enabled = on; draw(5); return acorr(lumCrop(w.crop[0], w.crop[1], S), S); };
      const off = peakWith(PATCHED, false), ship = peakWith(PATCHED, true), stock = peakWith(STOCK, true);
      witness.rows.push({ name: w.name, off: off.peak, shipped: ship.peak + '@' + ship.lag.join(','), stock: stock.peak + '@' + stock.lag.join(','),
        stockSeesDefect: off.peak < BAR && stock.peak >= BAR, shippedClean: ship.peak < BAR });
    }
  } finally { mtl.fragmentShader = PATCHED; mtl.needsUpdate = true; E.gtao.enabled = E.tier.gtao; draw(1); }
  witness.instrumentSees = stockEdits === 3 && witness.rows.some((r) => r.stockSeesDefect);
  if (!witness.instrumentSees) fails.push('sensitivity witness: the stock (Round-4 defect) centre sample raised no peak >= ' + BAR + ' on the witness crops: the instrument is blind on this content');
  for (const r of witness.rows) if (r.stockSeesDefect && !r.shippedClean) fails.push('witness ' + r.name + ': shipped shader peaks too (' + r.shipped + ')');
  setTierDpr(QUALITY_TIERS[DEFAULT_TIER], DEFAULT_TIER, 2);
  if (E.gtaoPatched !== true) fails.push('engine.gtaoPatched is ' + E.gtaoPatched + ': the depth-consistent GTAO shader is not installed');
  // ---- DETERMINISM (W0b fix round 4): the denoise noise is the engine's seeded texture, not three r169's ----
  // Math.random one (which made every boot denoise differently and this witness see the defect on some boots
  // only). The installed texture must be the one the denoise samples, carry GTAO_NOISE_SEED, and hash equal to
  // a fresh build from that seed; the hash is reported so runs on different boots can be compared.
  const fnv = (u8) => { let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const nz = E.gtao.pdNoiseTexture, ref = __EM.makeGtaoDenoiseNoise ? __EM.makeGtaoDenoiseNoise(__EM.GTAO_NOISE_SEED) : null;
  const noise = { seed: E.gtaoNoiseSeed, shippedSeed: __EM.GTAO_NOISE_SEED, sampled: E.gtao.pdMaterial.uniforms.tNoise.value === nz,
    hash: nz && nz.image && nz.image.data ? fnv(nz.image.data) : null, refHash: ref ? fnv(ref.image.data) : null };
  if (ref) ref.dispose();
  if (noise.seed == null || noise.seed !== noise.shippedSeed || !noise.sampled || !noise.hash || noise.hash !== noise.refHash) {
    fails.push('denoise noise is not the seeded texture (seed ' + noise.seed + ' vs ' + noise.shippedSeed + ', sampled ' + noise.sampled + ', hash ' + noise.hash + ' vs ' + noise.refHash + '): gate frames are not deterministic per boot');
  }
  return { pass: fails.length === 0, detail: { bar: BAR, worstMeasured: worst, fails: fails.slice(0, 10), sensitivityWitness: witness, denoiseNoise: noise, configs, frames: FRAMES } };
})()`;

/**
 * A109 on the Pans POC: AO against view distance, read from the AO target
 * itself (the GTAO shader writes the view distance into alpha for this read;
 * the denoise reads rgb only), binned; occlusion = mean(1 - ao) of the raw
 * term. Pass: occlusion past 150 m <= 10 % of its 4-6 m value, the 4-6 m value
 * >= 0.05 (contact AO still there), >= 500 texels in both bins; and the far
 * mesa band's luminance with GTAO on within 3 % of GTAO off. At every tier
 * with GTAO on, DPR 1 (Round 4 measured at DPR 1).
 */
const A109_FRAMES = Object.freeze({ near: [25, 22, 2.0, 60, -10, 55], far: [-82, 0, 2.6, 45, 3, 46], farBand: [0.12, 0.22, 0.88, 0.42] });
const A109_ASSERT = `(async () => {
  ${POC_KIT}
  const F = ${JSON.stringify(A109_FRAMES)};
  const m = E.gtao.gtaoMaterial;
  const BINS = { at5m: [4, 6], at50m: [45, 55], at200m: [150, 250], beyond150m: [150, 1e9] };
  const tiers = [], fails = [];
  for (const tierName of Object.keys(QUALITY_TIERS)) {
    const trow = QUALITY_TIERS[tierName];
    if (!trow.gtao) { tiers.push({ tier: tierName, note: 'gtao off in this tier' }); continue; }
    setTierDpr(trow, tierName, 1);
    const row = { tier: tierName, ao: E.gtao.width + 'x' + E.gtao.height };
    // AO against view distance, binned, read off the AO target (alpha = view distance for this read):
    // the near bins from a contact-rich frame (rocks and column feet at 2-6 m), the far bins from the
    // mesa frame (the Pans POC has no single frame with both; Round 4's camp frame had)
    const readBins = (cam) => {
      camAt(...cam);
      E.gtao.enabled = true;
      m.defines.FRAGMENT_OUTPUT = 'vec4(vec3(ao), -viewPos.z)';
      m.needsUpdate = true;
      let a;
      try {
        draw(4);
        const rt = E.gtao.gtaoRenderTarget;
        a = new Uint16Array(rt.width * rt.height * 4);
        R.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, a);
      } finally { delete m.defines.FRAGMENT_OUTPUT; m.needsUpdate = true; }
      const acc = {};
      for (const k in BINS) acc[k] = { n: 0, occ: 0 };
      for (let i = 0; i < a.length / 4; i++) {
        const d = hf(a[i * 4 + 3]);
        if (!(d > 2)) continue;
        const occ = 1 - hf(a[i * 4]);
        for (const k in BINS) if (d >= BINS[k][0] && d < BINS[k][1]) { acc[k].n++; acc[k].occ += occ; }
      }
      const o = {};
      for (const k in BINS) o[k] = { n: acc[k].n, occ: +(acc[k].occ / Math.max(1, acc[k].n)).toFixed(4) };
      return o;
    };
    const nb = readBins(F.near), fb = readBins(F.far);
    row.at5m = nb.at5m; row.at50m = fb.at50m; row.at200m = fb.at200m; row.beyond150m = fb.beyond150m;
    row.nearFrameAt50m = nb.at50m;
    const o5 = row.at5m.occ, oFar = row.beyond150m.occ;
    row.farOverNear = +(oFar / Math.max(1e-6, o5)).toFixed(4);
    if (row.at5m.n < 500) fails.push(tierName + ': only ' + row.at5m.n + ' AO texels at 4-6 m');
    if (row.beyond150m.n < 500) fails.push(tierName + ': only ' + row.beyond150m.n + ' AO texels past 150 m');
    if (o5 < 0.05) fails.push(tierName + ': near-field AO is ' + o5 + ' at 4-6 m (contact AO must stay visible)');
    if (oFar > 0.10 * o5) fails.push(tierName + ': AO past 150 m is ' + row.farOverNear + ' of its 5 m value (bar 0.10)');
    camAt(...F.far);
    const band = [];
    for (const on of [false, true]) { E.gtao.enabled = on; draw(5); band.push(meanLum(F.farBand[0], F.farBand[1], F.farBand[2], F.farBand[3])); }
    E.gtao.enabled = E.tier.gtao;
    row.farLumOff = +band[0].toFixed(4); row.farLumOn = +band[1].toFixed(4); row.farRatio = +(band[1] / band[0]).toFixed(4);
    if (Math.abs(row.farRatio - 1) > 0.03) fails.push(tierName + ': far mesa band luminance with GTAO is ' + row.farRatio + ' of GTAO-off (bar +-3 %)');
    tiers.push(row);
  }
  setTierDpr(QUALITY_TIERS[DEFAULT_TIER], DEFAULT_TIER, 2);
  return { pass: fails.length === 0, detail: { fails, tiers, frames: F } };
})()`;

/**
 * V33b on the Pans POC: a 4 x 4 contact sheet of 400 x 225 tiles.
 *   row 0  shipped tier (`high`), GTAO on: the vista spot at bearings N / E / S / W
 *   row 1  ultra, GTAO on: the same four
 *   row 2  1:1 device-pixel crops of the far NE mesas: high on | high OFF | ultra on | ultra OFF
 *   row 3  the 2 m contact close-up: high on | high OFF | ultra on | ultra OFF
 * Built in the background (visual setups get 60 s and the POC boot can take most of it).
 */
const V33B_FRAMES = Object.freeze({ spot: [-82, 0, 2.6], pitch: 2, fov: 50, mesa: [-40, -30, 4, 70, 0, 46], mesaCrop: [0.5, 0.46], close: [25, 22, 2.0, 60, -22, 55], closeCrop: [0.62, 0.40] });
const V33B_SETUP = `(async () => { const __work = (async () => {
  ${POC_KIT}
  const F = ${JSON.stringify(V33B_FRAMES)};
  const sh = sheetNew(4, 4);
  const full = () => { draw(4); return readRect(0, 0, W(), H()); };
  const crop = () => { draw(4); return readRect(Math.round(F.mesaCrop[0] * W() - 200), Math.round(F.mesaCrop[1] * H() - 112), 400, 225); };
  const YAWS = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']];
  [DEFAULT_TIER, 'ultra'].forEach((tierName, r) => {
    setTierDpr(QUALITY_TIERS[tierName], tierName, 1);
    E.gtao.enabled = true;
    YAWS.forEach(([yaw, nm], c) => { camAt(F.spot[0], F.spot[1], F.spot[2], yaw, F.pitch, F.fov); sh.put(full(), W(), H(), c, r, tierName + ' gtao on  bearing ' + nm + ' (ao ' + E.gtao.width + 'x' + E.gtao.height + ')'); });
  });
  /** what GTAO adds: 255 - 8 x (luminance OFF - luminance ON), white = no AO, dark = AO darkening */
  const darkening = (on, off) => {
    const d = new Uint8Array(400 * 225 * 4);
    for (let j = 0; j < 400 * 225; j++) { const v = Math.max(0, Math.min(255, Math.round(255 - (lum(off, j) - lum(on, j)) * 255 * 8))); d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = v; d[j * 4 + 3] = 255; }
    return d;
  };
  [DEFAULT_TIER, 'ultra'].forEach((tierName, t) => {
    setTierDpr(QUALITY_TIERS[tierName], tierName, 1);
    camAt(...F.mesa);
    E.gtao.enabled = true; sh.put(crop(), 400, 225, t * 2, 2, tierName + ' on   1:1 far shelf wall across the pan', true);
    E.gtao.enabled = false; sh.put(crop(), 400, 225, t * 2 + 1, 2, tierName + ' OFF  1:1 far shelf wall', true);
    camAt(...F.close);
    const cc = () => { draw(4); return readRect(Math.round(F.closeCrop[0] * W() - 200), Math.round(F.closeCrop[1] * H() - 112), 400, 225); };
    E.gtao.enabled = true; const on = cc();
    E.gtao.enabled = false; const off = cc();
    E.gtao.enabled = E.tier.gtao;
    if (t === 0) {
      sh.put(on, 400, 225, 0, 3, tierName + ' on   2 m up, 1:1 boulder foot + grass', true);
      sh.put(off, 400, 225, 1, 3, tierName + ' OFF  same 1:1 crop', true);
    }
    sh.put(darkening(on, off), 400, 225, 2 + t, 3, tierName + ' AO darkening x8 (white = none)', true);
  });
  setTierDpr(QUALITY_TIERS[DEFAULT_TIER], DEFAULT_TIER, 2);
  await sh.show();
  window.__V33B_DONE__ = true;
})(); window.__V33B_WORK__ = __work; await Promise.race([__work, new Promise((r) => setTimeout(r, 52000))]); })()`;

/* ------------------------------------------------------------------------ */
/* A-terrain-1024-probe                                                      */
/* ------------------------------------------------------------------------ */

/**
 * V-gpu-tier-look (W0b fix round 1; layout fix round 2): what the shipped tier
 * costs the picture. The A-gpu-tier levers are measured in milliseconds; this
 * films what they do to the Pans POC vista, full frame and the far ground
 * (where the anisotropic-filtering cap acts), so the R29 judge grades the
 * trade with their own eyes. Four configurations, same static camera, every
 * pass of each chain:
 *   1  Round 4's `high` (DPR 1.5, anisotropy as authored, 8x)
 *   2  the shipped levers with anisotropy as authored (8x)
 *   3  NOT SHIPPED: the shipped levers with the alternative anisotropy row
 *      (fix round 1's 2x on every texture, or 4x if 2x / 2x is what ships;
 *      A-gpu-tier's lever record measures it)
 *   4  the shipped `high` (fix round 2: colour textures 1x, data textures 4x)
 * Top band: the four full frames at 16:9 (400 x 225), the crop box outlined
 * in red. Below: the four crops of the far ground at their native aspect,
 * nearest-neighbour, 800 x 240 each (x1.07 at DPR 1.5, x1.28 at 1.25), in a
 * 2 x 2 grid with the shipped crop bottom-right. The crop is the same CSS box
 * read at each configuration's DPR.
 */
export const LOOK_CROP = Object.freeze([540, 445, 500, 150]);
const V_LOOK_SETUP = `(async () => { const __work = (async () => {
  ${POC_KIT}
  const SHIP = QUALITY_TIERS[DEFAULT_TIER];
  const sh = sheetNew(4, 4);
  const c = ${JSON.stringify(LOOK_CROP)};
  const CROP_AT = [[0, 236], [800, 236], [0, 486], [800, 486]];
  const shoot = (row, name, k, short) => {
    setTierDpr(row, name, 2); viewNamed('vista'); draw(6);
    const pr = R.getPixelRatio();
    const an = row.maxAnisotropy || row.maxAnisotropyData ? 'aniso colour ' + (row.maxAnisotropy || 'max') + 'x / data ' + (row.maxAnisotropyData === undefined ? row.maxAnisotropy : row.maxAnisotropyData || 'max') + 'x' : 'aniso 8x (as authored)';
    sh.putRect(readRect(0, 0, W(), H()), W(), H(), k * 400, 0, 400, 225, (k + 1) + ' ' + name, false);
    sh.box(k * 400 + c[0] / 4, c[1] / 4, c[2] / 4, c[3] / 4);
    const w = Math.round(c[2] * pr), h = Math.round(c[3] * pr);
    sh.putRect(readRect(Math.round(c[0] * pr), Math.round(c[1] * pr), w, h), w, h, CROP_AT[k][0], CROP_AT[k][1], 800, 240,
      (k + 1) + ' ' + short + ' | DPR ' + pr + ', ' + an + ' | far ground, nearest x' + (800 / w).toFixed(2), true);
  };
  // the alternative the decision was taken against: fix round 1's 2x / 2x, or 4x / 4x if that is what ships
  const ALT = SHIP.maxAnisotropy === 2 && SHIP.maxAnisotropyData === 2 ? [4, 4] : [2, 2];
  const capTxt = (c, d) => 'colour ' + c + 'x / data ' + d + 'x';
  shoot(ROUND4_HIGH, 'Round-4 high', 0, 'Round-4 high');
  shoot(Object.assign({}, SHIP, { maxAnisotropy: null, maxAnisotropyData: null }), 'shipped levers, aniso as authored', 1, 'shipped levers');
  shoot(Object.assign({}, SHIP, { maxAnisotropy: ALT[0], maxAnisotropyData: ALT[1] }), 'NOT SHIPPED: shipped levers, ' + capTxt(ALT[0], ALT[1]), 2, 'NOT SHIPPED');
  shoot(SHIP, 'SHIPPED ' + DEFAULT_TIER + ' (' + capTxt(SHIP.maxAnisotropy, SHIP.maxAnisotropyData) + ')', 3, 'SHIPPED ' + DEFAULT_TIER);
  setTierDpr(SHIP, DEFAULT_TIER, 2); viewNamed('vista');
  const g = sh.g;
  g.fillStyle = '#ffe3b0'; g.font = '13px ui-monospace, monospace';
  [ 'top: full frames, red box = the crop.  below: the far ground in the box, nearest-neighbour, native aspect',
    '1 Round-4 high: DPR 1.5, MSAA x4 + SMAA, GTAO 1/2, anisotropic filtering as authored (8x)',
    '2 shipped levers (DPR 1.25, SMAA only, GTAO 1/4 folded, bloom folded, far cascades alternate frames), anisotropy 8x',
    '3 NOT SHIPPED: as 2 with anisotropy ' + capTxt(ALT[0], ALT[1]) + ' (the alternative; see the A-gpu-tier lever record)',
    '4 SHIPPED high: as 2 with anisotropy ' + capTxt(SHIP.maxAnisotropy, SHIP.maxAnisotropyData) + '  (colour = sRGB albedo; data = normal + rough/AO maps)' ].forEach((t, i) => g.fillText(t, 12, 752 + i * 22));
  await sh.show();
  window.__VLOOK_DONE__ = true;
})(); await Promise.race([__work, new Promise((r) => setTimeout(r, 52000))]); })()`;

/**
 * The probe's assert, with the node-side box sample baked in (null = not
 * sampled; the GPU term is then PENDING).
 *
 * What is graded (fix round 3):
 *   build    TODAY'S terrain build — every pass of `_buildMesh` (heights,
 *            filtered field, `_bakeVertexColors`, rim-widened normals,
 *            `_buildMasks`, the three detail bakes) at the candidate's
 *            MESH_SEGS over 1.3 x its size, on today's own height recipe —
 *            measured two ways, 3 runs each, interleaved S P S P S P:
 *              serial  today's constructor itself (`P.realBuild`);
 *              pool    the same passes on a 4-worker pool spawned COLD for
 *                      each build and terminated after it (`P.parallelBuild`),
 *                      counted only when `P.compareBuilds` finds its output
 *                      bit-identical to the constructor's at that size.
 *            WHICH ONE THE BAR GRADES is the orchestrator's ruling
 *            `pool-terrain-build` (the pool is not in src/, so grading it
 *            binds world-ground to ship it): accepted -> the pool; rejected
 *            -> the single thread; unruled -> the single thread can pass, a
 *            pool-only pass is PENDING (ruling), both red is red, and the
 *            decision is computed under both rulings (`byRuling`). If the
 *            span's per-sample height cost comes out below today's own, the
 *            shortfall x vertices is added back on either path.
 *   vertex   the same mesh's vertex buffers (today's layout).
 *   gpu      A9 GPU ms, live 720 m mesh vs the real 1024 m mesh at the pinned
 *            vista, >= 8 ABBA-interleaved pairs, median of the per-pair deltas.
 *   nav      the frozen nav.js at R = PLAY_RADIUS + navSpan, getHeight off the
 *            baked grid (the binding W1 condition), today's colliders; 3 runs.
 * Every one of those clocks is judged ONLY on a quiet box (QUIET). The CPU
 * clocks additionally need today's own mesh, built single-thread 3x before
 * and 3x after the candidates, within 10 %; a pool clock also needs the POOL
 * WITNESS — today's mesh on a cold pool 3x before and 3x after, within 10 %
 * (4 free cores throughout, not a lucky window). A straddle of the bar is
 * PENDING. A loud box keeps only a single-thread FAIL whose every run clears
 * the bar x the worst drift measured on this box (1.37).
 * Decision: the first size of 1024 / 860 / 720 whose terms all pass; no size
 * is ever written from an unjudged term.
 */
function probeAssert(box) {
  return `(async () => {
      ${GUARD}
      ${FRAMES}
      ${STAGE_PRELUDE}
      const BOX = ${JSON.stringify(box)};
      const QUIET = ${JSON.stringify(QUIET)};
      const ctx = __CTX__, e = ctx.engine, T = ctx.terrain;
      const P = await import('/tools/r5-probes/terrain1024.js');
      const BAR = { buildMs: 600, vertexMB: 24, gpuDeltaMs: 1.5, navMs: 150 };
      const out = { probe: P.PROBE, bars: BAR, quietRules: QUIET, box: BOX };
      const r1 = (v) => (v == null ? null : +v.toFixed(1));
      const r3 = (v) => (v == null ? null : +v.toFixed(3));
      const SIZES = P.SIZES.map((s) => Object.assign({}, s, { span: s.worldSize * P.PROBE.spanFactor }));

      // ---- 0. the CPU-clock witness: the box sample from node, fresh ----
      const boxWhy = [];
      if (!BOX) boxWhy.push('box not sampled (A-terrain-1024-probe-box samples load and headless Chromes in node and hands them here)');
      else {
        const age = Date.now() - BOX.sampledAt;
        if (age > QUIET.maxBoxAgeMs) boxWhy.push('box sample ' + Math.round(age / 1000) + ' s old (needs <= ' + QUIET.maxBoxAgeMs / 1000 + ' s)');
        if (!(BOX.load1 < QUIET.load1)) boxWhy.push('load average ' + BOX.load1 + ' (needs < ' + QUIET.load1 + ')');
        if (BOX.otherHeadlessChromes == null || BOX.otherHeadlessChromes > QUIET.otherHeadlessChromes) boxWhy.push((BOX.otherHeadlessChromes == null ? 'unknown' : BOX.otherHeadlessChromes) + ' other headless Chrome(s) (needs 0)');
      }

      // ---- 1. the terrain build: today's constructor single-thread, and the same build on a worker pool ----
      const TL = await P.loadTerrainAt();
      out.buildSource = TL.source;
      // warm-up, never graded, 3 of each: JIT tiering + the module's path/stealth grids (single thread), the HTTP and
      // code caches behind the workers' imports (every timed pool is still spawned cold). With ONE warm-up both
      // fix-round-3 loud runs read the witnesses' BEFORE builds slower than their AFTER builds (serial 632 / 596 / 600
      // then 567; pool 555 / 515 / 480 then 360-506); on a loud box warm-up and load cannot be told apart, so each path
      // then keeps warming until two consecutive builds agree within the witness tolerance (at most 6 more), and the
      // warm-up is recorded: the brackets must measure the box, not the warm-up.
      const warm = { serial: [], pool: [] };
      for (let k = 0; k < 3; k++) {
        const sw = P.realBuild(TL, { span: P.TODAY.span, segs: P.TODAY.meshSegs }); warm.serial.push(r1(sw.ms.buildMesh)); sw.dispose();
        const pw = await P.parallelBuild(TL, { span: P.TODAY.span, segs: P.TODAY.meshSegs }); warm.pool.push(r1(pw.ms.total)); pw.dispose();
      }
      const steady = (a) => a.length >= 2 && Math.max(a[a.length - 1], a[a.length - 2]) / Math.min(a[a.length - 1], a[a.length - 2]) <= QUIET.cpuCalibrationDrift;
      for (let k = 0; k < 6 && !steady(warm.serial); k++) { const wb = P.realBuild(TL, { span: P.TODAY.span, segs: P.TODAY.meshSegs }); warm.serial.push(r1(wb.ms.buildMesh)); wb.dispose(); }
      for (let k = 0; k < 6 && !steady(warm.pool); k++) { const wb = await P.parallelBuild(TL, { span: P.TODAY.span, segs: P.TODAY.meshSegs }); warm.pool.push(r1(wb.ms.total)); wb.dispose(); }
      out.warmUp = { serialMs: warm.serial, poolMs: warm.pool, serialSteady: steady(warm.serial), poolSteady: steady(warm.pool) };
      const KEYS = ['buildMesh', 'heights', 'smooth', 'vertexColors', 'normalsAndGeometry', 'masks', 'detail', 'constructor', 'cliffs', 'farRanges'];
      // every timed build (either path) starts from a collected heap (window.gc: the runner's --expose-gc), so one
      // build's garbage is never billed to the next; per size the two paths are interleaved S P S P S P
      const settle = () => { if (typeof window.gc === 'function') window.gc(); };
      out.heapSettledBeforeEachBuild = typeof window.gc === 'function';
      const serialOnce = (span, segs) => { settle(); return P.realBuild(TL, { span, segs }); };
      const poolOnce = async (span, segs) => { settle(); return P.parallelBuild(TL, { span, segs }); };
      const serialSummary = (runs, last) => {
        const ms = {};
        for (const key of KEYS) ms[key] = r1(__median(runs.map((r) => r.ms[key])));
        return Object.assign(last, { ms, buildMeshRuns: runs.map((r) => r.ms.buildMesh),
          perSampleUs: r3(__median(runs.map((r) => r.perSampleUs))) });
      };
      const shapeOf = (b) => ({ vertices: b.vertices, span: b.span, segs: b.segs, nodeSpacing: b.nodeSpacing, bytes: b.bytes });
      const serialAt = (span, segs) => {
        const runs = []; let last = null;
        for (let k = 0; k < 3; k++) { const b = serialOnce(span, segs); runs.push({ ms: b.ms, perSampleUs: b.perSampleUs }); last = shapeOf(b); b.dispose(); }
        return serialSummary(runs, last);
      };
      const PKEYS = ['geometryArrays', 'heights', 'smooth', 'colorsNormals', 'bakesWait', 'total', 'afterTerminate'];
      // the pool witness (fix round 3): a COLD pool build of today's own mesh, 3x before and 3x after the
      // candidates, so a quiet-box pool verdict needs the pool itself to have run steadily (4 free cores)
      const poolAt = async (span, segs) => {
        const runs = [];
        for (let k = 0; k < 3; k++) { const b = await poolOnce(span, segs); runs.push(b.ms.total); b.dispose(); }
        return runs;
      };
      const calPoolBefore = await poolAt(P.TODAY.span, P.TODAY.meshSegs);
      const calBefore = serialAt(P.TODAY.span, P.TODAY.meshSegs);
      const per = {};
      let real1024 = null;
      for (const s of SIZES) {
        const sRuns = [], pRuns = [];
        let sKept = null, pKept = null, last = null;
        for (let k = 0; k < 3; k++) {
          const sb = serialOnce(s.span, s.meshSegs);
          sRuns.push({ ms: sb.ms, perSampleUs: sb.perSampleUs }); last = shapeOf(sb);
          if (k === 2) sKept = sb; else sb.dispose();
          const pb = await poolOnce(s.span, s.meshSegs);
          pRuns.push({ ms: pb.ms, busy: pb.workerBusyMs, jobs: pb.jobs, workers: pb.workers });
          if (k === 2) pKept = pb; else pb.dispose();
        }
        const b = serialSummary(sRuns, last);
        const pms = {};
        for (const key of PKEYS) pms[key] = r1(__median(pRuns.map((r) => r.ms[key])));
        const eq = P.compareBuilds(sKept, pKept);
        pKept.dispose();
        if (s.worldSize === P.PROBE.worldSize) real1024 = sKept; else sKept.dispose();
        b.parallel = { runs: pRuns.map((r) => r.ms.total), ms: pms, workers: pRuns[0].workers, jobs: pRuns[0].jobs,
          workerBusyMs: r1(__median(pRuns.map((r) => r.busy))), equivalent: eq.equal, differing: eq.differing,
          comparedBuffers: Object.keys(eq.buffers).length, comparedWords: Object.values(eq.buffers).reduce((n, x) => n + (typeof x.length === 'number' ? x.length : 0), 0) };
        per[s.worldSize] = { size: s, build: b };
      }
      const calAfter = serialAt(P.TODAY.span, P.TODAY.meshSegs);
      const calPoolAfter = await poolAt(P.TODAY.span, P.TODAY.meshSegs);

      // the CPU calibration bracket: today's own mesh before and after every candidate build, same page
      const medB = __median(calBefore.buildMeshRuns), medA = __median(calAfter.buildMeshRuns);
      const cal = { beforeRuns: calBefore.buildMeshRuns, afterRuns: calAfter.buildMeshRuns, medianBefore: r1(medB), medianAfter: r1(medA),
        drift: r3(Math.max(medB, medA) / Math.min(medB, medA)), maxDrift: QUIET.cpuCalibrationDrift };
      cal.stable = cal.drift <= QUIET.cpuCalibrationDrift;
      const pmB = __median(calPoolBefore), pmA = __median(calPoolAfter);
      const calPool = { beforeRuns: calPoolBefore.map(r1), afterRuns: calPoolAfter.map(r1), medianBefore: r1(pmB), medianAfter: r1(pmA),
        drift: r3(Math.max(pmB, pmA) / Math.min(pmB, pmA)), maxDrift: QUIET.cpuCalibrationDrift,
        speedupOverSerialAtToday: r3(((medB + medA) / 2) / ((pmB + pmA) / 2)) };
      calPool.stable = calPool.drift <= QUIET.cpuCalibrationDrift;
      const cpuWhy = boxWhy.slice();
      if (!cal.stable) cpuWhy.push('calibration build drifted ' + cal.drift + 'x between before (' + cal.medianBefore + ' ms) and after (' + cal.medianAfter + ' ms) (needs <= ' + QUIET.cpuCalibrationDrift + ')');
      const poolWhy = cpuWhy.slice();
      if (!calPool.stable) poolWhy.push('pool witness drifted ' + calPool.drift + 'x between before (' + calPool.medianBefore + ' ms) and after (' + calPool.medianAfter + ' ms) (needs <= ' + QUIET.cpuCalibrationDrift + ')');
      const cpuJudged = cpuWhy.length === 0, poolJudged = poolWhy.length === 0;
      // a loud box only ever makes a wall clock slower: a single-thread FAIL is kept on a loud box only when every
      // run is over the bar by more than the worst calibration drift seen on this box; a pool's FAIL never is
      const busyFailFactor = Math.max(QUIET.cpuWorstDrift, cal.drift);
      const clockTerm = (runs, bar, path) => {
        const over = runs.filter((v) => v > bar).length;
        const judged = path === 'pool' ? poolJudged : cpuJudged, why = path === 'pool' ? poolWhy : cpuWhy;
        if (judged) {
          if (over === runs.length) return { term: false, judged: true };
          if (over === 0) return { term: true, judged: true };
          return { term: null, judged: false, pendingBecause: ['the ' + runs.length + ' runs straddle the bar (' + runs.join(' / ') + ' ms)'] };
        }
        if (path === 'serial' && runs.every((v) => v > bar * busyFailFactor)) {
          return { term: false, judged: false, failSurvivesDrift: true, pendingBecause: why,
            note: 'every run > ' + bar + ' x ' + r3(busyFailFactor) + ' (worst calibration drift) = ' + r1(bar * busyFailFactor) + ' ms: red on any box' };
        }
        return { term: null, judged: false, pendingBecause: why,
          wouldBe: over === runs.length ? 'over the bar' : over === 0 ? 'under the bar' : 'straddling the bar' };
      };

      // THE POOL RULING (judge finding, fix round 2): the pool path is not in src/, so grading it binds world-ground
      // to ship it. Which build object the 600 ms bar grades is the orchestrator's call (plan marker
      // <!-- r5-ruling pool-terrain-build=accepted|rejected -->). Unruled: the build term passes only on today's
      // single-thread build; a pool-only pass is PENDING (ruling); both red is red.
      const POOL_RULING = ${JSON.stringify(RULINGS.poolTerrainBuild)};
      out.poolRuling = POOL_RULING || 'unruled';
      const today = calBefore;
      for (const s of SIZES) {
        const b = per[s.worldSize].build;
        // "a recipe at least as costly as today's per sample": add back any per-sample shortfall (in full, on either path)
        const shortUs = Math.max(0, today.perSampleUs - b.perSampleUs);
        b.perSampleFloorAddMs = r1(shortUs * b.vertices / 1000);
        // the single-thread build of today's code: its own verdict
        b.serialRuns = b.buildMeshRuns.map((v) => r1(v + b.perSampleFloorAddMs));
        const cs = clockTerm(b.serialRuns, BAR.buildMs, 'serial');
        b.serialTerm = cs.term; b.serialJudged = cs.judged; b.serialPendingBecause = cs.pendingBecause || null;
        if (cs.failSurvivesDrift) b.serialFailSurvivesDrift = cs.note;
        if (cs.wouldBe) b.serialUnjudgedReads = cs.wouldBe;
        // the pool build: its own verdict, only when bit-identical to the constructor's output
        b.poolRuns = b.parallel.runs.map((v) => r1(v + b.perSampleFloorAddMs));
        const cp = b.parallel.equivalent ? clockTerm(b.poolRuns, BAR.buildMs, 'pool')
          : { term: null, judged: false, pendingBecause: ['pool output NOT bit-identical (' + b.parallel.differing.join(', ') + '): never graded'] };
        b.poolTerm = b.parallel.equivalent ? cp.term : null; b.poolJudged = cp.judged; b.poolPendingBecause = cp.pendingBecause || null;
        if (cp.wouldBe) b.poolUnjudgedReads = cp.wouldBe;
        // the build term under each ruling, and the one this run applies
        b.termIfAccepted = b.parallel.equivalent ? b.poolTerm : b.serialTerm;
        b.termIfRejected = b.serialTerm;
        const RULING_NOTE = 'grading the pool build needs the orchestrator ruling pool-terrain-build (plan marker <!-- r5-ruling pool-terrain-build=accepted|rejected -->)';
        let term, path, why = null;
        if (POOL_RULING === 'accepted') { term = b.termIfAccepted; path = b.parallel.equivalent ? 'pool' : 'serial'; }
        else if (POOL_RULING === 'rejected') { term = b.serialTerm; path = 'serial'; }
        else if (b.serialTerm === true) { term = true; path = 'serial'; }
        else if (b.serialTerm === false && b.termIfAccepted === false) { term = false; path = 'serial+pool'; }
        else if (b.serialTerm === false) { term = null; path = 'pool (unruled)';
          why = (b.termIfAccepted === true ? ['single-thread build red; the pool build passes'] : (cp.pendingBecause || [])).concat([RULING_NOTE]); }
        else { term = null; path = 'serial';
          why = (cs.pendingBecause || []).concat(b.termIfAccepted === true ? ['the pool build passes; ' + RULING_NOTE] : []); }
        b.gradedPath = path;
        b.gradedRuns = path.startsWith('pool') ? b.poolRuns : b.serialRuns;
        b.gradedMs = r1(__median(b.gradedRuns));
        b.term = term;
        b.judged = path.startsWith('pool') ? cp.judged : path === 'serial+pool' ? cs.judged && cp.judged : cs.judged;
        b.pendingBecause = term === null ? (why || (path.startsWith('pool') ? cp.pendingBecause : cs.pendingBecause) || null) : null;
        if (cs.failSurvivesDrift && path === 'serial') b.failSurvivesDrift = cs.note;
        b.fixedMs = r1(b.ms.masks + b.ms.detail);
        b.perVertexUs = r3(b.gradedMs * 1000 / b.vertices);
        b.serialPerVertexUs = r3(__median(b.serialRuns) * 1000 / b.vertices);
        b.allowedPerVertexUsAllIn = r3(BAR.buildMs * 1000 / b.vertices);
        b.allowedPerVertexUsNetOfFixed = r3((BAR.buildMs - b.fixedMs) * 1000 / b.vertices);
        b.speedupNeededSingleThread = r3(__median(b.serialRuns) / BAR.buildMs);
      }
      today.perVertexUsAllIn = r3(__median(today.buildMeshRuns) * 1000 / today.vertices);
      today.fixedMs = r1(today.ms.masks + today.ms.detail);
      today.perVertexUsNetOfFixed = r3((__median(today.buildMeshRuns) - today.fixedMs) * 1000 / today.vertices);
      out.todayBuild = today;
      out.cpuClock = { judged: cpuJudged, pendingBecause: cpuWhy, calibration: cal, busyFailFactor: r3(busyFailFactor),
        poolJudged, poolPendingBecause: poolWhy, poolWitness: calPool };

      // the first-round lean model, at today's mesh on today's recipe: how much of the real build it misses (ungraded)
      {
        const lean = []; for (let k = 0; k < 2; k++) { const b = P.buildTerrain1024({ heightFn: (x, z) => T.getHeight(x, z), worldSize: P.TODAY.worldSize * 1.35 / P.PROBE.spanFactor, segs: P.TODAY.meshSegs }); lean.push(b.ms.total); b.dispose(); }
        out.leanModelUngraded = { atTodaysMeshOnTodaysRecipeMs: r1(__median(lean)), realOverLean: r3(__median(today.buildMeshRuns) / __median(lean)),
          note: 'first-round model; NOT graded' };
      }

      // ---- 2. the frozen navgrid at each size (getHeight off the baked grid = the W1 condition), 3 builds each ----
      const pathsOut = {};
      for (const s of SIZES) {
        const k = P.PROBE.worldSize / s.worldSize;
        const island = P.buildTerrain1024({ heightFn: (x, z) => P.islandHeight(x * k, z * k), worldSize: s.worldSize, segs: s.meshSegs, masks: false });
        const navMod = await P.loadNavAt(s.playRadius);
        const gridRuns = [];
        let grid = null;
        for (let q = 0; q < 3; q++) {
          if (grid) grid.dispose();
          grid = P.buildNav(navMod.Nav, { getHeight: island.heightAt, collision: ctx.collision });
          gridRuns.push(grid.ms.total);
        }
        const analyticToday = P.buildNav(navMod.Nav, { getHeight: (x, z) => T.getHeight(x, z), collision: ctx.collision });
        const nc = clockTerm(gridRuns, BAR.navMs, 'serial');
        const nav = { R: navMod.R, N: grid.N, expectedN: navMod.N, gridRuns, gridMs: r1(__median(gridRuns)), gridPhases: grid.ms,
          term: nc.term, judged: nc.judged, pendingBecause: nc.pendingBecause || null, unjudgedReads: nc.wouldBe || null,
          analyticTodaysRecipeMs: analyticToday.ms.total, openCells: grid.open, blockedCells: grid.blocked };
        if (s.worldSize === P.PROBE.worldSize) {
          const analyticStandIn = P.buildNav(navMod.Nav, { getHeight: (x, z) => P.islandHeight(x, z), collision: ctx.collision });
          nav.analyticStandInMs = analyticStandIn.ms.total;
          const empty = { colliders: [], forEachTriangle() { return -1; } };
          const bare = P.buildNav(navMod.Nav, { getHeight: island.heightAt, collision: empty });
          nav.gridNoCollidersMs = bare.ms.total;
          analyticStandIn.dispose(); bare.dispose();
          const rest = P.SITES[0];
          const paths = P.SITES.slice(1).map((site) => {
            const p = grid.nav.path({ x: rest.x, z: rest.z }, { x: site.x, z: site.z });
            const q = p ? p : grid.nav.path({ x: rest.x, z: rest.z }, { x: site.x, z: site.z }, [], { maxExpansions: grid.N * grid.N });
            return { site: site.name, ok: !!p, okUncapped: !!q, siteBlocked: grid.nav.blockedAt(site.x, site.z) };
          });
          pathsOut.fromSaltrow = { okAtDefaultCap: paths.filter((p) => p.ok).length, okUncapped: paths.filter((p) => p.okUncapped).length, of: paths.length,
            capLimited: paths.filter((p) => !p.ok && p.okUncapped).map((p) => p.site),
            unreachableOnStandIn: paths.filter((p) => !p.okUncapped).map((p) => p.site + (p.siteBlocked ? ' (site cell > 45 deg)' : '')) };
        }
        grid.dispose(); analyticToday.dispose(); island.dispose();
        per[s.worldSize].nav = nav;
      }
      out.navPaths1024 = pathsOut.fromSaltrow;
      out.todayNavN333FullRebuild = { N: ctx.nav.N, ms: r1(ctx.nav.rebuildNow({ full: true })) };
      { let sum = 0, n = 0; const t0 = performance.now();
        for (let z = -490; z < 490; z += 4) for (let x = -490; x < 490; x += 4) { sum += T.getHeight(x, z); n++; }
        out.todaysGetHeightUsPerCall = r3((performance.now() - t0) * 1000 / n); if (!(sum > -1e15)) out.todaysGetHeightUsPerCall = null; }

      // ---- 3. A9 GPU delta: live 720 m mesh vs the REAL 1024 m mesh, pinned vista, ABBA pairs ----
      let live = null;
      T.group.traverse((o) => { if (!live && o.isMesh && o.name === 'terrain-mesh') live = o; });
      const abDelta = async (geoB) => {
        const geoA = live.geometry, PAIRS = QUIET.minPairs, BURST = 1500;
        const A = [], B = [], D = []; let first = null;
        try {
          live.geometry = geoB; await __frames(12);            // upload B off the clock
          live.geometry = geoA; await __frames(12);
          const nullBefore = await __nullFrame();
          for (let k = 0; k < PAIRS; k++) {
            let a, b;
            if (k % 2 === 0) { live.geometry = geoA; a = await __gpuBurst(BURST); live.geometry = geoB; b = await __gpuBurst(BURST); }
            else { live.geometry = geoB; b = await __gpuBurst(BURST); live.geometry = geoA; a = await __gpuBurst(BURST); }
            A.push(a.gpu); B.push(b.gpu); D.push(a.gpu != null && b.gpu != null ? b.gpu - a.gpu : null);
            if (!first) first = { trisA: a.tris, trisB: b.tris, callsA: a.calls, callsB: b.calls };
          }
          live.geometry = geoA;
          const nullAfter = await __nullFrame();
          const inst = (v) => { const s = v.filter((x) => x != null && x > 0); return s.length === v.length && s.length > 1 ? r3(Math.max(...s) / Math.min(...s)) : null; };
          const q1 = __quantile(D, 0.25), q3 = __quantile(D, 0.75);
          return Object.assign({ pairs: PAIRS, burstMs: BURST, order: 'ABBA', pixelRatio: e.effectivePixelRatio,
            gpuA720: A.map(__r2), gpuB: B.map(__r2), deltas: D.map(__r2), validPairs: D.filter((d) => d != null).length,
            medianA: __r2(__median(A)), medianB: __r2(__median(B)), medianDelta: __r2(__median(D)),
            q1: __r2(q1), q3: __r2(q3), iqr: __r2(q3 - q1), instabilityA: inst(A), instabilityB: inst(B),
            nullBefore, nullAfter }, first);
        } finally { live.geometry = geoA; }
      };
      const judge = (ab) => {
        const why = boxWhy.slice();
        if (!ab) { why.push('no A/B measured'); return why; }
        if (!(ab.nullBefore < QUIET.nullFrameGpuMs) || !(ab.nullAfter < QUIET.nullFrameGpuMs)) why.push('null-frame GPU ' + ab.nullBefore + ' / ' + ab.nullAfter + ' ms (needs < ' + QUIET.nullFrameGpuMs + ')');
        if (!(ab.instabilityA <= QUIET.burstInstability) || !(ab.instabilityB <= QUIET.burstInstability)) why.push('burst instability ' + ab.instabilityA + ' / ' + ab.instabilityB + ' (needs <= ' + QUIET.burstInstability + ')');
        if (ab.validPairs < QUIET.minPairs) why.push(ab.validPairs + ' valid pairs (needs ' + QUIET.minPairs + ')');
        if (!(ab.iqr < BAR.gpuDeltaMs)) why.push('per-pair delta IQR ' + ab.iqr + ' ms (needs < ' + BAR.gpuDeltaMs + ')');
        return why;
      };
      const gpuOf = async (geo) => {
        e.setDynamicResolution(false);
        e.basePixelRatio = Math.min(window.devicePixelRatio || 1, e.tier.dprCap); e.renderScale = 1; e.resize();
        const timerWas = e.gpuTimerOn; e.enableGpuTimer(true);
        const unpin = eval(${JSON.stringify(VISTA)});
        let ab = null;
        try { ab = await abDelta(geo); } finally { unpin(); e.enableGpuTimer(timerWas); }
        const why = judge(ab);
        return { ab, judged: why.length === 0, pendingBecause: why, term: why.length ? null : ab.medianDelta <= BAR.gpuDeltaMs };
      };
      const gpu = { 1024: live && real1024 ? await gpuOf(real1024.geometry) : null };
      // smaller meshes draw a subset of the vertices of the same shader: a JUDGED pass at 1024 carries down;
      // a judged FAIL is re-measured on the smaller mesh; an unjudged 1024 leaves them unjudged
      for (const s of SIZES.slice(1)) {
        const g = gpu[P.PROBE.worldSize];
        if (!g || g.term === null) gpu[s.worldSize] = { term: null, impliedBy1024: false, pendingBecause: ['the 1024 m GPU term is unjudged'] };
        else if (g.term === true) gpu[s.worldSize] = { term: true, impliedBy1024: true };
        else {
          const b = P.realBuild(TL, { span: s.span, segs: s.meshSegs });
          try { gpu[s.worldSize] = await gpuOf(b.geometry); } finally { b.dispose(); }
        }
      }
      if (real1024) real1024.dispose();

      // ---- 4. terms per size, the decision ----
      // mode: 'effective' (this run's ruling state) | 'accepted' | 'rejected' (the pool-terrain-build ruling)
      const buildTermOf = (ws, mode) => (mode === 'accepted' ? per[ws].build.termIfAccepted : mode === 'rejected' ? per[ws].build.termIfRejected : per[ws].build.term);
      const buildPathOf = (ws, mode) => (mode === 'accepted' ? (per[ws].build.parallel.equivalent ? 'pool' : 'serial') : mode === 'rejected' ? 'serial' : per[ws].build.gradedPath);
      const termsAt = (ws, mode = 'effective') => ({
        buildMs: buildTermOf(ws, mode),
        vertexMB: per[ws].build.bytes.vertexMB <= BAR.vertexMB,
        gpuDeltaMs: gpu[ws] ? gpu[ws].term : null,
        navMs: per[ws].nav.term,
        navN: per[ws].nav.N === per[ws].nav.expectedN,
      });
      const n1024 = per[P.PROBE.worldSize].nav;
      const conditions = [
        { id: 'getHeight-from-baked-grid', binding: true,
          text: 'terrain.getHeight (the call frozen nav.js makes once per cell and once per stamped collider triangle) is served bilinear from the baked height grid',
          evidence: 'nav at N = ' + n1024.N + ': grid ' + n1024.gridMs + ' ms; today\\u2019s analytic recipe ' + n1024.analyticTodaysRecipeMs + ' ms; the 0.35 us stand-in ' + n1024.analyticStandInMs + ' ms (bar ' + BAR.navMs + ')' },
        { id: 'build-per-vertex-budget', binding: true,
          text: 'the Round-5 terrain build (every pass, masks and detail bakes included) costs at most the per-vertex wall-clock budget of the chosen size',
          evidence: SIZES.map((s) => s.worldSize + ' m: <= ' + per[s.worldSize].build.allowedPerVertexUsAllIn + ' us/vertex all-in (graded ' + per[s.worldSize].build.perVertexUs + ' on the ' + per[s.worldSize].build.gradedPath + ' path, single-thread ' + per[s.worldSize].build.serialPerVertexUs + ')').join('; ') },
        { id: 'pool-terrain-build', binding: true,
          text: 'the per-sample passes of the terrain build (heights, vertex colours, normals, masks, detail bakes) run on a ' + P.PARALLEL.workers + '-worker pool spawned for the build and terminated after it, bit-identical to the single-thread build (reference: parallelBuild in tools/r5-probes/terrain1024.js); or the single-thread build meets the per-vertex budget on its own',
          evidence: SIZES.map((s) => s.worldSize + ' m: pool ' + per[s.worldSize].build.parallel.ms.total + ' ms (' + (per[s.worldSize].build.parallel.equivalent ? 'bit-identical over ' + per[s.worldSize].build.parallel.comparedWords + ' values' : 'NOT identical: ' + per[s.worldSize].build.parallel.differing.join(', ')) + ') vs single-thread ' + r1(__median(per[s.worldSize].build.serialRuns)) + ' ms').join('; ') },
        { id: 'long-paths-pass-maxExpansions', binding: false,
          text: 'cross-island nav.path callers pass { maxExpansions } (N squared is always enough); nav.js default 24000 is too small at N = ' + n1024.N },
        { id: 'drop-terrain-uv', binding: false, text: 'the terrain shader never reads uv; dropping it saves ' + r1((per[P.PROBE.worldSize].build.bytes.attrs.uv || 0) / 1e6) + ' MB at 1024 m' },
      ];
      const decide = (mode) => {
        const table = {};
        for (const s of SIZES) table[s.worldSize] = termsAt(s.worldSize, mode);
        let d = null;
        for (const s of SIZES) {
          const t = table[s.worldSize], vals = Object.values(t);
          if (vals.some((v) => v === false)) continue;                       // a red term: this size is out
          if (vals.some((v) => v === null)) {
            d = { worldSize: null, pendingAt: s.worldSize,
              why: 'unjudged term(s) at ' + s.worldSize + ' m (' + Object.keys(t).filter((k) => t[k] === null).join(', ') + '): no size is written from an unjudged term' };
            break;
          }
          const path = buildPathOf(s.worldSize, mode);
          d = { worldSize: s.worldSize, PLAY_RADIUS: s.playRadius, MESH_SEGS: s.meshSegs, navR: per[s.worldSize].nav.R,
            rule: 'plan section 9: the first of 1024 / 860 / 720 whose terms all pass', buildPath: path,
            conditions: conditions.filter((c) => c.binding && (c.id !== 'pool-terrain-build' || path === 'pool')).map((c) => c.id) };
          const buildOnly = SIZES.filter((x) => x.worldSize > s.worldSize).filter((x) => {
            const tx = table[x.worldSize]; return tx.buildMs === false && Object.keys(tx).every((k) => k === 'buildMs' || tx[k] === true); });
          if (buildOnly.length) d.buildOnlyRedAbove = buildOnly.map((x) => x.worldSize + ' m is red on the build term only (' + r1(__median(buildPathOf(x.worldSize, mode) === 'pool' ? per[x.worldSize].build.poolRuns : per[x.worldSize].build.serialRuns))
            + ' ms on the ' + buildPathOf(x.worldSize, mode) + ' path); it is available only if world-ground commits to <= ' + per[x.worldSize].build.allowedPerVertexUsAllIn + ' us/vertex all-in').join('; ');
          break;
        }
        if (!d) {
          d = { worldSize: null,
            why: 'no candidate size passes every term: ' + SIZES.map((s) => s.worldSize + ' m red on ' + Object.keys(table[s.worldSize]).filter((k) => table[s.worldSize][k] === false).join(', ')).join('; ') };
        }
        return { decision: d, table };
      };
      const eff = decide('effective');
      let decision = eff.decision;
      const termTable = eff.table;
      // unruled: one quiet run answers under BOTH rulings, so the orchestrator's ruling picks a measured size
      if (!POOL_RULING) {
        const acc = decide('accepted'), rej = decide('rejected');
        decision.byRuling = { 'pool-terrain-build=accepted': acc.decision, 'pool-terrain-build=rejected': rej.decision };
        decision.termsByRuling = { accepted: acc.table, rejected: rej.table };
        if (decision.worldSize == null && acc.decision.worldSize != null && acc.decision.worldSize === rej.decision.worldSize) {
          decision = Object.assign({}, rej.decision, { byRuling: decision.byRuling, termsByRuling: decision.termsByRuling,
            note: 'the same size under both rulings' });
        } else if (decision.worldSize == null && (acc.decision.worldSize != null || rej.decision.worldSize != null)) {
          decision.rulingNeeded = 'pool-terrain-build: accepted -> ' + (acc.decision.worldSize || 'none (' + (acc.decision.why || '') + ')')
            + ' m; rejected -> ' + (rej.decision.worldSize || 'none (' + (rej.decision.why || '') + ')') + ' m';
        }
      } else decision.ruling = 'pool-terrain-build=' + POOL_RULING;
      const budget = Object.fromEntries(SIZES.map((s) => [s.worldSize, {
        allowedPerVertexUsAllIn: per[s.worldSize].build.allowedPerVertexUsAllIn,
        allowedPerVertexUsNetOfFixed: per[s.worldSize].build.allowedPerVertexUsNetOfFixed,
        gradedPath: per[s.worldSize].build.gradedPath, gradedPerVertexUs: per[s.worldSize].build.perVertexUs,
        singleThreadPerVertexUs: per[s.worldSize].build.serialPerVertexUs,
        singleThreadSpeedupNeeded: per[s.worldSize].build.speedupNeededSingleThread }]));
      // the per-vertex restatement travels with every decision, written or not
      decision.buildBudget = budget;
      const t = termTable[P.PROBE.worldSize];
      const red = Object.keys(t).filter((k) => t[k] === false), unjudged = Object.keys(t).filter((k) => t[k] === null);
      const pass = red.length ? false : unjudged.length ? null : true;
      out.terms1024 = t; out.termsBySize = termTable; out.red1024 = red; out.unjudged1024 = unjudged;
      out.bySize = per; out.gpuA9 = gpu; out.conditions = conditions; out.decision = decision;
      return { pass, detail: out };
    })()`;
}

/* ------------------------------------------------------------------------ */
/* gates                                                                     */
/* ------------------------------------------------------------------------ */

const PROBE_GATE = {
  id: 'A-terrain-1024-probe', kind: 'action', lane: 'engine-gpu', wave: 'W0a', timeout: 420000, settle: 2500,
  title: 'Today\'s terrain build (every _buildMesh pass) at MESH_SEGS 686 over 1331 m ≤ 600 ms (all 3 runs; recipe ≥ today\'s per-sample cost): single-thread, or on a cold 4-worker pool bit-identical to the constructor ONLY under the orchestrator ruling pool-terrain-build=accepted (unruled: a pool-only pass is PENDING and the size is reported under both rulings); vertex buffers ≤ 24 MB, A9 GPU delta vs the 720 m mesh ≤ +1.5 ms (≥ 8 ABBA pairs, IQR < bar), frozen navgrid at R = 492 ≤ 150 ms; every clock judged on a quiet box only (load < 3, 0 other headless Chromes; today\'s mesh single-thread AND on the pool within 10 % before/after; GPU null frame < 3 ms); else the first passing fallback (860 / 720) — never a size from an unjudged term',
  assert: probeAssert(null),
};

/**
 * A box witness (kind 'runner', node side): samples load and other headless
 * Chromes and rewrites the TARGET gate's assert with the sample, on the gate
 * object the runner passes to check({ GATES }) — the same object it then runs.
 * Run it in the same invocation, before its target (`--lane engine-gpu` does;
 * with --only, list both). A target run alone reads "box not sampled" and its
 * clocks stay PENDING — never a silent PASS.
 */
function boxGate(id, wave, targetId, assertFor, what) {
  return {
    id, kind: 'runner', lane: 'engine-gpu', wave, timeout: 15000,
    title: `Box witness for ${targetId}: 1-min load average < 3 and 0 other headless Chromes, sampled in node and handed to it (${what} judged only on a quiet box); PENDING on a loud box`,
    check({ GATES: all }) {
      const box = sampleBox();
      const target = (all || []).find((g) => g.id === targetId);
      if (target) target.assert = assertFor(box);
      const why = [];
      if (box.psError) why.push('ps failed: ' + box.psError);
      if (!(box.load1 < QUIET.load1)) why.push(`load average ${box.load1} (needs < ${QUIET.load1})`);
      if (box.otherHeadlessChromes > QUIET.otherHeadlessChromes) why.push(`${box.otherHeadlessChromes} other headless Chrome(s) (needs 0)`);
      return { pass: box.quiet ? true : null, detail: { ...box, handedTo: target ? target.id : null, pendingBecause: why } };
    },
  };
}
const BOX_GATE = boxGate('A-terrain-1024-probe-box', 'W0a', PROBE_GATE.id, probeAssert, 'every clock it grades — build, nav, GPU — is');

const GPU_TIER_GATE = {
  id: 'A-gpu-tier', kind: 'action', lane: 'engine-gpu', wave: 'W0b', timeout: 420000, settle: 1500,
  title: 'The shipped default tier on a DPR-2 display (DPR 1.25), 1600×900, on the Pans POC (?poc=biome), quiet box only: empty frame (sky + post) GPU median ≤ 7 ms, Pans vista GPU median ≤ 13 ms, median fps ≥ 58, p95 frame ≤ 20 ms; the chosen levers recorded in docs/ROUND5-ENGINE.md with before/after numbers (Round-4 high and each lever measured on the same page)',
  assert: gpuTierAssert(null),
};
const GPU_TIER_BOX = boxGate('A-gpu-tier-box', 'W0b', GPU_TIER_GATE.id, gpuTierAssert, 'every clock A-gpu-tier grades is');

export const GATES = [
  BOX_GATE,
  PROBE_GATE,

  // ---------------------------------------------------------------- W0b
  GPU_TIER_BOX,
  GPU_TIER_GATE,
  {
    id: sid('A22-msaa'), kind: 'action', lane: 'engine-gpu', wave: 'W0b', timeout: 240000, settle: 1500, shadows: 'A22-msaa',
    title: 'A22 under R25 (A-gpu-tier picked SMAA-only): the scene target is composer.renderTarget1 with the tier\'s sample count (≥ 4 if the tier keeps MSAA, else 0) and SMAA is present and enabled at the shipped tier; measured on V20\'s crop of the Pans POC, SMAA puts ramp values on ≥ 20 % of silhouette pixels and ≥ 1.5× the same frame with SMAA off (V20 itself is the R29 judge\'s)',
    assert: A22_ASSERT,
  },
  {
    id: sid('V20-aa-crop'), kind: 'visual', lane: 'engine-gpu', wave: 'W0b', timeout: 240000, settle: 100000, shadows: 'V20-aa-crop',
    title: 'Anti-aliasing at the shipped tier: 4× nearest crop of basalt-column silhouettes against the sky on the Pans POC, beside the same crop with no AA and with Round 4\'s MSAA×4 + SMAA',
    setup: V20_SETUP,
    criteria: 'Top-left tile (the SHIPPED tier, SMAA-only at DPR 1.25, 4x nearest): every silhouette edge of the basalt columns against the sky — column tops, the sides of the columns, any grass blade — shows a ramp of intermediate pixels between the rock colour and the sky colour (a soft 2-3 pixel gradient at this magnification). Compare with the top-right tile (the same frame with NO anti-aliasing), whose edges are hard two-colour stair-steps: PASS needs the top-left edges to read clearly softer than the top-right and comparable to the bottom-left tile (Round 4\'s MSAA x4 + SMAA). Bottom-right shows where the crop is (red box). FAIL if the top-left edges are hard stair-steps with no in-between values (looks like the top-right tile), or if the sheet is missing.',
  },
  {
    id: sid('A108-ao-periodicity'), kind: 'action', lane: 'engine-gpu', wave: 'W0b', timeout: 420000, settle: 1500, shadows: 'A108-ao-periodicity',
    title: 'Re-staged on the Pans POC: no periodic luminance peak above 0.15 at lags 2-32 px on the far mesas, the haze band or the mid-ground with GTAO on, at every GTAO tier (shipped quarter-res `high` included) and DPR 1 and 2 (GTAO-off control peak-free on the same crops); the AO buffer follows the tier\'s scale; the depth-consistent GTAO shader is installed; a sensitivity witness proves the instrument sees the stock-shader lattice on this content; the GTAO denoise noise is the engine\'s seeded texture (the same pixels on every boot)',
    assert: A108_ASSERT,
  },
  {
    id: sid('A109-ao-distance-fade'), kind: 'action', lane: 'engine-gpu', wave: 'W0b', timeout: 300000, settle: 1500, shadows: 'A109-ao-distance-fade',
    title: 'Re-staged on the Pans POC: AO occlusion past 150 m ≤ 10 % of its 4-6 m value (which stays ≥ 0.05), and the far mesa band with GTAO on within 3 % of GTAO off, at every GTAO tier',
    assert: A109_ASSERT,
  },
  {
    id: sid('V33b-no-ao-lattice'), kind: 'visual', lane: 'engine-gpu', wave: 'W0b', timeout: 300000, settle: 120000, shadows: 'V33b-no-ao-lattice',
    title: 'GTAO on (shipped high at quarter-res + ultra): no screen-locked lattice on the Pans POC at four bearings, and contact AO still reads in a 2 m close-up',
    setup: V33B_SETUP,
    criteria: 'A 4x4 contact sheet of the Pans POC. Row 1: the shipped tier (high, GTAO at quarter resolution) at bearings N/E/S/W from the vista spot. Row 2: the same at ultra (full-res GTAO). Row 3: 1:1 device-pixel crops of the far basalt shelf wall seen across the salt pan (100-200 m, hills in the haze behind), GTAO on next to GTAO OFF, high then ultra. Row 4: 1:1 device-pixel crops of a 2 m-high close-up where a boulder sits on the dune sand (grass around it): the shipped tier with GTAO on, the same crop OFF, then what GTAO adds there at high and at ultra, amplified 8x (white = no darkening). PASS: no screen-locked lattice, grid, plaid, dither or banding on the distant shelf wall, the hills, the haze band or the sky edge in any tile; each "on" crop in row 3 is indistinguishable from its "OFF" neighbour; in row 4 the two darkening tiles show soft contact darkening concentrated where the boulder meets the sand and at the grass bases (the on tile reads slightly darker there than the OFF tile), smooth at the quarter resolution of high (no blocks, no stair-stepped halo, no dark outline running along silhouettes against the sky) and with no pattern on open ground. FAIL on any regular vertical bars / horizontal bands / checker or grid in any tile, on blocky AO halos at the shipped quarter resolution, or if a darkening tile is blank white (AO switched off rather than fixed).',
  },
  {
    id: 'V-gpu-tier-look', kind: 'visual', lane: 'engine-gpu', wave: 'W0b', timeout: 240000, settle: 90000,
    title: 'What the shipped tier costs the picture: the Pans POC vista at Round 4\'s `high`, at the shipped levers with anisotropy as authored, at the shipped levers with the alternative anisotropy row (not shipped) and at the shipped `high` (full frames + native-aspect nearest-neighbour crops of the far ground)',
    setup: V_LOOK_SETUP,
    criteria: 'A sheet of the Pans POC vista in four configurations, same camera, numbered 1-4 in every label. Top band, left to right: four full frames — 1 Round 4\'s `high` (DPR 1.5, MSAA x4 + SMAA, anisotropic filtering as authored, 8x); 2 the shipped levers with anisotropic filtering as authored (DPR 1.25, SMAA only, GTAO quarter-res, AO and bloom folded into the grade, far cascades on alternate frames); 3 NOT SHIPPED: the shipped levers with the alternative anisotropy row named in its label; 4 the SHIPPED `high` (the shipped levers with the anisotropy caps named in its label: colour = sRGB albedo textures, data = normal and roughness/AO maps) — each with the crop box outlined in red. Below: the far ground in that box (salt pan beyond the dune crest, the basalt shelf foot) at native aspect, nearest-neighbour: crop 1 top-left, crop 2 top-right, crop 3 bottom-left, crop 4 (SHIPPED) bottom-right. PASS: frames 1, 2 and 4 show the same scene with the same light, shadow shapes (the ring\'s ellipse shadow on the pan), contact darkening, bloom and grade, with no shadow missing or blocky, no AO halo, no colour shift and no new banding or aliasing; and in crop 4 the salt pan still reads as pale crusted ground (the light polygonal crust pattern) and the dune ripples are still there, as a softer version of crop 2. FAIL if crop 4\'s salt pan reads as flat untextured colour or as horizontal streaks where crop 2 shows crust texture, if the dune ripples are gone in crop 4, or if anything other than softness differs between frames 1, 2 and 4. Configuration 3 is NOT graded: it shows the alternative the decision was taken against.',
  },

  // ---------------------------------------------------------------- W0a (kept)

  {
    id: 'A-rt-ledger-census', kind: 'action', lane: 'engine-gpu', wave: 'W0a', timeout: 120000, settle: 2500,
    // the page boots in measurement mode: engine.js wraps the WebGL2 prototype before the context exists
    params: 'rtTally=1',
    title: 'Render-target ledger is complete and honest: recounted from the GL allocation calls since boot (texture levels, renderbuffer storage, framebuffer attachments, deletes; own GL-format arithmetic), every live render-target allocation is attributed to a ledger row and every row\'s GL bytes equal its ledger bytes, to the byte; every bound target named; docs + RT_LEDGER match live; a registered target stays named through setSize (three dispatches dispose there) with its new bytes, reads unallocated once disposed, leaves on unregister, is held weakly; the hook leaves nothing behind',
    assert: `(async () => {
      ${GUARD}
      ${FRAMES}
      ${STAGE_PRELUDE}
      ${LEDGER_STAGE}
      const ctx = __CTX__, e = ctx.engine, r = e.renderer;
      if (typeof e.renderTargetLedger !== 'function') return { pass: null, detail: 'engine.renderTargetLedger missing' };
      const origSet = r.setRenderTarget;
      e.trackRenderTargets(true);
      const unpin = await __stageLedger();
      const L = e.renderTargetLedger();
      const GLR = __glRecount(L);                     // the same frame, before anything is unpinned
      unpin();
      e.trackRenderTargets(false);
      const hookGone = r.setRenderTarget === origSet && e._rtSeen === null;
      const unregistered = L.rows.filter((x) => x.owner === 'unregistered');
      const relErr = GLR.installed ? Math.abs(GLR.glBytes - L.bytes) / Math.max(1, L.bytes) : 1;
      const glOk = GLR.installed && GLR.unattributedBytes === 0 && GLR.unattributed.length === 0 && GLR.rowMismatches.length === 0
        && GLR.glBytes === L.bytes && GLR.claimedBytes === L.bytes && GLR.unknownFormats.length === 0 && GLR.orphanCalls === 0;
      const envRow = L.rows.find((x) => /^env:/.test(x.owner)) || null;
      const live = __byOwner(L);
      const DOCS = ${DOCS};
      const REC = ${RT_LEDGER_JSON};
      const cmp = (rec) => {
        const keys = new Set([...Object.keys(rec), ...Object.keys(live)]);
        const bad = [];
        for (const k of keys) {
          const a = rec[k] ?? 0, b = live[k] ?? 0;
          if (Math.abs(a - b) > Math.max(1, b) * 0.01) bad.push({ owner: k, recorded: a, live: b });
        }
        return bad;
      };
      const docsBad = DOCS.marked ? cmp(DOCS.rows) : [{ owner: '*', recorded: 'docs/ROUND5-ENGINE.md ledger table missing' }];
      const recBad = cmp(REC.rows);

      // THE REGISTRATION CONTRACT, on the life of a real lane target: born 2x2 and
      // sized on first use (environment.js CAL.lightShafts does exactly this), resized
      // again, disposed, unregistered. three's RenderTarget.setSize() dispatches
      // 'dispose' on every size change; a registry that listened for it lost the target.
      const RT = e.sceneTarget.constructor;
      const bind = (t) => { r.setRenderTarget(t); r.setRenderTarget(null); };
      const row = () => e.renderTargetLedger().rows.find((x) => x.owner === 'probe:register') || null;
      const snap = (x) => (x ? { w: x.width, h: x.height, bytes: x.bytes, allocated: x.allocated } : null);
      const probeRT = new RT(2, 2, { depthBuffer: false });
      e.registerRenderTarget('probe:register', probeRT);
      bind(probeRT);
      const s0 = snap(row());
      probeRT.setSize(64, 32);
      const s1 = snap(row());                       // disposed by setSize, not yet re-bound
      bind(probeRT);
      const s2 = snap(row());
      probeRT.setSize(128, 48); bind(probeRT);
      const s3 = snap(row());
      const totalWithIt = e.renderTargetLedger().bytes;
      probeRT.dispose();
      const s4 = snap(row());
      const totalAfterDispose = e.renderTargetLedger().bytes;
      const unreg = e.unregisterRenderTarget(probeRT);
      const s5 = snap(row());
      const reg = {
        born2x2: s0, afterSetSizeBeforeBind: s1, after64x32Bind: s2, after128x48Bind: s3, afterDispose: s4, afterUnregister: s5,
        unregisterReturned: unreg, droppedFromTotalOnDispose: totalWithIt - totalAfterDispose,
      };
      const regOk = !!s0 && s0.bytes === 2 * 2 * 4 && s0.allocated
        && !!s1 && s1.allocated === false
        && !!s2 && s2.w === 64 && s2.h === 32 && s2.bytes === 64 * 32 * 4 && s2.allocated
        && !!s3 && s3.w === 128 && s3.h === 48 && s3.bytes === 128 * 48 * 4 && s3.allocated
        && !!s4 && s4.allocated === false && (totalWithIt - totalAfterDispose) === 128 * 48 * 4
        && unreg === true && s5 === null;
      // weak hold: a registered target nobody else references is collected, not kept alive by the ledger
      let weakOk = null;
      if (typeof window.gc === 'function') {
        (() => { const t = new RT(8, 8, { depthBuffer: false }); e.registerRenderTarget('probe:weak', t); })();
        for (let i = 0; i < 4; i++) { await __frames(2); window.gc(); }
        weakOk = !e.renderTargetLedger().rows.some((x) => x.owner === 'probe:weak');
      }
      reg.weakHoldCollected = weakOk;
      const pass = unregistered.length === 0 && glOk && hookGone && docsBad.length === 0 && recBad.length === 0
        && L.pixelRatio === 1.25 && regOk && weakOk !== false;
      return { pass, detail: {
        pixelRatio: L.pixelRatio, quality: L.quality, msaa: L.msaa, rtMB: L.mb, canvasMB: L.canvas.mb,
        targets: L.rows.length, allocated: L.rows.filter((x) => x.allocated).length,
        unregistered: unregistered.map((x) => ({ name: x.name, w: x.width, h: x.height })),
        glRecount: GLR.installed ? { ok: glOk, glMB: +(GLR.glBytes / 1e6).toFixed(3), glBytes: GLR.glBytes, ledgerBytes: L.bytes,
          claimedBytes: GLR.claimedBytes, relErr: +relErr.toFixed(6), liveFramebuffers: GLR.liveFramebuffers, glObjects: GLR.glObjects,
          unattributedBytes: GLR.unattributedBytes, unattributed: GLR.unattributed, rowMismatches: GLR.rowMismatches,
          unknownFormats: GLR.unknownFormats, orphanCalls: GLR.orphanCalls,
          rows: GLR.rows.map((x) => ({ owner: x.owner, ledger: x.ledger, gl: x.gl, objects: x.objects, parts: x.parts })) }
          : { ok: false, why: 'engine.glTally missing: the page was not booted with ?rtTally=1' },
        envRow: envRow ? { owner: envRow.owner, w: envRow.width, h: envRow.height, depth: envRow.depth, parts: envRow.parts,
          bytes: envRow.bytes, pmrem: envRow.pmrem || null, targetAlive: !!envRow.target } : null,
        hookRestored: hookGone, docsMismatch: docsBad, rtLedgerExportMismatch: recBad,
        registerContract: Object.assign({ ok: regOk }, reg),
        liveByOwner: live,
      } };
    })()`,
  },

  {
    // the wave that grades the BAR is the orchestrator's ruling (plan §8.3 `rt-ledger-bar=W0b`)
    id: 'A-rt-ledger', kind: 'action', lane: 'engine-gpu', wave: RULINGS.rtLedgerBar || 'W0a', timeout: 240000, settle: 2500,
    title: 'Render targets at the SHIPPED DEFAULT TIER on a DPR-2 display (DPR 1.25), 1600×900: total ≤ 170 MB; textures + RTs + geometry ≤ 450 MB at the staged fight; bytes recorded in docs/ROUND5-ENGINE.md and tools/budgets.mjs; Round-4 high and each W0b lever measured live on the same frame and the shipped tier restored to the byte',
    assert: `(async () => {
      ${GUARD}
      ${FRAMES}
      ${STAGE_PRELUDE}
      ${LEDGER_STAGE}
      ${VRAM_CENSUS}
      const ctx = __CTX__, e = ctx.engine;
      if (typeof e.renderTargetLedger !== 'function') return { pass: null, detail: 'engine.renderTargetLedger missing' };
      const EM = await import('/src/core/engine.js');
      const BAR = { rtMB: 170, totalMB: 450 };
      const unpin = await __stageLedger();
      if (unpin.skip) return { pass: null, detail: { stagedFight: 'not staged: ' + unpin.skip } };
      const L = e.renderTargetLedger();
      const V = __vramCensus();
      const live = __byOwner(L);
      const mb = (b) => +(b / 1e6).toFixed(2);
      const shipped = { quality: L.quality, defaultTier: EM.DEFAULT_TIER, pixelRatio: L.pixelRatio, msaa: L.msaa, gtaoScale: L.gtaoScale,
        smaaType: e.smaa.edgesRT.texture.type, csmMapSizes: e.csmMapSizes };
      const atShipped = L.quality === EM.DEFAULT_TIER && L.pixelRatio === 1.25;

      // ---- before -> after: Round-4 high and the W0b levers, MEASURED LIVE on the same staged frame ----
      const SHIP = EM.QUALITY_TIERS[EM.DEFAULT_TIER], R4 = EM.ROUND4_HIGH;
      const CHAIN = [
        ['Round-4 high (DPR 1.5)', R4],
        ['Round-4 high at DPR 1.25', Object.assign({}, R4, { dprCap: 1.25 })],
        ['+ SMAA-only (MSAA 0: no resolve copy, so renderTarget2 holds only the grade output, RGBA8, and postTarget is released)', Object.assign({}, R4, { dprCap: 1.25, msaa: 0 })],
        ['+ GTAO quarter-res', Object.assign({}, R4, { dprCap: 1.25, msaa: 0, gtaoScale: 0.25 })],
        ['+ SMAA targets RGBA8', Object.assign({}, R4, { dprCap: 1.25, msaa: 0, gtaoScale: 0.25, smaaHalfFloat: false })],
        ['+ far cascades capped = shipped ' + EM.DEFAULT_TIER, SHIP],
        ['alternative: shipped with GTAO half-res', Object.assign({}, SHIP, { gtaoScale: 0.5 })],
        ['alternative: shipped with CSM 3 x 1536', Object.assign({}, SHIP, { csmMapCaps: [1536] })],
      ];
      const levers = [];
      for (const [label, row] of CHAIN) {
        e.applyTier(row, 'lever'); e.setDynamicResolution(false);
        e.basePixelRatio = Math.min(2, row.dprCap); e.renderScale = 1; e.resize();
        await __frames(12);
        const l = e.renderTargetLedger(), by = __byOwner(l);
        levers.push({ label, pixelRatio: l.pixelRatio, mb: l.mb, marginToBarMB: +(BAR.rtMB - l.mb).toFixed(2),
          sceneMB: mb(by['post:scene'] || 0), shadowMB: mb(Object.entries(by).filter(([k]) => /^shadow:/.test(k)).reduce((s2, [, v]) => s2 + v, 0)),
          smaaMB: mb((by['post:SMAAPass.edgesRT'] || 0) + (by['post:SMAAPass.weightsRT'] || 0)),
          gtaoMB: mb(Object.entries(by).filter(([k]) => /GTAOPass/.test(k)).reduce((s2, [, v]) => s2 + v, 0)),
          csmMapSizes: e.csmMapSizes });
      }
      e.applyTier(SHIP, EM.DEFAULT_TIER); e.setDynamicResolution(false);
      e.basePixelRatio = Math.min(2, SHIP.dprCap); e.renderScale = 1; e.resize();
      await __frames(12);
      const Lafter = e.renderTargetLedger();
      unpin();
      const restored = Lafter.bytes === L.bytes && Lafter.pixelRatio === L.pixelRatio && e.quality === EM.DEFAULT_TIER;
      const B = ${BUDGETS_REC};
      const DOCS = ${DOCS};
      const totalBytes = L.bytes + V.textureBytes + V.geometryBytes;
      // "recorded" = the recorded rows equal the live ledger, owner by owner (1 %), not mere presence
      const rowsMatch = (rec) => {
        const keys = new Set([...Object.keys(rec || {}), ...Object.keys(live)]);
        const bad = [];
        for (const k of keys) {
          const a = (rec || {})[k] ?? 0, b = live[k] ?? 0;
          if (Math.abs(a - b) > Math.max(1, b) * 0.01) bad.push({ owner: k, recorded: a, live: b });
        }
        return bad;
      };
      const docsBad = DOCS.marked ? rowsMatch(DOCS.rows) : [{ owner: '*', recorded: 'docs/ROUND5-ENGINE.md ledger table missing' }];
      const budgetsBad = B.present ? rowsMatch(B.rows) : null;
      const terms = {
        atShippedTier: atShipped,
        rtTotal: L.bytes / 1e6 <= BAR.rtMB,
        sumAtStagedFight: totalBytes / 1e6 <= BAR.totalMB,
        recordedInDocs: docsBad.length === 0,
        // tools/budgets.mjs is gates-perf's file: until it re-exports RT_LEDGER this clause is OUTSTANDING (null), never PASS
        recordedInBudgets: budgetsBad === null ? null : budgetsBad.length === 0,
        leversRestored: restored,
      };
      const vals = Object.values(terms);
      const pass = vals.some((v) => v === false) ? false : vals.some((v) => v === null) ? null : true;
      // the texture census's biggest entries, so a red total names its owners
      return { pass, detail: {
        at: Object.assign(shipped, { viewport: [innerWidth, innerHeight] }),
        rtMB: L.mb, bars: BAR, terms,
        byOwnerMB: Object.fromEntries(Object.entries(live).map(([k, v]) => [k, mb(v)])),
        canvasMB: L.canvas.mb, provisionedNotAllocatedMB: mb(L.provisionedBytes),
        stagedFight: { cast: (typeof __stage !== 'undefined' && __stage.casts && __stage.casts['staged-fight']) || null,
          textureMB: mb(V.textureBytes), textures: V.textures, geometryMB: mb(V.geometryBytes), buffers: V.buffers,
          rtMB: L.mb, totalMB: mb(totalBytes), topTextures: V.top },
        beforeAfterMeasuredLive: levers, afterRestoreMB: Lafter.mb,
        waveRuling: ${JSON.stringify(RULINGS.rtLedgerBar)},
        docsMismatch: docsBad, budgetsMismatch: budgetsBad,
        budgetsRecord: B.present ? 'present (' + (B.measured || 'no measured stamp') + ')' : 'OUTSTANDING (gates-perf): tools/budgets.mjs needs the one line  export { RT_LEDGER } from "./r5-probes/rt-ledger.mjs";  (a leaf module: no import cycle)',
      } };
    })()`,
  },
];
