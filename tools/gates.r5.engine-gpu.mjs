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
 * A-gpu-tier, A22-msaa, A108, A109, V20, V33b are W0b (the tier decision) and
 * are not registered here yet. Every row carries `wave`.
 *
 * No gate here names a species, a coordinate or a bone: the vista and the
 * staged fight come from tools/budgets.mjs (gates-perf), the island sites from
 * the probe's bible table.
 */
import { readFileSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
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
const STAGE_PRELUDE = BUDGETS_MOD.STAGE_PRELUDE || '';
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
    return { textureBytes: Math.round(tex), textures: texCount, geometryBytes: geo, buffers: bufSeen.size };
  };
`;

/** Ledger staging: shipped tier, DPR 1.25, DRS off; spawn vista then the staged fight. */
const LEDGER_STAGE = `
  const __stageLedger = async () => {
    const ctx = __CTX__, e = ctx.engine;
    e.setDynamicResolution(false);
    e.basePixelRatio = 1.25; e.renderScale = 1; e.resize();
    const unpinA = eval(${JSON.stringify(VISTA)});
    await __frames(60);
    unpinA();
    const unpinF = eval(${JSON.stringify(FIGHT)});
    await __frames(90);
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
/* A-terrain-1024-probe                                                      */
/* ------------------------------------------------------------------------ */

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

const BOX_GATE = {
  id: 'A-terrain-1024-probe-box', kind: 'runner', lane: 'engine-gpu', wave: 'W0a', timeout: 15000,
  title: 'Box witness for A-terrain-1024-probe: 1-min load average < 3 and 0 other headless Chromes, sampled in node and handed to the probe (every clock it grades — build, nav, GPU — is judged only on a quiet box); PENDING on a loud box',
  check({ GATES: all }) {
    const box = sampleBox();
    const target = (all || []).find((g) => g.id === PROBE_GATE.id);
    if (target) target.assert = probeAssert(box);
    const why = [];
    if (box.psError) why.push('ps failed: ' + box.psError);
    if (!(box.load1 < QUIET.load1)) why.push(`load average ${box.load1} (needs < ${QUIET.load1})`);
    if (box.otherHeadlessChromes > QUIET.otherHeadlessChromes) why.push(`${box.otherHeadlessChromes} other headless Chrome(s) (needs 0)`);
    return { pass: box.quiet ? true : null, detail: { ...box, handedTo: target ? target.id : null, pendingBecause: why } };
  },
};

export const GATES = [
  BOX_GATE,
  PROBE_GATE,

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
    // the wave that grades the BAR is the orchestrator's ruling (plan marker `r5-ruling rt-ledger-bar`); unruled: W0a
    id: 'A-rt-ledger', kind: 'action', lane: 'engine-gpu', wave: RULINGS.rtLedgerBar || 'W0a', timeout: 180000, settle: 2500,
    title: 'Render targets at the shipped tier, DPR 1.25, 1600×900: total ≤ 170 MB; textures + RTs + geometry ≤ 450 MB at the staged fight; bytes recorded in docs/ROUND5-ENGINE.md and tools/budgets.mjs (the tier levers that could meet the bar are measured live and restored; which wave grades the bar awaits an orchestrator ruling)',
    assert: `(async () => {
      ${GUARD}
      ${FRAMES}
      ${STAGE_PRELUDE}
      ${LEDGER_STAGE}
      ${VRAM_CENSUS}
      const ctx = __CTX__, e = ctx.engine;
      if (typeof e.renderTargetLedger !== 'function') return { pass: null, detail: 'engine.renderTargetLedger missing' };
      const BAR = { rtMB: 170, totalMB: 450 };
      const unpin = await __stageLedger();
      const L = e.renderTargetLedger();
      const V = __vramCensus();
      const live = __byOwner(L);
      const mb = (b) => +(b / 1e6).toFixed(2);

      // ---- levers, MEASURED LIVE on the same staged frame, then restored ----
      const UBYTE = 1009;
      const csmLights = (e.csm && e.csm.lights) || [];
      const csm0 = e.csm ? e.csm.shadowMapSize : null;
      const setCsm = (size) => {
        for (const l of csmLights) { l.shadow.mapSize.set(size, size); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } }
        if (e.csm) e.csm.shadowMapSize = size;
        e.renderer.shadowMap.needsUpdate = true;
      };
      const smaaRTs = [e.smaa.edgesRT, e.smaa.weightsRT].filter(Boolean);
      const smaaType0 = smaaRTs.map((t) => t.texture.type);
      const msaa0 = e.sceneTarget.samples;
      const gtao0 = e.tier.gtaoScale;
      const LEVERS = {
        msaa0: [() => { e.sceneTarget.samples = 0; e.sceneTarget.dispose(); }, () => { e.sceneTarget.samples = msaa0; e.sceneTarget.dispose(); }],
        csm1536: [() => setCsm(1536), () => setCsm(csm0)],
        csm1024: [() => setCsm(1024), () => setCsm(csm0)],
        smaaRGBA8: [() => { for (const t of smaaRTs) { t.texture.type = UBYTE; t.dispose(); } },
          () => { smaaRTs.forEach((t, i) => { t.texture.type = smaaType0[i]; t.dispose(); }); }],
        gtaoQuarter: [() => { e.tier.gtaoScale = gtao0 * 0.5; }, () => { e.tier.gtaoScale = gtao0; }],
        dpr1: [() => { e.basePixelRatio = 1; }, () => { e.basePixelRatio = 1.25; }],
        dpr15: [() => { e.basePixelRatio = 1.5; }, () => { e.basePixelRatio = 1.25; }],
      };
      const measureSet = async (names) => {
        try { for (const n of names) LEVERS[n][0](); e.resize(); await __frames(10); return e.renderTargetLedger(); }
        finally { for (const n of names.slice().reverse()) LEVERS[n][1](); e.resize(); await __frames(10); }
      };
      const SETS = {
        'SMAA-only (MSAA 0)': ['msaa0'],
        'CSM 3 x 1536': ['csm1536'],
        'CSM 3 x 1024': ['csm1024'],
        'SMAA targets RGBA8': ['smaaRGBA8'],
        'GTAO quarter-res': ['gtaoQuarter'],
        'DPR 1.0': ['dpr1'],
        'DPR 1.5 (today high cap)': ['dpr15'],
        'SMAA-only + CSM 3 x 1536 + SMAA RGBA8': ['msaa0', 'csm1536', 'smaaRGBA8'],
        'SMAA-only + CSM 3 x 1536 + SMAA RGBA8 + GTAO quarter': ['msaa0', 'csm1536', 'smaaRGBA8', 'gtaoQuarter'],
        'SMAA-only + CSM 3 x 1024': ['msaa0', 'csm1024'],
        'SMAA-only + CSM 3 x 1024 + SMAA RGBA8': ['msaa0', 'csm1024', 'smaaRGBA8'],
      };
      const levers = {};
      for (const [label, names] of Object.entries(SETS)) {
        const l = await measureSet(names);
        const by = __byOwner(l);
        levers[label] = { mb: l.mb, marginToBarMB: +(BAR.rtMB - l.mb).toFixed(2),
          shadowMB: mb(Object.entries(by).filter(([k]) => /^shadow:/.test(k)).reduce((s, [, v]) => s + v, 0)),
          sceneMB: mb(by['post:scene'] || 0), smaaMB: mb((by['post:SMAAPass.edgesRT'] || 0) + (by['post:SMAAPass.weightsRT'] || 0)),
          gtaoMB: mb(Object.entries(by).filter(([k]) => /GTAOPass/.test(k)).reduce((s, [, v]) => s + v, 0)) };
      }
      await __frames(10);
      const Lafter = e.renderTargetLedger();
      unpin();
      const restored = Lafter.bytes === L.bytes && Lafter.pixelRatio === L.pixelRatio && e.sceneTarget.samples === msaa0
        && e.tier.gtaoScale === gtao0 && (!e.csm || e.csm.shadowMapSize === csm0);
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
      const budgetsBad = B.present ? rowsMatch(B.rows) : [{ owner: '*', recorded: 'tools/budgets.mjs exports no RT_LEDGER' }];
      const terms = {
        rtTotal: L.bytes / 1e6 <= BAR.rtMB,
        sumAtStagedFight: totalBytes / 1e6 <= BAR.totalMB,
        recordedInDocs: docsBad.length === 0,
        recordedInBudgets: budgetsBad.length === 0,
        leversRestored: restored,
      };
      const pass = Object.values(terms).every(Boolean);
      return { pass, detail: {
        at: { quality: L.quality, pixelRatio: L.pixelRatio, msaa: L.msaa, gtaoScale: L.gtaoScale, viewport: [innerWidth, innerHeight] },
        rtMB: L.mb, bars: BAR, terms,
        byOwnerMB: Object.fromEntries(Object.entries(live).map(([k, v]) => [k, mb(v)])),
        canvasMB: L.canvas.mb, provisionedNotAllocatedMB: mb(L.provisionedBytes),
        stagedFight: { textureMB: mb(V.textureBytes), textures: V.textures, geometryMB: mb(V.geometryBytes), buffers: V.buffers,
          rtMB: L.mb, totalMB: mb(totalBytes) },
        leversMeasuredLive: levers, afterLeversMB: Lafter.mb,
        waveRuling: ${JSON.stringify(RULINGS.rtLedgerBar)},
        rulingRequested: ${JSON.stringify(RULINGS.rtLedgerBar)} ? null : 'which wave grades this bar: W0a (orchestrator brief: "the render-target ledger measurements") or W0b (plan section 3.1 W0b exit: "GPU tier chosen and render targets measured"); until ruled (plan marker <!-- r5-ruling rt-ledger-bar=W0a|W0b -->) it is graded at W0a and reads as measured',
        docsMismatch: docsBad, budgetsMismatch: budgetsBad,
        budgetsRecord: B.present ? 'present (' + (B.measured || 'no measured stamp') + ')' : 'absent: gates-perf adds  export { RT_LEDGER } from "./r5-probes/rt-ledger.mjs";  to tools/budgets.mjs (a leaf module: no import cycle)',
      } };
    })()`,
  },
];
