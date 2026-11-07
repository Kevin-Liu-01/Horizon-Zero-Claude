/**
 * L-18 GPU ATTRIBUTION — the page half (lane look-post; docs/ROUND5-LOOK.md
 * L-18, §7 A-gpu-attrib). Imported by the gate A-gpu-attrib in the page
 * (`import('/tools/look/gpu-attrib-page.mjs')`); tools/look/gpu-attrib.mjs is
 * the node driver that runs the gate and turns its report into the §4.2 table.
 *
 * Per A21 scenario (vista, herd, staged fight from tools/budgets.mjs):
 *   frame      median GPU ms of composer.render (engine.enableGpuTimer: what A21 reads)
 *   passes     skip-one marginals on the whole-frame timer (perPassSkip): shadow maps, GTAO, bloom,
 *              SMAA, the grade's LUT stage, transparent + additive meshes; remainder = the opaque scene
 *              and the output pass's AgX; the raw segment timers (engine.gpuAttrib) are reported beside
 *              them but are not usable on ANGLE/Metal
 *   sum        interaction test: all of them off at once removes the sum of the rows within 10 % of the frame
 *   owners     hide-one marginals per draw owner (gates-perf's DRAW_OWNERS: scene children by
 *              name), the all-hidden floor, and the interaction residual
 *              (frame - floor - sum of marginals); no sum rule (Apple GPUs cannot attribute by
 *              owner inside a pass)
 */
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = async (n) => { for (let i = 0; i < n; i++) await raf(); };
const median = (a) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

/** Median whole-frame GPU ms over n frames (composer.render, as A21 times it). */
export async function wholeFrame(E, n = 60) {
  E.enableGpuTimer(true);
  await wait(4);
  E.perfReset();
  await wait(n + 8);
  const s = E.perfSnapshot(n);
  return { medianMs: s?.medianGpuMs ?? null, p95Ms: s?.p95GpuMs ?? null, gpuFrames: s?.gpuFrames ?? 0, medianDraws: s?.medianDrawCalls ?? null, maxDraws: s?.maxDrawCalls ?? null, renderScale: s?.renderScale ?? null };
}

/**
 * Per-pass rows as SKIP-ONE marginals on the whole-frame timer (the instrument A21 reads): each
 * skippable pass is switched off in turn (shadow maps, GTAO, bloom, SMAA, the grade's LUT stage, the
 * transparent and additive meshes) and its row is the frame median it removes. `remainder` = frame -
 * sum of rows = the opaque scene, the output pass's AgX and the frame's fixed costs. The sum check is
 * the interaction test: everything off at once must remove the sum of the rows within 10 % of the frame.
 * (Segment timer queries, perPass() below, read 95-160 ms for the opaque segment and 0 for the grade and
 * SMAA on ANGLE/Metal even with a flush between segments: the per-query times are not usable there.)
 */
export async function perPassSkip(E, scene, n = 40) {
  const sm = E.renderer.shadowMap;
  const transparent = [];
  scene.traverse((o) => { const m = o.material; if (o.visible && (o.isMesh || o.isPoints || o.isLine) && m && !Array.isArray(m) && (m.transparent || m.blending === 2)) transparent.push(o); });
  const TOGGLES = [
    ['shadow maps', () => { const a = sm.autoUpdate; sm.autoUpdate = false; sm.needsUpdate = false; return () => { sm.autoUpdate = a; sm.needsUpdate = true; }; }],
    ['gtao', () => { const a = E.gtao.enabled; E.gtao.enabled = false; return () => { E.gtao.enabled = a; }; }],
    ['bloom', () => { const a = E.bloom.enabled; E.bloom.enabled = false; return () => { E.bloom.enabled = a; }; }],
    ['smaa', () => { const a = E.smaa.enabled; E.smaa.enabled = false; return () => { E.smaa.enabled = a; }; }],
    ['grade LUT + dither', () => { const g = E.look.gradeMix; E.look.set({ gradeMix: 0 }); return () => { E.look.set({ gradeMix: g }); }; }],
    ['transparent + additive (' + transparent.length + ' meshes)', () => { transparent.forEach((o) => { o.visible = false; }); return () => { transparent.forEach((o) => { o.visible = true; }); }; }],
  ];
  const base = await wholeFrame(E, n);
  const rows = {};
  let sum = 0;
  for (const [k, on] of TOGGLES) {
    const undo = on();
    await wait(4);
    const m = await wholeFrame(E, n);
    undo();
    await wait(4);
    rows[k] = base.medianMs != null && m.medianMs != null ? r3(base.medianMs - m.medianMs) : null;
    sum += rows[k] || 0;
  }
  const undos = TOGGLES.map(([, on]) => on());
  await wait(4);
  const allOff = await wholeFrame(E, n);
  for (let i = undos.length - 1; i >= 0; i--) undos[i]();
  await wait(4);
  const removed = base.medianMs != null && allOff.medianMs != null ? base.medianMs - allOff.medianMs : null;
  return { method: 'skip-one marginals on the whole-frame timer', frameMs: base.medianMs, rows, sumRowsMs: r3(sum), remainderMs: base.medianMs != null ? r3(base.medianMs - sum) : null,
    allOffFrameMs: allOff.medianMs, allOffRemovesMs: r3(removed),
    sumWithin10: removed != null && base.medianMs != null && Math.abs(sum - removed) <= 0.1 * base.medianMs };
}

