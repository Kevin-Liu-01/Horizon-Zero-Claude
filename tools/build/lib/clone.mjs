/**
 * Copy-on-write file clones (pipeline lane, W0b).
 *
 * Measured on this machine (APFS, Oct 19): node's `copyFileSync(a, b,
 * COPYFILE_FICLONE)` silently falls back to a FULL copy (a 6.5 MB file cost
 * 6.5 MB of free space) while `cp -c` (clonefile(2)) costs ~0. Every staged
 * source and every fixture copy goes through here, so a clone really is free
 * on a 99 %-full volume. Falls back to a plain copy where `cp -c` is not
 * available (non-macOS) and reports which path it took.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

let cpClone = process.platform === 'darwin';

/** Clone many files: `pairs` = [[src, dst], ...]. One `cp -c` per destination directory. Returns 'clone' | 'copy'. */
export function cloneFiles(pairs) {
  const byDir = new Map();
  for (const [src, dst] of pairs) {
    mkdirSync(path.dirname(dst), { recursive: true });
    const d = path.dirname(dst);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push([src, dst]);
  }
  if (cpClone) {
    try {
      for (const [d, list] of byDir) {
        // same basename on both sides -> one cp per directory; otherwise one per file
        if (list.every(([s, t]) => path.basename(s) === path.basename(t))) {
          for (let i = 0; i < list.length; i += 200) execFileSync('cp', ['-c', ...list.slice(i, i + 200).map(([s]) => s), `${d}/`], { stdio: ['ignore', 'ignore', 'pipe'] });
        } else for (const [s, t] of list) execFileSync('cp', ['-c', s, t], { stdio: ['ignore', 'ignore', 'pipe'] });
      }
      return 'clone';
    } catch { cpClone = false; }
  }
  for (const [s, t] of pairs) copyFileSync(s, t);
  return 'copy';
}

export const cloneFile = (src, dst) => cloneFiles([[src, dst]]);
