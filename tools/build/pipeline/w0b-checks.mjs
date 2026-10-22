/**
 * Pipeline lane — the W0b gate bodies that run in node (plan §9 pipeline):
 *
 *   buildDeterministic()  A-build-deterministic  two builds, network denied, byte-identical, <= 180 s, <= 2 GB
 *   buildOnlyLane()       A-build-only-lane      `--only <lane>` writes only that lane's output paths, <= 60 s
 *   glbBudget()           A-glb-budget           every generated GLB inside its plan §4.1 class budget
 *   pocPromotedStatic()   A-poc-promoted         (static half) no ?poc=human|creature path, POC folders reduced
 *                                                to what ?poc=biome loads; the dynamic half is biome-check.mjs
 *
 * Each returns { pass: true | null | false, detail } and carries a negative
 * control that plants the defect the gate exists to catch.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  existsSync, readFileSync, readdirSync, statSync, rmSync, mkdirSync, realpathSync, lstatSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const posix = (p) => p.split(path.sep).join('/');
export const scratchDir = () => {
  const d = process.env.R5_SCRATCH || path.join(os.tmpdir(), 'calima-r5-scratch', 'pipeline');
  mkdirSync(d, { recursive: true });
  return realpathSync(d);
};
const load1 = () => +os.loadavg()[0].toFixed(2);

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(abs, base, out); else out.push(posix(path.relative(base, abs)));
  }
  return out;
}

/** Run a node script in a child; resolves { code, ms, stdout, stderr, json (last stdout line), timedOut }. */
function runChild(args, { cwd = ROOT, timeoutMs = 600000, wrap = null } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const cmd = wrap ? wrap[0] : process.execPath;
    const argv = wrap ? [...wrap.slice(1), process.execPath, ...args] : args;
    // sources come from the tree's models-staging/r5-src only: an inherited R5_SRC override is dropped
    const env = { ...process.env, R5_BUILD_VERBOSE: '' };
    delete env.R5_SRC;
    const child = spawn(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
    const kill = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(kill);
      let json = null;
      try { json = JSON.parse(stdout.trim().split('\n').pop()); } catch { /* none */ }
      resolve({ code, ms: Date.now() - t0, stdout: stdout.slice(-2000), stderr: stderr.slice(-2000), json, timedOut });
    });
  });
}

/* ------------------------------------------------------------------ */
/* A-build-deterministic                                                */
/* ------------------------------------------------------------------ */
export const BUILD_WALL_MS = 180000;
export const BUILD_RSS_MB = 2048;

/**
 * macOS sandbox profile: no network at all; the Round-5 proof's scratch extracts are unreadable (sources = r5-src
 * only). The extracts are found by their signature (ubc/Base Characters, mco/Modular Parts, ual2/UAL2_Standard.glb)
 * in any ancestor of the tree up to 5 levels (scratchpad/r5/<d> next to a lane folder, or above a merge-trial copy).
 */
const PROOF_EXTRACTS = { ubc: 'Base Characters', mco: 'Modular Parts', ual2: 'UAL2_Standard.glb' };
function sandboxProfile(root = ROOT) {
  const deny = new Set();
  let a = path.dirname(root);
  for (let up = 0; up < 5 && a !== path.dirname(a); up++, a = path.dirname(a)) {
    for (const [d, sig] of Object.entries(PROOF_EXTRACTS)) {
      const p = path.join(a, d);
      if (existsSync(path.join(p, sig))) deny.add(realpathSync(p));
    }
  }
  return { profile: `(version 1)(allow default)(deny network*)${[...deny].map((p) => `(deny file-read* (subpath "${p}"))`).join('')}`, deniedReads: deny.size, denied: [...deny] };
}

