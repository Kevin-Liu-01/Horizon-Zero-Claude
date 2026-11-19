/**
 * M0.8 PERFORMANCE ATTRIBUTION — the page half (imported in the page by tools/perf/attrib.mjs:
 * `import('/tools/perf/attrib-page.mjs')`). Run on a staged Frame Set frame with the simulation frozen.
 *
 *   split(E, scene)       GPU time by cumulative enabling, one class at a time: the floor (post chain on an empty
 *                         scene), + opaque (solid), + alpha-tested (alphaTest, alpha-to-coverage, or a fragment shader
 *                         that can discard), + transparent and additive, + shadow maps, + GTAO, bloom, SMAA, after-render
 *                         hooks. Rows sum to the full chain by construction; 3 interleaved sweeps, medians per step.
 *   overdraw(E, scene)    shaded-fragment counts per covered pixel, from the stencil buffer: every fragment of the
 *                         chosen class that passes the depth test (and is not discarded) increments the stencil in a
 *                         render of the frame as the game draws it; full-screen quads then read the counts back.
 *   unlitSwap(E, scene)   GPU time with every lit material swapped for an unlit one (same maps, alpha test, side,
 *                         skinning): shading cost against fill cost.
 *   halfRes(E)            GPU time at half the resolution in each axis (a quarter of the pixels): if the time falls
 *                         towards a quarter, the frame is fragment-bound.
 *   cpu(E)                the main-thread frame (engine perfSnapshot: sim, render submission, tail), live and frozen.
 *
 * GPU time is EXT_disjoint_timer_query_webgl2 around composer.render (engine.enableGpuTimer, what A21 reads), so
 * vsync does not enter it; the driver launches Chrome with vsync and the frame-rate limit off as well, so the GPU
 * is never idle between frames and stays clocked up.
 */
import * as T from 'three';
import { wholeFrame } from '/tools/look/gpu-attrib-page.mjs';

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = async (n) => { for (let i = 0; i < n; i++) await raf(); };
const median = (a) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);


/**
 * GPU work time without vsync: render the frame `n` times back to back inside one task, each followed by
 * a 1-pixel readback, so the GPU never idles (and is not down-clocked to fill a vsync interval, which makes timer
 * queries under vsync read ~16-21 ms for any frame lighter than that). `medianMs` = submit + GPU (finish to finish);
 * `submitMs` = the CPU's part of it (render() returning before the finish).
 */
export async function finishFrame(E, n = 40) {
  const gl = E.renderer.getContext();
  const px = new Uint8Array(4);
  // a 1-pixel readback of the frame just drawn blocks until the GPU has finished it (gl.finish does not, in Chrome)
  const sync = () => { E.renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  await raf();
  const total = [], submit = [];
  sync();
  for (let i = 0; i < n + 8; i++) {
    const t0 = performance.now();
    E.render(0);
    const t1 = performance.now();
    sync();
    const t2 = performance.now();
    if (i >= 8) { total.push(t2 - t0); submit.push(t1 - t0); }
  }
  const s = total.slice().sort((a, b) => a - b);
  return { medianMs: r3(median(total)), p95Ms: r3(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]), submitMs: r3(median(submit)), frames: total.length, method: 'render + 1-pixel readback, back to back' };
}
let timeFrame = finishFrame;

const LIT = (m) => !!(m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial));

/** Does this material's fragment shader discard? (three's own alpha test, alpha to coverage, or our patches.) */
function discardsOf(m) {
  if (!m) return false;
  if (m.alphaTest > 0 || m.alphaToCoverage) return true;
  const audit = window.__calShaderPatchAudit;
  if (audit?.discards?.has(m)) return true;
  if ((m.isShaderMaterial || m.isRawShaderMaterial) && /\bdiscard\b/.test(m.fragmentShader || '')) return true;
  return false;
}
const isTransparent = (m) => !!(m && (m.transparent || m.blending === 2 /* AdditiveBlending */));

/** Every object the main camera draws, sorted into solid / alpha-tested / transparent. */
export function classify(E, scene) {
  const cam = E.camera;
  const out = { solid: [], alpha: [], transparent: [], materials: { alpha: new Map(), transparent: new Map() } };
  scene.traverseVisible((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.layers.test(cam.layers)) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    const cls = ms.some(isTransparent) ? 'transparent' : ms.some(discardsOf) ? 'alpha' : 'solid';
    out[cls].push(o);
    if (cls !== 'solid') {
      const key = `${o.name || o.type} :: ${ms.map((m) => m.name || m.type).join('+')}`;
      out.materials[cls].set(key, (out.materials[cls].get(key) || 0) + 1);
    }
  });
  return out;
}

const SOLID = 24, ALPHA = 25, TRANS = 26, EMPTY = 27;
export const ORDER = Object.freeze(['opaque', 'alpha-tested', 'transparent', 'shadows', 'gtao', 'bloom', 'smaa', 'hooks']);