/** Per-pass medians over n frames (engine.gpuAttrib segments; reported raw, see perPassSkip). */
export async function perPass(E, n = 60) {
  E.gpuAttrib(true);
  await wait(8);
  E.gpuAttribTake();
  await wait(n + 10);
  const rows = E.gpuAttribTake();
  E.gpuAttrib(false);
  const labels = new Set();
  rows.forEach((r) => Object.keys(r.seg).forEach((k) => labels.add(k)));
  const passes = {};
  for (const l of [...labels].sort()) passes[l] = r3(median(rows.map((r) => r.seg[l] || 0)));
  const composerSum = median(rows.map((r) => Object.entries(r.seg).filter(([k]) => !k.startsWith('after:')).reduce((a, [, v]) => a + v, 0)));
  const allSum = median(rows.map((r) => Object.values(r.seg).reduce((a, v) => a + v, 0)));
  return { frames: rows.length, passes, composerSumMs: r3(composerSum), withHooksSumMs: r3(allSum) };
}

export async function attribute({ ctx, scenarios, stage, owners, frames = 60 }) {
  const E = ctx.engine;
  if (typeof E?.gpuAttrib !== 'function') return { ok: false, error: 'engine.gpuAttrib missing' };
  const gl = E.renderer.getContext();
  if (!gl.getExtension('EXT_disjoint_timer_query_webgl2')) return { ok: false, error: 'EXT_disjoint_timer_query_webgl2 unavailable' };
  E.setDynamicResolution?.(false);
  const out = { scenarios: {}, sumWithin10: true, note: 'A21\'s timer (engine.enableGpuTimer) wraps composer.render only; the after:* hooks (world-sky shafts after the composer, overlays) are outside it' };
  for (const name of scenarios) {
    let unpin = null;
    try { unpin = await stage(name); } catch (e) { out.scenarios[name] = { error: String(e?.message || e) }; continue; }
    if (unpin && unpin.skip) { out.scenarios[name] = { skip: unpin.skip }; continue; }
    await wait(40);
    const frame = await wholeFrame(E, frames);
    const skip = await perPassSkip(E, ctx.scene, frames);
    const pp = await perPass(E, Math.round(frames / 2));
    const within = skip.sumWithin10;
    if (!within) out.sumWithin10 = false;
    // owners: hide one at a time, then all
    const kids = ctx.scene.children;
    const rows = [];
    const allHide = [];
    for (const o of owners) {
      const re = new RegExp(o.re, o.flags);
      const hide = kids.filter((c) => c.visible && !c.isLight && re.test(c.name || ''));
      if (!hide.length) { rows.push({ id: o.id, lanes: o.lanes, children: 0, marginalMs: 0 }); continue; }
      hide.forEach((c) => { c.visible = false; });
      await wait(6);
      const h = await wholeFrame(E, Math.round(frames / 2));
      hide.forEach((c) => { c.visible = true; });
      allHide.push(...hide);
      rows.push({ id: o.id, lanes: o.lanes, children: hide.length, names: [...new Set(hide.map((c) => c.name))].slice(0, 6),
        hiddenMs: h.medianMs, marginalMs: frame.medianMs != null && h.medianMs != null ? r3(frame.medianMs - h.medianMs) : null });
    }
    const unattributed = kids.filter((c) => c.visible && !c.isLight && !allHide.includes(c)).map((c) => c.name || '(unnamed ' + c.type + ')');
    allHide.forEach((c) => { c.visible = false; });
    await wait(6);
    const floor = await wholeFrame(E, Math.round(frames / 2));
    allHide.forEach((c) => { c.visible = true; });
    const sumMarg = rows.reduce((a, r) => a + (r.marginalMs || 0), 0);
    const residual = frame.medianMs != null && floor.medianMs != null ? r3(frame.medianMs - floor.medianMs - sumMarg) : null;
    rows.sort((a, b) => (b.marginalMs || 0) - (a.marginalMs || 0));
    out.scenarios[name] = {
      frame, perPass: skip, segmentTimersRaw: pp, sumWithin10: within,
      owners: rows, floorAllOwnersHiddenMs: floor.medianMs, interactionResidualMs: residual,
      unattributedChildren: unattributed.slice(0, 24),
      over05: rows.filter((r) => (r.marginalMs || 0) >= 0.5).map((r) => r.id),
    };
    try { if (typeof unpin === 'function') unpin(); } catch (e) { /* */ }
  }
  out.ok = true;
  return out;
}
