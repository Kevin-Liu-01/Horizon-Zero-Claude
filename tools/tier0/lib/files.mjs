// @ts-check
/** File listing and small shared helpers for Tier 0. Read-only: nothing here writes to the tree. */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The tree Tier 0 runs on: --tree <dir>, else the repo this file lives in. */
export function treeRoot(argv = process.argv) {
  const i = argv.indexOf('--tree');
  if (i > 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

/**
 * Files git tracks under the given paths, plus untracked files git does not ignore (what a commit of this
 * tree would ship), that exist on disk. Paths are repo-relative with forward slashes.
 * @param {string} root
 * @param {string[]} paths
 */
export function listFiles(root, paths) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...paths], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 << 20,
  });
  const seen = new Set();
  for (const f of out.split('\0')) {
    if (!f || seen.has(f)) continue;
    if (!existsSync(path.join(root, f))) continue;   // tracked but deleted in the working tree
    seen.add(f);
  }
  return [...seen].sort();
}

/** @param {string} root @param {string} rel */
export const sizeOf = (root, rel) => statSync(path.join(root, rel)).size;

export const MB = 1024 * 1024;
/** @param {number} bytes */
export const mb = (bytes) => Math.round((bytes / MB) * 100) / 100;

/**
 * A check result. status: PASS | FAIL | PENDING (could not be judged here) | SKIP (deliberately not run).
 * @typedef {{ id: string, status: 'PASS'|'FAIL'|'PENDING'|'SKIP', summary: string, failures: string[], notes?: string[], details?: any, ms?: number }} CheckResult
 */
