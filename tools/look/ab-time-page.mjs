/**
 * L-16 LOOK LEDGER — the page half (lane look-post; docs/ROUND5-LOOK.md L-16,
 * §4.3, §4.6, §7 A-look-ledger). Imported by the gate A-look-ledger in the page;
 * tools/look/ab-time.mjs is the node driver (runs the gate, writes the §4.3 rows).
 *
 * The switches are engine.lookItems (engine.registerLookItem(id, { owner, estMs,
 * title, set(on), get() })): look-post registers L-01, L-02 and L-07; every
 * other owner registers its item when it lands. Per A21 scenario, for `rounds`
 * interleaved rounds (ON/OFF order alternating per round, the same clock state
 * as A-gpu-tier's instrument: engine.enableGpuTimer + perfSnapshot):
 *   - every item estimated >= 0.10 ms alone (all others left as they are)
 *   - the rest as ONE group (all switched together)
 * The row is the median over rounds of (ON median - OFF median). Recovery wins
 * are never registered here (they are A21 rows, §4.6 rule 2).
 */
import { wholeFrame } from './gpu-attrib-page.mjs';

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = async (n) => { for (let i = 0; i < n; i++) await raf(); };
const median = (a) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

export const ROW_CAP_MS = 0.45;
export const DRAW_CAP = 350;
/** A21's exit bars (ROUND5-LOOK §7 A-look-ledger): the frame median with every high item on, per scenario. */
export const A21_EXIT_BARS = Object.freeze({
  W1: Object.freeze({ vista: 17.0, herd: 20.0, 'staged-fight': 17.0 }),
  W2: Object.freeze({ vista: 14.0, herd: 14.0, 'staged-fight': 14.0 }),
});
export const RENDER_SCALE_MIN = 0.95;
export const RT_CAP_MB = 170;
export const VRAM_CAP_MB = 450;
/** QUALITY_TIERS.<tier>.look knob -> the look item it switches (ROUND5-LOOK §4.4; ids of §3). */
export const LOOK_KNOB_ITEMS = Object.freeze({
  agx: 'L-01', grade: 'L-02', lut: 'L-02', bloomRetune: 'L-07', skyIbl: 'L-04', aerial: 'L-05', shafts: 'L-08',
  cumulus: 'L-09', aoTint: 'L-12', contact: 'L-12', adaptation: 'L-13', dof: 'L-17', probe: 'W-08', strata: 'W-03',
  meadow: 'W-06', trees: 'W-10', stacks: 'W-04', sparkle: 'W-07', glints: 'W-09', farFieldStart: 'W-01', skin: 'C-01',
  heroShadow: 'C-07', vfx: 'P-04', uiBlur: 'U-18',
});
const knobOn = (v) => v != null && v !== false && v !== 0 && !(typeof v === 'object' && Object.values(v).every((x) => x === false || x === 0 || x == null));

/**
 * Bytes on the GPU with the look on, read in the page (A-look-ledger's last clause): the render-target ledger
 * (engine.renderTargetLedger, what A-rt-ledger reads) plus a scene walk of texture and geometry bytes (the
 * GL census of A-vram-ledger needs a hook installed before the context, which an in-page assert cannot have;
 * the walk is its lower bound, and A-vram-ledger itself runs on the same build with the look on by default).
 */
export function gpuBytes(E, scene) {
  const rt = E.renderTargetLedger();
  const seenT = new Set(), seenG = new Set();
  let tex = 0, geo = 0;
  const texBytes = (t) => {
    if (!t || seenT.has(t) || t.isRenderTargetTexture) return; seenT.add(t);
    const im = t.image; const w = im?.width || 0, h = im?.height || 0, d = im?.depth || 1;
    const bpp = t.type === 1016 || t.type === 1015 ? (t.type === 1015 ? 16 : 8) : 4;   // Half / Float RGBA, else 8-bit RGBA
    tex += w * h * d * bpp * (t.generateMipmaps !== false && t.minFilter !== 1006 && t.minFilter !== 1003 ? 4 / 3 : 1) * (t.isCubeTexture ? 6 : 1);
  };
  scene.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) for (const k in m) { const v = m[k]; if (v && v.isTexture) texBytes(v); }
    for (const m of ms) if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) texBytes(v); }
    const g = o.geometry;
    if (g && !seenG.has(g)) { seenG.add(g); for (const k in g.attributes) geo += g.attributes[k].array?.byteLength || 0; if (g.index) geo += g.index.array.byteLength; }
  });
  if (scene.environment?.isTexture) texBytes(scene.environment);
  const rtMB = rt.mb ?? rt.totalMB ?? null;
  return { rtMB, texMBWalk: +(tex / 1e6).toFixed(2), geoMBWalk: +(geo / 1e6).toFixed(2), sumMB: rtMB == null ? null : +(rtMB + tex / 1e6 + geo / 1e6).toFixed(2) };
}

