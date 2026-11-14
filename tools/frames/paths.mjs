/**
 * Where the Frame Set tooling reads and writes. Everything here is OUTSIDE the repo: the
 * reference crops are private, and filmed frames and review pages are local review material.
 *
 *   CALIMA_REVIEW   the review root (default ~/.calima-r5/review)
 *     crops/          masked reference crops <id>.png, their private recipe.json, manifest.json
 *     runs/<run>/     one film run: F02.png ... and run.json (keyed by commit and time)
 *     <date>/         the review page for a day: index.html, today/, anchor/, sheets/, answers.txt
 *     accepted/       the current anchor of every accepted frame, and accepted.json
 *     baseline/       the M0.5 baseline run (the anchor of a frame not yet accepted)
 *   CALIMA_SLOTS    the machine-wide Chrome slot directory (default ~/.calima-r5/chrome-slots)
 */
import os from 'node:os';
import path from 'node:path';

export const REVIEW = process.env.CALIMA_REVIEW || path.join(os.homedir(), '.calima-r5', 'review');
export const CROPS = path.join(REVIEW, 'crops');
export const RECIPE = process.env.CALIMA_CROP_RECIPE || path.join(CROPS, 'recipe.json');
export const RUNS = path.join(REVIEW, 'runs');
export const ACCEPTED = path.join(REVIEW, 'accepted');
export const BASELINE = path.join(REVIEW, 'baseline');
export const SLOTS = process.env.CALIMA_SLOTS || path.join(os.homedir(), '.calima-r5', 'chrome-slots');

/** Local calendar date, YYYY-MM-DD (the review page's folder name). */
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Refuse to write anything private inside a git work tree (the crops and frames stay local). */
export function assertOutsideRepo(dir, repoRoot) {
  const a = path.resolve(dir) + path.sep, r = path.resolve(repoRoot) + path.sep;
  if (a.startsWith(r)) throw new Error(`refusing to write review material inside the repo: ${dir}`);
}
