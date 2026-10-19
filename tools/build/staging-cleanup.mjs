/**
 * models-staging/ cleanup (pipeline lane, W0b; plan §6 "models-staging/** HZD-cast items (134 MB on disk,
 * mostly ignored) — W0b (pipeline) — CC0 packs kept only if a lane names them", §4.6 "134 MB -> ~30 MB").
 *
 * The bulk is UNTRACKED / git-ignored, so it lives only in the main tree (lane worktrees never had it) and
 * only the orchestrator can remove it there. This tool makes that one reviewed command:
 *
 *   node tools/build/staging-cleanup.mjs [--root <repo>]            dry run: lists what would go, with sizes
 *   node tools/build/staging-cleanup.mjs [--root <repo>] --apply    deletes exactly that list
 *
 * KEPT: models-staging/r5-src (the Round-5 sources, A-sources-staged) and every TRACKED file (the manifest
 * and the licence texts of donors that still ship until their W2 deletion). Everything else under
 * models-staging/ — the Round-4 Sketchfab/HZD originals and bake backups (`orig/`, `baked/`), the expansion
 * donor GLB/glTF caches, the CC0 packs no Round-5 lane names (AnimatedMech, UltimateMonsters, loose
 * Fox/Mech/Robo GLBs), the lab-anim staging copies — is listed for deletion. Nothing here reads the network
 * and nothing outside models-staging/ is touched.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, lstatSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEEP_DIRS = ['models-staging/r5-src'];

function sizeOf(abs) {
  const st = lstatSync(abs);
  if (st.isSymbolicLink() || !st.isDirectory()) return st.size;
  return readdirSync(abs).reduce((n, e) => n + sizeOf(path.join(abs, e)), 0);
}

export function plan(root) {
  const tracked = new Set(execFileSync('git', ['ls-files', '-z', '--', 'models-staging'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) return;
    if (KEEP_DIRS.includes(rel)) return;
    const st = lstatSync(abs);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      const hasTracked = [...tracked].some((t) => t.startsWith(`${rel}/`));
      if (!hasTracked) { out.push({ path: rel, bytes: sizeOf(abs), kind: 'dir' }); return; }
      for (const e of readdirSync(abs).sort()) walk(`${rel}/${e}`);
      return;
    }
    if (!tracked.has(rel)) out.push({ path: rel, bytes: st.size, kind: st.isSymbolicLink() ? 'link' : 'file' });
  };
  walk('models-staging');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--root');
  const root = path.resolve(i >= 0 ? a[i + 1] : path.resolve(HERE, '../..'));
  const list = plan(root);
  const total = list.reduce((n, x) => n + x.bytes, 0);
  for (const x of list) console.log(`${(x.bytes / 1048576).toFixed(2).padStart(8)} MB  ${x.kind.padEnd(4)}  ${x.path}`);
  console.log(`${(total / 1048576).toFixed(2).padStart(8)} MB  total in ${list.length} entr${list.length === 1 ? 'y' : 'ies'}${a.includes('--apply') ? ' — deleting' : ' (dry run; --apply deletes)'}`);
  if (a.includes('--apply')) {
    for (const x of list) rmSync(path.join(root, x.path), { recursive: true, force: true });
    const left = existsSync(path.join(root, 'models-staging')) ? sizeOf(path.join(root, 'models-staging')) : 0;
    console.log(`models-staging/ now ${(left / 1048576).toFixed(2)} MB (r5-src + tracked files)`);
  }
}
