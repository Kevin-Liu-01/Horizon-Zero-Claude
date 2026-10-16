/**
 * CALIMA licence manifest — shared helpers (pipeline lane; plan §10).
 *
 * `public/LICENSES.json` is the one source of truth for what ships and under
 * which terms. Every lane adds its rows through `tools/licences/add.mjs`; the
 * checks (`check.mjs`, `ip-scan.mjs`) and the credits generator
 * (`credits.mjs`) all read it through this module.
 *
 * Paths in a row are repo-relative globs: `*` (one segment), `**` (any depth),
 * `?`, and `{a,b}` alternation. A path that does not start with `public/`
 * (e.g. bundled code) is descriptive and is never matched against files.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MANIFEST = 'public/LICENSES.json';

/** SPDX ids a row may declare (plan §10.1). MIT is for shipped code only. */
export const ASSET_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'OFL-1.1', 'project-original'];
export const CODE_LICENCES = ['MIT'];
/** Licences that require an `attribution` string (shown verbatim in credits). */
export const NEEDS_ATTRIBUTION = ['CC-BY-4.0', 'CC-BY-3.0', 'MIT'];
/** Never allowed anywhere (plan §0 rule 9). */
export const FORBIDDEN_LICENCE = /\bNC\b|NonCommercial|\bND\b|NoDerivatives/i;
/** Provenance that may never ship (plan §0 rule 9, A-ID-ip-assets-gone). */
export const IP_PATTERN = /sketchfab|horizon|hzd|hfw|fortnite|guerrilla|sony|aloy/i;

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function loadManifest(root = ROOT) {
  const file = path.join(root, MANIFEST);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Every file under `dir` (repo-relative, forward slashes), sorted. */
export function listFiles(dir, root = ROOT) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs).sort()) {
      if (name === '.DS_Store') continue;
      const r = `${rel}/${name}`;
      const st = statSync(path.join(root, r));
      if (st.isDirectory()) walk(r); else out.push(r);
    }
  };
  walk(dir);
  return out;
}

/**
 * The files under `dir` that the REPOSITORY ships: tracked + untracked-but-
 * not-ignored (`git ls-files -co --exclude-standard`), present on disk. A file
 * git ignores (a local proof output, a bake intermediate) is not part of the
 * project and is reported separately by `listIgnored`. Falls back to the
 * whole directory when git is unavailable.
 */
export function listShipped(dir, root = ROOT) {
  let out;
  try {
    out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', dir], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 2 ** 20, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter((f) => f && existsSync(path.join(root, f)));
  } catch { return listFiles(dir, root); }
  return [...new Set(out)].sort();
}

/** Files on disk under `dir` that git ignores (never shipped by the repo). */
export function listIgnored(dir, root = ROOT) {
  const shipped = new Set(listShipped(dir, root));
  return listFiles(dir, root).filter((f) => !shipped.has(f));
}

/** Map each file to the ids of the rows whose globs match it. */
export function matchRows(manifest, files) {
  const compiled = (manifest?.rows || []).map((row) => ({
    row, res: (row.paths || []).filter((p) => p.startsWith('public/')).map(globToRegExp),
  }));
  const byFile = new Map();
  const hits = new Map(compiled.map(({ row }) => [row.id, 0]));
  for (const f of files) {
    const ids = compiled.filter(({ res }) => res.some((r) => r.test(f))).map(({ row }) => row.id);
    byFile.set(f, ids);
    for (const id of ids) hits.set(id, hits.get(id) + 1);
  }
  return { byFile, hits };
}

/** Total bytes of the shipped files under a directory. */
export function duBytes(dir, root = ROOT) {
  return listShipped(dir, root).reduce((n, f) => n + statSync(path.join(root, f)).size, 0);
}

/* ------------------------------------------------------------------ */
/* Waves: when a scheduled IP exception expires                         */
/* ------------------------------------------------------------------ */