export async function split(E, scene, { n = 40, rounds = 3 } = {}) {
  const sm = E.renderer.shadowMap, cam = E.camera, hooks = E.onAfterRender || [];
  const c = classify(E, scene);
  c.solid.forEach((o) => o.layers.enable(SOLID));
  c.alpha.forEach((o) => o.layers.enable(ALPHA));
  c.transparent.forEach((o) => o.layers.enable(TRANS));
  const keep = { mask: cam.layers.mask, smAuto: sm.autoUpdate, lights: (E.csm?.lights || []).map((l) => [l.shadow, l.shadow.autoUpdate]),
    gtao: E.gtao.enabled, bloom: E.bloom.enabled, smaa: E.smaa.enabled, hooks: hooks.slice(), smRender: sm.render };
  // the shadow pass always sees every caster (three tests casters against the camera's layers)
  sm.render = function (l, s, cm) { const k = cm.layers.mask; cm.layers.mask = keep.mask; try { keep.smRender.call(this, l, s, cm); } finally { cm.layers.mask = k; } };
  const apply = (on) => {
    let mask = 0;
    if (on.has('opaque')) mask |= 1 << SOLID;
    if (on.has('alpha-tested')) mask |= 1 << ALPHA;
    if (on.has('transparent')) mask |= 1 << TRANS;
    cam.layers.mask = mask || (1 << EMPTY);
    const sh = on.has('shadows');
    sm.autoUpdate = sh ? keep.smAuto : false; if (sh) sm.needsUpdate = true;
    keep.lights.forEach(([s0, au]) => { s0.autoUpdate = sh ? au : false; if (sh) s0.needsUpdate = true; });
    E.gtao.enabled = on.has('gtao') && keep.gtao; E.bloom.enabled = on.has('bloom') && keep.bloom; E.smaa.enabled = on.has('smaa') && keep.smaa;
    hooks.length = 0; if (on.has('hooks')) hooks.push(...keep.hooks);
  };
  const N = ORDER.length, fwd = Array.from({ length: N + 1 }, () => []);
  try {
    for (let r = 0; r < rounds; r++) {
      for (let k = 0; k <= N; k++) { apply(new Set(ORDER.slice(0, k))); await wait(4); fwd[k].push((await timeFrame(E, n)).medianMs); }
    }
  } finally {
    cam.layers.mask = keep.mask; sm.render = keep.smRender; sm.autoUpdate = keep.smAuto; sm.needsUpdate = true;
    keep.lights.forEach(([s0, au]) => { s0.autoUpdate = au; s0.needsUpdate = true; });
    E.gtao.enabled = keep.gtao; E.bloom.enabled = keep.bloom; E.smaa.enabled = keep.smaa;
    hooks.length = 0; hooks.push(...keep.hooks);
    c.solid.forEach((o) => o.layers.disable(SOLID)); c.alpha.forEach((o) => o.layers.disable(ALPHA)); c.transparent.forEach((o) => o.layers.disable(TRANS));
    await wait(4);
  }
  const F = fwd.map(median);
  const rows = { floor: r3(F[0]) };
  for (let k = 1; k <= N; k++) rows[ORDER[k - 1]] = F[k] != null && F[k - 1] != null ? r3(F[k] - F[k - 1]) : null;
  const post = (rows.floor || 0) + (rows.gtao || 0) + (rows.bloom || 0) + (rows.smaa || 0) + (rows.hooks || 0);
  return {
    method: `cumulative enabling (floor -> ${ORDER.join(' -> ')}), ${rounds} sweeps of ${n} timed frames, medians per step`,
    fullChainMs: r3(F[N]), stepsMs: F.map(r3), rows,
    grouped: { shadows: rows.shadows, opaque: rows.opaque, alphaTested: rows['alpha-tested'], transparent: rows.transparent, post: r3(post) },
    counts: { solid: c.solid.length, alphaTested: c.alpha.length, transparent: c.transparent.length },
    alphaTestedObjects: [...c.materials.alpha].map(([k, v]) => `${v} x ${k}`).slice(0, 30),
    transparentObjects: [...c.materials.transparent].map(([k, v]) => `${v} x ${k}`).slice(0, 30),
  };
}

/**
 * Shaded fragments per covered pixel for a class, counted in the stencil buffer of a render of this frame as the
 * game draws it (same order, same depth test; a discarded fragment does not count, an early-z rejected one does
 * not count). `which`: 'alpha' (alpha-tested only) or 'opaque' (solid and alpha-tested).
 */
export function overdraw(E, scene, which = 'alpha', { cap = 32 } = {}) {
  const R = E.renderer, cam = E.camera;
  const size = R.getDrawingBufferSize(new T.Vector2());
  const w = size.x, h = size.y;
  const rt = new T.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: true });
  const c = classify(E, scene);
  const counted = which === 'alpha' ? c.alpha : [...c.solid, ...c.alpha];
  const mats = new Set();
  counted.forEach((o) => (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)));
  const saved = [];
  for (const m of mats) {
    saved.push([m, m.stencilWrite, m.stencilFunc, m.stencilRef, m.stencilZPass, m.stencilZFail, m.stencilFail, m.stencilWriteMask, m.stencilFuncMask]);
    m.stencilWrite = true; m.stencilFunc = T.AlwaysStencilFunc; m.stencilRef = 0;
    m.stencilZPass = T.IncrementStencilOp; m.stencilZFail = T.KeepStencilOp; m.stencilFail = T.KeepStencilOp;
    m.stencilWriteMask = 0xff; m.stencilFuncMask = 0xff;
  }
  const quadMat = new T.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(1.0 / 255.0, 0.0, 0.0, 1.0); }',
    depthTest: false, depthWrite: false, transparent: true, blending: T.AdditiveBlending,
    stencilWrite: true, stencilFunc: T.LessEqualStencilFunc, stencilZPass: T.KeepStencilOp, stencilWriteMask: 0x00, stencilFuncMask: 0xff,
  });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), quadMat);
  quad.frustumCulled = false;
  const qScene = new T.Scene(); qScene.add(quad);
  const qCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prevTarget = R.getRenderTarget(), prevAuto = R.autoClear, prevClear = R.getClearColor(new T.Color()), prevAlpha = R.getClearAlpha();
  const buf = new Uint8Array(w * h * 4);
  try {
    R.setRenderTarget(rt);
    R.autoClear = false;
    R.setClearColor(0x000000, 0);
    R.clear(true, true, true);
    R.render(scene, cam);
    R.clear(true, false, false);            // colour only: keep the stencil counts
    for (let k = 1; k <= cap; k++) { quadMat.stencilRef = k; R.render(qScene, qCam); }
    R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  } finally {
    R.setRenderTarget(prevTarget); R.autoClear = prevAuto; R.setClearColor(prevClear, prevAlpha);
    for (const [m, a, b, c2, d, e, f, g, i] of saved) { m.stencilWrite = a; m.stencilFunc = b; m.stencilRef = c2; m.stencilZPass = d; m.stencilZFail = e; m.stencilFail = f; m.stencilWriteMask = g; m.stencilFuncMask = i; }
    rt.dispose(); quadMat.dispose(); quad.geometry.dispose();
  }
  let covered = 0, sum = 0, capped = 0;
  const hist = new Array(cap + 1).fill(0);
  for (let i = 0; i < w * h; i++) { const v = buf[i * 4]; hist[v]++; if (v > 0) { covered++; sum += v; if (v >= cap) capped++; } }
  return {
    class: which, objects: counted.length, materials: mats.size, pixels: w * h, coveredPixels: covered,
    coveredPct: r3(100 * covered / (w * h)), layersPerCoveredPixel: covered ? r3(sum / covered) : 0,
    layersPerScreenPixel: r3(sum / (w * h)), cappedPixels: capped, histogram: hist.map((v, k) => [k, v]).filter(([, v]) => v > 0),
  };
}

