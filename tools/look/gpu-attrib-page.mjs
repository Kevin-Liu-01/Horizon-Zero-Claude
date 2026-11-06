/**
 * L-18 GPU ATTRIBUTION — the page half (lane look-post; docs/ROUND5-LOOK.md
 * L-18, §7 A-gpu-attrib). Imported by the gate A-gpu-attrib in the page
 * (`import('/tools/look/gpu-attrib-page.mjs')`); tools/look/gpu-attrib.mjs is
 * the node driver that runs the gate and turns its report into the §4.2 table.
 *
 * Per A21 scenario (vista, herd, staged fight from tools/budgets.mjs):
 *   frame      median GPU ms of composer.render (engine.enableGpuTimer: what A21 reads)
 *   passes     median ms per consecutive timer segment (engine.gpuAttrib): scene:pre,
 *              scene:shadow, scene:opaque, scene:transparent, gtao, bloom, grade, smaa,
 *              any other composer pass, and after:<hook> for each onAfterRender hook
 *   sum        the composer segments' per-frame sum (median) against `frame`: within 10 %
 *              (the after:* hooks are outside A21's timer and are reported beside it)
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

/** Per-pass medians over n frames (engine.gpuAttrib segments). */
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
    const pp = await perPass(E, frames);
    const within = frame.medianMs != null && pp.composerSumMs != null && Math.abs(pp.composerSumMs - frame.medianMs) <= 0.1 * frame.medianMs;
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
      frame, perPass: pp, sumWithin10: within,
      owners: rows, floorAllOwnersHiddenMs: floor.medianMs, interactionResidualMs: residual,
      unattributedChildren: unattributed.slice(0, 24),
      over05: rows.filter((r) => (r.marginalMs || 0) >= 0.5).map((r) => r.id),
    };
    try { if (typeof unpin === 'function') unpin(); } catch (e) { /* */ }
  }
  out.ok = true;
  return out;
}
