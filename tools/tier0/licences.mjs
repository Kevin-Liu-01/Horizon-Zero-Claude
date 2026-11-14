// @ts-check
/**
 * Tier 0 licence manifest check: runs tools/licences/check.mjs (the manifest's own checker) and grades
 * its clauses. FAIL if any clause FAILs. Two clauses are read differently here:
 *   - `credits`: its in-game half can only be graded on the rendered page, so the node checker reports
 *     PENDING by design; Tier 0 passes it when its README half passes and says the in-game half is not
 *     graded here.
 *   - `size`: the old single 60 MB cap on public/ is superseded by the shipped-size ledger
 *     (tools/tier0/budgets.mjs: first load and total, per milestone); it is reported, not graded.
 * Every row's licence must be on the allowed list (no NC / ND); the checker's row-schema clause grades that.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * @param {{ root: string }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult>}
 */
export async function run({ root }) {
  const t0 = Date.now();
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(root, 'tools/licences/check.mjs')], { cwd: root, encoding: 'utf8', maxBuffer: 32 << 20, timeout: 60000 });
  } catch (e) {
    out = /** @type {any} */ (e).stdout || '';
    if (!out) return { id: 'licences', status: 'FAIL', summary: `tools/licences/check.mjs did not run: ${String(e).slice(0, 300)}`, failures: [String(e).slice(0, 300)], ms: Date.now() - t0 };
  }
  let r;
  try { r = JSON.parse(out); } catch { return { id: 'licences', status: 'FAIL', summary: 'tools/licences/check.mjs printed no JSON', failures: [out.slice(0, 400)], ms: Date.now() - t0 }; }
  const failures = [];
  const notes = [];
  /** @type {Record<string, string>} */
  const graded = {};
  for (const [k, c] of Object.entries(r.clauses || {})) {
    const cl = /** @type {any} */ (c);
    if (k === 'size') { notes.push(`size: ${cl.mb} MB under public/ (old 60 MB cap, superseded by the shipped-size ledger; not graded here)`); continue; }
    if (k === 'credits' && cl.status === 'PENDING') {
      const readme = cl.readme?.status;
      graded[k] = readme === 'PASS' ? 'PASS' : 'FAIL';
      notes.push(`credits: README ${cl.readme?.shown}/${cl.readme?.of} (${readme}); in-game half not graded in Node (needs the rendered credits screen)`);
      if (readme !== 'PASS') failures.push(`credits: README is missing ${JSON.stringify(cl.readme?.missing || [])}`);
      continue;
    }
    graded[k] = cl.status;
    if (cl.status === 'FAIL') {
      const ev = cl.unmatched?.length ? `unmatched ${JSON.stringify(cl.unmatched.slice(0, 20))}` :
        cl.problems?.length ? JSON.stringify(cl.problems.slice(0, 20)) :
        cl.missing?.length ? `missing ${JSON.stringify(cl.missing.slice(0, 20))}` : JSON.stringify(cl).slice(0, 400);
      failures.push(`${k}: ${ev}`);
    } else if (cl.status === 'PENDING') {
      notes.push(`${k}: PENDING ${JSON.stringify(cl.pending || cl.why || '').slice(0, 300)}`);
    }
  }
  const pending = Object.entries(graded).filter(([, s]) => s === 'PENDING').map(([k]) => k);
  const files = r.clauses?.['files-matched'];
  const rows = r.clauses?.['row-schema'];
  return {
    id: 'licences',
    status: failures.length ? 'FAIL' : pending.length ? 'PENDING' : 'PASS',
    summary: `${files?.files ?? '?'} shipped files against ${rows?.rows ?? '?'} manifest rows; clauses ${Object.entries(graded).map(([k, s]) => `${k} ${s}`).join(', ')}`,
    failures,
    notes,
    ms: Date.now() - t0,
  };
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { treeRoot } = await import('./lib/files.mjs');
  const r = await run({ root: treeRoot() });
  console.log(`${r.status} licences: ${r.summary}`);
  for (const n of r.notes || []) console.log('  ' + n);
  for (const f of r.failures) console.log('  - ' + f);
  process.exitCode = r.status === 'FAIL' ? 1 : 0;
}
