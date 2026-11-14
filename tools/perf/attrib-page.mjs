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
