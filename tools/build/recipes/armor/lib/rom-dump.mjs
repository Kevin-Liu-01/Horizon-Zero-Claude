/** Turn a P-dump-poses report into armor/rom-poses.json. Usage: node rom-dump.mjs <run cwd> (see rom-dump.gates.mjs). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const r = JSON.parse(readFileSync(path.join(process.argv[2], 'shots/gates/report.json'), 'utf8'));
const D = (r.results || r.gates).find((x) => x.id === 'P-dump-poses').detail;
const rnd = (v) => +v.toFixed(4);
const out = {
  source: 'bone matrices (model space, column major, bottom row dropped) dumped from the running animator; see rom-dump.gates.mjs',
  names: D.names,
  scale: +D.scale.toFixed(5),
  poses: D.poses.map((p) => ({ tag: p.tag, rows: p.rows.map((m) => [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14]].map(rnd)) })),
};
writeFileSync(new URL('../rom-poses.json', import.meta.url), JSON.stringify(out));
console.log(`${D.poses.length} poses`);
