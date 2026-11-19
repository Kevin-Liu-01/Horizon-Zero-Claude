/**
 * M2 WAVE 0, D1: THE HOLDS' BUDGET, read from one `tools/perf/attrib.mjs --probe d1` run (no Chrome).
 *
 *   node tools/perf/holds-budget.mjs <attrib.json> [--fight F25] [--bar 14] [--headroom 0.5]
 *        [--draw-cap 350] [--tri-cap 6500000] [--strip <regex>] [--json <out.json>]
 *
 * Per frame: the back-to-back frame (submit + GPU, finishFrame; the median of the run's first and last reading), its
 * draws and triangles (view + shadow maps + post), and two splits that each sum to the frame by construction:
 *   by resolution  per-pixel work | shadow maps | main-view geometry (vertex + per draw) | floor   (attrib-page `tiny`)
 *   by owner       the costliest scene children one at a time, everything else, and the floor (nothing drawn)
 *
 * The fight frame's budget (default F25, the dyke fight): the frame without the scene children the Holds' fight frame
 * does not have (--strip: the slice's own Instruments and Saltrow's town and people; their own paired GPU ms, draws and
 * triangles are taken off) is the BASE; what the bar leaves above it, less --headroom (the run-to-run spread the bar
 * must survive), is the Holds' GPU budget. The stand-ins (attrib-page `standIns`: one large hull, medium hulls, 16
 * dwellings, nine walls, at their caps and at half triangles) give what that load costs on this machine; the triangle
 * level that fits is read off the line through the half and full points. Draws and triangles left are the HG10 caps
 * (350, 6.5 M) less the base's.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FILE = args.find((a) => a.endsWith('.json') && args[args.indexOf(a) - 1] !== '--json');
if (!FILE) { console.error('usage: node tools/perf/holds-budget.mjs <attrib.json> [--fight F25] [--bar 14] [--headroom 0.5]'); process.exit(2); }
const FIGHT = flag('--fight', 'F25');
const BAR = Number(flag('--bar', 14));
const HEAD = Number(flag('--headroom', 0.5));
const DRAW_CAP = Number(flag('--draw-cap', 350));
const TRI_CAP = Number(flag('--tri-cap', 6.5e6));
const STRIP = new RegExp(flag('--strip', '^machines?$|instrument|settlement|saltrow|town|^npcs?$|people|peg|plumb|gauge'), 'i');
const run = JSON.parse(readFileSync(FILE, 'utf8'));
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? '-' : Number(v).toFixed(d));
const mt = (v) => (v == null ? '-' : (v / 1e6).toFixed(2) + ' M');
const kt = (v) => (v == null ? '-' : (v / 1e3).toFixed(0) + ' k');

const out = { source: FILE, commit: run.commit, dirty: run.dirty, chrome: run.chrome, load1: run.load1, frames: {}, fight: null };
const lines = [];
lines.push(`# D1 at ${run.commit}${run.dirty?.length ? ' (DIRTY)' : ''}: ${run.chrome}, ${run.viewport?.width}x${run.viewport?.height} DPR ${run.viewport?.dpr}`, '');

for (const f of run.frames) {
  if (f.error || f.probe !== 'd1') { lines.push(`${f.id}: ${f.error ? 'ERROR ' + f.error.slice(0, 160) : 'not a d1 probe'}`, ''); continue; }
  const frame = r2((f.finish.medianMs + f.finishEnd.medianMs) / 2);
  const t = f.tiny.derived;
  const own = f.owners;
  const floorOwners = r2(frame - (own.everything.ms ?? 0));
  const row = {
    frameMs: frame, finish: [f.finish.medianMs, f.finishEnd.medianMs], submitMs: f.finish.submitMs,
    draws: f.census.frame.draws, tris: f.census.frame.tris, shadowMapDraws: r2(f.census.frame.draws - f.census.noShadowMaps.draws),
    shadowMapTris: f.census.frame.tris - f.census.noShadowMaps.tris,
    byResolution: { perPixel: t.perPixelMs, shadowMaps: t.shadowMapsMs, mainGeometry: t.mainViewGeometryMs, floor: t.floorMs, floorSubmit: t.floorSubmitMs, fullInProbe: f.tiny.medianMs.full },
    shadowsPaired: f.cascades.all.ms, cascades: f.cascades.each.map((c) => ({ i: c.cascade, size: c.mapSize, ms: c.ms })),
    cascadeCounts: f.census.cascades, post: f.post.ms,
    owners: own.rows.map((r) => ({ name: r.name, ms: r.ms, iqr: r.iqr, draws: r.draws, tris: r.tris, shadowDraws: r.shadowDraws, shadowTris: r.shadowTris })),
    everything: own.everything.ms, floorOwners,
    cpu: f.cpu, load1: f.load1,
  };
  out.frames[f.id] = row;
  lines.push(`## ${f.id}: ${fmt(frame)} ms (first ${fmt(f.finish.medianMs)}, last ${fmt(f.finishEnd.medianMs)}; CPU submit ${fmt(f.finish.submitMs)}), ${row.draws} draws, ${mt(row.tris)} (shadow maps ${row.shadowMapDraws} draws, ${mt(row.shadowMapTris)}); load ${f.load1?.join('-')}`);
  lines.push(`by resolution (1/64 px, sums to ${fmt(t.perPixelMs + t.shadowMapsMs + t.mainViewGeometryMs + t.floorMs)} = the probe's own full ${fmt(f.tiny.medianMs.full)}): per-pixel ${fmt(t.perPixelMs)} | shadow maps ${fmt(t.shadowMapsMs)} | main-view geometry ${fmt(t.mainViewGeometryMs)} | floor ${fmt(t.floorMs)} (of it CPU submit ${fmt(t.floorSubmitMs)})`);
  lines.push(`paired at full resolution: shadow maps ${fmt(f.cascades.all.ms)} (${f.cascades.each.map((c) => `c${c.cascade} ${c.mapSize}: ${fmt(c.ms)}`).join(', ')}; cadence ${f.cascades.cadence}), post ${fmt(f.post.ms)}`);
  lines.push(`cascade casters: ${f.census.cascades.map((c) => `c${c.cascade} ${c.draws} draws ${kt(c.tris)}`).join(', ')}`);
  lines.push('owner | GPU ms (IQR) | draws | tris | of them shadow draws / tris');
  for (const r of own.rows) lines.push(`${r.name} | ${fmt(r.ms)} (${fmt(r.iqr?.[0])}..${fmt(r.iqr?.[1])}) | ${fmt(r.draws, 0)} | ${kt(r.tris)} | ${fmt(r.shadowDraws, 0)} / ${kt(r.shadowTris)}`);
  lines.push(`everything hidden: ${fmt(own.everything.ms)} ms (sum of rows ${fmt(own.sumRowsMs)}); floor (nothing drawn) ${fmt(floorOwners)}`);
  const c = f.cpu;
  lines.push(`main thread live: JS ${fmt(c.live?.medianJsMs)} / p95 ${fmt(c.live?.p95JsMs)} ms (sim ${fmt(c.live?.medianSimMs)}, submit ${fmt(c.live?.medianSubmitMs)}); Brea's cloth ${fmt(c.cloth?.timing?.mean, 3)} ms mean, p95 ${fmt(c.cloth?.timing?.p95, 3)} (n ${c.cloth?.timing?.n}); people ${c.people?.total} (${c.people?.visible} visible, ${c.people?.nearMax} near), strands ${fmt(c.people?.strandsMeanSumMs, 3)} ms`);
  lines.push('');
}

const F = run.frames.find((x) => x.id === FIGHT && x.probe === 'd1');
if (F) {
  const fr = out.frames[FIGHT];
  const all = F.census.children;
  const stripRows = fr.owners.filter((r) => STRIP.test(r.name));
  const stripCen = all.filter((r) => STRIP.test(r.name));
  const stripMs = stripRows.reduce((a, r) => a + Math.max(0, r.ms || 0), 0);
  const notTimed = stripCen.filter((r) => !stripRows.some((x) => x.name === r.name)).map((r) => r.name);
  const stripDraws = stripCen.reduce((a, r) => a + r.draws, 0), stripTris = stripCen.reduce((a, r) => a + r.tris, 0);
  const base = { ms: r2(fr.frameMs - stripMs), draws: r2(fr.draws - stripDraws), tris: fr.tris - stripTris };
  const left = { ms: r2(BAR - HEAD - base.ms), draws: r2(DRAW_CAP - base.draws), tris: TRI_CAP - base.tris };
  const S = F.standIns;
  let fit = null;
  if (S) {
    const fullMs = S.full.all.ms, halfMs = S.half.all.ms, fullT = S.full.counts.tris, halfT = S.half.counts.tris;
    const slope = (fullMs - halfMs) / Math.max(1, fullT - halfT);           // ms per drawn triangle (view + shadows)
    const icept = fullMs - slope * fullT;                                     // the draws' and pixels' share
    const tFit = slope > 0 ? (left.ms - icept) / slope : null;
    fit = { fullMs, halfMs, fullTris: fullT, halfTris: halfT, fullDraws: S.full.counts.draws, halfDraws: S.half.counts.draws,
      msPerMTri: r2(slope * 1e6), interceptMs: r2(icept), trisThatFit: tFit != null ? Math.round(tFit) : null, scaleOfCaps: tFit != null ? r2(tFit / fullT) : null,
      classes: Object.fromEntries(['large', 'medium', 'dwellings', 'walls'].map((k) => [k, { ms: S.full[k]?.ms, iqr: S.full[k]?.iqr, draws: S.full[k]?.draws, tris: S.full[k]?.tris, spec: S.spec[k] }])) };
  }
  out.fight = { frame: FIGHT, bar: BAR, headroom: HEAD, stripped: stripRows.map((r) => ({ name: r.name, ms: r.ms, draws: r.draws, tris: r.tris })), strippedNotTimed: notTimed, base, left, standIns: fit };
  lines.push(`## The Holds' fight frame, from ${FIGHT} at ${run.commit}`);
  lines.push(`${FIGHT} ${fmt(fr.frameMs)} ms, ${fr.draws} draws, ${mt(fr.tris)}; taken off (not in the Holds' fight): ${stripRows.map((r) => `${r.name} ${fmt(r.ms)} ms / ${fmt(r.draws, 0)} draws / ${kt(r.tris)}`).join('; ') || 'none'}${notTimed.length ? `; counted but not timed: ${notTimed.join(', ')}` : ''}`);
  lines.push(`base ${fmt(base.ms)} ms, ${fmt(base.draws, 0)} draws, ${mt(base.tris)}; left under the bar (${BAR} ms less ${HEAD} headroom; ${DRAW_CAP} draws; ${mt(TRI_CAP)}): ${fmt(left.ms)} ms, ${fmt(left.draws, 0)} draws, ${mt(left.tris)}`);
  if (fit) {
    lines.push(`stand-ins at the caps: ${fmt(fit.fullMs)} ms for ${fit.fullDraws} draws, ${mt(fit.fullTris)} drawn (view + shadow maps); at half the triangles ${fmt(fit.halfMs)} ms (${mt(fit.halfTris)}); ${fmt(fit.msPerMTri)} ms per M drawn triangles, ${fmt(fit.interceptMs)} ms at none`);
    lines.push(`classes at the caps: ${Object.entries(fit.classes).map(([k, v]) => `${k} ${fmt(v.ms)} ms (${fmt(v.draws, 0)} draws, ${kt(v.tris)})`).join('; ')}`);
    lines.push(`drawn triangles that fit the GPU left: ${fit.trisThatFit != null ? mt(fit.trisThatFit) : '-'} (${fmt(fit.scaleOfCaps)} x the caps' load)`);
  }
}
console.log(lines.join('\n'));
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