export async function buildDeterministic({ root = ROOT } = {}) {
  const scratch = scratchDir();
  const outs = [1, 2].map((i) => path.join(scratch, `build-det-${process.pid}-${i}`));
  const sandbox = process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec') ? sandboxProfile(root) : null;
  const runs = [];
  try {
    for (const out of outs) {
      rmSync(out, { recursive: true, force: true });
      const l0 = load1();
      const r = await runChild([path.join(root, 'tools/build/build-assets.mjs'), '--out', out],
        { cwd: root, timeoutMs: 900000, wrap: sandbox ? ['/usr/bin/sandbox-exec', '-p', sandbox.profile] : null });
      runs.push({ out, code: r.code, timedOut: r.timedOut, childMs: r.ms, load1Before: l0, load1After: load1(), result: r.json, stderrTail: r.code ? r.stderr : undefined });
    }
    const files = (run) => {
      const m = {};
      for (const rec of run.result?.results || []) for (const f of rec.files) m[f.path] = f.sha256;
      return m;
    };
    const [a, b] = runs.map(files);
    const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    const differ = paths.filter((p) => !a[p] || a[p] !== b[p]);
    // the bytes on disk were checked too, not only the driver's report
    const onDisk = paths.filter((p) => /\.(glb|webp|json|png)$/.test(p)).map((p) => {
      const x = path.join(outs[0], p), y = path.join(outs[1], p);
      return { p, same: existsSync(x) && existsSync(y) && sha(x) === sha(y) };
    });
    const typed = paths.filter((p) => /\.(glb|webp)$/.test(p));
    // tracked outputs: the committed file must equal the build (no stale committed asset)
    const committed = paths.filter((p) => !p.startsWith('proof/') && existsSync(path.join(root, p))).map((p) => ({ p, equal: sha(path.join(root, p)) === a[p] }));
    const wall = runs.map((r) => r.result?.wallMs ?? null);
    const rss = runs.map((r) => r.result?.peakRssMb ?? null);
    const loaded = runs.some((r) => Math.max(r.load1Before, r.load1After) >= 3);
    const wallOk = wall.every((w) => w !== null && w <= BUILD_WALL_MS);
    const ok = runs.every((r) => r.code === 0 && r.result) && !differ.length && onDisk.every((x) => x.same) && typed.length > 0
      && committed.every((c) => c.equal) && rss.every((m) => m !== null && m <= BUILD_RSS_MB) && !!sandbox;
    // R26-style attribution: the wall-time bar grades on a quiet box (load1 < 3); over the bar on a loaded box = PENDING
    const pass = !ok ? false : wallOk ? true : loaded ? null : false;
    return { pass, detail: {
      outputs: paths.length, glbWebp: typed.length, differ, onDiskCompared: onDisk.length, onDiskDiffer: onDisk.filter((x) => !x.same).map((x) => x.p),
      wallMs: wall, capMs: BUILD_WALL_MS, peakRssMb: rss, capRssMb: BUILD_RSS_MB,
      load1: runs.map((r) => [r.load1Before, r.load1After]), wallAttributable: !loaded,
      ...(pass === null ? { pending: `wall time over ${BUILD_WALL_MS / 1000} s on a loaded box (load1 >= 3): not attributable (R26 rule); determinism, RSS and network terms graded` } : {}),
      network: sandbox ? 'denied (sandbox-exec deny network*)' : 'NOT ENFORCED (no sandbox-exec)', deniedProofExtracts: sandbox?.deniedReads ?? 0,
      committedOutputs: committed, recipes: runs[0].result?.results?.map((r) => ({ recipe: r.recipe, lane: r.lane, files: r.files.length })),
      runs: runs.map(({ result, ...r }) => r),
    } };
  } finally {
    for (const o of outs) rmSync(o, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* A-build-only-lane                                                    */
/* ------------------------------------------------------------------ */
/** Output paths each lane may write (plan §2 "owns"), as globs over repo paths. */
export const LANE_OUTPUTS = {
  pipeline: ['public/models/pipeline/**', 'public/models/r5-poc/**', 'public/models/instruments/tiller.glb', 'tools/build/pipeline/**', 'proof/**'],
  'hero-body': ['public/models/hero/**', 'public/models/armory/kit-v0*', 'proof/**'],
  armory: ['public/models/armory/{bow-*,lance-*,armor-*,stowkit*}', 'public/models/hero/outfit-*'],
  'combat-kit': ['public/models/armory/{gaff-*,windwall-*,pot-*,net-*}'],
  'instruments-a': ['public/models/instruments/{tiller,plumb,peg}.glb'],
  'instruments-b': ['public/models/instruments/{sickle,screed,gauge}.glb'],
  'instruments-c': ['public/models/instruments/{spindle,kiln,davit,sonde}.glb'],
  'instruments-d': ['public/models/instruments/{dredge,transit}.glb'],
  'world-props': ['public/models/landmarks/**'],
  'world-ground': ['public/textures/ground/**'],
  settlements: ['public/models/settlements/**', 'public/models/npc/**'],
  'engine-gpu': [], brand: [], 'instruments-core': [], 'gates-perf': [], melee: [], 'world-sky': [], 'shell-ui': [], progression: [], audio: [],
};
function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') { if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; } else re += '[^/]*'; } else if (c === '{') { const e = glob.indexOf('}', i); re += `(?:${glob.slice(i + 1, e).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`; i = e; } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
export const laneOwns = (lane, p) => (LANE_OUTPUTS[lane] || []).some((g) => globRe(g).test(p));

const AUDIT_DIRS = ['public', 'tools/build'];
function snapshot(root) {
  const m = new Map();
  for (const d of AUDIT_DIRS) for (const rel of walk(path.join(root, d))) {
    const f = path.join(root, d, rel);
    const st = statSync(f);
    m.set(`${d}/${rel}`, { mtimeMs: st.mtimeMs, size: st.size });
  }
  return m;
}
/** Which audited files were written (mtime/size changed, created, deleted) between two snapshots. */
export function writtenBetween(before, after) {
  const out = [];
  for (const [p, a] of after) { const b = before.get(p); if (!b || b.mtimeMs !== a.mtimeMs || b.size !== a.size) out.push({ path: p, change: b ? 'written' : 'created' }); }
  for (const p of before.keys()) if (!after.has(p)) out.push({ path: p, change: 'deleted' });
  return out;
}
/** The audit: every written path must belong to `lane` and be one of its recipes' OUTPUTS. */
export function auditLane(lane, written, declared) {
  return written.filter((w) => !laneOwns(lane, w.path) || !declared.includes(w.path));
}

export async function buildOnlyLane({ root = ROOT } = {}) {
  const { loadRecipes } = await import('../build-assets.mjs');
  const recipes = await loadRecipes();
  // static: every recipe's declared OUTPUTS inside its lane's paths
  const strays = [];
  for (const r of recipes) for (const o of r.outputs) if (!laneOwns(r.lane, o)) strays.push({ recipe: r.file, lane: r.lane, output: o });
  const unknownLanes = [...new Set(recipes.map((r) => r.lane))].filter((l) => !(l in LANE_OUTPUTS));
  // dynamic: `--only <lane>` into the real tree, mtime audit of public/ + tools/build/ (committed outputs are
  // rewritten byte-identically; PROOF recipes never write into the tree)
  const lanes = Object.keys(LANE_OUTPUTS);
  const runs = [];
  for (const lane of lanes) {
    const declared = recipes.filter((r) => r.lane === lane && !r.proof).flatMap((r) => r.outputs);
    const shaBefore = Object.fromEntries(declared.filter((p) => existsSync(path.join(root, p))).map((p) => [p, sha(path.join(root, p))]));
    const before = snapshot(root);
    const l0 = load1();
    const r = await runChild([path.join(root, 'tools/build/build-assets.mjs'), '--only', lane], { cwd: root, timeoutMs: 300000 });
    const written = writtenBetween(before, snapshot(root));
    const outside = auditLane(lane, written, declared);
    const changedBytes = declared.filter((p) => shaBefore[p] && existsSync(path.join(root, p)) && sha(path.join(root, p)) !== shaBefore[p]);
    runs.push({ lane, recipes: recipes.filter((x) => x.lane === lane).length, code: r.code, ms: r.ms, wallMs: r.json?.wallMs ?? null, load1: [l0, load1()],
      written: written.length, outside, committedBytesChanged: changedBytes, skipped: r.json?.skipped?.length ?? 0 });
  }
  // NEGATIVE CONTROL: a pipeline run that wrote into a hero-body path and into an undeclared path of its own
  const plantedWritten = [{ path: 'public/models/hero/brea-body.glb', change: 'written' }, { path: 'public/models/pipeline/undeclared.glb', change: 'created' }];
  const control = auditLane('pipeline', plantedWritten, ['public/models/pipeline/probe.glb']);
  const controlCaught = control.length === 2;
  const slow = runs.filter((r) => r.ms > 60000);
  const loaded = runs.some((r) => Math.max(...r.load1) >= 3);
  const bad = runs.filter((r) => r.code !== 0 || r.outside.length || r.committedBytesChanged.length);
  const pass = bad.length || strays.length || unknownLanes.length || !controlCaught ? false : slow.length ? (loaded ? null : false) : true;
  return { pass, detail: {
    lanes: runs.length, withRecipes: runs.filter((r) => r.recipes).map((r) => r.lane), staticStrays: strays, unknownLanes,
    slowest: runs.reduce((m, r) => (r.ms > (m?.ms ?? -1) ? { lane: r.lane, ms: r.ms } : m), null), capMs: 60000,
    ...(pass === null ? { pending: 'a lane run exceeded 60 s on a loaded box (load1 >= 3): not attributable' } : {}),
    negativeControl: { planted: plantedWritten.map((w) => w.path), caught: control.map((c) => c.path), ok: controlCaught },
    runs,
  } };
}

/* ------------------------------------------------------------------ */
/* A-glb-budget                                                         */
/* ------------------------------------------------------------------ */
const KB = 1024;
/** Plan §4.1 classes. tris = LOD0 triangles, draws = primitives, bytes = file size. */
export const CLASSES = {
  'brea-body': { tris: 10000, draws: 2, bones: 65 + 32, bytes: 0.7 * 1024 * KB },
  'brea-outfit': { tris: 17500, draws: 1, bytes: 0.8 * 1024 * KB },
  'armor-piece': { tris: 3000, bytes: 150 * KB },
  stowkit: { tris: 9000, draws: 1, bytes: 0.6 * 1024 * KB },
  'held-bow': { tris: 3000, draws: 2, bytes: 150 * KB },
  'held-lance': { tris: 1500, draws: 2, bytes: 150 * KB },
  'held-gaff': { tris: 1100, draws: 2, bytes: 150 * KB },
  'held-windwall': { tris: 2500, draws: 2, bones: 9, bytes: 150 * KB },
  'held-pot': { tris: 300, draws: 2, bytes: 150 * KB },
  'held-net': { tris: 1200, draws: 2, bytes: 150 * KB },
  'held-weapon': { tris: 3000, draws: 2, bytes: 150 * KB },
  npc: { tris: 12000, draws: 2, bones: 65, bytes: 0.4 * 1024 * KB },
  settlement: { tris: 150000, draws: 12, bytes: 1.2 * 1024 * KB },
  'instrument-small': { tris: 15000, draws: 3, bones: 20, bytes: 200 * KB },
  'instrument-medium': { tris: 35000, draws: 3, bones: 30, bytes: 400 * KB },
  'instrument-large': { tris: 60000, draws: 3, bones: 40, bytes: 700 * KB },
  'instrument-dredge': { tris: 60000, draws: 3, bones: 52, bytes: 700 * KB },
  transit: { tris: 120000, draws: 4, bones: 64, bytes: 1.2 * 1024 * KB },
  landmark: { tris: 40000, draws: 3, bytes: 300 * KB },
  fauna: { tris: 1500, draws: 1, bones: 12, bytes: 60 * KB },
  // not a §4.1 class: an animation-only pack (Brea's native UAL2 clips) carries NO mesh
  'clip-pack': { tris: 0, draws: 0, materials: 0 },
  // not a §4.1 class: the loader fixture (pipeline), held to a fixture-sized bar
  fixture: { tris: 1000, draws: 3, materials: 2, bytes: 16 * KB },
};
/** Class of a shipped generated GLB, from its path (and its design size for Instruments). */
export function classOf(p, size) {
  const n = p.split('/').pop();
  if (/^public\/models\/pipeline\//.test(p)) return 'fixture';
  if (/-clips[-.]/.test(n)) return 'clip-pack';
  if (/^public\/models\/hero\//.test(p)) return /outfit/.test(n) ? 'brea-outfit' : /stow/.test(n) ? 'stowkit' : /^kit-v0|bow|lance|bracer|quiver/.test(n) ? 'held-weapon' : 'brea-body';
  if (/^public\/models\/armory\//.test(p)) {
    if (/^armor-/.test(n)) return 'armor-piece';
    if (/^stowkit/.test(n)) return 'stowkit';
    for (const k of ['bow', 'lance', 'gaff', 'windwall', 'pot', 'net']) if (n.startsWith(`${k}-`)) return `held-${k}`;
    return 'held-weapon';
  }
  if (/^public\/models\/npc\//.test(p)) return 'npc';
  if (/^public\/models\/settlements\//.test(p)) return 'settlement';
  if (/^public\/models\/landmarks\//.test(p) || /sounding-ring/.test(n)) return 'landmark';
  if (/^public\/models\/fauna\//.test(p)) return 'fauna';
  if (/^public\/models\/(instruments|r5-poc)\//.test(p)) {
    if (/transit/.test(n)) return 'transit';
    if (/dredge/.test(n)) return 'instrument-dredge';
    const m = Array.isArray(size) ? Math.max(...size) : null;
    if (m === null) return null;
    return m <= 2.5 ? 'instrument-small' : m <= 6 ? 'instrument-medium' : m <= 12 ? 'instrument-large' : 'transit';
  }
  return null;
}
export function overBudget(cls, s) {
  const b = CLASSES[cls];
  if (!b) return ['no class budget'];
  const out = [];
  for (const k of ['tris', 'draws', 'bones', 'materials', 'bytes']) if (b[k] !== undefined && s[k] > b[k]) out.push(`${k} ${s[k]} > ${Math.round(b[k])}`);
  return out;
}

export async function glbBudget({ root = ROOT } = {}) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const files = walk(path.join(root, 'public/models')).filter((f) => /\.glb$/.test(f)).map((f) => `public/models/${f}`);
  const assets = [], skippedLegacy = [];
  for (const p of files) {
    const doc = await io.read(path.join(root, p));
    const r = doc.getRoot();
    const ex = r.getAsset().extras || {};
    if (!String(ex.provenance?.generator || '').startsWith('CALIMA tools/build')) { skippedLegacy.push(p); continue; }
    let tris = 0, draws = 0;
    const labels = new Set();
    // §4.1 Brea body row: "body faces hidden under the outfit culled at merge". A body that ships a
    // `_HIDEMASK` (uint8 per vertex) + `extras.r5Hero.hideBits` loses, per outfit bit, every triangle
    // whose three vertices carry that bit (hero-body's published rule, recipes/brea.mjs header). The
    // budget is graded on the WORST outfit's post-cull count, computed here from the file itself.
    const hideBits = ex.r5Hero?.hideBits && typeof ex.r5Hero.hideBits === 'object' ? ex.r5Hero.hideBits : null;
    const culledBy = hideBits ? Object.fromEntries(Object.keys(hideBits).map((k) => [k, 0])) : null;
    for (const m of r.listMeshes()) for (const prim of m.listPrimitives()) {
      draws++;
      const idx = prim.getIndices();
      tris += (idx?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
      const L = prim.getAttribute('_BONE');
      if (L) { const e = [0]; for (let i = 0; i < L.getCount(); i++) { L.getElement(i, e); labels.add(Math.round(e[0])); } }
      const H = hideBits ? prim.getAttribute('_HIDEMASK') : null;
      if (H && idx) {
        const mask = new Uint8Array(H.getCount()); const e = [0];
        for (let i = 0; i < mask.length; i++) { H.getElement(i, e); mask[i] = Math.round(e[0]); }
        const I = idx.getArray();
        for (const [k, bit] of Object.entries(hideBits)) {
          let n = 0;
          for (let t = 0; t < I.length; t += 3) if (mask[I[t]] & bit && mask[I[t + 1]] & bit && mask[I[t + 2]] & bit) n++;
          culledBy[k] += n;
        }
      }
    }
    const skinBones = r.listSkins().reduce((n, s) => Math.max(n, s.listJoints().length), 0);
    const s = { tris, draws, materials: r.listMaterials().length, bones: Math.max(skinBones, labels.size), bytes: statSync(path.join(root, p)).size };
    const cls = classOf(p, ex.r5Size);
    const afterCull = culledBy && Object.keys(culledBy).length ? Object.fromEntries(Object.entries(culledBy).map(([k, n]) => [k, tris - n])) : null;
    const graded = cls === 'brea-body' && afterCull ? { ...s, tris: Math.max(...Object.values(afterCull)) } : s;
    const over = cls ? overBudget(cls, graded) : ['unclassified: no plan §4.1 class for this path'];
    const statsAgree = !ex.r5Stats || (ex.r5Stats.tris === tris && ex.r5Stats.materials === s.materials);
    assets.push({ path: p, class: cls, ...s, ...(afterCull ? { trisAfterOutfitCull: afterCull, gradedTris: graded.tris } : {}), recipe: ex.provenance.recipe, statsAgree, over });
  }
  // NEGATIVE CONTROL: a Brea body at 12 k tris / 0.9 MB and an unclassified path must be caught
  const control = [overBudget('brea-body', { tris: 12000, draws: 2, materials: 3, bones: 70, bytes: 900 * KB }).length > 0, classOf('public/models/misc/x.glb') === null];
  const bad = assets.filter((a) => a.over.length || !a.statsAgree);
  return { pass: !bad.length && control.every(Boolean) && assets.length > 0, detail: {
    generated: assets.length, over: bad.map((a) => ({ path: a.path, class: a.class, over: a.over, statsAgree: a.statsAgree })),
    assets, legacyNotGraded: skippedLegacy.length, negativeControl: { breaBodyOverCaught: control[0], unclassifiedCaught: control[1] },
  } };
}

/* ------------------------------------------------------------------ */
/* A-poc-promoted (static half)                                         */
/* ------------------------------------------------------------------ */
/**
 * Plan §9, LITERAL (W0b fix round 1; the W0b first pass graded a "biome
 * closure" instead, which the judge rejected):
 *   (a) no ?poc=human|creature code path in src/main.js;
 *   (b) `tools/r5-poc/` and `public/models/r5-poc/` ABSENT;
 *   (c) `?poc=biome` still serves A-gpu-tier (dynamic half, biome-check.mjs).
 * PASS only when all three hold. While ?poc=biome exists, (b) and (c) cannot
 * both hold: main.js (removal-only) imports `/tools/r5-poc/poc-${POC}.js` and
 * the biome loads `/models/r5-poc/{sounding-ring,tiller}.glb`. So the gate
 * NEVER passes with anything left in either folder; it reports:
 *   FAIL     (a) or (c) broken; a file in either folder that is not one of the
 *            three biome-closure files; any REFERENCE to either folder (a
 *            string literal in comment-stripped src/** or tools/**) that is
 *            not the biome hook, A-gpu-tier's import, a closure supplier
 *            (the two recipes that write those GLBs) or this lane's own
 *            checkers — a runtime reader such as a URL default would break
 *            the day the folders go (the first pass only matched `import`s);
 *   PENDING  only the three closure files remain and nothing else references
 *            the folders: the literal bar is blocked by the plan itself until
 *            an orchestrator ruling (accept the closure until world-ground's
 *            W1 exit, or strike clause (c)) — named in `ruling`.
 */
export const POC_DIRS = ['tools/r5-poc', 'public/models/r5-poc'];
export const BIOME_CLOSURE_FILES = ['tools/r5-poc/poc-biome.js', 'public/models/r5-poc/sounding-ring.glb', 'public/models/r5-poc/tiller.glb'];
/** References that ARE the biome closure: file -> the literal it may hold. */
export const BIOME_REFS = [
  { file: 'src/main.js', re: /\/tools\/r5-poc\/poc-\$\{POC\}\.js/, why: 'the ?poc=biome hook (removal-only grant; world-ground removes it at the W1 exit)' },
  { file: 'tools/gates.r5.engine-gpu.mjs', re: /\/tools\/r5-poc\/poc-biome\.js/, why: "engine-gpu's A-gpu-tier vista (plan §9: ?poc=biome serves A-gpu-tier until W1)" },
  { file: 'tools/build/instruments/gen-tiller.mjs', re: /public\/models\/r5-poc\/tiller\.glb/, why: 'closure supplier (second output, same bytes as public/models/instruments/tiller.glb)' },
  { file: 'tools/build/landmarks/gen-sounding-ring.mjs', re: /public\/models\/r5-poc\/sounding-ring\.glb/, why: 'closure supplier (the biome landmark)' },
];
/** This lane's own checkers name the paths in order to check them. */
const CHECKERS = /^tools\/(gates\.r5\.pipeline\.mjs|build\/pipeline\/(w0b-checks|biome-check|specs-fixture)\.mjs|licences\/[^/]+\.mjs)$/;
const POC_REF = /(?:^|[^a-z0-9_-])(tools\/r5-poc|models\/r5-poc)(?=\/|['"`]|$)/i;
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');

/** Every string-literal reference to the two POC folders in src/** and tools/** (code only; file:line). */
export function pocReferences({ root = ROOT } = {}) {
  const refs = [];
  for (const d of ['src', 'tools']) for (const rel of walk(path.join(root, d))) {
    if (!/\.(m?js|cjs)$/.test(rel)) continue;
    const f = `${d}/${rel}`;
    if (f.startsWith('tools/r5-poc/')) continue;                         // inside the folder: a leftover, listed below
    const lines = stripComments(readFileSync(path.join(root, f), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const m = POC_REF.exec(line);
      if (!m || !/['"`]/.test(line.slice(0, m.index + 1))) return;      // a path inside a string literal
      const text = line.trim().slice(0, 160);
      const closure = BIOME_REFS.find((b) => b.file === f && b.re.test(line));
      const kind = closure ? 'biome-closure' : CHECKERS.test(f) ? 'checker' : f.startsWith('src/') ? 'runtime-reader' : 'tool-reference';
      refs.push({ file: f, line: i + 1, kind, text, ...(closure ? { why: closure.why } : {}) });
    });
  }
  return refs;
}

export function pocPromotedStatic({ root = ROOT } = {}) {
  const problems = [];
  const main = readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const code = stripComments(main);
  const HUMAN_RE = /poc['"]?\)\s*===\s*['"]human['"]|pocHuman|installPocHuman/;
  const CREATURE_RE = /['"]creature['"]|poc-creature/;
  const humanPath = HUMAN_RE.test(code), creaturePath = CREATURE_RE.test(code);
  if (humanPath) problems.push('src/main.js still has a ?poc=human code path');
  if (creaturePath) problems.push('src/main.js still has a ?poc=creature code path');
  const biomeHook = /['"]biome['"]/.test(code) && /\/tools\/r5-poc\/poc-\$\{POC\}\.js/.test(code);
  if (!biomeHook) problems.push('the ?poc=biome hook is missing from src/main.js (clause (c): it serves A-gpu-tier until the W1 exit)');
  // (b) literally: every file on disk under either folder (tracked or not)
  const left = [];
  for (const dir of POC_DIRS) for (const rel of walk(path.join(root, dir))) if (!rel.endsWith('.DS_Store')) left.push(`${dir}/${rel}`);
  const closureLeft = left.filter((f) => BIOME_CLOSURE_FILES.includes(f));
  const otherLeft = left.filter((f) => !BIOME_CLOSURE_FILES.includes(f));
  for (const f of otherLeft) problems.push(`${f} is still on disk (clause (b): the folder must be absent; not even the ?poc=biome closure excuses it)`);
  // every reference to the folders, classified
  const refs = pocReferences({ root });
  const outside = refs.filter((r) => r.kind === 'runtime-reader' || r.kind === 'tool-reference');
  for (const r of outside) problems.push(`${r.file}:${r.line} references the POC folders (${r.kind}): ${r.text}`);
  // NEGATIVE CONTROLS: the pre-removal main.js text, and a URL-default reader (the judge's sheets.js case)
  const planted = "if (params.get('poc') === 'human') { const { installPocHuman } = await import('/tools/r5-poc/pocHuman.js'); }\nconst POC = ['creature', 'biome'].includes(x);";
  const plantedReader = "export async function renderStockFace(ctx, url = '/tools/r5-poc/assets/heroine-base.glb') {";
  const readerHit = POC_REF.exec(plantedReader);
  const control = { mainCaught: HUMAN_RE.test(planted) && CREATURE_RE.test(planted),
    urlDefaultCaught: !!readerHit && /['"`]/.test(plantedReader.slice(0, readerHit.index + 1)) };
  const controlOk = control.mainCaught && control.urlDefaultCaught;
  const ruling = closureLeft.length ? {
    blockedBy: 'plan §9 A-poc-promoted clauses (b) and (c) contradict while ?poc=biome exists (main.js imports /tools/r5-poc/poc-${POC}.js; the biome loads /models/r5-poc/{sounding-ring,tiller}.glb)',
    options: [
      '(1) accept the three closure files until world-ground removes ?poc=biome at the W1 exit; their deletion (and the sounding-ring LICENSES row + .gitignore exception) moves to world-ground\'s W1-exit row; A-poc-promoted then grades "nothing but the closure, no reference outside it" at the W0 exit',
      '(2) the literal bar: delete both folders at the W0 exit and strike clause (c); ?poc=biome and A-gpu-tier\'s vista go dark until the W1 Pans',
    ],
  } : null;
  const pass = problems.length || !controlOk ? false : closureLeft.length ? null : true;
  return { pass, detail: {
    humanPath, creaturePath, biomeHook, leftOnDisk: left, closureLeft, otherLeft,
    references: { total: refs.length, outside, biomeClosure: refs.filter((r) => r.kind === 'biome-closure'), checkers: refs.filter((r) => r.kind === 'checker').length },
    problems, ruling, negativeControl: control,
  } };
}
