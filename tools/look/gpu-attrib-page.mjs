/**
 * L-18 GPU ATTRIBUTION — the page half (lane look-post; docs/ROUND5-LOOK.md
 * L-18, §7 A-gpu-attrib). Imported by the gate A-gpu-attrib in the page
 * (`import('/tools/look/gpu-attrib-page.mjs')`); tools/look/gpu-attrib.mjs is
 * the node driver that runs the gate and turns its report into the §4.2 table.
 *
 * Per A21 scenario (vista, herd, staged fight from tools/budgets.mjs):
 *   frame      median GPU ms of composer.render (engine.enableGpuTimer: what A21 reads)
 *   passes     every row measured (perPassSkip): shadow cascades, opaque, transparent + additive, GTAO,
 *              bloom, SMAA, shafts, overlay (skip-one marginals on the whole-frame timer) and the grade (its
 *              pass bench); the raw segment timers (engine.gpuAttrib) are reported beside them but are not
 *              usable on ANGLE/Metal
 *   sum        the rows sum to the frame median within 10 % (no remainder row)
 *   owners     each row >= 0.5 ms names its fix owner from ROUND5-LOOK §4.2 (FIX_OWNERS_42) or fails
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
 * ROUND5-LOOK §4.2 fix owners. Every row >= 0.5 ms must name one (A-gpu-attrib); a pass or owner with no
 * §4.2 row is reported `fixOwner: null` and fails that clause until the orchestrator adds the row.
 */
export const FIX_OWNERS_42 = Object.freeze({
  'shadow cascades': 'world-ground (W-01 caster cascades, §4.2 row 2) + instruments-a (I-04 LOD1 casters, row 4)',
  'opaque scene': 'world-ground (W-01 terrain chunks + LOD, far field, §4.2 row 2); world-sky (L-10 sky last, row 3)',
  'transparent + additive': 'named by L-18 (§4.2 row 7: additive lamp-beam overdraw -> instruments-a)',
  gtao: 'named by L-18 (§4.2 row 7: GTAO at herd density -> the G-post holder, world-sky in W2)',
  shafts: 'world-sky (L-08 shaft pass re-cast, §4.2 row 5)',
  // no §4.2 row (yet): bloom, smaa, grade (output pass), overlay
});
/** DRAW_OWNERS lanes -> §4.2 rows (per-owner hide-one rows). */
export const FIX_OWNER_LANES_42 = Object.freeze([
  [/world-ground|terrain/i, 'world-ground (W-01, §4.2 row 2)'],
  [/instruments|machines|kind/i, 'instruments-a (I-04, §4.2 row 4; herd candidates row 7)'],
  [/world-sky|sky/i, 'world-sky (L-10 / L-15, §4.2 rows 3 and 6)'],
]);
export function fixOwnerFor(row, lanes = '') {
  if (FIX_OWNERS_42[row]) return FIX_OWNERS_42[row];
  for (const [re, who] of FIX_OWNER_LANES_42) if (re.test(row) || re.test(lanes)) return who;
  return null;
}

/**
 * Per-pass rows (ROUND5-LOOK §7 A-gpu-attrib: shadow cascades, opaque, additive, GTAO, bloom, SMAA, shafts,
 * grade, overlay), each MEASURED (no row is a remainder), and their sum against the frame median within 10 %:
 *   - skip-one marginals on the whole-frame timer A21 reads: shadow cascades (shadow maps not re-rendered),
 *     opaque scene (the view draws only the transparent and additive meshes, through a spare layer, while the
 *     shadow pass still sees every caster), transparent + additive, GTAO, bloom, SMAA, shafts and overlay (the
 *     onAfterRender hooks: outside A21's timer, which wraps composer.render, so they read ~0 there and are
 *     also reported on their own);
 *   - the grade (the output pass: AgX + LUT + the bloom/AO fold) by engine.benchPass, because the output pass
 *     cannot be skipped without changing what bloom and GTAO do (the fold).
 * Fixed costs (clears, the present) belong to no row: they are what the 10 % allows.
 * (Segment timer queries, perPass() below, read 95-160 ms for the opaque segment and 0 for the grade and
 * SMAA on ANGLE/Metal even with a flush between segments: the per-query times are not usable there.)
 */