/**
 * The plan's wave sequence (§3.1), with each exit as its own step. A bare
 * wave is "in progress"; "<wave> exit" is the orchestrator's exit run.
 */
export const WAVES = ['W0-day1', 'W0a', 'W0a exit', 'W0b', 'W0 exit', 'W1', 'W1 exit', 'W2', 'W2 exit',
  'W3', 'W3 exit', 'W4', 'W4 exit'];

/** Canonical wave of a string like "W0 exit (R30)", "W0a", "w2 exit", "0b". null if none. */
export function parseWave(s) {
  const m = /\bW?(0-day1|0a|0b|0|[1-4])\b(\s+exit)?/i.exec(String(s ?? ''));
  if (!m) return null;
  let w = `W${m[1].toLowerCase()}`;
  const exit = !!m[2];
  if (w === 'W0') return exit ? 'W0 exit' : 'W0a';
  if (w === 'W0b' && exit) return 'W0 exit';                 // W0b's exit IS the W0 exit
  return exit ? `${w} exit` : w;
}

/**
 * A `delete_at` is a deadline: "deleted at W0a" means gone by the W0a exit
 * run, "W0 exit" means gone at the W0 exit run.
 */
export function deadlineOf(deleteAt) {
  const w = parseWave(deleteAt);
  if (!w) return null;
  if (w.endsWith('exit')) return w;
  return w === 'W0b' ? 'W0 exit' : w === 'W0-day1' ? 'W0a' : `${w} exit`;
}

export const waveRank = (w) => WAVES.indexOf(w);

/**
 * The wave the repository is in, from two independent sources (the later wins):
 *   1. `R5_WAVE` (the orchestrator sets it on its wave-exit runs, e.g.
 *      R5_WAVE='W0a exit'); malformed values are reported, never guessed;
 *   2. a lower bound read from the tree itself: every lane writes
 *      `docs/ROUND5-<LANE>.md` from its first wave on (plan §2), so the
 *      latest FIRST wave among the lanes whose report exists is a wave the
 *      repo has certainly reached. Nobody has to remember to bump anything:
 *      the first W1 lane report to merge moves this past the W0 exit.
 */
