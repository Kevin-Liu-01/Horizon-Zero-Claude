/**
 * CALIMA asset build driver (pipeline lane; plan §2 "deterministic
 * `npm run build:assets` with `--only <lane>`").
 *
 *   node tools/build/build-assets.mjs [--only <lane>[,<lane>]] [--out <dir>] [--list]
 *
 * RECIPE CONTRACT (every lane's generator follows it):
 *   - lives under tools/build/** (lib/ excluded) as `gen-*.mjs` or under
 *     `recipes/**`, and exports
 *       LANE     the owning lane id (plan §2), e.g. 'hero-body'
 *       OUTPUTS  repo-relative paths it writes (its lane's output paths only)
 *       build({ out })  writes every OUTPUT under `out` (a repo-shaped root)
 *                       and resolves to a stats object
 *   - is deterministic: no clocks, no Math.random, no network; third-party
 *     sources are read only from models-staging/r5-src/ (A-build-deterministic)
 *   - writes GLBs through tools/build/lib/glb.mjs, which stamps
 *     asset.extras.provenance and r5Size, and adds its LICENSES.json rows with
 *     tools/licences/add.mjs.
 *
 * `export const PROOF = true` (W0b) marks a recipe whose outputs are build
 * evidence, not content: the driver runs it only with an explicit `--out`
 * (A-build-deterministic), never into the repository.
 *
 * The driver imports recipes in sorted path order, runs the selected lanes
 * sequentially (peak memory stays one recipe wide), and prints one JSON line:
 * per output SHA-256 + bytes, wall ms, peak RSS, and `failed` (W0b fix round 2:
 * a failing recipe is listed with its error and `missingSource`, the others
 * still run, and the exit code is 1). A recipe that cannot find its staged
 * sources throws with `err.code = 'R5_SRC_MISSING'` (or names
 * `models-staging/r5-src` in its message): `isMissingSource(err)`. `npm run build:assets` is
 * this file once brand adds the script line to package.json (W0b request).
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

export function discoverRecipes(dir = HERE, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name === 'lib' || name === 'out' || name === 'node_modules') continue;
      discoverRecipes(abs, out);
    } else if (/^gen-.*\.mjs$/.test(name) || (abs.includes(`${path.sep}recipes${path.sep}`) && name.endsWith('.mjs') && !abs.includes(`${path.sep}lib${path.sep}`))) {
      out.push(abs);
    }
  }
  return out;
}

export async function loadRecipes() {
  const recipes = [];
  for (const file of discoverRecipes()) {
    const mod = await import(pathToFileURL(file).href);
    if (typeof mod.build !== 'function' || !mod.LANE || !Array.isArray(mod.OUTPUTS)) continue;   // a helper, not a recipe
    recipes.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), lane: mod.LANE, outputs: mod.OUTPUTS, build: mod.build, proof: mod.PROOF === true });
  }
  return recipes;
}

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

/**
 * A recipe that cannot find its staged third-party sources throws an Error whose
 * `code` is 'R5_SRC_MISSING' (humans.mjs), or whose message names
 * `models-staging/r5-src` / `R5_SRC` (hero-body's `srcRoot()`), or an ENOENT on a
 * path inside r5-src. The driver records it as `missingSource: true` so a gate can
 * tell "blocked on A-sources-staged" from a broken recipe (W0b fix round 2).
 */
export function isMissingSource(err) {
  if (!err) return false;
  if (err.code === 'R5_SRC_MISSING') return true;
  if (err.code === 'ENOENT' && /models-staging[\\/]r5-src/.test(String(err.path || ''))) return true;
  return /models-staging\/r5-src|\bR5_SRC\b/.test(String(err.message || ''));
}

export async function buildAssets({ only = null, out = ROOT } = {}) {
  const t0 = Date.now();
  const all = await loadRecipes();
  const lanes = only ? new Set(only) : null;
  const picked = all.filter((r) => !lanes || lanes.has(r.lane));
  const results = [];
  const skipped = [];
  // KEEP GOING (W0b fix round 2): one failing recipe no longer hides every other recipe's result. Each failure
  // is listed with its error and `missingSource`; the CLI still exits 1 when any recipe failed.
  const failed = [];
  for (const r of picked) {
    // PROOF recipes (W0b) write only under an explicit --out: never into the repository, never shipped
    if (r.proof && path.resolve(out) === ROOT) { skipped.push({ recipe: r.file, why: 'PROOF recipe: outputs only with --out <dir>' }); continue; }
    let stats;
    try {
      stats = await r.build({ out });
    } catch (err) {
      failed.push({ recipe: r.file, lane: r.lane, outputs: r.outputs, missingSource: isMissingSource(err), code: err?.code ?? null, error: String(err?.message || err).slice(0, 400) });
      continue;
    }
    const files = r.outputs.map((o) => {
      const abs = path.join(out, o);
      return { path: o, bytes: existsSync(abs) ? statSync(abs).size : null, sha256: existsSync(abs) ? sha(abs) : null };
    });
    results.push({ recipe: r.file, lane: r.lane, files, stats: { ...stats, files: undefined } });
  }
  return {
    lanes: [...new Set(picked.map((r) => r.lane))], recipes: results.length, results, skipped, failed,
    wallMs: Date.now() - t0, peakRssMb: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
  if (a.includes('--list')) {
    for (const r of await loadRecipes()) console.log(`${r.lane.padEnd(16)} ${r.file}  -> ${r.outputs.join(', ')}`);
  } else {
    const res = await buildAssets({ only: val('--only')?.split(','), out: val('--out') ? path.resolve(val('--out')) : ROOT });
    console.log(JSON.stringify(res));
    for (const f of res.failed) console.error(`[build-assets] FAILED ${f.recipe}${f.missingSource ? ' (staged source missing: see tools/build/sources.mjs status)' : ''}: ${f.error}`);
    if (res.failed.length) process.exitCode = 1;
  }
}
