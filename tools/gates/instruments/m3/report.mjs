/**
 * M3 wave 1, area C: print rows IK1-IK7 and Clouded as measured in Node (./measure.mjs), one JSON line each.
 *   node tools/gates/instruments/m3/report.mjs [--only IK2,IK5]
 */
import { ROWS } from './measure.mjs';

const i = process.argv.indexOf('--only');
const only = i > 0 ? new Set(process.argv[i + 1].split(',')) : null;
let fail = 0;
for (const [id, fn] of Object.entries(ROWS)) {
  if (only && !only.has(id)) continue;
  const r = fn();
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${id} ${JSON.stringify(r)}`);
}
process.exitCode = fail ? 1 : 0;