export function currentWave(root = ROOT, env = process.env) {
  const out = { wave: null, source: null, env: env.R5_WAVE ?? null, envWave: null, inferred: null, reports: [] };
  if (env.R5_WAVE) out.envWave = parseWave(env.R5_WAVE);
  const plan = path.join(root, 'docs/ROUND5-PLAN.md');
  if (existsSync(plan)) {
    const text = readFileSync(plan, 'utf8');
    const lanes = [...text.matchAll(/^\|\s*\*\*([a-z][a-z0-9-]*)\*\*\s*\|\s*\d{4}\s*\|\s*([^|]+)\|/gm)]
      .map(([, lane, ws]) => ({ lane, first: parseWave(String(ws).split(/[,–-]\s*(?=\d)/)[0].trim()) }));
    let best = null;
    for (const { lane, first } of lanes) {
      if (!first || !existsSync(path.join(root, `docs/ROUND5-${lane.toUpperCase()}.md`))) continue;
      out.reports.push(`${lane}:${first}`);
      if (best === null || waveRank(first) > waveRank(best)) best = first;
    }
    out.inferred = best;
  }
  const cands = [out.envWave, out.inferred].filter(Boolean);
  if (cands.length) {
    out.wave = cands.reduce((a, b) => (waveRank(b) > waveRank(a) ? b : a));
    out.source = out.wave === out.envWave ? 'R5_WAVE' : 'lane reports (lower bound)';
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scheduled IP: files the plan deletes AFTER W0a (plan §6, R30)        */
/* ------------------------------------------------------------------ */

/**
 * The ONLY shipped files allowed to carry IP provenance, each until a named
 * deadline. An entry is honoured only while ALL of these hold (otherwise the
 * file is an ordinary IP hit and both licence gates FAIL):
 *   - its LICENSES.json row says `ip: true` and the SAME deadline (`delete_at`);
 *   - the repo has not reached the deadline (`currentWave`: R5_WAVE, or the
 *     lane-report lower bound);
 *   - `liveRow`, when set: the boot row it serves still points at it (once the
 *     replacement has landed the file has no reader and must be gone).
 *
 * `rowless` entries (fix round 3) are R30 files whose deletion ANOTHER lane
 * owns in the CURRENT wave, together with the class that reads them (plan §6
 * row 1: the four machine GLBs, instruments-core, W0a). They carry NO
 * LICENSES.json row — a row would have to declare their source licence, and
 * three of them are NC, which no manifest may declare. Such an entry is
 * honoured only while ALL of these hold:
 *   - no LICENSES.json row matches the file;
 *   - the repo has not reached the deadline (at R5_WAVE='W0a exit' it is an
 *     IP hit, in every tree);
 *   - its `reader` (repo-relative class file) is still in the tree: once the
 *     class deletion has landed the file has no reader and must be gone, so
 *     an orphaned file is an IP hit at once, before any deadline.
 * Remove an entry together with its file (and, for a row-backed entry, its row).
 */
export const SCHEDULED_IP = {
  'public/models/aloy.glb': {
    delete_at: 'W0 exit', owner: 'hero-body', liveRow: 'hero',
    why: 'Round-4 hero body, kept until Brea passes the hero-body block (plan §6, R30)',
  },
  'public/anims-hybrid/aloy-ual.json': {
    delete_at: 'W0a', owner: 'gates-perf',
    why: 'Round-4 lab bake keyed to the IP hero rig\'s bones; deleted with public/anims-hybrid/** at W0a (plan §6)',
  },
  'public/models/watcher.glb': {
    delete_at: 'W0a', owner: 'instruments-core', rowless: true, reader: 'src/entities/machines/watcher.js',
    source: '"Redeye Watcher Rig, Horizon Zero Dawn", JP11555, CC-BY-4.0 (third-party game IP)',
    why: 'R30 machine GLB, deleted by instruments-core together with its class in W0a (plan §6 row 1)',
  },
  'public/models/sawtooth.glb': {
    delete_at: 'W0a', owner: 'instruments-core', rowless: true, reader: 'src/entities/machines/sawtooth.js',
    source: '"Sawtooth from Horizon Zero Dawn", Théo Domon, CC-BY-NC-4.0 (game IP, non-commercial)',
    why: 'R30 machine GLB, deleted by instruments-core together with its class in W0a (plan §6 row 1)',
  },
  'public/models/behemoth.glb': {
    delete_at: 'W0a', owner: 'instruments-core', rowless: true, reader: 'src/entities/machines/behemoth.js',
    source: '"Behemoth from Horizon Zero Dawn", Théo Domon, CC-BY-NC-4.0 (game IP, non-commercial)',
    why: 'R30 machine GLB, deleted by instruments-core together with its class in W0a (plan §6 row 1)',
  },
  'public/models/thunderjaw.glb': {
    delete_at: 'W0a', owner: 'instruments-core', rowless: true, reader: 'src/entities/machines/thunderjaw.js',
    source: '"Thunderjaw from Horizon Zero Dawn", Théo Domon, CC-BY-NC-4.0 (game IP, non-commercial)',
    why: 'R30 machine GLB, deleted by instruments-core together with its class in W0a (plan §6 row 1)',
  },
};

/** The boot rows (`src/core/assets.specs.js`, pure data) or null. */
export async function loadSpecs(root = ROOT) {
  const f = path.join(root, 'src/core/assets.specs.js');
  if (!existsSync(f)) return null;
  const { pathToFileURL } = await import('node:url');
  const mod = await import(`${pathToFileURL(f).href}?t=${process.hrtime.bigint()}`);
  return mod.SPECS || null;
}

/** Text a row DECLARES about provenance (what the IP pattern is tested on). */
export function rowProvenanceText(r) {
  return ['title', 'author', 'source_url', 'attribution', 'licence_url'].map((k) => r?.[k] ?? '').join(' ');
}

/**
 * Is shipped `file` a currently valid scheduled IP exception?
 * `rows`: the LICENSES.json rows matching it; `wave`: currentWave(); `specs`: loadSpecs();
 * `root`: the repository the file and its reader live in.
 * Returns { valid, why, deadline?, owner?, rowless? }.
 */
export function scheduledStatus(file, rows, { wave, specs, root = ROOT }) {
  const entry = SCHEDULED_IP[file];
  if (!entry) return { valid: false, why: 'not a scheduled exception (SCHEDULED_IP)' };
  const deadline = deadlineOf(entry.delete_at);
  const base = { deadline, owner: entry.owner, until: entry.why };
  if (entry.rowless) {
    const rb = { ...base, rowless: true, reader: entry.reader, source: entry.source };
    if (rows.length) return { ...rb, valid: false, why: `a pending R30 deletion must carry no LICENSES.json row (found ${rows.map((r) => r.id).join(', ')})` };
    if (!wave?.wave) return { ...rb, valid: false, why: 'current wave unknown (no R5_WAVE and no lane report): an exception is only graded against a known wave' };
    if (waveRank(wave.wave) >= waveRank(deadline)) {
      return { ...rb, valid: false, why: `EXPIRED: deadline ${deadline}, repository at ${wave.wave} (${wave.source}); ${entry.owner} deletes it (plan §6)` };
    }
    if (!entry.reader || !existsSync(path.join(root, entry.reader))) {
      return { ...rb, valid: false, why: `ORPHANED: its reader ${entry.reader} is gone (the class deletion has landed), so nothing loads this file and it must be deleted now (owner ${entry.owner}, plan §6 row 1)` };
    }
    return { ...rb, valid: true, why: `pending R30 deletion: ${entry.why}; reader ${entry.reader} still present; deadline ${deadline}, repository at ${wave.wave} (${wave.source})` };
  }
  const ipRows = rows.filter((r) => r.ip === true);
  if (!ipRows.length) return { ...base, valid: false, why: 'its LICENSES.json row is not marked ip: true' };
  const disagree = ipRows.filter((r) => deadlineOf(r.delete_at) !== deadline).map((r) => `${r.id}: ${r.delete_at}`);
  if (disagree.length) return { ...base, valid: false, why: `row delete_at disagrees with the scheduled deadline ${deadline} (${disagree.join('; ')})` };
  if (!wave?.wave) return { ...base, valid: false, why: 'current wave unknown (no R5_WAVE and no lane report): an exception is only graded against a known wave' };
  if (waveRank(wave.wave) >= waveRank(deadline)) {
    return { ...base, valid: false, why: `EXPIRED: deadline ${deadline}, repository at ${wave.wave} (${wave.source})` };
  }
  if (entry.liveRow) {
    const url = specs?.[entry.liveRow]?.url ?? null;
    if (url !== `/${file.replace(/^public\//, '')}`) {
      return { ...base, valid: false, why: `EXPIRED: SPECS.${entry.liveRow} no longer points at it (now ${url}); the replacement has landed, so the file must be gone` };
    }
  }
  return { ...base, valid: true, why: `scheduled: ${entry.why}; deadline ${deadline}, repository at ${wave.wave} (${wave.source})` };
}

/**
 * Read the JSON chunk of a .glb (or a whole .gltf) without decoding any
 * buffer: provenance and licence checks need only the document.
 */
export function readGltfJson(file) {
  const buf = readFileSync(file);
  if (file.endsWith('.gltf')) return JSON.parse(buf.toString('utf8'));
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a glb (bad magic)`);
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${file}: first chunk is not JSON`);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}
