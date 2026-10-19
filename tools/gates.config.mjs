/**
 * ROUND 5 GATE REGISTRY (gates-perf, W0a; plan §2, §3.3, §9 `A-gates-autodiscover`).
 *
 * Same gate contract as Rounds 3-4 (an ACTION gate's `assert` runs in page
 * context with __CTX__/__GAME__ and resolves `{ pass, detail }`; `pass: null`
 * is PENDING and a named SKIP rides in its detail; a VISUAL gate captures a
 * deterministic shot judged against `criteria` by an independent judge, R29;
 * a RUNNER gate's `check()` runs in node). What changed is WHERE gates live:
 *
 *   tools/gates.r5.carried.mjs   every CARRY + RESTAGE Round-4 gate, re-staged
 *                                by role / place / animator name. Never emptied.
 *   tools/gates.r5.<lane>.mjs    one file per Round-5 lane, found BY PATTERN:
 *                                adding a lane file needs no edit here.
 *
 * SHADOW BY ID (plan §3.3): a lane row whose id equals a carried row's id
 * REPLACES the carried row while the lane file exists (it takes the carried
 * row's place in the run order). At lane exit the orchestrator folds the
 * lane's version back into carried.mjs, so no Round-4 regression gate goes
 * dark in between. Two lane files defining the same id is a conflict: the
 * first (alphabetical) wins and the conflict is printed and exported.
 *
 * A LANE FILE THAT DOES NOT LOAD IS A FAIL, NOT AN ABSENCE (the Round-4
 * runner's rule, kept): it becomes one runner row `LOAD-FAIL:<file>` in that
 * lane, so `--lane <lane>` and the full suite both print a red line for it.
 * Every `tools/gates.r5.*.mjs` must export a `GATES` array (a helper module
 * that has no gates of its own exports `GATES = []`).
 *
 * Until this file is merged into a lane's tree, that lane loads its own file
 * with `node tools/gates.mjs --port <p> --extra tools/gates.r5.<lane>.mjs`;
 * after the merge `--extra` is redundant (each of its ids then prints one
 * "duplicate gate id … keeping the first" line and nothing runs twice).
 */
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { GATES as CARRIED } from './gates.r5.carried.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));

/**
 * Copy a gate row WITH its accessors. A row may define `get assert()` (A9 reads the load
 * average when it runs): a `{ ...g }` spread would run that getter once, at import, and
 * freeze its value for the whole run.
 */
const withProps = (g, extra) => Object.defineProperties({}, {
  ...Object.getOwnPropertyDescriptors(g), ...Object.getOwnPropertyDescriptors(extra),
});

/** `tools/gates.r5.<lane>.mjs` — the lane is the middle of the name. */
export const LANE_FILE_RE = /^gates\.r5\.([a-z0-9][a-z0-9-]*)\.mjs$/;
const NOT_A_LANE = new Set(['gates.r5.carried.mjs']);

export const LANE_FILES = readdirSync(TOOLS)
  .filter((f) => LANE_FILE_RE.test(f) && !NOT_A_LANE.has(f))
  .sort();

export const LOAD_FAILURES = [];
const laneRows = [];
for (const file of LANE_FILES) {
  let mod;
  try {
    mod = await import(pathToFileURL(path.join(TOOLS, file)).href);
  } catch (err) {
    console.error(`[gates.config] ${file} FAILED TO LOAD — none of its gates will run: ${err.message}`);
    LOAD_FAILURES.push({ file, error: String(err.message) });
    continue;
  }
  if (!Array.isArray(mod.GATES)) {
    console.error(`[gates.config] ${file} does not export a GATES array — counted as a load failure`);
    LOAD_FAILURES.push({ file, error: 'does not export a GATES array' });
    continue;
  }
  for (const g of mod.GATES) laneRows.push(withProps(g, { source: file }));
}

/** Lane rows by id; a second lane file claiming the same id is a conflict. */
export const CONFLICTS = [];
const byId = new Map();
for (const g of laneRows) {
  if (byId.has(g.id)) {
    CONFLICTS.push({ id: g.id, kept: byId.get(g.id).source, dropped: g.source });
    console.error(`[gates.config] gate id "${g.id}" is defined by ${byId.get(g.id).source} AND ${g.source} — keeping the first`);
    continue;
  }
  byId.set(g.id, g);
}

/**
 * Which carried rows a lane is shadowing right now (id -> lane file). A shadowing row still runs
 * in the CARRIED suite: under `--lane carried` it takes lane 'carried' (its own lane is kept in
 * `shadowLane`), so `node tools/gates.mjs --lane carried` never drops a row a lane has absorbed
 * (plan §3.3: no Round-4 regression gate goes dark), and `--lane <its lane>` still selects it.
 */
const ARG_LANE = (() => { const i = process.argv.indexOf('--lane'); return i >= 0 ? process.argv[i + 1] : null; })();
export const SHADOWED = [];
export const GATES = [];
for (const c of CARRIED) {
  const lane = byId.get(c.id);
  if (lane) {
    SHADOWED.push({ id: c.id, by: lane.source, lane: lane.lane, r4Source: c.r4Source });
    GATES.push(withProps(lane, { shadows: 'gates.r5.carried.mjs',
      ...(ARG_LANE === 'carried' ? { lane: 'carried', shadowLane: lane.lane } : {}) }));
    byId.delete(c.id);
  } else {
    GATES.push(withProps(c, { source: 'gates.r5.carried.mjs' }));
  }
}
for (const g of byId.values()) GATES.push(g);
for (const f of LOAD_FAILURES) {
  const lane = LANE_FILE_RE.exec(f.file)?.[1] || 'unknown';
  GATES.push({
    id: `LOAD-FAIL:${f.file}`, kind: 'runner', lane, source: f.file,
    title: `${f.file} did not load, so none of its gates ran`,
    check: () => ({ pass: false, detail: f }),
  });
}
