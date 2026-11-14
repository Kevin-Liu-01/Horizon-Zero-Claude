// @ts-check
/**
 * TIER 0 — the machine checks every merge to the integration branch must pass. One command:
 *
 *   node tools/tier0/run.mjs                      all Node checks (no browser), about 15 s
 *   node tools/tier0/run.mjs --port 5270          ... then one short headless boot on that port
 *        [--slot-wait <s>] [--who <name>]         (Chrome slot protocol: see boot.mjs; default wait 1200 s)
 *        [--tree <dir>] [--json <file>] [--no-build]
 *   npm run tier0 -- --port 5270
 *
 * Checks, in order: build · name lint · licence manifest · asset budgets · resident-texture ledger ·
 * shipped-size ledger · import graph · node --test · (boot). No frame timing at this tier.
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

if (argv.includes('--port')) {
  const boot = await import('./boot.mjs');
  await step('boot', () => boot.run({ root, argv }));
} else {
  const r = { id: 'boot', status: /** @type {const} */ ('SKIP'), summary: 'not requested (pass --port <port> to boot once headless)', failures: [] };
  results.push(r); print(r);
}

const count = (/** @type {string} */ s) => results.filter((r) => r.status === s).length;
const failed = results.filter((r) => r.status === 'FAIL').map((r) => r.id);
console.log(`TIER 0 ${failed.length ? 'FAIL' : count('PENDING') ? 'PASS with PENDING' : 'PASS'}: ${count('PASS')} pass, ${count('FAIL')} fail${failed.length ? ` (${failed.join(', ')})` : ''}, ${count('PENDING')} pending, ${count('SKIP')} skipped; ${(nodeMs / 1000).toFixed(1)} s Node + ${((Date.now() - t0 - nodeMs) / 1000).toFixed(1)} s boot`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ root, at: new Date().toISOString(), results: results.map(({ details, ...r }) => ({ ...r, details })) }, null, 1));
process.exitCode = failed.length ? 1 : 0;
