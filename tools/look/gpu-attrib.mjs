#!/usr/bin/env node
/**
 * tools/look/gpu-attrib.mjs — L-18 driver for the orchestrator (lane look-post;
 * docs/ROUND5-LOOK.md L-18, §4.2, §7 A-gpu-attrib).
 *
 *   cd <scratch> && nice -n 10 node <tree>/tools/look/gpu-attrib.mjs --port 5270
 *        runs `tools/gates.mjs --only A-gpu-attrib` (one Chrome, the harness's own slot) in the
 *        cwd, then prints the §4.2 table from its report
 *   node tools/look/gpu-attrib.mjs --report <shots/gates/report.p5270.json>
 *        only formats an existing report
 * The quiet-box clause is graded by the gate itself (load average < 3 at launch, R45); on a
 * busy box the gate reports PENDING-quiet-box with every number, and this prints them anyway.
 */
import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function attribTable(detail) {
  const lines = [];
  lines.push(`build ${detail.build?.sha?.slice(0, 10) || '?'} (${detail.build?.tree || '?'}, ${detail.build?.dirtyFiles ?? '?'} uncommitted files); box load ${detail.box?.load1}, quiet ${detail.box?.quiet}`);
  for (const [name, s] of Object.entries(detail.scenarios || {})) {
    if (s.skip || s.error) { lines.push(`\n### ${name}: ${s.skip || s.error}`); continue; }
    const P = s.perPass;
    lines.push(`\n### ${name}: frame ${s.frame.medianMs} ms (p95 ${s.frame.p95Ms}, ${s.frame.medianDraws} draws, scale ${s.frame.renderScale}); rows sum ${P.sumRowsMs} ms against the frame (gap ${P.gapMs} ms; within 10 %: ${s.sumWithin10})`);
    lines.push('\n| pass | ms | fix owner (ROUND5-LOOK §4.2) |\n|---|---|---|');
    for (const r of [...(P.table || [])].sort((a, b) => (b.ms || 0) - (a.ms || 0))) lines.push(`| ${r.row} | ${r.ms} | ${r.fixOwner || ((r.ms || 0) >= 0.5 ? '**none: needs a §4.2 row**' : '-')} |`);
    lines.push('\n| owner (hide-one) | lanes | children | marginal ms |\n|---|---|---|---|');
    for (const o of s.owners) lines.push(`| ${o.id} | ${o.lanes} | ${o.children} | ${o.marginalMs} |`);
    lines.push(`| floor (all owners hidden) | | | ${s.floorAllOwnersHiddenMs} |`);
    lines.push(`| interaction residual | | | ${s.interactionResidualMs} |`);
    if (s.over05?.length) lines.push(`\nowner rows >= 0.5 ms and their §4.2 fix owners: ${s.over05.map((r) => r.id + ' ' + r.ms + ' ms -> ' + (r.fixOwner || 'NONE (needs a §4.2 row)')).join('; ')}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  let report = flag('--report');
  if (!report) {
    const port = flag('--port');
    if (!port) { console.error('usage: gpu-attrib.mjs --port <5250-5299> | --report <report.json>'); process.exit(2); }
    const r = spawnSync('nice', ['-n', '10', 'node', path.join(TOOLS, 'gates.mjs'), '--port', port, '--only', 'A-gpu-attrib'], { stdio: 'inherit' });
    if (r.status !== 0) console.error(`[gpu-attrib] gates.mjs exited ${r.status}`);
    report = path.join(process.cwd(), `shots/gates/report.p${port}.json`);
  }
  if (!existsSync(report)) { console.error(`no report at ${report}`); process.exit(1); }
  const R = JSON.parse(readFileSync(report, 'utf8'));
  const row = (R.results || R.gates || R).find?.((g) => g.id === 'A-gpu-attrib');
  if (!row) { console.error('A-gpu-attrib not in the report'); process.exit(1); }
  console.log(`A-gpu-attrib: ${row.status}\n`);
  console.log(attribTable(row.detail || {}));
}
