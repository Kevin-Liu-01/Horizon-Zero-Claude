// @ts-check
/**
 * Tier 0 logic tests: `node --test` over every tracked or new *.test.mjs / *.test.js under tools/ and src/.
 * Pure logic only: no browser, no network, no GPU.
 *
 *   node tools/tier0/tests.mjs [--tree <dir>]
 */
import { spawnSync } from 'node:child_process';
import { listFiles } from './lib/files.mjs';

/**
 * @param {{ root: string }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult>}
 */
export async function run({ root }) {
  const t0 = Date.now();
  const files = listFiles(root, ['tools', 'src']).filter((f) => /\.test\.m?js$/.test(f));
  if (!files.length) return { id: 'node-test', status: 'FAIL', summary: 'no *.test.mjs files found', failures: ['no tests'], ms: Date.now() - t0 };
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 16 << 20 });
  const out = r.stdout || '';
  const num = (/** @type {string} */ k) => Number((new RegExp(`^# ${k} (\\d+)`, 'm').exec(out) || [])[1] ?? NaN);
  const pass = num('pass');
  const fail = num('fail');
  const failures = [...out.matchAll(/^\s*not ok \d+ - (.*)$/gm)].map((m) => m[1].trim())
    .filter((name) => !files.some((f) => name.endsWith(f)));   // file-level wrappers repeat their test's failure
  if (r.status !== 0 && !failures.length) failures.push(`node --test exited ${r.status ?? r.signal}: ${(r.stderr || out).slice(-400)}`);
  return {
    id: 'node-test',
    status: r.status === 0 && fail === 0 ? 'PASS' : 'FAIL',
    summary: `${pass} passed, ${fail} failed in ${files.length} files (${files.join(', ')})`,
    failures,
    ms: Date.now() - t0,
  };
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { treeRoot } = await import('./lib/files.mjs');
  const r = await run({ root: treeRoot() });
  console.log(`${r.status} node-test: ${r.summary}`);
  for (const f of r.failures) console.log('  - ' + f);
  process.exitCode = r.status === 'FAIL' ? 1 : 0;
}