export async function perPassSkip(E, scene, n = 40) {
  const sm = E.renderer.shadowMap, cam = E.camera;
  const transparent = [];
  scene.traverse((o) => { const m = o.material; if (o.visible && (o.isMesh || o.isPoints || o.isLine || o.isSprite) && m && (Array.isArray(m) ? m.some((x) => x.transparent || x.blending === 2) : (m.transparent || m.blending === 2))) transparent.push(o); });
  const SPARE = 28;
  const hooks = E.onAfterRender || [];
  const isShaft = (h) => /shaft|crepus|godray/i.test(h.name || '');
  const TOGGLES = [
    ['shadow cascades', () => { const a = sm.autoUpdate; sm.autoUpdate = false; sm.needsUpdate = false; const ls = []; E.csm?.lights?.forEach((l) => { ls.push([l.shadow, l.shadow.autoUpdate]); l.shadow.autoUpdate = false; l.shadow.needsUpdate = false; });
      return () => { sm.autoUpdate = a; sm.needsUpdate = true; ls.forEach(([sh, au]) => { sh.autoUpdate = au; sh.needsUpdate = true; }); }; }],
    ['opaque scene', () => {
      transparent.forEach((o) => o.layers.enable(SPARE));
      const keep = cam.layers.mask;
      const inner = sm.render;
      sm.render = function (l, s, c) { const k = c.layers.mask; c.layers.mask = keep; try { inner.call(this, l, s, c); } finally { c.layers.mask = k; } };
      cam.layers.mask = 1 << SPARE;
      return () => { cam.layers.mask = keep; sm.render = inner; transparent.forEach((o) => o.layers.disable(SPARE)); };
    }],
    ['transparent + additive', () => { transparent.forEach((o) => { o.visible = false; }); return () => { transparent.forEach((o) => { o.visible = true; }); }; }],
    ['gtao', () => { const a = E.gtao.enabled; E.gtao.enabled = false; return () => { E.gtao.enabled = a; }; }],
    ['bloom', () => { const a = E.bloom.enabled; E.bloom.enabled = false; return () => { E.bloom.enabled = a; }; }],
    ['smaa', () => { const a = E.smaa.enabled; E.smaa.enabled = false; return () => { E.smaa.enabled = a; }; }],
    ['shafts', () => { const kept = hooks.filter(isShaft); kept.forEach((h) => hooks.splice(hooks.indexOf(h), 1)); return () => { kept.forEach((h) => hooks.push(h)); }; }],
    ['overlay', () => { const kept = hooks.filter((h) => !isShaft(h)); kept.forEach((h) => hooks.splice(hooks.indexOf(h), 1)); return () => { kept.forEach((h) => hooks.push(h)); }; }],
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
  // the grade: the output pass on its own (pass bench, ms per pass)
  let grade = null;
  try { E.benchPass(E.grade, 20); grade = r3(E.benchPass(E.grade, 60)); } catch (e) { grade = null; }
  rows.grade = grade;
  sum += grade || 0;
  const all = [...TOGGLES.map(([k]) => k), 'grade'].map((k) => ({ row: k, ms: rows[k], fixOwner: fixOwnerFor(k) }));
  const over = all.filter((r) => (r.ms || 0) >= 0.5);
  return { method: 'every row measured: skip-one marginals on the whole-frame timer; the grade by its pass bench', frameMs: base.medianMs, rows, table: all,
    hooks: hooks.map((h) => h.name || '(anon)'), transparentMeshes: transparent.length,
    sumRowsMs: r3(sum), gapMs: base.medianMs != null ? r3(base.medianMs - sum) : null,
    sumWithin10: base.medianMs != null && Math.abs(sum - base.medianMs) <= 0.1 * base.medianMs,
    rowsOver05WithoutFixOwner: over.filter((r) => !r.fixOwner).map((r) => r.row) };
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
  const out = { scenarios: {}, sumWithin10: true, everyRowOver05HasFixOwner: true, note: 'A21\'s timer (engine.enableGpuTimer) wraps composer.render only; the after:* hooks (world-sky shafts after the composer, overlays) are outside it' };
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
    if (skip.rowsOver05WithoutFixOwner.length) out.everyRowOver05HasFixOwner = false;
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
      over05: rows.filter((r) => (r.marginalMs || 0) >= 0.5).map((r) => ({ id: r.id, ms: r.marginalMs, fixOwner: fixOwnerFor(r.id, String(r.lanes || '')) })),
    };
    if (out.scenarios[name].over05.some((r) => !r.fixOwner)) out.everyRowOver05HasFixOwner = false;
    try { if (typeof unpin === 'function') unpin(); } catch (e) { /* */ }
  }
  out.ok = true;
  return out;
}