/** GPU ms with every lit material swapped for an unlit one (maps, alpha test, side, vertex colours kept). */
export async function unlitSwap(E, scene, { n = 60 } = {}) {
  const base = await timeFrame(E, n);
  const swaps = [], made = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const one = (m) => {
      if (!LIT(m)) return m;
      if (made.has(m)) return made.get(m);
      const u = new T.MeshBasicMaterial({ map: m.map || null, color: m.color || 0xffffff, alphaTest: m.alphaTest || 0,
        transparent: m.transparent, opacity: m.opacity, side: m.side, vertexColors: m.vertexColors, alphaMap: m.alphaMap || null,
        depthWrite: m.depthWrite, depthTest: m.depthTest, blending: m.blending });
      made.set(m, u);
      return u;
    };
    const mm = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    if (mm !== o.material) { swaps.push([o, o.material]); o.material = mm; }
  });
  let unlit;
  try {
    try { E.renderer.compile(scene, E.camera); } catch { /* compiled on first draw instead */ }
    await wait(20);
    unlit = await timeFrame(E, n);
  } finally {
    for (const [o, m] of swaps) o.material = m;
    for (const u of made.values()) u.dispose();
    await wait(6);
  }
  return { litMs: base.medianMs, unlitMs: unlit.medianMs, shadingMs: r3(base.medianMs - unlit.medianMs),
    shadingShare: base.medianMs ? r3((base.medianMs - unlit.medianMs) / base.medianMs) : null, swappedObjects: swaps.length, unlitMaterials: made.size };
}

/** GPU ms at full and at half resolution per axis (renderScale 0.5: a quarter of the pixels). */
export async function halfRes(E, { n = 60 } = {}) {
  const full = await timeFrame(E, n);
  const keep = E.renderScale;
  const fullBuf = E.renderer.getDrawingBufferSize(new T.Vector2()).toArray();
  let half, halfBuf = null;
  try {
    E.renderScale = keep * 0.5; E.resize(); await wait(10);
    halfBuf = E.renderer.getDrawingBufferSize(new T.Vector2()).toArray();
    half = await timeFrame(E, n);
  } finally {
    E.renderScale = keep; E.resize(); await wait(10);
  }
  // T = F + P (fixed + pixel-proportional); at a quarter of the pixels T' = F + P / 4
  const P = (full.medianMs - half.medianMs) * 4 / 3, F = full.medianMs - P;
  return { fullMs: full.medianMs, halfMs: half.medianMs, ratio: half.medianMs ? r3(full.medianMs / half.medianMs) : null,
    pixelProportionalMs: r3(P), fixedMs: r3(F), pixelShare: full.medianMs ? r3(P / full.medianMs) : null,
    fullBuffer: fullBuf, halfBuffer: halfBuf, halfScale: keep * 0.5 };
}

/** The main thread: engine perfSnapshot over n frames, frozen (as staged) and live (time running). */
export async function cpu(E, { n = 120 } = {}) {
  const snap = async () => { E.perfReset(); await wait(n + 4); const s = E.perfSnapshot(n);
    return s && { medianFrameMs: s.medianFrameMs, p95FrameMs: s.p95FrameMs, medianJsMs: s.medianJsMs, p95JsMs: s.p95JsMs,
      medianSimMs: s.medianSimMs, p95SimMs: s.p95SimMs, medianRenderSubmitMs: s.medianRenderMs, p95RenderSubmitMs: s.p95RenderMs, p95TailMs: s.p95TailMs,
      draws: s.medianDrawCalls, triangles: s.maxTriangles }; };
  const frozen = await snap();
  E.requestTimeScale('studio', null);
  let live;
  try { await wait(10); live = await snap(); } finally { E.requestTimeScale('studio', 0); await wait(4); }
  return { frozen, live };
}


/**
 * Paired skip-one: for each class, alternate "everything on" and "everything on but this class", `pairs` times,
 * `n` timed frames each, and take the median of the paired differences. Pairing cancels the slow drift of the
 * GPU clock that makes a one-way sweep wander by a few ms on an Apple GPU under vsync.
 */
