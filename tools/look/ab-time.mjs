#!/usr/bin/env node
/**
 * tools/look/ab-time.mjs — L-16 driver for the orchestrator (lane look-post;
 * docs/ROUND5-LOOK.md L-16, §4.3, §4.6, §7 A-look-ledger). Run it inside the
 * exit's global run, right after tools/look/gpu-attrib.mjs (R45, R66 h).
 *
 *   cd <scratch> && nice -n 10 node <tree>/tools/look/ab-time.mjs --port 5270
 *        runs `tools/gates.mjs --only A-look-ledger` in the cwd and prints the §4.3 rows
 *   node tools/look/ab-time.mjs --report <shots/gates/report.p5270.json>
 * Items are engine.lookItems (each owner registers its switch with engine.registerLookItem);
 * items estimated >= 0.10 ms are A/B'd alone, the rest as one group, 4 interleaved rounds.
 */
import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function ledgerTable(detail) {
  const lines = [`build ${detail.build?.sha?.slice(0, 10) || '?'}; box load ${detail.box?.load1}, quiet ${detail.box?.quiet}`];
  lines.push('\nregistered items: ' + (detail.items || []).map((i) => `${i.id} (${i.owner}, est ${i.estMs} ms, ${i.on ? 'on' : 'off'})`).join('; '));
  for (const [name, s] of Object.entries(detail.scenarios || {})) {
    if (s.skip || s.error) { lines.push(`\n### ${name}: ${s.skip || s.error}`); continue; }
    lines.push(`\n### ${name} (max draws ${s.maxDraws}, <= 350: ${s.drawsOk})\n\n| item | owner | est ms | A/B median ms | on | off | rounds | <= 0.45 |\n|---|---|---|---|---|---|---|---|`);
    for (const r of s.rows) lines.push(`| ${r.id} | ${r.owner} | ${r.estMs} | ${r.deltaMs} | ${r.onMs} | ${r.offMs} | ${r.rounds} | ${r.ok} |`);
  }
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  let report = flag('--report');
  if (!report) {
    const port = flag('--port');
    if (!port) { console.error('usage: ab-time.mjs --port <5250-5299> | --report <report.json>'); process.exit(2); }
    const r = spawnSync('nice', ['-n', '10', 'node', path.join(TOOLS, 'gates.mjs'), '--port', port, '--only', 'A-look-ledger'], { stdio: 'inherit' });
    if (r.status !== 0) console.error(`[ab-time] gates.mjs exited ${r.status}`);
    report = path.join(process.cwd(), `shots/gates/report.p${port}.json`);
  }
  if (!existsSync(report)) { console.error(`no report at ${report}`); process.exit(1); }
  const R = JSON.parse(readFileSync(report, 'utf8'));
  const row = (R.results || R.gates || R).find?.((g) => g.id === 'A-look-ledger');
  if (!row) { console.error('A-look-ledger not in the report'); process.exit(1); }
  console.log(`A-look-ledger: ${row.status}\n`);
  console.log(ledgerTable(row.detail || {}));
}
