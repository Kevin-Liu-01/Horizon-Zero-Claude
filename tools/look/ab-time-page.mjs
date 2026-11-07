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

export async function abTime({ ctx, scenarios, stage, rounds = 4, frames = 40, solo = 0.10 }) {
  const E = ctx.engine;
  if (!E?.lookItems) return { ok: false, error: 'engine.lookItems missing' };
  E.setDynamicResolution?.(false);
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
    out.scenarios[name] = { frameMedianMs: base.medianMs, rows, maxDraws, drawsOk };
    try { if (typeof unpin === 'function') unpin(); } catch (e) { /* */ }
  }
  out.ok = true;
  return out;
}
