// @ts-check
/**
 * Tier 0 build: `vite build` of the tree into a fresh temporary directory. Reports the built code's files
 * and sizes (vite's copy of public/ is left out: the shipped-size ledger counts public/ from the tree),
 * then removes only that temporary directory.
 *
 *   node tools/tier0/build.mjs [--tree <dir>]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, rmSync, realpathSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mb } from './lib/files.mjs';

const TMP_PREFIX = 'calima-tier0-build-';

/** @param {string} dir @param {string} base */
function walk(dir, base = dir) {
  /** @type {{ file: string, bytes: number }[]} */
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push({ file: path.relative(base, p), bytes: statSync(p).size });
  }
  return out;
}

/** Remove the temporary build directory this run created, and nothing else. @param {string} dir */
function removeOwnTmp(dir) {
  const tmp = realpathSync(os.tmpdir());
  const real = realpathSync(dir);
  if (path.dirname(real) !== tmp || !path.basename(real).startsWith(TMP_PREFIX)) throw new Error(`refusing to remove ${real}`);
  rmSync(real, { recursive: true });
}

/**
 * @param {{ root: string }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult & { dist?: { file: string, bytes: number }[] }>}
 */
export async function run({ root }) {
  const t0 = Date.now();
  const vite = path.join(root, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) return { id: 'build', status: 'FAIL', summary: 'vite is not installed in this tree (node_modules/vite missing)', failures: ['node_modules/vite missing: run npm ci'], ms: Date.now() - t0 };
  const out = mkdtempSync(path.join(realpathSync(os.tmpdir()), TMP_PREFIX));
  try {
    const r = spawnSync('nice', ['-n', '10', process.execPath, vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn', '--config', path.join(root, 'vite.config.js')], {
      cwd: root, encoding: 'utf8', timeout: 90000, env: { ...process.env, NODE_ENV: 'production' },
    });
    const log = `${r.stdout || ''}\n${r.stderr || ''}`.split(root + path.sep).join('');
    const warnings = log.split('\n').filter((l) => /^\(!\)|warning/i.test(l.trim())).map((l) => l.trim().slice(0, 240));
    if (r.status !== 0) {
      return { id: 'build', status: 'FAIL', summary: `vite build exited ${r.status ?? r.signal}`, failures: log.split('\n').filter((l) => /error/i.test(l)).slice(0, 20).map((l) => l.trim().slice(0, 300)), ms: Date.now() - t0 };
    }
    const pub = new Set(readdirSync(path.join(root, 'public')));
    const dist = walk(out).filter((f) => !pub.has(f.file.split(path.sep)[0]));
    const code = dist.reduce((s, f) => s + f.bytes, 0);
    return {
      id: 'build',
      status: 'PASS',
      summary: `vite build OK: ${dist.length} built files, ${mb(code)} MB of code (largest ${dist.sort((a, b) => b.bytes - a.bytes)[0]?.file} ${mb(dist[0]?.bytes || 0)} MB); ${warnings.length} warning lines`,
      failures: [],
      notes: warnings.slice(0, 8),
      dist,
      ms: Date.now() - t0,
    };
  } finally {
    removeOwnTmp(out);
  }
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { treeRoot } = await import('./lib/files.mjs');
  const r = await run({ root: treeRoot() });
  console.log(`${r.status} build: ${r.summary}`);
  for (const n of r.notes || []) console.log('  ' + n);
  for (const f of r.failures) console.log('  - ' + f);
  process.exitCode = r.status === 'FAIL' ? 1 : 0;
}
