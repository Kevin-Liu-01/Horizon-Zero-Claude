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
 * The driver imports recipes in sorted path order, runs the selected lanes
 * sequentially (peak memory stays one recipe wide), and prints one JSON line:
 * per output SHA-256 + bytes, wall ms, peak RSS. `npm run build:assets` is
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
    recipes.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), lane: mod.LANE, outputs: mod.OUTPUTS, build: mod.build });
  }
  return recipes;
}

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

export async function buildAssets({ only = null, out = ROOT } = {}) {
  const t0 = Date.now();
  const all = await loadRecipes();
  const lanes = only ? new Set(only) : null;
  const picked = all.filter((r) => !lanes || lanes.has(r.lane));
  const results = [];
  for (const r of picked) {
    const stats = await r.build({ out });
    const files = r.outputs.map((o) => {
      const abs = path.join(out, o);
      return { path: o, bytes: existsSync(abs) ? statSync(abs).size : null, sha256: existsSync(abs) ? sha(abs) : null };
    });
    results.push({ recipe: r.file, lane: r.lane, files, stats: { ...stats, files: undefined } });
  }
  return {
    lanes: [...new Set(picked.map((r) => r.lane))], recipes: results.length, results,
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
  }
}
