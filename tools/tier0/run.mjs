// @ts-check
/**
 * TIER 0 — the machine checks every merge to the integration branch must pass. One command:
 *
 *   node tools/tier0/run.mjs                      every Node check, then one short headless boot on a free port
 *                                                 it picks itself in 5275-5279 (I23: a green build is not a boot)
 *   node tools/tier0/run.mjs --port 5270          ... the boot on that port instead
 *        [--slot-wait <s>] [--who <name>]         (Chrome slot protocol: see boot.mjs; default wait 1200 s)
 *        [--tree <dir>] [--json <file>] [--no-build]
 *   node tools/tier0/run.mjs --no-boot            the Node checks only (about 15 s); NOT a merge result: the
 *                                                 verdict line says so and the exit code is 2 when nothing failed
 *   npm run tier0
 *
 * Checks, in order: build · name lint · licence manifest · asset budgets · resident-texture ledger ·
 * shipped-size ledger · import graph · node --test · boot. No frame timing at this tier. A commit that builds
 * but throws at boot FAILS Tier 0. A boot the machine guard or the Chrome slot did not allow is PENDING (never
 * PASS); a merge waits for it.
 * Statuses: PASS · FAIL · PENDING (could not be judged here; never counted as PASS) · SKIP (not run, with why).
 * Exit code 1 when anything FAILs.
 */
import { writeFileSync } from 'node:fs';
import { treeRoot } from './lib/files.mjs';
import * as build from './build.mjs';
import * as namelint from './namelint.mjs';
import * as licences from './licences.mjs';
import * as budgets from './budgets.mjs';
import * as imports from './imports.mjs';
import * as tests from './tests.mjs';

const argv = process.argv;
const root = treeRoot(argv);
const jsonOut = (() => { const i = argv.indexOf('--json'); return i > 0 ? argv[i + 1] : null; })();
const t0 = Date.now();
/** @type {import('./lib/files.mjs').CheckResult[]} */
const results = [];

/** @param {import('./lib/files.mjs').CheckResult} r */
function print(r) {
  const secs = r.ms != null ? ` (${(r.ms / 1000).toFixed(1)} s)` : '';
  console.log(`${r.status.padEnd(7)} ${r.id}: ${r.summary}${secs}`);
  for (const n of r.notes || []) console.log(`          · ${n}`);
  for (const f of r.failures) console.log(`          - ${f}`);
}
/** @param {() => Promise<any>} fn @param {string} id */
async function step(id, fn) {
  const s = Date.now();
  try {
    const r = await fn();
    for (const x of Array.isArray(r) ? r : [r]) { results.push(x); print(x); }
    return r;
  } catch (e) {
    const r = { id, status: /** @type {const} */ ('FAIL'), summary: `the check itself crashed: ${String(e).slice(0, 300)}`, failures: [String(/** @type {any} */ (e)?.stack || e).split('\n').slice(0, 3).join(' | ')], ms: Date.now() - s };
    results.push(r); print(r);
    return null;
  }
}

console.log(`Tier 0 on ${root}`);
let dist = null;
if (!argv.includes('--no-build')) {
  const b = await step('build', () => build.run({ root }));
  dist = b && b.status === 'PASS' ? b.dist : null;
} else results.push({ id: 'build', status: 'SKIP', summary: '--no-build', failures: [] });
await step('name-lint', () => namelint.run({ root, argv }));
await step('licences', () => licences.run({ root }));
const assets = budgets.readAssets(root);
await step('asset-budgets', () => budgets.runAssetBudgets({ root, assets }));
await step('texture-ledger', () => budgets.runTextureLedger({ root, assets }));
await step('shipped-ledger', () => budgets.runShippedLedger({ root, assets, dist }));
await step('import-graph', () => imports.run({ root }));
await step('node-test', () => tests.run({ root }));
const nodeMs = Date.now() - t0;
console.log(`-- Node checks took ${(nodeMs / 1000).toFixed(1)} s`);

const noBoot = argv.includes('--no-boot');
if (!noBoot) {
  const boot = await import('./boot.mjs');
  let bootArgv = argv;
  if (!argv.includes('--port')) {
    // I23 (M1a round 3): the boot is part of every run. Without --port, the first free port of the Tier 0 range
    // (5275-5279; never 5173, never another lane's port) is taken here and handed to boot.mjs
    const port = await boot.pickPort();
    if (port) { bootArgv = [...argv, '--port', String(port)]; console.log(`-- boot: no --port given, using free port ${port} (5275-5279)`); }
  }
  if (!bootArgv.includes('--port')) {
    const r = { id: 'boot', status: /** @type {const} */ ('PENDING'), summary: 'no free port in 5275-5279 for the boot (all five busy); not a PASS', failures: [] };
    results.push(r); print(r);
  } else await step('boot', () => boot.run({ root, argv: bootArgv }));
} else {
  const r = { id: 'boot', status: /** @type {const} */ ('SKIP'), summary: '--no-boot: the headless boot was not run, so this is not a merge result', failures: [] };
  results.push(r); print(r);
}

const count = (/** @type {string} */ s) => results.filter((r) => r.status === s).length;
const failed = results.filter((r) => r.status === 'FAIL').map((r) => r.id);
console.log(`TIER 0 ${failed.length ? 'FAIL' : noBoot ? 'INCOMPLETE (no boot; not a merge result)' : count('PENDING') ? 'PASS with PENDING' : 'PASS'}: ${count('PASS')} pass, ${count('FAIL')} fail${failed.length ? ` (${failed.join(', ')})` : ''}, ${count('PENDING')} pending, ${count('SKIP')} skipped; ${(nodeMs / 1000).toFixed(1)} s Node + ${((Date.now() - t0 - nodeMs) / 1000).toFixed(1)} s boot`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ root, at: new Date().toISOString(), results: results.map(({ details, ...r }) => ({ ...r, details })) }, null, 1));
process.exitCode = failed.length ? 1 : noBoot ? 2 : 0;