export async function pairedSkip(E, scene, { n = 30, pairs = 8 } = {}) {
  const sm = E.renderer.shadowMap, cam = E.camera;
  const c = classify(E, scene);
  c.solid.forEach((o) => o.layers.enable(SOLID)); c.alpha.forEach((o) => o.layers.enable(ALPHA)); c.transparent.forEach((o) => o.layers.enable(TRANS));
  const keep = { mask: cam.layers.mask, smAuto: sm.autoUpdate, gtao: E.gtao.enabled, bloom: E.bloom.enabled, smaa: E.smaa.enabled, smRender: sm.render };
  sm.render = function (l, s, cm) { const k = cm.layers.mask; cm.layers.mask = keep.mask; try { keep.smRender.call(this, l, s, cm); } finally { cm.layers.mask = k; } };
  const ALL = (1 << SOLID) | (1 << ALPHA) | (1 << TRANS);
  const off = {
    shadows: [() => { sm.autoUpdate = false; sm.needsUpdate = false; }, () => { sm.autoUpdate = keep.smAuto; sm.needsUpdate = true; }],
    opaque: [() => { cam.layers.mask = ALL & ~(1 << SOLID); }, () => { cam.layers.mask = ALL; }],
    'alpha-tested': [() => { cam.layers.mask = ALL & ~(1 << ALPHA); }, () => { cam.layers.mask = ALL; }],
    transparent: [() => { cam.layers.mask = ALL & ~(1 << TRANS); }, () => { cam.layers.mask = ALL; }],
    post: [() => { E.gtao.enabled = false; E.bloom.enabled = false; E.smaa.enabled = false; }, () => { E.gtao.enabled = keep.gtao; E.bloom.enabled = keep.bloom; E.smaa.enabled = keep.smaa; }],
  };
  const rows = {}, all = [];
  try {
    cam.layers.mask = ALL;
    for (const [k, [down, up]] of Object.entries(off)) {
      const d = [];
      for (let i = 0; i < pairs; i++) {
        await wait(3); const on = (await timeFrame(E, n)).medianMs;
        down(); await wait(3); const without = (await timeFrame(E, n)).medianMs; up();
        if (on != null && without != null) { d.push(on - without); all.push(on); }
      }
      const sorted = d.slice().sort((a, b) => a - b);
      rows[k] = { ms: r3(median(d)), iqr: [r3(sorted[Math.floor(sorted.length * 0.25)]), r3(sorted[Math.floor(sorted.length * 0.75)])], pairs: d.length };
    }
  } finally {
    cam.layers.mask = keep.mask; sm.render = keep.smRender; sm.autoUpdate = keep.smAuto; sm.needsUpdate = true;
    E.gtao.enabled = keep.gtao; E.bloom.enabled = keep.bloom; E.smaa.enabled = keep.smaa;
    c.solid.forEach((o) => o.layers.disable(SOLID)); c.alpha.forEach((o) => o.layers.disable(ALPHA)); c.transparent.forEach((o) => o.layers.disable(TRANS));
    await wait(4);
  }
  return { method: `paired skip-one, ${pairs} pairs of ${n} timed frames per class, median of paired differences (IQR shown)`, fullMs: r3(median(all)), rows };
}

export async function attributeFrame(E, scene, { n = 40 } = {}) {
  E.enableGpuTimer(true);
  await wait(30);
  const info = { gpu: null, revision: null };
  try { const gl = E.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); info.gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; } catch { /* */ }
  info.revision = window.__calShaderPatchAudit?.report?.().revision ?? null;
  const t0 = performance.now();
  const whole = await wholeFrame(E, 90);                 // timer query under vsync (A21's method), for reference
  const finish = await finishFrame(E, 60);               // the work itself, GPU kept busy
  const sp = await split(E, scene, { n, rounds: 3 });
  const paired = await pairedSkip(E, scene, { n: 30, pairs: 8 });
  const odAlpha = overdraw(E, scene, 'alpha');
  const odOpaque = overdraw(E, scene, 'opaque');
  const un = await unlitSwap(E, scene, { n: 60 });
  const hr = await halfRes(E, { n: 60 });
  const c = await cpu(E, { n: 120 });
  return { info, whole, finish, split: sp, paired, overdraw: { alphaTested: odAlpha, opaqueAll: odOpaque }, unlit: un, halfRes: hr, cpu: c,
    seconds: Math.round((performance.now() - t0) / 1000) };
}


/* =====================================================================================================================
 * M2 WAVE 0, D1: THE REST OF THE FRAME, AND WHAT THE HOLDS MAY SPEND.
 *
 * M0.8 resolved only the opaque row and the floor; about 10 ms of each frame was "not attributed" and pointed at
 * geometry and vertex work. `attributeD1` splits the same back-to-back readback frame (finishFrame) along the axes that
 * M0.8 left open, each by a paired toggle (ABBA: on, off, off, on; the median of the pairs' differences):
 *
 *   census     per top-level scene child: objects, and the draws and triangles it adds to the frame (renderer.info with
 *              it hidden, main view and shadow maps together, and with only its casting off: the shadow share). Exact
 *              counts, no timing. The cascades' own draws and triangles the same way.
 *   owners     GPU ms of the costliest scene children (by draws and triangles), one at a time, and of everything else
 *              together; hidden from the view AND the shadow maps (visible = false), as the Holds would add to both.
 *   cascades   GPU ms of the shadow maps, all together and one cascade at a time (cascade 0 every frame, the far two on
 *              alternate frames: the tier's csmFarCadence 2).
 *   post       GTAO, bloom and SMAA together.
 *   tiny       the frame at 1/8 of the resolution per axis (1/64 of the pixels), with and without the shadow maps and
 *              with the main view empty: per-pixel work = full - tiny; main-view geometry (vertex + per-draw) = tiny
 *              without shadows - tiny with nothing in the view; the floor = the last (clears, the post chain's fixed
 *              cost, the present, the CPU's own submit).
 *   cpu        the main thread, frozen and live (perfSnapshot), Brea's cloth (its solver ring, reset at the window's
 *              start) and the people (their strand rings and how many are near), live for `liveFrames` frames.
 *   standIns   (optional) the Holds' fight load as stand-in geometry in front of the lens: one large hull, medium hulls,
 *              dwellings and walls at given triangle and draw counts (MeshStandardMaterial through the cascades, casting
 *              and receiving), each class toggled, and the whole set at full and at half triangles for the slope.
 *
 * Every timing is finishFrame's (render + 1-pixel readback, back to back: submit + GPU, never vsync-paced).
 * ===================================================================================================================== */

