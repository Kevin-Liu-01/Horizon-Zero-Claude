/**
 * A45c's Node twin as a test (M2 wave 3, area C): the Tiller's planted feet hold (<= 0.05 m per simulation step) at a
 * walk, a trot, its run and the 9 m/s herd-trample charge, and no leg's stance asks for a hip-to-plant distance under
 * the solver's fold limit.   node --test tools/instruments/foot-slip.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('A45c twin: the Tiller planted foot holds at 1.5-9 m/s, every stance inside the fold limit', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'tools/instruments/foot-slip-bench.mjs'), '--kind', 'tiller', '--json'], { encoding: 'utf8' });
  } catch (e) { out = e.stdout; }
  const r = JSON.parse(out);
  assert.ok(r.worstStepM <= 0.05, `worst planted step ${r.worstStepM} m (bar 0.05)`);
  for (const row of r.rows) {
    assert.ok(row.plantedPairs > 100, `${row.state} ${row.speed} m/s: only ${row.plantedPairs} planted pairs`);
    for (const l of row.legs) assert.ok(l.stanceD[0] > l.solveDMin, `${row.state} ${row.speed} m/s ${l.id}: stance d ${l.stanceD[0]} under the fold limit ${l.solveDMin}`);
  }
});