export async function abTime({ ctx, scenarios, stage, rounds = 4, frames = 40, solo = 0.10, exit = 'W1', lowTier = true }) {
  const E = ctx.engine;
  if (!E?.lookItems) return { ok: false, error: 'engine.lookItems missing' };
  E.setDynamicResolution?.(false);
  const bars = A21_EXIT_BARS[exit] || A21_EXIT_BARS.W1;
  // which tier.look knobs the build actually READS while it renders (a knob read is an item that has landed)
  const knobsRead = new Set();
  const lookRow = E.tier.look;
  E.tier.look = new Proxy(lookRow, { get: (t, k) => { if (typeof k === 'string') knobsRead.add(k); return t[k]; }, set: (t, k, v) => { t[k] = v; return true; } });
  const items = [...E.lookItems.values()];
  // an item with a pass bench (its cost lives in one post pass) is A/B'd alone on that pass
  const benched = items.filter((i) => typeof i.bench === 'function');
  const framed = items.filter((i) => typeof i.bench !== 'function');
  const units = [
    ...framed.filter((i) => i.estMs >= solo).map((i) => ({ id: i.id, owner: i.owner, estMs: i.estMs, items: [i] })),
  ];
  const small = framed.filter((i) => i.estMs < solo);
  if (small.length) units.push({ id: 'group:<0.10 ms (' + small.map((i) => i.id).join(', ') + ')', owner: [...new Set(small.map((i) => i.owner))].join(', '), estMs: +small.reduce((a, i) => a + i.estMs, 0).toFixed(3), items: small });
  const out = { items: items.map((i) => ({ id: i.id, owner: i.owner, estMs: i.estMs, title: i.title, on: i.get() })), scenarios: {}, allRowsOk: true };
  for (const name of scenarios) {
    let unpin = null;
    try { unpin = await stage(name); } catch (e) { out.scenarios[name] = { error: String(e?.message || e) }; continue; }
    if (unpin && unpin.skip) { out.scenarios[name] = { skip: unpin.skip }; continue; }
    await wait(40);
    const rows = [];
    const base = await wholeFrame(E, frames);
    let maxDraws = base.maxDraws || 0;
    for (const u of units) {
      const was = u.items.map((i) => i.get());
      const deltas = [], ons = [], offs = [];
      for (let r = 0; r < rounds; r++) {
        const order = r % 2 ? [false, true] : [true, false];
        const got = {};
        for (const on of order) {
          u.items.forEach((i) => i.set(on));
          await wait(6);
          const m = await wholeFrame(E, frames);
          got[on] = m.medianMs;
          maxDraws = Math.max(maxDraws, m.maxDraws || 0);
        }
        ons.push(got.true); offs.push(got.false);
        if (got.true != null && got.false != null) deltas.push(got.true - got.false);
      }
      u.items.forEach((i, k) => i.set(was[k]));
      await wait(4);
      const d = median(deltas);
      const ok = d != null && d <= ROW_CAP_MS;
      if (!ok) out.allRowsOk = false;
      rows.push({ id: u.id, owner: u.owner, estMs: u.estMs, method: 'whole frame (A21 instrument)', deltaMs: r3(d), onMs: r3(median(ons)), offMs: r3(median(offs)), rounds: deltas.length, ok });
    }
    for (const i of benched) {
      const was = i.get();
      const ons = [], offs = [], deltas = [];
      for (let r = 0; r < rounds; r++) {
        const order = r % 2 ? [false, true] : [true, false];
        const got = {};
        for (const on of order) { i.set(on); await wait(2); got[on] = i.bench(); }
        ons.push(got.true); offs.push(got.false); deltas.push(got.true - got.false);
      }
      i.set(was);
      await wait(2);
      const d = median(deltas);
      const ok = d != null && d <= ROW_CAP_MS;
      if (!ok) out.allRowsOk = false;
      rows.push({ id: i.id, owner: i.owner, estMs: i.estMs, method: 'pass bench (engine.benchPass, ms per pass)', deltaMs: r3(d), onMs: r3(median(ons)), offMs: r3(median(offs)), rounds: deltas.length, ok });
    }
    const drawsOk = maxDraws <= DRAW_CAP;
    if (!drawsOk) out.allRowsOk = false;
    // A21's exit bar with every high item on (the base frame), and the shipped-mode render scale (DRS on, as play)
    const bar = bars[name];
    const a21Ok = bar != null && base.medianMs != null && base.medianMs <= bar;
    // (?shot=1 boots with opts.dynamicResolution false: shipped mode is restored for this read only)
    const od = E.opts.dynamicResolution; E.opts.dynamicResolution = true;
    E.setDynamicResolution?.(true);
    await wait(90);
    const scales = []; for (let k = 0; k < 120; k++) { await raf(); scales.push(E.renderScale); }
    E.opts.dynamicResolution = od;
    E.setDynamicResolution?.(false);
    await wait(6);
    const scaleMed = median(scales);
    const scaleOk = scaleMed != null && scaleMed >= RENDER_SCALE_MIN;
    // the look's own draws: every post item on vs every post item off (0 outside the post passes)
    const postItems = benched;
    const wasP = postItems.map((i) => i.get());
    postItems.forEach((i) => i.set(true)); await wait(4); const dOn = await wholeFrame(E, 12);
    postItems.forEach((i) => i.set(false)); await wait(4); const dOff = await wholeFrame(E, 12);
    postItems.forEach((i, k) => i.set(wasP[k])); await wait(4);
    const lookDraws = dOn.medianDraws != null && dOff.medianDraws != null ? dOn.medianDraws - dOff.medianDraws : null;
    const lookDrawsOk = lookDraws != null && lookDraws <= 0;
    const mem = gpuBytes(E, ctx.scene);
    const memOk = mem.rtMB != null && mem.rtMB <= RT_CAP_MB && mem.sumMB <= VRAM_CAP_MB;
    if (!a21Ok || !scaleOk || !lookDrawsOk || !memOk) out.allRowsOk = false;
    out.scenarios[name] = { frameMedianMs: base.medianMs, a21Bar: { exit, barMs: bar ?? null, ok: a21Ok }, shippedRenderScale: { median: scaleMed, min: Math.min(...scales), bar: RENDER_SCALE_MIN, ok: scaleOk },
      rows, maxDraws, drawsOk, lookDrawsOutsidePost: { postOnMinusOff: lookDraws, ok: lookDrawsOk }, gpuMemoryWithLookOn: { ...mem, rtCapMB: RT_CAP_MB, vramCapMB: VRAM_CAP_MB, ok: memOk } };
    try { if (typeof unpin === 'function') unpin(); } catch (e) { /* */ }
  }
  E.tier.look = lookRow;
  // every item enabled on high has a ledger row (R66 h): a knob the build reads whose item registered no switch fails
  const registered = new Set(items.map((i) => i.id));
  const knobs = Object.entries(lookRow).filter(([, v]) => knobOn(v)).map(([k]) => ({ knob: k, item: LOOK_KNOB_ITEMS[k] || '?', read: knobsRead.has(k), registered: registered.has(LOOK_KNOB_ITEMS[k]) }));
  const unledgered = knobs.filter((k) => k.read && !k.registered);
  out.everyEnabledItemHasRow = { ok: unledgered.length === 0, unledgered, notLanded: knobs.filter((k) => !k.read && !k.registered).map((k) => k.knob + ' (' + k.item + ')'),
    note: 'a knob the build reads while rendering is an item that has landed; an enabled, landed item with no registered switch has no ledger row (R66 h: it must be off on high)' };
  if (!out.everyEnabledItemHasRow.ok) out.allRowsOk = false;
  // the low tier: the same A21 bars with low's items on (the frame only; low's items are timed on high's switches)
  if (lowTier) {
    const q0 = E.quality;
    E.setQuality('low');
    await wait(10);
    out.lowTier = {};
    for (const name of scenarios) {
      let unpin = null;
      try { unpin = await stage(name); } catch (e) { out.lowTier[name] = { error: String(e?.message || e) }; continue; }
      if (unpin && unpin.skip) { out.lowTier[name] = { skip: unpin.skip }; continue; }
      await wait(30);
      const f = await wholeFrame(E, frames);
      const bar = bars[name];
      const ok = bar != null && f.medianMs != null && f.medianMs <= bar;
      if (!ok) out.allRowsOk = false;
      out.lowTier[name] = { frameMedianMs: f.medianMs, barMs: bar ?? null, ok };
      try { if (typeof unpin === 'function') unpin(); } catch (e) { /* */ }
    }
    E.setQuality(q0);
    await wait(6);
  }
  out.deviations = ['post items (registered with a bench: L-01, L-02, L-07) are A/B-timed on their own pass with engine.benchPass (readback fences), not on A21 frames: on ANGLE/Metal a whole-frame A/B at 18-20 ms frames is +-1-3 ms of noise (r3: the same look group read +2.87 / +1.60 / +0.15 ms). ROUND5-LOOK §7 says "every ledger row <= 0.45 ms on A21 frames": the orchestrator rules whether the pass bench stands for it'];
  out.ok = true;
  return out;
}