const topOf = (o, scene) => { let t = o; while (t.parent && t.parent !== scene) t = t.parent; return t; };

/** Draws and triangles of k consecutive frames, averaged (the far cascades alternate frame to frame). */
// (each render is synchronised by a 1-pixel readback and the task yields to the next animation frame: at e42cf7f the
//  census queued ~240 unsynchronised renders in one task and the page's renderer died, "Target closed")
const _px = new Uint8Array(4);
async function infoFrames(E, k = 2) {
  const gl = E.renderer.getContext();
  let c = 0, t = 0;
  for (let i = 0; i < k; i++) {
    E.render(0); const r = E.renderer.info.render; c += r.calls; t += r.triangles;
    E.renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
  }
  await raf();
  return { draws: c / k, tris: t / k };
}

/** A paired toggle, ABBA: the median of ((on1 + on2) - (off1 + off2)) / 2 over `pairs`. */
export async function pairedToggle(E, down, up, { n = 16, pairs = 3 } = {}) {
  const d = [], on = [];
  try {
    for (let i = 0; i < pairs; i++) {
      await wait(2); const a1 = (await timeFrame(E, n)).medianMs;
      down(); await wait(2);
      const b1 = (await timeFrame(E, n)).medianMs; const b2 = (await timeFrame(E, n)).medianMs;
      up(); await wait(2);
      const a2 = (await timeFrame(E, n)).medianMs;
      if ([a1, a2, b1, b2].every(Number.isFinite)) { d.push((a1 + a2 - b1 - b2) / 2); on.push(a1, a2); }
    }
  } finally { up(); }
  const s = d.slice().sort((a, b) => a - b);
  return { ms: r3(median(d)), iqr: [r3(s[Math.floor(s.length * 0.25)]), r3(s[Math.floor(s.length * 0.75)])], pairs: d.length, onMs: r3(median(on)) };
}

/** Per top-level child: objects, draws and triangles in the frame (view + shadow maps), and the shadow share. */
export async function census(E, scene) {
  const kids = scene.children.filter((c) => c.visible && !c.isLight && !c.isCamera && c.name !== 'CAL.attribSentinel');
  const all = await infoFrames(E, 2);
  // children that share a name are one row (hidden together)
  const byName = new Map();
  for (const c of kids) { const k = c.name || `(unnamed ${c.type})`; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(c); }
  const rows = [];
  for (const [name, cs] of byName) {
    let objects = 0, meshTris = 0;
    const casters = [];
    for (const c of cs) c.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      objects++;
      if (o.castShadow) casters.push(o);
      const g = o.geometry; if (!g || !o.isMesh) return;
      let n = g.index ? g.index.count : (g.attributes?.position?.count || 0);
      if (g.drawRange && Number.isFinite(g.drawRange.count)) n = Math.min(n, g.drawRange.count);
      meshTris += (n / 3) * (o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? (g.instanceCount ?? 1) : 1));
    });
    if (!objects) continue;
    cs.forEach((c) => { c.visible = false; });
    const hid = await infoFrames(E, 2);
    cs.forEach((c) => { c.visible = true; });
    casters.forEach((o) => { o.castShadow = false; });
    const noCast = await infoFrames(E, 2);
    casters.forEach((o) => { o.castShadow = true; });
    rows.push({ name, children: cs.length, objects, casters: casters.length, meshTris: Math.round(meshTris),
      draws: r3(all.draws - hid.draws), tris: Math.round(all.tris - hid.tris),
      shadowDraws: r3(all.draws - noCast.draws), shadowTris: Math.round(all.tris - noCast.tris) });
  }
  rows.sort((a, b) => (b.draws * 20000 + b.tris) - (a.draws * 20000 + a.tris));
  // the cascades: each alone (the others' maps not re-rendered)
  const sm = E.renderer.shadowMap, lights = E.csm?.lights || [];
  const smr = sm.render;
  const cascades = [];
  let allow = null;
  sm.render = function (ls, s, cm) { return smr.call(this, allow ? ls.filter(allow) : ls, s, cm); };
  try {
    allow = () => false; const none = await infoFrames(E, 2);
    for (let i = 0; i < lights.length; i++) { const l = lights[i]; allow = (x) => x === l; const one = await infoFrames(E, 2); cascades.push({ cascade: i, mapSize: l.shadow.mapSize.x, draws: r3(one.draws - none.draws), tris: Math.round(one.tris - none.tris) }); }
    allow = null;
    const sumKids = rows.reduce((a, r) => ({ draws: a.draws + r.draws, tris: a.tris + r.tris }), { draws: 0, tris: 0 });
    return { frame: { draws: r3(all.draws), tris: Math.round(all.tris) }, noShadowMaps: { draws: r3(none.draws), tris: Math.round(none.tris) },
      children: rows, cascades, sumChildren: { draws: r3(sumKids.draws), tris: Math.round(sumKids.tris) },
      note: 'draws and triangles per frame (view + shadow maps + post), averaged over 2 frames (the far cascades alternate)' };
  } finally { sm.render = smr; }
}

