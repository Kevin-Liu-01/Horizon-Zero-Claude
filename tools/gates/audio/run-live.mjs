#!/usr/bin/env node
/**
 * The audio lane's live rows, run so that the report says what it measured (BUILD M1.6k fix round 1, the judge's fix 8:
 * "record the commit and the clean-tree flag inside each live report, and name run directories by the commit actually
 * measured").
 *
 *   tools/perf/clean-measure.sh <commit> <port> node tools/gates/audio/run-live.mjs --port <port> [--only <ids>] [--label <s>]
 *
 * It reads the commit and the tree's state itself (git, in the tree it runs in; under clean-measure.sh also its
 * CLEAN_COMMIT / CLEAN_TREE), runs tools/gates.mjs on the kept stack with this lane's rows (tools/gates/audio/live-rows.mjs)
 * and writes <runs>/<UTC stamp>-<commit>-audio-live[-label]/report.json: the runner's report with
 * `measured: { commit, clean, tree, dirtyFiles }` at its top and on every result, and gates.log beside it.
 * A dirty tree is refused unless --allow-dirty (then `clean: false` is in every row).
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = flag('--port');
if (!PORT || PORT === '5173') { console.error('run-live: --port <lane port> is required (never 5173)'); process.exit(2); }
const ONLY = flag('--only', 'A73d-ui-bus,A-audio-slice-live,A-audio-gust-live,A-audio-walk-graph');
const LABEL = flag('--label', '');

const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
const commit = git('rev-parse', '--short', 'HEAD');
const dirtyFiles = git('status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean);
const clean = dirtyFiles.length === 0;
if (process.env.CLEAN_COMMIT && !commit.startsWith(process.env.CLEAN_COMMIT) && !process.env.CLEAN_COMMIT.startsWith(commit)) {
  console.error(`run-live: CLEAN_COMMIT ${process.env.CLEAN_COMMIT} is not this tree's HEAD ${commit}`); process.exit(2);
}
if (!clean && !args.includes('--allow-dirty')) { console.error(`run-live: the tree at ${commit} is not clean (${dirtyFiles.length} files); pass --allow-dirty to measure it anyway`); process.exit(3); }
const measured = { commit, clean, tree: process.env.CLEAN_TREE || REPO, dirtyFiles: dirtyFiles.slice(0, 20), via: process.env.CLEAN_TREE ? 'tools/perf/clean-measure.sh' : 'run-live.mjs in place' };

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const out = path.join(os.homedir(), '.calima-r5/review/runs', `${stamp}-${commit}-audio-live${LABEL ? '-' + LABEL : ''}`);
if (path.resolve(out).startsWith(REPO + path.sep)) throw new Error('the run directory goes outside the repo');
mkdirSync(out, { recursive: true });
const log = createWriteStream(path.join(out, 'gates.log'));
log.write(`# run-live ${JSON.stringify(measured)}\n`);

const child = spawn(process.execPath, ['tools/gates.mjs', '--port', String(PORT), '--kept-stack', '--only', ONLY, '--extra', 'tools/gates/audio/live-rows.mjs'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (d) => { process.stdout.write(d); log.write(d); });
child.stderr.on('data', (d) => { process.stderr.write(d); log.write(d); });
child.on('close', (code) => {
  log.end();
  let rep = null;
  try { rep = JSON.parse(readFileSync(path.join(REPO, `shots/gates/report.p${PORT}.json`), 'utf8')); } catch (e) { rep = { error: `no report: ${e.message}` }; }
  const report = { measured, only: ONLY.split(','), exitCode: code, ...rep };
  if (Array.isArray(report.results)) report.results = report.results.map((r) => ({ measured: { commit, clean }, ...r }));
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`[run-live] ${out} (commit ${commit}, clean ${clean}, exit ${code})`);
  process.exit(code ?? 1);
});