/** GPU ms of the costliest `top` scene children one at a time, and of the rest together (visible = false). */
export async function owners(E, scene, cen, { top = 6, n = 16, pairs = 3 } = {}) {
  const picked = cen.children.slice(0, top);
  const rows = [];
  const hide = (objs) => () => objs.forEach((o) => { o.visible = false; });
  const show = (objs) => () => objs.forEach((o) => { o.visible = true; });
  const pickedObjs = [];
  for (const r of picked) {
    const objs = scene.children.filter((c) => (c.name || `(unnamed ${c.type})`) === r.name && c.visible && !c.isLight);
    if (!objs.length) continue;
    pickedObjs.push(...objs);
    const t = await pairedToggle(E, hide(objs), show(objs), { n, pairs });
    rows.push({ name: r.name, draws: r.draws, tris: r.tris, shadowDraws: r.shadowDraws, shadowTris: r.shadowTris, ...t });
  }
  const rest = scene.children.filter((c) => c.visible && !c.isLight && !c.isCamera && !pickedObjs.includes(c) && c.name !== 'CAL.attribSentinel');
  const restCen = cen.children.filter((r) => !picked.includes(r));
  const t = await pairedToggle(E, hide(rest), show(rest), { n, pairs });
  rows.push({ name: '(all other children)', children: rest.length, draws: r3(restCen.reduce((a, r) => a + r.draws, 0)), tris: restCen.reduce((a, r) => a + r.tris, 0), ...t });
  const tAll = await pairedToggle(E, hide([...pickedObjs, ...rest]), show([...pickedObjs, ...rest]), { n, pairs });
  return { rows, everything: tAll, sumRowsMs: r3(rows.reduce((a, r) => a + (r.ms || 0), 0)) };
}

/** GPU ms of the shadow maps: all, then each cascade alone off. */
export async function cascades(E, { n = 16, pairs = 3 } = {}) {
  const sm = E.renderer.shadowMap, lights = E.csm?.lights || [];
  const smr = sm.render;
  let deny = null;
  sm.render = function (ls, s, cm) { return smr.call(this, deny ? ls.filter((l) => !deny(l)) : ls, s, cm); };
  try {
    const out = { all: await pairedToggle(E, () => { deny = () => true; }, () => { deny = null; }, { n, pairs }), each: [] };
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      out.each.push({ cascade: i, mapSize: l.shadow.mapSize.x, ...(await pairedToggle(E, () => { deny = (x) => x === l; }, () => { deny = null; }, { n, pairs })) });
    }
    out.cadence = E.tier?.csmFarCadence ?? null;
    return out;
  } finally { sm.render = smr; }
}

/** GPU ms of GTAO, bloom and SMAA together. */
export async function postToggle(E, { n = 16, pairs = 3 } = {}) {
  const keep = { gtao: E.gtao.enabled, bloom: E.bloom.enabled, smaa: E.smaa.enabled };
  return pairedToggle(E, () => { E.gtao.enabled = false; E.bloom.enabled = false; E.smaa.enabled = false; },
    () => { E.gtao.enabled = keep.gtao; E.bloom.enabled = keep.bloom; E.smaa.enabled = keep.smaa; }, { n, pairs });
}

/** The frame at 1/8 resolution per axis, with and without shadow maps and with the main view empty (3 interleaved rounds). */
export async function tiny(E, { n = 20, rounds = 3, scale = 0.125 } = {}) {
  const sm = E.renderer.shadowMap, cam = E.camera, smr = sm.render;
  const keepScale = E.renderScale, keepMask = cam.layers.mask;
  let noShadow = false;
  sm.render = function (ls, s, cm) { return smr.call(this, noShadow ? [] : ls, s, cm); };
  // the shadow pass still sees every caster when the view is emptied (three tests casters against the view's layers)
  const smr2 = sm.render;
  sm.render = function (ls, s, cm) { const k = cm.layers.mask; cm.layers.mask = keepMask; try { return smr2.call(this, ls, s, cm); } finally { cm.layers.mask = k; } };
  const S = { full: [], tiny: [], tinyNoShadow: [], tinyEmpty: [], tinyEmptyNoShadow: [] };
  const sub = { full: [], tiny: [], tinyNoShadow: [], tinyEmpty: [], tinyEmptyNoShadow: [] };
  let buf = null;
  try {
    for (let r = 0; r < rounds; r++) {
      E.renderScale = keepScale; E.resize(); await wait(6);
      let f = await timeFrame(E, n); S.full.push(f.medianMs); sub.full.push(f.submitMs);
      E.renderScale = keepScale * scale; E.resize(); await wait(6);
      buf = E.renderer.getDrawingBufferSize(new T.Vector2()).toArray();
      f = await timeFrame(E, n); S.tiny.push(f.medianMs); sub.tiny.push(f.submitMs);
      noShadow = true; await wait(2);
      f = await timeFrame(E, n); S.tinyNoShadow.push(f.medianMs); sub.tinyNoShadow.push(f.submitMs);
      cam.layers.mask = 1 << EMPTY; await wait(2);
      f = await timeFrame(E, n); S.tinyEmptyNoShadow.push(f.medianMs); sub.tinyEmptyNoShadow.push(f.submitMs);
      noShadow = false; await wait(2);
      f = await timeFrame(E, n); S.tinyEmpty.push(f.medianMs); sub.tinyEmpty.push(f.submitMs);
      cam.layers.mask = keepMask;
    }
  } finally {
    sm.render = smr; cam.layers.mask = keepMask; noShadow = false;
    E.renderScale = keepScale; E.resize(); await wait(10);
  }
  const m = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, r3(median(v))]));
  const ms = Object.fromEntries(Object.entries(sub).map(([k, v]) => [k, r3(median(v))]));
  return { scale, tinyBuffer: buf, medianMs: m, submitMs: ms,
    derived: {
      perPixelMs: r3(m.full - m.tiny),
      shadowMapsMs: r3(m.tiny - m.tinyNoShadow),
      shadowMapsEmptyViewMs: r3(m.tinyEmpty - m.tinyEmptyNoShadow),
      mainViewGeometryMs: r3(m.tinyNoShadow - m.tinyEmptyNoShadow),
      floorMs: m.tinyEmptyNoShadow,
      floorSubmitMs: ms.tinyEmptyNoShadow,
    },
    note: 'medians of interleaved rounds; at 1/64 of the pixels the fragment work is gone, so what is left is vertex, per-draw and fixed cost' };
}

/** The main thread frozen and live, Brea's cloth and the people (their solver rings reset at the live window's start). */
export async function cpuD1(E, ctx, { liveFrames = 180 } = {}) {
  const p = ctx.player;
  let rig = null;
  try { const M = await import('/src/entities/anim/cloth/rig.js'); rig = M.peekClothRig?.(p?.animator) || null; } catch { /* */ }
  const people = ctx.people?.list || [];
  const snap = async (n) => { E.perfReset(); await wait(n + 4); const s = E.perfSnapshot(n);
    return s && { medianFrameMs: r3(s.medianFrameMs), p95FrameMs: r3(s.p95FrameMs), medianJsMs: r3(s.medianJsMs), p95JsMs: r3(s.p95JsMs),
      medianSimMs: r3(s.medianSimMs), p95SimMs: r3(s.p95SimMs), medianSubmitMs: r3(s.medianRenderMs), p95SubmitMs: r3(s.p95RenderMs),
      draws: s.medianDrawCalls, triangles: s.maxTriangles }; };
  const frozen = await snap(60);
  if (rig?.sys) { rig.sys.ringN = 0; rig.sys.ringI = 0; }
  for (const q of people) if (q.chains?.strands?.sys) { q.chains.strands.sys.ringN = 0; q.chains.strands.sys.ringI = 0; }
  E.requestTimeScale('studio', null);
  let live, near = [];
  try {
    await wait(10);
    E.perfReset();
    for (let i = 0; i < liveFrames + 4; i++) { await raf(); if (i % 10 === 0) near.push(people.filter((q) => q.tier === 0).length); }
    const s = E.perfSnapshot(liveFrames);
    live = s && { medianFrameMs: r3(s.medianFrameMs), p95FrameMs: r3(s.p95FrameMs), medianJsMs: r3(s.medianJsMs), p95JsMs: r3(s.p95JsMs),
      medianSimMs: r3(s.medianSimMs), p95SimMs: r3(s.p95SimMs), medianSubmitMs: r3(s.medianRenderMs), p95SubmitMs: r3(s.p95RenderMs),
      draws: s.medianDrawCalls, triangles: s.maxTriangles };
  } finally { E.requestTimeScale('studio', 0); await wait(4); }
  const tm = (t) => t && { n: t.n, mean: r3(t.mean), p50: r3(t.p50), p95: r3(t.p95), max: r3(t.max) };
  const ppl = people.filter((q) => q.chains?.strands?.sys?.ringN > 0).map((q) => ({ id: q.id, tier: q.tier, d: r3(q.distance), timing: tm(q.chains.strands.sys.timing()) }));
  return { frozen, live, cloth: { rig: !!rig, timing: tm(rig?.sys?.timing?.()), pieces: rig?.pieces?.length ?? null, asleep: rig?.pieces?.filter((P) => P.asleep).length ?? null },
    people: { total: people.length, visible: people.filter((q) => q.group?.visible).length, nearMax: near.length ? Math.max(...near) : null,
      strandsMeanSumMs: r3(ppl.reduce((a, q) => a + (q.timing?.mean || 0), 0)), withStrands: ppl.length, rows: ppl.slice(0, 24) } };
}

/**
 * The Holds' fight load as stand-ins in front of the lens. `spec` (defaults: the M2 brief's fight frame):
 *   large  { n: 1, tris: 80000, draws: 12, size: 8, dist: 22 }
 *   medium { n: 3, tris: 50000, draws: 10, size: 4.5, dist: 16 }
 *   dwellings { n: 16, tris: 6000, draws: 4, size: 7, dist: [40, 90] }
 *   walls  { n: 9, tris: 1600, draws: 1, size: 3, dist: [30, 70] }
 * Each part is a UV sphere (indexed, its segments chosen for the triangle count), MeshStandardMaterial registered with
 * the cascades, casting and receiving, on the ground under it (terrain.getHeight). Returns the counts as drawn and
 * the GPU ms of each class and of the whole set, at full and at half triangles.
 */
export async function standIns(E, scene, ctx, spec = {}, { n = 16, pairs = 3 } = {}) {
  const S = {
    large: { n: 1, tris: 80000, draws: 12, size: 8, dist: 22, spread: 0 },
    medium: { n: 3, tris: 50000, draws: 10, size: 4.5, dist: 16, spread: 9 },
    dwellings: { n: 16, tris: 6000, draws: 4, size: 7, dist: [40, 90], spread: 70 },
    walls: { n: 9, tris: 1600, draws: 1, size: 3, dist: [30, 70], spread: 60 },
    ...spec,
  };
  const cam = E.camera;
  const fwd = new T.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new T.Vector3(-fwd.z, 0, fwd.x);
  const ground = (x, z) => { try { const h = ctx.terrain?.getHeight?.(x, z); if (Number.isFinite(h)) return h; } catch { /* */ } return cam.position.y - 1.7; };
  const sphere = (tris) => { const s = Math.max(3, Math.round(Math.sqrt(tris / 2))); return new T.SphereGeometry(1, s, s + 1); };
  const mats = [], geos = [], groups = {};
  const mk = (color) => { const m = new T.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.25 }); E.csmSetupMaterial?.(m); mats.push(m); return m; };
  const build = (key, cls, color, half) => {
    const g = new T.Group(); g.name = `D1-standin-${key}`;
    const per = Math.round((half ? cls.tris / 2 : cls.tris) / cls.draws);
    const geo = sphere(per); geos.push(geo);
    const mat = mk(color);
    for (let i = 0; i < cls.n; i++) {
      const d = Array.isArray(cls.dist) ? cls.dist[0] + (cls.dist[1] - cls.dist[0]) * ((i * 0.618) % 1) : cls.dist;
      const side = cls.n > 1 ? ((i / (cls.n - 1)) - 0.5) * cls.spread : 0;
      const x = cam.position.x + fwd.x * d + right.x * side, z = cam.position.z + fwd.z * d + right.z * side;
      const y = ground(x, z);
      for (let k = 0; k < cls.draws; k++) {
        const m = new T.Mesh(geo, mat);
        const a = (k / cls.draws) * Math.PI * 2;
        const r = cls.draws > 1 ? cls.size * 0.28 : 0;
        m.scale.set(cls.size * 0.35, cls.size * (key === 'walls' ? 0.5 : 0.3), cls.size * (key === 'walls' ? 1.6 : 0.35));
        m.position.set(x + Math.cos(a) * r, y + cls.size * 0.45 + (k % 3) * cls.size * 0.12, z + Math.sin(a) * r);
        m.castShadow = true; m.receiveShadow = true;
        m.userData.noSizeCull = true;
        g.add(m);
      }
    }
    return g;
  };
  const colors = { large: 0xb8a68a, medium: 0x9a8f7c, dwellings: 0xe8e2d4, walls: 0xcfc6b2 };
  const add = (half) => { const out = {}; for (const k of Object.keys(colors)) { out[k] = build(k, S[k], colors[k], half); scene.add(out[k]); } return out; };
  const remove = (gs) => { for (const g of Object.values(gs)) scene.remove(g); };
  const res = { spec: S, full: {}, half: {} };
  try {
    const before = await infoFrames(E, 2);
    Object.assign(groups, add(false));
    try { E.renderer.compile(scene, cam); } catch { /* compiled on first draw */ }
    await wait(20);
    const after = await infoFrames(E, 2);
    res.full.counts = { draws: r3(after.draws - before.draws), tris: Math.round(after.tris - before.tris) };
    const vis = (gs, v) => () => gs.forEach((g) => { g.visible = v; });
    for (const k of Object.keys(colors)) {
      res.full[k] = { ...(await pairedToggle(E, vis([groups[k]], false), vis([groups[k]], true), { n, pairs })) };
      groups[k].visible = false; const without = await infoFrames(E, 2); groups[k].visible = true;
      res.full[k].draws = r3(after.draws - without.draws); res.full[k].tris = Math.round(after.tris - without.tris);
    }
    const allG = Object.values(groups);
    res.full.all = await pairedToggle(E, vis(allG, false), vis(allG, true), { n, pairs });
    remove(groups);
    const halfG = add(true);
    try { E.renderer.compile(scene, cam); } catch { /* */ }
    await wait(10);
    const afterHalf = await infoFrames(E, 2);
    res.half.counts = { draws: r3(afterHalf.draws - before.draws), tris: Math.round(afterHalf.tris - before.tris) };
    res.half.all = await pairedToggle(E, vis(Object.values(halfG), false), vis(Object.values(halfG), true), { n, pairs });
    remove(halfG);
  } finally {
    for (const c of scene.children.slice()) if (/^D1-standin-/.test(c.name)) scene.remove(c);
    for (const m of mats) m.dispose();
    for (const g of geos) g.dispose();
    await wait(4);
  }
  return res;
}

export async function attributeD1(E, scene, ctx, { standIn = false, spec = {} } = {}) {
  E.enableGpuTimer(false);
  E.setDynamicResolution?.(false);
  await wait(30);
  const info = { gpu: null, renderScale: E.renderScale, tier: E.tierName ?? E.tier?.name ?? null, csmMapSizes: E.csmMapSizes, cadence: E.tier?.csmFarCadence ?? null };
  try { const gl = E.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); info.gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; } catch { /* */ }
  const t0 = performance.now();
  const step = (k) => console.log(`[d1] ${k} ${Math.round(performance.now() - t0)} ms`);
  step('finish');
  const finishA = await finishFrame(E, 60);
  step('census');
  const cen = await census(E, scene);
  step('owners');
  const own = await owners(E, scene, cen);
  step('cascades');
  const cas = await cascades(E);
  step('post');
  const post = await postToggle(E);
  step('tiny');
  const tn = await tiny(E);
  const finishB = await finishFrame(E, 60);
  step('standIns');
  const si = standIn ? await standIns(E, scene, ctx, spec) : null;
  step('cpu');
  const c = await cpuD1(E, ctx);
  step('done');
  return { probe: 'd1', info, finish: finishA, finishEnd: finishB, census: cen, owners: own, cascades: cas, post, tiny: tn, standIns: si, cpu: c,
    seconds: Math.round((performance.now() - t0) / 1000) };
}
